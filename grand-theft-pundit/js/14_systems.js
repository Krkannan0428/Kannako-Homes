/* 14_systems.js: systems track (PLAN_V03.md "systems"): the rest of GTA as simulation plus events; the UI draws.
 *
 * GTP.Systems = {
 *   properties  safehouses (save points, sleep) and businesses (income per game day); buy, markers that emit property:open
 *   stocks      eight invented tickers: an hourly random walk on GTP.rng plus shocks on mission:complete; buy / sell / portfolio
 *   golf        Goldplate Links: nine holes, aim, a two-press power meter, clubs, wind, lies, hazards, scorecard
 *   achievements (25), unlock(id) -> emits `achievement {id, name, desc}`
 *   stats() / statsPage()   the flat stats model and the sectioned page the UI draws
 *   cheats      six harmless cheat codes typed on the keyboard (own keydown listener) or entered with cheats.enter(code)
 *   jobs        two job strands: Damage Control (paramedic parody) and Hot Take Brigade (firefighter parody)
 *   wardrobe    clothing and barber purchase logic (player.look.outfit / hair, then Render.rebuildEntityMesh(player))
 *   serialize() / deserialize(json)   save state; entries in GTP.SaveRegistry (sys_*) and a GTP.SaveHooks bridge for the v3 saves
 * }
 *
 * Data: GTP.Content.parity.{properties, stocks, golf, achievements, cheats, jobs, clothing, barber} when present (the content
 * track writes it; 25_content_parity.js loads after this file, so every table is read lazily), else the fallback tables
 * below. Wrappers installed at load (see docs/v03/systems.md): Missions.update (Systems.update after it), Missions.init
 * (Systems.reset after it), Player.prototype.control (frozen during golf). Minimap entries: Systems.markers().
 * Randomness: GTP.rng.fork(0x5157) per new game, never Math.random.
 */
(function () {
  var GTP = window.GTP = window.GTP || {};
  var U = GTP.util;

  // ------------------------------------------------------------------ helpers --
  function game() { return GTP.game || null; }
  function player() { var g = game(); return g ? g.player : null; }
  function W() { return GTP.World; }
  function emit(name, payload) { if (GTP.Events) GTP.Events.emit(name, payload || {}); }
  function toast(t) { if (GTP.UI && GTP.UI.toast) { try { GTP.UI.toast(t); } catch (e) { /* ui optional */ } } }
  function sfx(name, gain) { var p = player(); if (GTP.Audio && GTP.Audio.play) { try { GTP.Audio.play(name, { x: p ? p.x : 0, z: p ? p.z : 0, gain: gain == null ? 0.8 : gain }); } catch (e) { /* audio optional */ } } }
  function fx(o) { if (GTP.Render && GTP.Render.fx && GTP.Render.fx.add) { try { GTP.Render.fx.add(o); } catch (e) { /* fx optional */ } } }
  function report(e, where) { if (U && U.reportError) U.reportError(e, where); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, az, bx, bz) { var dx = bx - ax, dz = bz - az; return Math.sqrt(dx * dx + dz * dz); }
  function money(n) { return U && U.fmtMoney ? U.fmtMoney(n) : '$' + Math.round(n); }
  function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function yawDir(yaw) { return { x: -Math.sin(yaw), z: -Math.cos(yaw) }; }          // yaw 0 faces -z (ARCHITECTURE §2)
  function dirYaw(x, z) { return Math.atan2(-x, -z); }
  function parity() { return (GTP.Content && GTP.Content.parity) || null; }
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
  // a content table as an array: arrays pass through, {id: def} maps get their ids
  function asList(src) {
    if (!src) return [];
    if (Array.isArray(src)) return src.filter(Boolean);
    if (typeof src === 'object') { var out = []; for (var k in src) if (src[k] && typeof src[k] === 'object') out.push(Object.assign({ id: k }, src[k])); return out; }
    return [];
  }
  function table(name, fallback) {
    var P = parity(), src = P ? P[name] : null;
    var list = asList(src && !Array.isArray(src) && src.list ? src.list : src);
    if (name === 'golf' && src && !Array.isArray(src) && src.holes) list = asList(src.holes);
    return list.length ? list : fallback;
  }

  var R = null;   // the systems' own random stream (forked per new game)
  function rnd() { if (!R) R = GTP.rng && GTP.rng.fork ? GTP.rng.fork(0x5157) : GTP.rng; return R.random(); }
  function rrange(a, b) { return a + (b - a) * rnd(); }
  function gauss() { var u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v); }

  // where a landmark-anchored thing stands: World.landmark(id).door (or points[name]) plus an offset, else `near` with
  // an offset, else the fallback {x, z}
  function landmarkPoint(def) {
    var Wd = W(); if (!Wd || !Wd.landmark) return def.at ? { x: def.at.x, z: def.at.z, y: def.at.y || 0 } : null;
    var ids = [def.landmark, def.near].filter(Boolean);
    for (var i = 0; i < ids.length; i++) {
      var lm = null; try { lm = Wd.landmark(ids[i]); } catch (e) { lm = null; }
      if (!lm) continue;
      var base = (def.point && lm.points && lm.points[def.point]) || lm.door || lm;
      var off = (i === 0 ? def.offset : def.nearOffset) || (i === 0 ? null : { x: 7, z: 0 }) || { x: 0, z: 0 };
      if (!off) off = { x: 0, z: 0 };
      var x = base.x + (off.x || 0), z = base.z + (off.z || 0);
      // an offset that lands in a building or on a road snaps to the nearest sidewalk (on-foot markers)
      if ((off.x || off.z) && blockedFoot(x, z) && Wd.nearestSidewalkPoint) { var sp = Wd.nearestSidewalkPoint(x, z); if (sp) { x = sp.x; z = sp.z; } }
      var y = 0; try { y = Wd.heightAt ? Wd.heightAt(x, z, base.y || 0) : 0; } catch (e) { y = 0; }
      return { x: x, z: z, y: y > -1 ? y : (base.y || 0) };
    }
    return def.at ? { x: def.at.x, z: def.at.z, y: def.at.y || 0 } : null;
  }

  function blockedFoot(x, z) {
    var Wd = W(), T = Wd && Wd.T; if (!T || !Wd.tileAt) return false;
    var t = Wd.tileAt(x, z);
    return t === T.BUILDING || t === T.WATER || t === T.VOID || t === T.ROAD || t === T.HIGHWAY || (Wd.solidAt && Wd.solidAt(x, z, 0.5));
  }
  // a drive-in spot for a landmark: a road point 7..18 m from its door (clear of the mission light on the sidewalk)
  function roadSpot(id) {
    var Wd = W(), lm = null; try { lm = Wd && Wd.landmark ? Wd.landmark(id) : null; } catch (e) { lm = null; }
    if (!lm || !Wd.nearestRoadPoint) return null;
    var d = lm.door || lm, T = Wd.T || {}, best = null, bd = Infinity;
    [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12], [16, 8], [-16, -8]].forEach(function (o) {
      var rp = Wd.nearestRoadPoint(d.x + o[0], d.z + o[1]); if (!rp) return;
      var dd = dist(rp.x, rp.z, d.x, d.z), tt = Wd.tileAt ? Wd.tileAt(rp.x, rp.z) : T.ROAD;
      if (dd < 7 || dd > 18 || tt === T.HIGHWAY || tt === T.RAMP || tt === T.BRIDGE) return;
      var score = Math.abs(dd - 10); if (score < bd) { bd = score; best = rp; }
    });
    if (!best) { best = Wd.nearestRoadPoint(d.x, d.z); }
    return best ? { x: best.x, z: best.z, y: best.y || 0 } : null;
  }

  // ============================================================ fallback data ==
  // Everything here is original. The content track's GTP.Content.parity tables replace a table wholesale when present.
  var FB = {};

  FB.properties = [
    { id: 'safe_dorm', name: 'The Podcast Van (Gus\'s Garage)', kind: 'safehouse', landmark: 'safe_dorm', near: 'pod_garage', nearOffset: { x: -6, z: 0 }, price: 0, income: 0, garage: 1, start: true,
      flavor: 'Sleeps one. Records two. Smells like a hot mic.' },
    { id: 'safe_brownstone', name: 'Footnote Row Brownstone', kind: 'safehouse', landmark: 'safe_brownstone', near: 'char_charter', price: 14000, income: 0, garage: 2,
      flavor: 'Three floors, two think-tank fellows next door, one opinion through the wall.' },
    { id: 'safe_marina_loft', name: 'Marina Loft "Low Tide"', kind: 'safehouse', landmark: 'safe_marina_loft', near: 'velvetine_pier', price: 26000, income: 0, garage: 2, unlock: { mission: 'm07_listen' },
      flavor: 'Floor-to-ceiling windows so the yacht people can see you being relatable.' },
    { id: 'safe_suburb', name: 'Culdesac Split-Level', kind: 'safehouse', landmark: 'safe_suburb', near: 'culdesac_gas', price: 19000, income: 0, garage: 3, unlock: { mission: 'm05_peer' },
      flavor: 'Comes with an HOA binder thicker than the mortgage.' },
    { id: 'safe_penthouse', name: 'Goldplate Tower Penthouse 10', kind: 'safehouse', landmark: 'safe_penthouse', near: 'goldplate_tower', price: 90000, income: 0, garage: 4, unlock: { mission: 'm12_memo' },
      flavor: 'Floor 10 of 10. Every floor is floor 10.' },
    { id: 'biz_fish_shack', name: 'Fresh Takes Fish Shack', kind: 'business', landmark: 'fish_shack', offset: { x: 5, z: 0 }, price: 9000, income: 320,
      flavor: 'The catch of the day is whatever the chat is mad about.' },
    { id: 'biz_octane', name: 'Octane Opinions Gas', kind: 'business', landmark: 'strip_gas', offset: { x: 5, z: 0 }, price: 16000, income: 520,
      flavor: 'Premium, regular, and contrarian. Pump 4 only takes takes.' },
    { id: 'biz_green_room', name: 'Green Room Motel', kind: 'business', landmark: 'green_room', offset: { x: 5, z: 0 }, price: 30000, income: 900, unlock: { mission: 'm04_hit' },
      flavor: 'Every guest is "just in town for a hit." Checkout is whenever the segment ends.' },
    { id: 'biz_detail', name: 'Detail & Evidence Car Wash', kind: 'business', landmark: 'strip_garage', offset: { x: 5, z: 0 }, price: 21000, income: 650,
      flavor: 'We wash cars. We do not ask why the wrap says that.' },
    { id: 'biz_pump', name: 'Pump & Circumstance', kind: 'business', landmark: 'culdesac_gas', offset: { x: -5, z: 0 }, price: 12000, income: 380,
      flavor: 'The only gas station with a dress code and a commencement speech.' },
    { id: 'biz_museum_shop', name: 'Museum of Takes Gift Shop', kind: 'business', landmark: 'museum_of_takes', offset: { x: 6, z: 0 }, price: 60000, income: 1700, unlock: { mission: 'm11_trustless' },
      flavor: 'Replica folding tables, $400. Postcards of the folding table, $40. The original folding table: priceless, wobbly.' }
  ];

  FB.stocks = [
    { ticker: 'NAPD', name: 'Nap Dynasty Mattresses', price: 42.0, vol: 0.022, drift: 0.0004, flavor: 'Sponsors everything, therefore owns everything. Code TAKES20 at checkout.' },
    { ticker: 'VLTW', name: 'Vaultwright Capital', price: 118.0, vol: 0.016, drift: 0.0006, flavor: 'Bets on both sides as a hedge. The hedge is also a maze.' },
    { ticker: 'GLDP', name: 'Goldplate Holdings', price: 77.0, vol: 0.03, drift: 0.0002, flavor: 'Every asset rated ten out of ten by the chairman.' },
    { ticker: 'VLVT', name: 'Velvetine Records', price: 23.5, vol: 0.035, drift: 0.0001, flavor: 'Nothing released, still charting.' },
    { ticker: 'PLLT', name: 'Clarity Pellets', price: 12.0, vol: 0.05, drift: -0.0002, flavor: 'A supplement with a stance. Your broker won\'t tell you that.' },
    { ticker: 'PNDT', name: '$PUNDIT Coin Trust', price: 3.1, vol: 0.09, drift: 0, flavor: 'Backed by takes. Trustless, which is how you should feel.' },
    { ticker: 'YELL', name: 'The Yell Network', price: 55.0, vol: 0.02, drift: 0.0003, flavor: 'BREAKING: Shares. Moving.' },
    { ticker: 'BSCO', name: 'Bravadian Scooter Co.', price: 31.0, vol: 0.028, drift: 0.0003, flavor: 'Defense scooters for both sides. And that\'s why we need the jets.' }
  ];
  // missionId -> {ticker: fraction}: the market reacts to what Bryce just did (applied on mission:complete, first time only)
  FB.stockReactions = {
    m00_intro: { YELL: 0.03 }, m01_van: { NAPD: 0.06 }, m02_read: { NAPD: 0.08, YELL: 0.02 }, m03_ratio: { YELL: 0.05, PNDT: 0.04 },
    m04_hit: { YELL: 0.12 }, m05_peer: { VLTW: 0.05 }, m06_rally: { GLDP: 0.14, YELL: 0.04 }, m07_listen: { VLVT: -0.18 },
    m07b_ferry: { VLVT: -0.06, BSCO: 0.05 }, m08_scooters: { BSCO: 0.2 }, m08b_jets: { BSCO: 0.1, GLDP: -0.04 }, m09_balloon: { YELL: 0.06, GLDP: -0.05 },
    m09b_hotmic: { YELL: -0.08 }, m10_pellets: { PLLT: -0.35 }, m11_trustless: { PNDT: -0.45 }, m12_memo: { VLTW: -0.12, NAPD: -0.08 },
    m12b_scope: { VLTW: -0.05 }, m13_thursday: { YELL: 0.1, NAPD: 0.05 }, m13b_ratio: { YELL: -0.06 }, m14_grift: { NAPD: -0.15, VLTW: 0.08 },
    m15a_primetime: { YELL: 0.25, NAPD: 0.1 }, m15b_liveread: { NAPD: -0.3, YELL: -0.12, VLTW: -0.2 },
    b01_goldplate: { GLDP: -0.22 }, b02_velvetine: { VLVT: -0.3 }, b03_warbanner: { BSCO: -0.28 }, b04_redacted: { YELL: 0.08 },
    b05_dunk: { YELL: 0.07 }, b06_panel: { YELL: 0.15, VLTW: -0.1 }, h01_casing: { VLTW: -0.03 }, h02_prep: { VLTW: -0.04 }, h03_job: { VLTW: -0.25, GLDP: 0.05 }
  };

  // holes in course space: u across the lot (0 west .. 1 east), v along it (0 north .. 1 south); hazards {kind, u, v, r (m)}
  // Goldplate Links' lot is two lawns split by a cross street (north z 92..176, south z 188..268 on the v0.2 map) with the
  // sea along its west edge: eight holes stay on one lawn, the ninth plays over the street. The sea and the street are real
  // hazards (World tiles); the ponds and bunkers below are painted ones the HUD draws.
  FB.golf = [
    { id: 'g1', name: 'The Ribbon Cutting', par: 3, tee: { u: 0.4, v: 0.03 }, pin: { u: 0.45, v: 0.4 }, wind: 2, hazards: [{ kind: 'sand', u: 0.62, v: 0.36, r: 4 }] },
    { id: 'g2', name: 'Renamed Twice', par: 3, tee: { u: 0.75, v: 0.42 }, pin: { u: 0.15, v: 0.1 }, wind: 3, hazards: [{ kind: 'water', u: 0.45, v: 0.25, r: 5 }] },
    { id: 'g3', name: 'The Hedge', par: 4, tee: { u: 0.05, v: 0.42 }, pin: { u: 0.72, v: 0.1 }, wind: 4, hazards: [{ kind: 'sand', u: 0.45, v: 0.22, r: 5 }, { kind: 'sand', u: 0.6, v: 0.13, r: 3 }] },
    { id: 'g4', name: 'Executive Time', par: 3, tee: { u: 0.7, v: 0.05 }, pin: { u: 0.3, v: 0.2 }, wind: 1, hazards: [] },
    { id: 'g5', name: 'Ten Out of Ten', par: 3, tee: { u: 0.4, v: 0.57 }, pin: { u: 0.5, v: 0.9 }, wind: 3, hazards: [{ kind: 'water', u: 0.42, v: 0.78, r: 5 }] },
    { id: 'g6', name: 'The Gilded Bunker', par: 3, tee: { u: 0.8, v: 0.95 }, pin: { u: 0.1, v: 0.62 }, wind: 2, hazards: [{ kind: 'sand', u: 0.22, v: 0.66, r: 4 }, { kind: 'sand', u: 0.05, v: 0.7, r: 3 }] },
    { id: 'g7', name: 'Dogleg of Due Diligence', par: 4, tee: { u: 0.05, v: 0.58 }, pin: { u: 0.72, v: 0.9 }, wind: 4, hazards: [{ kind: 'water', u: 0.45, v: 0.78, r: 6 }, { kind: 'sand', u: 0.6, v: 0.88, r: 3 }] },
    { id: 'g8', name: 'Mulligan Memorial', par: 3, tee: { u: 0.5, v: 0.75 }, pin: { u: 0.15, v: 0.88 }, wind: 2, hazards: [{ kind: 'sand', u: 0.3, v: 0.85, r: 3 }] },
    { id: 'g9', name: 'The Clubhouse Turn', par: 3, tee: { u: 0.6, v: 0.6 }, pin: { u: 0.55, v: 0.36 }, wind: 5, hazards: [{ kind: 'sand', u: 0.68, v: 0.38, r: 3 }] }
  ];
  FB.clubs = [
    { id: 'driver', name: 'Driver', carry: 130, loft: 0.24 },
    { id: 'iron', name: '7 Iron', carry: 85, loft: 0.42 },
    { id: 'wedge', name: 'Wedge', carry: 45, loft: 0.82 },
    { id: 'putter', name: 'Putter', carry: 26, loft: 0 }
  ];
  FB.golfLines = {
    start: 'Goldplate Links. Every hole is a par 10, says the sign. The card disagrees.',
    hole: ['Respectfully, that hole is mine.', 'The chat calls it a birdie. The card calls it a birdie. Rare consensus.'],
    water: 'Splash. The pond is named after the chairman, so technically you hit him.',
    ob: 'Out of bounds. The ball has left the discourse.',
    sand: 'Bunker. It is gold-flecked, which does not help.'
  };

  // stat keys: see Systems.stats(); an achievement unlocks when stats[stat] >= goal
  FB.achievements = [
    { id: 'ach_first_mission', name: 'Pre-Viral', desc: 'Complete your first mission.', stat: 'missions', goal: 1 },
    { id: 'ach_act_two', name: 'A Voice (Of What?)', desc: 'Complete 8 missions.', stat: 'missions', goal: 8 },
    { id: 'ach_story', name: 'We\'ll Have to Leave It There', desc: 'Complete 30 missions.', stat: 'missions', goal: 30 },
    { id: 'ach_property', name: 'Skin in the Game', desc: 'Buy a property.', stat: 'propertiesBought', goal: 1 },
    { id: 'ach_mogul', name: 'Names It After Himself', desc: 'Own every property in Grievance City.', stat: 'propertiesAll', goal: 1 },
    { id: 'ach_income', name: 'Passive Aggressive Income', desc: 'Collect $5,000 in property income.', stat: 'propertyIncome', goal: 5000 },
    { id: 'ach_trade', name: 'Liquidity Event', desc: 'Make your first stock trade.', stat: 'stockTrades', goal: 1 },
    { id: 'ach_profit', name: 'Buy the Rumor, Sell the Take', desc: 'Realize $2,500 in stock profit.', stat: 'stockProfit', goal: 2500 },
    { id: 'ach_diversified', name: 'Diversified Grievances', desc: 'Hold shares of all eight tickers at once.', stat: 'stocksHeld', goal: 8 },
    { id: 'ach_golf_round', name: 'Every Hole a Ten', desc: 'Finish a round at Goldplate Links.', stat: 'golfRounds', goal: 1 },
    { id: 'ach_birdie', name: 'Respectfully, Birdie', desc: 'Score a birdie.', stat: 'golfBirdies', goal: 1 },
    { id: 'ach_ace', name: 'Hole in One (Out of Ten)', desc: 'Make a hole in one.', stat: 'golfAces', goal: 1 },
    { id: 'ach_under_par', name: 'Under Par, Over Confident', desc: 'Finish a round under par.', stat: 'golfUnderPar', goal: 1 },
    { id: 'ach_dc5', name: 'Spin Cycle', desc: 'Reach level 5 of Damage Control.', stat: 'dcBestLevel', goal: 5 },
    { id: 'ach_dc_clients', name: 'Bedside Manner, Technically', desc: 'Deliver 25 Damage Control clients.', stat: 'dcClients', goal: 25 },
    { id: 'ach_htb5', name: 'Cooler Heads', desc: 'Reach level 5 of Hot Take Brigade.', stat: 'htbBestLevel', goal: 5 },
    { id: 'ach_htb_fires', name: 'Flame Retardant', desc: 'Put out 25 hot takes.', stat: 'htbFires', goal: 25 },
    { id: 'ach_cheat', name: 'Didn\'t Read the Rules', desc: 'Enter a cheat code.', stat: 'cheatsUsed', goal: 1 },
    { id: 'ach_all_cheats', name: 'Respectfuly', desc: 'Find all six cheat codes.', stat: 'cheatsFound', goal: 6 },
    { id: 'ach_wardrobe', name: 'New Season, Same Take', desc: 'Buy five pieces of clothing.', stat: 'outfitsBought', goal: 5 },
    { id: 'ach_barber', name: 'Signature Look (Not That One)', desc: 'Get a haircut at the Clip Joint.', stat: 'haircuts', goal: 1 },
    { id: 'ach_wealth', name: 'Whispers Every Dollar', desc: 'Hold $100,000 at once.', stat: 'moneyPeak', goal: 100000 },
    { id: 'ach_distance', name: 'Road-Tested Takes', desc: 'Travel 42 km on foot and on wheels.', stat: 'distanceTotal', goal: 42000 },
    { id: 'ach_jumps', name: 'Ahead of the Discourse', desc: 'Jump 100 times.', stat: 'jumps', goal: 100 },
    { id: 'ach_marathon', name: 'Five Hours of Content', desc: 'Play for five hours.', stat: 'playTime', goal: 18000 }
  ];

  FB.cheats = [
    { id: 'goldenhour', code: 'GOLDENHOUR', name: 'Golden Hour', desc: 'Sets the clock to sunset. The chairman rates it a ten.', effect: 'clock' },
    { id: 'respectfuly', code: 'RESPECTFULY', name: 'Respectfuly', desc: 'Everyone nearby opens with "Respectfully," and then is not.', effect: 'respectfully' },
    { id: 'bigtakes', code: 'BIGTAKES', name: 'Big Take Energy', desc: 'Big heads for everyone. Toggle.', effect: 'bigheads', toggle: true },
    { id: 'trustless', code: 'TRUSTLESS', name: 'Trustless Gravity', desc: 'Moon jumps. Backed by nothing. Toggle.', effect: 'moonjump', toggle: true },
    { id: 'weatherballoon', code: 'WEATHERBALLOON', name: 'Weather Balloon Repair', desc: 'Rolls the weather to the next state.', effect: 'weather' },
    { id: 'slownewsday', code: 'SLOWNEWSDAY', name: 'Slow News Day', desc: 'Half-speed everything. Toggle.', effect: 'slowmo', toggle: true }
  ];

  FB.jobs = [
    { id: 'damage_control', name: 'Damage Control', kind: 'rescue', start: 'hospital', deliver: 'hospital', color: 0x2fd6ff, levels: 12, payPerLevel: 150, perCall: 40, capacity: 3,
      lines: { start: 'Damage Control: pundits got ratio\'d so hard they need a lie down. Pick them up, rush them to Goldplate Memorial.',
        call: 'A client is trending for the wrong reasons.', board: ['"Did you see the replies?" Don\'t look at the replies.', 'Client aboard. Phone confiscated.', '"I was taken out of context." Sure.'],
        deliver: 'Client delivered. Statement drafted. Apology pending.', level: 'Crisis contained.', timeout: 'The news cycle moved on without you.', lost: 'You ratio\'d the client yourself.', vehicle: 'You left the vehicle. The story wrote itself.', done: 'Damage Control complete. Bedside manner: technically.' },
      perk: { maxHp: 1.25, text: 'Perk: +25% max health. You have heard worse.' } },
    { id: 'hot_take_brigade', name: 'Hot Take Brigade', kind: 'douse', start: 'tyn_tower', color: 0xff7a20, levels: 12, payPerLevel: 175, perCall: 30, douseTime: 2.5, douseRadius: 9,
      lines: { start: 'Hot Take Brigade: hot takes are burning across town. Park next to each one until it cools off.',
        call: 'A hot take is spreading.', douse: ['Take cooled. Context applied.', 'Flame war out. Nobody won, which is a win.', 'Doused. The replies are thanking you, sarcastically.'],
        level: 'All takes room temperature.', timeout: 'A take went viral. It is everyone\'s problem now.', vehicle: 'You left the truck. The takes kept cooking.', done: 'Hot Take Brigade complete. You are officially lukewarm.' },
      perk: { respawnArmor: 50, text: 'Perk: respawn with 50 armor. Flame retardant.' } }
  ];

  // slots: top bottom shoes hat glasses; `look` is merged into player.look for the current renderer (shirt / pants colours,
  // hat / glasses keywords); `outfit` ids land in player.look.outfit for the models track
  FB.clothing = [
    { id: 'top_debate_polo', slot: 'top', name: 'Debate Club Polo', price: 60, look: { shirt: '#f4f4f4' }, flavor: 'Collar up, guard down.' },
    { id: 'top_sponsor_tee', slot: 'top', name: 'Nap Dynasty Sponsor Tee', price: 0, look: { shirt: '#2c3e7a' }, flavor: 'Free. You are the billboard now.' },
    { id: 'top_quarter_zip', slot: 'top', name: 'Thought-Leader Quarter-Zip', price: 180, look: { shirt: '#5b6470' }, flavor: 'Signals "I have a newsletter."' },
    { id: 'top_blazer_pink', slot: 'top', name: 'On-Air Blazer (Pink)', price: 420, look: { shirt: '#ff3fa4' }, flavor: 'Reads loud on a phone screen.' },
    { id: 'top_flannel', slot: 'top', name: 'Relatable Flannel', price: 90, look: { shirt: '#a33a2a' }, flavor: 'For the rural tour you will never take.' },
    { id: 'top_gold_suit', slot: 'top', name: 'Ten-Out-of-Ten Gold Jacket', price: 2400, look: { shirt: '#e8b53a' }, unlock: { mission: 'm06_rally' }, flavor: 'Ribbon not included. There is always a ribbon.' },
    { id: 'bottom_chinos', slot: 'bottom', name: 'Campus Chinos', price: 50, look: { pants: '#b8a27a' }, flavor: 'Pleated for your protection.' },
    { id: 'bottom_slacks', slot: 'bottom', name: 'Green Room Slacks', price: 140, look: { pants: '#2a2f4a' }, flavor: 'Never seen on camera. Pressed anyway.' },
    { id: 'bottom_joggers', slot: 'bottom', name: 'Grindset Joggers', price: 75, look: { pants: '#333333' }, flavor: 'Up at 4 a.m. to post about being up at 4 a.m.' },
    { id: 'shoes_loafers', slot: 'shoes', name: 'Pundit Loafers', price: 120, look: { shoes: '#3a2a1a' }, flavor: 'No socks. Strong opinions.' },
    { id: 'shoes_hightops', slot: 'shoes', name: 'Limited Drop High-Tops', price: 300, look: { shoes: '#f4f4f4' }, flavor: 'Bought with a code from a podcast.' },
    { id: 'hat_none', slot: 'hat', name: 'No Hat', price: 0, look: { hat: 'none' }, flavor: 'Let the hair speak.' },
    { id: 'hat_cap', slot: 'hat', name: 'Loud & Correct Cap', price: 35, look: { hat: 'cap', hatColor: '#ff3fa4' }, flavor: 'Merch. Margins. Momentum.' },
    { id: 'hat_beanie', slot: 'hat', name: 'Sound Guy Beanie', price: 30, look: { hat: 'beanie', hatColor: '#7fbf6a' }, flavor: 'You\'re peaking.' },
    { id: 'hat_fedora', slot: 'hat', name: 'Contrarian Fedora', price: 95, look: { hat: 'fedora', hatColor: '#2b2b2b' }, flavor: 'Well, actually.' },
    { id: 'glasses_none', slot: 'glasses', name: 'No Glasses', price: 0, look: { glasses: 'none' }, flavor: 'Raw eye contact with the chat.' },
    { id: 'glasses_round', slot: 'glasses', name: 'Read-the-Room Rounds', price: 80, look: { glasses: 'round' }, flavor: 'Make you look like you did the reading.' },
    { id: 'glasses_shades', slot: 'glasses', name: 'Ring-Light Shades', price: 110, look: { glasses: 'shades' }, flavor: 'Indoor sunglasses for indoor takes.' }
  ];
  FB.barber = {
    styles: [
      { id: 'short', name: 'The Booker', price: 40, flavor: 'Tidy enough for a cable hit.' },
      { id: 'slick', name: 'Donor Slick', price: 85, flavor: 'Whispers every dollar.' },
      { id: 'pompadour', name: 'Breaking Pompadour', price: 120, flavor: 'Developing story on top.' },
      { id: 'long', name: 'Podcast Mane', price: 60, flavor: 'Three hours long, no edits.' },
      { id: 'bob', name: 'The Producer', price: 70, flavor: 'Four minutes. Three. Go.' },
      { id: 'bun', name: 'Fellowship Bun', price: 55, flavor: 'Holds a pencil and a position.' },
      { id: 'mohawk', name: 'Placard Mohawk', price: 90, flavor: 'Pre-chanted.' },
      { id: 'afro', name: 'Full Volume', price: 95, flavor: 'Maximum signal.' },
      { id: 'bald', name: 'Clean Slate', price: 25, flavor: 'Nothing to grab in a debate.' }
    ],
    colors: [
      { id: 'brown', name: 'Studio Brown', hex: '#3a2a1a', price: 0 },
      { id: 'black', name: 'Off-Air Black', hex: '#141414', price: 0 },
      { id: 'blond', name: 'Ring-Light Blond', hex: '#c8a560', price: 30 },
      { id: 'grey', name: 'Distinguished Grey', hex: '#9c9c9c', price: 30 },
      { id: 'pink', name: 'Brand Pink', hex: '#ff3fa4', price: 60 },
      { id: 'teal', name: 'Producer Teal', hex: '#27c9c2', price: 60 }
    ]
  };

  // ============================================================== state ==
  var S = null;   // all saved state lives here (see blank())
  function blank() {
    return {
      properties: { owned: {}, bought: 0, income: 0, lastDay: null, log: [] },
      stocks: { prices: {}, history: {}, holdings: {}, trades: 0, realized: 0, lastHour: null, news: [], reacted: {} },
      golf: { rounds: 0, best: null, bestToPar: null, birdies: 0, aces: 0, eagles: 0, holesPlayed: 0, underPar: 0, lastCard: null },
      achievements: { unlocked: {} },
      cheats: { found: {}, used: 0, on: {} },
      jobs: { best: {}, clients: 0, fires: 0, earned: 0, done: {}, runs: 0 },
      wardrobe: { owned: {}, equipped: {}, hair: null, hairColor: null, bought: 0, haircuts: 0, spent: 0 },
      stats: { moneyPeak: 0, systemsEarned: 0 }
    };
  }
  S = blank();

  var Systems = GTP.Systems = {
    version: 1,
    get state() { return S; },
    data: {},
    errors: []
  };

  // ============================================================ properties ==
  var props = {
    defs: function () {
      return table('properties', FB.properties).map(function (d) {
        return Object.assign({ kind: 'business', price: 0, income: 0, garage: 0 }, d, { kind: d.kind === 'safehouse' || d.save ? 'safehouse' : (d.kind || 'business') });
      });
    },
    def: function (id) { var L = props.defs(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; },
    point: function (id) { var d = typeof id === 'string' ? props.def(id) : id; return d ? landmarkPoint(d) : null; },
    owned: function (id) { return !!S.properties.owned[id]; },
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
    buy: function (id) {
      var d = props.def(id), p = player();
      if (!d) return { ok: false, reason: 'unknown' };
      if (props.owned(id)) return { ok: false, reason: 'owned' };
      var lock = props.lockReason(d); if (lock) return { ok: false, reason: 'locked', lockReason: lock };
      if (!p) return { ok: false, reason: 'noplayer' };
      if (inMission()) return { ok: false, reason: 'mission' };
      var price = d.price | 0;
      if (p.money < price) return { ok: false, reason: 'money', need: price - p.money };
      p.money -= price;
      if (p.stats) p.stats.spent = (p.stats.spent || 0) + price;
      S.properties.owned[id] = { day: dayNow(), price: price };
      S.properties.bought++;
      emit('property:buy', { id: id, name: d.name, price: price, kind: d.kind });
      emit('shop:buy', { item: id, price: price, kind: 'property' });
      toast((d.kind === 'safehouse' ? 'Safehouse bought: ' : 'Property bought: ') + d.name);
      sfx('cash', 0.8);
      markersDirty = true;
      checkAchievements();
      return { ok: true, price: price };
    },
    // an owned safehouse saves the game (the active slot, else slot 1)
    save: function (id, opts) {
      var d = props.def(id), g = game();
      if (!d || d.kind !== 'safehouse') return { ok: false, reason: 'notsafehouse' };
      if (!props.owned(id)) return { ok: false, reason: 'notowned' };
      if (inMission()) return { ok: false, reason: 'mission' };
      if (wanted() > 0) return { ok: false, reason: 'wanted' };
      if (!g || !g.saveSlot) return { ok: false, reason: 'nosave' };
      var ok = false;
      try { ok = !!g.saveSlot(g.activeSlot || 1, { reason: 'safehouse', quiet: !!(opts && opts.quiet) }); } catch (e) { report(e, 'systems.save'); }
      emit('property:save', { id: id, ok: ok });
      if (ok && !(opts && opts.quiet)) toast('Saved at ' + d.name);
      return { ok: ok, reason: ok ? null : 'failed' };
    },
    // sleep in a safehouse: six game hours pass (income and the market catch up), health refills, then save
    sleep: function (id, hours) {
      var d = props.def(id), g = game(), p = player();
      if (!d || d.kind !== 'safehouse') return { ok: false, reason: 'notsafehouse' };
      if (!props.owned(id)) return { ok: false, reason: 'notowned' };
      if (inMission()) return { ok: false, reason: 'mission' };
      if (wanted() > 0) return { ok: false, reason: 'wanted' };
      if (g && g.time) {
        var h = hours == null ? 6 : hours;
        g.time.clock += h;
        while (g.time.clock >= 24) { g.time.clock -= 24; g.time.day++; }
        if (GTP.Render && GTP.Render.updateEnvironment) { try { GTP.Render.updateEnvironment(g.time.clock); } catch (e) { /* render optional */ } }
      }
      if (p) p.hp = p.maxHp;
      tickClock();
      emit('property:sleep', { id: id });
      return props.save(id);
    },
    // one game day of income for every owned business; returns the total
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
  // the property:open payload carries handled:false; a listener (the UI's property screen) sets it true. Unhandled, an owned
  // safehouse saves on the spot and a sale shows a toast, so the systems work without the UI track.
  function openProperty(id) {
    var d = props.def(id); if (!d) return;
    var own = props.owned(id), payload = { id: id, name: d.name, kind: d.kind, owned: own, price: d.price | 0, income: d.income | 0, handled: false, locked: !!props.lockReason(d) };
    emit('property:open', payload);
    if (payload.handled) return;
    if (own && d.kind === 'safehouse') { var r = props.save(id); if (!r.ok) toast(d.name + ': ' + (r.reason === 'wanted' ? 'lose the heat before you save.' : r.reason === 'mission' ? 'finish the mission first.' : 'could not save.')); }
    else if (!own) toast(d.name + ': for sale, ' + money(d.price) + (payload.locked ? ' (not yet available)' : ' (Systems.properties.buy)'));
    else toast(d.name + ': yours. ' + money(d.income) + ' a day.');
  }

  // =============================================================== stocks ==
  var stocks = {
    defs: function () { return table('stocks', FB.stocks).map(function (d) { return Object.assign({ vol: 0.025, drift: 0, price: 20 }, d, { ticker: d.ticker || d.id }); }); },
    reactions: function () { var P = parity(), r = P && (P.stockReactions || (P.stocks && P.stocks.reactions)); return r || FB.stockReactions; },
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
      return { ticker: t, name: d.name, flavor: d.flavor, price: px, change: open ? (px - open) / open : 0, history: h.slice(-48), qty: hold.qty, cost: hold.cost,
        value: hold.qty * px, avg: hold.qty ? hold.cost / hold.qty : 0, gain: hold.qty * px - hold.cost };
    },
    list: function () { return stocks.defs().map(function (d) { return stocks.quote(d.ticker); }); },
    history: function (t) { stocks.ensure(); return (S.stocks.history[t] || []).slice(); },
    fee: function () { var P = parity(); return P && P.stocks && P.stocks.fee != null ? P.stocks.fee : 10; },
    buy: function (t, qty) {
      var d = stocks.def(t), p = player(); qty = Math.floor(qty || 0);
      if (!d) return { ok: false, reason: 'unknown' };
      if (qty <= 0) return { ok: false, reason: 'qty' };
      if (!p) return { ok: false, reason: 'noplayer' };
      var px = stocks.price(t), cost = Math.round((px * qty + stocks.fee()) * 100) / 100;
      if (p.money < cost) return { ok: false, reason: 'money', need: cost - p.money };
      p.money -= cost;
      var h = S.stocks.holdings[t] || (S.stocks.holdings[t] = { qty: 0, cost: 0 });
      h.qty += qty; h.cost += px * qty;
      S.stocks.trades++;
      emit('stocks:trade', { ticker: t, side: 'buy', qty: qty, price: px, total: cost });
      sfx('cash', 0.5);
      checkAchievements();
      return { ok: true, qty: qty, price: px, total: cost };
    },
    sell: function (t, qty) {
      var d = stocks.def(t), p = player(), h = S.stocks.holdings[t];
      if (!d) return { ok: false, reason: 'unknown' };
      if (!h || h.qty <= 0) return { ok: false, reason: 'none' };
      qty = qty == null ? h.qty : Math.floor(qty);
      if (qty <= 0) return { ok: false, reason: 'qty' };
      if (qty > h.qty) return { ok: false, reason: 'qty' };
      var px = stocks.price(t), basis = h.cost * (qty / h.qty), gross = px * qty, net = Math.max(0, gross - stocks.fee());
      h.qty -= qty; h.cost -= basis; if (h.qty <= 0) { h.qty = 0; h.cost = 0; }
      if (p) p.money += Math.round(net);
      var gain = net - basis;
      S.stocks.realized += gain; S.stocks.trades++;
      if (gain > 0) S.stats.systemsEarned += gain;
      emit('stocks:trade', { ticker: t, side: 'sell', qty: qty, price: px, total: net, gain: gain });
      sfx('cash', 0.5);
      checkAchievements();
      return { ok: true, qty: qty, price: px, total: net, gain: gain };
    },
    portfolio: function () {
      var rows = [], value = 0, cost = 0;
      for (var t in S.stocks.holdings) { var h = S.stocks.holdings[t]; if (!h || h.qty <= 0) continue; var px = stocks.price(t); rows.push({ ticker: t, qty: h.qty, cost: h.cost, value: h.qty * px, gain: h.qty * px - h.cost }); value += h.qty * px; cost += h.cost; }
      return { rows: rows, value: value, cost: cost, gain: value - cost, realized: S.stocks.realized, trades: S.stocks.trades };
    },
    // one game hour of the random walk for every ticker
    tick: function (hours) {
      stocks.ensure();
      var n = Math.max(1, hours | 0), defs = stocks.defs();
      for (var k = 0; k < n; k++) {
        for (var i = 0; i < defs.length; i++) {
          var d = defs[i], t = d.ticker, px = S.stocks.prices[t];
          var step = (d.drift || 0) / 24 + (d.vol || 0.02) / Math.sqrt(24) * gauss();
          // a soft pull back toward the listing price so a long session never drifts to zero or the moon
          var anchor = +d.price || px; step += 0.004 * Math.log(anchor / px);
          px = clamp(px * Math.exp(step), 0.05, 1e6);
          S.stocks.prices[t] = Math.round(px * 100) / 100;
          var h = S.stocks.history[t]; h.push(S.stocks.prices[t]); if (h.length > 96) h.splice(0, h.length - 96);
        }
      }
      emit('stocks:tick', { hours: n });
    },
    shock: function (t, frac, headline) {
      stocks.ensure();
      if (S.stocks.prices[t] == null) return false;
      var px = Math.max(0.05, S.stocks.prices[t] * (1 + frac));
      S.stocks.prices[t] = Math.round(px * 100) / 100;
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
  var golf = {
    course: function () {
      var Wd = W(), lm = null; try { lm = Wd && Wd.landmark ? Wd.landmark('goldplate_links') : null; } catch (e) { lm = null; }
      var P = parity(), cfg = P && P.golf && !Array.isArray(P.golf) ? P.golf : {};
      if (lm) return { x0: lm.x - lm.w / 2, z0: lm.z - lm.d / 2, x1: lm.x + lm.w / 2, z1: lm.z + lm.d / 2, lm: lm, name: cfg.name || lm.name || 'Goldplate Links' };
      return { x0: 516, z0: 92, x1: 556, z1: 272, lm: null, name: cfg.name || 'Goldplate Links' };
    },
    clubs: function () { var P = parity(), c = P && P.golf && !Array.isArray(P.golf) && P.golf.clubs; return asList(c).length ? asList(c) : FB.clubs; },
    lines: function () { var P = parity(), l = P && P.golf && !Array.isArray(P.golf) && P.golf.lines; return Object.assign({}, FB.golfLines, l || {}); },
    // a point in course space (u, v), absolute (x, z), or a named World point (tee1 / pin1 / hole1_tee ...)
    resolve: function (pt, c, holeNo, which) {
      var lm = c.lm, names = [which + holeNo, 'hole' + holeNo + '_' + which, 'h' + holeNo + '_' + which, which + '_' + holeNo];
      if (lm && lm.points) for (var i = 0; i < names.length; i++) if (lm.points[names[i]]) return { x: lm.points[names[i]].x, z: lm.points[names[i]].z };
      if (pt && pt.x != null && pt.z != null) return { x: pt.x, z: pt.z };
      var u = pt && pt.u != null ? pt.u : 0.5, v = pt && pt.v != null ? pt.v : 0.5;
      // the long side of the lot is "along"
      if (c.x1 - c.x0 >= c.z1 - c.z0) return { x: c.x0 + v * (c.x1 - c.x0), z: c.z0 + u * (c.z1 - c.z0) };
      return { x: c.x0 + u * (c.x1 - c.x0), z: c.z0 + v * (c.z1 - c.z0) };
    },
    holes: function () {
      var c = golf.course();
      return table('golf', FB.golf).slice(0, 9).map(function (h, i) {
        var tee = golf.resolve(h.tee, c, i + 1, 'tee'), pin = golf.resolve(h.pin, c, i + 1, 'pin');
        var hz = (h.hazards || []).map(function (z) { var p = golf.resolve(z, c, 0, 'hz'); return { kind: z.kind || 'sand', x: p.x, z: p.z, r: z.r || 4 }; });
        return { index: i, id: h.id || ('g' + (i + 1)), name: h.name || ('Hole ' + (i + 1)), par: h.par || 3, tee: tee, pin: pin, hazards: hz, wind: h.wind == null ? 3 : h.wind, length: Math.round(dist(tee.x, tee.z, pin.x, pin.z)) };
      });
    },
    get active() { return !!golfRun; },
    canStart: function () {
      var p = player();
      if (golfRun) return 'active';
      if (!p || !p.alive) return 'noplayer';
      if (p.inVehicle) return 'vehicle';
      if (inMission()) return 'mission';
      if (inStrand() || job) return 'busy';
      if (wanted() > 0) return 'wanted';
      return null;
    },
    start: function (opts) {
      opts = opts || {};
      var why = opts.force ? null : golf.canStart();
      if (why) return { ok: false, reason: why };
      var holes = golf.holes(), first = clamp(opts.hole | 0, 0, holes.length - 1);
      golfRun = { holes: holes, hole: first, card: [], strokes: 0, phase: 'aim', ball: null, prev: null, aim: 0, club: 0, power: 0, meter: 0, meterT: 0,
        wind: { speed: 0, dir: 0 }, message: golf.lines().start, last: null, single: !!opts.single, t: 0 };
      golf._setupHole();
      emit('golf:start', { hole: first, holes: holes.length, par: holes[first].par, course: golf.course().name });
      toast(golf.lines().start);
      return { ok: true };
    },
    _setupHole: function () {
      var r = golfRun, h = r.holes[r.hole], g0 = groundY(h.tee.x, h.tee.z);
      r.strokes = 0; r.phase = 'aim'; r.power = 0; r.meter = 0;
      r.ball = { x: h.tee.x, y: g0, z: h.tee.z, vx: 0, vy: 0, vz: 0, lie: 'tee', ground: g0 };
      r.prev = { x: h.tee.x, z: h.tee.z, lie: 'tee' };
      r.aim = dirYaw(h.pin.x - h.tee.x, h.pin.z - h.tee.z);
      r.wind = { speed: Math.round(clamp(h.wind * (0.6 + 0.8 * rnd()), 0, 12) * 10) / 10, dir: rrange(-Math.PI, Math.PI) };
      r.club = golf.autoClub(dist(h.tee.x, h.tee.z, h.pin.x, h.pin.z), 'tee');
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
    lieAt: function (x, z) {
      var r = golfRun, h = r.holes[r.hole], c = golf.course();
      if (x < c.x0 - GOLF.obMargin || x > c.x1 + GOLF.obMargin || z < c.z0 - GOLF.obMargin || z > c.z1 + GOLF.obMargin) return 'ob';
      var Wd = W(), T = Wd && Wd.T;
      if (T && Wd.tileAt) {
        var tt = Wd.tileAt(x, z);
        if (tt === T.WATER) return 'water';
        if (tt === T.ROAD || tt === T.BUILDING || tt === T.HIGHWAY || tt === T.VOID || tt === T.RAMP) return 'ob';
      }
      for (var i = 0; i < h.hazards.length; i++) { var hz = h.hazards[i]; if (dist(x, z, hz.x, hz.z) <= hz.r) return hz.kind === 'water' ? 'water' : 'sand'; }
      if (dist(x, z, h.pin.x, h.pin.z) <= GOLF.greenR) return 'green';
      // the fairway: a corridor along the tee -> pin line
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
      if (r.phase === 'holed' || r.phase === 'card') { golf.next(); return true; }
      return false;
    },
    // hit the ball with power 0..1 along the aim (or `angle`, a yaw); flight runs in update()
    shoot: function (power, angle) {
      var r = golfRun; if (!r || (r.phase !== 'aim' && r.phase !== 'swing')) return false;
      var h = r.holes[r.hole], b = r.ball, cl = golf.clubs()[r.club];
      if (angle != null) r.aim = wrapAngle(angle);
      power = clamp(power == null ? 0.8 : +power, 0.02, 1);
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
        // the putter: a pure roll; v0 so it stops at `carry` on the green
        var v0 = Math.sqrt(2 * GOLF.roll.green * carry);
        b.vx = dir.x * v0; b.vz = dir.z * v0; b.vy = 0; b.rolling = true;
      } else {
        var v = Math.sqrt(carry * GOLF.g / Math.sin(2 * cl.loft));
        b.vx = dir.x * v * Math.cos(cl.loft); b.vz = dir.z * v * Math.cos(cl.loft); b.vy = v * Math.sin(cl.loft); b.rolling = false;
      }
      r.last = { power: power, angle: yaw, club: cl.id, from: { x: r.prev.x, z: r.prev.z } };
      emit('golf:shot', { power: power, angle: yaw, club: cl.id, hole: r.hole, stroke: r.strokes });
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
      // closest approach of this step's segment to the pin
      var sx = b.x - ox, sz = b.z - oz, L2 = sx * sx + sz * sz, tt = L2 > 0 ? clamp(((h.pin.x - ox) * sx + (h.pin.z - oz) * sz) / L2, 0, 1) : 0;
      var cd = dist(ox + sx * tt, oz + sz * tt, h.pin.x, h.pin.z);
      if (cd <= GOLF.cupR && sp <= GOLF.cupSpeed) { b.x = h.pin.x; b.z = h.pin.z; b.vx = b.vz = 0; return golf._holed(); }
      b.lie = lie2;
      if (b.vx === 0 && b.vz === 0) golf._rest();
    },
    _penalty: function (kind) {
      var r = golfRun, b = r.ball, L = golf.lines();
      r.strokes++;
      b.x = r.prev.x; b.z = r.prev.z; b.y = b.ground; b.vx = b.vy = b.vz = 0; b.rolling = false; b.lie = r.prev.lie === 'tee' ? 'tee' : r.prev.lie;
      r.message = kind === 'water' ? L.water : L.ob;
      emit('golf:penalty', { kind: kind, hole: r.hole, strokes: r.strokes });
      golf._afterShot();
    },
    _rest: function () {
      var r = golfRun, b = r.ball, h = r.holes[r.hole];
      b.rolling = false;
      r.message = b.lie === 'sand' ? golf.lines().sand : null;
      emit('golf:rest', { hole: r.hole, lie: b.lie, dist: dist(b.x, b.z, h.pin.x, h.pin.z), strokes: r.strokes });
      golf._afterShot();
    },
    _afterShot: function () {
      var r = golfRun, h = r.holes[r.hole], b = r.ball;
      // pick up after par + 4 (a ten, as the sign says, on the par 5 and a little kinder elsewhere)
      if (r.strokes >= h.par + 4) { r.strokes = h.par + 4; return golf._holed(true); }
      r.phase = 'aim'; r.meter = 0;
      r.aim = dirYaw(h.pin.x - b.x, h.pin.z - b.z);
      r.club = golf.autoClub(dist(b.x, b.z, h.pin.x, h.pin.z), b.lie);
      golf._placePlayer();
    },
    scoreName: function (strokes, par) {
      if (strokes === 1) return 'Hole in One';
      var d = strokes - par;
      return d <= -3 ? 'Albatross' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double Bogey' : 'Goldplate Par';
    },
    _holed: function (pickedUp) {
      var r = golfRun, h = r.holes[r.hole], name = pickedUp ? 'Picked Up' : golf.scoreName(r.strokes, h.par), L = golf.lines();
      r.card[r.hole] = { hole: r.hole, par: h.par, strokes: r.strokes, name: name };
      r.phase = 'holed';
      S.golf.holesPlayed++;
      if (!pickedUp) {
        if (r.strokes === 1) S.golf.aces++;
        if (r.strokes - h.par === -1) S.golf.birdies++;
        if (r.strokes - h.par <= -2 && r.strokes > 1) S.golf.eagles++;
      }
      r.message = name + '. ' + (r.strokes < h.par ? L.hole[1] : L.hole[0]);
      emit('golf:hole', { hole: r.hole, strokes: r.strokes, par: h.par, name: name });
      sfx('cash', 0.4);
      checkAchievements();
    },
    // after a holed ball: the next hole, or the end of the round
    next: function () {
      var r = golfRun; if (!r || r.phase !== 'holed') return false;
      var last = r.single || r.hole >= r.holes.length - 1;
      if (last) return golf.end('done');
      r.hole++;
      golf._setupHole();
      emit('golf:holeStart', { hole: r.hole, par: r.holes[r.hole].par });
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
        // the clubhouse pays $100 a stroke under par (Goldplate's par: ten a hole, so everyone is "under par" on his card)
        var p = player(); if (tp < 0 && p) { var prize = -tp * 100; p.money += prize; S.stats.systemsEarned += prize; toast('Under par: +' + money(prize)); }
      }
      S.golf.lastCard = { card: r.card.filter(Boolean), strokes: strokes, par: par, full: full };
      golfRun = null;
      golf._dropMeshes();
      var p2 = player(); if (p2) { p2.intent = p2.intent || {}; p2.intent.x = 0; p2.intent.z = 0; }
      emit('golf:end', { strokes: strokes, par: par, toPar: strokes - par, holes: played.length, full: full, reason: reason || 'quit', card: S.golf.lastCard.card });
      checkAchievements();
      return true;
    },
    quit: function () { return golf.end('quit'); },
    // play the current shot out instantly (tests, a skip button)
    settle: function (maxSeconds) {
      var r = golfRun; if (!r) return null;
      var n = Math.round((maxSeconds || 30) * 60);
      for (var i = 0; i < n && golfRun && golfRun.phase === 'flight'; i++) golf._stepBall(1 / 60);
      return golf.state();
    },
    update: function (dt) {
      var r = golfRun; if (!r) return;
      var p = player();
      if (!p || !p.alive || p.inVehicle || wanted() > 0 || inMission()) { golf.end('interrupted'); return; }
      var In = GTP.Input, g = game();
      if (In && g && g.state === 'playing') {
        if (r.phase === 'aim') {
          if (In.down('left')) golf.aimBy(GOLF.aimRate * dt);
          if (In.down('right')) golf.aimBy(-GOLF.aimRate * dt);
          if (In.pressed('forward')) golf.selectClub(-1);
          if (In.pressed('back') && !In.pressed('cancel')) golf.selectClub(1);
        }
        if (In.pressed('jump') || In.pressed('shoot') || In.pressed('confirm')) golf.press();
        if (In.pressed('enter')) { golf.quit(); return; }
      }
      if (r.phase === 'swing') {
        // the meter climbs to full and falls back over meterPeriod; a late second press is a weak shot
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
      var r = golfRun, p = player(); if (!r || !p) return;
      var b = r.ball;
      if (r.phase === 'flight') return;   // stays where it swung
      var d = yawDir(r.aim);
      var px = b.x - d.x * 0.9 + d.z * 0.35, pz = b.z - d.z * 0.9 - d.x * 0.35;
      p.x = px; p.z = pz; p.y = groundY(px, pz); p.vx = p.vz = 0; p.yaw = r.aim; p.moveYaw = r.aim; p.aimYaw = r.aim;
      if (p.snap) { try { p.snap(); } catch (e) { /* entity optional */ } }
      var Rd = GTP.Render; if (Rd && Rd.rig && r.phase === 'aim') Rd.rig.yaw = r.aim;
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
    // what the golf HUD draws
    state: function () {
      var r = golfRun;
      if (!r) return { active: false, rounds: S.golf.rounds, best: S.golf.best, bestToPar: S.golf.bestToPar, lastCard: S.golf.lastCard };
      var h = r.holes[r.hole], b = r.ball, cl = golf.clubs(), total = 0, par = 0;
      r.card.forEach(function (c) { if (c) { total += c.strokes; par += c.par; } });
      return { active: true, phase: r.phase, hole: r.hole, holes: r.holes.length, name: h.name, par: h.par, length: h.length, strokes: r.strokes,
        ball: { x: b.x, y: b.y, z: b.z, lie: b.lie }, pin: { x: h.pin.x, z: h.pin.z }, tee: { x: h.tee.x, z: h.tee.z }, hazards: h.hazards,
        aim: r.aim, club: cl[r.club].id, clubName: cl[r.club].name, clubCarry: cl[r.club].carry, clubs: cl.map(function (c) { return c.id; }),
        meter: r.meter, power: r.power, wind: { speed: r.wind.speed, dir: r.wind.dir }, distToPin: dist(b.x, b.z, h.pin.x, h.pin.z),
        card: r.card.slice(), total: total, totalPar: par, message: r.message, last: r.last, course: golf.course().name };
    }
  };

  // ========================================================= achievements ==
  var achievements = {
    // a content entry without a condition inherits the fallback's by id; {condition: {stat, goal|gte}} is read too
    defs: function () {
      var fb = {}; FB.achievements.forEach(function (d) { fb[d.id] = d; });
      return table('achievements', FB.achievements).map(function (d) {
        var c = d.condition || {}, stat = d.stat || c.stat, goal = d.goal != null ? d.goal : (c.goal != null ? c.goal : c.gte);
        if (!stat && fb[d.id]) { stat = fb[d.id].stat; goal = fb[d.id].goal; }
        return Object.assign({}, d, { stat: stat || null, goal: goal == null ? null : +goal });
      });
    },
    def: function (id) { var L = achievements.defs(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; },
    unlocked: function (id) { return !!S.achievements.unlocked[id]; },
    list: function () {
      var st = Systems.stats();
      return achievements.defs().map(function (d) {
        var u = S.achievements.unlocked[d.id], have = d.stat && st[d.stat] != null ? st[d.stat] : 0;
        return { id: d.id, name: d.name, desc: d.desc, unlocked: !!u, at: u ? u.at : null, progress: d.goal ? clamp(have / d.goal, 0, 1) : (u ? 1 : 0), stat: d.stat, goal: d.goal };
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
  var achT = 0;
  function checkAchievements() {
    var st = Systems.stats(), defs = achievements.defs();
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      if (S.achievements.unlocked[d.id] || !d.stat || d.goal == null) continue;
      if ((st[d.stat] || 0) >= d.goal) unlock(d.id);
    }
  }

  // ================================================================ stats ==
  function dayNow() { var g = game(); return g && g.time ? g.time.day : 1; }
  function stats() {
    var p = player(), ps = (p && p.stats) || {}, g = game(), out = {};
    for (var k in ps) if (typeof ps[k] === 'number') out[k] = ps[k];
    var pf = stocks.portfolio(), held = 0;
    for (var t in S.stocks.holdings) if (S.stocks.holdings[t] && S.stocks.holdings[t].qty > 0) held++;
    var defs = props.defs(), owned = props.ownedList();
    var c = completed();
    out.missions = Math.max(out.missions || 0, c ? (c.size || 0) : 0);
    out.money = p ? (p.money | 0) : 0;
    out.moneyPeak = Math.max(S.stats.moneyPeak || 0, out.money);
    out.subs = p ? (p.subs | 0) : 0;
    out.playTime = g ? Math.round(g.playTime || 0) : 0;
    out.day = dayNow();
    out.distanceTotal = Math.round((ps.distance || 0) + (ps.distanceDriven || 0));
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
  function statsPage() {
    var st = stats(), M = missions(), total = 0;
    try { total = (M && M.allMissions ? M.allMissions().length : 0) || 0; } catch (e) { total = 0; }
    function row(label, value, raw) { return { label: label, value: String(value), raw: raw == null ? value : raw }; }
    var acc = st.shots ? Math.round(100 * (st.hits || 0) / st.shots) + '%' : '-';
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
        row('Knockouts', st.kills || 0), row('Punches thrown', st.punches || 0), row('Hot takes thrown', st.hottakes || 0),
        row('Times ratio\'d', st.deaths || 0), row('Times deplatformed', st.busted || 0)] },
      { id: 'travel', title: 'Getting Around', rows: [
        row('Distance on foot', fmtDist(st.distance || 0), st.distance || 0), row('Distance driven', fmtDist(st.distanceDriven || 0), st.distanceDriven || 0),
        row('Vehicles borrowed', st.vehiclesStolen || 0), row('Crashes', st.crashes || 0), row('Props flattened', st.propsKnocked || 0), row('Jumps', st.jumps || 0), row('Honks', st.honking || 0)] },
      { id: 'leisure', title: 'Leisure', rows: [
        row('Golf rounds', st.golfRounds), row('Best round', st.golfBest == null ? '-' : st.golfBest + (st.golfBestToPar == null ? '' : ' (' + (st.golfBestToPar > 0 ? '+' : st.golfBestToPar === 0 ? 'E' : '') + (st.golfBestToPar === 0 ? '' : st.golfBestToPar) + ')'), st.golfBest),
        row('Birdies', st.golfBirdies), row('Holes in one', st.golfAces), row('Clothes bought', st.outfitsBought), row('Haircuts', st.haircuts), row('Cheats entered', st.cheatsUsed)] },
      { id: 'jobs', title: 'Jobs', rows: [
        row('Damage Control best level', st.dcBestLevel), row('Clients delivered', st.dcClients), row('Hot Take Brigade best level', st.htbBestLevel), row('Hot takes cooled', st.htbFires)] }
    ];
  }

  // =============================================================== cheats ==
  var cheatBuf = '';
  var cheats = {
    // a content cheat whose effect this file does not implement borrows the fallback's (by id, else by position), so six
    // codes always do something
    defs: function () {
      var known = { clock: 1, respectfully: 1, bigheads: 1, moonjump: 1, weather: 1, slowmo: 1 }, byId = {};
      FB.cheats.forEach(function (d) { byId[d.id] = d; });
      return table('cheats', FB.cheats).map(function (d, i) {
        var fb = byId[d.id] || FB.cheats[i % FB.cheats.length], eff = known[d.effect] ? d.effect : fb.effect;
        return Object.assign({}, d, { effect: eff, toggle: eff === 'bigheads' || eff === 'moonjump' || eff === 'slowmo', code: String(d.code || d.id).toUpperCase().replace(/[^A-Z0-9]/g, '') });
      });
    },
    list: function () { return cheats.defs().map(function (d) { return { id: d.id, name: d.name, desc: d.desc, found: !!S.cheats.found[d.id], on: !!S.cheats.on[d.id], toggle: !!d.toggle, code: S.cheats.found[d.id] ? d.code : null }; }); },
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
      try { applyCheat(d.effect || d.id, on); } catch (e) { report(e, 'cheat ' + id); }
      emit('cheat', { id: id, name: d.name, on: on });
      toast('Cheat: ' + d.name + (d.toggle ? (on ? ' ON' : ' OFF') : ''));
      sfx('ui', 0.5);
      checkAchievements();
      return true;
    }
  };
  var RESPECT_LINES = ['Respectfully, no.', 'Respectfully, you\'re peaking.', 'Respectfully, read the room.', 'Respectfully, that\'s a ten.', 'Respectfully, is this paid?', 'Respectfully, didn\'t read.'];
  function applyCheat(effect, on) {
    var g = game(), p = player(), E = GTP.Entities;
    if (effect === 'clock') { if (g && g.debug && g.debug.setClock) g.debug.setClock(18.6); else if (g && g.time) g.time.clock = 18.6; }
    else if (effect === 'respectfully') {
      if (E && p) { var near = E.near ? E.near(p.x, p.z, 40) : []; var k = 0; near.forEach(function (e) { if (e.kind === 'ped' && e.alive && e.speakLine) { e.speakLine(RESPECT_LINES[k++ % RESPECT_LINES.length]); } }); }
      if (p && p.speakLine) p.speakLine('Respectfuly.');
    } else if (effect === 'bigheads') applyBigHeads();
    else if (effect === 'moonjump') { /* tickCheats boosts each jump while on */ }
    else if (effect === 'weather') {
      var Wt = GTP.Render && GTP.Render.weather, order = ['clear', 'overcast', 'rain'];
      var cur = Wt && (Wt.state || Wt.current), nx = order[(order.indexOf(cur) + 1) % order.length] || 'rain';
      if (g && g.debug && g.debug.setWeather) g.debug.setWeather(nx, false);
    } else if (effect === 'slowmo') { if (g) g.timeScale = on ? 0.5 : 1; }
  }
  function applyBigHeads() {
    var E = GTP.Entities; if (!E || !E.list) return;
    var s = effectOn('bigheads') ? 2.1 : 1;
    for (var i = 0; i < E.list.length; i++) {
      var e = E.list[i]; if ((e.kind !== 'ped' && e.kind !== 'player') || !e.mesh || !e.mesh.getObjectByName) continue;
      var h = e.mesh.getObjectByName('head'); if (h && h.scale.x !== s) h.scale.set(s, s, s);
    }
  }
  var jumpWas = false, bigWas = false;
  function effectOn(eff) { var L = cheats.defs(); for (var i = 0; i < L.length; i++) if (L[i].effect === eff && S.cheats.on[L[i].id]) return true; return false; }
  function tickCheats() {
    var p = player(); if (!p) return;
    var any = bigWas; for (var k in S.cheats.on) { any = true; break; }
    if (!any) return;
    if (effectOn('moonjump')) {
      // the first step of a jump (Ped consumed wantJump: off the ground and rising): triple its push, once
      var rising = !p.onGround && p.vy > 2 && !p.inVehicle;
      if (rising && !jumpWas) p.vy *= 1.75;
      jumpWas = rising || (!p.onGround && p.vy > 0);
    }
    if (effectOn('bigheads') || bigWas) { applyBigHeads(); bigWas = effectOn('bigheads'); }
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
  var job = null;          // the running job strand (not saved: saving is blocked while one runs)
  var jobs = {
    defs: function () { return table('jobs', FB.jobs).map(function (d) { var fb = d.id === 'hot_take_brigade' || d.kind === 'douse' ? FB.jobs[1] : FB.jobs[0]; return Object.assign({}, fb, d, { lines: Object.assign({}, fb.lines, d.lines || {}), perk: d.perk || fb.perk }); }); },
    def: function (id) { var L = jobs.defs(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; },
    get active() { return job ? job.id : null; },
    list: function () { return jobs.defs().map(function (d) { var pt = d.startAt ? { x: d.startAt.x, z: d.startAt.z } : roadSpot(d.start); return { id: d.id, name: d.name, kind: d.kind, best: S.jobs.best[d.id] || 0, done: !!S.jobs.done[d.id], levels: d.levels, x: pt ? pt.x : null, z: pt ? pt.z : null }; }); },
    canStart: function (id) {
      var p = player(), d = jobs.def(id);
      if (!d) return 'unknown';
      if (job) return 'active';
      if (!p || !p.alive) return 'noplayer';
      if (!p.inVehicle || !p.vehicle) return 'vehicle';
      if (inMission()) return 'mission';
      if (inStrand() || golfRun) return 'busy';
      return null;
    },
    start: function (id, opts) {
      var why = opts && opts.force ? null : jobs.canStart(id);
      if (why) return { ok: false, reason: why };
      var d = jobs.def(id);
      job = { id: id, def: d, level: Math.max(1, (opts && opts.level) | 0 || 1), phase: 'between', t: 2, timer: 0, calls: [], aboard: 0, earned: 0, offT: 0, holdT: 0, message: d.lines.start };
      S.jobs.runs++;
      emit('job:start', { id: id, name: d.name, level: job.level });
      toast(d.lines.start);
      return { ok: true };
    },
    stop: function (reason) { if (!job) return false; endJob(reason || 'quit'); return true; },
    state: function () {
      if (!job) return { active: false, best: copy(S.jobs.best) };
      var d = job.def, tgt = jobTarget();
      return { active: true, id: job.id, name: d.name, kind: d.kind, phase: job.phase, level: job.level, levels: d.levels, timer: Math.max(0, job.timer), earned: job.earned,
        aboard: job.aboard, capacity: d.capacity || 0, remaining: job.calls.filter(function (c) { return c.state !== 'done'; }).length, total: job.calls.length,
        calls: job.calls.map(function (c) { return { x: c.x, z: c.z, state: c.state, fuse: c.fuse != null ? Math.max(0, c.fuse) : null, douse: c.douse || 0 }; }),
        target: tgt, message: job.message };
    },
    // debug / tests: complete the current call or level without driving
    debug: {
      job: function () { return job; },
      finishLevel: function () { if (!job || job.phase !== 'run') return false; job.calls.forEach(function (c) { if (c.state !== 'done') { c.state = 'done'; dropCall(c); if (job.def.kind === 'rescue') S.jobs.clients++; else S.jobs.fires++; } }); job.aboard = 0; levelComplete(); return true; }
    }
  };
  function vehicleOf(p) { return p && p.inVehicle ? (p.vehicle || p.inVehicle) : null; }
  function speedOf(v) { if (!v) return 0; if (v.speed2d) { try { return v.speed2d(); } catch (e) { /* fallthrough */ } } return Math.abs(v.speed || 0); }
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
    var rp = Wd.randomRoadPoint ? Wd.randomRoadPoint() : null;
    return rp ? { x: rp.x, z: rp.z, y: rp.y || 0 } : { x: p.x + 60, z: p.z, y: 0 };
  }
  function deliverPoint() { return job ? landmarkPoint({ landmark: job.def.deliver || job.def.start }) : null; }
  function spawnCalls() {
    var d = job.def, p = player(), n = Math.min(job.level, d.kind === 'rescue' ? 8 : 6), dp = deliverPoint(), extra = 0;
    job.calls = []; job.aboard = 0;
    for (var i = 0; i < n; i++) {
      var pt = jobPoint(60, 140 + job.level * 25, d.kind === 'rescue' ? 'sidewalk' : 'road');
      if (!pt) continue;
      var c = { x: pt.x, z: pt.z, y: pt.y, state: 'waiting', holdT: 0, mesh: null, ped: null, douse: 0, fuse: null, fxT: 0 };
      var travel = dist(p.x, p.z, c.x, c.z) / 9;
      if (d.kind === 'rescue') {
        extra += travel * 0.6 + (dp ? dist(c.x, c.z, dp.x, dp.z) / 12 : 10) * 0.5 + 10;
        try { var g = game(); if (g && g.debug && g.debug.spawnPed) { c.ped = g.debug.spawnPed(c.x, c.z, null, 'civ'); if (c.ped) { c.ped.persistent = true; c.ped.tag = 'sys_client'; if (c.ped.stop) c.ped.stop(); } } } catch (e) { report(e, 'job.spawnPed'); c.ped = null; }
      } else {
        c.fuse = travel + 22 + rnd() * 8;
      }
      c.mesh = markerAt(c.x, c.y, c.z, d.kind === 'rescue' ? 0x2fd6ff : 0xff7a20);
      job.calls.push(c);
    }
    job.timer = d.kind === 'rescue' ? 25 + extra : Math.min.apply(null, job.calls.map(function (c) { return c.fuse; }).concat([60]));
    job.phase = 'run';
    job.message = d.lines.call;
    emit('job:level', { id: job.id, level: job.level, calls: job.calls.length, timer: job.timer });
  }
  function dropCall(c) {
    if (c.mesh) { unmarker(c.mesh); c.mesh = null; }
    if (c.ped) { try { if (GTP.Entities && GTP.Entities.remove && GTP.Entities.list.indexOf(c.ped) >= 0) GTP.Entities.remove(c.ped); } catch (e) { report(e, 'job.removePed'); } c.ped = null; }
  }
  function jobTarget() {
    if (!job || job.phase !== 'run') return null;
    var p = player(); if (!p) return null;
    if (job.def.kind === 'rescue' && job.aboard > 0 && (job.aboard >= (job.def.capacity || 3) || !job.calls.some(function (c) { return c.state === 'waiting'; }))) {
      var dp = deliverPoint(); return dp ? { x: dp.x, z: dp.z, kind: 'deliver' } : null;
    }
    var best = null, bd = Infinity;
    job.calls.forEach(function (c) { if (c.state !== 'waiting') return; var dd = dist(p.x, p.z, c.x, c.z); if (dd < bd) { bd = dd; best = c; } });
    return best ? { x: best.x, z: best.z, kind: job.def.kind === 'rescue' ? 'client' : 'fire', dist: bd } : null;
  }
  function pick(list) { return Array.isArray(list) ? list[Math.floor(rnd() * list.length)] : list; }
  function levelComplete() {
    var d = job.def, p = player(), pay = job.level * (d.payPerLevel || 150);
    if (p) p.money += pay;
    job.earned += pay; S.jobs.earned += pay; S.stats.systemsEarned += pay;
    S.jobs.best[job.id] = Math.max(S.jobs.best[job.id] || 0, job.level);
    emit('job:levelComplete', { id: job.id, level: job.level, pay: pay });
    toast(d.lines.level + ' Level ' + job.level + ': +' + money(pay));
    sfx('cash', 0.8);
    checkAchievements();
    if (job.level >= (d.levels || 12)) {
      if (!S.jobs.done[job.id]) {
        S.jobs.done[job.id] = true;
        var bonus = 5000; if (p) p.money += bonus; job.earned += bonus; S.jobs.earned += bonus;
        flags()['sys_job_' + job.id] = true;
        applyPerks();
        emit('job:complete', { id: job.id, bonus: bonus, perk: d.perk ? d.perk.text : null });
        toast(d.lines.done + (d.perk && d.perk.text ? ' ' + d.perk.text : ''));
      }
      endJob('complete');
      return;
    }
    job.level++; job.phase = 'between'; job.t = 3; job.message = d.lines.level;
  }
  function endJob(reason) {
    if (!job) return;
    var j = job; job = null;
    j.calls.forEach(dropCall);
    var lines = j.def.lines;
    var text = reason === 'timeout' ? lines.timeout : reason === 'lost' ? lines.lost : reason === 'vehicle' ? lines.vehicle : null;
    if (text) toast(text);
    emit('job:end', { id: j.id, reason: reason, level: j.level, best: S.jobs.best[j.id] || 0, earned: j.earned });
  }
  function tickJob(dt) {
    if (!job) return;
    var p = player(), d = job.def;
    if (!p || !p.alive) return endJob('dead');
    if (inMission()) return endJob('mission');
    var v = vehicleOf(p);
    if (!v) { job.offT += dt; if (job.offT > 12) return endJob('vehicle'); } else job.offT = 0;
    if (job.phase === 'between') { job.t -= dt; if (job.t <= 0) spawnCalls(); return; }
    if (job.phase !== 'run') return;
    job.timer -= dt;
    var spd = speedOf(v), i, c;
    if (d.kind === 'rescue') {
      for (i = 0; i < job.calls.length; i++) {
        c = job.calls[i];
        if (c.state !== 'waiting') continue;
        if (c.ped) { if (!c.ped.alive) return endJob('lost'); c.x = c.ped.x; c.z = c.ped.z; if (c.mesh) c.mesh.position.set(c.x, c.ped.y || 0, c.z); }
        if (v && job.aboard < (d.capacity || 3) && spd < 3 && dist(v.x, v.z, c.x, c.z) < 7) {
          c.holdT += dt;
          if (c.holdT >= 0.6) { c.state = 'aboard'; job.aboard++; dropCall(c); job.message = pick(d.lines.board); emit('job:pickup', { id: job.id, aboard: job.aboard }); }
        } else c.holdT = 0;
      }
      var dp = deliverPoint();
      if (v && job.aboard > 0 && dp && spd < 3 && dist(v.x, v.z, dp.x, dp.z) < 12) {
        job.holdT += dt;
        if (job.holdT >= 0.6) {
          var n = job.aboard, pay = n * (d.perCall || 40);
          job.aboard = 0; job.holdT = 0; job.timer += 8 * n;
          job.calls.forEach(function (cc) { if (cc.state === 'aboard') cc.state = 'done'; });
          S.jobs.clients += n;
          if (p) p.money += pay; job.earned += pay; S.jobs.earned += pay;
          job.message = d.lines.deliver;
          emit('job:deliver', { id: job.id, count: n, pay: pay });
          checkAchievements();
        }
      } else job.holdT = 0;
    } else {
      var minFuse = Infinity;
      for (i = 0; i < job.calls.length; i++) {
        c = job.calls[i];
        if (c.state !== 'waiting') continue;
        c.fuse -= dt;
        if (c.fuse <= 0) return endJob('timeout');
        minFuse = Math.min(minFuse, c.fuse);
        // flames for the takes near the player
        c.fxT -= dt;
        if (c.fxT <= 0 && dist(p.x, p.z, c.x, c.z) < 140) { c.fxT = 0.12; fx({ type: 'fire', x: c.x + rrange(-1, 1), y: (c.y || 0) + 0.3, z: c.z + rrange(-1, 1) }); if (rnd() < 0.3) fx({ type: 'smoke', x: c.x, y: (c.y || 0) + 1.5, z: c.z }); }
        if (v && spd < 3 && dist(v.x, v.z, c.x, c.z) < (d.douseRadius || 9)) {
          c.douse += dt;
          if (c.douse >= (d.douseTime || 2.5)) {
            c.state = 'done'; dropCall(c); S.jobs.fires++;
            var pay2 = d.perCall || 30; if (p) p.money += pay2; job.earned += pay2; S.jobs.earned += pay2;
            job.message = pick(d.lines.douse);
            fx({ type: 'puff', x: c.x, y: (c.y || 0) + 1, z: c.z });
            emit('job:douse', { id: job.id, pay: pay2 });
            checkAchievements();
          }
        } else c.douse = Math.max(0, c.douse - dt * 0.5);
      }
      job.timer = minFuse === Infinity ? 0 : minFuse;
    }
    if (!job) return;
    if (job.calls.every(function (cc) { return cc.state === 'done'; })) return levelComplete();
    if (d.kind === 'rescue' && job.timer <= 0) return endJob('timeout');
  }
  var perkBase = null;
  function applyPerks() {
    var p = player(); if (!p) return;
    if (perkBase == null || perkBase.p !== p) perkBase = { p: p, maxHp: p.maxHp };
    var dc = jobs.def('damage_control'), mul = S.jobs.done.damage_control && dc && dc.perk && dc.perk.maxHp ? dc.perk.maxHp : 1;
    var want = Math.round(perkBase.maxHp * mul);
    if (p.maxHp !== want) { var full = p.hp >= p.maxHp; p.maxHp = want; if (full || p.hp > want) p.hp = want; }
  }

  // ============================================================= wardrobe ==
  var wardrobe = {
    clothing: function () { return table('clothing', FB.clothing).map(function (d) { return Object.assign({ slot: 'top', price: 0 }, d); }); },
    barberData: function () {
      var P = parity(), b = P && P.barber;
      if (Array.isArray(b)) return { styles: b.filter(function (x) { return x.kind !== 'color'; }), colors: b.filter(function (x) { return x.kind === 'color'; }).concat(b.some(function (x) { return x.kind === 'color'; }) ? [] : FB.barber.colors) };
      if (b && (b.styles || b.colors)) return { styles: asList(b.styles).length ? asList(b.styles) : FB.barber.styles, colors: asList(b.colors).length ? asList(b.colors) : FB.barber.colors };
      return FB.barber;
    },
    item: function (id) { var L = wardrobe.clothing(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; },
    lockReason: function (d) { if (d.unlock && d.unlock.mission && !missionDone(d.unlock.mission)) return 'mission'; return null; },
    items: function (slot, store) {
      var p = player();
      return wardrobe.clothing().filter(function (d) { return (!slot || d.slot === slot) && (!store || !d.store || d.store === store); }).map(function (d) {
        var lock = wardrobe.lockReason(d), own = !!S.wardrobe.owned[d.id] || (d.price | 0) === 0;
        return Object.assign({}, d, { owned: own, equipped: S.wardrobe.equipped[d.slot] === d.id, locked: !!lock, lockReason: lock, canBuy: !lock && (own || (!!p && p.money >= (d.price | 0))) });
      });
    },
    slots: function () { var out = []; wardrobe.clothing().forEach(function (d) { if (out.indexOf(d.slot) < 0) out.push(d.slot); }); return out; },
    // buy (when not owned) and wear
    buy: function (id) {
      var d = wardrobe.item(id), p = player();
      if (!d) return { ok: false, reason: 'unknown' };
      if (!p) return { ok: false, reason: 'noplayer' };
      if (wardrobe.lockReason(d)) return { ok: false, reason: 'locked' };
      var price = d.price | 0, own = !!S.wardrobe.owned[id] || price === 0;
      if (!own) {
        if (p.money < price) return { ok: false, reason: 'money', need: price - p.money };
        p.money -= price; S.wardrobe.spent += price; S.wardrobe.bought++;
        if (p.stats) p.stats.spent = (p.stats.spent || 0) + price;
        S.wardrobe.owned[id] = true;
        emit('shop:buy', { item: id, price: price, kind: 'clothing' });
        emit('clothing:buy', { id: id, slot: d.slot, price: price });
        sfx('cash', 0.5);
      }
      wardrobe.equip(id);
      checkAchievements();
      return { ok: true, price: own ? 0 : price };
    },
    equip: function (id) {
      var d = wardrobe.item(id); if (!d) return false;
      if (!(S.wardrobe.owned[id] || (d.price | 0) === 0)) return false;
      S.wardrobe.equipped[d.slot] = id;
      applyLook();
      emit('clothing:equip', { id: id, slot: d.slot });
      return true;
    },
    // a haircut: style id and/or colour id (either may be null to keep the current one)
    hairOptions: function () {
      var b = wardrobe.barberData(), p = player(), cur = p && p.look ? p.look.hair : null, curC = p && p.look ? p.look.hairColor : null;
      return { styles: b.styles.map(function (s) { return Object.assign({}, s, { current: s.id === cur || s.style === cur }); }),
        colors: b.colors.map(function (c) { return Object.assign({}, c, { current: (c.hex || c.color) === curC }); }) };
    },
    haircut: function (styleId, colorId) {
      var b = wardrobe.barberData(), p = player();
      if (!p) return { ok: false, reason: 'noplayer' };
      var st = null, co = null, i;
      for (i = 0; i < b.styles.length; i++) if (b.styles[i].id === styleId) st = b.styles[i];
      for (i = 0; i < b.colors.length; i++) if (b.colors[i].id === colorId) co = b.colors[i];
      if (!st && !co) return { ok: false, reason: 'unknown' };
      var price = (st ? st.price | 0 : 0) + (co ? co.price | 0 : 0);
      if (p.money < price) return { ok: false, reason: 'money', need: price - p.money };
      p.money -= price; S.wardrobe.spent += price; S.wardrobe.haircuts++;
      if (p.stats) p.stats.spent = (p.stats.spent || 0) + price;
      if (st) S.wardrobe.hair = st.style || st.id;
      if (co) S.wardrobe.hairColor = co.hex || co.color;
      applyLook();
      emit('shop:buy', { item: 'hair:' + (st ? st.id : '') + (co ? ':' + co.id : ''), price: price, kind: 'barber' });
      emit('barber:buy', { style: st ? st.id : null, color: co ? co.id : null, price: price });
      sfx('cash', 0.5);
      checkAchievements();
      return { ok: true, price: price };
    },
    current: function () { return { equipped: copy(S.wardrobe.equipped), hair: S.wardrobe.hair, hairColor: S.wardrobe.hairColor, owned: Object.keys(S.wardrobe.owned) }; }
  };
  // writes the wardrobe into player.look (outfit ids for the models track, colour / keyword overrides for the current
  // renderer) and rebuilds the player's mesh
  function applyLook() {
    var p = player(); if (!p) return false;
    var look = Object.assign({}, p.look || {});
    look.outfit = Object.assign({}, look.outfit || {});
    for (var slot in S.wardrobe.equipped) {
      var d = wardrobe.item(S.wardrobe.equipped[slot]); if (!d) continue;
      look.outfit[slot] = d.id;
      if (d.look) for (var k in d.look) look[k] = d.look[k];
    }
    if (S.wardrobe.hair) look.hair = S.wardrobe.hair;
    if (S.wardrobe.hairColor) look.hairColor = S.wardrobe.hairColor;
    p.look = look;
    rebuildMesh(p);
    return true;
  }
  function rebuildMesh(e) {
    var Rd = GTP.Render; if (!Rd) return;
    try {
      if (Rd.rebuildEntityMesh) Rd.rebuildEntityMesh(e);
      else if (e.mesh && Rd.detach && Rd.attach) { Rd.detach(e); e.mesh = null; Rd.attach(e); }
    } catch (err) { report(err, 'systems.rebuildMesh'); }
  }

  // ============================================================== markers ==
  // world markers for properties, the golf course and the job starts; meshes exist only within MARKER_DRAW of the player
  var MARKER_DRAW = 90;
  var marks = [], markersDirty = true;
  function markerAt(x, y, z, color) {
    var Rd = GTP.Render; if (!Rd || !Rd.markerMesh || !Rd.addMarker) return null;
    try { var m = Rd.markerMesh(color); Rd.addMarker(m); m.position.set(x, y || 0, z); return m; } catch (e) { report(e, 'systems.marker'); return null; }
  }
  function unmarker(m) { var Rd = GTP.Render; if (m && Rd && Rd.removeMarker) { try { Rd.removeMarker(m); } catch (e) { /* render optional */ } } }
  function rebuildMarks() {
    marks.forEach(function (m) { unmarker(m.mesh); });
    marks = [];
    markersDirty = false;
    if (!W() || !W().landmark) return;
    props.list().forEach(function (d) {
      if (d.x == null || d.locked) return;
      if (d.owned && d.kind !== 'safehouse') return;
      if (d.start && d.id === 'safe_dorm') return;   // the pod van is Game's own home point
      marks.push({ id: 'property:' + d.id, ref: d.id, type: 'property', icon: d.owned ? 'home' : 'property', title: d.owned ? d.name : d.name + ' ' + money(d.price), x: d.x, z: d.z, y: groundY(d.x, d.z), r: 1.9, color: d.owned ? 0xffffff : 0x9dff3c, foot: true });
    });
    var holes = golf.holes();
    if (holes.length) { var t = holes[0].tee; marks.push({ id: 'golf', ref: 'golf', type: 'golf', icon: 'golf', title: golf.course().name, x: t.x, z: t.z, y: groundY(t.x, t.z), r: 2.2, color: 0xffd400, foot: true }); }
    jobs.list().forEach(function (j) { if (j.x == null) return; marks.push({ id: 'job:' + j.id, ref: j.id, type: 'job', icon: 'job', title: j.name, x: j.x, z: j.z, y: groundY(j.x, j.z), r: 5, color: j.id === 'hot_take_brigade' ? 0xff7a20 : 0x2fd6ff, car: true }); });
    var p = player();
    marks.forEach(function (m) { m.armed = !p || dist(p.x, p.z, m.x, m.z) > m.r + 1; m.holdT = 0; m.mesh = null; });
  }
  function groundY(x, z) { var Wd = W(); try { var y = Wd && Wd.heightAt ? Wd.heightAt(x, z, 0) : 0; return y > -1 ? y : 0; } catch (e) { return 0; } }
  function busy() { return inMission() || inStrand() || !!golfRun || !!job || inInterior(); }
  function tickMarkers(dt) {
    if (markersDirty) rebuildMarks();
    var p = player(); if (!p) return;
    var g = game(), cut = g && g.state === 'cutscene', hide = cut || inMission() || !!golfRun || !!job;
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i], d = dist(p.x, p.z, m.x, m.z);
      var want = !hide && d < MARKER_DRAW;
      if (want && !m.mesh) m.mesh = markerAt(m.x, m.y, m.z, m.color);
      else if (!want && m.mesh) { unmarker(m.mesh); m.mesh = null; }
      if (m.mesh && m.mesh.userData && typeof m.mesh.userData.pulse === 'function') { try { m.mesh.userData.pulse((g ? g.time.t : 0) * 2 + i); } catch (e) { /* optional */ } }
      if (d > m.r + 1.5) { m.armed = true; m.holdT = 0; continue; }
      if (!m.armed || d > m.r || !playing() || busy()) { m.holdT = 0; continue; }
      if (m.foot && p.inVehicle) continue;
      if (m.car && (!p.inVehicle || speedOf(vehicleOf(p)) > 3)) continue;
      m.holdT += dt;
      if (m.holdT < (m.car ? 1 : 0.5)) continue;
      m.armed = false; m.holdT = 0;
      if (m.type === 'property') openProperty(m.ref);
      else if (m.type === 'golf') { var r = golf.start(); if (!r.ok) toast('Goldplate Links: ' + (r.reason === 'wanted' ? 'lose the heat first.' : 'not now.')); }
      else if (m.type === 'job') { var rj = jobs.start(m.ref); if (!rj.ok && rj.reason === 'vehicle') toast('Bring a vehicle.'); }
    }
  }
  // minimap entries for the UI's allMarkers()
  function markerList() {
    var out = [], g = game();
    if (g && g.state === 'cutscene') return out;
    if (markersDirty && player()) rebuildMarks();
    if (!job && !golfRun) marks.forEach(function (m) { out.push({ id: 'sys:' + m.id, kind: 'system', icon: m.icon, x: m.x, z: m.z, y: m.y, title: m.title, color: m.color }); });
    if (job && job.phase === 'run') {
      job.calls.forEach(function (c, i) { if (c.state === 'waiting') out.push({ id: 'sys:call' + i, kind: 'objective', icon: job.def.kind === 'rescue' ? 'client' : 'fire', x: c.x, z: c.z, y: c.y, title: job.def.name, color: job.def.color }); });
      var t = jobTarget(); if (t && t.kind === 'deliver') out.push({ id: 'sys:deliver', kind: 'objective', icon: 'hospital', x: t.x, z: t.z, y: 0, title: 'Drop off', color: job.def.color });
    }
    if (golfRun) { var h = golfRun.holes[golfRun.hole]; out.push({ id: 'sys:pin', kind: 'objective', icon: 'golf', x: h.pin.x, z: h.pin.z, y: 0, title: h.name, color: 0xffd400 }); }
    return out;
  }

  // ================================================================ clock ==
  var clockKey = null;
  function absHour() { var g = game(); return g && g.time ? (g.time.day | 0) * 24 + Math.floor(g.time.clock || 0) : 0; }
  function tickClock() {
    var h = absHour(), g = game();
    if (S.stocks.lastHour == null || h < S.stocks.lastHour) S.stocks.lastHour = h;
    if (h > S.stocks.lastHour) { stocks.tick(Math.min(48, h - S.stocks.lastHour)); S.stocks.lastHour = h; }
    var day = g && g.time ? g.time.day | 0 : 1;
    if (S.properties.lastDay == null || day < S.properties.lastDay) S.properties.lastDay = day;
    if (day > S.properties.lastDay) { props.payDay(Math.min(7, day - S.properties.lastDay)); S.properties.lastDay = day; }
  }

  // =============================================================== update ==
  Systems.update = function (dt) {
    var g = game(); if (!g || !g.player) return;
    try {
      tickClock();
      var p = player();
      if (p && p.money > (S.stats.moneyPeak || 0)) S.stats.moneyPeak = p.money;
      if (g.state === 'playing') {
        if (golfRun) golf.update(dt);
        tickJob(dt);
        tickMarkers(dt);
      }
      tickCheats();
      achT += dt;
      if (achT >= 1) { achT = 0; checkAchievements(); }
    } catch (e) { report(e, 'systems.update'); }
  };

  // a new game (Missions.init runs inside Game.newGame, after the world and the player exist)
  Systems.reset = function () {
    if (golfRun) { golfRun = null; golf._dropMeshes(); }
    if (job) { var j = job; job = null; j.calls.forEach(dropCall); }
    marks.forEach(function (m) { unmarker(m.mesh); }); marks = [];
    S = blank();
    R = GTP.rng && GTP.rng.fork ? GTP.rng.fork(0x5157) : GTP.rng;
    perkBase = null; cheatBuf = ''; jumpWas = false; achT = 0;
    props.defs().forEach(function (d) { if (d.start || (d.price | 0) === 0) S.properties.owned[d.id] = { day: 1, price: 0 }; });
    stocks.ensure();
    S.stocks.lastHour = absHour();
    var g = game(); S.properties.lastDay = g && g.time ? g.time.day : 1;
    var p = player(); if (p) S.stats.moneyPeak = p.money | 0;
    // record what Bryce wears at the start so the wardrobe knows his look
    if (p && p.look) { S.wardrobe.hair = null; S.wardrobe.hairColor = null; }
    markersDirty = true;
    var g2 = game(); if (g2 && g2.timeScale === 0.5) g2.timeScale = 1;
    emit('systems:reset', {});
  };

  // ================================================================ saves ==
  Systems.serialize = function () {
    var out = copy(S);
    return out;
  };
  Systems.deserialize = function (data) {
    if (!data || typeof data !== 'object') return false;
    var base = blank();
    for (var k in base) if (data[k] && typeof data[k] === 'object') base[k] = Object.assign(base[k], copy(data[k]));
    S = base;
    if (golfRun) { golfRun = null; golf._dropMeshes(); }
    if (job) { var j = job; job = null; j.calls.forEach(dropCall); }
    stocks.ensure();
    S.stocks.lastHour = absHour();
    var g = game(); S.properties.lastDay = g && g.time ? g.time.day : S.properties.lastDay;
    // toggles that are runtime-only are restored from the saved set
    var g2 = game(); if (g2) g2.timeScale = effectOn('slowmo') ? 0.5 : 1;
    perkBase = null; applyPerks();
    if (Object.keys(S.wardrobe.equipped).length || S.wardrobe.hair || S.wardrobe.hairColor) applyLook();
    markersDirty = true;
    emit('systems:loaded', {});
    return true;
  };
  // GTP.SaveRegistry (story track, save format v4): one entry per subsystem, each {get() -> json, set(json)}
  var REG_KEYS = ['properties', 'stocks', 'golf', 'achievements', 'cheats', 'jobs', 'wardrobe', 'stats'];
  GTP.SaveRegistry = GTP.SaveRegistry || {};
  REG_KEYS.forEach(function (k) {
    GTP.SaveRegistry['sys_' + k] = {
      get: function () { return copy(S[k]); },
      set: function (json) {
        if (!json || typeof json !== 'object') return;
        S[k] = Object.assign(blank()[k], copy(json));
        if (k === 'stocks') { stocks.ensure(); S.stocks.lastHour = absHour(); }
        if (k === 'properties') { var g = game(); S.properties.lastDay = g && g.time ? g.time.day : S.properties.lastDay; markersDirty = true; }
        if (k === 'jobs') { perkBase = null; applyPerks(); }
        if (k === 'wardrobe' && (Object.keys(S.wardrobe.equipped).length || S.wardrobe.hair || S.wardrobe.hairColor)) applyLook();
        if (k === 'cheats') { var g2 = game(); if (g2) g2.timeScale = effectOn('slowmo') ? 0.5 : 1; }
      }
    };
  });
  // the v3 saves (and any v4 that still runs SaveHooks): data.systems; set() is idempotent, so running both is harmless
  GTP.SaveHooks = GTP.SaveHooks || [];
  GTP.SaveHooks.push({ name: 'systems',
    save: function (data) { data.systems = Systems.serialize(); },
    load: function (data) { if (data && data.systems) Systems.deserialize(data.systems); } });

  // =============================================================== events ==
  if (GTP.Events && GTP.Events.on) {
    GTP.Events.on('mission:complete', function (e) {
      try { if (e && !e.replay) stocks.react(e.id || (e.mission && e.mission.id)); checkAchievements(); } catch (err) { report(err, 'systems.missionComplete'); }
    });
    GTP.Events.on('mission:start', function () { if (job) endJob('mission'); if (golfRun) golf.end('interrupted'); });
    GTP.Events.on('strand:start', function () { if (job) endJob('busy'); if (golfRun) golf.end('interrupted'); });
    GTP.Events.on('player:respawn', function () {
      var p = player(); if (!p) return;
      var htb = jobs.def('hot_take_brigade');
      if (S.jobs.done.hot_take_brigade && htb && htb.perk && htb.perk.respawnArmor) p.armor = Math.max(p.armor || 0, htb.perk.respawnArmor);
      if (Object.keys(S.wardrobe.equipped).length || S.wardrobe.hair) applyLook();
    });
    GTP.Events.on('player:wasted', function () { if (job) endJob('dead'); if (golfRun) golf.end('interrupted'); });
    GTP.Events.on('busted', function () { if (job) endJob('busted'); if (golfRun) golf.end('interrupted'); });
    GTP.Events.on('world:generated', function () { markersDirty = true; });
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

  // ============================================================ the facade ==
  Systems.properties = props;
  Systems.stocks = stocks;
  Systems.golf = golf;
  Systems.achievements = achievements;
  Systems.unlock = unlock;
  Systems.checkAchievements = checkAchievements;
  Systems.stats = stats;
  Systems.statsPage = statsPage;
  Systems.cheats = cheats;
  Systems.jobs = jobs;
  Systems.wardrobe = wardrobe;
  Systems.clothing = wardrobe;   // the plan's name for the purchase logic
  Systems.barber = { options: wardrobe.hairOptions, buy: wardrobe.haircut };
  Systems.applyLook = applyLook;
  Systems.markers = markerList;
  Systems.fallback = FB;
  Systems.hud = function () { return { golf: golf.state(), job: jobs.state() }; };
  Systems.debug = {
    marks: function () { if (markersDirty && player()) rebuildMarks(); return marks; },
    rebuildMarks: rebuildMarks,
    tickClock: tickClock,
    golfRun: function () { return golfRun; },
    rng: function () { return R; }
  };
})();
