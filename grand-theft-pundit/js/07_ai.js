/* Grand Theft Pundit: 07_ai.js
 * GTP.AI: the spawner (peds on sidewalks, cars in lanes, parked cars in lots,
 * cops near the precinct, HOA patrols, the Lot C raccoon), ped brains (wander
 * along sidewalks, cross at crosswalks on the walk phase, idle chat, flee from
 * gunfire / blasts / speeding cars, barks from GTP.Content.radio.barks), traffic
 * (lane-centred driving on World.roadDir lanes, signals, yielding, following,
 * turns planned at junctions, ramps and the Loop, honking, unsticking), police
 * and the wanted system (heat sources, thresholds, decay only without line of
 * sight, response per star: foot cops, cruisers that pursue and ram, roadblocks,
 * SWAT vans, the helicopter with a spotlight), busted detection, garages, and
 * HOA patrols that act like cops once the `hoa_enemy` flag is set.
 *
 * Brains write ped.intent / vehicle controls; 06_entities does the physics.
 * All randomness goes through GTP.rng. Nothing here throws out of the loop:
 * every brain runs inside a try/catch that reports to GTP.errors.
 *
 * Knobs live in GTP.C.AI (defaults below, overridable from 01_config.js).
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util, TILE = C.TILE, DECK_Y = C.DECK_Y, CURB = C.CURB_H;

  var K = C.AI = Object.assign({
    pedTick: 6, carTick: 5, copTick: 12,                 // brain cadence in fixed steps (staggered by entity id)
    spawnEvery: 0.5, spawnPedsPerTick: 6, spawnCarsPerTick: 3,
    parkedTarget: 22, parkedChance: 0.42,
    viewSkip: 50, viewSkipCar: 80,                       // never spawn inside the camera frustum closer than this (m): peds / cars
    nearBias: 1.6, nearBiasCar: 2.3,                     // spawn distance = min + (max - min) * rng^bias: crowds the streets near the player
    cruise: { street: 11, avenue: 14, highway: 22, ramp: 9, bus: 9, truck: 10, bike: 13 },
    turnSpeed: { right: 5.5, left: 7, uturn: 3 },
    turnRadius: { right: 4.2, left: 5.6 },
    gapMin: 2.4, gapTime: 0.85, lookMin: 3.5, lookTime: 0.8,
    brakeAccel: 6, steerGain: 2.3,
    stuckTime: 3, honkAfter: 2, pedBlockCreep: 5,
    yieldSpeed: 5,
    pedIdleChance: 0.06, chatChance: 0.5, barkEvery: [9, 20],
    sight: 70, sightCar: 95, heliSight: 120,
    bustRange: 1.5, bustTime: 1.0,
    wantedGrace: 8,                                      // seconds after a crime (or a set) before heat may start to decay
    heatEvery: 0.6, heatEveryCar: 2.5,                   // one hitPed / attackCop crime per burst, one hitCopCar per ram (seconds)
    pursuitSpeed: 0.85,                                  // fraction of the cruiser's top speed
    ramRange: 32, exitRange: 13,
    response: {                                          // per star (index 0 = one star)
      foot: [3, 4, 5, 6, 7], cruisers: [0, 2, 3, 4, 5], swat: [0, 0, 0, 2, 3], heli: [0, 0, 0, 0, 1],
      footEvery: [5, 4, 3.5, 3, 2.5], cruiserEvery: [0, 7, 6, 5, 4], swatEvery: [0, 0, 0, 12, 9]
    },
    roadblock: { minStar: 3, every: 12, max: 2, ahead: [84, 136], life: 30 },
    heli: { altitude: 30, radius: 24, speed: 26, orbit: 0.3 },
    hoaPatrols: 2
  }, C.AI || {});

  // ------------------------------------------------------------- helpers --
  var T = null, M = null, scratch = [], scratch2 = [], scratch3 = [];
  function W() { return GTP.World; }
  function E() { return GTP.Entities; }
  function player() { return GTP.game ? GTP.game.player : null; }
  function simT() { return (GTP.game && GTP.game.time) ? GTP.game.time.t : 0; }
  function R() { return GTP.rng; }
  function fx(o) { if (GTP.Render && GTP.Render.fx) { try { GTP.Render.fx.add(o); } catch (e) { /* fx optional */ } } }
  function sfx(name, x, z, gain) { if (GTP.Audio && GTP.Audio.play) { try { GTP.Audio.play(name, { x: x, z: z, gain: gain }); } catch (e) { /* audio optional */ } } }
  function toast(t) { if (GTP.UI && GTP.UI.toast) { try { GTP.UI.toast(t); } catch (e) { /* ui optional */ } } }
  function flags() { return (GTP.Missions && GTP.Missions.state && GTP.Missions.state.flags) || {}; }
  function ensureT() { if (!T) { T = W().T; M = W().M; } }
  function tileI(tx, tz) { return tz * W().w + tx; }
  function isRoadTile(t) { return t === T.ROAD || t === T.BRIDGE || t === T.RAMP; }
  function pedWalkable(t) { return t === T.SIDEWALK || t === T.PLAZA || t === T.GRASS || t === T.SAND || t === T.PARKING; }
  function districtIdAt(x, z) { var d = W().districtAt(x, z); return d ? d.id : 'downtown'; }
  function districtStyle(x, z) {
    var d = W().districtAt(x, z), CW = GTP.Content.world, base = C.DISTRICT_STYLES[d ? d.style : 'downtown'] || C.DISTRICT_STYLES.downtown;
    var over = CW && CW.districtStyles && d ? CW.districtStyles[d.style] : null;
    return over ? Object.assign({}, base, over) : base;
  }
  // is a world point inside the camera view and closer than `near`?
  function inView(x, y, z, near) {
    var Rd = GTP.Render; if (!Rd || !Rd.camera || !Rd.worldToScreen) return false;
    var p = player(); if (!p) return false;
    var d = U.dist2d(x, z, p.x, p.z); if (d > (near || K.viewSkip)) return false;
    var s = Rd.worldToScreen(x, y == null ? 1 : y, z);
    return s.visible;
  }
  function visibleToCamera(x, y, z) {
    var Rd = GTP.Render; if (!Rd || !Rd.camera) return false;
    var s = Rd.worldToScreen(x, y == null ? 1 : y, z);
    return s.visible && U.dist2d(x, z, Rd.camera.position.x, Rd.camera.position.z) < C.QUALITY.drawDistance;
  }
  function losClear(ax, ay, az, bx, by, bz) {
    var dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 0.01) return true;
    return !W().raycastBuildings(ax, ay, az, dx / l, dy / l, dz / l, l);
  }
  function weightedPick(obj) {
    var total = 0, k;
    for (k in obj) total += obj[k];
    var r = R().random() * total;
    for (k in obj) { r -= obj[k]; if (r <= 0) return k; }
    for (k in obj) return k;
    return null;
  }
  // signal phase + seconds remaining in it (mirrors World.signalPhase)
  function signalInfo(tx, tz, t) {
    var Wd = W(), i = Wd.inBounds(tx, tz) ? tileI(tx, tz) : 0;
    var ox = tx - (Wd.laneV[i] >> 4), oz = tz - (Wd.laneH[i] >> 4);
    var offset = U.hash2(ox, oz, 77) * 20, ph = ((t || 0) + offset) % 20;
    return { phase: ph < 10 ? 'ns' : 'ew', remaining: ph < 10 ? 10 - ph : 20 - ph };
  }
  function signaled(tx, tz) {
    var Wd = W(), st = districtStyle((tx + 0.5) * TILE, (tz + 0.5) * TILE);
    return !!(st.signals || (Wd.metaAt(tx, tz) & M.AVENUE));
  }
  // lane bytes per layer: 'ground' reads laneH/laneV on road tiles, 'deck' reads the Loop's dlane bytes
  function laneByte(tx, tz, axis, deck) {
    var Wd = W(); if (!Wd.inBounds(tx, tz)) return 0;
    var i = tileI(tx, tz);
    if (deck) return axis === 'h' ? Wd.dlaneH[i] : Wd.dlaneV[i];
    var t = Wd.tiles[i]; if (!isRoadTile(t)) return 0;
    return axis === 'h' ? Wd.laneH[i] : Wd.laneV[i];
  }
  function laneDirOf(l, w, axis) { return axis === 'h' ? (l < w / 2 ? -1 : 1) : (l < w / 2 ? 1 : -1); }
  function laneInfo(byte, axis, tx, tz) {
    var l = byte >> 4, w = byte & 15;
    return { l: l, w: w, dir: laneDirOf(l, w, axis), lo: (axis === 'h' ? tz : tx) - l, center: axis === 'h' ? (tz + 0.5) * TILE : (tx + 0.5) * TILE };
  }
  // the layer a neighbouring road tile is reachable on, or null (handles ramp <-> deck joins)
  function stepLayer(tx, tz, deck, nx, nz) {
    var Wd = W(); if (!Wd.inBounds(nx, nz)) return null;
    var ni = tileI(nx, nz), nt = Wd.tiles[ni];
    if (deck) {
      if (Wd.deck[ni]) return 'deck';
      if (nt === T.RAMP && Wd.rampY[ni] > DECK_Y - 1.2) return 'ground';
      return null;
    }
    var ci = tileI(tx, tz);
    if (isRoadTile(nt)) return 'ground';
    if (Wd.tiles[ci] === T.RAMP && Wd.rampY[ci] > DECK_Y - 1.2 && Wd.deck[ni]) return 'deck';
    return null;
  }
  function onDeck(v) { var Wd = W(), tx = Math.floor(v.x / TILE), tz = Math.floor(v.z / TILE); return Wd.inBounds(tx, tz) && !!Wd.deck[tileI(tx, tz)] && Wd.tiles[tileI(tx, tz)] !== T.RAMP && v.y > DECK_Y - 2.5; }
  function roadUnder(v) {
    var Wd = W(), tx = Math.floor(v.x / TILE), tz = Math.floor(v.z / TILE);
    if (!Wd.inBounds(tx, tz)) return false;
    var i = tileI(tx, tz);
    if (Wd.deck[i] && v.y > DECK_Y - 2.5 && Wd.tiles[i] !== T.RAMP) return true;
    return isRoadTile(Wd.tiles[i]);
  }

  // ---------------------------------------------------------------- barks --
  // A ped's line (ped.line, set by speakLine) shows as a 3D-anchored sprite above its head
  // unless the UI module says it draws barks itself (GTP.UI.drawsBarks).
  var barkMats = {}, barkCount = 0;
  function barkMaterial(text, color) {
    var key = (color || '') + '|' + text;
    if (barkMats[key]) return barkMats[key];
    if (barkCount > 160) { barkMats = {}; barkCount = 0; }
    var cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    ctx.font = 'bold 26px ui-sans-serif, system-ui, Arial, sans-serif';
    var tw = Math.min(520, Math.ceil(ctx.measureText(text).width)), pad = 18, h = 48;
    cv.width = tw + pad * 2; cv.height = h + 12;
    ctx = cv.getContext('2d');
    ctx.font = 'bold 26px ui-sans-serif, system-ui, Arial, sans-serif';
    ctx.fillStyle = 'rgba(12,14,22,0.82)';
    roundRect(ctx, 1, 1, cv.width - 2, h - 2, 12); ctx.fill();
    ctx.strokeStyle = color || 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; roundRect(ctx, 1, 1, cv.width - 2, h - 2, 12); ctx.stroke();
    // a little tail under the pill
    ctx.fillStyle = 'rgba(12,14,22,0.82)'; ctx.beginPath(); ctx.moveTo(cv.width / 2 - 7, h - 2); ctx.lineTo(cv.width / 2 + 7, h - 2); ctx.lineTo(cv.width / 2, h + 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(text, cv.width / 2, h / 2, tw);
    var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    var m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true, sizeAttenuation: true });
    m.userData.ar = cv.width / cv.height;
    barkMats[key] = m; barkCount++;
    return m;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function syncBark(p) {
    var m = p.mesh; if (!m) return;
    var UI = GTP.UI, uiDraws = !!(UI && UI.drawsBarks);
    var show = !!p.line && !uiDraws && p.alive && !p.inVehicle && !p.knockedDown && !p.removed;
    if (!show) { if (p._bark) p._bark.visible = false; return; }
    if (!p._bark) {
      p._bark = new THREE.Sprite(barkMaterial(p.line, p._barkColor));
      p._bark.name = 'bark'; p._bark.renderOrder = 20; p._bark.castShadow = false;
      m.add(p._bark);
    } else if (p._bark.userData.text !== p.line) p._bark.material = barkMaterial(p.line, p._barkColor);
    p._bark.userData.text = p.line;
    var ar = p._bark.material.userData.ar || 4, hgt = 0.42;
    p._bark.scale.set(hgt * ar, hgt, 1);
    p._bark.position.set(0, (p.height || 1.8) + 0.5, 0);
    p._bark.visible = true;
  }
  function say(p, text, color) {
    if (!p || !text) return;
    p._barkColor = color || null;
    p.speakLine(text);
    if (GTP.UI && GTP.UI.bark) { try { GTP.UI.bark(p, text); } catch (e) { /* optional */ } }
    GTP.Events.emit('bark', { ped: p, text: text });
  }
  function barkPool(role, districtId) {
    var Rd = GTP.Content && GTP.Content.radio;
    if (!Rd || !Rd.barks) return null;
    if (typeof Rd.barksFor === 'function') return Rd.barksFor(role, districtId);
    return Rd.barks.ped || null;
  }
  function barkLine(kind) { var Rd = GTP.Content && GTP.Content.radio; var l = Rd && Rd.barks && Rd.barks[kind]; return l && l.length ? R().pick(l) : null; }

  // --------------------------------------------------------------- wanted --
  // heat accumulates from crimes; the level is the count of thresholds passed. Heat decays only
  // after decayDelay seconds without a cop (foot, cruiser, HOA patrol or the helicopter) seeing
  // the player. lastKnown is where the response converges (the 911 call), not the player's live position.
  var wanted = {
    level: 0, heat: 0, lastSeen: -1e9, lastKnown: { x: 0, z: 0 }, seenBy: null, _lvl: 0, seenThisTick: false, graceUntil: -1e9,
    addHeat: function (n, src) {
      if (!(n > 0)) return;
      var p = player(); if (!p || !p.alive) return;
      wanted.heat = Math.min(wanted.heat + n, C.WANTED.thresholds[C.WANTED.thresholds.length - 1] + 10);
      wanted.lastSeen = simT(); wanted.lastKnown.x = p.x; wanted.lastKnown.z = p.z; wanted.graceUntil = simT() + K.wantedGrace;
      wanted.sync();
      GTP.Events.emit('heat', { amount: n, src: src || null, heat: wanted.heat, level: wanted.level });
    },
    // adds the heat for a named source from C.WANTED.heat (ignored while the player is already at 5 stars)
    crime: function (name, src) { var h = C.WANTED.heat[name]; if (h) wanted.addHeat(h, src || name); },
    set: function (n) {
      var p = player(), th = C.WANTED.thresholds;
      n = U.clamp(n | 0, 0, 5);
      wanted.heat = n ? th[n - 1] : 0; wanted.level = n;
      if (p) { p.wanted = n; p.heat = wanted.heat; wanted.lastKnown.x = p.x; wanted.lastKnown.z = p.z; }
      wanted.lastSeen = simT(); wanted._lvl = n; wanted.graceUntil = simT() + K.wantedGrace;
      GTP.Events.emit('wanted', { level: n, prev: n });
    },
    clear: function () { var prev = wanted.level; wanted.level = 0; wanted.heat = 0; wanted._lvl = 0; var p = player(); if (p) { p.wanted = 0; p.heat = 0; } if (prev) GTP.Events.emit('wanted', { level: 0, prev: prev }); },
    levelFor: function (heat) { var th = C.WANTED.thresholds, l = 0; for (var i = 0; i < th.length; i++) if (heat >= th[i]) l = i + 1; return l; },
    sync: function () {
      var prev = wanted.level, lvl = wanted.levelFor(wanted.heat), p = player();
      wanted.level = lvl; wanted._lvl = lvl;
      if (p) { p.wanted = lvl; p.heat = wanted.heat; }
      if (lvl !== prev) GTP.Events.emit('wanted', { level: lvl, prev: prev });
    },
    // a cop (or the heli) can see the player right now
    see: function (cop) {
      var p = player(); if (!p) return;
      wanted.lastSeen = simT(); wanted.lastKnown.x = p.x; wanted.lastKnown.z = p.z; wanted.seenBy = cop || null; wanted.seenThisTick = true;
    },
    update: function (dt) {
      var p = player(); if (!p) return;
      // an external set (debug.setWanted, missions) writes level + heat on us and the player
      if (p.wanted !== wanted.level && p.wanted !== wanted._lvl) { wanted.set(p.wanted); }
      else if (wanted.level !== wanted._lvl) { wanted.set(wanted.level); }
      if (wanted.heat > 0 && simT() > wanted.graceUntil && simT() - wanted.lastSeen > C.WANTED.decayDelay) {
        wanted.heat = Math.max(0, wanted.heat - C.WANTED.decayRate * dt);
        var lvl = wanted.levelFor(wanted.heat);
        if (lvl !== wanted.level) { var prev = wanted.level; wanted.level = lvl; wanted._lvl = lvl; p.wanted = lvl; GTP.Events.emit('wanted', { level: lvl, prev: prev }); }
        p.heat = wanted.heat;
      }
      wanted.seenThisTick = false;
    }
  };
  var heatT = { ped: -9, cop: -9, car: -9 };
  function hookHeat() {
    var Ev = GTP.Events;
    Ev.on('vehicle:hitPed', function (e) { if (e.vehicle && e.vehicle.hasPlayer && e.vehicle.hasPlayer() && e.ped && e.ped.alive) wanted.crime(isCop(e.ped) ? 'attackCop' : 'hitPed', 'vehicle'); });
    Ev.on('damage', function (e) {
      var p = player(); if (!p || !e || !e.target || e.target === p) return;
      var src = e.src;
      if (src !== p && !(src && src.driver === p) && !(src && src.owner === p)) return;
      // self-defence: a ped flagged hostile (mission goons that attack the player) earns no heat.
      // Heat per hit is rate-limited: an SMG burst or a ram is one crime, not eleven (kills still count in full).
      var now = simT();
      if (e.target.kind === 'ped') {
        if (e.target.hostile) { /* no crime */ }
        else if (isCop(e.target)) { if (now - (heatT.cop || -9) >= K.heatEvery) { heatT.cop = now; wanted.crime('attackCop', 'attackCop'); } }
        else if (e.type !== 'vehicle') { if (now - (heatT.ped || -9) >= K.heatEvery) { heatT.ped = now; wanted.crime('hitPed', e.type || 'hit'); } }
      } else if (e.target.kind === 'vehicle' && e.target.isPolice) { if (now - (heatT.car || -9) >= K.heatEveryCar) { heatT.car = now; wanted.addHeat(1, 'hitCopCar'); } }
      // gunfire scares the street
      if (e.type && /pistol|smg|shotgun|hottake|megaphone/.test(String(e.type))) AI.alarm(e.target.x, e.target.z, 26, p);
    });
    Ev.on('ped:dead', function (e) { var p = player(); if (!p || !e.ped || e.ped === p) return; var s = e.src; if (!e.ped.hostile && (s === p || (s && s.driver === p) || (s && s.owner === p))) wanted.crime(isCop(e.ped) ? 'attackCop' : 'killPed', 'kill'); AI.alarm(e.ped.x, e.ped.z, 22, s); });
    Ev.on('vehicle:exploded', function (e) { var p = player(); var v = e.vehicle; if (!v) return; AI.alarm(v.x, v.z, 40, e.src); if (p && (e.src === p || (e.src && e.src.driver === p) || v.lastDamageSrc === p)) wanted.crime('destroyVehicle', 'explode'); if (v.isPolice && p) wanted.addHeat(2, 'copCarLost'); });
    Ev.on('vehicle:impact', function (e) { if (e.impact > 9) AI.alarm(e.x, e.z, 14, e.vehicle); });
    Ev.on('honk', function (e) { var v = e.vehicle; if (v && v.hasPlayer && v.hasPlayer()) AI.alarm(v.x, v.z, 7, v, true); });
    Ev.on('vehicle:enter', function (e) {
      var p = player(); if (!p || e.ped !== p || !e.vehicle) return;
      // stealing a car in front of a cop who sees you is a crime; a carjack already added its heat
      var seen = copsSeeing(p.x, p.z, 30);
      if (seen && e.vehicle.ai && e.vehicle.ai.kind === 'parked') wanted.crime('stealSeen', 'steal');
    });
  }
  function isCop(p) { return !!p && (p.role === 'cop' || p.role === 'swat' || (p.role === 'hoa' && hoaHostile())); }
  function hoaHostile() { return !!flags().hoa_enemy; }
  function copsSeeing(x, z, r) {
    var list = E().hash.query(x, z, r, scratch3);
    for (var i = 0; i < list.length; i++) { var e = list[i]; if (e.kind === 'ped' && e.alive && isCop(e) && !e.inVehicle && losClear(e.x, e.y + 1.5, e.z, x, 1.2, z)) return e; }
    return null;
  }

  // -------------------------------------------------------------- alarms --
  // gunfire, blasts and big crashes scare peds nearby for a moment; honks only hurry them off the road
  var alarms = [];
  function addAlarm(x, z, r, src, mild) { alarms.push({ x: x, z: z, r: r, t: simT(), src: src || null, mild: !!mild }); if (alarms.length > 40) alarms.shift(); }
  function pruneAlarms() { var now = simT(); for (var i = alarms.length - 1; i >= 0; i--) if (now - alarms[i].t > 1.2) alarms.splice(i, 1); }

  // -------------------------------------------------------------- spawner --
  var DIRS4 = [{ dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 }];
  var spawner = {
    t: 0, warm: false, parked: new Map(), parkTiles: [], deckTiles: [], lotOf: new Map(), protestHome: null, protestT: 0, raccoon: null, raccoonAct: 0, hqDone: false, stats: { peds: 0, cars: 0, parked: 0 },
    reset: function () {
      spawner.t = 0; spawner.warm = false; spawner.parked.clear(); spawner.parkTiles = []; spawner.deckTiles = []; spawner.lotOf.clear();
      spawner.protestHome = null; spawner.protestT = 0; spawner.raccoon = null; spawner.raccoonAct = 0; spawner.hqDone = false;
      var Wd = W(); if (!Wd.tiles) return;
      ensureT();
      var N = Wd.w * Wd.h, i;
      for (i = 0; i < N; i++) {
        var tz = (i / Wd.w) | 0;
        if (Wd.tiles[i] === T.PARKING && !(Wd.meta[i] & M.YARD) && (tz & 1)) spawner.parkTiles.push(i);
        if (Wd.deck[i] && !((Wd.dmeta[i] & M.H) && (Wd.dmeta[i] & M.V))) spawner.deckTiles.push(i);
      }
      // landmark lots with a fixed parked fleet (the balloon depot's beige vans, the podcast van)
      var CW = GTP.Content.world, tbl = CW && CW.spawn && CW.spawn.vehicles && CW.spawn.vehicles.parked && CW.spawn.vehicles.parked.landmarks;
      if (tbl) for (var id in tbl) {
        var lm = Wd.landmark(id); if (!lm || !lm.lot) continue;
        var n = 0, cap = tbl[id].count || 4;
        for (var zz = lm.lot.z; zz < lm.lot.z + lm.lot.d && n < cap; zz++) for (var xx = lm.lot.x; xx < lm.lot.x + lm.lot.w && n < cap; xx++) {
          if (!Wd.inBounds(xx, zz)) continue;
          var ti = tileI(xx, zz);
          if (Wd.tiles[ti] !== T.PARKING) continue;
          // keep clear of the door approach and the building's own skirt
          if (lm.building && U.pointInRect((xx + 0.5) * TILE, (zz + 0.5) * TILE, lm.building.x - 2.5, lm.building.z - 2.5, lm.building.w + 5, lm.building.d + 5)) continue;
          spawner.lotOf.set(ti, { type: tbl[id].type || 'sedan', color: tbl[id].color || null, wrap: tbl[id].wrap || null, landmark: id });
          if (spawner.parkTiles.indexOf(ti) < 0) spawner.parkTiles.push(ti);
          n++;
        }
      }
    },
    warmup: function () {
      spawner.warm = true;
      try {
        for (var i = 0; i < 40; i++) { if (!spawner.spawnPeds(12)) break; }
        for (i = 0; i < 30; i++) { if (!spawner.spawnCars(6)) break; }
        spawner.spawnParked(40);
        spawner.specials();
      } finally { spawner.warm = false; }
    },
    update: function (dt) {
      spawner.t += dt;
      if (spawner.t < K.spawnEvery) return;
      spawner.t = 0;
      spawner.spawnPeds(K.spawnPedsPerTick);
      spawner.spawnCars(K.spawnCarsPerTick);
      spawner.spawnParked(4);
      spawner.specials();
    },
    counts: function () {
      var list = E().list, peds = 0, cars = 0, parked = 0, p = player();
      for (var i = 0; i < list.length; i++) {
        var e = list[i]; if (e.removed) continue;
        if (e.kind === 'ped' && e.ai && e.ai.ambient && !e.inVehicle && e.alive) peds++;
        else if (e.kind === 'vehicle' && e.ai) { if (e.ai.kind === 'parked') parked++; else if (!e.wreck && !e.hasPlayer()) cars++; }
      }
      spawner.stats.peds = peds; spawner.stats.cars = cars; spawner.stats.parked = parked;
      void p;
      return spawner.stats;
    },
    // a ped on a sidewalk tile with a district look and role; opts: {role, look, mode, home, radius, persistent, ai}
    spawnPed: function (x, z, role, opts) {
      opts = opts || {};
      var Wd = W(), did = districtIdAt(x, z), CW = GTP.Content.world;
      var look = opts.look || (CW.spawn.peds.rollLook ? CW.spawn.peds.rollLook(did, role) : null);
      var p = new GTP.Ped({ x: x, z: z, look: look, role: role || (look && look.role) || 'civ', persistent: !!opts.persistent, weapon: opts.weapon || (role === 'swat' ? 'shotgun' : role === 'cop' ? 'pistol' : 'fist') });
      p.y = Wd.heightAt(x, z, 0); p.yaw = R().random() * U.TAU; p.snap();
      p.ai = newPedAI(p, role, opts);
      E().add(p);
      return p;
    },
    spawnVehicle: function (x, z, type, opts) {
      opts = opts || {};
      var Wd = W();
      var v = new GTP.Vehicle({ x: x, z: z, type: type || 'sedan', color: opts.color, wrap: opts.wrap, tag: opts.tag, persistent: !!opts.persistent });
      v.y = opts.y != null ? opts.y : Wd.heightAt(x, z, opts.deck ? DECK_Y : 0);
      v.yaw = opts.yaw != null ? opts.yaw : 0;
      v.snap();
      v.ai = newCarAI(v, opts.kind || 'traffic');
      E().add(v);
      return v;
    },
    pedSpot: function (min, max) {
      var Wd = W(), p = player(); if (!p || !Wd._sidewalkTiles.length) return null;
      var CW = GTP.Content.world, dens = (CW.spawn.peds.density) || {};
      for (var tries = 0; tries < 14; tries++) {
        var i = R().pick(Wd._sidewalkTiles), tx = i % Wd.w, tz = (i / Wd.w) | 0;
        var x = (tx + 0.5) * TILE + R().range(-1, 1), z = (tz + 0.5) * TILE + R().range(-1, 1);
        var d = U.dist2d(x, z, p.x, p.z);
        if (d < min || d > max) continue;
        if (!spawner.warm && d > min + (max - min) * Math.pow(R().random(), K.nearBias)) continue;   // crowd the near streets
        if (!spawner.warm && inView(x, 1, z)) continue;
        var dd = Wd.districtAt(x, z), dens1 = dd && dens[dd.id] != null ? dens[dd.id] : 1;
        if (!R().chance(Math.min(1, dens1))) continue;
        var near = E().hash.query(x, z, 1.4, scratch3), blocked = false;
        for (var k = 0; k < near.length; k++) if (near[k].kind === 'ped' || near[k].kind === 'vehicle') { blocked = true; break; }
        if (blocked) continue;
        return { x: x, z: z, tx: tx, tz: tz, district: dd ? dd.id : 'downtown' };
      }
      return null;
    },
    spawnPeds: function (n) {
      var p = player(); if (!p) return false;
      var cnt = spawner.counts(); if (cnt.peds >= C.PEDS_TARGET) return false;
      var CW = GTP.Content.world, roles = CW.spawn.peds.rolesByDistrict || {};
      var radius = C.SPAWN.pedRadius, min = spawner.warm ? 6 : radius[0], max = spawner.warm ? 150 : radius[1];
      var made = 0;
      for (var i = 0; i < n && cnt.peds + made < C.PEDS_TARGET; i++) {
        var s = spawner.pedSpot(min, max); if (!s) continue;
        var role = weightedPick(roles[s.district] || { civ: 1 }) || 'civ';
        if (role === 'cop' && wanted.level > 0) role = 'civ';   // responders come from the precinct, not from thin air
        var ped = spawner.spawnPed(s.x, s.z, role);
        ped.ai.ambient = true;
        made++;
      }
      return made > 0;
    },
    carSpot: function (min, max) {
      var Wd = W(), p = player(); if (!p) return null;
      var ground = Wd._roadTiles, deck = spawner.deckTiles;
      for (var tries = 0; tries < 14; tries++) {
        var useDeck = deck.length && R().chance(0.18), i = useDeck ? R().pick(deck) : R().pick(ground);
        if (i == null) continue;
        var tx = i % Wd.w, tz = (i / Wd.w) | 0, ti = tileI(tx, tz);
        if (!useDeck && (Wd.meta[ti] & M.DEAD)) continue;
        var h = laneByte(tx, tz, 'h', useDeck), vb = laneByte(tx, tz, 'v', useDeck);
        if (h && vb) continue;
        var axis = h ? 'h' : 'v', byte = h || vb; if (!byte) continue;
        var li = laneInfo(byte, axis, tx, tz);
        var x = (tx + 0.5) * TILE, z = (tz + 0.5) * TILE, y = useDeck ? DECK_Y : Wd.heightAt(x, z, 0);
        var d = U.dist2d(x, z, p.x, p.z);
        if (d < min || d > max) continue;
        if (!spawner.warm && d > min + (max - min) * Math.pow(R().random(), K.nearBiasCar)) continue;   // most traffic within ~100 m
        if (!spawner.warm && inView(x, y + 1, z, K.viewSkipCar)) continue;
        var near = E().hash.query(x, z, 9, scratch3), blocked = false;
        for (var k = 0; k < near.length; k++) if (near[k].kind === 'vehicle' && Math.abs(near[k].y - y) < 3) { blocked = true; break; }
        if (blocked) continue;
        return { x: x, z: z, y: y, tx: tx, tz: tz, axis: axis, dir: li.dir, laneC: li.center, deck: useDeck, district: districtIdAt(x, z) };
      }
      return null;
    },
    spawnCars: function (n) {
      var p = player(); if (!p) return false;
      var cnt = spawner.counts(); if (cnt.cars >= C.CARS_TARGET) return false;
      var CW = GTP.Content.world, tbl = CW.spawn.vehicles.byDistrict || {};
      var radius = C.SPAWN.vehicleRadius, min = spawner.warm ? 20 : radius[0], max = spawner.warm ? 200 : radius[1];
      var made = 0;
      for (var i = 0; i < n && cnt.cars + made < C.CARS_TARGET; i++) {
        var s = spawner.carSpot(min, max); if (!s) continue;
        var type = R().pick(tbl[s.district] || ['sedan', 'taxi', 'van']);
        if (s.deck && (type === 'bus' || type === 'bike')) type = 'sedan';
        if (type === 'bus' && !(W().metaAt(s.tx, s.tz) & M.AVENUE)) type = R().pick(['sedan', 'van', 'taxi']);   // buses keep to the avenues
        if (type === 'cop' && wanted.level > 0) type = 'sedan';   // responders come from the precinct while the player is hot
        var v = spawner.placeTraffic(s, type, null);
        if (v) made++;
      }
      return made > 0;
    },
    // a driven car on a lane at a spot from carSpot
    placeTraffic: function (s, type, opts) {
      opts = opts || {};
      var dx = s.axis === 'h' ? s.dir : 0, dz = s.axis === 'v' ? s.dir : 0;
      var kind = type === 'cop' ? 'cop' : (opts.kind || 'traffic');
      var v = spawner.spawnVehicle(s.x, s.z, type, { yaw: U.dirToYaw(dx, dz), y: s.y, deck: s.deck, kind: kind, color: opts.color, tag: opts.tag });
      var ai = v.ai; ai.axis = s.axis; ai.dir = s.dir; ai.laneC = s.laneC; ai.deck = !!s.deck; ai.hoa = !!opts.hoa;
      var cr = cruiseFor(v, ai); v.vx = dx * cr * 0.5; v.vz = dz * cr * 0.5; v.speed = cr * 0.5;
      var did = s.district || districtIdAt(s.x, s.z);
      var role = type === 'cop' ? 'cop' : opts.hoa ? 'hoa' : 'civ';
      var driver = spawner.spawnPed(s.x, s.z, role, { look: opts.driverLook || null });
      driver.ai.ambient = false; driver.ai.driver = true;
      v.enter(driver, 0);
      if (type === 'cop' || opts.hoa) { var mate = spawner.spawnPed(s.x, s.z, role); mate.ai.ambient = false; mate.ai.driver = true; v.enter(mate, 1); }
      void did;
      return v;
    },
    spawnParked: function (n) {
      var Wd = W(), p = player(); if (!p || !spawner.parkTiles.length) return;
      // forget parked cars that despawned or got driven away
      spawner.parked.forEach(function (v, ti) { if (v.removed || v.driver || v.hasPlayer()) spawner.parked.delete(ti); });
      if (spawner.parked.size >= K.parkedTarget && !spawner.warm) return;
      var seed = GTP.game ? GTP.game.seed : 1, CW = GTP.Content.world, tbl = CW.spawn.vehicles.parked.byDistrict || {};
      var made = 0, tiles = spawner.parkTiles, start = R().int(0, tiles.length - 1);
      for (var k = 0; k < tiles.length && made < n; k++) {
        var ti = tiles[(start + k) % tiles.length];
        if (spawner.parked.has(ti)) continue;
        var tx = ti % Wd.w, tz = (ti / Wd.w) | 0, x = (tx + 0.5) * TILE, z = (tz + 0.5) * TILE;
        var d = U.dist2d(x, z, p.x, p.z);
        if (d > 170 || (d < 12 && !spawner.warm)) continue;
        var lot = spawner.lotOf.get(ti);
        if (!lot && U.hash2(tx, tz, seed + 31) > K.parkedChance) continue;
        if (!spawner.warm && inView(x, 1, z, 70)) continue;
        var near = E().hash.query(x, z, 3.2, scratch3), blocked = false;
        for (var j = 0; j < near.length; j++) if (near[j].kind === 'vehicle' || near[j].kind === 'player') { blocked = true; break; }
        if (blocked) continue;
        var did = districtIdAt(x, z), type = lot ? lot.type : R().pick(tbl[did] || ['sedan']);
        if (Wd.tile(tx, tz - 1) === T.BUILDING || Wd.tile(tx, tz + 1) === T.BUILDING) { if (Wd.tile(tx - 1, tz) === T.BUILDING || Wd.tile(tx + 1, tz) === T.BUILDING) continue; }
        var yaw = U.hash2(tx, tz, seed + 5) < 0.5 ? 0 : Math.PI;
        var v = spawner.spawnVehicle(x, z, type, { yaw: yaw, kind: 'parked', color: lot ? lot.color : null, wrap: lot ? lot.wrap : null });
        v.vx = v.vz = 0; v.speed = 0;
        spawner.parked.set(ti, v);
        made++;
      }
    },
    // precinct cops and cruisers, HOA patrols, the protest, the raccoon
    specials: function () {
      var Wd = W(), p = player(); if (!p) return;
      var hq = Wd.landmark('police_hq');
      if (hq && hq.door) {
        var dh = U.dist2d(p.x, p.z, hq.door.x, hq.door.z);
        if (dh < 170 && !spawner.hqDone) {
          spawner.hqDone = true;
          for (var i = 0; i < 2; i++) {
            var gx = hq.door.x + R().range(-3, 3), gz = hq.door.z + R().range(-1.5, 1.5);
            var cop = spawner.spawnPed(gx, gz, 'cop', { mode: 'guard', home: { x: hq.door.x, z: hq.door.z }, radius: 10 });
            cop.ai.ambient = false;
          }
          // two cruisers in the precinct lot, ready to go
          var lotTiles = spawner.parkTiles.filter(function (ti) { var tx = ti % Wd.w, tz = (ti / Wd.w) | 0; return tx >= hq.lot.x && tx < hq.lot.x + hq.lot.w && tz >= hq.lot.z && tz < hq.lot.z + hq.lot.d && !spawner.parked.has(ti); });
          for (i = 0; i < Math.min(2, lotTiles.length); i++) {
            var ti = lotTiles[i], tx = ti % Wd.w, tz = (ti / Wd.w) | 0, cx = (tx + 0.5) * TILE, cz = (tz + 0.5) * TILE;
            var near = E().hash.query(cx, cz, 3.2, scratch3), blocked = false;
            for (var j = 0; j < near.length; j++) if (near[j].kind === 'vehicle') { blocked = true; break; }
            if (blocked) continue;
            var cv = spawner.spawnVehicle(cx, cz, 'cop', { yaw: 0, kind: 'parked' });
            spawner.parked.set(ti, cv);
          }
        } else if (dh > 260) spawner.hqDone = false;
      }
      // HOA patrol SUVs in Culdesac Heights
      var d = Wd.districtAt(p.x, p.z);
      if (d && d.id === 'suburbs') {
        var hoaN = 0, list = E().list;
        for (i = 0; i < list.length; i++) if (list[i].kind === 'vehicle' && list[i].ai && list[i].ai.hoa && !list[i].removed && !list[i].wreck) hoaN++;
        if (hoaN < K.hoaPatrols) {
          var s = spawner.carSpot(spawner.warm ? 20 : 50, 170);
          if (s && s.district === 'suburbs' && !s.deck) spawner.placeTraffic(s, 'suv', { hoa: true, color: '#f4ead8', tag: 'hoa', kind: 'hoa' });
        }
      }
      // Perpetual Assembly Plaza: marchers mill about the kiosk (they come back after a despawn)
      var pp = Wd.landmark('protest_plaza');
      if (pp) {
        var dp = U.dist2d(p.x, p.z, pp.x, pp.z);
        if (dp < 160 && !spawner.protestHome) {
          spawner.protestHome = { x: pp.x, z: pp.z };
          for (i = 0; i < 7; i++) {
            var a = R().random() * U.TAU, r = R().range(3, 9);
            var px = pp.x + Math.cos(a) * r, pz = pp.z + Math.sin(a) * r;
            if (Wd.solidAt(px, pz, 0.5)) continue;
            var m = spawner.spawnPed(px, pz, 'protester', { mode: 'protest', home: { x: pp.x, z: pp.z }, radius: 11 });
            m.ai.ambient = true;
          }
        } else if (dp > 280) spawner.protestHome = null;
      }
      // the Lot C raccoon (GDD 9): near pod_garage in Act I, nap_depot in Act II, tyn_tower in Act III
      var F = flags(), act = F.knows_memo || F.survived_thursday ? 3 : (F.show_renamed ? 2 : 1);
      var homeId = act === 3 ? 'tyn_tower' : act === 2 ? 'nap_depot' : 'pod_garage';
      var hl = Wd.landmark(homeId);
      if (hl && hl.door && (!spawner.raccoon || spawner.raccoon.removed || !spawner.raccoon.alive || spawner.raccoonAct !== act)) {
        if (spawner.raccoon && !spawner.raccoon.removed) spawner.raccoon.destroy();
        spawner.raccoon = null;
        if (U.dist2d(p.x, p.z, hl.door.x, hl.door.z) < 200) {
          var Lk = GTP.Content.looks, look = Lk && Lk.roll ? Lk.roll(hl.district || 'campus', 'raccoon') : { skin: 2, hair: 'short', hairColor: '#4a4a4a', shirt: '#6a6a6a', pants: '#4a4a4a', scale: 0.45, mask: '#1a1a1a' };
          if (act === 3) look.extra = 'lanyard';
          var rx = hl.door.x + R().range(-4, 4), rz = hl.door.z + R().range(-2, 2);
          var rac = spawner.spawnPed(rx, rz, 'npc', { look: look, mode: 'wander', home: { x: hl.door.x, z: hl.door.z }, radius: 22, persistent: true });
          rac.ai.ambient = false; rac.ai.mute = true; rac.ai.raccoon = true; rac.tag = 'raccoon';
          spawner.raccoon = rac; spawner.raccoonAct = act;
        }
      }
    }
  };

  // ------------------------------------------------------------ ped brains --
  function newPedAI(p, role, opts) {
    opts = opts || {};
    var d = R().pick(DIRS4), be = K.barkEvery;
    return {
      role: role || 'civ', mode: opts.mode || 'wander', tgt: null, dir: { dx: d.dx, dz: d.dz }, lat: R().range(-0.7, 0.7),
      idleT: 0, barkT: R().range(be[0], be[1]) * (opts.mode === 'protest' ? 0.4 : 1), stuckT: 0, fleeT: 0, fleeFrom: null, fleeDir: null,
      home: opts.home || null, radius: opts.radius || 0, ambient: true, phase: p.id % K.pedTick, run: false, crossing: false,
      chat: null, chatT: 0, wasDown: false, escape: null, mute: false, driver: false,
      // cops
      car: null, seen: false, seeT: 0, shotT: 0, giveUpT: 0, chaseT: 0, bustT: 0
    };
  }
  // next sidewalk tile for a wandering ped: straight ahead by preference, crossings only on crosswalks when allowed
  function pickNextTile(p, ai) {
    var Wd = W(), tx = Math.floor(p.x / TILE), tz = Math.floor(p.z / TILE);
    var curT = Wd.tile(tx, tz), curM = Wd.metaAt(tx, tz), onCross = curT === T.ROAD && (curM & M.CROSSWALK) !== 0;
    var cands = [], total = 0, i;
    for (i = 0; i < 4; i++) {
      var d = DIRS4[i], nx = tx + d.dx, nz = tz + d.dz, t = Wd.tile(nx, nz), m = Wd.metaAt(nx, nz), w = 0;
      var same = d.dx === ai.dir.dx && d.dz === ai.dir.dz, back = d.dx === -ai.dir.dx && d.dz === -ai.dir.dz;
      if (onCross) {
        if (same) w = t === T.ROAD ? ((m & M.CROSSWALK) ? 10 : 0) : (pedWalkable(t) ? 10 : 0);
        else if (back) w = 0.01;
      } else {
        if (t === T.ROAD) {
          if ((m & M.CROSSWALK) && !(m & M.DEAD)) {
            var axisH = (m & M.H) && !(m & M.V), perp = axisH ? d.dz !== 0 : d.dx !== 0;
            if (perp && crossAllowed(nx, nz, !!axisH, p, ai)) w = 0.55;
          }
        } else if (t === T.SIDEWALK) w = 1;
        else if (t === T.PLAZA) w = 0.8;
        else if (t === T.GRASS) w = curT === T.GRASS ? 0.9 : 0.3;
        else if (t === T.SAND) w = 0.3;
        else if (t === T.PARKING) w = curT === T.PARKING ? 0.6 : 0.2;
        if (w > 0) { if (same) w *= 5; else if (back) w *= 0.12; }
        if (w > 0 && ai.home && ai.radius) { var hd = U.dist2d((nx + 0.5) * TILE, (nz + 0.5) * TILE, ai.home.x, ai.home.z); if (hd > ai.radius) w *= 0.03; }
      }
      if (w > 0) { cands.push({ d: d, w: w, nx: nx, nz: nz, t: t }); total += w; }
    }
    if (!cands.length) return false;
    var r = R().random() * total, pick = cands[cands.length - 1];
    for (i = 0; i < cands.length; i++) { r -= cands[i].w; if (r <= 0) { pick = cands[i]; break; } }
    ai.dir.dx = pick.d.dx; ai.dir.dz = pick.d.dz;
    ai.crossing = pick.t === T.ROAD;
    var lat = ai.crossing ? ai.lat * 0.5 : ai.lat;
    ai.tgt = { x: (pick.nx + 0.5) * TILE + (-pick.d.dz) * lat, z: (pick.nz + 0.5) * TILE + pick.d.dx * lat, tx: pick.nx, tz: pick.nz };
    return true;
  }
  // may a ped step onto this crosswalk tile now? (unsignalled: always; signalled: on the walk phase with time to cross)
  function crossAllowed(tx, tz, axisH, p, ai) {
    var Wd = W(), ix = -1, iz = -1, k;
    for (k = 0; k < 2; k++) {
      var ax = axisH ? tx + (k ? -1 : 1) : tx, az = axisH ? tz : tz + (k ? -1 : 1);
      if (Wd.isIntersection(ax, az)) { ix = ax; iz = az; break; }
    }
    if (ix < 0) return true;
    var byte = axisH ? Wd.laneH[tileI(tx, tz)] : Wd.laneV[tileI(tx, tz)], width = (byte & 15) || 2;
    if (!signaled(ix, iz)) { ai.run = width > 2; return true; }
    var info = signalInfo(ix, iz, simT());
    if (info.phase !== (axisH ? 'ns' : 'ew')) return false;
    var walkT = width * TILE / C.PED.walk + 0.8, runT = width * TILE / C.PED.run + 0.5;
    if (info.remaining >= walkT) { ai.run = false; return true; }
    if (info.remaining >= runT) { ai.run = true; return true; }
    return false;
  }
  function startFlee(p, ai, from, time, dir) {
    if (ai.mode === 'cop' || ai.mode === 'guard' || ai.mode === 'chase' || ai.mode === 'roadblock') return;
    ai.mode = 'flee'; ai.fleeT = time || 4; ai.tgt = null; ai.run = true; ai.chat = null; ai.escape = null;
    ai.fleeFrom = from ? { x: from.x, z: from.z } : null;
    if (dir) ai.fleeDir = { x: dir.x, z: dir.z };
    else if (from) { var dx = p.x - from.x, dz = p.z - from.z, l = Math.sqrt(dx * dx + dz * dz) || 1; ai.fleeDir = { x: dx / l, z: dz / l }; }
    else { var f = U.yawToDir(p.yaw); ai.fleeDir = { x: f.x, z: f.z }; }
    if (!ai.mute && R().chance(0.4) && !p.line) say(p, barkLine('panic'), '#ff7a7a');
  }
  function rotateDir(d, a) { var c = Math.cos(a), s = Math.sin(a); var x = d.x * c - d.z * s, z = d.x * s + d.z * c; d.x = x; d.z = z; }
  function aheadBlocked(p, dir, dist) {
    var Wd = W(), t = Wd.tileAt(p.x + dir.x * dist, p.z + dir.z * dist);
    return t === T.WATER || t === T.VOID || t === T.BUILDING || t === T.RAMP;
  }
  function fleeTick(p, ai, dt) {
    ai.fleeT -= dt;
    if (ai.fleeT <= 0) { endFlee(p, ai); return; }
    var d = ai.fleeDir, Wd = W();
    if (ai.fleeFrom && U.dist2d(p.x, p.z, ai.fleeFrom.x, ai.fleeFrom.z) < 30) { var dx = p.x - ai.fleeFrom.x, dz = p.z - ai.fleeFrom.z, l = Math.sqrt(dx * dx + dz * dz) || 1; d.x = U.lerp(d.x, dx / l, 0.3); d.z = U.lerp(d.z, dz / l, 0.3); var ll = Math.sqrt(d.x * d.x + d.z * d.z) || 1; d.x /= ll; d.z /= ll; }
    // caught in the street: make for the nearest kerb; on the kerb: do not run out into traffic
    var here = Wd.tileAt(p.x, p.z), m = Wd.metaAt(Math.floor(p.x / TILE), Math.floor(p.z / TILE));
    if (here === T.ROAD && !(m & M.CROSSWALK)) {
      var sp = Wd.nearestSidewalkPoint(p.x, p.z);
      if (sp) { var ex = sp.x - p.x, ez = sp.z - p.z, el = Math.sqrt(ex * ex + ez * ez) || 1; d.x = ex / el; d.z = ez / el; }
    } else if (here !== T.ROAD) {
      var ahead = Wd.tileAt(p.x + d.x * 2.2, p.z + d.z * 2.2);
      if (ahead === T.ROAD || ahead === T.BRIDGE) { rotateDir(d, R().sign() * Math.PI / 2); if (Wd.tileAt(p.x + d.x * 2.2, p.z + d.z * 2.2) === T.ROAD) rotateDir(d, Math.PI); }
    }
    if (aheadBlocked(p, d, 2.5) || (p.speed < 0.6 && ai.fleeT < (ai.fleeT0 || 4) - 0.4)) { rotateDir(d, R().sign() * (Math.PI / 2 + R().range(-0.3, 0.3))); if (aheadBlocked(p, d, 2.5)) rotateDir(d, Math.PI); }
    p.intent.x = d.x; p.intent.z = d.z; p.intent.run = true;
  }
  function endFlee(p, ai) {
    ai.mode = 'wander'; ai.run = false; ai.tgt = null; ai.fleeFrom = null;
    var Wd = W(), t = Wd.tileAt(p.x, p.z);
    if (t === T.ROAD || t === T.BRIDGE || t === T.RAMP || !pedWalkable(t)) { var sp = Wd.nearestSidewalkPoint(p.x, p.z); if (sp) ai.escape = { x: sp.x, z: sp.z }; }
  }
  function scanThreats(p, ai, dt) {
    if (ai.mode === 'flee' && ai.fleeT > 1.5) return;
    var i, now = simT();
    for (i = 0; i < alarms.length; i++) {
      var a = alarms[i], d = U.dist2d(a.x, a.z, p.x, p.z);
      if (d > a.r || a.src === p) continue;
      if (a.mild) { if (ai.crossing || W().tileAt(p.x, p.z) === T.ROAD) ai.run = true; continue; }
      startFlee(p, ai, a, R().range(3.5, 6.5)); ai.fleeT0 = ai.fleeT;
      return;
    }
    // a car bearing down on us: step out of its way (sideways, away from its centre line)
    var list = E().hash.query(p.x, p.z, 16, scratch2);
    for (i = 0; i < list.length; i++) {
      var v = list[i];
      if (v.kind !== 'vehicle' || v.removed || Math.abs(v.y - p.y) > 2.5) continue;
      var sp = v.speed2d(); if (sp < 7) continue;
      var l = v.worldToLocal(p.x, p.z);
      if (l.f < 0 || l.f > 6 + sp * 1.1 || Math.abs(l.r) > v.hw + 1.6) continue;
      var f = U.yawToDir(v.yaw), rx = -f.z, rz = f.x, s = l.r < 0 ? -1 : 1;
      startFlee(p, ai, null, 1.6, { x: rx * s, z: rz * s }); ai.fleeT0 = ai.fleeT;
      return;
    }
    void dt; void now;
  }
  function wanderTick(p, ai, dt) {
    if (ai.escape) {
      var de = p.moveTo(ai.escape.x, ai.escape.z, true);
      if (de < 0.6 || p.speed < 0.2 && (ai.stuckT += dt) > 1.5) { ai.escape = null; ai.stuckT = 0; p.stop(); }
      return;
    }
    if (!ai.tgt && !pickNextTile(p, ai)) { ai.mode = 'idle'; ai.idleT = R().range(1.5, 3); p.stop(); return; }
    // a signal that flips mid-crossing: hurry
    if (ai.crossing && !ai.run) { var Wd = W(), m = Wd.metaAt(Math.floor(p.x / TILE), Math.floor(p.z / TILE)); if (m & M.CROSSWALK) { ai.run = true; } }
    var d = p.moveTo(ai.tgt.x, ai.tgt.z, ai.run);
    if (d < 0.5) {
      ai.tgt = null; ai.stuckT = 0;
      if (!ai.crossing) { ai.run = false; if (R().chance(K.pedIdleChance) && ai.mode === 'wander') { ai.mode = 'idle'; ai.idleT = R().range(2, 5); p.stop(); } }
      return;
    }
    if (p.speed < 0.25) { ai.stuckT += dt; if (ai.stuckT > 1.0) { ai.stuckT = 0; ai.lat = R().range(-0.7, 0.7); ai.tgt = null; if (R().chance(0.5)) { var r = R().pick(DIRS4); ai.dir.dx = r.dx; ai.dir.dz = r.dz; } } }
    else ai.stuckT = 0;
  }
  function idleTick(p, ai, dt) {
    ai.idleT -= dt; p.stop();
    if (ai.chat) { chatTick(p, ai, dt); return; }
    if (ai.idleT <= 0) { ai.mode = ai.home && ai.radius ? (ai.role === 'protester' ? 'protest' : 'wander') : 'wander'; ai.tgt = null; return; }
    // strike up a chat with another idle civilian next to us
    if (!ai.mute && R().chance(K.chatChance * dt)) {
      var list = E().hash.query(p.x, p.z, 2.6, scratch2);
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o === p || o.kind !== 'ped' || !o.alive || !o.ai || o.ai.mode !== 'idle' || o.ai.chat || o.ai.mute || o.inVehicle) continue;
        ai.chat = o; o.ai.chat = p; ai.chatT = o.ai.chatT = R().range(8, 14); ai.idleT = o.ai.idleT = 99; ai.chatLine = 0; o.ai.chatLine = R().range(2, 4);
        break;
      }
    }
  }
  function chatTick(p, ai, dt) {
    var o = ai.chat;
    if (!o || o.removed || !o.alive || !o.ai || o.ai.chat !== p || U.dist2d(p.x, p.z, o.x, o.z) > 4) { ai.chat = null; ai.idleT = 0.5; return; }
    ai.chatT -= dt;
    p.yaw = U.angleDamp(p.yaw, U.dirToYaw(o.x - p.x, o.z - p.z), 6, dt);
    ai.chatLine -= dt;
    if (ai.chatLine <= 0 && !p.line && !o.line) { say(p, R().pick(barkPool(ai.role, districtIdAt(p.x, p.z)) || ['...'])); ai.chatLine = R().range(5, 8); o.ai.chatLine = R().range(2.5, 4); }
    if (ai.chatT <= 0) { ai.chat = null; o.ai.chat = null; ai.idleT = 0.3; o.ai.idleT = 0.3; }
  }
  function barkTick(p, ai, dt) {
    if (ai.mute) return;
    ai.barkT -= dt;
    if (ai.barkT > 0) return;
    var be = K.barkEvery; ai.barkT = R().range(be[0], be[1]) * (ai.mode === 'protest' ? 0.35 : 1);
    var pl = player(); if (!pl || U.dist2d(p.x, p.z, pl.x, pl.z) > 42 || !visibleToCamera(p.x, p.y + 1.5, p.z)) return;
    var pool = ai.role === 'cop' || ai.role === 'swat' ? (wanted.level > 0 ? barkPool('cop') : (GTP.Content.radio && GTP.Content.radio.barks.copIdle)) : barkPool(ai.role, districtIdAt(p.x, p.z));
    if (pool && pool.length) say(p, R().pick(pool), ai.role === 'cop' || ai.role === 'swat' ? '#8fb6ff' : ai.role === 'protester' ? '#ff7a00' : null);
  }
  function pedTick(p, dt) {
    var ai = p.ai;
    if (!p.alive || p.inVehicle) { if (p._bark) p._bark.visible = false; return; }
    if (p.knockedDown) { ai.wasDown = true; p.stop(); syncBark(p); return; }
    if (ai.wasDown) { ai.wasDown = false; var h = p.lastHitBy; if (h && h.kind === 'vehicle' && h.driver) h = h.driver; if (ai.mode !== 'chase') { startFlee(p, ai, h ? { x: h.x, z: h.z } : null, R().range(4, 6)); ai.fleeT0 = ai.fleeT; } }
    if (p.fleeFrom) { var ff = p.fleeFrom; p.fleeFrom = null; startFlee(p, ai, { x: ff.x, z: ff.z }, p.fleeTimer || 5); ai.fleeT0 = ai.fleeT; p.fleeTimer = 0; }
    if (p.entering) { syncBark(p); return; }
    if (ai.role === 'cop' || ai.role === 'swat' || (ai.role === 'hoa' && hoaHostile())) { copTick(p, ai, dt); }
    else {
      scanThreats(p, ai, dt);
      switch (ai.mode) {
        case 'flee': fleeTick(p, ai, dt); break;
        case 'idle': idleTick(p, ai, dt); break;
        case 'protest': wanderTick(p, ai, dt); if (!ai.tgt && ai.mode === 'protest' && R().chance(0.3)) { ai.mode = 'idle'; ai.idleT = R().range(2, 6); } break;
        default: wanderTick(p, ai, dt);
      }
      barkTick(p, ai, dt);
    }
    syncBark(p);
  }

  // --------------------------------------------------------------- traffic --
  // Cars hold a lane (axis, direction, lateral centre line) and drive toward a look-ahead point on it.
  // At junctions a plan is made: straight / right / left (into a lane of matching rank), a dead end
  // (three-point turn or recycle), with signal stops, yielding, following and ped checks on top.
  function newCarAI(v, kind) {
    return {
      kind: kind || 'traffic', axis: 'h', dir: 1, laneC: v.z, lane: 0, w: 2, lo: 0, deck: false, plan: null, phase: v.id % K.carTick,
      cruise: 10, speedMul: R().range(0.9, 1.12), targetSpeed: 0, cap: 99, capReason: null, stopAlong: null, waitT: 0,
      blockedT: 0, honkT: 0, stuckT: 0, reverseT: 0, revSteer: 0, unsticks: 0, offRoadT: 0, recover: null, swerve: 0, swerveT: 0, lastSteer: 0, hoa: false, turnT: 0,
      mode: (kind === 'cop' || kind === 'hoa') ? 'patrol' : null, path: null, pi: 0, repathT: 0, goal: null, goalSpeed: 0, pursuitT: 0, lostT: 0, exitT: 0, blockT: 0
    };
  }
  function cruiseFor(v, ai) {
    var cr = K.cruise, Wd = W(), base;
    if (ai.deck) base = cr.highway;
    else {
      var tx = Math.floor(v.x / TILE), tz = Math.floor(v.z / TILE), t = Wd.tile(tx, tz);
      base = t === T.RAMP ? cr.ramp : (Wd.metaAt(tx, tz) & M.AVENUE) ? cr.avenue : cr.street;
    }
    if (v.type === 'bus') base = Math.min(base, cr.bus); else if (v.type === 'truck') base = Math.min(base, cr.truck); else if (v.type === 'bike') base = Math.min(base + 2, cr.bike);
    return Math.min(base * ai.speedMul, v.cls.maxSpeed * 0.9);
  }
  function outerLane(w2, lowHalf) { return lowHalf ? 0 : w2 - 1; }
  function innerLane(w2, lowHalf) { return lowHalf ? w2 / 2 - 1 : w2 / 2; }
  // adopt the lane under the car that best matches its heading
  function adoptLane(v, ai) {
    var tx = Math.floor(v.x / TILE), tz = Math.floor(v.z / TILE), deck = onDeck(v);
    var h = laneByte(tx, tz, 'h', deck), vb = laneByte(tx, tz, 'v', deck);
    if (!h && !vb) return false;
    var f = U.yawToDir(v.yaw), axis;
    if (h && vb) axis = Math.abs(f.x) >= Math.abs(f.z) ? 'h' : 'v'; else axis = h ? 'h' : 'v';
    var byte = axis === 'h' ? h : vb, li = laneInfo(byte, axis, tx, tz);
    var comp = axis === 'h' ? f.x : f.z, dir = Math.abs(comp) < 0.05 ? li.dir : (comp > 0 ? 1 : -1);
    var lat = axis === 'h' ? v.z : v.x, best = -1, bd = 1e9;
    for (var l = 0; l < li.w; l++) {
      if (laneDirOf(l, li.w, axis) !== dir) continue;
      var c = (li.lo + l + 0.5) * TILE, d = Math.abs(c - lat);
      if (d < bd) { bd = d; best = l; }
    }
    if (best < 0) return false;
    ai.axis = axis; ai.dir = dir; ai.lane = best; ai.w = li.w; ai.lo = li.lo; ai.laneC = (li.lo + best + 0.5) * TILE; ai.deck = deck; ai.plan = null;
    ai.cruise = cruiseFor(v, ai);
    return true;
  }
  // scan ahead along the lane for the next junction and make a plan
  function planAhead(v, ai) {
    var Wd = W(), axis = ai.axis, dir = ai.dir, oax = axis === 'h' ? 'v' : 'h';
    var tx = Math.floor(v.x / TILE), tz = Math.floor(v.z / TILE), deck = ai.deck;
    var dx = axis === 'h' ? dir : 0, dz = axis === 'v' ? dir : 0;
    var cur = laneByte(tx, tz, axis, deck);
    if (!cur) { if (!adoptLane(v, ai)) return false; axis = ai.axis; dir = ai.dir; oax = axis === 'h' ? 'v' : 'h'; dx = axis === 'h' ? dir : 0; dz = axis === 'v' ? dir : 0; cur = laneByte(tx, tz, axis, ai.deck); deck = ai.deck; if (!cur) return false; }
    var li = laneInfo(cur, axis, tx, tz);
    ai.lane = li.l; ai.w = li.w; ai.lo = li.lo; ai.laneC = li.center;
    var lowHalfMine = li.l < li.w / 2, rankMine = Math.abs(li.l - innerLane(li.w, lowHalfMine));
    var ctx = tx, ctz = tz, cdeck = deck, k;
    var alongOf = function (ax, az) { return axis === 'h' ? ax : az; };
    for (k = 1; k <= 18; k++) {
      var nl = stepLayer(ctx, ctz, cdeck, ctx + dx, ctz + dz);
      if (!nl) { ai.plan = deadPlan(v, ai, ctx, ctz); return true; }
      ctx += dx; ctz += dz; cdeck = nl === 'deck';
      var mine = laneByte(ctx, ctz, axis, cdeck), other = laneByte(ctx, ctz, oax, cdeck);
      var sameLane = mine && (mine >> 4) === li.l && (mine & 15) === li.w;
      if (other) { ai.plan = junctionPlan(v, ai, li, ctx, ctz, cdeck, other, k, rankMine, lowHalfMine); return true; }
      if (!sameLane) { ai.plan = deadPlan(v, ai, ctx - dx, ctz - dz); return true; }
      // a road joining from the right (ramps, side streets): only from the outer lane, taken sometimes
      var outer = axis === 'h' ? (dir > 0 ? li.l === li.w - 1 : li.l === 0) : (dir > 0 ? li.l === 0 : li.l === li.w - 1);
      if (outer && k >= 2 && v.cls.length <= 6) {
        var beyond = axis === 'h' ? (dir > 0 ? li.lo + li.w : li.lo - 1) : (dir > 0 ? li.lo - 1 : li.lo + li.w);
        var sx = axis === 'h' ? ctx : beyond, sz = axis === 'h' ? beyond : ctz;
        var sl = stepLayer(ctx, ctz, cdeck, sx, sz);
        if (sl) {
          var sb = laneByte(sx, sz, oax, sl === 'deck');
          if (sb && (ai.sideSkip || 0) <= 0 && R().chance(0.45)) {
            var sli = laneInfo(sb, oax, sx, sz);
            var away = axis === 'h' ? (dir > 0 ? 1 : -1) : (dir > 0 ? -1 : 1);     // the side road's direction away from my road
            var lowHalf = oax === 'h' ? away < 0 : away > 0, lane2 = outerLane(sli.w, lowHalf);
            if (laneDirOf(lane2, sli.w, oax) === away) {
              var turnAlong = (sli.lo + lane2 + 0.5) * TILE;
              ai.plan = { kind: 'right', entryAlong: (sli.lo + (dir > 0 ? 0 : sli.w)) * TILE, exitEdge: (sli.lo + (dir > 0 ? sli.w : 0)) * TILE, turnAlong: turnAlong, exitAxis: oax, exitDir: away, exitLaneC: turnAlong, signaled: false, sigTx: ctx, sigTz: ctz, box: null, turning: false, side: true, t: 0 };
              ai.sideSkip = 2;
              return true;
            }
          } else if (sb) ai.sideSkip = (ai.sideSkip || 0) - 1;
        }
      }
      void alongOf;
    }
    // a long straight: cruise and look again later
    ai.plan = { kind: 'cruise', until: (axis === 'h' ? v.x : v.z) + dir * 10 * TILE, t: 0 };
    return true;
  }
  function deadPlan(v, ai, ltx, ltz) {
    var axis = ai.axis, dir = ai.dir;
    var endAlong = (axis === 'h' ? ltx : ltz) * TILE + (dir > 0 ? TILE : 0);
    return { kind: 'dead', endAlong: endAlong, t: 0, turning: false };
  }
  function junctionPlan(v, ai, li, btx, btz, bdeck, other, k, rankMine, lowHalfMine) {
    var Wd = W(), axis = ai.axis, dir = ai.dir, oax = axis === 'h' ? 'v' : 'h';
    var w2 = other & 15, lo2 = (axis === 'h' ? btx : btz) - (other >> 4);
    var entryAlong = (lo2 + (dir > 0 ? 0 : w2)) * TILE, exitEdge = (lo2 + (dir > 0 ? w2 : 0)) * TILE;
    var box = axis === 'h' ? { x0: lo2 * TILE, x1: (lo2 + w2) * TILE, z0: li.lo * TILE, z1: (li.lo + li.w) * TILE } : { x0: li.lo * TILE, x1: (li.lo + li.w) * TILE, z0: lo2 * TILE, z1: (lo2 + w2) * TILE };
    var opts = [], i;
    // straight: my lane continues beyond the box (and is not a stub)
    var ax = axis === 'h' ? (dir > 0 ? lo2 + w2 : lo2 - 1) : btx, az = axis === 'h' ? btz : (dir > 0 ? lo2 + w2 : lo2 - 1);
    var lastTx = axis === 'h' ? (dir > 0 ? lo2 + w2 - 1 : lo2) : btx, lastTz = axis === 'h' ? btz : (dir > 0 ? lo2 + w2 - 1 : lo2);
    var sl = stepLayer(lastTx, lastTz, bdeck, ax, az);
    if (sl) {
      var mb = laneByte(ax, az, axis, sl === 'deck');
      if (mb && (mb >> 4) === li.l && (mb & 15) === li.w) {
        var run = 1, rx = ax, rz = az, rl = sl === 'deck', dead = !!(Wd.metaAt(ax, az) & M.DEAD);
        while (run < 10) { var nl = stepLayer(rx, rz, rl, rx + (axis === 'h' ? dir : 0), rz + (axis === 'v' ? dir : 0)); if (!nl) break; rx += axis === 'h' ? dir : 0; rz += axis === 'v' ? dir : 0; rl = nl === 'deck'; var b2 = laneByte(rx, rz, axis, rl); if (!b2 || (b2 >> 4) !== li.l) break; run++; if (laneByte(rx, rz, oax, rl)) { run = 10; break; } }
        opts.push({ kind: 'straight', w: dead ? 0.05 : (run >= 10 ? 3 : run >= 4 ? 1.2 : 0.15) });
      }
    }
    // turns: right = (-dz, dx), left = (dz, -dx) in world xz
    var dx = axis === 'h' ? dir : 0, dz = axis === 'v' ? dir : 0;
    var turns = [{ kind: 'right', vx: -dz, vz: dx, w: 1.0 }, { kind: 'left', vx: dz, vz: -dx, w: 0.8 }];
    // long vehicles (bus, truck) cannot swing a street corner: no right turns, left only avenue to avenue
    var long = v.cls.length > 6;
    for (i = 0; i < 2; i++) {
      var tn = turns[i], exitDir = oax === 'h' ? tn.vx : tn.vz;
      if (long && (tn.kind === 'right' || w2 < 4 || li.w < 4)) continue;
      var lowHalf = oax === 'h' ? exitDir < 0 : exitDir > 0, half = w2 / 2;
      var lane = tn.kind === 'right' ? outerLane(w2, lowHalf) : innerLane(w2, lowHalf);
      // keep lane rank where the exit road has room (outer stays outer)
      var toward = tn.kind === 'right' ? (lowHalf ? 1 : -1) : (lowHalf ? -1 : 1);
      lane = U.clamp(lane + toward * Math.min(rankMine, half - 1), lowHalf ? 0 : half, lowHalf ? half - 1 : w2 - 1);
      if (laneDirOf(lane, w2, oax) !== exitDir) continue;
      var exTx = axis === 'h' ? lo2 + lane : (exitDir > 0 ? li.lo + li.w : li.lo - 1), exTz = axis === 'h' ? (exitDir > 0 ? li.lo + li.w : li.lo - 1) : lo2 + lane;
      var fromTx = axis === 'h' ? lo2 + lane : (exitDir > 0 ? li.lo + li.w - 1 : li.lo), fromTz = axis === 'h' ? (exitDir > 0 ? li.lo + li.w - 1 : li.lo) : lo2 + lane;
      var el = stepLayer(fromTx, fromTz, bdeck, exTx, exTz);
      if (!el) continue;
      var eb = laneByte(exTx, exTz, oax, el === 'deck');
      if (!eb || (eb >> 4) !== lane) continue;
      if (el === 'deck' && !bdeck && tn.kind === 'left') continue;   // onto the Loop only by a right merge
      var dead2 = !!(Wd.metaAt(exTx, exTz) & M.DEAD);
      opts.push({ kind: tn.kind, w: dead2 ? 0.03 : tn.w, exitDir: exitDir, lane: lane, turnAlong: (lo2 + lane + 0.5) * TILE });
    }
    var plan = { kind: 'dead', endAlong: entryAlong, t: 0, turning: false };
    if (!opts.length) return plan;
    var total = 0; for (i = 0; i < opts.length; i++) total += opts[i].w;
    var r = R().random() * total, pick = opts[opts.length - 1];
    for (i = 0; i < opts.length; i++) { r -= opts[i].w; if (r <= 0) { pick = opts[i]; break; } }
    plan = { kind: pick.kind, entryAlong: entryAlong, exitEdge: exitEdge, box: box, signaled: !bdeck && signaled(btx, btz), sigTx: btx, sigTz: btz, turning: false, t: 0, side: false };
    if (pick.kind !== 'straight') { plan.turnAlong = pick.turnAlong; plan.exitAxis = oax; plan.exitDir = pick.exitDir; plan.exitLaneC = pick.turnAlong; }
    void k;
    return plan;
  }
  // speed caps from the car / ped ahead in our corridor
  function aheadCaps(v, ai, dt) {
    var sp = Math.max(0, v.speed), f = U.yawToDir(v.yaw), L = Math.min(44, 7 + sp * 1.3);
    var list = E().hash.query(v.x + f.x * L * 0.5, v.z + f.z * L * 0.5, L * 0.5 + 5, scratch), cap = 99, reason = null, pedBlock = false;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === v || o.removed || Math.abs(o.y - v.y) > 2.6) continue;
      if (o.kind === 'vehicle') {
        if (o.sinking) continue;
        var l = v.worldToLocal(o.x, o.z), ext = Math.abs(Math.cos(o.yaw - v.yaw)) > 0.7 ? o.hl : o.hw;
        if (l.f <= 0 || l.f > L + ext || Math.abs(l.r) > v.hw + o.hw * 0.8 + 0.35) continue;
        var gap = l.f - v.hl - ext, along = o.vx * f.x + o.vz * f.z;
        var want = K.gapMin + sp * K.gapTime, c;
        if (gap < 1.0) c = 0; else if (gap < want) c = Math.max(0, along + (gap - want) * 0.9); else continue;
        if (c < cap) { cap = c; reason = o; }
      } else if (o.kind === 'ped' || o.kind === 'player') {
        if (o.inVehicle || !o.alive || o.knockedDown) continue;
        var lp = v.worldToLocal(o.x, o.z), Lp = 5 + sp * 0.9;
        if (lp.f <= 0 || lp.f > Lp || Math.abs(lp.r) > v.hw + 0.7) continue;
        var g2 = lp.f - v.hl - 1.6, cp = g2 <= 0 ? 0 : Math.sqrt(2 * K.brakeAccel * g2);
        if (ai.blockedT > K.pedBlockCreep) cp = Math.max(cp, 1.3);
        if (cp < cap) { cap = cp; reason = o; pedBlock = true; }
      }
    }
    ai.cap = cap; ai.capReason = reason; ai.pedBlock = pedBlock;
    // stationary obstacle ahead for a while: swerve round it
    if (reason && reason.kind === 'vehicle' && cap < 0.5 && sp < 0.5 && !(reason.ai && reason.ai.plan && reason.ai.plan.turning)) {
      if (ai.blockedT > K.stuckTime && !ai.swerveT) { ai.swerve = (ai.axis === 'h' ? (ai.dir > 0 ? -1 : 1) : (ai.dir > 0 ? 1 : -1)) * 3.2; ai.swerveT = 5; }
    }
    if (ai.swerveT > 0) { ai.swerveT -= dt; if (ai.swerveT <= 0) { ai.swerve = 0; ai.swerveT = 0; } }
  }
  function boxBusy(v, box) {
    var cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2, r = Math.max(box.x1 - box.x0, box.z1 - box.z0) * 0.75 + 2;
    var list = E().hash.query(cx, cz, r, scratch2);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === v || o.kind !== 'vehicle' || o.removed || Math.abs(o.y - v.y) > 3) continue;
      if (o.x < box.x0 - 1 || o.x > box.x1 + 1 || o.z < box.z0 - 1 || o.z > box.z1 + 1) continue;
      if (o.speed2d() > 0.4 || (o.ai && o.ai.plan && o.ai.plan.turning)) return true;
    }
    return false;
  }
  // the slower, queried part of traffic: runs every K.carTick steps per car
  function carPlanTick(v, ai, dt) {
    var Wd = W();
    ai.deck = onDeck(v);
    if (!roadUnder(v)) {
      ai.offRoadT += dt;
      if (ai.offRoadT > 0.6 && !ai.recover) { var rp = Wd.nearestRoadPoint(v.x, v.z); if (rp) ai.recover = { x: rp.x, z: rp.z }; }
      if (ai.offRoadT > 8 && !visibleToCamera(v.x, v.y + 1, v.z)) { recycle(v); return; }
    } else {
      ai.offRoadT = 0;
      if (ai.recover) { ai.recover = null; adoptLane(v, ai); }
    }
    if (ai.recover) { aheadCaps(v, ai, dt); return; }
    if (!ai.plan && !planAhead(v, ai)) { ai.offRoadT += dt; return; }
    var plan = ai.plan, axis = ai.axis, dir = ai.dir, along = axis === 'h' ? v.x : v.z;
    plan.t += dt;
    ai.stopAlong = null;
    if (plan.kind === 'cruise') { if ((plan.until - along) * dir < 0) ai.plan = null; ai.cruise = cruiseFor(v, ai); }
    else if (plan.kind === 'dead') {
      var dEnd = (plan.endAlong - along) * dir - v.hl;
      if (dEnd < 2.5 && Math.abs(v.speed) < 0.6) {
        if (!visibleToCamera(v.x, v.y + 1, v.z) || ai.kind === 'traffic' && plan.t > 20) { recycle(v); return; }
        // three-point turn: back up with the wheels turned, then swing round into the opposite lane
        if (!plan.turning) {
          var li = laneInfo(laneByte(Math.floor(v.x / TILE), Math.floor(v.z / TILE), axis, ai.deck) || (ai.lane << 4 | ai.w), axis, Math.floor(v.x / TILE), Math.floor(v.z / TILE));
          var best = -1, bd = 1e9, lat = axis === 'h' ? v.z : v.x;
          for (var l = 0; l < li.w; l++) { if (laneDirOf(l, li.w, axis) !== -dir) continue; var c = (li.lo + l + 0.5) * TILE; if (Math.abs(c - lat) < bd) { bd = Math.abs(c - lat); best = l; } }
          if (best < 0) { recycle(v); return; }
          plan.turning = true; plan.exitAxis = axis; plan.exitDir = -dir; plan.exitLaneC = (li.lo + best + 0.5) * TILE; plan.kind = 'uturn';
          var side = ((plan.exitLaneC - lat) * (axis === 'h' ? 1 : -1)) * dir > 0 ? 1 : -1;
          ai.reverseT = 1.5; ai.revSteer = side * 0.9; ai.turnT = 0;
        }
      }
    } else {
      var distEntry = (plan.entryAlong - along) * dir;
      if (!plan.turning) {
        if (plan.signaled && distEntry > -0.3) {
          var info = signalInfo(plan.sigTx, plan.sigTz, simT()), green = (info.phase === 'ns') === (axis === 'v');
          if (!green) { var sa = plan.entryAlong - dir * (TILE + v.hl + 0.4); if ((sa - along) * dir > -0.6) ai.stopAlong = sa; }
        } else if (!plan.signaled && plan.box && distEntry > -0.3 && distEntry < 16) {
          if (boxBusy(v, plan.box)) { ai.waitT += dt; if (ai.waitT < 4.5) ai.stopAlong = plan.entryAlong - dir * (v.hl + 0.9); }
          else ai.waitT = Math.max(0, ai.waitT - dt * 2);
        }
        if (plan.kind !== 'straight') { var rem = (plan.turnAlong - along) * dir; if (rem <= K.turnRadius[plan.kind] * (plan.side ? 0.7 : 1)) { plan.turning = true; ai.turnT = 0; ai.stopAlong = null; } }
        else if ((plan.exitEdge - along) * dir < -v.hl) { ai.plan = null; ai.cruise = cruiseFor(v, ai); }
      }
    }
    if (plan.turning) {
      ai.turnT += dt;
      var ex = plan.exitAxis, ed = plan.exitDir, lat2 = (ex === 'h' ? v.z : v.x) - plan.exitLaneC;
      var herr = U.angleDiff(v.yaw, U.dirToYaw(ex === 'h' ? ed : 0, ex === 'v' ? ed : 0));
      if (Math.abs(herr) < 0.22 && Math.abs(lat2) < 1.1) {
        ai.axis = ex; ai.dir = ed; ai.laneC = plan.exitLaneC; ai.plan = null; ai.deck = onDeck(v);
        var b = laneByte(Math.floor(v.x / TILE), Math.floor(v.z / TILE), ex, ai.deck); if (b) { ai.lane = b >> 4; ai.w = b & 15; ai.lo = (ex === 'h' ? Math.floor(v.z / TILE) : Math.floor(v.x / TILE)) - ai.lane; }
        ai.cruise = cruiseFor(v, ai);
      } else if (ai.turnT > 7) { if (!adoptLane(v, ai)) ai.plan = null; }
    }
    aheadCaps(v, ai, dt);
  }
  // every step: steering + throttle from the cached plan (cheap, no queries)
  function carStep(v, ai, dt) {
    var sp = v.speed;
    if (ai.reverseT > 0) {
      ai.reverseT -= dt;
      v.setControls(-0.8, ai.revSteer, false, 0);
      return;
    }
    var tgt, L = Math.max(K.lookMin, Math.abs(sp) * K.lookTime), plan = ai.plan, axis = ai.axis, dir = ai.dir;
    var along = axis === 'h' ? v.x : v.z;
    if (ai.recover) tgt = ai.recover;
    else if (plan && plan.turning) {
      var ex = plan.exitAxis, ed = plan.exitDir, L2 = Math.max(3.2, Math.abs(sp) * 0.75);
      tgt = ex === 'h' ? { x: v.x + ed * L2, z: plan.exitLaneC } : { x: plan.exitLaneC, z: v.z + ed * L2 };
    } else tgt = axis === 'h' ? { x: v.x + dir * L, z: ai.laneC + ai.swerve } : { x: ai.laneC + ai.swerve, z: v.z + dir * L };
    var diff = U.wrapAngle(U.dirToYaw(tgt.x - v.x, tgt.z - v.z) - v.yaw);
    var steer = U.clamp(-diff * K.steerGain, -1, 1);
    // speed
    var ts = ai.recover ? 4 : ai.cruise;
    ts = Math.min(ts, ai.cap);
    if (ai.stopAlong != null) { var d = (ai.stopAlong - along) * dir; ts = Math.min(ts, d <= 0.35 ? 0 : Math.sqrt(2 * K.brakeAccel * (d - 0.35))); }
    if (plan) {
      if (plan.kind === 'right' || plan.kind === 'left') {
        var tsp = K.turnSpeed[plan.kind];
        if (plan.turning) ts = Math.min(ts, tsp);
        else { var rem = (plan.turnAlong - along) * dir - K.turnRadius[plan.kind]; ts = Math.min(ts, Math.sqrt(tsp * tsp + 2 * K.brakeAccel * Math.max(0, rem))); }
        if (!plan.signaled && !plan.turning && !plan.side) { var de = (plan.entryAlong - along) * dir; if (de > 0 && de < 14) ts = Math.min(ts, Math.max(K.yieldSpeed, Math.sqrt(K.yieldSpeed * K.yieldSpeed + 2 * K.brakeAccel * de))); }
      } else if (plan.kind === 'straight' && !plan.signaled) {
        var de2 = (plan.entryAlong - along) * dir; if (de2 > 0 && de2 < 12) ts = Math.min(ts, Math.max(K.yieldSpeed + 3, Math.sqrt(64 + 2 * K.brakeAccel * de2)));
      } else if (plan.kind === 'dead') {
        var dd = (plan.endAlong - along) * dir - v.hl - 1.8; ts = Math.min(ts, dd <= 0 ? 0 : Math.sqrt(2 * K.brakeAccel * dd));
      } else if (plan.kind === 'uturn') ts = Math.min(ts, K.turnSpeed.uturn);
    }
    ai.targetSpeed = ts;
    var throttle = 0, brake = 0;
    if (ts <= 0.05) { if (sp > 0.3) brake = 1; else { throttle = 0; brake = 1; } }
    else if (sp < ts - 0.25) throttle = U.clamp(0.3 + (ts - sp) * 0.25, 0.3, 1);
    else if (sp > ts + 0.4) brake = U.clamp((sp - ts) * 0.35, 0.2, 1);
    else throttle = 0.18;
    v.setControls(throttle, steer, false, brake);
    ai.lastSteer = steer;
    // stuck: moving should be possible but is not
    if (ts > 1 && sp < 0.3 && ai.stopAlong == null && !ai.capReason) { ai.stuckT += dt; if (ai.stuckT > K.stuckTime) { ai.stuckT = 0; ai.unsticks++; ai.reverseT = 1.1; ai.revSteer = Math.abs(ai.lastSteer) > 0.2 ? -U.sign(ai.lastSteer) * 0.8 : R().sign() * 0.6; if (ai.unsticks > 4 && !visibleToCamera(v.x, v.y + 1, v.z)) recycle(v); } }
    else ai.stuckT = 0;
    // blocked by someone: honk now and then
    ai.honkT -= dt;
    if (ai.capReason && ts < 0.6 && sp < 0.6) {
      ai.blockedT += dt;
      if (ai.blockedT > K.honkAfter && ai.honkT <= 0 && ai.kind !== 'cop') { v.honk(); ai.honkT = R().range(2.5, 5.5); }
    } else ai.blockedT = Math.max(0, ai.blockedT - dt * 2);
  }
  function recycle(v) { if (v.hasPlayer() || v.persistent) return; v.destroy(); }   // mission cars are never recycled
  // pursuit driving: a direct goal with light avoidance (police only)
  function driveToward(v, ai, gx, gz, speed, dt) {
    var dx = gx - v.x, dz = gz - v.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    var diff = U.wrapAngle(U.dirToYaw(dx, dz) - v.yaw);
    var steer = U.clamp(-diff * 2.6, -1, 1), sp = v.speed;
    var ts = Math.abs(diff) > 1.4 ? 4 : speed * U.clamp(1.3 - Math.abs(diff) * 0.6, 0.35, 1);
    ts = Math.min(ts, ai.cap > 0.3 ? Math.max(ai.cap, 3) : 0);
    var throttle = 0, brake = 0;
    if (sp < ts - 0.3) throttle = 1; else if (sp > ts + 0.6) brake = U.clamp((sp - ts) * 0.3, 0.3, 1); else throttle = 0.25;
    // a wall or a car in the face: back out
    if (ai.reverseT > 0) { ai.reverseT -= dt; v.setControls(-0.8, ai.revSteer, false, 0); return; }
    if (ts > 2 && sp < 0.4) { ai.stuckT += dt; if (ai.stuckT > 1.6) { ai.stuckT = 0; ai.reverseT = 1.0; ai.revSteer = -U.sign(steer || R().sign()) * 0.9; } } else ai.stuckT = 0;
    v.setControls(throttle, steer, Math.abs(diff) > 2.2 && sp > 6, brake);
    ai.lastSteer = steer;
    void d;
  }

  // ---------------------------------------------------------------- police --
  var police = {
    footT: 0, cruiserT: 0, swatT: 0, roadblockT: 0, tickT: 0, roadblocks: [], heli: null, bustT: 0, busted: false, bustedT: 0, bustCop: null, garageT: 0, garageToastT: 0, pathBudget: 0,
    reset: function () { police.footT = police.cruiserT = police.swatT = police.roadblockT = police.tickT = 0; police.roadblocks = []; police.heli = null; police.bustT = 0; police.busted = false; police.bustedT = 0; police.bustCop = null; police.garageT = 0; police.garageToastT = 0; }
  };
  var DIRN = { x: 0, z: -1 };
  function faceToward(p, x, z, dt) { p.yaw = U.angleDamp(p.yaw, U.dirToYaw(x - p.x, z - p.z), 8, dt); }
  // walk toward a goal, falling back to an A* path when the straight line is blocked (budgeted: one path per step)
  function walkPath(p, ai, gx, gz, run, dt) {
    var Wd = W(), d = U.dist2d(p.x, p.z, gx, gz);
    ai.repathT -= dt;
    var moved = ai.goal && U.dist2d(ai.goal.x, ai.goal.z, gx, gz) > 12;
    var blocked = p.speed < 0.3 && ai.walkStuck > 0.8;
    if (ai.path && (ai.repathT <= 0 || moved)) ai.path = null;
    if (!ai.path && d > 6 && (blocked || !losClear(p.x, p.y + 1, p.z, gx, 1, gz)) && police.pathBudget > 0) {
      police.pathBudget--;
      ai.path = Wd.findPath(p.x, p.z, gx, gz, { mode: 'ped', fromY: p.y, toY: Wd.heightAt(gx, gz, 0), maxExpansions: 4000 });
      ai.pi = 0; ai.repathT = 3; ai.goal = { x: gx, z: gz }; ai.walkStuck = 0;
    }
    if (ai.path && ai.path.length) {
      while (ai.pi < ai.path.length - 1 && U.dist2d(p.x, p.z, ai.path[ai.pi].x, ai.path[ai.pi].z) < 1.4) ai.pi++;
      var wp = ai.path[ai.pi];
      if (ai.pi >= ai.path.length - 1 && U.dist2d(p.x, p.z, wp.x, wp.z) < 2) ai.path = null;
      else { p.moveTo(wp.x, wp.z, run); ai.walkStuck = p.speed < 0.3 ? ai.walkStuck + dt : 0; return d; }
    }
    p.moveTo(gx, gz, run);
    ai.walkStuck = p.speed < 0.3 ? (ai.walkStuck || 0) + dt : 0;
    return d;
  }
  function copTick(p, ai, dt) {
    var pl = player(), g = GTP.game;
    var hostile = wanted.level > 0 && pl && pl.alive && g && g.state === 'playing';
    ai.seeT -= dt;
    var d = pl ? U.dist2d(p.x, p.z, pl.x, pl.z) : 1e9;
    if (ai.seeT <= 0) { ai.seeT = 0.2; ai.seen = hostile && d < K.sight && losClear(p.x, p.y + 1.5, p.z, pl.x, pl.y + 1.2, pl.z); if (ai.seen) wanted.see(p); }
    if (!hostile) {
      if (ai.mode === 'chase' || ai.mode === 'alert') { ai.mode = ai.home ? 'guard' : 'wander'; ai.tgt = null; ai.path = null; p.stop(); }
      if (ai.mode === 'roadblock') { ai.mode = 'wander'; ai.home = null; }
      scanThreats(p, ai, dt);
      if (ai.mode === 'flee') fleeTick(p, ai, dt);
      else if (ai.mode === 'idle') idleTick(p, ai, dt);
      else wanderTick(p, ai, dt);
      barkTick(p, ai, dt);
      return;
    }
    var plVeh = pl.inVehicle, plSpeed = plVeh ? Math.abs(plVeh.speed) : pl.speed;
    if (ai.mode === 'roadblock') {
      faceToward(p, pl.x, pl.z, dt); p.stop();
      var rb = ai.block;
      if (!rb || rb.released) { ai.mode = 'chase'; ai.lostT = 0; }
      copShoot(p, ai, d, dt);
      copBark(p, ai, d, dt);
      return;
    }
    if (ai.seen) { ai.mode = 'chase'; ai.lostT = 0; }
    if (ai.mode === 'chase') {
      if (!ai.seen) { ai.lostT += dt; if (ai.lostT > 12) { ai.mode = 'alert'; ai.lostT = 0; } }
      var goal = ai.seen ? pl : wanted.lastKnown;
      var car = ai.car && !ai.car.removed && !ai.car.wreck && !ai.car.sinking && !ai.car.driver ? ai.car : null;
      if (plVeh && plSpeed > 5 && d > 16 && car && U.dist2d(p.x, p.z, car.x, car.z) < 32) {
        // the chase is on wheels now: back to the cruiser
        if (p.enterVehicle(car, 0)) { car.ai.mode = 'pursuit'; car.ai.goal = null; car.siren = true; }
        return;
      }
      if (d > K.bustRange * 0.9) walkPath(p, ai, goal.x, goal.z, true, dt);
      else { p.stop(); faceToward(p, pl.x, pl.z, dt); }
      copShoot(p, ai, d, dt);
      copBark(p, ai, d, dt);
    } else if (ai.mode === 'alert' || (wanted.level >= 2 && d < K.sight * 1.4)) {
      ai.mode = 'alert';
      var lk = wanted.lastKnown, dl = walkPath(p, ai, lk.x, lk.z, true, dt);
      if (dl < 3) { p.stop(); ai.lostT += dt; if (ai.lostT > 8) { ai.mode = ai.home ? 'guard' : 'wander'; ai.lostT = 0; ai.tgt = null; } }
      copBark(p, ai, d, dt);
    } else {
      scanThreats(p, ai, dt);
      if (ai.mode === 'flee') fleeTick(p, ai, dt); else if (ai.mode === 'idle') idleTick(p, ai, dt); else wanderTick(p, ai, dt);
      barkTick(p, ai, dt);
    }
  }
  function copShoot(p, ai, d, dt) {
    if (wanted.level < 2 || !ai.seen || d > 24 || d < 2.2) return;
    ai.shotT -= dt;
    if (ai.shotT > 0) return;
    ai.shotT = ai.role === 'swat' ? 1.2 : 0.95;
    var CB = GTP.Combat;
    if (CB && CB.fire && CB.WEAPONS && CB.WEAPONS[p.weapon]) { var pl = player(); p.aiming = true; p.aimYaw = U.dirToYaw(pl.x - p.x, pl.z - p.z); try { CB.fire(p, p.weapon); } catch (e) { U.reportError(e, 'cop.fire'); } }
  }
  function copBark(p, ai, d, dt) {
    ai.barkT -= dt;
    if (ai.barkT > 0 || d > 34) return;
    ai.barkT = R().range(4, 8);
    if (!visibleToCamera(p.x, p.y + 1.5, p.z)) return;
    say(p, barkLine('cop'), ai.role === 'hoa' ? '#f0ad4e' : '#8fb6ff');
  }
  // --- cop cars: patrol as traffic, then pursue / ram / unload ---
  function copCarTick(v, ai, dt) {
    var pl = player(), g = GTP.game;
    var hoa = ai.kind === 'hoa', hostileHoa = hoa && hoaHostile();
    var hostile = pl && pl.alive && g && g.state === 'playing' && (hoa ? (hostileHoa && wanted.level > 0) : wanted.level > 0);
    var d = pl ? U.dist2d(v.x, v.z, pl.x, pl.z) : 1e9;
    ai.seeT = (ai.seeT || 0) - dt;
    if (ai.seeT <= 0) { ai.seeT = 0.25; ai.seen = !!pl && d < K.sightCar && (hostile || hostileHoa) && losClear(v.x, v.y + 1.4, v.z, pl.x, pl.y + 1.2, pl.z); if (ai.seen && hostile) wanted.see(v); }
    // HOA shadowing at zero stars: tail the player through the suburbs
    if (hoa && hostileHoa && !hostile && pl) {
      var dd = W().districtAt(pl.x, pl.z);
      if (dd && dd.id === 'suburbs' && d < 70 && ai.seen) { ai.mode = 'tail'; }
      else if (ai.mode === 'tail') { ai.mode = 'patrol'; adoptLane(v, ai); }
    } else if (ai.mode === 'tail') { ai.mode = 'patrol'; adoptLane(v, ai); }
    if (!hostile) {
      if (ai.mode === 'pursuit' || ai.mode === 'ram') { ai.mode = 'patrol'; v.siren = false; ai.path = null; adoptLane(v, ai); }
      return;
    }
    var plVeh = pl.inVehicle, plSpeed = plVeh ? Math.abs(plVeh.speed) : pl.speed;
    if (ai.mode === 'patrol' && (ai.seen || wanted.level >= 2)) { ai.mode = 'pursuit'; v.siren = true; ai.path = null; ai.pursuitT = 0; }
    if (ai.mode === 'pursuit' || ai.mode === 'ram') {
      ai.pursuitT += dt;
      if (ai.seen) { ai.lostT = 0; ai.goal = { x: pl.x + (pl.vx || 0) * 0.4, z: pl.z + (pl.vz || 0) * 0.4 }; }
      else { ai.lostT += dt; ai.goal = { x: wanted.lastKnown.x, z: wanted.lastKnown.z }; }
      if (ai.seen && plVeh && d < K.ramRange) ai.mode = 'ram'; else if (ai.mode === 'ram' && (ai.lostT > 4 || !plVeh)) ai.mode = 'pursuit';
      // unload: the player is on foot nearby, or his car is boxed in
      var unload = ai.seen && ((!plVeh && d < K.exitRange) || (plVeh && plSpeed < 3 && d < 8));
      if (unload) {
        ai.unloadT = (ai.unloadT || 0) + dt;
        if (Math.abs(v.speed) < 2.5 || ai.unloadT > 2.5) { copsExit(v); return; }
      } else ai.unloadT = 0;
    }
  }
  function copsExit(v) {
    var occ = v.occupants(), ai = v.ai;
    v.setControls(0, 0, true, 1);
    for (var i = 0; i < occ.length; i++) {
      var c = occ[i]; if (c.kind === 'player') continue;
      c.exitVehicle();
      if (c.ai) { c.ai.mode = 'chase'; c.ai.car = v; c.ai.lostT = 0; c.ai.seen = true; c.ai.path = null; c.ai.seeT = 0; }
    }
    ai.mode = 'parked'; ai.goal = null; ai.path = null;
  }
  function copCarStep(v, ai, dt) {
    var pl = player();
    if (!pl) return;
    var goal = ai.goal || wanted.lastKnown, d = U.dist2d(v.x, v.z, pl.x, pl.z), speed = v.cls.maxSpeed * K.pursuitSpeed;
    if (ai.mode === 'tail') { goal = { x: pl.x, z: pl.z }; speed = Math.min(13, speed); if (d < 13) speed = 0; ai.honkT = (ai.honkT || 0) - dt; if (ai.honkT <= 0 && d < 30) { v.honk(); ai.honkT = R().range(4, 9); } }
    var direct = ai.mode === 'ram' || (ai.seen && d < 28 && losClear(v.x, v.y + 1, v.z, goal.x, 1, goal.z));
    if (ai.mode === 'ram') { if (ai.cap < 99 && ai.capReason && ai.capReason.hasPlayer && ai.capReason.hasPlayer()) ai.cap = 99; speed = v.cls.maxSpeed; }
    var gx = goal.x, gz = goal.z;
    if (!direct) {
      ai.repathT = (ai.repathT || 0) - dt;
      var moved = ai.pathGoal && U.dist2d(ai.pathGoal.x, ai.pathGoal.z, goal.x, goal.z) > 24;
      if ((!ai.path || ai.repathT <= 0 || moved) && police.pathBudget > 0) {
        police.pathBudget--;
        ai.path = W().findPath(v.x, v.z, goal.x, goal.z, { mode: 'car', fromY: v.y, toY: W().heightAt(goal.x, goal.z, 0), maxExpansions: 7000 });
        ai.pi = 0; ai.repathT = 1.5; ai.pathGoal = { x: goal.x, z: goal.z };
      }
      if (ai.path && ai.path.length) {
        while (ai.pi < ai.path.length - 1 && U.dist2d(v.x, v.z, ai.path[ai.pi].x, ai.path[ai.pi].z) < 5.5) ai.pi++;
        var wp = ai.path[ai.pi];
        if (ai.pi >= ai.path.length - 1 && U.dist2d(v.x, v.z, wp.x, wp.z) < 6) ai.path = null;
        else { gx = wp.x; gz = wp.z; }
      }
    }
    driveToward(v, ai, gx, gz, speed, dt);
  }
  // --- response: foot cops, cruisers, SWAT vans, roadblocks, the helicopter ---
  function responseSpot(kind, min, max) {
    var Wd = W(), lk = wanted.lastKnown, pl = player();
    for (var tries = 0; tries < 14; tries++) {
      var i, tx, tz, x, z, y = 0;
      if (kind === 'ped') { i = R().pick(Wd._sidewalkTiles); if (i == null) return null; tx = i % Wd.w; tz = (i / Wd.w) | 0; x = (tx + 0.5) * TILE; z = (tz + 0.5) * TILE; }
      else { i = R().pick(Wd._roadTiles); if (i == null) return null; tx = i % Wd.w; tz = (i / Wd.w) | 0; if (Wd.meta[tileI(tx, tz)] & M.DEAD) continue; x = (tx + 0.5) * TILE; z = (tz + 0.5) * TILE; }
      var d = U.dist2d(x, z, lk.x, lk.z); if (d < min || d > max) continue;
      if (pl && inView(x, y + 1, z, 90)) continue;
      var near = E().hash.query(x, z, kind === 'ped' ? 1.5 : 9, scratch3), blocked = false;
      for (var k = 0; k < near.length; k++) if (near[k].kind === 'vehicle' || (kind === 'ped' && near[k].kind === 'ped')) { blocked = true; break; }
      if (blocked) continue;
      if (kind === 'ped') return { x: x + R().range(-1, 1), z: z + R().range(-1, 1) };
      var h = laneByte(tx, tz, 'h', false), vb = laneByte(tx, tz, 'v', false); if (h && vb) continue;
      var axis = h ? 'h' : 'v', li = laneInfo(h || vb, axis, tx, tz);
      return { x: x, z: z, y: 0, tx: tx, tz: tz, axis: axis, dir: li.dir, laneC: li.center, deck: false, district: districtIdAt(x, z) };
    }
    return null;
  }
  function copCounts() {
    var list = E().list, foot = 0, cars = 0, vans = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i]; if (e.removed) continue;
      if (e.kind === 'ped' && e.alive && (e.role === 'cop' || e.role === 'swat') && !e.inVehicle && e.ai && (e.ai.mode === 'chase' || e.ai.mode === 'alert' || e.ai.mode === 'roadblock')) foot++;
      else if (e.kind === 'vehicle' && e.ai && !e.wreck && !e.sinking) { if (e.tag === 'swat') vans++; else if (e.type === 'cop' && e.ai.kind !== 'parked' && e.ai.mode !== 'roadblock') cars++; }
    }
    return { foot: foot, cars: cars, vans: vans };
  }
  function spawnResponders(dt) {
    var lvl = wanted.level, pl = player();
    if (!lvl || !pl || !pl.alive) { if (police.heli && !police.heli.leaving) police.heli.leave(); return; }
    var q = K.response, ix = lvl - 1, cnt = copCounts();
    police.footT -= dt; police.cruiserT -= dt; police.swatT -= dt; police.roadblockT -= dt;
    if (cnt.foot < q.foot[ix] && police.footT <= 0) {
      police.footT = q.footEvery[ix];
      var s = responseSpot('ped', 30, 80);
      if (s) { var cop = spawner.spawnPed(s.x, s.z, 'cop', { mode: 'alert' }); cop.ai.ambient = false; cop.ai.lostT = 0; }
    }
    if (cnt.cars < q.cruisers[ix] && police.cruiserT <= 0) {
      police.cruiserT = q.cruiserEvery[ix];
      var cs = responseSpot('car', 70, 160);
      if (cs) { var cv = spawner.placeTraffic(cs, 'cop', null); cv.ai.mode = 'pursuit'; cv.siren = true; cv.lights = true; cv.ai.pursuitT = 0; }
    }
    if (cnt.vans < q.swat[ix] && police.swatT <= 0) {
      police.swatT = q.swatEvery[ix];
      var ss = responseSpot('car', 80, 170);
      if (ss) {
        var van = spawner.placeTraffic(ss, 'van', { kind: 'cop', color: '#1a1c24', tag: 'swat', driverLook: null });
        van.isPolice = true; van.siren = true; van.lights = true; van.ai.mode = 'pursuit'; van.tag = 'swat';
        var occ = van.occupants(); for (var i = 0; i < occ.length; i++) { occ[i].role = 'swat'; occ[i].weapon = 'shotgun'; if (occ[i].ai) occ[i].ai.role = 'swat'; }
        // swat looks: re-roll the occupants' looks is cosmetic only; the badge/helmet come with the role pool at spawn time
        for (i = occ.length; i < 3; i++) { var sw = spawner.spawnPed(ss.x, ss.z, 'swat'); sw.ai.ambient = false; sw.ai.driver = true; if (!van.enter(sw, i)) sw.destroy(); }
      }
    }
    if (q.heli[ix] && !police.heli) { police.heli = new Heli(); E().add(police.heli); }
    else if (!q.heli[ix] && police.heli && !police.heli.leaving) police.heli.leave();
    // roadblocks ahead of a driving player
    if (lvl >= K.roadblock.minStar && pl.inVehicle && Math.abs(pl.inVehicle.speed) > 8 && police.roadblockT <= 0 && police.roadblocks.length < K.roadblock.max) {
      police.roadblockT = K.roadblock.every;
      placeRoadblock(pl.inVehicle);
    }
  }
  function placeRoadblock(pv) {
    var Wd = W(), vx = pv.vx, vz = pv.vz, axis = Math.abs(vx) >= Math.abs(vz) ? 'h' : 'v', dir = axis === 'h' ? (vx >= 0 ? 1 : -1) : (vz >= 0 ? 1 : -1);
    var dx = axis === 'h' ? dir : 0, dz = axis === 'v' ? dir : 0, tx = Math.floor(pv.x / TILE), tz = Math.floor(pv.z / TILE);
    var range = K.roadblock.ahead, k0 = Math.round(range[0] / TILE), k1 = Math.round(range[1] / TILE);
    for (var k = k0; k <= k1; k++) {
      var ax = tx + dx * k, az = tz + dz * k;
      if (!Wd.inBounds(ax, az)) return false;
      var i = tileI(ax, az), t = Wd.tiles[i], m = Wd.meta[i];
      if (t !== T.ROAD || (m & M.H && m & M.V) || (m & M.CROSSWALK) || (m & M.DEAD) || Wd.deck[i]) continue;
      var byte = laneByte(ax, az, axis, false); if (!byte) continue;
      var li = laneInfo(byte, axis, ax, az), ok = true, j;
      for (j = 0; j < li.w; j++) { var lx = axis === 'h' ? ax : li.lo + j, lz = axis === 'h' ? li.lo + j : az; if (Wd.tile(lx, lz) !== T.ROAD) { ok = false; break; } }
      if (!ok) continue;
      // a roadblock already near this tile, or a car sitting on it: try the next tile along (never give up the whole window)
      var tooClose = false;
      for (j = 0; j < police.roadblocks.length; j++) if (U.dist2d(police.roadblocks[j].x, police.roadblocks[j].z, (ax + 0.5) * TILE, (az + 0.5) * TILE) < 60) { tooClose = true; break; }
      if (tooClose) continue;
      var along = (ax + 0.5) * TILE, rb = { x: axis === 'h' ? along : (li.lo + li.w / 2) * TILE, z: axis === 'h' ? (li.lo + li.w / 2) * TILE : along, axis: axis, dir: dir, along: along, cars: [], cops: [], t: 0, released: false };
      var near = E().hash.query(rb.x, rb.z, 10, scratch3), carNear = false;
      for (j = 0; j < near.length; j++) if (near[j].kind === 'vehicle') { carNear = true; break; }
      if (carNear) continue;
      for (j = 0; j < li.w / 2; j++) {
        var lat = (li.lo + 2 * j + 1) * TILE, cx = axis === 'h' ? along : lat, cz = axis === 'h' ? lat : along;
        var yaw = axis === 'h' ? U.dirToYaw(0, j % 2 ? 1 : -1) : U.dirToYaw(j % 2 ? 1 : -1, 0);
        var car = spawner.spawnVehicle(cx, cz, 'cop', { yaw: yaw, kind: 'roadblock' });
        car.ai.mode = 'roadblock'; car.siren = true; car.lights = true; car.vx = car.vz = 0; car.speed = 0;
        rb.cars.push(car);
        for (var c = 0; c < 2; c++) {
          var px = cx + dx * (car.hw + 1.3) + (axis === 'h' ? 0 : (c ? 1.4 : -1.4)), pz = cz + dz * (car.hw + 1.3) + (axis === 'h' ? (c ? 1.4 : -1.4) : 0);
          var cop = spawner.spawnPed(px, pz, 'cop', { mode: 'roadblock' });
          cop.ai.ambient = false; cop.ai.car = car; cop.ai.block = rb; cop.yaw = U.dirToYaw(-dx, -dz);
          rb.cops.push(cop);
        }
      }
      police.roadblocks.push(rb);
      GTP.Events.emit('roadblock', { x: rb.x, z: rb.z, axis: axis });
      return true;
    }
    return false;
  }
  function updateRoadblocks(dt) {
    var pl = player();
    for (var i = police.roadblocks.length - 1; i >= 0; i--) {
      var rb = police.roadblocks[i]; rb.t += dt;
      var passed = pl && ((pl.x - rb.x) * (rb.axis === 'h' ? rb.dir : 0) + (pl.z - rb.z) * (rb.axis === 'v' ? rb.dir : 0)) > 12;
      if (!rb.released && (passed || rb.t > K.roadblock.life || wanted.level === 0)) {
        rb.released = true;
        for (var j = 0; j < rb.cars.length; j++) { var car = rb.cars[j]; if (!car.removed) { car.ai.kind = 'cop'; car.ai.mode = 'parked'; } }
        for (j = 0; j < rb.cops.length; j++) { var cop = rb.cops[j]; if (cop.ai) { cop.ai.mode = wanted.level ? 'chase' : 'wander'; cop.ai.block = null; cop.ai.lostT = 0; } }
      }
      if (rb.released && rb.t > K.roadblock.life + 10) police.roadblocks.splice(i, 1);
    }
  }
  // ------------------------------------------------------------ helicopter --
  // Circles above the player at five stars with a spotlight cone; sees the player by raycast.
  class Heli extends GTP.Entity {
    constructor() {
      var pl = player();
      super({ kind: 'heli', x: pl ? pl.x + 80 : 0, y: (pl ? pl.y : 0) + K.heli.altitude + 20, z: pl ? pl.z - 60 : 0, persistent: true, radius: 3, height: 3, hp: 400 });
      this.angle = R().random() * U.TAU; this.leaving = false; this.leaveT = 0; this.rotor = 0; this.bank = 0; this.sees = false; this.seeT = 0;
      this.spot = { x: this.x, z: this.z }; this.spotY = 0; this.altitude = this.y;
      this.mesh = Heli.buildMesh();
      GTP.Events.emit('heli', { on: true });
      if (GTP.Audio && GTP.Audio.heli) { try { GTP.Audio.heli(true, this.x, this.z); } catch (e) { /* optional */ } }
    }
    leave() { if (this.leaving) return; this.leaving = true; this.leaveT = 0; var a = R().random() * U.TAU; this.leaveDir = { x: Math.cos(a), z: Math.sin(a) }; GTP.Events.emit('heli', { on: false }); if (GTP.Audio && GTP.Audio.heli) { try { GTP.Audio.heli(false, this.x, this.z); } catch (e) { /* optional */ } } }
    update(dt) {
      this.age += dt;
      var pl = player(), H = K.heli, Wd = W();
      if (!pl) { this.destroy(); return; }
      var tx, tz, ty;
      if (this.leaving) { this.leaveT += dt; tx = this.x + this.leaveDir.x * 60; tz = this.z + this.leaveDir.z * 60; ty = this.y + 12; if (this.leaveT > 9) { this.destroy(); if (police.heli === this) police.heli = null; return; } }
      else { this.angle += H.orbit * dt; tx = pl.x + Math.cos(this.angle) * H.radius; tz = pl.z + Math.sin(this.angle) * H.radius; ty = pl.y + H.altitude; }
      // stay above the roofs
      var i = Wd.inBounds(Math.floor(this.x / TILE), Math.floor(this.z / TILE)) ? tileI(Math.floor(this.x / TILE), Math.floor(this.z / TILE)) : -1;
      if (i >= 0 && Wd.tiles[i] === T.BUILDING) { var b = Wd.buildings[Wd.bidx[i] - 1]; if (b && b.y + b.h + 8 > ty) ty = b.y + b.h + 8; }
      var dx = tx - this.x, dz = tz - this.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
      var want = Math.min(H.speed, d * 1.1);
      this.vx = U.damp(this.vx, dx / d * want, 1.6, dt); this.vz = U.damp(this.vz, dz / d * want, 1.6, dt);
      this.x += this.vx * dt; this.z += this.vz * dt; this.y = U.damp(this.y, ty, 1.5, dt);
      var vl = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
      if (vl > 1) this.yaw = U.angleDamp(this.yaw, U.dirToYaw(this.vx, this.vz), 2.5, dt);
      this.bank = U.damp(this.bank, U.clamp(-vl * 0.012, -0.28, 0.28), 2, dt);
      this.rotor += dt * 34;
      // the spotlight hunts the player with a little sway
      var sx = pl.x + (pl.vx || 0) * 0.3 + Math.sin(this.age * 1.4) * 2.2, sz = pl.z + (pl.vz || 0) * 0.3 + Math.cos(this.age * 1.1) * 1.8;
      this.spot.x = U.damp(this.spot.x, sx, 3.5, dt); this.spot.z = U.damp(this.spot.z, sz, 3.5, dt);
      this.spotY = Wd.heightAt(this.spot.x, this.spot.z, pl.y);
      this.seeT -= dt;
      if (this.seeT <= 0) { this.seeT = 0.25; this.sees = !this.leaving && wanted.level > 0 && U.dist2d(this.x, this.z, pl.x, pl.z) < K.heliSight && losClear(this.x, this.y - 1, this.z, pl.x, pl.y + 1.2, pl.z); if (this.sees) wanted.see(this); }
      if (GTP.Audio && GTP.Audio.heli && this.age % 0.5 < dt) { try { GTP.Audio.heli(!this.leaving, this.x, this.z); } catch (e) { /* optional */ } }
    }
    syncMesh(alpha) {
      var m = this.mesh; if (!m) return;
      var a = alpha == null ? 1 : alpha, ud = m.userData;
      m.position.set(this._px + (this.x - this._px) * a, this._py + (this.y - this._py) * a, this._pz + (this.z - this._pz) * a);
      ud.body.rotation.set(0, this._pyaw + U.wrapAngle(this.yaw - this._pyaw) * a, this.bank, 'YXZ');
      ud.rotor.rotation.y = this.rotor; ud.tailRotor.rotation.x = this.rotor * 1.7;
      // light + cone from the belly to the ground spot (group space: no rotation)
      var lx = this.spot.x - m.position.x, ly = this.spotY - m.position.y, lz = this.spot.z - m.position.z;
      ud.target.position.set(lx, ly, lz);
      var len = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
      ud.cone.position.set(lx * 0.5, -0.8 + ly * 0.5, lz * 0.5);
      ud.cone.scale.set(7, len, 7);
      ud.cone.quaternion.setFromUnitVectors(ud.up, ud.dirV.set(-lx / len, -ly / len, -lz / len));
      ud.pool.position.set(lx, ly + 0.06, lz);
      var night = GTP.Render ? GTP.Render.night || 0 : 0, on = !this.leaving;
      ud.light.visible = on; ud.light.intensity = 3 + 6 * night;
      ud.cone.visible = on; ud.cone.material.opacity = 0.05 + 0.1 * night;
      ud.pool.visible = on; ud.pool.material.opacity = 0.25 + 0.45 * night;
      m.visible = !this.removed;
    }
    static buildMesh() {
      var A = GTP.Assets, G = GTP.GeoBuilder, grp = new THREE.Group(), body = new THREE.Group();
      var navy = [0.10, 0.12, 0.18], white = [0.92, 0.93, 0.95], glass = [0.45, 0.6, 0.75], dark = [0.08, 0.08, 0.1];
      var g = new G({ color: true });
      g.box(-0.85, -0.2, -1.9, 1.7, 1.5, 3.9, G.UV0, navy);                 // cabin (forward = -z)
      g.box(-0.75, 0.25, -2.3, 1.5, 0.9, 0.9, G.UV0, glass);                 // canopy
      g.box(-0.9, 0.35, -0.6, 1.8, 0.35, 1.4, G.UV0, white);                 // white stripe
      g.box(-0.2, -0.05, 1.9, 0.4, 0.45, 3.4, G.UV0, navy);                  // tail boom
      g.box(-0.06, 0.3, 4.6, 0.12, 1.2, 0.8, G.UV0, navy);                   // fin
      g.box(-0.3, 1.3, -0.3, 0.6, 0.35, 0.6, G.UV0, dark);                   // rotor mast
      g.box(-1.0, -0.95, -1.6, 0.12, 0.12, 3.2, G.UV0, dark); g.box(0.88, -0.95, -1.6, 0.12, 0.12, 3.2, G.UV0, dark);   // skids
      g.box(-1.0, -0.85, -0.9, 0.1, 0.65, 0.1, G.UV0, dark); g.box(0.9, -0.85, -0.9, 0.1, 0.65, 0.1, G.UV0, dark);
      g.box(-1.0, -0.85, 0.7, 0.1, 0.65, 0.1, G.UV0, dark); g.box(0.9, -0.85, 0.7, 0.1, 0.65, 0.1, G.UV0, dark);
      var hull = new THREE.Mesh(g.build(), A.propMaterial()); hull.castShadow = true; hull.name = 'hull';
      var rg = new G({ color: true });
      rg.box(-4.6, 0, -0.14, 9.2, 0.07, 0.28, G.UV0, dark); rg.box(-0.14, 0, -4.6, 0.28, 0.07, 9.2, G.UV0, dark);
      var rotor = new THREE.Mesh(rg.build(), A.propMaterial()); rotor.position.set(0, 1.68, 0); rotor.name = 'rotor';
      var tg = new G({ color: true }); tg.box(-0.05, -0.7, -0.09, 0.1, 1.4, 0.18, G.UV0, dark);
      var tail = new THREE.Mesh(tg.build(), A.propMaterial()); tail.position.set(0.12, 0.9, 4.95); tail.name = 'tailRotor';
      body.add(hull); body.add(rotor); body.add(tail);
      grp.add(body);
      var light = new THREE.SpotLight(0xfff0c8, 6, 90, 0.2, 0.55, 1); light.castShadow = false; light.position.set(0, -0.9, 0);
      var target = new THREE.Object3D(); target.position.set(0, -30, 0);
      light.target = target; grp.add(light); grp.add(target);
      var cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true }));
      cone.renderOrder = 6; cone.name = 'cone'; grp.add(cone);
      var pool = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: A.glow, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff1cc }));
      pool.rotation.x = -Math.PI / 2; pool.renderOrder = 5; pool.name = 'pool'; grp.add(pool);
      grp.userData = { body: body, rotor: rotor, tailRotor: tail, light: light, target: target, cone: cone, pool: pool, up: new THREE.Vector3(0, 1, 0), dirV: new THREE.Vector3() };
      grp.name = 'heli';
      return grp;
    }
  }

  // ------------------------------------------------------- busted, garages --
  function bustCheck(dt) {
    var pl = player(), g = GTP.game;
    if (!pl || !pl.alive || !g || g.state !== 'playing' || wanted.level === 0) { police.bustT = 0; return; }
    var v = pl.inVehicle;
    if (v && Math.abs(v.speed) > 0.5) { police.bustT = Math.max(0, police.bustT - dt); return; }
    var list = E().hash.query(pl.x, pl.z, K.bustRange + 1, scratch3), cop = null;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.kind !== 'ped' || !e.alive || e.inVehicle || e.knockedDown || !isCop(e)) continue;
      if (Math.abs(e.y - pl.y) > 1.5) continue;
      var d = v ? v.edgeDistance(e.x, e.z) : U.dist2d(e.x, e.z, pl.x, pl.z);   // at a car door, or within arm's reach on foot
      if (d <= K.bustRange) { cop = e; break; }
    }
    if (!cop) { police.bustT = Math.max(0, police.bustT - dt * 2); return; }
    police.bustT += dt;
    if (police.bustT >= K.bustTime) bust(cop);
  }
  function bust(cop) {
    var pl = player(), g = GTP.game;
    police.bustT = 0; police.bustCop = cop;
    if (cop) { say(cop, (GTP.Content.radio && GTP.Content.radio.barks.cop[7]) || 'Busted!', '#8fb6ff'); if (cop.ai) { cop.ai.mode = 'idle'; cop.ai.idleT = 4; } cop.stop(); }
    sfx('siren', pl.x, pl.z, 0.8);
    GTP.Events.emit('busted', { player: pl, cop: cop || null, level: wanted.level, fine: C.ECONOMY.bustedFine });
    var CB = GTP.Combat;
    if (CB && typeof CB.onPlayerBusted === 'function') { try { CB.onPlayerBusted(pl, cop); } catch (e) { U.reportError(e, 'combat.onPlayerBusted'); } return; }
    // fallback flow until Combat owns the DEPLATFORMED card: freeze, 3 s, respawn at the precinct
    pl.controlEnabled = false; pl.stop();
    if (pl.inVehicle) { var v = pl.inVehicle; v.setControls(0, 0, true, 1); pl.exitVehicle(); }
    police.busted = true; police.bustedT = 0;
    g.setState('busted');
    toast((GTP.Content.radio && GTP.Content.radio.failTexts && GTP.Content.radio.failTexts.busted) || 'DEPLATFORMED');
  }
  // called by Game.step while the state is 'busted' (fallback flow only)
  function updateRespawn(dt) {
    if (!police.busted) return;
    police.bustedT += dt;
    if (police.bustedT < 3) return;
    police.busted = false;
    var pl = player(), g = GTP.game, Wd = W();
    var lm = Wd.landmark((GTP.Content.world.respawn && GTP.Content.world.respawn.police) || 'police_hq');
    var sp = lm && lm.door ? lm.door : { x: pl.x, z: pl.z };
    pl.weapons = { fist: Infinity }; pl.weapon = 'fist'; pl.money = Math.max(0, pl.money - C.ECONOMY.bustedFine);
    pl.hp = pl.maxHp; pl.knockedDown = false; pl.swimming = false; pl.state = 'idle'; pl.alive = true;
    pl.stats.busted = (pl.stats.busted || 0) + 1;
    pl.x = sp.x; pl.z = sp.z; pl.y = Wd.heightAt(sp.x, sp.z, 0); pl.vx = pl.vz = pl.vy = 0; pl.onGround = true; pl.snap();
    if (pl._sh) E().hash.update(pl);
    wanted.clear(); pl.controlEnabled = true;
    if (GTP.Render && GTP.Render.rig) { GTP.Render.rig.snap(); GTP.Render.updateCamera(0); }
    g.setState('playing');
    GTP.Events.emit('player:respawn', { player: pl, at: 'police' });
  }
  function garageCheck(dt) {
    police.garageT -= dt; police.garageToastT -= dt;
    if (police.garageT > 0) return;
    police.garageT = 0.25;
    var pl = player(), v = pl && pl.inVehicle;
    if (!v || v.driver !== pl || Math.abs(v.speed) > 1.5 || wanted.level === 0) return;
    var lms = W().landmarks;
    for (var i = 0; i < lms.length; i++) {
      var gr = lms[i].garage; if (!gr) continue;
      if (!U.pointInRect(v.x, v.z, gr.x, gr.z, gr.w, gr.d)) continue;
      var cost = wanted.level * C.WANTED.sprayCostPerStar;
      if (pl.money >= cost) {
        pl.money -= cost; wanted.clear(); v.hp = v.maxHp; v.damage = 0;
        if (v.cls && v.cls.colors && v.cls.colors.length > 1) { var nc = R().pick(v.cls.colors); if (nc !== v.color && v.mesh && v.mesh.userData.paint) { v.color = nc; v.mesh.userData.paint.color.set(nc); } }
        fx({ type: 'puff', x: v.x, y: v.y + 1, z: v.z, size: 3, life: 0.8, color: 0xffe6a0 });
        sfx('cash', v.x, v.z, 0.8);
        toast(lms[i].name + ': resprayed. ' + U.fmtMoney(-cost));
        GTP.Events.emit('garage', { landmark: lms[i].id, cost: cost });
      } else if (police.garageToastT <= 0) { police.garageToastT = 8; toast('Respray is ' + U.fmtMoney(cost) + '. Come back with money.'); }
      return;
    }
  }

  // --------------------------------------------------------------- update --
  var stepN = 0;
  var AI = GTP.AI = {
    K: K, wanted: wanted, spawner: spawner, police: police, alarms: alarms, Heli: Heli,
    stats: { peds: 0, cars: 0, parked: 0, cops: 0, cruisers: 0, ms: 0 },
    // Combat calls this on every shot / blast; peds within r flee the point
    alarm: function (x, z, r, src, mild) { addAlarm(x, z, r || 20, src, mild); },
    // hand a vehicle (with a living non-player driver) to the traffic / police brain: kind 'traffic'|'cop'|'hoa'
    drive: function (v, kind) {
      if (!v || v.kind !== 'vehicle') return null;
      v.ai = newCarAI(v, kind || (v.type === 'cop' ? 'cop' : 'traffic'));
      if (!adoptLane(v, v.ai)) { var rp = W().nearestRoadPoint(v.x, v.z); if (rp) v.ai.recover = { x: rp.x, z: rp.z }; }
      if (v.driver && !v.driver.ai) v.driver.ai = newPedAI(v.driver, v.driver.role, {});
      if (v.driver && v.driver.ai) { v.driver.ai.ambient = false; v.driver.ai.driver = true; }
      return v.ai;
    },
    // stop driving a vehicle (missions take the wheel back)
    release: function (v) { if (v && v.ai) { v.ai = null; v.setControls(0, 0, false, 0); } },
    say: say,
    syncBark: syncBark,   // missions call it for peds with a mission brain (the AI never ticks those)
    update: function (dt) {
      var t0 = U.now();
      stepN++;
      try { ensureT(); pruneAlarms(); wanted.update(dt); police.pathBudget = 1; } catch (e) { U.reportError(e, 'ai.wanted'); }
      try { spawner.update(dt); } catch (e) { U.reportError(e, 'ai.spawner'); }
      var list = E().list, n = list.length, e, ai, i;
      for (i = 0; i < n; i++) {
        e = list[i]; ai = e.ai;
        if (e.removed) continue;
        if (!ai) {
          // peds made elsewhere (debug.spawnPed, missions) get a brain on sight; vehicles only via AI.drive(v)
          if (e.kind === 'ped') ai = e.ai = newPedAI(e, e.role, { mode: 'wander' });
          else continue;
        }
        try {
          if (e.kind === 'ped') { if ((stepN + ai.phase) % K.pedTick === 0) pedTick(e, K.pedTick * dt); }
          else if (e.kind === 'vehicle') {
            if (ai.kind === 'parked' || ai.mode === 'parked' || ai.mode === 'roadblock' || e.wreck || e.sinking || e.hasPlayer() || !e.driver || !e.driver.alive) continue;
            var cop = ai.kind === 'cop' || ai.kind === 'hoa';
            if (cop && (stepN + ai.phase) % K.carTick === 0) copCarTick(e, ai, K.carTick * dt);
            if (ai.mode === 'parked') continue;
            if (cop && ai.mode && ai.mode !== 'patrol') { if ((stepN + ai.phase) % K.carTick === 0) { ai.deck = onDeck(e); aheadCaps(e, ai, K.carTick * dt); } copCarStep(e, ai, dt); }
            else { if ((stepN + ai.phase) % K.carTick === 0) carPlanTick(e, ai, K.carTick * dt); carStep(e, ai, dt); }
          }
        } catch (err) { U.reportError(err, 'ai.' + e.kind + '#' + e.id); }
      }
      try {
        police.tickT += dt;
        if (police.tickT >= 1) { police.tickT -= 1; spawnResponders(1); }
        updateRoadblocks(dt);
        bustCheck(dt);
        garageCheck(dt);
        if (police.heli && police.heli.removed) police.heli = null;
      } catch (e) { U.reportError(e, 'ai.police'); }
      AI.stats.ms = U.now() - t0;
    },
    updateRespawn: updateRespawn,
    reset: function () {
      stepN = 0; alarms.length = 0;
      wanted.clear(); wanted.lastSeen = -1e9;
      spawner.reset(); police.reset();
    },
    debug: {
      counts: function () {
        var c = spawner.counts(), cc = copCounts();
        return { peds: c.peds, cars: c.cars, parked: c.parked, foot: cc.foot, cruisers: cc.cars, vans: cc.vans, heli: !!police.heli, roadblocks: police.roadblocks.length, wanted: wanted.level, heat: +wanted.heat.toFixed(2), sinceSeen: +(simT() - wanted.lastSeen).toFixed(2) };
      },
      cops: function () {
        var out = [], list = E().list, pl = player();
        for (var i = 0; i < list.length; i++) { var e = list[i]; if (e.kind === 'ped' && e.alive && isCop(e) && !e.removed) out.push({ id: e.id, x: +e.x.toFixed(1), z: +e.z.toFixed(1), mode: e.ai ? e.ai.mode : null, inVehicle: !!e.inVehicle, d: pl ? +U.dist2d(e.x, e.z, pl.x, pl.z).toFixed(1) : null }); }
        return out;
      },
      nearestCop: function () { var cs = AI.debug.cops(), best = null; for (var i = 0; i < cs.length; i++) if (!best || cs[i].d < best.d) best = cs[i]; return best; },
      vehicles: function () {
        var out = [], list = E().list;
        for (var i = 0; i < list.length; i++) { var v = list[i]; if (v.kind !== 'vehicle' || !v.ai || v.removed) continue; out.push({ id: v.id, type: v.type, kind: v.ai.kind, mode: v.ai.mode, x: +v.x.toFixed(1), z: +v.z.toFixed(1), y: +v.y.toFixed(2), speed: +v.speed.toFixed(1), plan: v.ai.plan ? v.ai.plan.kind + (v.ai.plan.turning ? '*' : '') : null, stop: v.ai.stopAlong != null, cap: +Math.min(99, v.ai.cap).toFixed(1), driver: !!v.driver, stuck: +v.ai.stuckT.toFixed(1) }); }
        return out;
      }
    }
  };
  hookHeat();
})();
