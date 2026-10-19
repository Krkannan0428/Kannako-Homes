/* Grand Theft Pundit: 30_game.js
 * GTP.Game: boot, URL params, state machine, fixed-step loop with accumulator
 * and max-steps guard, headless advance, render, time/clock, save/load
 * skeleton, debug API. Holds a placeholder on-foot player (step 2 replaces it
 * with GTP.Player + the real controller).
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util;
  var SAVE_KEY = 'gtp.save.v2';
  var SIM_STATES = { playing: 1, cutscene: 1, minigame: 1 };
  var RESPAWN_STATES = { wasted: 1, busted: 1 };

  function parseParams() {
    var out = {};
    try {
      var q = (typeof location !== 'undefined' && location.search) ? location.search.slice(1) : '';
      q.split('&').forEach(function (kv) {
        if (!kv) return;
        var p = kv.split('='), k = decodeURIComponent(p[0]), v = p.length > 1 ? decodeURIComponent(p[1]) : '1';
        out[k] = v;
      });
    } catch (e) { /* no location (inlined pages) */ }
    return out;
  }
  function truthy(v) { return v === true || v === 1 || v === '1' || v === 'true' || v === 'yes'; }

  // ------------------------------------------------------ placeholder player --
  // A walking capsule with the contract's fields. Uses heightAt, resolveCapsule,
  // step-up, jump and gravity so the camera rig and tests have something real to follow.
  function PlaceholderPlayer(x, z) {
    this.kind = 'player'; this.id = 0;
    this.x = x; this.z = z; this.y = GTP.World.heightAt(x, z, 0); this.yaw = Math.PI;
    this.vx = 0; this.vy = 0; this.vz = 0; this.speed = 0;
    this.radius = C.PLAYER.radius; this.height = C.PLAYER.height;
    this.hp = C.PLAYER.hp; this.maxHp = C.PLAYER.hp; this.armor = 0; this.alive = true;
    this.money = C.PLAYER.startMoney; this.wanted = 0; this.heat = 0;
    this.weapons = { fist: Infinity }; this.weapon = 'fist'; this.vehicle = null; this.inVehicle = null; this.lockTarget = null;
    this.cameraMode = 'chase'; this.stats = {}; this.onGround = true; this.animTime = 0; this.aiming = false;
    this.look = { skin: 2, hair: 'short', hairColor: '#3a2a1a', shirt: '#ff3fa4', pants: '#2a2f4a', glasses: 'none', hat: 'none', extra: 'mic' };
    this.mesh = null; this.persistent = true; this.placeholder = true;
    this._px = x; this._py = this.y; this._pz = z; this._pyaw = this.yaw;
  }
  PlaceholderPlayer.prototype.update = function (dt) {
    var In = GTP.Input, W = GTP.World, P = C.PLAYER;
    this._px = this.x; this._py = this.y; this._pz = this.z; this._pyaw = this.yaw;
    var mv = In.move, camYaw = GTP.Render.rig.yaw;
    var f = U.yawToDir(camYaw), rx = -f.z, rz = f.x;
    var wx = f.x * mv.z + rx * mv.x, wz = f.z * mv.z + rz * mv.x;
    var l = Math.sqrt(wx * wx + wz * wz);
    var run = In.down('run');
    var target = l > 0.01 ? (run ? P.run : P.walk) : 0;
    if (l > 1) { wx /= l; wz /= l; l = 1; }
    this.aiming = In.down('aim');
    var tvx = l > 0.01 ? wx / l * target * Math.min(1, l) : 0, tvz = l > 0.01 ? wz / l * target * Math.min(1, l) : 0;
    this.vx = U.damp(this.vx, tvx, P.accel / 2, dt); this.vz = U.damp(this.vz, tvz, P.accel / 2, dt);
    if (l > 0.01) this.yaw = U.angleDamp(this.yaw, U.dirToYaw(wx, wz), 14, dt);
    // gravity and jump
    var ground = W.heightAt(this.x, this.z, this.y);
    if (this.onGround && In.pressed('jump')) { this.vy = Math.sqrt(2 * C.PHYS.gravity * P.jump); this.onGround = false; }
    if (!this.onGround) this.vy -= C.PHYS.gravity * dt;
    var nx = this.x + this.vx * dt, nz = this.z + this.vz * dt, ny = this.y + this.vy * dt;
    // step-up: a ledge taller than stepUp is a wall
    var gNew = W.heightAt(nx, nz, this.y);
    if (gNew > this.y + P.stepUp + 0.05 && this.onGround) {
      var gx = W.heightAt(nx, this.z, this.y), gz = W.heightAt(this.x, nz, this.y);
      if (gx <= this.y + P.stepUp + 0.05) { nz = this.z; this.vz = 0; } else if (gz <= this.y + P.stepUp + 0.05) { nx = this.x; this.vx = 0; } else { nx = this.x; nz = this.z; this.vx = this.vz = 0; }
      gNew = W.heightAt(nx, nz, this.y);
    }
    var r = W.resolveCapsule(nx, nz, this.y, this.radius);
    this.x = r.x; this.z = r.z;
    if (r.hitX) this.vx = 0; if (r.hitZ) this.vz = 0;
    ground = W.heightAt(this.x, this.z, this.onGround ? this.y : ny);
    if (this.onGround) { this.y = U.damp(this.y, ground, 30, dt); if (Math.abs(this.y - ground) < 0.02) this.y = ground; if (ground < this.y - 0.6) { this.onGround = false; this.vy = 0; } }
    else { this.y = ny; if (this.vy <= 0 && this.y <= ground) { this.y = ground; this.vy = 0; this.onGround = true; } }
    this.speed = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    this.animTime += this.speed * dt * 1.6;
    this.stats.distance = (this.stats.distance || 0) + this.speed * dt;
  };
  PlaceholderPlayer.prototype.syncMesh = function (alpha) {
    var m = this.mesh; if (!m) return;
    var a = alpha == null ? 1 : alpha;
    m.position.set(this._px + (this.x - this._px) * a, this._py + (this.y - this._py) * a, this._pz + (this.z - this._pz) * a);
    m.rotation.y = this._pyaw + U.wrapAngle(this.yaw - this._pyaw) * a;
    var sw = Math.sin(this.animTime * 6) * Math.min(1, this.speed / 2.6) * 0.7;
    var parts = this._parts || (this._parts = { legL: m.getObjectByName('legL'), legR: m.getObjectByName('legR'), armL: m.getObjectByName('armL'), armR: m.getObjectByName('armR') });
    if (parts.legL) { parts.legL.rotation.x = sw; parts.legR.rotation.x = -sw; parts.armL.rotation.x = -sw * 0.8; parts.armR.rotation.x = sw * 0.8; }
    if (!this.onGround && parts.legL) { parts.legL.rotation.x = 0.5; parts.legR.rotation.x = -0.3; }
    m.visible = this.cameraMode !== 'first';
  };

  // ---------------------------------------------------------------- Game --
  function Game() {
    this.state = 'title';
    this.prevState = 'title';
    this.time = { t: 0, clock: C.DAY.startClock, day: 1 };
    this.player = null;
    this.headless = false;
    this.debugMode = false;
    this.seed = 7;
    this.opts = {};
    this.booted = false;
    this.steps = 0; this.frames = 0; this.fps = 0;
    this._acc = 0; this._last = 0; this._fpsT = 0; this._fpsN = 0; this._raf = 0;
    this.canvas = null;
    this.debug = this._makeDebug();
  }

  Game.prototype.boot = function (opts) {
    if (this.booted) return this;
    var params = parseParams();
    opts = Object.assign({}, params, opts || {});
    this.opts = opts;
    this.headless = truthy(opts.headless);
    this.debugMode = truthy(opts.debug);
    this.seed = opts.seed != null && opts.seed !== '' ? (parseInt(opts.seed, 10) || 1) : 7;
    if (truthy(opts.low)) { C.QUALITY.shadows = false; C.QUALITY.drawDistance = 160; C.QUALITY.fogStart = 70; }
    var skipTitle = truthy(opts.skipTitle) || this.headless;
    var gl = (typeof document !== 'undefined') ? document.getElementById('gl') : null;
    var hud = (typeof document !== 'undefined') ? document.getElementById('hud') : null;
    this.canvas = gl;
    if (!gl) { U.reportError(new Error('no #gl canvas'), 'boot'); return this; }
    try {
      GTP.Input.init(hud || gl);
      GTP.Audio.init({ headless: this.headless, mute: truthy(opts.mute) });
      GTP.Render.init(gl);
      this.newGame(this.seed);
      if (opts.clock != null && opts.clock !== '') this.debug.setClock(parseFloat(opts.clock));
      GTP.UI.init();
      if (opts.mission && GTP.Missions.start) { try { this._prepMission(String(opts.mission)); } catch (e) { U.reportError(e, 'boot.mission'); } }
      this.setState(skipTitle ? 'playing' : 'title');
      try { GTP.Render.frame(1); } catch (e) { U.reportError(e, 'boot.render'); }
    } catch (e) { U.reportError(e, 'boot'); }
    this.booted = true;
    if (!this.headless && typeof requestAnimationFrame === 'function') {
      var self = this;
      this._last = U.now();
      this._raf = requestAnimationFrame(function (ts) { self._loop(ts); });
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { self._last = U.now(); self._acc = 0; });
    }
    try { if (window.claude && window.claude.hot) window.claude.hot.snapshot = function () { return GTP.game.debug.snapshot(); }; } catch (e) { /* optional */ }
    return this;
  };

  Game.prototype._prepMission = function (id) {
    var all = GTP.Content.missions || [], byId = {};
    all.forEach(function (m) { byId[m.id] = m; });
    var m = byId[id]; if (!m) return;
    var st = GTP.Missions.state;
    (function mark(mm) { (mm.requires || []).forEach(function (r) { if (byId[r] && !st.completed.has(r)) { st.completed.add(r); mark(byId[r]); } }); })(m);
    GTP.Missions.start(id);
  };

  Game.prototype.newGame = function (seed) {
    seed = seed | 0;
    this.seed = seed;
    GTP.rng.seed(seed);
    GTP.World.generate(seed);
    GTP.Render.invalidateAll();
    GTP.Render.fx.clear();
    var E = GTP.Entities;
    if (this.player && !this.player.placeholder) E.remove(this.player);
    if (this.player && this.player.mesh) GTP.Render.detach(this.player);
    E.clearDynamic();
    E.list.length = 0; E.hash.clear();
    var sp = this._spawnPoint();
    this.player = this._makePlayer(sp);
    this.time = { t: 0, clock: C.DAY.startClock, day: 1 };
    this.steps = 0;
    if (GTP.AI.reset) GTP.AI.reset();
    if (GTP.AI.spawner && GTP.AI.spawner.warmup) { try { GTP.AI.spawner.warmup(); } catch (e) { U.reportError(e, 'spawner.warmup'); } }
    GTP.Missions.init();
    GTP.Render.freeCam(false);
    GTP.Render.rig.reset();
    GTP.Render.rig.yaw = this.player.yaw;
    GTP.Render.rig.target(this.player);
    GTP.Render.updateCamera(0);
    GTP.Render.updateEnvironment(this.time.clock);
    return this;
  };

  Game.prototype._makePlayer = function (sp) {
    var p;
    if (GTP.Player && !GTP.Player.placeholderOnly && GTP.Player.prototype.control) {
      p = new GTP.Player({ x: sp.x, y: sp.y, z: sp.z });
      GTP.Entities.add(p);
    } else {
      p = new PlaceholderPlayer(sp.x, sp.z);
      p.mesh = GTP.Assets.pedParts(p.look);
      GTP.Render.entityGroup.add(p.mesh);
    }
    return p;
  };

  Game.prototype._spawnPoint = function () {
    var CW = GTP.Content.world, W = GTP.World;
    var id = typeof CW.playerSpawn === 'string' ? CW.playerSpawn : (CW.playerSpawn && CW.playerSpawn.landmark);
    var lm = id ? W.landmark(id) : null;
    var x, z;
    if (lm && lm.door) { x = lm.door.x; z = lm.door.z; }
    else { var p = W.randomSidewalkPoint(); x = p.x; z = p.z; }
    if (W.solidAt(x, z, 0.5)) {
      var t = W.nearestTileOf(x, z, function (tt) { return tt === W.T.SIDEWALK || tt === W.T.PLAZA; }, 16);
      if (t) { x = (t.tx + 0.5) * C.TILE; z = (t.tz + 0.5) * C.TILE; }
    }
    return { x: x, z: z, y: W.heightAt(x, z, 0) };
  };

  Game.prototype.setState = function (s) {
    if (s === this.state) return;
    this.prevState = this.state;
    this.state = s;
    if (GTP.UI && GTP.UI.onState) { try { GTP.UI.onState(s, this.prevState); } catch (e) { U.reportError(e, 'ui.onState'); } }
    GTP.Events.emit('state', { state: s, prev: this.prevState });
  };

  Game.prototype._handleGlobalInput = function () {
    var In = GTP.Input;
    if (this.state === 'title') {
      if (In.pressed('confirm') || In.pressed('enter')) this.setState('playing');
    } else if (this.state === 'playing') {
      if (In.pressed('pause')) { this.setState('paused'); In.releasePointerLock(); }
      if (In.pressed('cameraMode') && this.player) {
        var modes = ['chase', 'close', 'first'], i = modes.indexOf(this.player.cameraMode || 'chase');
        this.player.cameraMode = modes[(i + 1) % modes.length];
      }
    } else if (this.state === 'paused') {
      if (In.pressed('pause') || In.pressed('back') || In.pressed('confirm')) this.setState('playing');
    }
  };

  // one fixed step: Input -> player -> Missions -> AI -> entities -> Combat -> fx -> clock -> UI -> camera
  Game.prototype.step = function () {
    var dt = C.STEP;
    try {
      GTP.Input.beginFrame();
      this._handleGlobalInput();
      if (this.state === 'playing' && this.player) {
        if (this.player.control) this.player.control(dt);
        else if (this.player.placeholder) this.player.update(dt);
      }
      if (SIM_STATES[this.state]) {
        GTP.Missions.update(dt);
        GTP.AI.update(dt);
        GTP.Entities.update(dt);
        GTP.Combat.update(dt);
        GTP.Render.fx.update(dt);
        this.time.t += dt;
        this.time.clock += dt / C.DAY.secondsPerHour;
        if (this.time.clock >= 24) { this.time.clock -= 24; this.time.day++; }
      } else if (RESPAWN_STATES[this.state]) {
        GTP.Combat.update(dt);
        GTP.Render.fx.update(dt);
      }
      if (GTP.Audio.update) GTP.Audio.update(dt);
      GTP.UI.update(dt);
      GTP.Render.updateCamera(dt);
      this.steps++;
    } catch (e) {
      U.reportError(e, 'step');
    } finally {
      try { GTP.Input.endFrame(); } catch (e2) { U.reportError(e2, 'input.endFrame'); }
    }
  };

  Game.prototype.advance = function (seconds) {
    var n = Math.round((seconds || 0) / C.STEP);
    for (var i = 0; i < n; i++) this.step();
    return n;
  };

  Game.prototype.render = function (alpha) {
    try { GTP.Render.frame(alpha == null ? 1 : alpha); } catch (e) { U.reportError(e, 'render'); }
    this.frames++;
  };

  Game.prototype._loop = function (ts) {
    var self = this;
    this._raf = requestAnimationFrame(function (t2) { self._loop(t2); });
    var now = ts || U.now();
    var dt = (now - this._last) / 1000;
    this._last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > C.MAX_FRAME_DT) dt = C.MAX_FRAME_DT;
    this._acc += dt;
    var n = 0;
    while (this._acc >= C.STEP && n < C.MAX_STEPS) { this.step(); this._acc -= C.STEP; n++; }
    if (n >= C.MAX_STEPS && this._acc >= C.STEP) this._acc = 0;
    this.render(this._acc / C.STEP);
    this._fpsN++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this.fps = this._fpsN / this._fpsT; this._fpsN = 0; this._fpsT = 0; }
  };

  // ------------------------------------------------------------- save/load --
  Game.prototype.hasSave = function () {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };
  Game.prototype.save = function () {
    var p = this.player; if (!p) return false;
    var data = {
      version: 2, seed: this.seed, money: p.money, x: p.x, z: p.z, yaw: p.yaw, weapons: p.weapons, weapon: p.weapon, armor: p.armor, hp: p.hp,
      completed: Array.from(GTP.Missions.state.completed || []), flags: GTP.Missions.state.flags || {}, stats: p.stats || {},
      clock: this.time.clock, day: this.time.day, radioStation: GTP.Audio.station || 0, cameraMode: p.cameraMode || 'chase'
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data, function (k, v) { return v === Infinity ? 'inf' : v; }));
      if (GTP.UI.toast) GTP.UI.toast('Game saved');
      return true;
    } catch (e) {
      if (GTP.UI.toast) GTP.UI.toast('Could not save (storage blocked)');
      return false;
    }
  };
  Game.prototype.load = function () {
    var raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
    if (!raw) return false;
    var data;
    try { data = JSON.parse(raw, function (k, v) { return v === 'inf' ? Infinity : v; }); } catch (e) { if (GTP.UI.toast) GTP.UI.toast('Save file is corrupt'); return false; }
    if (!data || data.version !== 2) { if (GTP.UI.toast) GTP.UI.toast('Save file is from another version'); return false; }
    try {
      this.newGame(data.seed | 0);
      var p = this.player;
      p.money = data.money | 0; this.debug.teleport(data.x, data.z); p.yaw = data.yaw || 0;
      p.weapons = data.weapons || { fist: Infinity }; p.weapon = data.weapon || 'fist';
      p.armor = data.armor || 0; p.hp = data.hp || p.maxHp; p.stats = data.stats || p.stats; p.cameraMode = data.cameraMode || 'chase';
      (data.completed || []).forEach(function (id) { GTP.Missions.state.completed.add(id); });
      GTP.Missions.state.flags = data.flags || {};
      this.time.clock = typeof data.clock === 'number' ? data.clock : C.DAY.startClock;
      this.time.day = data.day || 1;
      if (GTP.Audio.radio && GTP.Audio.radio.setStation) GTP.Audio.radio.setStation(data.radioStation | 0);
      GTP.Render.rig.snap();
      this.setState('playing');
      if (GTP.UI.toast) GTP.UI.toast('Game loaded');
      return true;
    } catch (e) {
      U.reportError(e, 'load');
      if (GTP.UI.toast) GTP.UI.toast('Could not load the save');
      return false;
    }
  };

  // ----------------------------------------------------------------- debug --
  Game.prototype._makeDebug = function () {
    var g = this;
    return {
      teleport: function (x, z, y) {
        var p = g.player; if (!p) return;
        p.x = x; p.z = z; p.y = y != null ? y : GTP.World.heightAt(x, z, y || 0); p._px = p.x; p._py = p.y; p._pz = p.z; p.vx = p.vz = p.vy = 0; p.onGround = true;
        if (p._sh) GTP.Entities.hash.update(p);
        GTP.Render.rig.snap(); GTP.Render.updateCamera(0);
      },
      spawnVehicle: function (x, z, type) {
        if (!GTP.Vehicle) return null;
        var v = new GTP.Vehicle({ x: x, z: z, type: type || 'sedan' });
        v.y = GTP.World.heightAt(x, z, 0);
        var d = GTP.World.roadDir(x, z, v.y); if (d) v.yaw = U.dirToYaw(d.dx, d.dz);
        GTP.Entities.add(v); return v;
      },
      giveWeapon: function (id, ammo) { var p = g.player; if (!p) return; p.weapons[id] = (p.weapons[id] || 0) + (ammo == null ? 50 : ammo); p.weapon = id; },
      setWanted: function (n) { var p = g.player; if (!p) return; p.wanted = U.clamp(n | 0, 0, 5); var th = C.WANTED.thresholds; p.heat = p.wanted ? th[p.wanted - 1] : 0; if (GTP.AI.wanted) { GTP.AI.wanted.level = p.wanted; GTP.AI.wanted.heat = p.heat; } },
      setMoney: function (n) { if (g.player) g.player.money = n | 0; },
      startMission: function (id) { return GTP.Missions.start(id); },
      completeObjective: function () { return GTP.Missions.completeObjective(); },
      completeMission: function () { var a = GTP.Missions.state.active; var guard = 0; while (GTP.Missions.state.active && GTP.Missions.state.active === a && guard++ < 50) { if (GTP.Missions.completeObjective() === false) break; } },
      godMode: function (on) { if (g.player) g.player.godMode = on !== false; },
      listLandmarks: function () { return GTP.World.landmarks.map(function (l) { return { id: l.id, name: l.name, kind: l.kind, district: l.district, x: Math.round(l.x), z: Math.round(l.z), door: l.door ? { x: l.door.x, z: l.door.z } : null }; }); },
      setClock: function (h) { g.time.clock = ((h % 24) + 24) % 24; GTP.Render.updateEnvironment(g.time.clock); },
      freeCam: function (x, y, z, lx, ly, lz) { GTP.Render.freeCam(true); var c = GTP.Render.camera; c.position.set(x, y, z); if (lx != null) c.lookAt(lx, ly, lz); },
      followCam: function () { GTP.Render.freeCam(false); },
      snapshot: function () {
        var p = g.player || {}, W = GTP.World;
        var d = p.x != null ? W.districtAt(p.x, p.z) : null;
        return {
          state: g.state, t: +g.time.t.toFixed(2), clock: +g.time.clock.toFixed(3), day: g.time.day, fps: +g.fps.toFixed(1), steps: g.steps, frames: g.frames,
          player: { x: +(p.x || 0).toFixed(2), y: +(p.y || 0).toFixed(2), z: +(p.z || 0).toFixed(2), yaw: +(p.yaw || 0).toFixed(3), hp: p.hp, money: p.money, wanted: p.wanted, weapon: p.weapon, vehicle: p.vehicle ? p.vehicle.type : null, onGround: p.onGround, cameraMode: p.cameraMode },
          district: d ? d.id : null, street: p.x != null ? W.streetAt(p.x, p.z, p.y) : null,
          mission: GTP.Missions.state.active, entities: GTP.Entities.list.length, errors: GTP.errors.length,
          render: { chunks: GTP.Render.chunks.size, tris: GTP.Render.stats.triangles, calls: GTP.Render.stats.calls, frameMs: +GTP.Render.stats.frameMs.toFixed(1), night: +GTP.Render.night.toFixed(2) }
        };
      },
      errors: function () { return GTP.errors.slice(); }
    };
  };

  GTP.Game = Game;

  function autoboot() {
    if (window.GTP_NO_AUTOBOOT) return;
    try {
      GTP.game = new Game();
      GTP.game.boot();
    } catch (e) { U.reportError(e, 'autoboot'); }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoboot);
    else autoboot();
  }
})();
