/* Grand Theft Pundit: 06_ai.js
 * GTP.AI: the living city. A spawner that keeps ~60 peds and ~30 vehicles
 * alive around the player, ped brains (sidewalk wandering, crosswalks, idle
 * chatter, fleeing from gunfire / explosions / cars, knockdowns), traffic AI
 * (lane field following, traffic lights at junctions, random turns, car
 * following, honking, unsticking), taxis and buses as flavour, the wanted
 * system (heat sources, thresholds, decay without cop line of sight) and the
 * police response per star: foot cops that arrest, cruisers that ram and box
 * in, roadblocks ahead of the player at 3, SWAT vans at 4, a helicopter with
 * a searchlight at 5. Cops shoot back at 2+ when GTP.Combat has a pistol.
 *
 * Only entities that carry an `ai` object are driven here (the spawner sets
 * it; missions call GTP.AI.attach(entity, opts) to request a brain). Test and
 * mission entities without `ai` are left alone.
 *
 * URL param `ai=0` (or GTP.AI.enabled = false) turns the ambient population
 * and the police response off for isolated physics tests; the wanted heat
 * bookkeeping still runs.
 *
 * Crime hooks (05_entities and 07_combat call these):
 *   GTP.AI.wanted.onCrime(type, x, y)  type: hitPed killPed shootNearCop
 *       stealOccupied destroyVehicle attackCop, or shoot/gunshot (the AI then
 *       decides whether a cop was near enough to count it as shootNearCop)
 *   GTP.AI.alert(x, y, radius, kind)   panics peds in the radius
 *
 * Barks (small text above a ped for 2 s) come from
 * GTP.Content.world.spawn.peds.barks[role] when the content provides them,
 * otherwise from the generic lines below. All randomness goes through GTP.rng.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util, TILE = C.TILE;
  var W = GTP.World, T = W.T, M = W.M;
  var R = GTP.rng;

  // ---------------------------------------------------------------- knobs --
  var K = C.AI = Object.assign({
    pedBudget: C.SPAWN.peds,               // on-foot ambient peds kept alive
    vehicleBudget: C.SPAWN.vehicles,       // moving traffic kept alive
    parkedBudget: 6,                       // driverless cars in parking lots
    pedRadius: C.SPAWN.pedRadius,          // spawn annulus (px) around the player
    vehicleRadius: C.SPAWN.vehicleRadius,
    cullDist: 1400,                        // off-screen entities beyond this are recycled
    spawnPerStep: 2,
    cruise: { street: 150, avenue: 190, highway: 250 }, // px/s before the per-driver factor
    turnSpeed: 78,                         // px/s through a junction turn
    lightCycle: 12,                        // s per traffic-light cycle
    lightGreen: 0.44,                      // fraction of the cycle each axis is green
    lookAhead: 40,                         // px pure-pursuit lookahead
    honkSeconds: 1.5,                      // blocked this long -> honk
    stuckSeconds: 3,                       // blocked this long -> reverse / despawn
    pedSight: 560,                         // px a cop on foot can see the player
    carSight: 640,
    copRange: 900,                         // px within which ambient cops join a chase
    arrestSeconds: 1,                      // touch this long -> busted
    shootRange: 300,
    shootCooldown: 0.9,
    barkRange: 650,
    barkLife: 2,
    pedBudgetResponse: { foot: [0, 2, 3, 4, 5, 6], cruisers: [0, 0, 2, 3, 4, 5], swat: [0, 0, 0, 0, 1, 2] }
  }, C.AI || {});

  // -------------------------------------------------------------- helpers --
  function game() { return GTP.game; }
  function player() { return GTP.game ? GTP.game.player : null; }
  function E() { return GTP.Entities; }
  function simT() { return (GTP.game && GTP.game.time) ? GTP.game.time.t : 0; }
  function fxAdd(p) { var Rd = GTP.Render; if (Rd && Rd.fx && Rd.fx.add) Rd.fx.add(p); }
  function sfx(name, opts) { var A = GTP.Audio; if (A && A.play) { try { A.play(name, opts); } catch (e) { /* audio is optional */ } } }
  function toast(t) { var UI = GTP.UI; if (UI && UI.toast) { try { UI.toast(t); } catch (e) { /* ui is optional */ } } }
  function isRoadT(t) { return t === T.ROAD || t === T.BRIDGE; }
  function other(axis) { return axis === 'h' ? 'v' : 'h'; }
  function laneByte(tx, ty, axis) { if (!W.inBounds(tx, ty)) return 0; var i = ty * W.w + tx; return axis === 'h' ? W.laneH[i] : W.laneV[i]; }
  // +1 = east (h) / south (v), -1 = west / north
  function laneDir(b, axis) { var l = b >> 4, w = b & 15; if (axis === 'h') return l < w / 2 ? -1 : 1; return l < w / 2 ? 1 : -1; }
  function laneCoord(tx, ty, axis) { return axis === 'h' ? (ty + 0.5) * TILE : (tx + 0.5) * TILE; }
  function dirVec(axis, dir) { return axis === 'h' ? { dx: dir, dy: 0 } : { dx: 0, dy: dir }; }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  // buildings block sight
  function losClear(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy), n = Math.ceil(d / 14);
    for (var i = 1; i < n; i++) { var t = i / n; if (W.tileAt(ax + dx * t, ay + dy * t) === T.BUILDING) return false; }
    return true;
  }
  // nothing solid (buildings, water) along the line: a ped can walk it
  function walkClear(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy), n = Math.ceil(d / 12);
    for (var i = 1; i <= n; i++) { var t = i / n; if (W.solidAt(ax + dx * t, ay + dy * t)) return false; }
    return true;
  }
  // road / lot surface all the way: a car can drive straight there
  function driveClear(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy), n = Math.ceil(d / 14);
    for (var i = 1; i <= n; i++) {
      var t = i / n, tt = W.tileAt(ax + dx * t, ay + dy * t);
      if (!(isRoadT(tt) || tt === T.PARKING || tt === T.PLAZA)) return false;
    }
    return true;
  }
  var view = { x: 0, y: 0, w: 0, h: 0, valid: false };
  function refreshView() {
    var Rd = GTP.Render;
    if (Rd && Rd.viewRect) { var v = Rd.viewRect(); view.x = v.x; view.y = v.y; view.w = v.w; view.h = v.h; view.valid = true; }
    else view.valid = false;
  }
  function onScreen(x, y, m) {
    if (!view.valid) return false;
    m = m || 0;
    return x > view.x - m && x < view.x + view.w + m && y > view.y - m && y < view.y + view.h + m;
  }
  function weightedPick(obj) {
    var total = 0, k;
    for (k in obj) total += obj[k];
    if (!(total > 0)) return null;
    var r = R.random() * total;
    for (k in obj) { r -= obj[k]; if (r < 0) return k; }
    return k;
  }
  function pedSpotPred(t, tx, ty) { return t === T.SIDEWALK && !(W.metaAt(tx, ty) & M.SHOULDER); }
  function openPred(t) { return !W.isSolidTile(t); }
  // sample a tile matching pred inside an annulus around the player
  function samplePoint(p, radii, ignoreScreen, pred, searchR, tries) {
    tries = tries || 10;
    for (var i = 0; i < tries; i++) {
      var a = R.random() * U.TAU, r = R.range(radii[0], radii[1]);
      var x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (x < TILE || y < TILE || x > (W.w - 1) * TILE || y > (W.h - 1) * TILE) continue;
      var t = W.nearestTileOf(x, y, pred, searchR);
      if (!t) continue;
      var cx = (t.tx + 0.5) * TILE, cy = (t.ty + 0.5) * TILE;
      if (!ignoreScreen && onScreen(cx, cy, 64)) continue;
      if (U.dist2(cx, cy, p.x, p.y) < radii[0] * radii[0] * 0.5) continue;
      return { x: cx, y: cy, tx: t.tx, ty: t.ty };
    }
    return null;
  }
  function removeEntity(e) {
    var En = E();
    if (!e || !e._inList) return;
    if (e.kind === 'vehicle') {
      var occ = e.occupants();
      for (var i = 0; i < occ.length; i++) {
        if (occ[i].kind === 'player') { e.exit(occ[i]); continue; }
        occ[i].inVehicle = null; En.remove(occ[i]);
      }
      if (e.ai && e.ai.deco) En.remove(e.ai.deco);
    }
    En.remove(e);
  }

  // ---------------------------------------------------------------- barks --
  var BARKS = {
    civ: ['Did you see the ratio?', 'I only watch for the ads.', 'Nice folding table.', 'Is he live right now?', 'My take is hotter.',
      'No comment.', 'Who ordered the hot takes?', 'I unsubscribed years ago.', 'Mind the tripod.', 'Sponsored by nobody.',
      'Not today, pundit.', 'Late for my own podcast.', 'Touch grass, buddy.', 'Is this a bit?', 'Skip the ad, skip the ad.'],
    protester: ['Fund the quad!', 'Honk if you agree!', 'Debate me, coward!', 'Hot takes are not food!', 'Ratio the ratio!', 'Read a book!', 'Whose quad? Our quad!'],
    thug: ['Watch it.', 'You lost, pal?', 'Keep walking.', 'Nice mic. Shame if it broke.', 'This is my corner.', 'Beat it.'],
    npc: ["Let's circle back.", 'My people will call your people.', 'Per my last email...', 'Synergy, baby.', 'Have you tried a think tank?', 'Donor dinner at eight.'],
    cop: ['Move along.', 'Nothing to see here.', 'Jaywalking is a crime, pal.', 'Keep it moving.', 'Have a nice day. Or else.', 'Donut break in five.'],
    copChase: ['Stop right there!', 'Freeze, pundit!', 'Drop the microphone!', 'You have the right to stay quiet!', 'Pull over!', 'This is the police. Obviously.', 'Nobody outruns the precinct!'],
    copArrest: ["You're coming with me.", 'Hands where I can see the mic.', 'Busted, big mouth.'],
    honk: ['HONK!', 'BEEP BEEP', 'HOOONK', 'MOVE IT!'],
    panic: ['Aaah!', 'Run!', 'Not again!', 'My latte!', 'Someone post this!', 'Nope nope nope.']
  };
  function barksFor(role) {
    var CW = GTP.Content && GTP.Content.world;
    var tbl = CW && CW.spawn && CW.spawn.peds && CW.spawn.peds.barks;
    if (tbl && tbl[role] && tbl[role].length) return tbl[role];
    return BARKS[role] || BARKS.civ;
  }

  // A speech line that follows its owner for a couple of seconds (kind 'fx').
  function Bark(owner, text, color) {
    GTP.Entity.call(this);
    this.kind = 'fx'; this.z = 6; this.radius = 1;
    this.owner = owner; this.text = String(text); this.color = color || '#ffffff';
    this.life = K.barkLife;
    this.x = owner.x; this.y = owner.y - 24;
    this._px = this.x; this._py = this.y;
    this.removeWhenDead = true;
  }
  Bark.prototype = Object.create(GTP.Entity.prototype);
  Bark.prototype.constructor = Bark;
  Bark.prototype.update = function (dt) {
    this.age += dt; this.life -= dt;
    var o = this.owner;
    if (!o || !o._inList || o.inVehicle || o.state === 'dead' || this.life <= 0) { this.alive = false; return; }
    this.x = o.x; this.y = o.y - (o.kind === 'vehicle' ? o.cls.h / 2 + 14 : 24);
  };
  Bark.prototype.draw = function (ctx, ex, ey) {
    var a = Math.min(1, this.life / 0.35, this.age / 0.12 + 0.3);
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = 'bold 11px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var w = ctx.measureText(this.text).width + 10, h = 15;
    ctx.fillStyle = 'rgba(8,10,18,0.8)';
    roundRect(ctx, ex - w / 2, ey - h / 2, w, h, 4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ex - 3, ey + h / 2 - 0.5); ctx.lineTo(ex + 3, ey + h / 2 - 0.5); ctx.lineTo(ex, ey + h / 2 + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = this.color; ctx.fillText(this.text, ex, ey + 0.5);
    ctx.restore();
  };

  // Roadblock dressing: cones and a stripe on the ground (kind 'fx', under cars).
  function Deco(o) {
    GTP.Entity.call(this);
    this.kind = 'fx'; this.z = -0.5; this.radius = 1; this.removeWhenDead = true;
    this.cones = o.cones || []; this.x = o.x; this.y = o.y; this.axis = o.axis;
    this._px = this.x; this._py = this.y;
  }
  Deco.prototype = Object.create(GTP.Entity.prototype);
  Deco.prototype.constructor = Deco;
  Deco.prototype.update = function (dt) { this.age += dt; };
  Deco.prototype.draw = function (ctx) {
    for (var i = 0; i < this.cones.length; i++) {
      var c = this.cones[i];
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(c.x + 1, c.y + 2, 5, 3, 0, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(c.x, c.y, 4.2, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(c.x, c.y, 2.3, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(c.x, c.y, 1.1, 0, U.TAU); ctx.fill();
    }
  };

  // The level-5 helicopter: a top-down chopper with a ground shadow and a
  // searchlight that tracks the player. kind 'fx', drawn above everything.
  function Heli(o) {
    GTP.Entity.call(this);
    this.kind = 'fx'; this.z = 9; this.radius = 1; this.persistent = true; this.removeWhenDead = true;
    this.x = o.x; this.y = o.y; this.vx = 0; this.vy = 0;
    this.heading = 0; this.rotor = 0; this.orbit = R.random() * U.TAU; this.leaving = false;
    this.spot = { x: o.x, y: o.y };
    this._px = this.x; this._py = this.y;
  }
  Heli.prototype = Object.create(GTP.Entity.prototype);
  Heli.prototype.constructor = Heli;
  Heli.prototype.leave = function () { this.leaving = true; var a = R.random() * U.TAU; this.leaveDir = { x: Math.cos(a), y: Math.sin(a) }; };
  Heli.prototype.update = function (dt) {
    this.age += dt;
    var p = player(); if (!p) { this.alive = false; return; }
    this.rotor += dt * 30; this.orbit += dt * 0.55;
    var tx, ty;
    if (this.leaving) { tx = this.x + this.leaveDir.x * 600; ty = this.y + this.leaveDir.y * 600; }
    else { tx = p.x + Math.cos(this.orbit) * 120; ty = p.y + Math.sin(this.orbit) * 90; }
    var dx = tx - this.x, dy = ty - this.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var sp = Math.min(d * 2.4, 380);
    var k = 1 - Math.exp(-2.2 * dt);
    this.vx += (dx / d * sp - this.vx) * k; this.vy += (dy / d * sp - this.vy) * k;
    this.x += this.vx * dt; this.y += this.vy * dt;
    var vl = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (vl > 20) this.heading = U.angleLerp(this.heading, Math.atan2(this.vy, this.vx), Math.min(1, dt * 3));
    var sx = p.x + p.vx * 0.25 + Math.sin(this.age * 1.7) * 16, sy = p.y + p.vy * 0.25 + Math.cos(this.age * 1.3) * 12;
    var ks = 1 - Math.exp(-3.2 * dt);
    this.spot.x += (sx - this.spot.x) * ks; this.spot.y += (sy - this.spot.y) * ks;
    if (this.leaving && U.dist2(this.x, this.y, p.x, p.y) > 1700 * 1700) this.alive = false;
  };
  Heli.prototype.draw = function (ctx, ex, ey) {
    var hd = this.heading, rot = this.rotor, Rd = GTP.Render;
    var sx = this.spot.x, sy = this.spot.y;
    ctx.save();
    if (!this.leaving) {
      var dx = sx - ex, dy = sy - ey, dl = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / dl, ny = dx / dl;
      ctx.globalAlpha = 0.1; ctx.fillStyle = '#fffbe0';
      ctx.beginPath(); ctx.moveTo(ex + nx * 6, ey + ny * 6); ctx.lineTo(sx + nx * 60, sy + ny * 60); ctx.lineTo(sx - nx * 60, sy - ny * 60); ctx.lineTo(ex - nx * 6, ey - ny * 6); ctx.closePath(); ctx.fill();
      var g = ctx.createRadialGradient(sx, sy, 6, sx, sy, 66);
      g.addColorStop(0, 'rgba(255,252,220,0.45)'); g.addColorStop(0.7, 'rgba(255,252,220,0.2)'); g.addColorStop(1, 'rgba(255,252,220,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 66, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,252,220,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, 52, 0, U.TAU); ctx.stroke();
    }
    // ground shadow, offset like the building shadows (light from the north-west)
    ctx.save(); ctx.translate(ex + 40, ey + 62); ctx.rotate(hd); ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(-4, 0, 20, 8, 0, 0, U.TAU); ctx.fill(); ctx.fillRect(-40, -2.5, 24, 5);
    ctx.save(); ctx.rotate(rot); ctx.fillRect(-36, -2, 72, 4); ctx.rotate(Math.PI / 2); ctx.fillRect(-36, -2, 72, 4); ctx.restore();
    ctx.restore();
    // the chopper
    ctx.translate(ex, ey); ctx.rotate(hd);
    ctx.fillStyle = '#2a2d36'; ctx.fillRect(-14, -11, 24, 2.2); ctx.fillRect(-14, 9, 24, 2.2);
    ctx.fillStyle = '#1b2a52'; roundRect(ctx, -42, -2.5, 28, 5, 2); ctx.fill(); ctx.fillRect(-44, -8, 4, 16);
    ctx.save(); ctx.translate(-42, 0); ctx.rotate(rot * 1.7); ctx.fillStyle = 'rgba(30,32,40,0.8)'; ctx.fillRect(-1, -7, 2, 14); ctx.restore();
    ctx.beginPath(); ctx.ellipse(-4, 0, 20, 8.5, 0, 0, U.TAU); ctx.fillStyle = '#213a78'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(-14, -1.3, 20, 2.6);
    ctx.beginPath(); ctx.ellipse(9, 0, 7, 5.2, 0, 0, U.TAU); ctx.fillStyle = '#9fd8ff'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(10, -1.5, 3, 1.6, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = ((rot * 0.4) | 0) % 2 ? '#ff3b30' : '#ff8a80'; ctx.beginPath(); ctx.arc(-40, 0, 1.6, 0, U.TAU); ctx.fill();
    ctx.save(); ctx.rotate(rot);
    ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.beginPath(); ctx.arc(-4, 0, 38, 0, U.TAU); ctx.fill();
    ctx.fillStyle = 'rgba(40,42,50,0.85)'; roundRect(ctx, -42, -1.6, 76, 3.2, 1.5); ctx.fill(); ctx.rotate(Math.PI / 2); roundRect(ctx, -38, -1.6, 76, 3.2, 1.5); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#44485a'; ctx.beginPath(); ctx.arc(-4, 0, 2.6, 0, U.TAU); ctx.fill();
    ctx.restore();
    if (Rd && Rd.night > 0.05 && !this.leaving && Rd.lights) Rd.lights.push({ x: sx, y: sy, r: 130, glow: 'white' });
  };

  // ------------------------------------------------------------- ped AI ----
  var DIRS4 = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
  var DIRS8 = [];
  for (var di = 0; di < 8; di++) DIRS8.push({ dx: Math.cos(di * Math.PI / 4), dy: Math.sin(di * Math.PI / 4) });

  function newPedAI(role) {
    return {
      kind: role === 'cop' ? 'cop' : 'civ', mode: 'wander', tgt: null, dir: null,
      idleT: 0, stillT: 0, talkT: R.range(3, 18), scanT: R.random() * 0.2,
      fleeT: 0, fleeFrom: null, fleeSide: null, fleeDirT: 0, fleeDir: null,
      repathT: 0, path: null, pi: 0, pathGoal: null,
      arrestT: 0, shootT: R.random(), searchT: 0, lastSeen: null,
      response: false, guard: null, swat: false, target: null
    };
  }

  function walkWeight(tx, ty, dx, dy, dir, onCross) {
    var t = W.tile(tx, ty), m = W.metaAt(tx, ty), w;
    if (t === T.SIDEWALK) w = (m & M.SHOULDER) ? 0 : 1;
    else if (t === T.PLAZA) w = 0.8;
    else if (t === T.GRASS || t === T.SAND) w = 0.45;
    else if (t === T.PARKING) w = 0.3;
    else if (isRoadT(t)) { if (!(m & M.CROSSWALK)) return 0; w = onCross ? 1.2 : 0.3; }
    else return 0;
    if (dir) {
      var dot = dx * dir.dx + dy * dir.dy;
      if (dot > 0.5) w *= 3.5; else if (dot < -0.5) w *= onCross ? 0 : 0.12;
    }
    if (onCross && !isRoadT(t)) w *= 2;
    return w;
  }

  // choose the next tile to walk to; false when stranded
  function pickNextTile(p, ai) {
    var tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (ai.tgt && U.dist2(p.x, p.y, ai.tgt.x, ai.tgt.y) < TILE * TILE * 1.5) { tx = ai.tgt.tx; ty = ai.tgt.ty; }
    var cur = W.tile(tx, ty), curM = W.metaAt(tx, ty);
    var onCross = isRoadT(cur) && (curM & M.CROSSWALK) !== 0;
    var total = 0, cands = [];
    for (var k = 0; k < 4; k++) {
      var d = DIRS4[k], ntx = tx + d.dx, nty = ty + d.dy;
      var wt = walkWeight(ntx, nty, d.dx, d.dy, ai.dir, onCross);
      if (wt <= 0) continue;
      cands.push({ d: d, tx: ntx, ty: nty, wt: wt }); total += wt;
    }
    if (!cands.length) {
      var near = W.nearestTileOf(p.x, p.y, pedSpotPred, 6);
      if (!near || (near.tx === tx && near.ty === ty && !isRoadT(cur))) return false;
      var gx = (near.tx + 0.5) * TILE, gy = (near.ty + 0.5) * TILE, gd = U.dist(p.x, p.y, gx, gy) || 1;
      ai.tgt = { x: gx, y: gy, tx: near.tx, ty: near.ty };
      ai.dir = { dx: (gx - p.x) / gd, dy: (gy - p.y) / gd };
      return true;
    }
    var r = R.random() * total, pick = cands[cands.length - 1];
    for (k = 0; k < cands.length; k++) { r -= cands[k].wt; if (r < 0) { pick = cands[k]; break; } }
    ai.dir = pick.d;
    ai.tgt = { x: (pick.tx + 0.5) * TILE, y: (pick.ty + 0.5) * TILE, tx: pick.tx, ty: pick.ty };
    if (!onCross && !isRoadT(cur) && R.chance(0.035)) ai.idleT = R.range(0.8, 3);
    return true;
  }

  function wanderStep(p, ai, dt) {
    if (ai.idleT > 0) { ai.idleT -= dt; p.setIntent(0, 0, false); return; }
    if (!ai.tgt && !pickNextTile(p, ai)) { p.setIntent(0, 0, false); ai.idleT = 1; return; }
    var dx = ai.tgt.x - p.x, dy = ai.tgt.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
    var along = dx * ai.dir.dx + dy * ai.dir.dy;
    if (along <= 1.5 || d < 2) {
      if (!pickNextTile(p, ai)) { p.setIntent(0, 0, false); ai.idleT = 0.8; return; }
      dx = ai.tgt.x - p.x; dy = ai.tgt.y - p.y; d = Math.sqrt(dx * dx + dy * dy) || 1;
    }
    p.setIntent(dx / d, dy / d, false);
    if (p.moving) ai.stillT = 0;
    else { ai.stillT += dt; if (ai.stillT > 1.5) { ai.stillT = 0; ai.tgt = null; ai.idleT = R.range(0.3, 1); } }
  }

  function startFlee(p, ai, from, time, side) {
    ai.mode = 'flee'; ai.fleeT = time; ai.fleeFrom = from; ai.fleeSide = side || null; ai.fleeDirT = 0; ai.fleeDir = null;
    ai.tgt = null; ai.path = null; ai.idleT = 0;
    p.state = 'flee';
    var pp = player();
    if (!side && pp && AI.barkT <= 0 && R.chance(0.25) && onScreen(p.x, p.y, 0) && U.dist2(p.x, p.y, pp.x, pp.y) < 500 * 500) { AI.bark(p, R.pick(BARKS.panic), '#ffd3d3'); AI.barkT = 0.35; }
  }
  function endFlee(p, ai) {
    ai.mode = 'wander'; ai.fleeFrom = null; ai.fleeSide = null; ai.tgt = null;
    p.state = 'idle'; p.fleeFrom = null; p.fleeTimer = 0;
  }
  function blockedRay(x, y, dx, dy, len) {
    for (var s = 12; s <= len; s += 12) if (W.solidAt(x + dx * s, y + dy * s)) return true;
    return false;
  }
  function fleeStep(p, ai, dt) {
    ai.fleeT -= dt;
    if (ai.fleeT <= 0) { endFlee(p, ai); return; }
    ai.fleeDirT -= dt;
    if (ai.fleeDirT <= 0 || !ai.fleeDir) {
      ai.fleeDirT = 0.25;
      var fx = p.x, fy = p.y, f = ai.fleeFrom;
      if (f) { fx = f.x; fy = f.y; }
      var ax = p.x - fx, ay = p.y - fy, al = Math.sqrt(ax * ax + ay * ay) || 1; ax /= al; ay /= al;
      var best = null, bs = -Infinity;
      for (var k = 0; k < 8; k++) {
        var d = DIRS8[k], s = (ax * d.dx + ay * d.dy) + R.random() * 0.35;
        if (ai.fleeSide) s += (ai.fleeSide.x * d.dx + ai.fleeSide.y * d.dy) * 1.8;
        if (blockedRay(p.x, p.y, d.dx, d.dy, 40)) s -= 3;
        if (s > bs) { bs = s; best = d; }
      }
      ai.fleeDir = best;
    }
    p.setIntent(ai.fleeDir.dx, ai.fleeDir.dy, true);
  }
  var scanScratch = [];
  // cars about to hit the ped, burning cars: dodge or run
  function scanThreats(p, ai) {
    var list = E().hash.query(p.x, p.y, 130, scanScratch);
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (v.kind !== 'vehicle') continue;
      if (v.burning || (v.wreck && v.wreckTimer < 2)) { if (ai.mode !== 'flee') startFlee(p, ai, { x: v.x, y: v.y }, 3, null); return true; }
      var sp = v.speedLen(); if (sp < 70) continue;
      var hx = v.vx / sp, hy = v.vy / sp, rx = p.x - v.x, ry = p.y - v.y;
      var fwd = rx * hx + ry * hy, lat = rx * hy - ry * hx;
      if (fwd > -10 && fwd < 40 + sp * 0.8 && Math.abs(lat) < 30) {
        var sideDot = rx * (-hy) + ry * hx, s = sideDot >= 0 ? 1 : -1;
        startFlee(p, ai, { x: v.x, y: v.y }, 1.1, { x: -hy * s, y: hx * s });
        return true;
      }
    }
    return false;
  }
  function talkStep(p, ai, dt, lines, color) {
    ai.talkT -= dt;
    if (ai.talkT > 0) return;
    ai.talkT = R.range(8, 24);
    var pp = player();
    if (AI.barkT > 0 || !lines || !lines.length || !pp) return;
    if (U.dist2(p.x, p.y, pp.x, pp.y) > K.barkRange * K.barkRange || !onScreen(p.x, p.y, -10)) return;
    var line = (lines === p.lines) ? p.speakLine() : R.pick(lines);
    if (!line) return;
    AI.bark(p, line, color); AI.barkT = 0.45;
    if (R.chance(0.5) && !isRoadT(W.tileAt(p.x, p.y))) ai.idleT = R.range(0.8, 1.6);
  }

  function civBrain(p, ai, dt) {
    if (p.isDown()) { ai.tgt = null; ai.path = null; ai.stillT = 0; return; }
    if (p.state === 'flee' && ai.mode !== 'flee') startFlee(p, ai, p.fleeFrom || null, p.fleeTimer || 5, null);
    ai.scanT -= dt;
    if (ai.scanT <= 0) { ai.scanT = 0.15; scanThreats(p, ai); }
    if (ai.mode === 'flee') { fleeStep(p, ai, dt); return; }
    wanderStep(p, ai, dt);
    talkStep(p, ai, dt, p.lines);
  }

  // ---- paths ---------------------------------------------------------------
  // Pure pursuit along a polyline held in h.path / h.pi. Returns the point to
  // aim at `look` px ahead of the closest point, and end=true past the last.
  function followPathPoint(ent, h, look) {
    var path = h.path, n = path.length;
    if (n === 1) return { x: path[0].x, y: path[0].y, end: U.dist2(ent.x, ent.y, path[0].x, path[0].y) < 400 };
    while (h.pi < n - 1) {
      var a = path[h.pi], b = path[h.pi + 1];
      var abx = b.x - a.x, aby = b.y - a.y, l2 = abx * abx + aby * aby || 1;
      var tt = ((ent.x - a.x) * abx + (ent.y - a.y) * aby) / l2;
      if (tt >= 1) h.pi++; else break;
    }
    if (h.pi >= n - 1) { var last = path[n - 1]; return { x: last.x, y: last.y, end: true }; }
    var a2 = path[h.pi], b2 = path[h.pi + 1];
    var abx2 = b2.x - a2.x, aby2 = b2.y - a2.y, l22 = abx2 * abx2 + aby2 * aby2 || 1;
    var t2 = U.clamp(((ent.x - a2.x) * abx2 + (ent.y - a2.y) * aby2) / l22, 0, 1);
    var cx = a2.x + abx2 * t2, cy = a2.y + aby2 * t2, rem = look, i = h.pi;
    while (rem > 0 && i < n - 1) {
      var q = path[i + 1], dx = q.x - cx, dy = q.y - cy, dl = Math.sqrt(dx * dx + dy * dy);
      if (dl >= rem) return { x: cx + dx / dl * rem, y: cy + dy / dl * rem, end: false };
      rem -= dl; cx = q.x; cy = q.y; i++;
    }
    return { x: path[n - 1].x, y: path[n - 1].y, end: false };
  }
  var pathBudget = 0;
  function requestPath(ax, ay, bx, by, mode, maxExp) {
    if (pathBudget <= 0) return undefined;
    pathBudget--;
    return W.findPath(ax, ay, bx, by, { mode: mode, maxExpansions: maxExp });
  }
  // walk/run a ped toward a goal, straight when the way is clear, else by path
  function moveToward(p, ai, gx, gy, dt, run, direct) {
    var dx = gx - p.x, dy = gy - p.y, d = Math.sqrt(dx * dx + dy * dy);
    if (direct && walkClear(p.x, p.y, gx, gy)) {
      ai.path = null;
      if (d > 14) p.setIntent(dx / d, dy / d, run); else p.setIntent(0, 0, false);
      return;
    }
    ai.repathT -= dt;
    var stale = !ai.path || ai.repathT <= 0 || (ai.pathGoal && U.dist2(ai.pathGoal.x, ai.pathGoal.y, gx, gy) > 150 * 150);
    if (stale) {
      var np = requestPath(p.x, p.y, gx, gy, 'ped', 3000);
      if (np !== undefined) { ai.path = np; ai.pi = 0; ai.repathT = 1.2; ai.pathGoal = { x: gx, y: gy }; }
    }
    if (ai.path && ai.path.length) {
      var pt = followPathPoint(p, ai, 28);
      var tx = pt.end ? gx : pt.x, ty = pt.end ? gy : pt.y;
      var ex = tx - p.x, ey = ty - p.y, el = Math.sqrt(ex * ex + ey * ey);
      if (el > 10) p.setIntent(ex / el, ey / el, run); else p.setIntent(0, 0, false);
    } else {
      if (d > 14) p.setIntent(dx / d, dy / d, run); else p.setIntent(0, 0, false);
    }
  }

  // ---- cops ------------------------------------------------------------------
  function playerTouch(cop, pp) {
    if (pp.vehicle) return pp.vehicle.edgeDistance(cop.x, cop.y) <= cop.radius + 5;
    return U.dist(cop.x, cop.y, pp.x, pp.y) <= cop.radius + pp.radius + 4;
  }
  function canShoot() { var CB = GTP.Combat; return !!(CB && CB.fire && CB.WEAPONS && CB.WEAPONS.pistol); }
  function copFire(cop, pp) {
    var CB = GTP.Combat;
    var wpn = (cop.ai.swat && CB.WEAPONS.shotgun) ? 'shotgun' : 'pistol';
    cop.weapon = wpn; cop.weapons = cop.weapons || {}; cop.weapons[wpn] = Infinity;
    var a = U.angleTo(cop.x, cop.y, pp.x, pp.y) + (R.random() - 0.5) * 0.14;
    cop.angle = a;
    try { return CB.fire(cop, wpn, a) !== false; } catch (e) { U.reportError(e, 'ai.copFire'); return false; }
  }
  function bust(cop) {
    var g = game(); if (!g || g.state !== 'playing') return;
    if (AI.barkT <= 0) { AI.bark(cop, R.pick(BARKS.copArrest), '#9fd8ff'); AI.barkT = 0.5; }
    toast('BUSTED');
    AI.onBusted();
    var CB = GTP.Combat;
    if (CB && CB.onPlayerBusted) { try { CB.onPlayerBusted(); } catch (e) { U.reportError(e, 'combat.onPlayerBusted'); } }
    if (g.state === 'playing') g.setState('busted');
  }
  function copBrain(p, ai, dt) {
    if (p.isDown()) { ai.arrestT = 0; return; }
    if (p.state === 'flee' && ai.mode !== 'flee') startFlee(p, ai, p.fleeFrom || null, p.fleeTimer || 5, null);
    if (ai.mode === 'flee') { fleeStep(p, ai, dt); return; }
    var pp = player(), g = game();
    var hunting = wanted.level > 0 && pp && pp.alive && g && g.state === 'playing';
    if (!hunting) {
      if (ai.mode === 'chase' || ai.mode === 'search') { ai.mode = 'wander'; ai.tgt = null; ai.path = null; ai.arrestT = 0; ai.lastSeen = null; }
      if (ai.guard) { standGuard(p, ai); return; }
      ai.scanT -= dt;
      if (ai.scanT <= 0) { ai.scanT = 0.15; scanThreats(p, ai); }
      if (ai.mode === 'flee') { fleeStep(p, ai, dt); return; }
      wanderStep(p, ai, dt);
      talkStep(p, ai, dt, p.lines, '#9fd8ff');
      return;
    }
    var d = U.dist(p.x, p.y, pp.x, pp.y);
    var sees = d < K.pedSight && losClear(p.x, p.y, pp.x, pp.y);
    if (sees) { police.seen = true; ai.lastSeen = { x: pp.x, y: pp.y }; ai.searchT = 0; }
    var engage = ai.mode === 'chase' || ai.mode === 'search' || sees || d < 220 || (ai.response && !ai.guard) || (ai.guard && d < 340);
    if (!engage) {
      if (ai.guard) { standGuard(p, ai); return; }
      ai.scanT -= dt;
      if (ai.scanT <= 0) { ai.scanT = 0.15; scanThreats(p, ai); }
      if (ai.mode === 'flee') { fleeStep(p, ai, dt); return; }
      wanderStep(p, ai, dt);
      return;
    }
    var goal;
    if (sees) { ai.mode = 'chase'; goal = pp; }
    else if (ai.lastSeen) {
      ai.mode = 'search'; goal = ai.lastSeen;
      if (U.dist2(p.x, p.y, goal.x, goal.y) < 32 * 32) {
        ai.searchT += dt;
        if (ai.searchT > 5) { ai.lastSeen = null; ai.mode = 'wander'; ai.tgt = null; ai.searchT = 0; return; }
        wanderStep(p, ai, dt);
        return;
      }
    } else { ai.mode = 'chase'; goal = pp; } // dispatched: the radio told them where
    var inFastCar = pp.vehicle && pp.vehicle.speedLen() > 150;
    var touching = playerTouch(p, pp);
    var slow = pp.vehicle ? pp.vehicle.speedLen() < 20 : true;
    if (touching && slow) {
      ai.arrestT += dt;
      p.setIntent(0, 0, false); p.faceTo(pp.x, pp.y);
      if (ai.arrestT >= K.arrestSeconds) { bust(p); ai.arrestT = 0; }
      return;
    }
    ai.arrestT = Math.max(0, ai.arrestT - dt * 2);
    moveToward(p, ai, goal.x, goal.y, dt, !(inFastCar && d > 300), sees);
    ai.shootT -= dt;
    if (wanted.level >= 2 && sees && d > 48 && d < K.shootRange && ai.shootT <= 0 && canShoot()) {
      ai.shootT = K.shootCooldown + R.random() * 0.5;
      copFire(p, pp);
    }
    ai.talkT -= dt;
    if (ai.talkT <= 0) {
      ai.talkT = R.range(5, 12);
      if (sees && d < 420 && AI.barkT <= 0 && onScreen(p.x, p.y, -10)) { AI.bark(p, R.pick(BARKS.copChase), '#9fd8ff'); AI.barkT = 0.45; }
    }
  }
  function standGuard(p, ai) {
    var g = ai.guard, dx = g.x - p.x, dy = g.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 10) p.setIntent(dx / d, dy / d, false); else { p.setIntent(0, 0, false); if (g.face != null) p.angle = U.angleLerp(p.angle, g.face, 0.2); }
  }

  // ---- hostile (mission thugs): chase and punch the target, flee when hurt ----
  function hostileBrain(p, ai, dt) {
    if (p.isDown()) return;
    if (ai.mode === 'flee') { fleeStep(p, ai, dt); return; }
    var tgt = ai.target || player();
    if (!tgt || !tgt.alive) { wanderStep(p, ai, dt); return; }
    if (p.hp < p.maxHp * 0.25 && !ai.brave) { startFlee(p, ai, tgt, 5, null); return; }
    var d = U.dist(p.x, p.y, tgt.x, tgt.y);
    if (d > 760) { p.state = 'idle'; wanderStep(p, ai, dt); return; }
    p.state = 'chase';
    var reach = p.radius + tgt.radius + 6;
    if (d <= reach + 2) {
      p.setIntent(0, 0, false); p.faceTo(tgt.x, tgt.y); p.state = 'attack';
      ai.shootT -= dt;
      if (ai.shootT <= 0) {
        ai.shootT = 0.7 + R.random() * 0.3;
        var CB = GTP.Combat, done = false;
        if (CB && CB.fire && CB.WEAPONS && CB.WEAPONS.fist) { try { done = CB.fire(p, 'fist', p.angle) !== false; } catch (e) { U.reportError(e, 'ai.hostileFire'); } }
        if (!done && CB && CB.damage && !tgt.godMode) CB.damage(tgt, 4, p, 'fist');
        fxAdd({ type: 'puff', x: tgt.x, y: tgt.y, r0: 2, r1: 7, color: '#f0d0b0', life: 0.25 });
      }
      return;
    }
    moveToward(p, ai, tgt.x, tgt.y, dt, true, walkClear(p.x, p.y, tgt.x, tgt.y));
  }

  function pedBrain(p, dt) {
    var ai = p.ai;
    if (!p.alive) return;
    try {
      if (ai.kind === 'cop') copBrain(p, ai, dt);
      else if (ai.kind === 'hostile') hostileBrain(p, ai, dt);
      else civBrain(p, ai, dt);
    } catch (e) { U.reportError(e, 'ai.ped'); }
  }

  // --------------------------------------------------------- traffic AI ----
  function newTrafficAI(v, axis, dir, lane) {
    return {
      kind: 'traffic', mode: 'cruise', axis: axis, dir: dir, lane: lane,
      cruise: R.range(0.85, 1.1), plan: null, blockedT: 0, honkT: R.random(), waiting: false, detour: null,
      phase: 0, phaseT: 0, steerSign: 1, look: v.cls.w > 50 ? 54 : K.lookAhead, path: null, pi: 0, pathT: 0, pathGoal: null,
      pursue: false, response: false, stopT: 0, busT: 0, fareT: 0, ignorePedT: 0, recover: null, recoverT: 0, deployed: false, deco: null
    };
  }
  function cruiseFor(v, tx, ty) {
    var cls = W.roadClass(tx, ty), base = K.cruise[cls] || K.cruise.street;
    if (v.type === 'bus') base *= 0.8; else if (v.type === 'truck') base *= 0.85; else if (v.type === 'sports') base *= 1.12;
    return Math.min(base, v.cls.maxSpeed * 0.85);
  }
  function steerTo(v, x, y) {
    var a = Math.atan2(y - v.y, x - v.x), diff = U.wrapAngle(a - v.angle);
    v.controls.steer = U.clamp(diff * 2.4, -1, 1);
    return diff;
  }
  function applySpeed(v, speedT) {
    var sp = v.speed, th;
    if (speedT <= 1) th = sp > 4 ? -1 : 0;
    else if (sp < speedT) th = U.clamp((speedT - sp) / 30, 0.15, 1);
    else th = -U.clamp((sp - speedT) / 60, 0, 1);
    v.controls.throttle = th; v.controls.handbrake = false;
  }
  function stopSpeed(dd, cls) { return dd <= 4 ? 0 : Math.sqrt(2 * cls.brake * 0.5 * (dd - 4)); }
  // nearest lane on this road running in `dir` (px center coordinate), or null
  function findLane(tx, ty, axis, dir, perpPx) {
    var lb = laneByte(tx, ty, axis); if (!lb) return null;
    var l = lb >> 4, wid = lb & 15, lo = (axis === 'h' ? ty : tx) - l, best = null, bd = Infinity;
    for (var r = lo; r < lo + wid; r++) {
      var b = axis === 'h' ? laneByte(tx, r, 'h') : laneByte(r, ty, 'v');
      if (!b || laneDir(b, axis) !== dir) continue;
      var c = (r + 0.5) * TILE, d = Math.abs(c - perpPx);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function adoptLane(v, ai) {
    var tx = Math.floor(v.x / TILE), ty = Math.floor(v.y / TILE);
    var hb = laneByte(tx, ty, 'h'), vb = laneByte(tx, ty, 'v');
    var ca = Math.cos(v.angle), sa = Math.sin(v.angle), axis;
    if (hb && vb) axis = Math.abs(ca) >= Math.abs(sa) ? 'h' : 'v'; else axis = hb ? 'h' : (vb ? 'v' : null);
    if (!axis) return false;
    var dir = axis === 'h' ? (ca >= 0 ? 1 : -1) : (sa >= 0 ? 1 : -1);
    var lane = findLane(tx, ty, axis, dir, axis === 'h' ? v.y : v.x);
    if (lane == null) { dir = -dir; lane = findLane(tx, ty, axis, dir, axis === 'h' ? v.y : v.x); }
    if (lane == null) return false;
    ai.axis = axis; ai.dir = dir; ai.lane = lane; ai.plan = null; ai.recover = null;
    return true;
  }
  function lightGreen(jx, jy, axis) {
    var ph = ((simT() / K.lightCycle) + U.hash2(jx, jy, 77)) % 1;
    return axis === 'h' ? ph < K.lightGreen : (ph >= 0.5 && ph < 0.5 + K.lightGreen);
  }
  var ahScratch = [];
  // The nearest obstacle in the lane ahead: {gap, kind, ent, speed} or null.
  function avoidAhead(v, forPursuit) {
    var cls = v.cls, w = cls.w, hh = cls.h / 2, ai = v.ai;
    var ca = Math.cos(v.angle), sa = Math.sin(v.angle);
    var sp = Math.max(0, v.speed);
    var L = w / 2 + 26 + sp * 0.6; if (L > 240) L = 240;
    var list = E().hash.query(v.x + ca * L * 0.5, v.y + sa * L * 0.5, L * 0.5 + 44, ahScratch);
    var best = null, i, j, rx, ry, fwd, lat, gap;
    for (i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === v) continue;
      if (o.kind === 'vehicle') {
        if (forPursuit && o.hasPlayer()) continue;
        var s = o._spine, cb = Math.cos(o.angle), sb = Math.sin(o.angle);
        for (j = 0; j < s.length; j++) {
          var ox = o.x + s[j].x * cb, oy = o.y + s[j].x * sb, r = s[j].r;
          rx = ox - v.x; ry = oy - v.y; fwd = rx * ca + ry * sa; lat = -rx * sa + ry * ca;
          if (fwd <= 0 || fwd - r > L) continue;
          if (Math.abs(lat) > hh + r + 3) continue;
          gap = fwd - r - w / 2;
          if (!best || gap < best.gap) best = { gap: gap, kind: 'vehicle', ent: o, speed: o.vx * ca + o.vy * sa };
        }
      } else if ((o.kind === 'ped' || o.kind === 'player') && !o.inVehicle && o.alive && o.state !== 'dead') {
        if (ai && ai.ignorePedT > 0) continue;
        if (forPursuit && o.kind === 'player') continue;
        rx = o.x - v.x; ry = o.y - v.y; fwd = rx * ca + ry * sa; lat = -rx * sa + ry * ca;
        if (fwd <= 0 || fwd - o.radius > L * 0.85) continue;
        if (Math.abs(lat) > hh + o.radius + 6) continue;
        gap = fwd - o.radius - w / 2;
        if (!best || gap < best.gap) best = { gap: gap, kind: 'ped', ent: o, speed: o.vx * ca + o.vy * sa };
      }
    }
    return best;
  }
  var ctScratch = [];
  // moving traffic on the cross road about to enter the junction
  function crossTrafficNear(v, ai, plan) {
    var cx = plan.cx, cy = plan.cy;
    var list = E().hash.query(cx, cy, 190, ctScratch);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === v || o.kind !== 'vehicle' || o.wreck) continue;
      var sp = o.speedLen(); if (sp < 35) continue;
      var alongMine = ai.axis === 'h' ? Math.abs(o.vx) : Math.abs(o.vy), alongCross = ai.axis === 'h' ? Math.abs(o.vy) : Math.abs(o.vx);
      if (alongCross < alongMine) continue;
      var dx = cx - o.x, dy = cy - o.y;
      if (dx * o.vx + dy * o.vy <= 0) continue; // moving away
      if (dx * dx + dy * dy < 190 * 190) return true;
    }
    return false;
  }
  // oncoming traffic on this road that a left turn would cut across
  function oncomingNear(v, ai) {
    var d = dirVec(ai.axis, ai.dir);
    var list = E().hash.query(v.x + d.dx * 110, v.y + d.dy * 110, 130, ctScratch);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === v || o.kind !== 'vehicle' || o.wreck) continue;
      var along = o.vx * d.dx + o.vy * d.dy;
      if (along > -40) continue;
      var rel = (o.x - v.x) * d.dx + (o.y - v.y) * d.dy;
      if (rel > 0 && rel < 230) return true;
    }
    return false;
  }
  function makeDeadEndPlan(v, ai, ax, ay) {
    var edge = ai.axis === 'h' ? ax * TILE + (ai.dir > 0 ? 0 : TILE) : ay * TILE + (ai.dir > 0 ? 0 : TILE);
    return { kind: 'deadend', stopCoord: edge - ai.dir * (v.cls.w / 2 + 10), committed: false, waitT: 0 };
  }
  function makeJunctionPlan(v, ai, ex, ey, lo, wid) {
    var axis = ai.axis, dir = ai.dir, oax = other(axis);
    var cross = [], j;
    for (j = 0; j < 8; j++) {
      var cx = axis === 'h' ? ex + dir * j : ex, cy = axis === 'h' ? ey : ey + dir * j;
      var bb = laneByte(cx, cy, oax);
      if (!bb || !isRoadT(W.tile(cx, cy))) break;
      cross.push({ tx: cx, ty: cy, coord: axis === 'h' ? (cx + 0.5) * TILE : (cy + 0.5) * TILE, dirB: laneDir(bb, oax) });
    }
    var n = cross.length;
    if (!n) return makeDeadEndPlan(v, ai, ex, ey);
    var last = cross[n - 1];
    var entryCoord = axis === 'h' ? ex * TILE + (dir > 0 ? 0 : TILE) : ey * TILE + (dir > 0 ? 0 : TILE);
    var exitCoord = axis === 'h' ? last.tx * TILE + (dir > 0 ? TILE : 0) : last.ty * TILE + (dir > 0 ? TILE : 0);
    var jx = axis === 'h' ? Math.min(cross[0].tx, last.tx) : lo, jy = axis === 'h' ? lo : Math.min(cross[0].ty, last.ty);
    var jw = axis === 'h' ? n : wid, jh = axis === 'h' ? wid : n;
    var opts = [];
    var bx = axis === 'h' ? last.tx + dir : last.tx, by = axis === 'h' ? last.ty : last.ty + dir;
    var sb = laneByte(bx, by, axis);
    var highway = (W.metaAt(Math.floor(v.x / TILE), Math.floor(v.y / TILE)) & M.HIGHWAY) !== 0;
    if (isRoadT(W.tile(bx, by)) && sb && laneDir(sb, axis) === dir) opts.push({ kind: 'straight', w: highway ? 5 : 2.4 });
    var rightDir = axis === 'h' ? dir : -dir;
    var turns = [['right', rightDir, 1], ['left', -rightDir, 0.8]];
    for (var k = 0; k < 2; k++) {
      var e = turns[k][1], lane = null;
      for (j = 0; j < n; j++) if (cross[j].dirB === e) { lane = cross[j]; break; }
      if (!lane) continue;
      var px = axis === 'h' ? lane.tx : (e > 0 ? lo + wid : lo - 1), py = axis === 'h' ? (e > 0 ? lo + wid : lo - 1) : lane.ty;
      var eb = laneByte(px, py, oax);
      if (!isRoadT(W.tile(px, py)) || !eb || laneDir(eb, oax) !== e) continue;
      opts.push({ kind: turns[k][0], w: turns[k][2], e: e, lane: lane });
    }
    if (!opts.length) return makeDeadEndPlan(v, ai, ex, ey);
    var total = 0; for (k = 0; k < opts.length; k++) total += opts[k].w;
    var r = R.random() * total, choice = opts[opts.length - 1];
    for (k = 0; k < opts.length; k++) { r -= opts[k].w; if (r < 0) { choice = opts[k]; break; } }
    var hasStraight = opts[0].kind === 'straight';
    var plan = {
      kind: choice.kind, entryCoord: entryCoord, exitCoord: exitCoord, jx: jx, jy: jy,
      cx: (jx + jw / 2) * TILE, cy: (jy + jh / 2) * TILE,
      committed: false, waitT: 0, stopCoord: entryCoord - dir * (v.cls.w / 2 + 6), e: choice.e || 0,
      path: null, pi: 0, exitLane: null, lit: hasStraight
    };
    if (choice.kind !== 'straight') {
      var e2 = choice.e, L = ai.lane;
      var P0 = axis === 'h' ? { x: entryCoord, y: L } : { x: L, y: entryCoord };
      var P1 = axis === 'h' ? { x: choice.lane.coord, y: L } : { x: L, y: choice.lane.coord };
      var myEdge = e2 > 0 ? (lo + wid) * TILE : lo * TILE, exitPerp = myEdge + e2 * (TILE * 0.5 + 24);
      var P2 = axis === 'h' ? { x: choice.lane.coord, y: exitPerp } : { x: exitPerp, y: choice.lane.coord };
      plan.path = [P0, P1, P2]; plan.exitLane = choice.lane.coord; plan.exitPerp = exitPerp;
    }
    return plan;
  }
  // a straight pass through the junction the car already sits in
  function makeStraightPlan(v, ai, tx, ty) {
    var axis = ai.axis, dir = ai.dir, oax = other(axis), lx = tx, ly = ty;
    for (var j = 0; j < 8; j++) {
      var nx = axis === 'h' ? tx + dir * (j + 1) : tx, ny = axis === 'h' ? ty : ty + dir * (j + 1);
      if (!laneByte(nx, ny, oax) || !isRoadT(W.tile(nx, ny))) break;
      lx = nx; ly = ny;
    }
    var exitCoord = axis === 'h' ? lx * TILE + (dir > 0 ? TILE : 0) : ly * TILE + (dir > 0 ? TILE : 0);
    return { kind: 'straight', committed: true, exitCoord: exitCoord, stopCoord: -1e9 * dir, waitT: 0, lit: false, e: 0 };
  }
  function scanAhead(v, ai, tx, ty, lb) {
    var axis = ai.axis, dir = ai.dir, oax = other(axis);
    var l = lb >> 4, wid = lb & 15;
    var lo = (axis === 'h' ? ty : tx) - l;
    var lanePerp = Math.floor(ai.lane / TILE);
    var ahead = Math.ceil((v.cls.w / 2 + 48 + Math.abs(v.speed) * 0.35) / TILE) + 1;
    for (var k = 1; k <= ahead; k++) {
      var ax = axis === 'h' ? tx + dir * k : lanePerp, ay = axis === 'h' ? lanePerp : ty + dir * k;
      var tt = W.tile(ax, ay);
      if (!isRoadT(tt)) { ai.plan = makeDeadEndPlan(v, ai, ax, ay); return; }
      var la = laneByte(ax, ay, axis), lbb = laneByte(ax, ay, oax);
      if (lbb) { ai.plan = makeJunctionPlan(v, ai, ax, ay, lo, wid); return; }
      if (!la || laneDir(la, axis) !== dir) { ai.plan = makeDeadEndPlan(v, ai, ax, ay); return; }
    }
  }
  function tryDetour(v, ai) {
    var tx = Math.floor(v.x / TILE), ty = Math.floor(v.y / TILE);
    var lb = laneByte(tx, ty, ai.axis); if (!lb) return null;
    var l = lb >> 4, wid = lb & 15, lo = (ai.axis === 'h' ? ty : tx) - l, best = null, bd = Infinity, oncoming = null;
    for (var r = lo; r < lo + wid; r++) {
      var c = (r + 0.5) * TILE; if (Math.abs(c - ai.lane) < 1) continue;
      var b = ai.axis === 'h' ? laneByte(tx, r, 'h') : laneByte(r, ty, 'v');
      if (!b) continue;
      var d = Math.abs(c - ai.lane);
      if (laneDir(b, ai.axis) === ai.dir) { if (d < bd) { bd = d; best = c; } }
      else if (oncoming == null || d < Math.abs(oncoming - ai.lane)) oncoming = c;
    }
    if (best == null && oncoming != null && !oncomingNear(v, ai)) best = oncoming;
    return best == null ? null : { lane: best, t: 5 };
  }
  function bailOut(v) {
    var occ = v.occupants();
    for (var i = 0; i < occ.length; i++) {
      var o = occ[i]; if (o.kind === 'player') continue;
      v.exit(o);
      if (o.ai) startFlee(o, o.ai, { x: v.x, y: v.y }, 4, null);
    }
    v.ai.bailed = true; v.controls.throttle = 0; v.controls.steer = 0;
  }
  function unstickStep(v, ai, dt) {
    ai.phaseT -= dt;
    v.controls.throttle = -1; v.controls.steer = ai.steerSign * 0.8; v.controls.handbrake = false;
    if (ai.phaseT <= 0) { ai.mode = 'cruise'; ai.plan = null; v.controls.throttle = 0; v.controls.steer = 0; }
  }
  // three-point turn at a dead end (wide roads skip the reverse phase)
  function uturnStep(v, ai, dt) {
    var tgt = Math.atan2(ai.axis === 'h' ? 0 : -ai.dir, ai.axis === 'h' ? -ai.dir : 0);
    ai.phaseT += dt;
    if (ai.phase === 0) {
      v.controls.steer = 0; applySpeed(v, 0);
      if (Math.abs(v.speed) < 6) { ai.phase = 1; ai.phaseT = 0; }
    } else if (ai.phase === 1) {
      v.controls.throttle = -1; v.controls.steer = 1;
      if (ai.phaseT > ai.reverseFor || Math.abs(U.angleDiff(v.angle, tgt)) < 0.4) { ai.phase = 2; ai.phaseT = 0; }
    } else {
      v.controls.throttle = 0.45; v.controls.steer = -1;
      if (Math.abs(U.angleDiff(v.angle, tgt)) < 0.3 || ai.phaseT > 4) {
        ai.dir = -ai.dir; ai.mode = 'cruise'; ai.plan = null;
        var tx = Math.floor(v.x / TILE), ty = Math.floor(v.y / TILE);
        var lane = findLane(tx, ty, ai.axis, ai.dir, ai.axis === 'h' ? v.y : v.x);
        if (lane != null) ai.lane = lane; else if (!adoptLane(v, ai)) { ai.recover = null; ai.recoverT = 0; }
      }
    }
  }
  function recoverStep(v, ai, dt) {
    ai.recoverT -= dt;
    if (!ai.recover || ai.recoverT <= 0) { ai.recover = W.nearestRoadPoint(v.x, v.y); ai.recoverT = 1; }
    if (!ai.recover) { applySpeed(v, 0); v.controls.steer = 0; return; }
    var diff = steerTo(v, ai.recover.x, ai.recover.y);
    if (Math.abs(diff) > 2.3) { v.controls.throttle = -0.7; v.controls.steer = -v.controls.steer; }
    else applySpeed(v, 60 * (1 - 0.6 * Math.min(1, Math.abs(diff))));
  }
  function trafficStep(v, ai, dt) {
    var cls = v.cls, w = cls.w;
    if (ai.mode === 'unstick') { unstickStep(v, ai, dt); return; }
    if (ai.mode === 'uturn') { uturnStep(v, ai, dt); return; }
    var tx = Math.floor(v.x / TILE), ty = Math.floor(v.y / TILE), t = W.tile(tx, ty);
    if (!isRoadT(t)) { ai.plan = null; recoverStep(v, ai, dt); return; }
    if (ai.recover) { if (!adoptLane(v, ai)) { recoverStep(v, ai, dt); return; } }
    var axis = ai.axis, dir = ai.dir;
    var lb = laneByte(tx, ty, axis);
    if (!lb) {
      var ob = laneByte(tx, ty, other(axis));
      if (ob) { ai.axis = axis = other(axis); ai.dir = dir = laneDir(ob, axis); ai.lane = laneCoord(tx, ty, axis); ai.plan = null; ai.detour = null; lb = ob; }
      else { recoverStep(v, ai, dt); return; }
    }
    // the lane we hold must run our way (a collision can shove the car over)
    var laneTile = axis === 'h' ? laneByte(tx, Math.floor(ai.lane / TILE), 'h') : laneByte(Math.floor(ai.lane / TILE), ty, 'v');
    if (!laneTile || laneDir(laneTile, axis) !== dir) {
      var nl = findLane(tx, ty, axis, dir, axis === 'h' ? v.y : v.x);
      if (nl != null) ai.lane = nl; else if (!adoptLane(v, ai)) { recoverStep(v, ai, dt); return; }
      axis = ai.axis; dir = ai.dir;
    }
    if (ai.mode === 'drive') { driveStep(v, ai, dt); return; }
    if (laneByte(tx, ty, other(axis)) && !ai.plan) ai.plan = makeStraightPlan(v, ai, tx, ty);
    if (!ai.plan) scanAhead(v, ai, tx, ty, lb);

    var speedT = cruiseFor(v, tx, ty) * ai.cruise, target = null, plan = ai.plan;
    var myCoord = axis === 'h' ? v.x : v.y;
    ai.waiting = false;
    if (plan) {
      var distStop = (plan.stopCoord - myCoord) * dir;
      if (plan.kind === 'deadend') {
        speedT = Math.min(speedT, stopSpeed(distStop, cls));
        if (distStop < 14 && Math.abs(v.speed) < 8) {
          if (!onScreen(v.x, v.y, 140)) { removeEntity(v); return; }
          ai.mode = 'uturn'; ai.phase = 0; ai.phaseT = 0; ai.reverseFor = (lb & 15) >= 4 ? 0 : 0.75; ai.plan = null;
          return;
        }
      } else {
        if (!plan.committed) {
          if (distStop < -4) plan.committed = true;
          else {
            var allowed = true;
            if (plan.lit && !lightGreen(plan.jx, plan.jy, axis)) allowed = false;
            else if (!plan.lit || plan.kind !== 'straight') { if (crossTrafficNear(v, ai, plan)) allowed = false; }
            if (allowed && plan.kind === 'left' && oncomingNear(v, ai)) allowed = false;
            if (!allowed) { plan.waitT += dt; if (plan.waitT > (plan.lit ? 16 : 7)) allowed = true; }
            if (!allowed) { speedT = Math.min(speedT, stopSpeed(distStop, cls)); ai.waiting = speedT < 6; }
            else if (distStop < 34) plan.committed = true;
          }
          if (plan.kind !== 'straight') speedT = Math.min(speedT, Math.max(K.turnSpeed, Math.sqrt(K.turnSpeed * K.turnSpeed + 2 * cls.brake * 0.5 * Math.max(0, distStop))));
        }
        if (plan.committed && plan.kind !== 'straight') {
          var pt = followPathPoint(v, plan, ai.look);
          target = pt;
          speedT = Math.min(speedT, K.turnSpeed * (w > 50 ? 0.8 : 1));
          var perp = axis === 'h' ? v.y : v.x;
          if (pt.end || (perp - plan.exitPerp) * plan.e >= -4) {
            ai.axis = other(axis); ai.dir = plan.e; ai.lane = plan.exitLane; ai.plan = null; ai.detour = null;
            axis = ai.axis; dir = ai.dir; target = null;
          }
        } else if (plan.committed && plan.kind === 'straight') {
          if ((myCoord - plan.exitCoord) * dir > w / 2) ai.plan = null;
        }
      }
    }
    if (ai.detour) { ai.detour.t -= dt; if (ai.detour.t <= 0) ai.detour = null; }
    if (!target) {
      var look = Math.max(ai.look, Math.abs(v.speed) * 0.4);
      var laneT = ai.detour ? ai.detour.lane : ai.lane;
      target = axis === 'h' ? { x: v.x + dir * look, y: laneT } : { x: laneT, y: v.y + dir * look };
    }
    var diff = steerTo(v, target.x, target.y);
    speedT *= 1 - 0.6 * Math.min(1, Math.abs(diff));
    // flavour: buses stop at stops, taxis drop fares
    if (ai.busT > 0) { ai.busT -= dt; if (ai.busT <= 0 && !ai.plan && ai.stopT <= 0) { ai.stopT = 2.5; ai.busT = R.range(14, 28); } }
    if (ai.fareT > 0) {
      ai.fareT -= dt;
      if (ai.fareT <= 0 && !ai.plan && ai.stopT <= 0 && v.passengers.length && onScreen(v.x, v.y, 100)) { ai.stopT = 2.4; ai.fareDrop = true; ai.fareT = R.range(20, 40); }
      else if (ai.fareT <= 0) ai.fareT = 6;
    }
    if (ai.stopT > 0) {
      ai.stopT -= dt; speedT = 0; ai.waiting = true;
      if (ai.fareDrop && ai.stopT < 1.4 && Math.abs(v.speed) < 3) {
        ai.fareDrop = false;
        var fares = v.passengers.slice();
        for (var fi = 0; fi < fares.length; fi++) { var fp = fares[fi]; if (fp.kind === 'player') continue; v.exit(fp); if (fp.ai) { fp.ai.tgt = null; fp.ai.idleT = 0.6; } if (AI.barkT <= 0) { AI.bark(fp, 'Keep the change.'); AI.barkT = 0.4; } }
      }
    }
    var plannedSpeed = speedT;
    if (ai.ignorePedT > 0) { ai.ignorePedT -= dt; speedT = Math.min(speedT, 35); }
    var obst = avoidAhead(v, false);
    if (obst) {
      if (obst.kind === 'vehicle') {
        speedT = Math.min(speedT, Math.max(0, obst.speed) + Math.max(0, obst.gap - 16) * 2.2);
        if (obst.ent.ai && obst.ent.ai.waiting && obst.gap < 70) ai.waiting = true;
      } else speedT = Math.min(speedT, Math.max(0, obst.gap - 12) * 2.5);
    }
    applySpeed(v, speedT);
    // blocked: honk, then reverse out of it or despawn when nobody is watching
    var wants = plannedSpeed > 25 && !ai.waiting;
    if (wants && Math.abs(v.speed) < 8) ai.blockedT += dt; else ai.blockedT = Math.max(0, ai.blockedT - dt * 1.5);
    ai.honkT -= dt;
    if (ai.blockedT > K.honkSeconds && ai.honkT <= 0) {
      v.honk(); ai.honkT = R.range(2, 4);
      if (onScreen(v.x, v.y, 0) && AI.barkT <= 0 && R.chance(0.6)) { AI.bark(v, R.pick(BARKS.honk), '#ffd400'); AI.barkT = 0.3; }
    }
    if (ai.blockedT > K.stuckSeconds) {
      ai.blockedT = 0;
      if (!onScreen(v.x, v.y, 120)) { removeEntity(v); return; }
      if (obst && obst.kind === 'ped') ai.ignorePedT = 2.5;
      else { ai.mode = 'unstick'; ai.phaseT = R.range(0.6, 1.0); ai.steerSign = R.sign(); ai.detour = tryDetour(v, ai); ai.plan = null; }
    }
  }
  // AI.driveTo: follow an explicit path (missions), then fall back to traffic
  function driveStep(v, ai, dt) {
    if (!ai.path || !ai.path.length) { ai.mode = 'cruise'; adoptLane(v, ai); return; }
    var pt = followPathPoint(v, ai, ai.look + 8);
    var diff = steerTo(v, pt.x, pt.y);
    var speedT = (ai.driveSpeed || 170) * (1 - 0.7 * Math.min(1, Math.abs(diff)));
    if (pt.end) { ai.mode = 'cruise'; ai.path = null; adoptLane(v, ai); if (ai.onArrive) { var cb = ai.onArrive; ai.onArrive = null; try { cb(v); } catch (e) { U.reportError(e, 'ai.driveTo'); } } }
    var obst = avoidAhead(v, false);
    if (obst) speedT = Math.min(speedT, obst.kind === 'vehicle' ? Math.max(0, obst.speed) + Math.max(0, obst.gap - 16) * 2.2 : Math.max(0, obst.gap - 12) * 2.5);
    applySpeed(v, speedT);
    void dt;
  }
  // cruisers and SWAT vans in pursuit; false when they should drive as traffic
  function pursuitStep(v, ai, dt) {
    var pp = player(), g = game();
    var hunting = wanted.level > 0 && pp && pp.alive && g && g.state === 'playing';
    if (!hunting) {
      if (ai.pursue) { ai.pursue = false; v.siren = false; ai.path = null; ai.plan = null; adoptLane(v, ai); }
      return false;
    }
    var d = U.dist(v.x, v.y, pp.x, pp.y);
    if (!ai.pursue) {
      if (ai.response || (d < K.copRange && (d < 300 || losClear(v.x, v.y, pp.x, pp.y)))) { ai.pursue = true; v.siren = true; sfx('siren', { x: v.x, y: v.y }); }
      else return false;
    }
    if (d < K.carSight && losClear(v.x, v.y, pp.x, pp.y)) police.seen = true;
    if (ai.mode === 'unstick') { unstickStep(v, ai, dt); if (ai.mode !== 'unstick') ai.mode = 'pursue'; return true; }
    var tgtX = pp.x + pp.vx * 0.35, tgtY = pp.y + pp.vy * 0.35;
    var direct = d < 340 && driveClear(v.x, v.y, pp.x, pp.y);
    var speedT, target, pSpeed = pp.vehicle ? pp.vehicle.speedLen() : 0;
    if (direct) {
      target = { x: tgtX, y: tgtY }; ai.path = null;
      if (pp.vehicle) {
        var boxIn = pSpeed < 30 && d < 110;
        speedT = boxIn ? 0 : v.cls.maxSpeed * 0.95;
        if (boxIn && v.speedLen() < 50) deploy(v, ai, true);
      } else {
        speedT = d > 95 ? 180 : 0;
        if (d <= 95 && v.speedLen() < 50) deploy(v, ai, false);
      }
    } else {
      ai.pathT -= dt;
      var rp = null;
      if (!ai.path || ai.pathT <= 0 || (ai.pathGoal && U.dist2(ai.pathGoal.x, ai.pathGoal.y, pp.x, pp.y) > 300 * 300)) {
        rp = W.nearestRoadPoint(pp.x, pp.y);
        if (rp) { var np = requestPath(v.x, v.y, rp.x, rp.y, 'car', 6000); if (np !== undefined) { ai.path = np; ai.pi = 0; ai.pathT = 2; ai.pathGoal = { x: pp.x, y: pp.y }; } }
      }
      if (ai.path && ai.path.length) {
        var pt = followPathPoint(v, ai, 46);
        target = pt.end ? { x: tgtX, y: tgtY } : pt;
        speedT = v.cls.maxSpeed * 0.8;
      } else { target = { x: tgtX, y: tgtY }; speedT = 140; }
    }
    var diff = steerTo(v, target.x, target.y);
    speedT *= 1 - 0.75 * Math.min(1, Math.abs(diff) / 1.2);
    var obst = avoidAhead(v, true);
    if (obst) {
      if (obst.kind === 'vehicle' && obst.gap < 70 && v.speed > 220) speedT = Math.min(speedT, 200);
      if (obst.kind === 'vehicle' && obst.gap < 20 && Math.abs(obst.speed) < 10) speedT = Math.min(speedT, 60);
    }
    applySpeed(v, speedT);
    if (speedT > 30 && Math.abs(v.speed) < 8) ai.blockedT += dt; else ai.blockedT = Math.max(0, ai.blockedT - dt * 1.5);
    if (ai.blockedT > 2.5) {
      ai.blockedT = 0;
      if (d < 150 && !ai.deployed) deploy(v, ai, !!pp.vehicle);
      else { ai.mode = 'unstick'; ai.phaseT = R.range(0.6, 1.0); ai.steerSign = R.sign(); }
    }
    return true;
  }
  // the crew gets out to chase on foot; the car stays with its lights on
  function deploy(v, ai, keepDriver) {
    if (ai.deployed) return;
    ai.deployed = true;
    var occ = v.occupants();
    for (var i = 0; i < occ.length; i++) {
      var o = occ[i];
      if (o.kind === 'player') continue;
      if (keepDriver && o === v.driver && occ.length > 1) continue;
      v.exit(o);
      if (o.ai) { o.ai.mode = 'chase'; o.ai.response = true; o.ai.kind = 'cop'; }
    }
    if (!v.driver) { ai.pursue = false; ai.mode = 'parked'; v.controls.throttle = 0; v.controls.steer = 0; }
    else ai.deployed = false; // the driver stays in the chase and can deploy again later
  }
  function vehicleBrain(v, dt) {
    var ai = v.ai;
    if (ai.kind === 'parked' || ai.kind === 'block' || v.wreck) return;
    if (v.burning) { if (!ai.bailed) bailOut(v); return; }
    var drv = v.driver;
    if (!drv || !drv.alive || drv.kind === 'player') { ai.waiting = false; return; }
    try {
      if ((ai.kind === 'cruiser' || ai.kind === 'swat') && pursuitStep(v, ai, dt)) return;
      trafficStep(v, ai, dt);
    } catch (e) { U.reportError(e, 'ai.vehicle'); }
  }

  // -------------------------------------------------------------- spawner --
  var FALLBACK_ROLES = { civ: 0.86, protester: 0.05, thug: 0.05, npc: 0.04 };
  var FALLBACK_TYPES = ['sedan', 'sedan', 'taxi', 'suv', 'van', 'sports', 'truck', 'bus', 'bike'];
  var PARKED_TYPES = ['sedan', 'sedan', 'suv', 'van', 'sports', 'taxi'];
  function pickRole(d) {
    var CW = GTP.Content && GTP.Content.world, tbl = CW && CW.spawn && CW.spawn.peds && CW.spawn.peds.rolesByDistrict;
    var w = (tbl && d && tbl[d.id]) || FALLBACK_ROLES;
    return weightedPick(w) || 'civ';
  }
  function pickVehicleType(d) {
    var CW = GTP.Content && GTP.Content.world, tbl = CW && CW.spawn && CW.spawn.vehicles && CW.spawn.vehicles.byDistrict;
    var list = (tbl && d && tbl[d.id] && tbl[d.id].length) ? tbl[d.id] : FALLBACK_TYPES;
    var t = R.pick(list);
    return C.VEHICLES[t] ? t : 'sedan';
  }
  function swatLook() {
    var base = GTP.Ped.randomLook('cop');
    base.shirt = '#1a1c24'; base.pants = '#101218'; base.hat = '#15161a'; base.hatStyle = 'cop'; base.badge = '#8fb6ff'; base.glasses = '#111'; base.hairStyle = 'buzz';
    return base;
  }
  var spawner = {
    warm: false, cullT: 0, parkT: 0,
    counts: { peds: 0, vehicles: 0, parked: 0 },
    warmup: function () {
      AI.reset();
      var opts = (GTP.game && GTP.game.opts) || {};
      AI.enabled = !(opts.ai === '0' || opts.ai === 'false' || opts.ai === 0 || opts.ai === false);
      if (!AI.enabled || !player()) { spawner.warm = true; return; }
      view.valid = false; // the camera is not placed yet: spawn all around, including on screen
      var tries = 0, c = spawner.counts;
      while (c.peds < K.pedBudget && tries++ < 500) if (spawner.spawnPedNear(true)) c.peds++;
      tries = 0;
      while (c.vehicles < K.vehicleBudget && tries++ < 400) if (spawner.spawnVehicleNear(true)) c.vehicles++;
      tries = 0;
      while (c.parked < K.parkedBudget && tries++ < 120) if (spawner.spawnParkedNear(true)) c.parked++;
      spawner.warm = true;
    },
    update: function (dt) {
      if (!AI.enabled) return;
      spawner.cullT -= dt;
      if (spawner.cullT <= 0) { spawner.cullT = 0.5; spawner.cull(); }
      var c = spawner.counts;
      for (var i = 0; i < K.spawnPerStep && c.peds < K.pedBudget; i++) { if (spawner.spawnPedNear(false)) c.peds++; else break; }
      if (c.vehicles < K.vehicleBudget && spawner.spawnVehicleNear(false)) c.vehicles++;
      spawner.parkT -= dt;
      if (spawner.parkT <= 0) { spawner.parkT = 0.5; if (c.parked < K.parkedBudget && spawner.spawnParkedNear(false)) c.parked++; }
    },
    cull: function () {
      var p = player(), list = E().list, far = K.cullDist * K.cullDist;
      for (var i = list.length - 1; i >= 0; i--) {
        var e = list[i];
        if (!e.ai || e.persistent || e.kind === 'player' || e.inVehicle) continue;
        if (e.kind === 'vehicle' && e.hasPlayer()) continue;
        if (U.dist2(e.x, e.y, p.x, p.y) > far && !onScreen(e.x, e.y, 160)) removeEntity(e);
      }
    },
    spawnPedNear: function (warm) {
      var p = player(); if (!p) return false;
      var pt = samplePoint(p, K.pedRadius, warm, pedSpotPred, 3, 8);
      if (!pt) return false;
      if (E().near(pt.x, pt.y, 22, 'ped').length) return false;
      var role = pickRole(W.districtAt(pt.x, pt.y));
      return !!spawner.makePed(pt.x, pt.y, role);
    },
    makePed: function (x, y, role, opts) {
      opts = opts || {};
      var ped = new GTP.Ped({ x: x, y: y, role: role, look: opts.look || null });
      ped.lines = opts.lines || barksFor(role);
      ped.ai = newPedAI(role);
      if (role === 'cop') { ped.hp = ped.maxHp = 80; }
      if (opts.swat) { ped.ai.swat = true; ped.hp = ped.maxHp = 120; ped.speedMul = 1.1; }
      ped.angle = R.random() * U.TAU;
      E().add(ped);
      return ped;
    },
    spawnVehicleNear: function (warm) {
      var p = player(); if (!p) return false;
      for (var tries = 0; tries < 8; tries++) {
        var a = R.random() * U.TAU, r = R.range(K.vehicleRadius[0], K.vehicleRadius[1]);
        var x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (x < TILE || y < TILE || x > (W.w - 1) * TILE || y > (W.h - 1) * TILE) continue;
        var rp = W.nearestRoadPoint(x, y); if (!rp) continue;
        var tx = Math.floor(rp.x / TILE), ty = Math.floor(rp.y / TILE);
        if (W.isIntersection(tx, ty) || (W.metaAt(tx, ty) & M.CROSSWALK)) continue;
        if (!warm && onScreen(rp.x, rp.y, 90)) continue;
        if (U.dist2(rp.x, rp.y, p.x, p.y) < K.vehicleRadius[0] * K.vehicleRadius[0] * 0.6) continue;
        if (!E().vehicleSpaceFree(rp.x, rp.y, 80)) continue;
        var type = pickVehicleType(W.districtAt(rp.x, rp.y));
        if (spawner.makeTraffic(rp.x, rp.y, type)) return true;
      }
      return false;
    },
    // a driven vehicle in the lane at (x, y); null when no lane is there
    makeTraffic: function (x, y, type, opts) {
      opts = opts || {};
      var lc = W.laneCenter(x, y, opts.axis); if (!lc) return null;
      var axis = lc.dy === 0 ? 'h' : 'v', dir = axis === 'h' ? lc.dx : lc.dy;
      var v = new GTP.Vehicle({ x: lc.x, y: lc.y, type: type, angle: Math.atan2(lc.dy, lc.dx), color: opts.color || null });
      if (opts.police) { v.isPolice = true; v.siren = !!opts.siren; }
      var En = E();
      En.add(v);
      var role = (type === 'cop' || opts.police) ? 'cop' : 'civ';
      var drv = spawner.makePed(lc.x, lc.y, role, { swat: !!opts.swat, look: opts.swat ? swatLook() : null });
      drv.ai.driver = true;
      v.enter(drv);
      v.ai = newTrafficAI(v, axis, dir, axis === 'h' ? lc.y : lc.x);
      if (type === 'cop') v.ai.kind = 'cruiser';
      var nPass = opts.passengers || 0;
      if (type === 'taxi' && R.chance(0.35)) { nPass = 1; v.ai.fareT = R.range(6, 18); }
      if (type === 'bus') { nPass = R.int(1, 4); v.ai.busT = R.range(8, 20); }
      for (var i = 0; i < nPass && v.seatsFree() > 0; i++) {
        var pax = spawner.makePed(lc.x, lc.y, role, { swat: !!opts.swat, look: opts.swat ? swatLook() : null });
        v.enter(pax, true);
      }
      var sp = (opts.police ? v.cls.maxSpeed * 0.6 : cruiseFor(v, Math.floor(lc.x / TILE), Math.floor(lc.y / TILE)) * 0.8);
      v.vx = Math.cos(v.angle) * sp; v.vy = Math.sin(v.angle) * sp; v.speed = sp;
      v._syncOccupants(0);
      return v;
    },
    spawnParkedNear: function (warm) {
      var p = player(), lots = W.lots; if (!p || !lots.length) return false;
      for (var tries = 0; tries < 6; tries++) {
        var lot = R.pick(lots);
        var lx = lot.x + lot.w / 2, ly = lot.y + lot.h / 2, d2 = U.dist2(lx, ly, p.x, p.y);
        if (d2 < 300 * 300 || d2 > 1300 * 1300) continue;
        if (lot.w < 60) continue;
        var rows = lot.h >= 96 ? 2 : 1, row = rows === 2 ? R.int(0, 1) : 0;
        var nStalls = Math.floor((lot.w - 12) / 36); if (nStalls < 1) continue;
        var k = R.int(0, nStalls - 1);
        var x = lot.x + 6 + k * 36 + 18, y = row === 0 ? lot.y + 26 : lot.y + lot.h - 26, angle = row === 0 ? -Math.PI / 2 : Math.PI / 2;
        var ok = true;
        for (var cy = -22; cy <= 22 && ok; cy += 22) for (var cx = -11; cx <= 11; cx += 22) {
          var tt = W.tileAt(x + cx, y + cy); if (tt !== T.PARKING) { ok = false; break; }
        }
        if (!ok) continue;
        if (!warm && onScreen(x, y, 80)) continue;
        if (!E().vehicleSpaceFree(x, y, 26)) continue;
        var v = new GTP.Vehicle({ x: x, y: y, type: R.pick(PARKED_TYPES), angle: angle });
        v.ai = { kind: 'parked', response: false };
        E().add(v);
        return true;
      }
      return false;
    }
  };

  // ------------------------------------------------------------- wanted ----
  var wanted = {
    level: 0, heat: 0, losTimer: 0, maxHeat: 40, lastReason: null, flash: 0,
    levelFor: function (h) { var th = C.WANTED.thresholds, l = 0; for (var i = 0; i < th.length; i++) if (h >= th[i]) l = i + 1; return l; },
    add: function (amount, reason) {
      if (!(amount > 0)) return;
      wanted.heat = Math.min(wanted.maxHeat, wanted.heat + amount);
      wanted.losTimer = 0; wanted.lastReason = reason || null;
      wanted.sync();
    },
    onCrime: function (type, x, y) {
      var H = C.WANTED.heat, amt = 0;
      switch (type) {
        case 'shoot': case 'gunshot': case 'fire': amt = police.copSees(x, y, 300) ? H.shootNearCop : 0; AI.alert(x, y, 280, 'gunfire'); break;
        case 'shootNearCop': amt = H.shootNearCop; AI.alert(x, y, 280, 'gunfire'); break;
        case 'stealOccupied': amt = H.stealOccupied + (police.copSees(x, y, 420) ? H.stealSeen : 0); break;
        case 'hitPed': amt = H.hitPed; AI.alert(x, y, 150, 'violence'); break;
        case 'killPed': amt = H.killPed; AI.alert(x, y, 220, 'violence'); break;
        case 'destroyVehicle': amt = H.destroyVehicle; AI.alert(x, y, 260, 'explosion'); break;
        case 'attackCop': amt = H.attackCop; break;
        default: amt = H[type] || 0;
      }
      if (amt > 0) wanted.add(amt, type);
    },
    decay: function (dt) {
      if (wanted.heat > 0 && wanted.losTimer >= C.WANTED.decayDelay) wanted.heat = Math.max(0, wanted.heat - C.WANTED.decayRate * dt);
    },
    update: function (dt) {
      if (police.seen) wanted.losTimer = 0; else wanted.losTimer += dt;
      wanted.decay(dt);
      if (wanted.flash > 0) wanted.flash -= dt;
      wanted.sync();
    },
    sync: function () {
      var l = wanted.levelFor(wanted.heat), p = player();
      if (l !== wanted.level) { var up = l > wanted.level; wanted.level = l; wanted.onLevelChange(l, up); }
      if (p) { p.wanted = l; p.wantedHeat = wanted.heat; }
    },
    onLevelChange: function (l, up) {
      if (up) { wanted.flash = 1; police.spawnT = 0; toast('WANTED ' + new Array(l + 1).join('*')); }
      else if (l === 0) toast('The heat is off');
    },
    clear: function () { wanted.heat = 0; wanted.losTimer = 0; wanted.sync(); }
  };

  // ------------------------------------------------------------- police ----
  function policeResponse(level) {
    level = U.clamp(level | 0, 0, 5);
    var B = K.pedBudgetResponse;
    var r = { level: level, foot: B.foot[level], cruisers: B.cruisers[level], roadblocks: level >= 3, swat: B.swat[level], heli: level >= 5, shoot: level >= 2, units: [] };
    if (r.foot) r.units.push('foot cops x' + r.foot);
    if (r.cruisers) r.units.push('cruisers x' + r.cruisers);
    if (r.roadblocks) r.units.push('roadblocks');
    if (r.swat) r.units.push('swat vans x' + r.swat);
    if (r.heli) r.units.push('helicopter');
    return r;
  }
  var police = {
    units: [], blocks: [], heli: null, active: false, seen: false, spawnT: 0, blockT: 4, swatT: 2,
    copSees: function (x, y, range) {
      var list = AI.lists.cops;
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (U.dist2(c.x, c.y, x, y) < range * range && losClear(c.x, c.y, x, y)) return true;
      }
      return false;
    },
    update: function (dt) {
      var p = player(), lvl = wanted.level, resp = policeResponse(lvl);
      var units = police.units, i, u;
      for (i = units.length - 1; i >= 0; i--) {
        u = units[i].e;
        var dead = !u._inList || (u.kind === 'ped' ? !u.alive : u.wreck);
        if (!dead && u.kind !== 'ped' && !u.driver) dead = true; // crew got out: the car is just scenery now
        if (!dead && U.dist2(u.x, u.y, p.x, p.y) > 1300 * 1300 && !onScreen(u.x, u.y, 160)) { removeEntity(u); dead = true; }
        if (dead) units.splice(i, 1);
      }
      for (i = police.blocks.length - 1; i >= 0; i--) {
        var b = police.blocks[i]; b.t += dt;
        var bd = U.dist2(b.x, b.y, p.x, p.y);
        if ((b.t > 35 && !onScreen(b.x, b.y, 200)) || bd > 1500 * 1500) { police.removeBlock(b); police.blocks.splice(i, 1); }
      }
      if (police.heli && !police.heli._inList) police.heli = null;
      if (!AI.enabled) return;
      if (lvl <= 0) { if (police.active) police.standDown(); return; }
      police.active = true;
      var foot = 0, cruisers = 0, swat = 0;
      for (i = 0; i < units.length; i++) { var ty = units[i].type; if (ty === 'foot') foot++; else if (ty === 'cruiser') cruisers++; else if (ty === 'swat') swat++; }
      police.spawnT -= dt;
      if (police.spawnT <= 0) {
        police.spawnT = 0.5;
        if (foot < resp.foot) { if (police.spawnFoot(lvl)) police.spawnT = 0.45; }
        else if (cruisers < resp.cruisers) { if (police.spawnCruiser(lvl)) police.spawnT = 0.7; }
      }
      if (resp.roadblocks) {
        police.blockT -= dt;
        if (police.blockT <= 0) {
          if (p.vehicle && p.vehicle.speedLen() > 90 && police.blocks.length < 1) police.blockT = police.spawnRoadblock() ? 14 : 2;
          else police.blockT = 1;
        }
      }
      if (resp.swat > 0) {
        police.swatT -= dt;
        if (police.swatT <= 0 && swat < resp.swat) police.swatT = police.spawnSwat() ? 9 : 2;
      }
      if (resp.heli && !police.heli) {
        var a = R.random() * U.TAU;
        police.heli = new Heli({ x: p.x + Math.cos(a) * 900, y: p.y + Math.sin(a) * 900 });
        E().add(police.heli);
      } else if (!resp.heli && police.heli && !police.heli.leaving) police.heli.leave();
      if (police.heli && !police.heli.leaving && U.dist2(police.heli.spot.x, police.heli.spot.y, p.x, p.y) < 170 * 170) police.seen = true;
    },
    standDown: function () {
      police.active = false;
      var units = police.units;
      for (var i = 0; i < units.length; i++) {
        var e = units[i].e;
        if (!e._inList) continue;
        if (e.kind === 'ped') { e.ai.response = false; e.ai.mode = 'wander'; e.ai.tgt = null; e.ai.path = null; e.ai.arrestT = 0; e.ai.guard = null; }
        else { e.siren = false; if (e.ai) { e.ai.response = false; e.ai.pursue = false; if (e.ai.kind === 'swat') e.ai.kind = 'traffic'; if (e.ai.mode === 'pursue') e.ai.mode = 'cruise'; adoptLane(e, e.ai); } }
      }
      units.length = 0;
      if (police.heli && !police.heli.leaving) police.heli.leave();
      for (i = 0; i < police.blocks.length; i++) police.blocks[i].t = Math.max(police.blocks[i].t, 30);
    },
    clear: function () {
      var units = police.units;
      for (var i = 0; i < units.length; i++) if (units[i].e._inList) removeEntity(units[i].e);
      units.length = 0;
      for (i = 0; i < police.blocks.length; i++) police.removeBlock(police.blocks[i]);
      police.blocks.length = 0;
      if (police.heli) { removeEntity(police.heli); police.heli = null; }
      // ambient cops go back to walking the beat
      var cops = AI.lists.cops;
      for (i = 0; i < cops.length; i++) { var c = cops[i]; if (c.ai) { c.ai.mode = 'wander'; c.ai.tgt = null; c.ai.path = null; c.ai.arrestT = 0; c.ai.lastSeen = null; } }
      police.active = false; police.spawnT = 0.5; police.blockT = 4; police.swatT = 2;
    },
    spawnFoot: function (lvl) {
      var p = player();
      var pt = samplePoint(p, [380, 650], false, pedSpotPred, 3, 10) || samplePoint(p, [420, 700], true, pedSpotPred, 3, 6);
      if (!pt) return false;
      var cop = spawner.makePed(pt.x, pt.y, 'cop');
      cop.ai.response = true; cop.ai.mode = 'chase'; cop.speedMul = 1.05;
      if (lvl >= 2) { cop.weapons = { pistol: Infinity }; cop.weapon = 'pistol'; }
      police.units.push({ e: cop, type: 'foot' });
      return true;
    },
    roadPointNear: function (p, radii, ignoreScreen) {
      for (var tries = 0; tries < 10; tries++) {
        var a = R.random() * U.TAU, r = R.range(radii[0], radii[1]);
        var x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (x < TILE || y < TILE || x > (W.w - 1) * TILE || y > (W.h - 1) * TILE) continue;
        var rp = W.nearestRoadPoint(x, y); if (!rp) continue;
        var tx = Math.floor(rp.x / TILE), ty = Math.floor(rp.y / TILE);
        if (W.isIntersection(tx, ty)) continue;
        if (!ignoreScreen && onScreen(rp.x, rp.y, 90)) continue;
        if (!E().vehicleSpaceFree(rp.x, rp.y, 80)) continue;
        return rp;
      }
      return null;
    },
    spawnCruiser: function (lvl) {
      var p = player();
      var rp = police.roadPointNear(p, [600, 1000], false) || police.roadPointNear(p, [700, 1100], true);
      if (!rp) return false;
      var v = spawner.makeTraffic(rp.x, rp.y, 'cop', { police: true, siren: true, passengers: lvl >= 3 ? 1 : 0 });
      if (!v) return false;
      v.ai.kind = 'cruiser'; v.ai.response = true; v.ai.pursue = true; v.ai.mode = 'pursue';
      var occ = v.occupants();
      for (var i = 0; i < occ.length; i++) { occ[i].ai.response = true; if (lvl >= 2) { occ[i].weapons = { pistol: Infinity }; occ[i].weapon = 'pistol'; } }
      police.units.push({ e: v, type: 'cruiser' });
      return true;
    },
    spawnSwat: function () {
      var p = player();
      var rp = police.roadPointNear(p, [700, 1000], false) || police.roadPointNear(p, [800, 1100], true);
      if (!rp) return false;
      var v = spawner.makeTraffic(rp.x, rp.y, 'van', { police: true, siren: true, passengers: 2, swat: true, color: '#15161a' });
      if (!v) return false;
      v.ai.kind = 'swat'; v.ai.response = true; v.ai.pursue = true; v.ai.mode = 'pursue';
      var occ = v.occupants();
      for (var i = 0; i < occ.length; i++) { occ[i].ai.response = true; occ[i].weapons = { pistol: Infinity }; occ[i].weapon = 'pistol'; }
      police.units.push({ e: v, type: 'swat' });
      return true;
    },
    // a plain stretch of the player's road, ahead and off screen
    findRoadAhead: function (p, minDist, maxDist) {
      var v = p.vehicle; if (!v) return null;
      var sp = v.speedLen(); if (sp < 1) return null;
      var hx = v.vx / sp, hy = v.vy / sp;
      var axis = Math.abs(hx) > Math.abs(hy) ? 'h' : 'v', dir = axis === 'h' ? (hx > 0 ? 1 : -1) : (hy > 0 ? 1 : -1);
      var tx = Math.floor(v.x / TILE), ty = Math.floor(v.y / TILE), lb = laneByte(tx, ty, axis);
      if (!lb) return null;
      var l = lb >> 4, wid = lb & 15, lo = (axis === 'h' ? ty : tx) - l;
      for (var k = 1; k <= 50; k++) {
        var cx = axis === 'h' ? tx + dir * k : tx, cy = axis === 'h' ? ty : ty + dir * k;
        if (!isRoadT(W.tile(cx, cy)) || !laneByte(cx, cy, axis)) break;
        var dist = k * TILE;
        if (dist > maxDist) break;
        if (dist < minDist) continue;
        var ok = true;
        for (var s = -2; s <= 2; s++) {
          var sx = axis === 'h' ? cx + s : cx, sy = axis === 'h' ? cy : cy + s;
          if (!isRoadT(W.tile(sx, sy)) || laneByte(sx, sy, other(axis)) || !laneByte(sx, sy, axis) || (W.metaAt(sx, sy) & M.CROSSWALK)) { ok = false; break; }
        }
        if (!ok) continue;
        var px = axis === 'h' ? (cx + 0.5) * TILE : (lo + wid / 2) * TILE, py = axis === 'h' ? (lo + wid / 2) * TILE : (cy + 0.5) * TILE;
        if (onScreen(px, py, 60)) continue;
        return { x: px, y: py, axis: axis, dir: dir, lo: lo, wid: wid };
      }
      return null;
    },
    spawnRoadblock: function () {
      var p = player();
      var spot = police.findRoadAhead(p, 1050, 1550);
      if (!spot) return false;
      var axis = spot.axis, dir = spot.dir, lo = spot.lo, wid = spot.wid;
      var perp0 = lo * TILE, n = wid >= 4 ? 3 : 2, cars = [], cops = [], cones = [], i;
      var perps = wid >= 4 ? [23, 64, 105] : [23, 41], alongs = wid >= 4 ? [0, 58, 0] : [0, 58];
      var along0 = axis === 'h' ? spot.x : spot.y;
      function pt(along, perp) { return axis === 'h' ? { x: along, y: perp } : { x: perp, y: along }; }
      for (i = 0; i < n; i++) {
        var pos = pt(along0 + dir * alongs[i], perp0 + perps[i]);
        if (!E().vehicleSpaceFree(pos.x, pos.y, 24)) continue;
        var ang = axis === 'h' ? (i % 2 ? -Math.PI / 2 : Math.PI / 2) : (i % 2 ? Math.PI : 0);
        var v = new GTP.Vehicle({ x: pos.x, y: pos.y, type: 'cop', angle: ang });
        v.siren = true; v.ai = { kind: 'block', response: true, waiting: true };
        E().add(v); cars.push(v);
      }
      if (!cars.length) return false;
      var nCops = wid >= 4 ? 3 : 2;
      for (i = 0; i < nCops; i++) {
        var cp = pt(along0 + dir * 96, perp0 + (i + 0.5) * (wid * TILE / nCops));
        var cop = spawner.makePed(cp.x, cp.y, 'cop');
        cop.ai.response = true; cop.ai.guard = { x: cp.x, y: cp.y, face: Math.atan2(axis === 'h' ? 0 : -dir, axis === 'h' ? -dir : 0) };
        cop.weapons = { pistol: Infinity }; cop.weapon = 'pistol';
        cops.push(cop); police.units.push({ e: cop, type: 'guard' });
      }
      var nCones = wid >= 4 ? 6 : 3;
      for (i = 0; i < nCones; i++) cones.push(pt(along0 - dir * 44, perp0 + (i + 0.5) * (wid * TILE / nCones)));
      var deco = new Deco({ x: spot.x, y: spot.y, axis: axis, cones: cones });
      E().add(deco);
      police.blocks.push({ x: spot.x, y: spot.y, cars: cars, cops: cops, deco: deco, t: 0 });
      return true;
    },
    removeBlock: function (b) {
      var i;
      for (i = 0; i < b.cars.length; i++) if (b.cars[i]._inList && !b.cars[i].hasPlayer() && !onScreen(b.cars[i].x, b.cars[i].y, 100)) removeEntity(b.cars[i]);
      for (i = 0; i < b.cops.length; i++) if (b.cops[i]._inList) { if (!onScreen(b.cops[i].x, b.cops[i].y, 100)) removeEntity(b.cops[i]); else { b.cops[i].ai.guard = null; b.cops[i].ai.response = false; } }
      if (b.deco._inList) removeEntity(b.deco);
    }
  };

  // --------------------------------------------------------------- spray ---
  var garages = null;
  function sprayCheck(dt) {
    AI.sprayT -= dt;
    if (AI.sprayT > 0) return;
    var p = player();
    if (!p.vehicle || wanted.level <= 0) return;
    if (!garages) garages = W.landmarks.filter(function (l) { return l.kind === 'garage' && l.lot; });
    for (var i = 0; i < garages.length; i++) {
      var g = garages[i], lx = g.lot.x * TILE, ly = g.lot.y * TILE;
      if (!U.pointInRect(p.x, p.y, lx, ly, g.lot.w * TILE, g.lot.h * TILE)) continue;
      if (p.vehicle.speedLen() > 15) continue;
      var cost = C.WANTED.sprayCost;
      if (p.money >= cost) {
        p.money -= cost;
        wanted.clear(); police.standDown();
        var v = p.vehicle, cols = v.cls.colors;
        if (cols.length > 1) { var nc = R.pick(cols); if (nc === v.color) nc = cols[(cols.indexOf(nc) + 1) % cols.length]; v.color = nc; }
        if (!v.burning) { v.hp = v.maxHp; v.damage = 0; }
        fxAdd({ type: 'text', x: v.x, y: v.y - 20, text: 'RESPRAYED -' + U.fmtMoney(cost), color: '#2ee6ff' });
        fxAdd({ type: 'puff', x: v.x, y: v.y, r0: 10, r1: 40, color: nc || '#ffffff', life: 0.7 });
        toast('Resprayed. The heat is off (-' + U.fmtMoney(cost) + ')');
        sfx('cash', { x: v.x, y: v.y });
        AI.sprayT = 6;
      } else { toast('Respray costs ' + U.fmtMoney(cost)); AI.sprayT = 6; }
      return;
    }
  }

  // ------------------------------------------------------------------ AI ----
  var AI = GTP.AI = {
    enabled: true,
    t: 0, barkT: 0, sprayT: 0,
    lists: { peds: [], vehicles: [], projectiles: [], cops: [] },
    K: K,
    wanted: wanted,
    police: police,
    spawner: spawner,
    policeResponse: policeResponse,
    reset: function () {
      AI.t = 0; AI.barkT = 0; AI.sprayT = 0;
      wanted.heat = 0; wanted.level = 0; wanted.losTimer = 0; wanted.flash = 0;
      police.units = []; police.blocks = []; police.heli = null; police.active = false; police.seen = false; police.spawnT = 0; police.blockT = 4; police.swatT = 2;
      spawner.warm = false; spawner.cullT = 0; spawner.parkT = 0;
      spawner.counts.peds = spawner.counts.vehicles = spawner.counts.parked = 0;
      garages = null;
      var p = player(); if (p) { p.wanted = 0; p.wantedHeat = 0; }
    },
    update: function (dt) {
      var g = game(), p = player(); if (!g || !p) return;
      AI.t += dt; AI.barkT -= dt; pathBudget = 3;
      refreshView();
      var L = AI.lists, cnt = spawner.counts, list = E().list, i, e;
      L.peds.length = 0; L.vehicles.length = 0; L.projectiles.length = 0; L.cops.length = 0;
      cnt.peds = 0; cnt.vehicles = 0; cnt.parked = 0;
      police.seen = false;
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (e.kind === 'ped') {
          if (!e.alive) continue;
          if (e.role === 'cop' && !e.inVehicle) L.cops.push(e);
          if (!e.ai) continue;
          if (!e.inVehicle) { L.peds.push(e); if (!e.ai.response && !e.persistent) cnt.peds++; }
        } else if (e.kind === 'vehicle') {
          if (!e.ai) continue;
          L.vehicles.push(e);
          if (e.wreck || e.persistent) continue;
          if (e.ai.kind === 'parked') cnt.parked++;
          else if (!e.ai.response && e.ai.kind !== 'block') cnt.vehicles++;
        } else if (e.kind === 'projectile') L.projectiles.push(e);
      }
      for (i = 0; i < L.projectiles.length; i++) { e = L.projectiles[i]; if (e.age < dt * 1.5) AI.alert(e.x, e.y, 240, 'gunfire'); }
      for (i = 0; i < L.peds.length; i++) { e = L.peds[i]; if (e._inList) pedBrain(e, dt); }
      for (i = 0; i < L.vehicles.length; i++) { e = L.vehicles[i]; if (e._inList) vehicleBrain(e, dt); }
      try { police.update(dt); } catch (err) { U.reportError(err, 'ai.police'); }
      wanted.update(dt);
      try { spawner.update(dt); } catch (err2) { U.reportError(err2, 'ai.spawner'); }
      sprayCheck(dt);
    },
    // panic peds within r of (x, y)
    alert: function (x, y, r, kind) {
      var list = E().near(x, y, r, 'ped');
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (!p.ai || p.inVehicle || !p.alive || p.isDown()) continue;
        if (p.ai.kind === 'cop' || p.ai.kind === 'hostile') continue;
        if (p.role === 'thug' && kind !== 'explosion' && R.chance(0.5)) continue;
        if (p.ai.mode === 'flee' && p.ai.fleeT > 1.5) continue;
        startFlee(p, p.ai, { x: x, y: y }, R.range(3, 6), null);
      }
    },
    bark: function (owner, text, color) {
      if (!owner || !owner._inList) return null;
      var b = new Bark(owner, text, color);
      E().add(b);
      return b;
    },
    // give an existing entity a brain: {brain:'civ'|'cop'|'hostile', target, lines, pursue, driver}
    attach: function (e, opts) {
      opts = opts || {};
      if (e.kind === 'ped') {
        e.ai = newPedAI(e.role);
        if (opts.brain) e.ai.kind = opts.brain;
        if (opts.target) e.ai.target = opts.target;
        if (opts.brave) e.ai.brave = true;
        if (!e.lines) e.lines = opts.lines || barksFor(e.role);
        return e.ai;
      }
      if (e.kind === 'vehicle') {
        var lc = W.laneCenter(e.x, e.y);
        var axis = lc ? (lc.dy === 0 ? 'h' : 'v') : 'h', dir = lc ? (axis === 'h' ? lc.dx : lc.dy) : 1;
        e.ai = newTrafficAI(e, axis, dir, lc ? (axis === 'h' ? lc.y : lc.x) : e.y);
        if (!lc) e.ai.recover = null;
        if (e.isPolice) e.ai.kind = 'cruiser';
        if (opts.pursue) { e.ai.kind = 'cruiser'; e.ai.pursue = true; e.ai.response = true; e.siren = true; }
        if (!e.driver && opts.driver !== false) {
          var drv = spawner.makePed(e.x, e.y, e.isPolice ? 'cop' : 'civ');
          drv.ai.driver = true; e.enter(drv);
        }
        return e.ai;
      }
      return null;
    },
    driveTo: function (v, path, opts) {
      if (!v.ai) AI.attach(v, {});
      opts = opts || {};
      v.ai.path = (path && path.length) ? path.slice() : null; v.ai.pi = 0;
      v.ai.mode = v.ai.path ? 'drive' : 'cruise'; v.ai.plan = null;
      v.ai.driveSpeed = opts.speed || 170; v.ai.onArrive = opts.onArrive || null;
      return !!v.ai.path;
    },
    followLane: function (v, dt) { if (!v.ai) AI.attach(v, {}); trafficStep(v, v.ai, dt || C.STEP); },
    avoidAhead: function (v) { return avoidAhead(v, false); },
    losClear: losClear,
    onBusted: function () { wanted.clear(); police.clear(); },
    onRespawn: function () { wanted.clear(); police.clear(); AI.barkT = 0; },
    debug: {
      spawnPed: function (x, y, role) { return spawner.makePed(x, y, role || 'civ'); },
      spawnCop: function (x, y, opts) {
        opts = opts || {};
        var cop = spawner.makePed(x, y, 'cop');
        cop.ai.response = opts.response !== false; cop.ai.mode = 'chase';
        if (opts.armed) { cop.weapons = { pistol: Infinity }; cop.weapon = 'pistol'; }
        police.units.push({ e: cop, type: 'foot' });
        return cop;
      },
      spawnTraffic: function (x, y, type) { return spawner.makeTraffic(x, y, type || 'sedan'); },
      spawnCruiser: function (x, y) {
        var v = spawner.makeTraffic(x, y, 'cop', { police: true, siren: true });
        if (v) { v.ai.kind = 'cruiser'; v.ai.response = true; v.ai.pursue = true; police.units.push({ e: v, type: 'cruiser' }); }
        return v;
      },
      spawnRoadblock: function () { return police.spawnRoadblock(); },
      spawnHeli: function () { if (!police.heli) { var p = player(); police.heli = new Heli({ x: p.x + 400, y: p.y - 300 }); E().add(police.heli); } return police.heli; },
      counts: function () { return { peds: spawner.counts.peds, vehicles: spawner.counts.vehicles, parked: spawner.counts.parked, units: police.units.length, blocks: police.blocks.length, heli: !!police.heli }; },
      lightGreen: lightGreen
    }
  };
  void DIRS8;
})();
