/* Grand Theft Pundit: 05_entities.js
 * GTP.Entity base + Ped, Player, Vehicle, Projectile, Pickup and GTP.Entities
 * (the entity list + spatial hash).
 *
 * Physics (see ARCHITECTURE.md):
 * - Peds move from an `intent` {x,y,run} (set by the player controller or the
 *   AI), accelerate toward it, are resolved against World.resolveCircle and
 *   pushed lightly apart from other peds. A car hitting a ped above
 *   C.PED.knockdownSpeed knocks it down; it ragdoll-slides, then gets up.
 * - Vehicles use an arcade model: forward speed along `angle`, lateral slip
 *   bled by grip (handbrake lowers grip for drifts), steering scaled by speed.
 *   Tile collision uses corner circles (bounce + spin + damage), vehicle vs
 *   vehicle uses spine circles with mass-weighted impulses.
 * - hp 0 -> burning (smoke + fire) -> explosion after C.PHYS.burnSeconds with
 *   area damage -> static wreck that lingers, then despawns.
 * - Non-persistent entities beyond C.ACTIVE_RADIUS of the player despawn.
 * All randomness goes through GTP.rng.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util;
  var TILE = C.TILE;
  var PH = C.PHYS;
  var nextId = 1;

  function fxAdd(p) { var R = GTP.Render; if (R && R.fx && R.fx.add) R.fx.add(p); }
  function sfx(name, opts) { var A = GTP.Audio; if (A && A.play) { try { A.play(name, opts); } catch (e) { /* audio is optional */ } } }
  function player() { return GTP.game ? GTP.game.player : null; }
  function isPlayerSource(src) {
    var p = player(); if (!p || !src) return false;
    if (src === p) return true;
    if (src.kind === 'vehicle' && (src.driver === p)) return true;
    return false;
  }
  function crime(type, x, y) { var AI = GTP.AI; if (AI && AI.wanted && AI.wanted.onCrime) { try { AI.wanted.onCrime(type, x, y); } catch (e) { U.reportError(e, 'wanted.onCrime'); } } }
  function nearPlayer(x, y, r) { var p = player(); if (!p) return true; var dx = p.x - x, dy = p.y - y; return dx * dx + dy * dy < r * r; }
  function surfaceAt(x, y) { var W = GTP.World, t = W.tileAt(x, y), T = W.T; return (t === T.ROAD || t === T.BRIDGE || t === T.PARKING) ? 'road' : 'off'; }

  // Push a circle out of solid tiles. Returns the total push in `out` (x,y) and
  // true when it hit anything. Shared scratch, copy immediately.
  var pushScratch = { x: 0, y: 0 };
  function tilePush(x, y, r, out) {
    var W = GTP.World;
    out.x = 0; out.y = 0;
    var hit = false, cx0 = x, cy0 = y;
    for (var iter = 0; iter < 2; iter++) {
      var moved = false;
      var tx0 = Math.floor((x - r) / TILE), ty0 = Math.floor((y - r) / TILE);
      var tx1 = Math.floor((x + r) / TILE), ty1 = Math.floor((y + r) / TILE);
      for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
        if (!W.isSolidTile(W.tile(tx, ty))) continue;
        var rx = tx * TILE, ry = ty * TILE;
        var cx = x < rx ? rx : (x > rx + TILE ? rx + TILE : x);
        var cy = y < ry ? ry : (y > ry + TILE ? ry + TILE : y);
        var dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 < 1e-6) {
          var lx = x - rx, rxd = rx + TILE - x, uy = y - ry, dyd = ry + TILE - y;
          var m = Math.min(lx, rxd, uy, dyd);
          if (m === lx) x = rx - r; else if (m === rxd) x = rx + TILE + r; else if (m === uy) y = ry - r; else y = ry + TILE + r;
        } else {
          var d = Math.sqrt(d2), push = r - d + 0.01;
          x += dx / d * push; y += dy / d * push;
        }
        moved = true; hit = true;
      }
      if (!moved) break;
    }
    out.x = x - cx0; out.y = y - cy0;
    return hit;
  }

  // ------------------------------------------------------------- Entity ----
  function Entity(o) {
    this.id = nextId++;
    this.kind = 'entity';
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.angle = 0; this.radius = 8;
    this.hp = 100; this.maxHp = 100;
    this.alive = true; this.age = 0;
    this.persistent = false;
    this.tag = null;
    this.z = 0;
    // previous-step pose for render interpolation (Entities.update fills these)
    this._px = 0; this._py = 0; this._pa = 0;
    if (o) for (var k in o) this[k] = o[k];
    this._px = this.x; this._py = this.y; this._pa = this.angle;
  }
  Entity.prototype.update = function (dt) { this.age += dt; };
  Entity.prototype.onDeath = function () {};
  Entity.prototype.bounds = function () { return { x: this.x - this.radius, y: this.y - this.radius, w: this.radius * 2, h: this.radius * 2 }; };
  Entity.prototype.snap = function () { this._px = this.x; this._py = this.y; this._pa = this.angle; };
  Entity.prototype.distTo = function (e) { return U.dist(this.x, this.y, e.x, e.y); };
  Entity.prototype.speedLen = function () { return Math.sqrt(this.vx * this.vx + this.vy * this.vy); };

  // ---------------------------------------------------------------- Ped ----
  var HAIR_STYLES = ['short', 'short', 'short', 'long', 'buzz', 'bun', 'side', 'mohawk', 'bald', 'curly'];
  var HAT_COLORS = ['#2b2b2b', '#c0392b', '#2a4a8a', '#e8d8a0', '#2f855a', '#f4f4f4'];
  var PANTS = ['#2a2f4a', '#333333', '#4a4a4a', '#5b4636', '#2b3a55', '#7f8c8d', '#1f1f1f'];

  function Ped(o) {
    Entity.call(this);
    this.kind = 'ped';
    this.name = 'ped';
    this.look = null;
    this.state = 'idle';          // idle|walk|flee|attack|chase|knocked|dead
    this.target = null;
    this.inVehicle = null;
    this.seat = -1;               // 0 = driver, 1.. passengers
    this.weapon = 'fist';
    this.role = 'civ';            // civ|cop|thug|protester|npc
    this.radius = C.PED.radius; this.hp = C.PED.hp; this.maxHp = C.PED.hp;
    this.intent = { x: 0, y: 0, run: false };
    this.speedMul = 1;
    this.walkPhase = 0;
    this.moving = false;
    this.knockTimer = 0;
    this.deadTimer = 0;
    this.lastHitBy = null;
    this.lines = null;            // optional array of in-world one-liners
    this.lineCooldown = 0;
    this._sepT = 0;
    if (o) for (var k in o) this[k] = o[k];
    if (!this.look) this.look = Ped.randomLook(this.role);
    this._px = this.x; this._py = this.y; this._pa = this.angle;
  }
  Ped.prototype = Object.create(Entity.prototype);
  Ped.prototype.constructor = Ped;

  // A deterministic random look (skin/shirt/pants/hair + style, hats, glasses,
  // props) from the content spawn table, themed by role.
  Ped.randomLook = function (role) {
    var R = GTP.rng, CW = GTP.Content && GTP.Content.world;
    var tbl = CW && CW.spawn && CW.spawn.peds && CW.spawn.peds.looks;
    var base = (tbl && tbl.length) ? R.pick(tbl) : { skin: '#e8c39e', shirt: '#6a8fcf', pants: '#2a2f4a', hair: '#3a2a1a' };
    var look = {};
    for (var k in base) look[k] = base[k];
    if (!look.pants) look.pants = R.pick(PANTS);
    look.hairStyle = R.pick(HAIR_STYLES);
    if (R.chance(0.16)) look.glasses = R.chance(0.5) ? '#1a1a1a' : '#3a2a1a';
    if (R.chance(0.2)) { look.hat = R.pick(HAT_COLORS); look.hatStyle = R.chance(0.7) ? 'cap' : 'beanie'; }
    if (role === 'cop') {
      look.shirt = '#2b3f7a'; look.pants = '#1c2744'; look.hat = '#1c2744'; look.hatStyle = 'cop'; look.badge = '#e8c14a'; look.glasses = R.chance(0.4) ? '#111' : look.glasses;
    } else if (role === 'thug') {
      look.shirt = R.pick(['#222222', '#4a1f1f', '#2e2e4a', '#5a3a1a']);
      if (R.chance(0.6)) { look.hat = '#1a1a1a'; look.hatStyle = 'beanie'; }
    } else if (role === 'protester') {
      look.prop = 'sign'; look.signColor = R.pick(['#f4f4f4', '#ffd400', '#ff3fa4', '#2ee6ff']);
    } else if (role === 'npc') {
      look.tie = R.pick(['#b3122e', '#1d3a8a', '#2f855a']); look.shirt = R.pick(['#f4f4f4', '#dfe6f0', '#1a1a2a']);
    } else if (R.chance(0.12)) {
      look.prop = R.pick(['phone', 'coffee', 'bag']);
    }
    return look;
  };

  Ped.prototype.speakLine = function () {
    if (!this.lines || !this.lines.length || this.lineCooldown > 0) return null;
    this.lineCooldown = 4;
    return GTP.rng.pick(this.lines);
  };
  Ped.prototype.setIntent = function (x, y, run) { this.intent.x = x || 0; this.intent.y = y || 0; this.intent.run = !!run; };
  Ped.prototype.faceTo = function (x, y) { this.angle = U.angleTo(this.x, this.y, x, y); };
  Ped.prototype.isDown = function () { return this.state === 'knocked' || this.state === 'dead'; };
  Ped.prototype.animFrame = function () { return this.moving ? (Math.floor(this.walkPhase * 4) % 4) : -1; };

  Ped.prototype.update = function (dt) {
    this.age += dt;
    if (this.lineCooldown > 0) this.lineCooldown -= dt;
    if (this.inVehicle) { this.moving = false; return; } // the vehicle moves its occupants (Vehicle._syncOccupants)
    if (this.state === 'dead') { this.deadTimer += dt; this._slide(dt); return; }
    if (this.state === 'knocked') {
      this._slide(dt);
      this.knockTimer -= dt;
      if (this.knockTimer <= 0) { this.state = 'idle'; this.vx = this.vy = 0; this.z = 0; }
      return;
    }
    var W = GTP.World;
    var ix = this.intent.x, iy = this.intent.y;
    var il = Math.sqrt(ix * ix + iy * iy);
    if (il > 1) { ix /= il; iy /= il; }
    var spd = (this.intent.run ? C.PED.run : C.PED.walk) * this.speedMul;
    var tx = ix * spd, ty = iy * spd;
    var rate = C.PED.accel * dt;
    var dvx = tx - this.vx, dvy = ty - this.vy, dl = Math.sqrt(dvx * dvx + dvy * dvy);
    if (dl > rate) { dvx *= rate / dl; dvy *= rate / dl; }
    this.vx += dvx; this.vy += dvy;
    if (!ix && Math.abs(this.vx) < 0.5) this.vx = 0;
    if (!iy && Math.abs(this.vy) < 0.5) this.vy = 0;
    this._separate();
    var nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    var res = W.resolveCircle(nx, ny, this.radius);
    if (res.hitX) this.vx = 0;
    if (res.hitY) this.vy = 0;
    this.x = res.x; this.y = res.y;
    var moving = !!(ix || iy);
    if (moving) this.angle = U.angleLerp(this.angle, Math.atan2(iy, ix), Math.min(1, dt * 16));
    var sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.walkPhase += sp * dt / 24;
    this.moving = sp > 4;
    if (this.state === 'idle' || this.state === 'walk') this.state = this.moving ? 'walk' : 'idle';
  };

  var sepScratch = [];
  Ped.prototype._separate = function () {
    var E = GTP.Entities, r = this.radius + C.PED.radius;
    var list = E.hash.query(this.x, this.y, r, sepScratch);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === this || (o.kind !== 'ped' && o.kind !== 'player') || o.inVehicle || o.state === 'dead') continue;
      var dx = this.x - o.x, dy = this.y - o.y, d2 = dx * dx + dy * dy, rr = this.radius + o.radius;
      if (d2 >= rr * rr) continue;
      var d = Math.sqrt(d2);
      if (d < 0.01) { var a = (this.id * 0.7) % U.TAU; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
      var push = (rr - d) * 0.5;
      this.x += dx / d * push; this.y += dy / d * push;
    }
  };

  // knocked / dead slide with friction, bouncing softly off walls
  Ped.prototype._slide = function (dt) {
    var W = GTP.World;
    var k = Math.exp(-3.5 * dt);
    this.vx *= k; this.vy *= k;
    if (Math.abs(this.vx) < 2 && Math.abs(this.vy) < 2) { this.vx = this.vy = 0; return; }
    var res = W.resolveCircle(this.x + this.vx * dt, this.y + this.vy * dt, this.radius);
    if (res.hitX) this.vx *= -0.3;
    if (res.hitY) this.vy *= -0.3;
    this.x = res.x; this.y = res.y;
  };

  // Knock the ped down with a velocity; dmg goes through Combat.damage.
  Ped.prototype.knockDown = function (ivx, ivy, dmg, src) {
    if (!this.alive || this.inVehicle) return false;
    this.vx = ivx; this.vy = ivy;
    var sp = Math.sqrt(ivx * ivx + ivy * ivy);
    this.state = 'knocked';
    this.knockTimer = 1.2 + Math.min(1.6, sp / 220);
    this.angle = sp > 1 ? Math.atan2(ivy, ivx) : this.angle;
    this.z = -1;
    this.intent.x = this.intent.y = 0;
    this.lastHitBy = src || null;
    fxAdd({ type: 'puff', x: this.x, y: this.y, r0: 4, r1: 14, color: '#e8e2d6' });
    if (dmg > 0 && GTP.Combat && GTP.Combat.damage) GTP.Combat.damage(this, dmg, src, 'vehicle');
    return true;
  };
  Ped.prototype.onDeath = function () {
    if (this.inVehicle) this.inVehicle.exit(this);
    this.state = 'dead';
    this.alive = false;
    this.z = -1;
    this.deadTimer = 0;
    this.intent.x = this.intent.y = 0;
  };

  // ------------------------------------------------------------- Player ----
  function Player(o) {
    Ped.call(this, { look: { skin: '#e8c39e', shirt: '#f4f4f4', pants: '#2a2f4a', hair: '#3a2a1a', hairStyle: 'side', tie: '#b3122e', prop: 'mic' } });
    this.kind = 'player';
    this.name = 'player';
    this.role = 'npc';
    this.money = C.PLAYER.startMoney;
    this.wanted = 0; this.wantedHeat = 0;
    this.weapons = { fist: Infinity };
    this.weapon = 'fist';
    this.armor = 0;
    this.vehicle = null;
    this.stats = { distanceWalked: 0, distanceDriven: 0, vehiclesStolen: 0, pedsHit: 0, pickups: 0, crashes: 0 };
    this.radius = C.PLAYER.radius; this.hp = C.PLAYER.hp; this.maxHp = C.PLAYER.hp;
    this.persistent = true;
    this.godMode = false;
    this.controlEnabled = true;
    this.fireHeld = false;
    var cast = GTP.Content && GTP.Content.cast && GTP.Content.cast.player;
    if (cast) {
      if (cast.name) this.name = cast.name;
      if (cast.look) { for (var lk in cast.look) this.look[lk] = cast.look[lk]; }
    }
    if (o) for (var k in o) this[k] = o[k];
    this._px = this.x; this._py = this.y; this._pa = this.angle;
  }
  Player.prototype = Object.create(Ped.prototype);
  Player.prototype.constructor = Player;

  // Called by Game.step while the state is 'playing': turns GTP.Input into
  // ped intent (on foot) or vehicle controls (driving).
  Player.prototype.control = function (dt) {
    var In = GTP.Input, A = GTP.Audio;
    this.intent.x = 0; this.intent.y = 0; this.intent.run = false;
    var v = this.vehicle;
    if (!this.alive || !this.controlEnabled || this.isDown()) {
      if (v) { v.controls.throttle = 0; v.controls.steer = 0; v.controls.handbrake = false; }
      if (A && A.engine) A.engine(0);
      return;
    }
    var ax = In.axis();
    if (v) {
      var c = v.controls;
      c.throttle = U.clamp(-ax.y, -1, 1);   // W / up = accelerate, S / down = brake, reverse
      c.steer = U.clamp(ax.x, -1, 1);
      c.handbrake = In.down('action');
      if (In.pressed('horn')) { if (v.isPolice) v.siren = !v.siren; else v.honk(); }
      if (In.pressed('radio') && A && A.radio && A.radio.next) {
        var st = A.radio.next();
        if (st && GTP.UI && GTP.UI.toast) GTP.UI.toast('Radio: ' + st.name);
      }
      if (In.pressed('enter')) { this.exitVehicle(); if (A && A.engine) A.engine(0); return; }
      if (A && A.engine) A.engine(U.clamp(Math.abs(v.speed) / v.cls.maxSpeed, 0, 1) * (v.driver === this ? 1 : 0));
    } else {
      this.intent.x = ax.x; this.intent.y = ax.y; this.intent.run = In.down('run');
      if (In.pressed('enter')) {
        var nv = this.nearestVehicle(C.PLAYER.enterRange);
        if (nv) this.enterVehicle(nv);
      }
      if (In.pressed('weaponNext')) this.cycleWeapon(1);
      if (In.pressed('weaponPrev')) this.cycleWeapon(-1);
      var fire = In.down('shoot') || In.down('action');
      if (fire && GTP.Combat && GTP.Combat.fire) {
        try { GTP.Combat.fire(this, this.weapon, this.angle); } catch (e) { U.reportError(e, 'combat.fire'); }
      }
      this.fireHeld = fire;
      if (A && A.engine) A.engine(0);
    }
    void dt;
  };
  Player.prototype.cycleWeapon = function (dir) {
    var ids = Object.keys(this.weapons).filter(function (id) { return this.weapons[id] > 0; }, this);
    if (!ids.length) return;
    var i = ids.indexOf(this.weapon); if (i < 0) i = 0;
    this.weapon = ids[(i + dir + ids.length) % ids.length];
  };
  Player.prototype.update = function (dt) {
    var ox = this.x, oy = this.y;
    Ped.prototype.update.call(this, dt);
    if (this.vehicle) return; // driven distance is tracked by the vehicle
    var d = U.dist(ox, oy, this.x, this.y);
    if (d < 200 && !this.isDown()) this.stats.distanceWalked += d;
  };
  var nvScratch = [];
  // Nearest enterable vehicle whose body edge is within `range` px of the player.
  Player.prototype.nearestVehicle = function (range) {
    range = range == null ? C.PLAYER.enterRange : range;
    var list = GTP.Entities.hash.query(this.x, this.y, range + 48, nvScratch), best = null, bestD = range;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (v.kind !== 'vehicle' || v.wreck || v.locked) continue;
      var d = v.edgeDistance(this.x, this.y);
      if (d <= bestD) { bestD = d; best = v; }
    }
    return best;
  };
  Player.prototype.enterVehicle = function (v) {
    if (!v || v.wreck || this.inVehicle) return false;
    if (v.driver && v.driver !== this) { // carjack: the driver is pulled out and flees
      var d = v.driver, occupied = true;
      v.exit(d);
      d.state = 'flee'; d.fleeFrom = this; d.fleeTimer = 6; d.lastHitBy = this;
      this.stats.vehiclesStolen++;
      crime('stealOccupied', v.x, v.y);
      void occupied;
    }
    if (!v.enter(this)) return false;
    sfx('enter');
    return true;
  };
  Player.prototype.exitVehicle = function () {
    var v = this.vehicle; if (!v) return false;
    v.exit(this);
    sfx('enter');
    return true;
  };
  Player.prototype.onDeath = function () {
    Ped.prototype.onDeath.call(this);
    if (GTP.Combat && GTP.Combat.onPlayerDeath) { try { GTP.Combat.onPlayerDeath(); } catch (e) { U.reportError(e, 'combat.onPlayerDeath'); } }
  };

  // ------------------------------------------------------------ Vehicle ----
  var circleCache = {}, spineCache = {};
  // corner circles (tile collision): two rows of small circles along the body
  function circlesFor(type, cls) {
    if (circleCache[type]) return circleCache[type];
    var cr = cls.h * 0.32, hx = cls.w / 2 - cr, hy = cls.h / 2 - cr;
    var n = Math.max(2, Math.ceil(cls.w / (cr * 2.2))), out = [];
    for (var i = 0; i < n; i++) {
      var lx = -hx + (2 * hx) * (n === 1 ? 0.5 : i / (n - 1));
      out.push({ x: lx, y: -hy, r: cr }); out.push({ x: lx, y: hy, r: cr });
    }
    circleCache[type] = out;
    return out;
  }
  // spine circles (vehicle vs vehicle / ped): full-width circles along the center line
  function spineFor(type, cls) {
    if (spineCache[type]) return spineCache[type];
    var r = cls.h / 2, n = Math.max(1, Math.round(cls.w / cls.h)), hx = cls.w / 2 - r, out = [];
    for (var i = 0; i < n; i++) out.push({ x: n === 1 ? 0 : -hx + (2 * hx) * i / (n - 1), y: 0, r: r });
    spineCache[type] = out;
    return out;
  }

  function Vehicle(o) {
    Entity.call(this);
    this.kind = 'vehicle';
    this.type = 'sedan';
    this.speed = 0;        // signed forward speed px/s
    this.lateral = 0;      // lateral slip px/s (positive = sliding to the car's right)
    this.steer = 0;        // smoothed steering -1..1
    this.angVel = 0;       // collision spin rad/s
    this.controls = { throttle: 0, steer: 0, handbrake: false };
    this.driver = null; this.passengers = [];
    this.color = null; this.variant = -1;
    this.damage = 0; this.isPolice = false; this.siren = false;
    this.burning = false; this.burnTimer = 0; this.wreck = false; this.exploded = false; this.wreckTimer = 0;
    this.headlights = true; this.braking = false; this.reversing = false;
    this.honkTimer = 0; this.lastDamageSource = null; this.lastHitBy = null; this.lastCollision = -10;
    this.locked = false;   // mission vehicles the player may not take
    this.surface = 'road';
    this._smokeT = 0; this._dustT = 0; this._skidT = 0; this._fireT = 0;
    this._wheelL = null; this._wheelR = null;
    if (o) for (var k in o) this[k] = o[k];
    this.cls = C.VEHICLES[this.type] || C.VEHICLES.sedan;
    if (!this.color) this.color = GTP.rng.pick(this.cls.colors);
    if (this.variant < 0) this.variant = GTP.rng.int(0, 2);
    this.mass = this.cls.mass || 1;
    this.radius = Math.max(this.cls.w, this.cls.h) * 0.5 + 2;
    this.maxHp = this.cls.hp;
    if (!(o && o.hp != null)) this.hp = this.cls.hp;
    this.isPolice = this.type === 'cop';
    this._circles = circlesFor(this.type, this.cls);
    this._spine = spineFor(this.type, this.cls);
    this._px = this.x; this._py = this.y; this._pa = this.angle;
  }
  Vehicle.prototype = Object.create(Entity.prototype);
  Vehicle.prototype.constructor = Vehicle;

  Vehicle.prototype.occupants = function () { var o = []; if (this.driver) o.push(this.driver); for (var i = 0; i < this.passengers.length; i++) o.push(this.passengers[i]); return o; };
  Vehicle.prototype.hasPlayer = function () { var p = player(); return !!p && (this.driver === p || this.passengers.indexOf(p) >= 0); };
  Vehicle.prototype.seatsFree = function () { return this.cls.seats - this.occupants().length; };
  Vehicle.prototype.honk = function () { if (this.honkTimer <= 0) { this.honkTimer = 0.5; sfx('horn', { x: this.x, y: this.y }); } };
  // distance from a point to the nearest edge of the body (spine circles)
  Vehicle.prototype.edgeDistance = function (px, py) {
    var ca = Math.cos(this.angle), sa = Math.sin(this.angle), best = Infinity, s = this._spine;
    for (var i = 0; i < s.length; i++) {
      var cx = this.x + s[i].x * ca, cy = this.y + s[i].x * sa;
      var d = U.dist(px, py, cx, cy) - s[i].r;
      if (d < best) best = d;
    }
    return best;
  };
  Vehicle.prototype.setControls = function (throttle, steer, handbrake) { this.controls.throttle = throttle || 0; this.controls.steer = steer || 0; this.controls.handbrake = !!handbrake; };

  Vehicle.prototype.enter = function (ped, asPassenger) {
    if (!ped || ped.inVehicle || this.wreck) return false;
    if (!this.driver && !asPassenger) { this.driver = ped; ped.seat = 0; }
    else if (this.passengers.length < this.cls.seats - 1) { this.passengers.push(ped); ped.seat = this.passengers.length; }
    else return false;
    ped.inVehicle = this;
    ped.vx = ped.vy = 0; ped.intent.x = ped.intent.y = 0; ped.moving = false;
    ped.x = this.x; ped.y = this.y; ped.angle = this.angle; ped.snap();
    if (ped.state === 'walk') ped.state = 'idle';
    if (ped.kind === 'player') { ped.vehicle = this; this.headlights = true; }
    if (ped._inList) GTP.Entities.hash.update(ped);
    return true;
  };
  Vehicle.prototype.exit = function (ped) {
    if (!ped || ped.inVehicle !== this) return false;
    if (this.driver === ped) { this.driver = null; this.controls.throttle = 0; this.controls.steer = 0; this.controls.handbrake = false; }
    else { var i = this.passengers.indexOf(ped); if (i >= 0) this.passengers.splice(i, 1); }
    ped.inVehicle = null; ped.seat = -1;
    if (ped.kind === 'player') ped.vehicle = null;
    var spot = this.doorSpot(ped);
    ped.x = spot.x; ped.y = spot.y;
    ped.angle = U.angleTo(this.x, this.y, spot.x, spot.y);
    ped.vx = ped.vy = 0;
    ped.snap();
    if (ped._inList) GTP.Entities.hash.update(ped);
    var sp = this.speedLen();
    if (sp > PH.bailSpeed && ped.alive) ped.knockDown(this.vx * 0.7, this.vy * 0.7, Math.max(0, (sp - PH.bailSpeed) * 0.05), this);
    return true;
  };
  // A walkable spot beside a door: left side first, then right, rear, front.
  Vehicle.prototype.doorSpot = function (ped) {
    var W = GTP.World, r = ped ? ped.radius : C.PED.radius;
    var ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    var side = this.cls.h / 2 + r + 5, end = this.cls.w / 2 + r + 5;
    var cands = [[sa * side, -ca * side], [-sa * side, ca * side], [-ca * end, -sa * end], [ca * end, sa * end]];
    for (var i = 0; i < cands.length; i++) {
      var x = this.x + cands[i][0], y = this.y + cands[i][1];
      if (W.solidAt(x, y)) continue;
      var res = W.resolveCircle(x, y, r);
      if (!W.solidAt(res.x, res.y)) return { x: res.x, y: res.y, side: i };
    }
    var f = W.resolveCircle(this.x, this.y, r);
    return { x: f.x, y: f.y, side: -1 };
  };

  Vehicle.prototype.update = function (dt) {
    this.age += dt;
    if (this.honkTimer > 0) this.honkTimer -= dt;
    if (this.wreck) { this.wreckTimer += dt; this.vx = this.vy = 0; this.speed = 0; this.lateral = 0; this._wreckFx(dt); return; }
    if (this.hp <= 0 && !this.burning) this.ignite(); // hp zeroed directly (debug, Combat)
    if (this.burning) {
      this.burnTimer -= dt;
      this._burnFx(dt);
      if (this.burnTimer <= 0) { this.explode(); return; }
    }
    var cls = this.cls, ctl = this.controls;
    var hasDriver = !!this.driver && this.driver.alive;
    var throttle = hasDriver ? U.clamp(ctl.throttle, -1, 1) : 0;
    var steerIn = hasDriver ? U.clamp(ctl.steer, -1, 1) : 0;
    var hb = hasDriver ? !!ctl.handbrake : false;
    if (this.burning) throttle *= 0.4;
    this.steer += (steerIn - this.steer) * Math.min(1, dt * PH.steerLerp);

    var ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    var vf = this.vx * ca + this.vy * sa;         // forward
    var vl = -this.vx * sa + this.vy * ca;        // lateral (right positive)
    var surf = this.surface = surfaceAt(this.x, this.y);
    var off = surf === 'off';
    var maxSpeed = cls.maxSpeed * (off ? PH.offroadSpeed : 1);

    // longitudinal
    if (throttle > 0) {
      if (vf < -1) vf = Math.min(0, vf + cls.brake * throttle * dt);
      else {
        var a = cls.accel * throttle * (1 - 0.5 * U.clamp(vf / maxSpeed, 0, 1));
        vf = Math.min(Math.max(vf, maxSpeed), vf + a * dt);
      }
    } else if (throttle < 0) {
      if (vf > 1) vf = Math.max(0, vf + cls.brake * throttle * dt);
      else vf = Math.max(-cls.reverse, vf + cls.accel * 0.6 * throttle * dt);
    }
    var drag = PH.drag * (off ? PH.offroadDrag : 1);
    vf -= vf * Math.min(1, drag * dt);
    if (throttle === 0) { var rf = PH.rolling * dt; vf = Math.abs(vf) <= rf ? 0 : vf - U.sign(vf) * rf; }
    if (hb) { var hbd = cls.brake * PH.handbrake * dt; vf = Math.abs(vf) <= hbd ? 0 : vf - U.sign(vf) * hbd; }
    // lateral grip
    var grip = cls.grip * (hb ? PH.handbrakeGrip : 1) * (off ? 0.75 : 1);
    vl *= Math.exp(-grip * PH.gripRate * dt);
    if (Math.abs(vl) < 0.5) vl = 0;
    // recompose in the frame we decomposed in; the heading then rotates and the
    // next step sees the mismatch as lateral slip that grip bleeds away
    this.vx = vf * ca - vl * sa; this.vy = vf * sa + vl * ca;
    var spd = Math.sqrt(vf * vf + vl * vl);
    // steering scaled by speed
    var sf = U.clamp(spd / PH.steerFullSpeed, 0, 1);
    sf *= 1 - PH.highSpeedSteerLoss * U.clamp((spd - cls.maxSpeed * 0.5) / (cls.maxSpeed * 0.5), 0, 1);
    var dir = vf < -1 ? -1 : 1;
    var turn = this.steer * cls.turnRate * sf * dir * (hb ? 1.2 : 1);
    this.angle = U.wrapAngle(this.angle + (turn + this.angVel) * dt);
    this.angVel *= Math.exp(-PH.angDamp * dt);
    if (Math.abs(this.angVel) < 0.01) this.angVel = 0;
    this.speed = vf; this.lateral = vl;
    this.braking = hasDriver && ((throttle < 0 && vf > 1) || (hb && spd > 5));
    this.reversing = vf < -2;

    // integrate
    var x0 = this.x, y0 = this.y;
    this.x += this.vx * dt; this.y += this.vy * dt;

    // collisions
    this._collideTiles();
    this._collideVehicles();
    this._collidePeds();

    // keep the decomposition consistent after collisions
    ca = Math.cos(this.angle); sa = Math.sin(this.angle);
    this.speed = this.vx * ca + this.vy * sa;
    this.lateral = -this.vx * sa + this.vy * ca;
    if (Math.abs(this.speed) < 0.3 && Math.abs(this.lateral) < 0.3 && !throttle) { this.vx = this.vy = 0; this.speed = 0; this.lateral = 0; }

    this._syncOccupants(U.dist(x0, y0, this.x, this.y));
    this._surfaceFx(dt, off, hb);
    this._damageFx(dt);
  };
  // occupants ride along (hidden by the renderer); the player's driven distance is counted here
  Vehicle.prototype._syncOccupants = function (moved) {
    var occ = this.occupants();
    for (var i = 0; i < occ.length; i++) {
      var o = occ[i];
      o.x = this.x; o.y = this.y; o.angle = this.angle; o.vx = this.vx; o.vy = this.vy;
      if (o.kind === 'player' && moved < 200) o.stats.distanceDriven += moved;
      if (o._inList) GTP.Entities.hash.update(o);
    }
  };

  // --- tile collision: corner circles, sequential pushes with bounce + spin ---
  Vehicle.prototype._collideTiles = function () {
    var cs = this._circles, hit = false, impactMax = 0, cxMax = 0, cyMax = 0, nxMax = 0, nyMax = 0;
    var I = (this.cls.w * this.cls.w + this.cls.h * this.cls.h) / 4;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], ca = Math.cos(this.angle), sa = Math.sin(this.angle);
      var ox = c.x * ca - c.y * sa, oy = c.x * sa + c.y * ca;
      var px = this.x + ox, py = this.y + oy;
      if (!tilePush(px, py, c.r, pushScratch)) continue;
      hit = true;
      var pxl = pushScratch.x, pyl = pushScratch.y;
      this.x += pxl; this.y += pyl;
      var pl = Math.sqrt(pxl * pxl + pyl * pyl); if (pl < 1e-6) continue;
      var nx = pxl / pl, ny = pyl / pl;
      var vn = this.vx * nx + this.vy * ny;
      if (vn < 0) {
        var impact = -vn, e = PH.tileRestitution;
        this.vx -= (1 + e) * vn * nx; this.vy -= (1 + e) * vn * ny;
        this.vx *= PH.scrape; this.vy *= PH.scrape;
        var cross = ox * ny - oy * nx;
        this.angVel += cross * impact * PH.torque / I;
        if (impact > impactMax) { impactMax = impact; cxMax = px; cyMax = py; nxMax = nx; nyMax = ny; }
      }
    }
    if (hit) this.lastCollision = this.age;
    if (impactMax > PH.damageSpeed) {
      var dmg = (impactMax - PH.damageSpeed) * PH.damagePerSpeed * (0.7 + 0.3 * this.mass);
      this.applyDamage(dmg, 'wall');
      this._crashFx(cxMax, cyMax, nxMax, nyMax, impactMax);
      if (impactMax > PH.occupantHurtSpeed && GTP.Combat && GTP.Combat.damage) {
        var occ = this.occupants();
        for (var k = 0; k < occ.length; k++) if (!(occ[k].godMode)) GTP.Combat.damage(occ[k], (impactMax - PH.occupantHurtSpeed) * 0.08, 'wall', 'crash');
      }
      if (this.hasPlayer()) { var p = player(); if (p) p.stats.crashes++; }
    }
  };

  Vehicle.prototype._crashFx = function (x, y, nx, ny, impact) {
    var R = GTP.rng, n = Math.min(8, 2 + (impact / 60) | 0);
    for (var i = 0; i < n; i++) {
      var a = Math.atan2(ny, nx) + (R.random() - 0.5) * 2.2, s = 60 + R.random() * 160;
      fxAdd({ type: 'spark', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + R.random() * 0.25 });
    }
    fxAdd({ type: 'puff', x: x, y: y, r0: 3, r1: 10, color: '#d8d4cc' });
    if (this.hasPlayer()) {
      var cam = GTP.Render && GTP.Render.cam;
      if (cam) cam.shake = Math.max(cam.shake, Math.min(8, impact / 45));
      sfx('hit', { x: x, y: y, gain: Math.min(1, impact / 300) });
    }
  };

  // --- vehicle vs vehicle: spine circles, mass-weighted push + impulse ---
  var vScratch = [];
  Vehicle.prototype._collideVehicles = function () {
    var list = GTP.Entities.hash.query(this.x, this.y, this.radius + 50, vScratch);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === this || o.kind !== 'vehicle') continue;
      if (!o.wreck && o.id < this.id) continue; // live pairs are handled once, from the higher id
      var dx0 = o.x - this.x, dy0 = o.y - this.y, rr0 = this.radius + o.radius;
      if (dx0 * dx0 + dy0 * dy0 > rr0 * rr0) continue;
      this._collidePair(o);
    }
  };
  Vehicle.prototype._collidePair = function (o) {
    var m1 = this.mass, m2 = o.wreck ? 1e6 : o.mass, wa = m2 / (m1 + m2), wb = m1 / (m1 + m2);
    var I1 = (this.cls.w * this.cls.w + this.cls.h * this.cls.h) / 4, I2 = (o.cls.w * o.cls.w + o.cls.h * o.cls.h) / 4;
    var sA = this._spine, sB = o._spine, impactMax = 0, cx = 0, cy = 0, nxM = 0, nyM = 0;
    for (var i = 0; i < sA.length; i++) {
      var ca = Math.cos(this.angle), sa = Math.sin(this.angle);
      var ax = this.x + sA[i].x * ca, ay = this.y + sA[i].x * sa, ra = sA[i].r;
      for (var j = 0; j < sB.length; j++) {
        var cb = Math.cos(o.angle), sb = Math.sin(o.angle);
        var bx = o.x + sB[j].x * cb, by = o.y + sB[j].x * sb, rb = sB[j].r;
        var dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy, rr = ra + rb;
        if (d2 >= rr * rr) continue;
        var d = Math.sqrt(d2);
        var nx, ny;
        if (d < 0.01) { nx = Math.cos(this.angle + Math.PI / 2); ny = Math.sin(this.angle + Math.PI / 2); d = 0.01; } else { nx = dx / d; ny = dy / d; }
        var pen = rr - d + 0.05;
        this.x -= nx * pen * wa; this.y -= ny * pen * wa;
        if (!o.wreck) { o.x += nx * pen * wb; o.y += ny * pen * wb; }
        var rvx = o.vx - this.vx, rvy = o.vy - this.vy, vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          var jimp = -(1 + PH.carRestitution) * vn / (1 / m1 + 1 / m2);
          this.vx -= jimp * nx / m1; this.vy -= jimp * ny / m1;
          if (!o.wreck) { o.vx += jimp * nx / m2; o.vy += jimp * ny / m2; }
          var impact = -vn;
          this.angVel += ((ax - this.x) * (-ny) - (ay - this.y) * (-nx)) * impact * PH.torque * 0.6 / I1;
          if (!o.wreck) o.angVel += ((bx - o.x) * ny - (by - o.y) * nx) * impact * PH.torque * 0.6 / I2;
          if (impact > impactMax) { impactMax = impact; cx = ax + nx * ra; cy = ay + ny * ra; nxM = nx; nyM = ny; }
        }
        ax = this.x + sA[i].x * ca; ay = this.y + sA[i].x * sa; // refresh after the push
      }
    }
    this.lastCollision = this.age; o.lastCollision = o.age;
    this.lastHitBy = o; o.lastHitBy = this;
    if (impactMax > PH.damageSpeed) {
      var base = (impactMax - PH.damageSpeed) * PH.damagePerSpeed;
      this.applyDamage(base * 2 * wa, o);
      o.applyDamage(base * 2 * wb, this);
      this._crashFx(cx, cy, -nxM, -nyM, impactMax);
      if (o.hasPlayer && o.hasPlayer()) o._crashFx(cx, cy, nxM, nyM, impactMax);
    }
  };

  // --- vehicle vs ped: knockdown at speed, gentle push when slow ---
  var pScratch = [];
  Vehicle.prototype._collidePeds = function () {
    var W = GTP.World;
    var list = GTP.Entities.hash.query(this.x, this.y, this.radius + 16, pScratch);
    var spd = this.speedLen(), s = this._spine;
    var ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if ((p.kind !== 'ped' && p.kind !== 'player') || p.inVehicle || p.state === 'dead') continue;
      for (var j = 0; j < s.length; j++) {
        var cx = this.x + s[j].x * ca, cy = this.y + s[j].x * sa, r = s[j].r + p.radius;
        var dx = p.x - cx, dy = p.y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        var d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d, pen = r - d;
        if (spd > C.PED.knockdownSpeed && p.state !== 'knocked' && p.alive) {
          var kx = this.vx * 0.85 + nx * 90, ky = this.vy * 0.85 + ny * 90;
          var dmg = p.godMode ? 0 : PH.pedHitDamage + spd * PH.pedHitDamagePerSpeed;
          p.knockDown(kx, ky, dmg, this);
          this.vx *= 0.93; this.vy *= 0.93;
          sfx('hit', { x: p.x, y: p.y });
          if (this.hasPlayer()) { var pl = player(); pl.stats.pedsHit++; crime('hitPed', p.x, p.y); }
          if (p.role === 'cop' && this.hasPlayer()) crime('attackCop', p.x, p.y);
        } else {
          var res = W.resolveCircle(p.x + nx * pen, p.y + ny * pen, p.radius);
          p.x = res.x; p.y = res.y;
          if (p.state === 'knocked') { p.vx += nx * 40; p.vy += ny * 40; }
          else if (spd > 5) { p.vx += nx * 10; p.vy += ny * 10; }
        }
        break;
      }
    }
  };

  // --- fx: dust on hard turns / off-road, skid marks, smoke, fire ---
  Vehicle.prototype._wheelPos = function (rear, side) {
    var ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    var lx = (rear ? -1 : 1) * this.cls.w * 0.32, ly = side * (this.cls.h / 2 - 2);
    return { x: this.x + lx * ca - ly * sa, y: this.y + lx * sa + ly * ca };
  };
  Vehicle.prototype._surfaceFx = function (dt, off, hb) {
    var spd = this.speedLen(), slip = Math.abs(this.lateral);
    if (spd < 40 || !nearPlayer(this.x, this.y, 900)) { this._wheelL = this._wheelR = null; return; }
    var R = GTP.Render; if (!R || !R.fx) return;
    var sliding = slip > 45 || (hb && spd > 80);
    this._dustT -= dt;
    if ((sliding || (off && spd > 90)) && this._dustT <= 0) {
      this._dustT = 0.06;
      var w1 = this._wheelPos(true, -1), w2 = this._wheelPos(true, 1), rg = GTP.rng;
      var col = off ? '#b9a77a' : '#cfcfd4';
      fxAdd({ type: 'puff', x: w1.x, y: w1.y, vx: -this.vx * 0.1 + (rg.random() - 0.5) * 20, vy: -this.vy * 0.1 + (rg.random() - 0.5) * 20, r0: 3, r1: 11, color: col, life: 0.5 });
      fxAdd({ type: 'puff', x: w2.x, y: w2.y, vx: -this.vx * 0.1 + (rg.random() - 0.5) * 20, vy: -this.vy * 0.1 + (rg.random() - 0.5) * 20, r0: 3, r1: 11, color: col, life: 0.5 });
    }
    // skid marks on pavement while sliding / braking hard
    if (!off && (sliding || (this.braking && spd > 140)) && R.fx.addMark) {
      var a = this._wheelPos(true, -1), b = this._wheelPos(true, 1);
      if (this._wheelL && this._wheelR) {
        R.fx.addMark(this._wheelL.x, this._wheelL.y, a.x, a.y);
        R.fx.addMark(this._wheelR.x, this._wheelR.y, b.x, b.y);
      }
      this._wheelL = a; this._wheelR = b;
    } else { this._wheelL = this._wheelR = null; }
  };
  Vehicle.prototype._damageFx = function (dt) {
    if (this.burning || this.hp > this.maxHp * 0.4) return;
    this._smokeT -= dt;
    if (this._smokeT > 0 || !nearPlayer(this.x, this.y, 900)) return;
    this._smokeT = this.hp < this.maxHp * 0.2 ? 0.1 : 0.22;
    var f = this._wheelPos(false, 0), rg = GTP.rng;
    fxAdd({ type: 'smoke', x: f.x + this.cls.w * 0.12 * Math.cos(this.angle), y: f.y + this.cls.w * 0.12 * Math.sin(this.angle), vx: (rg.random() - 0.5) * 14, vy: -14 - rg.random() * 12, r: 3 + rg.random() * 3, life: 0.9 + rg.random() * 0.5, color: this.hp < this.maxHp * 0.2 ? '#3a3a40' : '#8a8f99' });
  };
  Vehicle.prototype._burnFx = function (dt) {
    this._fireT -= dt;
    if (this._fireT > 0 || !nearPlayer(this.x, this.y, 1000)) return;
    this._fireT = 0.05;
    var rg = GTP.rng, ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    var lx = (rg.random() - 0.5) * this.cls.w * 0.7, ly = (rg.random() - 0.5) * this.cls.h * 0.6;
    var x = this.x + lx * ca - ly * sa, y = this.y + lx * sa + ly * ca;
    fxAdd({ type: 'fire', x: x, y: y, r: 4 + rg.random() * 5, life: 0.3 + rg.random() * 0.25 });
    if (rg.chance(0.5)) fxAdd({ type: 'smoke', x: x, y: y - 4, vx: (rg.random() - 0.5) * 16, vy: -24 - rg.random() * 16, r: 5 + rg.random() * 4, life: 1.2 + rg.random() * 0.6, color: '#23242a' });
  };
  Vehicle.prototype._wreckFx = function (dt) {
    this._fireT -= dt;
    if (this._fireT > 0 || this.wreckTimer > 14 || !nearPlayer(this.x, this.y, 1000)) return;
    this._fireT = 0.16 + this.wreckTimer * 0.03;
    var rg = GTP.rng, ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    var lx = (rg.random() - 0.5) * this.cls.w * 0.6, x = this.x + lx * ca, y = this.y + lx * sa;
    fxAdd({ type: 'smoke', x: x, y: y, vx: (rg.random() - 0.5) * 10, vy: -18 - rg.random() * 10, r: 4 + rg.random() * 4, life: 1.3, color: '#2a2b30' });
    if (this.wreckTimer < 6 && rg.chance(0.6)) fxAdd({ type: 'fire', x: x + (rg.random() - 0.5) * 8, y: y, r: 3 + rg.random() * 3, life: 0.3 });
  };

  // --- damage / burn / explode ---
  Vehicle.prototype.applyDamage = function (n, src) {
    if (this.wreck || !(n > 0)) return;
    this.damage += n;
    if (src != null) this.lastDamageSource = src;
    if (this.hp <= 0) return; // already burning
    this.hp = Math.max(0, this.hp - n);
    if (this.hp <= 0) this.ignite(src);
  };
  Vehicle.prototype.ignite = function (src) {
    if (this.burning || this.wreck) return;
    this.hp = 0; this.burning = true; this.burnTimer = PH.burnSeconds;
    this.headlights = false; this.siren = false;
    if (src != null) this.lastDamageSource = src;
    fxAdd({ type: 'puff', x: this.x, y: this.y, r0: 6, r1: 26, color: '#55575f', life: 0.8 });
    if (nearPlayer(this.x, this.y, 900)) sfx('hit', { x: this.x, y: this.y });
  };
  Vehicle.prototype.onDeath = function () {
    // Combat.damage may zero hp directly: a vehicle stays "alive" (an obstacle) until it explodes
    if (this.wreck) return;
    this.alive = true;
    if (!this.burning) this.ignite();
  };
  Vehicle.prototype.explode = function () {
    if (this.exploded) return;
    var src = this.lastDamageSource, byPlayer = isPlayerSource(src);
    this.exploded = true; this.wreck = true; this.burning = false; this.alive = false; this.hp = 0;
    this.vx = this.vy = 0; this.speed = 0; this.lateral = 0; this.angVel = 0;
    this.controls.throttle = 0; this.controls.steer = 0; this.controls.handbrake = false;
    this.headlights = false; this.siren = false; this.wreckTimer = 0;
    fxAdd({ type: 'explosion', x: this.x, y: this.y, big: this.cls.w > 50 });
    sfx('explode', { x: this.x, y: this.y });
    var CB = GTP.Combat;
    // occupants are thrown out and hurt
    var occ = this.occupants();
    for (var i = 0; i < occ.length; i++) {
      var o = occ[i];
      this.exit(o);
      var a = U.angleTo(this.x, this.y, o.x, o.y);
      o.knockDown(Math.cos(a) * 160, Math.sin(a) * 160, 0, this);
      if (CB && CB.damage && !o.godMode) CB.damage(o, PH.explodeOccupantDamage, this, 'explosion');
    }
    // area damage
    var R = PH.explodeRadius, list = GTP.Entities.near(this.x, this.y, R);
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      if (e === this) continue;
      var d = U.dist(this.x, this.y, e.x, e.y), f = U.clamp(1 - d / R, 0, 1);
      var ang = U.angleTo(this.x, this.y, e.x, e.y);
      if ((e.kind === 'ped' || e.kind === 'player') && e.alive && !e.inVehicle) {
        e.knockDown(Math.cos(ang) * (80 + 160 * f), Math.sin(ang) * (80 + 160 * f), 0, this);
        if (CB && CB.damage && !e.godMode) CB.damage(e, PH.explodePedDamage * (0.3 + 0.7 * f), this, 'explosion');
      } else if (e.kind === 'vehicle' && !e.wreck) {
        e.applyDamage(PH.explodeVehicleDamage * (0.35 + 0.65 * f), byPlayer ? src : this);
        e.vx += Math.cos(ang) * 90 * f; e.vy += Math.sin(ang) * 90 * f;
        e.angVel += (GTP.rng.random() - 0.5) * 3 * f;
        if (e.burning) e.burnTimer = Math.max(0.4, e.burnTimer); // chain reactions stagger
      }
    }
    if (byPlayer) crime('destroyVehicle', this.x, this.y);
    Entity.prototype.onDeath.call(this);
  };

  // --------------------------------------------------------- Projectile ----
  var prScratch = [];
  function Projectile(o) {
    Entity.call(this);
    this.kind = 'projectile';
    this.owner = null; this.weaponId = 'pistol'; this.dmg = 10; this.life = 1; this.radius = 2; this.z = 2;
    this.hitRadius = 2;
    if (o) for (var k in o) this[k] = o[k];
    this._px = this.x; this._py = this.y; this._pa = this.angle;
  }
  Projectile.prototype = Object.create(Entity.prototype);
  Projectile.prototype.constructor = Projectile;
  Projectile.prototype.update = function (dt) {
    this.age += dt; this.life -= dt;
    if (this.life <= 0) { this.alive = false; return; }
    var W = GTP.World, nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    var mx = (this.x + nx) / 2, my = (this.y + ny) / 2;
    if (W.solidAt(nx, ny) || W.solidAt(mx, my)) {
      this.alive = false;
      fxAdd({ type: 'spark', x: this.x, y: this.y, vx: -this.vx * 0.15, vy: -this.vy * 0.15, life: 0.2 });
      return;
    }
    var own = this.owner, ownVeh = own && own.inVehicle;
    var list = GTP.Entities.hash.query(mx, my, Math.max(24, this.speedLen() * dt * 0.5 + 30), prScratch);
    var sx = nx - this.x, sy = ny - this.y, sl2 = sx * sx + sy * sy || 1;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e === own || e === ownVeh || !e.alive) continue;
      if (e.kind !== 'ped' && e.kind !== 'player' && e.kind !== 'vehicle') continue;
      if (e.inVehicle) continue;
      if (e.kind === 'vehicle' && e.driver === own) continue;
      // closest point on this step's segment to the entity
      var t = U.clamp(((e.x - this.x) * sx + (e.y - this.y) * sy) / sl2, 0, 1);
      var cx = this.x + sx * t, cy = this.y + sy * t;
      var rr = e.radius + this.hitRadius;
      if (U.dist2(cx, cy, e.x, e.y) > rr * rr) continue;
      this.alive = false;
      if (e.kind === 'vehicle') e.applyDamage(this.dmg, own);
      else if (GTP.Combat && GTP.Combat.damage) GTP.Combat.damage(e, this.dmg, own, this.weaponId);
      fxAdd({ type: 'puff', x: cx, y: cy, r0: 2, r1: 7, color: e.kind === 'vehicle' ? '#d8d4cc' : '#c9a27a', life: 0.3 });
      if (e.kind === 'vehicle') fxAdd({ type: 'spark', x: cx, y: cy, vx: -this.vx * 0.1, vy: -this.vy * 0.1, life: 0.2 });
      return;
    }
    this.x = nx; this.y = ny;
  };

  // ------------------------------------------------------------- Pickup ----
  var PICKUP_NAMES = { cash: 'cash', health: 'health', armor: 'armor', weapon: 'weapon', mission: 'item' };
  function Pickup(o) {
    Entity.call(this);
    this.kind = 'pickup';
    this.pickupType = 'cash'; this.value = 50; this.weaponId = null; this.radius = 10; this.z = -1;
    this.collected = false; this.onCollect = null; this.label = null;
    if (o) for (var k in o) this[k] = o[k];
    this._px = this.x; this._py = this.y; this._pa = this.angle;
  }
  Pickup.prototype = Object.create(Entity.prototype);
  Pickup.prototype.constructor = Pickup;
  Pickup.prototype.update = function (dt) {
    this.age += dt;
    if (this.collected) { this.alive = false; return; }
    var p = player(); if (!p || !p.alive) return;
    var r = this.radius + (p.inVehicle ? p.inVehicle.cls.h / 2 : p.radius) + 2;
    if (U.dist2(this.x, this.y, p.x, p.y) <= r * r) this.collect(p);
  };
  Pickup.prototype.collect = function (p) {
    if (this.collected) return false;
    this.collected = true; this.alive = false;
    var text = null, color = '#ffffff', sound = 'pickup';
    switch (this.pickupType) {
      case 'cash': p.money += this.value; text = '+' + U.fmtMoney(this.value); color = '#5bd16a'; sound = 'cash'; break;
      case 'health': p.hp = Math.min(p.maxHp, p.hp + this.value); text = '+' + this.value + ' HP'; color = '#ff5f5f'; break;
      case 'armor': p.armor = Math.min(100, (p.armor || 0) + this.value); text = '+' + this.value + ' ARMOR'; color = '#8fb6ff'; break;
      case 'weapon':
        if (this.weaponId) {
          p.weapons[this.weaponId] = (p.weapons[this.weaponId] || 0) + (this.value || 0);
          if (!p.weapon || p.weapon === 'fist') p.weapon = this.weaponId;
          var wdef = GTP.Combat && GTP.Combat.WEAPONS && GTP.Combat.WEAPONS[this.weaponId];
          text = (wdef && wdef.name ? wdef.name : this.weaponId) + ' +' + (this.value || 0);
        }
        color = '#ffbe3c'; break;
      default: text = this.label || ('+1 ' + (PICKUP_NAMES[this.pickupType] || 'item')); color = '#ffbe3c';
    }
    if (p.stats) p.stats.pickups = (p.stats.pickups || 0) + 1;
    if (text) fxAdd({ type: 'text', x: this.x, y: this.y - 10, text: text, color: color });
    sfx(sound, { x: this.x, y: this.y });
    if (typeof this.onCollect === 'function') { try { this.onCollect(p, this); } catch (e) { U.reportError(e, 'pickup.onCollect'); } }
    return true;
  };

  GTP.Entity = Entity; GTP.Ped = Ped; GTP.Player = Player; GTP.Vehicle = Vehicle;
  GTP.Projectile = Projectile; GTP.Pickup = Pickup;

  // ----------------------------------------------------------- Entities ----
  var scratch = [];
  var Entities = GTP.Entities = {
    list: [],
    hash: new GTP.SpatialHash(128),
    add: function (e) {
      if (!e || e._inList) return e;
      e._inList = true;
      Entities.list.push(e);
      Entities.hash.insert(e);
      return e;
    },
    remove: function (e) {
      if (!e || !e._inList) return;
      e._inList = false;
      var i = Entities.list.indexOf(e);
      if (i >= 0) Entities.list.splice(i, 1);
      Entities.hash.remove(e);
    },
    byKind: function (kind) {
      var out = [], l = Entities.list;
      for (var i = 0; i < l.length; i++) if (l[i].kind === kind) out.push(l[i]);
      return out;
    },
    near: function (x, y, r, kind) {
      var res = Entities.hash.query(x, y, r, scratch), out = [];
      for (var i = 0; i < res.length; i++) if (!kind || res[i].kind === kind) out.push(res[i]);
      return out;
    },
    count: function (kind) { var n = 0, l = Entities.list; for (var i = 0; i < l.length; i++) if (l[i].kind === kind) n++; return n; },
    // true when a vehicle of this class could be placed here without overlapping another vehicle
    vehicleSpaceFree: function (x, y, r) {
      var res = Entities.hash.query(x, y, r + 40, scratch);
      for (var i = 0; i < res.length; i++) { var e = res[i]; if (e.kind === 'vehicle' && U.dist(x, y, e.x, e.y) < r + e.radius) return false; }
      return true;
    },
    clearDynamic: function () {
      var keep = [];
      for (var i = 0; i < Entities.list.length; i++) {
        var e = Entities.list[i];
        if (e.kind === 'player') { e.vehicle = null; e.inVehicle = null; e.seat = -1; keep.push(e); } else { e._inList = false; }
      }
      Entities.list = keep;
      Entities.hash.clear();
      for (var j = 0; j < keep.length; j++) Entities.hash.insert(keep[j]);
    },
    // Advance every entity one step, then drop the dead and the far away. Game calls this.
    update: function (dt) {
      var l = Entities.list, i, e;
      for (i = 0; i < l.length; i++) { e = l[i]; e._px = e.x; e._py = e.y; e._pa = e.angle; }
      for (i = 0; i < l.length; i++) {
        e = l[i];
        try { e.update(dt); } catch (err) { U.reportError(err, 'entity:' + e.kind); }
        Entities.hash.update(e);
      }
      var p = player(), far = (C.ACTIVE_RADIUS + 160) * (C.ACTIVE_RADIUS + 160);
      for (i = l.length - 1; i >= 0; i--) {
        e = l[i];
        if (!e || e.kind === 'player') continue;
        var drop = false;
        if (!e.alive) {
          if (e.kind === 'ped') drop = e.removeWhenDead === true || e.deadTimer > PH.corpseSeconds;
          else if (e.kind === 'vehicle') drop = e.wreck && e.wreckTimer > PH.wreckSeconds && !e.persistent;
          else drop = e.removeWhenDead !== false;
        }
        if (!drop && !e.persistent && p && !e.inVehicle) {
          var dx = e.x - p.x, dy = e.y - p.y;
          if (dx * dx + dy * dy > far && !(e.kind === 'vehicle' && e.hasPlayer())) drop = true;
        }
        if (!drop) continue;
        if (e.kind === 'vehicle') {
          var occ = e.occupants();
          for (var k = 0; k < occ.length; k++) { if (occ[k].kind === 'player') { e.exit(occ[k]); continue; } occ[k].inVehicle = null; Entities.remove(occ[k]); }
        }
        Entities.remove(e);
      }
    }
  };
  void Entities;
})();
