/* ui_v03.js: the v0.3 screens of 11_ui and the new input actions of 02_input (PLAN_V03 "ui").
 * The other v0.3 modules are stubs on the ui branch, so every screen is driven by emitting the plan's events with sample
 * payloads and by small fakes of the plan's APIs (GTP.Story, Combat.catalog / buy, Vehicles.mod, Systems.stocks ...).
 *  1 GPS: gps:set builds a route, the minimap line, the turn chip, the big map; gps:clear
 *  2 long-range marker labels over the mission markers; the story arrow without a mission
 *  3 phone:call rings, then plays its lines; the call log
 *  4 chapter card; the STORY tab (chapter, NEXT UP with SET GPS, chapters, calls)
 *  5 the armory: interior:enter, armory:inspect opens the weapon card, tabs, attachments / tints / ammo, buy through
 *    Combat.buy with {storeId, weaponId, equip}; the v0.2 shop fallback without Combat.catalog
 *  6 the range HUD (range:start / hit) and the medal card (range:end)
 *  7 the mod shop: preview through Vehicles.mod, buy, revert on exit, the orbit camera released
 *  8 wardrobe and barber: preview on player.look, buy (fallback path), revert on exit
 *  9 property card buy; 10 heist board -> heist:plan {approach, crew}
 * 11 golf HUD, swing meter -> golf:shot, golf:end card
 * 12 prompts (cover, aim), crosshair states gallery, the cook fuse outside aim, the parachute, vehicle HUDs (bike, heli,
 *    plane, boat), boss bar + RATIO'D, special meters, achievement toast, interior fade
 * 13 STOCKS tab trade, STATS with career rows and achievements
 * 14 input: Q cover, Shift+RMB / X special, aircraft axes, the pad's B tap and L3, the latch (QA CMB-06)
 * 15 the QA bugs: C1-02 QUIT drops the retry, C1-08 Escape in a cutscene, C1-09 REPLAY from playing, C1-12 card vs
 *    cutscene, CMB-12 fuse
 * 16 phone width (400x800 touch): the touch buttons per context, the armory, the mod shop, the heist board, STORY
 * Screenshots: tests/out/v3_*.png (look at them). */
'use strict';
const H = require('./_harness');

H.run('ui_v03', async (t) => {
  const ctx = await t.boot({ seed: 7, mute: 1 });
  const page = ctx.page;
  const shot = (name) => t.shot(page, 'v3_' + name);
  await page.evaluate(() => {
    const g = GTP.game, U = GTP.util;
    window.T_ = {
      press(a, n) { GTP.Input.set(a, true); g.advance(1 / 60); GTP.Input.set(a, false); g.advance((n || 1) / 60); },
      adv(s) { g.advance(s); },
      ev: [],
      listen(names) { names.forEach((n) => GTP.Events.on(n, (e) => T_.ev.push([n, e]))); },
      last(name) { for (let i = T_.ev.length - 1; i >= 0; i--) if (T_.ev[i][0] === name) return T_.ev[i][1]; return null; },
      lookAt(x, z) { const p = g.player; GTP.Render.rig.yaw = U.dirToYaw(x - p.x, z - p.z); if (GTP.Render.rig.snap) GTP.Render.rig.snap(); },
      ui: GTP.UI.state
    };
    T_.listen(['gps:set', 'golf:shot', 'heist:plan', 'shop:buy', 'property:buy']);
    // sample content tables (the content track fills GTP.Content.parity)
    GTP.Content.parity = Object.assign(GTP.Content.parity || {}, {
      chapters: [{ act: 1, title: 'Loud & Correct' }, { act: 2, title: 'The Spin Cycle' }, { act: 3, title: 'Both Sides, Armed' }, { act: 4, title: 'Everybody\'s Thursday' }, { act: 5, title: 'Primetime' }],
      weapons: [
        { id: 'compact', name: 'The Footnote .32', class: 'pistol', hold: 'one', flavor: 'Small, cited, deniable.', price: 600 },
        { id: 'auto_take', name: 'Auto Take', class: 'smg', hold: 'two', flavor: 'For when one take is not enough.', price: 1800 },
        { id: 'filibuster', name: 'The Filibuster', class: 'lmg', hold: 'two', flavor: 'It talks for eleven hours straight.', price: 6200 },
        { id: 'pundit_carbine', name: 'Pundit Carbine', class: 'rifle', hold: 'two', flavor: 'Balanced coverage at 300 metres.', price: 3100 }
      ],
      achievements: [{ id: 'first_blood', name: 'Hot Take, Served', desc: 'Win your first fight.' }, { id: 'armory', name: 'Both Sides Now', desc: 'Buy a gun at Both Sides Arms.' }, { id: 'golf', name: 'Fore Context', desc: 'Finish a hole at Goldplate Links.' }, { id: 'secret', name: 'Ratio King', desc: 'Secret', secret: true }],
      properties: [{ id: 'safe_brownstone', name: 'The Brownstone', district: 'Uptown', price: 85000, income: 0, garage: 2, kind: 'safehouse', desc: 'Three floors of exposed brick and unexposed opinions. Bed saves, garage holds two.' }],
      stocks: [{ id: 'OUTR', name: 'Outrage Media', price: 41.2, history: [38, 39, 40.5, 41.2] }]
    });
  });

  // ---- 1. GPS ----
  const gps = await page.evaluate(() => {
    const g = GTP.game, p = g.player, lm = GTP.World.landmarks.find((l) => l.kind === 'gunshop') || GTP.World.landmarks[5];
    const tx = lm.door ? lm.door.x : lm.x, tz = lm.door ? lm.door.z : lm.z;
    GTP.Events.emit('gps:set', { x: tx, z: tz, label: 'Both Sides Arms', kind: 'story' });
    T_.adv(0.5); g.render();
    const G = T_.ui.gps;
    return { set: !!G, route: G && G.route ? G.route.length : 0, len: G ? Math.round(G.len) : 0, dist: G ? Math.round(G.dist) : 0, turn: G && G.turn ? G.turn.dir : null, chip: !!T_.ui.gpsChipRect, arrow: !!GTP.UI.state.gps };
  });
  console.log('  gps: ' + JSON.stringify(gps));
  t.assert(gps.set && gps.route >= 2 && gps.len >= gps.dist * 0.9 && gps.turn && gps.chip, 'gps:set builds a route with a turn chip: ' + JSON.stringify(gps));
  await shot('gps_hud');
  await page.evaluate(() => { GTP.UI.openMap(); T_.adv(0.1); GTP.game.render(); });
  await shot('gps_map');
  await page.evaluate(() => { GTP.UI.closePause(); T_.adv(0.1); });

  // ---- 2. long-range labels ----
  const labels = await page.evaluate(() => {
    const g = GTP.game, p = g.player, mk = GTP.Missions.markers().find((m) => m.kind === 'mission');
    if (!mk) return { none: true };
    g.debug.teleport(mk.x + 70, mk.z + 30); T_.adv(0.2); T_.lookAt(mk.x, mk.z); T_.adv(0.1); g.render();
    return { n: T_.ui.labelsDrawn, title: mk.title };
  });
  console.log('  labels: ' + JSON.stringify(labels));
  t.assert(labels.none || labels.n >= 1, 'a mission marker 76 m away carries a floating label: ' + JSON.stringify(labels));
  await shot('labels');

  // ---- 3. phone call ----
  const call = await page.evaluate(() => {
    GTP.Events.emit('phone:call', { from: 'sloane', lines: ['Bryce. The armory guy wants you on the show. Bring cash.', { who: 'player', text: 'Is it a sponsor read?' }, 'Everything is a sponsor read.'] });
    T_.adv(0.6); GTP.game.render();
    return { phase: T_.ui.call && T_.ui.call.phase };
  });
  await shot('call_ring');
  const call2 = await page.evaluate(() => { T_.adv(1.4); GTP.game.render(); return { phase: T_.ui.call && T_.ui.call.phase, i: T_.ui.call && T_.ui.call.i, log: T_.ui.callLog.length }; });
  await shot('call_talk');
  const call3 = await page.evaluate(() => { T_.adv(16); return { done: !T_.ui.call, log: T_.ui.callLog.length }; });
  console.log('  call: ' + JSON.stringify([call, call2, call3]));
  t.assert(call.phase === 'ring' && call2.phase === 'talk' && call3.done && call3.log === 3, 'phone:call rings, plays three lines and logs them');

  // ---- 4. chapter card and the STORY tab ----
  await page.evaluate(() => { GTP.Events.emit('chapter', { act: 2, title: 'The Spin Cycle' }); T_.adv(1.4); GTP.game.render(); });
  await shot('chapter');
  const story = await page.evaluate(() => {
    const lm = GTP.World.landmark('campus_quad') || GTP.World.landmarks[0];
    GTP.Story = { chapter: { act: 2, title: 'The Spin Cycle' }, next() { return { missionId: 'm01_van', giver: 'gus', landmark: lm.id, x: lm.x, z: lm.z }; } };
    GTP.Events.emit('gps:clear');
    T_.adv(5);
    GTP.UI.openStory(); T_.adv(0.1); GTP.game.render();
    const a = { state: GTP.game.state, tab: GTP.UI.phoneTabs[T_.ui.pause.tab], rows: (T_.ui.pause.rows || []).map((r) => r.kind) };
    return a;
  });
  await shot('story_tab');
  const storyGps = await page.evaluate(() => { T_.press('confirm'); const G = T_.ui.gps; GTP.UI.closePause(); T_.adv(0.1); return { gps: !!G, kind: G && G.kind, label: G && G.label, ev: !!T_.last('gps:set') }; });
  console.log('  story: ' + JSON.stringify([story, storyGps]));
  t.assert(story.state === 'paused' && story.tab === 'STORY' && story.rows[0] === 'gps', 'the STORY tab opens with the NEXT UP row: ' + JSON.stringify(story));
  t.assert(storyGps.gps && storyGps.kind === 'story' && storyGps.ev, 'SET GPS on NEXT UP emits gps:set kind story: ' + JSON.stringify(storyGps));

  // ---- 5. the armory ----
  const armory = await page.evaluate(() => {
    const g = GTP.game, p = g.player, CB = GTP.Combat;
    p.money = 9000; p.weapons.pistol = 24; p.weapons.compact = 0;
    const owned = { pistol: true }, equipped = {};
    window.BUYS = [];
    const items = () => {
      const w = (id, name, price, st, extra) => Object.assign({ id, kind: 'weapon', weaponId: id, name, price, owned: !!owned[id], equipped: false, locked: false, stats: st }, extra || {});
      return [
        w('tableleg', 'Folding Table Leg', 150, { damage: 0.3, rate: 0.5, range: 0.05, accuracy: 1, mobility: 0.9 }),
        w('pistol', 'Pistol', 450, { damage: 0.35, rate: 0.45, range: 0.3, accuracy: 0.7, mobility: 0.85 }),
        w('compact', 'The Footnote .32', 600, { damage: 0.28, rate: 0.6, range: 0.25, accuracy: 0.75, mobility: 0.95 }),
        w('auto_take', 'Auto Take', 1800, { damage: 0.3, rate: 0.85, range: 0.35, accuracy: 0.5, mobility: 0.7 }),
        w('pundit_carbine', 'Pundit Carbine', 3100, { damage: 0.55, rate: 0.6, range: 0.7, accuracy: 0.7, mobility: 0.5 }),
        w('filibuster', 'The Filibuster', 6200, { damage: 0.6, rate: 0.8, range: 0.65, accuracy: 0.45, mobility: 0.25 }, { locked: true, lockReason: 'Unlocks after: The Jets Arrive' }),
        w('sniper', 'The Fact Checker', 4500, { damage: 0.95, rate: 0.15, range: 1, accuracy: 0.95, mobility: 0.3 }),
        { id: 'ammo_pistol', kind: 'ammo', weaponId: 'pistol', name: 'Pistol rounds (24)', price: 60 },
        { id: 'pistol_sup', kind: 'attachment', weaponId: 'pistol', slot: 'muzzle', name: 'Mute Button Suppressor', price: 900, owned: !!owned.pistol_sup, equipped: !!equipped.pistol_sup, stats: { damage: 0.3, range: 0.25, accuracy: 0.8 } },
        { id: 'pistol_ext', kind: 'attachment', weaponId: 'pistol', slot: 'mag', name: 'Extended Remarks Mag', price: 400, owned: false, equipped: false },
        { id: 'pistol_light', kind: 'attachment', weaponId: 'pistol', slot: 'light', name: 'Spotlight', price: 250, owned: false, equipped: false },
        { id: 'pistol_red_dot', kind: 'attachment', weaponId: 'pistol', slot: 'optic', name: 'Red Dot of Certainty', price: 700, owned: false, equipped: false, locked: true, lockReason: 'Unlocks after: Citation Needed' },
        { id: 'tint_gold', kind: 'tint', weaponId: 'pistol', name: 'Goldplate', price: 1500, color: '#d4a52a', owned: false, equipped: false },
        { id: 'tint_pink', kind: 'tint', weaponId: 'pistol', name: 'Pundit Pink', price: 300, color: '#ff3fa4', owned: true, equipped: !!equipped.tint_pink },
        { id: 'tint_cyan', kind: 'tint', weaponId: 'pistol', name: 'Breaking Blue', price: 300, color: '#2ee6ff', owned: false, equipped: false },
        { id: 'tint_black', kind: 'tint', weaponId: 'pistol', name: 'Stock Black', price: 0, color: '#26272c', owned: true, equipped: !equipped.tint_pink },
        { id: 'vest', kind: 'gear', name: 'Firmness Vest', price: 500 },
        { id: 'pellets', kind: 'gear', name: 'Clarity Pellets', price: 150 }
      ];
    };
    CB.catalog = (storeId) => items();
    CB.buy = (id, opts) => { BUYS.push([id, opts]); const it = items().find((i) => i.id === id); if (!it) return { ok: false, reason: 'unknown' }; if (it.locked) return { ok: false, reason: 'locked' }; if (it.kind === 'attachment' || it.kind === 'tint') { if (owned[id]) { equipped[id] = true; return { ok: true, price: 0 }; } owned[id] = true; equipped[id] = true; p.money -= it.price; return { ok: true, price: it.price }; } if (p.money < it.price) return { ok: false, reason: 'funds', need: it.price - p.money }; p.money -= it.price; owned[id] = true; return { ok: true, price: it.price }; };
    GTP.Events.emit('interior:enter', { id: 'armory_strip', kind: 'armory', store: { id: 'strip', name: 'Both Sides Arms · The Strip' } });
    T_.adv(0.6); g.render();
    return { interior: T_.ui.interior && T_.ui.interior.kind };
  });
  await shot('armory_enter');
  const insp = await page.evaluate(() => {
    GTP.Events.emit('armory:inspect', { weaponId: 'pistol' }); T_.adv(0.3); GTP.game.render();
    const s = GTP.UI._v3.armoryState();
    return { modal: T_.ui.modal && T_.ui.modal.kind, row: s && (s.row.weaponId || s.row.id), rows: s && s.rows.length, ctl: GTP.game.player.controlEnabled };
  });
  await shot('armory_card');
  const att = await page.evaluate(() => {
    const m = T_.ui.modal; m.focus = 1; T_.press('right'); T_.press('right'); GTP.game.render();
    const s = GTP.UI._v3.armoryState();
    const a = { tab: m.tab, items: s.items.map((i) => i.id), money0: GTP.game.player.money };
    T_.press('confirm'); a.buy = BUYS[BUYS.length - 1]; a.money1 = GTP.game.player.money; a.msg = m.msg && m.msg.text;
    return a;
  });
  await shot('armory_attach');
  const tint = await page.evaluate(() => { const m = T_.ui.modal; T_.press('right'); m.isel = 1; GTP.game.render(); return { tab: m.tab }; });
  await shot('armory_tints');
  const ammo = await page.evaluate(() => { const m = T_.ui.modal; m.tab = 1; m.isel = 0; GTP.game.render(); const s = GTP.UI._v3.armoryState(); return { items: s.items.map((i) => i.id) }; });
  await shot('armory_ammo');
  const locked = await page.evaluate(() => { const m = T_.ui.modal; m.focus = 0; m.tab = 0; const s = GTP.UI._v3.armoryState(); m.row = s.rows.findIndex((r) => r.id === 'filibuster'); m.focus = 1; GTP.game.render(); T_.press('confirm'); return { msg: m.msg && m.msg.text }; });
  await shot('armory_locked');
  const closed = await page.evaluate(() => { T_.press('cancel'); T_.press('cancel'); return { modal: !!T_.ui.modal, ctl: GTP.game.player.controlEnabled }; });
  const legacy = await page.evaluate(() => { const CB = GTP.Combat, cat = CB.catalog, buy = CB.buy; delete CB.catalog; delete CB.buy; GTP.UI.openArmory(null, 'pistol'); const s = GTP.UI._v3.armoryState(); const a = { rows: s.rows.length, legacy: !!s.row._legacy, gear: s.rows.some((r) => r.kind === 'gearpage') }; GTP.game.render(); GTP.UI.closeModal(); CB.catalog = cat; CB.buy = buy; return a; });
  console.log('  armory: ' + JSON.stringify({ armory, insp, att, tint, ammo, locked, closed, legacy }));
  t.assert(armory.interior === 'armory' && insp.modal === 'armory' && insp.row === 'pistol' && insp.ctl === false, 'armory:inspect opens the weapon card on the pistol with the player held: ' + JSON.stringify(insp));
  t.assert(att.tab === 2 && att.items.join(',') === 'pistol_sup,pistol_ext,pistol_light,pistol_red_dot' && att.buy[0] === 'pistol_sup' && att.buy[1].store === 'strip' && att.money1 === att.money0 - 900, 'ATTACHMENTS lists the pistol slots and buys through Combat.buy(id, {store}): ' + JSON.stringify(att));
  t.assert(ammo.items.join(',') === 'ammo_pistol' && /LOCKED/.test(locked.msg || ''), 'AMMO lists the pistol rounds; a locked weapon says why: ' + JSON.stringify([ammo, locked]));
  t.assert(!closed.modal && closed.ctl === true, 'cancel twice leaves the card and gives control back');
  t.assert(legacy.rows >= 10 && legacy.legacy && legacy.gear, 'without Combat.catalog the v0.2 shop items fill the card: ' + JSON.stringify(legacy));

  // ---- 6. the range ----
  await page.evaluate(() => { GTP.Events.emit('range:start', { seconds: 60, medals: { bronze: 100, silver: 200, gold: 300 } }); [50, 30, 50, 20].forEach((n) => GTP.Events.emit('range:hit', { points: n })); T_.adv(0.3); GTP.game.render(); });
  await shot('range_hud');
  const range = await page.evaluate(() => { const r = { score: T_.ui.range && T_.ui.range.score }; GTP.Events.emit('range:end', { score: 240, medal: 'silver' }); T_.adv(0.7); GTP.game.render(); r.end = T_.ui.rangeEnd && T_.ui.rangeEnd.medal; return r; });
  await shot('range_medal');
  t.assert(range.score === 150 && range.end === 'silver', 'the range adds the hits and shows the medal: ' + JSON.stringify(range));
  await page.evaluate(() => { T_.adv(5); GTP.Events.emit('interior:exit', { id: 'armory_strip' }); T_.adv(0.2); });

  // ---- 7. the mod shop ----
  const mod = await page.evaluate(() => {
    const g = GTP.game, p = g.player;
    p.money = 20000;
    const v = g.debug.spawnVehicle(p.x + 6, p.z, 'sports', { color: '#2a64d8' });
    window.MODS = [];
    GTP.Vehicles = Object.assign(GTP.Vehicles || {}, { mod(veh, m) { MODS.push(JSON.parse(JSON.stringify(m))); veh.mods = m; if (m.paint && m.paint.primary) veh.color = m.paint.primary; } });
    GTP.Events.emit('modshop:open', { vehicle: v });
    T_.adv(0.6); g.render();
    window.MODV = v;
    return { modal: T_.ui.modal && T_.ui.modal.kind, free: GTP.Render.free };
  });
  await shot('modshop');
  const mod2 = await page.evaluate(() => {
    const m = T_.ui.modal, p = GTP.game.player;
    T_.press('confirm'); T_.press('back'); T_.press('back'); T_.adv(0.3); GTP.game.render();   // into PRIMARY COLOR, two down: a preview
    const a = { focus: m.focus, previews: MODS.length, preview: m.preview.paint.primary, money0: p.money };
    const cats = GTP.UI._v3.modCats(MODV), row = cats[m.cat], opt = row && row.price;   // the real catalog: a colour costs the respray (Vehicles.priceOf)
    a.price = opt != null ? opt : 300;
    T_.press('confirm'); a.money1 = p.money; a.applied = m.applied.paint.primary; const ev = T_.last('shop:buy'); a.ev = ev && (typeof ev.item === 'string' ? ev.item.split(':')[0] : ev.item.kind);
    T_.press('left'); m.cat = cats.findIndex((c) => c.id === 'engine'); T_.press('confirm'); T_.press('back'); T_.adv(0.3); a.engPreview = m.preview.engine;
    return a;
  });
  await shot('modshop_engine');
  const mod3 = await page.evaluate(() => { T_.press('cancel'); T_.press('cancel'); T_.adv(0.2); const v = MODV; return { modal: !!T_.ui.modal, free: GTP.Render.free, engine: v.mods.engine, primary: v.mods.paint.primary, ctl: GTP.game.player.controlEnabled }; });
  console.log('  modshop: ' + JSON.stringify([mod, mod2, mod3]));
  t.assert(mod.modal === 'modshop' && mod.free === true, 'modshop:open opens Spin Doctor Customs with the orbit camera');
  t.assert(mod2.previews >= 1 && mod2.preview && mod2.money1 === mod2.money0 - mod2.price && mod2.applied === mod2.preview && mod2.ev === 'mod' && mod2.engPreview >= 1, 'a paint previews through Vehicles.mod, BUY pays and emits shop:buy: ' + JSON.stringify(mod2));
  t.assert(!mod3.modal && !mod3.free && mod3.engine === 0 && mod3.primary === mod2.applied && mod3.ctl, 'leaving reverts the unbought engine preview and gives the camera back: ' + JSON.stringify(mod3));

  // ---- 8. wardrobe and barber ----
  const ward = await page.evaluate(() => {
    const g = GTP.game, p = g.player; p.money = 2000; const look0 = JSON.stringify(p.look);
    GTP.Events.emit('clothing:open'); T_.adv(0.8); g.render();
    const m = T_.ui.modal; const a = { modal: m && m.kind, free: GTP.Render.free };
    // the data: the systems' rows when they are real clothing, else the content's (GTP.UI._v3.wardrobeCats)
    const c0 = GTP.UI._v3.wardrobeCats('clothing')[0], it1 = c0.items[1], it2 = c0.items[2];
    a.slot = c0.id; a.want = [it1.id, it2.id]; a.price = it1.owned ? 0 : (it1.price || 0);
    T_.press('confirm'); T_.press('back'); T_.adv(0.3); a.preview = p.look.outfit && p.look.outfit[c0.id];
    T_.press('confirm'); a.money = p.money; const ev = T_.last('shop:buy'); a.ev = ev && (typeof ev.item === 'string' ? ev.item : ev.item.id);
    T_.press('back'); T_.adv(0.3); a.preview2 = p.look.outfit[c0.id];
    g.render();
    window.LOOK0 = look0;
    return a;
  });
  await shot('wardrobe');
  const ward2 = await page.evaluate((slot) => { const p = GTP.game.player; T_.press('cancel'); T_.press('cancel'); T_.adv(0.2); return { modal: !!T_.ui.modal, top: p.look.outfit && p.look.outfit[slot], shirt: p.look.shirt }; }, ward.slot);
  await page.evaluate(() => { window.HAIR0 = GTP.game.player.look.hair; const c0 = GTP.UI._v3.wardrobeCats('barber')[0]; window.HAIRW = c0.items[1].style || String(c0.items[1].id).replace(/^hair_/, ''); GTP.Events.emit('barber:open'); T_.adv(0.8); T_.press('confirm'); T_.press('back'); T_.adv(0.3); GTP.game.render(); });
  await shot('barber');
  const barb = await page.evaluate(() => { const p = GTP.game.player, a = { hair: p.look.hair, want: HAIRW, before: HAIR0 }; T_.press('cancel'); T_.press('cancel'); T_.adv(0.2); a.after = p.look.hair; a.free = GTP.Render.free; return a; });
  console.log('  wardrobe: ' + JSON.stringify([ward, ward2, barb]));
  t.assert(ward.modal === 'wardrobe' && ward.free && ward.preview === ward.want[0] && ward.money === 2000 - ward.price && (ward.price === 0 || ward.ev === ward.want[0]) && ward.preview2 === ward.want[1], 'clothing previews on player.look, buys the second item and previews the third: ' + JSON.stringify(ward));
  t.assert(!ward2.modal && ward2.top === ward.want[0], 'leaving keeps what was bought and drops the preview: ' + JSON.stringify(ward2));
  t.assert(barb.hair === barb.want && barb.after === barb.before && !barb.free, 'the barber previews a cut and reverts it on exit: ' + JSON.stringify(barb));

  // ---- 9. property ----
  const prop = await page.evaluate(() => { const p = GTP.game.player; p.money = 100000; GTP.Events.emit('property:open', { id: 'safe_brownstone' }); T_.adv(0.3); GTP.game.render(); return { modal: T_.ui.modal && T_.ui.modal.kind }; });
  await shot('property');
  const prop2 = await page.evaluate(() => { const p = GTP.game.player; T_.press('confirm'); GTP.game.render(); const a = { money: p.money, ev: T_.last('property:buy'), owned: p.properties && p.properties.safe_brownstone }; return a; });
  await shot('property_owned');
  await page.evaluate(() => { T_.press('cancel'); });
  t.assert(prop.modal === 'property' && prop2.money === 15000 && prop2.ev && prop2.ev.id === 'safe_brownstone' && prop2.owned, 'the property card buys The Brownstone: ' + JSON.stringify(prop2));

  // ---- 10. heist board ----
  await page.evaluate(() => { GTP.Events.emit('heist:board', { missionId: 'h01_casing', approaches: GTP.Heist && GTP.Heist.approaches(), crew: GTP.Heist && GTP.Heist.crewList() }); T_.adv(0.3); GTP.game.render(); });
  await shot('heist');
  const heist = await page.evaluate(() => { const d = T_.ui.modal && T_.ui.modal.def; T_.press('right'); T_.press('back'); T_.press('right'); T_.press('confirm'); T_.press('right'); T_.press('confirm'); T_.press('back'); T_.press('confirm'); return { plan: T_.last('heist:plan'), modal: !!T_.ui.modal, ids: d && d.crew.map((c) => c.id), aps: d && d.approaches.map((a) => a.id), heistIds: GTP.Heist ? GTP.Heist.crewList().map((c) => c.id) : null }; });
  console.log('  heist: ' + JSON.stringify(heist));
  t.assert(heist.plan && heist.plan.approach === heist.aps[1] && heist.plan.crew.join() === heist.ids.slice(0, 3).join() && (!heist.heistIds || heist.ids.join() === heist.heistIds.join()) && !heist.modal, 'the board emits heist:plan {approach, crew}: ' + JSON.stringify(heist.plan));

  // ---- 11. golf ----
  await page.evaluate(() => { GTP.Events.emit('golf:start', { hole: 3, par: 4, wind: { speed: 9, dir: 0.7 }, club: 'Driver', dist: 312 }); T_.adv(0.2); T_.press('right', 20); T_.press('shoot'); T_.adv(0.55); GTP.game.render(); });
  await shot('golf');
  const golf = await page.evaluate(() => { const G = T_.ui.golf, a = { power: G.power, phase: G.phase, ctl: GTP.game.player.controlEnabled }; T_.press('shoot'); a.shot = T_.last('golf:shot'); GTP.Events.emit('golf:end', { strokes: 3, par: 4 }); T_.adv(0.5); GTP.game.render(); a.term = T_.ui.golfEnd && T_.ui.golfEnd.strokes; a.ctl2 = GTP.game.player.controlEnabled; return a; });
  await shot('golf_end');
  console.log('  golf: ' + JSON.stringify(golf));
  t.assert(golf.phase === 'swing' && golf.ctl === false && golf.shot && golf.shot.power > 0.2 && golf.shot.angle > 0 && golf.ctl2 === true, 'the swing meter emits golf:shot {power, angle}; golf:end hands control back: ' + JSON.stringify(golf));
  await page.evaluate(() => T_.adv(4.6));

  // ---- 12. prompts, crosshair, fuse, parachute, vehicle HUDs, boss, specials, achievement, fade ----
  const prompts = await page.evaluate(() => {
    const g = GTP.game, p = g.player, CB = GTP.Combat;
    g.debug.giveWeapon('pistol', 24); p.weapon = 'pistol';
    CB.cover = Object.assign(CB.cover || {}, { available: () => ({ low: true }) });
    T_.adv(0.2); g.render();
    const a = { foot: T_.ui.prompts.slice() };
    GTP.Events.emit('cover:enter', { low: true }); T_.adv(0.1); g.render(); a.cover = T_.ui.prompts.slice();
    return a;
  });
  await shot('prompts_cover');
  const cross = await page.evaluate(() => {
    const g = GTP.game, CB = GTP.Combat;
    GTP.Events.emit('cover:exit'); delete CB.cover.available;
    GTP.Input.set('aim', true); T_.adv(0.4); g.render();
    const a = { state: T_.ui.crosshair.state };
    const cs = GTP.UI._v3.crossState;
    a.hostile = cs({ weapon: { id: 'pistol' } }, { target: { role: 'cop' } }, null);
    a.friendly = cs({ weapon: { id: 'pistol' } }, { target: { role: 'civ' } }, null);
    a.head = cs({ weapon: { id: 'pistol' }, hitmark: { age: 0.1, zone: 'head' } }, {}, null);
    a.kill = cs({ weapon: { id: 'pistol' }, hitmark: { age: 0.1, kill: true } }, {}, null);
    a.range = cs({ weapon: { id: 'pistol' } }, { inRange: false }, null);
    a.blind = cs({ weapon: { id: 'pistol' } }, {}, { pose: { cover: { blind: true } } });
    a.throw = cs({ weapon: { id: 'hottake' } }, {}, null);
    return a;
  });
  await shot('cross_aim');
  await page.evaluate(() => { GTP.Input.set('aim', false); T_.adv(0.1); });
  // the crosshair gallery: every state drawn on the HUD canvas over the frame
  await page.evaluate(() => {
    const g = GTP.game; g.render();
    const c = GTP.Render.hudCtx, Rd = GTP.Render, states = ['aim', 'hostile', 'friendly', 'range', 'hit', 'headshot', 'kill', 'reload', 'blind', 'melee', 'throw'];
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, Rd.width, Rd.height);
    states.forEach((s, i) => { const x = 100 + (i % 6) * 200, y = 220 + Math.floor(i / 6) * 240; GTP.UI._v3.drawCrosshair(c, x, y, s, i === 4 ? 0.4 : 0.15, { hitmark: { age: 0.1, kill: s === 'kill', zone: s === 'headshot' ? 'head' : 'chest' } }, 0); c.font = 'bold 14px monospace'; c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(s.toUpperCase(), x, y + 70); });
  });
  await page.screenshot({ path: t.OUT + '/v3_cross_gallery.png' });
  console.log('  prompts / cross: ' + JSON.stringify([prompts, cross]));
  t.assert(prompts.foot.indexOf('TAKE COVER') >= 0 && prompts.foot.indexOf('AIM') >= 0, 'near cover with a gun out: TAKE COVER and AIM / FIRE prompts: ' + prompts.foot.join(','));
  t.assert(prompts.cover.indexOf('BLIND FIRE') >= 0 && prompts.cover.indexOf('VAULT') >= 0 && prompts.cover.indexOf('LEAVE COVER') >= 0, 'in low cover: PEEK, BLIND FIRE, VAULT, LEAVE COVER: ' + prompts.cover.join(','));
  t.assert(cross.state && cross.hostile === 'hostile' && cross.friendly === 'friendly' && cross.head === 'headshot' && cross.kill === 'kill' && cross.range === 'range' && cross.blind === 'blind' && cross.throw === 'throw', 'crosshair states: ' + JSON.stringify(cross));
  const fuse = await page.evaluate(() => { const CB = GTP.Combat, h0 = CB.hud; CB.hud = function () { const h = h0.call(CB); h.cook = { t: 1.2, total: 2.5, k: 0.48 }; return h; }; GTP.game.render(); const a = T_.ui.cookShown; CB.hud = h0; return a; });
  await shot('cook_fuse');
  t.assert(fuse === true, 'the hot mic fuse shows outside aim mode (QA CMB-12)');
  const chute = await page.evaluate(() => { const p = GTP.game.player; p.parachute = { state: 'freefall' }; p.y += 180; GTP.game.render(); const a = { s1: T_.ui.chuteShown }; p.parachute = { state: 'open' }; p.vy = -4.2; GTP.game.render(); a.s2 = T_.ui.chuteShown; return a; });
  await shot('parachute_open');
  await page.evaluate(() => { const p = GTP.game.player; p.parachute = { state: 'freefall' }; GTP.game.render(); });
  await shot('parachute_freefall');
  await page.evaluate(() => { const p = GTP.game.player; p.parachute = null; p.y -= 180; p.vy = 0; GTP.game.debug.teleport(p.x, p.z); T_.adv(0.3); });
  t.assert(chute.s1 === 'freefall' && chute.s2 === 'open', 'the parachute prompt and canopy panel: ' + JSON.stringify(chute));
  // vehicle HUDs: a car stands in for each type (type swapped for the frame, never stepped)
  const vh = await page.evaluate(() => {
    const g = GTP.game, p = g.player, v = g.debug.spawnVehicle(p.x + 4, p.z + 4, 'sedan', {});
    const d = v.doorWorld(0); g.debug.teleport(d.x, d.z); T_.adv(0.1); GTP.Input.set('enter', true); T_.adv(1 / 60); GTP.Input.set('enter', false); T_.adv(1);
    window.VH = v; return { inCar: p.inVehicle === v };
  });
  const cats = {};
  for (const [type, hud] of [['moto', { speed: 31, roll: -0.42, pitch: 0.05, gear: 4 }], ['heli', { speed: 22, alt: 140, pitch: -0.12, roll: 0.25, heading: 0.9, throttle: 0.72, rotor: 1 }], ['jet', { speed: 95, alt: 22, pitch: -0.35, roll: -0.1, heading: 3.6, throttle: 0.9, gear: 'up' }], ['speedboat', { speed: 16, heading: 4.4, throttle: 0.8 }]]) {
    cats[type] = await page.evaluate(([ty, h]) => { const v = VH; window.VT0 = v.type; v.type = ty; v.hud = () => h; GTP.game.render(); return T_.ui.vehHudCat; }, [type, hud]);
    await shot('veh_' + type);   // re-renders with the type still swapped
    await page.evaluate(() => { const v = VH; v.type = VT0; delete v.hud; });
  }
  console.log('  vehicle huds: ' + JSON.stringify([vh, cats]));
  t.assert(vh.inCar && cats.moto === 'bike' && cats.heli === 'heli' && cats.jet === 'plane' && cats.speedboat === 'boat', 'bike, heli, plane and boat HUDs from vehicle.hud(): ' + JSON.stringify(cats));
  await page.evaluate(() => { GTP.Input.set('enter', true); T_.adv(1 / 60); GTP.Input.set('enter', false); T_.adv(1.2); });
  const boss = await page.evaluate(() => {
    GTP.Events.emit('boss:phase', { id: 'b01_goldplate', phase: 1, hp: 1000, maxHp: 1000, name: 'The Gold Helicopter' }); T_.adv(0.5);
    GTP.Events.emit('boss:phase', { id: 'b01_goldplate', phase: 2, hp: 560, maxHp: 1000, name: 'The Gold Helicopter' }); T_.adv(0.3);
    ['focus', 'shout', 'chatmob', 'boost'].forEach((id, i) => GTP.Events.emit('special:state', { id, meter: [1, 0.45, 70, 0.2][i], active: id === 'shout' }));
    T_.adv(0.1); GTP.game.render();
    return { phase: T_.ui.boss.phase, hp: T_.ui.boss.hp, trail: Math.round(T_.ui.boss.trail), specials: Object.keys(T_.ui.specials).length };
  });
  await shot('boss_specials');
  const boss2 = await page.evaluate(() => { GTP.Events.emit('boss:defeated', { id: 'b01_goldplate' }); T_.adv(0.6); GTP.game.render(); return { boss: !!T_.ui.boss, down: !!T_.ui.bossDown }; });
  await shot('boss_down');
  t.assert(boss.phase === 2 && boss.hp === 560 && boss.trail > 560 && boss.specials === 4 && !boss2.boss && boss2.down, 'boss bar with phase 2 and a damage trail, four special meters, RATIO\'D on defeat: ' + JSON.stringify([boss, boss2]));
  await page.evaluate(() => { T_.adv(4.5); GTP.Events.emit('achievement', { id: 'first_blood', name: 'Hot Take, Served' }); T_.adv(0.7); GTP.game.render(); });
  await shot('achievement');
  const fade = await page.evaluate(() => { const a = {}; GTP.Events.emit('interior:fade', { phase: 'out' }); T_.adv(0.4); GTP.game.render(); a.out = !!T_.ui.fade; GTP.Events.emit('interior:fade', { phase: 'in' }); T_.adv(0.5); a.cleared = !T_.ui.fade; a.ach = T_.ui.achQueue.length; return a; });
  t.assert(fade.out && fade.cleared && fade.ach === 1, 'interior:fade out then in; the achievement toast is up: ' + JSON.stringify(fade));
  await page.evaluate(() => T_.adv(5));

  // ---- 13. STOCKS and STATS ----
  const stocks = await page.evaluate(() => {
    const p = GTP.game.player; p.money = 5000;
    const held = {}; window.TRADES = [];
    const tick = [['OUTR', 'Outrage Media', [38, 39.5, 41, 40.2, 42.8, 44.1]], ['TAKE', 'TakeCo Holdings', [12, 11.8, 11.2, 10.9, 10.4, 9.8]], ['VAUL', 'Vaultwright Capital', [210, 214, 213, 220, 226, 231]], ['NAPD', 'Nap Dynasty', [8.4, 8.9, 9.6, 9.2, 9.9, 10.3]], ['PELL', 'Clarity Pellets Inc', [3.1, 2.9, 2.2, 2.6, 2.4, 2.1]], ['GOLD', 'Goldplate Holdings', [99, 97, 101, 104, 103, 106]]];
    GTP.Systems = Object.assign(GTP.Systems || {}, {
      stocks: { list: () => tick.map((s) => ({ id: s[0], name: s[1], price: s[2][s[2].length - 1], history: s[2], shares: held[s[0]] || 0 })), buy(id, n) { TRADES.push(['buy', id, n]); held[id] = (held[id] || 0) + n; return { ok: true }; }, sell(id, n) { TRADES.push(['sell', id, n]); if ((held[id] || 0) < n) return { ok: false, reason: 'shares' }; held[id] -= n; return { ok: true }; } },
      stats: () => ({ sections: [{ title: 'CAREER', rows: [['Properties owned', '1'], ['Stock profit', '$1,240'], ['Golf best round', '+3'], ['Jobs: Damage Control', '4 shifts']] }] }),
      unlocked: (id) => id === 'first_blood' || id === 'armory'
    });
    GTP.UI.openMap(); T_.ui.pause.tab = GTP.UI.phoneTabs.indexOf('STOCKS'); T_.ui.pause.row = 0; T_.adv(0.05); GTP.game.render();
    T_.press('back'); T_.press('confirm'); T_.adv(0.05); GTP.game.render();
    return { trades: TRADES.slice(), rows: (T_.ui.pause.rows || []).length };
  });
  await shot('stocks');
  await page.evaluate(() => { T_.ui.pause.tab = GTP.UI.phoneTabs.indexOf('STATS'); T_.ui.pause.scroll = 360; T_.adv(0.05); GTP.game.render(); });
  await shot('stats');
  await page.evaluate(() => { GTP.UI.closePause(); T_.adv(0.1); });
  console.log('  stocks: ' + JSON.stringify(stocks));
  t.assert(stocks.rows === 6 && stocks.trades.length === 1 && stocks.trades[0][0] === 'buy' && stocks.trades[0][1] === 'TAKE' && stocks.trades[0][2] === 10, 'STOCKS lists six tickers and Enter buys 10 of the selected one: ' + JSON.stringify(stocks.trades));

  // the radio ticker (now playing, a call-in caller, the hourly bulletin) and stranger side missions on the map and phone
  const radio = await page.evaluate(() => {
    const g = GTP.game, p = g.player, tk = T_.ui.ticker, st = GTP.UI.currentStation();
    st.callers = [{ caller: 'Deb from Cul-de-sac Heights', text: 'Long-time listener, first-time grievance.' }];
    st.bulletins = ['The Capitol dome was repainted gold overnight. Officials call it "a texture".'];
    const R = GTP.Audio.radio = GTP.Audio.radio || {}, np0 = R.nowPlaying; R.nowPlaying = () => ({ kind: 'show', title: 'Call Me Maybe Wrong', text: 'Lines are open.' });
    p.inVehicle = VH; tk.cur = null; tk.n = 0; g.debug.setClock(14.02);
    const lines = [];
    for (let i = 0; i < 5; i++) { tk.cur = null; GTP.UI.update(1 / 60); if (tk.cur) lines.push(tk.cur.tag + ': ' + tk.cur.text); }
    g.render();
    R.nowPlaying = np0; p.inVehicle = null; tk.cur = null; delete st.callers; delete st.bulletins;
    return lines;
  });
  console.log('  radio: ' + JSON.stringify(radio));
  t.assert(radio.some((l) => /^ON AIR: Call Me Maybe Wrong/.test(l)) && radio.some((l) => /^NEWS 14:00/.test(l)) && radio.some((l) => /^CALLER: Deb/.test(l)), 'the ticker shows the show on air, the hourly bulletin and a caller: ' + JSON.stringify(radio));
  const strangers = await page.evaluate(() => {
    // the real GTP.Strangers: open the first strand by completing its gate for the duration of the check
    const p = GTP.game.player, Ms = GTP.Missions, Sg = GTP.Strangers, sid = Sg.list()[0].id, first = Sg.missions(sid)[0], added = [];
    (first.requires || []).forEach((id) => { if (!Ms.state.completed.has(id)) { Ms.state.completed.add(id); added.push(id); } });
    window.__strAdded = added;
    const mk = GTP.UI.allMarkers().find((m) => m.missionId === first.id) || {};
    if (mk.x != null) { p.x = mk.x - 30; p.z = mk.z; T_.lookAt(mk.x, mk.z); }
    T_.adv(0.1); GTP.game.render();
    const a = { labels: T_.ui.labelsDrawn, kind: mk.kind, icon: mk.icon, strand: sid };
    GTP.UI.openMap(); T_.ui.pause.tab = GTP.UI.phoneTabs.indexOf('MISSIONS'); T_.adv(0.05); GTP.game.render();
    const rows = T_.ui.pause.rows || [], k = rows.findIndex((r) => r.kind === 'stranger'); a.row = k >= 0; a.sub = k >= 0 ? rows[k].sub : null;
    if (k >= 0) { T_.ui.pause.row = k; GTP.game.render(); }
    return a;
  });
  await shot('strangers_phone');
  const strangers2 = await page.evaluate(() => { const rows = T_.ui.pause.rows || [], r = rows.find((x) => x.kind === 'stranger'); GTP.UI._v3.missionRowActivate(r); const G = T_.ui.gps; GTP.UI.closePause(); T_.adv(0.1); GTP.game.render(); return { gps: G && G.kind }; });
  await shot('strangers_map');
  await page.evaluate(() => { (window.__strAdded || []).forEach((id) => GTP.Missions.state.completed.delete(id)); GTP.Events.emit('gps:clear'); });
  console.log('  strangers: ' + JSON.stringify([strangers, strangers2]));
  t.assert(strangers.kind === 'stranger' && strangers.icon === 'stranger' && strangers.labels >= 1 && strangers.row && strangers2.gps === 'stranger', 'stranger missions get a label, a phone row and a GPS route: ' + JSON.stringify([strangers, strangers2]));

  // night readability: the GPS chip, labels, specials and the call card over a night street
  await page.evaluate(() => { const g = GTP.game; g.debug.setClock(23.2); GTP.Events.emit('phone:call', { from: 'gus', lines: ['The van makes a new noise. I think it is a podcast.'] }); T_.adv(2); g.render(); });
  await shot('night_hud');
  await page.evaluate(() => { GTP.game.debug.setClock(17.5); T_.adv(6); });

  // ---- 14. input ----
  const input = await page.evaluate(() => {
    const In = GTP.Input, a = {};
    const key = (code, type) => window.dispatchEvent(new KeyboardEvent(type || 'keydown', { code, bubbles: true }));
    In.beginFrame(); key('KeyQ'); a.cover = In.pressed('cover'); a.aimQ = In.down('aim'); key('KeyQ', 'keyup'); In.endFrame();
    In.beginFrame(); key('KeyX'); a.specialX = In.pressed('special'); key('KeyX', 'keyup'); In.endFrame();
    const cv = GTP.Render.hudCanvas;
    In.beginFrame(); key('ShiftLeft'); cv.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })); a.specialRMB = In.pressed('special') && In.down('aim'); window.dispatchEvent(new MouseEvent('mouseup', { button: 2 })); key('ShiftLeft', 'keyup'); a.specialUp = !In.down('special'); In.endFrame();
    // aircraft axes (a car standing in as a heli)
    const p = GTP.game.player, v = GTP.game.debug.spawnVehicle(p.x + 5, p.z, 'sedan', {}); const t0 = v.type; v.type = 'heli'; p.inVehicle = v;
    a.air = In.inAircraft();
    key('KeyW'); key('KeyD'); key('KeyE'); key('ShiftLeft'); In.beginFrame(); a.flight = Object.assign({}, In.flight); key('KeyW', 'keyup'); key('KeyD', 'keyup'); key('KeyE', 'keyup'); key('ShiftLeft', 'keyup'); In.endFrame();
    a.ctx = In._padContext();
    p.inVehicle = null; v.type = t0;
    // the latch: a held shoot stays released until let go
    In.set('shoot', true); In.latch(['shoot']); a.latched = !In.down('shoot'); In.beginFrame(); a.still = !In.down('shoot'); In.endFrame(); In.set('shoot', false); In.beginFrame(); In.set('shoot', true); a.again = In.down('shoot'); In.set('shoot', false); In.endFrame();
    return a;
  });
  // the pad: B tap = cover, L3 = special
  const pad = await page.evaluate(() => {
    const In = GTP.Input, fake = { index: 0, id: 'Test pad', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    const orig = navigator.getGamepads; navigator.getGamepads = () => [fake];
    const a = {};
    In.beginFrame(); In.endFrame();
    fake.buttons[1] = { pressed: true, value: 1 }; In.beginFrame(); a.run = In.down('run'); In.endFrame();
    fake.buttons[1] = { pressed: false, value: 0 }; In.beginFrame(); a.coverTap = In.pressed('cover'); In.endFrame();
    fake.buttons[10] = { pressed: true, value: 1 }; In.beginFrame(); a.l3 = In.pressed('special'); In.endFrame(); fake.buttons[10] = { pressed: false, value: 0 }; In.beginFrame(); In.endFrame();
    navigator.getGamepads = orig; In.gamepad.index = -1; In._releasePad(); In.lastDevice = 'keyboard';
    return a;
  });
  console.log('  input: ' + JSON.stringify([input, pad]));
  t.assert(input.cover && !input.aimQ && input.specialX && input.specialRMB && input.specialUp, 'Q is cover (not aim), X and Shift+RMB press special: ' + JSON.stringify(input));
  t.assert(input.air && input.flight.pitch === -1 && input.flight.roll === 1 && input.flight.yaw === 1 && input.flight.throttle === 1 && input.ctx === 'air', 'aircraft: W noses down, D rolls right, E yaws right, Shift throttles up, pad context air: ' + JSON.stringify(input.flight));
  t.assert(input.latched && input.still && input.again, 'Input.latch holds shoot released until let go');
  t.assert(pad.run && pad.coverTap && pad.l3, 'pad: B held runs, a B tap is cover, L3 is special: ' + JSON.stringify(pad));

  // ---- 15. the QA bugs ----
  const qa = await page.evaluate(() => {
    const g = GTP.game, Ms = GTP.Missions, UI = GTP.UI, a = {};
    // C1-02: QUIT drops the retry offer for good
    const LF = { m: { title: 'Read the Read' }, id: 'm02_read', snapshot: {}, text: 'Out of time.' };
    const cr = Ms.canRetry, lf = Ms.lastFail; Ms.canRetry = () => true; Ms.lastFail = () => LF;
    UI.card('failed', 'CONTEXT STAMPED', 'Read the Read'); a.offer0 = UI._v3.retryOffer();
    UI._v3.retryActivate('quit'); a.offer1 = UI._v3.retryOffer();
    g.setState('wasted'); g.setState('playing'); a.cardAfterDeath = !!(T_.ui.card && T_.ui.card.kind === 'failed');
    Ms.canRetry = cr; Ms.lastFail = lf;
    // C1-08: Escape in a skippable cutscene does not pause; P does
    const Cs = GTP.Cutscenes, hud0 = Cs.hud; Cs.hud = () => ({ active: true, skippable: true, shot: 0, shots: 2, title: 'cs_test', skip: 0, letterbox: true });
    g.setState('cutscene');
    GTP.Input.set('pause', true); GTP.Input.set('cancel', true); GTP.Input.set('back', true); UI.handleInput('cutscene'); GTP.Input.endFrame(); GTP.Input.set('pause', false); GTP.Input.set('cancel', false); GTP.Input.set('back', false);
    a.escState = g.state; g.advance(1 / 60);
    GTP.Input.press('pause'); UI.handleInput('cutscene'); GTP.Input.endFrame(); a.pState = g.state; UI.closePause(); Cs.hud = hud0;
    // C1-12: a PASSED card is dropped when a cutscene starts
    g.setState('playing'); UI.card('passed', 'MISSION PASSED', ''); g.setState('cutscene'); a.passedInCut = !!T_.ui.card; g.setState('playing');
    // C1-09: REPLAY from the phone calls Missions.replay in state playing
    const rp = Ms.replay; let seen = null; Ms.replay = () => { seen = g.state; return true; };
    UI.openPause('phone'); UI._v3.missionRowActivate({ kind: 'done', id: 'm00_intro', title: 'Table Stakes' }); a.replayState = seen; Ms.replay = rp;
    return a;
  });
  console.log('  qa: ' + JSON.stringify(qa));
  t.assert(qa.offer0 && !qa.offer1 && !qa.cardAfterDeath, 'QA-C1-02: QUIT drops the retry; a later death does not bring the card back: ' + JSON.stringify(qa));
  t.assert(qa.escState === 'cutscene' && qa.pState === 'paused', 'QA-C1-08: Escape skips (no pause) in a skippable cutscene, P pauses: ' + JSON.stringify(qa));
  t.assert(!qa.passedInCut && qa.replayState === 'playing', 'QA-C1-12 / C1-09: the PASSED card leaves for a cutscene; REPLAY runs from playing: ' + JSON.stringify(qa));
  // CMB-06: the press that closes the last dialogue line never fires the gun
  const cmb06 = await page.evaluate(() => {
    const g = GTP.game, p = g.player; g.setState('playing'); g.debug.giveWeapon('pistol', 24); p.weapon = 'pistol'; T_.adv(0.3);
    const s0 = p.stats.shots | 0;
    GTP.Missions.say([{ who: 'gus', text: 'Only line.' }]); T_.adv(0.6);
    const st = g.state;
    GTP.Input.set('action', true); GTP.Input.set('shoot', true); T_.adv(0.4); GTP.Input.set('action', false); GTP.Input.set('shoot', false); T_.adv(0.1);
    return { st, state: g.state, shots: (p.stats.shots | 0) - s0 };
  });
  console.log('  cmb06: ' + JSON.stringify(cmb06));
  t.assert(cmb06.st === 'cutscene' && cmb06.state === 'playing' && cmb06.shots === 0, 'QA CMB-06: dismissing the dialogue with E / click while holding fire does not shoot: ' + JSON.stringify(cmb06));

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'no errors: ' + errs.join('\n'));

  // ---- 16. phone width ----
  const mob = await t.browser.newPage({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  mob.setDefaultTimeout(240000);
  const mErr = [];
  mob.on('pageerror', (e) => mErr.push(String(e)));
  await mob.goto(t.url({ seed: 7, mute: 1 }));
  await t.waitPlaying(mob);
  const touch = await mob.evaluate(() => {
    const g = GTP.game, UI = GTP.UI; UI.touch.show(true);
    window.T_ = { press(a) { GTP.Input.set(a, true); g.advance(1 / 60); GTP.Input.set(a, false); g.advance(1 / 60); }, ui: UI.state };
    g.advance(0.1); g.render();
    const bs = UI.state.touch.buttons, W = GTP.Render.width, H = GTP.Render.height;
    return { n: bs.length, out: bs.filter((b) => b.x - b.r < 0 || b.x + b.r > W || b.y - b.r < 0 || b.y + b.r > H).map((b) => b.id), ids: bs.map((b) => b.id).join(',') };
  });
  await mob.screenshot({ path: t.OUT + '/v3_touch_foot.png' });
  const mobShots = [['armory', () => { GTP.Combat.catalog = null; GTP.UI.openArmory(null, 'pistol'); }], ['modshop', () => { GTP.UI.closeModal(); const p = GTP.game.player, v = GTP.game.debug.spawnVehicle(p.x + 6, p.z, 'sports', {}); GTP.UI.openModShop(v); }], ['heist', () => { GTP.UI.closeModal(); GTP.UI.openHeistBoard('h01_casing'); }], ['wardrobe', () => { GTP.UI.closeModal(); GTP.UI.openWardrobe('clothing'); }], ['story', () => { GTP.UI.closeModal(); GTP.UI.openStory(); }], ['golf', () => { GTP.UI.closePause(); GTP.Events.emit('golf:start', { hole: 1, par: 3, wind: { speed: 4, dir: 2 }, dist: 140 }); GTP.Events.emit('phone:call', { from: 'gus', lines: ['The van has a new noise. It sounds like a podcast.'] }); }], ['call', () => { GTP.Events.emit('golf:end', { strokes: 3, par: 3 }); GTP.game.advance(5); GTP.Events.emit('boss:phase', { id: 'b05', phase: 1, hp: 70, maxHp: 100, name: 'Ptolemy Dunk' }); GTP.Events.emit('phone:call', { from: 'sloane', lines: ['You are trending. Not in a good way. In the best way.'] }); GTP.game.advance(2); }]];
  for (const [name, fn] of mobShots) {
    await mob.evaluate((src) => { (0, eval)('(' + src + ')')(); GTP.game.advance(0.6); GTP.game.render(); }, fn.toString());
    await mob.screenshot({ path: t.OUT + '/v3_phone_' + name + '.png' });
  }
  console.log('  touch: ' + JSON.stringify(touch) + ' errors: ' + mErr.length);
  t.assert(touch.n === 10 && touch.out.length === 0, 'ten touch buttons (with COVER and SPCL) inside a 400x800 screen: ' + JSON.stringify(touch));
  t.assert(mErr.length === 0, 'no page errors at phone width: ' + mErr.join('\n'));
});
