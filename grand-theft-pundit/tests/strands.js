/* strands.js: the side-strand runtime (GTP.Strands in 09_missions), each strand started and driven through one cycle.
 *  1 Loud Cab: E in a stopped taxi starts a shift; a fare hails, boards beside the stopped cab, pays at the destination (strand:cycle, subs)
 *  2 HOA Patrol: E in a stopped cop car; a flagged car flees; wrecking it counts as a stop (level 2, $200)
 *  3 Sponsor Runs: the Nap Dynasty van appears at the depot once m02_read is done; entering it starts the chain; a delivery pays
 *  4 Ratio Rampage: the rr_01 bubble arms a countdown; the loaner is equipped; hecklers fall to the right weapon; the weapon goes back
 *  5 Monday Memos: ten envelopes collected on foot, the counter and the 10-memo threshold (table leg, $500); screenshot strands_memo.png
 *  6 Loop Race lr_01: brake on the start line, 3-2-1, three AI racers drive the ring and at least one finishes; screenshot strands_race_start.png
 *  7 Stunt Jump sj_07: a sports car off the runway wedge flies over a second, lands, STUNT PUNDIT pays $500 once
 *  8 the surfaces: markers(), hud(), summary(), the save hook */
'use strict';
const H = require('./_harness');

H.run('strands', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;

  await page.evaluate(() => {
    window.T_ = {
      events: [],
      press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
      until(pred, maxSec, step) { step = step || 0.1; let s = 0; while (s < maxSec) { GTP.game.advance(step); s += step; if (pred()) return s; } return -1; },
      tp(x, z, y) { GTP.game.debug.teleport(x, z, y); },
      car(type, dx) { const p = GTP.game.player; const rp = GTP.World.nearestRoadPoint(p.x + (dx || 12), p.z); const v = GTP.game.debug.spawnVehicle(rp.x, rp.z, type); return v; },
      enter(v) { const d = v.doorWorld(0); T_.tp(d.x, d.z); GTP.game.advance(0.1); T_.press('enter'); GTP.game.advance(0.7); return GTP.game.player.inVehicle === v; },
      leave() { const p = GTP.game.player; if (p.inVehicle) p.exitVehicle(); GTP.game.advance(0.2); },
      lookAt(x, z) { const p = GTP.game.player; GTP.Render.rig.yaw = GTP.util.dirToYaw(x - p.x, z - p.z); GTP.Render.rig.pitch = 0.15; GTP.Render.rig.snap(); GTP.game.advance(0.2); },
      reset() { if (GTP.Strands.active()) GTP.Strands.end('test'); T_.leave(); GTP.AI.wanted.clear(); GTP.game.debug.godMode(false); GTP.game.advance(0.2); }
    };
    ['strand:start', 'strand:cycle', 'strand:end', 'race:start', 'race:finish', 'stunt:launch', 'stunt:land', 'memo', 'subs:tier'].forEach((ev) => GTP.Events.on(ev, (e) => T_.events.push(ev + ':' + (e.id || e.ramp || e.race || '') + (e.level != null ? '@' + e.level : '') + (e.place != null ? ' p' + e.place : ''))));
  });

  // ---- 1. Loud Cab ----
  let r = await page.evaluate(() => {
    const S = GTP.Strands, p = GTP.game.player, money0 = p.money, subs0 = p.subs;
    const taxi = T_.car('taxi');
    const inCab = T_.enter(taxi);
    GTP.game.advance(0.5);
    T_.press('action'); GTP.game.advance(0.2);
    const out = { inCab, active: S.active(), hud0: S.hud().line };
    const s1 = T_.until(() => S.current() && S.current().fare, 6, 0.25);
    const f = S.current().fare;
    out.fare = { s: s1, id: f.def.id, dist: +Math.hypot(f.ped.x - taxi.x, f.ped.z - taxi.z).toFixed(0), wave: f.ped.poseAnim, dest: f.dest.name, timer: +f.timer.toFixed(0) };
    out.markers = S.markers().filter((m) => m.icon === 'target').length;
    // pull up beside them, stopped
    T_.tp(f.ped.x + 2.5, f.ped.z); GTP.game.advance(0.2);
    const s2 = T_.until(() => f.phase === 'ride', 5, 0.1);
    out.boarded = { s: s2, inCab: f.ped.inVehicle === taxi, seat: f.ped.seat, line: f.ped.line };
    // drive (teleport) to the destination and stop
    T_.tp(f.dest.x + 2, f.dest.z); GTP.game.advance(0.1);
    const s3 = T_.until(() => !S.current() || !S.current().fare, 4, 0.1);
    out.paid = { s: s3, money: p.money - money0, subs: p.subs - subs0, fares: S.progress().loud_cab.fares, out: !f.ped.inVehicle, alive: f.ped.alive, events: T_.events.filter((e) => /strand:cycle:loud_cab/.test(e)).length };
    // end the shift with E while stopped and empty
    T_.press('action'); GTP.game.advance(0.2);
    out.ended = { active: S.active(), events: T_.events.filter((e) => /strand:end:loud_cab/.test(e)).length };
    T_.reset();
    return out;
  });
  console.log('  loud_cab: ' + JSON.stringify(r));
  t.assert(r.inCab && r.active === 'loud_cab' && r.fare.s > 0 && r.fare.dist >= 40 && r.fare.dist <= 170 && r.fare.wave === 'wave' && r.fare.timer > 20, 'E in a stopped taxi starts a shift and a fare hails 60..140 m away: ' + JSON.stringify(r.fare));
  t.assert(r.boarded.s > 0 && r.boarded.inCab && r.boarded.seat >= 1, 'the fare boards the stopped cab within a couple of seconds: ' + JSON.stringify(r.boarded));
  t.assert(r.paid.s > 0 && r.paid.money >= 50 && r.paid.subs === 150 && r.paid.fares === 1 && r.paid.out && r.paid.events === 1, 'the fare pays at the destination and steps out: ' + JSON.stringify(r.paid));
  t.assert(r.ended.active === null && r.ended.events === 1, 'E again ends the shift');

  // ---- 2. HOA Patrol ----
  r = await page.evaluate(() => {
    const S = GTP.Strands, p = GTP.game.player, money0 = p.money;
    const cop = T_.car('cop');
    const inCar = T_.enter(cop);
    GTP.game.advance(0.5);
    T_.press('action'); GTP.game.advance(0.2);
    const out = { inCar, active: S.active() };
    const s1 = T_.until(() => S.current() && S.current().target, 8, 0.25);
    const c = S.current(), tgt = c.target;
    out.flag = { s: s1, violation: c.violation, dist: +Math.hypot(tgt.x - cop.x, tgt.z - cop.z).toFixed(0), chauffeur: !!tgt._chauf, mode: tgt._chauf && tgt._chauf.mode, driver: !!tgt.driver, timer: +c.timer.toFixed(0) };
    const x0 = tgt.x, z0 = tgt.z;
    GTP.game.advance(4);
    out.fled = +Math.hypot(tgt.x - x0, tgt.z - z0).toFixed(1);
    out.marker = S.markers().filter((m) => m.icon === 'violation').length;
    // a wreck counts as a stop
    tgt.applyDamage(999, p, 'smg');
    const s2 = T_.until(() => c.level === 2, 10, 0.25);
    out.stop = { s: s2, level: c.level, money: p.money - money0, stops: S.progress().hoa_patrol.stops, best: S.progress().hoa_patrol.best, events: T_.events.filter((e) => /strand:cycle:hoa_patrol/.test(e)).length };
    T_.reset();
    return out;
  });
  console.log('  hoa_patrol: ' + JSON.stringify(r));
  t.assert(r.inCar && r.active === 'hoa_patrol' && r.flag.s > 0 && r.flag.violation && r.flag.chauffeur && r.flag.mode === 'flee' && r.flag.driver && r.flag.timer > 100, 'E in a stopped cop car flags a fleeing car with a violation: ' + JSON.stringify(r.flag));
  t.assert(r.fled > 8 && r.marker === 1, 'the flagged car drives off (' + r.fled + ' m in 4 s) under a red marker');
  t.assert(r.stop.s > 0 && r.stop.level === 2 && r.stop.money === 200 && r.stop.stops === 1 && r.stop.events === 1, 'wrecking it counts as a stop: level 2, $200: ' + JSON.stringify(r.stop));

  // ---- 3. Sponsor Runs ----
  r = await page.evaluate(() => {
    const S = GTP.Strands, M = GTP.Missions, p = GTP.game.player, money0 = p.money;
    M.state.completed.add('m00_intro'); M.state.completed.add('m01_van'); M.state.completed.add('m02_read'); M.refreshMarkers();
    const s0 = T_.until(() => GTP.Entities.list.some((e) => e.kind === 'vehicle' && e.tag === 'sponsorvan' && !e.removed), 6, 0.5);
    const van = GTP.Entities.list.find((e) => e.kind === 'vehicle' && e.tag === 'sponsorvan' && !e.removed);
    const depot = GTP.World.landmark('nap_depot').door;
    const out = { s0, van: van ? { type: van.type, dist: +Math.hypot(van.x - depot.x, van.z - depot.z).toFixed(0), keep: !!van.keep, persistent: van.persistent } : null };
    if (!van) return out;
    const inVan = T_.enter(van);
    GTP.game.advance(0.3);
    const c = S.current();
    out.start = { inVan, active: S.active(), run: c && c.run ? { lm: c.run.lm.id, timer: +c.run.timer.toFixed(0) } : null, hud: S.hud().line };
    T_.tp(c.run.dest.x + 2, c.run.dest.z); GTP.game.advance(0.1);
    const s1 = T_.until(() => c.i === 1, 4, 0.1);
    out.run1 = { s: s1, money: p.money - money0, runs: S.progress().sponsor_runs.runs, next: c.run ? c.run.lm.id : null, events: T_.events.filter((e) => /strand:cycle:sponsor_runs/.test(e)).length };
    // leaving the van for 15 s ends the chain
    T_.leave();
    const s2 = T_.until(() => !S.active(), 20, 0.5);
    out.ended = { s: s2, events: T_.events.filter((e) => /strand:end:sponsor_runs/.test(e)).length };
    T_.reset();
    return out;
  });
  console.log('  sponsor_runs: ' + JSON.stringify(r));
  t.assert(r.van && r.van.type === 'van' && r.van.dist < 50 && r.van.keep && r.van.persistent, 'the Nap Dynasty van is parked at the depot once m02_read is done: ' + JSON.stringify(r.van));
  t.assert(r.start.inVan && r.start.active === 'sponsor_runs' && r.start.run && r.start.run.timer >= 55, 'entering the van starts SPONSOR RUN 1/8: ' + JSON.stringify(r.start));
  t.assert(r.run1.s > 0 && r.run1.money >= 100 && r.run1.runs === 1 && r.run1.next && r.run1.events === 1, 'the first delivery pays and the second is assigned: ' + JSON.stringify(r.run1));
  t.assert(r.ended.s > 12 && r.ended.events === 1, 'leaving the van for 15 s ends the chain (' + r.ended.s + ' s)');

  // ---- 4. Ratio Rampage rr_01 ----
  r = await page.evaluate(() => {
    const S = GTP.Strands, p = GTP.game.player, money0 = p.money;
    GTP.game.debug.godMode(true);
    const mk = S.debug.markers().find((m) => m.id === 'rr_01');
    const out = { marker: mk ? { weapon: mk.data.weapon, visible: mk.visible } : null, weaponBefore: p.weapon };
    T_.tp(mk.x + 20, mk.z); GTP.game.advance(0.3);
    T_.tp(mk.x, mk.z);
    const s1 = T_.until(() => S.active() === 'ratio_rampages', 3, 0.1);
    const c = S.current();
    out.start = { s: s1, countdown: +c.countdown.toFixed(1), weapon: p.weapon, hecklers: c.def.hecklers };
    const s2 = T_.until(() => c.hecklers.length > 0, 6, 0.25);
    out.wave = { s: s2, n: c.hecklers.length, signs: c.hecklers.map((h) => h.look.sign), hostile: c.hecklers.every((h) => h.hostile) };
    // one wrong take, then the right weapon for everyone until done
    GTP.Combat.damage(c.hecklers[0], 999, p, 'pistol'); GTP.game.advance(0.3);
    out.wrong = { wrong: c.wrong, kills: c.kills };
    let guard = 0;
    while (S.active() === 'ratio_rampages' && guard++ < 40) { c.hecklers.forEach((h) => { if (h.alive && !h.removed) GTP.Combat.damage(h, 999, p, c.def.weapon); }); GTP.game.advance(0.5); }
    out.done = { active: S.active(), kills: c.kills, done: S.progress().ratio_rampages.done, best: S.progress().ratio_rampages.best.rr_01, money: p.money - money0, weapon: p.weapon, tableleg: p.weapons.tableleg === Infinity, cooldown: mk.cooldown > 0, visible: mk.visible, events: T_.events.filter((e) => /strand:cycle:ratio_rampages/.test(e)).length };
    T_.reset();
    return out;
  });
  console.log('  ratio_rampages: ' + JSON.stringify(r));
  t.assert(r.marker && r.marker.weapon === 'tableleg' && r.marker.visible && r.start.s > 0 && r.start.countdown > 2 && r.start.weapon === 'tableleg', 'standing in the rr_01 bubble starts the countdown with the table leg equipped: ' + JSON.stringify(r.start));
  t.assert(r.wave.s > 0 && r.wave.n >= 4 && r.wave.hostile && r.wave.signs.every((s) => typeof s === 'string'), 'a wave of four hecklers with signs arrives: ' + JSON.stringify(r.wave));
  t.assert(r.wrong.wrong === 1 && r.wrong.kills === 0, 'a kill with the wrong weapon says WRONG TAKE and does not count');
  t.assert(r.done.active === null && r.done.kills >= 12 && r.done.done === 1 && r.done.best > 0 && r.done.money === 400 && r.done.cooldown && !r.done.visible && r.done.events === 1, 'twelve hecklers down completes the rampage: $400, a best time, the bubble on cooldown: ' + JSON.stringify(r.done));
  t.assert(r.done.tableleg, 'the leftover rampage weapon stays (a table leg has no ammo to run out of)');

  // ---- 5. Monday Memos ----
  r = await page.evaluate(() => {
    const S = GTP.Strands, p = GTP.game.player, money0 = p.money;
    const pks = Object.values(S.memoPickups());
    const out = { total: S.memos().total, placed: pks.length, onGround: pks.filter((k) => !GTP.World.solidAt(k.x, k.z, k.y + 0.5)).length, meshes: pks.filter((k) => k.mesh && k.mesh.children.length >= 1).length };
    const first = pks[0];
    for (let i = 0; i < 10; i++) {
      const k = pks[i]; T_.tp(k.x, k.z, k.y); GTP.game.advance(0.3);
      // a memo on a road under a stopped car waits for the car in play; the test moves the car instead
      if (!k.removed) { GTP.Entities.near(k.x, k.z, 5, 'vehicle').forEach((v) => v.destroy()); GTP.game.advance(0.05); T_.tp(k.x, k.z, k.y); GTP.game.advance(0.3); }
    }
    out.after = { collected: S.memos().collected.length, events: T_.events.filter((e) => /^memo:/.test(e)).length, money: p.money - money0, tableleg: p.weapons.tableleg === Infinity, left: Object.keys(S.memoPickups()).length, byDistrict: Object.keys(S.memos().byDistrict).length };
    // the eleventh for the screenshot: the player stands beside it, a free camera low over the envelope once the toasts have faded
    const k = pks[10];
    T_.tp(k.x - 1.8, k.z + 0.6, k.y); GTP.game.advance(4);
    GTP.game.debug.freeCam(k.x + 2.4, k.y + 1.3, k.z + 2.0, k.x, k.y + 0.25, k.z);
    out.shotMemo = { x: +k.x.toFixed(1), z: +k.z.toFixed(1), id: k.memoId, visible: !!(k.mesh && k.mesh.visible) };
    void first;
    return out;
  });
  console.log('  monday_memos: ' + JSON.stringify(r));
  t.assert(r.total === 50 && r.placed === 50 && r.onGround >= 45 && r.meshes === 50, 'fifty envelopes are placed in the world with meshes: ' + JSON.stringify(r));
  t.assert(r.after.collected === 10 && r.after.events === 10 && r.after.left === 40 && r.after.money === 500 && r.after.tableleg && r.after.byDistrict >= 3, 'ten memos collected on foot: the counter, the $500 and the table leg at ten: ' + JSON.stringify(r.after));
  const shotMemo = await t.shot(page, 'strands_memo');
  console.log('  shot: ' + shotMemo);
  await page.evaluate(() => { GTP.game.debug.followCam(); GTP.game.advance(0.1); });

  // ---- 6. Loop Race lr_01 ----
  r = await page.evaluate(() => {
    const S = GTP.Strands, p = GTP.game.player, money0 = p.money, subs0 = p.subs;
    const start = S.debug.markers().find((m) => m.id === 'lr_01');
    const out = { marker: start ? { visible: start.visible, y: +start.y.toFixed(1), unlocked: S.racesList().map((d) => d.id + ':' + d.unlocked).join(',') } : null };
    const car = GTP.game.debug.spawnVehicle(start.x, start.z + 10, 'sports', { yaw: 0, y: start.y });
    const inCar = T_.enter(car);
    T_.tp(start.x, start.z, start.y); GTP.game.advance(0.3);
    GTP.Input.set('jump', true);   // the handbrake, held on the line
    const s1 = T_.until(() => S.races.active(), 4, 0.1);
    GTP.Input.set('jump', false);
    const rc = S.races.cur;
    out.start = { inCar, s: s1, active: S.active(), racers: rc ? rc.racers.length : 0, cps: rc ? rc.cps.length : 0, countdown: rc ? +rc.countdown.toFixed(1) : null, rings: S.races.rings.length, hud: S.races.hud() };
    out.racersOnDeck = rc ? rc.racers.map((x) => +x.v.y.toFixed(1)) : [];
    GTP.game.advance(1.2);
    // a look back along the grid for the screenshot
    T_.lookAt(start.x, start.z - 40);
    GTP.Render.rig.pitch = 0.22; GTP.Render.rig.snap(); GTP.game.advance(0.05);
    return out;
  });
  console.log('  race start: ' + JSON.stringify(r));
  t.assert(r.marker && r.marker.visible && r.marker.y > 5 && /lr_01:true/.test(r.marker.unlocked) && /lr_02:false/.test(r.marker.unlocked), 'lr_01 is open on the deck and lr_02 waits for a finish');
  t.assert(r.start.inCar && r.start.s > 0 && r.start.active === 'loop_races' && r.start.racers === 3 && r.start.cps === 8 && r.start.countdown > 1 && r.start.rings === 8, 'braking on the start line for a second starts the race: three racers, eight rings, a countdown: ' + JSON.stringify(r.start));
  t.assert(r.racersOnDeck.every((y) => y > 5), 'the racers line up on the deck: ' + r.racersOnDeck.join(','));
  const shotRace = await t.shot(page, 'strands_race_start');
  console.log('  shot: ' + shotRace);
  r = await page.evaluate(() => {
    const S = GTP.Strands, p = GTP.game.player, money0 = p.money, subs0 = p.subs, rc = S.races.cur, start = S.debug.markers().find((m) => m.id === 'lr_01');
    // the field drives while the player waits off the racing line (god mode: three sports cars pass at full tilt): the AI must get round the ring
    GTP.game.debug.godMode(true);
    GTP.game.advance(2.5);
    T_.tp(start.x + 6.5, start.z + 30, start.y);
    const s = T_.until(() => rc.racers.some((x) => x.finished), 150, 1);
    const out = { aiFinish: s, racerCps: rc.racers.map((x) => x.lap * 8 + x.cp), racerPos: rc.racers.map((x) => [Math.round(x.v.x), Math.round(x.v.z), +x.v.y.toFixed(1)]), wrecked: rc.racers.filter((x) => x.v.wreck).length, position: S.races.position() };
    // now the player takes the ring by teleport
    for (let i = 0; i < 12 && S.races.active(); i++) { const cp = S.races.nextCheckpoint(); T_.tp(cp.x, cp.z, cp.y); GTP.game.advance(0.3); }
    out.finish = { active: S.races.active(), strand: S.active(), money: p.money - money0, subs: p.subs - subs0, finishes: S.progress().loop_races.finishes.lr_01, best: S.progress().loop_races.best.lr_01, events: T_.events.filter((e) => /race:finish:lr_01/.test(e)), unlocked: S.racesList().map((d) => d.id + ':' + d.unlocked).join(','), racersLeft: GTP.Entities.list.filter((e) => e.tag === 'racer' && !e.removed).length };
    T_.reset();
    return out;
  });
  console.log('  race finish: ' + JSON.stringify(r));
  t.assert(r.aiFinish > 0 && r.wrecked < 3, 'an AI racer finished the Upper Loop in ' + r.aiFinish + ' s (checkpoints ' + r.racerCps.join(',') + ')');
  t.assert(!r.finish.active && r.finish.strand === null && r.finish.finishes === 1 && r.finish.best > 0 && r.finish.events.length === 1 && /lr_02:true/.test(r.finish.unlocked) && r.finish.racersLeft === 0, 'the player finishes, a time is kept, lr_02 unlocks, the field is cleared: ' + JSON.stringify(r.finish));

  // ---- 7. Stunt Jump sj_07 ----
  r = await page.evaluate(() => {
    const S = GTP.Strands, p = GTP.game.player, money0 = p.money, subs0 = p.subs;
    const ramp = S.stunts.ramp('sj_07');
    const out = { ramp: ramp ? { x: Math.round(ramp.x), z: Math.round(ramp.z), heading: ramp.heading, landing: ramp.landing, minAir: ramp.minAir } : null };
    if (!ramp) return out;
    // a 40 m run-up: about 30 m/s off the wedge lands on the beach; flat out from further back a sports car clears the sand into the sea
    const f = GTP.util.yawToDir(ramp.yaw);
    const car = GTP.game.debug.spawnVehicle(ramp.x - f.x * 40, ramp.z - f.z * 40, 'sports', { yaw: ramp.yaw });
    const inCar = T_.enter(car);
    GTP.Input.set('forward', true);
    const s1 = T_.until(() => T_.events.some((e) => /stunt:launch:sj_07/.test(e)), 12, 0.1);
    out.launch = { inCar, s: s1, speed: +car.speed2d().toFixed(1), vy: +car.vy.toFixed(1), air: !!S.stunts.air, slow: GTP.game.timeScale };
    let maxY = car.y, airT = 0;
    const s2 = T_.until(() => { maxY = Math.max(maxY, car.y); airT = S.stunts.air ? S.stunts.air.airT : airT; return T_.events.some((e) => /stunt:land:sj_07/.test(e)); }, 6, 0.05);
    GTP.Input.set('forward', false);
    GTP.game.advance(0.5);
    out.land = { s: s2, maxY: +maxY.toFixed(1), airT: +airT.toFixed(2), scale: GTP.game.timeScale, done: S.progress().stunt_jumps.done, best: S.progress().stunt_jumps.best.sj_07, money: p.money - money0, subs: p.subs - subs0, wreck: car.wreck, dist: +Math.hypot(car.x - ramp.landing.x, car.z - ramp.landing.z).toFixed(0), events: T_.events.filter((e) => /stunt/.test(e)) };
    T_.reset();
    return out;
  });
  console.log('  stunt: ' + JSON.stringify(r));
  t.assert(r.ramp && r.launch.inCar && r.launch.s > 0 && r.launch.speed > 15 && r.launch.vy > 3 && r.launch.air, 'the car leaves the runway wedge fast with lift: ' + JSON.stringify(r.launch));
  t.assert(r.land.s > 0 && r.land.airT >= 1 && r.land.maxY > 2, 'the car flew for ' + r.land.airT + ' s, peaking at y ' + r.land.maxY);
  t.assert(r.land.done.indexOf('sj_07') >= 0 && r.land.money === 500 && r.land.subs === 1000 && r.land.scale === 1 && !r.land.wreck && r.land.dist <= 30, 'STUNT PUNDIT: the landing counted once ($500, +1000 subs) on the beach, time normal again: ' + JSON.stringify(r.land));

  // ---- 8. the surfaces ----
  r = await page.evaluate(() => {
    const S = GTP.Strands, M = GTP.Missions;
    const mk = S.markers(), icons = {};
    mk.forEach((m) => { icons[m.icon] = (icons[m.icon] || 0) + 1; });
    const all = M.allMarkers().length, base = M.markers().length;
    const data = GTP.game.serialize(1);
    return { icons, all, base, hud: S.hud(), summary: S.summary().map((s) => s.id + ': ' + s.line), saved: { strands: Object.keys(data.strands), memos: data.memos.length, fares: data.strands.loud_cab.fares, stunts: data.strands.stunt_jumps.done } , subs: M.subscribers() };
  });
  console.log('  surfaces: ' + JSON.stringify(r));
  t.assert(r.icons.rampage === 7 && r.icons.race >= 2 && r.icons.home === 1 && r.all === r.base + Object.values(r.icons).reduce((a, b) => a + b, 0), 'markers(): seven live rampage bubbles (rr_01 on cooldown), the open races, the home icon; allMarkers() adds them to the mission markers');
  t.assert(r.hud.active === null && r.summary.length === 7 && r.saved.strands.length === 7 && r.saved.memos === 10 && r.saved.fares === 1 && r.saved.stunts.indexOf('sj_07') >= 0, 'hud(), summary() and the save hook carry the progress: ' + r.summary.join(' | '));
  t.assert(r.subs.count > 3000 && r.subs.name, 'the subscribers counter moved with the strands: ' + JSON.stringify(r.subs));

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
