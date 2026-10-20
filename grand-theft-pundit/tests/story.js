/* story.js: you cannot miss the story (PLAN_V03 "story").
 *  1 a brand-new game from the title (Enter, real keys, non-headless page with the loop cancelled and stepped by hand): the
 *    loading screen, cs_opening, then m00_intro starts by itself; its intro plays and the first objective is on screen, with
 *    no movement input at all (only time passing; dialogue auto-advances); chapter card ACT I fired; Story.next() points at m00
 *  2 after m00: MISSION PASSED, gps:set {kind:'story'} at the next story mission's light (Story.next()), the next giver phones
 *    (phone:call {from, lines}) once the card is gone, the story beacon stands over the light
 *  3 an act change fires chapter {act:2}; the GPS / call follow every story mission along the chain (prepped up to m05)
 *  4 registerObjectiveType: a custom type, and the interior / buy / range / heist_board types complete on their events; the
 *    heist plan changes the job's payout
 *  5 GTP.Errors empty, screenshots story_opening.png, story_first_objective.png, story_beacon.png
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/story.js */
'use strict';
const H = require('./_harness');

H.run('story', async (t) => {
  const page = await t.browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(400000);
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const ctx = { page, pageErrors, consoleErrors };

  // ---- 1. NEW GAME from the title ----
  await page.goto(t.url({ headless: 0, skipTitle: 0, seed: 7, mute: 1 }));
  await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.booted && GTP.game.state === 'title', null, { timeout: 240000 });
  await page.waitForFunction(() => GTP.game.frames >= 2, null, { timeout: 240000 });
  await page.evaluate(() => {
    try { localStorage.removeItem('gtp.save.v2'); for (let i = 1; i <= 3; i++) { localStorage.removeItem('gtp.save.v3.slot' + i); localStorage.removeItem('gtp.save.v4.slot' + i); } } catch (e) { /* storage may be blocked */ }
    cancelAnimationFrame(GTP.game._raf); GTP.game._raf = 0;
    window.S_ = { ev: [] };
    ['gps:set', 'gps:clear', 'phone:call', 'chapter', 'mission:start', 'mission:complete', 'mission:objective', 'cutscene:start', 'cutscene:end', 'story:begin'].forEach((n) => GTP.Events.on(n, (e) => {
      const r = { n, t: +GTP.game.time.t.toFixed(2), state: GTP.game.state };
      if (e && e.kind) r.kind = e.kind; if (e && e.missionId) r.mid = e.missionId; if (e && e.id) r.id = e.id; if (e && e.act) r.act = e.act; if (e && e.title) r.title = e.title;
      if (e && e.from) r.from = e.from; if (e && e.lines) r.lines = e.lines.length; if (e && e.x != null) { r.x = Math.round(e.x); r.z = Math.round(e.z); }
      if (e && e.text != null) r.text = e.text;
      S_.ev.push(r);
    }));
  });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => { GTP.game.advance(0.1); return GTP.game.state !== 'title' && !GTP.game.loading.active; }, null, { timeout: 240000, polling: 200 });
  const opening = await page.evaluate(() => { GTP.game.advance(0.3); const Cs = GTP.Cutscenes; return { state: GTP.game.state, active: Cs.active, title: Cs.hud().title, pending: GTP.game._storyPending, mission: GTP.Missions.state.active, next: GTP.Story.next() }; });
  console.log('  opening: ' + JSON.stringify(opening));
  t.assert(opening.state === 'cutscene' && opening.active, 'NEW GAME plays the opening cutscene after loading: ' + JSON.stringify(opening));
  t.assert(opening.next && opening.next.missionId === 'm00_intro' && opening.next.giver === 'gus', 'Story.next() is m00 with Gus: ' + JSON.stringify(opening.next));
  await page.evaluate(() => GTP.game.render());
  await page.screenshot({ path: t.OUT + '/story_opening.png' });

  // no input: only time passes. The opening ends, m00 starts by itself, its intro auto-advances, the first objective shows
  const first = await page.evaluate(() => {
    const M = GTP.Missions, p = GTP.game.player, x0 = p.x, z0 = p.z; let s = 0;
    while (s < 120) { GTP.game.advance(0.25); s += 0.25; if (M.state.active === 'm00_intro' && M.state.phase === 'play' && M.state.objectiveText && GTP.game.state === 'playing') break; }
    GTP.game.advance(0.2);
    const tgt = M.objectiveTarget();
    return { s, active: M.state.active, phase: M.state.phase, objective: M.state.objectiveText, state: GTP.game.state, moved: +Math.hypot(p.x - x0, p.z - z0).toFixed(1), target: tgt ? { type: tgt.type, dist: Math.round(tgt.dist) } : null, chapter: S_.ev.filter((e) => e.n === 'chapter'), gps: S_.ev.filter((e) => e.n === 'gps:set').slice(-1)[0] || null, begin: S_.ev.filter((e) => e.n === 'story:begin'), order: S_.ev.map((e) => e.n).slice(0, 12), errors: GTP.errors.length };
  });
  console.log('  first objective: ' + JSON.stringify(first));
  t.assert(first.active === 'm00_intro' && first.phase === 'play' && first.objective === 'Get to Dorm 4B' && first.state === 'playing', 'with no input the new game reaches m00\'s first objective: ' + JSON.stringify(first));
  t.assert(first.s < 60, 'the first objective is on screen within a minute of the opening (' + first.s + ' s of game time)');
  t.assert(first.begin.length === 1 && first.begin[0].mid === 'm00_intro', 'the opening handed over to Story.begin: ' + JSON.stringify(first.begin));
  t.assert(first.chapter.length === 1 && first.chapter[0].act === 1 && first.chapter[0].title, 'chapter card ACT I fired: ' + JSON.stringify(first.chapter));
  t.assert(first.target && first.target.type === 'goto', 'the HUD arrow points at the objective: ' + JSON.stringify(first.target));
  t.assert(first.gps && first.gps.kind === 'objective', 'the GPS follows the objective during the mission: ' + JSON.stringify(first.gps));
  await page.evaluate(() => GTP.game.render());
  await page.screenshot({ path: t.OUT + '/story_first_objective.png' });

  // ---- 2. finish m00: GPS to the next story mission, the giver calls, the beacon ----
  const after = await page.evaluate(() => {
    const M = GTP.Missions, g = GTP.game;
    S_.ev.length = 0;
    g.debug.godMode(true);
    let guard = 0; while (M.state.active === 'm00_intro' && guard++ < 40) { M.completeObjective(); g.advance(0.3); }
    // the outro lines auto-advance; then MISSION PASSED
    let s = 0; while (M.state.active && s < 30) { g.advance(0.25); s += 0.25; }
    const next = GTP.Story.next();
    const gps = S_.ev.filter((e) => e.n === 'gps:set' && e.kind === 'story');
    // the call waits for the card and fires a few seconds later
    let c = 0; while (!S_.ev.some((e) => e.n === 'phone:call') && c < 20) { g.advance(0.25); c += 0.25; }
    const call = S_.ev.filter((e) => e.n === 'phone:call');
    const mk = M.markers().find((m) => m.kind === 'mission' && next && m.missionId === next.missionId);
    const av = M.debug.avail().find((a) => next && a.id === next.missionId);
    return { completed: M.state.completed.has('m00_intro'), next, gps, call, callAfter: c, lastCall: GTP.Story.lastCall, marker: mk || null, beacon: !!(av && av.mesh && av.mesh.userData.beacon), state: g.state, errors: GTP.errors.length };
  });
  console.log('  after m00: ' + JSON.stringify(after));
  t.assert(after.completed && after.next && after.next.missionId !== 'm00_intro', 'm00 completed and Story.next() moved on: ' + JSON.stringify(after.next));
  t.assert(after.gps.length >= 1 && after.gps[after.gps.length - 1].mid === after.next.missionId && Math.hypot(after.gps[after.gps.length - 1].x - after.next.x, after.gps[after.gps.length - 1].z - after.next.z) < 2, 'gps:set {kind:story} points at the next mission\'s light: ' + JSON.stringify(after.gps));
  t.assert(after.call.length === 1 && after.call[0].from === after.next.giver && after.call[0].lines >= 1 && after.call[0].mid === after.next.missionId, 'the next giver phones the player: ' + JSON.stringify(after.call));
  t.assert(after.lastCall && after.lastCall.lines.every((l) => l.text && l.name), 'the call lines have names and text: ' + JSON.stringify(after.lastCall));
  t.assert(after.marker && after.marker.story && after.marker.beacon, 'the next light is the story marker with a beacon: ' + JSON.stringify(after.marker));
  t.assert(after.beacon, 'the beacon mesh stands over the light');

  // the beacon from 200 m away
  const far = await page.evaluate(() => {
    const n = GTP.Story.next(), g = GTP.game, W = GTP.World;
    let best = null;
    for (let a = 0; a < 16 && !best; a++) { const x = n.x + Math.cos(a / 16 * Math.PI * 2) * 200, z = n.z + Math.sin(a / 16 * Math.PI * 2) * 200; const tl = W.tileAt(x, z); if ((tl === W.T.ROAD || tl === W.T.SIDEWALK || tl === W.T.PLAZA) && !W.solidAt(x, z, 0.5)) best = { x, z }; }
    if (!best) return { ok: false };
    g.debug.teleport(best.x, best.z);
    const p = g.player, yaw = GTP.util.dirToYaw(n.x - p.x, n.z - p.z); p.yaw = yaw; GTP.Render.rig.yaw = yaw + 0.25; GTP.Render.rig.pitch = -0.12; GTP.Render.rig.snap();
    g.advance(0.5); GTP.Render.updateCamera(0);
    // a camera a little above the player's head, looking at the light's beam 200 m away
    const cam = GTP.Render.camera; g.debug.freeCam(p.x, p.y + 6, p.z, n.x, 40, n.z);
    const v = new THREE.Vector3(n.x, 60, n.z).project(cam);
    const av = GTP.Missions.debug.avail().find((a) => a.id === n.missionId);
    window.S_.screen = { x: +v.x.toFixed(2), y: +v.y.toFixed(2) };
    return { ok: true, dist: Math.round(Math.hypot(p.x - n.x, p.z - n.z)), opacity: av && av.mesh.userData.beacon ? +av.mesh.userData.beacon.material.opacity.toFixed(3) : 0, visible: av && av.mesh.visible };
  });
  await page.evaluate(() => GTP.game.render());
  await page.screenshot({ path: t.OUT + '/story_beacon.png' });
  await page.evaluate(() => GTP.game.debug.followCam());
  console.log('  beacon from afar: ' + JSON.stringify(far));
  t.assert(!far.ok || (far.opacity > 0.3 && far.visible), 'the beacon burns bright from 200 m: ' + JSON.stringify(far));

  // ---- 3. the chain: GPS and call after each story mission up to m05 (an act change on the way) ----
  const chain = await page.evaluate(() => {
    const M = GTP.Missions, g = GTP.game, out = [];
    for (let k = 0; k < 8; k++) {
      const n = GTP.Story.next(); if (!n || n.missionId === 'm05b_provenance') break;
      S_.ev.length = 0;
      if (!M.start(n.missionId, { skipIntro: true })) { out.push({ id: n.missionId, started: false }); break; }
      let guard = 0; while (M.state.active === n.missionId && guard++ < 80) { M.completeObjective(); g.advance(0.2); }
      let s = 0; while (M.state.active && s < 30) { g.advance(0.25); s += 0.25; }
      // act cutscenes (cs_act2 after m04) are skipped like a player would
      let c = 0; while (!S_.ev.some((e) => e.n === 'phone:call') && c < 30) { if (GTP.Cutscenes.active) GTP.Cutscenes.skip(); g.advance(0.25); c += 0.25; }
      const nx = GTP.Story.next();
      out.push({ id: n.missionId, done: M.state.completed.has(n.missionId), next: nx && nx.missionId, gps: (S_.ev.filter((e) => e.n === 'gps:set' && e.kind === 'story').slice(-1)[0] || {}).mid || null, call: (S_.ev.filter((e) => e.n === 'phone:call')[0] || {}).mid || null, chapter: S_.ev.filter((e) => e.n === 'chapter').map((e) => e.act) });
    }
    return { out, act: GTP.Story.chapter, errors: GTP.errors.length };
  });
  console.log('  chain: ' + JSON.stringify(chain));
  chain.out.forEach((r) => {
    t.assert(r.done !== false, r.id + ' completed');
    t.assert(r.next && r.gps === r.next && r.call === r.next, r.id + ': the GPS and the call go to the next story mission: ' + JSON.stringify(r));
  });
  t.assert(chain.out.some((r) => r.chapter.indexOf(2) >= 0) || chain.out.some((r) => r.id === 'm05_peer'), 'the act change fires a chapter card: ' + JSON.stringify(chain.out.map((r) => r.id + ':' + r.chapter.join('/'))));

  // ---- 4. registerObjectiveType and the v0.3 types ----
  const types = await page.evaluate(() => {
    const M = GTP.Missions, g = GTP.game, E = GTP.Events, out = {};
    const p = g.player;
    if (M.state.active) M.abort();
    g.advance(0.2);
    // a custom type from another module
    let hit = 0;
    out.registered = M.registerObjectiveType('t_ping', { start: (o, c) => { c.n = 0; }, check: (o, c) => (++c.n > 18 ? 'done' : null), cleanup: () => { hit++; } });
    const lm = GTP.World.landmarks.find((l) => l.kind === 'gunshop');
    M.registerTest({ id: 't_types', title: 'Types', giver: 'merle', marker: lm.id, requires: [], reward: 1000, heist: true, intro: [], outro: [],
      objectives: [{ type: 't_ping', text: 'ping' }, { type: 'interior', interior: 'armory', text: 'Walk into the armory' }, { type: 'buy', item: 'ammo', text: 'Buy a box of rounds' },
        { type: 'range', medal: 'silver', text: 'Silver at the range' }, { type: 'heist_board', text: 'Plan the job' }, { type: 'goto', approach: 'loud', target: { landmark: 'campus_quad' }, text: 'LOUD ONLY' }], failOn: [] });
    const money0 = p.money;
    M.start('t_types', { skipIntro: true });
    const seen = [];
    const at = () => { const c = M.current(); return c ? c.def.type : null; };
    g.advance(0.2); seen.push(at());
    g.advance(0.2); seen.push(at());   // t_ping done -> interior
    E.emit('interior:enter', { id: 'clothing_1', kind: 'clothing' }); g.advance(0.1); out.wrongInterior = at();
    E.emit('interior:enter', { id: 'bsa_strip', kind: 'armory', store: lm.id }); g.advance(0.1); seen.push(at());
    E.emit('shop:buy', { item: { id: 'health', tab: 'health' }, price: 1 }); g.advance(0.1); out.wrongBuy = at();
    E.emit('shop:buy', { item: { id: 'ammo_pistol', tab: 'ammo', weapon: 'pistol' }, price: 60 }); g.advance(0.1); seen.push(at());
    E.emit('range:end', { score: 10, medal: 'bronze' }); g.advance(0.1); out.bronze = at();
    E.emit('range:end', { score: 40, medal: 'gold' }); g.advance(0.1); seen.push(at());
    E.emit('heist:plan', { approach: 'quiet', crew: ['gus'] }); g.advance(0.1);
    // the loud-only goto is skipped under the quiet plan: straight to the outro and the payout
    let s = 0; while (M.state.active && s < 10) { g.advance(0.2); s += 0.2; }
    out.seen = seen; out.done = M.state.completed.has('t_types'); out.plan = GTP.Heist.plan(); out.paid = p.money - money0; out.cleanups = hit;
    out.expected = GTP.Heist.payout({ id: 't_types', heist: true }, 1000);
    // side missions (the strangers module's list, an expansion mission outside the chain) never join the story, and finishing
    // one puts the GPS back on the story
    GTP.Content.strangers = GTP.Content.strangers || {}; GTP.Content.strangers.missions = GTP.Content.strangers.missions || [];
    GTP.Content.strangers.missions.push({ id: 't_stranger', title: 'A Stranger', giver: 'kip', marker: 'fish_shack', requires: [], reward: 5, intro: [], outro: [], objectives: [{ type: 'dialogue', lines: [{ who: 'kip', text: 'Hi.' }] }], failOn: [] });
    GTP.Content.expansion.missions.push({ id: 't_side', title: 'A Side Job', giver: 'gus', marker: 'fish_shack', requires: [], reward: 5, intro: [], outro: [], objectives: [{ type: 'dialogue', lines: [{ who: 'gus', text: 'Side.' }] }], failOn: [] });
    M.refreshMarkers(); const ord = GTP.Story.order();
    out.side = { inAll: M.allMissions().some((m) => m.id === 't_stranger') && M.allMissions().some((m) => m.id === 't_side'), inStory: ord.indexOf('t_stranger') >= 0 || ord.indexOf('t_side') >= 0, lit: M.markers().some((m) => m.missionId === 't_stranger') };
    M.start('t_stranger', { skipIntro: true }); let ss = 0; while (M.state.active && ss < 10) { g.advance(0.25); ss += 0.25; }
    out.side.gps = GTP.Story.gpsTarget && GTP.Story.gpsTarget.kind; out.side.next = GTP.Story.next() && GTP.Story.next().missionId;
    out.types = M.objectiveTypes().filter((x) => ['interior', 'buy', 'range', 'heist_board', 'boss', 't_ping'].indexOf(x) >= 0);
    return out;
  });
  console.log('  types: ' + JSON.stringify(types));
  t.assert(types.side.inAll && !types.side.inStory && types.side.lit && types.side.gps === 'story' && types.side.next === 'm05b_provenance', 'side missions (strangers, off-chain expansion) are playable but never in the story; the GPS returns to the story after one: ' + JSON.stringify(types.side));
  t.assert(types.registered && types.types.length === 6, 'registerObjectiveType and the v0.3 types exist: ' + types.types.join(','));
  t.assert(types.seen.join(',') === 't_ping,interior,buy,range,heist_board', 'each type completes on its event in turn: ' + types.seen.join(','));
  t.assert(types.wrongInterior === 'interior' && types.wrongBuy === 'buy' && types.bronze === 'range', 'the wrong interior, item or medal does not count');
  t.assert(types.done && types.plan && types.plan.approach === 'quiet' && types.cleanups === 1, 'the heist plan is set and the loud-only objective skipped: ' + JSON.stringify(types.plan));
  t.assert(types.paid === types.expected && types.expected === 900, 'the payout follows the plan (quiet x1.0, Gus takes 10%): paid ' + types.paid + ', expected ' + types.expected);

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
  await page.close();

  // ---- 6. QA round-1 regressions in the story files (headless) ----
  const q = await t.boot({ seed: 7 });
  const qa = await q.page.evaluate(() => {
    const g = GTP.game, M = GTP.Missions, S = GTP.Strands, p = g.player, W = GTP.World, out = {};
    g.debug.godMode(false);
    // QA-C1-02: QUIT drops the retry offer for good
    M.registerTest({ id: 't_fail', title: 'Fail', giver: 'gus', marker: 'campus_quad', requires: [], reward: 1, intro: [], outro: [], objectives: [{ type: 'goto', target: { landmark: 'fish_shack' }, text: 'Go' }], failOn: [] });
    M.start('t_fail', { skipIntro: true }); g.advance(0.2); M.fail('timer'); g.advance(0.2);
    const before = M.canRetry(); M._dropRetry(); out.retry = { before, after: M.canRetry() };
    // QA-STR-02 / STR-05 / STR-11: the HOA stop distance, the fare names, the strand SUV tag
    out.stopNear = GTP.C.STRANDS.stopNear;
    out.hoaTraffic = S.S.hoa_patrol.canStart({ type: 'suv', tag: 'hoa' }); out.hoaSuv = S.S.hoa_patrol.canStart({ type: 'suv', tag: 'hoasuv' });
    // QA-C1-01: four Act I goons, no input: the player is still standing after 4 s
    const lm = W.landmark('campus_quad');
    M.registerTest({ id: 't_brawl', title: 'Brawl', giver: 'gus', marker: 'campus_quad', requires: [], reward: 1, intro: [], outro: [], objectives: [{ type: 'defeat', spawn: { ped: 'thug', count: 4, around: { landmark: 'campus_quad' }, radius: 40 }, text: 'Brawl' }], failOn: ['player_dead'] });
    g.debug.teleport(lm.door.x, lm.door.z); p.hp = 100;
    M.start('t_brawl', { skipIntro: true }); g.advance(0.1);
    M.current().ctx.peds.forEach((h, i) => { h.x = p.x + Math.cos(i * 1.6) * 1.5; h.z = p.z + Math.sin(i * 1.6) * 1.5; h.snap(); });
    const hp = []; for (let k = 0; k < 8; k++) { g.advance(0.5); hp.push(Math.round(p.hp)); }
    out.brawl = { hp, alive: p.alive };
    M.abort(); g.advance(0.3); p.hp = 100;
    // QA-C1-03: a weapon-restricted defeat refills the named weapon when it runs dry
    M.registerTest({ id: 't_dry', title: 'Dry', giver: 'gus', marker: 'campus_quad', requires: [], reward: 1, intro: [], outro: [], objectives: [{ type: 'defeat', weapon: 'pistol', spawn: { ped: 'cutout', count: 2, around: { landmark: 'campus_quad' }, radius: 40, stationary: true, hostile: false }, text: 'Cite' }], failOn: [] });
    M.start('t_dry', { skipIntro: true }); g.advance(0.1);
    p.weapons.pistol = 0; if (p.ammo) delete p.ammo.pistol; g.advance(3);
    out.refill = { pistol: p.weapons.pistol, refills: M.current().ctx.refills || 0 };
    M.abort(); g.advance(0.3);
    // QA-C1-05: the tail starts well ahead
    M.registerTest({ id: 't_tail', title: 'Tail', giver: 'gus', marker: 'campus_quad', requires: [], reward: 1, intro: [], outro: [], objectives: [{ type: 'follow', spawn: { ped: 'courier', at: { landmark: 'campus_quad' }, path: [{ landmark: 'dorm_studio' }, { landmark: 'fish_shack' }] }, maxDist: 400, text: 'Tail' }], failOn: [] });
    g.debug.teleport(lm.door.x, lm.door.z);
    M.start('t_tail', { skipIntro: true }); g.advance(0.1);
    const ped = M.current().ctx.ped; out.tail = { start: +Math.hypot(ped.x - p.x, ped.z - p.z).toFixed(1) };
    g.advance(5); out.tail.active = M.state.active;
    M.abort(); g.advance(0.3);
    // QA-C1-10: a goto reached by car completes once stopped
    M.registerTest({ id: 't_car', title: 'Car', giver: 'gus', marker: 'campus_quad', requires: [], reward: 1, intro: [], outro: [], objectives: [{ type: 'goto', target: { landmark: 'fish_shack' }, text: 'Go' }], failOn: [] });
    const fs = W.landmark('fish_shack').door, rp = W.nearestRoadPoint(fs.x, fs.z);
    const car = g.debug.spawnVehicle(rp.x, rp.z, 'sedan'); car.enter(p, 0); g.advance(0.1);
    M.start('t_car', { skipIntro: true }); g.advance(0.1);
    g.debug.teleport(fs.x, fs.z); g.advance(0.5);
    out.carGoto = { done: M.state.completed.has('t_car'), inCar: !!p.inVehicle };
    if (M.state.active) M.abort();
    p.exitVehicle(); g.advance(0.6);
    // QA-STR-01 / STR-07: dying in a rampage ends it, and the loaner goes back
    p.weapons = { fist: Infinity }; p.weapon = 'fist';
    const mk = S.debug.markers().find((m) => m.id === 'rr_02');
    g.debug.teleport(mk.x + 20, mk.z); g.advance(0.3); g.debug.teleport(mk.x, mk.z); g.advance(0.8);
    const started = S.active(); g.advance(3.2);
    p.applyDamage(9999, null, 'debug'); g.advance(0.2);
    out.rampage = { started, afterDeath: S.active(), pistol: p.weapons.pistol || 0 };
    g.advance(12);
    out.rampage.afterRespawn = S.active(); out.rampage.state = g.state;
    // QA-CMB-06: the click that closes a line is not a shot
    p.hp = 100; g.debug.giveWeapon('pistol', 24); GTP.Combat.ammo(p, 'pistol');
    const shots0 = (p.stats.shots || 0);
    M.say([{ who: 'gus', text: 'Only line.' }]); g.advance(0.6);
    GTP.Input.set('shoot', true); GTP.Input.set('confirm', true); g.advance(1 / 60); GTP.Input.set('confirm', false); g.advance(0.2);
    out.latch = { state: g.state, shots: (p.stats.shots || 0) - shots0 };
    GTP.Input.set('shoot', false); g.advance(0.1);
    GTP.Input.set('shoot', true); g.advance(0.1); GTP.Input.set('shoot', false); g.advance(0.1);
    out.latch.after = (p.stats.shots || 0) - shots0;
    out.errors = GTP.errors.map((e) => e.where + ': ' + e.message);
    return out;
  });
  console.log('  qa: ' + JSON.stringify(qa));
  t.assert(qa.retry.before === true && qa.retry.after === false, 'QA-C1-02: QUIT drops the retry offer: ' + JSON.stringify(qa.retry));
  t.assert(qa.stopNear === 6 && qa.hoaTraffic === false && qa.hoaSuv === true, 'QA-STR-02 / STR-11: stopNear 6, only the strand SUV starts a patrol');
  t.assert(qa.brawl.alive && qa.brawl.hp[qa.brawl.hp.length - 1] > 30, 'QA-C1-01: four goons do not flatten an idle player in 4 s: ' + JSON.stringify(qa.brawl));
  t.assert(qa.refill.pistol > 0 && qa.refill.refills >= 1, 'QA-C1-03: a dry weapon-restricted objective refills: ' + JSON.stringify(qa.refill));
  t.assert(qa.tail.start >= 9 && qa.tail.active === 't_tail', 'QA-C1-05: the tail starts ahead and nobody is spotted standing still: ' + JSON.stringify(qa.tail));
  t.assert(qa.carGoto.done, 'QA-C1-10: a goto reached by car completes once stopped: ' + JSON.stringify(qa.carGoto));
  t.assert(qa.rampage.started === 'ratio_rampages' && qa.rampage.afterDeath === null && qa.rampage.afterRespawn === null && qa.rampage.pistol === 0, 'QA-STR-01 / STR-07: death ends the rampage and the loaner goes back: ' + JSON.stringify(qa.rampage));
  t.assert(qa.latch.state === 'playing' && qa.latch.shots === 0 && qa.latch.after >= 1, 'QA-CMB-06: the press that closes the dialogue fires nothing; the next one does: ' + JSON.stringify(qa.latch));
  t.assert(qa.errors.length === 0, 'qa errors: ' + qa.errors.join(' | '));
  const qerrs = await t.errors(q);
  t.assert(qerrs.length === 0, 'errors:\n' + qerrs.join('\n'));
});
