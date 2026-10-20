/* ui.js: the 2D overlay (11_ui) and the input module (02_input).
 *  1 a non-headless boot shows the loading screen, then the title menu with the attract camera; Enter on NEW GAME starts play
 *  2 HUD on foot (bars, money + subs, stars, weapon mag | reserve, objective + timer + hint, minimap, chip) and in a car at night (radio ticker)
 *  3 showDialogue with a cast portrait; confirm advances through the callback
 *  4 pause menu (SAVE, LOAD GAME, MAP, SETTINGS...), the map page (M), its tabs, the waypoint (arrow, route line), abort via the missions tab
 *  5 debate minigame with scripted inputs: a win and a loss resolve onResult, summary format
 *  6 ratio minigame likewise
 *  7 wanted 3 stars flash; the RATIO'D card; credits roll and skip
 *  8 the front end: SAVE to a slot, the slot cards, quit to title, CONTINUE, LOAD GAME cards, DELETE and OVERWRITE confirmations (in-page), the seed field, SETTINGS
 *  9 the shop page (open by the door marker, buy with money feedback, exit), the weapon wheel, the scope overlay, hit markers, the reload arc
 * 10 the CONTEXT STAMPED card with RETRY / RESTART / QUIT; RETRY resumes from the checkpoint
 * 11 the letterbox and the HOLD TO SKIP pill in a cutscene; hint toasts; the race HUD; the stunt slow-motion overlay; the memo counter
 * 12 settings apply (quality preset, draw distance, volumes, hints, gamepad) and persist in localStorage
 * 13 the gamepad: a fake standard pad confirms menus, steps selections with the stick, switches the glyphs; rumble is a no-op without an actuator
 * 14 a 400x800 touch viewport: ten touch buttons (with COVER and SPCL) inside the screen, the virtual stick walks, the map page with pinch zoom, the long-press weapon wheel
 * Screenshots in tests/out: ui_loading, ui_title, ui_title_settings, ui_title_slots, ui_title_confirm, ui_hud_foot, ui_hud_car_night, ui_dialogue,
 * ui_pause, ui_map, ui_phone_missions, ui_phone_strands, ui_shop, ui_wheel, ui_scope, ui_hitmark, ui_failed_retry, ui_letterbox, ui_hint, ui_race,
 * ui_stunt, ui_debate, ui_ratio, ui_wanted3, ui_ratiod, ui_credits, ui_title_continue, ui_pause_slots, ui_phone_touch, ui_map_touch (look at them). */
'use strict';
const H = require('./_harness');
const GTP_MAP_PX = () => 224 * 4;   // 224 tiles x 4 px per tile (1 px per metre)

H.run('ui', async (t) => {
  // ---- 1. loading screen, then the title (non-headless, no skipTitle) ----
  const page = await t.browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const ctx = { page, pageErrors, consoleErrors };
  await page.goto(t.url({ headless: 0, skipTitle: 0, seed: 7, mute: 1 }));
  await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.booted, null, { timeout: 240000 });
  // the boot's loading screen: catch it while the chunks build (it may already be done on a fast machine; the frozen draw below covers that)
  const loadingSeen = await page.evaluate(() => ({ active: GTP.game.loading.active, fraction: GTP.game.loading.fraction, stage: GTP.game.loading.stage, tips: GTP.UI.state.loading.tips.length }));
  console.log('  loading at boot: ' + JSON.stringify(loadingSeen));
  await page.waitForFunction(() => GTP.game.state === 'title' && !GTP.game.loading.active && GTP.game.frames >= 3, null, { timeout: 240000 });
  const title = await page.evaluate(() => ({ state: GTP.game.state, free: GTP.Render.free, frames: GTP.game.frames, cam: GTP.Render.camera.position.y, attract: GTP.UI.state.attract.on, items: GTP.UI.state.title.items.map((i) => i.id) }));
  console.log('  title: ' + JSON.stringify(title));
  t.assert(title.state === 'title' && title.free && title.attract && title.cam > 20, 'title screen with the attract camera flying over the city');
  t.assert(title.items.join(',') === 'play,load,settings,controls,credits', 'a fresh title lists NEW GAME, LOAD GAME, SETTINGS, CONTROLS, CREDITS: ' + title.items.join(','));
  await page.screenshot({ path: t.OUT + '/ui_title.png' });
  await page.evaluate(() => { cancelAnimationFrame(GTP.game._raf); GTP.game._raf = 0; });
  // the loading screen drawn from a frozen loading state (the real one is the same drawer fed by GTP.game.loading)
  await page.evaluate(() => {
    const L = GTP.game.loading; L.active = true; L.fraction = 0.42; L.stage = 'roads'; L.label = 'Painting lanes, elevating the Loop'; L.reason = 'new';
    GTP.UI.update(1 / 60); GTP.UI.state.loading.tipT = 1.5; GTP.game.render();
  });
  await page.screenshot({ path: t.OUT + '/ui_loading.png' });
  const loading = await page.evaluate(() => { const tips = GTP.UI.state.loading.tips.length; const L = GTP.game.loading; L.active = false; L.fraction = 0; L.stage = 'done'; return { tips }; });
  t.assert(loading.tips === 20, 'the loading screen rotates through the twenty tips: ' + loading.tips);
  // the menu by keys: down to SETTINGS, open it, screenshot, back; down to LOAD GAME: the empty cards
  await page.evaluate(() => {
    window.T_ = {
      press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
      until(pred, maxSec, step) { step = step || 1 / 60; let s = 0; while (s < maxSec) { GTP.game.advance(step); s += step; if (pred()) return s; } return -1; },
      sel(id) { const items = GTP.UI.state.title.items; GTP.UI.state.title.sel = Math.max(0, items.findIndex((i) => i.id === id)); }
    };
    GTP.game.render(); T_.sel('settings'); T_.press('confirm'); GTP.game.render();
  });
  const settingsPage = await page.evaluate(() => GTP.UI.state.title.page);
  t.assert(settingsPage === 'settings', 'SETTINGS opens on the title: ' + settingsPage);
  await page.screenshot({ path: t.OUT + '/ui_title_settings.png' });
  const slotsPage = await page.evaluate(() => { T_.press('cancel'); GTP.game.render(); T_.sel('load'); T_.press('confirm'); GTP.game.render(); return { page: GTP.UI.state.title.page, mode: GTP.UI.state.title.slotMode, empty: GTP.game.slots().every((s) => s.empty) }; });
  t.assert(slotsPage.page === 'slots' && slotsPage.mode === 'load' && slotsPage.empty, 'LOAD GAME shows the three empty slot cards: ' + JSON.stringify(slotsPage));
  await page.screenshot({ path: t.OUT + '/ui_title_slots_empty.png' });
  await page.evaluate(() => { T_.press('cancel'); GTP.game.render(); T_.sel('play'); });
  await page.keyboard.press('Enter');
  await page.evaluate(() => GTP.game.advance(0.2));
  const started = await page.evaluate(() => ({ state: GTP.game.state, free: GTP.Render.free, d: Math.hypot(GTP.Render.camera.position.x - GTP.game.player.x, GTP.Render.camera.position.z - GTP.game.player.z), slot: GTP.game.activeSlot, loading: GTP.game.loading.active }));
  console.log('  after Enter: ' + JSON.stringify(started));
  t.assert(started.state === 'playing' && !started.free && started.d < 8 && started.slot === 1, 'Enter on NEW GAME (no saves) starts play at once in slot 1 with the chase camera on the player');
  // QA-C1-07: the first-ever NEW GAME queues the opening cutscene too (it would play once the loading screen ends); the
  // rest of this file drives the HUD directly, so the opening is taken off the queue here
  const opening = await page.evaluate(() => { const o = GTP.game._openingPending; GTP.game._openingPending = false; return o; });
  t.assert(opening === true, 'NEW GAME with no saves queues the opening cutscene (QA-C1-07)');
  // the live loop is off: finish the New Game's chunk prebuild synchronously so the loading state never lingers
  await page.evaluate(() => { GTP.Render.prebuild(GTP.game.player.x, GTP.game.player.z, 100); GTP.game._loadT = 0; GTP.game._endLoading(); });

  // ---- 2. HUD on foot ----
  await page.evaluate(() => {
    GTP.Missions.registerTest({ id: 't_ui', title: 'Read the Read', giver: 'firmness', marker: 'campus_quad', requires: [], reward: 500, intro: [], outro: [], objectives: [{ type: 'timer_wrap', seconds: 120, objectives: [{ type: 'drive_to', target: { landmark: 'green_room' }, vehicle: 'any', text: 'Deliver the mattress before code TAKES20 expires' }] }], failOn: ['player_dead'] });
    GTP.game.debug.giveWeapon('pistol', 24);
    GTP.game.debug.setWanted(1);
    GTP.Missions.start('t_ui', { skipIntro: true });
    GTP.UI.toast('Welcome to Grievance City');
    GTP.Missions.addSubs(1500, 'test');
    GTP.game.advance(1);
    if (GTP.Hints && GTP.Hints.fire) GTP.Hints.fire('h_arrow', true);
    GTP.game.advance(0.3);
  });
  const foot = await page.evaluate(() => { const s = GTP.game.debug.snapshot(); const h = GTP.Combat.hud().weapon; return { state: s.state, mission: s.mission, timer: GTP.Missions.state.timer && Math.round(GTP.Missions.state.timer.remaining), street: s.street, district: s.district, map: !!GTP.UI.state.map.bake, mag: h.mag, reserve: h.reserve, subs: GTP.UI.state.subs.shown, hint: GTP.Hints.hud() && GTP.Hints.hud().id }; });
  console.log('  foot: ' + JSON.stringify(foot));
  t.assert(foot.mission === 't_ui' && foot.timer > 100, 'mission timer runs');
  t.assert(foot.mag === 12 && foot.reserve === 12, 'the weapon panel reads the magazine and the reserve: ' + foot.mag + ' | ' + foot.reserve);
  t.assert(foot.hint === 'h_arrow', 'a hint toast is up under the objective: ' + foot.hint);
  await t.shot(page, 'ui_hud_foot');
  const baked = await page.evaluate(() => { const b = GTP.UI.state.map.bake; return b ? [b.width, b.height] : null; });
  t.assert(baked && baked[0] === GTP_MAP_PX(), 'the minimap is baked from the tiles once drawn: ' + JSON.stringify(baked));

  // ---- 2b. in a car at night: the radio ticker ----
  const car = await page.evaluate(() => {
    const p = GTP.game.player;
    const v = GTP.game.debug.spawnVehicle(p.x + 3, p.z, 'sedan');
    const d = v.doorWorld(0); GTP.game.debug.teleport(d.x, d.z); GTP.game.advance(0.1);
    T_.press('enter'); GTP.game.advance(0.8);
    GTP.game.debug.setClock(22);
    GTP.Input.set('forward', true); GTP.game.advance(2); GTP.Input.set('forward', false); GTP.game.advance(0.3);
    const tk = GTP.UI.state.ticker.cur, st = GTP.UI.currentStation();
    return { inCar: !!p.inVehicle, ticker: tk && tk.text, tag: tk && tk.tag, station: st && st.name, night: GTP.Render.night };
  });
  console.log('  car: ' + JSON.stringify(car));
  t.assert(car.inCar && car.ticker && car.station && car.night > 0.9, 'radio ticker shows a line in a car at night');
  await t.shot(page, 'ui_hud_car_night');
  const nap = await page.evaluate(() => {
    const out = [];
    const stations = GTP.Content.radio.stations;
    for (let i = 0; i < stations.length; i++) {
      GTP.Audio.station = i; GTP.UI.state.ticker.cur = null; GTP.UI.state.ticker.lastNapHour = -1;
      GTP.game.debug.setClock(22 + 20 / 60 + 0.002); GTP.game.advance(0.1);
      const c = GTP.UI.state.ticker.cur; out.push(c && c.nap && /Nap Dynasty|mattress/i.test(c.text));
    }
    GTP.Audio.station = 0; GTP.game.debug.setClock(22.5);
    return out;
  });
  console.log('  nap ads: ' + JSON.stringify(nap));
  const nStations = await page.evaluate(() => GTP.Content.radio.stations.length);
  t.assert(nap.length === nStations && nStations >= 4 && nap.every(Boolean), 'the mattress ad runs at minute 20 on every station (' + nStations + ')');

  // ---- 3. dialogue with a cast portrait ----
  const dlg = await page.evaluate(() => {
    const p = GTP.game.player; if (p.inVehicle) p.exitVehicle(); GTP.game.advance(0.3);
    window.T_.next = 0;
    GTP.UI.showDialogue({ who: 'goldplate', name: 'President Lionel Goldplate', color: '#ffd400', text: 'Takesworth. Great kid. Rate him an eight. The rally\'s a ten. The stadium\'s a ten, both words.' }, () => { T_.next++; });
    GTP.game.advance(2.5);
    const d = GTP.UI.state.dialogue;
    return { shown: !!d, chars: d && Math.floor(d.chars), done: d && d.done };
  });
  console.log('  dialogue: ' + JSON.stringify(dlg));
  t.assert(dlg.shown && dlg.done, 'the typewriter finished the line');
  await t.shot(page, 'ui_dialogue');
  const adv = await page.evaluate(() => { T_.press('confirm'); return { next: T_.next, cleared: !GTP.UI.state.dialogue }; });
  t.assert(adv.next === 1 && adv.cleared, 'confirm advances through the callback and clears the box: ' + JSON.stringify(adv));
  const sign = await page.evaluate(() => { const p = GTP.game.player; p.stats.honking = (p.stats.honking || 0) + 1; GTP.game.advance(0.1); return GTP.UI.rozSign(); });
  t.assert(sign === 'STOP HONKING', 'Roz\'s sign reads the latest stat: ' + sign);

  // ---- 4. pause, the map page, the waypoint ----
  const pause = await page.evaluate(() => { T_.press('pause'); GTP.game.render(); return { state: GTP.game.state, page: GTP.UI.state.pause.page }; });
  t.assert(pause.state === 'paused' && pause.page === 'pause', 'Esc opens the pause menu: ' + JSON.stringify(pause));
  await t.shot(page, 'ui_pause');
  const resumed = await page.evaluate(() => { T_.press('back'); T_.press('forward'); T_.press('confirm'); return GTP.game.state; });
  t.assert(resumed === 'playing', 'down, up, confirm on RESUME resumes (S steps the menu, it no longer closes it): ' + resumed);
  const mapPage = await page.evaluate(() => {
    T_.press('map');
    const a = { state: GTP.game.state, page: GTP.UI.state.pause.page, tab0: GTP.UI.state.pause.tab };
    GTP.game.render();
    const r = GTP.UI.state.map.rect; a.rect = r && r.w > 600 && r.h > 400;
    // zoom in twice, then a click on the map centre-ish sets a waypoint
    GTP.Input.set('zoomIn', true); GTP.game.advance(1 / 60); GTP.Input.set('zoomIn', false); GTP.game.advance(1 / 60);
    a.zoom = GTP.UI.state.map.zoom;
    const p = GTP.game.player, wp = GTP.UI.setWaypoint(p.x + 120, p.z + 40);
    a.waypoint = !!(wp && GTP.game.waypoint && Math.abs(GTP.game.waypoint.x - (p.x + 120)) < 0.2);
    GTP.game.render();
    T_.press('lockOn'); a.tab1 = GTP.UI.state.pause.tab;   // Tab cycles the tabs
    T_.press('left'); a.tab0b = GTP.UI.state.pause.tab;
    return a;
  });
  console.log('  map: ' + JSON.stringify(mapPage));
  t.assert(mapPage.state === 'paused' && mapPage.page === 'phone' && mapPage.tab0 === 0 && mapPage.rect, 'M opens the full-screen map page');
  t.assert(mapPage.zoom > 1.4 && mapPage.waypoint && mapPage.tab1 === 1 && mapPage.tab0b === 0, 'zoom, the waypoint and the tab keys work: ' + JSON.stringify(mapPage));
  await t.shot(page, 'ui_map');
  const tabs = await page.evaluate(() => { T_.press('weaponNext'); GTP.game.render(); const a = [GTP.UI.phoneTabs[GTP.UI.state.pause.tab]]; T_.press('right'); GTP.game.render(); a.push(GTP.UI.phoneTabs[GTP.UI.state.pause.tab]); return a; });
  t.assert(tabs[0] === 'STORY' && tabs[1] === 'MISSIONS', 'RB / ] moves from the map to the STORY tab, then right to MISSIONS (arrows pan the map): ' + tabs);
  await t.shot(page, 'ui_phone_missions');
  await page.evaluate(() => { T_.press('right'); T_.press('right'); T_.press('right'); GTP.game.render(); });   // STOCKS, STATS, STRANDS
  await t.shot(page, 'ui_phone_strands');
  const aborted = await page.evaluate(() => {
    T_.press('left'); T_.press('left'); T_.press('left'); GTP.game.render();   // back to MISSIONS (its rows come from the draw)
    const rows = GTP.UI.state.pause.rows.map((r) => r.kind);
    T_.press('secondary'); GTP.game.advance(0.2);
    return { rows, active: GTP.Missions.state.active, state: GTP.game.state };
  });
  t.assert(aborted.rows[0] === 'active' && aborted.active === null && aborted.state === 'playing', 'Delete in the missions tab aborts the mission and closes the page: ' + JSON.stringify(aborted));
  const route = await page.evaluate(() => {
    GTP.game.advance(2.2);
    const r = GTP.UI.state.map.route, p = GTP.game.player, wp = GTP.game.waypoint;
    GTP.game.render();
    const arrow = GTP.UI.state.waypoint;
    // walking onto the waypoint clears it
    GTP.game.debug.teleport(wp.x + 2, wp.z); GTP.game.advance(0.3);
    return { route: r ? r.length : 0, arrow: !!arrow, cleared: !GTP.game.waypoint, far: Math.hypot(p.x - wp.x, p.z - wp.z) };
  });
  console.log('  route: ' + JSON.stringify(route));
  t.assert(route.route >= 2 && route.arrow && route.cleared, 'the minimap route line follows the roads to the waypoint; arriving clears it');

  // ---- 5. debate minigame, scripted ----
  const debate = await page.evaluate(() => {
    const COUNTER = { FACT: 'forward', FEELING: 'left', GOTCHA: 'right', ANECDOTE: 'back' };
    const run = (answerFn, params) => {
      let result = null;
      GTP.UI.startMinigame('debate', params, (win) => { result = win; });
      const st = GTP.UI.minigames.debate.state, out = { state0: GTP.game.state, answers: 0, shot: false };
      let guard = 0;
      while (result === null && guard++ < 6000) {
        GTP.game.advance(1 / 60);
        if (st.phase === 'card' && st.card && st.card.t > 0.3) { T_.press(answerFn(st.card.card)); out.answers++; }
      }
      out.result = result; out.summary = st.summary; out.crowd = st.crowd; out.perfect = st.perfect; out.state1 = GTP.game.state; out.rounds = st.roundsWon + '-' + st.roundsLost;
      return out;
    };
    T_.good = (c) => COUNTER[c];
    T_.bad = (c) => c === 'FACT' ? 'left' : 'forward';
    const win = run(T_.good, { rounds: 1, points: 4, timer: 6, bluff: 0, opponent: 'freshman' });
    GTP.game.advance(0.2);
    const lose = run(T_.bad, { rounds: 1, points: 4, timer: 6, bluff: 0, opponent: 'freshman' });
    return { win, lose };
  });
  console.log('  debate: ' + JSON.stringify(debate));
  t.assert(debate.win.state0 === 'minigame' && debate.win.state1 === 'playing', 'the world pauses in state minigame and resumes after');
  t.assert(debate.win.result === true && debate.win.perfect >= 2 && debate.win.crowd === 100 && debate.win.rounds === '1-0', 'two perfect counters (+25 each) take the crowd to 100 and end the round won');
  t.assert(/^ROUNDS 1-0 · PERFECT HITS \d+ · SHOUTS 0 · MINDS CHANGED 0$/.test(debate.win.summary), 'summary format: ' + debate.win.summary);
  t.assert(debate.lose.result === false && debate.lose.rounds === '0-1', 'wrong counters lose the round and the match');
  await page.evaluate(() => {
    GTP.UI.startMinigame('debate', { rounds: 3, points: 5, timer: 5, bluff: 0, opponent: 'chyron' }, () => {});
    const st = GTP.UI.minigames.debate.state;
    GTP.game.advance(1.2);
    T_.press('forward'); GTP.game.advance(0.3);
    st.crowd = 70; st.history.push(true); st.roundsWon = 1; st.round = 2;
    GTP.game.advance(1.0);
  });
  await t.shot(page, 'ui_debate');
  await page.evaluate(() => { GTP.UI.endMinigame(); GTP.game.setState('playing'); GTP.game.advance(0.1); });

  // ---- 6. ratio minigame, scripted ----
  const ratio = await page.evaluate(() => {
    let result = null;
    GTP.UI.startMinigame('ratio', { posts: 5, speed: 1, opponent: 'dunk' }, (win) => { result = win; });
    const R = GTP.UI.minigames.ratio, st = R.state, out = { posts: 0, hottakeAt: null, primedDunk: null };
    let guard = 0;
    while (result === null && guard++ < 8000) {
      GTP.game.advance(1 / 60);
      if (st.phase !== 'play') continue;
      if (out.posts === 2 && st.hottake) { T_.press('shoot'); out.hottakeAt = st.hottake; out.primed = st.primed; T_.press('action'); out.primedDunk = st.lastStamp; out.posts++; continue; }
      if (R.zone() === 'DUNK' && Math.abs(st.meter - 0.5) < 0.06 && st.postsLeft > 0) { T_.press('action'); out.posts++; }
    }
    out.result = result; out.summary = st.summary; out.mine = Math.round(st.mine); out.theirs = Math.round(st.theirs); out.dunks = st.dunks; out.state = GTP.game.state;
    return out;
  });
  console.log('  ratio: ' + JSON.stringify(ratio));
  t.assert(ratio.result === true && ratio.dunks === 5 && ratio.mine > ratio.theirs, 'five dunks win the ratio war');
  t.assert(ratio.hottakeAt === false && ratio.primed === true && ratio.primedDunk === 'DUNK', 'the hottake primes a guaranteed dunk once');
  t.assert(/^LIKES \d+ - \d+ · DUNKS \d+ · NOTED \d+ · RATIO [\d.]+$/.test(ratio.summary), 'ratio summary format: ' + ratio.summary);
  await page.evaluate(() => {
    GTP.UI.startMinigame('ratio', { posts: 8, speed: 2, opponent: 'takesworth_archive' }, () => {});
    const R = GTP.UI.minigames.ratio, st = R.state;
    let n = 0, guard = 0;
    while (n < 3 && guard++ < 900) { GTP.game.advance(1 / 60); if (R.zone() === (n === 1 ? 'REPLY' : 'DUNK')) { T_.press('action'); n++; } }
    GTP.game.advance(4.2);
    st.meter = 0.5;
  });
  await t.shot(page, 'ui_ratio');
  await page.evaluate(() => { GTP.UI.endMinigame(); GTP.game.setState('playing'); GTP.game.advance(0.1); });

  // ---- 7. wanted stars, the RATIO'D card, credits ----
  const wanted = await page.evaluate(() => { GTP.game.debug.setWanted(3); GTP.game.advance(0.25); return { lvl: GTP.UI.state.wanted.last, flash: GTP.UI.state.wanted.flashT }; });
  t.assert(wanted.lvl === 3 && wanted.flash > 0, 'three stars, flashing on the rise: ' + JSON.stringify(wanted));
  await t.shot(page, 'ui_wanted3');
  const dead = await page.evaluate(() => { GTP.AI.wanted.clear(); GTP.game.player.hp = 0; GTP.game.advance(0.8); return { state: GTP.game.state, death: GTP.Combat.death && GTP.Combat.death.text }; });
  t.assert(dead.state === 'wasted' && dead.death === 'RATIO\'D', 'wasted state shows the RATIO\'D card: ' + JSON.stringify(dead));
  await t.shot(page, 'ui_ratiod');
  const back = await page.evaluate(() => { GTP.game.advance(3.5); return GTP.game.state; });
  t.assert(back === 'playing', 'respawned after the card');
  const cred = await page.evaluate(() => { GTP.UI.credits('m15b_liveread'); GTP.game.advance(3); return { state: GTP.game.state, page: GTP.UI.state.pause.page, lines: GTP.UI.state.credits && GTP.UI.state.credits.lines.length }; });
  t.assert(cred.state === 'paused' && cred.page === 'credits' && cred.lines > 20, 'credits roll in the paused state: ' + JSON.stringify(cred));
  await t.shot(page, 'ui_credits');
  const skipped = await page.evaluate(() => { T_.press('confirm'); return GTP.game.state; });
  t.assert(skipped === 'playing', 'confirm skips the credits');

  // ---- 8. the front end: SAVE from the pause menu, quit to the title, CONTINUE, LOAD GAME cards, DELETE / OVERWRITE confirmations, the seed field ----
  const saved = await page.evaluate(() => {
    GTP.game.debug.setMoney(1234);
    GTP.UI.openPause('pause'); GTP.game.render();
    const items = GTP.UI.state.pause.sel; void items;
    // SAVE opens the slot cards in save mode; confirm on slot 2 writes it
    GTP.UI.state.pause.sel = 2; T_.press('confirm'); GTP.game.render();   // RESUME, STORY, SAVE
    const a = { page: GTP.UI.state.pause.page, mode: GTP.UI.state.pause.slotMode };
    T_.press('right'); GTP.game.render(); a.sel = GTP.UI.state.pause.slotSel;
    T_.press('confirm'); GTP.game.advance(0.1);
    const slots = GTP.game.slots();
    a.slot2 = !slots[1].empty && slots[1].meta.money === 1234; a.active = GTP.game.activeSlot; a.toast = GTP.UI.state.toasts.map((x) => x.text).join('|');
    GTP.game.render();
    return a;
  });
  console.log('  save: ' + JSON.stringify(saved));
  t.assert(saved.page === 'slots' && saved.mode === 'save' && saved.sel === 1 && saved.slot2 && saved.active === 2 && /slot 2/.test(saved.toast), 'SAVE writes the chosen slot and makes it active');
  await t.shot(page, 'ui_pause_slots');
  const quit = await page.evaluate(() => {
    T_.press('cancel');   // back to the pause menu
    GTP.UI.state.pause.sel = 9; T_.press('confirm'); GTP.game.render();   // QUIT TO TITLE
    const a = { confirm: GTP.UI.state.confirm && GTP.UI.state.confirm.title };
    GTP.UI.state.confirm.sel = 0; T_.press('confirm'); GTP.game.advance(0.2); GTP.game.render();
    a.state = GTP.game.state; a.free = GTP.Render.free; a.items = GTP.UI.state.title.items.map((i) => i.id);
    return a;
  });
  console.log('  quit: ' + JSON.stringify(quit));
  t.assert(quit.confirm === 'QUIT TO TITLE?' && quit.state === 'title' && quit.free && quit.items[0] === 'continue', 'QUIT TO TITLE asks in-page, then the title offers CONTINUE first');
  await t.shot(page, 'ui_title_continue');
  const cards = await page.evaluate(() => {
    T_.sel('load'); T_.press('confirm'); GTP.game.render();
    const a = { page: GTP.UI.state.title.page, sel: GTP.UI.state.title.slotSel };
    // DELETE on slot 2 (right = the second button) asks in-page; BACK keeps the save
    T_.press('right'); a.btn = GTP.UI.state.title.slotBtn; T_.press('confirm'); GTP.game.render();
    a.confirm = GTP.UI.state.confirm && GTP.UI.state.confirm.title;
    return a;
  });
  console.log('  cards: ' + JSON.stringify(cards));
  t.assert(cards.page === 'slots' && cards.sel === 1 && cards.btn === 1 && cards.confirm === 'DELETE SLOT 2?', 'LOAD GAME selects the latest slot; DELETE asks in-page');
  await t.shot(page, 'ui_title_confirm');
  const kept = await page.evaluate(() => {
    T_.press('cancel'); const kept = !GTP.game.slots()[1].empty && !GTP.UI.state.confirm;
    // the seed field takes digits
    GTP.Input.text.capture = true; GTP.UI.state.title.seedFocus = true; GTP.Input.text.queue.push('4', '2', 'Enter');
    GTP.game.advance(1 / 60);
    const seed = GTP.UI.state.title.seed, focus = GTP.UI.state.title.seedFocus;
    GTP.game.render();
    return { kept, seed, focus };
  });
  t.assert(kept.kept && kept.seed === '42' && !kept.focus, 'BACK keeps the slot; the seed field reads typed digits: ' + JSON.stringify(kept));
  await t.shot(page, 'ui_title_slots');
  const overwrite = await page.evaluate(() => {
    T_.press('cancel'); GTP.game.render();
    T_.sel('play'); T_.press('confirm'); GTP.game.render();   // a save exists: the picker
    const a = { page: GTP.UI.state.title.page, mode: GTP.UI.state.title.slotMode, sel: GTP.UI.state.title.slotSel };
    GTP.UI.state.title.slotSel = 1; T_.press('confirm'); GTP.game.render();
    a.confirm = GTP.UI.state.confirm && GTP.UI.state.confirm.title;
    T_.press('cancel'); a.still = GTP.game.state; T_.press('cancel');
    return a;
  });
  console.log('  overwrite: ' + JSON.stringify(overwrite));
  t.assert(overwrite.page === 'slots' && overwrite.mode === 'new' && overwrite.sel === 2 && overwrite.confirm === 'OVERWRITE SLOT 2?' && overwrite.still === 'title', 'NEW GAME with saves opens the picker on the first empty slot (3); a filled one asks to overwrite: ' + JSON.stringify(overwrite));
  const loaded = await page.evaluate(() => { T_.sel('continue'); T_.press('confirm'); GTP.game.advance(0.2); GTP.Render.prebuild(GTP.game.player.x, GTP.game.player.z, 100); GTP.game._loadT = 0; GTP.game._endLoading(); return { state: GTP.game.state, money: GTP.game.player.money, free: GTP.Render.free, slot: GTP.game.activeSlot }; });
  t.assert(loaded.state === 'playing' && loaded.money === 1234 && !loaded.free && loaded.slot === 2, 'CONTINUE loads the latest slot: ' + JSON.stringify(loaded));

  // ---- 12. settings apply and persist ----
  const settings = await page.evaluate(() => {
    const S = GTP.UI.settings, rows = GTP.UI.settingRows, q0 = GTP.Render.quality.current;
    S.quality = 'high'; GTP.UI.applySetting('quality');
    const a = { q: GTP.Render.quality.current, auto: GTP.Render.quality.auto, q0 };
    S.quality = 'low'; GTP.UI.applySetting('quality'); a.q2 = GTP.Render.quality.current;
    S.drawDistance = 'far'; GTP.UI.applySetting('drawDistance'); a.draw = GTP.C.QUALITY.drawDistance; a.fog = GTP.Render.scene.fog.far;
    S.master = 50; S.sfx = 80; GTP.UI.applySetting('master'); a.vol = GTP.Audio.volumes && [GTP.Audio.volumes.master, GTP.Audio.volumes.sfx];
    S.hints = false; GTP.UI.applySetting('hints'); a.hints = GTP.Hints.enabled;
    S.gamepad = false; GTP.UI.applySetting('gamepad'); a.pad = GTP.Input.gamepadEnabled;
    S.hints = true; GTP.UI.applySetting('hints'); S.gamepad = true; GTP.UI.applySetting('gamepad'); S.drawDistance = 'normal'; GTP.UI.applySetting('drawDistance');
    a.saved = GTP.UI.saveSettings(); let raw = null; try { raw = JSON.parse(localStorage.getItem('gtp.settings.v1')); } catch (e) { raw = null; }
    a.persisted = raw && raw.master === 50 && raw.quality === 'low' && raw.drawDistance === 'normal';
    return a;
  });
  console.log('  settings: ' + JSON.stringify(settings));
  t.assert(settings.q === 'high' && !settings.auto && settings.q2 === 'low' && settings.draw === 360 && settings.fog === 360, 'quality and draw distance apply live through Render.quality / C.QUALITY');
  t.assert(settings.vol && settings.vol[0] === 0.5 && settings.vol[1] === 0.8 && settings.hints === false && settings.pad === false && settings.saved && settings.persisted, 'volumes, hints and the gamepad toggle apply and persist');

  // ---- 13. the gamepad: a fake standard pad ----
  const pad = await page.evaluate(() => {
    const fake = { index: 0, id: 'Fake Standard Pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] };
    for (let i = 0; i < 17; i++) fake.buttons.push({ pressed: false, value: 0 });
    navigator.getGamepads = () => [fake];
    window.T_.pad = fake;
    GTP.UI.openPause('pause'); GTP.game.advance(1 / 60);
    const a = {};
    fake.axes[1] = 1; GTP.game.advance(1 / 60); a.selAfterStick = GTP.UI.state.pause.sel; a.device = GTP.Input.lastDevice; a.glyph = GTP.UI.glyph('confirm');
    fake.axes[1] = 0; GTP.game.advance(1 / 60);
    fake.buttons[1].pressed = true; GTP.game.advance(1 / 60); fake.buttons[1].pressed = false; GTP.game.advance(1 / 60);
    a.stateAfterB = GTP.game.state;
    // on foot: A = jump, RT = shoot, Y = enter, d-pad left = the melee quick slot
    const p = GTP.game.player; p.weapons.pistol = 24; p.weapon = 'pistol';
    fake.buttons[14].pressed = true; GTP.game.advance(1 / 60); fake.buttons[14].pressed = false; GTP.game.advance(1 / 60);
    a.quick = p.weapon;
    fake.buttons[0].pressed = true; GTP.game.advance(1 / 60); a.jump = GTP.Input.down('jump'); fake.buttons[0].pressed = false; GTP.game.advance(1 / 60);
    a.rumble = GTP.Input.rumble(80, 0.5);
    navigator.getGamepads = () => [];
    GTP.game.advance(1 / 60);
    a.after = GTP.Input.gamepad.index;
    GTP.Input._device('keyboard');
    return a;
  });
  console.log('  pad: ' + JSON.stringify(pad));
  t.assert(pad.selAfterStick === 1 && pad.device === 'gamepad' && pad.glyph === 'A' && pad.stateAfterB === 'playing', 'the stick steps the pause menu, B backs out, the glyphs switch to the pad');
  t.assert(pad.quick === 'fist' && pad.jump === true && pad.rumble === false && pad.after === -1, 'd-pad left picks the melee slot, A jumps, rumble is a quiet no-op, the pad is forgotten when it goes');

  // ---- 9. the shop, the weapon wheel, the scope, hit markers ----
  const shop = await page.evaluate(() => {
    const W = GTP.World, CB = GTP.Combat, p = GTP.game.player;
    const lm = W.landmarks.filter((l) => l.kind === 'gunshop')[0];
    GTP.Missions.state.completed.add('m03b_range');
    GTP.game.debug.setMoney(2000);
    // the store's green light stands beside the door (a mission light may hold the door itself)
    const st = CB.shop.stores().find((s) => s.id === lm.id) || { x: lm.door.x, z: lm.door.z };
    GTP.game.debug.teleport(st.x, st.z); GTP.game.advance(0.8);
    const a = { state: GTP.game.state, page: GTP.UI.state.shopOpen, open: CB.shop.state.open, tab: GTP.UI.state.shop.tab, control: p.controlEnabled };
    GTP.game.render();
    // buy the table leg (sold from m03b): confirm on the first row; then the money feedback; then a locked one refuses with the mission title
    GTP.UI.state.shop.sel = 0; T_.press('confirm'); GTP.game.advance(0.1);
    a.bought = p.weapons.tableleg === Infinity; a.money = p.money; a.msg = GTP.UI.state.shop.msg && GTP.UI.state.shop.msg.text;
    const items = CB.shop.items('weapons'); const lockedIdx = items.findIndex((it) => it.locked);
    GTP.UI.state.shop.sel = lockedIdx; T_.press('confirm'); a.lockedMsg = GTP.UI.state.shop.msg && GTP.UI.state.shop.msg.text;
    GTP.UI.state.shop.sel = 0;
    return a;
  });
  console.log('  shop: ' + JSON.stringify(shop));
  t.assert(shop.state === 'playing' && shop.page === true && shop.open && shop.tab === 0 && shop.control === false, 'standing in the green marker opens the shop page over the running world with the player held: ' + JSON.stringify(shop));
  t.assert(shop.bought && shop.money === 1850 && /SOLD/.test(shop.msg) && /LOCKED/.test(shop.lockedMsg) && !/m\d\d/.test(shop.lockedMsg), 'buying takes the money with feedback; a locked item names the mission, never the id: ' + shop.lockedMsg);
  await t.shot(page, 'ui_shop');
  const shopClosed = await page.evaluate(() => { T_.press('cancel'); GTP.game.advance(0.2); return { state: GTP.game.state, open: GTP.Combat.shop.state.open, page: GTP.UI.state.shopOpen, control: GTP.game.player.controlEnabled }; });
  t.assert(shopClosed.state === 'playing' && !shopClosed.open && !shopClosed.page && shopClosed.control, 'Esc leaves the shop and the player walks again: ' + JSON.stringify(shopClosed));
  const wheel = await page.evaluate(() => {
    const p = GTP.game.player, CB = GTP.Combat;
    GTP.game.debug.teleport(p.x + 20, p.z); GTP.game.advance(0.3);
    GTP.game.debug.giveWeapon('smg', 60);
    GTP.Input.set('lockOn', true); GTP.game.advance(0.3);
    const a = { open: CB.wheel.open, hud: !!CB.hud().wheel.open };
    GTP.Input.setLook(0, 40); GTP.game.advance(0.1);   // down: the segment at the bottom of the ring
    a.index = CB.wheel.index; GTP.game.render();
    return a;
  });
  t.assert(wheel.open && wheel.hud && wheel.index === 6, 'holding Tab opens the wheel and the mouse picks a segment: ' + JSON.stringify(wheel));
  await t.shot(page, 'ui_wheel');
  const scope = await page.evaluate(() => {
    const p = GTP.game.player, CB = GTP.Combat;
    GTP.Input.set('lockOn', false); GTP.game.advance(0.2);
    GTP.game.debug.giveWeapon('sniper', 10); p.weapon = 'sniper'; GTP.game.advance(0.1);
    GTP.Input.set('aim', true); GTP.game.advance(0.6);
    const a = { scope: !!CB.hud().scope, zoom: CB.scope.zoom, mode: p.cameraMode };
    GTP.game.render();
    return a;
  });
  t.assert(scope.scope && scope.zoom === 2 && scope.mode === 'first', 'the scope overlay is up with the sniper aimed: ' + JSON.stringify(scope));
  await t.shot(page, 'ui_scope');
  const hitmark = await page.evaluate(() => {
    const p = GTP.game.player, CB = GTP.Combat;
    GTP.Input.set('aim', false); GTP.game.advance(0.3);
    p.weapon = 'pistol'; GTP.game.advance(0.1);
    GTP.Input.set('aim', true); GTP.game.advance(0.3);
    // a hit marker and a kill confirm as Combat reports them, plus a reload in flight
    CB.hitmark.t = GTP.game.time.t; CB.hitmark.kill = true; CB.hitmark.zone = 'head';
    p.reloadT = 0.6; p.reloadTotal = 1.2; p.reloadId = 'pistol';
    const h = CB.hud();
    GTP.game.render();
    const a = { aim: CB.aim.active, hm: !!h.hitmark && h.hitmark.kill, reloading: !!h.weapon.reloading };
    GTP.Input.set('aim', false); p.reloadT = 0;
    return a;
  });
  t.assert(hitmark.aim && hitmark.hm && hitmark.reloading, 'the crosshair shows the kill confirm and the reload arc: ' + JSON.stringify(hitmark));
  await t.shot(page, 'ui_hitmark');

  // ---- 10. CONTEXT STAMPED with RETRY ----
  const failed = await page.evaluate(() => {
    const p = GTP.game.player;
    GTP.game.advance(0.3);
    GTP.Missions.registerTest({ id: 't_retry_ui', title: 'Deadline Energy', giver: 'gus', marker: 'campus_quad', requires: [], reward: 100, intro: [], outro: [], objectives: [{ type: 'goto', target: { landmark: 'dorm_studio' }, radius: 48, text: 'Get to Dorm 4B' }, { type: 'timer_wrap', seconds: 1, objectives: [{ type: 'goto', target: { landmark: 'green_room' }, radius: 48, text: 'Then the motel. Fast.' }] }], failOn: ['player_dead'] });
    GTP.Missions.start('t_retry_ui', { skipIntro: true }); GTP.game.advance(0.2);
    GTP.Missions.completeObjective(); GTP.game.advance(0.2);   // into the 1 s timer
    const s = T_.until(() => !GTP.Missions.state.active, 4);
    GTP.game.advance(1.0);
    const c = GTP.UI.state.card;
    GTP.game.render();
    return { s, card: c && c.kind, title: c && c.title, retry: GTP.Missions.canRetry(), x: p.x };
  });
  console.log('  failed: ' + JSON.stringify(failed));
  t.assert(failed.s > 0 && failed.card === 'failed' && failed.title === 'CONTEXT STAMPED' && failed.retry, 'the timer fails the mission with RETRY on offer');
  await t.shot(page, 'ui_failed_retry');
  const retried = await page.evaluate(() => { T_.press('confirm'); GTP.game.advance(0.3); return { active: GTP.Missions.state.active, card: !!GTP.UI.state.card, timer: GTP.Missions.state.timer && GTP.Missions.state.timer.remaining }; });
  t.assert(retried.active === 't_retry_ui' && !retried.card && retried.timer > 0.5, 'confirm on RETRY resumes the mission at the checkpoint with the timer back: ' + JSON.stringify(retried));
  await page.evaluate(() => { GTP.Missions.abort(); GTP.game.advance(0.2); });

  // ---- 11. letterbox + skip pill, hints, the race HUD, the stunt overlay, the memo counter ----
  const cut = await page.evaluate(() => {
    const Cs = GTP.Cutscenes;
    if (!Cs.scriptFor('cs_opening')) return { none: true };
    Cs.play('cs_opening', () => {});
    GTP.game.advance(1.2);
    GTP.Input.set('confirm', true); GTP.game.advance(0.3);
    const h = Cs.hud();
    GTP.game.render();
    return { state: GTP.game.state, letterbox: h.letterbox, skip: h.skip };
  });
  console.log('  cutscene: ' + JSON.stringify(cut));
  if (!cut.none) {
    t.assert(cut.state === 'cutscene' && cut.letterbox && cut.skip > 0.3 && cut.skip < 1, 'the letterbox is up and the HOLD TO SKIP pill fills while confirm is held');
    await t.shot(page, 'ui_letterbox');
    await page.evaluate(() => { GTP.Input.set('confirm', false); GTP.game.advance(0.1); GTP.Cutscenes.cancel(); GTP.game.setState('playing'); GTP.game.advance(0.2); });
  }
  const hint = await page.evaluate(() => {
    GTP.Hints.enabled = true;
    delete GTP.Missions.state.flags.hint_h_map; GTP.Hints.fire('h_map', true);
    // another hint may be up (6 s) and the queue keeps a 2 s gap: wait for ours
    const s = T_.until(() => GTP.Hints.hud() && GTP.Hints.hud().id === 'h_map', 12, 0.1);
    GTP.game.advance(0.3);
    const h = GTP.Hints.hud(); GTP.game.render();
    return { id: h && h.id, text: h && h.text, s };
  });
  t.assert(hint.id === 'h_map' && /waypoint/.test(hint.text), 'the hint toast shows the fired hint: ' + JSON.stringify(hint));
  await t.shot(page, 'ui_hint');
  const race = await page.evaluate(() => {
    const St = GTP.Strands, orig = St.hud;
    window.T_.strandsHud = orig;
    St.hud = () => ({ active: 'loop_races', title: 'The Upper Loop', line: 'P2 / 4   LAP 1 / 1', race: { active: true, id: 'lr_01', name: 'The Upper Loop', countdown: 0, position: 2, racers: 4, lap: 1, laps: 1, checkpoint: 3, total: 8, time: 41.3 } });
    GTP.game.render();
    return GTP.UI.state.objBottom > 60;
  });
  t.assert(race, 'the race HUD takes the top of the objective column');
  await t.shot(page, 'ui_race');
  await page.evaluate(() => { GTP.Strands.hud = T_.strandsHud; });
  const stunt = await page.evaluate(() => {
    const St = GTP.Strands, orig = St.hud;
    St.hud = () => ({ active: null, race: { active: false }, stunt: { ramp: 'sj_02', airT: 1.21 } });
    GTP.game.timeScale = 0.35; GTP.game.advance(0.5);
    return { k: GTP.UI.state.stunt.k };
  });
  t.assert(stunt.k > 0.9, 'the slow-motion bars fade in with the stunt: ' + JSON.stringify(stunt));
  await t.shot(page, 'ui_stunt');
  const stuntOff = await page.evaluate(() => { GTP.Strands.hud = T_.strandsHud; GTP.game.timeScale = 1; GTP.game.advance(0.5); return GTP.UI.state.stunt.k; });
  t.assert(stuntOff < 0.1, 'and out after the landing: ' + stuntOff);
  const memo = await page.evaluate(() => { GTP.Events.emit('memo', { id: 'mm_01', n: 12, total: 50 }); GTP.game.advance(0.3); return GTP.UI.state.memoFloat && GTP.UI.state.memoFloat.n; });
  t.assert(memo === 12, 'the memo counter floats on a memo event: ' + memo);

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
  await page.close();

  // ---- 14. a 400x800 touch viewport ----
  const mctx = await t.browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  const mp = await mctx.newPage();
  mp.setDefaultTimeout(240000);
  const mErrors = [];
  mp.on('pageerror', (e) => mErrors.push(String(e && e.stack || e)));
  await mp.goto(t.url({ headless: 1, skipTitle: 1, seed: 7 }));
  await t.waitPlaying(mp);
  await mp.touchscreen.tap(300, 400);
  const touch = await mp.evaluate(() => {
    GTP.game.advance(0.5);
    GTP.UI.toast('Touch controls on');
    GTP.game.debug.setWanted(2);
    GTP.Missions.registerTest({ id: 't_ui2', title: 'Table Stakes', giver: 'gus', marker: 'campus_quad', requires: [], reward: 100, intro: [], outro: [], objectives: [{ type: 'goto', target: { landmark: 'dorm_studio' }, radius: 48, text: 'Get to Dorm 4B' }], failOn: ['player_dead'] });
    GTP.Missions.start('t_ui2', { skipIntro: true }); GTP.game.advance(0.5);
    const s = GTP.UI.state, W = GTP.Render.width, H = GTP.Render.height;
    const bad = s.touch.buttons.filter((b) => b.x - b.r < 0 || b.x + b.r > W || b.y - b.r < 0 || b.y + b.r > H).map((b) => b.id);
    return { visible: s.touch.visible, active: GTP.Input.touch.active, w: W, h: H, bad, buttons: s.touch.buttons.length, ids: s.touch.buttons.map((b) => b.id).join(',') };
  });
  console.log('  touch: ' + JSON.stringify(touch));
  t.assert(touch.visible && touch.active && touch.w >= 360 && touch.w <= 400 && touch.h === 800, 'touch controls appear on the first tap at 400x800 (the shell keeps 16 px side gutters)');
  t.assert(touch.bad.length === 0 && touch.buttons === 10 && /reload/.test(touch.ids) && /cover/.test(touch.ids) && /special/.test(touch.ids), 'all ten touch buttons (with RELOAD, COVER, SPCL) sit inside the screen');
  await t.shot(mp, 'ui_phone_touch');
  const stick = await mp.evaluate(() => {
    const p = GTP.game.player, x0 = p.x, z0 = p.z;
    GTP.UI.touch.handle({ type: 'touchstart', changedTouches: [{ identifier: 9, clientX: 90, clientY: 650 }] });
    GTP.UI.touch.handle({ type: 'touchmove', changedTouches: [{ identifier: 9, clientX: 90, clientY: 600 }] });
    GTP.game.advance(1.5);
    GTP.UI.touch.handle({ type: 'touchend', changedTouches: [{ identifier: 9, clientX: 90, clientY: 600 }] });
    GTP.game.advance(0.2);
    return { moved: Math.hypot(p.x - x0, p.z - z0), stick: GTP.Input.touch.stick.active };
  });
  console.log('  stick: ' + JSON.stringify(stick));
  t.assert(stick.moved > 2 && !stick.stick, 'the virtual stick walks the player and releases');
  // a long press on WPN opens the wheel; a short tap cycles
  const wpn = await mp.evaluate(() => {
    const b = GTP.UI.state.touch.buttons.find((x) => x.id === 'weapon'), CB = GTP.Combat, p = GTP.game.player;
    GTP.game.debug.giveWeapon('pistol', 12);
    GTP.UI.touch.handle({ type: 'touchstart', changedTouches: [{ identifier: 3, clientX: b.x, clientY: b.y }] });
    GTP.game.advance(0.4);
    const open = CB.wheel.open;
    GTP.UI.touch.handle({ type: 'touchend', changedTouches: [{ identifier: 3, clientX: b.x, clientY: b.y }] });
    GTP.game.advance(0.1);
    const closed = !CB.wheel.open, w0 = p.weapon;
    GTP.UI.touch.handle({ type: 'touchstart', changedTouches: [{ identifier: 4, clientX: b.x, clientY: b.y }] });
    GTP.game.advance(0.05);
    GTP.UI.touch.handle({ type: 'touchend', changedTouches: [{ identifier: 4, clientX: b.x, clientY: b.y }] });
    GTP.game.advance(0.1);
    return { open, closed, w0, w1: p.weapon };
  });
  console.log('  wpn: ' + JSON.stringify(wpn));
  t.assert(wpn.open && wpn.closed && wpn.w1 !== wpn.w0, 'holding WPN opens the wheel, releasing closes it, a tap cycles the weapon');
  // the map page on a phone: pinch zooms, a tap sets the waypoint
  const mapTouch = await mp.evaluate(() => {
    GTP.Input.set('map', true); GTP.game.advance(1 / 60); GTP.Input.set('map', false); GTP.game.advance(1 / 60);
    GTP.game.render();
    const r = GTP.UI.state.map.rect, z0 = GTP.UI.state.map.zoom;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    GTP.UI.touch.handle({ type: 'touchstart', changedTouches: [{ identifier: 11, clientX: cx - 30, clientY: cy }] });
    GTP.UI.touch.handle({ type: 'touchstart', changedTouches: [{ identifier: 12, clientX: cx + 30, clientY: cy }] });
    GTP.UI.touch.handle({ type: 'touchmove', changedTouches: [{ identifier: 11, clientX: cx - 80, clientY: cy }, { identifier: 12, clientX: cx + 80, clientY: cy }] });
    GTP.UI.touch.handle({ type: 'touchend', changedTouches: [{ identifier: 11, clientX: cx - 80, clientY: cy }, { identifier: 12, clientX: cx + 80, clientY: cy }] });
    GTP.game.advance(1 / 60);
    const z1 = GTP.UI.state.map.zoom;
    GTP.UI.touch.handle({ type: 'touchstart', changedTouches: [{ identifier: 13, clientX: cx + 20, clientY: cy + 20 }] });
    GTP.UI.touch.handle({ type: 'touchend', changedTouches: [{ identifier: 13, clientX: cx + 20, clientY: cy + 20 }] });
    GTP.game.advance(1 / 60); GTP.game.render();
    return { page: GTP.UI.state.pause.page, state: GTP.game.state, z0, z1, wp: !!GTP.game.waypoint };
  });
  console.log('  map touch: ' + JSON.stringify(mapTouch));
  t.assert(mapTouch.page === 'phone' && mapTouch.state === 'paused' && mapTouch.z1 > mapTouch.z0 * 1.5 && mapTouch.wp, 'the phone map pinches to zoom and a tap sets the waypoint');
  await t.shot(mp, 'ui_map_touch');
  const mErrs = await t.gameErrors(mp);
  t.assert(mErrors.length === 0 && mErrs.length === 0, 'touch page errors:\n' + mErrors.concat(mErrs).join('\n'));
  await mctx.close();
});
