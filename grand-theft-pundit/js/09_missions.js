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
    weaponAmmo: { megaphone: 20, pistol: 40, hottake: 8, smg: 90, shotgun: 16 },
    colors: { mission: 0x2f6cff, objective: 0xffd45a }
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
  function missionById(id) {
    if (registry[id]) return registry[id];
    var Ct = GTP.Content;
    if (Ct && typeof Ct.missionById === 'function') { var m = Ct.missionById(id); if (m) return m; }
    var list = (Ct && Ct.missions) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function isEnding(id) { var e = GTP.Content && GTP.Content.endingMissions; return !!e && e.indexOf(id) >= 0; }

  // a mission target {landmark} (door point) or {x, z} -> {x, z, y, name}
  function resolvePoint(t) {
    var Wd = W();
    if (!t) return null;
    if (t.landmark) {
      var lm = Wd.landmark(t.landmark);
      if (!lm) { U.reportError(new Error('unknown landmark ' + t.landmark), 'missions.target'); return null; }
      var d = lm.door || { x: lm.x, z: lm.z, y: lm.y || 0 };
      return { x: d.x, z: d.z, y: d.y != null ? d.y : Wd.heightAt(d.x, d.z, 0), name: lm.name || t.landmark, landmark: t.landmark, lm: lm };
    }
    if (t.x != null) return { x: t.x, z: t.z != null ? t.z : (t.y || 0), y: Wd.heightAt(t.x, t.z != null ? t.z : (t.y || 0), 0), name: t.name || null };
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
      else if (bW || bE) { yaw = Math.PI / 2; x += bW ? over : (bE ? -over : 0); }
      else { yaw = bN ? 0 : Math.PI; z += bN ? over : (bS ? -over : 0); }
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
    return { active: null, mission: null, objective: 0, objectiveText: '', progress: null, timer: null, completed: new Set(), flags: {}, dialogue: [], failed: {}, minigame: null, phase: null };
  }

  // ----------------------------------------------------- entity spawning --
  function track(e, role) { if (!run) return e; e.mission = run.id; e.missionRole = role || null; run.entities.push(e); return e; }
  function missionBrain(kind, extra) {
    // phase 0.5 keeps (stepN + phase) % pedTick from ever being 0: the AI never ticks this ped
    var b = { phase: 0.5, mode: 'mission', mission: kind, ambient: false, barkT: R().range(2, 6), shotT: 0, stuckT: 0, sideT: 0, side: 1, repathT: 0, path: null, pi: 0, pauseT: 0, stucks: 0 };
    if (extra) for (var k in extra) b[k] = extra[k];
    return b;
  }
  function spawnCastPed(castId, x, z, role, opts) {
    opts = opts || {};
    var Wd = W(), cast = castOf(castId), look = cast && cast.look ? Object.assign({}, cast.look) : null;
    if (!look) { var CW = GTP.Content.world, dd = Wd.districtAt(x, z); look = CW.spawn.peds.rollLook(dd ? dd.id : 'downtown', role || 'npc'); }
    var p = new GTP.Ped({ x: x, z: z, look: look, role: role || 'npc', persistent: opts.persistent !== false, weapon: opts.weapon || 'fist' });
    p.y = Wd.heightAt(x, z, 0); p.yaw = opts.yaw != null ? opts.yaw : R().random() * TAU; p.snap();
    p.castId = castId; p.name = cast ? cast.name : castId;
    p.ai = missionBrain(opts.brain || 'actor', opts.ai);
    E().add(p);
    return p;
  }
  function spawnHostile(role, x, z, ctx) {
    var sp = GTP.AI && GTP.AI.spawner;
    var p;
    if (sp && sp.spawnPed) p = sp.spawnPed(x, z, role, { persistent: true });
    else { p = new GTP.Ped({ x: x, z: z, role: role, persistent: true }); p.y = W().heightAt(x, z, 0); p.snap(); E().add(p); }
    p.hostile = true; p.aimTarget = player();
    p.ai = missionBrain('hostile', { role: role, ctx: ctx });
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
  function spawnPickups(center, radius, count, labels, ctx) {
    var out = [], CB = GTP.Combat;
    for (var i = 0; i < count; i++) {
      var s = randomSpot(center.x, center.z, Math.min(4, radius * 0.3), radius, { others: out, gap: Math.min(8, radius / 2), clear: 1.2 });
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
      if (e.kind === 'vehicle') {
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
    var all = (GTP.Content && GTP.Content.missions) || [], out = [];
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
      // two markers on one door: nudge the second along the sidewalk
      for (var j = 0; j < avail.length; j++) if (U.dist2d(avail[j].x, avail[j].z, pt.x, pt.z) < 3) { pt.x += 4; }
      var mk = { id: mm.id, m: mm, x: pt.x, z: pt.z, y: pt.y, landmark: mm.marker, mesh: markerMesh(K.colors.mission), giver: null, kip: null, armed: false, holdT: 0 };
      if (mk.mesh) mk.mesh.position.set(mk.x, mk.y, mk.z);
      var pl = player();
      mk.armed = !pl || U.dist2d(pl.x, pl.z, mk.x, mk.z) > K.markerRadius + 0.6;
      avail.push(mk);
    }
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
    var t = simT(), i, mk, ud;
    for (i = 0; i < avail.length; i++) {
      mk = avail[i]; if (!mk.mesh) continue;
      ud = mk.mesh.userData; mk.mesh.rotation.y = t * 0.35;
      if (ud && ud.pulse) ud.pulse(0.5 + 0.5 * Math.sin(t * 2.2 + i));
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
    var d = U.dist2d(p.x, p.z, pl.x, pl.z), ranged = ai.role === 'cop' || ai.role === 'swat';
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
      if (!pl.inVehicle && CB && CB.fire) { try { CB.fire(p, 'fist'); } catch (e) { U.reportError(e, 'missions.fire'); } }
    }
  }
  function followerTick(p, ai, dt) {
    var c = ai.ctx, pl = player();
    if (!c || !p.alive || p.knockedDown || p.inVehicle) { p.stop(); return; }
    if (c.arrived) { p.stop(); if (pl) p.yaw = U.angleDamp(p.yaw, U.dirToYaw(pl.x - p.x, pl.z - p.z), 4, dt); return; }
    if (ai.pauseT > 0) { ai.pauseT -= dt; p.stop(); if (ai.glance && pl) p.yaw = U.angleDamp(p.yaw, U.dirToYaw(pl.x - p.x, pl.z - p.z), 6, dt); return; }
    var wp = c.wps[c.wi]; if (!wp) { c.arrived = true; return; }
    if (!ai.route) {
      ai.route = W().findPath(p.x, p.z, wp.x, wp.z, { mode: 'ped', fromY: p.y, toY: wp.y, maxExpansions: 12000 }) || [{ x: wp.x, z: wp.z, y: wp.y }];
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
      if (ai.stucks % 3 === 0) { var r = W().resolveCapsule(pt.x, pt.z, p.y, p.radius); p.x = r.x; p.z = r.z; p.snap(); }   // a lamp post is not a plot point
    }
  }
  function giverTick(p, ai, dt) {
    var pl = player();
    p.stop();
    if (ai.kip) { ai.barkT -= dt; if (ai.barkT <= 0 && pl && U.dist2d(p.x, p.z, pl.x, pl.z) < 14) { ai.barkT = R().range(16, 28); if (GTP.AI && GTP.AI.say) GTP.AI.say(p, 'Is this paid?', '#f0ad4e'); } }
    if (pl && U.dist2d(p.x, p.z, pl.x, pl.z) < 9) p.yaw = U.angleDamp(p.yaw, U.dirToYaw(pl.x - p.x, pl.z - p.z), 5, dt);
    else if (ai.homeYaw != null) p.yaw = U.angleDamp(p.yaw, ai.homeYaw, 2, dt);
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

  var H = {};
  H.goto = {
    start: function (o, c) {
      c.target = resolvePoint(o.target);
      c.radius = o.radius != null ? Math.max(2.5, metres(o.radius)) : K.gotoRadius;
      if (c.target) c.marker = addObjMarker(c.target, null);
    },
    check: function (o, c, p) {
      if (!c.target) return 'done';
      if (p.inVehicle) return null;
      return (U.dist2d(p.x, p.z, c.target.x, c.target.z) <= c.radius && Math.abs(p.y - c.target.y) < 4) ? 'done' : null;
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
    hint: function (o, c, p) { if (!p.inVehicle && !c.ref.any) return 'Get back in the ' + ((taggedVehicle(c.ref.tag) || {}).type || 'vehicle'); return null; },
    target: function (o, c) { return c.target; }
  };
  H.enter_vehicle = {
    start: function (o, c) {
      var sp = o.spawn || {}, at = resolvePoint(sp.at) || { x: player().x, z: player().z, y: player().y };
      var v = sp.tag ? taggedVehicle(sp.tag) : null;
      if (!v) {
        var cls = C.VEHICLES[sp.type] || C.VEHICLES.sedan;
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
      c.total = sp.count || 1; c.label = sp.label || null;
      c.pickups = spawnPickups(center, metres(sp.radius, 25), c.total, c.label, c);
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
      c.collected = n;
      return n >= c.total ? 'done' : null;
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
      var sp = o.spawn || {}, at = resolvePoint(sp.at) || { x: player().x + 6, z: player().z, y: player().y };
      var s = randomSpot(at.x, at.z, 1.5, 5, { clear: 1 });
      var p = spawnCastPed(sp.ped || 'courier', s.x, s.z, 'npc', { brain: 'follower', ai: { ctx: c } });
      track(p, 'follow');
      c.ped = p; c.wps = [];
      var path = sp.path || [];
      for (var i = 0; i < path.length; i++) { var pt = resolvePoint(path[i]); if (pt) c.wps.push(pt); }
      if (!c.wps.length) c.wps.push({ x: s.x, z: s.z, y: s.y });
      c.wi = 0; c.arrived = false; c.closeT = 0; c.farT = 0; c.maxDist = metres(o.maxDist, 40);
      c.marker = addObjMarker({ x: p.x, z: p.z, y: p.y }, p);
      if (c.marker.mesh) c.marker.mesh.scale.set(0.55, 0.45, 0.55);
    },
    check: function (o, c, p) {
      var t = c.ped;
      if (!t || t.removed || !t.alive) { c.failReason = 'target_lost'; return 'fail'; }
      if (c.arrived) return 'done';
      var d = U.dist2d(p.x, p.z, t.x, t.z), dt = C.STEP;
      if (d < K.followTooClose && !c.arrived) c.closeT += dt; else c.closeT = 0;
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
      for (var role in waves) { c.quota[role] = waves[role] | 0; c.spawned[role] = 0; c.perWave[role] = Math.max(1, Math.ceil(waves[role] / n)); }
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
      c.vehicles = []; c.tag = sp.tag || null;
      for (var i = 0; i < count; i++) {
        var a = R().random() * TAU, rr = radius * (0.35 + 0.65 * R().random());
        var spot = vehicleSpot(center.x + Math.cos(a) * rr, center.z + Math.sin(a) * rr, Math.max(24, radius * 0.6), driven ? 'road' : 'parking', c.vehicles, len) || vehicleSpot(center.x, center.z, radius + 20, driven ? 'road' : null, c.vehicles, len);
        if (!spot) continue;
        var v = makeVehicle(spot, sp.vehicle || 'van', { tag: c.tag, color: sp.color || null, wrap: sp.wrap || null });
        v.target = true;
        if (driven) driveVehicle(v, driven);
        c.vehicles.push(v);
        addObjMarker({ x: v.x, z: v.z, y: v.y }, v).vehicle = v;
      }
      c.total = c.vehicles.length;
    },
    check: function (o, c) {
      var n = 0;
      for (var i = 0; i < c.vehicles.length; i++) {
        var v = c.vehicles[i];
        if (vehicleLost(v)) { n++; for (var k = objMarkers.length - 1; k >= 0; k--) if (objMarkers[k].vehicle === v) dropObjMarker(objMarkers[k]); }
      }
      c.done = n;
      return n >= c.total ? 'done' : null;
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
      var radius = metres(sp.radius, 20), count = sp.count || 1;
      c.peds = []; c.holdT = 0;
      for (var i = 0; i < count; i++) {
        var s = randomSpot(center.x, center.z, Math.min(8, radius * 0.4), radius, { clear: 1.2, others: c.peds, gap: 2.5 });
        c.peds.push(spawnHostile(sp.ped || 'thug', s.x, s.z, c));
      }
      c.total = c.peds.length;
    },
    check: function (o, c) {
      var out = 0;
      for (var i = 0; i < c.peds.length; i++) {
        var p = c.peds[i];
        // a goon on the ropes gives up and runs ("it's on the calendar")
        if (p.alive && p.knockedDown && !p.fled && p.hp < p.maxHp * 0.35) { p.fled = true; releasePed(p, true); }
        if (pedOut(p)) out++;
      }
      c.down = out;
      if (out >= c.total) c.holdT += C.STEP; else c.holdT = 0;
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

  // -------------------------------------------------------- the cursor --
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
      if (def.type === 'timer_wrap') {
        run.stack.push({ list: def.objectives || [], i: 0, timer: { remaining: def.seconds || 60, total: def.seconds || 60, text: def.text || null }, def: def });
        continue;
      }
      var h = H[def.type];
      if (!h) { U.reportError(new Error('unknown objective type ' + def.type), 'missions'); f.i++; continue; }
      run.obj = { def: def, h: h, c: { t: 0, failReason: null }, startedAt: simT() };
      try { h.start(def, run.obj.c, player()); } catch (e) { U.reportError(e, 'missions.start ' + def.type); }
      syncObjectiveState();
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
    run.phase = 'outro'; state.phase = 'outro'; state.timer = null; state.objectiveText = ''; state.progress = null;
    cleanupEntities(run.entities, true);
    var m = run.m;
    showDialogue(m.outro || [], function () { if (run && run.m === m) completeRun(); });
  }

  // ------------------------------------------------------------- flow --
  function applyComplete(m, silent) {
    var oc = m.onComplete || {}, p = player();
    if (oc.setFlag) state.flags[oc.setFlag] = true;
    if (oc.setFlags) for (var i = 0; i < oc.setFlags.length; i++) state.flags[oc.setFlags[i]] = true;
    if (oc.unlockWeapon && p) {
      var id = oc.unlockWeapon, ammo = K.weaponAmmo[id] || 30, CB = GTP.Combat;
      p.weapons[id] = (p.weapons[id] || 0) + ammo; p.weapon = id;
      if (!silent) toast('Unlocked: ' + (CB && CB.weaponName ? CB.weaponName(id) : id) + ' (+' + ammo + ')');
    }
  }
  function completeRun() {
    var m = run.m, p = player(), reward = m.reward | 0;
    cleanupEntities(run.entities, true);
    clearObjMarkers();
    if (p && reward) { p.money += reward; textFx('+' + U.fmtMoney(reward), p.x, p.y + 2.2, p.z, '#9dff3c', 1.8); sfx('cash', p.x, p.z, 0.9); }
    sfx('mission', p ? p.x : 0, p ? p.z : 0, 1);
    state.completed.add(m.id);
    applyComplete(m, false);
    if (p && p.stats) p.stats.missions = (p.stats.missions || 0) + 1;
    var id = m.id; run = null;
    state.active = null; state.mission = null; state.objectiveText = ''; state.progress = null; state.timer = null; state.phase = null; state.hint = null;
    if (!callUI('card', 'passed', 'MISSION PASSED', m.title + (reward ? '  ' + U.fmtMoney(reward) : ''))) toast('MISSION PASSED: ' + m.title + (reward ? ' ' + U.fmtMoney(reward) : ''));
    emit('complete', { mission: m, id: id, reward: reward });
    refreshAvailable(true);
    if (isEnding(id)) { emit('ending', { id: id }); callUI('credits', id); }
  }
  var FAIL_TEXT = {
    player_dead: 'You got ratio\'d.', busted: 'You got deplatformed.', timer: 'Out of time.', target_escaped: 'You lost them.',
    spotted: 'They saw you.', target_lost: 'Your lead is down.', abort: 'Mission abandoned.', minigame: 'You lost the room.'
  };
  function failText(reason) {
    if (!reason) return '';
    if (reason.indexOf('vehicle_lost:') === 0) { var tag = reason.slice(13), v = run && run.tagged[tag]; return 'The ' + (v ? v.type : tag) + ' is gone.'; }
    if (reason.indexOf('minigame:') === 0) return reason.slice(9) === 'ratio' ? 'You were the ratio.' : 'Minds changed: zero. Crowd: theirs.';
    return FAIL_TEXT[reason] || String(reason);
  }
  function teardownRun() {
    cancelDialogue(); cancelMinigame();
    endObjective();
    cleanupEntities(run.entities, false);
    clearObjMarkers();
    var g = game(); if (g && g.state === 'cutscene') g.setState('playing');
    var Rd = GTP.Render; if (Rd && Rd.rig && Rd.rig.target && player()) Rd.rig.target(player(), true);
    run = null;
    state.active = null; state.mission = null; state.objectiveText = ''; state.progress = null; state.timer = null; state.phase = null; state.hint = null; state.minigame = null;
  }
  function checkFailRules() {
    var rules = run.m.failOn || [];
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (typeof r !== 'string') continue;
      if (r.indexOf('vehicle_lost:') === 0) { var tag = r.slice(13), v = run.tagged[tag]; if (v && vehicleLost(v)) { Missions.fail(r); return true; } }
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

  // ------------------------------------------------------------- API --
  var Missions = GTP.Missions = {
    K: K,
    state: null,
    init: function () {
      if (run) { try { cleanupEntities(run.entities, false); } catch (e) { /* entities may be gone */ } }
      run = null; mrng = GTP.rng.fork(0x3155);
      dlg.active = false; dlg.queue = []; dlg.current = null; dlg.done = null; dlg.restore = null; dlg.uiDriven = false;
      mg.active = null; mg.uiDriven = false;
      for (var i = 0; i < avail.length; i++) { dropMesh(avail[i].mesh); avail[i].giver = null; avail[i].kip = null; }
      avail.length = 0; availKey = null; availT = 0; lastPos.set = false;
      clearObjMarkers();
      state = Missions.state = freshState();
      stepN = 0;
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
            if (!checkFailRules() && run && run.obj) tickObjective(dt);
            if (run && (stepN % 6) === 0) syncObjectiveState();
          }
        } else if (g.state === 'playing') updateAvailable(dt);
        if (g.state === 'playing' && stepN % K.brainTick === 0) tickBrains(dt * K.brainTick);
        animateMarkers(dt);
      } catch (e) { U.reportError(e, 'missions.update'); }
    },
    // id -> true when started. opts: {skipIntro}
    start: function (id, opts) {
      opts = opts || {};
      if (run) return false;
      var m = missionById(id); if (!m) return false;
      var p = player(), g = game();
      if (!p) return false;
      run = { id: m.id, m: m, stack: [{ list: m.objectives || [], i: 0 }], obj: null, entities: [], tagged: {}, phase: 'intro', t: 0, giver: null, kip: null };
      state.active = m.id; state.mission = m; state.objective = 0; state.objectiveText = ''; state.progress = null; state.timer = null; state.phase = 'intro';
      // the giver at this door becomes the intro actor; the other markers go dark
      for (var i = 0; i < avail.length; i++) {
        var mk = avail[i];
        if (mk.id === m.id) { run.giver = mk.giver; run.kip = mk.kip; mk.giver = null; mk.kip = null; if (run.giver) track(run.giver, 'giver'); if (run.kip) track(run.kip, 'kip'); }
      }
      refreshAvailable(true);
      sfx('mission', p.x, p.z, 1);
      if (!callUI('banner', m.title, m.giver ? (castOf(m.giver) || {}).name : null)) toast(m.title);
      emit('start', { mission: m, id: m.id });
      if (p.inVehicle) p.inVehicle.setControls(0, 0, false, 1);
      var intro = m.intro || [];
      if (opts.skipIntro || !intro.length || !g || g.state !== 'playing') beginPlay();
      else { cutsceneCamera(run.giver); showDialogue(intro, beginPlay); }
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
      toast(failText('abort'));
      emit('abort', { mission: m, id: m.id });
      refreshAvailable(true);
      return true;
    },
    fail: function (reason) {
      if (!run) return false;
      var m = run.m, p = player();
      reason = reason || 'failed';
      var text = failText(reason);
      teardownRun();
      state.failed[m.id] = (state.failed[m.id] || 0) + 1;
      var Rd = GTP.Content && GTP.Content.radio, title = (Rd && Rd.failTexts && Rd.failTexts.missionFailed) || 'CONTEXT STAMPED';
      if (!callUI('card', 'failed', title, text)) toast(title + ': ' + text);
      sfx('fail', p ? p.x : 0, p ? p.z : 0, 0.9);
      emit('fail', { mission: m, id: m.id, reason: reason, text: text });
      refreshAvailable(true);
      return true;
    },
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
      for (i = 0; i < avail.length; i++) { var a = avail[i]; out.push({ id: a.id, kind: 'mission', x: a.x, z: a.z, y: a.y, missionId: a.id, title: a.m.title, giver: a.m.giver, landmark: a.landmark, color: K.colors.mission }); }
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
        dialogue: dlg.active ? dlg.current : null, minigame: state.minigame, flags: state.flags
      };
    },
    current: function () { return run && run.obj ? { def: run.obj.def, ctx: run.obj.c, index: run.stack[0].i, depth: run.stack.length - 1 } : null; },
    dialogue: dlg,
    registerTest: function (m) { if (!m || !m.id) return null; registry[m.id] = m; return m.id; },
    missionById: missionById,
    on: function (ev, fn) { return GTP.Events.on('mission:' + ev, fn); },
    off: function (ev, fn) { return GTP.Events.off('mission:' + ev, fn); },
    refreshMarkers: function () { refreshAvailable(true); },
    debug: { run: function () { return run; }, avail: function () { return avail; }, objMarkers: function () { return objMarkers; } }
  };
  Missions.init();

  // ------------------------------------------------------------ events --
  GTP.Events.on('player:wasted', function () { if (run) Missions.fail('player_dead'); });
  GTP.Events.on('busted', function () { if (run) Missions.fail('busted'); });
  GTP.Events.on('pickup', function (e) {
    var pk = e && e.pickup; if (!pk || pk.pickupType !== 'mission' || !pk.missionCtx || !run) return;
    var c = pk.missionCtx, n = 0;
    for (var i = 0; i < c.pickups.length; i++) if (c.pickups[i].removed || c.pickups[i] === pk) n++;
    textFx('+1 ' + (pk.objLabel || 'MERCH') + '  ' + n + '/' + c.total, pk.x, pk.y + 1.4, pk.z, '#ffd45a', 1.4);
    fx({ type: 'ring', x: pk.x, y: pk.y + 0.05, z: pk.z, size: 1.4, life: 0.4, color: 0xffd45a });
  });
})();
