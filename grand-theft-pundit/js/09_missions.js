/* Grand Theft Pundit: 09_missions.js
 * GTP.Missions: the objective interpreter (goto drive_to enter_vehicle pickup follow
 * escape_wanted survive destroy defeat dialogue minigame timer_wrap), tagged mission
 * spawns (vehicles, cast peds, goons, pickups), the blue / yellow light markers, the
 * dialogue queue, mission banners and cards through GTP.UI hooks, rewards, flags,
 * failOn rules, abort, the ?mission= jump-in, and the mission brains that drive
 * goons and tailing targets (the AI never ticks a ped whose brain is a mission brain).
 *
 * Distances in the mission data (radius, maxDist) are GDD units: 8 per metre
 * (GTP.C.MISSIONS.unit); everything else here is metres.
 *
 * Hooks the UI may define (every one is optional, there is a fallback):
 *   GTP.UI.banner(title, sub)                 mission title banner at start
 *   GTP.UI.card(kind, title, sub)             'passed' | 'failed' cards (MISSION PASSED / CONTEXT STAMPED)
 *   GTP.UI.showDialogue(line, next)           show one line {who, name, color, text}; call next() to advance
 *                                             (without it a line auto-advances after C.MISSIONS.lineSeconds or on confirm/action)
 *   GTP.UI.hideDialogue()                     a mission ended mid-line
 *   GTP.UI.ticker(text)                       a `ticker: true` line; never blocks
 *   GTP.UI.startMinigame(game, params, done)  'debate' | 'ratio'; done(win); without it the game auto-resolves (C.MISSIONS.minigameFallback)
 *   GTP.UI.credits()                          after either ending mission completes
 *   GTP.UI.toast(text)
 * Data the UI reads: Missions.state (active, objectiveText, progress, timer, dialogue[0], minigame, flags,
 * completed), Missions.markers() for the minimap, Missions.objectiveTarget() for the HUD arrow, Missions.hud().
 *
 * Expansion (GDD_EXPANSION §3, §5, §6.4, §6.5, §7): the mission list is GTP.Content.missions plus
 * GTP.Content.expansion.missions with `expansion.retune` patches applied at init; new objective types
 * equip deliver_passenger stop_vehicle stunt race collect_any cutscene shop; defeat / destroy / spawn
 * extensions (weapon, mustKill, stationary, hostile:false, driven:'cop', colors, flee, cast-id peds);
 * targets {landmark, point} / {landmark, offset} / {tag}; checkpoints (a snapshot per objective,
 * Missions.retry / restart / replay with best times); intro cutscenes through GTP.Cutscenes; the
 * subscribers meta counter (Missions.addSubs, tiers and perks); and GTP.Strands, the side-strand
 * runtime (Loud Cab, HOA Patrol, Sponsor Runs, Ratio Rampages, Monday Memos, Loop Races, Stunt Jumps)
 * at the end of this file, with the GDD's tables as fallbacks when Content.expansion.strands is silent.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util, TAU = Math.PI * 2;

  var K = C.MISSIONS = Object.assign({
    unit: 0.125,              // mission data distances are 2D units: 8 per metre
    markerRadius: 1.9,        // stand inside the blue light on foot to start a mission
    startHold: 0.5,           // seconds inside the marker before the mission starts
    lineSeconds: 2.5,         // auto-advance per dialogue line when the UI has no dialogue box
    gotoRadius: 6, driveRadius: 12,
    followTooClose: 6, followCloseTime: 3, followFarTime: 5, followPace: 0.58,   // a brisk 3.2 m/s: the player jogs, the long Lobby Row tails stay under three minutes
    waveEvery: 10, maxHostiles: 14,
    defeatHold: 3,
    giverRange: 170,          // the giver stands at a marker this close to the player
    kipRange: 40,             // Kip turns up (six draw calls) once the player is this close
    minigameFallback: 2,      // seconds until a minigame auto-resolves as a win when the UI has none (0 = never)
    brainTick: 3,             // mission brains run every n fixed steps
    retryBonus: 15,           // seconds added to a timer on RETRY (never past the original)
    stopNear: 6, stopNearFoot: 3, escapeTime: 5,   // stop_vehicle: the player's car this close (or on foot), beyond maxDist this long = escaped
    boardRadius: 4, boardHold: 1, dropRadius: 12, passengerLeaveTime: 10,
    cutsceneAfterDelay: 5,    // the MISSION PASSED card (4.8 s) is gone before an act cutscene starts (QA-C1-12)
    subsPerReward: 3,         // story subscribers: reward x 3, so the story alone ends in tier 3 (GDD_EXPANSION §5.8, QA-STR-16)
    chaosCapPerMinute: 500,
    weaponAmmo: { megaphone: 20, pistol: 40, hottake: 8, smg: 90, shotgun: 16, tableleg: Infinity, revolver: 24, rifle: 90, hotmic: 4, sniper: 10, ratio: 3 },
    meleeSwing: [1.6, 2.4],   // seconds between a mission goon's punches (a wind-up, not the fist's 2.5/s player rate; QA-C1-01)
    meleeWindup: 0.35,        // the goon telegraphs a punch this long before it lands
    meleeAttackers: 2,        // goons that punch at once; the rest circle at arm's length
    followGrace: 4,           // a tail's 'too close' clock starts after this many seconds or once the target first pulls away
    followLead: 14,           // the tailing target starts this far ahead of the player along its path
    ammoRefillDelay: 2,       // a weapon-restricted objective refills its weapon this long after it runs dry (QA-C1-03)
    stationaryFireRange: 140, // stationary ranged goons (snipers, couriers on a causeway) open fire from this far, badly
    beaconHeight: 140,        // the story light's sky beam: seen from 200 m and more
    callDelay: 3.5,           // seconds after MISSION PASSED (and any act cutscene) before the next giver phones
    retryExpire: 180,         // a RETRY offer goes stale after this many seconds of free roam
    colors: { mission: 0x2f6cff, objective: 0xffd45a, strand: 0xff3fa4, race: 0xffffff, hoa: 0xff3b30 }
  }, C.MISSIONS || {});

  // ------------------------------------------------------------- helpers --
  var scratch = [];
  var mrng = null;
  function R() { return mrng || (mrng = GTP.rng.fork(0x3155)); }
  function W() { return GTP.World; }
  function E() { return GTP.Entities; }
  function game() { return GTP.game; }
  function player() { return GTP.game ? GTP.game.player : null; }
  function simT() { return (GTP.game && GTP.game.time) ? GTP.game.time.t : 0; }
  function fx(o) { if (GTP.Render && GTP.Render.fx) { try { GTP.Render.fx.add(o); } catch (e) { /* fx optional */ } } }
  function sfx(name, x, z, gain) { if (GTP.Audio && GTP.Audio.play) { try { GTP.Audio.play(name, { x: x, z: z, gain: gain }); } catch (e) { /* audio optional */ } } }
  function toast(t) { if (GTP.UI && GTP.UI.toast) { try { GTP.UI.toast(t); } catch (e) { /* ui optional */ } } }
  function ui(name) { return (GTP.UI && typeof GTP.UI[name] === 'function') ? GTP.UI[name] : null; }
  function callUI(name) {
    var fn = ui(name); if (!fn) return false;
    try { fn.apply(GTP.UI, Array.prototype.slice.call(arguments, 1)); } catch (e) { U.reportError(e, 'ui.' + name); }
    return true;
  }
  function emit(name, payload) { GTP.Events.emit('mission:' + name, payload || {}); }
  function metres(v, dflt) { return v == null ? dflt : v * K.unit; }
  function castOf(id) {
    var Ct = GTP.Content;
    if (!Ct || !Ct.cast) return null;
    return Ct.cast[id] || null;
  }
  function textFx(text, x, y, z, color, life) { fx({ type: 'text', text: text, x: x, y: y, z: z, color: color || '#ffd45a', life: life || 1.4 }); }

  var registry = {};
  function expansion() { return (GTP.Content && GTP.Content.expansion) || {}; }
  // the story: the base seventeen plus the expansion's missions, in content order (the expansion's slot in by `requires`)
  var _all = null, _allKey = null, sideIds = {};
  // v0.3: plus GTP.Content.parity.missions (m01c, the boss missions, the heist), which the content track slots into the chain
  // through `requires`
  function parityMissions() { var P = GTP.Content && GTP.Content.parity; return (P && Array.isArray(P.missions)) ? P.missions : []; }
  // the strangers strands (js/26_content_strangers.js): side missions with their own markers, never part of the story chain
  function strangerMissions() { var X = GTP.Content && GTP.Content.strangers; return (X && Array.isArray(X.missions)) ? X.missions : []; }
  function allMissions() {
    var Ct = GTP.Content, base = (Ct && Ct.missions) || [], ext = expansion().missions || [], par = parityMissions(), str = strangerMissions();
    var key = base.length + ':' + ext.length + ':' + par.length + ':' + str.length;
    if (_all && _allKey === key) return _all;
    var out = base.slice(), seen = {};
    for (var i = 0; i < out.length; i++) seen[out[i].id] = true;
    for (i = 0; i < ext.length; i++) if (ext[i] && ext[i].id && !seen[ext[i].id]) { out.push(ext[i]); seen[ext[i].id] = true; }
    for (i = 0; i < par.length; i++) if (par[i] && par[i].id && !seen[par[i].id] && Array.isArray(par[i].objectives)) { out.push(par[i]); seen[par[i].id] = true; }
    for (i = 0; i < str.length; i++) if (str[i] && str[i].id && !seen[str[i].id] && Array.isArray(str[i].objectives)) { out.push(str[i]); seen[str[i].id] = true; sideIds[str[i].id] = true; }
    _all = out; _allKey = key;
    return out;
  }
  function missionById(id) {
    if (registry[id]) return registry[id];
    var list = allMissions();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    var Ct = GTP.Content;
    if (Ct && typeof Ct.missionById === 'function') { var m = Ct.missionById(id); if (m) return m; }
    return null;
  }
  // GTP.Content.expansion.retune: {missionId: {path, value} | [{path, value}, ...]} patches applied once (GDD_EXPANSION §3.3 / §3.4)
  var retuned = false;
  function applyRetune() {
    var R = expansion().retune; if (!R || retuned) return;
    retuned = true;
    for (var id in R) {
      var m = missionById(id); if (!m) continue;
      var patches = Array.isArray(R[id]) ? R[id] : [R[id]];
      for (var i = 0; i < patches.length; i++) {
        var pt = patches[i]; if (!pt || !pt.path) continue;
        try {
          var keys = String(pt.path).split('.'), o = m;
          for (var k = 0; k < keys.length - 1; k++) { if (o[keys[k]] == null) o[keys[k]] = /^\d+$/.test(keys[k + 1]) ? [] : {}; o = o[keys[k]]; }
          o[keys[keys.length - 1]] = pt.value;
        } catch (e) { U.reportError(e, 'missions.retune ' + id + ' ' + pt.path); }
      }
    }
  }
  function isEnding(id) { var e = GTP.Content && GTP.Content.endingMissions; return !!e && e.indexOf(id) >= 0; }
  function liveTagged(tag) {
    var list = E().list;
    for (var i = 0; i < list.length; i++) { var v = list[i]; if (v.kind === 'vehicle' && v.tag === tag && !v.removed && !v.wreck && !v.sinking) return v; }
    return null;
  }

  // a mission target -> {x, z, y, name}: {landmark} (door point), {landmark, point: 'name'} (landmark.points), {landmark, offset: {x, z}}
  // (GDD units from the door, metres with opts.metres or t.metres), {tag} (a tagged vehicle's position), {x, z, y?} (world metres)
  function resolvePoint(t, opts) {
    var Wd = W();
    if (!t) return null;
    if (t.tag) { var tv = taggedVehicle(t.tag) || liveTagged(t.tag); return tv ? { x: tv.x, z: tv.z, y: tv.y, name: tv.type, tag: t.tag } : null; }
    if (t.landmark) {
      var lm = Wd.landmark(t.landmark);
      if (!lm) { U.reportError(new Error('unknown landmark ' + t.landmark), 'missions.target'); return null; }
      var d = lm.door || { x: lm.x, z: lm.z, y: lm.y || 0 };
      var x = d.x, z = d.z, y = d.y != null ? d.y : Wd.heightAt(d.x, d.z, 0);
      if (t.point) {
        var pp = lm.points && lm.points[t.point];
        if (pp) { x = pp.x; z = pp.z; y = pp.y != null ? pp.y : Wd.heightAt(x, z, 0); }
        else U.reportError(new Error('unknown point ' + t.point + ' on ' + t.landmark), 'missions.target');
      }
      if (t.offset) {
        var u = (opts && opts.metres) || t.metres ? 1 : K.unit;
        x += (t.offset.x || 0) * u; z += (t.offset.z || 0) * u;
        y = t.offset.y != null ? Wd.heightAt(x, z, t.offset.y) : Wd.heightAt(x, z, y);
      }
      return { x: x, z: z, y: y, name: lm.name || t.landmark, landmark: t.landmark, lm: lm, point: t.point || null };
    }
    if (t.x != null) {
      var zz = t.z != null ? t.z : (t.y || 0), hint = (t.z != null && t.y != null) ? t.y : 0;
      return { x: t.x, z: zz, y: Wd.heightAt(t.x, zz, hint), name: t.name || null };
    }
    return null;
  }

  function walkable(t) { var T = W().T; return t === T.SIDEWALK || t === T.PLAZA || t === T.GRASS || t === T.SAND || t === T.PARKING; }
  // a random walkable spot rMin..rMax metres from (cx, cz); keeps a gap from `others` [{x,z}] when given
  function randomSpot(cx, cz, rMin, rMax, opts) {
    opts = opts || {};
    var Wd = W(), T = Wd.T, TILE = C.TILE, rng = R();
    for (var tries = 0; tries < 30; tries++) {
      var a = rng.random() * TAU, r = rMin + (rMax - rMin) * Math.sqrt(rng.random());
      var x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      var tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
      if (!Wd.inBounds(tx, tz)) continue;
      var t = Wd.tiles[tz * Wd.w + tx];
      if (!walkable(t) && !(opts.roads && t === T.ROAD)) continue;
      if (Wd.solidAt(x, z, 0.5)) continue;
      var res = Wd.resolveCapsule(x, z, 0.5, 0.7); x = res.x; z = res.z;
      if (Wd.solidAt(x, z, 0.5)) continue;
      if (opts.others && opts.gap) { var ok = true; for (var k = 0; k < opts.others.length; k++) if (U.dist2d(x, z, opts.others[k].x, opts.others[k].z) < opts.gap) { ok = false; break; } if (!ok) continue; }
      if (opts.clear) {
        var near = E().hash.query(x, z, opts.clear, scratch), blocked = false;
        for (var j = 0; j < near.length; j++) { var e = near[j]; if (!e.removed && (e.kind === 'vehicle' || e.kind === 'ped' || e.kind === 'player')) { blocked = true; break; } }
        if (blocked) continue;
      }
      return { x: x, z: z, y: Wd.heightAt(x, z, 0) };
    }
    var sp = Wd.nearestSidewalkPoint(cx + rng.range(-rMax, rMax), cz + rng.range(-rMax, rMax)) || Wd.nearestSidewalkPoint(cx, cz);
    return sp ? { x: sp.x, z: sp.z, y: sp.y } : { x: cx, z: cz, y: Wd.heightAt(cx, cz, 0) };
  }
  // a free slot for a vehicle near (cx, cz): parking bays first (unless prefer === 'road'), then road tiles away from junctions.
  // length: the vehicle's length, so a nose-in bay keeps the overhang clear of the wall
  function vehicleSpot(cx, cz, rMax, prefer, others, length) {
    var Wd = W(), T = Wd.T, M = Wd.M, TILE = C.TILE, best = null, bestS = 1e9;
    var rr = Math.ceil(rMax / TILE), tx0 = Math.floor(cx / TILE), tz0 = Math.floor(cz / TILE);
    for (var dz = -rr; dz <= rr; dz++) for (var dx = -rr; dx <= rr; dx++) {
      var tx = tx0 + dx, tz = tz0 + dz;
      if (!Wd.inBounds(tx, tz)) continue;
      var i = tz * Wd.w + tx, t = Wd.tiles[i], kind = null;
      if (t === T.PARKING) kind = 'parking';
      else if (t === T.ROAD && !Wd.isIntersection(tx, tz) && !(Wd.meta[i] & M.CROSSWALK) && !(Wd.meta[i] & M.DEAD)) kind = 'road';
      if (!kind || (prefer === 'road' && kind !== 'road')) continue;
      var x = (tx + 0.5) * TILE, z = (tz + 0.5) * TILE, d = U.dist2d(x, z, cx, cz);
      if (d > rMax) continue;
      var s = d + (kind === 'road' && prefer !== 'road' ? 18 : 0);
      if (s >= bestS) continue;
      var bN = Wd.tile(tx, tz - 1) === T.BUILDING, bS = Wd.tile(tx, tz + 1) === T.BUILDING, bW = Wd.tile(tx - 1, tz) === T.BUILDING, bE = Wd.tile(tx + 1, tz) === T.BUILDING;
      if (kind === 'parking' && (bN || bS) && (bW || bE)) continue;
      if (others) { var tooNear = false; for (var o = 0; o < others.length; o++) if (U.dist2d(x, z, others[o].x, others[o].z) < 7) { tooNear = true; break; } if (tooNear) continue; }
      var near = E().hash.query(x, z, 5.5, scratch), blocked = false;
      for (var k = 0; k < near.length; k++) { var e = near[k]; if (!e.removed && (e.kind === 'vehicle' || e.kind === 'player') && Math.abs(e.y - Wd.heightAt(x, z, 0)) < 3) { blocked = true; break; } }
      if (blocked) continue;
      var yaw = 0, over = Math.max(0, (length || 4.5) / 2 - TILE / 2 + 0.35);
      if (kind === 'road') { var rd = Wd.roadDir(x, z, 0); if (rd) yaw = U.dirToYaw(rd.dx, rd.dz); }
      // a bay against a wall is backed into: the nose points away from the building, so a player who gets in can drive straight
      // out (nose-in, a new driver's first job in m01 was a reverse out of a tight lot)
      else if (bW || bE) { yaw = bW ? -Math.PI / 2 : Math.PI / 2; x += bW ? over : (bE ? -over : 0); }
      else { yaw = bN ? Math.PI : 0; z += bN ? over : (bS ? -over : 0); }
      best = { x: x, z: z, y: Wd.heightAt(x, z, 0), yaw: yaw, kind: kind, tx: tx, tz: tz }; bestS = s;
    }
    if (!best) { var rp = Wd.nearestRoadPoint(cx, cz); if (rp) best = { x: rp.x, z: rp.z, y: 0, yaw: U.dirToYaw(rp.dx, rp.dz), kind: 'road' }; }
    return best;
  }

  // ------------------------------------------------------- module state --
  var state = null;
  var run = null;        // the active mission run
  var dlg = { active: false, queue: [], current: null, t: 0, done: null, restore: null, uiDriven: false };
  var mg = { active: null, uiDriven: false };
  var avail = [];        // available-mission markers: {id, m, x, z, y, mesh, giver, kip, armed, holdT, landmark}
  var objMarkers = [];   // objective markers: {mesh, x, z, y, follow}
  var availKey = null;
  var availT = 0;
  var stepN = 0;
  var pathBudget = 0;

  function freshState() {
    return { active: null, mission: null, objective: 0, objectiveText: '', progress: null, timer: null, completed: new Set(), flags: {}, dialogue: [], failed: {}, minigame: null, phase: null, bestTimes: {}, holdBar: null, hint: null };
  }
  var lastFail = null;   // {m, snapshot, reason, text, replay, retries}: what RETRY / RESTART act on

  // ----------------------------------------------------- entity spawning --
  function track(e, role) { if (!run) return e; e.mission = run.id; e.missionRole = role || null; run.entities.push(e); return e; }
  function missionBrain(kind, extra) {
    // phase 0.5 keeps (stepN + phase) % pedTick from ever being 0: the AI never ticks this ped
    var b = { phase: 0.5, mode: 'mission', mission: kind, ambient: false, barkT: R().range(2, 6), shotT: 0, stuckT: 0, sideT: 0, side: 1, repathT: 0, path: null, pi: 0, pauseT: 0, stucks: 0 };
    if (extra) for (var k in extra) b[k] = extra[k];
    return b;
  }
  // a role that has no cast entry (protester, thug, cop, civ, courier, cutout) rolls a look from that role's pool
  function roleLook(role, x, z) {
    var CW = GTP.Content.world, dd = W().districtAt(x, z), L = GTP.Content.looks;
    var r = (L && L.roles && L.roles[role]) ? role : (role === 'cutout' || role === 'courier' ? 'thug' : 'npc');
    var look = CW.spawn.peds.rollLook(dd ? dd.id : 'downtown', r);
    if (role === 'cutout') { look.sign = 'WRONG'; look.flat = true; look.hat = 'none'; look.glasses = 'none'; look.extra = 'none'; look.shirt = '#d9c7a0'; look.pants = '#c9b78e'; }
    return look;
  }
  function spawnCastPed(castId, x, z, role, opts) {
    opts = opts || {};
    var Wd = W(), cast = castOf(castId), look = cast && cast.look ? Object.assign({}, cast.look) : null;
    if (!look) look = roleLook(castId || role || 'npc', x, z);
    if (opts.look) look = Object.assign(look, opts.look);
    var p = new GTP.Ped({ x: x, z: z, look: look, role: role || 'npc', persistent: opts.persistent !== false, weapon: opts.weapon || 'fist' });
    p.y = Wd.heightAt(x, z, 0); p.yaw = opts.yaw != null ? opts.yaw : R().random() * TAU; p.snap();
    p.castId = castId; p.name = cast ? cast.name : (opts.name || castId);
    if (opts.hp) { p.maxHp = opts.hp; p.hp = opts.hp; }
    p.ai = missionBrain(opts.brain || 'actor', opts.ai);
    E().add(p);
    return p;
  }
  // a goon: `role` is an AI role (thug, protester, cop, swat) or a cast id / 'cutout' / 'courier' (GDD_EXPANSION §7).
  // opts: {stationary (never moves, turns to face the player, a hostile ranged one shoots from where it stands),
  // hostile: false (never attacks; still no heat: cardboard), weapon}
  function spawnHostile(role, x, z, ctx, opts) {
    opts = opts || {};
    var sp = GTP.AI && GTP.AI.spawner, cast = castOf(role), L = GTP.Content.looks, isRole = !!(L && L.roles && L.roles[role]);
    var p;
    // an AI role (thug, protester, cop, swat) comes from the spawner's pool even when a cast entry shares the id; anything else is a cast look
    if (!isRole) {
      var weapon = opts.weapon || (role === 'courier' ? 'pistol' : 'fist');
      p = spawnCastPed(role, x, z, role === 'cutout' ? 'cutout' : 'thug', { brain: 'hostile', weapon: weapon, hp: role === 'cutout' ? 30 : (cast && cast.hp) || 0, name: role === 'cutout' ? 'Heckler' : null });
      if (role === 'cutout') p.cutout = true;
    } else if (sp && sp.spawnPed) p = sp.spawnPed(x, z, role, { persistent: true });
    else { p = new GTP.Ped({ x: x, z: z, role: role, persistent: true }); p.y = W().heightAt(x, z, 0); p.snap(); E().add(p); }
    if (opts.weapon && p.weapons) { p.weapons[opts.weapon] = Infinity; p.weapon = opts.weapon; }
    p.hostile = true; p.aimTarget = player();
    p.ai = missionBrain('hostile', { role: isRole ? role : (role === 'cutout' ? 'cutout' : 'thug'), ctx: ctx, stationary: !!opts.stationary, passive: opts.hostile === false, fireRange: opts.fireRange || 0 });
    if (opts.stationary) { p.ai.homeX = p.x; p.ai.homeZ = p.z; }
    track(p, 'hostile');
    return p;
  }
  function makeVehicle(spot, type, opts) {
    opts = opts || {};
    var v = new GTP.Vehicle({ x: spot.x, z: spot.z, type: type || 'sedan', color: opts.color, wrap: opts.wrap, tag: opts.tag || null, persistent: true });
    v.y = spot.y != null ? spot.y : W().heightAt(spot.x, spot.z, 0); v.yaw = spot.yaw || 0; v.snap();
    E().add(v);
    track(v, 'vehicle');
    return v;
  }
  function driveVehicle(v, kind) {
    var sp = GTP.AI && GTP.AI.spawner, role = kind === 'hoa' ? 'hoa' : kind === 'cop' ? 'cop' : 'civ';
    if (!sp || !GTP.AI.drive) return;
    var d = sp.spawnPed(v.x, v.z, role, {});
    d.ai.ambient = false; d.ai.driver = true;
    v.enter(d, 0);
    track(d, 'driver');
    GTP.AI.drive(v, kind === 'hoa' ? 'hoa' : kind === 'cop' ? 'cop' : 'traffic');
    if (kind === 'hoa') { v.ai.hoa = true; if (!v.tag) v.tag = 'hoa'; }
  }
  // byCar: the pickups are collected from a vehicle (m01_van's subscribers): each goes on the road nearest a random spot, where
  // the GPS line and the van can reach it (a spot on a campus lawn behind hedges and benches cost a driver the whole timer)
  function roadSpot(cx, cz, rMin, rMax, others, gap) {
    var Wd = W(); if (!Wd.nearestRoadPoint) return null;
    for (var tries = 0; tries < 16; tries++) {
      var s = randomSpot(cx, cz, rMin, rMax, { roads: true }), rp = Wd.nearestRoadPoint(s.x, s.z);
      if (!rp || U.dist2d(rp.x, rp.z, cx, cz) > rMax + 16) continue;
      var ok = true; for (var k = 0; k < others.length; k++) if (U.dist2d(rp.x, rp.z, others[k].x, others[k].z) < gap) { ok = false; break; }
      if (ok) return { x: rp.x, z: rp.z, y: Wd.heightAt(rp.x, rp.z, 0) };
    }
    return null;
  }
  function spawnPickups(center, radius, count, labels, ctx, byCar) {
    var out = [], CB = GTP.Combat;
    for (var i = 0; i < count; i++) {
      var s = (byCar && roadSpot(center.x, center.z, Math.min(4, radius * 0.3), radius, out, Math.max(8, Math.min(16, radius / 2)))) ||
        randomSpot(center.x, center.z, Math.min(4, radius * 0.3), radius, { others: out, gap: Math.min(8, radius / 2), clear: 1.2 });
      var label = Array.isArray(labels) ? labels[i % labels.length] : (labels || 'MERCH');
      var pk;
      if (CB && CB.spawnPickup) pk = CB.spawnPickup({ type: 'mission', x: s.x, z: s.z, persistent: true, label: label, tag: 'mission' });
      else { pk = new GTP.Pickup({ x: s.x, z: s.z, pickupType: 'mission', persistent: true, tag: 'mission' }); pk.y = s.y; pk.label = label; pk.snap(); E().add(pk); }
      pk.missionCtx = ctx; pk.objLabel = label;
      track(pk, 'pickup');
      out.push(pk);
    }
    return out;
  }
  function removeEntity(e) {
    if (!e || e.removed) return;
    if (e.kind === 'vehicle') { var occ = e.occupants(); for (var i = 0; i < occ.length; i++) { if (occ[i].kind === 'player') e.exit(occ[i]); else occ[i].removed = true; } }
    else if (e.kind === 'ped' && e.inVehicle) e.inVehicle.exit(e);
    if (e.destroy) e.destroy();
    E().remove(e);
  }
  // hand a mission ped back to the city: the AI gives it a wander brain on sight; goons run off.
  // A goon keeps its `hostile` flag: the one who just swung at the player and gave up is still the goon,
  // so finishing him off (or the last punch landing as he turns) is never a crime that brings the police
  function releasePed(p, flee) {
    if (!p || p.removed) return;
    p.persistent = false; p.aimTarget = null; p.aiming = false; p.ai = null; p.mission = null;
    if (flee && p.alive) { var pl = player(); p.fleeFrom = pl ? { x: pl.x, z: pl.z } : { x: p.x + 1, z: p.z }; p.fleeTimer = 8; }
  }
  // keepPlayerVehicle: the car the player sits in stays (untagged, released to the player)
  function cleanupEntities(list, releaseSurvivors) {
    var pl = player();
    for (var i = list.length - 1; i >= 0; i--) {
      var e = list[i];
      if (!e || e.removed) continue;
      if (e.keep) { e.mission = null; continue; }   // a strand-owned vehicle (the sponsor van, the pod van as home) outlives the mission
      if (e.kind === 'vehicle') {
        if (e._chauf && GTP.Strands && GTP.Strands.drivers) GTP.Strands.drivers.release(e);
        if (pl && pl.inVehicle === e) { e.persistent = false; e.mission = null; if (e.ai && GTP.AI.release) GTP.AI.release(e); continue; }
        if (releaseSurvivors && !e.wreck && !e.sinking) { e.persistent = false; e.mission = null; continue; }   // a parked mission car can stay until the player leaves
        removeEntity(e);
      } else if (e.kind === 'ped') {
        if (releaseSurvivors && e.alive) releasePed(e, e.hostile && !e.inVehicle);
        else removeEntity(e);
      } else removeEntity(e);
    }
    list.length = 0;
  }

  // ---------------------------------------------------------- markers --
  function markerMesh(color) {
    var Rd = GTP.Render;
    if (!Rd || !Rd.markerMesh) return null;
    try { var m = Rd.markerMesh(color); Rd.addMarker(m); return m; } catch (e) { U.reportError(e, 'missions.marker'); return null; }
  }
  function dropMesh(m) { if (!m) return; var Rd = GTP.Render; if (Rd && Rd.removeMarker) { try { Rd.removeMarker(m); } catch (e) { /* optional */ } } }
  function addObjMarker(pt, follow) {
    var mk = { mesh: markerMesh(K.colors.objective), x: pt.x, z: pt.z, y: pt.y || 0, follow: follow || null };
    if (mk.mesh) mk.mesh.position.set(mk.x, mk.y, mk.z);
    objMarkers.push(mk);
    return mk;
  }
  function clearObjMarkers() { for (var i = 0; i < objMarkers.length; i++) dropMesh(objMarkers[i].mesh); objMarkers.length = 0; }
  function dropObjMarker(mk) { var i = objMarkers.indexOf(mk); if (i >= 0) objMarkers.splice(i, 1); dropMesh(mk.mesh); }

  function available() {
    var all = allMissions(), out = [];
    for (var i = 0; i < all.length; i++) {
      var mm = all[i];
      if (state.completed.has(mm.id) && !isEnding(mm.id)) continue;
      var req = mm.requires || [], ok = true;
      for (var k = 0; k < req.length; k++) if (!state.completed.has(req[k])) { ok = false; break; }
      if (ok) out.push(mm);
    }
    return out;
  }
  function refreshAvailable(force) {
    if (force) _nextKey = null;
    var list = run ? [] : available(), key = list.map(function (mm) { return mm.id; }).join(',');
    if (!force && key === availKey) return;
    availKey = key;
    var keep = {};
    for (var i = 0; i < list.length; i++) keep[list[i].id] = list[i];
    for (i = avail.length - 1; i >= 0; i--) if (!keep[avail[i].id]) { dropAvail(avail[i]); avail.splice(i, 1); }
    var have = {};
    for (i = 0; i < avail.length; i++) have[avail[i].id] = true;
    for (i = 0; i < list.length; i++) {
      var mm = list[i]; if (have[mm.id]) continue;
      var pt = resolvePoint({ landmark: mm.marker });
      if (!pt) continue;
      pt = lightSpot(pt, mm.marker);
      var mk = { id: mm.id, m: mm, x: pt.x, z: pt.z, y: pt.y, landmark: mm.marker, mesh: markerMesh(K.colors.mission), giver: null, kip: null, armed: false, holdT: 0 };
      if (mk.mesh) { mk.mesh.position.set(mk.x, mk.y, mk.z); addBeacon(mk.mesh, K.colors.mission); }
      var pl = player();
      mk.armed = !pl || U.dist2d(pl.x, pl.z, mk.x, mk.z) > K.markerRadius + 0.6;
      avail.push(mk);
    }
  }
  // where a mission light goes at a landmark's door point: clear of solid props (a street lamp on the kerb in front of Both Sides
  // Arms stopped a player 1.95 m from the 1.9 m light) and of the shops' door rings, off the road, 3 m or more out from the facade (a shop's walk-in door
  // stays its own trigger; never nearer than the door point already is) and not on another light. The door point first, then toward the building, then along the sidewalk
  function lightSpot(pt, landmarkId) {
    var Wd = W(), T = Wd.T, lm = Wd.landmark ? Wd.landmark(landmarkId) : null, b = lm && lm.building, props = Wd.props || [], doors = Wd.doors || [];
    var ix = 0, iz = 0;   // toward the building
    if (b) { var cx = U.clamp(pt.x, b.x, b.x + b.w), cz = U.clamp(pt.z, b.z, b.z + b.d), dl = U.dist2d(pt.x, pt.z, cx, cz); if (dl > 0.01) { ix = (cx - pt.x) / dl; iz = (cz - pt.z) / dl; } }
    else if (lm) { var ll = U.dist2d(pt.x, pt.z, lm.x, lm.z); if (ll > 0.01) { ix = (lm.x - pt.x) / ll; iz = (lm.z - pt.z) / ll; } }
    function face(x, z) { return b ? U.dist2d(x, z, U.clamp(x, b.x, b.x + b.w), U.clamp(z, b.z, b.z + b.d)) : 1e9; }
    var minFace = Math.min(3, face(pt.x, pt.z) - 0.01);   // never nearer the facade than the door point itself already is
    var sx = -iz, sz = ix, clear = K.markerRadius + 0.45, offs = [[0, 0], [1, 0], [1.5, 0], [2, 0], [2.5, 0], [0, 1.5], [0, -1.5], [1.5, 1.5], [1.5, -1.5], [0, 3], [0, -3], [1.5, 3], [1.5, -3], [0, 4.5], [0, -4.5], [1.5, 4.5], [1.5, -4.5], [0, 6], [0, -6], [-1, 0], [-1.5, 0], [-1, 1.5], [-1, -1.5]];
    function ok(x, z) {
      var t = Wd.tileAt ? Wd.tileAt(x, z) : null;
      if (t === T.BUILDING || t === T.ROAD || t === T.WATER || t === T.VOID || t === T.HIGHWAY) return false;
      if (Wd.solidAt(x, z, 0.5)) return false;
      if (face(x, z) < minFace) return false;
      for (var j = 0; j < avail.length; j++) if (U.dist2d(avail[j].x, avail[j].z, x, z) < 3) return false;
      // a shop or safehouse door ring (World.doors, run by GTP.AI): stepping into it walks into the interior, so the light keeps
      // clear of it (the m01c light on the armory's own ring took the player inside before the mission could start)
      for (var q = 0; q < doors.length; q++) if (U.dist2d(doors[q].x, doors[q].z, x, z) < (doors[q].r || 1.4) + K.markerRadius + 0.6) return false;
      for (var k = 0; k < props.length; k++) { var pr = props[k]; if (pr.solid && Math.abs(pr.x - x) < 4 && Math.abs(pr.z - z) < 4 && U.dist2d(pr.x, pr.z, x, z) - (pr.r || 0.3) < clear) return false; }
      return true;
    }
    for (var i = 0; i < offs.length; i++) {
      var x = pt.x + ix * offs[i][0] + sx * offs[i][1], z = pt.z + iz * offs[i][0] + sz * offs[i][1];
      if (ok(x, z)) return { x: x, z: z, y: Wd.heightAt(x, z, pt.y || 0) };
    }
    // nowhere clear: the door point, nudged off another light along the sidewalk as before
    for (var j2 = 0; j2 < avail.length; j2++) if (U.dist2d(avail[j2].x, avail[j2].z, pt.x, pt.z) < 3) { pt.x += 4; }
    return pt;
  }
  function dropAvail(mk) {
    dropMesh(mk.mesh); mk.mesh = null;
    if (mk.giver) { releasePed(mk.giver, false); removeEntity(mk.giver); mk.giver = null; }
    if (mk.kip) { removeEntity(mk.kip); mk.kip = null; }
  }
  // the giver (and Kip, who is at every mission location) stand beside the light
  function giverSpots(mk) {
    var Wd = W(), lm = Wd.landmark(mk.landmark);
    var ox = lm ? lm.x - mk.x : 0, oz = lm ? lm.z - mk.z : -1, ol = Math.sqrt(ox * ox + oz * oz) || 1; ox /= ol; oz /= ol;   // toward the building
    var sx = -oz, sz = ox;   // along the sidewalk
    var cands = [
      { x: mk.x + sx * 2.3 + ox * 0.6, z: mk.z + sz * 2.3 + oz * 0.6 }, { x: mk.x - sx * 2.3 + ox * 0.6, z: mk.z - sz * 2.3 + oz * 0.6 },
      { x: mk.x + sx * 4.2, z: mk.z + sz * 4.2 }, { x: mk.x - sx * 4.2, z: mk.z - sz * 4.2 }, { x: mk.x - ox * 2.4, z: mk.z - oz * 2.4 }
    ], out = [];
    for (var i = 0; i < cands.length && out.length < 2; i++) {
      var c = cands[i], t = Wd.tileAt(c.x, c.z), T = Wd.T;
      if (t === T.BUILDING || t === T.WATER || t === T.VOID || t === T.ROAD || Wd.solidAt(c.x, c.z, 0.5)) continue;
      var r = Wd.resolveCapsule(c.x, c.z, 0.5, 0.45);
      out.push({ x: r.x, z: r.z });
    }
    while (out.length < 2) out.push({ x: mk.x + sx * 2 * (out.length ? -1 : 1), z: mk.z + sz * 2 * (out.length ? -1 : 1) });
    return out;
  }
  function placeGiver(mk) {
    var spots = giverSpots(mk), giverId = mk.m.giver || 'sloane';
    mk.giver = spawnCastPed(giverId, spots[0].x, spots[0].z, 'npc', { brain: 'giver', yaw: U.dirToYaw(mk.x - spots[0].x, mk.z - spots[0].z) });
    mk.giver.ai.marker = mk; mk.giver.ai.homeYaw = mk.giver.yaw; mk.giver.tag = 'giver';
  }
  // Kip is at every mission location (GDD 9); he appears once the player is close enough to notice
  function placeKip(mk) {
    if ((mk.m.giver || 'sloane') === 'kip' || !castOf('kip')) return;
    var spots = giverSpots(mk);
    mk.kip = spawnCastPed('kip', spots[1].x, spots[1].z, 'npc', { brain: 'giver', yaw: U.dirToYaw(mk.x - spots[1].x, mk.z - spots[1].z) });
    mk.kip.ai.marker = mk; mk.kip.ai.kip = true; mk.kip.ai.homeYaw = mk.kip.yaw; mk.kip.tag = 'kip';
  }
  var lastPos = { x: 0, z: 0, set: false };
  function updateAvailable(dt) {
    var pl = player(), g = game(); if (!pl) return;
    var canStart = !run && g && g.state === 'playing' && pl.alive && !pl.inVehicle && !pl.knockedDown && !pl.swimming;
    // a jump no vehicle could make in one step is a teleport / respawn: landing inside a light does not count as walking in
    var jumped = lastPos.set && U.dist2d(pl.x, pl.z, lastPos.x, lastPos.z) > 5;
    lastPos.x = pl.x; lastPos.z = pl.z; lastPos.set = true;
    for (var i = 0; i < avail.length; i++) {
      var mk = avail[i], d = U.dist2d(pl.x, pl.z, mk.x, mk.z);
      // the cast at the door
      if (mk.giver && mk.giver.removed) mk.giver = null;
      if (mk.kip && mk.kip.removed) mk.kip = null;
      if (d < K.giverRange && !mk.giver) placeGiver(mk);
      else if (d > K.giverRange + 60 && mk.giver) { removeEntity(mk.giver); mk.giver = null; }
      if (d < K.kipRange && mk.giver && !mk.kip) placeKip(mk);
      else if (d > K.kipRange + 30 && mk.kip) { removeEntity(mk.kip); mk.kip = null; }
      // the trigger arms once the player has been outside the light (a new game spawns inside the first one)
      var inside = d <= K.markerRadius && Math.abs(pl.y - mk.y) < 2.5;
      if (!inside) { mk.holdT = 0; if (d > K.markerRadius + 0.6) mk.armed = true; continue; }
      if (jumped) { mk.armed = false; mk.holdT = 0; continue; }
      if (!canStart || !mk.armed) { mk.holdT = 0; continue; }
      mk.holdT += dt;
      if (mk.holdT >= K.startHold) { Missions.start(mk.id); return; }
    }
  }
  function animateMarkers(dt) {
    var t = simT(), i, mk, ud, inCut = !!(GTP.Cutscenes && GTP.Cutscenes.active);
    var pl = player(), nxt = state ? storyNextMission() : null;
    for (i = 0; i < avail.length; i++) {
      mk = avail[i]; if (!mk.mesh) continue;
      mk.mesh.visible = !inCut;   // the blue lights go dark while a cutscene plays
      ud = mk.mesh.userData; mk.mesh.rotation.y = t * 0.35;
      if (ud && ud.pulse) ud.pulse(0.5 + 0.5 * Math.sin(t * 2.2 + i));
      // the beam fades out up close (no blinding the intro) and burns brightest over the next story mission
      if (ud && ud.beacon && pl) {
        var bd = U.dist2d(pl.x, pl.z, mk.x, mk.z), story = nxt && nxt.id === mk.id;
        ud.beacon.material.opacity = U.clamp((bd - 12) / 60, 0.04, 1) * (story ? 0.55 : 0.25) * (0.85 + 0.15 * Math.sin(t * 1.7 + i));
        var wk = U.clamp(bd / 45, 1, 8); ud.beacon.scale.set(wk, 1, wk);   // about the same width on screen from any distance
      }
    }
    for (i = 0; i < objMarkers.length; i++) {
      mk = objMarkers[i];
      if (mk.follow) { var f = mk.follow; if (!f.removed) { mk.x = f.x; mk.z = f.z; mk.y = f.y; } }
      if (!mk.mesh) continue;
      mk.mesh.position.set(mk.x, mk.y, mk.z); mk.mesh.rotation.y = -t * 0.5;
      ud = mk.mesh.userData; if (ud && ud.pulse) ud.pulse(0.5 + 0.5 * Math.sin(t * 3.1));
    }
    void dt;
  }

  // --------------------------------------------------------- dialogue --
  function enrich(line) {
    var cast = castOf(line.who);
    return { who: line.who, text: line.text, name: cast ? cast.name : (line.who === 'player' ? 'Bryce Takesworth' : String(line.who || '')), color: cast ? cast.color : '#ffffff', ticker: !!line.ticker, voice: cast ? cast.voice : null };
  }
  function enterCutscene() {
    var g = game(), pl = player(); if (!g) return;
    if (g.state === 'playing') { dlg.restore = 'playing'; g.setState('cutscene'); }
    if (pl) { pl.stop(); pl.aiming = false; if (pl.inVehicle) pl.inVehicle.setControls(0, 0, false, 1); }
  }
  function showDialogue(lines, done) {
    dlg.queue = (lines || []).slice(); dlg.done = done || null; dlg.current = null; dlg.t = 0; dlg.uiDriven = false;
    if (!dlg.queue.length) { if (done) done(); return; }
    dlg.active = true;
    enterCutscene();
    nextLine();
  }
  function nextLine() {
    while (dlg.queue.length) {
      var raw = dlg.queue.shift(), line = enrich(raw);
      if (line.ticker) { if (!callUI('ticker', line.text)) toast(line.name + ': ' + line.text); emit('ticker', { line: line }); continue; }
      dlg.current = line; dlg.t = 0; dlg.uiDriven = false;
      syncDialogueState();
      emit('dialogue', { line: line, remaining: dlg.queue.length });
      var show = ui('showDialogue');
      if (show) { dlg.uiDriven = true; try { show.call(GTP.UI, line, Missions.advanceDialogue); } catch (e) { U.reportError(e, 'ui.showDialogue'); dlg.uiDriven = false; } }
      return;
    }
    endDialogue();
  }
  function syncDialogueState() {
    state.dialogue.length = 0;
    if (dlg.current) state.dialogue.push(dlg.current);
    for (var i = 0; i < dlg.queue.length; i++) state.dialogue.push(enrich(dlg.queue[i]));
  }
  function endDialogue() {
    if (!dlg.active) return;
    dlg.active = false; dlg.current = null; dlg.queue.length = 0; state.dialogue.length = 0;
    var g = game();
    if (dlg.restore && g && g.state === 'cutscene') g.setState(dlg.restore);
    dlg.restore = null;
    var d = dlg.done; dlg.done = null;
    if (d) d();
  }
  function cancelDialogue() {
    if (!dlg.active) return;
    if (dlg.uiDriven) callUI('hideDialogue');
    dlg.done = null;
    endDialogue();
  }
  function updateDialogue(dt) {
    if (!dlg.active || !dlg.current || dlg.uiDriven) return;
    dlg.t += dt;
    var In = GTP.Input, skip = In && (In.pressed('confirm') || In.pressed('action'));
    if (dlg.t >= K.lineSeconds || (skip && dlg.t > 0.15)) Missions.advanceDialogue();
  }

  // --------------------------------------------------------- minigames --
  function startMinigame(gameId, params, cb) {
    var g = game(), pl = player();
    mg.active = { game: gameId, params: params || {}, cb: cb, t: 0 }; mg.uiDriven = false;
    state.minigame = { game: gameId, params: mg.active.params };
    if (pl) { pl.stop(); pl.aiming = false; if (pl.inVehicle) pl.inVehicle.setControls(0, 0, false, 1); }
    if (g && g.state !== 'minigame') g.setState('minigame');
    emit('minigame', { game: gameId, params: mg.active.params });
    var st = ui('startMinigame');
    if (st) { mg.uiDriven = true; try { st.call(GTP.UI, gameId, mg.active.params, function (win) { Missions._resolveMinigame(win); }); } catch (e) { U.reportError(e, 'ui.startMinigame'); mg.uiDriven = false; } }
  }
  function cancelMinigame() {
    if (!mg.active) return;
    mg.active = null; state.minigame = null;
    callUI('endMinigame');
    var g = game(); if (g && g.state === 'minigame') g.setState('playing');
  }

  // ----------------------------------------------------------- brains --
  function hostileTick(p, ai, dt) {
    var pl = player(), g = game(), CB = GTP.Combat;
    if (!pl || !pl.alive || !g || g.state !== 'playing') { p.stop(); p.aiming = false; return; }
    if (!p.alive || p.knockedDown || p.inVehicle || p.entering) return;
    p.aimTarget = pl;
    var d = U.dist2d(p.x, p.z, pl.x, pl.z), wdef = CB && CB.WEAPONS ? CB.WEAPONS[p.weapon] : null;
    var ranged = ai.role === 'cop' || ai.role === 'swat' || !!(wdef && !wdef.melee);
    // a stationary ped turns to face the player; a hostile ranged one shoots from where it stands when the player is in range (GDD_EXPANSION §7)
    if (ai.stationary) {
      p.stop();
      if (d < 60) p.yaw = U.angleDamp(p.yaw, U.dirToYaw(pl.x - p.x, pl.z - p.z), 4, dt);
      if (ai.passive || !ranged || !wdef) { p.aiming = false; return; }
      // a stationary shooter opens up from far beyond the gun's range (QA-CMB-10). Out there it misses ('badly'): a tracer and a
      // report that land short and wide, no real round, so a sniper duel does not summon the city's police to the causeway
      var real = wdef.range || 30, rng = Math.max(real, ai.fireRange || K.stationaryFireRange);
      if (d <= rng && !pl.inVehicle) {
        p.aiming = true; p.aimYaw = U.dirToYaw(pl.x - p.x, pl.z - p.z);
        ai.shotT -= dt;
        if (ai.shotT <= 0 && CB && CB.fire) {
          if (d <= real) { ai.shotT = R().range(1.4, 2.6); try { CB.fire(p, p.weapon); } catch (e) { U.reportError(e, 'missions.fire'); } }
          else {
            ai.shotT = R().range(2.2, 3.6);
            var k = R().range(0.55, 0.85), side = R().range(-4, 4), f = U.yawToDir(p.aimYaw);
            fx({ type: 'tracer', x: p.x + f.x * 0.6, y: p.y + 1.4, z: p.z + f.z * 0.6, x2: p.x + (pl.x - p.x) * k - f.z * side, y2: pl.y + R().range(0.2, 2.5), z2: p.z + (pl.z - p.z) * k + f.x * side, life: 0.08 });
            sfx('shot', p.x, p.z, 0.35);
            emit('potshot', { ped: p, dist: d });
          }
        }
      } else p.aiming = false;
      return;
    }
    if (ai.passive) { p.stop(); p.aiming = false; if (d < 30) p.yaw = U.angleDamp(p.yaw, U.dirToYaw(pl.x - p.x, pl.z - p.z), 4, dt); return; }
    var reach = ranged ? 12 : (pl.inVehicle ? 3.4 : 1.9);
    ai.barkT -= dt;
    if (ai.barkT <= 0) {
      ai.barkT = R().range(6, 12);
      var Rd = GTP.Content && GTP.Content.radio, pool = Rd && Rd.barks && Rd.barks[ai.role];
      if (pool && pool.length && d < 40 && GTP.AI && GTP.AI.say) GTP.AI.say(p, R().pick(pool), ai.role === 'cop' ? '#8fb6ff' : ai.role === 'protester' ? '#ff7a00' : '#ff7a7a');
    }
    if (d > reach) {
      p.aiming = false;
      ai.repathT -= dt;
      if (d > 24) {
        if ((!ai.path || ai.repathT <= 0) && pathBudget > 0) { pathBudget--; ai.path = W().findPath(p.x, p.z, pl.x, pl.z, { mode: 'ped', fromY: p.y, toY: pl.y, maxExpansions: 3000 }); ai.pi = 0; ai.repathT = 3; }
      } else ai.path = null;
      if (ai.path && ai.path.length) {
        while (ai.pi < ai.path.length - 1 && U.dist2d(p.x, p.z, ai.path[ai.pi].x, ai.path[ai.pi].z) < 1.5) ai.pi++;
        var wp = ai.path[ai.pi]; p.moveTo(wp.x, wp.z, true);
        if (ai.pi >= ai.path.length - 1 && U.dist2d(p.x, p.z, wp.x, wp.z) < 2) ai.path = null;
      } else p.moveTo(pl.x, pl.z, true);
      if (ai.sideT > 0) { ai.sideT -= dt; var f = U.yawToDir(p.yaw); p.intent.x = -f.z * ai.side; p.intent.z = f.x * ai.side; p.intent.run = true; }
      if (p.speed < 0.3) { ai.stuckT += dt; if (ai.stuckT > 0.9) { ai.stuckT = 0; ai.side = -ai.side; ai.sideT = 0.5; ai.path = null; } } else ai.stuckT = 0;
      if (ranged && d < 22 && ai.role !== 'swat') { ai.shotT -= dt; if (ai.shotT <= 0 && CB && CB.fire && !pl.inVehicle) { ai.shotT = 1.6; p.aiming = true; p.aimYaw = U.dirToYaw(pl.x - p.x, pl.z - p.z); try { CB.fire(p, p.weapon); } catch (e) { U.reportError(e, 'missions.fire'); } } }
      return;
    }
    p.stop();
    p.aimYaw = U.dirToYaw(pl.x - p.x, pl.z - p.z);
    if (ranged) {
      p.aiming = true;
      if (d < 5) { var back = U.yawToDir(p.aimYaw); p.intent.x = -back.x * 0.6; p.intent.z = -back.z * 0.6; p.intent.run = false; }
      ai.shotT -= dt;
      if (ai.shotT <= 0 && CB && CB.fire) { ai.shotT = 1.2; try { CB.fire(p, p.weapon); } catch (e) { U.reportError(e, 'missions.fire'); } }
    } else {
      p.yaw = p.aimYaw;
      meleeTick(p, ai, pl, dt);
    }
  }
  // a goon's punch: a cooldown between swings, a short wind-up (the arm draws back) before it lands, and at most
  // K.meleeAttackers goons swinging at once; the others hold at arm's length until a slot frees (QA-C1-01)
  function meleeAttackers(pl, self) {
    var n = 0, list = E().hash.query(pl.x, pl.z, 3, scratch);
    for (var i = 0; i < list.length; i++) { var o = list[i]; if (o !== self && o.kind === 'ped' && o.alive && o.ai && o.ai.swinging) n++; }
    return n;
  }
  function meleeTick(p, ai, pl, dt) {
    var CB = GTP.Combat;
    if (pl.inVehicle || !CB || !CB.fire) { ai.swinging = false; return; }
    if (ai.swingT == null) ai.swingT = R().range(0.4, K.meleeSwing[1]);
    ai.swingT -= dt;
    if (ai.windT > 0) {
      ai.windT -= dt;
      if (ai.windT <= 0) { ai.swinging = false; try { CB.fire(p, 'fist'); } catch (e) { U.reportError(e, 'missions.fire'); } ai.swingT = R().range(K.meleeSwing[0], K.meleeSwing[1]); }
      return;
    }
    if (ai.swingT > 0) return;
    if (meleeAttackers(pl, p) >= K.meleeAttackers) { ai.swingT = R().range(0.3, 0.7); return; }
    ai.swinging = true; ai.windT = K.meleeWindup;
  }
  function followerTick(p, ai, dt) {
    var c = ai.ctx, pl = player();
    if (!c || !p.alive || p.knockedDown || p.inVehicle) { p.stop(); return; }
    if (c.arrived) { p.stop(); if (pl) p.yaw = U.angleDamp(p.yaw, U.dirToYaw(pl.x - p.x, pl.z - p.z), 4, dt); return; }
    if (ai.pauseT > 0) { ai.pauseT -= dt; p.stop(); if (ai.glance && pl) p.yaw = U.angleDamp(p.yaw, U.dirToYaw(pl.x - p.x, pl.z - p.z), 6, dt); return; }
    var wp = c.wps[c.wi]; if (!wp) { c.arrived = true; return; }
    if (!ai.route) {
      // a long walk on the 224-tile map can outgrow the first budget: one bigger search before the straight-line fallback
      ai.route = W().findPath(p.x, p.z, wp.x, wp.z, { mode: 'ped', fromY: p.y, toY: wp.y, maxExpansions: 12000 }) ||
        W().findPath(p.x, p.z, wp.x, wp.z, { mode: 'ped', fromY: p.y, toY: wp.y, maxExpansions: 60000 }) || [{ x: wp.x, z: wp.z, y: wp.y }];
      ai.ri = 0;
    }
    while (ai.ri < ai.route.length - 1 && U.dist2d(p.x, p.z, ai.route[ai.ri].x, ai.route[ai.ri].z) < 1.3) { ai.ri++; ai.bestD = null; }
    var pt = ai.route[ai.ri], d = p.moveTo(pt.x, pt.z, true);
    p.intent.x *= K.followPace; p.intent.z *= K.followPace;
    // a sidestep around whatever is in the way (a car stopped on the crosswalk, a crowd)
    if (ai.sideT > 0) { ai.sideT -= dt; var sf = U.yawToDir(p.yaw); p.intent.x = -sf.z * ai.side * 0.7; p.intent.z = sf.x * ai.side * 0.7; p.intent.run = true; }
    var last = ai.ri >= ai.route.length - 1;
    if (last && d < 1.6) {
      c.wi++; ai.route = null; p.stop(); ai.bestD = null;
      if (c.wi >= c.wps.length) { c.arrived = true; return; }
      ai.pauseT = R().range(1.2, 2.2); ai.glance = R().chance(0.6);
      return;
    }
    // stuck = no progress toward the route point (pushing on a car counts: the legs move, the ped does not)
    if (ai.bestD == null || d < ai.bestD - 0.4) { ai.bestD = d; ai.progT = 0; } else ai.progT = (ai.progT || 0) + dt;
    if (p.speed < 0.25) ai.stuckT += dt; else ai.stuckT = 0;
    if (ai.stuckT > 1.4 || ai.progT > 2.5) {
      ai.stuckT = 0; ai.progT = 0; ai.bestD = null; ai.stucks++;
      ai.side = ai.stucks % 2 ? 1 : -1; ai.sideT = 0.9;
      if (ai.stucks % 2 === 0) ai.route = null;
      // a lamp post is not a plot point: every third time a short hop (3 m at most) toward the route point, never a jump
      // across the map (the straight-line fallback's point can be a whole district away; the tail would lose the target)
      if (ai.stucks % 3 === 0) {
        var hx = pt.x - p.x, hz = pt.z - p.z, hl = Math.sqrt(hx * hx + hz * hz) || 1, hs = Math.min(hl, 3);
        var r = W().resolveCapsule(p.x + hx / hl * hs, p.z + hz / hl * hs, p.y, p.radius); p.x = r.x; p.z = r.z; p.snap();
      }
    }
  }
  function giverTick(p, ai, dt) {
    var pl = player();
    p.stop();
    if (ai.kip) { ai.barkT -= dt; if (ai.barkT <= 0 && pl && U.dist2d(p.x, p.z, pl.x, pl.z) < 14) { ai.barkT = R().range(16, 28); if (GTP.AI && GTP.AI.say) GTP.AI.say(p, 'Is this paid?', '#f0ad4e'); } }
    if (pl && U.dist2d(p.x, p.z, pl.x, pl.z) < 9) p.yaw = U.angleDamp(p.yaw, U.dirToYaw(pl.x - p.x, pl.z - p.z), 5, dt);
    else if (ai.homeYaw != null) p.yaw = U.angleDamp(p.yaw, ai.homeYaw, 2, dt);
  }
  // a fare / passenger waits on the kerb (hailing), walks to the door when asked, and rides; nothing else
  function passengerTick(p, ai, dt) {
    var pl = player();
    if (p.inVehicle || p.entering) return;
    p.stop();
    var v = pl && pl.inVehicle;
    if (v && U.dist2d(p.x, p.z, v.x, v.z) < 40) p.yaw = U.angleDamp(p.yaw, U.dirToYaw(v.x - p.x, v.z - p.z), 4, dt);
    else if (pl && U.dist2d(p.x, p.z, pl.x, pl.z) < 20) p.yaw = U.angleDamp(p.yaw, U.dirToYaw(pl.x - p.x, pl.z - p.z), 4, dt);
  }
  function tickBrains(dt) {
    var list = E().list;
    for (var i = 0; i < list.length; i++) {
      var p = list[i], ai = p.ai;
      if (!ai || !ai.mission || p.removed || p.kind !== 'ped') continue;
      try {
        if (ai.mission === 'hostile') hostileTick(p, ai, dt);
        else if (ai.mission === 'follower') followerTick(p, ai, dt);
        else if (ai.mission === 'giver' || ai.mission === 'actor') giverTick(p, ai, dt);
        else if (ai.mission === 'passenger') passengerTick(p, ai, dt);
        // 'driver' (a chauffeured car's ped) and 'cutscene' actors are driven elsewhere
        if (GTP.AI && GTP.AI.syncBark && p.mesh) GTP.AI.syncBark(p);
      } catch (e) { U.reportError(e, 'missions.brain ' + ai.mission + '#' + p.id); }
    }
  }

  // ------------------------------------------------------- objectives --
  function vehicleLost(v) { return !v || v.removed || v.wreck || v.sinking; }
  function pedOut(p) { return !p || p.removed || !p.alive || p.knockedDown || p.fled; }
  function parseVehicleRef(ref) {
    if (!ref || ref === 'any') return { any: true };
    if (typeof ref === 'string' && ref.indexOf('spawned:') === 0) return { tag: ref.slice(8) };
    return { tag: String(ref) };
  }
  function taggedVehicle(tag) { var t = run && run.tagged[tag]; return t && !t.removed ? t : null; }
  // readable vehicle names for hints: 'Get back in the SUV', 'Get back on the scooter' (QA-C1-15)
  var VEHICLE_NAMES = { suv: 'SUV', bike: 'scooter', sports: 'sports car', sedan: 'car', cop: 'cruiser', taxi: 'taxi', bus: 'bus', truck: 'truck', van: 'van', moto: 'motorbike', heli: 'helicopter', plane: 'plane', jet: 'jet', speedboat: 'speedboat', jetski: 'jet ski' };
  var ON_VEHICLES = { bike: 1, moto: 1, jetski: 1 };
  function vehicleName(type) { return VEHICLE_NAMES[type] || (type ? String(type) : 'vehicle'); }
  function backIn(type) { return 'Get back ' + (ON_VEHICLES[type] ? 'on' : 'in') + ' the ' + vehicleName(type); }
  function refType(ref, fallback) { if (!ref || ref.any) return fallback || 'car'; var tv = taggedVehicle(ref.tag) || liveTagged(ref.tag); return tv ? tv.type : (fallback || 'vehicle'); }

  // a weapon-restricted objective never strands the player: once the named weapon runs dry with targets left, a fresh
  // supply arrives after K.ammoRefillDelay seconds (QA-C1-03; the shop may lock the item until the mission is done)
  function ammoLeft(p, id) { var n = p.weapons[id]; return n === Infinity ? Infinity : (n | 0); }
  function supplyWeapon(c, p) {
    var CB = GTP.Combat, id = c.weapon; if (!id || !p || !CB || !CB.WEAPONS || !CB.WEAPONS[id] || CB.WEAPONS[id].melee) return;
    if (ammoLeft(p, id) > 0) { c.dryT = 0; return; }
    c.dryT = (c.dryT || 0) + C.STEP;
    if (c.dryT < K.ammoRefillDelay) return;
    c.dryT = 0;
    var w = CB.WEAPONS[id], n = K.weaponAmmo[id] || Math.max(1, (w.mag || 1) * 2);
    if (CB.giveAmmo) CB.giveAmmo(p, id, n, false); else p.weapons[id] = n;
    if (!(p.weapons[id] > 0)) p.weapons[id] = n;
    p.weapon = id;
    c.refills = (c.refills || 0) + 1;
    toast('Mission supply: +' + n + ' for the ' + ((CB.weaponName && CB.weaponName(id)) || id));
    emit('supply', { weapon: id, ammo: n });
  }

  // where the player stands as far as the street goes: inside an interior (rooms are built far away, x = -4000) that is the
  // door of the landmark they walked in through, so "walk up to the door" is met by a player who went straight in
  function outsidePos(p) {
    var I = GTP.Interiors, cur = I && I.active ? I.current : null, lm = cur && typeof cur === 'object' ? cur.landmark : null;
    var d = lm ? resolvePoint({ landmark: lm }) : null;
    return d || p;
  }
  var H = {};
  H.goto = {
    start: function (o, c) {
      c.target = resolvePoint(o.target);
      c.radius = o.radius != null ? Math.max(2.5, metres(o.radius)) : K.gotoRadius;
      if (c.target) c.marker = addObjMarker(c.target, null);
    },
    check: function (o, c, p) {
      if (!c.target) return 'done';
      var v = p.inVehicle, e = v || outsidePos(p);
      var inside = U.dist2d(e.x, e.z, c.target.x, c.target.z) <= c.radius + (v ? (v.hl || 2) : 0) && Math.abs(e.y - c.target.y) < 4;
      if (!inside) return null;
      // arriving by car counts once it has stopped in the light (the long return legs are driven; QA-C1-10); `onFoot` insists
      if (v) return (!o.onFoot && Math.abs(v.speed || 0) < 2) ? 'done' : null;
      return 'done';
    },
    hint: function (o, c, p) {
      if (!p.inVehicle || !c.target) return null;
      if (U.dist2d(p.inVehicle.x, p.inVehicle.z, c.target.x, c.target.z) > c.radius + 6) return null;
      return o.onFoot ? 'Get out on foot' : 'Stop in the light';
    },
    target: function (o, c) { return c.target; }
  };
  H.drive_to = {
    start: function (o, c) {
      c.target = resolvePoint(o.target);
      c.radius = o.radius != null ? Math.max(4, metres(o.radius)) : K.driveRadius;
      c.ref = parseVehicleRef(o.vehicle);
      if (c.target) c.marker = addObjMarker(c.target, null);
    },
    check: function (o, c, p) {
      if (!c.target) return 'done';
      var v = p.inVehicle; if (!v) return null;
      if (!c.ref.any) { var tv = taggedVehicle(c.ref.tag); if (!tv || v !== tv) return null; }
      return (U.dist2d(v.x, v.z, c.target.x, c.target.z) <= c.radius && Math.abs(v.y - c.target.y) < 4) ? 'done' : null;
    },
    hint: function (o, c, p) { if (!p.inVehicle && !c.ref.any) return backIn(refType(c.ref)); return null; },
    target: function (o, c) { return c.target; }
  };
  H.enter_vehicle = {
    start: function (o, c) {
      var sp = o.spawn || {}, at = resolvePoint(sp.at) || { x: player().x, z: player().z, y: player().y };
      var v = sp.tag ? taggedVehicle(sp.tag) : null;
      var cls = C.VEHICLES[sp.type] || C.VEHICLES.sedan;
      // a live persistent vehicle with this tag (the pod van from m01, the strands' sponsor van) is reused, moved to a bay when far
      if (!v && sp.tag) {
        var live = liveTagged(sp.tag);
        if (live && live.persistent) {
          v = live;
          if (U.dist2d(v.x, v.z, at.x, at.z) > 60 && !v.hasPlayer()) {
            var bay = vehicleSpot(at.x, at.z, 46, 'parking', null, v.cls.length);
            if (bay) { v.x = bay.x; v.z = bay.z; v.y = bay.y; v.yaw = bay.yaw; v.vx = v.vz = v.vy = 0; v.speed = 0; v.snap(); if (v._sh) E().hash.update(v); }
          }
          if (sp.color && !v.color) v.color = sp.color;
          if (!v.keep) track(v, 'vehicle');
          run.tagged[sp.tag] = v;
        }
      }
      if (!v) {
        var spot = vehicleSpot(at.x, at.z, 46, 'parking', null, cls.length) || { x: at.x, z: at.z, y: at.y, yaw: 0 };
        v = makeVehicle(spot, sp.type || 'sedan', { tag: sp.tag || null, wrap: sp.wrap || null, color: sp.color || null });
        if (sp.tag) run.tagged[sp.tag] = v;
      }
      c.vehicle = v; c.tag = sp.tag || null;
      c.marker = addObjMarker({ x: v.x, z: v.z, y: v.y }, v);
    },
    check: function (o, c, p) {
      if (vehicleLost(c.vehicle)) { c.failReason = 'vehicle_lost:' + (c.tag || c.vehicle.type); return 'fail'; }
      return (p.inVehicle === c.vehicle && c.vehicle.driver === p) ? 'done' : null;
    },
    target: function (o, c) { return c.vehicle && !c.vehicle.removed ? { x: c.vehicle.x, z: c.vehicle.z, y: c.vehicle.y } : null; }
  };
  H.pickup = {
    start: function (o, c) {
      var sp = o.spawn || {}, center = resolvePoint(sp.around) || { x: player().x, z: player().z, y: player().y };
      c.count = sp.count || 1; c.label = sp.label || null;
      c.total = o.need != null ? Math.min(o.need, c.count) : c.count;   // collect_any: `need` of `count` completes it
      // collected from a vehicle when the player is driving as it starts (or the data says so): the pickups go on the roads
      c.byCar = sp.byCar != null ? !!sp.byCar : !!(player() && player().inVehicle);
      c.pickups = spawnPickups(center, metres(sp.radius, sp.around && sp.around.tag ? 5 : 25), c.count, c.label, c, c.byCar);
      c.collected = 0;
    },
    check: function (o, c, p) {
      var n = 0, v = p.inVehicle;
      for (var i = 0; i < c.pickups.length; i++) {
        var pk = c.pickups[i];
        if (pk.removed) { n++; continue; }
        // mission pickups can be collected from a vehicle (the subscribers along the drive)
        if (v && !v.wreck && Math.abs(v.y - pk.y) < 2.5 && v.edgeDistance(pk.x, pk.z) < 1.0) pk.collect(p);
        if (pk.removed) n++;
      }
      c.collected = Math.min(n, c.total);
      if (n >= c.total) { for (i = 0; i < c.pickups.length; i++) if (!c.pickups[i].removed) removeEntity(c.pickups[i]); return 'done'; }
      return null;
    },
    progress: function (o, c) { return { n: c.collected, total: c.total }; },
    target: function (o, c, p) {
      var best = null, bd = 1e9;
      for (var i = 0; i < c.pickups.length; i++) { var pk = c.pickups[i]; if (pk.removed) continue; var d = U.dist2d(p.x, p.z, pk.x, pk.z); if (d < bd) { bd = d; best = pk; } }
      return best ? { x: best.x, z: best.z, y: best.y } : null;
    }
  };
  H.follow = {
    start: function (o, c) {
      var sp = o.spawn || {}, pl = player(), at = resolvePoint(sp.at) || { x: pl.x + 6, z: pl.z, y: pl.y };
      var wps = [], path = sp.path || [];
      for (var i = 0; i < path.length; i++) { var pt = resolvePoint(path[i]); if (pt) wps.push(pt); }
      // the target starts well ahead along its route (QA-C1-05): K.followLead metres from the player toward the first waypoint
      var aim = wps[0] || at, ax = aim.x - pl.x, az = aim.z - pl.z, al = Math.sqrt(ax * ax + az * az) || 1, lead = Math.min(K.followLead, Math.max(al - 2, 0));
      var base = lead > 4 ? { x: pl.x + ax / al * lead, z: pl.z + az / al * lead } : at;
      var s = randomSpot(base.x, base.z, 0, 3, { clear: 1 });
      if (U.dist2d(s.x, s.z, pl.x, pl.z) < K.followTooClose + 3) s = randomSpot(at.x, at.z, K.followTooClose + 3, K.followTooClose + 9, { clear: 1 });
      var p = spawnCastPed(sp.ped || 'courier', s.x, s.z, 'npc', { brain: 'follower', ai: { ctx: c } });
      track(p, 'follow');
      c.ped = p; c.wps = wps;
      if (!c.wps.length) c.wps.push({ x: s.x, z: s.z, y: s.y });
      c.wi = 0; c.arrived = false; c.closeT = 0; c.farT = 0; c.maxDist = metres(o.maxDist, 40); c.pulledAway = false;
      c.marker = addObjMarker({ x: p.x, z: p.z, y: p.y }, p);
      if (c.marker.mesh) c.marker.mesh.scale.set(0.55, 0.45, 0.55);
    },
    check: function (o, c, p) {
      var t = c.ped;
      if (!t || t.removed || !t.alive) { c.failReason = 'target_lost'; return 'fail'; }
      if (c.arrived) return 'done';
      var d = U.dist2d(p.x, p.z, t.x, t.z), dt = C.STEP;
      if (d >= K.followTooClose) c.pulledAway = true;
      // the spotted clock only runs once the player has had a moment to react (or the target has pulled away once)
      var live = c.pulledAway || c.t >= K.followGrace;
      if (live && d < K.followTooClose && !c.arrived) c.closeT += dt; else c.closeT = 0;
      if (d > c.maxDist) c.farT += dt; else c.farT = 0;
      if (c.closeT >= K.followCloseTime) { c.failReason = 'spotted'; return 'fail'; }
      if (c.farT >= K.followFarTime) { c.failReason = 'target_escaped'; return 'fail'; }
      return null;
    },
    hint: function (o, c, p) {
      if (!c.ped) return null;
      var d = U.dist2d(p.x, p.z, c.ped.x, c.ped.z);
      if (d < K.followTooClose + 2) return 'Too close';
      if (d > c.maxDist * 0.8) return 'Keep up';
      return null;
    },
    target: function (o, c) { return c.ped && !c.ped.removed ? { x: c.ped.x, z: c.ped.z, y: c.ped.y } : null; }
  };
  H.escape_wanted = {
    start: function (o, c) {
      var n = o.setWanted != null ? o.setWanted : 2, wd = GTP.AI && GTP.AI.wanted;
      if (wd && wd.set) wd.set(n); else if (game() && game().debug) game().debug.setWanted(n);
      c.t = 0;
    },
    check: function (o, c, p) {
      if (c.t < 1) return null;
      var wd = GTP.AI && GTP.AI.wanted, lvl = wd ? wd.level : p.wanted;
      return lvl === 0 && p.wanted === 0 ? 'done' : null;
    }
  };
  H.survive = {
    start: function (o, c) {
      c.total = o.seconds || 30; c.t = 0; c.nextWave = 0; c.hostiles = [];
      var waves = o.waves || {}, n = Math.max(1, Math.floor(c.total / K.waveEvery));
      c.quota = {}; c.spawned = {}; c.perWave = {};
      var hm = Heist.hostileMul();
      for (var role in waves) { c.quota[role] = Math.max(1, Math.round((waves[role] | 0) * hm)); c.spawned[role] = 0; c.perWave[role] = Math.max(1, Math.ceil(c.quota[role] / n)); }
    },
    update: function (o, c, p) {
      // c.t is the objective clock (ticked by the interpreter, paused during dialogue)
      if (c.t < c.nextWave) return;
      var live = 0;
      for (var i = 0; i < c.hostiles.length; i++) if (!pedOut(c.hostiles[i])) live++;
      if (live >= K.maxHostiles) { c.nextWave = c.t + 2; return; }
      c.nextWave = c.t + K.waveEvery;
      var any = false;
      for (var role in c.quota) {
        var want = Math.min(c.perWave[role], c.quota[role] - c.spawned[role]);
        for (var k = 0; k < want && live + k < K.maxHostiles; k++) {
          var s = randomSpot(p.x, p.z, 16, 34, { roads: true, clear: 1.2 });
          var h = spawnHostile(role, s.x, s.z, c);
          c.hostiles.push(h); c.spawned[role]++; any = true;
        }
      }
      if (any) sfx('siren', p.x, p.z, 0.3);
      emit('wave', { t: c.t, hostiles: c.hostiles.length });
    },
    check: function (o, c) { return c.t >= c.total ? 'done' : null; },
    progress: function (o, c) { return { seconds: Math.max(0, Math.ceil(c.total - c.t)), total: c.total }; },
    cleanup: function (o, c) { for (var i = 0; i < c.hostiles.length; i++) { var h = c.hostiles[i]; if (h && !h.removed && h.alive) releasePed(h, true); } }
  };
  H.destroy = {
    start: function (o, c) {
      var sp = o.spawn || {}, center = resolvePoint(sp.around) || { x: player().x, z: player().z, y: player().y };
      var radius = metres(sp.radius, 30), count = sp.count || 1, driven = sp.driven || null, len = (C.VEHICLES[sp.vehicle] || C.VEHICLES.van).length;
      c.vehicles = []; c.tag = sp.tag || null; c.weapon = o.weapon || null; c.spawn = sp; c.center = center; c.radius = radius; c.len = len;
      c.wrong = 0; c.respawnQ = [];
      for (var i = 0; i < count; i++) {
        var v = H.destroy._spawnOne(c, i);
        if (v) c.vehicles.push(v);
      }
      c.total = c.vehicles.length;
    },
    _spawnOne: function (c, i) {
      var sp = c.spawn, driven = sp.driven || null, moving = !!(driven || sp.flee);
      var a = R().random() * TAU, rr = c.radius * (0.35 + 0.65 * R().random());
      var spot = vehicleSpot(c.center.x + Math.cos(a) * rr, c.center.z + Math.sin(a) * rr, Math.max(24, c.radius * 0.6), moving ? 'road' : 'parking', c.vehicles, c.len) || vehicleSpot(c.center.x, c.center.z, c.radius + 20, moving ? 'road' : null, c.vehicles, c.len);
      if (!spot) return null;
      var color = (sp.colors && sp.colors[i % sp.colors.length]) || sp.color || null;
      var v = makeVehicle(spot, sp.vehicle || 'van', { tag: c.tag, color: color, wrap: sp.wrap || null });
      v.target = true;
      var D = GTP.Strands && GTP.Strands.drivers;
      // 'cop' targets ram the player like cruisers; `flee` drivers run at 90% top speed; 'traffic' / 'hoa' drive the lanes
      if (sp.flee && D) D.take(v, 'flee', { role: driven === 'cop' ? 'cop' : 'civ', speedMul: 0.9 });
      else if (driven === 'cop' && D) D.take(v, 'ram', { role: 'cop', speedMul: 0.85 });
      else if (driven) driveVehicle(v, driven);
      addObjMarker({ x: v.x, z: v.z, y: v.y }, v).vehicle = v;
      return v;
    },
    check: function (o, c) {
      var n = 0, i, k;
      for (i = 0; i < c.vehicles.length; i++) {
        var v = c.vehicles[i];
        if (!vehicleLost(v)) continue;
        // a wreck by the wrong weapon says WRONG TAKE and another van arrives (GDD_EXPANSION §7)
        if (c.weapon && !v._counted && !v._wrong) {
          var hit = v._igniteHit || v._lastHit || {};
          if (hit.weapon !== c.weapon && hit.type !== c.weapon) {
            v._wrong = true; c.wrong++;
            textFx('WRONG TAKE', v.x, v.y + 2.4, v.z, '#ff3fa4', 1.6); toast('WRONG TAKE: use the ' + ((GTP.Combat && GTP.Combat.weaponName(c.weapon)) || c.weapon));
            c.respawnQ.push({ t: c.t + 2, i: i });
          }
        }
        if (v._wrong) continue;
        v._counted = true; n++;
        for (k = objMarkers.length - 1; k >= 0; k--) if (objMarkers[k].vehicle === v) dropObjMarker(objMarkers[k]);
      }
      for (k = c.respawnQ.length - 1; k >= 0; k--) {
        var q = c.respawnQ[k]; if (c.t < q.t) continue;
        c.respawnQ.splice(k, 1);
        var nv = H.destroy._spawnOne(c, q.i); if (nv) c.vehicles[q.i] = nv;
      }
      c.done = n;
      if (n >= c.total) return 'done';
      supplyWeapon(c, player());
      return null;
    },
    progress: function (o, c) { return { n: c.done || 0, total: c.total }; },
    target: function (o, c, p) {
      var best = null, bd = 1e9;
      for (var i = 0; i < c.vehicles.length; i++) { var v = c.vehicles[i]; if (vehicleLost(v)) continue; var d = U.dist2d(p.x, p.z, v.x, v.z); if (d < bd) { bd = d; best = v; } }
      return best ? { x: best.x, z: best.z, y: best.y } : null;
    }
  };
  H.defeat = {
    start: function (o, c) {
      var sp = o.spawn || {}, center = resolvePoint(sp.around) || { x: player().x, z: player().z, y: player().y };
      var radius = metres(sp.radius, 20), count = Math.max(1, Math.round((sp.count || 1) * Heist.hostileMul()));
      c.peds = []; c.holdT = 0; c.weapon = o.weapon || null; c.mustKill = !!o.mustKill; c.spawn = sp; c.center = center; c.radius = radius; c.respawnQ = []; c.wrong = 0;
      for (var i = 0; i < count; i++) c.peds.push(H.defeat._spawnOne(c));
      c.total = c.peds.length;
    },
    _spawnOne: function (c) {
      var sp = c.spawn, s = randomSpot(c.center.x, c.center.z, Math.min(8, c.radius * 0.4), c.radius, { clear: 1.2, others: c.peds, gap: 2.5 });
      return spawnHostile(sp.ped || 'thug', s.x, s.z, c, { stationary: !!sp.stationary, hostile: sp.hostile, weapon: sp.weapon, fireRange: sp.fireRange ? metres(sp.fireRange) : 0 });
    },
    check: function (o, c) {
      var out = 0, i, k;
      for (i = 0; i < c.peds.length; i++) {
        var p = c.peds[i];
        // a goon on the ropes gives up and runs ("it's on the calendar"); not when every one must drop
        if (!c.mustKill && p.alive && p.knockedDown && !p.fled && p.hp < p.maxHp * 0.35) { p.fled = true; releasePed(p, true); }
        if (!p.alive && c.weapon && !p._counted && !p._wrong) {
          var t = p.lastHitType || '';
          if (t !== c.weapon && !(c.weapon === 'fist' && t === 'punch')) {
            // a kill with another weapon: WRONG TAKE, and the heckler is back at the next wave
            p._wrong = true; c.wrong++;
            textFx('WRONG TAKE', p.x, p.y + 2.2, p.z, '#ff3fa4', 1.6); toast('WRONG TAKE: use the ' + ((GTP.Combat && GTP.Combat.weaponName(c.weapon)) || c.weapon));
            c.respawnQ.push({ t: c.t + 2, i: i });
          }
        }
        if (p._wrong) continue;
        var down = c.mustKill ? !p.alive || p.removed : pedOut(p);
        if (down) { p._counted = true; out++; }
      }
      for (k = c.respawnQ.length - 1; k >= 0; k--) {
        var q = c.respawnQ[k]; if (c.t < q.t) continue;
        c.respawnQ.splice(k, 1);
        c.peds[q.i] = H.defeat._spawnOne(c);
      }
      c.down = out;
      if (out >= c.total) c.holdT += C.STEP; else { c.holdT = 0; supplyWeapon(c, player()); }
      return c.holdT >= K.defeatHold ? 'done' : null;
    },
    progress: function (o, c) { return { n: c.down || 0, total: c.total }; },
    target: function (o, c, p) {
      var best = null, bd = 1e9;
      for (var i = 0; i < c.peds.length; i++) { var h = c.peds[i]; if (pedOut(h)) continue; var d = U.dist2d(p.x, p.z, h.x, h.z); if (d < bd) { bd = d; best = h; } }
      return best ? { x: best.x, z: best.z, y: best.y } : null;
    }
  };
  H.dialogue = {
    start: function (o, c) { c.done = false; showDialogue(o.lines || [], function () { c.done = true; }); },
    check: function (o, c) { return c.done ? 'done' : null; }
  };
  H.minigame = {
    start: function (o, c) {
      c.result = null; c.game = o.game || 'debate';
      startMinigame(c.game, o.params || {}, function (win) { c.result = win ? 'done' : 'fail'; if (!win) c.failReason = 'minigame:' + c.game; });
    },
    check: function (o, c) { return c.result; }
  };
  H.collect_any = H.pickup;

  // ------------------------------------------------ expansion objective types (GDD_EXPANSION §7) --
  // equip: the weapon is given (a magazine filled first), selected and the objective completes the same step
  H.equip = {
    start: function (o, c) {
      var p = player(), CB = GTP.Combat, id = o.weaponId;
      c.done = true;
      if (!p || !id || !CB || !CB.WEAPONS || !CB.WEAPONS[id]) return;
      var w = CB.WEAPONS[id], n = o.ammo != null ? o.ammo : (K.weaponAmmo[id] || 30);
      if (w.melee) p.weapons[id] = Infinity;
      else if (CB.giveAmmo) CB.giveAmmo(p, id, n, false);
      else p.weapons[id] = (p.weapons[id] || 0) + n;
      p.weapon = id;
      if (run) run.equipped.push(id);
      toast('Equipped: ' + (CB.weaponName ? CB.weaponName(id) : id));
      sfx('swap', p.x, p.z, 0.6);
      emit('equip', { weapon: id, ammo: n });
    },
    check: function () { return 'done'; }
  };
  // deliver_passenger: a hailing ped boards the qualifying vehicle (stopped beside them for `board.hold`), rides to `to`, steps out
  H.deliver_passenger = {
    start: function (o, c) {
      var sp = o.spawn || {}, pl = player(), at = resolvePoint(sp.at) || { x: pl.x + 6, z: pl.z, y: pl.y };
      var s = randomSpot(at.x, at.z, 1.5, 6, { clear: 1 });
      var ped = spawnCastPed(sp.ped || 'kip', s.x, s.z, 'npc', { brain: 'passenger', ai: { ctx: c } });
      track(ped, 'passenger');
      if (GTP.Cutscenes && GTP.Cutscenes.pose) GTP.Cutscenes.pose(ped, 'wave');
      c.ped = ped; c.to = resolvePoint(o.to); c.ref = parseVehicleRef(o.vehicle);
      c.boardR = o.board && o.board.radius != null ? metres(o.board.radius) : K.boardRadius;
      c.hold = o.board && o.board.hold != null ? o.board.hold : K.boardHold;
      c.dropR = o.dropRadius != null ? metres(o.dropRadius) : K.dropRadius;
      c.line = sp.line || null; c.holdT = 0; c.phase = 'hail'; c.v = null; c.awayT = 0;
      c.marker = addObjMarker({ x: ped.x, z: ped.z, y: ped.y }, ped);
      if (c.marker.mesh) c.marker.mesh.scale.set(0.6, 0.5, 0.6);
    },
    _qualifies: function (c, v) { if (!v || vehicleLost(v)) return false; if (c.ref.any) return true; var tv = taggedVehicle(c.ref.tag) || liveTagged(c.ref.tag); return !!tv && v === tv; },
    check: function (o, c, p) {
      var t = c.ped, v = p.inVehicle;
      if (!t || t.removed || !t.alive) { c.failReason = 'passenger_lost'; return 'fail'; }
      if (c.phase === 'hail') {
        if (!v || !H.deliver_passenger._qualifies(c, v) || v.driver !== p) { c.holdT = 0; return null; }
        var d = U.dist2d(v.x, v.z, t.x, t.z) - (v.hl || 2);
        if (d <= c.boardR && Math.abs(v.speed) < 1) c.holdT += C.STEP; else c.holdT = 0;
        if (c.holdT >= c.hold) {
          if (!t.enterVehicle(v, 1)) { c.holdT = 0; toast('No seat for a passenger'); return null; }
          if (GTP.Cutscenes && GTP.Cutscenes.pose) GTP.Cutscenes.pose(t, null);
          c.phase = 'boarding'; c.v = v; c.holdT = 0;
        }
      } else if (c.phase === 'boarding') {
        if (vehicleLost(c.v)) { c.failReason = 'passenger_lost'; return 'fail'; }
        if (t.inVehicle === c.v) {
          c.phase = 'ride';
          if (c.marker) dropObjMarker(c.marker);
          c.marker = c.to ? addObjMarker(c.to, null) : null;
          if (c.line && GTP.AI && GTP.AI.say) GTP.AI.say(t, c.line, '#ffd45a');
          emit('passenger', { ped: t, vehicle: c.v, phase: 'boarded' });
        } else if (!t.entering) {
          if (U.dist2d(c.v.x, c.v.z, t.x, t.z) > 9) { c.phase = 'hail'; if (GTP.Cutscenes && GTP.Cutscenes.pose) GTP.Cutscenes.pose(t, 'wave'); }
          else t.enterVehicle(c.v, 1);
        }
      } else {
        if (vehicleLost(c.v)) { c.failReason = 'passenger_lost'; return 'fail'; }
        if (t.inVehicle !== c.v) { c.failReason = 'passenger_lost'; return 'fail'; }
        if (p.inVehicle !== c.v) { c.awayT += C.STEP; if (c.awayT > K.passengerLeaveTime) { c.failReason = 'passenger_lost'; return 'fail'; } return null; }
        c.awayT = 0;
        if (!c.to) return 'done';
        if (Math.abs(c.v.speed) < 1 && U.dist2d(c.v.x, c.v.z, c.to.x, c.to.z) <= c.dropR) {
          c.v.exit(t); releasePed(t, false);
          if (GTP.AI && GTP.AI.say) GTP.AI.say(t, 'Thanks. Respectfully.', '#ffd45a');
          emit('passenger', { ped: t, vehicle: c.v, phase: 'delivered' });
          return 'done';
        }
      }
      return null;
    },
    hint: function (o, c, p) {
      if (c.phase === 'hail') { if (p.inVehicle) return 'Stop beside them'; var ty = refType(c.ref); return 'Pick them up ' + (ON_VEHICLES[ty] ? 'on' : 'in') + ' the ' + vehicleName(ty); }
      if (c.phase === 'ride') return p.inVehicle === c.v ? 'Stop at the drop-off' : 'Get back in';
      return null;
    },
    target: function (o, c) { if (c.phase === 'ride') return c.to; return c.ped && !c.ped.removed ? { x: c.ped.x, z: c.ped.z, y: c.ped.y } : null; },
    cleanup: function (o, c) { if (c.ped && c.ped.inVehicle && !c.ped.removed) c.ped.inVehicle.exit(c.ped); state.holdBar = null; }
  };
  // stop_vehicle: a spawned target (traffic / cop driver, fleeing or not) held under stopSpeed with the player's car within 6 m for `hold` s
  H.stop_vehicle = {
    start: function (o, c) {
      var sp = o.spawn || {}, pl = player(), at = resolvePoint(sp.at) || { x: pl.x, z: pl.z, y: pl.y };
      var cls = C.VEHICLES[sp.vehicle] || C.VEHICLES.van;
      var spot = vehicleSpot(at.x, at.z, 70, 'road', null, cls.length) || { x: at.x, z: at.z, y: at.y, yaw: 0 };
      var v = makeVehicle(spot, sp.vehicle || 'van', { tag: sp.tag || null, color: sp.color || null, wrap: sp.wrap || null });
      if (sp.tag) run.tagged[sp.tag] = v;
      var D = GTP.Strands && GTP.Strands.drivers;
      if (sp.flee && D) D.take(v, 'flee', { role: sp.driven === 'cop' ? 'cop' : 'civ', speedMul: 0.9 });
      else driveVehicle(v, sp.driven || 'traffic');
      c.v = v; c.stopSpeed = o.stopSpeed != null ? o.stopSpeed : 1; c.hold = o.hold != null ? o.hold : 2; c.maxDist = o.maxDist != null ? metres(o.maxDist) : 400;
      c.wreckCounts = o.wreckCounts !== false; c.holdT = 0; c.farT = 0; c.label = o.label || sp.violation || null;
      c.marker = addObjMarker({ x: v.x, z: v.z, y: v.y }, v);
      if (c.marker.mesh) c.marker.mesh.scale.set(0.8, 0.7, 0.8);
    },
    check: function (o, c, p) {
      var v = c.v;
      if (vehicleLost(v)) { if (c.wreckCounts) return 'done'; c.failReason = 'target_destroyed'; return 'fail'; }
      var px = p.inVehicle ? p.inVehicle.x : p.x, pz = p.inVehicle ? p.inVehicle.z : p.z;
      var d = v.edgeDistance ? v.edgeDistance(px, pz) : U.dist2d(v.x, v.z, px, pz);
      if (d > c.maxDist) c.farT += C.STEP; else c.farT = 0;
      if (c.farT >= K.escapeTime) { c.failReason = 'target_escaped'; return 'fail'; }
      var near = d <= (p.inVehicle ? K.stopNear + (p.inVehicle.hl || 0) : K.stopNearFoot);
      if (near && Math.abs(v.speed) <= c.stopSpeed) c.holdT += C.STEP; else c.holdT = Math.max(0, c.holdT - C.STEP * 0.5);
      state.holdBar = c.holdT > 0 ? { k: Math.min(1, c.holdT / c.hold), text: 'STOPPED' } : null;
      if (c.holdT >= c.hold) {
        var D = GTP.Strands && GTP.Strands.drivers; if (D) D.release(v); else if (GTP.AI.release) GTP.AI.release(v);
        v.setControls(0, 0, true, 1);
        if (v.driver && GTP.AI && GTP.AI.say) GTP.AI.say(v.driver, 'Fine. FINE.', '#ffd45a');
        return 'done';
      }
      return null;
    },
    hint: function (o, c, p) { return p.inVehicle ? (c.label || 'Block it, box it in, or bump it to a halt') : 'Get a car'; },
    target: function (o, c) { return c.v && !c.v.removed ? { x: c.v.x, z: c.v.z, y: c.v.y } : null; },
    cleanup: function (o, c) { state.holdBar = null; var D = GTP.Strands && GTP.Strands.drivers; if (c.v && !c.v.removed && D) D.release(c.v); }
  };
  // stunt: the qualifying vehicle leaves the named ramp at minSpeed, flies minAir and lands on its wheels in the landing zone (GTP.Strands.stunts)
  H.stunt = {
    start: function (o, c) {
      var St = GTP.Strands && GTP.Strands.stunts;
      c.ref = parseVehicleRef(o.vehicle); c.result = null; c.strict = !!o.strict; c.attempts = 0;
      c.ramp = St && St.ramp ? St.ramp(o.ramp) : null;
      if (!c.ramp && o.at) { var pt = resolvePoint(o.at); if (pt) c.ramp = { id: 'inline', name: o.name || 'the ramp', x: pt.x, z: pt.z, y: pt.y, yaw: o.heading != null ? o.heading : 0, landing: o.landing ? resolvePoint(o.landing) : null, minAir: o.minAir || 1 }; }
      if (!c.ramp) { U.reportError(new Error('stunt: unknown ramp ' + o.ramp), 'missions.stunt'); c.result = { ok: true, missing: true }; return; }
      var self = this;
      c.watch = St ? St.watch({
        ramp: c.ramp.id, minAir: o.minAir != null ? o.minAir : c.ramp.minAir, minSpeed: o.minSpeed || 0, landing: o.landing ? resolvePoint(o.landing) : null,
        vehicle: function (v) { if (c.ref.any) return true; var tv = taggedVehicle(c.ref.tag) || liveTagged(c.ref.tag); return !!tv && v === tv; },
        onResult: function (res) { c.result = res; }
      }) : null;
      c.marker = addObjMarker({ x: c.ramp.x, z: c.ramp.z, y: c.ramp.y }, null);
      void self;
    },
    check: function (o, c) {
      if (!c.result) return null;
      var r = c.result; c.result = null;
      if (r.ok) return 'done';
      c.attempts++;
      if (c.strict) { c.failReason = 'stunt_failed'; return 'fail'; }
      toast('CONTEXT STAMPED: ' + (r.reason === 'short' ? 'not enough air' : r.reason === 'slow' ? 'too slow off the ramp' : 'bad landing') + '. Line it up again');
      return null;
    },
    hint: function (o, c, p) { if (!p.inVehicle) return backIn(refType(c.ref)); return 'Hit the ramp flat out'; },
    target: function (o, c) { return c.ramp ? { x: c.ramp.x, z: c.ramp.z, y: c.ramp.y } : null; },
    cleanup: function (o, c) { var St = GTP.Strands && GTP.Strands.stunts; if (c.watch && St) St.unwatch(c.watch); }
  };
  // race: a strand race (`race: 'lr_xx'`) or an inline route, finished in a place at or better than `place`
  H.race = {
    start: function (o, c) {
      var Rc = GTP.Strands && GTP.Strands.races;
      c.place = o.place || 1; c.result = null; c.ref = parseVehicleRef(o.vehicle);
      var def = o.race && Rc ? Rc.def(o.race) : (o.checkpoints && Rc ? Rc.resolve({ id: 'inline', name: o.name || 'Race', start: o.start, checkpoints: o.checkpoints, laps: o.laps || 1, racers: o.racers != null ? o.racers : 3, prizes: [] }) : null);
      if (!def || !Rc) { U.reportError(new Error('race: no definition'), 'missions.race'); c.result = { place: 1, missing: true }; return; }
      c.race = Rc.begin(def, { mission: true, countdown: o.countdown != null ? o.countdown : 3, onFinish: function (res) { c.result = res; } });
      if (!c.race) c.result = { dnf: true, reason: 'busy' };
    },
    check: function (o, c) {
      if (!c.result) return null;
      if (c.result.dnf) { c.failReason = 'dnf'; return 'fail'; }
      if (c.result.place <= c.place) return 'done';
      c.failReason = 'race_lost'; return 'fail';
    },
    progress: function (o, c) { var Rc = GTP.Strands && GTP.Strands.races, h = Rc && Rc.hud ? Rc.hud() : null; return h && h.active ? { n: h.checkpoint, total: h.total } : null; },
    hint: function (o, c) { var Rc = GTP.Strands && GTP.Strands.races, h = Rc && Rc.hud ? Rc.hud() : null; return h && h.active ? (h.countdown > 0 ? 'Get ready' : 'Position ' + h.position + ' / ' + h.racers + '  lap ' + h.lap + ' / ' + h.laps) : null; },
    target: function () { var Rc = GTP.Strands && GTP.Strands.races; return Rc && Rc.nextCheckpoint ? Rc.nextCheckpoint() : null; },
    cleanup: function () { var Rc = GTP.Strands && GTP.Strands.races; if (Rc && Rc.active()) Rc.end('mission'); }
  };
  // cutscene: plays a script (GDD_EXPANSION §4) in state cutscene; a checkpoint retry skips it
  H.cutscene = {
    start: function (o, c) {
      var Cs = GTP.Cutscenes, script = o.cutscene || o.script;
      c.done = false;
      if (run && run.skipCutsceneOnce) { run.skipCutsceneOnce = false; c.done = true; return; }
      if (!Cs || !Cs.play || !script) { c.done = true; return; }
      var ok = false;
      try { ok = Cs.play(script, function () { c.done = true; }, { mission: run ? run.m : null }); } catch (e) { U.reportError(e, 'missions.cutscene'); }
      if (!ok) c.done = true;
    },
    check: function (o, c) { return c.done ? 'done' : null; }
  };
  // shop: the player opens Both Sides Arms at `landmark` (and buys `buy` when given)
  H.shop = {
    start: function (o, c) {
      var pt = resolvePoint({ landmark: o.landmark });
      c.lm = o.landmark; c.opened = false; c.bought = !o.buy; c.buy = o.buy || null;
      c.onOpen = function (e) { if (e && e.landmark && e.landmark.id === c.lm) c.opened = true; };
      c.onBuy = function (e) { if (e && e.item && c.buy && e.item.id === c.buy) c.bought = true; };
      GTP.Events.on('shop:open', c.onOpen); GTP.Events.on('shop:buy', c.onBuy);
      if (pt) c.marker = addObjMarker(pt, null);
      c.target = pt;
    },
    check: function (o, c) {
      var sh = GTP.Combat && GTP.Combat.shop && GTP.Combat.shop.state;
      if (sh && sh.open && sh.landmark && sh.landmark.id === c.lm) c.opened = true;
      return c.opened && c.bought ? 'done' : null;
    },
    hint: function (o, c) { return c.opened && !c.bought ? 'Buy it' : 'Stand in the green light'; },
    target: function (o, c) { return c.target; },
    cleanup: function (o, c) { GTP.Events.off('shop:open', c.onOpen); GTP.Events.off('shop:buy', c.onBuy); }
  };

  // ------------------------------------------------ v0.3 objective types (PLAN_V03 "story") --
  // An event-driven objective: `on` names the events, `match(o, c, e)` says whether one completes it. The listeners live on
  // the objective context and come off in cleanup.
  function listen(c, name, fn) { c._ls = c._ls || []; c._ls.push([name, fn]); GTP.Events.on(name, fn); }
  function unlisten(c) { if (!c || !c._ls) return; for (var i = 0; i < c._ls.length; i++) GTP.Events.off(c._ls[i][0], c._ls[i][1]); c._ls = null; }
  // the door a kind of interior is entered by: the objective's own landmark, else the nearest landmark of that kind
  var INTERIOR_KINDS = { armory: ['armory', 'gunshop'], range: ['armory', 'gunshop'], clothing: ['clothing'], barber: ['barber'], safehouse: ['safehouse'], modshop: ['modshop'] };
  function interiorDoor(o, want) {
    if (o.target) return resolvePoint(o.target);
    if (o.landmark) return resolvePoint({ landmark: o.landmark });
    var Wd = W(), pl = player(), kinds = INTERIOR_KINDS[want] || [want], best = null, bd = 1e9;
    for (var i = 0; i < Wd.landmarks.length; i++) {
      var l = Wd.landmarks[i]; if (!l.door || kinds.indexOf(l.kind) < 0) continue;
      var d = pl ? U.dist2d(pl.x, pl.z, l.door.x, l.door.z) : 0; if (d < bd) { bd = d; best = l; }
    }
    return best ? resolvePoint({ landmark: best.id }) : null;
  }
  function interiorMatches(want, store, e) {
    if (!e) return false;
    if (store && e.store !== store && e.id !== store) return false;
    if (!want) return true;
    var ks = INTERIOR_KINDS[want] || [want];
    return e.id === want || e.kind === want || ks.indexOf(e.kind) >= 0 || ks.indexOf(e.id) >= 0;
  }
  // a spot inside the room the player stands in (GTP.Interiors rooms list their interactables in world coordinates): the range
  // booth, Merle at the counter. The HUD arrow points there; there is no GPS line indoors
  function roomSpot(kinds) {
    var I = GTP.Interiors, room = I && I.active && typeof I.room === 'function' ? I.room() : null, pl = player();
    if (!room || !room.inter) return null;
    for (var i = 0; i < room.inter.length; i++) { var q = room.inter[i]; if (q && kinds.indexOf(q.kind) >= 0) return { x: q.x, z: q.z, y: pl ? pl.y : 0 }; }
    return null;
  }
  // interior: {interior:'armory'|'clothing'|..., store?, landmark?} completes on interior:enter. Without GTP.Interiors (the
  // interiors track not merged) reaching the door on foot counts, so the story never waits on a room that does not exist
  H.interior = {
    start: function (o, c) {
      c.want = o.interior || o.kind || null; c.store = o.store || null; c.done = false; c.radius = o.radius != null ? metres(o.radius) : 3;
      listen(c, 'interior:enter', function (e) { if (interiorMatches(c.want, c.store, e)) c.done = true; });
      var I = GTP.Interiors;
      if (I && I.active && I.current && interiorMatches(c.want, c.store, typeof I.current === 'object' ? I.current : { id: I.current })) c.done = true;
      c.target = interiorDoor(o, c.want);
      if (c.target && !c.done) c.marker = addObjMarker(c.target, null);
    },
    check: function (o, c, p) {
      if (c.done) return 'done';
      var I = GTP.Interiors;
      if ((!I || !I.enter) && c.target && !p.inVehicle && U.dist2d(p.x, p.z, c.target.x, c.target.z) <= Math.max(c.radius, K.markerRadius + 1)) return 'done';
      return null;
    },
    hint: function (o, c, p) { return c.target && U.dist2d(p.x, p.z, c.target.x, c.target.z) < 12 ? 'Walk in through the door' : null; },
    target: function (o, c) { return c.done ? null : c.target; },
    cleanup: function (o, c) { unlisten(c); }
  };
  // buy: {item} (an item id, a shop tab like 'ammo', a weapon id, or 'any') completes on shop:buy. `fund` tops the wallet up to
  // that amount at the start, so a broke player is never locked out of the tutorial purchase
  function buyMatches(want, e) {
    if (!e) return false;
    var it = e.item, id = typeof it === 'string' ? it : (it && (it.id || it.itemId)) || null;
    if (!want || want === 'any') return true;
    if (id === want) return true;
    if (it && typeof it === 'object' && (it.tab === want || it.kind === want || it.weapon === want || it.weaponId === want)) return true;
    return typeof id === 'string' && id.indexOf(want + '_') === 0;
  }
  // A mission may ask the player to buy what it unlocks itself (m01c: Merle's pistol rounds carry unlock: 'm01c_both_sides'). While
  // such a buy objective runs, that mission counts as unlocked for the shop: Missions.isUnlocked(id) says so, and so does
  // state.completed.has(id) for the shop's own check (GTP.Combat unlocked(): Ms.completed.has(item.unlock)) through an
  // instance override that the objective's cleanup removes. Nothing else reads completed during the objective.
  function shopItemsMatching(want) {
    var CB = GTP.Combat, list = [];
    try { list = (CB && CB.shop && typeof CB.shop.items === 'function') ? CB.shop.items() : (CB && typeof CB.catalog === 'function' ? CB.catalog() : []); } catch (e) { list = []; }
    return (list || []).filter(function (it) { return it && buyMatches(want, { item: it }); });
  }
  function provisionalUnlock(c, id) {
    if (!run || !id) return;
    run.unlocks = run.unlocks || {}; run.unlocks[id] = true; c.unlocked = id;
    var set = state.completed;
    if (set && !Object.prototype.hasOwnProperty.call(set, 'has')) set.has = function (k) { return (run && run.unlocks && run.unlocks[k] === true) || Set.prototype.has.call(this, k); };
  }
  function provisionalDrop(c) {
    if (!c.unlocked) return;
    if (run && run.unlocks) delete run.unlocks[c.unlocked];
    var set = state.completed; if (set && Object.prototype.hasOwnProperty.call(set, 'has') && !(run && run.unlocks && Object.keys(run.unlocks).length)) delete set.has;
    c.unlocked = null;
  }
  H.buy = {
    start: function (o, c) {
      var p = player();
      c.want = o.item || 'any'; c.done = false;
      // the item this mission unlocks itself is sold during it
      var mine = run ? shopItemsMatching(c.want).filter(function (it) { return it.unlock === run.id; }) : [];
      if (mine.length) provisionalUnlock(c, run.id);
      if (o.fund && p && p.money < o.fund) { p.money = o.fund | 0; toast('Gus spotted you ' + U.fmtMoney(o.fund) + '. He wants it back. He will not ask.'); }
      listen(c, 'shop:buy', function (e) { if (buyMatches(c.want, e)) c.done = true; });
      if (o.target || o.landmark) { c.target = resolvePoint(o.target || { landmark: o.landmark }); if (c.target) c.marker = addObjMarker(c.target, null); }
      // nothing to buy from (no shop module at all): it passes
      if (!GTP.Combat || (!GTP.Combat.buy && !(GTP.Combat.shop && GTP.Combat.shop.buy))) c.done = true;
    },
    check: function (o, c) { return c.done ? 'done' : null; },
    hint: function (o, c) { return roomSpot(['clerk']) ? 'Talk to Merle at the counter to buy it' : (c.want === 'any' ? 'Buy something at the counter' : 'Buy it at the counter'); },
    target: function (o, c) { return c.target || roomSpot(['clerk', 'counter', 'shop']); },
    cleanup: function (o, c) { unlisten(c); provisionalDrop(c); }
  };
  // range: {medal:'bronze'|'silver'|'gold'} completes on range:end with that medal or better; a worse run says go again.
  // Without a range runtime (no GTP.Interiors) it passes after a beat, with a toast
  var MEDALS = { none: 0, bronze: 1, silver: 2, gold: 3 };
  H.range = {
    start: function (o, c) {
      c.want = MEDALS[o.medal] != null ? MEDALS[o.medal] : 1; c.done = false; c.tries = 0;
      listen(c, 'range:end', function (e) {
        var got = MEDALS[e && e.medal] || 0; c.tries++;
        if (got >= c.want) c.done = true; else toast('No ' + (o.medal || 'bronze') + ' yet (' + ((e && e.score) | 0) + ' points). Merle resets the targets.');
      });
      c.fallback = !GTP.Interiors;
      if (o.target || o.landmark) { c.target = resolvePoint(o.target || { landmark: o.landmark }); if (c.target) c.marker = addObjMarker(c.target, null); }
    },
    check: function (o, c) {
      if (c.done) return 'done';
      if (c.fallback && c.t > 1) { toast('The range is closed for repainting. Merle signs you off anyway.'); return 'done'; }
      return null;
    },
    hint: function (o, c) { return c.tries ? 'Beat the clock for a ' + (o.medal || 'bronze') : 'Stand on the line in the back room to start the range'; },
    target: function (o, c) { var I = GTP.Interiors; return c.target || (I && I.range && I.range.running ? null : roomSpot(['range'])); },
    cleanup: function (o, c) { unlisten(c); }
  };
  // heist_board: opens the planning board (emits heist:board {missionId}) and completes on heist:plan {approach, crew}.
  // With nobody listening for heist:board (no UI board) the default plan is picked after a beat
  H.heist_board = {
    start: function (o, c) {
      c.done = false; c.mission = run ? run.id : null;
      listen(c, 'heist:plan', function (e) { Heist.setPlan(e || {}, c.mission); c.done = true; });
      GTP.Events.emit('heist:board', { missionId: c.mission, approaches: Heist.approaches(), crew: Heist.crewList(), mission: run ? run.m : null });
      c.auto = !(hasListener('heist:board') || (GTP.UI && (GTP.UI.heistBoard || GTP.UI.openHeistBoard)));
    },
    check: function (o, c) {
      if (c.done) return 'done';
      if (c.auto && c.t > 1.5) { var def = Heist.defaultPlan(); Heist.setPlan(def, c.mission); toast('Plan: ' + Heist.approachName(def.approach) + '. Gus picked for you. Gus always picks.'); return 'done'; }
      return null;
    },
    hint: function () { return 'Pick an approach and a crew'; },
    cleanup: function (o, c) { unlisten(c); }
  };
  // boss: a fallback for the bosses track's own type (it replaces this through registerObjectiveType): GTP.Bosses.spawn and
  // boss:defeated when that module is there, else the fight is skipped with a toast so the story never stops on it
  H.boss = {
    start: function (o, c) {
      c.done = false; c.id = o.bossId || o.boss || null;
      listen(c, 'boss:defeated', function (e) { if (!c.id || (e && e.id === c.id)) c.done = true; });
      var B = GTP.Bosses, ok = false;
      if (B && B.spawn && c.id) { try { ok = !!B.spawn(c.id, Object.assign({ mission: run ? run.id : null }, o.opts || {})); } catch (e) { U.reportError(e, 'missions.boss'); } }
      if (!ok) { c.done = true; toast('The set piece is still in rehearsal. Ratio\'d anyway.'); }
    },
    check: function (o, c) { return c.done ? 'done' : null; },
    cleanup: function (o, c) { unlisten(c); }
  };

  // listener counts for the fallbacks above (does anyone draw the heist board, the phone, the chapter card?): GTP.Events.on /
  // off are wrapped once at load to keep a tally (a wrapper on 00_util, listed in docs/v03/story.md)
  var evCount = {};
  (function wrapEvents() {
    var Ev = GTP.Events; if (!Ev || Ev._counted) return;
    var on = Ev.on, off = Ev.off;
    Ev.on = function (name, fn) { evCount[name] = (evCount[name] || 0) + 1; return on.call(Ev, name, fn); };
    Ev.off = function (name, fn) { if (evCount[name] > 0) evCount[name]--; return off.call(Ev, name, fn); };
    Ev._counted = true;
  })();
  function hasListener(name) { return (evCount[name] | 0) > 0; }

  // ------------------------------------------------------------- the heist (three missions: h01_casing, h02_prep, h03_job) --
  // The planning board's choice arrives as heist:plan {approach, crew:[castIds]}; it changes the job's spawns (hostile counts
  // x approach.hostiles, objectives tagged `approach` run only for that approach) and its payout (x approach.payout, minus the
  // crew's cuts). Tables come from GTP.Content.parity.heist when the content has them.
  var HEIST_DEFAULTS = {
    missions: ['h01_casing', 'h02_prep', 'h03_job'],
    approaches: [
      { id: 'quiet', name: 'The Quiet Take', hostiles: 0.6, payout: 1.0, wanted: 2, line: 'In through the loading dock, out before the panel ends.' },
      { id: 'loud', name: 'The Loud Take', hostiles: 1.5, payout: 1.3, wanted: 4, line: 'Through the front door, on air, with a megaphone.' }
    ],
    crew: [
      { id: 'gus', name: 'Gus', cut: 0.1, perk: 'driver' },
      { id: 'roz', name: 'Roz', cut: 0.08, perk: 'crowd' },
      { id: 'kip', name: 'Kip', cut: 0.02, perk: 'hacker' }
    ]
  };
  function heistData() {
    var P = GTP.Content && GTP.Content.parity, X = (P && P.heist) || {};
    return { missions: X.missions || HEIST_DEFAULTS.missions, approaches: X.approaches || HEIST_DEFAULTS.approaches, crew: X.crew || HEIST_DEFAULTS.crew };
  }
  var heistPlan = null;   // {approach, crew, missionId, at}
  var Heist = GTP.Heist = {
    approaches: function () { return heistData().approaches.slice(); },
    crewList: function () { return heistData().crew.slice(); },
    approach: function (id) { var A = heistData().approaches; for (var i = 0; i < A.length; i++) if (A[i].id === id) return A[i]; return A[0] || null; },
    approachName: function (id) { var a = Heist.approach(id); return a ? a.name : String(id); },
    defaultPlan: function () { var A = heistData().approaches, C2 = heistData().crew; return { approach: A[0] ? A[0].id : 'quiet', crew: C2.length ? [C2[0].id] : [] }; },
    plan: function () { return heistPlan; },
    setPlan: function (e, missionId) {
      var a = Heist.approach(e.approach) || Heist.approach(Heist.defaultPlan().approach), crew = Array.isArray(e.crew) ? e.crew.slice(0, 4) : [];
      heistPlan = { approach: a ? a.id : 'quiet', crew: crew, missionId: missionId || null };
      if (state) { state.flags.heist_planned = true; state.flags['heist_' + heistPlan.approach] = true; }
      emit('heistPlan', heistPlan);
      return heistPlan;
    },
    isHeist: function (m) { return !!m && (!!m.heist || heistData().missions.indexOf(m.id) >= 0); },
    // the multiplier on the job's hostile spawns
    hostileMul: function () { if (!run || !Heist.isHeist(run.m)) return 1; var a = Heist.approach((heistPlan || Heist.defaultPlan()).approach); return a && a.hostiles ? a.hostiles : 1; },
    // the reward after the approach and the crew's cuts (whole dollars)
    payout: function (m, base) {
      if (!Heist.isHeist(m)) return base;
      var plan = heistPlan || Heist.defaultPlan(), a = Heist.approach(plan.approach), cut = 0, C2 = heistData().crew;
      for (var i = 0; i < plan.crew.length; i++) for (var k = 0; k < C2.length; k++) if (C2[k].id === plan.crew[i]) cut += C2[k].cut || 0;
      return Math.max(0, Math.round(base * (a && a.payout ? a.payout : 1) * (1 - Math.min(0.6, cut))));
    },
    // an objective tagged {approach:'loud'} (or ['loud', ...]) runs only for that plan; untagged ones always run
    objectiveRuns: function (def) {
      if (!def || def.approach == null) return true;
      var want = Array.isArray(def.approach) ? def.approach : [def.approach], plan = heistPlan || Heist.defaultPlan();
      return want.indexOf(plan.approach) >= 0;
    },
    reset: function () { heistPlan = null; },
    serialize: function () { return heistPlan ? JSON.parse(JSON.stringify(heistPlan)) : null; },
    load: function (d) { heistPlan = d && d.approach ? { approach: d.approach, crew: Array.isArray(d.crew) ? d.crew.slice() : [], missionId: d.missionId || null } : null; }
  };

  // ----------------------------------------------------- checkpoints --
  // Every objective start takes a snapshot (GDD_EXPANSION §6.4): the player, their vehicle, the wanted level, the cursor into the
  // objective tree with the timers, the flags and the live tagged vehicles (re-spawned from the record on RETRY, never kept)
  function vehicleRecord(v) { return v && !v.removed ? { type: v.type, wrap: v.wrap || null, color: v.color || null, tag: v.tag || null, x: v.x, z: v.z, y: v.y, yaw: v.yaw, hp: v.hp, persistent: !!v.persistent, keep: !!v.keep } : null; }
  function copyAmmo(a) { var out = {}; if (a) for (var k in a) out[k] = { mag: a[k].mag, reserve: a[k].reserve, total: a[k].total }; return out; }
  function takeSnapshot() {
    var p = player(), wd = GTP.AI && GTP.AI.wanted;
    var snap = {
      missionId: run.id, replay: !!run.replay, playT: run.playT, cursor: [], timers: [],
      player: { x: p.x, z: p.z, y: p.y, yaw: p.yaw, hp: p.hp, armor: p.armor || 0, weapon: p.weapon, weapons: Object.assign({}, p.weapons), ammo: copyAmmo(p.ammo), money: p.money, wanted: wd ? wd.level : (p.wanted | 0), heat: wd ? wd.heat : 0 },
      vehicle: p.inVehicle ? vehicleRecord(p.inVehicle) : null,
      tagged: {}, flags: Object.assign({}, state.flags), equipped: run.equipped.slice()
    };
    for (var i = 0; i < run.stack.length; i++) { snap.cursor.push(run.stack[i].i); snap.timers.push(run.stack[i].timer ? run.stack[i].timer.remaining : null); }
    for (var tag in run.tagged) { var rec = vehicleRecord(run.tagged[tag]); if (rec && !run.tagged[tag].wreck && !run.tagged[tag].sinking) snap.tagged[tag] = rec; }
    return snap;
  }
  function rebuildStack(m, cursor, timers) {
    var stack = [{ list: m.objectives || [], i: cursor[0] || 0 }];
    for (var d = 1; d < cursor.length; d++) {
      var f = stack[d - 1], def = f.list[f.i];
      if (!def || def.type !== 'timer_wrap') break;
      var total = def.seconds || 60, rem = timers[d] != null ? Math.min(total, timers[d] + K.retryBonus) : total;
      stack.push({ list: def.objectives || [], i: cursor[d] || 0, timer: { remaining: rem, total: total, text: def.text || null }, def: def });
    }
    return stack;
  }
  function restorePlayer(sp) {
    var p = player(), g = game(), wd = GTP.AI && GTP.AI.wanted;
    if (wd && wd.clear) wd.clear();
    if (p.inVehicle) p.exitVehicle();
    g.debug.teleport(sp.x, sp.z);
    p.yaw = sp.yaw; p.moveYaw = sp.yaw; p.aimYaw = sp.yaw;
    p.hp = sp.hp > 0 ? sp.hp : p.maxHp; p.armor = sp.armor; p.money = sp.money;
    p.weapons = Object.assign({ fist: Infinity }, sp.weapons); p.ammo = copyAmmo(sp.ammo); p.weapon = p.weapons[sp.weapon] ? sp.weapon : 'fist';
    if (sp.wanted && wd && wd.set) wd.set(sp.wanted);
  }
  function spawnFromRecord(rec) {
    var v = new GTP.Vehicle({ x: rec.x, z: rec.z, type: rec.type, color: rec.color || undefined, wrap: rec.wrap || undefined, tag: rec.tag || null, persistent: true });
    v.y = rec.y != null ? rec.y : W().heightAt(rec.x, rec.z, 0); v.yaw = rec.yaw || 0; v.hp = Math.min(v.hp, rec.hp || v.hp); v.keep = !!rec.keep; v.snap();
    E().add(v);
    track(v, 'vehicle');
    return v;
  }

  // -------------------------------------------------------- the cursor --
  // objective types: the built-ins (H), the ones other modules registered (Missions.registerObjectiveType), and any left in
  // GTP.ObjectiveTypes by a file that loaded before this one (08b_bosses)
  var pluginTypes = {};
  function objectiveType(name) {
    if (pluginTypes[name]) return pluginTypes[name];
    var Q = GTP.ObjectiveTypes;
    if (Q && Q[name] && registerObjectiveType(name, Q[name])) return pluginTypes[name];
    return H[name] || null;
  }
  function registerObjectiveType(name, def) {
    if (!name || !def || (typeof def.check !== 'function' && typeof def.start !== 'function')) return false;
    pluginTypes[name] = Object.assign({ start: function () { }, check: function () { return null; } }, def);
    return true;
  }
  function frame() { return run.stack[run.stack.length - 1]; }
  function beginObjective() {
    for (var guard = 0; guard < 64; guard++) {
      var f = frame();
      if (f.i >= f.list.length) {
        if (run.stack.length === 1) { finishObjectives(); return; }
        run.stack.pop(); frame().i++; continue;
      }
      var def = f.list[f.i];
      if (!def) { f.i++; continue; }
      if (!Heist.objectiveRuns(def)) { f.i++; continue; }   // the other heist approach's objective (a timed block too)
      if (def.type === 'timer_wrap') {
        run.stack.push({ list: def.objectives || [], i: 0, timer: { remaining: def.seconds || 60, total: def.seconds || 60, text: def.text || null }, def: def });
        continue;
      }
      var h = objectiveType(def.type);
      if (!h) { U.reportError(new Error('unknown objective type ' + def.type), 'missions'); f.i++; continue; }
      try { run.checkpoint = takeSnapshot(); } catch (e) { U.reportError(e, 'missions.snapshot'); }
      run.obj = { def: def, h: h, c: { t: 0, failReason: null }, startedAt: simT() };
      try { h.start(def, run.obj.c, player()); } catch (e) { U.reportError(e, 'missions.start ' + def.type); }
      syncObjectiveState();
      objectiveGps();
      emit('objective', { mission: run.m, objective: def, index: run.stack[0].i, text: def.text || '' });
      return;
    }
  }
  function endObjective() {
    var o = run.obj; if (!o) return;
    run.obj = null;
    if (o.h.cleanup) { try { o.h.cleanup(o.def, o.c); } catch (e) { U.reportError(e, 'missions.cleanup'); } }
    clearObjMarkers();
  }
  function advanceObjective() {
    endObjective();
    frame().i++;
    beginObjective();
  }
  function syncObjectiveState() {
    var o = run && run.obj;
    state.objective = run ? run.stack[0].i : 0;
    state.phase = run ? run.phase : null;
    if (!o) { state.objectiveText = run && run.phase === 'outro' ? '' : state.objectiveText; state.progress = null; }
    else {
      var text = o.def.text || '', pr = o.h.progress ? o.h.progress(o.def, o.c, player()) : null;
      state.progress = pr;
      if (pr && pr.total != null && pr.n != null) text += ' (' + pr.n + '/' + pr.total + ')';
      var hint = o.h.hint ? o.h.hint(o.def, o.c, player()) : null;
      state.objectiveText = text; state.hint = hint;
    }
    var tf = null;
    for (var i = run ? run.stack.length - 1 : -1; i >= 0; i--) if (run.stack[i].timer) { tf = run.stack[i].timer; break; }
    state.timer = tf ? { remaining: tf.remaining, total: tf.total } : null;
  }
  function tickObjective(dt) {
    var o = run.obj, p = player(); if (!o || !p) return;
    o.c.t += dt;
    if (o.h.update) { try { o.h.update(o.def, o.c, p, dt); } catch (e) { U.reportError(e, 'missions.update ' + o.def.type); } }
    var res = null;
    try { res = o.h.check(o.def, o.c, p); } catch (e) { U.reportError(e, 'missions.check ' + o.def.type); }
    if (res === 'fail') { Missions.fail(o.c.failReason || o.def.type); return; }
    if (res === 'done') { objectiveDone(o); return; }
    // the timer of the innermost wrap
    for (var i = run.stack.length - 1; i >= 1; i--) {
      var f = run.stack[i]; if (!f.timer) continue;
      f.timer.remaining -= dt;
      if (f.timer.remaining <= 0) { f.timer.remaining = 0; Missions.fail('timer'); return; }
      break;
    }
  }
  function objectiveDone(o) {
    sfx('ui', player().x, player().z, 0.5);
    emit('objectiveDone', { mission: run.m, objective: o.def });
    advanceObjective();
  }
  function finishObjectives() {
    endObjective();
    run.phase = 'outro'; state.phase = 'outro'; state.timer = null; state.objectiveText = ''; state.progress = null; state.holdBar = null;
    cleanupEntities(run.entities, true);
    var m = run.m;
    showDialogue(m.outro || [], function () { if (run && run.m === m) completeRun(); });
  }

  // ------------------------------------------------------------- flow --
  function applyComplete(m, silent) {
    var oc = m.onComplete || {}, p = player(), CB = GTP.Combat;
    if (oc.setFlag) state.flags[oc.setFlag] = true;
    if (oc.setFlags) for (var i = 0; i < oc.setFlags.length; i++) state.flags[oc.setFlags[i]] = true;
    if (oc.takeWeapon && p && p.weapons[oc.takeWeapon] != null) {
      var tw = oc.takeWeapon; delete p.weapons[tw]; if (p.ammo) delete p.ammo[tw]; if (p.weapon === tw) p.weapon = 'fist';
      if (!silent) toast((CB && CB.weaponName ? CB.weaponName(tw) : tw) + ' returned');
    }
    if (oc.unlockWeapon && p) {
      var id = oc.unlockWeapon, ammo = K.weaponAmmo[id] || 30;
      if (ammo === Infinity || (CB && CB.WEAPONS && CB.WEAPONS[id] && CB.WEAPONS[id].melee)) p.weapons[id] = Infinity;
      else p.weapons[id] = (p.weapons[id] || 0) + ammo;
      p.weapon = id;
      if (!silent) toast('Unlocked: ' + (CB && CB.weaponName ? CB.weaponName(id) : id) + (ammo === Infinity ? '' : ' (+' + ammo + ')'));
    }
    if (oc.giveMoney && p) { p.money += oc.giveMoney | 0; if (!silent) textFx('+' + U.fmtMoney(oc.giveMoney), p.x, p.y + 2.6, p.z, '#9dff3c', 1.6); }
    if (oc.subs && !silent) Missions.addSubs(oc.subs | 0, 'mission:' + m.id);
  }
  // the weapons a REPLAY borrowed go back (GDD_EXPANSION §6.5)
  function restoreWeapons(r) {
    var p = player(); if (!p || !r || !r.weaponsBefore) return;
    p.weapons = Object.assign({ fist: Infinity }, r.weaponsBefore.weapons); p.ammo = copyAmmo(r.weaponsBefore.ammo); p.weapon = p.weapons[r.weaponsBefore.weapon] ? r.weaponsBefore.weapon : 'fist';
  }
  var DEFAULT_AFTER = { m04_hit: 'cs_act2', m11_trustless: 'cs_act3', m12_memo: 'cs_twist', m15a_primetime: 'cs_ending_a', m15b_liveread: 'cs_ending_b' };
  var pendingCut = null;   // {id, t, then}: an act cutscene waits for the MISSION PASSED card
  function cutsceneAfter(m) {
    var X = expansion(), oc = m.onComplete || {};
    var id = oc.playCutscene || (X.cutsceneAfter && X.cutsceneAfter[m.id]) || DEFAULT_AFTER[m.id] || null;
    var Cs = GTP.Cutscenes;
    if (!id || !Cs || !Cs.scriptFor || !Cs.scriptFor(id) || state.flags['cs_' + id]) return null;
    return id;
  }
  function completeRun() {
    var m = run.m, p = player(), replay = !!run.replay, reward = replay ? 0 : Heist.payout(m, m.reward | 0), r = run;
    cleanupEntities(run.entities, true);
    clearObjMarkers();
    if (p && reward) { p.money += reward; textFx('+' + U.fmtMoney(reward), p.x, p.y + 2.2, p.z, '#9dff3c', 1.8); sfx('cash', p.x, p.z, 0.9); }
    sfx('mission', p ? p.x : 0, p ? p.z : 0, 1);
    var secs = Math.round(run.playT * 10) / 10, best = state.bestTimes[m.id];
    if (best == null || secs < best) state.bestTimes[m.id] = secs;
    state.completed.add(m.id);
    if (!replay) {
      applyComplete(m, false);
      if (p && p.stats) p.stats.missions = (p.stats.missions || 0) + 1;
      if (m.reward) Missions.addSubs((m.reward | 0) * K.subsPerReward, 'mission:' + m.id);
    } else restoreWeapons(r);
    var id = m.id; run = null;
    state.active = null; state.mission = null; state.objectiveText = ''; state.progress = null; state.timer = null; state.phase = null; state.hint = null; state.holdBar = null;
    var sub = m.title + (reward ? '  ' + U.fmtMoney(reward) : '') + (replay ? '  REPLAY ' + U.fmtTime(secs) + (best != null && secs < best ? ' (best)' : '') : '');
    if (!callUI('card', 'passed', 'MISSION PASSED', sub)) toast('MISSION PASSED: ' + sub);
    emit('complete', { mission: m, id: id, reward: reward, replay: replay, time: secs, best: state.bestTimes[m.id] });
    refreshAvailable(true);
    var cs = replay ? null : cutsceneAfter(m), ending = isEnding(id);
    var finish = function () { if (ending) { emit('ending', { id: id }); callUI('credits', id); } };
    if (cs) pendingCut = { id: cs, t: K.cutsceneAfterDelay, then: finish };
    else finish();
    clearGps();
    if (storyMission(m) && !replay) storyAfterComplete(m, replay); else storyGps(true);   // after a side job or a replay: back to the story
  }
  var FAIL_TEXT = {
    player_dead: 'You got ratio\'d.', busted: 'You got deplatformed.', timer: 'Out of time.', target_escaped: 'You lost them.',
    spotted: 'They saw you.', target_lost: 'Your lead is down.', abort: 'Mission abandoned.', minigame: 'You lost the room.',
    passenger_lost: 'Your passenger is gone.', target_destroyed: 'You were supposed to stop it, not end it.', stunt_failed: 'The landing was a take. A bad one.',
    race_lost: 'Slow is a take.', dnf: 'Did not finish. Did not read.'
  };
  function failText(reason) {
    if (!reason) return '';
    if (reason.indexOf('vehicle_lost:') === 0) { var tag = reason.slice(13), v = run && run.tagged[tag]; return 'The ' + (v ? vehicleName(v.type) : (tag === 'podvan' ? 'pod van' : tag)) + ' is gone.'; }
    if (reason.indexOf('minigame:') === 0) return reason.slice(9) === 'ratio' ? 'You were the ratio.' : 'Minds changed: zero. Crowd: theirs.';
    return FAIL_TEXT[reason] || String(reason);
  }
  function teardownRun() {
    cancelDialogue(); cancelMinigame();
    if (GTP.Cutscenes && GTP.Cutscenes.active && GTP.Cutscenes.cancel) { try { GTP.Cutscenes.cancel(); } catch (e) { U.reportError(e, 'cutscenes.cancel'); } }
    endObjective();
    cleanupEntities(run.entities, false);
    clearObjMarkers();
    if (run.replay) restoreWeapons(run);
    var g = game(); if (g && g.state === 'cutscene') g.setState('playing');
    var Rd = GTP.Render; if (Rd && Rd.rig && Rd.rig.target && player()) Rd.rig.target(player(), true);
    run = null;
    state.active = null; state.mission = null; state.objectiveText = ''; state.progress = null; state.timer = null; state.phase = null; state.hint = null; state.minigame = null; state.holdBar = null;
  }
  // a tagged vehicle matters while the running objective or a later one still names it ('spawned:<tag>', a {tag} target or a spawn
  // anchored on it); once the mission is done with the car (the jet truck rolling off the beach after its jump, the outro) losing it
  // is no failure
  function tagNeeded(tag) {
    function refs(o) {
      if (!o) return false;
      if (o.vehicle === 'spawned:' + tag) return true;
      if (o.target && o.target.tag === tag) return true;
      if (o.spawn && o.spawn.around && o.spawn.around.tag === tag) return true;
      if (o.type === 'timer_wrap' && o.objectives) for (var j = 0; j < o.objectives.length; j++) if (refs(o.objectives[j])) return true;
      return false;
    }
    if (run.obj && refs(run.obj.def)) return true;
    for (var k = 0; k < run.stack.length; k++) { var f = run.stack[k]; if (!f || !f.list) continue; for (var i = f.i + 1; i < f.list.length; i++) if (refs(f.list[i])) return true; }
    return false;
  }
  function checkFailRules() {
    var rules = run.m.failOn || [];
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (typeof r !== 'string') continue;
      if (r.indexOf('vehicle_lost:') === 0) { var tag = r.slice(13), v = run.tagged[tag]; if (v && vehicleLost(v) && tagNeeded(tag)) { Missions.fail(r); return true; } }
    }
    return false;
  }
  // the intro: the player faces the giver, the camera eases to a two-shot over the player's shoulder
  function cutsceneCamera(giver) {
    var pl = player(), Rd = GTP.Render; if (!pl || !giver || !Rd || !Rd.rig) return;
    var yaw = U.dirToYaw(giver.x - pl.x, giver.z - pl.z);
    pl.yaw = yaw; pl.aimYaw = yaw; pl.moveYaw = yaw;
    giver.yaw = U.dirToYaw(pl.x - giver.x, pl.z - giver.z);
    // the rig orbits the giver; swinging it 30 degrees off the player's line puts the player's shoulder at the frame edge.
    // When a wall or a parked car sits where that camera would go (a giver met along a facade, a van at the kerb), the
    // other shoulder is tried, then wider angles, and the clearest view wins: never a frame full of flat wall or car roof
    var CAM = C.CAMERA, dist = (CAM.footDist || 4.2) * (CAM.closeScale || 0.5), eyeY = giver.y + 1.3, Wd = W();
    var offs = [0.52, -0.52, 1.0, -1.0, 0, 1.5, -1.5], best = 0.52, bestScore = -1e9, i, k;
    for (i = 0; i < offs.length; i++) {
      var d = U.yawToDir(yaw + offs[i]), cx = giver.x - d.x * dist, cz = giver.z - d.z * dist;
      var hit = Wd.raycastBuildings(giver.x, eyeY, giver.z, -d.x, 0, -d.z, dist + 0.6), clear = hit ? hit.t : dist + 0.6;
      var near = E().hash.query(cx, cz, 4, scratch), carBlock = false;
      for (k = 0; k < near.length; k++) { var o = near[k]; if (o.kind === 'vehicle' && !o.removed && o.pushCircle && o.pushCircle(cx, cz, 0.6)) { carBlock = true; break; } }
      var score = clear - (carBlock ? 10 : 0) - Math.abs(offs[i]) * 0.05;
      if (score > bestScore) { bestScore = score; best = offs[i]; }
    }
    Rd.rig.yaw = yaw + best; Rd.rig.pitch = 0.1;
    if (Rd.rig.target) Rd.rig.target(giver, true);
  }
  function beginPlay() {
    if (!run) return;
    var Rd = GTP.Render, pl = player();
    if (Rd && Rd.rig && Rd.rig.target && pl) Rd.rig.target(pl, true);
    if (run.giver && !run.giver.removed) { releasePed(run.giver, false); run.giver = null; }
    if (run.kip && !run.kip.removed) { releasePed(run.kip, false); run.kip = null; }
    run.phase = 'play'; state.phase = 'play';
    beginObjective();
  }
  function newRun(m, opts) {
    var p = player();
    return { id: m.id, m: m, stack: [{ list: m.objectives || [], i: 0 }], obj: null, entities: [], tagged: {}, phase: 'intro', t: 0, giver: null, kip: null,
      replay: !!(opts && opts.replay), playT: 0, retries: 0, equipped: [], checkpoint: null, skipCutsceneOnce: false,
      weaponsBefore: (opts && opts.replay && p) ? { weapons: Object.assign({}, p.weapons), ammo: copyAmmo(p.ammo), weapon: p.weapon } : null };
  }
  // the intro: a cs_intro_<id> script (GDD_EXPANSION §4.3) when the content has one, else the over-the-shoulder two-shot
  function playIntro(m, intro) {
    var Cs = GTP.Cutscenes, id = m.cutsceneIntro || ('cs_intro_' + m.id);
    var script = Cs && Cs.scriptFor ? Cs.scriptFor(id) : null;
    if (script && Cs.play) {
      var reuse = {}; if (run.giver) reuse[run.giver.castId] = run.giver; if (run.kip) reuse.kip = run.kip;
      if (run.giver) cutsceneCamera(run.giver);   // the rig rests on the giver behind the free camera, and is where play resumes from
      var ok = false;
      try { ok = Cs.play(script, beginPlay, { lines: intro, mission: m, reuse: reuse }); } catch (e) { U.reportError(e, 'missions.intro'); }
      if (ok) return;
    }
    if (!intro.length) { beginPlay(); return; }
    cutsceneCamera(run.giver); showDialogue(intro, beginPlay);
  }

  // ------------------------------------------------- subscribers (GDD_EXPANSION §5.8) --
  // player.subs is the meta counter (saved). Story missions pay reward x 5, strands their listed amounts, chaos a capped trickle.
  var SUB_TIERS = [
    { subs: 0, name: 'Pre-Viral', perk: null, line: 'Minds changed so far: zero.' },
    { subs: 5000, name: 'A Voice', perk: 'group_rate', line: 'Group rate: taxi fares and Sponsor Runs pay +25%.' },
    { subs: 25000, name: 'Verified-ish', perk: 'comped_respray', line: 'Comped respray: Gus sprays stars for $50 each.' },
    { subs: 75000, name: 'Main Character', perk: 'sponsor_discount', line: '25% off at Both Sides Arms. The hospital keeps its hands off your weapons.' },
    { subs: 150000, name: 'Pundit-Industrial', perk: 'plot_armor', line: 'Plot armor: you come back with 50 armor.' },
    { subs: 300000, name: 'The Memo', perk: 'infinite_sidebar', line: 'Infinite sidebar: the pistol reloads from nothing.' }
  ];
  var subsTier = 0, baseSpray = null, perkT = 0, stashedWeapons = null;
  var chaos = { t: 0, budget: K.chaosCapPerMinute };
  // the content's tier table (same numbers, its own perk lines) replaces the fallback when present
  function loadTiers() {
    var T = expansion().subscriberTiers; if (!Array.isArray(T) || T.length < 2) return;
    SUB_TIERS.length = 0;
    for (var i = 0; i < T.length; i++) SUB_TIERS.push({ subs: T[i].subs | 0, name: T[i].name, perk: T[i].perk || null, line: T[i].perkText || T[i].line || '' });
    SUB_TIERS.sort(function (a, b) { return a.subs - b.subs; });
  }
  function tierFor(n) { var t = 0; for (var i = 0; i < SUB_TIERS.length; i++) if (n >= SUB_TIERS[i].subs) t = i; return t; }
  function activePerks() { var out = []; for (var i = 1; i <= subsTier && i < SUB_TIERS.length; i++) out.push(SUB_TIERS[i].perk); return out; }
  function hasPerk(id) { return activePerks().indexOf(id) >= 0; }
  function addSubs(n, why) {
    var p = player(); n = n | 0;
    if (!p || n <= 0) return 0;
    p.subs = (p.subs | 0) + n;
    textFx('+' + (n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'K' : n) + ' subs', p.x, p.y + 2.7, p.z, '#ff3fa4', 1.4);
    GTP.Events.emit('subs', { n: n, why: why || null, total: p.subs });
    var t = tierFor(p.subs);
    if (t > subsTier) {
      subsTier = t;
      var tier = SUB_TIERS[t];
      state.flags['tier_' + tier.perk] = true;
      applyPerks();
      if (!callUI('card', 'passed', 'NEW TIER: ' + tier.name.toUpperCase(), tier.line)) toast('NEW TIER: ' + tier.name + '. ' + tier.line);
      callUI('ticker', 'TAKESWORTH REACHES ' + tier.name.toUpperCase() + ' STATUS; MINDS CHANGED UNCHANGED');
      sfx('mission', p.x, p.z, 0.8);
      GTP.Events.emit('subs:tier', { tier: t, name: tier.name, perk: tier.perk });
    }
    return p.subs;
  }
  // the perks the current tier grants (re-applied on load through Missions.syncSubs)
  function applyPerks() {
    if (baseSpray == null) baseSpray = C.WANTED.sprayCostPerStar;
    C.WANTED.sprayCostPerStar = subsTier >= 2 ? Math.min(baseSpray, 50) : baseSpray;
    var CB = GTP.Combat;
    if (CB && CB.shop && !CB.shop._subsHook) {
      CB.shop._subsHook = true;
      var prev = CB.shop.discountHook;
      CB.shop.discountHook = function (p) {
        var d = 0;
        try { if (typeof prev === 'function') d += prev(p) || 0; } catch (e) { /* another hook's problem */ }
        // Content.expansion.shop.discount already counts tier 3 and the memo discount, and Combat adds both: only one of them
        // may (QA-STR-08)
        var X = expansion().shop;
        if (X && typeof X.discount === 'function') return d;
        if (subsTier >= 3) d += 0.25;
        if (state && state.flags && state.flags.memo_discount) d += 0.15;
        return d;
      };
    }
  }
  function tickPerks(dt) {
    chaos.t += dt;
    if (chaos.t >= 60) { chaos.t = 0; chaos.budget = K.chaosCapPerMinute; }
    perkT += dt;
    if (perkT < 1) return;
    perkT = 0;
    var p = player(), CB = GTP.Combat;
    if (p && subsTier >= 5 && CB && CB.ammo && p.weapons.pistol > 0 && p.weapons.pistol !== Infinity) {
      var a = CB.ammo(p, 'pistol');
      if (a && a.reserve < 12 && CB.giveAmmo) CB.giveAmmo(p, 'pistol', 12, false);
    }
  }
  function chaosSubs(n, why) { if (chaos.budget <= 0) return; n = Math.min(n, chaos.budget); chaos.budget -= n; addSubs(n, why); }

  // ======================================================================================== GTP.Story ==
  // The story you cannot miss (PLAN_V03 "story"): the chain in order, the next mission and where it is, the GPS to it after
  // every mission (gps:set {x, z, label, kind:'story'}), the next giver's phone call (phone:call {from, lines}), chapter cards
  // on act changes (chapter {act, title}), and the new game's hand-off from the opening cutscene into the first mission.
  var ACT_TITLES = { 1: 'Folding Table', 2: 'Four Clients', 3: 'The Monday Memo' };
  var ACT_STARTS = { m00_intro: 1, m05_peer: 2, m12_memo: 3 };   // GDD §3: the act cutscenes play after m04 and m11
  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  var CALL_TEMPLATES = [
    'It\'s me. {landmark}. The take is cooling and so is my patience. It\'s called {title}.',
    'You\'re trending, which is bad, which is good. Get to {landmark}. {title}. Don\'t make it a whole thing.',
    'Don\'t talk, walk. {landmark}. The GPS knows. The GPS has always known. {title}.',
    'Pick up. You did. Great. {landmark}, now, for {title}. Bring the table energy, not the table.'
  ];
  function parity() { return (GTP.Content && GTP.Content.parity) || {}; }
  // story = the base missions, the expansion's chain and the content track's parity missions. Not story: anything flagged
  // (story:false, side, stranger, strand, kind 'side' / 'stranger' / 'strand'), the strangers module's list, an expansion
  // mission outside the chain (a side mission registered the expansion's way), test missions
  var SIDE_KINDS = { side: 1, stranger: 1, strangers: 1, strand: 1, oddjob: 1 };
  function storyMission(m) {
    if (!m || registry[m.id] || sideIds[m.id]) return false;
    if (m.story === true) return true;
    if (m.story === false || m.side || m.stranger || m.strand || SIDE_KINDS[m.kind] || SIDE_KINDS[m.category]) return false;
    // the content track appends its parity missions to expansion.missions too: those are story whatever the chain says
    if (parityMissions().indexOf(m) >= 0) return true;
    var X = expansion(), chain = storyChain();
    if (chain.length && chain.indexOf(m.id) < 0 && (X.missions || []).indexOf(m) >= 0) return false;
    return true;
  }
  // the 35-mission chain of the v0.3 content (parity.chain) when it is there, else the expansion's 25
  function storyChain() { var pc = parity().chain; return Array.isArray(pc) && pc.length ? pc : (expansion().chain || []); }
  var _order = null, _orderKey = null;
  // the story missions in play order: a topological sort over `requires`, ranked by the content's chain (new missions without
  // a rank slot in wherever their prerequisites put them)
  function storyOrder() {
    var all = allMissions(), chain = storyChain(), key = _allKey + '|' + chain.length;
    if (_order && _orderKey === key) return _order;
    var list = all.filter(storyMission), ids = {}, i;
    for (i = 0; i < list.length; i++) ids[list[i].id] = list[i];
    function rank(m) { var k = chain.indexOf(m.id); return k >= 0 ? k : 1000 + list.indexOf(m); }
    var placed = {}, out = [], left = list.slice();
    for (var guard = 0; left.length && guard < 1000; guard++) {
      var best = -1, br = 1e9;
      for (i = 0; i < left.length; i++) {
        var req = left[i].requires || [], ok = true;
        for (var k = 0; k < req.length; k++) if (ids[req[k]] && !placed[req[k]]) { ok = false; break; }
        if (ok && rank(left[i]) < br) { br = rank(left[i]); best = i; }
      }
      if (best < 0) best = 0;   // a cycle in the data: keep going in list order
      var m = left.splice(best, 1)[0]; placed[m.id] = true; out.push(m);
    }
    _order = out; _orderKey = key;
    return out;
  }
  // chapters: GTP.Content.parity.actTitles {act: title}, and parity.chapters as [{act, title, subtitle?, first|from?}] or
  // {act: title}; the GDD's three acts otherwise. The first entry of an act names it and says where it starts (later ones of
  // the same act, the heist interlude and the finale, are not act changes). The card draws "ACT I" itself, so an "Act I: "
  // prefix in the title is dropped.
  function bareTitle(t) { return t ? String(t).replace(/^\s*act\s+[ivx\d]+\s*[:.\-]\s*/i, '') : t; }
  function chapterTable() {
    var P = parity(), T = P.chapters, AT = P.actTitles, out = { titles: {}, starts: {}, subtitles: {} };
    if (Array.isArray(T)) T.forEach(function (c) {
      if (!c) return; var a = c.act | 0; if (!a || out.titles[a]) return;
      if (c.title) out.titles[a] = bareTitle(c.title);
      if (c.subtitle) out.subtitles[a] = c.subtitle;
      var from = c.first || c.from || c.start; if (from) out.starts[from] = a;
    });
    else if (T && typeof T === 'object') for (var k in T) { var a2 = parseInt(String(k).replace(/\D/g, ''), 10); if (a2) out.titles[a2] = bareTitle(typeof T[k] === 'string' ? T[k] : (T[k] && T[k].title) || null); }
    if (AT && typeof AT === 'object') for (var k2 in AT) { var a3 = k2 | 0; if (a3 && AT[k2]) out.titles[a3] = bareTitle(AT[k2]); }
    return out;
  }
  function chapterTitle(act) { var t = chapterTable().titles[act]; return t || ACT_TITLES[act] || ('Act ' + act); }
  function actOf(m) {
    if (!m) return 1;
    var order = storyOrder(), starts = chapterTable().starts, act = 1;
    for (var i = 0; i < order.length; i++) {
      var o = order[i];
      if (typeof o.act === 'number' && o.act > 0) act = o.act; else if (starts[o.id]) act = starts[o.id]; else if (ACT_STARTS[o.id]) act = ACT_STARTS[o.id];
      if (o.id === m.id) return act;
    }
    return typeof m.act === 'number' ? m.act : act;
  }
  function requiresMet(m) { var req = m.requires || []; for (var k = 0; k < req.length; k++) if (!state.completed.has(req[k])) return false; return true; }
  // cached per (order, completed count): the markers ask every step
  var _next = null, _nextKey = null;
  function storyNextMission() {
    var order = storyOrder(), key = _orderKey + '|' + state.completed.size + '|' + (state === Missions.state ? 1 : 0);
    if (_nextKey === key && state.completed === _nextSet) return _next;
    _next = null;
    for (var i = 0; i < order.length; i++) { var m = order[i]; if (!state.completed.has(m.id) && requiresMet(m)) { _next = m; break; } }
    _nextKey = key; _nextSet = state.completed;
    return _next;
  }
  var _nextSet = null;
  function storyInfo(m) {
    if (!m) return null;
    var pt = null;
    for (var i = 0; i < avail.length; i++) if (avail[i].id === m.id) pt = { x: avail[i].x, z: avail[i].z, y: avail[i].y };
    if (!pt) pt = resolvePoint({ landmark: m.marker });
    var lm = W().landmark ? W().landmark(m.marker) : null, cast = castOf(m.giver), act = actOf(m);
    var lmName = lm ? ((GTP.UI && GTP.UI.landmarkLabel) ? GTP.UI.landmarkLabel(lm) : (lm.name || m.marker)) : m.marker;
    return { missionId: m.id, title: m.title, giver: m.giver || null, giverName: cast ? cast.name : (m.giver || ''), landmark: m.marker, landmarkName: lmName,
      x: pt ? pt.x : 0, z: pt ? pt.z : 0, y: pt ? pt.y : 0, act: act, chapter: chapterTitle(act) };
  }
  var pendingCall = null;   // {missionId, t}: the next giver's call, waiting for the cards and cutscenes to clear
  var lastGps = null;
  function gpsPayload(x, z, label, kind, extra) {
    var pl = player(), Wd = W(), route = null, from = pl ? outsidePos(pl) : null;   // indoors: the line starts at the door
    if (from && Wd.route) { try { route = Wd.route(from.x, from.z, x, z) || null; } catch (e) { U.reportError(e, 'story.route'); route = null; } }
    return Object.assign({ x: x, z: z, label: label, kind: kind, route: route }, extra || {});
  }
  function setGps(payload) {
    lastGps = payload;
    Story.gpsTarget = payload;
    GTP.Events.emit('gps:set', payload);
  }
  function clearGps() { if (!lastGps) return; lastGps = null; Story.gpsTarget = null; GTP.Events.emit('gps:clear', {}); }
  // the objective's own GPS during a mission: a fixed target (a door, a drop-off) gets the line, a moving one the arrow only
  var GPS_TYPES = { goto: 1, drive_to: 1, interior: 1, shop: 1, buy: 1, range: 1 };
  function objectiveGps() {
    var o = run && run.obj; if (!o) return;
    var t = null;
    // inside a room (GTP.Interiors) there are no streets to route along: the HUD arrow does the pointing
    var indoors = !!(GTP.Interiors && GTP.Interiors.active);
    if (!indoors && GPS_TYPES[o.def.type] && o.h.target) { try { t = o.h.target(o.def, o.c, player()); } catch (e) { t = null; } }
    if (t) setGps(gpsPayload(t.x, t.z, o.def.text || run.m.title, 'objective', { missionId: run.id }));
    else clearGps();
  }
  function storyGps(force) {
    if (run) return null;
    var n = storyInfo(storyNextMission());
    if (!n) { clearGps(); return null; }
    if (!force && lastGps && lastGps.kind === 'story' && lastGps.missionId === n.missionId) return lastGps;
    var p = gpsPayload(n.x, n.z, n.title + ': ' + n.landmarkName, 'story', { missionId: n.missionId, giver: n.giver, landmark: n.landmark });
    setGps(p);
    return p;
  }
  function callLines(m) {
    var calls = parity().calls || {}, raw = calls[m.id], giver = m.giver || 'sloane', lines = [];
    if (raw && !Array.isArray(raw) && typeof raw === 'object') { if (raw.from) giver = raw.from; raw = raw.lines; }
    if (typeof raw === 'string') raw = [raw];
    if (Array.isArray(raw)) for (var i = 0; i < raw.length; i++) { var l = raw[i]; if (!l) continue; lines.push(typeof l === 'string' ? { who: giver, text: l } : { who: l.who || l.from || giver, text: l.text || '' }); }
    if (!lines.length) {
      var info = storyInfo(m), h = 0; for (i = 0; i < m.id.length; i++) h = (h * 31 + m.id.charCodeAt(i)) | 0;
      var tpl = CALL_TEMPLATES[Math.abs(h) % CALL_TEMPLATES.length];
      lines.push({ who: giver, text: tpl.replace('{landmark}', info ? info.landmarkName : m.marker).replace('{title}', m.title) });
    }
    return { from: giver, lines: lines.map(function (l) { var e = enrich(l); return { who: e.who, name: e.name, color: e.color, text: e.text }; }) };
  }
  function placeCall(id) {
    var m = missionById(id); if (!m || state.completed.has(id)) return false;
    var c = callLines(m), cast = castOf(c.from), info = storyInfo(m), pl = player();
    state.flags['called_' + id] = true;
    var payload = { from: c.from, name: cast ? cast.name : c.from, lines: c.lines, missionId: id, title: m.title, landmark: info ? info.landmark : m.marker, landmarkName: info ? info.landmarkName : null };
    Story.lastCall = payload;
    if (pl) sfx('phone', pl.x, pl.z, 0.8);
    GTP.Events.emit('phone:call', payload);
    // nobody draws the phone (the UI track not merged): the lines go to the ticker / toasts so the call still lands
    if (!hasListener('phone:call') && !callUI('phoneCall', payload)) for (var i = 0; i < c.lines.length && i < 3; i++) toast(c.lines[i].name + ' (phone): ' + c.lines[i].text);
    return true;
  }
  function scheduleCall(id) { if (!id || state.flags['called_' + id]) return; pendingCall = { missionId: id, t: K.callDelay }; }
  function tickStory(dt) {
    var g = game(); if (!g) return;
    if (pendingCall) {
      var Cs = GTP.Cutscenes, busy = run || pendingCut || dlg.active || mg.active || (Cs && Cs.active) || g.state !== 'playing' || (g.loading && g.loading.active);
      if (!busy) { pendingCall.t -= dt; if (pendingCall.t <= 0) { var pc = pendingCall; pendingCall = null; placeCall(pc.missionId); } }
    }
  }
  function maybeChapter(m) {
    if (!storyMission(m)) return null;
    var act = actOf(m);
    if (act <= (state.flags.story_act | 0)) return null;
    state.flags.story_act = act;
    var c = { act: act, title: chapterTitle(act), subtitle: chapterTable().subtitles[act] || null, roman: ROMAN[act] || String(act), missionId: m.id };
    Story.chapter = { act: act, title: c.title };
    GTP.Events.emit('chapter', c);
    if (!hasListener('chapter') && !callUI('chapter', c)) toast('ACT ' + c.roman + ': ' + c.title.toUpperCase());
    return c;
  }
  // after a story mission: the GPS to the next one, its giver's call once the cards clear
  function storyAfterComplete(m, replay) {
    if (replay || !storyMission(m)) return;
    var n = storyNextMission();
    Story.refresh();
    if (!n) { clearGps(); GTP.Events.emit('story:done', { last: m.id }); return; }
    // finished inside a room (m01c ends at Merle's counter): the GPS waits for the street, where its line and distance mean
    // something (from the armory it read TURN AROUND, 4.1 km)
    if (GTP.Interiors && GTP.Interiors.active) { clearGps(); gpsAfterExit = true; }
    else storyGps(true);
    scheduleCall(n.id);
  }
  var gpsAfterExit = false;
  GTP.Events.on('interior:exit', function () { if (gpsAfterExit) { gpsAfterExit = false; if (!run && state) storyGps(true); } });
  var Story = GTP.Story = {
    chapter: { act: 1, title: ACT_TITLES[1] },
    gpsTarget: null,
    lastCall: null,
    // {missionId, title, giver, giverName, landmark, landmarkName, x, z, y, act, chapter} | null when the story is done
    next: function () { return state ? storyInfo(storyNextMission()) : null; },
    order: function () { return storyOrder().map(function (m) { return m.id; }); },
    actOf: function (id) { return actOf(missionById(id)); },
    chapterTitle: chapterTitle,
    progress: function () { var o = storyOrder(), n = 0; for (var i = 0; i < o.length; i++) if (state.completed.has(o[i].id)) n++; return { done: n, total: o.length }; },
    refresh: function () { var n = storyNextMission(), last = null; if (!n) { var o = storyOrder(); last = o[o.length - 1]; } var act = actOf(n || last); Story.chapter = { act: act, title: chapterTitle(act) }; return Story.chapter; },
    // re-point the GPS at the next story mission (after a load, a fail, an abort)
    gps: function (force) { return storyGps(force !== false); },
    call: function (id) { var n = id || (storyNextMission() || {}).id; return n ? placeCall(n) : false; },
    pendingCall: function () { return pendingCall; },
    // the new game's hand-off: the first (next) story mission starts at once, the player at its door when far.
    // opts: {teleport: false}
    begin: function (opts) {
      opts = opts || {};
      if (run || !state) return false;
      var m = storyNextMission(); if (!m) return false;
      var info = storyInfo(m), pl = player(), g = game();
      if (pl && info && opts.teleport !== false && U.dist2d(pl.x, pl.z, info.x, info.z) > 40 && g && g.debug) g.debug.teleport(info.x, info.z);
      var ok = Missions.start(m.id);
      if (!ok) storyGps(true);
      GTP.Events.emit('story:begin', { missionId: m.id, started: ok });
      return ok;
    },
    reset: function () { pendingCall = null; lastGps = null; gpsAfterExit = false; Story.gpsTarget = null; Story.lastCall = null; Story.chapter = { act: 1, title: chapterTitle(1) }; }
  };

  // story beacons: a tall light over every mission marker so a door is found from 200 m and more (the next story mission's is
  // brighter); one shared geometry, a material per marker (removeMarker disposes materials and unshared geometry)
  var beaconGeo = null;
  function addBeacon(grp, color) {
    var T = window.THREE; void color; if (!grp || !T || (grp.userData && grp.userData.beacon)) return;
    try {
      var h = K.beaconHeight;
      if (!beaconGeo) { beaconGeo = new T.CylinderGeometry(0.45, 1.25, h, 12, 1, true); beaconGeo.translate(0, h / 2 + 1.5, 0); beaconGeo.userData.shared = true; }
      // normal blending: an additive blue column vanished against the dusk sky
      var mat = new T.MeshBasicMaterial({ color: 0x5aa0ff, transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide, fog: false });
      var beam = new T.Mesh(beaconGeo, mat); beam.frustumCulled = false; beam.renderOrder = 7; beam.name = 'beacon';
      grp.add(beam);
      grp.userData = grp.userData || {}; grp.userData.beacon = beam;
    } catch (e) { U.reportError(e, 'story.beacon'); }
  }

  // ------------------------------------------------------------- API --
  var Missions = GTP.Missions = {
    K: K,
    state: null,
    init: function () {
      if (run) { try { endObjective(); } catch (e) { /* the objective's own cleanup (event listeners) */ } try { cleanupEntities(run.entities, false); } catch (e) { /* entities may be gone */ } }
      run = null; lastFail = null; pendingCut = null; mrng = GTP.rng.fork(0x3155);
      dlg.active = false; dlg.queue = []; dlg.current = null; dlg.done = null; dlg.restore = null; dlg.uiDriven = false;
      mg.active = null; mg.uiDriven = false;
      for (var i = 0; i < avail.length; i++) { dropMesh(avail[i].mesh); avail[i].giver = null; avail[i].kip = null; }
      avail.length = 0; availKey = null; availT = 0; lastPos.set = false;
      clearObjMarkers();
      _all = null;
      try { applyRetune(); } catch (e) { U.reportError(e, 'missions.retune'); }
      state = Missions.state = freshState();
      stepN = 0;
      subsTier = 0; chaos.t = 0; chaos.budget = K.chaosCapPerMinute;
      loadTiers();
      applyPerks();
      pendingCall = null; _order = null;
      Heist.reset(); Story.reset();
      var Q = GTP.ObjectiveTypes; if (Q) for (var qn in Q) registerObjectiveType(qn, Q[qn]);
    },
    update: function (dt) {
      if (!state) Missions.init();
      var g = game(), p = player();
      if (!g || !p) return;
      stepN++; pathBudget = 1;
      try {
        availT += dt;
        if (availT >= 1 || availKey === null) { availT = 0; refreshAvailable(false); }
        updateDialogue(dt);
        if (mg.active && !mg.uiDriven && K.minigameFallback > 0) {
          mg.active.t += dt;
          if (mg.active.t >= K.minigameFallback) { toast('(minigame placeholder: you win)'); Missions._resolveMinigame(true); }
        }
        if (run) {
          run.t += dt;
          if (g.state === 'playing' && !dlg.active && !mg.active) {
            if (run.phase === 'play') run.playT += dt;   // the best-time clock: objectives only, dialogue and minigames paused
            if (!checkFailRules() && run && run.obj) tickObjective(dt);
            if (run && (stepN % 6) === 0) syncObjectiveState();
          }
        } else if (g.state === 'playing') updateAvailable(dt);
        tickStory(dt);
        if (lastFail && !run && g.state === 'playing' && simT() - (lastFail.at || 0) > K.retryExpire) lastFail = null;   // a stale RETRY offer expires
        if (pendingCut && !run && g.state === 'playing') {
          pendingCut.t -= dt;
          if (pendingCut.t <= 0) { var pc = pendingCut; pendingCut = null; if (!(GTP.Cutscenes && GTP.Cutscenes.playOnce && GTP.Cutscenes.playOnce(pc.id, pc.then))) pc.then(); }
        }
        if (g.state === 'playing' && stepN % K.brainTick === 0) tickBrains(dt * K.brainTick);
        if (GTP.Strands && GTP.Strands.drivers && (g.state === 'playing' || g.state === 'cutscene')) GTP.Strands.drivers.update(dt);   // chauffeured cars keep steering through a cutscene
        tickPerks(dt);
        animateMarkers(dt);
      } catch (e) { U.reportError(e, 'missions.update'); }
    },
    // id -> true when started. opts: {skipIntro, replay}
    start: function (id, opts) {
      opts = opts || {};
      if (run) return false;
      var m = missionById(id); if (!m) return false;
      var p = player(), g = game();
      if (!p) return false;
      // a start from the pause menu (the phone's REPLAY / MISSIONS rows) closes the pause first, so the intro plays (QA-C1-09)
      if (g && g.state === 'paused') g.setState('playing');
      if (GTP.Strands && GTP.Strands.active && GTP.Strands.active() && GTP.Strands.end) GTP.Strands.end('mission');
      if (pendingCall && pendingCall.missionId === m.id) pendingCall = null;   // walked in before the phone rang
      run = newRun(m, opts);
      if (!opts.replay) lastFail = null;
      state.active = m.id; state.mission = m; state.objective = 0; state.objectiveText = ''; state.progress = null; state.timer = null; state.phase = 'intro'; state.holdBar = null;
      // the giver at this door becomes the intro actor; the other markers go dark
      for (var i = 0; i < avail.length; i++) {
        var mk = avail[i];
        if (mk.id === m.id) { run.giver = mk.giver; run.kip = mk.kip; mk.giver = null; mk.kip = null; if (run.giver) track(run.giver, 'giver'); if (run.kip) track(run.kip, 'kip'); }
      }
      refreshAvailable(true);
      sfx('mission', p.x, p.z, 1);
      if (!run.replay) maybeChapter(m);
      clearGps();
      if (!callUI('banner', m.title, run.replay ? 'REPLAY' : (m.giver ? (castOf(m.giver) || {}).name : null))) toast(m.title);
      emit('start', { mission: m, id: m.id, replay: run.replay });
      if (p.inVehicle) p.inVehicle.setControls(0, 0, false, 1);
      var intro = m.intro || [];
      if (opts.skipIntro || !g || g.state !== 'playing') beginPlay();
      else playIntro(m, intro);
      return true;
    },
    // the ?mission= jump-in: prerequisites complete with their flags and weapons, the player at the giver's door
    prep: function (id, opts) {
      opts = opts || {};
      var m = missionById(id); if (!m) return false;
      var seen = {};
      (function mark(mm) {
        var req = mm.requires || [];
        for (var i = 0; i < req.length; i++) {
          var r = req[i], rm = missionById(r);
          if (!rm || seen[r]) continue;
          seen[r] = true; mark(rm);
          if (!state.completed.has(r)) { state.completed.add(r); applyComplete(rm, true); }
        }
      })(m);
      var pt = resolvePoint({ landmark: m.marker }), g = game();
      if (pt && g && g.debug) g.debug.teleport(pt.x, pt.z);
      refreshAvailable(true);
      return Missions.start(id, { skipIntro: !opts.intro });
    },
    abort: function () {
      if (!run) return false;
      var m = run.m;
      teardownRun();
      lastFail = null;
      toast(failText('abort'));
      emit('abort', { mission: m, id: m.id });
      refreshAvailable(true);
      clearGps(); storyGps(true);
      return true;
    },
    fail: function (reason) {
      if (!run) return false;
      var m = run.m, p = player();
      reason = reason || 'failed';
      var text = failText(reason);
      var snap = run.checkpoint, retries = run.retries, replay = run.replay;
      teardownRun();
      lastFail = { m: m, id: m.id, snapshot: snap, reason: reason, text: text, replay: replay, retries: retries, at: simT() };
      state.failed[m.id] = (state.failed[m.id] || 0) + 1;
      var Rd = GTP.Content && GTP.Content.radio, title = (Rd && Rd.failTexts && Rd.failTexts.missionFailed) || 'CONTEXT STAMPED';
      if (!callUI('card', 'failed', title, text)) toast(title + ': ' + text);
      sfx('fail', p ? p.x : 0, p ? p.z : 0, 0.9);
      emit('fail', { mission: m, id: m.id, reason: reason, text: text });
      // the retry card (GDD_EXPANSION §6.4): RETRY from the checkpoint, RESTART MISSION, QUIT
      emit('failed', { mission: m, id: m.id, reason: reason, text: text, retry: !!snap, objective: snap ? snap.cursor[0] : 0, retries: retries });
      refreshAvailable(true);
      clearGps(); storyGps(true);
      return true;
    },
    // RETRY: the last failed mission resumes at its last checkpoint (the snapshot restored, tagged vehicles re-spawned, timers +15 s)
    canRetry: function () { var g = game(), p = player(); return !!(lastFail && lastFail.snapshot && !run && g && g.state === 'playing' && p && p.alive); },
    lastFail: function () { return lastFail; },
    // QUIT on the CONTEXT STAMPED card: the offer is gone for good (QA-C1-02; js/11_ui.js retryActivate calls it)
    _dropRetry: function () { lastFail = null; return true; },
    dropRetry: function () { lastFail = null; return true; },
    // other modules add objective types: def = {start(o, c, p), check(o, c, p) -> 'done'|'fail'|null, update?, cleanup?, hint?,
    // target?, progress?}; a file that loads before this one can leave them in GTP.ObjectiveTypes[name] instead
    registerObjectiveType: function (name, def) { return registerObjectiveType(name, def); },
    // a shop item with unlock: <missionId> is for sale: the mission is complete, or it is running a buy objective for it
    isUnlocked: function (id) { return !id || !!(state && Set.prototype.has.call(state.completed, id)) || !!(run && run.unlocks && run.unlocks[id]); },
    objectiveTypes: function () { var out = Object.keys(H); for (var k in pluginTypes) if (out.indexOf(k) < 0) out.push(k); return out; },
    retry: function () {
      if (!Missions.canRetry()) return false;
      var lf = lastFail, s = lf.snapshot, m = lf.m, p = player();
      var r = newRun(m, { replay: lf.replay });
      r.retries = (lf.retries || 0) + 1; r.playT = s.playT || 0; r.phase = 'play'; r.equipped = (s.equipped || []).slice();
      run = r;
      state.active = m.id; state.mission = m; state.phase = 'play'; state.flags = Object.assign({}, s.flags);
      refreshAvailable(true);
      try {
        restorePlayer(s.player);
        for (var tag in s.tagged) {
          var live = liveTagged(tag), v = live && live.persistent ? live : spawnFromRecord(s.tagged[tag]);
          if (v === live && !v.keep) track(v, 'vehicle');
          run.tagged[tag] = v;
        }
        if (s.vehicle) {
          var mine = s.vehicle.tag && run.tagged[s.vehicle.tag] ? run.tagged[s.vehicle.tag] : spawnFromRecord(s.vehicle);
          mine.x = s.vehicle.x; mine.z = s.vehicle.z; mine.y = s.vehicle.y; mine.yaw = s.vehicle.yaw; mine.vx = mine.vz = mine.vy = 0; mine.speed = 0; mine.snap(); if (mine._sh) E().hash.update(mine);
          mine.enter(p, 0);
          p.x = mine.x; p.z = mine.z; p.y = mine.y; p.snap();
        }
      } catch (e) { U.reportError(e, 'missions.retry.restore'); }
      run.stack = rebuildStack(m, s.cursor, s.timers);
      run.skipCutsceneOnce = true;
      if (p.stats) p.stats.retries = (p.stats.retries || 0) + 1;
      var Rd = GTP.Render; if (Rd && Rd.rig) { Rd.rig.snap(); if (Rd.rig.target) Rd.rig.target(p); Rd.updateCamera(0); }
      if (!callUI('banner', m.title, 'RETRY ' + run.retries)) toast('RETRY: ' + m.title);
      emit('retry', { mission: m, id: m.id, objective: s.cursor[0], retries: run.retries });
      lastFail = null;
      beginObjective();
      return true;
    },
    // RESTART MISSION: from the marker, intro skipped
    restart: function (id) {
      var m = id ? missionById(id) : (lastFail ? lastFail.m : null); if (!m || run) return false;
      var replay = lastFail && lastFail.m === m ? lastFail.replay : false;
      var pt = resolvePoint({ landmark: m.marker }), g = game();
      if (pt && g && g.debug) { var p = player(); if (p && p.inVehicle) p.exitVehicle(); g.debug.teleport(pt.x, pt.z); }
      refreshAvailable(true);
      return Missions.start(m.id, { skipIntro: true, replay: replay });
    },
    // REPLAY (the phone): a completed mission again from its door, intro included; rewards, flags, unlocks and autosave skipped,
    // the weapons restored afterwards, only a better time written (GDD_EXPANSION §6.5)
    replay: function (id) {
      var m = missionById(id); if (!m || run || !state.completed.has(id) || m.replayable === false) return false;
      var pt = resolvePoint({ landmark: m.marker }), g = game();
      if (pt && g && g.debug) { var p = player(); if (p && p.inVehicle) p.exitVehicle(); g.debug.teleport(pt.x, pt.z); }
      refreshAvailable(true);
      return Missions.start(id, { replay: true });
    },
    bestTime: function (id) { return state.bestTimes[id] != null ? state.bestTimes[id] : null; },
    // the phone's MISSIONS tab: completed missions with best times, grouped by act
    completedList: function () {
      var out = [], all = allMissions();
      for (var i = 0; i < all.length; i++) { var m = all[i]; if (!state.completed.has(m.id)) continue; out.push({ id: m.id, title: m.title, act: m.act || null, best: state.bestTimes[m.id] != null ? state.bestTimes[m.id] : null, replayable: m.replayable !== false }); }
      return out;
    },
    busy: function () { return !!(run || pendingCut || dlg.active || mg.active); },
    // dialogue lines through the mission queue (the cutscene player uses it); done() when the last line is gone
    say: function (lines, done) { showDialogue(lines || [], done); return dlg.active; },
    // debug: force the current objective (or the dialogue / minigame in the way) through
    completeObjective: function () {
      if (!run) return false;
      if (mg.active) { Missions._resolveMinigame(true); return true; }
      if (dlg.active) { Missions.skipDialogue(); return true; }
      if (run && run.obj) { objectiveDone(run.obj); return true; }
      return false;
    },
    advanceDialogue: function () {
      if (!dlg.active || !dlg.current) return false;
      dlg.current = null; nextLine(); return true;
    },
    skipDialogue: function () {
      if (!dlg.active) return false;
      while (dlg.queue.length) { var raw = dlg.queue.shift(); if (raw.ticker) { var l = enrich(raw); if (!callUI('ticker', l.text)) toast(l.name + ': ' + l.text); } }
      if (dlg.uiDriven) callUI('hideDialogue');
      dlg.current = null;
      endDialogue();
      return true;
    },
    _resolveMinigame: function (win) {
      if (!mg.active) return false;
      var a = mg.active; mg.active = null; state.minigame = null;
      var g = game(); if (g && g.state === 'minigame') g.setState('playing');
      emit('minigameDone', { game: a.game, win: !!win });
      if (a.cb) { try { a.cb(!!win); } catch (e) { U.reportError(e, 'missions.minigame'); } }
      return true;
    },
    available: available,
    // [{id, kind:'mission'|'objective', x, z, y, missionId, title, landmark, color}] for the minimap
    markers: function () {
      var out = [], i;
      var pl = player(), nxt = storyNextMission();
      for (i = 0; i < avail.length; i++) { var a = avail[i]; out.push({ id: a.id, kind: 'mission', x: a.x, z: a.z, y: a.y, missionId: a.id, title: a.m.title, giver: a.m.giver, landmark: a.landmark, color: K.colors.mission, story: !!(nxt && nxt.id === a.id), beacon: true, labelRange: 400, dist: pl ? U.dist2d(pl.x, pl.z, a.x, a.z) : null, act: actOf(a.m) }); }
      for (i = 0; i < objMarkers.length; i++) { var o = objMarkers[i]; out.push({ id: run ? run.id + ':' + i : 'objective', kind: 'objective', x: o.x, z: o.z, y: o.y, missionId: run ? run.id : null, title: state.objectiveText, color: K.colors.objective }); }
      return out;
    },
    // the HUD arrow: {x, y, z, dist, text} or null
    objectiveTarget: function () {
      var o = run && run.obj, p = player();
      if (!o || !p || !o.h.target) return null;
      var t = null;
      try { t = o.h.target(o.def, o.c, p); } catch (e) { t = null; }
      if (!t) return null;
      return { x: t.x, y: t.y || 0, z: t.z, dist: U.dist2d(p.x, p.z, t.x, t.z), text: state.objectiveText, type: o.def.type };
    },
    hud: function () {
      return {
        active: run ? run.id : null, title: run ? run.m.title : null, giver: run ? run.m.giver : null, phase: run ? run.phase : null,
        objective: run ? state.objectiveText : '', hint: state.hint || null, progress: state.progress, timer: state.timer,
        dialogue: dlg.active ? dlg.current : null, minigame: state.minigame, flags: state.flags,
        replay: !!(run && run.replay), retries: run ? run.retries : 0, holdBar: state.holdBar, retry: Missions.canRetry() ? { id: lastFail.id, title: lastFail.m.title, text: lastFail.text } : null,
        subs: Missions.subscribers()
      };
    },
    current: function () { return run && run.obj ? { def: run.obj.def, ctx: run.obj.c, index: run.stack[0].i, depth: run.stack.length - 1 } : null; },
    dialogue: dlg,
    registerTest: function (m) { if (!m || !m.id) return null; registry[m.id] = m; return m.id; },
    missionById: missionById,
    allMissions: allMissions,
    allMarkers: function () { var out = Missions.markers(); if (GTP.Strands && GTP.Strands.markers) out = out.concat(GTP.Strands.markers()); return out; },
    resolvePoint: resolvePoint,
    on: function (ev, fn) { return GTP.Events.on('mission:' + ev, fn); },
    off: function (ev, fn) { return GTP.Events.off('mission:' + ev, fn); },
    refreshMarkers: function () { refreshAvailable(true); },
    // ------------------------------------------------------------ subscribers (GDD_EXPANSION §5.8) --
    TIERS: null,
    addSubs: function (n, why) { return addSubs(n, why); },
    subscribers: function () {
      var p = player(), count = p ? (p.subs | 0) : 0, t = tierFor(count), cur = SUB_TIERS[t], nxt = SUB_TIERS[t + 1] || null;
      return { count: count, tier: t, name: cur.name, perk: cur.perk || null, next: nxt ? { subs: nxt.subs, name: nxt.name } : null, perks: activePerks() };
    },
    syncSubs: function () { subsTier = tierFor(player() ? player().subs | 0 : 0); applyPerks(); },
    debug: { run: function () { return run; }, avail: function () { return avail; }, objMarkers: function () { return objMarkers; }, snapshot: function () { return run ? run.checkpoint : null; } }
  };
  Missions.TIERS = SUB_TIERS;
  Missions.init();

  // ------------------------------------------------------------ events --
  // a later, unrelated death or bust never brings back an old mission's RETRY card (QA-C1-02); these run before the fail below
  GTP.Events.on('player:wasted', function () { if (!run) lastFail = null; });
  GTP.Events.on('busted', function () { if (!run) lastFail = null; });
  GTP.Events.on('player:wasted', function () { if (run) Missions.fail('player_dead'); });
  GTP.Events.on('busted', function () { if (run) Missions.fail('busted'); });
  // the weapon behind a vehicle's last hit (destroy's `weapon` rule reads it on the wreck)
  GTP.Events.on('vehicle:damage', function (e) {
    var v = e && e.vehicle; if (!v) return;
    var p = player(), srcIsPlayer = e.src === p || (e.src && e.src.owner === p) || (e.src && e.src.kind === 'projectile');
    // a chain explosion (a wreck's blast taking the van beside it) is credited to whatever wrecked the first one: a rocket into a
    // row of memo vans counts the row, not WRONG TAKE
    var chain = e.type === 'explosion' && e.src && e.src.kind === 'vehicle' && e.src !== v && e.src._lastHit;
    var hit = chain ? { type: chain.type, weapon: chain.weapon, src: chain.src, chain: true } : { type: e.type || null, weapon: srcIsPlayer && p ? p.weapon : null, src: e.src || null };
    v._lastHit = hit;
    // the hit that lit it (hp to zero) is the kill: a van that burns for a few seconds and gets nudged by traffic before it goes
    // up was still the rocket's
    if (v.hp <= 0 && !v._igniteHit) v._igniteHit = hit;
  });
  // chaos subscribers: stars, props, wrecks, honks (capped per minute)
  GTP.Events.on('wanted', function (e) { if (e && e.level > (e.prev | 0) && e.prev !== e.level) chaosSubs(25 * (e.level - (e.prev | 0)), 'wanted'); });
  GTP.Events.on('prop:knocked', function (e) { if (e && e.vehicle && e.vehicle.hasPlayer && e.vehicle.hasPlayer()) chaosSubs(10, 'prop'); });
  // a direct rocket hit wrecks a van without a vehicle:damage event: the blast is the kill, credited to the weapon in the
  // player's hands (QA-CMB-01: m13b's Ratio Launcher vans counted WRONG TAKE)
  GTP.Events.on('vehicle:exploded', function (e) {
    var p = player(), v = e && e.vehicle; if (!p || !v || v._igniteHit) return;
    // only the player's own blast or projectile is credited to the gun in hand; anything else falls back to the last hit
    var s = e.src, mine = s === p || (s && (s.owner === p || s.shooter === p || s.src === p));
    if (mine) v._igniteHit = { type: e.type || (s && s.weapon) || 'explosion', weapon: (s && s.weapon) || p.weapon, src: s || p };
    else if (v._lastHit) v._igniteHit = v._lastHit;
  });
  GTP.Events.on('vehicle:exploded', function (e) {
    var p = player(), v = e && e.vehicle; if (!p || !v) return;
    if (e.src === p || v.lastDamageSrc === p || (e.src && e.src.driver === p) || (v._lastHit && v._lastHit.weapon)) chaosSubs(40, 'wreck');
  });
  GTP.Events.on('honk', function (e) { if (e && e.vehicle && e.vehicle.hasPlayer && e.vehicle.hasPlayer()) chaosSubs(5, 'honk'); });
  // the tier perks on death: Main Character keeps the weapons, Pundit-Industrial comes back with armor
  GTP.Events.on('player:wasted', function () { var p = player(); stashedWeapons = p && subsTier >= 3 ? { weapons: Object.assign({}, p.weapons), ammo: copyAmmo(p.ammo), weapon: p.weapon } : null; });
  GTP.Events.on('player:respawn', function (e) {
    var p = player(); if (!p) return;
    if (stashedWeapons && e && e.at !== 'police') { p.weapons = Object.assign({ fist: Infinity }, stashedWeapons.weapons); p.ammo = copyAmmo(stashedWeapons.ammo); p.weapon = p.weapons[stashedWeapons.weapon] ? stashedWeapons.weapon : 'fist'; }
    stashedWeapons = null;
    if (subsTier >= 4) p.armor = Math.max(p.armor || 0, 50);
  });
  GTP.SaveHooks = GTP.SaveHooks || [];
  GTP.SaveHooks.push({ name: 'subs', save: function () { }, load: function () {
    Missions.syncSubs();
    // a save from before chapters (v3): the act already reached counts as shown, so no ACT card mid-act
    if (state && state.flags.story_act == null) { var a = 0; storyOrder().forEach(function (m) { if (state.completed.has(m.id)) a = Math.max(a, actOf(m)); }); if (a) state.flags.story_act = a; }
  } });
  // the story's own save state (the heist plan); chapters and calls live in the flags (PLAN_V03 GTP.SaveRegistry)
  GTP.SaveRegistry = GTP.SaveRegistry || {};
  GTP.SaveRegistry.story = {
    get: function () { return { v: 1, heist: Heist.serialize() }; },
    set: function (d) { Heist.load(d && d.heist); }
  };
  GTP.Events.on('pickup', function (e) {
    var pk = e && e.pickup; if (!pk || pk.pickupType !== 'mission' || !pk.missionCtx || !run) return;
    var c = pk.missionCtx, n = 0;
    for (var i = 0; i < c.pickups.length; i++) if (c.pickups[i].removed || c.pickups[i] === pk) n++;
    textFx('+1 ' + (pk.objLabel || 'MERCH') + '  ' + n + '/' + c.total, pk.x, pk.y + 1.4, pk.z, '#ffd45a', 1.4);
    fx({ type: 'ring', x: pk.x, y: pk.y + 0.05, z: pk.z, size: 1.4, life: 0.4, color: 0xffd45a });
  });

  // ======================================================================================== GTP.Strands ==
  // The side strands (GDD_EXPANSION §5): Loud Cab, HOA Patrol, Sponsor Runs, Ratio Rampages, Monday Memos, Loop Races and
  // Stunt Jumps. One strand runs at a time and none during a story mission. Progress lives in `progress` and persists in
  // the save (GTP.SaveHooks: data.strands, data.memos). Each strand's data comes from GTP.Content.expansion.strands[id]
  // when the content has it; DEFAULTS below mirror the GDD's tables so the strands play before that file lands.
  var SK = C.STRANDS = Object.assign({
    hailRadius: 4, hailHold: 1, fareMin: 150, fareMax: 450, fareSpawnMin: 60, fareSpawnMax: 140, farePerMetre: 0.25, fareBase: 20, fareLeave: 10, fareWantedEnd: 3,
    hoaTargetMin: 120, hoaTargetMax: 240, hoaStopHold: 2, hoaNextDelay: 4, hoaLevels: 12, hoaLeave: 10, stopNear: 6,   // a stop: the patrol car this close (QA-STR-02)
    raceRepeatPay: 0.2, raceCooldown: 0,   // a repeat win pays a fifth of the prize (QA-STR-17); raceCooldown > 0 also rests the start light
    sponsorLeave: 15, sponsorArrive: 14, sponsorCrash: 20, sponsorMinPay: 100,
    rampageCountdown: 3, rampageWave: 4, rampageRadius: 40, rampageRespawn: 60, rampageReplay: 600,
    raceRing: 8, raceDnfLeave: 8, raceRacers: 3, raceSpeed: 0.95, raceBand: 0.08, raceCountdown: 3, racerHp: 320,
    turnLookAhead: 80, turnSpeed: 13,   // the chauffeur brakes for a sharp turn from this far out, down to this speed
    stuntLandRadius: 14, stuntSlowAfter: 0.6, stuntSlowFor: 2.2, stuntSlowScale: 0.35, stuntSideYaw: 1.22, stuntFov: 55,
    stuntLaunchAngle: 0.42,   // the wedge's effective launch angle (rad): the car keeps its speed and gets speed * sin(angle) upward (arcade physics)
    ensureEvery: 2, chip: true
  }, C.STRANDS || {});

  // ---------------------------------------------------------------------- DEFAULTS (GDD_EXPANSION §5) --
  var DEFAULTS = {
    loud_cab: {
      title: 'Loud Cab',
      passengers: [
        { id: 'fare_fellow', name: 'a think-tank fellow', look: { extra: 'lanyard', glasses: 'thick' }, line: 'Fulcrum, please. Either door. I\'ll know which when I see the check.', dest: 'fulcrum' },
        { id: 'fare_juice', name: 'a cleanse influencer', look: { hair: 'long', extra: 'phone' }, line: 'The wellness barn. My doctor won\'t tell me where it is.', dest: 'clarity_barn' },
        { id: 'fare_live', name: 'a man who is live', look: { hat: 'cap', extra: 'phone' }, line: 'Anywhere. I\'m live. Say hi. He says hi. Don\'t wave, it\'s vertical.' },
        { id: 'fare_board', name: 'an HOA board member', look: { hair: 'bun', glasses: 'round' }, line: 'The HOA Hall, and you\'re doing nine in an eight. Noted.', dest: 'hoa_hall' },
        { id: 'fare_nephew', name: 'a donor\'s nephew', look: { hair: 'slick', tie: 'gold' }, line: 'The club. Tell them I\'m with my uncle. My uncle is a hedge.', dest: 'heirloom_club' },
        { id: 'fare_freshman', name: 'the freshman', cast: 'freshman', line: 'The library. I know there isn\'t one. Drive until there is.' },
        { id: 'fare_agent', name: 'an OVA agent, off duty', look: { hat: 'beret', glasses: 'shades' }, line: 'The balloon office. I\'m not going there. Take me there.', dest: 'ova_hq' },
        { id: 'fare_lobbyist', name: 'a jet lobbyist', look: { glasses: 'aviator', extra: 'flag_pin' }, line: 'The embassy. We\'re close on the jets. We\'ve been close for eleven years.', dest: 'bravadia_embassy' },
        { id: 'fare_bagholder', name: 'a $PUNDIT holder', look: { hat: 'cap', glasses: 'shades', extra: 'phone' }, line: 'The mining shed. I\'m not selling. I\'m checking it\'s still a shed.', dest: 'moon_mine' },
        { id: 'fare_docent', name: 'a museum docent', look: { hair: 'bob', extra: 'lanyard' }, line: 'The Museum of Takes. I curate the gift shop. The gift shop is the museum.', dest: 'museum_of_takes' },
        { id: 'fare_ferry', name: 'a ferry passenger', look: { hat: 'beanie', shirt: '#e8dcc8' }, line: 'The ferry. I\'ve missed it four times. It hasn\'t left. I\'m consistent.', dest: 'ferry_terminal' },
        { id: 'fare_kip', name: 'Kip', cast: 'kip', line: 'Anywhere with a coupon code. Is this fare paid?' }
      ],
      unlocks: [{ fares: 10, flag: 'cab_livery', text: 'Every taxi in the city wears LOUD & CORRECT. Fares +10%.' }, { fares: 25, flag: 'cab_home', text: 'A taxi is always parked at Gus\'s Garage.' }, { fares: 50, flag: 'cab_legend', subs: 15000, ticker: 'LOUD CAB DRIVER DELIVERS FIFTY PASSENGERS, ZERO MINDS' }]
    },
    hoa_patrol: {
      title: 'HOA Patrol',
      violations: ['MAILBOX ADJACENT', 'LAWN LENGTH', 'PARKED WITH INTENT', 'UNAPPROVED COLOUR', 'HONKED ON A TUESDAY', 'TWO OPINIONS ON ONE BUMPER'],
      bonusLevel: 6, bonusCash: 2000, truceLevel: 12
    },
    sponsor_runs: {
      title: 'Sponsor Runs', depot: 'nap_depot', requires: 'm02_read', chain: 8, bonus: 1000, lifetimeSubsAt: 24,
      sponsors: ['clarity_barn', 'moon_mine', 'strip_gas', 'fish_shack', 'char_charter', 'airport_terminal', 'both_sides_port', 'heirloom_club']
    },
    ratio_rampages: {
      title: 'Ratio Rampages',
      signs: ['WRONG', 'SOURCE?', 'L', 'NOTED', 'DIDN\'T READ'],
      list: [
        { id: 'rr_01', name: 'Alley Oop', at: { landmark: 'impression_alley', offset: { x: 0, z: 12 } }, weapon: 'tableleg', hecklers: 12, seconds: 90, reward: 400 },
        { id: 'rr_02', name: 'Assembly Required', at: { landmark: 'protest_plaza', offset: { x: 8, z: 6 } }, weapon: 'pistol', hecklers: 10, seconds: 90, reward: 500 },
        { id: 'rr_03', name: 'Lot Talk', at: { landmark: 'stadium', offset: { x: -20, z: 0 } }, weapon: 'shotgun', hecklers: 15, seconds: 120, reward: 700 },
        { id: 'rr_04', name: 'Pier Pressure', at: { landmark: 'velvetine_pier', offset: { x: 0, z: 14 } }, weapon: 'smg', hecklers: 20, seconds: 120, reward: 800 },
        { id: 'rr_05', name: 'Board Meeting', at: { landmark: 'hoa_hall', offset: { x: 10, z: -8 } }, weapon: 'revolver', hecklers: 12, seconds: 100, reward: 700 },
        { id: 'rr_06', name: 'Apron Strings', at: { landmark: 'hangar_row', offset: { x: 14, z: 6 } }, weapon: 'rifle', hecklers: 25, seconds: 150, reward: 1000 },
        { id: 'rr_07', name: 'Tight Groups', at: { landmark: 'container_yard', offset: { x: 12, z: 12 } }, weapon: 'hotmic', hecklers: 16, seconds: 120, reward: 1000, tight: true },
        { id: 'rr_08', name: 'Well, Actually', at: { landmark: 'old_money_common', offset: { x: 0, z: -10 } }, weapon: 'ratio', hecklers: 12, cars: 6, seconds: 150, reward: 1500 }
      ]
    },
    monday_memos: {
      title: 'Monday Memos',
      thresholds: [10, 20, 30, 40, 50],
      list: [
        { id: 'mm_01', landmark: 'campus_quad', offset: { x: 0, z: -14 }, line: 'Table nine. No chair. Rate it a ten.' },
        { id: 'mm_02', landmark: 'dorm_studio', offset: { x: -6, z: 0 }, line: 'The mini-fridge is also on air.' },
        { id: 'mm_03', landmark: 'pod_garage', offset: { x: 10, z: -4 }, line: 'Respray: $100 a star. Opinions: same price.' },
        { id: 'mm_04', x: 104, z: 160, line: 'Houses on this court: zero. Minds: same.' },
        { id: 'mm_05', landmark: 'tyn_tower', offset: { x: 0, z: -12 }, line: '24 hours. 0 days. Respectfuly.' },
        { id: 'mm_06', landmark: 'green_room', offset: { x: 12, z: 0 }, line: 'Hour four. Bagels sponsored. Still waiting.' },
        { id: 'mm_07', landmark: 'impression_alley', offset: { x: 0, z: 18 }, line: 'This billboard is losing. It knows.' },
        { id: 'mm_08', landmark: 'goldplate_tower', offset: { x: -10, z: 10 }, line: 'Helicopters counted: 2. \'Both.\'' },
        { id: 'mm_09', landmark: 'vault_bank', offset: { x: 8, z: -6 }, line: 'We short what we love. We love you.' },
        { id: 'mm_10', landmark: 'hospital', offset: { x: 14, z: 4 }, line: 'Bandage coupon: TAKES20. Wound: a seven.' },
        { id: 'mm_11', x: 424, z: 328, y: 7, line: 'On the Loop you are legally a party. This is the invitation.' },
        { id: 'mm_12', landmark: 'nap_depot', offset: { x: -14, z: -2 }, line: 'The podium is a mattress. Sleep on it.' },
        { id: 'mm_13', landmark: 'listening_room', offset: { x: 6, z: -8 }, line: 'Tonight: nothing. Doors at nine.' },
        { id: 'mm_14', landmark: 'strip_gas', offset: { x: 0, z: -10 }, line: 'Premium has a stance. Regular has a podcast.' },
        { id: 'mm_15', landmark: 'both_sides_strip', offset: { x: -10, z: -24 }, line: 'Cutout six did the reading.' },
        { id: 'mm_16', landmark: 'capitol_dome', offset: { x: 0, z: -16 }, line: 'The dome is leased. The steps are a ten.' },
        { id: 'mm_17', landmark: 'fulcrum', offset: { x: 10, z: 0 }, line: 'Door two. Same checkbook.' },
        { id: 'mm_18', landmark: 'char_charter', offset: { x: -8, z: 6 }, line: 'The salad is Bronze. The bin is Gold.' },
        { id: 'mm_19', landmark: 'ova_hq', offset: { x: 12, z: -4 }, line: 'Antenna thirteen is for weather. Thirteen is a lot of weather.' },
        { id: 'mm_20', landmark: 'protest_plaza', offset: { x: 0, z: 12 }, line: 'Today\'s cause: this envelope. Mugs unchanged.' },
        { id: 'mm_21', landmark: 'stadium', offset: { x: 0, z: 30 }, line: 'Goldplate Goldplate. The second one is for emphasis.' },
        { id: 'mm_22', landmark: 'goldplate_links', offset: { x: -20, z: 40 }, line: 'Par ten. This was a six. Rated a ten.' },
        { id: 'mm_23', landmark: 'vaultwright_manor', offset: { x: 20, z: 10 }, line: 'You have reached the centre of the hedge. It is also a hedge.' },
        { id: 'mm_24', landmark: 'bridge_main', offset: { x: 0, z: 6 }, line: 'Dead drop #1. Contents: ad copy. Respectfuly.' },
        { id: 'mm_25', x: 604, z: 90, line: 'Ribbon never cut. Rated a ten in advance.' },
        { id: 'mm_26', landmark: 'hoa_hall', offset: { x: -12, z: -6 }, line: 'Mailbox violation: it was adjacent. One star.' },
        { id: 'mm_27', landmark: 'clarity_barn', offset: { x: 14, z: 0 }, line: 'Clarity Pellets: now with barn.' },
        { id: 'mm_28', landmark: 'moon_mine', offset: { x: -8, z: 8 }, line: '$PUNDIT: trustless. Shed: warm.' },
        { id: 'mm_29', landmark: 'culdesac_gas', offset: { x: 10, z: -8 }, line: 'The HOA approved the pump. Not the price. Not this memo.' },
        { id: 'mm_30', landmark: 'warehouse_42', offset: { x: -10, z: 10 }, line: 'Crate 42 of 42: mystery. Still charting.' },
        { id: 'mm_31', landmark: 'memo_press', offset: { x: 0, z: 20 }, line: '4,000 copies printed. Nobody placed the order. You did.' },
        { id: 'mm_32', landmark: 'balloon_depot', offset: { x: 20, z: 0 }, line: 'Van 40/40. Balloons repaired: 0.' },
        { id: 'mm_33', x: 40, z: 376, line: 'Corner of nothing and weather.' },
        { id: 'mm_34', landmark: 'velvetine_pier', offset: { x: 4, z: 30 }, line: 'You can hear the party from here. There is no party.' },
        { id: 'mm_35', landmark: 'afterparty_yacht', offset: { x: 20, z: 26 }, line: 'Never sailed. Dress code: a vibe.' },
        { id: 'mm_36', landmark: 'fish_shack', offset: { x: -8, z: 4 }, line: 'Takes reheated hourly. This one\'s warm.' },
        { id: 'mm_37', x: 334, z: 522, line: 'Toll: one opinion. Keep the change.' },
        { id: 'mm_38', landmark: 'airport_terminal', offset: { x: 0, z: -20 }, line: 'Baggage claim: your take has arrived. It was on the bus.' },
        { id: 'mm_39', landmark: 'airport_runway', point: 'west', line: 'Runway 10. Also runway 10. Both tens.' },
        { id: 'mm_40', landmark: 'control_tower', offset: { x: 0, z: -6 }, line: 'Tower: clouds rated. Planes: none.' },
        { id: 'mm_41', landmark: 'hangar_row', offset: { x: -10, z: 12 }, line: 'Hangar 1 of 1. Jet 0 of 1.' },
        { id: 'mm_42', x: 260, z: 760, line: 'Planes spotted: 0. Memos spotted: 1.' },
        { id: 'mm_43', landmark: 'container_yard', offset: { x: 30, z: 30 }, line: 'This container is MERCH. So is that one.' },
        { id: 'mm_44', landmark: 'manifest_quay', offset: { x: 20, z: 40 }, line: 'The Manifest: cargo moved, 0. Listening, yes.' },
        { id: 'mm_45', landmark: 'ferry_terminal', offset: { x: 0, z: 90 }, line: 'Next ferry: soon. Soon is a vibe.' },
        { id: 'mm_46', landmark: 'customs_shed', offset: { x: -12, z: 10 }, line: 'Declared: everything. Disclosed: code TAKES20.' },
        { id: 'mm_47', landmark: 'museum_of_takes', offset: { x: 2, z: -20 }, line: 'THE FIRST TAKE (attributed). Attributed to you.' },
        { id: 'mm_48', landmark: 'heirloom_club', offset: { x: 0, z: -4 }, line: 'Members since before opinions. Opinions since Tuesday.' },
        { id: 'mm_49', landmark: 'old_money_common', offset: { x: 16, z: 0 }, line: 'Bandstand. Bands: 0. Stands: 1.' },
        { id: 'mm_50', landmark: 'causeway_east', offset: { x: 12, z: 0 }, line: 'Goldplate Goldplate Causeway. Uptown says NO. Respectfuly.' }
      ]
    },
    loop_races: {
      title: 'Loop Races',
      list: [
        { id: 'lr_01', name: 'The Upper Loop', start: { x: 424, z: 328, y: 7 }, heading: 'n', ring: 'upper', order: ['ne', 'n', 'nw', 'w', 'sw', 's', 'se', 'e'], laps: 1, prizes: [1000, 400, 200] },
        { id: 'lr_02', name: 'The Lower Loop', start: { x: 376, z: 664, y: 7 }, heading: 'w', ring: 'lower', order: ['sw', 'w', 'nw', 'n', 'ne', 'e', 'se', 's'], laps: 1, prizes: [2000, 800, 400], requires: { finished: 'lr_01' } },
        { id: 'lr_03', name: 'The Figure Eight', start: { landmark: 'heirloom_club', offset: { x: -10, z: 6 } }, heading: 'w',
          checkpoints: [{ landmark: 'causeway_east', point: 'uptown' }, { landmark: 'causeway_east', point: 'island' }, { landmark: 'bridge_main' }, { x: 432, z: 300, y: 7 }, { ring: 'upper', at: 'ne' }, { ring: 'upper', at: 'nw' }, { ring: 'upper', at: 'sw' },
            { ring: 'lower', at: 'nw' }, { ring: 'lower', at: 'sw' }, { ring: 'lower', at: 'se' }, { x: 376, z: 700 }, { landmark: 'container_yard' }, { landmark: 'heirloom_club', offset: { x: 10, z: 6 } }],
          laps: 2, prizes: [4000, 1500, 700], requires: { won: 'lr_02' } }
      ]
    },
    stunt_jumps: { title: 'Stunt Jumps', reward: 500, allSubs: 10000, allCash: 5000 }
  };
  function strandData(id) { var X = expansion().strands; var d = X && X[id]; return d ? Object.assign({}, DEFAULTS[id] || {}, d) : DEFAULTS[id]; }
  // the content file keeps the list strands as arrays beside the three keyed ones (rampages, memos, races, stunts + *Rules)
  function contentStrands() { return expansion().strands || {}; }
  function rampageDefs() {
    var X = contentStrands(), list = Array.isArray(X.rampages) && X.rampages.length ? X.rampages : DEFAULTS.ratio_rampages.list;
    return list.map(function (d) { return Object.assign({ at: d.at || { landmark: d.landmark, offset: d.offset }, cars: d.vehicles ? d.vehicles.count : d.cars, hecklersEach: d.vehicles ? d.vehicles.hecklersEach : 2 }, d); });
  }
  function rampageRules() { return Object.assign({ signs: DEFAULTS.ratio_rampages.signs, subsPerCompletion: 2000, markerReturnFail: SK.rampageRespawn, markerReturnReplay: SK.rampageReplay }, contentStrands().rampageRules || {}); }
  function memoDefs() {
    var X = contentStrands(), list = Array.isArray(X.memos) && X.memos.length ? X.memos : DEFAULTS.monday_memos.list;
    return list.map(function (d) { return Object.assign({ at: d.at || (d.landmark ? { landmark: d.landmark, offset: d.offset, point: d.point } : { x: d.x, z: d.z, y: d.y }) }, d); });
  }
  function memoThresholds() {
    var R = contentStrands().memoRules;
    if (R && Array.isArray(R.thresholds)) return R.thresholds;
    return [
      { count: 10, text: 'Ten memos. A table leg, and $500.', weapon: 'tableleg', money: 500 },
      { count: 20, text: 'Twenty memos. A Firmness Vest, and one in the van every day.', armor: 100, flag: 'memo_vest' },
      { count: 30, text: 'Thirty memos. Both Sides Arms knocks 15% off. For a journalist.', flag: 'memo_discount' },
      { count: 40, text: 'Forty memos. The Ratio Launcher, and ten rockets.', weapon: 'ratio', ammo: 10, flag: 'memos40' },
      { count: 50, text: '$10,000, twenty thousand subscribers, and the Memo\'s last page.', money: 10000, subs: 20000, card: 'Takesworth found all the memos. Is this paid?', ticker: 'PUNDIT FINDS FIFTY MEMOS; EVERY ONE IS THE SAME MEMO', flag: 'memo_complete' }
    ];
  }
  function raceDefs() {
    var X = contentStrands(), list = Array.isArray(X.races) && X.races.length ? X.races : DEFAULTS.loop_races.list;
    return list.map(function (d) {
      var req = d.requires || (d.unlockedBy ? (d.unlockedBy.win ? { won: d.unlockedBy.race } : { finished: d.unlockedBy.race }) : null);
      return Object.assign({}, d, { requires: req });
    });
  }
  function raceRules() { return Object.assign({ subsFirstWin: 5000, subsRepeat: 500, checkpointRadius: SK.raceRing }, contentStrands().raceRules || {}); }
  function stuntDef(id) { var X = contentStrands(), list = Array.isArray(X.stunts) ? X.stunts : []; for (var i = 0; i < list.length; i++) if (list[i].id === id || list[i].ramp === id) return list[i]; return null; }
  function stuntRules() { return Object.assign({ subsPerStunt: 1000, allTen: { money: DEFAULTS.stunt_jumps.allCash, subs: DEFAULTS.stunt_jumps.allSubs, flag: 'stunt_pundit', ticker: 'PUNDIT LANDS TEN JUMPS; MINDS STILL AIRBORNE' } }, contentStrands().stuntRules || {}); }

  // ------------------------------------------------------------------------------ progress --
  function freshProgress() {
    return {
      loud_cab: { fares: 0, bestShift: 0, bestMoney: 0, queue: [], shifts: 0 },
      hoa_patrol: { best: 0, stops: 0, patrols: 0, bonus: false },
      sponsor_runs: { runs: 0, fullReads: 0, bestChain: 0 },
      ratio_rampages: { best: {}, done: 0 },
      monday_memos: { collected: [] },
      loop_races: { best: {}, wins: {}, finishes: {} },
      stunt_jumps: { done: [], best: {} }
    };
  }
  var progress = freshProgress();
  var cur = null;              // the running strand: {id, title, ...}
  var ensureT = 0;
  var strandMarkers = [];      // [{mesh, x, z, y, kind, icon, id, data}]

  function pos(t) { return resolvePoint(t, { metres: true }); }
  function srng() { return R(); }
  function strandMarker(color, pt, opts) {
    var Rd = GTP.Render; if (!Rd || !Rd.markerMesh || !pt) return null;
    try { var m = Rd.markerMesh(color, opts || { radius: 1.6, height: 7 }); m.position.set(pt.x, pt.y, pt.z); Rd.addMarker(m); return m; } catch (e) { U.reportError(e, 'strands.marker'); return null; }
  }
  function cycle(id, level, reward, extra) { GTP.Events.emit('strand:cycle', Object.assign({ id: id, level: level, reward: reward }, extra || {})); }
  function pay(n, why) { var p = player(); if (!p || !(n > 0)) return 0; n = Math.round(n); p.money += n; textFx('+' + U.fmtMoney(n), p.x, p.y + 2.2, p.z, '#9dff3c', 1.6); sfx('cash', p.x, p.z, 0.8); void why; return n; }
  function banner(title, sub) { if (!callUI('banner', title, sub)) toast(title + (sub ? ' ' + sub : '')); }
  function playerVehicle() { var p = player(); return p && p.inVehicle && p.inVehicle.driver === p ? p.inVehicle : null; }
  function stopped(v) { return !!v && Math.abs(v.speed) < 1; }
  function flagSet(f) { state.flags[f] = true; }
  function flagHas(f) { return !!state.flags[f]; }

  // ------------------------------------------------------------------------------ drivers --
  // A chauffeur: a scripted driver for mission and strand cars (the AI's traffic brain never sees them). Modes:
  // 'flee' (away from the player along the roads, re-planned every few seconds), 'ram' (straight at the player),
  // 'route' (a checkpoint list, for racers). The ped at the wheel carries a mission brain so the AI leaves it alone.
  var drivers = {
    list: [],
    take: function (v, mode, opts) {
      opts = opts || {};
      if (!v || v.kind !== 'vehicle' || v.removed) return null;
      if (v._chauf) drivers.release(v);
      if (v.ai && GTP.AI && GTP.AI.release) GTP.AI.release(v);
      if (!v.driver || !v.driver.alive) {
        var sp = GTP.AI && GTP.AI.spawner, d = null;
        if (sp && sp.spawnPed) d = sp.spawnPed(v.x, v.z, opts.role || 'civ', { persistent: true });
        else { d = new GTP.Ped({ x: v.x, z: v.z, role: opts.role || 'civ', persistent: true }); d.y = v.y; d.snap(); E().add(d); }
        if (v.driver) v.exit(v.driver);
        v.enter(d, 0);
        if (run && opts.track !== false) track(d, 'driver');
      }
      v.driver.ai = missionBrain('driver');
      v.driver.persistent = true;
      var c = { v: v, mode: mode || 'flee', goal: null, path: null, pi: 0, repathT: 0, stuckT: 0, revT: 0, t: 0, speedMul: opts.speedMul || 0.9, route: opts.route || null, ri: 0, loop: !!opts.loop,
        onCheckpoint: opts.onCheckpoint || null, wasPersistent: v.persistent, done: false, from: opts.from || null };
      v.persistent = true; v._chauf = c; drivers.list.push(c);
      return c;
    },
    release: function (v) {
      var c = v && v._chauf; if (!c) return;
      var i = drivers.list.indexOf(c); if (i >= 0) drivers.list.splice(i, 1);
      v._chauf = null; v.persistent = c.wasPersistent;
      if (!v.removed) v.setControls(0, 0, false, 0.6);
      if (v.driver && v.driver.ai && v.driver.ai.mission === 'driver') v.driver.ai = null;   // the AI gives it a wander brain on sight
    },
    update: function (dt) {
      for (var i = drivers.list.length - 1; i >= 0; i--) {
        var c = drivers.list[i], v = c.v;
        if (!v || v.removed || v.wreck || v.sinking || !v.driver || !v.driver.alive || v.driver.kind === 'player') { drivers.release(v); continue; }
        try { drivers.tick(c, dt); } catch (e) { U.reportError(e, 'strands.driver'); drivers.release(v); }
      }
    },
    fleeGoal: function (v, from) {
      var Wd = W(), dx = v.x - from.x, dz = v.z - from.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
      var a = Math.atan2(dz / l, dx / l) + srng().range(-0.7, 0.7), gx = v.x + Math.cos(a) * 170, gz = v.z + Math.sin(a) * 170;
      gx = U.clamp(gx, 30, Wd.w * C.TILE - 30); gz = U.clamp(gz, 30, Wd.h * C.TILE - 30);
      var rp = Wd.nearestRoadPoint(gx, gz);
      return rp ? { x: rp.x, z: rp.z } : { x: gx, z: gz };
    },
    tick: function (c, dt) {
      var v = c.v, pl = player(), Wd = W(), direct = false;
      c.t += dt; c.repathT -= dt;
      var from = c.from || pl;
      if (c.mode === 'flee') {
        if (!c.goal || c.repathT <= 0 || U.dist2d(v.x, v.z, c.goal.x, c.goal.z) < 24) { c.goal = drivers.fleeGoal(v, from); c.path = null; c.repathT = 4; }
      } else if (c.mode === 'ram') {
        var tgt = pl.inVehicle || pl;
        c.goal = { x: tgt.x + (tgt.vx || 0) * 0.3, z: tgt.z + (tgt.vz || 0) * 0.3 };
        direct = U.dist2d(v.x, v.z, c.goal.x, c.goal.z) < 45;
        if (!direct && (!c.path || c.repathT <= 0)) { c.path = null; c.repathT = 2; }
      } else if (c.mode === 'route') {
        if (!c.route || !c.route.length) { v.setControls(0, 0, false, 1); return; }
        var wp = c.route[c.ri];
        if (U.dist2d(v.x, v.z, wp.x, wp.z) < (wp.r || 10)) {
          var ci = c.ri; c.ri++;
          if (c.onCheckpoint) { try { c.onCheckpoint(ci, c); } catch (e) { U.reportError(e, 'strands.checkpoint'); } }
          if (c.ri >= c.route.length) { if (c.loop) c.ri = 0; else { c.done = true; v.setControls(0, 0, true, 1); return; } }
          c.path = null;
        }
        c.goal = c.route[c.ri];
        direct = !!c.route[c.ri].direct || U.dist2d(v.x, v.z, c.goal.x, c.goal.z) < 60;
        // a sharp turn at the next point: brake for it on the way in
        var nx = c.route[(c.ri + 1) % c.route.length], dIn = U.dist2d(v.x, v.z, c.goal.x, c.goal.z);
        if (nx && nx !== c.goal && dIn < SK.turnLookAhead) {
          var a1 = U.dirToYaw(c.goal.x - v.x, c.goal.z - v.z), a2 = U.dirToYaw(nx.x - c.goal.x, nx.z - c.goal.z);
          // ease down toward the corner speed over the approach (full speed at the look-ahead distance, the corner speed at the point)
          c.turnCap = Math.abs(U.wrapAngle(a2 - a1)) > 0.6 ? SK.turnSpeed + (v.cls.maxSpeed - SK.turnSpeed) * U.clamp((dIn - 12) / (SK.turnLookAhead - 12), 0, 1) * 0.6 : null;
        } else c.turnCap = null;
      } else { v.setControls(0, 0, false, 1); return; }
      var tgt2 = c.goal;
      if (!direct) {
        if (!c.path && pathBudget > 0 && Wd.findPath) {
          pathBudget--;
          c.path = Wd.findPath(v.x, v.z, c.goal.x, c.goal.z, { mode: 'car', fromY: v.y, toY: Wd.heightAt(c.goal.x, c.goal.z, c.goal.y || 0), maxExpansions: 6000 });
          c.pi = 0;
        }
        if (c.path && c.path.length) {
          while (c.pi < c.path.length - 1 && U.dist2d(v.x, v.z, c.path[c.pi].x, c.path[c.pi].z) < 7) c.pi++;
          tgt2 = c.path[Math.min(c.pi + 1, c.path.length - 1)];
        }
      }
      var cruise = v.cls.maxSpeed * c.speedMul;
      if (c.turnCap) cruise = Math.min(cruise, c.turnCap);
      drivers.steer(c, tgt2, cruise, dt);
    },
    steer: function (c, tgt, cruise, dt) {
      var v = c.v, dx = tgt.x - v.x, dz = tgt.z - v.z;
      var want = U.dirToYaw(dx, dz), diff = U.wrapAngle(want - v.yaw);
      var steer = U.clamp(-diff * 1.6, -1, 1);
      if (Math.abs(diff) > 0.7) cruise = Math.min(cruise, 9);
      else if (Math.abs(diff) > 0.35) cruise = Math.min(cruise, 16);
      var throttle = v.speed < cruise ? 1 : (v.speed > cruise + 3 ? -0.3 : 0.15);
      if (c.revT > 0) { c.revT -= dt; v.setControls(-1, -steer, false, 0); return; }
      if (Math.abs(v.speed) < 0.6 && throttle > 0) { c.stuckT += dt; if (c.stuckT > 1.2) { c.stuckT = 0; c.revT = 1.1; c.path = null; } } else c.stuckT = 0;
      v.setControls(throttle, steer, false, throttle < 0 ? 0.5 : 0);
    }
  };

  // ------------------------------------------------------------------------------- stunts --
  // The ten striped wedges (World.stuntRamps). A jump counts when the player's car leaves one and lands on its wheels inside
  // the landing zone after minAir seconds; past 0.6 s airborne the clock slows and the rig swings to the side.
  var stunts = {
    air: null, prevGround: true, watchers: [], slowUntil: 0,
    ramp: function (id) { var list = W().stuntRamps || []; for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; },
    list: function () { return (W().stuntRamps || []).slice(); },
    watch: function (w) { stunts.watchers.push(w); return w; },
    unwatch: function (w) { var i = stunts.watchers.indexOf(w); if (i >= 0) stunts.watchers.splice(i, 1); },
    update: function (dt) {
      var g = game(), v = playerVehicle();
      if (!v) {
        // thrown out mid-flight (the car hit the water or blew up): that is a landing, and a bad one
        if (stunts.air && (stunts.air.v.sinking || stunts.air.v.wreck)) stunts.land(stunts.air);
        else if (stunts.air) stunts.abort();
        stunts.prevGround = true; return;
      }
      var a = stunts.air;
      if (a) {
        if (a.v !== v) { stunts.abort(); return; }
        if (v.onGround || v.sinking || v.wreck) { stunts.land(a); return; }
        a.airT += dt;
        if (a.airT >= SK.stuntSlowAfter && !a.slow) { a.slow = true; if (g) g.timeScale = SK.stuntSlowScale; }
        if (a.slow && a.airT >= SK.stuntSlowAfter + SK.stuntSlowFor && g && g.timeScale !== 1) g.timeScale = 1;
        return;
      }
      if (!v.onGround && stunts.prevGround && v.speed2d() > 3) {
        var f = U.yawToDir(v.yaw), best = null, bd = 1e9, list = W().stuntRamps || [];
        for (var i = 0; i < list.length; i++) {
          var r = list[i], d = U.dist2d(v.x, v.z, r.x, r.z); if (d > 11 || d >= bd) continue;
          var rf = U.yawToDir(r.yaw); if (rf.x * f.x + rf.z * f.z < 0.3) continue;
          best = r; bd = d;
        }
        if (best) {
          // the physics drops vy to zero as the wheels leave the wedge: the launch keeps the run-up speed and adds the lift
          var sp = v.speed2d(), lift = sp * Math.sin(SK.stuntLaunchAngle);
          if (v.vy < lift) v.vy = lift;
          stunts.air = { v: v, ramp: best, airT: 0, speed: sp, slow: false, x0: v.x, z0: v.z };
          sfx('jump', v.x, v.z, 0.9); GTP.Events.emit('stunt:launch', { ramp: best.id, speed: sp });
        }
      }
      stunts.prevGround = v.onGround;
    },
    abort: function () { var g = game(); if (g) g.timeScale = 1; stunts.air = null; },
    land: function (a) {
      var g = game(), v = a.v, Wd = W(), r = a.ramp; stunts.air = null; if (g) g.timeScale = 1;
      var minAir = r.minAir || 1, land = r.landing, t = Wd.tileAt(v.x, v.z), T = Wd.T;
      var inZone = !land || U.dist2d(v.x, v.z, land.x, land.z) <= SK.stuntLandRadius;
      var reason = v.wreck ? 'wreck' : v.sinking || t === T.WATER ? 'water' : t === T.BUILDING ? 'roof' : null;
      var res = { ramp: r.id, name: r.name, airT: Math.round(a.airT * 100) / 100, speed: Math.round(a.speed * 10) / 10, inZone: inZone, ok: false, reason: reason };
      // a mission objective watching this ramp decides for itself (its own minAir / minSpeed / landing zone)
      var consumed = false;
      for (var i = stunts.watchers.length - 1; i >= 0; i--) {
        var w = stunts.watchers[i];
        if (w.ramp && w.ramp !== r.id) continue;
        if (w.vehicle && !w.vehicle(v)) continue;
        var wz = !w.landing ? inZone : U.dist2d(v.x, v.z, w.landing.x, w.landing.z) <= SK.stuntLandRadius;
        var wr = Object.assign({}, res);
        wr.ok = !reason && wz && a.airT >= (w.minAir != null ? w.minAir : minAir) && a.speed >= (w.minSpeed || 0);
        if (!wr.ok) wr.reason = reason || (!wz ? 'zone' : a.airT < (w.minAir != null ? w.minAir : minAir) ? 'short' : 'slow');
        try { w.onResult(wr); } catch (e) { U.reportError(e, 'strands.stunt.watch'); }
        consumed = true;
      }
      res.ok = !reason && inZone && a.airT >= minAir;
      if (!res.ok && !res.reason) res.reason = !inZone ? 'zone' : 'short';
      GTP.Events.emit('stunt:land', res);
      if (consumed) return res;
      if (res.ok) {
        var P = progress.stunt_jumps, first = P.done.indexOf(r.id) < 0, SD = stuntDef(r.id) || {}, SR = stuntRules();
        if (first) P.done.push(r.id);
        if (P.best[r.id] == null || a.airT > P.best[r.id]) P.best[r.id] = res.airT;
        var D = strandData('stunt_jumps'), reward = first ? (SD.reward || D.reward) : 0;
        if (reward) pay(reward, 'stunt');
        if (!callUI('card', 'passed', 'STUNT PUNDIT: ' + (SD.name || r.name || r.id).toUpperCase(), res.airT.toFixed(2) + ' s of air' + (reward ? '  ' + U.fmtMoney(reward) : ''))) toast('STUNT PUNDIT: ' + r.name + ' (' + res.airT + ' s)');
        sfx('mission', v.x, v.z, 0.8);
        if (first) addSubs(SR.subsPerStunt || 1000, 'stunt');
        cycle('stunt_jumps', P.done.length, reward, { ramp: r.id, airT: res.airT });
        var total = (W().stuntRamps || []).length, all = SR.allTen || {};
        if (first && total && P.done.length >= total && !flagHas(all.flag || 'stunt_pundit')) { flagSet(all.flag || 'stunt_pundit'); pay(all.money || D.allCash, 'stunts'); addSubs(all.subs || D.allSubs, 'stunts'); callUI('ticker', all.ticker || 'PUNDIT LANDS TEN JUMPS; MINDS STILL AIRBORNE'); }
      } else if (a.airT > 0.5) toast('CONTEXT STAMPED');
      return res;
    },
    // the side view while airborne (after Game.updateCamera): yaw +70 degrees, a tighter fov; the chase rig eases back on landing
    afterCamera: function (dt) {
      var a = stunts.air, Rd = GTP.Render; if (!a || !Rd || !Rd.rig || Rd.free) return;
      if (a.airT < 0.25) return;
      var rig = Rd.rig, g = game();
      if (GTP.Input) GTP.Input.lastLookTime = g ? g.time.t : 0;   // the car auto-yaw stands down
      rig.yaw = U.angleDamp(rig.yaw, a.v.yaw + SK.stuntSideYaw, 5, dt);
      rig.fov = U.damp(rig.fov, SK.stuntFov, 6, dt);
      if (rig.apply) rig.apply();
    }
  };

  // -------------------------------------------------------------------------------- races --
  var LOOP_PTS = null;
  function loopPoints() {
    if (LOOP_PTS) return LOOP_PTS;
    var L = GTP.Content.world.layout.loop, T = C.TILE, y = L.y || C.DECK_Y;
    function leg(axis, lower) { var legs = L.legs, out = []; for (var i = 0; i < legs.length; i++) if (legs[i].axis === axis && !!legs[i].lower === !!lower) out.push(legs[i]); return out; }
    var uv = leg('v', false), uh = leg('h', false), lv = leg('v', true), lh = leg('h', true);
    function mid(l) { return l.at * T; }   // a leg covers tiles at-2 .. at+1: its centre line is at * TILE
    var ux = uv.map(mid).sort(function (a, b) { return a - b; }), uz = uh.map(mid).sort(function (a, b) { return a - b; });
    var W0 = ux[0], E0 = ux[ux.length - 1], N0 = uz[0], S0 = uz[uz.length - 1];
    var upper = { nw: [W0, N0], ne: [E0, N0], sw: [W0, S0], se: [E0, S0], n: [(W0 + E0) / 2, N0], s: [(W0 + E0) / 2, S0], w: [W0, (N0 + S0) / 2], e: [E0, (N0 + S0) / 2] };
    var lower = null;
    if (lh.length && lv.length) {
      var lx = lv.map(mid).sort(function (a, b) { return a - b; }), lz = lh.map(mid);
      var LW = lx[0], LE = lx[lx.length - 1], LN = S0, LS = lz[0];
      lower = { nw: [LW, LN], ne: [LE, LN], sw: [LW, LS], se: [LE, LS], n: [(LW + LE) / 2, LN], s: [(LW + LE) / 2, LS], w: [LW, (LN + LS) / 2], e: [LE, (LN + LS) / 2] };
    }
    function pts(o) { var out = {}; for (var k in o) out[k] = { x: o[k][0], z: o[k][1], y: y }; return out; }
    LOOP_PTS = { upper: pts(upper), lower: lower ? pts(lower) : null };
    return LOOP_PTS;
  }
  // a deck checkpoint snaps to the leg's centre line (the content lists the ring corners at the deck's inner edge)
  function snapToDeck(pt) {
    if (!pt || !(pt.y >= 5)) return pt;
    var LP = loopPoints(), rings = [LP.upper, LP.lower], xs = [], zs = [];
    for (var r = 0; r < rings.length; r++) { var ring = rings[r]; if (!ring) continue; xs.push(ring.nw.x, ring.ne.x); zs.push(ring.nw.z, ring.sw.z); }
    for (var i = 0; i < xs.length; i++) if (Math.abs(pt.x - xs[i]) <= 12) { pt.x = xs[i]; break; }
    for (i = 0; i < zs.length; i++) if (Math.abs(pt.z - zs[i]) <= 12) { pt.z = zs[i]; break; }
    return pt;
  }
  function resolveCheckpoint(cp) {
    if (cp.ring) { var LP = loopPoints(), ring = LP[cp.ring]; return ring && ring[cp.at] ? Object.assign({}, ring[cp.at]) : null; }
    var p = pos(cp); if (!p) return null;
    var out = { x: p.x, z: p.z, y: cp.y != null ? cp.y : p.y };
    return cp.y != null && cp.y >= 5 ? snapToDeck(out) : out;
  }
  var races = {
    cur: null, rings: [],
    list: function () { return raceDefs(); },
    def: function (id) {
      var list = races.list(), d = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === id) d = list[i];
      return d ? races.resolve(d) : null;
    },
    // a race definition (a strand's or an inline one) with its checkpoints and start resolved to world points
    resolve: function (d) {
      if (!d) return null;
      if (d.cps && d.startPt !== undefined) return d;
      var cps = [];
      if (d.ring && d.order) { var LP = loopPoints(), ring = LP[d.ring]; if (ring) for (var k = 0; k < d.order.length; k++) if (ring[d.order[k]]) cps.push(Object.assign({}, ring[d.order[k]])); }
      else for (var j = 0; j < (d.checkpoints || []).length; j++) { var c = resolveCheckpoint(d.checkpoints[j]); if (c) cps.push(c); }
      var start = d.start ? (d.start.ring ? resolveCheckpoint(d.start) : pos(d.start)) : null;
      if (start && d.start && d.start.y != null) { start.y = d.start.y; if (d.start.y >= 5) snapToDeck(start); }
      return Object.assign({}, d, { cps: cps, startPt: start, laps: d.laps || 1, racers: d.racers != null ? d.racers : SK.raceRacers });
    },
    unlocked: function (d) {
      var P = progress.loop_races, rq = d.requires; if (!rq) return true;
      if (rq.finished && !(P.finishes[rq.finished] > 0)) return false;
      if (rq.won && !(P.wins[rq.won] > 0)) return false;
      return true;
    },
    active: function () { return !!races.cur; },
    nextCheckpoint: function () { var r = races.cur; if (!r) return null; var cp = r.cps[r.player.cp]; return cp ? { x: cp.x, z: cp.z, y: cp.y } : null; },
    // opts: {mission, countdown, onFinish}
    begin: function (def, opts) {
      opts = opts || {};
      var p = player(), v = playerVehicle(), Wd = W();
      if (!def || !def.cps || def.cps.length < 2 || races.cur) return null;
      if (!v) { toast('Get in a car first'); return null; }
      var r = { def: def, cps: def.cps, laps: def.laps, racers: [], player: { v: v, cp: 0, lap: 0, finished: false, place: 0, outT: 0 }, countdown: opts.countdown != null ? opts.countdown : SK.raceCountdown,
        t: 0, finished: 0, mission: !!opts.mission, onFinish: opts.onFinish || null, bandT: 0, done: false, lastCount: -1 };
      v.setControls(0, 0, true, 1);
      // the field lines up beside the player
      var others = [{ x: v.x, z: v.z }], f = U.yawToDir(v.yaw), side = { x: -f.z, z: f.x };
      for (var i = 0; i < def.racers; i++) {
        var gx = v.x + side.x * (i % 2 ? 4.5 : -4.5) - f.x * (6 + 6 * Math.floor(i / 2)), gz = v.z + side.z * (i % 2 ? 4.5 : -4.5) - f.z * (6 + 6 * Math.floor(i / 2));
        var y = Wd.heightAt(gx, gz, v.y), spot = { x: gx, z: gz, y: y, yaw: v.yaw };
        if (Wd.solidAt(gx, gz, y + 0.5) || Math.abs(y - v.y) > 2) { var alt = vehicleSpot(v.x, v.z, 30, 'road', others, 4.3); if (alt) spot = alt; }
        others.push({ x: spot.x, z: spot.z });
        var rv = new GTP.Vehicle({ x: spot.x, z: spot.z, type: 'sports', color: ['#ff2d6f', '#ffd400', '#15e0ff', '#ff7a00'][i % 4], tag: 'racer', persistent: true });
        rv.y = spot.y; rv.yaw = spot.yaw; rv.maxHp = SK.racerHp; rv.hp = SK.racerHp; rv.snap(); E().add(rv);   // a racer survives the barriers it scrapes
        var route = [];
        // a leg is driven straight only when the line from the previous checkpoint is clear; a leg through a block paths on the
        // roads (QA-STR-04: lr_03's cp5 -> cp6 crosses a tower)
        for (var k = 0; k < def.cps.length; k++) { var pc = def.cps[(k + def.cps.length - 1) % def.cps.length]; route.push({ x: def.cps[k].x, z: def.cps[k].z, y: def.cps[k].y, r: SK.raceRing + 2, direct: segmentClear(pc, def.cps[k]) && (k > 0 || !def.startPt || segmentClear(def.startPt, def.cps[k])) }); }
        var racer = { v: rv, cp: 0, lap: 0, finished: false, place: 0, score: 0 };
        (function (rc) {
          rc.c = drivers.take(rv, 'route', { role: 'civ', speedMul: SK.raceSpeed, route: route, loop: true, track: false, onCheckpoint: function (ci) {
            rc.cp = ci + 1;
            if (rc.cp >= def.cps.length) { rc.cp = 0; rc.lap++; if (rc.lap >= def.laps && !rc.finished) { rc.finished = true; rc.place = ++races.cur.finished; drivers.release(rc.v); rc.v.setControls(0, 0, true, 1); } }
          } });
        })(racer);
        rv.setControls(0, 0, true, 1);
        r.racers.push(racer);
      }
      for (k = 0; k < def.cps.length; k++) { var ring = strandMarker(K.colors.objective, def.cps[k], { radius: SK.raceRing, height: 5 }); races.rings.push(ring); }
      races.cur = r;
      refreshMarkerVisibility();
      banner(def.name ? def.name.toUpperCase() : 'RACE', def.laps > 1 ? def.laps + ' LAPS' : null);
      GTP.Events.emit('race:start', { id: def.id, racers: def.racers, laps: def.laps });
      return r;
    },
    update: function (dt) {
      var r = races.cur; if (!r) return;
      var p = player(), v = r.player.v;
      if (r.countdown > 0) {
        r.countdown -= dt;
        var n = Math.ceil(r.countdown);
        if (n !== r.lastCount && n > 0) { r.lastCount = n; callUI('banner', String(n), r.def.name); sfx('ui', p.x, p.z, 0.5); }
        if (r.countdown <= 0) { callUI('banner', 'GO', r.def.name); sfx('mission', p.x, p.z, 0.7); for (var i = 0; i < r.racers.length; i++) r.racers[i].v.setControls(0, 0, false, 0); }
        else { v.setControls(0, 0, true, 1); return; }
      }
      r.t += dt;
      // the player's checkpoints
      if (!r.player.finished) {
        if (vehicleLost(v)) { races.finish('dnf', 'wreck'); return; }
        if (p.inVehicle !== v) { r.player.outT += dt; if (r.player.outT > SK.raceDnfLeave) { races.finish('dnf', 'left'); return; } } else r.player.outT = 0;
        var cp = r.cps[r.player.cp];
        if (cp && U.dist2d(v.x, v.z, cp.x, cp.z) <= SK.raceRing && Math.abs(v.y - cp.y) < 6) {
          r.player.cp++; sfx('ui', p.x, p.z, 0.6); fx({ type: 'ring', x: cp.x, y: cp.y + 0.1, z: cp.z, size: 9, life: 0.5, color: 0xffd45a });
          if (r.player.cp >= r.cps.length) { r.player.cp = 0; r.player.lap++; if (r.player.lap >= r.laps) { r.player.finished = true; r.player.place = ++r.finished; races.finish('finished'); return; } else banner('LAP ' + (r.player.lap + 1) + ' / ' + r.laps, null); }
        }
      }
      // rubber band: +-8% by the gap to the player, re-judged every second
      r.bandT += dt;
      if (r.bandT >= 1) {
        r.bandT = 0;
        var ps = races.score(r.player, r);
        for (i = 0; i < r.racers.length; i++) { var rc = r.racers[i]; if (rc.finished || !rc.c) continue; var diff = ps - races.score(rc, r); rc.c.speedMul = SK.raceSpeed * (1 + U.clamp(diff * 0.03, -SK.raceBand, SK.raceBand)); }
      }
      // the next ring breathes, the others sit low
      for (i = 0; i < races.rings.length; i++) { var m = races.rings[i]; if (!m) continue; var ud = m.userData; if (ud && ud.pulse) ud.pulse(i === r.player.cp ? 0.6 + 0.4 * Math.sin(simT() * 4) : 0.15); }
    },
    score: function (who, r) { var next = r.cps[who.cp], d = next ? U.dist2d(who.v.x, who.v.z, next.x, next.z) : 0; return who.lap * r.cps.length + who.cp + (next ? U.clamp(1 - d / 400, 0, 0.99) : 0); },
    position: function () {
      var r = races.cur; if (!r) return 0;
      var ps = races.score(r.player, r), ahead = 0;
      for (var i = 0; i < r.racers.length; i++) { var rc = r.racers[i]; if (rc.finished ? !r.player.finished : races.score(rc, r) > ps) ahead++; }
      return 1 + ahead;
    },
    hud: function () {
      var r = races.cur; if (!r) return { active: false };
      return { active: true, id: r.def.id, name: r.def.name, countdown: Math.max(0, r.countdown), position: r.player.finished ? r.player.place : races.position(), racers: r.racers.length + 1, lap: Math.min(r.laps, r.player.lap + 1), laps: r.laps, checkpoint: r.player.cp, total: r.cps.length, time: r.t };
    },
    finish: function (how, why) {
      var r = races.cur; if (!r || r.done) return;
      r.done = true;
      var P = progress.loop_races, id = r.def.id, res = { id: id, dnf: how === 'dnf', reason: why || null, place: r.player.place || (r.racers.length + 1), time: Math.round(r.t * 10) / 10 };
      if (!res.dnf) {
        P.finishes[id] = (P.finishes[id] || 0) + 1;
        var prizes = r.def.prizes || [], prize = prizes[res.place - 1] || 0, firstWin = res.place === 1 && !(P.wins[id] > 0);
        if (res.place === 1) P.wins[id] = (P.wins[id] || 0) + 1;
        if (P.best[id] == null || res.time < P.best[id]) P.best[id] = res.time;
        if (!r.mission) {
          var RL = raceRules();
          // the full purse once per race; a repeat win (or a repeat podium) pays a fifth of it (QA-STR-17)
          var repeat = res.place === 1 ? !firstWin : (P.finishes[id] > 1);
          if (prize && repeat) prize = Math.round(prize * SK.raceRepeatPay);
          if (prize) pay(prize, 'race');
          var smk = null; for (var mi = 0; mi < strandMarkers.length; mi++) if (strandMarkers[mi].id === id) smk = strandMarkers[mi];
          if (smk && SK.raceCooldown > 0) { smk.cooldown = SK.raceCooldown; refreshMarkerVisibility(); }
          addSubs(res.place === 1 ? (firstWin ? RL.subsFirstWin : RL.subsRepeat) : 0, 'race');
          var ord = ['1st', '2nd', '3rd', '4th'][res.place - 1] || res.place + 'th';
          if (!callUI('card', res.place === 1 ? 'passed' : 'failed', 'RACE: ' + ord.toUpperCase(), r.def.name + '  ' + U.fmtTime(res.time) + (prize ? '  ' + U.fmtMoney(prize) : ''))) toast('RACE: ' + ord + ' ' + U.fmtTime(res.time));
          cycle('loop_races', res.place, prize, { race: id, time: res.time });
          var list = races.list(), allWon = list.length > 0;
          for (var i = 0; i < list.length; i++) if (!(P.wins[list[i].id] > 0)) allWon = false;
          if (allWon && !flagHas('race_car')) { flagSet('race_car'); toast('THE RATIO is parked at Gus\'s Garage. SLOW IS A TAKE.'); }
        }
      } else if (!r.mission) { if (!callUI('card', 'failed', 'DNF', failText('dnf'))) toast('DNF'); }
      GTP.Events.emit('race:finish', res);
      var cb = r.onFinish;
      races.end(how);
      if (cb) { try { cb(res); } catch (e) { U.reportError(e, 'strands.race.finish'); } }
      if (cur && cur.id === 'loop_races') endCurrent('race');
    },
    end: function () {
      var r = races.cur; if (!r) return;
      races.cur = null;
      for (var i = 0; i < r.racers.length; i++) { var rc = r.racers[i]; drivers.release(rc.v); if (rc.v.driver) removeEntity(rc.v.driver); removeEntity(rc.v); }
      for (i = 0; i < races.rings.length; i++) dropMesh(races.rings[i]);
      races.rings.length = 0;
      refreshMarkerVisibility();
    }
  };
  // no building on the straight line between two points (sampled every 2 m at car height)
  function segmentClear(a, b) {
    var Wd = W(), dx = b.x - a.x, dz = b.z - a.z, l = Math.sqrt(dx * dx + dz * dz), n = Math.max(1, Math.ceil(l / 2));
    for (var i = 1; i < n; i++) { var t = i / n, x = a.x + dx * t, z = a.z + dz * t, y = U.lerp(a.y || 0, b.y || 0, t); if (Wd.solidAt(x, z, y + 0.8)) return false; }
    return true;
  }
  // a heckler's cardboard sign: the look changes, so the mesh is rebuilt
  function setSign(ped, text) {
    if (!ped || !ped.look) return;
    ped.look.sign = text;
    var Rd = GTP.Render;
    if (Rd && Rd.detach && Rd.attach) { try { Rd.detach(ped); Rd.attach(ped); } catch (e) { /* a sign is cosmetic */ } }
  }

  // ------------------------------------------------------------------------- the six strands --
  var S = {};
  // the content's passengers carry `archetype`, the DEFAULTS `name` (QA-STR-05)
  function fareName(def) { return (def && (def.name || def.archetype)) || 'a passenger'; }
  // Loud Cab (§5.1): fares in any taxi, started with `action` while stopped
  S.loud_cab = {
    title: 'Loud Cab',
    begin: function () {
      var v = playerVehicle(), D = strandData('loud_cab');
      if (!v || v.type !== 'taxi') return false;
      var P = progress.loud_cab;
      if (!P.queue.length) { P.queue = D.passengers.map(function (f) { return f.id; }); srng().shuffle(P.queue); }
      P.shifts++;
      cur = { id: 'loud_cab', title: 'Loud Cab', v: v, fare: null, shift: { fares: 0, money: 0, crashes: 0, streak: 0, hot: false }, nextT: 1.5, leaveT: 0, dmg: null };
      banner('LOUD CAB', 'FARE 1');
      cur.dmg = function (e) { var f = cur && cur.fare; if (f && f.phase === 'ride' && e && e.vehicle === cur.v && e.amount > 3) { f.crashed = true; cur.shift.crashes++; cur.shift.streak = 0; } };
      GTP.Events.on('vehicle:damage', cur.dmg);
      return true;
    },
    spawnFare: function () {
      var D = strandData('loud_cab'), P = progress.loud_cab, v = cur.v, Wd = W();
      if (!P.queue.length) { P.queue = D.passengers.map(function (f) { return f.id; }); srng().shuffle(P.queue); }
      var fid = P.queue.shift(), def = null;
      for (var i = 0; i < D.passengers.length; i++) if (D.passengers[i].id === fid) def = D.passengers[i];
      if (!def) def = D.passengers[0];
      var a = srng().random() * TAU, d = srng().range(SK.fareSpawnMin, SK.fareSpawnMax);
      var sp = Wd.nearestSidewalkPoint(v.x + Math.cos(a) * d, v.z + Math.sin(a) * d) || Wd.nearestSidewalkPoint(v.x + 40, v.z);
      var s = randomSpot(sp.x, sp.z, 0, 4, { clear: 1 });
      var ped = spawnCastPed(def.cast || def.id, s.x, s.z, 'npc', { brain: 'passenger', look: def.cast ? null : def.look, name: fareName(def) });
      ped.persistent = true;
      if (GTP.Cutscenes && GTP.Cutscenes.pose) GTP.Cutscenes.pose(ped, 'wave');
      // the destination: the line's landmark when it is 150..450 m away, else any landmark door in that band
      var dest = def.dest ? Wd.landmark(def.dest) : null, dd = dest ? U.dist2d(s.x, s.z, dest.door.x, dest.door.z) : 0;
      if (!dest || dd < 80 || dd > 600) {
        var cands = Wd.landmarks.filter(function (l) { if (!l.door) return false; var dl = U.dist2d(s.x, s.z, l.door.x, l.door.z); return dl >= SK.fareMin && dl <= SK.fareMax; });
        dest = cands.length ? srng().pick(cands) : Wd.landmarks[0];
      }
      var dist = U.dist2d(s.x, s.z, dest.door.x, dest.door.z);
      cur.fare = { def: def, ped: ped, dest: { x: dest.door.x, z: dest.door.z, y: dest.door.y || 0, name: dest.name }, dist: dist, phase: 'hail', holdT: 0, timer: dist / 9 + 20, total: dist / 9 + 20, crashed: false, late: false, mk: strandMarker(K.colors.objective, { x: ped.x, y: ped.y, z: ped.z }, { radius: 1.2, height: 5 }) };
    },
    update: function (dt) {
      var p = player(), v = cur.v, f = cur.fare, P = progress.loud_cab;
      if (vehicleLost(v)) { endCurrent('wreck'); return; }
      if ((p.wanted | 0) >= SK.fareWantedEnd && f) { endCurrent('wanted'); return; }
      // out of the cab for fareLeave seconds ends the shift, a fare aboard or not (QA-STR-10)
      if (p.inVehicle !== v) { cur.leaveT += dt; if (cur.leaveT > SK.fareLeave) { endCurrent('left'); return; } } else cur.leaveT = 0;
      if (!f) { cur.nextT -= dt; if (cur.nextT <= 0 && p.inVehicle === v) S.loud_cab.spawnFare(); return; }
      var t = f.ped;
      if (!t || t.removed || !t.alive) { S.loud_cab.dropFare(); cur.nextT = 2; toast('The fare walked. Respectfully.'); return; }
      if (f.phase === 'hail') {
        var d = U.dist2d(v.x, v.z, t.x, t.z) - (v.hl || 2);
        if (p.inVehicle === v && d <= SK.hailRadius && stopped(v)) f.holdT += dt; else f.holdT = 0;
        if (f.holdT >= SK.hailHold) {
          if (!t.enterVehicle(v, 1)) { f.holdT = 0; return; }
          if (GTP.Cutscenes && GTP.Cutscenes.pose) GTP.Cutscenes.pose(t, null);
          f.phase = 'boarding';
        }
      } else if (f.phase === 'boarding') {
        if (t.inVehicle === v) {
          f.phase = 'ride'; dropMesh(f.mk); f.mk = strandMarker(K.colors.objective, f.dest, { radius: 1.6, height: 7 });
          if (GTP.AI && GTP.AI.say) GTP.AI.say(t, f.def.line, '#ffd45a');
          banner('FARE ' + (cur.shift.fares + 1), f.dest.name);
        } else if (!t.entering) { if (U.dist2d(v.x, v.z, t.x, t.z) > 9) { f.phase = 'hail'; if (GTP.Cutscenes && GTP.Cutscenes.pose) GTP.Cutscenes.pose(t, 'wave'); } else t.enterVehicle(v, 1); }
      } else {
        f.timer -= dt; if (f.timer <= 0 && !f.late) { f.late = true; toast('The meter has opinions now.'); }
        if (t.inVehicle !== v) { S.loud_cab.dropFare(); cur.nextT = 3; return; }
        if (p.inVehicle === v && stopped(v) && U.dist2d(v.x, v.z, f.dest.x, f.dest.z) <= 14) {
          var fare = SK.fareBase + SK.farePerMetre * f.dist;
          if (!f.crashed) fare *= 1.5;
          if (f.late) fare *= 0.5;
          if (cur.shift.hot) fare *= 1.5;
          if (hasPerk('group_rate')) fare *= 1.25;
          if (flagHas('cab_livery')) fare *= 1.1;
          fare = Math.round(fare);
          v.exit(t); releasePed(t, false);
          if (GTP.AI && GTP.AI.say) GTP.AI.say(t, f.crashed ? 'Noted.' : 'Five stars. Rated a ten.', '#ffd45a');
          pay(fare, 'fare');
          cur.shift.fares++; cur.shift.money += fare; P.fares++;
          if (!f.crashed) { cur.shift.streak++; if (cur.shift.streak >= 3 && !cur.shift.hot) { cur.shift.hot = true; banner('HOT STREAK', 'fares x1.5'); } }
          if (cur.shift.fares > P.bestShift) P.bestShift = cur.shift.fares;
          if (cur.shift.money > P.bestMoney) P.bestMoney = cur.shift.money;
          addSubs(150, 'fare');
          S.loud_cab.unlocks();
          cycle('loud_cab', P.fares, fare, { shiftFares: cur.shift.fares });
          dropMesh(f.mk); cur.fare = null; cur.nextT = 2.5;
        }
      }
    },
    unlocks: function () {
      var D = strandData('loud_cab'), P = progress.loud_cab;
      for (var i = 0; i < (D.unlocks || []).length; i++) {
        var u = D.unlocks[i]; if (P.fares < u.fares || flagHas(u.flag)) continue;
        flagSet(u.flag); toast('LOUD CAB: ' + (u.text || u.flag));
        if (u.subs) addSubs(u.subs, 'cab'); if (u.ticker) callUI('ticker', u.ticker);
      }
    },
    dropFare: function () { var f = cur.fare; if (!f) return; if (f.ped && !f.ped.removed) { if (f.ped.inVehicle) f.ped.inVehicle.exit(f.ped); releasePed(f.ped, false); } dropMesh(f.mk); cur.fare = null; },
    end: function (why) {
      var f = cur.fare;
      if (f && f.ped && !f.ped.removed && GTP.AI && GTP.AI.say && why !== 'shift') GTP.AI.say(f.ped, 'Respectfully, I\'ll walk.', '#ffd45a');
      S.loud_cab.dropFare();
      GTP.Events.off('vehicle:damage', cur.dmg);
      var sh = cur.shift;
      toast('Shift over: ' + sh.fares + ' fare' + (sh.fares === 1 ? '' : 's') + ', ' + U.fmtMoney(sh.money) + (why === 'wanted' ? '. The passenger bailed.' : why === 'wreck' ? '. The cab is a take now.' : '.'));
    },
    hud: function () { var f = cur.fare, sh = cur.shift; return { line: f ? (f.phase === 'ride' ? 'FARE ' + (sh.fares + 1) + ' to ' + f.dest.name : 'Pick up ' + fareName(f.def)) : 'Waiting for a hail', timer: f && f.phase === 'ride' ? { remaining: Math.max(0, f.timer), total: f.total } : null, progress: sh.fares + ' fares  ' + U.fmtMoney(sh.money) + (sh.hot ? '  HOT STREAK' : ''), target: f ? (f.phase === 'ride' ? f.dest : { x: f.ped.x, z: f.ped.z, y: f.ped.y }) : null }; },
    canStart: function (v) { return !!v && v.type === 'taxi'; }
  };
  // HOA Patrol (§5.2): flagged cars that flee; stop them
  S.hoa_patrol = {
    title: 'HOA Patrol',
    // the strand's own SUV at the HOA Hall is tagged 'hoasuv': suburb traffic SUVs carry 'hoa' (QA-STR-11)
    canStart: function (v) { return !!v && (v.type === 'cop' || (v.type === 'suv' && v.tag === 'hoasuv')); },
    begin: function () {
      var v = playerVehicle(); if (!S.hoa_patrol.canStart(v)) return false;
      progress.hoa_patrol.patrols++;
      cur = { id: 'hoa_patrol', title: 'HOA Patrol', v: v, level: 1, target: null, nextT: 2, timer: 0, total: 0, holdT: 0, leaveT: 0, violation: null, mk: null };
      banner('HOA PATROL', 'LEVEL 1');
      return true;
    },
    flag: function () {
      var D = strandData('hoa_patrol'), v = cur.v, list = E().list, best = null, bd = 1e9;
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o.kind !== 'vehicle' || o.removed || o.wreck || o.sinking || o === v || o.persistent || o.isPolice || o.type === 'cop' || o.type === 'bus' || o.type === 'bike' || !o.driver || o.hasPlayer()) continue;
        var d = U.dist2d(o.x, o.z, v.x, v.z); if (d < SK.hoaTargetMin || d > SK.hoaTargetMax) continue;
        // a violator already on the move (not one boxed in at a light or behind a jam) makes the chase: a stopped car costs 60 m of score
        var s = Math.abs(d - (SK.hoaTargetMin + SK.hoaTargetMax) / 2) + (Math.abs(o.speed) < 2 ? 60 : 0); if (s < bd) { bd = s; best = o; }
      }
      if (!best) { var rp = W().nearestRoadPoint(v.x + srng().range(-160, 160), v.z + srng().range(-160, 160)); if (!rp || U.dist2d(rp.x, rp.z, v.x, v.z) < 40) return false; best = new GTP.Vehicle({ x: rp.x, z: rp.z, type: 'sedan', persistent: true }); best.y = W().heightAt(rp.x, rp.z, 0); best.yaw = U.dirToYaw(rp.dx, rp.dz); best.snap(); E().add(best); }
      drivers.take(best, 'flee', { role: 'civ', speedMul: 0.9 });
      best.hoaFlagged = true;
      cur.target = best; cur.violation = srng().pick(D.violations); cur.holdT = 0;
      cur.timer = cur.total = 90 + 30 * cur.level;
      cur.mk = strandMarker(K.colors.hoa, { x: best.x, y: best.y, z: best.z }, { radius: 1.4, height: 6 });
      banner('VIOLATION: ' + cur.violation, 'LEVEL ' + cur.level);
      return true;
    },
    update: function (dt) {
      var p = player(), v = cur.v, t = cur.target, P = progress.hoa_patrol, D = strandData('hoa_patrol');
      if (vehicleLost(v)) { endCurrent('wreck'); return; }
      if (p.inVehicle !== v) { cur.leaveT += dt; if (cur.leaveT > SK.hoaLeave) { endCurrent('left'); return; } } else cur.leaveT = 0;
      if (!t) { cur.nextT -= dt; if (cur.nextT <= 0) { if (!S.hoa_patrol.flag()) cur.nextT = 2; } return; }
      if (cur.mk) cur.mk.position.set(t.x, t.y, t.z);
      cur.timer -= dt;
      if (cur.timer <= 0) { endCurrent('timer'); return; }
      var d = t.edgeDistance ? t.edgeDistance(v.x, v.z) : U.dist2d(t.x, t.z, v.x, v.z), near = d <= SK.stopNear + (v.hl || 0);
      if (near && Math.abs(t.speed) < 1) cur.holdT += dt; else cur.holdT = Math.max(0, cur.holdT - dt * 0.5);
      state.holdBar = cur.holdT > 0 ? { k: Math.min(1, cur.holdT / SK.hoaStopHold), text: 'STOPPED' } : null;
      if (cur.holdT >= SK.hoaStopHold || vehicleLost(t)) {
        state.holdBar = null;
        drivers.release(t); t.hoaFlagged = false; if (!vehicleLost(t)) { t.setControls(0, 0, true, 1); if (t.driver && GTP.AI && GTP.AI.say) GTP.AI.say(t.driver, 'It was ADJACENT.', '#ffd45a'); }
        dropMesh(cur.mk); cur.mk = null; cur.target = null;
        var reward = 150 + 50 * cur.level;
        pay(reward, 'hoa'); addSubs(200, 'hoa'); P.stops++;
        if (cur.level > P.best) P.best = cur.level;
        cycle('hoa_patrol', cur.level, reward, { violation: cur.violation });
        if (cur.level >= D.bonusLevel && !P.bonus) { P.bonus = true; pay(D.bonusCash, 'hoa'); flagSet('hoa_vest'); toast('HOA bonus: ' + U.fmtMoney(D.bonusCash) + '. A Firmness Vest waits in the SUV at the HOA Hall.'); }
        if (cur.level >= (D.truceLevel || SK.hoaLevels)) { flagSet('hoa_truce'); if (!callUI('card', 'passed', 'PATROL COMPLETE', 'The HOA declares a truce. Their star is yours. It never fills.')) toast('HOA TRUCE'); endCurrent('complete'); return; }
        cur.level++; cur.nextT = SK.hoaNextDelay;
        banner('LEVEL ' + cur.level, 'in ' + SK.hoaNextDelay + ' s');
      }
    },
    end: function (why) {
      var t = cur.target; state.holdBar = null;
      if (t && !t.removed) { drivers.release(t); t.hoaFlagged = false; }
      dropMesh(cur.mk);
      if (why !== 'complete') toast('Patrol over at level ' + cur.level + (why === 'timer' ? ': they got away.' : '.'));
    },
    hud: function () { var t = cur.target; return { line: t ? 'VIOLATION: ' + cur.violation : 'Looking for a violation', timer: t ? { remaining: Math.max(0, cur.timer), total: cur.total } : null, progress: 'LEVEL ' + cur.level, target: t && !t.removed ? { x: t.x, z: t.z, y: t.y } : null }; }
  };
  // Sponsor Runs (§5.3): the Nap Dynasty van's delivery chain
  // the content keeps `stops`, `runs`, `start.vehicle.parkedAt / after` and `fullRead.bonus`; the DEFAULTS keep the GDD names
  function sponsorData() {
    var D = strandData('sponsor_runs'), sv = D.start && D.start.vehicle;
    return Object.assign({}, D, { sponsors: D.stops || D.sponsors, chain: D.runs || D.chain, depot: (sv && sv.parkedAt) || D.depot, requires: (sv && sv.after) || D.requires, bonus: (D.fullRead && D.fullRead.bonus) || D.bonus,
      lifetimeSubsAt: D.lifetimeSubsAt || ((D.unlocks || []).filter(function (u) { return u.runs; })[0] || {}).runs || 24 });
  }
  S.sponsor_runs = {
    title: 'Sponsor Runs',
    begin: function () {
      var v = playerVehicle(), D = sponsorData();
      if (!v || v.tag !== 'sponsorvan') return false;
      var order = D.sponsors.slice(); srng().shuffle(order);
      cur = { id: 'sponsor_runs', title: 'Sponsor Runs', v: v, order: order, i: 0, run: null, leaveT: 0, dmg: null };
      cur.dmg = function (e) { if (cur && cur.run && e && e.vehicle === cur.v && e.amount > 3) cur.run.crashes++; };
      GTP.Events.on('vehicle:damage', cur.dmg);
      S.sponsor_runs.next();
      return true;
    },
    next: function () {
      var D = sponsorData(), id = cur.order[cur.i], lm = W().landmark(id);
      if (!lm || !lm.door) { cur.i++; if (cur.i >= cur.order.length) { endCurrent('complete'); return; } S.sponsor_runs.next(); return; }
      var dist = U.dist2d(cur.v.x, cur.v.z, lm.door.x, lm.door.z), total = Math.max(60, dist / 9 + 20);
      cur.run = { lm: lm, dest: { x: lm.door.x, z: lm.door.z, y: lm.door.y || 0 }, dist: dist, timer: total, total: total, crashes: 0, late: false, mk: strandMarker(K.colors.objective, { x: lm.door.x, y: lm.door.y || 0, z: lm.door.z }, { radius: 1.6, height: 7 }) };
      banner('SPONSOR RUN ' + (cur.i + 1) + '/' + D.chain, lm.name);
    },
    update: function (dt) {
      var p = player(), v = cur.v, r = cur.run, P = progress.sponsor_runs, D = sponsorData();
      if (vehicleLost(v)) { endCurrent('wreck'); return; }
      if (p.inVehicle !== v) { cur.leaveT += dt; if (cur.leaveT > SK.sponsorLeave) { endCurrent('left'); return; } } else cur.leaveT = 0;
      if (!r) return;
      r.timer -= dt; if (r.timer <= 0 && !r.late) { r.late = true; toast('Code TAKES20 has expired. Firmness: 11.'); }
      if (p.inVehicle === v && stopped(v) && U.dist2d(v.x, v.z, r.dest.x, r.dest.z) <= SK.sponsorArrive) {
        var payN = r.late ? SK.sponsorMinPay : Math.max(SK.sponsorMinPay, 250 + r.dist / 2 - SK.sponsorCrash * r.crashes);
        if (flagHas('sponsored_van')) payN *= 1.5;
        if (hasPerk('group_rate')) payN *= 1.25;
        payN = Math.round(payN);
        pay(payN, 'sponsor'); addSubs(150, 'sponsor'); P.runs++;
        toast('Delivered. Firmness ' + (7 + 2 * Math.min(2, r.crashes)) + '. ' + U.fmtMoney(payN));
        dropMesh(r.mk); cur.run = null; cur.i++;
        if (cur.i > P.bestChain) P.bestChain = cur.i;
        cycle('sponsor_runs', cur.i, payN, { landmark: r.lm.id });
        if (P.runs >= D.lifetimeSubsAt && !flagHas('pod3')) { flagSet('pod3'); addSubs(10000, 'sponsor'); toast('The pod van gains two more faces. Both yours.'); }
        if (cur.i >= D.chain) { endCurrent('complete'); return; }
        S.sponsor_runs.next();
      }
    },
    end: function (why) {
      var D = sponsorData(), P = progress.sponsor_runs;
      if (cur.run) dropMesh(cur.run.mk);
      GTP.Events.off('vehicle:damage', cur.dmg);
      if (why === 'complete') {
        P.fullReads++; pay(D.bonus, 'sponsor');
        if (!flagHas('sponsored_van')) { flagSet('sponsored_van'); var van = liveTagged('podvan'); if (van) { van.maxHp = 320; van.hp = Math.max(van.hp, 320); } toast('FULL READ. The pod van is wrapped in mattress: 320 hp.'); }
        if (!callUI('card', 'passed', 'FULL READ', 'Eight runs. ' + U.fmtMoney(D.bonus) + '. Code TAKES20.')) toast('FULL READ: ' + U.fmtMoney(D.bonus));
      } else toast('Sponsor chain over after ' + cur.i + ' run' + (cur.i === 1 ? '' : 's') + '.');
    },
    hud: function () { var r = cur.run, D = sponsorData(); return { line: r ? 'SPONSOR RUN ' + (cur.i + 1) + '/' + D.chain + ': ' + r.lm.name : 'SPONSOR RUNS', timer: r ? { remaining: Math.max(0, r.timer), total: r.total } : null, progress: r ? 'FIRMNESS ' + (7 + 2 * Math.min(2, r.crashes)) : '', target: r ? r.dest : null }; }
  };
  // Ratio Rampages (§5.4): pink bubbles; a weapon, hecklers, a clock
  S.ratio_rampages = {
    title: 'Ratio Rampages',
    begin: function (def) {
      var p = player(), CB = GTP.Combat; if (!def || !CB) return false;
      cur = { id: 'ratio_rampages', title: 'Ratio Rampage', def: def, countdown: SK.rampageCountdown, t: 0, timer: def.seconds, kills: 0, wrong: 0, spawned: 0, hecklers: [], cars: [], before: { weapons: Object.assign({}, p.weapons), ammo: copyAmmo(p.ammo), weapon: p.weapon }, started: false, center: pos(def), done: false };
      var w = CB.WEAPONS[def.weapon];
      if (w) { if (w.melee) p.weapons[def.weapon] = Infinity; else { var need = Math.max(def.hecklers * 6, (w.mag || 1) * 3); cur.loan = need; p.weapons[def.weapon] = (p.weapons[def.weapon] || 0) + need; if (CB.ammo) CB.ammo(p, def.weapon); } p.weapon = def.weapon; }
      if (!callUI('card', 'passed', 'RATIO RAMPAGE', (CB.weaponName ? CB.weaponName(def.weapon) : def.weapon).toUpperCase() + ' · ' + def.hecklers + ' HECKLERS · ' + def.seconds + ' s')) toast('RATIO RAMPAGE: ' + def.hecklers + ' hecklers, ' + def.seconds + ' s');
      refreshMarkerVisibility();   // the bubble goes out for the duration
      return true;
    },
    wave: function () {
      var RR = rampageRules(), def = cur.def, p = player(), waveN = def.waveSize || SK.rampageWave, radius = def.waveRadius || SK.rampageRadius, n = Math.min(waveN, def.hecklers - cur.spawned);
      if (def.cars) {
        var carsLeft = def.cars - cur.cars.length; if (carsLeft <= 0) return;
        for (var c = 0; c < Math.min(2, carsLeft); c++) {
          var spot = vehicleSpot(p.x + srng().range(-70, 70), p.z + srng().range(-70, 70), 50, 'road', cur.cars, 4.5); if (!spot) continue;
          var v = new GTP.Vehicle({ x: spot.x, z: spot.z, type: 'sedan', color: '#ff3fa4', tag: 'heckler', persistent: true }); v.y = spot.y; v.yaw = spot.yaw; v.snap(); E().add(v);
          var h1 = spawnHostile('thug', spot.x, spot.z, null, {}), h2 = spawnHostile('thug', spot.x, spot.z, null, {});
          setSign(h1, srng().pick(RR.signs)); setSign(h2, srng().pick(RR.signs));
          v.enter(h1, 0); v.enter(h2, 1); h1.ai = missionBrain('driver'); h2.ai = missionBrain('driver');
          drivers.take(v, 'ram', { role: 'thug', speedMul: 0.7, track: false });
          v.hecklerCar = true; v.hecklers = [h1, h2]; cur.cars.push(v); cur.hecklers.push(h1, h2); cur.spawned += 2;
        }
        return;
      }
      for (var i = 0; i < n; i++) {
        var s = randomSpot(p.x, p.z, def.tight ? 10 : 18, radius, { roads: true, clear: 1.2 });
        var h = spawnHostile('thug', s.x, s.z, null, {});
        setSign(h, srng().pick(RR.signs));
        cur.hecklers.push(h); cur.spawned++;
      }
      sfx('siren', p.x, p.z, 0.2);
    },
    update: function (dt) {
      var p = player(), def = cur.def;
      if (cur.countdown > 0) { cur.countdown -= dt; var n = Math.ceil(cur.countdown); if (n !== cur.lastN && n > 0) { cur.lastN = n; callUI('banner', String(n), 'RATIO RAMPAGE'); } if (cur.countdown > 0) return; callUI('banner', 'GO', (GTP.Combat && GTP.Combat.weaponName ? GTP.Combat.weaponName(def.weapon) : def.weapon).toUpperCase()); S.ratio_rampages.wave(); }
      cur.t += dt; cur.timer -= dt;
      var live = 0, kills = 0, i, k;
      // a wrecked heckler car counts for both hecklers (destroy-style)
      for (i = 0; i < cur.cars.length; i++) { var cv = cur.cars[i]; if (cv.wreck && !cv._counted) { cv._counted = true; for (k = 0; k < cv.hecklers.length; k++) { var hk = cv.hecklers[k]; hk._counted = true; if (hk.alive && !hk.removed) { if (hk.inVehicle) hk.inVehicle.exit(hk); removeEntity(hk); } } } }
      for (i = 0; i < cur.hecklers.length; i++) {
        var h = cur.hecklers[i];
        if (h._counted) { kills++; continue; }
        if (h._wrong) continue;
        if (h.alive && !h.removed) { live++; continue; }
        var ok = h.lastHitType === def.weapon || (def.weapon === 'fist' && h.lastHitType === 'punch');
        // a wrong take does not count and the heckler is back at the next wave
        if (ok) { h._counted = true; kills++; } else { h._wrong = true; cur.wrong++; cur.spawned--; textFx('WRONG TAKE', h.x, h.y + 2, h.z, '#ff3fa4', 1.4); }
      }
      cur.kills = kills;
      if (kills >= def.hecklers) { S.ratio_rampages.finish(true); return; }
      if (cur.timer <= 0) { S.ratio_rampages.finish(false, 'timeout'); return; }
      if (live <= 1 && cur.spawned < def.hecklers) S.ratio_rampages.wave();
    },
    finish: function (win, why) {
      var P = progress.ratio_rampages, def = cur.def, p = player(), mk = S.ratio_rampages.markerFor(def.id);
      cur.won = !!win;
      if (win) {
        var first = P.best[def.id] == null, t = Math.round(cur.t * 10) / 10;
        if (first || t < P.best[def.id]) P.best[def.id] = t;
        var RR = rampageRules();
        if (first) { P.done++; pay(def.reward, 'rampage'); }
        addSubs(RR.subsPerCompletion || 2000, 'rampage');
        if (!callUI('card', 'passed', 'RAMPAGE COMPLETE', def.hecklers + ' hecklers in ' + U.fmtTime(t) + (first ? '  ' + U.fmtMoney(def.reward) : '  (replay)'))) toast('RAMPAGE COMPLETE: ' + U.fmtTime(t));
        cycle('ratio_rampages', P.done, first ? def.reward : 0, { rampage: def.id, time: t });
        if (mk) mk.cooldown = RR.markerReturnReplay || SK.rampageReplay;
        var allId = (RR.allEight && RR.allEight.flag) || 'rampage_king';
        if (P.done >= rampageDefs().length && !flagHas(allId)) { flagSet(allId); toast('RAMPAGE KING: ' + ((RR.allEight && RR.allEight.text) || 'every reserve is x1.5 and the ammo readout is pink.')); }
      } else {
        if (!callUI('card', 'failed', 'CONTEXT STAMPED', why === 'dead' ? 'You got ratio\'d by the hecklers.' : why === 'busted' ? 'Deplatformed mid-rampage.' : 'Out of time. ' + cur.kills + ' / ' + def.hecklers)) toast('Rampage failed');
        if (mk) mk.cooldown = rampageRules().markerReturnFail || SK.rampageRespawn;
      }
      refreshMarkerVisibility();
      endCurrent(win ? 'complete' : why);
      void p;
    },
    end: function () {
      var p = player(), def = cur.def;
      for (var i = 0; i < cur.hecklers.length; i++) { var h = cur.hecklers[i]; if (h && !h.removed) { if (h.inVehicle) h.inVehicle.exit(h); if (h.alive) releasePed(h, true); else removeEntity(h); } }
      for (i = 0; i < cur.cars.length; i++) { var v = cur.cars[i]; if (v && !v.removed) { drivers.release(v); v.persistent = false; } }
      // the loaner goes back. On a win the player keeps what they had plus the unused loaner rounds, capped at the weapon's
      // mag + reserve (QA-STR-06); on a fail, a death or a bust the loaner is the job's and goes back whole (QA-STR-07); a weapon
      // the shop still locks is never kept from a loaner
      var w = def.weapon, left = p.weapons[w], had = cur.before.weapons[w] || 0, won = cur.won === true;
      p.weapons = Object.assign({ fist: Infinity }, cur.before.weapons); p.ammo = copyAmmo(cur.before.ammo);
      if (won && left === Infinity) p.weapons[w] = Infinity;
      else if (won && left > 0 && had !== Infinity && (had > 0 || !shopLocked(w))) {
        var keep = Math.max(had, Math.min(left, weaponCap(w)));
        if (keep > 0) p.weapons[w] = keep;
        if (p.ammo) delete p.ammo[w];
        if (GTP.Combat && GTP.Combat.ammo && keep > 0) GTP.Combat.ammo(p, w);
      }
      p.weapon = p.weapons[cur.before.weapon] ? cur.before.weapon : 'fist';
    },
    markerFor: function (id) { for (var i = 0; i < strandMarkers.length; i++) if (strandMarkers[i].id === id) return strandMarkers[i]; return null; },
    hud: function () { var def = cur.def; return { line: 'Hecklers ratioed: ' + cur.kills + ' / ' + def.hecklers, timer: cur.countdown > 0 ? null : { remaining: Math.max(0, cur.timer), total: def.seconds }, progress: (GTP.Combat && GTP.Combat.weaponName ? GTP.Combat.weaponName(def.weapon) : def.weapon) + (cur.wrong ? '  WRONG TAKES ' + cur.wrong : ''), target: null, countdown: Math.max(0, cur.countdown) }; }
  };
  // a weapon's carry cap (mag + reserve) and whether the shop still locks it
  function weaponCap(id) { var CB = GTP.Combat, w = CB && CB.WEAPONS ? CB.WEAPONS[id] : null; if (!w) return Infinity; var c = (w.mag || 0) + (w.reserve || w.maxReserve || 0); return c > 0 ? c : Infinity; }
  function shopLocked(id) {
    var sh = GTP.Combat && GTP.Combat.shop; if (!sh || !sh.items) return false;
    try { var it = sh.items('weapons'); for (var i = 0; i < it.length; i++) if (it[i].weapon === id) return !!it[i].locked; } catch (e) { /* shop optional */ }
    return false;
  }
  // Monday Memos (§5.5): fifty envelopes, one memo
  var memoPickups = {}, memoGeo = null;
  S.monday_memos = {
    title: 'Monday Memos',
    place: function () {
      var list = memoDefs(), P = progress.monday_memos, CB = GTP.Combat;
      for (var id in memoPickups) { if (memoPickups[id] && !memoPickups[id].removed) removeEntity(memoPickups[id]); }
      memoPickups = {};
      if (!CB || !CB.spawnPickup) return;
      for (var i = 0; i < list.length; i++) {
        var d = list[i]; if (P.collected.indexOf(d.id) >= 0) continue;
        var pt = pos(d.at); if (!pt) continue;
        var y = d.at.y != null ? W().heightAt(pt.x, pt.z, d.at.y) : pt.y;
        var r = W().resolveCapsule(pt.x, pt.z, y + 0.5, 0.5);
        var pk = CB.spawnPickup({ type: 'memo', x: r.x, z: r.z, y: y, persistent: true, label: 'RESPECTFULY', tag: 'memo' });
        pk.memoId = d.id; pk.memoLine = d.line;
        S.monday_memos.restyle(pk);
        memoPickups[d.id] = pk;
      }
    },
    // the envelope: beige, a red RESPECTFULY stamp, a faint pink glow (the default pickup mesh is a crate). One vertex-coloured
    // mesh plus the glow sprite: two draw calls, and the mesh hides beyond 70 m so fifty memos never weigh on the frame
    restyle: function (pk) {
      var m = pk.mesh; if (!m || !window.THREE) return;
      try {
        while (m.children.length) m.remove(m.children[0]);
        if (!memoGeo) {
          var gb = new GTP.GeoBuilder({ color: true });
          gb.box(-0.25, 0, -0.17, 0.5, 0.05, 0.34, null, [0.91, 0.86, 0.74]);
          gb.box(-0.23, 0.05, -0.17, 0.46, 0.012, 0.16, null, [0.84, 0.78, 0.64]);
          gb.box(0.02, 0.062, 0.0, 0.16, 0.012, 0.1, null, [0.78, 0.13, 0.16]);
          gb.box(-0.2, 0.062, 0.05, 0.2, 0.008, 0.02, null, [0.35, 0.3, 0.3]);
          memoGeo = gb.build();
        }
        var env = new THREE.Mesh(memoGeo, GTP.Assets.propMaterial()); env.castShadow = true; env.rotation.y = 0.4; m.add(env);
        if (GTP.Assets && GTP.Assets.glow) { var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GTP.Assets.glow, color: 0xff3fa4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 })); sp.scale.set(1.8, 1.8, 1); sp.position.y = 0.2; m.add(sp); }
        pk.drawDist = 70;   // Pickup.syncMesh hides the envelope beyond 70 m of the camera
      } catch (e) { U.reportError(e, 'strands.memo.mesh'); }
    },
    collect: function (pk) {
      var list = memoDefs(), P = progress.monday_memos, p = player(), id = pk.memoId, CB = GTP.Combat;
      if (!id || P.collected.indexOf(id) >= 0) return;
      P.collected.push(id); delete memoPickups[id];
      var n = P.collected.length, total = list.length, R = contentStrands().memoRules || {};
      toast('MEMO ' + n + '/' + total + ': ' + (pk.memoLine || ''));
      textFx('MEMO ' + n + '/' + total, pk.x, pk.y + 1.6, pk.z, '#ff3fa4', 1.6);
      addSubs(R.subsPerMemo || 400, 'memo');
      // the thresholds (GDD §5.5): a weapon, cash, armor, a flag, a card, a ticker line
      var th = memoThresholds();
      for (var i = 0; i < th.length; i++) {
        var t = th[i]; if (t.count !== n) continue;
        if (t.weapon && CB && CB.WEAPONS && CB.WEAPONS[t.weapon]) {
          var w = CB.WEAPONS[t.weapon];
          if (w.melee) { if (!(p.weapons[t.weapon] > 0)) p.weapons[t.weapon] = Infinity; }
          else if (CB.giveAmmo) CB.giveAmmo(p, t.weapon, t.ammo || (w.mag || 1) * 2, false); else p.weapons[t.weapon] = (p.weapons[t.weapon] || 0) + (t.ammo || 10);
        }
        if (t.money) pay(t.money, 'memo');
        if (t.armor) p.armor = Math.max(p.armor || 0, t.armor);
        if (t.flag) flagSet(t.flag);
        if (t.count === 20) flagSet('memo_vest');
        if (t.subs) addSubs(t.subs, 'memo');
        if (t.card) { if (!callUI('card', 'passed', 'THE LAST PAGE', t.card)) toast('THE LAST PAGE: ' + t.card); }
        if (t.ticker) callUI('ticker', t.ticker);
        if (t.text) toast(t.text);
        if (t.count >= total) flagSet('memo_complete');
      }
      cycle('monday_memos', n, 0, { memo: id });
      GTP.Events.emit('memo', { id: id, n: n, total: total });
    },
    count: function () { return progress.monday_memos.collected.length; },
    byDistrict: function () {
      var list = memoDefs(), P = progress.monday_memos, out = {};
      for (var i = 0; i < list.length; i++) { var pt = pos(list[i].at); if (!pt) continue; var d = W().districtAt(pt.x, pt.z), k = d ? (d.name || d.id) : 'the water'; out[k] = out[k] || { n: 0, total: 0 }; out[k].total++; if (P.collected.indexOf(list[i].id) >= 0) out[k].n++; }
      return out;
    }
  };
  // Loop Races (§5.6) and Stunt Jumps (§5.7) run through `races` and `stunts`; the strand entries carry their start rules
  S.loop_races = {
    title: 'Loop Races',
    begin: function (def) {
      var d = typeof def === 'string' ? races.def(def) : def; if (!d) return false;
      var r = races.begin(d, {}); if (!r) return false;
      cur = { id: 'loop_races', title: d.name || 'Race', race: r };
      return true;
    },
    update: function () { },
    end: function (why) { if (races.cur && why !== 'race') races.end(why); },
    hud: function () { var h = races.hud(); return { line: h.active ? (h.countdown > 0 ? h.name + ' in ' + Math.ceil(h.countdown) : 'P' + h.position + ' / ' + h.racers + '   LAP ' + h.lap + ' / ' + h.laps) : '', timer: null, progress: h.active ? 'CHECKPOINT ' + h.checkpoint + ' / ' + h.total + '  ' + U.fmtTime(h.time) : '', target: races.nextCheckpoint(), race: h }; }
  };
  S.stunt_jumps = { title: 'Stunt Jumps', begin: function () { return false; }, update: function () { }, end: function () { }, hud: function () { return { line: '' }; } };

  // --------------------------------------------------------------------------- the runtime --
  function rebuildMarkers() {
    for (var i = 0; i < strandMarkers.length; i++) dropMesh(strandMarkers[i].mesh);
    strandMarkers.length = 0;
    var RR = rampageDefs();
    for (i = 0; i < RR.length; i++) {
      var d = RR[i], pt = pos(d.at); if (!pt) continue;
      var r = W().resolveCapsule(pt.x, pt.z, pt.y + 0.5, 0.6); pt.x = r.x; pt.z = r.z;
      strandMarkers.push({ id: d.id, kind: 'rampage', icon: 'rampage', x: pt.x, z: pt.z, y: pt.y, mesh: strandMarker(K.colors.strand, pt, { radius: 1.6, height: 7 }), data: d, armed: true, holdT: 0, cooldown: 0, title: 'Ratio Rampage: ' + (GTP.Combat && GTP.Combat.weaponName ? GTP.Combat.weaponName(d.weapon) : d.weapon) });
    }
    var list = races.list();
    for (i = 0; i < list.length; i++) {
      var rd = races.def(list[i].id); if (!rd || !rd.startPt) continue;
      strandMarkers.push({ id: rd.id, kind: 'race', icon: 'race', x: rd.startPt.x, z: rd.startPt.z, y: rd.startPt.y, mesh: strandMarker(K.colors.objective, rd.startPt, { radius: 2.4, height: 3.5 }), data: rd, armed: true, holdT: 0, cooldown: 0, title: rd.name });
    }
    refreshMarkerVisibility();
  }
  function refreshMarkerVisibility() {
    for (var i = 0; i < strandMarkers.length; i++) {
      // the start light goes out while its race runs, and the rampage bubble while its rampage runs (a 7 m pink light the player stands in)
      var mk = strandMarkers[i], show = mk.cooldown <= 0 && (mk.kind !== 'race' || (races.unlocked(mk.data) && !(races.cur && races.cur.def.id === mk.id)))
        && !(mk.kind === 'rampage' && cur && cur.id === 'ratio_rampages' && cur.def && cur.def.id === mk.id);
      if (mk.mesh) mk.mesh.visible = show;
      mk.visible = show;
    }
  }
  // the strand-owned vehicles that live in the world: the sponsor van (after m02_read), THE RATIO (race_car), the home cab, the HOA SUV
  function ensureVehicles() {
    var Wd = W(), p = player(); if (!p) return;
    function ensure(tag, lmId, type, opts) {
      if (liveTagged(tag)) return;
      var lm = Wd.landmark(lmId); if (!lm || !lm.door) return;
      var cls = C.VEHICLES[type] || C.VEHICLES.van, spot = vehicleSpot(lm.door.x, lm.door.z, 40, 'parking', null, cls.length); if (!spot) return;
      var v = new GTP.Vehicle({ x: spot.x, z: spot.z, type: type, color: opts.color, wrap: opts.wrap, tag: tag, persistent: true });
      v.y = spot.y; v.yaw = spot.yaw; v.keep = true; v.snap(); E().add(v);
      if (opts.hp) { v.maxHp = opts.hp; v.hp = opts.hp; }
      if (opts.pickup && GTP.Combat && GTP.Combat.spawnPickup) { var pk = GTP.Combat.spawnPickup({ type: 'armor', value: 100, x: spot.x + 2.2, z: spot.z, persistent: true, respawn: 24 * C.DAY.secondsPerHour, label: 'FIRMNESS VEST', tag: 'strand' }); void pk; }
    }
    var SR = sponsorData();
    if (state.completed.has(SR.requires || 'm02_read')) ensure('sponsorvan', SR.depot || 'nap_depot', 'van', { color: '#2d5f8a', wrap: 'nap' });
    if (flagHas('race_car')) ensure('ratiocar', 'pod_garage', 'sports', { color: '#ff3fa4', wrap: 'ratio' });
    if (flagHas('cab_home')) ensure('homecab', 'pod_garage', 'taxi', { color: '#ffc21a' });
    if (state.completed.has('m10_pellets')) ensure('hoasuv', 'hoa_hall', 'suv', { color: '#f4ead8' });
    if (flagHas('sponsored_van')) { var van = liveTagged('podvan'); if (van && van.maxHp < 320) { van.maxHp = 320; van.hp = Math.max(van.hp, 320); } }
    // the vests appear when their flag is set, not only when the car is first parked (QA-STR-11, QA-STR-15): the Firmness Vest by
    // the HOA SUV after patrol level 6, the memo-20 vest by the pod garage
    if (flagHas('hoa_vest')) ensureVest('hoa', liveTagged('hoasuv'), 'FIRMNESS VEST');
    if (flagHas('memo_vest')) { var pg = Wd.landmark('pod_garage'); ensureVest('memo', pg && pg.door ? { x: pg.door.x, z: pg.door.z } : null, 'MEMO VEST'); }   // the garage, never the moving van
  }
  var vests = {};
  function ensureVest(id, at, label) {
    var CB = GTP.Combat, pk = vests[id];
    if (!at || !CB || !CB.spawnPickup) return;
    if (pk && !pk.removed) return;
    var x = at.x + 2.2, z = at.z, r = W().resolveCapsule(x, z, W().heightAt(x, z, 0) + 0.5, 0.5);
    vests[id] = CB.spawnPickup({ type: 'armor', value: 100, x: r.x, z: r.z, persistent: true, respawn: 24 * C.DAY.secondsPerHour, label: label, tag: 'strand' });
  }
  function endCurrent(why) {
    if (!cur) return;
    var s = S[cur.id], c = cur;
    try { if (s && s.end) s.end(why); } catch (e) { U.reportError(e, 'strands.end ' + c.id); }
    cur = null; state.holdBar = null;
    GTP.Events.emit('strand:end', { id: c.id, reason: why });
  }
  function startStrand(id, arg) {
    var s = S[id]; if (!s) return false;
    var g = game();
    if (run) { toast('Finish the mission first.'); return false; }
    if (cur) { if (cur.id === id) return false; toast('One strand at a time. Respectfully.'); return false; }
    if (!g || g.state !== 'playing') return false;
    var ok = false;
    try { ok = !!s.begin(arg); } catch (e) { U.reportError(e, 'strands.begin ' + id); ok = false; }
    if (!ok) { cur = null; return false; }
    GTP.Events.emit('strand:start', { id: id, title: cur ? cur.title : s.title });
    return true;
  }
  function pollInput(p) {
    var In = GTP.Input, v = playerVehicle();
    if (!In || !In.pressed('action') || !v || !stopped(v)) return;
    if (run) return;
    if (!cur) {
      if (S.loud_cab.canStart(v)) startStrand('loud_cab');
      else if (S.hoa_patrol.canStart(v)) startStrand('hoa_patrol');
    } else if (cur.id === 'loud_cab' && !cur.fare) endCurrent('shift');
    else if (cur.id === 'hoa_patrol' && !cur.target) endCurrent('shift');
    void p;
  }
  function pollMarkers(p, dt) {
    for (var i = 0; i < strandMarkers.length; i++) {
      var mk = strandMarkers[i];
      if (mk.cooldown > 0) { mk.cooldown -= dt; if (mk.cooldown <= 0) { mk.cooldown = 0; refreshMarkerVisibility(); } continue; }
      if (!mk.visible) continue;
      var v = playerVehicle(), d = U.dist2d(p.x, p.z, mk.x, mk.z), onFoot = !p.inVehicle;
      if (mk.kind === 'rampage') {
        var inside = onFoot && d <= K.markerRadius && Math.abs(p.y - mk.y) < 2.5;
        if (!inside) { mk.holdT = 0; if (d > K.markerRadius + 0.6) { mk.armed = true; mk.told = false; } continue; }
        if (mk.armed && cur && !mk.told) { mk.told = true; toast('One strand at a time. Finish the ' + (cur.title || 'one') + ' first.'); }   // QA-STR-10
        if (!mk.armed || cur || run) { mk.holdT = 0; continue; }
        mk.holdT += dt;
        if (mk.holdT >= K.startHold) { mk.holdT = 0; mk.armed = false; mk.told = false; startStrand('ratio_rampages', mk.data); }
      } else if (mk.kind === 'race') {
        // the handbrake (Space in a car) or the foot brake held for a second on the line; while stopped in the light the foot
        // brake holds the car instead of reversing it out (QA-STR-12), and a chip says how to start
        var In = GTP.Input, insideR = !!v && U.dist2d(v.x, v.z, mk.x, mk.z) <= 6 && Math.abs(v.y - mk.y) < 3;
        if (!insideR) { mk.holdT = 0; mk.told = false; continue; }
        var footBrake = !!(In && In.down('back') && !In.down('forward')) && Math.abs(v.speed) < 1.5;
        if (footBrake) v.setControls(0, 0, true, 1);
        var braking = !!(In && (In.down('jump') || footBrake || v.handbrake));
        if (!mk.told && stopped(v) && !cur && !run) {
          mk.told = true;
          var glyph = GTP.UI && GTP.UI.glyph ? GTP.UI.glyph('jump') : 'SPACE';
          var chip = 'Hold ' + glyph + ' (or the brake) to start: ' + (mk.title || 'the race');
          if (!callUI('chip', chip)) toast(chip);
        }
        if (!braking || !stopped(v) || cur || run) { if (braking && cur && !mk.told2) { mk.told2 = true; toast('One strand at a time. Respectfully.'); } mk.holdT = 0; continue; }
        mk.holdT += dt;
        if (mk.holdT >= 1) { mk.holdT = 0; mk.told = false; startStrand('loop_races', mk.data); }
      }
    }
  }

  var Strands = GTP.Strands = {
    K: SK, S: S, drivers: drivers, stunts: stunts, races: races, DEFAULTS: DEFAULTS,
    init: function () {
      if (cur) { try { endCurrent('reset'); } catch (e) { cur = null; } }
      if (races.cur) races.end('reset');
      drivers.list.length = 0; stunts.watchers.length = 0; stunts.air = null; stunts.prevGround = true;
      progress = freshProgress(); LOOP_PTS = null; ensureT = 0;
      memoPickups = {}; vests = {};
      try { rebuildMarkers(); } catch (e) { U.reportError(e, 'strands.markers'); }
      try { S.monday_memos.place(); } catch (e) { U.reportError(e, 'strands.memos'); }
      try { ensureVehicles(); } catch (e) { U.reportError(e, 'strands.vehicles'); }
    },
    update: function (dt) {
      var g = game(), p = player();
      if (!g || !p || g.state !== 'playing') return;
      try {
        ensureT += dt;
        if (ensureT >= SK.ensureEvery) { ensureT = 0; ensureVehicles(); }
        stunts.update(dt);
        pollInput(p);
        pollMarkers(p, dt);
        if (cur) {
          var s = S[cur.id];
          if (!p.alive) { if (cur.id === 'ratio_rampages') S.ratio_rampages.finish(false, 'dead'); else endCurrent('dead'); }
          else if (run) endCurrent('mission');
          else if (s && s.update) { s.update(dt); if (cur && cur.done) cur = null; }
        }
        races.update(dt);
        for (var i = 0; i < strandMarkers.length; i++) { var mk = strandMarkers[i]; if (mk.mesh && mk.visible) { mk.mesh.rotation.y = simT() * 0.4; var ud = mk.mesh.userData; if (ud && ud.pulse) ud.pulse(0.5 + 0.5 * Math.sin(simT() * 2.6 + i)); } }
      } catch (e) { U.reportError(e, 'strands.update'); }
    },
    afterCamera: function (dt) { try { stunts.afterCamera(dt); } catch (e) { U.reportError(e, 'strands.camera'); } },
    start: function (id, arg) { return startStrand(id, arg); },
    end: function (why) { endCurrent(why || 'quit'); return true; },
    active: function () { return cur ? cur.id : null; },
    current: function () { return cur; },
    progress: function () { return progress; },
    state: function () { return { active: cur ? cur.id : null, progress: progress, memos: progress.monday_memos.collected.length, race: races.hud() }; },
    hud: function () {
      if (!cur) return { active: null, race: races.hud(), stunt: stunts.air ? { ramp: stunts.air.ramp.id, airT: stunts.air.airT } : null };
      var s = S[cur.id], h = null;
      try { h = s && s.hud ? s.hud() : null; } catch (e) { h = null; }
      return Object.assign({ active: cur.id, title: cur.title }, h || {}, { race: races.hud(), holdBar: state.holdBar });
    },
    // minimap / map icons: pink bubbles (rampages), checkered flags (races), the home icon, the active strand's target
    markers: function () {
      var out = [], home = game() && game().homePoint ? game().homePoint() : null;
      for (var i = 0; i < strandMarkers.length; i++) { var mk = strandMarkers[i]; if (!mk.visible) continue; out.push({ id: mk.id, kind: 'strand', icon: mk.icon, x: mk.x, z: mk.z, y: mk.y, title: mk.title, color: mk.kind === 'race' ? K.colors.race : K.colors.strand }); }
      if (home) out.push({ id: 'home', kind: 'strand', icon: 'home', x: home.x, z: home.z, y: home.y, title: 'Home', color: 0xffffff });
      if (cur && S[cur.id] && S[cur.id].hud) { try { var h = S[cur.id].hud(); if (h && h.target) out.push({ id: cur.id + ':target', kind: 'strand', icon: cur.id === 'hoa_patrol' ? 'violation' : 'target', x: h.target.x, z: h.target.z, y: h.target.y || 0, title: h.line, color: cur.id === 'hoa_patrol' ? K.colors.hoa : K.colors.objective }); } catch (e) { /* hud optional */ } }
      return out;
    },
    objectiveTarget: function () {
      if (!cur || !S[cur.id] || !S[cur.id].hud) return null;
      var h = null; try { h = S[cur.id].hud(); } catch (e) { h = null; }
      if (!h || !h.target) return null;
      var p = player();
      return { x: h.target.x, y: h.target.y || 0, z: h.target.z, dist: p ? U.dist2d(p.x, p.z, h.target.x, h.target.z) : 0, text: h.line, type: cur.id };
    },
    rampages: function () { var P = progress.ratio_rampages; return rampageDefs().map(function (d) { return { id: d.id, name: d.name || d.id, weapon: d.weapon, hecklers: d.hecklers, seconds: d.seconds, reward: d.reward, best: P.best[d.id] != null ? P.best[d.id] : null }; }); },
    racesList: function () { var P = progress.loop_races; return races.list().map(function (d) { return { id: d.id, name: d.name, unlocked: races.unlocked(d), best: P.best[d.id] != null ? P.best[d.id] : null, wins: P.wins[d.id] || 0 }; }); },
    memos: function () { return { collected: progress.monday_memos.collected.slice(), total: memoDefs().length, byDistrict: S.monday_memos.byDistrict() }; },
    memoPickups: function () { return memoPickups; },
    stuntList: function () { var P = progress.stunt_jumps; return stunts.list().map(function (r) { return { id: r.id, name: r.name, x: r.x, z: r.z, done: P.done.indexOf(r.id) >= 0, best: P.best[r.id] || null }; }); },
    // the phone's STRANDS tab
    summary: function () {
      var P = progress;
      return [
        { id: 'loud_cab', title: 'Loud Cab', line: P.loud_cab.fares + ' fares, best shift ' + P.loud_cab.bestShift },
        { id: 'hoa_patrol', title: 'HOA Patrol', line: 'best level ' + P.hoa_patrol.best + ', ' + P.hoa_patrol.stops + ' stops' },
        { id: 'sponsor_runs', title: 'Sponsor Runs', line: P.sponsor_runs.runs + ' runs, ' + P.sponsor_runs.fullReads + ' full reads' },
        { id: 'ratio_rampages', title: 'Ratio Rampages', line: P.ratio_rampages.done + ' / ' + rampageDefs().length },
        { id: 'monday_memos', title: 'Monday Memos', line: 'MEMOS ' + P.monday_memos.collected.length + '/' + memoDefs().length },
        { id: 'loop_races', title: 'Loop Races', line: Object.keys(P.loop_races.wins).length + ' won of ' + races.list().length },
        { id: 'stunt_jumps', title: 'Stunt Jumps', line: P.stunt_jumps.done.length + ' / ' + stunts.list().length }
      ];
    },
    serialize: function () { return JSON.parse(JSON.stringify(progress)); },
    load: function (data) {
      var fresh = freshProgress(), saved = (data && data.strands) || {};
      for (var k in fresh) if (saved[k]) fresh[k] = Object.assign(fresh[k], saved[k]);
      if (data && Array.isArray(data.memos)) fresh.monday_memos.collected = data.memos.slice();
      progress = fresh;
      try { S.monday_memos.place(); rebuildMarkers(); ensureVehicles(); } catch (e) { U.reportError(e, 'strands.load'); }
    },
    debug: { markers: function () { return strandMarkers; }, cur: function () { return cur; } }
  };
  // WASTED or BUSTED ends whatever strand is running right away (QA-STR-01): the rampage fails (CONTEXT STAMPED, the loaner taken
  // back) before Combat's respawn takes its cut, so the hospital penalty is never undone and no wave follows the player to the
  // hospital. The tier-3 weapon stash (taken on the same event, earlier) is re-taken from the cleaned loadout
  function strandDown(why) {
    if (!cur) return;
    try { if (cur.id === 'ratio_rampages') S.ratio_rampages.finish(false, why); else endCurrent(why); } catch (e) { U.reportError(e, 'strands.down'); cur = null; }
    var p = player();
    if (stashedWeapons && p) stashedWeapons = { weapons: Object.assign({}, p.weapons), ammo: copyAmmo(p.ammo), weapon: p.weapon };
  }
  GTP.Events.on('player:wasted', function () { strandDown('dead'); });
  GTP.Events.on('busted', function () { strandDown('busted'); });
  GTP.Events.on('pickup', function (e) { var pk = e && e.pickup; if (pk && pk.pickupType === 'memo') { try { S.monday_memos.collect(pk); } catch (err) { U.reportError(err, 'strands.memo'); } } });
  GTP.Events.on('vehicle:enter', function (e) {
    if (!e || !e.ped || e.ped.kind !== 'player' || !e.vehicle || e.seat !== 0) return;
    if (e.vehicle.tag !== 'sponsorvan' || run) return;
    if (cur) { toast('One strand at a time. The ' + (cur.title || 'strand') + ' is still running.'); return; }   // QA-STR-10
    startStrand('sponsor_runs');
  });
  GTP.SaveHooks.push({ name: 'strands', save: function (data) { data.strands = Strands.serialize(); data.memos = progress.monday_memos.collected.slice(); }, load: function (data) { Strands.load(data); } });
})();
