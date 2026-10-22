/* characters.js: the v0.3 models track. Skinned humanoids (17 bones, the v0.2 pivot names as aliases, head 1/7.5 of the
 * height, a face atlas, hair, outfits, three LODs, one draw call), GTP.Anim (locomotion, aim with the gun in the hand
 * along the aim, two-handed IK grips, reload, melee, cover, swim, knockdown, seated drivers, the pose contract), the
 * v0.2 syncMesh behaviours (first-person hide, distance cull, the knockdown tilt, the corpse fade), smooth vehicles for
 * the nine classes (LODs, glass, chrome, lamps, seats, mods) and a crowd budget. Screenshots: tests/out/characters_*.png.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/characters.js */
'use strict';
const H = require('./_harness');

H.run('characters', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;

  // ---- the rig and the geometry
  const rig = await page.evaluate(() => {
    const M = GTP.Models, look = { skin: 3, hair: 'bald', hairColor: '#222222', shirt: '#2a3a6a', pants: '#333333', hat: 'none', glasses: 'none', extra: 'none', tie: 'none' };
    const root = GTP.Assets.pedParts(look), ud = root.userData, B = M.bones(root);
    const names = ['legL', 'legR', 'armL', 'armR', 'torso', 'head'].map((n) => { const o = root.getObjectByName(n); return !!(o && o.isBone); });
    const extra = ['hips', 'chest', 'neck', 'lowerArmL', 'handL', 'lowerArmR', 'handR', 'lowerLegL', 'footL', 'lowerLegR', 'footR'].map((n) => !!root.getObjectByName(n));
    let meshes = 0; root.traverse((o) => { if (o.isMesh && o.name !== 'prop') meshes++; });
    const g = M.lodGeometry(root, 0), P = g.attributes.position.array, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array;
    let top = -1, chin = 9;
    for (let i = 0; i < P.length / 3; i++) { const y = P[i * 3 + 1]; if (y > top) top = y; if (SI[i * 4] === 4 && SW[i * 4] > 0.99 && P[i * 3 + 2] < -0.03 && Math.abs(P[i * 3]) < 0.03 && y < chin) chin = y; }
    const sig = (geo) => { const a = geo.attributes.position.array; let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * ((i % 7) + 1); return a.length + ':' + s.toFixed(2); };
    const hair = {}; ['short', 'long', 'bob', 'bun', 'afro', 'mohawk', 'pompadour', 'slick', 'bald'].forEach((h) => { hair[h] = sig(M.buildBody(Object.assign({}, look, { hair: h }), 0)); });
    const hats = {}; ['none', 'cap', 'beanie', 'cowboy', 'fedora', 'beret', 'crown', 'helmet'].forEach((h) => { hats[h] = sig(M.buildBody(Object.assign({}, look, { hat: h }), 0)); });
    return {
      bones: ud.boneList.length, skeleton: ud.skin.skeleton.bones.length, skinned: ud.skin.isSkinnedMesh, names, extra, meshes,
      tris: [0, 1, 2].map((i) => M.lodGeometry(root, i).userData.tris), top: +top.toFixed(3), chin: +chin.toFixed(3), headFrac: +((top - chin) / top).toFixed(3),
      hair, hats, atlas: !!M.atlas().tex, aliasSame: B.legL === B.upperLegL && B.torso === B.spine && B.armR === B.upperArmR
    };
  });
  console.log('  rig: ' + JSON.stringify(rig));
  t.assert(rig.bones === 17 && rig.skeleton === 17 && rig.skinned, '17-bone skinned mesh');
  t.assert(rig.names.every(Boolean) && rig.extra.every(Boolean) && rig.aliasSame, 'v0.2 pivot names are bone aliases; every bone findable');
  t.assert(rig.meshes === 1, 'one draw call per ped: ' + rig.meshes);
  t.assert(Math.abs(rig.headFrac - 1 / 7.5) < 0.02 && rig.top > 1.74 && rig.top < 1.86, 'head is 1/7.5 of a 1.8 m height: ' + JSON.stringify([rig.headFrac, rig.top, rig.chin]));
  t.assert(rig.tris[0] > rig.tris[1] && rig.tris[1] > rig.tris[2] && rig.tris[0] < 9000 && rig.tris[2] < 1600, 'three LODs inside the budget: ' + rig.tris.join('/'));
  t.assert(new Set(Object.values(rig.hair)).size === 9, 'hair meshes differ per style: ' + JSON.stringify(rig.hair));
  t.assert(new Set(Object.values(rig.hats)).size === 8, 'hat meshes differ per style: ' + JSON.stringify(rig.hats));
  t.assert(rig.atlas, 'face atlas texture');

  // ---- outfits: v0.2 looks map to styles; parity clothing ids resolve
  const outfits = await page.evaluate(() => {
    const M = GTP.Models, P = GTP.Content.parity = GTP.Content.parity || {}, saved = P.clothing;
    P.clothing = [{ id: 'cl_hoodie_test', slot: 'top', name: 'Test Hoodie', color: '#118833' }, { id: 'cl_shorts_test', slot: 'bottom', name: 'Cargo Shorts', color: '#aa9977' }, { id: 'cl_boot_test', slot: 'shoes', name: 'Work Boots' }];
    const r = {
      suit: M.outfitOf({ shirt: '#2b2b3a', pants: '#2b2b3a', tie: 'blue' }).top.style,
      dress: M.outfitOf({ shirt: '#f4f4f4', pants: '#2a2f4a', tie: 'red' }).top.style,
      cop: M.outfitOf({ shirt: '#1f2a3a', role: 'cop', badge: '#e8b53a' }).top.style,
      swat: M.outfitOf({ uniform: 'swat' }).top.style,
      parity: M.outfitOf({ shirt: '#ffffff', outfit: { top: 'cl_hoodie_test', bottom: 'cl_shorts_test', shoes: 'cl_boot_test', hat: 'none' } })
    };
    r.geoDiffers = M.buildBody({ shirt: '#ffffff', outfit: { top: 'cl_hoodie_test', bottom: 'cl_shorts_test' } }, 0).attributes.position.count !== M.buildBody({ shirt: '#ffffff' }, 0).attributes.position.count;
    P.clothing = saved;
    return { suit: r.suit, dress: r.dress, cop: r.cop, swat: r.swat, top: r.parity.top.style, bottom: r.parity.bottom.style, shoes: r.parity.shoes.style, topColor: r.parity.top.color.map((c) => +c.toFixed(2)), geoDiffers: r.geoDiffers };
  });
  console.log('  outfits: ' + JSON.stringify(outfits));
  t.assert(outfits.suit === 'suit' && outfits.dress === 'dress' && outfits.cop === 'uniform' && outfits.swat === 'swat', 'v0.2 looks pick their tops');
  t.assert(outfits.top === 'hoodie' && outfits.bottom === 'shorts' && outfits.shoes === 'boots' && outfits.topColor[1] > 0.5 && outfits.geoDiffers, 'parity clothing ids resolve to styles and colours');

  // ---- animation: a stage of peds in front of a free camera
  const anim = await page.evaluate(() => {
    const E = GTP.Entities, p = GTP.game.player, W = GTP.World, out = {};
    const mk = (dx, dz, look) => { const e = new GTP.Ped({ x: p.x + dx, z: p.z + dz, look: look || { skin: 2, hair: 'short', shirt: '#c94040', pants: '#2a2f4a' }, persistent: true }); e.y = W.heightAt(e.x, e.z, p.y); e.snap(); E.add(e); e.ai = { mode: 'mission', mission: 'cutscene', ambient: false }; e.update = function (dt) { this.age += dt; this.animTime += dt; }; return e; };
    GTP.game.debug.freeCam(p.x, p.y + 1.7, p.z + 6, p.x, p.y + 1, p.z);
    const sync = () => { E.sync(1); };
    // walk: the legs swing through the phase
    const w = mk(1, 0); w.state = 'walk'; w.speed = 1.6; const B = w.mesh.userData.bones; const legs = [];
    for (let k = 0; k < 6; k++) { w.animPhase = k * 0.9; sync(); legs.push(+B.legL.rotation.x.toFixed(2)); }
    out.walk = { legs, knee: +B.lowerLegL.rotation.x.toFixed(2) };
    // run leans forward and bends the elbows
    w.state = 'run'; w.speed = 5.5; w.animPhase = 1; sync(); out.run = { lean: +B.torso.rotation.x.toFixed(2), elbow: +B.lowerArmR.rotation.x.toFixed(2) };
    // aim a rifle: Combat places the gun on the root (shoulder pocket); the hands' grip anchors land on Combat's hand targets
    const CB = GTP.Combat, gap = (node, tg) => { if (!tg) return 9; const w = new THREE.Vector3(); node.getWorldPosition(w); return +w.distanceTo(new THREE.Vector3(tg.x, tg.y, tg.z)).toFixed(3); };
    const a = mk(-1, 0); a.weapon = 'rifle'; a.weapons = { fist: Infinity, rifle: 90 }; a.aiming = true; a.yaw = 0; a.aimYaw = 0; a.snap();
    for (let k = 0; k < 30; k++) { GTP.game.advance(1 / 60); sync(); }
    const held = a._held, gR = a.mesh.getObjectByName('handR'), gL = a.mesh.getObjectByName('handL');
    a.mesh.updateMatrixWorld(true);
    const v = new THREE.Vector3(1, 0, 0), q = new THREE.Quaternion(); held.getWorldQuaternion(q); v.applyQuaternion(q);
    const f = GTP.util.yawToDir(a.yaw), grip = new THREE.Vector3(); held.getWorldPosition(grip);
    let ht = CB.handTargets(a);
    // the left hand on the gun: its distance from the line through the grip and the support point, between the two
    const onGun = (ht, b) => { if (!ht || !ht.left) return 9; const g0 = new THREE.Vector3(ht.right.x, ht.right.y, ht.right.z), g1 = new THREE.Vector3(ht.left.x, ht.left.y, ht.left.z), w = new THREE.Vector3(); gL.getWorldPosition(w); const d = g1.clone().sub(g0), l = d.length(); d.normalize(); const tt = w.clone().sub(g0).dot(d); const c = g0.clone().addScaledVector(d, Math.max(0.1 * l, Math.min(l, tt))); return +w.distanceTo(c).toFixed(3); };
    out.rifle = { onRoot: held.parent === a.mesh, raised: ht && ht.raised, dot: +(v.x * f.x + v.z * f.z).toFixed(2), y: +v.y.toFixed(2), gripY: +(grip.y - a.y).toFixed(2), right: gap(gR, ht && ht.right), left: onGun(ht), leftTarget: gap(gL, ht && ht.left) };
    // aim pitch up (Combat aims the gun by ped._aimPitch): the barrel rises and the hands follow it
    a._aimPitch = 0.6; for (let k = 0; k < 4; k++) sync();
    a.mesh.updateMatrixWorld(true); held.getWorldQuaternion(q); const vu = new THREE.Vector3(1, 0, 0).applyQuaternion(q); ht = CB.handTargets(a);
    out.pitch = { up: +vu.y.toFixed(2), right: gap(gR, ht && ht.right), left: onGun(ht) };
    a._aimPitch = 0;
    // a reload drops to low ready with the support hand on the magazine
    const lh = new THREE.Vector3(); sync(); a.mesh.updateMatrixWorld(true); gL.getWorldPosition(lh);
    a.reloadT = 0.5; a.reloadTotal = 1; sync(); a.mesh.updateMatrixWorld(true); ht = CB.handTargets(a);
    const lh2 = new THREE.Vector3(); gL.getWorldPosition(lh2); out.reload = { moved: +lh2.distanceTo(lh).toFixed(2), left: gap(gL, ht && ht.left), right: gap(gR, ht && ht.right) };
    a.reloadT = 0;
    // pistol aim: both hands forward on the grip (the left cupping under it)
    const ps = mk(-2, 0); ps.weapon = 'pistol'; ps.weapons = { fist: Infinity, pistol: 40 }; ps.aiming = true; ps.yaw = 0; ps.aimYaw = 0; ps.snap();
    for (let k = 0; k < 30; k++) { GTP.game.advance(1 / 60); sync(); }
    ps.mesh.updateMatrixWorld(true); const pR = ps.mesh.getObjectByName('handR'), pL = ps.mesh.getObjectByName('handL'), pr = new THREE.Vector3(), pl = new THREE.Vector3(); pR.getWorldPosition(pr); pL.getWorldPosition(pl);
    const pt = CB.handTargets(ps);
    out.pistol = { fwdR: +((pr.x - ps.x) * f.x + (pr.z - ps.z) * f.z).toFixed(2), hands: +pr.distanceTo(pl).toFixed(2), y: +(pr.y - ps.y).toFixed(2), right: gap(pR, pt && pt.right), left: gap(pL, pt && pt.left) };
    // melee jab: the right hand reaches forward at mid-swing
    const m = mk(2, 0); m.yaw = 0; m.snap(); m.pose = { melee: { type: 'light', t: 0.35 } }; sync(); m.mesh.updateMatrixWorld(true);
    const mh = new THREE.Vector3(); m.mesh.userData.bones.handR.getWorldPosition(mh); out.jab = +((mh.x - m.x) * f.x + (mh.z - m.z) * f.z).toFixed(2);
    // cover crouch lowers the hips
    const c = mk(3, 0); c.pose = { cover: { side: 'left', high: false, peek: false } }; for (let k = 0; k < 20; k++) { GTP.game.advance(1 / 60); sync(); }
    out.crouch = +(c.mesh.userData.bones.hips.position.y - c.mesh.userData.rest[0][1]).toFixed(2);
    // knockdown: the mesh tilts with ped.tilt; a corpse fades (Combat scales the mesh)
    const k = mk(0, 2); k.tilt = -Math.PI / 2; k.knockedDown = true; sync(); out.tilt = +k.mesh.rotation.x.toFixed(2);
    // swim: arms over the head
    const s = mk(0, -2); s.swimming = true; s.speed = 1; s.animPhase = 1; sync(); out.swim = +s.mesh.userData.bones.armL.rotation.x.toFixed(2);
    // first person hides the player; far peds are culled; LODs swap with distance
    p.cameraMode = 'first'; sync(); out.fpHidden = !p.mesh.visible; p.cameraMode = 'chase'; sync(); out.fpBack = p.mesh.visible;
    GTP.game.debug.freeCam(p.x + 25, p.y + 2, p.z, p.x, p.y + 1, p.z); sync(); out.lodMid = w.mesh.userData.lod;
    GTP.game.debug.freeCam(p.x + 70, p.y + 2, p.z, p.x, p.y + 1, p.z); sync(); out.lodFar = w.mesh.userData.lod;
    GTP.game.debug.freeCam(p.x + 300, p.y + 2, p.z, p.x, p.y + 1, p.z); sync(); out.culled = !w.mesh.visible;
    GTP.game.debug.freeCam(p.x, p.y + 1.7, p.z + 6, p.x, p.y + 1, p.z); sync(); out.lodNear = w.mesh.userData.lod;
    // the cutscene pose wrapper still drives the alias pivots on top of the animation
    if (GTP.Cutscenes && GTP.Cutscenes.pose) { GTP.Cutscenes.pose(w, 'wave'); sync(); out.wave = +B.armR.rotation.x.toFixed(2); GTP.Cutscenes.pose(w, null); }
    out.parts = !!(w._parts && w._parts.armR && w._parts.legL);
    // a corpse: dies, fades (no errors through the fade)
    const d = mk(-3, 2); d.applyDamage(999, null, 'test'); for (let i = 0; i < 40; i++) { GTP.game.advance(0.25); sync(); }
    out.dead = !d.alive;
    return out;
  });
  console.log('  anim: ' + JSON.stringify(anim));
  t.assert(Math.max(...anim.walk.legs) > 0.2 && Math.min(...anim.walk.legs) < -0.2, 'walking swings the legs: ' + anim.walk.legs);
  t.assert(anim.run.lean < -0.08 && anim.run.elbow > 1.0, 'running leans and bends the elbows: ' + JSON.stringify(anim.run));
  t.assert(anim.rifle.onRoot && anim.rifle.raised && anim.rifle.dot > 0.9 && Math.abs(anim.rifle.y) < 0.25 && anim.rifle.gripY > 1.1 && anim.rifle.gripY < 1.7, 'aimed rifle: placed by Combat, barrel along the facing at chest height: ' + JSON.stringify(anim.rifle));
  t.assert(anim.rifle.right < 0.06 && anim.rifle.left < 0.06, 'both hands on the rifle (right on the grip, left on the handguard): ' + JSON.stringify(anim.rifle));
  t.assert(anim.pitch.up > 0.35 && anim.pitch.right < 0.08 && anim.pitch.left < 0.08, 'aiming up: the barrel rises and the hands follow: ' + JSON.stringify(anim.pitch));
  t.assert(anim.reload.moved > 0.1 && anim.reload.left < 0.08 && anim.reload.right < 0.08, 'reload: low ready, the support hand on the magazine: ' + JSON.stringify(anim.reload));
  t.assert(anim.pistol.fwdR > 0.35 && anim.pistol.hands < 0.15 && anim.pistol.y > 1.1 && anim.pistol.right < 0.06 && anim.pistol.left < 0.06, 'pistol held out in both hands on the grip: ' + JSON.stringify(anim.pistol));
  t.assert(anim.jab > 0.4, 'a jab reaches forward: ' + anim.jab);
  t.assert(anim.crouch < -0.25, 'low cover crouches: ' + anim.crouch);
  t.assert(Math.abs(anim.tilt + Math.PI / 2) < 0.01, 'knockdown tilt on the mesh: ' + anim.tilt);
  t.assert(Math.abs(anim.swim) > 0.5, 'swim strokes: ' + anim.swim);
  t.assert(anim.fpHidden && anim.fpBack, 'first person hides the player');
  t.assert(anim.lodNear === 0 && anim.lodMid === 1 && anim.lodFar === 2 && anim.culled, 'LOD by distance and the pedDraw cull: ' + JSON.stringify([anim.lodNear, anim.lodMid, anim.lodFar, anim.culled]));
  t.assert(anim.parts && (anim.wave == null || anim.wave > 2), 'v0.2 _parts handles and the cutscene wave pose: ' + anim.wave);
  t.assert(anim.dead, 'the corpse path runs');

  // ---- vehicles: nine classes, LODs, groups, seats, mods; a seated driver
  const veh = await page.evaluate(() => {
    const out = {}, M = GTP.Models;
    ['sedan', 'sports', 'suv', 'truck', 'van', 'cop', 'taxi', 'bus', 'bike'].forEach((c) => {
      const r = GTP.Assets.vehicleGeometry(c), spec = GTP.C.VEHICLES[c];
      out[c] = { tris: r.tris, groups: r.body.groups.map((g) => g.materialIndex), wheels: r.wheelLods.map((w) => w.index.count / 3), seats: r.seats ? r.seats.length : 0, wp: !!(r.wheelPoint || r.bars), size: r.size.length === spec.length && r.size.width === spec.width, offs: r.wheelOffsets.length, eye: r.lightPoints.eye.y > 0.5 };
    });
    const base = GTP.Assets.vehicleGeometry('sports'), modded = GTP.Assets.vehicleGeometry('sports', null, { wheels: 4, spoiler: 2, tint: 3, paint: { secondary: '#111111', finish: 'matte' } });
    out.mods = { differ: base !== modded, wheel: base.wheelLods[0].index.count !== modded.wheelLods[0].index.count, tint: modded.mods.tint === 3, key: modded.modsKey };
    out.wrap = GTP.Assets.vehicleGeometry('van', 'pod').body.groups.some((g) => g.materialIndex === 7);
    return out;
  });
  console.log('  vehicles: ' + JSON.stringify(veh));
  ['sedan', 'sports', 'suv', 'truck', 'van', 'cop', 'taxi', 'bus', 'bike'].forEach((c) => {
    const v = veh[c];
    t.assert(v.tris[0] > v.tris[1] && v.tris[1] > v.tris[2] && v.tris[0] < 16000, c + ' LODs: ' + v.tris);
    t.assert(v.groups.indexOf(3) >= 0 && v.groups.indexOf(4) >= 0 && (c === 'bike' || (v.groups.indexOf(2) >= 0 && v.groups.indexOf(8) >= 0)), c + ' carries lamps, glass and chrome: ' + v.groups);
    t.assert(v.seats >= 1 && v.wp && v.size && v.eye && v.wheels[0] > v.wheels[2], c + ' seats, wheel point, size, wheel LODs');
  });
  t.assert(veh.cop.groups.indexOf(5) >= 0 && veh.cop.groups.indexOf(6) >= 0, 'cop light bar groups');
  t.assert(veh.mods.differ && veh.mods.wheel && veh.mods.tint, 'mods change the geometry: ' + JSON.stringify(veh.mods));
  t.assert(veh.wrap, 'the pod van carries its wrap group');

  const live = await page.evaluate(() => {
    const E = GTP.Entities, p = GTP.game.player, W = GTP.World;
    const v = new GTP.Vehicle({ type: 'sedan', x: p.x + 6, z: p.z - 8, color: '#3d6fcf' }); v.y = W.heightAt(v.x, v.z, p.y); v.snap(); E.add(v);
    const d = new GTP.Ped({ x: v.x, z: v.z, look: { skin: 5, hair: 'afro', shirt: '#2f6a4a', pants: '#333333' }, persistent: true }); E.add(d); d.enterVehicle(v, 0); d._finishEnter();
    GTP.game.debug.freeCam(v.x - 5, v.y + 1.6, v.z + 1, v.x, v.y + 0.8, v.z);
    GTP.game.advance(0.1); E.sync(1);
    const r = { seated: d.inVehicle === v, visible: d.mesh.visible, hipAboveSeat: +(d.mesh.position.y + 0.96 - v.y).toFixed(2), bodyLod: v.mesh.userData.lodI };
    v.mods = { wheels: 2, spoiler: 1, tint: 2, paint: { finish: 'matte', primary: '#ff3300' } }; E.sync(1);
    r.modded = v.mesh.userData.rec.modsKey === GTP.Models.modsKey(v.mods); r.rough = +v.mesh.userData.paint.roughness.toFixed(2);
    GTP.game.debug.freeCam(v.x + 120, v.y + 5, v.z, v.x, v.y, v.z); E.sync(1); r.farLod = v.mesh.userData.lodI; r.farDriver = d.mesh.visible;
    return r;
  });
  console.log('  live vehicle: ' + JSON.stringify(live));
  t.assert(live.seated && live.visible && live.hipAboveSeat > 0.4 && live.hipAboveSeat < 0.75, 'a driver sits visibly in the seat: ' + JSON.stringify(live));
  t.assert(live.modded && live.rough > 0.7, 'vehicle.mods reach the live mesh: ' + JSON.stringify(live));
  t.assert(live.farLod === 2 && !live.farDriver, 'far cars drop to LOD 2 and hide their occupants');

  // ---- review regressions: a detach + re-attach keeps the look referenced; far peds' guns keep their pose between
  // animated frames; passengers keep distinct seats after one leaves; mods {} shares the base record
  const reg = await page.evaluate(() => {
    const E = GTP.Entities, p = GTP.game.player, W = GTP.World, R = GTP.Render, M = GTP.Models, out = {};
    const look = { skin: 4, hair: 'bob', hairColor: '#123456', shirt: '#654321', pants: '#111111', extra: 'none' };
    const a = new GTP.Ped({ x: p.x + 2, z: p.z + 3, look, persistent: true }); a.y = W.heightAt(a.x, a.z, p.y); a.snap(); E.add(a);
    const ud = a.mesh.userData, refs0 = ud.entry.refs;
    R.detach(a); R.attach(a);
    out.refs = [refs0, ud.entry.refs, ud.released];
    // far gun: aim a rifle at LOD 2 and check the gun's local rotation on an animated and a skipped frame
    const f = new GTP.Ped({ x: p.x + 60, z: p.z, look: { skin: 2, hair: 'short' }, persistent: true }); f.y = W.heightAt(f.x, f.z, p.y); f.snap(); E.add(f);
    f.weapon = 'rifle'; f.weapons = { fist: Infinity, rifle: 90 }; f.aiming = true; GTP.game.debug.freeCam(p.x, p.y + 2, p.z, f.x, f.y + 1, f.z);
    const qs = [];
    for (let i = 0; i < 6; i++) { GTP.game.advance(1 / 60); E.sync(1); if (f._held) qs.push(f._held.quaternion.toArray().map((v) => +v.toFixed(3)).join(',')); }
    out.farLod = f.mesh.userData.lod; out.gunStable = new Set(qs).size === 1; out.gunOnRoot = !!(f._held && f._held.parent === f.mesh);
    // seats: two passengers, the first leaves, a third boards: all three occupants on distinct seats
    const v = new GTP.Vehicle({ type: 'sedan', x: p.x - 8, z: p.z + 3 }); v.y = W.heightAt(v.x, v.z, p.y); v.snap(); E.add(v);
    const mk = () => { const q = new GTP.Ped({ x: v.x, z: v.z, look: { skin: 3, hair: 'short' }, persistent: true }); E.add(q); return q; };
    const d = mk(), b1 = mk(), b2 = mk(), b3 = mk();
    v.enter(d, 0); v.enter(b1, 1); v.enter(b2, 1); v.exit(b1); v.enter(b3, 1);
    GTP.game.debug.freeCam(v.x - 4, v.y + 1.6, v.z + 2, v.x, v.y + 0.8, v.z); GTP.game.advance(0.05); E.sync(1);
    const pos = [d, b2, b3].map((q) => q.mesh.position.x.toFixed(2) + ',' + q.mesh.position.z.toFixed(2));
    out.seats = pos; out.seatsDistinct = new Set(pos).size === 3;
    out.sameRec = GTP.Assets.vehicleGeometry('sedan', null, {}) === GTP.Assets.vehicleGeometry('sedan');
    return out;
  });
  console.log('  review regressions: ' + JSON.stringify(reg));
  t.assert(reg.refs[1] === reg.refs[0] && reg.refs[2] === false, 'detach + attach keeps the look referenced: ' + JSON.stringify(reg.refs));
  t.assert(reg.farLod === 2 && reg.gunStable && reg.gunOnRoot, 'a far ped holds its gun steady: ' + JSON.stringify(reg));
  t.assert(reg.seatsDistinct, 'occupants keep distinct seats: ' + reg.seats.join(' | '));
  t.assert(reg.sameRec, 'mods {} shares the base vehicle record');

  // ---- a crowd: 60 peds and 24 cars around the camera stay inside the draw and CPU budgets
  const crowd = await page.evaluate(() => {
    const E = GTP.Entities, p = GTP.game.player, W = GTP.World, R = GTP.rng;
    const pools = GTP.Content.looks.byDistrict.downtown;
    for (let i = 0; i < 60; i++) {
      const look = { skin: 1 + (i % 6), hair: pools.hair[i % pools.hair.length], hairColor: pools.hairColor[i % pools.hairColor.length], shirt: pools.shirt[i % pools.shirt.length], pants: pools.pants[i % pools.pants.length], hat: pools.hat[i % pools.hat.length], glasses: pools.glasses[i % pools.glasses.length], extra: pools.extra[i % pools.extra.length], tie: pools.tie[i % pools.tie.length] };
      const e = new GTP.Ped({ x: p.x + R.range(-40, 40), z: p.z + R.range(-40, 40), look }); e.y = W.heightAt(e.x, e.z, p.y); e.snap(); E.add(e);
    }
    const types = ['sedan', 'sports', 'suv', 'truck', 'van', 'cop', 'taxi', 'bus'];
    for (let i = 0; i < 24; i++) { const v = new GTP.Vehicle({ type: types[i % 8], x: p.x + R.range(-50, 50), z: p.z + R.range(-50, 50) }); v.y = W.heightAt(v.x, v.z, p.y); v.snap(); E.add(v); }
    GTP.game.debug.followCam(); GTP.game.advance(0.5);
    const t0 = performance.now(); for (let i = 0; i < 20; i++) E.sync(1); const syncMs = (performance.now() - t0) / 20;
    GTP.game.render();
    // despawn the crowd: their looks are released and idle geometry beyond the LRU is disposed
    E.list.forEach((e) => { if (e.kind === 'ped' && !e.persistent) e.removed = true; }); GTP.game.advance(0.1);
    const after = GTP.Models.stats();
    return { after, syncMs: +syncMs.toFixed(2), calls: GTP.Render.stats.calls, tris: GTP.Render.stats.triangles, peds: E.list.filter((e) => e.kind === 'ped').length, stats: GTP.Models.stats() };
  });
  console.log('  crowd: ' + JSON.stringify(crowd));
  t.assert(crowd.calls < 700, 'draw calls bounded with a crowd: ' + crowd.calls);
  t.assert(crowd.after.idle <= 48 && crowd.after.disposed > 0, 'released looks are bounded by the LRU: ' + JSON.stringify(crowd.after));
  t.assert(crowd.syncMs < 25, 'entity sync (animation) cost per frame: ' + crowd.syncMs + ' ms');

  // ---- screenshots: a line-up close and far, day and night, the actions, the cars
  const shots = await page.evaluate(() => {
    const E = GTP.Entities, p = GTP.game.player, W = GTP.World;
    E.list.forEach((e) => { if (e !== p && (e.kind === 'ped' || e.kind === 'vehicle') && !e.persistent) e.destroy(); });
    E.list.forEach((e) => { if (e !== p && e.kind === 'vehicle') e.destroy(); });
    return { x: p.x, y: W.heightAt(p.x, p.z, p.y), z: p.z };
  });
  await page.evaluate((o) => {
    const E = GTP.Entities, W = GTP.World, p = GTP.game.player;
    const looks = [{ skin: 1, hair: 'long', hairColor: '#b58a3c', shirt: '#c94040', pants: '#2a2f4a', glasses: 'round', extra: 'lanyard' }, { skin: 5, hair: 'afro', hairColor: '#111111', shirt: '#2f6a4a', pants: '#b8a888', extra: 'phone' }, { skin: 3, hair: 'bun', hairColor: '#2a1a0a', shirt: '#2b2b3a', pants: '#2b2b3a', glasses: 'thick', tie: 'blue' }, { skin: 6, hair: 'short', shirt: '#1f2a3a', pants: '#1f2a3a', hat: 'cap', hatColor: '#1f2a3a', glasses: 'aviator', badge: '#e8b53a', role: 'cop' }, { skin: 2, hair: 'mohawk', hairColor: '#ff3fa4', shirt: '#ffd400', pants: '#1a1a1a', glasses: 'shades' }, { skin: 4, hair: 'bob', hairColor: '#7a5c3a', shirt: '#8a94c8', pants: '#3a4a6a', hat: 'beanie', hatColor: '#2f9e6a' }];
    window._cs = looks.map((look, i) => { const e = new GTP.Ped({ x: o.x - 4 + i * 1.6, z: o.z + 15, look, persistent: true }); e.y = W.heightAt(e.x, e.z, o.y); e.yaw = 0; e.snap(); E.add(e); e.ai = { mode: 'mission', mission: 'cutscene', ambient: false }; e.update = function (dt) { this.age += dt; this.animTime += dt; }; return e; });
    _cs[2].weapon = 'pistol'; _cs[2].aiming = true; _cs[2].aimYaw = 0; _cs[3].weapon = 'rifle'; _cs[3].aiming = true; _cs[3].aimYaw = 0;
    p.x = o.x + 6; p.z = o.z + 15; p.yaw = 0; p.snap(); p.update = function (dt) { this.age += dt; this.animTime += dt; }; p.state = 'walk'; p.speed = 1.6;
    const v = new GTP.Vehicle({ type: 'sports', x: o.x, z: o.z + 20.5, color: '#ff2d6f' }); v.y = W.heightAt(v.x, v.z, o.y); v.yaw = Math.PI / 2; v.snap(); E.add(v);
    const v2 = new GTP.Vehicle({ type: 'cop', x: o.x - 6, z: o.z + 20.5 }); v2.y = W.heightAt(v2.x, v2.z, o.y); v2.yaw = Math.PI / 2; v2.snap(); E.add(v2);
    for (let i = 0; i < 40; i++) { GTP.game.advance(1 / 60); p.animPhase += 0.1; E.sync(1); }
  }, shots);
  const o = shots;
  const views = [
    { n: 'characters_close', cam: [o.x - 0.5, o.y + 1.6, o.z + 9.8], look: [o.x - 0.5, o.y + 1.05, o.z + 15], clock: 13 },
    { n: 'characters_face', cam: [o.x - 4 + 0.08, o.y + 1.68, o.z + 14.3], look: [o.x - 4, o.y + 1.63, o.z + 15], clock: 13 },
    { n: 'characters_far', cam: [o.x + 30, o.y + 2.5, o.z + 6], look: [o.x - 2, o.y + 1, o.z + 15], clock: 13 },
    { n: 'characters_night', cam: [o.x - 0.5, o.y + 1.6, o.z + 9.8], look: [o.x - 0.5, o.y + 1.05, o.z + 15], clock: 22 },
    { n: 'characters_cars', cam: [o.x - 12, o.y + 1.7, o.z + 17.2], look: [o.x - 3, o.y + 0.7, o.z + 20.5], clock: 13 }
  ];
  for (const s of views) {
    await page.evaluate((s) => { GTP.game.debug.setClock(s.clock); GTP.game.advance(0.02); GTP.game.debug.freeCam(s.cam[0], s.cam[1], s.cam[2], s.look[0], s.look[1], s.look[2]); }, s);
    const file = await t.shot(page, s.n);
    const st = await t.pixelStats(page);
    console.log('  ' + s.n + ': ' + JSON.stringify(st) + ' -> ' + file);
    t.assert(st.colors > 300 && st.dark < 0.9 && st.bright < 0.9, s.n + ' is a real picture');
  }
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
