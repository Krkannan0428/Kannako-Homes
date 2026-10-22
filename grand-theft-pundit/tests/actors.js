/* actors.js: the player controller, the camera rig and vehicle physics (06_entities / 10_render).
 *  1 camera-relative movement   2 walls stop the ped         3 jump
 *  4 enter, drive, brake, reverse   5 crash: damage, shake, no tunnelling   6 the Loop ramp and a fall
 *  7 hp 0 -> smoke -> explosion -> wreck, player ejected   8 exit beside the door   9 pier -> water -> swim -> shore
 * 10 the chase camera never sits inside a building while driving downtown
 * Screenshots in tests/out: actors_*.png (look at them). */
'use strict';
const H = require('./_harness');

H.run('actors', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  const EAST = -Math.PI / 2, SOUTH = Math.PI, NORTH = 0;

  // ---- 1. movement follows the camera yaw ----
  const mv = await page.evaluate(({ EAST }) => {
    const p = GTP.game.player, R = GTP.Render.rig;
    const door = GTP.World.landmark('campus_quad').door;
    GTP.game.debug.teleport(door.x, door.z);
    R.yaw = EAST; R.snap(); GTP.game.advance(0.1);
    const a = { x: p.x, z: p.z };
    GTP.Input.set('forward', true); GTP.game.advance(2); GTP.Input.set('forward', false); GTP.game.advance(0.3);
    const b = { x: p.x, z: p.z, yaw: p.yaw };
    // turn the look 90 degrees (yaw decreases with +dx) and walk again: now toward the south
    GTP.Input.setLook((Math.PI / 2) / GTP.C.CAMERA.lookSens, 0); GTP.game.advance(0.1);
    const camYaw = R.yaw;
    GTP.Input.set('forward', true); GTP.game.advance(2); GTP.Input.set('forward', false); GTP.game.advance(0.3);
    const c = { x: p.x, z: p.z, yaw: p.yaw };
    return { dx1: b.x - a.x, dz1: b.z - a.z, yaw1: b.yaw, camYaw, dx2: c.x - b.x, dz2: c.z - b.z, yaw2: c.yaw, isPlayer: p instanceof GTP.Player, name: p.name, look: p.look };
  }, { EAST });
  console.log('  move: ' + JSON.stringify(mv));
  t.assert(mv.isPlayer && mv.name === 'Bryce Takesworth' && mv.look.extra === 'mic', 'the player is a GTP.Player with the cast look');
  t.assert(mv.dx1 > 3.5 && Math.abs(mv.dz1) < 1.5, 'forward with the camera facing east moves east: ' + mv.dx1 + ',' + mv.dz1);
  t.assert(Math.abs(GTP_wrap(mv.yaw1 - EAST)) < 0.3, 'character turned toward movement (east): ' + mv.yaw1);
  t.assert(Math.abs(GTP_wrap(mv.camYaw - SOUTH)) < 0.1, 'look input rotated the camera 90 degrees: ' + mv.camYaw);
  t.assert(mv.dz2 > 3.5 && Math.abs(mv.dx2) < 1.5, 'movement follows the camera (south): ' + mv.dx2 + ',' + mv.dz2);

  // ---- 2. walking into a building stops the ped outside its AABB ----
  const wall = await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World, R = GTP.Render.rig;
    const door = GTP.World.landmark('campus_quad').door;
    GTP.game.debug.teleport(door.x, door.z);
    let best = null, bd = 1e9;
    W.buildings.forEach((b) => { const d = Math.hypot(b.cx - p.x, b.cz - p.z); if (d < bd) { bd = d; best = b; } });
    const yaw = GTP.util.dirToYaw(best.cx - p.x, best.cz - p.z);
    R.yaw = yaw; R.snap();
    // traffic and parked cars on the straight line to the wall are cleared first: the test wants the wall, not a fender
    // (the ambient spawn stream differs on the bigger map, so a sedan stopped on Goldplate Avenue could sit in the run-up)
    GTP.Entities.near(p.x, p.z, 60, 'vehicle').forEach((o) => { if (!o.removed) o.destroy(); });
    GTP.game.advance(0.05);
    let inside = 0, minGap = 1e9;
    GTP.Input.set('forward', true); GTP.Input.set('run', true);
    for (let i = 0; i < 24; i++) {
      GTP.game.advance(0.25);
      W.buildings.forEach((b) => {
        if (p.x > b.x && p.x < b.x + b.w && p.z > b.z && p.z < b.z + b.d && p.y < b.y + b.h) inside++;
      });
      const gx = Math.max(best.x - p.x, 0, p.x - best.x - best.w), gz = Math.max(best.z - p.z, 0, p.z - best.z - best.d);
      minGap = Math.min(minGap, Math.hypot(gx, gz));
    }
    const speed = p.speed;
    GTP.Input.set('forward', false); GTP.Input.set('run', false); GTP.game.advance(0.3);
    const gx = Math.max(best.x - p.x, 0, p.x - best.x - best.w), gz = Math.max(best.z - p.z, 0, p.z - best.z - best.d);
    return { inside, minGap, gap: Math.hypot(gx, gz), speed, dist: bd, solid: W.solidAt(p.x, p.z, p.y + 0.5) };
  });
  console.log('  wall: ' + JSON.stringify(wall));
  t.assert(wall.inside === 0 && !wall.solid, 'player never inside a building AABB');
  t.assert(wall.gap < 2.5 && wall.minGap > 0.3, 'player walked up to the building and stopped against it: gap ' + wall.gap);
  t.assert(wall.speed < 1.0, 'player stopped at the wall: speed ' + wall.speed);

  // ---- 3. jump ----
  const jump = await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World;
    const door = GTP.World.landmark('campus_quad').door;
    GTP.game.debug.teleport(door.x, door.z); GTP.game.advance(0.2);
    const g = W.heightAt(p.x, p.z, 0);
    GTP.Input.set('jump', true); GTP.game.advance(0.05); GTP.Input.set('jump', false);
    let maxY = p.y, landed = -1;
    for (let i = 0; i < 40; i++) { GTP.game.advance(0.05); maxY = Math.max(maxY, p.y); if (landed < 0 && p.onGround && i > 2) landed = i * 0.05; }
    return { rise: maxY - g, landed, y: p.y - g, onGround: p.onGround, state: p.state };
  });
  console.log('  jump: ' + JSON.stringify(jump));
  t.assert(jump.rise > 0.8 && jump.rise < 1.4, 'jump rises above 0.8 m: ' + jump.rise);
  t.assert(jump.landed > 0.3 && jump.landed < 1.6 && Math.abs(jump.y) < 0.03 && jump.onGround, 'returns to the ground: ' + JSON.stringify(jump));

  // ---- 4. enter a sedan, drive, brake, reverse ----
  const drive = await page.evaluate(({ EAST }) => {
    const p = GTP.game.player, E = GTP.Entities;
    GTP.game.debug.teleport(110, 278); GTP.game.advance(0.1);
    const v = GTP.game.debug.spawnVehicle(112.4, 278, 'sedan', { yaw: EAST });
    // the run east along the avenue is cleared of traffic (the test measures the car, not a fender on a sedan ahead)
    GTP.Entities.list.filter((e) => e.kind === 'vehicle' && e !== v && !e.removed && Math.abs(e.z - 278) < 7 && e.x > 100 && e.x < 240).forEach((e) => e.destroy());
    GTP.game.advance(0.05);
    const doorDist = v.doorDistance(p.x, p.z);
    GTP.Input.set('enter', true); GTP.game.advance(0.05); GTP.Input.set('enter', false);
    const enteringState = p.state;
    GTP.game.advance(0.6);
    GTP.game.render();
    const inCar = p.vehicle === v && p.inVehicle === v && v.driver === p, hidden = p.mesh && !p.mesh.visible, vehVisible = v.mesh && v.mesh.visible;
    const x0 = v.x, z0 = v.z;
    let peak = 0;
    // traffic keeps arriving on the avenue (a bus from the far end, a car off a side street): the lane ahead stays clear for the run
    const clearAhead = () => GTP.Entities.list.filter((e) => e.kind === 'vehicle' && e !== v && !e.removed && Math.abs(e.z - 278) < 7 && e.x > v.x - 6 && e.x < v.x + 70).forEach((e) => e.destroy());
    GTP.Input.set('forward', true);
    for (let i = 0; i < 16; i++) { clearAhead(); GTP.game.advance(0.25); peak = Math.max(peak, v.speed); }
    GTP.Input.set('forward', false);
    const disp = Math.hypot(v.x - x0, v.z - z0), speedAfter4 = v.speed, wheelSpin = v.wheelSpin;
    // brake to a stop
    GTP.Input.set('back', true);
    let stopT = -1;
    for (let i = 0; i < 20; i++) { GTP.game.advance(0.25); if (v.speed < 0.4 && stopT < 0) { stopT = (i + 1) * 0.25; break; } }
    GTP.Input.set('back', false); GTP.game.advance(0.3);
    const xStop = v.x, stopped = Math.abs(v.speed);
    // reverse
    GTP.Input.set('back', true); GTP.game.advance(2); GTP.Input.set('back', false);
    const rev = { speed: v.speed, dx: v.x - xStop, reversing: v.reversing, reverseTime: v.reverseTime };
    GTP.game.advance(1);
    const fov = GTP.Render.camera.fov;
    return { doorDist, enteringState, inCar, hidden, vehVisible, disp, peak, speedAfter4, wheelSpin, stopT, stopped, rev, fov, entities: E.list.length, snapshot: GTP.game.debug.snapshot().player };
  }, { EAST });
  console.log('  drive: ' + JSON.stringify(drive));
  t.assert(drive.doorDist < 3, 'car door within enter range: ' + drive.doorDist);
  t.assert(drive.inCar && drive.hidden && drive.vehVisible, 'enter: player.vehicle set, ped mesh hidden, car visible ' + JSON.stringify([drive.inCar, drive.hidden, drive.vehVisible]));
  t.assert(drive.disp > 60, 'drove more than 60 m in 4 s: ' + drive.disp + ' (peak ' + drive.peak + ' m/s)');
  t.assert(drive.wheelSpin < -10, 'wheels spin with speed: ' + drive.wheelSpin);
  t.assert(drive.stopT > 0 && drive.stopT < 4 && drive.stopped < 0.5, 'brake to a stop: ' + drive.stopT + ' s, speed ' + drive.stopped);
  t.assert(drive.rev.speed < -2 && drive.rev.dx < -3 && drive.rev.reversing, 'reverse works: ' + JSON.stringify(drive.rev));
  t.assert(drive.snapshot.vehicle === 'sedan', 'snapshot reports the vehicle');

  // ---- 5. crash into a building ----
  const crash = await page.evaluate(({ SOUTH }) => {
    const p = GTP.game.player, v = p.inVehicle, W = GTP.World, T = W.T, TILE = GTP.C.TILE;
    // a building whose north wall faces 22 m of open ground
    const cands = [];
    W.buildings.forEach((b) => {
      const sx = b.cx, sz = b.z - 22;
      if (sx < 20 || sz < 20) return;
      let ok = true;
      for (let z = sz - 3; z < b.z - 0.5 && ok; z += 2) { const tt = W.tileAt(sx, z); if (tt === T.BUILDING || tt === T.WATER || tt === T.VOID || tt === T.RAMP || W.deckAt(Math.floor(sx / TILE), Math.floor(z / TILE))) ok = false; }
      for (let x = sx - 1.5; x <= sx + 1.5 && ok; x += 1) { const tt = W.tileAt(x, sz); if (tt === T.BUILDING || tt === T.WATER || tt === T.VOID) ok = false; }
      const props = W.props.filter((pr) => pr.solid && Math.abs(pr.x - sx) < 2.2 && pr.z > sz - 4 && pr.z < b.z);
      // nothing parked or driving in the run-up either: the test wants the wall, not a fender
      const cars = GTP.Entities.list.filter((e) => e.kind === 'vehicle' && !e.removed && e !== v && Math.abs(e.x - sx) < 4.5 && e.z > sz - 8 && e.z < b.z + 2);
      if (ok && !props.length && !cars.length) cands.push({ b, d: Math.hypot(sx - p.x, sz - p.z) });
    });
    cands.sort((a, b) => a.d - b.d);
    const b = cands[0].b, sx = b.cx, sz = b.z - 22;
    GTP.game.debug.teleport(sx, sz); v.yaw = SOUTH; v.snap(); GTP.Render.rig.yaw = SOUTH; GTP.Render.rig.snap(); GTP.game.advance(0.1);
    // traffic that could cross the run-up in the next two seconds is cleared: the test wants the wall, not a fender
    GTP.Entities.near(sx, (sz + b.z) / 2, 48, 'vehicle').forEach((o) => { if (o !== v && !o.removed) o.destroy(); });
    GTP.game.advance(0.05);
    const hp0 = v.hp;
    let peak = 0, shake = 0, inside = 0, minSpeedAfterPeak = 1e9, hitAt = -1, imp = null, sparks = 0;
    GTP.Events.on('vehicle:impact', (e) => { if (!imp && e.vehicle === v) imp = { impact: +e.impact.toFixed(1), kind: e.kind }; });   // this car's, not a bump elsewhere in the city
    GTP.Input.set('forward', true);
    for (let i = 0; i < 240; i++) {
      GTP.game.advance(1 / 60);
      const sp = Math.hypot(v.vx, v.vz);
      if (sp > peak) peak = sp;
      shake = Math.max(shake, GTP.Render.rig.shakeAmt);
      if (v.x > b.x && v.x < b.x + b.w && v.z > b.z && v.z < b.z + b.d) inside++;
      if (imp && hitAt < 0) { hitAt = i; GTP.Input.set('forward', false); }
      if (hitAt >= 0) { minSpeedAfterPeak = Math.min(minSpeedAfterPeak, sp); sparks = Math.max(sparks, GTP.Render.fx.list.filter((f) => f.type === 'spark').length); }
      if (hitAt >= 0 && i > hitAt + 6) break;
    }
    GTP.Input.set('forward', false);
    const gap = b.z - v.z - v.cls.length / 2;
    return { building: b.landmark || b.id, hp0, hp: v.hp, damage: v.damage, peak, shake, inside, minSpeedAfterPeak, hitAt, imp, sparks, gap, corners: v._coll.pts.length };
  }, { SOUTH });
  console.log('  crash: ' + JSON.stringify(crash));
  await t.shot(page, 'actors_crash');
  t.assert(crash.hitAt >= 0 && crash.imp && crash.imp.kind === 'wall', 'the car hit the wall: ' + JSON.stringify(crash.imp));
  t.assert(crash.damage > 0 && crash.hp < crash.hp0, 'crash damage: ' + crash.damage);
  t.assert(crash.minSpeedAfterPeak < crash.peak * 0.5, 'speed dropped after the hit: ' + crash.minSpeedAfterPeak + ' vs peak ' + crash.peak);
  t.assert(crash.shake > 0.1, 'camera shake fired: ' + crash.shake);
  t.assert(crash.inside === 0 && crash.gap > -0.6, 'no tunnelling: inside ' + crash.inside + ', gap ' + crash.gap);
  t.assert(crash.sparks > 0, 'sparks on impact');

  // ---- 6. the Loop: ramp up to the deck, then a fall from deck height ----
  const loop = await page.evaluate(({ EAST }) => {
    const p = GTP.game.player, v = p.inVehicle, W = GTP.World;
    v.hp = v.maxHp; v.damage = 0;
    GTP.game.debug.teleport(122, 234); v.yaw = EAST; v.snap(); GTP.Render.rig.yaw = EAST; GTP.Render.rig.snap(); GTP.game.advance(0.1);
    let maxY = 0, onDeckAt = null, samples = [], shot = false;
    GTP.Input.set('forward', true);
    for (let i = 0; i < 40; i++) {
      GTP.game.advance(0.2);
      samples.push([+v.x.toFixed(1), +v.y.toFixed(2)]);
      maxY = Math.max(maxY, v.y);
      if (!onDeckAt && v.x > 178 && v.y > 6.8) { onDeckAt = { x: v.x, y: v.y, speed: v.speed, deck: W.heightAt(v.x, v.z, v.y) }; GTP.Input.set('forward', false); GTP.Input.set('back', true); }
      if (onDeckAt && Math.abs(v.speed) < 0.5) break;
    }
    GTP.Input.set('forward', false); GTP.Input.set('back', false); GTP.game.advance(0.4);
    const deckPos = { x: v.x, y: v.y, z: v.z, pitch: v.pitch, street: W.streetAt(v.x, v.z, v.y) };
    GTP.game.render();
    // a drop from deck height onto Goldplate Avenue: a fresh car (the deck barrier and the reverse took their toll) onto a
    // clear patch of road, since the fall damage and the next step's explosion both want the car alive and the player in it
    v.hp = v.maxHp; v.damage = 0;
    GTP.Entities.near(200, 282, 16, 'vehicle').forEach((o) => { if (o !== v && !o.removed) o.destroy(); });
    GTP.game.debug.teleport(200, 282, 7.5); v.vx = 6; v.vz = 0; v.onGround = false; GTP.game.advance(0.05);
    let fell = false, airborne = 0, landedAt = -1;
    for (let i = 0; i < 60; i++) { GTP.game.advance(0.05); if (!v.onGround) airborne++; if (v.y < 3) fell = true; if (v.onGround && fell && landedAt < 0) landedAt = i * 0.05; }
    return { maxY, onDeckAt, deckPos, fell, airborne, landedAt, yEnd: v.y, onGround: v.onGround, hp: +v.hp.toFixed(1), burning: v.burning, exploded: v.exploded, inCar: p.inVehicle === v, samples: samples.slice(0, 20) };
  }, { EAST });
  console.log('  loop: ' + JSON.stringify(loop));
  t.assert(loop.onDeckAt && loop.maxY > 6.9 && loop.maxY < 7.2, 'drove up the ramp onto the deck (y ~7): ' + JSON.stringify(loop.onDeckAt));
  t.assert(loop.deckPos.street === 'The Loop', 'on the Loop: ' + loop.deckPos.street);
  t.assert(loop.fell && loop.airborne > 8 && loop.landedAt > 0 && loop.yEnd < 0.2 && loop.onGround, 'fell from the deck edge and landed: ' + JSON.stringify([loop.airborne, loop.landedAt, loop.yEnd]));

  // the Loop seen from the car (re-run the ramp for the shot, stopping on the deck)
  await page.evaluate(({ EAST }) => {
    const p = GTP.game.player, v = p.inVehicle;
    GTP.game.debug.setClock(15);
    GTP.game.debug.teleport(150, 234); v.yaw = EAST; v.snap(); GTP.Render.rig.yaw = EAST; GTP.Render.rig.snap();
    GTP.Input.set('forward', true); GTP.game.advance(2.2); GTP.Input.set('forward', false); GTP.Input.set('back', true); GTP.game.advance(1.2); GTP.Input.set('back', false);
    GTP.game.advance(0.5);
  }, { EAST });
  await t.shot(page, 'actors_loop');

  // ---- 7. hp 0: smoke, fire, explosion, wreck; the player is thrown out and hurt ----
  const boom = await page.evaluate(() => {
    const p = GTP.game.player, v = p.inVehicle, E = GTP.Entities;
    GTP.game.debug.teleport(200, 282); v.yaw = -Math.PI / 2; v.snap(); GTP.game.advance(0.2);
    let exploded = false; GTP.Events.on('vehicle:exploded', () => { exploded = true; });
    const hp0 = p.hp;
    v.hp = 0;
    GTP.game.advance(0.5);
    const fxTypes = {}; GTP.Render.fx.list.forEach((f) => { fxTypes[f.type] = (fxTypes[f.type] || 0) + 1; });
    const burning = v.burning, smoke = (fxTypes.smoke || 0) + (fxTypes.fire || 0);
    let explodedAt = -1;
    for (let i = 0; i < 70; i++) { GTP.game.advance(0.05); if (exploded && explodedAt < 0) { explodedAt = 0.5 + i * 0.05; break; } }
    GTP.game.advance(0.05);
    const fx2 = {}; GTP.Render.fx.list.forEach((f) => { fx2[f.type] = (fx2[f.type] || 0) + 1; });
    GTP.game.render();
    const out = { burning, smoke, fxTypes, explodedAt, exploded, wreck: v.wreck, inList: E.list.indexOf(v) >= 0, ejected: p.inVehicle === null && p.vehicle === null, hp: p.hp, hp0, knocked: p.knockedDown, fx2, meshVisible: v.mesh.visible, wreckMat: v.mesh.children[0].material[0] === GTP.Render._vehicleMats().wreck };
    return out;
  });
  console.log('  boom: ' + JSON.stringify(boom));
  await t.shot(page, 'actors_explosion');
  t.assert(boom.burning && boom.smoke > 0, 'smoke and fire after hp 0: ' + JSON.stringify(boom.fxTypes));
  t.assert(boom.exploded && boom.explodedAt > 0 && boom.explodedAt < 4, 'explosion within 4 s: ' + boom.explodedAt);
  t.assert(boom.wreck && boom.inList && boom.meshVisible && boom.wreckMat, 'wreck remains with the charred look');
  t.assert(boom.ejected && boom.knocked && boom.hp < boom.hp0 && boom.hp > 0, 'player ejected, knocked down and damaged: hp ' + boom.hp);
  t.assert((boom.fx2.explosion || 0) + (boom.fx2.ring || 0) + (boom.fx2.fire || 0) > 0, 'explosion fx');

  // ---- 8. exit beside the door on a free tile ----
  const exit = await page.evaluate(({ EAST }) => {
    const p = GTP.game.player, W = GTP.World;
    GTP.game.advance(3.2);   // get up
    GTP.game.debug.teleport(150.5, 281); GTP.game.advance(0.1);
    const v = GTP.game.debug.spawnVehicle(152.4, 282, 'taxi', { yaw: EAST });
    GTP.Input.set('enter', true); GTP.game.advance(0.05); GTP.Input.set('enter', false); GTP.game.advance(0.6);
    const entered = p.inVehicle === v;
    GTP.Input.set('enter', true); GTP.game.advance(0.05); GTP.Input.set('enter', false); GTP.game.advance(0.4);
    GTP.game.render();
    const door = v.doorWorld(0);
    return { entered, out: p.inVehicle === null, dist: Math.hypot(p.x - v.x, p.z - v.z), doorDist: Math.hypot(p.x - door.x, p.z - door.z), solid: W.solidAt(p.x, p.z, p.y + 0.5), inBox: !!v.pushCircle(p.x, p.z, p.radius), tile: W.tileAt(p.x, p.z), visible: p.mesh.visible, y: p.y, onGround: p.onGround };
  }, { EAST });
  console.log('  exit: ' + JSON.stringify(exit));
  t.assert(exit.entered && exit.out && exit.visible, 'entered then exited the taxi');
  t.assert(exit.doorDist < 1.0 && !exit.solid && !exit.inBox && exit.tile !== GTP_T().WATER && exit.onGround, 'player beside the driver door on a free tile: ' + JSON.stringify(exit));

  // ---- 9. off the marina pier into the water ----
  const swim = await page.evaluate(({ SOUTH, NORTH }) => {
    const p = GTP.game.player, W = GTP.World, E = GTP.Entities;
    GTP.game.debug.teleport(296, 522); GTP.game.advance(0.1);
    const v = GTP.game.debug.spawnVehicle(296, 524.5, 'sedan', { yaw: SOUTH });
    GTP.Input.set('enter', true); GTP.game.advance(0.05); GTP.Input.set('enter', false); GTP.game.advance(0.6);
    const entered = p.inVehicle === v;
    GTP.Render.rig.yaw = SOUTH; GTP.Render.rig.snap();
    GTP.Input.set('forward', true);
    let sinkAt = -1, lostAt = -1, swimAt = -1, maxZ = 0;
    for (let i = 0; i < 160; i++) {
      GTP.game.advance(0.05);
      maxZ = Math.max(maxZ, v.z);
      if (v.sinking && sinkAt < 0) { sinkAt = i * 0.05; GTP.Input.set('forward', false); }
      if (p.swimming && swimAt < 0) swimAt = i * 0.05;
      if (sinkAt >= 0 && E.list.indexOf(v) < 0 && lostAt < 0) { lostAt = i * 0.05; break; }
    }
    GTP.Input.set('forward', false);
    const swimState = { swimming: p.swimming, y: +p.y.toFixed(2), state: p.state, tile: W.tileAt(p.x, p.z), z: p.z, x: p.x };
    GTP.game.render();
    // swim north and climb out onto the pier
    GTP.Render.rig.yaw = NORTH; GTP.Render.rig.snap();
    let outAt = -1;
    GTP.Input.set('forward', true);
    for (let i = 0; i < 200; i++) { GTP.game.advance(0.05); if (!p.swimming && p.onGround) { outAt = i * 0.05; break; } }
    GTP.game.advance(0.3); GTP.Input.set('forward', false); GTP.game.advance(0.2);
    return { entered, sinkAt, lostAt, swimAt, maxZ, swimState, outAt, shore: { swimming: p.swimming, tile: W.tileAt(p.x, p.z), y: +p.y.toFixed(2), z: +p.z.toFixed(1), onGround: p.onGround }, entities: E.list.length };
  }, { SOUTH, NORTH });
  console.log('  swim: ' + JSON.stringify(swim));
  t.assert(swim.entered && swim.sinkAt > 0, 'the car left the pier and started sinking at ' + swim.sinkAt);
  t.assert(swim.lostAt > 0 && swim.lostAt - swim.sinkAt < 4, 'vehicle lost within 4 s of entering the water: ' + (swim.lostAt - swim.sinkAt));
  t.assert(swim.swimAt >= 0 && swim.swimState.swimming && swim.swimState.tile === GTP_T().WATER && Math.abs(swim.swimState.y + 0.95) < 0.3, 'player swims at the surface: ' + JSON.stringify(swim.swimState));
  t.assert(swim.outAt > 0 && !swim.shore.swimming && swim.shore.tile !== GTP_T().WATER && swim.shore.y >= 0 && swim.shore.onGround, 'walked out onto the shore: ' + JSON.stringify(swim.shore));

  // ---- 10. chase camera stays out of buildings over 300 driving steps downtown ----
  const cam = await page.evaluate(({ SOUTH }) => {
    const p = GTP.game.player, W = GTP.World;
    GTP.game.debug.teleport(326, 196); GTP.game.advance(0.1);
    const v = GTP.game.debug.spawnVehicle(328.4, 196, 'sports', { yaw: SOUTH });
    GTP.Input.set('enter', true); GTP.game.advance(0.05); GTP.Input.set('enter', false); GTP.game.advance(0.6);
    const entered = p.inVehicle === v;
    GTP.Render.rig.yaw = SOUTH; GTP.Render.rig.snap();
    let insideCam = 0, pulled = 0, maxSpeed = 0, minDist = 1e9, maxDist = 0, impacts = 0;
    GTP.Events.on('vehicle:impact', () => { impacts++; });
    const pattern = [[1, 0], [1, 0], [1, 1], [1, 0], [1, -1], [1, -1], [1, 0], [1, 1], [1, 1], [1, 0], [1, -1], [1, 0]];
    for (let i = 0; i < 300; i++) {
      const pt = pattern[Math.floor(i / 25) % pattern.length];
      GTP.Input.set('forward', pt[0] > 0); GTP.Input.set('right', pt[1] > 0); GTP.Input.set('left', pt[1] < 0);
      if (i % 50 === 25) GTP.Input.setLook(60, 0);
      GTP.game.advance(1 / 60);
      const c = GTP.Render.camera.position;
      for (let k = 0; k < W.buildings.length; k++) { const b = W.buildings[k]; if (c.x > b.x && c.x < b.x + b.w && c.z > b.z && c.z < b.z + b.d && c.y > b.y && c.y < b.y + b.h) { insideCam++; break; } }
      if (GTP.Render.rig.pulled) pulled++;
      maxSpeed = Math.max(maxSpeed, Math.hypot(v.vx, v.vz));
      const d = Math.hypot(c.x - v.x, c.z - v.z); minDist = Math.min(minDist, d); maxDist = Math.max(maxDist, d);
      if (i % 60 === 59) GTP.game.render();
    }
    GTP.Input.set('forward', false); GTP.Input.set('right', false); GTP.Input.set('left', false);
    GTP.game.advance(0.3);
    return { entered, insideCam, pulled, maxSpeed, minDist, maxDist, impacts, fov: GTP.Render.camera.fov, pos: { x: +v.x.toFixed(1), z: +v.z.toFixed(1) }, district: GTP.World.districtAt(v.x, v.z).id };
  }, { SOUTH });
  console.log('  camera: ' + JSON.stringify(cam));
  t.assert(cam.entered && cam.maxSpeed > 10, 'drove downtown: ' + cam.maxSpeed);
  t.assert(cam.insideCam === 0, 'camera never inside a building AABB (' + cam.insideCam + ' of 300 steps)');
  t.assert(cam.minDist > 0.4 && cam.maxDist < 14, 'camera distance stays sane: ' + cam.minDist + '..' + cam.maxDist);

  // ---- screenshots ----
  // the nine vehicle classes in a row, by day
  await page.evaluate(() => {
    const p = GTP.game.player; if (p.inVehicle) p.exitVehicle();
    GTP.game.debug.setClock(14);
    const types = ['sedan', 'sports', 'suv', 'truck', 'van', 'cop', 'taxi', 'bus', 'bike'];
    // a dealer line-up along Goldplate Avenue, seen down the avenue from the east
    types.forEach((ty, i) => { const v = GTP.game.debug.spawnVehicle(200 + i * 6.5, 281, ty, { yaw: -Math.PI / 2 - 0.45, wrap: ty === 'van' ? 'pod' : null }); v.lights = false; });
    GTP.game.debug.teleport(190, 270);
    GTP.game.advance(0.5);
    GTP.game.debug.freeCam(246, 6.5, 268, 230, 0.6, 282);
  });
  await t.shot(page, 'actors_vehicles');
  await page.evaluate(() => { GTP.game.debug.freeCam(214, 6.5, 268, 202, 0.6, 282); });
  await t.shot(page, 'actors_vehicles_b');
  await page.evaluate(() => { GTP.game.debug.freeCam(236, 2.3, 289, 214, 0.9, 281); });
  await t.shot(page, 'actors_vehicles_close');
  await page.evaluate(() => { GTP.game.debug.freeCam(262, 2.3, 288, 244, 0.9, 281); });
  await t.shot(page, 'actors_vehicles_close2');
  // on foot at the quad by day: chase cam from behind, then from the front, close cam, first person
  await page.evaluate(() => {
    GTP.game.debug.followCam();
    const door = GTP.World.landmark('campus_quad').door;
    GTP.game.debug.teleport(door.x, door.z); GTP.game.player.yaw = 0; GTP.game.player.cameraMode = 'chase';
    GTP.Render.rig.yaw = 0; GTP.Render.rig.pitch = 0.2; GTP.Render.rig.snap(); GTP.game.advance(0.3);
  });
  await t.shot(page, 'actors_quad_day');
  await page.evaluate(() => { GTP.game.debug.teleport(110, 283); GTP.game.player.yaw = 0; GTP.Render.rig.yaw = Math.PI; GTP.Render.rig.pitch = 0.12; GTP.Render.rig.snap(); GTP.game.advance(0.05); });
  await t.shot(page, 'actors_player_front');
  // knocked flat by a car: the pose and the slide
  const knock = await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World;
    GTP.game.debug.teleport(150, 282); p.yaw = 0; p.hp = p.maxHp; GTP.game.advance(0.1);
    const v = GTP.game.debug.spawnVehicle(170, 282, 'suv', { yaw: Math.PI / 2 });
    const ped = GTP.game.debug.spawnPed(150, 284.5, null, 'civ'); ped.yaw = Math.PI;
    v.enter(ped, 0); v.throttle = 1;
    let hitAt = -1, maxTilt = 0, hp0 = p.hp;
    for (let i = 0; i < 80; i++) { GTP.game.advance(0.05); if (p.knockedDown && hitAt < 0) hitAt = i * 0.05; maxTilt = Math.max(maxTilt, Math.abs(p.tilt)); if (hitAt >= 0 && i * 0.05 > hitAt + 0.6) break; }
    v.throttle = 0; v.brake = 1;
    GTP.Render.rig.yaw = -Math.PI / 2 + 0.6; GTP.Render.rig.pitch = 0.35; GTP.Render.rig.snap(); GTP.game.advance(0.05);
    return { hitAt, knocked: p.knockedDown, tilt: +p.tilt.toFixed(2), maxTilt, hp: p.hp, hp0, pedInCar: ped.inVehicle === v, solid: W.solidAt(p.x, p.z, p.y + 0.5) };
  });
  console.log('  knock: ' + JSON.stringify(knock));
  await t.shot(page, 'actors_knockdown');
  t.assert(knock.hitAt >= 0 && knock.knocked && knock.maxTilt > 1.2 && knock.hp < knock.hp0 && knock.pedInCar && !knock.solid, 'a driven SUV knocks the player flat: ' + JSON.stringify(knock));
  await page.evaluate(() => { GTP.game.advance(3.5); GTP.Entities.byKind('vehicle').forEach((v) => { if (!v.hasPlayer()) v.destroy(); }); GTP.Entities.byKind('ped').forEach((e) => e.destroy()); GTP.game.advance(0.1); const door = GTP.World.landmark('campus_quad').door; GTP.game.debug.teleport(door.x, door.z); GTP.game.player.yaw = Math.PI; });
  await page.evaluate(() => { GTP.game.player.cameraMode = 'close'; GTP.Render.rig.yaw = 0; GTP.Render.rig.snap(); GTP.game.advance(0.3); });
  await t.shot(page, 'actors_close');
  await page.evaluate(() => { GTP.game.player.cameraMode = 'first'; GTP.Render.rig.yaw = 0; GTP.Render.rig.snap(); GTP.game.advance(0.3); });
  const fp = await page.evaluate(() => { GTP.game.render(); return { visible: GTP.game.player.mesh.visible, camY: GTP.Render.camera.position.y - GTP.game.player.y }; });
  await t.shot(page, 'actors_first_person');
  t.assert(!fp.visible && Math.abs(fp.camY - 1.6) < 0.1, 'first person hides the body at eye height: ' + JSON.stringify(fp));
  // the pod van at night on Goldplate Avenue with headlights
  const night = await page.evaluate(({ EAST }) => {
    const p = GTP.game.player; p.cameraMode = 'chase';
    GTP.game.debug.setClock(22);
    GTP.game.debug.teleport(230, 282); GTP.game.advance(0.1);
    const v = GTP.game.debug.spawnVehicle(232.4, 282, 'van', { yaw: EAST, wrap: 'pod', color: '#f2f2f2' });
    GTP.Input.set('enter', true); GTP.game.advance(0.05); GTP.Input.set('enter', false); GTP.game.advance(0.6);
    GTP.Render.rig.yaw = EAST; GTP.Render.rig.snap();
    GTP.Input.set('forward', true); GTP.game.advance(1.6); GTP.Input.set('forward', false); GTP.game.advance(0.2);
    GTP.Input.setLook(-210, 0); GTP.game.advance(0.05);   // rear-left quarter so the wrap shows
    GTP.game.render();
    const L = GTP.Render.lights;
    return { inVan: p.inVehicle === v, wrap: v.wrap, headlight: L.headlight.visible, owner: L.headlightOwner === v, headMat: v.mesh.children[0].material[3] === GTP.Render._vehicleMats().headOn };
  }, { EAST });
  console.log('  night: ' + JSON.stringify(night));
  await t.shot(page, 'actors_van_night');
  t.assert(night.inVan && night.wrap === 'pod' && night.headlight && night.owner && night.headMat, 'pod van at night with headlights: ' + JSON.stringify(night));
  const stats = await t.pixelStats(page);
  t.assert(stats.warm > 0.002 && stats.colors > 300, 'night van shot has lights: ' + JSON.stringify(stats));
  // the headlight spot visibly lights the road ahead: mean brightness of the road patch in front of the van, spot on vs off
  const beam = await page.evaluate(() => {
    const p = GTP.game.player, v = p.inVehicle, R = GTP.Render;
    GTP.Render.rig.yaw = -Math.PI / 2; GTP.Render.rig.snap(); GTP.game.advance(0.05);
    function patch() {
      GTP.game.render();
      const cv = document.getElementById('gl'), off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
      const c2 = off.getContext('2d'); c2.drawImage(cv, 0, 0);
      const a = v.localToWorld(0, v.cls.length / 2 + 6), s = R.worldToScreen(a.x, v.y + 0.05, a.z);
      const d = c2.getImageData(Math.round(s.sx) - 40, Math.round(s.sy) - 12, 80, 24).data;
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
      return sum / (d.length / 4) / 3;
    }
    const on = patch();
    const beamMesh = v.mesh.getObjectByName('beam'), inten = R.lights.headlight.intensity;
    R.lights.headlight.intensity = 0; beamMesh.visible = false; const offv = patch(); R.lights.headlight.intensity = inten; beamMesh.visible = true;
    return { on: +on.toFixed(1), off: +offv.toFixed(1) };
  });
  console.log('  beam: ' + JSON.stringify(beam));
  t.assert(beam.on > beam.off + 6, 'the headlight spot lights the road ahead: ' + JSON.stringify(beam));

  // v0.3 QA fixes in 06_entities: viaduct / barrier exits stay on the deck (QA-A-DRV-01/02), a wedge's tall face is a wall
  // (QA-A-DRV-08), the first-person headlight follows the car (QA-A-ENT-10), wheel sampling reuses its result (QAC-48)
  const qa = await page.evaluate(() => {
    const g = GTP.game, p = g.player, U = GTP.util, W = GTP.World, In = GTP.Input, out = {};
    if (p.inVehicle) { const o = p.inVehicle; o.vx = o.vz = 0; p.exitVehicle(); g.advance(0.1); o.destroy(); }
    const exitAt = (x, z, yaw) => { const v = g.debug.spawnVehicle(x, z, 'sedan', { yaw, y: 7 }); v.y = 7; g.debug.teleport(x, z, 7); v.enter(p, 0); g.advance(0.2); p.exitVehicle(); g.advance(0.3); const r = { y: +p.y.toFixed(2), swim: !!p.swimming }; v.destroy(); g.debug.teleport(300, 300); g.advance(0.1); return r; };
    out.viaduct = exitAt(424, 540, Math.PI); out.barrier = exitAt(177.2, 300, 0);
    const s = W.stuntRamps.find((q) => q.id === 'sj_01'), f = U.yawToDir(s.yaw);
    const v = g.debug.spawnVehicle(s.x + f.x * 14, s.z + f.z * 14, 'sedan', { yaw: U.dirToYaw(-f.x, -f.z) }); g.debug.teleport(v.x, v.z); v.enter(p, 0); g.advance(0.1);
    let hits = 0; const on = (e) => { if (e.vehicle === v && e.kind === 'wall') hits++; }; GTP.Events.on('vehicle:impact', on);
    p.cameraMode = 'first'; In.set('forward', true); let maxY = 0; for (let i = 0; i < 75; i++) { g.advance(1 / 30); maxY = Math.max(maxY, v.y); } In.set('forward', false);
    if (GTP.Events.off) GTP.Events.off('vehicle:impact', on);
    g.render(); const L = GTP.Render.lights.headlight;
    out.wedge = { maxY: +(maxY - s.y).toFixed(2), hits };
    out.fpHead = +Math.hypot(L.position.x - v.x, L.position.z - v.z).toFixed(1); out.bodyHidden = !v.mesh.visible;
    out.wheelReuse = v._sampleWheels() === v._sampleWheels();
    p.cameraMode = 'chase'; v.vx = v.vz = 0; g.advance(0.1); p.exitVehicle(); g.advance(0.1); v.destroy();
    return out;
  });
  console.log('  qa fixes: ' + JSON.stringify(qa));
  t.assert(qa.viaduct.y > 6 && !qa.viaduct.swim && qa.barrier.y > 6, 'stepping out on the Loop deck (viaduct, against a barrier) stays on the deck: ' + JSON.stringify(qa));
  t.assert(qa.wedge.maxY < 0.5 && qa.wedge.hits > 0, 'a stunt wedge\'s tall face stops a car with a wall impact: ' + JSON.stringify(qa.wedge));
  t.assert(qa.bodyHidden && qa.fpHead < 4, 'first-person headlight stays at the car nose with the body hidden: ' + JSON.stringify(qa));
  t.assert(qa.wheelReuse, 'Vehicle._sampleWheels reuses its result object');

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});

function GTP_wrap(a) { a = a % (Math.PI * 2); if (a > Math.PI) a -= Math.PI * 2; else if (a < -Math.PI) a += Math.PI * 2; return a; }
function GTP_T() { return { VOID: 0, ROAD: 1, SIDEWALK: 2, BUILDING: 3, GRASS: 4, WATER: 5, SAND: 6, PARKING: 7, PLAZA: 8, BRIDGE: 9, RAMP: 10, HIGHWAY: 11 }; }
