/* missions.js: the objective interpreter, spawns, markers, dialogue and the fail/abort paths (09_missions).
 *  1 one synthetic mission per objective type, driven to completion through the real checks
 *    (goto drive_to enter_vehicle pickup defeat destroy escape_wanted survive follow minigame timer_wrap dialogue)
 *  2 the real m00_intro and m01_van driven to completion from ?mission=
 *  3 vehicle_lost fails the mission and cleans up tagged entities and markers
 *  4 abort cleans up
 *  5 markers(): m00_intro at campus_quad on a new game, m01_van at pod_garage after it
 *  6 the requires chain across all 17 missions is a DAG and every landmark / giver / cast id resolves
 * Screenshots in tests/out: missions_marker_quad.png (blue light at the quad, chase cam), missions_objective_van.png (yellow light on a tagged van). */
'use strict';
const H = require('./_harness');

H.run('missions', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;

  await page.evaluate(() => {
    window.T_ = {
      events: [],
      reg(m) { GTP.Missions.registerTest(m); return m.id; },
      start(m, opts) { T_.reg(m); const ok = GTP.Missions.start(m.id, Object.assign({ skipIntro: true }, opts || {})); GTP.game.advance(1 / 60); return ok; },
      // advance in `step` s slices until pred() or maxSec; returns the seconds spent or -1
      until(pred, maxSec, step) { step = step || 0.25; let s = 0; while (s < maxSec) { GTP.game.advance(step); s += step; if (pred()) return s; } return -1; },
      done() { return GTP.Missions.state.active === null; },
      door(id) { const lm = GTP.World.landmark(id); return { x: lm.door.x, z: lm.door.z }; },
      tp(x, z) { GTP.game.debug.teleport(x, z); },
      ctx() { const c = GTP.Missions.current(); return c ? c.ctx : null; },
      def() { const c = GTP.Missions.current(); return c ? c.def : null; },
      mine() { return GTP.Entities.list.filter((e) => e.mission && !e.removed); },
      press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); },
      enter(v) { const d = v.doorWorld(0); T_.tp(d.x, d.z); GTP.game.advance(0.1); T_.press('enter'); GTP.game.advance(0.7); return GTP.game.player.inVehicle === v; },
      reset() { const p = GTP.game.player; if (p.inVehicle) p.exitVehicle(); if (GTP.Missions.state.active) GTP.Missions.abort(); GTP.game.debug.godMode(false); GTP.AI.wanted.clear(); GTP.game.advance(0.1); },
      base(id, objectives, extra) { return Object.assign({ id, title: 'T ' + id, giver: 'gus', marker: 'campus_quad', requires: [], reward: 10, intro: [], outro: [], objectives, failOn: ['player_dead'] }, extra || {}); },
      lookAt(x, z) { const p = GTP.game.player; GTP.Render.rig.yaw = GTP.util.dirToYaw(x - p.x, z - p.z); GTP.Render.rig.pitch = 0.18; GTP.Render.rig.snap(); GTP.game.advance(0.3); }
    };
    ['start', 'objective', 'objectiveDone', 'complete', 'fail', 'abort', 'dialogue', 'minigame'].forEach((ev) => GTP.Events.on('mission:' + ev, (e) => T_.events.push(ev + ':' + (e.id || (e.mission && e.mission.id) || e.game || ''))));
  });

  // ---- 6. the campaign data: a DAG with resolvable ids ----
  const data = await page.evaluate(() => {
    const M = GTP.Content.missions, byId = {}, errs = [];
    M.forEach((m) => { byId[m.id] = m; });
    const lm = (id, where) => { const l = GTP.World.landmark(id); if (!l) errs.push(where + ': unknown landmark ' + id); else if (!l.door) errs.push(where + ': landmark without a door ' + id); };
    const cast = (id, where) => { if (!GTP.Content.cast[id] && !(GTP.Content.looks.roles[id])) errs.push(where + ': unknown cast / role ' + id); };
    const state = {};
    const visit = (id, chain) => {
      if (state[id] === 2) return; if (state[id] === 1) { errs.push('cycle: ' + chain.concat(id).join(' -> ')); return; }
      state[id] = 1; (byId[id].requires || []).forEach((r) => { if (!byId[r]) errs.push(id + ' requires unknown ' + r); else visit(r, chain.concat(id)); }); state[id] = 2;
    };
    M.forEach((m) => {
      visit(m.id, []);
      lm(m.marker, m.id + '.marker'); cast(m.giver, m.id + '.giver');
      if (!m.objectives.length) errs.push(m.id + ': no objectives');
      if ((m.failOn || []).indexOf('player_dead') < 0) errs.push(m.id + ': failOn lacks player_dead');
      const walk = (o, where) => {
        if (o.target && o.target.landmark) lm(o.target.landmark, where);
        const sp = o.spawn || {};
        if (sp.at && sp.at.landmark) lm(sp.at.landmark, where); if (sp.around && sp.around.landmark) lm(sp.around.landmark, where);
        (sp.path || []).forEach((p) => { if (p.landmark) lm(p.landmark, where); });
        if (sp.ped) cast(sp.ped, where);
        if (sp.type && !GTP.C.VEHICLES[sp.type]) errs.push(where + ': unknown vehicle type ' + sp.type);
        if (sp.vehicle && !GTP.C.VEHICLES[sp.vehicle]) errs.push(where + ': unknown vehicle type ' + sp.vehicle);
        if (o.type === 'timer_wrap') (o.objectives || []).forEach((oo, k) => walk(oo, where + '/' + k));
        (o.lines || []).concat(m.intro, m.outro).forEach((l) => { if (!GTP.Content.cast[l.who]) errs.push(where + ': dialogue who ' + l.who); });
      };
      m.objectives.forEach((o, i) => walk(o, m.id + '.obj' + i));
    });
    const endings = GTP.Content.endingMissions;
    endings.forEach((id) => { if (!byId[id] || byId[id].requires.indexOf('m14_grift') < 0) errs.push('ending ' + id + ' must require m14_grift'); });
    return { count: M.length, errs, chainLen: Object.keys(byId).filter((id) => byId[id].requires.length).length };
  });
  console.log('  data: ' + JSON.stringify(data));
  t.assert(data.count === 17, '17 missions, got ' + data.count);
  t.assert(data.errs.length === 0, 'mission data problems:\n' + data.errs.join('\n'));

  // ---- 5a. a new game: the first marker is at the quad, the giver and Kip stand beside it ----
  const first = await page.evaluate(() => {
    GTP.game.advance(0.5);
    const mk = GTP.Missions.markers(), d = T_.door('campus_quad');
    const peds = GTP.Entities.list.filter((e) => e.kind === 'ped' && e.ai && e.ai.mission === 'giver').map((e) => e.castId);
    return { markers: mk, dist: mk.length ? Math.hypot(mk[0].x - d.x, mk[0].z - d.z) : -1, peds, state: GTP.game.state, active: GTP.Missions.state.active };
  });
  console.log('  first marker: ' + JSON.stringify(first));
  t.assert(first.markers.length === 1 && first.markers[0].id === 'm00_intro' && first.markers[0].kind === 'mission' && first.dist < 0.5, 'a new game lists m00_intro at the campus_quad door');
  t.assert(first.peds.indexOf('gus') >= 0 && first.peds.indexOf('kip') >= 0, 'Gus and Kip stand at the marker: ' + first.peds.join(','));
  t.assert(first.active === null && first.state === 'playing', 'spawning inside the marker does not start the mission by itself');

  // screenshot: the blue light at the quad from the chase camera
  await page.evaluate(() => {
    const mk = GTP.Missions.markers()[0];
    T_.tp(mk.x + 1.5, mk.z + 8); GTP.game.advance(0.2);
    T_.lookAt(mk.x, mk.z); GTP.game.advance(0.4);
  });
  const shot1 = await t.shot(page, 'missions_marker_quad');
  console.log('  shot: ' + shot1);

  // ---- 1. one synthetic mission per objective type ----
  // goto
  let r = await page.evaluate(() => {
    const m = T_.base('t_goto', [{ type: 'goto', target: { landmark: 'dorm_studio' }, radius: 48, text: 'Get to the dorm' }]);
    const money0 = GTP.game.player.money;
    const ok = T_.start(m);
    const mk = GTP.Missions.markers();
    const before = T_.done();
    const d = T_.door('dorm_studio'); T_.tp(d.x, d.z);
    const s = T_.until(T_.done, 5);
    return { ok, mk, before, s, completed: GTP.Missions.state.completed.has('t_goto'), money: GTP.game.player.money - money0, text: GTP.Missions.state.objectiveText, errors: GTP.errors.length };
  });
  console.log('  goto: ' + JSON.stringify(r));
  t.assert(r.ok && !r.before && r.s > 0 && r.completed && r.money === 10, 'goto completes on arrival and pays the reward');
  t.assert(r.mk.length === 1 && r.mk[0].kind === 'objective', 'an objective marker stood at the target');

  // drive_to (any vehicle)
  r = await page.evaluate(() => {
    T_.reset();
    const q = T_.door('campus_quad'), v = GTP.game.debug.spawnVehicle(q.x + 12, q.z + 6, 'sedan', { yaw: 0 });
    const m = T_.base('t_drive', [{ type: 'drive_to', target: { landmark: 'pod_garage' }, vehicle: 'any', text: 'Drive to the garage' }]);
    T_.start(m);
    const inCar = T_.enter(v);
    const g = T_.door('pod_garage'); T_.tp(g.x, g.z + 2);
    const s = T_.until(T_.done, 5);
    return { inCar, s, completed: GTP.Missions.state.completed.has('t_drive'), vehicle: GTP.game.player.inVehicle ? GTP.game.player.inVehicle.type : null };
  });
  console.log('  drive_to: ' + JSON.stringify(r));
  t.assert(r.inCar && r.s > 0 && r.completed, 'drive_to completes when the car reaches the target');

  // enter_vehicle (a tagged van spawned at the garage) + the objective marker screenshot
  r = await page.evaluate(() => {
    T_.reset();
    const m = T_.base('t_enter', [{ type: 'enter_vehicle', spawn: { type: 'van', tag: 'podvan', at: { landmark: 'pod_garage' }, wrap: 'pod', color: '#f2f2f2' }, text: 'Get in the pod van' }]);
    T_.start(m);
    const c = T_.ctx(), v = c && c.vehicle, g = T_.door('pod_garage');
    if (!v) return { noVehicle: true };
    const x0 = v.x, z0 = v.z;
    // a look at the van and its light for the screenshot: a free camera off the van's rear corner, the player in frame
    const f = GTP.util.yawToDir(v.yaw), side = { x: -f.z, z: f.x };
    T_.tp(v.x + side.x * 4.5 - f.x * 6, v.z + side.z * 4.5 - f.z * 6); GTP.game.advance(0.4);
    GTP.game.debug.freeCam(v.x - side.x * 5 - f.x * 12, v.y + 4.6, v.z - side.z * 5 - f.z * 12, v.x, v.y + 1.4, v.z);
    const mk = GTP.Missions.markers();
    return { tag: v.tag, type: v.type, wrap: v.wrap, persistent: v.persistent, distToDoor: Math.hypot(v.x - g.x, v.z - g.z), onTile: GTP.World.tileAt(v.x, v.z), mk, drift: +Math.hypot(v.x - x0, v.z - z0).toFixed(2), markerOnVan: mk.length === 1 && Math.hypot(mk[0].x - v.x, mk[0].z - v.z) < 0.5 };
  });
  console.log('  enter_vehicle spawn: ' + JSON.stringify(r));
  t.assert(!r.noVehicle && r.tag === 'podvan' && r.type === 'van' && r.wrap === 'pod' && r.persistent, 'a tagged, wrapped, persistent van spawned');
  t.assert(r.distToDoor < 50 && (r.onTile === 7 || r.onTile === 1), 'the van sits on a parking bay or the road near the garage door: ' + r.distToDoor + ' m, tile ' + r.onTile);
  t.assert(r.markerOnVan && r.drift < 0.3, 'the objective marker follows the van, which sits still where it spawned (drift ' + r.drift + ' m)');
  const shot2 = await t.shot(page, 'missions_objective_van');
  console.log('  shot: ' + shot2);
  r = await page.evaluate(() => {
    GTP.game.debug.followCam();
    const v = T_.ctx().vehicle;
    const inCar = T_.enter(v);
    const s = T_.until(T_.done, 4);
    return { inCar, s, completed: GTP.Missions.state.completed.has('t_enter'), stillTagged: v.tag, persistent: v.persistent, inVan: GTP.game.player.inVehicle === v };
  });
  console.log('  enter_vehicle: ' + JSON.stringify(r));
  t.assert(r.inCar && r.s > 0 && r.completed && r.inVan && !r.persistent, 'enter_vehicle completes in the driver seat; the van stays with the player, no longer persistent');

  // pickup: three crates around the dorm, collected by walking onto them
  r = await page.evaluate(() => {
    T_.reset();
    const m = T_.base('t_pickup', [{ type: 'pickup', spawn: { pickupType: 'mission', count: 3, around: { landmark: 'dorm_studio' }, radius: 160, label: ['LEGS', 'TOP', 'SIGN'] }, text: 'Grab the parts' }]);
    T_.start(m);
    const c = T_.ctx(), d = T_.door('dorm_studio');
    const pks = c.pickups.map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), label: p.label, type: p.pickupType, dist: +Math.hypot(p.x - d.x, p.z - d.z).toFixed(1), tile: GTP.World.tileAt(p.x, p.z) }));
    const texts = [];
    for (const p of c.pickups) { T_.tp(p.x, p.z); GTP.game.advance(0.3); texts.push(GTP.Missions.state.objectiveText); }
    const s = T_.until(T_.done, 3);
    return { pks, texts, s, completed: GTP.Missions.state.completed.has('t_pickup'), left: GTP.Entities.list.filter((e) => e.kind === 'pickup' && e.pickupType === 'mission' && !e.removed).length, fxTexts: GTP.Render.fx.texts.length };
  });
  console.log('  pickup: ' + JSON.stringify(r));
  t.assert(r.pks.length === 3 && r.pks.every((p) => p.type === 'mission' && p.dist <= 22 && p.tile !== 3 && p.tile !== 5), 'three mission crates within 20 m of the dorm on open ground');
  t.assert(r.texts[0].indexOf('(1/3)') > 0 && r.texts[1].indexOf('(2/3)') > 0, 'objective text carries the progress: ' + r.texts.join(' | '));
  t.assert(r.s > 0 && r.completed && r.left === 0, 'pickup completes after the third crate');

  // defeat: two goons, punched out with Combat.damage; no heat for self-defence
  r = await page.evaluate(() => {
    T_.reset();
    const m = T_.base('t_defeat', [{ type: 'defeat', spawn: { ped: 'thug', count: 2, around: { landmark: 'campus_quad' }, radius: 150 }, text: 'Clear the quad' }]);
    T_.start(m);
    const c = T_.ctx(), p = GTP.game.player, q = T_.door('campus_quad');
    T_.tp(q.x, q.z);
    const spawned = c.peds.map((h) => ({ role: h.role, hostile: !!h.hostile, brain: h.ai && h.ai.mission, dist: +Math.hypot(h.x - q.x, h.z - q.z).toFixed(1) }));
    GTP.game.advance(2);
    const approach = c.peds.map((h) => +Math.hypot(h.x - p.x, h.z - p.z).toFixed(1));
    const heat0 = GTP.AI.wanted.heat;
    c.peds.forEach((h) => GTP.Combat.damage(h, 999, p, 'fist'));
    GTP.game.advance(0.5);
    const notDoneYet = !T_.done();
    const s = T_.until(T_.done, 6);
    return { spawned, approach, notDoneYet, s, completed: GTP.Missions.state.completed.has('t_defeat'), heat: GTP.AI.wanted.heat - heat0, wanted: GTP.AI.wanted.level };
  });
  console.log('  defeat: ' + JSON.stringify(r));
  t.assert(r.spawned.length === 2 && r.spawned.every((h) => h.role === 'thug' && h.hostile && h.brain === 'hostile'), 'two hostile thugs spawned near the quad');
  t.assert(r.approach.every((d) => d < 40), 'the goons close in on the player: ' + r.approach.join(','));
  t.assert(r.notDoneYet && r.s >= 2.5 && r.completed, 'defeat completes 3 s after the last goon is down');
  t.assert(r.heat === 0 && r.wanted === 0, 'beating mission goons adds no heat: ' + r.heat);

  // destroy: a parked van, set alight with applyDamage
  r = await page.evaluate(() => {
    T_.reset();
    const m = T_.base('t_destroy', [{ type: 'destroy', spawn: { vehicle: 'van', count: 1, tag: 'news', around: { landmark: 'campus_quad' }, radius: 200 }, text: 'Wreck the van' }]);
    T_.start(m);
    const c = T_.ctx(), v = c.vehicles[0];
    const mk = GTP.Missions.markers().length;
    v.applyDamage(999, GTP.game.player, 'smg');
    GTP.game.advance(1);
    const burning = v.burning && !T_.done();
    const s = T_.until(T_.done, 8);
    return { count: c.vehicles.length, tag: v.tag, mk, burning, s, wreck: v.wreck, completed: GTP.Missions.state.completed.has('t_destroy'), markersLeft: GTP.Missions.markers().filter((k) => k.kind === 'objective').length };
  });
  console.log('  destroy: ' + JSON.stringify(r));
  t.assert(r.count === 1 && r.tag === 'news' && r.mk === 1 && r.burning, 'one tagged target van with a marker, burning after the hit');
  t.assert(r.s > 0 && r.wreck && r.completed && r.markersLeft === 0, 'destroy completes once the van is a wreck');

  // escape_wanted: two stars set, lost by hiding far from the last known position
  r = await page.evaluate(() => {
    T_.reset();
    const m = T_.base('t_escape', [{ type: 'escape_wanted', setWanted: 2, text: 'Lose the cops' }]);
    T_.start(m);
    GTP.game.advance(0.2);
    const stars = GTP.AI.wanted.level, pstars = GTP.game.player.wanted;
    const far = T_.door('fish_shack'); T_.tp(far.x, far.z);
    const s = T_.until(T_.done, 60, 1);
    return { stars, pstars, s, completed: GTP.Missions.state.completed.has('t_escape'), level: GTP.AI.wanted.level };
  });
  console.log('  escape_wanted: ' + JSON.stringify(r));
  t.assert(r.stars === 2 && r.pstars === 2, 'escape_wanted sets two stars');
  t.assert(r.s > 5 && r.completed && r.level === 0, 'escape_wanted completes when the stars are gone (' + r.s + ' s)');

  // survive: waves of goons for 12 s with god mode on
  r = await page.evaluate(() => {
    T_.reset();
    GTP.game.debug.godMode(true);
    const q = T_.door('campus_quad'); T_.tp(q.x, q.z);
    const m = T_.base('t_survive', [{ type: 'survive', seconds: 12, waves: { thug: 4, protester: 2 }, text: 'Hold the table' }]);
    T_.start(m);
    let maxLive = 0, prog = null, s = 0;
    while (s < 14 && !T_.done()) { GTP.game.advance(0.5); s += 0.5; const live = GTP.Entities.list.filter((e) => e.kind === 'ped' && e.hostile && e.alive && !e.removed).length; maxLive = Math.max(maxLive, live); if (!prog && GTP.Missions.state.progress) prog = GTP.Missions.state.progress; }
    const roles = GTP.Entities.list.filter((e) => e.kind === 'ped' && e.missionRole === 'hostile').map((e) => e.role);
    GTP.game.advance(1);
    const released = GTP.Entities.list.filter((e) => e.kind === 'ped' && e.hostile).length;
    GTP.game.debug.godMode(false);
    return { s, maxLive, prog, completed: GTP.Missions.state.completed.has('t_survive'), hp: GTP.game.player.hp, roles, released };
  });
  console.log('  survive: ' + JSON.stringify(r));
  t.assert(r.maxLive >= 3 && r.roles.indexOf('thug') >= 0 && r.roles.indexOf('protester') >= 0, 'waves of thugs and protesters arrived (max live ' + r.maxLive + ')');
  t.assert(r.completed && r.s >= 11.5 && r.s <= 13.5 && r.hp === 100, 'survive completes after its seconds (' + r.s + ' s)');
  t.assert(r.released === 0, 'survivors were released to the city');

  // follow: tail Dr. Footnote from the quad to the dorm at a safe distance (her own trail is the path)
  r = await page.evaluate(() => {
    T_.reset();
    const q = T_.door('campus_quad'); T_.tp(q.x, q.z);
    const m = T_.base('t_follow', [{ type: 'follow', spawn: { ped: 'footnote', at: { landmark: 'campus_quad' }, path: [{ landmark: 'dorm_studio' }] }, maxDist: 400, text: 'Tail Dr. Footnote' }]);
    T_.start(m);
    const c = T_.ctx(), f = c.ped, p = GTP.game.player;
    const look = f.look && f.look.hair, name = f.name;
    // step back out of her sight line, then follow her trail from ~12 m behind
    const away = GTP.util.yawToDir(f.yaw); T_.tp(f.x - away.x * 9, f.z - away.z * 9);
    const trail = []; let s = 0, minD = 1e9, maxD = 0, moved = 0, last = { x: f.x, z: f.z };
    while (s < 150 && !T_.done()) {
      GTP.game.advance(0.5); s += 0.5;
      trail.push({ x: f.x, z: f.z, y: f.y });
      moved += Math.hypot(f.x - last.x, f.z - last.z); last = { x: f.x, z: f.z };
      for (let i = trail.length - 1; i >= 0; i--) { const tr = trail[i]; if (Math.hypot(tr.x - f.x, tr.z - f.z) >= 11) { T_.tp(tr.x, tr.z); break; } }
      const d = Math.hypot(p.x - f.x, p.z - f.z); minD = Math.min(minD, d); maxD = Math.max(maxD, d);
    }
    const dd = T_.door('dorm_studio');
    return { name, look, s, moved: +moved.toFixed(1), minD: +minD.toFixed(1), maxD: +maxD.toFixed(1), completed: GTP.Missions.state.completed.has('t_follow'), failed: GTP.Missions.state.failed.t_follow || 0, endDist: +Math.hypot(f.x - dd.x, f.z - dd.z).toFixed(1), alive: f.alive };
  });
  console.log('  follow: ' + JSON.stringify(r));
  t.assert(r.look === 'bun' && /Footnote/.test(r.name), 'the follow target wears the cast look');
  t.assert(r.completed && !r.failed, 'follow completes when she reaches the dorm (' + r.s + ' s, walked ' + r.moved + ' m, end ' + r.endDist + ' m from the door)');
  t.assert(r.moved > 25 && r.endDist < 6, 'she actually walked the route');

  // minigame: a win completes, a loss fails
  r = await page.evaluate(() => {
    T_.reset();
    const m = T_.base('t_debate', [{ type: 'minigame', game: 'debate', params: { rounds: 1 }, text: 'Win' }]);
    T_.start(m);
    const st = GTP.game.state, mg = GTP.Missions.state.minigame;
    GTP.Missions._resolveMinigame(true);
    const s = T_.until(T_.done, 2);
    const win = { st, mg, s, completed: GTP.Missions.state.completed.has('t_debate'), after: GTP.game.state };
    const m2 = T_.base('t_ratio', [{ type: 'minigame', game: 'ratio', params: { posts: 5 }, text: 'Ratio' }]);
    T_.start(m2);
    GTP.Missions._resolveMinigame(false);
    const s2 = T_.until(T_.done, 2);
    return { win, lose: { s: s2, failed: GTP.Missions.state.failed.t_ratio, completed: GTP.Missions.state.completed.has('t_ratio'), state: GTP.game.state, ev: T_.events.filter((e) => e === 'fail:t_ratio').length } };
  });
  console.log('  minigame: ' + JSON.stringify(r));
  t.assert(r.win.st === 'minigame' && r.win.mg && r.win.mg.game === 'debate' && r.win.completed && r.win.after === 'playing', 'a won minigame completes the objective and returns to playing');
  t.assert(r.lose.failed === 1 && !r.lose.completed && r.lose.state === 'playing' && r.lose.ev === 1, 'a lost minigame fails the mission');

  // timer_wrap: success inside the time, failure when it runs out
  r = await page.evaluate(() => {
    T_.reset();
    const q = T_.door('campus_quad'); T_.tp(q.x + 20, q.z);
    const m = T_.base('t_timer', [{ type: 'timer_wrap', seconds: 5, objectives: [{ type: 'goto', target: { landmark: 'campus_quad' }, radius: 48, text: 'Back to the table' }] }]);
    T_.start(m);
    GTP.game.advance(1);
    const timer = GTP.Missions.state.timer ? Object.assign({}, GTP.Missions.state.timer) : null;
    T_.tp(q.x, q.z);
    const s = T_.until(T_.done, 3);
    const ok = { timer, s, completed: GTP.Missions.state.completed.has('t_timer'), timerAfter: GTP.Missions.state.timer };
    const m2 = T_.base('t_timeout', [{ type: 'timer_wrap', seconds: 2, objectives: [{ type: 'goto', target: { landmark: 'stadium' }, radius: 48, text: 'Too far' }] }]);
    T_.start(m2);
    const s2 = T_.until(T_.done, 5);
    const ev = T_.events.filter((e) => e === 'fail:t_timeout').length;
    return { ok, out: { s: s2, failed: GTP.Missions.state.failed.t_timeout, ev } };
  });
  console.log('  timer_wrap: ' + JSON.stringify(r));
  t.assert(r.ok.timer && r.ok.timer.total === 5 && r.ok.timer.remaining < 4.2 && r.ok.timer.remaining > 3.6, 'the HUD timer counts down: ' + JSON.stringify(r.ok.timer));
  t.assert(r.ok.completed && r.ok.timerAfter === null, 'the wrapped goto completed in time');
  t.assert(r.out.failed === 1 && r.out.s > 1.5 && r.out.s < 3.5 && r.out.ev === 1, 'the timeout fails the mission at 2 s (' + r.out.s + ')');

  // dialogue: lines show in a cutscene, auto-advance, and confirm skips a line
  r = await page.evaluate(() => {
    T_.reset();
    const m = T_.base('t_talk', [{ type: 'dialogue', lines: [{ who: 'gus', text: 'One.' }, { who: 'kip', text: 'Two. Is this paid?' }, { who: 'chyron', text: 'BREAKING.', ticker: true }, { who: 'player', text: 'Three.' }] }]);
    T_.start(m);
    GTP.game.advance(0.5);
    const first = { state: GTP.game.state, line: GTP.Missions.state.dialogue[0], queued: GTP.Missions.state.dialogue.length };
    GTP.game.advance(2.3);   // past 2.5 s: line two
    const second = GTP.Missions.state.dialogue[0] && GTP.Missions.state.dialogue[0].who;
    T_.press('confirm'); GTP.game.advance(0.3);
    const third = GTP.Missions.state.dialogue[0] && GTP.Missions.state.dialogue[0].who;
    const s = T_.until(T_.done, 6);
    return { first, second, third, s, completed: GTP.Missions.state.completed.has('t_talk'), state: GTP.game.state };
  });
  console.log('  dialogue: ' + JSON.stringify(r));
  t.assert(r.first.state === 'cutscene' && r.first.line && r.first.line.who === 'gus' && r.first.line.name === 'Gus Pemberton' && r.first.queued === 4, 'a dialogue objective enters a cutscene with the first line');
  t.assert(r.second === 'kip' && r.third === 'player', 'lines auto-advance after 2.5 s and confirm skips one (ticker lines never block)');
  t.assert(r.completed && r.state === 'playing', 'the dialogue objective completes and play resumes');

  // ---- 3. vehicle_lost fails the mission and cleans up ----
  r = await page.evaluate(() => {
    T_.reset();
    const m = T_.base('t_lost', [
      { type: 'enter_vehicle', spawn: { type: 'van', tag: 'van2', at: { landmark: 'campus_quad' } }, text: 'Get in' },
      { type: 'pickup', spawn: { pickupType: 'mission', count: 2, around: { landmark: 'campus_quad' }, radius: 100 }, text: 'Collect' },
      { type: 'goto', target: { landmark: 'stadium' }, radius: 48, text: 'Far away' }
    ], { failOn: ['player_dead', 'vehicle_lost:van2'] });
    T_.start(m);
    const v = T_.ctx().vehicle;
    T_.enter(v); GTP.game.advance(0.3);
    const second = T_.def() && T_.def().type, mine = T_.mine().length;
    GTP.game.player.exitVehicle(); GTP.game.advance(0.2);
    const q = T_.door('campus_quad'); T_.tp(q.x + 15, q.z + 15);
    v.applyDamage(999, null, 'smg');
    const s = T_.until(T_.done, 8);
    const ev = T_.events.filter((e) => e === 'fail:t_lost').length;
    return { second, mine, s, failed: GTP.Missions.state.failed.t_lost, ev, left: T_.mine().map((e) => e.kind + (e.tag ? ':' + e.tag : '')), vanGone: v.removed, markers: GTP.Missions.markers().map((k) => k.kind + ':' + k.id), state: GTP.game.state, text: GTP.Missions.state.objectiveText };
  });
  console.log('  vehicle_lost: ' + JSON.stringify(r));
  t.assert(r.second === 'pickup' && r.mine >= 3, 'the van and the crates were tagged mission entities');
  t.assert(r.s > 0 && r.failed === 1 && r.ev === 1, 'losing the tagged van fails the mission');
  t.assert(r.left.length === 0 && r.vanGone, 'the fail path removed every tagged entity: ' + r.left.join(','));
  t.assert(r.markers.length === 1 && r.markers[0] === 'mission:m00_intro' && r.state === 'playing' && r.text === '', 'objective markers gone, the mission marker is back');

  // ---- 4. abort cleans up ----
  r = await page.evaluate(() => {
    T_.reset();
    const m = T_.base('t_abort', [
      { type: 'pickup', spawn: { pickupType: 'mission', count: 3, around: { landmark: 'campus_quad' }, radius: 100 }, text: 'Collect' },
      { type: 'goto', target: { landmark: 'stadium' }, radius: 48, text: 'Far' }
    ]);
    T_.start(m);
    const before = T_.mine().length, mkBefore = GTP.Missions.markers().length;
    const ok = GTP.Missions.abort();
    GTP.game.advance(0.2);
    return { before, mkBefore, ok, after: T_.mine().length, pickups: GTP.Entities.list.filter((e) => e.kind === 'pickup' && e.pickupType === 'mission' && !e.removed).length, active: GTP.Missions.state.active, markers: GTP.Missions.markers().map((k) => k.kind), ev: T_.events.filter((e) => e === 'abort:t_abort').length, failed: GTP.Missions.state.failed.t_abort || 0 };
  });
  console.log('  abort: ' + JSON.stringify(r));
  t.assert(r.before === 3 && r.ok && r.after === 0 && r.pickups === 0 && r.active === null && r.ev === 1 && r.failed === 0, 'abort removes the spawned entities without counting a failure');
  t.assert(r.markers.length === 1 && r.markers[0] === 'mission', 'abort restores the available-mission markers');

  // ---- 2. the real missions from ?mission= ----
  let errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors on the synthetic page:\n' + errs.join('\n'));
  await page.close();

  const c0 = await t.boot({ seed: 7, mission: 'm00_intro' });
  r = await c0.page.evaluate(() => {
    const M = GTP.Missions, st = M.state, p = GTP.game.player, out = { steps: [] };
    const until = (pred, max) => { let s = 0; while (s < max) { GTP.game.advance(0.25); s += 0.25; if (pred()) return s; } return -1; };
    const cur = () => M.current();
    const money0 = p.money;
    out.boot = { state: GTP.game.state, active: st.active, obj: st.objectiveText, atDoor: Math.hypot(p.x - GTP.World.landmark('campus_quad').door.x, p.z - GTP.World.landmark('campus_quad').door.z) };
    // 1 goto the dorm
    let d = GTP.World.landmark('dorm_studio').door; GTP.game.debug.teleport(d.x, d.z);
    out.steps.push(until(() => cur() && cur().def.type === 'pickup', 4));
    // 2 three crates
    const pks = cur().ctx.pickups.slice();
    out.labels = pks.map((k) => k.label);
    for (const k of pks) { GTP.game.debug.teleport(k.x, k.z); GTP.game.advance(0.3); }
    out.steps.push(until(() => cur() && cur().def.type === 'goto', 4));
    // 3 back to the quad
    d = GTP.World.landmark('campus_quad').door; GTP.game.debug.teleport(d.x, d.z);
    out.steps.push(until(() => GTP.game.state === 'minigame', 4));
    out.minigame = st.minigame;
    M._resolveMinigame(true);
    out.steps.push(until(() => GTP.game.state === 'cutscene', 2));
    out.outro = st.dialogue.map((l) => l.who);
    out.steps.push(until(() => st.active === null, 12));
    out.result = { completed: Array.from(st.completed), flags: Object.assign({}, st.flags), money: p.money - money0, state: GTP.game.state, markers: M.markers().map((k) => k.kind + ':' + k.id + '@' + k.landmark) };
    return out;
  });
  console.log('  m00_intro: ' + JSON.stringify(r));
  t.assert(r.boot.state === 'playing' && r.boot.active === 'm00_intro' && r.boot.obj === 'Get to Dorm 4B' && r.boot.atDoor < 1, '?mission=m00_intro boots into the mission at the quad');
  t.assert(r.steps.every((s) => s > 0), 'every m00 objective advanced: ' + r.steps.join(','));
  t.assert(r.labels.join(',') === 'TABLE LEGS,TABLE TOP,THE SIGN' && r.minigame && r.minigame.game === 'debate' && r.minigame.params.opponent === 'freshman', 'the crates are labelled and the debate is against the freshman');
  t.assert(r.outro.join(',') === 'player,gus,kip', 'the outro queued in order: ' + r.outro.join(','));
  t.assert(r.result.completed.indexOf('m00_intro') >= 0 && r.result.flags.has_table === true && r.result.money === 100 && r.result.state === 'playing', 'm00 completed with its flag and $100: ' + JSON.stringify(r.result));
  t.assert(r.result.markers.length === 1 && r.result.markers[0] === 'mission:m01_van@pod_garage', 'after m00 the marker list is m01_van at pod_garage: ' + r.result.markers.join(','));
  errs = await t.errors(c0);
  t.assert(errs.length === 0, 'errors on the m00 page:\n' + errs.join('\n'));
  await c0.page.close();

  const c1 = await t.boot({ seed: 7, mission: 'm01_van' });
  r = await c1.page.evaluate(() => {
    const M = GTP.Missions, st = M.state, p = GTP.game.player, out = { steps: [] };
    const until = (pred, max) => { let s = 0; while (s < max) { GTP.game.advance(0.25); s += 0.25; if (pred()) return s; } return -1; };
    const cur = () => M.current();
    const money0 = p.money;
    out.boot = { active: st.active, prereq: st.completed.has('m00_intro'), flag: st.flags.has_table === true, obj: st.objectiveText };
    const v = cur().ctx.vehicle;
    out.van = { tag: v.tag, wrap: v.wrap, dist: Math.hypot(v.x - GTP.World.landmark('pod_garage').door.x, v.z - GTP.World.landmark('pod_garage').door.z) };
    const door = v.doorWorld(0); GTP.game.debug.teleport(door.x, door.z); GTP.game.advance(0.1);
    GTP.Input.set('enter', true); GTP.game.advance(1 / 60); GTP.Input.set('enter', false); GTP.game.advance(0.7);
    out.inVan = p.inVehicle === v;
    out.steps.push(until(() => cur() && cur().def.type === 'pickup', 3));
    out.timer = st.timer ? Object.assign({}, st.timer) : null;
    const pks = cur().ctx.pickups.slice();
    out.subs = pks.length;
    for (const k of pks) { GTP.game.debug.teleport(k.x, k.z); GTP.game.advance(0.4); }
    out.collectedFromVan = pks.filter((k) => k.removed).length;
    out.steps.push(until(() => cur() && cur().def.type === 'drive_to', 3));
    out.timerCleared = st.timer === null;
    const g = GTP.World.landmark('pod_garage').door; GTP.game.debug.teleport(g.x, g.z + 2);
    out.steps.push(until(() => GTP.game.state === 'cutscene', 3));
    out.steps.push(until(() => st.active === null, 12));
    out.result = { completed: Array.from(st.completed), flags: Object.assign({}, st.flags), money: p.money - money0, state: GTP.game.state, stillInVan: p.inVehicle === v, vanPersistent: v.persistent, markers: M.markers().map((k) => k.kind + ':' + k.id) };
    return out;
  });
  console.log('  m01_van: ' + JSON.stringify(r));
  t.assert(r.boot.active === 'm01_van' && r.boot.prereq && r.boot.flag, '?mission=m01_van marks m00 complete and applies its flag');
  t.assert(r.van.tag === 'podvan' && r.van.wrap === 'pod' && r.van.dist < 50 && r.inVan, 'the wrapped pod van waits at the garage and the player gets in');
  t.assert(r.timer && r.timer.total === 90 && r.subs === 6 && r.collectedFromVan === 6 && r.timerCleared, 'six subscribers collected from the van under the 90 s battery timer');
  t.assert(r.steps.every((s) => s > 0) && r.result.completed.indexOf('m01_van') >= 0 && r.result.flags.has_van === true && r.result.money === 200 && r.result.state === 'playing', 'm01 completed with its flag and $200: ' + JSON.stringify(r.result));
  t.assert(r.result.stillInVan && !r.result.vanPersistent && r.result.markers[0] === 'mission:m02_read', 'the van stays with the player and m02 opens at the depot');
  errs = await t.errors(c1);
  t.assert(errs.length === 0, 'errors on the m01 page:\n' + errs.join('\n'));
});
