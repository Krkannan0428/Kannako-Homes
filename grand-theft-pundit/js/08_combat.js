/* Grand Theft Pundit: 08_combat.js
 * GTP.Combat: the weapon table (fist, megaphone, pistol, hottake, smg, shotgun),
 * aim mode (over-the-shoulder rig, crosshair + lock-on hooks for the UI, 40-degree
 * cone, Tab cycles), GTA III style auto-target when shooting without aim, hitscan
 * with building occlusion, tracers / muzzle flash / impact fx, the hottake as a
 * lobbed projectile with a 5 m stun, the megaphone as a 6 m cone push with a
 * visible wave, melee with a lunge, damage flashes and knockback, ped death
 * (fall, fade, cash drop), vehicle bullet damage, cops shooting back (AI calls
 * fire), the RATIO'D and DEPLATFORMED flows, pickups (sponsor bottles, cash,
 * weapon crates) and the weapon held in the ped's hand.
 *
 * Hooks used by other modules:
 *   Combat.fire(ped, weaponId)              Player.control (shoot held) and AI copShoot
 *   Combat.onPlayerDeath(p, src, type)      Player.die -> state 'wasted', hospital respawn after RESPAWN_DELAY
 *   Combat.onPlayerBusted(p, cop)           AI bust() -> state 'busted', precinct respawn, $500 fine
 *   Combat.projectileHit(proj, target)      Projectile.hit
 *   Combat.collectPickup(pickup, player)    Pickup.collect (returns false for mission pickups)
 *   Combat.pickupMesh(pickup)               Render.buildEntityMesh
 *   Combat.aim / Combat.hud()               UI: crosshair, lock reticle, weapon + ammo
 *   Combat.drawAimOverlay(ctx, w, h)        default crosshair/reticle drawer the UI may call
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util;
  var scratch = [], scratch2 = [], scratch3 = [], candBuf = [];
  var _dir = null;   // THREE.Vector3 scratch (THREE is loaded before us)
  var RESPAWN_DELAY = 3;

  // ------------------------------------------------------------- weapons --
  // dmg per shot (shotgun: per volley, split over the pellets), range m, rate shots/s,
  // spread radians, knock m/s impulse on a hit, vehicleMul scales damage to cars.
  var WEAPONS = {
    fist:      { name: 'Fists',     dmg: 12, range: 1.7, rate: 2.5, ammo: Infinity, melee: true, lunge: 2.4, knock: 3.2 },
    megaphone: { name: 'Megaphone', dmg: 0,  range: 6,   rate: 1.2, cone: true, arc: Math.PI / 3, push: 18, heat: 1 },
    pistol:    { name: 'Pistol',    dmg: 18, range: 35,  rate: 4,   spread: 0.012, vehicleMul: 0.55, knock: 1.6 },
    hottake:   { name: 'Hot Take',  dmg: 12, range: 20,  rate: 1,   lobbed: true, stun: 5, speed: 21 },
    smg:       { name: 'SMG',       dmg: 9,  range: 30,  rate: 11,  spread: 0.04, vehicleMul: 0.5, knock: 0.9 },
    shotgun:   { name: 'Shotgun',   dmg: 45, range: 12,  rate: 1.1, pellets: 6, spread: 0.085, vehicleMul: 0.6, knock: 2.5 }
  };
  var ORDER = ['fist', 'megaphone', 'pistol', 'hottake', 'smg', 'shotgun'];
  // Every sponsor product is the same bottle, relabeled (GDD 9).
  var SPONSOR = { health: 'CLARITY PELLETS', armor: 'NAP DYNASTY', pistol: 'OCTANE OPINIONS', megaphone: 'LOUD & CORRECT', hottake: 'FRESH TAKES', smg: '$PUNDIT', shotgun: 'DEFENSE SCOOTERS', mission: 'MERCH' };
  var SPONSOR_COLOR = { 'CLARITY PELLETS': '#2f9e6a', 'NAP DYNASTY': '#2c3e7a', 'OCTANE OPINIONS': '#ff7a00', 'LOUD & CORRECT': '#ff3fa4', 'FRESH TAKES': '#2ee6ff', '$PUNDIT': '#ff2d6f', 'DEFENSE SCOOTERS': '#3d6fcf', 'MERCH': '#e8b53a' };
  var SHOUTS = ['RESPECTFULLY,', 'READ THE MEMO!', 'RATIO!', 'CODE TAKES20!', 'I AM A JOURNALIST!'];
  var AI_DAMAGE_MUL = 0.5;   // cops hurt less than the player does

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
  function wanted() { return GTP.AI && GTP.AI.wanted ? GTP.AI.wanted : null; }
  function alarm(x, z, r, src, mild) { if (GTP.AI && GTP.AI.alarm) { try { GTP.AI.alarm(x, z, r, src, mild); } catch (e) { /* ai optional */ } } }
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
  // pistol, SMG and shotgun fire from a driver's seat; fists, the megaphone and the hottake do not
  function driveByWeapon(id) { var w = WEAPONS[id]; return !!w && !w.melee && !w.cone && !w.lobbed; }
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
  function rayPed(o, d, e, maxT) {
    var sc = (e.look && e.look.scale) || 1;
    if (e.knockedDown || !e.alive) return raySphere(o, d, e.x, e.y + 0.35 * sc, e.z, 0.6 * sc, maxT);
    var a = raySphere(o, d, e.x, e.y + 1.05 * sc, e.z, 0.5 * sc, maxT);
    var b = raySphere(o, d, e.x, e.y + 0.45 * sc, e.z, 0.42 * sc, maxT);
    if (a < 0) return b; if (b < 0) return a; return Math.min(a, b);
  }
  function rayVehicle(o, d, v, maxT) {
    var f = U.yawToDir(v.yaw), rx = -f.z, rz = f.x;
    var dx = o.x - v.x, dz = o.z - v.z;
    var ox = dx * rx + dz * rz, oy = o.y - v.y, oz = dx * f.x + dz * f.z;
    var ddx = d.x * rx + d.z * rz, ddz = d.x * f.x + d.z * f.z;
    return U.rayAabb(ox, oy, oz, ddx, d.y, ddz, -v.hw, -0.1, -v.hl, v.hw, v.cls.height, v.hl, maxT);
  }
  // Hitscan trace: buildings, the ground, peds (two spheres), vehicles (oriented box).
  // out = {t, x, y, z, entity, building, ground, nx, ny, nz}
  function trace(o, d, range, shooter, out) {
    var Wd = W(), bestT = range, hitE = null, hb = null;
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
      if (e === shooter || e.removed) continue;
      if (e.kind === 'ped' || e.kind === 'player') { if (!e.alive || e.inVehicle) continue; t = rayPed(o, d, e, bestT); }
      else if (e.kind === 'vehicle') { if (e.sinking) continue; t = rayVehicle(o, d, e, bestT); }
      else continue;
      if (t >= 0 && t < bestT) { bestT = t; hitE = e; hb = null; out.ground = false; }
    }
    out.t = bestT; out.entity = hitE; out.building = hb;
    out.x = o.x + d.x * bestT; out.y = o.y + d.y * bestT; out.z = o.z + d.z * bestT;
    if (hb) { out.nx = hb.normal.x; out.ny = hb.normal.y; out.nz = hb.normal.z; }
    return out;
  }
  var traceOut = { t: 0, x: 0, y: 0, z: 0, entity: null, building: null, ground: false, nx: 0, ny: 0, nz: 0 };

  // ------------------------------------------------------------------ fx --
  function muzzleFlash(o, d) {
    var x = o.x + d.x * 0.3, y = o.y + d.y * 0.3, z = o.z + d.z * 0.3;
    fx({ type: 'explosion', x: x, y: y, z: z, size: 0.55, life: 0.07, color: 0xfff1b8 });
    fx({ type: 'spark', x: x, y: y, z: z, vx: d.x * 7, vy: d.y * 7 + 0.5, vz: d.z * 7, size: 0.32, life: 0.11, color: 0xffe08a });
    fx({ type: 'puff', x: x, y: y + 0.05, z: z, vx: d.x * 1.5, vy: 0.9, vz: d.z * 1.5, size: 0.28, life: 0.45, color: 0x9a9a9a });
  }
  function tracer(o, d, hit, id) {
    var life = id === 'smg' ? 0.07 : 0.09;
    fx({ type: 'tracer', x: o.x + d.x * 0.35, y: o.y + d.y * 0.35, z: o.z + d.z * 0.35, x2: hit.x, y2: hit.y, z2: hit.z, life: life });
    // a bright bolt racing down the line so the shot reads at a distance (the line itself is one pixel wide)
    var bs = 110, bl = Math.min(life, Math.max(0.03, (hit.t - 0.5) / bs));
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

  // ----------------------------------------------------------- targeting --
  // signed angle from dir (x,z) to (dx,dz): positive = counter-clockwise seen from above
  function signedAngle(dir, dx, dz) { return Math.atan2(dir.x * dz - dir.z * dx, dir.x * dx + dir.z * dz); }
  function validTarget(e, shooter, allowVehicles) {
    if (!e || e === shooter || e.removed) return false;
    if (e.kind === 'ped' || e.kind === 'player') return e.alive && !e.inVehicle;
    if (e.kind === 'vehicle') return !!allowVehicles && !e.wreck && !e.sinking && !!e.driver && !e.hasPlayer();
    return false;
  }
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
    if (!cam) { var f = U.yawToDir(p.yaw); return { x: p.x + f.x * range, y: p.y + 1.3, z: p.z + f.z * range, entity: null }; }
    _dir = _dir || new THREE.Vector3();
    cam.getWorldDirection(_dir);
    var o = { x: cam.position.x, y: cam.position.y, z: cam.position.z }, d = { x: _dir.x, y: _dir.y, z: _dir.z };
    var dc = U.dist2d(o.x, o.z, p.x, p.z);
    var h = trace(o, d, range + dc + 2, p, traceOut);
    return { x: h.x, y: h.y, z: h.z, entity: h.entity };
  }

  // ------------------------------------------------------------ aim mode --
  var aim = {
    active: false, target: null, hover: null, point: null, screen: null, targetScreen: null, weapon: 'fist', inRange: false, lockT: 0
  };
  function lockValid(p, e, cd, range) {
    if (!validTarget(e, p, true)) return false;
    var dx = e.x - p.x, dz = e.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > range * 1.3 || d < 0.3) return false;
    if (Math.abs(signedAngle(cd, dx / d, dz / d)) > 0.75) return false;
    return losClear(p.x, p.y + 1.3, p.z, e.x, chestY(e), e.z);
  }
  function lockCandidates(p, cd, range, halfArc, out) {
    var list = E().hash.query(p.x, p.z, range + 1, scratch2);
    out.length = 0;
    var ox = p.x, oy = p.y + 1.3, oz = p.z;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!validTarget(e, p, true)) continue;
      if (e.kind === 'vehicle' && !e.isPolice) continue;
      var dx = e.x - ox, dz = e.z - oz, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.3 || d > range) continue;
      if (Math.abs(e.y - p.y) > 6) continue;
      var sa = signedAngle(cd, dx / d, dz / d);
      if (Math.abs(sa) > halfArc) continue;
      if (!losClear(ox, oy, oz, e.x, chestY(e), e.z)) continue;
      out.push({ e: e, score: d / range + Math.abs(sa) * 1.2 - (hostileRole(e) ? 0.35 : 0), ang: sa, d: d });
    }
    return out;
  }
  function updateAim(p, dt) {
    var In = GTP.Input, Rd = GTP.Render;
    var active = !!p.aiming && p.alive && !p.inVehicle && !p.knockedDown && !p.swimming;
    aim.active = active; aim.weapon = p.weapon;
    if (!active) { aim.target = null; aim.hover = null; aim.point = null; aim.screen = null; aim.targetScreen = null; p.lockTarget = null; return; }
    var w = WEAPONS[p.weapon] || WEAPONS.fist;
    var range = w.melee ? 7 : Math.max(w.range, 8);
    var cd = U.yawToDir(Rd.rig.yaw);
    var cur = p.lockTarget;
    if (cur && !lockValid(p, cur, cd, range)) cur = null;
    var cycle = In.pressed('lockOn');
    if (!cur || cycle) {
      var cands = lockCandidates(p, cd, range, 20 * Math.PI / 180, candBuf);
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
    p.lockTarget = aim.target = cur;
    var pt;
    if (cur) { pt = { x: cur.x, y: chestY(cur), z: cur.z, entity: cur }; }
    else pt = cameraAimPoint(p, range);
    aim.point = pt; aim.hover = pt.entity || null;
    aim.inRange = U.dist2d(p.x, p.z, pt.x, pt.z) <= w.range + 0.5;
    aim.screen = Rd.worldToScreen ? Rd.worldToScreen(pt.x, pt.y, pt.z) : null;
    aim.targetScreen = cur && Rd.worldToScreen ? Rd.worldToScreen(cur.x, chestY(cur) + (cur.kind === 'vehicle' ? 0 : 0.1), cur.z) : null;
    void dt;
  }

  // --------------------------------------------------------------- firing --
  // where this shot goes: muzzle origin, unit direction, the target entity (or null) and the aim point
  function aimContext(ped, w) {
    var o = muzzle(ped), target = null, pt = null, isPlayer = ped.kind === 'player';
    if (isPlayer) {
      if (ped.aiming) {
        if (aim.target && lockValid(ped, aim.target, U.yawToDir(GTP.Render.rig.yaw), Math.max(w.range, 8))) target = aim.target;
        if (target) pt = { x: target.x, y: chestY(target), z: target.z };
        else { var ap = aim.point || cameraAimPoint(ped, Math.max(w.range, 8)); pt = { x: ap.x, y: ap.y, z: ap.z }; }
        ped.aimYaw = GTP.Render.rig.yaw;
      } else {
        var fd = U.yawToDir(ped.yaw);
        target = bestInCone(ped, fd, w.melee ? 1.3 : 75 * Math.PI / 180, w.melee ? w.range + 0.6 : w.range, !w.melee, false);
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
    if (id === 'fist') return;
    delete p.weapons[id];
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
      if (!isPlayer) dmg *= AI_DAMAGE_MUL;
      var before = e.alive;
      e.applyDamage(dmg, shooter, id);
      if (e.alive && !e.knockedDown && !e.inVehicle) { e.vx += d.x * (w.knock || 1); e.vz += d.z * (w.knock || 1); }
      impactFx(hit, 'ped');
      if (isPlayer) { shooter.stats.hits = (shooter.stats.hits || 0) + 1; if (before && !e.alive) shooter.stats.kills = (shooter.stats.kills || 0) + 1; }
      if (e.kind === 'player') { Combat.hurtFlash = 1; shake(0.18); }
      sfx('hit', hit.x, hit.z, 0.5);
      return true;
    }
    if (e.kind === 'vehicle') {
      if (!e.wreck && !e.sinking) e.applyDamage(dmg * (w.vehicleMul || 0.5), shooter, id);
      impactFx(hit, 'vehicle');
      sfx('hit', hit.x, hit.z, 0.4);
      return true;
    }
    return false;
  }
  function hitscan(ped, w, id, ctx) {
    var pellets = w.pellets || 1, spread = w.spread || 0, isPlayer = ped.kind === 'player';
    if (!isPlayer) spread = spread * 2.2 + 0.03;
    var o = ctx.origin, pelletHits = null;
    muzzleFlash(o, ctx.dir);
    for (var k = 0; k < pellets; k++) {
      var d = jitter(ctx.dir, spread);
      var hit = trace(o, d, w.range, ped, traceOut);
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
    sfx('shot', o.x, o.z, id === 'shotgun' ? 1 : id === 'smg' ? 0.5 : 0.8);
    shotAlarm(ped, 24);
    if (isPlayer) { ped.stats.shots = (ped.stats.shots || 0) + 1; ped.stats.shooting = (ped.stats.shooting || 0) + 1; copHeat(ped); shake(id === 'shotgun' ? 0.22 : id === 'smg' ? 0.05 : 0.09); }
    return true;
  }
  function melee(ped, w, ctx) {
    var f = U.yawToDir(ped.yaw), target = ctx.target, isPlayer = ped.kind === 'player';
    if (ped.onGround && !ped.swimming) { ped.vx += f.x * w.lunge; ped.vz += f.z * w.lunge; }
    ped.punchT = 0.28;
    if (isPlayer) ped.stats.punches = (ped.stats.punches || 0) + 1;
    if (!target || U.dist2d(target.x, target.z, ped.x, ped.z) > w.range + 0.7) { sfx('punch', ped.x, ped.z, 0.25); return true; }
    var dx = target.x - ped.x, dz = target.z - ped.z, l = Math.sqrt(dx * dx + dz * dz) || 1; dx /= l; dz /= l;
    var dmg = w.dmg * (isPlayer ? 1 : 0.6), wasAlive = target.alive;
    target.applyDamage(dmg, ped, 'fist');
    if (target.alive && !target.knockedDown) {
      if (target.hp < dmg * 1.5 || R().chance(0.22)) target.knockDown(dx * 4, dz * 4, 0, ped, 'fist');
      else { target.vx += dx * w.knock; target.vz += dz * w.knock; }
      target.lastHitBy = ped;
    }
    var hy = chestY(target) + 0.25;
    fx({ type: 'puff', x: target.x - dx * 0.3, y: hy, z: target.z - dz * 0.3, size: 0.55, life: 0.3, color: 0xfff6d8, vy: 0.8 });
    fx({ type: 'spark', x: target.x - dx * 0.3, y: hy, z: target.z - dz * 0.3, vx: dx * 2, vy: 2, vz: dz * 2, size: 0.25, life: 0.2, color: 0xfff0a0 });
    sfx('punch', target.x, target.z, 0.8);
    if (isPlayer) { ped.stats.hits = (ped.stats.hits || 0) + 1; if (wasAlive && !target.alive) ped.stats.kills = (ped.stats.kills || 0) + 1; shotAlarm(ped, 10); shake(0.08); }
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
  function lob(ped, w, id, ctx) {
    var o = ctx.origin, pt = ctx.point;
    var dx = pt.x - o.x, dz = pt.z - o.z, dist = Math.sqrt(dx * dx + dz * dz) || 1;
    var hx = dx / dist, hz = dz / dist;
    dist = U.clamp(dist, 2.5, w.range);
    var g = C.PHYS.gravity, s = w.speed, arg = g * dist / (s * s);
    var ang = arg >= 1 ? Math.PI / 4 : 0.5 * Math.asin(arg);
    ang += 0.06;   // a touch of loft so it clears the hand
    var pr = new GTP.Projectile({ x: o.x + hx * 0.3, y: o.y + 0.15, z: o.z + hz * 0.3, owner: ped, weaponId: id, dmg: w.dmg, life: 4, lobbed: true, stun: w.stun, radius: 0.2 });
    pr.vx = hx * s * Math.cos(ang); pr.vz = hz * s * Math.cos(ang); pr.vy = s * Math.sin(ang) + (ped.vy || 0);
    pr.snap();
    E().add(pr);
    ped.firePoseT = 0.5;
    sfx('jump', o.x, o.z, 0.4);
    if (ped.kind === 'player') { ped.stats.hottakes = (ped.stats.hottakes || 0) + 1; ped.stats.shooting = (ped.stats.shooting || 0) + 1; }
    return true;
  }

  // ---------------------------------------------------------- projectiles --
  function projectileHit(proj, target) {
    var w = WEAPONS[proj.weaponId] || WEAPONS.hottake, owner = proj.owner, r = R();
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
    void target;
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
      m.traverse(function (o) { if (o.isMesh && !o.isSprite && o.name !== 'held') { o.userData.mat0 = o.material; o.material = flashMaterial(); } });
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
  function syncHeld(e) {
    var m = e.mesh; if (!m) return;
    var want = (e.alive && !e.inVehicle && e.weapon && e.weapon !== 'fist' && WEAPONS[e.weapon]) ? e.weapon : null;
    if (e._heldId !== want) {
      if (e._held) { if (e._held.parent) e._held.parent.remove(e._held); e._held = null; }
      e._heldId = want;
      if (want) {
        var arm = m.getObjectByName('armR');
        var wm = arm && GTP.Assets.weaponMesh ? GTP.Assets.weaponMesh(want) : null;
        if (wm) { wm.name = 'held'; wm.position.set(0, -0.6, -0.02); wm.scale.setScalar(want === 'megaphone' || want === 'hottake' ? 1 : 1.2); arm.add(wm); e._held = wm; }
      }
    }
    if (e._held) {
      var raised = !!e.aiming || e.firePoseT > 0;
      if (want === 'megaphone' || want === 'hottake') { if (raised) e._held.rotation.set(Math.PI, 0, 0); else e._held.rotation.set(-Math.PI / 2, 0, 0); }
      else if (raised) e._held.rotation.set(0, Math.PI / 2, -Math.PI / 2);
      else e._held.rotation.set(0, Math.PI / 2, 0);
    }
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
          if (pk.weaponId === 'megaphone' || pk.weaponId === 'hottake') { wm.position.set(-0.08, 0.35, 0.02); wm.rotation.set(0, 0.5, 0); }
          else { wm.position.set(-0.2, 0.41, 0.05); wm.rotation.set(0, 0.35, 0); }
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
      var id = pk.weaponId, n = pk.ammo || 20;
      p.weapons[id] = (p.weapons[id] || 0) + n; p.weapon = id;
      msg = WEAPONS[id].name + ' +' + n + (pk.label ? ' (' + pk.label + ')' : ''); color = 0xffbe3c;
    } else return false;
    fx({ type: 'ring', x: pk.x, y: pk.y + 0.05, z: pk.z, size: 1.3, life: 0.4, color: color });
    textFx(msg, pk.x, pk.y + 1.4, pk.z, '#' + ('000000' + color.toString(16)).slice(-6), 1.2);
    toast(msg);
    p.stats.pickups = (p.stats.pickups || 0) + 1;
    return true;
  }

  // --------------------------------------------------- death and respawn --
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
  function entityPass(dt) {
    var list = E().list, cs = C.PHYS.corpseSeconds;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.removed) continue;
      if (e.kind === 'ped' || e.kind === 'player') {
        if (e.mesh) {
          syncHeld(e);
          if (!e.alive && e.kind === 'ped' && !e.persistent) {
            // the fade: sink and shrink into the pavement over the last 1.5 s
            var k = (e.corpseT - (cs - 1.5)) / 1.5;
            if (k > 0) { var base = (e.look && e.look.scale) || 1, s = base * (1 - U.clamp(k, 0, 0.98)); e.mesh.scale.set(base, Math.max(0.02, s), base); e._fading = true; }
            else if (e._fading) { e._fading = false; var b2 = (e.look && e.look.scale) || 1; e.mesh.scale.setScalar(b2); }
          }
        }
      } else if (e.kind === 'projectile' && e.weaponId === 'hottake') {
        e._trailT = (e._trailT || 0) + dt;
        if (e._trailT > 0.05) { e._trailT = 0; fx({ type: 'smoke', x: e.x, y: e.y, z: e.z, size: 0.35, life: 0.5, color: 0xffa060, vy: 0.4 }); }
        if (e.mesh) e.mesh.rotation.x += dt * 12;
      }
    }
  }

  var Combat = GTP.Combat = {
    WEAPONS: WEAPONS,
    ORDER: ORDER,
    SPONSOR: SPONSOR,
    RESPAWN_DELAY: RESPAWN_DELAY,
    aim: aim,
    death: null,
    hurtFlash: 0,
    pickups: new Map(),

    update: function (dt) {
      var g = GTP.game, p = player(); if (!g || !p) return;
      var st = g.state;
      if (st === 'wasted' || st === 'busted') { deathTick(p, dt); updateFlash(); return; }
      if (st !== 'playing' && st !== 'cutscene' && st !== 'minigame') return;
      if (p.alive && p.hp <= 0) p.die(p.lastHitBy || null, p.lastHitType || 'debug');
      else if (!p.alive && !Combat.death) Combat.onPlayerDeath(p, p.lastHitBy, p.lastHitType);
      if (Combat.death) {
        if (!p.alive) return;
        // someone (a mission, a load) put the game back in play mid-flow: drop the stale card state
        Combat.death = null; p.controlEnabled = true;
      }
      if (st === 'playing') updateAim(p, dt);
      else { aim.active = false; aim.target = null; p.lockTarget = null; }
      if (p.weapon !== lastWeapon) { lastWeapon = p.weapon; GTP.Events.emit('weapon', { id: p.weapon, name: Combat.weaponName(p.weapon), ammo: p.weapons[p.weapon] }); }
      entityPass(dt);
      updateFlash();
      if (Combat.hurtFlash > 0) Combat.hurtFlash = Math.max(0, Combat.hurtFlash - dt * 2.5);
      pickupT += dt;
      if (pickupT > 2) { pickupT = 0; spawnWorldPickups(); }
    },

    // Fire the ped's weapon toward its target. Rate-limited per ped; the player spends ammo.
    fire: function (ped, weaponId) {
      if (!ped || !ped.alive || ped.inVehicle || ped.knockedDown || ped.entering || ped.swimming) return false;
      var id = weaponId || ped.weapon || 'fist', w = WEAPONS[id]; if (!w) return false;
      var now = simT(), isPlayer = ped.kind === 'player';
      if (ped._fireT != null && now - ped._fireT < 1 / w.rate - 1e-6) return false;
      if (isPlayer && !w.melee) {
        var ammo = ped.weapons[id];
        if (!(ammo > 0)) { if (now - (ped._dryT || -9) > 0.5) { ped._dryT = now; sfx('ui', ped.x, ped.z, 0.3); } dryWeapon(ped, id); return false; }
      }
      ped._fireT = now;
      var ctx = aimContext(ped, w), fired;
      if (w.melee) fired = melee(ped, w, ctx);
      else if (w.cone) fired = megaphone(ped, w, ctx);
      else if (w.lobbed) fired = lob(ped, w, id, ctx);
      else fired = hitscan(ped, w, id, ctx);
      if (!w.melee) ped.firePoseT = Math.max(ped.firePoseT || 0, 0.5);
      if (isPlayer && !w.melee && fired) { ped.weapons[id] -= 1; if (ped.weapons[id] <= 0) dryWeapon(ped, id); }
      return !!fired;
    },

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

    onPlayerDeath: function (p, src, type) {
      var g = GTP.game; if (!g || !p) return;
      if (Combat.death && Combat.death.kind === 'wasted') return;
      p.controlEnabled = false; p.aiming = false; p.lockTarget = null; p.firePoseT = 0; p.punchT = 0;
      p.intent.x = p.intent.z = 0;
      aim.active = false; aim.target = null;
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
    },

    // UI helpers
    weaponName: function (id) { return WEAPONS[id] ? WEAPONS[id].name : String(id || ''); },
    hud: function () {
      var p = player() || {}, w = p.weapon || 'fist', ammo = p.weapons ? p.weapons[w] : 0;
      return { weapon: { id: w, name: Combat.weaponName(w), ammo: ammo === Infinity ? null : (ammo | 0), infinite: ammo === Infinity }, aim: aim, death: Combat.death, hurtFlash: Combat.hurtFlash };
    },
    // default crosshair + lock reticle (the UI module may call this or draw its own from Combat.aim)
    drawAimOverlay: function (ctx, w, h) {
      var g = GTP.game; if (!g || g.state !== 'playing' || !aim.active || !ctx) return;
      var s = aim.screen, t = aim.target, ts = aim.targetScreen, now = simT();
      ctx.save();
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      if (s && s.visible) {
        var hot = !!aim.hover && !t;
        ctx.strokeStyle = hot ? 'rgba(255,63,164,0.95)' : (aim.inRange ? 'rgba(46,230,255,0.95)' : 'rgba(46,230,255,0.5)');
        ctx.beginPath(); ctx.arc(s.sx, s.sy, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.sx - 18, s.sy); ctx.lineTo(s.sx - 12, s.sy); ctx.moveTo(s.sx + 12, s.sy); ctx.lineTo(s.sx + 18, s.sy);
        ctx.moveTo(s.sx, s.sy - 18); ctx.lineTo(s.sx, s.sy - 12); ctx.moveTo(s.sx, s.sy + 12); ctx.lineTo(s.sx, s.sy + 18);
        ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(s.sx, s.sy, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      if (t && ts && ts.visible) {
        var k = Math.min(1, (now - aim.lockT) / 0.25), size = 30 + (1 - k) * 26, half = size / 2, c = 9;
        ctx.strokeStyle = 'rgba(255,63,164,0.95)';
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
        ctx.fillText(t.kind === 'vehicle' ? (t.type || 'car').toUpperCase() : (t.role || 'ped').toUpperCase(), 0, half + 13);
      }
      ctx.restore();
      void w; void h;
    }
  };

  // ------------------------------------------------------------- events --
  GTP.Events.on('damage', function (e) {
    var t = e && e.target; if (!t || !t.mesh || t.inVehicle) return;
    if (t.kind === 'player') { Combat.hurtFlash = Math.max(Combat.hurtFlash, 0.8); }
    startFlash(t);
  });
  GTP.Events.on('vehicle:damage', function (e) {
    var v = e && e.vehicle; if (!v || !v.mesh || !e.type) return;
    if (/pistol|smg|shotgun|hottake/.test(String(e.type))) startFlash(v);
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
  // a dead ped sometimes drops cash; a dead cop sometimes drops a weapon
  GTP.Events.on('ped:dead', function (e) {
    var ped = e && e.ped; if (!ped || ped.kind === 'player' || ped._dropped) return;
    ped._dropped = true;
    var r = R(), x = ped.x + r.range(-0.7, 0.7), z = ped.z + r.range(-0.7, 0.7), Wd = W();
    var t = Wd.tileAt(x, z); if (t === Wd.T.BUILDING || t === Wd.T.WATER || t === Wd.T.VOID) { x = ped.x; z = ped.z; }
    if (isCopRole(ped) && ped.weapon && WEAPONS[ped.weapon] && !WEAPONS[ped.weapon].melee && r.chance(0.5)) {
      spawnPickup({ type: 'weapon', weaponId: ped.weapon, ammo: ped.weapon === 'shotgun' ? 6 : 12, x: x, z: z, yHint: ped.y, label: SPONSOR[ped.weapon] });
    } else if (r.chance(0.4)) {
      spawnPickup({ type: 'cash', value: r.int(10, 50), x: x, z: z, yHint: ped.y });
    }
  });
})();
