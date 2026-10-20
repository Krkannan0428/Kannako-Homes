/* ui.js: the 2D overlay (11_ui).
 *  1 a non-headless boot without skipTitle shows the title screen with the attract camera; Enter starts play
 *  2 HUD on foot (bars, money, stars, weapon, objective + timer, minimap, chip) and in a car at night (radio ticker)
 *  3 showDialogue with a cast portrait; confirm advances through the callback
 *  4 pause menu and phone (M) by keys; the phone tabs cycle; abort via the phone
 *  5 debate minigame with scripted inputs through GTP.UI.minigames.debate: a win and a loss resolve onResult, summary format
 *  6 ratio minigame likewise: dunks in the green centre, the hottake primes a dunk, summary format
 *  7 wanted 3 stars flash; the RATIO'D card; credits roll and skip
 *  8 a 400x800 touch viewport: touch controls visible after a tap, every control inside the screen
 * Screenshots in tests/out: ui_title, ui_hud_foot, ui_hud_car_night, ui_dialogue, ui_pause, ui_phone, ui_debate, ui_ratio,
 * ui_wanted3, ui_ratiod, ui_credits, ui_phone_touch (look at them). */
'use strict';
const H = require('./_harness');

H.run('ui', async (t) => {
  // ---- 1. title screen (non-headless, no skipTitle) ----
  const page = await t.browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const ctx = { page, pageErrors, consoleErrors };
  await page.goto(t.url({ headless: 0, skipTitle: 0, seed: 7, mute: 1 }));
  await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.booted && GTP.game.state === 'title', null, { timeout: 240000 });
  // let the live loop draw a few attract frames, then freeze it so the rest of the test is deterministic
  await page.waitForFunction(() => GTP.game.frames >= 3, null, { timeout: 240000 });
  const title = await page.evaluate(() => ({ state: GTP.game.state, free: GTP.Render.free, frames: GTP.game.frames, cam: GTP.Render.camera.position.y, attract: GTP.UI.state.attract.on }));
  console.log('  title: ' + JSON.stringify(title));
  t.assert(title.state === 'title' && title.free && title.attract && title.cam > 20, 'title screen with the attract camera flying over the city');
  await page.screenshot({ path: t.OUT + '/ui_title.png' });
  await page.evaluate(() => { cancelAnimationFrame(GTP.game._raf); GTP.game._raf = 0; });
  await page.keyboard.press('Enter');
  await page.evaluate(() => GTP.game.advance(0.2));
  const started = await page.evaluate(() => ({ state: GTP.game.state, free: GTP.Render.free, d: Math.hypot(GTP.Render.camera.position.x - GTP.game.player.x, GTP.Render.camera.position.z - GTP.game.player.z) }));
  console.log('  after Enter: ' + JSON.stringify(started));
  t.assert(started.state === 'playing' && !started.free && started.d < 8, 'Enter starts play and the chase camera is back on the player');

  // ---- 2. HUD on foot ----
  await page.evaluate(() => {
    window.T_ = {
      press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
      until(pred, maxSec, step) { step = step || 1 / 60; let s = 0; while (s < maxSec) { GTP.game.advance(step); s += step; if (pred()) return s; } return -1; }
    };
    GTP.Missions.registerTest({ id: 't_ui', title: 'Read the Read', giver: 'firmness', marker: 'campus_quad', requires: [], reward: 500, intro: [], outro: [], objectives: [{ type: 'timer_wrap', seconds: 120, objectives: [{ type: 'drive_to', target: { landmark: 'green_room' }, vehicle: 'any', text: 'Deliver the mattress before code TAKES20 expires' }] }], failOn: ['player_dead'] });
    GTP.game.debug.giveWeapon('pistol', 24);
    GTP.game.debug.setWanted(1);
    GTP.Missions.start('t_ui', { skipIntro: true });
    GTP.UI.toast('Welcome to Grievance City');
    GTP.game.advance(1);
  });
  const foot = await page.evaluate(() => { const s = GTP.game.debug.snapshot(); return { state: s.state, mission: s.mission, timer: GTP.Missions.state.timer && Math.round(GTP.Missions.state.timer.remaining), street: s.street, district: s.district, map: !!GTP.UI.state.map.bake }; });
  console.log('  foot: ' + JSON.stringify(foot));
  t.assert(foot.mission === 't_ui' && foot.timer > 100 && foot.map, 'mission timer runs and the minimap is baked');
  await t.shot(page, 'ui_hud_foot');

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
  // the Nap Dynasty ad at minute 20 on every station
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
  t.assert(nap.length === 4 && nap.every(Boolean), 'the mattress ad runs at minute 20 on every station');

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
  // Roz's sign follows the player's most recent habit
  const sign = await page.evaluate(() => { const p = GTP.game.player; p.stats.honking = (p.stats.honking || 0) + 1; GTP.game.advance(0.1); return GTP.UI.rozSign(); });
  t.assert(sign === 'STOP HONKING', 'Roz\'s sign reads the latest stat: ' + sign);

  // ---- 4. pause and phone ----
  const pause = await page.evaluate(() => { T_.press('pause'); return { state: GTP.game.state, page: GTP.UI.state.pause.page }; });
  t.assert(pause.state === 'paused' && pause.page === 'pause', 'Esc opens the pause menu: ' + JSON.stringify(pause));
  await t.shot(page, 'ui_pause');
  const resumed = await page.evaluate(() => { T_.press('back'); GTP.Input.set('back', false); GTP.game.advance(1 / 60); T_.press('confirm'); return GTP.game.state; });
  t.assert(resumed === 'playing', 'down + confirm on RESUME... resumes (state ' + resumed + ')');
  const phone = await page.evaluate(() => {
    T_.press('map');
    const a = { state: GTP.game.state, page: GTP.UI.state.pause.page, tab0: GTP.UI.state.pause.tab };
    T_.press('right'); a.tab1 = GTP.UI.state.pause.tab;
    return a;
  });
  t.assert(phone.state === 'paused' && phone.page === 'phone' && phone.tab0 === 0 && phone.tab1 === 1, 'M opens the phone, right cycles tabs: ' + JSON.stringify(phone));
  await t.shot(page, 'ui_phone');
  const aborted = await page.evaluate(() => { T_.press('back'); GTP.game.advance(0.2); return { active: GTP.Missions.state.active, state: GTP.game.state }; });
  t.assert(aborted.active === null && aborted.state === 'playing', 'Backspace in the missions tab aborts and closes: ' + JSON.stringify(aborted));

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
        if (st.phase === 'reveal' && !out.shot && out.answers >= 2 && params.rounds === 1 && params.opponent === 'freshman' && answerFn === T_.good) { GTP.game.render(); out.shot = true; T_.snap = true; }
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
  t.assert(debate.win.result === true && debate.win.perfect >= 3 && debate.win.rounds === '1-0', 'correct counters inside 40% of the timer win with perfect hits');
  t.assert(/^ROUNDS 1-0 · PERFECT HITS \d+ · SHOUTS 0 · MINDS CHANGED 0$/.test(debate.win.summary), 'summary format: ' + debate.win.summary);
  t.assert(debate.lose.result === false && debate.lose.rounds === '0-1', 'wrong counters lose the round and the match');
  // a mid-match screenshot of the debate screen
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
      if (R.zone() === 'DUNK' && st.postsLeft > 0) { T_.press('action'); out.posts++; }
      if (out.posts === 2 && !out.shotTaken) { out.shotTaken = true; GTP.game.render(); }
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
    GTP.game.advance(4.2);   // one opponent reply lands
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

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
  await page.close();

  // ---- 8. a 400x800 touch viewport ----
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
    return { visible: s.touch.visible, active: GTP.Input.touch.active, w: W, h: H, bad, buttons: s.touch.buttons.length };
  });
  console.log('  touch: ' + JSON.stringify(touch));
  t.assert(touch.visible && touch.active && touch.w === 400 && touch.h === 800, 'touch controls appear on the first tap at 400x800');
  t.assert(touch.bad.length === 0 && touch.buttons === 7, 'all seven touch buttons sit inside the screen');
  await t.shot(mp, 'ui_phone_touch');
  // the virtual stick moves the player
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
  const mErrs = await t.gameErrors(mp);
  t.assert(mErrors.length === 0 && mErrs.length === 0, 'touch page errors:\n' + mErrors.concat(mErrs).join('\n'));
  await mctx.close();
});
