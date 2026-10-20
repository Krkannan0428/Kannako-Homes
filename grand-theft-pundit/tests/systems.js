/* systems.js: GTP.Systems (js/14_systems.js), the systems track of PLAN_V03.md.
 *  1 the surface: data tables (8 tickers, 9 holes, 25 achievements, 6 cheats, 2 jobs, properties), wrappers, SaveRegistry entries
 *  2 properties: the van is owned; buy (money, locked, owned), property:open from a marker, a game day of income, safehouse save
 *  3 stocks: buy / sell / fee, the hourly random walk on the game clock, mission:complete shocks (once)
 *  4 golf: the tee marker starts a round, player controls freeze, the two-press meter on real inputs, a water penalty,
 *    a bot plays nine holes to golf:end; screenshot systems_golf.png
 *  5 cheats typed on the keyboard (GOLDENHOUR, BIGTAKES, TRUSTLESS, SLOWNEWSDAY) and entered (WEATHERBALLOON, RESPECTFULY)
 *  6 achievements: unlock emits `achievement`, stat-driven unlocks, list progress
 *  7 jobs: Damage Control from its marker in a car (pick up, deliver, level 2), Hot Take Brigade (douse, level up, a fuse timeout)
 *  8 wardrobe: clothing buy / equip (look.outfit + colours, the mesh rebuilt), haircut, not enough money
 *  9 saves: saveSlot / loadSlot round trip of every systems field; SaveRegistry get / set
 * 10 statsPage, no errors */
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
      enter(v) { const d = v.doorWorld(0); T_.tp(d.x, d.z); GTP.game.advance(0.1); T_.press('enter'); GTP.game.advance(0.8); return GTP.game.player.inVehicle === v; }
    };
    ['achievement', 'property:open', 'property:buy', 'property:income', 'property:save', 'stocks:trade', 'stocks:news', 'golf:start', 'golf:shot', 'golf:hole', 'golf:end', 'golf:penalty',
      'cheat', 'job:start', 'job:level', 'job:levelComplete', 'job:end', 'job:pickup', 'job:deliver', 'job:douse', 'clothing:buy', 'barber:buy', 'shop:buy', 'saved']
      .forEach((n) => GTP.Events.on(n, (e) => T_.ev.push({ n, e })));
  });

  // ---- 1. the surface ----
  let r = await page.evaluate(() => {
    const S = GTP.Systems;
    return {
      tickers: S.stocks.list().length, holes: S.golf.holes().length, ach: S.achievements.defs().length, cheats: S.cheats.defs().length, jobs: S.jobs.defs().length,
      props: S.properties.defs().length, safes: S.properties.defs().filter((d) => d.kind === 'safehouse').length,
      wrapped: !!(GTP.Missions.update._sys && GTP.Missions.init._sys && GTP.Missions.allMarkers._sys && GTP.Player.prototype.control._sys),
      reg: Object.keys(GTP.SaveRegistry || {}).filter((k) => /^sys_/.test(k)).length, hook: GTP.SaveHooks.some((h) => h.name === 'systems'),
      marks: S.debug.marks().length, minimap: GTP.Missions.allMarkers().filter((m) => m.kind === 'system').length,
      holeLens: S.golf.holes().map((h) => h.length), course: S.golf.course()
    };
  });
  console.log('  surface: ' + JSON.stringify(r));
  t.assert(r.tickers === 8 && r.holes === 9 && r.ach === 25 && r.cheats === 6 && r.jobs === 2, 'tables: ' + JSON.stringify(r));
  t.assert(r.safes >= 5 && r.props >= 10, 'five safehouses and businesses');
  t.assert(r.wrapped && r.reg === 8 && r.hook, 'wrappers and save entries installed');
  t.assert(r.marks >= 7 && r.minimap === r.marks, 'world markers exist and reach the minimap: ' + r.marks + ' / ' + r.minimap);
  t.assert(r.holeLens.every((l) => l >= 25 && l <= 200), 'hole lengths are playable: ' + r.holeLens);

  // ---- 2. properties ----
  r = await page.evaluate(() => {
    const P = GTP.Systems.properties, p = GTP.game.player, out = {};
    out.dorm = P.owned('safe_dorm');
    GTP.game.debug.setMoney(100);
    out.poor = P.buy('safe_brownstone').reason;
    out.locked = P.buy('safe_marina_loft').reason;
    GTP.game.debug.setMoney(50000);
    const b = P.buy('safe_brownstone'); out.buy = b.ok; out.money = p.money; out.again = P.buy('safe_brownstone').reason;
    out.buyEv = T_.count('property:buy'); out.shopBuy = T_.count('shop:buy');
    out.biz = P.buy('biz_octane').ok;
    // walk into the fish shack's sale marker: property:open
    const fish = P.list().find((d) => d.id === 'biz_fish_shack');
    T_.tp(fish.x + 12, fish.z); GTP.game.advance(0.3);
    T_.tp(fish.x, fish.z);
    out.openS = T_.until(() => T_.count('property:open') > 0, 3, 0.1);
    out.open = T_.last('property:open');
    // a game day: income
    const m0 = p.money; GTP.game.debug.setClock(23.95); GTP.game.advance(6);
    out.income = p.money - m0; out.incomeEv = T_.last('property:income');
    // the safehouse saves the game
    out.save = P.save('safe_brownstone').ok; out.savedEv = T_.count('property:save');
    out.notOwned = P.save('safe_penthouse').reason;
    out.ach = GTP.Systems.achievements.unlocked('ach_property');
    return out;
  });
  console.log('  properties: ' + JSON.stringify(r));
  t.assert(r.dorm && r.poor === 'money' && r.locked === 'locked' && r.buy && r.again === 'owned' && r.buyEv === 1 && r.shopBuy >= 1 && r.biz, 'buying rules');
  t.assert(r.openS > 0 && r.open && r.open.id === 'biz_fish_shack' && !r.open.owned, 'a sale marker emits property:open');
  t.assert(r.income === 520 && r.incomeEv && r.incomeEv.total === 520, 'one game day pays the business income');
  t.assert(r.save && r.savedEv === 1 && r.notOwned === 'notowned' && r.ach, 'safehouse save and the achievement');

  // ---- 3. stocks ----
  r = await page.evaluate(() => {
    const St = GTP.Systems.stocks, p = GTP.game.player, out = {};
    GTP.game.debug.setMoney(10000);
    const q0 = St.quote('NAPD'); const m0 = p.money;
    const b = St.buy('NAPD', 10); out.buy = b.ok; out.cost = +(m0 - p.money).toFixed(2); out.expect = +(q0.price * 10 + 10).toFixed(2);
    out.qty = St.quote('NAPD').qty;
    out.bad = [St.buy('NOPE', 1).reason, St.buy('NAPD', 0).reason, St.sell('VLVT', 1).reason, St.buy('VLTW', 100000).reason];
    const h0 = St.history('PNDT').length, px0 = St.price('PNDT');
    for (let k = 0; k < 3; k++) { GTP.game.debug.setClock(Math.floor(GTP.game.time.clock) + 0.99); GTP.game.advance(1.5); }   // three hour boundaries crossed
    out.histGrew = St.history('PNDT').length - h0; out.moved = St.price('PNDT') !== px0;
    St.tick(48);
    out.allPositive = St.list().every((s) => s.price > 0);
    const pl0 = St.price('PLLT');
    GTP.Events.emit('mission:complete', { id: 'm10_pellets', replay: false });
    out.pllt = +((St.price('PLLT') - pl0) / pl0).toFixed(3);
    const pl1 = St.price('PLLT'); GTP.Events.emit('mission:complete', { id: 'm10_pellets', replay: false }); out.once = St.price('PLLT') === pl1;
    out.news = St.news().length;
    const s = St.sell('NAPD'); out.sell = s.ok; out.gain = +s.gain.toFixed(2); out.realized = +GTP.Systems.state.stocks.realized.toFixed(2);
    out.trades = GTP.Systems.state.stocks.trades; out.pf = St.portfolio().rows.length;
    out.ach = GTP.Systems.achievements.unlocked('ach_trade');
    return out;
  });
  console.log('  stocks: ' + JSON.stringify(r));
  t.assert(r.buy && Math.abs(r.cost - r.expect) < 0.02 && r.qty === 10, 'buy charges price x qty + the fee');
  t.assert(r.bad.join() === 'unknown,qty,none,money', 'trade refusals: ' + r.bad);
  t.assert(r.histGrew >= 2 && r.moved && r.allPositive, 'the market walks on the game clock');
  t.assert(Math.abs(r.pllt + 0.35) < 0.01 && r.once && r.news >= 1, 'm10_pellets sinks PLLT 35% once');
  t.assert(r.sell && r.gain === r.realized && r.trades === 2 && r.pf === 0 && r.ach, 'sell realizes the gain');

  // ---- 4. golf ----
  r = await page.evaluate(() => {
    const G = GTP.Systems.golf, p = GTP.game.player, out = {};
    GTP.AI.wanted && GTP.AI.wanted.clear && GTP.AI.wanted.clear();
    const tee = G.holes()[0].tee;
    T_.tp(tee.x + 10, tee.z); GTP.game.advance(0.3);
    T_.tp(tee.x, tee.z);
    out.startS = T_.until(() => G.active, 3, 0.1);
    const st = G.state(); out.hole = st.hole; out.par = st.par; out.club = st.club; out.wind = st.wind.speed;
    // controls frozen: holding forward moves the aim club, not the player
    const x0 = p.x, z0 = p.z; GTP.Input.set('forward', true); GTP.game.advance(0.5); GTP.Input.set('forward', false); GTP.game.advance(0.1);
    out.frozen = Math.hypot(p.x - x0, p.z - z0) < 1.2;
    G.selectClub(st.club);
    // aim with the keys
    const a0 = G.state().aim; GTP.Input.set('left', true); GTP.game.advance(0.3); GTP.Input.set('left', false); out.aimMoved = +GTP.util.wrapAngle(G.state().aim - a0).toFixed(2);
    G.aimAtPin();
    // the two-press swing on Space: start, wait for the meter, lock
    T_.press('jump'); out.phase1 = G.state().phase;
    GTP.game.advance(0.55); T_.press('jump');
    out.shot = T_.last('golf:shot'); out.phase2 = G.state().phase;
    out.restS = T_.until(() => G.state().phase !== 'flight', 25, 0.1);
    const s2 = G.state(); out.after = { lie: s2.ball.lie, dist: Math.round(s2.distToPin), strokes: s2.strokes, len: s2.length };
    return out;
  });
  console.log('  golf start: ' + JSON.stringify(r));
  t.assert(r.startS > 0 && r.hole === 0 && r.par === 3, 'the tee marker starts the round');
  t.assert(r.frozen && r.aimMoved > 0.2, 'golf freezes walking and the arrows aim');
  t.assert(r.phase1 === 'swing' && r.shot && r.shot.power > 0.4 && r.phase2 === 'flight', 'two presses swing: ' + JSON.stringify(r.shot));
  t.assert(r.restS > 0 && r.after.strokes === 1 && r.after.dist < r.after.len, 'the ball flies toward the pin and rests');
  await t.shot(page, 'systems_golf');

  r = await page.evaluate(() => {
    const G = GTP.Systems.golf, out = {};
    // a water penalty: hole 2's pond sits on the line; aim at it with a carry that lands in it
    G.quit(); G.start({ hole: 1, force: true });
    const st = G.state(), pond = st.hazards.find((h) => h.kind === 'water');
    const d = Math.hypot(pond.x - st.ball.x, pond.z - st.ball.z);
    G.setAim(Math.atan2(-(pond.x - st.ball.x), -(pond.z - st.ball.z)));
    const clubs = G.clubs(); G.selectClub('iron');
    G.shoot(d / clubs[1].carry); G.settle(20);
    out.pen = T_.count('golf:penalty'); out.strokes = G.state().strokes; out.back = Math.round(Math.hypot(G.state().ball.x - st.tee.x, G.state().ball.z - st.tee.z));
    G.quit();
    // the bot: nine holes
    G.start({ hole: 0, force: true });
    let guard = 0;
    while (G.active && guard++ < 200) {
      const s = G.state();
      if (s.phase === 'holed') { G.next(); continue; }
      G.aimAtPin();
      const s3 = G.state(), cl = G.clubs(), ci = cl.findIndex((c) => c.id === s3.club);
      G.shoot(Math.min(1, s3.distToPin / cl[ci].carry * (cl[ci].loft ? 0.88 : 1.08)));   // a lofted shot lands short and runs up
      G.settle(30);
    }
    out.guard = guard; out.end = T_.last('golf:end'); out.holes = T_.count('golf:hole');
    out.rounds = GTP.Systems.state.golf.rounds; out.ach = GTP.Systems.achievements.unlocked('ach_golf_round');
    out.free = !G.active && !GTP.Systems.debug.golfRun();
    return out;
  });
  console.log('  golf round: ' + JSON.stringify(r));
  t.assert(r.pen >= 1 && r.strokes === 2 && r.back < 2, 'a water ball costs a stroke and replays from the spot: ' + JSON.stringify(r));
  t.assert(r.end && r.end.full && r.end.holes === 9 && r.end.par > 27 && r.end.strokes <= 9 * 8 && r.holes >= 9, 'the bot plays nine holes: ' + JSON.stringify(r.end));
  t.assert(r.rounds === 1 && r.ach && r.free, 'the round counts and frees the player');

  // ---- 5. cheats ----
  await page.evaluate(() => { const p = GTP.game.player; GTP.game.debug.teleport(p.x + 30, p.z); GTP.game.advance(0.2); });
  await page.keyboard.type('goldenhour');
  r = await page.evaluate(() => ({ clock: +GTP.game.time.clock.toFixed(2), ev: T_.last('cheat') }));
  console.log('  cheat GOLDENHOUR: ' + JSON.stringify(r));
  t.assert(Math.abs(r.clock - 18.6) < 0.1 && r.ev && r.ev.id === 'goldenhour', 'typing GOLDENHOUR sets sunset');
  await page.keyboard.type('bigtakes');
  await page.keyboard.type('slownewsday');
  r = await page.evaluate(() => {
    GTP.game.advance(1.1);
    const p = GTP.game.player, head = p.mesh && p.mesh.getObjectByName('head');
    const out = { head: head ? +head.scale.x.toFixed(2) : null, slow: GTP.game.timeScale };
    // moon jump: compare the apex with and without
    function apex() { T_.press('jump'); let m = 0; for (let i = 0; i < 120; i++) { GTP.game.advance(1 / 60); m = Math.max(m, p.y); } return m; }
    GTP.game.advance(0.5); const y0 = p.y, a1 = apex() - y0;
    GTP.Systems.cheats.enter('TRUSTLESS'); GTP.game.advance(0.5); const a2 = apex() - p.y;
    out.jump = [+a1.toFixed(2), +a2.toFixed(2)];
    GTP.Systems.cheats.enter('trustless'); GTP.Systems.cheats.enter('SLOWNEWSDAY'); GTP.Systems.cheats.enter('BIGTAKES');
    GTP.game.advance(1.1); out.headOff = head ? +head.scale.x.toFixed(2) : null; out.slowOff = GTP.game.timeScale;
    out.weather = GTP.Systems.cheats.enter('weather balloon'); out.resp = GTP.Systems.cheats.enter('RESPECTFULY'); out.bad = GTP.Systems.cheats.enter('NOTACHEAT');
    out.found = GTP.Systems.stats().cheatsFound; out.allAch = GTP.Systems.achievements.unlocked('ach_all_cheats');
    return out;
  });
  console.log('  cheats: ' + JSON.stringify(r));
  t.assert(r.head === 2.1 && r.slow === 0.5 && r.headOff === 1 && r.slowOff === 1, 'BIGTAKES and SLOWNEWSDAY toggle');
  t.assert(r.jump[1] > r.jump[0] * 1.8 && r.jump[0] > 0.3, 'TRUSTLESS moon-jumps: ' + r.jump);
  t.assert(r.weather && r.resp && !r.bad && r.found === 6 && r.allAch, 'all six cheats found');

  // ---- 6. achievements ----
  r = await page.evaluate(() => {
    const A = GTP.Systems.achievements, n0 = T_.count('achievement');
    const a = GTP.Systems.unlock('ach_marathon'), again = GTP.Systems.unlock('ach_marathon'), bad = GTP.Systems.unlock('nope');
    const ev = T_.last('achievement');
    GTP.game.player.stats.jumps = 100; GTP.game.advance(1.2);
    const list = A.list();
    return { a, again, bad, ev, n: T_.count('achievement') - n0, jumps: A.unlocked('ach_jumps'), count: A.count(), listLen: list.length,
      prog: list.find((x) => x.id === 'ach_wealth').progress, names: list.every((x) => x.name && x.desc) };
  });
  console.log('  achievements: ' + JSON.stringify(r));
  t.assert(r.a && !r.again && !r.bad && r.ev.id === 'ach_marathon' && r.ev.name === 'Five Hours of Content', 'unlock emits achievement {id, name} once');
  t.assert(r.jumps && r.n >= 2 && r.listLen === 25 && r.prog > 0 && r.prog < 1 && r.names, 'stat-driven unlock and progress');

  // ---- 7. jobs ----
  r = await page.evaluate(() => {
    const J = GTP.Systems.jobs, p = GTP.game.player, out = {};
    GTP.game.debug.setClock(12);
    const dc = J.list().find((j) => j.id === 'damage_control');
    out.noCar = J.start('damage_control').reason;
    const v = T_.car(); out.inCar = T_.enter(v);
    T_.tp(dc.x + 15, dc.z); GTP.game.advance(0.3);
    T_.tp(dc.x, dc.z); v.vx = v.vz = 0; v.speed = 0;
    out.startS = T_.until(() => J.active === 'damage_control', 3, 0.1);
    out.levelS = T_.until(() => J.state().phase === 'run', 5, 0.1);
    const st = J.state(); out.calls = st.total; out.timer = Math.round(st.timer);
    const call = st.calls[0]; out.callDist = Math.round(Math.hypot(call.x - p.x, call.z - p.z));
    const m0 = p.money;
    T_.tp(call.x + 3, call.z); v.speed = 0;
    out.boardS = T_.until(() => J.state().aboard === 1, 3, 0.1);
    out.target = J.state().target && J.state().target.kind;
    const hosp = GTP.World.landmark('hospital').door;
    T_.tp(hosp.x + 3, hosp.z); v.speed = 0;
    out.deliverS = T_.until(() => T_.count('job:levelComplete') > 0, 3, 0.1);
    out.pay = p.money - m0; out.level = J.state().level; out.best = GTP.Systems.state.jobs.best.damage_control;
    J.stop('test'); out.endEv = T_.last('job:end') && T_.last('job:end').reason;
    // Hot Take Brigade: douse one take, then a fuse running out
    out.htb = J.start('hot_take_brigade').ok;
    T_.until(() => J.state().phase === 'run', 4, 0.1);
    const f = J.state().calls[0];
    T_.tp(f.x + 3, f.z); v.speed = 0;
    out.douseS = T_.until(() => T_.count('job:douse') > 0, 5, 0.1);
    out.htbLevel = T_.until(() => J.state().level === 2 && J.state().phase === 'run', 6, 0.1);
    const far = J.state(); T_.tp(far.calls[0].x + 200, far.calls[0].z); v.speed = 0;
    out.timeoutS = T_.until(() => !J.active, 90, 0.5);
    out.timeout = T_.last('job:end').reason;
    out.fires = GTP.Systems.state.jobs.fires; out.clients = GTP.Systems.state.jobs.clients;
    p.exitVehicle(); GTP.game.advance(0.3);
    return out;
  });
  console.log('  jobs: ' + JSON.stringify(r));
  t.assert(r.noCar === 'vehicle' && r.inCar && r.startS > 0 && r.levelS > 0, 'the job marker starts Damage Control in a car');
  t.assert(r.calls === 1 && r.timer > 20 && r.callDist >= 40, 'level 1: one client with a timer: ' + JSON.stringify(r));
  t.assert(r.boardS > 0 && r.target === 'deliver' && r.deliverS > 0 && r.pay === 40 + 150 && r.level === 2 && r.best === 1 && r.endEv === 'test', 'pick up, deliver, level up and pay');
  t.assert(r.htb && r.douseS > 0 && r.htbLevel > 0 && r.timeoutS > 0 && r.timeout === 'timeout' && r.fires === 1 && r.clients === 1, 'Hot Take Brigade douses, levels and times out');

  // ---- 8. wardrobe ----
  r = await page.evaluate(() => {
    const Wr = GTP.Systems.wardrobe, p = GTP.game.player, out = {};
    GTP.game.debug.setMoney(30);
    out.poor = Wr.buy('top_blazer_pink').reason;
    GTP.game.debug.setMoney(5000);
    const mesh0 = p.mesh;
    out.buy = Wr.buy('top_blazer_pink').ok; out.money = 5000 - p.money;
    out.shirt = p.look.shirt; out.outfit = p.look.outfit && p.look.outfit.top; out.rebuilt = p.mesh !== mesh0 && !!p.mesh;
    out.hat = Wr.buy('hat_cap').ok && p.look.hat;
    out.reequip = Wr.buy('top_blazer_pink').price;   // owned: free
    out.locked = Wr.buy('top_gold_suit').reason;
    out.items = Wr.items('top').length; out.slots = Wr.slots().join(',');
    const h = GTP.Systems.barber.buy('mohawk', 'pink'); out.hair = h.ok && p.look.hair; out.hairColor = p.look.hairColor; out.hairPrice = h.price;
    out.evs = [T_.count('clothing:buy'), T_.count('barber:buy')];
    return out;
  });
  console.log('  wardrobe: ' + JSON.stringify(r));
  t.assert(r.poor === 'money' && r.buy && r.money === 420 && r.shirt === '#ff3fa4' && r.outfit === 'top_blazer_pink' && r.rebuilt, 'clothing buy applies the look and rebuilds the mesh');
  t.assert(r.hat === 'cap' && r.reequip === 0 && r.locked === 'locked' && r.items >= 5, 'hats, re-equip free, locked items');
  t.assert(r.hair === 'mohawk' && r.hairColor === '#ff3fa4' && r.hairPrice === 150 && r.evs[0] === 2 && r.evs[1] === 1, 'barber');
  await t.shot(page, 'systems_wardrobe');

  // ---- 9. saves ----
  r = await page.evaluate(() => {
    const S = GTP.Systems, before = JSON.stringify({ o: S.state.properties.owned, a: Object.keys(S.state.achievements.unlocked).sort(), w: S.state.wardrobe.equipped, c: S.state.cheats.found, g: S.state.golf.rounds, j: S.state.jobs.best });
    const reg = GTP.SaveRegistry.sys_stocks.get();
    GTP.Systems.stocks.buy('YELL', 3);
    const ok = GTP.game.saveSlot(2, { reason: 'test', quiet: true });
    GTP.game.newGame(7);
    const wiped = Object.keys(S.state.achievements.unlocked).length === 0 && !S.properties.owned('safe_brownstone');
    const loaded = GTP.game.loadSlot(2);
    GTP.game.advance(0.2);
    const after = JSON.stringify({ o: S.state.properties.owned, a: Object.keys(S.state.achievements.unlocked).sort(), w: S.state.wardrobe.equipped, c: S.state.cheats.found, g: S.state.golf.rounds, j: S.state.jobs.best });
    const p = GTP.game.player;
    // SaveRegistry set: restore the earlier stocks snapshot
    GTP.SaveRegistry.sys_stocks.set(reg);
    return { ok, wiped, loaded, same: before === after, yell: (S.state.stocks.holdings.YELL || {}).qty, hair: p.look.hair, shirt: p.look.shirt, regYell: (S.state.stocks.holdings.YELL || { qty: 0 }).qty };
  });
  console.log('  saves: ' + JSON.stringify(r));
  t.assert(r.ok && r.wiped && r.loaded && r.same, 'save / new game / load round trip');
  t.assert(r.hair === 'mohawk' && r.shirt === '#ff3fa4' && r.regYell === 0, 'look restored; SaveRegistry set works');

  // ---- 10. stats page, errors ----
  r = await page.evaluate(() => {
    const pg = GTP.Systems.statsPage();
    return { sections: pg.map((s) => s.id), rows: pg.reduce((a, s) => a + s.rows.length, 0), allStrings: pg.every((s) => s.rows.every((x) => typeof x.value === 'string' && x.label)), missions: pg[0].rows[0].value };
  });
  console.log('  stats page: ' + JSON.stringify(r));
  t.assert(r.sections.length === 6 && r.rows >= 30 && r.allStrings && / \/ \d+$/.test(r.missions), 'stats page model');
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'no errors: ' + errs.join('\n'));
});
