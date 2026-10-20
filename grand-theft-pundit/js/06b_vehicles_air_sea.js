/* Grand Theft Pundit: 06b_vehicles_air_sea.js (v0.3 vehicles track)
 * Everything that moves that is not a car: motorcycles, helicopters, prop planes and jets, speedboats and jet skis,
 * the Golden Parachute, plus the Spin Doctor Customs mod mechanics and the safehouse garages.
 *
 *   Types (registered into GTP.C.VEHICLES at load, each with `family`):
 *     moto       'moto'   the Hot Take 600: the car model plus lean, wheelies, the rider thrown off on a hard hit
 *     heli       'heli'   the Spin Cycle: rotor spin-up, collective / cyclic / yaw, hover assist, rotor strike = crash
 *     plane      'plane'  the Op-Ed: a prop plane; throttle, rotate at vRotate, coordinated turns, stall, landing rules
 *     jet        'plane'  the Long Read: the same flight model, faster, retracting gear, an afterburner glow
 *     speedboat  'boat'   Hot Water: buoyancy, planing, a sliding hull, a wake; shores are walls, sand beaches it
 *     jetski     'boat'   Splash Damage: the same, lighter, leans into turns, rider visible
 *     parachute  'chute'  the Golden Parachute: spawned when the player bails from an aircraft 30 m or more up;
 *                         freefall, Space (jump) or E (action) opens it, steer with WASD, land soft or hard
 *   Controls (keyboard / gamepad): see readAxes(). Aircraft: W/S pitch (or cyclic), A/D roll, Q/E yaw, Shift up /
 *   Ctrl down (collective or throttle); on the ground W rolls a plane forward and S brakes. Pad: left stick pitch / roll,
 *   RT / LT up / down, LB / RB yaw. Boats reuse the car controls. F / Enter / pad Y exits (bails in the air).
 *   Every vehicle gets vehicle.hud() -> {speed, alt, pitch, roll, heading, throttle, gear, ...} for the UI.
 *
 * Hooks installed (wrappers, folded in at integration; see docs/v03/vehicles.md):
 *   at load:  Vehicle.prototype.update / exit / applyDamage / syncMesh / hud, Player.prototype.control / update,
 *             Ped.prototype._syncRider, Entities.add / update, Assets.vehicleGeometry (stub record for the new types)
 *   deferred (DOMContentLoaded, before the game boots, or on first use): Render.buildEntityMesh, Render.syncVehicle,
 *             Render.rig.update (the flight / boat camera), Render.rebuildEntityMesh (fallback only when missing),
 *             GTP.SaveRegistry.vehicles + a GTP.SaveHooks entry, Missions objective types fly_to / land / skydive
 * Randomness: a private GTP.makeRng stream reseeded from the game seed (fleet colours); this file never draws on GTP.rng.
 * Parked fleet vehicles do change where the AI spawner may place traffic once the player is near them, and with it how
 * much of GTP.rng traffic uses; nothing parks within 170 m of the spawn, so a fresh boot's city is unchanged.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util;
  if (!C || !U || !GTP.Vehicle) return;
  var WATER_Y = C.WATER_Y, TAU = Math.PI * 2;
  var G_AIR = 14;                                  // the flight models' gravity (the city's PHYS.gravity 22 is for hops)
  var vrng = GTP.makeRng ? GTP.makeRng(0x7EB1C) : GTP.rng;
  var scratch = [];

  // ================================================================= specs ==
  // Car-model keys (accel ... wheelRadius) are read by the shared Vehicle code (collision box, mass, hp, seats);
  // the flight / boat keys are read here only.
  var SPECS = {
    moto: { family: 'moto', name: 'Hot Take 600', accel: 15, maxSpeed: 52, reverseMax: 3, brake: 26, steerMax: 0.5, steerSpeedFalloff: 0.6, grip: 1.15, driftGrip: 0.35,
      mass: 230, hp: 45, length: 2.15, width: 0.8, height: 1.2, seats: 2, wheelRadius: 0.31, colors: ['#d22f2f', '#1d1d22', '#e8b53a', '#2f6fd8', '#f2f2f2', '#2f9e6a'] },
    heli: { family: 'heli', name: 'Spin Cycle', accel: 0, maxSpeed: 44, reverseMax: 0, brake: 0, steerMax: 0, steerSpeedFalloff: 0, grip: 0, driftGrip: 0,
      mass: 1800, hp: 160, length: 6.2, width: 2.2, height: 3.2, seats: 4, wheelRadius: 0.1, rotorR: 5.3, rotorY: 3.05, colors: ['#1f4fa8', '#c94040', '#e8b53a', '#2b2b2b', '#f2f2f2'] },
    plane: { family: 'plane', name: 'Op-Ed', accel: 0, maxSpeed: 62, reverseMax: 0, brake: 9, steerMax: 0, steerSpeedFalloff: 0, grip: 0, driftGrip: 0,
      mass: 1100, hp: 110, length: 8.2, width: 2.0, height: 2.8, seats: 2, wheelRadius: 0.3, span: 10.4, thrust: 7, vStall: 19, vRotate: 24, pitchRate: 0.75, rollRate: 2.1, gearFixed: true,
      colors: ['#f2f2f2', '#e8b53a', '#c94040', '#2f6fd8'] },
    jet: { family: 'plane', name: 'Long Read', accel: 0, maxSpeed: 118, reverseMax: 0, brake: 12, steerMax: 0, steerSpeedFalloff: 0, grip: 0, driftGrip: 0,
      mass: 9000, hp: 170, length: 13, width: 2.6, height: 3.6, seats: 1, wheelRadius: 0.35, span: 9.2, thrust: 16, vStall: 33, vRotate: 42, pitchRate: 1.1, rollRate: 3.2,
      colors: ['#6f7a86', '#2b2b2b', '#e8b53a'] },
    speedboat: { family: 'boat', name: 'Hot Water', accel: 9, maxSpeed: 34, reverseMax: 5, brake: 6, steerMax: 0, steerSpeedFalloff: 0, grip: 1.5, driftGrip: 0.8,
      mass: 1400, hp: 120, length: 7.2, width: 2.5, height: 1.6, seats: 4, wheelRadius: 0.1, turn: 1.15, draft: 0.05, colors: ['#f2f2f2', '#c94040', '#1f4fa8', '#e8b53a'] },
    jetski: { family: 'boat', name: 'Splash Damage', accel: 12, maxSpeed: 29, reverseMax: 3, brake: 6, steerMax: 0, steerSpeedFalloff: 0, grip: 2.4, driftGrip: 1.2,
      mass: 350, hp: 50, length: 3.0, width: 1.1, height: 1.1, seats: 2, wheelRadius: 0.1, turn: 1.9, draft: 0.02, colors: ['#e8b53a', '#d22f2f', '#2fb8c8', '#1d1d22'] },
    parachute: { family: 'chute', name: 'Golden Parachute', accel: 0, maxSpeed: 52, reverseMax: 0, brake: 0, steerMax: 0, steerSpeedFalloff: 0, grip: 0, driftGrip: 0,
      mass: 90, hp: 40, length: 0.8, width: 0.8, height: 1.8, seats: 1, wheelRadius: 0.1, colors: ['#e8b53a'] }
  };
  var TYPES = Object.keys(SPECS);
  for (var ti = 0; ti < TYPES.length; ti++) if (!C.VEHICLES[TYPES[ti]]) C.VEHICLES[TYPES[ti]] = SPECS[TYPES[ti]];
  // the nine car classes keep family undefined; these helpers read the class flag
  function fam(v) { return v && v.cls ? v.cls.family || null : null; }
  function isAir(v) { var f = fam(v); return f === 'heli' || f === 'plane'; }
  function isSea(v) { return fam(v) === 'boat'; }
  function custom(v) { var f = fam(v); return !!f && f !== 'moto'; }   // own update (moto rides the car model)

  // ================================================================ helpers ==
  function W() { return GTP.World; }
  function E() { return GTP.Entities; }
  function player() { return GTP.game ? GTP.game.player : null; }
  function fx(o) { if (GTP.Render && GTP.Render.fx) { try { GTP.Render.fx.add(o); } catch (e) { /* fx optional */ } } }
  function sfx(name, x, z, gain, extra) {
    if (!GTP.Audio || !GTP.Audio.play) return;
    var o = { x: x, z: z, gain: gain }; if (extra) for (var k in extra) o[k] = extra[k];
    try { GTP.Audio.play(name, o); } catch (e) { /* audio optional */ }
  }
  function emit(n, p) { if (GTP.Events) GTP.Events.emit(n, p); }
  function toast(t) { if (GTP.UI && GTP.UI.toast) { try { GTP.UI.toast(t); } catch (e) { /* ui optional */ } } }
  function shake(a) { if (GTP.Render && GTP.Render.rig && GTP.Render.rig.shake) GTP.Render.rig.shake(a); }
  function report(e, where) { if (U.reportError) U.reportError(e, where); }
  function waterAt(x, z) { var Wd = W(), t = Wd.tileAt(x, z); return t === Wd.T.WATER || t === Wd.T.VOID; }
  // the surface under (x, z) for a mover at y: the ground (bridge decks, ramps), or a roof it is above
  function surfaceAt(x, z, y) {
    var Wd = W(), g = Wd.heightAt(x, z, y), tx = Math.floor(x / C.TILE), tz = Math.floor(z / C.TILE);
    if (Wd.inBounds(tx, tz) && Wd.bidx) {
      var i = tz * Wd.w + tx;
      if (Wd.tiles[i] === Wd.T.BUILDING) { var b = Wd.buildings[Wd.bidx[i] - 1]; if (b && y >= b.y + b.h - 0.6) g = Math.max(g, b.y + b.h); }
    }
    return g;
  }
  function liveDriver(v) { return v.driver && v.driver.alive && !v.wreck ? v.driver : null; }
  function approach(a, b, step) { return a < b ? Math.min(b, a + step) : Math.max(b, a - step); }
  function camDist(x, z) { var cam = GTP.Render && GTP.Render.camera; if (!cam) return 0; return U.dist2d(x, z, cam.position.x, cam.position.z); }

  // ============================================================== controls ==
  // Raw keys for the aircraft axes the 0.2 bindings do not have (Q / E yaw, Ctrl down); Shift is 'run'.
  // The UI track may add actions; these names are read when Input knows them.
  var keys = {};
  var ACT = {
    up: ['collectiveUp', 'throttleUp', 'ascend'], down: ['collectiveDown', 'throttleDown', 'descend'],
    yawL: ['yawLeft', 'rudderLeft'], yawR: ['yawRight', 'rudderRight'], deploy: ['parachute', 'deploy'], wheelie: ['wheelie', 'leanBack']
  };
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', function (e) { keys[e.code] = true; });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });
    window.addEventListener('blur', function () { keys = {}; });
  }
  function key(c) { return !!keys[c] || !!(Vehicles.virt && Vehicles.virt[c]); }
  function actDown(list) { var In = GTP.Input; for (var i = 0; i < list.length; i++) if (In && In.down(list[i])) return true; return false; }
  function actPressed(list) { var In = GTP.Input; for (var i = 0; i < list.length; i++) if (In && In.pressed(list[i])) return true; return false; }
  function padBtn(raw, i) { var b = raw && raw.buttons && raw.buttons[i]; return !!(b && (b.pressed || b.value > 0.5)); }
  var CTL0 = { throttle: 0, steer: 0, handbrake: false, pitch: 0, roll: 0, yaw: 0, collective: 0, fwd: false, back: false, wheelie: false, deploy: false };
  function readAxes() {
    var In = GTP.Input, mv = In.move, pad = In.gamepad, padOn = !!(In.padConnected && In.padConnected()), raw = padOn ? pad._raw : null;
    var o = {};
    o.fwd = In.down('forward'); o.back = In.down('back');
    var up = actDown(ACT.up) || In.down('run') || key('ShiftLeft') || key('ShiftRight');
    var dn = actDown(ACT.down) || key('ControlLeft') || key('ControlRight');
    var col = (up ? 1 : 0) - (dn ? 1 : 0);
    if (padOn) col += (pad.rt || 0) - (pad.lt || 0);
    var yaw = ((actDown(ACT.yawL) || key('KeyQ')) ? 1 : 0) - ((actDown(ACT.yawR) || key('KeyE')) ? 1 : 0);
    if (raw) { if (padBtn(raw, 4)) yaw += 1; if (padBtn(raw, 5)) yaw -= 1; }
    o.pitch = U.clamp(mv.z, -1, 1) * (Vehicles.controls.invertPitch ? -1 : 1);
    o.roll = U.clamp(mv.x, -1, 1);
    o.yaw = U.clamp(yaw, -1, 1); o.collective = U.clamp(col, -1, 1);
    o.throttle = U.clamp(mv.z, -1, 1); o.steer = U.clamp(mv.x, -1, 1); o.handbrake = In.down('jump');
    o.wheelie = actDown(ACT.wheelie) || In.down('run') || (padOn && pad.ry > 0.7);
    o.deploy = In.pressed('jump') || In.pressed('action') || actPressed(ACT.deploy);
    var VA = Vehicles.virtAxes;
    if (VA) for (var k in VA) o[k] = VA[k];
    return o;
  }

  // ============================================================ base hooks ==
  var VP = GTP.Vehicle.prototype, PP = GTP.Player.prototype, PedP = GTP.Ped.prototype;
  var base = { update: VP.update, exit: VP.exit, applyDamage: VP.applyDamage, syncMesh: VP.syncMesh, control: PP.control, pupdate: PP.update, rider: PedP._syncRider };

  // ----------------------------------------------------------------- moto --
  function updateMoto(v, dt) {
    var driver = liveDriver(v), spd0 = v.speed;
    // the car model works on the ground pose; the wheelie and the lean are layered on after it
    if (v._basePitch != null) v.pitch = v._basePitch;
    if (v._baseRoll != null) v.roll = v._baseRoll;
    var steer0 = v.steer;
    if (v._wheelie > 0.15 && driver) v.steer = steer0 * 0.45;
    base.update.call(v, dt);
    if (v.removed || v.sinking) return;
    v._basePitch = v.pitch; v._baseRoll = v.roll;
    var spd = v.speed, want = driver && v.wheelieIn && v.throttle > 0 && spd > 3 && v.onGround;
    var target = want ? 0.42 + U.clamp(spd / 120, 0, 0.25) : 0;
    v._wheelie = U.damp(v._wheelie || 0, target, want ? 2.2 : 5, dt);
    if (v._wheelie < 0.005) v._wheelie = 0;
    // lean: the lateral acceleration over g, toward the inside of the turn
    var lat = v.onGround ? spd * v.yawRate : 0;
    v._lean = U.damp(v._lean || 0, U.clamp(Math.atan(lat / 9.8) * 0.95, -0.78, 0.78), 9, dt);
    v.pitch = v._basePitch + v._wheelie; v.roll = v._baseRoll * 0.2 + v._lean;
    // the wheelie clock
    var p = player();
    if (v._wheelie > 0.3 && driver) v._wheelieT = (v._wheelieT || 0) + dt;
    else if (v._wheelieT) {
      if (v._wheelieT > 1.5 && driver === p && p) {
        p.stats.wheelieBest = Math.max(p.stats.wheelieBest || 0, +v._wheelieT.toFixed(1));
        emit('stunt:wheelie', { vehicle: v, seconds: +v._wheelieT.toFixed(1) });
        toast('Wheelie: ' + v._wheelieT.toFixed(1) + ' s. The comments call it a hot take.');
      }
      v._wheelieT = 0;
    }
    // a hard hit (wall, car, ped) or a high-speed landing on a full lean throws the rider
    if (driver && v._throw) { var th = v._throw; v._throw = null; throwRider(v, th); }
    void spd0;
  }
  // the rider leaves the saddle on a wall or car hit over 10 m/s, or a pedestrian at over 17 m/s
  if (GTP.Events) {
    GTP.Events.on('vehicle:impact', function (e) { var v = e && e.vehicle; if (v && fam(v) === 'moto' && v.driver && e.impact > 10) v._throw = 'impact'; });
    GTP.Events.on('vehicle:hitPed', function (e) { var v = e && e.vehicle; if (v && fam(v) === 'moto' && v.driver && e.speed > 17) v._throw = 'ped'; });
  }
  function throwRider(v, why) {
    var d = v.driver; if (!d) return;
    var vx = v.vx, vz = v.vz, sp = Math.sqrt(vx * vx + vz * vz);
    var already = Math.max(0, (sp - C.PHYS.bailSpeed) * 0.6);   // the shared exit already knocked them down with this much
    base.exit.call(v, d);
    d.y = Math.max(d.y, v.y + 0.6);
    d.knockDown(vx * 0.8, vz * 0.8, Math.max(0, Math.min(40, 6 + sp * 0.9) - already), null, 'crash');
    v.passengers.slice().forEach(function (o) { base.exit.call(v, o); o.knockDown(vx * 0.7, vz * 0.7, 0, null, 'crash'); });
    d.vy = 3 + sp * 0.12;
    if (d.kind === 'player') { d.stats.thrown = (d.stats.thrown || 0) + 1; shake(0.6); toast('Thrown off. The bike kept its opinion.'); }
    sfx('crash', v.x, v.z, 0.8);
    emit('moto:thrown', { vehicle: v, ped: d, cause: why });
  }

  // ----------------------------------------------------- shared air / sea --
  // a parked aircraft with nobody aboard skips the flight model (pair / ped contacts still run, a push wakes it)
  function parked(v, dt) {
    if (v.driver || v.autopilot || v.burning || v.wreck || !v.onGround || v.hp <= 0) return false;
    if (v.vx || v.vz || v.vy || (v.rotor || 0) > 0.001 || (v.thr || 0) > 0.001 || (v.air || 0) > 0.01) return false;
    v.age += dt; if (v.honkT > 0) v.honkT -= dt;
    contacts(v); v._syncOccupants();
    return true;
  }
  function preStep(v, dt) {
    v.age += dt;
    if (v.honkT > 0) v.honkT -= dt;
    if (v.hp <= 0 && !v.burning && !v.wreck) v.ignite();
    if (v.burning) { v.burnT += dt; v._burnFx(dt); if (v.burnT >= C.PHYS.burnSeconds) { v.explode(); return false; } }
    return true;
  }
  function postStep(v, dt) {
    var f = U.yawToDir(v.yaw);
    v.speed = v.vx * f.x + v.vz * f.z; v.lateral = v.vx * -f.z + v.vz * f.x;
    v.reversing = v.speed < -0.8; v.reverseTime = v.reversing ? v.reverseTime + dt : 0;
    v._syncOccupants();
    v._damageFx(dt);
    if (v.wreck) { v.wreckT += dt; if (v.wreckT > C.PHYS.wreckSeconds && !v.persistent) v.destroy(); }
  }
  function contacts(v) {
    var near = E().hash.query(v.x, v.z, v.radius + 6, scratch);
    v._collideVehicles(near);
    v._collidePeds(near);
  }
  // the map edge. Aircraft get 260 m of open sea past it: past 140 m a growing nudge turns them home, at 260 m a wall.
  // Boats (and the parachute) stop 8 m inside the map.
  var AIR_SOFT = 140, AIR_HARD = 260;
  function outside(v, pad) { var b = W().bounds; pad = pad || 0; return v.x < b.x0 + pad || v.x > b.x1 - pad || v.z < b.z0 + pad || v.z > b.z1 - pad; }
  function edgeGuard(v) {
    var b = W().bounds, hit = false;
    if (isAir(v) || fam(v) === 'chute') {
      var ox = v.x < b.x0 ? b.x0 - v.x : v.x > b.x1 ? v.x - b.x1 : 0, oz = v.z < b.z0 ? b.z0 - v.z : v.z > b.z1 ? v.z - b.z1 : 0, out = Math.max(ox, oz);
      if (out > AIR_SOFT) {
        var k = U.clamp((out - AIR_SOFT) / (AIR_HARD - AIR_SOFT), 0, 1), cx0 = (b.x0 + b.x1) / 2, cz0 = (b.z0 + b.z1) / 2;
        v.yaw = U.angleDamp(v.yaw, U.dirToYaw(cx0 - v.x, cz0 - v.z), 0.3 + 2.2 * k, C.STEP);
        if (v.hasPlayer() && (!v._edgeT || v.age - v._edgeT > 8)) { v._edgeT = v.age; toast('Air traffic control: the map ends here. Turning you back toward the ratings.'); }
      }
      var X0 = b.x0 - AIR_HARD, X1 = b.x1 + AIR_HARD, Z0 = b.z0 - AIR_HARD, Z1 = b.z1 + AIR_HARD;
      if (v.x < X0) { v.x = X0; if (v.vx < 0) v.vx = 0; } if (v.x > X1) { v.x = X1; if (v.vx > 0) v.vx = 0; }
      if (v.z < Z0) { v.z = Z0; if (v.vz < 0) v.vz = 0; } if (v.z > Z1) { v.z = Z1; if (v.vz > 0) v.vz = 0; }
      return;
    }
    var m = 8;
    if (v.x < b.x0 + m) { v.x = b.x0 + m; if (v.vx < 0) v.vx = -v.vx * 0.3; hit = true; }
    if (v.x > b.x1 - m) { v.x = b.x1 - m; if (v.vx > 0) v.vx = -v.vx * 0.3; hit = true; }
    if (v.z < b.z0 + m) { v.z = b.z0 + m; if (v.vz < 0) v.vz = -v.vz * 0.3; hit = true; }
    if (v.z > b.z1 - m) { v.z = b.z1 - m; if (v.vz > 0) v.vz = -v.vz * 0.3; hit = true; }
    if (hit) {
      var cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      v.yaw = U.angleDamp(v.yaw, U.dirToYaw(cx - v.x, cz - v.z), 2.5, C.STEP);
      if (v.hasPlayer() && (!v._edgeT || v.age - v._edgeT > 6)) { v._edgeT = v.age; toast('The map ends here. Turn back; the sea has no audience.'); }
    }
  }
  function crash(v, cause) {
    if (v.exploded) return;
    var p = player();
    v.lastDamageSrc = v.lastDamageSrc || null;
    v.hp = 0; v.ignite();
    v.explode(v.lastDamageSrc);
    if (p && v._lastDriver === p) { p.stats.aircraftCrashed = (p.stats.aircraftCrashed || 0) + 1; }
    emit('vehicle:crash', { vehicle: v, cause: cause });
  }
  // a fallen wreck: ballistic until it rests on the surface, sinks on water
  function wreckFall(v, dt) {
    if (v.onGround) { v.vx *= Math.exp(-5 * dt); v.vz *= Math.exp(-5 * dt); }
    else v.vy -= G_AIR * 1.4 * dt;
    v.x += v.vx * dt; v.y += v.vy * dt; v.z += v.vz * dt;
    v.yaw += v.yawRate * dt; v.yawRate *= Math.exp(-1.5 * dt);
    if (isAir(v)) edgeGuard(v);
    var g = surfaceAt(v.x, v.z, v.y + 1);
    if (v.y <= g) {
      if (waterAt(v.x, v.z) && g <= WATER_Y + 0.05) { v.y = WATER_Y; v.startSinking(); return; }
      if (!v.onGround && v.vy < -6) { sfx('crash', v.x, v.z, 0.8); fx({ type: 'puff', x: v.x, y: g + 0.3, z: v.z, size: 3, life: 0.8, color: 0x9a9080 }); }
      v.y = g; v.vy = 0; v.onGround = true;
    } else if (v.y > g + 0.3) v.onGround = false;
    v.pitch = U.damp(v.pitch, v.onGround ? 0.05 : v.pitch, 2, dt);
    v.roll = U.damp(v.roll, v.onGround ? 0.25 : v.roll, 2, dt);
    if (!outside(v, 8)) v._collideWorld(dt);
  }
  // downwash and wake puffs under an aircraft or behind a boat
  function surfacePuffs(v, agl, dt, rate) {
    v._puffT = (v._puffT || 0) + dt;
    if (v._puffT < rate) return;
    v._puffT = 0;
    var R = vrng, a = R.random() * TAU, r = R.range(1.5, 5), x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
    var wet = waterAt(x, z), y = wet ? WATER_Y + 0.15 : W().heightAt(x, z, v.y - agl + 0.5) + 0.15;
    fx({ type: 'puff', x: x, y: y, z: z, vx: Math.cos(a) * 5, vz: Math.sin(a) * 5, vy: 0.4, size: wet ? 1.6 : 1.3, life: 0.7, color: wet ? 0xe8f4f8 : 0xcbbf9e });
  }

  // ------------------------------------------------------------------ heli --
  function updateHeli(v, dt) {
    if (parked(v, dt)) return;
    if (!preStep(v, dt)) return;
    if (v.wreck) { wreckFall(v, dt); postStep(v, dt); return; }
    var S = v.cls, driver = liveDriver(v), c = (driver && v.ctl) || CTL0;
    if (driver) v._lastDriver = driver;
    var wantRpm = driver && !v.burning ? 1 : 0;
    v.rotor = approach(v.rotor || 0, wantRpm, dt / (wantRpm ? 2.4 : 6));
    v.rotorAngle = ((v.rotorAngle || 0) + v.rotor * 40 * dt) % TAU;
    if (v.rotor > 0.05 && !v._rotorSfx) { v._rotorSfx = true; sfx('rotorStart', v.x, v.z, 0.7); }
    if (v.rotor < 0.02) v._rotorSfx = false;
    var lift = v.rotor * v.rotor, onG = v.onGround;
    // attitude: cyclic forward tips the nose down, right rolls the right side down
    var tp = onG ? 0 : -c.pitch * 0.38, tr = onG ? 0 : -c.roll * 0.42;
    if (v.burning) { tr += Math.sin(v.age * 3) * 0.3; }
    v.pitch = U.damp(v.pitch, tp, 3.2, dt); v.roll = U.damp(v.roll, tr, 3.6, dt);
    var hs = v.speed2d();
    var yawT = (onG && lift < 0.5) ? 0 : c.yaw * 1.5 + v.roll * 0.9 * U.clamp(hs / 15, 0, 1);
    if (v.burning) yawT += 2.4;
    v.yawRate = U.damp(v.yawRate, yawT, 4, dt);
    v.yaw = U.wrapAngle(v.yaw + v.yawRate * dt);
    var f = U.yawToDir(v.yaw), rx = -f.z, rz = f.x;
    var ah = 40 * lift, af = -v.pitch * ah, ar = -v.roll * ah * 0.9;
    v.vx += (f.x * af + rx * ar) * dt; v.vz += (f.z * af + rz * ar) * dt;
    var hd = Math.exp(-0.34 * dt); v.vx *= hd; v.vz *= hd;
    // vertical: the collective sets a climb rate the rotor chases (a hover with no input); no rotor, no lift
    var vyT = c.collective > 0 ? c.collective * 9 : c.collective * 7;
    if (v.y > 320) vyT = Math.min(vyT, -1);
    var thrust = lift * (G_AIR + 4.2 * (vyT - v.vy));
    if (v.burning) thrust *= 0.55;
    thrust = U.clamp(thrust, 0, G_AIR * 2.2);
    if (!onG || thrust > G_AIR * 1.02) v.vy += (thrust - G_AIR) * dt;
    v.x += v.vx * dt; v.y += v.vy * dt; v.z += v.vz * dt;
    edgeGuard(v);
    var g = surfaceAt(v.x, v.z, v.y + 0.3), agl = v.y - g;
    if (v.y <= g) {
      var impact = -v.vy;
      if (!onG && (impact > 10 || hs > 17 || Math.abs(v.roll) > 0.75 || Math.abs(v.pitch) > 0.75 || v.burning)) { v.y = g; crash(v, 'ground'); postStep(v, dt); return; }
      if (!onG) {
        if (impact > 5) v.applyDamage((impact - 5) * 6, null, 'fall');
        if (impact > 1.5) { sfx('land', v.x, v.z, U.clamp(impact / 8, 0.3, 1)); }
        emit('aircraft:land', { vehicle: v });
      }
      v.y = g; v.vy = 0; v.onGround = true;
      var fr = Math.exp(-(lift > 0.9 ? 3 : 7) * dt); v.vx *= fr; v.vz *= fr;
    } else if (agl > 0.2) {
      if (onG) emit('aircraft:takeoff', { vehicle: v });
      v.onGround = false;
    }
    // water: a helicopter in the bay is a submarine for three seconds, then a reef
    if (waterAt(v.x, v.z) && v.y <= WATER_Y + 0.4) { v.applyDamage(25, null, 'water'); v.startSinking(); v._syncOccupants(); return; }
    // the rotor disc against buildings: a strike is a crash; the body bumps (or crashes when fast)
    if (v.rotor > 0.3) {
      var ry = v.y + S.rotorY;
      for (var k = 0; k < 8; k++) {
        var a = k * TAU / 8, px = v.x + Math.cos(a) * S.rotorR, pz = v.z + Math.sin(a) * S.rotorR;
        if (W().inBounds(Math.floor(px / C.TILE), Math.floor(pz / C.TILE)) && W().solidAt(px, pz, ry)) { crash(v, 'rotor'); postStep(v, dt); return; }
      }
    }
    var c0 = v.lastCollision; v.lastImpact = 0;
    if (!outside(v, 3)) v._collideWorld(dt);
    if (v.lastCollision !== c0 && v.lastImpact > 8 && !onG) { crash(v, 'wall'); postStep(v, dt); return; }
    contacts(v);
    if (lift > 0.4 && agl < 12) surfacePuffs(v, agl, dt, 0.05 + agl * 0.01);
    v.wheelSpin = 0; v.braking = false;
    postStep(v, dt);
  }

  // ----------------------------------------------------------- plane / jet --
  function updatePlane(v, dt) {
    if (parked(v, dt)) return;
    if (!preStep(v, dt)) return;
    if (v.wreck) { wreckFall(v, dt); postStep(v, dt); return; }
    var S = v.cls, driver = liveDriver(v), c = (driver && v.ctl) || CTL0, onG = v.onGround;
    if (driver) v._lastDriver = driver;
    var drag = S.thrust / (S.maxSpeed * S.maxSpeed);
    v.thr = v.thr || 0; v.air = v.air || 0;
    // throttle: Shift / Ctrl (RT / LT) in the air; on the ground W also rolls her forward and S brakes below rotate speed
    var dthr = c.collective * 0.7 * dt;
    if (onG && c.fwd) dthr = Math.max(dthr, 0.9 * dt);
    // on the ground S is the brake, except on a takeoff roll (throttle up, near rotate speed) where it pulls the nose up
    var rotating = onG && v.thr > 0.6 && v.air > S.vRotate * 0.85;
    var braking = onG && c.back && !rotating;
    if (braking) { v.thr = approach(v.thr, 0, 1.5 * dt); dthr = Math.min(dthr, 0); }
    v.thr = U.clamp(v.thr + dthr, 0, 1);
    if (!driver && onG) v.thr = approach(v.thr, 0, 0.3 * dt);
    if (v.burning) v.thr *= 0.995;
    v.rotor = U.damp(v.rotor || 0, driver || v.thr > 0.02 ? 0.25 + 0.75 * v.thr : 0, 2.2, dt);
    v.rotorAngle = ((v.rotorAngle || 0) + v.rotor * 60 * dt) % TAU;
    var f, s = v.air;
    if (onG) {
      var off = v.offroad = W().tileAt(v.x, v.z) === W().T.GRASS || W().tileAt(v.x, v.z) === W().T.SAND;
      var acc = S.thrust * v.thr - drag * s * s - (off ? 2.2 : 0.5);
      if (braking) acc -= S.brake;
      if (c.handbrake) acc -= S.brake;
      s = Math.max(0, s + acc * dt);
      if (off) s = Math.min(s, 26);
      // the nosewheel steers (A / D) at taxi speed, the rudder (Q / E) at any speed
      var steer = (c.roll * 0.9) * U.clamp(s / 5, 0, 1) * U.clamp(1 - s / (S.vRotate * 1.6), 0.15, 1) + c.yaw * 0.25;
      v.yawRate = U.damp(v.yawRate, -steer + c.yaw * 0.2, 6, dt);
      v.yaw = U.wrapAngle(v.yaw + v.yawRate * dt);
      // rotate: pull back (S) past the rotate speed
      var pull = -c.pitch;
      var pt = (rotating && pull > 0) ? 0.16 * pull : 0;
      v.pitch = U.damp(v.pitch, pt, 3, dt); v.roll = U.damp(v.roll, 0, 6, dt);
      f = U.yawToDir(v.yaw);
      v.vx = f.x * s; v.vz = f.z * s; v.vy = 0;
      v.x += v.vx * dt; v.z += v.vz * dt;
      var gy = surfaceAt(v.x, v.z, v.y + 0.4);
      if (gy < v.y - 0.8) v.onGround = false;   // rolled off an edge
      else v.y = U.damp(v.y, gy, 30, dt);
      if (s > S.vRotate && v.pitch > 0.07 && rotating && pull > 0) {
        v.onGround = false; v.vy = s * Math.sin(v.pitch);
        emit('aircraft:takeoff', { vehicle: v });
        if (v.hasPlayer()) { var pl = player(); pl.stats.takeoffs = (pl.stats.takeoffs || 0) + 1; }
      }
      v.wheelSpin -= s / S.wheelRadius * dt;
    } else {
      var auth = U.clamp(s / S.vStall, 0.3, 1);
      v.pitch = U.clamp(v.pitch + (-c.pitch) * S.pitchRate * auth * dt, -1.35, 1.35);
      if (c.roll) v.roll = U.clamp(v.roll - c.roll * S.rollRate * auth * dt, -1.3, 1.3);
      else v.roll = U.damp(v.roll, 0, 0.9, dt);
      if (v.burning) v.roll = U.clamp(v.roll + 0.8 * dt, -1.3, 1.3);
      v.yawRate = (G_AIR / Math.max(s, 12)) * Math.tan(v.roll) * Math.cos(v.pitch) * 0.9 + c.yaw * 0.35;
      v.yaw = U.wrapAngle(v.yaw + v.yawRate * dt);
      var acc2 = S.thrust * v.thr - drag * s * s - G_AIR * Math.sin(v.pitch) * 0.9;
      s = Math.max(0, s + acc2 * dt);
      var stall = s < S.vStall, sink = stall ? (S.vStall - s) * 0.9 + 2 : 0;
      if (stall) {
        v.pitch = U.damp(v.pitch, -0.4, 0.9, dt);
        if (!v.stall) { v.stall = true; if (v.hasPlayer()) { sfx('stall', v.x, v.z, 0.7); emit('vehicle:stall', { vehicle: v }); } }
      } else v.stall = false;
      f = U.yawToDir(v.yaw);
      var cp = Math.cos(v.pitch);
      var vyT = Math.sin(v.pitch) * s - sink;
      v.vx = f.x * cp * s; v.vz = f.z * cp * s; v.vy = vyT < v.vy ? Math.max(vyT, v.vy - G_AIR * 1.2 * dt) : vyT;   // a sink builds up under gravity
      v.x += v.vx * dt; v.y += v.vy * dt; v.z += v.vz * dt;
      edgeGuard(v);
      if (v.y > 900) { v.y = 900; v.pitch = Math.min(v.pitch, 0); }
      var g2 = surfaceAt(v.x, v.z, v.y + 0.5);
      if (v.y <= g2) {
        var wet = waterAt(v.x, v.z) && g2 <= WATER_Y + 0.05;
        var hard = v.vy < -7 || Math.abs(v.roll) > 0.42 || v.pitch < -0.14 || v.burning || (S.gearFixed ? false : v.gear !== 'down');
        if (wet) { v.y = WATER_Y; if (hard || s > 22) { crash(v, 'water'); postStep(v, dt); return; } v.applyDamage(30, null, 'water'); v.startSinking(); v._syncOccupants(); return; }
        if (hard) { v.y = g2; crash(v, 'ground'); postStep(v, dt); return; }
        v.y = g2; v.onGround = true; v.vy = 0; v.pitch = 0;
        sfx('land', v.x, v.z, 0.7); fx({ type: 'puff', x: v.x, y: g2 + 0.2, z: v.z, size: 2, life: 0.6, color: 0xd0ccc4 });
        emit('aircraft:land', { vehicle: v });
        if (v.hasPlayer()) { var pl2 = player(); pl2.stats.landings = (pl2.stats.landings || 0) + 1; }
      }
    }
    v.air = s;
    if (!S.gearFixed) {
      var agl = v.y - surfaceAt(v.x, v.z, v.y);
      var gear = v.onGround || agl < 22 || s < S.vStall * 1.15 ? 'down' : 'up';
      if (gear !== v.gear) { if (v.gear && v.hasPlayer()) sfx('gearUp', v.x, v.z, 0.5); v.gear = gear; }
    } else v.gear = 'down';
    if (waterAt(v.x, v.z) && v.y <= WATER_Y + 0.3 && v.onGround) { v.startSinking(); v._syncOccupants(); return; }
    var c0 = v.lastCollision; v.lastImpact = 0;
    if (!outside(v, 8)) v._collideWorld(dt);
    if (v.lastCollision !== c0 && (v.lastImpact > 6 || !v.onGround)) { crash(v, 'wall'); postStep(v, dt); return; }
    if (v.lastCollision !== c0) { v.air *= 0.4; }
    contacts(v);
    v.braking = braking && s > 1;
    postStep(v, dt);
  }

  // ------------------------------------------------------------ boats --
  function updateBoat(v, dt) {
    if (!preStep(v, dt)) return;
    // the player and the autopilot fill v.ctl; an AI ped at the helm drives it like a car (v.throttle / v.steer)
    var S = v.cls, driver = liveDriver(v), c = (driver && v.ctl) || (driver ? { throttle: v.throttle || 0, steer: v.steer || 0, handbrake: !!v.handbrake } : CTL0);
    if (v.wreck) {
      if (waterAt(v.x, v.z)) { v.startSinking(); v._syncOccupants(); return; }
      v.vx *= Math.exp(-4 * dt); v.vz *= Math.exp(-4 * dt); v.x += v.vx * dt; v.z += v.vz * dt; postStep(v, dt); return;
    }
    var f = U.yawToDir(v.yaw), rx = -f.z, rz = f.x;
    var vf = v.vx * f.x + v.vz * f.z, vl = v.vx * rx + v.vz * rz;
    var wet = waterAt(v.x, v.z), t = c.throttle, steer = c.steer;
    if (v.burning) t *= 0.4;
    if (wet) {
      if (t > 0) vf += S.accel * t * (vf < 0 ? 1.6 : 1) * dt;
      else if (t < 0) vf = Math.max(-S.reverseMax, vf + S.accel * 0.7 * t * dt);
      var k = S.accel / (S.maxSpeed * S.maxSpeed);
      vf -= k * vf * Math.abs(vf) * dt;
      if (!t) vf *= Math.exp(-0.35 * dt);
      vl *= Math.exp(-(c.handbrake ? S.driftGrip : S.grip) * dt);
      var flow = U.clamp(0.25 + Math.abs(vf) / 9, 0, 1) * (vf < -0.5 ? -1 : 1);
      v.yawRate = U.damp(v.yawRate, -steer * S.turn * flow, 3, dt);
      var plane = U.smoothstep((Math.abs(vf) - 6) / 9), hump = Math.exp(-Math.pow((Math.abs(vf) - 9) / 6, 2));
      var bob = Math.sin(v.age * 1.4 + v.x * 0.05) * 0.06 + Math.sin(v.age * 2.3 + v.z * 0.07) * 0.04;
      v.y = U.damp(v.y, WATER_Y + S.draft + bob + plane * 0.12, 6, dt);
      var pitchT = 0.13 * hump + 0.05 * plane + Math.sin(v.age * 1.7 + v.z * 0.05) * 0.02 * (1 - plane * 0.6);
      v.pitch = U.damp(v.pitch, pitchT, 3, dt);
      var leanK = v.type === 'jetski' ? 0.035 : 0.014;
      v.roll = U.damp(v.roll, U.clamp(v.yawRate * vf * leanK, -0.5, 0.5) + Math.sin(v.age * 1.1 + v.x * 0.03) * 0.03, 4, dt);
      v.vy = 0; v.onGround = true; v.beached = false;
    } else {
      // on sand: beached, the hull grinds to a stop; the props never touch the water
      vf *= Math.exp(-3.5 * dt); vl *= Math.exp(-6 * dt);
      if (t) vf += t * 0.8 * dt;
      v.yawRate = U.damp(v.yawRate, -steer * 0.3 * U.clamp(Math.abs(vf) / 3, 0, 1), 3, dt);
      var gy = W().heightAt(v.x, v.z, v.y + 0.5);
      v.y = U.damp(v.y, gy + 0.15, 8, dt); v.pitch = U.damp(v.pitch, 0.04, 3, dt); v.roll = U.damp(v.roll, 0.06, 3, dt);
      v.beached = true;
    }
    v.yaw = U.wrapAngle(v.yaw + v.yawRate * dt);
    v.vx = vf * f.x + vl * rx; v.vz = vf * f.z + vl * rz;
    // shores are walls; sand (and a slipway) lets the hull slide up
    var nx = v.x + v.vx * dt, nz = v.z + v.vz * dt;
    if (!shoreOk(nx, nz)) {
      var sp = v.speed2d(), okX = shoreOk(nx, v.z), okZ = shoreOk(v.x, nz);
      if (okX) { nz = v.z; v.vz = -v.vz * 0.25; } else if (okZ) { nx = v.x; v.vx = -v.vx * 0.25; } else { nx = v.x; nz = v.z; v.vx = -v.vx * 0.25; v.vz = -v.vz * 0.25; }
      if (sp > C.PHYS.damageSpeed) v._impact(sp * 0.8, nx + f.x * v.hl, nz + f.z * v.hl, -f.x, -f.z, 'wall');
      else if (sp > 2 && v.age - (v._bumpT || 0) > 0.4) { v._bumpT = v.age; sfx('land', nx, nz, 0.4); }
    }
    v.x = nx; v.z = nz;
    edgeGuard(v);
    v._collideWorld(dt);
    contacts(v);
    // the wake: a V of foam behind the stern and spray off the bow when planing
    var spd = Math.abs(vf);
    if (wet && spd > 2.5) {
      v._wakeT = (v._wakeT || 0) + dt;
      if (v._wakeT > U.clamp(0.16 - spd * 0.004, 0.05, 0.16)) {
        v._wakeT = 0;
        var st = v.localToWorld(0, -v.hl), R = vrng;
        fx({ type: 'puff', x: st.x, y: WATER_Y + 0.1, z: st.z, vx: -f.x * 1.5 + R.range(-0.6, 0.6), vz: -f.z * 1.5 + R.range(-0.6, 0.6), vy: 0.3, size: 0.9 + spd * 0.04, life: 1.4, color: 0xf2f8fa });
        if (spd > 10) { var side = R.chance(0.5) ? 1 : -1, bw = v.localToWorld(side * (v.hw + 0.1), v.hl * 0.2); fx({ type: 'puff', x: bw.x, y: WATER_Y + 0.4, z: bw.z, vx: rx * side * 3, vz: rz * side * 3, vy: 2.2, size: 0.6, life: 0.6, color: 0xffffff }); }
      }
    }
    v.wheelSpin = 0; v.braking = t < 0 && vf > 1;
    postStep(v, dt);
  }
  function shoreOk(x, z) { if (waterAt(x, z)) return true; var Wd = W(), t = Wd.tileAt(x, z); return t === Wd.T.SAND; }

  // ------------------------------------------------------------ parachute --
  function updateChute(v, dt) {
    v.age += dt;
    var d = liveDriver(v), c = (d && v.ctl) || CTL0;
    if (v.chute === 'landed') {
      v.collapseT = (v.collapseT || 0) + dt; v.vx = v.vz = v.vy = 0;
      if (v.collapseT > 2.6) v.destroy();
      return;
    }
    if (!d) { v.chute = 'landed'; v.collapseT = 0; v.locked = true; return; }
    var f = U.yawToDir(v.yaw), rx = -f.z, rz = f.x;
    if (v.chute !== 'open') {
      // freefall: W dives (faster forward), A / D turn; Space / E opens
      v.vy = Math.max(-52, v.vy - C.PHYS.gravity * 0.75 * dt);
      var fwdT = c.fwd ? 16 : c.back ? 2 : 6;
      v.yaw = U.wrapAngle(v.yaw - c.steer * 1.6 * dt);
      var vf = U.damp(v.vx * f.x + v.vz * f.z, fwdT, 1.2, dt);
      v.vx = f.x * vf; v.vz = f.z * vf;
      v.pitch = U.damp(v.pitch, c.fwd ? -1.1 : -0.75, 3, dt); v.roll = U.damp(v.roll, -c.steer * 0.4, 3, dt);
      if (v.ctl && v.ctl.deploy) deploy(v);
    } else {
      v.openT = (v.openT || 0) + dt;
      var k = U.smoothstep(v.openT / 0.8);
      var vyT = c.fwd ? -7.5 : c.back ? -3 : -5.2, fT = c.fwd ? 13 : c.back ? 4.5 : 9;
      v.vy = U.damp(v.vy, vyT, 1.5 + 5 * k, dt);
      v.yawRate = U.damp(v.yawRate, -c.steer * 1.1, 3, dt);
      v.yaw = U.wrapAngle(v.yaw + v.yawRate * dt);
      f = U.yawToDir(v.yaw);
      var vf2 = U.damp(v.vx * f.x + v.vz * f.z, fT, 1.5, dt);
      v.vx = f.x * vf2; v.vz = f.z * vf2;
      v.pitch = U.damp(v.pitch, 0, 3, dt); v.roll = U.damp(v.roll, -c.steer * 0.32, 2.5, dt);
    }
    v.x += v.vx * dt; v.y += v.vy * dt; v.z += v.vz * dt;
    v.onGround = false;
    edgeGuard(v);
    if (!outside(v, 2)) { var res = W().resolveCapsule(v.x, v.z, v.y + 1, 0.6); if (res.x !== v.x || res.z !== v.z) { v.x = res.x; v.z = res.z; v.vx *= 0.5; v.vz *= 0.5; } }
    var g = W().heightAt(v.x, v.z, v.y + 0.5);   // the ground, not a roof: a ped cannot stand on a roof (resolveCapsule slides the canopy off it)
    var wet = waterAt(v.x, v.z) && g <= WATER_Y + 0.05;
    if (v.y <= g + (wet ? 0.2 : 0)) {
      var impact = -v.vy, open = v.chute === 'open';
      var ped = d; v.y = g;
      detach(v, ped, v.x, g, v.z, false);
      if (wet) { ped.y = WATER_Y + 0.25; ped.swimming = true; ped.onGround = false; }
      else if (!open && impact > 16) ped.knockDown(v.vx * 0.4, v.vz * 0.4, 60 + (impact - 16) * 6, null, 'fall');
      else if (impact > 6.5 || v.speed2d() > 10) ped.knockDown(v.vx * 0.4, v.vz * 0.4, open ? 0 : 15, null, 'fall');
      v.chute = 'landed'; v.collapseT = 0; v.locked = true;
      if (ped.kind === 'player') { ped.stats.skydives = (ped.stats.skydives || 0) + 1; }
      emit('parachute:land', { vehicle: v, ped: ped, x: v.x, z: v.z, open: open, hard: !open && impact > 16, water: wet });
    }
    v._syncOccupants();
    v.speed = Math.sqrt(v.vx * v.vx + v.vz * v.vz);
  }
  function deploy(v) {
    if (v.chute === 'open') return;
    v.chute = 'open'; v.openT = 0;
    sfx('chuteOpen', v.x, v.z, 0.9);
    emit('parachute:open', { vehicle: v });
    if (v.hasPlayer()) shake(0.35);
  }

  // ---------------------------------------------------------- the router --
  VP.update = function (dt) {
    var f = fam(this);
    if (!f) return base.update.call(this, dt);
    if (this.sinking) return base.update.call(this, dt);
    if (this.autopilot && !(this.driver && this.driver.kind === 'player')) autopilotStep(this);
    if (f === 'moto') return updateMoto(this, dt);
    if (f === 'heli') return updateHeli(this, dt);
    if (f === 'plane') return updatePlane(this, dt);
    if (f === 'boat') return updateBoat(this, dt);
    if (f === 'chute') return updateChute(this, dt);
    return base.update.call(this, dt);
  };
  // armour from the mod shop soaks a share of every hit
  VP.applyDamage = function (n, src, type) {
    var m = this.mods;
    if (m && m.armor > 0 && n > 0) n *= 1 - 0.07 * Math.min(5, m.armor);
    return base.applyDamage.call(this, n, src, type);
  };
  // leave the seat without the ground teleport (the ped keeps the vehicle's height and velocity)
  function detach(v, ped, x, y, z, fall) {
    if (v.driver === ped) { v.driver = null; v.ctl = null; v.throttle = 0; v.steer = 0; v.brake = 0; v.handbrake = false; }
    else { var i = v.passengers.indexOf(ped); if (i >= 0) v.passengers.splice(i, 1); }
    ped.inVehicle = null; ped.seat = -1; ped.exitLock = 0.4;
    if (ped.kind === 'player') ped.vehicle = null;
    ped.x = x; ped.y = y; ped.z = z; ped.yaw = v.yaw; ped.vx = v.vx; ped.vz = v.vz; ped.vy = v.vy;
    ped.onGround = !fall; ped.swimming = false; ped.state = fall ? 'jump' : 'idle'; ped.snap();
    if (fall) ped._fall = { top: y };
    if (ped._sh) E().hash.update(ped);
    sfx('exit', v.x, v.z, 0.5);
    emit('vehicle:exit', { vehicle: v, ped: ped });
  }
  VP.exit = function (ped) {
    var f = fam(this);
    if (!f || f === 'moto' || !ped || ped.inVehicle !== this) return base.exit.call(this, ped);
    if (f === 'chute') {
      // cutting away: the rider drops from where the canopy is
      detach(this, ped, this.x, this.y, this.z, true);
      this.chute = 'landed'; this.collapseT = 0; this.locked = true;
      return true;
    }
    if (isAir(this)) {
      var g = surfaceAt(this.x, this.z, this.y + 0.5), agl = this.y - g, sp = this.speed2d();
      // over (or on) a roof below bail height: peds cannot stand on roofs, so the door stays shut
      if (ped.kind === 'player' && ped.alive && this._bailReq && agl < 30 && g > W().heightAt(this.x, this.z, this.y) + 1.5) {
        if (!this._roofT || this.age - this._roofT > 3) { this._roofT = this.age; toast('Not on a roof: set her down on the street, or climb past 30 m and bail.'); }
        return false;
      }
      if (agl > 2.5 || (!this.onGround && sp > 4)) {
        var side = this.localToWorld(-(this.hw + 1.0), 0);
        var y = this.y + 0.4;
        detach(this, ped, side.x, y, side.z, true);
        var bail = this._bailReq && agl >= 30 && ped.alive && !this.exploded && ped.kind === 'player';
        if (bail) {
          ped._fall = null;
          var ch = spawn('parachute', side.x, side.z, { y: y, yaw: this.yaw, color: '#e8b53a' });
          if (ch) {
            ch.vx = this.vx * 0.5; ch.vz = this.vz * 0.5; ch.vy = Math.min(0, this.vy); ch.chute = 'free';
            ch.enter(ped, 0); ch.snap();
            sfx('bail', side.x, side.z, 0.8);
            if (!Vehicles._bailHint) { Vehicles._bailHint = true; toast('Freefall! Space opens the Golden Parachute. W dives, A / D turn.'); }
            emit('parachute:deploy', { vehicle: ch, from: this });
          }
        }
        return true;
      }
    }
    return base.exit.call(this, ped);
  };

  // --------------------------------------------------------------- autopilot --
  // vehicle.autopilot = {x, z, alt?, speed?} flies (or sails) an AI-driven vehicle toward a point; null stops
  function autopilotStep(v) {
    var ap = v.autopilot, f = fam(v); if (!ap) return;
    var dx = ap.x - v.x, dz = ap.z - v.z, d = Math.sqrt(dx * dx + dz * dz);
    var want = U.dirToYaw(dx, dz), err = U.wrapAngle(want - v.yaw);
    var o = v.ctl || (v.ctl = {});
    for (var k in CTL0) if (o[k] == null) o[k] = CTL0[k];
    if (!v.driver) { v.rotor = Math.max(v.rotor || 0, 0.999); }
    if (f === 'heli') {
      var alt = ap.alt != null ? ap.alt : 40, g = surfaceAt(v.x, v.z, v.y), agl = v.y - g;
      o.yaw = U.clamp(err * 2, -1, 1); o.collective = U.clamp((alt - agl) * 0.15, -1, 1);
      o.pitch = Math.abs(err) < 0.6 ? U.clamp(d / 60, 0, 1) * (ap.speed != null ? U.clamp(ap.speed / 40, 0, 1) : 1) : 0; o.roll = 0;
      if (agl < 6 && d > 20) o.pitch = 0;
    } else if (f === 'boat') {
      o.steer = U.clamp(-err * 2, -1, 1); o.throttle = d > 8 ? U.clamp(d / 30, 0.3, 1) : 0;
    } else if (f === 'plane') {
      var alt2 = ap.alt != null ? ap.alt : 120, agl2 = v.y - surfaceAt(v.x, v.z, v.y);
      o.collective = 1; o.roll = U.clamp(-err * 1.5, -1, 1) - (-v.roll) * 0.0; o.pitch = U.clamp(-(alt2 - agl2) * 0.02 + v.pitch, -1, 1);
      if (v.onGround) { o.fwd = true; o.pitch = v.air > v.cls.vRotate ? -1 : 0; }
    }
    if (!v.driver) v._autoDriver = true;
  }
  // an autopilot without a ped in the seat still flies: a stand-in driver flag the updates read
  var _liveDriver = liveDriver;
  liveDriver = function (v) { return _liveDriver(v) || (v.autopilot && !v.wreck ? AUTO_DRIVER : null); };
  var AUTO_DRIVER = { alive: true, kind: 'autopilot' };

  // ================================================================ player ==
  PP.control = function (dt) {
    var v = this.inVehicle, f = fam(v);
    if (!f) return base.control.call(this, dt);
    if (f === 'moto') {
      base.control.call(this, dt);
      if (this.inVehicle === v && v.driver === this) { var a = readAxes(); v.wheelieIn = !!a.wheelie && !this.aiming; }
      return;
    }
    var In = GTP.Input, A = GTP.Audio;
    this.intent.x = 0; this.intent.z = 0; this.intent.run = false; this.aiming = false;
    if (!this.alive || !this.controlEnabled || this.knockedDown) { v.ctl = null; v.throttle = 0; v.steer = 0; v.handbrake = false; if (A && A.engine) A.engine(0, v.type); return; }
    if (v.driver === this) v.ctl = readAxes();
    if (f === 'boat') { v.throttle = v.ctl ? v.ctl.throttle : 0; v.steer = v.ctl ? v.ctl.steer : 0; }
    if (f !== 'chute' && In.pressed('radio') && A && A.radio && A.radio.next) { var st = A.radio.next(); if (st) toast('Radio: ' + (st.name || st)); }
    if (f === 'boat' && In.pressed('horn')) { v.honk(); this.stats.honking = (this.stats.honking || 0) + 1; }
    if (In.pressed('enter') && this.exitLock <= 0) {
      v._bailReq = true;
      try { this.exitVehicle(); } finally { v._bailReq = false; }
      if (A && A.engine) A.engine(0, v.type);
      return;
    }
    if (A && A.engine) A.engine(engineLevel(v), v.type);
    void dt;
  };
  function engineLevel(v) {
    var f = fam(v);
    if (f === 'heli') return U.clamp(v.rotor * (0.8 + 0.2 * Math.abs((v.ctl && v.ctl.collective) || 0)), 0, 1);
    if (f === 'plane') return U.clamp(v.rotor || 0, 0, 1);
    if (f === 'boat') return U.clamp(Math.abs(v.speed) / v.cls.maxSpeed * 0.8 + Math.abs(v.throttle || 0) * 0.2, 0, 1);
    if (f === 'chute') return U.clamp(Math.sqrt(v.vx * v.vx + v.vy * v.vy + v.vz * v.vz) / 50, 0, 1) * (v.chute === 'open' ? 0.35 : 1);
    return U.clamp(Math.abs(v.speed) / v.cls.maxSpeed, 0, 1);
  }
  // falls after leaving an aircraft hurt on landing (the city's own hops and the Loop's edge stay as they were)
  PP.update = function (dt) {
    base.pupdate.call(this, dt);
    var fl = this._fall; if (!fl) return;
    if (this.inVehicle || this.swimming || !this.alive) { this._fall = null; return; }
    if (this.y > fl.top) fl.top = this.y;
    if (this.onGround) {
      var drop = fl.top - this.y; this._fall = null;
      if (drop > 7) { this.knockDown(this.vx * 0.3, this.vz * 0.3, (drop - 7) * 7, null, 'fall'); shake(Math.min(1.2, drop / 20)); }
    }
  };

  // ============================================================ hud / pose ==
  function heading(yaw) { var h = (-yaw * 180 / Math.PI) % 360; return h < 0 ? h + 360 : h; }
  function vehicleHud(v) {
    var f = fam(v) || 'car', S = v.cls, sp = f === 'plane' ? (v.air || 0) : v.speed2d();
    if (f === 'heli' || f === 'chute') sp = Math.sqrt(sp * sp + v.vy * v.vy);
    var g = surfaceAt(v.x, v.z, v.y + 0.5), gear, thr;
    if (f === 'plane') { gear = v.gear || 'down'; thr = v.thr || 0; }
    else if (f === 'heli') { gear = 'skids'; thr = U.clamp(((v.ctl && v.ctl.collective) || 0) * 0.5 + 0.5, 0, 1) * (v.rotor || 0); }
    else if (f === 'chute') { gear = v.chute || 'free'; thr = 0; }
    else if (f === 'boat') { gear = v.speed < -0.5 ? 'R' : Math.abs(v.throttle || 0) > 0.05 ? 'F' : 'N'; thr = Math.abs(v.throttle || 0); }
    else {
      var n = S.maxSpeed > 48 ? 6 : 5, frac = U.clamp(Math.abs(v.speed) / S.maxSpeed, 0, 0.999);
      gear = v.speed < -0.8 ? 'R' : Math.abs(v.speed) < 0.3 && !v.throttle ? 'N' : 1 + Math.floor(frac * n);
      thr = Math.abs(v.throttle || 0);
    }
    var prompt = null;
    if (f === 'chute' && v.chute === 'free') prompt = 'Open the parachute';
    else if (isAir(v) && v.hasPlayer() && v.y - g >= 30) prompt = 'Bail out';
    return {
      family: f, type: v.type, name: S.name || v.type,
      speed: +sp.toFixed(2), kmh: Math.round(sp * 3.6), mph: Math.round(sp * 2.237),
      alt: +(v.y - g).toFixed(1), altSea: +(v.y - WATER_Y).toFixed(1), vs: +(v.vy || 0).toFixed(2),
      pitch: +v.pitch.toFixed(3), roll: +v.roll.toFixed(3), heading: Math.round(heading(v.yaw)),
      throttle: +thr.toFixed(3), gear: gear, rotor: +(v.rotor || 0).toFixed(3), stall: !!v.stall,
      hp: +(Math.max(0, v.hp) / v.maxHp).toFixed(3), onGround: !!v.onGround, chute: v.chute || null,
      wheelie: +(v._wheelie || 0).toFixed(3), lean: +(v._lean || 0).toFixed(3), beached: !!v.beached, prompt: prompt
    };
  }
  VP.hud = function () { return vehicleHud(this); };

  // where a visible rider sits: a moto saddle, a jet ski seat, under the canopy, or the pilot's / helm seat seen
  // through the glass (kind 'seated': [right, up, back] from the vehicle origin). Passengers stay hidden but on the moto.
  var SEATS = { heli: [-0.38, 0.52, -1.0], plane: [-0.3, 0.72, -0.25], jet: [0, 1.02, -3.0], speedboat: [0.5, 0.3, 0.55] };
  var _e3 = null, _v3 = null;
  function riderPose(ped, a) {
    var v = ped && ped.inVehicle, f = fam(v);
    if (!v || v.wreck || v.sinking) return null;
    var kind = f === 'moto' ? 'moto' : v.type === 'jetski' ? 'jetski' : f === 'chute' ? 'chute' : SEATS[v.type] ? 'seated' : null;
    if (!kind || (kind !== 'chute' && ped.seat !== 0 && kind !== 'moto')) return null;
    if (typeof THREE === 'undefined') return null;
    a = a == null ? 1 : a;
    _e3 = _e3 || new THREE.Euler(); _v3 = _v3 || new THREE.Vector3();
    var x = v._px + (v.x - v._px) * a, y = v._py + (v.y - v._py) * a, z = v._pz + (v.z - v._pz) * a;
    var yaw = v._pyaw + U.wrapAngle(v.yaw - v._pyaw) * a, pitch = kind === 'chute' ? 0 : v.pitch, roll = kind === 'chute' ? v.roll * 0.6 : v.roll;
    var back = kind === 'moto' ? (ped.seat === 0 ? 0.22 : 0.62) : kind === 'jetski' ? 0.35 : 0;
    var up = kind === 'moto' ? 0.04 + (v._wheelie ? Math.sin(v._wheelie) * 0.72 : 0) : kind === 'jetski' ? 0.0 : 0, right = 0;
    if (kind === 'seated') { var st = SEATS[v.type]; right = st[0]; up = st[1]; back = st[2]; }
    _e3.set(pitch, yaw, roll, 'YXZ');
    _v3.set(right, up, back).applyEuler(_e3);
    return { kind: kind, x: x + _v3.x, y: y + _v3.y, z: z + _v3.z, pitch: kind === 'chute' ? (v.chute === 'open' ? 0 : v.pitch * 0.8) : pitch, yaw: yaw, roll: roll, chute: v.chute || null, seat: ped.seat };
  }
  PedP._syncRider = function (m, a) {
    var pose = riderPose(this, a);
    if (!pose) return base.rider.call(this, m, a);
    var firstPerson = this.kind === 'player' && this.cameraMode === 'first';
    if (firstPerson || this.removed || camDist(this.x, this.z) > C.QUALITY.pedDraw) { m.visible = false; return; }
    m.visible = true;
    var parts = this._parts || (this._parts = {
      legL: m.getObjectByName('legL'), legR: m.getObjectByName('legR'), armL: m.getObjectByName('armL'), armR: m.getObjectByName('armR'),
      torso: m.getObjectByName('torso'), head: m.getObjectByName('head'), body: m.getObjectByName('body') || m
    });
    m.position.set(pose.x, pose.y, pose.z);
    m.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
    if (!parts.legL) return;
    if (pose.kind === 'chute') {
      var free = pose.chute !== 'open';
      parts.legL.rotation.x = free ? -0.25 : 0.15; parts.legR.rotation.x = free ? -0.1 : 0.3;
      parts.armL.rotation.x = free ? 1.6 : 2.85; parts.armR.rotation.x = free ? 1.6 : 2.85;
      parts.armL.rotation.z = free ? 1.1 : 0.25; parts.armR.rotation.z = free ? -1.1 : -0.25;
      if (parts.torso) parts.torso.rotation.x = 0; if (parts.head) parts.head.rotation.x = free ? -0.5 : 0.1;
    } else {
      parts.legL.rotation.x = 1.05; parts.legR.rotation.x = 1.05;
      parts.legL.rotation.z = 0.12; parts.legR.rotation.z = -0.12;
      parts.armL.rotation.x = 1.15; parts.armR.rotation.x = 1.15; parts.armL.rotation.z = 0.15; parts.armR.rotation.z = -0.15;
      var tuck = pose.kind === 'moto' && this.inVehicle && Math.abs(this.inVehicle.speed) > 25 ? 0.25 : 0;
      if (parts.torso) parts.torso.rotation.x = pose.kind === 'seated' ? 0 : -0.35 - tuck; if (parts.head) parts.head.rotation.x = pose.kind === 'seated' ? 0 : 0.25 + tuck;
      if (pose.kind === 'seated') { parts.legL.rotation.x = 1.45; parts.legR.rotation.x = 1.45; parts.armL.rotation.x = 0.9; parts.armR.rotation.x = 0.9; }
      if (pose.seat > 0) { parts.armL.rotation.x = 0.7; parts.armR.rotation.x = 0.7; }
    }
  };

  // ================================================================ meshes ==
  // A small builder: parts by material key, merged per key into one BufferGeometry (positions, normals, vertex colours).
  // Forward is -z, right +x, up +y; land vehicles sit on y = 0, boats float with y = 0 at the waterline.
  var GEO = {};          // type -> {statics: {key: geo}, anims: {name: {pivot, statics: {key: geo}}}, info}
  var MATS = null;
  function mats() {
    if (MATS) return MATS;
    var A = GTP.Assets;
    function std(col, rough, metal, extra) { var m = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, color: col, roughness: rough, metalness: metal, envMapIntensity: 0.8 }, extra || {})); return m; }
    function em(r, g, b) { return A && A.emitterMaterial ? A.emitterMaterial(r, g, b) : new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color().setRGB(Math.min(1, r), Math.min(1, g), Math.min(1, b)) }); }
    MATS = {
      detail: std(0xffffff, 0.6, 0.2), dark: std(0x2a2c30, 0.6, 0.25),
      chrome: A && A.chromeMaterial ? A.chromeMaterial() : std(0xffffff, 0.15, 1),
      glass: std(0x9fb8cc, 0.06, 0.9, { transparent: true, opacity: 0.6 }),
      canopy: std(0xffffff, 0.75, 0, { side: THREE.DoubleSide }),
      light: em(3.0, 3.0, 3.0), lightOff: std(0xb8bab8, 0.2, 0.3),
      burner: new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      wreck: std(0x1f1d1b, 0.95, 0.1), wreckGlass: std(0x15171a, 0.6, 0.2)
    };
    return MATS;
  }
  function Builder() { this.p = {}; this.a = {}; this.cur = this.p; }
  Builder.prototype.anim = function (name, pivot) { var a = this.a[name] = { pivot: pivot || [0, 0, 0], p: {} }; this.cur = a.p; return this; };
  Builder.prototype.main = function () { this.cur = this.p; return this; };
  Builder.prototype.add = function (key, geo, col, m4) {
    if (geo.index) geo = geo.toNonIndexed();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (m4) geo.applyMatrix4(m4);
    var n = geo.attributes.position.count, cc = new Float32Array(n * 3), c = col || [1, 1, 1];
    for (var i = 0; i < n; i++) { cc[i * 3] = c[0]; cc[i * 3 + 1] = c[1]; cc[i * 3 + 2] = c[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    (this.cur[key] = this.cur[key] || []).push(geo);
    return this;
  };
  function mergeList(list) {
    var n = 0, i; for (i = 0; i < list.length; i++) n += list[i].attributes.position.count;
    var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), o = 0;
    for (i = 0; i < list.length; i++) {
      var g = list[i], c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
      o += c; g.dispose();
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere(); geo.userData.shared = true;
    return geo;
  }
  // Draw calls: every vertex-coloured key folds into one 'detail' mesh (its material's base colour baked into the
  // vertex colours), the lamps into one 'light' mesh (nav lights into 'blink'); an animated part is a single mesh.
  // A vehicle is 6 to 9 draw calls.
  var BAKE = { dark: 0x2a2c30, rubber: 0x18181a, metal: 0x9aa0a8, seat: 0x2b2724, white: 0xf2f2ee, wood: 0x9a6438, cushion: 0xf4efe4 };
  var LAMP = { lightW: [1, 0.97, 0.88], lightT: [1, 0.12, 0.1], lightA: [1, 0.6, 0.12], lightR: [1, 0.12, 0.1], lightG: [0.12, 1, 0.25] };
  var ANIM_BAKE = { chrome: 0xd0d4da, paint2: 0xd8d4c8, glass: 0x8899aa, paint: 0xe8b53a, line: 0xd8d4c8, canopy: 0xffffff };
  function tint(geo, rgb) { var c = geo.attributes.color.array; for (var i = 0; i < c.length; i += 3) { c[i] *= rgb[0]; c[i + 1] *= rgb[1]; c[i + 2] *= rgb[2]; } }
  function hexRgb(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
  // small vehicles (info.slim) also fold chrome, glass and the second paint into the detail mesh
  var SLIM = { chrome: 0xd0d4da, glass: 0x6f8496, paint2: 0x2b2b2e };
  function fold(parts, anim, slim) {
    var out = {};
    for (var k in parts) {
      var target = k, rgb = null;
      if (BAKE[k] != null) { target = 'detail'; rgb = hexRgb(BAKE[k]); }
      else if (slim && SLIM[k] != null && slim.indexOf(k) >= 0) { target = 'detail'; rgb = hexRgb(SLIM[k]); }
      else if (LAMP[k]) { target = (k === 'lightR' || k === 'lightG') ? 'blink' : 'light'; rgb = LAMP[k]; }
      if (anim && target !== 'burner') {
        if (ANIM_BAKE[k] != null) { rgb = hexRgb(ANIM_BAKE[k]); target = (k === 'paint' || k === 'line' || k === 'canopy') ? 'canopy' : 'detail'; }
        else if (target !== 'canopy') target = 'detail';
      }
      for (var i = 0; i < parts[k].length; i++) { if (rgb) tint(parts[k][i], rgb); (out[target] = out[target] || []).push(parts[k][i]); }
    }
    var merged = {}; for (var t in out) merged[t] = mergeList(out[t]);
    return merged;
  }
  Builder.prototype.finish = function (info) {
    info = info || {};
    var out = { statics: fold(this.p, false, info.slim), anims: {}, info: info };
    for (var an in this.a) out.anims[an] = { pivot: this.a[an].pivot, statics: fold(this.a[an].p, true) };
    return out;
  };
  // matrix helper: translate, rotate (XYZ radians), scale
  var _m4 = null, _q = null, _eu = null;
  function T(x, y, z, rx, ry, rz, sx, sy, sz) {
    _m4 = new THREE.Matrix4(); _q = _q || new THREE.Quaternion(); _eu = _eu || new THREE.Euler();
    _eu.set(rx || 0, ry || 0, rz || 0, 'XYZ'); _q.setFromEuler(_eu);
    return _m4.compose(new THREE.Vector3(x || 0, y || 0, z || 0), _q, new THREE.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
  }
  function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
  function cyl(rt, rb, h, seg) { return new THREE.CylinderGeometry(rt, rb, h, seg || 12); }
  function sph(r, ws, hs) { return new THREE.SphereGeometry(r, ws || 14, hs || 10); }
  // a body of revolution along the forward axis: prof = [[forward, radius], ...] from the tail to the nose
  function lathe(prof, seg) {
    var pts = []; for (var i = 0; i < prof.length; i++) pts.push(new THREE.Vector2(Math.max(0.001, prof[i][1]), prof[i][0]));
    var g = new THREE.LatheGeometry(pts, seg || 16);
    g.rotateX(-Math.PI / 2);   // the lathe axis (y) becomes forward (-z)
    return g;
  }
  // a side profile [[forward, up], ...] extruded across the width, with a soft bevel
  function side(prof, width, bevel) {
    var sh = new THREE.Shape(); sh.moveTo(prof[0][0], prof[0][1]);
    for (var i = 1; i < prof.length; i++) sh.lineTo(prof[i][0], prof[i][1]);
    var b = bevel || 0, depth = Math.max(0.01, width - 2 * b);
    var g = new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 4 });
    g.rotateY(Math.PI / 2); g.translate(-depth / 2, 0, 0);
    return g;
  }
  // a plan outline [[right, forward], ...] extruded up by `thick` (wings, fins laid flat, decks)
  function plan(outline, thick, bevel) {
    var sh = new THREE.Shape(); sh.moveTo(outline[0][0], outline[0][1]);
    for (var i = 1; i < outline.length; i++) sh.lineTo(outline[i][0], outline[i][1]);
    var b = bevel || 0;
    var g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.005, thick - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 4 });
    g.rotateX(-Math.PI / 2);   // shape y (forward) -> -z, extrusion -> +y
    g.translate(0, b, 0);
    return g;
  }
  // a hull lofted through stations: st = [{f, pts: [[x, y], ...]}] right-half points from the keel up to the gunwale (same count)
  function hull(st) {
    var rows = [], i, j, pos = [], idx = [];
    for (i = 0; i < st.length; i++) {
      var s = st[i], row = [];
      for (j = s.pts.length - 1; j >= 1; j--) row.push([-s.pts[j][0], s.pts[j][1], -s.f]);
      for (j = 0; j < s.pts.length; j++) row.push([s.pts[j][0], s.pts[j][1], -s.f]);
      rows.push(row);
    }
    var w = rows[0].length;
    for (i = 0; i < rows.length; i++) for (j = 0; j < w; j++) pos.push(rows[i][j][0], rows[i][j][1], rows[i][j][2]);
    for (i = 0; i < rows.length - 1; i++) for (j = 0; j < w - 1; j++) {
      var a = i * w + j, b = a + 1, c = a + w, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // transom: close the stern (the first station)
    var cx = pos.length / 3; pos.push(0, (rows[0][0][1] + rows[0][w - 1][1]) / 2, rows[0][0][2]);
    for (j = 0; j < w - 1; j++) idx.push(cx, j, j + 1);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  // a spoked wheel facing +-x at the origin: tyre (rubber), rim and spokes (chrome / metal)
  function addWheel(B, r, w, spokes, rimKey) {
    B.add('rubber', new THREE.TorusGeometry(r - w * 0.42, w * 0.5, 8, 20), [1, 1, 1], T(0, 0, 0, 0, Math.PI / 2, 0, 1, 1, 1.0));
    B.add(rimKey || 'chrome', cyl(r * 0.58, r * 0.58, w * 0.55, 16), [0.85, 0.86, 0.9], T(0, 0, 0, 0, 0, Math.PI / 2));
    B.add('dark', cyl(r * 0.2, r * 0.2, w * 0.9, 10), [0.4, 0.4, 0.42], T(0, 0, 0, 0, 0, Math.PI / 2));
    for (var i = 0; i < spokes; i++) { var a = i * TAU / spokes; B.add(rimKey || 'chrome', box(w * 0.3, r * 0.62, 0.035), [0.9, 0.9, 0.92], T(0, Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, a, 0, 0)); }
  }

  var BUILD = {};
  BUILD.moto = function () {
    var B = new Builder(), WH = [1, 1, 1], GREY = [0.55, 0.56, 0.6], BLK = [0.12, 0.12, 0.13];
    // rear wheel and swingarm (main), front wheel (anim 'front' turns with the bars)
    B.anim('wheelR', [0, 0.31, 0.72]); addWheel(B, 0.31, 0.19, 5);
    B.add('rubber', box(0.3, 0.05, 0.42), [0.3, 0.3, 0.3], T(0, 0.32, -0.12));   // hugger
    B.anim('front', [0, 0.95, -0.56]);
    B.add('chrome', cyl(0.035, 0.035, 0.78, 8), [0.9, 0.9, 0.92], T(-0.09, -0.36, -0.08, -0.42, 0, 0));
    B.add('chrome', cyl(0.035, 0.035, 0.78, 8), [0.9, 0.9, 0.92], T(0.09, -0.36, -0.08, -0.42, 0, 0));
    B.add('dark', cyl(0.022, 0.022, 0.62, 8), BLK, T(0, 0.08, 0.06, 0, 0, Math.PI / 2));          // bars
    B.add('rubber', cyl(0.03, 0.03, 0.12, 8), WH, T(-0.3, 0.08, 0.06, 0, 0, Math.PI / 2));
    B.add('rubber', cyl(0.03, 0.03, 0.12, 8), WH, T(0.3, 0.08, 0.06, 0, 0, Math.PI / 2));
    B.add('chrome', box(0.04, 0.12, 0.04), WH, T(-0.24, 0.16, 0.08)); B.add('chrome', box(0.04, 0.12, 0.04), WH, T(0.24, 0.16, 0.08));
    B.add('glass', box(0.07, 0.05, 0.12), WH, T(-0.25, 0.23, 0.1)); B.add('glass', box(0.07, 0.05, 0.12), WH, T(0.25, 0.23, 0.1));   // mirrors
    B.anim('wheelF', [0, 0.31, -0.72]); addWheel(B, 0.31, 0.15, 5);
    B.add('metal', cyl(0.13, 0.13, 0.02, 16), [0.8, 0.8, 0.82], T(0.09, 0, 0, 0, 0, Math.PI / 2));   // the disc brake
    B.main();
    // the fairing, tank and tail from side profiles (forward, up)
    B.add('paint', side([[-0.1, 0.55], [0.55, 0.58], [0.82, 0.72], [0.9, 0.98], [0.72, 1.12], [0.55, 1.05], [0.35, 0.82], [-0.1, 0.78]], 0.42, 0.06), WH);   // nose fairing
    B.add('paint', side([[-0.5, 0.78], [0.3, 0.8], [0.4, 0.98], [0.15, 1.06], [-0.32, 1.0]], 0.36, 0.06), WH);                                           // tank
    B.add('paint2', side([[-1.05, 0.88], [-0.55, 0.76], [-0.3, 0.8], [-0.4, 0.92], [-1.0, 1.02]], 0.24, 0.04), WH);                                    // tail
    B.add('seat', side([[-0.85, 0.94], [-0.3, 0.86], [-0.28, 0.93], [-0.84, 1.0]], 0.28, 0.03), WH);
    B.add('glass', side([[0.62, 1.06], [0.8, 1.02], [0.62, 1.26], [0.52, 1.2]], 0.3, 0.0), [0.75, 0.85, 0.95]);   // screen
    B.add('dark', box(0.32, 0.36, 0.5), GREY, T(0, 0.48, -0.1));                                                  // engine
    for (var i = 0; i < 4; i++) B.add('metal', box(0.34, 0.02, 0.44), [0.7, 0.7, 0.72], T(0, 0.38 + i * 0.07, -0.1));
    B.add('dark', box(0.16, 0.06, 0.62), BLK, T(0, 0.5, 0.45, -0.25, 0, 0));                                      // swingarm
    B.add('chrome', cyl(0.06, 0.05, 0.6, 10), WH, T(0.2, 0.42, 0.55, Math.PI / 2 - 0.25, 0, 0));                  // exhaust
    B.add('dark', cyl(0.045, 0.045, 0.06, 10), BLK, T(0.2, 0.49, 0.85, Math.PI / 2 - 0.25, 0, 0));
    B.add('lightW', side([[0.86, 0.86], [0.92, 0.88], [0.9, 0.98], [0.84, 0.95]], 0.18, 0), WH);                  // headlight
    B.add('lightT', box(0.16, 0.05, 0.03), WH, T(0, 0.98, 1.03));
    B.add('lightA', box(0.05, 0.04, 0.05), WH, T(-0.16, 0.86, -0.82)); B.add('lightA', box(0.05, 0.04, 0.05), WH, T(0.16, 0.86, -0.82));
    B.add('dark', box(0.2, 0.04, 0.16), BLK, T(0, 0.86, 1.0, 0.4, 0, 0));                                         // plate hanger
    B.add('white', box(0.16, 0.1, 0.01), [0.95, 0.93, 0.85], T(0, 0.82, 1.06, 0.4, 0, 0));
    B.add('dark', box(0.05, 0.05, 0.3), BLK, T(-0.17, 0.38, 0.28)); B.add('dark', box(0.05, 0.05, 0.3), BLK, T(0.17, 0.38, 0.28));   // pegs
    return B.finish({ eye: { x: 0, y: 1.45, z: 0.1 }, slim: ['chrome', 'glass', 'paint2'] });
  };
  BUILD.heli = function () {
    var B = new Builder(), WH = [1, 1, 1], BLK = [0.12, 0.12, 0.13];
    // cabin: a body of revolution flattened at the sides, the glass bubble over the front
    B.add('paint', lathe([[-2.5, 0.25], [-2.2, 0.8], [-1.5, 1.08], [-0.4, 1.15], [0.6, 1.12], [1.5, 1.0], [2.2, 0.72], [2.6, 0.32], [2.75, 0.05]], 20), WH, T(0, 1.55, 0, 0, 0, 0, 0.92, 1.05, 1));
    B.add('glass', sph(1.0, 18, 12), [0.8, 0.9, 1], T(0, 1.75, -1.55, 0, 0, 0, 0.88, 0.82, 1.15));
    B.add('paint2', box(1.9, 0.18, 3.0), WH, T(0, 1.05, 0.0, 0, 0, 0, 1, 1, 1));                         // the belly stripe
    B.add('dark', box(1.0, 0.55, 1.6), [0.3, 0.3, 0.33], T(0, 2.75, 0.4));                               // engine housing
    B.add('paint', side([[-1.3, 2.45], [0.9, 2.45], [0.6, 2.95], [-1.0, 2.95]], 1.1, 0.12), WH);
    B.add('dark', cyl(0.22, 0.28, 0.4, 10), BLK, T(0, 3.0, 1.15, Math.PI / 2, 0, 0));                    // exhaust
    // tail boom, fin, stabiliser
    B.add('paint', cyl(0.18, 0.42, 4.8, 12), WH, T(0, 1.95, 4.6, Math.PI / 2, 0, 0));
    B.add('paint', plan([[-1.2, 0], [1.2, 0], [1.0, 0.45], [-1.0, 0.45]], 0.08), WH, T(0, 1.95, 6.2));
    B.add('paint2', side([[0, 0], [0.75, 0], [0.4, 1.35], [-0.15, 1.35]], 0.1, 0.02), WH, T(0, 1.95, 6.55, 0, Math.PI, 0));
    B.add('lightW', sph(0.07, 8, 6), WH, T(0, 2.0, 7.05));
    // skids
    for (var s = -1; s <= 1; s += 2) {
      B.add('metal', cyl(0.06, 0.06, 3.6, 8), [0.8, 0.8, 0.82], T(s * 1.05, 0.08, -0.1, Math.PI / 2, 0, 0));
      B.add('metal', cyl(0.06, 0.06, 0.35, 8), [0.8, 0.8, 0.82], T(s * 1.05, 0.2, -1.95, -0.9, 0, 0));
      B.add('metal', cyl(0.05, 0.05, 0.95, 8), [0.8, 0.8, 0.82], T(s * 0.85, 0.55, -0.9, 0, 0, s * 0.45));
      B.add('metal', cyl(0.05, 0.05, 0.95, 8), [0.8, 0.8, 0.82], T(s * 0.85, 0.55, 0.9, 0, 0, s * 0.45));
    }
    B.add('lightR', sph(0.13, 8, 6), WH, T(-1.08, 1.6, -0.3)); B.add('lightG', sph(0.13, 8, 6), WH, T(1.08, 1.6, -0.3)); B.add('lightR', sph(0.12, 8, 6), WH, T(0, 1.98, 1.2));
    B.add('lightW', cyl(0.14, 0.18, 0.2, 10), WH, T(0, 0.75, -1.9, 0.3, 0, 0));                          // searchlight
    B.add('dark', box(0.08, 0.5, 0.08), BLK, T(0, 0.85, -2.5));                                          // nose probe
    B.add('seat', box(1.5, 0.55, 0.5), WH, T(0, 1.15, -0.3));
    // the main rotor (anim 'rotor'), the tail rotor (anim 'tail')
    B.anim('rotor', [0, 3.05, 0.2]);
    B.add('metal', cyl(0.12, 0.16, 0.35, 10), [0.7, 0.7, 0.72], T(0, -0.1, 0));
    B.add('dark', cyl(0.28, 0.28, 0.1, 12), BLK, T(0, 0.08, 0));
    for (var b = 0; b < 4; b++) { var a = b * Math.PI / 2; B.add('dark', box(0.28, 0.04, 5.0), BLK, T(Math.sin(a) * 2.6, 0.1, Math.cos(a) * 2.6, 0, a, 0.06)); B.add('paint2', box(0.29, 0.045, 0.35), WH, T(Math.sin(a) * 4.95, 0.1, Math.cos(a) * 4.95, 0, a, 0)); }
    B.anim('tail', [0.24, 2.3, 6.85]);
    B.add('dark', cyl(0.06, 0.06, 0.12, 8), BLK, T(0, 0, 0, 0, 0, Math.PI / 2));
    B.add('dark', box(0.03, 1.4, 0.16), BLK, T(0.05, 0, 0)); B.add('dark', box(0.03, 0.16, 1.4), BLK, T(0.05, 0, 0));
    return B.finish({ eye: { x: -0.35, y: 2.0, z: -1.2 } });
  };
  BUILD.plane = function () {
    var B = new Builder(), WH = [1, 1, 1], BLK = [0.12, 0.12, 0.13], span = SPECS.plane.span;
    B.add('paint', lathe([[-4.6, 0.1], [-4.0, 0.22], [-2.0, 0.48], [0.0, 0.66], [1.6, 0.7], [2.8, 0.62], [3.35, 0.45], [3.5, 0.3]], 18), WH, T(0, 1.45, 0, 0, 0, 0, 0.95, 1.08, 1));
    B.add('paint2', lathe([[-4.0, 0.225], [-2.0, 0.485], [0, 0.665], [1.6, 0.705]], 18), WH, T(0, 1.36, 0, 0, 0, 0, 0.955, 0.25, 1));
    B.add('glass', side([[-0.9, 1.75], [1.3, 1.75], [1.15, 2.08], [0.2, 2.3], [-0.6, 2.25]], 1.25, 0.05), [0.8, 0.9, 1]);
    // the high wing: a cambered profile across the span, with struts and the wingtip lights
    B.add('paint', side([[-0.8, 0], [0.4, 0.06], [0.9, 0.12], [1.0, 0.16], [0.6, 0.22], [-0.2, 0.18], [-0.8, 0.06]], span, 0.03), WH, T(0, 2.25, 0.2));
    B.add('paint2', box(span * 0.98, 0.04, 0.3), WH, T(0, 2.4, 0.95));
    for (var s = -1; s <= 1; s += 2) {
      B.add('metal', cyl(0.04, 0.04, 2.1, 6), [0.8, 0.8, 0.82], T(s * 1.6, 1.55, 0.1, 0, 0, s * 0.95));
      B.add(s < 0 ? 'lightR' : 'lightG', sph(0.14, 8, 6), WH, T(s * span / 2, 2.32, 0.2));
    }
    // tail: the fin and the stabiliser
    B.add('paint', side([[0, 0], [1.4, 0], [0.5, 1.45], [-0.15, 1.45]], 0.1, 0.03), WH, T(0, 1.6, 4.55, 0, Math.PI, 0));
    B.add('paint2', side([[0, 0.9], [0.62, 0.9], [0.5, 1.45], [-0.15, 1.45]], 0.12, 0.0), WH, T(0, 1.6, 4.55, 0, Math.PI, 0));
    B.add('paint', plan([[-1.7, 0], [1.7, 0], [1.4, 0.75], [-1.4, 0.75]], 0.06, 0.02), WH, T(0, 1.55, 4.55));
    B.add('lightW', sph(0.06, 8, 6), WH, T(0, 3.05, 4.55));
    // fixed tricycle gear
    B.add('metal', cyl(0.04, 0.04, 0.95, 6), [0.8, 0.8, 0.82], T(0, 0.75, -2.55));
    for (s = -1; s <= 1; s += 2) B.add('metal', box(0.08, 0.06, 1.4), [0.8, 0.8, 0.82], T(s * 0.75, 0.7, 0.2, 0, 0, s * 0.55));
    B.add('rubber', cyl(0.28, 0.28, 0.16, 14), WH, T(0, 0.28, -2.55, 0, 0, Math.PI / 2));
    B.add('rubber', cyl(0.3, 0.3, 0.18, 14), WH, T(-1.25, 0.3, 0.2, 0, 0, Math.PI / 2)); B.add('rubber', cyl(0.3, 0.3, 0.18, 14), WH, T(1.25, 0.3, 0.2, 0, 0, Math.PI / 2));
    B.add('paint', sph(0.36, 10, 8), WH, T(-1.25, 0.42, 0.25, 0, 0, 0, 0.5, 0.75, 1.3)); B.add('paint', sph(0.36, 10, 8), WH, T(1.25, 0.42, 0.25, 0, 0, 0, 0.5, 0.75, 1.3));
    B.add('dark', box(1.0, 0.25, 0.8), BLK, T(0, 1.08, -3.0));   // cowling vents
    B.add('seat', box(1.0, 0.45, 1.0), WH, T(0, 1.6, -0.2));
    // the prop (anim 'prop'): spinner cone and two blades
    B.anim('prop', [0, 1.45, -3.55]);
    B.add('chrome', cyl(0.0, 0.26, 0.5, 14), [0.95, 0.95, 0.95], T(0, 0, -0.2, -Math.PI / 2, 0, 0));
    B.add('dark', box(0.14, 2.1, 0.05), BLK, T(0, 0, 0.02, 0, 0, 0.2));
    B.add('paint2', box(0.15, 0.18, 0.055), WH, T(0, 0.98, 0.02, 0, 0, 0.2)); B.add('paint2', box(0.15, 0.18, 0.055), WH, T(0, -0.98, 0.02, 0, 0, 0.2));
    return B.finish({ eye: { x: -0.3, y: 2.05, z: -0.4 } });
  };
  BUILD.jet = function () {
    var B = new Builder(), WH = [1, 1, 1], BLK = [0.12, 0.12, 0.13], GREY = [0.75, 0.77, 0.8];
    B.add('paint', lathe([[-6.4, 0.5], [-5.6, 0.62], [-3.0, 0.82], [0.0, 0.92], [2.5, 0.85], [4.5, 0.6], [5.8, 0.3], [6.6, 0.04]], 20), WH, T(0, 1.75, 0, 0, 0, 0, 1.0, 0.85, 1));
    B.add('glass', sph(0.7, 16, 10), [0.55, 0.7, 0.85], T(0, 2.35, -3.0, 0, 0, 0, 0.75, 0.62, 2.0));
    // delta wings (plan view) with the leading-edge extension, and two canted tails
    var half = SPECS.jet.span / 2;
    B.add('paint', plan([[0.6, 1.8], [half, -3.2], [half, -4.0], [0.6, -4.6]], 0.16, 0.04), WH, T(0, 1.5, 0));
    B.add('paint', plan([[-0.6, 1.8], [-0.6, -4.6], [-half, -4.0], [-half, -3.2]], 0.16, 0.04), WH, T(0, 1.5, 0));
    B.add('paint2', plan([[half - 0.4, -3.3], [half, -3.2], [half, -4.0], [half - 0.4, -4.05]], 0.18, 0), WH, T(0, 1.5, 0));
    B.add('paint2', plan([[-half + 0.4, -3.3], [-half + 0.4, -4.05], [-half, -4.0], [-half, -3.2]], 0.18, 0), WH, T(0, 1.5, 0));
    for (var s = -1; s <= 1; s += 2) {
      B.add('paint', side([[0, 0], [1.9, 0], [0.9, 1.7], [0.2, 1.7]], 0.1, 0.03), WH, T(s * 0.9, 2.2, 6.0, 0, Math.PI, s * 0.32));
      B.add('dark', box(0.55, 0.62, 2.2), GREY, T(s * 0.95, 1.55, -0.5));                       // intakes
      B.add('dark', box(0.45, 0.5, 0.05), BLK, T(s * 0.95, 1.55, -1.62));
      B.add(s < 0 ? 'lightR' : 'lightG', sph(0.14, 8, 6), WH, T(s * half, 1.62, 3.6));
    }
    B.add('paint', plan([[-2.3, 0], [2.3, 0], [1.6, 1.2], [-1.6, 1.2]], 0.1, 0.03), WH, T(0, 1.75, 6.2));
    B.add('dark', cyl(0.62, 0.55, 0.9, 16), [0.35, 0.35, 0.38], T(0, 1.75, 6.65, Math.PI / 2, 0, 0));   // nozzle
    B.add('dark', box(0.25, 0.12, 0.6), BLK, T(0, 2.6, -1.5));                                           // spine
    B.add('chrome', cyl(0.02, 0.05, 0.9, 6), WH, T(0, 1.75, -7.0, -Math.PI / 2, 0, 0));                 // pitot
    // the gear (anim 'gear': folds away above 22 m)
    B.anim('gear', [0, 0, 0]);
    B.add('metal', cyl(0.05, 0.05, 1.1, 6), [0.8, 0.8, 0.82], T(0, 0.85, -4.0));
    B.add('rubber', cyl(0.3, 0.3, 0.2, 12), WH, T(0, 0.3, -4.0, 0, 0, Math.PI / 2));
    for (s = -1; s <= 1; s += 2) { B.add('metal', cyl(0.06, 0.06, 1.1, 6), [0.8, 0.8, 0.82], T(s * 1.4, 0.85, 1.0)); B.add('rubber', cyl(0.35, 0.35, 0.26, 12), WH, T(s * 1.4, 0.35, 1.0, 0, 0, Math.PI / 2)); }
    // the afterburner glow (anim 'burner': scaled by throttle)
    B.anim('burner', [0, 1.75, 7.1]);
    B.add('burner', cyl(0.5, 0.0, 2.2, 14), WH, T(0, 0, 1.1, Math.PI / 2, 0, 0));
    return B.finish({ eye: { x: 0, y: 2.45, z: -3.1 } });
  };
  BUILD.speedboat = function () {
    var B = new Builder(), WH = [1, 1, 1], BLK = [0.12, 0.12, 0.13];
    // the hull: a deep V forward flattening aft, lofted stern to bow
    var st = [], L = SPECS.speedboat.length, hb = SPECS.speedboat.width / 2;
    var stations = [[-3.55, 1.0, 0.25], [-2.6, 1.0, 0.3], [-1.2, 1.0, 0.35], [0.4, 0.97, 0.42], [1.8, 0.85, 0.5], [2.8, 0.55, 0.62], [3.45, 0.18, 0.75], [3.62, 0.02, 0.8]];
    for (var i = 0; i < stations.length; i++) {
      var sd = stations[i], w = hb * sd[1], keel = -0.5 + sd[2] * 0.25, deadrise = sd[2];
      st.push({ f: sd[0], pts: [[0, keel], [w * 0.55, keel + deadrise * 0.45], [w, 0.12 + deadrise * 0.2], [w * 1.02, 0.78]] });
    }
    B.add('white', hull(st), WH);
    B.add('paint', hull(st.map(function (s) { return { f: s.f, pts: [[s.pts[2][0] * 1.005, s.pts[2][1]], [s.pts[2][0] * 1.012, s.pts[2][1] + 0.22], [s.pts[3][0] * 1.01, 0.5], [s.pts[3][0] * 1.012, 0.62]] }; })), WH);
    // deck, cockpit sole, windscreen, console, bench seats, rails
    var deck = [[0, 3.62]]; for (i = stations.length - 1; i >= 0; i--) deck.push([hb * stations[i][1] * 1.0, stations[i][0]]);
    for (i = 0; i < stations.length; i++) deck.push([-hb * stations[i][1], stations[i][0]]);
    B.add('white', plan(deck, 0.08), [0.96, 0.95, 0.92], T(0, 0.74, 0));
    B.add('wood', box(1.9, 0.08, 3.0), WH, T(0, 0.79, 0.95));                                           // teak sole
    B.add('glass', side([[0.55, 0], [0.95, 0], [0.55, 0.5], [0.4, 0.48]], 2.1, 0.03), [0.7, 0.85, 1], T(0, 0.8, 0));
    B.add('paint', box(0.7, 0.55, 0.6), WH, T(0.5, 1.05, -0.2));
    B.add('dark', cyl(0.18, 0.18, 0.04, 14), BLK, T(0.5, 1.4, -0.05, 1.1, 0, 0));
    B.add('cushion', box(0.6, 0.35, 0.55), WH, T(0.5, 0.98, 0.55)); B.add('cushion', box(0.6, 0.35, 0.55), WH, T(-0.5, 0.98, 0.55));
    B.add('cushion', box(2.0, 0.35, 0.6), WH, T(0, 0.98, 2.3));
    for (var s = -1; s <= 1; s += 2) B.add('chrome', box(0.04, 0.04, 2.2), WH, T(s * hb * 0.92, 1.0, -1.9, 0, s * 0.08, 0));
    // the outboard
    B.add('paint2', side([[-0.4, 0], [0.15, 0], [0.25, 0.65], [-0.3, 0.75]], 0.55, 0.08), WH, T(0, 0.7, 3.95));
    B.add('dark', box(0.2, 1.0, 0.3), BLK, T(0, 0.15, 3.95));
    B.add('lightR', sph(0.06, 8, 6), WH, T(-hb * 0.92, 1.05, -2.6)); B.add('lightG', sph(0.06, 8, 6), WH, T(hb * 0.92, 1.05, -2.6));
    B.add('lightW', cyl(0.03, 0.03, 0.7, 6), WH, T(0, 1.5, 3.2));
    void L;
    return B.finish({ eye: { x: 0.5, y: 1.85, z: 0.4 } });
  };
  BUILD.jetski = function () {
    var B = new Builder(), WH = [1, 1, 1], BLK = [0.12, 0.12, 0.13], hb = SPECS.jetski.width / 2;
    var stations = [[-1.5, 0.95, 0.2], [-0.8, 1.0, 0.25], [0.2, 1.0, 0.3], [0.9, 0.8, 0.38], [1.35, 0.45, 0.45], [1.52, 0.05, 0.5]], st = [];
    for (var i = 0; i < stations.length; i++) { var sd = stations[i], w = hb * sd[1], keel = -0.28 + sd[2] * 0.15; st.push({ f: sd[0], pts: [[0, keel], [w * 0.6, keel + sd[2] * 0.3], [w, 0.12], [w * 0.96, 0.42]] }); }
    B.add('white', hull(st), WH);
    var deck = [[0, 1.52]]; for (i = stations.length - 1; i >= 0; i--) deck.push([hb * stations[i][1] * 0.96, stations[i][0]]);
    for (i = 0; i < stations.length; i++) deck.push([-hb * stations[i][1] * 0.96, stations[i][0]]);
    B.add('paint', plan(deck, 0.14, 0.03), WH, T(0, 0.36, 0));
    B.add('paint2', side([[-0.1, 0.48], [0.95, 0.48], [0.85, 0.72], [0.35, 0.82], [0.0, 0.62]], 0.62, 0.08), WH);   // the hood
    B.add('seat', side([[-1.2, 0.5], [0.0, 0.5], [0.0, 0.74], [-1.15, 0.7]], 0.42, 0.06), WH);
    B.add('dark', cyl(0.02, 0.02, 0.7, 8), BLK, T(0, 0.92, -0.35, 0, 0, Math.PI / 2));
    B.add('dark', box(0.08, 0.3, 0.08), BLK, T(0, 0.8, -0.35, -0.3, 0, 0));
    B.add('glass', side([[0.25, 0.8], [0.5, 0.78], [0.38, 0.95], [0.26, 0.92]], 0.4, 0), [0.7, 0.85, 1]);
    B.add('dark', cyl(0.08, 0.1, 0.25, 10), BLK, T(0, 0.0, 1.55, Math.PI / 2, 0, 0));   // the nozzle
    return B.finish({ eye: { x: 0, y: 1.5, z: 0.0 }, slim: ['glass'] });
  };
  BUILD.parachute = function () {
    var B = new Builder(), WH = [1, 1, 1];
    // the harness pack on the rider's back (main), the canopy and its lines (anim 'canopy', scaled open)
    B.add('dark', box(0.42, 0.55, 0.22), [0.35, 0.33, 0.3], T(0, 1.3, 0.22));
    B.anim('canopy', [0, 1.55, 0]);
    var cells = 9, spanA = 1.15, R = 5.8;
    for (var i = 0; i < cells; i++) {
      var a0 = -spanA / 2 + spanA * i / cells, a1 = a0 + spanA / cells, am = (a0 + a1) / 2;
      var gold = i % 2 === 0, col = gold ? [1, 1, 1] : [0.12, 0.12, 0.14];
      var g = new THREE.CylinderGeometry(R, R, 2.7, 3, 1, true, Math.PI - a1, a1 - a0);
      B.add(gold ? 'paint' : 'canopy', g, col, T(0, -R + 6.0, 0, Math.PI / 2, 0, 0));
      B.add(gold ? 'paint' : 'canopy', box(Math.sin(a1 - a0) * R * 1.02, 0.32, 2.7), col, T(Math.sin(am) * (R - 0.16), Math.cos(am) * (R - 0.16) - R + 6.0, 0, 0, 0, -am));
    }
    for (i = 0; i <= 4; i++) {
      var aa = -spanA / 2 + spanA * i / 4, tx = Math.sin(aa) * (R - 0.3), ty = Math.cos(aa) * (R - 0.3) - R + 6.0;
      for (var s = -1; s <= 1; s += 2) {
        var dx = tx, dy = ty, dz = s * 1.0, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
        var m = new THREE.Matrix4().compose(new THREE.Vector3(dx / 2, dy / 2, dz / 2), q, new THREE.Vector3(1, 1, 1));
        B.add('line', cyl(0.012, 0.012, len, 4), WH, m);
      }
    }
    return B.finish({ eye: { x: 0, y: 1.6, z: 0 } });
  };
  function geoFor(type) {
    if (!GEO[type]) { var b = BUILD[type]; if (!b) return null; GEO[type] = b(); }
    return GEO[type];
  }
  // one mesh per material key; anims become child groups at their pivots (the vehicle's userData.anim[name])
  function instance(v) {
    var spec = geoFor(v.type); if (!spec) return null;
    var M = mats(), A = GTP.Assets, md = v.mods || {}, pm = md.paint || {};
    var paint = A && A.paintMaterial ? A.paintMaterial(pm.primary || v.color || '#c94040') : new THREE.MeshStandardMaterial({ vertexColors: true, color: v.color || '#c94040' });
    var paint2 = A && A.paintMaterial ? A.paintMaterial(pm.secondary || secondaryFor(v)) : new THREE.MeshStandardMaterial({ vertexColors: true, color: secondaryFor(v) });
    applyFinish(paint, pm.finish); applyFinish(paint2, pm.finish);
    var glass = M.glass;
    if (md.tint > 0) { glass = M.glass.clone(); glass.color.setRGB(0.25 + 0.15 * (3 - md.tint), 0.3 + 0.15 * (3 - md.tint), 0.35 + 0.15 * (3 - md.tint)); glass.opacity = 0.6 + 0.12 * md.tint; }
    var matFor = { paint: paint, paint2: paint2, glass: glass };
    function meshes(statics, parent, list) {
      for (var k in statics) {
        var mat = matFor[k] || (k === 'blink' ? M.light : M[k]) || M.detail, mesh = new THREE.Mesh(statics[k], mat);
        mesh.castShadow = k === 'paint' || k === 'paint2' || k === 'detail' || k === 'canopy'; mesh.receiveShadow = false; mesh.name = k;
        mesh.userData.key = k; parent.add(mesh); list.push(mesh);
      }
    }
    var grp = new THREE.Group(), all = [], anim = {};
    var inner = new THREE.Group(); inner.name = 'inner'; grp.add(inner);
    meshes(spec.statics, inner, all);
    for (var an in spec.anims) {
      var a = spec.anims[an], g = new THREE.Group(); g.name = an; g.position.set(a.pivot[0], a.pivot[1], a.pivot[2]);
      // anim parts are built in their pivot's frame (the pivot is the origin of the part)
      meshes(a.statics, g, all);
      inner.add(g); anim[an] = g;
    }
    // the moto's front wheel hangs off the fork: re-parent it so it steers with the bars
    if (v.type === 'moto' && anim.front && anim.wheelF) { anim.front.add(anim.wheelF); anim.wheelF.position.set(0, 0.31 - 0.95, -0.72 + 0.56); }
    grp.userData = { gtpVehicle: true, type: v.type, paint: paint, paint2: paint2, glass: glass !== M.glass ? glass : null, anim: anim, inner: inner, meshes: all, info: spec.info, wrecked: false };
    return grp;
  }
  function secondaryFor(v) { var cols = v.cls.colors || ['#2b2b2b']; var i = cols.indexOf(v.color); return v.color2 || cols[(i + 1) % cols.length] || '#2b2b2b'; }
  function applyFinish(m, finish) {
    if (!m) return;
    if (finish === 'matte') { m.roughness = 0.82; m.metalness = 0.05; if (m.clearcoat != null) m.clearcoat = 0; }
    else if (finish === 'metallic') { m.roughness = 0.24; m.metalness = 0.88; }
    else if (finish === 'chrome') { m.roughness = 0.06; m.metalness = 1.0; m.color.lerp(new THREE.Color(0xffffff), 0.35); }
    else if (finish === 'gloss') { m.roughness = 0.28; m.metalness = 0.4; }
    m.needsUpdate = true;
  }
  // GTP.Assets.vehicleMeshes[type](vehicle) -> Object3D: the contract the environment track honours
  if (GTP.Assets) {
    GTP.Assets.vehicleMeshes = GTP.Assets.vehicleMeshes || {};
    TYPES.forEach(function (t) { GTP.Assets.vehicleMeshes[t] = function (v) { return instance(v || { type: t, cls: SPECS[t], color: SPECS[t].colors[0] }); }; });
    // a stub geometry record for the new types (the first-person eye, light points), so nothing builds a car body for a heli
    var baseVG = GTP.Assets.vehicleGeometry;
    if (baseVG) {
      var stubs = {};
      GTP.Assets.vehicleGeometry = function (cls, wrap, mods) {
        var sp = SPECS[cls]; if (!sp || typeof THREE === 'undefined') return baseVG.apply(this, arguments);
        if (stubs[cls]) return stubs[cls];
        var info = (geoFor(cls) || {}).info || {}, eye = info.eye || { x: 0, y: 1.5, z: 0 }, hl = sp.length / 2, hw = sp.width / 2;
        stubs[cls] = { body: new THREE.BufferGeometry(), wheel: new THREE.CylinderGeometry(0.01, 0.01, 0.01, 3), wheelRadius: sp.wheelRadius, wheelWidth: 0.1, wheelOffsets: [],
          lightPoints: { headL: { x: -hw, y: 1, z: -hl }, headR: { x: hw, y: 1, z: -hl }, head: { x: 0, y: 1, z: -hl }, tailL: { x: -hw, y: 1, z: hl }, tailR: { x: hw, y: 1, z: hl }, roof: { x: 0, y: sp.height, z: 0 }, eye: eye },
          doorPoints: [], size: { length: sp.length, width: sp.width, height: sp.height }, custom: true };
        void wrap; void mods;
        return stubs[cls];
      };
    }
  }
  // per-frame animation of the custom meshes (called after the shared syncMesh placed and rotated the group)
  function syncCustom(v, m) {
    var ud = m.userData, an = ud.anim, M = mats();
    if (v.wreck && !ud.wrecked) {
      ud.wrecked = true;
      for (var i = 0; i < ud.meshes.length; i++) { var me = ud.meshes[i], k = me.userData.key; me.material = k === 'glass' ? M.wreckGlass : M.wreck; if (k === 'burner' || k === 'canopy') me.visible = false; }
    }
    var inner = ud.inner;
    inner.position.y = 0;
    if (v.type === 'moto') {
      if (an.wheelF) an.wheelF.rotation.x = v.wheelSpin; if (an.wheelR) an.wheelR.rotation.x = v.wheelSpin;
      if (an.front) an.front.rotation.y = v.wheelSteer * 0.8;
      inner.position.y = v._wheelie ? Math.sin(v._wheelie) * 0.72 : 0;
    }
    if (an.rotor) an.rotor.rotation.y = v.rotorAngle || 0;
    if (an.tail) an.tail.rotation.x = (v.rotorAngle || 0) * 2.3;
    if (an.prop) an.prop.rotation.z = v.rotorAngle || 0;
    if (an.gear) { var down = v.gear !== 'up'; an.gear.visible = down || (v._gearK || 0) > 0.05; v._gearK = U.damp(v._gearK == null ? 1 : v._gearK, down ? 1 : 0, 4, 1 / 60); an.gear.scale.y = Math.max(0.01, v._gearK); an.gear.position.y = 1.5 * (1 - v._gearK); }
    if (an.burner) { var b = v.wreck ? 0 : Math.max(0, (v.thr || 0) - 0.55) / 0.45; an.burner.visible = b > 0.02; an.burner.scale.set(0.6 + 0.4 * b, 0.6 + 0.4 * b, 0.3 + 0.9 * b + Math.sin(v.age * 40) * 0.08 * b); }
    if (an.canopy) {
      var open = v.chute === 'open' ? U.smoothstep((v.openT || 0) / 0.8) : v.chute === 'landed' ? Math.max(0, 1 - (v.collapseT || 0) / 1.2) : 0;
      an.canopy.visible = open > 0.02; an.canopy.scale.set(0.2 + 0.8 * open, 0.15 + 0.85 * open, 0.3 + 0.7 * open);
      if (v.chute === 'landed') an.canopy.position.y = 1.55 - (1 - open) * 4;
    }
    // nav lights blink: the wingtip / skid lights dim for a beat every second
    var blink = !v.wreck && (v.age % 1.1) < 0.12;
    for (var j = 0; j < ud.meshes.length; j++) { var mm = ud.meshes[j], kk = mm.userData.key; if (kk === 'blink') mm.visible = !v.wreck && !blink; else if (kk === 'light') mm.material = v.wreck ? M.wreck : (liveDriver(v) || v.lights ? M.light : M.lightOff); }
  }
  VP.syncMesh = function (alpha) {
    base.syncMesh.call(this, alpha);
    var m = this.mesh; if (!m || !m.visible) return;
    if (m.userData && m.userData.gtpVehicle) { try { syncCustom(this, m); } catch (e) { report(e, 'vehicles.syncCustom'); } }
    else if (this.mods && m.userData && m.userData.modExtras) syncCarMods(this, m);
  };

  // ============================================================ mod visuals on cars ==
  // When the models track's vehicleGeometry(cls, wrap, mods) does not honour mods (rec.modsApplied), the mod shop's
  // looks are layered on the existing car mesh here: paint finish, tinted glass, rims (hubcap discs) and a spoiler.
  var RIMS = [null, 0xd8dce2, 0xe8b53a, 0x1a1a1c, 0xd22f2f, 0xf2f2ee];
  function applyCarModVisuals(v, m) {
    var ud = m && m.userData; if (!ud || !ud.rec || ud.rec.modsApplied || !v.mods || typeof THREE === 'undefined') return;
    var md = v.mods, pm = md.paint || {};
    if (ud.paint && pm.finish) applyFinish(ud.paint, pm.finish);
    if (ud.mats && md.tint > 0 && ud.mats[2]) { var gl = ud.mats[2].clone(); gl.color.setRGB(0.12 + 0.08 * (3 - md.tint), 0.14 + 0.08 * (3 - md.tint), 0.17 + 0.08 * (3 - md.tint)); gl.opacity = Math.min(0.95, 0.72 + 0.08 * md.tint); ud.mats[2] = gl; ud.tintGlass = gl; }
    var extras = ud.modExtras = {};
    var rec = ud.rec, sz = rec.size || { length: v.cls.length, width: v.cls.width, height: v.cls.height };
    if (md.wheels > 0 && ud.wheels && RIMS[md.wheels] != null) {
      var r = rec.wheelRadius || v.cls.wheelRadius, w = (rec.wheelWidth || 0.22);
      var disc = new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.03, 14);
      disc.rotateZ(Math.PI / 2);
      var mat = new THREE.MeshStandardMaterial({ color: RIMS[md.wheels], roughness: md.wheels === 3 ? 0.5 : 0.12, metalness: md.wheels === 3 ? 0.3 : 1 });
      var n = rec.wheelOffsets.length, hub = new THREE.InstancedMesh(disc, mat, n);
      hub.frustumCulled = false; hub.name = 'rims'; m.add(hub); extras.rims = hub;
    }
    if (md.spoiler > 0) {
      var L = sz.length, Wd = sz.width, H = sz.height, lvl = md.spoiler, sp = new THREE.Group();
      var wing = new THREE.Mesh(new THREE.BoxGeometry(Wd * (0.7 + 0.12 * lvl), 0.05, 0.28 + 0.06 * lvl), lvl === 3 ? mats().dark : ud.paint);
      var postH = lvl === 1 ? 0.02 : lvl === 2 ? 0.18 : 0.34;
      wing.position.set(0, postH + 0.05, 0); sp.add(wing);
      if (lvl > 1) for (var s = -1; s <= 1; s += 2) { var post = new THREE.Mesh(new THREE.BoxGeometry(0.05, postH, 0.12), mats().dark); post.position.set(s * Wd * 0.28, postH / 2, 0); sp.add(post); }
      sp.position.set(0, H * 0.7, L / 2 - 0.32); sp.name = 'spoiler'; m.add(sp); extras.spoiler = sp;
    }
  }
  function syncCarMods(v, m) {
    var ex = m.userData.modExtras, wh = m.userData.wheels;
    if (ex.rims && wh) { ex.rims.instanceMatrix.array.set(wh.instanceMatrix.array.subarray(0, ex.rims.count * 16)); ex.rims.instanceMatrix.needsUpdate = true; ex.rims.visible = !v.wreck; }
    if (ex.spoiler) ex.spoiler.visible = !v.wreck;
  }

  // ================================================================ mods ==
  var PARTS = {
    wheels: { max: 5, names: ['Stock Rims', 'Chrome Takes', 'Gold Standard', 'Blackout', 'Red Line', 'Whitewash'], prices: [0, 450, 900, 650, 700, 600] },
    spoiler: { max: 3, names: ['No Spoiler', 'Lip Service', 'Talking Point Wing', 'Grandstand GT Wing'], prices: [0, 300, 650, 1100] },
    tint: { max: 3, names: ['Clear Glass', 'Light Shade', 'Off The Record', 'Background Only'], prices: [0, 150, 300, 450] },
    engine: { max: 4, names: ['Stock Talking Points', 'Hot Take Tune', 'Viral Remap', 'Prime-Time Block', 'Breaking News Bore'], prices: [0, 900, 1800, 3200, 5000] },
    brakes: { max: 3, names: ['Stock Brakes', 'Walk-It-Back Pads', 'Retraction Rotors', 'Full Apology Calipers'], prices: [0, 500, 1100, 1900] },
    armor: { max: 5, names: ['No Armour', 'Thick Skin 20%', 'Thicker Skin 40%', 'Media Training 60%', 'Spin Plating 80%', 'Bulletproof Narrative 100%'], prices: [0, 700, 1400, 2400, 3600, 5200] },
    turbo: { bool: true, names: ['No Turbo', 'Outrage Turbo'], prices: [0, 4000] },
    horn: { list: ['stock', 'air', 'clown', 'fanfare', 'gavel', 'trombone'], names: ['Stock Horn', 'Air Horn of Authority', 'Honk If You Agree', 'Self-Fanfare', 'Point of Order', 'Sad Trombone'], prices: [0, 250, 150, 300, 200, 150] },
    paint: { finishes: ['gloss', 'metallic', 'matte', 'chrome'], prices: { gloss: 200, metallic: 400, matte: 350, chrome: 1500 } }
  };
  var DEFAULT_MODS = { paint: null, wheels: 0, spoiler: 0, tint: 0, engine: 0, brakes: 0, armor: 0, turbo: false, horn: 'stock' };
  // Content (the content track) may override names / prices: Content.parity.modshop[part] = {names, prices} or [{name, price}]
  function partTable(part) {
    var t = PARTS[part], P = GTP.Content && GTP.Content.parity && GTP.Content.parity.modshop, o = P && P[part];
    if (!o) return t;
    var out = Object.assign({}, t);
    if (Array.isArray(o)) { out.names = o.map(function (x, i) { return (x && x.name) || (t.names && t.names[i]); }); out.prices = o.map(function (x, i) { return x && x.price != null ? x.price : (t.prices && t.prices[i]); }); }
    else { if (o.names) out.names = o.names; if (o.prices) out.prices = o.prices; }
    return out;
  }
  function baseSpec(v) { return v._baseCls || C.VEHICLES[v.type] || v.cls; }
  function clampMods(m) {
    var o = {};
    o.wheels = U.clamp(m.wheels | 0, 0, 5); o.spoiler = U.clamp(m.spoiler | 0, 0, 3); o.tint = U.clamp(m.tint | 0, 0, 3);
    o.engine = U.clamp(m.engine | 0, 0, 4); o.brakes = U.clamp(m.brakes | 0, 0, 3); o.armor = U.clamp(m.armor | 0, 0, 5); o.turbo = !!m.turbo;
    o.horn = PARTS.horn.list.indexOf(m.horn) >= 0 ? m.horn : 'stock';
    var p = m.paint;
    o.paint = p ? { primary: p.primary || null, secondary: p.secondary || null, finish: PARTS.paint.finishes.indexOf(p.finish) >= 0 ? p.finish : 'gloss' } : null;
    return o;
  }
  // the stat side: a per-vehicle copy of the class spec (accel, top speed, brakes, grip, hp)
  function applyModStats(v) {
    var b = baseSpec(v), m = v.mods, cls = Object.assign({}, b), f = b.family;
    v._baseCls = b;
    var eng = 1 + 0.08 * m.engine + (m.turbo ? 0.1 : 0), top = 1 + 0.03 * m.engine + (m.turbo ? 0.025 : 0);
    if (f === 'plane') cls.thrust = b.thrust * eng;
    cls.accel = b.accel * eng; cls.maxSpeed = b.maxSpeed * top;
    cls.brake = b.brake * (1 + 0.12 * m.brakes);
    cls.grip = b.grip * (1 + 0.02 * m.spoiler + (m.wheels > 0 ? 0.03 : 0));
    var hpMul = 1 + 0.2 * m.armor, frac = v.maxHp > 0 ? Math.max(0, v.hp) / v.maxHp : 1;
    v.maxHp = Math.round(b.hp * hpMul); if (!v.wreck && !v.burning) v.hp = Math.max(1, Math.round(v.maxHp * frac));
    v.cls = cls;
  }
  function rebuild(v) {
    var R = GTP.Render; if (!R || !v.mesh) return;
    try {
      if (R.rebuildEntityMesh) R.rebuildEntityMesh(v);
      else if (R.detach && R.attach) { R.detach(v); v.mesh = null; R.attach(v); }
    } catch (e) { report(e, 'vehicles.rebuild'); }
  }
  function mod(v, mods) {
    if (!v || v.kind !== 'vehicle') return { ok: false, reason: 'no vehicle' };
    if (v.wreck || v.sinking) return { ok: false, reason: 'wrecked' };
    var cur = v.mods || DEFAULT_MODS, next = {};
    for (var k in DEFAULT_MODS) next[k] = mods && mods[k] !== undefined ? mods[k] : cur[k];
    if (mods && mods.paint) next.paint = Object.assign({}, cur.paint || {}, mods.paint);
    v.mods = clampMods(next);
    if (v.mods.paint && v.mods.paint.primary) v.color = v.mods.paint.primary;
    if (v.mods.paint && v.mods.paint.secondary) v.color2 = v.mods.paint.secondary;
    applyModStats(v);
    rebuild(v);
    sfx('modApply', v.x, v.z, 0.8);
    emit('vehicle:mod', { vehicle: v, mods: v.mods });
    return { ok: true, mods: v.mods };
  }
  function priceOf(part, value) {
    var t = partTable(part); if (!t) return null;
    if (part === 'paint') { var fin = value && value.finish || 'gloss'; return (t.prices && t.prices[fin]) != null ? t.prices[fin] : PARTS.paint.prices[fin] || 200; }
    if (part === 'turbo') return t.prices[value ? 1 : 0];
    if (part === 'horn') { var i = PARTS.horn.list.indexOf(value); return i < 0 ? null : t.prices[i]; }
    return t.prices ? t.prices[value | 0] : null;
  }
  function modCatalog(v) {
    if (!v) return [];
    var out = [], m = v.mods || DEFAULT_MODS, f = fam(v), air = isAir(v) || isSea(v) || f === 'chute';
    ['engine', 'brakes', 'armor', 'turbo', 'wheels', 'spoiler', 'tint', 'horn'].forEach(function (part) {
      if (air && part !== 'engine' && part !== 'armor') return;
      var t = partTable(part);
      if (part === 'turbo') { out.push({ part: part, value: true, name: t.names[1], price: t.prices[1], current: !!m.turbo, owned: !!m.turbo }); return; }
      if (part === 'horn') { PARTS.horn.list.forEach(function (h, i) { out.push({ part: part, value: h, name: t.names[i], price: t.prices[i], current: m.horn === h, owned: m.horn === h }); }); return; }
      for (var i = 0; i <= PARTS[part].max; i++) out.push({ part: part, value: i, name: t.names[i], price: t.prices[i], current: (m[part] | 0) === i, owned: (m[part] | 0) >= i, stat: statLine(part, i) });
    });
    PARTS.paint.finishes.forEach(function (fin) { out.push({ part: 'paint', value: { finish: fin }, name: fin.charAt(0).toUpperCase() + fin.slice(1) + ' Respray', price: priceOf('paint', { finish: fin }), current: !!(m.paint && m.paint.finish === fin), owned: false }); });
    out.push({ part: 'repair', value: true, name: 'Damage Control (repair)', price: repairPrice(v), current: false, owned: false });
    return out;
  }
  function statLine(part, i) {
    if (part === 'engine') return '+' + (8 * i) + '% acceleration, +' + (3 * i) + '% top speed';
    if (part === 'brakes') return '+' + (12 * i) + '% braking';
    if (part === 'armor') return '+' + (20 * i) + '% hull, -' + (7 * i) + '% damage taken';
    if (part === 'spoiler') return '+' + (2 * i) + '% grip';
    return null;
  }
  function repairPrice(v) { return Math.round(Math.max(0, 1 - Math.max(0, v.hp) / v.maxHp) * 400); }
  function repair(v) { if (!v || v.wreck) return false; v.hp = v.maxHp; v.damage = 0; v.burning = false; v.burnT = 0; return true; }
  // the purchase path the mod shop UI uses: charges the player, applies, emits shop:buy
  function buyMod(v, part, value) {
    var p = player(); if (!p || !v) return { ok: false, reason: 'no vehicle' };
    if (part === 'repair') {
      var rp = repairPrice(v); if (p.money < rp) return { ok: false, reason: 'money', price: rp };
      p.money -= rp; repair(v); sfx('modWrench', v.x, v.z, 0.8); emit('shop:buy', { item: 'mod:repair', price: rp, vehicle: v }); return { ok: true, price: rp };
    }
    var price = priceOf(part, value); if (price == null) return { ok: false, reason: 'unknown part' };
    var m = v.mods || DEFAULT_MODS;
    if (part !== 'paint' && part !== 'horn' && (part === 'turbo' ? !!m.turbo === !!value : (m[part] | 0) === (value | 0))) return { ok: false, reason: 'owned', price: 0 };
    if (p.money < price) { sfx('shopDeny', p.x, p.z, 0.6); return { ok: false, reason: 'money', price: price }; }
    p.money -= price;
    var patch = {}; patch[part] = value;
    var r = mod(v, patch);
    if (!r.ok) { p.money += price; return r; }
    p.stats.modsBought = (p.stats.modsBought || 0) + 1;
    emit('shop:buy', { item: 'mod:' + part + ':' + (typeof value === 'object' ? JSON.stringify(value) : value), price: price, vehicle: v });
    return { ok: true, price: price, mods: v.mods };
  }

  // ============================================================== garages ==
  var garages = {};   // propertyId -> [record]
  function capacity(id) {
    var P = GTP.Content && GTP.Content.parity && GTP.Content.parity.properties, rec = null;
    if (Array.isArray(P)) for (var i = 0; i < P.length; i++) { if (P[i] && P[i].id === id) { rec = P[i]; break; } }
    else if (P && P[id]) rec = P[id];
    var g = rec && (rec.garage != null ? rec.garage : rec.garageSlots);
    return typeof g === 'number' ? Math.max(0, g | 0) : 4;
  }
  function recordOf(v) { return { type: v.type, color: v.color || null, color2: v.color2 || null, wrap: v.wrap || null, mods: v.mods ? JSON.parse(JSON.stringify(v.mods)) : null, hp: Math.round(Math.max(1, v.hp)), name: v.cls.name || v.type }; }
  function store(propertyId, v) {
    if (!propertyId) return { ok: false, reason: 'no property' };
    if (!v || v.kind !== 'vehicle' || v.removed) return { ok: false, reason: 'no vehicle' };
    if (v.wreck || v.sinking || v.burning) return { ok: false, reason: 'wrecked' };
    if (v.isPolice || v.type === 'cop' || fam(v) === 'chute') return { ok: false, reason: 'not storable' };
    var list = garages[propertyId] = garages[propertyId] || [];
    if (list.length >= capacity(propertyId)) return { ok: false, reason: 'full' };
    var occ = v.occupants();
    for (var i = 0; i < occ.length; i++) { var o = occ[i]; v.speed = 0; v.vx = v.vz = 0; base.exit.call(v, o); }
    var rec = recordOf(v); list.push(rec);
    v.persistent = false; v.destroy();
    emit('garage:store', { propertyId: propertyId, slot: list.length - 1, record: rec });
    return { ok: true, slot: list.length - 1, record: rec };
  }
  function garagePoint(propertyId) {
    var Wd = W(), lm = Wd.landmark ? Wd.landmark(propertyId) : null; if (!lm) return null;
    var pts = lm.points || {};
    return pts.garage || pts.bay || pts.car || lm.door || { x: lm.x, z: lm.z };
  }
  function retrieve(propertyId, slot) {
    var list = garages[propertyId]; if (!list || !list.length) return null;
    slot = slot == null ? 0 : slot | 0; if (slot < 0 || slot >= list.length) return null;
    var rec = list[slot], at = garagePoint(propertyId), p = player();
    if (!at && p) at = { x: p.x + 3, z: p.z };
    if (!at) return null;
    var boat = SPECS[rec.type] && fam({ cls: SPECS[rec.type] }) === 'boat';
    var spot = findClear(at.x, at.z, boat ? 'water' : 'land', 3, boat ? 120 : 40) || (boat ? null : { x: at.x, z: at.z });
    if (!spot) return null;   // a boat in a garage with no water nearby stays stored
    var v = spawn(rec.type, spot.x, spot.z, { color: rec.color, wrap: rec.wrap });
    if (!v) return null;
    list.splice(slot, 1);
    if (rec.color2) v.color2 = rec.color2;
    if (rec.mods) mod(v, rec.mods);
    v.hp = Math.min(v.maxHp, rec.hp || v.maxHp);
    var rd = W().roadDir ? W().roadDir(v.x, v.z, v.y) : null; if (rd) { v.yaw = U.dirToYaw(rd.dx, rd.dz); v.snap(); }
    emit('garage:retrieve', { propertyId: propertyId, slot: slot, vehicle: v });
    return v;
  }

  // ================================================================ spawning ==
  function spawn(type, x, z, opts) {
    opts = opts || {};
    var sp = C.VEHICLES[type]; if (!sp) return null;
    var color = opts.color || (sp.colors ? sp.colors[Math.floor(vrng.random() * sp.colors.length) % sp.colors.length] : '#c94040');
    var v = new GTP.Vehicle({ x: x, z: z, type: type, color: color, wrap: opts.wrap || null, tag: opts.tag || null });
    var f = fam(v);
    v.y = opts.y != null ? opts.y : (f === 'boat' ? WATER_Y + (sp.draft || 0) : surfaceAt(x, z, 2));
    v.yaw = opts.yaw != null ? opts.yaw : 0;
    if (opts.persistent) v.persistent = true;
    if (f === 'plane') { v.gear = 'down'; v.thr = 0; v.air = 0; }
    if (f === 'plane' && !v._coll._wings) { v._coll._wings = true; v._coll.pts.push({ r: -sp.span / 2 + 0.4, f: 0, rad: 0.35 }, { r: sp.span / 2 - 0.4, f: 0, rad: 0.35 }); }
    v.snap();
    E().add(v);
    return v;
  }
  // a clear spot near (x, z): 'land' (no building, no water within r) or 'water' (open water within r)
  function findClear(x, z, kind, r, maxR) {
    var Wd = W();
    function ok(px, pz) {
      for (var a = 0; a < 8; a++) {
        var ang = a * TAU / 8, sx = px + Math.cos(ang) * r, sz = pz + Math.sin(ang) * r;
        if (kind === 'water') { if (!waterAt(sx, sz) || Wd.solidAt(sx, sz, WATER_Y + 0.5)) return false; }
        else { if (waterAt(sx, sz) || Wd.solidAt(sx, sz, Wd.heightAt(sx, sz, 0) + 1.5)) return false; }
      }
      var gy = kind === 'water' ? WATER_Y : Wd.heightAt(px, pz, 0), rc = Wd.resolveCapsule(px, pz, gy + 0.5, Math.min(r, 2.5));
      if (Math.abs(rc.x - px) > 1e-3 || Math.abs(rc.z - pz) > 1e-3) return false;   // a prop or a wall within reach
      if (kind === 'water') return waterAt(px, pz) && !Wd.solidAt(px, pz, WATER_Y + 0.5);
      return !waterAt(px, pz) && !Wd.solidAt(px, pz, gy + 1.5) && Wd.tileAt(px, pz) !== Wd.T.RAMP;
    }
    for (var ring = 0; ring <= maxR; ring += 2) {
      var n = ring === 0 ? 1 : Math.ceil(ring * TAU / 2.5);
      for (var i = 0; i < n; i++) { var a2 = i * TAU / n, px = x + Math.cos(a2) * ring, pz = z + Math.sin(a2) * ring; if (ok(px, pz)) return { x: px, z: pz }; }
    }
    return null;
  }

  // ---- the fleet: parked aircraft, boats and bikes at the airport, helipads, marina, port and garages ----
  var fleet = { slots: [], lmRef: null, t: 0 };
  function lmMatch(lm, re) { return re.test(lm.id || '') || re.test(lm.kind || '') || re.test(lm.name || ''); }
  function buildSlots() {
    var Wd = W(), lms = Wd.landmarks || [], out = [], yawE = U.dirToYaw(1, 0);
    function add(id, type, x, z, yaw, clear) { out.push({ id: id, type: type, x: x, z: z, yaw: yaw || 0, clear: clear || 3, vehicle: null, cooldown: 0, dynamic: true }); }
    var rw = Wd.landmark('airport_runway');
    if (rw && rw.points && rw.points.west) { var w = rw.points.west; add('runway_plane', 'plane', w.x + 22, w.z - 6, yawE, 0); add('runway_jet', 'jet', w.x + 22, w.z + 8, yawE, 0); }
    var pads = 0;
    lms.forEach(function (lm) {
      if (lmMatch(lm, /helipad/)) { var p = lm.points && (lm.points.helipad || lm.points.pad) || lm.door || lm; add('heli_' + lm.id, 'heli', p.x, p.z, 0, 6.5); pads++; }
      else if (lm.points) for (var k in lm.points) if (/helipad/.test(k)) { add('heli_' + lm.id + '_' + k, 'heli', lm.points[k].x, lm.points[k].z, 0, 6.5); pads++; }
      if (lmMatch(lm, /slip|boatyard|boat_?dock/) && !lmMatch(lm, /ferry/)) { var bp = lm.points && (lm.points.slip || lm.points.boat) || lm.door || lm; add('boat_' + lm.id, 'speedboat', bp.x, bp.z, 0, 4); }
      else if (lm.points) for (var k2 in lm.points) if (/slip|boat/.test(k2)) add('boat_' + lm.id + '_' + k2, /ski/.test(k2) ? 'jetski' : 'speedboat', lm.points[k2].x, lm.points[k2].z, 0, 4);
    });
    if (!pads) {
      // until the world track's helipads land: the airport apron by the tower, and the open protest plaza
      var tw = Wd.landmark('control_tower'), pz = Wd.landmark('protest_plaza');
      if (tw && tw.door) add('heli_apron', 'heli', tw.door.x - 30, tw.door.z + 14, 0, 6.5);
      if (pz) add('heli_plaza', 'heli', pz.x, pz.z, 0, 6.5);
    }
    [['velvetine_pier', 'speedboat'], ['fish_shack', 'jetski'], ['ferry_terminal', 'speedboat'], ['manifest_quay', 'jetski']].forEach(function (b) {
      var lm = Wd.landmark(b[0]); if (!lm || !lm.door) return;
      if (out.some(function (s) { return s.type !== 'heli' && U.dist2d(s.x, s.z, lm.door.x, lm.door.z) < 40; })) return;
      add('water_' + b[0], b[1], lm.door.x, lm.door.z, 0, b[1] === 'jetski' ? 2.5 : 4);
    });
    // bikes away from the spawn (a vehicle spawned at the start would change the boot's traffic for every other system)
    [['strip_garage', -6], ['memo_press', 6]].forEach(function (b) {
      var lm = Wd.landmark(b[0]); if (!lm || !lm.door) return; add('moto_' + b[0], 'moto', lm.door.x + b[1], lm.door.z + 4, 0, 1.2);
    });
    // resolve each to a clear spot of the right kind now (the world is fixed for this seed)
    for (var i = out.length - 1; i >= 0; i--) {
      var s = out[i], kind = fam({ cls: SPECS[s.type] }) === 'boat' ? 'water' : 'land';
      if (s.clear === 0) continue;   // the runway: placed exactly
      var c = findClear(s.x, s.z, kind, s.clear, kind === 'water' ? 70 : 40);
      if (!c) { out.splice(i, 1); continue; }
      s.x = c.x; s.z = c.z;
      if (s.type === 'moto') { var rd = W().roadDir ? W().nearestRoadPoint && W().nearestRoadPoint(c.x, c.z) : null; if (rd) s.yaw = U.dirToYaw(rd.x - c.x, rd.z - c.z) + Math.PI / 2; }
      if (kind === 'water') { var Wd2 = W(), best = 0; for (var a = 0; a < 8; a++) { var ang = a * TAU / 8, n = 0; for (var d = 4; d <= 40; d += 4) { if (!waterAt(c.x + Math.cos(ang) * d, c.z + Math.sin(ang) * d)) break; n++; } if (n > best) { best = n; s.yaw = U.dirToYaw(Math.cos(ang), Math.sin(ang)); } } void Wd2; }
    }
    return out;
  }
  function fleetTick(dt) {
    var Wd = W(); if (!Wd || !Wd.landmarks) return;
    if (fleet.lmRef !== Wd.landmarks || fleet.builtOn !== Vehicles.fleet.enabled) {
      fleet.builtOn = Vehicles.fleet.enabled; fleet.lmRef = Wd.landmarks; if (GTP.makeRng) vrng = GTP.makeRng(((GTP.game && GTP.game.seed) ^ 0x7EB1C) >>> 0); fleet.slots = Vehicles.fleet.enabled ? buildSlots() : []; fleet.t = 0; fleet.first = true; }
    fleet.t -= dt; if (fleet.t > 0) return; fleet.t = 0.5;
    var p = player(); if (!p) return;
    var block = GTP.Interiors && GTP.Interiors.active;
    for (var i = 0; i < fleet.slots.length; i++) {
      var s = fleet.slots[i], v = s.vehicle;
      if (v) {
        if (v.removed || v.wreck || v.sinking) { s.vehicle = null; s.cooldown = 30; }
        else if (v.hasPlayer() || U.dist2d(v.x, v.z, s.x, s.z) > 25) { s.vehicle = null; s.cooldown = 60; v.tag = null; }
        continue;
      }
      if (s.cooldown > 0) { s.cooldown -= 0.5; continue; }
      if (block) continue;
      // the first pass (the city as it loads) fills every slot in range; later ones never pop a vehicle in near the player
      var d = U.dist2d(p.x, p.z, s.x, s.z);
      if (d > 170 || (!fleet.first && d < 60)) continue;
      // never on top of something already there
      var near = E().hash.query(s.x, s.z, 8, scratch), busy = false;
      for (var k = 0; k < near.length; k++) if (near[k].kind === 'vehicle' && !near[k].removed && U.dist2d(near[k].x, near[k].z, s.x, s.z) < 6) { busy = true; break; }
      if (busy) { s.cooldown = 5; continue; }
      s.vehicle = spawn(s.type, s.x, s.z, { yaw: s.yaw, tag: 'fleet' });
    }
    fleet.first = false;
  }

  // ---- Spin Doctor Customs: the drive-in bay ----
  var modshop = { open: null, shops: null, lmRef: null, _deny: 0 };
  function shopList() {
    var Wd = W(); if (modshop.lmRef === Wd.landmarks && modshop.shops) return modshop.shops;
    modshop.lmRef = Wd.landmarks;
    modshop.shops = (Wd.landmarks || []).filter(function (lm) { return lm.kind === 'modshop' || /^spin_doctor/.test(lm.id || '') || /spin doctor/i.test(lm.name || ''); });
    return modshop.shops;
  }
  function modshopTick() {
    var p = player(), v = p && p.inVehicle; if (!p) return;
    var shops = shopList(); if (!shops.length) return;
    if (modshop.open) {
      var lm0 = W().landmark(modshop.open), b0 = lm0 && ((lm0.points && lm0.points.bay) || lm0.door);
      if (!b0 || !v || U.dist2d(v.x, v.z, b0.x, b0.z) > 12) { var was = modshop.open; modshop.open = null; emit('modshop:close', { shop: was }); }
      return;
    }
    if (!v || v.driver !== p || isAir(v) || isSea(v) || fam(v) === 'chute') return;
    for (var i = 0; i < shops.length; i++) {
      var lm = shops[i], b = (lm.points && lm.points.bay) || lm.door; if (!b) continue;
      if (U.dist2d(v.x, v.z, b.x, b.z) > 6 || v.speed2d() > 2.5) continue;
      if (p.wanted > 0) { if (GTP.game.time.t - modshop._deny > 6) { modshop._deny = GTP.game.time.t; toast('Spin Doctor will not touch a car with heat on it. Lose the stars first.'); } return; }
      modshop.open = lm.id;
      sfx('modWrench', v.x, v.z, 0.7);
      emit('modshop:open', { vehicle: v, shop: lm.id, catalog: modCatalog(v) });
      return;
    }
  }

  // ---- an AI-flown heli (a boss on autopilot, an empty one spinning down) drives the shared rotor loop when the police
  // helicopter is not up (Audio.heli has one voice; the police heli owns it while it flies)
  var ambT = 0;
  function ambientTick(dt) {
    ambT -= dt; if (ambT > 0) return; ambT = 0.5;
    var A = GTP.Audio, p = player(); if (!A || !A.heli || !p) return;
    var pol = GTP.AI && GTP.AI.police && GTP.AI.police.heli; if (pol && !pol.removed) return;
    var list = E().list, best = null, bd = 340;
    for (var i = 0; i < list.length; i++) {
      var v = list[i]; if (v.kind !== 'vehicle' || v.removed || fam(v) !== 'heli' || (v.rotor || 0) < 0.2 || v.hasPlayer()) continue;
      var d = U.dist2d(v.x, v.z, p.x, p.z); if (d < bd) { bd = d; best = v; }
    }
    if (best) A.heli(U.clamp(best.rotor, 0, 1), best.x, best.z);
  }

  // ============================================================ the step hook ==
  var baseEUpdate = E().update, baseEAdd = E().add;
  E().update = function (dt) {
    if (!installed) install();
    try { fleetTick(dt); modshopTick(); ambientTick(dt); } catch (e) { report(e, 'vehicles.tick'); }
    return baseEUpdate.call(this, dt);
  };
  E().add = function (e) {
    if (!installed && e && e.kind === 'vehicle') install();
    return baseEAdd.call(this, e);
  };

  // ================================================== deferred installs (Render, saves, missions) ==
  var installed = false, renderHooked = false, saveHooked = false, objHooked = false;
  function install() {
    hookRender(); hookSaves(); hookObjectives();
    installed = renderHooked && saveHooked;
  }
  function hookRender() {
    var R = GTP.Render; if (renderHooked || !R || !R.buildEntityMesh) return;
    renderHooked = true;
    var baseBuild = R.buildEntityMesh;
    R.buildEntityMesh = function (e) {
      if (e && e.kind === 'vehicle' && SPECS[e.type]) { var m = instance(e); if (m) return m; }
      var mesh = baseBuild.apply(this, arguments);
      if (e && e.kind === 'vehicle' && e.mods && mesh) { try { applyCarModVisuals(e, mesh); } catch (err) { report(err, 'vehicles.modVisuals'); } }
      return mesh;
    };
    if (R.syncVehicle) {
      var baseSync = R.syncVehicle;
      R.syncVehicle = function (v) { var m = v && v.mesh; if (m && m.userData && m.userData.gtpVehicle) return; return baseSync.apply(this, arguments); };
    }
    if (!R.rebuildEntityMesh) {
      R.rebuildEntityMesh = function (e) { if (!e) return; R.detach(e); e.mesh = null; R.attach(e); };
      R.rebuildEntityMesh._vehiclesFallback = true;
    }
    if (R.rig && R.rig.update) {
      var baseRig = R.rig.update;
      R.rig.update = function (dt, input) {
        var r = R.rig, t = r._target || (GTP.game && GTP.game.player), v = t && (t.inVehicle || t.vehicle);
        if (!v || !custom(v)) return baseRig.apply(this, arguments);
        try { return flightCam(r, dt, input, t, v); } catch (e) { report(e, 'vehicles.cam'); return baseRig.apply(this, arguments); }
      };
    }
  }
  // the chase camera for aircraft, boats and the parachute: further back, follows the heading and the climb
  var CAMD = { heli: [13, 4.2], plane: [15, 3.6], jet: [19, 4.0], speedboat: [10, 3.2], jetski: [7, 2.6], parachute: [12, 1.2] };
  function flightCam(r, dt, input, t, v) {
    var CAM = C.CAMERA, look = input ? input.look : null, now = GTP.game ? GTP.game.time.t : 0;
    var mode = t.cameraMode || r.mode, f = fam(v), air = isAir(v), cd = CAMD[v.type] || [10, 3];
    if (look && (look.dx || look.dy)) { r.yaw -= look.dx * CAM.lookSens; r.pitch = U.clamp(r.pitch + look.dy * CAM.lookSens, -0.6, 1.2); }
    else {
      var since = now - (input ? input.lastLookTime || -1e9 : -1e9);
      if (since > 1.2) {
        var hs = v.speed2d(), tgt = air || f === 'chute' || hs < 2 ? v.yaw : U.dirToYaw(v.vx, v.vz);
        if (v.speed < -1) tgt = v.yaw;
        r.yaw = U.angleDamp(r.yaw, tgt, air ? 3.2 : 2.6, dt);
        var pT = f === 'plane' ? 0.2 - v.pitch * 0.55 : f === 'heli' ? 0.28 - v.pitch * 0.3 : f === 'chute' ? (v.chute === 'open' ? 0.02 : 0.45) : 0.2;
        r.pitch = U.damp(r.pitch, U.clamp(pT, -0.6, 1.0), 1.8, dt);
      }
    }
    var dist = cd[0] * (mode === 'close' ? 0.7 : 1), lookH = f === 'chute' ? (v.chute === 'open' ? 3.6 : 1.2) : v.cls.height * 0.55, d = U.yawToDir(r.yaw);
    var fx0 = v.x, fy0 = v.y + lookH, fz0 = v.z, desired;
    if (mode === 'first') {
      var info = v.mesh && v.mesh.userData && v.mesh.userData.info, eye = (info && info.eye) || { x: 0, y: 1.6, z: 0 };
      _e3 = _e3 || new THREE.Euler(); _v3 = _v3 || new THREE.Vector3();
      _e3.set(v.pitch, v.yaw, v.roll, 'YXZ'); _v3.set(eye.x, eye.y, eye.z).applyEuler(_e3);
      desired = { x: v.x + _v3.x, y: v.y + _v3.y, z: v.z + _v3.z };
      var fw = new THREE.Vector3(0, 0, -1).applyEuler(_e3);
      fx0 = desired.x + fw.x * 10; fy0 = desired.y + fw.y * 10 - Math.sin(r.pitch - 0.2) * 2; fz0 = desired.z + fw.z * 10;
    } else {
      var D = dist * Math.cos(r.pitch), H = dist * Math.sin(r.pitch) + (cd[1] - lookH);
      desired = { x: fx0 - d.x * D, y: fy0 + H, z: fz0 - d.z * D };
      r.pulled = false;
      if (r._pullIn) desired = r._pullIn(fx0, fy0, fz0, desired, 1.5);
      var floor = Math.max(surfaceAt(desired.x, desired.z, desired.y), waterAt(desired.x, desired.z) ? WATER_Y : -1e9) + 0.6;
      if (desired.y < floor) desired.y = floor;
    }
    var spd = f === 'plane' ? (v.air || 0) : v.speed2d(), top = v.cls.maxSpeed || 40;
    var targetFov = U.lerp(CAM.fov, (CAM.fovSpeedMax || 75) + (air ? 4 : 0), U.clamp(spd / top, 0, 1));
    if (r._snap) { r.pos.x = desired.x; r.pos.y = desired.y; r.pos.z = desired.z; r.focus.x = fx0; r.focus.y = fy0; r.focus.z = fz0; r.fov = targetFov; r.roll = 0; r._snap = false; }
    else {
      var far = U.dist2d(r.pos.x, r.pos.z, desired.x, desired.z) > 60, k = far ? 1e3 : (mode === 'first' ? 60 : (air ? 7 : 6));
      r.pos.x = U.damp(r.pos.x, desired.x, k, dt); r.pos.y = U.damp(r.pos.y, desired.y, k, dt); r.pos.z = U.damp(r.pos.z, desired.z, k, dt);
      r.focus.x = U.damp(r.focus.x, fx0, k * 1.6, dt); r.focus.y = U.damp(r.focus.y, fy0, k * 1.6, dt); r.focus.z = U.damp(r.focus.z, fz0, k * 1.6, dt);
      r.fov = U.damp(r.fov, targetFov, CAM.fovDamp || 2, dt);
    }
    // the guard: the smoothed camera never sits inside a building
    if (mode !== 'first' && W().raycastBuildings) {
      var gx = r.pos.x - fx0, gy = r.pos.y - fy0, gz = r.pos.z - fz0, gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1, pad = CAM.collisionPad || 0.3;
      var hit = W().raycastBuildings(fx0, fy0, fz0, gx / gl, gy / gl, gz / gl, gl + pad);
      if (hit) { var gt = Math.max(0.5, hit.t - pad); r.pos.x = fx0 + gx / gl * gt; r.pos.y = fy0 + gy / gl * gt; r.pos.z = fz0 + gz / gl * gt; r.pulled = true; }
    }
    var rollT = mode === 'first' ? -v.roll : (f === 'plane' ? -v.roll * 0.35 : f === 'heli' ? -v.roll * 0.15 : 0);
    r.roll = U.damp(r.roll, U.clamp(rollT, -1.2, 1.2), 4, dt);
    if (r.shakeAmt > 0) { r._shakeT += dt * 40; r.shakeAmt = Math.max(0, r.shakeAmt - dt * (CAM.shakeDecay || 3) * r.shakeAmt - dt * 0.2); }
  }

  // ---- saves: GTP.SaveRegistry.vehicles (the v4 format) and a SaveHooks entry for the v3 saves ----
  var pendingMods = null;
  function saveState() {
    var p = player(), v = p && p.inVehicle;
    return { v: 1, garages: JSON.parse(JSON.stringify(garages)), current: v && v.mods ? { type: v.type, mods: v.mods } : null, controls: { invertPitch: !!Vehicles.controls.invertPitch } };
  }
  function loadState(d) {
    if (!d || typeof d !== 'object') return;
    garages = {};
    if (d.garages && typeof d.garages === 'object') for (var k in d.garages) if (Array.isArray(d.garages[k])) garages[k] = d.garages[k].filter(function (r) { return r && C.VEHICLES[r.type]; }).map(function (r) { return Object.assign({}, r); });
    Vehicles._garages = garages;
    pendingMods = d.current && d.current.type ? d.current : null;
    if (d.controls) Vehicles.controls.invertPitch = !!d.controls.invertPitch;
  }
  function hookSaves() {
    if (!GTP.SaveRegistry) GTP.SaveRegistry = {};
    if (!GTP.SaveRegistry.vehicles) GTP.SaveRegistry.vehicles = { get: saveState, set: loadState };
    GTP.SaveHooks = GTP.SaveHooks || [];
    if (!saveHooked) {
      saveHooked = true;
      // the v3 slot saves: data.vehicles (skipped when a v4 registry block already carries the same entry)
      GTP.SaveHooks.push({ name: 'vehicles', save: function (data) {
        data.vehicles = saveState();
        // a vehicle in the air (or the parachute) cannot be restored mid-flight: the player loads on foot below it
        var p = player(), v = p && p.inVehicle;
        if (v && data.vehicle && (fam(v) === 'chute' || (isAir(v) && !v.onGround))) data.vehicle = null;
      }, load: function (data) { loadState((data && data.vehicles) || {}); } });
      // NEW GAME empties the garages (a load restores them through the hook above)
      // a new world (New Game, a load, the boot) rebuilds the fleet slots
      if (GTP.Events) GTP.Events.on('load:begin', function () { fleet.lmRef = null; });
      if (GTP.Events) GTP.Events.on('load:begin', function (e) { if (e && e.reason === 'new') { garages = {}; Vehicles._garages = garages; pendingMods = null; } });
      if (GTP.Events) GTP.Events.on('vehicle:enter', function (e) {
        if (!pendingMods || !e || !e.ped || e.ped.kind !== 'player' || !e.vehicle) return;
        if (e.vehicle.type === pendingMods.type) { var pm = pendingMods; pendingMods = null; mod(e.vehicle, pm.mods); }
      });
    }
  }
  // ---- objective types for the story / content tracks: fly_to, land, skydive ----
  function resolveTarget(t) {
    if (!t) return null;
    var Wd = W();
    if (t.landmark) { var lm = Wd.landmark(t.landmark); if (!lm) return null; var d = (t.point && lm.points && lm.points[t.point]) || lm.door || lm; return { x: d.x + (t.dx || 0), z: d.z + (t.dz || 0), y: d.y || 0 }; }
    if (t.x != null) return { x: t.x, z: t.z != null ? t.z : 0, y: t.y || 0 };
    return null;
  }
  function hookObjectives() {
    var Ms = GTP.Missions; if (objHooked || !Ms || !Ms.registerObjectiveType) return;
    objHooked = true;
    function inFam(v, o) { if (!v) return false; if (o.family) return fam(v) === o.family; if (o.vehicle) return v.type === o.vehicle; return isAir(v); }
    try {
      Ms.registerObjectiveType('fly_to', {
        start: function (o, c) { c.target = resolveTarget(o.target); c.radius = o.radius || 25; },
        check: function (o, c, p) { var v = p.inVehicle; if (!c.target) return 'done'; if (!inFam(v, o)) return null; var agl = v.y - surfaceAt(v.x, v.z, v.y); return U.dist2d(v.x, v.z, c.target.x, c.target.z) <= c.radius && (o.maxAlt == null || agl <= o.maxAlt) && (o.minAlt == null || agl >= o.minAlt) ? 'done' : null; },
        hint: function (o, c, p) { return p.inVehicle && inFam(p.inVehicle, o) ? null : 'Get in an aircraft'; },
        target: function (o, c) { return c.target; }, cleanup: function () { }
      });
      Ms.registerObjectiveType('land', {
        start: function (o, c) { c.target = resolveTarget(o.target); c.radius = o.radius || 20; },
        check: function (o, c, p) { var v = p.inVehicle; if (!c.target) return 'done'; if (!inFam(v, o)) return null; return v.onGround && v.speed2d() < 3 && U.dist2d(v.x, v.z, c.target.x, c.target.z) <= c.radius ? 'done' : null; },
        hint: function (o, c, p) { var v = p.inVehicle; return v && inFam(v, o) && !v.onGround ? 'Set it down in the marker' : null; },
        target: function (o, c) { return c.target; }, cleanup: function () { }
      });
      Ms.registerObjectiveType('skydive', {
        start: function (o, c) {
          c.target = resolveTarget(o.target); c.radius = o.radius || 15; c.landed = false;
          c.fn = function (e) { if (e && e.ped && e.ped.kind === 'player' && c.target && U.dist2d(e.x, e.z, c.target.x, c.target.z) <= c.radius && !e.hard) c.landed = true; };
          GTP.Events.on('parachute:land', c.fn);
        },
        check: function (o, c) { return c.landed || !c.target ? 'done' : null; },
        target: function (o, c) { return c.target; },
        cleanup: function (o, c) { if (c.fn && GTP.Events.off) GTP.Events.off('parachute:land', c.fn); }
      });
    } catch (e) { report(e, 'vehicles.objectives'); }
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    // registered before 30_game.js adds its autoboot listener, so this runs first
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { install(); });
  }

  // ================================================================== public ==
  var Vehicles = GTP.Vehicles = {
    specs: SPECS, types: TYPES,
    family: fam, isAir: isAir, isSea: isSea,
    spawn: spawn, findClear: findClear, surfaceAt: surfaceAt,
    hud: function (v) { return v ? vehicleHud(v) : null; },
    riderPose: riderPose,
    mod: mod, modCatalog: modCatalog, buyMod: buyMod, repair: repair, repairPrice: repairPrice, priceOf: priceOf, parts: PARTS, defaultMods: DEFAULT_MODS,
    store: store, retrieve: retrieve, garage: function (id) { return (garages[id] || []).slice(); }, capacity: capacity, _garages: garages,
    deploy: function (v) { if (v && fam(v) === 'chute') deploy(v); },
    fleet: { enabled: true, slots: function () { return fleet.slots; }, refresh: function () { fleet.lmRef = null; } },
    modshop: modshop,
    controls: { invertPitch: false },
    virt: {},            // tests / touch: virtual raw keys by code (KeyQ, KeyE, ControlLeft, ShiftLeft)
    virtAxes: null,      // tests / AI: an object overriding readAxes() fields ({pitch, roll, yaw, collective, ...})
    readAxes: readAxes,
    install: install,
    save: saveState, load: loadState,
    state: function () {
      return { installed: installed, render: renderHooked, saves: saveHooked, objectives: objHooked, fleet: fleet.slots.map(function (s) { return { id: s.id, type: s.type, x: Math.round(s.x), z: Math.round(s.z), live: !!s.vehicle }; }), modshop: modshop.open, garages: Object.keys(garages).length };
    }
  };
})();
