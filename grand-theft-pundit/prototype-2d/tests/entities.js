/* entities.js: ped movement + wall collision, enter/exit vehicles, driving, crashes,
 * vehicle vs vehicle, vehicle vs ped knockdown, burn + explode, despawn, screenshots. */
'use strict';
const H = require('./_harness');

H.run('entities', async (t) => {
  const { page, pageErrors, consoleErrors } = await t.openGame({ seed: 7 });
  const T = 32;

  // ---- (1) walk right for 2 s: x increases, y stable ------------------------------------
  const r1 = await page.evaluate(() => {
    const p = GTP.game.player;
    GTP.game.debug.teleport(40 * 32 + 16, 63 * 32 + 16); // main avenue, nothing in the way
    const x0 = p.x, y0 = p.y;
    GTP.Input.set('right', true); GTP.game.advance(2); GTP.Input.set('right', false);
    const out = { dx: p.x - x0, dy: p.y - y0, state: p.state, frame: p.animFrame(), angle: p.angle };
    GTP.game.advance(0.5);
    out.stopped = Math.abs(p.vx) + Math.abs(p.vy);
    out.idleState = p.state;
    return out;
  });
  t.assert(r1.dx > 125 && r1.dx < 145, 'walk 2 s should move ~140 px, got ' + r1.dx);
  t.assert(Math.abs(r1.dy) < 0.01, 'walking right must not drift in y: ' + r1.dy);
  t.assert(r1.state === 'walk' && r1.frame >= 0 && Math.abs(r1.angle) < 0.01, 'walk state/anim/facing ' + JSON.stringify(r1));
  t.assert(r1.stopped === 0 && r1.idleState === 'idle', 'player should come to rest ' + JSON.stringify(r1));

  // ---- (2) walk into the nearest building: stops at the wall, never enters a BUILDING tile --
  const r2 = await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World, T = GTP.C.TILE;
    // nearest building reachable in a straight line from the left
    let best = null, bd = Infinity;
    for (const b of W.buildings) {
      const sx = b.x - 70, sy = b.y + b.h / 2;
      if (W.solidAt(sx, sy) || W.solidAt(sx + 30, sy) || W.solidAt(sx + 55, sy)) continue;
      const d = GTP.util.dist(p.x, p.y, sx, sy);
      if (d < bd) { bd = d; best = { b, sx, sy }; }
    }
    GTP.game.debug.teleport(best.sx, best.sy);
    GTP.Input.set('right', true); GTP.Input.set('run', true);
    let solid = false, maxX = -1;
    for (let i = 0; i < 240; i++) { GTP.game.step(); if (W.tileAt(p.x, p.y) === W.T.BUILDING) solid = true; maxX = Math.max(maxX, p.x); }
    GTP.Input.set('right', false); GTP.Input.set('run', false);
    return { x: p.x, wall: best.b.x, solid, maxX, radius: p.radius, tile: W.tileAt(p.x, p.y) };
  });
  t.assert(!r2.solid, 'player entered a BUILDING tile');
  t.assert(r2.x < r2.wall && r2.x > r2.wall - r2.radius - 3, 'player should stop at the wall: ' + JSON.stringify(r2));
  t.assert(r2.maxX <= r2.wall - r2.radius + 0.5, 'player poked into the wall at some step: ' + JSON.stringify(r2));

  // ---- (3) spawn a car next to the player, press enter, drive forward 4 s ----------------
  const r3 = await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World;
    GTP.game.debug.teleport(36 * 32 + 16, 65 * 32 + 16); // east-bound lane of the main avenue
    const v = GTP.game.debug.spawnVehicle(p.x + 34, p.y, 'sedan');
    const out = { angle: v.angle, dist: v.edgeDistance(p.x, p.y) };
    GTP.Input.set('enter', true); GTP.game.step(); GTP.Input.set('enter', false);
    out.inCar = p.vehicle === v && v.driver === p && p.inVehicle === v;
    const x0 = v.x, y0 = v.y;
    GTP.Input.set('up', true); GTP.game.advance(4); GTP.Input.set('up', false);
    out.disp = GTP.util.dist(x0, y0, v.x, v.y); out.speed = v.speed; out.vy = v.vy;
    out.playerFollows = Math.abs(p.x - v.x) < 1 && Math.abs(p.y - v.y) < 1;
    out.cam = [GTP.Render.cam.x - v.x, GTP.Render.cam.y - v.y, GTP.Render.cam.zoom];
    out.onRoad = W.tileAt(v.x, v.y) === W.T.ROAD;
    out.drawn = !GTP.Entities.list.some((e) => e.kind === 'player' && !e.inVehicle);
    window.__car = v;
    return out;
  });
  t.assert(r3.inCar, 'pressing enter next to a car should put the player in it ' + JSON.stringify(r3));
  t.assert(r3.disp > 300 && r3.speed > 0, 'driving 4 s should move > 300 px with positive speed ' + JSON.stringify(r3));
  t.assert(Math.abs(r3.vy) < 5 && r3.onRoad, 'driving straight east should stay in the lane ' + JSON.stringify(r3));
  t.assert(r3.playerFollows, 'player rides along with the car');
  t.assert(r3.cam[0] > 60 && Math.abs(r3.cam[1]) < 30 && r3.cam[2] < 1, 'camera should lead ahead of a moving car and zoom out ' + JSON.stringify(r3.cam));

  // steering + handbrake: the car turns, and a handbrake turn produces lateral slip
  const r3b = await page.evaluate(() => {
    const v = window.__car, a0 = v.angle;
    GTP.Input.set('up', true); GTP.Input.set('right', true); GTP.game.advance(0.6);
    const turned = GTP.util.angleDiff(a0, v.angle);
    GTP.Input.set('action', true); GTP.game.advance(0.3);
    const slip = Math.abs(v.lateral);
    GTP.Input.set('action', false); GTP.Input.set('right', false); GTP.Input.set('up', false);
    GTP.game.advance(1.5);
    return { turned, slip, speed: v.speed, lateral: v.lateral };
  });
  t.assert(r3b.turned > 0.3, 'steering right should turn clockwise: ' + JSON.stringify(r3b));
  t.assert(r3b.slip > 20, 'handbrake turn should produce lateral slip: ' + JSON.stringify(r3b));

  // ---- (4) drive into a building at speed: damage > 0 and the car stops ---------------------
  const r4 = await page.evaluate(() => {
    const v = window.__car, W = GTP.World, p = GTP.game.player;
    // a building with a clear 220 px run below its bottom wall
    let pick = null;
    for (const b of W.buildings) {
      const cx = b.x + b.w / 2, y1 = b.y + b.h;
      let clear = true;
      for (let d = 10; d <= 240; d += 8) { if (W.solidAt(cx - 14, y1 + d) || W.solidAt(cx + 14, y1 + d)) { clear = false; break; } }
      if (clear) { pick = { b, cx, y1 }; break; }
    }
    v.x = pick.cx; v.y = pick.y1 + 220; v.angle = -Math.PI / 2; v.vx = v.vy = 0; v.speed = 0; v.steer = 0; v.angVel = 0;
    v.hp = v.maxHp; v.damage = 0; v.snap();
    GTP.Entities.hash.update(v); GTP.Render.snapCamera();
    GTP.Input.set('up', true);
    let maxSpeed = 0, inside = false, sparks = 0;
    for (let i = 0; i < 150; i++) {
      GTP.game.step();
      maxSpeed = Math.max(maxSpeed, Math.abs(v.speed));
      if (W.solidAt(v.x, v.y)) inside = true;
      sparks = Math.max(sparks, GTP.Render.fx.list.filter((f) => f.type === 'spark').length);
    }
    GTP.Input.set('up', false);
    GTP.game.advance(0.5);
    return { damage: v.damage, hp: v.hp, speed: Math.abs(v.speed), maxSpeed, inside, wall: pick.y1, y: v.y, sparks, shake: GTP.Render.cam.shake, crashes: p.stats.crashes };
  });
  t.assert(r4.maxSpeed > 150, 'car should have reached speed before the wall: ' + JSON.stringify(r4));
  t.assert(r4.damage > 0 && r4.hp < r4.damage + r4.hp, 'crash should damage the car: ' + JSON.stringify(r4));
  t.assert(r4.speed < 15, 'car should stop at the wall: ' + JSON.stringify(r4));
  t.assert(!r4.inside && r4.y > r4.wall + 10, 'car must never enter the building: ' + JSON.stringify(r4));
  t.assert(r4.sparks > 0 && r4.crashes > 0, 'crash should spark and count: ' + JSON.stringify(r4));

  // ---- vehicle vs ped: knockdown at speed, slide, get back up ----------------------------
  const r5 = await page.evaluate(() => {
    const v = window.__car, W = GTP.World;
    const lane = W.nearestRoadPoint(36 * 32 + 16, 65 * 32 + 16);
    v.x = lane.x; v.y = lane.y; v.angle = 0; v.vx = v.vy = 0; v.speed = 0; v.angVel = 0; v.snap(); GTP.Entities.hash.update(v);
    const ped = GTP.Entities.add(new GTP.Ped({ x: v.x + 190, y: v.y, role: 'civ' }));
    const px0 = ped.x, hp0 = ped.hp;
    GTP.Input.set('up', true);
    let knocked = false, speedAtHit = 0;
    for (let i = 0; i < 150; i++) { GTP.game.step(); if (ped.state === 'knocked' && !knocked) { knocked = true; speedAtHit = Math.abs(v.speed); } }
    GTP.Input.set('up', false); GTP.Input.set('down', true); GTP.game.advance(1.5); GTP.Input.set('down', false);
    const slid = ped.x - px0;
    GTP.game.advance(3);
    return { knocked, speedAtHit, slid, hp: ped.hp, hp0, alive: ped.alive, state: ped.state, z: ped.z, heat: GTP.AI.wanted.heat, pedsHit: GTP.game.player.stats.pedsHit };
  });
  t.assert(r5.knocked && r5.speedAtHit > 60, 'car should knock the ped down: ' + JSON.stringify(r5));
  t.assert(r5.slid > 20 && r5.hp < r5.hp0, 'knocked ped should slide and take damage: ' + JSON.stringify(r5));
  t.assert(!r5.alive || r5.state === 'idle', 'ped should get up (or stay down if dead): ' + JSON.stringify(r5));
  t.assert(r5.pedsHit === 1, 'hitting a ped is recorded in stats');

  // ---- vehicle vs vehicle: impulse moves the other car, both take damage -------------------
  const r6 = await page.evaluate(() => {
    const v = window.__car, W = GTP.World;
    const lane = W.nearestRoadPoint(40 * 32 + 16, 65 * 32 + 16);
    v.x = lane.x; v.y = lane.y; v.angle = 0; v.vx = v.vy = 0; v.speed = 0; v.angVel = 0; v.hp = v.maxHp; v.damage = 0; v.snap(); GTP.Entities.hash.update(v);
    const o = GTP.game.debug.spawnVehicle(v.x + 260, v.y + 6, 'sedan');
    o.angle = 0; o.snap();
    const ox0 = o.x;
    GTP.Input.set('up', true); GTP.game.advance(2.2); GTP.Input.set('up', false); GTP.game.advance(1);
    const out = { moved: o.x - ox0, dmgA: v.damage, dmgB: o.damage, overlap: v.edgeDistance(o.x, o.y), insideA: W.solidAt(v.x, v.y), insideB: W.solidAt(o.x, o.y) };
    GTP.Entities.remove(o);
    return out;
  });
  t.assert(r6.moved > 15, 'rammed car should be pushed forward: ' + JSON.stringify(r6));
  t.assert(r6.dmgA > 0 && r6.dmgB > 0, 'both cars take damage: ' + JSON.stringify(r6));
  t.assert(r6.overlap > -4 && !r6.insideA && !r6.insideB, 'cars must not interpenetrate or get pushed into walls: ' + JSON.stringify(r6));

  // ---- (6) exit the car: player outside, on a walkable tile, beside the door ---------------
  const r7 = await page.evaluate(() => {
    const v = window.__car, p = GTP.game.player, W = GTP.World;
    GTP.game.advance(0.5);
    GTP.Input.set('enter', true); GTP.game.step(); GTP.Input.set('enter', false);
    const out = { vehicle: p.vehicle, inVehicle: p.inVehicle, driver: v.driver, dist: v.edgeDistance(p.x, p.y), solid: W.solidAt(p.x, p.y), tile: W.tileAt(p.x, p.y) };
    GTP.Input.set('left', true); GTP.game.advance(0.5); GTP.Input.set('left', false);
    out.walks = p.vx !== 0 || p.x !== out.px;
    return out;
  });
  t.assert(r7.vehicle === null && r7.inVehicle === null && r7.driver === null, 'player should be out of the car ' + JSON.stringify(r7));
  t.assert(!r7.solid && r7.dist > 0 && r7.dist < 30, 'player should stand beside the door on open ground ' + JSON.stringify(r7));

  // ---- (5) hp -> 0 by direct set: smoke + fire, explosion after 3 s, wreck, area damage -----
  const r8 = await page.evaluate(() => {
    const v = window.__car, p = GTP.game.player;
    // park the player 70 px away (inside the blast radius, outside the car)
    GTP.game.debug.teleport(v.x - 70, v.y - 40);
    const bystander = GTP.Entities.add(new GTP.Ped({ x: v.x + 60, y: v.y, role: 'civ' }));
    const other = GTP.game.debug.spawnVehicle(v.x + 50, v.y + 4, 'sedan'); // parked bumper to bumper
    const hp0 = p.hp;
    v.hp = 0;
    GTP.game.advance(1);
    const out = { burning: v.burning, fire: GTP.Render.fx.list.some((f) => f.type === 'fire'), smoke: GTP.Render.fx.list.some((f) => f.type === 'smoke'), alive1: v.alive, explodedEarly: v.exploded };
    let n = 0; while (!v.exploded && n < 240) { GTP.game.step(); n++; }
    out.explodeStep = n;
    out.ring = GTP.Render.fx.list.some((f) => f.type === 'ring' || f.type === 'explosion'); out.shake = GTP.Render.cam.shake;
    GTP.game.advance(1);
    out.exploded = v.exploded; out.wreck = v.wreck; out.removed = GTP.Entities.list.indexOf(v) < 0;
    out.playerHurt = hp0 - p.hp; out.playerAlive = p.alive; out.state = GTP.game.state;
    out.bystander = bystander.state; out.bystanderHp = bystander.hp;
    out.otherDamage = other.damage; out.otherBurning = other.burning;
    out.headlights = v.headlights;
    GTP.game.advance(4);
    out.otherExploded = other.exploded;
    out.wreckStill = GTP.Entities.list.indexOf(v) >= 0 && v.wreck;
    return out;
  });
  t.assert(r8.burning && r8.fire && r8.smoke && !r8.explodedEarly, 'hp 0 should burn with fire + smoke before exploding ' + JSON.stringify(r8));
  t.assert(r8.exploded && (r8.wreck || r8.removed), 'car should explode after 3 s and become a wreck ' + JSON.stringify(r8));
  t.assert(r8.explodeStep > 100 && r8.explodeStep < 130, 'explosion should come 3 s after ignition: step ' + r8.explodeStep);
  t.assert(r8.ring && r8.shake > 0, 'explosion should draw a ring and shake the camera ' + JSON.stringify(r8));
  t.assert(r8.playerHurt > 0 && r8.playerAlive && r8.state === 'playing', 'nearby player takes area damage but survives ' + JSON.stringify(r8));
  t.assert(r8.bystander === 'knocked' || r8.bystander === 'dead', 'bystander should be blown over ' + JSON.stringify(r8));
  t.assert(r8.otherDamage > 0 && r8.otherBurning && r8.otherExploded, 'a car next to the blast catches fire and chain-explodes ' + JSON.stringify(r8));
  t.assert(r8.wreckStill && r8.headlights === false, 'wreck lingers as an obstacle without lights ' + JSON.stringify(r8));

  // ---- a wreck is a solid obstacle; a fresh car can be entered and driven again ---------------
  const r9 = await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World, wreck = window.__car;
    const lane = W.nearestRoadPoint(44 * 32 + 16, 65 * 32 + 16);
    GTP.game.debug.teleport(lane.x, lane.y);
    const v = GTP.game.debug.spawnVehicle(lane.x + 30, lane.y, 'sports');
    GTP.Input.set('enter', true); GTP.game.step(); GTP.Input.set('enter', false);
    wreck.x = v.x + 200; wreck.y = v.y; wreck.angle = Math.PI / 2; wreck.snap(); GTP.Entities.hash.update(wreck);
    GTP.Input.set('up', true); GTP.game.advance(2.5); GTP.Input.set('up', false); GTP.game.advance(0.5);
    const out = { inCar: p.vehicle === v, passed: v.x > wreck.x, speed: Math.abs(v.speed), wreckMoved: wreck.x !== v.x + 200 || wreck.y !== v.y, dmg: v.damage, stuck: W.solidAt(v.x, v.y) };
    window.__car2 = v;
    return out;
  });
  t.assert(r9.inCar && !r9.passed && r9.speed < 15 && r9.dmg > 0 && !r9.stuck, 'a wreck should block the road: ' + JSON.stringify(r9));

  // ---- despawn beyond ACTIVE_RADIUS for non-persistent entities ----------------------------
  const r10 = await page.evaluate(() => {
    const p = GTP.game.player;
    const far = GTP.Entities.add(new GTP.Ped({ x: p.x + GTP.C.ACTIVE_RADIUS + 400, y: p.y }));
    const kept = GTP.Entities.add(new GTP.Ped({ x: p.x + GTP.C.ACTIVE_RADIUS + 400, y: p.y + 10, persistent: true }));
    const nearPed = GTP.Entities.add(new GTP.Ped({ x: p.x + 200, y: p.y }));
    GTP.game.advance(0.1);
    const out = { far: GTP.Entities.list.indexOf(far) >= 0, kept: GTP.Entities.list.indexOf(kept) >= 0, near: GTP.Entities.list.indexOf(nearPed) >= 0, car: GTP.Entities.list.indexOf(window.__car2) >= 0 };
    GTP.Entities.remove(kept); GTP.Entities.remove(nearPed);
    return out;
  });
  t.assert(!r10.far && r10.kept && r10.near && r10.car, 'despawn rules ' + JSON.stringify(r10));

  // ---- free drive with steering for 10 s: never stuck in a wall, always finite ---------------
  const r11 = await page.evaluate(() => {
    const v = window.__car2, W = GTP.World, p = GTP.game.player;
    let bad = 0, maxSpd = 0;
    const seq = [['up', 'left'], ['up'], ['up', 'right'], ['up', 'action'], ['down'], ['up', 'right'], ['up'], ['up', 'left', 'action']];
    for (let k = 0; k < seq.length; k++) {
      for (const a of seq[k]) GTP.Input.set(a, true);
      for (let i = 0; i < 75; i++) {
        GTP.game.step();
        if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.angle) || W.solidAt(v.x, v.y)) bad++;
        maxSpd = Math.max(maxSpd, Math.abs(v.speed));
      }
      for (const a of seq[k]) GTP.Input.set(a, false);
    }
    return { bad, maxSpd, inCar: p.vehicle === v, marks: GTP.Render.fx.marks.length, errors: GTP.errors.length };
  });
  t.assert(r11.bad === 0 && r11.inCar && r11.maxSpd > 100, 'free driving should never wedge the car ' + JSON.stringify(r11));

  // ---- screenshots: driving at night and by day, plus a sprite sheet ---------------------------
  await page.evaluate(() => {
    const v = window.__car2, p = GTP.game.player, W = GTP.World;
    const lane = W.nearestRoadPoint(40 * 32 + 16, 65 * 32 + 16);
    GTP.Entities.byKind('vehicle').filter((w) => w.wreck).forEach((w) => GTP.Entities.remove(w)); // wrecks from the explosion scenario sit in this lane
    v.exit(p);
    v.x = lane.x; v.y = lane.y; v.angle = 0; v.vx = v.vy = 0; v.speed = 0; v.hp = v.maxHp; v.damage = 0; v.snap(); GTP.Entities.hash.update(v);
    GTP.game.debug.teleport(lane.x - 30, lane.y);
    GTP.Input.set('enter', true); GTP.game.step(); GTP.Input.set('enter', false);
    // oncoming traffic in the west-bound lanes, a parked damaged car, peds on the sidewalk
    const types = ['taxi', 'cop', 'bus', 'truck', 'van', 'suv', 'sports', 'bike'];
    types.forEach((ty, i) => { const c = GTP.game.debug.spawnVehicle(lane.x + 140 + i * 120, lane.y - (i % 2 ? 64 : 96), ty); c.angle = Math.PI; if (ty === 'cop') c.siren = true; c.snap(); });
    const parked = GTP.game.debug.spawnVehicle(lane.x + 700, lane.y + 2, 'sedan'); parked.angle = 0; parked.hp = parked.maxHp * 0.3; parked.damage = parked.maxHp * 0.7; parked.snap();
    const roles = ['civ', 'cop', 'thug', 'protester', 'npc', 'civ', 'civ'];
    roles.forEach((r, i) => { const ped = GTP.Entities.add(new GTP.Ped({ x: lane.x + 80 + i * 70, y: lane.y + 48, role: r })); ped.angle = i % 2 ? 0 : Math.PI; ped.setIntent(i % 2 ? 0.6 : -0.6, 0, false); });
    GTP.Entities.add(new GTP.Pickup({ x: lane.x + 60, y: lane.y + 50, pickupType: 'health' }));
    GTP.game.debug.setClock(23);
    GTP.Input.set('up', true); GTP.game.advance(1.6); GTP.Input.set('up', false);
    GTP.Input.set('down', true); GTP.game.advance(0.15);
    GTP.game.render();
  });
  const night = await t.screenshot(page, 'entities_night');
  await page.evaluate(() => { GTP.Input.set('down', false); GTP.game.debug.setClock(12); GTP.Input.set('up', true); GTP.game.advance(0.5); GTP.Input.set('up', false); GTP.Input.set('down', true); GTP.game.advance(0.15); GTP.Input.set('down', false); GTP.game.render(); });
  const day = await t.screenshot(page, 'entities_day');
  // close-up sprite sheet: every vehicle class + ped roles + knocked pose, zoomed 3x
  await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World, lane = W.nearestRoadPoint(48 * 32 + 16, 48 * 32 + 16);
    const v = p.vehicle; if (v) v.exit(p);
    GTP.game.debug.teleport(lane.x, lane.y + 90);
    const types = ['sedan', 'sports', 'suv', 'truck', 'van', 'cop', 'taxi', 'bus', 'bike'];
    types.forEach((ty, i) => { const c = GTP.game.debug.spawnVehicle(lane.x - 180 + (i % 5) * 90, lane.y - 120 + Math.floor(i / 5) * 60, ty); c.angle = 0; if (ty === 'cop') c.siren = true; if (i === 1) c.braking = true; c.snap(); });
    const wreck = GTP.game.debug.spawnVehicle(lane.x + 190, lane.y - 60, 'sedan'); wreck.angle = 0.4; wreck.hp = 0; wreck.snap();
    const roles = ['civ', 'cop', 'thug', 'protester', 'npc', 'civ', 'civ', 'civ'];
    roles.forEach((r, i) => { const ped = GTP.Entities.add(new GTP.Ped({ x: lane.x - 180 + i * 50, y: lane.y + 30, role: r })); ped.angle = i * 0.78; if (i > 3) { ped.walkPhase = i * 0.25; ped.moving = true; } });
    const down = GTP.Entities.add(new GTP.Ped({ x: lane.x + 180, y: lane.y + 40, role: 'civ' })); down.knockDown(0.1, 0, 0, null);
    ['cash', 'health', 'armor', 'weapon', 'mission'].forEach((pt, i) => GTP.Entities.add(new GTP.Pickup({ x: lane.x - 160 + i * 40, y: lane.y + 80, pickupType: pt })));
    GTP.game.advance(0.05);
    GTP.game.debug.freeCam(lane.x, lane.y - 10, 3);
    GTP.game.render();
  });
  const sheet = await t.screenshot(page, 'entities_sprites');
  await page.evaluate(() => GTP.game.debug.followCam());
  console.log('  night: ' + night + '\n  day: ' + day + '\n  sprites: ' + sheet);

  const errs = await t.gameErrors(page);
  t.assert(errs.length === 0, 'GTP.errors:\n' + errs.join('\n'));
  t.assert(pageErrors.length === 0, 'page errors:\n' + pageErrors.join('\n'));
  t.assert(consoleErrors.length === 0, 'console errors:\n' + consoleErrors.join('\n'));
  void T;
});
