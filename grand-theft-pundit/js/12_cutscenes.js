/* Grand Theft Pundit: 12_cutscenes.js
 * GTP.Cutscenes: the data-driven cutscene player (GDD_EXPANSION §4) and GTP.Hints, the tutorial prompts (§6.6).
 *
 * A script is {id, letterbox, skippable, music, shots:[{cam:{from, to, seconds, ease, move:{to}}, actors:[...],
 * lines:[...], fx:[...], hold}]} from GTP.Content.expansion.cutscenes[id] (or an inline object). play(script,
 * onDone, opts) puts the game in state `cutscene`, drives GTP.Render.camera through GTP.Render.freeCam with per-step
 * damping toward the eased keyframe, spawns the actors as persistent peds with their cast looks (a role id rolls a
 * look from that role's pool; 'player' repositions the real player), poses them through an instance-level syncMesh
 * wrapper over the existing pose fields (idle talk point table wave), runs the lines through the mission dialogue
 * queue (GTP.Missions.say) and ends each shot when its camera time and its lines are done plus `hold`. Skip: `back`
 * once skips the shot, holding `confirm` for C.CUTSCENES.skipHold seconds skips the script; onDone runs either way.
 * Everything runs inside Game.step, so headless tests drive it with advance(). The UI reads Cutscenes.hud()
 * ({active, letterbox, skip 0..1, shot, shots, title}) for the bars and the HOLD TO SKIP pill.
 *
 * Positions: {x, y, z} world metres; {landmark, offset:{x, y, z}} metres from the landmark door (roof: true stands an
 * actor on the building top); {entity:'player'|'actor:<castId>', offset:{x, y, z}} in the entity's frame (x right,
 * z back, y up); a camera `to` naming an entity tracks it at chest height. The from-point is pushed out of buildings.
 *
 * Hints fire once per save (flags.hint_<id>) as the 'hint' event {id, text, keys} the HUD draws; never during a
 * cutscene or minigame, never two at once (a queue, 2 s apart); GTP.Hints.enabled = false (Settings) silences them.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util, TAU = Math.PI * 2;
  var K = C.CUTSCENES = Object.assign({
    skipHold: 0.6, camDamp: 7, lookDamp: 9, letterbox: 0.12, holdDefault: 0.6, lineGap: 0.2, pushOut: 0.5, wantedWait: 2,
    talkEvery: 1.5, waveEvery: 2, hintSeconds: 6, hintGap: 2
  }, C.CUTSCENES || {});

  function game() { return GTP.game || null; }
  function player() { var g = game(); return g ? g.player : null; }
  function W() { return GTP.World; }
  function E() { return GTP.Entities; }
  function simT() { var g = game(); return g && g.time ? g.time.t : 0; }
  function toast(t) { if (GTP.UI && GTP.UI.toast) { try { GTP.UI.toast(t); } catch (e) { /* ui optional */ } } }
  function castOf(id) { var Cc = GTP.Content && GTP.Content.cast; return Cc && id ? Cc[id] || null : null; }
  function expansion() { return (GTP.Content && GTP.Content.expansion) || {}; }
  function scriptFor(id) {
    if (!id) return null;
    if (typeof id === 'object') return id.shots ? id : null;
    var cs = expansion().cutscenes;
    return cs && cs[id] ? cs[id] : null;
  }
  function easeK(kind, t) {
    t = U.clamp(t, 0, 1);
    if (kind === 'in') return t * t;
    if (kind === 'out') return 1 - (1 - t) * (1 - t);
    if (kind === 'linear') return t;
    return U.smoothstep(t);
  }

  // ------------------------------------------------------------ positions --
  var cur = null;   // the running script
  function landmarkDoor(id) {
    var lm = W().landmark(id); if (!lm) { U.reportError(new Error('cutscene: unknown landmark ' + id), 'cutscenes'); return null; }
    var d = lm.door || { x: lm.x, z: lm.z, y: 0 };
    return { x: d.x, z: d.z, y: d.y || 0, lm: lm };
  }
  function roofTop(lm) {
    var b = lm && lm.building; if (!b) return null;
    return (b.y || 0) + (b.h || (b.floors || 2) * C.FLOOR_H);
  }
  function entityOf(ref) {
    if (!cur || !ref) return null;
    if (ref === 'player') return player();
    var id = ref.indexOf('actor:') === 0 ? ref.slice(6) : ref;
    return cur.actors[id] || null;
  }
  // an entity-frame offset: x right, z back, y up
  function fromEntity(e, off) {
    off = off || {};
    var f = U.yawToDir(e.yaw || 0), rx = -f.z, rz = f.x;
    return { x: e.x + rx * (off.x || 0) - f.x * (off.z || 0), y: e.y + (off.y || 0), z: e.z + rz * (off.x || 0) - f.z * (off.z || 0) };
  }
  // an over-the-shoulder camera: {entity, offset} with the look-at on another entity. The scripts disagree on the sign of z
  // (GDD_EXPANSION 4.1 says +z is back, 4.3 wrote -1.8 for 'behind'); whichever sign, the camera goes on the far side of its
  // entity from the target, so shot 2 of an intro frames the giver over the player's shoulder (QA-C1-04)
  function shoulderFrom(spec, toSpec) {
    if (!spec || !spec.entity || !spec.offset || !toSpec || !toSpec.entity) return null;
    var e = entityOf(spec.entity), t = entityOf(toSpec.entity); if (!e || !t || e === t) return null;
    var p = fromEntity(e, spec.offset), dz = spec.offset.z || 0;
    if (Math.abs(dz) < 0.5) return null;
    if (U.dist2d(p.x, p.z, t.x, t.z) >= U.dist2d(e.x, e.z, t.x, t.z)) return null;   // already behind
    return fromEntity(e, { x: spec.offset.x, y: spec.offset.y, z: -dz });
  }
  // a camera or actor spot -> {x, y, z} (actors: y from the ground, or the roof)
  function spot(spec, actor) {
    if (!spec) return null;
    var Wd = W();
    if (spec.entity) { var e = entityOf(spec.entity); if (!e) return null; var p = fromEntity(e, spec.offset); if (actor) p.y = Wd.heightAt(p.x, p.z, e.y); return p; }
    if (spec.landmark) {
      var d = landmarkDoor(spec.landmark); if (!d) return null;
      var o = spec.offset || {}, x = d.x + (o.x || 0), z = d.z + (o.z || 0), y;
      if (actor) { if (spec.roof) { var ry = roofTop(d.lm); y = ry != null ? ry : Wd.heightAt(x, z, 0); } else y = Wd.heightAt(x, z, d.y); }
      else y = d.y + (o.y || 0);
      return { x: x, y: y, z: z, lm: d.lm };
    }
    if (spec.x != null) {
      var zz = spec.z != null ? spec.z : 0;
      return { x: spec.x, z: zz, y: actor ? Wd.heightAt(spec.x, zz, spec.y || 0) : (spec.y != null ? spec.y : Wd.heightAt(spec.x, zz, 0) + 1.6) };
    }
    return null;
  }
  // the look-at point: an entity is looked at chest height
  function lookAt(spec) {
    if (!spec) return null;
    if (spec.entity) { var e = entityOf(spec.entity); if (!e) return null; var p = fromEntity(e, spec.offset); if (!spec.offset || spec.offset.y == null) p.y = e.y + (e.inVehicle ? 1.0 : 1.25); return p; }
    return spot(spec, false);
  }
  // never clip into a building: push the point out by 0.5 m steps, up to 8 m, trying eight directions
  function pushOut(pt, toward) {
    var Wd = W(); if (!pt || !Wd.solidAt(pt.x, pt.z, pt.y)) return pt;
    var dirs = [];
    if (toward) { var dx = pt.x - toward.x, dz = pt.z - toward.z, l = Math.sqrt(dx * dx + dz * dz) || 1; dirs.push([dx / l, dz / l]); }
    for (var a = 0; a < 8; a++) dirs.push([Math.cos(a / 8 * TAU), Math.sin(a / 8 * TAU)]);
    for (var r = K.pushOut; r <= 8; r += K.pushOut) for (var i = 0; i < dirs.length; i++) {
      var x = pt.x + dirs[i][0] * r, z = pt.z + dirs[i][1] * r;
      if (!Wd.solidAt(x, z, pt.y)) return { x: x, y: pt.y, z: z, lm: pt.lm };
    }
    return { x: pt.x, y: pt.y + 12, z: pt.z, lm: pt.lm };   // a roof shot, then
  }

  // ---------------------------------------------------------------- poses --
  // An instance-level syncMesh wrapper: the prototype's pose runs first (legs, breathing), then the cutscene gesture
  // on the same part pivots. Removed with pose(ped, null); the ped keeps nothing of it.
  function applyPose(p) {
    var parts = p._parts; if (!parts || !parts.armR || !p.mesh || !p.mesh.visible || p.inVehicle || p.knockedDown || !p.alive) return;
    var t = p.animTime || 0, anim = p.poseAnim, g = p.gestureT > 0 ? 1 : 0;
    if (anim === 'talk') {
      var k = 0.35 + g * 0.5;
      parts.armR.rotation.x = 0.55 * k + Math.sin(t * 3.1) * 0.22 * k; parts.armR.rotation.z = -0.15 - g * 0.12;
      parts.armL.rotation.x = 0.3 * k + Math.sin(t * 2.3 + 1) * 0.15 * k; parts.armL.rotation.z = 0.12;
      if (parts.head) parts.head.rotation.x = Math.sin(t * 4.2) * 0.05 * (0.5 + g);
    } else if (anim === 'point') {
      parts.armR.rotation.x = 1.5; parts.armR.rotation.z = -0.08; parts.armL.rotation.x = 0.05 + Math.sin(t * 1.8) * 0.03;
      if (parts.head) parts.head.rotation.x = -0.05;
    } else if (anim === 'table') {
      parts.armR.rotation.x = 0.95; parts.armL.rotation.x = 0.95; parts.armR.rotation.z = -0.2; parts.armL.rotation.z = 0.2;
      if (parts.torso) parts.torso.rotation.x = -0.22;
      if (parts.head) parts.head.rotation.x = 0.18 + Math.sin(t * 1.4) * 0.03;
    } else if (anim === 'wave') {
      var w = Math.sin(t * (TAU / K.waveEvery)) > -0.2 ? 1 : 0;
      parts.armR.rotation.x = 2.75; parts.armR.rotation.z = -0.35 + Math.sin(t * 7) * 0.3 * w;
      parts.armL.rotation.x = Math.sin(t * 1.8) * 0.03;
    } else {   // idle: a weight shift
      if (parts.torso) parts.torso.rotation.z = Math.sin(t * 0.9) * 0.02;
      if (parts.head) parts.head.rotation.y = Math.sin(t * 0.6) * 0.08;
    }
  }
  function pose(ped, anim) {
    if (!ped) return;
    if (!anim) {
      if (ped._poseWrapped) { delete ped.syncMesh; ped._poseWrapped = false; }
      ped.poseAnim = null; ped.gestureT = 0;
      return;
    }
    ped.poseAnim = anim;
    if (ped._poseWrapped) return;
    ped._poseWrapped = true;
    ped.syncMesh = function (alpha) {
      Object.getPrototypeOf(this).syncMesh.call(this, alpha);
      applyPose(this);
    };
  }

  // --------------------------------------------------------------- actors --
  function rollLook(role, x, z) {
    var CW = GTP.Content.world, dd = W().districtAt(x, z), L = GTP.Content.looks;
    var r = (L && L.roles && L.roles[role]) ? role : 'npc';
    return CW.spawn.peds.rollLook(dd ? dd.id : 'downtown', r);
  }
  function freeze(ped) {
    if (ped._frozen) return;
    ped._frozen = true;
    ped.vx = ped.vz = ped.vy = 0; ped.onGround = true; ped.swimming = false; ped.state = 'idle'; ped.intent.x = ped.intent.z = 0;
    ped.update = function (dt) { this.age += dt; this.animTime += dt; if (this.gestureT > 0) this.gestureT -= dt; if (this.lineTime > 0) { this.lineTime -= dt; if (this.lineTime <= 0) this.line = null; } };
  }
  function thaw(ped) { if (!ped || !ped._frozen) return; delete ped.update; ped._frozen = false; ped.snap(); }
  function placeActor(ped, a) {
    var pt = a.at ? spot(a.at, true) : null;
    if (pt) {
      var r = W().resolveCapsule(pt.x, pt.z, pt.y + 0.5, 0.4);
      if (a.at.roof) { ped.x = pt.x; ped.z = pt.z; if (ped === player()) cur.playerOnRoof = true; } else { ped.x = r.x; ped.z = r.z; }
      ped.y = pt.y; ped.vx = ped.vz = ped.vy = 0; ped.snap();
      if (ped._sh) E().hash.update(ped);
    }
    if (a.face != null) {
      if (typeof a.face === 'number') ped.yaw = a.face;
      else if (a.face === 'away') { var pl = player(); if (pl && pl !== ped) ped.yaw = U.dirToYaw(ped.x - pl.x, ped.z - pl.z); }
      else { var tgt = entityOf(a.face === 'player' ? 'player' : a.face); if (tgt && tgt !== ped) ped.yaw = U.dirToYaw(tgt.x - ped.x, tgt.z - ped.z); }
      ped.moveYaw = ped.yaw; ped.aimYaw = ped.yaw;
    }
    // a placard (Roz's CHEESE, Kip's MATTRESS): the look changes, so the mesh is rebuilt
    if (a.sign != null && ped.look && ped.look.sign !== a.sign && ped.kind !== 'player') {
      ped.look.sign = a.sign;
      var Rd = GTP.Render; if (Rd && Rd.detach && Rd.attach) { try { Rd.detach(ped); Rd.attach(ped); ped._parts = null; } catch (e) { /* cosmetic */ } }
    }
    if (a.anim !== undefined) pose(ped, a.anim || 'idle');
    else if (!ped.poseAnim) pose(ped, 'idle');
  }
  // the pill's title: the script's own, else the mission it introduces (never a raw id like cs_intro_m12b_scope)
  function scriptTitle(c) {
    if (c.script.title) return c.script.title;
    var m = c.mission || null, mid = c.script.mission || (m && m.id) || null;
    if (m && m.title) return m.title;
    if (mid && GTP.Missions && GTP.Missions.allMissions) { var all = GTP.Missions.allMissions(); for (var i = 0; i < all.length; i++) if (all[i].id === mid) return all[i].title; }
    return null;
  }
  function residentFor(id, a) {
    var AI = GTP.AI; if (!AI || !AI.residents || !AI.residents.near) return null;
    var at = a.at ? spot(a.at, true) : null, pl = player(), x = at ? at.x : (pl ? pl.x : null), z = at ? at.z : (pl ? pl.z : null);
    return AI.residents.near(id, x, z, 60);
  }
  function actorFor(a) {
    var id = a.castId || a.id; if (!id) return null;
    var ped = cur.actors[id];
    if (ped && !ped.removed) return ped;
    if (id === 'player') ped = player();
    else if (cur.reuse[id] && !cur.reuse[id].removed) { ped = cur.reuse[id]; cur.reused.push(ped); }
    else if (residentFor(id, a)) { ped = residentFor(id, a); cur.reused.push(ped); }   // Merle already at his door: the same man, not a twin
    else {
      var at = a.at ? spot(a.at, true) : null, pl = player();
      var x = at ? at.x : (pl ? pl.x + 2 : 0), z = at ? at.z : (pl ? pl.z : 0);
      var cast = castOf(id), look = cast && cast.look ? Object.assign({}, cast.look) : rollLook(id, x, z);
      if (a.look) look = Object.assign(look, a.look);
      if (a.sign != null) look.sign = a.sign;
      ped = new GTP.Ped({ x: x, z: z, look: look, role: cast ? 'npc' : id, persistent: true });
      ped.y = at ? at.y : W().heightAt(x, z, 0); ped.yaw = 0; ped.snap();
      ped.castId = id; ped.name = cast ? cast.name : id; ped.cutscene = true;
      ped.ai = { phase: 0.5, mode: 'mission', mission: 'cutscene', ambient: false };
      E().add(ped);
      cur.spawned.push(ped);
    }
    cur.actors[id] = ped;
    if (id === 'player') { if (ped.inVehicle && a.at) ped.exitVehicle(); ped.stop(); ped.aiming = false; ped.lockTarget = null; }
    freeze(ped);
    return ped;
  }
  function removeActors() {
    var i, p;
    for (i = 0; i < cur.spawned.length; i++) { p = cur.spawned[i]; pose(p, null); thaw(p); if (!p.removed) { if (p.destroy) p.destroy(); E().remove(p); } }
    for (i = 0; i < cur.reused.length; i++) { p = cur.reused[i]; pose(p, null); thaw(p); }
    for (i = 0; i < cur.vehicles.length; i++) { var v = cur.vehicles[i]; if (!v.removed) { if (v.destroy) v.destroy(); E().remove(v); } }
    var pl = player(); if (pl) { pose(pl, null); thaw(pl); pl.controlEnabled = true; }
    cur.spawned.length = 0; cur.reused.length = 0; cur.vehicles.length = 0; cur.actors = {};
  }

  // --------------------------------------------------------------- shots --
  function shotLines(shot, index) {
    if (shot.lines) return shot.lines.slice();
    var all = cur.lines; if (!all || !all.length) return [];
    var split = cur.script.split != null ? cur.script.split : Math.ceil(all.length / 2);
    if (cur.script.shots.length === 1) return all.slice();
    if (index === 0) return all.slice(0, split);
    if (index === cur.script.shots.length - 1) return all.slice(split);
    return [];
  }
  function shotOrigin(shot) {
    var cam = shot.cam || {}, lmSpec = (cam.to && cam.to.landmark) ? cam.to : (cam.from && cam.from.landmark) ? cam.from : null;
    if (lmSpec) { var d = landmarkDoor(lmSpec.landmark); if (d) return d; }
    for (var i = 0; i < (shot.actors || []).length; i++) { var a = shot.actors[i]; if (a.at && a.at.landmark) { var d2 = landmarkDoor(a.at.landmark); if (d2) return d2; } }
    var pl = player(); return pl ? { x: pl.x, y: pl.y, z: pl.z } : { x: 0, y: 0, z: 0 };
  }
  function beginShot(index) {
    var s = cur.script, shot = s.shots[index], cam = shot.cam || {};
    cur.i = index; cur.shot = shot; cur.t = 0; cur.hold = 0; cur.linesDone = false; cur.camSnap = true;
    // actors first: the camera may frame them
    var acts = shot.actors || [];
    for (var i = 0; i < acts.length; i++) { var ped = actorFor(acts[i]); if (ped) placeActor(ped, acts[i]); }
    // a later shot of a mission intro: whoever has no facing of their own turns to the player, and the player to the giver,
    // so the reverse shot sees faces, not the backs the first shot left them with (QA-C1-04)
    if (index > 0 && s.mission) faceForShot(acts, cam.to);
    cur.from = pushOut(shoulderFrom(cam.from, cam.to) || spot(cam.from, false) || cur.lastFrom || fallbackFrom(), lookAt(cam.to));
    cur.moveTo = cam.move && cam.move.to ? pushOut(spot(cam.move.to, false) || cur.from, lookAt(cam.to)) : null;
    cur.toSpec = cam.to || null;
    cur.seconds = cam.seconds != null ? cam.seconds : 4;
    cur.ease = cam.ease || 'inout';
    cur.lastFrom = cur.moveTo || cur.from;
    // cosmetic parked vehicles for the shot (removed with the actors)
    var vs = shot.vehicles || [];
    for (i = 0; i < vs.length; i++) {
      try {
        var vd = vs[i], vp = spot(vd.at, true); if (!vp || !GTP.Vehicle) continue;
        var cv = new GTP.Vehicle({ x: vp.x, z: vp.z, type: vd.type || 'sedan', color: vd.color || undefined, wrap: vd.wrap || undefined, persistent: true, tag: vd.tag || 'cutscene' });
        cv.y = vp.y; cv.yaw = vd.yaw || 0; cv.snap(); E().add(cv); cur.vehicles.push(cv);
      } catch (e) { U.reportError(e, 'cutscenes.vehicle'); }
    }
    // fx at the shot's start, relative to the shot's landmark door (or above a tagged vehicle)
    var o = shotOrigin(shot), fxs = shot.fx || [];
    for (i = 0; i < fxs.length; i++) {
      var f = Object.assign({}, fxs[i]), org = o;
      if (f.tag) { var tv = taggedEntity(f.tag); if (tv) org = { x: tv.x, y: tv.y, z: tv.z }; delete f.tag; }
      f.x = org.x + (f.x || 0); f.y = (org.y || 0) + (f.y || 0); f.z = org.z + (f.z || 0);
      if (GTP.Render && GTP.Render.fx) { try { GTP.Render.fx.add(f); } catch (e) { U.reportError(e, 'cutscenes.fx'); } }
    }
    var lines = shotLines(shot, index), Ms = GTP.Missions;
    if (lines.length && Ms && Ms.say) {
      var token = ++cur.lineToken;
      Ms.say(lines, function () { if (cur && cur.lineToken === token) cur.linesDone = true; });
    } else cur.linesDone = true;
    GTP.Events.emit('cutscene:shot', { id: s.id, shot: index, shots: s.shots.length });
  }
  function faceForShot(acts, toSpec) {
    var pl = player(), look = toSpec && toSpec.entity ? entityOf(toSpec.entity) : null;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i], id = a.castId || a.id, ped = cur.actors[id]; if (!ped || a.face != null || a.at) continue;
      var tgt = id === 'player' ? (look && look !== pl ? look : null) : pl;
      if (!tgt || tgt === ped) continue;
      ped.yaw = U.dirToYaw(tgt.x - ped.x, tgt.z - ped.z); ped.moveYaw = ped.yaw; ped.aimYaw = ped.yaw;
    }
  }
  function fallbackFrom() { var pl = player(); return pl ? { x: pl.x - 3, y: pl.y + 2.2, z: pl.z + 4 } : { x: 0, y: 2, z: 5 }; }
  function taggedEntity(tag) { var list = E().list; for (var i = 0; i < list.length; i++) if (list[i].tag === tag && !list[i].removed) return list[i]; return null; }
  function endShot() {
    if (!cur) return;
    var next = cur.i + 1;
    if (next >= cur.script.shots.length) finish(true);
    else beginShot(next);
  }

  // --------------------------------------------------------------- music --
  function musicStart(spec) {
    var A = GTP.Audio; if (!A || !A.radio) return;
    cur.musicWas = null;
    try {
      if (!spec || spec === 'off') { cur.musicWas = A.radio.isPlaying && A.radio.isPlaying() ? A.station : null; A.radio.stop(); }
      else if (typeof spec === 'string' && spec.indexOf('station:') === 0) {
        var want = spec.slice(8), list = (GTP.Content.radio && GTP.Content.radio.stations) || [];
        for (var i = 0; i < list.length; i++) if (list[i].id === want) { cur.musicWas = A.station; A.radio.setStation(i); break; }
      }
    } catch (e) { /* audio optional */ }
  }
  function musicEnd(c) {
    var A = GTP.Audio; if (!A || !A.radio || !c || c.musicWas == null) return;
    try { A.radio.setStation(c.musicWas); } catch (e) { /* audio optional */ }
  }

  // ---------------------------------------------------------------- play --
  function finish(runDone) {
    if (!cur) return;
    var c = cur, g = game(), pl = player(), Ms = GTP.Missions;
    c.lineToken++;   // a line callback arriving late changes nothing
    try { if (Ms && Ms.dialogue && Ms.dialogue.active && Ms.skipDialogue) Ms.skipDialogue(); } catch (e) { /* queue may be empty */ }
    try { removeActors(); } catch (e) { U.reportError(e, 'cutscenes.actors'); }
    // a script that stood the player on a roof (the endings on Goldplate Tower) puts them back where they were (QA-C1-11)
    if (pl && c.playerOnRoof && c.playerWas) {
      var wy = W().heightAt(c.playerWas.x, c.playerWas.z, c.playerWas.y);   // the deck or roof they stood on, not the street under it
      if (g && g.debug && g.debug.teleport) g.debug.teleport(c.playerWas.x, c.playerWas.z, wy); else { pl.x = c.playerWas.x; pl.z = c.playerWas.z; pl.y = wy; pl.snap(); }
      pl.yaw = c.playerWas.yaw;
    }
    // the clock the script asked for goes back to the game's own, moved on by the time the cutscene took (QA-C1-12)
    if (c.clockWas != null && g && g.time) {
      var hrs = (simT() - c.startedAt) / ((C.DAY && C.DAY.secondsPerHour) || 60);
      var tot = c.clockWas + hrs;
      g.time.clock = ((tot % 24) + 24) % 24;
      if (c.dayWas != null) g.time.day = c.dayWas + Math.floor(tot / 24);   // the override's own midnight never counts
      if (GTP.Render && GTP.Render.updateEnvironment) { try { GTP.Render.updateEnvironment(g.time.clock); } catch (e) { /* cosmetic */ } }
    }
    cur = null;
    if (GTP.AI) GTP.AI.alarmMuted = !!c.alarmWas;
    if (c.wantedWas && GTP.AI && GTP.AI.wanted && GTP.AI.wanted.set) { try { GTP.AI.wanted.set(c.wantedWas); } catch (e) { /* ai optional */ } }
    musicEnd(c);
    var Rd = GTP.Render;
    if (Rd) { Rd.freeCam(false); if (Rd.rig && pl) { Rd.rig.target(pl); Rd.rig.yaw = pl.yaw; Rd.rig.pitch = 0.2; Rd.rig.snap(); Rd.updateCamera(0); } }
    Cutscenes.active = false; Cutscenes.letterbox = false; Cutscenes.current = null;
    if (g && g.state === 'cutscene') g.setState(c.restore && c.restore !== 'cutscene' ? c.restore : 'playing');
    GTP.Events.emit('cutscene:end', { id: c.script.id || null, skipped: !!c.skipped, completed: runDone !== false });
    if (runDone !== false && typeof c.onDone === 'function') { try { c.onDone(); } catch (e) { U.reportError(e, 'cutscenes.onDone'); } }
  }
  // how long confirm has been held: game time, or the wall clock while the live loop runs, whichever is longer. At a few frames a
  // second (a software renderer, the first frames of the opening) each frame adds only a capped slice of game time, so a 0.6 s
  // hold of Enter took many seconds of real time to skip the opening. Tests that step the game (no live loop) stay on game time.
  function wallNow() { return typeof performance !== 'undefined' && performance.now ? performance.now() / 1000 : 0; }
  function skipHeld(c, peek) {
    var g = game(), live = !!(g && g._raf) && wallNow() > 0, kh = keyHold.script === c ? wallNow() - keyHold.t0 : 0;
    if (!live || !(c.skipHoldT > 0)) return Math.max(c.skipHoldT || 0, live ? kh : 0);
    var now = wallNow();
    if (c.skipWall0 == null) { if (peek) return Math.max(c.skipHoldT, kh); c.skipWall0 = now - c.skipHoldT; }
    return Math.max(c.skipHoldT, now - c.skipWall0, kh);
  }
  // The keyboard's own hold, timed from its events: when frames come seconds apart a whole hold of Enter can fall between two
  // steps, and polling Input.down never sees it. A confirm key (Enter, Space: GTP.Input.bindings) held for skipHold seconds of
  // wall clock, by its autorepeat or at its keyup, asks the running script to skip at the next step.
  var keyHold = { code: null, t0: 0, script: null };
  function confirmKey(code) { var B = GTP.Input && GTP.Input.bindings, a = B && B[code]; return !!a && a.indexOf('confirm') >= 0; }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', function (e) {
      var c = cur; if (!c || c.script.skippable === false || !confirmKey(e.code)) return;
      var now = wallNow();
      if (keyHold.code !== e.code || keyHold.script !== c) { keyHold.code = e.code; keyHold.t0 = now; keyHold.script = c; return; }
      if (now - keyHold.t0 >= K.skipHold) c.skipRequested = true;
    }, true);
    window.addEventListener('keyup', function (e) {
      if (keyHold.code !== e.code) return;
      var c = keyHold.script, held = wallNow() - keyHold.t0;
      keyHold.code = null; keyHold.script = null;
      if (c && c === cur && held >= K.skipHold) c.skipRequested = true;
    }, true);
    window.addEventListener('blur', function () { keyHold.code = null; keyHold.script = null; });
  }
  var Cutscenes = GTP.Cutscenes = {
    K: K,
    active: false,
    letterbox: false,
    current: null,
    scriptFor: scriptFor,
    pose: pose,
    // script: an id in Content.expansion.cutscenes or an inline script. opts: {lines (the mission intro lines, split across
    // the shots when the script has none), mission, reuse: {castId: ped} (the giver and Kip already at the door)}
    play: function (script, onDone, opts) {
      opts = opts || {};
      var s = scriptFor(script), g = game(), pl = player();
      if (!s || !s.shots || !s.shots.length || !g || !pl) return false;
      if (cur) return false;
      cur = {
        script: s, i: -1, t: 0, shot: null, actors: {}, spawned: [], reused: [], vehicles: [], reuse: opts.reuse || {}, onDone: onDone || null, lines: opts.lines || null, mission: opts.mission || null,
        restore: g.state === 'cutscene' ? 'playing' : g.state, skipHoldT: 0, hold: 0, linesDone: true, lineToken: 0, wantedWas: 0, alarmWas: false, skipped: false, musicWas: null,
        from: null, moveTo: null, toSpec: null, seconds: 4, ease: 'inout', camSnap: true, lastFrom: null, look: null, startedAt: simT()
      };
      Cutscenes.active = true; Cutscenes.letterbox = s.letterbox !== false; Cutscenes.current = cur;
      cur.playerWas = { x: pl.x, z: pl.z, y: pl.y, yaw: pl.yaw };
      // `clock`: the script's time of day (cs_ending_b at dawn) for its duration
      if (typeof s.clock === 'number' && g.time) {
        cur.clockWas = g.time.clock; cur.dayWas = g.time.day; g.time.clock = ((s.clock % 24) + 24) % 24;
        if (GTP.Render && GTP.Render.updateEnvironment) { try { GTP.Render.updateEnvironment(g.time.clock); } catch (e) { /* cosmetic */ } }
      }
      // the world keeps simulating but nobody panics, nothing is wanted, the radio does what the script says
      if (GTP.AI) { cur.alarmWas = !!GTP.AI.alarmMuted; GTP.AI.alarmMuted = true; if (GTP.AI.wanted && GTP.AI.wanted.level > 0) { cur.wantedWas = GTP.AI.wanted.level; GTP.AI.wanted.clear(); } }
      musicStart(s.music);
      if (pl.inVehicle) pl.inVehicle.setControls(0, 0, false, 1);
      pl.stop(); pl.aiming = false; pl.lockTarget = null; pl.controlEnabled = false;
      if (g.state !== 'cutscene') g.setState('cutscene');
      if (GTP.Render) GTP.Render.freeCam(true);
      GTP.Events.emit('cutscene:start', { id: s.id || null, shots: s.shots.length });
      try { beginShot(0); } catch (e) { U.reportError(e, 'cutscenes.begin'); finish(true); return true; }
      Cutscenes.update(0);
      return true;
    },
    // once per save: flags.cs_<id>
    playOnce: function (id, onDone) {
      var Ms = GTP.Missions, flags = Ms && Ms.state ? Ms.state.flags : null, key = 'cs_' + (typeof id === 'string' ? id : (id && id.id));
      if (!flags || flags[key] || !scriptFor(id)) return false;
      flags[key] = true;
      return Cutscenes.play(id, onDone);
    },
    skipShot: function () {
      if (!cur) return false;
      var Ms = GTP.Missions;
      if (Ms && Ms.dialogue && Ms.dialogue.active && Ms.skipDialogue) { cur.lineToken++; Ms.skipDialogue(); }
      cur.linesDone = true; cur.t = Math.max(cur.t, cur.seconds); cur.hold = 1e9;
      return true;
    },
    skip: function () { if (!cur) return false; cur.skipped = true; finish(true); return true; },
    cancel: function () { if (!cur) return false; finish(false); return true; },
    reset: function () { if (cur) finish(false); },
    update: function (dt) {
      if (!cur) return;
      var c = cur, g = game(), In = GTP.Input, Rd = GTP.Render, cam = Rd && Rd.camera;
      c.t += dt;
      // skip: back once = this shot, confirm held = the script
      if (In && c.script.skippable !== false) {
        if (c.skipRequested) { Cutscenes.skip(); return; }
        if (In.pressed('back')) { Cutscenes.skipShot(); }
        if (In.down('confirm')) { c.skipHoldT += dt; if (skipHeld(c) >= K.skipHold) { Cutscenes.skip(); return; } }
        else { c.skipHoldT = 0; c.skipWall0 = null; }
      }
      // the talking actor gestures while their line shows
      var Ms = GTP.Missions, line = Ms && Ms.dialogue && Ms.dialogue.active ? Ms.dialogue.current : null;
      for (var id in c.actors) { var a = c.actors[id]; if (!a) continue; a.gestureT = line && line.who === id ? 0.5 : 0; }
      // camera: an eased dolly from `from` to `move.to`, the look-at re-resolved each step (an entity target tracks;
      // a `track: 'speaker'` shot looks at whoever is talking)
      if (cam && c.from) {
        var k = c.seconds > 0 ? easeK(c.ease, c.t / c.seconds) : 1;
        var to = c.moveTo || c.from, px = U.lerp(c.from.x, to.x, k), py = U.lerp(c.from.y, to.y, k), pz = U.lerp(c.from.z, to.z, k);
        var spec = c.toSpec;
        if (c.shot && c.shot.track === 'speaker' && line && line.who && c.actors[line.who]) spec = { entity: line.who === 'player' ? 'player' : 'actor:' + line.who };
        var lk = lookAt(spec) || { x: px, y: py - 0.5, z: pz - 4 };
        if (c.camSnap || !c.look) { cam.position.set(px, py, pz); c.look = { x: lk.x, y: lk.y, z: lk.z }; c.camSnap = false; }
        else {
          cam.position.x = U.damp(cam.position.x, px, K.camDamp, dt); cam.position.y = U.damp(cam.position.y, py, K.camDamp, dt); cam.position.z = U.damp(cam.position.z, pz, K.camDamp, dt);
          c.look.x = U.damp(c.look.x, lk.x, K.lookDamp, dt); c.look.y = U.damp(c.look.y, lk.y, K.lookDamp, dt); c.look.z = U.damp(c.look.z, lk.z, K.lookDamp, dt);
        }
        cam.lookAt(c.look.x, c.look.y, c.look.z);
        if (Math.abs(cam.fov - C.CAMERA.fov) > 0.05) { cam.fov = C.CAMERA.fov; cam.updateProjectionMatrix(); }
      }
      if (g && g.state !== 'cutscene' && g.state !== 'paused') { finish(true); return; }
      if (c.t >= c.seconds && c.linesDone) {
        c.hold += dt;
        if (c.hold >= (c.shot && c.shot.hold != null ? c.shot.hold : K.holdDefault)) endShot();
      }
    },
    hud: function () {
      if (!cur) return { active: false, letterbox: false, skip: 0 };
      return { active: true, letterbox: Cutscenes.letterbox, skip: U.clamp(skipHeld(cur, true) / K.skipHold, 0, 1), shot: cur.i, shots: cur.script.shots.length, title: scriptTitle(cur), t: cur.t, seconds: cur.seconds, skippable: cur.script.skippable !== false };
    },
    actors: function () { return cur ? cur.actors : {}; },
    debug: { cur: function () { return cur; }, spot: spot, lookAt: lookAt }
  };

  // ====================================================================== GTP.Hints ==
  var HINT_DEFS = [
    { id: 'h_move', text: 'WASD or the left stick moves. Shift runs. Space jumps.', keys: ['W', 'A', 'S', 'D'] },
    { id: 'h_look', text: 'Move the mouse or the right stick to look. Click the game to lock the pointer.', keys: ['MOUSE'] },
    { id: 'h_enter', text: 'F or Enter gets in. The same key gets out.', keys: ['F'] },
    { id: 'h_drive', text: 'W goes, S brakes and reverses, Space is the handbrake. Hold it for a slide.', keys: ['W', 'S', 'SPACE'] },
    { id: 'h_arrow', text: 'The arrow on the minimap and the top of the screen points at the objective. The Loop is the fast way across town.', keys: [] },
    { id: 'h_aim', text: 'Hold the right mouse button (or Q) to aim. Tab switches targets. Head shots count double.', keys: ['RMB', 'Q', 'TAB'] },
    { id: 'h_reload', text: 'R reloads. An empty magazine reloads itself.', keys: ['R'] },
    { id: 'h_wheel', text: 'Hold Tab (no gun raised) for the weapon wheel. The wheel or [ ] cycles.', keys: ['TAB'] },
    { id: 'h_wanted', text: 'You\'re wanted. Break line of sight and the star fades. Gus\'s Garage resprays it for $100.', keys: [] },
    { id: 'h_bust', text: 'Cops on foot can bust you in a few seconds. Get in a car or run.', keys: ['SHIFT'] },
    { id: 'h_shop', text: 'Green light: a shop. Stand in it to buy weapons, ammo, Clarity Pellets and the Firmness Vest.', keys: [] },
    { id: 'h_taxi', text: 'Press E while stopped to start taking fares.', keys: ['E'] },
    { id: 'h_patrol', text: 'Press E while stopped to start an HOA patrol.', keys: ['E'] },
    { id: 'h_map', text: 'M opens the map. Click anywhere to set a waypoint.', keys: ['M'] },
    { id: 'h_save', text: 'The pod van is home. Sitting in it here saves the game.', keys: [] }
  ];
  function hintDef(id) {
    var X = expansion().hints || [];
    for (var i = 0; i < X.length; i++) if (X[i] && X[i].id === id) return Object.assign({}, HINT_DEFS.filter(function (h) { return h.id === id; })[0] || {}, X[i]);
    for (i = 0; i < HINT_DEFS.length; i++) if (HINT_DEFS[i].id === id) return HINT_DEFS[i];
    return null;
  }
  function flags() { var Ms = GTP.Missions; return Ms && Ms.state ? Ms.state.flags : null; }
  var hq = [], hcur = null, hgap = 0, hcheck = 0, hMoveAt = -1;
  var Hints = GTP.Hints = {
    enabled: true,
    DEFS: HINT_DEFS,
    reset: function () { hq.length = 0; hcur = null; hgap = 0; hcheck = 0; hMoveAt = -1; },
    seen: function (id) { var f = flags(); return !!(f && f['hint_' + id]); },
    // queue a hint once per save; force re-shows one
    fire: function (id, force) {
      if (!Hints.enabled) return false;
      var f = flags(); if (!f) return false;
      if (!force && (f['hint_' + id] || (hcur && hcur.id === id))) return false;
      for (var i = 0; i < hq.length; i++) if (hq[i] === id) return false;
      if (!hintDef(id)) return false;
      hq.push(id);
      return true;
    },
    current: function () { return hcur; },
    hud: function () { return hcur ? { id: hcur.id, text: hcur.text, keys: hcur.keys || [], t: hcur.t, total: K.hintSeconds, k: U.clamp(hcur.t / K.hintSeconds, 0, 1) } : null; },
    dismiss: function () { if (hcur) { hcur = null; hgap = K.hintGap; } },
    update: function (dt) {
      var g = game(), p = player(); if (!g || !p || !Hints.enabled) return;
      var playing = g.state === 'playing' && !(GTP.Cutscenes && GTP.Cutscenes.active) && !g.loading.active;
      if (hcur) {
        hcur.t += dt;
        // a hint the player has just acted on (got in the car, got out) leaves after a second instead of the full six
        var acted = (hcur.id === 'h_enter' && p.inVehicle) || (hcur.id === 'h_drive' && !p.inVehicle);
        if (hcur.t >= K.hintSeconds || !playing || (acted && hcur.t > 1)) { hcur = null; hgap = K.hintGap; }
      }
      if (hgap > 0) hgap -= dt;
      hcheck += dt;
      if (hcheck >= 0.5 && playing) { hcheck = 0; try { Hints.conditions(p, g); } catch (e) { U.reportError(e, 'hints'); } }
      if (!hcur && hgap <= 0 && playing && hq.length) {
        var id = hq.shift(), d = hintDef(id), f = flags();
        // a hint whose moment has passed (ENTER once the player is already driving, DRIVE once they got out) is dropped unseen:
        // its proximity trigger fires it again when it applies
        if ((id === 'h_enter' && p.inVehicle) || (id === 'h_drive' && !p.inVehicle)) return;
        if (d && f && !f['hint_' + id]) {
          f['hint_' + id] = true;
          hcur = { id: id, text: d.text, keys: d.keys || [], t: 0 };
          if (id === 'h_move') hMoveAt = simT();
          GTP.Events.emit('hint', { id: id, text: d.text, keys: d.keys || [] });
        }
      }
    },
    // the GDD_EXPANSION §6.6 triggers (h_move comes from the opening cutscene, h_save from the home van)
    conditions: function (p, g) {
      var Ms = GTP.Missions, CB = GTP.Combat, In = GTP.Input, v = p.inVehicle, f = flags(); if (!f) return;
      if (hMoveAt >= 0 && !f.hint_h_look && simT() - hMoveAt > 3 && (!In || In.lastLookTime < hMoveAt)) Hints.fire('h_look');
      if (!v && !f.hint_h_enter) { var near = GTP.Entities.near(p.x, p.z, 3.5, 'vehicle'); for (var i = 0; i < near.length; i++) if (!near[i].wreck && !near[i].sinking) { Hints.fire('h_enter'); break; } }
      if (v && v.driver === p) {
        Hints.fire('h_drive');
        if (v.type === 'taxi') Hints.fire('h_taxi');
        if ((v.type === 'cop' || (v.type === 'suv' && v.tag === 'hoasuv')) && Ms && Ms.state.completed.has('m10_pellets')) Hints.fire('h_patrol');
      }
      var o = Ms && Ms.current ? Ms.current() : null;
      if (o && o.def && o.def.type === 'drive_to') Hints.fire('h_arrow');
      var w = CB && CB.WEAPONS ? CB.WEAPONS[p.weapon] : null;
      if (w && !w.melee && !w.cone && !w.lobbed) {
        Hints.fire('h_aim');
        var a = CB.ammo ? CB.ammo(p, p.weapon) : null;
        if (a && w.mag && a.mag < w.mag / 3 && a.mag !== Infinity) Hints.fire('h_reload');
      }
      var owned = 0; for (var k in p.weapons) if (p.weapons[k] > 0 || p.weapons[k] === Infinity) owned++;
      if (owned >= 3) Hints.fire('h_wheel');
      if ((p.wanted | 0) >= 1) {
        Hints.fire('h_wanted');
        if (!v) { var peds = GTP.Entities.near(p.x, p.z, 8, 'ped'); for (i = 0; i < peds.length; i++) if (peds[i].alive && (peds[i].role === 'cop' || peds[i].role === 'swat') && !peds[i].inVehicle) { Hints.fire('h_bust'); break; } }
      }
      if (CB && CB.shop && CB.shop.stores && !f.hint_h_shop) { var st = CB.shop.stores(); for (i = 0; i < st.length; i++) if (U.dist2d(p.x, p.z, st[i].x, st[i].z) < 30) { Hints.fire('h_shop'); break; } }
      var tgt = Ms && Ms.objectiveTarget ? Ms.objectiveTarget() : null;
      if (tgt && tgt.dist > 250) Hints.fire('h_map');
      void g;
    }
  };
  GTP.Events.on('wanted', function (e) { if (e && e.level >= 1 && (e.prev | 0) < 1) Hints.fire('h_wanted'); });
})();
