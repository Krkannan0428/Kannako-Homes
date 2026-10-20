/* Grand Theft Pundit: 30_game.js
 * GTP.Game: boot, URL params, state machine, fixed-step loop with accumulator
 * and max-steps guard, headless advance, render, time/clock, the v3 save
 * system (three slots, autosave, the v2 migration), the staged loading flow
 * (GTP.game.loading for the UI loading screen), slow motion (timeScale) and
 * the debug API. The player is a GTP.Player (06_entities) spawned at the
 * GTP.Content.world.playerSpawn landmark door with the cast "player" look.
 *
 * Saves (GDD_EXPANSION §6.3): localStorage['gtp.save.v3.slot' + n] (n 1..3) is
 * JSON {version:3, slot, seed, savedAt, playTime, money, subs, x, z, yaw, hp,
 * armor, weapon, weapons, ammo, completed, flags, stats, failed, bestTimes,
 * clock, day, radioStation, cameraMode, memos, strands, waypoint, vehicle,
 * summary}. Modules add their own fields through GTP.SaveHooks
 * ([{name, save(data), load(data)}]); the strands runtime registers one.
 * The old single save ('gtp.save.v2') is migrated into slot 1 once at boot
 * when slot 1 is empty; the old key is left alone.
 *
 * Loading: every boot, New Game and Load runs World.generate (synchronous,
 * it reports 'load:progress' stages) and then the chunk prebuild around the
 * spawn over animation frames (Render.prebuild with onDone) while
 * GTP.game.loading = {active, fraction, label, stage, reason} drives the UI
 * loading screen; the loop renders but does not step until it is done.
 * Headless mode is synchronous and never shows the screen.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util;
  var LEGACY_KEY = 'gtp.save.v2';
  var SLOTS = 3;
  var SAVE_VERSION = 3;
  var SIM_STATES = { playing: 1, cutscene: 1 };   // the world keeps running through dialogue; it pauses for a minigame
  var RESPAWN_STATES = { wasted: 1, busted: 1 };
  var PREBUILD_RADIUS = 100;                      // the nine chunks around the spawn (GDD_EXPANSION §6.1); the rest build lazily
  var LOADING_HOLD = 0.3;                         // seconds at 100% before the screen fades

  GTP.SaveHooks = GTP.SaveHooks || [];

  function slotKey(n) { return 'gtp.save.v3.slot' + n; }
  function altSlotKey(n) { return 'gtp.slot.' + n + '.v3'; }   // the task brief's spelling: read as a fallback
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
  function falsy(v) { return v === false || v === 0 || v === '0' || v === 'false' || v === 'no'; }
  function toast(t) { if (GTP.UI && GTP.UI.toast) { try { GTP.UI.toast(t); } catch (e) { /* ui optional */ } } }
  function storeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function storeSet(key, val) { try { localStorage.setItem(key, val); return true; } catch (e) { return false; } }
  function storeDel(key) { try { localStorage.removeItem(key); return true; } catch (e) { return false; } }
  function encode(data) { return JSON.stringify(data, function (k, v) { return v === Infinity ? 'inf' : v; }); }
  function decode(raw) { return JSON.parse(raw, function (k, v) { return v === 'inf' ? Infinity : v; }); }
  function copyWeapons(w) { var out = {}; if (w) for (var k in w) out[k] = w[k]; return out; }

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
    this.timeScale = 1;                 // slow motion (the stunt camera); the loop scales wall time by it
    this.playTime = 0;                  // seconds in playing / cutscene / minigame since the game began (saved)
    this.activeSlot = 1;                // the slot autosave and the pause menu's SAVE write to
    this.loading = { active: false, fraction: 0, label: '', stage: null, reason: null };
    this.fresh = true;                  // a New Game (not a load): the opening cutscene plays once play begins
    this.autosaveDisabled = false;      // one failed autosave per session, then silence
    this._autosavePending = null;
    this._openingPending = false;
    this._loadT = 0;
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
    var self = this;
    // boot profile (ms): render (Assets.init, the scene), newGame (World.generate, entities, the AI warm-up, missions), ui,
    // loading (the prebuild; headless only, live it runs over frames), first (the first frame, headless), atBoot (since page load)
    var bt = this.bootTimes = {}, mark = U.now();
    function lap(k) { var n = U.now(); bt[k] = Math.round(n - mark); mark = n; }
    try {
      GTP.Input.init(hud || gl);
      GTP.Audio.init({ headless: this.headless, mute: truthy(opts.mute) });
      GTP.Render.init(gl); lap('render');
      this._bindEvents();
      this.migrateLegacySave();
      this.newGame(this.seed); lap('newGame');
      bt.generate = Math.round(GTP.World.generateMs || 0);
      if (opts.clock != null && opts.clock !== '') this.debug.setClock(parseFloat(opts.clock));
      GTP.UI.init(); lap('ui');
      this.setState(skipTitle ? 'playing' : 'title');
      // ?mission=<id> starts that mission right away (prerequisites complete, flags and weapons applied, intro skipped unless &intro=1)
      if (opts.mission && GTP.Missions.start) { try { this._prepMission(String(opts.mission), truthy(opts.intro)); } catch (e) { U.reportError(e, 'boot.mission'); } }
      // the opening cutscene belongs to the title's NEW GAME flow (newGame(seed, {opening: true})); ?opening=1 plays it on this boot
      this._openingPending = truthy(opts.opening) && !this.headless && !opts.mission;
      this._beginLoading('boot'); lap('loading');
      if (this.headless) { try { GTP.Render.frame(1); } catch (e) { U.reportError(e, 'boot.render'); } lap('first'); }
    } catch (e) { U.reportError(e, 'boot'); }
    bt.atBoot = Math.round(U.now());
    this.booted = true;
    if (!this.headless && typeof requestAnimationFrame === 'function') {
      this._last = U.now();
      this._raf = requestAnimationFrame(function (ts) { self._loop(ts); });
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { self._last = U.now(); self._acc = 0; });
    }
    try { if (window.claude && window.claude.hot) window.claude.hot.snapshot = function () { return GTP.game.debug.snapshot(); }; } catch (e) { /* optional */ }
    return this;
  };

  Game.prototype._bindEvents = function () {
    var self = this;
    if (this._eventsBound) return;
    this._eventsBound = true;
    GTP.Events.on('load:progress', function (e) {
      if (!e || !self.loading.active) return;
      var frac = e.bar != null ? e.bar : (e.frac != null ? e.frac : self.loading.fraction);
      if (frac > self.loading.fraction) self.loading.fraction = Math.min(1, frac);
      if (e.label) self.loading.label = e.label;
      if (e.stage) self.loading.stage = e.stage;
    });
    // autosave triggers (GDD_EXPANSION §6.3): after a mission (once the outro and any cutscene are over), after a strand cycle,
    // and on entering the pod van while it sits at Gus's Garage
    GTP.Events.on('mission:complete', function (e) { if (!(e && e.replay)) self._autosavePending = 'mission'; });
    GTP.Events.on('strand:cycle', function () { self._autosavePending = 'strand'; });
    GTP.Events.on('vehicle:enter', function (e) {
      if (!e || !e.ped || e.ped.kind !== 'player' || !e.vehicle || e.vehicle.tag !== 'podvan') return;
      if (!self.atHome(e.vehicle)) return;
      if (GTP.Hints && GTP.Hints.fire && GTP.Missions && GTP.Missions.state && GTP.Missions.state.completed.has('m01_van')) GTP.Hints.fire('h_save');
      self.autosave('home');
    });
  };

  // the pod van at Gus's Garage is home: the autosave bay and the minimap's house icon
  Game.prototype.homePoint = function () {
    var lm = GTP.World.landmark ? GTP.World.landmark('pod_garage') : null;
    return lm && lm.door ? { x: lm.door.x, z: lm.door.z, y: lm.door.y || 0 } : null;
  };
  Game.prototype.atHome = function (v) {
    var h = this.homePoint(), e = v || (this.player && this.player.inVehicle);
    return !!(h && e && U.dist2d(e.x, e.z, h.x, h.z) < 40);
  };

  Game.prototype._prepMission = function (id, intro) {
    if (GTP.Missions.prep) { GTP.Missions.prep(id, { intro: !!intro }); return; }
    var all = GTP.Content.missions || [], byId = {};
    all.forEach(function (m) { byId[m.id] = m; });
    var m = byId[id]; if (!m) return;
    var st = GTP.Missions.state;
    (function mark(mm) { (mm.requires || []).forEach(function (r) { if (byId[r] && !st.completed.has(r)) { st.completed.add(r); mark(byId[r]); } }); })(m);
    GTP.Missions.start(id);
  };

  // A fresh city: world, entities, player, AI warm-up, missions. Synchronous (World.generate is); the chunk prebuild
  // around the spawn runs afterwards through _beginLoading (over frames when live, at once in headless).
  // opts: {opening: true} plays cs_opening once play begins (the title's NEW GAME); {noLoading: true} skips the prebuild (load() runs its own)
  Game.prototype.newGame = function (seed, opts) {
    seed = seed | 0;
    this.seed = seed;
    GTP.rng.seed(seed);
    if (GTP.Cutscenes && GTP.Cutscenes.reset) { try { GTP.Cutscenes.reset(); } catch (e) { U.reportError(e, 'cutscenes.reset'); } }
    GTP.World.generate(seed);
    GTP.Render.invalidateAll();
    GTP.Render.fx.clear();
    var E = GTP.Entities;
    for (var i = E.list.length - 1; i >= 0; i--) E.remove(E.list[i]);
    E.list.length = 0; E.hash.clear();
    this.player = null;
    var sp = this._spawnPoint();
    this.player = this._makePlayer(sp);
    this.time = { t: 0, clock: C.DAY.startClock, day: 1 };
    this.steps = 0;
    this.playTime = 0;
    this.timeScale = 1;
    this.fresh = true;
    this._autosavePending = null;
    this._openingPending = !!(opts && opts.opening) && !this.headless;
    if (GTP.AI.reset) GTP.AI.reset();
    if (GTP.Combat && GTP.Combat.reset) GTP.Combat.reset();
    if (GTP.AI.spawner && GTP.AI.spawner.warmup) { try { GTP.AI.spawner.warmup(); } catch (e) { U.reportError(e, 'spawner.warmup'); } }
    GTP.Missions.init();
    if (GTP.Strands && GTP.Strands.init) { try { GTP.Strands.init(); } catch (e) { U.reportError(e, 'strands.init'); } }
    if (GTP.Hints && GTP.Hints.reset) { try { GTP.Hints.reset(); } catch (e) { U.reportError(e, 'hints.reset'); } }
    GTP.Render.freeCam(false);
    GTP.Render.rig.reset();
    GTP.Render.rig.yaw = this.player.yaw;
    GTP.Render.rig.target(this.player);
    GTP.Render.updateCamera(0);
    GTP.Render.updateEnvironment(this.time.clock);
    if (this.booted && !(opts && opts.noLoading)) this._beginLoading('new');
    return this;
  };

  Game.prototype._makePlayer = function (sp) {
    var p = new GTP.Player({ x: sp.x, y: sp.y, z: sp.z });
    p.yaw = 0;
    p.subs = 0;
    p.snap();
    GTP.Entities.add(p);
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

  // ---------------------------------------------------------- loading --
  // The chunk prebuild around the player with the loading screen up. Live: a few chunks per animation frame
  // (Render.prebuild with onDone), the loop renders the screen and holds the simulation; headless: synchronous.
  Game.prototype._beginLoading = function (reason) {
    var self = this, p = this.player, Rd = GTP.Render;
    if (!p || !Rd || !Rd.prebuild) { this.loading.active = false; return; }
    var L = this.loading;
    L.active = true; L.reason = reason; L.stage = 'chunks'; L.fraction = Math.max(L.fraction, 0.7); L.label = 'Building the nine chunks around the spawn';
    GTP.Events.emit('load:begin', { reason: reason });
    function finish() {
      L.fraction = 1; L.stage = 'warmup'; L.label = 'Booking guests';
      if (self.headless) { self._endLoading(); return; }
      self._loadT = LOADING_HOLD;   // the loop counts it down
    }
    try {
      if (this.headless) { Rd.prebuild(p.x, p.z, PREBUILD_RADIUS); finish(); }
      else Rd.prebuild(p.x, p.z, PREBUILD_RADIUS, function (frac, label) { L.fraction = 0.7 + 0.25 * frac; if (label) L.label = label; }, function () { finish(); });
    } catch (e) { U.reportError(e, 'loading.prebuild'); this._endLoading(); }
  };
  Game.prototype._endLoading = function () {
    var L = this.loading; if (!L.active) return;
    L.active = false; L.fraction = 1; L.stage = 'done';
    this._last = U.now(); this._acc = 0;
    GTP.Events.emit('load:done', { reason: L.reason });
    L.fraction = 0;
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
    // the UI gets the frame first: title / pause / phone / dialogue menus consume their keys and return true
    if (GTP.UI && GTP.UI.handleInput) { try { if (GTP.UI.handleInput(this.state)) return; } catch (e) { U.reportError(e, 'ui.handleInput'); } }
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

  // the opening cutscene (GDD_EXPANSION §4.2) once play begins on a fresh game, after the loading screen
  Game.prototype._maybeOpening = function () {
    if (!this._openingPending || this.state !== 'playing' || this.loading.active) return;
    var Cs = GTP.Cutscenes, Ms = GTP.Missions;
    if (!Cs || !Cs.playOnce || !Cs.scriptFor || !Cs.scriptFor('cs_opening')) { this._openingPending = false; return; }
    if (Ms && Ms.state && Ms.state.active) { this._openingPending = false; return; }
    this._openingPending = false;
    var self = this;
    Cs.playOnce('cs_opening', function () { if (GTP.Hints && GTP.Hints.fire) GTP.Hints.fire('h_move'); self._autosavePending = null; });
  };

  // one fixed step: Input -> player -> Missions -> AI -> entities -> Combat -> fx -> clock -> UI -> camera
  Game.prototype.step = function () {
    var dt = C.STEP;
    // the weapon wheel's slow motion: while it is open Combat runs the input / menus / camera tick alone on 4 of every 5 steps
    if (GTP.Combat && GTP.Combat.wheelStep && GTP.Combat.wheelStep(this)) return;
    try {
      GTP.Input.beginFrame();
      this._tickLoading(dt);
      this._handleGlobalInput();
      this._maybeOpening();
      if (this.state === 'playing' && this.player && this.player.control) this.player.control(dt);
      if (SIM_STATES[this.state]) {
        if (GTP.Cutscenes && GTP.Cutscenes.active && GTP.Cutscenes.update) GTP.Cutscenes.update(dt);
        GTP.Missions.update(dt);
        if (GTP.Strands && GTP.Strands.update) GTP.Strands.update(dt);
        GTP.AI.update(dt);
        GTP.Entities.update(dt);
        GTP.Combat.update(dt);
        GTP.Render.fx.update(dt);
        this.time.t += dt;
        this.playTime += dt;
        this.time.clock += dt / C.DAY.secondsPerHour;
        if (this.time.clock >= 24) { this.time.clock -= 24; this.time.day++; }
        if (this._autosavePending && this.state === 'playing') { var why = this._autosavePending; if (this.autosave(why) || !this._autosaveBlocked(why)) this._autosavePending = null; }
      } else if (this.state === 'minigame') {
        // the world is paused: only the mission runtime (minigame hooks, fallback) and fx tick
        GTP.Missions.update(dt);
        GTP.Render.fx.update(dt);
        this.playTime += dt;
      } else if (RESPAWN_STATES[this.state]) {
        GTP.Combat.update(dt);
        if (GTP.AI.updateRespawn) GTP.AI.updateRespawn(dt);   // the AI's fallback DEPLATFORMED flow until Combat owns it
        GTP.Render.fx.update(dt);
      }
      if (GTP.Hints && GTP.Hints.update) GTP.Hints.update(dt);
      if (GTP.Audio.update) GTP.Audio.update(dt);
      GTP.UI.update(dt);
      GTP.Render.updateCamera(dt);
      if (GTP.Strands && GTP.Strands.afterCamera) GTP.Strands.afterCamera(dt);   // the stunt side view rides on top of the rig
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
  // the loading screen frame: the HUD overlay only (the UI draws the screen from GTP.game.loading); the scene waits for its
  // chunks. These frames are not counted: `frames` is the number of rendered game frames
  Game.prototype._renderLoading = function () {
    var Rd = GTP.Render;
    try {
      if (Rd.hudCtx) { var ctx = Rd.hudCtx; ctx.clearRect(0, 0, Rd.width, Rd.height); if (GTP.UI && GTP.UI.draw) GTP.UI.draw(ctx, Rd.width, Rd.height); }
    } catch (e) { U.reportError(e, 'render.loading'); }
  };
  // the 0.3 s hold at 100% (the prebuild is done): counted down by the loop, or by step() when a test drives the game itself
  Game.prototype._tickLoading = function (dt) {
    if (!this.loading.active || !(this._loadT > 0)) return;
    this._loadT -= dt;
    if (this._loadT <= 0) { this._loadT = 0; this._endLoading(); }
  };

  Game.prototype._loop = function (ts) {
    var self = this;
    this._raf = requestAnimationFrame(function (t2) { self._loop(t2); });
    var now = ts || U.now();
    var dt = (now - this._last) / 1000;
    this._last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > C.MAX_FRAME_DT) dt = C.MAX_FRAME_DT;
    if (this.loading.active) {
      // hold the simulation while the chunks build; the UI draws the bar
      this._tickLoading(dt);
      this._acc = 0;
      this._renderLoading();
      return;
    }
    this._acc += dt * (this.timeScale > 0 ? this.timeScale : 1);
    var n = 0;
    while (this._acc >= C.STEP && n < C.MAX_STEPS) { this.step(); this._acc -= C.STEP; n++; }
    if (n >= C.MAX_STEPS && this._acc >= C.STEP) this._acc = 0;
    this.render(this._acc / C.STEP);
    this._fpsN++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this.fps = this._fpsN / this._fpsT; this._fpsN = 0; this._fpsT = 0; }
  };

  // ------------------------------------------------------------- save/load --
  Game.prototype.serialize = function (slot, extra) {
    var p = this.player; if (!p) return null;
    var Ms = GTP.Missions, st = Ms.state || {}, W = GTP.World;
    var v = p.inVehicle;
    var data = {
      version: SAVE_VERSION, slot: slot | 0, seed: this.seed, savedAt: Date.now(), playTime: Math.round(this.playTime),
      money: p.money | 0, subs: p.subs | 0, x: p.x, z: p.z, y: p.y, yaw: p.yaw, hp: p.hp, armor: p.armor || 0,
      weapon: p.weapon || 'fist', weapons: copyWeapons(p.weapons), ammo: p.ammo ? JSON.parse(encode(p.ammo), function (k, vv) { return vv === 'inf' ? Infinity : vv; }) : {},
      completed: Array.from(st.completed || []), flags: Object.assign({}, st.flags || {}), stats: Object.assign({}, p.stats || {}), failed: Object.assign({}, st.failed || {}),
      bestTimes: Object.assign({}, st.bestTimes || {}),
      clock: this.time.clock, day: this.time.day, radioStation: GTP.Audio.station || 0, cameraMode: p.cameraMode || 'chase',
      memos: [], strands: {}, waypoint: this.waypoint || null,
      vehicle: v && !v.wreck && !v.sinking ? { type: v.type, wrap: v.wrap || null, color: v.color || null, tag: v.tag || null, x: v.x, z: v.z, yaw: v.yaw, hp: v.hp } : null,
      settingsSnapshot: null,
      reason: extra && extra.reason ? extra.reason : 'manual', auto: !!(extra && extra.auto)
    };
    for (var i = 0; i < GTP.SaveHooks.length; i++) { var h = GTP.SaveHooks[i]; if (h && typeof h.save === 'function') { try { h.save(data); } catch (e) { U.reportError(e, 'save.hook ' + (h.name || i)); } } }
    data.summary = this._summary(data);
    void W;
    return data;
  };
  Game.prototype._summary = function (data) {
    var Ms = GTP.Missions, W = GTP.World, p = this.player;
    var all = Ms && Ms.allMissions ? Ms.allMissions() : ((GTP.Content && GTP.Content.missions) || []);
    var ids = {}, n = 0, last = null;
    for (var i = 0; i < all.length; i++) ids[all[i].id] = all[i];
    (data.completed || []).forEach(function (id) { if (ids[id]) { n++; last = ids[id]; } });
    var d = W && W.districtAt && data.x != null ? W.districtAt(data.x, data.z) : null;
    var lm = null, bd = 1e9;
    if (W && W.landmarks) for (i = 0; i < W.landmarks.length; i++) { var l = W.landmarks[i], dd = U.dist2d(data.x, data.z, l.x, l.z); if (dd < bd) { bd = dd; lm = l; } }
    var lmLabel = lm ? ((GTP.UI && GTP.UI.landmarkLabel) ? GTP.UI.landmarkLabel(lm) : (lm.label || lm.name)) : null;
    return { missions: n, missionsTotal: all.length, lastMission: last ? last.title : null, district: d ? (d.name || d.id) : null, landmark: lmLabel, wanted: p ? (p.wanted | 0) : 0, money: data.money, playTime: data.playTime, savedAt: data.savedAt, seed: data.seed, clock: data.clock, day: data.day };
  };

  // restore everything but the world (newGame(seed) already ran)
  Game.prototype.applyData = function (data) {
    var p = this.player, Ms = GTP.Missions;
    p.money = data.money | 0; p.subs = data.subs | 0;
    this.debug.teleport(data.x, data.z); p.yaw = data.yaw || 0; p.moveYaw = p.yaw; p.aimYaw = p.yaw;
    p.weapons = data.weapons ? copyWeapons(data.weapons) : { fist: Infinity }; if (!p.weapons.fist) p.weapons.fist = Infinity;
    p.weapon = data.weapon && p.weapons[data.weapon] ? data.weapon : 'fist';
    p.ammo = {}; if (data.ammo && typeof data.ammo === 'object') for (var k in data.ammo) { var a = data.ammo[k]; if (a && p.weapons[k]) p.ammo[k] = { mag: a.mag, reserve: a.reserve, total: a.total != null ? a.total : (a.mag + a.reserve) }; }
    p.armor = data.armor || 0; p.hp = data.hp || p.maxHp; p.stats = data.stats || p.stats; p.cameraMode = data.cameraMode || 'chase';
    (data.completed || []).forEach(function (id) { Ms.state.completed.add(id); });
    Ms.state.flags = data.flags || {};
    if (data.failed) Ms.state.failed = data.failed;
    if (data.bestTimes) Ms.state.bestTimes = data.bestTimes;
    this.time.clock = typeof data.clock === 'number' ? data.clock : C.DAY.startClock;
    this.time.day = data.day || 1;
    this.playTime = data.playTime || 0;
    this.waypoint = data.waypoint || null;
    if (GTP.Audio.radio && GTP.Audio.radio.setStation) GTP.Audio.radio.setStation(data.radioStation | 0);
    for (var i = 0; i < GTP.SaveHooks.length; i++) { var h = GTP.SaveHooks[i]; if (h && typeof h.load === 'function') { try { h.load(data); } catch (e) { U.reportError(e, 'load.hook ' + (h.name || i)); } } }
    // the car the player sat in comes back under them (the pod van is home; it respawns at the garage either way)
    if (data.vehicle && GTP.Vehicle && data.vehicle.type && C.VEHICLES[data.vehicle.type]) {
      try {
        var sv = data.vehicle, veh = this.debug.spawnVehicle(sv.x != null ? sv.x : p.x, sv.z != null ? sv.z : p.z, sv.type, { color: sv.color || undefined, wrap: sv.wrap || undefined, yaw: sv.yaw, tag: sv.tag || undefined });
        if (veh) { if (sv.hp) veh.hp = Math.min(veh.hp, sv.hp); if (sv.tag === 'podvan' || sv.tag === 'sponsorvan') veh.persistent = true; veh.enter(p, 0); }
      } catch (e) { U.reportError(e, 'load.vehicle'); }
    }
    if (Ms.refreshMarkers) Ms.refreshMarkers();
    GTP.Render.updateEnvironment(this.time.clock);
    GTP.Render.rig.snap();
    this.fresh = false;
    this._openingPending = false;
  };

  Game.prototype.slots = function () {
    var out = [];
    for (var n = 1; n <= SLOTS; n++) {
      var raw = storeGet(slotKey(n)) || storeGet(altSlotKey(n)), meta = null, corrupt = false;
      if (raw) { try { var d = decode(raw); if (d && d.version === SAVE_VERSION) meta = d.summary || this._summary(d); else corrupt = true; } catch (e) { corrupt = true; } }
      out.push({ slot: n, empty: !meta, corrupt: corrupt, meta: meta });
    }
    return out;
  };
  Game.prototype.hasSave = function () {
    var s = this.slots();
    for (var i = 0; i < s.length; i++) if (!s[i].empty) return true;
    return !!storeGet(LEGACY_KEY);
  };
  Game.prototype.latestSlot = function () {
    var s = this.slots(), best = 0, bt = -1;
    for (var i = 0; i < s.length; i++) if (!s[i].empty && (s[i].meta.savedAt || 0) > bt) { bt = s[i].meta.savedAt || 0; best = s[i].slot; }
    return best;
  };
  // opts: {auto, reason, quiet}
  Game.prototype.saveSlot = function (n, opts) {
    opts = opts || {};
    n = n | 0; if (n < 1 || n > SLOTS) n = this.activeSlot || 1;
    var data = this.serialize(n, opts); if (!data) return false;
    var ok = storeSet(slotKey(n), encode(data));
    if (ok) {
      this.activeSlot = n;
      if (!opts.auto && !opts.quiet) toast('Game saved to slot ' + n);
      GTP.Events.emit('saved', { slot: n, reason: opts.reason || 'manual', auto: !!opts.auto, meta: data.summary });
      return true;
    }
    if (!opts.quiet) toast(opts.auto ? 'Autosave failed (storage blocked)' : 'Could not save (storage blocked)');
    GTP.Events.emit('save:failed', { slot: n, reason: opts.reason || 'manual', auto: !!opts.auto });
    return false;
  };
  Game.prototype.loadSlot = function (n) {
    n = n | 0;
    var raw = storeGet(slotKey(n)) || storeGet(altSlotKey(n));
    if (!raw) return false;
    var data;
    try { data = decode(raw); } catch (e) { toast('Save file is corrupt'); return false; }
    if (!data || data.version !== SAVE_VERSION) { toast('Save file is from another version'); return false; }
    return this._loadData(data, n);
  };
  Game.prototype._loadData = function (data, slot) {
    try {
      if (GTP.Missions.state && GTP.Missions.state.active && GTP.Missions.abort) GTP.Missions.abort();
      this.newGame(data.seed | 0, { noLoading: true });
      this.applyData(data);
      if (slot) this.activeSlot = slot;
      this.setState('playing');
      this._beginLoading('load');
      toast('Game loaded' + (slot ? ' (slot ' + slot + ')' : ''));
      GTP.Events.emit('loaded', { slot: slot || 0, meta: data.summary || null });
      return true;
    } catch (e) {
      U.reportError(e, 'load');
      toast('Could not load the save');
      return false;
    }
  };
  Game.prototype.deleteSlot = function (n) {
    n = n | 0; if (n < 1 || n > SLOTS) return false;
    var had = !!(storeGet(slotKey(n)) || storeGet(altSlotKey(n)));
    storeDel(slotKey(n)); storeDel(altSlotKey(n));
    if (had) GTP.Events.emit('save:deleted', { slot: n });
    return had;
  };
  // the old single save becomes slot 1 once (play time unknown, the summary rebuilt); the old key stays
  Game.prototype.migrateLegacySave = function () {
    var raw = storeGet(LEGACY_KEY); if (!raw) return false;
    if (storeGet(slotKey(1)) || storeGet(altSlotKey(1))) return false;
    var old;
    try { old = decode(raw); } catch (e) { return false; }
    if (!old || old.version !== 2) return false;
    var data = this.upgradeLegacy(old);
    var ok = storeSet(slotKey(1), encode(data));
    if (ok) GTP.Events.emit('save:migrated', { slot: 1 });
    return ok;
  };
  Game.prototype.upgradeLegacy = function (old) {
    var data = {
      version: SAVE_VERSION, slot: 1, seed: old.seed | 0, savedAt: Date.now(), playTime: 0, money: old.money | 0, subs: 0,
      x: old.x, z: old.z, yaw: old.yaw || 0, hp: old.hp || 100, armor: old.armor || 0, weapon: old.weapon || 'fist', weapons: old.weapons || { fist: Infinity }, ammo: {},
      completed: old.completed || [], flags: old.flags || {}, stats: old.stats || {}, failed: {}, bestTimes: {},
      clock: typeof old.clock === 'number' ? old.clock : C.DAY.startClock, day: old.day || 1, radioStation: old.radioStation | 0, cameraMode: old.cameraMode || 'chase',
      memos: [], strands: {}, waypoint: null, vehicle: null, settingsSnapshot: null, reason: 'migrated', auto: false
    };
    data.summary = this._summary(data);
    data.summary.migrated = true;
    return data;
  };
  // the classic API: save() into the active slot, load() the most recent slot (or the old v2 save when nothing migrated)
  Game.prototype.save = function (opts) { return this.saveSlot(this.activeSlot || 1, opts); };
  Game.prototype.load = function (n) {
    var slot = n ? (n | 0) : this.latestSlot();
    if (slot) return this.loadSlot(slot);
    var raw = storeGet(LEGACY_KEY); if (!raw) return false;
    var old;
    try { old = decode(raw); } catch (e) { toast('Save file is corrupt'); return false; }
    if (!old || old.version !== 2) { toast('Save file is from another version'); return false; }
    return this._loadData(this.upgradeLegacy(old), 0);
  };
  // never during a mission, a strand, a wanted level or a cutscene (GDD_EXPANSION §6.3)
  Game.prototype._autosaveBlocked = function () {
    var p = this.player, Ms = GTP.Missions, St = GTP.Strands, Cs = GTP.Cutscenes;
    if (!p || this.state !== 'playing' || this.loading.active) return true;
    if (Ms && Ms.state && Ms.state.active) return true;
    if (St && St.active && St.active()) return true;
    if (Cs && Cs.active) return true;
    if ((p.wanted | 0) > 0) return true;
    if (!p.alive) return true;
    return false;
  };
  Game.prototype.autosave = function (reason) {
    if (this.autosaveDisabled || !this.player) return false;
    if (this._autosaveBlocked(reason)) return false;
    var ok = this.saveSlot(this.activeSlot || 1, { auto: true, reason: reason || 'auto', quiet: true });
    if (!ok) { this.autosaveDisabled = true; toast('Autosave is off: storage is blocked'); }
    return ok;
  };

  // ----------------------------------------------------------------- debug --
  Game.prototype._makeDebug = function () {
    var g = this;
    return {
      // moves the player (and the vehicle they sit in); y defaults to the surface under (x, z)
      teleport: function (x, z, y) {
        var p = g.player; if (!p) return;
        var ty = y != null ? y : GTP.World.heightAt(x, z, y || 0), v = p.inVehicle;
        if (v) { v.x = x; v.z = z; v.y = ty; v.vx = v.vz = v.vy = 0; v.speed = 0; v.lateral = 0; v.angVel = 0; v.onGround = true; v.snap(); if (v._sh) GTP.Entities.hash.update(v); }
        p.x = x; p.z = z; p.y = ty; p.vx = p.vz = p.vy = 0; p.onGround = true; p.swimming = false; p.knockedDown = false; p.snap();
        if (p._sh) GTP.Entities.hash.update(p);
        GTP.Render.rig.snap(); GTP.Render.updateCamera(0);
      },
      // opts: {color, yaw, wrap:'pod', locked, y, tag}
      spawnVehicle: function (x, z, type, opts) {
        if (!GTP.Vehicle) return null;
        opts = opts || {};
        var v = new GTP.Vehicle({ x: x, z: z, type: type || 'sedan', color: opts.color, wrap: opts.wrap, locked: opts.locked, tag: opts.tag });
        v.y = opts.y != null ? opts.y : GTP.World.heightAt(x, z, 0);
        if (opts.yaw != null) v.yaw = opts.yaw;
        else { var d = GTP.World.roadDir(x, z, v.y); if (d) v.yaw = U.dirToYaw(d.dx, d.dz); }
        v.snap();
        GTP.Entities.add(v); return v;
      },
      spawnPed: function (x, z, look, role) {
        var district = GTP.World.districtAt(x, z), did = district ? district.id : 'downtown';
        var lk = look || GTP.Content.world.spawn.peds.rollLook(did, role || 'civ');
        var p = new GTP.Ped({ x: x, z: z, look: lk, role: role || lk.role || 'civ' });
        p.y = GTP.World.heightAt(x, z, 0); p.snap();
        GTP.Entities.add(p); return p;
      },
      giveWeapon: function (id, ammo) { var p = g.player; if (!p) return; p.weapons[id] = (p.weapons[id] || 0) + (ammo == null ? 50 : ammo); p.weapon = id; },
      setWanted: function (n) { var p = g.player; if (!p) return; p.wanted = U.clamp(n | 0, 0, 5); var th = C.WANTED.thresholds; p.heat = p.wanted ? th[p.wanted - 1] : 0; if (GTP.AI.wanted) { if (GTP.AI.wanted.set) GTP.AI.wanted.set(p.wanted); else { GTP.AI.wanted.level = p.wanted; GTP.AI.wanted.heat = p.heat; } } },
      setMoney: function (n) { if (g.player) g.player.money = n | 0; },
      startMission: function (id) { return GTP.Missions.start(id); },
      completeObjective: function () { return GTP.Missions.completeObjective(); },
      completeMission: function () { var a = GTP.Missions.state.active; var guard = 0; while (GTP.Missions.state.active && GTP.Missions.state.active === a && guard++ < 50) { if (GTP.Missions.completeObjective() === false) break; } },
      godMode: function (on) { if (g.player) g.player.godMode = on !== false; },
      listLandmarks: function () { return GTP.World.landmarks.map(function (l) { return { id: l.id, name: l.name, kind: l.kind, district: l.district, x: Math.round(l.x), z: Math.round(l.z), door: l.door ? { x: l.door.x, z: l.door.z } : null }; }); },
      setClock: function (h) { g.time.clock = ((h % 24) + 24) % 24; GTP.Render.updateEnvironment(g.time.clock); },
      freeCam: function (x, y, z, lx, ly, lz) { GTP.Render.freeCam(true); var c = GTP.Render.camera; c.position.set(x, y, z); if (lx != null) c.lookAt(lx, ly, lz); },
      followCam: function () { GTP.Render.freeCam(false); },
      // the graphics track's hooks: weather state ('clear' | 'overcast' | 'rain', instant unless false) and a quality preset
      setWeather: function (state, instant) { return GTP.Render.weather ? GTP.Render.weather.set(state, instant !== false) : false; },
      setQuality: function (preset) { return GTP.Render.quality ? GTP.Render.quality.set(preset) : false; },
      playCutscene: function (id) { return GTP.Cutscenes && GTP.Cutscenes.play ? GTP.Cutscenes.play(id) : false; },
      snapshot: function () {
        var p = g.player || {}, W = GTP.World;
        var d = p.x != null ? W.districtAt(p.x, p.z) : null;
        return {
          state: g.state, t: +g.time.t.toFixed(2), clock: +g.time.clock.toFixed(3), day: g.time.day, fps: +g.fps.toFixed(1), steps: g.steps, frames: g.frames, playTime: Math.round(g.playTime), slot: g.activeSlot, loading: g.loading.active,
          player: { x: +(p.x || 0).toFixed(2), y: +(p.y || 0).toFixed(2), z: +(p.z || 0).toFixed(2), yaw: +(p.yaw || 0).toFixed(3), hp: p.hp, armor: p.armor, money: p.money, subs: p.subs | 0, wanted: p.wanted, weapon: p.weapon, vehicle: p.inVehicle ? p.inVehicle.type : null, speed: +((p.inVehicle ? p.inVehicle.speed : p.speed) || 0).toFixed(2), state: p.state, onGround: p.onGround, swimming: !!p.swimming, cameraMode: p.cameraMode },
          district: d ? d.id : null, street: p.x != null ? W.streetAt(p.x, p.z, p.y) : null,
          mission: GTP.Missions.state.active, strand: GTP.Strands && GTP.Strands.active ? GTP.Strands.active() : null, cutscene: !!(GTP.Cutscenes && GTP.Cutscenes.active),
          entities: GTP.Entities.list.length, errors: GTP.errors.length,
          render: { chunks: GTP.Render.chunks.size, tris: GTP.Render.stats.triangles, calls: GTP.Render.stats.calls, frameMs: +GTP.Render.stats.frameMs.toFixed(1), night: +GTP.Render.night.toFixed(2) }
        };
      },
      errors: function () { return GTP.errors.slice(); }
    };
  };

  Game.SLOTS = SLOTS;
  Game.SAVE_VERSION = SAVE_VERSION;
  Game.slotKey = slotKey;
  Game.LEGACY_KEY = LEGACY_KEY;
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
