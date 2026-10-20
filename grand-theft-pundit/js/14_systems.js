/* 14_systems.js: systems track (PLAN_V03.md "systems"): the rest of GTA as simulation plus events; the UI draws.
 *
 * GTP.Systems = {
 *   properties  safehouses (save points, sleep, interiors gated by ownership) and businesses (income per game day)
 *   stocks      the parity tickers: an hourly random walk on the systems' own rng plus each ticker's `reacts` on mission:complete
 *   golf        Goldplate Links: the parity holes (tee / pin in metres from the course door), aim, a two-press power meter,
 *               clubs, wind, lies, hazards, green fee, scorecard; hud() feeds the UI's golf panel
 *   achievements the parity list with its `trigger`s (mission, anyMission, flag, stat, event); unlock(id) -> `achievement`
 *   stats()     the flat stats model plus `sections` (the page the UI's phone draws)
 *   cheats      the parity codes, typed on the keyboard (own keydown listener) or entered with cheats.enter(code)
 *   jobs        Damage Control and Hot Take Brigade: parked job vehicles, E while stopped starts a level run
 *   wardrobe    Lanyard & Co. and the Clip Joint purchase logic (player.look.outfit / hair, then Render.rebuildEntityMesh)
 *   serialize() / deserialize(json)   GTP.SaveRegistry entries (sys_*); a load-only SaveHook reads v3 saves' data.systems
 * }
 *
 * Data: GTP.Content.parity (25_content_parity.js, read lazily: it loads after this file). Wrappers installed at load
 * (docs/v03/systems.md): Missions.update (Systems.update after it), Missions.init (Systems.reset after it),
 * Player.prototype.control (frozen during golf), Interiors.enter (a safehouse needs owning). Minimap: Systems.markers().
 * Randomness: GTP.rng.fork(0x5157) per new game (its state saved), never Math.random.
 */
(function () {
  var GTP = window.GTP = window.GTP || {};
  var U = GTP.util;

  // ------------------------------------------------------------------ helpers --
  function game() { return GTP.game || null; }
  function player() { var g = game(); return g ? g.player : null; }
  function W() { return GTP.World; }
  function emit(name, payload) { if (GTP.Events) GTP.Events.emit(name, payload || {}); }
  function toast(t) { if (t && GTP.UI && GTP.UI.toast) { try { GTP.UI.toast(t); } catch (e) { /* ui optional */ } } }
  function sfx(name, gain) { var p = player(); if (GTP.Audio && GTP.Audio.play) { try { GTP.Audio.play(name, { x: p ? p.x : 0, z: p ? p.z : 0, gain: gain == null ? 0.8 : gain }); } catch (e) { /* audio optional */ } } }
  function fx(o) { if (GTP.Render && GTP.Render.fx && GTP.Render.fx.add) { try { GTP.Render.fx.add(o); } catch (e) { /* fx optional */ } } }
  function report(e, where) { if (U && U.reportError) U.reportError(e, where); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, az, bx, bz) { var dx = bx - ax, dz = bz - az; return Math.sqrt(dx * dx + dz * dz); }
  function money(n) { return U && U.fmtMoney ? U.fmtMoney(n) : '$' + Math.round(n); }
  function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function yawDir(yaw) { return { x: -Math.sin(yaw), z: -Math.cos(yaw) }; }          // yaw 0 faces -z (ARCHITECTURE §2)
  function dirYaw(x, z) { return Math.atan2(-x, -z); }
  function P() { return (GTP.Content && GTP.Content.parity) || {}; }
  function missions() { return GTP.Missions || null; }
  function flags() { var M = missions(); return M && M.state ? (M.state.flags || (M.state.flags = {})) : {}; }
  function completed() { var M = missions(); return M && M.state && M.state.completed ? M.state.completed : null; }
  function missionDone(id) { var c = completed(); return !!(c && c.has && c.has(id)); }
  function inMission() { var M = missions(); return !!(M && M.state && M.state.active); }
  function inStrand() { var S = GTP.Strands; try { return !!(S && S.active && S.active()); } catch (e) { return false; } }
  function inInterior() { return !!(GTP.Interiors && GTP.Interiors.active); }
  function playing() { var g = game(); return !!(g && g.state === 'playing'); }
  function wanted() { var p = player(); return p ? (p.wanted | 0) : 0; }
  function copy(o) { return JSON.parse(JSON.stringify(o == null ? null : o)); }
  function pick(list) { return Array.isArray(list) ? (list.length ? list[Math.floor(rnd() * list.length)] : null) : list; }
  function ok(extra) { return Object.assign({ ok: true }, extra || {}); }
  function no(reason, extra) { return Object.assign({ ok: false, reason: reason }, extra || {}); }
  // a content table as an array: arrays pass through, {id: def} maps get their ids
  function asList(src) {
    if (!src) return [];
    if (Array.isArray(src)) return src.filter(Boolean);
    if (typeof src === 'object') { var out = []; for (var k in src) if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) out.push(Object.assign({ id: k }, src[k])); return out; }
    return [];
  }
  function charge(p, price, kind) {
    p.money -= price;
    if (p.stats) p.stats.spent = (p.stats.spent || 0) + price;
    S.stats.spent[kind] = (S.stats.spent[kind] || 0) + price;
  }

  var R = null;   // the systems' own random stream (forked per new game, saved)
  function rnd() { if (!R) R = GTP.rng && GTP.rng.fork ? GTP.rng.fork(0x5157) : GTP.rng; return R.random(); }
  function rrange(a, b) { return a + (b - a) * rnd(); }
  function gauss() { var u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v); }

  function lmById(id) { var Wd = W(); if (!id || !Wd || !Wd.landmark) return null; try { return Wd.landmark(id) || null; } catch (e) { return null; } }
  function groundY(x, z) { var Wd = W(); try { var y = Wd && Wd.heightAt ? Wd.heightAt(x, z, 0) : 0; return y > -1 ? y : 0; } catch (e) { return 0; } }
  function blockedFoot(x, z) {
    var Wd = W(), T = Wd && Wd.T; if (!T || !Wd.tileAt) return false;
    var t = Wd.tileAt(x, z);
    return t === T.BUILDING || t === T.WATER || t === T.VOID || t === T.ROAD || t === T.HIGHWAY || (Wd.solidAt && Wd.solidAt(x, z, 0.5));
  }
  // where a landmark-anchored thing stands: the landmark's door plus an offset, else the `near` landmark's door plus its
  // offset; an offset point in a building or on a road snaps to the nearest sidewalk (on-foot markers)
  function landmarkPoint(def) {
    var Wd = W(), ids = [def.landmark, def.near];
    for (var i = 0; i < ids.length; i++) {
      var lm = lmById(ids[i]); if (!lm) continue;
      var base = lm.door || lm, off = (i === 0 ? def.offset : (def.nearOffset || { x: 7, z: 0 })) || { x: 0, z: 0 };
      var x = base.x + (off.x || 0), z = base.z + (off.z || 0);
      if ((off.x || off.z) && blockedFoot(x, z) && Wd.nearestSidewalkPoint) { var sp = Wd.nearestSidewalkPoint(x, z); if (sp) { x = sp.x; z = sp.z; } }
      return { x: x, z: z, y: groundY(x, z), landmark: ids[i], real: i === 0 };
    }
    return def.at ? { x: def.at.x, z: def.at.z, y: def.at.y || 0, real: false } : null;
  }
  // a drive-in spot for a landmark: a road point 7..18 m from its door (clear of the mission light on the sidewalk)
  function roadSpot(id) {
    var Wd = W(), lm = lmById(id); if (!lm || !Wd.nearestRoadPoint) return null;
    var d = lm.door || lm, T = Wd.T || {}, best = null, bd = Infinity;
    [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12], [16, 8], [-16, -8]].forEach(function (o) {
      var rp = Wd.nearestRoadPoint(d.x + o[0], d.z + o[1]); if (!rp) return;
      var dd = dist(rp.x, rp.z, d.x, d.z), tt = Wd.tileAt ? Wd.tileAt(rp.x, rp.z) : T.ROAD;
      if (dd < 7 || dd > 18 || tt === T.HIGHWAY || tt === T.RAMP || tt === T.BRIDGE) return;
      var score = Math.abs(dd - 10); if (score < bd) { bd = score; best = rp; }
    });
    if (!best) best = Wd.nearestRoadPoint(d.x, d.z);
    return best ? { x: best.x, z: best.z, y: best.y || 0 } : null;
  }

  // ===================================================== built-in tables ==
  // Only what GTP.Content.parity does not carry: golf clubs and physics lines, the stand-in anchors for the safehouses
  // until the world track's landmarks exist, the cheat effects and the job tuning parity leaves out.
  var CLUBS = [
    { id: 'driver', name: 'Driver', carry: 130, loft: 0.24 },
    { id: 'iron', name: '7 Iron', carry: 85, loft: 0.42 },
    { id: 'wedge', name: 'Wedge', carry: 45, loft: 0.82 },
    { id: 'putter', name: 'Putter', carry: 26, loft: 0 }
  ];
  var GOLF_LINES = {
    water: 'Splash. The pond is named after the chairman, so technically you hit him.',
    ob: 'Out of bounds. The ball has left the discourse.',
    sand: 'Bunker. It is gold-flecked, which does not help.'
  };
  var SAFE_NEAR = { safe_brownstone: 'char_charter', safe_marina_loft: 'velvetine_pier', safe_suburb: 'culdesac_gas', safe_penthouse: 'goldplate_tower', safe_dorm: 'pod_garage' };
  var EFFECT_ALIAS = { big_heads: 'bigheads', low_gravity: 'moonjump', cycle_weather: 'weather', golden_hour: 'clock', slow_motion: 'slowmo' };
  var TOGGLE_EFFECTS = { bigheads: 1, moonjump: 1, slowmo: 1, gold_everything: 1 };
  var RESPECT_LINES = ['Respectfully, no.', 'Respectfully, you\'re peaking.', 'Respectfully, read the room.', 'Respectfully, that\'s a ten.', 'Respectfully, is this paid?', 'Respectfully, didn\'t read.'];
  var GOLD = '#e8b53a';
  var JOB_TUNING = { capacity: 3, pickupRadius: 7, dropRadius: 12, douseTime: 2.5, parkRadius: 9, between: 3, offFoot: 12, maxRescue: 8, maxDouse: 6 };

  // ============================================================== state ==
  var S = null;   // all saved state lives here (see blank())
  function blank() {
    return {
      properties: { owned: {}, bought: 0, income: 0, lastDay: null, log: [] },
      stocks: { prices: {}, history: {}, holdings: {}, trades: 0, realized: 0, lastHour: null, news: [], reacted: {} },
      golf: { rounds: 0, best: null, bestToPar: null, birdies: 0, aces: 0, eagles: 0, holesPlayed: 0, underPar: 0, lastCard: null },
      achievements: { unlocked: {} },
      cheats: { found: {}, used: 0, on: {} },
      jobs: { best: {}, clients: 0, fires: 0, earned: 0, done: {}, runs: 0, rewards: {} },
      wardrobe: { owned: {}, equipped: {}, hair: null, hairColor: null, bought: 0, haircuts: 0, outfits: 0, spent: 0 },
      stats: { moneyPeak: 0, systemsEarned: 0, spent: {}, shops: {}, maxed: {}, escapes: 0, peakStars: 0 }
    };
  }
  S = blank();

  var Systems = GTP.Systems = {
    version: 2,
    get state() { return S; }
  };

  // ============================================================ properties ==
  var props = {
    defs: function () {
      return asList(P().properties).map(function (d) {
        var safe = d.kind === 'safehouse' || !!d.save;
        return Object.assign({ price: 0, income: 0, garage: 0 }, d, {
          kind: safe ? 'safehouse' : (d.kind || 'business'),
          near: d.near || SAFE_NEAR[d.id] || null,
          offset: d.offset || (safe ? null : { x: 5, z: 0 }),
          start: !!(d.start || d.owned === true || (d.price | 0) === 0)
        });
      });
    },
    def: function (id) { var L = props.defs(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; },
    get: function (id) { var L = props.list(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; },
    point: function (id) { var d = typeof id === 'string' ? props.def(id) : id; return d ? landmarkPoint(d) : null; },
    owned: function (id) { return !!S.properties.owned[id]; },
    owns: function (id) { return !!S.properties.owned[id]; },
    lockReason: function (d) {
      if (d.unlock && d.unlock.mission && !missionDone(d.unlock.mission)) return 'mission';
      if (d.unlock && d.unlock.flag && !flags()[d.unlock.flag]) return 'flag';
      return null;
    },
    list: function () {
      var p = player();
      return props.defs().map(function (d) {
        var pt = props.point(d), lock = props.lockReason(d), own = props.owned(d.id);
        return Object.assign({}, d, { x: pt ? pt.x : null, z: pt ? pt.z : null, owned: own, locked: !!lock, lockReason: lock,
          canBuy: !own && !lock && !!p && p.money >= (d.price | 0) });
      });
    },
    ownedList: function () { return props.defs().filter(function (d) { return props.owned(d.id); }); },
    // the property a landmark id (a safehouse interior's store) belongs to
    byLandmark: function (lmId) { var L = props.defs(); for (var i = 0; i < L.length; i++) if (L[i].id === lmId || L[i].landmark === lmId) return L[i]; return null; },
    buy: function (id) {
      var d = props.def(id), p = player();
      if (!d) return no('unknown');
      if (props.owned(id)) return no('owned');
      var lock = props.lockReason(d); if (lock) return no('locked', { lockReason: lock });
      if (!p) return no('noplayer');
      if (inMission()) return no('mission');
      var price = d.price | 0;
      if (p.money < price) return no('funds', { need: price - p.money });
      charge(p, price, 'properties');
      S.properties.owned[id] = { day: dayNow(), price: price };
      S.properties.bought++;
      emit('property:buy', { id: id, name: d.name, price: price, kind: d.kind });
      emit('shop:buy', { item: id, price: price, kind: 'property' });
      toast((d.kind === 'safehouse' ? 'Safehouse bought: ' : 'Property bought: ') + d.name);
      sfx('cash', 0.8);
      markersDirty = true;
      checkAchievements();
      return ok({ price: price });
    },
    // an owned safehouse saves the game (the active slot, else slot 1)
    save: function (id, opts) {
      var d = props.def(id), g = game();
      if (!d || d.kind !== 'safehouse') return no('notsafehouse');
      if (!props.owned(id)) return no('notowned');
      if (inMission()) return no('mission');
      if (wanted() > 0) return no('wanted');
      if (!g || !g.saveSlot) return no('nosave');
      var saved = false;
      try { saved = !!g.saveSlot(g.activeSlot || 1, { reason: 'safehouse', quiet: !!(opts && opts.quiet) }); } catch (e) { report(e, 'systems.save'); }
      emit('property:save', { id: id, ok: saved });
      if (saved && !(opts && opts.quiet)) toast('Saved at ' + d.name);
      return saved ? ok() : no('failed');
    },
    // sleep in a safehouse: six game hours pass (income and the market catch up), health refills, then save
    sleep: function (id, hours) {
      var d = props.def(id), g = game(), p = player();
      if (!d || d.kind !== 'safehouse') return no('notsafehouse');
      if (!props.owned(id)) return no('notowned');
      if (inMission()) return no('mission');
      if (wanted() > 0) return no('wanted');
      if (g && g.time) {
        g.time.clock += hours == null ? 6 : hours;
        while (g.time.clock >= 24) { g.time.clock -= 24; g.time.day++; }
        if (GTP.Render && GTP.Render.updateEnvironment) { try { GTP.Render.updateEnvironment(g.time.clock); } catch (e) { /* render optional */ } }
      }
      if (p) p.hp = p.maxHp;
      tickClock();
      emit('property:sleep', { id: id });
      return props.save(id);
    },
    // game days of income for every owned business; returns the total
    payDay: function (days) {
      var p = player(), total = 0, items = [], n = Math.max(1, days | 0);
      props.ownedList().forEach(function (d) {
        var amt = (d.income | 0) * n;
        if (amt > 0) { total += amt; items.push({ id: d.id, name: d.name, amount: amt }); }
      });
      if (total > 0 && p) {
        p.money += total; S.properties.income += total; S.stats.systemsEarned += total;
        S.properties.log.unshift({ day: dayNow(), total: total }); if (S.properties.log.length > 14) S.properties.log.length = 14;
        emit('property:income', { total: total, days: n, items: items });
        toast('Property income: +' + money(total));
      }
      return total;
    },
    nearest: function (x, z, kind) {
      var best = null, bd = Infinity;
      props.list().forEach(function (d) { if (kind && d.kind !== kind) return; if (d.x == null) return; var dd = dist(x, z, d.x, d.z); if (dd < bd) { bd = dd; best = d; } });
      return best ? Object.assign({ dist: bd }, best) : null;
    }
  };
  // property:open {id, ..., handled}: the UI's property card listens (GTP.UI.openProperty); a listener may also set
  // handled = true. With neither, a sale shows a toast so the systems work without the UI track.
  function openProperty(id) {
    var d = props.def(id); if (!d) return;
    var own = props.owned(id), uiHandles = !!(GTP.UI && typeof GTP.UI.openProperty === 'function');
    var payload = { id: id, name: d.name, kind: d.kind, owned: own, price: d.price | 0, income: d.income | 0, handled: uiHandles, locked: !!props.lockReason(d) };
    emit('property:open', payload);
    if (payload.handled) return;
    if (!own) toast(d.name + ': for sale, ' + money(d.price) + (payload.locked ? ' (not yet available)' : ''));
    else toast(d.name + ': yours. ' + money(d.income) + ' a day.');
  }
  function saveAtSafehouse(id) {
    var d = props.def(id), r = props.save(id);
    if (!r.ok) toast(d.name + ': ' + (r.reason === 'wanted' ? 'lose the heat before you save.' : r.reason === 'mission' ? 'finish the mission first.' : 'could not save.'));
  }

  // =============================================================== stocks ==
  var stocks = {
    defs: function () {
      return asList(P().stocks).map(function (d) { return Object.assign({ vol: 0.025, drift: 0, price: 20 }, d, { ticker: d.ticker || d.symbol || d.id }); });
    },
    // {missionId: {TICKER: fraction}} from every ticker's `reacts` (plus parity.stockReactions when present)
    reactions: function () {
      var out = {}, extra = P().stockReactions || {};
      stocks.defs().forEach(function (d) { for (var m in (d.reacts || {})) { (out[m] = out[m] || {})[d.ticker] = +d.reacts[m]; } });
      for (var m in extra) for (var t in extra[m]) (out[m] = out[m] || {})[t] = +extra[m][t];
      return out;
    },
    def: function (t) { var L = stocks.defs(); for (var i = 0; i < L.length; i++) if (L[i].ticker === t) return L[i]; return null; },
    ensure: function () {
      stocks.defs().forEach(function (d) {
        if (S.stocks.prices[d.ticker] == null) S.stocks.prices[d.ticker] = +d.price;
        if (!S.stocks.history[d.ticker]) S.stocks.history[d.ticker] = [+S.stocks.prices[d.ticker]];
      });
    },
    price: function (t) { stocks.ensure(); var v = S.stocks.prices[t]; return v == null ? null : v; },
    quote: function (t) {
      var d = stocks.def(t); if (!d) return null;
      var px = stocks.price(t), h = S.stocks.history[t] || [px], open = h.length > 24 ? h[h.length - 25] : h[0], hold = S.stocks.holdings[t] || { qty: 0, cost: 0 };
      return { id: t, ticker: t, symbol: t, name: d.name, flavor: d.flavor, price: px, change: open ? (px - open) / open : 0, history: h.slice(-48),
        qty: hold.qty, shares: hold.qty, cost: hold.cost, value: hold.qty * px, avg: hold.qty ? hold.cost / hold.qty : 0, gain: hold.qty * px - hold.cost };
    },
    list: function () { return stocks.defs().map(function (d) { return stocks.quote(d.ticker); }); },
    history: function (t) { stocks.ensure(); return (S.stocks.history[t] || []).slice(); },
    app: function () { return P().stockApp || { name: 'Take Exchange', fee: 10 }; },
    // the broker's cut on a trade of `value` dollars: stockApp.fee below 1 is a fraction (at least $1), else flat dollars
    fee: function (value) { var f = stocks.app().fee; f = f == null ? 10 : +f; return f < 1 ? Math.max(1, Math.ceil((value || 0) * f)) : Math.round(f); },
    buy: function (t, qty) {
      var d = stocks.def(t), p = player(); qty = Math.floor(+qty || 0);
      if (!d) return no('unknown');
      if (qty <= 0) return no('qty');
      if (!p) return no('noplayer');
      var px = stocks.price(t), gross = px * qty, cost = Math.ceil(gross + stocks.fee(gross));   // whole dollars: saves keep money an integer
      if (p.money < cost) return no('funds', { need: cost - p.money });
      p.money -= cost;
      var h = S.stocks.holdings[t] || (S.stocks.holdings[t] = { qty: 0, cost: 0 });
      h.qty += qty; h.cost += cost;   // the basis includes the buy fee
      S.stocks.trades++;
      emit('stocks:trade', { ticker: t, side: 'buy', qty: qty, price: px, total: cost });
      sfx('cash', 0.5);
      checkAchievements();
      return ok({ qty: qty, price: px, total: cost });
    },
    sell: function (t, qty) {
      var d = stocks.def(t), p = player(), h = S.stocks.holdings[t];
      if (!d) return no('unknown');
      if (!h || h.qty <= 0) return no('none');
      qty = qty == null ? h.qty : Math.floor(+qty);
      if (!(qty > 0) || qty > h.qty) return no('shares');
      var px = stocks.price(t), basis = h.cost * (qty / h.qty), gross = px * qty, net = Math.max(0, Math.floor(gross - stocks.fee(gross)));
      h.qty -= qty; h.cost -= basis; if (h.qty <= 0) { h.qty = 0; h.cost = 0; }
      if (p) p.money += net;
      var gain = net - basis;
      S.stocks.realized += gain; S.stocks.trades++;
      if (gain > 0) S.stats.systemsEarned += gain;
      emit('stocks:trade', { ticker: t, side: 'sell', qty: qty, price: px, total: net, gain: gain });
      sfx('cash', 0.5);
      checkAchievements();
      return ok({ qty: qty, price: px, total: net, gain: gain });
    },
    portfolio: function () {
      var rows = [], value = 0, cost = 0;
      for (var t in S.stocks.holdings) { var h = S.stocks.holdings[t]; if (!h || h.qty <= 0) continue; var px = stocks.price(t); if (px == null) continue; rows.push({ ticker: t, qty: h.qty, cost: h.cost, value: h.qty * px, gain: h.qty * px - h.cost }); value += h.qty * px; cost += h.cost; }
      return { rows: rows, value: value, cost: cost, gain: value - cost, realized: S.stocks.realized, trades: S.stocks.trades };
    },
    // game hours of the random walk for every ticker
    tick: function (hours) {
      stocks.ensure();
      var n = Math.max(1, hours | 0), defs = stocks.defs();
      for (var k = 0; k < n; k++) {
        for (var i = 0; i < defs.length; i++) {
          var d = defs[i], t = d.ticker, px = S.stocks.prices[t];
          var step = (d.drift || 0) / 24 + (d.vol || 0.02) / Math.sqrt(24) * gauss();
          // a soft pull back toward the listing price so a long session never drifts to zero or the moon
          var anchor = +d.price || px; step += 0.004 * Math.log(anchor / px);
          px = clamp(px * Math.exp(step), 0.01, 1e6);
          S.stocks.prices[t] = Math.round(px * 100) / 100 || 0.01;
          var h = S.stocks.history[t]; h.push(S.stocks.prices[t]); if (h.length > 96) h.splice(0, h.length - 96);
        }
      }
      emit('stocks:tick', { hours: n });
    },
    shock: function (t, frac, headline) {
      stocks.ensure();
      if (S.stocks.prices[t] == null) return false;
      var px = Math.max(0.01, S.stocks.prices[t] * (1 + frac));
      S.stocks.prices[t] = Math.round(px * 100) / 100 || 0.01;
      S.stocks.history[t].push(S.stocks.prices[t]);
      S.stocks.news.unshift({ ticker: t, change: frac, headline: headline || null, day: dayNow() });
      if (S.stocks.news.length > 20) S.stocks.news.length = 20;
      return true;
    },
    react: function (missionId) {
      if (!missionId || S.stocks.reacted[missionId]) return null;
      var r = stocks.reactions()[missionId]; if (!r) return null;
      S.stocks.reacted[missionId] = true;
      var moved = [];
      for (var t in r) if (stocks.shock(t, +r[t], missionId)) moved.push({ ticker: t, change: +r[t] });
      if (moved.length) {
        emit('stocks:news', { mission: missionId, moves: moved });
        var top = moved.slice().sort(function (a, b) { return Math.abs(b.change) - Math.abs(a.change); })[0];
        toast('Markets: ' + top.ticker + ' ' + (top.change >= 0 ? '+' : '') + Math.round(top.change * 100) + '%');
      }
      return moved;
    },
    news: function () { return S.stocks.news.slice(); }
  };

  // ================================================================= golf ==
  var golfRun = null;   // the round in progress (not saved: a round ends on save / load)
  var golfMeshes = null;
  var GOLF = { g: 9.8, windK: 0.22, cupR: 0.45, cupSpeed: 3.6, greenR: 11, fairwayHalf: 8, obMargin: 10, meterPeriod: 1.6, aimRate: 1.1,
    roll: { tee: 2.4, fairway: 2.4, green: 1.3, rough: 6, sand: 14 }, bounce: { tee: 0.3, fairway: 0.3, green: 0.22, rough: 0.18, sand: 0.04 } };
  function golfCfg() { var g = P().golf; return g && !Array.isArray(g) ? g : { holes: asList(g) }; }
  var golf = {
    config: golfCfg,
    course: function () {
      var cfg = golfCfg(), lm = lmById(cfg.landmark || 'goldplate_links'), name = cfg.course || cfg.name || (lm && lm.name) || 'Goldplate Links';
      if (lm) return { x0: lm.x - lm.w / 2, z0: lm.z - lm.d / 2, x1: lm.x + lm.w / 2, z1: lm.z + lm.d / 2, lm: lm, door: lm.door || lm, name: name };
      return { x0: 516, z0: 92, x1: 556, z1: 272, lm: null, door: { x: 554, z: 178 }, name: name };
    },
    clubs: function () { var c = asList(golfCfg().clubs); return c.length ? c : CLUBS; },
    // a hole point: a World point on the course landmark (tee1 / pin1, hole1_tee, h1_tee, tee_1) wins; else content
    // {x, z} in metres from the course door (absolute when the golf table says `absolute`), or {u, v} in course space
    resolve: function (pt, c, holeNo, which) {
      var lm = c.lm, names = [which + holeNo, 'hole' + holeNo + '_' + which, 'h' + holeNo + '_' + which, which + '_' + holeNo];
      if (lm && lm.points && holeNo) for (var i = 0; i < names.length; i++) if (lm.points[names[i]]) return { x: lm.points[names[i]].x, z: lm.points[names[i]].z };
      if (pt && pt.x != null && pt.z != null) return golfCfg().absolute ? { x: pt.x, z: pt.z } : { x: c.door.x + pt.x, z: c.door.z + pt.z };
      var u = pt && pt.u != null ? pt.u : 0.5, v = pt && pt.v != null ? pt.v : 0.5;
      if (c.x1 - c.x0 >= c.z1 - c.z0) return { x: c.x0 + v * (c.x1 - c.x0), z: c.z0 + u * (c.z1 - c.z0) };
      return { x: c.x0 + u * (c.x1 - c.x0), z: c.z0 + v * (c.z1 - c.z0) };
    },
    // content hazards are names ('bunker', 'water', 'ribbon', 'hedge', 'helicopter', 'ramp'): bunkers and ponds become
    // circles the ball plays (a bunker short of the green, a pond across the middle), the rest are gags the HUD may draw
    placeHazards: function (list, tee, pin, c) {
      var dx = pin.x - tee.x, dz = pin.z - tee.z, L = Math.sqrt(dx * dx + dz * dz) || 1, ux = dx / L, uz = dz / L, sx = -uz, sz = ux, nb = 0;
      return (list || []).map(function (h, i) {
        if (h && typeof h === 'object') { var p0 = golf.resolve(h, c, 0, 'hz'); return { kind: h.kind || 'sand', x: p0.x, z: p0.z, r: h.r || 4, name: h.name || h.kind }; }
        var k = String(h);
        if (k === 'bunker' || k === 'sand') { var side = (nb++ % 2) ? -1 : 1, a = Math.max(4, L - 14); return { kind: 'sand', name: k, x: tee.x + ux * a + sx * 6 * side, z: tee.z + uz * a + sz * 6 * side, r: 4 }; }
        if (k === 'water' || k === 'pond') return { kind: 'water', name: k, x: tee.x + ux * L * 0.5 + sx * 3, z: tee.z + uz * L * 0.5 + sz * 3, r: Math.min(5, L * 0.12) };
        return { kind: 'gag', name: k, x: tee.x + ux * L * (0.3 + 0.15 * i), z: tee.z + uz * L * (0.3 + 0.15 * i), r: 0 };
      });
    },
    holes: function () {
      var c = golf.course(), cfg = golfCfg();
      return asList(cfg.holes).slice(0, 9).map(function (h, i) {
        var tee = golf.resolve(h.tee, c, i + 1, 'tee'), pin = golf.resolve(h.pin, c, i + 1, 'pin');
        return { index: i, number: h.hole || i + 1, id: h.id || ('hole' + (i + 1)), name: h.name || ('Hole ' + (i + 1)), par: h.par || 3, displayPar: h.displayPar || cfg.displayPar || null,
          tee: tee, pin: pin, hazards: golf.placeHazards(h.hazards, tee, pin, c), gag: h.gag || null,
          wind: h.wind != null ? h.wind : (cfg.windMax != null ? cfg.windMax * 0.6 : 3), length: Math.round(dist(tee.x, tee.z, pin.x, pin.z)) };
      });
    },
    fee: function () { return golfCfg().greenFee | 0; },
    get active() { return !!golfRun; },
    canStart: function () {
      var p = player();
      if (golfRun) return 'active';
      if (!golf.holes().length) return 'nocourse';
      if (!p || !p.alive) return 'noplayer';
      if (p.inVehicle) return 'vehicle';
      if (inMission()) return 'mission';
      if (inStrand() || job) return 'busy';
      if (wanted() > 0) return 'wanted';
      if (p.money < golf.fee()) return 'funds';
      return null;
    },
    start: function (opts) {
      opts = opts || {};
      var why = opts.force ? (golf.holes().length ? null : 'nocourse') : golf.canStart();
      if (why) return no(why, why === 'funds' ? { need: golf.fee() } : null);
      var p = player(), fee = opts.force ? 0 : golf.fee();
      if (fee && p) { charge(p, fee, 'golf'); emit('shop:buy', { item: 'golf_green_fee', price: fee, kind: 'golf' }); }
      var holes = golf.holes(), first = clamp(opts.hole | 0, 0, holes.length - 1), cfg = golfCfg();
      golfRun = { holes: holes, hole: first, card: [], strokes: 0, phase: 'aim', ball: null, prev: null, aim: 0, club: 0, power: 0, meter: 0, meterT: 0,
        wind: { speed: 0, dir: 0 }, message: null, last: null, single: !!opts.single, t: 0 };
      golf._setupHole();
      var h0 = holes[first];
      emit('golf:start', { hole: first + 1, index: first, holes: holes.length, par: h0.par, displayPar: h0.displayPar, course: golf.course().name, fee: fee,
        wind: copy(golfRun.wind), club: golf.clubs()[golfRun.club].name, dist: h0.length });
      toast((cfg.course || 'Goldplate Links') + (fee ? ': green fee ' + money(fee) + '.' : '.') + (h0.displayPar ? ' Every hole is a par ' + h0.displayPar + ', says the sign.' : ''));
      return ok({ fee: fee });
    },
    _setupHole: function () {
      var r = golfRun, h = r.holes[r.hole], g0 = groundY(h.tee.x, h.tee.z), wmax = golfCfg().windMax || 12;
      r.strokes = 0; r.phase = 'aim'; r.power = 0; r.meter = 0;
      r.ball = { x: h.tee.x, y: g0, z: h.tee.z, vx: 0, vy: 0, vz: 0, lie: 'tee', ground: g0 };
      r.prev = { x: h.tee.x, z: h.tee.z, lie: 'tee' };
      r.aim = dirYaw(h.pin.x - h.tee.x, h.pin.z - h.tee.z);
      r.wind = { speed: Math.round(clamp(h.wind * (0.6 + 0.8 * rnd()), 0, wmax) * 10) / 10, dir: rrange(-Math.PI, Math.PI) };
      r.club = golf.autoClub(h.length, 'tee');
      r.message = h.gag || null;
      golf._placePlayer();
      golf._syncMeshes();
    },
    autoClub: function (d, lie) {
      var cl = golf.clubs();
      if (lie === 'green' || (lie !== 'sand' && d < (lie === 'rough' ? 7 : 16))) return cl.length - 1;
      if (lie === 'sand' && d < 30) return Math.max(0, cl.length - 2);
      for (var i = cl.length - 2; i >= 0; i--) if (cl[i].carry >= d * 0.95) return i;
      return 0;
    },
    // the ball's lie: the painted hazards, then the green (its circle is lawn whatever the tile under the pin), then the
    // real sea and streets, then fairway or rough
    lieAt: function (x, z) {
      var r = golfRun, h = r.holes[r.hole], c = golf.course();
      if (x < c.x0 - GOLF.obMargin || x > c.x1 + GOLF.obMargin || z < c.z0 - GOLF.obMargin || z > c.z1 + GOLF.obMargin) return 'ob';
      for (var i = 0; i < h.hazards.length; i++) { var hz = h.hazards[i]; if (hz.r > 0 && hz.kind !== 'gag' && dist(x, z, hz.x, hz.z) <= hz.r) return hz.kind === 'water' ? 'water' : 'sand'; }
      if (dist(x, z, h.pin.x, h.pin.z) <= GOLF.greenR) return 'green';
      var Wd = W(), T = Wd && Wd.T;
      if (T && Wd.tileAt) {
        var tt = Wd.tileAt(x, z);
        if (tt === T.WATER) return 'water';
        if (tt === T.ROAD || tt === T.BUILDING || tt === T.HIGHWAY || tt === T.VOID || tt === T.RAMP) return 'ob';
      }
      var ax = h.tee.x, az = h.tee.z, bx = h.pin.x - ax, bz = h.pin.z - az, L2 = bx * bx + bz * bz || 1;
      var t = clamp(((x - ax) * bx + (z - az) * bz) / L2, 0, 1), px = ax + bx * t, pz = az + bz * t;
      return dist(x, z, px, pz) <= GOLF.fairwayHalf ? 'fairway' : 'rough';
    },
    aimBy: function (da) { if (golfRun && golfRun.phase === 'aim') { golfRun.aim = wrapAngle(golfRun.aim + da); golf._placePlayer(); } },
    setAim: function (yaw) { if (golfRun && golfRun.phase === 'aim') { golfRun.aim = wrapAngle(yaw); golf._placePlayer(); } },
    aimAtPin: function () { if (!golfRun) return; var h = golfRun.holes[golfRun.hole], b = golfRun.ball; golf.setAim(dirYaw(h.pin.x - b.x, h.pin.z - b.z)); },
    selectClub: function (dirOrId) {
      if (!golfRun || golfRun.phase !== 'aim') return null;
      var cl = golf.clubs();
      if (typeof dirOrId === 'string') { for (var i = 0; i < cl.length; i++) if (cl[i].id === dirOrId) golfRun.club = i; }
      else golfRun.club = (golfRun.club + (dirOrId || 1) + cl.length) % cl.length;
      return cl[golfRun.club].id;
    },
    // the two-press swing: the first press starts the meter, the second locks the power and hits
    press: function () {
      var r = golfRun; if (!r) return false;
      if (r.phase === 'aim') { r.phase = 'swing'; r.meterT = 0; r.meter = 0; return true; }
      if (r.phase === 'swing') { golf.shoot(r.meter); return true; }
      if (r.phase === 'holed') { golf.next(); return true; }
      return false;
    },
    // hit the ball with power 0..1 along the aim (or `angle`, a yaw); flight runs in update()
    shoot: function (power, angle) {
      var r = golfRun; if (!r || (r.phase !== 'aim' && r.phase !== 'swing')) return false;
      var b = r.ball, cl = golf.clubs()[r.club];
      if (angle != null) r.aim = wrapAngle(angle);
      power = clamp(power == null || isNaN(+power) ? 0.8 : +power, 0.02, 1);
      // a miss-hit: the deviation grows with power and a bad lie, on the systems' seeded stream
      var lieK = b.lie === 'rough' ? 1.6 : b.lie === 'sand' ? 2.6 : b.lie === 'green' ? 0.25 : 1;
      var dev = gauss() * 0.035 * lieK * (0.4 + power * power);
      var yaw = r.aim + dev, dir = yawDir(yaw);
      var carry = cl.carry * power * (b.lie === 'rough' ? 0.82 : b.lie === 'sand' ? 0.6 : 1);
      r.prev = { x: b.x, z: b.z, lie: b.lie };
      r.strokes++;
      r.phase = 'flight'; r.power = power; r.t = 0;
      b.loft = cl.loft || 0; b.bounced = false;
      if (!cl.loft) {
        var v0 = Math.sqrt(2 * GOLF.roll.green * carry);   // the putter: a pure roll that stops at `carry` on the green
        b.vx = dir.x * v0; b.vz = dir.z * v0; b.vy = 0; b.rolling = true;
      } else {
        var v = Math.sqrt(carry * GOLF.g / Math.sin(2 * cl.loft));
        b.vx = dir.x * v * Math.cos(cl.loft); b.vz = dir.z * v * Math.cos(cl.loft); b.vy = v * Math.sin(cl.loft); b.rolling = false;
      }
      r.last = { power: power, angle: yaw, club: cl.id, from: { x: r.prev.x, z: r.prev.z } };
      emit('golf:shot', { power: power, angle: yaw, club: cl.id, hole: r.hole + 1, index: r.hole, stroke: r.strokes });
      sfx(cl.loft ? 'golf_swing' : 'golf_putt', 0.8);
      return true;
    },
    _stepBall: function (dt) {
      var r = golfRun, h = r.holes[r.hole], b = r.ball;
      r.t += dt;
      if (!b.rolling) {
        b.vx += Math.sin(r.wind.dir) * -r.wind.speed * GOLF.windK * dt; b.vz += Math.cos(r.wind.dir) * -r.wind.speed * GOLF.windK * dt;
        b.vy -= GOLF.g * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        if (b.y <= b.ground) {
          b.y = b.ground;
          var lie = golf.lieAt(b.x, b.z);
          if (lie === 'water' || lie === 'ob') return golf._penalty(lie);
          var k = GOLF.bounce[lie] == null ? 0.25 : GOLF.bounce[lie];
          // backspin: the first bounce keeps less of the run the higher the loft (a wedge checks up, a driver runs out)
          var keep = b.bounced ? 0.6 : clamp(0.55 - (b.loft || 0) * 0.3, 0.2, 0.55);
          if (Math.abs(b.vy) * k > 1.2) { b.vy = -b.vy * k; b.vx *= keep; b.vz *= keep; b.bounced = true; }
          else { b.vy = 0; b.rolling = true; b.vx *= lie === 'sand' ? 0.15 : 0.45; b.vz *= lie === 'sand' ? 0.15 : 0.45; }
        }
        if (r.t > 20) b.rolling = true;
        return;
      }
      // rolling: friction by lie; the cup catches a slow enough ball passing over it
      var lie2 = golf.lieAt(b.x, b.z);
      if (lie2 === 'water' || lie2 === 'ob') return golf._penalty(lie2);
      var sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz), dec = (GOLF.roll[lie2] || 3) * dt;
      var ox = b.x, oz = b.z;
      if (sp <= dec || sp < 0.05) { b.vx = 0; b.vz = 0; }
      else { var f = (sp - dec) / sp; b.vx *= f; b.vz *= f; b.x += b.vx * dt; b.z += b.vz * dt; }
      var sx = b.x - ox, sz = b.z - oz, L2 = sx * sx + sz * sz, tt = L2 > 0 ? clamp(((h.pin.x - ox) * sx + (h.pin.z - oz) * sz) / L2, 0, 1) : 0;
      var cd = dist(ox + sx * tt, oz + sz * tt, h.pin.x, h.pin.z);
      if (cd <= GOLF.cupR && sp <= GOLF.cupSpeed) { b.x = h.pin.x; b.z = h.pin.z; b.vx = b.vz = 0; return golf._holed(); }
      b.lie = lie2;
      if (b.vx === 0 && b.vz === 0) golf._rest();
    },
    _penalty: function (kind) {
      var r = golfRun, b = r.ball;
      r.strokes++;
      b.x = r.prev.x; b.z = r.prev.z; b.y = b.ground; b.vx = b.vy = b.vz = 0; b.rolling = false; b.lie = r.prev.lie;
      r.message = GOLF_LINES[kind];
      emit('golf:penalty', { kind: kind, hole: r.hole + 1, index: r.hole, strokes: r.strokes });
      golf._afterShot();
    },
    _rest: function () {
      var r = golfRun, b = r.ball, h = r.holes[r.hole], caddy = golfCfg().caddy;
      b.rolling = false;
      r.message = b.lie === 'sand' ? GOLF_LINES.sand : (caddy && caddy.lines && rnd() < 0.35 ? (caddy.name ? caddy.name + ': ' : '') + pick(caddy.lines) : null);
      emit('golf:rest', { hole: r.hole + 1, index: r.hole, lie: b.lie, dist: dist(b.x, b.z, h.pin.x, h.pin.z), strokes: r.strokes });
      golf._afterShot();
    },
    _afterShot: function () {
      var r = golfRun, h = r.holes[r.hole], b = r.ball;
      if (r.strokes >= h.par + 4) { r.strokes = h.par + 4; return golf._holed(true); }   // picked up after par + 4
      r.phase = 'aim'; r.meter = 0;
      r.aim = dirYaw(h.pin.x - b.x, h.pin.z - b.z);
      r.club = golf.autoClub(dist(b.x, b.z, h.pin.x, h.pin.z), b.lie);
      golf._placePlayer();
    },
    scoreName: function (strokes, par) {
      if (strokes === 1) return 'Hole in One';
      var d = strokes - par, names = golfCfg().scoreNames;
      if (names && names[String(d)]) return names[String(d)];
      return d <= -3 ? 'Albatross' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double Bogey' : '+' + d;
    },
    _holed: function (pickedUp) {
      var r = golfRun, h = r.holes[r.hole], name = pickedUp ? 'Picked Up' : golf.scoreName(r.strokes, h.par);
      r.card[r.hole] = { hole: r.hole + 1, index: r.hole, par: h.par, strokes: r.strokes, name: name };
      r.phase = 'holed';
      S.golf.holesPlayed++;
      if (!pickedUp) {
        if (r.strokes === 1) S.golf.aces++;
        if (r.strokes - h.par === -1) S.golf.birdies++;
        if (r.strokes - h.par <= -2 && r.strokes > 1) S.golf.eagles++;
      }
      r.message = name + '.';
      emit('golf:hole', { hole: r.hole + 1, index: r.hole, strokes: r.strokes, par: h.par, name: name, pickedUp: !!pickedUp });
      sfx('cash', 0.4);
      checkAchievements();
    },
    // after a holed ball: the next hole, or the end of the round
    next: function () {
      var r = golfRun; if (!r || r.phase !== 'holed') return false;
      if (r.single || r.hole >= r.holes.length - 1) return golf.end('done');
      r.hole++;
      golf._setupHole();
      var h = r.holes[r.hole];
      emit('golf:holeStart', { hole: r.hole + 1, index: r.hole, par: h.par });
      // the UI's panel continues on a second golf:start (it keeps its running total)
      emit('golf:start', { hole: r.hole + 1, index: r.hole, holes: r.holes.length, par: h.par, displayPar: h.displayPar, course: golf.course().name, wind: copy(r.wind),
        club: golf.clubs()[r.club].name, dist: h.length, total: golf.hud().total, next: true });
      return true;
    },
    end: function (reason) {
      var r = golfRun; if (!r) return false;
      var played = r.card.filter(Boolean), strokes = 0, par = 0;
      played.forEach(function (c) { strokes += c.strokes; par += c.par; });
      var full = played.length === r.holes.length && reason === 'done';
      if (full) {
        S.golf.rounds++;
        if (S.golf.best == null || strokes < S.golf.best) S.golf.best = strokes;
        var tp = strokes - par;
        if (S.golf.bestToPar == null || tp < S.golf.bestToPar) S.golf.bestToPar = tp;
        if (tp < 0) S.golf.underPar++;
        // the clubhouse pays $100 a stroke under par, at most $500 a round
        var p = player(); if (tp < 0 && p) { var prize = Math.min(5, -tp) * 100; p.money += prize; S.stats.systemsEarned += prize; toast('Under par: +' + money(prize)); }
      }
      S.golf.lastCard = { card: played, strokes: strokes, par: par, full: full };
      golfRun = null;
      golf._dropMeshes();
      disarmNear();
      var p2 = player(); if (p2 && p2.intent) { p2.intent.x = 0; p2.intent.z = 0; }
      emit('golf:end', { strokes: strokes, par: par, toPar: strokes - par, holes: played.length, full: full, reason: reason || 'quit', card: played });
      checkAchievements();
      return true;
    },
    quit: function () { return golf.end('quit'); },
    // play the current shot out instantly (tests, a skip button)
    settle: function (maxSeconds) {
      if (!golfRun) return null;
      var n = Math.round((maxSeconds || 30) * 60);
      for (var i = 0; i < n && golfRun && golfRun.phase === 'flight'; i++) golf._stepBall(1 / 60);
      if (golfRun) golf._syncMeshes();
      return golf.state();
    },
    update: function (dt) {
      var r = golfRun; if (!r) return;
      var p = player();
      if (!p || !p.alive || p.inVehicle || wanted() > 0 || inMission()) { golf.end('interrupted'); return; }
      var In = GTP.Input, g = game();
      if (In && g && g.state === 'playing' && !(GTP.UI && GTP.UI.modal && GTP.UI.modal())) {
        if (r.phase === 'aim') {
          if (In.down('left')) golf.aimBy(GOLF.aimRate * dt);
          if (In.down('right')) golf.aimBy(-GOLF.aimRate * dt);
          if (In.pressed('forward')) golf.selectClub(-1);
          if (In.pressed('back') && !In.pressed('cancel')) golf.selectClub(1);
        }
        if (In.pressed('enter') && !In.pressed('confirm')) { golf.quit(); return; }   // F quits; Enter is also `confirm`, which swings
        if (In.pressed('jump') || In.pressed('shoot') || In.pressed('confirm')) golf.press();
      }
      if (r.phase === 'swing') {
        // the meter climbs to full and falls back over meterPeriod; three periods without a second press hit what it shows
        r.meterT += dt;
        var ph = (r.meterT / GOLF.meterPeriod) % 1;
        r.meter = ph < 0.5 ? ph * 2 : 2 - ph * 2;
        if (r.meterT > GOLF.meterPeriod * 3) golf.shoot(Math.max(0.05, r.meter));
      } else if (r.phase === 'flight') {
        golf._stepBall(dt);
        golf._syncMeshes();
      }
      if (golfRun) golf._placePlayer();
    },
    _placePlayer: function () {
      var r = golfRun, p = player(); if (!r || !p || r.phase === 'flight') return;
      var b = r.ball, d = yawDir(r.aim);
      var px = b.x - d.x * 0.9 + d.z * 0.35, pz = b.z - d.z * 0.9 - d.x * 0.35;
      var jump = dist(p.x, p.z, px, pz) > 3;
      p.x = px; p.z = pz; p.y = groundY(px, pz); p.vx = p.vz = 0; p.yaw = r.aim; p.moveYaw = r.aim; p.aimYaw = r.aim;
      if (p.snap) { try { p.snap(); } catch (e) { /* entity optional */ } }
      var Rd = GTP.Render; if (Rd && Rd.rig && r.phase === 'aim') { Rd.rig.yaw = r.aim; if (jump && Rd.rig.snap) { try { Rd.rig.snap(); } catch (e) { /* render optional */ } } }   // walked to the ball: no long camera glide
    },
    _syncMeshes: function () {
      var r = golfRun, Rd = GTP.Render, T = window.THREE;
      if (!r || !Rd || !Rd.scene || !T) return;
      try {
        if (!golfMeshes) {
          golfMeshes = { ball: new T.Mesh(new T.SphereGeometry(0.11, 10, 8), new T.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.4 })), flag: new T.Group() };
          var pole = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 2.4, 6), new T.MeshStandardMaterial({ color: 0xe8e8e8 }));
          pole.position.y = 1.2;
          var cloth = new T.Mesh(new T.PlaneGeometry(0.7, 0.45), new T.MeshStandardMaterial({ color: 0xffd400, side: T.DoubleSide, emissive: 0x332a00 }));
          cloth.position.set(0.35, 2.15, 0);
          golfMeshes.flag.add(pole); golfMeshes.flag.add(cloth);
          Rd.scene.add(golfMeshes.ball); Rd.scene.add(golfMeshes.flag);
        }
        var h = r.holes[r.hole];
        golfMeshes.ball.position.set(r.ball.x, r.ball.y + 0.11, r.ball.z);
        golfMeshes.flag.position.set(h.pin.x, groundY(h.pin.x, h.pin.z), h.pin.z);
      } catch (e) { report(e, 'golf.mesh'); }
    },
    _dropMeshes: function () {
      if (!golfMeshes) return;
      try { [golfMeshes.ball, golfMeshes.flag].forEach(function (m) { if (m.parent) m.parent.remove(m); m.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }); } catch (e) { /* render optional */ }
      golfMeshes = null;
    },
    // the full simulation state (tests, a top-down hole view)
    state: function () {
      var r = golfRun;
      if (!r) return { active: false, rounds: S.golf.rounds, best: S.golf.best, bestToPar: S.golf.bestToPar, lastCard: S.golf.lastCard };
      var h = r.holes[r.hole], b = r.ball, cl = golf.clubs(), total = 0, par = 0;
      r.card.forEach(function (c) { if (c) { total += c.strokes; par += c.par; } });
      return { active: true, phase: r.phase, hole: r.hole, number: r.hole + 1, holes: r.holes.length, name: h.name, par: h.par, displayPar: h.displayPar, length: h.length, strokes: r.strokes,
        ball: { x: b.x, y: b.y, z: b.z, lie: b.lie }, pin: { x: h.pin.x, z: h.pin.z }, tee: { x: h.tee.x, z: h.tee.z }, hazards: h.hazards, gag: h.gag,
        aim: r.aim, club: cl[r.club].id, clubName: cl[r.club].name, clubCarry: cl[r.club].carry, clubs: cl.map(function (c) { return c.id; }),
        meter: r.meter, power: r.power, wind: { speed: r.wind.speed, dir: r.wind.dir }, distToPin: dist(b.x, b.z, h.pin.x, h.pin.z),
        card: r.card.filter(Boolean), total: total, totalPar: par, message: r.message, last: r.last, course: golf.course().name };
    },
    // the UI's golf panel (11_ui.js golfHud): reporting `power` tells the UI this module owns the swing meter and input
    hud: function () {
      var r = golfRun; if (!r) return null;
      var h = r.holes[r.hole], b = r.ball, cl = golf.clubs()[r.club], total = 0;
      r.card.forEach(function (c) { if (c) total += c.strokes; });
      var toPin = dirYaw(h.pin.x - b.x, h.pin.z - b.z);
      return { hole: r.hole + 1, holes: r.holes.length, par: h.par, displayPar: h.displayPar, name: h.name, strokes: r.strokes, total: total,
        wind: { speed: r.wind.speed, dir: r.wind.dir }, club: cl.name, dist: dist(b.x, b.z, h.pin.x, h.pin.z), lie: b.lie,
        phase: r.phase === 'holed' ? 'aim' : r.phase, power: r.phase === 'swing' ? r.meter : r.phase === 'flight' ? r.power : 0, angle: -wrapAngle(r.aim - toPin), message: r.message };
    }
  };

  // ========================================================= achievements ==
  // parity entries carry `trigger`: {mission}, {anyMission: [...]}, {flag}, {stat, count}, or {event, ...fields that must
  // match the payload}; {stat, goal} works too. Event triggers listen from the first reset on.
  var GTE_KEYS = { stars: 1, holes: 1, score: 1, level: 1, count: 1 };
  var achEvents = {}, achEventHits = {};
  var achievements = {
    defs: function () {
      return asList(P().achievements).map(function (d) {
        var t = d.trigger || d.condition || (d.stat ? { stat: d.stat, count: d.goal } : {});
        return Object.assign({}, d, { trigger: t, hidden: !!(d.hidden || d.secret) });
      });
    },
    def: function (id) { var L = achievements.defs(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; },
    unlocked: function (id) { return !!S.achievements.unlocked[id]; },
    list: function () {
      var st = statModel();
      return achievements.defs().map(function (d) {
        var u = S.achievements.unlocked[d.id], t = d.trigger || {}, goal = t.count != null ? t.count : t.goal, have = t.stat && st[t.stat] != null ? st[t.stat] : 0;
        return { id: d.id, name: d.name, desc: d.desc, hidden: d.hidden, unlocked: !!u, at: u ? u.at : null,
          progress: u ? 1 : (t.stat && goal ? clamp(have / goal, 0, 1) : 0), stat: t.stat || null, goal: goal == null ? null : goal };
      });
    },
    count: function () { return Object.keys(S.achievements.unlocked).length; }
  };
  function unlock(id) {
    var d = achievements.def(id);
    if (!d || S.achievements.unlocked[id]) return false;
    var g = game();
    S.achievements.unlocked[id] = { at: g ? Math.round(g.playTime || 0) : 0, day: dayNow() };
    emit('achievement', { id: id, name: d.name, desc: d.desc });
    return true;
  }
  function triggerMet(t, st) {
    if (!t) return false;
    if (t.mission) return missionDone(t.mission);
    if (t.anyMission) return t.anyMission.some(missionDone);
    if (t.allMissions) return t.allMissions.every(missionDone);
    if (t.flag) return !!flags()[t.flag];
    if (t.stat) { var n = t.count != null ? t.count : (t.goal != null ? t.goal : (t.gte != null ? t.gte : 1)); return (st[t.stat] || 0) >= n; }
    return false;
  }
  function payloadMatches(t, e) {
    for (var k in t) {
      if (k === 'event') continue;
      var want = t[k], have = e ? e[k] : undefined;
      if (GTE_KEYS[k] && typeof want === 'number') { if (!(+have >= want)) return false; }
      else if (have !== want) return false;
    }
    return true;
  }
  function listenAchievementEvents() {
    if (!GTP.Events || !GTP.Events.on) return;
    achievements.defs().forEach(function (d) {
      var ev = d.trigger && d.trigger.event; if (!ev || achEvents[ev]) return;
      achEvents[ev] = true;
      GTP.Events.on(ev, function (e) {
        try { achievements.defs().forEach(function (a) { if (a.trigger && a.trigger.event === ev && !S.achievements.unlocked[a.id] && payloadMatches(a.trigger, e)) unlock(a.id); }); }
        catch (err) { report(err, 'systems.achievementEvent'); }
      });
    });
  }
  var achT = 0;
  function checkAchievements() {
    var defs = achievements.defs(), st = null;
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      if (S.achievements.unlocked[d.id] || !d.trigger || d.trigger.event) continue;
      if (d.trigger.stat && !st) st = statModel();
      if (triggerMet(d.trigger, st || {})) unlock(d.id);
    }
  }

  // ================================================================ stats ==
  function dayNow() { var g = game(); return g && g.time ? g.time.day : 1; }
  function statModel() {
    var p = player(), ps = (p && p.stats) || {}, g = game(), out = {};
    for (var k in ps) if (typeof ps[k] === 'number') out[k] = ps[k];
    var pf = stocks.portfolio(), held = 0, weapons = 0;
    for (var t in S.stocks.holdings) if (S.stocks.holdings[t] && S.stocks.holdings[t].qty > 0) held++;
    if (p && p.weapons) for (var w in p.weapons) if (w !== 'fist' && p.weapons[w] > 0) weapons++;
    var defs = props.defs(), owned = props.ownedList(), c = completed();
    out.missions = Math.max(out.missions || 0, c ? (c.size || 0) : 0);
    out.money = p ? (p.money | 0) : 0;
    out.moneyPeak = Math.max(S.stats.moneyPeak || 0, out.money);
    out.subs = p ? (p.subs | 0) : 0;
    out.playTime = g ? Math.round(g.playTime || 0) : 0;
    out.day = dayNow();
    out.distanceTotal = Math.round((ps.distance || 0) + (ps.distanceDriven || 0));
    out.weaponsOwned = weapons;
    out.shopsVisited = Object.keys(S.stats.shops).length;
    out.maxedCars = Object.keys(S.stats.maxed).length;
    out.wantedEscapes = S.stats.escapes || 0;
    out.propertiesOwned = owned.length;
    out.propertiesBought = S.properties.bought;
    out.propertiesAll = defs.length && owned.length >= defs.length ? 1 : 0;
    out.propertyIncome = S.properties.income;
    out.dailyIncome = owned.reduce(function (a, d) { return a + (d.income | 0); }, 0);
    out.stockTrades = S.stocks.trades;
    out.stockProfit = Math.round(S.stocks.realized);
    out.portfolioValue = Math.round(pf.value);
    out.stocksHeld = held;
    out.golfRounds = S.golf.rounds;
    out.golfBest = S.golf.best;
    out.golfBestToPar = S.golf.bestToPar;
    out.golfBirdies = S.golf.birdies;
    out.golfAces = S.golf.aces;
    out.golfEagles = S.golf.eagles;
    out.golfHoles = S.golf.holesPlayed;
    out.golfUnderPar = S.golf.underPar;
    out.dcBestLevel = S.jobs.best.damage_control || 0;
    out.htbBestLevel = S.jobs.best.hot_take_brigade || 0;
    out.dcClients = S.jobs.clients;
    out.htbFires = S.jobs.fires;
    out.jobEarnings = S.jobs.earned;
    out.cheatsUsed = S.cheats.used;
    out.cheatsFound = Object.keys(S.cheats.found).length;
    out.outfitsBought = S.wardrobe.bought;
    out.haircuts = S.wardrobe.haircuts;
    out.achievements = Object.keys(S.achievements.unlocked).length;
    out.achievementsTotal = achievements.defs().length;
    out.systemsEarned = Math.round(S.stats.systemsEarned);
    return out;
  }
  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m'; }
  function fmtPlay(s) { var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h + 'h ' + (m < 10 ? '0' : '') + m + 'm'; }
  function statsPage(st) {
    st = st || statModel();
    var M = missions(), total = 0;
    try { total = (M && M.allMissions ? M.allMissions().length : 0) || 0; } catch (e) { total = 0; }
    function row(label, value, raw) { return { label: label, value: String(value), raw: raw == null ? value : raw }; }
    var acc = st.shots ? Math.round(100 * (st.hits || 0) / st.shots) + '%' : '-';
    var tp = st.golfBestToPar == null ? '' : ' (' + (st.golfBestToPar === 0 ? 'E' : (st.golfBestToPar > 0 ? '+' : '') + st.golfBestToPar) + ')';
    return [
      { id: 'career', title: 'Career', rows: [
        row('Missions passed', st.missions + (total ? ' / ' + total : ''), st.missions), row('Subscribers', st.subs), row('Days in Grievance City', st.day),
        row('Play time', fmtPlay(st.playTime), st.playTime), row('Achievements', st.achievements + ' / ' + st.achievementsTotal, st.achievements),
        row('Mission retries', st.retries || 0)] },
      { id: 'money', title: 'Money', rows: [
        row('Cash', money(st.money), st.money), row('Most cash held', money(st.moneyPeak), st.moneyPeak), row('Spent', money(st.spent || 0), st.spent || 0),
        row('Properties owned', st.propertiesOwned), row('Daily property income', money(st.dailyIncome), st.dailyIncome), row('Property income collected', money(st.propertyIncome), st.propertyIncome),
        row('Portfolio value', money(st.portfolioValue), st.portfolioValue), row('Stock profit (realized)', money(st.stockProfit), st.stockProfit), row('Trades', st.stockTrades),
        row('Job earnings', money(st.jobEarnings), st.jobEarnings)] },
      { id: 'combat', title: 'Discourse', rows: [
        row('Shots fired', st.shots || 0), row('Accuracy', acc, st.shots ? (st.hits || 0) / st.shots : 0), row('Headshots', st.headshots || 0),
        row('Knockouts', st.kills || 0), row('Weapons owned', st.weaponsOwned), row('Hot takes thrown', st.hottakes || 0),
        row('Times ratio\'d', st.deaths || 0), row('Times deplatformed', st.busted || 0), row('Wanted levels escaped', st.wantedEscapes)] },
      { id: 'travel', title: 'Getting Around', rows: [
        row('Distance on foot', fmtDist(st.distance || 0), st.distance || 0), row('Distance driven', fmtDist(st.distanceDriven || 0), st.distanceDriven || 0),
        row('Vehicles borrowed', st.vehiclesStolen || 0), row('Cars fully modded', st.maxedCars), row('Crashes', st.crashes || 0), row('Props flattened', st.propsKnocked || 0), row('Jumps', st.jumps || 0)] },
      { id: 'leisure', title: 'Leisure', rows: [
        row('Golf rounds', st.golfRounds), row('Best round', st.golfBest == null ? '-' : st.golfBest + tp, st.golfBest),
        row('Birdies', st.golfBirdies), row('Holes in one', st.golfAces), row('Clothes bought', st.outfitsBought), row('Haircuts', st.haircuts),
        row('Shops visited', st.shopsVisited), row('Cheats entered', st.cheatsUsed)] },
      { id: 'jobs', title: 'Jobs', rows: [
        row('Damage Control best level', st.dcBestLevel), row('Patients delivered', st.dcClients), row('Hot Take Brigade best level', st.htbBestLevel), row('Flame wars put out', st.htbFires)] }
    ];
  }
  // the UI reads `sections`; achievements and tests read the numbers
  function stats() { var st = statModel(); st.sections = statsPage(st); return st; }

  // =============================================================== cheats ==
  var cheatBuf = '';
  var cheatDefsCache = null, cheatDefsT = -1;
  var cheats = {
    defs: function () {
      return asList(P().cheats).map(function (d) {
        var code = String(d.code || d.id || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), eff = EFFECT_ALIAS[d.effect] || d.effect || 'toast';
        return Object.assign({}, d, { id: d.id || code.toLowerCase(), code: code, effect: eff, toggle: !!TOGGLE_EFFECTS[eff] });
      });
    },
    list: function () { return cheats.defs().map(function (d) { return { id: d.id, name: d.name, desc: d.desc || d.toast || '', found: !!S.cheats.found[d.id], on: !!S.cheats.on[d.id], toggle: d.toggle, code: S.cheats.found[d.id] ? d.code : null }; }); },
    isOn: function (id) { return !!S.cheats.on[id]; },
    enter: function (code) {
      code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      var defs = cheats.defs();
      for (var i = 0; i < defs.length; i++) if (defs[i].code === code) return cheats.activate(defs[i].id);
      return false;
    },
    // a typed character (the keydown listener); true when it completed a code
    type: function (ch) {
      cheatBuf = (cheatBuf + String(ch).toUpperCase()).slice(-24);
      var defs = cheats.defs();
      for (var i = 0; i < defs.length; i++) {
        var c = defs[i].code;
        if (c.length >= 4 && cheatBuf.length >= c.length && cheatBuf.slice(-c.length) === c) { cheatBuf = ''; return cheats.activate(defs[i].id); }
      }
      return false;
    },
    activate: function (id) {
      var d = null, defs = cheats.defs();
      for (var i = 0; i < defs.length; i++) if (defs[i].id === id) d = defs[i];
      if (!d) return false;
      var on = d.toggle ? !S.cheats.on[id] : true;
      if (d.toggle) { if (on) S.cheats.on[id] = true; else delete S.cheats.on[id]; }
      S.cheats.found[id] = true; S.cheats.used++;
      cheatDefsCache = null;
      try { applyCheat(d, on); } catch (e) { report(e, 'cheat ' + id); }
      emit('cheat', { id: id, name: d.name, effect: d.effect, on: on });
      toast(d.toggle && !on ? d.name + ': off' : (d.toast || ('Cheat: ' + d.name)));
      sfx('ui', 0.5);
      checkAchievements();
      return true;
    }
  };
  function applyCheat(d, on) {
    var g = game(), p = player(), E = GTP.Entities, eff = d.effect;
    if (eff === 'heal') { if (p) { p.hp = p.maxHp; p.armor = Math.max(p.armor || 0, 100); } }
    else if (eff === 'clear_wanted') {
      if (GTP.AI && GTP.AI.wanted && GTP.AI.wanted.clear) GTP.AI.wanted.clear();
      else if (g && g.debug && g.debug.setWanted) g.debug.setWanted(0);
      S.stats.peakStars = 0;   // a cheat is not an escape
    }
    else if (eff === 'money') { if (p) p.money += d.amount != null ? (d.amount | 0) : 250; }
    else if (eff === 'spawn_vehicle') {
      if (p && g && g.debug && g.debug.spawnVehicle && W().nearestRoadPoint) {
        var f = yawDir(p.yaw || 0), rp = W().nearestRoadPoint(p.x + f.x * 8, p.z + f.z * 8), v = null;
        try { v = g.debug.spawnVehicle(rp.x, rp.z, d.vehicle || 'sedan', { wrap: d.wrap, color: d.color }); } catch (e) { v = g.debug.spawnVehicle(rp.x, rp.z, d.vehicle || 'sedan', { color: d.color }); }
        if (v) v.tag = v.tag || 'sys_cheat';
      }
    }
    else if (eff === 'gold_everything') goldCars(on);
    else if (eff === 'clock') { if (g && g.debug && g.debug.setClock) g.debug.setClock(18.6); else if (g && g.time) g.time.clock = 18.6; }
    else if (eff === 'respectfully') {
      if (E && p && E.near) { var k = 0; E.near(p.x, p.z, 40).forEach(function (e) { if (e.kind === 'ped' && e.alive && e.speakLine) e.speakLine(RESPECT_LINES[k++ % RESPECT_LINES.length]); }); }
    }
    else if (eff === 'bigheads') applyBigHeads();
    else if (eff === 'weather') {
      var Wt = GTP.Render && GTP.Render.weather, order = ['clear', 'overcast', 'rain'];
      var cur = Wt && (Wt.target || Wt.state || Wt.current), nx = order[(order.indexOf(cur) + 1) % order.length] || 'rain';
      if (g && g.debug && g.debug.setWeather) g.debug.setWeather(nx, false);
    }
    else if (eff === 'slowmo') { if (g) g.timeScale = on ? 0.5 : 1; }
    // moonjump: tickCheats boosts each jump while on
  }
  // every car gold (and the ones that spawn while the cheat is on); off puts the old paint back
  function goldCars(on) {
    var E = GTP.Entities; if (!E || !E.list) return;
    for (var i = 0; i < E.list.length; i++) {
      var v = E.list[i]; if (v.kind !== 'vehicle' || v.wreck || v.exploded) continue;
      if (on && v.color !== GOLD) { if (v._sysColor == null) v._sysColor = v.color || null; v.color = GOLD; rebuildMesh(v); }
      else if (!on && v._sysColor !== undefined && v.color === GOLD) { v.color = v._sysColor; v._sysColor = undefined; rebuildMesh(v); }
    }
  }
  function applyBigHeads() {
    var E = GTP.Entities; if (!E || !E.list) return;
    var s = effectOn('bigheads') ? 2.1 : 1;
    for (var i = 0; i < E.list.length; i++) {
      var e = E.list[i]; if ((e.kind !== 'ped' && e.kind !== 'player') || !e.mesh || !e.mesh.getObjectByName) continue;
      if (e.mesh._sysHead === s) continue;
      var h = e.mesh.getObjectByName('head'); if (h) h.scale.set(s, s, s);
      e.mesh._sysHead = s;
    }
  }
  var jumpWas = false, bigWas = false, goldT = 0;
  function effectOn(eff) {
    var g = game(), st = g ? g.steps : 0;
    if (!cheatDefsCache || cheatDefsT !== st) { cheatDefsCache = cheats.defs(); cheatDefsT = st; }
    for (var i = 0; i < cheatDefsCache.length; i++) if (cheatDefsCache[i].effect === eff && S.cheats.on[cheatDefsCache[i].id]) return true;
    return false;
  }
  function tickCheats(dt) {
    var p = player(); if (!p) return;
    var any = bigWas; for (var k in S.cheats.on) { any = true; break; }
    if (!any) return;
    if (effectOn('moonjump')) {
      // the first step of a jump (Ped consumed wantJump: off the ground and rising): a much bigger push, once
      var rising = !p.onGround && p.vy > 2 && !p.inVehicle;
      if (rising && !jumpWas) p.vy *= 1.75;
      jumpWas = rising || (!p.onGround && p.vy > 0);
    }
    var big = effectOn('bigheads');
    if (big || bigWas) { applyBigHeads(); bigWas = big; }
    if (effectOn('gold_everything')) { goldT -= dt || 0; if (goldT <= 0) { goldT = 1; goldCars(true); } }
  }
  function onKey(e) {
    try {
      if (!e || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      var In = GTP.Input; if (In && In.text && In.text.capture) return;
      var g = game(); if (!g || (g.state !== 'playing' && g.state !== 'paused')) return;
      var k = e.key; if (!k || k.length !== 1 || !/[a-z0-9]/i.test(k)) return;
      cheats.type(k);
    } catch (err) { report(err, 'cheats.key'); }
  }
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('keydown', onKey, { passive: true });

  // ================================================================= jobs ==
  // Each job has a vehicle parked at `vehicle.parkedAt` (respawned when missing and the player is far); E (`action`) while
  // stopped in it starts a run, E again while stopped ends it. Level n has n calls (patients or flame wars).
  var job = null;          // the running job (not saved: a load or new game drops it)
  var jobCars = {};        // id -> the parked job vehicle
  var jobs = {
    defs: function () {
      return asList(P().jobs).map(function (d) {
        var douse = d.parody === 'firefighter' || d.kind === 'douse' || !!d.fires, timer = d.timer || {}, pay = d.pay || {};
        return Object.assign({}, d, {
          kind: douse ? 'douse' : 'rescue',
          vehicle: d.vehicle || { type: douse ? 'truck' : 'van', parkedAt: douse ? 'police_hq' : 'hospital' },
          dropOff: asArr(d.dropOff || d.deliver || 'hospital'),
          levels: d.levels || 12,
          timer: { base: timer.base != null ? timer.base : 40, perMetre: timer.perMetre != null ? timer.perMetre : 1 / 9, perCall: timer.perPatient != null ? timer.perPatient : (timer.perFire != null ? timer.perFire : 10) },
          pay: { perCall: pay.perPatient != null ? pay.perPatient : (pay.perFire != null ? pay.perFire : 50), perLevel: pay.perLevel != null ? pay.perLevel : 120 },
          calls: asList(d.patients || d.fires || []),
          sprayRange: d.sprayRange || 14,
          lines: d.lines || {},
          rewards: asList(d.rewards || [])
        });
      });
    },
    def: function (id) { var L = jobs.defs(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; },
    get active() { return job ? job.id : null; },
    vehicle: function (id) { return liveCar(jobCars[id]) ? jobCars[id] : null; },
    list: function () {
      return jobs.defs().map(function (d) {
        var v = jobs.vehicle(d.id), pt = v ? { x: v.x, z: v.z } : roadSpot(d.vehicle.parkedAt);
        return { id: d.id, name: d.name, kind: d.kind, best: S.jobs.best[d.id] || 0, done: !!S.jobs.done[d.id], levels: d.levels, start: d.start || null, x: pt ? pt.x : null, z: pt ? pt.z : null };
      });
    },
    canStart: function (id) {
      var p = player(), d = jobs.def(id);
      if (!d) return 'unknown';
      if (job) return 'active';
      if (!p || !p.alive) return 'noplayer';
      if (!vehicleOf(p)) return 'vehicle';
      if (inMission()) return 'mission';
      if (inStrand() || golfRun) return 'busy';
      return null;
    },
    start: function (id, opts) {
      var why = opts && opts.force ? (jobs.def(id) ? null : 'unknown') : jobs.canStart(id);
      if (why) return no(why);
      var d = jobs.def(id);
      job = { id: id, def: d, level: clamp((opts && opts.level) | 0 || 1, 1, d.levels), phase: 'between', t: 2, timer: 0, calls: [], aboard: 0, earned: 0, offT: 0, holdT: 0, message: d.rules || d.name };
      S.jobs.runs++;
      emit('job:start', { id: id, name: d.name, level: job.level, banner: d.banner || d.name });
      toast((d.banner || d.name) + ': level ' + job.level);
      return ok();
    },
    stop: function (reason) { if (!job) return false; endJob(reason || 'quit'); return true; },
    state: function () {
      if (!job) return { active: false, best: copy(S.jobs.best) };
      var d = job.def;
      return { active: true, id: job.id, name: d.name, banner: d.banner || d.name, kind: d.kind, phase: job.phase, level: job.level, levels: d.levels, timer: Math.max(0, job.timer), earned: job.earned,
        aboard: job.aboard, capacity: JOB_TUNING.capacity, remaining: job.calls.filter(function (c) { return c.state !== 'done'; }).length, total: job.calls.length,
        calls: job.calls.map(function (c) { return { x: c.x, z: c.z, state: c.state, name: c.name, douse: c.douse || 0 }; }),
        target: jobTarget(), message: job.message };
    },
    debug: {
      job: function () { return job; },
      cars: function () { return jobCars; },
      finishLevel: function () { if (!job || job.phase !== 'run') return false; job.calls.forEach(function (c) { if (c.state !== 'done') { c.state = 'done'; dropCall(c); if (job.def.kind === 'rescue') S.jobs.clients++; else S.jobs.fires++; } }); job.aboard = 0; levelComplete(); return true; }
    }
  };
  function asArr(x) { return Array.isArray(x) ? x : (x ? [x] : []); }
  function liveCar(v) { return !!(v && !v.wreck && !v.exploded && !v.sinking && GTP.Entities && GTP.Entities.list.indexOf(v) >= 0); }
  function vehicleOf(p) { return p && p.inVehicle ? (p.vehicle || (typeof p.inVehicle === 'object' ? p.inVehicle : null)) : null; }
  function speedOf(v) { if (!v) return 0; if (v.speed2d) { try { return v.speed2d(); } catch (e) { /* fallthrough */ } } return Math.abs(v.speed || 0); }
  // keep each job's vehicle parked at its spot while the player is within CAR_NEAR of it (once a second): spawned when
  // missing, never under the player's nose once one was wrecked; an unused parked one is cleared beyond CAR_FAR
  var CAR_NEAR = 220, CAR_FAR = 320, carT = 0, carSpots = {};
  function ensureJobCars(dt, force) {
    carT -= dt || 0; if (carT > 0 && !force) return; carT = 1;
    var g = game(), p = player(); if (!g || !g.debug || !g.debug.spawnVehicle || !p || inInterior()) return;
    jobs.defs().forEach(function (d) {
      var spot = carSpots[d.id] || (carSpots[d.id] = roadSpot(d.vehicle.parkedAt)); if (!spot) return;
      var cur = jobCars[d.id], dd = dist(p.x, p.z, spot.x, spot.z);
      if (liveCar(cur)) {
        if (!cur.driver && dist(p.x, p.z, cur.x, cur.z) > CAR_FAR && (!job || job.id !== d.id)) { try { GTP.Entities.remove(cur); } catch (e) { report(e, 'job.vehicleRemove'); } jobCars[d.id] = null; }
        return;
      }
      if (dd > CAR_NEAR) return;
      if (cur && dd < 120) return;   // a wrecked one comes back out of sight
      var v = null, o = { color: d.vehicle.color, tag: 'sys_job:' + d.id };
      try { v = g.debug.spawnVehicle(spot.x, spot.z, d.vehicle.type || 'van', Object.assign({ wrap: d.vehicle.wrap }, o)); }
      catch (e) { try { v = g.debug.spawnVehicle(spot.x, spot.z, d.vehicle.type || 'van', o); } catch (e2) { report(e2, 'job.vehicle'); } }
      if (!v) return;
      v.persistent = true; v.tag = 'sys_job:' + d.id; v.label = d.vehicle.label || d.name; v.sysJob = d.id;
      if (flags().damage_controlled && d.kind === 'rescue') { v.maxHp = (v.maxHp || v.hp) * 2; v.hp = v.maxHp; }   // the reward: the van has armor
      jobCars[d.id] = v;
    });
  }
  function jobPoint(minR, maxR, kind) {
    var p = player(), Wd = W(); if (!p || !Wd) return null;
    var T = Wd.T || {}, tries = 0;
    var tiles = null; try { tiles = Wd.tilesNear ? Wd.tilesNear(p.x, p.z, maxR, kind === 'sidewalk' ? 'sidewalk' : 'road') : null; } catch (e) { tiles = null; }
    while (tries++ < 40) {
      var x, z;
      if (tiles && tiles.length) { var ti = tiles[Math.floor(rnd() * tiles.length)], tw = Wd.w || 224; x = (ti % tw) * 4 + 2; z = Math.floor(ti / tw) * 4 + 2; }
      else { var a = rrange(-Math.PI, Math.PI), r = rrange(minR, maxR); x = p.x + Math.cos(a) * r; z = p.z + Math.sin(a) * r; }
      var d = dist(p.x, p.z, x, z); if (d < minR || d > maxR) continue;
      var tt = Wd.tileAt ? Wd.tileAt(x, z) : null;
      if (tt === T.WATER || tt === T.HIGHWAY || tt === T.RAMP || tt === T.BRIDGE || tt === T.BUILDING || tt === T.VOID) continue;
      var y = Wd.heightAt ? Wd.heightAt(x, z, 0) : 0; if (y < -0.5 || y > 2) continue;
      if (Wd.solidAt && Wd.solidAt(x, z, y + 0.5)) continue;
      return { x: x, z: z, y: y };
    }
    var a2 = rrange(-Math.PI, Math.PI), rp = Wd.nearestRoadPoint ? Wd.nearestRoadPoint(p.x + Math.cos(a2) * minR, p.z + Math.sin(a2) * minR) : null;   // never the world's own rng
    return rp ? { x: rp.x, z: rp.z, y: rp.y || 0 } : { x: p.x + 60, z: p.z, y: 0 };
  }
  // the nearest drop-off door (Goldplate Memorial or the Green Room Motel)
  function dropPoint(x, z) {
    if (!job) return null;
    var best = null, bd = Infinity;
    job.def.dropOff.forEach(function (id) { var lm = lmById(id); if (!lm) return; var d0 = lm.door || lm, dd = dist(x, z, d0.x, d0.z); if (dd < bd) { bd = dd; best = { x: d0.x, z: d0.z, id: id, name: lm.name }; } });
    return best;
  }
  function spawnCalls() {
    var d = job.def, p = player(), n = Math.min(job.level, d.kind === 'rescue' ? JOB_TUNING.maxRescue : JOB_TUNING.maxDouse), time = d.timer.base;
    job.calls = []; job.aboard = 0;
    for (var i = 0; i < n; i++) {
      var pt = jobPoint(60, 140 + job.level * 25, 'sidewalk'); if (!pt) continue;
      var who = pick(d.calls) || {};
      var c = { x: pt.x, z: pt.z, y: pt.y, state: 'waiting', holdT: 0, mesh: null, ped: null, douse: 0, fxT: 0, name: who.name || (d.kind === 'rescue' ? 'a patient' : 'a flame war'), line: who.line || null };
      var leg = dist(p.x, p.z, c.x, c.z);
      if (d.kind === 'rescue') {
        var dp = dropPoint(c.x, c.z); leg += dp ? dist(c.x, c.z, dp.x, dp.z) : 150;
        try { var g = game(); if (g && g.debug && g.debug.spawnPed) { c.ped = g.debug.spawnPed(c.x, c.z, null, 'civ'); if (c.ped) { c.ped.persistent = true; c.ped.tag = 'sys_patient'; if (c.ped.stop) c.ped.stop(); } } } catch (e) { report(e, 'job.spawnPed'); c.ped = null; }
      }
      time += leg * d.timer.perMetre + d.timer.perCall;
      c.mesh = markerAt(c.x, c.y, c.z, d.kind === 'rescue' ? 0x2fd6ff : 0xff7a20);
      job.calls.push(c);
    }
    job.timer = time;
    job.phase = 'run';
    var first = job.calls[0];
    job.message = first ? (first.line || ('Call: ' + first.name + '.')) : d.name;
    emit('job:level', { id: job.id, level: job.level, calls: job.calls.length, timer: job.timer });
  }
  function dropCall(c) {
    if (c.mesh) { unmarker(c.mesh); c.mesh = null; }
    if (c.ped) { try { if (GTP.Entities && GTP.Entities.remove && GTP.Entities.list.indexOf(c.ped) >= 0) GTP.Entities.remove(c.ped); } catch (e) { report(e, 'job.removePed'); } c.ped = null; }
  }
  function jobTarget() {
    if (!job || job.phase !== 'run') return null;
    var p = player(); if (!p) return null;
    if (job.def.kind === 'rescue' && job.aboard > 0 && (job.aboard >= JOB_TUNING.capacity || !job.calls.some(function (c) { return c.state === 'waiting'; }))) {
      var dp = dropPoint(p.x, p.z); return dp ? { x: dp.x, z: dp.z, kind: 'deliver', name: dp.name } : null;
    }
    var best = null, bd = Infinity;
    job.calls.forEach(function (c) { if (c.state !== 'waiting') return; var dd = dist(p.x, p.z, c.x, c.z); if (dd < bd) { bd = dd; best = c; } });
    return best ? { x: best.x, z: best.z, kind: job.def.kind === 'rescue' ? 'patient' : 'fire', dist: bd, name: best.name } : null;
  }
  function levelComplete() {
    var d = job.def, p = player(), pay = job.level * d.pay.perLevel;
    if (p) p.money += pay;
    job.earned += pay; S.jobs.earned += pay; S.stats.systemsEarned += pay;
    S.jobs.best[job.id] = Math.max(S.jobs.best[job.id] || 0, job.level);
    emit('job:levelComplete', { id: job.id, level: job.level, pay: pay });
    toast((pick(d.lines.levelUp) || 'Level complete.') + ' +' + money(pay));
    sfx('cash', 0.8);
    // the level rewards (money, a flag such as damage_controlled / fireproof), once per save
    d.rewards.forEach(function (rw) {
      var key = job.id + '@' + rw.level;
      if (rw.level !== job.level || S.jobs.rewards[key]) return;
      S.jobs.rewards[key] = true;
      if (rw.money && p) { p.money += rw.money; job.earned += rw.money; S.jobs.earned += rw.money; S.stats.systemsEarned += rw.money; }
      if (rw.flag) flags()[rw.flag] = true;
      emit('job:reward', { id: job.id, level: rw.level, money: rw.money || 0, flag: rw.flag || null, text: rw.text || null });
      if (rw.text) toast(rw.text);
    });
    checkAchievements();
    if (job.level >= d.levels) {
      if (!S.jobs.done[job.id]) {
        S.jobs.done[job.id] = true;
        emit('job:complete', { id: job.id });
        toast(pick(d.lines.complete));
      }
      endJob('complete');
      return;
    }
    job.level++; job.phase = 'between'; job.t = JOB_TUNING.between; job.message = pick(d.lines.levelUp);
  }
  function endJob(reason) {
    if (!job) return;
    var j = job; job = null;
    j.calls.forEach(dropCall);
    disarmNear();
    if (reason === 'timeout' || reason === 'lost' || reason === 'vehicle') toast(pick(j.def.lines.fail) || 'Job over.');
    emit('job:end', { id: j.id, reason: reason, level: j.level, best: S.jobs.best[j.id] || 0, earned: j.earned });
  }
  // E in a stopped job vehicle starts (or ends) its run
  function tickJobStart() {
    var p = player(), v = vehicleOf(p), In = GTP.Input;
    if (!v || !v.sysJob || !In || !In.pressed('action') || speedOf(v) > 1) return;
    if (GTP.UI && GTP.UI.modal && GTP.UI.modal()) return;
    if (job && job.id === v.sysJob) { jobs.stop('quit'); return; }
    var r = jobs.start(v.sysJob);
    if (!r.ok) toast(r.reason === 'mission' ? 'Finish the mission first.' : r.reason === 'busy' ? 'You are busy.' : 'Not now.');
  }
  function tickJob(dt) {
    if (!job) return;
    var p = player(), d = job.def;
    if (!p || !p.alive) return endJob('dead');
    if (inMission()) return endJob('mission');
    var v = vehicleOf(p);
    if (!v) { job.offT += dt; if (job.offT > JOB_TUNING.offFoot) return endJob('vehicle'); } else job.offT = 0;
    if (job.phase === 'between') { job.t -= dt; if (job.t <= 0) spawnCalls(); return; }
    if (job.phase !== 'run') return;
    job.timer -= dt;
    var spd = speedOf(v), i, c, In = GTP.Input;
    if (d.kind === 'rescue') {
      for (i = 0; i < job.calls.length; i++) {
        c = job.calls[i];
        if (c.state !== 'waiting') continue;
        if (c.ped) { if (!c.ped.alive) return endJob('lost'); c.x = c.ped.x; c.z = c.ped.z; if (c.mesh) c.mesh.position.set(c.x, c.ped.y || 0, c.z); }
        if (v && job.aboard < JOB_TUNING.capacity && spd < 3 && dist(v.x, v.z, c.x, c.z) < JOB_TUNING.pickupRadius) {
          c.holdT += dt;
          if (c.holdT >= 0.6) {
            c.state = 'aboard'; job.aboard++;
            if (c.ped && c.line && c.ped.speakLine) { try { c.ped.speakLine(c.line); } catch (e) { /* optional */ } }
            dropCall(c);
            job.message = c.line || ('Aboard: ' + c.name + '.');
            emit('job:pickup', { id: job.id, aboard: job.aboard, name: c.name, line: c.line });
          }
        } else c.holdT = 0;
      }
      var dp = v ? dropPoint(v.x, v.z) : null;
      if (v && job.aboard > 0 && dp && spd < 3 && dist(v.x, v.z, dp.x, dp.z) < JOB_TUNING.dropRadius) {
        job.holdT += dt;
        if (job.holdT >= 0.6) {
          var n = job.aboard, pay = n * d.pay.perCall;
          job.aboard = 0; job.holdT = 0;
          job.calls.forEach(function (cc) { if (cc.state === 'aboard') cc.state = 'done'; });
          S.jobs.clients += n;
          if (p) p.money += pay; job.earned += pay; S.jobs.earned += pay; S.stats.systemsEarned += pay;
          job.message = 'Delivered to ' + (dp.name || 'the hospital') + '. +' + money(pay);
          emit('job:deliver', { id: job.id, count: n, pay: pay, at: dp.id });
          checkAchievements();
        }
      } else job.holdT = 0;
    } else {
      var spraying = !!(v && In && In.down('shoot'));
      for (i = 0; i < job.calls.length; i++) {
        c = job.calls[i];
        if (c.state !== 'waiting') continue;
        c.fxT -= dt;
        var dd = dist(p.x, p.z, c.x, c.z);
        if (c.fxT <= 0 && dd < 140) { c.fxT = 0.12; fx({ type: 'fire', x: c.x + rrange(-1, 1), y: (c.y || 0) + 0.3, z: c.z + rrange(-1, 1) }); if (rnd() < 0.3) fx({ type: 'smoke', x: c.x, y: (c.y || 0) + 1.5, z: c.z }); }
        // hold shoot within sprayRange (the cooling foam), or park close for the slow way
        var inSpray = v && spraying && dist(v.x, v.z, c.x, c.z) <= d.sprayRange, parked = v && spd < 3 && dist(v.x, v.z, c.x, c.z) < JOB_TUNING.parkRadius;
        if (inSpray || parked) {
          c.douse += dt;
          if (inSpray && rnd() < 0.5) { var t = rnd(); fx({ type: 'puff', x: v.x + (c.x - v.x) * t, y: 1.4, z: v.z + (c.z - v.z) * t }); }
          if (c.douse >= JOB_TUNING.douseTime) {
            c.state = 'done'; dropCall(c); S.jobs.fires++;
            var pay2 = d.pay.perCall; if (p) p.money += pay2; job.earned += pay2; S.jobs.earned += pay2; S.stats.systemsEarned += pay2;
            job.message = 'Out: ' + c.name + '. +' + money(pay2);
            fx({ type: 'puff', x: c.x, y: (c.y || 0) + 1, z: c.z });
            emit('job:douse', { id: job.id, pay: pay2, name: c.name });
            checkAchievements();
          }
        } else c.douse = Math.max(0, c.douse - dt * 0.5);
      }
    }
    if (!job) return;
    if (job.calls.every(function (cc) { return cc.state === 'done'; })) return levelComplete();
    if (job.timer <= 0) return endJob('timeout');
  }

  // ============================================================= wardrobe ==
  // Lanyard & Co. items {id, slot, style, color, price}; implicit free "none" items for the hat and glasses slots;
  // outfits {id, price, items:{slot: itemId|null}}; the Clip Joint {styles:[{id, hair, price}], colors:[{id, hex|null, price}]}
  var NONE_ITEMS = [{ id: 'hat_none', slot: 'hat', style: 'none', name: 'No Hat', price: 0 }, { id: 'glasses_none', slot: 'glasses', style: 'none', name: 'No Glasses', price: 0 }];
  var wardrobe = {
    clothing: function () {
      var src = P().clothing, items = asList(src && !Array.isArray(src) ? src.items : src);
      items = items.map(function (d) { return Object.assign({ slot: 'top', price: 0 }, d); });
      NONE_ITEMS.forEach(function (n) { if (!items.some(function (d) { return d.id === n.id; })) items.push(n); });
      return items;
    },
    outfits: function () { var src = P().clothing; return asList(src && !Array.isArray(src) ? src.outfits : null); },
    barberData: function () {
      var b = P().barber || {};
      if (Array.isArray(b)) return { styles: b.filter(function (x) { return x.kind !== 'color'; }), colors: b.filter(function (x) { return x.kind === 'color'; }) };
      return { styles: asList(b.styles), colors: asList(b.colors) };
    },
    item: function (id) { var L = wardrobe.clothing(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; },
    lockReason: function (d) { if (d.unlock && d.unlock.mission && !missionDone(d.unlock.mission)) return 'mission'; return null; },
    owns: function (id) { var d = wardrobe.item(id); return !!S.wardrobe.owned[id] || !!(d && (d.price | 0) === 0); },
    items: function (slot, store) {
      var p = player();
      return wardrobe.clothing().filter(function (d) { return (!slot || d.slot === slot) && (!store || !(d.store || d.stores) || d.store === store || asArr(d.stores).indexOf(store) >= 0); }).map(function (d) {
        var lock = wardrobe.lockReason(d), own = wardrobe.owns(d.id);
        return Object.assign({}, d, { owned: own, equipped: S.wardrobe.equipped[d.slot] === d.id, locked: !!lock, lockReason: lock, canBuy: !lock && (own || (!!p && p.money >= (d.price | 0))) });
      });
    },
    slots: function () { var out = []; wardrobe.clothing().forEach(function (d) { if (out.indexOf(d.slot) < 0) out.push(d.slot); }); return out; },
    // buy (when not owned) and wear
    buy: function (id) {
      var d = wardrobe.item(id), p = player();
      if (!d) return no('unknown');
      if (!p) return no('noplayer');
      if (wardrobe.lockReason(d)) return no('locked');
      var price = d.price | 0, own = wardrobe.owns(id);
      if (!own) {
        if (p.money < price) return no('funds', { need: price - p.money });
        charge(p, price, 'clothing'); S.wardrobe.spent += price; S.wardrobe.bought++;
        S.wardrobe.owned[id] = true;
        emit('shop:buy', { item: id, price: price, kind: 'clothing' });
        emit('clothing:buy', { id: id, slot: d.slot, price: price });
        sfx('cash', 0.5);
      }
      wardrobe.equip(id);
      checkAchievements();
      return ok({ price: own ? 0 : price });
    },
    equip: function (id) {
      var d = wardrobe.item(id); if (!d || !wardrobe.owns(id)) return false;
      S.wardrobe.equipped[d.slot] = id;
      applyLook();
      emit('clothing:equip', { id: id, slot: d.slot });
      return true;
    },
    // an outfit: the bundle price unless every piece is owned already; then everything in it is worn
    buyOutfit: function (id) {
      var o = null, p = player(); wardrobe.outfits().forEach(function (x) { if (x.id === id) o = x; });
      if (!o) return no('unknown');
      if (!p) return no('noplayer');
      var pieces = o.items || {}, need = false, slot;
      for (slot in pieces) if (pieces[slot] && !wardrobe.owns(pieces[slot])) need = true;
      var price = need ? (o.price | 0) : 0;
      if (p.money < price) return no('funds', { need: price - p.money });
      if (price) { charge(p, price, 'clothing'); S.wardrobe.spent += price; }
      for (slot in pieces) {
        var it = pieces[slot] || (slot === 'hat' ? 'hat_none' : slot === 'glasses' ? 'glasses_none' : null);
        if (!it || !wardrobe.item(it)) continue;
        if (!wardrobe.owns(it)) { S.wardrobe.owned[it] = true; S.wardrobe.bought++; }
        S.wardrobe.equipped[slot] = it;
      }
      S.wardrobe.outfits++;
      applyLook();
      emit('shop:buy', { item: id, price: price, kind: 'outfit' });
      emit('clothing:buy', { id: id, outfit: true, price: price });
      if (price) sfx('cash', 0.5);
      checkAchievements();
      return ok({ price: price });
    },
    hairOptions: function () {
      var b = wardrobe.barberData(), p = player(), cur = p && p.look ? p.look.hair : null, curC = p && p.look ? p.look.hairColor : null;
      return { styles: b.styles.map(function (s) { return Object.assign({}, s, { current: (s.hair || s.style || s.id) === cur }); }),
        colors: b.colors.map(function (c) { return Object.assign({}, c, { current: c.hex ? c.hex === curC : S.wardrobe.hairColor === 'natural' || !S.wardrobe.hairColor }); }) };
    },
    // a haircut: haircut(styleId, colorId) or haircut(anyId, {slot}) (the UI's form: the id may be a style or a colour)
    haircut: function (a, b) {
      var bd = wardrobe.barberData(), p = player();
      if (!p) return no('noplayer');
      var ids = [a, typeof b === 'string' ? b : null], st = null, co = null;
      ids.forEach(function (id) {
        if (!id) return;
        bd.styles.forEach(function (s) { if (s.id === id) st = s; });
        bd.colors.forEach(function (c) { if (c.id === id) co = c; });
      });
      if (!st && !co) return no('unknown');
      var price = (st ? st.price | 0 : 0) + (co ? co.price | 0 : 0);
      if (p.money < price) return no('funds', { need: price - p.money });
      charge(p, price, 'barber'); S.wardrobe.spent += price; S.wardrobe.haircuts++;
      if (st) S.wardrobe.hair = st.hair || st.style || st.id;
      if (co) S.wardrobe.hairColor = co.hex || co.color || 'natural';
      applyLook();
      emit('shop:buy', { item: (st ? st.id : '') + (co ? (st ? '+' : '') + co.id : ''), price: price, kind: 'barber' });
      emit('barber:buy', { style: st ? st.id : null, hair: st ? S.wardrobe.hair : null, color: co ? co.id : null, price: price });
      sfx('cash', 0.5);
      checkAchievements();
      return ok({ price: price });
    },
    current: function () { return { equipped: copy(S.wardrobe.equipped), hair: S.wardrobe.hair, hairColor: S.wardrobe.hairColor, owned: Object.keys(S.wardrobe.owned) }; }
  };
  // the look keys an item sets for the current renderer (models may also read look.outfit[slot])
  function itemLook(d) {
    if (d.look) return d.look;
    var col = d.color || d.hex, out = {};
    if (d.slot === 'top') { if (col) out.shirt = col; }
    else if (d.slot === 'bottom') { if (col) out.pants = col; }
    else if (d.slot === 'shoes') { if (col) out.shoes = col; }
    else if (d.slot === 'hat') { out.hat = d.style || 'cap'; if (col) out.hatColor = col; }
    else if (d.slot === 'glasses') out.glasses = d.style || 'round';
    return out;
  }
  // writes the wardrobe into player.look and rebuilds the player's mesh; the look Bryce started with is kept on the
  // player (`_sysBaseLook`) so "natural" hair colour and slots never bought fall back to it
  function applyLook() {
    var p = player(); if (!p) return false;
    if (!p._sysBaseLook) p._sysBaseLook = copy(p.look || {});
    var look = Object.assign({}, p.look || {});
    look.outfit = Object.assign({}, look.outfit || {});
    for (var slot in S.wardrobe.equipped) {
      var d = wardrobe.item(S.wardrobe.equipped[slot]); if (!d) continue;
      look.outfit[slot] = d.id;
      var l = itemLook(d); for (var k in l) look[k] = l[k];
    }
    if (S.wardrobe.hair) look.hair = S.wardrobe.hair;
    if (S.wardrobe.hairColor) look.hairColor = S.wardrobe.hairColor === 'natural' ? (p._sysBaseLook.hairColor || look.hairColor) : S.wardrobe.hairColor;
    p.look = look;
    rebuildMesh(p);
    return true;
  }
  function wardrobeSet() { return Object.keys(S.wardrobe.equipped).length || S.wardrobe.hair || S.wardrobe.hairColor; }
  function rebuildMesh(e) {
    var Rd = GTP.Render; if (!Rd) return;
    try {
      if (Rd.rebuildEntityMesh) Rd.rebuildEntityMesh(e);
      else if (e.mesh && Rd.detach && Rd.attach) { Rd.detach(e); e.mesh = null; Rd.attach(e); }
      e._parts = null;   // Ped.syncMesh caches the pivots of the old mesh (12_cutscenes does the same)
    } catch (err) { report(err, 'systems.rebuildMesh'); }
  }

  // ============================================================== markers ==
  // world lights for properties for sale, owned safehouses without an interior to walk into, and the golf tee; meshes
  // exist only within MARKER_DRAW of the player (12 m of hysteresis)
  var MARKER_DRAW = 90;
  var marks = [], markersDirty = true;
  function markerAt(x, y, z, color) {
    var Rd = GTP.Render; if (!Rd || !Rd.markerMesh || !Rd.addMarker) return null;
    try { var m = Rd.markerMesh(color); Rd.addMarker(m); m.position.set(x, y || 0, z); return m; } catch (e) { report(e, 'systems.marker'); return null; }
  }
  function unmarker(m) { var Rd = GTP.Render; if (m && Rd && Rd.removeMarker) { try { Rd.removeMarker(m); } catch (e) { /* render optional */ } } }
  function interiorFor(d) { return !!(GTP.Interiors && GTP.Interiors.enter && d.kind === 'safehouse' && lmById(d.landmark)); }
  function rebuildMarks() {
    marks.forEach(function (m) { unmarker(m.mesh); });
    marks = [];
    markersDirty = false;
    if (!W() || !W().landmark) return;
    props.list().forEach(function (d) {
      if (d.x == null || d.locked || d.id === 'safe_dorm') return;   // the pod van is Game's own home point
      if (d.owned && (d.kind !== 'safehouse' || interiorFor(d))) return;
      if (d.kind === 'safehouse' && lmById(d.landmark) && (W().doors || []).length) return;   // the world track's door ring sells it (property:open)
      marks.push({ id: 'property:' + d.id, ref: d.id, type: d.owned ? 'save' : 'property', icon: d.owned ? 'home' : 'property', title: d.owned ? d.name : d.name + ' ' + money(d.price),
        x: d.x, z: d.z, y: groundY(d.x, d.z), r: 1.9, color: d.owned ? 0xffffff : 0x9dff3c });
    });
    var holes = golf.holes();
    if (holes.length) { var t = holes[0].tee; marks.push({ id: 'golf', ref: 'golf', type: 'golf', icon: 'golf', title: golf.course().name, x: t.x, z: t.z, y: groundY(t.x, t.z), r: 2.2, color: 0xffd400 }); }
    var p = player();
    marks.forEach(function (m) { m.armed = !p || dist(p.x, p.z, m.x, m.z) > m.r + 1; m.holdT = 0; m.mesh = null; });
  }
  function disarmNear() { var p = player(); if (!p) return; marks.forEach(function (m) { if (dist(p.x, p.z, m.x, m.z) <= m.r + 1.5) { m.armed = false; m.holdT = 0; } }); }
  function busy() { return inMission() || inStrand() || !!golfRun || !!job || inInterior(); }
  function tickMarkers(dt) {
    if (markersDirty) rebuildMarks();
    var p = player(); if (!p) return;
    var g = game(), cut = g && g.state === 'cutscene', hide = cut || inMission() || !!golfRun || !!job;
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i], d = dist(p.x, p.z, m.x, m.z);
      var want = !hide && (m.mesh ? d < MARKER_DRAW + 12 : d < MARKER_DRAW);
      if (want && !m.mesh) m.mesh = markerAt(m.x, m.y, m.z, m.color);
      else if (!want && m.mesh) { unmarker(m.mesh); m.mesh = null; }
      if (m.mesh && m.mesh.userData && typeof m.mesh.userData.pulse === 'function') { try { m.mesh.userData.pulse(0.5 + 0.5 * Math.sin((g ? g.time.t : 0) * 2.2 + i)); } catch (e) { /* optional */ } }
      if (d > m.r + 1.5) { m.armed = true; m.holdT = 0; continue; }
      if (!m.armed || d > m.r || !playing() || busy() || p.inVehicle) { m.holdT = 0; continue; }
      m.holdT += dt;
      if (m.holdT < 0.5) continue;
      m.armed = false; m.holdT = 0;
      if (m.type === 'property') openProperty(m.ref);
      else if (m.type === 'save') saveAtSafehouse(m.ref);
      else if (m.type === 'golf') {
        var r = golf.start();
        if (!r.ok) toast(golf.course().name + ': ' + (r.reason === 'wanted' ? 'lose the heat first.' : r.reason === 'funds' ? 'the green fee is ' + money(golf.fee()) + '.' : 'not now.'));
      }
    }
  }
  // minimap entries for the UI's allMarkers()
  function markerList() {
    var out = [], g = game();
    if (g && g.state === 'cutscene') return out;
    if (markersDirty && player()) rebuildMarks();
    if (!job && !golfRun) {
      marks.forEach(function (m) { out.push({ id: 'sys:' + m.id, kind: 'system', icon: m.icon, x: m.x, z: m.z, y: m.y, title: m.title, color: m.color }); });
      jobs.defs().forEach(function (d) { var v = jobs.vehicle(d.id); if (v) out.push({ id: 'sys:job:' + d.id, kind: 'system', icon: 'job', x: v.x, z: v.z, y: v.y || 0, title: d.name, color: d.kind === 'douse' ? 0xff7a20 : 0x2fd6ff }); });
    }
    if (job && job.phase === 'run') {
      job.calls.forEach(function (c, i) { if (c.state === 'waiting') out.push({ id: 'sys:call' + i, kind: 'objective', icon: job.def.kind === 'rescue' ? 'patient' : 'fire', x: c.x, z: c.z, y: c.y, title: c.name, color: job.def.kind === 'rescue' ? 0x2fd6ff : 0xff7a20 }); });
      var t = jobTarget(); if (t && t.kind === 'deliver') out.push({ id: 'sys:deliver', kind: 'objective', icon: 'hospital', x: t.x, z: t.z, y: 0, title: t.name || 'Drop off', color: 0x2fd6ff });
    }
    if (golfRun) { var h = golfRun.holes[golfRun.hole]; out.push({ id: 'sys:pin', kind: 'objective', icon: 'golf', x: h.pin.x, z: h.pin.z, y: 0, title: h.name, color: 0xffd400 }); }
    return out;
  }

  // ================================================================ clock ==
  function absHour() { var g = game(); return g && g.time ? (g.time.day | 0) * 24 + Math.floor(g.time.clock || 0) : 0; }
  function tickClock() {
    var h = absHour(), g = game();
    if (S.stocks.lastHour == null || h < S.stocks.lastHour) S.stocks.lastHour = h;
    if (h > S.stocks.lastHour) { stocks.tick(Math.min(48, h - S.stocks.lastHour)); S.stocks.lastHour = h; }
    var day = g && g.time ? g.time.day | 0 : 1;
    if (S.properties.lastDay == null || day < S.properties.lastDay) S.properties.lastDay = day;
    if (day > S.properties.lastDay) { props.payDay(Math.min(7, day - S.properties.lastDay)); S.properties.lastDay = day; }
  }
  // wanted:cleared {stars}: the stars shed by escaping (nobody else emits it; a bust or a death is not an escape)
  var lastWanted = 0;
  function tickWanted() {
    var p = player(), w = wanted();
    if (w > 0) S.stats.peakStars = Math.max(S.stats.peakStars || 0, w);
    else if (lastWanted > 0 && p && p.alive && S.stats.peakStars > 0) {
      S.stats.escapes = (S.stats.escapes || 0) + 1;
      emit('wanted:cleared', { stars: S.stats.peakStars });
      S.stats.peakStars = 0;
    }
    lastWanted = w;
  }

  // =============================================================== update ==
  Systems.update = function (dt) {
    var g = game(); if (!g || !g.player) return;
    try {
      tickClock();
      var p = player();
      if (p && p.money > (S.stats.moneyPeak || 0)) S.stats.moneyPeak = p.money;
      if (g.state === 'playing') {
        tickWanted();
        if (golfRun) golf.update(dt);
        tickJobStart();
        tickJob(dt);
        tickMarkers(dt);
        ensureJobCars(dt);
      }
      tickCheats(dt);
      achT += dt;
      if (achT >= 1) { achT = 0; checkAchievements(); }
    } catch (e) { report(e, 'systems.update'); }
  };

  // a new game (Missions.init runs inside Game.newGame, after the world and the player exist)
  Systems.reset = function () {
    if (golfRun) { golfRun = null; golf._dropMeshes(); }
    if (job) { var j = job; job = null; j.calls.forEach(dropCall); }
    marks.forEach(function (m) { unmarker(m.mesh); }); marks = [];
    jobCars = {}; carSpots = {}; carT = 0;   // newGame emptied the entity list; the cars respawn near their spots
    S = blank();
    R = GTP.rng && GTP.rng.fork ? GTP.rng.fork(0x5157) : GTP.rng;
    cheatBuf = ''; jumpWas = false; bigWas = false; achT = 0; lastWanted = 0; cheatDefsCache = null;
    props.defs().forEach(function (d) { if (d.start) S.properties.owned[d.id] = { day: 1, price: 0 }; });
    stocks.ensure();
    S.stocks.lastHour = absHour();
    var g = game(); S.properties.lastDay = g && g.time ? g.time.day : 1;
    var p = player(); if (p) S.stats.moneyPeak = p.money | 0;
    markersDirty = true;
    if (g && g.timeScale === 0.5) g.timeScale = 1;
    listenAchievementEvents();
    emit('systems:reset', {});
  };

  // ================================================================ saves ==
  function afterLoad() {
    stocks.ensure();
    S.stocks.lastHour = absHour();
    var g = game(); if (g && g.time) S.properties.lastDay = g.time.day;
    if (g) g.timeScale = effectOn('slowmo') ? 0.5 : 1;
    applyPerks();
    if (wardrobeSet()) applyLook();
    markersDirty = true;
  }
  Systems.serialize = function () { var out = copy(S); if (R && R.state) out.rng = R.state(); return out; };
  Systems.deserialize = function (data) {
    if (!data || typeof data !== 'object') return false;
    var base = blank();
    for (var k in base) if (data[k] && typeof data[k] === 'object') base[k] = Object.assign(base[k], copy(data[k]));
    S = base;
    if (data.rng != null && R && R.setState) R.setState(data.rng);
    if (golfRun) { golfRun = null; golf._dropMeshes(); }
    if (job) { var j = job; job = null; j.calls.forEach(dropCall); }
    cheatDefsCache = null;
    afterLoad();
    emit('systems:loaded', {});
    return true;
  };
  // GTP.SaveRegistry (save format v4): one entry per subsystem, each {get() -> json, set(json)}
  var REG_KEYS = ['properties', 'stocks', 'golf', 'achievements', 'cheats', 'jobs', 'wardrobe', 'stats'];
  GTP.SaveRegistry = GTP.SaveRegistry || {};
  REG_KEYS.forEach(function (k) {
    GTP.SaveRegistry['sys_' + k] = {
      get: function () { var o = copy(S[k]); if (k === 'stats' && R && R.state) o.rng = R.state(); return o; },
      set: function (json) {
        if (!json || typeof json !== 'object') return;
        S[k] = Object.assign(blank()[k], copy(json));
        if (k === 'stats' && json.rng != null && R && R.setState) { R.setState(json.rng); delete S.stats.rng; }
        cheatDefsCache = null;
        afterLoad();
      }
    };
  });
  // v3 saves wrote data.systems; a migrated v3 save arrives in v4 with an empty registry, so the hook reads it (the
  // registry's set() runs after the hooks and wins when both exist). Nothing is written here any more.
  GTP.SaveHooks = GTP.SaveHooks || [];
  GTP.SaveHooks.push({ name: 'systems', save: function () { }, load: function (data) { if (data && data.systems) Systems.deserialize(data.systems); } });

  // ================================================================ perks ==
  // job reward flags: damage_controlled (health pickups heal double; the Damage Control van has armor), fireproof
  // (explosions and hot takes hurt less: 40% of the hit comes back)
  function applyPerks() { /* the van's armor applies when it spawns; the rest react to events below */ }
  function onPickup(e) {
    var p = player(), pk = e && e.pickup; if (!p || !pk || (e.player && e.player !== p)) return;
    if (pk.pickupType === 'health' && flags().damage_controlled) p.hp = Math.min(p.maxHp, p.hp + (pk.value || 50));
  }
  function onDamage(e) {
    var p = player(); if (!p || !e || e.target !== p || !flags().fireproof || !p.alive) return;
    if (e.type === 'explosion' || e.type === 'blast' || e.type === 'hottake' || e.type === 'fire' || e.type === 'ratio') p.hp = Math.min(p.maxHp, p.hp + (e.amount || 0) * 0.4);
  }

  // =============================================================== events ==
  if (GTP.Events && GTP.Events.on) {
    GTP.Events.on('mission:complete', function (e) {
      try { markersDirty = true; if (e && !e.replay) stocks.react(e.id || (e.mission && e.mission.id)); checkAchievements(); } catch (err) { report(err, 'systems.missionComplete'); }
    });
    GTP.Events.on('mission:start', function () { if (job) endJob('mission'); if (golfRun) golf.end('interrupted'); });
    GTP.Events.on('strand:start', function () { if (job) endJob('busy'); if (golfRun) golf.end('interrupted'); });
    GTP.Events.on('player:respawn', function () { if (wardrobeSet()) applyLook(); });
    GTP.Events.on('player:wasted', function () { S.stats.peakStars = 0; lastWanted = 0; if (job) endJob('dead'); if (golfRun) golf.end('interrupted'); });
    GTP.Events.on('busted', function () { S.stats.peakStars = 0; lastWanted = 0; if (job) endJob('busted'); if (golfRun) golf.end('interrupted'); });
    GTP.Events.on('world:generated', function () { markersDirty = true; });
    GTP.Events.on('pickup', onPickup);
    GTP.Events.on('damage', onDamage);
    // stats for the parity achievements: gun shops visited, cars fully modded
    GTP.Events.on('interior:enter', function (e) { if (e && e.kind === 'armory') S.stats.shops[e.store || e.id || 'armory'] = true; });
    GTP.Events.on('vehicle:mod', function (e) {
      var m = e && e.mods, v = e && e.vehicle; if (!m || !v) return;
      if ((m.engine | 0) >= 4 && (m.brakes | 0) >= 3 && (m.armor | 0) >= 5 && m.turbo) S.stats.maxed[v.id != null ? v.id : (v.type + ':' + Object.keys(S.stats.maxed).length)] = true;
    });
    GTP.Events.on('vehicle:enter', function (e) {
      var v = e && e.vehicle, p = player(); if (!v || !v.sysJob || !p || (e.ped && e.ped !== p) || job) return;
      var d = jobs.def(v.sysJob); if (d) toast(d.start || ('Press E while stopped to start ' + d.name + '.'));
    });
  }

  // ============================================================= wrappers ==
  // Missions.update runs every step in playing, cutscene and minigame: Systems.update rides after it
  var Ms = GTP.Missions;
  if (Ms && typeof Ms.update === 'function' && !Ms.update._sys) {
    var mUpdate = Ms.update;
    Ms.update = function (dt) { var r = mUpdate.apply(this, arguments); Systems.update(dt); return r; };
    Ms.update._sys = true;
  }
  if (Ms && typeof Ms.init === 'function' && !Ms.init._sys) {
    var mInit = Ms.init;
    Ms.init = function () { var r = mInit.apply(this, arguments); try { Systems.reset(); } catch (e) { report(e, 'systems.reset'); } return r; };
    Ms.init._sys = true;
  }
  // minimap entries are not appended to Missions.allMarkers (tests/strands.js counts that list exactly): the UI appends
  // GTP.Systems.markers() itself, as it does for the gun shops
  // golf freezes the player's own controls (the swing reads the same keys)
  if (GTP.Player && GTP.Player.prototype && typeof GTP.Player.prototype.control === 'function' && !GTP.Player.prototype.control._sys) {
    var pControl = GTP.Player.prototype.control;
    GTP.Player.prototype.control = function (dt) {
      if (golfRun) { if (this.intent) { this.intent.x = 0; this.intent.z = 0; this.intent.run = false; } this.aiming = false; return; }
      return pControl.apply(this, arguments);
    };
    GTP.Player.prototype.control._sys = true;
  }
  // a safehouse interior needs owning: an unowned door opens the property card instead (throttled: doors retry every step)
  var IN = GTP.Interiors, lastRefusal = -10;
  if (IN && typeof IN.enter === 'function' && !IN.enter._sys) {
    var iEnter = IN.enter;
    IN.enter = function (id, opts) {
      try {
        var o = opts || {}, lm = o.landmark, lmId = lm && typeof lm === 'object' ? lm.id : lm, key = o.property || (typeof id === 'string' && /^safe_/.test(id) ? id : (lmId || o.store || null));
        var kindSafe = id === 'safehouse' || o.kind === 'safehouse' || (typeof id === 'string' && /^safe_/.test(id)) || (lm && typeof lm === 'object' && lm.kind === 'safehouse');
        var d = kindSafe && key ? props.byLandmark(key) : null;
        if (d && d.kind === 'safehouse' && !props.owned(d.id) && !o.force) {
          var g = game(), t = g && g.time ? g.time.t : 0;
          if (t - lastRefusal > 2) { lastRefusal = t; openProperty(d.id); }
          return false;
        }
      } catch (e) { report(e, 'systems.interiorGate'); }
      return iEnter.apply(this, arguments);
    };
    IN.enter._sys = true;
  }

  // ============================================================ the facade ==
  Systems.properties = props;
  Systems.stocks = stocks;
  Systems.golf = golf;
  Systems.achievements = achievements;
  Systems.unlock = unlock;
  Systems.unlocked = achievements.unlocked;
  Systems.checkAchievements = checkAchievements;
  Systems.stats = stats;
  Systems.statModel = statModel;
  Systems.statsPage = function () { return statsPage(); };
  Systems.cheats = cheats;
  Systems.jobs = jobs;
  Systems.wardrobe = wardrobe;
  Systems.clothing = wardrobe;
  Systems.barber = { options: wardrobe.hairOptions, buy: wardrobe.haircut };
  // the names the UI track calls (docs/v03/ui.md)
  Systems.buyClothing = function (id) { return wardrobe.item(id) ? wardrobe.buy(id) : wardrobe.buyOutfit(id); };
  Systems.buyOutfit = wardrobe.buyOutfit;
  Systems.buyHaircut = wardrobe.haircut;
  // one answer for the world's doors (property ids: safehouses, garages) and the UI's wardrobe (item ids)
  Systems.owns = function (id) { return props.def(id) ? props.owned(id) : wardrobe.owns(id); };
  Systems.buyProperty = props.buy;
  Systems.ownsProperty = props.owned;
  Systems.buy = function (kind, id, opts) {
    if (kind === 'barber' || kind === 'hair') return wardrobe.haircut(id, opts);
    if (kind === 'outfit') return wardrobe.buyOutfit(id);
    if (kind === 'property') return props.buy(id);
    if (kind === 'stock') return stocks.buy(id, (opts && opts.qty) || 1);
    return Systems.buyClothing(id);
  };
  Systems.applyLook = applyLook;
  Systems.markers = markerList;
  Systems.hud = function () { return { golf: golf.hud(), job: jobs.state() }; };
  Systems.debug = {
    marks: function () { if (markersDirty && player()) rebuildMarks(); return marks; },
    rebuildMarks: rebuildMarks,
    tickClock: tickClock,
    ensureJobCars: function () { ensureJobCars(0, true); },
    golfRun: function () { return golfRun; },
    rng: function () { return R; }
  };
})();
