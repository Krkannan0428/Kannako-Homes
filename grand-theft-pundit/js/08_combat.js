/* Grand Theft Pundit: 08_combat.js
 * GTP.Combat: the twelve-weapon arsenal (GDD_EXPANSION.md §2): fist, folding table leg, megaphone,
 * pistol, The Rebuttal (revolver), SMG, The Monologue (rifle), shotgun, The Fact Checker (sniper),
 * hot take, hot mic and the Ratio Launcher. Magazines and reserves (player.ammo[id] = {mag, reserve};
 * player.weapons[id] stays the total for saves and the HUD), reloads (R or an empty magazine; shell by
 * shell for the shotgun), bloom and recoil (a camera kick through Render.rig.kick),
 * head / torso / legs hit zones with multipliers, hit markers and the kill confirmation as 'hitmarker' events,
 * shell casings (a 'casing' fx type registered with Render.fx: one InstancedMesh), the muzzle flash point light
 * (Render.muzzleLight), aim mode (over-the-shoulder rig, lock-on in a 40-degree cone, Tab cycles), the
 * sniper scope (Combat.scope, first-person rig with fov 30 / 15 and breath sway), the weapon wheel
 * (Combat.wheel, hold Tab while not aiming, the world at 0.2x), drive-bys (pistol / revolver / SMG /
 * shotgun with aim held; thrown things from the window without it), GTA III style auto-target without
 * aim, hitscan with building occlusion, the hottake (lobbed, 5 m stun), the hot mic (lobbed, bounces,
 * a 2.5 s fuse that can be cooked in the hand, a 6 m blast), the rocket (40 m/s, straight for 3 s, a trail,
 * an 8 m blast that flips cars), melee with a lunge (the table leg's TABLE FLIP), damage flashes, ped
 * death, vehicle bullet damage, cops shooting back (revolvers at 3+ stars, rifles for SWAT), the RATIO'D
 * and DEPLATFORMED flows, pickups (sponsor bottles, cash, weapon crates), the Both Sides Arms shop API
 * (Combat.shop) with green door markers at every gunshop landmark, and the weapon held in the ped's hand.
 *
 * Hooks used by other modules:
 *   Combat.fire(ped, weaponId)              Player.control (shoot held) and AI copShoot
 *   Combat.reload(ped)                      a reload (the player also presses R: the 'reload' action)
 *   Combat.onPlayerDeath(p, src, type)      Player.die -> state 'wasted', hospital respawn after RESPAWN_DELAY
 *   Combat.onPlayerBusted(p, cop)           AI bust() -> state 'busted', precinct respawn, $500 fine
 *   Combat.projectileHit(proj, target)      Projectile.hit (hottake stun, hot mic blast, rocket blast)
 *   Combat.collectPickup(pickup, player)    Pickup.collect (returns false for mission pickups)
 *   Combat.pickupMesh(pickup)               Render.buildEntityMesh
 *   Combat.aim / scope / wheel / shop / hud()   UI: crosshair, lock reticle, weapon + ammo, the scope vignette, the wheel, the shop
 *   Combat.drawAimOverlay(ctx, w, h)        default crosshair/reticle drawer the UI may call
 *   Events: weapon, hitmarker {kill, zone, target, weapon}, reload {id, phase}, scope {active, zoom}, wheel {open, index, id},
 *           shop:open {landmark, store}, shop:close, shop:buy {item, price}, shop:range
 *
 * Patches this file applies to surfaces it does not own (listed for the integration pass):
 *   Render.rig.update (recoil kick, scope fov / sway / look sensitivity), Render.fx.add/update/sync/clear ('casing'),
 *   Player.prototype.cycleWeapon (ORDER, scope zoom, wheel), Ped.prototype.syncMesh (the reload pose),
 *   Game.prototype.step (the wheel's 0.2x time scale).
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util;
  var scratch = [], scratch2 = [], scratch3 = [], candBuf = [];
  var _dir = null;   // THREE.Vector3 scratch (THREE is loaded before us)
  var RESPAWN_DELAY = 3, DEG = Math.PI / 180;

  // ------------------------------------------------------------- weapons --
  // dmg per hit (shotgun: per volley, split over the pellets), range m, rate shots/s, mag / reserve rounds (no mag: ammo is the
  // reserve), reload s, spread = base cone half-angle (rad), bloom {add per shot, max, decay per s}, recoil = camera pitch kick
  // (degrees; autos per shot), knock m/s impulse on a hit, vehicleMul scales damage to cars, price = the Both Sides Arms list.
  var WEAPONS = {
    fist:      { name: 'Fists', cls: 'melee', dmg: 12, range: 1.7, rate: 2.5, ammo: Infinity, melee: true, lunge: 2.4, knock: 3.2, price: 0 },
    tableleg:  { name: 'Folding Table Leg', cls: 'melee', dmg: 28, range: 2.1, rate: 1.6, ammo: Infinity, melee: true, lunge: 2.6, knock: 4.5, flipWindow: 0.6, vehicleDmg: 6, price: 150 },
    megaphone: { name: 'Megaphone', cls: 'special', dmg: 0, range: 6, rate: 1.2, cone: true, arc: Math.PI / 3, push: 18, heat: 1, reserve: 40, price: 300 },
    pistol:    { name: 'Pistol', cls: 'pistol', dmg: 18, range: 35, rate: 4, mag: 12, reserve: 120, reload: 1.2, spread: 0.012, bloom: { add: 0.008, max: 0.04, decay: 0.10 }, recoil: 1.2, vehicleMul: 0.55, knock: 1.6, driveBy: true, price: 450 },
    revolver:  { name: 'The Rebuttal', cls: 'pistol', dmg: 40, range: 45, rate: 1.6, mag: 6, reserve: 60, reload: 2.0, spread: 0.006, bloom: { add: 0.010, max: 0.03, decay: 0.08 }, recoil: 2.4, vehicleMul: 0.7, knock: 3.0, headMul: 3, floors: true, driveBy: true, price: 900 },
    smg:       { name: 'SMG', cls: 'smg', dmg: 9, range: 30, rate: 11, mag: 30, reserve: 240, reload: 1.6, spread: 0.04, bloom: { add: 0.004, max: 0.09, decay: 0.14 }, recoil: 0.35, auto: true, vehicleMul: 0.5, knock: 0.9, driveBy: true, price: 1400 },
    rifle:     { name: 'The Monologue', cls: 'rifle', dmg: 24, range: 60, rate: 5.5, mag: 30, reserve: 180, reload: 2.0, spread: 0.018, aimSpread: 0.009, bloom: { add: 0.006, max: 0.055, decay: 0.12 }, recoil: 0.5, auto: true, pointShots: 3, vehicleMul: 0.65, knock: 1.2, price: 2400 },
    shotgun:   { name: 'Shotgun', cls: 'shotgun', dmg: 45, range: 12, rate: 1.1, mag: 6, reserve: 48, reload: 0.45, shellReload: true, pellets: 6, spread: 0.085, recoil: 3.0, vehicleMul: 0.6, knock: 2.5, driveBy: true, price: 1100 },
    sniper:    { name: 'The Fact Checker', cls: 'sniper', dmg: 120, range: 160, rate: 0.7, mag: 5, reserve: 30, reload: 2.6, spread: 0.08, scopedSpread: 0, recoil: 4.0, headMul: 3, vehicleMul: 1.0, scope: true, noAuto: true, casingDelay: 0.3, price: 4500 },
    hottake:   { name: 'Hot Take', cls: 'thrown', dmg: 12, range: 20, rate: 1, reserve: 12, lobbed: true, stun: 5, speed: 21, price: 90, pack: 3 },
    hotmic:    { name: 'Hot Mic', cls: 'thrown', dmg: 60, range: 24, rate: 0.8, reserve: 8, lobbed: true, speed: 18, fuse: 2.5, blast: 6, ring: 5, vehicleDmg: 180, restitution: 0.4, bounces: 2, price: 120, pack: 1 },
    ratio:     { name: 'Ratio Launcher', cls: 'launcher', dmg: 200, range: 120, rate: 0.5, mag: 1, reserve: 6, reload: 3.0, spread: 0, recoil: 6.0, rocket: true, speed: 40, blast: 8, noAuto: true, price: 7500 }
  };
  var ORDER = ['fist', 'tableleg', 'megaphone', 'pistol', 'revolver', 'smg', 'rifle', 'shotgun', 'sniper', 'hottake', 'hotmic', 'ratio'];
  // the story mission that puts each weapon on the shop wall (the launcher also opens at 40 Monday Memos: flags.memos40)
  var UNLOCK = { megaphone: 'm03_ratio', tableleg: 'm03b_range', pistol: 'm03b_range', revolver: 'm05b_provenance', rifle: 'm08b_jets', hottake: 'm09_balloon', hotmic: 'm09b_hotmic', smg: 'm11_trustless', shotgun: 'm11_trustless', sniper: 'm12b_scope', ratio: 'm13_thursday' };
  // Every sponsor product is the same bottle, relabeled (GDD 9).
  var SPONSOR = { health: 'CLARITY PELLETS', armor: 'NAP DYNASTY', pistol: 'OCTANE OPINIONS', megaphone: 'LOUD & CORRECT', hottake: 'FRESH TAKES', smg: '$PUNDIT', shotgun: 'DEFENSE SCOOTERS', mission: 'MERCH',
    tableleg: "FOUNDERS' COLLEGE", revolver: 'VAULTWRIGHT CAPITAL', rifle: 'BRAVADIA', sniper: 'FULCRUM', hotmic: 'THE YELL NETWORK', ratio: 'BOTH SIDES ARMS' };
  var SPONSOR_COLOR = { 'CLARITY PELLETS': '#2f9e6a', 'NAP DYNASTY': '#2c3e7a', 'OCTANE OPINIONS': '#ff7a00', 'LOUD & CORRECT': '#ff3fa4', 'FRESH TAKES': '#2ee6ff', '$PUNDIT': '#ff2d6f', 'DEFENSE SCOOTERS': '#3d6fcf', 'MERCH': '#e8b53a',
    "FOUNDERS' COLLEGE": '#8a4a3a', 'VAULTWRIGHT CAPITAL': '#e8b53a', 'BRAVADIA': '#3d6fcf', 'FULCRUM': '#8a94c8', 'THE YELL NETWORK': '#c94040', 'BOTH SIDES ARMS': '#3fd27f' };
  var SHOUTS = ['RESPECTFULLY,', 'READ THE MEMO!', 'RATIO!', 'CODE TAKES20!', 'I AM A JOURNALIST!'];
  var AI_DAMAGE_MUL = 0.45, AI_RIFLE_MUL = 0.4;   // cops hurt less than the player does (GDD_EXPANSION 6.9)
  var ZONE_MUL = { head: 2, torso: 1, legs: 0.7, prone: 1 };
  var DRIVEBY_REFUSAL = 'Not from the driver\'s seat. Respectfully.';

  // ------------------------------------------------------------- helpers --
  function W() { return GTP.World; }
  function E() { return GTP.Entities; }
  // Combat's randomness (spread, drops, fx jitter) runs on a seeded fork of GTP.rng so a
  // firefight never perturbs the city's deterministic spawn/traffic stream.
  var crng = null;
  function R() { return crng || (crng = GTP.rng.fork(0xC0B)); }
  function player() { return GTP.game ? GTP.game.player : null; }
  function simT() { return (GTP.game && GTP.game.time) ? GTP.game.time.t : 0; }
  function fx(o) { if (GTP.Render && GTP.Render.fx) { try { GTP.Render.fx.add(o); } catch (e) { /* fx optional */ } } }
  function sfx(name, x, z, gain) { if (GTP.Audio && GTP.Audio.play) { try { GTP.Audio.play(name, { x: x, z: z, gain: gain }); } catch (e) { /* audio optional */ } } }
  function toast(t) { if (GTP.UI && GTP.UI.toast) { try { GTP.UI.toast(t); } catch (e) { /* ui optional */ } } }
  function shake(a) { if (GTP.Render && GTP.Render.rig) GTP.Render.rig.shake(a); }
  function kick(pitchDeg, recover) {
    var rig = GTP.Render && GTP.Render.rig; if (!rig || !rig.kick || !pitchDeg) return;
    rig.kick(pitchDeg, pitchDeg * R().range(-0.2, 0.2), recover);
  }
  function wanted() { return GTP.AI && GTP.AI.wanted ? GTP.AI.wanted : null; }
  function alarm(x, z, r, src, mild) { if (GTP.AI && GTP.AI.alarm) { try { GTP.AI.alarm(x, z, r, src, mild); } catch (e) { /* ai optional */ } } }
  function emit(name, payload) { try { GTP.Events.emit(name, payload); } catch (e) { /* listeners report their own errors */ } }
  function isCopRole(p) { return !!p && (p.role === 'cop' || p.role === 'swat'); }
  function hostileRole(p) { return !!p && (p.role === 'cop' || p.role === 'swat' || p.role === 'thug' || (p.role === 'hoa' && GTP.Missions && GTP.Missions.state && GTP.Missions.state.flags && GTP.Missions.state.flags.hoa_enemy)); }
  function failText(kind) {
    var Rd = GTP.Content && GTP.Content.radio, ft = Rd && Rd.failTexts;
    return (ft && ft[kind]) || (kind === 'busted' ? 'DEPLATFORMED' : 'RATIO\'D');
  }
  function chestY(e) {
    if (e.kind === 'vehicle') return e.y + e.cls.height * 0.5;
    return e.y + ((e.knockedDown || !e.alive) ? 0.35 : (e.height || 1.8) * 0.58);
  }
  function losClear(ax, ay, az, bx, by, bz) {
    var dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 0.01) return true;
    return !W().raycastBuildings(ax, ay, az, dx / l, dy / l, dz / l, l);
  }
  function camYaw() { return GTP.Render && GTP.Render.rig ? GTP.Render.rig.yaw : 0; }
  function muzzle(ped) {
    var v = ped.inVehicle;
    if (v) {
      // out of the driver's window (a scooter: over the bars), toward the aim yaw
      var a = U.yawToDir(ped.aimYaw != null ? ped.aimYaw : v.yaw), side = v.localToWorld(v.type === 'bike' ? 0 : -(v.hw + 0.25), v.type === 'bike' ? -0.6 : -v.hl * 0.15);
      return { x: side.x + a.x * 0.3, y: v.y + v.cls.height * (v.type === 'bike' ? 1.1 : 0.72), z: side.z + a.z * 0.3 };
    }
    var f = U.yawToDir(ped.yaw), rx = -f.z, rz = f.x, sc = (ped.look && ped.look.scale) || 1;
    return { x: ped.x + rx * 0.28 * sc + f.x * 0.35, y: ped.y + 1.32 * sc, z: ped.z + rz * 0.28 * sc + f.z * 0.35 };
  }
  // pistol, revolver, SMG and shotgun fire from a driver's seat with aim held; thrown things go out of the window without it
  function driveByWeapon(id) { var w = WEAPONS[id]; return !!w && !!w.driveBy; }
  function jitter(d, spread) {
    if (!spread) return { x: d.x, y: d.y, z: d.z };
    var r = R(), ax = (r.random() - 0.5) * 2 * spread, ay = (r.random() - 0.5) * 2 * spread;
    // perpendicular basis
    var ux = -d.z, uz = d.x, ul = Math.sqrt(ux * ux + uz * uz) || 1; ux /= ul; uz /= ul;
    var vx = d.y * uz, vy = d.z * ux - d.x * uz, vz = -d.y * ux;
    var ox = d.x + ux * ax + vx * ay, oy = d.y + vy * ay, oz = d.z + uz * ax + vz * ay, l = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
    return { x: ox / l, y: oy / l, z: oz / l };
  }
  function raySphere(o, d, cx, cy, cz, r, maxT) {
    var lx = cx - o.x, ly = cy - o.y, lz = cz - o.z;
    var tca = lx * d.x + ly * d.y + lz * d.z;
    if (tca < 0) return -1;
    var d2 = lx * lx + ly * ly + lz * lz - tca * tca, r2 = r * r;
    if (d2 > r2) return -1;
    var t = tca - Math.sqrt(r2 - d2);
    if (t < 0) t = 0;
    return t > maxT ? -1 : t;
  }
  // the ped ray test: a head sphere (tested first), the upper body sphere, the lower sphere; a prone ped is one sphere
  var lastZone = 'torso';
  function rayPed(o, d, e, maxT) {
    var sc = (e.look && e.look.scale) || 1;
    if (e.knockedDown || !e.alive) { lastZone = 'prone'; return raySphere(o, d, e.x, e.y + 0.35 * sc, e.z, 0.6 * sc, maxT); }
    var h = raySphere(o, d, e.x, e.y + 1.55 * sc, e.z, 0.22 * sc, maxT);
    if (h >= 0) { lastZone = 'head'; return h; }
    var a = raySphere(o, d, e.x, e.y + 1.05 * sc, e.z, 0.5 * sc, maxT);
    var b = raySphere(o, d, e.x, e.y + 0.45 * sc, e.z, 0.42 * sc, maxT);
    if (a < 0) { lastZone = 'legs'; return b; }
    if (b < 0 || a <= b) { lastZone = 'torso'; return a; }
    lastZone = 'legs'; return b;
  }
  function rayVehicle(o, d, v, maxT) {
    var f = U.yawToDir(v.yaw), rx = -f.z, rz = f.x;
    var dx = o.x - v.x, dz = o.z - v.z;
    var ox = dx * rx + dz * rz, oy = o.y - v.y, oz = dx * f.x + dz * f.z;
    var ddx = d.x * rx + d.z * rz, ddz = d.x * f.x + d.z * f.z;
    return U.rayAabb(ox, oy, oz, ddx, d.y, ddz, -v.hw, -0.1, -v.hl, v.hw, v.cls.height, v.hl, maxT);
  }
  // Hitscan trace: buildings, the ground, peds (three spheres, a zone), vehicles (oriented box), the helicopter.
  // out = {t, x, y, z, entity, zone, building, ground, nx, ny, nz}
  function trace(o, d, range, shooter, out) {
    var Wd = W(), bestT = range, hitE = null, hb = null, zone = null;
    out.ground = false; out.nx = out.ny = out.nz = 0;
    var b = Wd.raycastBuildings(o.x, o.y, o.z, d.x, d.y, d.z, range);
    if (b) { bestT = b.t; hb = b; }
    if (d.y < -1e-4) {
      var ex = o.x + d.x * bestT, ez = o.z + d.z * bestT, gy = Wd.heightAt(ex, ez, o.y);
      var tg = (o.y - gy) / (-d.y);
      if (tg > 0 && tg < bestT) {
        var gx2 = o.x + d.x * tg, gz2 = o.z + d.z * tg; gy = Wd.heightAt(gx2, gz2, o.y); tg = (o.y - gy) / (-d.y);
        if (tg > 0 && tg < bestT) { bestT = tg; hb = null; out.ground = true; }
      }
    }
    var mx = o.x + d.x * bestT * 0.5, mz = o.z + d.z * bestT * 0.5;
    var list = E().hash.query(mx, mz, bestT * 0.5 + 4, scratch);
    for (var i = 0; i < list.length; i++) {
      var e = list[i], t = -1;
      if (e === shooter || e.removed || (shooter && e === shooter.inVehicle)) continue;   // never your own car
      if (e.kind === 'ped' || e.kind === 'player') { if (!e.alive || e.inVehicle) continue; t = rayPed(o, d, e, bestT); if (t >= 0 && t < bestT) zone = lastZone; }
      else if (e.kind === 'vehicle') { if (e.sinking) continue; t = rayVehicle(o, d, e, bestT); }
      else if (e.kind === 'heli') { if (e.down) continue; t = raySphere(o, d, e.x, e.y, e.z, 3.4, bestT); }
      else continue;
      if (t >= 0 && t < bestT) { bestT = t; hitE = e; hb = null; out.ground = false; if (e.kind !== 'ped' && e.kind !== 'player') zone = null; }
    }
    out.t = bestT; out.entity = hitE; out.building = hb; out.zone = hitE ? zone : null;
    out.x = o.x + d.x * bestT; out.y = o.y + d.y * bestT; out.z = o.z + d.z * bestT;
    if (hb) { out.nx = hb.normal.x; out.ny = hb.normal.y; out.nz = hb.normal.z; }
    return out;
  }
  var traceOut = { t: 0, x: 0, y: 0, z: 0, entity: null, zone: null, building: null, ground: false, nx: 0, ny: 0, nz: 0 };

  // ------------------------------------------------------------------ fx --
  function muzzleFlash(o, d) {
    var x = o.x + d.x * 0.3, y = o.y + d.y * 0.3, z = o.z + d.z * 0.3;
    fx({ type: 'explosion', x: x, y: y, z: z, size: 0.55, life: 0.07, color: 0xfff1b8 });
    fx({ type: 'spark', x: x, y: y, z: z, vx: d.x * 7, vy: d.y * 7 + 0.5, vz: d.z * 7, size: 0.32, life: 0.11, color: 0xffe08a });
    fx({ type: 'puff', x: x, y: y + 0.05, z: z, vx: d.x * 1.5, vy: 0.9, vz: d.z * 1.5, size: 0.28, life: 0.45, color: 0x9a9a9a });
  }
  function tracer(o, d, hit, id) {
    var life = id === 'smg' ? 0.07 : id === 'sniper' ? 0.14 : 0.09;
    fx({ type: 'tracer', x: o.x + d.x * 0.35, y: o.y + d.y * 0.35, z: o.z + d.z * 0.35, x2: hit.x, y2: hit.y, z2: hit.z, life: life });
    // a bright bolt racing down the line so the shot reads at a distance (the line itself is one pixel wide)
    var bs = id === 'sniper' ? 260 : 110, bl = Math.min(life, Math.max(0.03, (hit.t - 0.5) / bs));
    fx({ type: 'spark', x: o.x + d.x * 0.5, y: o.y + d.y * 0.5, z: o.z + d.z * 0.5, vx: d.x * bs, vy: d.y * bs, vz: d.z * bs, size: 0.42, life: bl, color: 0xfff6c8 });
  }
  function impactFx(hit, kind) {
    var r = R();
    if (kind === 'wall') {
      fx({ type: 'puff', x: hit.x + hit.nx * 0.12, y: hit.y + hit.ny * 0.12, z: hit.z + hit.nz * 0.12, size: 0.42, life: 0.35, color: 0xcfcac0, vy: 0.3 });
      for (var i = 0; i < 2; i++) fx({ type: 'spark', x: hit.x + hit.nx * 0.05, y: hit.y, z: hit.z + hit.nz * 0.05, vx: hit.nx * 3 + r.range(-2, 2), vy: r.range(1, 3), vz: hit.nz * 3 + r.range(-2, 2), size: 0.2, life: 0.25 });
    } else if (kind === 'ground') {
      fx({ type: 'puff', x: hit.x, y: hit.y + 0.1, z: hit.z, size: 0.5, life: 0.4, color: 0xb8ad98, vy: 0.8 });
      fx({ type: 'decal', x: hit.x, y: hit.y, z: hit.z, size: 0.28, size2: 0.28, life: 20, color: 0x2a2a2a });
    } else if (kind === 'ped') {
      fx({ type: 'puff', x: hit.x, y: hit.y, z: hit.z, size: 0.4, life: 0.3, color: 0xffe2c0, vy: 0.6 });
      fx({ type: 'spark', x: hit.x, y: hit.y, z: hit.z, vx: r.range(-1, 1), vy: 1.5, vz: r.range(-1, 1), size: 0.22, life: 0.2, color: 0xfff0a0 });
    } else if (kind === 'vehicle') {
      for (var k = 0; k < 2; k++) fx({ type: 'spark', x: hit.x, y: hit.y, z: hit.z, vx: r.range(-3, 3), vy: r.range(1, 3), vz: r.range(-3, 3), size: 0.22, life: 0.25 });
      fx({ type: 'puff', x: hit.x, y: hit.y, z: hit.z, size: 0.3, life: 0.3, color: 0xd8d8d8 });
    }
  }
  function textFx(text, x, y, z, color, life) { fx({ type: 'text', text: text, x: x, y: y, z: z, color: color || '#ff3fa4', life: life || 1.2 }); }
  // a shell casing out of the ejection port: to the right of the muzzle, up, gravity, one bounce (the Render.fx 'casing' type registered below)
  function ejectCasing(ped, o, d, id) {
    var rx = -d.z, rz = d.x, rl = Math.sqrt(rx * rx + rz * rz) || 1; rx /= rl; rz /= rl;
    var r = R(), red = id === 'shotgun';
    fx({ type: 'casing', x: o.x - d.x * 0.15, y: o.y - 0.02, z: o.z - d.z * 0.15, vx: rx * 2 + r.range(-0.4, 0.4) + (ped.vx || 0) * 0.5, vy: 2.5 + r.range(-0.3, 0.3), vz: rz * 2 + r.range(-0.4, 0.4) + (ped.vz || 0) * 0.5, life: 0.9, color: red ? 0xd8322a : 0xd8b24a, size: red ? 0.07 : 0.06 });
  }
  // ----------------------------------------------------------- targeting --
  // signed angle from dir (x,z) to (dx,dz): positive = counter-clockwise seen from above
  function signedAngle(dir, dx, dz) { return Math.atan2(dir.x * dz - dir.z * dx, dir.x * dx + dir.z * dz); }
  function validTarget(e, shooter, allowVehicles) {
    if (!e || e === shooter || e.removed) return false;
    if (e.kind === 'ped' || e.kind === 'player') return e.alive && !e.inVehicle;
    if (e.kind === 'vehicle') return !!allowVehicles && !e.wreck && !e.sinking && !!e.driver && !e.hasPlayer();
    if (e.kind === 'heli') return !!allowVehicles && !e.down && !e.leaving;
    return false;
  }
  // the five-star helicopter sits 30 m up: the lock-on and the hitscan reach for it (the sniper reaches it at full range anyway)
  function reachFor(e, range) { return e && e.kind === 'heli' ? range * 1.9 : range; }
  // best target in a cone: facing dir {x,z}, half arc (rad), range; LOS vs buildings
  function bestInCone(shooter, dir, halfArc, range, needLos, allowVehicles) {
    var list = E().hash.query(shooter.x, shooter.z, range + 1, scratch2), best = null, bestS = 1e9;
    var ox = shooter.x, oy = shooter.y + 1.3, oz = shooter.z;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!validTarget(e, shooter, allowVehicles)) continue;
      if (shooter.kind !== 'player' && e.kind !== 'player' && e !== shooter.aimTarget) continue;   // AI shooters only fight the player (or a set target)
      var dx = e.x - ox, dz = e.z - oz, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.3 || d > range + (e.kind === 'vehicle' ? e.hl : 0.4)) continue;
      if (Math.abs(e.y - shooter.y) > 6) continue;
      var ang = Math.abs(signedAngle(dir, dx / d, dz / d));
      if (ang > halfArc) continue;
      if (needLos && !losClear(ox, oy, oz, e.x, chestY(e), e.z)) continue;
      var s = d / range + ang * 1.2 - (hostileRole(e) ? 0.35 : 0);
      if (s < bestS) { bestS = s; best = e; }
    }
    return best;
  }
  // the camera ray through the screen centre, stopped by buildings, entities and the ground
  function cameraAimPoint(p, range) {
    var Rd = GTP.Render, cam = Rd && Rd.camera;
    if (!cam) { var f = U.yawToDir(p.yaw); return { x: p.x + f.x * range, y: p.y + 1.3, z: p.z + f.z * range, entity: null, zone: null }; }
    _dir = _dir || new THREE.Vector3();
    cam.getWorldDirection(_dir);
    var o = { x: cam.position.x, y: cam.position.y, z: cam.position.z }, d = { x: _dir.x, y: _dir.y, z: _dir.z };
    var dc = U.dist2d(o.x, o.z, p.x, p.z);
    // the sight reaches as far as a shot at the helicopter does (1.9x), so a helicopter under the crosshair is the hover target
    var h = trace(o, d, range * 1.9 + dc + 2, p, traceOut);
    return { x: h.x, y: h.y, z: h.z, entity: h.entity, zone: h.zone, dist: Math.max(0, h.t - dc) };
  }

  // the centre of a ped's hit zone (the sight rests on the sphere; the shot goes for its middle)
  function zonePoint(e, zone, dist) {
    var sc = (e.look && e.look.scale) || 1, h = zone === 'head' ? 1.55 : zone === 'torso' ? 1.05 : zone === 'legs' ? 0.45 : 0.35;
    return { x: e.x, y: e.y + h * sc, z: e.z, entity: e, zone: zone, dist: dist };
  }

  // ------------------------------------------------------------ aim mode --
  var aim = {
    active: false, target: null, hover: null, point: null, screen: null, targetScreen: null, weapon: 'fist', inRange: false, lockT: 0, zone: null, range: 0
  };
  function lockValid(p, e, cd, range) {
    if (!validTarget(e, p, true)) return false;
    var dx = e.x - p.x, dz = e.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > range * 1.3 || d < 0.3) return false;
    if (Math.abs(signedAngle(cd, dx / d, dz / d)) > 0.75) return false;
    return losClear(p.x, p.y + 1.3, p.z, e.x, chestY(e), e.z);
  }
  function lockCandidates(p, cd, range, halfArc, out, rocket) {
    var list = E().hash.query(p.x, p.z, range + 1, scratch2);
    out.length = 0;
    var ox = p.x, oy = p.y + 1.3, oz = p.z;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!validTarget(e, p, true)) continue;
      if (e.kind === 'vehicle' && !e.isPolice && !rocket) continue;   // the launcher locks any driven car; guns only cruisers
      var dx = e.x - ox, dz = e.z - oz, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.3 || d > range) continue;
      if (Math.abs(e.y - p.y) > (e.kind === 'heli' ? 60 : 6)) continue;
      var sa = signedAngle(cd, dx / d, dz / d);
      if (Math.abs(sa) > halfArc) continue;
      if (!losClear(ox, oy, oz, e.x, chestY(e), e.z)) continue;
      var bonus = (hostileRole(e) ? 0.35 : 0) + (rocket && (e.kind === 'vehicle' || e.kind === 'heli') ? 0.6 : 0);
      out.push({ e: e, score: d / range + Math.abs(sa) * 1.2 - bonus, ang: sa, d: d });
    }
    return out;
  }
  function updateAim(p, dt) {
    var In = GTP.Input, Rd = GTP.Render;
    var active = !!p.aiming && p.alive && !p.knockedDown && !p.swimming && (!p.inVehicle || driveByWeapon(p.weapon));
    aim.active = active; aim.weapon = p.weapon;
    if (!active) { aim.target = null; aim.hover = null; aim.point = null; aim.screen = null; aim.targetScreen = null; aim.zone = null; p.lockTarget = null; return; }
    var w = WEAPONS[p.weapon] || WEAPONS.fist;
    var range = w.melee ? 7 : Math.max(w.range, 8);
    var cd = U.yawToDir(Rd.rig.yaw);
    var cur = p.lockTarget;
    if (scope.active) cur = null;   // the scope is a pure sight: no lock-on magnetism
    else {
      if (cur && !lockValid(p, cur, cd, reachFor(cur, range))) cur = null;
      var cycle = In.pressed('lockOn') && !wheel.open;
      if (!cur || cycle) {
        var cands = lockCandidates(p, cd, range, 20 * Math.PI / 180, candBuf, !!w.rocket);
        if (cands.length) {
          if (cycle && cur) {
            cands.sort(function (a, b) { return a.ang - b.ang; });
            var idx = -1;
            for (var i = 0; i < cands.length; i++) if (cands[i].e === cur) { idx = i; break; }
            cur = cands[(idx + 1) % cands.length].e;
          } else {
            var best = cands[0];
            for (var k = 1; k < cands.length; k++) if (cands[k].score < best.score) best = cands[k];
            cur = best.e;
          }
          if (cur !== p.lockTarget) { aim.lockT = simT(); sfx('ui', p.x, p.z, 0.2); }
        } else if (cycle) cur = null;
      }
    }
    p.lockTarget = aim.target = cur;
    var pt, cp = cameraAimPoint(p, range);
    // a lock pulls the shot to the chest, unless the camera ray already rests on that target (then the player aims within it: the head
    // is where the take is). A ray resting on a ped's zone aims at that zone's centre, so the shot from the hand lands where the sight says.
    if (cp.entity && (cp.entity.kind === 'ped' || cp.entity.kind === 'player') && cp.zone) cp = zonePoint(cp.entity, cp.zone, cp.dist);
    if (cur) { if (cp.entity === cur) pt = cp; else pt = { x: cur.x, y: chestY(cur), z: cur.z, entity: cur, zone: 'torso', dist: U.dist2d(p.x, p.z, cur.x, cur.z) }; }
    else pt = cp;
    aim.point = pt; aim.hover = pt.entity || null; aim.zone = pt.entity ? pt.zone : null; aim.range = pt.dist || 0;
    aim.inRange = U.dist2d(p.x, p.z, pt.x, pt.z) <= w.range + 0.5;
    aim.screen = Rd.worldToScreen ? Rd.worldToScreen(pt.x, pt.y, pt.z) : null;
    aim.targetScreen = cur && Rd.worldToScreen ? Rd.worldToScreen(cur.x, chestY(cur) + (cur.kind === 'vehicle' ? 0 : 0.1), cur.z) : null;
    void dt;
  }

  // ---------------------------------------------------------------- ammo --
  // player.ammo[id] = {mag, reserve, total}; player.weapons[id] stays the total (saves, missions, pickups and tests write it),
  // so the split is reconciled against the total every time it is read: new rounds fill the magazine first, then the reserve.
  function ammoOf(p, id) {
    var w = WEAPONS[id]; if (!w || w.melee || !p.weapons) return null;
    p.ammo = p.ammo || {};
    var total = p.weapons[id];
    if (!(total > 0)) { delete p.ammo[id]; return null; }
    var a = p.ammo[id];
    if (total === Infinity) { if (!a) a = p.ammo[id] = {}; a.mag = w.mag || Infinity; a.reserve = Infinity; a.total = Infinity; return a; }
    if (!a) a = p.ammo[id] = { mag: 0, reserve: 0, total: 0 };
    if (!w.mag) { a.mag = 0; a.reserve = total; a.total = total; return a; }
    if (a.total !== total) {
      var delta = total - a.total;
      if (delta > 0) { var fill = Math.min(w.mag - a.mag, delta); a.mag += fill; a.reserve += delta - fill; }
      else { a.reserve = Math.max(0, a.reserve + delta); if (a.mag + a.reserve > total) a.mag = Math.max(0, total - a.reserve); a.reserve = total - a.mag; }
      a.total = total;
    }
    return a;
  }
  function setAmmo(p, id, mag, reserve) {
    var a = ammoOf(p, id) || (p.ammo[id] = { mag: 0, reserve: 0, total: 0 });
    a.mag = mag; a.reserve = reserve; a.total = mag + reserve; p.weapons[id] = a.total;
    if (!(a.total > 0)) { delete p.ammo[id]; }
    return a;
  }
  // give rounds to a weapon (a new one gets a full magazine first); capped at mag + reserve max; returns the rounds that fit
  function giveAmmo(p, id, n, cap) {
    var w = WEAPONS[id]; if (!w || !(n > 0)) return 0;
    if (w.melee) { p.weapons[id] = Infinity; return Infinity; }
    var have = p.weapons[id] > 0 ? p.weapons[id] : 0, max = (w.mag || 0) + (w.reserve || 0);
    var give = cap && max ? Math.max(0, Math.min(n, max - have)) : n;
    p.weapons[id] = have + give; ammoOf(p, id);
    return give;
  }

  // -------------------------------------------------------------- reload --
  function canReload(p, id) {
    var w = WEAPONS[id], a = ammoOf(p, id);
    return !!(w && w.mag && a && a.mag < w.mag && a.reserve > 0 && !(p.reloadT > 0));
  }
  function startReload(p, id) {
    if (!canReload(p, id)) return false;
    var w = WEAPONS[id];
    p.reloadT = w.reload; p.reloadTotal = w.reload; p.reloadId = id; p._reloadInCar = !!p.inVehicle;
    sfx('reload', p.x, p.z, w.cls === 'shotgun' ? 0.5 : w.cls === 'pistol' ? 1 : 0.8);
    emit('reload', { ped: p, id: id, phase: 'start', seconds: w.reload });
    return true;
  }
  function cancelReload(p) {
    if (!(p.reloadT > 0)) return;
    p.reloadT = 0; p.reloadTotal = 0;
    emit('reload', { ped: p, id: p.reloadId, phase: 'cancel' });
  }
  function tickReload(p, dt) {
    if (!(p.reloadT > 0)) return;
    if (p.weapon !== p.reloadId || !p.alive || p.knockedDown || !!p.inVehicle !== p._reloadInCar || p.entering) { cancelReload(p); return; }
    p.reloadT -= dt;
    if (p.reloadT > 0) return;
    var w = WEAPONS[p.reloadId], a = ammoOf(p, p.reloadId);
    if (!w || !a) { p.reloadT = 0; return; }
    if (w.shellReload) {
      // one shell at a time; another click if there is room and a shell left
      if (a.mag < w.mag && a.reserve > 0) { setAmmo(p, p.reloadId, a.mag + 1, a.reserve - 1); }
      if (a.mag < w.mag && a.reserve > 0) { p.reloadT += w.reload; sfx('reload', p.x, p.z, 0.5); return; }
    } else {
      var n = Math.min(w.mag - a.mag, a.reserve);
      setAmmo(p, p.reloadId, a.mag + n, a.reserve - n);
    }
    p.reloadT = 0;
    sfx('reloadDone', p.x, p.z, 0.6);
    emit('reload', { ped: p, id: p.reloadId, phase: 'done' });
  }

  // --------------------------------------------------------------- bloom --
  // the cone opens with each shot and closes while the trigger rests (twice as fast standing still and aiming)
  var bloom = { cone: 0, max: 0.04, k: 0, burst: 0, id: null, lastShot: -9 };
  function tickBloom(p, dt) {
    var w = WEAPONS[p.weapon];
    if (!w || !w.bloom) { bloom.cone = 0; bloom.k = 0; bloom.max = w && w.spread ? w.spread : 0; bloom.burst = 0; bloom.id = p.weapon; return; }
    if (bloom.id !== p.weapon) { bloom.id = p.weapon; bloom.cone = 0; bloom.burst = 0; }
    bloom.max = w.bloom.max;
    var now = simT();
    if (now - bloom.lastShot > Math.max(0.12, 1 / w.rate + 0.05)) {   // "not firing": the trigger has rested longer than the weapon's cadence
      var still = Math.abs(p.vx || 0) + Math.abs(p.vz || 0) < 0.3, rate = w.bloom.decay * (still && p.aiming ? 2 : 1);
      bloom.cone = Math.max(0, bloom.cone - rate * dt);
    }
    if (now - bloom.lastShot > 0.5) bloom.burst = 0;
    bloom.k = bloom.max > 0 ? bloom.cone / bloom.max : 0;
  }
  function playerSpread(p, w, locked) {
    var base = w.spread || 0;
    if (w.scope) base = scope.active ? (w.scopedSpread || 0) : w.spread;
    else if (w.aimSpread != null && p.aiming) base = w.aimSpread;
    if (w.pointShots && bloom.burst < w.pointShots) return base;   // the first rounds of a burst from rest: the "point"
    return base + bloom.cone * (locked ? 0.5 : 1);   // a lock-on is an aim assist: half the bloom lands on a locked target
  }
  function bloomShot(w) {
    if (!w.bloom) return;
    bloom.cone = Math.min(w.bloom.max, bloom.cone + w.bloom.add); bloom.lastShot = simT(); bloom.burst++;
    bloom.k = bloom.max > 0 ? bloom.cone / bloom.max : 0;
  }

  // --------------------------------------------------------- hit markers --
  var hitmark = { t: -9, kill: false, zone: null, target: null, weapon: null };
  function markHit(shooter, e, killed, zone, hit, id) {
    if (shooter.kind !== 'player') return;
    var now = simT(), fresh = now - hitmark.t < 0.4;
    hitmark.kill = !!killed || (hitmark.kill && fresh); hitmark.t = now; hitmark.zone = zone || null; hitmark.target = e; hitmark.weapon = id;
    if (killed) { hitmark.kill = true; sfx('confirm', shooter.x, shooter.z, 0.6); if (e.kind === 'ped') textFx(failText('wasted'), e.x, e.y + 2.0, e.z, '#ff3fa4', 1.0); }
    else if (hitmark._sfxT !== now) { hitmark._sfxT = now; sfx('hitmark', shooter.x, shooter.z, 0.35); }
    if (zone === 'head' && (e.kind === 'ped' || e.kind === 'player')) {
      textFx('WRITE THAT DOWN', e.x, e.y + 2.15, e.z, '#ffffff', 0.8);
      if (killed) { var r = R(); for (var i = 0; i < 5; i++) fx({ type: 'spark', x: hit.x, y: hit.y + 0.1, z: hit.z, vx: r.range(-3, 3), vy: r.range(2, 5), vz: r.range(-3, 3), size: 0.3, life: r.range(0.3, 0.6), color: 0xffd7a0 }); }   // the hat comes off
    }
    emit('hitmarker', { kill: !!killed, zone: zone || null, target: e, weapon: id, shooter: shooter });
  }

  // --------------------------------------------------------------- firing --
  // where this shot goes: muzzle origin, unit direction, the target entity (or null) and the aim point
  function aimContext(ped, w) {
    var o = muzzle(ped), target = null, pt = null, isPlayer = ped.kind === 'player';
    if (isPlayer) {
      if (ped.aiming) {
        if (!scope.active && aim.target && lockValid(ped, aim.target, U.yawToDir(camYaw()), reachFor(aim.target, Math.max(w.range, 8)))) target = aim.target;
        if (target && aim.point && aim.point.entity === target) pt = { x: aim.point.x, y: aim.point.y, z: aim.point.z };
        else if (target) pt = { x: target.x, y: chestY(target), z: target.z };
        else { var ap = aim.point || cameraAimPoint(ped, Math.max(w.range, 8)); pt = { x: ap.x, y: ap.y, z: ap.z }; }
        ped.aimYaw = camYaw();
      } else if (ped.inVehicle) {
        // out of the window without aim (a throw): along the camera's look
        var cy = camYaw(), cf = U.yawToDir(cy);
        ped.aimYaw = cy; o = muzzle(ped);
        pt = { x: o.x + cf.x * w.range * 0.6, y: o.y - 0.2, z: o.z + cf.z * w.range * 0.6 };
      } else {
        var fd = U.yawToDir(ped.yaw);
        target = w.noAuto ? null : bestInCone(ped, fd, w.melee ? 1.3 : 75 * Math.PI / 180, w.melee ? w.range + 0.6 : w.range, !w.melee, false);
        if (target) {
          pt = { x: target.x, y: chestY(target), z: target.z };
          var ty = U.dirToYaw(target.x - ped.x, target.z - ped.z);
          ped.yaw = ty; ped.aimYaw = ty;
          o = muzzle(ped);
        } else { ped.aimYaw = ped.yaw; pt = { x: o.x + fd.x * w.range, y: o.y - 0.12, z: o.z + fd.z * w.range }; }
      }
    } else {
      target = ped.aimTarget && !ped.aimTarget.removed ? ped.aimTarget : player();
      if (target && (!target.alive || (target.kind === 'player' && target.inVehicle && w.melee))) target = null;
      if (target) {
        var lead = w.melee ? 0 : 0.12;
        pt = { x: target.x + (target.vx || 0) * lead, y: chestY(target), z: target.z + (target.vz || 0) * lead };
        ped.aimYaw = U.dirToYaw(pt.x - ped.x, pt.z - ped.z);
        if (w.melee) ped.yaw = ped.aimYaw;
      } else { var f2 = U.yawToDir(ped.aimYaw || ped.yaw); pt = { x: o.x + f2.x * w.range, y: o.y, z: o.z + f2.z * w.range }; }
    }
    var dx = pt.x - o.x, dy = pt.y - o.y, dz = pt.z - o.z, l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return { origin: o, dir: { x: dx / l, y: dy / l, z: dz / l }, target: target, point: pt, dist: l };
  }
  function dryWeapon(p, id) {
    if (id === 'fist' || WEAPONS[id] && WEAPONS[id].melee) return;
    delete p.weapons[id]; if (p.ammo) delete p.ammo[id];
    if (p.weapon === id) p.weapon = 'fist';
    toast((WEAPONS[id] ? WEAPONS[id].name : id) + ': out of ammo');
  }
  function copHeat(p) {
    var now = simT(), wd = wanted();
    if (!wd || now - (p._copHeatT || -9) < 2) return;
    var list = E().hash.query(p.x, p.z, 32, scratch3);
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.kind !== 'ped' || !e.alive || !isCopRole(e) || e.inVehicle || e.hostile) continue;   // mission goons in uniform are the attackers, not witnesses
      if (!losClear(e.x, e.y + 1.5, e.z, p.x, p.y + 1.2, p.z)) continue;
      p._copHeatT = now; wd.crime('shootNearCop', 'shootNearCop'); return;
    }
  }
  function shotAlarm(ped, r) {
    var now = simT();
    if (now - (ped._alarmT || -9) < 0.4) return;
    ped._alarmT = now; alarm(ped.x, ped.z, r, ped, false);
  }
  function hitEntity(shooter, w, id, hit, d, dmg) {
    var e = hit.entity, isPlayer = shooter.kind === 'player';
    if (e.kind === 'ped' || e.kind === 'player') {
      var zone = isPlayer ? (hit.zone || 'torso') : 'torso';   // the AI never aims for the head
      dmg *= zone === 'head' ? (w.headMul || ZONE_MUL.head) : (ZONE_MUL[zone] || 1);
      if (!isPlayer) dmg *= id === 'rifle' ? AI_RIFLE_MUL : AI_DAMAGE_MUL;
      var before = e.alive;
      e.applyDamage(dmg, shooter, id);
      if (e.alive && !e.knockedDown && !e.inVehicle) {
        if (w.floors && zone !== 'head' && isPlayer && e.kind !== 'player') e.knockDown(d.x * w.knock, d.z * w.knock, 0, shooter, id);   // the Rebuttal puts a body hit on the floor
        else { e.vx += d.x * (w.knock || 1); e.vz += d.z * (w.knock || 1); }
      }
      impactFx(hit, 'ped');
      if (isPlayer) { shooter.stats.hits = (shooter.stats.hits || 0) + 1; if (before && !e.alive) shooter.stats.kills = (shooter.stats.kills || 0) + 1; markHit(shooter, e, before && !e.alive, zone, hit, id); }
      if (e.kind === 'player') { Combat.hurtFlash = 1; shake(0.18); }
      sfx('hit', hit.x, hit.z, 0.5);
      return true;
    }
    if (e.kind === 'vehicle') {
      var wasWreck = e.wreck;
      if (!e.wreck && !e.sinking) e.applyDamage(dmg * (w.vehicleMul || 0.5), shooter, id);
      impactFx(hit, 'vehicle');
      sfx('hit', hit.x, hit.z, 0.4);
      if (isPlayer) markHit(shooter, e, !wasWreck && (e.wreck || e.burning) && !e._markedDead && (e._markedDead = true), null, hit, id);
      return true;
    }
    if (e.kind === 'heli') {
      var wasDown = e.down;
      if (e.applyDamage) e.applyDamage(dmg, shooter, id);
      impactFx(hit, 'vehicle');
      sfx('hit', hit.x, hit.z, 0.5);
      if (isPlayer) {
        shooter.stats.hits = (shooter.stats.hits || 0) + 1; markHit(shooter, e, !wasDown && e.down, null, hit, id);
        // shooting the police helicopter is a crime: it keeps the heat alive (and the helicopter on station) while it takes fire
        var wd = wanted(), nowH = simT();
        if (wd && !e.down && nowH - (shooter._heliHeatT || -9) > 0.6) { shooter._heliHeatT = nowH; try { wd.crime('attackCop', 'shootHeli'); } catch (err) { /* ai optional */ } }
      }
      return true;
    }
    return false;
  }
  function hitscan(ped, w, id, ctx) {
    var pellets = w.pellets || 1, isPlayer = ped.kind === 'player';
    var spread = isPlayer ? playerSpread(ped, w, !!(ped.aiming && ctx.target && ctx.target === aim.target)) : (w.spread || 0) * 2.2 + 0.03;
    var o = ctx.origin, pelletHits = null, range = reachFor(ctx.target || aim.hover, w.range);
    if (isPlayer && ctx.target && ctx.target === aim.target && ctx.dist > range) range = ctx.dist + 1;   // a locked target is in reach of the shot
    muzzleFlash(o, ctx.dir);
    if (isPlayer) muzzleLight(o, ctx.dir, w);
    for (var k = 0; k < pellets; k++) {
      var d = jitter(ctx.dir, spread);
      var hit = trace(o, d, range, ped, traceOut);
      tracer(o, d, hit, id);
      if (hit.entity) {
        hitEntity(ped, w, id, hit, d, w.dmg / pellets);
        if (pellets > 1 && (hit.entity.kind === 'ped' || hit.entity.kind === 'player')) { pelletHits = pelletHits || {}; var key = hit.entity.id; pelletHits[key] = pelletHits[key] ? pelletHits[key] + 1 : 1; pelletHits['e' + key] = hit.entity; }
      } else if (hit.building) impactFx(hit, 'wall');
      else if (hit.ground) impactFx(hit, 'ground');
    }
    // a shotgun volley that lands mostly on one ped knocks them flat
    if (pelletHits) for (var pk in pelletHits) {
      if (pk.charAt(0) === 'e') continue;
      var e = pelletHits['e' + pk];
      if (pelletHits[pk] >= 3 && e.alive && !e.knockedDown && !e.inVehicle && U.dist2d(e.x, e.z, ped.x, ped.z) < 7) e.knockDown(ctx.dir.x * 4.5, ctx.dir.z * 4.5, 0, ped, id);
    }
    sfx('shot', o.x, o.z, id === 'shotgun' ? 1 : id === 'smg' ? 0.5 : id === 'sniper' || id === 'revolver' ? 0.95 : 0.8);
    shotAlarm(ped, id === 'sniper' ? 40 : 24);
    if (isPlayer) {
      ped.stats.shots = (ped.stats.shots || 0) + 1; ped.stats.shooting = (ped.stats.shooting || 0) + 1; copHeat(ped);
      shake(id === 'shotgun' ? 0.22 : id === 'smg' ? 0.05 : id === 'sniper' ? 0.16 : 0.09);
      bloomShot(w);
      kick((w.recoil || 0) * (ped.inVehicle ? 0.5 : 1), w.auto ? 0.12 : 0.25);
      if (w.mag) { if (w.casingDelay) ped._casingT = w.casingDelay; else ejectCasing(ped, o, ctx.dir, id); }
    }
    return true;
  }
  function melee(ped, w, ctx) {
    var f = U.yawToDir(ped.yaw), target = ctx.target, isPlayer = ped.kind === 'player', now = simT();
    if (ped.onGround && !ped.swimming) { ped.vx += f.x * w.lunge; ped.vz += f.z * w.lunge; }
    ped.punchT = 0.28;
    if (isPlayer) ped.stats.punches = (ped.stats.punches || 0) + 1;
    if (!target || U.dist2d(target.x, target.z, ped.x, ped.z) > w.range + 0.7) {
      // the table leg dents a car in reach
      if (w.vehicleDmg && isPlayer) {
        var list = E().hash.query(ped.x + f.x, ped.z + f.z, w.range + 2, scratch2);
        for (var i = 0; i < list.length; i++) {
          var v = list[i]; if (v.kind !== 'vehicle' || v.wreck || v.sinking || v === ped.inVehicle) continue;
          if (v.edgeDistance && v.edgeDistance(ped.x + f.x * 0.9, ped.z + f.z * 0.9) > 0.9) continue;
          v.applyDamage(w.vehicleDmg, ped, 'tableleg'); v.vx += f.x * 0.6; v.vz += f.z * 0.6;
          var hx = ped.x + f.x * 1.1, hz = ped.z + f.z * 1.1;
          fx({ type: 'spark', x: hx, y: v.y + v.cls.height * 0.5, z: hz, vx: f.x * 2, vy: 2.5, vz: f.z * 2, size: 0.3, life: 0.3 });
          sfx('hit', hx, hz, 0.7); shake(0.1);
          markHit(ped, v, false, null, { x: hx, y: v.y + 0.8, z: hz }, 'tableleg');
          return true;
        }
      }
      sfx('punch', ped.x, ped.z, 0.25); return true;
    }
    var dx = target.x - ped.x, dz = target.z - ped.z, l = Math.sqrt(dx * dx + dz * dz) || 1; dx /= l; dz /= l;
    var dmg = w.dmg * (isPlayer ? 1 : 0.6), wasAlive = target.alive, id = w === WEAPONS.tableleg ? 'tableleg' : 'fist';
    // the TABLE FLIP: a second table-leg swing landing within the window doubles the knockback and sends the victim sliding
    var flip = !!(w.flipWindow && isPlayer && target._legHitT != null && now - target._legHitT < w.flipWindow + 0.3 && now - target._legHitT > 0.2);
    target.applyDamage(dmg, ped, id);
    if (w.flipWindow) target._legHitT = now;
    if (target.alive && !target.knockedDown) {
      if (flip) { target.knockDown(dx * w.knock * 2.2, dz * w.knock * 2.2, 0, ped, id); target.downT = 2.4; textFx('FLIPPED', target.x, target.y + 2.1, target.z, '#ffbe3c', 1.0); }
      else if (target.hp < dmg * 1.5 || R().chance(0.22)) target.knockDown(dx * 4, dz * 4, 0, ped, id);
      else { target.vx += dx * w.knock; target.vz += dz * w.knock; }
      target.lastHitBy = ped;
    } else if (flip && target.alive) { target.vx += dx * w.knock * 2; target.vz += dz * w.knock * 2; textFx('FLIPPED', target.x, target.y + 2.1, target.z, '#ffbe3c', 1.0); }
    var hy = chestY(target) + 0.25;
    fx({ type: 'puff', x: target.x - dx * 0.3, y: hy, z: target.z - dz * 0.3, size: 0.55, life: 0.3, color: 0xfff6d8, vy: 0.8 });
    fx({ type: 'spark', x: target.x - dx * 0.3, y: hy, z: target.z - dz * 0.3, vx: dx * 2, vy: 2, vz: dz * 2, size: 0.25, life: 0.2, color: 0xfff0a0 });
    sfx('punch', target.x, target.z, 0.8);
    if (isPlayer) {
      ped.stats.hits = (ped.stats.hits || 0) + 1; if (wasAlive && !target.alive) ped.stats.kills = (ped.stats.kills || 0) + 1;
      shotAlarm(ped, 10); shake(flip ? 0.2 : 0.08);
      markHit(ped, target, wasAlive && !target.alive, 'torso', { x: target.x, y: hy, z: target.z }, id);
    }
    if (target.kind === 'player') { Combat.hurtFlash = 1; shake(0.25); }
    return true;
  }
  function megaphone(ped, w, ctx) {
    var dx0 = ctx.dir.x, dz0 = ctx.dir.z, l0 = Math.sqrt(dx0 * dx0 + dz0 * dz0) || 1;
    var dir = { x: dx0 / l0, z: dz0 / l0 }, isPlayer = ped.kind === 'player', r = R();
    ped.aimYaw = U.dirToYaw(dir.x, dir.z); ped.firePoseT = 0.6;
    // the wave: three rings marching out of the cone, a shout, and a few puffs
    for (var i = 0; i < 3; i++) fx({ type: 'ring', x: ped.x + dir.x * (1.3 + i * 1.75), y: ped.y + 0.12, z: ped.z + dir.z * (1.3 + i * 1.75), size: 2.0 + i * 0.9, life: 0.42 + i * 0.14, color: 0x2ee6ff });
    for (i = 0; i < 4; i++) { var dd = 1 + i * 1.3, sw = (i % 2 ? 1 : -1) * 0.5 * i; fx({ type: 'puff', x: ped.x + dir.x * dd - dir.z * sw, y: ped.y + 1.1 + r.range(-0.2, 0.3), z: ped.z + dir.z * dd + dir.x * sw, vx: dir.x * 5, vy: 0.4, vz: dir.z * 5, size: 0.45, life: 0.4, color: 0xbfefff }); }
    textFx(r.pick(SHOUTS), ped.x + dir.x * 1.2, ped.y + 1.9, ped.z + dir.z * 1.2, '#2ee6ff', 1.0);
    var list = E().hash.query(ped.x, ped.z, w.range + 1.5, scratch2), hitAny = 0;
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      if (e === ped || e.removed) continue;
      var dx = e.x - ped.x, dz = e.z - ped.z, d = Math.sqrt(dx * dx + dz * dz) || 0.001;
      if (d > w.range + (e.kind === 'vehicle' ? e.hw : 0) || Math.abs(e.y - ped.y) > 2.5) continue;
      if (Math.abs(signedAngle(dir, dx / d, dz / d)) > w.arc / 2) continue;
      if (e.kind === 'ped' || e.kind === 'player') {
        if (!e.alive || e.inVehicle) continue;
        var k = 1 - 0.4 * d / w.range, push = w.push * k, nx = dx / d, nz = dz / d;
        e.knockDown(nx * push, nz * push, 0, ped, 'megaphone');
        e.downT = 1.2; e.lastHitBy = ped;
        hitAny++;
        fx({ type: 'puff', x: e.x, y: e.y + 1.2, z: e.z, size: 0.5, life: 0.35, color: 0xbfefff });
        if (e.kind === 'player') { Combat.hurtFlash = 0.5; shake(0.3); }
      } else if (e.kind === 'vehicle') {
        if (e.driver && !e.hasPlayer() && e.honk) e.honk();   // the horn is the setlist
      }
    }
    sfx('debate', ped.x, ped.z, 0.9);
    if (isPlayer) {
      ped.stats.debating = (ped.stats.debating || 0) + 1;
      shake(0.12);
      alarm(ped.x, ped.z, 11, ped, false);
      if (hitAny && wanted()) wanted().addHeat(w.heat * Math.min(hitAny, 3), 'megaphone');
    }
    return true;
  }
  // the lob: a hottake or a hot mic on a ballistic arc to the aim point
  function lob(ped, w, id, ctx, fuse) {
    var o = ctx.origin, pt = ctx.point;
    var dx = pt.x - o.x, dz = pt.z - o.z, dist = Math.sqrt(dx * dx + dz * dz) || 1;
    var hx = dx / dist, hz = dz / dist;
    dist = U.clamp(dist, 2.5, w.range);
    var g = C.PHYS.gravity, s = w.speed, arg = g * dist / (s * s);
    var ang = arg >= 1 ? Math.PI / 4 : 0.5 * Math.asin(arg);
    ang += 0.06;   // a touch of loft so it clears the hand
    var opts = { x: o.x + hx * 0.3, y: o.y + 0.15, z: o.z + hz * 0.3, owner: ped, weaponId: id, dmg: w.dmg, life: 4, lobbed: true, stun: w.stun, radius: 0.2 };
    var pr;
    if (id === 'hotmic') { opts.life = 12; opts.fuse = fuse != null ? fuse : w.fuse; opts.radius = 0.16; pr = new HotMic(opts); }
    else pr = new GTP.Projectile(opts);
    var vv = ped.inVehicle || null;
    pr.vx = hx * s * Math.cos(ang) + (vv ? vv.vx * 0.5 : 0); pr.vz = hz * s * Math.cos(ang) + (vv ? vv.vz * 0.5 : 0); pr.vy = s * Math.sin(ang) + (ped.vy || 0);
    pr.snap();
    E().add(pr);
    ped.firePoseT = 0.5;
    sfx('jump', o.x, o.z, 0.4);
    if (ped.kind === 'player') { ped.stats.hottakes = (ped.stats.hottakes || 0) + 1; ped.stats.shooting = (ped.stats.shooting || 0) + 1; }
    return true;
  }
  // the rocket: straight out of the tube at 40 m/s, a trail, the backblast
  function launch(ped, w, id, ctx) {
    var o = ctx.origin, d = ctx.dir;
    var pr = new Rocket({ x: o.x + d.x * 0.9, y: o.y + d.y * 0.9 + 0.1, z: o.z + d.z * 0.9, owner: ped, weaponId: id, dmg: w.dmg, life: 7, radius: 0.25 });
    pr.vx = d.x * w.speed; pr.vy = d.y * w.speed; pr.vz = d.z * w.speed;
    pr.snap();
    E().add(pr);
    muzzleFlash(o, d);
    var r = R();
    for (var i = 0; i < 4; i++) fx({ type: 'smoke', x: o.x - d.x * 0.8, y: o.y, z: o.z - d.z * 0.8, vx: -d.x * 4 + r.range(-1, 1), vy: 0.6, vz: -d.z * 4 + r.range(-1, 1), size: 1.3, life: 0.8, color: 0x8a8a90 });
    fx({ type: 'explosion', x: o.x - d.x * 0.6, y: o.y, z: o.z - d.z * 0.6, size: 1.6, life: 0.12, color: 0xffd0a0 });
    sfx('shot', o.x, o.z, 1);
    sfx('jump', o.x, o.z, 0.6);
    ped.firePoseT = 0.6;
    if (ped.kind === 'player') {
      if (ped.onGround && !ped.inVehicle) ped._backblast = { t: 0.3, x: -d.x * 5, z: -d.z * 5 };   // the backblast: about 1.5 m of slide (held against the ground friction)
      ped.stats.shots = (ped.stats.shots || 0) + 1; ped.stats.rockets = (ped.stats.rockets || 0) + 1; ped.stats.shooting = (ped.stats.shooting || 0) + 1;
      muzzleLight(o, d, w); shake(0.45); kick(w.recoil, 0.3); copHeat(ped);
    }
    shotAlarm(ped, 30);
    return true;
  }
  // ---------------------------------------------------------- projectiles --
  // The hot mic: a lobbed mic with a fuse. It bounces (restitution 0.4, twice), comes to rest, and the ON AIR cap blinks
  // faster toward the bang. In water it fizzles. Peds and cars it lands on get a bump, not a blast (the blast is the fuse's).
  class HotMic extends GTP.Projectile {
    constructor(o) {
      super(o);
      this.fuse = o.fuse != null ? o.fuse : WEAPONS.hotmic.fuse; this.fuse0 = WEAPONS.hotmic.fuse;
      this.bounces = 0; this.maxBounces = WEAPONS.hotmic.bounces; this.rest = false; this.spin = R().range(6, 11); this.lobbed = true;
    }
    syncMesh(alpha) {
      var m = this.mesh; if (!m) return;
      var a = alpha == null ? 1 : alpha;
      m.position.set(this._px + (this.x - this._px) * a, this._py + (this.y - this._py) * a, this._pz + (this.z - this._pz) * a);
      if (this.rest) m.rotation.set(Math.PI / 2, 0, 0.3);
      else { m.rotation.x = this.age * this.spin; m.rotation.z = this.age * this.spin * 0.4; }
    }
    update(dt) {
      this.age += dt; this.fuse -= dt;
      if (this.fuse <= 0) { this.hit(null); return; }
      if (this.rest) return;
      var Wd = W(), g = C.PHYS.gravity, w = WEAPONS.hotmic;
      this.vy -= g * dt;
      var nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
      if (Wd.solidAt(nx, nz, this.y + 0.1) || Wd.tileAt(nx, nz) === Wd.T.VOID) { this.vx = -this.vx * w.restitution; this.vz = -this.vz * w.restitution; this.bounces++; sfx('hit', this.x, this.z, 0.3); }
      else { this.x = nx; this.z = nz; }
      this.y += this.vy * dt;
      var gy = Wd.heightAt(this.x, this.z, this.y + 0.3);
      if (this.y < C.WATER_Y + 0.05 && gy <= C.WATER_Y) { fx({ type: 'puff', x: this.x, y: C.WATER_Y + 0.2, z: this.z, size: 1.1, life: 0.6, color: 0xbfe8f4, vy: 0.8 }); sfx('land', this.x, this.z, 0.4); this.destroy(); return; }
      if (this.y <= gy) {
        this.y = gy;
        if (this.vy < -1.2 && this.bounces < this.maxBounces) {
          this.vy = -this.vy * w.restitution; this.vx *= 0.7; this.vz *= 0.7; this.bounces++;
          fx({ type: 'puff', x: this.x, y: gy + 0.1, z: this.z, size: 0.4, life: 0.3, color: 0xcfc8b8, vy: 0.5 });
          sfx('hit', this.x, this.z, 0.25);
        } else {
          this.vy = 0; this.vx *= 0.82; this.vz *= 0.82;
          if (Math.abs(this.vx) + Math.abs(this.vz) < 0.25) { this.vx = this.vz = 0; this.rest = true; }
        }
      }
      // a bump off a car or a ped (the player's own car included: it rolls off the bonnet)
      var list = E().hash.query(this.x, this.z, 1.5, scratch3);
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e === this || e.removed) continue;
        if (e.kind === 'vehicle' && !e.sinking) {
          if (e.pushCircle(this.x, this.z, this.radius) && this.y < e.y + e.cls.height + 0.3 && this.y > e.y - 0.3) {
            var ox = this.x - e.x, oz = this.z - e.z, ol = Math.sqrt(ox * ox + oz * oz) || 1;
            this.vx = ox / ol * 2.5 + e.vx * 0.3; this.vz = oz / ol * 2.5 + e.vz * 0.3; this.vy = Math.max(this.vy * -0.3, 1.5); this.bounces++;
            sfx('hit', this.x, this.z, 0.3);
          }
        } else if ((e.kind === 'ped' || e.kind === 'player') && e !== this.owner && e.alive && !e.inVehicle) {
          if (U.dist2d(e.x, e.z, this.x, this.z) < e.radius + this.radius && this.y > e.y - 0.2 && this.y < e.y + e.height + 0.2) {
            var px = this.x - e.x, pz = this.z - e.z, pl = Math.sqrt(px * px + pz * pz) || 1;
            this.vx = px / pl * 2; this.vz = pz / pl * 2; this.vy = Math.max(this.vy * -0.3, 1.2); this.bounces++;
            e.applyDamage(3, this.owner, 'hotmic'); if (e.speakLine && !e._micLine) { e._micLine = true; e.speakLine('Is this on?'); }
          }
        }
      }
    }
  }
  // The rocket: 40 m/s, straight for 3 s, then it drops. A trail of smoke and fire. It bursts on anything it touches.
  class Rocket extends GTP.Projectile {
    constructor(o) { super(o); this.lobbed = false; this.trailT = 0; this.straight = 3; }
    syncMesh(alpha) {
      var m = this.mesh; if (!m) return;
      var a = alpha == null ? 1 : alpha;
      m.position.set(this._px + (this.x - this._px) * a, this._py + (this.y - this._py) * a, this._pz + (this.z - this._pz) * a);
      var vl = Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz) || 1;
      m.rotation.set(0, 0, 0);
      m.lookAt(m.position.x + this.vx / vl, m.position.y + this.vy / vl, m.position.z + this.vz / vl);
      m.rotateX(Math.PI / 2); m.rotateY(this.age * 14);
    }
    update(dt) {
      this.age += dt; this.life -= dt;
      if (this.life <= 0) { this.hit(null); return; }
      if (this.age > this.straight) this.vy -= C.PHYS.gravity * 0.6 * dt;
      var steps = 3, sdt = dt / steps, Wd = W();   // 40 m/s is 0.67 m per step: sub-step so a car's box never gets skipped
      for (var s = 0; s < steps; s++) {
        this.x += this.vx * sdt; this.y += this.vy * sdt; this.z += this.vz * sdt;
        if (this.y <= Wd.heightAt(this.x, this.z, this.y) || Wd.solidAt(this.x, this.z, this.y) || this.y < C.WATER_Y - 0.5 || Wd.tileAt(this.x, this.z) === Wd.T.VOID) { this.hit(null); return; }
        var list = E().hash.query(this.x, this.z, 4.5, scratch3);
        for (var i = 0; i < list.length; i++) {
          var e = list[i];
          if (e === this.owner || e === this || e.removed || (this.owner && e === this.owner.inVehicle && this.age < 0.25)) continue;
          if (e.kind === 'vehicle') { if (!e.sinking && e.pushCircle(this.x, this.z, this.radius + 0.2) && this.y < e.y + e.cls.height + 0.4 && this.y > e.y - 0.4) { this.hit(e); return; } }
          else if (e.kind === 'ped' || e.kind === 'player') { if (e.alive && !e.inVehicle && U.dist2d(e.x, e.z, this.x, this.z) < e.radius + this.radius + 0.1 && this.y > e.y - 0.3 && this.y < e.y + e.height + 0.3) { this.hit(e); return; } }
          else if (e.kind === 'heli') { if (!e.down) { var hx = e.x - this.x, hy = e.y - this.y, hz = e.z - this.z; if (hx * hx + hy * hy + hz * hz < 3.8 * 3.8) { this.hit(e); return; } } }
        }
      }
      this.trailT += dt;
      if (this.trailT > 0.025) {
        this.trailT = 0;
        var r = R();
        fx({ type: 'smoke', x: this.x + r.range(-0.1, 0.1), y: this.y + r.range(-0.1, 0.1), z: this.z + r.range(-0.1, 0.1), vx: r.range(-0.5, 0.5), vy: r.range(0.2, 0.8), vz: r.range(-0.5, 0.5), size: r.range(0.9, 1.4), life: r.range(0.9, 1.4), color: 0xa0a0a8 });
        fx({ type: 'fire', x: this.x - this.vx * 0.012, y: this.y - this.vy * 0.012, z: this.z - this.vz * 0.012, vx: -this.vx * 0.05, vy: 0.3, vz: -this.vz * 0.05, size: 0.7, life: 0.12, color: 0xffb060 });
      }
    }
  }
  // the hottake's 5 m stun (unchanged)
  function takeBlast(proj, owner) {
    var w = WEAPONS.hottake, r = R();
    var x = proj.x, y = proj.y, z = proj.z, Wd = W();
    var gy = Wd.heightAt(x, z, y); if (y < gy) y = gy;
    var rad = w.stun || 5, i;
    fx({ type: 'explosion', x: x, y: y + 0.5, z: z, size: 3.2, life: 0.5, color: 0xff8a30 });
    fx({ type: 'ring', x: x, y: gy + 0.1, z: z, size: rad, life: 0.55, color: 0xff9a40 });
    for (i = 0; i < 6; i++) fx({ type: 'fire', x: x + r.range(-0.5, 0.5), y: y + 0.3 + r.range(0, 0.6), z: z + r.range(-0.5, 0.5), vx: r.range(-2, 2), vy: r.range(1.5, 4), vz: r.range(-2, 2), size: r.range(0.8, 1.5), life: r.range(0.3, 0.6) });
    for (i = 0; i < 5; i++) fx({ type: 'smoke', x: x + r.range(-0.6, 0.6), y: y + 0.6, z: z + r.range(-0.6, 0.6), vx: r.range(-1, 1), vy: r.range(1, 2.5), vz: r.range(-1, 1), size: r.range(1.2, 2.2), life: r.range(1, 1.8), color: 0x553322 });
    for (i = 0; i < 8; i++) { var a = r.random() * Math.PI * 2, sp = r.range(3, 8); fx({ type: 'spark', x: x, y: y + 0.4, z: z, vx: Math.cos(a) * sp, vy: r.range(2, 6), vz: Math.sin(a) * sp, size: 0.35, life: r.range(0.3, 0.6), color: 0xffb060 }); }
    fx({ type: 'decal', x: x, y: gy, z: z, size: 2.2, size2: 2.2, life: 30, color: 0x2a1a10 });
    textFx('RESPECTFULLY.', x, y + 1.6, z, '#ff7a20', 1.3);
    var list = E().hash.query(x, z, rad + 2.5, scratch);
    for (i = 0; i < list.length; i++) {
      var e = list[i]; if (e === proj || e.removed) continue;
      var dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz), ext = e.kind === 'vehicle' ? e.hw : 0.4;
      if (d > rad + ext) continue;
      var fall = 1 - 0.55 * Math.min(1, d / rad), nx = dx / (d || 1), nz = dz / (d || 1);
      if (e.kind === 'ped' || e.kind === 'player') {
        if (!e.alive || e.inVehicle) continue;
        var dmg = proj.dmg * fall * (e === owner ? 0.5 : 1);
        e.knockDown(nx * 6 * fall, nz * 6 * fall, dmg, owner, 'hottake');
        e.lastHitBy = owner || e.lastHitBy;
        if (e.kind === 'player') { Combat.hurtFlash = 0.7; }
      } else if (e.kind === 'vehicle' && !e.wreck && !e.sinking) {
        e.applyDamage(18 * fall, owner, 'hottake'); e.vx += nx * 2 * fall; e.vz += nz * 2 * fall;
      }
    }
    sfx('explode', x, z, 0.6);
    var pl = player(); if (pl) shake(U.clamp(0.9 - U.dist2d(pl.x, pl.z, x, z) / 25, 0.1, 0.9));
    alarm(x, z, 28, owner || proj, false);
  }
  // the big ones: the hot mic's 6 m blast (+ a 5 m knockdown ring) and the rocket's 8 m blast that flips cars
  function areaBlast(proj, owner, kind) {
    var w = WEAPONS[kind], r = R(), Wd = W();
    var x = proj.x, y = proj.y, z = proj.z, gy = Wd.heightAt(x, z, y); if (y < gy) y = gy;
    var rad = w.blast, ring = kind === 'hotmic' ? rad + w.ring : rad, i, rocket = kind === 'ratio';
    var hot = rocket ? 0xff3fa4 : 0xff4a2a;
    fx({ type: 'explosion', x: x, y: y + 1.0, z: z, size: rocket ? 16 : 11, life: 0.14, color: 0xfff6e0 });
    fx({ type: 'explosion', x: x, y: y + 1.4, z: z, size: rocket ? 13 : 9, life: 0.6, color: rocket ? 0xff9ad0 : 0xffb040, vy: 2.5 });
    fx({ type: 'explosion', x: x, y: y + 0.5, z: z, size: rocket ? 9 : 6, life: 0.45, color: hot, vy: 1.5 });
    fx({ type: 'ring', x: x, y: gy + 0.1, z: z, size: rad * 2, life: 0.6, color: hot });
    if (!rocket) fx({ type: 'ring', x: x, y: gy + 0.12, z: z, size: ring * 2, life: 0.8, color: 0xff8a60 });
    for (i = 0; i < (rocket ? 10 : 7); i++) fx({ type: 'fire', x: x + r.range(-1.2, 1.2), y: y + r.range(0.2, 1.6), z: z + r.range(-1.2, 1.2), vx: r.range(-4, 4), vy: r.range(3, 9), vz: r.range(-4, 4), size: r.range(1.6, 3), life: r.range(0.5, 1) });
    for (i = 0; i < 7; i++) fx({ type: 'smoke', x: x + r.range(-0.8, 0.8), y: y + 1 + i * 0.5, z: z + r.range(-0.8, 0.8), vx: r.range(-0.7, 0.7), vy: r.range(2, 4), vz: r.range(-0.7, 0.7), size: r.range(2.5, 4.5), life: r.range(1.8, 3), color: rocket ? 0x2a1a24 : 0x1e1a18 });
    for (i = 0; i < 14; i++) { var a = r.random() * Math.PI * 2, sp = r.range(4, 13); fx({ type: 'spark', x: x, y: y + 0.6, z: z, vx: Math.cos(a) * sp, vy: r.range(3, 9), vz: Math.sin(a) * sp, size: 0.45, life: r.range(0.3, 0.7), color: rocket ? 0xffb0e0 : 0xffc060 }); }
    fx({ type: 'decal', x: x, y: gy, z: z, size: rad * 0.7, size2: rad * 0.7, life: 60, color: 0x16120f });
    textFx(rocket ? failText('wasted') : 'HOT MIC', x, y + 2.2, z, rocket ? '#ff3fa4' : '#ff4a2a', 1.4);
    var list = E().hash.query(x, z, ring + 4, scratch), direct = proj._direct || null;
    for (i = 0; i < list.length; i++) {
      var e = list[i]; if (e === proj || e.removed) continue;
      var dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz), ext = e.kind === 'vehicle' ? e.hw : e.kind === 'heli' ? 3 : 0.4;
      if (d > ring + ext) continue;
      var nx = dx / (d || 1), nz = dz / (d || 1), inBlast = d <= rad + ext, fall = inBlast ? 1 - 0.5 * Math.min(1, d / rad) : 0;
      if (e.kind === 'ped' || e.kind === 'player') {
        if (!e.alive || e.inVehicle) continue;
        if (inBlast) { var dmg = w.dmg * fall * (e === owner ? 0.5 : 1); e.knockDown(nx * 8 * fall, nz * 8 * fall, dmg, owner, kind); if (e.kind === 'player') Combat.hurtFlash = 0.9; }
        else e.knockDown(nx * 5, nz * 5, 0, owner, kind);   // the knockdown ring beyond the blast
        e.lastHitBy = owner || e.lastHitBy;
      } else if (e.kind === 'vehicle' && !e.wreck && !e.sinking && inBlast) {
        // cars keep the full blast inside 40% of the radius (one mic wrecks a parked van), 60% of it at the edge
        var vfall = 1 - 0.4 * U.clamp((d - rad * 0.4) / (rad * 0.6), 0, 1);
        if (rocket && e === direct) { e.lastDamageSrc = owner || e.lastDamageSrc; e.explode(owner); }
        else e.applyDamage((rocket ? w.dmg : w.vehicleDmg) * vfall, owner, kind);
        e.vx += nx * (rocket ? 7 : 3) * fall; e.vz += nz * (rocket ? 7 : 3) * fall;
        if (rocket) { e.vy = Math.max(e.vy, 9 * fall + 3); e.onGround = false; e.angVel += r.range(-2.5, 2.5); e._flipT = e._flipDur = 0.95; e._flipDir = nx * (U.yawToDir(e.yaw).z) - nz * (U.yawToDir(e.yaw).x) >= 0 ? 1 : -1; }
        else if (fall > 0.6) { e.vy = Math.max(e.vy, 2.5); e.onGround = false; }
      } else if (e.kind === 'heli' && !e.down && inBlast && e.applyDamage) e.applyDamage(w.dmg * fall, owner, kind);
    }
    sfx('explode', x, z, rocket ? 1 : 0.85);
    var pl = player(); if (pl) shake(U.clamp((rocket ? 1.4 : 1.1) - U.dist2d(pl.x, pl.z, x, z) / 30, 0.15, 1.4));
    alarm(x, z, rocket ? 40 : 30, owner || proj, false);
    if (owner && owner.kind === 'player') { owner.stats.blasts = (owner.stats.blasts || 0) + 1; copHeat(owner); }
  }
  function projectileHit(proj, target) {
    var id = proj.weaponId, owner = proj.owner;
    if (id === 'hotmic') { areaBlast(proj, owner, 'hotmic'); return; }
    if (id === 'ratio') { proj._direct = target && target.kind === 'vehicle' ? target : null; areaBlast(proj, owner, 'ratio'); return; }
    takeBlast(proj, owner);
    void target;
  }

  // ---------------------------------------------------------- the hot mic in hand --
  // holding shoot with a hot mic cooks it: the fuse runs in the hand, release throws what is left of it
  function startCook(p, id) {
    if (p._cook) return;
    p._cook = { t: 0, id: id, blink: 0 };
    p.firePoseT = 0.6;
    sfx('ui', p.x, p.z, 0.3);
  }
  function tickCook(p, dt, In) {
    var ck = p._cook; if (!ck) return;
    var w = WEAPONS[ck.id];
    if (!p.alive || p.knockedDown || p.weapon !== ck.id || !(p.weapons[ck.id] > 0)) { p._cook = null; return; }   // a knockdown drops it quietly
    var held = In.down('shoot') || In.down('action');
    ck.t += dt; p.firePoseT = Math.max(p.firePoseT || 0, 0.3);
    if (ck.t >= w.fuse) {
      // it was on the whole time
      p._cook = null;
      var pr = new HotMic({ x: p.x, y: p.y + 1.2, z: p.z, owner: p, weaponId: ck.id, dmg: w.dmg, life: 1, fuse: 0.01, radius: 0.16 });
      pr.snap(); E().add(pr);
      spend(p, ck.id);
      return;
    }
    if (!held || p.knockedDown) {
      p._cook = null;
      if (p.knockedDown) return;
      var ctx = aimContext(p, w);
      if (lob(p, w, ck.id, ctx, Math.max(0.25, w.fuse - ck.t))) { p._fireT = simT(); spend(p, ck.id); }
    }
  }
  // spend one round of the player's weapon (the magazine for guns, the reserve for the rest)
  function spend(p, id) {
    var w = WEAPONS[id], a = ammoOf(p, id); if (!w || !a) return;
    if (a.total === Infinity) return;
    if (w.mag) setAmmo(p, id, Math.max(0, a.mag - 1), a.reserve); else setAmmo(p, id, 0, Math.max(0, a.reserve - 1));
    if (!(p.weapons[id] > 0)) dryWeapon(p, id);
    else if (w.mag === 1 && a.mag <= 0 && a.reserve > 0) startReload(p, id);   // a single-round tube reloads itself; the rest wait for the trigger or R
  }

  // --------------------------------------------------------- muzzle light --
  // one pooled point light at the player's muzzle for 0.06 s a shot (autos: it stays while the trigger is held and flickers).
  // It stays in the scene at intensity 0 between shots: adding and removing a light would recompile every material.
  var ml = { t: 0, auto: false, light: null };
  function muzzleLight(o, d, w) {
    var Rd = GTP.Render; if (!Rd || !Rd.scene) return;
    var L = Rd.muzzleLight;
    if (!L) { L = Rd.muzzleLight = new THREE.PointLight(0xffd27a, 0, 9, 2); L.name = 'muzzleLight'; Rd.scene.add(L); }
    ml.light = L; L.position.set(o.x + d.x * 0.45, o.y + d.y * 0.45, o.z + d.z * 0.45); L.intensity = 2.6; ml.t = 0.06; ml.auto = !!w.auto;
  }
  function tickMuzzleLight(dt, p, In) {
    var L = ml.light; if (!L) return;
    if (ml.t <= 0) { if (L.intensity) L.intensity = 0; return; }
    var held = ml.auto && p && p.alive && In && (In.down('shoot') || In.down('action')) && p.weapon && WEAPONS[p.weapon] && WEAPONS[p.weapon].auto && !(p.reloadT > 0) && (ammoOf(p, p.weapon) || {}).mag > 0;
    if (held) { ml.t = 0.06; L.intensity = 2.6 * R().range(0.5, 1.0); var o = muzzle(p); L.position.set(o.x, o.y, o.z); }
    else { ml.t -= dt; if (ml.t <= 0) L.intensity = 0; }
  }
  // ------------------------------------------------------ casings (fx patch) --
  // Render.fx gets a 'casing' type: brass (or red shells) in one InstancedMesh, gravity, one bounce, 0.9 s, 60 live at most.
  var casings = { list: [], max: 60, im: null, free: [], M: null, P: null, Q: null, S: null, Eu: null, Col: null };
  function casingInit() {
    var Rd = GTP.Render; if (casings.im || !Rd || !Rd.fxGroup) return false;
    var geo = new THREE.BoxGeometry(1, 1, 1), mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    var im = new THREE.InstancedMesh(geo, mat, casings.max);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.name = 'casings'; im.castShadow = false;
    casings.M = new THREE.Matrix4(); casings.P = new THREE.Vector3(); casings.Q = new THREE.Quaternion(); casings.S = new THREE.Vector3(); casings.Eu = new THREE.Euler(); casings.Col = new THREE.Color();
    var zero = new THREE.Matrix4().makeScale(0, 0, 0), white = new THREE.Color(0xffffff);
    for (var i = 0; i < casings.max; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, white); casings.free.push(casings.max - 1 - i); }
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    Rd.fxGroup.add(im); casings.im = im;
    return true;
  }
  function casingAdd(o) {
    if (!casings.im && !casingInit()) return o;
    if (!casings.free.length) casingRelease(casings.list.shift());   // the oldest drops
    var slot = casings.free.pop(), r = R();
    var c = { type: 'casing', slot: slot, x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy == null ? 2.5 : o.vy, vz: o.vz || 0, t: 0, life: o.life || 0.9, size: o.size || 0.06, bounced: false, resting: false, rx: r.range(0, 6), ry: r.range(0, 6), wx: r.range(-14, 14), wy: r.range(-14, 14) };
    casings.Col.set(o.color || 0xd8b24a); casings.im.setColorAt(slot, casings.Col); casings.im.instanceColor.needsUpdate = true;
    casings.list.push(c);
    return c;
  }
  function casingRelease(c) {
    if (!c || c.slot == null) return;
    casings.M.makeScale(0, 0, 0); casings.im.setMatrixAt(c.slot, casings.M); casings.im.instanceMatrix.needsUpdate = true;
    casings.free.push(c.slot); c.slot = null;
  }
  function casingUpdate(dt) {
    var L = casings.list; if (!L.length) return;
    var Wd = W(), g = C.PHYS.gravity;
    for (var i = L.length - 1; i >= 0; i--) {
      var c = L[i]; c.t += dt;
      if (c.t >= c.life) { casingRelease(c); L.splice(i, 1); continue; }
      if (c.resting) continue;
      c.vy -= g * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.rx += c.wx * dt; c.ry += c.wy * dt;
      var gy = Wd ? Wd.heightAt(c.x, c.z, c.y + 0.5) : 0;
      if (c.y <= gy + c.size * 0.3 && c.vy < 0) {
        c.y = gy + c.size * 0.3;
        if (!c.bounced) { c.bounced = true; c.vy = -c.vy * C.PHYS.restitution; c.vx *= 0.5; c.vz *= 0.5; c.wx *= 0.4; c.wy *= 0.4; }
        else { c.vy = 0; c.vx = c.vz = 0; c.resting = true; c.rx = Math.PI / 2; }
      }
    }
  }
  function casingSync() {
    var L = casings.list; if (!L.length || !casings.im) return;
    for (var i = 0; i < L.length; i++) {
      var c = L[i];
      casings.P.set(c.x, c.y, c.z); casings.Eu.set(c.rx, c.ry, 0, 'YXZ'); casings.Q.setFromEuler(casings.Eu);
      casings.S.set(c.size * 0.4, c.size * 0.4, c.size);
      casings.M.compose(casings.P, casings.Q, casings.S); casings.im.setMatrixAt(c.slot, casings.M);
    }
    casings.im.instanceMatrix.needsUpdate = true;
  }
  function casingClear() { for (var i = 0; i < casings.list.length; i++) casingRelease(casings.list[i]); casings.list.length = 0; }
  // the handler Render.fx runs beside its own list (Render.fx.register('casing', ...), done once on the first update)
  var casingHandler = { add: casingAdd, update: casingUpdate, sync: casingSync, clear: casingClear, state: casings };
  function ensureHooks() {
    var Rd = GTP.Render, F = Rd && Rd.fx;
    if (F && F.register && !F.extensions.casing) { F.register('casing', casingHandler); F.casings = casings; }
  }

  // ----------------------------------------------------------- scope --
  // Combat.scope: the sniper's sight. Holding aim with the sniper on foot puts the rig at eye height (the player's cameraMode is
  // parked and set to 'first' so the body hides), fov 30 (2x) or 15 (4x; [ ] / the wheel toggles), a breath sway, 1/zoom look.
  var scope = { active: false, zoom: 2, fov: 30, range: 0, sway: 0.15, t: 0, stillT: 0, target: null };
  function updateScope(p, dt) {
    var want = !!(p.alive && !p.inVehicle && p.weapon === 'sniper' && p.aiming && !p.knockedDown && !p.swimming && GTP.game && GTP.game.state === 'playing');
    if (want && !scope.active) { scope.active = true; scope.t = 0; scope.stillT = 0; p._scopeCam = p.cameraMode; p.cameraMode = 'first'; sfx('ui', p.x, p.z, 0.25); emit('scope', { active: true, zoom: scope.zoom }); }
    else if (!want && scope.active) { scope.active = false; if (p.cameraMode === 'first') p.cameraMode = p._scopeCam || 'chase'; p._scopeCam = null; emit('scope', { active: false, zoom: scope.zoom }); }
    if (!scope.active) { scope.target = null; return; }
    scope.t += dt;
    var still = Math.abs(p.vx || 0) + Math.abs(p.vz || 0) < 0.3;
    scope.stillT = still ? scope.stillT + dt : 0;
    scope.fov = scope.zoom >= 4 ? 15 : 30;
    scope.range = aim.range || 0; scope.target = aim.hover || null;
  }
  function toggleZoom() { scope.zoom = scope.zoom >= 4 ? 2 : 4; sfx('ui', 0, 0, 0.2); emit('scope', { active: scope.active, zoom: scope.zoom }); }

  // (the recoil kick and the scope's fov / sway / look division live in Render.rig: rig.kick(pitchDeg, yawDeg, recover) and
  // rig.update reading Combat.scope {active, zoom, fov, sway, t, stillT})

  // ------------------------------------------------------------ the wheel --
  // Combat.wheel: hold lockOn (Tab) for 0.18 s while not aiming. Twelve segments in ORDER, index 0 at the top, clockwise; the mouse
  // (or the right stick) picks the segment, [ ] steps it, release equips. The world runs at timeScale (0.2) while it is open.
  var wheel = { open: false, index: 0, hold: 0, vx: 0, vy: 0, timeScale: 0.2, t: 0, source: null, _acc: 0, segments: null };
  function openWheel(p, source) {
    if (wheel.open) return;
    wheel.open = true; wheel.source = source || 'key'; wheel.t = 0; wheel.vx = wheel.vy = 0; wheel._acc = 0;
    wheel.index = Math.max(0, ORDER.indexOf(p.weapon));
    cancelReload(p);
    sfx('ui', p.x, p.z, 0.3);
    emit('wheel', { open: true, index: wheel.index, id: ORDER[wheel.index] });
  }
  function closeWheel(p, equip) {
    if (!wheel.open) return;
    wheel.open = false; wheel.hold = 0;
    var id = ORDER[wheel.index];
    if (equip && p && id && p.weapons[id] > 0 && p.weapon !== id) { p.weapon = id; cancelReload(p); }
    emit('wheel', { open: false, index: wheel.index, id: id, equipped: equip ? p.weapon : null });
  }
  function updateWheel(p, dt) {
    var In = GTP.Input, g = GTP.game;
    var tabDown = In.down('lockOn') || In.down('wheel');
    if (!wheel.open) {
      if (tabDown && !p.aiming && p.alive && !p.knockedDown && g && g.state === 'playing') { wheel.hold += dt; if (wheel.hold >= 0.18) openWheel(p, 'key'); }
      else wheel.hold = 0;
      return;
    }
    wheel.t += dt;
    var look = In.look, pad = In.gamepad;
    if (look && (look.dx || look.dy)) { wheel.vx += look.dx; wheel.vy += look.dy; var m = Math.sqrt(wheel.vx * wheel.vx + wheel.vy * wheel.vy); if (m > 60) { wheel.vx *= 60 / m; wheel.vy *= 60 / m; } look.dx = 0; look.dy = 0; }   // the wheel owns the mouse: the camera holds
    if (pad && pad.index >= 0 && (pad.rx || pad.ry)) { wheel.vx = pad.rx * 60; wheel.vy = pad.ry * 60; }
    if (wheel.vx * wheel.vx + wheel.vy * wheel.vy > 12 * 12) {
      var ang = Math.atan2(wheel.vx, -wheel.vy); if (ang < 0) ang += Math.PI * 2;
      var idx = Math.round(ang / (Math.PI * 2 / ORDER.length)) % ORDER.length;
      if (idx !== wheel.index) { wheel.index = idx; sfx('ui', p.x, p.z, 0.15); }
    }
    if (In.pressed('weaponNext')) { wheel.index = (wheel.index + 1) % ORDER.length; wheel.vx = wheel.vy = 0; }
    if (In.pressed('weaponPrev')) { wheel.index = (wheel.index + ORDER.length - 1) % ORDER.length; wheel.vx = wheel.vy = 0; }
    if (!p.alive || p.knockedDown || !g || g.state !== 'playing') { closeWheel(p, false); return; }
    if (wheel.source === 'key' && !tabDown) closeWheel(p, true);
  }
  function wheelHud(p) {
    var segs = wheel.segments || (wheel.segments = ORDER.map(function (id) { return { id: id, name: WEAPONS[id].name, cls: WEAPONS[id].cls, owned: false, ammo: null, mag: null, reserve: null, infinite: false, current: false }; }));
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], tot = p && p.weapons ? p.weapons[s.id] : 0, a = p && tot > 0 ? ammoOf(p, s.id) : null;
      s.owned = tot > 0 || !!(WEAPONS[s.id].melee && tot === Infinity); s.infinite = tot === Infinity; s.ammo = tot === Infinity ? null : (tot | 0);
      s.mag = a && WEAPONS[s.id].mag ? (a.mag === Infinity ? null : a.mag) : null; s.reserve = a ? (a.reserve === Infinity ? null : a.reserve) : null; s.current = p && p.weapon === s.id;
    }
    return { open: wheel.open, index: wheel.index, id: ORDER[wheel.index], t: wheel.t, segments: segs, timeScale: wheel.timeScale };
  }
  // the slow step: input, menus, the wheel, the HUD and the camera tick; the world holds (4 of every 5 steps at 0.2x)
  function slowStep(g) {
    var dt = C.STEP;
    try {
      GTP.Input.beginFrame();
      if (g._handleGlobalInput) g._handleGlobalInput();
      if (g.state === 'playing' && g.player) updateWheel(g.player, dt);
      if (GTP.UI && GTP.UI.update) GTP.UI.update(dt);
      if (GTP.Render && GTP.Render.updateCamera) GTP.Render.updateCamera(dt);
    } catch (e) { U.reportError(e, 'step.wheel'); }
    finally { try { GTP.Input.endFrame(); } catch (e2) { U.reportError(e2, 'input.endFrame'); } }
  }
  // Game.step calls this first: true = the wheel is open and this step was a slow one (the world held, 4 of every 5 steps at 0.2x)
  function wheelStep(g) {
    if (!wheel.open || g.state !== 'playing' || !(wheel.timeScale < 1)) return false;
    wheel._acc += wheel.timeScale;
    if (wheel._acc < 1) { slowStep(g); return true; }
    wheel._acc -= 1;
    return false;
  }

  // Player.cycleWeapon delegates here: walk ORDER (owned only), toggle the scope zoom while scoped, yield to the open wheel; a switch
  // cancels a reload (the reload pose itself is drawn by Ped.syncMesh from reloadT / reloadTotal)
  function cycleWeapon(p, dir) {
    if (scope.active) { toggleZoom(); return; }
    if (wheel.open) return;
    var ids = ORDER.filter(function (id) { return p.weapons[id] > 0; });
    for (var k in p.weapons) if (p.weapons[k] > 0 && ids.indexOf(k) < 0) ids.push(k);
    if (!ids.length) return;
    var i = ids.indexOf(p.weapon); if (i < 0) i = 0;
    var next = ids[(i + dir + ids.length) % ids.length];
    if (next !== p.weapon) { p.weapon = next; cancelReload(p); p._cook = null; }
  }
  // ------------------------------------------------------- damage flashes --
  var FLASH_MAT = null, flashing = [];
  // a hot, still-shaded flash (flat white reads as a ghost from the side)
  function flashMaterial() { if (!FLASH_MAT) FLASH_MAT = new THREE.MeshLambertMaterial({ color: 0xffe0d8, emissive: new THREE.Color(0xff5a40), emissiveIntensity: 0.75 }); return FLASH_MAT; }
  function startFlash(t) {
    var m = t.mesh; if (!m) return;
    var now = simT();
    if (t.kind === 'vehicle') {
      var ud = m.userData; if (!ud || !ud.paint) return;
      if (!t._flash) { t._flash = true; ud.paint.emissive.setHex(0x5a2a22); flashing.push(t); }
      t._flashUntil = now + 0.08;
      return;
    }
    if (!t._flash) {
      t._flash = true;
      m.traverse(function (o) { if (o.isMesh && !o.isSprite && o.name !== 'held' && o.name !== 'cap') { o.userData.mat0 = o.material; o.material = flashMaterial(); } });
      flashing.push(t);
    }
    t._flashUntil = now + 0.09;
  }
  function endFlash(t) {
    t._flash = false;
    var m = t.mesh; if (!m) return;
    if (t.kind === 'vehicle') { if (m.userData && m.userData.paint) m.userData.paint.emissive.setHex(0); return; }
    m.traverse(function (o) { if (o.isMesh && o.userData.mat0) { o.material = o.userData.mat0; o.userData.mat0 = null; } });
  }
  function updateFlash() {
    var now = simT();
    for (var i = flashing.length - 1; i >= 0; i--) {
      var t = flashing[i];
      if (now >= t._flashUntil || !t.mesh || t.removed) { endFlash(t); flashing.splice(i, 1); }
    }
  }

  // --------------------------------------------------------- held weapons --
  function upright(id) { var f = GTP.Assets.weaponFit && GTP.Assets.weaponFit[id]; return f ? !!f.upright : (id === 'megaphone' || id === 'hottake' || id === 'hotmic'); }
  function syncHeld(e, dt) {
    var m = e.mesh; if (!m) return;
    var want = (e.alive && !e.inVehicle && e.weapon && e.weapon !== 'fist' && WEAPONS[e.weapon]) ? e.weapon : null;
    if (e._heldId !== want) {
      if (e._held) { if (e._held.parent) e._held.parent.remove(e._held); e._held = null; }
      e._heldId = want;
      if (want) {
        var arm = m.getObjectByName('armR');
        var wm = arm && GTP.Assets.weaponMesh ? GTP.Assets.weaponMesh(want) : null;
        if (wm) { wm.name = 'held'; wm.position.set(0, -0.6, -0.02); wm.scale.setScalar(upright(want) ? 1 : 1.2); arm.add(wm); e._held = wm; }
      }
    }
    if (e._held) {
      var raised = !!e.aiming || e.firePoseT > 0 || e.reloadT > 0;
      if (upright(want)) { if (raised) e._held.rotation.set(Math.PI, 0, 0); else e._held.rotation.set(-Math.PI / 2, 0, 0); }
      else if (e.reloadT > 0) { var k = 1 - e.reloadT / (e.reloadTotal || 1), ph = k < 0.5 ? k / 0.5 : 1 - (k - 0.5) / 0.5; e._held.rotation.set(0, Math.PI / 2, -Math.PI / 2 + 0.7 * ph); }
      else if (raised) e._held.rotation.set(0, Math.PI / 2, -Math.PI / 2);
      else e._held.rotation.set(0, Math.PI / 2, 0);
      // the hot mic cooking in the hand: the ON AIR cap blinks faster toward the bang
      if (want === 'hotmic') { var cap = e._held.getObjectByName('cap'); if (cap) { var ck = e._cook, w = WEAPONS.hotmic; var on = !ck ? (Math.sin(simT() * 3) > 0.3) : Math.sin(simT() * Math.PI * 2 * (2 + 10 * ck.t / w.fuse)) > 0; cap.material.color.setHex(on ? 0xff3a2a : 0x3a1010); } }
    }
    void dt;
  }
  // a hot mic in flight / a rocket in flight: skin the entity's default sphere with the real thing
  var MIC_GEO = null;
  function skinProjectile(e) {
    if (e._skinned || !e.mesh) return;
    e._skinned = true;
    var A = GTP.Assets;
    if (e.weaponId === 'hotmic' && A.weaponMesh) {
      var wm = A.weaponMesh('hotmic'); if (!wm) return;
      e.mesh.geometry = wm.geometry; e.mesh.material = wm.material; e.mesh.scale.setScalar(1.1);
      var cap = wm.getObjectByName('cap'); if (cap) { wm.remove(cap); e.mesh.add(cap); e._cap = cap; }
    } else if (e.weaponId === 'ratio') {
      if (!MIC_GEO) { var g = new GTP.GeoBuilder({ color: true }); g.cylinder(0, -0.3, 0, 0.09, 0.09, 0.5, 7, [0.35, 0.37, 0.4]); g.cylinder(0, 0.2, 0, 0.09, 0.02, 0.2, 7, [1, 0.25, 0.64]); g.box(-0.16, -0.3, -0.01, 0.32, 0.12, 0.02, GTP.GeoBuilder.UV0, [0.9, 0.9, 0.95]); g.box(-0.01, -0.3, -0.16, 0.02, 0.12, 0.32, GTP.GeoBuilder.UV0, [0.9, 0.9, 0.95]); MIC_GEO = g.build(); }
      e.mesh.geometry = MIC_GEO; e.mesh.material = A.propMaterial ? A.propMaterial() : e.mesh.material;
    }
  }
  function syncProjectile(e, dt) {
    if (!e.mesh) return;
    if (e.weaponId === 'hottake') { e.mesh.rotation.x += dt * 12; return; }
    if (e.weaponId === 'hotmic') {
      skinProjectile(e);
      if (e._cap) { var f = 2 + 10 * (1 - U.clamp(e.fuse / e.fuse0, 0, 1)); e._cap.material.color.setHex(Math.sin(e.age * Math.PI * 2 * f) > 0 ? 0xff3a2a : 0x3a1010); }
    } else if (e.weaponId === 'ratio') skinProjectile(e);
    void dt;
  }
  // --------------------------------------------------------------- pickups --
  var pickupT = 1.9, labelTex = {}, geoCache = {}, lastWeapon = null;
  function labelTexture(label) {
    if (labelTex[label]) return labelTex[label];
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
    var ctx = cv.getContext('2d'), band = SPONSOR_COLOR[label] || '#e8b53a';
    ctx.fillStyle = '#f4ecd8'; ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = band; ctx.fillRect(0, 0, 256, 28); ctx.fillRect(0, 140, 256, 20);
    ctx.fillStyle = '#1a1a22'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var words = label.split(' '), size = words.length > 1 ? 34 : 40;
    ctx.font = 'bold ' + size + 'px Arial, Helvetica, sans-serif';
    if (words.length > 1) { ctx.fillText(words[0], 128, 66, 240); ctx.fillText(words.slice(1).join(' '), 128, 106, 240); }
    else ctx.fillText(label, 128, 84, 240);
    ctx.font = 'bold 14px Arial, sans-serif'; ctx.fillStyle = '#f4ecd8'; ctx.fillText('SPONSORED PRODUCT', 128, 150);
    var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    labelTex[label] = tex;
    return tex;
  }
  function labelMesh(label, w, h) {
    var mat = new THREE.MeshBasicMaterial({ map: labelTexture(label), transparent: false });
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.name = 'label';
    return m;
  }
  function geo(key, build) {
    if (geoCache[key]) return geoCache[key];
    var g = new GTP.GeoBuilder({ color: true }); build(g);
    return (geoCache[key] = g.build());
  }
  var BOTTLE = [0.93, 0.93, 0.95];
  function bottleGeo(cap) {
    return geo('bottle:' + cap.join(','), function (g) {
      g.cylinder(0, 0, 0, 0.13, 0.13, 0.38, 10, BOTTLE);
      g.cylinder(0, 0.38, 0, 0.13, 0.06, 0.07, 10, BOTTLE);
      g.cylinder(0, 0.45, 0, 0.06, 0.06, 0.07, 8, BOTTLE);
      g.cylinder(0, 0.52, 0, 0.07, 0.07, 0.06, 8, cap);
    });
  }
  function bottle(label, cap) {
    var grp = new THREE.Group();
    var body = new THREE.Mesh(bottleGeo(cap), GTP.Assets.propMaterial()); body.castShadow = true; body.name = 'bottle';
    grp.add(body);
    var a = labelMesh(label, 0.22, 0.17); a.position.set(0, 0.19, 0.133); grp.add(a);
    var b = labelMesh(label, 0.22, 0.17); b.position.set(0, 0.19, -0.133); b.rotation.y = Math.PI; grp.add(b);
    return grp;
  }
  function glowSprite(color, scale) {
    var A = GTP.Assets;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glow, color: color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    sp.scale.set(scale, scale, 1); sp.position.y = 0.15; sp.name = 'glow';
    return sp;
  }
  function pickupMesh(pk) {
    var type = pk.pickupType, grp = new THREE.Group(), mat = GTP.Assets.propMaterial();
    var label = pk.label || SPONSOR[type === 'weapon' ? pk.weaponId : type] || null;
    if (type === 'cash') {
      var cg = geo('cash', function (g) {
        g.box(-0.24, 0, -0.14, 0.48, 0.07, 0.28, null, [0.25, 0.65, 0.3]);
        g.box(-0.22, 0.07, -0.12, 0.44, 0.06, 0.24, null, [0.3, 0.75, 0.35]);
        g.box(-0.06, 0, -0.15, 0.12, 0.14, 0.3, null, [0.95, 0.82, 0.3]);
      });
      var cm = new THREE.Mesh(cg, mat); cm.castShadow = true; grp.add(cm);
      grp.add(glowSprite(0x9dff3c, 1.3));
    } else if (type === 'health' || type === 'armor') {
      grp.add(bottle(label || (type === 'health' ? 'CLARITY PELLETS' : 'NAP DYNASTY'), type === 'health' ? [0.2, 0.75, 0.35] : [0.25, 0.45, 0.95]));
      grp.add(glowSprite(type === 'health' ? 0x5cff7a : 0x5aa8ff, 1.4));
    } else if (type === 'weapon' || type === 'mission') {
      var crate = geo('crate:' + (type === 'mission' ? 'gold' : 'wood'), function (g) {
        var wood = type === 'mission' ? [0.85, 0.68, 0.25] : [0.55, 0.4, 0.22], edge = type === 'mission' ? [0.6, 0.45, 0.12] : [0.35, 0.24, 0.12];
        g.box(-0.28, 0, -0.28, 0.56, 0.34, 0.56, null, wood);
        g.box(-0.29, 0.3, -0.29, 0.58, 0.05, 0.06, null, edge); g.box(-0.29, 0.3, 0.23, 0.58, 0.05, 0.06, null, edge);
        g.box(-0.29, 0.3, -0.29, 0.06, 0.05, 0.58, null, edge); g.box(0.23, 0.3, -0.29, 0.06, 0.05, 0.58, null, edge);
        g.box(-0.29, 0, -0.29, 0.06, 0.34, 0.06, null, edge); g.box(0.23, 0, -0.29, 0.06, 0.34, 0.06, null, edge);
        g.box(-0.29, 0, 0.23, 0.06, 0.34, 0.06, null, edge); g.box(0.23, 0, 0.23, 0.06, 0.34, 0.06, null, edge);
      });
      var crm = new THREE.Mesh(crate, mat); crm.castShadow = true; grp.add(crm);
      var lf = labelMesh(label || 'MERCH', 0.4, 0.22); lf.position.set(0, 0.17, 0.285); grp.add(lf);
      var lb = labelMesh(label || 'MERCH', 0.4, 0.22); lb.position.set(0, 0.17, -0.285); lb.rotation.y = Math.PI; grp.add(lb);
      if (type === 'weapon' && pk.weaponId && GTP.Assets.weaponMesh) {
        var wm = GTP.Assets.weaponMesh(pk.weaponId);
        if (wm) {
          var fit = (GTP.Assets.weaponFit && GTP.Assets.weaponFit[pk.weaponId]) || {};
          if (upright(pk.weaponId)) { wm.position.set(-0.08, 0.35, 0.02); wm.rotation.set(0, 0.5, 0); }
          else { var sc = fit.pickupScale || 1, len = (fit.len || 0.3) * sc; wm.position.set(-len * 0.5, 0.41, 0.05); wm.rotation.set(0, 0.35, 0); wm.scale.setScalar(sc); }
          grp.add(wm);
        }
        // the sponsor's bottle, same bottle, new label
        var bt = bottle(label || 'MERCH', [0.9, 0.72, 0.2]); bt.scale.setScalar(0.7); bt.position.set(0.17, 0.34, -0.12); grp.add(bt);
      }
      grp.add(glowSprite(type === 'mission' ? 0xffd45a : 0xffbe3c, 1.5));
    } else {
      var om = new THREE.Mesh(geo('misc', function (g) { g.box(-0.2, 0, -0.2, 0.4, 0.3, 0.4, null, [0.8, 0.8, 0.85]); }), mat); grp.add(om);
      grp.add(glowSprite(0xffffff, 1.2));
    }
    grp.name = 'pickup:' + type;
    return grp;
  }
  function spawnPickup(o) {
    o = o || {};
    var Wd = W(), x = o.x, z = o.z;
    var pk = new GTP.Pickup({ x: x, z: z, pickupType: o.type || o.pickupType || 'cash', value: o.value || 0, weaponId: o.weaponId || null, ammo: o.ammo || 0, respawn: o.respawn || 0, persistent: !!o.persistent, tag: o.tag || null });
    pk.y = o.y != null ? o.y : Wd.heightAt(x, z, o.yHint || 0); pk.baseY = pk.y;
    pk.label = o.label || null;
    pk.snap();
    E().add(pk);
    return pk;
  }
  // a free spot beside a landmark door (the marker sits on the door itself)
  function pickupSpot(lm, i) {
    var Wd = W(), door = lm.door, ox = door.x - lm.x, oz = door.z - lm.z, ol = Math.sqrt(ox * ox + oz * oz) || 1;
    ox /= ol; oz /= ol;
    var sx = -oz, sz = ox, sign = (i % 2) ? -1 : 1, cands = [
      { x: door.x + sx * 3 * sign + ox * 0.8, z: door.z + sz * 3 * sign + oz * 0.8 },
      { x: door.x - sx * 3 * sign + ox * 0.8, z: door.z - sz * 3 * sign + oz * 0.8 },
      { x: door.x + ox * 3, z: door.z + oz * 3 },
      { x: door.x + sx * 1.6 * sign, z: door.z + sz * 1.6 * sign }
    ];
    for (var k = 0; k < cands.length; k++) {
      var c = cands[k], t = Wd.tileAt(c.x, c.z), T = Wd.T;
      if (t === T.BUILDING || t === T.WATER || t === T.VOID || t === T.ROAD || t === T.RAMP) continue;
      if (Wd.solidAt(c.x, c.z, 0.5)) continue;
      var r = Wd.resolveCapsule(c.x, c.z, 0.5, 0.5);
      return { x: r.x, z: r.z };
    }
    return { x: door.x, z: door.z };
  }
  function spawnWorldPickups() {
    var CW = GTP.Content && GTP.Content.world, tbl = CW && CW.spawn && CW.spawn.pickups;
    if (!tbl || !W().tiles) return;
    var done = GTP.Missions && GTP.Missions.state && GTP.Missions.state.completed;
    for (var i = 0; i < tbl.length; i++) {
      var d = tbl[i], key = i + ':' + d.type + ':' + (d.weaponId || '') + ':' + (d.landmark || '');
      var have = Combat.pickups.get(key);
      if (have && !have.removed) continue;
      if (d.after && !(done && done.has && done.has(d.after))) continue;
      var lm = W().landmark(d.landmark); if (!lm || !lm.door) continue;
      var pos = d.x != null ? { x: d.x, z: d.z } : pickupSpot(lm, i);
      var pk = spawnPickup({ type: d.type, value: d.value || (d.type === 'health' || d.type === 'armor' ? 50 : 0), weaponId: d.weaponId, ammo: d.ammo, x: pos.x, z: pos.z, persistent: true, respawn: d.respawn || (d.type === 'weapon' ? 180 : 90), label: d.label, tag: 'world' });
      Combat.pickups.set(key, pk);
    }
  }
  function collectPickup(pk, p) {
    var t = pk.pickupType, msg = null, color = 0xfff0a0;
    if (t === 'cash') { p.money += pk.value | 0; msg = '+' + U.fmtMoney(pk.value); color = 0x9dff3c; }
    else if (t === 'health') { p.hp = Math.min(p.maxHp, p.hp + (pk.value || 50)); msg = (pk.label || SPONSOR.health) + ': health restored'; color = 0x5cff7a; }
    else if (t === 'armor') { p.armor = Math.min(100, (p.armor || 0) + (pk.value || 50)); msg = (pk.label || SPONSOR.armor) + ': firmness +' + (pk.value || 50); color = 0x5aa8ff; }
    else if (t === 'weapon' && pk.weaponId && WEAPONS[pk.weaponId]) {
      var id = pk.weaponId, w = WEAPONS[id], n = pk.ammo || (w.melee ? Infinity : 20);
      if (w.melee) { p.weapons[id] = Infinity; msg = w.name; }
      else { p.weapons[id] = (p.weapons[id] || 0) + n; ammoOf(p, id); msg = w.name + ' +' + n; }
      if (pk.label) msg += ' (' + pk.label + ')';
      p.weapon = id; cancelReload(p); color = 0xffbe3c;
    } else return false;
    fx({ type: 'ring', x: pk.x, y: pk.y + 0.05, z: pk.z, size: 1.3, life: 0.4, color: color });
    textFx(msg, pk.x, pk.y + 1.4, pk.z, '#' + ('000000' + color.toString(16)).slice(-6), 1.2);
    toast(msg);
    p.stats.pickups = (p.stats.pickups || 0) + 1;
    return true;
  }

  // --------------------------------------------------- death and respawn --
  function clearPlayerCombatState(p) {
    p.ammo = {}; p.reloadT = 0; p.reloadTotal = 0; p._cook = null; p._casingT = 0; p._burst = null;
    bloom.cone = 0; bloom.k = 0; bloom.burst = 0;
    if (scope.active) { scope.active = false; if (p.cameraMode === 'first') p.cameraMode = p._scopeCam || 'chase'; p._scopeCam = null; }
    if (wheel.open) closeWheel(p, false);
  }
  function deathTick(p, dt) {
    var g = GTP.game, d = Combat.death;
    if (!d) d = Combat.death = { kind: g.state === 'busted' ? 'busted' : 'wasted', t: 0, text: failText(g.state === 'busted' ? 'busted' : 'wasted') };
    d.t += dt;
    // the body keeps simulating while the rest of the city is frozen
    p._px = p.x; p._py = p.y; p._pz = p.z; p._pyaw = p.yaw;
    try { p.update(dt); } catch (e) { U.reportError(e, 'combat.deathTick'); }
    if (p._sh) E().hash.update(p);
    var rig = GTP.Render && GTP.Render.rig;
    if (rig && d.kind === 'wasted') { rig.pitch = U.damp(rig.pitch, 0.62, 1.4, dt); rig.yaw += dt * 0.3; }
    if (d.t >= RESPAWN_DELAY) respawnPlayer(d.kind === 'busted' ? 'police' : 'hospital');
  }
  function respawnPlayer(kind) {
    var p = player(), g = GTP.game, Wd = W(); if (!p || !g) return;
    var CW = GTP.Content && GTP.Content.world, rs = (CW && CW.respawn) || {};
    var id = kind === 'police' ? (rs.police || 'police_hq') : (rs.hospital || 'hospital');
    var lm = Wd.landmark(id), door = lm && lm.door ? lm.door : null;
    var x = door ? door.x : p.x, z = door ? door.z : p.z, yaw = p.yaw;
    if (lm && door) {
      var ox = door.x - lm.x, oz = door.z - lm.z, ol = Math.sqrt(ox * ox + oz * oz) || 1; ox /= ol; oz /= ol;
      x = door.x + ox * 1.6; z = door.z + oz * 1.6; yaw = U.dirToYaw(ox, oz);
      var res = Wd.resolveCapsule(x, z, 0.5, C.PLAYER.radius); x = res.x; z = res.z;
      if (Wd.solidAt(x, z, 0.5)) { x = door.x; z = door.z; }
    }
    var fine = 0;
    if (kind === 'police') { fine = C.ECONOMY.bustedFine; p.money = Math.max(0, p.money - fine); p.stats.busted = (p.stats.busted || 0) + 1; }
    else { fine = Math.round(p.money * C.ECONOMY.deathCashLoss); p.money = Math.round(p.money * (1 - C.ECONOMY.deathCashLoss)); p.stats.deaths = (p.stats.deaths || 0) + 1; }
    if (p.inVehicle) p.exitVehicle();
    p.weapons = { fist: Infinity }; p.weapon = 'fist';
    clearPlayerCombatState(p);
    p.alive = true; p.hp = p.maxHp; p.armor = 0; p.knockedDown = false; p.downT = 0; p.swimming = false; p.state = 'idle';
    p.corpseT = 0; p.deadT = 0; p.tilt = 0; p.hurtT = 0; p.entering = null; p.lastHitBy = null; p.lastHitType = null; p.respawnT = 0;
    p.x = x; p.z = z; p.y = Wd.heightAt(x, z, 0); p.yaw = yaw; p.vx = p.vz = p.vy = 0; p.onGround = true;
    p.aiming = false; p.lockTarget = null; p.firePoseT = 0; p.punchT = 0; p.intent.x = p.intent.z = 0;
    p.snap();
    if (p._sh) E().hash.update(p);
    if (wanted()) wanted().clear();
    p.controlEnabled = true;
    Combat.death = null; Combat.hurtFlash = 0;
    aim.active = false; aim.target = null;
    g.setState('playing');
    if (GTP.Render && GTP.Render.rig) { GTP.Render.rig.yaw = yaw; GTP.Render.rig.pitch = 0.2; GTP.Render.rig.snap(); GTP.Render.updateCamera(0); }
    var name = lm ? (lm.label || lm.name) : (kind === 'police' ? 'the precinct' : 'the hospital');
    toast(kind === 'police' ? 'Released from ' + name + '. Fine: ' + U.fmtMoney(fine) + '. Rated a four.' : 'Discharged from ' + name + '. The bandage has a coupon code. ' + U.fmtMoney(-fine));
    GTP.Events.emit('player:respawn', { player: p, at: kind });
  }
  // --------------------------------------------------------------- update --
  function armCop(e) {
    // cops at three stars or more may carry The Rebuttal; SWAT carry The Monologue (once, on sight; mission goons keep theirs)
    e._armed = true;
    if (e.hostile || (e.ai && e.ai.mission)) return;
    var lvl = wanted() ? wanted().level : 0;
    if (e.role === 'swat') e.weapon = 'rifle';
    else if (e.role === 'cop' && lvl >= 3 && (e.weapon === 'pistol' || !e.weapon) && R().chance(0.5)) e.weapon = 'revolver';
  }
  function entityPass(dt) {
    var list = E().list, cs = C.PHYS.corpseSeconds;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.removed) continue;
      if (e.kind === 'ped' || e.kind === 'player') {
        if (e.kind === 'ped' && !e._armed && isCopRole(e)) armCop(e);
        if (e.mesh) {
          syncHeld(e, dt);
          if (!e.alive && e.kind === 'ped' && !e.persistent) {
            // the fade: sink and shrink into the pavement over the last 1.5 s
            var k = (e.corpseT - (cs - 1.5)) / 1.5;
            if (k > 0) { var base = (e.look && e.look.scale) || 1, s = base * (1 - U.clamp(k, 0, 0.98)); e.mesh.scale.set(base, Math.max(0.02, s), base); e._fading = true; }
            else if (e._fading) { e._fading = false; var b2 = (e.look && e.look.scale) || 1; e.mesh.scale.setScalar(b2); }
          }
        }
        // an AI burst: autos fire two more rounds after the first
        if (e._burst && e.kind === 'ped') {
          var bu = e._burst; bu.t += dt;
          if (!e.alive || e.inVehicle || e.knockedDown || !WEAPONS[bu.id]) e._burst = null;
          else if (bu.t >= 0.09) { bu.t = 0; bu.n--; var bw = WEAPONS[bu.id]; hitscan(e, bw, bu.id, aimContext(e, bw)); e.firePoseT = Math.max(e.firePoseT || 0, 0.5); if (bu.n <= 0) e._burst = null; }
        }
        // the sniper's casing comes out with the bolt, a beat after the shot
        if (e._casingT > 0) { e._casingT -= dt; if (e._casingT <= 0) { var mo = muzzle(e), md = U.yawToDir(e.aimYaw || e.yaw); ejectCasing(e, mo, { x: md.x, y: 0, z: md.z }, e.weapon); } }
      } else if (e.kind === 'projectile') {
        if (e.weaponId === 'hottake') { e._trailT = (e._trailT || 0) + dt; if (e._trailT > 0.05) { e._trailT = 0; fx({ type: 'smoke', x: e.x, y: e.y, z: e.z, size: 0.35, life: 0.5, color: 0xffa060, vy: 0.4 }); } }
        syncProjectile(e, dt);
      } else if (e.kind === 'vehicle' && e._flipT > 0) {
        // the rocket's flip: a barrel roll over the airtime (the physics damps roll toward the ground slope; this rides on top)
        e._flipT -= dt;
        var fk = 1 - Math.max(0, e._flipT) / e._flipDur;
        e.roll = fk * Math.PI * 2 * (e._flipDir || 1);
        if (e._flipT <= 0) { e._flipT = 0; e.roll = 0; }
      }
    }
  }
  // the player's per-step combat housekeeping (playing only)
  function playerTick(p, dt) {
    var In = GTP.Input;
    tickReload(p, dt);
    tickBloom(p, dt);
    updateScope(p, dt);
    updateWheel(p, dt);
    tickCook(p, dt, In);
    if (p._backblast) { var bb = p._backblast; bb.t -= dt; if (bb.t <= 0 || !p.onGround || p.inVehicle || p.knockedDown) p._backblast = null; else { p.vx = bb.x; p.vz = bb.z; } }
    if (!p.alive || !p.controlEnabled) return;
    if (In.pressed('reload') && !wheel.open && !p._cook) { if (!p.inVehicle || driveByWeapon(p.weapon)) Combat.reload(p); }
    var w = WEAPONS[p.weapon];
    if (p.inVehicle && p.inVehicle.driver === p && w) {
      // thrown things go out of the window without aim; the long guns refuse with a toast
      if (w.lobbed && (In.down('shoot') || In.down('action')) && !p._cook) { try { Combat.fire(p, p.weapon); } catch (e) { U.reportError(e, 'combat.windowThrow'); } }
      else if (In.down('aim') && !w.melee && !w.cone && !w.lobbed && !w.driveBy) { var now = simT(); if (now - (p._refuseT || -9) > 3) { p._refuseT = now; toast(DRIVEBY_REFUSAL); } }
    }
  }

  // ----------------------------------------------------------------- shop --
  // Both Sides Arms. Items from GDD_EXPANSION.md 2.4 (GTP.Content.expansion.shop.items overrides by id); stores are every
  // landmark of kind 'gunshop' (plus Content.expansion.shop.stores ids). A green marker at each door; 0.5 s inside it on foot
  // emits 'shop:open' (and calls UI.openShop when the UI has one).
  var SHOP_ITEMS = [
    { id: 'ammo_pistol', tab: 'ammo', weapon: 'pistol', rounds: 24, price: 60, name: 'Pistol rounds (24)' },
    { id: 'ammo_revolver', tab: 'ammo', weapon: 'revolver', rounds: 12, price: 90, name: 'Rebuttal rounds (12)' },
    { id: 'ammo_smg', tab: 'ammo', weapon: 'smg', rounds: 60, price: 150, name: 'SMG rounds (60)' },
    { id: 'ammo_rifle', tab: 'ammo', weapon: 'rifle', rounds: 60, price: 220, name: 'Monologue rounds (60)' },
    { id: 'ammo_shotgun', tab: 'ammo', weapon: 'shotgun', rounds: 12, price: 120, name: 'Shells (12)' },
    { id: 'ammo_sniper', tab: 'ammo', weapon: 'sniper', rounds: 5, price: 250, name: 'Fact Checker rounds (5)' },
    { id: 'ammo_hottake', tab: 'ammo', weapon: 'hottake', rounds: 3, price: 90, name: 'Hot Takes (3)' },
    { id: 'ammo_hotmic', tab: 'ammo', weapon: 'hotmic', rounds: 4, price: 400, name: 'Hot Mics (4)' },
    { id: 'ammo_ratio', tab: 'ammo', weapon: 'ratio', rounds: 1, price: 600, name: 'Rocket (1)' },
    { id: 'ammo_megaphone', tab: 'ammo', weapon: 'megaphone', rounds: 20, price: 40, name: 'Megaphone charges (20)' },
    { id: 'clarity_pellets', tab: 'gear', price: 150, hp: 50, name: 'Clarity Pellets', pitch: "Your doctor won't sell you these. I will." },
    { id: 'clarity_family', tab: 'gear', price: 400, hp: 'full', name: 'Clarity Pellets, Family Size', pitch: 'The family is you, four times.' },
    { id: 'firmness_vest', tab: 'gear', price: 500, armor: 100, name: 'Nap Dynasty Firmness Vest', pitch: 'Firmness level nine. Code VEST20 does nothing.' },
    { id: 'range_reset', tab: 'range', price: 50, flagship: true, name: 'Range reset', pitch: 'Six hecklers, sixty seconds. They still don\'t sue.' }
  ];
  var PITCH = { tableleg: 'It fell off the table. The honest weapon.', megaphone: 'Louder is a position.', pistol: 'For a journalist, four hundred. Four fifty.', revolver: 'Six rebuttals. Reload is a rebuttal too.', smg: 'Volume. That\'s the whole pitch.', rifle: 'It never stops talking. Neither do you.', shotgun: 'Everyone in the front row has an opinion.', sniper: 'Reads at two hundred metres. Breathe.', hottake: 'Still warm. Three to a box.', hotmic: 'It was on the whole time.', ratio: 'Ask about our loaner. There is no loaner.' };
  function shopItems() {
    var out = [], i;
    for (i = 1; i < ORDER.length; i++) { var id = ORDER[i]; out.push({ id: id, tab: 'weapons', weapon: id, price: WEAPONS[id].price, name: WEAPONS[id].name, unlock: UNLOCK[id] || null, pitch: PITCH[id] || '' }); }
    for (i = 0; i < SHOP_ITEMS.length; i++) out.push(Object.assign({ unlock: UNLOCK[SHOP_ITEMS[i].weapon] || null }, SHOP_ITEMS[i]));
    var X = GTP.Content && GTP.Content.expansion && GTP.Content.expansion.shop, ext = X && X.items;
    if (ext && ext.length) for (i = 0; i < ext.length; i++) {
      var it = ext[i], found = false;
      for (var k = 0; k < out.length; k++) if (out[k].id === it.id) { out[k] = Object.assign(out[k], it); found = true; break; }
      if (!found) out.push(Object.assign({}, it));
    }
    return out;
  }
  function missionTitle(id) {
    var lists = [GTP.Content && GTP.Content.missions, GTP.Content && GTP.Content.expansion && GTP.Content.expansion.missions];
    for (var l = 0; l < lists.length; l++) { var L = lists[l]; if (!L) continue; for (var i = 0; i < L.length; i++) if (L[i] && L[i].id === id) return L[i].title || L[i].name || id; }
    return id;
  }
  function unlocked(item) {
    if (!item.unlock) return true;
    var Ms = GTP.Missions && GTP.Missions.state; if (!Ms) return false;
    if (Ms.completed && Ms.completed.has && Ms.completed.has(item.unlock)) return true;
    if (item.weapon === 'ratio' && Ms.flags && (Ms.flags.memos40 || Ms.flags.ratio_unlocked)) return true;
    return false;
  }
  var shop = {
    state: { open: false, landmark: null, store: null, flagship: false },
    discountHook: null,        // fn(player) -> 0..0.4 (Monday Memos / subscriber tiers; the strands agent sets it)
    rangeT: 0, rangeBest: null,
    _stores: [], _markers: [], _seed: null, _armed: {}, _hold: 0, _cur: null, _pulse: 0,
    discount: function () {
      var p = player(), d = 0, X = GTP.Content && GTP.Content.expansion && GTP.Content.expansion.shop;
      try { if (typeof shop.discountHook === 'function') d += shop.discountHook(p) || 0; if (X && typeof X.discount === 'function') d += X.discount(p) || 0; } catch (e) { U.reportError(e, 'shop.discount'); }
      return U.clamp(d, 0, 0.4);
    },
    price: function (item) { return Math.round(item.price * (1 - shop.discount())); },
    stores: function () { shopRefresh(); return shop._stores; },
    items: function (tab) {
      var p = player(), raw = shopItems(), out = [], disc = shop.discount();
      for (var i = 0; i < raw.length; i++) {
        var it = raw[i]; if (tab && it.tab !== tab) continue;
        var w = it.weapon ? WEAPONS[it.weapon] : null, tot = p && w ? p.weapons[it.weapon] : 0, a = p && w && tot > 0 ? ammoOf(p, it.weapon) : null, lock = !unlocked(it);
        out.push(Object.assign({}, it, {
          listPrice: it.price, price: Math.round(it.price * (1 - disc)), locked: lock, lockedBy: lock ? missionTitle(it.unlock) : null,
          owned: it.tab === 'weapons' ? tot > 0 || tot === Infinity : false, ammo: tot === Infinity ? null : (tot | 0), mag: a && w.mag ? a.mag : null, reserve: a ? a.reserve : null,
          stats: w ? weaponStats(it.weapon) : null, canBuy: !!p && !lock && p.money >= Math.round(it.price * (1 - disc)) && !(it.flagship && !shop.state.flagship) && !(it.tab === 'weapons' && (tot > 0 || tot === Infinity))
        }));
      }
      return out;
    },
    buy: function (itemId) {
      var p = player(), items = shop.items(), item = null;
      for (var i = 0; i < items.length; i++) if (items[i].id === itemId) { item = items[i]; break; }
      if (!item || !p) return { ok: false, reason: 'unknown', item: null, price: 0 };
      var price = item.price;
      if (item.locked) return { ok: false, reason: 'locked', item: item, price: price, lockedBy: item.lockedBy };
      if (item.flagship && !shop.state.flagship) return { ok: false, reason: 'flagship', item: item, price: price };
      if (item.tab === 'weapons' && item.owned) return { ok: false, reason: 'owned', item: item, price: price };
      if (p.money < price) return { ok: false, reason: 'funds', item: item, price: price, need: price - p.money };
      var w = item.weapon ? WEAPONS[item.weapon] : null, msg = item.name;
      if (item.tab === 'weapons' && w) {
        if (w.melee) p.weapons[item.weapon] = Infinity;
        else { var give = w.mag ? w.mag * 2 : (w.pack || 1) * 2; p.weapons[item.weapon] = (p.weapons[item.weapon] || 0) + give; ammoOf(p, item.weapon); msg += ' +' + give; }
        p.weapon = item.weapon; cancelReload(p);
      } else if (item.tab === 'ammo' && w) {
        var fit = giveAmmo(p, item.weapon, item.rounds, true);
        if (!(fit > 0)) return { ok: false, reason: 'full', item: item, price: price };
        msg += ' +' + fit; if (p.weapon === 'fist') p.weapon = item.weapon;
      } else if (item.hp) { if (p.hp >= p.maxHp && !item.armor) return { ok: false, reason: 'full', item: item, price: price }; p.hp = item.hp === 'full' ? p.maxHp : Math.min(p.maxHp, p.hp + item.hp); }
      else if (item.armor) { if ((p.armor || 0) >= 100) return { ok: false, reason: 'full', item: item, price: price }; p.armor = Math.min(100, item.armor); }
      else if (item.id === 'range_reset') { shop.rangeT = 60; emit('shop:range', { landmark: shop.state.landmark, seconds: 60 }); }
      p.money -= price; p.stats.spent = (p.stats.spent || 0) + price; p.stats.shopBuys = (p.stats.shopBuys || 0) + 1;
      sfx('cash', p.x, p.z, 0.8);
      emit('shop:buy', { item: item, price: price, player: p });
      if (p.weapon === item.weapon || item.tab !== 'weapons') toast(msg + ': ' + U.fmtMoney(-price));
      return { ok: true, item: item, price: price, msg: msg };
    },
    open: function (landmarkId) {
      var lm = landmarkId && typeof landmarkId === 'object' ? landmarkId : (W() && W().landmark ? W().landmark(landmarkId) : null);
      var st = storeFor(lm);
      shop.state.open = true; shop.state.landmark = lm || null; shop.state.store = st; shop.state.flagship = !!(st && st.flagship);
      sfx('ui', 0, 0, 0.4);
      emit('shop:open', { landmark: lm, store: st });
      if (GTP.UI && typeof GTP.UI.openShop === 'function') { try { GTP.UI.openShop(st, lm); } catch (e) { U.reportError(e, 'ui.openShop'); } }
      return shop.state;
    },
    close: function () {
      if (!shop.state.open) return;
      shop.state.open = false; var lm = shop.state.landmark; shop.state.landmark = null; shop.state.store = null; shop.state.flagship = false;
      if (lm) shop._armed[lm.id] = false;
      emit('shop:close', { landmark: lm });
    },
    refresh: function () { shop._seed = null; shopRefresh(); return shop._stores; }
  };
  function weaponStats(id) {
    var w = WEAPONS[id]; if (!w) return null;
    var dps = w.melee ? w.dmg * w.rate : w.cone ? 0 : w.dmg * (w.pellets ? 1 : 1) * Math.min(w.rate, 12);
    return { damage: U.clamp(w.dmg / 200, 0.05, 1), rate: U.clamp(w.rate / 11, 0.05, 1), range: U.clamp(w.range / 160, 0.03, 1), accuracy: w.spread != null ? U.clamp(1 - w.spread / 0.09, 0.1, 1) : (w.melee ? 1 : 0.4), volume: U.clamp((w.mag || w.reserve || 1) / 30, 0.05, 1), dps: dps };
  }
  // a landmark option (flagship, gag) from the runtime landmark or, failing that, its content definition
  function lmFlag(lm, key) {
    if (!lm) return undefined;
    if (lm[key] !== undefined) return lm[key];
    var defs = GTP.Content && GTP.Content.world && GTP.Content.world.landmarks;
    if (defs) for (var i = 0; i < defs.length; i++) if (defs[i] && defs[i].id === lm.id) return defs[i][key];
    return undefined;
  }
  function storeFor(lm) {
    if (!lm) return null;
    for (var i = 0; i < shop._stores.length; i++) if (shop._stores[i].id === lm.id) return shop._stores[i];
    return { id: lm.id, name: lm.name || 'Both Sides Arms', flagship: !!lmFlag(lm, 'flagship'), landmark: lm };
  }
  // the store's trigger beside the door: 3.2 m along the wall on a walkable tile (the door itself when neither side is)
  function shopSpot(Wd, lm) {
    var d = lm.door, b = lm.building, T = Wd.T;
    if (!b || !Wd.tileAt) return { x: d.x, z: d.z };
    var nx = d.x - (b.x + b.w / 2), nz = d.z - (b.z + b.d / 2);
    var ax = Math.abs(nx) > Math.abs(nz) ? 0 : 1, az = ax ? 0 : 1;
    var cands = [[d.x + ax * 3.2, d.z + az * 3.2], [d.x - ax * 3.2, d.z - az * 3.2]];
    for (var i = 0; i < cands.length; i++) {
      var t = Wd.tileAt(cands[i][0], cands[i][1]);
      if ((t === T.SIDEWALK || t === T.PLAZA || t === T.PARKING || t === T.GRASS) && !Wd.solidAt(cands[i][0], cands[i][1], (d.y || 0) + 0.5)) return { x: cands[i][0], z: cands[i][1] };
    }
    return { x: d.x, z: d.z };
  }
  function shopRefresh() {
    var Wd = W(); if (!Wd || !Wd.landmarks) return;
    if (shop._seed === Wd._seed && shop._count === Wd.landmarks.length) return;
    shop._seed = Wd._seed; shop._count = Wd.landmarks.length;
    for (var m = 0; m < shop._markers.length; m++) if (GTP.Render && GTP.Render.removeMarker) GTP.Render.removeMarker(shop._markers[m]);
    shop._markers = []; shop._stores = []; shop._armed = {};
    var X = GTP.Content && GTP.Content.expansion && GTP.Content.expansion.shop, ids = (X && X.stores) || [], seen = {};
    var lms = Wd.landmarks.slice();
    for (var i = 0; i < ids.length; i++) { var id = typeof ids[i] === 'string' ? ids[i] : ids[i] && ids[i].id, lm0 = id && Wd.landmark(id); if (lm0 && lms.indexOf(lm0) < 0) lms.push(lm0); }
    for (i = 0; i < lms.length; i++) {
      var lm = lms[i]; if (!lm || seen[lm.id] || !lm.door) continue;
      var listed = false; for (var k = 0; k < ids.length; k++) if ((typeof ids[k] === 'string' ? ids[k] : ids[k] && ids[k].id) === lm.id) listed = true;
      if (lm.kind !== 'gunshop' && !listed) continue;
      seen[lm.id] = true;
      // the store's green light stands 3.2 m along the wall from the door, so a mission's blue light on the door (m03b at the
      // Strip shop) and the shop never share a trigger: the first 0.5 s stand would open the page under the mission
      var sp = shopSpot(Wd, lm);
      shop._stores.push({ id: lm.id, name: lm.name || 'Both Sides Arms', flagship: !!lmFlag(lm, 'flagship'), gag: lmFlag(lm, 'gag') || null, landmark: lm, x: sp.x, z: sp.z });
      if (GTP.Render && GTP.Render.markerMesh && GTP.Render.addMarker && GTP.Render.scene) {
        var mk = GTP.Render.markerMesh(0x3fd27f, { radius: 1.5, height: 6.5 }); mk.position.set(sp.x, lm.door.y || Wd.heightAt(sp.x, sp.z, 0), sp.z); mk.name = 'marker:shop:' + lm.id;
        GTP.Render.addMarker(mk); shop._markers.push(mk);
      }
    }
  }
  function shopTick(p, dt) {
    shopRefresh();
    if (!shop._stores.length) return;
    shop._pulse += dt;
    var k = 0.5 + 0.5 * Math.sin(shop._pulse * 3);
    for (var m = 0; m < shop._markers.length; m++) { var ud = shop._markers[m].userData; if (ud && ud.pulse) ud.pulse(k); }
    if (shop.state.open || p.inVehicle || !p.alive || p.knockedDown || (GTP.game && GTP.game.state !== 'playing')) return;
    var cur = null;
    for (var i = 0; i < shop._stores.length; i++) { var s = shop._stores[i]; if (U.dist2d(p.x, p.z, s.x, s.z) < C.MISSIONS.markerRadius + 0.2 && Math.abs(p.y - (s.landmark.door.y || 0)) < 2.5) { cur = s; break; } }
    for (i = 0; i < shop._stores.length; i++) if (shop._stores[i] !== cur) shop._armed[shop._stores[i].id] = true;
    if (!cur) { shop._cur = null; shop._hold = 0; return; }
    if (shop._armed[cur.id] === undefined) shop._armed[cur.id] = true;   // a store the player spawned inside arms on the first exit
    if (!shop._armed[cur.id]) return;
    if (shop._cur !== cur) { shop._cur = cur; shop._hold = 0; }
    shop._hold += dt;
    if (shop._hold >= C.MISSIONS.startHold) { shop._hold = 0; shop._armed[cur.id] = false; shop.open(cur.landmark); }
  }

  var Combat = GTP.Combat = {
    WEAPONS: WEAPONS,
    ORDER: ORDER,
    SPONSOR: SPONSOR,
    SPONSOR_COLOR: SPONSOR_COLOR,
    UNLOCK: UNLOCK,
    RESPAWN_DELAY: RESPAWN_DELAY,
    AI_DAMAGE_MUL: AI_DAMAGE_MUL,
    aim: aim,
    scope: scope,
    wheel: wheel,
    bloom: bloom,
    hitmark: hitmark,
    shop: shop,
    death: null,
    hurtFlash: 0,
    pickups: new Map(),
    HotMic: HotMic,
    Rocket: Rocket,

    cycleWeapon: cycleWeapon,
    wheelStep: wheelStep,
    update: function (dt) {
      ensureHooks();
      var g = GTP.game, p = player(); if (!g || !p) return;
      var st = g.state;
      if (st === 'wasted' || st === 'busted') { deathTick(p, dt); updateFlash(); tickMuzzleLight(dt, null, null); return; }
      if (st !== 'playing' && st !== 'cutscene' && st !== 'minigame') return;
      if (p.alive && p.hp <= 0) p.die(p.lastHitBy || null, p.lastHitType || 'debug');
      else if (!p.alive && !Combat.death) Combat.onPlayerDeath(p, p.lastHitBy, p.lastHitType);
      if (Combat.death) {
        if (!p.alive) return;
        // someone (a mission, a load) put the game back in play mid-flow: drop the stale card state
        Combat.death = null; p.controlEnabled = true;
      }
      if (st === 'playing') { updateAim(p, dt); playerTick(p, dt); shopTick(p, dt); }
      else { aim.active = false; aim.target = null; p.lockTarget = null; if (scope.active) updateScope(p, dt); if (wheel.open) closeWheel(p, false); }
      if (p.weapon !== lastWeapon) { lastWeapon = p.weapon; cancelReload(p); p._cook = null; GTP.Events.emit('weapon', { id: p.weapon, name: Combat.weaponName(p.weapon), ammo: p.weapons[p.weapon] }); }
      entityPass(dt);
      updateFlash();
      tickMuzzleLight(dt, p, GTP.Input);
      if (Combat.hurtFlash > 0) Combat.hurtFlash = Math.max(0, Combat.hurtFlash - dt * 2.5);
      pickupT += dt;
      if (pickupT > 2) { pickupT = 0; spawnWorldPickups(); }
    },

    // Fire the ped's weapon toward its target. Rate-limited per ped; the player spends ammo (and reloads an empty magazine).
    fire: function (ped, weaponId) {
      if (!ped || !ped.alive || ped.knockedDown || ped.entering || ped.swimming) return false;
      var id = weaponId || ped.weapon || 'fist', w = WEAPONS[id]; if (!w) return false;
      var isPlayer = ped.kind === 'player';
      if (ped.inVehicle && !(isPlayer && ((ped.aiming && driveByWeapon(id)) || w.lobbed))) return false;   // a drive-by needs a gun and the aim held
      var now = simT();
      if (isPlayer && wheel.open) return false;
      if (isPlayer && id === 'hotmic' && ped.weapons[id] > 0) { if (!ped._cook) startCook(ped, id); return false; }   // the mic cooks until the trigger is released; the throw keeps the cadence
      if (ped._fireT != null && now - ped._fireT < 1 / w.rate - 1e-6) return false;
      if (isPlayer && !w.melee) {
        var a = ammoOf(ped, id);
        if (!a) { if (now - (ped._dryT || -9) > 0.5) { ped._dryT = now; sfx('ui', ped.x, ped.z, 0.3); } dryWeapon(ped, id); return false; }
        if (w.mag && a.mag <= 0) {
          if (a.reserve > 0) { if (!(ped.reloadT > 0)) startReload(ped, id); }
          else { if (now - (ped._dryT || -9) > 0.5) { ped._dryT = now; sfx('ui', ped.x, ped.z, 0.3); } dryWeapon(ped, id); }
          return false;
        }
        if (ped.reloadT > 0) { if (w.shellReload && a.mag > 0) cancelReload(ped); else return false; }   // a pump interrupts its own shell-by-shell reload
      }
      ped._fireT = now;
      var ctx = aimContext(ped, w), fired;
      if (w.melee) fired = melee(ped, w, ctx);
      else if (w.cone) fired = megaphone(ped, w, ctx);
      else if (w.rocket) fired = launch(ped, w, id, ctx);
      else if (w.lobbed) fired = lob(ped, w, id, ctx);
      else fired = hitscan(ped, w, id, ctx);
      if (!w.melee) ped.firePoseT = Math.max(ped.firePoseT || 0, 0.5);
      if (!isPlayer && fired && w.auto && !w.melee) ped._burst = { n: 2, id: id, t: 0 };
      if (isPlayer && !w.melee && fired) spend(ped, id);
      return !!fired;
    },
    reload: function (ped) { ped = ped || player(); if (!ped) return false; return startReload(ped, ped.weapon); },
    ammo: function (ped, id) { ped = ped || player(); return ped ? ammoOf(ped, id || ped.weapon) : null; },
    giveAmmo: giveAmmo,

    damage: function (target, n, src, type) {
      if (!target || !(n > 0)) return 0;
      if (target.applyDamage) return target.applyDamage(n, src, type) || 0;
      return 0;
    },
    projectileHit: projectileHit,
    collectPickup: collectPickup,
    spawnPickup: spawnPickup,
    pickupMesh: pickupMesh,
    spawnWorldPickups: spawnWorldPickups,
    openWheel: function (source) { var p = player(); if (p) openWheel(p, source || 'api'); return wheel; },
    closeWheel: function (equip) { closeWheel(player(), equip !== false); return wheel; },
    setZoom: function (z) { scope.zoom = z >= 4 ? 4 : 2; emit('scope', { active: scope.active, zoom: scope.zoom }); },

    onPlayerDeath: function (p, src, type) {
      var g = GTP.game; if (!g || !p) return;
      if (Combat.death && Combat.death.kind === 'wasted') return;
      p.controlEnabled = false; p.aiming = false; p.lockTarget = null; p.firePoseT = 0; p.punchT = 0;
      p.intent.x = p.intent.z = 0;
      aim.active = false; aim.target = null;
      cancelReload(p); p._cook = null;
      if (scope.active) updateScope(p, 0);
      if (wheel.open) closeWheel(p, false);
      if (p.inVehicle) p.exitVehicle();
      Combat.death = { kind: 'wasted', t: 0, src: src || null, type: type || null, text: failText('wasted') };
      p.stats.deaths = p.stats.deaths || 0;   // counted on respawn
      sfx('fail', p.x, p.z, 1); shake(0.6);
      toast(failText('wasted'));
      if (g.state !== 'wasted') g.setState('wasted');
      GTP.Events.emit('player:wasted', { player: p, src: src || null, type: type || null });
    },
    onPlayerBusted: function (p, cop) {
      var g = GTP.game; if (!g || !p) return;
      if (Combat.death) return;
      p.controlEnabled = false; p.stop(); p.aiming = false; p.lockTarget = null; p.firePoseT = 0; p.punchT = 0;
      aim.active = false; aim.target = null;
      cancelReload(p); p._cook = null;
      if (scope.active) updateScope(p, 0);
      if (wheel.open) closeWheel(p, false);
      if (p.inVehicle) { var v = p.inVehicle; v.setControls(0, 0, true, 1); p.exitVehicle(); }
      p.vx = p.vz = 0;
      Combat.death = { kind: 'busted', t: 0, cop: cop || null, text: failText('busted') };
      sfx('fail', p.x, p.z, 1);
      toast(failText('busted'));
      if (g.state !== 'busted') g.setState('busted');
    },
    respawn: function (kind) { respawnPlayer(kind === 'police' || kind === 'busted' ? 'police' : 'hospital'); },
    reset: function () {
      Combat.death = null; Combat.hurtFlash = 0; Combat.pickups.clear(); pickupT = 1.9; lastWeapon = null;
      crng = GTP.rng.fork(0xC0B);
      flashing.length = 0; aim.active = false; aim.target = null; aim.hover = null; aim.point = null; aim.screen = null; aim.targetScreen = null;
      var p = player(); if (p) clearPlayerCombatState(p);
      scope.active = false; scope.zoom = 2; wheel.open = false; wheel.hold = 0; bloom.cone = 0; bloom.k = 0; hitmark.t = -9; hitmark.kill = false;
      shop.state.open = false; shop.state.landmark = null; shop.state.store = null; shop._seed = null; shop._cur = null; shop._hold = 0; shop.rangeT = 0;
      casingClear();
    },

    // UI helpers
    weaponName: function (id) { return WEAPONS[id] ? WEAPONS[id].name : String(id || ''); },
    driveByWeapon: driveByWeapon,
    hud: function () {
      var p = player() || {}, w = p.weapon || 'fist', def = WEAPONS[w], ammo = p.weapons ? p.weapons[w] : 0, a = p.weapons ? ammoOf(p, w) : null, now = simT();
      var inf = ammo === Infinity;
      return {
        weapon: { id: w, name: Combat.weaponName(w), ammo: inf ? null : (ammo | 0), infinite: inf, cls: def ? def.cls : 'melee', magSize: def && def.mag ? def.mag : 0,
          mag: a && def && def.mag ? (a.mag === Infinity ? null : a.mag) : null, reserve: a ? (a.reserve === Infinity ? null : a.reserve) : null,
          reloading: p.reloadT > 0 ? { t: p.reloadT, total: p.reloadTotal || 1, k: 1 - p.reloadT / (p.reloadTotal || 1) } : null },
        aim: aim, death: Combat.death, hurtFlash: Combat.hurtFlash,
        bloom: { cone: bloom.cone, k: bloom.k, max: bloom.max },
        hitmark: now - hitmark.t < 0.45 ? { age: now - hitmark.t, kill: hitmark.kill, zone: hitmark.zone, weapon: hitmark.weapon } : null,
        scope: scope.active ? { active: true, zoom: scope.zoom, fov: scope.fov, range: scope.range, target: scope.target } : null,
        wheel: wheelHud(p.weapons ? p : null),
        cook: p._cook ? { t: p._cook.t, total: WEAPONS[p._cook.id].fuse, k: p._cook.t / WEAPONS[p._cook.id].fuse } : null,
        shop: shop.state
      };
    },
    // default crosshair + lock reticle (the UI module may call this or draw its own from Combat.aim)
    drawAimOverlay: function (ctx, w, h) {
      var g = GTP.game; if (!g || g.state !== 'playing' || !aim.active || !ctx) return;
      var s = aim.screen, t = aim.target, ts = aim.targetScreen, now = simT();
      ctx.save();
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      if (scope.active && s) {
        // the scope: a black vignette with a round window, a hairline cross, the range bottom-left
        var cx = w / 2, cy = h / 2, rad = Math.min(w, h) * 0.38;
        ctx.fillStyle = 'rgba(0,0,0,0.96)';
        ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(cx, cy, rad, 0, Math.PI * 2, true); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy); ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,63,164,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.font = 'bold 14px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(Math.round(scope.range) + ' m   ' + scope.zoom + 'x', cx - rad + 10, cy + rad - 8);
        ctx.restore();
        return;
      }
      if (s && s.visible) {
        var hot = !!aim.hover && !t;
        var hm = now - hitmark.t < 0.12, spreadPx = 4 + 18 * bloom.k + (hm ? 3 : 0);
        ctx.strokeStyle = hitmark.kill && now - hitmark.t < 0.4 ? 'rgba(255,63,164,0.95)' : hm ? 'rgba(255,255,255,0.95)' : hot ? 'rgba(255,63,164,0.95)' : (aim.inRange ? 'rgba(46,230,255,0.95)' : 'rgba(46,230,255,0.5)');
        ctx.beginPath(); ctx.arc(s.sx, s.sy, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.sx - 14 - spreadPx, s.sy); ctx.lineTo(s.sx - 8 - spreadPx, s.sy); ctx.moveTo(s.sx + 8 + spreadPx, s.sy); ctx.lineTo(s.sx + 14 + spreadPx, s.sy);
        ctx.moveTo(s.sx, s.sy - 14 - spreadPx); ctx.lineTo(s.sx, s.sy - 8 - spreadPx); ctx.moveTo(s.sx, s.sy + 8 + spreadPx); ctx.lineTo(s.sx, s.sy + 14 + spreadPx);
        ctx.stroke();
        if (hitmark.kill && now - hitmark.t < 0.4) { ctx.beginPath(); ctx.moveTo(s.sx - 7, s.sy - 7); ctx.lineTo(s.sx + 7, s.sy + 7); ctx.moveTo(s.sx + 7, s.sy - 7); ctx.lineTo(s.sx - 7, s.sy + 7); ctx.stroke(); }
        ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(s.sx, s.sy, 1.8, 0, Math.PI * 2); ctx.fill();
        var pl = player();
        if (pl && pl.reloadT > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.sx, s.sy, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - pl.reloadT / (pl.reloadTotal || 1))); ctx.stroke(); }
      }
      if (t && ts && ts.visible) {
        var k = Math.min(1, (now - aim.lockT) / 0.25), size = 30 + (1 - k) * 26, half = size / 2, c = 9;
        ctx.strokeStyle = now - hitmark.t < 0.12 ? 'rgba(255,255,255,0.95)' : 'rgba(255,63,164,0.95)';
        ctx.translate(ts.sx, ts.sy); ctx.rotate((1 - k) * 0.6);
        ctx.beginPath();
        ctx.moveTo(-half, -half + c); ctx.lineTo(-half, -half); ctx.lineTo(-half + c, -half);
        ctx.moveTo(half - c, -half); ctx.lineTo(half, -half); ctx.lineTo(half, -half + c);
        ctx.moveTo(half, half - c); ctx.lineTo(half, half); ctx.lineTo(half - c, half);
        ctx.moveTo(-half + c, half); ctx.lineTo(-half, half); ctx.lineTo(-half, half - c);
        ctx.stroke();
        // target health bar + name
        var hp = U.clamp((t.hp || 0) / (t.maxHp || 1), 0, 1);
        ctx.fillStyle = 'rgba(10,12,20,0.7)'; ctx.fillRect(-half, half + 6, size, 5);
        ctx.fillStyle = hp > 0.5 ? '#9dff3c' : hp > 0.25 ? '#ffbe3c' : '#ff3b30'; ctx.fillRect(-half, half + 6, size * hp, 5);
        ctx.font = 'bold 11px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(t.kind === 'vehicle' ? (t.type || 'car').toUpperCase() : t.kind === 'heli' ? 'HELICOPTER' : (t.role || 'ped').toUpperCase(), 0, half + 13);
      }
      ctx.restore();
    },
    // tests / debug
    debug: { trace: function (o, d, range, shooter) { var out = {}; trace(o, d, range, shooter || player(), out); return out; }, ammoOf: ammoOf, casings: casings, muzzle: ml, hooked: function () { var F = GTP.Render && GTP.Render.fx; return !!(F && F.extensions && F.extensions.casing); } }
  };

  // ------------------------------------------------------------- events --
  GTP.Events.on('damage', function (e) {
    var t = e && e.target; if (!t || !t.mesh || t.inVehicle) return;
    if (t.kind === 'player') { Combat.hurtFlash = Math.max(Combat.hurtFlash, 0.8); }
    startFlash(t);
  });
  GTP.Events.on('vehicle:damage', function (e) {
    var v = e && e.vehicle; if (!v || !v.mesh || !e.type) return;
    if (/pistol|revolver|smg|rifle|shotgun|sniper|hottake|hotmic|tableleg/.test(String(e.type))) startFlash(v);
  });
  // a vehicle explosion gets a proper fireball on top of the entity's own fx: a white flash, a big bloom, fire bits and a smoke column
  GTP.Events.on('vehicle:exploded', function (e) {
    var v = e && e.vehicle; if (!v) return;
    var r = R(), x = v.x, y = v.y + 1.2, z = v.z, i;
    fx({ type: 'explosion', x: x, y: y + 0.6, z: z, size: 15, life: 0.12, color: 0xfff6dc });
    fx({ type: 'explosion', x: x, y: y + 1.2, z: z, size: 11, life: 0.6, color: 0xffb040, vy: 2.5 });
    fx({ type: 'explosion', x: x, y: y + 0.4, z: z, size: 8, life: 0.45, color: 0xff6a20, vy: 1.5 });
    for (i = 0; i < 8; i++) fx({ type: 'fire', x: x + r.range(-1.5, 1.5), y: y + r.range(0, 1.5), z: z + r.range(-1.5, 1.5), vx: r.range(-4, 4), vy: r.range(3, 9), vz: r.range(-4, 4), size: r.range(2, 3.5), life: r.range(0.6, 1.1) });
    for (i = 0; i < 6; i++) fx({ type: 'smoke', x: x + r.range(-0.8, 0.8), y: y + 1 + i * 0.6, z: z + r.range(-0.8, 0.8), vx: r.range(-0.6, 0.6), vy: r.range(2, 4), vz: r.range(-0.6, 0.6), size: r.range(3, 5), life: r.range(2, 3.2), color: 0x1e1a18 });
  });
  // a dead ped sometimes drops cash; a dead cop sometimes drops a weapon (a rifle gives 15 rounds)
  GTP.Events.on('ped:dead', function (e) {
    var ped = e && e.ped; if (!ped || ped.kind === 'player' || ped._dropped) return;
    ped._dropped = true;
    var r = R(), x = ped.x + r.range(-0.7, 0.7), z = ped.z + r.range(-0.7, 0.7), Wd = W();
    var t = Wd.tileAt(x, z); if (t === Wd.T.BUILDING || t === Wd.T.WATER || t === Wd.T.VOID) { x = ped.x; z = ped.z; }
    if (isCopRole(ped) && ped.weapon && WEAPONS[ped.weapon] && !WEAPONS[ped.weapon].melee && r.chance(0.5)) {
      var n = ped.weapon === 'shotgun' ? 6 : ped.weapon === 'rifle' ? 15 : ped.weapon === 'revolver' ? 6 : 12;
      spawnPickup({ type: 'weapon', weaponId: ped.weapon, ammo: n, x: x, z: z, yHint: ped.y, label: SPONSOR[ped.weapon] });
    } else if (r.chance(0.4)) {
      spawnPickup({ type: 'cash', value: r.int(10, 50), x: x, z: z, yHint: ped.y });
    }
  });
})();
