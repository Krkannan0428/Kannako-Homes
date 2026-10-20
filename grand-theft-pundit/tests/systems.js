/* systems.js: GTP.Systems (js/14_systems.js) on the integrated build, with GTP.Content.parity's tables.
 *  1 the surface: tables from parity (8 tickers, 9 holes, achievements, cheats, 2 jobs, properties), wrappers, SaveRegistry,
 *    the UI-facing names (golf.hud, properties.get, owns, buyClothing, buyHaircut, stats().sections)
 *  2 properties: the pod van is owned; buy (funds, locked, owned), property:open from a marker, a day of income, a safehouse
 *    save, the safehouse interior gate (an unowned safehouse door opens the property card instead)
 *  3 stocks: buy / sell with the stockApp fee, the hourly walk, a ticker's `reacts` on mission:complete (once)
 *  4 golf: the tee marker charges the green fee and starts the round, hole points relative to the course door, controls
 *    frozen, Enter swings, the two-press meter, hud() feeds the UI panel, a bot plays nine holes; screenshot systems_golf.png
 *  5 cheats typed (BIGTAKES, ISTHISPAID) and entered (all of them, each effect checked)
 *  6 achievements: parity triggers (mission, event with fields, stat, flag), the hidden one, unlocked()
 *  7 jobs: the Damage Control van parked at the hospital, E while stopped starts; a patient picked up and dropped off; the
 *    Hot Take Brigade truck: spray (hold shoot) a flame war, level up, a timeout; level rewards and their flags
 *  8 wardrobe: parity clothing (style + colour into the look, mesh rebuilt), outfits, the "none" hat, barber style + colour
 *  9 saves: saveSlot / newGame / loadSlot round trip (v4 registry); the perk never stacks; the rng restored
 * 10 wanted:cleared, statsPage, no errors */
'use strict';
const H = require('./_harness');

H.run('systems', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;

  await page.evaluate(() => {
    window.T_ = {
      ev: [],
      press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
      until(pred, maxSec, step) { step = step || 0.1; let s = 0; while (s < maxSec) { GTP.game.advance(step); s += step; if (pred()) return +s.toFixed(2); } return -1; },
      tp(x, z) { GTP.game.debug.teleport(x, z); },
      count(name) { return T_.ev.filter((e) => e.n === name).length; },
      last(name) { const l = T_.ev.filter((e) => e.n === name); return l.length ? l[l.length - 1].e : null; },
      car() { const p = GTP.game.player; const rp = GTP.World.nearestRoadPoint(p.x + 10, p.z); return GTP.game.debug.spawnVehicle(rp.x, rp.z, 'sedan'); },
      enter(v) { const d = v.doorWorld(0); T_.tp(d.x, d.z); GTP.game.advance(0.1); T_.press('enter'); GTP.game.advance(0.8); return GTP.game.player.inVehicle === v; },
      leave() { const p = GTP.game.player; if (p.inVehicle) p.exitVehicle(); GTP.game.advance(0.3); },
      stop(v) { v.vx = 0; v.vz = 0; v.speed = 0; }
    };
    ['achievement', 'property:open', 'property:buy', 'property:income', 'property:save', 'stocks:trade', 'stocks:news', 'golf:start', 'golf:shot', 'golf:hole', 'golf:end', 'golf:penalty',
      'cheat', 'job:start', 'job:level', 'job:levelComplete', 'job:end', 'job:pickup', 'job:deliver', 'job:douse', 'job:reward', 'clothing:buy', 'barber:buy', 'shop:buy', 'saved', 'wanted:cleared']
      .forEach((n) => GTP.Events.on(n, (e) => T_.ev.push({ n, e })));
  });

  // ---- 1. the surface ----
  let r = await page.evaluate(() => {
    const S = GTP.Systems, Pa = GTP.Content.parity;
    return {
      parity: !!Pa, tickers: S.stocks.list().length, parityTickers: Pa.stocks.length, holes: S.golf.holes().length, ach: S.achievements.defs().length, parityAch: Pa.achievements.length,
      cheats: S.cheats.defs().length, parityCheats: Pa.cheats.length, jobs: S.jobs.defs().map((j) => j.id + ':' + j.kind).join(','),
      props: S.properties.defs().length, safes: S.properties.defs().filter((d) => d.kind === 'safehouse').length,
      wrapped: !!(GTP.Missions.update._sys && GTP.Missions.init._sys && GTP.Player.prototype.control._sys && GTP.Interiors.enter._sys),
      reg: Object.keys(GTP.SaveRegistry || {}).filter((k) => /^sys_/.test(k)).length,
      ui: ['buyClothing', 'buyHaircut', 'owns', 'buyProperty', 'ownsProperty', 'unlocked', 'buy'].every((k) => typeof S[k] === 'function') && typeof S.golf.hud === 'function' && typeof S.properties.get === 'function',
      sections: (S.stats().sections || []).length,
      marks: S.debug.marks().length, minimap: S.markers().filter((m) => m.kind === 'system').length, untouched: GTP.Missions.allMarkers().every((m) => m.kind !== 'system'),
      holeLens: S.golf.holes().map((h) => h.length), hazards: S.golf.holes().map((h) => h.hazards.map((z) => z.kind[0]).join('')).join(' '),
      tee1: S.golf.holes()[0].tee, door: GTP.World.landmark('goldplate_links').door, pend: Pa.pendingLandmarks.filter((id) => !GTP.World.landmark(id))
    };
  });
  console.log('  surface: ' + JSON.stringify(r));
  t.assert(r.parity && r.tickers === r.parityTickers && r.tickers === 8 && r.holes === 9 && r.ach === r.parityAch && r.cheats === r.parityCheats, 'tables come from parity: ' + JSON.stringify(r));
  t.assert(r.jobs === 'damage_control:rescue,hot_take_brigade:douse' && r.safes >= 5 && r.props >= 10, 'jobs and properties');
  t.assert(r.wrapped && r.reg === 8 && r.ui && r.sections === 6, 'wrappers, save entries and the UI-facing names');
  t.assert(r.marks >= 5 && r.minimap >= r.marks && r.untouched, 'world markers exist and reach Systems.markers(): ' + r.marks + ' / ' + r.minimap);
  t.assert(r.holeLens.every((l) => l >= 15 && l <= 200) && Math.abs(r.tee1.x - (r.door.x - 6)) < 0.01 && Math.abs(r.tee1.z - (r.door.z - 84)) < 0.01, 'hole points are metres from the course door: ' + JSON.stringify(r.tee1));

  // ---- 2. properties ----
  r = await page.evaluate(() => {
    const P = GTP.Systems.properties, p = GTP.game.player, out = {};
    out.dorm = P.owned('safe_dorm');
    GTP.game.debug.setMoney(100);
    out.poor = P.buy('safe_brownstone').reason;
    const locked = P.defs().find((d) => d.unlock && d.unlock.mission); out.locked = locked ? P.buy(locked.id).reason : 'locked';
    GTP.game.debug.setMoney(200000);
    const m0 = p.money, price = P.def('safe_brownstone').price;
    out.buy = P.buy('safe_brownstone').ok; out.paid = m0 - p.money === price; out.again = P.buy('safe_brownstone').reason;
    out.buyEv = T_.count('property:buy'); out.shopBuy = T_.count('shop:buy');
    out.get = P.get('safe_brownstone').owned === true;
    const biz = P.defs().find((d) => d.kind === 'business' && !d.unlock && d.income > 0);
    out.biz = P.buy(biz.id).ok;
    // walk into another business's sale marker: property:open (the UI's card listens)
    const sale = P.list().find((d) => d.kind === 'business' && !d.owned && !d.locked);
    T_.tp(sale.x + 12, sale.z); GTP.game.advance(0.3);
    T_.tp(sale.x, sale.z);
    out.openS = T_.until(() => T_.count('property:open') > 0, 3, 0.1);
    out.open = T_.last('property:open'); out.modal = GTP.UI.modal && GTP.UI.modal() ? (GTP.UI.modal().kind || GTP.UI.modal().type || 'open') : null;
    if (GTP.UI.closeModal) GTP.UI.closeModal();
    // a game day: income
    const m1 = p.money; GTP.game.debug.setClock(23.95); GTP.game.advance(6);
    out.income = p.money - m1; out.expect = biz.income; out.incomeEv = T_.last('property:income');
    // the safehouse saves the game
    out.save = P.save('safe_brownstone').ok; out.savedEv = T_.count('property:save');
    out.notOwned = P.save('safe_penthouse').reason;
    // the interior gate: an unowned safehouse refuses and opens the card; an owned one lets the player in
    const n0 = T_.count('property:open');
    out.gate = GTP.Interiors.enter('safe_penthouse', {}); out.gateCard = T_.count('property:open') - n0;
    if (GTP.UI.closeModal) GTP.UI.closeModal();
    return out;
  });
  console.log('  properties: ' + JSON.stringify(r));
  t.assert(r.dorm && r.poor === 'funds' && r.locked === 'locked' && r.buy && r.paid && r.again === 'owned' && r.buyEv === 1 && r.shopBuy >= 1 && r.get && r.biz, 'buying rules');
  t.assert(r.openS > 0 && r.open && !r.open.owned && r.open.handled === true, 'a sale marker emits property:open, which the UI card handles: ' + JSON.stringify(r.open) + ' modal ' + r.modal);
  t.assert(r.income === r.expect && r.incomeEv && r.incomeEv.total === r.expect, 'one game day pays the business income');
  t.assert(r.save && r.savedEv === 1 && r.notOwned === 'notowned', 'safehouse save');
  t.assert(r.gate === false && r.gateCard === 1, 'an unowned safehouse door opens the property card instead of the room');

  // ---- 3. stocks ----
  r = await page.evaluate(() => {
    const St = GTP.Systems.stocks, p = GTP.game.player, out = {};
    GTP.game.debug.setMoney(10000);
    const tk = St.list()[0].id, q0 = St.quote(tk), m0 = p.money;
    const b = St.buy(tk, 10); out.buy = b.ok; out.cost = m0 - p.money;
    const gross = q0.price * 10, fee = GTP.Content.parity.stockApp.fee; out.expect = Math.ceil(gross + (fee < 1 ? Math.max(1, Math.ceil(gross * fee)) : fee));
    out.qty = St.quote(tk).shares;
    out.bad = [St.buy('NOPE', 1).reason, St.buy(tk, 0).reason, St.sell(St.list()[1].id, 1).reason, St.buy(St.list()[2].id, 1e6).reason, St.sell(tk, 'all').reason];
    out.moneyOk = Number.isInteger(p.money);
    const tk2 = St.list()[5].id, h0 = St.history(tk2).length, px0 = St.price(tk2);
    for (let k = 0; k < 3; k++) { GTP.game.debug.setClock(Math.floor(GTP.game.time.clock) + 0.99); GTP.game.advance(1.5); }
    out.histGrew = St.history(tk2).length - h0; out.moved = St.price(tk2) !== px0;
    St.tick(48); out.allPositive = St.list().every((s) => s.price > 0);
    // a reaction from a ticker's `reacts`
    const re = GTP.Content.parity.stocks.find((s) => s.reacts && Object.keys(s.reacts).length), mid = Object.keys(re.reacts)[0], want = re.reacts[mid];
    const before = St.price(re.ticker);
    GTP.Events.emit('mission:complete', { id: mid, replay: false });
    out.react = +((St.price(re.ticker) - before) / before).toFixed(3); out.want = want;
    const pr = St.price(re.ticker); GTP.Events.emit('mission:complete', { id: mid, replay: false }); out.once = St.price(re.ticker) === pr;
    const s = St.sell(tk); out.sell = s.ok; out.gain = +s.gain.toFixed(2); out.realized = +GTP.Systems.state.stocks.realized.toFixed(2);
    out.trades = GTP.Systems.state.stocks.trades; out.pf = St.portfolio().rows.length; out.moneyOk2 = Number.isInteger(p.money);
    return out;
  });
  console.log('  stocks: ' + JSON.stringify(r));
  t.assert(r.buy && r.cost === r.expect && r.qty === 10, 'buy charges price x qty + the stockApp fee in whole dollars');
  t.assert(r.bad.join() === 'unknown,qty,none,funds,shares' && r.moneyOk && r.moneyOk2, 'trade refusals use the UI reason names: ' + r.bad);
  t.assert(r.histGrew >= 2 && r.moved && r.allPositive, 'the market walks on the game clock');
  t.assert(Math.abs(r.react - r.want) < 0.01 && r.once, 'a ticker reacts to its mission once: ' + r.react + ' vs ' + r.want);
  t.assert(r.sell && r.gain === r.realized && r.trades === 2 && r.pf === 0, 'sell realizes the gain');

  // ---- 4. golf ----
  r = await page.evaluate(() => {
    const G = GTP.Systems.golf, p = GTP.game.player, out = {};
    GTP.AI.wanted && GTP.AI.wanted.clear && GTP.AI.wanted.clear();
    GTP.game.debug.setMoney(1000);
    const tee = G.holes()[0].tee, fee = G.fee();
    T_.tp(tee.x + 10, tee.z); GTP.game.advance(0.3);
    T_.tp(tee.x, tee.z);
    out.startS = T_.until(() => G.active, 3, 0.1);
    out.fee = fee; out.paid = 1000 - p.money;
    const st = G.state(), ev = T_.last('golf:start'); out.hole = ev && ev.hole; out.par = st.par; out.club = st.club; out.wind = st.wind.speed;
    const hud = G.hud(); out.hud = { hole: hud.hole, power: hud.power != null, club: hud.club, phase: hud.phase };
    const x0 = p.x, z0 = p.z; GTP.Input.set('forward', true); GTP.game.advance(0.5); GTP.Input.set('forward', false); GTP.game.advance(0.1);
    out.frozen = Math.hypot(p.x - x0, p.z - z0) < 1.2;
    G.selectClub(st.club);
    const a0 = G.state().aim; GTP.Input.set('left', true); GTP.game.advance(0.3); GTP.Input.set('left', false); out.aimMoved = +GTP.util.wrapAngle(G.state().aim - a0).toFixed(2);
    // Enter is both `enter` and `confirm`: it swings, it never quits
    GTP.Input.set('enter', true); GTP.Input.set('confirm', true); GTP.game.advance(1 / 60); GTP.Input.set('enter', false); GTP.Input.set('confirm', false); GTP.game.advance(1 / 60);
    out.enterKeeps = G.active && G.state().phase === 'swing';
    GTP.Systems.debug.golfRun().phase = 'aim';
    G.aimAtPin();
    T_.press('jump'); out.phase1 = G.state().phase;
    GTP.game.advance(0.55); T_.press('jump');
    out.shot = T_.last('golf:shot'); out.phase2 = G.state().phase; out.uiOwn = GTP.UI._v3 && GTP.UI._v3.golf ? true : null;
    out.restS = T_.until(() => G.state().phase !== 'flight', 25, 0.1);
    const s2 = G.state(); out.after = { lie: s2.ball.lie, dist: Math.round(s2.distToPin), strokes: s2.strokes, len: s2.length };
    return out;
  });
  console.log('  golf start: ' + JSON.stringify(r));
  t.assert(r.startS > 0 && r.hole === 1 && r.paid === r.fee && r.fee > 0, 'the tee marker charges the green fee and starts hole 1');
  t.assert(r.hud.hole === 1 && r.hud.power && r.hud.club, 'hud() reports power so the UI only draws: ' + JSON.stringify(r.hud));
  t.assert(r.frozen && r.aimMoved > 0.2 && r.enterKeeps, 'golf freezes walking, the arrows aim, Enter swings');
  t.assert(r.phase1 === 'swing' && r.shot && r.shot.power > 0.4 && r.phase2 === 'flight', 'two presses swing: ' + JSON.stringify(r.shot));
  t.assert(r.restS > 0 && r.after.strokes >= 1 && r.after.dist < r.after.len + 5, 'the ball flies toward the pin and rests: ' + JSON.stringify(r.after));
  await t.shot(page, 'systems_golf');

  r = await page.evaluate(() => {
    const G = GTP.Systems.golf, out = {};
    G.quit();
    G.start({ hole: 0, force: true });
    let guard = 0;
    while (G.active && guard++ < 220) {
      const s = G.state();
      if (s.phase === 'holed') { G.next(); continue; }
      G.aimAtPin();
      const s3 = G.state(), cl = G.clubs(), ci = cl.findIndex((c) => c.id === s3.club);
      G.shoot(Math.min(1, s3.distToPin / cl[ci].carry * (cl[ci].loft ? 0.88 : 1.08)));   // a lofted shot lands short and runs up
      G.settle(30);
    }
    out.guard = guard; out.end = T_.last('golf:end'); out.holes = T_.count('golf:hole'); out.pens = T_.count('golf:penalty');
    out.starts = T_.ev.filter((e) => e.n === 'golf:start').map((e) => e.e.hole).join(',');
    out.rounds = GTP.Systems.state.golf.rounds; out.free = !G.active && !GTP.Systems.debug.golfRun();
    out.names = out.end.card.map((c) => c.name).join(' | ');
    out.parTen = GTP.Systems.achievements.unlocked('par_ten');
    return out;
  });
  console.log('  golf round: ' + JSON.stringify(r));
  t.assert(r.end && r.end.full && r.end.holes === 9 && r.end.strokes <= 9 * 8 && r.holes >= 9 && r.guard < 220, 'the bot plays nine holes: ' + JSON.stringify(r.end));
  t.assert(r.rounds === 1 && r.free && r.parTen, 'the round counts, frees the player and unlocks Par Ten');
  t.assert(/1,2,3,4,5,6,7,8,9$/.test(r.starts), 'golf:start per hole (1-based) for the UI panel: ' + r.starts);

  // ---- 5. cheats ----
  await page.evaluate(() => { const p = GTP.game.player; GTP.game.debug.teleport(p.x + 30, p.z); GTP.game.advance(0.2); });
  await page.keyboard.type('bigtakes');
  await page.keyboard.type('isthispaid');
  r = await page.evaluate(() => {
    GTP.game.advance(0.1);
    const pausedByP = GTP.game.state === 'paused';   // the P in ISTHISPAID is the pause key; the code still counts
    if (pausedByP) { GTP.game.setState('playing'); GTP.game.advance(0.1); }
    GTP.game.advance(1.1);
    const p = GTP.game.player, head = p.mesh && p.mesh.getObjectByName('head'), C = GTP.Systems.cheats, out = {};
    out.head = head ? +head.scale.x.toFixed(2) : null; out.pausedByP = pausedByP; out.state = GTP.game.state; out.typed = T_.ev.filter((e) => e.n === 'cheat').map((e) => e.e.effect).join(',');
    out.paid = T_.last('cheat') && T_.last('cheat').effect;
    // moon jump: compare the apex with and without
    function apex() { T_.press('jump'); let m = 0; for (let i = 0; i < 120; i++) { GTP.game.advance(1 / 60); m = Math.max(m, p.y); } return m; }
    GTP.game.advance(0.5); const y0 = p.y, a1 = apex() - y0;
    C.enter('TRUSTLESS'); GTP.game.advance(0.5); const a2 = apex() - p.y;
    out.jump = [+a1.toFixed(2), +a2.toFixed(2)];
    C.enter('trustless'); C.enter('BIGTAKES'); GTP.game.advance(1.1); out.headOff = head ? +head.scale.x.toFixed(2) : null;
    // heal, wanted, money, spawn, gold, weather
    p.hp = 10; C.enter('RESPECTFULLY'); out.heal = p.hp === p.maxHp;
    GTP.game.debug.setWanted(2); C.enter('DIDNTREAD'); GTP.game.advance(0.2); out.wanted = p.wanted;
    const n0 = GTP.Entities.list.filter((e) => e.kind === 'vehicle').length; C.enter('CODE TAKES TWENTY'); out.spawned = GTP.Entities.list.filter((e) => e.kind === 'vehicle').length - n0;
    C.enter('TENOUTOFTEN'); GTP.game.advance(1.2);
    const cars = GTP.Entities.list.filter((e) => e.kind === 'vehicle' && !e.wreck);
    out.gold = cars.length ? +(cars.filter((v) => v.color === '#e8b53a').length / cars.length).toFixed(2) : 0;
    C.enter('TENOUTOFTEN'); GTP.game.advance(0.2); out.goldOff = cars.filter((v) => v._sysColor !== undefined).length;
    out.weather = C.enter('weather balloon'); out.bad = C.enter('NOTACHEAT');
    out.found = GTP.Systems.stats().cheatsFound; out.total = C.defs().length;
    out.hiddenAch = GTP.Systems.achievements.unlocked('respectfully_cheating');
    return out;
  });
  console.log('  cheats: ' + JSON.stringify(r));
  t.assert(r.head === 2.1 && r.headOff === 1 && /bigheads/.test(r.typed) && r.paid === 'money', 'typing BIGTAKES and ISTHISPAID works');
  t.assert(r.jump[1] > r.jump[0] * 1.8 && r.jump[0] > 0.3, 'TRUSTLESS moon-jumps: ' + r.jump);
  t.assert(r.heal && r.wanted === 0 && r.spawned === 1 && r.gold > 0.9 && r.goldOff === 0 && r.weather && !r.bad, 'the effects: ' + JSON.stringify(r));
  t.assert(r.found === r.total && r.hiddenAch, 'every code found; the hidden cheat achievement');

  // ---- 6. achievements ----
  r = await page.evaluate(() => {
    const A = GTP.Systems.achievements, S = GTP.Systems, out = {};
    out.fresh = S.unlocked('first_take');
    GTP.Missions.state.completed.add('m00_intro'); GTP.game.advance(1.2);
    out.mission = S.unlocked('first_take');
    GTP.Events.emit('range:end', { score: 900, medal: 'silver' }); out.silver = S.unlocked('gold_standard');
    GTP.Events.emit('range:end', { score: 1200, medal: 'gold' }); out.gold = S.unlocked('gold_standard');
    GTP.Missions.state.flags.damage_controlled = true; GTP.game.advance(1.2); out.flag = S.unlocked('damage_controlled'); delete GTP.Missions.state.flags.damage_controlled;
    GTP.game.player.stats.headshots = 100; GTP.game.advance(1.2); out.stat = S.unlocked('write_that_down');
    out.again = S.unlock('first_take'); out.bad = S.unlock('nope');
    const list = A.list();
    out.len = list.length; out.hidden = list.filter((x) => x.hidden).map((x) => x.id).join(',');
    out.prog = list.find((x) => x.id === 'hedge_fund').progress >= 0;
    out.ev = T_.last('achievement');
    return out;
  });
  console.log('  achievements: ' + JSON.stringify(r));
  t.assert(!r.fresh && r.mission && !r.silver && r.gold && r.flag && r.stat && !r.again && !r.bad, 'parity triggers: mission, event + fields, flag, stat');
  t.assert(r.len >= 25 && r.hidden === 'respectfully_cheating' && r.prog && r.ev && r.ev.name, 'list with hidden entries and names');

  // ---- 7. jobs ----
  r = await page.evaluate(() => {
    const J = GTP.Systems.jobs, p = GTP.game.player, out = {};
    GTP.game.debug.setClock(12); GTP.AI.wanted && GTP.AI.wanted.clear && GTP.AI.wanted.clear();
    out.noCar = J.start('damage_control').reason;
    // walk near the hospital: the Damage Control van appears at its spot
    const h = GTP.World.landmark('hospital').door;
    T_.tp(h.x + 30, h.z); GTP.Systems.debug.ensureJobCars(); GTP.game.advance(0.2);
    const van = J.vehicle('damage_control'); out.van = van ? { type: van.type, tag: van.tag, dist: Math.round(Math.hypot(van.x - h.x, van.z - h.z)) } : null;
    out.inVan = T_.enter(van); T_.stop(van); GTP.game.advance(0.3);
    T_.press('action');
    out.started = J.active;
    out.levelS = T_.until(() => J.state().phase === 'run', 5, 0.1);
    const st = J.state(); out.calls = st.total; out.timer = Math.round(st.timer); out.name = st.calls[0] && st.calls[0].name;
    const call = st.calls[0]; out.callDist = Math.round(Math.hypot(call.x - p.x, call.z - p.z));
    const m0 = p.money;
    T_.tp(call.x + 3, call.z); T_.stop(van);
    out.boardS = T_.until(() => J.state().aboard === 1, 3, 0.1);
    out.target = J.state().target && J.state().target.kind;
    T_.tp(h.x + 3, h.z); T_.stop(van);
    out.deliverS = T_.until(() => T_.count('job:levelComplete') > 0, 3, 0.1);
    const d = J.def('damage_control'); out.pay = p.money - m0; out.expect = d.pay.perCall + d.pay.perLevel;
    out.level = J.state().level; out.best = GTP.Systems.state.jobs.best.damage_control;
    // E while stopped ends the run
    T_.stop(van); T_.press('action'); out.endEv = T_.last('job:end') && T_.last('job:end').reason;
    // a level reward: finish level 6 through the debug hook
    J.start('damage_control', { force: true, level: 6 }); T_.until(() => J.state().phase === 'run', 5, 0.1);
    const mr = p.money; J.debug.finishLevel(); out.reward = T_.last('job:reward'); out.rewardMoney = p.money - mr;
    J.stop('test');
    T_.leave();
    // Hot Take Brigade: the truck at its spot, spray a flame war with shoot held
    const hq = GTP.World.landmark('police_hq').door;
    T_.tp(hq.x + 30, hq.z); GTP.Systems.debug.ensureJobCars(); GTP.game.advance(0.2);
    const truck = J.vehicle('hot_take_brigade'); out.truck = truck ? truck.type : null;
    out.inTruck = T_.enter(truck); T_.stop(truck); GTP.game.advance(0.3); T_.press('action');
    out.htb = J.active;
    T_.until(() => J.state().phase === 'run', 4, 0.1);
    const f = J.state().calls[0];
    T_.tp(f.x + 10, f.z); T_.stop(truck);
    GTP.Input.set('shoot', true);
    out.douseS = T_.until(() => T_.count('job:douse') > 0, 5, 0.1);
    GTP.Input.set('shoot', false);
    out.htbLevel = T_.until(() => J.state().level === 2 && J.state().phase === 'run', 6, 0.1);
    const far = J.state(), fr = GTP.World.nearestRoadPoint(far.calls[0].x + 220, far.calls[0].z); T_.tp(fr.x, fr.z); T_.stop(truck);
    out.timeoutS = T_.until(() => !J.active, 200, 0.5);
    out.timeout = T_.last('job:end').reason;
    out.fires = GTP.Systems.state.jobs.fires; out.clients = GTP.Systems.state.jobs.clients;
    T_.leave();
    return out;
  });
  console.log('  jobs: ' + JSON.stringify(r));
  t.assert(r.noCar === 'vehicle' && r.van && r.van.type === 'van' && r.van.dist <= 20 && r.inVan && r.started === 'damage_control' && r.levelS > 0, 'the van parks at the hospital; E while stopped starts Damage Control: ' + JSON.stringify(r.van));
  t.assert(r.calls === 1 && r.timer > 20 && r.callDist >= 40 && r.name, 'level 1: one named patient with a timer');
  t.assert(r.boardS > 0 && r.target === 'deliver' && r.deliverS > 0 && r.pay === r.expect && r.level === 2 && r.best === 1 && r.endEv === 'quit', 'pick up, deliver, level up, pay, E ends: ' + JSON.stringify(r));
  t.assert(r.reward && r.reward.level === 6 && r.rewardMoney >= r.reward.money, 'level 6 pays its reward');
  t.assert(r.truck === 'truck' && r.inTruck && r.htb === 'hot_take_brigade' && r.douseS > 0 && r.htbLevel > 0 && r.timeoutS > 0 && r.timeout === 'timeout', 'Hot Take Brigade sprays, levels and times out');

  // ---- 8. wardrobe ----
  r = await page.evaluate(() => {
    const S = GTP.Systems, Wr = S.wardrobe, p = GTP.game.player, out = {};
    const pink = Wr.items('top').find((d) => d.color && d.price > 50), hat = Wr.items('hat').find((d) => d.price > 0);
    GTP.game.debug.setMoney(5);
    out.poor = S.buyClothing(pink.id, { slot: 'top' }).reason;
    GTP.game.debug.setMoney(20000);
    const mesh0 = p.mesh, m0 = p.money;
    out.buy = S.buyClothing(pink.id, { slot: 'top' }).ok; out.money = m0 - p.money === pink.price;
    out.shirt = p.look.shirt === pink.color; out.outfit = p.look.outfit && p.look.outfit.top === pink.id;
    out.rebuilt = p.mesh !== mesh0 && !!p.mesh; GTP.game.advance(0.1); out.parts = !p._parts || (p._parts.torso ? p.mesh.getObjectById(p._parts.torso.id) != null : true);
    out.owns = S.owns(pink.id); out.hat = Wr.buy(hat.id).ok && p.look.hat === hat.style;
    out.noHat = Wr.buy('hat_none').ok && p.look.hat === 'none';
    out.reequip = Wr.buy(pink.id).price;
    const o = Wr.outfits()[0]; const mo = p.money; out.outfit1 = S.buyOutfit(o.id).ok; out.outfitPrice = mo - p.money; out.outfitTop = p.look.outfit.top === o.items.top;
    out.outfitAgain = S.buyOutfit(o.id).price;
    const bd = GTP.Content.parity.barber, cut = bd.styles.find((s) => s.hair === 'mohawk'), col = bd.colors.find((c) => c.hex === '#ff3fa4');
    const mh = p.money, h1 = S.buyHaircut(cut.id, { slot: 'styles' }), h2 = S.barber.buy(col.id, { slot: 'colors' });
    out.hair = h1.ok && h2.ok && p.look.hair === 'mohawk' && p.look.hairColor === '#ff3fa4'; out.hairPaid = mh - p.money === cut.price + col.price;
    const nat = bd.colors.find((c) => !c.hex); out.natural = S.barber.buy(nat.id, {}).ok && p.look.hairColor === p._sysBaseLook.hairColor;
    S.barber.buy(col.id, {});
    out.evs = [T_.count('clothing:buy'), T_.count('barber:buy')];
    return out;
  });
  console.log('  wardrobe: ' + JSON.stringify(r));
  t.assert(r.poor === 'funds' && r.buy && r.money && r.shirt && r.outfit && r.rebuilt && r.parts && r.owns, 'clothing buy applies style and colour and rebuilds the mesh');
  t.assert(r.hat && r.noHat && r.reequip === 0 && r.outfit1 && r.outfitPrice > 0 && r.outfitTop && r.outfitAgain === 0, 'hats, the none hat, re-equip free, outfits');
  t.assert(r.hair && r.hairPaid && r.natural && r.evs[0] >= 3 && r.evs[1] === 4, 'barber style and colour, natural colour');
  await t.shot(page, 'systems_wardrobe');

  // ---- 9. saves ----
  r = await page.evaluate(() => {
    const S = GTP.Systems, snap = () => JSON.stringify({ o: S.state.properties.owned, a: Object.keys(S.state.achievements.unlocked).sort(), w: S.state.wardrobe.equipped, h: S.state.wardrobe.hair, c: S.state.cheats.found, g: S.state.golf.rounds, j: S.state.jobs.best });
    const before = snap();
    const ok = GTP.game.saveSlot(2, { reason: 'test', quiet: true });
    const raw = JSON.parse(localStorage.getItem('gtp.save.v4.slot2') || '{}');
    GTP.game.newGame(7);
    const wiped = Object.keys(S.state.achievements.unlocked).length === 0 && !S.properties.owned('safe_brownstone');
    const loaded = GTP.game.loadSlot(2);
    GTP.game.advance(0.2);
    const p = GTP.game.player;
    // the perk path applied twice never stacks; the systems rng survives a registry round trip
    const jb = GTP.SaveRegistry.sys_jobs.get(); GTP.SaveRegistry.sys_jobs.set(jb); GTP.SaveRegistry.sys_jobs.set(jb);
    const st = GTP.SaveRegistry.sys_stats.get(), r1 = S.debug.rng().random(); GTP.SaveRegistry.sys_stats.set(st); const r2 = S.debug.rng().random();
    return { ok, v4: raw.version, regKeys: Object.keys(raw.registry || {}).filter((k) => /^sys_/.test(k)).length, noLegacy: raw.systems === undefined, wiped, loaded, same: before === snap(), hair: p.look.hair, maxHp: p.maxHp, rngSame: r1 === r2 };
  });
  console.log('  saves: ' + JSON.stringify(r));
  t.assert(r.ok && r.v4 === 4 && r.regKeys === 8 && r.noLegacy && r.wiped && r.loaded && r.same, 'save v4 registry / new game / load round trip: ' + JSON.stringify(r));
  t.assert(r.hair === 'mohawk' && r.maxHp === 100 && r.rngSame, 'look restored; max health untouched; rng restored');

  // ---- 10. wanted:cleared, stats page, errors ----
  r = await page.evaluate(() => {
    GTP.game.debug.setWanted(5); GTP.game.advance(0.3);
    GTP.AI.wanted && GTP.AI.wanted.clear ? GTP.AI.wanted.clear() : GTP.game.debug.setWanted(0); GTP.game.advance(0.3);
    const wc = T_.last('wanted:cleared');
    const pg = GTP.Systems.stats().sections;
    return { wc, dept: GTP.Systems.unlocked('whole_department'), sections: pg.map((s) => s.id), rows: pg.reduce((a, s) => a + s.rows.length, 0), allStrings: pg.every((s) => s.rows.every((x) => typeof x.value === 'string' && x.label)), missions: pg[0].rows[0].value };
  });
  console.log('  wanted + stats: ' + JSON.stringify(r));
  t.assert(r.wc && r.wc.stars === 5 && r.dept, 'escaping five stars emits wanted:cleared and unlocks the achievement');
  t.assert(r.sections.length === 6 && r.rows >= 30 && r.allStrings && / \/ \d+$/.test(r.missions), 'stats sections for the UI');
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'no errors: ' + errs.join('\n'));
});
