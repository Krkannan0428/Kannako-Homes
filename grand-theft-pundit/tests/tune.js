/* tune.js: the feel-pass tuning (integration agent).
 *  1 heat is rate-limited: a one-second SMG burst into a civilian is one crime plus the kill, not eleven; ramming a cruiser
 *    three times in a second is one hitCopCar
 *  2 knock-over props: a sedan at speed tips a lamp post (prop.fallen, no longer solid, the instance matrix tilts, the car keeps
 *    most of its speed); a tree still stops it
 *  3 drive-by: aim + fire from the driver's seat with a pistol hits a ped ahead, never the player's own car; the crosshair is
 *    active; the camera stays the chase camera; fists cannot fire from a car
 *  4 the five-star helicopter can be locked and shot down with the SMG: heli:down, a wreck on the ground, a respawn cooldown
 *  5 the aim camera sits about 1.85 m above the feet (higher over-the-shoulder)
 *  6 the shootable heli and the drive-by leave GTP.errors empty; screenshot tune_driveby.png, tune_heli_down.png, tune_lamp.png */
'use strict';
const H = require('./_harness');

H.run('tune', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  await page.evaluate(() => {
    window.T_ = {
      press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
      enter(v) { const d = v.doorWorld(0); GTP.game.debug.teleport(d.x, d.z); GTP.game.advance(0.1); T_.press('enter'); GTP.game.advance(0.8); return GTP.game.player.inVehicle === v; },
      open() { const W = GTP.World, q = W.landmark('campus_quad').door; const rp = W.nearestRoadPoint(q.x, q.z); return { x: rp.x, z: rp.z, dx: rp.dx, dz: rp.dz }; }
    };
  });

  // ---- 1. heat rate limits ----
  const heat = await page.evaluate(() => {
    const p = GTP.game.player, U = GTP.util, W = GTP.World;
    const q = W.landmark('campus_quad').door; GTP.game.debug.teleport(q.x, q.z); GTP.game.advance(0.2);
    GTP.AI.wanted.clear();
    GTP.game.debug.giveWeapon('smg', 90);
    const f = U.yawToDir(p.yaw);
    const civ = GTP.game.debug.spawnPed(p.x + f.x * 7, p.z + f.z * 7, null, 'civ'); civ.ai = { mission: 'actor', phase: 0.5 }; civ.hp = 1000; civ.maxHp = 1000;
    const heat0 = GTP.AI.wanted.heat;
    GTP.Input.set('shoot', true); GTP.game.advance(1.0); GTP.Input.set('shoot', false);
    const out = { shots: p.stats.shots, hits: p.stats.hits, heat: +(GTP.AI.wanted.heat - heat0).toFixed(1), civHp: Math.round(civ.hp), wanted: p.wanted };
    GTP.AI.wanted.clear(); civ.destroy();
    // ramming a cruiser: three hits in a second
    const cop = GTP.game.debug.spawnVehicle(p.x + 20, p.z, 'cop', { yaw: 0 });
    const h0 = GTP.AI.wanted.heat;
    for (let i = 0; i < 3; i++) { cop.applyDamage(5, p, 'vehicle'); GTP.game.advance(0.3); }
    out.ramHeat = +(GTP.AI.wanted.heat - h0).toFixed(1);
    GTP.AI.wanted.clear(); cop.destroy(); GTP.game.advance(0.2);
    return out;
  });
  console.log('  heat: ' + JSON.stringify(heat));
  t.assert(heat.hits >= 6 && heat.civHp < 1000, 'the SMG burst landed: ' + JSON.stringify(heat));
  t.assert(heat.heat >= 1 && heat.heat <= 3, 'a one-second burst into one civilian is about one crime of heat, not one per bullet: ' + heat.heat);
  t.assert(heat.ramHeat === 1, 'three rams on a cruiser in a second count once: ' + heat.ramHeat);

  // ---- 2. knock-over props ----
  const lamp = await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World, U = GTP.util, R = GTP.Render;
    GTP.AI.wanted.clear();
    // a lamp post on open ground, then a sedan aimed at it from 14 m
    const lamps = W.props.filter((pr) => pr.kind === 'lamp' && pr.solid && !pr.fallen);
    const q = W.landmark('campus_quad').door;
    lamps.sort((a, b) => U.dist2d(a.x, a.z, q.x, q.z) - U.dist2d(b.x, b.z, q.x, q.z));
    let pick = null, sx = 0, sz = 0;
    const T = W.T, okTile = (x, z) => { const tt = W.tileAt(x, z); return tt === T.ROAD || tt === T.PARKING || tt === T.PLAZA || tt === T.SIDEWALK; };
    // 7 m of clear ground up to the post: open tiles, no other solid prop or car near the line, no building across it
    for (const L of lamps) {
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const x = L.x + Math.cos(a) * 7, z = L.z + Math.sin(a) * 7;
        let clear = okTile(x, z) && okTile((x + L.x) / 2, (z + L.z) / 2) && !W.solidAt(x, z, 0.5) && !W.raycastBuildings(x, 0.8, z, (L.x - x) / 7, 0, (L.z - z) / 7, 7);
        if (clear) for (const q of W.props) { if (q === L || !q.solid) continue; const t2 = ((q.x - x) * (L.x - x) + (q.z - z) * (L.z - z)) / 49; if (t2 < -0.3 || t2 > 1.3) continue; const cx = x + (L.x - x) * U.clamp(t2, 0, 1), cz = z + (L.z - z) * U.clamp(t2, 0, 1); if (U.dist2d(q.x, q.z, cx, cz) < 2.6) { clear = false; break; } }
        if (clear && GTP.Entities.near((x + L.x) / 2, (z + L.z) / 2, 9, 'vehicle').length) clear = false;
        if (clear) { pick = L; sx = x; sz = z; break; }
      }
      if (pick) break;
    }
    if (!pick) return { none: true };
    const yaw = U.dirToYaw(pick.x - sx, pick.z - sz), dir = U.yawToDir(yaw);
    const v = GTP.game.debug.spawnVehicle(sx, sz, 'sedan', { yaw });
    const inCar = T_.enter(v);
    GTP.game.debug.teleport(sx, sz); v.yaw = yaw; v.snap();
    GTP.game.render();
    const inst0 = pick._inst ? pick._inst.im.instanceMatrix.array.slice(pick._inst.k * 16, pick._inst.k * 16 + 16) : null;
    let ev = null; GTP.Events.on('prop:knocked', (e) => { ev = { kind: e.prop.kind, by: e.vehicle.type }; });
    GTP.game.debug.godMode(true);
    // already rolling at 12 m/s toward the post (the run-up is the physics, not a drive across campus furniture)
    v.vx = dir.x * 12; v.vz = dir.z * 12; v.speed = 12;
    GTP.Input.set('forward', true);
    let s = 0, speedAt = 12, minAfter = 99, hitAt = -1;
    while (s < 2) { GTP.game.advance(0.05); s += 0.05; if (!pick.fallen) speedAt = v.speed; else { if (hitAt < 0) hitAt = s; minAfter = Math.min(minAfter, v.speed); if (s - hitAt > 0.6) break; } }
    GTP.Input.set('forward', false);
    GTP.game.debug.godMode(false);
    GTP.game.render();
    const inst1 = pick._inst ? pick._inst.im.instanceMatrix.array.slice(pick._inst.k * 16, pick._inst.k * 16 + 16) : null;
    const changed = inst0 && inst1 && inst0.some((x, i) => Math.abs(x - inst1[i]) > 1e-3);
    // the camera looks back at the fallen post for the screenshot
    GTP.Input.set('back', true); GTP.game.advance(0.8); GTP.Input.set('back', false);
    R.rig.yaw = U.dirToYaw(pick.x - v.x, pick.z - v.z); R.rig.pitch = 0.22; R.rig.snap(); GTP.game.advance(0.05);
    return { inCar, fallen: !!pick.fallen, solid: pick.solid, speedAt: +speedAt.toFixed(1), minAfter: +minAfter.toFixed(1), ev, changed, hp: Math.round(v.hp), kinds: Array.from(new Set(W.props.filter((pr) => pr.fallen).map((pr) => pr.kind))), errors: GTP.errors.length };
  });
  console.log('  lamp: ' + JSON.stringify(lamp));
  t.assert(!lamp.none && lamp.inCar, 'a lamp post with a clear run-up was found');
  t.assert(lamp.fallen && lamp.solid === false && lamp.ev && lamp.ev.kind === 'lamp', 'the sedan knocked the lamp post over: ' + JSON.stringify(lamp));
  t.assert(lamp.minAfter > lamp.speedAt * 0.5 && lamp.speedAt > 5, 'the car kept most of its speed through the post (' + lamp.speedAt + ' -> ' + lamp.minAfter + ')');
  t.assert(lamp.changed, 'the prop instance tilted (matrix changed)');
  await t.shot(page, 'tune_lamp');
  const tree = await page.evaluate(() => {
    const p = GTP.game.player, v = p.inVehicle, W = GTP.World, U = GTP.util;
    const trees = W.props.filter((pr) => pr.kind === 'tree' && pr.solid);
    trees.sort((a, b) => U.dist2d(a.x, a.z, v.x, v.z) - U.dist2d(b.x, b.z, v.x, v.z));
    const T = trees[0];
    GTP.game.debug.teleport(T.x - 7, T.z); v.yaw = U.dirToYaw(1, 0); v.vx = 12; v.vz = 0; v.speed = 12; v.snap();
    GTP.Input.set('forward', true); GTP.game.advance(1.5); GTP.Input.set('forward', false);
    return { fallen: !!T.fallen, solid: T.solid, dist: +U.dist2d(v.x, v.z, T.x, T.z).toFixed(1) };
  });
  console.log('  tree: ' + JSON.stringify(tree));
  t.assert(!tree.fallen && tree.solid && tree.dist >= 1.8, 'a tree still stands and stops the car: ' + JSON.stringify(tree));

  // ---- 3. drive-by ----
  const driveby = await page.evaluate(() => {
    const p = GTP.game.player, v = p.inVehicle, W = GTP.World, U = GTP.util, R = GTP.Render, CB = GTP.Combat;
    const o = T_.open();
    GTP.game.debug.teleport(o.x, o.z); v.yaw = U.dirToYaw(o.dx, o.dz); v.vx = v.vz = 0; v.speed = 0; v.snap();
    const f = U.yawToDir(v.yaw), rx = -f.z, rz = f.x;
    const ped = GTP.game.debug.spawnPed(v.x + f.x * 9 - rx * 2.5, v.z + f.z * 9 - rz * 2.5, null, 'thug'); ped.ai = { mission: 'actor', phase: 0.5 }; ped.hostile = true; ped.hp = 500; ped.maxHp = 500;
    p.weapon = 'fist';
    const sh0 = p.stats.shots, pu0 = p.stats.punches || 0;
    GTP.Input.set('aim', true); GTP.Input.set('shoot', true); GTP.game.advance(0.4); GTP.Input.set('shoot', false); GTP.Input.set('aim', false);
    const fistShots = p.stats.shots - sh0, fistPunch = (p.stats.punches || 0) - pu0;
    GTP.game.debug.giveWeapon('pistol', 30);
    R.rig.yaw = U.dirToYaw(ped.x - v.x, ped.z - v.z); R.rig.pitch = 0.1; R.rig.snap();
    const hp0 = ped.hp, vhp0 = v.hp, shots0 = p.stats.shots;
    GTP.Input.set('aim', true); GTP.game.advance(0.2);
    const aim = { active: CB.aim.active, target: CB.aim.target === ped, screen: !!(CB.aim.screen && CB.aim.screen.visible), camDist: +Math.hypot(R.camera.position.x - v.x, R.camera.position.z - v.z).toFixed(1) };
    GTP.Input.set('shoot', true); GTP.game.advance(1.2); GTP.Input.set('shoot', false);
    GTP.game.render();
    const out = { fistShots, fistPunch, aim, shots: p.stats.shots - shots0, pedHp: Math.round(hp0 - ped.hp), carHp: +(vhp0 - v.hp).toFixed(1), inCar: p.inVehicle === v, state: GTP.game.state, errors: GTP.errors.length };
    GTP.Input.set('aim', false); GTP.game.advance(0.2);
    return out;
  });
  console.log('  drive-by: ' + JSON.stringify(driveby));
  t.assert(driveby.fistShots === 0 && driveby.fistPunch === 0, 'fists do not fire from a car');
  t.assert(driveby.aim.active && driveby.aim.target && driveby.aim.screen, 'aiming from the driver\'s seat locks the ped and shows the crosshair: ' + JSON.stringify(driveby.aim));
  t.assert(driveby.aim.camDist > 5 && driveby.aim.camDist < 12, 'the camera stays the chase camera while aiming from a car: ' + driveby.aim.camDist);
  t.assert(driveby.shots >= 3 && driveby.pedHp > 30 && driveby.carHp === 0 && driveby.inCar, 'the pistol drive-by hits the ped and never the player\'s own car: ' + JSON.stringify(driveby));
  await t.shot(page, 'tune_driveby');

  // ---- 4. shoot down the helicopter ----
  const heli = await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World, U = GTP.util, R = GTP.Render, CB = GTP.Combat;
    if (p.inVehicle) p.exitVehicle();
    const q = W.landmark('stadium').door; GTP.game.debug.teleport(q.x, q.z); GTP.game.advance(0.3);
    GTP.game.debug.godMode(true);
    GTP.game.debug.giveWeapon('smg', 400); p.weapon = 'smg';
    GTP.game.debug.setClock(21.5);
    GTP.game.debug.setWanted(5);
    let s = 0; while (s < 6 && !GTP.AI.police.heli) { GTP.game.advance(0.5); s += 0.5; }
    const h = GTP.AI.police.heli; if (!h) return { none: true };
    GTP.game.advance(4);
    let down = null; GTP.Events.on('heli:down', (e) => { down = { src: e.src === p }; });
    const hp0 = h.hp, maxHp = h.maxHp;
    let locked = false, fired = 0, guard = 0;
    GTP.Input.set('aim', true);
    while (guard++ < 400 && !h.down) {
      R.rig.yaw = U.dirToYaw(h.x - p.x, h.z - p.z); R.rig.pitch = Math.atan2(h.y - p.y - 1.3, U.dist2d(h.x, h.z, p.x, p.z));
      GTP.game.advance(1 / 60);
      if (CB.aim.target === h) locked = true;
      GTP.Input.set('shoot', true); GTP.game.advance(1 / 30); GTP.Input.set('shoot', false); fired++;
    }
    GTP.Input.set('aim', false);
    const hitAt = { hp: h.hp, down: h.down, locked, fired, ammo: p.weapons.smg };
    // the fall and the blast
    let s2 = 0; while (s2 < 12 && !h.removed) { GTP.game.advance(0.25); s2 += 0.25; }
    const out = { hp0, maxHp, hit: hitAt, down, removed: h.removed, fallT: s2, policeHeli: GTP.AI.police.heli, heliT: +(GTP.AI.police.heliT || 0).toFixed(0), wanted: p.wanted, errors: GTP.errors.length };
    // the shot: the wreck's smoke and the fire on the ground
    GTP.game.advance(0.3);
    R.rig.yaw = U.dirToYaw(h.x - p.x, h.z - p.z); R.rig.pitch = 0.25; R.rig.snap(); GTP.game.advance(0.05);
    GTP.game.debug.godMode(false);
    return out;
  });
  console.log('  heli: ' + JSON.stringify(heli));
  t.assert(!heli.none && heli.hp0 === 400, 'the helicopter came up at five stars with 400 hp');
  t.assert(heli.hit.locked && heli.hit.down && heli.down && heli.down.src, 'the SMG locked onto the helicopter and shot it down: ' + JSON.stringify(heli.hit));
  t.assert(heli.removed && heli.fallT < 12 && heli.policeHeli === null && heli.heliT > 20, 'it fell, blew up and the next one is on a cooldown: ' + JSON.stringify({ removed: heli.removed, fallT: heli.fallT, heliT: heli.heliT }));
  await t.shot(page, 'tune_heli_down');

  // ---- 5. the aim camera ----
  const cam = await page.evaluate(() => {
    const p = GTP.game.player, R = GTP.Render, C = GTP.C;
    GTP.AI.wanted.clear(); GTP.game.debug.teleport(GTP.World.landmark('campus_quad').door.x, GTP.World.landmark('campus_quad').door.z);
    R.rig.pitch = 0; GTP.Input.set('aim', true); GTP.game.advance(1.2);
    const out = { dy: +(R.camera.position.y - p.y).toFixed(2), dist: +Math.hypot(R.camera.position.x - p.x, R.camera.position.z - p.z).toFixed(2), fov: Math.round(R.camera.fov), cfg: C.CAMERA.aimHeight };
    GTP.Input.set('aim', false); GTP.game.advance(0.3);
    return out;
  });
  console.log('  aim cam: ' + JSON.stringify(cam));
  t.assert(cam.dy > 1.7 && cam.dy < 2.1 && cam.dist > 1.6 && cam.dist < 2.6 && cam.fov === 50, 'the aim camera sits high over the shoulder: ' + JSON.stringify(cam));

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
