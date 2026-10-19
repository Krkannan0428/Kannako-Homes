/* Grand Theft Pundit: 06_entities.js
 * GTP.Entities and the entity class shells. Step 2 fills in the physics and
 * behaviour; this file keeps the contract's surface so every other module
 * (render, AI, combat, missions, game) can run against it.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C;
  var nextId = 1;

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
      this._px = this.x; this._py = this.y; this._pz = this.z; this._pyaw = this.yaw;
    }
    update(dt) { this.age += dt; }
    syncMesh(alpha) {
      if (!this.mesh) return;
      var a = alpha == null ? 1 : alpha;
      this.mesh.position.set(this._px + (this.x - this._px) * a, this._py + (this.y - this._py) * a, this._pz + (this.z - this._pz) * a);
      this.mesh.rotation.y = this._pyaw + GTP.util.wrapAngle(this.yaw - this._pyaw) * a;
    }
    onDeath() { }
    destroy() { this.alive = false; }
  }
  class Ped extends Entity {
    constructor(o) {
      o = o || {}; o.kind = o.kind || 'ped'; o.hp = o.hp || C.PED.hp; o.radius = C.PED.radius; o.height = C.PED.height;
      super(o);
      this.look = o.look || null; this.role = o.role || 'civ'; this.state = 'idle'; this.target = null; this.path = null;
      this.inVehicle = null; this.seat = -1; this.weapon = 'fist'; this.onGround = true; this.knockedDown = false; this.animTime = 0;
    }
    speakLine(text) { this.line = text; this.lineTime = 3; }
  }
  class Vehicle extends Entity {
    constructor(o) {
      o = o || {}; o.kind = 'vehicle'; var spec = C.VEHICLES[o.type || 'sedan'] || C.VEHICLES.sedan; o.hp = spec.hp;
      super(o);
      this.type = o.type || 'sedan'; this.cls = spec; this.speed = 0; this.steer = 0; this.throttle = 0; this.brake = 0; this.handbrake = false;
      this.driver = null; this.passengers = []; this.color = o.color || spec.colors[0]; this.damage = 0; this.isPolice = this.type === 'cop';
      this.siren = false; this.wheelSpin = 0; this.wheelSteer = 0; this.lights = false;
      this.radius = Math.max(spec.length, spec.width) / 2; this.height = spec.height;
    }
    honk() { }
    enter(ped, seat) { if (seat === 0 || seat == null) this.driver = ped; else this.passengers.push(ped); ped.inVehicle = this; }
    exit(ped) { if (this.driver === ped) this.driver = null; var i = this.passengers.indexOf(ped); if (i >= 0) this.passengers.splice(i, 1); ped.inVehicle = null; }
    applyDamage(n) { this.hp -= n; if (this.hp <= 0) this.explode(); }
    explode() { this.alive = false; }
  }
  class Player extends Ped {
    constructor(o) {
      o = o || {}; o.kind = 'player'; o.hp = C.PLAYER.hp; o.persistent = true;
      super(o);
      this.money = C.PLAYER.startMoney; this.wanted = 0; this.heat = 0; this.weapons = { fist: Infinity }; this.weapon = 'fist';
      this.armor = 0; this.vehicle = null; this.lockTarget = null; this.cameraMode = 'chase'; this.stats = {};
    }
  }
  class Projectile extends Entity {
    constructor(o) { o = o || {}; o.kind = 'projectile'; super(o); this.owner = o.owner || null; this.weaponId = o.weaponId || 'pistol'; this.dmg = o.dmg || 10; this.life = o.life || 2; this.tracer = !!o.tracer; }
  }
  class Pickup extends Entity {
    constructor(o) { o = o || {}; o.kind = 'pickup'; super(o); this.pickupType = o.pickupType || 'cash'; this.value = o.value || 0; this.weaponId = o.weaponId || null; this.bob = 0; }
  }
  GTP.Entity = Entity; GTP.Ped = Ped; GTP.Vehicle = Vehicle; GTP.Player = Player; GTP.Projectile = Projectile; GTP.Pickup = Pickup;

  var E = GTP.Entities = {
    list: [],
    hash: new GTP.SpatialHash(16),
    add: function (e) { E.list.push(e); E.hash.insert(e); if (GTP.Render && GTP.Render.attach) GTP.Render.attach(e); return e; },
    remove: function (e) { var i = E.list.indexOf(e); if (i >= 0) E.list.splice(i, 1); E.hash.remove(e); if (GTP.Render && GTP.Render.detach) GTP.Render.detach(e); },
    byKind: function (kind) { return E.list.filter(function (e) { return e.kind === kind; }); },
    near: function (x, z, r, kind) {
      var out = E.hash.query(x, z, r, []);
      return kind ? out.filter(function (e) { return e.kind === kind; }) : out;
    },
    clearDynamic: function () {
      for (var i = E.list.length - 1; i >= 0; i--) if (!E.list[i].persistent) E.remove(E.list[i]);
    },
    update: function (dt) {
      for (var i = 0; i < E.list.length; i++) {
        var e = E.list[i];
        e._px = e.x; e._py = e.y; e._pz = e.z; e._pyaw = e.yaw;
        e.update(dt);
      }
    },
    sync: function (alpha) { for (var i = 0; i < E.list.length; i++) E.list[i].syncMesh(alpha); }
  };
})();
