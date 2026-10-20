/* Grand Theft Pundit: 06c_animation.js (v0.3 models track)
 * GTP.Anim: procedural animation for the skinned peds of 05d_models.js. Replaces GTP.Ped.prototype.syncMesh (the v0.2
 * pose code stays as GTP.Anim.legacySync and still drives a mesh that is not a GTP.Models rig).
 *
 * Kept from v0.2: the interpolated transform, first-person and removed hiding, the C.QUALITY.pedDraw distance cull,
 * the knockdown / death / swim tilt (ped.tilt, set by Ped.update) with the 0.16 m lift, the bob, the scooter rider.
 * The damage flash and the corpse fade (Combat) work on any mesh and keep working.
 *
 * Layers, every frame: idle (breathing, weight shift, glances) / walk / run / sprint from ped.speed and ped.animPhase,
 * crouch (low cover), jump and fall, swim (crawl and flutter kick), knockdown with a ragdoll flail while airborne,
 * lying and getting up, then the upper body: weapon hold (one- or two-handed grips by two-bone IK on both arms; the
 * held gun is re-parented to the hand bone), aim (spine, chest and head share ped.pose.aimPitch, the chest twists
 * toward aimYaw), fire recoil, reload (the support hand to the magazine, the pouch and back), melee (light jab, heavy
 * hook, counter uppercut, a two-handed swing with a melee weapon), throw wind-up, cover (crouch, peek, blind fire),
 * drive (seated, hands on the steering wheel following the steering) and ride poses, and a head that looks at the
 * player nearby. LODs swap by camera distance (GTP.Models.setLod); IK runs only within the near / mid LODs.
 *
 * Pose contract (PLAN_V03.md), read from ped.pose; missing fields fall back to the v0.2 fields:
 *   aim (ped.aiming || firePoseT > 0), aimPitch (rad, + is up; the player's falls back to the camera pitch),
 *   aimYaw (world yaw), fire (s since the shot; a rise of firePoseT), reload (0..1; reloadT / reloadTotal),
 *   melee ({type, t}; punchT), cover, hold ('none' | 'one' | 'two'; from the weapon), weaponId, drive, ride, swim
 *   (swimming), fall (!onGround), ragdoll ({vx, vy, vz, spin}; knockedDown while airborne).
 *
 * Also wraps GTP.Vehicle.prototype.syncMesh: body / wheel LOD swaps by camera distance, vehicle.mods (wheels,
 * spoiler, tint, secondary paint, finish) applied to the live mesh when the record does not carry them yet.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util;
  var Ped = GTP.Ped, Vehicle = GTP.Vehicle;
  if (!Ped || typeof THREE === 'undefined') return;
  var PI = Math.PI, HALF = PI / 2;
  var legacySync = Ped.prototype.syncMesh;

  // ------------------------------------------------------------- scratch --
  var _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
  var _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _qHand = new THREE.Quaternion(), _qGun = new THREE.Quaternion(), _qChest = new THREE.Quaternion();
  var _e = new THREE.Euler(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
  var DOWN = new THREE.Vector3(0, -1, 0);
  var Q_BARREL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), HALF);        // gun +x -> hand -z
  var Q_UPRIGHT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -HALF);     // upright items: +y -> hand -z
  var Q_BARREL_INV = Q_BARREL.clone().invert(), Q_UPRIGHT_INV = Q_UPRIGHT.clone().invert();
  var GRIP = new THREE.Vector3(0, -0.075, -0.012);   // the grip point in the hand bone's frame
  var L1 = 0.29, L2 = 0.26;                          // upper arm, forearm (model metres)

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function bell(t) { return Math.sin(clamp(t, 0, 1) * PI); }
  function cam() { return GTP.Render && GTP.Render.camera; }
  function camDist2(x, z) { var c = cam(); if (!c) return 0; var dx = x - c.position.x, dz = z - c.position.z; return dx * dx + dz * dz; }
  function player() { return GTP.game ? GTP.game.player : null; }
  function nowS() { return U.now() / 1000; }

  // weapon facts: hold class, length, upright / melee / thrown
  var MELEE = { tableleg: 1, fist: 1 }, THROWN = { hottake: 1, hotmic: 1 };
  function weaponInfo(id) {
    var A = GTP.Assets, fit = A && A.weaponFit && A.weaponFit[id], CB = GTP.Combat, w = CB && CB.WEAPONS && CB.WEAPONS[id];
    var par = GTP.Content && GTP.Content.parity && GTP.Content.parity.weapons, pw = null;
    if (par) { if (Array.isArray(par)) { for (var i = 0; i < par.length; i++) if (par[i] && par[i].id === id) { pw = par[i]; break; } } else pw = par[id] || null; }
    var hold = (pw && pw.hold) || (w && w.hold) || null;
    var len = (fit && fit.len) || (w && w.len) || 0.4;
    if (!hold) hold = (!id || id === 'fist') ? 'none' : (id === 'pistol' || id === 'revolver' || id === 'megaphone' || THROWN[id] || id === 'tableleg' || len < 0.4) ? 'one' : 'two';
    var cls = (pw && pw.class) || (w && w.class) || '';
    return { hold: hold, len: len, upright: fit ? !!fit.upright : (id === 'megaphone' || !!THROWN[id]), melee: !!MELEE[id] || /melee/.test(cls), thrown: !!THROWN[id] || (pw && pw.projectile === 'lobbed' && hold === 'one') };
  }
  var WI = {};
  function winfo(id) { return WI[id] || (WI[id] = weaponInfo(id)); }

  // ------------------------------------------------------------ the pose --
  function poseOf(p, st) {
    var s = p.pose || {}, P = st.pose, now = nowS();
    // a shot: the contract's fire, else a rise of firePoseT
    if (p.firePoseT > (st.fpt || 0) + 0.05) st.shotAt = now;
    st.fpt = p.firePoseT || 0;
    P.aim = s.aim != null ? !!s.aim : !!(p.aiming || p.firePoseT > 0);
    P.aimPitch = s.aimPitch != null ? s.aimPitch : defaultPitch(p);
    P.aimYaw = s.aimYaw != null ? s.aimYaw : (p.aimYaw != null ? p.aimYaw : p.yaw);
    P.fire = s.fire != null ? s.fire : (st.shotAt ? now - st.shotAt : 99);
    P.reload = s.reload !== undefined ? s.reload : (p.reloadT > 0 ? clamp(1 - p.reloadT / (p.reloadTotal || 1), 0, 1) : null);
    P.melee = s.melee !== undefined ? s.melee : (p.punchT > 0 ? { type: 'light', t: clamp(1 - p.punchT / 0.28, 0, 1) } : null);
    P.cover = s.cover || null;
    P.weaponId = s.weaponId || p.weapon || 'fist';
    P.hold = s.hold || winfo(P.weaponId).hold;
    var v = p.inVehicle;
    P.ride = s.ride != null ? !!s.ride : !!(v && (v.type === 'bike' || v.type === 'moto'));
    P.drive = s.drive != null ? !!s.drive : !!(v && !P.ride);
    P.swim = s.swim != null ? !!s.swim : !!p.swimming;
    P.fall = s.fall != null ? !!s.fall : (!p.onGround && !p.swimming && !v);
    P.ragdoll = s.ragdoll || ((p.knockedDown || !p.alive) && !p.onGround && !v ? { vx: p.vx, vy: p.vy, vz: p.vz, spin: 0 } : null);
    return P;
  }
  function defaultPitch(p) {
    if (p._aimPitch != null) return p._aimPitch;
    if (p.kind === 'player' && GTP.Render && GTP.Render.rig && (p.aiming || p.firePoseT > 0)) return clamp(-(GTP.Render.rig.pitch - 0.12) * 0.9, -1.1, 1.1);
    var t = p.lockTarget || p.target;
    if (t && t.x != null && t.y != null) { var d = Math.sqrt((t.x - p.x) * (t.x - p.x) + (t.z - p.z) * (t.z - p.z)) || 1; return clamp(Math.atan2((t.y || 0) + 1.1 - (p.y + 1.4), d), -1, 1); }
    return 0;
  }

  // ----------------------------------------------------------- per-ped state --
  function state(p, m) {
    var st = p._anim;
    if (!st || st.mesh !== m) {
      st = p._anim = { mesh: m, pose: {}, aimW: 0, holdW: 0, crouchW: 0, airW: 0, lookY: 0, lookX: 0, t: nowS(), dt: 0, fpt: 0, shotAt: 0, seed: (p.id * 0.6180339) % 1, coverLean: 0, driveW: 0 };
      var ud = m.userData, B = ud.bones;
      st.B = B; st.rest = {};
      for (var k in B) st.rest[k] = B[k].position.clone();
      st.parts = { legL: B.legL, legR: B.legR, armL: B.armL, armR: B.armR, torso: B.torso, head: B.head, body: m, _mesh: m };
      for (k in B) st.parts[k] = B[k];
    }
    // blend time: the game clock's step (frames between steps, pauses and tests that sync repeatedly see 0), else the wall clock
    var now = nowS(), g = GTP.game, gt = g && g.time ? g.time.t : null, dg = gt != null && st.gt != null ? gt - st.gt : 0;
    // after a long gap (the ped was off screen, a test advanced the world without frames) blends land at once
    st.dt = dg > 0.25 ? 10 : clamp(dg > 0 ? dg : now - st.t, 0, 0.1); st.t = now; st.gt = gt;
    return st;
  }
  function rot(b, x, y, z) { b.rotation.set(x, y, z); }

  // ------------------------------------------------------------------ IK --
  // Frame "R": the ped root's local space (feet at 0, facing -z, before scale). Chest pose by forward kinematics.
  function chestFrame(B, outM, outQ) {
    B.hips.updateMatrix(); B.torso.updateMatrix(); B.chest.updateMatrix();
    outM.multiplyMatrices(B.hips.matrix, B.torso.matrix).multiply(B.chest.matrix);
    outQ.copy(B.hips.quaternion).multiply(B.torso.quaternion).multiply(B.chest.quaternion);
  }
  // two-bone IK: aim the upper arm and forearm so the hand's grip point lands on gripR (R frame) with the hand at
  // orientation handQ (R frame); pole: the elbow's hint direction (R frame)
  function armIK(up, lo, hand, chestM, chestQ, gripR, handQ, pole, reachK) {
    var S = _v.copy(up.position).applyMatrix4(chestM);
    var W = _v2.copy(GRIP).applyQuaternion(handQ); W.set(gripR.x - W.x, gripR.y - W.y, gripR.z - W.z);
    var D = _v3.subVectors(W, S), d = D.length(), max = (L1 + L2) * (reachK || 0.995);
    if (d > max) { D.multiplyScalar(max / d); d = max; W.copy(S).add(D); }
    if (d < 0.08) { D.set(0, -0.08, 0); d = 0.08; W.copy(S).add(D); }
    var dir = D.multiplyScalar(1 / d);
    var cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    var perp = _v4.copy(pole); perp.addScaledVector(dir, -perp.dot(dir));
    if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0).addScaledVector(dir, -dir.y);
    perp.normalize();
    var E = _v5.copy(S).addScaledVector(dir, L1 * cosA).addScaledVector(perp, L1 * sinA);
    // upper arm: rest -y toward the elbow, in the chest's frame
    _v4.subVectors(E, S).normalize().applyQuaternion(_q.copy(chestQ).invert());
    up.quaternion.setFromUnitVectors(DOWN, _v4);
    var upQ = _q2.copy(chestQ).multiply(up.quaternion);
    _v4.subVectors(W, E).normalize().applyQuaternion(_q.copy(upQ).invert());
    lo.quaternion.setFromUnitVectors(DOWN, _v4);
    var loQ = upQ.multiply(lo.quaternion);
    hand.quaternion.copy(loQ.invert()).multiply(handQ);
  }

  // ------------------------------------------------------------ the main --
  var POLE_R = new THREE.Vector3(0.7, -1, 0.35), POLE_L = new THREE.Vector3(-0.7, -1, 0.35), POLE_LIN = new THREE.Vector3(-0.15, -1, 0.1), POLE_RIN = new THREE.Vector3(0.15, -1, 0.1);
  var gripC = new THREE.Vector3(), supC = new THREE.Vector3(), tmpR = new THREE.Vector3(), tmpR2 = new THREE.Vector3();

  function animate(p, m, st, P, lod) {
    var B = st.B, R = st.rest, dt = st.dt, t = p.animTime || 0, sd = st.seed * 10;
    var alive = p.alive, lying = (p.knockedDown || !alive) && !p.inVehicle, swim = P.swim && !lying, seated = !!p.inVehicle;
    // reset to the bind pose
    for (var k in R) { var b = B[k]; if (b.userData.bone === k) { b.rotation.set(0, 0, 0); b.position.copy(R[k]); } }
    var wi = winfo(P.weaponId), armed = P.hold !== 'none' && alive && !lying && !swim && !seated;
    var crouchT = P.cover && !P.cover.high && !(P.cover.peek && P.aim) ? 1 : (P.cover && !P.cover.high ? 0.35 : 0);
    if (P.melee && P.melee.type === 'counter') crouchT = Math.max(crouchT, 0.35 * bell(P.melee.t * 1.4));
    st.crouchW = U.damp(st.crouchW, crouchT, 10, dt);
    st.airW = U.damp(st.airW, P.fall && !lying ? 1 : 0, 12, dt);
    st.aimW = U.damp(st.aimW, armed && (P.aim || (P.cover && P.cover.peek)) ? 1 : 0, 14, dt);
    st.holdW = U.damp(st.holdW, armed ? 1 : 0, 10, dt);
    var wl = P.weaponId === 'fist' ? 0 : 1;

    if (seated) { seatedPose(p, B, R, P, st, t); return; }
    if (lying) { lyingPose(p, B, R, P, st, t); return; }
    if (swim) { swimPose(p, B, P, st, t); headLook(p, B, st, 0); return; }

    // ---- locomotion
    var walkS = p.walkSpeed ? p.walkSpeed() : 1.6, sp = p.speed || 0, k = clamp(sp / 1.2, 0, 1), run = sp > walkS + 0.8;
    var sprint = clamp((sp - 5.8) / 1.2, 0, 1), ph = p.animPhase || 0, s = Math.sin(ph), c = Math.cos(ph);
    var amp = (run ? 0.72 + 0.22 * sprint : 0.44) * k;
    var uL = s * amp, uR = -s * amp;
    var kL = -(0.05 + Math.max(0, c) * (run ? 1.45 : 0.6) * k + (run ? 0.3 * k : 0.04 * k));
    var kR = -(0.05 + Math.max(0, -c) * (run ? 1.45 : 0.6) * k + (run ? 0.3 * k : 0.04 * k));
    var fL = -(uL + kL) * 0.55 + Math.max(0, -s) * 0.25 * k, fR = -(uR + kR) * 0.55 + Math.max(0, s) * 0.25 * k;
    var lean = run ? -(0.13 + 0.12 * sprint) : -0.03 * k;
    var bob = -Math.abs(s) * (run ? 0.045 : 0.022) * k + (run ? -0.03 * k : 0);
    var idle = 1 - k, br = Math.sin(t * 1.9 + sd);
    var shift = Math.sin(t * 0.45 + sd) * 0.022 * idle;
    rot(B.hips, 0, s * 0.11 * k, c * 0.035 * k + shift);
    B.hips.position.y += bob;
    rot(B.torso, lean * (1 - 0.6 * st.holdW), 0, -shift * 0.6);
    rot(B.chest, br * 0.018 * idle + (run ? 0.04 : 0), -s * 0.15 * k, 0);
    rot(B.neck, -lean * 0.35, 0, 0);
    rot(B.legL, uL, 0, -shift * 0.8 - 0.02); rot(B.lowerLegL, kL, 0, 0); rot(B.footL, fL, 0, 0);
    rot(B.legR, uR, 0, -shift * 0.8 + 0.02); rot(B.lowerLegR, kR, 0, 0); rot(B.footR, fR, 0, 0);
    // arms swing against the legs; elbows bend when running
    var aL = -s * amp * 0.85, aR = s * amp * 0.85, eB = run ? 1.25 + 0.25 * sprint : 0.16 + idle * 0.06;
    rot(B.armL, aL + br * 0.01 * idle, 0, -0.09 - idle * 0.02); rot(B.lowerArmL, eB + Math.max(0, aL) * 0.4, 0, 0); rot(B.handL, 0, 0, 0.1);
    rot(B.armR, aR - br * 0.01 * idle, 0, 0.09 + idle * 0.02); rot(B.lowerArmR, eB + Math.max(0, aR) * 0.4, 0, 0); rot(B.handR, 0, 0, -0.1);

    // ---- crouch (low cover, the counter's duck)
    var cw = st.crouchW;
    if (cw > 0.01) {
      B.legL.rotation.x += 1.35 * cw; B.legR.rotation.x += 1.25 * cw; B.lowerLegL.rotation.x -= 1.95 * cw; B.lowerLegR.rotation.x -= 1.85 * cw;
      B.footL.rotation.x += 0.6 * cw; B.footR.rotation.x += 0.6 * cw;
      B.hips.position.y -= 0.4 * cw; B.hips.position.z += 0.17 * cw; B.torso.rotation.x -= 0.3 * cw; B.neck.rotation.x += 0.15 * cw;
    }
    // ---- in the air: a tuck going up, a flail falling fast
    var aw = st.airW;
    if (aw > 0.01) {
      var fast = clamp((-(p.vy || 0) - 6) / 6, 0, 1), fl = Math.sin(t * 12) * fast;
      mixRot(B.legL, 0.55 + fl * 0.4, 0, -0.05, aw); mixRot(B.lowerLegL, -0.95, 0, 0, aw); mixRot(B.legR, -0.12 - fl * 0.4, 0, 0.05, aw); mixRot(B.lowerLegR, -0.45, 0, 0, aw);
      if (!armed) { mixRot(B.armL, -0.3 + fl * 0.5, 0, -0.9 - fast * 1.2, aw); mixRot(B.armR, -0.3 - fl * 0.5, 0, 0.9 + fast * 1.2, aw); mixRot(B.lowerArmL, 0.5, 0, 0, aw); mixRot(B.lowerArmR, 0.5, 0, 0, aw); }
    }
    // ---- getting up after a knockdown (the tilt eases back to upright)
    var tilt = p.tilt || 0;
    if (tilt < -0.08) { var gu = clamp(-tilt / 1.2, 0, 1); B.legL.rotation.x += 1.2 * gu; B.lowerLegL.rotation.x -= 1.8 * gu; B.legR.rotation.x += 0.3 * gu; B.lowerLegR.rotation.x -= 0.9 * gu; B.armL.rotation.x += 0.8 * gu; B.armR.rotation.x += 0.8 * gu; }

    // ---- the upper body
    var pitch = clamp(P.aimPitch || 0, -1.2, 1.2), aimW = st.aimW;
    var twist = clamp(U.wrapAngle((P.aimYaw != null ? P.aimYaw : p.yaw) - p.yaw), -0.8, 0.8) * aimW;
    if (aimW > 0.01) {
      B.torso.rotation.x += pitch * 0.38 * aimW; B.chest.rotation.x += pitch * 0.38 * aimW;
      B.torso.rotation.y += twist * 0.4; B.chest.rotation.y += twist * 0.6;
      B.torso.rotation.x -= lean * 0.5 * aimW;
    }
    // cover: lean out to peek, a blind fire over the top
    var cv = P.cover, lean2 = 0;
    if (cv && cv.high) lean2 = (cv.peek ? 0.32 : 0.04) * (cv.side === 'left' ? 1 : -1);
    st.coverLean = U.damp(st.coverLean, lean2, 10, dt);
    if (st.coverLean) { B.torso.rotation.z += st.coverLean; B.hips.position.x -= st.coverLean * 0.25; B.neck.rotation.z -= st.coverLean * 0.4; }
    // recoil
    var rk = P.fire < 0.35 ? Math.exp(-P.fire * 16) : 0;
    if (rk > 0.01 && armed) { B.chest.rotation.x += 0.05 * rk * (wi.hold === 'two' ? 1 : 0.6); B.torso.rotation.x += 0.02 * rk; }

    var mel = P.melee && alive ? P.melee : null;
    var ikOK = lod < 2 && B.chest;
    if (armed && ikOK) holdPose(p, B, P, st, wi, pitch, rk, mel);
    else if (mel && ikOK && !armed) fistPose(p, B, P, st, mel);
    else if (P.aim && !armed && ikOK && wl === 0 && alive) fistPose(p, B, P, st, null);
    else if (armed) {   // far: a cheap FK hold
      rot(B.armR, 1.2 * st.aimW + 0.3, 0, 0.1); rot(B.lowerArmR, 0.3, 0, 0);
      if (wi.hold === 'two') { rot(B.armL, 1.1 * st.aimW + 0.5, 0, -0.5); rot(B.lowerArmL, 0.7, 0, 0); }
    }
    syncHeld(p, B, P, st, wi, armed);
    // the placard: the left hand holds it up, the stick upright
    var signProp = null, hl = B.handL.children;
    for (var j = 0; j < hl.length; j++) if (hl[j].userData.sign) signProp = hl[j];
    if (signProp && ikOK && !(armed && wi.hold === 'two')) {
      chestFrame(B, _m, _qChest);
      gripC.set(-0.17, 0.18 + Math.sin(t * 2.2 + sd) * 0.02, -0.26).applyMatrix4(_m);
      armIK(B.armL, B.lowerArmL, B.handL, _m, _qChest, gripC, _qHand.copy(_qChest), POLE_L);
      signProp.quaternion.copy(_qHand).invert();   // undo the hand: the stick stands up in R
    }
    headLook(p, B, st, aimW * pitch);
  }
  function mixRot(b, x, y, z, w) { var r = b.rotation; r.set(r.x + (x - r.x) * w, r.y + (y - r.y) * w, r.z + (z - r.z) * w); }

  // weapons: targets in the chest frame, both arms by IK, the gun re-parented to the right hand
  function holdPose(p, B, P, st, wi, pitch, rk, mel) {
    var aimW = st.aimW, two = wi.hold === 'two', t = p.animTime || 0;
    // the gun's orientation (chest frame) and the grip point
    var gp = 0, gy = 0, gx = 0, gz = 0, gyaw = 0, groll = 0, gpy = 0;
    var walk = Math.sin(p.animPhase || 0) * clamp((p.speed || 0) / 1.2, 0, 1);
    if (wi.melee) {
      // a bat-like melee weapon: on the shoulder at rest, two hands cocked when ready, an arc when swinging
      var mt = mel ? mel.t : -1;
      if (mt >= 0) {
        var heavy = mel.type === 'heavy', sw = heavy ? smooth((mt - 0.35) / 0.35) : smooth((mt - 0.15) / 0.35), back = heavy ? smooth(mt / 0.35) : smooth(mt / 0.15);
        gx = 0.2 - 0.35 * sw; gy = 0.22 - 0.25 * sw + 0.05 * back * (1 - sw); gz = -0.05 - 0.35 * bell(sw); gp = 1.6 - 2.4 * sw; gyaw = -0.6 + 1.6 * sw;
        B.chest.rotation.y += 0.45 * back * (1 - sw) - 0.55 * sw; B.torso.rotation.y += 0.25 * back * (1 - sw) - 0.3 * sw;
      } else {
        gx = 0.17; gy = 0.08 + 0.17 * aimW; gz = -0.12 + 0.06 * aimW; gp = 1.0 + 0.5 * aimW; gyaw = -0.4;
      }
    } else if (wi.thrown && !wi.upright) {
      gx = 0.14; gy = 0; gz = -0.2; gp = 0;
    } else if (wi.upright && wi.thrown) {
      // a hot take / hot mic: cocked over the shoulder when aiming, the arm whips through on the throw
      var th = P.fire < 0.4 ? smooth(P.fire / 0.25) : 1;
      gx = 0.18 - 0.08 * (1 - th) * aimW; gy = -0.02 + 0.36 * aimW * th + 0.2 * (1 - th); gz = -0.14 + 0.2 * aimW * th - 0.35 * (1 - th); gp = 0.25 * aimW;
    } else if (wi.upright) {   // the megaphone: at the mouth when aiming
      gx = 0.13 - 0.07 * aimW; gy = -0.02 + 0.33 * aimW; gz = -0.18 - 0.06 * aimW; gp = -0.9 * (1 - aimW);
    } else if (two) {
      // rifle-likes: stock in the shoulder pocket aiming, a low ready otherwise
      gx = 0.1 + 0.04 * (1 - aimW); gy = 0.1 * aimW - 0.08 * (1 - aimW) + walk * 0.01; gz = -0.22 - 0.02 * (1 - aimW); gp = -0.55 * (1 - aimW); gyaw = 0.35 * (1 - aimW);
      gpy = 0.03 * rk; gz += 0.05 * rk;
    } else {
      // pistols: both arms out aiming, the gun down by the thigh otherwise
      gx = 0.04 + 0.13 * (1 - aimW); gy = 0.18 * aimW - 0.36 * (1 - aimW); gz = -0.51 * aimW - 0.08 * (1 - aimW) + walk * 0.05 * (1 - aimW); gp = -1.0 * (1 - aimW); gyaw = 0.1 * (1 - aimW);
      gpy = 0.25 * rk; gz += 0.04 * rk; gy += 0.02 * rk;
    }
    // reload: the gun tilts and drops a little, the support hand travels to the magazine, the pouch and back
    var rl = P.reload, rB = 0;
    if (rl != null && !wi.melee && !wi.thrown) { rB = bell(rl); groll = 0.7 * rB; gp -= 0.3 * rB; gy -= 0.05 * rB; gx -= 0.04 * rB; }
    gp += gpy;
    chestFrame(B, _m, _qChest);
    // gun orientation in R = chest * (yaw, pitch, roll) * barrel mapping
    _e.set(gp, gyaw, groll, 'YXZ'); _q.setFromEuler(_e);
    _qGun.copy(_qChest).multiply(_q).multiply(wi.upright ? Q_UPRIGHT : Q_BARREL);
    _qHand.copy(_qGun).multiply(wi.upright ? Q_UPRIGHT_INV : Q_BARREL_INV);
    gripC.set(gx, gy, gz).applyMatrix4(_m);
    armIK(B.armR, B.lowerArmR, B.handR, _m, _qChest, gripC, _qHand, POLE_R);
    st.gunQ = _qGun; st.gunAt = gripC;
    // the support hand
    var support = two || (!wi.upright && !wi.thrown && aimW > 0.3) || (wi.melee && (aimW > 0.3 || (P.melee && P.melee.t >= 0)));
    if (support || rl != null) {
      var bx = _v.set(1, 0, 0).applyQuaternion(_qGun);   // the barrel direction in R
      var fore = two ? clamp(wi.len * 0.4, 0.16, 0.3) : wi.melee ? -0.09 : 0.0;
      supC.copy(gripC).addScaledVector(bx, fore);
      if (!two && !wi.melee) { tmpR.set(-0.03, -0.035, 0.02).applyQuaternion(_qChest); supC.add(tmpR); }
      else if (two) { tmpR.set(0, -0.03, 0).applyQuaternion(_qGun); supC.add(tmpR); }
      if (rl != null) {
        // keyframes: grip -> magazine -> the pouch on the left hip -> magazine -> grip
        var mag = tmpR2.copy(gripC).addScaledVector(bx, two ? 0.08 : 0.0); tmpR.set(0, -0.12, 0).applyQuaternion(_qGun); mag.add(tmpR);
        var pouch = _v4.set(-0.15, -0.3, -0.06).applyMatrix4(_m);
        if (rl < 0.2) supC.lerp(mag, smooth(rl / 0.2));
        else if (rl < 0.45) supC.copy(mag).lerp(pouch, smooth((rl - 0.2) / 0.25));
        else if (rl < 0.7) supC.copy(pouch).lerp(mag, smooth((rl - 0.45) / 0.25));
        else supC.copy(mag).lerp(supC, smooth((rl - 0.7) / 0.3));
      }
      _q2.setFromAxisAngle(_v2.set(1, 0, 0), 0.9); _q3.copy(_qChest).multiply(_q2);
      armIK(B.armL, B.lowerArmL, B.handL, _m, _qChest, supC, _q3, two ? POLE_LIN : POLE_L);
    } else if (wi.upright && wi.thrown && st.aimW > 0.3) {
      // the free arm points at the target
      rot(B.armL, 1.3 * st.aimW, 0, -0.2); rot(B.lowerArmL, 0.2, 0, 0);
    }
  }
  // fists: a guard when aiming, jab / hook / uppercut
  function fistPose(p, B, P, st, mel) {
    chestFrame(B, _m, _qChest);
    var gR = gripC.set(0.1, 0.22, -0.2), gL = supC.set(-0.1, 0.25, -0.24), t = mel ? mel.t : 0;
    if (mel) {
      if (mel.type === 'heavy') {
        var wind = smooth(t / 0.35), hit = smooth((t - 0.35) / 0.25), rec = smooth((t - 0.6) / 0.4);
        var hx = 0.22 - 0.36 * hit + 0.24 * rec, hz = -0.05 - 0.4 * bell(hit) - 0.15 * (1 - rec) * hit;
        gR.set(0.1 + (hx - 0.1) * Math.max(wind, hit), 0.2, -0.2 + (hz + 0.2) * Math.max(wind, hit) * (1 - rec));
        B.chest.rotation.y += 0.5 * wind * (1 - hit) - 0.65 * hit * (1 - rec); B.torso.rotation.y += 0.25 * wind * (1 - hit) - 0.3 * hit * (1 - rec);
      } else if (mel.type === 'counter') {
        var up = bell(clamp((t - 0.25) / 0.6, 0, 1));
        gR.set(0.08, 0.02 + 0.4 * up, -0.22 - 0.18 * up); B.torso.rotation.x += 0.15 * up;
      } else {
        var j = bell(clamp(t / 0.7, 0, 1));
        gR.set(0.1 - 0.07 * j, 0.22 + 0.02 * j, -0.2 - 0.4 * j); B.chest.rotation.y -= 0.35 * j; B.torso.rotation.y -= 0.1 * j;
        gL.z += 0.06 * j;
      }
      chestFrame(B, _m, _qChest);
    }
    _q2.setFromAxisAngle(_v2.set(1, 0, 0), HALF); _qHand.copy(_qChest).multiply(_q2);
    gR.applyMatrix4(_m); gL.applyMatrix4(_m);
    armIK(B.armR, B.lowerArmR, B.handR, _m, _qChest, gR, _qHand, POLE_R);
    armIK(B.armL, B.lowerArmL, B.handL, _m, _qChest, gL, _qHand, POLE_L);
  }
  // the gun Combat hangs on armR moves to the hand; held props hide while a weapon is out
  function syncHeld(p, B, P, st, wi, armed) {
    var held = p._held, hand = B.handR;
    if (held && held.parent && held.parent !== hand) hand.add(held);
    if (held && held.parent === hand) {
      held.position.copy(GRIP);
      if (armed && st.gunQ) {
        // gun in hand = hand^-1 * gun (both in R): by construction the barrel mapping
        held.quaternion.copy(wi.upright ? Q_UPRIGHT : Q_BARREL);
      } else {
        _q.setFromAxisAngle(_v.set(1, 0, 0), wi.upright ? 0 : -0.7); held.quaternion.copy(_q).multiply(wi.upright ? Q_UPRIGHT : Q_BARREL);
      }
      held.scale.setScalar(1);
    }
    st.gunQ = null;
    var hide = (p.weapon && p.weapon !== 'fist') || p.swimming || (p.inVehicle && !(P.ride));
    var ch = hand.children;
    for (var i = 0; i < ch.length; i++) if (ch[i].name === 'prop') { ch[i].userData.hidden = !!hide; ch[i].visible = !hide && (st.mesh.userData.lod || 0) < 2; }
  }
  function headLook(p, B, st, pitchExtra) {
    var pl = player(), ty = 0, tx = 0, t = p.animTime || 0;
    if (pl && pl !== p && pl.alive && !pl.inVehicle) {
      var dx = pl.x - p.x, dz = pl.z - p.z, d2 = dx * dx + dz * dz;
      if (d2 < 25 && d2 > 0.2) { var rel = U.wrapAngle(U.dirToYaw(dx, dz) - p.yaw); if (Math.abs(rel) < 1.9) { ty = clamp(rel, -1.1, 1.1); tx = -0.08; } }
    }
    if (!ty && !(p.speed > 0.3)) ty = Math.sin(t * 0.31 + st.seed * 20) * Math.sin(t * 0.17 + st.seed * 7) * 0.5;
    st.lookY = U.damp(st.lookY, ty, 5, st.dt); st.lookX = U.damp(st.lookX, tx, 5, st.dt);
    B.neck.rotation.y += st.lookY * 0.35; B.head.rotation.y += st.lookY * 0.65;
    B.head.rotation.x += st.lookX + pitchExtra * 0.22;
  }

  // ------------------------------------------------------- special poses --
  function lyingPose(p, B, R, P, st, t) {
    var air = P.ragdoll ? clamp(Math.sqrt((P.ragdoll.vx || 0) * (P.ragdoll.vx || 0) + (P.ragdoll.vz || 0) * (P.ragdoll.vz || 0) + (P.ragdoll.vy || 0) * (P.ragdoll.vy || 0)) / 6, 0.3, 1) : 0;
    st.flail = U.damp(st.flail || 0, air, 8, st.dt);
    var f = st.flail, sd = st.seed, w1 = Math.sin(t * 13 + sd * 9), w2 = Math.sin(t * 11 + sd * 4), w3 = Math.sin(t * 9.3 + sd);
    // the settled sprawl: face down, arms out, one knee drawn up, the head turned
    var side = sd > 0.5 ? 1 : -1;
    rot(B.hips, 0, 0, 0.05 * side);
    rot(B.torso, 0.05 + w3 * 0.25 * f, 0.1 * side + w2 * 0.2 * f, 0);
    rot(B.chest, 0.05, 0, 0);
    rot(B.neck, 0.2, 0.3 * side, 0); rot(B.head, 0.15, 0.85 * side, 0);
    rot(B.armL, 0.35 + w1 * 0.9 * f - 1.3 * f, 0, -1.25 - 0.5 * f + w2 * 0.4 * f); rot(B.lowerArmL, 0.7 + 0.4 * f, 0, 0);
    rot(B.armR, 0.25 - w1 * 0.9 * f - 1.3 * f, 0, 1.05 + 0.5 * f - w2 * 0.4 * f); rot(B.lowerArmR, 0.9 + 0.4 * f, 0, 0);
    rot(B.legL, (side > 0 ? 0.55 : 0.05) + w2 * 0.6 * f, 0, -0.18); rot(B.lowerLegL, (side > 0 ? -0.9 : -0.2) - 0.4 * f, 0, 0); rot(B.footL, -0.5, 0, 0);
    rot(B.legR, (side < 0 ? 0.55 : 0.05) - w2 * 0.6 * f, 0, 0.18); rot(B.lowerLegR, (side < 0 ? -0.9 : -0.2) - 0.4 * f, 0, 0); rot(B.footR, -0.5, 0, 0);
    // dead: limp, no breathing; knocked down and alive: a stir of the head
    if (p.alive) B.head.rotation.x += Math.sin(t * 2.3) * 0.04;
    void R;
  }
  function swimPose(p, B, P, st, t) {
    var ph = (p.animPhase || 0) * 1.25, sp = clamp((p.speed || 0) / 1.5, 0, 1);
    if (sp > 0.15) {
      rot(B.armL, -ph % (2 * PI), 0, -0.25 - 0.15 * Math.max(0, Math.sin(ph))); rot(B.lowerArmL, 0.35 + 0.5 * Math.max(0, Math.cos(ph)), 0, 0);
      rot(B.armR, -(ph + PI) % (2 * PI), 0, 0.25 + 0.15 * Math.max(0, -Math.sin(ph))); rot(B.lowerArmR, 0.35 + 0.5 * Math.max(0, -Math.cos(ph)), 0, 0);
      var kick = Math.sin(ph * 3) * 0.3;
      rot(B.legL, kick, 0, -0.05); rot(B.legR, -kick, 0, 0.05); rot(B.lowerLegL, -0.15 - Math.max(0, kick) * 0.6, 0, 0); rot(B.lowerLegR, -0.15 - Math.max(0, -kick) * 0.6, 0, 0);
      rot(B.footL, -0.9, 0, 0); rot(B.footR, -0.9, 0, 0);
      // breathe to the side every other stroke
      var b = Math.max(0, Math.sin(ph * 0.5)); rot(B.head, -0.35, b * 0.9, 0); rot(B.torso, 0, b * 0.25, 0);
    } else {
      // treading water: sculling hands, a slow egg-beater kick (the body tilt stays prone; the head looks up)
      var s1 = Math.sin(t * 3);
      rot(B.armL, 1.6 + s1 * 0.4, 0, -0.9); rot(B.armR, 1.6 - s1 * 0.4, 0, 0.9); rot(B.lowerArmL, 0.6, 0, 0); rot(B.lowerArmR, 0.6, 0, 0);
      rot(B.legL, 0.5 + s1 * 0.3, 0, -0.2); rot(B.legR, 0.5 - s1 * 0.3, 0, 0.2); rot(B.lowerLegL, -1.0, 0, 0); rot(B.lowerLegR, -1.0, 0, 0);
      rot(B.head, -0.9, 0, 0); rot(B.neck, -0.3, 0, 0);
    }
  }
  // seated in a car or on a scooter: hips on the seat, hands on the wheel or the bars (the vehicle record's points)
  function seatedPose(p, B, R, P, st, t) {
    var v = p.inVehicle, ud = v.mesh && v.mesh.userData, rec = ud && ud.rec, ride = P.ride;
    var sc = (p.look && p.look.scale) || 1;
    rot(B.hips, ride ? 0.15 : -0.05, 0, 0);
    rot(B.torso, ride ? -0.3 : 0.08, 0, 0); rot(B.chest, ride ? -0.05 : 0.02, 0, 0); rot(B.neck, ride ? 0.25 : -0.05, 0, 0); rot(B.head, ride ? 0.1 : 0, 0, 0);
    if (ride) { rot(B.legL, 1.15, 0, -0.12); rot(B.legR, 1.15, 0, 0.12); rot(B.lowerLegL, -1.05, 0, 0); rot(B.lowerLegR, -1.05, 0, 0); rot(B.footL, -0.1, 0, 0); rot(B.footR, -0.1, 0, 0); }
    else { rot(B.legL, 1.45, 0, -0.08); rot(B.legR, 1.42, 0, 0.1); rot(B.lowerLegL, -0.5, 0, 0); rot(B.lowerLegR, -0.6, 0, 0); rot(B.footL, -0.45, 0, 0); rot(B.footR, -0.35, 0, 0); }
    var driver = p.seat === 0 || v.driver === p;
    var wheel = rec && (ride ? rec.bars : rec.wheelPoint), seat = rec && rec.seats && rec.seats[Math.min(p.seat | 0, rec.seats.length - 1)];
    if (driver && wheel && seat && B.chest) {
      // the wheel point in the body's root frame: (wheel - seat) / scale + the hips' rest height
      chestFrame(B, _m, _qChest);
      var steer = ride ? (v.wheelSteer || 0) * 0.8 : (v.wheelSteer || 0) * 2.2, wr = ride ? 0.3 : 0.17, tiltW = ride ? 0 : 0.35;
      [-1, 1].forEach(function (s) {
        var a = (s < 0 ? PI + 0.35 : -0.35) + steer;
        var hx = ride ? s * wr : Math.cos(a) * wr, hy = ride ? 0 : Math.sin(a) * wr;
        var tgt = (s < 0 ? supC : gripC).set((wheel.x - seat.x) / sc + hx, (wheel.y - seat.y) / sc + R.hips.y + hy * Math.cos(tiltW), (wheel.z - seat.z) / sc + hy * Math.sin(tiltW) + (ride ? -steer * s * 0.12 : 0));
        _q2.setFromAxisAngle(_v2.set(1, 0, 0), 1.2); _qHand.copy(_qChest).multiply(_q2);
        if (s < 0) armIK(B.armL, B.lowerArmL, B.handL, _m, _qChest, tgt, _qHand, POLE_L);
        else armIK(B.armR, B.lowerArmR, B.handR, _m, _qChest, tgt, _qHand, POLE_R);
      });
      // a drive-by: the free arm points out along the aim
      if (P.aim && !ride) {
        var rel = U.wrapAngle((P.aimYaw != null ? P.aimYaw : p.yaw) - p.yaw);
        var dx = -Math.sin(rel), dz = -Math.cos(rel), sh = _v3.copy(B.armL.position).applyMatrix4(_m);
        gripC.set(sh.x + dx * 0.55, sh.y + 0.05, sh.z + dz * 0.55);
        armIK(B.armL, B.lowerArmL, B.handL, _m, _qChest, gripC, _qHand.copy(_qChest), POLE_L);
        B.head.rotation.y += clamp(rel, -1.2, 1.2) * 0.7;
      }
    } else {
      rot(B.armL, 0.55, 0, -0.1); rot(B.lowerArmL, 0.9, 0, 0); rot(B.armR, 0.55, 0, 0.1); rot(B.lowerArmR, 0.9, 0, 0);
      B.head.rotation.y = Math.sin(t * 0.4 + st.seed * 30) * 0.35;
    }
  }

  // ------------------------------------------------------------ syncMesh --
  function tooFar(e, limit) {
    var c = cam(); if (!c || !limit) return false;
    var dx = e.x - c.position.x, dz = e.z - c.position.z;
    return dx * dx + dz * dz > limit * limit;
  }
  function syncMesh(alpha) {
    var m = this.mesh; if (!m) return;
    if (!m.userData || !m.userData.models || !m.userData.bones) return legacySync.call(this, alpha);
    var a = alpha == null ? 1 : alpha;
    var st = state(this, m);
    this._parts = st.parts;   // the v0.2 handles (cutscene poses write to them after this)
    var firstPerson = this.kind === 'player' && this.cameraMode === 'first';
    var P = poseOf(this, st);
    if (this.inVehicle) { syncSeated(this, m, a, st, P, firstPerson); return; }
    m.visible = !firstPerson && !this.removed && !tooFar(this, C.QUALITY.pedDraw);
    if (!m.visible) return;
    var x = this._px + (this.x - this._px) * a, y = this._py + (this.y - this._py) * a, z = this._pz + (this.z - this._pz) * a;
    var yaw = this._pyaw + U.wrapAngle(this.yaw - this._pyaw) * a;
    var t = this.tilt || 0;
    var lying = this.knockedDown || !this.alive;
    if (lying) y += 0.16 * Math.abs(Math.sin(t));
    else if (this.swimming) y -= 0.12;
    var d2 = camDist2(x, z), lod = GTP.Models.lodFor(Math.sqrt(d2));
    GTP.Models.setLod(m, lod);
    // far peds animate at a third of the frame rate (their phase still runs)
    st.skip = (st.skip || 0) + 1;
    if (lod < 2 || st.skip >= 3 || st.lastLying !== lying) { st.skip = 0; animate(this, m, st, P, lod); st.lastLying = lying; }
    m.position.set(x, y, z);
    m.rotation.set(t, yaw, 0, 'YXZ');
  }
  // a car seat (visible through the glass when the vehicle record has seats), the scooter's saddle
  function syncSeated(p, m, a, st, P, firstPerson) {
    var v = p.inVehicle, vm = v.mesh, ud = vm && vm.userData, rec = ud && ud.rec;
    var seat = rec && rec.seats && rec.seats[Math.min(p.seat | 0, rec.seats.length - 1)];
    var ride = P.ride && !v.wreck && !v.sinking && (p.seat | 0) === 0;
    var show = !firstPerson && !p.removed && p.alive && !v.wreck && !v.sinking && !(vm && !vm.visible) && !tooFar(p, Math.min(C.QUALITY.pedDraw, ride ? 999 : 55));
    if (!ride && !seat) show = false;
    // v0.2 hides the player's own body inside a car (tests/actors.js); GTP.Anim.showPlayerInCar opts in, NPC occupants show
    if (!ride && p.kind === 'player' && !GTP.Anim.showPlayerInCar) show = false;
    if (!ride && !GTP.Anim.showOccupants) show = false;
    if (!ride && v.type === 'bike') show = false;
    m.visible = show;
    if (!show) return;
    var vx = v._px + (v.x - v._px) * a, vy = v._py + (v.y - v._py) * a, vz = v._pz + (v.z - v._pz) * a;
    var yaw = v._pyaw + U.wrapAngle(v.yaw - v._pyaw) * a, sc = (p.look && p.look.scale) || 1;
    var sx, sy, sz;
    if (seat) { sx = seat.x; sy = seat.y; sz = seat.z; }
    else { sx = 0; sy = 0.86; sz = 0.3; }   // v0.2 saddle: 0.86 m up, 0.3 m behind the centre
    var cy = Math.cos(yaw), sy2 = Math.sin(yaw), hipY = 0.96 * sc;
    m.position.set(vx + sx * cy + sz * sy2, vy + sy - hipY + (v.pitch || 0) * -sz * 0, vz - sx * sy2 + sz * cy);
    m.rotation.set(v.pitch || 0, yaw, v.roll || 0, 'YXZ');
    var d2 = camDist2(vx, vz), lod = GTP.Models.lodFor(Math.sqrt(d2));
    GTP.Models.setLod(m, lod);
    animate(p, m, st, P, lod);
  }

  GTP.Anim = {
    poseOf: function (p) { return p.mesh && p.mesh.userData.models ? poseOf(p, state(p, p.mesh)) : null; },
    weaponInfo: winfo,
    armIK: armIK,
    syncMesh: syncMesh,
    legacySync: legacySync,
    GRIP: GRIP,
    showOccupants: true,
    showPlayerInCar: false
  };
  Ped.prototype.syncMesh = syncMesh;

  // ------------------------------------------------- vehicles: LOD + mods --
  if (Vehicle && Vehicle.prototype.syncMesh) {
    var legacyVehicleSync = Vehicle.prototype.syncMesh;
    Vehicle.prototype.syncMesh = function (alpha) {
      legacyVehicleSync.call(this, alpha);
      var m = this.mesh, ud = m && m.userData;
      if (!ud || !ud.rec || !m.visible) return;
      if (GTP.Models && GTP.Models.syncVehicle) { try { GTP.Models.syncVehicle(this, m, ud); } catch (e) { U.reportError(e, 'models.syncVehicle'); } }
    };
    GTP.Anim.legacyVehicleSync = legacyVehicleSync;
  }
})();
