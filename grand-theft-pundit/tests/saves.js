/* saves.js: the v3 save system (30_game.js).
 *  1 save to slot 2, change everything, load slot 2: position, money, weapons + ammo, completed missions, flags, strand progress,
 *    memos, best times, subscribers and the clock come back; slots() meta is right; latestSlot picks it
 *  2 delete the slot
 *  3 a hand-written gtp.save.v2 migrates into slot 1 at boot (play time 0, summary rebuilt) and loads through CONTINUE (load())
 *  4 autosave fires after a mission completes (the 'saved' event, slot 1 updated), never during a mission or while wanted
 *  5 a blocked localStorage (setItem throws) degrades to one toast, no GTP.errors, and autosave disables itself
 *  6 the loading surface: GTP.game.loading is inert in headless, 'load:done' fired at boot */
'use strict';
const H = require('./_harness');

H.run('saves', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;

  // ---- 1. slot 2 round trip ----
  const saved = await page.evaluate(() => {
    const g = GTP.game, p = g.player, M = GTP.Missions, W = GTP.World, S = GTP.Strands;
    window.T_ = { events: [] };
    GTP.Events.on('saved', (e) => T_.events.push('saved:' + e.slot + ':' + e.reason));
    GTP.Events.on('loaded', (e) => T_.events.push('loaded:' + e.slot));
    GTP.Events.on('save:failed', (e) => T_.events.push('failed:' + e.slot));
    ['m00_intro', 'm01_van'].forEach((id) => M.state.completed.add(id));
    M.state.flags.has_table = true; M.state.flags.has_van = true;
    M.state.bestTimes.m00_intro = 61.5;
    M.refreshMarkers();
    g.debug.setMoney(7777);
    g.debug.giveWeapon('pistol', 24); g.debug.giveWeapon('smg', 60);
    GTP.Combat.ammo(p, 'pistol'); GTP.Combat.ammo(p, 'smg');
    // strand progress and two memos collected by hand (each memo is a strand cycle: +400 subs and an autosave into slot 1)
    const P = S.progress();
    P.loud_cab.fares = 3; P.hoa_patrol.best = 4; P.stunt_jumps.done.push('sj_01');
    const pk = Object.values(S.memoPickups()).slice(0, 2);
    pk.forEach((k) => k.collect(p)); g.advance(0.2);
    p.subs = 12345; GTP.Missions.syncSubs();
    const d = W.landmark('fish_shack').door; g.debug.teleport(d.x + 3, d.z); p.yaw = 0.7;
    g.debug.setClock(3.25); g.time.day = 2;
    g.playTime = 321;
    g.advance(0.1);
    const ok = g.saveSlot(2);
    const slots = g.slots();
    return { ok, slots, latest: g.latestSlot(), active: g.activeSlot, x: +p.x.toFixed(2), z: +p.z.toFixed(2), memos: S.memos().collected.slice(), events: T_.events.slice(), hasSave: g.hasSave(), errors: GTP.errors.length };
  });
  console.log('  saved: ' + JSON.stringify(saved));
  t.assert(saved.ok && saved.hasSave && saved.latest === 2 && saved.active === 2, 'saveSlot(2) writes and becomes the active / latest slot');
  // the two memos were a strand cycle each: autosave wrote slot 1 (the active slot then) before the manual save went to slot 2
  t.assert(!saved.slots[0].empty && !saved.slots[1].empty && saved.slots[2].empty && saved.events.indexOf('saved:1:strand') >= 0, 'slots(): slot 1 autosaved on the memo cycle, slot 2 saved by hand, slot 3 empty: ' + JSON.stringify(saved.slots.map((s) => s.empty)) + ' ' + saved.events.join(','));
  const meta = saved.slots[1].meta;
  t.assert(meta.missions === 2 && meta.missionsTotal >= 17 && meta.lastMission === 'Loud & Correct' && meta.money === 7777 && meta.playTime === 321 && meta.seed === 7 && typeof meta.savedAt === 'number' && meta.district && meta.landmark, 'slot meta: ' + JSON.stringify(meta));
  t.assert(saved.memos.length === 2 && saved.events.indexOf('saved:2:manual') >= 0, 'two memos collected and the saved event fired: ' + saved.events.join(','));

  const loaded = await page.evaluate(() => {
    const g = GTP.game, M = GTP.Missions, S = GTP.Strands;
    // change everything, then load slot 2
    g.debug.setMoney(1); g.player.weapons = { fist: Infinity }; g.player.weapon = 'fist'; g.player.subs = 0;
    g.debug.teleport(100, 100); M.state.completed.clear(); M.state.flags = {}; S.progress().loud_cab.fares = 0;
    const ok = g.loadSlot(2);
    g.advance(0.5);
    const p = g.player, P = S.progress();
    return { ok, state: g.state, x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2), money: p.money, subs: p.subs, weapons: Object.assign({}, p.weapons, { fist: 'inf' }), weapon: p.weapon,
      ammo: GTP.Combat.ammo(p, 'pistol'), completed: Array.from(M.state.completed), flags: M.state.flags, best: M.state.bestTimes, fares: P.loud_cab.fares, hoa: P.hoa_patrol.best, stunts: P.stunt_jumps.done,
      memos: S.memos().collected, memoPickupsLeft: Object.keys(S.memoPickups()).length, clock: +g.time.clock.toFixed(2), day: g.time.day, playTime: Math.round(g.playTime), markers: M.markers().map((m) => m.id), tier: M.subscribers().tier, events: T_.events.slice(), errors: GTP.errors.length };
  });
  console.log('  loaded: ' + JSON.stringify(loaded));
  t.assert(loaded.ok && loaded.state === 'playing' && Math.hypot(loaded.x - saved.x, loaded.z - saved.z) < 1.5 && Math.abs(loaded.yaw - 0.7) < 0.05, 'loadSlot(2) restores the position');
  t.assert(loaded.money === 7777 && loaded.subs === 12345 && loaded.tier === 1, 'money, subscribers and the tier come back');
  t.assert(loaded.weapons.pistol === 24 && loaded.weapons.smg === 60 && loaded.weapon === 'smg' && loaded.ammo && loaded.ammo.mag + loaded.ammo.reserve === 24, 'weapons and the magazine split come back: ' + JSON.stringify(loaded.ammo));
  // the next light: m02_read on the base chain, m01b_airport once the expansion slots in after m01_van
  t.assert(loaded.completed.length === 2 && loaded.flags.has_van === true && loaded.best.m00_intro === 61.5 && loaded.markers.length === 1 && /^(m02_read|m01b_airport)$/.test(loaded.markers[0]), 'missions, flags, best times and the next light come back: ' + loaded.markers.join(','));
  t.assert(loaded.fares === 3 && loaded.hoa === 4 && loaded.stunts.join(',') === 'sj_01' && loaded.memos.length === 2 && loaded.memoPickupsLeft === 48, 'strand progress and the memo count come back (48 envelopes left in the world)');
  t.assert(Math.abs(loaded.clock - 3.25) < 0.03 && loaded.day === 2 && loaded.playTime >= 321 && loaded.playTime < 330, 'clock, day and play time come back');
  t.assert(loaded.events.indexOf('loaded:2') >= 0 && loaded.errors === 0, 'the loaded event fired without errors');

  // ---- 2. delete ----
  const del = await page.evaluate(() => { const g = GTP.game; const a = g.deleteSlot(2); const b = g.deleteSlot(2); const slot1 = g.slots()[0].empty; g.deleteSlot(1); return { a, b, slot1, slots: g.slots().map((s) => s.empty), hasSave: g.hasSave() }; });
  console.log('  delete: ' + JSON.stringify(del));
  t.assert(del.a === true && del.b === false && del.slot1 === false && del.slots.every((e) => e) && !del.hasSave, 'deleteSlot empties one slot once; with every slot gone there is no save');

  // ---- 4. autosave after a mission completes; never during a mission or while wanted ----
  const auto = await page.evaluate(() => {
    const g = GTP.game, M = GTP.Missions;
    T_.events.length = 0;
    g.activeSlot = 1;
    M.registerTest({ id: 't_auto', title: 'Autosave', giver: 'gus', marker: 'campus_quad', requires: [], reward: 10, intro: [], outro: [], objectives: [{ type: 'goto', target: { landmark: 'campus_quad' }, radius: 48, text: 'Here' }], failOn: ['player_dead'] });
    M.start('t_auto', { skipIntro: true });
    g.advance(0.1);
    const duringMission = g.autosave('test');
    const q = GTP.World.landmark('campus_quad').door; g.debug.teleport(q.x, q.z);
    let s = 0; while (s < 6 && M.state.active) { g.advance(0.25); s += 0.25; }
    g.advance(0.5);
    const afterComplete = T_.events.slice();
    const slot1 = g.slots()[0];
    // wanted blocks it
    T_.events.length = 0;
    g.debug.setWanted(1); const whileWanted = g.autosave('test'); GTP.AI.wanted.clear(); g.advance(0.1);
    const calm = g.autosave('test');
    return { duringMission, afterComplete, slot1: slot1.empty ? null : slot1.meta, whileWanted, calm, events: T_.events.slice() };
  });
  console.log('  autosave: ' + JSON.stringify(auto));
  t.assert(auto.duringMission === false && auto.whileWanted === false && auto.calm === true, 'autosave refuses during a mission and while wanted, works when calm');
  t.assert(auto.afterComplete.indexOf('saved:1:mission') >= 0 && auto.slot1 && auto.slot1.missions >= 1, 'a completed mission autosaves into slot 1: ' + auto.afterComplete.join(','));

  // ---- 3. the v2 migration: a hand-written old save becomes slot 1 at boot, and load() continues it ----
  // (a reload of the same page: a new page would be a new browser context with its own empty storage)
  const errs1 = await t.errors(ctx);
  t.assert(errs1.length === 0, 'errors on the first page:\n' + errs1.join('\n'));
  await page.evaluate(() => {
    localStorage.clear();
    const old = { version: 2, seed: 7, money: 4321, x: 300, z: 300, yaw: 1.2, weapons: { fist: 'inf', pistol: 17 }, weapon: 'pistol', armor: 25, hp: 80, completed: ['m00_intro', 'm01_van', 'm02_read'], flags: { has_table: true, has_van: true, sponsored: true }, stats: { missions: 3 }, clock: 9.25, day: 1, radioStation: 1, cameraMode: 'chase' };
    localStorage.setItem('gtp.save.v2', JSON.stringify(old));
  });
  await page.goto(t.url({ seed: 3 }));
  await t.waitPlaying(page);
  const c2 = ctx;
  const mig = await c2.page.evaluate(() => {
    const g = GTP.game;
    const slots = g.slots(), raw = localStorage.getItem('gtp.save.v3.slot1'), legacy = !!localStorage.getItem('gtp.save.v2');
    const ok = g.load();
    g.advance(0.3);
    const p = g.player, M = GTP.Missions;
    return { slots: slots.map((s) => s.empty), meta: slots[0].meta, hasRaw: !!raw, legacy, ok, seed: g.seed, x: Math.round(p.x), z: Math.round(p.z), money: p.money, pistol: p.weapons.pistol, armor: p.armor, hp: p.hp, completed: Array.from(M.state.completed), markers: M.markers().map((m) => m.id), clock: +g.time.clock.toFixed(2), slot: g.activeSlot, errors: GTP.errors.length };
  });
  console.log('  migration: ' + JSON.stringify(mig));
  t.assert(!mig.slots[0] && mig.slots[1] && mig.slots[2] && mig.hasRaw && mig.legacy, 'the v2 save migrated into slot 1 and the old key stayed');
  t.assert(mig.meta && mig.meta.missions === 3 && mig.meta.playTime === 0 && mig.meta.money === 4321 && mig.meta.migrated === true, 'the migrated summary was rebuilt: ' + JSON.stringify(mig.meta));
  t.assert(mig.ok && mig.seed === 7 && mig.x === 300 && mig.z === 300 && mig.money === 4321 && mig.pistol === 17 && mig.armor === 25 && mig.hp === 80 && mig.completed.length === 3 && mig.markers.indexOf('m03_ratio') >= 0 && Math.abs(mig.clock - 9.25) < 0.03 && mig.slot === 1, 'load() continues the migrated game in the old city: ' + JSON.stringify(mig));

  // ---- 5. blocked storage ----
  const blocked = await c2.page.evaluate(() => {
    const g = GTP.game;
    const toasts = [];
    const origToast = GTP.UI.toast; GTP.UI.toast = function (s) { toasts.push(String(s)); return origToast.apply(GTP.UI, arguments); };
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new Error('QuotaExceeded: storage blocked'); };
    const manual = g.saveSlot(3);
    const auto1 = g.autosave('test'), auto2 = g.autosave('test');
    const slots = g.slots().map((s) => s.empty);
    Storage.prototype.setItem = origSet; GTP.UI.toast = origToast;
    return { manual, auto1, auto2, disabled: g.autosaveDisabled, slots, toasts, errors: GTP.errors.length };
  });
  console.log('  blocked: ' + JSON.stringify(blocked));
  t.assert(blocked.manual === false && blocked.auto1 === false && blocked.auto2 === false && blocked.disabled === true, 'a blocked localStorage fails the save and disables autosave');
  t.assert(blocked.toasts.some((s) => /storage/i.test(s)) && blocked.toasts.filter((s) => /Autosave is off/.test(s)).length === 1 && blocked.errors === 0, 'one toast per session, no errors: ' + blocked.toasts.join(' | '));
  t.assert(blocked.slots[2] === true, 'slot 3 stayed empty');

  // ---- 6. loading surface ----
  const ld = await c2.page.evaluate(() => ({ loading: GTP.game.loading, headless: GTP.game.headless }));
  t.assert(ld.loading.active === false && ld.headless, 'headless boot never leaves the loading screen up: ' + JSON.stringify(ld.loading));

  const errs2 = await t.errors(c2);
  t.assert(errs2.length === 0, 'errors on the second page:\n' + errs2.join('\n'));
});
