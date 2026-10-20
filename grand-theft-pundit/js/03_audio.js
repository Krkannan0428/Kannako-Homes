/* Grand Theft Pundit: 03_audio.js
 * GTP.Audio: every sound in the game is WebAudio synthesis, no files.
 *  - lazy AudioContext on unlock() (a user gesture); silent no-op in headless; gain 0 and no voices when muted
 *  - play(name, {x, z, gain}): one-shot SFX with character, attenuated and stereo-panned from the camera rig
 *    (the listener sits at the rig focus, roughly the player's chest, and faces the camera yaw)
 *  - engine(level, cls): the player vehicle's engine loop (saw + sub through a lowpass, four gears, an idle lump,
 *    revs on throttle); it fades out and stops when the player is on foot or the game is not simulating
 *  - the siren loop: one wail following the nearest siren-on police car within earshot, faster with more cars
 *  - heli(on, x, z): rotor thump + turbine whine for the five-star helicopter
 *  - radio: a sixteen-step sequencer playing GTP.Content.radio station patterns (bass, lead, pads per chord bar,
 *    a drum kit from noise and oscillators, swing, jingles, the talk station's bumper / murmur cycle), only
 *    inside a vehicle (fade in and out), R cycles stations, current() for the UI ticker, nowPlaying() text
 *  - v0.3 (vehicles track): engine voices for the motorcycle, the helicopter rotor, the prop and jet engines, the
 *    outboards and the parachute's wind (engine(level, type) picks the voice by type: kind piston / rotor / prop /
 *    jet / outboard / wind); a report per weapon class ('shot' routes to shot_<class>: pistol revolver smg rifle lmg
 *    shotgun sniper launcher heavy thrown special, or shot_suppressed with a suppressor), reloads, cover thuds,
 *    melee hits, the phone, chapter cards, boss stingers, specials, shops and the mod shop, golf, the range,
 *    achievements; hookEvents() wires them to the v0.3 events (PLAN_V03.md "Events")
 * Every public call is guarded: audio never throws into the game loop, and after a few errors it disables itself.
 * Randomness runs on a fork of GTP.rng so sound never perturbs the city's spawn stream.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var U = GTP.util;

  // the contract's SFX names, plus the extras the module adds (swap = weapon switch, static = radio tuning)
  var NAMES = ['shot', 'punch', 'hit', 'explode', 'pickup', 'horn', 'siren', 'enter', 'exit', 'mission', 'fail', 'ui', 'cash', 'debate', 'dunk', 'jump', 'land', 'skid', 'crash'];
  // the arsenal's names (GDD_EXPANSION §2.2): reload = the magazine out / in, reloadDone = the bolt home, hitmark = the hit tick, confirm = the kill chime
  var EXTRA = ['swap', 'static', 'reload', 'reloadDone', 'hitmark', 'confirm'];
  // v0.3: weapon classes, combat feel, vehicles, the phone, story beats, specials, shops, golf, the range, achievements
  var SHOT_CLASSES = ['pistol', 'revolver', 'smg', 'rifle', 'lmg', 'shotgun', 'sniper', 'launcher', 'heavy', 'thrown', 'special', 'suppressed'];
  var V03 = SHOT_CLASSES.map(function (c) { return 'shot_' + c; }).concat([
    'dryFire', 'reloadShell', 'reloadBolt', 'cover', 'coverSlide', 'melee_light', 'melee_heavy', 'melee_counter', 'whoosh',
    'rotorStart', 'chuteOpen', 'bail', 'stall', 'gearUp', 'splash',
    'phoneRing', 'phoneBlip', 'phoneHang', 'chapter', 'bossStinger', 'bossPhase', 'bossDefeat',
    'special_focus', 'special_focusEnd', 'special_shout', 'special_chatmob', 'special_boost', 'specialReady',
    'shopBuy', 'shopBrowse', 'shopDeny', 'modApply', 'modWrench', 'modSpray',
    'golfSwing', 'golfPutt', 'golfCup', 'achievement', 'rangeStart', 'rangeHit', 'rangeMedal', 'door', 'gps']);
  // weapon class (Combat / Content.parity) -> report voice
  var SHOT_MAP = { pistol: 'pistol', handgun: 'pistol', revolver: 'revolver', magnum: 'revolver', smg: 'smg', pdw: 'smg', machinepistol: 'smg',
    rifle: 'rifle', assault: 'rifle', carbine: 'rifle', ar: 'rifle', battle: 'rifle', lmg: 'lmg', mg: 'lmg', machinegun: 'lmg',
    shotgun: 'shotgun', sniper: 'sniper', dmr: 'sniper', marksman: 'sniper', launcher: 'launcher', rocket: 'launcher', grenade: 'launcher',
    heavy: 'heavy', minigun: 'heavy', gatling: 'heavy', thrown: 'thrown', throwable: 'thrown', special: 'special', melee: 'thrown' };
  var LOOKAHEAD = 0.18;        // s of radio notes scheduled ahead of the context clock
  var MAX_VOICES = 28;         // concurrent one-shot voices
  var MAX_ERRORS = 6;          // after this many caught errors the module goes silent for good
  var MIN_GAP = { shot: 0.025, phoneRing: 1.2, chapter: 1, bossStinger: 1, bossDefeat: 1, achievement: 0.4, shopBrowse: 0.04, gps: 0.5, stall: 0.6, rotorStart: 1, door: 0.4, rangeHit: 0.05, hit: 0.04, punch: 0.04, ui: 0.03, crash: 0.06, skid: 0.25, land: 0.05, horn: 0.08, siren: 0.3, enter: 0.1, exit: 0.1, pickup: 0.05, cash: 0.05, explode: 0.05, debate: 0.15, dunk: 0.1, jump: 0.05, mission: 0.5, fail: 0.5, swap: 0.05, static: 0.1, reload: 0.08, reloadDone: 0.08, hitmark: 0.03, confirm: 0.2 };
  // audible range in metres per sound (full volume within 5 m, quadratic falloff to the range)
  var RANGE = { shot: 110, shot_sniper: 220, shot_launcher: 160, shot_suppressed: 30, cover: 30, coverSlide: 25, melee_light: 30, melee_heavy: 36, melee_counter: 36, whoosh: 20,
    rotorStart: 120, chuteOpen: 60, bail: 40, stall: 40, gearUp: 40, splash: 60, dryFire: 15, reloadShell: 24, reloadBolt: 24, rangeHit: 80, golfSwing: 40, golfPutt: 25, golfCup: 30, punch: 28, hit: 40, explode: 240, pickup: 25, horn: 90, siren: 160, enter: 25, exit: 25, mission: 60, fail: 60, ui: 40, cash: 40, debate: 60, dunk: 60, jump: 20, land: 30, skid: 80, crash: 130, swap: 20, static: 20, reload: 24, reloadDone: 24, hitmark: 40, confirm: 40 };
  var SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10] };
  var ROOTS = [110, 87.31, 65.41, 73.42];   // A2, F2, C2, D2: one key per station slot (bass octave)
  // engine profiles per vehicle class: idle / max fundamental (Hz), lowpass base, sub mix, idle lump depth, gears
  var ENGINE = {
    sedan:  { idle: 42, max: 150, cut: 900,  sub: 0.5,  lump: 0.35, gears: 4, wave: 'sawtooth' },
    taxi:   { idle: 44, max: 155, cut: 950,  sub: 0.5,  lump: 0.35, gears: 4, wave: 'sawtooth' },
    cop:    { idle: 46, max: 170, cut: 1050, sub: 0.45, lump: 0.3,  gears: 4, wave: 'sawtooth' },
    sports: { idle: 56, max: 250, cut: 1900, sub: 0.3,  lump: 0.2,  gears: 5, wave: 'sawtooth' },
    suv:    { idle: 38, max: 130, cut: 800,  sub: 0.6,  lump: 0.4,  gears: 4, wave: 'sawtooth' },
    van:    { idle: 36, max: 125, cut: 700,  sub: 0.6,  lump: 0.45, gears: 4, wave: 'sawtooth' },
    truck:  { idle: 26, max: 85,  cut: 500,  sub: 0.85, lump: 0.6,  gears: 5, wave: 'sawtooth' },
    bus:    { idle: 24, max: 80,  cut: 450,  sub: 0.85, lump: 0.6,  gears: 5, wave: 'sawtooth' },
    bike:   { idle: 70, max: 330, cut: 2300, sub: 0.15, lump: 0.15, gears: 5, wave: 'square' },
    // v0.3 (06b_vehicles_air_sea): a sport bike screams higher through six gears; the others are their own synth kinds
    moto:      { idle: 62, max: 360, cut: 2800, sub: 0.2,  lump: 0.28, gears: 6, wave: 'sawtooth' },
    heli:      { kind: 'rotor', idle: 70, max: 96, cut: 320 },
    plane:     { kind: 'prop', idle: 48, max: 150, cut: 1500, blade: 2 },
    jet:       { kind: 'jet', idle: 900, max: 4200, cut: 1700 },
    speedboat: { kind: 'outboard', idle: 38, max: 120, cut: 1300, lump: 0.35 },
    jetski:    { kind: 'outboard', idle: 62, max: 200, cut: 2200, lump: 0.25 },
    parachute: { kind: 'wind', idle: 300, max: 1500, cut: 0 }
  };
  // horn voicings per class: tones (Hz), wave, length, lowpass; air = the slow truck/bus air horn
  var HORN = {
    sedan: { f: [440, 554], w: 'square', dur: 0.5, lp: 1800 }, taxi: { f: [466, 587], w: 'square', dur: 0.45, lp: 1900 },
    sports: { f: [523, 659], w: 'sawtooth', dur: 0.45, lp: 2400 }, suv: { f: [370, 466], w: 'square', dur: 0.55, lp: 1500 },
    van: { f: [349, 440], w: 'square', dur: 0.55, lp: 1400 }, truck: { f: [220, 277], w: 'sawtooth', dur: 0.95, lp: 900, air: true },
    bus: { f: [196, 247], w: 'sawtooth', dur: 1.0, lp: 800, air: true }, bike: { f: [880], w: 'square', dur: 0.22, lp: 3000 },
    cop: { f: [622, 830], w: 'square', dur: 0.4, lp: 2200 },
    moto: { f: [740], w: 'square', dur: 0.26, lp: 3000 }, speedboat: { f: [155, 233], w: 'sawtooth', dur: 1.1, lp: 700, air: true },
    jetski: { f: [988, 1175], w: 'square', dur: 0.2, lp: 3200 }
  };
  // the mod shop's horns (GTP.Vehicles.mod(v, {horn})): played instead of the class voicing
  var HORN_MODS = {
    air: function (out, t) { [185, 233, 277].forEach(function (f, i) { blip(out, t, { type: 'sawtooth', f: f * 0.97, f1: f, glide: 0.08, dur: 1.0, hold: 0.7, g: 0.13, a: 0.06, lp: 1100, detune: i * 5 }); }); return 1.1; },
    clown: function (out, t) { blip(out, t, { type: 'square', f: 520, f1: 400, glide: 0.25, dur: 0.3, g: 0.22, a: 0.01, lp: 2400 }); blip(out, t + 0.32, { type: 'square', f: 660, f1: 700, glide: 0.08, dur: 0.14, g: 0.2, a: 0.01, lp: 2600 }); return 0.5; },
    fanfare: function (out, t) { [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { blip(out, t + i * 0.11, { type: 'sawtooth', f: f, dur: i === 3 ? 0.5 : 0.14, hold: i === 3 ? 0.25 : 0.05, g: 0.16, a: 0.01, lp: 2600 }); }); return 0.9; },
    gavel: function (out, t) { for (var i = 0; i < 2; i++) { hiss(out, t + i * 0.18, { dur: 0.05, g: 0.6, bp: 900, q: 2, a: 0.001 }); blip(out, t + i * 0.18, { type: 'sine', f: 320, f1: 180, dur: 0.08, g: 0.45, a: 0.001 }); } return 0.45; },
    trombone: function (out, t) { [293.7, 277.2, 261.6, 246.9].forEach(function (f, i) { var last = i === 3; blip(out, t + i * 0.3, { type: 'sawtooth', f: f * 1.02, f1: f, glide: 0.06, dur: last ? 0.9 : 0.28, hold: last ? 0.5 : 0.15, g: 0.16, a: 0.02, lp: 1300, vib: last ? 6 : 0, vibDepth: 0.02 }); }); return 2.0; }
  };

  var ctx = null, master = null, comp = null, noiseBuf = null, space = null;
  var vol = { master: 1, music: 1, sfx: 1 };   // the Settings volumes (Audio.setVolumes)
  var bus = { sfx: null, music: null, duck: null, engine: null, siren: null, heli: null };
  var arng = GTP.makeRng ? GTP.makeRng(0xA0D10) : null;
  var voices = [], lastAt = {}, errors = 0, disabled = false, hooked = false;
  var scratch = [], _L = { x: 0, z: 0, yaw: 0, rx: 1, rz: 0 }, _sp = { g: 1, pan: 0 };
  var engine = { level: 0, cls: null, ttl: 0, n: null, rpm: 0.12, off: 0, throttle: 0 };
  var siren = { count: 0, dist: 1e9, g: 0, pan: 0, scanT: 0, n: null, off: 0 };
  var heli = { on: false, level: 0, x: 0, z: 0, ttl: 0, n: null, off: 0, g: 0 };
  var radio = { index: -1, id: null, st: null, pat: null, playing: false, stopped: false, level: 0, live: false, step: 0, steps: 16, nextT: 0, stepDur: 0.15, bpm: 120, root: 110, scale: SCALES.minor, jingleT: 0, cycleBar: -1, pause: 0, duckT: 0, sched: 0 };

  function fail(e, where) {
    errors++;
    if (U && U.reportError) U.reportError(e, where || 'audio');
    if (errors >= MAX_ERRORS && !disabled) { disabled = true; Audio.disabled = true; try { teardown(); } catch (e2) { /* already broken */ } }
  }
  function guarded(fn, where) { return function () { if (disabled) return undefined; try { return fn.apply(null, arguments); } catch (e) { fail(e, where); return undefined; } }; }

  // ----------------------------------------------------------- listener --
  function listener() {
    var R = GTP.Render, rig = R && R.rig, p = GTP.game && GTP.game.player, L = _L;
    if (rig && rig.focus && !(R.free)) { L.x = rig.focus.x; L.z = rig.focus.z; L.yaw = rig.yaw || 0; }
    else if (p) { L.x = p.x; L.z = p.z; L.yaw = p.yaw || 0; }
    var d = U.yawToDir(L.yaw); L.rx = -d.z; L.rz = d.x;
    return L;
  }
  // distance attenuation and stereo pan of a world point relative to the listener
  function spatial(x, z, range, out) {
    if (x == null || z == null || !isFinite(x) || !isFinite(z)) { out.g = 1; out.pan = 0; return out; }
    var L = listener(), dx = x - L.x, dz = z - L.z, d = Math.sqrt(dx * dx + dz * dz);
    var g = d <= 5 ? 1 : U.clamp(1 - (d - 5) / (range - 5), 0, 1);
    out.g = g * g / (1 + d / 60);
    out.pan = d < 0.5 ? 0 : U.clamp((dx * L.rx + dz * L.rz) / d, -1, 1) * 0.75 * Math.min(1, d / 5);
    return out;
  }
  function vehicleAt(x, z) {
    var E = GTP.Entities; if (!E || !E.hash || x == null) return null;
    var list = E.hash.query(x, z, 3, scratch), best = null, bd = 1e9;
    for (var i = 0; i < list.length; i++) { var v = list[i]; if (v.kind !== 'vehicle') continue; var d = U.dist2d(v.x, v.z, x, z); if (d < bd) { bd = d; best = v; } }
    scratch.length = 0;
    return best;
  }
  function vehicleTypeAt(x, z) { var v = vehicleAt(x, z); return v ? v.type : null; }
  // the report class for a 'shot' at (x, z): opts.cls / opts.weapon when the caller knows, else the gun in the hands of the
  // ped nearest the muzzle; a suppressor (weaponMods[id].muzzle, or opts.suppressed) gives the suppressed report
  function weaponDef(id) {
    if (!id) return null;
    var CB = GTP.Combat, W = CB && CB.WEAPONS && CB.WEAPONS[id];
    if (W) return W;
    var P = GTP.Content && GTP.Content.parity && GTP.Content.parity.weapons;
    if (Array.isArray(P)) for (var i = 0; i < P.length; i++) if (P[i] && P[i].id === id) return P[i];
    return null;
  }
  function shotClass(o) {
    if (o.cls && SHOT_MAP[o.cls]) return o.suppressed ? 'suppressed' : SHOT_MAP[o.cls];
    var id = o.weapon || null, ped = null;
    if (!id && o.x != null && GTP.Entities && GTP.Entities.hash) {
      var list = GTP.Entities.hash.query(o.x, o.z, 3, scratch), bd = 9;
      for (var i = 0; i < list.length; i++) { var e = list[i]; if ((e.kind !== 'ped' && e.kind !== 'player') || !e.weapon || e.weapon === 'fist') continue; var d = U.dist2d(e.x, e.z, o.x, o.z); if (d < bd) { bd = d; ped = e; } }
      scratch.length = 0;
      if (ped) id = ped.weapon;
    }
    var mods = ped && ped.weaponMods && id ? ped.weaponMods[id] : null;
    if (o.suppressed || (mods && /supp|silenc/i.test(String(mods.muzzle || '')))) return 'suppressed';
    var def = weaponDef(id);
    if (id === 'revolver' || (def && /revolver|magnum/i.test(def.cls || '') )) return 'revolver';
    var cls = def ? String(def.cls || def['class'] || '').toLowerCase() : '';
    if (def && def.suppressed) return 'suppressed';
    if (cls === 'pistol' && def && def.dmg >= 35) return 'revolver';
    return SHOT_MAP[cls] || SHOT_MAP[String(id || '').toLowerCase()] || 'pistol';
  }

  // ------------------------------------------------------------ context --
  function mkGain(v, dest) { var g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function mkOsc(type, f) { var o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  function mkFilter(type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 1; return b; }
  function makeNoise() {
    var n = Math.floor(ctx.sampleRate * 2), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = arng.random() * 2 - 1;
    return buf;
  }
  function createContext() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = mkGain(Audio.muted ? 0 : vol.master);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    bus.sfx = mkGain(vol.sfx, master); bus.engine = mkGain(0.5 * vol.sfx, master); bus.siren = mkGain(0.65 * vol.sfx, master); bus.heli = mkGain(0.8 * vol.sfx, master);
    // the radio comes out of a car speaker: a band-limited chain with a duck gain for jingles
    var hp = mkFilter('highpass', 90, 0.7), lp = mkFilter('lowpass', 5200, 0.5);
    bus.music = mkGain(0); bus.duck = mkGain(1); bus.music.connect(bus.duck); bus.duck.connect(hp); hp.connect(lp); lp.connect(master);
    // a short feedback delay that gives the big sounds some room
    space = mkGain(1); var dl = ctx.createDelay(0.5); dl.delayTime.value = 0.13; var fb = mkGain(0.32), dlp = mkFilter('lowpass', 2400, 0.5);
    space.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(bus.sfx);
    noiseBuf = makeNoise();
    return true;
  }
  function stopNodes(n) {
    if (!n) return;
    for (var k in n) {
      var o = n[k]; if (!o || typeof o !== 'object') continue;
      if (typeof o.stop === 'function') { try { o.stop(); } catch (e) { /* already stopped */ } }
      if (typeof o.disconnect === 'function') { try { o.disconnect(); } catch (e2) { /* never connected */ } }
    }
  }
  function teardown() {
    stopNodes(engine.n); engine.n = null; stopNodes(siren.n); siren.n = null; stopNodes(heli.n); heli.n = null;
    for (var i = 0; i < voices.length; i++) { try { voices[i].g.disconnect(); } catch (e) { /* fine */ } }
    voices.length = 0; radio.live = false;
  }

  // -------------------------------------------------------------- voices --
  // envelope: attack to peak, optional hold, exponential decay to silence at t0 + dur
  function env(p, t0, a, peak, dur, hold) {
    peak = Math.max(0.0005, peak); a = Math.max(0.001, a || 0.004); hold = hold || 0;
    p.setValueAtTime(0.0001, t0); p.linearRampToValueAtTime(peak, t0 + a);
    var hs = t0 + a + hold; if (hold > 0) p.setValueAtTime(peak, hs);
    p.exponentialRampToValueAtTime(0.0003, Math.max(hs + 0.004, t0 + dur));
  }
  function addFilter(o, src, t0, dur) {
    if (!(o.lp || o.bp || o.hp)) return src;
    var f = ctx.createBiquadFilter(); f.type = o.lp ? 'lowpass' : (o.bp ? 'bandpass' : 'highpass');
    var fc = o.lp || o.bp || o.hp; f.frequency.setValueAtTime(fc, t0);
    if (o.fc1) f.frequency.exponentialRampToValueAtTime(Math.max(10, o.fc1), t0 + (o.fglide || dur));
    f.Q.value = o.q || 1; src.connect(f);
    return f;
  }
  // an oscillator note: {type, f, f1 (glide target), glide, dur, a, hold, g, lp|bp|hp, fc1, fglide, q, detune, vib, vibDepth}
  function blip(dest, t0, o) {
    var osc = ctx.createOscillator(); osc.type = o.type || 'sine';
    var f0 = Math.max(1, o.f), dur = o.dur || 0.1;
    osc.frequency.setValueAtTime(f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + (o.glide || dur));
    if (o.detune) osc.detune.value = o.detune;
    var g = ctx.createGain(); env(g.gain, t0, o.a, o.g == null ? 0.3 : o.g, dur, o.hold);
    addFilter(o, osc, t0, dur).connect(g); g.connect(dest);
    if (o.vib) {
      var l = ctx.createOscillator(); l.frequency.value = o.vib; var lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t0); lg.gain.linearRampToValueAtTime(f0 * (o.vibDepth || 0.012), t0 + 0.18);
      l.connect(lg); lg.connect(osc.frequency); l.start(t0); l.stop(t0 + dur + 0.05);
    }
    osc.start(t0); osc.stop(t0 + dur + 0.05);
    return osc;
  }
  // a noise burst: {dur, a, hold, g, lp|bp|hp, fc1, fglide, q, rate}
  function hiss(dest, t0, o) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    if (o.rate) s.playbackRate.value = o.rate;
    var dur = o.dur || 0.1, g = ctx.createGain(); env(g.gain, t0, o.a, o.g == null ? 0.3 : o.g, dur, o.hold);
    addFilter(o, s, t0, dur).connect(g); g.connect(dest);
    s.start(t0, arng.random() * 1.5); s.stop(t0 + dur + 0.05);
    return s;
  }
  function send(node, amount) { if (space && amount > 0) { var g = mkGain(amount, space); node.connect(g); } }

  function gcVoices(now) {
    for (var i = voices.length - 1; i >= 0; i--) if (voices[i].end < now) { try { voices[i].g.disconnect(); voices[i].out.disconnect(); } catch (e) { /* fine */ } voices.splice(i, 1); }
  }
  function voiceOut(name, x, z, gain) {
    var sp = spatial(x, z, RANGE[name] || 60, _sp), g = sp.g * gain;
    if (g < 0.012) return null;
    var now = ctx.currentTime; gcVoices(now);
    if (voices.length >= MAX_VOICES) {
      if (g < 0.35) return null;
      var old = voices.shift(); try { old.g.disconnect(); old.out.disconnect(); } catch (e) { /* fine */ }
    }
    var vg = mkGain(g), last = vg;
    if (ctx.createStereoPanner && Math.abs(sp.pan) > 0.02) { var pn = ctx.createStereoPanner(); pn.pan.value = sp.pan; vg.connect(pn); pn.connect(bus.sfx); last = pn; }
    else vg.connect(bus.sfx);
    var v = { g: vg, out: last, end: now + 1.5, name: name, pan: sp.pan, gain: g };
    voices.push(v);
    return v;
  }

  // ----------------------------------------------------------------- SFX --
  // each builder gets the voice gain node, a start time, the requested gain (for character) and the opts; returns its length
  var SFX = {};
  SFX.shot = function (out, t, g) {
    hiss(out, t, { dur: 0.1 + 0.14 * g, g: 0.55, bp: 1600 - 700 * g, q: 0.7, a: 0.002 });  // the bang
    hiss(out, t, { dur: 0.045, g: 0.35, hp: 4200, a: 0.001 });                            // the crack
    blip(out, t, { type: 'sine', f: 190, f1: 48, dur: 0.08 + 0.06 * g, g: 0.5, a: 0.002 });  // the thump
    if (g >= 0.95) { blip(out, t + 0.01, { type: 'triangle', f: 95, f1: 38, dur: 0.28, g: 0.3 }); send(out, 0.25); }
    return 0.4;
  };
  SFX.punch = function (out, t) {
    blip(out, t, { type: 'sine', f: 140, f1: 52, dur: 0.11, g: 0.6, a: 0.002 });
    hiss(out, t, { dur: 0.05, g: 0.35, lp: 520, a: 0.002 });
    return 0.2;
  };
  SFX.hit = function (out, t) {
    hiss(out, t, { dur: 0.07, g: 0.7, bp: 900, q: 1.2, a: 0.002 });
    blip(out, t, { type: 'triangle', f: 320, f1: 110, dur: 0.09, g: 0.45, a: 0.002 });
    return 0.15;
  };
  SFX.explode = function (out, t) {
    hiss(out, t, { dur: 1.6, g: 0.4, lp: 1500, fc1: 150, a: 0.005, hold: 0.2 });          // the blast body, lowpass closing
    blip(out, t, { type: 'sine', f: 78, f1: 30, dur: 1.1, g: 0.36, a: 0.004, hold: 0.15 }); // sub
    hiss(out, t + 0.02, { dur: 0.5, g: 0.3, bp: 2600, q: 0.5, a: 0.003 });                  // crackle
    blip(out, t + 0.05, { type: 'triangle', f: 55, f1: 30, dur: 0.8, g: 0.25, a: 0.01, hold: 0.2 });
    hiss(out, t + 0.3, { dur: 1.8, g: 0.22, lp: 220, a: 0.15, hold: 0.4 });                // the rumble rolling off
    send(out, 0.45);
    return 2.2;
  };
  SFX.pickup = function (out, t) {
    blip(out, t, { type: 'square', f: 660, dur: 0.09, g: 0.3, a: 0.003, lp: 3200 });
    blip(out, t + 0.07, { type: 'square', f: 880, dur: 0.12, g: 0.3, a: 0.003, lp: 3600 });
    blip(out, t + 0.14, { type: 'triangle', f: 1320, dur: 0.28, g: 0.3, a: 0.004 });
    blip(out, t + 0.14, { type: 'sine', f: 2640, dur: 0.22, g: 0.07, a: 0.004 });
    return 0.5;
  };
  SFX.horn = function (out, t, g, o) {
    var hv = o && !o.cls ? vehicleAt(o.x, o.z) : null, hm = (o && o.horn) || (hv && hv.mods && hv.mods.horn);
    if (hm && HORN_MODS[hm]) return HORN_MODS[hm](out, t, g, o);
    var cls = (o && o.cls) || (hv ? hv.type : null) || 'sedan', H = HORN[cls] || HORN.sedan;
    for (var i = 0; i < H.f.length; i++) {
      blip(out, t, { type: H.w, f: H.f[i] * 0.96, f1: H.f[i], glide: 0.04, dur: H.dur, hold: H.dur * 0.65, g: 0.24 / H.f.length + 0.12, a: H.air ? 0.07 : 0.015, lp: H.lp, q: 1.2, detune: i ? 6 : -4 });
      if (H.air) blip(out, t, { type: 'square', f: H.f[i] / 2, dur: H.dur, hold: H.dur * 0.65, g: 0.08, a: 0.09, lp: 600 });
    }
    return H.dur + 0.1;
  };
  // a one-shot whoop (the loop is driven by update); the bust and mission code call this
  SFX.siren = function (out, t) {
    blip(out, t, { type: 'sawtooth', f: 650, f1: 1250, glide: 0.55, dur: 0.6, hold: 0.4, g: 0.42, a: 0.02, lp: 2500 });
    blip(out, t + 0.6, { type: 'sawtooth', f: 1250, f1: 650, glide: 0.55, dur: 0.7, hold: 0.3, g: 0.42, a: 0.01, lp: 2500 });
    return 1.4;
  };
  SFX.enter = function (out, t) {   // door shut: a clunk with a little latch click
    hiss(out, t, { dur: 0.07, g: 0.5, lp: 600, a: 0.002 });
    blip(out, t, { type: 'sine', f: 115, f1: 58, dur: 0.13, g: 0.45, a: 0.002 });
    hiss(out, t + 0.03, { dur: 0.015, g: 0.3, hp: 3000, a: 0.001 });
    return 0.3;
  };
  SFX.exit = function (out, t) {    // door open: the latch first, then the softer swing thud
    hiss(out, t, { dur: 0.025, g: 0.5, bp: 2500, q: 2, a: 0.001 });
    hiss(out, t + 0.09, { dur: 0.08, g: 0.5, lp: 700, a: 0.003 });
    blip(out, t + 0.09, { type: 'sine', f: 100, f1: 55, dur: 0.12, g: 0.4, a: 0.003 });
    return 0.35;
  };
  SFX.mission = function (out, t) { // the passed fanfare: a rising square arpeggio with a held top note
    var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5], times = [0, 0.12, 0.24, 0.36, 0.6];
    for (var i = 0; i < notes.length; i++) {
      var last = i === notes.length - 1, d = last ? 0.9 : 0.3;
      blip(out, t + times[i], { type: 'square', f: notes[i], dur: d, hold: last ? 0.3 : 0.05, g: 0.17, a: 0.006, lp: 4000 });
      blip(out, t + times[i], { type: 'triangle', f: notes[i] / 2, dur: d, hold: last ? 0.3 : 0.05, g: 0.14, a: 0.006 });
    }
    send(out, 0.35);
    return 1.8;
  };
  SFX.fail = function (out, t) {    // the slide: two detuned saws falling an octave and a half, the lowpass closing behind them
    blip(out, t, { type: 'sawtooth', f: 392, f1: 98, glide: 1.1, dur: 1.25, hold: 0.8, g: 0.2, a: 0.02, lp: 1800, fc1: 280, fglide: 1.1 });
    blip(out, t, { type: 'sawtooth', f: 396, f1: 99, glide: 1.1, dur: 1.25, hold: 0.8, g: 0.14, a: 0.02, lp: 1600, fc1: 260, fglide: 1.1, detune: 9 });
    blip(out, t + 1.15, { type: 'sine', f: 70, f1: 38, dur: 0.3, g: 0.5, a: 0.004 });
    send(out, 0.3);
    return 1.6;
  };
  SFX.ui = function (out, t) {
    blip(out, t, { type: 'triangle', f: 1500, dur: 0.03, g: 0.25, a: 0.001 });
    blip(out, t, { type: 'sine', f: 2200, dur: 0.05, g: 0.1, a: 0.001 });
    return 0.1;
  };
  SFX.cash = function (out, t) {    // ka-ching
    hiss(out, t, { dur: 0.02, g: 0.35, hp: 5000, a: 0.001 });
    blip(out, t, { type: 'sine', f: 1760, dur: 0.45, g: 0.25, a: 0.002 });
    blip(out, t + 0.04, { type: 'sine', f: 2637, dur: 0.35, g: 0.15, a: 0.002 });
    blip(out, t + 0.04, { type: 'triangle', f: 3520, dur: 0.3, g: 0.07, a: 0.002 });
    return 0.6;
  };
  SFX.debate = function (out, t) {  // the crowd: a gasp or a laugh
    if (arng.chance(0.5)) {
      hiss(out, t, { dur: 0.38, g: 0.95, bp: 480, fc1: 1300, fglide: 0.3, q: 1.5, a: 0.24 });  // the inhale swell
      hiss(out, t + 0.3, { dur: 0.5, g: 0.3, bp: 700, q: 1, a: 0.05 });                         // the murmur after
    } else {
      for (var i = 0; i < 5; i++) {
        hiss(out, t + i * 0.11, { dur: 0.1, g: 0.75 - i * 0.08, bp: 760 - i * 30, q: 1.3, a: 0.01 });
        blip(out, t + i * 0.11, { type: 'sawtooth', f: 230 - i * 8, f1: 185, dur: 0.08, g: 0.07, a: 0.01, lp: 900 });
      }
    }
    send(out, 0.25);
    return 0.9;
  };
  SFX.dunk = function (out, t) {    // swish, boom, rim, whoop
    hiss(out, t, { dur: 0.18, g: 0.35, bp: 3000, fc1: 800, q: 0.8, a: 0.02 });
    blip(out, t + 0.02, { type: 'sine', f: 220, f1: 58, dur: 0.26, g: 0.5, a: 0.002 });
    blip(out, t + 0.1, { type: 'triangle', f: 1100, dur: 0.3, g: 0.15, a: 0.002 });
    blip(out, t + 0.12, { type: 'triangle', f: 1730, dur: 0.25, g: 0.1, a: 0.002 });
    hiss(out, t + 0.15, { dur: 0.45, g: 0.3, bp: 900, q: 1.5, a: 0.08 });
    send(out, 0.3);
    return 0.7;
  };
  SFX.jump = function (out, t) {
    blip(out, t, { type: 'triangle', f: 160, f1: 330, glide: 0.08, dur: 0.12, g: 0.25, a: 0.004 });
    hiss(out, t, { dur: 0.06, g: 0.15, lp: 1200, a: 0.004 });
    return 0.15;
  };
  SFX.land = function (out, t, g) {
    hiss(out, t, { dur: 0.07 + 0.04 * g, g: 0.3 + 0.3 * g, lp: 800, a: 0.002 });
    blip(out, t, { type: 'sine', f: 100, f1: 45, dur: 0.1 + 0.05 * g, g: 0.45, a: 0.002 });
    return 0.25;
  };
  SFX.skid = function (out, t) {    // tyre squeal: a narrow noise band wobbling plus a thin saw with vibrato
    hiss(out, t, { dur: 0.42, g: 1.0, bp: 1700, q: 6, a: 0.03 });
    blip(out, t, { type: 'sawtooth', f: 1250, f1: 1320, glide: 0.4, dur: 0.4, hold: 0.2, g: 0.14, a: 0.03, lp: 2600, vib: 11, vibDepth: 0.03 });
    return 0.5;
  };
  SFX.crash = function (out, t, g) { // by impact strength: a crunch that gets longer, with metal ring on the hard ones
    var d = 0.22 + 0.3 * g;
    hiss(out, t, { dur: d, g: 0.5, lp: 2500, fc1: 200, a: 0.002 });
    blip(out, t, { type: 'sine', f: 95, f1: 35, dur: 0.15 + 0.2 * g, g: 0.45, a: 0.002 });
    hiss(out, t + 0.08 + 0.1 * g, { dur: 0.15, g: 0.3 * g, bp: 1200, q: 0.8, a: 0.003 });
    if (g > 0.35) {
      var ring = [1180, 1760, 2340];
      for (var i = 0; i < ring.length; i++) blip(out, t + 0.01 * i, { type: 'triangle', f: ring[i], dur: 0.25 + 0.4 * g, g: 0.12 * g, a: 0.002, detune: i * 7 });
      send(out, 0.35 * g);
    }
    return d + 0.5;
  };
  SFX.swap = function (out, t) {    // weapon switch: click-clack
    hiss(out, t, { dur: 0.03, g: 0.45, bp: 2200, q: 3, a: 0.001 });
    hiss(out, t + 0.07, { dur: 0.04, g: 0.4, bp: 1500, q: 3, a: 0.001 });
    blip(out, t + 0.07, { type: 'square', f: 240, dur: 0.03, g: 0.1, a: 0.001 });
    return 0.2;
  };
  SFX.static = function (out, t) {  // radio tuning
    hiss(out, t, { dur: 0.2, g: 0.5, bp: 1800, fc1: 900, q: 0.8, a: 0.005 });
    blip(out, t, { type: 'sine', f: 1200, f1: 300, dur: 0.08, g: 0.12, a: 0.002 });
    return 0.25;
  };
  SFX.reload = function (out, t) {  // the magazine out (a catch click, a hollow drop) and the new one slapped in
    hiss(out, t, { dur: 0.025, g: 0.45, bp: 2600, q: 3, a: 0.001 });
    blip(out, t + 0.02, { type: 'sine', f: 180, f1: 90, dur: 0.09, g: 0.3, a: 0.002 });
    hiss(out, t + 0.22, { dur: 0.04, g: 0.5, bp: 1400, q: 2.5, a: 0.001 });
    blip(out, t + 0.22, { type: 'square', f: 260, f1: 200, dur: 0.05, g: 0.12, a: 0.001, lp: 1800 });
    return 0.4;
  };
  SFX.reloadDone = function (out, t) {  // the bolt home: a sharp metallic snap with a short ring
    hiss(out, t, { dur: 0.02, g: 0.55, hp: 3000, a: 0.001 });
    blip(out, t, { type: 'square', f: 420, f1: 300, dur: 0.04, g: 0.14, a: 0.001, lp: 2600 });
    blip(out, t + 0.01, { type: 'triangle', f: 2900, dur: 0.12, g: 0.08, a: 0.001 });
    return 0.2;
  };
  SFX.hitmark = function (out, t) {  // the hit tick under the crosshair: a dry high click
    blip(out, t, { type: 'triangle', f: 2400, dur: 0.035, g: 0.22, a: 0.001 });
    hiss(out, t, { dur: 0.015, g: 0.2, hp: 4000, a: 0.001 });
    return 0.08;
  };
  SFX.confirm = function (out, t) {  // the kill confirm: two falling notes, the second held a little
    blip(out, t, { type: 'sine', f: 1760, dur: 0.09, g: 0.22, a: 0.002 });
    blip(out, t + 0.08, { type: 'sine', f: 1174.7, dur: 0.22, g: 0.22, a: 0.002 });
    blip(out, t + 0.08, { type: 'triangle', f: 2349.3, dur: 0.16, g: 0.06, a: 0.002 });
    return 0.35;
  };

  // ---------------------------------------------------------- v0.3 SFX --
  // the gun reports: a band-passed bang, a high crack, a pitched thump, a room tail; each class sets its own shape
  function report(out, t, o) {
    hiss(out, t, { dur: o.bd, g: o.bg, bp: o.bf, q: o.bq || 0.7, a: 0.002 });
    if (o.cg) hiss(out, t, { dur: o.cd || 0.04, g: o.cg, hp: o.cf || 4200, a: 0.001 });
    blip(out, t, { type: 'sine', f: o.tf, f1: o.tf1 || 42, dur: o.td, g: o.tg, a: 0.002 });
    if (o.ring) blip(out, t + 0.005, { type: 'triangle', f: o.ring, dur: 0.18, g: 0.05, a: 0.002 });
    if (o.tail) send(out, o.tail);
  }
  SFX.shot_pistol = function (out, t, g) { report(out, t, { bd: 0.11 + 0.05 * g, bg: 0.5, bf: 1750, cg: 0.32, tf: 190, td: 0.09, tg: 0.42, tail: 0.15 }); return 0.4; };
  SFX.shot_revolver = function (out, t) { report(out, t, { bd: 0.24, bg: 0.55, bf: 1050, bq: 0.6, cg: 0.4, cd: 0.05, tf: 135, tf1: 36, td: 0.2, tg: 0.48, ring: 2600, tail: 0.4 }); blip(out, t + 0.02, { type: 'triangle', f: 90, f1: 34, dur: 0.32, g: 0.22 }); return 0.7; };
  SFX.shot_smg = function (out, t) {   // a short, papery, darker pop with the bolt ticking behind it (it fires eleven a second)
    report(out, t, { bd: 0.06, bg: 0.5, bf: 950, bq: 1.0, tf: 260, tf1: 90, td: 0.045, tg: 0.32 });
    hiss(out, t + 0.025, { dur: 0.015, g: 0.14, bp: 5200, q: 4, a: 0.001 });
    return 0.25;
  };
  SFX.shot_rifle = function (out, t) { report(out, t, { bd: 0.16, bg: 0.5, bf: 1300, cg: 0.42, cd: 0.05, cf: 5000, tf: 125, tf1: 38, td: 0.14, tg: 0.45, tail: 0.28 }); return 0.5; };
  SFX.shot_lmg = function (out, t) { report(out, t, { bd: 0.18, bg: 0.5, bf: 980, cg: 0.36, cf: 4600, tf: 105, tf1: 34, td: 0.16, tg: 0.48, tail: 0.3 }); hiss(out, t + 0.06, { dur: 0.03, g: 0.18, bp: 2600, q: 4, a: 0.001 }); return 0.5; };
  SFX.shot_shotgun = function (out, t) {
    hiss(out, t, { dur: 0.3, g: 0.6, lp: 2700, fc1: 500, a: 0.002 });
    hiss(out, t, { dur: 0.05, g: 0.3, hp: 3500, a: 0.001 });
    blip(out, t, { type: 'sine', f: 95, f1: 34, dur: 0.24, g: 0.5, a: 0.002 });
    send(out, 0.4); return 0.7;
  };
  SFX.shot_sniper = function (out, t) {
    hiss(out, t, { dur: 0.06, g: 0.5, hp: 6000, a: 0.001 });                        // the supersonic crack
    hiss(out, t + 0.005, { dur: 0.55, g: 0.42, lp: 950, fc1: 160, a: 0.003 });       // the boom
    blip(out, t, { type: 'sine', f: 72, f1: 28, dur: 0.42, g: 0.45, a: 0.002 });
    hiss(out, t + 0.38, { dur: 0.9, g: 0.12, lp: 420, a: 0.12, hold: 0.1 });         // rolling off the buildings
    send(out, 0.55); return 1.5;
  };
  SFX.shot_launcher = function (out, t) {
    blip(out, t, { type: 'sine', f: 70, f1: 40, dur: 0.18, g: 0.45, a: 0.002 });
    hiss(out, t, { dur: 0.7, g: 0.5, bp: 600, fc1: 2600, fglide: 0.6, q: 0.8, a: 0.01 });   // the whoosh away
    hiss(out, t + 0.05, { dur: 0.9, g: 0.15, lp: 1200, fc1: 300, a: 0.05 });
    send(out, 0.3); return 1.1;
  };
  SFX.shot_heavy = function (out, t) {
    blip(out, t, { type: 'square', f: 38, dur: 0.12, g: 0.3, a: 0.002, lp: 900 });
    hiss(out, t, { dur: 0.09, g: 0.45, bp: 1500, q: 0.8, a: 0.001 });
    blip(out, t, { type: 'sawtooth', f: 620, f1: 560, dur: 0.12, g: 0.06, a: 0.002, lp: 2000 });   // the spinning barrels
    return 0.2;
  };
  SFX.shot_thrown = function (out, t) { hiss(out, t, { dur: 0.28, g: 0.75, bp: 900, fc1: 320, fglide: 0.26, q: 1.4, a: 0.03 }); return 0.35; };
  SFX.shot_special = function (out, t) {   // the megaphone squeal
    blip(out, t, { type: 'sawtooth', f: 1800, f1: 2300, glide: 0.25, dur: 0.35, hold: 0.15, g: 0.26, a: 0.02, bp: 2000, q: 3 });
    blip(out, t, { type: 'square', f: 220, dur: 0.3, g: 0.24, a: 0.01, bp: 1200, q: 2 });
    return 0.45;
  };
  SFX.shot_suppressed = function (out, t) {
    hiss(out, t, { dur: 0.05, g: 0.45, bp: 2600, q: 1.2, a: 0.001 });
    blip(out, t, { type: 'sine', f: 160, f1: 60, dur: 0.06, g: 0.3, a: 0.001 });
    hiss(out, t + 0.13, { dur: 0.05, g: 0.4, bp: 3800, q: 3, a: 0.001 });            // the slide cycling, a beat later
    blip(out, t + 0.13, { type: 'square', f: 900, f1: 700, dur: 0.04, g: 0.08, a: 0.001, lp: 3000 });
    return 0.25;
  };
  SFX.dryFire = function (out, t) { hiss(out, t, { dur: 0.015, g: 0.5, bp: 3200, q: 4, a: 0.001 }); blip(out, t, { type: 'square', f: 900, dur: 0.02, g: 0.06, a: 0.001 }); return 0.08; };
  SFX.reloadShell = function (out, t) {   // a shell pushed into the tube, then the pump
    hiss(out, t, { dur: 0.03, g: 0.4, bp: 1800, q: 2.5, a: 0.001 }); blip(out, t, { type: 'triangle', f: 700, f1: 520, dur: 0.05, g: 0.1, a: 0.001 });
    hiss(out, t + 0.16, { dur: 0.08, g: 0.45, bp: 1200, q: 1.5, a: 0.002 }); hiss(out, t + 0.28, { dur: 0.06, g: 0.5, bp: 1500, q: 1.5, a: 0.002 });
    return 0.45;
  };
  SFX.reloadBolt = function (out, t) {
    hiss(out, t, { dur: 0.05, g: 0.45, bp: 2400, q: 2, a: 0.001 }); blip(out, t, { type: 'square', f: 380, f1: 300, dur: 0.05, g: 0.1, a: 0.001, lp: 2000 });
    hiss(out, t + 0.14, { dur: 0.06, g: 0.5, bp: 1700, q: 2, a: 0.001 }); blip(out, t + 0.14, { type: 'square', f: 300, f1: 420, dur: 0.05, g: 0.1, a: 0.001, lp: 2000 });
    return 0.35;
  };
  SFX.cover = function (out, t) {   // the shoulder into the wall: a soft body thud and a cloth rustle
    blip(out, t, { type: 'sine', f: 110, f1: 55, dur: 0.12, g: 0.5, a: 0.003 });
    hiss(out, t, { dur: 0.14, g: 0.3, lp: 1100, a: 0.005 });
    hiss(out, t + 0.04, { dur: 0.12, g: 0.12, bp: 2600, q: 0.8, a: 0.02 });
    return 0.3;
  };
  SFX.coverSlide = function (out, t) { hiss(out, t, { dur: 0.32, g: 0.35, bp: 1400, fc1: 700, q: 0.9, a: 0.04 }); return 0.4; };
  SFX.whoosh = function (out, t) { hiss(out, t, { dur: 0.18, g: 0.5, bp: 700, fc1: 1800, fglide: 0.16, q: 1.6, a: 0.04 }); return 0.25; };
  SFX.melee_light = function (out, t) { SFX.whoosh(out, t); blip(out, t + 0.1, { type: 'sine', f: 150, f1: 60, dur: 0.1, g: 0.55, a: 0.002 }); hiss(out, t + 0.1, { dur: 0.05, g: 0.35, lp: 700, a: 0.002 }); return 0.3; };
  SFX.melee_heavy = function (out, t) {
    hiss(out, t, { dur: 0.3, g: 0.45, bp: 500, fc1: 1500, fglide: 0.28, q: 1.3, a: 0.08 });
    blip(out, t + 0.26, { type: 'sine', f: 120, f1: 40, dur: 0.2, g: 0.6, a: 0.002 });
    hiss(out, t + 0.26, { dur: 0.12, g: 0.45, lp: 1400, fc1: 300, a: 0.002 });
    send(out, 0.2); return 0.6;
  };
  SFX.melee_counter = function (out, t) {
    hiss(out, t, { dur: 0.03, g: 0.55, bp: 1900, q: 3, a: 0.001 });                     // the block: a clack
    blip(out, t + 0.12, { type: 'sine', f: 130, f1: 48, dur: 0.14, g: 0.55, a: 0.002 });   // the return
    blip(out, t + 0.14, { type: 'triangle', f: 1568, dur: 0.3, g: 0.08, a: 0.002 });       // a little ding: countered
    return 0.5;
  };
  SFX.rotorStart = function (out, t) {   // the starter: a whine winding up, then the turbine lights
    blip(out, t, { type: 'sawtooth', f: 180, f1: 900, glide: 1.6, dur: 1.8, hold: 1.2, g: 0.09, a: 0.2, lp: 1400 });
    blip(out, t, { type: 'sine', f: 400, f1: 1600, glide: 1.6, dur: 1.8, hold: 1.2, g: 0.08, a: 0.2 });
    hiss(out, t + 0.6, { dur: 1.3, g: 0.25, bp: 900, q: 0.6, a: 0.4, hold: 0.4 });
    blip(out, t + 0.02, { type: 'sine', f: 90, f1: 50, dur: 0.12, g: 0.35, a: 0.002 });
    return 2.0;
  };
  SFX.chuteOpen = function (out, t) {   // the canopy catches air: a rush, a whump and a flap
    hiss(out, t, { dur: 0.35, g: 0.5, bp: 500, fc1: 1600, fglide: 0.3, q: 0.8, a: 0.1 });
    blip(out, t + 0.3, { type: 'sine', f: 85, f1: 45, dur: 0.3, g: 0.6, a: 0.004 });
    hiss(out, t + 0.3, { dur: 0.25, g: 0.4, lp: 700, a: 0.003 });
    for (var i = 0; i < 4; i++) hiss(out, t + 0.5 + i * 0.07, { dur: 0.04, g: 0.18 - i * 0.03, bp: 900, q: 1.5, a: 0.002 });
    return 1.0;
  };
  SFX.bail = function (out, t) { hiss(out, t, { dur: 1.0, g: 0.45, bp: 400, fc1: 2200, fglide: 0.9, q: 0.7, a: 0.15, hold: 0.3 }); blip(out, t, { type: 'sine', f: 120, f1: 60, dur: 0.1, g: 0.3, a: 0.002 }); return 1.2; };
  SFX.stall = function (out, t) { for (var i = 0; i < 3; i++) { blip(out, t + i * 0.2, { type: 'square', f: 410, dur: 0.13, hold: 0.08, g: 0.16, a: 0.004, lp: 1600 }); blip(out, t + i * 0.2, { type: 'square', f: 446, dur: 0.13, hold: 0.08, g: 0.1, a: 0.004, lp: 1600 }); } return 0.7; };
  SFX.gearUp = function (out, t) { blip(out, t, { type: 'sine', f: 520, f1: 880, glide: 0.5, dur: 0.6, hold: 0.3, g: 0.14, a: 0.05 }); hiss(out, t, { dur: 0.6, g: 0.12, bp: 1800, q: 1, a: 0.05, hold: 0.3 }); blip(out, t + 0.62, { type: 'sine', f: 140, f1: 70, dur: 0.12, g: 0.4, a: 0.002 }); return 0.9; };
  SFX.splash = function (out, t, g) {
    hiss(out, t, { dur: 0.35 + 0.3 * g, g: 0.55, lp: 2400, fc1: 600, a: 0.004 });
    for (var i = 0; i < 5; i++) blip(out, t + 0.12 + i * 0.07, { type: 'sine', f: 500 + i * 140, f1: 900 + i * 160, glide: 0.04, dur: 0.06, g: 0.08, a: 0.002 });
    return 0.9;
  };
  SFX.phoneRing = function (out, t) {   // two bursts of the classic two-tone ring, warbled at 20 Hz
    for (var k = 0; k < 2; k++) {
      var t0 = t + k * 0.7;
      for (var i = 0; i < 8; i++) {
        blip(out, t0 + i * 0.05, { type: 'sine', f: 440, dur: 0.045, g: 0.2, a: 0.003 });
        blip(out, t0 + i * 0.05, { type: 'sine', f: 480, dur: 0.045, g: 0.2, a: 0.003 });
      }
    }
    return 1.5;
  };
  SFX.phoneBlip = function (out, t) { blip(out, t, { type: 'sine', f: 1400, dur: 0.07, g: 0.2, a: 0.002 }); blip(out, t + 0.09, { type: 'sine', f: 1800, dur: 0.09, g: 0.2, a: 0.002 }); hiss(out, t + 0.2, { dur: 0.25, g: 0.06, bp: 2500, q: 0.8, a: 0.02 }); return 0.5; };
  SFX.phoneHang = function (out, t) { blip(out, t, { type: 'sine', f: 1200, dur: 0.08, g: 0.2, a: 0.002 }); blip(out, t + 0.1, { type: 'sine', f: 800, dur: 0.12, g: 0.2, a: 0.002 }); return 0.3; };
  SFX.chapter = function (out, t) {   // the chapter card: a brass swell on a minor chord, a timpani hit, a cymbal
    [130.8, 155.6, 196, 261.6].forEach(function (f, i) { blip(out, t, { type: 'sawtooth', f: f, dur: 1.7, hold: 0.9, a: 0.25, g: 0.07, lp: 1400, detune: (i - 1.5) * 5 }); });
    blip(out, t, { type: 'sine', f: 82, f1: 60, dur: 0.6, g: 0.45, a: 0.003 });
    hiss(out, t, { dur: 1.4, g: 0.16, hp: 5500, a: 0.004 });
    send(out, 0.4); return 2.0;
  };
  SFX.bossStinger = function (out, t) {   // three falling hits and a held tritone: the boss walks in
    [0, 0.22, 0.44].forEach(function (d, i) { blip(out, t + d, { type: 'sawtooth', f: 98 - i * 12, f1: 50, dur: 0.22, g: 0.22, a: 0.004, lp: 900 }); hiss(out, t + d, { dur: 0.12, g: 0.3, lp: 1600, a: 0.002 }); });
    blip(out, t + 0.66, { type: 'sawtooth', f: 116.5, dur: 1.4, hold: 0.8, g: 0.1, a: 0.08, lp: 1200 });
    blip(out, t + 0.66, { type: 'sawtooth', f: 164.8, dur: 1.4, hold: 0.8, g: 0.1, a: 0.08, lp: 1200, detune: 8 });
    send(out, 0.35); return 2.1;
  };
  SFX.bossPhase = function (out, t) { blip(out, t, { type: 'sawtooth', f: 110, f1: 55, dur: 0.2, g: 0.25, a: 0.003, lp: 1000 }); blip(out, t + 0.18, { type: 'sawtooth', f: 220, f1: 440, glide: 0.5, dur: 0.6, hold: 0.2, g: 0.12, a: 0.02, lp: 2200 }); hiss(out, t + 0.18, { dur: 0.6, g: 0.2, bp: 800, fc1: 3000, q: 0.8, a: 0.1 }); return 0.9; };
  SFX.bossDefeat = function (out, t) {   // ratio'd: a major arpeggio and a crowd swell
    [392, 493.9, 587.3, 784].forEach(function (f, i) { blip(out, t + i * 0.12, { type: 'square', f: f, dur: i === 3 ? 0.9 : 0.25, hold: i === 3 ? 0.4 : 0.05, g: 0.12, a: 0.006, lp: 3600 }); });
    hiss(out, t + 0.3, { dur: 1.5, g: 0.3, bp: 900, q: 0.6, a: 0.4, hold: 0.4 });
    send(out, 0.3); return 2.0;
  };
  SFX.special_focus = function (out, t) {   // time slows: the world pitches down, a heartbeat
    blip(out, t, { type: 'sine', f: 1100, f1: 160, glide: 0.7, dur: 0.8, g: 0.16, a: 0.02 });
    hiss(out, t, { dur: 0.8, g: 0.35, bp: 2400, fc1: 300, fglide: 0.7, q: 0.9, a: 0.05 });
    blip(out, t + 0.75, { type: 'sine', f: 60, f1: 40, dur: 0.12, g: 0.55, a: 0.003 }); blip(out, t + 0.97, { type: 'sine', f: 55, f1: 38, dur: 0.12, g: 0.45, a: 0.003 });
    return 1.2;
  };
  SFX.special_focusEnd = function (out, t) { blip(out, t, { type: 'sine', f: 180, f1: 1000, glide: 0.4, dur: 0.45, g: 0.15, a: 0.02 }); hiss(out, t, { dur: 0.45, g: 0.3, bp: 400, fc1: 2600, fglide: 0.4, q: 0.9, a: 0.03 }); return 0.6; };
  SFX.special_shout = function (out, t) {   // the area stun: a megaphone blast and a shock thump
    blip(out, t, { type: 'sawtooth', f: 210, f1: 180, dur: 0.6, hold: 0.35, g: 0.25, a: 0.01, bp: 1300, q: 1.6 });
    blip(out, t, { type: 'square', f: 420, f1: 360, dur: 0.6, hold: 0.35, g: 0.1, a: 0.01, bp: 2400, q: 2 });
    blip(out, t + 0.02, { type: 'sine', f: 70, f1: 32, dur: 0.4, g: 0.45, a: 0.003 });
    hiss(out, t + 0.02, { dur: 0.5, g: 0.25, lp: 900, fc1: 200, a: 0.004 });
    send(out, 0.35); return 0.9;
  };
  SFX.special_chatmob = function (out, t) {   // the replies arrive: a swell of notification pings and crowd murmur
    hiss(out, t, { dur: 1.3, g: 0.3, bp: 700, q: 0.8, a: 0.5, hold: 0.3 });
    for (var i = 0; i < 9; i++) blip(out, t + 0.08 + i * 0.11, { type: 'sine', f: [1319, 1568, 1760][i % 3], dur: 0.07, g: 0.09, a: 0.002 });
    return 1.5;
  };
  SFX.special_boost = function (out, t) {   // nitro: a rising hiss over a rumble
    hiss(out, t, { dur: 1.1, g: 0.4, bp: 1500, fc1: 6000, fglide: 0.9, q: 0.7, a: 0.04, hold: 0.3 });
    blip(out, t, { type: 'sawtooth', f: 55, f1: 90, glide: 0.8, dur: 1.1, hold: 0.4, g: 0.16, a: 0.04, lp: 500 });
    blip(out, t, { type: 'sine', f: 130, f1: 60, dur: 0.15, g: 0.4, a: 0.002 });
    return 1.3;
  };
  SFX.specialReady = function (out, t) { [1047, 1319, 1568].forEach(function (f, i) { blip(out, t + i * 0.07, { type: 'sine', f: f, dur: 0.35, g: 0.12, a: 0.003 }); blip(out, t + i * 0.07, { type: 'sine', f: f * 2, dur: 0.2, g: 0.03, a: 0.003 }); }); return 0.6; };
  SFX.shopBuy = function (out, t) {   // the register: a key, the drawer, the bell, coins
    hiss(out, t, { dur: 0.02, g: 0.4, bp: 2500, q: 3, a: 0.001 });
    hiss(out, t + 0.06, { dur: 0.18, g: 0.35, bp: 900, fc1: 500, q: 1.2, a: 0.01 });
    blip(out, t + 0.12, { type: 'sine', f: 2093, dur: 0.6, g: 0.18, a: 0.002 }); blip(out, t + 0.12, { type: 'sine', f: 3136, dur: 0.4, g: 0.08, a: 0.002 });
    for (var i = 0; i < 3; i++) blip(out, t + 0.3 + i * 0.06, { type: 'triangle', f: 3700 - i * 300, dur: 0.08, g: 0.05, a: 0.001 });
    return 0.8;
  };
  SFX.shopBrowse = function (out, t) { hiss(out, t, { dur: 0.02, g: 0.3, bp: 1300, q: 3, a: 0.001 }); blip(out, t, { type: 'triangle', f: 880, dur: 0.04, g: 0.1, a: 0.001 }); return 0.08; };
  SFX.shopDeny = function (out, t) { blip(out, t, { type: 'square', f: 140, dur: 0.32, hold: 0.22, g: 0.18, a: 0.005, lp: 900 }); blip(out, t, { type: 'square', f: 147, dur: 0.32, hold: 0.22, g: 0.1, a: 0.005, lp: 900 }); return 0.4; };
  SFX.modWrench = function (out, t) {   // the impact wrench: a ratcheting burst
    for (var i = 0; i < 9; i++) { hiss(out, t + i * 0.035, { dur: 0.02, g: 0.4, bp: 2200, q: 2, a: 0.001 }); blip(out, t + i * 0.035, { type: 'square', f: 180, dur: 0.02, g: 0.06, a: 0.001, lp: 1200 }); }
    blip(out, t, { type: 'sawtooth', f: 260, f1: 340, glide: 0.3, dur: 0.34, hold: 0.2, g: 0.06, a: 0.01, lp: 1500 });
    return 0.45;
  };
  SFX.modSpray = function (out, t) { hiss(out, t, { dur: 0.7, g: 0.4, hp: 3000, a: 0.05, hold: 0.45 }); blip(out, t, { type: 'triangle', f: 2400, dur: 0.03, g: 0.08, a: 0.001 }); return 0.8; };
  SFX.modApply = function (out, t) { SFX.modWrench(out, t); SFX.modSpray(out, t + 0.45); blip(out, t + 1.2, { type: 'sine', f: 1568, dur: 0.4, g: 0.14, a: 0.003 }); blip(out, t + 1.3, { type: 'sine', f: 2093, dur: 0.5, g: 0.12, a: 0.003 }); return 1.8; };
  SFX.golfSwing = function (out, t) {   // the swing and the driver's crack
    hiss(out, t, { dur: 0.22, g: 0.45, bp: 600, fc1: 2200, fglide: 0.2, q: 1.5, a: 0.06 });
    hiss(out, t + 0.21, { dur: 0.02, g: 0.55, hp: 3500, a: 0.001 });
    blip(out, t + 0.21, { type: 'triangle', f: 2300, f1: 1800, dur: 0.07, g: 0.18, a: 0.001 });
    return 0.4;
  };
  SFX.golfPutt = function (out, t) { blip(out, t, { type: 'triangle', f: 1400, f1: 1200, dur: 0.05, g: 0.16, a: 0.001 }); hiss(out, t, { dur: 0.015, g: 0.25, bp: 2600, q: 2, a: 0.001 }); hiss(out, t + 0.05, { dur: 0.6, g: 0.05, lp: 500, a: 0.1 }); return 0.7; };
  SFX.golfCup = function (out, t) {   // the rattle in the cup, then polite applause
    [1800, 1500, 1250].forEach(function (f, i) { blip(out, t + i * 0.09, { type: 'triangle', f: f, dur: 0.08, g: 0.22, a: 0.001 }); });
    for (var i = 0; i < 10; i++) hiss(out, t + 0.4 + i * 0.07 + (i % 3) * 0.013, { dur: 0.03, g: 0.32 - i * 0.02, bp: 1600 + (i % 4) * 300, q: 1.5, a: 0.002 });
    return 1.3;
  };
  SFX.achievement = function (out, t) {   // the chime: four bells up and a sparkle
    [784, 988, 1175, 1568].forEach(function (f, i) { blip(out, t + i * 0.09, { type: 'sine', f: f, dur: i === 3 ? 0.9 : 0.4, g: 0.14, a: 0.003 }); blip(out, t + i * 0.09, { type: 'sine', f: f * 3, dur: 0.25, g: 0.025, a: 0.003 }); });
    hiss(out, t + 0.3, { dur: 0.5, g: 0.06, hp: 7000, a: 0.05 });
    send(out, 0.3); return 1.4;
  };
  SFX.rangeStart = function (out, t) { blip(out, t, { type: 'square', f: 620, dur: 0.45, hold: 0.35, g: 0.15, a: 0.004, lp: 2400 }); blip(out, t, { type: 'square', f: 930, dur: 0.45, hold: 0.35, g: 0.07, a: 0.004, lp: 2400 }); return 0.55; };
  SFX.rangeHit = function (out, t) { blip(out, t, { type: 'triangle', f: 2200, dur: 0.4, g: 0.16, a: 0.001 }); blip(out, t, { type: 'triangle', f: 3310, dur: 0.25, g: 0.08, a: 0.001 }); hiss(out, t, { dur: 0.015, g: 0.25, hp: 3000, a: 0.001 }); return 0.45; };
  SFX.rangeMedal = function (out, t, g) {   // bronze, silver, gold by gain: one, two or three rising notes
    var n = g >= 0.9 ? 3 : g >= 0.6 ? 2 : 1, notes = [523.25, 659.25, 783.99];
    for (var i = 0; i < n; i++) blip(out, t + i * 0.14, { type: 'square', f: notes[i], dur: i === n - 1 ? 0.7 : 0.18, hold: i === n - 1 ? 0.3 : 0.05, g: 0.13, a: 0.006, lp: 3400 });
    send(out, 0.25); return 1.2;
  };
  SFX.door = function (out, t) { [2093, 2637, 2349].forEach(function (f, i) { blip(out, t + i * 0.06, { type: 'sine', f: f, dur: 0.35, g: 0.15, a: 0.002 }); }); hiss(out, t, { dur: 0.06, g: 0.15, lp: 800, a: 0.004 }); return 0.6; };
  SFX.gps = function (out, t) { blip(out, t, { type: 'sine', f: 988, dur: 0.12, g: 0.2, a: 0.004 }); blip(out, t + 0.13, { type: 'sine', f: 1319, dur: 0.2, g: 0.2, a: 0.004 }); return 0.4; };

  // --------------------------------------------------------------- engine --
  function engineStart(cls) {
    var P = ENGINE[cls] || ENGINE.sedan, n = { P: P, cls: cls };
    if (P.kind) return engineStartKind(P, n);
    n.g = mkGain(0, bus.engine);
    n.am = mkGain(1 - P.lump * 0.5, n.g);   // the lump swings the level between 1 - lump and 1, never above
    n.lp = mkFilter('lowpass', P.cut, 2); n.lp.connect(n.am);
    n.a = mkOsc(P.wave, P.idle); n.b = mkOsc('square', P.idle / 2); n.c = mkOsc('sawtooth', P.idle * 1.012);
    n.ga = mkGain(0.38, n.lp); n.gb = mkGain(P.sub * 0.4, n.lp); n.gc = mkGain(0.22, n.lp);
    n.a.connect(n.ga); n.b.connect(n.gb); n.c.connect(n.gc);
    n.lfo = mkOsc('sine', 24); n.lfoG = mkGain(P.lump * 0.5, n.am.gain); n.lfo.connect(n.lfoG);   // the idle lump
    n.a.start(); n.b.start(); n.c.start(); n.lfo.start();
    return n;
  }
  // the non-piston voices: rotor (blade-pass thump + turbine), prop (a buzzing saw chopped at the blade rate),
  // jet (a roar band + whine + sub), outboard (a lumpy square + water hiss), wind (the parachute's rushing air)
  function engineStartKind(P, n) {
    n.g = mkGain(0, bus.engine);
    var noise = function () { var b = ctx.createBufferSource(); b.buffer = noiseBuf; b.loop = true; return b; };
    if (P.kind === 'rotor') {
      n.am = mkGain(0.55, n.g); n.lp = mkFilter('lowpass', P.cut, 1.2); n.lp.connect(n.am);
      n.a = mkOsc('sawtooth', P.idle); n.a.connect(n.lp);
      n.ns = noise(); n.nlp = mkFilter('lowpass', 520, 0.7); n.ng = mkGain(0.5, n.am); n.ns.connect(n.nlp); n.nlp.connect(n.ng);
      n.lfo = mkOsc('square', 6); n.lfoG = mkGain(0.45, n.am.gain); n.lfo.connect(n.lfoG);
      n.w = mkOsc('sine', 900); n.wg = mkGain(0.03, n.g); n.w.connect(n.wg);
      n.a.start(); n.ns.start(0, arng.random()); n.lfo.start(); n.w.start();
    } else if (P.kind === 'prop') {
      n.am = mkGain(0.6, n.g); n.lp = mkFilter('lowpass', P.cut, 1.5); n.lp.connect(n.am);
      n.a = mkOsc('sawtooth', P.idle); n.b = mkOsc('square', P.idle / 2); n.ga = mkGain(0.35, n.lp); n.gb = mkGain(0.25, n.lp); n.a.connect(n.ga); n.b.connect(n.gb);
      n.lfo = mkOsc('sine', 30); n.lfoG = mkGain(0.35, n.am.gain); n.lfo.connect(n.lfoG);
      n.a.start(); n.b.start(); n.lfo.start();
    } else if (P.kind === 'jet') {
      n.ns = noise(); n.bp = mkFilter('bandpass', 600, 0.7); n.ng = mkGain(0.7, n.g); n.ns.connect(n.bp); n.bp.connect(n.ng);
      n.ns2 = noise(); n.hp = mkFilter('highpass', 3500, 0.7); n.ng2 = mkGain(0.12, n.g); n.ns2.connect(n.hp); n.hp.connect(n.ng2);
      n.w = mkOsc('sine', P.idle); n.wg = mkGain(0.05, n.g); n.w.connect(n.wg);
      n.sub = mkOsc('sine', 42); n.sg = mkGain(0.3, n.g); n.sub.connect(n.sg);
      n.ns.start(0, arng.random()); n.ns2.start(0, arng.random()); n.w.start(); n.sub.start();
    } else if (P.kind === 'outboard') {
      n.am = mkGain(1 - P.lump * 0.5, n.g); n.lp = mkFilter('lowpass', P.cut, 1.8); n.lp.connect(n.am);
      n.a = mkOsc('square', P.idle); n.c = mkOsc('sawtooth', P.idle * 1.015); n.ga = mkGain(0.3, n.lp); n.gc = mkGain(0.22, n.lp); n.a.connect(n.ga); n.c.connect(n.gc);
      n.lfo = mkOsc('sine', 16); n.lfoG = mkGain(P.lump * 0.5, n.am.gain); n.lfo.connect(n.lfoG);
      n.ns = noise(); n.nlp = mkFilter('lowpass', 800, 0.6); n.ng = mkGain(0.0, n.g); n.ns.connect(n.nlp); n.nlp.connect(n.ng);
      n.a.start(); n.c.start(); n.lfo.start(); n.ns.start(0, arng.random());
    } else {   // wind
      n.ns = noise(); n.bp = mkFilter('bandpass', P.idle, 0.6); n.am = mkGain(0.8, n.g); n.ns.connect(n.bp); n.bp.connect(n.am);
      n.lfo = mkOsc('sine', 5.5); n.lfoG = mkGain(0.2, n.am.gain); n.lfo.connect(n.lfoG);
      n.ns.start(0, arng.random()); n.lfo.start();
    }
    return n;
  }
  // set a kind voice for an rpm (0..1) and a throttle; `k` = the smoothing time constant (0 sets at once, for renders)
  function engineApplyKind(n, rpm, thr, now, k) {
    var P = n.P, f = P.idle + (P.max - P.idle) * rpm;
    function set(param, v) { if (k > 0) param.setTargetAtTime(v, now, k); else param.setValueAtTime(v, now); }
    if (P.kind === 'rotor') { set(n.a.frequency, f); set(n.lfo.frequency, 2 + 11 * rpm); set(n.lp.frequency, P.cut * (0.6 + 0.7 * rpm)); set(n.w.frequency, 600 + 900 * rpm); set(n.wg.gain, 0.01 + 0.03 * rpm); }
    else if (P.kind === 'prop') { set(n.a.frequency, f); set(n.b.frequency, f / 2); set(n.lfo.frequency, f * P.blade * 0.25); set(n.lp.frequency, P.cut * (0.45 + 0.9 * rpm + 0.3 * thr)); }
    else if (P.kind === 'jet') { set(n.bp.frequency, 380 + 1500 * rpm); set(n.ng.gain, 0.45 + 0.4 * rpm); set(n.w.frequency, f); set(n.wg.gain, 0.02 + 0.05 * rpm); set(n.sub.frequency, 36 + 30 * rpm); set(n.ng2.gain, 0.04 + 0.16 * rpm * rpm); }
    else if (P.kind === 'outboard') { set(n.a.frequency, f); set(n.c.frequency, f * 1.015); set(n.lp.frequency, P.cut * (0.5 + 0.9 * rpm)); set(n.lfo.frequency, 12 + 30 * rpm); set(n.ng.gain, 0.05 + 0.35 * rpm); }
    else { set(n.bp.frequency, P.idle + (P.max - P.idle) * rpm); set(n.lfo.frequency, 4 + 9 * rpm); }
  }
  function updateEngine(dt, now, live) {
    var e = engine; e.ttl -= dt;
    var want = e.ttl > 0 && !!e.cls && !Audio.muted && live;
    var p = GTP.game && GTP.game.player, v = p && p.inVehicle;
    var throttle = v ? U.clamp(Math.abs(v.throttle || 0), 0, 1) : 0;
    if (want && e.n && e.n.cls !== e.cls) { stopNodes(e.n); e.n = null; }
    if (want && !e.n) { e.n = engineStart(e.cls); e.rpm = 0.12; }
    if (!e.n) return;
    if (e.n.P.kind) {
      var thrK = v ? U.clamp(Math.abs(v.throttle || 0) + (v.thr || 0), 0, 1) : 0;
      e.rpm = U.damp(e.rpm, e.level, e.n.P.kind === 'rotor' ? 1.5 : 3, dt); e.throttle = thrK;
      engineApplyKind(e.n, e.rpm, thrK, now, 0.05);
      var kv = e.n.P.kind === 'wind' ? e.rpm * 1.1 : e.n.P.kind === 'rotor' ? 0.25 + 0.75 * e.rpm : 0.4 + 0.6 * e.rpm;
      e.n.g.gain.setTargetAtTime(want ? kv : 0, now, 0.1);
      if (!want) { e.off += dt; if (e.off > 0.9) { stopNodes(e.n); e.n = null; } } else e.off = 0;
      return;
    }
    var P = e.n.P, lvl = e.level, gears = P.gears;
    var pos = lvl * gears, gear = Math.min(gears - 1, Math.floor(pos)), frac = Math.min(1, pos - gear);
    var target = lvl < 0.02 ? 0.12 : 0.22 + 0.78 * frac;
    if (lvl < 0.1) target += 0.3 * throttle;   // revving at the lights, the lurch pulling away
    target = Math.min(1, target);
    e.rpm = U.damp(e.rpm, target, lvl < 0.02 ? 3 : 7, dt);
    e.throttle = throttle;
    var f = P.idle + (P.max - P.idle) * e.rpm, k = 0.03;
    e.n.a.frequency.setTargetAtTime(f, now, k); e.n.b.frequency.setTargetAtTime(f / 2, now, k); e.n.c.frequency.setTargetAtTime(f * 1.012, now, k);
    e.n.lp.frequency.setTargetAtTime(P.cut * (0.55 + 0.9 * e.rpm + 0.5 * throttle), now, 0.05);
    var depth = P.lump * 0.5 * (1 - e.rpm) * (1 - e.rpm);
    e.n.lfoG.gain.setTargetAtTime(depth, now, 0.1); e.n.am.gain.setTargetAtTime(1 - depth, now, 0.1);
    e.n.lfo.frequency.setTargetAtTime(18 + 40 * e.rpm, now, 0.1);
    var vol = want ? (0.5 + 0.5 * e.rpm) * (0.75 + 0.25 * throttle) : 0;
    e.n.g.gain.setTargetAtTime(vol, now, 0.08);
    if (!want) { e.off += dt; if (e.off > 0.7) { stopNodes(e.n); e.n = null; } } else e.off = 0;
  }

  // ---------------------------------------------------------------- siren --
  function sirenStart() {
    var n = {};
    n.g = mkGain(0);
    if (ctx.createStereoPanner) { n.pan = ctx.createStereoPanner(); n.g.connect(n.pan); n.pan.connect(bus.siren); } else n.g.connect(bus.siren);
    n.lp = mkFilter('lowpass', 2600, 1); n.lp.connect(n.g);
    n.a = mkOsc('sawtooth', 900); n.b = mkOsc('square', 904);
    n.ga = mkGain(0.7, n.lp); n.gb = mkGain(0.16, n.lp); n.a.connect(n.ga); n.b.connect(n.gb);
    n.lfo = mkOsc('sine', 0.45); n.lfoA = mkGain(320, n.a.frequency); n.lfoB = mkGain(320, n.b.frequency); n.lfo.connect(n.lfoA); n.lfo.connect(n.lfoB);
    n.a.start(); n.b.start(); n.lfo.start();
    return n;
  }
  function scanSirens() {
    var E = GTP.Entities, list = E && E.list, L = listener(), count = 0, best = 1e9, bx = 0, bz = 0;
    if (list) for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (v.kind !== 'vehicle' || !v.siren || v.wreck || v.sinking || v.removed) continue;
      var d = U.dist2d(v.x, v.z, L.x, L.z); if (d > RANGE.siren) continue;
      count++; if (d < best) { best = d; bx = v.x; bz = v.z; }
    }
    siren.count = count; siren.dist = count ? best : 1e9;
    if (count) { var sp = spatial(bx, bz, RANGE.siren, _sp); siren.g = Math.min(1, sp.g * (0.8 + 0.1 * Math.min(3, count))); siren.pan = sp.pan; }
    else { siren.g = 0; siren.pan = 0; }
  }
  function updateSiren(dt, now, live) {
    var s = siren; s.scanT -= dt;
    if (s.scanT <= 0) { s.scanT = 0.2; scanSirens(); }
    var want = s.count > 0 && !Audio.muted && live;
    if (want && !s.n) s.n = sirenStart();
    if (!s.n) return;
    s.n.g.gain.setTargetAtTime(want ? s.g : 0, now, 0.15);
    if (s.n.pan) s.n.pan.pan.setTargetAtTime(s.pan, now, 0.2);
    s.n.lfo.frequency.setTargetAtTime(0.45 + 0.3 * Math.min(3, s.count - 1), now, 0.5);
    if (!want) { s.off += dt; if (s.off > 1.2) { stopNodes(s.n); s.n = null; } } else s.off = 0;
  }

  // ----------------------------------------------------------------- heli --
  function heliStart() {
    var n = {};
    n.g = mkGain(0);
    if (ctx.createStereoPanner) { n.pan = ctx.createStereoPanner(); n.g.connect(n.pan); n.pan.connect(bus.heli); } else n.g.connect(bus.heli);
    n.am = mkGain(0.55, n.g);                                   // blade-pass amplitude modulation
    n.lp = mkFilter('lowpass', 300, 1.2); n.lp.connect(n.am);
    n.a = mkOsc('sawtooth', 84); n.a.connect(n.lp);
    n.ns = ctx.createBufferSource(); n.ns.buffer = noiseBuf; n.ns.loop = true;
    n.nlp = mkFilter('lowpass', 520, 0.7); n.ng = mkGain(0.5, n.am); n.ns.connect(n.nlp); n.nlp.connect(n.ng);
    n.lfo = mkOsc('square', 12.5); n.lfoG = mkGain(0.45, n.am.gain); n.lfo.connect(n.lfoG);
    n.whine = mkOsc('sine', 1180); n.wg = mkGain(0.025, n.g); n.whine.connect(n.wg);
    n.a.start(); n.ns.start(0, arng.random()); n.lfo.start(); n.whine.start();
    return n;
  }
  function updateHeli(dt, now, live) {
    var h = heli; h.ttl -= dt;
    var want = h.on && h.ttl > 0 && !Audio.muted && live;
    if (want && !h.n) h.n = heliStart();
    if (!h.n) return;
    var sp = spatial(h.x, h.z, 340, _sp);
    h.g = want ? sp.g * h.level : 0;
    h.n.g.gain.setTargetAtTime(h.g, now, 0.3);
    if (h.n.pan) h.n.pan.pan.setTargetAtTime(sp.pan * 0.6, now, 0.3);
    if (!want) { h.off += dt; if (h.off > 2.5) { stopNodes(h.n); h.n = null; } } else h.off = 0;
  }

  // ---------------------------------------------------------------- radio --
  function stations() { var R = GTP.Content && GTP.Content.radio; return (R && R.stations) || []; }
  function stationIndex() { var n = stations().length; if (!n) return -1; var i = Audio.station | 0; return ((i % n) + n) % n; }
  function degFreq(root, deg) { var sc = radio.scale, oct = Math.floor(deg / 7), st = sc[((deg % 7) + 7) % 7] + 12 * oct; return root * Math.pow(2, st / 12); }
  function realign(now) {
    var total = radio.steps * 4, k = Math.floor(now / radio.stepDur) + 1;
    radio.step = k % total; radio.nextT = k * radio.stepDur;
  }
  function tuneTo(i, now) {
    var st = stations()[i] || null;
    radio.index = i; radio.st = st; radio.id = st ? st.id : null; radio.pat = st && st.pattern ? st.pattern : null;
    radio.bpm = st && st.bpm ? st.bpm : 120; radio.steps = radio.pat && radio.pat.steps ? radio.pat.steps : 16;
    radio.stepDur = 60 / radio.bpm / 4; radio.scale = SCALES[st && st.scale] || SCALES.minor; radio.root = ROOTS[i % ROOTS.length];
    radio.jingleT = 0; radio.cycleBar = -1; radio.pause = 0; radio.kit = radio.bpm >= 118 ? 'house' : (radio.bpm > 100 ? 'soft' : 'march');
    if (ctx) realign(now);
  }
  function kick(dest, t, kit) {
    blip(dest, t, { type: 'sine', f: kit === 'house' ? 160 : 140, f1: kit === 'house' ? 40 : 48, glide: 0.1, dur: kit === 'house' ? 0.32 : (kit === 'soft' ? 0.2 : 0.22), g: kit === 'soft' ? 0.45 : (kit === 'march' ? 0.52 : 0.62), a: 0.002 });
    hiss(dest, t, { dur: 0.012, g: kit === 'soft' ? 0.08 : 0.18, lp: 3500, a: 0.001 });
  }
  function snare(dest, t, kit) {
    if (kit === 'house') {   // a clap
      for (var i = 0; i < 3; i++) hiss(dest, t + i * 0.011, { dur: 0.045, g: 0.22, bp: 1150, q: 1.1, a: 0.001 });
      hiss(dest, t + 0.03, { dur: 0.2, g: 0.2, bp: 1400, q: 0.9, a: 0.002 });
      return;
    }
    hiss(dest, t, { dur: kit === 'soft' ? 0.22 : 0.14, g: kit === 'soft' ? 0.16 : 0.32, bp: kit === 'soft' ? 1100 : 1900, q: 0.7, a: 0.002 });
    blip(dest, t, { type: 'triangle', f: kit === 'march' ? 210 : 180, f1: 130, glide: 0.08, dur: 0.09, g: kit === 'march' ? 0.3 : 0.15, a: 0.001 });
  }
  function hat(dest, t, kit, open) {
    hiss(dest, t, { dur: open ? 0.16 : (kit === 'house' ? 0.055 : 0.035), g: kit === 'soft' ? 0.08 : 0.12, hp: 7500, a: 0.001 });
  }
  function bassNote(dest, t, f, wave, len) {
    var o = { type: wave, f: f, dur: len, hold: len * 0.5, g: wave === 'sawtooth' ? 0.26 : 0.32, a: 0.005 };
    if (wave === 'sawtooth' || wave === 'square') { o.lp = Math.min(f * 8, 1800); o.fc1 = Math.max(f * 2.5, 120); o.q = 2; }
    else o.lp = Math.min(f * 6, 1200);
    blip(dest, t, o);
  }
  function leadNote(dest, t, f, wave, len, sus) {
    if (wave === 'sine') {   // chimes: a long ring with a quiet second partial
      blip(dest, t, { type: 'sine', f: f, dur: len * 1.6, g: 0.2, a: 0.004 });
      blip(dest, t, { type: 'sine', f: f * 2.01, dur: len * 0.8, g: 0.04, a: 0.004 });
      return;
    }
    var o = { type: wave, f: f, dur: len, hold: len * 0.45, g: wave === 'sawtooth' ? 0.13 : 0.16, a: 0.012 };
    if (wave === 'sawtooth') { o.lp = 4200; o.fc1 = 1300; o.fglide = len; o.q = 1.5; if (sus >= 0.6) { o.vib = 5.5; o.vibDepth = 0.012; } }   // the sax synth
    else if (wave === 'square') { o.lp = 2600; o.fc1 = 900; o.fglide = len; o.q = 2; }                                                       // brass stingers
    else o.lp = 3000;
    blip(dest, t, o);
  }
  function padChord(dest, t, chordRoot, len, wave) {
    for (var i = 0; i < 3; i++) {
      var f = degFreq(radio.root * 2, chordRoot + i * 2);
      blip(dest, t, { type: wave, f: f, dur: len, a: Math.min(1.2, len * 0.25), hold: len * 0.45, g: 0.06, lp: 1800, detune: (i - 1) * 4 });
    }
  }
  function playJingle(t) {
    var J = radio.pat && radio.pat.jingle; if (!J || !J.notes || !J.notes.length) return;
    var per = 30 / radio.bpm;
    for (var i = 0; i < J.notes.length; i++) {
      var f = degFreq(radio.root * 4, J.notes[i]), last = i === J.notes.length - 1;
      blip(bus.music, t + i * per, { type: 'square', f: f, dur: last ? per * 3 : per * 0.9, hold: last ? per : 0, g: 0.13, a: 0.006, lp: 3200 });
      blip(bus.music, t + i * per, { type: 'triangle', f: f / 2, dur: last ? per * 3 : per * 0.9, hold: last ? per : 0, g: 0.1, a: 0.006 });
    }
    radio.duckT = per * (J.notes.length + 2);
  }
  // one sixteenth of the pattern at time t
  function scheduleStep(step, t) {
    var P = radio.pat, n = radio.steps, bar = Math.floor(step / n), s = step % n, dest = bus.music;
    if (s === 0) radio.cycleBar++;
    if (s % 2 === 1) t += (P.swing || 0) * radio.stepDur;
    var chords = P.chords && P.chords.length ? P.chords : [0], chordRoot = chords[bar % chords.length] || 0;
    var sus = P.sustain == null ? 0.5 : P.sustain, wave = P.wave || {}, kit = radio.kit, D = P.drums || {};
    var inTalk = !!P.talk && (radio.cycleBar % 12) >= 4;
    radio.sched++;
    if (inTalk) {
      // the talk station: a stinger every fourth bar, then the host murmurs behind phone-line static
      if (s === 0 && radio.cycleBar % 4 === 0) {
        var first = null; for (var k = 0; k < (P.lead || []).length; k++) if (P.lead[k] != null) { first = P.lead[k]; break; }
        if (first != null) leadNote(dest, t, degFreq(radio.root * 4, first), wave.lead || 'square', radio.stepDur * 2.5, sus);
        kick(dest, t, kit);
      }
      if (radio.pause > 0) radio.pause--;
      else if (arng.chance(0.72)) {
        var f0 = 92 + arng.random() * 48, form = 420 + arng.random() * 520;
        blip(dest, t, { type: 'sawtooth', f: f0, f1: f0 * (arng.chance(0.5) ? 1.12 : 0.9), glide: 0.1, dur: 0.07 + arng.random() * 0.09, g: 0.3, a: 0.012, bp: form, q: 1.4 });
        if (arng.chance(0.08)) radio.pause = 3 + arng.int(0, 4);   // the end of a sentence
      }
      if (arng.chance(0.12)) hiss(dest, t + arng.random() * radio.stepDur, { dur: 0.02 + arng.random() * 0.03, g: 0.07, bp: 3000, q: 0.8, a: 0.001 });
      return;
    }
    if (D.kick && D.kick[s]) kick(dest, t, kit);
    if (D.snare && D.snare[s]) snare(dest, t, kit);
    if (D.hat && D.hat[s]) hat(dest, t, kit, kit === 'house' && s === n - 1);
    var bd = P.bass ? P.bass[s] : null;
    if (bd != null) bassNote(dest, t, degFreq(radio.root, P.transposeBass ? bd + chordRoot : bd), wave.bass || 'triangle', Math.max(0.06, sus * radio.stepDur));
    var ld = P.lead ? P.lead[s] : null;
    if (ld != null) leadNote(dest, t, degFreq(radio.root * 4, ld), wave.lead || 'square', Math.max(0.08, sus * radio.stepDur), sus);
    if (s === 0) padChord(dest, t, chordRoot, Math.max(1, sus) * n * radio.stepDur, wave.lead === 'sine' ? 'sine' : 'triangle');
  }
  function updateRadio(dt, now) {
    var g = GTP.game, p = g && g.player, st = g ? g.state : 'playing';
    var inCar = !!(p && p.inVehicle) && (st === 'playing' || st === 'cutscene') && !(p.inVehicle.cls && p.inVehicle.cls.family === 'chute');
    if (!inCar) radio.stopped = false;
    radio.playing = inCar && !radio.stopped;
    var idx = stationIndex();
    if (idx !== radio.index || (idx >= 0 && stations()[idx] !== radio.st)) {
      var wasAudible = radio.level > 0.05 && !!ctx && !Audio.muted;
      tuneTo(idx, now || 0);
      if (wasAudible && radio.playing) Audio.play('static', { gain: 0.5 });
    }
    radio.level = U.damp(radio.level, radio.playing ? 1 : 0, radio.playing ? 5 : 7, dt);
    if (radio.level < 0.002 && !radio.playing) radio.level = 0;
    if (!ctx) return;
    bus.music.gain.setTargetAtTime(Audio.muted ? 0 : radio.level * radio.level * 0.6 * vol.music, now, 0.05);
    if (radio.duckT > 0) radio.duckT -= dt;
    bus.duck.gain.setTargetAtTime(radio.duckT > 0 ? 0.45 : 1, now, 0.08);
    if (!radio.playing || Audio.muted || !radio.pat) { radio.live = false; return; }
    if (!radio.live) { radio.live = true; realign(now); }
    if (radio.pat.jingle) { radio.jingleT += dt; if (radio.jingleT >= (radio.pat.jingle.every || 40)) { radio.jingleT = 0; playJingle(now + 0.05); } }
    var guard = 0, total = radio.steps * 4;
    while (radio.nextT < now + LOOKAHEAD && guard++ < 64) {
      if (radio.nextT >= now - 0.05) scheduleStep(radio.step, radio.nextT);   // steps missed during a stall are dropped, not piled up
      radio.step = (radio.step + 1) % total;
      radio.nextT += radio.stepDur;
    }
    if (guard >= 64) realign(now);
  }

  // ---------------------------------------------------------------- hooks --
  function hookEvents() {
    if (hooked || !GTP.Events) return;
    hooked = true;
    GTP.Events.on('weapon', function () { var p = GTP.game && GTP.game.player; if (p && GTP.game.state === 'playing') Audio.play('swap', { x: p.x, z: p.z, gain: 0.5 }); });
    GTP.Events.on('wanted', function (ev) {
      // the first star: a distant whoop so the player knows before the cruisers arrive
      if (ev && ev.level > 0 && (ev.prev | 0) === 0) { var p = GTP.game && GTP.game.player; if (p) Audio.play('siren', { x: p.x, z: p.z, gain: 0.28 }); }
    });
    GTP.Events.on('vehicle:enter', function (ev) { if (ev && ev.ped && ev.ped.kind === 'player') radio.stopped = false; });
    // ---- v0.3 events (PLAN_V03.md "Events"): each a distinct synthesized cue; UI-side cues play centred, world ones in place ----
    var E = GTP.Events, here = function () { var p = GTP.game && GTP.game.player; return p ? { x: p.x, z: p.z } : {}; };
    function cue(name, gain, at) { var o = at || {}; Audio.play(name, { x: o.x, z: o.z, gain: gain == null ? 0.8 : gain }); }
    E.on('phone:call', function () { cue('phoneRing', 0.7); });
    E.on('phone:answer', function () { cue('phoneBlip', 0.6); });
    E.on('phone:end', function () { cue('phoneHang', 0.6); });
    E.on('phone:hangup', function () { cue('phoneHang', 0.6); });
    E.on('chapter', function () { cue('chapter', 0.9); });
    var bossSeen = {};
    E.on('boss:phase', function (ev) { var id = ev && ev.id || '?'; cue(!bossSeen[id] ? 'bossStinger' : 'bossPhase', 0.9); bossSeen[id] = true; });
    E.on('boss:defeated', function (ev) { cue('bossDefeat', 0.9); if (ev && ev.id) bossSeen[ev.id] = false; });
    var specials = {};
    E.on('special:state', function (ev) {
      if (!ev || !ev.id) return;
      var was = specials[ev.id] || { active: false, meter: 0 }, id = String(ev.id);
      if (ev.active && !was.active) cue(SFX['special_' + id] ? 'special_' + id : 'special_boost', 0.85, id === 'boost' ? here() : null);
      else if (!ev.active && was.active && id === 'focus') cue('special_focusEnd', 0.7);
      if (ev.meter >= 1 && was.meter < 1 && !ev.active) cue('specialReady', 0.5);
      specials[ev.id] = { active: !!ev.active, meter: +ev.meter || 0 };
    });
    E.on('shop:buy', function (ev) { if (ev && typeof ev.item === 'string' && ev.item.indexOf('mod:') === 0) return; cue('shopBuy', 0.8); });
    E.on('shop:deny', function () { cue('shopDeny', 0.6); });
    ['shop:open', 'armory:inspect', 'clothing:open', 'barber:open', 'property:open', 'heist:board'].forEach(function (n) { E.on(n, function () { cue('shopBrowse', 0.5); }); });
    E.on('heist:plan', function () { cue('specialReady', 0.7); });
    E.on('golf:shot', function (ev) { var putt = ev && (ev.club === 'putter' || ev.putt || (ev.power != null && ev.power < 0.2)); cue(putt ? 'golfPutt' : 'golfSwing', 0.8, here()); });
    E.on('golf:end', function () { cue('golfCup', 0.8); });
    E.on('achievement', function () { cue('achievement', 0.85); });
    E.on('range:start', function () { cue('rangeStart', 0.7); });
    E.on('range:hit', function (ev) { cue('rangeHit', ev && ev.points > 50 ? 0.9 : 0.7, ev && ev.x != null ? ev : null); });
    E.on('range:end', function (ev) { var m = ev && ev.medal; if (m) cue('rangeMedal', m === 'gold' ? 1 : m === 'silver' ? 0.7 : 0.4); else cue('fail', 0.5); });
    E.on('interior:enter', function () { cue('door', 0.6); });
    E.on('interior:exit', function () { cue('door', 0.5); });
    E.on('cover:enter', function () { cue('cover', 0.8, here()); });
    E.on('cover:exit', function () { cue('coverSlide', 0.5, here()); });
    function meleeCue(ev) { var t = ev && (ev.type || ev.kind); if (t !== 'light' && t !== 'heavy' && t !== 'counter') return; cue('melee_' + t, 0.85, ev && ev.x != null ? ev : here()); }
    E.on('melee', meleeCue); E.on('melee:hit', meleeCue);
    E.on('weapon:dry', function (ev) { cue('dryFire', 0.6, ev && ev.x != null ? ev : here()); });
    E.on('gps:set', function (ev) { if (ev && ev.kind === 'story') cue('gps', 0.5); });
    E.on('parachute:land', function (ev) { if (ev && ev.water) cue('splash', 0.8, ev); });
    E.on('vehicle:sunk', function (ev) { var v = ev && ev.vehicle; if (v) cue('splash', 0.9, v); });
  }

  // ------------------------------------------------------------- public --
  var Audio = GTP.Audio = {
    ctx: null,
    muted: false,
    headless: false,
    unlocked: false,
    disabled: false,
    station: 0,
    names: NAMES.concat(EXTRA, V03),
    shotClasses: SHOT_CLASSES.slice(),
    shotClass: function (o) { try { return shotClass(o || {}); } catch (e) { return 'pistol'; } },
    counts: {},          // play() calls per name (also in headless), for tests and the debug snapshot
    last: null,

    init: function (opts) {
      opts = opts || {};
      Audio.headless = !!opts.headless;
      Audio.muted = !!opts.mute || Audio.headless;
      Audio.counts = {};
      if (!arng) arng = GTP.makeRng(0xA0D10);
      var R = GTP.Content && GTP.Content.radio, list = stations();
      if (R && R.defaultStation && list.length) { for (var i = 0; i < list.length; i++) if (list[i].id === R.defaultStation) { Audio.station = i; break; } }
      hookEvents();
    },

    // creates the AudioContext on the first user gesture (keydown / mousedown / touch call this), resumes it after
    unlock: guarded(function () {
      if (Audio.headless) return false;
      if (!ctx) {
        try { if (!createContext()) return false; } catch (e) { ctx = null; fail(e, 'audio.unlock'); return false; }
        Audio.ctx = ctx;
      }
      Audio.unlocked = true;
      if (ctx.state !== 'running' && typeof ctx.resume === 'function') { try { var pr = ctx.resume(); if (pr && pr.catch) pr.catch(function () { /* needs a later gesture */ }); } catch (e2) { /* optional */ } }
      return true;
    }, 'audio.unlock'),

    play: guarded(function (name, opts) {
      opts = opts || {};
      Audio.counts[name] = (Audio.counts[name] || 0) + 1;
      Audio.last = name;
      if (!ctx || Audio.muted || disabled) { if (name === 'shot') { var hc = 'shot_' + shotClass(opts); Audio.counts[hc] = (Audio.counts[hc] || 0) + 1; } return false; }
      var fn = SFX[name]; if (!fn) return false;
      if (name === 'shot') { var sc = shotClass(opts); Audio.counts['shot_' + sc] = (Audio.counts['shot_' + sc] || 0) + 1; fn = SFX['shot_' + sc] || fn; }
      // rate limit per name: the same sound from (about) the same spot within the gap is dropped (the voice cap handles the rest)
      var now = ctx.currentTime, gap = MIN_GAP[name] || 0.03, la = lastAt[name];
      if (la && now - la.t < gap && (opts.x == null || la.x == null || U.dist2d(opts.x, opts.z, la.x, la.z) < 2.5)) return false;
      var gain = opts.gain == null ? 1 : U.clamp(+opts.gain || 0, 0, 1.5);
      var v = voiceOut(name, opts.x, opts.z, gain);
      if (!v) return false;
      lastAt[name] = { t: now, x: opts.x, z: opts.z };
      var dur = fn(v.g, now + 0.005, gain, opts) || 1;
      v.end = now + dur + 0.3;
      return true;
    }, 'audio.play'),

    // the player vehicle's engine: level 0..1 (speed over top speed), cls = vehicle type or null on foot
    engine: guarded(function (level, cls) {
      engine.level = U.clamp(+level || 0, 0, 1);
      engine.cls = cls ? String(cls) : null;
      engine.ttl = engine.cls ? 0.25 : 0;
    }, 'audio.engine'),

    // the five-star helicopter rotor; `on` may be a boolean or a 0..1 level; forgotten after 1.6 s without a call
    heli: guarded(function (on, x, z) {
      var lvl = typeof on === 'number' ? U.clamp(on, 0, 1) : (on ? 1 : 0);
      heli.level = lvl; heli.on = lvl > 0; heli.ttl = 1.6;
      if (x != null && z != null) { heli.x = x; heli.z = z; }
    }, 'audio.heli'),

    setMuted: guarded(function (m) {
      Audio.muted = !!m || Audio.headless;
      if (ctx && master) {
        var now = ctx.currentTime, cur = master.gain.value;
        master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(cur, now); master.gain.linearRampToValueAtTime(Audio.muted ? 0 : vol.master, now + 0.04);
      }
    }, 'audio.setMuted'),

    // the Settings sliders (0..1 each): master scales everything, music the radio bus, sfx the effects, engine, siren and
    // rotor buses. Audio.volumes mirrors the values (also before the context exists; createContext reads them)
    volumes: vol,
    setVolumes: guarded(function (v) {
      v = v || {};
      ['master', 'music', 'sfx'].forEach(function (k) { if (v[k] != null && isFinite(+v[k])) vol[k] = U.clamp(+v[k], 0, 1); });
      Audio.volumes = vol;
      if (!ctx || !master) return true;
      var now = ctx.currentTime;
      master.gain.setTargetAtTime(Audio.muted ? 0 : vol.master, now, 0.03);
      if (bus.sfx && bus.sfx.gain) bus.sfx.gain.setTargetAtTime(vol.sfx, now, 0.03);
      if (bus.engine && bus.engine.gain) bus.engine.gain.setTargetAtTime(0.5 * vol.sfx, now, 0.03);
      if (bus.siren && bus.siren.gain) bus.siren.gain.setTargetAtTime(0.65 * vol.sfx, now, 0.03);
      if (bus.heli && bus.heli.gain) bus.heli.gain.setTargetAtTime(0.8 * vol.sfx, now, 0.03);
      return true;
    }, 'audio.setVolumes'),

    radio: {
      setStation: function (n) { var len = stations().length; Audio.station = len ? (((n | 0) % len) + len) % len : (n | 0); radio.stopped = false; return Audio.radio.current(); },
      next: function () { return Audio.radio.setStation(stationIndex() + 1); },
      prev: function () { return Audio.radio.setStation(stationIndex() - 1); },
      current: function () { var i = stationIndex(); return i < 0 ? null : stations()[i]; },
      stop: function () { radio.stopped = true; },
      // true while the sequencer is meant to be heard (inside a vehicle, simulating, not stopped)
      isPlaying: function () { return radio.playing; },
      nowPlaying: function () {
        var st = Audio.radio.current(); if (!st || !radio.playing) return '';
        return String(st.name) + (st.tagline ? ' - ' + st.tagline : '');
      },
      level: function () { return radio.level; },
      state: function () { return { index: radio.index, id: radio.id, playing: radio.playing, level: +radio.level.toFixed(3), live: radio.live, step: radio.step, scheduled: radio.sched, bpm: radio.bpm, kit: radio.kit || null, talkBar: radio.cycleBar }; }
    },

    update: guarded(function (dt) {
      dt = dt > 0 ? Math.min(dt, 0.25) : 0;
      var st = GTP.game ? GTP.game.state : 'playing', live = st === 'playing' || st === 'cutscene';
      var now = ctx ? ctx.currentTime : 0;
      updateRadio(dt, now);
      if (!ctx || disabled) return;
      updateEngine(dt, now, live);
      updateSiren(dt, now, live);
      updateHeli(dt, now, live);
      if (voices.length) gcVoices(now);
    }, 'audio.update'),

    // tests and tuning: render one sound offline (no listener, no spatialization) and report its level:
    // kind = an SFX name, 'radio' ({station, seconds}), 'engine' ({cls, level}: an idle-to-level sweep), 'sirenLoop', 'heliLoop'
    // -> Promise<{peak, rms, env: [rms per 100 ms], loudUntil (s), seconds}> or null
    render: function (kind, opts) {
      opts = opts || {};
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OAC || disabled || !arng) return Promise.resolve(null);
      var secs = opts.seconds || 2, sr = 22050, off = new OAC(1, Math.ceil(secs * sr), sr);
      var saved = { ctx: ctx, noise: noiseBuf, space: space, sfx: bus.sfx, music: bus.music, engine: bus.engine, siren: bus.siren, heli: bus.heli, radio: Object.assign({}, radio) };
      try {
        ctx = off; noiseBuf = makeNoise(); space = null;
        var out = off.createGain(); out.connect(off.destination);
        bus.sfx = bus.music = bus.engine = bus.siren = bus.heli = out;
        var n;
        if (kind === 'radio') {
          tuneTo(opts.station | 0, 0); radio.cycleBar = -1; radio.pause = 0;
          var t = 0.05, total = radio.steps * 4, step = 0;
          while (t < secs - 0.05) { scheduleStep(step, t); step = (step + 1) % total; t += radio.stepDur; }
        } else if (kind === 'engine' && ENGINE[opts.cls] && ENGINE[opts.cls].kind) {
          n = engineStart(opts.cls);
          engineApplyKind(n, opts.level == null ? 0.5 : U.clamp(+opts.level, 0, 1), 0.6, 0, 0);
          n.g.gain.value = 0.7;
        } else if (kind === 'engine') {
          n = engineStart(opts.cls || 'sedan');
          var P = n.P, lv = opts.level == null ? 0.5 : U.clamp(+opts.level, 0, 1), f0 = P.idle + (P.max - P.idle) * 0.12, f1 = P.idle + (P.max - P.idle) * (0.22 + 0.78 * lv);
          n.a.frequency.setValueAtTime(f0, 0); n.a.frequency.linearRampToValueAtTime(f1, secs);
          n.b.frequency.setValueAtTime(f0 / 2, 0); n.b.frequency.linearRampToValueAtTime(f1 / 2, secs);
          n.c.frequency.setValueAtTime(f0 * 1.012, 0); n.c.frequency.linearRampToValueAtTime(f1 * 1.012, secs);
          n.lp.frequency.setValueAtTime(P.cut * 0.7, 0); n.lp.frequency.linearRampToValueAtTime(P.cut * 1.7, secs);
          n.g.gain.value = 0.7;
        } else if (kind === 'sirenLoop') { n = sirenStart(); n.g.gain.value = 0.8; }
        else if (kind === 'heliLoop') { n = heliStart(); n.g.gain.value = 0.8; }
        else {   // through a voice gain like play() at point-blank range
          var fn = SFX[kind]; if (!fn) return Promise.resolve(null);
          var gain = opts.gain == null ? 1 : U.clamp(+opts.gain || 0, 0, 1.5);
          fn(mkGain(gain, out), 0.02, gain, opts);
        }
      } catch (e) { fail(e, 'audio.render'); return Promise.resolve(null); }
      finally {
        ctx = saved.ctx; noiseBuf = saved.noise; space = saved.space; bus.sfx = saved.sfx; bus.music = saved.music; bus.engine = saved.engine; bus.siren = saved.siren; bus.heli = saved.heli;
        for (var k in saved.radio) radio[k] = saved.radio[k];
      }
      return off.startRendering().then(function (buf) {
        var d = buf.getChannelData(0), len = d.length, peak = 0, sum = 0, win = Math.floor(sr / 10), env = [], ws = 0, wn = 0, lastLoud = 0, zc = 0, loudN = 0;
        for (var i = 0; i < len; i++) {
          var a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; ws += d[i] * d[i]; wn++;
          if (a > 0.002) { loudN++; if (i && (d[i] >= 0) !== (d[i - 1] >= 0)) zc++; }
          if (wn === win) { var r = Math.sqrt(ws / wn); env.push(+r.toFixed(4)); if (r > 0.004) lastLoud = env.length; ws = 0; wn = 0; }
        }
        // zcr: zero crossings per second over the audible samples (a rough brightness: a thump is low, a hiss high)
        return { kind: kind, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / len).toFixed(4), env: env, loudUntil: +(lastLoud / 10).toFixed(1), seconds: secs, zcr: loudN ? Math.round(zc / (loudN / sr)) : 0 };
      });
    },

    // a plain-object summary for tests and the debug snapshot
    state: function () {
      return {
        ctx: ctx ? ctx.state : null, time: ctx ? +ctx.currentTime.toFixed(2) : 0, unlocked: Audio.unlocked, muted: Audio.muted, headless: Audio.headless, disabled: disabled, errors: errors,
        voices: voices.length, maxVoices: MAX_VOICES, counts: Audio.counts,
        radio: Audio.radio.state(),
        engine: { on: !!engine.n, cls: engine.cls, kind: engine.n ? (engine.n.P.kind || 'piston') : null, level: +engine.level.toFixed(3), rpm: +engine.rpm.toFixed(3), throttle: engine.throttle },
        siren: { active: !!siren.n, count: siren.count, dist: siren.dist < 1e8 ? +siren.dist.toFixed(1) : null, gain: +siren.g.toFixed(3), pan: +siren.pan.toFixed(3) },
        heli: { on: heli.on, active: !!heli.n, gain: +heli.g.toFixed(3), x: heli.x, z: heli.z }
      };
    }
  };
})();
