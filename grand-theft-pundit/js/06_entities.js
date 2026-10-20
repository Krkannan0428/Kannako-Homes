/* Grand Theft Pundit: 06_entities.js
 * GTP.Entity base + Ped, Vehicle, Player, Projectile, Pickup and GTP.Entities
 * (list, spatial hash, update, sync, despawn). All physics is custom arcade:
 *
 *   Peds      capsule on XZ, gravity on Y, World.heightAt floor, resolveCapsule walls,
 *             step-up 0.5, jump 1.1, separation, knockdown (lie flat, slide, get up),
 *             swimming at the water surface with climb-out at low shores.
 *   Vehicles  bicycle model: throttle / brake / reverse, steering limited by speed,
 *             lateral slip bled by grip (driftGrip on the handbrake), drag, rolling
 *             resistance, four wheel height samples (pitch, roll, ramps, the Loop),
 *             gravity when airborne, oriented-box corners vs buildings/props/barriers
 *             with push-out + restitution + spin + damage, vehicle-vehicle circle
 *             impulses by mass, vehicle-ped knockdown, water sinking, hp 0 ->
 *             smoke -> fire -> explosion (area damage) -> wreck.
 *
 * Driver inputs (set by Player.control or the AI): v.throttle (-1..1), v.brake (0..1),
 * v.steer (-1..1, +1 = right), v.handbrake (bool); or v.setControls(throttle, steer, hb, brake).
 * Ped inputs: ped.intent = {x, z, run} (world-space move direction, length <= 1), ped.wantJump,
 * ped.moveTo(x, z, run), ped.enterVehicle(v, seat), ped.exitVehicle().
 *
 * Vehicle local frame: forward = GTP.util.yawToDir(yaw), right = (-f.z, f.x).
 * doorPoints / wheelOffsets from GTP.Assets.vehicleGeometry are {x: right, z: forward} metres.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util;
  var nextId = 1;
  var WATER_Y = C.WATER_Y;
  var scratch = [], scratch2 = [];

  function W() { return GTP.World; }
  function fx(o) { if (GTP.Render && GTP.Render.fx) { try { GTP.Render.fx.add(o); } catch (e) { /* fx are optional */ } } }
  function sfx(name, x, z, gain) { if (GTP.Audio && GTP.Audio.play) { try { GTP.Audio.play(name, { x: x, z: z, gain: gain }); } catch (e) { /* audio is optional */ } } }
  function shake(a) { if (GTP.Render && GTP.Render.rig) GTP.Render.rig.shake(a); }
  function player() { return GTP.game ? GTP.game.player : null; }
  function isWaterTile(x, z) { var Wd = W(), t = Wd.tileAt(x, z); return t === Wd.T.WATER || t === Wd.T.VOID; }
  // mesh distance cull against the camera (fog hides the pop; keeps draw calls bounded in a full city)
  function tooFar(e, limit) {
    var cam = GTP.Render && GTP.Render.camera; if (!cam || !limit) return false;
    var dx = e.x - cam.position.x, dz = e.z - cam.position.z;
    return dx * dx + dz * dz > limit * limit;
  }

  // ================================================================== Entity ==
  class Entity {
    constructor(o) {
      o = o || {};
      this.id = nextId++;
      this.kind = o.kind || 'entity';
      this.x = o.x || 0; this.y = o.y || 0; this.z = o.z || 0;
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.yaw = o.yaw || 0;
      this.radius = o.radius || 0.4; this.height = o.height || 1.8;
      this.maxHp = o.hp || 100; this.hp = this.maxHp;
      this.alive = true; this.age = 0; this.persistent = !!o.persistent; this.tag = o.tag || null;
      this.mesh = null;
      this.removed = false;
      this._px = this.x; this._py = this.y; this._pz = this.z; this._pyaw = this.yaw;
    }
    update(dt) { this.age += dt; }
    // interpolated transform for the renderer
    syncMesh(alpha) {
      var m = this.mesh; if (!m) return;
      var a = alpha == null ? 1 : alpha;
      m.position.set(this._px + (this.x - this._px) * a, this._py + (this.y - this._py) * a, this._pz + (this.z - this._pz) * a);
      m.rotation.y = this._pyaw + U.wrapAngle(this.yaw - this._pyaw) * a;
    }
    // no interpolation on the next frame (teleport, respawn)
    snap() { this._px = this.x; this._py = this.y; this._pz = this.z; this._pyaw = this.yaw; }
    onDeath() { }
    destroy() { this.alive = false; this.removed = true; }
    speed2d() { return Math.sqrt(this.vx * this.vx + this.vz * this.vz); }
  }

  // ===================================================================== Ped ==
  class Ped extends Entity {
    constructor(o) {
      o = o || {}; o.kind = o.kind || 'ped'; o.hp = o.hp || C.PED.hp; o.radius = C.PED.radius; o.height = C.PED.height;
      super(o);
      this.look = o.look || null; this.role = o.role || (this.look && this.look.role) || 'civ';
      this.state = 'idle'; this.target = null; this.path = null;
      this.inVehicle = null; this.seat = -1; this.weapon = o.weapon || 'fist';
      this.onGround = true; this.knockedDown = false; this.downT = 0; this.animTime = 0; this.animPhase = 0;
      this.intent = { x: 0, z: 0, run: false };
      this.wantJump = false; this.aiming = false; this.aimYaw = 0;
      this.swimming = false; this.speed = 0; this.moveYaw = this.yaw;
      this.entering = null; this.exitLock = 0; this.corpseT = 0; this.deadT = 0;
      this.line = null; this.lineTime = 0; this.godMode = false; this.tilt = 0;
      this.lastHitBy = null; this.stats = this.stats || {};
      this.firePoseT = 0; this.punchT = 0;   // Combat: arm raised after a shot / a punch swing
      if (this.look && this.look.scale) this.height = C.PED.height * this.look.scale;
    }
    speakLine(text) { this.line = String(text); this.lineTime = 3; }
    isDown() { return !this.alive || this.knockedDown; }
    walkSpeed() { return this.kind === 'player' ? C.PLAYER.walk : C.PED.walk; }
    runSpeed() { return this.kind === 'player' ? C.PLAYER.run : C.PED.run; }
    moveTo(x, z, run) {
      var dx = x - this.x, dz = z - this.z, l = Math.sqrt(dx * dx + dz * dz);
      if (l < 0.05) { this.intent.x = 0; this.intent.z = 0; return 0; }
      this.intent.x = dx / l; this.intent.z = dz / l; this.intent.run = !!run;
      return l;
    }
    stop() { this.intent.x = 0; this.intent.z = 0; this.intent.run = false; }

    // damage path used by vehicles, explosions and (via Combat.damage) weapons
    applyDamage(n, src, type) {
      if (!this.alive || n <= 0) return 0;
      if (this.godMode) return 0;
      if (this.armor > 0) { var a = Math.min(this.armor, n * 0.7); this.armor -= a; n -= a; }
      this.hp -= n;
      this.lastHitBy = src || null; this.lastHitType = type || null; this.hurtT = 0.25;
      GTP.Events.emit('damage', { target: this, amount: n, src: src || null, type: type || null });
      if (this.hp <= 0) { this.hp = 0; this.die(src, type); }
      return n;
    }
    die(src, type) {
      if (!this.alive) return;
      this.alive = false; this.state = 'dead'; this.deadT = 0; this.corpseT = 0;
      this.intent.x = this.intent.z = 0; this.knockedDown = true;
      if (this.inVehicle) { var v = this.inVehicle; v.exit(this); }
      GTP.Events.emit('ped:dead', { ped: this, src: src || null, type: type || null });
      try { this.onDeath(src, type); } catch (e) { U.reportError(e, 'onDeath'); }
    }
    // knocked flat by a car, a hottake or a blast; slides, gets up after C.PED.getUp
    knockDown(ix, iz, dmg, src, type) {
      if (this.inVehicle) return;
      this.knockedDown = true; this.downT = C.PED.getUp; this.state = 'knockdown';
      this.vx = ix || 0; this.vz = iz || 0; this.vy = Math.max(this.vy, 2.2); this.onGround = false; this.swimming = false;
      this.intent.x = this.intent.z = 0; this.entering = null;
      if (dmg > 0) this.applyDamage(dmg, src, type || 'vehicle');
      if (this.kind === 'player') this.stats.knockdowns = (this.stats.knockdowns || 0) + 1;
      sfx('hit', this.x, this.z, 0.6);
    }

    // ------------------------------------------------------------ vehicles --
    nearestVehicle(range) {
      range = range == null ? C.PLAYER.enterRange : range;
      var list = GTP.Entities.hash.query(this.x, this.z, range + 6, scratch), best = null, bestD = range;
      for (var i = 0; i < list.length; i++) {
        var v = list[i];
        if (v.kind !== 'vehicle' || v.wreck || v.sinking || v.locked || v.burning) continue;
        var d = v.doorDistance(this.x, this.z);
        if (d <= bestD) { bestD = d; best = v; }
      }
      return best;
    }
    // starts the door walk; the seat is taken after C.PHYS.enterWalk seconds
    enterVehicle(v, seat) {
      if (!v || v.wreck || v.sinking || this.inVehicle || !this.alive || this.knockedDown) return false;
      if (seat == null) seat = 0;
      if (seat === 0 && v.driver && v.driver !== this) {
        // carjack: the driver is pulled out and flees
        var d = v.driver; v.exit(d);
        d.state = 'flee'; d.fleeFrom = this; d.fleeTimer = 6; d.lastHitBy = this;
        if (this.kind === 'player') {
          this.stats.vehiclesStolen = (this.stats.vehiclesStolen || 0) + 1;
          if (GTP.AI && GTP.AI.wanted && GTP.AI.wanted.addHeat) { try { GTP.AI.wanted.addHeat(C.WANTED.heat.stealOccupied, 'stealOccupied'); } catch (e) { /* ai is optional */ } }
        }
      }
      if (seat !== 0 && v.passengers.length >= v.cls.seats - 1) return false;
      var door = v.doorWorld(seat === 0 ? 0 : 1);
      this.entering = { v: v, seat: seat, t: 0, x: door.x, z: door.z };
      this.state = 'entering';
      return true;
    }
    exitVehicle() {
      var v = this.inVehicle; if (!v) return false;
      return v.exit(this);
    }
    _finishEnter() {
      var en = this.entering; this.entering = null;
      if (!en || !en.v || en.v.removed || en.v.wreck || en.v.sinking) { this.state = 'idle'; return false; }
      if (!en.v.enter(this, en.seat)) { this.state = 'idle'; return false; }
      sfx('enter', this.x, this.z, 0.7);
      return true;
    }

    // --------------------------------------------------------------- update --
    update(dt) {
      this.age += dt;
      if (this.hurtT > 0) this.hurtT -= dt;
      if (this.firePoseT > 0) this.firePoseT -= dt;
      if (this.punchT > 0) this.punchT -= dt;
      if (this.lineTime > 0) { this.lineTime -= dt; if (this.lineTime <= 0) this.line = null; }
      if (this.exitLock > 0) this.exitLock -= dt;
      // body tilt for the mesh: face down when knocked flat or dead, prone when swimming
      var tiltTarget = this.inVehicle ? 0 : (this.knockedDown || !this.alive) ? -Math.PI / 2 : (this.swimming ? -(Math.PI / 2 - 0.22) : 0);
      this.tilt = U.damp(this.tilt, tiltTarget, 9, dt);
      if (this.inVehicle) {
        // the vehicle moves us; keep the hash and the interpolation in step
        var v = this.inVehicle;
        this.x = v.x; this.y = v.y; this.z = v.z; this.yaw = v.yaw; this.vx = v.vx; this.vz = v.vz; this.vy = v.vy;
        this.onGround = true; this.knockedDown = false; this.swimming = false; this.speed = Math.abs(v.speed);
        this.state = 'seated';
        if (!this.alive) { this.corpseT += dt; if (this.corpseT > C.PHYS.corpseSeconds && !this.persistent) this.destroy(); }
        return;
      }
      if (!this.alive) { this._corpse(dt); return; }
      if (this.knockedDown) { this._down(dt); return; }
      if (this.entering) {
        var en = this.entering; en.t += dt;
        var dd = this.moveTo(en.x, en.z, true);
        if (en.v.removed || en.v.wreck || en.v.sinking) { this.entering = null; this.state = 'idle'; this.stop(); }
        else if (dd < 0.35 || en.t >= C.PHYS.enterWalk || en.v.speed2d() > 3) { this.stop(); this._finishEnter(); return; }
      }
      if (this.swimming) { this._swim(dt); return; }
      this._walk(dt);
    }

    _walk(dt) {
      var Wd = W(), P = this.kind === 'player' ? C.PLAYER : C.PED;
      var ix = this.intent.x, iz = this.intent.z, l = Math.sqrt(ix * ix + iz * iz);
      if (l > 1) { ix /= l; iz /= l; l = 1; }
      var target = l > 0.01 ? (this.intent.run ? this.runSpeed() : this.walkSpeed()) * l : 0;
      var tvx = l > 0.01 ? ix / l * target : 0, tvz = l > 0.01 ? iz / l * target : 0;
      var accel = this.onGround ? P.accel / 2 : P.accel / 8;
      this.vx = U.damp(this.vx, tvx, accel, dt); this.vz = U.damp(this.vz, tvz, accel, dt);
      // facing: toward movement, or toward the aim direction while aiming / shooting / punching (strafe)
      if (this.aiming || this.firePoseT > 0 || this.punchT > 0) this.yaw = U.wrapAngle(U.angleDamp(this.yaw, this.aimYaw, 18, dt));
      else if (l > 0.01) { this.moveYaw = U.dirToYaw(ix, iz); this.yaw = U.wrapAngle(U.angleDamp(this.yaw, this.moveYaw, 14, dt)); }
      // jump
      if (this.wantJump && this.onGround) {
        this.vy = Math.sqrt(2 * C.PHYS.gravity * P.jump); this.onGround = false; this.state = 'jump'; this.animPhase = 0;
        sfx('jump', this.x, this.z, 0.4);
      }
      this.wantJump = false;
      if (!this.onGround) this.vy -= C.PHYS.gravity * dt;
      var nx = this.x + this.vx * dt, nz = this.z + this.vz * dt, ny = this.y + this.vy * dt;
      // step-up: a ledge taller than stepUp is a wall
      var gNew = Wd.heightAt(nx, nz, this.y), lim = this.y + P.stepUp + 0.05;
      if (gNew > lim && this.onGround) {
        var gx = Wd.heightAt(nx, this.z, this.y), gz = Wd.heightAt(this.x, nz, this.y);
        if (gx <= lim) { nz = this.z; this.vz = 0; } else if (gz <= lim) { nx = this.x; this.vx = 0; } else { nx = this.x; nz = this.z; this.vx = this.vz = 0; }
      }
      var r = Wd.resolveCapsule(nx, nz, this.y, this.radius);
      this.x = r.x; this.z = r.z;
      if (r.hitX) this.vx = 0; if (r.hitZ) this.vz = 0;
      this._pushOutOfVehicles();
      this._separate(dt);
      // floor
      var ground = Wd.heightAt(this.x, this.z, this.onGround ? this.y : ny);
      if (this.onGround) {
        this.y = U.damp(this.y, ground, 30, dt);
        if (Math.abs(this.y - ground) < 0.02) this.y = ground;
        if (ground < this.y - 0.6) { this.onGround = false; this.vy = 0; }
      } else {
        this.y = ny;
        if (this.vy <= 0 && this.y <= ground) {
          this.y = ground; this.vy = 0; this.onGround = true;
          sfx('land', this.x, this.z, 0.3);
        }
      }
      // water
      if (isWaterTile(this.x, this.z) && this.y <= WATER_Y + 0.45) { this._startSwim(); return; }
      this.speed = this.speed2d();
      this.state = !this.onGround ? 'jump' : this.speed > 0.2 ? (this.speed > this.walkSpeed() + 0.8 ? 'run' : 'walk') : (this.aiming ? 'aim' : 'idle');
      if (this.state === 'walk' || this.state === 'run') this.animPhase += dt * (3.0 + this.speed * 1.7);
      else this.animPhase = U.damp(this.animPhase, Math.round(this.animPhase / Math.PI) * Math.PI, 8, dt);
      this.animTime += dt;
    }

    _startSwim() {
      if (this.swimming) return;
      this.swimming = true; this.onGround = false; this.vy = 0; this.y = WATER_Y + 0.25; this.state = 'swim';
      this.vx *= 0.3; this.vz *= 0.3;
      fx({ type: 'puff', x: this.x, y: WATER_Y + 0.2, z: this.z, color: 0xbfe8f4, size: 1.6, life: 0.7, vy: 0.6 });
      sfx('land', this.x, this.z, 0.5);
    }
    _swim(dt) {
      var Wd = W(), ix = this.intent.x, iz = this.intent.z, l = Math.sqrt(ix * ix + iz * iz);
      if (l > 1) { ix /= l; iz /= l; l = 1; }
      var sp = this.intent.run ? C.PHYS.swimRun : C.PHYS.swim;
      this.vx = U.damp(this.vx, l > 0.01 ? ix * sp : 0, 4, dt); this.vz = U.damp(this.vz, l > 0.01 ? iz * sp : 0, 4, dt);
      if (l > 0.01) this.yaw = U.angleDamp(this.yaw, U.dirToYaw(ix, iz), 6, dt);
      var nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
      var r = Wd.resolveCapsule(nx, nz, this.y, this.radius);
      nx = r.x; nz = r.z;
      var g = Wd.heightAt(nx, nz, this.y + 1);
      if (!isWaterTile(nx, nz) && g > WATER_Y + 0.05) {
        if (g <= WATER_Y + C.PHYS.climbOut) {
          // climb out onto a low shore (sand, piers, sidewalks)
          this.x = nx; this.z = nz; this.y = g; this.swimming = false; this.onGround = true; this.vy = 0; this.state = 'idle';
          fx({ type: 'puff', x: this.x, y: g + 0.1, z: this.z, color: 0xbfe8f4, size: 1.0, life: 0.5 });
          return;
        }
        // a sea wall too tall to climb
        this.vx = this.vz = 0;
      } else { this.x = nx; this.z = nz; }
      this.y = WATER_Y + 0.25 + Math.sin(this.age * 2.2) * 0.04;
      this.speed = this.speed2d();
      this.animPhase += dt * (2.5 + this.speed * 1.5);
      this.animTime += dt; this.state = 'swim';
      this.wantJump = false;
    }
    // lying flat after a hit: gravity, friction slide, get up when the timer ends
    _down(dt) {
      var Wd = W();
      this.downT -= dt;
      this.vx *= Math.exp(-4 * dt); this.vz *= Math.exp(-4 * dt);
      if (!this.onGround) this.vy -= C.PHYS.gravity * dt;
      var nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
      var r = Wd.resolveCapsule(nx, nz, this.y, this.radius);
      this.x = r.x; this.z = r.z;
      var ground = Wd.heightAt(this.x, this.z, this.y + 0.5);
      if (!this.onGround) { this.y += this.vy * dt; if (this.vy <= 0 && this.y <= ground) { this.y = ground; this.vy = 0; this.onGround = true; } }
      else { this.y = ground; if (ground < this.y - 0.6) this.onGround = false; }
      if (isWaterTile(this.x, this.z) && this.y <= WATER_Y + 0.45) { this.knockedDown = false; this.downT = 0; this._startSwim(); return; }
      this.animTime += dt;
      if (this.downT <= 0 && this.onGround) { this.knockedDown = false; this.state = 'idle'; this.animPhase = 0; }
      this.speed = this.speed2d();
    }
    _corpse(dt) {
      this._down(dt);
      this.knockedDown = true; this.state = 'dead';
      this.deadT += dt; this.corpseT += dt;
      if (this.corpseT > C.PHYS.corpseSeconds && !this.persistent) this.destroy();
    }
    // slow or parked vehicles are walls for peds (moving ones knock peds down in Vehicle.update)
    _pushOutOfVehicles() {
      var list = GTP.Entities.hash.query(this.x, this.z, this.radius + 6, scratch2);
      for (var i = 0; i < list.length; i++) {
        var v = list[i];
        if (v.kind !== 'vehicle' || v.removed) continue;
        if (Math.abs(v.y - this.y) > 2.5) continue;
        var p = v.pushCircle(this.x, this.z, this.radius);
        if (!p) continue;
        this.x += p.px; this.z += p.pz;
        var vn = this.vx * p.nx + this.vz * p.nz;
        if (vn < 0) { this.vx -= vn * p.nx; this.vz -= vn * p.nz; }
      }
    }
    _separate(dt) {
      var list = GTP.Entities.hash.query(this.x, this.z, 1.2, scratch2), sep = C.PHYS.pedSeparation;
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o === this || (o.kind !== 'ped' && o.kind !== 'player') || o.inVehicle || !o.alive || o.knockedDown) continue;
        if (Math.abs(o.y - this.y) > 1.2) continue;
        var dx = this.x - o.x, dz = this.z - o.z, d2 = dx * dx + dz * dz;
        if (d2 >= sep * sep || d2 < 1e-6) continue;
        var d = Math.sqrt(d2), push = (sep - d) * 0.5 * Math.min(1, dt * 12);
        this.x += dx / d * push; this.z += dz / d * push;
      }
    }

    // --------------------------------------------------------------- mesh --
    syncMesh(alpha) {
      var m = this.mesh; if (!m) return;
      var a = alpha == null ? 1 : alpha;
      if (this.inVehicle) { this._syncRider(m, a); return; }
      var firstPerson = this.kind === 'player' && this.cameraMode === 'first';
      m.visible = !firstPerson && !this.removed && !tooFar(this, C.QUALITY.pedDraw);
      if (!m.visible) return;
      var x = this._px + (this.x - this._px) * a, y = this._py + (this.y - this._py) * a, z = this._pz + (this.z - this._pz) * a;
      var yaw = this._pyaw + U.wrapAngle(this.yaw - this._pyaw) * a;
      var parts = this._parts || (this._parts = {
        legL: m.getObjectByName('legL'), legR: m.getObjectByName('legR'), armL: m.getObjectByName('armL'), armR: m.getObjectByName('armR'),
        torso: m.getObjectByName('torso'), head: m.getObjectByName('head'), body: m.getObjectByName('body') || m
      });
      var b = parts.body, lean = 0, bob = 0, sw, sA, sL;
      var lying = this.knockedDown || !this.alive;
      var t = this.tilt;
      if (lying) { y += 0.16 * Math.abs(Math.sin(t)); }
      else if (this.swimming) { y -= 0.12; }
      if (parts.legL) {
        if (lying) { sL = 0.05; sA = 0.15; sw = 0; }
        else if (this.swimming) { sL = Math.sin(this.animPhase * 2) * 0.35; sA = 0; sw = 0; }
        else if (!this.onGround) { sL = 0; sA = 0; sw = 0; }
        else {
          var amp = this.state === 'run' ? 1.05 : 0.7, k = Math.min(1, this.speed / 1.2);
          sw = Math.sin(this.animPhase) * amp * k; sL = sw; sA = -sw * (this.state === 'run' ? 0.9 : 0.7);
          lean = this.state === 'run' ? 0.14 : 0;
          bob = Math.abs(Math.cos(this.animPhase)) * (this.state === 'run' ? 0.05 : 0.02) * k;
        }
        if (this.swimming) {
          var ph = this.animPhase * 1.6;
          parts.armL.rotation.x = Math.PI + Math.sin(ph) * 1.2; parts.armR.rotation.x = Math.PI + Math.sin(ph + Math.PI) * 1.2;
          parts.armL.rotation.z = 0.3; parts.armR.rotation.z = -0.3;
          parts.legL.rotation.x = sL; parts.legR.rotation.x = -sL;
        } else if (!this.onGround && !lying) {
          parts.legL.rotation.x = 0.55; parts.legR.rotation.x = -0.35;
          parts.armL.rotation.x = -0.9; parts.armR.rotation.x = -0.9; parts.armL.rotation.z = 0.5; parts.armR.rotation.z = -0.5;
        } else if (this.punchT > 0 && !lying) {
          // a jab: the right arm snaps forward and comes back
          var pk = Math.sin(Math.PI * Math.max(0, 1 - this.punchT / 0.28));
          parts.legL.rotation.x = sL * 0.6; parts.legR.rotation.x = -sL * 0.6;
          parts.armR.rotation.x = 0.4 + 1.3 * pk; parts.armR.rotation.z = -0.1; parts.armL.rotation.x = 0.9 - 0.5 * pk; parts.armL.rotation.z = 0.25;
        } else if ((this.aiming || this.firePoseT > 0) && !lying) {
          // positive rotation.x swings a limb forward (the figure faces -z)
          parts.legL.rotation.x = sL * 0.6; parts.legR.rotation.x = -sL * 0.6;
          parts.armR.rotation.x = 1.45; parts.armR.rotation.z = 0; parts.armL.rotation.x = 1.1; parts.armL.rotation.z = 0.35;
        } else {
          parts.legL.rotation.x = sL; parts.legR.rotation.x = -sL;
          parts.armL.rotation.x = sA; parts.armR.rotation.x = -sA;
          parts.armL.rotation.z = 0.08; parts.armR.rotation.z = -0.08;
          if (this.state === 'idle' || lying) {
            var breathe = Math.sin(this.animTime * 1.8) * 0.03;
            parts.armL.rotation.x = breathe; parts.armR.rotation.x = -breathe;
          }
        }
        if (parts.torso) parts.torso.rotation.x = -lean;   // lean forward (negative pitches the torso toward -z)
        if (parts.head) parts.head.rotation.x = lean * 0.6;
      }
      m.position.set(x, y + bob, z);
      m.rotation.set(t, yaw, 0, 'YXZ');
      void b;
    }
    // inside a car the body is hidden; on a scooter the rider sits on the saddle, feet on the board, hands on the bars
    _syncRider(m, a) {
      var v = this.inVehicle;
      var rider = v.type === 'bike' && !v.wreck && !v.sinking && this.seat === 0;
      var firstPerson = this.kind === 'player' && this.cameraMode === 'first';
      if (!rider || firstPerson || this.removed || tooFar(this, C.QUALITY.pedDraw)) { m.visible = false; return; }
      m.visible = true;
      var parts = this._parts || (this._parts = {
        legL: m.getObjectByName('legL'), legR: m.getObjectByName('legR'), armL: m.getObjectByName('armL'), armR: m.getObjectByName('armR'),
        torso: m.getObjectByName('torso'), head: m.getObjectByName('head'), body: m.getObjectByName('body') || m
      });
      var vx = v._px + (v.x - v._px) * a, vy = v._py + (v.y - v._py) * a, vz = v._pz + (v.z - v._pz) * a;
      var yaw = v._pyaw + U.wrapAngle(v.yaw - v._pyaw) * a, f = U.yawToDir(yaw);
      // the saddle sits 0.86 m up and 0.3 m behind the bike's centre; the hips are 0.84 m above the feet
      m.position.set(vx - f.x * 0.3, vy + 0.03, vz - f.z * 0.3);
      m.rotation.set(0, yaw, 0, 'YXZ');
      if (parts.legL) {
        parts.legL.rotation.x = 1.0; parts.legR.rotation.x = 1.0;
        parts.armL.rotation.x = 1.1; parts.armR.rotation.x = 1.1; parts.armL.rotation.z = 0.12; parts.armR.rotation.z = -0.12;
        if (parts.torso) parts.torso.rotation.x = -0.3;
        if (parts.head) parts.head.rotation.x = 0.2;
      }
    }
  }

  // ================================================================= Vehicle ==
  var COLL_CACHE = {};
  var KNOCKABLE = { lamp: 1, hydrant: 1, bin: 1, bench: 1, table: 1 };
  function collPoints(type, cls) {
    var c = COLL_CACHE[type]; if (c) return c;
    var hw = cls.width / 2, hl = cls.length / 2, r = Math.min(0.32, hw * 0.45);
    var n = Math.max(2, Math.round(cls.length / 2.6)), pts = [];
    for (var i = 0; i < n; i++) {
      var f = -(hl - r) + (2 * (hl - r)) * (n === 1 ? 0.5 : i / (n - 1));
      pts.push({ r: -(hw - r), f: f, rad: r }); pts.push({ r: hw - r, f: f, rad: r });
    }
    c = COLL_CACHE[type] = { pts: pts, circles: [{ f: hl - hw, rad: hw + 0.05 }, { f: -(hl - hw), rad: hw + 0.05 }] };
    if (cls.length / cls.width > 3) c.circles.splice(1, 0, { f: 0, rad: hw + 0.05 });
    return c;
  }

  class Vehicle extends Entity {
    constructor(o) {
      o = o || {}; o.kind = 'vehicle';
      var type = o.type || 'sedan', spec = C.VEHICLES[type] || C.VEHICLES.sedan;
      if (!C.VEHICLES[type]) type = 'sedan';
      o.hp = o.hp || spec.hp;
      super(o);
      this.type = type; this.cls = spec; this.mass = spec.mass;
      this.speed = 0; this.lateral = 0; this.steer = 0; this.throttle = 0; this.brake = 0; this.handbrake = false;
      this.yawRate = 0; this.angVel = 0; this.pitch = 0; this.roll = 0;
      this.driver = null; this.passengers = [];
      this.color = o.color || GTP.rng.pick(spec.colors); this.wrap = o.wrap || null; this.locked = !!o.locked;
      this.damage = 0; this.isPolice = type === 'cop'; this.siren = false;
      this.wheelSpin = 0; this.wheelSteer = 0; this.lights = false; this.braking = false; this.reversing = false; this.reverseTime = 0;
      this.onGround = true; this.burning = false; this.burnT = 0; this.exploded = false; this.wreck = false; this.wreckT = 0;
      this.sinking = false; this.sinkT = 0; this.offroad = false; this.honkT = 0; this.lastCollision = -10; this.lastImpact = 0;
      this.radius = Math.max(spec.length, spec.width) / 2 + 0.2; this.height = spec.height;
      this._coll = collPoints(type, spec);
      this._smokeT = 0; this._fireT = 0; this._skidT = 0; this._dustT = 0; this._sparkT = 0;
      this.wheelY = [0, 0, 0, 0];
    }
    get hl() { return this.cls.length / 2; }
    get hw() { return this.cls.width / 2; }
    forward() { return U.yawToDir(this.yaw); }
    // local (right, forward) -> world
    localToWorld(lr, lf) { var f = U.yawToDir(this.yaw); return { x: this.x + (-f.z) * lr + f.x * lf, z: this.z + f.x * lr + f.z * lf }; }
    worldToLocal(x, z) { var f = U.yawToDir(this.yaw), dx = x - this.x, dz = z - this.z; return { r: dx * (-f.z) + dz * f.x, f: dx * f.x + dz * f.z }; }
    occupants() { var o = []; if (this.driver) o.push(this.driver); for (var i = 0; i < this.passengers.length; i++) o.push(this.passengers[i]); return o; }
    hasPlayer() { var p = player(); return !!p && p.inVehicle === this; }
    setControls(throttle, steer, handbrake, brake) { this.throttle = throttle || 0; this.steer = steer || 0; this.handbrake = !!handbrake; this.brake = brake || 0; }
    honk() { if (this.honkT <= 0) { this.honkT = 0.6; sfx('horn', this.x, this.z, 0.8); GTP.Events.emit('honk', { vehicle: this }); } }

    // door points in world space: 0 = driver (left), 1 = passenger (right), 2 = rear
    doorWorld(i) {
      var side = i === 1 ? 1 : -1;
      if (i === 2) return this.localToWorld(0, -(this.hl + 0.8));
      return this.localToWorld(side * (this.hw + 0.7), this.hl * 0.15);
    }
    // distance from a point to the nearest door point or body edge (whichever is closer)
    doorDistance(px, pz) {
      var a = this.doorWorld(0), b = this.doorWorld(1);
      return Math.min(U.dist2d(px, pz, a.x, a.z), U.dist2d(px, pz, b.x, b.z), this.edgeDistance(px, pz) + 0.4);
    }
    edgeDistance(px, pz) {
      var l = this.worldToLocal(px, pz), dr = Math.max(0, Math.abs(l.r) - this.hw), df = Math.max(0, Math.abs(l.f) - this.hl);
      return Math.sqrt(dr * dr + df * df);
    }
    // circle vs this oriented box: {px, pz, nx, nz, depth} push-out for the circle or null
    pushCircle(cx, cz, r) {
      var l = this.worldToLocal(cx, cz), hw = this.hw + r, hl = this.hl + r;
      if (Math.abs(l.r) >= hw || Math.abs(l.f) >= hl) return null;
      var dr = hw - Math.abs(l.r), df = hl - Math.abs(l.f), f = U.yawToDir(this.yaw), rx = -f.z, rz = f.x, nx, nz, depth;
      if (dr < df) { var s = l.r < 0 ? -1 : 1; nx = rx * s; nz = rz * s; depth = dr; }
      else { var s2 = l.f < 0 ? -1 : 1; nx = f.x * s2; nz = f.z * s2; depth = df; }
      return { px: nx * (depth + 0.01), pz: nz * (depth + 0.01), nx: nx, nz: nz, depth: depth };
    }

    enter(ped, seat) {
      if (!ped || ped.inVehicle || this.wreck || this.sinking) return false;
      if (seat === 0 || seat == null) { if (this.driver && this.driver !== ped) return false; this.driver = ped; ped.seat = 0; }
      else { if (this.passengers.length >= this.cls.seats - 1) return false; this.passengers.push(ped); ped.seat = this.passengers.length; }
      ped.inVehicle = this; ped.entering = null; ped.state = 'seated';
      ped.x = this.x; ped.y = this.y; ped.z = this.z; ped.yaw = this.yaw; ped.vx = ped.vz = ped.vy = 0; ped.snap();
      if (ped.kind === 'player') { ped.vehicle = this; this.lights = true; }
      if (ped._sh) GTP.Entities.hash.update(ped);
      GTP.Events.emit('vehicle:enter', { vehicle: this, ped: ped, seat: ped.seat });
      return true;
    }
    exit(ped) {
      if (!ped || ped.inVehicle !== this) return false;
      if (this.driver === ped) { this.driver = null; this.throttle = 0; this.steer = 0; this.brake = 0; this.handbrake = false; }
      else { var i = this.passengers.indexOf(ped); if (i >= 0) this.passengers.splice(i, 1); }
      ped.inVehicle = null; ped.seat = -1; ped.exitLock = 0.4;
      if (ped.kind === 'player') ped.vehicle = null;
      var spot = this.doorSpot(ped);
      ped.x = spot.x; ped.z = spot.z; ped.y = W().heightAt(spot.x, spot.z, this.y + 0.5);
      if (this.sinking || isWaterTile(ped.x, ped.z)) { ped.y = WATER_Y + 0.25; ped.swimming = true; ped.onGround = false; }
      else { ped.onGround = true; ped.swimming = false; }
      ped.yaw = this.yaw; ped.vx = ped.vz = ped.vy = 0; ped.state = 'idle'; ped.snap();
      if (ped._sh) GTP.Entities.hash.update(ped);
      var sp = this.speed2d();
      if (sp > C.PHYS.bailSpeed && ped.alive) ped.knockDown(this.vx * 0.7, this.vz * 0.7, Math.max(0, (sp - C.PHYS.bailSpeed) * 0.6), this, 'bail');
      sfx('exit', this.x, this.z, 0.6);
      GTP.Events.emit('vehicle:exit', { vehicle: this, ped: ped });
      return true;
    }
    // a free spot beside a door: driver side first, then the other side, then the rear
    doorSpot(ped) {
      var Wd = W(), r = ped ? ped.radius : C.PED.radius, y = this.y + 0.5;
      var cands = [this.doorWorld(0), this.doorWorld(1), this.doorWorld(2), this.localToWorld(0, this.hl + 0.8)];
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i];
        if (Wd.solidAt(c.x, c.z, y)) continue;
        var res = Wd.resolveCapsule(c.x, c.z, y, r), rx = res.x, rz = res.z;
        if (Wd.solidAt(rx, rz, y)) continue;
        // never leave the ped inside another vehicle
        var list = GTP.Entities.hash.query(rx, rz, r + 6, scratch2), blocked = false;
        for (var k = 0; k < list.length; k++) if (list[k] !== this && list[k].kind === 'vehicle' && list[k].pushCircle(rx, rz, r)) { blocked = true; break; }
        if (blocked) continue;
        return { x: rx, z: rz, side: i };
      }
      var f = Wd.resolveCapsule(this.x, this.z, y, r);
      return { x: f.x, z: f.z, side: -1 };
    }

    applyDamage(n, src, type) {
      if (!(n > 0) || this.wreck || this.sinking) return;
      this.hp -= n; this.damage += n; this.lastDamageSrc = src || null;
      GTP.Events.emit('vehicle:damage', { vehicle: this, amount: n, src: src || null, type: type || null });
      if (this.hp <= 0 && !this.burning) this.ignite(src);
    }
    ignite(src) {
      if (this.burning || this.wreck) return;
      this.burning = true; this.burnT = 0; this.hp = Math.min(this.hp, 0); this.lastDamageSrc = src || this.lastDamageSrc;
      sfx('crash', this.x, this.z, 0.6);
    }
    explode(src) {
      if (this.exploded) return;
      src = src || this.lastDamageSrc;
      this.exploded = true; this.burning = false; this.wreck = true; this.wreckT = 0; this.hp = 0; this.lights = false; this.siren = false;
      var R = GTP.rng, x = this.x, y = this.y + 0.6, z = this.z, i;
      fx({ type: 'explosion', x: x, y: y + 0.4, z: z, size: 7, life: 0.8 });
      fx({ type: 'ring', x: x, y: this.y + 0.25, z: z, size: C.PHYS.explodeRadius, life: 0.55 });
      for (i = 0; i < 10; i++) fx({ type: 'fire', x: x + R.range(-1.2, 1.2), y: y + R.range(0, 1), z: z + R.range(-1.2, 1.2), vx: R.range(-3, 3), vy: R.range(2, 7), vz: R.range(-3, 3), size: R.range(1.5, 3), life: R.range(0.5, 1.0) });
      for (i = 0; i < 8; i++) fx({ type: 'smoke', x: x + R.range(-1, 1), y: y + R.range(0.5, 1.5), z: z + R.range(-1, 1), vx: R.range(-1.5, 1.5), vy: R.range(1.5, 3.5), vz: R.range(-1.5, 1.5), size: R.range(2.5, 4), life: R.range(1.5, 2.8) });
      for (i = 0; i < 12; i++) { var a = R.random() * Math.PI * 2, s = R.range(4, 12); fx({ type: 'spark', x: x, y: y, z: z, vx: Math.cos(a) * s, vy: R.range(3, 9), vz: Math.sin(a) * s, life: R.range(0.3, 0.7), size: 0.5 }); }
      fx({ type: 'decal', x: x, y: W().heightAt(x, z, this.y) , z: z, size: 5, size2: 5, life: 60, color: 0x16140f });
      sfx('explode', x, z, 1);
      var pl = player();
      if (pl) { var dp = U.dist2d(pl.x, pl.z, x, z); shake(U.clamp(1.4 - dp / 40, 0.2, 1.4)); }
      // occupants bail, knocked down and hurt
      var occ = this.occupants();
      for (i = 0; i < occ.length; i++) {
        var o = occ[i]; this.exit(o);
        var ox = o.x - x, oz = o.z - z, ol = Math.sqrt(ox * ox + oz * oz) || 1;
        o.knockDown(ox / ol * 5, oz / ol * 5, C.PHYS.explodeOccupantDamage, src || this, 'explosion');
      }
      // area damage (the occupants already took theirs)
      var RAD = C.PHYS.explodeRadius, list = GTP.Entities.hash.query(x, z, RAD + 2, scratch);
      for (i = 0; i < list.length; i++) {
        var e = list[i]; if (e === this || e.removed || occ.indexOf(e) >= 0) continue;
        var d = U.dist2d(e.x, e.z, x, z); if (d > RAD) continue;
        var fall = 1 - 0.6 * d / RAD, nx = (e.x - x) / (d || 1), nz = (e.z - z) / (d || 1);
        if (e.kind === 'ped' || e.kind === 'player') { if (!e.inVehicle) e.knockDown(nx * 7 * fall, nz * 7 * fall, C.PHYS.explodePedDamage * fall, src || this, 'explosion'); }
        else if (e.kind === 'vehicle' && !e.wreck) { e.applyDamage(C.PHYS.explodeVehicleDamage * fall, src || this, 'explosion'); e.vx += nx * 4 * fall; e.vz += nz * 4 * fall; }
      }
      this.vy = Math.max(this.vy, 3.5); this.onGround = false; this.angVel += R.range(-1, 1);
      this.throttle = 0; this.brake = 0; this.steer = 0; this.handbrake = false;
      GTP.Events.emit('vehicle:exploded', { vehicle: this, src: src || null });
    }
    startSinking() {
      if (this.sinking) return;
      this.sinking = true; this.sinkT = 0; this.lights = false; this.siren = false; this.onGround = false;
      var occ = this.occupants();
      for (var i = 0; i < occ.length; i++) { var o = occ[i]; this.exit(o); o.y = WATER_Y + 0.25; o.swimming = true; o.onGround = false; }
      for (i = 0; i < 6; i++) fx({ type: 'puff', x: this.x + GTP.rng.range(-1.5, 1.5), y: WATER_Y + 0.2, z: this.z + GTP.rng.range(-1.5, 1.5), color: 0xbfe8f4, size: 2.2, life: 0.9, vy: 1 });
      sfx('land', this.x, this.z, 0.8);
      GTP.Events.emit('vehicle:sunk', { vehicle: this });
    }

    update(dt) {
      this.age += dt;
      if (this.honkT > 0) this.honkT -= dt;
      var Wd = W(), PH = C.PHYS, cls = this.cls;
      if (this.sinking) {
        this.sinkT += dt;
        this.vx *= Math.exp(-2 * dt); this.vz *= Math.exp(-2 * dt);
        this.x += this.vx * dt; this.z += this.vz * dt;
        this.y = U.lerp(WATER_Y - 0.1, WATER_Y - 3.2, U.smoothstep(this.sinkT / PH.sinkSeconds));
        this.pitch = U.damp(this.pitch, 0.35, 1.5, dt); this.speed = 0;
        if (this.sinkT < PH.sinkSeconds && this.age % 0.3 < dt) fx({ type: 'puff', x: this.x, y: WATER_Y + 0.15, z: this.z, color: 0xd8eef5, size: 1.4, life: 0.8, vy: 0.5 });
        if (this.sinkT >= PH.sinkSeconds) this.destroy();
        return;
      }
      if (this.hp <= 0 && !this.burning && !this.wreck) this.ignite();
      if (this.burning) {
        this.burnT += dt; this._burnFx(dt);
        if (this.burnT >= PH.burnSeconds) { this.explode(); return; }
      }
      var driver = this.driver && this.driver.alive && !this.wreck ? this.driver : null;
      var throttle = driver ? U.clamp(this.throttle, -1, 1) : 0;
      var brakeIn = driver ? U.clamp(this.brake, 0, 1) : (this.wreck ? 1 : 0);
      var steerIn = driver ? U.clamp(this.steer, -1, 1) : 0;
      var hb = driver ? !!this.handbrake : false;
      if (this.burning) throttle *= 0.4;
      // frame
      var f = U.yawToDir(this.yaw), rx = -f.z, rz = f.x;
      var vf = this.vx * f.x + this.vz * f.z, vl = this.vx * rx + this.vz * rz;
      var tile = Wd.tileAt(this.x, this.z), T = Wd.T;
      this.offroad = tile === T.GRASS || tile === T.SAND;
      var maxSpeed = cls.maxSpeed * (this.offroad ? PH.offroadSpeed : 1);
      if (this.onGround) {
        if (throttle > 0) {
          if (vf < -0.5) vf = Math.min(0, vf + cls.brake * throttle * dt);
          else { var a = cls.accel * throttle * (1 - PH.accelTaper * U.clamp(vf / maxSpeed, 0, 1)); vf = Math.min(Math.max(vf, maxSpeed), vf + a * dt); }
        } else if (throttle < 0) {
          if (vf > 0.5) vf = Math.max(0, vf + cls.brake * throttle * dt);
          else vf = Math.max(-cls.reverseMax, vf + cls.accel * 0.6 * throttle * dt);
        }
        if (brakeIn > 0) { var bd = cls.brake * brakeIn * dt; vf = Math.abs(vf) <= bd ? 0 : vf - U.sign(vf) * bd; }
        var k = (1 - PH.accelTaper) * cls.accel / (maxSpeed * maxSpeed);
        vf -= k * vf * Math.abs(vf) * dt;
        if (throttle === 0) { var rf = PH.rolling * dt; vf = Math.abs(vf) <= rf ? 0 : vf - U.sign(vf) * rf; }
        if (hb) { var hbd = cls.brake * PH.handbrakeBrake * dt; vf = Math.abs(vf) <= hbd ? 0 : vf - U.sign(vf) * hbd; }
        var grip = (hb ? cls.driftGrip : cls.grip) * (this.offroad ? 0.8 : 1);
        vl *= Math.exp(-grip * PH.gripRate * dt);
        if (Math.abs(vl) < 0.05) vl = 0;
      }
      // steering (bicycle model): yaw rate = v / wheelbase * tan(delta)
      this.steer = U.damp(this.steer, steerIn, PH.steerLerp, dt);
      var spd = Math.abs(vf), falloff = 1 - cls.steerSpeedFalloff * U.clamp(spd / cls.maxSpeed, 0, 1);
      var delta = this.steer * cls.steerMax * falloff, wb = cls.length * 0.6;
      var steerRate = this.onGround ? U.clamp(-vf / wb * Math.tan(delta) * (hb ? 1.15 : 1), -PH.maxYawRate, PH.maxYawRate) : 0;
      this.angVel *= Math.exp(-PH.spinDamp * dt);
      if (Math.abs(this.angVel) < 0.01) this.angVel = 0;
      this.yawRate = steerRate + this.angVel;
      this.yaw = U.wrapAngle(this.yaw + this.yawRate * dt);
      this.wheelSteer = U.damp(this.wheelSteer, -delta, 14, dt);
      // recompose in the old frame: the heading rotated, so the next step sees lateral slip
      this.vx = vf * f.x + vl * rx; this.vz = vf * f.z + vl * rz;
      var x0 = this.x, z0 = this.z;
      this.x += this.vx * dt; this.z += this.vz * dt;
      // vertical: four wheel samples
      var g = this._sampleWheels();
      if (this.onGround) {
        if (g.c < this.y - 0.35) { this.onGround = false; this.vy = 0; }
        else { this.y = Math.abs(g.c - this.y) > 0.4 ? g.c : U.damp(this.y, g.c, 40, dt); if (Math.abs(this.y - g.c) < 0.01) this.y = g.c; }
      }
      if (!this.onGround) {
        this.vy -= PH.gravity * dt; this.y += this.vy * dt;
        if (this.vy <= 0 && this.y <= g.c) {
          var impact = -this.vy; this.y = g.c; this.vy = 0; this.onGround = true;
          if (impact > PH.landDamageSpeed) {
            this.applyDamage((impact - PH.landDamageSpeed) * PH.landDamagePerSpeed, null, 'fall');
            if (this.hasPlayer()) shake(Math.min(1, impact / 15));
          }
          if (impact > 3) { sfx('land', this.x, this.z, 0.6); fx({ type: 'puff', x: this.x, y: this.y + 0.1, z: this.z, size: 1.8, life: 0.5, color: 0xcfc8b8 }); }
        }
      }
      var pt = this.onGround ? g.pitch : U.clamp(this.pitch - this.vy * 0.02, -0.5, 0.5), rl = this.onGround ? g.roll : 0;
      this.pitch = U.damp(this.pitch, pt, 10, dt); this.roll = U.damp(this.roll, rl - this.yawRate * spd * 0.0025, 8, dt);
      // collisions
      this._collideWorld(dt);
      this._collideVehicles();
      this._collidePeds();
      // re-derive the decomposition
      f = U.yawToDir(this.yaw); rx = -f.z; rz = f.x;
      this.speed = this.vx * f.x + this.vz * f.z; this.lateral = this.vx * rx + this.vz * rz;
      if (Math.abs(this.speed) < 0.15 && Math.abs(this.lateral) < 0.15 && !throttle && this.onGround) { this.vx = this.vz = 0; this.speed = 0; this.lateral = 0; }
      this.reversing = this.speed < -0.8;
      this.reverseTime = this.reversing ? this.reverseTime + dt : 0;
      this.braking = !!driver && ((brakeIn > 0 && this.speed > 0.5) || (throttle < 0 && this.speed > 0.5) || (hb && spd > 2));
      this.wheelSpin -= this.speed / cls.wheelRadius * dt;
      // water
      if (isWaterTile(this.x, this.z) && this.y <= WATER_Y + 0.6) { this.startSinking(); this._syncOccupants(); return; }
      this._syncOccupants();
      this._surfaceFx(dt, hb);
      this._damageFx(dt);
      if (this.wreck) { this.wreckT += dt; if (this.wreckT > PH.wreckSeconds && !this.persistent) this.destroy(); }
      void x0; void z0;
    }
    _sampleWheels() {
      var Wd = W(), hw = this.hw * 0.9, hl = this.hl * 0.75, f = U.yawToDir(this.yaw), rx = -f.z, rz = f.x, y = this.y;
      var pts = [[-hw, hl], [hw, hl], [-hw, -hl], [hw, -hl]], h = this.wheelY, mx = -1e9;
      for (var i = 0; i < 4; i++) {
        var px = this.x + rx * pts[i][0] + f.x * pts[i][1], pz = this.z + rz * pts[i][0] + f.z * pts[i][1];
        h[i] = Wd.heightAt(px, pz, y);
        if (h[i] > mx) mx = h[i];
      }
      // a wheel hanging over water or off an edge does not pull the car down
      var sum = 0, n = 0;
      for (i = 0; i < 4; i++) if (h[i] > mx - 1.6) { sum += h[i]; n++; }
      var c = n ? sum / n : mx;
      var hf = (Math.max(h[0], mx - 1.6) + Math.max(h[1], mx - 1.6)) / 2, hr = (Math.max(h[2], mx - 1.6) + Math.max(h[3], mx - 1.6)) / 2;
      var hL = (Math.max(h[0], mx - 1.6) + Math.max(h[2], mx - 1.6)) / 2, hR = (Math.max(h[1], mx - 1.6) + Math.max(h[3], mx - 1.6)) / 2;
      return { c: c, pitch: Math.atan2(hf - hr, 2 * hl), roll: Math.atan2(hR - hL, 2 * hw) };
    }
    _syncOccupants() {
      var occ = this.occupants();
      for (var i = 0; i < occ.length; i++) {
        var o = occ[i];
        o.x = this.x; o.y = this.y; o.z = this.z; o.yaw = this.yaw; o.vx = this.vx; o.vz = this.vz; o.vy = this.vy;
        if (o.kind === 'player') o.stats.distanceDriven = (o.stats.distanceDriven || 0) + this.speed2d() * C.STEP;
        if (o._sh) GTP.Entities.hash.update(o);
      }
    }

    // --- buildings, props, barriers, map edge: oriented box points vs the world ---
    _collideWorld(dt) {
      var Wd = W(), PH = C.PHYS, pts = this._coll.pts, f = U.yawToDir(this.yaw), rx = -f.z, rz = f.x;
      var I = (this.cls.length * this.cls.length + this.cls.width * this.cls.width) / 12;
      var impactMax = 0, ix = 0, iz = 0, inx = 0, inz = 0, hit = false;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], ox = rx * p.r + f.x * p.f, oz = rz * p.r + f.z * p.f;
        var px = this.x + ox, pz = this.z + oz;
        var gy = Math.max(this.y, Wd.heightAt(px, pz, this.y)) + 0.1;
        var res = Wd.resolveCapsule(px, pz, gy, p.rad);
        var dx = res.x - px, dz = res.z - pz, dl = Math.sqrt(dx * dx + dz * dz);
        if (dl < 1e-5) continue;
        // a small prop in the way of the player's car goes over instead of stopping it dead (traffic keeps the posts as kerb bumpers)
        if (res.prop && KNOCKABLE[res.prop.kind] && !res.prop.fallen && this.hasPlayer() && this.speed2d() > PH.knockSpeed && Math.abs(res.prop.y || 0) < 1) {
          this._knockProp(res.prop);
          res = Wd.resolveCapsule(px, pz, gy, p.rad);   // the prop is down: see what else pushed
          dx = res.x - px; dz = res.z - pz; dl = Math.sqrt(dx * dx + dz * dz);
          if (dl < 1e-5) continue;
        }
        hit = true;
        this.x += dx; this.z += dz;
        var nx = dx / dl, nz = dz / dl, vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          var impact = -vn, e = PH.restitution;
          this.vx -= (1 + e) * vn * nx; this.vz -= (1 + e) * vn * nz;
          this.vx *= PH.scrape; this.vz *= PH.scrape;
          var cross = ox * nz - oz * nx;
          this.angVel += cross * impact * PH.spinKick / I;
          if (impact > impactMax) { impactMax = impact; ix = px; iz = pz; inx = nx; inz = nz; }
        }
      }
      if (hit) this.lastCollision = this.age;
      if (impactMax > PH.damageSpeed) this._impact(impactMax, ix, iz, inx, inz, 'wall');
      else if (impactMax > 1.5 && this.age - this._sparkT > 0.2) { this._sparkT = this.age; fx({ type: 'spark', x: ix, y: this.y + 0.4, z: iz, vx: inx * 2, vy: 1.5, vz: inz * 2, size: 0.4, life: 0.25 }); }
      void dt;
    }
    // lamp posts, hydrants, bins, benches and tables fall in the car's direction; trees and signals stand
    _knockProp(prop) {
      var PH = C.PHYS, R = GTP.rng, sp = this.speed2d() || 1;
      prop.fallen = { t: GTP.game ? GTP.game.time.t : this.age, dx: this.vx / sp, dz: this.vz / sp, by: this.id };
      prop.solid = false;
      this.vx *= PH.knockSlow; this.vz *= PH.knockSlow;
      this.applyDamage(2 + sp * 0.15, null, 'prop');
      var y = (prop.y || 0) + 0.6;
      for (var i = 0; i < 5; i++) fx({ type: 'spark', x: prop.x, y: y + R.range(0, 0.8), z: prop.z, vx: this.vx * 0.2 + R.range(-3, 3), vy: R.range(1, 4), vz: this.vz * 0.2 + R.range(-3, 3), life: R.range(0.2, 0.45), size: R.range(0.25, 0.45) });
      fx({ type: 'puff', x: prop.x, y: y, z: prop.z, size: 1.4, life: 0.5, color: 0xd8d4cc });
      sfx('crash', prop.x, prop.z, U.clamp(sp / 30, 0.2, 0.6));
      if (this.hasPlayer()) { shake(0.2); var pl = player(); if (pl) pl.stats.propsKnocked = (pl.stats.propsKnocked || 0) + 1; }
      if (GTP.Render && GTP.Render.knockProp) { try { GTP.Render.knockProp(prop); } catch (e) { /* render optional */ } }
      GTP.Events.emit('prop:knocked', { prop: prop, vehicle: this });
    }
    _impact(impact, x, z, nx, nz, kind, other) {
      var PH = C.PHYS, R = GTP.rng;
      var dmg = (impact - PH.damageSpeed) * PH.damagePerSpeed * (0.7 + 0.3 * Math.min(2, this.mass / 1300));
      this.applyDamage(dmg, other || null, kind);
      this.lastImpact = impact;
      var n = Math.min(10, 3 + (impact / 4) | 0), y = this.y + 0.5;
      for (var i = 0; i < n; i++) {
        var a = Math.atan2(nz, nx) + R.range(-1.2, 1.2), s = R.range(2, 7);
        fx({ type: 'spark', x: x, y: y + R.range(0, 0.6), z: z, vx: Math.cos(a) * s, vy: R.range(1, 4), vz: Math.sin(a) * s, life: R.range(0.2, 0.45), size: R.range(0.25, 0.5) });
      }
      fx({ type: 'puff', x: x, y: y, z: z, size: 1.2 + impact * 0.05, life: 0.5, color: 0xd8d4cc });
      if (impact > PH.occupantHurtSpeed) {
        var occ = this.occupants();
        for (var k = 0; k < occ.length; k++) occ[k].applyDamage((impact - PH.occupantHurtSpeed) * PH.occupantHurtPerSpeed, other || null, 'crash');
      }
      if (this.hasPlayer() || (other && other.hasPlayer && other.hasPlayer())) {
        shake(U.clamp(impact / 18, 0.15, 1.2));
        var p = player(); if (p) p.stats.crashes = (p.stats.crashes || 0) + 1;
      }
      sfx('crash', x, z, U.clamp(impact / 20, 0.2, 1));
      GTP.Events.emit('vehicle:impact', { vehicle: this, impact: impact, kind: kind, other: other || null, x: x, z: z });
    }

    // --- vehicle vs vehicle: front/rear circles, mass-weighted push + impulse ---
    _collideVehicles() {
      var list = GTP.Entities.hash.query(this.x, this.z, this.radius + 6, scratch);
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o === this || o.kind !== 'vehicle' || o.removed || o.sinking) continue;
        if (o.id < this.id && !o.wreck) continue;    // live pairs once per step, from the higher id
        if (Math.abs(o.y - this.y) > 2.2) continue;
        var dx0 = o.x - this.x, dz0 = o.z - this.z, rr0 = this.radius + o.radius;
        if (dx0 * dx0 + dz0 * dz0 > rr0 * rr0) continue;
        this._collidePair(o);
      }
    }
    _collidePair(o) {
      var PH = C.PHYS, A = this._coll.circles, B = o._coll.circles;
      var fa = U.yawToDir(this.yaw), fb = U.yawToDir(o.yaw);
      var ma = this.wreck ? this.mass * 3 : this.mass, mb = o.wreck ? o.mass * 3 : o.mass, inv = 1 / (ma + mb);
      var best = 0, bx = 0, bz = 0, bnx = 0, bnz = 0;
      for (var i = 0; i < A.length; i++) {
        var ax = this.x + fa.x * A[i].f, az = this.z + fa.z * A[i].f;
        for (var j = 0; j < B.length; j++) {
          var ox = o.x + fb.x * B[j].f, oz = o.z + fb.z * B[j].f;
          var dx = ox - ax, dz = oz - az, rr = A[i].rad + B[j].rad, d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          var d = Math.sqrt(d2) || 0.001, nx = dx / d, nz = dz / d, pen = rr - d + 0.01;
          if (d2 < 1e-6) { nx = fa.x; nz = fa.z; }
          this.x -= nx * pen * mb * inv; this.z -= nz * pen * mb * inv;
          o.x += nx * pen * ma * inv; o.z += nz * pen * ma * inv;
          var vrel = (o.vx - this.vx) * nx + (o.vz - this.vz) * nz;
          if (vrel < 0) {
            var jimp = -(1 + PH.carRestitution) * vrel / (1 / ma + 1 / mb);
            this.vx -= jimp / ma * nx; this.vz -= jimp / ma * nz;
            o.vx += jimp / mb * nx; o.vz += jimp / mb * nz;
            var la = (ax - this.x) * nz - (az - this.z) * nx, lb = (ox - o.x) * nz - (oz - o.z) * nx;
            this.angVel += la * (-vrel) * 0.25 / (this.cls.length * this.cls.length);
            o.angVel -= lb * (-vrel) * 0.25 / (o.cls.length * o.cls.length);
            if (-vrel > best) { best = -vrel; bx = (ax + ox) / 2; bz = (az + oz) / 2; bnx = nx; bnz = nz; }
          }
        }
      }
      if (best > PH.damageSpeed) {
        this._impact(best * mb * inv * 1.6, bx, bz, -bnx, -bnz, 'vehicle', o);
        o._impact(best * ma * inv * 1.6, bx, bz, bnx, bnz, 'vehicle', this);
      }
      this.lastCollision = this.age; o.lastCollision = o.age;
    }

    // --- vehicle vs peds: knockdown when fast, gentle push when slow ---
    _collidePeds() {
      var list = GTP.Entities.hash.query(this.x, this.z, this.radius + 1.5, scratch), sp = this.speed2d();
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if ((p.kind !== 'ped' && p.kind !== 'player') || p.inVehicle || p.removed) continue;
        if (p.y > this.y + this.cls.height || p.y < this.y - 1.5) continue;
        var push = this.pushCircle(p.x, p.z, p.radius);
        if (!push) continue;
        var vn = this.vx * push.nx + this.vz * push.nz;   // vehicle speed toward the ped
        if (sp > C.PED.knockdownSpeed && vn > 1 && p.alive && !p.knockedDown) {
          var dmg = C.PHYS.pedHitDamage + C.PHYS.pedHitDamagePerSpeed * Math.max(0, sp - C.PED.knockdownSpeed);
          p.x += push.px; p.z += push.pz;
          p.knockDown(this.vx * 0.9 + push.nx * 3, this.vz * 0.9 + push.nz * 3, dmg, this.driver || this, 'vehicle');
          fx({ type: 'puff', x: p.x, y: p.y + 0.8, z: p.z, size: 0.8, life: 0.4, color: 0xe8e0d0 });
          if (this.hasPlayer()) { var pl = player(); pl.stats.pedsHit = (pl.stats.pedsHit || 0) + 1; pl.stats.ramming = (pl.stats.ramming || 0) + 1; shake(0.25); }
          GTP.Events.emit('vehicle:hitPed', { vehicle: this, ped: p, speed: sp });
          this.vx *= 0.97; this.vz *= 0.97;
        } else {
          p.x += push.px; p.z += push.pz;
          if (p.knockedDown || !p.alive) { p.vx += push.nx * 1.5; p.vz += push.nz * 1.5; }
        }
        if (p._sh) GTP.Entities.hash.update(p);
      }
    }

    // --- fx: skid marks, dust, smoke, fire ---
    _surfaceFx(dt, hb) {
      var sp = this.speed2d(), R = GTP.rng;
      if (this.wreck) return;
      var skid = this.onGround && sp > 3 && (Math.abs(this.lateral) > C.PHYS.skidLateral || (hb && sp > 6) || (this.braking && sp > 14));
      if (skid && !this.offroad) {
        this._skidT += sp * dt;
        if (this._skidT > 0.7) {
          this._skidT = 0;
          var f = U.yawToDir(this.yaw), rx = -f.z, rz = f.x, hw = this.hw * 0.78, hl = this.hl * 0.62;
          var ang = U.dirToYaw(this.vx, this.vz);
          for (var s = -1; s <= 1; s += 2) {
            var wx = this.x + rx * hw * s - f.x * hl, wz = this.z + rz * hw * s - f.z * hl;
            fx({ type: 'skid', x: wx, y: this.y, z: wz, size: 0.26, size2: 0.9, rot: ang, life: 14 });
          }
          if (this.hasPlayer() && R.chance(0.5)) sfx('skid', this.x, this.z, 0.4);
        }
      } else if (this.offroad && sp > 4) {
        this._dustT += dt;
        if (this._dustT > 0.12) { this._dustT = 0; var b = this.localToWorld(R.range(-this.hw, this.hw), -this.hl); fx({ type: 'puff', x: b.x, y: this.y + 0.2, z: b.z, size: 1.4, life: 0.8, color: 0xcbb98a, vy: 0.8 }); }
      }
    }
    _damageFx(dt) {
      if (this.burning || this.wreck) return;
      if (this.hp < this.maxHp * 0.35) {
        this._smokeT += dt;
        var rate = this.hp < this.maxHp * 0.15 ? 0.12 : 0.25;
        if (this._smokeT > rate) { this._smokeT = 0; var h = this.localToWorld(GTP.rng.range(-0.3, 0.3), this.hl * 0.6); fx({ type: 'smoke', x: h.x, y: this.y + this.cls.height * 0.6, z: h.z, size: 1.0, life: 1.4, color: this.hp < this.maxHp * 0.15 ? 0x2a2a2a : 0x8a8a8a, vy: 1.4 }); }
      }
    }
    _burnFx(dt) {
      this._fireT += dt; this._smokeT += dt;
      var R = GTP.rng;
      if (this._fireT > 0.07) { this._fireT = 0; var h = this.localToWorld(R.range(-0.4, 0.4), R.range(0, this.hl * 0.7)); fx({ type: 'fire', x: h.x, y: this.y + this.cls.height * 0.55, z: h.z, size: R.range(0.9, 1.6), life: R.range(0.35, 0.6), vy: R.range(1.5, 3) }); }
      if (this._smokeT > 0.12) { this._smokeT = 0; var s = this.localToWorld(R.range(-0.3, 0.3), this.hl * 0.4); fx({ type: 'smoke', x: s.x, y: this.y + this.cls.height * 0.8, z: s.z, size: 1.6, life: 1.8, color: 0x222222, vy: 2 }); }
    }
    _wreckFx() { }

    syncMesh(alpha) {
      var m = this.mesh; if (!m) return;
      var a = alpha == null ? 1 : alpha;
      m.position.set(this._px + (this.x - this._px) * a, this._py + (this.y - this._py) * a, this._pz + (this.z - this._pz) * a);
      m.rotation.set(this.pitch, this._pyaw + U.wrapAngle(this.yaw - this._pyaw) * a, this.roll, 'YXZ');
      var pl = player(), hidden = pl && pl.inVehicle === this && pl.cameraMode === 'first';
      m.visible = !hidden && !tooFar(this, C.QUALITY.vehicleDraw);
      if (m.visible && GTP.Render && GTP.Render.syncVehicle) GTP.Render.syncVehicle(this);
    }
  }

  // ================================================================== Player ==
  class Player extends Ped {
    constructor(o) {
      o = o || {}; o.kind = 'player'; o.hp = C.PLAYER.hp; o.persistent = true;
      if (!o.look) {
        var cast = GTP.Content && GTP.Content.cast && GTP.Content.cast.player;
        o.look = cast && cast.look ? Object.assign({}, cast.look) : { skin: 2, hair: 'short', hairColor: '#3a2a1a', shirt: '#f4f4f4', pants: '#2a2f4a', glasses: 'none', hat: 'none', extra: 'mic', tie: 'red' };
      }
      super(o);
      this.name = (GTP.Content && GTP.Content.cast && GTP.Content.cast.player && GTP.Content.cast.player.name) || 'Bryce Takesworth';
      this.money = C.PLAYER.startMoney; this.wanted = 0; this.heat = 0; this.weapons = { fist: Infinity }; this.weapon = 'fist';
      this.armor = 0; this.vehicle = null; this.lockTarget = null; this.cameraMode = 'chase';
      this.stats = { distance: 0, distanceDriven: 0, crashes: 0, vehiclesStolen: 0, pedsHit: 0, knockdowns: 0, jumps: 0 };
      this.controlEnabled = true; this.fireHeld = false; this.respawnT = 0;
    }
    // Game.step calls this while playing: Input -> intent / vehicle controls
    control(dt) {
      var In = GTP.Input, A = GTP.Audio, v = this.inVehicle;
      this.intent.x = 0; this.intent.z = 0; this.intent.run = false;
      if (!this.alive || !this.controlEnabled || this.knockedDown) {
        if (v) { v.throttle = 0; v.steer = 0; v.brake = 0; v.handbrake = false; }
        if (A && A.engine) A.engine(0, v ? v.type : null);
        return;
      }
      var mv = In.move;
      if (v) {
        if (v.driver === this) {
          var fwd = In.down('forward'), back = In.down('back');
          v.throttle = fwd ? 1 : 0; v.brake = 0;
          if (back) { if (v.speed > 0.6) v.brake = 1; else v.throttle = -1; }
          v.steer = U.clamp(mv.x, -1, 1);
          v.handbrake = In.down('jump');
          if (In.pressed('horn')) { if (v.isPolice) v.siren = !v.siren; else v.honk(); this.stats.honking = (this.stats.honking || 0) + 1; }
        }
        if (In.pressed('radio') && A && A.radio && A.radio.next) { var st = A.radio.next(); if (st && GTP.UI && GTP.UI.toast) GTP.UI.toast('Radio: ' + (st.name || st)); }
        if (In.pressed('enter') && this.exitLock <= 0) { this.exitVehicle(); if (A && A.engine) A.engine(0, v.type); return; }
        if (In.pressed('weaponNext')) this.cycleWeapon(1);
        if (In.pressed('weaponPrev')) this.cycleWeapon(-1);
        // drive-by: aim holds the camera where the mouse points, fire shoots a pistol / SMG / shotgun out of the window (no camera change)
        var CB = GTP.Combat, gun = CB && CB.driveByWeapon ? CB.driveByWeapon(this.weapon) : false;
        this.aiming = gun && In.down('aim') && !this.swimming;
        if (this.aiming) {
          this.aimYaw = GTP.Render && GTP.Render.rig ? GTP.Render.rig.yaw : v.yaw;
          if (In.down('shoot') && CB.fire) { try { CB.fire(this, this.weapon); } catch (e) { U.reportError(e, 'combat.driveby'); } }
        }
        if (A && A.engine) A.engine(U.clamp(Math.abs(v.speed) / v.cls.maxSpeed, 0, 1), v.type);
        return;
      }
      if (this.entering) return;
      // on foot: move relative to the camera yaw; the character turns toward movement
      var camYaw = GTP.Render && GTP.Render.rig ? GTP.Render.rig.yaw : 0;
      var f = U.yawToDir(camYaw), rx = -f.z, rz = f.x;
      this.intent.x = f.x * mv.z + rx * mv.x; this.intent.z = f.z * mv.z + rz * mv.x; this.intent.run = In.down('run');
      this.aiming = In.down('aim') && !this.swimming;
      if (this.aiming) this.aimYaw = camYaw;   // otherwise Combat points aimYaw at the auto-target
      if (In.pressed('jump') && this.onGround && !this.swimming) { this.wantJump = true; this.stats.jumps++; }
      if (In.pressed('enter') && this.exitLock <= 0) {
        var nv = this.nearestVehicle(C.PLAYER.enterRange);
        if (nv) this.enterVehicle(nv, 0);
      }
      if (In.pressed('weaponNext')) this.cycleWeapon(1);
      if (In.pressed('weaponPrev')) this.cycleWeapon(-1);
      var fire = In.down('shoot') || In.down('action');
      if (fire && GTP.Combat && GTP.Combat.fire) { try { GTP.Combat.fire(this, this.weapon); } catch (e) { U.reportError(e, 'combat.fire'); } }
      this.fireHeld = fire;
      if (A && A.engine) A.engine(0, null);
      void dt;
    }
    cycleWeapon(dir) {
      var self = this, ids = Object.keys(this.weapons).filter(function (id) { return self.weapons[id] > 0; });
      if (!ids.length) return;
      var i = ids.indexOf(this.weapon); if (i < 0) i = 0;
      this.weapon = ids[(i + dir + ids.length) % ids.length];
    }
    update(dt) {
      var ox = this.x, oz = this.z;
      super.update(dt);
      if (!this.inVehicle) { var d = U.dist2d(ox, oz, this.x, this.z); if (d < 50 && !this.isDown()) this.stats.distance += d; }
      if (!this.alive) this._fallbackRespawn(dt);
    }
    applyDamage(n, src, type) {
      if (this.godMode) return 0;
      return super.applyDamage(n, src, type);
    }
    die(src, type) {
      super.die(src, type);
      this.respawnT = 0;
      if (GTP.Combat && GTP.Combat.onPlayerDeath) { try { GTP.Combat.onPlayerDeath(this, src, type); } catch (e) { U.reportError(e, 'combat.onPlayerDeath'); } }
    }
    // until Combat owns death and respawn (the RATIO'D card): lie flat 3 s, then the hospital with full hp, no weapons, -10% cash
    _fallbackRespawn(dt) {
      if (GTP.Combat && GTP.Combat.onPlayerDeath) return;
      this.respawnT += dt;
      if (this.respawnT < 3) return;
      var Wd = W(), g = GTP.game, lm = Wd.landmark((GTP.Content.world.respawn && GTP.Content.world.respawn.hospital) || 'hospital');
      var sp = lm && lm.door ? lm.door : { x: this.x, z: this.z };
      this.alive = true; this.hp = this.maxHp; this.knockedDown = false; this.swimming = false; this.state = 'idle'; this.corpseT = 0;
      this.weapons = { fist: Infinity }; this.weapon = 'fist'; this.money = Math.round(this.money * (1 - C.ECONOMY.deathCashLoss));
      this.x = sp.x; this.z = sp.z; this.y = Wd.heightAt(sp.x, sp.z, 0); this.vx = this.vz = this.vy = 0; this.onGround = true; this.snap();
      if (this._sh) GTP.Entities.hash.update(this);
      if (GTP.Render && GTP.Render.rig) { GTP.Render.rig.snap(); }
      if (GTP.UI && GTP.UI.toast) GTP.UI.toast('RATIO\'D');
      GTP.Events.emit('player:respawn', { player: this, at: 'hospital' });
      void g;
    }
  }

  // ============================================================== Projectile ==
  class Projectile extends Entity {
    constructor(o) {
      o = o || {}; o.kind = 'projectile'; o.radius = o.radius || 0.15;
      super(o);
      this.owner = o.owner || null; this.weaponId = o.weaponId || 'pistol'; this.dmg = o.dmg || 10; this.life = o.life || 2; this.tracer = !!o.tracer;
      this.vx = o.vx || 0; this.vy = o.vy || 0; this.vz = o.vz || 0; this.lobbed = !!o.lobbed; this.stun = o.stun || 0;
    }
    update(dt) {
      this.age += dt; this.life -= dt;
      if (this.life <= 0) { this.destroy(); return; }
      if (this.lobbed) this.vy -= C.PHYS.gravity * dt;
      this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
      var Wd = W();
      if (this.y <= Wd.heightAt(this.x, this.z, this.y) || Wd.solidAt(this.x, this.z, this.y) || this.y < WATER_Y - 1) { this.hit(null); return; }
      var list = GTP.Entities.hash.query(this.x, this.z, 1.2, scratch);
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e === this.owner || e.removed || (e.kind !== 'ped' && e.kind !== 'player' && e.kind !== 'vehicle')) continue;
        if (e.inVehicle) continue;
        if (e.kind === 'vehicle') { if (e.pushCircle(this.x, this.z, this.radius) && this.y < e.y + e.cls.height + 0.3 && this.y > e.y - 0.3) { this.hit(e); return; } }
        else if (U.dist2d(e.x, e.z, this.x, this.z) < e.radius + this.radius && this.y > e.y - 0.2 && this.y < e.y + e.height + 0.2) { this.hit(e); return; }
      }
    }
    hit(target) {
      if (this.removed) return;
      if (GTP.Combat && GTP.Combat.projectileHit) { try { GTP.Combat.projectileHit(this, target); } catch (e) { U.reportError(e, 'combat.projectileHit'); } }
      else {
        if (target && target.applyDamage) target.applyDamage(this.dmg, this.owner, this.weaponId);
        if (target && target.knockDown && this.stun) target.knockDown(this.vx * 0.2, this.vz * 0.2, 0, this.owner, this.weaponId);
        fx({ type: 'puff', x: this.x, y: this.y, z: this.z, size: 0.7, life: 0.35, color: 0xffd090 });
      }
      this.destroy();
    }
  }

  // ================================================================== Pickup ==
  class Pickup extends Entity {
    constructor(o) {
      o = o || {}; o.kind = 'pickup'; o.radius = 0.6;
      super(o);
      this.pickupType = o.pickupType || o.type || 'cash'; this.value = o.value || 0; this.weaponId = o.weaponId || null; this.ammo = o.ammo || 0; this.bob = 0;
      this.respawn = o.respawn || 0; this.hidden = false; this.hiddenT = 0; this.baseY = this.y;
    }
    update(dt) {
      this.age += dt; this.bob += dt;
      if (this.hidden) { this.hiddenT -= dt; if (this.hiddenT <= 0) this.hidden = false; return; }
      var p = player();
      if (!p || !p.alive || p.inVehicle) return;
      if (U.dist2d(p.x, p.z, this.x, this.z) < 1.1 && Math.abs(p.y - this.y) < 1.5) this.collect(p);
    }
    collect(p) {
      var handled = false;
      if (GTP.Combat && GTP.Combat.collectPickup) { try { handled = GTP.Combat.collectPickup(this, p) !== false; } catch (e) { U.reportError(e, 'combat.collectPickup'); } }
      if (!handled) {
        if (this.pickupType === 'cash') p.money += this.value;
        else if (this.pickupType === 'health') p.hp = Math.min(p.maxHp, p.hp + (this.value || 50));
        else if (this.pickupType === 'armor') p.armor = Math.min(100, (p.armor || 0) + (this.value || 50));
        else if (this.pickupType === 'weapon' && this.weaponId) { p.weapons[this.weaponId] = (p.weapons[this.weaponId] || 0) + (this.ammo || 20); p.weapon = this.weaponId; }
      }
      sfx(this.pickupType === 'cash' ? 'cash' : 'pickup', this.x, this.z, 0.7);
      fx({ type: 'puff', x: this.x, y: this.y + 0.5, z: this.z, size: 1.2, life: 0.4, color: 0xfff0a0 });
      GTP.Events.emit('pickup', { pickup: this, player: p });
      if (this.respawn > 0) { this.hidden = true; this.hiddenT = this.respawn; } else this.destroy();
    }
    syncMesh(alpha) {
      var m = this.mesh; if (!m) return;
      m.visible = !this.hidden && !this.removed;
      m.position.set(this.x, this.y + 0.25 + Math.sin(this.bob * 2.5) * 0.12, this.z);
      m.rotation.y = this.bob * 1.6;
      void alpha;
    }
  }

  GTP.Entity = Entity; GTP.Ped = Ped; GTP.Vehicle = Vehicle; GTP.Player = Player; GTP.Projectile = Projectile; GTP.Pickup = Pickup;

  // ================================================================ Entities ==
  var E = GTP.Entities = {
    list: [],
    hash: new GTP.SpatialHash(16),
    _despawnT: 0,
    add: function (e) {
      if (e._inList) return e;
      e._inList = true; e.removed = false;
      E.list.push(e); E.hash.insert(e);
      if (GTP.Render && GTP.Render.attach) { try { GTP.Render.attach(e); } catch (err) { U.reportError(err, 'render.attach'); } }
      return e;
    },
    remove: function (e) {
      var i = E.list.indexOf(e); if (i >= 0) E.list.splice(i, 1);
      E.hash.remove(e); e._inList = false; e.removed = true;
      if (GTP.Render && GTP.Render.detach) GTP.Render.detach(e);
    },
    byKind: function (kind) { return E.list.filter(function (e) { return e.kind === kind; }); },
    near: function (x, z, r, kind) {
      var out = E.hash.query(x, z, r, []);
      return kind ? out.filter(function (e) { return e.kind === kind; }) : out;
    },
    clearDynamic: function () {
      for (var i = E.list.length - 1; i >= 0; i--) if (!E.list[i].persistent) E.remove(E.list[i]);
    },
    update: function (dt) {
      var list = E.list, i, e;
      for (i = 0; i < list.length; i++) {
        e = list[i];
        e._px = e.x; e._py = e.y; e._pz = e.z; e._pyaw = e.yaw;
        if (e.removed) continue;
        try { e.update(dt); } catch (err) { U.reportError(err, 'entity.update ' + e.kind + '#' + e.id); }
        if (e._sh) E.hash.update(e);
      }
      // sweep removed entities and despawn far ones
      E._despawnT += dt;
      var p = player(), doDespawn = E._despawnT > 1 && p;
      if (doDespawn) E._despawnT = 0;
      for (i = list.length - 1; i >= 0; i--) {
        e = list[i];
        if (!e.removed && doDespawn && !e.persistent && e.kind !== 'player') {
          if (e.inVehicle && e.inVehicle.persistent) continue;
          if (U.dist2d(e.x, e.z, p.x, p.z) > C.ACTIVE_RADIUS && !(e.kind === 'vehicle' && e.hasPlayer())) e.removed = true;
        }
        if (e.removed) {
          if (e.kind === 'vehicle') { var occ = e.occupants(); for (var k = 0; k < occ.length; k++) { if (occ[k].kind === 'player') e.exit(occ[k]); else occ[k].removed = true; } }
          E.remove(e);
        }
      }
    },
    sync: function (alpha) {
      var list = E.list;
      for (var i = 0; i < list.length; i++) { try { list[i].syncMesh(alpha); } catch (err) { U.reportError(err, 'syncMesh'); } }
    }
  };
})();
