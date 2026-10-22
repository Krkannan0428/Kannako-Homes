/* ai.js: the spawner, ped brains, traffic, police and the wanted system (07_ai).
 *  1 population after 10 s (peds >= 40, vehicles >= 20, nobody inside a building, no NaN)
 *  2 traffic: 20 moving cars over 10 s, >= 80% advance > 30 m, all stay on road tiles
 *  3 crosswalks: no ped on a non-crosswalk road tile for more than 2 s
 *  4 wanted 2: cops spawn and close in       5 decay: 1 star, 300 m away behind buildings, 30 s -> 0
 *  6 busted: a cop 1 m away -> state busted after 2.2 s + 'busted' event, then the precinct respawn and the capped fine
 *  7 (a fresh page) no bust while sprinting with a cop at the shoulder; the landmark residents: the doorman (post, facing the
 *    street, turns and greets, removed far away and back, flees when hurt) and Merle at the harbor store (clear of the green
 *    light; a cutscene casting Merle reuses him)
 *  8 (v0.3, a fresh page) civilians cower at an aimed gun and run when it leaves; cops flank a player in cover; the
 *    helicopter's gunner shoots at five stars; race legs through a building get road corners; motorcycles in traffic;
 *    the HOA patrols keep off the strand's 'hoa' tag
 * Screenshots in tests/out: ai_avenue.png, ai_chase.png, ai_heli_night.png, ai_residents.png (look at them). */
'use strict';
const H = require('./_harness');

H.run('ai', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;

  // ---- 1. population ----
  const pop = await page.evaluate(() => {
    GTP.game.advance(10);
    const W = GTP.World, E = GTP.Entities;
    let peds = 0, vehicles = 0, inside = 0, nan = 0, drivers = 0;
    E.list.forEach((e) => {
      if (e.removed) return;
      if (!isFinite(e.x) || !isFinite(e.z) || !isFinite(e.y) || !isFinite(e.yaw)) nan++;
      if (e.kind === 'ped' && e.alive && !e.inVehicle) peds++;
      if (e.kind === 'ped' && e.inVehicle) drivers++;
      if (e.kind === 'vehicle') vehicles++;
      if ((e.kind === 'ped' && !e.inVehicle) || e.kind === 'vehicle') {
        for (const b of W.buildings) if (e.x > b.x + 0.05 && e.x < b.x + b.w - 0.05 && e.z > b.z + 0.05 && e.z < b.z + b.d - 0.05 && e.y < b.y + b.h - 0.5) { inside++; break; }
      }
    });
    return { peds, vehicles, drivers, inside, nan, counts: GTP.AI.debug.counts(), ms: GTP.AI.stats.ms, errors: GTP.errors.length };
  });
  console.log('  population: ' + JSON.stringify(pop));
  t.assert(pop.peds >= 40, 'peds >= 40: ' + pop.peds);
  t.assert(pop.vehicles >= 20, 'vehicles >= 20: ' + pop.vehicles);
  t.assert(pop.inside === 0, 'no entity inside a building: ' + pop.inside);
  t.assert(pop.nan === 0, 'no NaN positions');

  // ---- 2. traffic flows and stays on the road ----
  const traffic = await page.evaluate(() => {
    const W = GTP.World, T = W.T, E = GTP.Entities, TILE = GTP.C.TILE, p = GTP.game.player;
    function onRoad(v) {
      const tx = Math.floor(v.x / TILE), tz = Math.floor(v.z / TILE); if (!W.inBounds(tx, tz)) return false;
      const i = tz * W.w + tx, tt = W.tiles[i];
      if (W.deck[i] && v.y > 4 && tt !== T.RAMP) return true;
      return tt === T.ROAD || tt === T.BRIDGE || tt === T.RAMP;
    }
    const sample = E.list.filter((v) => v.kind === 'vehicle' && v.ai && v.ai.kind === 'traffic' && v.driver && v.speed > 1.5 && !(W.metaAt(Math.floor(v.x / TILE), Math.floor(v.z / TILE)) & W.M.DEAD) && Math.hypot(v.x - p.x, v.z - p.z) < 185).slice(0, 20);
    const rec = sample.map((v) => ({ id: v.id, type: v.type, x: v.x, z: v.z, dist: 0, offRoad: 0, removed: false, stops: 0 }));
    for (let s = 0; s < 10; s++) {
      GTP.game.advance(1);
      sample.forEach((v, k) => {
        const r = rec[k]; if (v.removed) { r.removed = true; return; }
        r.dist += Math.hypot(v.x - r.x, v.z - r.z); r.x = v.x; r.z = v.z;
        if (!onRoad(v)) { r.offRoad++; r.where = [+v.x.toFixed(1), +v.z.toFixed(1), W.tileAt(v.x, v.z), v.ai.plan ? v.ai.plan.kind : null]; }
        if (v.speed < 0.3) r.stops++;
      });
    }
    const live = rec.filter((r) => !r.removed);
    const offEnd = live.filter((r) => !onRoad(sample[rec.indexOf(r)]));
    return { n: rec.length, live: live.length, moved: live.filter((r) => r.dist > 30).length, offRoad: live.filter((r) => r.offRoad > 0), offLong: live.filter((r) => r.offRoad > 3), offEnd: offEnd.length, dists: live.map((r) => +r.dist.toFixed(0)), stops: live.map((r) => r.stops), vehicles: GTP.AI.debug.vehicles().filter((v) => v.kind === 'traffic' && v.stuck > 1) };
  });
  console.log('  traffic: ' + JSON.stringify(traffic));
  t.assert(traffic.n >= 12, 'sampled at least 12 moving cars: ' + traffic.n);
  t.assert(traffic.moved >= Math.ceil(traffic.live * 0.8), '>= 80% advanced > 30 m: ' + traffic.moved + '/' + traffic.live);
  // a three-point turn at a dead end or a wide right turn may clip the kerb for a moment; nobody parks on the pavement
  t.assert(traffic.offLong.length === 0 && traffic.offEnd === 0, 'no sampled car left the road for more than 3 s or ended off it: ' + JSON.stringify(traffic.offRoad));

  // ---- 3. peds use crosswalks ----
  const cross = await page.evaluate(() => {
    const W = GTP.World, T = W.T, M = W.M, E = GTP.Entities, TILE = GTP.C.TILE;
    const onRoadT = new Map(); let worst = 0, worstPed = null, crossings = 0;
    for (let s = 0; s < 48; s++) {
      GTP.game.advance(0.25);
      E.list.forEach((e) => {
        if (e.kind !== 'ped' || e.inVehicle || !e.alive || e.knockedDown || e.removed) return;
        const tx = Math.floor(e.x / TILE), tz = Math.floor(e.z / TILE), tt = W.tile(tx, tz), m = W.metaAt(tx, tz);
        const bad = tt === T.ROAD && !(m & M.CROSSWALK);
        if (tt === T.ROAD && (m & M.CROSSWALK)) crossings++;
        const cur = bad ? (onRoadT.get(e.id) || 0) + 0.25 : 0;
        onRoadT.set(e.id, cur);
        if (cur > worst) { worst = cur; worstPed = { id: e.id, role: e.role, mode: e.ai ? e.ai.mode : null, x: +e.x.toFixed(1), z: +e.z.toFixed(1) }; }
      });
    }
    return { worst, worstPed, crossings };
  });
  console.log('  crosswalks: ' + JSON.stringify(cross));
  t.assert(cross.worst <= 2, 'no ped on a non-crosswalk road tile for more than 2 s: ' + JSON.stringify(cross));

  // ---- 4. wanted 2: cops come ----
  const chase = await page.evaluate(() => {
    const p = GTP.game.player;
    GTP.game.debug.setWanted(2);
    const samples = [];
    let busted = false; GTP.Events.on('busted', () => { busted = true; });
    for (let s = 0; s < 8; s++) { GTP.game.advance(1); const c = GTP.AI.debug.nearestCop(); samples.push(c ? c.d : null); if (GTP.game.state !== 'playing') break; }
    const counts = GTP.AI.debug.counts();
    const out = { samples, counts, busted, state: GTP.game.state, wanted: p.wanted };
    if (GTP.game.state === 'busted') GTP.game.advance(3.5);
    GTP.AI.wanted.clear(); GTP.game.advance(0.5);
    out.after = GTP.game.state;
    return out;
  });
  console.log('  wanted 2: ' + JSON.stringify(chase));
  t.assert(chase.counts.foot + chase.counts.cruisers > 0, 'cops spawned: ' + JSON.stringify(chase.counts));
  const first = chase.samples.find((d) => d != null), last = chase.samples.filter((d) => d != null).slice(-1)[0];
  t.assert(first != null && (last < first || chase.busted), 'the nearest cop closed in: ' + JSON.stringify(chase.samples));
  t.assert(chase.after === 'playing', 'back to playing: ' + chase.after);

  // ---- 5. decay out of sight ----
  const decay = await page.evaluate(() => {
    const W = GTP.World, p = GTP.game.player;
    const door = W.landmark('campus_quad').door;
    GTP.game.debug.teleport(door.x, door.z); GTP.game.advance(0.2);
    GTP.game.debug.setWanted(1);
    const money0 = p.money;
    // the marina: 360 m away, downtown's towers in between, no beat cops on its sidewalks
    const far = W.nearestSidewalkPoint(400, 500);
    GTP.game.debug.teleport(far.x, far.z);
    const d0 = Math.hypot(far.x - door.x, far.z - door.z);
    const trace = []; let states = new Set();
    for (let s = 0; s < 30; s++) { GTP.game.advance(1); states.add(GTP.game.state); if (s % 5 === 4) trace.push([p.wanted, +GTP.AI.wanted.heat.toFixed(1), GTP.AI.debug.counts().sinceSeen]); }
    return { d0: +d0.toFixed(0), wanted: p.wanted, heat: GTP.AI.wanted.heat, trace, district: W.districtAt(p.x, p.z).id, states: Array.from(states), money: p.money, money0 };
  });
  console.log('  decay: ' + JSON.stringify(decay));
  t.assert(decay.d0 > 250, 'teleported far: ' + decay.d0);
  t.assert(decay.states.length === 1 && decay.states[0] === 'playing' && decay.money === decay.money0, 'no bust while hiding: ' + JSON.stringify(decay));
  t.assert(decay.wanted === 0, 'wanted decayed to 0 out of sight: ' + JSON.stringify(decay));

  // ---- 6. busted ----
  const bust = await page.evaluate(() => {
    const W = GTP.World, p = GTP.game.player;
    const door = W.landmark('campus_quad').door;
    GTP.game.debug.teleport(door.x, door.z); GTP.game.advance(0.2);
    const money0 = p.money;
    GTP.game.debug.setWanted(1);
    const cop = GTP.game.debug.spawnPed(p.x + 1, p.z, null, 'cop');
    let ev = null; GTP.Events.on('busted', (e) => { ev = { level: e.level, cop: !!e.cop }; });
    let bustedAt = -1;
    for (let s = 0; s < 12; s++) { GTP.game.advance(0.25); if (GTP.game.state === 'busted' && bustedAt < 0) bustedAt = (s + 1) * 0.25; }
    const out = { state: GTP.game.state, ev, bustedAt, copLine: cop.line, control: p.controlEnabled };
    GTP.game.advance(3.5);
    const hq = W.landmark('police_hq').door;
    out.after = { state: GTP.game.state, wanted: p.wanted, money: p.money, money0, dHQ: +Math.hypot(p.x - hq.x, p.z - hq.z).toFixed(1), control: p.controlEnabled };
    return out;
  });
  console.log('  busted: ' + JSON.stringify(bust));
  // GDD_EXPANSION 6.9: 2.2 s within reach; the fine is $500 at one star, never over 15% of the cash
  t.assert(bust.state === 'busted' && bust.ev && bust.bustedAt >= 2 && bust.bustedAt <= 3, 'busted after 2.2 s in reach with the event: ' + JSON.stringify(bust));
  t.assert(bust.after.state === 'playing' && bust.after.wanted === 0 && bust.after.money === bust.after.money0 - Math.min(500, Math.floor(bust.after.money0 * 0.15)) && bust.after.dHQ < 6, 'respawned at the precinct, fined: ' + JSON.stringify(bust.after));

  // ---- screenshots ----
  // a busy downtown avenue by day, chase cam on foot
  await page.evaluate(() => {
    const W = GTP.World, p = GTP.game.player;
    GTP.game.debug.setClock(14);
    // the north sidewalk of Goldplate Avenue, looking east down the avenue
    const sp = W.nearestSidewalkPoint(300, 270);
    GTP.game.debug.teleport(sp.x, sp.z); p.yaw = -Math.PI / 2;
    GTP.Render.rig.yaw = -Math.PI / 2; GTP.Render.rig.pitch = 0.16; GTP.Render.rig.snap();
    GTP.game.advance(12);
    GTP.Render.rig.yaw = -Math.PI / 2 - 0.3; GTP.Render.rig.snap(); GTP.game.advance(0.05);
  });
  await t.shot(page, 'ai_avenue');
  const aveStats = await page.evaluate(() => { const c = GTP.AI.debug.counts(); const near = GTP.Entities.near(GTP.game.player.x, GTP.game.player.z, 60); return { counts: c, nearPeds: near.filter((e) => e.kind === 'ped' && !e.inVehicle).length, nearCars: near.filter((e) => e.kind === 'vehicle').length }; });
  console.log('  avenue: ' + JSON.stringify(aveStats));

  // a three-star chase: cruisers behind, a roadblock ahead
  const chase3 = await page.evaluate(() => {
    const p = GTP.game.player;
    GTP.game.debug.teleport(236, 281); GTP.game.advance(0.1);
    const v = GTP.game.debug.spawnVehicle(238.4, 282, 'sedan', { yaw: -Math.PI / 2, color: '#e8b53a' });
    GTP.Input.set('enter', true); GTP.game.advance(0.05); GTP.Input.set('enter', false); GTP.game.advance(0.6);
    GTP.Render.rig.yaw = -Math.PI / 2; GTP.Render.rig.snap();
    GTP.game.debug.setWanted(3);
    GTP.Input.set('forward', true);
    let rb = null; GTP.Events.on('roadblock', (e) => { rb = e; });
    for (let s = 0; s < 14; s++) { GTP.game.advance(0.5); if (v.speed > 14) GTP.Input.set('forward', false); else GTP.Input.set('forward', true); }
    GTP.Input.set('forward', false);
    GTP.game.advance(0.5);
    const c = GTP.AI.debug.counts();
    return { inCar: p.inVehicle === v, counts: c, roadblock: rb, speed: +v.speed.toFixed(1), x: +v.x.toFixed(0), z: +v.z.toFixed(0), cops: GTP.AI.debug.cops().slice(0, 6), cars: GTP.AI.debug.vehicles().filter((q) => q.kind === 'cop' || q.kind === 'roadblock') };
  });
  console.log('  chase 3: ' + JSON.stringify(chase3));
  await t.shot(page, 'ai_chase');
  t.assert(chase3.counts.cruisers >= 1, 'cruisers in pursuit at three stars: ' + JSON.stringify(chase3.counts));
  t.assert(chase3.roadblock, 'a roadblock was placed ahead');

  // five stars at night: the helicopter's spotlight
  const heli = await page.evaluate(() => {
    const p = GTP.game.player;
    GTP.game.debug.setClock(22.5);
    GTP.game.debug.setWanted(5);
    GTP.game.advance(6);
    const h = GTP.AI.police.heli;
    const out = { heli: !!h, y: h ? +h.y.toFixed(1) : null, d: h ? +Math.hypot(h.x - p.x, h.z - p.z).toFixed(1) : null, sees: h ? h.sees : null, counts: GTP.AI.debug.counts() };
    if (h) {
      // a camera 26 m off the player toward the heli's side; where the chase ends depends on the whole city's state,
      // so when a building blocks that line of sight the shot is taken from high above the player instead
      // (the spotlight pool on the street is the point of the picture, and the air above a road is always clear)
      const dx = p.x - h.x, dz = p.z - h.z, l = Math.hypot(dx, dz) || 1;
      const cx = p.x - dx / l * 26 + dz / l * 14, cy = p.y + 9, cz = p.z - dz / l * 26 - dx / l * 14;
      const ox = p.x, oy = p.y + 1.5, oz = p.z, vx = cx - ox, vy = cy - oy, vz = cz - oz, vl = Math.hypot(vx, vy, vz) || 1;
      const hit = GTP.World.raycastBuildings(ox, oy, oz, vx / vl, vy / vl, vz / vl, vl + 1);
      if (hit) GTP.game.debug.freeCam(p.x - dx / l * 7, p.y + 26, p.z - dz / l * 7, p.x, p.y, p.z);
      else GTP.game.debug.freeCam(cx, cy, cz, (p.x + h.x) / 2, (p.y + h.y) / 2 - 4, (p.z + h.z) / 2);
    }
    return out;
  });
  console.log('  heli: ' + JSON.stringify(heli));
  await t.shot(page, 'ai_heli_night');
  t.assert(heli.heli && heli.y > 20, 'the helicopter is up at five stars: ' + JSON.stringify(heli));
  const stats = await t.pixelStats(page);
  t.assert(stats.colors > 200, 'night heli shot is not monochrome: ' + JSON.stringify(stats));

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
  await page.close();

  // ---- the landmark residents (World landmark.npcs): the club's doorman and Merle at every Both Sides Arms ----
  const ctx2 = await t.boot({ seed: 7 });
  const p2 = ctx2.page;
  // a sprinting player slips the hand: a cop kept at arm's reach for 3 s does not bust while the player runs flat out
  const sprint = await p2.evaluate(() => {
    // down the open runway (nothing to run into), the camera behind the player facing west
    const W = GTP.World, p = GTP.game.player, rw = W.landmark('airport_runway'), e = rw.points.east, w = rw.points.west;
    GTP.game.debug.teleport(e.x, e.z); GTP.game.advance(0.2);
    const yaw = GTP.util.dirToYaw(w.x - e.x, w.z - e.z); p.yaw = yaw; GTP.Render.rig.yaw = yaw; GTP.Render.rig.pitch = 0.2; GTP.Render.rig.snap(); GTP.game.advance(0.05);
    GTP.game.debug.setWanted(1);
    const cop = GTP.game.debug.spawnPed(p.x + 1, p.z, null, 'cop');
    let busted = false; const on = () => { busted = true; }; GTP.Events.on('busted', on);
    GTP.Input.set('forward', true); GTP.Input.set('run', true);
    let ran = 0;
    for (let s = 0; s < 36; s++) {
      GTP.game.advance(1 / 12); ran = Math.max(ran, Math.hypot(p.vx, p.vz));
      const f = GTP.util.yawToDir(p.yaw); cop.x = p.x - f.x * 0.9; cop.z = p.z - f.z * 0.9; cop.y = p.y;   // the cop at his shoulder all the way
      if (cop._sh) GTP.Entities.hash.update(cop);
    }
    GTP.Input.set('forward', false); GTP.Input.set('run', false);
    const whileRunning = busted;
    GTP.Events.off('busted', on);
    GTP.AI.wanted.clear(); cop.destroy(); GTP.game.advance(0.3);
    return { whileRunning, ran: +ran.toFixed(1), state: GTP.game.state };
  });
  console.log('  sprint: ' + JSON.stringify(sprint));
  t.assert(!sprint.whileRunning && sprint.ran > 4 && sprint.state === 'playing', 'no bust while sprinting with a cop at the shoulder: ' + JSON.stringify(sprint));
  const res = await p2.evaluate(() => {
    const W = GTP.World, AI = GTP.AI, p = GTP.game.player, U = GTP.util, out = {};
    out.slots = AI.residents.list().map((s) => s.landmark + ':' + s.role);
    // the doorman: spawned on approach, at his post, turns to a player on foot and greets him
    const club = W.landmark('heirloom_club'), d = club.door;
    GTP.game.debug.teleport(d.x, d.z + 60); GTP.game.advance(1);
    const slot = () => AI.residents.list().find((s) => s.landmark === 'heirloom_club' && s.role === 'doorman');
    const s0 = slot();
    out.spawned = !!s0.ped; out.atPost = s0.ped ? +Math.hypot(s0.ped.x - s0.x, s0.ped.z - s0.z).toFixed(2) : null;
    out.brain = s0.ped && s0.ped.ai.mission; out.role = s0.ped && s0.ped.role; out.look = s0.ped && s0.ped.look && s0.ped.look.tie;
    // left alone he faces the street: his forward points away from the club's building
    const b = club.building, f = U.yawToDir(s0.ped.yaw), ox = s0.ped.x - (b.x + b.w / 2), oz = s0.ped.z - (b.z + b.d / 2), ol = Math.hypot(ox, oz) || 1;
    out.outward = +((f.x * ox + f.z * oz) / ol).toFixed(2);
    GTP.game.debug.teleport(s0.x + 3, s0.z); GTP.game.advance(0.6);
    const want = U.dirToYaw(p.x - s0.ped.x, p.z - s0.ped.z);
    out.facing = +Math.abs(U.wrapAngle(s0.ped.yaw - want)).toFixed(2);
    let barked = null; const on = (e) => { if (e.ped === s0.ped) barked = e.text; }; GTP.Events.on('bark', on);
    for (let i = 0; i < 100 && !barked; i++) GTP.game.advance(0.25);
    GTP.Events.off('bark', on);
    out.bark = barked;
    // far away: removed; back: the same post filled again
    GTP.game.debug.teleport(d.x, d.z + 220); GTP.game.advance(1);
    out.removed = !slot().ped;
    GTP.game.debug.teleport(d.x, d.z + 60); GTP.game.advance(1);
    out.back = !!slot().ped;
    // hurt: he runs (a civilian from then on) and the post stays empty while the player is near
    const doorman = slot().ped; GTP.game.debug.teleport(s0.x + 4, s0.z); GTP.game.advance(0.3);
    GTP.Combat.damage(doorman, 5, p, 'fist'); GTP.game.advance(1.5);
    out.fled = doorman.ai && doorman.ai.mission !== 'resident' && doorman.ai.mode === 'flee';
    GTP.game.advance(1); out.emptyPost = !slot().ped;
    // Merle at the harbor store, the green light on the other side of the door
    const port = W.landmark('both_sides_port');
    GTP.game.debug.teleport(port.door.x, port.door.z + 30); GTP.game.advance(1);
    const ms = AI.residents.list().find((s) => s.landmark === 'both_sides_port');
    const store = GTP.Combat.shop.stores().find((s) => s.id === 'both_sides_port');
    out.merle = ms && ms.ped ? { name: ms.ped.name, cast: ms.ped.castId, toLight: +Math.hypot(ms.ped.x - store.x, ms.ped.z - store.z).toFixed(1), toPost: +Math.hypot(ms.ped.x - ms.x, ms.ped.z - ms.z).toFixed(1), toShop: +Math.hypot(ms.ped.x - (port.building.x + port.building.w / 2), ms.ped.z - (port.building.z + port.building.d / 2)).toFixed(1) } : null;
    // a cutscene that casts Merle reuses the man at the door instead of spawning a twin
    const before = GTP.Entities.list.filter((e) => e.kind === 'ped' && e.castId === 'merle' && !e.removed).length;
    const ok = GTP.Cutscenes.play({ id: 't_merle', letterbox: true, skippable: true, shots: [{ cam: { from: { landmark: 'both_sides_port', offset: { x: 6, y: 3, z: 6 } }, to: { landmark: 'both_sides_port', offset: { x: 0, y: 1.6, z: 0 } }, seconds: 1 }, actors: [{ castId: 'merle', at: { landmark: 'both_sides_port', offset: { x: 1, z: 2 } }, anim: 'wave' }], lines: [], hold: 2 }] }, () => {});
    GTP.game.advance(0.3);
    const during = GTP.Entities.list.filter((e) => e.kind === 'ped' && e.castId === 'merle' && !e.removed).length;
    out.cutscene = { ok, before, during, same: GTP.Cutscenes.actors().merle === ms.ped };
    GTP.Cutscenes.skip(); GTP.game.advance(0.5);
    for (let i = 0; i < 20; i++) GTP.game.advance(0.25);
    out.cutscene.home = +Math.hypot(ms.ped.x - ms.x, ms.ped.z - ms.z).toFixed(2);
    return out;
  });
  console.log('  residents: ' + JSON.stringify(res));
  t.assert(res.slots.indexOf('heirloom_club:doorman') >= 0 && ['both_sides_strip', 'both_sides_port', 'both_sides_uptown'].every((id) => res.slots.indexOf(id + ':clerk') >= 0), 'the doorman and the three clerks are residents: ' + res.slots.join(','));
  t.assert(res.spawned && res.atPost < 0.5 && res.brain === 'resident' && res.role === 'doorman' && res.look === 'bowtie' && res.outward > 0.5, 'the doorman stands at the club door in his bow tie, facing the street: ' + JSON.stringify(res));
  t.assert(res.facing < 0.4 && res.bark, 'he turns to the player and greets him: ' + JSON.stringify({ facing: res.facing, bark: res.bark }));
  t.assert(res.removed && res.back, 'removed past 170 m, back on the return');
  t.assert(res.fled && res.emptyPost, 'a hurt doorman runs and the post stays empty: ' + JSON.stringify({ fled: res.fled, empty: res.emptyPost }));
  t.assert(res.merle && res.merle.cast === 'merle' && res.merle.name === 'Merle Firmness' && res.merle.toLight > 3 && res.merle.toPost < 0.5 && res.merle.toShop < 16, 'Merle minds the harbor store front, clear of the green light: ' + JSON.stringify(res.merle));
  t.assert(res.cutscene.ok && res.cutscene.same && res.cutscene.during === res.cutscene.before && res.cutscene.home < 1.3, 'a cutscene casting Merle reuses him and he walks back to his post: ' + JSON.stringify(res.cutscene));
  // the picture: Merle at the harbor store from the street, the green light beside the door
  await p2.evaluate(() => {
    const port = GTP.World.landmark('both_sides_port'), ms = GTP.AI.residents.list().find((s) => s.landmark === 'both_sides_port'), b = port.building;
    const ox = ms.x - (b.x + b.w / 2), oz = ms.z - (b.z + b.d / 2), ol = Math.hypot(ox, oz) || 1;
    GTP.game.debug.teleport(ms.x + ox / ol * 7, ms.z + oz / ol * 7); GTP.game.advance(0.6);
    const p = GTP.game.player, R = GTP.Render.rig; R.yaw = GTP.util.dirToYaw(ms.x - p.x, ms.z - p.z); R.pitch = 0.08; R.snap(); GTP.game.advance(0.05);
  });
  await t.shot(p2, 'ai_residents');
  const errs2 = await t.errors(ctx2);
  t.assert(errs2.length === 0, 'errors:\n' + errs2.join('\n'));

  // ---- 8. v0.3: cowering, flanking, the heli gunner, race routes, motorcycles, the HOA patrol tag (a fresh page) ----
  const ctx3 = await t.boot({ seed: 7 });
  const p3 = ctx3.page;
  const v3 = await p3.evaluate(() => {
    const AI = GTP.AI, W = GTP.World, E = GTP.Entities, g = GTP.game, p = g.player, U = GTP.util, out = {};
    // a gun aimed at a civilian: hands up (cowering), then a run once the aim leaves
    p.weapons.pistol = 60; p.weapon = 'pistol';
    const f = U.yawToDir(p.yaw), civ = g.debug.spawnPed(p.x + f.x * 9, p.z + f.z * 9, null, 'civ');
    const side = g.debug.spawnPed(p.x - f.z * 9, p.z + f.x * 9, null, 'civ');
    // aim the way a player does: the aim button held, the camera rig turned at the civilian (the player reads both every step)
    const keep = () => { GTP.Input.set('aim', true); GTP.Render.rig.yaw = U.dirToYaw(civ.x - p.x, civ.z - p.z); };
    for (let i = 0; i < 12; i++) { keep(); g.advance(1 / 12); }
    out.cower = { mode: civ.ai.mode, cowering: !!civ.cowering, speed: +civ.speed.toFixed(2), side: side.ai.mode, sideCower: !!side.cowering, aimed: AI.isAimedAt(civ) };
    for (let i = 0; i < 24; i++) { keep(); g.advance(1 / 12); }
    out.cower.held = civ.ai.mode;
    GTP.Input.set('aim', false); g.advance(2.5);
    out.cower.after = civ.ai.mode; out.cower.afterCowering = !!civ.cowering;
    civ.destroy(); side.destroy();
    // shots fired: a cowering civilian runs instead of freezing in the line of fire
    const civ3 = g.debug.spawnPed(p.x + f.x * 9, p.z + f.z * 9, null, 'civ');
    const keep3 = () => { GTP.Input.set('aim', true); GTP.Render.rig.yaw = U.dirToYaw(civ3.x - p.x, civ3.z - p.z); };
    for (let i = 0; i < 12; i++) { keep3(); g.advance(1 / 12); }
    out.cower.before = civ3.ai.mode;
    AI.alarm(p.x, p.z, 26, p);
    for (let i = 0; i < 12; i++) { keep3(); g.advance(1 / 12); }
    out.cower.shot = civ3.ai.mode; GTP.Input.set('aim', false); civ3.destroy();
    // fists never frighten anyone
    p.weapon = 'fist'; const civ2 = g.debug.spawnPed(p.x + f.x * 6, p.z + f.z * 6, null, 'civ'); GTP.Input.set('aim', true); GTP.Render.rig.yaw = U.dirToYaw(civ2.x - p.x, civ2.z - p.z); g.advance(1);
    out.fistCower = civ2.ai.mode === 'cower'; GTP.Input.set('aim', false); civ2.destroy();
    // cops flank a player in cover: one pins, the others swing round to points with a line on the player
    const lot = W.landmark('nap_depot'); g.debug.teleport(lot.door.x, lot.door.z); g.advance(0.5);
    AI.wanted.set(2);
    const cops = [];
    for (let i = 0; i < 4; i++) cops.push(g.debug.spawnPed(p.x + 14 + i * 2, p.z + (i % 2 ? 3 : -3), null, 'cop'));
    g.advance(0.1); cops.forEach((c) => { c.ai.mode = 'chase'; c.ai.seen = true; });
    p.hp = p.maxHp = 5000; g.advance(0.3);
    let flankEv = null; GTP.Events.on('ai:flank', (e) => { flankEv = e; });
    const n = AI.coverAlert(p.x, p.z);
    const pts = cops.filter((c) => c.ai.flank).map((c) => ({ x: c.ai.flank.x, z: c.ai.flank.z, side: c.ai.flank.side, los: !W.raycastBuildings(c.ai.flank.x, 1.5, c.ai.flank.z, p.x - c.ai.flank.x, -0.3, p.z - c.ai.flank.z, Math.hypot(p.x - c.ai.flank.x, p.z - c.ai.flank.z)) }));
    const a0 = cops.map((c) => Math.atan2(c.z - p.z, c.x - p.x));
    for (let i = 0; i < 40; i++) { p.hp = p.maxHp; g.advance(0.1); }
    const a1 = cops.map((c) => Math.atan2(c.z - p.z, c.x - p.x));
    out.flank = { n, ev: !!flankEv, pts, sides: Array.from(new Set(pts.map((q) => q.side))).length, swung: a0.map((a, i) => +Math.abs(U.wrapAngle(a1[i] - a)).toFixed(2)), pin: cops[0].ai.flank == null };
    GTP.Events.emit('cover:exit', {}); out.flank.offAfterExit = !AI.cover.active;
    cops.forEach((c) => c.destroy()); AI.wanted.clear(); g.advance(0.5);
    // the police helicopter's door gunner shoots a player it can see at five stars (CMB-09)
    const pk = W.landmark('protest_plaza'); g.debug.teleport(pk.x, pk.z); g.advance(0.5);
    AI.wanted.set(5); p.hp = p.maxHp = 100000;
    let heliHits = 0, heliShots = 0;
    GTP.Events.on('damage', (e) => { if (e.target === p && e.src && e.src.kind === 'heli') heliHits++; });
    GTP.Events.on('heli:fire', () => { heliShots++; });
    for (let i = 0; i < 60; i++) {
      p.hp = p.maxHp; AI.wanted.set(5); g.advance(0.5);
      E.list.forEach((e) => { if (!e.removed && (e.kind === 'ped' || e.kind === 'vehicle') && e !== p && Math.hypot(e.x - p.x, e.z - p.z) < 120) e.destroy(); });
    }
    out.heli = { shots: heliShots, hits: heliHits, heli: !!AI.police.heli };
    AI.wanted.clear(); g.advance(1);
    // race routes path round the tower on The Figure Eight's cp5 -> cp6 leg (QA-STR-04)
    const cps = [{ x: 492, z: 280 }, { x: 400, z: 280 }, { x: 376, z: 328 }, { x: 396, z: 328 }];
    const via = AI.routeVias(cps.map((c) => Object.assign({ r: 12, direct: true }, c)), false, () => {});
    out.race = { vias: via.route ? via.route.filter((q) => q.via).length : 0, blockedBefore: !W.segmentClear(400, 280, 376, 328, 0.6) };
    if (via.route) out.race.blockedAfter = via.route.filter((q, i) => i > 0 && !W.segmentClear(via.route[i - 1].x, via.route[i - 1].z, q.x, q.z, 0.6)).length;
    const D = GTP.Strands && GTP.Strands.drivers;
    if (D) {
      g.debug.teleport(410, 300); g.advance(0.3);
      const rv = new GTP.Vehicle({ x: 400, z: 281, type: 'sports', persistent: true }); rv.y = W.heightAt(400, 281, 0); rv.yaw = U.dirToYaw(-1, 0); rv.snap(); E.add(rv);
      const hit = [];
      const route = cps.slice(1).map((c) => ({ x: c.x, z: c.z, r: 12, direct: true }));
      D.take(rv, 'route', { role: 'civ', speedMul: 0.6, route, loop: false, track: false, onCheckpoint: (ci) => hit.push(ci) });
      // the pathing is under test, not the traffic: clear the ambient cars round the racer as it goes
      for (let i = 0; i < 60 && hit.length < 2; i++) { E.list.forEach((e) => { if (!e.removed && e.kind === 'vehicle' && e !== rv && !e.persistent && Math.hypot(e.x - rv.x, e.z - rv.z) < 50) e.destroy(); }); g.advance(0.5); }
      out.race.hit = hit; out.race.at = [Math.round(rv.x), Math.round(rv.z)];
      D.release(rv); rv.destroy();
    }
    // a gridlock cycle unwinds: two traffic cars nose to nose in one lane (a swerve gone wrong) back off and pass
    const lane = W.landmark('vault_bank').door; const rp = W.nearestRoadPoint(lane.x + 30, lane.z);
    g.debug.teleport(rp.x + 30, rp.z + 30); g.advance(0.2);
    E.list.forEach((e) => { if (!e.removed && e.kind === 'vehicle' && !e.persistent && Math.hypot(e.x - rp.x, e.z - rp.z) < 40) e.destroy(); });
    const lanes = [];
    for (const sgn of [-1, 1]) {
      const v = new GTP.Vehicle({ x: rp.x + rp.dx * sgn * 3.6, z: rp.z + rp.dz * sgn * 3.6, type: 'sedan' }); v.y = W.heightAt(v.x, v.z, 0); v.yaw = U.dirToYaw(-rp.dx * sgn, -rp.dz * sgn); v.snap(); E.add(v);
      const d = AI.spawner.spawnPed(v.x, v.z, 'civ'); v.enter(d, 0); AI.drive(v, 'traffic'); lanes.push(v);
    }
    let grid = 0; GTP.Events.on('ai:gridlock', () => { grid++; });
    const p0 = lanes.map((v) => [v.x, v.z]);
    for (let i = 0; i < 40; i++) g.advance(0.5);
    out.gridlock = { events: grid, moved: lanes.map((v, i) => Math.round(Math.hypot(v.x - p0[i][0], v.z - p0[i][1]))), gap: Math.round(Math.hypot(lanes[0].x - lanes[1].x, lanes[0].z - lanes[1].z)) };
    lanes.forEach((v) => { if (v.driver) v.driver.destroy(); v.destroy(); });
    // motorcycles in traffic (a 'bike' stands in until the vehicles track registers 'moto'), taxis wear the pod wrap after cab_livery
    const share = GTP.Content.world.spawn.vehicles.motoShare || {};
    out.moto = { type: AI.spawner.vehicleType('moto'), has: !!GTP.C.VEHICLES.moto, districts: Object.keys(share).filter((k) => share[k] > 0).length };
    // ride the streets a while: some of the traffic is on two wheels
    const bikes0 = new Set(); for (let i = 0; i < 20; i++) { g.advance(1); E.list.forEach((e) => { if (!e.removed && e.kind === 'vehicle' && e.ai && e.ai.kind === 'traffic' && (e.type === 'bike' || e.type === 'moto')) bikes0.add(e.id); }); }
    out.moto.seen = bikes0.size;
    // the HOA patrol: suburb traffic never carries the strand's 'hoa' tag (QA-STR-11)
    const hoa = W.landmark('hoa_hall'); g.debug.teleport(hoa.door.x, hoa.door.z + 20);
    for (let i = 0; i < 12; i++) g.advance(1);
    out.hoa = { patrols: E.list.filter((e) => e.kind === 'vehicle' && !e.removed && e.ai && e.ai.hoa).length, tagged: E.list.filter((e) => e.kind === 'vehicle' && !e.removed && e.ai && e.ai.hoa && e.tag === 'hoa').length, patrolTag: (E.list.find((e) => e.kind === 'vehicle' && !e.removed && e.ai && e.ai.hoa) || {}).tag || null };
    out.errors = GTP.errors.map((e) => e.where + ': ' + e.message);
    return out;
  });
  console.log('  v0.3: ' + JSON.stringify(v3));
  t.assert(v3.cower.mode === 'cower' && v3.cower.cowering && v3.cower.speed < 0.5 && v3.cower.side !== 'cower' && v3.cower.held === 'cower', 'a civilian in the line of an aimed gun cowers, one beside it does not: ' + JSON.stringify(v3.cower));
  t.assert(v3.cower.after === 'flee' && !v3.cower.afterCowering, 'the aim leaves: they run: ' + JSON.stringify(v3.cower));
  t.assert(!v3.fistCower, 'fists frighten no one');
  t.assert(v3.cower.before === 'cower' && v3.cower.shot === 'flee', 'a shot breaks the cower into a run: ' + JSON.stringify(v3.cower));
  t.assert(v3.flank.n >= 2 && v3.flank.ev && v3.flank.sides === 2 && v3.flank.pts.every((q) => q.los), 'cops flank both sides with a line on the player: ' + JSON.stringify(v3.flank));
  t.assert(v3.flank.swung.filter((a) => a > 0.35).length >= 2 && v3.flank.offAfterExit, 'flankers swing round the cover: ' + JSON.stringify(v3.flank.swung));
  t.assert(v3.heli.shots >= 10 && v3.heli.hits >= 2, 'the helicopter gunner shoots and hits: ' + JSON.stringify(v3.heli));
  t.assert(v3.race.blockedBefore && v3.race.vias >= 1, 'race legs through a building get road corners: ' + JSON.stringify(v3.race));
  t.assert(v3.race.hit && v3.race.hit.join(',') === '0,1', 'a racer drives round the tower to cp6 and cp7: ' + JSON.stringify(v3.race));
  t.assert(v3.gridlock.events >= 1 && Math.max.apply(null, v3.gridlock.moved) > 6, 'a nose-to-nose gridlock unwinds: ' + JSON.stringify(v3.gridlock));
  t.assert(v3.moto.districts >= 6 && v3.moto.seen >= 1 && (v3.moto.has ? v3.moto.type === 'moto' : v3.moto.type === 'bike'), 'motorcycles in traffic: ' + JSON.stringify(v3.moto));
  t.assert(v3.hoa.patrols >= 1 && v3.hoa.tagged === 0 && v3.hoa.patrolTag === 'hoapatrol', 'HOA patrols keep off the strand tag: ' + JSON.stringify(v3.hoa));
  t.assert(v3.errors.length === 0, 'no game errors: ' + v3.errors.join('; '));
  const errs3 = await t.errors(ctx3);
  t.assert(errs3.length === 0, 'errors:\n' + errs3.join('\n'));
  await p3.close();

  // ---- 9. v0.3 integration (envw2/ai-traffic), a fresh page: parked cars fit their bays (QA-A-TRF-07, QA-A-GEO-05), no
  //         swerve into the oncoming lane behind a car at a red light (QA-A-TRF-02), a car on the oncoming side keeps to a
  //         lane of its own direction (QA-A-TRF-03), a bus at the west sea wall stays on the road (QA-A-TRF-04), a bus sees
  //         a pedestrian at its nose ----
  const ctx4 = await t.boot({ seed: 7 });
  const p4 = ctx4.page;
  const v4 = await p4.evaluate(() => {
    const W = GTP.World, T = W.T, S = GTP.AI.spawner, U = GTP.util, E = GTP.Entities, g = GTP.game, out = {};
    // parked cars: no bay holds a solid prop, and every parked body (yaw 0 / PI) is clear of walls and props
    out.bayProps = 0;
    S.parkTiles.forEach((ti) => {
      const cx = (ti % W.w + 0.5) * 4, cz = (((ti / W.w) | 0) + 0.5) * 4;
      for (const p of W.props) if (p.solid && !p.fallen && p.r > 0 && (p.y || 0) <= 1.5 && Math.abs(p.x - cx) < 1.1 + p.r && Math.abs(p.z - cz) < 2.7 + p.r) out.bayProps++;
    });
    const seen = new Set(), clip = [];
    for (const [x, z] of [[590, 160], [640, 700], [100, 680]]) {
      g.debug.teleport(x, z); g.advance(6);
      for (const v of E.list) {
        if (v.removed || v.kind !== 'vehicle' || !v.ai || v.ai.kind !== 'parked' || seen.has(v.id)) continue; seen.add(v.id);
        const f = U.yawToDir(v.yaw); let wall = false, prop = null;
        for (const sf of [-1, -0.5, 0, 0.5, 1]) for (const sr of [-1, 1]) if (W.solidAt(v.x + f.x * v.hl * sf - f.z * v.hw * sr, v.z + f.z * v.hl * sf + f.x * v.hw * sr, 0.8)) wall = true;
        for (const p of W.props) { if (!p.solid || p.fallen || Math.abs(p.x - v.x) > 12 || Math.abs(p.z - v.z) > 12 || (p.y || 0) > 2) continue; const l = v.worldToLocal(p.x, p.z); if (p.r - Math.hypot(Math.max(0, Math.abs(l.r) - v.hw), Math.max(0, Math.abs(l.f) - v.hl)) > 0.2) { prop = p.kind; break; } }
        if (wall || prop) clip.push({ type: v.type, at: [Math.round(v.x), Math.round(v.z)], wall, prop });
      }
    }
    out.parked = { n: seen.size, clip };
    // the rest on empty streets
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0; GTP.C.AI.parkedTarget = 0;
    const clear = () => E.list.forEach((e) => { if (!e.removed && (e.kind === 'vehicle' || (e.kind === 'ped' && e.ai && !e.persistent))) e.destroy(); });
    clear();
    // TRF-02: two sedans northbound in lane x 234; the lead waits at the red light of (57..58, 45..46), the follower waits behind it
    g.debug.teleport(246, 214); g.advance(0.1);
    let guard = 0; while (!(W.signalPhase(58, 45, g.time.t) === 'ew' && W.signalPhase(58, 45, g.time.t - 0.1) === 'ns') && guard++ < 2000) g.advance(1 / 60);
    const mk = (x, z, type, axis, dir, laneC) => S.placeTraffic({ x, z, y: 0, tx: Math.floor(x / 4), tz: Math.floor(z / 4), axis, dir, laneC, deck: false }, type);
    const a = mk(234, 199, 'sedan', 'v', -1, 234), b = mk(234, 208, 'sedan', 'v', -1, 234);
    let leadWaits = false, swerved = false, maxOff = 0;
    for (let k = 0; k < 160; k++) { g.advance(0.1); if (k < 80 && a.ai.stopAlong != null) leadWaits = true; if (b.ai.swerve) swerved = true; if (b.z > 188) maxOff = Math.max(maxOff, Math.abs(b.x - 234)); }
    out.red = { leadWaits, swerved, maxOff: +maxOff.toFixed(2) };
    clear();
    // TRF-03: a northbound sedan standing in the southbound lane (x 230) steers back to x 234 and never follows a southbound lane
    g.debug.teleport(246, 270); g.advance(0.1);
    const c = mk(230, 262, 'sedan', 'v', -1, 234);
    let wrongLane = 0;
    for (let k = 0; k < 30; k++) {
      g.advance(0.1);
      const lb = W.laneV[Math.floor(c.z / 4) * W.w + Math.floor(c.ai.laneC / 4)];
      if (lb && ((lb >> 4) < (lb & 15) / 2 ? 1 : -1) !== c.ai.dir && c.ai.plan && (c.ai.plan.kind === 'straight' || c.ai.plan.kind === 'cruise')) wrongLane++;
    }
    out.lane = { wrongLane, x: +c.x.toFixed(2) };
    clear();
    // TRF-04: a bus westbound on the campus avenue (lane z 278) toward the one-tile stub at the sea wall
    g.debug.teleport(100, 290); g.advance(0.1);
    const bus = mk(140, 278, 'bus', 'h', -1, 278);
    let water = false, off = 0, maxOffRoad = 0;
    for (let k = 0; k < 160 && !bus.removed; k++) {
      g.advance(0.25);
      const tt = W.tileAt(bus.x, bus.z);
      if (tt === T.WATER) water = true;
      if (tt !== T.ROAD && tt !== T.BRIDGE) { off += 0.25; maxOffRoad = Math.max(maxOffRoad, off); } else off = 0;
    }
    out.stub = { water, maxOffRoad, removed: !!bus.removed, end: [Math.round(bus.x), Math.round(bus.z)] };
    clear();
    // a bus's ped look-ahead reaches past its 5 m half-length: a pedestrian 0.6 m off its nose holds it
    const sw = W.nearestSidewalkPoint(244, 270); g.debug.teleport(sw.x, sw.z); g.advance(0.1);
    const bus2 = mk(240, 282, 'bus', 'h', 1, 282); bus2.vx = bus2.vz = 0; bus2.speed = 0;
    const ped = S.spawnPed(240 + bus2.hl + 0.6, 282, 'civ'); ped.ai.mode = 'idle'; ped.ai.idleT = 99; ped.ai.mute = true;
    for (let k = 0; k < 12; k++) { g.advance(0.1); ped.x = bus2.x + bus2.hl + 0.6; ped.z = 282; ped.ai.idleT = 99; if (ped._sh) E.hash.update(ped); }
    out.nose = { by: bus2.ai.capReason === ped, pedBlock: !!bus2.ai.pedBlock, moved: +(bus2.x - 240).toFixed(2), tile: W.tileAt(bus2.x, bus2.z) };
    out.errors = GTP.errors.map((e) => e.where + ': ' + e.message);
    return out;
  });
  console.log('  v0.3 traffic: ' + JSON.stringify(v4));
  t.assert(v4.bayProps === 0, 'no parking bay holds a solid prop (QA-A-GEO-05): ' + v4.bayProps);
  t.assert(v4.parked.n >= 15 && v4.parked.clip.length === 0, 'parked cars sit clear of walls and props (QA-A-TRF-07): ' + JSON.stringify(v4.parked));
  t.assert(v4.red.leadWaits && !v4.red.swerved && v4.red.maxOff < 1, 'a car queued behind one at a red light waits in its lane (QA-A-TRF-02): ' + JSON.stringify(v4.red));
  t.assert(v4.lane.wrongLane === 0 && Math.abs(v4.lane.x - 234) < 1, 'a car on the oncoming side goes back to its own lane (QA-A-TRF-03): ' + JSON.stringify(v4.lane));
  t.assert(!v4.stub.water && v4.stub.maxOffRoad <= 1 && !v4.stub.removed, 'a bus at the sea-wall stub stays on the road (QA-A-TRF-04): ' + JSON.stringify(v4.stub));
  t.assert(v4.nose.by && v4.nose.pedBlock && v4.nose.moved < 0.5, 'a bus holds for a pedestrian at its nose: ' + JSON.stringify(v4.nose));
  t.assert(v4.errors.length === 0, 'no game errors: ' + v4.errors.join('; '));
  const errs4 = await t.errors(ctx4);
  t.assert(errs4.length === 0, 'errors:\n' + errs4.join('\n'));
});
