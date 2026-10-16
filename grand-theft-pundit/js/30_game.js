/* Grand Theft Pundit: 30_game.js
 * GTP.Game: boot, URL params, state machine, fixed-step loop with accumulator
 * and max-steps guard, headless advance, render, save/load, debug API.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util;
  var SAVE_KEY = 'gtp.save.v1';
  var SIM_STATES = { playing: 1, cutscene: 1, minigame: 1 };

  function parseParams() {
    var out = {};
    try {
      var q = (typeof location !== 'undefined' && location.search) ? location.search.slice(1) : '';
      q.split('&').forEach(function (kv) {
        if (!kv) return;
        var p = kv.split('='), k = decodeURIComponent(p[0]), v = p.length > 1 ? decodeURIComponent(p[1]) : '1';
        out[k] = v;
      });
    } catch (e) { /* no location (tests, inlined pages) */ }
    return out;
  }
  function truthy(v) { return v === true || v === 1 || v === '1' || v === 'true' || v === 'yes'; }

  function Game() {
    this.state = 'title';
    this.prevState = 'title';
    this.time = { t: 0, clock: C.DAY.startClock, day: 1 };
    this.player = null;
    this.headless = false;
    this.debugMode = false;
    this.seed = 1;
    this.opts = {};
    this.booted = false;
    this.steps = 0;
    this.frames = 0;
    this.fps = 0;
    this._acc = 0;
    this._last = 0;
    this._fpsT = 0; this._fpsN = 0;
    this._raf = 0;
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
    var skipTitle = truthy(opts.skipTitle) || this.headless;
    var canvas = this.canvas = (typeof document !== 'undefined') ? document.getElementById('game') : null;
    if (!canvas) { U.reportError(new Error('no #game canvas'), 'boot'); return this; }
    try {
      GTP.Input.init(canvas);
      GTP.Render.init(canvas);
      GTP.Audio.init({ headless: this.headless, mute: truthy(opts.mute) });
      this.newGame(this.seed);
      GTP.UI.init();
      if (opts.mission && GTP.Missions.start) {
        try { this._prepMission(String(opts.mission)); } catch (e) { U.reportError(e, 'boot.mission'); }
      }
      this.setState(skipTitle ? 'playing' : 'title');
      // warm the chunk cache around the camera so the first frame is cheap
      try { GTP.Render.frame(1); } catch (e) { U.reportError(e, 'boot.render'); }
    } catch (e) { U.reportError(e, 'boot'); }
    this.booted = true;
    if (!this.headless && typeof requestAnimationFrame === 'function') {
      var self = this;
      this._last = U.now();
      this._raf = requestAnimationFrame(function (ts) { self._loop(ts); });
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { self._last = U.now(); self._acc = 0; });
    }
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
    if (this.player) E.remove(this.player);
    E.clearDynamic();
    E.list.length = 0; E.hash.clear();
    var sp = this._spawnPoint();
    this.player = new GTP.Player({ x: sp.x, y: sp.y });
    E.add(this.player);
    this.time = { t: 0, clock: C.DAY.startClock, day: 1 };
    this.steps = 0;
    if (GTP.AI.spawner && GTP.AI.spawner.warmup) { try { GTP.AI.spawner.warmup(); } catch (e) { U.reportError(e, 'spawner.warmup'); } }
    GTP.Missions.init();
    GTP.Render.cam.free = false;
    GTP.Render.cam.zoom = C.CAMERA.zoomFoot;
    GTP.Render.snapCamera();
    GTP.Render.updateCamera(0);
    return this;
  };

  Game.prototype._spawnPoint = function () {
    var CW = GTP.Content.world, sp = CW.playerSpawn || {};
    var x = sp.x, y = sp.y;
    if (sp.landmark) {
      var lm = GTP.World.landmark(sp.landmark);
      if (lm) { x = lm.x + (sp.dx || 0); y = lm.y + (sp.dy || 0); }
    }
    if (x == null || y == null) { var p = GTP.World.randomSidewalkPoint(); x = p.x; y = p.y; }
    // never spawn inside something solid
    if (GTP.World.solidAt(x, y)) {
      var t = GTP.World.nearestTileOf(x, y, function (tt) { return !GTP.World.isSolidTile(tt); }, 16);
      if (t) { x = (t.tx + 0.5) * C.TILE; y = (t.ty + 0.5) * C.TILE; }
    }
    return { x: x, y: y };
  };

  Game.prototype.setState = function (s) {
    if (s === this.state) return;
    this.prevState = this.state;
    this.state = s;
    if (GTP.UI && GTP.UI.onState) { try { GTP.UI.onState(s, this.prevState); } catch (e) { U.reportError(e, 'ui.onState'); } }
  };

  Game.prototype._handleGlobalInput = function () {
    var In = GTP.Input;
    if (this.state === 'title') {
      if (In.pressed('confirm') || In.pressed('enter')) this.setState('playing');
    } else if (this.state === 'playing') {
      if (In.pressed('pause')) this.setState('paused');
    } else if (this.state === 'paused') {
      if (In.pressed('pause') || In.pressed('back') || In.pressed('confirm')) this.setState('playing');
    }
  };

  // one fixed step: Input -> Missions -> AI -> entities -> Combat -> Camera; then Input.endFrame()
  Game.prototype.step = function () {
    var dt = C.STEP;
    try {
      this._handleGlobalInput();
      // player controller: reads Input and sets intent / vehicle controls
      if (this.state === 'playing' && this.player && this.player.control) this.player.control(dt);
      if (SIM_STATES[this.state]) {
        GTP.Missions.update(dt);
        GTP.AI.update(dt);
        GTP.Entities.update(dt);
        GTP.Combat.update(dt);
        GTP.Render.fx.update(dt);
        this.time.t += dt;
        this.time.clock += dt / C.DAY.secondsPerHour;
        if (this.time.clock >= 24) { this.time.clock -= 24; this.time.day++; }
      }
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
    if (n >= C.MAX_STEPS && this._acc >= C.STEP) this._acc = 0; // drop time instead of spiralling
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
      version: 1, seed: this.seed, money: p.money, x: p.x, y: p.y, weapons: p.weapons, weapon: p.weapon, armor: p.armor, hp: p.hp,
      completed: Array.from(GTP.Missions.state.completed || []), flags: GTP.Missions.state.flags || {}, stats: p.stats || {},
      clock: this.time.clock, day: this.time.day, radioStation: GTP.Audio.station || 0
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
    if (!data || data.version !== 1) { if (GTP.UI.toast) GTP.UI.toast('Save file is from another version'); return false; }
    try {
      this.newGame(data.seed | 0);
      var p = this.player;
      p.money = data.money | 0; p.x = data.x; p.y = data.y; p._px = p.x; p._py = p.y;
      p.weapons = data.weapons || { fist: Infinity }; p.weapon = data.weapon || 'fist';
      p.armor = data.armor || 0; p.hp = data.hp || p.maxHp; p.stats = data.stats || p.stats;
      (data.completed || []).forEach(function (id) { GTP.Missions.state.completed.add(id); });
      GTP.Missions.state.flags = data.flags || {};
      this.time.clock = typeof data.clock === 'number' ? data.clock : C.DAY.startClock;
      this.time.day = data.day || 1;
      if (GTP.Audio.radio && GTP.Audio.radio.setStation) GTP.Audio.radio.setStation(data.radioStation | 0);
      GTP.Entities.hash.update(p);
      GTP.Render.snapCamera();
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
      teleport: function (x, y) { var p = g.player; if (!p) return; p.x = x; p.y = y; p._px = x; p._py = y; p.vx = p.vy = 0; GTP.Entities.hash.update(p); GTP.Render.snapCamera(); },
      spawnVehicle: function (x, y, type) {
        if (!GTP.Vehicle) return null;
        var v = new GTP.Vehicle({ x: x, y: y, type: type || 'sedan' });
        var d = GTP.World.roadDir(x, y); if (d) v.angle = Math.atan2(d.dy, d.dx);
        GTP.Entities.add(v); return v;
      },
      giveWeapon: function (id, ammo) { var p = g.player; if (!p) return; p.weapons[id] = (p.weapons[id] || 0) + (ammo == null ? 50 : ammo); p.weapon = id; },
      setWanted: function (n) { var p = g.player; if (!p) return; p.wanted = U.clamp(n | 0, 0, 5); var th = C.WANTED.thresholds; p.wantedHeat = p.wanted ? th[p.wanted - 1] : 0; if (GTP.AI.wanted) { GTP.AI.wanted.level = p.wanted; GTP.AI.wanted.heat = p.wantedHeat; } },
      setMoney: function (n) { if (g.player) g.player.money = n | 0; },
      startMission: function (id) { return GTP.Missions.start(id); },
      completeObjective: function () { return GTP.Missions.completeObjective(); },
      completeMission: function () { var a = GTP.Missions.state.active; while (GTP.Missions.state.active && GTP.Missions.state.active === a) { if (GTP.Missions.completeObjective() === false) break; } },
      godMode: function (on) { if (g.player) g.player.godMode = on !== false; },
      listLandmarks: function () { return GTP.World.landmarks.map(function (l) { return { id: l.id, name: l.name, kind: l.kind, x: Math.round(l.x), y: Math.round(l.y), district: l.district }; }); },
      freeCam: function (x, y, zoom) { var cam = GTP.Render.cam; cam.free = true; cam.x = cam._px = x; cam.y = cam._py = y; if (zoom) cam.zoom = zoom; },
      followCam: function () { GTP.Render.cam.free = false; GTP.Render.snapCamera(); },
      setClock: function (h) { g.time.clock = ((h % 24) + 24) % 24; },
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
