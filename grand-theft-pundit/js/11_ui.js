/* Grand Theft Pundit: 11_ui.js
 * GTP.UI: the 2D overlay on canvas#hud (crisp at devicePixelRatio; Render sets
 * the transform and passes logical width/height).
 *
 * The front end (GDD_EXPANSION 6): the loading screen (driven by
 * GTP.game.loading: bar, stage label, rotating tips, the logo), the main menu
 * (NEW GAME, CONTINUE, LOAD GAME with the three slot cards, SETTINGS, CREDITS;
 * overwrite / delete confirmations are in-page screens), the pause menu (SAVE,
 * LOAD GAME, MAP, SETTINGS, CONTROLS, RESTART, QUIT), the settings page (volumes,
 * quality preset / draw distance / weather, gamepad, hints, subtitle size; saved
 * in localStorage 'gtp.settings.v1'), the full-screen map with tabs (MAP,
 * MISSIONS with RETRY / REPLAY and best times, STATS, STRANDS with the
 * subscribers tier and the memo count; zoom, pan, a click sets the waypoint that
 * the HUD arrow and the minimap route line follow), the Both Sides Arms shop
 * page, the weapon wheel, the scope overlay, hit markers and the kill confirm,
 * the reload arc, the letterbox and the HOLD TO SKIP pill in cutscenes, the
 * CONTEXT STAMPED card with RETRY / RESTART / QUIT, hint toasts, the race HUD,
 * the stunt slow-motion overlay, the memo counter, the subscribers readout,
 * touch controls (with RELOAD and a long-press weapon wheel) and gamepad glyphs.
 *
 * Plus everything the v0.1 contract listed: title with the attract camera, HUD
 * (health/armor, money roll-up, wanted stars, weapon + ammo, objective panel +
 * timer, crosshair + lock reticle, off-screen arrow, rotating minimap baked from
 * the tiles, district/street chip, radio ticker), dialogue box with parametric
 * portraits, banners and cards, the RATIO'D / DEPLATFORMED cards, phone, toasts,
 * floating fx texts, hurt vignette, barks, credits, and both minigames.
 *
 * v0.3 (PLAN_V03 "ui", notes in docs/v03/ui.md): phone calls, the GPS line on the minimap and the big map with a
 * turn chip, chapter cards, the STORY and STOCKS phone tabs, long-range marker labels, the armory weapon card
 * (stats, ammo, attachments, tints) and the range HUD with medals, the mod shop, the wardrobe and barber with a camera on
 * the player, the property card, the heist planning board, the golf HUD and swing meter, cover / aim prompts, the new
 * crosshair states, bike / aircraft / boat HUDs, the parachute prompt, the boss bar, special meters, achievement toasts,
 * interior fades, the career stats and achievements list, touch buttons for cover / special / aircraft.
 *
 * Input: Game._handleGlobalInput calls GTP.UI.handleInput(state) first; when
 * it returns true the UI consumed the frame's menu input. update(dt) falls back
 * to the same handler when the hook did not run this step. Everything cosmetic
 * that needs randomness uses a fork of GTP.rng.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var U = GTP.util, C = GTP.C;

  var FONT_UI = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace';
  var FONT_DISPLAY = '"Arial Black", "Inter Display", Impact, "Helvetica Neue", Arial, "Liberation Sans", sans-serif';
  var FONT_TEXT = 'Inter, "Helvetica Neue", Arial, "Liberation Sans", "DejaVu Sans", sans-serif';
  var COL = {
    ink: '#eef1fb', muted: '#8f97b3', pink: '#ff3fa4', cyan: '#2ee6ff', amber: '#ffbe3c', lime: '#9dff3c', red: '#ff3b30', gold: '#e8b53a',
    blue: '#4a7cff', green: '#3fd27f', cream: '#f4ead8', white: '#ffffff',
    panel: 'rgba(13,16,32,0.86)', panelSoft: 'rgba(13,16,32,0.8)', line: 'rgba(46,230,255,0.25)', dark: 'rgba(6,7,13,0.8)', outline: 'rgba(4,6,14,0.82)'
  };
  var MINIMAP_PX = 220, LOGICAL_W = 1280, LOGICAL_H = 720;
  var SETTINGS_KEY = 'gtp.settings.v1';
  // NEW GAME with no save anywhere starts at once in slot 1 (nothing to choose or overwrite) and, like the slot picker,
  // passes {opening: true}: a first-time player gets cs_opening and the h_move / h_look hints (QA-C1-07; PLAN_V03:
  // New Game -> loading -> opening cutscene -> the first mission).
  var FAST_START_OPENING = true;

  // ------------------------------------------------------------ state ----
  var W = 1280, H = 720, S = 1, portrait = false, safe = { l: 0, r: 0, t: 0, b: 0 };
  var urng = GTP.makeRng ? GTP.makeRng(0x0B1E) : null;   // UI-only cosmetic rng (never the city stream)
  var ui = {
    inited: false, inputStep: -1, t: 0, wall: 0, state: 'title', prevState: 'title',
    title: { sel: 0, page: 'menu', t: 0, items: [], slotMode: 'new', slotSel: 0, seed: '', seedFocus: false },
    attract: { on: false, t: 0, tour: null },
    pause: { page: 'pause', sel: 0, from: 'playing', tab: 0, scroll: 0, slotMode: 'load', slotSel: 0, row: 0 },
    settings: { master: 100, music: 80, sfx: 100, quality: 'auto', drawDistance: 'normal', weather: true, gamepad: true, hints: true, subtitles: 'small', sel: 0, from: null },
    confirm: null,                  // {title, lines, yes, no, onYes, onNo, sel, danger}
    loading: { tips: [], tipI: 0, tipT: 0, t: 0, seenActive: false, lastFrac: 0 },
    hit: [],                        // clickable rects recorded during draw: {x,y,w,h,fn,id}
    hover: null,
    toasts: [],
    banner: null, card: null,
    retry: { sel: 0, offerT: 0 },   // the CONTEXT STAMPED card's RETRY / RESTART / QUIT
    dialogue: null, dlgToken: 0,
    ticker: { queue: [], cur: null, x: 0, lineT: 0, forceT: 0, lastNapHour: -1, n: 0 },
    money: { shown: null, delta: 0, deltaT: 0, last: null },
    subs: { shown: null, last: null, floats: [] },
    wanted: { last: 0, flashT: 0 },
    minigame: null,
    credits: null,
    touch: { visible: false, coarse: false, ids: {}, stick: null, look: null, buttons: [], btnDown: {}, wheelT: 0, pinch: null, drag: null },
    lastStat: null, statSnap: {},
    hudTop: 0, objBottom: 0, chipBottom: 0,
    map: { bake: null, seed: null, w: 0, h: 0, zoom: 1, cx: 0, cz: 0, drag: null, press: null, rect: null, routeT: 0, route: null, routeKey: '', legend: true },
    waypoint: null,                 // mirrors GTP.game.waypoint ({x, z}) for the HUD arrow and the minimap line
    shop: { tab: 0, sel: 0, store: null, lm: null, turn: 0, msg: null, msgT: 0, flash: 0, barkT: 0 },
    shopOpen: false,                // the Both Sides Arms page: a modal overlay in state playing (player control off, input consumed)
    hint: null,                     // the last 'hint' event {id, text, keys, t}
    memoFloat: null,                // {n, total, t}
    saved: { t: 0, slot: 0 },       // the spinning-table autosave icon
    stunt: { k: 0 },
    captionLog: [],
    muted: false,
    gamepadGlyphs: false,
    debugLine: '',
    sessionStarted: false,
    mouseActive: false, lastMouse: { x: 0, y: 0, seen: false },
    // v0.3
    gps: null, gpsChipRect: null,     // {x, z, label, kind, route, dist, len, turn}
    call: null, callQueue: [], callLog: [], callRect: null,
    chapter: null, chapterSeen: null,
    achQueue: [], achSeen: {},
    fade: null, interior: null, placeCard: null, vehName: null,
    modal: null,                      // the v0.3 shop screens: {kind: 'armory'|'modshop'|'wardrobe'|'property'|'heist', ...}
    range: null, rangeEnd: null, golf: null, golfEnd: null,
    boss: null, bossDown: null, specials: {},
    cover: { on: false, low: false }, aimTutor: { n: 0, shown: 0, was: false }, prompts: [],
    crosshair: { state: null }, chuteShown: null, vehHudCat: null, vehWarn: null, labelsDrawn: 0, headshots: 0
  };

  // ---------------------------------------------------------- helpers ----
  function game() { return GTP.game || null; }
  function player() { var g = game(); return g ? g.player : null; }
  function px(n) { return n * S; }
  function F(size, weight, fam) { return (weight ? weight + ' ' : '') + Math.max(8, Math.round(size * S)) + 'px ' + (fam || FONT_UI); }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function panel(ctx, x, y, w, h, r, fill, stroke, lw) {
    rr(ctx, x, y, w, h, r == null ? px(8) : r);
    if (fill !== null) { ctx.fillStyle = fill || COL.panel; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  // outlined text: readable over any scene
  function txt(ctx, s, x, y, o) {
    o = o || {};
    s = String(s == null ? '' : s);
    ctx.font = o.font || F(14); ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
    var a = o.alpha == null ? 1 : o.alpha, ga = ctx.globalAlpha;
    if (a !== 1) ctx.globalAlpha = ga * a;
    if (o.outline !== false) { ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = o.lw || Math.max(2, px(3)); ctx.strokeStyle = o.outline || COL.outline; if (o.maxW) ctx.strokeText(s, x, y, o.maxW); else ctx.strokeText(s, x, y); }
    ctx.fillStyle = o.color || COL.ink;
    if (o.maxW) ctx.fillText(s, x, y, o.maxW); else ctx.fillText(s, x, y);
    if (a !== 1) ctx.globalAlpha = ga;
  }
  function ellipsize(ctx, s, font, maxW) { s = String(s || ''); if (measure(ctx, s, font) <= maxW) return s; while (s.length > 1 && measure(ctx, s + '…', font) > maxW) s = s.slice(0, -1); return s.replace(/[\s,;·]+$/, '') + '…'; }
  function measure(ctx, s, font) { ctx.font = font; return ctx.measureText(String(s)).width; }
  function wrap(ctx, s, font, maxW) {
    ctx.font = font;
    var words = String(s || '').split(/\s+/), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var t = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function hexA(hex, a) { var c = U.hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function hit(x, y, w, h, fn, id) { ui.hit.push({ x: x, y: y, w: w, h: h, fn: fn, id: id || null }); }
  // hover selects only while the mouse is the active pointer (it moved since the last key / pad navigation): a resting
  // cursor never steals the keyboard or pad selection (QA-B-FE-02)
  function hovering(x, y, w, h) { var m = GTP.Input && GTP.Input.mouse; return !!m && ui.mouseActive && !ui.touch.visible && m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h; }
  function trackPointer() {
    var In = GTP.Input; if (!In || !In.mouse) return;
    var m = In.mouse, lm = ui.lastMouse;
    if (lm.x !== m.x || lm.y !== m.y) { if (lm.seen) ui.mouseActive = true; lm.x = m.x; lm.y = m.y; lm.seen = true; }
    if (In.pressed('forward') || In.pressed('back') || In.pressed('left') || In.pressed('right') || In.pressed('confirm') || In.pressed('tabNext') || In.pressed('weaponNext') || In.pressed('weaponPrev') || In.lastDevice === 'gamepad') ui.mouseActive = false;
  }
  function sfx(name, gain) { var p = player(); if (GTP.Audio && GTP.Audio.play) { try { GTP.Audio.play(name, { x: p ? p.x : 0, z: p ? p.z : 0, gain: gain == null ? 0.5 : gain }); } catch (e) { /* audio optional */ } } }
  function cast(id) { var Cc = GTP.Content && GTP.Content.cast; return Cc ? (Cc[id] || null) : null; }
  function castName(id) { var c = cast(id); return c ? c.name : String(id || ''); }
  function expansion() { return (GTP.Content && GTP.Content.expansion) || {}; }
  function stationList() { var R = GTP.Content && GTP.Content.radio; return (R && R.stations) || []; }
  function currentStation() {
    var A = GTP.Audio, list = stationList(); if (!list.length) return null;
    var cur = null;
    try { cur = A && A.radio && A.radio.current ? A.radio.current() : null; } catch (e) { cur = null; }
    if (cur && typeof cur === 'object' && cur.id) { for (var i = 0; i < list.length; i++) if (list[i].id === cur.id) return list[i]; return cur; }
    if (typeof cur === 'string') { for (var k = 0; k < list.length; k++) if (list[k].id === cur || list[k].name === cur) return list[k]; }
    var n = (A && typeof A.station === 'number') ? A.station : 0;
    return list[((n % list.length) + list.length) % list.length];
  }
  function stationColor(st) {
    var m = { wail_101: COL.red, pennant_fm: COL.gold, velvetine_888: '#b56bff', quiet_signal: '#9fb3c8' };
    if (st && typeof st.color === 'string') return st.color;   // v0.3 stations carry their colour
    if (st && typeof st.color === 'number') return '#' + ('000000' + st.color.toString(16)).slice(-6);
    return (st && m[st.id]) || COL.cyan;
  }
  function failText(kind, dflt) { var R = GTP.Content && GTP.Content.radio; return (R && R.failTexts && R.failTexts[kind]) || dflt; }
  var ROLE_LABEL = { civ: 'CIVILIAN', cop: 'COP', swat: 'BALLOON UNIT', thug: 'GOON', protester: 'MARCHER', hoa: 'HOA PATROL', npc: 'SOMEBODY', raccoon: 'RACCOON', courier: 'COURIER', doorman: 'DOORMAN', clerk: 'CLERK' };
  // the name over a lock-on / scope target: a boss weak point by its label, a boss by its name, a vehicle by its display
  // name (never the engine class id, QA-B-TXT-04), a cast member by name, else the role
  function targetLabel(t) {
    if (!t) return '';
    if (t.bossPart) return String(t.label || 'WEAK POINT');
    if (t.boss && t.boss.name) return String(t.boss.name);
    if (t.kind === 'vehicle' || t.kind === 'heli') return t.isPolice ? 'CRUISER' : vehicleName(t).toUpperCase();
    return t.castId ? castName(t.castId) : roleLabel(t.role);
  }
  // a boss ped's own hp is a 100000 placeholder: its bar is the encounter's
  function targetHp(t) {
    var b = t && t.boss; if (b && b.maxHp) return U.clamp((b.hp || 0) / b.maxHp, 0, 1);
    return U.clamp((t.hp || 0) / (t.maxHp || 1), 0, 1);
  }
  function roleLabel(role) { return ROLE_LABEL[role] || String(role || 'ped').toUpperCase(); }
  function fmtSubs(n) { n = n | 0; return n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K' : String(n); }
  function nMissions(n) { n = n | 0; return n + (n === 1 ? ' mission' : ' missions'); }
  function fmtPlay(sec) { sec = Math.max(0, sec | 0); var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h + ':' + (m < 10 ? '0' : '') + m; }
  function fmtDate(ms) { if (!ms) return ''; try { var d = new Date(ms); return d.toLocaleDateString() + ' ' + d.toTimeString().slice(0, 5); } catch (e) { return ''; } }
  function menuDown(In) { return In.pressed('back') && !In.pressed('cancel'); }
  function menuBack(In) { return In.pressed('cancel'); }

  // Landmark label gag (GDD 9): Goldplate prefixes per act.
  function landmarkLabel(lm) {
    if (!lm) return '';
    var base = lm.label || lm.name || '';
    var fl = GTP.Missions && GTP.Missions.state ? GTP.Missions.state.flags || {} : {};
    var acts = (fl.show_renamed ? 1 : 0) + (fl.knows_memo ? 1 : 0) + (fl.survived_thursday ? 1 : 0);
    if (!acts) return base;
    if (lm.id === 'hospital') return acts >= 3 ? 'Goldplate Goldplate Memorial, formerly St. Somebody\'s' : (acts === 2 ? 'Goldplate Goldplate Memorial' : 'Goldplate Memorial');
    if (/^Goldplate/.test(base)) return acts >= 2 && !/^Goldplate Goldplate/.test(base) ? 'Goldplate ' + base : base;
    if (lm.kind === 'hospital' || lm.kind === 'police' || lm.kind === 'park' || lm.kind === 'dock') return base;
    if (lm.district === 'uptown' || /heirloom/i.test(lm.id || '')) return base;   // old money refuses the name (QA-B-TXT-07)
    base = base.replace(/^The /, '');
    return (acts >= 2 ? 'Goldplate Goldplate ' : 'Goldplate ') + base;
  }
  // Roz's sign: the thing the player did most recently (player.stats), else an idle cause.
  function rozSign() {
    var rz = cast('roz'), signs = rz && rz.signs;
    var byStat = (signs && signs.byStat) || { ramming: 'STOP RAMMING', honking: 'STOP HONKING', debating: 'STOP DEBATING', rally: 'WHATEVER HE SAID' };
    var idle = (signs && signs.idle) || ['CHEESE', 'NO CHEESE', 'PARKING'];
    var M = GTP.Missions;
    if (M && M.state && M.state.active === 'm06_rally') return byStat.rally;
    if (ui.lastStat && byStat[ui.lastStat]) return byStat[ui.lastStat];
    var p = player(), st = p && p.stats;
    if (st) { var best = null, bv = 0; ['ramming', 'honking', 'debating'].forEach(function (k) { if ((st[k] || 0) > bv) { bv = st[k]; best = k; } }); if (best) return byStat[best]; }
    var g = game(), day = g ? g.time.day : 1;
    return idle[(day + Math.floor((g ? g.time.clock : 0) / 8)) % idle.length];
  }
  function trackStats() {
    var p = player(); if (!p || !p.stats) return;
    var keys = ['ramming', 'honking', 'debating'];
    for (var i = 0; i < keys.length; i++) {
      var v = p.stats[keys[i]] || 0;
      if (ui.statSnap[keys[i]] != null && v > ui.statSnap[keys[i]]) ui.lastStat = keys[i];
      ui.statSnap[keys[i]] = v;
    }
  }

  // ------------------------------------------------------------ layout ----
  function layout(w, h) {
    W = w; H = h; portrait = h > w * 1.1;
    S = portrait ? U.clamp(w / 560, 0.62, 1.0) : U.clamp(Math.min(w / LOGICAL_W, h / LOGICAL_H), 0.62, 1.3);
    safe.l = safe.r = px(16); safe.t = px(12); safe.b = px(12);
    ui.touch.buttons = touchLayout();
    ui.touch.coarse = ui.touch.coarse || false;
  }
  // the minimap: bottom-right; with touch controls it moves up (top-right in landscape, top-left under the
  // objective panel in portrait) so the buttons keep the bottom corners
  function minimapRect() {
    var size = Math.round(px(MINIMAP_PX) * (portrait ? 0.68 : 1));
    if (ui.touch.visible && portrait) return { x: safe.l, y: ui.objBottom + px(6), s: size, top: true, left: true };
    if (ui.touch.visible) return { x: W - safe.r - size, y: ui.hudTop + px(156), s: size, top: true, left: false };   // under the weapon panel (QA-B-HUD-09)
    return { x: W - safe.r - size, y: H - safe.b - size, s: size, top: false, left: false };
  }
  function letterboxBar() {
    var Cs = GTP.Cutscenes, g = game();
    if (!g || g.state !== 'cutscene') return 0;
    var k = (C.CUTSCENES && C.CUTSCENES.letterbox) || 0.12;
    if (Cs && Cs.hud) { var h = Cs.hud(); if (h && h.active && h.letterbox === false) return 0; if (!h || !h.active) k = 0.08; }
    return Math.round(H * k);
  }

  // ----------------------------------------------------------- settings ----
  var QUALITY_LABELS = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', ultra: 'ULTRA', auto: 'AUTO' };
  var DRAW_DIST = { near: 160, normal: 260, far: 360 };
  var SETTING_ROWS = [
    { id: 'master', label: 'MASTER VOLUME', type: 'slider' },
    { id: 'music', label: 'MUSIC', type: 'slider', note: 'the radio stations' },
    { id: 'sfx', label: 'SFX', type: 'slider', note: 'everything else' },
    { id: 'quality', label: 'QUALITY', type: 'choice', values: ['low', 'medium', 'high', 'ultra', 'auto'], note: 'shadows, post-processing, light pools' },
    { id: 'drawDistance', label: 'DRAW DISTANCE', type: 'choice', values: ['near', 'normal', 'far'], note: '160 / 260 / 360 m' },
    { id: 'weather', label: 'WEATHER', type: 'toggle', note: 'rain, overcast, wet roads' },
    { id: 'gamepad', label: 'GAMEPAD', type: 'toggle', note: 'OFF ignores the pad entirely' },
    { id: 'hints', label: 'HINTS', type: 'toggle', note: 'tutorial prompts' },
    { id: 'subtitles', label: 'SUBTITLES', type: 'choice', values: ['small', 'large'], note: 'dialogue box size' },
    { id: 'controls', label: 'CONTROLS', type: 'page' },
    { id: 'back', label: 'BACK', type: 'back' }
  ];
  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY); if (!raw) return false;
      var d = JSON.parse(raw); if (!d || typeof d !== 'object') return false;
      var s = ui.settings;
      ['master', 'music', 'sfx'].forEach(function (k) { if (typeof d[k] === 'number') s[k] = U.clamp(d[k] | 0, 0, 100); });
      if (QUALITY_LABELS[d.quality]) s.quality = d.quality;
      if (DRAW_DIST[d.drawDistance]) s.drawDistance = d.drawDistance;
      ['weather', 'gamepad', 'hints'].forEach(function (k) { if (typeof d[k] === 'boolean') s[k] = d[k]; });
      if (d.subtitles === 'small' || d.subtitles === 'large') s.subtitles = d.subtitles;
      return true;
    } catch (e) { return false; }
  }
  function saveSettings() {
    // a one-off ?quality= / ?low= boot never overwrites the stored preset (QA-B-FE-14)
    var s = ui.settings, out = { master: s.master, music: s.music, sfx: s.sfx, quality: ui.qualityFromUrl ? (ui.storedQuality || 'auto') : s.quality, drawDistance: ui.lowFromUrl ? (ui.storedDraw || s.drawDistance) : s.drawDistance, weather: s.weather, gamepad: s.gamepad, hints: s.hints, subtitles: s.subtitles };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(out)); return true; } catch (e) { return false; }
  }
  // Volumes: GTP.Audio.setVolumes({master, music, sfx}) scales the master, radio and effects buses (Audio.volumes carries
  // the current values); master 0 also mutes.
  function applyVolumes() {
    var A = GTP.Audio; if (!A) return;
    var s = ui.settings, v = { master: s.master / 100, music: s.music / 100, sfx: s.sfx / 100 };
    if (typeof A.setVolumes === 'function') { try { A.setVolumes(v); } catch (e) { U.reportError(e, 'audio.setVolumes'); } }
    else A.volumes = v;
    // master 0 mutes; master back above 0 only lifts the mute this path set (never a ?mute=1 boot or the MUTE toggle)
    if (A.setMuted) {
      try {
        if (s.master === 0 && !ui.masterMuted) { ui.masterMuted = true; A.setMuted(true); }
        else if (s.master > 0 && ui.masterMuted) { ui.masterMuted = false; A.setMuted(ui.muted); }
      } catch (e) { /* optional */ }
    }
  }
  function applySetting(id, opts) {
    var s = ui.settings, Rd = GTP.Render, In = GTP.Input;
    opts = opts || {};
    switch (id) {
      case 'master': case 'music': case 'sfx': applyVolumes(); break;
      case 'quality':
        if (Rd && Rd.quality && Rd.quality.set && !opts.skipQuality) { try { Rd.quality.set(s.quality); } catch (e) { U.reportError(e, 'ui.quality'); } }
        break;
      case 'drawDistance': {
        var d = DRAW_DIST[s.drawDistance] || 260;
        if (!ui.baseDraw) ui.baseDraw = { dd: C.QUALITY.drawDistance || 260, ped: C.QUALITY.pedDraw, veh: C.QUALITY.vehicleDraw };
        C.QUALITY.drawDistance = d; C.QUALITY.fogStart = Math.round(d * 0.46);
        // the entity draw ranges follow the fog, so the FAR setting does not make peds pop out in clear air (QA-A-CAM-08)
        if (ui.baseDraw.ped) C.QUALITY.pedDraw = Math.round(ui.baseDraw.ped * d / ui.baseDraw.dd);
        if (ui.baseDraw.veh) C.QUALITY.vehicleDraw = Math.round(ui.baseDraw.veh * d / ui.baseDraw.dd);
        if (Rd && Rd.scene && Rd.scene.fog) { Rd.scene.fog.far = d; Rd.scene.fog.near = C.QUALITY.fogStart; }
        break;
      }
      case 'weather':
        if (Rd && Rd.weather) { Rd.weather.cycle = !!s.weather; if (!s.weather && Rd.weather.set) { try { Rd.weather.set('clear', false); } catch (e) { /* optional */ } } }
        break;
      case 'gamepad': if (In) In.gamepadEnabled = !!s.gamepad; break;
      case 'hints': if (GTP.Hints) GTP.Hints.enabled = !!s.hints; break;
      default: break;
    }
  }
  function applyAllSettings(opts) { ['master', 'quality', 'drawDistance', 'weather', 'gamepad', 'hints'].forEach(function (k) { if (k === 'drawDistance' && opts && opts.skipDraw) return; applySetting(k, opts); }); }
  function settingValueLabel(row) {
    var s = ui.settings, Rd = GTP.Render;
    switch (row.type) {
      case 'slider': return String(s[row.id]);
      case 'toggle': return s[row.id] ? 'ON' : 'OFF';
      case 'choice':
        if (row.id === 'quality') { var cur = Rd && Rd.quality ? Rd.quality.current : null; return s.quality === 'auto' ? 'AUTO' + (cur ? ' (' + QUALITY_LABELS[cur] + ')' : '') : QUALITY_LABELS[s.quality]; }
        if (row.id === 'drawDistance') return s.drawDistance.toUpperCase() + ' · ' + DRAW_DIST[s.drawDistance] + ' m';
        return String(s[row.id]).toUpperCase();
      default: return '';
    }
  }
  function settingStep(row, dir) {
    var s = ui.settings, v;
    if (row.id === 'quality') ui.qualityFromUrl = false;
    if (row.id === 'drawDistance') ui.lowFromUrl = false;
    switch (row.type) {
      case 'slider': s[row.id] = U.clamp((s[row.id] | 0) + dir * 10, 0, 100); break;
      case 'toggle': s[row.id] = !s[row.id]; break;
      case 'choice': v = row.values; s[row.id] = v[(v.indexOf(s[row.id]) + dir + v.length) % v.length]; break;
      default: return;
    }
    applySetting(row.id); saveSettings(); sfx('ui', 0.2);
  }

  // ------------------------------------------------------------- glyphs ----
  // key names per action for the active device (keyboard / gamepad / touch)
  var GLYPH = {
    keyboard: { forward: 'W', back: 'S', left: 'A', right: 'D', run: 'SHIFT', jump: 'SPACE', action: 'E', shoot: 'LMB', aim: 'RMB', enter: 'F', weaponNext: ']', weaponPrev: '[', horn: 'H', radio: 'N', map: 'M', pause: 'ESC', confirm: 'ENTER', cancel: 'ESC', cameraMode: 'V', lockOn: 'TAB', reload: 'R', wheel: 'TAB (hold)', zoomIn: '+', zoomOut: '-', secondary: 'DEL', tabNext: 'TAB', cover: 'Q', special: 'SHIFT+RMB', throttleUp: 'SHIFT', throttleDown: 'CTRL', yawLeft: 'Q', yawRight: 'E', pitchUp: 'S', pitchDown: 'W', rollLeft: 'A', rollRight: 'D' },
    gamepad: { forward: 'LS', back: 'LS', left: 'LS', right: 'LS', run: 'B', jump: 'A', action: 'Y', shoot: 'RT', aim: 'LT', enter: 'Y', weaponNext: 'RB', weaponPrev: 'LB', horn: 'B', radio: 'X', map: 'BACK', pause: 'START', confirm: 'A', cancel: 'B', cameraMode: 'R3', lockOn: 'R3', reload: 'X', wheel: 'R3 (hold)', zoomIn: 'RT', zoomOut: 'LT', secondary: 'X', tabNext: 'Y', cover: 'B', special: 'L3', throttleUp: 'RT', throttleDown: 'LT', yawLeft: 'LB', yawRight: 'RB', pitchUp: 'LS', pitchDown: 'LS', rollLeft: 'LS', rollRight: 'LS' },
    touch: { forward: 'STICK', back: 'STICK', left: 'STICK', right: 'STICK', run: 'STICK (full)', jump: 'JUMP', action: 'ENTER', shoot: 'FIRE', aim: 'AIM', enter: 'ENTER', weaponNext: 'WPN', weaponPrev: 'WPN', horn: 'HORN', radio: 'RADIO', map: 'MAP', pause: 'PAUSE', confirm: 'TAP', cancel: 'BACK', cameraMode: 'CAM', lockOn: 'AIM', reload: 'RLD', wheel: 'WPN (hold)', zoomIn: 'PINCH', zoomOut: 'PINCH', secondary: 'TAP', tabNext: 'TAB', cover: 'COVER', special: 'SPCL', throttleUp: 'THR+', throttleDown: 'THR-', yawLeft: 'YAW L', yawRight: 'YAW R', pitchUp: 'STICK', pitchDown: 'STICK', rollLeft: 'STICK', rollRight: 'STICK' }
  };
  function device() { var In = GTP.Input; if (ui.touch.visible && (!In || In.lastDevice !== 'gamepad')) return 'touch'; return In && In.lastDevice === 'gamepad' && In.gamepadEnabled ? 'gamepad' : 'keyboard'; }
  function glyph(action) {
    var d = device(), p = player();
    if (action === 'action' && p && p.inVehicle) { if (d === 'gamepad') return 'D-PAD ↑'; if (d === 'touch') return 'JOB'; }   // the in-car 'action' (QA-B-HUD-01)
    return (GLYPH[d] && GLYPH[d][action]) || (GLYPH.keyboard[action] || action.toUpperCase()); }
  function keyPill(ctx, label, x, y, h, opts) {
    opts = opts || {};
    var font = F(opts.size || 10, 'bold'), w = measure(ctx, label, font) + px(12);
    panel(ctx, x, y, w, h, px(4), opts.fill || 'rgba(238,241,251,0.14)', opts.stroke || 'rgba(238,241,251,0.5)', 1);
    txt(ctx, label, x + w / 2, y + h * 0.72, { font: font, color: opts.color || COL.ink, align: 'center', outline: false });
    return w;
  }

  // ---------------------------------------------------------- portraits ----
  var portraitCache = {};
  var MOUTH = { smug: 'smirk', clipped: 'flat', flat: 'flat', hopeful: 'smile', lazy: 'slack', breaking: 'shout', whisper: 'o', academic: 'frown', boast: 'grin', podium: 'open', toast: 'grin', redacted: 'flat', hype: 'grin', serene: 'smile', retail: 'smile', chant: 'shout', earnest: 'smile', mute: 'flat', memo: 'flat', gruff: 'frown', crowd: 'open', cop: 'frown' };
  var BROW = { boast: 'down', gruff: 'down', breaking: 'down', hopeful: 'up', earnest: 'up', whisper: 'up', lazy: 'flat', smug: 'cock', hype: 'up', chant: 'down', cop: 'down', clipped: 'flat' };
  function skinHex(skin) { var L = GTP.Content && GTP.Content.looks; return L && L.skinColor ? L.skinColor(skin) : ['#f1d3b3', '#e8c39e', '#c68642', '#a46f3c', '#8d5524', '#5c3a1e'][U.clamp((skin | 0) - 1, 0, 5)]; }
  // recipe: {skin, hair, hairColor, glasses, hat, extra, tie}; opts: {color (accent), shirt, voice, id, sign}
  function drawPortrait(ctx, recipe, x, y, size, opts) {
    recipe = recipe || {}; opts = opts || {};
    var key = JSON.stringify([recipe, opts.color, opts.shirt, opts.voice, opts.id, opts.sign, Math.round(size * (GTP.Render ? GTP.Render.dpr : 1) * 4)]);
    var cv = portraitCache[key];
    if (!cv) {
      var dpr = (GTP.Render && GTP.Render.dpr) || 1, pxs = Math.max(32, Math.round(size * dpr));
      cv = document.createElement('canvas'); cv.width = pxs; cv.height = pxs;
      var c = cv.getContext('2d');
      c.save(); c.scale(pxs / 100, pxs / 100);
      paintPortrait(c, recipe, opts);
      c.restore();
      var keys = Object.keys(portraitCache); if (keys.length > 60) delete portraitCache[keys[0]];
      portraitCache[key] = cv;
    }
    ctx.drawImage(cv, x, y, size, size);
  }
  // 100 x 100 unit bust
  function paintPortrait(c, r, o) {
    var accent = o.color || '#8f97b3', skin = skinHex(r.skin || 2), hair = r.hairColor || '#2a1a0a', shirt = o.shirt || '#2a2f4a';
    var voice = o.voice || 'flat', mouth = MOUTH[voice] || 'flat', brow = BROW[voice] || 'flat';
    var darkSkin = U.shade(skin, -0.25);
    // backdrop: accent gradient + a halftone band
    var g = c.createLinearGradient(0, 0, 100, 100); g.addColorStop(0, U.shade(accent, -0.55)); g.addColorStop(1, U.shade(accent, -0.8));
    c.fillStyle = g; c.fillRect(0, 0, 100, 100);
    c.fillStyle = hexA(accent, 0.18); for (var i = 0; i < 6; i++) c.fillRect(0, 8 + i * 15, 100, 4);
    // shoulders + shirt
    c.fillStyle = shirt; c.beginPath(); c.moveTo(8, 100); c.quadraticCurveTo(10, 72, 34, 68); c.lineTo(66, 68); c.quadraticCurveTo(90, 72, 92, 100); c.closePath(); c.fill();
    c.fillStyle = U.shade(shirt, -0.3); c.beginPath(); c.moveTo(40, 68); c.lineTo(50, 82); c.lineTo(60, 68); c.closePath(); c.fill();
    // neck
    c.fillStyle = darkSkin; c.fillRect(42, 58, 16, 14);
    // ears
    c.fillStyle = skin; c.beginPath(); c.ellipse(27, 47, 4, 6, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(73, 47, 4, 6, 0, 0, Math.PI * 2); c.fill();
    // hair behind the head (long / bob / afro)
    c.fillStyle = hair;
    if (r.hair === 'long') { c.beginPath(); c.moveTo(24, 40); c.quadraticCurveTo(18, 70, 22, 84); c.lineTo(78, 84); c.quadraticCurveTo(82, 70, 76, 40); c.closePath(); c.fill(); }
    if (r.hair === 'bob') { c.beginPath(); c.moveTo(24, 38); c.lineTo(22, 66); c.lineTo(78, 66); c.lineTo(76, 38); c.closePath(); c.fill(); }
    if (r.hair === 'afro') { c.beginPath(); c.arc(50, 42, 34, 0, Math.PI * 2); c.fill(); c.fillStyle = U.shade(hair, 0.15); for (i = 0; i < 9; i++) { var a = i / 9 * Math.PI * 2; c.beginPath(); c.arc(50 + Math.cos(a) * 27, 42 + Math.sin(a) * 27, 7, 0, Math.PI * 2); c.fill(); } }
    // head
    c.fillStyle = skin; c.beginPath(); c.ellipse(50, 46, 23, 27, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = hexA(darkSkin, 0.35); c.beginPath(); c.ellipse(50, 60, 10, 4, 0, 0, Math.PI); c.fill();   // chin shade
    // hair on top
    c.fillStyle = hair;
    switch (r.hair) {
      case 'bald': c.fillStyle = hexA('#ffffff', 0.18); c.beginPath(); c.ellipse(44, 26, 8, 4, -0.5, 0, Math.PI * 2); c.fill(); break;
      case 'short': case 'bob': case 'long': c.beginPath(); c.moveTo(27, 40); c.quadraticCurveTo(28, 16, 50, 17); c.quadraticCurveTo(72, 16, 73, 40); c.quadraticCurveTo(66, 30, 50, 29); c.quadraticCurveTo(34, 30, 27, 40); c.closePath(); c.fill(); break;
      case 'slick': c.beginPath(); c.moveTo(27, 38); c.quadraticCurveTo(26, 18, 52, 18); c.quadraticCurveTo(76, 18, 74, 36); c.quadraticCurveTo(64, 27, 50, 27); c.quadraticCurveTo(36, 27, 27, 38); c.closePath(); c.fill(); c.strokeStyle = hexA('#ffffff', 0.25); c.lineWidth = 1.5; c.beginPath(); c.moveTo(40, 22); c.quadraticCurveTo(50, 20, 66, 22); c.stroke(); break;
      case 'pompadour': c.beginPath(); c.moveTo(27, 40); c.quadraticCurveTo(26, 14, 46, 8); c.quadraticCurveTo(70, 2, 76, 22); c.quadraticCurveTo(78, 34, 73, 40); c.quadraticCurveTo(66, 29, 50, 29); c.quadraticCurveTo(34, 30, 27, 40); c.closePath(); c.fill(); c.fillStyle = hexA('#ffffff', 0.2); c.beginPath(); c.ellipse(52, 14, 12, 4, -0.3, 0, Math.PI * 2); c.fill(); break;
      case 'bun': c.beginPath(); c.moveTo(27, 40); c.quadraticCurveTo(28, 18, 50, 18); c.quadraticCurveTo(72, 18, 73, 40); c.quadraticCurveTo(66, 30, 50, 29); c.quadraticCurveTo(34, 30, 27, 40); c.closePath(); c.fill(); c.beginPath(); c.arc(50, 15, 9, 0, Math.PI * 2); c.fill(); break;
      case 'mohawk': c.beginPath(); c.moveTo(42, 28); c.lineTo(44, 2); c.lineTo(50, 10); c.lineTo(56, 2); c.lineTo(58, 28); c.closePath(); c.fill(); c.fillStyle = darkSkin; c.beginPath(); c.moveTo(27, 40); c.quadraticCurveTo(30, 24, 42, 24); c.lineTo(42, 30); c.quadraticCurveTo(34, 30, 27, 40); c.closePath(); c.fill(); c.beginPath(); c.moveTo(73, 40); c.quadraticCurveTo(70, 24, 58, 24); c.lineTo(58, 30); c.quadraticCurveTo(66, 30, 73, 40); c.closePath(); c.fill(); break;
      case 'afro': break;
      default: c.beginPath(); c.moveTo(27, 40); c.quadraticCurveTo(28, 16, 50, 17); c.quadraticCurveTo(72, 16, 73, 40); c.quadraticCurveTo(66, 30, 50, 29); c.quadraticCurveTo(34, 30, 27, 40); c.closePath(); c.fill();
    }
    // brows
    c.strokeStyle = U.shade(hair === '#e8b53a' ? '#3a2a1a' : hair, -0.2); c.lineWidth = 2.6; c.lineCap = 'round';
    var bl = brow === 'down' ? [36, 34, 44, 37] : brow === 'up' ? [36, 37, 44, 34] : brow === 'cock' ? [36, 36, 44, 34] : [36, 35, 44, 35];
    var br = brow === 'down' ? [56, 37, 64, 34] : brow === 'up' ? [56, 34, 64, 37] : brow === 'cock' ? [56, 36, 64, 38] : [56, 35, 64, 35];
    c.beginPath(); c.moveTo(bl[0], bl[1]); c.lineTo(bl[2], bl[3]); c.moveTo(br[0], br[1]); c.lineTo(br[2], br[3]); c.stroke();
    // eyes
    c.fillStyle = '#fbfbf6'; c.beginPath(); c.ellipse(40, 44, 5, 3.6, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(60, 44, 5, 3.6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1b1b22'; c.beginPath(); c.arc(41, 44.5, 2.2, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(61, 44.5, 2.2, 0, Math.PI * 2); c.fill();
    if (voice === 'lazy') { c.fillStyle = skin; c.fillRect(34, 39, 12, 4); c.fillRect(54, 39, 12, 4); }
    // nose
    c.strokeStyle = hexA(darkSkin, 0.7); c.lineWidth = 1.6; c.beginPath(); c.moveTo(50, 46); c.lineTo(48, 53); c.lineTo(52, 53); c.stroke();
    // mouth
    c.strokeStyle = U.shade(darkSkin, -0.4); c.lineWidth = 2; c.fillStyle = '#5a1f2a';
    switch (mouth) {
      case 'smirk': c.beginPath(); c.moveTo(43, 59); c.quadraticCurveTo(50, 60, 58, 56); c.stroke(); break;
      case 'smile': c.beginPath(); c.moveTo(43, 58); c.quadraticCurveTo(50, 63, 57, 58); c.stroke(); break;
      case 'grin': c.beginPath(); c.moveTo(41, 57); c.quadraticCurveTo(50, 66, 59, 57); c.closePath(); c.fill(); c.fillStyle = '#fbfbf6'; c.fillRect(44, 57.5, 12, 2.5); break;
      case 'frown': c.beginPath(); c.moveTo(43, 60); c.quadraticCurveTo(50, 56, 57, 60); c.stroke(); break;
      case 'shout': c.beginPath(); c.ellipse(50, 60, 7, 5, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fbfbf6'; c.fillRect(45, 56, 10, 2); break;
      case 'open': c.beginPath(); c.ellipse(50, 59.5, 5, 3.5, 0, 0, Math.PI * 2); c.fill(); break;
      case 'o': c.beginPath(); c.arc(50, 59, 2.6, 0, Math.PI * 2); c.fill(); break;
      case 'slack': c.beginPath(); c.moveTo(44, 59); c.lineTo(56, 60); c.stroke(); break;
      default: c.beginPath(); c.moveTo(44, 59); c.lineTo(56, 59); c.stroke();
    }
    // glasses
    c.lineWidth = 2; c.strokeStyle = '#1b1b22';
    switch (r.glasses) {
      case 'round': c.beginPath(); c.arc(40, 44, 6.5, 0, Math.PI * 2); c.moveTo(66.5, 44); c.arc(60, 44, 6.5, 0, Math.PI * 2); c.moveTo(46.5, 44); c.lineTo(53.5, 44); c.stroke(); break;
      case 'thick': c.lineWidth = 3.2; c.strokeRect(33, 39, 14, 10); c.strokeRect(53, 39, 14, 10); c.beginPath(); c.moveTo(47, 43); c.lineTo(53, 43); c.stroke(); break;
      case 'aviator': c.fillStyle = 'rgba(40,60,90,0.55)'; c.strokeStyle = '#d8c070'; c.lineWidth = 1.6; [40, 60].forEach(function (ex) { c.beginPath(); c.moveTo(ex - 8, 39); c.lineTo(ex + 8, 39); c.quadraticCurveTo(ex + 7, 52, ex, 52); c.quadraticCurveTo(ex - 7, 52, ex - 8, 39); c.closePath(); c.fill(); c.stroke(); }); c.beginPath(); c.moveTo(48, 40); c.lineTo(52, 40); c.stroke(); break;
      case 'shades': c.fillStyle = '#15171f'; rr(c, 31, 39, 17, 10, 3); c.fill(); rr(c, 52, 39, 17, 10, 3); c.fill(); c.fillRect(47, 42, 6, 2); c.fillStyle = hexA('#ffffff', 0.25); c.fillRect(34, 41, 6, 2); c.fillRect(55, 41, 6, 2); break;
      default: break;
    }
    // tie
    switch (r.tie) {
      case 'red': case 'blue': case 'gold': c.fillStyle = r.tie === 'red' ? '#c62f3b' : r.tie === 'blue' ? '#2d57c7' : '#e3b23a'; c.beginPath(); c.moveTo(46, 72); c.lineTo(54, 72); c.lineTo(56, 92); c.lineTo(50, 98); c.lineTo(44, 92); c.closePath(); c.fill(); break;
      case 'bowtie': c.fillStyle = o.id === 'goldplate' ? '#e3b23a' : '#c62f3b'; c.beginPath(); c.moveTo(50, 73); c.lineTo(38, 67); c.lineTo(38, 79); c.closePath(); c.fill(); c.beginPath(); c.moveTo(50, 73); c.lineTo(62, 67); c.lineTo(62, 79); c.closePath(); c.fill(); c.beginPath(); c.arc(50, 73, 3, 0, Math.PI * 2); c.fill(); break;
      default: break;
    }
    // extras
    switch (r.extra) {
      case 'mic': c.fillStyle = '#2a2d36'; rr(c, 70, 66, 8, 30, 3); c.fill(); c.fillStyle = '#9a9eab'; c.beginPath(); c.arc(74, 62, 9, 0, Math.PI * 2); c.fill(); c.fillStyle = '#555a66'; for (i = 0; i < 4; i++) { c.beginPath(); c.arc(70 + (i % 2) * 8, 58 + Math.floor(i / 2) * 8, 1.4, 0, Math.PI * 2); c.fill(); } break;
      case 'earpiece': c.fillStyle = '#d9dde8'; c.beginPath(); c.arc(73, 47, 3, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#d9dde8'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(74, 50); c.quadraticCurveTo(80, 60, 74, 72); c.stroke(); break;
      case 'cigar': c.fillStyle = '#6b3f23'; c.fillRect(56, 57, 18, 5); c.fillStyle = '#ff7a20'; c.fillRect(73, 57, 3, 5); c.fillStyle = hexA('#ffffff', 0.35); c.beginPath(); c.arc(78, 50, 3, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(81, 43, 2, 0, Math.PI * 2); c.fill(); break;
      case 'phone': c.fillStyle = '#1b1d26'; rr(c, 72, 60, 14, 26, 3); c.fill(); c.fillStyle = '#2ee6ff'; rr(c, 74, 63, 10, 18, 1.5); c.fill(); c.fillStyle = hexA('#ffffff', 0.5); c.fillRect(75, 65, 8, 1.5); c.fillRect(75, 69, 6, 1.5); break;
      case 'medal': c.fillStyle = '#c62f3b'; c.fillRect(29, 70, 6, 14); c.fillStyle = '#2d57c7'; c.fillRect(35, 70, 5, 14); c.fillStyle = '#e3b23a'; c.beginPath(); c.arc(35, 90, 7, 0, Math.PI * 2); c.fill(); c.fillStyle = '#f7dd8a'; c.beginPath(); c.arc(35, 90, 3, 0, Math.PI * 2); c.fill(); break;
      case 'flag_pin': c.fillStyle = '#2d57c7'; c.fillRect(30, 72, 10, 7); c.fillStyle = '#e3b23a'; c.beginPath(); c.moveTo(30, 72); c.lineTo(36, 75.5); c.lineTo(30, 79); c.closePath(); c.fill(); c.fillStyle = '#d8d8d8'; c.fillRect(29, 71, 1.5, 9); break;
      case 'lanyard': c.strokeStyle = '#2c3e7a'; c.lineWidth = 3; c.beginPath(); c.moveTo(42, 70); c.lineTo(45, 92); c.moveTo(58, 70); c.lineTo(55, 92); c.stroke(); c.fillStyle = '#f4f4f4'; rr(c, 43, 88, 14, 12, 1.5); c.fill(); c.fillStyle = accent; c.fillRect(45, 90, 10, 3); c.fillStyle = '#8f97b3'; c.fillRect(45, 94.5, 8, 1.5); c.fillRect(45, 97, 6, 1.5); break;
      default: break;
    }
    // hats
    var hatCol = U.shade(accent, -0.1);
    switch (r.hat) {
      case 'cap': c.fillStyle = hatCol; c.beginPath(); c.moveTo(26, 34); c.quadraticCurveTo(28, 10, 50, 12); c.quadraticCurveTo(72, 10, 74, 34); c.closePath(); c.fill(); c.fillStyle = U.shade(hatCol, -0.3); rr(c, 24, 31, 56, 5, 2.5); c.fill(); c.fillStyle = U.shade(hatCol, -0.3); c.beginPath(); c.moveTo(18, 36); c.quadraticCurveTo(44, 28, 74, 34); c.lineTo(74, 38); c.quadraticCurveTo(46, 34, 20, 40); c.closePath(); c.fill(); break;
      case 'beanie': c.fillStyle = hatCol; c.beginPath(); c.moveTo(26, 38); c.quadraticCurveTo(28, 8, 50, 10); c.quadraticCurveTo(72, 8, 74, 38); c.closePath(); c.fill(); c.fillStyle = U.shade(hatCol, -0.25); rr(c, 25, 32, 50, 8, 3); c.fill(); c.fillStyle = U.shade(hatCol, 0.2); c.beginPath(); c.arc(50, 10, 4, 0, Math.PI * 2); c.fill(); break;
      case 'cowboy': c.fillStyle = '#b8864a'; c.beginPath(); c.ellipse(50, 33, 34, 6, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(32, 33); c.quadraticCurveTo(34, 10, 50, 12); c.quadraticCurveTo(66, 10, 68, 33); c.closePath(); c.fill(); c.fillStyle = '#6b4a2a'; c.fillRect(32, 28, 36, 4); break;
      case 'fedora': c.fillStyle = '#2b2b33'; c.beginPath(); c.ellipse(50, 33, 31, 5.5, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(31, 33); c.lineTo(34, 12); c.quadraticCurveTo(50, 8, 66, 12); c.lineTo(69, 33); c.closePath(); c.fill(); c.fillStyle = accent; c.fillRect(32, 27, 36, 4); break;
      case 'beret': c.fillStyle = '#3a3d47'; c.beginPath(); c.ellipse(46, 24, 26, 11, -0.25, 0, Math.PI * 2); c.fill(); c.fillStyle = '#4a4d57'; c.beginPath(); c.arc(60, 15, 2.5, 0, Math.PI * 2); c.fill(); break;
      case 'crown': c.fillStyle = '#e3b23a'; c.beginPath(); c.moveTo(30, 30); c.lineTo(30, 12); c.lineTo(40, 22); c.lineTo(50, 8); c.lineTo(60, 22); c.lineTo(70, 12); c.lineTo(70, 30); c.closePath(); c.fill(); c.fillStyle = '#c62f3b'; c.beginPath(); c.arc(50, 24, 3, 0, Math.PI * 2); c.fill(); break;
      case 'helmet': var hc = o.id === 'goldplate' ? '#e3b23a' : '#f0c030'; c.fillStyle = hc; c.beginPath(); c.moveTo(27, 32); c.quadraticCurveTo(28, 8, 50, 9); c.quadraticCurveTo(72, 8, 73, 32); c.closePath(); c.fill(); c.fillStyle = U.shade(hc, -0.25); c.beginPath(); c.ellipse(50, 33, 30, 5, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = hexA('#ffffff', 0.3); c.fillRect(46, 10, 8, 20); break;
      default: break;
    }
    // protest sign for Roz
    if (o.sign) {
      c.fillStyle = '#5a3f2a'; c.fillRect(8, 60, 4, 40);
      c.fillStyle = '#f4ecd8'; c.fillRect(2, 44, 34, 20); c.strokeStyle = '#2a2a2a'; c.lineWidth = 1.5; c.strokeRect(2, 44, 34, 20);
      c.fillStyle = '#1a1a22'; c.font = 'bold 6px ' + FONT_DISPLAY; c.textAlign = 'center'; c.textBaseline = 'middle';
      var words = String(o.sign).split(' '), l1 = words.slice(0, Math.ceil(words.length / 2)).join(' '), l2 = words.slice(Math.ceil(words.length / 2)).join(' ');
      if (l2) { c.fillText(l1, 19, 50, 30); c.fillText(l2, 19, 58, 30); } else c.fillText(l1, 19, 54, 30);
    }
    // frame
    c.strokeStyle = hexA(accent, 0.9); c.lineWidth = 4; c.strokeRect(2, 2, 96, 96);
  }
  function castPortrait(ctx, id, x, y, size, opts) {
    var cm = cast(id) || cast('everyone') || { portrait: { skin: 3 }, color: '#8f97b3', look: {} };
    var sign = (id === 'roz') ? rozSign() : null;
    drawPortrait(ctx, cm.portrait || {}, x, y, size, Object.assign({ color: cm.color, shirt: cm.look && cm.look.shirt, voice: cm.voice, id: id, sign: sign }, opts || {}));
  }

  // ------------------------------------------------------- weapon icons ----
  // 40 x 40 unit glyphs for the twelve weapons (HUD panel, wheel, shop, touch)
  function drawWeaponIcon(ctx, id, x, y, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 40, s / 40);
    var col = color || COL.ink;
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (id) {
      case 'megaphone': ctx.beginPath(); ctx.moveTo(6, 16); ctx.lineTo(18, 16); ctx.lineTo(34, 6); ctx.lineTo(34, 34); ctx.lineTo(18, 24); ctx.lineTo(6, 24); ctx.closePath(); ctx.fill(); ctx.fillRect(10, 24, 6, 10); break;
      case 'pistol': ctx.beginPath(); ctx.moveTo(2, 11); ctx.lineTo(36, 11); ctx.lineTo(36, 20); ctx.lineTo(34, 20); ctx.lineTo(30, 36); ctx.lineTo(22, 36); ctx.lineTo(24, 20); ctx.lineTo(2, 20); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(18, 23, 4, 0, Math.PI * 2); ctx.stroke(); ctx.fillRect(2, 8, 4, 3); break;
      case 'revolver': ctx.beginPath(); ctx.moveTo(2, 12); ctx.lineTo(38, 12); ctx.lineTo(38, 18); ctx.lineTo(30, 18); ctx.lineTo(30, 22); ctx.lineTo(26, 22); ctx.lineTo(22, 36); ctx.lineTo(14, 36); ctx.lineTo(17, 24); ctx.lineTo(14, 24); ctx.lineTo(14, 18); ctx.lineTo(2, 18); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(21, 19, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(21, 19, 2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#8a4a3a'; ctx.beginPath(); ctx.moveTo(16, 26); ctx.lineTo(21, 26); ctx.lineTo(19, 34); ctx.lineTo(15, 34); ctx.closePath(); ctx.fill(); break;
      case 'smg': ctx.beginPath(); ctx.moveTo(2, 12); ctx.lineTo(38, 12); ctx.lineTo(38, 18); ctx.lineTo(30, 18); ctx.lineTo(30, 22); ctx.lineTo(24, 22); ctx.lineTo(24, 18); ctx.lineTo(16, 18); ctx.lineTo(14, 36); ctx.lineTo(8, 36); ctx.lineTo(9, 18); ctx.lineTo(2, 18); ctx.closePath(); ctx.fill(); ctx.fillRect(20, 18, 4, 12); break;
      case 'rifle': ctx.beginPath(); ctx.moveTo(1, 14); ctx.lineTo(39, 14); ctx.lineTo(39, 19); ctx.lineTo(27, 19); ctx.lineTo(27, 23); ctx.lineTo(20, 23); ctx.lineTo(20, 19); ctx.lineTo(12, 19); ctx.lineTo(10, 28); ctx.lineTo(5, 28); ctx.lineTo(6, 19); ctx.lineTo(1, 19); ctx.closePath(); ctx.fill(); ctx.fillRect(22, 23, 5, 11); ctx.fillRect(14, 9, 10, 4); ctx.fillRect(2, 24, 4, 8); break;
      case 'shotgun': ctx.beginPath(); ctx.moveTo(2, 14); ctx.lineTo(38, 14); ctx.lineTo(38, 19); ctx.lineTo(20, 19); ctx.lineTo(20, 24); ctx.lineTo(10, 24); ctx.lineTo(6, 32); ctx.lineTo(1, 32); ctx.lineTo(4, 19); ctx.lineTo(2, 19); ctx.closePath(); ctx.fill(); break;
      case 'sniper': ctx.beginPath(); ctx.moveTo(0, 17); ctx.lineTo(40, 17); ctx.lineTo(40, 21); ctx.lineTo(24, 21); ctx.lineTo(24, 24); ctx.lineTo(18, 24); ctx.lineTo(16, 30); ctx.lineTo(10, 30); ctx.lineTo(11, 21); ctx.lineTo(0, 21); ctx.closePath(); ctx.fill(); ctx.fillRect(14, 10, 14, 4); ctx.fillRect(16, 7, 3, 3); ctx.fillRect(23, 7, 3, 3); ctx.beginPath(); ctx.moveTo(30, 21); ctx.lineTo(28, 30); ctx.moveTo(34, 21); ctx.lineTo(36, 30); ctx.stroke(); break;
      case 'hottake': ctx.beginPath(); ctx.moveTo(10, 14); ctx.lineTo(30, 14); ctx.lineTo(27, 36); ctx.lineTo(13, 36); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff7a20'; ctx.beginPath(); ctx.moveTo(14, 12); ctx.quadraticCurveTo(12, 4, 20, 2); ctx.quadraticCurveTo(18, 8, 22, 10); ctx.quadraticCurveTo(26, 4, 28, 12); ctx.closePath(); ctx.fill(); break;
      case 'hotmic': ctx.beginPath(); ctx.arc(20, 11, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (var r = 0; r < 3; r++) ctx.fillRect(13, 7 + r * 3, 14, 1.2); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(16, 19); ctx.lineTo(24, 19); ctx.lineTo(22, 36); ctx.lineTo(18, 36); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.arc(20, 23, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(20, 36); ctx.quadraticCurveTo(28, 38, 32, 32); ctx.stroke(); break;
      case 'ratio': ctx.beginPath(); ctx.moveTo(2, 15); ctx.lineTo(34, 15); ctx.lineTo(39, 19); ctx.lineTo(34, 23); ctx.lineTo(2, 23); ctx.closePath(); ctx.fill(); ctx.fillRect(14, 23, 6, 12); ctx.fillRect(24, 23, 4, 6); ctx.fillStyle = COL.pink; ctx.fillRect(8, 17, 14, 4); ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.moveTo(34, 12); ctx.lineTo(39, 10); ctx.lineTo(36, 14); ctx.closePath(); ctx.fill(); break;
      case 'tableleg': ctx.save(); ctx.translate(20, 20); ctx.rotate(-0.7); ctx.fillStyle = col; rr(ctx, -4, -17, 8, 34, 3); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-4, -8, 8, 3); ctx.fillRect(-4, 3, 8, 3); ctx.fillStyle = col; rr(ctx, -8, -19, 16, 6, 2); ctx.fill(); ctx.restore(); break;
      default: // fist
        rr(ctx, 8, 12, 24, 20, 5); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (var i = 0; i < 4; i++) ctx.fillRect(10 + i * 5.5, 12, 2, 6); ctx.fillStyle = col; rr(ctx, 4, 18, 8, 14, 3); ctx.fill();
    }
    ctx.restore();
  }
  // a small vector icon per landmark kind (the map and the minimap)
  function drawKindIcon(ctx, kind, x, y, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 20, s / 20);
    ctx.fillStyle = color || COL.ink; ctx.strokeStyle = color || COL.ink; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (kind) {
      case 'campus': ctx.fillRect(-9, -4, 18, 3.5); ctx.beginPath(); ctx.moveTo(-7, -0.5); ctx.lineTo(-4, 8); ctx.moveTo(7, -0.5); ctx.lineTo(4, 8); ctx.stroke(); break;
      case 'studio': ctx.beginPath(); ctx.arc(0, 2, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.lineTo(0, 2); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, 9); ctx.moveTo(-4, 9); ctx.lineTo(4, 9); ctx.stroke(); break;
      case 'hospital': ctx.fillRect(-2.5, -8, 5, 16); ctx.fillRect(-8, -2.5, 16, 5); break;
      case 'police': ctx.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 3.6 : 8.5; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); ctx.fill(); break;
      case 'garage': ctx.save(); ctx.rotate(-0.78); ctx.fillRect(-2, -3, 4, 12); ctx.beginPath(); ctx.arc(0, -5, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-1.2, -9.5, 2.4, 4); ctx.restore(); break;
      case 'gas': rr(ctx, -7, -8, 10, 16, 2); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-5, -6, 6, 5); ctx.strokeStyle = color || COL.ink; ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(7, -2); ctx.lineTo(7, 6); ctx.stroke(); break;
      case 'terminal': case 'runway': case 'atc': case 'hangar': ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(2, -3); ctx.lineTo(9, 1); ctx.lineTo(9, 3); ctx.lineTo(2, 1); ctx.lineTo(1.5, 6); ctx.lineTo(4, 8); ctx.lineTo(4, 9); ctx.lineTo(0, 8); ctx.lineTo(-4, 9); ctx.lineTo(-4, 8); ctx.lineTo(-1.5, 6); ctx.lineTo(-2, 1); ctx.lineTo(-9, 3); ctx.lineTo(-9, 1); ctx.lineTo(-2, -3); ctx.closePath(); ctx.fill(); break;
      case 'yard': case 'quay': ctx.beginPath(); ctx.moveTo(-7, 9); ctx.lineTo(-7, -7); ctx.lineTo(8, -7); ctx.moveTo(4, -7); ctx.lineTo(4, -1); ctx.stroke(); ctx.fillRect(1, -1, 6, 4); ctx.fillRect(-9, 7, 5, 2); break;
      case 'dock': case 'ferry': ctx.beginPath(); ctx.moveTo(-9, 1); ctx.lineTo(9, 1); ctx.lineTo(6, 7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.fillRect(-1, -8, 2, 9); ctx.beginPath(); ctx.moveTo(1, -8); ctx.lineTo(7, -2); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill(); break;
      case 'museum': ctx.fillRect(-9, 6, 18, 3); ctx.fillRect(-9, -5, 18, 2); ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(0, -10); ctx.lineTo(10, -5); ctx.closePath(); ctx.fill(); ctx.fillRect(-7, -3, 2.5, 9); ctx.fillRect(-1.2, -3, 2.5, 9); ctx.fillRect(4.5, -3, 2.5, 9); break;
      case 'gunshop': ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke(); break;
      case 'home': ctx.beginPath(); ctx.moveTo(-9, 1); ctx.lineTo(0, -8); ctx.lineTo(9, 1); ctx.closePath(); ctx.fill(); ctx.fillRect(-6, 1, 12, 8); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-2, 4, 4, 5); break;
      case 'race': for (var r2 = 0; r2 < 3; r2++) for (var c2 = 0; c2 < 3; c2++) { ctx.fillStyle = (r2 + c2) % 2 ? '#111' : '#fff'; ctx.fillRect(-6 + c2 * 4.6, -8 + r2 * 4.6, 4.6, 4.6); } ctx.fillStyle = color || COL.ink; ctx.fillRect(-8, -9, 2, 19); break;
      case 'rampage': ctx.beginPath(); ctx.ellipse(0, -1, 9, 6.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(-6, 9); ctx.lineTo(2, 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-5, -2, 2, 2); ctx.fillRect(-1, -2, 2, 2); ctx.fillRect(3, -2, 2, 2); break;
      case 'ramp': ctx.beginPath(); ctx.moveTo(-9, 7); ctx.lineTo(9, 7); ctx.lineTo(9, -6); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-2, 2, 2, 5); ctx.fillRect(3, -1, 2, 8); break;
      case 'violation': ctx.beginPath(); for (var j = 0; j < 10; j++) { var a2 = -Math.PI / 2 + j * Math.PI / 5, rd = j % 2 ? 3.6 : 8.5; ctx.lineTo(Math.cos(a2) * rd, Math.sin(a2) * rd); } ctx.closePath(); ctx.fill(); break;
      case 'golf': ctx.fillRect(-1, -8, 2, 16); ctx.beginPath(); ctx.moveTo(1, -8); ctx.lineTo(9, -5); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, 8, 6, 2, 0, 0, Math.PI * 2); ctx.fill(); break;
      case 'property': ctx.font = 'bold 15px ' + FONT_DISPLAY; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 1); break;
      case 'job': rr(ctx, -8, -4, 16, 11, 2); ctx.fill(); ctx.fillRect(-3, -7, 6, 3); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-8, 0, 16, 1.5); break;
      case 'fire': ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(8, 0, 5, 6); ctx.quadraticCurveTo(0, 10, -5, 6); ctx.quadraticCurveTo(-8, 0, 0, -9); ctx.fill(); break;
      case 'client': ctx.beginPath(); ctx.arc(0, -4, 4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0, 8, 7, Math.PI, Math.PI * 2); ctx.fill(); break;
      case 'stranger': ctx.font = 'bold 17px ' + FONT_DISPLAY; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 1); break;
      case 'waypoint': ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(-6, -1); ctx.arc(0, -3, 6, Math.PI * 0.85, Math.PI * 2.15); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.arc(0, -3, 2.4, 0, Math.PI * 2); ctx.fill(); break;
      default: ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ minimap ----
  var MAP_PPM = 1;   // bake pixels per metre (4 px per tile)
  function bakeMap() {
    var Wd = GTP.World; if (!Wd || !Wd.tiles) return null;
    var T = Wd.T, M = Wd.M, w = Wd.w, h = Wd.h, tile = C.TILE * MAP_PPM;
    var cv = document.createElement('canvas'); cv.width = w * tile; cv.height = h * tile;
    var c = cv.getContext('2d');
    c.fillStyle = '#143449'; c.fillRect(0, 0, cv.width, cv.height);
    var colors = {};
    colors[T.ROAD] = '#8e939e'; colors[T.BRIDGE] = '#a3a7b1'; colors[T.RAMP] = '#9a9ea8'; colors[T.HIGHWAY] = '#b8bcc6';
    colors[T.SIDEWALK] = '#565a6b'; colors[T.BUILDING] = '#262a3a'; colors[T.GRASS] = '#2e5a35'; colors[T.SAND] = '#8d7c57';
    colors[T.PARKING] = '#474a56'; colors[T.PLAZA] = '#6b6758'; colors[T.WATER] = '#143449';
    for (var tz = 0; tz < h; tz++) for (var tx = 0; tx < w; tx++) {
      var i = tz * w + tx, t = Wd.tiles[i], col = colors[t];
      if (!col || t === T.WATER || t === T.VOID) continue;
      if (t === T.PLAZA && Wd.meta && M.DOCK && (Wd.meta[i] & M.DOCK)) col = '#7a6646';
      if (t === T.GRASS && Wd.meta && M.LAWN && (Wd.meta[i] & M.LAWN)) col = '#376a3d';
      if (t === T.PARKING && Wd.meta && M.RUNWAY && (Wd.meta[i] & M.RUNWAY)) col = '#5a5d66';
      c.fillStyle = col; c.fillRect(tx * tile, tz * tile, tile, tile);
    }
    // landmark footprints a touch lighter so they read as places
    var lms = Wd.landmarks || [];
    for (var k = 0; k < lms.length; k++) {
      var b = lms[k].building; if (!b) continue;
      c.fillStyle = '#3d4158'; c.fillRect(b.x * MAP_PPM, b.z * MAP_PPM, b.w * MAP_PPM, b.d * MAP_PPM);
    }
    // the elevated Loop on top
    if (Wd.deck) {
      c.fillStyle = '#c4c8d2';
      for (tz = 0; tz < h; tz++) for (tx = 0; tx < w; tx++) if (Wd.deck[tz * w + tx]) c.fillRect(tx * tile, tz * tile, tile, tile);
    }
    return cv;
  }
  function ensureMap() {
    var Wd = GTP.World, seed = Wd ? Wd._seed : null;
    if (ui.map.bake && ui.map.seed === seed && ui.map.bake.width === (Wd ? Wd.w * C.TILE * MAP_PPM : 0)) return ui.map.bake;
    try { ui.map.bake = bakeMap(); ui.map.seed = seed; ui.map.route = null; ui.map.routeKey = ''; } catch (e) { U.reportError(e, 'ui.bakeMap'); ui.map.bake = null; }
    return ui.map.bake;
  }
  function copBlips(out) {
    out.length = 0;
    var E = GTP.Entities; if (!E) return out;
    var list = E.list;
    for (var i = 0; i < list.length; i++) {
      var e = list[i]; if (e.removed) continue;
      if (e.bossPart || e.boss) continue;   // a boss weak point (an entity of kind 'heli') is not a police helicopter
      if (e.kind === 'heli') { out.push({ x: e.x, z: e.z, kind: 'heli' }); continue; }
      if (e.kind === 'vehicle' && e.isPolice && !e.wreck && e.driver) { out.push({ x: e.x, z: e.z, kind: 'car' }); continue; }
      if (e.kind === 'ped' && e.alive && !e.inVehicle && (e.role === 'cop' || e.role === 'swat' || e.role === 'hoa')) out.push({ x: e.x, z: e.z, kind: 'cop' });
    }
    return out;
  }
  var blipBuf = [];
  // every marker the map and the minimap show: missions, objectives, strands (with icons), shops, home, the waypoint
  function allMarkers() {
    var Ms = GTP.Missions, out = [];
    try { out = Ms && Ms.allMarkers ? Ms.allMarkers() : (Ms && Ms.markers ? Ms.markers() : []); } catch (e) { out = []; }
    // strangers side missions (GTP.Strangers, mission kind 'stranger') come as ordinary mission markers: drawn as a purple '?'
    for (var si = 0; si < out.length; si++) { var sid = out[si] && out[si].kind === 'mission' ? strandOf(out[si].missionId || out[si].id) : null; if (sid) out[si] = Object.assign({}, out[si], { kind: 'stranger', icon: 'stranger', strangerId: sid }); }
    // the systems' entries (properties for sale, safehouses, the golf course, odd jobs; the job calls and the pin while one runs)
    var Sy = GTP.Systems;
    if (Sy && typeof Sy.markers === 'function') { try { var sy = Sy.markers() || []; for (var yi = 0; yi < sy.length; yi++) if (sy[yi] && typeof sy[yi].x === 'number') out.push(sy[yi]); } catch (e) { /* optional */ } }
    var CB = GTP.Combat, g = game();
    if (CB && CB.shop && CB.shop.stores) {
      var inCut = g && g.state === 'cutscene';
      try { var st = CB.shop.stores(); for (var i = 0; i < st.length && !inCut; i++) out.push({ id: 'shop:' + st[i].id, kind: 'shop', icon: 'gunshop', x: st[i].x, z: st[i].z, title: st[i].name || 'Both Sides Arms', color: COL.green }); } catch (e) { /* optional */ }
    }
    return out;
  }
  // the strand of a strangers mission id (null for the story's own missions)
  function strandOf(missionId) {
    if (!missionId) return null;
    var Sg = GTP.Strangers; if (Sg && typeof Sg.strandOf === 'function') { var r = call(Sg.strandOf, Sg, [missionId], null); if (r) return r; }
    var Ms = GTP.Missions, d = Ms && Ms.def ? call(Ms.def, Ms, [missionId], null) : null;
    return d && d.kind === 'stranger' ? (d.strand || 'stranger') : null;
  }
  // mission and objective blips on top of the home / strand icons that can share their spot (QA-B-NP-02)
  function markersByLayer() {
    var all = allMarkers(), rank = function (m) { return m.kind === 'objective' ? 3 : m.kind === 'mission' ? 2 : m.kind === 'stranger' ? 1 : 0; };
    return all.map(function (m, i) { return { m: m, i: i }; }).sort(function (a, b) { return rank(a.m) - rank(b.m) || a.i - b.i; }).map(function (o) { return o.m; });
  }
  function markerColor(mk) {
    if (mk.kind === 'objective') return COL.amber;
    if (mk.kind === 'mission') return '#4aa8ff';
    if (mk.kind === 'shop') return COL.green;
    if (mk.icon === 'home') return COL.white;
    if (mk.icon === 'race') return COL.white;
    if (mk.icon === 'violation') return COL.cream;
    if (mk.kind === 'stranger') return '#c084fc';
    if (mk.icon === 'target') return COL.amber;
    if (typeof mk.color === 'number') return '#' + ('000000' + mk.color.toString(16)).slice(-6);
    return mk.color || COL.pink;
  }
  function waypoint() { var g = game(); var wp = g ? g.waypoint : null; ui.waypoint = wp && typeof wp.x === 'number' ? wp : null; return ui.waypoint; }
  function setWaypoint(x, z) {
    var g = game(); if (!g) return null;
    var wp = waypoint();
    if (wp && U.dist2d(wp.x, wp.z, x, z) < 12) { g.waypoint = null; ui.waypoint = null; ui.map.route = null; sfx('ui', 0.25); toast('Waypoint cleared'); return null; }
    g.waypoint = { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 }; ui.waypoint = g.waypoint; ui.map.route = null; ui.map.routeT = 0; ui.map.routeKey = '';
    sfx('ui', 0.35);
    return g.waypoint;
  }
  // the route line to the waypoint along the roads (World.findPath, car mode), refreshed every 2 s; a straight line without a path
  function updateRoute(dt) {
    var wp = waypoint(), p = player(), Wd = GTP.World, g = game();
    if (!wp || !p) { ui.map.route = null; return; }
    if (g && g.state === 'playing' && U.dist2d(p.x, p.z, wp.x, wp.z) < 10) { g.waypoint = null; ui.waypoint = null; ui.map.route = null; toast('Waypoint reached. The arrow was not a journalist.'); sfx('pickup', 0.3); return; }
    ui.map.routeT -= dt;
    if (ui.map.routeT > 0) return;
    ui.map.routeT = 2;
    // a search only when the player moved 12 m or the waypoint changed; a failed search backs off 10 s / 30 m (QAC-25)
    var key = wp.x + ',' + wp.z, rc = ui.map.routeCache;
    if (rc && rc.key === key && U.dist2d(p.x, p.z, rc.x, rc.z) < (rc.failed ? 30 : 12) && (!rc.failed || ui.t - rc.t < 10) && ui.map.route) return;
    var path = computeRoute(p.x, p.z, wp.x, wp.z, { fromY: p.y }), failed = !path || path.failed;
    ui.map.routeCache = { key: key, x: p.x, z: p.z, t: ui.t, failed: failed };
    ui.map.route = path && path.length > 1 ? path : [{ x: p.x, z: p.z }, { x: wp.x, z: wp.z }];
  }
  function drawMarkerIcon(ctx, mk, x, y, s, lbl) {
    var col = markerColor(mk);
    if (mk.kind === 'objective' || mk.kind === 'mission') {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, s * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
      if (mk.kind === 'mission') { ctx.fillStyle = '#0b1020'; ctx.font = F(Math.max(7, s * 0.8), 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('M', x, y + 0.5); }
      return;
    }
    var icon = mk.icon || (mk.kind === 'shop' ? 'gunshop' : 'dot');
    ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.fillStyle = 'rgba(8,10,20,0.75)'; ctx.beginPath(); ctx.arc(x, y, s * 0.78, 0, Math.PI * 2); ctx.fill();
    drawKindIcon(ctx, icon, x, y, s * 1.1, col);
    ctx.restore();
    void lbl;
  }
  function drawMinimap(ctx) {
    var p = player(), Rd = GTP.Render, m = minimapRect(); if (!p || !Rd) return;
    if (indoors()) { drawIndoorMinimap(ctx, m); return; }
    var size = m.s, cx = m.x + size / 2, cy = m.y + size / 2, r = size / 2;
    var zoom = (size / 180) * (p.inVehicle ? 0.78 : 1);   // px per metre
    var yaw = Rd.rig ? Rd.rig.yaw : 0;
    var bake = ensureMap();
    ctx.save();
    rr(ctx, m.x, m.y, size, size, px(14)); ctx.fillStyle = '#0d1424'; ctx.fill();
    ctx.clip();
    if (bake) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(yaw);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bake, -p.x * MAP_PPM * zoom / MAP_PPM, -p.z * zoom, bake.width * zoom / MAP_PPM, bake.height * zoom / MAP_PPM);
      ctx.restore();
    }
    var toLocal = function (x, z) { var dx = (x - p.x) * zoom, dz = (z - p.z) * zoom, cs = Math.cos(yaw), sn = Math.sin(yaw); return { x: cx + dx * cs - dz * sn, y: cy + dx * sn + dz * cs, far: Math.sqrt(dx * dx + dz * dz) > r - px(12) }; };
    var clampEdge = function (l) { var dx = l.x - cx, dy = l.y - cy, d = Math.sqrt(dx * dx + dy * dy) || 1, rr2 = r - px(12); return { x: cx + dx / d * rr2, y: cy + dy / d * rr2, ang: Math.atan2(dy, dx) }; };
    // the waypoint route (white) under the blips
    var wp = waypoint(), route = ui.map.route;
    if (wp && route && route.length > 1) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = px(2.5); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); var l0 = toLocal(p.x, p.z); ctx.moveTo(l0.x, l0.y);
      for (var ri = 0; ri < route.length; ri++) { var lr = toLocal(route[ri].x, route[ri].z); ctx.lineTo(lr.x, lr.y); }
      var lw = toLocal(wp.x, wp.z); ctx.lineTo(lw.x, lw.y); ctx.stroke(); ctx.restore();
    }
    drawGpsMinimap(ctx, toLocal, clampEdge);
    // the north badge sits under the rim arrows (a target due north keeps its arrow, QA-B-HUD-10)
    var nx = cx + Math.sin(yaw) * (r - px(11)), ny = cy - Math.cos(yaw) * (r - px(11));
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(nx, ny, px(7), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b1020'; ctx.font = F(9, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', nx, ny + 0.5);
    var marks = markersByLayer(), t = ui.t, i;
    for (i = 0; i < marks.length; i++) {
      var mk = marks[i], l = toLocal(mk.x, mk.z), col = markerColor(mk);
      if (l.far) {
        if (mk.kind === 'shop' || mk.kind === 'stranger' || mk.kind === 'system' || mk.icon === 'home' || mk.icon === 'race' || mk.icon === 'rampage') continue;   // only the objective-grade markers point from the rim
        var e = clampEdge(l); ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px(7), 0); ctx.lineTo(-px(4), -px(5)); ctx.lineTo(-px(4), px(5)); ctx.closePath(); ctx.fill(); ctx.restore(); continue;
      }
      var pulse = mk.kind === 'objective' || mk.kind === 'mission' ? 1 + 0.15 * Math.sin(t * 4 + i) : 1;
      drawMarkerIcon(ctx, mk, l.x, l.y, px(10) * pulse);
    }
    if (wp) {
      var lp = toLocal(wp.x, wp.z);
      if (lp.far) { var ew = clampEdge(lp); ctx.save(); ctx.translate(ew.x, ew.y); ctx.rotate(ew.ang); ctx.fillStyle = COL.white; ctx.beginPath(); ctx.moveTo(px(7), 0); ctx.lineTo(-px(4), -px(5)); ctx.lineTo(-px(4), px(5)); ctx.closePath(); ctx.fill(); ctx.restore(); }
      else drawKindIcon(ctx, 'waypoint', lp.x, lp.y - px(4), px(14), COL.white);
    }
    var wl = (GTP.AI && GTP.AI.wanted) ? GTP.AI.wanted.level : (p.wanted || 0);
    if (wl > 0) {
      var blips = copBlips(blipBuf);
      for (i = 0; i < blips.length; i++) {
        var bl = blips[i], lb = toLocal(bl.x, bl.z); if (lb.far) continue;
        if (bl.kind === 'heli') { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lb.x - px(6), lb.y - px(6)); ctx.lineTo(lb.x + px(6), lb.y + px(6)); ctx.moveTo(lb.x + px(6), lb.y - px(6)); ctx.lineTo(lb.x - px(6), lb.y + px(6)); ctx.stroke(); continue; }
        ctx.fillStyle = (Math.floor(t * 4) % 2) ? '#4a7cff' : '#ff3b30'; ctx.beginPath(); ctx.arc(lb.x, lb.y, px(bl.kind === 'car' ? 4.5 : 3.2), 0, Math.PI * 2); ctx.fill();
      }
    }
    // player arrow (fixed, pointing up)
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = COL.ink; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -px(9)); ctx.lineTo(px(6.5), px(7)); ctx.lineTo(0, px(3.5)); ctx.lineTo(-px(6.5), px(7)); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();
    // frame
    rr(ctx, m.x, m.y, size, size, px(14)); ctx.lineWidth = px(3); ctx.strokeStyle = wl > 0 && (Math.floor(t * 3) % 2) ? 'rgba(255,59,48,0.9)' : 'rgba(238,241,251,0.85)'; ctx.stroke();
    // district / street chip
    var Wd = GTP.World, d = Wd.districtAt ? Wd.districtAt(p.x, p.z) : null, street = Wd.streetAt ? Wd.streetAt(p.x, p.z, p.y) : null;
    var near = nearLandmark(p);
    if (street && Wd.loopAt && Wd.lowerLoopName && Wd.loopAt(p.x, p.z, p.y) === 'lower' && street === (Wd.loopName || 'The Loop')) street = Wd.lowerLoopName;
    var line1 = d ? String(d.name || d.id).toUpperCase() : 'OPEN WATER', line2 = near ? landmarkLabel(near) : (street || '');
    drawPlaceChip(ctx, m, line1, line2);
  }
  // the district / street chip by the minimap (sets ui.chipBottom for what stacks under it)
  function drawPlaceChip(ctx, m, line1, line2) {
    var size = m.s, chipFont = F(13, 'bold'), cw = Math.max(measure(ctx, line1, F(10, 'bold')), measure(ctx, line2, chipFont)) + px(22);
    cw = Math.min(cw, portrait ? W - safe.l - safe.r : px(360));
    var chx = m.left ? m.x : m.x + size - cw, chy = m.top ? m.y + size + px(6) : m.y - px(44);
    panel(ctx, chx, chy, cw, px(38), px(8), COL.panelSoft, 'rgba(255,255,255,0.12)');
    var tx = m.left ? chx + px(10) : chx + cw - px(10), al = m.left ? 'left' : 'right';
    txt(ctx, line1, tx, chy + px(14), { font: F(10, 'bold'), color: COL.cyan, align: al, outline: false, maxW: cw - px(20) });
    txt(ctx, line2, tx, chy + px(30), { font: chipFont, color: COL.ink, align: al, outline: false, maxW: cw - px(20) });
    ui.chipBottom = chy + px(38);
  }
  // inside a GTP.Interiors room (built far from the city): no city map, no GPS chip, no 4 km objective arrow; the minimap
  // says where the player is and how out works
  function indoors() { var I = GTP.Interiors; return !!(I && I.active); }
  function drawIndoorMinimap(ctx, m) {
    var size = m.s, cx = m.x + size / 2, cy = m.y + size / 2, I = ui.interior || {};
    var name = storeLabel(I.store || I.landmark, I.kind) || INTERIOR_NAMES[I.kind] || 'Indoors';
    ctx.save();
    rr(ctx, m.x, m.y, size, size, px(14)); ctx.fillStyle = '#121626'; ctx.fill(); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    for (var g2 = px(16); g2 < size; g2 += px(16)) { ctx.beginPath(); ctx.moveTo(m.x + g2, m.y); ctx.lineTo(m.x + g2, m.y + size); ctx.moveTo(m.x, m.y + g2); ctx.lineTo(m.x + size, m.y + g2); ctx.stroke(); }
    // a door glyph and the way out
    ctx.fillStyle = COL.green; rr(ctx, cx - px(11), cy - px(30), px(22), px(32), px(3)); ctx.fill();
    ctx.fillStyle = '#121626'; ctx.beginPath(); ctx.arc(cx + px(5), cy - px(13), px(2), 0, Math.PI * 2); ctx.fill();
    txt(ctx, 'INDOORS', cx, cy + px(22), { font: F(12, '900'), color: COL.ink, align: 'center', outline: false });
    txt(ctx, 'Walk out the door to leave', cx, cy + px(38), { font: F(9, 'bold'), color: COL.muted, align: 'center', outline: false, maxW: size - px(16) });
    ctx.restore();
    rr(ctx, m.x, m.y, size, size, px(14)); ctx.lineWidth = px(3); ctx.strokeStyle = 'rgba(238,241,251,0.85)'; ctx.stroke();
    drawPlaceChip(ctx, m, 'INSIDE', name);
  }
  function nearLandmark(p) {
    var Wd = GTP.World, lms = Wd && Wd.landmarks; if (!lms) return null;
    var best = null, bd = 26;
    for (var i = 0; i < lms.length; i++) {
      var lm = lms[i], b = lm.building, d;
      if (b) { var nx = U.clamp(p.x, b.x, b.x + b.w), nz = U.clamp(p.z, b.z, b.z + b.d); d = U.dist2d(p.x, p.z, nx, nz); }
      else if (lm.door) d = U.dist2d(p.x, p.z, lm.door.x, lm.door.z); else continue;
      if (d < bd) { bd = d; best = lm; }
    }
    return best;
  }

  // ---------------------------------------------------------------- HUD ----
  function drawBars(ctx, x, y, w) {
    var p = player(); if (!p) return;
    var hp = U.clamp((p.hp || 0) / (p.maxHp || 100), 0, 1), ar = U.clamp((p.armor || 0) / 100, 0, 1);
    var bh = px(14), gap = px(6), lw = px(44);
    var hc = hp > 0.5 ? COL.lime : hp > 0.25 ? COL.amber : COL.red;
    var low = hp <= 0.25 && (Math.floor(ui.t * 4) % 2 === 0);
    txt(ctx, 'HEALTH', x, y + bh - px(3), { font: F(9, 'bold'), color: low ? COL.red : COL.muted });
    panel(ctx, x + lw, y, w - lw, bh, px(4), 'rgba(6,7,13,0.7)', 'rgba(255,255,255,0.18)');
    ctx.fillStyle = hc; rr(ctx, x + lw + 2, y + 2, Math.max(0, (w - lw - 4) * hp), bh - 4, px(3)); ctx.fill();
    var y2 = y + bh + gap;
    txt(ctx, 'ARMOR', x, y2 + bh - px(3), { font: F(9, 'bold'), color: COL.muted });
    panel(ctx, x + lw, y2, w - lw, bh, px(4), 'rgba(6,7,13,0.7)', 'rgba(255,255,255,0.18)');
    if (ar > 0) { ctx.fillStyle = '#5aa8ff'; rr(ctx, x + lw + 2, y2 + 2, Math.max(0, (w - lw - 4) * ar), bh - 4, px(3)); ctx.fill(); }
    txt(ctx, Math.round(p.hp) + '', x + w - px(4), y + bh - px(3), { font: F(9, 'bold'), color: COL.ink, align: 'right', outline: 'rgba(0,0,0,0.9)', lw: 2 });
    if (ar > 0) txt(ctx, Math.round(p.armor) + '', x + w - px(4), y2 + bh - px(3), { font: F(9, 'bold'), color: COL.ink, align: 'right', outline: 'rgba(0,0,0,0.9)', lw: 2 });
  }
  function updateMoney(dt) {
    var p = player(); if (!p) return;
    var m = ui.money, target = p.money | 0;
    if (m.shown == null) { m.shown = target; m.last = target; }
    else {
      if (target !== m.last) { m.delta += target - m.last; m.deltaT = 2.2; m.last = target; }
      var diff = target - m.shown;
      if (diff !== 0) {
        var step = Math.max(1, Math.abs(diff) * dt * 6, dt * 400);
        if (Math.abs(diff) <= step) m.shown = target; else m.shown += (diff > 0 ? 1 : -1) * step;
      }
      if (m.deltaT > 0) { m.deltaT -= dt; if (m.deltaT <= 0) m.delta = 0; }
    }
    // subscribers roll up the same way; gains float up in pink
    var s = ui.subs, ts = p.subs | 0;
    if (s.shown == null) { s.shown = ts; s.last = ts; }
    else {
      if (ts !== s.last) { if (ts > s.last) s.floats.push({ n: ts - s.last, t: 0 }); s.last = ts; if (s.floats.length > 4) s.floats.shift(); }
      var sd = ts - s.shown;
      if (sd !== 0) { var ss = Math.max(1, Math.abs(sd) * dt * 5, dt * 900); if (Math.abs(sd) <= ss) s.shown = ts; else s.shown += (sd > 0 ? 1 : -1) * ss; }
    }
    for (var i = s.floats.length - 1; i >= 0; i--) { s.floats[i].t += dt; if (s.floats[i].t > 2.2) s.floats.splice(i, 1); }
  }
  function drawMoney(ctx, rx, y) {
    var m = ui.money, str = U.fmtMoney(m.shown == null ? 0 : m.shown);
    txt(ctx, str, rx, y, { font: F(26, 'bold'), color: COL.lime, align: 'right', lw: px(4) });
    if (m.deltaT > 0 && m.delta) {
      var a = Math.min(1, m.deltaT / 0.6), ds = (m.delta > 0 ? '+' : '') + U.fmtMoney(m.delta);
      txt(ctx, ds, rx - measure(ctx, str, F(26, 'bold')) - px(10), y, { font: F(13, 'bold'), color: m.delta > 0 ? COL.amber : COL.red, align: 'right', alpha: a });
    }
    // SUBS 12.4K under the money, the gains floating up
    var s = ui.subs, X = expansion(), label = (X.subscriberSources && X.subscriberSources.hudLabel) || 'SUBS';
    txt(ctx, label + ' ' + fmtSubs(s.shown == null ? 0 : s.shown), rx, y + px(18), { font: F(12, 'bold'), color: COL.pink, align: 'right' });
    for (var i = 0; i < s.floats.length; i++) {
      var f = s.floats[i], k = f.t / 2.2;
      txt(ctx, '+' + fmtSubs(f.n), rx - px(118) - i * px(44), y + px(30) - ease(k) * px(22), { font: F(11, 'bold'), color: COL.pink, align: 'right', alpha: k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1 });
    }
  }
  function star(ctx, cx, cy, r, fill, stroke) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  function updateWanted(dt) {
    var p = player(); if (!p) return;
    var lvl = (GTP.AI && GTP.AI.wanted) ? GTP.AI.wanted.level : (p.wanted || 0);
    if (lvl > ui.wanted.last) { ui.wanted.flashT = 1.6; sfx('ui', 0.3); }
    ui.wanted.last = lvl;
    if (ui.wanted.flashT > 0) ui.wanted.flashT -= dt;
  }
  function drawStars(ctx, rx, y) {
    var lvl = ui.wanted.last, r = px(10), gap = px(24), flash = ui.wanted.flashT > 0 && (Math.floor(ui.t * 8) % 2 === 0);
    for (var i = 0; i < 5; i++) {
      var cx = rx - r - i * gap, on = (4 - i) < lvl;   // stars light up from the left of the row
      var pop = on && ui.wanted.flashT > 0 ? 1 + 0.25 * Math.max(0, ui.wanted.flashT - 1) : 1;
      star(ctx, cx, y, r * pop, on ? (flash ? '#ffffff' : COL.gold) : 'rgba(10,12,24,0.45)', on ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.25)');
    }
    // the HOA's own star (flag hoa_truce): cream, never fills
    var fl = GTP.Missions && GTP.Missions.state ? GTP.Missions.state.flags || {} : {};
    if (fl.hoa_truce) star(ctx, rx - r - 5 * gap - px(4), y, r * 0.85, 'rgba(244,234,216,0.22)', COL.cream);
  }
  function drawWeapon(ctx, rx, y) {
    var CB = GTP.Combat, h = CB && CB.hud ? CB.hud() : null, w = h ? h.weapon : { id: 'fist', name: 'Fists', infinite: true, ammo: null };
    var bw = px(160), bh = px(44), x = rx - bw;
    var fl = GTP.Missions && GTP.Missions.state ? GTP.Missions.state.flags || {} : {};
    panel(ctx, x, y, bw, bh, px(8), COL.panelSoft, 'rgba(255,255,255,0.14)');
    drawWeaponIcon(ctx, w.id, x + px(6), y + px(4), px(36), COL.ink);
    txt(ctx, String(w.name || w.id).toUpperCase(), x + px(48), y + px(18), { font: F(11, 'bold'), color: COL.muted, outline: false, maxW: bw - px(56) });
    var ammoCol = fl.rampage_king ? COL.pink : COL.ink;
    if (w.infinite) txt(ctx, '∞', x + bw - px(10), y + px(38), { font: F(22, 'bold'), color: ammoCol, align: 'right', outline: false });
    else if (w.mag != null && w.magSize) {
      var low = w.mag <= Math.max(1, Math.floor(w.magSize / 4));
      txt(ctx, String(w.mag), x + bw - px(10) - measure(ctx, ' | ' + (w.reserve == null ? '-' : w.reserve), F(12, 'bold')), y + px(38), { font: F(18, 'bold'), color: low ? COL.red : ammoCol, align: 'right', outline: false });
      txt(ctx, ' | ' + (w.reserve == null ? '-' : w.reserve), x + bw - px(10), y + px(37), { font: F(12, 'bold'), color: COL.muted, align: 'right', outline: false });
    } else {
      var ammo = String(w.ammo == null ? 0 : w.ammo);
      txt(ctx, ammo, x + bw - px(10), y + px(38), { font: F(18, 'bold'), color: (w.ammo <= 5) ? COL.red : ammoCol, align: 'right', outline: false });
    }
    if (w.reloading) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, x + px(48), y + px(30), px(60), px(5), px(2)); ctx.fill();
      ctx.fillStyle = COL.amber; rr(ctx, x + px(48), y + px(30), px(60) * clamp01(w.reloading.k), px(5), px(2)); ctx.fill();
      txt(ctx, 'RELOADING', x + px(48), y + px(26), { font: F(8, 'bold'), color: COL.amber, outline: false });
    } else if (ui.wanted.last === 0 && w.id === 'fist') txt(ctx, glyph('wheel') + ' wheel' + (device() === 'touch' ? '' : ' · ' + glyph('weaponPrev') + ' ' + glyph('weaponNext') + ' cycle'), x + px(48), y + px(36), { font: F(9, 'bold'), color: '#b8bfd6', outline: false, maxW: bw - px(62) - measure(ctx, '∞', F(22, 'bold')) });
    else if (!w.infinite && w.magSize && w.mag === 0 && w.reserve > 0) txt(ctx, glyph('reload') + ' reload', x + px(48), y + px(36), { font: F(9, 'bold'), color: COL.red, outline: false });
  }
  function drawClock(ctx, rx, y) {
    var g = game(); if (!g) return;
    txt(ctx, U.fmtClock(g.time.clock), rx, y, { font: F(16, 'bold'), color: COL.ink, align: 'right' });
    txt(ctx, 'DAY ' + g.time.day, rx - px(64), y, { font: F(10, 'bold'), color: COL.muted, align: 'right' });
  }
  // the objective panel: the mission objective (text, progress, hint, timer) or, with no mission, the active strand's line
  function drawObjective(ctx, y) {
    var Ms = GTP.Missions, h = Ms && Ms.hud ? Ms.hud() : null, St = GTP.Strands, sh = null;
    var mission = !!(h && h.active && h.phase === 'play' && h.objective);
    if (!mission && St && St.hud) { try { sh = St.hud(); } catch (e) { sh = null; } if (!sh || !sh.active || sh.race && sh.race.active) sh = null; }
    if (!mission && !sh) return y;
    var text = mission ? h.objective : (sh.line || sh.title || ''), timer = mission ? h.timer : sh.timer, prog = mission ? h.progress : null;
    var hint = mission ? h.hint : (sh.progress || null), title = mission ? null : (sh.title || '').toUpperCase();
    var maxW = Math.min(px(620), W - safe.l - safe.r - (portrait ? 0 : px(20)));
    var objFont = F(15, 'bold', FONT_TEXT);
    var lines = wrap(ctx, text, objFont, maxW - px(28));
    var hasTimer = !!timer, hasProg = !!(prog && prog.total) && !(prog.n != null && String(text).indexOf(prog.n + '/' + prog.total) >= 0);   // no second count (QA-B-NP-05)
    // the timer row keeps clear of the hint line, and of the progress count at the top right when a single line has no hint
    var timerGap = hasTimer ? (hint ? px(8) : (hasProg && lines.length < 2 ? px(10) : 0)) : 0;
    var ph = px(14) + lines.length * px(19) + (hasTimer ? px(24) + timerGap : 0) + (hint ? px(16) : 0) + (title ? px(14) : 0);
    var want = px(28) + (hasProg ? px(60) : 0);
    for (var li = 0; li < lines.length; li++) want = Math.max(want, measure(ctx, lines[li], objFont) + px(32) + (hasProg ? px(56) : 0));
    if (hint) want = Math.max(want, measure(ctx, hint, F(11)) + px(32));
    if (title) want = Math.max(want, measure(ctx, title, F(10, 'bold')) + px(32) + (h && h.replay ? px(60) : 0));
    var pw = hasTimer ? maxW : U.clamp(want, Math.min(px(300), maxW), maxW), x = (W - pw) / 2;
    var accent = mission ? COL.amber : COL.pink;
    panel(ctx, x, y, pw, ph, px(10), COL.panelSoft, mission ? 'rgba(46,230,255,0.22)' : 'rgba(255,63,164,0.3)');
    ctx.fillStyle = accent; ctx.fillRect(x, y + px(8), px(4), ph - px(16));
    var ty = y + px(24);
    if (title) { txt(ctx, title, x + px(16), y + px(18), { font: F(10, 'bold'), color: COL.pink, outline: false, maxW: pw - px(32) }); ty += px(14); }
    for (var i = 0; i < lines.length; i++) { txt(ctx, lines[i], x + px(16), ty, { font: objFont, color: COL.ink, outline: false, maxW: pw - px(32) }); ty += px(19); }
    if (hasProg) {
      var ps = prog.n != null ? prog.n + '/' + prog.total : (prog.seconds != null ? Math.ceil(prog.seconds) + 's' : '');
      txt(ctx, ps, x + pw - px(12), y + px(24), { font: F(14, 'bold'), color: COL.amber, align: 'right', outline: false });
    }
    if (mission && h.replay) txt(ctx, 'REPLAY', x + pw - px(12), y + px(24), { font: F(10, 'bold'), color: COL.pink, align: 'right', outline: false });
    if (hint) { txt(ctx, hint, x + px(16), ty - px(2), { font: F(11), color: COL.muted, outline: false, maxW: pw - px(32) }); ty += px(16); }
    if (hasTimer) {
      ty += timerGap;
      var rem = Math.max(0, timer.remaining), tot = Math.max(1, timer.total), k = rem / tot, urgent = rem < 10;
      var bw = pw - px(32), by = ty - px(4);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, x + px(16), by, bw, px(6), px(3)); ctx.fill();
      ctx.fillStyle = urgent ? (Math.floor(ui.t * 6) % 2 ? COL.red : '#ff8a80') : COL.cyan; rr(ctx, x + px(16), by, bw * k, px(6), px(3)); ctx.fill();
      txt(ctx, U.fmtTime(Math.ceil(rem)), x + pw - px(12), by - px(6), { font: F(16, 'bold'), color: urgent ? COL.red : COL.ink, align: 'right', outline: false });
      var tlabel = timer.label ? String(timer.label).toUpperCase() : mission && Ms.state && Ms.state.active === 'm02_read' ? 'CODE EXPIRES IN' : 'TIME LEFT';   // QA-B-NP-01
      txt(ctx, tlabel, x + px(16), by - px(6), { font: F(9, 'bold'), color: COL.muted, outline: false });
    }
    return y + ph + px(8);
  }
  // the STOPPED hold bar (stop_vehicle, HOA patrol) under the objective panel
  function drawHoldBar(ctx, y) {
    var Ms = GTP.Missions, h = Ms && Ms.hud ? Ms.hud() : null, hb = h && h.holdBar;
    if (!hb && GTP.Strands && GTP.Strands.hud) { try { var sh = GTP.Strands.hud(); hb = sh && sh.holdBar; } catch (e) { hb = null; } }
    if (!hb) return y;
    var bw = px(220), x = (W - bw) / 2;
    panel(ctx, x, y, bw, px(22), px(6), COL.panelSoft, 'rgba(255,255,255,0.14)');
    ctx.fillStyle = COL.lime; rr(ctx, x + px(4), y + px(4), (bw - px(8)) * clamp01(hb.k || 0), px(14), px(4)); ctx.fill();
    txt(ctx, hb.text || 'STOPPED', x + bw / 2, y + px(16), { font: F(10, 'bold'), color: '#0b1020', align: 'center', outline: false });
    return y + px(28);
  }
  // tutorial hints (GTP.Hints): a line and the active device's key glyphs under the objective panel
  function hintGlyphs(id, keys) {
    var X = expansion(), list = X.hints || [], d = device();
    if ((id === 'h_taxi' || id === 'h_patrol') && d !== 'keyboard') return [glyph('action')];   // the content names Y / Enter, which exit the car
    for (var i = 0; i < list.length; i++) if (list[i].id === id && list[i].glyphs) { var g = list[i].glyphs[d] || list[i].glyphs.keyboard; if (g) return g; }
    return keys || [];
  }
  // hint sentences name keyboard keys; on a pad or touch the key words become that device's glyphs (QA-B-HUD-02)
  var KEYWORD_ACTION = { 'E': 'action', 'F': 'enter', 'R': 'reload', 'Q': 'cover', 'M': 'map', 'N': 'radio', 'H': 'horn', 'V': 'cameraMode', 'Tab': 'lockOn', 'Space': 'jump', 'Shift': 'run', 'Enter': 'confirm', 'Esc': 'pause', 'Ctrl': 'shoot', 'right mouse button': 'aim', 'left mouse button': 'shoot' };
  function deviceText(t) {
    if (device() === 'keyboard') return t;
    return t.replace(/\b(Press|press|Hold|hold|Tap|tap|with|With)( the)? (right mouse button|left mouse button|E|F|R|Q|M|N|H|V|Tab|Space|Shift|Enter|Esc|Ctrl)\b/g, function (all, verb, the, key) { return verb + ' ' + glyph(KEYWORD_ACTION[key]); });
  }
  function drawHint(ctx, y) {
    var Hs = GTP.Hints, h = Hs && Hs.hud ? Hs.hud() : null, g = game();
    if (!h || !g || g.state !== 'playing') return y;
    var k = h.k || 0, a = k < 0.06 ? k / 0.06 : k > 0.92 ? (1 - k) / 0.08 : 1;
    var font = F(12, '', FONT_TEXT), maxW = Math.min(px(560), W - safe.l - safe.r - px(20));
    var htext = deviceText(String(h.text || '').replace(/\s*\(or Q\)/g, ''));   // v0.3: Q is cover now, aim is the right mouse button / LT
    var lines = wrap(ctx, htext, font, maxW - px(60)), keys = hintGlyphs(h.id, h.keys).filter(function (k) { return !(h.id === 'h_aim' && k === 'Q'); });
    var kw = 0; for (var i = 0; i < keys.length; i++) kw += measure(ctx, keys[i], F(10, 'bold')) + px(18);
    var pw = Math.max(px(220), Math.min(maxW, Math.max(kw + px(60), measure(ctx, lines[0] || '', font) + px(60)))), ph = px(16) + lines.length * px(16) + (keys.length ? px(22) : 0);
    var x = (W - pw) / 2;
    ctx.save(); ctx.globalAlpha = a;
    panel(ctx, x, y, pw, ph, px(8), 'rgba(10,12,24,0.88)', 'rgba(255,190,60,0.5)');
    ctx.fillStyle = COL.amber; ctx.beginPath(); ctx.arc(x + px(20), y + px(18), px(7), 0, Math.PI * 2); ctx.fill();
    txt(ctx, 'i', x + px(20), y + px(22), { font: F(10, '900', FONT_DISPLAY), color: '#0b1020', align: 'center', outline: false });
    var ty = y + px(22);
    for (i = 0; i < lines.length; i++) { txt(ctx, lines[i], x + px(38), ty, { font: font, color: COL.ink, outline: false, maxW: pw - px(50) }); ty += px(16); }
    if (keys.length) { var kx = x + px(38); for (i = 0; i < keys.length; i++) kx += keyPill(ctx, keys[i], kx, ty - px(8), px(16)) + px(6); }
    ctx.restore();
    return y + ph + px(8);
  }
  // the race HUD: position, lap, checkpoints, the clock
  function drawRace(ctx, y) {
    var St = GTP.Strands, h = null; if (!St || !St.hud) return y;
    try { h = St.hud(); } catch (e) { h = null; }
    var r = h && h.race; if (!r || !r.active) return y;
    var pw = Math.min(px(420), W - safe.l - safe.r), x = (W - pw) / 2, ph = px(54);
    panel(ctx, x, y, pw, ph, px(10), COL.panelSoft, 'rgba(255,255,255,0.2)');
    txt(ctx, (r.name || 'RACE').toUpperCase(), x + px(14), y + px(18), { font: F(10, 'bold'), color: COL.muted, outline: false, maxW: pw * 0.5 });
    txt(ctx, U.fmtTime(r.time || 0), x + pw - px(14), y + px(18), { font: F(12, 'bold'), color: COL.ink, align: 'right', outline: false });
    var pos = r.countdown > 0 ? '-' : 'P' + r.position, col = r.position === 1 ? COL.lime : r.position === 2 ? COL.amber : COL.ink;
    txt(ctx, pos, x + px(14), y + px(46), { font: F(26, '900', FONT_DISPLAY), color: col, outline: false });
    txt(ctx, '/ ' + r.racers, x + px(14) + measure(ctx, pos, F(26, '900', FONT_DISPLAY)) + px(6), y + px(46), { font: F(12, 'bold'), color: COL.muted, outline: false });
    txt(ctx, 'LAP ' + r.lap + ' / ' + r.laps, x + pw * 0.45, y + px(44), { font: F(14, 'bold'), color: COL.ink, align: 'center', outline: false });
    txt(ctx, 'CHECKPOINT ' + r.checkpoint + ' / ' + r.total, x + pw - px(14), y + px(44), { font: F(12, 'bold'), color: COL.cyan, align: 'right', outline: false });
    return y + ph + px(8);
  }
  // the stunt slow-motion overlay: thin cinematic bars and the airtime while the clock runs slow
  function updateStunt(dt) {
    var g = game(), St = GTP.Strands, air = null;
    if (St && St.hud) { try { var h = St.hud(); air = h && h.stunt; } catch (e) { air = null; } }
    var want = !!(air && g && g.timeScale < 1);
    ui.stunt.k = U.damp(ui.stunt.k, want ? 1 : 0, 10, dt);
    ui.stunt.air = air;
  }
  function drawStunt(ctx) {
    var k = ui.stunt.k; if (k < 0.02) return;
    var bar = Math.round(H * 0.07 * k);
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    var air = ui.stunt.air, name = 'STUNT';
    if (air && GTP.Strands && GTP.Strands.stunts && GTP.Strands.stunts.ramp) { try { var r = GTP.Strands.stunts.ramp(air.ramp); if (r && r.name) name = r.name.toUpperCase(); } catch (e) { /* optional */ } }
    txt(ctx, name, W / 2, H - bar - px(16), { font: F(22, '900', FONT_DISPLAY), color: COL.pink, align: 'center', alpha: k, lw: px(5) });
    if (air) txt(ctx, 'AIRTIME ' + (air.airT || 0).toFixed(2) + ' s', W / 2, H - bar - px(40), { font: F(13, 'bold'), color: COL.ink, align: 'center', alpha: k });
  }
  function drawMemoFloat(ctx) {
    var m = ui.memoFloat; if (!m) return;
    var k = m.t / 3.2, a = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
    var y = ui.hudTop + px(30) + (ui.touch.visible ? px(40) : 0);
    ctx.save(); ctx.globalAlpha = a;
    var font = F(13, 'bold'), s = 'MEMOS ' + m.n + ' / ' + m.total, w = measure(ctx, s, font) + px(44);
    panel(ctx, (W - w) / 2, y, w, px(28), px(14), 'rgba(10,12,24,0.88)', 'rgba(255,63,164,0.5)');
    ctx.fillStyle = COL.cream; rr(ctx, (W - w) / 2 + px(10), y + px(8), px(18), px(12), 2); ctx.fill();
    ctx.strokeStyle = '#c94040'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo((W - w) / 2 + px(10), y + px(8)); ctx.lineTo((W - w) / 2 + px(19), y + px(15)); ctx.lineTo((W - w) / 2 + px(28), y + px(8)); ctx.stroke();
    txt(ctx, s, (W - w) / 2 + px(34), y + px(19), { font: font, color: COL.ink, outline: false });
    ctx.restore();
  }
  // the objective arrow: mission target, else the strand's, else the waypoint (white)
  function arrowTarget() {
    var Ms = GTP.Missions, St = GTP.Strands, t = null;
    try { t = Ms && Ms.objectiveTarget ? Ms.objectiveTarget() : null; } catch (e) { t = null; }
    if (t) return { t: t, col: COL.amber };
    try { t = St && St.objectiveTarget ? St.objectiveTarget() : null; } catch (e) { t = null; }
    if (t) return { t: t, col: COL.amber };
    var wp = waypoint(), p = player();
    if (wp && p) return { t: { x: wp.x, y: GTP.World && GTP.World.heightAt ? GTP.World.heightAt(wp.x, wp.z, 0) : 0, z: wp.z, dist: U.dist2d(p.x, p.z, wp.x, wp.z), text: 'Waypoint' }, col: COL.white };
    var G = ui.gps;   // the story GPS: a new player always has an arrow to the next mission
    if (G && p && G.dist > 12) return { t: { x: G.x, y: groundY(G.x, G.z), z: G.z, dist: G.dist, text: G.label }, col: gpsColor(G.kind) };
    return null;
  }
  function drawObjectiveArrow(ctx) {
    var Rd = GTP.Render, p = player(); if (!Rd || !p || indoors()) return;
    var at = arrowTarget(); if (!at) return;
    var t = at.t, col = at.col;
    var s = Rd.worldToScreen(t.x, (t.y || 0) + 2.6, t.z);
    if (ui.gpsLabelDrawn && ui.gps && t.x === ui.gps.x && t.z === ui.gps.z && s.visible && s.depth < 1) return;   // the floating label already marks it
    var distTxt = Math.round(t.dist) + ' m';
    var inside = s.visible && s.depth < 1 && s.sx > px(30) && s.sx < W - px(30) && s.sy > px(80) && s.sy < H - px(60);
    if (inside) {
      var bob = Math.sin(ui.t * 4) * px(4);
      ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.sx, s.sy + bob); ctx.lineTo(s.sx - px(9), s.sy - px(14) + bob); ctx.lineTo(s.sx + px(9), s.sy - px(14) + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
      txt(ctx, distTxt, s.sx, s.sy - px(18) + bob, { font: F(11, 'bold'), color: col, align: 'center' });
      return;
    }
    var yaw = Rd.rig ? Rd.rig.yaw : 0, dx = t.x - p.x, dz = t.z - p.z;
    var cs = Math.cos(yaw), sn = Math.sin(yaw), lx = dx * cs - dz * sn, ly = dx * sn + dz * cs;   // same rotation as the minimap (up = camera forward)
    var ang = Math.atan2(ly, lx), cx = W / 2, cy = H / 2;
    var ex = cx + Math.cos(ang) * (W / 2 - px(42)), ey = cy + Math.sin(ang) * (H / 2 - px(42));
    ex = U.clamp(ex, px(42), W - px(42)); ey = U.clamp(ey, px(110), H - px(70));
    var mm = minimapRect(), top = mm.top ? mm.y : mm.y - px(100), bot = mm.top ? (ui.chipBottom || mm.y + mm.s) + px(56) : H;   // keep clear of the minimap, its chip and the GPS chip (QA-B-HUD-03)
    if (ex > mm.x - px(36) && ex < mm.x + mm.s + px(36) && ey > top - px(30) && ey < bot) { if (mm.top) ey = bot + px(10); else { ex = Math.min(ex, mm.x - px(40)); ey = Math.min(ey, H - px(70)); } }
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px(16), 0); ctx.lineTo(-px(8), -px(11)); ctx.lineTo(-px(3), 0); ctx.lineTo(-px(8), px(11)); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    txt(ctx, distTxt, ex, ey + px(26), { font: F(11, 'bold'), color: col, align: 'center' });
  }
  // the Fact Checker's scope: a black vignette with a round window, hairline cross, the zoom and the range readouts,
  // a faint lock pill on the ped under the cross
  function drawScope(ctx, scope, s, hm, rel) {
    var cx = W / 2, cy = H / 2, rad = Math.min(W, H) * 0.38;
    ctx.fillStyle = 'rgba(0,0,0,0.97)';
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, rad, 0, Math.PI * 2, true); ctx.fill();
    var vg = ctx.createRadialGradient(cx, cy, rad * 0.78, cx, cy, rad); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy); ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad); ctx.stroke();
    // mil ticks along the cross
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    for (var i = 1; i <= 4; i++) { var o = rad * 0.18 * i, tl = i % 2 ? px(4) : px(7); ctx.beginPath(); ctx.moveTo(cx + o, cy - tl); ctx.lineTo(cx + o, cy + tl); ctx.moveTo(cx - o, cy - tl); ctx.lineTo(cx - o, cy + tl); ctx.moveTo(cx - tl, cy + o); ctx.lineTo(cx + tl, cy + o); ctx.moveTo(cx - tl, cy - o); ctx.lineTo(cx + tl, cy - o); ctx.stroke(); }
    var hot = hm && hm.age < 0.15, kill = hm && hm.kill && hm.age < 0.4;
    ctx.strokeStyle = kill ? COL.pink : hot ? '#ffffff' : 'rgba(255,63,164,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, px(6) + (hot ? px(3) : 0), 0, Math.PI * 2); ctx.stroke();
    if (kill) { var kx = px(14); ctx.lineWidth = px(3); ctx.strokeStyle = COL.pink; ctx.beginPath(); ctx.moveTo(cx - kx, cy - kx); ctx.lineTo(cx + kx, cy + kx); ctx.moveTo(cx + kx, cy - kx); ctx.lineTo(cx - kx, cy + kx); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = px(3); ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
    if (rel) { ctx.strokeStyle = COL.amber; ctx.lineWidth = px(5); ctx.beginPath(); ctx.arc(cx, cy, rad - px(6), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(rel.k)); ctx.stroke(); txt(ctx, 'RELOADING', cx, cy + rad * 0.6, { font: F(12, 'bold'), color: COL.amber, align: 'center' }); }
    txt(ctx, Math.round(scope.range || 0) + ' m', cx - rad + px(10), cy + rad - px(10), { font: F(16, 'bold'), color: COL.ink });
    txt(ctx, 'RANGE', cx - rad + px(10), cy + rad - px(30), { font: F(9, 'bold'), color: COL.muted });
    txt(ctx, (scope.zoom || 2) + 'x', cx + rad - px(10), cy + rad - px(10), { font: F(16, 'bold'), color: COL.ink, align: 'right' });
    txt(ctx, 'ZOOM · ' + glyph('weaponNext') + ' toggles', cx + rad - px(10), cy + rad - px(30), { font: F(9, 'bold'), color: COL.muted, align: 'right' });
    txt(ctx, 'THE FACT CHECKER', cx, cy - rad + px(22), { font: F(10, 'bold'), color: COL.muted, align: 'center' });
    var tg = scope.target;
    if (tg && GTP.Render) {
      var ts = GTP.Render.worldToScreen(tg.x, tg.y + (tg.height || 1.8) * ((tg.look && tg.look.scale) || 1) + 0.4, tg.z);
      if (ts.visible && U.dist2d(ts.sx, ts.sy, cx, cy) < rad - px(20)) {
        var label = targetLabel(tg);
        var font = F(10, 'bold'), w = measure(ctx, label, font) + px(14);
        panel(ctx, ts.sx - w / 2, ts.sy - px(18), w, px(16), px(4), 'rgba(255,63,164,0.25)', 'rgba(255,63,164,0.6)');
        txt(ctx, label, ts.sx, ts.sy - px(6), { font: font, color: COL.ink, align: 'center', outline: false });
      }
    }
  }
  function drawHurt(ctx) {
    var CB = GTP.Combat, k = CB ? (CB.hurtFlash || 0) : 0; if (k <= 0) return;
    var p = player(); if (p && p.hp / (p.maxHp || 100) < 0.25) k = Math.max(k, 0.35 + 0.15 * Math.sin(ui.t * 6));
    var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(255,40,30,0)'); g.addColorStop(1, 'rgba(255,40,30,' + (0.65 * Math.min(1, k)).toFixed(3) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function drawFxTexts(ctx) {
    var Rd = GTP.Render, T = Rd && Rd.fx ? Rd.fx.texts : null; if (!T || !T.length) return;
    for (var i = 0; i < T.length; i++) {
      var o = T[i], k = o.t / (o.life || 1.2), s = Rd.worldToScreen(o.x, o.y + k * 1.1, o.z);
      if (!s.visible || s.depth > 1) continue;
      s = { sx: s.sx, sy: Math.max(s.sy, safe.t + px(84)) };   // never cut off at the top edge (QA-B-HUD-12)
      var a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1, size = o.size || 16;
      txt(ctx, o.text, s.sx, s.sy, { font: F(size * (1 + Math.min(k, 0.15)), 'bold', FONT_DISPLAY), color: o.color || COL.pink, align: 'center', alpha: a, lw: px(4) });
    }
  }
  function occluded(from, x, y, z) {
    var Wd = GTP.World; if (!Wd || !Wd.raycastBuildings) return false;
    var dx = x - from.x, dy = y - from.y, dz = z - from.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz); if (len < 1) return false;
    try { var h = Wd.raycastBuildings(from.x, from.y, from.z, dx / len, dy / len, dz / len, len - 0.5); return !!(h && h.t != null && h.t < len - 0.6); } catch (e) { return false; }
  }
  function drawBarks(ctx) {
    var E = GTP.Entities, Rd = GTP.Render, cam = Rd && Rd.camera; if (!E || !cam) return;
    var list = E.list, cands = [], i;
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      if ((e.kind !== 'ped' && e.kind !== 'player') || !e.line || e.lineTime <= 0 || !e.alive || e.inVehicle || e.removed || (e.mesh && e.mesh.visible === false)) continue;
      var d = U.dist2d(e.x, e.z, cam.position.x, cam.position.z); if (d > 40) continue;
      cands.push({ e: e, d: d });
    }
    if (!cands.length) return;
    cands.sort(function (a, b) { return a.d - b.d; });
    var n = Math.min(cands.length, 8), font = F(12, 'bold', FONT_TEXT), bar = letterboxBar();
    for (i = 0; i < n; i++) {
      var p = cands[i].e, sc = (p.look && p.look.scale) || 1, s = Rd.worldToScreen(p.x, p.y + (p.height || 1.8) * sc + 0.45, p.z);
      if (!s.visible || s.depth > 1 || s.sx < px(20) || s.sx > W - px(20) || s.sy < bar + px(40) || s.sy > H - bar - px(20)) continue;   // off-screen peds keep their lines to themselves
      if (p.kind !== 'player' && occluded(cam.position, p.x, p.y + (p.height || 1.8) * sc, p.z)) continue;   // nobody talks through a facade (QA-A-ENT-06)
      var fade = p.lineTime < 0.4 ? p.lineTime / 0.4 : 1, scale = U.clamp(1.25 - cands[i].d / 60, 0.7, 1);
      var tw = Math.min(measure(ctx, p.line, font) * scale, px(300)), bw = tw + px(16), bh = px(22) * scale;
      var bx = U.clamp(s.sx - bw / 2, px(4), W - bw - px(4)), by = s.sy - bh - px(8);
      ctx.globalAlpha = fade;
      panel(ctx, bx, by, bw, bh, px(8), 'rgba(12,14,22,0.85)', p._barkColor || 'rgba(255,255,255,0.35)', 1.5);
      ctx.fillStyle = 'rgba(12,14,22,0.85)'; ctx.beginPath(); ctx.moveTo(s.sx - px(5), by + bh); ctx.lineTo(s.sx + px(5), by + bh); ctx.lineTo(s.sx, by + bh + px(6)); ctx.closePath(); ctx.fill();
      ctx.font = font; ctx.save(); ctx.translate(bx + bw / 2, by + bh / 2); ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.line, 0, 1, px(300) / scale); ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
  // the spinning folding-table autosave icon bottom-right for a second (never a toast)
  function drawSavedIcon(ctx) {
    var sv = ui.saved; if (!(sv.t > 0)) return;
    var k = sv.t / 1.2, a = k > 0.8 ? (1 - k) / 0.2 : k < 0.1 ? k / 0.1 : 1;
    var m = minimapRect(), x = m.top ? W - safe.r - px(26) : m.x - px(34), y = m.top ? H - safe.b - px(26) : m.y + m.s - px(22);
    if (ui.touch.visible && !portrait) x = W / 2 + px(120);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(1 + 0.25 * Math.abs(Math.sin(ui.t * 8)), 1);
    drawTableT(ctx, -px(9), px(9), px(18), COL.gold);
    ctx.restore();
    txt(ctx, 'SAVED', x, y + px(22), { font: F(8, 'bold'), color: COL.gold, align: 'center', alpha: a });
  }

  // --------------------------------------------------------- radio ticker ----
  function tickerNext(st) {
    var R = GTP.Content && GTP.Content.radio, g = game();
    var tk = ui.ticker, n = tk.n++;
    if (!st) return null;
    var ads = st.ads || [], dj = st.dj || [], news = (R && R.ticker) || [];
    // the Nap Dynasty ad at minute 20 of every game hour, on every station
    var clock = g ? g.time.clock : 0, hour = Math.floor(clock), minute = Math.floor((clock % 1) * 60);
    var napMinute = (R && R.napMinute) || 20;
    if (minute >= napMinute && minute < napMinute + 2 && tk.lastNapHour !== hour + (g ? g.time.day * 100 : 0) && ads.length) {
      tk.lastNapHour = hour + (g ? g.time.day * 100 : 0);
      var idx = st.napAd != null ? st.napAd : 0;
      return { text: ads[idx] || ads[0], tag: 'SPONSOR', color: '#5aa8ff', nap: true };
    }
    // v0.3 radio: what is on air (Audio.radio.nowPlaying() or station.nowPlaying: a string or {kind, title, artist,
    // caller, text}), the top-of-hour news bulletin (station.bulletins / station.news), call-in lines (station.callers)
    var np = null, A = GTP.Audio;
    try { np = A && A.radio && typeof A.radio.nowPlaying === 'function' ? A.radio.nowPlaying() : null; } catch (e) { np = null; }
    if (np && typeof np !== 'object') np = null;   // GTP.Audio's nowPlaying() is the "Station - tagline" string: the chip already says it
    if (!np && st.nowPlaying) np = typeof st.nowPlaying === 'function' ? st.nowPlaying() : st.nowPlaying;
    if (!np && R && typeof R.nowPlaying === 'function' && st.songs && st.songs.length) { try { np = R.nowPlaying(st.id); } catch (e) { np = null; } if (np) np = { kind: 'song', id: np.song, title: np.title, artist: np.artist }; }   // the radio track: Content.radio.nowPlaying(id)
    if (np) {
      var npo = typeof np === 'string' ? { text: np } : np, key = sidKey(st) + '|' + (npo.id || npo.title || npo.text || '');
      if (key !== tk.lastNp) { tk.lastNp = key; return radioLine(npo, st); }
    }
    var bul = st.bulletins || st.newsBulletins || (Array.isArray(st.news) ? st.news : null);
    if (bul && bul.length && minute < 3 && tk.lastBulletin !== hour + (g ? g.time.day * 100 : 0)) {
      tk.lastBulletin = hour + (g ? g.time.day * 100 : 0);
      var b0 = bul[(hour + (g ? g.time.day : 0)) % bul.length];
      return { text: typeof b0 === 'string' ? b0 : (b0.text || b0.headline || ''), tag: 'NEWS ' + (hour < 10 ? '0' : '') + hour + ':00', color: COL.red };
    }
    var callers = st.callers || st.calls || st.callIns;
    if (callers && callers.length && n % 7 === 3) { var c0 = callers[Math.floor(n / 7) % callers.length]; return radioLine(typeof c0 === 'string' ? { kind: 'caller', text: c0 } : Object.assign({ kind: 'caller' }, c0), st); }
    var slot = n % 7;
    if ((slot === 2 || slot === 5) && dj.length) return { text: dj[Math.floor(n / 7 + slot) % dj.length], tag: 'DJ', color: stationColor(st) };
    if (slot === 6 && news.length) return { text: news[Math.floor(n / 7) % news.length], tag: 'NEWS', color: COL.red };
    if (ads.length) return { text: ads[(Math.floor(n / 7) * 3 + slot) % ads.length], tag: 'AD', color: COL.amber };
    return null;
  }
  function sidKey(st) { return st ? String(st.id || st.name || '') : ''; }
  function radioLine(o, st) {
    var kind = String(o.kind || o.type || '').toLowerCase(), text = o.text || o.line || '';
    if (kind === 'song' || kind === 'music' || (!text && o.title)) return { text: (o.title || '') + (o.artist ? '  ·  ' + o.artist : ''), tag: 'NOW PLAYING', color: stationColor(st) };
    if (kind === 'news' || kind === 'bulletin') return { text: text || o.headline || o.title, tag: 'NEWS', color: COL.red };
    if (kind === 'caller' || kind === 'call') return { text: (o.caller || o.name ? (o.caller || o.name) + ' on the line: ' : 'Caller: ') + text, tag: 'CALLER', color: COL.lime };
    if (kind === 'show' || kind === 'host') return { text: (o.title ? o.title + '  ·  ' : '') + text, tag: 'ON AIR', color: stationColor(st) };
    return { text: text || o.title || '', tag: 'ON AIR', color: stationColor(st) };
  }
  function updateTicker(dt) {
    var tk = ui.ticker, p = player(), st = currentStation();
    if (tk.forceT > 0) tk.forceT -= dt;
    var on = !!(p && p.inVehicle) || tk.forceT > 0;
    if (!on) { tk.cur = null; tk.x = 0; return; }
    // a station switch drops the old station's line (a forced BREAKING line and the shared Nap Dynasty ad stay)
    var sid = st ? st.id : null;
    if (tk.stationId !== sid) { if (tk.cur && !tk.cur.nap && tk.forceT <= 0) tk.cur = null; tk.stationId = sid; }
    if (!tk.cur) {
      tk.cur = tk.queue.length ? tk.queue.shift() : tickerNext(st);
      if (!tk.cur) return;
      tk.x = 0; tk.lineT = 0;
    }
    tk.lineT += dt; tk.x += dt * px(70);
    if (tk.cur.done) tk.cur = null;
  }
  function drawTicker(ctx, y) {
    var tk = ui.ticker, p = player(), st = currentStation(); if (!tk.cur || !p) return;
    if (p.inVehicle && vehCat(p.inVehicle) === 'chute') return;   // no radio under a canopy (the vehicles track mutes it too)
    var m = minimapRect();
    var x = safe.l + (ui.touch.visible ? px(210) : 0), right = m.top ? W - safe.r - (ui.touch.visible ? px(230) : 0) : m.x - px(12), w = right - x;
    if (portrait) { x = safe.l; w = W - safe.l - safe.r; }
    if (w < px(160)) return;
    var h = px(26);
    panel(ctx, x, y, w, h, px(6), 'rgba(6,7,13,0.78)', 'rgba(255,255,255,0.12)');
    var name = p.inVehicle && st ? String(st.name).replace(/\s*".*"$/, '') : 'TICKER', chipW = measure(ctx, name, F(10, 'bold')) + px(18);
    ctx.fillStyle = stationColor(st); rr(ctx, x, y, chipW, h, px(6)); ctx.fill();
    txt(ctx, name, x + chipW / 2, y + h / 2 + px(4), { font: F(10, 'bold'), color: '#0b1020', align: 'center', outline: false, maxW: chipW - px(8) });
    var tagW = measure(ctx, tk.cur.tag, F(10, 'bold')) + px(12), tx0 = x + chipW + px(6);
    ctx.fillStyle = tk.cur.color || COL.amber; rr(ctx, tx0, y + px(5), tagW, h - px(10), px(4)); ctx.fill();
    txt(ctx, tk.cur.tag, tx0 + tagW / 2, y + h / 2 + px(4), { font: F(10, 'bold'), color: '#0b1020', align: 'center', outline: false });
    var sx = tx0 + tagW + px(10), avail = x + w - sx - px(8), font = F(13, 'bold', FONT_TEXT), tw = measure(ctx, tk.cur.text, font);
    ctx.save(); ctx.beginPath(); ctx.rect(sx, y, avail, h); ctx.clip();
    var scroll = tw > avail ? Math.min(tk.x, tw - avail + px(20)) : 0;
    txt(ctx, tk.cur.text, sx - scroll, y + h / 2 + px(5), { font: font, color: tk.cur.nap ? '#bfe3ff' : COL.ink, outline: false });
    ctx.restore();
    if (tk.lineT > (tw > avail ? (tw - avail) / px(70) + 3.5 : 4.5)) tk.cur.done = true;
  }

  // ------------------------------------------------------------ dialogue ----
  var TYPE_CPS = 48;
  function showDialogue(line, next) {
    ui.dlgToken++;
    ui.dialogue = { line: line, next: next || null, t: 0, chars: 0, done: false, token: ui.dlgToken };
    if (line && line.who === 'player' && line.text) logCaption(line.text);
  }
  function hideDialogue() { ui.dialogue = null; }
  function logCaption(text) { ui.captionLog.push(String(text)); if (ui.captionLog.length > 40) ui.captionLog.shift(); }
  // Enter / E / a tap skips to the next line; a line also auto-advances once it has been typed and read
  function advanceDialogue() {
    var d = ui.dialogue; if (!d) return false;
    var tok = ui.dlgToken, next = d.next;
    sfx('ui', 0.25);
    if (next) { try { next(); } catch (e) { U.reportError(e, 'ui.dialogue.next'); } }
    else if (GTP.Missions && GTP.Missions.advanceDialogue) GTP.Missions.advanceDialogue();
    if (ui.dlgToken === tok) ui.dialogue = null;   // nobody queued another line
    return true;
  }
  function updateDialogue(dt) {
    var d = ui.dialogue; if (!d) return;
    d.t += dt;
    var len = String(d.line.text || '').length;
    if (d.chars < len) { d.chars = Math.min(len, d.chars + dt * TYPE_CPS); if (d.chars >= len) d.done = true; }
    var K = GTP.C.MISSIONS || {}, lineSeconds = K.lineSeconds || 2.5;
    var autoT = Math.max(lineSeconds, len / TYPE_CPS + Math.max(1.6, len * 0.045));
    if (d.done && d.t >= autoT) advanceDialogue();
  }
  function drawDialogue(ctx) {
    var d = ui.dialogue; if (!d) return;
    var line = d.line, who = line.who || 'everyone', cm = cast(who), color = line.color || (cm && cm.color) || COL.ink, name = line.name || castName(who);
    var sub = ui.settings.subtitles === 'large' ? 1.25 : 1;
    var ps = px((portrait ? 76 : 96) * sub), bw = Math.min(px(780 * sub), W - safe.l - safe.r), bh = ps + px(24);
    var mm = minimapRect(), st0 = game().state;
    if (!mm.top && st0 === 'playing') bw = Math.min(bw, 2 * (mm.x - px(12) - W / 2));   // clear of the bottom-right minimap (QA-B-FE-13)
    // the box grows to the whole line: no wrapped line is scrolled away (QA-B-TXT-01)
    var fontD = F((portrait ? 14 : 17) * sub, '', FONT_TEXT), lineHD = px((portrait ? 18 : 22) * sub), nAll = wrap(ctx, String(line.text || ''), fontD, bw - ps - px(44)).length;
    bh = Math.max(bh, px(58 * sub) + nAll * lineHD + px(8));
    var bar = letterboxBar();
    var bx = (W - bw) / 2, by = H - safe.b - bh - px(ui.touch.visible && game().state === 'playing' ? 150 : 16) - (bar ? bar - px(4) : 0);
    var a = Math.min(1, d.t / 0.18);
    ctx.save(); ctx.globalAlpha = a;
    panel(ctx, bx, by, bw, bh, px(12), 'rgba(10,12,24,0.9)', hexA(color, 0.6), px(2));
    // portrait + name plate
    castPortrait(ctx, who, bx + px(12), by + px(12), ps);
    var tx = bx + ps + px(28), tw = bw - ps - px(44);
    var nameFont = F(13 * sub, 'bold'), nw = measure(ctx, name.toUpperCase(), nameFont) + px(18);
    ctx.fillStyle = color; rr(ctx, tx, by + px(10), nw, px(22 * sub), px(5)); ctx.fill();
    txt(ctx, name.toUpperCase(), tx + nw / 2, by + px(26 * sub), { font: nameFont, color: '#0b1020', align: 'center', outline: false });
    if (cm && cm.role && !portrait) txt(ctx, cm.role, tx + nw + px(10), by + px(26 * sub), { font: F(11 * sub), color: COL.muted, outline: false, maxW: tw - nw - px(12) });
    // typewriter text
    var shown = String(line.text || '').slice(0, Math.floor(d.chars)), font = F((portrait ? 14 : 17) * sub, '', FONT_TEXT);
    var lines = wrap(ctx, shown, font, tw), ly = by + px(54 * sub);
    var lineH = px((portrait ? 18 : 22) * sub), maxLines = Math.max(1, Math.floor((bh - px(58 * sub)) / lineH));
    if (lines.length > maxLines) lines = lines.slice(lines.length - maxLines);
    for (var i = 0; i < lines.length; i++) { txt(ctx, lines[i], tx, ly, { font: font, color: COL.ink, outline: false }); ly += lineH; }
    if (d.done && Math.floor(d.t * 2) % 2 === 0) txt(ctx, (ui.touch.visible ? 'TAP' : glyph('confirm')) + ' ▶', bx + bw - px(14), by + bh - px(10), { font: F(10, 'bold'), color: COL.muted, align: 'right', outline: false });
    ctx.restore();
  }

  // ------------------------------------------------ banner, cards, toasts ----
  function banner(title, sub, dur) { var tt = String(title || ''); ui.banner = { title: tt, sub: sub ? String(sub) : '', t: 0, dur: dur || (/^(GO|\d)$/.test(tt) ? 1.4 : 4.2) }; if (ui.card && ui.card.kind === 'passed') ui.card = null; }   // the next mission's banner replaces a lingering PASSED card
  function card(kind, title, sub) {
    ui.card = { kind: kind || 'passed', title: String(title || ''), sub: sub ? String(sub) : '', t: 0, dur: kind === 'failed' ? 4.2 : 4.8 };
    if (kind === 'failed') ui.retry.sel = 0;
  }
  function toast(text) {
    text = String(text == null ? '' : text);
    // the full-screen cards already say it
    if (text === failText('wasted', 'RATIO\'D') || text === failText('busted', 'DEPLATFORMED')) return;
    ui.toasts.push({ text: text, t: 0, dur: 3.2 }); if (ui.toasts.length > 4) ui.toasts.shift();
  }
  // QUIT drops the offer for good (QA-C1-02): the dropped lastFail is remembered here, so a later death or bust never
  // brings that card back even while Missions has no _dropRetry of its own
  function retryOffer() {
    var Ms = GTP.Missions;
    try {
      if (!(Ms && Ms.canRetry && Ms.canRetry())) return false;
      return !(ui.retry.dropped && Ms.lastFail && Ms.lastFail() === ui.retry.dropped);
    } catch (e) { return false; }
  }
  function updateCards(dt) {
    if (ui.banner) { ui.banner.t += dt; if (ui.banner.t > ui.banner.dur) ui.banner = null; }
    if (ui.card) {
      var c = ui.card, hold = c.kind === 'failed' && retryOffer();   // the CONTEXT STAMPED card waits for a choice while RETRY is on offer
      if (!hold || c.t < c.dur) c.t += dt;
      if (c.t > c.dur && !hold) ui.card = null;
      if (hold && c.t > c.dur) c.t = c.dur;
    }
    for (var i = ui.toasts.length - 1; i >= 0; i--) { ui.toasts[i].t += dt; if (ui.toasts[i].t > ui.toasts[i].dur) ui.toasts.splice(i, 1); }
    if (ui.memoFloat) { ui.memoFloat.t += dt; if (ui.memoFloat.t > 3.2) ui.memoFloat = null; }
    if (ui.saved.t > 0) ui.saved.t -= dt;
  }
  function drawBanner(ctx) {
    var b = ui.banner; if (!b) return;
    if (ui.card && ui.card.kind === 'failed') return;   // the CONTEXT STAMPED card owns the middle of the screen
    var k = b.t / b.dur, a = k < 0.08 ? k / 0.08 : k > 0.85 ? (1 - k) / 0.15 : 1, slide = (1 - ease(Math.min(1, b.t / 0.5))) * px(60);
    var big = b.title.length <= 2, font = F(big ? 96 : (portrait ? 26 : 36), '900', FONT_DISPLAY);
    ctx.save(); ctx.globalAlpha = a;
    if (big) {   // the 3-2-1-GO countdown: centred, huge
      txt(ctx, b.title, W / 2, H * 0.4, { font: font, color: COL.gold, align: 'center', lw: px(8), outline: 'rgba(0,0,0,0.9)' });
      if (b.sub) txt(ctx, b.sub, W / 2, H * 0.4 + px(30), { font: F(14, 'bold'), color: COL.ink, align: 'center' });
      ctx.restore(); return;
    }
    if (ui.touch.visible) {
      // phones: centred over the world, clear of the buttons
      var cy = H * 0.42, maxW2 = W - safe.l - safe.r - px(20);
      txt(ctx, b.title, W / 2 + slide, cy, { font: font, color: COL.gold, align: 'center', lw: px(6), outline: 'rgba(0,0,0,0.85)', maxW: maxW2 });
      if (b.sub) txt(ctx, b.sub, W / 2 + slide, cy + px(22), { font: F(13, 'bold'), color: COL.ink, align: 'center', maxW: maxW2 });
      ctx.restore(); return;
    }
    var m = minimapRect(), y = m.y - px(80), rx = m.x - px(16) + slide;   // clear of the district chip above the minimap
    var maxW = Math.min(px(640), W - safe.l - safe.r - m.s - px(20));
    txt(ctx, b.title, rx, y, { font: font, color: COL.gold, align: 'right', lw: px(6), outline: 'rgba(0,0,0,0.85)', maxW: maxW });
    if (b.sub) txt(ctx, b.sub, rx, y + px(22), { font: F(13, 'bold'), color: COL.ink, align: 'right', maxW: maxW });
    ctx.restore();
  }
  var RETRY_ITEMS = [{ id: 'retry', label: 'RETRY' }, { id: 'restart', label: 'RESTART MISSION' }, { id: 'quit', label: 'QUIT' }];
  function retryActivate(id) {
    var Ms = GTP.Missions; if (!Ms) return;
    sfx('ui', 0.4);
    if (id === 'retry') { if (retryOffer()) { ui.card = null; Ms.retry(); } return; }
    if (id === 'restart') { ui.card = null; if (Ms.restart) Ms.restart(); return; }
    ui.card = null; toast('Back to the marker.');
    ui.retry.dropped = Ms.lastFail ? Ms.lastFail() : null;
    if (Ms._dropRetry) Ms._dropRetry();
  }
  function drawCard(ctx) {
    var c = ui.card; if (!c) return;
    var k = c.t / c.dur, failed = c.kind === 'failed', offer = failed && retryOffer();
    var a = k < 0.1 ? k / 0.1 : (!offer && k > 0.85) ? (1 - k) / 0.15 : 1, pop = 1 + (1 - ease(Math.min(1, c.t / 0.35))) * 0.25;
    var col = failed ? COL.red : COL.gold;
    var cy = H * 0.4, bh = offer ? px(190) : px(120);   // the help line sits inside the band (QA-B-HUD-11)
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(6,7,13,0.55)'; ctx.fillRect(0, cy - px(58), W, bh);
    ctx.fillStyle = col; ctx.fillRect(0, cy - px(58), W, px(3)); ctx.fillRect(0, cy - px(58) + bh - px(3), W, px(3));
    ctx.save(); ctx.translate(W / 2, cy); ctx.scale(pop, pop);
    txt(ctx, c.title, 0, px(8), { font: F(portrait ? 30 : 44, '900', FONT_DISPLAY), color: col, align: 'center', lw: px(6), outline: 'rgba(0,0,0,0.9)', maxW: W - px(40) });
    ctx.restore();
    if (c.sub) txt(ctx, c.sub, W / 2, cy + px(40), { font: F(16, 'bold'), color: COL.ink, align: 'center', maxW: W - px(40) });
    if (offer) {
      // RETRY from the checkpoint / RESTART MISSION / QUIT (GDD_EXPANSION 6.4)
      var Ms = GTP.Missions, lf = Ms.lastFail ? Ms.lastFail() : null, bw = Math.min(px(170), (W - px(60)) / 3), gap = px(10), x0 = W / 2 - (bw * 3 + gap * 2) / 2, by = cy + px(66);
      for (var i = 0; i < RETRY_ITEMS.length; i++) {
        var it = RETRY_ITEMS[i], x = x0 + i * (bw + gap), sel = i === ui.retry.sel;
        if (hovering(x, by, bw, px(34))) { ui.retry.sel = i; sel = true; }
        panel(ctx, x, by, bw, px(34), px(8), sel ? 'rgba(255,63,164,0.25)' : 'rgba(10,12,24,0.88)', sel ? COL.pink : 'rgba(255,255,255,0.2)', sel ? 2 : 1);
        txt(ctx, it.label, x + bw / 2, by + px(22), { font: F(12, 'bold'), color: sel ? COL.ink : COL.muted, align: 'center', outline: false, maxW: bw - px(10) });
        hit(x, by, bw, px(34), retryActivate.bind(null, it.id), 'retry-' + it.id);
      }
      var tipS = lf && lf.retries ? 'Retry ' + (lf.retries + 1) + '. Free. Unlimited. Respectfully.' : 'From the last checkpoint. The timer gets 15 s back.';
      txt(ctx, tipS + '   ' + glyph('confirm') + ' choose · ' + glyph('cancel') + ' quit', W / 2, by + px(50), { font: F(10), color: COL.muted, align: 'center', maxW: W - px(40) });
    }
    ctx.restore();
  }
  function drawToasts(ctx) {
    if (!ui.toasts.length) return;
    var y = ui.shopOpen || ui.modal ? safe.t + px(52) : ui.touch.visible ? H * 0.56 : H - safe.b - px(56) - (ui.dialogue ? px(120) : 0) - (ui.ticker.cur ? px(32) : 0) - letterboxBar();
    for (var i = ui.toasts.length - 1; i >= 0; i--) {
      var t = ui.toasts[i], k = t.t / t.dur, a = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
      var font = F(13, 'bold'), tw = Math.min(measure(ctx, t.text, font), W - px(60)) + px(24);
      ctx.save(); ctx.globalAlpha = a;
      panel(ctx, (W - tw) / 2, y - px(24), tw, px(28), px(14), 'rgba(10,12,24,0.85)', 'rgba(255,255,255,0.18)');
      txt(ctx, t.text, W / 2, y - px(5), { font: font, color: COL.ink, align: 'center', outline: false, maxW: tw - px(20) });
      ctx.restore();
      y -= px(34);
    }
  }
  function drawDeathCard(ctx) {
    var CB = GTP.Combat, d = CB && CB.death, g = game(); if (!d || !g || (g.state !== 'wasted' && g.state !== 'busted')) return;
    var busted = d.kind === 'busted', t = d.t || 0, k = Math.min(1, t / 0.6);
    ctx.fillStyle = 'rgba(4,5,10,' + (0.72 * k).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
    if (busted) { ctx.fillStyle = 'rgba(40,70,160,' + (0.18 * k) + ')'; ctx.fillRect(0, 0, W, H); }
    else { ctx.fillStyle = 'rgba(160,20,60,' + (0.18 * k) + ')'; ctx.fillRect(0, 0, W, H); }
    var text = d.text || failText(busted ? 'busted' : 'wasted', busted ? 'DEPLATFORMED' : 'RATIO\'D');
    var scale = 1 + (1 - ease(Math.min(1, t / 0.45))) * 0.6, cy = H * 0.42;
    ctx.save(); ctx.translate(W / 2, cy); ctx.scale(scale, scale);
    txt(ctx, text, 0, px(16), { font: F(portrait ? 40 : 64, '900', FONT_DISPLAY), color: busted ? '#8fb6ff' : COL.pink, align: 'center', lw: px(8), outline: 'rgba(0,0,0,0.9)', maxW: W - px(30) });
    ctx.restore();
    var fine = d.fine != null ? d.fine : GTP.AI && GTP.AI.bustFine ? GTP.AI.bustFine(d.level != null ? d.level : (ui.wanted.last || 1), (player() || {}).money | 0) : C.ECONOMY.bustedFine, sub = busted ? 'Rate your arrest, one to ten. Fine: ' + U.fmtMoney(fine) + '.' : 'Discharged with a bandage that has a coupon code. Cash -' + Math.round(C.ECONOMY.deathCashLoss * 100) + '%.';
    var lines = wrap(ctx, sub, F(15, 'bold', FONT_TEXT), W - px(60));
    for (var i = 0; i < lines.length; i++) txt(ctx, lines[i], W / 2, cy + px(44) + i * px(20), { font: F(15, 'bold', FONT_TEXT), color: COL.ink, align: 'center', alpha: k });
    var Ms = GTP.Missions, lf = Ms && Ms.lastFail ? Ms.lastFail() : null;
    if (t > 1.2) txt(ctx, (busted ? 'Respawning at the precinct' : 'Respawning at the hospital') + (lf && lf.snapshot ? '. Then: RETRY from the checkpoint.' : ''), W / 2, cy + px(48) + lines.length * px(20) + px(10), { font: F(11), color: COL.muted, align: 'center', alpha: Math.min(1, (t - 1.2) / 0.5) });
  }

  // ------------------------------------------------------------ loading ----
  function loadingTips() {
    var X = expansion(), tips = X.loadingTips || [];
    if (!ui.loading.tips.length && tips.length) { var r = GTP.rng && GTP.rng.fork ? GTP.rng.fork(0x71B5) : urng; ui.loading.tips = r && r.shuffle ? r.shuffle(tips.slice()) : tips.slice(); }
    return ui.loading.tips;
  }
  function stageLabel(L) {
    var X = expansion(), st = X.loadingStages || [];
    for (var i = 0; i < st.length; i++) if (st[i].id === L.stage) return st[i].label;
    return L.label || '';
  }
  function updateLoading(dt) {
    var g = game(), L = g && g.loading; if (!L || !L.active) { ui.loading.seenActive = false; return; }
    var ld = ui.loading;
    if (!ld.seenActive) { ld.seenActive = true; ld.t = 0; ld.tipT = 0; ld.lastFrac = 0; loadingTips(); ld.tipI = (ld.tipI + 1) % Math.max(1, ld.tips.length); }
    ld.t += dt; ld.tipT += dt;
    if (ld.tipT >= 4 && ld.tips.length) { ld.tipT = 0; ld.tipI = (ld.tipI + 1) % ld.tips.length; }
    ld.lastFrac = U.damp(ld.lastFrac, Math.max(ld.lastFrac, L.fraction || 0), 12, dt);
  }
  function drawLoading(ctx) {
    var g = game(), L = g && g.loading; if (!L) return;
    var ld = ui.loading;
    ctx.fillStyle = '#06070d'; ctx.fillRect(0, 0, W, H);
    var vg = ctx.createRadialGradient(W * 0.5, H * 1.1, H * 0.2, W * 0.5, H * 1.1, H * 1.2); vg.addColorStop(0, 'rgba(18,23,53,0.9)'); vg.addColorStop(1, 'rgba(6,7,13,0)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // the logo small, top-left
    drawLogo(ctx, safe.l + px(150), safe.t + px(26), 0.42, true);
    // the bar: 60% wide, pink, a gold folding-table caret riding its end
    var frac = clamp01(Math.max(ld.lastFrac, L.fraction || 0)), bw = Math.round(W * 0.6), bx = (W - bw) / 2, by = H * 0.56, bh = px(14);
    panel(ctx, bx, by, bw, bh, px(7), 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.18)');
    ctx.fillStyle = COL.pink; rr(ctx, bx + 2, by + 2, Math.max(0, (bw - 4) * frac), bh - 4, px(5)); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(ctx, bx + 2, by + 2, Math.max(0, (bw - 4) * frac), (bh - 4) * 0.4, px(4)); ctx.fill();
    drawTableT(ctx, bx + (bw - 4) * frac - px(10), by - px(6), px(22), COL.gold);
    txt(ctx, Math.round(frac * 100) + '%', bx + bw, by - px(10), { font: F(12, 'bold'), color: COL.muted, align: 'right', outline: false });
    var label = stageLabel(L);
    txt(ctx, (label || 'Loading').toUpperCase(), bx, by + bh + px(22), { font: F(11, 'bold'), color: COL.cyan, outline: false, maxW: bw });
    var reason = L.reason === 'new' ? 'NEW GAME' : L.reason === 'load' ? 'LOADING SLOT ' + (g.activeSlot || 1) : 'GRIEVANCE CITY';
    txt(ctx, reason, bx + bw, by + bh + px(22), { font: F(11, 'bold'), color: COL.muted, align: 'right', outline: false });
    // the tip card, bottom-centre, fading between tips every 4 s
    var tips = loadingTips();
    if (tips.length) {
      var tip = tips[ld.tipI % tips.length], k = ld.tipT / 4, a = k < 0.08 ? k / 0.08 : k > 0.92 ? (1 - k) / 0.08 : 1;
      var font = F(14, '', FONT_TEXT), tw = Math.min(px(720), W - safe.l - safe.r - px(20)), lines = wrap(ctx, tip, font, tw - px(40));
      var th = px(34) + lines.length * px(20), tx = (W - tw) / 2, ty = H - safe.b - th - px(28);
      ctx.save(); ctx.globalAlpha = a;
      panel(ctx, tx, ty, tw, th, px(10), 'rgba(13,16,32,0.9)', 'rgba(255,190,60,0.4)');
      txt(ctx, 'TIP ' + ((ld.tipI % tips.length) + 1) + ' OF ' + tips.length, tx + px(16), ty + px(18), { font: F(9, 'bold'), color: COL.amber, outline: false });
      for (var i = 0; i < lines.length; i++) txt(ctx, lines[i], tx + px(16), ty + px(38) + i * px(20), { font: font, color: COL.ink, outline: false, maxW: tw - px(32) });
      ctx.restore();
    }
    txt(ctx, 'A parody. All characters are fictional.', W / 2, H - safe.b - px(10), { font: F(10), color: COL.muted, align: 'center', outline: false });
  }

  // --------------------------------------------------------- menu widgets ----
  // a vertical list of items: hover selects, the selected row glows, every row is a hit rect
  function drawMenuList(ctx, items, selRef, x, y, w, opts) {
    opts = opts || {};
    var rh = opts.rowH || px(40), gap = opts.gap || px(8), font = opts.font || F(16, 'bold');
    for (var i = 0; i < items.length; i++) {
      var it = items[i], iy = y + i * (rh + gap), sel = i === selRef.sel, disabled = !!it.disabled;
      if (!disabled && hovering(x, iy, w, rh)) { selRef.sel = i; sel = true; }
      panel(ctx, x, iy, w, rh, px(8), sel ? 'rgba(255,63,164,0.22)' : 'rgba(10,12,24,0.88)', sel ? COL.pink : 'rgba(255,255,255,0.15)', sel ? 2 : 1);
      var label = it.label, col = disabled ? 'rgba(143,151,179,0.5)' : sel ? COL.ink : COL.muted;
      txt(ctx, (sel && !disabled ? '▶  ' : '') + label, opts.align === 'left' ? x + px(16) : x + w / 2, iy + rh * 0.64, { font: font, color: col, align: opts.align === 'left' ? 'left' : 'center', outline: false, maxW: w - px(24) });
      if (it.value != null) txt(ctx, it.value, x + w - px(16), iy + rh * 0.64, { font: F(13, 'bold'), color: it.danger ? COL.red : COL.cyan, align: 'right', outline: false, maxW: w * 0.5 });
      if (!disabled) hit(x, iy, w, rh, (function (f, id) { return function () { f(id); }; })(opts.activate, it.id), 'menu-' + it.id);
    }
    return y + items.length * (rh + gap);
  }
  // the three slot cards (LOAD GAME, NEW GAME's picker, the pause menu's LOAD / SAVE): slot number, progress, play time, money,
  // location, stars, timestamp; [LOAD] [DELETE] or [START HERE] / [SAVE HERE] / [OVERWRITE]
  // the slot list, parsed once per frame / until a save, load or delete (QA-D SAVE-18: three full decodes per frame)
  function slotsOf(g) {
    if (!g || !g.slots) return [];
    var c = ui.slotCache;
    if (c && c.frame === g.frames && c.steps === g.steps && !c.dirty) return c.list;
    var list = []; try { list = g.slots() || []; } catch (e) { list = []; }
    ui.slotCache = { frame: g.frames, steps: g.steps, list: list, dirty: false };
    return list;
  }
  function slotsDirty() { if (ui.slotCache) ui.slotCache.dirty = true; }
  function slotUsed(s) { return !!(s && (!s.empty || s.corrupt)); }   // an unreadable slot is not free space (QA-D SAVE-05)
  function slotCards(ctx, mode, selRef, x, y, w, h, activate) {
    var g = game(), slots = slotsOf(g), n = 3;
    var stack = w < px(620), cw = stack ? w : (w - px(16)) / 3, ch = stack ? Math.min(px(118), (h - px(20)) / 3) : Math.min(h, px(260));
    var Ms = GTP.Missions;
    for (var i = 0; i < n; i++) {
      var s = slots[i] || { slot: i + 1, empty: true }, cx = stack ? x : x + i * (cw + px(8)), cy = stack ? y + i * (ch + px(8)) : y, sel = selRef.sel === i;
      if (hovering(cx, cy, cw, ch)) { selRef.sel = i; sel = true; }
      var active = g && g.activeSlot === s.slot && ui.sessionStarted && g.state !== 'title';
      panel(ctx, cx, cy, cw, ch, px(12), sel ? 'rgba(255,63,164,0.14)' : 'rgba(10,12,24,0.9)', sel ? COL.pink : active ? COL.gold : 'rgba(255,255,255,0.15)', sel ? 2 : 1);
      txt(ctx, 'SLOT ' + s.slot + (active ? '  ·  ACTIVE' : ''), cx + px(14), cy + px(24), { font: F(13, '900', FONT_DISPLAY), color: active ? COL.gold : COL.cyan, outline: false });
      var m = s.meta;
      if (s.corrupt) { txt(ctx, 'Corrupt save. Context stamped.', cx + px(14), cy + px(50), { font: F(12, '', FONT_TEXT), color: COL.red, outline: false, maxW: cw - px(28) }); }
      else if (s.empty) { txt(ctx, 'EMPTY. Respectfully.', cx + px(14), cy + px(52), { font: F(13, 'bold'), color: COL.muted, outline: false, maxW: cw - px(28) }); }
      else {
        var total = m.missionsTotal || (Ms && Ms.allMissions ? Ms.allMissions().length : 25);
        txt(ctx, (m.missions | 0) + ' / ' + total + ' missions', cx + px(14), cy + px(46), { font: F(13, 'bold'), color: COL.ink, outline: false, maxW: cw - px(28) });
        if (!stack) {
          txt(ctx, m.lastMission ? 'Last: ' + m.lastMission : 'Fresh off the bus', cx + px(14), cy + px(64), { font: F(11, '', FONT_TEXT), color: COL.muted, outline: false, maxW: cw - px(28) });
          txt(ctx, 'PLAY TIME  ' + fmtPlay(m.playTime), cx + px(14), cy + px(90), { font: F(11, 'bold'), color: COL.ink, outline: false, maxW: cw - px(28) });
          txt(ctx, U.fmtMoney(m.money || 0), cx + cw - px(14), cy + px(90), { font: F(13, 'bold'), color: COL.lime, align: 'right', outline: false });
          txt(ctx, (m.district || 'Grievance City') + (m.landmark ? ' · ' + m.landmark : ''), cx + px(14), cy + px(112), { font: F(11, '', FONT_TEXT), color: COL.muted, outline: false, maxW: cw - px(28) });
          for (var k = 0; k < 5; k++) star(ctx, cx + px(20) + k * px(16), cy + px(136), px(6), k < (m.wanted | 0) ? COL.gold : 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.6)');
          txt(ctx, 'Day ' + (m.day || 1) + ', ' + U.fmtClock(m.clock || 0), cx + cw - px(14), cy + px(140), { font: F(10), color: COL.muted, align: 'right', outline: false });
          txt(ctx, fmtDate(m.savedAt), cx + px(14), cy + px(160), { font: F(10), color: COL.muted, outline: false, maxW: cw - px(28) });
        } else {
          txt(ctx, fmtPlay(m.playTime) + '  ·  ' + U.fmtMoney(m.money || 0) + '  ·  ' + (m.district || ''), cx + px(14), cy + px(66), { font: F(11, '', FONT_TEXT), color: COL.muted, outline: false, maxW: cw - px(28) });
        }
      }
      // the buttons
      var bb = [], by = cy + ch - px(38), bh = px(28);
      if (mode === 'load') { if (s.corrupt) { bb.push({ id: 'new', label: 'NEW GAME HERE', col: COL.cyan }); bb.push({ id: 'delete', label: 'DELETE', col: COL.red }); } else if (!s.empty) { bb.push({ id: 'load', label: 'LOAD', col: COL.lime }); bb.push({ id: 'delete', label: 'DELETE', col: COL.red }); } else bb.push({ id: 'new', label: 'NEW GAME HERE', col: COL.cyan }); }
      else if (mode === 'new') bb.push(!slotUsed(s) ? { id: 'new', label: 'START HERE', col: COL.lime } : { id: 'new', label: 'OVERWRITE', col: COL.red });
      else if (mode === 'save') bb.push(s.empty ? { id: 'save', label: 'SAVE HERE', col: COL.lime } : { id: 'save', label: 'OVERWRITE', col: COL.amber });
      var bx = cx + px(14), tot = 0;
      for (k = 0; k < bb.length; k++) tot += measure(ctx, bb[k].label, F(11, 'bold')) + px(24) + px(8);
      if (stack) bx = cx + cw - tot - px(8);
      for (k = 0; k < bb.length; k++) {
        var b = bb[k], bwid = measure(ctx, b.label, F(11, 'bold')) + px(24), hov = hovering(bx, by, bwid, bh), on = sel && selRef.btn === k;
        panel(ctx, bx, by, bwid, bh, px(6), on || hov ? hexA(b.col, 0.3) : 'rgba(255,255,255,0.05)', on || hov ? b.col : 'rgba(255,255,255,0.2)', on ? 2 : 1);
        txt(ctx, b.label, bx + bwid / 2, by + px(19), { font: F(11, 'bold'), color: COL.ink, align: 'center', outline: false });
        hit(bx, by, bwid, bh, (function (act, slot) { return function () { activate(act, slot); }; })(b.id, s.slot), 'slot-' + b.id + '-' + s.slot);
        bx += bwid + px(8);
      }
      s._buttons = bb.length;
    }
    return { cw: cw, ch: ch, stack: stack, slots: slots, bottom: stack ? y + n * (ch + px(8)) : y + ch };
  }
  // the in-page confirmation screen (never window.confirm): OVERWRITE SLOT 2? / DELETE SLOT 3? / abandon the mission / lose progress
  function askConfirm(o) { ui.confirm = Object.assign({ sel: 1, yes: 'YES', no: 'BACK', lines: [], danger: false, t: 0, openWall: Date.now() }, o || {}); }
  function confirmActivate(yes) {
    var c = ui.confirm; if (!c) return;
    ui.confirm = null; sfx('ui', 0.35);
    if (yes) { if (c.onYes) { try { c.onYes(); } catch (e) { U.reportError(e, 'ui.confirm'); } } }
    else if (c.onNo) { try { c.onNo(); } catch (e) { U.reportError(e, 'ui.confirm'); } }
  }
  function drawConfirm(ctx) {
    var c = ui.confirm; if (!c) return;
    ctx.fillStyle = 'rgba(6,7,13,0.7)'; ctx.fillRect(0, 0, W, H);
    var pw = Math.min(px(520), W - safe.l - safe.r), font = F(14, '', FONT_TEXT), lines = [];
    for (var i = 0; i < c.lines.length; i++) lines = lines.concat(wrap(ctx, c.lines[i], font, pw - px(48)));
    var ph = px(96) + lines.length * px(20), x = (W - pw) / 2, y = (H - ph) / 2;
    panel(ctx, x, y, pw, ph, px(14), 'rgba(10,12,24,0.97)', c.danger ? 'rgba(255,59,48,0.6)' : COL.line, 1.5);
    txt(ctx, c.title, x + pw / 2, y + px(36), { font: F(20, '900', FONT_DISPLAY), color: c.danger ? COL.red : COL.gold, align: 'center', outline: false, maxW: pw - px(32) });
    for (i = 0; i < lines.length; i++) txt(ctx, lines[i], x + pw / 2, y + px(62) + i * px(20), { font: font, color: COL.ink, align: 'center', outline: false });
    var bw = px(150), by = y + ph - px(44), bh = px(32), bx0 = x + pw / 2 - bw - px(8), bx1 = x + pw / 2 + px(8);
    // BACK on the left, the destructive YES on the right, away from the slot button that opened the box, and a click on
    // YES within 0.4 s of opening is ignored, so a double-click never confirms (QA-B-FE-01)
    var btns = [{ x: bx1, label: c.yes, yes: true, col: c.danger ? COL.red : COL.lime }, { x: bx0, label: c.no, yes: false, col: COL.muted }];
    for (i = 0; i < 2; i++) {
      var b = btns[i], sel = c.sel === i;
      if (hovering(b.x, by, bw, bh)) { c.sel = i; sel = true; }
      panel(ctx, b.x, by, bw, bh, px(8), sel ? hexA(b.col === COL.muted ? COL.pink : b.col, 0.28) : 'rgba(255,255,255,0.05)', sel ? (b.col === COL.muted ? COL.pink : b.col) : 'rgba(255,255,255,0.2)', sel ? 2 : 1);
      txt(ctx, b.label, b.x + bw / 2, by + px(21), { font: F(13, 'bold'), color: COL.ink, align: 'center', outline: false });
      hit(b.x, by, bw, bh, (function (yes) { return function () { if (yes && Date.now() - (c.openWall || 0) < 400) return; confirmActivate(yes); }; })(b.yes), 'confirm-' + i);
    }
  }
  function confirmInput(In) {
    var c = ui.confirm; if (!c) return false;
    if (In.pressed('left') || In.pressed('right') || In.pressed('forward') || menuDown(In)) { c.sel = 1 - c.sel; sfx('ui', 0.2); }
    if (In.pressed('confirm')) confirmActivate(c.sel === 0);
    else if (menuBack(In)) confirmActivate(false);
    return true;
  }
  // the settings page (title and pause share it)
  function drawSettings(ctx, onBack) {
    var st = ui.settings, rows = SETTING_ROWS, pw = Math.min(px(620), W - safe.l - safe.r), rh = px(portrait ? 30 : 34);
    var ph = px(70) + rows.length * rh + px(14), x = (W - pw) / 2, y = Math.max(px(12), Math.min(H * 0.18, H - ph - px(20)));
    if (ph > H - px(24)) { rh = Math.floor((H - px(110)) / rows.length); ph = px(70) + rows.length * rh + px(14); y = px(12); }
    panel(ctx, x, y, pw, ph, px(12), 'rgba(10,12,24,0.97)', COL.line, 1.5);
    txt(ctx, 'SETTINGS', x + px(20), y + px(32), { font: F(18, '900', FONT_DISPLAY), color: COL.gold, outline: false });
    txt(ctx, glyph('left') === 'LS' ? 'LS adjusts · A selects · B back' : '← → adjust  ·  Enter select  ·  Esc back', x + pw - px(20), y + px(30), { font: F(10, 'bold'), color: COL.muted, align: 'right', outline: false });
    var ry = y + px(54), split = x + pw * 0.42;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], sel = st.sel === i;
      if (hovering(x + px(8), ry, pw - px(16), rh)) { st.sel = i; sel = true; }
      if (sel) panel(ctx, x + px(8), ry, pw - px(16), rh, px(6), 'rgba(255,63,164,0.16)', COL.pink, 1.5);
      else if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(x + px(8), ry, pw - px(16), rh); }
      var isBtn = r.type === 'page' || r.type === 'back';
      txt(ctx, r.label, isBtn ? x + pw / 2 : x + px(20), ry + rh * 0.64, { font: F(13, 'bold'), color: sel ? COL.ink : COL.muted, align: isBtn ? 'center' : 'left', outline: false });
      if (r.type === 'slider') {
        var sx = split, sw = pw * 0.42, v = st[r.id] / 100;
        panel(ctx, sx, ry + rh / 2 - px(4), sw, px(8), px(4), 'rgba(255,255,255,0.12)', null);
        ctx.fillStyle = sel ? COL.pink : COL.cyan; rr(ctx, sx, ry + rh / 2 - px(4), sw * v, px(8), px(4)); ctx.fill();
        ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(sx + sw * v, ry + rh / 2, px(7), 0, Math.PI * 2); ctx.fill();
        txt(ctx, String(st[r.id]), x + pw - px(20), ry + rh * 0.64, { font: F(12, 'bold'), color: COL.ink, align: 'right', outline: false });
        hit(sx - px(8), ry, sw + px(16), rh, (function (row, sx0, sw0) { return function () { var m = GTP.Input.mouse; ui.settings[row.id] = U.clamp(Math.round((m.x - sx0) / sw0 * 10) * 10, 0, 100); applySetting(row.id); saveSettings(); sfx('ui', 0.2); }; })(r, sx, sw), 'set-' + r.id);
      } else if (r.type === 'choice' || r.type === 'toggle') {
        var val = settingValueLabel(r), vw = measure(ctx, val, F(12, 'bold')) + px(16);
        txt(ctx, '◀', x + pw - px(20) - vw - px(14), ry + rh * 0.64, { font: F(11, 'bold'), color: sel ? COL.pink : COL.muted, align: 'right', outline: false });
        panel(ctx, x + pw - px(20) - vw - px(6), ry + rh / 2 - px(11), vw, px(22), px(5), sel ? 'rgba(255,63,164,0.22)' : 'rgba(255,255,255,0.08)', null);
        txt(ctx, val, x + pw - px(20) - px(6) - vw / 2, ry + rh * 0.64, { font: F(12, 'bold'), color: COL.ink, align: 'center', outline: false });
        txt(ctx, '▶', x + pw - px(14), ry + rh * 0.64, { font: F(11, 'bold'), color: sel ? COL.pink : COL.muted, align: 'right', outline: false });
        if (r.note && !portrait) { var nmax = pw * 0.36 - vw; if (nmax > px(40)) txt(ctx, ellipsize(ctx, r.note, F(10), nmax), split, ry + rh * 0.64, { font: F(10), color: 'rgba(143,151,179,0.8)', outline: false }); }   // cut, never squeezed (QA-B-FE-17)
        hit(x + pw - px(20) - vw - px(30), ry, px(24), rh, (function (row) { return function () { settingStep(row, -1); }; })(r), 'set-' + r.id + '-l');
        hit(x + pw - px(20) - vw - px(6), ry, vw + px(30), rh, (function (row) { return function () { settingStep(row, 1); }; })(r), 'set-' + r.id + '-r');
      } else if (r.type === 'page') hit(x + px(8), ry, pw - px(16), rh, function () { ui.settings.from = 'settings'; settingsOpenControls(); }, 'set-controls');
      else hit(x + px(8), ry, pw - px(16), rh, onBack, 'set-back');
      ry += rh;
    }
    var Rd = GTP.Render, q = Rd && Rd.quality ? Rd.quality : null;
    txt(ctx, 'Preset now: ' + (q ? QUALITY_LABELS[q.current] + (q.auto ? ' (auto)' : '') : '-') + '   ·   draw ' + C.QUALITY.drawDistance + ' m   ·   weather ' + (Rd && Rd.weather ? Rd.weather.state : '-'), x + px(20), y + ph - px(10), { font: F(10), color: COL.muted, outline: false, maxW: pw - px(40) });
  }
  function settingsOpenControls() { var g = game(); if (g && g.state === 'title') ui.title.page = 'controls'; else ui.pause.page = 'controls'; }
  function settingsInput(In, onBack) {
    var st = ui.settings, rows = SETTING_ROWS, r = rows[st.sel];
    if (menuBack(In)) { onBack(); return true; }
    if (In.pressed('forward')) { st.sel = (st.sel - 1 + rows.length) % rows.length; sfx('ui', 0.2); }
    if (menuDown(In)) { st.sel = (st.sel + 1) % rows.length; sfx('ui', 0.2); }
    if (In.pressed('left')) settingStep(r, -1);
    if (In.pressed('right')) settingStep(r, 1);
    if (In.pressed('confirm')) {
      if (r.type === 'back') onBack();
      else if (r.type === 'page') { ui.settings.from = 'settings'; settingsOpenControls(); }
      else settingStep(r, 1);
    }
    return true;
  }

  // --------------------------------------------------------------- title ----
  var CONTROLS = [
    ['WASD / arrows', 'Move  (steer in a vehicle)'], ['Shift', 'Run'], ['Space', 'Jump  /  handbrake'],
    ['Right mouse', 'Aim  (lock-on; scope with the Fact Checker)'], ['Q', 'Take cover / leave cover'], ['Shift + right mouse or X', 'Special: Focus, Shout, Chat Mob, Boost'], ['E, left mouse or Ctrl', 'Action  /  fire  /  start a cab or HOA shift'], ['F or Enter', 'Enter / exit vehicle'],
    ['Tab', 'Next target  ·  hold: weapon wheel'], ['Mouse wheel or [ ]', 'Cycle weapon  ·  scope zoom'], ['R', 'Reload'],
    ['H', 'Horn  (siren in a cruiser)'], ['N', 'Radio station'], ['M', 'Map: missions, stats, strands, waypoint'], ['V', 'Camera mode'], ['Esc or P', 'Pause'],
    ['W S · A D · Q E', 'Aircraft: pitch · roll · yaw'], ['Shift / Ctrl', 'Aircraft: throttle or collective up / down']
  ];
  var PAD_ROWS = [['Left stick', 'Move / steer  ·  menus: navigate'], ['Right stick', 'Look  ·  map: zoom'], ['A', 'Jump / handbrake  ·  confirm'], ['B', 'Sprint (hold) · cover (tap) / horn  ·  back'], ['X', 'Reload / radio  ·  delete'], ['Y', 'Enter / exit vehicle  ·  tab'], ['LB / RB', 'Previous / next weapon  ·  pages'], ['LT / RT', 'Aim / shoot  ·  map zoom'], ['Back / Start', 'Map / pause'], ['L3 / R3', 'Special / lock-on (hold: wheel)'], ['D-pad', 'Quick slots: pistol, rifle, thrown, melee'], ['Aircraft', 'LS pitch + roll · LB RB yaw · RT LT throttle']];
  function titleItems() {
    var g = game(), items = [{ id: 'play', label: 'NEW GAME', desc: 'A fresh Grievance City. Pick a slot, pick a seed, pick a side. Both are wrong.' }];
    var anySlot = slotsOf(g).some(slotUsed);
    if (!anySlot) items[0].desc = 'Straight into Grievance City, slot 1. (Seeds and slots live under LOAD GAME.) Pick a side. Both are wrong.';   // QA-B-FE-18
    var sl = slotsOf(g), latest = 0, latestT = -1, meta = null;
    for (var i = 0; i < sl.length; i++) if (!sl[i].empty && sl[i].meta && (sl[i].meta.savedAt || 0) > latestT) { latestT = sl[i].meta.savedAt || 0; latest = sl[i].slot; meta = sl[i].meta; }
    var hasSave = !!latest;
    if (!sl.length && g && g.hasSave) { hasSave = !!g.hasSave(); latest = hasSave && g.latestSlot ? g.latestSlot() : 0; }
    if (hasSave) items.unshift({ id: 'continue', label: 'CONTINUE', desc: meta ? 'Slot ' + latest + ': ' + (meta.missions | 0) + ' / ' + (meta.missionsTotal || 25) + ' missions, ' + fmtPlay(meta.playTime) + ', ' + U.fmtMoney(meta.money || 0) + (meta.district ? ', ' + meta.district : '') : 'The most recent save.' });
    items.push({ id: 'load', label: 'LOAD GAME', desc: 'Three slots. Load, delete, or start a new game in an empty one.' });
    items.push({ id: 'settings', label: 'SETTINGS', desc: 'Volumes, quality, draw distance, weather, gamepad, hints, subtitles.' });
    items.push({ id: 'controls', label: 'CONTROLS', desc: 'Keyboard, mouse, touch and the gamepad layout.' });
    items.push({ id: 'credits', label: 'CREDITS', desc: 'The cast, as ad reads. Minds changed: zero.' });
    return items;
  }
  function startAttract() {
    var Rd = GTP.Render, Wd = GTP.World; if (!Rd || !Rd.freeCam) return;
    var ids = ['goldplate_tower', 'campus_quad', 'stadium', 'velvetine_pier', 'airport_terminal', 'capitol_dome', 'manifest_quay', 'nap_depot', 'heirloom_club', 'tyn_tower', 'bridge_main'], stops = [];
    for (var i = 0; i < ids.length; i++) { var lm = Wd && Wd.landmark ? Wd.landmark(ids[i]) : null; if (lm) stops.push({ x: lm.x, z: lm.z, h: Math.min(60, (lm.building ? lm.building.h : 10) + 30) }); }
    if (!stops.length) stops.push({ x: C.MAP_W * C.TILE / 2, z: C.MAP_H * C.TILE / 2, h: 60 });
    ui.attract = { on: true, t: 0, stops: stops, seg: 16 };
    Rd.freeCam(true);
    updateAttract(0);
  }
  function stopAttract() {
    var Rd = GTP.Render, p = player();
    ui.attract.on = false;
    if (Rd && Rd.freeCam) { Rd.freeCam(false); if (p && Rd.rig && Rd.rig.target) Rd.rig.target(p); if (Rd.rig) { Rd.rig.yaw = p ? p.yaw : 0; Rd.rig.snap(); } if (Rd.updateCamera) Rd.updateCamera(0); }
  }
  function updateAttract(dt) {
    var a = ui.attract, Rd = GTP.Render; if (!a.on || !Rd || !Rd.camera) return;
    a.t += dt;
    var n = a.stops.length, seg = a.seg, i = Math.floor(a.t / seg) % n, j = (i + 1) % n, k = (a.t % seg) / seg;
    var blend = k < 0.75 ? 0 : ease((k - 0.75) / 0.25);
    var ang = a.t * 0.12;
    function camAt(stop, ang2) { var r = 70; return { x: stop.x + Math.cos(ang2) * r, y: stop.h, z: stop.z + Math.sin(ang2) * r, lx: stop.x, ly: 6, lz: stop.z }; }
    var A = camAt(a.stops[i], ang), B = camAt(a.stops[j], ang);
    var cx = U.lerp(A.x, B.x, blend), cy = U.lerp(A.y, B.y, blend), cz = U.lerp(A.z, B.z, blend);
    var lx = U.lerp(A.lx, B.lx, blend), ly = U.lerp(A.ly, B.ly, blend), lz = U.lerp(A.lz, B.lz, blend);
    Rd.camera.position.set(cx, cy, cz); Rd.camera.lookAt(lx, ly, lz);
    if (Math.abs(Rd.camera.fov - 55) > 0.1) { Rd.camera.fov = 55; Rd.camera.updateProjectionMatrix(); }
  }
  // the folding table T: a plank on two crossed legs
  function drawTableT(ctx, x, y, h, color) {
    var w = h * 0.9, plank = h * 0.26;
    ctx.save(); ctx.translate(x, y - h);
    ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = Math.max(2, h * 0.07); ctx.lineJoin = 'round';
    rr(ctx, 0, 0, w, plank, plank * 0.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(w * 0.05, plank * 0.58, w * 0.9, plank * 0.18);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(w * 0.05, plank * 0.12, w * 0.9, plank * 0.14);
    // legs: an X of two folding legs under the plank
    var lw = h * 0.12, ly0 = plank, ly1 = h;
    ctx.fillStyle = color;
    [[w * 0.12, w * 0.76], [w * 0.76, w * 0.12]].forEach(function (leg) {
      ctx.beginPath(); ctx.moveTo(leg[0], ly0); ctx.lineTo(leg[0] + lw, ly0); ctx.lineTo(leg[1] + lw, ly1); ctx.lineTo(leg[1], ly1); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    ctx.fillStyle = '#1b1b22'; ctx.beginPath(); ctx.arc(w * 0.5, (ly0 + ly1) / 2, lw * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return w;
  }
  function drawLogo(ctx, cx, y, scale, compact) {
    var f1 = F(34 * scale, '900', FONT_DISPLAY), f2 = F(84 * scale, '900', FONT_DISPLAY);
    ctx.save();
    txt(ctx, 'GRAND THEFT', cx, y, { font: f1, color: COL.gold, align: 'center', lw: px(7 * scale), outline: 'rgba(0,0,0,0.95)' });
    // PUNDI + table T, measured as one word
    ctx.font = f2;
    var left = 'PUNDI', lw = ctx.measureText(left).width, tw = px(80 * scale) * 0.9, gap = px(6 * scale), total = lw + gap + tw;
    var x0 = cx - total / 2, y2 = y + px(84 * scale);
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = px(14); ctx.shadowOffsetY = px(6);
    txt(ctx, left, x0, y2, { font: f2, color: COL.gold, align: 'left', lw: px(9 * scale), outline: 'rgba(0,0,0,0.95)' });
    ctx.shadowColor = 'transparent';
    drawTableT(ctx, x0 + lw + gap, y2 + px(2 * scale), px(80 * scale), COL.gold);
    // bevel highlight
    ctx.globalAlpha = 0.35; txt(ctx, left, x0, y2 - px(2 * scale), { font: f2, color: '#fff2b8', align: 'left', outline: false });
    ctx.globalAlpha = 1;
    if (!compact) txt(ctx, 'Steal the Discourse.', cx, y2 + px(34 * scale), { font: F(22 * scale, 'italic bold', FONT_TEXT), color: COL.pink, align: 'center', lw: px(4) });
    ctx.restore();
  }
  function drawTitle(ctx) {
    var tt = ui.title; tt.t = ui.t;   // the real clock, not per drawn frame (QA-C QAC-44)
    // cinematic vignette
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(6,7,13,0.75)'); g.addColorStop(0.35, 'rgba(6,7,13,0.15)'); g.addColorStop(0.7, 'rgba(6,7,13,0.25)'); g.addColorStop(1, 'rgba(6,7,13,0.85)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var scale = portrait ? 0.62 : Math.min(1, W / 900);
    var page = tt.page;
    if (page === 'credits' && ui.credits) { drawCredits(ctx); return; }
    if (page === 'menu') drawLogo(ctx, W / 2, H * (portrait ? 0.16 : 0.2), scale);
    else drawLogo(ctx, portrait ? W / 2 : safe.l + px(150), safe.t + px(26), 0.42, true);
    if (page === 'controls') drawControlsPanel(ctx, 'CONTROLS', function () { tt.page = ui.settings.from === 'settings' ? 'settings' : 'menu'; ui.settings.from = null; });
    else if (page === 'settings') drawSettings(ctx, function () { tt.page = 'menu'; saveSettings(); });
    else if (page === 'slots') drawTitleSlots(ctx);
    else {
      var items = titleItems(); tt.items = items; if (tt.sel >= items.length) tt.sel = 0;
      var y = H * (portrait ? 0.5 : 0.56), iw = px(280), ih = px(38), gap = px(8), ix = portrait ? W / 2 - iw / 2 : W / 2 - iw / 2 - px(portrait ? 0 : 120);
      var blink = Math.floor(tt.t * 1.6) % 2 === 0;
      txt(ctx, ui.touch.visible ? 'TAP TO PLAY' : 'PRESS ' + glyph('confirm') + ' TO PLAY', ix + iw / 2, y - px(26), { font: F(13, 'bold'), color: blink ? COL.cyan : 'rgba(46,230,255,0.45)', align: 'center' });
      var maxRows = Math.floor((H - safe.b - px(50) - y) / (ih + gap));
      if (maxRows < items.length) { ih = Math.max(px(26), Math.floor((H - safe.b - px(50) - y) / items.length) - gap); }
      drawMenuList(ctx, items, tt, ix, y, iw, { rowH: ih, gap: gap, activate: titleActivate, font: F(ih < px(32) ? 14 : 18, 'bold') });
      // the selected item's description on the right (under the list on a phone)
      var sel = items[tt.sel];
      if (sel && sel.desc) {
        var dx = portrait ? W / 2 : ix + iw + px(30), dw = portrait ? W - safe.l - safe.r - px(20) : Math.min(px(360), W - safe.r - dx - px(10));
        var lines = wrap(ctx, sel.desc, F(13, '', FONT_TEXT), dw - px(24)), dy = portrait ? y + items.length * (ih + gap) + px(6) : y;
        if (dw > px(140)) {
          panel(ctx, portrait ? dx - dw / 2 : dx, dy, dw, px(26) + lines.length * px(18), px(8), 'rgba(10,12,24,0.7)', 'rgba(46,230,255,0.25)');
          for (var i = 0; i < lines.length; i++) txt(ctx, lines[i], (portrait ? dx - dw / 2 : dx) + px(12), dy + px(22) + i * px(18), { font: F(13, '', FONT_TEXT), color: COL.ink, outline: false, maxW: dw - px(24) });
        }
      }
    }
    txt(ctx, 'A parody. All characters are fictional.', W / 2, H - safe.b - px(34), { font: F(12, 'bold'), color: COL.ink, align: 'center' });
    txt(ctx, 'Grievance City: two time zones, one opinion.  v' + (GTP.VERSION || '') + (GTP.Input && GTP.Input.padConnected && GTP.Input.padConnected() ? '  ·  gamepad connected' : ''), W / 2, H - safe.b - px(14), { font: F(10), color: COL.muted, align: 'center' });
  }
  // NEW GAME's slot picker / LOAD GAME's cards on the title (ui.title.slotMode = 'new' | 'load'), the seed field under them
  function slotHint() { var d = device(); return d === 'gamepad' ? 'LS picks · A chooses · B back' : d === 'touch' ? 'tap a button' : '← → pick  ·  Enter choose  ·  Esc back'; }
  function drawTitleSlots(ctx) {
    var tt = ui.title, mode = tt.slotMode, pw = Math.min(px(900), W - safe.l - safe.r), x = (W - pw) / 2, y = Math.max(px(110), H * 0.2);
    txt(ctx, mode === 'new' ? 'NEW GAME: PICK A SLOT' : 'LOAD GAME', x, y - px(12), { font: F(18, '900', FONT_DISPLAY), color: COL.gold, outline: false });
    txt(ctx, slotHint(), pw < px(560) ? x : x + pw, pw < px(560) ? y - px(36) : y - px(14), { font: F(10, 'bold'), color: COL.muted, align: pw < px(560) ? 'left' : 'right', outline: false, maxW: pw });   // on its own line when narrow (QA-B-FE-15)
    var ref = tt.slotRef || (tt.slotRef = {}); ref.sel = tt.slotSel; ref.btn = tt.slotBtn || 0;
    var r = slotCards(ctx, mode, ref, x, y, pw, Math.min(px(260), H - y - px(130)), titleSlotActivate);
    tt.slotSel = ref.sel;   // hover may have moved the selection
    var sx = x, sy = r.bottom + px(16);
    // the seed field (digits), default the current city's seed; typing replaces it
    var seedLabel = 'SEED', fw = px(200), fh = px(32);
    txt(ctx, seedLabel, sx, sy + px(21), { font: F(11, 'bold'), color: COL.muted, outline: false });
    var focus = tt.seedFocus;
    panel(ctx, sx + px(50), sy, fw, fh, px(6), focus ? 'rgba(46,230,255,0.12)' : 'rgba(10,12,24,0.9)', focus ? COL.cyan : 'rgba(255,255,255,0.2)', focus ? 2 : 1);
    var shown = tt.seed || '', caret = focus && Math.floor(tt.t * 2) % 2 === 0 ? '|' : '';
    txt(ctx, (shown || (focus ? '' : String(game() ? game().seed : 7))) + caret, sx + px(60), sy + px(21), { font: F(14, 'bold'), color: shown || focus ? COL.ink : COL.muted, outline: false, maxW: fw - px(20) });
    var noteRoom = pw - fw - px(70) - px(132);
    if (noteRoom > measure(ctx, 'Same seed, same city as a friend. Digits only.', F(10)) * 0.9) txt(ctx, 'Same seed, same city as a friend. Digits only.', sx + px(50) + fw + px(12), sy + px(21), { font: F(10), color: COL.muted, outline: false, maxW: noteRoom });
    else txt(ctx, 'Same seed, same city as a friend. Digits only.', sx, sy + fh + px(16), { font: F(10), color: COL.muted, outline: false, maxW: pw });   // under the field when narrow (QA-B-FE-15)
    hit(sx + px(50), sy, fw, fh, function () { tt.seedFocus = true; GTP.Input.text.capture = true; GTP.Input.text.queue.length = 0; }, 'seed');
    var bw = px(120), bx = x + pw - bw, by = sy;
    panel(ctx, bx, by, bw, fh, px(8), hovering(bx, by, bw, fh) ? 'rgba(255,63,164,0.25)' : 'rgba(10,12,24,0.9)', 'rgba(255,255,255,0.2)');
    txt(ctx, 'BACK', bx + bw / 2, by + px(21), { font: F(13, 'bold'), color: COL.ink, align: 'center', outline: false });
    hit(bx, by, bw, fh, function () { titleBack(); }, 'slots-back');
    if (r.slots && r.slots[tt.slotSel]) r.slots[tt.slotSel]._sel = true;
    tt._slotInfo = r;
  }
  function chosenSeed() { var g = game(), s = parseInt(ui.title.seed, 10); return isFinite(s) && ui.title.seed !== '' ? s : (g ? g.seed : 7); }
  function beginNewGame(slot, seed, opening) {
    var g = game(); if (!g) return;
    ui.sessionStarted = true;
    ui.money.shown = null; ui.wanted.last = 0; ui.subs.shown = null; ui.toasts.length = 0; ui.dialogue = null; ui.card = null; ui.banner = null; ui.waypoint = null; ui.map.route = null;
    g.activeSlot = slot || 1;
    if (opening) g.newGame(seed, { opening: true }); else g.newGame(seed);
    g.activeSlot = slot || 1;
    g.waypoint = null;
    g.setState('playing');
    // the slot is claimed at once so CONTINUE and the cards know the game exists (quiet; the autosave takes over after)
    try { if (g.saveSlot) g.saveSlot(slot || 1, { quiet: true, reason: 'new' }); } catch (e) { /* storage optional */ }
    toast('New game in slot ' + (slot || 1) + '. Minds changed: zero.');
  }
  function titleSlotActivate(action, slot) {
    var g = game(), tt = ui.title; if (!g) return;
    var slots = slotsOf(g), s = slots[slot - 1];
    sfx('ui', 0.4);
    if (action === 'load') { if (g.loadSlot && g.loadSlot(slot)) { ui.sessionStarted = true; ui.money.shown = null; ui.wanted.last = 0; ui.subs.shown = null; } return; }
    if (action === 'delete') { askConfirm({ title: 'DELETE SLOT ' + slot + '?', lines: [s && s.meta ? 'It has ' + nMissions(s.meta.missions) + ' and ' + fmtPlay(s.meta.playTime) + ' in it.' : 'Gone for good.', 'There is no undo. There is no liaison.'], yes: 'DELETE', no: 'BACK', danger: true, onYes: function () { g.deleteSlot(slot); slotsDirty(); toast('Slot ' + slot + ' deleted'); } }); return; }
    if (action === 'new') {
      if (slotUsed(s)) { askConfirm({ title: 'OVERWRITE SLOT ' + slot + '?', lines: [s.corrupt ? 'It holds a save this build cannot read (' + (s.version != null ? 'another version' : 'damaged') + ').' : 'It has ' + nMissions(s.meta.missions) + ' and ' + fmtPlay(s.meta.playTime) + ' in it.'], yes: 'OVERWRITE', no: 'BACK', danger: true, onYes: function () { beginNewGame(slot, chosenSeed(), true); } }); return; }
      beginNewGame(slot, chosenSeed(), true);
    }
    void tt;
  }
  function slotButtons(mode, s) { return mode === 'load' && slotUsed(s) ? 2 : 1; }
  function titleBack() { var tt = ui.title; tt.page = 'menu'; tt.seedFocus = false; if (GTP.Input) GTP.Input.text.capture = false; }
  // CONTROLS: keyboard on the left, the gamepad (always) and touch on the right; one column on narrow screens with the
  // device in use first; rows shrink to fit above the title footer (QA-B-FE-10 / FE-11)
  var CONTROLS_EXTRA = [['+ / -', 'Zoom the map / the scope'], ['Esc or Backspace', 'Back out of a menu'], ['Delete', 'Delete a save slot (LOAD GAME)']];
  function drawControlsPanel(ctx, title, onClose) {
    var padOn = GTP.Input && GTP.Input.padConnected && GTP.Input.padConnected(), keys = CONTROLS.concat(CONTROLS_EXTRA);
    var touchRows = [['Left half', 'The stick moves (push to the rim: run)'], ['Right half', 'Drag to look'], ['Buttons', 'FIRE, AIM, JUMP, ENTER, RLD, WPN (hold: wheel), COVER, SPCL'], ['Pills', 'MAP and PAUSE at the top'], ['In a car', 'HORN, BRAKE, EXIT, CAM, BOOST'], ['In the air', 'THR+ / THR-, YAW L / YAW R, the stick pitches and rolls']];
    var two = W >= px(900) && !portrait, pw = Math.min(two ? px(1080) : px(640), W - safe.l - safe.r);
    var right = [['', 'GAMEPAD (standard layout)' + (padOn ? '  ·  CONNECTED' : '')]].concat(PAD_ROWS, [['', 'TOUCH']], touchRows);
    var cols = two ? [keys, right] : [device() === 'gamepad' ? right.slice(0, PAD_ROWS.length + 1).concat([['', 'KEYBOARD']], keys) : device() === 'touch' ? right.slice(PAD_ROWS.length + 1).concat([['', 'KEYBOARD']], keys) : keys.concat([['', 'GAMEPAD (standard layout)']], PAD_ROWS)];
    var nRows = Math.max.apply(null, cols.map(function (c) { return c.length; })), avail = H - px(130);
    var rh = Math.max(px(13), Math.min(px(portrait ? 20 : 22), Math.floor((avail - px(70)) / nRows))), ph = px(70) + nRows * rh;
    var x = (W - pw) / 2, y = Math.max(px(12), Math.min(H * 0.12, H - ph - px(70)));
    panel(ctx, x, y, pw, ph, px(12), 'rgba(10,12,24,0.97)', COL.line, 1.5);
    txt(ctx, title, x + px(20), y + px(32), { font: F(18, '900', FONT_DISPLAY), color: COL.gold, outline: false, maxW: pw - px(160) });
    txt(ctx, device() === 'gamepad' ? 'B: back' : device() === 'touch' ? 'tap: back' : 'Enter / Esc: back', x + pw - px(20), y + px(30), { font: F(10, 'bold'), color: COL.muted, align: 'right', outline: false });
    var colW = (pw - px(16)) / cols.length, fs = rh < px(18) ? 10 : 12;
    for (var c = 0; c < cols.length; c++) {
      var rows = cols[c], cx0 = x + px(8) + c * colW, ty = y + px(58), split = cx0 + colW * (portrait ? 0.46 : 0.4);
      for (var i = 0; i < rows.length; i++) {
        if (!rows[i][0]) { txt(ctx, rows[i][1], cx0 + px(12), ty, { font: F(10, 'bold'), color: COL.cyan, outline: false, maxW: colW - px(20) }); ty += rh; continue; }
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0)'; ctx.fillRect(cx0, ty - rh + px(5), colW - px(8), rh);
        txt(ctx, rows[i][0], split - px(10), ty, { font: F(portrait ? 10 : fs, 'bold'), color: COL.cyan, align: 'right', outline: false, maxW: split - cx0 - px(16) });
        txt(ctx, rows[i][1], split + px(6), ty, { font: F(portrait ? 10 : fs, '', FONT_TEXT), color: COL.ink, outline: false, maxW: cx0 + colW - split - px(16) });
        ty += rh;
      }
    }
    hit(x, y, pw, ph, onClose, 'controls-close');
  }
  function titleActivate(id) {
    var g = game(), tt = ui.title; if (!g) return;
    sfx('ui', 0.4);
    if (id === 'controls') { tt.page = 'controls'; return; }
    if (id === 'settings') { tt.page = 'settings'; ui.settings.sel = 0; return; }
    if (id === 'credits') { credits(null); tt.page = 'credits'; return; }
    if (id === 'load') { tt.page = 'slots'; tt.slotMode = 'load'; tt.slotSel = Math.max(0, (g.latestSlot ? g.latestSlot() : 1) - 1); tt.slotBtn = 0; return; }
    if (id === 'continue') {
      if (g.load && g.load()) { ui.sessionStarted = true; ui.money.shown = null; ui.wanted.last = 0; ui.subs.shown = null; return; }
      toast('No save to continue; starting new');
    }
    // NEW GAME: with no save anywhere the game starts at once in slot 1 (nothing to choose, nothing to overwrite);
    // otherwise the slot picker (choose an empty slot or overwrite, and the seed field)
    var any = false, sl = slotsOf(g);
    for (var i = 0; i < sl.length; i++) if (slotUsed(sl[i])) any = true;
    if (!any) { beginNewGame(1, g.seed, FAST_START_OPENING); return; }
    tt.page = 'slots'; tt.slotMode = 'new'; tt.slotSel = 0; tt.slotBtn = 0;
    for (i = 0; i < sl.length; i++) if (sl[i].empty) { tt.slotSel = i; break; }
  }
  function titleSlotsInput(In) {
    var tt = ui.title, g = game(), q = In.text.queue;
    if (tt.seedFocus) {
      while (q.length) {
        var k = q.shift();
        if (k === 'Backspace') tt.seed = tt.seed.slice(0, -1);
        else if (k === 'Enter' || k === 'Escape') { tt.seedFocus = false; In.text.capture = false; }
        else if (/^[0-9]$/.test(k) && tt.seed.length < 9) tt.seed += k;
      }
      if (In.pressed('confirm') || menuBack(In)) { tt.seedFocus = false; In.text.capture = false; }
      return true;
    }
    q.length = 0;
    if (menuBack(In)) { titleBack(); return true; }
    var slots = slotsOf(g), cur = slots[tt.slotSel], nb = slotButtons(tt.slotMode, cur);
    if (In.pressed('left')) { if (tt.slotBtn > 0) tt.slotBtn--; else { tt.slotSel = (tt.slotSel + 2) % 3; tt.slotBtn = 0; } sfx('ui', 0.2); }
    if (In.pressed('right')) { if (tt.slotBtn < nb - 1) tt.slotBtn++; else { tt.slotSel = (tt.slotSel + 1) % 3; tt.slotBtn = 0; } sfx('ui', 0.2); }
    if (In.pressed('forward')) { tt.slotSel = (tt.slotSel + 2) % 3; tt.slotBtn = 0; }
    if (menuDown(In)) { tt.slotSel = (tt.slotSel + 1) % 3; tt.slotBtn = 0; }
    if (In.pressed('secondary') && tt.slotMode === 'load' && slotUsed(cur)) titleSlotActivate('delete', cur.slot);
    if (In.pressed('tabNext')) { tt.seedFocus = true; In.text.capture = true; q.length = 0; }
    if (In.pressed('confirm')) {
      if (!cur) return true;
      if (tt.slotMode === 'load') { if (cur.corrupt) titleSlotActivate(tt.slotBtn === 1 ? 'delete' : 'new', cur.slot); else if (cur.empty) titleSlotActivate('new', cur.slot); else titleSlotActivate(tt.slotBtn === 1 ? 'delete' : 'load', cur.slot); }
      else titleSlotActivate('new', cur.slot);
    }
    return true;
  }

  // ------------------------------------------------ pause, phone, credits ----
  var PAUSE_ITEMS = [
    { id: 'resume', label: 'RESUME' }, { id: 'story', label: 'STORY' }, { id: 'save', label: 'SAVE' }, { id: 'load', label: 'LOAD GAME' }, { id: 'map', label: 'MAP' },
    { id: 'settings', label: 'SETTINGS' }, { id: 'controls', label: 'CONTROLS' }, { id: 'mute', label: 'MUTE' }, { id: 'restart', label: 'RESTART' }, { id: 'quit', label: 'QUIT TO TITLE' }
  ];
  var PHONE_TABS = ['MAP', 'STORY', 'MISSIONS', 'STOCKS', 'STATS', 'STRANDS', 'REPLAY'];
  function tabId() { return PHONE_TABS[ui.pause.tab] || 'MAP'; }
  function openPause(page) {
    var g = game(); if (!g) return;
    if (g.state === 'paused') { ui.pause.page = page; return; }
    if (g.state !== 'playing' && g.state !== 'cutscene' && !(g.state === 'minigame' && ui.minigame)) return;
    ui.pause.from = g.state; ui.pause.page = page; ui.pause.sel = 0; ui.pause.scroll = 0; ui.pause.row = 0; ui.pause.phoneFrom = null;
    if (page === 'phone' && (ui.pause.tab < 0 || ui.pause.tab >= PHONE_TABS.length)) ui.pause.tab = 0;
    g.setState('paused');
    if (GTP.Input.releasePointerLock) GTP.Input.releasePointerLock();
  }
  function closePause() {
    var g = game(); if (!g || g.state !== 'paused') return;
    ui.confirm = null;
    if (ui.pause.page === 'shop' && GTP.Combat && GTP.Combat.shop && GTP.Combat.shop.state.open) { try { GTP.Combat.shop.close(); } catch (e) { /* optional */ } }
    var to = ui.pause.from === 'cutscene' && GTP.Cutscenes && GTP.Cutscenes.active ? 'cutscene' : ui.pause.from === 'minigame' && ui.minigame ? 'minigame' : 'playing';
    g.setState(to);
  }
  function busyText() {
    var Ms = GTP.Missions, St = GTP.Strands;
    if (Ms && Ms.state && Ms.state.active) return 'the mission';
    if (St && St.active && St.active()) return 'the strand';
    return null;
  }
  // SAVE refuses what a load would undo for free: a cutscene (it would be marked watched), stars, a burning car, the
  // minigame, death (QA-B-FE-07, QA-D SAVE-06 / SAVE-08)
  function saveBlocker() {
    var g = game(), p = player(), Cs = GTP.Cutscenes, wl = (GTP.AI && GTP.AI.wanted) ? GTP.AI.wanted.level : (p ? p.wanted | 0 : 0);
    if ((Cs && Cs.active) || ui.pause.from === 'cutscene') return 'Not during a cutscene. Let it finish.';
    if (ui.pause.from === 'minigame' || ui.minigame) return 'Finish the argument first.';
    if (p && !p.alive) return 'You are being ratio\'d. Save later.';
    if (wl > 0) return 'Lose the stars first. The precinct does not do saves.';
    var v = p && p.inVehicle; if (v && (v.burning || v.onFire || (v.hp != null && v.hp <= 0))) return 'Not in a burning car.';
    void g; return null;
  }
  function doSave(slot) {
    var g = game(); if (!g) return;
    var block = saveBlocker(); if (block) { toast(block); sfx('fail', 0.25); return; }
    var busy = busyText();
    var write = function () {
      var Ms = GTP.Missions, St = GTP.Strands;
      if (Ms && Ms.state && Ms.state.active && Ms.abort) Ms.abort();
      if (St && St.active && St.active() && St.end) St.end('save');
      slotsDirty();
      if (g.saveSlot(slot || g.activeSlot || 1, { quiet: true, reason: 'manual' })) { toast('Saved to slot ' + (slot || g.activeSlot || 1)); ui.saved.t = 1.2; ui.saved.slot = slot || g.activeSlot; }
    };
    if (busy) askConfirm({ title: 'SAVE NOW?', lines: ['Saving now will abandon ' + busy + '.'], yes: 'SAVE', no: 'BACK', danger: true, onYes: write });
    else write();
  }
  function doLoad(slot) {
    var g = game(); if (!g) return;
    askConfirm({ title: 'LOAD SLOT ' + slot + '?', lines: ['Lose unsaved progress?'], yes: 'LOAD', no: 'BACK', danger: true, onYes: function () {
      ui.confirm = null;
      if (g.loadSlot(slot)) { ui.money.shown = null; ui.wanted.last = 0; ui.subs.shown = null; ui.waypoint = null; ui.map.route = null; ui.card = null; ui.banner = null; }
    } });
  }
  function pauseActivate(id) {
    var g = game(); if (!g) return;
    sfx('ui', 0.4);
    switch (id) {
      case 'resume': closePause(); break;
      case 'story': ui.pause.page = 'phone'; ui.pause.tab = PHONE_TABS.indexOf('STORY'); ui.pause.row = 0; ui.pause.scroll = 0; ui.pause.phoneFrom = 'pause'; break;
      case 'save': ui.pause.page = 'slots'; ui.pause.slotMode = 'save'; ui.pause.slotSel = Math.max(0, (g.activeSlot || 1) - 1); ui.pause.slotBtn = 0; break;
      case 'load': ui.pause.page = 'slots'; ui.pause.slotMode = 'load'; ui.pause.slotSel = Math.max(0, (g.latestSlot ? g.latestSlot() || 1 : 1) - 1); ui.pause.slotBtn = 0; break;
      case 'map': ui.pause.page = 'phone'; ui.pause.tab = 0; ui.pause.phoneFrom = 'pause'; mapCenterOnPlayer(); break;
      case 'settings': ui.pause.page = 'settings'; ui.settings.sel = 0; break;
      case 'controls': ui.settings.from = 'pause'; ui.pause.page = 'controls'; break;
      case 'mute': setMuted(!ui.muted); break;
      case 'restart': askConfirm({ title: 'RESTART?', lines: ['A fresh city on the same seed. The slot keeps its save until the next autosave.'], yes: 'RESTART', no: 'BACK', danger: true, onYes: function () { g.newGame(g.seed); ui.money.shown = null; ui.wanted.last = 0; ui.subs.shown = null; ui.toasts.length = 0; ui.dialogue = null; ui.waypoint = null; ui.map.route = null; g.waypoint = null; g.setState('playing'); toast('New game. Minds changed: zero.'); } }); break;
      case 'quit': askConfirm({ title: 'QUIT TO TITLE?', lines: ['Unsaved progress since the last autosave is lost.'], yes: 'QUIT', no: 'BACK', danger: true, onYes: function () { g.setState('title'); } }); break;
      default: break;
    }
  }
  function pauseSlotActivate(action, slot) {
    var g = game(), pg = ui.pause; if (!g) return;
    var slots = slotsOf(g), s = slots[slot - 1];
    sfx('ui', 0.4);
    if (action === 'save') {
      if (s && !s.empty && slot !== g.activeSlot) askConfirm({ title: 'OVERWRITE SLOT ' + slot + '?', lines: ['It has ' + nMissions(s.meta.missions) + ' and ' + fmtPlay(s.meta.playTime) + ' in it.'], yes: 'OVERWRITE', no: 'BACK', danger: true, onYes: function () { doSave(slot); } });
      else doSave(slot);
      return;
    }
    if (action === 'load') { doLoad(slot); return; }
    if (action === 'delete') { askConfirm({ title: 'DELETE SLOT ' + slot + '?', lines: [s && s.meta ? 'It has ' + nMissions(s.meta.missions) + ' and ' + fmtPlay(s.meta.playTime) + ' in it.' : 'Gone for good.'], yes: 'DELETE', no: 'BACK', danger: true, onYes: function () { g.deleteSlot(slot); slotsDirty(); toast('Slot ' + slot + ' deleted'); } }); return; }
    if (action === 'new') { askConfirm({ title: 'NEW GAME IN SLOT ' + slot + '?', lines: ['Lose unsaved progress?'], yes: 'NEW GAME', no: 'BACK', danger: true, onYes: function () { beginNewGame(slot, g.seed, true); } }); return; }
    void pg;
  }
  function setMuted(m) {
    ui.muted = !!m;
    if (GTP.Audio && GTP.Audio.setMuted) { try { GTP.Audio.setMuted(ui.muted || ui.settings.master === 0); } catch (e) { /* optional */ } }
    if (ui.settings.master === 0) ui.masterMuted = true;
    try { localStorage.setItem('gtp.mute', ui.muted ? '1' : '0'); } catch (e) { /* storage may be blocked */ }
  }
  function drawPause(ctx) {
    var pg = ui.pause;
    ctx.fillStyle = 'rgba(6,7,13,0.62)'; ctx.fillRect(0, 0, W, H);
    if (pg.page === 'phone') { drawPhone(ctx); }
    else if (pg.page === 'credits') { drawCredits(ctx); }
    else if (pg.page === 'shop') { drawShop(ctx); }
    else if (pg.page === 'controls') { drawControlsPanel(ctx, 'CONTROLS', function () { pg.page = ui.settings.from === 'settings' ? 'settings' : 'pause'; ui.settings.from = null; }); }
    else if (pg.page === 'settings') { drawSettings(ctx, function () { pg.page = 'pause'; saveSettings(); }); }
    else if (pg.page === 'slots') { drawPauseSlots(ctx); }
    else {
      var items = PAUSE_ITEMS.map(function (it) { return it.id === 'mute' ? { id: it.id, label: 'MUTE: ' + (ui.muted ? 'ON' : 'OFF') } : it; });
      var rh = px(34), gap = px(6), pw = px(360), ph = px(70) + items.length * (rh + gap) + px(10), x = (W - pw) / 2, y = (H - ph) / 2;
      if (ph > H - px(20)) { rh = Math.max(px(22), Math.floor((H - px(100)) / items.length) - gap); ph = px(70) + items.length * (rh + gap) + px(10); y = px(10); }
      panel(ctx, x, y, pw, ph, px(14), 'rgba(10,12,24,0.94)', COL.line, 1.5);
      txt(ctx, 'PAUSED', W / 2, y + px(40), { font: F(28, '900', FONT_DISPLAY), color: COL.gold, align: 'center', outline: false });
      var g = game();
      txt(ctx, 'SLOT ' + (g ? g.activeSlot : 1) + '  ·  ' + fmtPlay(g ? g.playTime : 0) + ' played', W / 2, y + px(58), { font: F(10, 'bold'), color: COL.muted, align: 'center', outline: false });
      drawMenuList(ctx, items, pg, x + px(24), y + px(68), pw - px(48), { rowH: rh, gap: gap, activate: pauseActivate, font: F(rh < px(30) ? 13 : 15, 'bold') });
      txt(ctx, glyph('cancel') + ' resumes  ·  ' + glyph('map') + ' opens the map', W / 2, y + ph + px(18), { font: F(11), color: COL.muted, align: 'center' });
    }
    drawConfirm(ctx);
  }
  function drawPauseSlots(ctx) {
    var pg = ui.pause, pw = Math.min(px(900), W - safe.l - safe.r), x = (W - pw) / 2, y = Math.max(px(60), H * 0.18);
    txt(ctx, pg.slotMode === 'save' ? 'SAVE GAME' : 'LOAD GAME', x, y - px(12), { font: F(18, '900', FONT_DISPLAY), color: COL.gold, outline: false });
    txt(ctx, slotHint(), pw < px(560) ? x : x + pw, pw < px(560) ? y - px(36) : y - px(14), { font: F(10, 'bold'), color: COL.muted, align: pw < px(560) ? 'left' : 'right', outline: false, maxW: pw });   // on its own line when narrow (QA-B-FE-15)
    var ref = pg.slotRef || (pg.slotRef = {}); ref.sel = pg.slotSel; ref.btn = pg.slotBtn || 0;
    var r = slotCards(ctx, pg.slotMode, ref, x, y, pw, Math.min(px(260), H - y - px(90)), pauseSlotActivate);
    pg.slotSel = ref.sel;
    var bw = px(120), bx = x + pw - bw, by = r.bottom + px(16), fh = px(32);
    panel(ctx, bx, by, bw, fh, px(8), hovering(bx, by, bw, fh) ? 'rgba(255,63,164,0.25)' : 'rgba(10,12,24,0.9)', 'rgba(255,255,255,0.2)');
    txt(ctx, 'BACK', bx + bw / 2, by + px(21), { font: F(13, 'bold'), color: COL.ink, align: 'center', outline: false });
    hit(bx, by, bw, fh, function () { pg.page = 'pause'; }, 'slots-back');
    pg._slotInfo = r;
  }
  function pauseSlotsInput(In) {
    var pg = ui.pause, g = game();
    if (menuBack(In)) { pg.page = 'pause'; return true; }
    var slots = slotsOf(g), cur = slots[pg.slotSel], nb = slotButtons(pg.slotMode, cur);
    if (In.pressed('left')) { if (pg.slotBtn > 0) pg.slotBtn--; else { pg.slotSel = (pg.slotSel + 2) % 3; pg.slotBtn = 0; } sfx('ui', 0.2); }
    if (In.pressed('right')) { if (pg.slotBtn < nb - 1) pg.slotBtn++; else { pg.slotSel = (pg.slotSel + 1) % 3; pg.slotBtn = 0; } sfx('ui', 0.2); }
    if (In.pressed('forward')) { pg.slotSel = (pg.slotSel + 2) % 3; pg.slotBtn = 0; }
    if (menuDown(In)) { pg.slotSel = (pg.slotSel + 1) % 3; pg.slotBtn = 0; }
    if (In.pressed('secondary') && pg.slotMode === 'load' && slotUsed(cur)) pauseSlotActivate('delete', cur.slot);
    if (In.pressed('confirm')) {
      if (!cur) return true;
      if (pg.slotMode === 'save') pauseSlotActivate('save', cur.slot);
      else if (cur.corrupt) pauseSlotActivate(pg.slotBtn === 1 ? 'delete' : 'new', cur.slot);
      else if (cur.empty) pauseSlotActivate('new', cur.slot);
      else pauseSlotActivate(pg.slotBtn === 1 ? 'delete' : 'load', cur.slot);
    }
    return true;
  }
  // the phone / map page: tabs along the top, the full-screen map in the first
  function drawPhone(ctx) {
    var pg = ui.pause, full = pg.tab === 0;
    var pw = full ? W - safe.l - safe.r : Math.min(px(620), W - safe.l - safe.r), ph = full ? H - safe.t - safe.b : Math.min(px(620), H - safe.t - safe.b - px(10)), x = (W - pw) / 2, y = (H - ph) / 2;
    panel(ctx, x, y, pw, ph, px(full ? 12 : 22), 'rgba(12,14,26,0.96)', 'rgba(255,255,255,0.22)', px(2));
    var g = game(), p = player();
    txt(ctx, g ? U.fmtClock(g.time.clock) + '  ·  DAY ' + g.time.day : '', x + px(16), y + px(22), { font: F(11, 'bold'), color: COL.muted, outline: false });
    txt(ctx, p ? U.fmtMoney(p.money) + '   ' + fmtSubs(p.subs | 0) + ' subs' : '', x + pw - px(16), y + px(22), { font: F(11, 'bold'), color: COL.lime, align: 'right', outline: false });
    // tabs
    var tabW = Math.min(px(120), (pw - px(32)) / PHONE_TABS.length), tx0 = x + (pw - tabW * PHONE_TABS.length) / 2, ty = y + px(32);
    for (var i = 0; i < PHONE_TABS.length; i++) {
      var tx = tx0 + i * tabW, sel = i === pg.tab;
      panel(ctx, tx + px(2), ty, tabW - px(4), px(28), px(6), sel ? 'rgba(46,230,255,0.2)' : 'rgba(255,255,255,0.05)', sel ? COL.cyan : 'rgba(255,255,255,0.1)');
      txt(ctx, PHONE_TABS[i], tx + tabW / 2, ty + px(19), { font: F(portrait || tabW < px(80) ? 9 : 11, 'bold'), color: sel ? COL.ink : COL.muted, align: 'center', outline: false, maxW: tabW - px(8) });
      hit(tx, ty, tabW, px(28), (function (k) { return function () { pg.tab = k; pg.sel = 0; pg.scroll = 0; pg.row = 0; if (k === 0) mapCenterOnPlayer(); }; })(i), 'tab-' + i);
    }
    // a close control on every tab, for touch above all (QA-B-TCH-01)
    var clw = px(30), clx = x + pw - clw - px(8), cly = y + px(6);
    panel(ctx, clx, cly, clw, px(22), px(6), hovering(clx, cly, clw, px(22)) ? 'rgba(255,59,48,0.4)' : 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.3)');
    txt(ctx, '✕', clx + clw / 2, cly + px(16), { font: F(12, 'bold'), color: COL.ink, align: 'center', outline: false });
    hit(clx - px(6), cly - px(4), clw + px(12), px(30), phoneClose, 'phone-close');
    var cx = x + px(12), cy = ty + px(36), cw = pw - px(24), ch = ph - px(92);   // the list stops above the help line (QA-B-TCH-09)
    ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip();
    var tid = tabId();
    if (tid === 'MAP') drawBigMap(ctx, cx, cy, cw, ch);
    else if (tid === 'STORY') drawPhoneStory(ctx, cx, cy, cw, ch);
    else if (tid === 'MISSIONS') drawPhoneMissions(ctx, cx, cy, cw, ch);
    else if (tid === 'STOCKS') drawPhoneStocks(ctx, cx, cy, cw, ch);
    else if (tid === 'STATS') { ui.pause.rows = []; drawPhoneStats(ctx, cx, cy, cw, ch); }
    else if (tid === 'STRANDS') { ui.pause.rows = []; drawPhoneStrands(ctx, cx, cy, cw, ch); }
    else drawPhoneReplay(ctx, cx, cy, cw, ch);
    ctx.restore();
    var help = full ? (device() === 'gamepad' ? 'LS pans · RS / LT RT zoom · A waypoint · Y tabs · B close' : ui.touch.visible ? 'drag pans · pinch zooms · tap sets a waypoint' : 'drag / WASD pan · wheel / + - zoom · click sets a waypoint · Tab cycles tabs · M / Esc close') : device() === 'touch' ? 'swipe scrolls  ·  tap a tab  ·  ✕ closes' : device() === 'gamepad' ? 'LB RB tabs  ·  LS pick  ·  A choose  ·  B close' : '← → tabs   ·   ' + glyph('map') + ' / ' + glyph('cancel') + ' close';
    var hw = measure(ctx, help, F(10)) + px(24);
    if (full) panel(ctx, W / 2 - hw / 2, y + ph - px(22), hw, px(18), px(6), 'rgba(10,12,24,0.85)', null);
    txt(ctx, help, W / 2, y + ph - px(9), { font: F(10), color: COL.muted, align: 'center', outline: false, maxW: pw - px(20) });
  }
  // --------------------------------------------------------- the big map ----
  var MAP_LEGEND = [['mission', 'Mission', '#4aa8ff'], ['objective', 'Objective', COL.amber], ['gunshop', 'Both Sides Arms', COL.green], ['rampage', 'Ratio Rampage', COL.pink], ['race', 'Loop Race', COL.white], ['ramp', 'Stunt ramp', COL.pink], ['violation', 'HOA target', COL.cream], ['home', 'Home', COL.white], ['stranger', 'Stranger', '#c084fc'], ['waypoint', 'Waypoint', COL.white], ['dot', 'GPS route', COL.gold]];
  function mapCenterOnPlayer() { var p = player(); if (p) { ui.map.cx = p.x; ui.map.cz = p.z; } }
  function mapScale(w, h) { var bake = ensureMap(); if (!bake) return 1; return Math.min(w / bake.width, h / bake.height) * ui.map.zoom; }
  function mapClampCenter(w, h) {
    var bake = ensureMap(); if (!bake) return;
    var k = mapScale(w, h), halfW = w / 2 / k, halfH = h / 2 / k;
    var minX = Math.min(halfW, bake.width / 2), maxX = Math.max(bake.width - halfW, bake.width / 2);
    var minZ = Math.min(halfH, bake.height / 2), maxZ = Math.max(bake.height - halfH, bake.height / 2);
    ui.map.cx = U.clamp(ui.map.cx, minX, maxX); ui.map.cz = U.clamp(ui.map.cz, minZ, maxZ);
  }
  function mapZoomAt(factor, sx, sy) {
    var r = ui.map.rect; if (!r) { ui.map.zoom = U.clamp(ui.map.zoom * factor, 1, 4); return; }
    var k0 = mapScale(r.w, r.h), wx = ui.map.cx + (sx - (r.x + r.w / 2)) / k0, wz = ui.map.cz + (sy - (r.y + r.h / 2)) / k0;
    ui.map.zoom = U.clamp(ui.map.zoom * factor, 1, 4);
    var k1 = mapScale(r.w, r.h);
    ui.map.cx = wx - (sx - (r.x + r.w / 2)) / k1; ui.map.cz = wz - (sy - (r.y + r.h / 2)) / k1;
    mapClampCenter(r.w, r.h);
  }
  function mapToWorld(sx, sy) { var r = ui.map.rect; if (!r) return null; var k = mapScale(r.w, r.h); return { x: ui.map.cx + (sx - (r.x + r.w / 2)) / k, z: ui.map.cz + (sy - (r.y + r.h / 2)) / k }; }
  function mapTap(sx, sy) {
    var r = ui.map.rect; if (!r || sx < r.x || sx > r.x + r.w || sy < r.y || sy > r.y + r.h) return false;
    var w = mapToWorld(sx, sy); if (!w) return false;
    var Wd = GTP.World;
    if (Wd && (w.x < 0 || w.z < 0 || w.x > Wd.w * C.TILE || w.z > Wd.h * C.TILE)) return false;
    setWaypoint(w.x, w.z);
    return true;
  }
  function drawBigMap(ctx, x, y, w, h) {
    var bake = ensureMap(), p = player(), Wd = GTP.World; if (!bake || !p) return;
    var M = ui.map; M.rect = { x: x, y: y, w: w, h: h };
    if (!M.cx && !M.cz) mapCenterOnPlayer();
    mapClampCenter(w, h);
    var k = mapScale(w, h), ox = x + w / 2 - M.cx * k, oz = y + h / 2 - M.cz * k;
    var toS = function (wx, wz) { return { x: ox + wx * k, y: oz + wz * k }; };
    ctx.fillStyle = '#0d1424'; ctx.fillRect(x, y, w, h);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(bake, ox, oz, bake.width * k, bake.height * k);
    // district tints and names
    var ds = (Wd && Wd.districts) || [], i, s;
    var tint = { downtown: 'rgba(74,124,255,0.08)', campus: 'rgba(157,255,60,0.08)', suburbs: 'rgba(255,190,60,0.08)', hills: 'rgba(232,181,58,0.1)', marina: 'rgba(46,230,255,0.08)', industrial: 'rgba(255,122,32,0.08)', strip: 'rgba(255,63,164,0.08)', capitol: 'rgba(238,241,251,0.08)', uptown: 'rgba(181,107,255,0.09)', airport: 'rgba(143,151,179,0.1)', port: 'rgba(255,59,48,0.07)' };
    for (i = 0; i < ds.length; i++) {
      var d = ds[i], a = toS(d.px, d.pz);
      ctx.fillStyle = tint[d.style] || tint[d.id] || 'rgba(255,255,255,0.05)'; ctx.fillRect(a.x, a.y, d.pw * k, d.ph * k);
    }
    // labels are placed with a collision test: districts first, then missions, landmarks and markers (QA-B-HUD-06)
    var placed = [], distLabels = [];
    var place = function (text, cx0, cy0, font) { ctx.font = font; var tw0 = ctx.measureText(text).width + px(6), th0 = px(12), r0 = { x: cx0 - tw0 / 2, y: cy0 - th0, w: tw0, h: th0 + px(2) }; for (var q = 0; q < placed.length; q++) { var o = placed[q]; if (r0.x < o.x + o.w && r0.x + r0.w > o.x && r0.y < o.y + o.h && r0.y + r0.h > o.y) return false; } placed.push(r0); return true; };
    for (i = 0; i < ds.length; i++) { s = toS(ds[i].cx, ds[i].cz); var dn = String(ds[i].name || ds[i].id).toUpperCase(), df = F(M.zoom >= 2 ? 13 : 10, '900', FONT_DISPLAY); if (place(dn, s.x, s.y, df)) distLabels.push([dn, s.x, s.y, df]); }
    var shopMarks = allMarkers().filter(function (mk0) { return mk0.kind === 'shop'; });
    // landmark icons by kind, labels from 2x (3x on a narrow map, where they would pile up)
    var lms = (Wd && Wd.landmarks) || [], labelZoom = w < px(600) ? 3 : 2;
    for (i = 0; i < lms.length; i++) {
      var lm = lms[i]; s = toS(lm.x, lm.z);
      if (s.x < x - px(20) || s.x > x + w + px(20) || s.y < y - px(20) || s.y > y + h + px(20)) continue;
      if (lm.kind === 'gunshop' && shopMarks.some(function (mk0) { return U.dist2d(mk0.x, mk0.z, lm.x, lm.z) < 40; })) continue;   // the shop marker draws it once
      var size = px(M.zoom >= 2 ? 11 : 8);
      ctx.fillStyle = 'rgba(8,10,20,0.7)'; ctx.beginPath(); ctx.arc(s.x, s.y, size * 0.75, 0, Math.PI * 2); ctx.fill();
      drawKindIcon(ctx, lm.kind, s.x, s.y, size, lm.kind === 'gunshop' ? COL.green : 'rgba(238,241,251,0.9)');
      if (M.zoom >= labelZoom) { var ll = landmarkLabel(lm); if (place(ll, s.x, s.y + size + px(10), F(9, 'bold'))) txt(ctx, ll, s.x, s.y + size + px(10), { font: F(9, 'bold'), color: COL.ink, align: 'center', lw: 2, maxW: px(140) }); }
    }
    // the route and the waypoint
    var wp = waypoint();
    if (wp && M.route && M.route.length > 1) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = px(2.5); ctx.setLineDash([px(6), px(4)]); ctx.beginPath();
      s = toS(p.x, p.z); ctx.moveTo(s.x, s.y);
      for (i = 0; i < M.route.length; i++) { s = toS(M.route[i].x, M.route[i].z); ctx.lineTo(s.x, s.y); }
      s = toS(wp.x, wp.z); ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.restore();
    }
    drawGpsBigMap(ctx, toS);
    // markers (missions and objectives last, on top)
    var marks = markersByLayer();
    for (i = 0; i < marks.length; i++) {
      var mk = marks[i]; s = toS(mk.x, mk.z);
      if (s.x < x || s.x > x + w || s.y < y || s.y > y + h) continue;
      drawMarkerIcon(ctx, mk, s.x, s.y, px(mk.kind === 'objective' || mk.kind === 'mission' ? 12 : 11));
      if (mk.title && (mk.kind === 'mission' || mk.kind === 'objective' || M.zoom >= labelZoom) && (mk.kind === 'objective' || place(mk.title, s.x, s.y - px(11), F(9, 'bold')))) txt(ctx, mk.title, s.x, s.y - px(11), { font: F(9, 'bold'), color: mk.kind === 'objective' ? COL.amber : '#bfe3ff', align: 'center', lw: 2, maxW: px(160) });
    }
    if (wp) { s = toS(wp.x, wp.z); drawKindIcon(ctx, 'waypoint', s.x, s.y - px(6), px(20), COL.white); txt(ctx, Math.round(U.dist2d(p.x, p.z, wp.x, wp.z)) + ' m', s.x, s.y - px(20), { font: F(9, 'bold'), color: COL.white, align: 'center', lw: 2 }); }
    for (i = 0; i < distLabels.length; i++) txt(ctx, distLabels[i][0], distLabels[i][1], distLabels[i][2], { font: distLabels[i][3], color: COL.gold, align: 'center', lw: px(3) });
    // the pad's map cursor (QA-B-HUD-08)
    if (device() === 'gamepad' && M.cursor) { var cxp = x + M.cursor.x * w, cyp = y + M.cursor.y * h; ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = px(2); ctx.beginPath(); ctx.arc(cxp, cyp, px(9), 0, Math.PI * 2); ctx.moveTo(cxp - px(15), cyp); ctx.lineTo(cxp - px(5), cyp); ctx.moveTo(cxp + px(5), cyp); ctx.lineTo(cxp + px(15), cyp); ctx.moveTo(cxp, cyp - px(15)); ctx.lineTo(cxp, cyp - px(5)); ctx.moveTo(cxp, cyp + px(5)); ctx.lineTo(cxp, cyp + px(15)); ctx.stroke(); ctx.restore(); }
    // the player arrow
    s = toS(p.x, p.z);
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(-(p.yaw || 0));
    ctx.fillStyle = COL.ink; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -px(9)); ctx.lineTo(px(6.5), px(7)); ctx.lineTo(0, px(3.5)); ctx.lineTo(-px(6.5), px(7)); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    // the legend panel bottom-left, the location line and the zoom readout
    var legend = portrait ? MAP_LEGEND.slice(0, 5) : MAP_LEGEND, lw = px(150), lh = px(14) + legend.length * px(17), lx = x + px(8), ly = y + h - lh - px(8);
    panel(ctx, lx, ly, lw, lh, px(8), 'rgba(10,12,24,0.85)', 'rgba(255,255,255,0.15)');
    for (i = 0; i < legend.length; i++) { drawKindIcon(ctx, legend[i][0] === 'mission' || legend[i][0] === 'objective' ? 'dot' : legend[i][0], lx + px(14), ly + px(14) + i * px(17), px(11), legend[i][2]); txt(ctx, legend[i][1], lx + px(28), ly + px(18) + i * px(17), { font: F(9, 'bold'), color: COL.ink, outline: false }); }
    var dAt = Wd.districtAt ? Wd.districtAt(p.x, p.z) : null, st = Wd.streetAt ? Wd.streetAt(p.x, p.z, p.y) : null;
    var loc = (dAt ? dAt.name : 'Open water') + (st ? '  ·  ' + st : ''), lf = F(11, 'bold'), locW = measure(ctx, loc, lf) + px(20);
    panel(ctx, x + w - locW - px(8), y + px(8), locW, px(24), px(6), 'rgba(10,12,24,0.85)', 'rgba(255,255,255,0.15)');
    txt(ctx, loc, x + w - px(18), y + px(24), { font: lf, color: COL.ink, align: 'right', outline: false });
    panel(ctx, x + w - px(60), y + h - px(32), px(52), px(24), px(6), 'rgba(10,12,24,0.85)', 'rgba(255,255,255,0.15)');
    txt(ctx, M.zoom.toFixed(1) + 'x', x + w - px(34), y + h - px(16), { font: F(11, 'bold'), color: COL.cyan, align: 'center', outline: false });
    // + / - buttons for touch and mouse
    var bx = x + w - px(60), by = y + h - px(64);
    panel(ctx, bx, by, px(24), px(24), px(6), 'rgba(10,12,24,0.85)', 'rgba(255,255,255,0.25)'); txt(ctx, '-', bx + px(12), by + px(17), { font: F(14, 'bold'), color: COL.ink, align: 'center', outline: false });
    panel(ctx, bx + px(28), by, px(24), px(24), px(6), 'rgba(10,12,24,0.85)', 'rgba(255,255,255,0.25)'); txt(ctx, '+', bx + px(40), by + px(17), { font: F(14, 'bold'), color: COL.ink, align: 'center', outline: false });
    hit(bx, by, px(24), px(24), function () { mapZoomAt(1 / 1.5, x + w / 2, y + h / 2); }, 'map-zoom-out');
    hit(bx + px(28), by, px(24), px(24), function () { mapZoomAt(1.5, x + w / 2, y + h / 2); }, 'map-zoom-in');
    var cbw = px(110);
    panel(ctx, x + w - px(8) - cbw, y + px(40), cbw, px(22), px(6), 'rgba(10,12,24,0.85)', 'rgba(255,255,255,0.2)');
    txt(ctx, 'CENTRE ON ME', x + w - px(8) - cbw / 2, y + px(55), { font: F(9, 'bold'), color: COL.ink, align: 'center', outline: false });
    hit(x + w - px(8) - cbw, y + px(40), cbw, px(22), function () { mapCenterOnPlayer(); }, 'map-centre');
    if (wp) { panel(ctx, x + w - px(8) - cbw, y + px(66), cbw, px(22), px(6), 'rgba(10,12,24,0.85)', 'rgba(255,255,255,0.2)'); txt(ctx, 'CLEAR WAYPOINT', x + w - px(8) - cbw / 2, y + px(81), { font: F(9, 'bold'), color: COL.ink, align: 'center', outline: false }); hit(x + w - px(8) - cbw, y + px(66), cbw, px(22), function () { setWaypoint(wp.x, wp.z); }, 'map-clear'); }
  }
  // the map's own input: pan (drag / WASD / left stick), zoom (wheel / + - / triggers / right stick / pinch), click = waypoint
  function mapInput(In, dt) {
    var M = ui.map, r = M.rect; if (!r) return;
    var k = mapScale(r.w, r.h), pan = px(260) / k * dt;
    if (In.down('left')) M.cx -= pan; if (In.down('right')) M.cx += pan;
    if (In.down('forward')) M.cz -= pan; if (In.down('back') && !In.pressed('cancel')) M.cz += pan;
    var pad = In.gamepad;
    // keys and pad zoom around the player (or the pad cursor), not the city centre (QA-B-HUD-07)
    var p0 = player(), focus = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    if (p0) { var k0 = mapScale(r.w, r.h), fx0 = r.x + r.w / 2 + (p0.x - M.cx) * k0, fy0 = r.y + r.h / 2 + (p0.z - M.cz) * k0; if (fx0 > r.x && fx0 < r.x + r.w && fy0 > r.y && fy0 < r.y + r.h) focus = { x: fx0, y: fy0 }; }
    var pad = In.gamepad;
    if (pad && pad.index >= 0 && In.gamepadEnabled) {
      // the pad moves a cursor; the map pans when the cursor pushes an edge (QA-B-HUD-08)
      if (!M.cursor) M.cursor = { x: 0.5, y: 0.5 };
      M.cursor.x += pad.lx * dt * 0.6; M.cursor.y += pad.ly * dt * 0.6 * (r.w / r.h);
      if (M.cursor.x < 0.05) { M.cx -= pan * 1.5; M.cursor.x = 0.05; } if (M.cursor.x > 0.95) { M.cx += pan * 1.5; M.cursor.x = 0.95; }
      if (M.cursor.y < 0.05) { M.cz -= pan * 1.5; M.cursor.y = 0.05; } if (M.cursor.y > 0.95) { M.cz += pan * 1.5; M.cursor.y = 0.95; }
      focus = { x: r.x + M.cursor.x * r.w, y: r.y + M.cursor.y * r.h };
      if (pad.ry) mapZoomAt(1 - pad.ry * 0.04, focus.x, focus.y);
    }
    if (In.wheelDelta) mapZoomAt(In.wheelDelta < 0 ? 1.15 : 1 / 1.15, In.mouse.x, In.mouse.y);
    if (In.pressed('zoomIn')) mapZoomAt(1.5, focus.x, focus.y);
    if (In.pressed('zoomOut')) mapZoomAt(1 / 1.5, focus.x, focus.y);
    if (In.pressed('waypoint') || (In.pressed('confirm') && device() === 'gamepad')) {
      var wpt = M.cursor && device() === 'gamepad' ? mapToWorld(r.x + M.cursor.x * r.w, r.y + M.cursor.y * r.h) : { x: M.cx, z: M.cz };
      if (wpt) setWaypoint(wpt.x, wpt.z);
    }
    // mouse: a press starts a drag, a release without much movement is a tap
    var m = In.mouse;
    if (m.down && !M.drag) M.drag = { x: m.x, y: m.y, sx: m.x, sy: m.y, moved: 0 };
    else if (m.down && M.drag) { var dx = m.x - M.drag.x, dy = m.y - M.drag.y; M.drag.moved += Math.abs(dx) + Math.abs(dy); M.cx -= dx / k; M.cz -= dy / k; M.drag.x = m.x; M.drag.y = m.y; }
    else if (!m.down && M.drag) { var dr = M.drag; M.drag = null; if (dr.moved < px(8)) { if (!pointerTap(dr.sx, dr.sy)) mapTap(dr.sx, dr.sy); } }
    mapClampCenter(r.w, r.h);
  }
  function drawPhoneMissions(ctx, x, y, w, h) {
    var Ms = GTP.Missions, st = Ms && Ms.state, all = Ms && Ms.allMissions ? Ms.allMissions() : ((GTP.Content && GTP.Content.missions) || []);
    var rows = [], i, lf = Ms && Ms.lastFail ? Ms.lastFail() : null, canRetry = retryOffer();
    if (st && st.active) rows.push({ kind: 'active', title: st.mission ? st.mission.title : st.active, sub: st.objectiveText || 'In progress' });
    if (canRetry && lf) rows.push({ kind: 'retry', title: lf.m.title, sub: (lf.text || 'Context stamped') + '  ·  RETRY from the checkpoint', id: lf.id });
    var av = Ms && Ms.available ? Ms.available() : [];
    // the strangers' next missions (GTP.Strangers.summary(): {id, name, giver, state, done, total, next}) are purple rows
    // with a GPS button; the story's are blue
    var Sg = GTP.Strangers, strands = {}, mk0 = null;
    try { (Sg && Sg.summary ? Sg.summary() : []).forEach(function (x2) { if (x2) strands[x2.id] = x2; }); } catch (e) { strands = {}; }
    for (i = 0; i < av.length; i++) {
      var lm = GTP.World.landmark(av[i].marker), sid = strandOf(av[i].id), where = lm ? landmarkLabel(lm) : av[i].marker;
      if (sid) {
        var sx = strands[sid] || {}; mk0 = null; allMarkers().forEach(function (m2) { if (m2.missionId === av[i].id) mk0 = m2; });
        rows.push({ kind: 'stranger', title: '? ' + av[i].title, sub: (sx.name ? sx.name + ' ' + ((sx.done | 0) + 1) + '/' + (sx.total || 1) + '  ·  ' : '') + castName(av[i].giver) + '  ·  ' + where, x: mk0 ? mk0.x : (lm && lm.door ? lm.door.x : null), z: mk0 ? mk0.z : (lm && lm.door ? lm.door.z : null), id: av[i].id });
      } else rows.push({ kind: 'avail', title: av[i].title, sub: castName(av[i].giver) + '  ·  ' + where + '  ·  ' + U.fmtMoney(av[i].reward || 0) });
    }
    for (i = 0; i < all.length; i++) if (st && st.completed && st.completed.has(all[i].id)) { var bt = Ms.bestTime ? Ms.bestTime(all[i].id) : null; rows.push({ kind: 'done', title: all[i].title, sub: 'Completed  ·  ' + U.fmtMoney(all[i].reward || 0) + (bt != null ? '  ·  best ' + U.fmtTime(bt) : ''), id: all[i].id }); }
    var done = st && st.completed ? st.completed.size : 0;
    txt(ctx, 'MISSIONS  ' + done + ' / ' + all.length, x, y + px(14), { font: F(12, 'bold'), color: COL.cyan, outline: false });
    var ry = y + px(26) - ui.pause.scroll, rh = px(44);
    if (!rows.length) txt(ctx, 'Nothing booked. Find a blue light.', x, ry + px(20), { font: F(13, '', FONT_TEXT), color: COL.muted, outline: false });
    for (i = 0; i < rows.length; i++) {
      var r = rows[i], col = r.kind === 'active' ? COL.amber : r.kind === 'retry' ? COL.red : r.kind === 'avail' ? '#4aa8ff' : r.kind === 'stranger' ? '#c084fc' : COL.lime, sel = ui.pause.row === i;
      if (ry + rh > y && ry < y + h) {
        if (hovering(x, ry, w, rh - px(6))) { ui.pause.row = i; sel = true; }
        panel(ctx, x, ry, w, rh - px(6), px(8), sel ? hexA(col, 0.14) : 'rgba(255,255,255,0.05)', sel ? col : hexA(col, 0.5), sel ? 1.5 : 1);
        ctx.fillStyle = col; rr(ctx, x, ry, px(5), rh - px(6), px(2)); ctx.fill();
        txt(ctx, (r.kind === 'done' ? '✓  ' : r.kind === 'active' ? '▶  ' : r.kind === 'retry' ? '↻  ' : '') + r.title, x + px(14), ry + px(17), { font: F(13, 'bold'), color: COL.ink, outline: false, maxW: w - px(120) });
        txt(ctx, r.sub, x + px(14), ry + px(32), { font: F(10), color: COL.muted, outline: false, maxW: w - px(120) });
        var bl = r.kind === 'active' ? 'ABORT' : r.kind === 'retry' ? 'RETRY' : r.kind === 'done' ? 'REPLAY' : r.kind === 'stranger' && r.x != null ? 'GPS' : null;
        if (bl) {
          var bw = px(78), bx = x + w - bw - px(8), by = ry + px(8), bcol = r.kind === 'active' ? COL.red : r.kind === 'retry' ? COL.lime : COL.pink;
          panel(ctx, bx, by, bw, px(22), px(6), hovering(bx, by, bw, px(22)) || sel ? hexA(bcol, 0.35) : hexA(bcol, 0.15), bcol, 1.2);
          txt(ctx, bl, bx + bw / 2, by + px(15), { font: F(9, 'bold'), color: COL.ink, align: 'center', outline: false });
          hit(bx, by, bw, px(22), (function (row) { return function () { missionRowActivate(row); }; })(r), 'mrow-' + i);
        }
      }
      ry += rh;
    }
    ui.pause.rows = rows;
  }
  function missionRowActivate(r) {
    var Ms = GTP.Missions; if (!Ms || !r) return;
    sfx('ui', 0.4);
    if (r.kind === 'active') { abortMission(); return; }
    if (r.kind === 'gps') { setStoryGps(r.card); return; }
    if (r.kind === 'stranger') { if (r.x != null) { GTP.Events.emit('gps:set', { x: r.x, z: r.z, label: r.title.replace(/^\? /, ''), kind: 'stranger' }); toast('GPS set: ' + r.title.replace(/^\? /, '')); } return; }
    if (r.kind === 'stock') { stockTrade(r.stock, 10); return; }
    if (r.kind === 'retry') { closePause(); if (retryOffer()) Ms.retry(); return; }
    // REPLAY starts from 'playing' so Missions.start plays the intro cutscene (QA-C1-09); a refusal reopens the phone
    if (r.kind === 'done' && Ms.replay) {
      var tab = ui.pause.tab;
      closePause();
      var ok = Ms.replay(r.id);
      if (ok) toast('REPLAY: ' + r.title + '. Rewards off, best time on.');
      else { openPause('phone'); ui.pause.tab = tab; toast('Finish what is running first.'); }
    }
  }
  function abortMission() {
    var Ms = GTP.Missions; if (!Ms || !Ms.state || !Ms.state.active) return;
    // never without asking (QA-B-TCH-04: a stray confirm on another tab used to abandon the mission)
    askConfirm({ title: 'ABANDON THE MISSION?', lines: ['Back to the marker. The checkpoint is gone.'], yes: 'ABANDON', no: 'BACK', danger: true, onYes: function () { if (Ms.state && Ms.state.active) Ms.abort(); closePause(); } });
  }
  function phoneClose() { var pg = ui.pause; if (pg.phoneFrom === 'pause') { pg.page = 'pause'; pg.phoneFrom = null; } else closePause(); }
  function drawPhoneStats(ctx, x, y, w, h) {
    var p = player(), g = game(), st = (p && p.stats) || {}, Ms = GTP.Missions;
    var wl = (GTP.AI && GTP.AI.wanted) ? GTP.AI.wanted.level : 0, subs = Ms && Ms.subscribers ? Ms.subscribers() : null;
    var rows = hasStatsPage() ? [['Subscribers', (subs ? fmtSubs(subs.count) + '  ·  ' + subs.name : '0')], ['Day / time', g ? 'Day ' + g.time.day + ', ' + U.fmtClock(g.time.clock) : ''], ['Wanted', wl ? wl + ' star' + (wl > 1 ? 's' : '') : 'clean']] : [   // the systems' page carries the career numbers
      ['Cash', p ? U.fmtMoney(p.money) : '$0'], ['Subscribers', (subs ? fmtSubs(subs.count) + '  ·  ' + subs.name : '0')], ['Missions passed', String(Ms && Ms.state ? Ms.state.completed.size : 0)],
      ['Retries', String(st.retries || 0)], ['Play time', fmtPlay(g ? g.playTime : 0)], ['Day / time', g ? 'Day ' + g.time.day + ', ' + U.fmtClock(g.time.clock) : ''], ['Wanted', wl ? wl + ' star' + (wl > 1 ? 's' : '') : 'clean'],
      ['Distance on foot', Math.round(st.distance || 0) + ' m'], ['Distance driven', Math.round(st.distanceDriven || 0) + ' m'],
      ['Vehicles borrowed', String(st.vehiclesStolen || 0)], ['Crashes', String(st.crashes || 0)], ['Peds bumped', String(st.pedsHit || 0)],
      ['Shots / hits', (st.shots || 0) + ' / ' + Math.min(st.hits || 0, st.shots || 0) + (st.shots ? '  ·  ' + Math.round(Math.min(1, (st.hits || 0) / st.shots) * 100) + '%' : '')], ['Head shots', String(st.headshots != null ? st.headshots : ui.headshots)], ['Hecklers floored', String(st.knockdowns || 0)], ['Debates shouted', String(st.debating || 0)],
      ['Spent at Both Sides Arms', U.fmtMoney(st.spent || 0)], ['Honks', String(st.honking || 0)], ['Times ratio\'d', String(st.deaths || 0)], ['Times deplatformed', String(st.busted || 0)], ['Minds changed', '0']
    ];
    txt(ctx, 'STATS', x, y + px(14), { font: F(12, 'bold'), color: COL.cyan, outline: false });
    var rh = px(22), ry = y + px(36) - ui.pause.scroll;
    for (var i = 0; i < rows.length; i++) {
      if (ry > y - rh && ry < y + h + rh) {
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0)'; ctx.fillRect(x, ry - px(15), w, rh);
        txt(ctx, rows[i][0], x + px(8), ry, { font: F(12, '', FONT_TEXT), color: COL.muted, outline: false });
        txt(ctx, rows[i][1], x + w - px(8), ry, { font: F(12, 'bold'), color: COL.ink, align: 'right', outline: false });
      }
      ry += rh;
    }
    var sign = rozSign();
    if (ry + px(10) > y && ry < y + h) txt(ctx, 'Roz\'s sign today: ' + sign, x + px(8), ry + px(10), { font: F(10), color: COL.amber, outline: false, maxW: w - px(16) });
    ry = drawStatsExtras(ctx, x, y, w, h, ry + px(20));
    ui.pause.contentH = ry + ui.pause.scroll - y;
  }
  // the STRANDS tab: the subscribers tier card, every strand's progress line, the memo count (per district after 25)
  function drawPhoneStrands(ctx, x, y, w, h) {
    var Ms = GTP.Missions, St = GTP.Strands, subs = Ms && Ms.subscribers ? Ms.subscribers() : null, ry = y - ui.pause.scroll;
    txt(ctx, 'STRANDS', x, ry + px(14), { font: F(12, 'bold'), color: COL.cyan, outline: false });
    if (subs) {
      var X = expansion(), tiers = X.subscriberTiers || [], cur = tiers[subs.tier] || {}, ph = px(62);
      panel(ctx, x, ry + px(24), w, ph, px(10), 'rgba(255,63,164,0.1)', 'rgba(255,63,164,0.5)');
      txt(ctx, 'SUBSCRIBERS  ' + fmtSubs(subs.count), x + px(14), ry + px(44), { font: F(14, '900', FONT_DISPLAY), color: COL.pink, outline: false });
      txt(ctx, 'TIER ' + subs.tier + '  ·  ' + String(subs.name || '').toUpperCase(), x + w - px(14), ry + px(44), { font: F(11, 'bold'), color: COL.ink, align: 'right', outline: false });
      txt(ctx, cur.perkText || 'Nobody is listening. Keep talking.', x + px(14), ry + px(60), { font: F(10, '', FONT_TEXT), color: COL.muted, outline: false, maxW: w - px(28) });
      if (subs.next) {
        var k = U.clamp((subs.count - (cur.subs || 0)) / Math.max(1, subs.next.subs - (cur.subs || 0)), 0, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, x + px(14), ry + px(70), w - px(28), px(6), px(3)); ctx.fill();
        ctx.fillStyle = COL.pink; rr(ctx, x + px(14), ry + px(70), (w - px(28)) * k, px(6), px(3)); ctx.fill();
        txt(ctx, 'next: ' + subs.next.name + ' at ' + fmtSubs(subs.next.subs), x + w - px(14), ry + px(68), { font: F(8, 'bold'), color: COL.muted, align: 'right', outline: false });
      }
      ry += ph + px(8);
    }
    var list = [];
    try { list = St && St.summary ? St.summary() : []; } catch (e) { list = []; }
    var memos = null; try { memos = St && St.memos ? St.memos() : null; } catch (e) { memos = null; }
    var active = St && St.active ? St.active() : null, rh = px(38);
    ry += px(30);
    for (var i = 0; i < list.length; i++) {
      var s = list[i], on = s.id === active;
      if (ry + rh > y && ry < y + h) {
        panel(ctx, x, ry, w, rh - px(6), px(8), on ? 'rgba(255,63,164,0.14)' : 'rgba(255,255,255,0.05)', on ? COL.pink : 'rgba(255,255,255,0.12)');
        drawKindIcon(ctx, s.id === 'loop_races' ? 'race' : s.id === 'ratio_rampages' ? 'rampage' : s.id === 'stunt_jumps' ? 'ramp' : s.id === 'hoa_patrol' ? 'violation' : s.id === 'monday_memos' ? 'dot' : 'home', x + px(16), ry + px(16), px(12), on ? COL.pink : COL.muted);
        txt(ctx, s.title.toUpperCase() + (on ? '  ·  ACTIVE' : ''), x + px(32), ry + px(14), { font: F(11, 'bold'), color: COL.ink, outline: false, maxW: w - px(44) });
        txt(ctx, s.line, x + px(32), ry + px(27), { font: F(10), color: COL.muted, outline: false, maxW: w - px(44) });
      }
      ry += rh;
    }
    if (memos && memos.collected.length >= 25 && memos.byDistrict) {
      txt(ctx, 'MEMOS BY DISTRICT', x, ry + px(12), { font: F(10, 'bold'), color: COL.cyan, outline: false }); ry += px(18);
      var keys = Object.keys(memos.byDistrict), col = 0;
      for (i = 0; i < keys.length; i++) { var bd = memos.byDistrict[keys[i]], line = keys[i] + ' ' + (bd && bd.collected != null ? bd.collected + '/' + bd.total : bd); txt(ctx, line, x + px(8) + (col % 2) * w / 2, ry + px(12), { font: F(10), color: COL.muted, outline: false, maxW: w / 2 - px(12) }); if (col % 2) ry += px(16); col++; }
    }
    void h;
  }
  // the REPLAY tab: completed missions with their best time, REPLAY starts one from its door
  function drawPhoneReplay(ctx, x, y, w, h) {
    var Ms = GTP.Missions, list = [];
    try { list = Ms && Ms.completedList ? Ms.completedList() : []; } catch (e) { list = []; }
    txt(ctx, 'REPLAY  ·  best times', x, y + px(14), { font: F(12, 'bold'), color: COL.cyan, outline: false });
    var ry = y + px(26) - ui.pause.scroll, rh = px(40), rows = [];
    if (!list.length) txt(ctx, 'Nothing to replay yet. Pass a mission first.', x, ry + px(20), { font: F(13, '', FONT_TEXT), color: COL.muted, outline: false });
    for (var i = 0; i < list.length; i++) {
      var m = list[i], sel = ui.pause.row === i;
      rows.push({ kind: 'done', id: m.id, title: m.title });
      if (ry + rh > y && ry < y + h) {
        if (hovering(x, ry, w, rh - px(6))) { ui.pause.row = i; sel = true; }
        panel(ctx, x, ry, w, rh - px(6), px(8), sel ? 'rgba(255,63,164,0.14)' : 'rgba(255,255,255,0.05)', sel ? COL.pink : 'rgba(255,255,255,0.12)', sel ? 1.5 : 1);
        txt(ctx, (m.act ? 'ACT ' + m.act + '  ' : '') + m.title, x + px(14), ry + px(16), { font: F(12, 'bold'), color: COL.ink, outline: false, maxW: w - px(200) });
        txt(ctx, m.best != null ? 'BEST ' + U.fmtTime(m.best) : 'no time yet', x + px(14), ry + px(29), { font: F(10), color: m.best != null ? COL.amber : COL.muted, outline: false });
        if (m.replayable !== false) {
          var bw = px(78), bx = x + w - bw - px(8), by = ry + px(6);
          panel(ctx, bx, by, bw, px(22), px(6), hovering(bx, by, bw, px(22)) || sel ? 'rgba(255,63,164,0.35)' : 'rgba(255,63,164,0.15)', COL.pink, 1.2);
          txt(ctx, 'REPLAY', bx + bw / 2, by + px(15), { font: F(9, 'bold'), color: COL.ink, align: 'center', outline: false });
          hit(bx, by, bw, px(22), (function (row) { return function () { missionRowActivate(row); }; })(rows[i]), 'replay-' + i);
        }
      }
      ry += rh;
    }
    ui.pause.rows = rows;
  }

  // ------------------------------------------------------------- the shop ----
  function shopTabs() { var X = expansion(), tabs = ((X.shop && X.shop.tabs) || ['WEAPONS', 'AMMO', 'GEAR']).slice(); if (ui.shop.store && ui.shop.store.flagship) tabs.push((X.shop && X.shop.flagshipTab) || 'RANGE'); return tabs; }
  function shopItemsFor(tab) { var CB = GTP.Combat; if (!CB || !CB.shop || !CB.shop.items) return []; try { return CB.shop.items(String(tab).toLowerCase()); } catch (e) { return []; } }
  // The shop page stays in Game state 'playing' as a modal overlay: the player's control is off and the UI consumes the
  // input, the world ticks on (Missions only ticks objectives in 'playing', so a `shop` objective completes at the counter).
  function openShop(store, lm) {
    var g = game(), p = player(); if (!g || g.state !== 'playing' || ui.shopOpen) return;
    ui.shop.store = store || null; ui.shop.lm = lm || null; ui.shop.tab = 0; ui.shop.sel = 0; ui.shop.turn = 0; ui.shop.msg = null; ui.shop.msgT = 0;
    var X = expansion(), barks = X.shop && X.shop.barks;
    if (barks && barks.door && barks.door.length) ui.shop.bark = barks.door[(urng ? Math.floor(urng.random() * barks.door.length) : 0) % barks.door.length];
    else ui.shop.bark = 'Both Sides Arms. Which side?';
    ui.shopOpen = true;
    if (p) { try { if (p.stop) p.stop(); } catch (e) { /* optional */ } p.aiming = false; p.lockTarget = null; p.controlEnabled = false; }
    if (GTP.Input && GTP.Input.releasePointerLock) GTP.Input.releasePointerLock();
  }
  // restore = false keeps the player's control lock (a cutscene took it over)
  function leaveShopPage(restore) {
    if (!ui.shopOpen) return;
    ui.shopOpen = false;
    var p = player(); if (p && restore !== false) p.controlEnabled = true;
  }
  function closeShop() {
    var CB = GTP.Combat;
    leaveShopPage(true);
    if (CB && CB.shop && CB.shop.state.open) { try { CB.shop.close(); } catch (e) { /* optional */ } }
  }
  function shopBuy(id) {
    var CB = GTP.Combat, sh = ui.shop, X = expansion(), barks = (X.shop && X.shop.barks) || {};
    if (!CB || !CB.shop || !CB.shop.buy) return;
    var res = null; try { res = CB.shop.buy(id); } catch (e) { U.reportError(e, 'ui.shop.buy'); return; }
    var pick = function (list, dflt) { return list && list.length ? list[(urng ? Math.floor(urng.random() * list.length) : 0) % list.length] : dflt; };
    if (res && res.ok) { sh.msg = { text: 'SOLD: ' + (res.item ? res.item.name : id) + '  -' + U.fmtMoney(res.price), color: COL.lime }; sh.bark = pick(barks.sale, 'Sold.'); sh.flash = 1; sfx('cash', 0.6); }
    else if (res && res.reason === 'funds') { sh.msg = { text: 'NOT ENOUGH CASH. Need ' + U.fmtMoney(res.need || 0) + ' more.', color: COL.red }; sh.bark = pick(barks.funds, 'That\'s the price.'); sfx('fail', 0.3); }
    else if (res && res.reason === 'locked') { sh.msg = { text: 'LOCKED. ' + ((X.shop && X.shop.lockFormat) || 'Unlocks after: {mission}').replace('{mission}', res.lockedBy || 'the story'), color: COL.amber }; sh.bark = pick(barks.locked, 'Not yet.'); sfx('ui', 0.2); }
    else if (res && res.reason === 'owned') { sh.msg = { text: 'Already on your back. Buy ammo instead.', color: COL.muted }; sfx('ui', 0.2); }
    else if (res && res.reason === 'full') { sh.msg = { text: 'You are full up. Nothing to buy that for.', color: COL.muted }; sfx('ui', 0.2); }   // QA-B-TCH-13
    else if (res && res.reason === 'notOwned') { sh.msg = { text: 'Buy the weapon first.', color: COL.amber }; sfx('ui', 0.2); }
    else if (res && res.reason === 'flagship') { sh.msg = { text: 'The range is at the flagship on the Strip.', color: COL.muted }; sfx('ui', 0.2); }
    else { sh.msg = { text: 'No sale.', color: COL.muted }; }
    sh.msgT = 3;
  }
  function drawShop(ctx) {
    var sh = ui.shop, CB = GTP.Combat, p = player(), X = expansion(), shopC = X.shop || {};
    var tabs = shopTabs(), items = shopItemsFor(tabs[sh.tab] || 'WEAPONS');
    if (sh.sel >= items.length) sh.sel = Math.max(0, items.length - 1);
    var pw = Math.min(px(980), W - safe.l - safe.r), ph = Math.min(px(620), H - safe.t - safe.b - px(6)), x = (W - pw) / 2, y = (H - ph) / 2, narrow = pw < px(640);
    panel(ctx, x, y, pw, ph, px(14), 'rgba(10,12,24,0.96)', 'rgba(63,210,127,0.5)', px(2));
    // header: the store name, slogan, money
    txt(ctx, (sh.store && sh.store.name ? sh.store.name : (shopC.name || 'Both Sides Arms')).toUpperCase(), x + px(20), y + px(32), { font: F(20, '900', FONT_DISPLAY), color: COL.green, outline: false, maxW: pw * 0.6 });
    txt(ctx, shopC.slogan || 'We arm both sides. That\'s balance.', x + px(20), y + px(50), { font: F(11, 'italic', FONT_TEXT), color: COL.muted, outline: false, maxW: pw * 0.6 });
    txt(ctx, U.fmtMoney(ui.money.shown == null ? (p ? p.money : 0) : ui.money.shown), x + pw - px(20), y + px(36), { font: F(22, 'bold'), color: COL.lime, align: 'right', outline: false });
    var disc = CB && CB.shop && CB.shop.discount ? CB.shop.discount() : 0;
    if (disc > 0) txt(ctx, Math.round(disc * 100) + '% OFF (loyalty, allegedly)', x + pw - px(20), y + px(52), { font: F(10, 'bold'), color: COL.amber, align: 'right', outline: false });
    // tabs
    var tabW = Math.min(px(120), (pw - px(40) - px(100)) / tabs.length), ty = y + px(62), i;   // the tabs stop short of EXIT (QA-B-TCH-10)
    for (i = 0; i < tabs.length; i++) {
      var tx = x + px(20) + i * tabW, sel = i === sh.tab;
      panel(ctx, tx + px(2), ty, tabW - px(4), px(26), px(6), sel ? 'rgba(63,210,127,0.22)' : 'rgba(255,255,255,0.05)', sel ? COL.green : 'rgba(255,255,255,0.1)');
      txt(ctx, tabs[i], tx + tabW / 2, ty + px(18), { font: F(11, 'bold'), color: sel ? COL.ink : COL.muted, align: 'center', outline: false });
      hit(tx, ty, tabW, px(26), (function (k) { return function () { sh.tab = k; sh.sel = 0; sh.msgT = 0; }; })(i), 'shop-tab-' + i);
    }
    // exit button
    var ew = px(90), ex = x + pw - px(20) - ew;
    panel(ctx, ex, ty, ew, px(26), px(6), hovering(ex, ty, ew, px(26)) ? 'rgba(255,59,48,0.3)' : 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.2)');
    txt(ctx, device() === 'touch' ? 'EXIT  ✕' : 'EXIT  ' + glyph('cancel'), ex + ew / 2, ty + px(18), { font: F(10, 'bold'), color: COL.ink, align: 'center', outline: false });
    hit(ex, ty, ew, px(26), closeShop, 'shop-exit');
    // the list (left) and the card (right); stacked on a phone
    var ly = ty + px(36), lh = y + ph - ly - px(16), lw = narrow ? pw - px(40) : pw * 0.46, lx = x + px(20), rh = px(40);
    if (narrow) lh = lh * 0.55;
    ctx.save(); ctx.beginPath(); ctx.rect(lx, ly, lw, lh); ctx.clip();
    var scroll = Math.max(0, (sh.sel + 1) * rh - lh), ry = ly - scroll;
    for (i = 0; i < items.length; i++) {
      var it = items[i], on = i === sh.sel;
      if (hovering(lx, ry, lw, rh - px(4))) { sh.sel = i; on = true; }
      var rowCol = it.locked ? 'rgba(255,255,255,0.03)' : on ? 'rgba(63,210,127,0.16)' : 'rgba(255,255,255,0.05)';
      panel(ctx, lx, ry, lw, rh - px(4), px(8), rowCol, on ? COL.green : 'rgba(255,255,255,0.1)', on ? 1.5 : 1);
      if (it.weapon) drawWeaponIcon(ctx, it.weapon, lx + px(6), ry + px(2), px(32), it.locked ? 'rgba(143,151,179,0.5)' : COL.ink);
      else { ctx.fillStyle = it.locked ? 'rgba(143,151,179,0.4)' : it.id === 'firmness_vest' ? '#5aa8ff' : it.id === 'range_reset' ? COL.amber : COL.lime; rr(ctx, lx + px(12), ry + px(9), px(20), px(20), px(5)); ctx.fill(); }
      txt(ctx, it.name, lx + px(44), ry + px(16), { font: F(12, 'bold'), color: it.locked ? COL.muted : COL.ink, outline: false, maxW: lw - px(150) });
      var sub = it.locked ? 'LOCKED · ' + ((shopC.lockFormat) || 'Unlocks after: {mission}').replace('{mission}', it.lockedBy || 'the story') : it.owned ? 'OWNED' + (it.mag != null ? '  ·  ' + it.mag + ' | ' + (it.reserve == null ? '-' : it.reserve) : it.ammo != null ? '  ·  ' + it.ammo : '') : it.rounds ? '+' + it.rounds + ' rounds' : it.hp ? (it.hp === 'full' ? 'full heal' : '+' + it.hp + ' hp') : it.armor ? 'armor to ' + it.armor : '';
      txt(ctx, sub, lx + px(44), ry + px(30), { font: F(9, 'bold'), color: it.locked ? COL.amber : it.owned ? COL.lime : COL.muted, outline: false, maxW: lw - px(150) });
      var priceS = U.fmtMoney(it.price), pc = it.locked ? COL.muted : (p && p.money >= it.price ? COL.lime : COL.red);
      txt(ctx, priceS, lx + lw - px(12), ry + px(24), { font: F(13, 'bold'), color: pc, align: 'right', outline: false });
      if (it.listPrice && it.listPrice !== it.price) txt(ctx, U.fmtMoney(it.listPrice), lx + lw - px(12) - measure(ctx, priceS, F(13, 'bold')) - px(8), ry + px(24), { font: F(9), color: COL.muted, align: 'right', outline: false });
      if (ry + rh > ly && ry < ly + lh) hit(lx, Math.max(ly, ry), lw, Math.min(rh - px(4), ly + lh - Math.max(ly, ry)), (function (k, id) { return function () { if (sh.sel === k) shopBuy(id); else sh.sel = k; }; })(i, it.id), 'shop-item-' + i);   // only rows on screen take taps (QA-B-TCH-11)
      ry += rh;
    }
    if (!items.length) txt(ctx, 'Nothing on this wall.', lx + px(10), ly + px(30), { font: F(12, '', FONT_TEXT), color: COL.muted, outline: false });
    ctx.restore();
    // the card
    var cx = narrow ? lx : lx + lw + px(16), cy = narrow ? ly + lh + px(10) : ly, cw = narrow ? lw : pw - lw - px(56), chh = narrow ? y + ph - cy - px(16) : lh;
    panel(ctx, cx, cy, cw, chh, px(10), 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.12)');
    var cur = items[sh.sel];
    if (cur) {
      // the turntable: the icon rotates slowly in a lit disc
      var icoS = Math.min(px(96), chh * 0.3), icx = cx + px(20) + icoS / 2, icy = cy + px(20) + icoS / 2;
      var rg = ctx.createRadialGradient(icx, icy, icoS * 0.1, icx, icy, icoS * 0.8); rg.addColorStop(0, 'rgba(63,210,127,0.3)'); rg.addColorStop(1, 'rgba(63,210,127,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(icx, icy, icoS * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(icx, icy + icoS * 0.45, icoS * 0.7, icoS * 0.18, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.translate(icx, icy); var sq = Math.cos(sh.turn); ctx.scale(Math.max(0.15, Math.abs(sq)) * (sq < 0 ? -1 : 1), 1); ctx.translate(-icx, -icy);
      if (cur.weapon) drawWeaponIcon(ctx, cur.weapon, icx - icoS / 2, icy - icoS / 2, icoS, cur.locked ? 'rgba(143,151,179,0.6)' : COL.ink);
      else { ctx.fillStyle = cur.id === 'firmness_vest' ? '#5aa8ff' : cur.id === 'range_reset' ? COL.amber : COL.lime; rr(ctx, icx - icoS * 0.3, icy - icoS * 0.3, icoS * 0.6, icoS * 0.6, px(10)); ctx.fill(); txt(ctx, cur.id === 'firmness_vest' ? 'VEST' : cur.id === 'range_reset' ? '60 s' : 'HP', icx, icy + px(5), { font: F(12, '900', FONT_DISPLAY), color: '#0b1020', align: 'center', outline: false }); }
      ctx.restore();
      var tx2 = cx + px(30) + icoS, tw2 = cw - icoS - px(50);
      txt(ctx, cur.name.toUpperCase(), tx2, cy + px(36), { font: F(16, '900', FONT_DISPLAY), color: COL.ink, outline: false, maxW: tw2 });
      txt(ctx, U.fmtMoney(cur.price) + (cur.listPrice !== cur.price ? '   (list ' + U.fmtMoney(cur.listPrice) + ')' : ''), tx2, cy + px(58), { font: F(14, 'bold'), color: cur.locked ? COL.muted : COL.lime, outline: false, maxW: tw2 });
      var flav = (X.weapons && cur.weapon && X.weapons[cur.weapon] && X.weapons[cur.weapon].flavor) || '';
      var fl = wrap(ctx, flav, F(10, 'italic', FONT_TEXT), tw2);
      for (i = 0; i < Math.min(3, fl.length); i++) txt(ctx, fl[i], tx2, cy + px(76) + i * px(14), { font: F(10, 'italic', FONT_TEXT), color: COL.muted, outline: false });
      // five stat bars
      var by = cy + px(30) + icoS + px(10), bars = shopC.statBars || ['DAMAGE', 'RATE', 'RANGE', 'ACCURACY', 'VOLUME'], keys = ['damage', 'rate', 'range', 'accuracy', 'volume'];
      var bbyTop = cy + chh - px(50);
      if (cur.stats) {
        for (i = 0; i < bars.length; i++) {
          var v = clamp01(cur.stats[keys[i]] || 0), bx = cx + px(90), bw = cw - px(110), yy = by + i * px(18);
          if (yy + px(10) > bbyTop) break;   // a short (portrait) card shows the bars that fit (QA-B-TCH-10)
          txt(ctx, bars[i], cx + px(20), yy + px(8), { font: F(9, 'bold'), color: COL.muted, outline: false });
          panel(ctx, bx, yy, bw, px(8), px(4), 'rgba(255,255,255,0.1)', null);
          ctx.fillStyle = i === 0 ? COL.red : i === 1 ? COL.amber : i === 2 ? COL.cyan : i === 3 ? COL.lime : COL.pink; rr(ctx, bx, yy, bw * v, px(8), px(4)); ctx.fill();
        }
        by += bars.length * px(18) + px(6);
      }
      // Merle's pitch with his portrait, and the message line
      var ps = px(44), pyy = Math.min(by + px(6), cy + chh - ps - px(50)), roomForMerle = pyy >= by - px(2);
      if (roomForMerle) castPortrait(ctx, shopC.clerk || 'merle', cx + px(20), pyy, ps);
      var pitch = wrap(ctx, '“' + (sh.msgT > 0 && sh.bark ? sh.bark : (cur.pitch || sh.bark || '')) + '”', F(11, 'italic', FONT_TEXT), cw - ps - px(50));
      for (i = 0; i < (roomForMerle ? Math.min(3, pitch.length) : 0); i++) txt(ctx, pitch[i], cx + px(30) + ps, pyy + px(16) + i * px(14), { font: F(11, 'italic', FONT_TEXT), color: '#bfe3ff', outline: false });
      if (roomForMerle) txt(ctx, castName(shopC.clerk || 'merle'), cx + px(20), pyy + ps + px(12), { font: F(8, 'bold'), color: COL.green, outline: false, maxW: ps + px(20) });
      // the buy button
      var bbw = Math.min(px(220), cw - px(40)), bbx = cx + cw - bbw - px(20), bby = cy + chh - px(44), can = cur.canBuy;
      var label = cur.locked ? 'LOCKED' : cur.owned && cur.tab === 'weapons' ? 'OWNED' : can ? 'BUY  ' + glyph('confirm') : 'NOT ENOUGH CASH';
      panel(ctx, bbx, bby, bbw, px(32), px(8), can ? (sh.flash > 0 ? 'rgba(157,255,60,0.5)' : hovering(bbx, bby, bbw, px(32)) ? 'rgba(63,210,127,0.45)' : 'rgba(63,210,127,0.25)') : 'rgba(255,255,255,0.05)', can ? COL.green : 'rgba(255,255,255,0.2)', can ? 2 : 1);
      txt(ctx, label, bbx + bbw / 2, bby + px(21), { font: F(13, 'bold'), color: can ? COL.ink : COL.muted, align: 'center', outline: false });
      hit(bbx, bby, bbw, px(32), (function (id) { return function () { shopBuy(id); }; })(cur.id), 'shop-buy');
      if (sh.msgT > 0 && sh.msg) txt(ctx, sh.msg.text, cx + px(20), bby + px(21), { font: F(10, 'bold'), color: sh.msg.color, outline: false, maxW: cw - bbw - px(50) });
    }
    if (tabs[sh.tab] === ((shopC.flagshipTab) || 'RANGE') && CB && CB.shop) {
      var rt = CB.shop.rangeT || 0, best = CB.shop.rangeBest;
      txt(ctx, (rt > 0 ? 'RANGE TIMER ' + U.fmtTime(Math.ceil(rt)) : 'Six cutouts out back. $50 resets them and starts a 60 s timer.') + (best != null ? '   BEST ' + U.fmtTime(best) : ''), x + px(20), y + ph - px(12), { font: F(10, 'bold'), color: COL.amber, outline: false, maxW: pw - px(40) });
    } else txt(ctx, (device() === 'touch' ? 'tap a row to pick, tap it again to buy' : device() === 'gamepad' ? 'LS picks · A buys · LB RB tabs · B leaves' : '↑ ↓ pick  ·  Enter buys  ·  ← → tabs  ·  Esc leaves') + '   ·   ' + (sh.store && sh.store.gag ? sh.store.gag : 'Loyalty points: one. Nobody has qualified.'), x + px(20), y + ph - px(12), { font: F(10), color: COL.muted, outline: false, maxW: pw - px(40) });
    drawConfirm(ctx);
  }
  function shopInput(In) {
    var sh = ui.shop, tabs = shopTabs(), items = shopItemsFor(tabs[sh.tab] || 'WEAPONS');
    if (menuBack(In) || In.pressed('pause') || In.pressed('map')) { closeShop(); return true; }
    if (In.pressed('forward')) { sh.sel = (sh.sel - 1 + Math.max(1, items.length)) % Math.max(1, items.length); sfx('ui', 0.15); }
    if (menuDown(In)) { sh.sel = (sh.sel + 1) % Math.max(1, items.length); sfx('ui', 0.15); }
    if (In.pressed('left') || In.pressed('weaponPrev')) { sh.tab = (sh.tab + tabs.length - 1) % tabs.length; sh.sel = 0; }
    if (In.pressed('right') || In.pressed('weaponNext') || In.pressed('tabNext')) { sh.tab = (sh.tab + 1) % tabs.length; sh.sel = 0; }
    if (In.pressed('confirm') && items[sh.sel]) shopBuy(items[sh.sel].id);
    return true;
  }

  // -------------------------------------------------------- weapon wheel ----
  // twelve segments in Combat.ORDER around a ring, owned ones lit with their icon and ammo, the highlighted one named in the hub
  function drawWeaponWheel(ctx) {
    var CB = GTP.Combat, hud = CB && CB.hud ? CB.hud() : null, wh = hud && hud.wheel; if (!wh || !wh.open) return;
    var segs = wh.segments || [], n = segs.length || 12, k = ease(Math.min(1, (wh.t || 0) / 0.12));
    var cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.3 * k, r0 = R * 0.42, i;
    ctx.save();
    ctx.fillStyle = 'rgba(6,7,13,0.35)'; ctx.fillRect(0, 0, W, H);
    for (i = 0; i < n; i++) {
      var s = segs[i], a0 = -Math.PI / 2 + (i - 0.5) * Math.PI * 2 / n, a1 = a0 + Math.PI * 2 / n, sel = i === wh.index, cur = !!s.current;
      ctx.beginPath(); ctx.arc(cx, cy, R, a0 + 0.012, a1 - 0.012); ctx.arc(cx, cy, r0, a1 - 0.012, a0 + 0.012, true); ctx.closePath();
      ctx.fillStyle = sel ? (s.owned ? 'rgba(255,63,164,0.55)' : 'rgba(143,151,179,0.35)') : s.owned ? (cur ? 'rgba(46,230,255,0.3)' : 'rgba(13,16,32,0.88)') : 'rgba(10,12,24,0.7)';
      ctx.fill();
      ctx.lineWidth = sel ? 2.5 : 1; ctx.strokeStyle = sel ? COL.pink : s.owned ? 'rgba(238,241,251,0.45)' : 'rgba(238,241,251,0.12)'; ctx.stroke();
      var am = (a0 + a1) / 2, rm = (R + r0) / 2, ix = cx + Math.cos(am) * rm, iy = cy + Math.sin(am) * rm, is = px(30) * k;
      drawWeaponIcon(ctx, s.id, ix - is / 2, iy - is / 2 - px(4), is, s.owned ? COL.ink : 'rgba(143,151,179,0.35)');
      if (s.owned) {
        var ammo = s.infinite ? '∞' : (s.mag != null ? s.mag + '|' + (s.reserve == null ? '-' : s.reserve) : String(s.ammo == null ? 0 : s.ammo));
        txt(ctx, ammo, ix, iy + px(22), { font: F(9, 'bold'), color: s.owned && !s.infinite && (s.ammo | 0) === 0 ? COL.red : COL.ink, align: 'center', lw: 2 });
      }
    }
    // the hub: the highlighted weapon's name, the pointer
    ctx.fillStyle = 'rgba(10,12,24,0.92)'; ctx.beginPath(); ctx.arc(cx, cy, r0 - px(6), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.stroke();
    var hs = segs[wh.index] || {};
    txt(ctx, String(hs.name || hs.id || '').toUpperCase(), cx, cy - px(2), { font: F(Math.min(14, 110 / Math.max(6, String(hs.name || '').length) + 6), 'bold'), color: hs.owned ? COL.ink : COL.muted, align: 'center', outline: false, maxW: r0 * 1.7 });
    txt(ctx, hs.owned ? (hs.current ? 'EQUIPPED' : 'release to equip') : 'not owned', cx, cy + px(16), { font: F(9, 'bold'), color: hs.owned ? COL.pink : COL.muted, align: 'center', outline: false });
    var pa = -Math.PI / 2 + wh.index * Math.PI * 2 / n;
    ctx.fillStyle = COL.pink; ctx.beginPath(); ctx.moveTo(cx + Math.cos(pa) * (r0 - px(8)), cy + Math.sin(pa) * (r0 - px(8))); ctx.lineTo(cx + Math.cos(pa + 0.25) * (r0 - px(20)), cy + Math.sin(pa + 0.25) * (r0 - px(20))); ctx.lineTo(cx + Math.cos(pa - 0.25) * (r0 - px(20)), cy + Math.sin(pa - 0.25) * (r0 - px(20))); ctx.closePath(); ctx.fill();
    txt(ctx, (device() === 'gamepad' ? 'RS picks · release R3' : ui.touch.visible ? 'drag picks · release' : 'mouse picks · [ ] step · release Tab') + '  ·  the world runs at ' + Math.round((wh.timeScale || 0.2) * 100) + '%', cx, cy + R + px(26), { font: F(10, 'bold'), color: COL.muted, align: 'center' });
    ctx.restore();
  }

  // ------------------------------------------------------------- credits ----
  function credits(id) {
    var Cc = GTP.Content || {}, ids = Cc.castIds || Object.keys(Cc.cast || {}), lines = [], ads = [];
    stationList().forEach(function (s) { (s.ads || []).forEach(function (a) { ads.push(a); }); });
    var title = id === 'm15b_liveread' ? 'ENDING B: LIVE READ' : id === 'm15a_primetime' ? 'ENDING A: PRIMETIME' : 'CREDITS';
    lines.push({ t: 'GRAND THEFT PUNDIT', big: true }, { t: title, sub: true }, { t: '' });
    lines.push({ t: 'A NAP DYNASTY PRESENTATION. CODE TAKES20.', tag: 'SPONSOR' }, { t: '' });
    for (var i = 0; i < ids.length; i++) {
      var c = Cc.cast ? Cc.cast[ids[i]] : null; if (!c) continue;
      lines.push({ t: c.name.toUpperCase() + ' as ' + c.role, who: ids[i] });
      if (ads.length) lines.push({ t: ads[(i * 5) % ads.length], tag: 'AD' });
    }
    lines.push({ t: '' }, { t: 'THE PANEL: FIVE GUESTS, ONE MEMO', who: 'panel' }, { t: 'WENDELL SYLLABUS, who did the reading', who: 'freshman' }, { t: '' });
    lines.push({ t: 'Minds changed: zero.', sub: true }, { t: 'No real pundits were harmed. All characters are fictional.', sub: true }, { t: 'Every script in this city ends "Respectfuly." One L.', sub: true }, { t: '' });
    lines.push({ t: 'KIP GRATIS asks: Is this paid?', who: 'kip' }, { t: '' }, { t: id === 'm15b_liveread' ? 'Reward: $11. One per listener.' : id ? 'Rated a ten by the man who rates it.' : 'Thanks for listening to listening.', sub: true });
    ui.credits = { id: id || null, lines: lines, y: 0, t: 0, done: false };
    var g = game();
    if (g && (g.state === 'playing' || g.state === 'cutscene')) openPause('credits');
    else if (g && g.state === 'paused') ui.pause.page = 'credits';
    else if (g && g.state === 'title') ui.title.page = 'credits';
  }
  function updateCredits(dt) {
    var c = ui.credits; if (!c) return;
    c.t += dt; c.y += dt * px(42);
    var total = c.lines.length * px(34) + H;
    if (c.y > total) endCredits();
  }
  function endCredits() {
    ui.credits = null;
    var g = game();
    if (g && g.state === 'paused' && ui.pause.page === 'credits') { ui.pause.page = 'pause'; closePause(); toast('Thanks for listening to listening.'); }
    else if (g && g.state === 'title' && ui.title.page === 'credits') ui.title.page = 'menu';
  }
  function drawCredits(ctx) {
    var c = ui.credits; if (!c) return;
    ctx.fillStyle = 'rgba(6,7,13,0.78)'; ctx.fillRect(0, 0, W, H);
    var y = H - c.y + px(40), lh = px(34);
    for (var i = 0; i < c.lines.length; i++, y += lh) {
      if (y < -px(60) || y > H + px(40)) continue;
      var l = c.lines[i];
      if (!l.t) continue;
      if (l.big) { txt(ctx, l.t, W / 2, y, { font: F(portrait ? 28 : 40, '900', FONT_DISPLAY), color: COL.gold, align: 'center', lw: px(6), maxW: W - px(40) }); y += px(14); continue; }
      if (l.sub) { txt(ctx, l.t, W / 2, y, { font: F(14, 'italic', FONT_TEXT), color: COL.muted, align: 'center', maxW: W - px(40) }); continue; }
      if (l.tag) {
        var font = F(12, 'bold'), tw = Math.min(measure(ctx, l.t, font), W - px(140)) + px(24), tagW = px(64), x0 = (W - tw - tagW) / 2;
        panel(ctx, x0, y - px(18), tw + tagW, px(26), px(6), 'rgba(10,12,24,0.85)', 'rgba(255,255,255,0.12)');
        ctx.fillStyle = l.tag === 'SPONSOR' ? '#5aa8ff' : COL.amber; rr(ctx, x0, y - px(18), tagW, px(26), px(6)); ctx.fill();
        txt(ctx, l.tag, x0 + tagW / 2, y, { font: F(10, 'bold'), color: '#0b1020', align: 'center', outline: false });
        txt(ctx, l.t, x0 + tagW + px(12), y, { font: font, color: COL.ink, outline: false, maxW: tw - px(20) });
        continue;
      }
      if (l.who) {
        var ps = px(28), font2 = F(13, 'bold', FONT_TEXT), tw2 = Math.min(measure(ctx, l.t, font2), W - px(120)), x1 = (W - tw2 - ps - px(10)) / 2;
        castPortrait(ctx, l.who, x1, y - px(20), ps);
        txt(ctx, l.t, x1 + ps + px(10), y, { font: font2, color: COL.ink, maxW: W - px(120) });
        continue;
      }
      txt(ctx, l.t, W / 2, y, { font: F(13, 'bold'), color: COL.ink, align: 'center', maxW: W - px(40) });
    }
    txt(ctx, glyph('confirm') + ' / ' + glyph('cancel') + ': skip', W - safe.r, H - safe.b - px(10), { font: F(10), color: COL.muted, align: 'right' });
  }
  // ============================================================ minigames ====
  // Both games use only the engine's input actions and resolve onResult(win).
  var CARD_TYPES = ['FACT', 'FEELING', 'GOTCHA', 'ANECDOTE'];
  var COUNTERS = { 'SOURCE?': 'FACT', 'LOUDER': 'FEELING', 'PIVOT': 'GOTCHA', 'DEFINE TERMS': 'ANECDOTE' };
  var COUNTER_KEYS = [{ id: 'SOURCE?', action: 'forward', glyph: '↑', key: 'W' }, { id: 'LOUDER', action: 'left', glyph: '←', key: 'A' }, { id: 'PIVOT', action: 'right', glyph: '→', key: 'D' }, { id: 'DEFINE TERMS', action: 'back', glyph: '↓', key: 'S' }];
  var CARD_COLOR = { FACT: '#4aa8ff', FEELING: '#ff3fa4', GOTCHA: '#ffbe3c', ANECDOTE: '#9dff3c' };
  var mgSerial = 0;
  // SHOUT: Shift held, the pad's LT held (menu map), or the touch SHOUT toggle (QA-B-TCH-06)
  function shoutDown() { var In = GTP.Input; return !!(In && (In.down('run') || In.down('zoomOut'))) || !!ui.mgShout; }
  function mgKey(kind) {
    var d = device();
    if (kind === 'shout') return d === 'gamepad' ? 'LT' : d === 'touch' ? 'SHOUT' : 'Shift';
    if (kind === 'post') return d === 'gamepad' ? 'A' : d === 'touch' ? 'tap' : 'E / Space';
    if (kind === 'hottake') return d === 'gamepad' ? 'X' : d === 'touch' ? 'tap' : 'Ctrl / click';
    return '';
  }
  function mgRng() { return GTP.rng && GTP.rng.fork ? GTP.rng.fork(0x51D0 + (mgSerial++)) : (urng || { random: function () { return 0.5; }, pick: function (a) { return a[0]; }, chance: function () { return false; }, shuffle: function (a) { return a; } }); }
  function debateOpponent(id) {
    var D = GTP.Content && GTP.Content.debate, o = D && D.opponents ? D.opponents[id] : null;
    if (o && o.cards && o.cards.length) return o;
    var cm = cast(id);
    return { name: cm ? cm.name : String(id || 'Opponent'), castId: cm ? cm.id : 'everyone', fallback: true, cards: [
      { card: 'FACT', text: 'That is a fact. I have it right here, somewhere.' }, { card: 'FEELING', text: 'It just feels true, and feelings are facts now.' },
      { card: 'GOTCHA', text: 'So you admit it. Gotcha.' }, { card: 'ANECDOTE', text: 'A guy I know once saw this happen. True story.' }
    ], winLine: 'Minds changed: zero. Crowd: mine.', loseLine: 'Fine. You were louder.' };
  }
  function counterLine(id) {
    var Cc = GTP.Content && GTP.Content.debateCounters, list = Cc && Cc[id];
    if (!list || !list.length) list = id === 'WHATABOUT' ? ['What about the mattress, though?'] : ['Respectfully, ' + id.toLowerCase()];
    return list;
  }

  // ------------------------------------------------------------- debate ----
  var debate = {
    active: false, state: null,
    start: function (params, onResult) {
      params = params || {};
      var rng = mgRng(), opp = debateOpponent(params.opponent || 'freshman');
      var st = debate.state = {
        params: params, opp: opp, oppId: params.opponent || 'freshman', onResult: onResult || null, rng: rng,
        rounds: Math.max(1, params.rounds | 0 || 1), points: Math.max(1, params.points | 0 || 5), timer: params.timer > 0 ? params.timer : 5, bluff: U.clamp(params.bluff || 0, 0, 0.4),
        round: 1, roundsWon: 0, roundsLost: 0, crowd: 50, pointIdx: 0, cardIdx: 0, deck: rng.shuffle(opp.cards.slice()), deckI: 0,
        card: null, phase: 'intro', phaseT: 0, perfect: 0, shouts: 0, forgiven: false, captionOpp: '', captionMe: '', flash: null, pop: null, lastAnswer: null, result: null, summary: '', line: '', history: []
      };
      st.captionOpp = opp.name + ' takes the ' + (st.oppId === 'panel' ? 'panel' : 'table') + '.';
      debate.active = true;
      sfx('debate', 0.6);
      return st;
    },
    // the test / touch API: answer with a counter id ('SOURCE?' | 'LOUDER' | 'PIVOT' | 'DEFINE TERMS' | 'WHATABOUT'), shout = holding run
    answer: function (id, shout) {
      var st = debate.state; if (!st || st.phase !== 'card' || !st.card) return false;
      var c = st.card, t = c.t;
      st.lastAnswer = { id: id, t: 0 };
      if (id === 'WHATABOUT') {
        st.crowd = U.clamp(st.crowd - 5, 0, 100);
        st.captionMe = st.rng.pick(counterLine('WHATABOUT'));
        st.result = { text: 'WHATABOUT  -5', color: COL.muted, ok: null };
      } else {
        var correct = COUNTERS[id] === c.card, perfect = correct && t < 0.4 * st.timer;
        if (correct) {
          var gain = shout ? 40 : 20; if (perfect) { gain += 5; st.perfect++; st.flash = { text: 'Write that down.', t: 0 }; }
          if (shout) st.shouts++;
          st.crowd = U.clamp(st.crowd + gain, 0, 100);
          st.result = { text: (shout ? 'SHOUT  ' : perfect ? 'PERFECT  ' : '') + '+' + gain, color: COL.lime, ok: true };
          sfx('debate', 0.7);
        } else {
          var loss = shout ? 40 : 20;
          if (!st.forgiven && st.crowd < 30) { st.forgiven = true; loss = 0; st.result = { text: 'Respectfully,', color: COL.pink, ok: false }; st.captionMe = 'Respectfully,'; }
          else st.result = { text: (shout ? 'SHOUTED WRONG  ' : 'WRONG  ') + '-' + loss, color: COL.red, ok: false };
          st.crowd = U.clamp(st.crowd - loss, 0, 100);
          sfx('hit', 0.4);
        }
        if (!(st.result.text === 'Respectfully,')) st.captionMe = st.rng.pick(counterLine(id));
      }
      logCaption(st.captionMe);
      st.phase = 'reveal'; st.phaseT = 0;
      return true;
    },
    update: function (dt) {
      var st = debate.state; if (!st || !debate.active) return;
      var In = GTP.Input;
      st.phaseT += dt;
      if (st.flash) { st.flash.t += dt; if (st.flash.t > 0.9) st.flash = null; }
      if (st.lastAnswer) { st.lastAnswer.t += dt; if (st.lastAnswer.t > 0.5) st.lastAnswer = null; }
      switch (st.phase) {
        case 'intro': if (st.phaseT > 1.0 || In.pressed('confirm') || In.pressed('action')) debate._deal(); break;
        case 'card':
          var c = st.card; c.t += dt;
          if (c.bluff && !c.flipped && c.t >= 0.5 * st.timer) {
            var others = CARD_TYPES.filter(function (x) { return x !== c.card; }), nt = st.rng.pick(others), alt = st.opp.cards.filter(function (k) { return k.card === nt; });
            var pickd = alt.length ? st.rng.pick(alt) : { card: nt, text: c.text };
            c.card = nt; c.text = pickd.text; c.who = pickd.who || c.who; c.flipped = true; st.captionOpp = c.text; st.flash = { text: 'FLIP!', t: 0.3, small: true }; sfx('ui', 0.4);
          }
          if (c.t >= st.timer) { st.result = { text: 'LATE  -20', color: COL.red, ok: false }; st.crowd = U.clamp(st.crowd - 20, 0, 100); st.captionMe = '...'; st.phase = 'reveal'; st.phaseT = 0; sfx('hit', 0.4); break; }
          var shout = shoutDown();
          for (var i = 0; i < COUNTER_KEYS.length; i++) if (In.pressed(COUNTER_KEYS[i].action)) { debate.answer(COUNTER_KEYS[i].id, shout); return; }
          if (In.pressed('action') || In.pressed('confirm')) debate.answer('WHATABOUT', false);
          break;
        case 'reveal':
          if (st.phaseT > 0.75) {
            if (st.crowd <= 0 || st.crowd >= 100 || st.pointIdx >= st.points) debate._endRound(); else debate._deal();
          }
          break;
        case 'roundEnd': if (st.phaseT > 1.4) debate._nextRound(); break;
        case 'summary': if (st.phaseT > 3.2 || (st.phaseT > 0.6 && (In.pressed('confirm') || In.pressed('action')))) debate._finish(); break;
        default: break;
      }
    },
    _deal: function () {
      var st = debate.state;
      var c = st.deck[st.deckI % st.deck.length]; st.deckI++;
      if (st.deckI % st.deck.length === 0) st.rng.shuffle(st.deck);
      var bluff = st.oppId === 'panel' ? (st.cardIdx % 3 === 2) : st.rng.chance(st.bluff);
      st.card = { card: c.card, text: c.text, who: c.who || null, t: 0, bluff: bluff, flipped: false };
      st.cardIdx++; st.pointIdx++;
      st.captionOpp = c.text; st.result = null;
      st.phase = 'card'; st.phaseT = 0;
    },
    _endRound: function () {
      var st = debate.state, won = st.crowd > 50;
      if (won) st.roundsWon++; else st.roundsLost++;
      st.history.push(won);
      st.roundResult = won; st.card = null;
      st.phase = 'roundEnd'; st.phaseT = 0;
      sfx(won ? 'cash' : 'fail', 0.5);
    },
    _nextRound: function () {
      var st = debate.state, need = Math.floor(st.rounds / 2) + 1;
      if (st.roundsWon >= need || st.roundsLost >= need || st.round >= st.rounds) { debate._summary(); return; }
      st.round++; st.crowd = 50; st.pointIdx = 0; st.card = null; st.result = null; st.captionMe = '';
      st.captionOpp = 'Round ' + st.round + '. ' + st.opp.name + ' clears ' + (st.oppId === 'panel' ? 'five throats' : 'a throat') + '.';
      st.phase = 'intro'; st.phaseT = 0;
    },
    _summary: function () {
      var st = debate.state, win = st.roundsWon > st.roundsLost;
      st.win = win;
      st.summary = 'ROUNDS ' + st.roundsWon + '-' + st.roundsLost + ' · PERFECT HITS ' + st.perfect + ' · SHOUTS ' + st.shouts + ' · MINDS CHANGED 0';
      st.line = win ? (st.opp.loseLine || 'Fine.') : (st.opp.winLine || 'Minds changed: zero.');
      st.phase = 'summary'; st.phaseT = 0;
      var p = player(); if (p && p.stats) p.stats.debating = (p.stats.debating || 0) + 1;
      sfx(win ? 'mission' : 'fail', 0.8);
    },
    _finish: function () {
      var st = debate.state; if (!st || st.phase === 'done') return;
      st.phase = 'done'; debate.active = false;
      if (st.shouts > 0 && GTP.AI && GTP.AI.wanted && GTP.AI.wanted.addHeat) { try { GTP.AI.wanted.addHeat(Math.min(st.shouts, 3), 'shout'); } catch (e) { /* optional */ } }
      var cb = st.onResult; st.onResult = null;
      if (cb) { try { cb(!!st.win); } catch (e) { U.reportError(e, 'ui.debate.onResult'); } }
    },
    cancel: function () { debate.active = false; if (debate.state) { debate.state.phase = 'done'; debate.state.onResult = null; } },
    draw: function (ctx) {
      var st = debate.state; if (!st) return;
      var pad = px(16), bw = Math.min(W - safe.l - safe.r, px(960)), bh = Math.min(H - safe.t - safe.b, px(600)), bx = (W - bw) / 2, by = (H - bh) / 2;
      var ts = U.clamp(bw / px(900), 0.62, 1);
      panel(ctx, bx, by, bw, bh, px(16), 'rgba(8,10,20,0.9)', COL.line, 1.5);
      // round pips + header
      txt(ctx, 'DEBATE', bx + pad, by + px(26), { font: F(16 * ts, '900', FONT_DISPLAY), color: COL.gold, outline: false });
      txt(ctx, 'vs ' + st.opp.name.toUpperCase(), bx + bw - pad, by + px(26), { font: F(12 * ts, 'bold'), color: COL.muted, align: 'right', outline: false, maxW: bw * 0.4 });
      var pipW = px(16), pipX = bx + bw / 2 - (st.rounds - 1) * pipW;
      var played = st.history.length;
      for (var i = 0; i < st.rounds; i++) {
        var cur = i === played && st.phase !== 'summary';
        var col = i < played ? (st.history[i] ? COL.lime : COL.red) : (cur ? COL.ink : 'rgba(255,255,255,0.2)');
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(pipX + i * pipW * 2, by + px(22), px(5) * (cur && Math.floor(ui.t * 3) % 2 ? 1.3 : 1), 0, Math.PI * 2); ctx.fill();
      }
      // portraits
      var ps = Math.min(px(112) * ts, bw * 0.18), py = by + px(48);
      castPortrait(ctx, 'player', bx + pad, py, ps);
      var oppWho = st.card && st.card.who ? st.card.who : (st.opp.castId || st.oppId);
      castPortrait(ctx, oppWho, bx + bw - pad - ps, py, ps);
      txt(ctx, castName('player'), bx + pad + ps / 2, py + ps + px(16), { font: F(11 * ts, 'bold'), color: COL.pink, align: 'center', outline: false, maxW: ps + px(30) });
      txt(ctx, st.card && st.card.who ? castName(st.card.who) : st.opp.name, bx + bw - pad - ps / 2, py + ps + px(16), { font: F(11 * ts, 'bold'), color: (cast(oppWho) || {}).color || COL.cyan, align: 'center', outline: false, maxW: ps + px(30) });
      // crowd meter
      var mx0 = bx + pad + ps + px(18), mx1 = bx + bw - pad - ps - px(18), mw = mx1 - mx0, my = py + px(18), mh = px(26);
      txt(ctx, 'CROWD (measures only volume)', (mx0 + mx1) / 2, my - px(6), { font: F(10 * ts, 'bold'), color: COL.muted, align: 'center', outline: false, maxW: mw });
      panel(ctx, mx0, my, mw, mh, px(6), 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.25)');
      var cg = ctx.createLinearGradient(mx0, 0, mx1, 0); cg.addColorStop(0, COL.red); cg.addColorStop(0.5, COL.amber); cg.addColorStop(1, COL.lime);
      ctx.fillStyle = cg; rr(ctx, mx0 + 2, my + 2, Math.max(0, (mw - 4) * st.crowd / 100), mh - 4, px(5)); ctx.fill();
      ctx.fillStyle = COL.ink; ctx.fillRect(mx0 + mw / 2 - 1, my - px(4), 2, mh + px(8));
      txt(ctx, Math.round(st.crowd) + '', mx0 + mw / 2, my + mh + px(16), { font: F(13 * ts, 'bold'), color: st.crowd > 50 ? COL.lime : st.crowd < 50 ? COL.red : COL.ink, align: 'center', outline: false });
      if (st.result && st.phase === 'reveal') txt(ctx, st.result.text, mx0 + mw / 2, my - px(22), { font: F(15 * ts, '900', FONT_DISPLAY), color: st.result.color, align: 'center', lw: px(4) });
      // opponent card with timer bar
      var cw = Math.min(px(170) * ts, bw * 0.26), chh = px(96) * ts, cx = bx + bw - pad - cw, cy = my + mh + px(34);
      if (cy + chh > py + ps + px(26)) cy = py + ps + px(26);
      if (st.card) {
        var c = st.card, ccol = CARD_COLOR[c.card] || COL.ink, left = 1 - U.clamp(c.t / st.timer, 0, 1);
        panel(ctx, cx, cy, cw, chh, px(10), hexA(ccol, 0.18), ccol, 2);
        txt(ctx, c.card, cx + cw / 2, cy + chh * 0.48, { font: F(22 * ts, '900', FONT_DISPLAY), color: ccol, align: 'center', outline: false, maxW: cw - px(12) });
        txt(ctx, c.flipped ? 'FLIPPED' : (c.bluff && c.t < 0.5 * st.timer ? 'reading...' : 'their point'), cx + cw / 2, cy + chh * 0.72, { font: F(9 * ts, 'bold'), color: COL.muted, align: 'center', outline: false });
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, cx + px(10), cy + chh - px(14), cw - px(20), px(7), px(3)); ctx.fill();
        ctx.fillStyle = left < 0.4 ? COL.red : COL.amber; rr(ctx, cx + px(10), cy + chh - px(14), (cw - px(20)) * left, px(7), px(3)); ctx.fill();
      } else {
        panel(ctx, cx, cy, cw, chh, px(10), 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.15)');
        txt(ctx, st.phase === 'roundEnd' ? (st.roundResult ? 'ROUND WON' : 'ROUND LOST') : st.phase === 'summary' ? 'DONE' : 'READY', cx + cw / 2, cy + chh * 0.55, { font: F(16 * ts, '900', FONT_DISPLAY), color: st.phase === 'roundEnd' ? (st.roundResult ? COL.lime : COL.red) : COL.muted, align: 'center', outline: false });
      }
      // player counter cards, centred in the space between the top block and the caption strip
      var areaY = Math.max(py + ps + px(30), cy + chh + px(10)), capH = px(58) * ts, areaH = by + bh - capH - areaY - px(14);
      var n = 5, gap = px(8), cwid = (bw - pad * 2 - gap * (n - 1)) / n, twoRows = cwid < px(84);
      if (twoRows) { cwid = (bw - pad * 2 - gap * 2) / 3; }
      var chgt = Math.min(px(104) * ts, (twoRows ? (areaH - gap - px(24)) / 2 : areaH - px(24)));
      var blockH = twoRows ? chgt * 2 + gap : chgt, cardsY = areaY + Math.max(0, (areaH - px(20) - blockH) / 2);
      var items = COUNTER_KEYS.concat([{ id: 'WHATABOUT', action: 'action', glyph: 'E', key: 'Space', grey: true }]);
      for (i = 0; i < items.length; i++) {
        var it = items[i], col2 = CARD_COLOR[COUNTERS[it.id]] || COL.muted;
        var cxx = bx + pad + (twoRows ? (i % 3) * (cwid + gap) : i * (cwid + gap)), cyy = cardsY + (twoRows ? Math.floor(i / 3) * (chgt + gap) : 0);
        if (twoRows && i >= 3) cxx += (cwid + gap) / 2;
        var pressed = st.lastAnswer && st.lastAnswer.id === it.id, okc = st.result && st.result.ok;
        var fill = pressed ? (okc === true ? 'rgba(157,255,60,0.3)' : okc === false ? 'rgba(255,59,48,0.3)' : 'rgba(255,255,255,0.2)') : it.grey ? 'rgba(255,255,255,0.03)' : hexA(col2, 0.12);
        panel(ctx, cxx, cyy, cwid, chgt, px(10), fill, it.grey ? 'rgba(255,255,255,0.18)' : col2, pressed ? 3 : 1.5);
        txt(ctx, it.glyph, cxx + cwid / 2, cyy + chgt * 0.4, { font: F(24 * ts, '900', FONT_DISPLAY), color: it.grey ? COL.muted : col2, align: 'center', outline: false });
        txt(ctx, device() === 'touch' ? '' : device() === 'gamepad' ? (it.grey ? 'A' : 'D-pad ' + it.glyph) : it.grey ? 'E / Space' : it.key + ' / arrow', cxx + cwid - px(6), cyy + px(13), { font: F(8 * ts, 'bold'), color: 'rgba(238,241,251,0.55)', align: 'right', outline: false });
        txt(ctx, it.id, cxx + cwid / 2, cyy + chgt * 0.68, { font: F((it.id === 'DEFINE TERMS' ? 10 : 12) * ts, 'bold'), color: it.grey ? COL.muted : COL.ink, align: 'center', outline: false, maxW: cwid - px(8) });
        txt(ctx, it.grey ? 'never wins, never loses (-5)' : 'beats ' + COUNTERS[it.id], cxx + cwid / 2, cyy + chgt * 0.86, { font: F(8 * ts, ''), color: COL.muted, align: 'center', outline: false, maxW: cwid - px(6) });
        hit(cxx, cyy, cwid, chgt, (function (id) { return function () { debate.answer(id, shoutDown()); ui.mgShout = false; }; })(it.id), 'card-' + it.id);
      }
      var shoutOn = shoutDown();
      if (device() === 'touch') {   // a SHOUT toggle for touch
        var sbw = px(96), sbx = bx + bw - pad - sbw, sby = cardsY + blockH + px(2);
        panel(ctx, sbx, sby, sbw, px(22), px(6), shoutOn ? 'rgba(255,63,164,0.4)' : 'rgba(255,255,255,0.06)', COL.pink, 1.2);
        txt(ctx, shoutOn ? 'SHOUT ON' : 'SHOUT', sbx + sbw / 2, sby + px(15), { font: F(10, 'bold'), color: COL.ink, align: 'center', outline: false });
        hit(sbx, sby, sbw, px(22), function () { ui.mgShout = !ui.mgShout; }, 'shout');
      }
      txt(ctx, shoutOn ? 'SHOUT ARMED (' + mgKey('shout') + '): +40 on a hit, double loss on a miss' : (device() === 'touch' ? 'SHOUT' : 'hold ' + mgKey('shout')) + ' to SHOUT: +40 on a hit, double loss on a miss, heat on exit', bx + pad, cardsY + blockH + px(16), { font: F(10 * ts, 'bold'), color: shoutOn ? COL.pink : COL.muted, outline: false, maxW: bw - pad * 2 });
      // caption strip
      var capY = by + bh - capH - px(8);
      panel(ctx, bx + pad, capY, bw - pad * 2, capH, px(8), 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.1)');
      txt(ctx, st.captionOpp ? '“' + st.captionOpp + '”' : '', bx + bw - pad - px(10), capY + px(22) * ts, { font: F(12 * ts, 'italic', FONT_TEXT), color: '#bfe3ff', align: 'right', outline: false, maxW: bw - pad * 2 - px(20) });
      txt(ctx, st.captionMe ? '“' + st.captionMe + '”' : '', bx + pad + px(10), capY + px(44) * ts, { font: F(12 * ts, 'italic bold', FONT_TEXT), color: COL.pink, outline: false, maxW: bw - pad * 2 - px(20) });
      // flashes and overlays
      if (st.flash) { var fk = st.flash.t / 0.9; txt(ctx, st.flash.text, W / 2, H * 0.45, { font: F(st.flash.small ? 26 : 40, '900', FONT_DISPLAY), color: COL.gold, align: 'center', alpha: fk < 0.1 ? fk / 0.1 : 1 - Math.max(0, fk - 0.6) / 0.4, lw: px(6) }); }
      if (st.phase === 'intro') txt(ctx, 'ROUND ' + st.round, W / 2, H * 0.45, { font: F(44, '900', FONT_DISPLAY), color: COL.ink, align: 'center', lw: px(6) });
      if (st.phase === 'summary') {
        var sw = Math.min(px(620), bw - pad * 2), sh = px(150), sx = (W - sw) / 2, sy = H / 2 - sh / 2;
        panel(ctx, sx, sy, sw, sh, px(14), 'rgba(8,10,20,0.96)', st.win ? COL.lime : COL.red, 2);
        txt(ctx, st.win ? 'YOU WON THE ROOM' : 'CONTEXT STAMPED.', W / 2, sy + px(44), { font: F(26, '900', FONT_DISPLAY), color: st.win ? COL.lime : COL.red, align: 'center', outline: false, maxW: sw - px(20) });
        txt(ctx, st.summary, W / 2, sy + px(78), { font: F(12, 'bold'), color: COL.ink, align: 'center', outline: false, maxW: sw - px(20) });
        var sl = wrap(ctx, st.opp.name + ': “' + st.line + '”', F(12, 'italic', FONT_TEXT), sw - px(30));
        for (i = 0; i < Math.min(2, sl.length); i++) txt(ctx, sl[i], W / 2, sy + px(104) + i * px(16), { font: F(12, 'italic', FONT_TEXT), color: COL.muted, align: 'center', outline: false });
        txt(ctx, 'Enter to continue', W / 2, sy + sh - px(10), { font: F(9), color: COL.muted, align: 'center', outline: false });
      }
    },
  };

  // -------------------------------------------------------------- ratio ----
  function ratioOpponent(id) {
    var R = GTP.Content && GTP.Content.ratio, o = R && R.opponents ? R.opponents[id] : null;
    if (o && o.replies && o.replies.length) return o;
    var cm = cast(id);
    return { name: cm ? cm.name : String(id || 'Opponent'), castId: cm ? cm.id : 'everyone', fallback: true, post: 'Didn\'t read it. Replied anyway. Ratio.', replies: ['didn\'t read', 'replied anyway', 'ratio', 'who asked', 'L', 'imagine reading'], winLine: 'Ratio.', loseLine: 'Fine. Ratio\'d.' };
  }
  function playerPosts() { var L = GTP.Content && GTP.Content.ratioPlayerPosts; return (L && L.length) ? L : ['Respectfully, no.', 'Source?', 'Read it. Replying anyway.', 'Write that down.']; }
  var ratio = {
    active: false, state: null,
    start: function (params, onResult) {
      params = params || {};
      var rng = mgRng(), oppId = params.opponent || 'dunk', opp = ratioOpponent(oppId), speed = params.speed > 0 ? params.speed : 1;
      var st = ratio.state = {
        params: params, opp: opp, oppId: oppId, onResult: onResult || null, rng: rng, speed: speed,
        postsLeft: Math.max(1, params.posts | 0 || 5), postsTotal: Math.max(1, params.posts | 0 || 5), mine: 0, theirs: 100, combo: 1, noted: 0, dunks: 0, replies: 0,
        cards: [], meter: 0.5, dir: 1, dogpile: 0, hottake: true, primed: false, replyT: 0, replyN: 0,
        phase: 'play', phaseT: 0, flash: null, caption: '', win: null, summary: '', line: '', t: 0, lastStamp: null,
        archive: oppId === 'takesworth_archive' ? ui.captionLog.slice() : null, everyone: oppId === 'everyone'
      };
      ratio.active = true;
      sfx('ui', 0.5);
      return st;
    },
    zone: function () {
      var st = ratio.state; if (!st) return null;
      var d = Math.abs(st.meter - 0.5), green = st.dogpile > 0 ? 0.05 : 0.10;
      return d < green ? 'DUNK' : d < green + 0.3 ? 'REPLY' : 'CRINGE';
    },
    post: function () {
      var st = ratio.state; if (!st || st.phase !== 'play' || st.postsLeft <= 0) return false;
      var stamp = st.primed ? 'DUNK' : ratio.zone();
      st.primed = false;
      var text = st.rng.pick(playerPosts());
      if (stamp === 'DUNK') { st.mine += 100 * st.combo; st.combo = Math.min(4, st.combo + 1); st.dunks++; if (st.everyone) st.theirs = Math.max(0, st.theirs - 40); st.flash = { text: 'DUNK  x' + (st.combo - 1), color: COL.lime, t: 0 }; sfx('dunk', 0.7); }
      else if (stamp === 'REPLY') { st.mine += 40; st.combo = 1; st.flash = { text: 'REPLY  +40', color: COL.amber, t: 0 }; sfx('ui', 0.4); }
      else { stamp = 'NOTED'; st.combo = 1; st.theirs += 60; st.noted++; st.flash = { text: 'CRINGE. NOTED.', color: COL.red, t: 0 }; sfx('hit', 0.5); }
      st.cards.push({ text: text, stamp: stamp, mine: true, t: 0 }); if (st.cards.length > 7) st.cards.shift();
      logCaption(text);
      st.lastStamp = stamp; st.postsLeft--;
      if (st.noted >= 3) { st.mine = Math.floor(st.mine / 2); st.caption = 'you were the ratio.'; ratio._summary(false, true); return true; }
      if (st.postsLeft <= 0) ratio._summary(st.mine > st.theirs, false);
      return true;
    },
    hottake: function () {
      var st = ratio.state; if (!st || st.phase !== 'play' || !st.hottake) return false;
      st.hottake = false; st.dogpile = 0; st.primed = true;
      st.flash = { text: 'Respectfully.', color: '#ff7a20', t: 0, big: true };
      sfx('explode', 0.5);
      return true;
    },
    update: function (dt) {
      var st = ratio.state; if (!st || !ratio.active) return;
      var In = GTP.Input;
      st.t += dt; st.phaseT += dt;
      if (st.flash) { st.flash.t += dt; if (st.flash.t > 0.9) st.flash = null; }
      for (var i = 0; i < st.cards.length; i++) st.cards[i].t += dt;
      if (st.phase === 'play') {
        st.theirs += 20 * st.speed * (st.everyone ? 1.5 : 1) * dt;
        if (st.dogpile > 0) st.dogpile = Math.max(0, st.dogpile - dt);
        var sp = 1.2 * st.speed * (st.dogpile > 0 ? 2 : 1);
        st.meter += st.dir * sp * dt;
        if (st.meter > 1) { st.meter = 2 - st.meter; st.dir = -1; } else if (st.meter < 0) { st.meter = -st.meter; st.dir = 1; }
        st.replyT += dt;
        if (st.replyT >= 4) {
          st.replyT -= 4; st.replyN++;
          var text = (st.archive && st.archive.length) ? st.archive[(st.replyN - 1) % st.archive.length] : st.opp.replies[(st.replyN - 1) % st.opp.replies.length];
          st.cards.push({ text: text, stamp: null, mine: false, t: 0 }); if (st.cards.length > 7) st.cards.shift();
          if (st.replyN % 3 === 0) { st.dogpile = 3; st.flash = { text: 'DOGPILE!', color: COL.red, t: 0 }; sfx('fail', 0.3); }
        }
        if (In.pressed('action') || In.pressed('confirm')) ratio.post();
        if ((In.pressed('shoot') && !(In.mouse && In.mouse.down)) || In.pressed('secondary')) ratio.hottake();   // Ctrl / pad X; a mouse click goes through the HOTTAKE button only (QA-B-TCH-03)
      } else if (st.phase === 'summary') {
        if (st.phaseT > 3.2 || (st.phaseT > 0.6 && (In.pressed('confirm') || In.pressed('action')))) ratio._finish();
      }
    },
    _summary: function (win, stamped) {
      var st = ratio.state;
      st.win = win; st.stamped = !!stamped;
      var r = st.theirs > 0 ? (st.mine / st.theirs) : st.mine;
      st.summary = 'LIKES ' + Math.round(st.mine) + ' - ' + Math.round(st.theirs) + ' · DUNKS ' + st.dunks + ' · NOTED ' + st.noted + ' · RATIO ' + r.toFixed(1);
      st.line = win ? (st.opp.loseLine || 'Ratio\'d.') : (st.opp.winLine || 'Ratio.');
      st.phase = 'summary'; st.phaseT = 0;
      sfx(win ? 'mission' : 'fail', 0.8);
    },
    _finish: function () {
      var st = ratio.state; if (!st || st.phase === 'done') return;
      st.phase = 'done'; ratio.active = false;
      var cb = st.onResult; st.onResult = null;
      if (cb) { try { cb(!!st.win); } catch (e) { U.reportError(e, 'ui.ratio.onResult'); } }
    },
    cancel: function () { ratio.active = false; if (ratio.state) { ratio.state.phase = 'done'; ratio.state.onResult = null; } },
    draw: function (ctx) {
      var st = ratio.state; if (!st) return;
      var pad = px(16), bw = Math.min(W - safe.l - safe.r, px(960)), bh = Math.min(H - safe.t - safe.b, px(600)), bx = (W - bw) / 2, by = (H - bh) / 2;
      var ts = U.clamp(bw / px(900), 0.62, 1), narrow = bw < px(560);
      panel(ctx, bx, by, bw, bh, px(16), 'rgba(8,10,20,0.9)', COL.line, 1.5);
      txt(ctx, 'RATIO WAR', bx + pad, by + px(26), { font: F(16 * ts, '900', FONT_DISPLAY), color: COL.gold, outline: false });
      txt(ctx, 'POSTS LEFT ' + st.postsLeft + '/' + st.postsTotal, bx + bw - pad, by + px(26), { font: F(12 * ts, 'bold'), color: COL.muted, align: 'right', outline: false });
      // pinned post
      var ps = px(56) * ts, ppy = by + px(40), ppw = bw - pad * 2, pph = ps + px(20);
      panel(ctx, bx + pad, ppy, ppw, pph, px(10), 'rgba(255,255,255,0.06)', hexA((cast(st.opp.castId) || {}).color || COL.cyan, 0.5));
      castPortrait(ctx, st.opp.castId || st.oppId, bx + pad + px(10), ppy + px(10), ps);
      txt(ctx, st.opp.name + '  @' + String(st.oppId).replace(/_/g, ''), bx + pad + ps + px(22), ppy + px(24), { font: F(12 * ts, 'bold'), color: COL.ink, outline: false, maxW: ppw - ps - px(150) });
      txt(ctx, '❤ ' + Math.round(st.theirs).toLocaleString(), bx + pad + ppw - px(12), ppy + px(24), { font: F(13 * ts, 'bold'), color: COL.red, align: 'right', outline: false });
      var postLines = wrap(ctx, st.opp.post, F(12 * ts, '', FONT_TEXT), ppw - ps - px(40));
      for (var i = 0; i < Math.min(2, postLines.length); i++) txt(ctx, postLines[i], bx + pad + ps + px(22), ppy + px(44) + i * px(15), { font: F(12 * ts, '', FONT_TEXT), color: '#bfe3ff', outline: false });
      // columns: replies (left), counters (right)
      var colY = ppy + pph + px(12), meterH = px(86) * ts, colH = by + bh - colY - meterH - px(16);
      var rightW = narrow ? ppw : px(200) * ts, leftW = narrow ? ppw : ppw - rightW - px(12);
      var lx = bx + pad, rx = narrow ? bx + pad : lx + leftW + px(12);
      if (narrow) { colH -= px(150); }   // room for the counters, the HOTTAKE and the NOTES under the replies (QA-B-TCH-08)
      // reply column
      var cardH = px(40) * ts, maxCards = Math.max(1, Math.floor(colH / (cardH + px(6)))), cards = st.cards.slice(-maxCards);
      var cyy = colY + colH - cardH;
      for (i = cards.length - 1; i >= 0; i--) {
        var c = cards[i], k = Math.min(1, c.t / 0.25), cxx = c.mine ? lx : lx + leftW * 0.25, cwid = leftW * 0.75;
        ctx.save(); ctx.globalAlpha = k;
        panel(ctx, cxx, cyy, cwid, cardH, px(8), c.mine ? 'rgba(255,63,164,0.12)' : 'rgba(255,255,255,0.05)', c.mine ? hexA(COL.pink, 0.5) : 'rgba(255,255,255,0.14)');
        txt(ctx, (c.mine ? 'you: ' : st.opp.name.split(' ')[0] + ': ') + c.text, cxx + px(10), cyy + cardH * 0.62, { font: F(11 * ts, c.mine ? 'bold' : '', FONT_TEXT), color: c.mine ? COL.ink : COL.muted, outline: false, maxW: cwid - px(80) });
        if (c.stamp) {
          var scol = c.stamp === 'DUNK' ? COL.lime : c.stamp === 'REPLY' ? COL.amber : COL.red;
          ctx.save(); ctx.translate(cxx + cwid - px(36), cyy + cardH / 2); ctx.rotate(-0.18 * (1 + (1 - k) * 3));
          ctx.lineWidth = 2; ctx.strokeStyle = scol; rr(ctx, -px(28), -px(10), px(56), px(20), px(3)); ctx.stroke();
          txt(ctx, c.stamp, 0, px(5), { font: F(11 * ts, '900', FONT_DISPLAY), color: scol, align: 'center', outline: false });
          ctx.restore();
        }
        ctx.restore();
        cyy -= cardH + px(6);
      }
      // counters
      var ry = narrow ? colY + colH + px(4) : colY;
      if (!narrow) panel(ctx, rx, ry, rightW, colH, px(10), 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.1)');
      var cxm = narrow ? bx + pad + ppw * 0.25 : rx + rightW / 2, cxt = narrow ? bx + pad + ppw * 0.75 : rx + rightW / 2;
      var y1 = ry + px(26), y2 = narrow ? y1 : ry + px(74);
      txt(ctx, 'YOUR LIKES', cxm, y1 - px(2), { font: F(9 * ts, 'bold'), color: COL.muted, align: 'center', outline: false });
      txt(ctx, Math.round(st.mine).toLocaleString(), cxm, y1 + px(24), { font: F(24 * ts, '900', FONT_DISPLAY), color: COL.pink, align: 'center', outline: false });
      txt(ctx, 'THEIR LIKES', cxt, y2 - px(2), { font: F(9 * ts, 'bold'), color: COL.muted, align: 'center', outline: false });
      txt(ctx, Math.round(st.theirs).toLocaleString(), cxt, y2 + px(24), { font: F(24 * ts, '900', FONT_DISPLAY), color: COL.red, align: 'center', outline: false });
      var rr0 = st.theirs > 0 ? st.mine / st.theirs : st.mine, y3 = narrow ? y1 + px(44) : ry + px(126);
      txt(ctx, 'RATIO ' + rr0.toFixed(1) + (st.combo > 1 ? '   COMBO x' + st.combo : ''), narrow ? bx + pad + ppw / 2 : rx + rightW / 2, y3, { font: F(12 * ts, 'bold'), color: rr0 > 1 ? COL.lime : COL.ink, align: 'center', outline: false });
      // hottake icon + noted boxes
      var hx = narrow ? bx + pad : rx + px(14), hy = narrow ? y3 + px(10) : ry + px(142), hs = px(34) * ts;
      panel(ctx, hx, hy, hs, hs, px(8), st.hottake ? 'rgba(255,122,32,0.25)' : 'rgba(255,255,255,0.04)', st.hottake ? '#ff7a20' : 'rgba(255,255,255,0.15)', 1.5);
      drawWeaponIcon(ctx, 'hottake', hx + hs * 0.1, hy + hs * 0.1, hs * 0.8, st.hottake ? '#ffd0a0' : 'rgba(255,255,255,0.25)');
      txt(ctx, st.hottake ? 'HOTTAKE (' + mgKey('hottake') + ')' : st.primed ? 'PRIMED' : 'USED', hx + hs + px(8), hy + hs * 0.62, { font: F(9 * ts, 'bold'), color: st.hottake ? '#ffd0a0' : COL.muted, outline: false, maxW: narrow ? px(90) : rightW - hs - px(26) });
      hit(hx, hy, hs + px(90), hs, function () { ratio.hottake(); }, 'hottake');
      var nby = narrow ? hy + px(10) : hy + hs + px(12), nbx = narrow ? bx + pad + ppw - 3 * (px(44) * ts + px(6)) : rx + px(14);
      txt(ctx, 'NOTES', nbx, nby - px(2), { font: F(9 * ts, 'bold'), color: COL.muted, outline: false });
      for (i = 0; i < 3; i++) {
        var filled = i < st.noted, nbw = px(44) * ts;
        panel(ctx, nbx + i * (nbw + px(6)), nby + px(4), nbw, px(20) * ts, px(4), filled ? 'rgba(255,59,48,0.3)' : 'rgba(255,255,255,0.04)', filled ? COL.red : 'rgba(255,255,255,0.2)');
        if (filled) txt(ctx, 'NOTED', nbx + i * (nbw + px(6)) + nbw / 2, nby + px(18) * ts, { font: F(8 * ts, '900', FONT_DISPLAY), color: COL.red, align: 'center', outline: false });
      }
      // meter
      var mx0 = bx + pad, mw = ppw, my = by + bh - meterH - px(8), mh = px(28);
      var green = st.dogpile > 0 ? 0.05 : 0.10;
      txt(ctx, st.dogpile > 0 ? 'DOGPILE: meter doubled, dunk zone halved' : 'METER', mx0, my - px(18), { font: F(10 * ts, 'bold'), color: st.dogpile > 0 ? (Math.floor(ui.t * 6) % 2 ? COL.red : COL.ink) : COL.muted, outline: false });
      ctx.save(); rr(ctx, mx0, my, mw, mh, px(8)); ctx.clip();
      ctx.fillStyle = COL.red; ctx.fillRect(mx0, my, mw, mh);
      ctx.fillStyle = COL.amber; ctx.fillRect(mx0 + mw * (0.5 - green - 0.3), my, mw * (green + 0.3) * 2, mh);
      ctx.fillStyle = COL.lime; ctx.fillRect(mx0 + mw * (0.5 - green), my, mw * green * 2, mh);
      ctx.restore();
      txt(ctx, 'CRINGE', mx0 + px(8), my + mh * 0.68, { font: F(9 * ts, '900', FONT_DISPLAY), color: 'rgba(0,0,0,0.6)', outline: false });
      txt(ctx, 'CRINGE', mx0 + mw - px(8), my + mh * 0.68, { font: F(9 * ts, '900', FONT_DISPLAY), color: 'rgba(0,0,0,0.6)', align: 'right', outline: false });
      txt(ctx, 'DUNK', mx0 + mw / 2, my + mh * 0.68, { font: F(9 * ts, '900', FONT_DISPLAY), color: 'rgba(0,0,0,0.7)', align: 'center', outline: false });
      txt(ctx, 'REPLY', mx0 + mw * (0.5 - green - 0.15), my + mh * 0.68, { font: F(9 * ts, '900', FONT_DISPLAY), color: 'rgba(0,0,0,0.6)', align: 'center', outline: false });
      txt(ctx, 'REPLY', mx0 + mw * (0.5 + green + 0.15), my + mh * 0.68, { font: F(9 * ts, '900', FONT_DISPLAY), color: 'rgba(0,0,0,0.6)', align: 'center', outline: false });
      var nx = mx0 + mw * st.meter;
      ctx.fillStyle = COL.ink; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(nx, my - px(2)); ctx.lineTo(nx - px(7), my - px(12)); ctx.lineTo(nx + px(7), my - px(12)); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillRect(nx - 1.5, my, 3, mh);
      var pbw = Math.min(px(220), mw), pbx = mx0 + mw / 2 - pbw / 2, pby = my + mh + px(8), pbh = px(26) * ts;
      panel(ctx, pbx, pby, pbw, pbh, px(8), st.primed ? 'rgba(255,122,32,0.3)' : 'rgba(255,63,164,0.2)', st.primed ? '#ff7a20' : COL.pink, 1.5);
      txt(ctx, st.primed ? 'POST (guaranteed DUNK)' : 'POST  (' + mgKey('post') + ')', pbx + pbw / 2, pby + pbh * 0.68, { font: F(11 * ts, 'bold'), color: COL.ink, align: 'center', outline: false, maxW: pbw - px(10) });
      hit(mx0, my - px(14), mw, mh + px(14) + pbh + px(10), function () { ratio.post(); }, 'post');
      if (st.flash) { var fk = st.flash.t / 0.9; txt(ctx, st.flash.text, W / 2, H * 0.42, { font: F(st.flash.big ? 44 : 30, '900', FONT_DISPLAY), color: st.flash.color, align: 'center', alpha: fk < 0.1 ? fk / 0.1 : 1 - Math.max(0, fk - 0.6) / 0.4, lw: px(6) }); }
      if (st.phase === 'summary') {
        var sw = Math.min(px(620), bw - pad * 2), sh = px(150), sx = (W - sw) / 2, sy = H / 2 - sh / 2;
        panel(ctx, sx, sy, sw, sh, px(14), 'rgba(8,10,20,0.96)', st.win ? COL.lime : COL.red, 2);
        txt(ctx, st.win ? 'RATIO WON' : 'RATIO\'D.', W / 2, sy + px(44), { font: F(26, '900', FONT_DISPLAY), color: st.win ? COL.lime : COL.red, align: 'center', outline: false, maxW: sw - px(20) });
        txt(ctx, st.summary, W / 2, sy + px(78), { font: F(12, 'bold'), color: COL.ink, align: 'center', outline: false, maxW: sw - px(20) });
        var tail = st.stamped ? 'CONTEXT STAMP: ' + st.caption : st.opp.name + ': “' + st.line + '”';
        txt(ctx, tail, W / 2, sy + px(104), { font: F(12, 'italic', FONT_TEXT), color: COL.muted, align: 'center', outline: false, maxW: sw - px(30) });
        txt(ctx, 'Enter to continue', W / 2, sy + sh - px(10), { font: F(9), color: COL.muted, align: 'center', outline: false });
      }
    }
  };

  // ------------------------------------------------------- touch controls ----
  function touchLayout() {
    var r = px(30), big = px(40), right = W - safe.r, bottom = H - safe.b;
    return [
      { id: 'fire', action: 'shoot', label: 'FIRE', carLabel: 'HORN', carAction: 'horn', airLabel: 'THR+', airAction: 'throttleUp', x: right - big - px(10), y: bottom - big - px(10), r: big, color: COL.pink },
      { id: 'aim', action: 'aim', label: 'AIM', carLabel: 'RADIO', carAction: 'radio', x: right - big * 2 - r - px(30), y: bottom - r - px(28), r: r, color: COL.cyan },
      { id: 'jump', action: 'jump', label: 'JUMP', carLabel: 'BRAKE', carAction: 'jump', airLabel: 'THR-', airAction: 'throttleDown', x: right - big - px(10), y: bottom - big * 2 - r - px(34), r: r, color: COL.lime },
      { id: 'enter', action: 'enter', label: 'ENTER', carLabel: 'EXIT', carAction: 'enter', x: right - big * 2 - r - px(30), y: bottom - r * 3 - px(58), r: r, color: COL.amber },
      { id: 'weapon', action: 'wheel', label: 'WPN', carLabel: 'CAM', carAction: 'cameraMode', x: right - big - px(10), y: bottom - big * 2 - r * 3 - px(56), r: px(24), color: COL.ink, hold: true },
      { id: 'reload', action: 'reload', label: 'RLD', carLabel: 'AIM', carAction: 'aim', airLabel: 'SPCL', airAction: 'special', x: right - big * 2 - r - px(30), y: bottom - r * 5 - px(84), r: px(22), color: COL.amber },
      { id: 'cover', action: 'cover', label: 'COVER', carLabel: 'BOOST', carAction: 'special', airLabel: 'YAW L', airAction: 'yawLeft', x: right - big * 3 - r * 2 - px(44), y: bottom - r - px(28), r: px(24), color: COL.cyan },
      { id: 'special', action: 'special', label: 'SPCL', carLabel: 'JOB', carAction: 'action', airLabel: 'YAW R', airAction: 'yawRight', x: right - big * 3 - r * 2 - px(44), y: bottom - r * 3 - px(46), r: px(24), color: COL.pink },
      { id: 'map', action: 'map', label: 'MAP', carLabel: 'MAP', carAction: 'map', x: W / 2 + px(portrait ? 32 : 44), y: safe.t + px(14), r: px(14), hw: px(portrait ? 28 : 40), color: COL.ink, pill: true },
      { id: 'pause', action: 'pause', label: 'PAUSE', carLabel: 'PAUSE', carAction: 'pause', x: W / 2 - px(portrait ? 32 : 44), y: safe.t + px(14), r: px(14), hw: px(portrait ? 28 : 40), color: COL.ink, pill: true }
    ];
  }
  function canvasPoint(t) {
    var Rd = GTP.Render, cv = Rd && Rd.hudCanvas, r = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    var kx = r.width && Rd && Rd.width ? Rd.width / r.width : 1, ky = r.height && Rd && Rd.height ? Rd.height / r.height : 1;   // a stage smaller than the logical size (QAC-55)
    return { x: (t.clientX - r.left) * kx, y: (t.clientY - r.top) * ky };
  }
  // the touch context: foot, car (boats too) or air (the aircraft labels and actions)
  function touchCtx() { var p = player(), In = GTP.Input; if (!p || !p.inVehicle) return 'foot'; return In && In.inAircraft && In.inAircraft() ? 'air' : 'car'; }
  function touchAction(b, c) { return c === 'air' ? (b.airAction !== undefined ? b.airAction : b.carAction) : c === 'car' ? b.carAction : b.action; }
  function touchLabel(b, c) { return c === 'air' ? (b.airLabel !== undefined ? b.airLabel : b.carLabel) : c === 'car' ? b.carLabel : b.label; }
  function touchButtonAt(x, y) {
    var c = touchCtx(), bs = ui.touch.buttons;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i], bw = b.pill ? b.hw : b.r, dx = x - b.x, dy = y - b.y, act = touchAction(b, c);
      if (!act) continue;
      if (b.pill ? (Math.abs(dx) <= bw && Math.abs(dy) <= b.r) : (dx * dx + dy * dy <= (b.r + px(8)) * (b.r + px(8)))) return { b: b, action: act, hold: c === 'foot' && b.hold };
    }
    return null;
  }
  function menuState() { var g = game(); return !g || ui.shopOpen || !!ui.modal || g.state === 'title' || g.state === 'paused' || g.state === 'minigame' || g.state === 'wasted' || g.state === 'busted' || g.state === 'gameover'; }
  function onMapPage() { var g = game(); return !!g && g.state === 'paused' && ui.pause.page === 'phone' && ui.pause.tab === 0 && !ui.confirm; }
  function handleTouch(e) {
    var In = GTP.Input, T = ui.touch, i, t, id, rec;
    T.visible = true;
    var list = e.changedTouches || e.touches || [];
    if (e.type === 'touchstart') {
      for (i = 0; i < list.length; i++) {
        t = list[i]; id = t.identifier; var pt = canvasPoint(t);
        if (onMapPage()) {
          // the map: one finger drags or taps, two pinch
          var others = Object.keys(T.ids).filter(function (k) { return T.ids[k].kind === 'map'; });
          if (others.length === 1) { var o = T.ids[others[0]]; T.pinch = { a: others[0], b: id, d: Math.hypot(pt.x - o.x, pt.y - o.y), cx: (pt.x + o.x) / 2, cy: (pt.y + o.y) / 2 }; }
          T.ids[id] = { kind: 'map', x: pt.x, y: pt.y, sx: pt.x, sy: pt.y, moved: 0 };
          continue;
        }
        var gS = game() && game().state;
        if (gS === 'paused' && ui.pause.page === 'phone' && !ui.confirm) { T.ids[id] = { kind: 'scroll', y: pt.y, sx: pt.x, sy: pt.y, moved: 0 }; continue; }   // drag scrolls, a still tap taps (QA-B-TCH-09)
        if (gS === 'cutscene' && !ui.dialogue) { T.ids[id] = { kind: 'skip', t0: ui.t }; In.set('confirm', true); continue; }   // hold anywhere = HOLD TO SKIP, a tap = next shot (QA-B-TCH-02)
        if (menuState() || ui.dialogue) { pointerTap(pt.x, pt.y); T.ids[id] = { kind: 'tap' }; continue; }
        var hb = touchButtonAt(pt.x, pt.y);
        if (hb) {
          T.ids[id] = { kind: 'button', action: hb.action, b: hb.b, hold: hb.hold, t0: ui.t };
          In.set(hb.action, true); T.btnDown[hb.b.id] = true; continue;
        }
        if (pt.x < W * 0.5 && !T.stick) { T.stick = { id: id, cx: pt.x, cy: pt.y, x: pt.x, y: pt.y }; T.ids[id] = { kind: 'stick' }; In.touch.stick.active = true; continue; }
        if (!T.look) { T.look = { id: id, x: pt.x, y: pt.y }; T.ids[id] = { kind: 'look' }; continue; }
        T.ids[id] = { kind: 'tap' };
      }
    } else if (e.type === 'touchmove') {
      for (i = 0; i < list.length; i++) {
        t = list[i]; id = t.identifier; rec = T.ids[id]; if (!rec) continue;
        var p2 = canvasPoint(t);
        if (rec.kind === 'stick' && T.stick) {
          var dx = p2.x - T.stick.cx, dy = p2.y - T.stick.cy, rad = px(52), d = Math.sqrt(dx * dx + dy * dy);
          if (d > rad) { dx = dx / d * rad; dy = dy / d * rad; }
          T.stick.x = T.stick.cx + dx; T.stick.y = T.stick.cy + dy;
          In.touch.stick.x = dx / rad; In.touch.stick.y = dy / rad; In.touch.stick.active = true;
          var mag = Math.sqrt(dx * dx + dy * dy) / rad; In.touch.buttons.run = mag > 0.9;
        } else if (rec.kind === 'look' && T.look) {
          In.touch.look.dx += (p2.x - T.look.x) * 1.6; In.touch.look.dy += (p2.y - T.look.y) * 1.6;
          T.look.x = p2.x; T.look.y = p2.y;
          if (In._markLook) In._markLook();
        } else if (rec.kind === 'scroll') {
          var sdy = p2.y - rec.y; rec.moved += Math.abs(sdy); rec.y = p2.y;
          ui.pause.scroll = Math.max(0, Math.min(ui.pause.contentH || 4000, ui.pause.scroll - sdy));
        } else if (rec.kind === 'button' && rec.hold && GTP.Combat && GTP.Combat.wheel && GTP.Combat.wheel.open) {
          // the finger holding WPN drags the wheel's selection (QA-B-TCH-12)
          In.touch.look.dx += (p2.x - (rec.lx == null ? p2.x : rec.lx)) * 1.6; In.touch.look.dy += (p2.y - (rec.ly == null ? p2.y : rec.ly)) * 1.6; rec.lx = p2.x; rec.ly = p2.y;
        } else if (rec.kind === 'map') {
          var mdx = p2.x - rec.x, mdy = p2.y - rec.y; rec.moved += Math.abs(mdx) + Math.abs(mdy); rec.x = p2.x; rec.y = p2.y;
          if (T.pinch && (T.pinch.a == id || T.pinch.b == id)) {
            var oa = T.ids[T.pinch.a], ob = T.ids[T.pinch.b];
            if (oa && ob) { var nd = Math.hypot(oa.x - ob.x, oa.y - ob.y); if (T.pinch.d > 0 && nd > 0) mapZoomAt(nd / T.pinch.d, (oa.x + ob.x) / 2, (oa.y + ob.y) / 2); T.pinch.d = nd; }
          } else if (ui.map.rect) { var k = mapScale(ui.map.rect.w, ui.map.rect.h); ui.map.cx -= mdx / k; ui.map.cz -= mdy / k; mapClampCenter(ui.map.rect.w, ui.map.rect.h); }
        }
      }
    } else {
      for (i = 0; i < list.length; i++) {
        t = list[i]; id = t.identifier; rec = T.ids[id]; if (!rec) continue;
        delete T.ids[id];
        if (rec.kind === 'stick') { T.stick = null; In.touch.stick.x = 0; In.touch.stick.y = 0; In.touch.stick.active = false; In.touch.buttons.run = false; }
        else if (rec.kind === 'look') T.look = null;
        else if (rec.kind === 'scroll') { if (rec.moved < px(10)) pointerTap(rec.sx, rec.sy); }
        else if (rec.kind === 'skip') { In.set('confirm', false); if (ui.t - rec.t0 < 0.25) In.press('back'); }
        else if (rec.kind === 'button') {
          In.set(rec.action, false); T.btnDown[rec.b.id] = false;
          if (rec.hold && ui.t - rec.t0 < 0.18) In.press('weaponNext');   // a short tap on WPN cycles; a hold opened the wheel and the release equipped
        } else if (rec.kind === 'map') {
          if (T.pinch && (T.pinch.a == id || T.pinch.b == id)) T.pinch = null;
          if (rec.moved < px(10)) { if (!pointerTap(rec.sx, rec.sy)) mapTap(rec.sx, rec.sy); }
        }
      }
    }
  }
  function drawTouch(ctx) {
    var g = game(), T = ui.touch; if (!g || g.state !== 'playing' || ui.modal) return;
    var tc = touchCtx();
    ctx.save();
    // stick
    var sx = T.stick ? T.stick.cx : safe.l + px(90), sy = T.stick ? T.stick.cy : H - safe.b - px(100), rad = px(52);
    ctx.globalAlpha = T.stick ? 0.75 : 0.4;
    ctx.fillStyle = 'rgba(10,12,24,0.5)'; ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke();
    var kx = T.stick ? T.stick.x : sx, ky = T.stick ? T.stick.y : sy;
    ctx.fillStyle = 'rgba(238,241,251,0.85)'; ctx.beginPath(); ctx.arc(kx, ky, px(22), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    var bs = T.buttons;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i], down = !!T.btnDown[b.id], label = touchLabel(b, tc);
      if (!label || !touchAction(b, tc)) continue;
      ctx.globalAlpha = down ? 0.95 : 0.6;
      if (b.pill) { panel(ctx, b.x - b.hw, b.y - b.r, b.hw * 2, b.r * 2, b.r, down ? hexA(b.color, 0.5) : 'rgba(10,12,24,0.6)', 'rgba(255,255,255,0.4)', 1.5); }
      else { ctx.fillStyle = down ? hexA(b.color, 0.55) : 'rgba(10,12,24,0.55)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = hexA(b.color, 0.8); ctx.stroke(); }
      txt(ctx, label, b.x, b.y + px(4), { font: F(b.r > px(32) ? 12 : 10, 'bold'), color: COL.ink, align: 'center', outline: false });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // --------------------------------------------------------- pointer input ----
  function pointerTap(x, y) {
    var g = game(); if (!g) return false;
    if (GTP.Audio && GTP.Audio.unlock) { try { GTP.Audio.unlock(); } catch (e) { /* optional */ } }
    // clickable rects recorded by the last draw (menus, cards, minigame controls)
    for (var i = ui.hit.length - 1; i >= 0; i--) {
      var h = ui.hit[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { try { h.fn(); } catch (e) { U.reportError(e, 'ui.click'); } return true; }
    }
    if (ui.confirm) return false;
    if (g.state === 'title') {
      var tt = ui.title;
      if (tt.page === 'controls') { tt.page = ui.settings.from === 'settings' ? 'settings' : 'menu'; ui.settings.from = null; return true; }
      if (tt.page === 'credits') { endCredits(); return true; }
      if (tt.page === 'menu') { var items = titleItems(); titleActivate(items[tt.sel] ? items[tt.sel].id : 'play'); return true; }
      if (tt.page === 'slots' && tt.seedFocus) { tt.seedFocus = false; GTP.Input.text.capture = false; }
      return false;
    }
    if ((g.state === 'cutscene' || g.state === 'playing') && ui.dialogue) { if (ui.dialogue.t > 0.12) { if (GTP.Input.latch) GTP.Input.latch(['shoot', 'action']); advanceDialogue(); } return true; }
    if (g.state === 'paused' && ui.pause.page === 'credits') { endCredits(); return true; }
    if (onMapPage()) return mapTap(x, y);
    return false;
  }
  // the d-pad quick slots: the best owned weapon of a class
  var QUICK = { quickUp: ['revolver', 'pistol'], quickRight: ['rifle', 'smg', 'shotgun', 'sniper'], quickDown: ['ratio', 'hotmic', 'hottake'], quickLeft: ['tableleg', 'megaphone', 'fist'] };
  function quickSlots(In) {
    var p = player(); if (!p || !p.weapons) return;
    for (var k in QUICK) {
      if (!In.pressed(k)) continue;
      var list = QUICK[k];
      for (var i = 0; i < list.length; i++) { var tot = p.weapons[list[i]]; if (tot > 0 || tot === Infinity) { if (p.weapon !== list[i]) { p.weapon = list[i]; sfx('swap', 0.4); } break; } }
    }
  }
  // the CONTEXT STAMPED card's keys while RETRY is on offer: left / right choose, confirm acts, cancel quits
  function retryInput(In) {
    var c = ui.card; if (!c || c.kind !== 'failed' || !retryOffer() || c.t < 0.8 || ui.dialogue) return false;
    if (In.pressed('left')) { ui.retry.sel = (ui.retry.sel + 2) % 3; sfx('ui', 0.2); }
    if (In.pressed('right')) { ui.retry.sel = (ui.retry.sel + 1) % 3; sfx('ui', 0.2); }
    if (In.pressed('confirm')) { retryActivate(RETRY_ITEMS[ui.retry.sel].id); return true; }
    if (In.pressed('cancel')) { retryActivate('quit'); return true; }
    return false;
  }
  // called every step before Game's own global input; returns true when the frame's menu input is consumed
  function handleInput(state) {
    var In = GTP.Input, g = game(); if (!In || !g) return false;
    var dt = C.STEP;
    switch (state) {
      case 'title': {
        var tt = ui.title;
        if (ui.confirm) return confirmInput(In);
        if (tt.page === 'credits') { if (In.pressed('confirm') || menuBack(In) || In.pressed('pause')) endCredits(); return true; }
        if (tt.page === 'controls') { if (menuBack(In) || In.pressed('confirm') || In.pressed('enter') || In.pressed('pause')) { { tt.page = ui.settings.from === 'settings' ? 'settings' : 'menu'; ui.settings.from = null; } } return true; }
        if (tt.page === 'settings') return settingsInput(In, function () { tt.page = 'menu'; saveSettings(); });
        if (tt.page === 'slots') return titleSlotsInput(In);
        var items = titleItems();
        if (In.pressed('forward')) { tt.sel = (tt.sel - 1 + items.length) % items.length; sfx('ui', 0.2); }
        if (menuDown(In)) { tt.sel = (tt.sel + 1) % items.length; sfx('ui', 0.2); }
        if (In.pressed('confirm') || In.pressed('enter')) titleActivate(items[tt.sel] ? items[tt.sel].id : 'play');
       
        return true;
      }
      case 'playing':
        if (ui.modal) return modalInput(In);
        if (ui.shopOpen) return shopInput(In);
        // the CONTEXT STAMPED card takes Escape as QUIT before the pause menu (QA-C1-08); P still pauses
        if (retryInput(In)) return true;
        if (In.pressed('map')) { openPause('phone'); ui.pause.tab = 0; mapCenterOnPlayer(); return true; }
        if (In.pressed('pause')) { openPause('pause'); return true; }
        if (ui.dialogue && ui.dialogue.t > 0.12 && (In.pressed('confirm') || In.pressed('action'))) { if (In.latch) In.latch(['shoot', 'action']); advanceDialogue(); return true; }
        if (ui.golf && golfInput(In)) return true;
        if (ui.interior && ui.interior.kind === 'armory' && In.pressed('lockOn')) { openArmory(ui.interior.store && (ui.interior.store.id || ui.interior.store), null); return true; }
        quickSlots(In);
        return false;
      case 'cutscene': {
        // Escape skips the shot as the pill says (the cutscene reads back / cancel itself); P / Start still pause (QA-C1-08)
        var Cs = GTP.Cutscenes, chh = Cs && Cs.hud ? Cs.hud() : null, skippable = !!(chh && chh.active && chh.skippable !== false);
        if (In.pressed('pause') && !(skippable && In.pressed('cancel'))) { openPause('pause'); return true; }
        if (skippable && In.pressed('cancel') && !In.pressed('back') && Cs.skipShot) { try { Cs.skipShot(); } catch (e) { U.reportError(e, 'ui.skipShot'); } return true; }   // Esc / Backspace / pad B skip the shot as the pill says
        if (ui.dialogue && ui.dialogue.t > 0.12 && (In.pressed('confirm') || In.pressed('action'))) { if (In.latch) In.latch(['shoot', 'action']); advanceDialogue(); return true; }
        if (In.pressed('map')) { openPause('phone'); ui.pause.tab = 0; mapCenterOnPlayer(); return true; }
        return true;
      }
      case 'paused': {
        var pg = ui.pause;
        if (ui.confirm) return confirmInput(In);
        if (pg.page === 'credits') { if (In.pressed('confirm') || menuBack(In) || In.pressed('pause')) endCredits(); return true; }
        if (pg.page === 'controls') { if (menuBack(In) || In.pressed('pause') || In.pressed('confirm')) { pg.page = ui.settings.from === 'settings' ? 'settings' : 'pause'; ui.settings.from = null; } return true; }
        if (pg.page === 'settings') return settingsInput(In, function () { pg.page = 'pause'; saveSettings(); });
        if (pg.page === 'slots') return pauseSlotsInput(In);
        if (pg.page === 'shop') return shopInput(In);
        if (pg.page === 'phone') {
          if (menuBack(In) && pg.phoneFrom === 'pause') { pg.page = 'pause'; pg.phoneFrom = null; return true; }   // back to the pause menu it came from (QA-B-FE-09)
          if (In.pressed('map') || In.pressed('pause') || menuBack(In)) { closePause(); return true; }
          if (In.pressed('tabNext') || In.pressed('lockOn')) { pg.tab = (pg.tab + 1) % PHONE_TABS.length; pg.scroll = 0; pg.row = 0; if (pg.tab === 0) mapCenterOnPlayer(); }
          if (pg.tab === 0) {
            if (In.pressed('weaponPrev')) { pg.tab = PHONE_TABS.length - 1; pg.scroll = 0; pg.row = 0; }
            if (In.pressed('weaponNext')) { pg.tab = 1; pg.scroll = 0; pg.row = 0; }
            mapInput(In, dt);
            return true;
          }
          if (In.pressed('left') || In.pressed('weaponPrev')) { pg.tab = (pg.tab + PHONE_TABS.length - 1) % PHONE_TABS.length; pg.scroll = 0; pg.row = 0; if (pg.tab === 0) mapCenterOnPlayer(); }
          if (In.pressed('right') || In.pressed('weaponNext')) { pg.tab = (pg.tab + 1) % PHONE_TABS.length; pg.scroll = 0; pg.row = 0; if (pg.tab === 0) mapCenterOnPlayer(); }
          var rows = pg.rows || [];
          if (In.pressed('forward')) { if (rows.length) pg.row = (pg.row - 1 + rows.length) % rows.length; else pg.scroll = Math.max(0, pg.scroll - px(24)); }
          if (menuDown(In)) { if (rows.length) pg.row = (pg.row + 1) % rows.length; else pg.scroll += px(24); }
          if (rows.length && tabId() !== 'STORY') pg.scroll = Math.max(0, pg.row * px(44) - px(200));
          if (In.wheelDelta) pg.scroll = Math.max(0, pg.scroll + In.wheelDelta * 0.5);
          if (In.pressed('confirm') && rows[pg.row]) missionRowActivate(rows[pg.row]);
          if (In.pressed('secondary') && tabId() === 'MISSIONS' && GTP.Missions && GTP.Missions.state && GTP.Missions.state.active) abortMission();
          if (tabId() === 'STOCKS' && rows[pg.row] && rows[pg.row].stock) { if (In.pressed('secondary')) stockTrade(rows[pg.row].stock, -10); }
          return true;
        }
        if (In.pressed('pause') || menuBack(In)) { closePause(); return true; }
        if (In.pressed('map')) { pg.page = 'phone'; pg.tab = 0; mapCenterOnPlayer(); return true; }
        if (In.pressed('forward')) { pg.sel = (pg.sel - 1 + PAUSE_ITEMS.length) % PAUSE_ITEMS.length; sfx('ui', 0.2); }
        if (menuDown(In)) { pg.sel = (pg.sel + 1) % PAUSE_ITEMS.length; sfx('ui', 0.2); }
        if (In.pressed('confirm')) pauseActivate(PAUSE_ITEMS[pg.sel].id);
       
        return true;
      }
      case 'minigame':
        if (In.pressed('pause') || In.pressed('map')) { openPause(In.pressed('map') ? 'phone' : 'pause'); return true; }   // QA-D SAVE-14
        return true;
      case 'wasted': case 'busted': case 'gameover':
        return true;
      default:
        return false;
    }
  }
  // ------------------------------------------------------------ minigames ----
  function startMinigame(gameId, params, done) {
    var g = game();
    endMinigame();
    var mg = gameId === 'ratio' ? ratio : debate;
    ui.minigame = { game: gameId === 'ratio' ? 'ratio' : 'debate', obj: mg, restore: g && g.state !== 'minigame' ? g.state : 'playing' };
    mg.start(params || {}, function (win) {
      var m = ui.minigame; ui.minigame = null;
      var g2 = game();
      if (done) { try { done(!!win); } catch (e) { U.reportError(e, 'ui.minigame.done'); } }
      if (g2 && g2.state === 'minigame') g2.setState(m && m.restore && m.restore !== 'minigame' ? m.restore : 'playing');
    });
    if (g && g.state !== 'minigame') g.setState('minigame');
    return mg.state;
  }
  function endMinigame() {
    var m = ui.minigame; if (!m) return;
    ui.minigame = null;
    if (m.obj && m.obj.cancel) m.obj.cancel();
  }

  // --------------------------------------------------------------- events ----
  function bindEvents() {
    var Ev = GTP.Events; if (!Ev || ui._events) return;
    ui._events = true;
    Ev.on('memo', function (e) { if (e) ui.memoFloat = { n: e.n | 0, total: e.total | 0, t: 0 }; });
    Ev.on('saved', function (e) { slotsDirty(); if (e && e.auto) { ui.saved.t = 1.2; ui.saved.slot = e.slot; } });
    ['save:deleted', 'save:migrated', 'loaded', 'state'].forEach(function (n) { Ev.on(n, slotsDirty); });
    try { window.addEventListener('storage', slotsDirty); } catch (e) { /* optional */ }
    Ev.on('shop:close', function () { leaveShopPage(true); });
    Ev.on('shop:open', function (e) { var CB = GTP.Combat; if (ui.shopOpen || !(CB && CB.shop && CB.shop.state && CB.shop.state.open)) return; openShop(e && e.store, e && e.landmark); });
    Ev.on('hint', function (e) { if (e) ui.hint = { id: e.id, text: e.text, keys: e.keys || [], t: 0 }; });
    Ev.on('loaded', function () { ui.waypoint = null; ui.map.route = null; ui.money.shown = null; ui.subs.shown = null; ui.gps = null; ui.boss = null; ui.range = null; ui.retry.dropped = null; if (ui.modal) closeModal(); });
    // rumble: shots that land, hits taken, the car's impacts
    var In = GTP.Input;
    Ev.on('hitmarker', function (e) { if (!In || !In.rumble) return; var CB = GTP.Combat, w = CB && CB.WEAPONS && e && e.weapon ? CB.WEAPONS[e.weapon] : null; In.rumble(e && e.kill ? 120 : 80, Math.min(1, 0.25 + ((w && w.recoil) || 1) * 0.12)); });
    Ev.on('damage', function (e) { var p = player(); if (In && In.rumble && e && (e.target === p || e.ped === p)) In.rumble(80, 0.5); });
    Ev.on('vehicle:impact', function (e) { var p = player(); if (In && In.rumble && e && e.vehicle && p && p.inVehicle === e.vehicle) In.rumble(80, Math.min(1, 0.3 + (e.speed || 5) / 20)); });
    bindEventsV3(Ev);
  }

  // --------------------------------------------------------------- state ----
  function onState(s, prev) {
    ui.prevState = prev; ui.state = s;
    var In = GTP.Input;
    if (s !== 'playing' && s !== 'paused' && ui.modal) closeModal();
    if (s === 'cutscene' && ui.card && ui.card.kind === 'passed') ui.card = null;   // the MISSION PASSED card never covers a letterboxed cinematic (QA-C1-12)
    if (s === 'playing' && prev && prev !== 'playing' && In && In.latch) In.latch(['shoot', 'action']);   // the press that left a menu / dialogue never fires (QA CMB-06)
    if (s !== 'playing' && ui.shopOpen) { leaveShopPage(s !== 'cutscene'); var CBs = GTP.Combat; if (CBs && CBs.shop && CBs.shop.state.open) { try { CBs.shop.close(); } catch (e) { /* optional */ } } }
    if (s === 'title') { ui.gps = null; ui.call = null; ui.callQueue.length = 0; ui.boss = null; ui.range = null; ui.golf = null; ui.chapter = null; ui.interior = null; ui.fade = null; ui.specials = {}; ui.title.page = 'menu'; ui.title.sel = 0; ui.title.seedFocus = false; ui.confirm = null; ui.dialogue = null; ui.toasts.length = 0; ui.banner = null; ui.card = null; endMinigame(); startAttract(); if (In) { In.pointerLockWanted = false; In.text.capture = false; } }
    else if (prev === 'title') { stopAttract(); ui.money.shown = null; ui.wanted.last = 0; ui.subs.shown = null; ui.statSnap = {}; if (In) In.text.capture = false; }
    if (s === 'playing') {
      ui.sessionStarted = true;
      if (In) In.pointerLockWanted = true;
      if (ui.pause.page === 'credits' && ui.credits) ui.credits = null;
      ui.confirm = null;
      // back from the hospital or the precinct with a mission snapshot waiting: offer RETRY again (GDD_EXPANSION 6.4)
      if ((prev === 'wasted' || prev === 'busted') && retryOffer()) {
        var Ms = GTP.Missions, lf = Ms.lastFail ? Ms.lastFail() : null;
        card('failed', failText('missionFailed', 'CONTEXT STAMPED'), lf ? lf.m.title + ': ' + (lf.text || '') : '');
      }
    }
    if (s === 'paused' || s === 'minigame' || s === 'cutscene') { if (In) { In.pointerLockWanted = s === 'cutscene'; if (s !== 'cutscene') In.releasePointerLock(); } }
    if (s === 'minigame' && !ui.minigame) { /* the Missions fallback drives it; nothing to draw but the frozen world */ }
  }

  // ---------------------------------------------------------------- draw ----
  function drawHUD(ctx) {
    var g = game(), p = player(); if (!g || !p) return;
    var inCutscene = g.state === 'cutscene';
    var top = safe.t, lx = safe.l, rx = W - safe.r;
    if (ui.touch.visible) top += px(30);
    if (inCutscene) {
      // the letterbox (12% bars), the title, the HOLD TO SKIP pill (GDD_EXPANSION 4.1)
      var bar = letterboxBar(), Cs = GTP.Cutscenes, ch = Cs && Cs.hud ? Cs.hud() : null;
      if (bar > 0) { ctx.fillStyle = '#000';   // opaque: a bright facade must not show through the bars
        ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar); }
      var Ms = GTP.Missions, h = Ms && Ms.hud ? Ms.hud() : null, title = (ch && ch.active && ch.title) ? ch.title : (h && h.title ? h.title : null);
      if (title) txt(ctx, String(title).replace(/^cs_/, '').replace(/_/g, ' ').toUpperCase(), W - safe.r, Math.max(px(16), bar - px(10)), { font: F(11, 'bold'), color: COL.gold, align: 'right', outline: false });
      if (ch && ch.active && ch.shots > 1) txt(ctx, 'SHOT ' + ((ch.shot | 0) + 1) + ' / ' + ch.shots, safe.l, Math.max(px(16), bar - px(10)), { font: F(10, 'bold'), color: COL.muted, outline: false });
      if (ch && ch.active && ch.skippable !== false) {
        var k = clamp01(ch.skip || 0), pw = px(170), ph = px(26), pxx = W - safe.r - pw, py = H - bar + (bar > ph + px(8) ? (bar - ph) / 2 : -ph - px(10));
        panel(ctx, pxx, py, pw, ph, px(13), 'rgba(10,12,24,0.85)', k > 0 ? COL.pink : 'rgba(255,255,255,0.25)');
        if (k > 0) { ctx.save(); rr(ctx, pxx, py, pw, ph, px(13)); ctx.clip(); ctx.fillStyle = 'rgba(255,63,164,0.45)'; ctx.fillRect(pxx, py, pw * k, ph); ctx.restore(); }
        txt(ctx, device() === 'touch' ? 'HOLD TO SKIP' : 'HOLD ' + glyph('confirm') + ' TO SKIP', pxx + pw / 2, py + px(17), { font: F(10, 'bold'), color: COL.ink, align: 'center', outline: false });
        txt(ctx, device() === 'touch' ? 'a tap skips the shot' : glyph('cancel') + ' skips the shot', pxx + pw / 2, py - px(6), { font: F(8, 'bold'), color: COL.muted, align: 'center' });
      }
      return;
    }
    ui.hudTop = top;
    var stacked = ui.touch.visible && portrait;   // phone portrait: objective row first, then map left / weapon right
    drawBars(ctx, lx, top, portrait ? px(150) : px(210));
    drawSpecials(ctx, lx, top + px(40));
    drawMoney(ctx, rx, top + px(24));
    drawStars(ctx, rx, top + px(62));
    var oy = top + (portrait ? px(56) : px(2));
    oy = drawRace(ctx, oy);
    ui.objBottom = drawObjective(ctx, oy);
    ui.objBottom = drawHoldBar(ctx, ui.objBottom);
    ui.objBottom = drawHint(ctx, ui.objBottom);
    if (stacked) { drawWeapon(ctx, rx, ui.objBottom + px(6)); drawClock(ctx, rx, ui.objBottom + px(68)); }
    else { drawClock(ctx, rx, top + px(92)); drawWeapon(ctx, rx, top + px(102)); }
    drawMinimap(ctx);
    drawGpsChip(ctx);
    drawVehicleHud(ctx);
    var m = minimapRect(), ty;
    if (stacked) ty = ui.chipBottom + px(8);
    else if (ui.touch.visible) ty = H - safe.b - px(26);
    else ty = m.y + m.s - px(26);
    if (!ui.dialogue) drawTicker(ctx, ty);
    drawMemoFloat(ctx);
    drawSavedIcon(ctx);
  }
  function draw(ctx, w, h) {
    if (!ctx) return;
    if (w && h && (w !== W || h !== H)) layout(w, h);
    ui.hit.length = 0;
    var g = game(); if (!g) return;
    var st = g.state;
    try {
      if (g.loading && g.loading.active) { drawLoading(ctx); return; }
      if (st === 'title') { drawTitle(ctx); drawConfirm(ctx); drawToasts(ctx); return; }
      var p = player();
      var hudStates = st === 'playing' || st === 'cutscene' || st === 'paused';
      var scoped = false, shopping = st === 'playing' && ui.shopOpen;
      if (p && (st === 'playing' || st === 'cutscene') && !shopping) {
        var CB = GTP.Combat; scoped = !!(st === 'playing' && CB && CB.scope && CB.scope.active);
        if (!scoped) { drawBarks(ctx); drawFxTexts(ctx); }
        if (st === 'playing' && !ui.modal) { if (!scoped) { drawMarkerLabels(ctx); drawObjectiveArrow(ctx); } drawAimOverlay(ctx); }
      }
      drawHurt(ctx);
      var modal = st === 'playing' && !!ui.modal;
      var pageHidesHud = shopping || modal || (st === 'paused' && (ui.pause.page === 'credits' || ui.pause.page === 'shop' || ui.pause.page === 'slots' || ui.pause.page === 'settings' || (ui.pause.page === 'phone' && ui.pause.tab === 0)));
      if (hudStates && !scoped && !pageHidesHud) drawHUD(ctx);
      if (scoped) { drawWeapon(ctx, W - safe.r, safe.t + px(102)); }
      if (shopping) { ctx.fillStyle = 'rgba(6,7,13,0.62)'; ctx.fillRect(0, 0, W, H); drawShop(ctx); }
      if (st === 'playing' && !shopping && !modal && !scoped && hudStates) drawPlayV3(ctx);
      if ((st === 'playing' || st === 'cutscene') && !shopping && !modal) drawBoss(ctx);
      if (modal) drawModal(ctx);
      if (st === 'playing' && !shopping) drawStunt(ctx);
      if (st === 'cutscene' || st === 'playing') drawDialogue(ctx);
      if (st === 'playing' || st === 'cutscene') { drawBanner(ctx); drawCard(ctx); }
      if (st === 'playing' && !shopping) drawWeaponWheel(ctx);
      if (st === 'wasted' || st === 'busted') drawDeathCard(ctx);
      if (st === 'minigame') {
        ctx.fillStyle = 'rgba(6,7,13,0.55)'; ctx.fillRect(0, 0, W, H);
        if (ui.minigame && ui.minigame.obj) ui.minigame.obj.draw(ctx);
        else txt(ctx, 'MINIGAME', W / 2, H / 2, { font: F(36, '900', FONT_DISPLAY), color: COL.gold, align: 'center' });
      }
      if (st === 'paused') drawPause(ctx);
      if (ui.touch.visible && !shopping) drawTouch(ctx);
      if (st === 'playing' || st === 'cutscene') drawChapter(ctx);
      drawToasts(ctx);
      if (st !== 'title') drawAchievement(ctx);
      drawFade(ctx);
      if (g.debugMode) {
        var s = g.debug.snapshot();
        txt(ctx, JSON.stringify(s.player) + ' ' + s.state + ' fps ' + s.fps + ' calls ' + s.render.calls, safe.l, H - safe.b - px(2), { font: F(10), color: 'rgba(255,255,255,0.85)', maxW: W - safe.l - safe.r });
      }
    } catch (e) { U.reportError(e, 'ui.draw'); }
  }

  // =================================================================== v0.3 ====
  // Every v0.3 screen (PLAN_V03 "ui"). Each one is coded against the plan's events and APIs with feature detection, so
  // it draws from sample payloads while the other tracks are stubs, and from the real modules after integration.
  // The interfaces read here are listed in docs/v03/ui.md.

  // ------------------------------------------------------- v0.3 helpers ----
  function parity() { return (GTP.Content && GTP.Content.parity) || {}; }
  function fmtDist(m) { m = Math.max(0, m || 0); return m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km' : Math.round(m) + ' m'; }
  function call(fn, self, args, dflt) { if (typeof fn !== 'function') return dflt; try { var r = fn.apply(self, args || []); return r === undefined ? dflt : r; } catch (e) { U.reportError(e, 'ui.call'); return dflt; } }
  function asList(v) { if (!v) return []; if (Array.isArray(v)) return v; if (typeof v === 'object') return Object.keys(v).map(function (k) { var o = v[k]; return (o && typeof o === 'object' && !Array.isArray(o)) ? Object.assign({ id: k }, o) : { id: k, value: o }; }); return []; }
  function findById(list, id) { list = asList(list); for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i]; return null; }
  function k01(v) { v = +v || 0; return v > 1.0001 ? clamp01(v / 100) : clamp01(v); }   // a meter as 0..1 or 0..100
  function groundY(x, z) { var Wd = GTP.World; try { return Wd && Wd.heightAt ? Wd.heightAt(x, z, 0) || 0 : 0; } catch (e) { return 0; } }
  function missionTitle(id) {
    var Ms = GTP.Missions, all = Ms && Ms.allMissions ? call(Ms.allMissions, Ms, [], []) : [];
    for (var i = 0; i < all.length; i++) if (all[i] && all[i].id === id) return all[i].title || id;
    var pm = findById(parity().missions, id); if (pm && pm.title) return pm.title;
    var t = String(id || '').replace(/^[a-z]\d+[a-z]?_/, '').replace(/_/g, ' ');   // h01_casing -> Casing
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function storyNext() { var S = GTP.Story; return S && S.next ? call(S.next, S, [], null) : null; }
  function storyChapter() {
    var S = GTP.Story, ch = S ? S.chapter : null;
    if (typeof ch === 'function') ch = call(ch, S, [], null);
    if (ch == null && ui.chapterSeen) ch = ui.chapterSeen;
    return ch;
  }
  // a small glossy panel used by every v0.3 card: a dark glass fill with a hairline and an accent strip on the left
  function glass(ctx, x, y, w, h, accent, r) {
    var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(22,26,46,0.94)'); g.addColorStop(1, 'rgba(9,11,22,0.94)');
    panel(ctx, x, y, w, h, r == null ? px(12) : r, g, 'rgba(255,255,255,0.14)', 1);
    if (accent) { ctx.save(); rr(ctx, x, y, w, h, r == null ? px(12) : r); ctx.clip(); ctx.fillStyle = accent; ctx.fillRect(x, y, px(4), h); ctx.restore(); }
  }
  function button(ctx, x, y, w, h, label, opts) {
    opts = opts || {};
    var col = opts.color || COL.pink, on = !!opts.sel || hovering(x, y, w, h), dis = !!opts.disabled;
    panel(ctx, x, y, w, h, px(8), dis ? 'rgba(255,255,255,0.05)' : on ? hexA(col, 0.38) : hexA(col, 0.16), dis ? 'rgba(255,255,255,0.18)' : col, on && !dis ? 2 : 1.2);
    txt(ctx, label, x + w / 2, y + h / 2 + px(4.5), { font: opts.font || F(12, 'bold'), color: dis ? COL.muted : COL.ink, align: 'center', outline: false, maxW: w - px(10) });
    if (opts.fn && !dis) hit(x, y, w, h, opts.fn, opts.id);
  }
  function statBar(ctx, label, v, x, y, w, col, delta) {
    txt(ctx, label, x, y + px(8), { font: F(9, 'bold'), color: COL.muted, outline: false });
    var bx = x + px(84), bw = w - px(84);
    panel(ctx, bx, y, bw, px(8), px(4), 'rgba(255,255,255,0.1)', null);
    v = clamp01(v);
    if (delta && Math.abs(delta) > 0.004) {
      var nv = clamp01(v + delta);
      ctx.fillStyle = col; rr(ctx, bx, y, bw * Math.min(v, nv), px(8), px(4)); ctx.fill();
      ctx.fillStyle = delta > 0 ? COL.lime : COL.red; ctx.fillRect(bx + bw * Math.min(v, nv), y + px(1), bw * Math.abs(nv - v), px(6));
    } else { ctx.fillStyle = col; rr(ctx, bx, y, bw * v, px(8), px(4)); ctx.fill(); }
  }
  // the money chip every shop screen shows top-right
  function moneyChip(ctx, rx, y) {
    var p = player(), s = U.fmtMoney(ui.money.shown == null ? (p ? p.money : 0) : ui.money.shown);
    txt(ctx, s, rx, y, { font: F(22, 'bold'), color: COL.lime, align: 'right', outline: false });
  }
  function payMoney(price) {
    var p = player(); if (!p) return false;
    price = Math.max(0, Math.round(price || 0));
    if ((p.money | 0) < price) return false;
    p.money -= price; if (p.stats) { p.stats.spent = (p.stats.spent || 0) + price; }
    return true;
  }
  // a weapon silhouette for any id: the twelve drawn icons, else the class glyph of the parity weapon
  var CLASS_ICON = { pistol: 'pistol', handgun: 'pistol', sidearm: 'pistol', revolver: 'revolver', smg: 'smg', machine_pistol: 'smg', rifle: 'rifle', assault: 'rifle', carbine: 'rifle', lmg: 'rifle', mg: 'rifle', shotgun: 'shotgun', sniper: 'sniper', marksman: 'sniper', dmr: 'sniper', launcher: 'ratio', heavy: 'ratio', rocket: 'ratio', thrown: 'hottake', throwable: 'hottake', explosive: 'hotmic', melee: 'tableleg' };
  var DRAWN = { fist: 1, megaphone: 1, pistol: 1, revolver: 1, smg: 1, rifle: 1, shotgun: 1, sniper: 1, hottake: 1, hotmic: 1, ratio: 1, tableleg: 1 };
  function weaponDef(id) { return findById(parity().weapons, id) || ((expansion().weapons || {})[id] ? Object.assign({ id: id }, expansion().weapons[id]) : null) || (GTP.Combat && GTP.Combat.WEAPONS && GTP.Combat.WEAPONS[id] ? Object.assign({ id: id }, GTP.Combat.WEAPONS[id]) : null); }
  function weaponClass(id) { var d = weaponDef(id); return String((d && (d.class || d.cls)) || id || '').toLowerCase(); }
  function iconFor(id) { if (DRAWN[id]) return id; var c = weaponClass(id); for (var k in CLASS_ICON) if (c.indexOf(k) >= 0) return CLASS_ICON[k]; return 'pistol'; }
  function weaponIcon(ctx, id, x, y, s, color) { drawWeaponIcon(ctx, iconFor(id), x, y, s, color); }

  // ---------------------------------------------------------------- GPS ----
  // gps:set {x, z, label, kind} / gps:clear. The route comes from GTP.World.route (v0.3 world track), else
  // World.findPath (car mode), else a straight line; it is trimmed as the player drives it and rebuilt every 3 s or when
  // the player strays 35 m off it. The minimap and the big map draw it in the kind's colour, the HUD shows a turn chip.
  function gpsColor(kind) { return kind === 'story' ? COL.gold : kind === 'objective' ? COL.amber : kind === 'stranger' ? '#c084fc' : kind === 'job' ? COL.cyan : kind === 'shop' ? COL.green : kind === 'property' ? COL.white : '#c084fc'; }
  function gpsSet(e) {
    if (!e || typeof e.x !== 'number' || typeof e.z !== 'number') return;
    // story sends {x, z, label, kind:'story'|'objective', route, missionId}; a route in the payload is used as is
    var rt = Array.isArray(e.route) && e.route.length > 1 ? e.route.slice() : null;
    ui.gps = { x: e.x, z: e.z, label: String(e.label || ''), kind: e.kind || 'story', missionId: e.missionId || null, route: rt, routeT: rt ? 3 : 0, dist: 0, len: 0, turn: null, t: 0 };
  }
  function computeRoute(ax, az, bx, bz, o) {
    var Wd = GTP.World, path = null, failed = false;
    try { if (Wd && typeof Wd.route === 'function') path = Wd.route(ax, az, bx, bz); } catch (e) { path = null; }
    if (!path || path.length < 2) { try { if (Wd && Wd.findPath) path = Wd.findPath(ax, az, bx, bz, { mode: 'car', fromY: o && o.fromY, maxExpansions: 20000 }); } catch (e) { path = null; } }
    if (!path || !path.length) { path = [{ x: ax, z: az }]; failed = true; }
    var last = path[path.length - 1];
    if (!last || U.dist2d(last.x, last.z, bx, bz) > 1) path = path.concat([{ x: bx, z: bz }]);
    path.failed = failed;
    return path;
  }
  function updateGps(dt) {
    var G = ui.gps, p = player(); if (!G || !p) return;
    G.t += dt;
    G.dist = U.dist2d(p.x, p.z, G.x, G.z);
    if (G.kind !== 'story' && G.kind !== 'objective' && G.kind !== 'stranger' && G.dist < 12) { ui.gps = null; toast('Arrived: ' + (G.label || 'destination')); return; }   // story-owned routes are moved on by the story
    G.routeT -= dt;
    if (G.route && G.route.length > 1) {
      var best = 0, bd = 1e9, n = Math.min(G.route.length - 1, 16);
      for (var i = 0; i <= n; i++) { var d = U.dist2d(p.x, p.z, G.route[i].x, G.route[i].z); if (d < bd) { bd = d; best = i; } }
      if (bd > 35) { G.routeT = 0; G.offRoute = true; } else { G.offRoute = false; if (best > 0) G.route = G.route.slice(best); }
    }
    if (G.routeT <= 0 || !G.route) {
      var moved = G.lastFrom ? U.dist2d(p.x, p.z, G.lastFrom.x, G.lastFrom.z) : 1e9;
      if (!G.route || moved > (G.failed ? 30 : 10) || bdNeeded(G)) { G.route = computeRoute(p.x, p.z, G.x, G.z, { fromY: p.y }); G.failed = !!G.route.failed; G.lastFrom = { x: p.x, z: p.z }; }
      G.routeT = G.failed ? 10 : 3;
    }
    var len = 0, px0 = p.x, pz0 = p.z;
    for (var j = 0; j < G.route.length; j++) { len += U.dist2d(px0, pz0, G.route[j].x, G.route[j].z); px0 = G.route[j].x; pz0 = G.route[j].z; }
    G.len = len;
    G.turn = gpsTurn(G.route, p);
  }
  function bdNeeded(G) { return !!G.offRoute && !G.failed; }   // a failed (straight-line) route is not chased every frame
  // the next turn along the route: {dir: 'straight'|'left'|'right'|'around', dist}
  function gpsTurn(route, p) {
    if (!route || route.length < 2) return { dir: 'straight', dist: ui.gps ? ui.gps.dist : 0 };
    var Rd = GTP.Render, yaw = Rd && Rd.rig ? Rd.rig.yaw : 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
    var a = route[0], b = route[1], hx = b.x - p.x, hz = b.z - p.z;
    if (Math.hypot(hx, hz) < 4 && route[2]) { hx = route[2].x - p.x; hz = route[2].z - p.z; }
    var lx = hx * cs - hz * sn, ly = hx * sn + hz * cs;   // the minimap's rotation: up = camera forward
    var fwd = -ly;   // + ahead of the camera, lx + to the right
    if (fwd < -Math.abs(lx) * 0.5 && Math.hypot(hx, hz) > 12) return { dir: 'around', dist: Math.hypot(hx, hz) };
    var dist = U.dist2d(p.x, p.z, a.x, a.z);
    for (var i = 1; i < route.length - 1; i++) {
      var p0 = route[i - 1], p1 = route[i], p2 = route[i + 1];
      var d1x = p1.x - p0.x, d1z = p1.z - p0.z, d2x = p2.x - p1.x, d2z = p2.z - p1.z;
      var l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
      dist += l1;
      if (l1 < 0.5 || l2 < 0.5) continue;
      var cross = (d1x * d2z - d1z * d2x) / (l1 * l2), dot = (d1x * d2x + d1z * d2z) / (l1 * l2);
      if (dot < 0.8 && dist > 6) return { dir: cross > 0 ? 'right' : 'left', dist: dist };
      if (dist > 600) break;
    }
    return { dir: 'straight', dist: ui.gps ? ui.gps.len : dist };
  }
  function drawTurnArrow(ctx, dir, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = s * 0.16; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (dir === 'left' || dir === 'right') {
      var m = dir === 'left' ? -1 : 1;
      ctx.moveTo(-m * s * 0.15, s * 0.45); ctx.lineTo(-m * s * 0.15, -s * 0.05); ctx.quadraticCurveTo(-m * s * 0.15, -s * 0.2, m * s * 0.05, -s * 0.2); ctx.lineTo(m * s * 0.2, -s * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(m * s * 0.45, -s * 0.2); ctx.lineTo(m * s * 0.18, -s * 0.42); ctx.lineTo(m * s * 0.18, s * 0.02); ctx.closePath(); ctx.fill();
    } else if (dir === 'around') {
      ctx.moveTo(s * 0.22, s * 0.45); ctx.lineTo(s * 0.22, -s * 0.1); ctx.arc(0, -s * 0.1, s * 0.22, 0, Math.PI, true); ctx.lineTo(-s * 0.22, s * 0.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.22, s * 0.42); ctx.lineTo(-s * 0.42, s * 0.12); ctx.lineTo(-s * 0.02, s * 0.12); ctx.closePath(); ctx.fill();
    } else {
      ctx.moveTo(0, s * 0.45); ctx.lineTo(0, -s * 0.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 0.46); ctx.lineTo(-s * 0.24, -s * 0.12); ctx.lineTo(s * 0.24, -s * 0.12); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // the route on the minimap (thick, in the kind's colour) and the destination blip on the rim when it is far
  function drawGpsMinimap(ctx, toLocal, clampEdge) {
    var G = ui.gps, p = player(); if (!G || !p) return;
    var col = gpsColor(G.kind);
    if (G.route && G.route.length && G.dist > 15) {
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (var pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? col : 'rgba(0,0,0,0.55)'; ctx.lineWidth = pass ? px(3.5) : px(6.5);
        ctx.beginPath(); var l0 = toLocal(p.x, p.z); ctx.moveTo(l0.x, l0.y);
        for (var i = 0; i < G.route.length; i++) { var l = toLocal(G.route[i].x, G.route[i].z); ctx.lineTo(l.x, l.y); }
        ctx.stroke();
      }
      ctx.restore();
    }
    var lt = toLocal(G.x, G.z);
    if (lt.far) { var e = clampEdge(lt); ctx.save(); ctx.translate(e.x, e.y); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -px(7)); ctx.lineTo(px(7), 0); ctx.lineTo(0, px(7)); ctx.lineTo(-px(7), 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
    else { ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2; var s2 = px(8) * (1 + 0.12 * Math.sin(ui.t * 5)); ctx.beginPath(); ctx.moveTo(lt.x, lt.y - s2); ctx.lineTo(lt.x + s2, lt.y); ctx.lineTo(lt.x, lt.y + s2); ctx.lineTo(lt.x - s2, lt.y); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
  }
  function drawGpsBigMap(ctx, toS) {
    var G = ui.gps, p = player(); if (!G || !p) return;
    var col = gpsColor(G.kind), s;
    if (G.route && G.route.length) {
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (var pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? col : 'rgba(0,0,0,0.6)'; ctx.lineWidth = pass ? px(3) : px(6);
        ctx.beginPath(); s = toS(p.x, p.z); ctx.moveTo(s.x, s.y);
        for (var i = 0; i < G.route.length; i++) { s = toS(G.route[i].x, G.route[i].z); ctx.lineTo(s.x, s.y); }
        ctx.stroke();
      }
      ctx.restore();
    }
    s = toS(G.x, G.z);
    ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x, s.y - px(9)); ctx.lineTo(s.x + px(9), s.y); ctx.lineTo(s.x, s.y + px(9)); ctx.lineTo(s.x - px(9), s.y); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    if (G.label) txt(ctx, G.label, s.x, s.y - px(13), { font: F(10, 'bold'), color: col, align: 'center', lw: 2, maxW: px(180) });
  }
  // the route chip: the next turn and the distance, the destination and the total underneath
  function drawGpsChip(ctx) {
    var G = ui.gps, g = game(); if (!G || !g || g.state !== 'playing' || !G.turn || indoors()) return;
    var col = gpsColor(G.kind), m = minimapRect(), w = Math.min(px(250), m.left ? W - safe.l - safe.r : px(260)), h = px(46);
    var x, y;
    if (m.top) { x = m.left ? m.x : m.x + m.s - w; y = ui.chipBottom + px(6); }
    else { x = m.x + m.s - w; y = m.y - px(44) - h - px(6); }
    ui.gpsChipRect = { x: x, y: y, w: w, h: h };
    glass(ctx, x, y, w, h, col, px(10));
    var arrived = G.dist < 15;
    drawTurnArrow(ctx, arrived ? 'straight' : G.turn.dir, x + px(28), y + h / 2, px(30), col);
    var head = arrived ? 'ARRIVED' : G.turn.dir === 'around' ? 'TURN AROUND' : G.turn.dir === 'straight' ? fmtDist(G.len) : fmtDist(G.turn.dist) + '  ' + (G.turn.dir === 'left' ? 'TURN LEFT' : 'TURN RIGHT');
    txt(ctx, head, x + px(52), y + px(20), { font: F(13, 'bold'), color: COL.ink, outline: false, maxW: w - px(60) });
    var sub = (G.kind === 'story' ? 'STORY  ·  ' : G.kind === 'objective' ? 'OBJECTIVE  ·  ' : '') + (G.label || 'Destination') + (arrived || G.turn.dir === 'straight' ? '' : '  ·  ' + fmtDist(G.len));
    txt(ctx, sub, x + px(52), y + px(36), { font: F(10, 'bold'), color: col, outline: false, maxW: w - px(60) });
  }

  // ---------------------------------------------------- long-range labels ----
  // Mission markers (and the GPS target, shops, doors) carry a floating label with the distance out to 400 m, so a new
  // player sees where the story is from the street (PLAN_V03: markers visible from 200 m). Labels fade with distance,
  // the story's next mission gets a gold STORY tag, overlapping labels are dropped.
  var LABEL_MAX = 420;
  function labelTargets() {
    var p = player(), out = [], marks = allMarkers(), nx = storyNext(), G = ui.gps, i;
    for (i = 0; i < marks.length; i++) {
      var mk = marks[i]; if (typeof mk.x !== 'number') continue;
      var isMission = mk.kind === 'mission' || mk.kind === 'stranger', isShop = mk.kind === 'shop' || mk.kind === 'door' || mk.kind === 'interior';
      if (!isMission && !isShop) continue;
      var d = U.dist2d(p.x, p.z, mk.x, mk.z);
      if (d < 7 || d > (isMission ? LABEL_MAX : 160)) continue;
      var story = !!(nx && (nx.missionId === mk.missionId || nx.missionId === mk.id));
      out.push({ x: mk.x, y: mk.y, z: mk.z, d: d, title: mk.title || '', sub: isMission && mk.giver ? castName(mk.giver) : '', col: story ? COL.gold : isMission ? '#4aa8ff' : markerColor(mk), story: story, mission: isMission });
    }
    if (G && G.dist > 7) {
      var dup = false; for (i = 0; i < out.length; i++) if (U.dist2d(out[i].x, out[i].z, G.x, G.z) < 8) { dup = true; out[i].story = out[i].story || G.kind === 'story'; out[i].col = gpsColor(G.kind); }
      if (!dup) out.push({ x: G.x, z: G.z, d: G.dist, title: G.label || 'Destination', sub: '', col: gpsColor(G.kind), story: G.kind === 'story', mission: true });
    }
    out.sort(function (a, b) { return (b.story ? 1 : 0) - (a.story ? 1 : 0) || a.d - b.d; });
    return out.slice(0, 8);
  }
  function drawMarkerLabels(ctx) {
    var Rd = GTP.Render, p = player(), g = game(); if (!Rd || !Rd.worldToScreen || !p || !g || g.state !== 'playing') return;
    var list = indoors() ? [] : labelTargets(), rects = [], G = ui.gps;
    ui.labelsDrawn = 0; ui.gpsLabelDrawn = false;
    for (var i = 0; i < list.length; i++) {
      var L = list[i], y = (typeof L.y === 'number' ? L.y : groundY(L.x, L.z)) + 3.6, s;
      try { s = Rd.worldToScreen(L.x, y, L.z); } catch (e) { s = null; }
      if (!s || !s.visible || s.depth >= 1 || s.sx < px(20) || s.sx > W - px(20) || s.sy < px(60) || s.sy > H - px(40)) continue;
      var a = L.d < 140 ? 1 : U.clamp(1 - (L.d - 140) / (LABEL_MAX - 140) * 0.55, 0.45, 1);
      var font = F(L.mission ? 12 : 10, 'bold'), tw = Math.min(px(200), measure(ctx, L.title, font)), dw = measure(ctx, fmtDist(L.d), F(10, 'bold'));
      var w = Math.max(tw, dw + (L.story ? px(52) : 0)) + px(22), h = L.mission ? px(36) : px(30), bx = s.sx - w / 2, by = s.sy - h - px(14);
      var clash = false;
      for (var r = 0; r < rects.length; r++) { var q = rects[r]; if (bx < q.x + q.w && bx + w > q.x && by < q.y + q.h && by + h > q.y) { clash = true; break; } }
      if (clash) continue;
      rects.push({ x: bx, y: by, w: w, h: h });
      if (G && U.dist2d(L.x, L.z, G.x, G.z) < 8) ui.gpsLabelDrawn = true;
      ctx.save(); ctx.globalAlpha = a;
      panel(ctx, bx, by, w, h, px(8), 'rgba(9,11,22,0.78)', hexA(L.col, 0.75), 1.5);
      txt(ctx, L.title, s.sx, by + px(15), { font: font, color: COL.ink, align: 'center', outline: false, maxW: px(200) });
      if (L.story) { var tagW = px(44); panel(ctx, bx + px(8), by + h - px(15), tagW, px(12), px(3), L.col, null); txt(ctx, 'STORY', bx + px(8) + tagW / 2, by + h - px(6), { font: F(8, '900'), color: '#141008', align: 'center', outline: false }); }
      txt(ctx, fmtDist(L.d), L.story ? bx + w - px(10) : s.sx, by + h - px(6), { font: F(10, 'bold'), color: L.col, align: L.story ? 'right' : 'center', outline: false });
      // the stem and the diamond on the marker
      ctx.strokeStyle = hexA(L.col, 0.8); ctx.lineWidth = px(1.5); ctx.beginPath(); ctx.moveTo(s.sx, by + h); ctx.lineTo(s.sx, s.sy - px(6)); ctx.stroke();
      ctx.fillStyle = L.col; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.beginPath(); ctx.moveTo(s.sx, s.sy - px(6)); ctx.lineTo(s.sx + px(6), s.sy); ctx.lineTo(s.sx, s.sy + px(6)); ctx.lineTo(s.sx - px(6), s.sy); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ui.labelsDrawn++;
    }
  }

  // --------------------------------------------------------- phone calls ----
  // phone:call {from, lines}: the phone rings for 1.4 s (an INCOMING CALL card with the caller's portrait), then the
  // lines play one by one inside the card (each 2.2 s + 0.045 s per character) while the player keeps control. Calls queue;
  // a call that arrives in a cutscene or a menu waits for play. Lines are strings or {who, text}.
  function phoneCall(e) {
    if (!e) return;
    // story sends lines as {who, name, color, text}: the resolved name and colour win over the cast table
    var lines = (e.lines || []).map(function (l) { return typeof l === 'string' ? { who: e.from, name: e.name || null, text: l } : { who: l.who || l.from || e.from, name: l.name || (l.who === e.from ? e.name : null) || null, color: l.color || null, text: String(l.text || l.line || '') }; }).filter(function (l) { return l.text; });
    ui.callQueue.push({ from: e.from || 'everyone', name: e.name || null, lines: lines, missionId: e.missionId || null, title: e.title || null });
  }
  function lineSecs(l) { return 2.2 + String(l.text || '').length * 0.045; }
  function updateCalls(dt) {
    var g = game(); if (!g) return;
    var c = ui.call;
    if (!c) {
      if (!ui.callQueue.length || g.state !== 'playing' || ui.modal || ui.shopOpen) return;
      c = ui.call = ui.callQueue.shift(); c.t = 0; c.phase = 'ring'; c.i = 0; c.lt = 0;
      sfx('phone', 0.5);
      return;
    }
    if (g.state !== 'playing' && g.state !== 'paused') return;
    if (g.state === 'paused') return;
    c.t += dt;
    if (c.phase === 'ring' && c.t > 1.4) { c.phase = 'talk'; c.lt = 0; if (c.lines[0]) logCall(c, c.lines[0]); }
    else if (c.phase === 'talk') {
      c.lt += dt;
      var l = c.lines[c.i];
      if (!l || c.lt > lineSecs(l)) { c.i++; c.lt = 0; if (c.i >= c.lines.length) { c.phase = 'end'; c.endT = 0; } else logCall(c, c.lines[c.i]); }
    } else if (c.phase === 'end') { c.endT = (c.endT || 0) + dt; if (c.endT > 0.8) ui.call = null; }
  }
  function logCall(c, l) { ui.callLog.push({ from: c.from, who: l.who, text: l.text, day: game() ? game().time.day : 1, clock: game() ? game().time.clock : 0 }); if (ui.callLog.length > 30) ui.callLog.shift(); }
  function skipCallLine() { var c = ui.call; if (!c) return; if (c.phase === 'ring') { c.phase = 'talk'; c.lt = 0; if (c.lines[0]) logCall(c, c.lines[0]); } else if (c.phase === 'talk') c.lt = 1e3; }
  function drawCall(ctx) {
    var c = ui.call, g = game(); if (!c || !g || (g.state !== 'playing')) return;
    var w = Math.min(px(340), W - safe.l - safe.r), ps = px(54), lines = [], font = F(13, '', FONT_TEXT);
    var l = c.phase === 'talk' ? c.lines[c.i] : null;
    if (l) lines = wrap(ctx, l.text, font, w - ps - px(40)).slice(0, 4);
    var h = Math.max(px(74), px(50) + lines.length * px(17));
    var m = minimapRect(), x, y;
    if (ui.touch.visible && portrait) { x = (W - w) / 2; y = Math.max(ui.objBottom + px(4), H * 0.3); }
    else if (ui.touch.visible) { x = (W - w) / 2; y = H * 0.18; }
    else { x = W - safe.r - w; y = Math.min(m.y - px(56) - h - (ui.gps ? px(52) : 0), H * 0.62 - h); }
    var slide = c.phase === 'ring' ? (1 - ease(Math.min(1, c.t / 0.3))) * px(40) : c.phase === 'end' ? ease(Math.min(1, (c.endT || 0) / 0.8)) * px(40) : 0;
    var a = c.phase === 'end' ? 1 - Math.min(1, (c.endT || 0) / 0.8) : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(slide, 0);
    var who = l ? l.who : c.from, cm = cast(who), col = (l && l.color) || (cm && cm.color) || COL.cyan, whoName = (l && l.name) || (!l && c.name) || castName(who);
    if (typeof col === 'number') col = '#' + ('000000' + col.toString(16)).slice(-6);
    glass(ctx, x, y, w, h, COL.lime, px(14));
    // the portrait in a ring that pulses while it rings
    var pcx = x + px(16) + ps / 2, pcy = y + px(12) + ps / 2;
    if (c.phase === 'ring') { for (var r = 0; r < 2; r++) { var k = ((c.t * 1.6) + r * 0.5) % 1; ctx.strokeStyle = hexA(COL.lime, 0.6 * (1 - k)); ctx.lineWidth = px(2); ctx.beginPath(); ctx.arc(pcx, pcy, ps / 2 + px(3) + k * px(14), 0, Math.PI * 2); ctx.stroke(); } }
    ctx.save(); ctx.beginPath(); ctx.arc(pcx, pcy, ps / 2, 0, Math.PI * 2); ctx.clip(); castPortrait(ctx, who, x + px(16), y + px(12), ps); ctx.restore();
    ctx.strokeStyle = col; ctx.lineWidth = px(2); ctx.beginPath(); ctx.arc(pcx, pcy, ps / 2, 0, Math.PI * 2); ctx.stroke();
    var tx = x + ps + px(28);
    txt(ctx, String(whoName).toUpperCase(), tx, y + px(24), { font: F(13, 'bold'), color: col, outline: false, maxW: w - ps - px(110) });
    var status = c.phase === 'ring' ? (Math.floor(c.t * 3) % 2 ? 'INCOMING CALL' : 'INCOMING CALL ·') : U.fmtTime(Math.floor(c.t));
    txt(ctx, status, x + w - px(14), y + px(23), { font: F(10, 'bold'), color: c.phase === 'ring' ? COL.lime : COL.muted, align: 'right', outline: false });
    if (c.phase === 'ring') {
      // a handset glyph and the caller's role under the name
      txt(ctx, (cm && cm.role) || 'Calling...', tx, y + px(44), { font: F(11, '', FONT_TEXT), color: COL.muted, outline: false, maxW: w - ps - px(40) });
      ctx.save(); ctx.translate(x + w - px(26), y + h - px(22)); ctx.rotate(Math.sin(c.t * 30) * 0.25); ctx.fillStyle = COL.lime; rr(ctx, -px(9), -px(4), px(18), px(8), px(4)); ctx.fill(); ctx.fillRect(-px(9), -px(4), px(5), px(9)); ctx.fillRect(px(4), -px(4), px(5), px(9)); ctx.restore();
    }
    for (var i = 0; i < lines.length; i++) txt(ctx, lines[i], tx, y + px(44) + i * px(17), { font: font, color: COL.ink, outline: false });
    if (c.phase === 'talk' && c.lines.length > 1) {   // progress dots
      for (var d2 = 0; d2 < c.lines.length; d2++) { ctx.fillStyle = d2 <= c.i ? COL.lime : 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(x + w - px(14) - (c.lines.length - 1 - d2) * px(9), y + h - px(10), px(2.6), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    ui.callRect = { x: x, y: y, w: w, h: h };
  }

  // -------------------------------------------------------- chapter cards ----
  // chapter {act, title}: a full-width cinematic card for 5 s on top of everything (play or cutscene)
  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  // chapter {act, title, roman}: the parity titles already carry "Act I: ..."; the card prints the act once
  function chapterTitle(t) { return String(t || '').replace(/^\s*(act|chapter)\s+[ivxlc0-9]+\s*[:.\-–]\s*/i, ''); }
  function chapterCard(e) { if (!e) return; ui.chapter = { act: e.act, roman: e.roman || null, title: chapterTitle(e.title), t: 0, dur: 5.2 }; ui.chapterSeen = { act: e.act, title: chapterTitle(e.title) }; sfx('chapter', 0.6); }
  function drawChapter(ctx) {
    var c = ui.chapter; if (!c) return;
    var k = c.t / c.dur, a = k < 0.08 ? k / 0.08 : k > 0.86 ? (1 - k) / 0.14 : 1;
    ctx.save(); ctx.globalAlpha = clamp01(a);
    var vg = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.7); vg.addColorStop(0, 'rgba(4,5,10,0)'); vg.addColorStop(0.25, 'rgba(4,5,10,0.82)'); vg.addColorStop(0.75, 'rgba(4,5,10,0.82)'); vg.addColorStop(1, 'rgba(4,5,10,0)');
    ctx.fillStyle = vg; ctx.fillRect(0, H * 0.3, W, H * 0.4);
    var wipe = ease(Math.min(1, c.t / 0.9)), lw = Math.min(W * 0.5, px(520)) * wipe, cy = H * 0.5;
    ctx.fillStyle = COL.gold; ctx.fillRect(W / 2 - lw, cy - px(46), lw * 2, px(2)); ctx.fillRect(W / 2 - lw, cy + px(40), lw * 2, px(2));
    var act = c.roman ? 'ACT ' + c.roman : typeof c.act === 'number' ? 'ACT ' + (ROMAN[c.act] || c.act) : String(c.act || '').toUpperCase();
    txt(ctx, act, W / 2, cy - px(18), { font: F(14, 'bold'), color: COL.gold, align: 'center', outline: false });
    var rise = (1 - ease(Math.min(1, c.t / 0.7))) * px(12);
    txt(ctx, c.title.toUpperCase(), W / 2, cy + px(24) + rise, { font: F(portrait ? 26 : 40, '900', FONT_DISPLAY), color: COL.ink, align: 'center', lw: px(5), outline: 'rgba(0,0,0,0.6)', maxW: W - px(40) });
    ctx.restore();
  }

  // --------------------------------------------------------- achievements ----
  function achievementDef(id) { return findById(parity().achievements, id) || {}; }
  function achievementToast(e) {
    if (!e || !e.id || ui.achSeen[e.id]) return;
    ui.achSeen[e.id] = true;
    var d = achievementDef(e.id);
    ui.achQueue.push({ id: e.id, name: e.name || d.name || e.id, desc: e.desc || d.desc || d.description || '', t: 0, dur: 4.6 });
    sfx('achievement', 0.6);
  }
  function updateAchievements(dt) { var a = ui.achQueue[0]; if (!a) return; a.t += dt; if (a.t > a.dur) ui.achQueue.shift(); }
  function trophy(ctx, cx, cy, s, col) {
    ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(-s * 0.36, -s * 0.38); ctx.lineTo(s * 0.36, -s * 0.38); ctx.quadraticCurveTo(s * 0.34, s * 0.08, 0, s * 0.12); ctx.quadraticCurveTo(-s * 0.34, s * 0.08, -s * 0.36, -s * 0.38); ctx.fill();
    ctx.lineWidth = s * 0.08; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(-s * 0.36, -s * 0.2, s * 0.13, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke(); ctx.beginPath(); ctx.arc(s * 0.36, -s * 0.2, s * 0.13, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
    ctx.fillRect(-s * 0.06, s * 0.1, s * 0.12, s * 0.16); ctx.fillRect(-s * 0.22, s * 0.26, s * 0.44, s * 0.1);
    ctx.restore();
  }
  function drawAchievement(ctx) {
    var a = ui.achQueue[0]; if (!a) return;
    var k = a.t / a.dur, slide = k < 0.08 ? 1 - ease(k / 0.08) : k > 0.88 ? ease((k - 0.88) / 0.12) : 0;
    var w = Math.min(px(380), W - safe.l - safe.r), h = a.desc ? px(64) : px(52), x = (W - w) / 2, y = safe.t + px(ui.touch.visible ? 40 : 8) - slide * px(90);
    ctx.save();
    glass(ctx, x, y, w, h, COL.gold, h / 2);
    var cx = x + h / 2, cy = y + h / 2, r = h / 2 - px(6);
    var rg = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r); rg.addColorStop(0, '#ffe08a'); rg.addColorStop(1, '#b07a12');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    trophy(ctx, cx, cy, r * 1.2, '#2a1c04');
    // a shine sweeping across the pill once
    var sk = clamp01((a.t - 0.25) / 0.6); if (sk > 0 && sk < 1) { ctx.save(); rr(ctx, x, y, w, h, h / 2); ctx.clip(); var sx = x + sk * (w + px(80)) - px(40); var sg = ctx.createLinearGradient(sx - px(30), 0, sx + px(30), 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.18)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(sx - px(30), y, px(60), h); ctx.restore(); }
    var tx = x + h + px(4);
    txt(ctx, 'ACHIEVEMENT UNLOCKED', tx, y + px(18), { font: F(9, 'bold'), color: COL.gold, outline: false });
    txt(ctx, a.name, tx, y + px(36), { font: F(15, '900', FONT_DISPLAY), color: COL.ink, outline: false, maxW: w - h - px(20) });
    if (a.desc) txt(ctx, a.desc, tx, y + px(52), { font: F(10, '', FONT_TEXT), color: COL.muted, outline: false, maxW: w - h - px(20) });
    ctx.restore();
  }

  // ------------------------------------------------- interiors and doors ----
  // interior:fade {phase:'out'|'in'}: the UI draws the black fade (0.35 s each way; a lone 'out' clears after 3 s);
  // interior:enter shows the place's name card; inside the armory a one-line browse hint sits at the bottom.
  function interiorFade(e) { var ph = e && e.phase === 'in' ? 'in' : 'out'; ui.fade = { phase: ph, t: 0, from: ui.fade ? fadeAlpha() : (ph === 'in' ? 1 : 0) }; }
  function fadeAlpha() { var f = ui.fade; if (!f) return 0; var k = clamp01(f.t / 0.35); return f.phase === 'out' ? f.from + (1 - f.from) * k : f.from * (1 - k); }
  function updateFade(dt) { var f = ui.fade; if (!f) return; f.t += dt; if ((f.phase === 'in' && f.t > 0.35) || (f.phase === 'out' && f.t > 3)) ui.fade = null; }
  function drawFade(ctx) { var a = fadeAlpha(); if (a <= 0.001) return; ctx.fillStyle = 'rgba(0,0,0,' + a.toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
  var INTERIOR_NAMES = { armory: 'Both Sides Arms', clothing: 'Lanyard & Co.', barber: 'Clip Joint', safehouse: 'Safehouse', range: 'The Range' };
  // a store is a landmark id (GTP.Interiors' interior:enter {store}); its name is the Combat shop's store, else the landmark's
  function storeLabel(store, kind) {
    if (store && typeof store === 'object') return store.name || store.title || storeLabel(store.id, kind);
    if (store) {
      var CB = GTP.Combat, list = CB && CB.shop && CB.shop._stores, Wd = GTP.World, lm = null;
      if (list) for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === store && list[i].name) return list[i].name;
      if (Wd && typeof Wd.landmark === 'function') lm = call(Wd.landmark, Wd, [store], null);
      if (lm && (lm.name || lm.label)) return landmarkLabel(lm) || lm.name;
    }
    return INTERIOR_NAMES[kind] || '';
  }
  function interiorEnter(e) {
    if (!e) return;
    ui.interior = { id: e.id, kind: e.kind || e.id, store: e.store || null, landmark: e.landmark || null, t: 0 };
    var name = storeLabel(e.store || e.landmark, e.kind) || e.name || String(e.id || '').replace(/_/g, ' ');
    ui.placeCard = { title: name, sub: e.kind === 'armory' ? 'We arm both sides. That\'s balance.' : e.kind === 'clothing' ? 'Dress for the outrage you want.' : e.kind === 'barber' ? 'Hair that holds a take.' : e.kind === 'safehouse' ? 'Bed saves. Wardrobe changes.' : '', t: 0 };
  }
  function drawPlaceCard(ctx) {
    var c = ui.placeCard; if (!c || ui.range || ui.rangeEnd) return;
    var k = c.t / 3.6, a = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
    ctx.save(); ctx.globalAlpha = clamp01(a);
    var y = H * 0.24;
    txt(ctx, c.title.toUpperCase(), W / 2, y, { font: F(portrait ? 24 : 34, '900', FONT_DISPLAY), color: COL.ink, align: 'center', lw: px(5), outline: 'rgba(0,0,0,0.7)', maxW: W - px(40) });
    if (c.sub) txt(ctx, c.sub, W / 2, y + px(24), { font: F(13, 'italic', FONT_TEXT), color: COL.gold, align: 'center', maxW: W - px(40) });
    ctx.restore();
  }
  function drawInteriorHint(ctx) {
    var I = ui.interior, g = game(); if (!I || !g || g.state !== 'playing' || ui.modal) return;
    var Is = GTP.Interiors; if (Is && Is.active === false) return;
    var text = I.kind === 'armory' ? 'Look at a rack: ' + glyph('action') + ' inspect  ·  ' + glyph('tabNext') + ' full catalog  ·  the back door is the range'
      : I.kind === 'clothing' ? 'Walk into the changing booth to try things on' : I.kind === 'barber' ? 'Sit in the chair for a cut' : I.kind === 'safehouse' ? 'The bed saves  ·  the wardrobe changes your look' : '';
    if (!text) return;
    var font = F(11, 'bold'), w = Math.min(measure(ctx, text, font) + px(28), W - px(20)), y = H - safe.b - px(ui.touch.visible ? 200 : 64);
    panel(ctx, (W - w) / 2, y, w, px(26), px(13), 'rgba(9,11,22,0.82)', 'rgba(255,255,255,0.16)');
    txt(ctx, text, W / 2, y + px(17), { font: font, color: COL.ink, align: 'center', outline: false, maxW: w - px(20) });
  }
  // the vehicle's name bottom-right on entering (GTA style)
  function vehicleName(v) {
    if (!v) return '';
    if (v.name) return v.name;
    var Vs = GTP.Vehicles, h = Vs && typeof Vs.hud === 'function' ? call(Vs.hud, Vs, [v], null) : null;
    if (h && h.name && h.name !== v.type) return h.name;
    var T = { sedan: 'Pundit Sedan', sports: 'Hot Take GT', suv: 'HOA Patrol SUV', van: 'Podcast Van', truck: 'Mattress Truck', taxi: 'Loud Cab', cop: 'Cruiser', police: 'Cruiser', moto: 'Mic Drop 600', bike: 'Mic Drop 600', heli: 'Spin Cycle Helicopter', plane: 'Op-Ed Prop', jet: 'Thinkpiece Jet', speedboat: 'Hot Water Speedboat', jetski: 'Sidebar Jet Ski', boat: 'Boat', parachute: 'Parachute' };
    return T[v.type] || String(v.type || 'vehicle').replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }
  function drawVehicleName(ctx) {
    var n = ui.vehName; if (!n) return;
    var k = n.t / 3, a = k < 0.12 ? k / 0.12 : k > 0.75 ? (1 - k) / 0.25 : 1, m = minimapRect();
    var x = m.left || ui.touch.visible ? W / 2 : m.x - px(16), y = m.left || ui.touch.visible ? H * 0.34 : m.y + m.s - px(46);
    ctx.save(); ctx.globalAlpha = clamp01(a);
    txt(ctx, n.name, x, y, { font: F(portrait ? 20 : 26, '900', FONT_DISPLAY), color: COL.ink, align: m.left || ui.touch.visible ? 'center' : 'right', lw: px(5), outline: 'rgba(0,0,0,0.75)', maxW: W * 0.6 });
    if (n.sub) txt(ctx, n.sub, x, y + px(18), { font: F(11, 'bold'), color: COL.cyan, align: m.left || ui.touch.visible ? 'center' : 'right' });
    ctx.restore();
  }
  // ------------------------------------------------------------ crosshair ----
  // aim mode: a dot that grows four ticks with the bloom; the colour and shape say what the dot rests on.
  // States (ui.crosshair.state, for tests): aim, hostile (red), friendly (amber: a civilian or a car), range (grey, hollow:
  // out of the weapon's range), hit (white flare), headshot (gold, a HEADSHOT tag), kill (pink X), reload (amber arc),
  // blind (a wide dashed ring: blind fire from cover), melee (a small ring), throw (an arc under the dot: lobbed), hip
  // (a bare dot after a shot without aiming), scope (the Fact Checker's sight).
  function isHostile(t) { return !!t && (t.role === 'cop' || t.role === 'swat' || t.role === 'thug' || t.hostile || (t.kind === 'vehicle' && t.isPolice) || t.kind === 'heli' || t.kind === 'boss' || t.boss); }
  function crossState(hud, aim, p) {
    var hm = hud && hud.hitmark, w = hud && hud.weapon, t = aim.target || (aim.hover && typeof aim.hover === 'object' ? aim.hover : null) || aim.hoverEntity || null, wd = w ? weaponDef(w.id) : null;
    var cov = (hud && hud.cover && hud.cover.active ? hud.cover : null) || (p && p.pose && p.pose.cover), ch = hud && hud.crosshair;
    if (w && w.reloading) return 'reload';
    if (hm && hm.kill && hm.age < 0.4) return 'kill';
    if (hm && hm.zone === 'head' && hm.age < 0.45) return 'headshot';
    if (hm && hm.age < 0.12) return 'hit';
    if (cov && cov.blind) return 'blind';
    if (w && (w.cls === 'melee' || w.id === 'fist' || w.id === 'tableleg' || (wd && /melee/.test(String(wd.class || ''))))) return 'melee';
    if (w && (w.cls === 'thrown' || w.cls === 'lobbed' || w.id === 'hottake' || w.id === 'hotmic' || (wd && wd.projectile === 'lobbed'))) return 'throw';
    if (isHostile(t) || (!t && ch && ch.hostile)) return 'hostile';
    if (t || aim.hover || (ch && ch.target)) return 'friendly';
    if (aim.inRange === false || (ch && ch.inRange === false)) return 'range';
    return 'aim';
  }
  var CROSS_COL = { aim: '#ffffff', hostile: '#ff3b30', friendly: '#ffbe3c', range: 'rgba(200,205,220,0.55)', hit: '#ffffff', headshot: '#ffd23c', kill: '#ff3fa4', reload: '#ffbe3c', blind: '#ffffff', melee: '#ffffff', throw: '#ffffff' };
  function drawCrosshair(ctx, sx, sy, state, bloomK, hud, now) {
    var col = CROSS_COL[state] || '#ffffff', hm = hud && hud.hitmark;
    var gap = px(5) + px(20) * bloomK + (state === 'hit' || state === 'headshot' ? px(4) : 0), len = px(7);
    ctx.save(); ctx.lineCap = 'round';
    function ticks(lw, c) {
      ctx.lineWidth = lw; ctx.strokeStyle = c; ctx.beginPath();
      ctx.moveTo(sx - gap - len, sy); ctx.lineTo(sx - gap, sy); ctx.moveTo(sx + gap, sy); ctx.lineTo(sx + gap + len, sy);
      ctx.moveTo(sx, sy - gap - len); ctx.lineTo(sx, sy - gap); ctx.moveTo(sx, sy + gap); ctx.lineTo(sx, sy + gap + len); ctx.stroke();
    }
    if (state === 'blind') {
      ctx.setLineDash([px(4), px(5)]); ctx.lineWidth = px(4); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(sx, sy, px(26) + px(14) * bloomK, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = px(2); ctx.strokeStyle = col; ctx.stroke(); ctx.setLineDash([]);
      txt(ctx, 'BLIND FIRE', sx, sy + px(46), { font: F(9, 'bold'), color: COL.ink, align: 'center' });
    } else if (state === 'melee') {
      ctx.lineWidth = px(4); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(sx, sy, px(7), 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = px(2); ctx.strokeStyle = col; ctx.stroke();
    } else if (state !== 'kill') {
      ticks(px(4.5), 'rgba(0,0,0,0.5)'); ticks(px(2), col);
    }
    if (state === 'throw') {   // a little lob arc under the dot
      ctx.lineWidth = px(2); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.setLineDash([px(3), px(4)]);
      ctx.beginPath(); ctx.moveTo(sx - px(16), sy + px(26)); ctx.quadraticCurveTo(sx, sy + px(6), sx + px(16), sy + px(26)); ctx.stroke(); ctx.setLineDash([]);
    }
    // the dot: hollow when out of range
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(sx, sy, px(3.4), 0, Math.PI * 2); ctx.fill();
    if (state === 'range') { ctx.lineWidth = px(1.5); ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(sx, sy, px(2.4), 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, px(2.2), 0, Math.PI * 2); ctx.fill(); }
    if (state === 'kill' && hm) {
      var kx = px(10) + (hm.age / 0.4) * px(6);
      ctx.lineWidth = px(5); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.moveTo(sx - kx, sy - kx); ctx.lineTo(sx + kx, sy + kx); ctx.moveTo(sx + kx, sy - kx); ctx.lineTo(sx - kx, sy + kx); ctx.stroke();
      ctx.lineWidth = px(2.6); ctx.strokeStyle = col; ctx.stroke();
      if (hm.zone === 'head') txt(ctx, 'HEADSHOT', sx, sy + px(36), { font: F(10, '900'), color: CROSS_COL.headshot, align: 'center' });
    } else if (state === 'headshot') {
      ctx.lineWidth = px(2); ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(sx, sy - px(12)); ctx.lineTo(sx + px(12), sy); ctx.lineTo(sx, sy + px(12)); ctx.lineTo(sx - px(12), sy); ctx.closePath(); ctx.stroke();
      txt(ctx, 'HEADSHOT', sx, sy + px(36), { font: F(10, '900'), color: col, align: 'center' });
    }
    ctx.restore();
    void now;
  }
  function drawAimOverlay(ctx) {
    var CB = GTP.Combat, g = game(), p = player(); if (!CB || !g || g.state !== 'playing' || !CB.aim) return;
    var hud = CB.hud ? CB.hud() : null, aim = CB.aim, s = aim.screen, now = g.time.t;
    var bloomK = hud && hud.bloom ? clamp01(hud.bloom.k || 0) : 0, rel = hud && hud.weapon ? hud.weapon.reloading : null, scope = hud && hud.scope;
    var w = hud && hud.weapon, ranged = !!(w && !w.infinite && w.id !== 'fist');
    ui.crosshair.state = null;
    if (!aim.active) {
      // hip fire: a bare dot while the bloom from the last shots is up
      if (ranged && bloomK > 0.02 && !p.inVehicle) {
        var hx = s && s.visible ? s.sx : W / 2, hy = s && s.visible ? s.sy : H / 2;
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(hx, hy, px(3.4), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, px(2), 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ui.crosshair.state = 'hip';
      }
      return;
    }
    ctx.save(); ctx.lineCap = 'round';
    if (scope) { drawScope(ctx, scope, s, hud && hud.hitmark, rel); ctx.restore(); ui.crosshair.state = 'scope'; return; }
    if (s && s.visible) {
      var st = crossState(hud, aim, p);
      ui.crosshair.state = st;
      drawCrosshair(ctx, s.sx, s.sy, st, bloomK, hud, now);
      if (rel) {   // the reload arc fills clockwise over the reload
        ctx.lineWidth = px(3); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(s.sx, s.sy, px(18), 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = COL.amber; ctx.beginPath(); ctx.arc(s.sx, s.sy, px(18), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(rel.k)); ctx.stroke();
      }
      if (hud && hud.cook) drawCook(ctx, s.sx, s.sy + px(24), hud.cook, now);
    }
    var t = aim.target, ts = aim.targetScreen;
    if (t && ts && ts.visible) {
      var hm = hud && hud.hitmark, k = Math.min(1, (now - (aim.lockT || 0)) / 0.25), size = px(32) + (1 - k) * px(28), half = size / 2, c = px(9);
      var flash = hm && hm.age < 0.15;
      ctx.save(); ctx.translate(ts.sx, ts.sy); ctx.rotate((1 - k) * 0.6);
      var bracket = function () { ctx.beginPath(); ctx.moveTo(-half, -half + c); ctx.lineTo(-half, -half); ctx.lineTo(-half + c, -half); ctx.moveTo(half - c, -half); ctx.lineTo(half, -half); ctx.lineTo(half, -half + c); ctx.moveTo(half, half - c); ctx.lineTo(half, half); ctx.lineTo(half - c, half); ctx.moveTo(-half + c, half); ctx.lineTo(-half, half); ctx.lineTo(-half, half - c); ctx.stroke(); };
      ctx.lineWidth = px(5); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; bracket();
      ctx.lineWidth = px(2.2); ctx.strokeStyle = flash ? '#ffffff' : isHostile(t) ? COL.red : COL.amber; bracket();
      var hp = targetHp(t);
      ctx.fillStyle = 'rgba(10,12,20,0.75)'; rr(ctx, -half, half + px(6), size, px(6), px(3)); ctx.fill();
      ctx.fillStyle = hp > 0.5 ? COL.lime : hp > 0.25 ? COL.amber : COL.red; rr(ctx, -half, half + px(6), size * hp, px(6), px(3)); ctx.fill();
      var label = targetLabel(t);
      txt(ctx, label, 0, half + px(24), { font: F(11, 'bold'), color: COL.ink, align: 'center' });
      ctx.restore();
    }
    ctx.restore();
  }
  // the hot mic's fuse: under the crosshair while aiming, else over the weapon panel (on foot from the hip, in a car)
  function drawCook(ctx, cx, y, cook, now) {
    var ck = clamp01(cook.k), bw = px(56);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; rr(ctx, cx - bw / 2, y, bw, px(7), px(3)); ctx.fill();
    ctx.fillStyle = ck > 0.7 ? COL.red : '#ff7a20'; rr(ctx, cx - bw / 2, y, bw * (1 - ck), px(7), px(3)); ctx.fill();
    txt(ctx, 'ON AIR ' + Math.max(0, (cook.total || 0) - (cook.t || 0)).toFixed(1) + ' s', cx, y + px(20), { font: F(9, 'bold'), color: Math.floor(now * (4 + 12 * ck)) % 2 ? COL.red : COL.ink, align: 'center' });
  }
  function drawCookHUD(ctx) {
    var CB = GTP.Combat, g = game(); ui.cookShown = false; if (!CB || !CB.hud || !g || g.state !== 'playing' || (CB.aim && CB.aim.active)) return;
    var hud = CB.hud(); if (!hud || !hud.cook) return;
    ui.cookShown = true;
    drawCook(ctx, W / 2, H * 0.6, hud.cook, g.time.t);
  }

  // -------------------------------------------------------- context prompts ----
  // bottom-centre pills with the device's glyphs: cover (Q / B) near cover, the in-cover moves, aim / fire while a gun is
  // out (until the player has aimed three times), bail out of an aircraft, the parachute.
  function pill(ctx, keys, label, x, y, opts) {
    opts = opts || {};
    var h = px(26), font = F(11, 'bold'), kw = 0, i;
    keys = [].concat(keys || []);
    for (i = 0; i < keys.length; i++) kw += measure(ctx, keys[i], F(10, 'bold')) + px(18);
    var w = kw + measure(ctx, label, font) + px(18);
    var x0 = opts.align === 'center' ? x - w / 2 : x;
    panel(ctx, x0, y, w, h, h / 2, opts.fill || 'rgba(9,11,22,0.84)', opts.stroke || 'rgba(255,255,255,0.2)', 1);
    var kx = x0 + px(6);
    for (i = 0; i < keys.length; i++) kx += keyPill(ctx, keys[i], kx, y + px(5), px(16), { fill: 'rgba(255,255,255,0.92)', color: '#0b1020', stroke: null }) + px(4);
    txt(ctx, label, kx + px(4), y + px(17), { font: font, color: opts.color || COL.ink, outline: false });
    return w;
  }
  // GTP.Combat.hud().cover: {active, high, edge, canVault, blind, ...} in cover, else {near, nearHigh}; hud().prompt is
  // 'counter' | 'cover' | 'vault' | 'peek'
  function coverHud() { var CB = GTP.Combat, h = CB && CB.hud ? call(CB.hud, CB, [], null) : null; return h && h.cover ? h.cover : null; }
  function coverAvailable(p) {
    var CB = GTP.Combat, cv = CB && CB.cover, ch = coverHud();
    if (ch) return ch.active ? null : (ch.near ? { high: ch.nearHigh } : null);
    if (p && p._coverNear) return p._coverNear;
    if (p && p.coverHint) return p.coverHint;
    if (!cv) return null;
    if (typeof cv.available === 'function') return call(cv.available, cv, [p], null);
    if (cv.available) return cv.available;
    if (typeof cv.candidate === 'function') return call(cv.candidate, cv, [p], null);
    return null;
  }
  function inCover(p) { var ch = coverHud(); if (ch) return !!ch.active; return !!((p && (p.cover || (p.pose && p.pose.cover))) || ui.cover.on); }
  function promptList() {
    var p = player(), g = game(), out = []; if (!p || !g || g.state !== 'playing' || ui.modal || ui.shopOpen || ui.dialogue) return out;
    var CB = GTP.Combat, hud = CB && CB.hud ? CB.hud() : null, w = hud && hud.weapon, aiming = !!(CB && CB.aim && CB.aim.active), v = p.inVehicle;
    if (ui.golf && ui.golf.active) return out;
    if (v) {
      var cat = vehCat(v), alt = p.y - groundY(p.x, p.z);
      var vhp = vehHud(v), bail = vhp && vhp.family ? vhp.prompt === 'Bail out' : alt > 30;
      if ((cat === 'heli' || cat === 'plane') && bail) out.push({ keys: [glyph('enter')], label: 'BAIL OUT', color: COL.amber });
      if (cat === 'chute' && chuteState(p) === 'open') out.push({ keys: [glyph('enter')], label: 'CUT AWAY' });
      return out;
    }
    if (chuteState(p) === 'freefall') return out;   // the big DEPLOY prompt is drawn on its own
    if (hud && hud.prompt === 'counter') out.push({ keys: [glyph('jump')], label: 'COUNTER', color: COL.red });
    if (inCover(p)) {
      var cov = (hud && hud.cover && hud.cover.active ? hud.cover : null) || p.cover || (p.pose && p.pose.cover) || {};
      out.push({ keys: [glyph('aim')], label: cov.edge || cov.high === false ? 'PEEK' : 'AIM' });
      out.push({ keys: [glyph('shoot')], label: aiming ? 'FIRE' : 'BLIND FIRE' });
      if (cov.canVault || cov.high === false || ui.cover.low) out.push({ keys: [glyph('jump')], label: 'VAULT' });
      out.push({ keys: [glyph('cover')], label: 'LEAVE COVER' });
      return out;
    }
    var ca = coverAvailable(p);
    if (ca) out.push({ keys: [glyph('cover')], label: 'TAKE COVER', color: COL.cyan });
    var ranged = w && !w.infinite && w.id !== 'fist' && w.cls !== 'melee';
    if (ranged && !aiming && ui.aimTutor.n < 3 && ui.aimTutor.shown < 40) {
      out.push({ keys: [glyph('aim')], label: 'AIM' });
      out.push({ keys: [glyph('shoot')], label: 'FIRE' });
    }
    if (aiming && w && (w.id === 'hottake' || w.id === 'hotmic' || w.cls === 'thrown')) out.push({ keys: [glyph('shoot')], label: 'HOLD TO COOK, RELEASE TO THROW' });
    return out;
  }
  function drawPrompts(ctx) {
    var list = promptList(); ui.prompts = list.map(function (l) { return l.label; });
    if (!list.length) return;
    var y = ui.touch.visible ? H - safe.b - px(portrait ? 250 : 150) : H - safe.b - px(ui.boss ? 118 : 96) - (ui.dialogue ? px(130) : 0) - ui.toasts.length * px(34);   // above the toast stack
    var font = F(11, 'bold'), total = 0, ws = [], i;
    for (i = 0; i < list.length; i++) { var kw = 0; for (var k = 0; k < list[i].keys.length; k++) kw += measure(ctx, list[i].keys[k], F(10, 'bold')) + px(18); ws.push(kw + measure(ctx, list[i].label, font) + px(18)); total += ws[i] + px(8); }
    var rows = total > W - px(30) ? list.length : 1, x = (W - (total - px(8))) / 2;
    for (i = 0; i < list.length; i++) {
      if (rows > 1) { x = (W - ws[i]) / 2; pill(ctx, list[i].keys, list[i].label, x, y - (list.length - 1 - i) * px(30), { color: list[i].color }); }
      else { pill(ctx, list[i].keys, list[i].label, x, y, { color: list[i].color }); x += ws[i] + px(8); }
    }
  }

  // ---------------------------------------------------------- parachute ----
  // 'freefall' (bailed out, no canopy), 'open' (a canopy: the vehicles track's parachute vehicle, or player.parachute.open)
  function chuteState(p) {
    if (!p) return null;
    var v = p.inVehicle;
    if (v && (v.type === 'parachute' || v.kind === 'parachute' || (v.cls && v.cls.family === 'chute'))) return v.chute === 'free' ? 'freefall' : v.chute === 'landed' ? null : 'open';   // GTP.Vehicles: 'free' | 'open' | 'landed'
    var c = p.parachute;
    if (c && typeof c === 'object') return c.state || (c.open ? 'open' : c.freefall ? 'freefall' : null);
    if (p.freefall) return 'freefall';
    return null;
  }
  function drawParachute(ctx) {
    var p = player(), g = game(); if (!p || !g || g.state !== 'playing') return;
    var st = chuteState(p); if (!st) return;
    var vh = p.inVehicle ? vehHud(p.inVehicle) : null, alt = Math.max(0, vh && vh.alt != null ? vh.alt : p.y - groundY(p.x, p.z));
    ui.chuteShown = st;
    if (st === 'freefall') {
      var pulse = 1 + 0.06 * Math.sin(ui.t * 10), y = H * 0.66;
      ctx.save(); ctx.translate(W / 2, y); ctx.scale(pulse, pulse);
      var label = 'DEPLOY PARACHUTE', kw = measure(ctx, glyph('jump'), F(14, 'bold')) + px(22), w = kw + measure(ctx, label, F(18, '900', FONT_DISPLAY)) + px(36);
      panel(ctx, -w / 2, -px(24), w, px(48), px(24), alt < 60 ? 'rgba(255,59,48,0.85)' : 'rgba(9,11,22,0.88)', COL.amber, 2);
      keyPill(ctx, glyph('jump'), -w / 2 + px(14), -px(12), px(24), { size: 14, fill: '#fff', color: '#0b1020', stroke: null });
      txt(ctx, label, -w / 2 + px(22) + kw, px(7), { font: F(18, '900', FONT_DISPLAY), color: COL.ink, outline: false });
      ctx.restore();
      txt(ctx, 'ALTITUDE ' + Math.round(alt) + ' m', W / 2, y + px(46), { font: F(13, 'bold'), color: alt < 60 ? COL.red : COL.ink, align: 'center' });
      return;
    }
    // canopy open: the altitude, the descent and the steering line
    var vy = vh && vh.vs != null ? vh.vs : (p.vy != null ? p.vy : 0), x = W / 2, yy = H - safe.b - px(ui.touch.visible ? 220 : 110);
    var cw = px(240);
    glass(ctx, x - cw / 2, yy, cw, px(54), COL.cyan, px(10));
    txt(ctx, Math.round(alt) + ' m', x - cw / 2 + px(18), yy + px(32), { font: F(22, '900', FONT_DISPLAY), color: COL.ink, outline: false });
    txt(ctx, 'ALT', x - cw / 2 + px(18), yy + px(46), { font: F(8, 'bold'), color: COL.muted, outline: false });
    txt(ctx, (vy < 0 ? '▼ ' : '▲ ') + Math.abs(vy).toFixed(1) + ' m/s', x + cw / 2 - px(14), yy + px(26), { font: F(12, 'bold'), color: COL.cyan, align: 'right', outline: false });
    txt(ctx, 'steer ' + (device() === 'gamepad' ? 'LS' : 'WASD') + '  ·  ' + glyph('enter') + ' cut away', x + cw / 2 - px(14), yy + px(44), { font: F(9, 'bold'), color: COL.muted, align: 'right', outline: false });
  }

  // -------------------------------------------------------- vehicle HUDs ----
  // vehicle.hud() -> {speed (m/s), alt (m), pitch, roll, heading (rad), throttle (0..1), gear}: a bike gauge with the lean,
  // an aircraft panel (attitude ball, heading tape, altitude and speed boxes, throttle / collective, PULL UP), a boat panel.
  var FAMILY_CAT = { car: 'car', moto: 'bike', heli: 'heli', plane: 'plane', boat: 'boat', chute: 'chute' };
  function vehCat(v) {
    if (v && v.cls && FAMILY_CAT[v.cls.family]) return FAMILY_CAT[v.cls.family];   // GTP.Vehicles' family
    var t = String((v && (v.type || v.kind)) || '').toLowerCase();
    if (/moto|bike|scooter|cycle/.test(t)) return 'bike';
    if (/heli/.test(t)) return 'heli';
    if (/plane|jet|aircraft|prop/.test(t)) return 'plane';
    if (/boat|jetski|ski|yacht|ship/.test(t)) return 'boat';
    if (/parachute|chute/.test(t)) return 'chute';
    return 'car';
  }
  function vehHud(v) { if (!v || typeof v.hud !== 'function') return null; try { return v.hud() || null; } catch (e) { return null; } }
  var CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  // Vehicle.hud().heading is in degrees (0 = north, clockwise); an older hud without `family` gave radians
  function headingDeg(h, deg) { var d = deg ? (h || 0) : (h || 0) * 180 / Math.PI; d = ((d % 360) + 360) % 360; return d; }
  function drawVehicleHud(ctx) {
    var p = player(), g = game(); if (!p || !g || g.state !== 'playing' || !p.inVehicle) return;
    var v = p.inVehicle, h = vehHud(v), cat = vehCat(v);
    ui.vehHudCat = h ? cat : null;
    if (!h || cat === 'car' || cat === 'chute') return;
    var w = px(cat === 'bike' || cat === 'boat' ? 210 : 300), hh = px(cat === 'bike' || cat === 'boat' ? 96 : 132);
    var mm = minimapRect(), x = safe.l, y = ui.touch.visible ? ui.hudTop + px(portrait ? 130 : 60) : mm.y + mm.s - px(40) - hh;   // clear of the radio ticker along the bottom
    if (ui.touch.visible && portrait) x = W - safe.r - w;
    glass(ctx, x, y, w, hh, cat === 'boat' ? COL.cyan : cat === 'bike' ? COL.pink : COL.amber, px(12));
    var spd = Math.abs(h.speed || 0);
    if (cat === 'bike') {
      var mph = h.mph != null ? h.mph : spd * 2.237, cx = x + px(56), cy = y + px(62), r = px(38), k = clamp01(mph / 140);
      ctx.lineCap = 'round'; ctx.lineWidth = px(7); ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
      ctx.strokeStyle = k > 0.85 ? COL.red : COL.pink; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 0.8 + Math.PI * 1.4 * k); ctx.stroke();
      txt(ctx, String(Math.round(mph)), cx, cy + px(6), { font: F(24, '900', FONT_DISPLAY), color: COL.ink, align: 'center', outline: false });
      txt(ctx, 'MPH', cx, cy + px(20), { font: F(8, 'bold'), color: COL.muted, align: 'center', outline: false });
      // the lean: a bike seen from behind tilting with the roll
      var lx = x + px(150), ly = y + px(54), roll = U.clamp(h.lean != null ? h.lean : (h.roll || 0), -1.2, 1.2);
      ctx.save(); ctx.translate(lx, ly + px(18)); ctx.rotate(roll);
      ctx.fillStyle = COL.ink; rr(ctx, -px(4), -px(34), px(8), px(34), px(3)); ctx.fill(); ctx.fillStyle = COL.pink; rr(ctx, -px(9), -px(42), px(18), px(8), px(3)); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(lx, ly + px(18), px(40), Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
      txt(ctx, 'LEAN ' + Math.round(Math.abs(roll) * 57.3) + '°', lx, y + px(88), { font: F(9, 'bold'), color: COL.muted, align: 'center', outline: false });
      if (h.gear != null) txt(ctx, 'GEAR ' + h.gear, x + w - px(10), y + px(18), { font: F(10, 'bold'), color: COL.cyan, align: 'right', outline: false });
      if ((h.wheelie != null ? h.wheelie : h.pitch || 0) > 0.3) txt(ctx, 'WHEELIE', x + w / 2, y + px(18), { font: F(11, '900'), color: COL.lime, align: 'center', outline: false });
      return;
    }
    if (cat === 'boat') {
      var kts = spd * 1.944;
      txt(ctx, String(Math.round(kts)), x + px(20), y + px(52), { font: F(34, '900', FONT_DISPLAY), color: COL.ink, outline: false });
      txt(ctx, 'KNOTS', x + px(22), y + px(68), { font: F(8, 'bold'), color: COL.muted, outline: false });
      throttleBar(ctx, x + w - px(30), y + px(14), px(12), hh - px(30), h.throttle, 'THR');
      var hd = headingDeg(h.heading, !!h.family);
      txt(ctx, CARD[Math.round(hd / 45) % 8] + ' ' + Math.round(hd) + '°', x + px(110), y + px(36), { font: F(13, 'bold'), color: COL.cyan, outline: false });
      if (h.planing || kts > 18) txt(ctx, 'PLANING', x + px(110), y + px(56), { font: F(9, 'bold'), color: COL.lime, outline: false });
      return;
    }
    // aircraft
    var ax = x + px(70), ay = y + px(72), ar = px(48);
    attitude(ctx, ax, ay, ar, h.pitch || 0, h.roll || 0);
    // heading tape across the top
    var hd2 = headingDeg(h.heading, !!h.family), tx0 = x + px(128), tw = w - px(176), ty = y + px(10);
    ctx.save(); rr(ctx, tx0, ty, tw, px(22), px(5)); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.clip();
    for (var dd = -60; dd <= 60; dd += 15) {
      var deg = Math.round((hd2 + dd) / 15) * 15, off = (deg - hd2) / 60 * (tw / 2), gx = tx0 + tw / 2 + off;
      var lab = deg % 45 === 0 ? CARD[((deg / 45) % 8 + 8) % 8] : '';
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(gx, ty + px(14), 1, px(6));
      if (lab) txt(ctx, lab, gx, ty + px(12), { font: F(9, 'bold'), color: lab === 'N' ? COL.amber : COL.ink, align: 'center', outline: false });
    }
    ctx.restore();
    ctx.fillStyle = COL.amber; ctx.beginPath(); ctx.moveTo(tx0 + tw / 2, ty + px(22)); ctx.lineTo(tx0 + tw / 2 - px(4), ty + px(27)); ctx.lineTo(tx0 + tw / 2 + px(4), ty + px(27)); ctx.closePath(); ctx.fill();
    // the readouts
    var alt = h.alt != null ? h.alt : (p.y - groundY(p.x, p.z));
    readout(ctx, tx0, y + px(40), tw / 2 - px(4), 'ALT', Math.round(alt) + ' m', alt < 25 ? COL.red : COL.ink);
    readout(ctx, tx0 + tw / 2 + px(4), y + px(40), tw / 2 - px(4), cat === 'heli' ? 'SPEED' : 'AIRSPEED', Math.round(spd * 1.944) + ' kt', (h.stall || (cat === 'plane' && spd < 18 && alt > 10)) ? COL.red : COL.ink);
    var vs = h.vs != null ? h.vs : h.vspeed != null ? h.vspeed : (p.inVehicle.vy || 0);
    txt(ctx, 'V/S ' + (vs >= 0 ? '+' : '') + vs.toFixed(1), tx0, y + px(100), { font: F(10, 'bold'), color: COL.muted, outline: false });
    if (h.gear != null && cat === 'plane') txt(ctx, 'GEAR ' + (h.gear === true || h.gear === 'down' || h.gear === 1 ? 'DOWN' : 'UP'), tx0 + tw, y + px(100), { font: F(10, 'bold'), color: h.gear === true || h.gear === 'down' || h.gear === 1 ? COL.lime : COL.muted, align: 'right', outline: false });
    if (cat === 'heli' && h.rotor != null && h.rotor < 0.98) txt(ctx, 'ROTOR ' + Math.round(h.rotor * 100) + '%', tx0 + tw, y + px(100), { font: F(10, 'bold'), color: COL.amber, align: 'right', outline: false });
    throttleBar(ctx, x + w - px(30), y + px(14), px(12), hh - px(40), h.throttle, cat === 'heli' ? 'COL' : 'THR');
    var warn = (h.pullUp) || (alt < 30 && (h.pitch || 0) < -0.2 && spd > 15) ? 'PULL UP' : (h.stall ? 'STALL' : null);
    ui.vehWarn = warn;
    if (warn && Math.floor(ui.t * 4) % 2 === 0) txt(ctx, warn, W / 2, H * 0.3, { font: F(26, '900', FONT_DISPLAY), color: COL.red, align: 'center', lw: px(5) });
  }
  function readout(ctx, x, y, w, label, value, col) {
    panel(ctx, x, y, w, px(42), px(6), 'rgba(0,0,0,0.35)', 'rgba(255,255,255,0.12)');
    txt(ctx, label, x + px(8), y + px(13), { font: F(8, 'bold'), color: COL.muted, outline: false });
    txt(ctx, value, x + w - px(8), y + px(34), { font: F(16, '900', FONT_DISPLAY), color: col || COL.ink, align: 'right', outline: false, maxW: w - px(12) });
  }
  function throttleBar(ctx, x, y, w, h, v, label) {
    v = clamp01(v == null ? 0 : (v < 0 ? (v + 1) / 2 : v));
    panel(ctx, x, y, w, h, px(4), 'rgba(0,0,0,0.4)', 'rgba(255,255,255,0.18)');
    var g2 = ctx.createLinearGradient(0, y + h, 0, y); g2.addColorStop(0, COL.lime); g2.addColorStop(1, COL.amber);
    ctx.fillStyle = g2; rr(ctx, x + 2, y + h - 2 - (h - 4) * v, w - 4, (h - 4) * v, px(3)); ctx.fill();
    txt(ctx, label, x + w / 2, y + h + px(11), { font: F(8, 'bold'), color: COL.muted, align: 'center', outline: false });
  }
  // the artificial horizon: sky over ground, rotated by the roll, shifted by the pitch, with the fixed wing symbol
  function attitude(ctx, cx, cy, r, pitch, roll) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(-roll);
    var off = U.clamp(pitch, -1.2, 1.2) * r * 0.9;
    ctx.fillStyle = '#2f6fb3'; ctx.fillRect(-r * 2, -r * 2 + off, r * 4, r * 2);
    ctx.fillStyle = '#7a5530'; ctx.fillRect(-r * 2, off, r * 4, r * 2);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = px(1.5); ctx.beginPath(); ctx.moveTo(-r * 2, off); ctx.lineTo(r * 2, off); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    for (var i = -2; i <= 2; i++) { if (!i) continue; var yy = off - i * r * 0.22, hw = r * (i % 2 ? 0.18 : 0.32); ctx.beginPath(); ctx.moveTo(-hw, yy); ctx.lineTo(hw, yy); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = px(2); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = COL.amber; ctx.lineWidth = px(3); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - r * 0.6, cy); ctx.lineTo(cx - r * 0.2, cy); ctx.lineTo(cx - r * 0.1, cy + r * 0.12); ctx.moveTo(cx + r * 0.6, cy); ctx.lineTo(cx + r * 0.2, cy); ctx.lineTo(cx + r * 0.1, cy + r * 0.12); ctx.stroke();
    ctx.fillStyle = COL.amber; ctx.beginPath(); ctx.arc(cx, cy, px(2.5), 0, Math.PI * 2); ctx.fill();
  }

  // ------------------------------------------------------------ boss bar ----
  // GTP.Bosses (UI.drawsBossBar): boss:start {id, name, phases}, boss:phase {id, phase, phases, hp, maxHp, name, shield,
  // state, hint}, boss:end {id, reason}; GTP.Bosses.hud() refreshes the shield text, hint and colour every frame.
  // A bar bottom-centre (the name, PHASE n / m, the hp with a white damage trail, grey while shielded, the shield
  // text or the hint under it); a phase change flashes (the bosses track banners the phase itself); boss:defeated
  // stamps RATIO'D over the name.
  function bossHud() { var B = GTP.Bosses; return B && typeof B.hud === 'function' ? call(B.hud, B, [], null) : null; }
  function bossStart(e) {
    if (!e) return;
    var h = bossHud(), hp = h && h.id === e.id ? h.hp : 1, mx = h && h.id === e.id ? h.maxHp : 1;
    if (!ui.boss || ui.boss.id !== e.id) ui.boss = { id: e.id, name: e.name || String(e.id || 'BOSS'), phase: 1, phases: e.phases || null, hp: hp, maxHp: mx, trail: hp, trailT: 0, t: 0, flashT: 0.8 };
    ui.bossDown = null;
  }
  function bossEnd(e) { if (ui.boss && (!e || !e.id || ui.boss.id === e.id)) ui.boss = null; }
  function bossPhase(e) {
    if (!e) return;
    var b = ui.boss;
    if (e.state === 'done' || e.state === 'ended') { if (b && b.id === e.id) ui.boss = null; return; }
    if (!b || b.id !== e.id) b = ui.boss = { id: e.id, name: e.name || String(e.id || 'BOSS'), phase: e.phase || 1, phases: e.phases || null, hp: e.hp, maxHp: e.maxHp || e.hp || 1, trail: e.hp, trailT: 0, t: 0, flashT: 0.8 };
    else {
      if (e.phase != null && e.phase !== b.phase) b.flashT = 1.6;
      if (e.hp != null && e.hp < b.hp) b.trailT = 0.6;
      if (e.name) b.name = e.name;
      if (e.phase != null) b.phase = e.phase;
      if (e.phases) b.phases = e.phases;
      if (e.maxHp) b.maxHp = e.maxHp;
      if (e.hp != null) b.hp = e.hp;
    }
    if (e.shield !== undefined) b.shield = !!e.shield;
    if (e.hint !== undefined) b.hint = e.hint || '';
    if (e.state) b.state = e.state;
    if (b.hp > b.trail) b.trail = b.hp;
  }
  function bossDefeated(e) { var b = ui.boss; ui.bossDown = { name: b && (!e || b.id === e.id) ? b.name : (e && e.name) || 'BOSS', t: 0 }; if (!e || !b || b.id === e.id) ui.boss = null; sfx('chapter', 0.5); }
  function updateBoss(dt) {
    var b = ui.boss;
    if (b) {
      var h = bossHud();
      if (h && h.id === b.id) { b.shield = !!h.shield; b.shieldText = h.shieldText || ''; b.hint = h.hint || ''; b.color = h.color || null; b.state = h.state; if (h.hp != null && h.hp < b.hp) { b.trailT = 0.6; b.hp = h.hp; } }
    }
    if (b) { b.t += dt; if (b.flashT > 0) b.flashT -= dt; if (b.trailT > 0) b.trailT -= dt; else b.trail = U.damp(b.trail, b.hp, 6, dt); if (b.announce) { b.announce.t += dt; if (b.announce.t > 2) b.announce = null; } }
    if (ui.bossDown) { ui.bossDown.t += dt; if (ui.bossDown.t > 4.5) ui.bossDown = null; }
  }
  function bossRect() {
    var m = minimapRect(), left = safe.l + px(10), right = m.top ? W - safe.r - px(10) : m.x - px(16);
    var w = Math.min(px(620), right - left), x = left + (right - left - w) / 2;
    var y = ui.touch.visible ? Math.max(ui.objBottom, m.top ? ui.chipBottom : 0) + px(30) : H - safe.b - px(52);
    if (ui.touch.visible && !portrait) { w = Math.min(px(460), W - safe.l - safe.r - m.s - px(40)); x = (W - w) / 2; y = ui.objBottom + px(26); }
    else if (ui.touch.visible) { x = safe.l + px(6); w = W - safe.l - safe.r - px(12); }
    return { x: x, y: y, w: w };
  }
  function drawBoss(ctx) {
    var b = ui.boss, g = game();
    if (ui.bossDown) drawBossDown(ctx);
    if (!b || !g || g.state !== 'playing' || ui.dialogue || b.state === 'done') return;
    var r = bossRect(), k = clamp01(b.hp / Math.max(1, b.maxHp)), tk = clamp01(b.trail / Math.max(1, b.maxHp)), bh = px(14), a = Math.min(1, b.t / 0.4);
    ctx.save(); ctx.globalAlpha = a;
    txt(ctx, String(b.name).toUpperCase(), r.x, r.y - px(8), { font: F(15, '900', FONT_DISPLAY), color: COL.ink, lw: px(4), maxW: r.w * 0.7 });
    var ph = 'PHASE ' + (b.phase || 1) + (b.phases ? ' / ' + b.phases : '');
    txt(ctx, ph, r.x + r.w, r.y - px(8), { font: F(11, 'bold'), color: b.flashT > 0 && Math.floor(ui.t * 8) % 2 ? COL.ink : COL.amber, align: 'right' });
    panel(ctx, r.x, r.y, r.w, bh, px(3), 'rgba(6,7,13,0.82)', 'rgba(255,255,255,0.3)');
    ctx.fillStyle = 'rgba(255,200,120,0.75)'; ctx.fillRect(r.x + 2, r.y + 2, (r.w - 4) * tk, bh - 4);
    var gr = ctx.createLinearGradient(0, r.y, 0, r.y + bh); gr.addColorStop(0, '#ff6a5e'); gr.addColorStop(1, '#b3121f');
    if (b.shield) { gr = ctx.createLinearGradient(0, r.y, 0, r.y + bh); gr.addColorStop(0, '#b9bec8'); gr.addColorStop(1, '#6a6f79'); }
    ctx.fillStyle = b.flashT > 0 && Math.floor(ui.t * 10) % 2 ? '#ff9d93' : gr; ctx.fillRect(r.x + 2, r.y + 2, (r.w - 4) * k, bh - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(r.x + 2, r.y + 2, (r.w - 4) * k, (bh - 4) * 0.4);
    if (b.phases > 1) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; for (var i = 1; i < b.phases; i++) ctx.fillRect(r.x + r.w * i / b.phases - 1, r.y, 2, bh); }
    var line = b.shield ? (b.shieldText || '') : '', hint = b.hint || '';
    if (line) txt(ctx, line, r.x + r.w / 2, r.y + bh + px(14), { font: F(11, 'bold'), color: '#d0d4dc', align: 'center', maxW: r.w });
    if (hint) txt(ctx, hint, r.x + r.w / 2, r.y + bh + px(line ? 28 : 14), { font: F(11, 'bold'), color: line ? COL.gold : COL.lime, align: 'center', maxW: r.w });
    ctx.restore();
  }
  function drawBossDown(ctx) {
    var d = ui.bossDown, k = d.t / 4.5, a = k < 0.06 ? k / 0.06 : k > 0.8 ? (1 - k) / 0.2 : 1, sc = 1 + (1 - ease(Math.min(1, d.t / 0.35))) * 1.2;
    ctx.save(); ctx.globalAlpha = clamp01(a);
    ctx.fillStyle = 'rgba(4,5,10,0.5)'; ctx.fillRect(0, H * 0.36, W, H * 0.2);
    txt(ctx, String(d.name).toUpperCase(), W / 2, H * 0.4, { font: F(16, 'bold'), color: COL.ink, align: 'center', maxW: W - px(40) });
    ctx.translate(W / 2, H * 0.49); ctx.rotate(-0.08); ctx.scale(sc, sc);
    var label = failText('bossDefeated', 'RATIO\'D'), fw = measure(ctx, label, F(portrait ? 40 : 58, '900', FONT_DISPLAY)) + px(40);
    ctx.strokeStyle = COL.pink; ctx.lineWidth = px(5); rr(ctx, -fw / 2, -px(40), fw, px(70), px(10)); ctx.stroke();
    txt(ctx, label, 0, px(16), { font: F(portrait ? 40 : 58, '900', FONT_DISPLAY), color: COL.pink, align: 'center', outline: false });
    ctx.restore();
  }

  // ------------------------------------------------------------ specials ----
  // special:state {id, meter, active}: a ring per special under the health bars (Focus, Shout, Chat Mob, Boost), the ring
  // fills with the meter, glows while active; a full one shows its key. Only specials that reported a state are shown.
  var SPECIALS = { focus: { name: 'FOCUS', col: '#2ee6ff', how: 'while aiming' }, shout: { name: 'SHOUT', col: '#ffbe3c', how: 'tap' }, chatmob: { name: 'CHAT MOB', col: '#ff3fa4', how: 'hold' }, boost: { name: 'BOOST', col: '#9dff3c', how: 'in a vehicle' } };
  var SPECIAL_ORDER = ['focus', 'shout', 'chatmob', 'boost'];
  function specialState(e) { if (!e || !e.id) return; if (e.unlocked === false) { delete ui.specials[e.id]; return; } var s = ui.specials[e.id] || (ui.specials[e.id] = { meter: 0, active: false, t: 0, fullT: 0 }); var was = k01(s.meter) >= 0.999; s.meter = e.meter; s.active = !!e.active; if (!was && k01(e.meter) >= 0.999) s.fullT = 1.2; }
  function specialIcon(ctx, id, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = s * 0.12; ctx.lineCap = 'round';
    if (id === 'focus') { ctx.beginPath(); ctx.ellipse(0, 0, s * 0.45, s * 0.26, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.13, 0, Math.PI * 2); ctx.fill(); }
    else if (id === 'shout') { ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.12); ctx.lineTo(-s * 0.1, -s * 0.12); ctx.lineTo(s * 0.12, -s * 0.32); ctx.lineTo(s * 0.12, s * 0.32); ctx.lineTo(-s * 0.1, s * 0.12); ctx.lineTo(-s * 0.4, s * 0.12); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(s * 0.12, 0, s * 0.28, -0.6, 0.6); ctx.stroke(); }
    else if (id === 'chatmob') { rr(ctx, -s * 0.42, -s * 0.34, s * 0.5, s * 0.34, s * 0.08); ctx.fill(); rr(ctx, -s * 0.06, -s * 0.06, s * 0.48, s * 0.34, s * 0.08); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(-s * 0.32, -s * 0.3); ctx.lineTo(0, 0); ctx.lineTo(-s * 0.32, s * 0.3); ctx.moveTo(0, -s * 0.3); ctx.lineTo(s * 0.32, 0); ctx.lineTo(0, s * 0.3); ctx.stroke(); }
    ctx.restore();
  }
  function drawSpecials(ctx, x, y) {
    var ids = SPECIAL_ORDER.filter(function (id) { return ui.specials[id]; }).concat(Object.keys(ui.specials).filter(function (id) { return SPECIAL_ORDER.indexOf(id) < 0; }));
    if (!ids.length) return y;
    var p = player(), r = px(15), gap = px(42);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i], s = ui.specials[id], d = SPECIALS[id] || { name: id.toUpperCase(), col: COL.cyan }, k = k01(s.meter), cx = x + r + px(2) + i * gap, cy = y + r + px(2);
      var usable = id === 'boost' ? !!(p && p.inVehicle) : !(p && p.inVehicle);
      ctx.save();
      if (s.active) { ctx.shadowColor = d.col; ctx.shadowBlur = px(14) * (0.6 + 0.4 * Math.sin(ui.t * 10)); }
      ctx.fillStyle = 'rgba(9,11,22,0.8)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = px(3.5); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, r - px(2), 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = usable ? d.col : hexA(d.col, 0.45); ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, r - px(2), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      specialIcon(ctx, id, cx, cy, r * 1.05, k >= 0.999 || s.active ? COL.ink : 'rgba(238,241,251,0.6)');
      if (s.fullT > 0) { ctx.strokeStyle = hexA(d.col, s.fullT / 1.2); ctx.lineWidth = px(2); ctx.beginPath(); ctx.arc(cx, cy, r + (1.2 - s.fullT) * px(12), 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      txt(ctx, d.name, cx, cy + r + px(10), { font: F(7, 'bold'), color: s.active ? d.col : COL.muted, align: 'center', lw: 2 });
    }
    // the key for the specials that are full and usable here
    var ready = ids.filter(function (id) { var s = ui.specials[id]; return k01(s.meter) >= 0.999 && !s.active && (id === 'boost' ? !!(p && p.inVehicle) : !(p && p.inVehicle)); });
    if (ready.length) keyPill(ctx, glyph('special'), x + ids.length * gap + px(2), y + r - px(6), px(16), { fill: 'rgba(255,255,255,0.92)', color: '#0b1020', stroke: null });
    return y + r * 2 + px(16);
  }
  function updateSpecials(dt) { for (var id in ui.specials) { var s = ui.specials[id]; if (s.fullT > 0) s.fullT -= dt; } }

  // ------------------------------------------------------------- the range ----
  // range:start [{seconds, medals:{bronze, silver, gold}}], range:hit {points}, range:end {score, medal}: the timer,
  // the score with +points floats, a medal track; the end card with the medal. GTP.Interiors.range.hud() (if it exists)
  // overrides the local clock and score.
  // GTP.Interiors runs the round: range:start {store, weapon, seconds} opens a 3 s countdown, range:hit {points, score}
  // (a moderator cutout is -10), range:end {score, medal, hits, shots, best, aborted}; GTP.Interiors.range is its raw
  // state ({running, t (countdown included), score, hits, shots, best}) and GTP.Interiors.MEDALS the thresholds.
  var RANGE_COUNTDOWN = 3;
  function rangeMedals() { var I = GTP.Interiors, P = parity(); return (I && I.MEDALS) || (P.range && P.range.medals) || null; }
  function rangeStart(e) {
    e = e || {};
    ui.range = { t: 0, dur: e.seconds || e.duration || 60, score: 0, floats: [], medals: e.medals || rangeMedals(), hits: 0, shots: 0, weapon: e.weapon || null, countdown: RANGE_COUNTDOWN };
    ui.rangeEnd = null;
  }
  function rangeHit(e) {
    var R = ui.range; if (!R) return; e = e || {};
    var n = e.points != null ? e.points : 0; R.hits++; if (e.score != null) R.score = e.score; else R.score += n;
    R.floats.push({ n: n, t: 0, x: ((R.hits * 0.37) % 1), mod: !!e.moderator || n < 0 }); if (R.floats.length > 6) R.floats.shift();
  }
  function rangeEnd(e) {
    var R = ui.range; e = e || {};
    ui.range = null;
    if (e.aborted) { ui.rangeEnd = null; toast('Round called off. The cutouts are relieved.'); return; }
    ui.rangeEnd = { score: e.score != null ? e.score : (R ? R.score : 0), medal: e.medal ? String(e.medal) : null, t: 0, best: e.best, hits: e.hits != null ? e.hits : (R ? R.hits : 0), shots: e.shots, bonus: e.bonus };
    if (ui.rangeEnd.medal) sfx('achievement', 0.5);
  }
  function rangeRaw() { var I = GTP.Interiors, r = I && I.range; if (!r) return null; if (typeof r.hud === 'function') return call(r.hud, r, [], null); return r; }
  function updateRange(dt) {
    var R = ui.range;
    if (R) {
      var h = rangeRaw(); R.t += dt;
      if (h && h.running !== false) {
        if (h.time != null) R.left = h.time;
        else if (h.t != null) { R.countdown = Math.max(0, RANGE_COUNTDOWN - h.t); R.left = Math.max(0, R.dur - Math.max(0, h.t - RANGE_COUNTDOWN)); }
        if (h.score != null) R.score = h.score; if (h.hits != null) R.hits = h.hits; if (h.shots != null) R.shots = h.shots; if (h.medals) R.medals = h.medals;
      } else if (!h) { R.countdown = Math.max(0, RANGE_COUNTDOWN - R.t); R.left = Math.max(0, R.dur - Math.max(0, R.t - RANGE_COUNTDOWN)); }
      for (var i = R.floats.length - 1; i >= 0; i--) { R.floats[i].t += dt; if (R.floats[i].t > 1.2) R.floats.splice(i, 1); }
      if (R.t > R.dur + RANGE_COUNTDOWN + 15) ui.range = null;
    }
    if (ui.rangeEnd) { ui.rangeEnd.t += dt; if (ui.rangeEnd.t > 5) ui.rangeEnd = null; }
  }
  var MEDAL_COL = { bronze: '#cd7f32', silver: '#cfd6e0', gold: '#ffd23c', platinum: '#b9f2ff' };
  function medal(ctx, cx, cy, r, kind) {
    var col = MEDAL_COL[kind] || '#888';
    ctx.save();
    ctx.fillStyle = COL.pink; ctx.beginPath(); ctx.moveTo(cx - r * 0.55, cy - r * 2.1); ctx.lineTo(cx - r * 0.1, cy - r * 0.7); ctx.lineTo(cx - r * 0.55, cy - r * 0.5); ctx.lineTo(cx - r * 1.0, cy - r * 1.9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = COL.cyan; ctx.beginPath(); ctx.moveTo(cx + r * 0.55, cy - r * 2.1); ctx.lineTo(cx + r * 0.1, cy - r * 0.7); ctx.lineTo(cx + r * 0.55, cy - r * 0.5); ctx.lineTo(cx + r * 1.0, cy - r * 1.9); ctx.closePath(); ctx.fill();
    var g2 = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r); g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.35, col); g2.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2); ctx.stroke();
    star(ctx, cx, cy, r * 0.42, 'rgba(0,0,0,0.35)', null);
    ctx.restore();
  }
  function drawRange(ctx) {
    var R = ui.range, g = game();
    if (ui.rangeEnd) drawRangeEnd(ctx);
    if (!R || !g || g.state !== 'playing') return;
    var left = R.left != null ? R.left : Math.max(0, R.dur - R.t), w = Math.min(px(420), W - safe.l - safe.r), x = (W - w) / 2, y = ui.objBottom + px(4), h = px(70);
    if (R.countdown > 0) {   // 3, 2, 1 over the lane before the first cutout rises
      var cd = Math.ceil(R.countdown), fr = R.countdown - Math.floor(R.countdown);
      txt(ctx, String(cd), W / 2, H * 0.42, { font: F(64 + 30 * fr, '900', FONT_DISPLAY), color: COL.amber, align: 'center', lw: px(6), alpha: 0.4 + 0.6 * fr });
      txt(ctx, 'HECKLERS +10 · +5 · +2   ·   MODERATORS -10', W / 2, H * 0.42 + px(34), { font: F(12, 'bold'), color: COL.ink, align: 'center', maxW: W - px(30) });
    }
    glass(ctx, x, y, w, h, COL.amber, px(12));
    txt(ctx, 'SHOOTING RANGE', x + px(16), y + px(18), { font: F(10, 'bold'), color: COL.amber, outline: false });
    txt(ctx, U.fmtTime(Math.ceil(left)), x + px(16), y + px(52), { font: F(30, '900', FONT_DISPLAY), color: left < 10 && Math.floor(ui.t * 4) % 2 ? COL.red : COL.ink, outline: false });
    txt(ctx, String(R.score | 0), x + w - px(16), y + px(40), { font: F(26, '900', FONT_DISPLAY), color: COL.ink, align: 'right', outline: false });
    txt(ctx, 'SCORE  ·  ' + R.hits + ' hit' + (R.hits === 1 ? '' : 's') + (R.shots ? ' / ' + R.shots : ''), x + w - px(16), y + px(18), { font: F(9, 'bold'), color: COL.muted, align: 'right', outline: false });
    var M = R.medals;
    if (M && M.gold) {   // the medal track: bronze, silver and gold ticks along a bar under the score
      var tx = x + px(120), tw = w - px(140), ty = y + px(54), top = M.gold * 1.15;
      panel(ctx, tx, ty, tw, px(6), px(3), 'rgba(255,255,255,0.1)', null);
      ctx.fillStyle = COL.amber; rr(ctx, tx, ty, tw * clamp01(R.score / top), px(6), px(3)); ctx.fill();
      ['bronze', 'silver', 'gold'].forEach(function (mk) { if (M[mk] == null) return; var mx = tx + tw * clamp01(M[mk] / top); ctx.fillStyle = R.score >= M[mk] ? MEDAL_COL[mk] : 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(mx, ty + px(3), px(5), 0, Math.PI * 2); ctx.fill(); });
    }
    // +points floats rising over the crosshair area
    for (var i = 0; i < R.floats.length; i++) { var f = R.floats[i], k = f.t / 1.2; txt(ctx, (f.n < 0 ? '−' + (-f.n) + (f.mod ? '  MODERATOR' : '') : '+' + f.n), W / 2 + (f.x - 0.5) * px(80), H * 0.44 - k * px(40), { font: F(16, '900', FONT_DISPLAY), color: f.n < 0 ? COL.red : f.n >= 10 ? COL.gold : COL.ink, align: 'center', alpha: 1 - k }); }
  }
  function drawRangeEnd(ctx) {
    var E = ui.rangeEnd, k = E.t / 5, a = k < 0.06 ? k / 0.06 : k > 0.85 ? (1 - k) / 0.15 : 1, pop = 1 + (1 - ease(Math.min(1, E.t / 0.4))) * 0.4;
    var w = Math.min(px(360), W - px(30)), h = px(200), x = (W - w) / 2, y = H * 0.22;
    ctx.save(); ctx.globalAlpha = clamp01(a);
    glass(ctx, x, y, w, h, E.medal ? MEDAL_COL[E.medal] || COL.amber : COL.muted, px(16));
    txt(ctx, 'RANGE COMPLETE', W / 2, y + px(26), { font: F(12, 'bold'), color: COL.muted, align: 'center', outline: false });
    if (E.medal) { ctx.save(); ctx.translate(W / 2, y + px(96)); ctx.scale(pop, pop); medal(ctx, 0, 0, px(30), E.medal); ctx.restore(); }
    else txt(ctx, 'NO MEDAL', W / 2, y + px(100), { font: F(22, '900', FONT_DISPLAY), color: COL.muted, align: 'center', outline: false });
    if (E.shots) txt(ctx, E.hits + ' / ' + E.shots + ' HITS' + (E.best ? '  ·  BEST ' + E.best : '') + (E.bonus ? '  ·  +' + U.fmtMoney(E.bonus) : ''), W / 2, y + px(46), { font: F(10, 'bold'), color: COL.muted, align: 'center', outline: false, maxW: w - px(20) });
    txt(ctx, (E.medal ? E.medal.toUpperCase() + '  ·  ' : '') + 'SCORE ' + (E.score | 0), W / 2, y + px(158), { font: F(18, '900', FONT_DISPLAY), color: E.medal ? MEDAL_COL[E.medal] || COL.ink : COL.ink, align: 'center', outline: false });
    txt(ctx, E.medal === 'gold' ? 'Merle says that\'s "fine". High praise.' : E.medal ? 'Respectable. Merle nods at a wall.' : 'The cutouts thank you for your restraint.', W / 2, y + px(182), { font: F(11, 'italic', FONT_TEXT), color: COL.muted, align: 'center', outline: false, maxW: w - px(20) });
    ctx.restore();
  }

  // ---------------------------------------------------------------- golf ----
  // GTP.Systems.golf owns the round: it reads the input itself (left / right aim, forward / back club, shoot / jump / confirm
  // starts and stops the meter, enter quits), freezes the player, and emits golf:start {hole (0-based), holes, par},
  // golf:hole {hole, strokes, par, name} per hole and golf:end {strokes, par, toPar, holes, full, reason}. The UI only
  // draws from golf.state() ({phase 'aim'|'swing'|'flight'|'holed', hole, par, strokes, clubName, distToPin, meter, power,
  // wind {speed, dir}, aim, ball.lie, total, totalPar, message}). Without the systems module a local meter stands in
  // (golf:shot {power, angle} on the second press).
  function golfSys() { var S = GTP.Systems, gf = S && S.golf; return gf && typeof gf.state === 'function' ? gf : null; }
  function golfHud() {
    var gf = golfSys(); if (gf) { var st = call(gf.state, gf, [], null); return st && st.active ? st : null; }
    var S = GTP.Systems, g2 = S && S.golf; return g2 && typeof g2.hud === 'function' ? call(g2.hud, g2, [], null) : null;
  }
  function golfStart(e) {
    e = e || {};
    var p = player(), G = ui.golf, sys = !!golfSys();
    var cont = G && G.active;
    ui.golf = { active: true, sys: sys, hole: e.hole != null ? (sys ? e.hole + 1 : e.hole) : (cont ? G.hole : 1), holes: e.holes || null, par: e.par || (cont ? G.par : 4), strokes: e.strokes || 0, wind: e.wind || (cont ? G.wind : null), club: e.club || 'Driver', dist: e.dist, phase: 'aim', power: 0, angle: e.angle || 0, swingT: 0, waitT: 0, total: e.total || (cont ? G.total : 0), course: e.course || null };
    if (!cont) ui.golfEnd = null;
    if (sys) return;   // the systems module freezes the player's control itself
    if (p && !cont) { ui.golf.restoreControl = p.controlEnabled !== false; p.controlEnabled = false; }
    else if (cont) ui.golf.restoreControl = G.restoreControl;
  }
  // golf:hole: the hole's score card; golf:end: the round's (queued behind a hole card still showing)
  function golfHole(e) {
    if (!e) return;
    ui.golfEnd = { strokes: e.strokes | 0, par: e.par | 0, t: 0, hole: (e.hole | 0) + (golfSys() ? 1 : 0), name: e.name || null };
  }
  function golfEnd(e) {
    var G = ui.golf, p = player(); e = e || {};
    var strokes = e.strokes != null ? e.strokes : (G ? G.strokes : 0), par = e.par != null ? e.par : (G ? G.par : 4);
    var card = { strokes: strokes, par: par, t: 0, hole: G ? G.hole : null };
    if (e.holes != null) { card.round = true; card.holes = e.holes; card.full = !!e.full; card.reason = e.reason || null; card.hole = null; }
    if (card.round && !card.holes) card = null;   // quit before a single hole: nothing to show
    if (card && ui.golfEnd && ui.golfEnd.t < 3 && !ui.golfEnd.round) ui.golfEnd.next = card; else if (card) ui.golfEnd = card;
    if (G && p && G.restoreControl && !G.sys) p.controlEnabled = true;
    ui.golf = null;
  }
  function golfTerm(strokes, par) {
    if (strokes === 1) return 'HOLE IN ONE';
    var d = strokes - par;
    return d <= -3 ? 'ALBATROSS' : d === -2 ? 'EAGLE' : d === -1 ? 'BIRDIE' : d === 0 ? 'PAR' : d === 1 ? 'BOGEY' : d === 2 ? 'DOUBLE BOGEY' : '+' + d;
  }
  function golfOwnSwing() { if (golfSys()) return false; var h = golfHud(); return !(h && h.power != null); }
  function updateGolf(dt) {
    var G = ui.golf;
    if (ui.golfEnd) { ui.golfEnd.t += dt; if (ui.golfEnd.t > 4.5) ui.golfEnd = ui.golfEnd.next || null; }
    if (!G) return;
    var h = golfHud();
    if (h && golfSys()) {
      G.hole = h.hole + 1; G.holes = h.holes; G.par = h.par; G.strokes = h.strokes; G.wind = h.wind; G.club = h.clubName || h.club; G.carry = h.clubCarry;
      G.dist = h.distToPin; G.lie = h.ball && h.ball.lie; G.phase = h.phase; G.power = h.phase === 'swing' ? h.meter : h.power; G.aim = h.aim;
      G.total = h.total; G.totalPar = h.totalPar; G.name = h.name; G.course = h.course; G.message = h.message;
      if (h.phase === 'flight' && G.lastPower !== h.power) G.lastPower = h.power;
      return;
    }
    if (h) { ['hole', 'par', 'strokes', 'wind', 'club', 'dist', 'lie', 'phase', 'total'].forEach(function (k) { if (h[k] != null) G[k] = h[k]; }); if (h.power != null) G.power = h.power; if (h.angle != null) G.angle = h.angle; }
    if (golfOwnSwing()) {
      if (G.phase === 'swing') { G.swingT += dt; var c = (G.swingT / 0.9) % 2; G.power = c < 1 ? c : 2 - c; if (G.swingT > 5.4) { G.phase = 'aim'; G.power = 0; } }
      if (G.phase === 'flight') { G.waitT += dt; if (G.waitT > 2.4) { G.phase = 'aim'; G.power = 0; } }
    }
  }
  function golfInput(In) {
    var G = ui.golf; if (!G || !golfOwnSwing()) return false;
    if (G.phase === 'aim') {
      if (In.down('left')) G.angle -= C.STEP * 0.8;
      if (In.down('right')) G.angle += C.STEP * 0.8;
      G.angle = U.clamp(G.angle, -1.2, 1.2);
      if (In.pressed('shoot') || In.pressed('jump') || In.pressed('confirm')) { G.phase = 'swing'; G.swingT = 0; G.power = 0; sfx('ui', 0.3); }
      return true;
    }
    if (G.phase === 'swing') {
      if (In.pressed('shoot') || In.pressed('jump') || In.pressed('confirm')) {
        var pw = Math.round(G.power * 1000) / 1000;
        G.phase = 'flight'; G.waitT = 0; G.lastPower = pw; G.strokes = (G.strokes | 0) + 1;
        GTP.Events.emit('golf:shot', { power: pw, angle: G.angle, hole: G.hole });
      }
      if (menuBack(In)) { G.phase = 'aim'; G.power = 0; }
      return true;
    }
    return G.phase === 'flight';
  }
  function drawGolf(ctx) {
    var G = ui.golf, g = game();
    if (ui.golfEnd) drawGolfEnd(ctx);
    if (!G || !g || g.state !== 'playing') return;
    // the scorecard chip top-left under the bars
    var x = safe.l, y = ui.hudTop + px(48), w = px(210);
    glass(ctx, x, y, w, px(86), COL.lime, px(12));
    txt(ctx, String(G.course || 'Goldplate Links').toUpperCase() + (G.name ? '  ·  ' + String(G.name).toUpperCase() : ''), x + px(14), y + px(18), { font: F(9, 'bold'), color: COL.lime, outline: false, maxW: w - px(28) });
    txt(ctx, 'HOLE ' + G.hole + (G.holes ? '/' + G.holes : ''), x + px(14), y + px(44), { font: F(22, '900', FONT_DISPLAY), color: COL.ink, outline: false });
    txt(ctx, 'PAR ' + G.par, x + w - px(14), y + px(30), { font: F(12, 'bold'), color: COL.ink, align: 'right', outline: false });
    txt(ctx, 'STROKE ' + ((G.strokes | 0) + (G.phase === 'flight' || G.phase === 'holed' ? 0 : 1)), x + w - px(14), y + px(46), { font: F(12, 'bold'), color: COL.amber, align: 'right', outline: false });
    txt(ctx, (G.club || 'Driver').toUpperCase() + (G.dist != null ? '  ·  PIN ' + Math.round(G.dist) + ' m' : '') + (G.lie ? '  ·  ' + String(G.lie).toUpperCase() : ''), x + px(14), y + px(70), { font: F(10, 'bold'), color: COL.muted, outline: false, maxW: w - px(28) });
    // wind: an arrow in a disc, top-right of the chip
    var wd = G.wind, wx = x + w + px(34), wy = y + px(36);
    if (wd) {
      var sp = wd.speed != null ? wd.speed : (typeof wd === 'number' ? wd : 0), dir = wd.dir != null ? wd.dir : (wd.angle || 0);
      ctx.fillStyle = 'rgba(9,11,22,0.85)'; ctx.beginPath(); ctx.arc(wx, wy, px(26), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.save(); ctx.translate(wx, wy); ctx.rotate(G.sys && G.aim != null ? -(dir - G.aim) : dir); ctx.fillStyle = COL.cyan; ctx.beginPath(); ctx.moveTo(0, -px(16)); ctx.lineTo(px(7), px(4)); ctx.lineTo(px(2), px(2)); ctx.lineTo(px(2), px(14)); ctx.lineTo(-px(2), px(14)); ctx.lineTo(-px(2), px(2)); ctx.lineTo(-px(7), px(4)); ctx.closePath(); ctx.fill(); ctx.restore();
      txt(ctx, Math.round(sp) + (G.sys ? ' m/s' : ' mph'), wx, wy + px(40), { font: F(10, 'bold'), color: COL.cyan, align: 'center' });
    }
    // the swing meter bottom-centre: the power fill, the sweet spot, the aim readout
    var mw = Math.min(px(420), W - px(40)), mx = (W - mw) / 2, my = H - safe.b - px(ui.touch.visible ? 190 : 84), mh = px(18);
    panel(ctx, mx, my, mw, mh, px(9), 'rgba(9,11,22,0.85)', 'rgba(255,255,255,0.3)', 1.5);
    ctx.fillStyle = 'rgba(157,255,60,0.25)'; ctx.fillRect(mx + mw * 0.82, my + 2, mw * 0.1, mh - 4);
    var pg = ctx.createLinearGradient(mx, 0, mx + mw, 0); pg.addColorStop(0, COL.cyan); pg.addColorStop(0.8, COL.lime); pg.addColorStop(1, COL.red);
    ctx.fillStyle = pg; rr(ctx, mx + 2, my + 2, (mw - 4) * clamp01(G.power), mh - 4, px(7)); ctx.fill();
    if (G.lastPower != null) { ctx.fillStyle = '#fff'; ctx.fillRect(mx + mw * clamp01(G.lastPower) - 1, my - px(4), 2, mh + px(8)); }
    var help = G.phase === 'aim' ? glyph('left') + ' / ' + glyph('right') + ' aim  ·  ' + (G.sys ? glyph('forward') + ' / ' + glyph('back') + ' club  ·  ' : '') + glyph('shoot') + ' swing' + (G.sys ? '  ·  ' + glyph('enter') + ' quit' : '')
      : G.phase === 'swing' ? glyph('shoot') + ' set the power' : G.phase === 'holed' ? glyph('shoot') + ' next hole' : (G.message || 'In flight...');
    txt(ctx, help, W / 2, my - px(10), { font: F(11, 'bold'), color: COL.ink, align: 'center' });
    txt(ctx, 'POWER ' + Math.round(clamp01(G.power) * 100) + '%', mx, my + mh + px(14), { font: F(10, 'bold'), color: COL.muted });
    txt(ctx, G.sys ? (G.carry ? 'CARRY ' + Math.round(G.carry) + ' m' : '') + (G.total ? '  ·  CARD ' + G.total + ' (' + fmtToPar(G.total - (G.totalPar || 0)) + ')' : '') : 'AIM ' + (G.angle >= 0 ? 'R ' : 'L ') + Math.abs(Math.round((G.angle || 0) * 57.3)) + '°', mx + mw, my + mh + px(14), { font: F(10, 'bold'), color: COL.muted, align: 'right' });
  }
  function fmtToPar(d) { return d === 0 ? 'E' : (d > 0 ? '+' : '−') + Math.abs(d); }
  function drawGolfEnd(ctx) {
    var E = ui.golfEnd, k = E.t / 4.5, a = k < 0.08 ? k / 0.08 : k > 0.82 ? (1 - k) / 0.18 : 1;
    var good = E.strokes - E.par <= 0;
    if (E.round) {
      ctx.save(); ctx.globalAlpha = clamp01(a);
      txt(ctx, E.full ? 'ROUND COMPLETE' : 'ROUND OVER', W / 2, H * 0.38, { font: F(portrait ? 28 : 44, '900', FONT_DISPLAY), color: good ? COL.lime : COL.amber, align: 'center', lw: px(7), outline: 'rgba(0,0,0,0.85)', maxW: W - px(30) });
      txt(ctx, E.strokes + ' strokes  ·  par ' + E.par + '  ·  ' + fmtToPar(E.strokes - E.par) + '  ·  ' + E.holes + ' hole' + (E.holes === 1 ? '' : 's'), W / 2, H * 0.38 + px(30), { font: F(14, 'bold'), color: COL.ink, align: 'center', maxW: W - px(30) });
      ctx.restore();
      return;
    }
    var term = golfTerm(E.strokes, E.par);
    ctx.save(); ctx.globalAlpha = clamp01(a);
    txt(ctx, term, W / 2, H * 0.4, { font: F(portrait ? 32 : 52, '900', FONT_DISPLAY), color: good ? COL.lime : COL.amber, align: 'center', lw: px(7), outline: 'rgba(0,0,0,0.85)', maxW: W - px(30) });
    txt(ctx, (E.hole ? 'HOLE ' + E.hole + (E.name ? ' "' + E.name + '"' : '') + '  ·  ' : '') + E.strokes + ' stroke' + (E.strokes === 1 ? '' : 's') + '  ·  par ' + E.par, W / 2, H * 0.4 + px(30), { font: F(14, 'bold'), color: COL.ink, align: 'center' });
    ctx.restore();
  }
  // =============================================================== modals ====
  // The shop screens of v0.3 (armory, mod shop, wardrobe / barber, property, heist board) are modal overlays in state
  // 'playing' like the v0.2 shop page: the player's control is off, the UI consumes the input, the world keeps ticking.
  // ui.modal = {kind, ...}; a modal with `cam` takes the free camera (GTP.Render.freeCam) and orbits its target.
  function openModal(kind, data) {
    var g = game(), p = player(); if (!g) return null;
    if (ui.modal) closeModal();
    if (ui.shopOpen) closeShop();
    var m = ui.modal = Object.assign({ kind: kind, t: 0, sel: 0, focus: 0, msg: null, msgT: 0, flash: 0 }, data || {});
    if (p) { try { if (p.stop) p.stop(); } catch (e) { /* optional */ } p.aiming = false; p.lockTarget = null; m.restoreControl = p.controlEnabled !== false; p.controlEnabled = false; }
    if (GTP.Input && GTP.Input.releasePointerLock) GTP.Input.releasePointerLock();
    sfx('ui', 0.4);
    return m;
  }
  function closeModal() {
    var m = ui.modal; if (!m) return;
    ui.modal = null;
    if (m.onClose) { try { m.onClose(m); } catch (e) { U.reportError(e, 'ui.modal.close'); } }
    releaseCam();
    var p = player(); if (p && m.restoreControl !== false) p.controlEnabled = true;
    if (GTP.Input && GTP.Input.latch) GTP.Input.latch(['shoot', 'action', 'confirm', 'jump', 'enter']);
    GTP.Events.emit('ui:close', { kind: m.kind });
  }
  function modalMsg(m, text, color) { m.msg = { text: text, color: color || COL.ink }; m.msgT = 3; }
  function releaseCam() { var Rd = GTP.Render; if (ui.camTaken) { ui.camTaken = false; var g = game(); if (Rd && Rd.freeCam && !(g && g.state === 'cutscene')) Rd.freeCam(false); } }
  // the orbit camera on the modal's target: {target, dist, height, lookY, yaw (radians, 0 = in front of the target), spin}
  function updateModalCam(m, dt) {
    var Rd = GTP.Render, c = m && m.cam; if (!Rd || !Rd.freeCam || !Rd.camera || !c || !c.target) return;
    var g = game(); if (!g || g.state !== 'playing') return;
    if (!ui.camTaken) { Rd.freeCam(true); ui.camTaken = true; }
    var In = GTP.Input;
    c.yaw = (c.yaw || 0) + (c.spin || 0) * dt + (In && In.look ? In.look.dx * 0.004 : 0);
    var tg = c.target, base = (tg.yaw || 0) + c.yaw, fx = -Math.sin(base), fz = -Math.cos(base), dist = c.dist, Wd = GTP.World;
    // pull in when a building stands between the target and the camera
    if (Wd && Wd.raycastBuildings) {
      try {
        var dy = (c.height - c.lookY) / Math.max(0.5, dist), dl = Math.sqrt(1 + dy * dy);
        var hitB = Wd.raycastBuildings(tg.x, (tg.y || 0) + c.lookY, tg.z, fx / dl, dy / dl, fz / dl, dist * dl + 0.3);
        if (hitB && hitB.t != null && hitB.t / dl < dist) dist = Math.max(1.1, hitB.t / dl - 0.35);
      } catch (e) { /* optional */ }
    }
    var cam = Rd.camera, tx = tg.x + fx * dist, tz = tg.z + fz * dist, ty = (tg.y || 0) + c.height;
    if (!c.placed) { cam.position.set(tx, ty, tz); c.placed = true; }
    else cam.position.set(U.damp(cam.position.x, tx, 8, dt), U.damp(cam.position.y, ty, 8, dt), U.damp(cam.position.z, tz, 8, dt));
    // frame the target clear of the side panel (landscape: right of centre) or the bottom sheet (portrait: higher up)
    var side = m.kind === 'modshop' || m.kind === 'wardrobe', R2 = side ? sidePanelRect() : null, sheet = R2 && R2.w >= W - safe.l - safe.r - 1;
    var rx = fz, rz = -fx, shift = R2 && !sheet ? dist * 0.32 : 0, drop = sheet ? dist * 0.3 : 0;   // the camera's right, seen from the camera looking back at the target
    cam.lookAt(tg.x - rx * shift, (tg.y || 0) + c.lookY - drop, tg.z - rz * shift);
  }
  function rebuildMesh(e) {
    var Rd = GTP.Render; if (!Rd || !e) return;
    if (typeof Rd.rebuildEntityMesh === 'function') { call(Rd.rebuildEntityMesh, Rd, [e]); return; }
    try { if (Rd.detach) Rd.detach(e); e.mesh = null; if (Rd.attach) Rd.attach(e); } catch (err) { U.reportError(err, 'ui.rebuildMesh'); }
  }
  // a modal's list with a selection that scrolls: rows of height rh inside (x, y, w, h); draws via rowFn(i, x, ry, w, rh, sel)
  function listBox(ctx, n, sel, x, y, w, h, rh, rowFn, onPick, idp) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    var scroll = Math.max(0, Math.min((sel + 1) * rh - h + rh * 0.5, n * rh - h)), ry = y - Math.max(0, scroll);
    for (var i = 0; i < n; i++) {
      if (ry + rh >= y && ry <= y + h) { rowFn(i, x, ry, w, rh, i === sel); if (onPick) hit(x, Math.max(y, ry), w, Math.min(rh - px(4), y + h - Math.max(y, ry)), (function (k) { return function () { onPick(k); }; })(i), (idp || 'row') + '-' + i); }
      ry += rh;
    }
    ctx.restore();
    if (n * rh > h) { var sh = h * h / (n * rh), sy = y + (h - sh) * clamp01(scroll / Math.max(1, n * rh - h)); ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(ctx, x + w + px(3), sy, px(3), sh, px(2)); ctx.fill(); }
  }
  function modalFrame(ctx, x, y, w, h, title, sub, accent) {
    glass(ctx, x, y, w, h, null, px(16));
    ctx.fillStyle = accent; ctx.fillRect(x + px(16), y + px(52), px(48), px(3));
    txt(ctx, title, x + px(18), y + px(34), { font: F(portrait ? 17 : 21, '900', FONT_DISPLAY), color: COL.ink, outline: false, maxW: w * 0.6 });
    if (sub) txt(ctx, sub, x + px(18), y + px(70), { font: F(10, 'italic', FONT_TEXT), color: COL.muted, outline: false, maxW: w - px(36) });
  }
  function exitButton(ctx, x, y) {
    var w = px(86);
    button(ctx, x - w, y, w, px(26), 'EXIT  ' + glyph('cancel'), { color: COL.red, fn: closeModal, id: 'modal-exit', font: F(10, 'bold') });
  }
  function helpLine(ctx, text, x, y, w) { txt(ctx, text, x, y, { font: F(10), color: COL.muted, outline: false, maxW: w }); }
  function navKeys() { return device() === 'gamepad' ? 'LS pick · A choose · B back' : ui.touch.visible ? 'tap to pick · tap again to buy' : '↑ ↓ pick  ·  ← → switch  ·  Enter choose  ·  Esc back'; }

  // --------------------------------------------------------------- armory ----
  // armory:inspect {weaponId} (and UI.openArmory(storeId, weaponId)) open the weapon card over the armory: the list of
  // every weapon (GTP.Combat.catalog(storeId), else the v0.2 shop items), the card with the stats, and four tabs:
  // PURCHASE, AMMO, ATTACHMENTS (by slot), TINTS. Buying goes through GTP.Combat.buy(itemId, {storeId, weaponId, equip}),
  // else Combat.shop.buy. Hovering an attachment previews its stat change on the bars.
  var ARMORY_TABS = ['PURCHASE', 'AMMO', 'ATTACHMENTS', 'TINTS'];
  var CLASS_ORDER = ['melee', 'pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'lmg', 'sniper', 'launcher', 'heavy', 'thrown'];
  var TINT_FALLBACK = ['#2b2b2b', '#c9a227', '#ff3fa4', '#2ee6ff', '#3fd27f', '#b56bff', '#ff7a20', '#e8e8e8'];
  function armoryCatalog(storeId) {
    var CB = GTP.Combat, out = null;
    if (CB && typeof CB.catalog === 'function') out = call(CB.catalog, CB, [storeId], null);
    if (out && out.length) return out;
    out = [];
    if (CB && CB.shop && CB.shop.items) {
      var items = call(CB.shop.items, CB.shop, [], []);
      for (var i = 0; i < items.length; i++) {
        var it = items[i], st = it.stats;
        out.push({ id: it.id, kind: it.tab === 'weapons' ? 'weapon' : it.tab === 'ammo' ? 'ammo' : it.tab === 'range' ? 'service' : 'gear', weaponId: it.weapon || null, name: it.name, price: it.price, listPrice: it.listPrice, owned: !!it.owned, equipped: false, locked: !!it.locked, lockReason: it.lockedBy ? 'Unlocks after: ' + it.lockedBy : null, stats: st ? { damage: st.damage, rate: st.rate, range: st.range, accuracy: st.accuracy, mobility: st.volume != null ? 1 - st.volume * 0.5 : 0.5 } : null, canBuy: it.canBuy, pitch: it.pitch, _legacy: true });
      }
    }
    return out;
  }
  function weaponRows(cat) {
    var rows = cat.filter(function (it) { return it.kind === 'weapon'; });
    rows.sort(function (a, b) {
      var ca = CLASS_ORDER.indexOf(classKey(a.weaponId || a.id)), cb = CLASS_ORDER.indexOf(classKey(b.weaponId || b.id));
      return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb) || (a.price || 0) - (b.price || 0);
    });
    if (cat.some(function (it) { return it.kind === 'gear' || it.kind === 'service'; })) rows.push({ id: '_gear', kind: 'gearpage', name: 'Gear & Services' });
    return rows;
  }
  function classKey(id) { var c = weaponClass(id); for (var i = 0; i < CLASS_ORDER.length; i++) if (c.indexOf(CLASS_ORDER[i]) >= 0) return CLASS_ORDER[i]; if (/tableleg|fist|megaphone/.test(id)) return 'melee'; if (/hottake|hotmic/.test(id)) return 'thrown'; if (/ratio/.test(id)) return 'launcher'; return c || 'other'; }
  function itemsFor(cat, row, tab) {
    if (!row) return [];
    if (row.kind === 'gearpage') return cat.filter(function (it) { return it.kind === 'gear' || it.kind === 'service'; });
    var wid = row.weaponId || row.id;
    if (tab === 0) return [row];
    var kind = tab === 1 ? 'ammo' : tab === 2 ? 'attachment' : 'tint';
    return cat.filter(function (it) { return it.kind === kind && (it.weaponId === wid || (kind === 'tint' && !it.weaponId)); });
  }
  function attachSlot(it) {
    var P = parity(), d = findById(P.attachments, it.attachmentId || it.id);
    var s = it.slot || (d && d.slot) || null;
    if (!s) { var m = /(muzzle|mag|optic|grip|light|scope|suppress|barrel|stock)/.exec(it.id + ' ' + (it.name || '').toLowerCase()); s = m ? (m[1] === 'suppress' || m[1] === 'barrel' ? 'muzzle' : m[1] === 'scope' ? 'optic' : m[1]) : 'other'; }
    return String(s).toLowerCase();
  }
  // a catalog tint is {variant}; its colour is GTP.Assets.weaponTints[variant].main
  function tintColor(it, i) {
    var A = GTP.Assets, T = (A && A.weaponTints) || [], d = findById(T, it.variant || it.tintId) || findById(parity().tints, it.tintId || it.variant || it.id);
    return it.color || it.hex || (d && (d.main || d.color || d.hex)) || TINT_FALLBACK[(i || 0) % TINT_FALLBACK.length];
  }
  function weaponStats(row) {
    if (!row) return null;
    if (row.stats) return row.stats;
    var d = weaponDef(row.weaponId || row.id); if (!d) return null;
    return { damage: clamp01((d.dmg || 10) / 100), rate: clamp01((d.rate || 1) / 12), range: clamp01((d.range || 30) / 200), accuracy: clamp01(1 - (d.spread || 0.05) * 5), mobility: d.hold === 'one' ? 0.8 : 0.5 };
  }
  // openArmory(storeId, weaponId), or GTP.Interiors' openArmory({store, landmark, counter, weaponId})
  function openArmory(storeId, weaponId) {
    if (storeId && typeof storeId === 'object' && !storeId.name && (storeId.store !== undefined || storeId.counter || storeId.landmark !== undefined)) { weaponId = weaponId || storeId.weaponId; storeId = storeId.store || (storeId.landmark && (storeId.landmark.id || storeId.landmark)) || null; }
    var cat = armoryCatalog(storeId), rows = weaponRows(cat), sel = 0;
    for (var i = 0; i < rows.length; i++) if ((rows[i].weaponId || rows[i].id) === weaponId) { sel = i; break; }
    var m = openModal('armory', { store: storeId || (ui.interior && ui.interior.store) || null, weaponId: weaponId || null, row: sel, tab: 0, isel: 0, focus: weaponId ? 1 : 0, turn: 0 });
    if (m) { var X = expansion(), barks = X.shop && X.shop.barks; m.bark = barks && barks.door && barks.door.length ? barks.door[(urng ? Math.floor(urng.random() * barks.door.length) : 0) % barks.door.length] : 'Both Sides Arms. Which side?'; }
    return m;
  }
  function armoryState() {
    var m = ui.modal, cat = armoryCatalog(m.store), rows = weaponRows(cat);
    if (m.row >= rows.length) m.row = Math.max(0, rows.length - 1);
    var row = rows[m.row], tabs = row && row.kind === 'gearpage' ? ['GEAR'] : ARMORY_TABS;
    if (m.tab >= tabs.length) m.tab = 0;
    var items = itemsFor(cat, row, row && row.kind === 'gearpage' ? 1 : m.tab);
    if (row && row.kind === 'gearpage') items = cat.filter(function (it) { return it.kind === 'gear' || it.kind === 'service'; });
    if (m.isel >= items.length) m.isel = Math.max(0, items.length - 1);
    return { cat: cat, rows: rows, row: row, tabs: tabs, items: items, item: items[m.isel] || null };
  }
  function armoryBuy(item) {
    var m = ui.modal, CB = GTP.Combat; if (!m || !item) return;
    var res = null, opts = { store: m.store && m.store.id ? m.store.id : m.store };   // an owned attachment toggles on and off
    if (CB && typeof CB.buy === 'function' && !item._legacy) res = call(CB.buy, CB, [item.id, opts], null);
    else if (CB && CB.shop && CB.shop.buy) res = call(CB.shop.buy, CB.shop, [item.id], null);
    var X = expansion(), barks = (X.shop && X.shop.barks) || {}, pick = function (list, d) { return list && list.length ? list[(urng ? Math.floor(urng.random() * list.length) : 0) % list.length] : d; };
    var why = res && (res.reason || res.why);
    if (res && res.ok && item.owned && res.equipped === false) { modalMsg(m, 'REMOVED: ' + item.name, COL.muted); sfx('ui', 0.4); }
    else if (res && res.ok) { modalMsg(m, (item.owned && (item.kind === 'attachment' || item.kind === 'tint') ? 'EQUIPPED: ' : 'SOLD: ') + item.name + (res.price ? '  -' + U.fmtMoney(res.price) : ''), COL.lime); m.flash = 1; m.bark = pick(barks.sale, 'Sold. Both sides thank you.'); sfx('cash', 0.6); }
    else if (why === 'funds') modalMsg(m, 'NOT ENOUGH CASH' + (res.need ? '. Need ' + U.fmtMoney(res.need) + ' more.' : '.'), COL.red);
    else if (why === 'locked') modalMsg(m, 'LOCKED. ' + (item.lockReason || res.lockReason || ('Unlocks after: ' + (res.lockedBy || 'the story'))), COL.amber);
    else if (why === 'owned') modalMsg(m, 'Already yours. Pick ammo or a mod.', COL.muted);
    else if (why === 'notOwned' || why === 'noWeapon') modalMsg(m, 'Buy the weapon first.', COL.amber);
    else if (why === 'full') modalMsg(m, 'Full. You cannot carry more of that.', COL.muted);
    else if (why === 'flagship') modalMsg(m, 'The range is at the flagship on the Strip.', COL.muted);
    else modalMsg(m, res ? 'No sale' + (why ? ' (' + why + ')' : '') + '.' : 'The register is closed.', COL.muted);
  }
  function drawArmory(ctx) {
    var m = ui.modal, S2 = armoryState(), rows = S2.rows, row = S2.row, p = player();
    var pw = Math.min(px(1060), W - safe.l - safe.r), ph = Math.min(px(640), H - safe.t - safe.b), x = (W - pw) / 2, y = (H - ph) / 2, narrow = pw < px(720);
    ctx.fillStyle = 'rgba(4,5,10,0.55)'; ctx.fillRect(0, 0, W, H);
    var storeName = storeLabel(m.store || (ui.interior && ui.interior.store), 'armory') || 'Both Sides Arms';
    modalFrame(ctx, x, y, pw, ph, String(storeName).toUpperCase(), null, COL.green);
    moneyChip(ctx, x + pw - px(110), y + px(34));
    exitButton(ctx, x + pw - px(16), y + px(14));
    // the weapon list
    var lx = x + px(16), ly = y + px(74), lw = narrow ? pw - px(36) : pw * 0.33, lh = narrow ? (ph - px(80)) * 0.3 : ph - px(108), rh = narrow ? px(36) : px(44);
    txt(ctx, 'WEAPONS', lx, ly - px(2), { font: F(9, 'bold'), color: m.focus === 0 ? COL.green : COL.muted, outline: false });
    listBox(ctx, rows.length, m.row, lx, ly + px(6), lw, lh - px(6), rh, function (i, rx, ry, rw, rhh, sel) {
      var r = rows[i], col = r.locked ? COL.muted : COL.ink;
      panel(ctx, rx, ry, rw, rhh - px(4), px(8), sel ? (m.focus === 0 ? 'rgba(63,210,127,0.22)' : 'rgba(63,210,127,0.1)') : 'rgba(255,255,255,0.04)', sel ? COL.green : 'rgba(255,255,255,0.08)', sel ? 1.5 : 1);
      if (r.kind === 'gearpage') { ctx.fillStyle = '#5aa8ff'; rr(ctx, rx + px(10), ry + rhh / 2 - px(10), px(22), px(18), px(4)); ctx.fill(); }
      else weaponIcon(ctx, r.weaponId || r.id, rx + px(6), ry + (rhh - px(4)) / 2 - px(15), px(30), r.locked ? 'rgba(143,151,179,0.5)' : COL.ink);
      txt(ctx, r.name, rx + px(42), ry + (narrow ? px(21) : px(18)), { font: F(12, 'bold'), color: col, outline: false, maxW: rw - px(130) });
      if (!narrow) txt(ctx, r.kind === 'gearpage' ? 'ARMOR · HEALTH · RANGE' : classKey(r.weaponId || r.id).toUpperCase(), rx + px(42), ry + px(32), { font: F(8, 'bold'), color: COL.muted, outline: false });
      var tag = r.kind === 'gearpage' ? '' : r.owned ? 'OWNED' : r.locked ? 'LOCKED' : U.fmtMoney(r.price || 0);
      txt(ctx, tag, rx + rw - px(10), ry + (rhh - px(4)) / 2 + px(5), { font: F(11, 'bold'), color: r.owned ? COL.lime : r.locked ? COL.amber : (p && p.money >= r.price ? COL.ink : COL.red), align: 'right', outline: false });
    }, function (k) { if (m.row === k && m.focus === 0) { m.focus = 1; } m.row = k; m.isel = 0; sfx('ui', 0.15); }, 'arm-w');
    // the card
    var cx = narrow ? lx : lx + lw + px(18), cy = narrow ? ly + lh + px(8) : ly - px(10), cw = narrow ? lw : x + pw - px(16) - cx, ch = narrow ? y + ph - cy - px(30) : ph - px(92);
    panel(ctx, cx, cy, cw, ch, px(12), 'rgba(255,255,255,0.035)', 'rgba(255,255,255,0.1)');
    if (!row) { txt(ctx, 'The racks are empty. Merle is "restocking".', cx + px(20), cy + px(40), { font: F(13, '', FONT_TEXT), color: COL.muted, outline: false }); return; }
    var gearPage = row.kind === 'gearpage', wid = row.weaponId || row.id, wd = weaponDef(wid) || {};
    var equippedTint = null; S2.cat.forEach(function (it, i) { if (it.kind === 'tint' && it.equipped && (it.weaponId === wid || !it.weaponId)) equippedTint = tintColor(it, i); });
    var heroH = narrow ? Math.min(px(70), ch * 0.22) : Math.min(px(150), ch * 0.3), heroW = narrow ? px(110) : Math.min(px(260), cw * 0.46);
    var hx = cx + px(14), hy = cy + px(14);
    if (!gearPage) {
      var rg = ctx.createRadialGradient(hx + heroW / 2, hy + heroH / 2, heroH * 0.1, hx + heroW / 2, hy + heroH / 2, heroW * 0.6); rg.addColorStop(0, 'rgba(63,210,127,0.28)'); rg.addColorStop(1, 'rgba(63,210,127,0)');
      ctx.fillStyle = rg; ctx.fillRect(hx, hy, heroW, heroH);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(hx + heroW / 2, hy + heroH * 0.86, heroW * 0.4, heroH * 0.08, 0, 0, Math.PI * 2); ctx.stroke();
      var icoS = Math.min(heroH * 0.95, heroW * 0.8), bob = Math.sin(m.turn * 1.4) * px(3);
      ctx.save(); ctx.translate(hx + heroW / 2, hy + heroH / 2 + bob); var sq = Math.cos(m.turn * 0.6); ctx.scale(0.7 + 0.3 * Math.abs(sq), 1); ctx.translate(-icoS / 2, -icoS / 2);
      ctx.shadowColor = 'rgba(220,255,235,0.85)'; ctx.shadowBlur = px(10);   // a rim light so a black tint still reads on the dark card
      weaponIcon(ctx, wid, 0, 0, icoS, row.locked ? 'rgba(143,151,179,0.6)' : (equippedTint || COL.ink));
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    var tx = gearPage ? cx + px(18) : hx + heroW + px(16), tw = cx + cw - tx - px(16);
    txt(ctx, gearPage ? 'GEAR & SERVICES' : classKey(wid).toUpperCase() + (wd.hold ? '  ·  ' + (wd.hold === 'two' ? 'TWO-HANDED' : 'ONE-HANDED') : ''), tx, cy + px(28), { font: F(9, 'bold'), color: COL.green, outline: false, maxW: tw });
    txt(ctx, (gearPage ? 'Behind the counter' : row.name).toUpperCase(), tx, cy + px(54), { font: F(narrow ? 16 : 22, '900', FONT_DISPLAY), color: COL.ink, outline: false, maxW: tw });
    var flav = gearPage ? 'Vests, pellets and range time. Everything Merle can legally say out loud.' : (wd.flavor || row.pitch || ((expansion().weapons || {})[wid] || {}).flavor || '');
    var fl = wrap(ctx, flav, F(11, 'italic', FONT_TEXT), tw);
    for (var i = 0; i < Math.min(narrow ? 1 : 3, fl.length); i++) txt(ctx, fl[i], tx, cy + px(74) + i * px(15), { font: F(11, 'italic', FONT_TEXT), color: COL.muted, outline: false });
    // the stat bars (with the hovered attachment's change)
    var by = cy + px(20) + heroH;
    if (!gearPage) {
      var st = weaponStats(row), cur = S2.item, ds = cur && cur.kind === 'attachment' && cur.stats && st ? cur.stats : null;
      var keys = [['damage', 'DAMAGE', COL.red], ['rate', 'FIRE RATE', COL.amber], ['range', 'RANGE', COL.cyan], ['accuracy', 'ACCURACY', COL.lime], ['mobility', 'MOBILITY', COL.pink]];
      if (st) {
        var cols = narrow ? 1 : 2, bw = (cw - px(36) - (cols - 1) * px(20)) / cols, n = 0;
        for (i = 0; i < keys.length; i++) {
          var kk = keys[i][0]; if (st[kk] == null && kk !== 'mobility') continue;
          var base = k01(st[kk] != null ? st[kk] : 0.5), delta = ds && ds[kk] != null ? (ds.delta ? k01(Math.abs(ds[kk])) * Math.sign(ds[kk]) : k01(ds[kk]) - base) : 0;
          if (narrow && n >= 3) break;
          statBar(ctx, keys[i][1], base, cx + px(18) + (n % cols) * (bw + px(20)), by + Math.floor(n / cols) * px(18), bw, keys[i][2], delta);
          n++;
        }
        by += Math.ceil(n / (narrow ? 1 : 2)) * px(18) + px(6);
      }
    }
    // the tabs
    var tabs = S2.tabs, tbw = Math.min(px(130), (cw - px(36)) / tabs.length), tby = by + px(4);
    for (i = 0; i < tabs.length; i++) {
      var tsel = i === m.tab, tbx = cx + px(18) + i * tbw;
      panel(ctx, tbx + px(2), tby, tbw - px(4), px(26), px(6), tsel ? (m.focus === 1 ? 'rgba(63,210,127,0.3)' : 'rgba(63,210,127,0.16)') : 'rgba(255,255,255,0.05)', tsel ? COL.green : 'rgba(255,255,255,0.1)');
      txt(ctx, tabs[i], tbx + tbw / 2, tby + px(17), { font: F(narrow ? 8 : 10, 'bold'), color: tsel ? COL.ink : COL.muted, align: 'center', outline: false, maxW: tbw - px(8) });
      hit(tbx, tby, tbw, px(26), (function (k) { return function () { m.tab = k; m.isel = 0; m.focus = 1; sfx('ui', 0.15); }; })(i), 'arm-tab-' + i);
    }
    // the tab's items
    var iy = tby + px(34), ih = cy + ch - iy - px(52), items = S2.items, irh = px(34);
    if (!gearPage && m.tab === 0) {   // PURCHASE: the facts under the buy row
      var facts = [];
      if (wd.mag) facts.push(['MAGAZINE', wd.mag]); if (wd.reserve) facts.push(['RESERVE', wd.reserve]); if (wd.reload) facts.push(['RELOAD', wd.reload + ' s']);
      if (wd.range) facts.push(['RANGE', Math.round(wd.range) + ' m']); if (wd.projectile) facts.push(['ROUND', String(wd.projectile).toUpperCase()]);
      if (row.owned && p && p.weapons) { var have = p.weapons[wid]; facts.push(['CARRYING', have === Infinity ? '∞' : (have | 0)]); }
      var fy = iy + irh + px(6), fw2 = Math.min(px(120), (cw - px(36)) / Math.max(1, Math.min(4, facts.length)));
      for (i = 0; i < Math.min(facts.length, 8); i++) {
        var fx2 = cx + px(18) + (i % 4) * fw2, fyy = fy + Math.floor(i / 4) * px(44);
        panel(ctx, fx2, fyy, fw2 - px(6), px(38), px(6), 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.08)');
        txt(ctx, facts[i][0], fx2 + px(8), fyy + px(13), { font: F(8, 'bold'), color: COL.muted, outline: false });
        txt(ctx, String(facts[i][1]), fx2 + px(8), fyy + px(31), { font: F(13, '900', FONT_DISPLAY), color: COL.ink, outline: false, maxW: fw2 - px(20) });
      }
    }
    if (gearPage || m.tab !== 3) {
      var groups = m.tab === 2 && !gearPage;
      if (!items.length) txt(ctx, m.tab === 1 ? 'No ammo for this one. It runs on conviction.' : m.tab === 2 ? 'No attachments fit this one.' : 'Nothing here.', cx + px(18), iy + px(20), { font: F(12, '', FONT_TEXT), color: COL.muted, outline: false });
      listBox(ctx, items.length, m.isel, cx + px(18), iy, cw - px(40), ih, irh, function (k, rx, ry, rw, rhh, sel) {
        var it = items[k];
        panel(ctx, rx, ry, rw, rhh - px(4), px(7), sel && m.focus === 1 ? 'rgba(63,210,127,0.2)' : 'rgba(255,255,255,0.04)', sel ? COL.green : 'rgba(255,255,255,0.08)', sel ? 1.5 : 1);
        var label = it.name || it.id, lx2 = rx + px(10);
        if (groups) { var slot = attachSlot(it).toUpperCase(); var sw = measure(ctx, slot, F(8, 'bold')) + px(10); panel(ctx, lx2, ry + px(7), sw, px(16), px(4), 'rgba(46,230,255,0.15)', null); txt(ctx, slot, lx2 + sw / 2, ry + px(18), { font: F(8, 'bold'), color: COL.cyan, align: 'center', outline: false }); lx2 += sw + px(8); }
        txt(ctx, label, lx2, ry + px(20), { font: F(12, 'bold'), color: it.locked ? COL.muted : COL.ink, outline: false, maxW: rw - (lx2 - rx) - px(110) });
        var tag = it.equipped ? 'EQUIPPED' : it.owned && it.kind !== 'ammo' && it.kind !== 'gear' ? 'OWNED' : it.locked ? 'LOCKED' : U.fmtMoney(it.price || 0);
        txt(ctx, tag, rx + rw - px(10), ry + px(20), { font: F(11, 'bold'), color: it.equipped ? COL.cyan : it.owned ? COL.lime : it.locked ? COL.amber : (p && p.money >= (it.price || 0) ? COL.ink : COL.red), align: 'right', outline: false });
      }, function (k) { if (m.isel === k && m.focus === 1) armoryBuy(items[k]); m.isel = k; m.focus = 1; }, 'arm-i');
    } else {
      // tints: swatches in a row
      var sw2 = px(46), gap = px(10), perRow = Math.max(1, Math.floor((cw - px(36)) / (sw2 + gap)));
      if (!items.length) txt(ctx, 'No tints for this one. Black goes with everything.', cx + px(18), iy + px(20), { font: F(12, '', FONT_TEXT), color: COL.muted, outline: false });
      for (i = 0; i < items.length; i++) {
        var it2 = items[i], sx = cx + px(18) + (i % perRow) * (sw2 + gap), sy = iy + Math.floor(i / perRow) * (sw2 + px(22)), on = i === m.isel;
        ctx.fillStyle = tintColor(it2, i); rr(ctx, sx, sy, sw2, sw2, px(10)); ctx.fill();
        ctx.lineWidth = on ? px(3) : 1; ctx.strokeStyle = on ? (m.focus === 1 ? COL.green : COL.ink) : 'rgba(255,255,255,0.3)'; rr(ctx, sx, sy, sw2, sw2, px(10)); ctx.stroke();
        if (it2.equipped) txt(ctx, '✓', sx + sw2 / 2, sy + sw2 / 2 + px(6), { font: F(18, '900'), color: '#fff', align: 'center' });
        else if (it2.locked) txt(ctx, '🔒', sx + sw2 / 2, sy + sw2 / 2 + px(6), { font: F(14), color: '#fff', align: 'center', outline: false });
        txt(ctx, it2.owned ? 'OWNED' : U.fmtMoney(it2.price || 0), sx + sw2 / 2, sy + sw2 + px(13), { font: F(8, 'bold'), color: it2.owned ? COL.lime : COL.muted, align: 'center', outline: false });
        hit(sx, sy, sw2, sw2, (function (k) { return function () { if (m.isel === k && m.focus === 1) armoryBuy(items[k]); m.isel = k; m.focus = 1; }; })(i), 'arm-tint-' + i);
      }
      if (items[m.isel]) txt(ctx, items[m.isel].name || '', cx + px(18), cy + ch - px(56), { font: F(12, 'bold'), color: COL.ink, outline: false });
    }
    // the action button and the message / Merle's line
    var item = S2.item, bbw = Math.min(px(220), cw - px(40)), bbx = cx + cw - bbw - px(18), bby = cy + ch - px(44);
    var can = item && !item.locked && (item.canBuy !== false) && !(item.kind === 'weapon' && item.owned) && !item.equipped;
    var lab = !item ? '—' : item.locked ? 'LOCKED' : item.equipped ? 'EQUIPPED' : item.kind === 'weapon' && item.owned ? 'OWNED' : (item.owned && (item.kind === 'attachment' || item.kind === 'tint')) ? 'EQUIP  ' + glyph('confirm') : 'BUY ' + U.fmtMoney(item.price || 0) + '  ' + glyph('confirm');
    button(ctx, bbx, bby, bbw, px(32), lab, { color: COL.green, disabled: !can, sel: m.flash > 0, fn: function () { armoryBuy(item); }, id: 'arm-buy' });
    var line = m.msgT > 0 && m.msg ? m.msg : { text: '“' + (item && item.locked ? (item.lockReason || 'Not yet. Story\'s not there yet.') : (m.bark || '')) + '”', color: '#bfe3ff' };
    txt(ctx, line.text, cx + px(18), bby + px(21), { font: F(11, m.msgT > 0 ? 'bold' : 'italic', m.msgT > 0 ? FONT_UI : FONT_TEXT), color: line.color, outline: false, maxW: cw - bbw - px(50) });
    helpLine(ctx, navKeys() + (device() === 'keyboard' && !ui.touch.visible ? '  ·  [ ] weapons' : ''), x + px(18), y + ph - px(10), pw - px(36));
  }
  function armoryInput(In) {
    var m = ui.modal, S2 = armoryState();
    if (In.pressed('weaponPrev')) { m.row = (m.row - 1 + S2.rows.length) % Math.max(1, S2.rows.length); m.isel = 0; }
    if (In.pressed('weaponNext')) { m.row = (m.row + 1) % Math.max(1, S2.rows.length); m.isel = 0; }
    if (m.focus === 0) {
      if (menuBack(In)) { closeModal(); return true; }
      if (In.pressed('forward')) { m.row = (m.row - 1 + S2.rows.length) % Math.max(1, S2.rows.length); m.isel = 0; sfx('ui', 0.15); }
      if (menuDown(In)) { m.row = (m.row + 1) % Math.max(1, S2.rows.length); m.isel = 0; sfx('ui', 0.15); }
      if (In.pressed('right') || In.pressed('confirm')) { m.focus = 1; sfx('ui', 0.2); }
    } else {
      if (menuBack(In)) { m.focus = 0; return true; }
      if (In.pressed('left')) { if (m.tab === 0) m.focus = 0; else { m.tab--; m.isel = 0; } sfx('ui', 0.15); }
      if (In.pressed('right') || In.pressed('tabNext')) { m.tab = (m.tab + 1) % S2.tabs.length; m.isel = 0; sfx('ui', 0.15); }
      var n = Math.max(1, S2.items.length);
      if (In.pressed('forward')) m.isel = (m.isel - 1 + n) % n;
      if (menuDown(In)) m.isel = (m.isel + 1) % n;
      if (In.pressed('confirm') && S2.item) armoryBuy(S2.item);
    }
    return true;
  }

  // ------------------------------------------------------------- mod shop ----
  // modshop:open {vehicle}: Spin Doctor Customs. Categories on the left (paint, finish, wheels, spoiler, tint, engine,
  // brakes, armor, turbo, horn; GTP.Content.parity.modshop overrides names, values and prices), the options with prices,
  // a live preview through GTP.Vehicles.mod(vehicle, mods) (reverted on exit unless bought), performance bars, the camera
  // orbiting the car. Buying pays from player.money, applies the mods and emits shop:buy {item: {id, kind:'mod'}, price}
  // (or calls GTP.Vehicles.buyMod(vehicle, cat, value) when it exists).
  var PAINTS = [['Stock', null], ['Pundit Pink', '#ff3fa4'], ['Breaking Red', '#d7262e'], ['Op-Ed Orange', '#ff7a20'], ['Goldplate', '#d4a52a'], ['Ratio Lime', '#8fdc3a'], ['Green Room', '#2f8f5b'], ['Teal Take', '#1fb5b0'], ['Chyron Blue', '#2a64d8'], ['Velvet Purple', '#7a3fd1'], ['Midnight Edit', '#1a1d2b'], ['Retraction White', '#e9ecf2'], ['Fact Grey', '#8b919e'], ['Matte Black', '#0d0e12']];
  var MOD_CATS = [
    { id: 'primary', name: 'Primary color', paint: true, price: 300 },
    { id: 'secondary', name: 'Secondary color', paint: true, price: 200 },
    { id: 'finish', name: 'Finish', values: ['gloss', 'metallic', 'matte', 'chrome'], labels: ['Gloss', 'Metallic', 'Matte', 'Chrome'], prices: [0, 350, 500, 2200] },
    { id: 'wheels', name: 'Wheels', levels: 6, labels: ['Stock', 'Debate Spokes', 'Op-Ed Alloys', 'Thinkpiece Chrome', 'Primetime Rims', 'Ratio Rollers'], base: 280 },
    { id: 'spoiler', name: 'Spoiler', levels: 4, labels: ['None', 'Lip', 'Wing', 'Unreasonable Wing'], base: 240 },
    { id: 'tint', name: 'Window tint', levels: 4, labels: ['None', 'Light Smoke', 'Dark Smoke', 'Limo (Sponsored)'], base: 150 },
    { id: 'engine', name: 'Engine', levels: 5, labels: ['Stock', 'Talking Points 1', 'Talking Points 2', 'Talking Points 3', 'Talking Points 4'], base: 900 },
    { id: 'brakes', name: 'Brakes', levels: 4, labels: ['Stock', 'Street', 'Sport', 'Walk It Back'], base: 500 },
    { id: 'armor', name: 'Armor', levels: 6, labels: ['None', '20%', '40%', '60%', '80%', '100%'], base: 650 },
    { id: 'turbo', name: 'Turbo', values: [false, true], labels: ['None', 'Hot Take Turbo'], prices: [0, 2600] },
    { id: 'horn', name: 'Horn', values: ['stock', 'airhorn', 'debate_bell', 'kazoo', 'applause'], labels: ['Stock', 'Air Horn', 'Debate Bell', 'Kazoo', 'Canned Applause'], prices: [0, 200, 350, 120, 480] }
  ];
  // with the vehicles track: GTP.Vehicles.modCatalog(v) -> [{part, value, name, price, current, owned, stat}] gives the
  // parts, names and prices (aircraft and boats get engine / armour only); colours ride on the 'paint' part
  var PART_NAMES = { engine: 'Engine', brakes: 'Brakes', armor: 'Armor', turbo: 'Turbo', wheels: 'Wheels', spoiler: 'Spoiler', tint: 'Window tint', horn: 'Horn', paint: 'Finish', repair: 'Repair' };
  function modCatsReal(v) {
    var Vs = GTP.Vehicles, cat = call(Vs.modCatalog, Vs, [v], null); if (!cat || !cat.length) return null;
    var base = modCats(null), out = [base[0], base[1]], by = {}, order = [];
    var pp = typeof Vs.priceOf === 'function' ? call(Vs.priceOf, Vs, ['paint', { finish: (v.mods && v.mods.paint && v.mods.paint.finish) || 'gloss' }], null) : null;
    if (pp != null) out = [Object.assign({}, base[0], { price: pp }), Object.assign({}, base[1], { price: pp })];   // a colour costs a respray
    cat.forEach(function (it) { var k = it.part; if (!by[k]) { by[k] = []; order.push(k); } by[k].push(it); });
    order.forEach(function (k) {
      var list = by[k], c = { id: k === 'paint' ? 'finish' : k, part: k, name: PART_NAMES[k] || k, real: true, values: [], labels: [], prices: [], stats: [] };
      if (k === 'turbo') { c.values.push(false); c.labels.push('No Turbo'); c.prices.push(0); c.stats.push(null); }
      list.forEach(function (it) { c.values.push(k === 'paint' ? it.value.finish : it.value); c.labels.push(it.name); c.prices.push(it.price | 0); c.stats.push(it.stat || null); });
      if (k === 'repair' && !(list[0] && list[0].price > 0)) return;   // nothing to repair
      out.push(c);
    });
    return out;
  }
  function modCats(v) {
    var Vs = GTP.Vehicles;
    if (v && Vs && typeof Vs.modCatalog === 'function') { var real = modCatsReal(v); if (real) return real; }
    var P = parity().modshop, out = MOD_CATS.map(function (c) { return Object.assign({}, c); });
    var over = P && (P.categories || P.cats);
    if (over) asList(over).forEach(function (o) { var c = findById(out, o.id); if (c) Object.assign(c, o); else out.push(Object.assign({}, o)); });
    var paints = (P && (P.paints || P.colors)) ? asList(P.paints || P.colors).map(function (pc) { return [pc.name || pc.id, pc.hex || pc.color || pc.value]; }) : PAINTS;
    out.forEach(function (c) { if (c.paint) { c.values = paints.map(function (pc) { return pc[1]; }); c.labels = paints.map(function (pc) { return pc[0]; }); } });
    return out;
  }
  function modOptions(c) {
    var out = [], i;
    if (c.values) for (i = 0; i < c.values.length; i++) out.push({ value: c.values[i], label: c.labels ? c.labels[i] : String(c.values[i]), price: c.paint ? (c.values[i] == null ? 0 : c.price) : (c.prices ? c.prices[i] : (c.price || 0) * i) });
    else for (i = 0; i < (c.levels || 1); i++) out.push({ value: i, label: c.labels ? c.labels[i] : (i ? 'Level ' + i : 'Stock'), price: c.prices ? c.prices[i] : Math.round((c.base || 200) * i * (0.8 + 0.4 * i)) });
    return out;
  }
  function defaultMods(v) {
    var m = v && v.mods ? JSON.parse(JSON.stringify(v.mods)) : {};
    m.paint = m.paint || {}; if (m.paint.primary === undefined) m.paint.primary = null; if (m.paint.secondary === undefined) m.paint.secondary = null; m.paint.finish = m.paint.finish || 'gloss';
    ['wheels', 'spoiler', 'tint', 'engine', 'brakes', 'armor'].forEach(function (k) { if (m[k] == null) m[k] = 0; });
    if (m.turbo == null) m.turbo = false; if (m.horn == null) m.horn = 'stock';
    return m;
  }
  function modValue(mods, cid) { if (cid === 'primary' || cid === 'secondary' || cid === 'finish') return mods.paint[cid]; return mods[cid]; }
  function withMod(mods, cid, val) { var m = JSON.parse(JSON.stringify(mods)); if (cid === 'primary' || cid === 'secondary' || cid === 'finish') m.paint[cid] = val; else m[cid] = val; return m; }
  function applyMods(v, mods) {
    var Vs = GTP.Vehicles; if (!v) return;
    var send = JSON.parse(JSON.stringify(mods));
    if (send.paint.primary == null) send.paint.primary = v._stockColor || v.color || undefined;
    if (send.paint.secondary == null) delete send.paint.secondary;
    if (Vs && typeof Vs.mod === 'function') { call(Vs.mod, Vs, [v, send]); return; }
    v.mods = send; if (send.paint.primary) v.color = send.paint.primary;
    rebuildMesh(v);
  }
  function openModShop(e) {
    var p = player(), v = (e && e.vehicle) || (p && p.inVehicle) || (p && p.lastVehicle) || null;
    if (v && v._stockColor == null) v._stockColor = v.color || null;
    var applied = defaultMods(v);
    return openModal('modshop', { vehicle: v, applied: applied, preview: applied, previewT: -1, cat: 0, opt: 0, focus: 0, cam: v ? { target: v, dist: 7.6, height: 2.3, lookY: 0.7, yaw: 0.6, spin: 0.22 } : null, onClose: function (m) { if (m.vehicle && m.onVehicle && m.onVehicle !== JSON.stringify(m.applied)) applyMods(m.vehicle, m.applied); } });
  }
  function modPreview(m, cid, val) {
    if (cid === 'repair') return; m.preview = withMod(m.applied, cid, val); m.previewT = 0.15; }
  function modPerf(mods) { return { accel: 0.35 + mods.engine * 0.1 + (mods.turbo ? 0.12 : 0), top: 0.45 + mods.engine * 0.08 + (mods.turbo ? 0.06 : 0), brakes: 0.4 + mods.brakes * 0.17, armor: 0.1 + mods.armor * 0.17 }; }
  function modBuy(m) {
    var cats = modCats(m.vehicle), c = cats[m.cat], opts = modOptions(c), o = opts[m.opt]; if (!c || !o) return;
    var cur = modValue(m.applied, c.id);
    if (cur === o.value || (cur == null && o.value == null)) { modalMsg(m, 'Already installed.', COL.muted); return; }
    var Vs = GTP.Vehicles, res = null;
    if (Vs && typeof Vs.buyMod === 'function' && c.id !== 'repair' && (c.id === 'primary' || c.id === 'secondary') && o.value == null) {
      // back to the stock colour is free
      m.applied = withMod(m.applied, c.id, null); applyMods(m.vehicle, m.applied); m.onVehicle = JSON.stringify(m.applied); m.preview = m.applied; m.previewT = -1;
      modalMsg(m, 'Stock colour back on.', COL.lime); return;
    }
    if (Vs && typeof Vs.buyMod === 'function') {
      // the vehicles track charges, applies and emits shop:buy {item: 'mod:<part>:<value>'}
      var part = c.part || (c.id === 'primary' || c.id === 'secondary' || c.id === 'finish' ? 'paint' : c.id), val = o.value;
      if (c.id === 'primary' || c.id === 'secondary') { val = { finish: (m.applied.paint && m.applied.paint.finish) || 'gloss' }; val[c.id] = o.value; }
      else if (c.id === 'finish') val = { finish: o.value };
      res = call(Vs.buyMod, Vs, [m.vehicle, part, val], null);
      if (res && res.ok === false) { modalMsg(m, res.reason === 'money' || res.reason === 'funds' ? 'NOT ENOUGH CASH' + (res.price ? '. It is ' + U.fmtMoney(res.price) + '.' : '.') : res.reason === 'owned' ? 'Already installed.' : 'No sale (' + (res.reason || 'unknown') + ').', COL.red); sfx('fail', 0.3); return; }
      if (res && res.ok) {
        var nm = defaultMods(m.vehicle); if (c.id === 'primary' || c.id === 'secondary') nm.paint[c.id] = o.value;
        m.applied = nm; m.preview = m.applied; m.previewT = -1; m.onVehicle = JSON.stringify(m.applied);
        modalMsg(m, 'INSTALLED: ' + o.label + (res.price ? '  -' + U.fmtMoney(res.price) : ''), COL.lime); m.flash = 1; sfx('cash', 0.6);
        return;
      }
    }
    if (!res) {
      if (!payMoney(o.price)) { modalMsg(m, 'NOT ENOUGH CASH. Need ' + U.fmtMoney(o.price - ((player() || {}).money | 0)) + ' more.', COL.red); sfx('fail', 0.3); return; }
    }
    m.applied = withMod(m.applied, c.id, o.value); m.preview = m.applied; m.previewT = -1;
    applyMods(m.vehicle, m.applied); m.onVehicle = JSON.stringify(m.applied);
    if (!res) GTP.Events.emit('shop:buy', { item: { id: 'mod_' + c.id + '_' + String(o.value).replace('#', ''), kind: 'mod', name: c.name + ': ' + o.label, category: c.id, value: o.value }, price: o.price, player: player() });
    modalMsg(m, 'INSTALLED: ' + o.label + (o.price ? '  -' + U.fmtMoney(o.price) : ''), COL.lime); m.flash = 1; sfx('cash', 0.6);
  }
  function sidePanelRect() {
    var w = Math.min(px(400), W - safe.l - safe.r), x = safe.l + px(4), y = safe.t + px(8), h = H - safe.t - safe.b - px(16);
    if (portrait || W < px(700)) { w = W - safe.l - safe.r; x = safe.l; h = Math.min(H * 0.5, px(420)); y = H - safe.b - h; }
    return { x: x, y: y, w: w, h: h };
  }
  function drawModShop(ctx) {
    var m = ui.modal, cats = modCats(m.vehicle), c = cats[m.cat], opts = modOptions(c), R = sidePanelRect(), p = player();
    var vg = ctx.createLinearGradient(R.x, 0, R.x + R.w + px(160), 0); vg.addColorStop(0, 'rgba(4,5,10,0.55)'); vg.addColorStop(1, 'rgba(4,5,10,0)');
    if (!portrait) { ctx.fillStyle = vg; ctx.fillRect(0, 0, R.x + R.w + px(160), H); }
    modalFrame(ctx, R.x, R.y, R.w, R.h, 'SPIN DOCTOR CUSTOMS', m.vehicle ? vehicleName(m.vehicle) : 'Bring a car. We bring the spin.', COL.pink);
    moneyChip(ctx, R.x + R.w - px(16), R.y + px(32));
    if (!m.vehicle) { txt(ctx, 'No vehicle in the bay.', R.x + px(18), R.y + px(110), { font: F(13, '', FONT_TEXT), color: COL.muted, outline: false }); exitButton(ctx, R.x + R.w - px(16), R.y + R.h - px(36)); return; }
    var top = R.y + px(84), split = portrait || W < px(700) ? 0.42 : 0.44, cw = (R.w - px(44)) * split, ow = R.w - px(44) - cw, rh = px(30), lh = R.h - (top - R.y) - px(158);
    listBox(ctx, cats.length, m.cat, R.x + px(16), top, cw, lh, rh, function (i, x, y, w, h, sel) {
      panel(ctx, x, y, w, h - px(4), px(6), sel ? (m.focus === 0 ? 'rgba(255,63,164,0.3)' : 'rgba(255,63,164,0.14)') : 'rgba(255,255,255,0.04)', sel ? COL.pink : null);
      txt(ctx, cats[i].name.toUpperCase(), x + px(10), y + px(17), { font: F(10, 'bold'), color: sel ? COL.ink : COL.muted, outline: false, maxW: w - px(16) });
    }, function (k) { if (m.cat !== k) { m.cat = k; m.opt = 0; m.preview = m.applied; m.previewT = 0.05; } m.focus = 1; sfx('ui', 0.15); }, 'mod-cat');
    var cur = modValue(m.applied, c.id), ox = R.x + px(28) + cw;
    listBox(ctx, opts.length, m.opt, ox, top, ow, lh, rh, function (i, x, y, w, h, sel) {
      var o = opts[i], inst = o.value === cur || (o.value == null && cur == null);
      panel(ctx, x, y, w, h - px(4), px(6), sel && m.focus === 1 ? 'rgba(255,63,164,0.3)' : 'rgba(255,255,255,0.04)', sel ? COL.pink : null);
      var lx = x + px(10);
      if (c.paint) { ctx.fillStyle = o.value || (m.vehicle._stockColor || '#777'); rr(ctx, lx, y + px(6), px(14), px(14), px(4)); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.stroke(); lx += px(20); }
      txt(ctx, o.label, lx, y + px(17), { font: F(11, 'bold'), color: COL.ink, outline: false, maxW: w - (lx - x) - px(70) });
      txt(ctx, inst ? '✓' : o.price ? U.fmtMoney(o.price) : 'FREE', x + w - px(8), y + px(17), { font: F(10, 'bold'), color: inst ? COL.lime : (p && p.money >= o.price ? COL.ink : COL.red), align: 'right', outline: false });
    }, function (k) { if (m.opt === k && m.focus === 1) modBuy(m); else { m.opt = k; m.focus = 1; modPreview(m, c.id, opts[k].value); } }, 'mod-opt');
    // performance bars: installed vs the preview
    var pf0 = modPerf(m.applied), pf1 = modPerf(m.preview), sy = top + lh + px(12), sw = R.w - px(36);
    [['accel', 'ACCELERATION', COL.lime], ['top', 'TOP SPEED', COL.cyan], ['brakes', 'BRAKING', COL.amber], ['armor', 'ARMOR', '#5aa8ff']].forEach(function (s2, i) { statBar(ctx, s2[1], pf0[s2[0]], R.x + px(18), sy + i * px(16), sw, s2[2], pf1[s2[0]] - pf0[s2[0]]); });
    var o2 = opts[m.opt], inst2 = o2 && (o2.value === cur || (o2.value == null && cur == null));
    var bw = px(150), bx = R.x + R.w - bw - px(16), byy = R.y + R.h - px(52);
    button(ctx, bx, byy, bw, px(30), inst2 ? 'INSTALLED' : 'BUY ' + U.fmtMoney(o2 ? o2.price : 0), { color: COL.pink, disabled: inst2 || m.focus !== 1, sel: m.flash > 0, fn: function () { modBuy(m); }, id: 'mod-buy' });
    exitButton(ctx, bx - px(8), byy + px(2));
    if (m.msgT > 0 && m.msg) txt(ctx, m.msg.text, R.x + px(18), byy - px(10), { font: F(10, 'bold'), color: m.msg.color, outline: false, maxW: R.w - px(36) });
    helpLine(ctx, navKeys() + '  ·  drag / right stick turns the car', R.x + px(18), R.y + R.h - px(10), R.w - px(36));
  }
  function modShopInput(In) {
    var m = ui.modal, cats = modCats(m.vehicle), c = cats[m.cat], opts = modOptions(c);
    if (m.focus === 0) {
      if (menuBack(In)) { closeModal(); return true; }
      if (In.pressed('forward')) { m.cat = (m.cat - 1 + cats.length) % cats.length; m.opt = 0; sfx('ui', 0.15); }
      if (menuDown(In)) { m.cat = (m.cat + 1) % cats.length; m.opt = 0; sfx('ui', 0.15); }
      if (In.pressed('right') || In.pressed('confirm')) { m.focus = 1; var cur = modValue(m.applied, cats[m.cat].id), oo = modOptions(cats[m.cat]); for (var i = 0; i < oo.length; i++) if (oo[i].value === cur) m.opt = i; modPreview(m, cats[m.cat].id, oo[m.opt] ? oo[m.opt].value : null); }
    } else {
      if (menuBack(In) || In.pressed('left')) { m.focus = 0; m.preview = m.applied; m.previewT = 0.05; return true; }
      if (In.pressed('forward')) { m.opt = (m.opt - 1 + opts.length) % opts.length; modPreview(m, c.id, opts[m.opt].value); sfx('ui', 0.12); }
      if (menuDown(In)) { m.opt = (m.opt + 1) % opts.length; modPreview(m, c.id, opts[m.opt].value); sfx('ui', 0.12); }
      if (In.pressed('confirm')) modBuy(m);
    }
    return true;
  }

  // ---------------------------------------------------- wardrobe and barber ----
  // clothing:open / barber:open: Lanyard & Co. and the Clip Joint. Categories (top, bottom, shoes, hat, glasses; hair,
  // color, beard) from GTP.Content.parity.clothing / .barber, a live preview on player.look (rebuilt through
  // GTP.Render.rebuildEntityMesh), the camera in front of the player. Buying calls the systems track
  // (Systems.buyClothing / Systems.clothing.buy / Systems.buyHaircut / Systems.barber.buy / Systems.buy(kind, id)), else
  // pays and applies the look here.
  var CLOTHING_DEFAULT = [
    { id: 'top', name: 'Tops', items: [{ id: 'top_tee_white', name: 'Plain Tee (White)', price: 40, color: '#e9ecf2' }, { id: 'top_quarterzip', name: 'Quarter-Zip of Authority', price: 180, color: '#2a3550' }, { id: 'top_blazer', name: 'Debate Blazer', price: 450, color: '#3a2a4a' }, { id: 'top_hoodie', name: 'Podcast Hoodie', price: 120, color: '#ff3fa4' }, { id: 'top_vest', name: 'Fleece Vest (Finance)', price: 260, color: '#4a5a6a' }] },
    { id: 'bottom', name: 'Bottoms', items: [{ id: 'bottom_chinos', name: 'Chinos', price: 90, color: '#b8a27a' }, { id: 'bottom_jeans', name: 'Relatable Jeans', price: 120, color: '#3a5a8a' }, { id: 'bottom_slacks', name: 'Cable-Hit Slacks', price: 220, color: '#2a2a33' }] },
    { id: 'shoes', name: 'Shoes', items: [{ id: 'shoes_loafers', name: 'Loafers', price: 160, color: '#5a3a22' }, { id: 'shoes_sneakers', name: 'Hype Sneakers', price: 300, color: '#f0f0f0' }] },
    { id: 'hat', name: 'Hats', items: [{ id: 'hat_none', name: 'No hat', price: 0 }, { id: 'hat_cap', name: 'Ball Cap (No Slogan)', price: 35, color: '#d7262e' }, { id: 'hat_beanie', name: 'Studio Beanie', price: 45, color: '#1a1d2b' }, { id: 'hat_fedora', name: 'Fedora (Regrettable)', price: 120, color: '#3a2a22' }, { id: 'hat_beret', name: 'Beret (Thinkpiece)', price: 80, color: '#7a3fd1' }] },
    { id: 'glasses', name: 'Glasses', items: [{ id: 'glasses_none', name: 'No glasses', price: 0 }, { id: 'glasses_round', name: 'Thinkpiece Rounds', price: 95 }, { id: 'glasses_aviator', name: 'Aviators (Bold)', price: 140 }, { id: 'glasses_thick', name: 'Thick Frames (Credible)', price: 110 }] }
  ];
  var BARBER_DEFAULT = [
    { id: 'hair', name: 'Cut', items: [{ id: 'hair_short', name: 'The Short Take', price: 30, style: 'short' }, { id: 'hair_slick', name: 'Slick Side Part (Pundit)', price: 45, style: 'slick' }, { id: 'hair_pompadour', name: 'Pompadour of Certainty', price: 70, style: 'pompadour' }, { id: 'hair_bald', name: 'Clean Slate', price: 20, style: 'bald' }, { id: 'hair_long', name: 'Long, Contemplative', price: 60, style: 'long' }, { id: 'hair_mohawk', name: 'Mohawk (Disruptor)', price: 90, style: 'mohawk' }, { id: 'hair_afro', name: 'Big Opinion Afro', price: 80, style: 'afro' }, { id: 'hair_bun', name: 'Op-Ed Bun', price: 55, style: 'bun' }] },
    { id: 'color', name: 'Color', items: [{ id: 'hc_brown', name: 'Brown', price: 25, hex: '#5a3a22' }, { id: 'hc_black', name: 'Black', price: 25, hex: '#16161a' }, { id: 'hc_blond', name: 'Blond', price: 35, hex: '#d8b866' }, { id: 'hc_grey', name: 'Distinguished Grey', price: 40, hex: '#a8a8ad' }, { id: 'hc_pink', name: 'Rebrand Pink', price: 60, hex: '#ff3fa4' }] },
    { id: 'beard', name: 'Facial hair', items: [{ id: 'beard_none', name: 'Clean', price: 15 }, { id: 'beard_stubble', name: 'Deadline Stubble', price: 20 }, { id: 'beard_full', name: 'Full (Serious)', price: 45 }] }
  ];
  // GTP.Systems owns the purchase: wardrobe.items(slot, store) rows {id, slot, name, price, look, flavor, owned, equipped,
  // locked} and wardrobe.buy(id) (buys, wears, applies the look); barber.options() {styles, colors} (each with `current`)
  // and barber.buy(styleId, colorId). Its rows carry _sys so the buy goes back to the same ids. Without it: the content
  // tables and a local purchase.
  var SLOT_NAMES = { top: 'Tops', bottom: 'Bottoms', shoes: 'Shoes', hat: 'Hats', glasses: 'Glasses', hair: 'Cut', color: 'Colour' };
  function wardrobeCatsSys(mode, store) {
    var S = GTP.Systems; if (!S) return null;
    if (mode === 'barber') {
      var B = S.barber; if (!B || typeof B.options !== 'function') return null;
      var o = call(B.options, B, [], null); if (!o) return null;
      return [{ id: 'hair', name: 'Cut', items: asList(o.styles).map(function (st) { return Object.assign({}, st, { style: st.style || st.hair || st.id, _sys: 'style' }); }) },
        { id: 'color', name: 'Colour', items: asList(o.colors).map(function (c) { return Object.assign({}, c, { hex: c.hex || c.color, _sys: 'color' }); }) }].filter(function (c) { return c.items.length; });
    }
    var Wr = S.wardrobe; if (!Wr || typeof Wr.items !== 'function') return null;
    var list = call(Wr.items, Wr, [null, store || null], null); if (!list || !list.length) return null;
    var by = {}, order = [];
    list.forEach(function (it) { var k = String(it.slot || 'other'); if (!by[k]) { by[k] = []; order.push(k); } by[k].push(Object.assign({}, it, { _sys: 'clothing' })); });
    return order.map(function (k) { return { id: k, name: SLOT_NAMES[k] || k.charAt(0).toUpperCase() + k.slice(1), items: by[k] }; });
  }
  function wardrobeCats(mode, store) {
    var sys = wardrobeCatsSys(mode, store); if (sys && sys.length) return sys;
    var P = parity(), src = mode === 'barber' ? P.barber : P.clothing, out = [];
    function group(list) { var by = {}, order = []; asList(list).forEach(function (it) { var k = String(it.slot || it.category || it.cat || it.type || 'other'); if (!by[k]) { by[k] = []; order.push(k); } by[k].push(it); }); return order.map(function (k) { return { id: k, name: k.charAt(0).toUpperCase() + k.slice(1), items: by[k] }; }); }
    if (Array.isArray(src)) out = src.length && src[0] && src[0].items ? src : group(src);
    else if (src && typeof src === 'object') {
      if (src.items) out = group(src.items);
      else if (src.categories) out = asList(src.categories);
      else Object.keys(src).forEach(function (k) { if (Array.isArray(src[k])) out.push({ id: k, name: k.charAt(0).toUpperCase() + k.slice(1), items: src[k].map(function (it) { return typeof it === 'string' ? { id: it, name: it } : it; }) }); });
    }
    return out.length ? out : (mode === 'barber' ? BARBER_DEFAULT : CLOTHING_DEFAULT);
  }
  function lookOf(p) { if (!p.look) p.look = {}; return p.look; }
  function cloneLook(l) { return JSON.parse(JSON.stringify(l || {})); }
  function applyItemToLook(look, mode, slot, it) {
    slot = String(slot || '').toLowerCase();
    if (it.look && typeof it.look === 'object') { Object.assign(look, it.look); if (mode !== 'barber') { look.outfit = look.outfit || {}; look.outfit[slot] = it.id; } return look; }
    var style = it.style || String(it.id || '').replace(/^(hair|hat|glasses|beard)_/, '');
    if (mode === 'barber') {
      if (/col/.test(slot)) look.hairColor = it.hex || it.color || look.hairColor;
      else if (/beard|facial/.test(slot)) look.beard = style;
      else look.hair = style;
      return look;
    }
    look.outfit = look.outfit || {};
    look.outfit[slot] = it.id;
    if (it.color) { if (/top|shirt|jacket|torso/.test(slot)) look.shirt = it.color; else if (/bottom|pant|leg/.test(slot)) look.pants = it.color; }
    if (/hat/.test(slot)) { look.hat = /none/.test(it.id) ? 'none' : style; if (it.color) look.hatColor = it.color; }
    if (/glass/.test(slot)) look.glasses = /none/.test(it.id) ? 'none' : style;
    return look;
  }
  function isWorn(p, mode, slot, it) {
    if (it._sys) return it._sys === 'clothing' ? !!it.equipped : !!it.current;
    var l = lookOf(p); slot = String(slot || '').toLowerCase();
    var style = it.style || String(it.id || '').replace(/^(hair|hat|glasses|beard)_/, '');
    if (mode === 'barber') { if (/col/.test(slot)) return (it.hex || it.color) === l.hairColor; if (/beard|facial/.test(slot)) return l.beard === style; return l.hair === style; }
    return !!(l.outfit && l.outfit[slot] === it.id);
  }
  function ownsItem(p, id, it) {
    if (it && it._sys) return it._sys === 'clothing' ? !!it.owned : false;
    var S = GTP.Systems;
    if (S && typeof S.owns === 'function') { var r = call(S.owns, S, [id], null); if (r != null) return !!r; }
    var o = p.wardrobe || p.owned; if (Array.isArray(o)) return o.indexOf(id) >= 0; if (o && typeof o === 'object') return !!o[id];
    return false;
  }
  function openWardrobe(mode, opts) {
    var p = player(); if (!p) return null;
    var barber = mode === 'barber';
    var committed = cloneLook(lookOf(p));
    return openModal('wardrobe', { mode: barber ? 'barber' : 'clothing', store: (opts && opts.store) || null, committed: committed, cat: 0, opt: 0, focus: 0, previewT: -1,
      cam: { target: p, dist: barber ? 1.5 : 3.1, height: barber ? 1.72 : 1.45, lookY: barber ? 1.62 : 1.05, yaw: barber ? 0.35 : 0.25, spin: 0 },
      onClose: function (m) { var pl = player(), want = JSON.stringify(m.committed); if (pl && (JSON.stringify(pl.look) !== want || (m.meshLook && m.meshLook !== want))) { pl.look = cloneLook(m.committed); rebuildMesh(pl); } } });
  }
  function wardrobePreview(m) {
    var p = player(), cats = wardrobeCats(m.mode, m.store), c = cats[m.cat], it = c && c.items[m.opt]; if (!p || !it) return;
    p.look = applyItemToLook(cloneLook(m.committed), m.mode, c.id, it); m.previewT = 0.12;
  }
  function wardrobeBuy(m) {
    var p = player(), cats = wardrobeCats(m.mode, m.store), c = cats[m.cat], it = c && c.items[m.opt]; if (!p || !it) return;
    if (isWorn(Object.assign({}, p, { look: m.committed }), m.mode, c.id, it)) { modalMsg(m, 'You are already wearing that. Bold.', COL.muted); return; }
    var S = GTP.Systems, res = null, price = ownsItem(p, it.id, it) ? 0 : (it.price || 0);
    if (it._sys === 'clothing' && S.wardrobe && S.wardrobe.buy) res = call(S.wardrobe.buy, S.wardrobe, [it.id], null);
    else if (it._sys && S.barber && S.barber.buy) res = call(S.barber.buy, S.barber, [it._sys === 'style' ? it.id : null, it._sys === 'color' ? it.id : null], null);
    if (res && !res.ok && res.reason === 'unknown') res = null;   // an id the systems table does not know: the local purchase
    if (it._sys && res && res.ok) {   // the systems module applied the look (applyLook); keep it as the committed one
      m.committed = cloneLook(p.look); rebuildMesh(p); m.meshLook = JSON.stringify(p.look); m.previewT = -1;
      modalMsg(m, (res.price ? 'BOUGHT: ' : 'WEARING: ') + it.name + (res.price ? '  -' + U.fmtMoney(res.price) : ''), COL.lime); m.flash = 1;
      return;
    }
    var fns = m.mode === 'barber' ? [[S, 'buyHaircut'], [S && S.barber, 'buy']] : [[S, 'buyClothing'], [S && S.clothing, 'buy']];
    for (var i = 0; i < fns.length && res == null; i++) if (fns[i][0] && typeof fns[i][0][fns[i][1]] === 'function') res = call(fns[i][0][fns[i][1]], fns[i][0], [it.id, { slot: c.id }], null);
    if (res == null && S && typeof S.buy === 'function') res = call(S.buy, S, [m.mode, it.id, { slot: c.id }], null);
    var ok = res === true || (res && res.ok);
    if (res != null && !ok) { var rz = res && res.reason; modalMsg(m, rz === 'funds' || rz === 'money' ? 'NOT ENOUGH CASH.' + (res.need ? ' Need ' + U.fmtMoney(res.need) + ' more.' : '') : rz === 'locked' ? 'LOCKED. ' + (it.unlock && it.unlock.mission ? 'Unlocks after "' + missionTitle(it.unlock.mission) + '".' : 'Not yet.') : 'No sale.', COL.red); sfx('fail', 0.3); return; }
    if (res == null) {
      if (!payMoney(price)) { modalMsg(m, 'NOT ENOUGH CASH. Need ' + U.fmtMoney(price - (p.money | 0)) + ' more.', COL.red); sfx('fail', 0.3); return; }
      p.wardrobe = Array.isArray(p.wardrobe) ? p.wardrobe : []; if (p.wardrobe.indexOf(it.id) < 0) p.wardrobe.push(it.id);
      p.look = applyItemToLook(cloneLook(m.committed), m.mode, c.id, it); rebuildMesh(p);
      GTP.Events.emit('shop:buy', { item: { id: it.id, kind: m.mode, name: it.name, slot: c.id }, price: price, player: p });
    }
    m.committed = applyItemToLook(cloneLook(m.committed), m.mode, c.id, it);
    if (JSON.stringify(p.look) !== JSON.stringify(m.committed) || (m.meshLook && m.meshLook !== JSON.stringify(m.committed))) { p.look = cloneLook(m.committed); rebuildMesh(p); }
    m.meshLook = JSON.stringify(p.look); m.previewT = -1;
    modalMsg(m, (price ? 'BOUGHT: ' : 'WEARING: ') + it.name + (price ? '  -' + U.fmtMoney(price) : ''), COL.lime); m.flash = 1; sfx('cash', 0.5);
  }
  function drawWardrobe(ctx) {
    var m = ui.modal, p = player(), cats = wardrobeCats(m.mode, m.store), c = cats[m.cat] || cats[0], items = c ? c.items : [], R = sidePanelRect();
    var barber = m.mode === 'barber', accent = barber ? COL.amber : COL.cyan;
    var vg = ctx.createLinearGradient(R.x, 0, R.x + R.w + px(160), 0); vg.addColorStop(0, 'rgba(4,5,10,0.5)'); vg.addColorStop(1, 'rgba(4,5,10,0)');
    if (!portrait) { ctx.fillStyle = vg; ctx.fillRect(0, 0, R.x + R.w + px(160), H); }
    modalFrame(ctx, R.x, R.y, R.w, R.h, barber ? 'CLIP JOINT' : 'LANYARD & CO.', barber ? 'Hair that holds a take.' : 'Dress for the outrage you want.', accent);
    moneyChip(ctx, R.x + R.w - px(16), R.y + px(32));
    // category chips across the top
    var top = R.y + px(84), chipX = R.x + px(16);
    for (var i = 0; i < cats.length; i++) {
      var cw2 = measure(ctx, cats[i].name.toUpperCase(), F(10, 'bold')) + px(18), on = i === m.cat;
      if (chipX + cw2 > R.x + R.w - px(16)) break;
      panel(ctx, chipX, top, cw2, px(24), px(12), on ? hexA(accent, m.focus === 0 ? 0.4 : 0.2) : 'rgba(255,255,255,0.05)', on ? accent : 'rgba(255,255,255,0.12)');
      txt(ctx, cats[i].name.toUpperCase(), chipX + cw2 / 2, top + px(16), { font: F(10, 'bold'), color: on ? COL.ink : COL.muted, align: 'center', outline: false });
      hit(chipX, top, cw2, px(24), (function (k) { return function () { m.cat = k; m.opt = 0; m.focus = 1; wardrobePreview(m); }; })(i), 'ward-cat-' + i);
      chipX += cw2 + px(6);
    }
    var ly = top + px(34), lh = R.h - (ly - R.y) - px(100), rh = px(36);
    listBox(ctx, items.length, m.opt, R.x + px(16), ly, R.w - px(36), lh, rh, function (k, x, y, w, h, sel) {
      var it = items[k], worn = isWorn(Object.assign({}, p, { look: m.committed }), m.mode, c.id, it), own = ownsItem(p, it.id, it);
      panel(ctx, x, y, w, h - px(4), px(7), sel && m.focus === 1 ? hexA(accent, 0.24) : 'rgba(255,255,255,0.04)', sel ? accent : 'rgba(255,255,255,0.08)', sel ? 1.5 : 1);
      var sw = it.hex || it.color || (it.look && (it.look.shirt || it.look.pants || it.look.shoes || it.look.hatColor));
      if (sw) { ctx.fillStyle = sw; rr(ctx, x + px(10), y + px(8), px(16), px(16), px(4)); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke(); }
      txt(ctx, it.name || it.id, x + (sw ? px(34) : px(12)), y + px(21), { font: F(12, 'bold'), color: COL.ink, outline: false, maxW: w - px(120) });
      txt(ctx, worn ? 'WEARING' : own ? 'OWNED' : it.price ? U.fmtMoney(it.price) : 'FREE', x + w - px(10), y + px(21), { font: F(11, 'bold'), color: worn ? accent : own ? COL.lime : (p.money >= (it.price || 0) ? COL.ink : COL.red), align: 'right', outline: false });
    }, function (k) { if (m.opt === k && m.focus === 1) wardrobeBuy(m); else { m.opt = k; m.focus = 1; wardrobePreview(m); } }, 'ward-item');
    var it2 = items[m.opt], worn2 = it2 && isWorn(Object.assign({}, p, { look: m.committed }), m.mode, c.id, it2);
    var bw = px(160), bx = R.x + R.w - bw - px(16), byy = R.y + R.h - px(52);
    button(ctx, bx, byy, bw, px(30), worn2 ? 'WEARING' : it2 && it2.locked ? 'LOCKED' : it2 && (ownsItem(p, it2.id, it2) || !it2.price) && it2._sys !== 'style' && it2._sys !== 'color' ? 'WEAR' : 'BUY ' + U.fmtMoney(it2 ? it2.price : 0), { color: accent, disabled: !it2 || worn2 || m.focus !== 1, sel: m.flash > 0, fn: function () { wardrobeBuy(m); }, id: 'ward-buy' });
    exitButton(ctx, bx - px(8), byy + px(2));
    if (m.msgT > 0 && m.msg) txt(ctx, m.msg.text, R.x + px(18), byy - px(8), { font: F(10, 'bold'), color: m.msg.color, outline: false, maxW: R.w - px(36) });
    helpLine(ctx, navKeys() + '  ·  drag turns the camera', R.x + px(18), R.y + R.h - px(10), R.w - px(36));
  }
  function wardrobeInput(In) {
    var m = ui.modal, cats = wardrobeCats(m.mode, m.store), n = Math.max(1, (cats[m.cat] || { items: [] }).items.length);
    if (m.focus === 0) {
      if (menuBack(In)) { closeModal(); return true; }
      if (In.pressed('left')) { m.cat = (m.cat - 1 + cats.length) % cats.length; m.opt = 0; sfx('ui', 0.15); }
      if (In.pressed('right')) { m.cat = (m.cat + 1) % cats.length; m.opt = 0; sfx('ui', 0.15); }
      if (In.pressed('confirm') || menuDown(In)) { m.focus = 1; wardrobePreview(m); }
    } else {
      if (menuBack(In)) { m.focus = 0; var p = player(); if (p) { p.look = cloneLook(m.committed); if (m.meshLook && m.meshLook !== JSON.stringify(p.look)) { rebuildMesh(p); m.meshLook = JSON.stringify(p.look); } m.previewT = -1; } return true; }
      if (In.pressed('left') || In.pressed('weaponPrev')) { m.cat = (m.cat - 1 + cats.length) % cats.length; m.opt = 0; wardrobePreview(m); }
      if (In.pressed('right') || In.pressed('weaponNext') || In.pressed('tabNext')) { m.cat = (m.cat + 1) % cats.length; m.opt = 0; wardrobePreview(m); }
      if (In.pressed('forward')) { m.opt = (m.opt - 1 + n) % n; wardrobePreview(m); sfx('ui', 0.12); }
      if (menuDown(In)) { m.opt = (m.opt + 1) % n; wardrobePreview(m); sfx('ui', 0.12); }
      if (In.pressed('confirm')) wardrobeBuy(m);
    }
    return true;
  }

  // ------------------------------------------------------------- property ----
  // property:open {id}: the listing card (name, district, price, income per day, garage slots, the perks) with BUY.
  // Data: GTP.Systems.properties.get(id) / GTP.Content.parity.properties; buying calls Systems.buyProperty(id) or
  // Systems.properties.buy(id), else pays here and emits property:buy {id, price}.
  // GTP.Systems.properties.list() rows: {id, name, kind ('safehouse' | 'business'), price, income, garage, flavor, landmark,
  // owned, locked, lockReason ('mission' | 'flag'), unlock}; property:open {id, ..., handled} gets handled = true here
  function propertyDef(id) {
    var S = GTP.Systems, sp = S && S.properties, d = null;
    if (sp && typeof sp.list === 'function') d = findById(call(sp.list, sp, [], []), id);
    if (!d && sp && typeof sp.get === 'function') d = call(sp.get, sp, [id], null);
    if (!d && sp && Array.isArray(sp.list)) d = findById(sp.list, id);
    return d || findById(parity().properties, id) || { id: id, name: String(id || 'Property').replace(/_/g, ' '), price: 50000, income: 0 };
  }
  function propertyOwned(id) {
    var S = GTP.Systems, sp = S && S.properties;
    if (sp && typeof sp.owned === 'function') return !!call(sp.owned, sp, [id], false);
    if (S && typeof S.ownsProperty === 'function') return !!call(S.ownsProperty, S, [id], false);
    var d = propertyDef(id); if (d && d.owned != null) return !!d.owned;
    var p = player(); return !!(p && p.properties && (Array.isArray(p.properties) ? p.properties.indexOf(id) >= 0 : p.properties[id]));
  }
  function openProperty(e) { var id = e && (e.id || e.propertyId); if (!id) return null; var m = openModal('property', { id: id, sel: 0 }); if (m && e) e.handled = true; return m; }
  function propertyDistrict(d) {
    if (d.district) return String(d.district);
    var Wd = GTP.World, lm = Wd && typeof Wd.landmark === 'function' ? call(Wd.landmark, Wd, [d.landmark || d.near], null) : null;
    var dd = lm && (lm.districtName || lm.district);
    return dd ? String(dd).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : '';
  }
  // an owned safehouse: sleep six hours and save (Systems.properties.sleep), refused while wanted or on a mission
  function propertySleep(m) {
    var S = GTP.Systems, sp = S && S.properties, g = game(), res = null;
    var why = saveBlocker(g);
    if (why) { modalMsg(m, why, COL.amber); sfx('fail', 0.3); return; }
    if (sp && typeof sp.sleep === 'function') res = call(sp.sleep, sp, [m.id], null);
    else if (g && g.saveSlot) res = { ok: !!call(g.saveSlot, g, [g.activeSlot || 1, { reason: 'safehouse' }], false) };
    if (res && res.ok) { closeModal(); toast('Slept six hours. Saved.'); return; }
    var r = res && res.reason;
    modalMsg(m, r === 'wanted' ? 'Lose the heat before you sleep.' : r === 'mission' ? 'Finish the mission first.' : 'Could not save.', COL.red); sfx('fail', 0.3);
  }
  function propertyBuy(m) {
    var d = propertyDef(m.id), S = GTP.Systems, sp = S && S.properties, res = null, p = player();
    if (propertyOwned(m.id) || m.bought) { if (d.kind === 'safehouse') propertySleep(m); else modalMsg(m, 'You already own it. The HOA has noticed.', COL.muted); return; }
    if (d.locked) { modalMsg(m, 'NOT ON THE MARKET YET.' + (d.unlock && d.unlock.mission ? ' Unlocks after "' + missionTitle(d.unlock.mission) + '".' : ''), COL.amber); sfx('fail', 0.3); return; }
    if (S && typeof S.buyProperty === 'function') res = call(S.buyProperty, S, [m.id], null);
    else if (sp && typeof sp.buy === 'function') res = call(sp.buy, sp, [m.id], null);
    var ok = res === true || (res && res.ok);
    if (res != null && !ok) {
      var r = res && res.reason, need = res && res.need;
      modalMsg(m, r === 'money' || r === 'funds' ? 'NOT ENOUGH CASH.' + (need ? ' Need ' + U.fmtMoney(need) + ' more.' : '') : r === 'mission' ? 'Not during a mission. The seller wants your full attention.' : r === 'locked' ? 'NOT ON THE MARKET YET.' : r === 'owned' ? 'You already own it.' : 'The seller "has other offers".', COL.red);
      sfx('fail', 0.3); return;
    }
    if (res == null) {
      if (!payMoney(d.price || 0)) { modalMsg(m, 'NOT ENOUGH CASH. Need ' + U.fmtMoney((d.price || 0) - (p.money | 0)) + ' more.', COL.red); sfx('fail', 0.3); return; }
      p.properties = p.properties && typeof p.properties === 'object' && !Array.isArray(p.properties) ? p.properties : {}; p.properties[m.id] = true;
      GTP.Events.emit('property:buy', { id: m.id, price: d.price || 0 });
    }
    modalMsg(m, 'SOLD. Keys, deed and a welcome basket of complaints.', COL.lime); m.flash = 1; m.bought = true; sfx('cash', 0.7);
  }
  function drawPropertyArt(ctx, x, y, w, h, seed, kind) {
    var g2 = ctx.createLinearGradient(0, y, 0, y + h); g2.addColorStop(0, '#2a2f5e'); g2.addColorStop(0.6, '#e8805a'); g2.addColorStop(1, '#f2c27a');
    ctx.save(); rr(ctx, x, y, w, h, px(10)); ctx.clip(); ctx.fillStyle = g2; ctx.fillRect(x, y, w, h);
    var r = seed;
    function rnd() { r = (r * 9301 + 49297) % 233280; return r / 233280; }
    for (var i = 0; i < 9; i++) { var bw = w * (0.08 + rnd() * 0.1), bh = h * (0.25 + rnd() * 0.35), bx = x + (i / 9) * w; ctx.fillStyle = 'rgba(20,22,40,0.55)'; ctx.fillRect(bx, y + h - bh, bw, bh); }
    var mw = w * (kind === 'penthouse' ? 0.3 : 0.42), mh = h * (kind === 'penthouse' ? 0.8 : 0.5), mx = x + (w - mw) / 2, my = y + h - mh;
    ctx.fillStyle = '#151831'; ctx.fillRect(mx, my, mw, mh);
    if (kind !== 'penthouse') { ctx.beginPath(); ctx.moveTo(mx - px(8), my); ctx.lineTo(mx + mw / 2, my - h * 0.16); ctx.lineTo(mx + mw + px(8), my); ctx.closePath(); ctx.fill(); }
    for (var wy = my + px(10); wy < y + h - px(14); wy += px(16)) for (var wx = mx + px(8); wx < mx + mw - px(10); wx += px(16)) { ctx.fillStyle = rnd() > 0.4 ? '#ffd27a' : 'rgba(255,255,255,0.1)'; ctx.fillRect(wx, wy, px(8), px(9)); }
    ctx.restore();
  }
  function drawProperty(ctx) {
    var m = ui.modal, d = propertyDef(m.id), owned = propertyOwned(m.id), p = player();
    ctx.fillStyle = 'rgba(4,5,10,0.6)'; ctx.fillRect(0, 0, W, H);
    var pw = Math.min(px(560), W - safe.l - safe.r), ph = Math.min(px(470), H - safe.t - safe.b), x = (W - pw) / 2, y = (H - ph) / 2;
    glass(ctx, x, y, pw, ph, null, px(16));
    var ah = Math.min(px(180), ph * 0.36);
    var seed = 0; String(m.id).split('').forEach(function (ch) { seed = (seed * 31 + ch.charCodeAt(0)) % 233280; });
    drawPropertyArt(ctx, x + px(14), y + px(14), pw - px(28), ah, seed, d.kind || (/pent/.test(m.id) ? 'penthouse' : 'house'));
    // the FOR SALE / OWNED ribbon
    ctx.save(); ctx.translate(x + pw - px(70), y + px(40)); ctx.rotate(0.35); ctx.fillStyle = owned || m.bought ? COL.lime : COL.red; ctx.fillRect(-px(70), -px(12), px(140), px(24)); txt(ctx, owned || m.bought ? 'OWNED' : 'FOR SALE', 0, px(5), { font: F(12, '900'), color: '#0b1020', align: 'center', outline: false }); ctx.restore();
    var ty = y + ah + px(48);
    txt(ctx, String(d.name || m.id).toUpperCase(), x + px(22), ty, { font: F(22, '900', FONT_DISPLAY), color: COL.ink, outline: false, maxW: pw - px(44) });
    var dist = propertyDistrict(d);
    txt(ctx, (dist ? String(dist) + '  ·  ' : '') + (d.kind ? String(d.kind).toUpperCase() : 'PROPERTY'), x + px(22), ty + px(20), { font: F(10, 'bold'), color: COL.cyan, outline: false });
    var facts = [[owned || m.bought ? 'PAID' : 'PRICE', d.price ? U.fmtMoney(d.price) : 'FREE', owned || m.bought || (p && p.money >= (d.price || 0)) ? COL.lime : COL.red], ['INCOME', d.income ? U.fmtMoney(d.income) + ' / day' : '—', COL.ink], ['GARAGE', d.garage != null ? d.garage + ' car' + (d.garage === 1 ? '' : 's') : '—', COL.ink]];
    var fw = (pw - px(44)) / 3;
    for (var i = 0; i < facts.length; i++) {
      var fx = x + px(22) + i * fw;
      panel(ctx, fx, ty + px(34), fw - px(8), px(50), px(8), 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.1)');
      txt(ctx, facts[i][0], fx + px(10), ty + px(50), { font: F(8, 'bold'), color: COL.muted, outline: false });
      txt(ctx, facts[i][1], fx + px(10), ty + px(74), { font: F(14, '900', FONT_DISPLAY), color: facts[i][2], outline: false, maxW: fw - px(24) });
    }
    var desc = d.flavor || d.desc || d.description || (d.kind === 'safehouse' ? 'A safehouse: the bed saves your game, the garage keeps your ride.' : 'A business that pays out every game day. Allegedly.');
    if (d.locked && !owned) desc = 'Not on the market yet' + (d.unlock && d.unlock.mission ? ': unlocks after "' + missionTitle(d.unlock.mission) + '". ' : '. ') + desc;
    var dl = wrap(ctx, desc, F(12, '', FONT_TEXT), pw - px(44));
    for (i = 0; i < Math.min(3, dl.length); i++) txt(ctx, dl[i], x + px(22), ty + px(106) + i * px(16), { font: F(12, '', FONT_TEXT), color: COL.muted, outline: false });
    var bw = px(180), bx = x + pw - bw - px(22), byy = y + ph - px(48);
    var sleeper = (owned || m.bought) && d.kind === 'safehouse';
    button(ctx, bx, byy, bw, px(34), sleeper ? 'SLEEP & SAVE  ' + glyph('confirm') : owned || m.bought ? 'OWNED' : d.locked ? 'LOCKED' : 'BUY  ' + glyph('confirm'), { color: sleeper ? COL.cyan : COL.lime, disabled: !sleeper && (owned || m.bought || d.locked), sel: m.flash > 0, fn: function () { propertyBuy(m); }, id: 'prop-buy' });
    button(ctx, x + px(22), byy, px(110), px(34), 'BACK  ' + glyph('cancel'), { color: COL.muted, fn: closeModal, id: 'prop-back' });
    if (m.msgT > 0 && m.msg) txt(ctx, m.msg.text, x + pw / 2, byy - px(10), { font: F(11, 'bold'), color: m.msg.color, align: 'center', outline: false, maxW: pw - px(40) });
  }
  function propertyInput(In) { var m = ui.modal; if (menuBack(In)) { closeModal(); return true; } if (In.pressed('confirm')) propertyBuy(m); return true; }

  // ------------------------------------------------------- the heist board ----
  // heist:board {missionId, approaches:[{id,name,hostiles,payout,wanted,line}], crew:[{id,name,cut,perk}], mission} comes
  // from the story (GTP.Heist): its ids are the ones heist:plan must carry back, so the payload is authoritative. The
  // content's parity.heists.<id> only enriches it (an approach's pitch, a crew member's role and pitch, the board title).
  // A corkboard: approach index cards, the crew as polaroids (toggle up to four), the job's pay after the cuts on a sticky
  // note. CONFIRM emits heist:plan {approach, crew:[ids], missionId}.
  var HEIST_DEFAULT = {
    approaches: [
      { id: 'quiet', name: 'The Quiet Take', hostiles: 0.6, payout: 1.0, wanted: 2, line: 'In through the loading dock, out before the panel ends.' },
      { id: 'loud', name: 'The Loud Take', hostiles: 1.5, payout: 1.3, wanted: 4, line: 'Through the front door, on air, with a megaphone.' }
    ],
    crew: [{ id: 'gus', name: 'Gus', cut: 0.1, perk: 'driver' }, { id: 'roz', name: 'Roz', cut: 0.08, perk: 'crowd' }, { id: 'kip', name: 'Kip', cut: 0.02, perk: 'hacker' }]
  };
  var HEIST_MAX_CREW = 4;
  function heistDef(src) {
    src = src || {};
    var P = parity(), H = GTP.Heist, ph = null, hs = asList(P.heists);
    for (var i = 0; i < hs.length; i++) if (hs[i] && (hs[i].missions || []).indexOf(src.missionId) >= 0) ph = hs[i];
    var aps = asList(src.approaches).length ? asList(src.approaches) : (H && H.approaches ? H.approaches() : HEIST_DEFAULT.approaches);
    var crew = asList(src.crew).length ? asList(src.crew) : (H && H.crewList ? H.crewList() : HEIST_DEFAULT.crew);
    var pa = ph ? asList(ph.approaches) : [], pc = ph ? asList(ph.crew) : [], roles = ph ? asList(ph.roles) : [];
    var COLS = ['#2ee6ff', '#ff3b30', '#ffbe3c', '#b06bff'];
    var out = {
      title: (ph && ph.board && ph.board.title) || String(missionTitle(src.missionId) || 'THE JOB').toUpperCase(),
      note: (ph && ph.board && (ph.board.note || ph.board.subtitle)) || 'Pick an approach, pick a crew. The string is decorative.',
      approaches: aps.map(function (a, k) {
        var e = findById(pa, a.id) || {}, hm = a.hostiles != null ? a.hostiles : (e.guardsMul != null ? e.guardsMul : 1);
        return { id: a.id, name: a.name || e.name || a.id, desc: a.line || e.pitch || a.desc || '', mult: a.payout != null ? a.payout : (e.payoutMul != null ? e.payoutMul : (a.mult || 1)),
          wanted: a.wanted != null ? a.wanted : e.wanted, risk: hm < 0.9 ? 'LOW' : hm < 1.2 ? 'MEDIUM' : 'HIGH', color: a.color || COLS[k % COLS.length] };
      }),
      crew: crew.map(function (c) {
        var id = c.id || c.castId, e = null;
        for (var j = 0; j < pc.length; j++) if (pc[j].castId === id) e = pc[j];
        var role = e && findById(roles, e.role);
        return { id: id, name: c.name || castName(id), cut: c.cut != null ? c.cut : (e ? e.cut : 0), role: String((role && role.name) || c.perk || (e && e.role) || ''), pitch: (e && e.pitch) || c.line || '' };
      })
    };
    var job = findById(P.missions, (ph && ph.missions && ph.missions[ph.missions.length - 1]) || 'h03_job');
    out.base = (job && job.reward) || (src.mission && src.mission.reward) || 2500;
    return out;
  }
  function openHeistBoard(e) {
    e = e || {};
    var d = heistDef(e), plan = GTP.Heist && GTP.Heist.plan ? GTP.Heist.plan() : null, ai = 0, picks = {};
    if (plan) { d.approaches.forEach(function (a, k) { if (a.id === plan.approach) ai = k; }); (plan.crew || []).forEach(function (id) { picks[id] = true; }); }
    else if (d.crew[0]) picks[d.crew[0].id] = true;
    var r = openModal('heist', { missionId: e.missionId, src: e, def: d, approach: ai, picks: picks, cursor: 0, row: 0 });
    if (r) e.handled = true;
    return r;
  }
  function heistCrew(m) { return m.def.crew.filter(function (c) { return m.picks[c.id]; }); }
  function heistTake(m) {
    var d = m.def, ap = d.approaches[m.approach] || { mult: 1 }, cut = 0;
    heistCrew(m).forEach(function (c) { cut += c.cut || 0; });
    var gross = Math.round(d.base * (ap.mult || 1));
    return { gross: gross, cut: cut, net: Math.max(0, Math.round(gross * (1 - Math.min(0.6, cut)))), n: heistCrew(m).length };
  }
  function heistToggle(m, k) {
    var c = m.def.crew[k]; if (!c) return;
    if (!m.picks[c.id] && heistCrew(m).length >= HEIST_MAX_CREW) { toast('Four is a crew. Five is a panel.'); sfx('error', 0.3); return; }
    m.picks[c.id] = !m.picks[c.id]; sfx('ui', 0.2);
  }
  function heistConfirm(m) {
    var ap = m.def.approaches[m.approach];
    GTP.Events.emit('heist:plan', { approach: ap ? ap.id : null, crew: heistCrew(m).map(function (c) { return c.id; }), missionId: m.missionId, take: heistTake(m).net });
    toast('Plan pinned. Nobody touch the string.');
    sfx('cash', 0.5);
    closeModal();
  }
  function polaroid(ctx, id, x, y, w, sel, tilt, label, sub) {
    ctx.save(); ctx.translate(x + w / 2, y + w * 0.62); ctx.rotate(tilt); ctx.translate(-w / 2, -w * 0.62);
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = px(6); ctx.shadowOffsetY = px(3);
    ctx.fillStyle = '#f4efe4'; ctx.fillRect(0, 0, w, w * 1.24); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    castPortrait(ctx, id, w * 0.08, w * 0.08, w * 0.84);
    var fs = Math.max(7, Math.min(10, w / S / 7.5));
    txt(ctx, label, w / 2, w * 1.04, { font: F(fs, 'bold', FONT_TEXT), color: '#20202a', align: 'center', outline: false, maxW: w * 0.92 });
    if (sub) txt(ctx, sub, w / 2, w * 1.19, { font: F(fs - 1, 'bold'), color: '#a02040', align: 'center', outline: false, maxW: w * 0.95 });
    if (sel) { ctx.strokeStyle = COL.pink; ctx.lineWidth = px(3); ctx.strokeRect(-px(3), -px(3), w + px(6), w * 1.24 + px(6)); }
    ctx.fillStyle = '#d7262e'; ctx.beginPath(); ctx.arc(w / 2, px(2), px(5), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawHeist(ctx) {
    var m = ui.modal, d = m.def, tk = heistTake(m), i, k;
    ctx.fillStyle = 'rgba(4,5,10,0.6)'; ctx.fillRect(0, 0, W, H);
    var pw = Math.min(px(1080), W - safe.l - safe.r), ph = Math.min(px(660), H - safe.t - safe.b), x = (W - pw) / 2, y = (H - ph) / 2, narrow = pw < px(760);
    // the cork
    var cg = ctx.createLinearGradient(x, y, x + pw, y + ph); cg.addColorStop(0, '#9c6b3e'); cg.addColorStop(1, '#7d5230');
    panel(ctx, x, y, pw, ph, px(10), cg, '#4a2e14', px(8));
    ctx.save(); rr(ctx, x, y, pw, ph, px(10)); ctx.clip();
    var r = 7; for (i = 0; i < 260; i++) { r = (r * 9301 + 49297) % 233280; var dx = x + (r / 233280) * pw; r = (r * 9301 + 49297) % 233280; var dy = y + (r / 233280) * ph; ctx.fillStyle = 'rgba(40,20,5,0.25)'; ctx.fillRect(dx, dy, px(2), px(2)); }
    ctx.restore();
    // the title card
    ctx.save(); ctx.translate(x + px(24), y + px(18)); ctx.rotate(-0.015);
    ctx.fillStyle = '#f4efe4'; ctx.fillRect(0, 0, Math.min(px(420), pw - px(48)), px(58));
    txt(ctx, 'THE PLAN: ' + d.title, px(14), px(26), { font: F(15, '900', FONT_DISPLAY), color: '#20202a', outline: false, maxW: Math.min(px(400), pw - px(70)) });
    txt(ctx, d.note, px(14), px(46), { font: F(10, 'italic', FONT_TEXT), color: '#555', outline: false, maxW: Math.min(px(400), pw - px(70)) });
    ctx.restore();
    // the sticky note's column on wide boards; the cards and the crew stay left of it
    var sw = narrow ? pw - px(48) : px(230), leftW = narrow ? pw - px(48) : pw - sw - px(72);
    // approaches: index cards
    var na = Math.max(1, d.approaches.length), gap = narrow ? px(8) : px(14), ay = y + px(96);
    var aw = Math.min(px(230), (leftW - (na - 1) * gap) / na), ah = narrow ? px(132) : px(156);
    txt(ctx, 'APPROACH', x + px(24), ay - px(6), { font: F(11, '900'), color: '#fff3d6', outline: 'rgba(0,0,0,0.4)' });
    for (i = 0; i < d.approaches.length; i++) {
      var ap = d.approaches[i], ax = x + px(24) + i * (aw + gap), on = i === m.approach, foc = m.row === 0 && on;
      ctx.save(); ctx.translate(ax + aw / 2, ay + ah / 2); ctx.rotate((i % 2 ? 1 : -1) * 0.02); ctx.translate(-aw / 2, -ah / 2);
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = px(6); ctx.shadowOffsetY = px(3); ctx.fillStyle = on ? '#fffbe8' : '#ece4d0'; ctx.fillRect(0, 0, aw, ah); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = ap.color; ctx.fillRect(0, 0, aw, px(6));
      var tfont = F(narrow ? 10 : 12, '900', FONT_DISPLAY), tl = wrap(ctx, String(ap.name).toUpperCase(), tfont, aw - px(30));
      for (k = 0; k < Math.min(2, tl.length); k++) txt(ctx, tl[k], px(8), px(24) + k * px(14), { font: tfont, color: '#20202a', outline: false, maxW: aw - px(30) });
      var dfont = F(narrow ? 9 : 10, '', FONT_TEXT), dl = wrap(ctx, ap.desc, dfont, aw - px(16)), dy0 = px(30) + Math.min(2, tl.length) * px(14), maxL = Math.max(1, Math.floor((ah - dy0 - px(24)) / px(13)));
      for (k = 0; k < Math.min(maxL, dl.length); k++) txt(ctx, k === maxL - 1 && dl.length > maxL ? dl[k].replace(/\s*\S*$/, '…') : dl[k], px(8), dy0 + k * px(13), { font: dfont, color: '#444', outline: false });
      var foot = 'RISK ' + ap.risk + (ap.wanted ? '  ·  ' + '★'.repeat(Math.min(6, ap.wanted)) : '') + '  ·  ×' + (+ap.mult).toFixed(2).replace(/\.?0+$/, '');
      txt(ctx, foot, px(8), ah - px(10), { font: F(9, 'bold'), color: ap.risk === 'HIGH' ? '#b3121f' : ap.risk === 'MEDIUM' ? '#8a5a00' : '#2a5a2a', outline: false, maxW: aw - px(14) });
      if (on) { ctx.strokeStyle = foc ? COL.pink : '#20202a'; ctx.lineWidth = px(foc ? 4 : 2); ctx.strokeRect(-px(2), -px(2), aw + px(4), ah + px(4)); txt(ctx, '✔', aw - px(14), px(26), { font: F(16, '900'), color: '#b3121f', align: 'center', outline: false }); }
      ctx.fillStyle = '#2ee6ff'; ctx.beginPath(); ctx.arc(aw / 2, px(3), px(5), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      hit(ax, ay, aw, ah, (function (kk) { return function () { m.approach = kk; m.row = 0; sfx('ui', 0.2); }; })(i), 'heist-ap-' + i);
    }
    // the crew: polaroids in one row, toggled; the focused one's pitch underneath
    var nc = Math.max(1, d.crew.length), cy = ay + ah + px(36), pitchH = px(34);
    var sumH = narrow ? px(96) : 0, availH = y + ph - px(64) - cy - pitchH - sumH;
    var pwid = Math.max(px(40), Math.min(px(96), (leftW - (nc - 1) * px(14)) / nc, availH / 1.24 - px(4)));
    txt(ctx, 'CREW  ' + tk.n + '/' + HEIST_MAX_CREW, x + px(24), cy - px(10), { font: F(11, '900'), color: m.row === 1 ? '#fff' : '#fff3d6', outline: 'rgba(0,0,0,0.45)' });
    for (i = 0; i < d.crew.length; i++) {
      var c = d.crew[i], ox = x + px(24) + i * (pwid + px(14)), oy = cy, picked = !!m.picks[c.id], cf = m.row === 1 && m.cursor === i;
      ctx.save(); if (!picked) ctx.globalAlpha = 0.6;
      polaroid(ctx, c.id, ox, oy, pwid, cf, ((i % 3) - 1) * 0.04, String(c.name).split(' ')[0], Math.round((c.cut || 0) * 100) + '% CUT');
      ctx.restore();
      if (picked) { ctx.strokeStyle = '#d7262e'; ctx.lineWidth = px(1.5); ctx.beginPath(); ctx.moveTo(ox + pwid / 2, oy + px(2)); ctx.quadraticCurveTo(ox + pwid, oy - px(30), narrow ? x + pw - px(60) : x + pw - sw / 2 - px(24), narrow ? y + ph - px(150) : y + px(150)); ctx.stroke(); txt(ctx, '✔', ox + pwid - px(4), oy + px(12), { font: F(14, '900'), color: '#d7262e', align: 'center', outline: '#fff' }); }
      if (c.role) txt(ctx, c.role.toUpperCase(), ox + pwid / 2, oy + pwid * 1.24 + px(12), { font: F(8, '900'), color: '#fff3d6', align: 'center', outline: 'rgba(0,0,0,0.5)', maxW: pwid + px(10) });
      hit(ox, oy, pwid, pwid * 1.24, (function (kk) { return function () { m.row = 1; m.cursor = kk; heistToggle(m, kk); }; })(i), 'heist-crew-' + i);
    }
    var fc = d.crew[m.cursor];
    if (fc && fc.pitch) {
      var pl = wrap(ctx, fc.name + ': ' + fc.pitch, F(10, 'italic', FONT_TEXT), leftW);
      for (k = 0; k < Math.min(2, pl.length); k++) txt(ctx, pl[k], x + px(24), cy + pwid * 1.24 + px(30) + k * px(13), { font: F(10, 'italic', FONT_TEXT), color: '#fff3d6', outline: 'rgba(0,0,0,0.5)' });
    }
    // the take (a sticky note) and CONFIRM
    var sh = narrow ? px(84) : px(160), sx = narrow ? x + px(24) : x + pw - sw - px(24), sy = narrow ? y + ph - px(64) - sh - px(4) : y + px(110);
    if (narrow) sw = Math.min(sw, px(260));
    ctx.save(); ctx.translate(sx + sw / 2, sy + sh / 2); ctx.rotate(narrow ? -0.015 : 0.03); ctx.translate(-sw / 2, -sh / 2);
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = px(6); ctx.shadowOffsetY = px(3); ctx.fillStyle = '#ffe873'; ctx.fillRect(0, 0, sw, sh); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    txt(ctx, 'THE JOB PAYS', px(14), px(22), { font: F(10, 'bold'), color: '#5a4a00', outline: false });
    txt(ctx, U.fmtMoney(tk.net), px(14), narrow ? px(50) : px(56), { font: F(narrow ? 18 : 24, '900', FONT_DISPLAY), color: '#20202a', outline: false, maxW: sw - px(20) });
    txt(ctx, U.fmtMoney(tk.gross) + ' less crew ' + Math.round(Math.min(0.6, tk.cut) * 100) + '%', px(14), narrow ? px(70) : px(78), { font: F(9, 'bold'), color: '#5a4a00', outline: false, maxW: sw - px(20) });
    if (!narrow) {
      var apn = d.approaches[m.approach];
      txt(ctx, 'HEAT', px(14), px(108), { font: F(9, 'bold'), color: '#5a4a00', outline: false });
      txt(ctx, apn && apn.wanted ? '★'.repeat(Math.min(6, apn.wanted)) : '—', px(14), px(128), { font: F(14, '900'), color: '#b3121f', outline: false });
      if (!tk.n) txt(ctx, 'No crew. Bold.', px(14), px(148), { font: F(9, 'italic', FONT_TEXT), color: '#5a4a00', outline: false });
    }
    ctx.restore();
    var cbw = Math.min(px(230), pw - px(48)), cbx = x + pw - cbw - px(24), cby = y + ph - px(56);
    button(ctx, cbx, cby, cbw, px(38), 'CONFIRM PLAN  ' + glyph('confirm'), { color: COL.pink, sel: m.row === 2, fn: function () { heistConfirm(m); }, id: 'heist-confirm', font: F(13, '900') });
    var help = device() === 'touch' ? 'Tap a card, tap the crew' : device() === 'gamepad' ? 'LS row · ← → pick · A toggle · B back' : '↑ ↓ rows  ·  ← → pick  ·  Enter toggle  ·  Esc back';
    txt(ctx, help, x + px(24), y + ph - px(14), { font: F(10, 'bold'), color: '#fff3d6', outline: 'rgba(0,0,0,0.5)', maxW: pw - cbw - px(70) });
  }
  function heistInput(In) {
    var m = ui.modal, d = m.def, rows = 3;
    if (menuBack(In)) { closeModal(); return true; }
    if (In.pressed('forward')) { m.row = (m.row - 1 + rows) % rows; sfx('ui', 0.15); }
    if (menuDown(In)) { m.row = (m.row + 1) % rows; sfx('ui', 0.15); }
    var dir = In.pressed('left') ? -1 : In.pressed('right') ? 1 : 0;
    if (dir && m.row === 0 && d.approaches.length) { m.approach = (m.approach + dir + d.approaches.length) % d.approaches.length; sfx('ui', 0.15); }
    if (dir && m.row === 1 && d.crew.length) { m.cursor = (m.cursor + dir + d.crew.length) % d.crew.length; sfx('ui', 0.15); }
    if (In.pressed('confirm')) { if (m.row === 2) heistConfirm(m); else if (m.row === 1) heistToggle(m, m.cursor); else m.row = 1; }
    return true;
  }

  var MODALS = {
    armory: { draw: drawArmory, input: armoryInput },
    modshop: { draw: drawModShop, input: modShopInput },
    wardrobe: { draw: drawWardrobe, input: wardrobeInput },
    property: { draw: drawProperty, input: propertyInput },
    heist: { draw: drawHeist, input: heistInput }
  };
  function updateModal(dt) {
    var m = ui.modal; if (!m) return;
    m.t += dt; m.turn = (m.turn || 0) + dt;
    if (m.msgT > 0) m.msgT -= dt; if (m.flash > 0) m.flash -= dt * 3;
    if (m.kind === 'modshop' && m.previewT >= 0) { m.previewT -= dt; if (m.previewT < 0 && m.vehicle) { var want = JSON.stringify(m.preview); if (want !== (m.onVehicle || JSON.stringify(m.applied))) { applyMods(m.vehicle, m.preview); m.onVehicle = want; } } }
    if (m.kind === 'wardrobe' && m.previewT >= 0) { m.previewT -= dt; if (m.previewT < 0) { var pl = player(); if (pl) { rebuildMesh(pl); m.meshLook = JSON.stringify(pl.look); } } }
    updateModalCam(m, dt);
  }
  function drawModal(ctx) { var m = ui.modal; if (!m || !MODALS[m.kind]) return; MODALS[m.kind].draw(ctx); }
  function modalInput(In) {
    var m = ui.modal; if (!m) return false;
    if (In.pressed('pause') && !In.pressed('cancel')) { closeModal(); openPause('pause'); return true; }
    return MODALS[m.kind] ? MODALS[m.kind].input(In) : true;   // clicks reach the hit rects through the canvas mousedown listener
  }
  // ------------------------------------------------------------ phone: STORY ----
  // GTP.Story.chapter / next() -> {missionId, giver, landmark, x, z}: the chapter header, the NEXT UP card with the giver,
  // the place and SET GPS, the chapter list (GTP.Content.parity.chapters) and the last calls.
  function chapterLabel(ch) {
    if (ch == null) return null;
    var chapters = asList(parity().chapters);
    if (typeof ch === 'number' || typeof ch === 'string') { var f = chapters.filter(function (c) { return c.act === ch || c.id === ch; })[0]; return f ? { act: f.act, title: f.title || f.name } : { act: ch, title: '' }; }
    return { act: ch.act != null ? ch.act : ch.id, title: ch.title || ch.name || '' };
  }
  function nextStoryCard() {
    var nx = storyNext(), Ms = GTP.Missions, Wd = GTP.World;
    if (!nx && Ms && Ms.available) { var av = call(Ms.available, Ms, [], []); if (av && av.length) { var a = av[0]; var lm0 = Wd && Wd.landmark ? Wd.landmark(a.marker) : null; nx = { missionId: a.id, giver: a.giver, landmark: a.marker, x: lm0 ? (lm0.door ? lm0.door.x : lm0.x) : null, z: lm0 ? (lm0.door ? lm0.door.z : lm0.z) : null, fallback: true }; } }
    if (!nx) return null;
    var lm = nx.landmark && Wd && Wd.landmark ? Wd.landmark(nx.landmark) : null;
    var x = nx.x != null ? nx.x : lm ? lm.x : null, z = nx.z != null ? nx.z : lm ? lm.z : null;
    return { missionId: nx.missionId, title: missionTitle(nx.missionId), giver: nx.giver, place: lm ? landmarkLabel(lm) : (nx.landmark ? String(nx.landmark).replace(/_/g, ' ') : ''), x: x, z: z };
  }
  function setStoryGps(card) { if (!card || card.x == null) return; GTP.Events.emit('gps:set', { x: card.x, z: card.z, label: card.title, kind: 'story' }); toast('GPS set: ' + card.title); }
  function drawPhoneStory(ctx, x, y, w, h) {
    var ch = chapterLabel(storyChapter()), card = nextStoryCard(), Ms = GTP.Missions, st = Ms && Ms.state, all = Ms && Ms.allMissions ? call(Ms.allMissions, Ms, [], []) : [];
    var ry = y - ui.pause.scroll, rows = [], p = player();
    var prog = GTP.Story && typeof GTP.Story.progress === 'function' ? call(GTP.Story.progress, GTP.Story, [], null) : null;   // the story chain only, not the side missions
    var done = prog && prog.done != null ? prog.done : st && st.completed ? st.completed.size : 0, total = prog && prog.total ? prog.total : all.length || 35;
    // the chapter header with the story progress
    var hh = px(64);
    var hg = ctx.createLinearGradient(x, 0, x + w, 0); hg.addColorStop(0, 'rgba(232,181,58,0.24)'); hg.addColorStop(1, 'rgba(232,181,58,0.04)');
    panel(ctx, x, ry, w, hh, px(10), hg, 'rgba(232,181,58,0.5)');
    txt(ctx, ch ? (typeof ch.act === 'number' ? 'ACT ' + (ROMAN[ch.act] || ch.act) : String(ch.act).toUpperCase()) : 'THE STORY', x + px(14), ry + px(20), { font: F(10, 'bold'), color: COL.gold, outline: false });
    txt(ctx, ch && ch.title ? String(ch.title).toUpperCase() : 'LOUD & CORRECT', x + px(14), ry + px(44), { font: F(17, '900', FONT_DISPLAY), color: COL.ink, outline: false, maxW: w - px(140) });
    txt(ctx, done + ' / ' + total, x + w - px(14), ry + px(32), { font: F(16, '900', FONT_DISPLAY), color: COL.ink, align: 'right', outline: false });
    txt(ctx, 'MISSIONS', x + w - px(14), ry + px(46), { font: F(8, 'bold'), color: COL.muted, align: 'right', outline: false });
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, x + px(14), ry + hh - px(10), w - px(28), px(4), px(2)); ctx.fill();
    ctx.fillStyle = COL.gold; rr(ctx, x + px(14), ry + hh - px(10), (w - px(28)) * clamp01(done / Math.max(1, total)), px(4), px(2)); ctx.fill();
    ry += hh + px(12);
    // NEXT UP
    txt(ctx, 'NEXT UP', x, ry + px(10), { font: F(10, 'bold'), color: COL.cyan, outline: false });
    ry += px(18);
    var ch2 = px(86);
    if (card) {
      var sel = ui.pause.row === 0;
      panel(ctx, x, ry, w, ch2, px(10), sel ? 'rgba(46,230,255,0.12)' : 'rgba(255,255,255,0.05)', sel ? COL.cyan : 'rgba(255,255,255,0.12)', sel ? 1.5 : 1);
      if (card.giver) castPortrait(ctx, card.giver, x + px(10), ry + px(10), px(66));
      var tx = x + px(card.giver ? 88 : 14);
      txt(ctx, card.title, tx, ry + px(28), { font: F(15, 'bold'), color: COL.ink, outline: false, maxW: w - (tx - x) - px(120) });
      txt(ctx, (card.giver ? castName(card.giver) + '  ·  ' : '') + (card.place || ''), tx, ry + px(46), { font: F(11), color: COL.muted, outline: false, maxW: w - (tx - x) - px(120) });
      if (card.x != null && p) txt(ctx, fmtDist(U.dist2d(p.x, p.z, card.x, card.z)) + ' away', tx, ry + px(64), { font: F(10, 'bold'), color: COL.gold, outline: false });
      var gpsOn = ui.gps && card.x != null && U.dist2d(ui.gps.x, ui.gps.z, card.x, card.z) < 3;
      if (card.x != null) {
        var bw = px(100), bx = x + w - bw - px(12), by = ry + ch2 / 2 - px(14);
        button(ctx, bx, by, bw, px(28), gpsOn ? 'GPS ON' : 'SET GPS', { color: COL.gold, sel: sel || gpsOn, fn: function () { setStoryGps(card); }, id: 'story-gps', font: F(11, 'bold') });
      }
      rows.push({ kind: 'gps', card: card });
    } else {
      panel(ctx, x, ry, w, px(50), px(10), 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.1)');
      txt(ctx, st && st.active ? 'You are in a mission. Finish it first.' : 'No story mission waiting. The city is "processing".', x + px(14), ry + px(30), { font: F(12, '', FONT_TEXT), color: COL.muted, outline: false, maxW: w - px(28) });
      ch2 = px(50);
    }
    ry += ch2 + px(14);
    // the chapters
    var chapters = asList(parity().chapters);
    if (chapters.length) {
      txt(ctx, 'CHAPTERS', x, ry + px(10), { font: F(10, 'bold'), color: COL.cyan, outline: false }); ry += px(18);
      var curAct = ch ? ch.act : null;
      for (var i = 0; i < chapters.length; i++) {
        var c = chapters[i], isCur = c.act === curAct || c.id === curAct, past = curAct != null && typeof c.act === 'number' && typeof curAct === 'number' && c.act < curAct;
        if (ry + px(26) > y && ry < y + h) {
          ctx.fillStyle = isCur ? COL.gold : past ? COL.lime : 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(x + px(8), ry + px(10), px(4), 0, Math.PI * 2); ctx.fill();
          txt(ctx, (typeof c.act === 'number' ? 'ACT ' + (ROMAN[c.act] || c.act) + '  ' : '') + String(c.title || c.name || c.id), x + px(20), ry + px(14), { font: F(11, isCur ? 'bold' : ''), color: isCur ? COL.ink : past ? COL.muted : 'rgba(143,151,179,0.6)', outline: false, maxW: w - px(30) });
        }
        ry += px(22);
      }
      ry += px(8);
    }
    // recent calls
    if (ui.callLog.length) {
      txt(ctx, 'RECENT CALLS', x, ry + px(10), { font: F(10, 'bold'), color: COL.cyan, outline: false }); ry += px(18);
      var log = ui.callLog.slice(-5).reverse();
      for (var k = 0; k < log.length; k++) {
        var L = log[k], lines = wrap(ctx, castName(L.who) + ': ' + L.text, F(11, '', FONT_TEXT), w - px(16));
        for (var j = 0; j < Math.min(2, lines.length); j++) { if (ry > y - px(16) && ry < y + h) txt(ctx, lines[j], x + px(8), ry + px(12), { font: F(11, '', FONT_TEXT), color: j ? COL.muted : COL.ink, outline: false }); ry += px(15); }
        ry += px(4);
      }
    }
    ui.pause.rows = rows;
  }

  // ----------------------------------------------------------- phone: STOCKS ----
  // GTP.Systems.stocks: list() (or an array / {tickers}) of {id|symbol, name, price, history[], shares}; buy(id, n) and
  // sell(id, n) -> {ok, reason}. Without the systems module the parity tickers show with the market closed.
  function stockApi() { var S = GTP.Systems; return S && S.stocks ? S.stocks : null; }
  function stockList() {
    var A = stockApi(), l = null;
    if (A) { if (typeof A.list === 'function') l = call(A.list, A, [], null); else if (Array.isArray(A)) l = A; else if (A.tickers) l = asList(A.tickers); }
    var live = !!(l && l.length);
    if (!live) l = asList(parity().stocks);
    return (l || []).map(function (o) {
      var hist = o.history || o.hist || o.prices || [], price = o.price != null ? o.price : (hist.length ? hist[hist.length - 1] : (o.base || o.start || 0));
      // GTP.Systems.stocks.list(): {ticker, name, flavor, price, change (24 h, a fraction), history, qty, avg, value, gain}
      var prev = hist.length > 1 ? hist[hist.length - 2] : (o.prev != null ? o.prev : (o.open != null ? o.open : null));
      var chg = o.change != null ? (Math.abs(o.change) > 1 ? o.change / 100 : o.change) : prev ? (price - prev) / prev : 0;
      return { id: o.ticker || o.id || o.symbol, sym: String(o.ticker || o.symbol || o.id || '').toUpperCase(), name: o.name || o.company || '', price: +price || 0, change: chg, history: hist, shares: o.qty != null ? o.qty : (o.shares || o.owned || o.held || 0), avg: o.avg || null, gain: o.gain, live: live, flavor: o.flavor || o.desc || '' };
    });
  }
  function stockTrade(row, n) {
    var A = stockApi(); if (!row) return;
    if (!row.live || !A) { toast('Market closed. The bell is "on order".'); return; }
    var fn = n > 0 ? A.buy : A.sell, res = typeof fn === 'function' ? call(fn, A, [row.id, Math.abs(n)], null) : null;
    var ok = res === true || (res && res.ok);
    if (ok) toast((n > 0 ? 'Bought ' : 'Sold ') + Math.abs(n) + ' ' + row.sym + ' at ' + U.fmtMoney(row.price) + (res && res.total ? '  (' + U.fmtMoney(res.total) + ' with the fee)' : ''));   // Systems plays the register
    else toast(res && (res.reason === 'money' || res.reason === 'funds') ? 'Not enough cash for ' + Math.abs(n) + ' ' + row.sym + (res.need ? ' (' + U.fmtMoney(res.need) + ' short)' : '') + '.' : res && (res.reason === 'shares' || res.reason === 'none' || res.reason === 'qty') ? 'You do not own that many ' + row.sym + '.' : 'Trade refused' + (res && res.reason ? ' (' + res.reason + ')' : '') + '.');
  }
  function sparkline(ctx, hist, x, y, w, h, col) {
    if (!hist || hist.length < 2) { ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke(); return; }
    var pts = hist.slice(-24), mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts), span = mx - mn || 1;
    ctx.save(); ctx.lineWidth = px(1.6); ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.beginPath();
    for (var i = 0; i < pts.length; i++) { var px2 = x + w * i / (pts.length - 1), py = y + h - h * (pts[i] - mn) / span; if (i) ctx.lineTo(px2, py); else ctx.moveTo(px2, py); }
    ctx.stroke();
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fillStyle = hexA(col, 0.12); ctx.fill();
    ctx.restore();
  }
  function drawPhoneStocks(ctx, x, y, w, h) {
    var list = stockList(), p = player(), pg = ui.pause, rows = [];
    var held = 0; list.forEach(function (r) { held += r.shares * r.price; });
    var A = stockApi(), port = A && typeof A.portfolio === 'function' ? call(A.portfolio, A, [], null) : null;
    if (port && port.value != null) held = port.value;
    txt(ctx, 'TAKE EXCHANGE', x, y + px(14), { font: F(12, 'bold'), color: COL.cyan, outline: false });
    txt(ctx, 'PORTFOLIO ' + U.fmtMoney(Math.round(held)) + '   CASH ' + U.fmtMoney(p ? p.money : 0), x + w, y + px(14), { font: F(10, 'bold'), color: COL.lime, align: 'right', outline: false, maxW: w * 0.6 });
    if (!list.length) { txt(ctx, 'No listings. The market is on a "wellness break".', x, y + px(46), { font: F(12, '', FONT_TEXT), color: COL.muted, outline: false }); ui.pause.rows = rows; return; }
    if (!list[0].live) txt(ctx, 'MARKET CLOSED  ·  prices from the last bell', x, y + px(30), { font: F(9, 'bold'), color: COL.amber, outline: false });
    var rh = px(46), ry = y + px(38) - pg.scroll, narrow = w < px(480);
    for (var i = 0; i < list.length; i++) {
      var r = list[i], sel = pg.row === i, up = r.change >= 0, col = up ? COL.lime : COL.red;
      rows.push({ kind: 'stock', stock: r });
      if (ry + rh > y && ry < y + h) {
        if (hovering(x, ry, w, rh - px(6))) { pg.row = i; sel = true; }
        panel(ctx, x, ry, w, rh - px(6), px(8), sel ? 'rgba(46,230,255,0.1)' : 'rgba(255,255,255,0.04)', sel ? COL.cyan : 'rgba(255,255,255,0.08)', sel ? 1.5 : 1);
        txt(ctx, r.sym, x + px(12), ry + px(18), { font: F(13, '900'), color: COL.ink, outline: false });
        txt(ctx, r.name + (r.shares ? '  ·  ' + r.shares + ' held' : ''), x + px(12), ry + px(33), { font: F(9), color: r.shares ? COL.cyan : COL.muted, outline: false, maxW: narrow ? w * 0.4 : w * 0.38 });
        if (!narrow) sparkline(ctx, r.history, x + w * 0.44, ry + px(8), w * 0.24, rh - px(22), col);
        txt(ctx, U.fmtMoney(Math.round(r.price * 100) / 100), x + w - px(84), ry + px(24), { font: F(13, 'bold'), color: COL.ink, align: 'right', outline: false });
        var cs = (up ? '▲ ' : '▼ ') + Math.abs(r.change * 100).toFixed(1) + '%';
        panel(ctx, x + w - px(76), ry + px(10), px(66), px(20), px(5), hexA(col, 0.18), null);
        txt(ctx, cs, x + w - px(43), ry + px(24), { font: F(10, 'bold'), color: col, align: 'center', outline: false });
        hit(x, ry, w, rh - px(6), (function (k) { return function () { pg.row = k; }; })(i), 'stock-' + i);
      }
      ry += rh;
    }
    // the trade bar for the selected ticker
    var cur = list[pg.row];
    if (cur) {
      var by = y + h - px(40), bw = (w - px(30)) / 4;
      panel(ctx, x - px(4), by - px(8), w + px(8), px(48), px(8), 'rgba(12,14,26,0.97)', 'rgba(255,255,255,0.12)');
      [['BUY 1', 1], ['BUY 10', 10], ['SELL 10', -10], ['SELL ALL', -(cur.shares || 0)]].forEach(function (b, k) {
        button(ctx, x + k * (bw + px(10)), by, bw, px(30), b[0], { color: b[1] > 0 ? COL.lime : COL.red, disabled: !cur.live || (b[1] < 0 && !cur.shares) || b[1] === 0, fn: function () { stockTrade(cur, b[1]); }, id: 'stock-trade-' + k, font: F(10, 'bold') });
      });
    }
    ui.pause.rows = rows;
  }

  // ------------------------------------------------------- phone: STATS extras ----
  // GTP.Systems.stats() -> [{label, value}] | [[label, value]] | {sections:[{title, rows}]}; the achievements list from
  // GTP.Content.parity.achievements with Systems.unlocked(id) / Systems.achievements.unlocked (else the toasts seen).
  function hasStatsPage() { var S = GTP.Systems; return !!(S && typeof S.statsPage === 'function'); }
  function systemsStats() {
    var S = GTP.Systems;
    if (hasStatsPage()) return asList(call(S.statsPage, S, [], [])).map(function (s) { return { title: s.title || s.id || '', rows: normRows(s.rows) }; });   // [{id, title, rows:[{label, value}]}]
    var st = S ? (typeof S.stats === 'function' ? call(S.stats, S, [], null) : S.stats) : null;
    if (!st) return [];
    if (st.sections) return asList(st.sections).map(function (s) { return { title: s.title || '', rows: normRows(s.rows) }; });
    return [{ title: 'CAREER', rows: normRows(st) }];
  }
  function normRows(r) { return asList(r).map(function (o) { return Array.isArray(o) ? [String(o[0]), String(o[1])] : [String(o.label || o.name || o.id), String(o.value != null ? o.value : '')]; }); }
  function achUnlocked(id) {
    var S = GTP.Systems;
    if (S && typeof S.unlocked === 'function') { var r = call(S.unlocked, S, [id], null); if (r != null && typeof r !== 'object') return !!r; }
    var A = S && S.achievements; if (A) { var u = A.unlocked || A.done; if (typeof u === 'function') return !!call(u, A, [id], false); if (Array.isArray(u)) return u.indexOf(id) >= 0; if (u && typeof u === 'object') return !!u[id]; }
    return !!ui.achSeen[id];
  }
  function drawStatsExtras(ctx, x, y, w, h, ry) {
    var secs = systemsStats(), rh = px(22), i, j;
    for (i = 0; i < secs.length; i++) {
      ry += px(10);
      if (ry > y - rh && ry < y + h + rh) txt(ctx, String(secs[i].title || '').toUpperCase(), x, ry, { font: F(10, 'bold'), color: COL.cyan, outline: false });
      ry += px(18);
      for (j = 0; j < secs[i].rows.length; j++) {
        if (ry > y - rh && ry < y + h + rh) {
          ctx.fillStyle = j % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0)'; ctx.fillRect(x, ry - px(15), w, rh);
          txt(ctx, secs[i].rows[j][0], x + px(8), ry, { font: F(12, '', FONT_TEXT), color: COL.muted, outline: false, maxW: w * 0.6 });
          txt(ctx, secs[i].rows[j][1], x + w - px(8), ry, { font: F(12, 'bold'), color: COL.ink, align: 'right', outline: false, maxW: w * 0.38 });
        }
        ry += rh;
      }
    }
    // GTP.Systems.achievements.list() {id, name, desc, unlocked, progress, goal}; a def with hidden: true reads ??? until unlocked
    var SA = GTP.Systems && GTP.Systems.achievements, ach = SA && typeof SA.list === 'function' ? asList(call(SA.list, SA, [], [])) : asList(parity().achievements);
    ach = ach.map(function (a) { var d = SA && SA.def ? call(SA.def, SA, [a.id], null) : null; return Object.assign({}, a, { secret: a.secret || a.hidden || !!(d && (d.hidden || d.secret)) }); });
    if (ach.length) {
      var got = ach.filter(function (a) { return a.unlocked != null ? !!a.unlocked : achUnlocked(a.id); }).length;
      ry += px(14);
      if (ry > y - rh && ry < y + h + rh) { txt(ctx, 'ACHIEVEMENTS  ' + got + ' / ' + ach.length, x, ry, { font: F(10, 'bold'), color: COL.gold, outline: false }); }
      ry += px(10);
      var cols = w > px(440) ? 2 : 1, cw = (w - (cols - 1) * px(8)) / cols, ah = px(40);
      for (i = 0; i < ach.length; i++) {
        var a = ach[i], on = a.unlocked != null ? !!a.unlocked : achUnlocked(a.id), ax = x + (i % cols) * (cw + px(8)), ay = ry + Math.floor(i / cols) * (ah + px(6));
        if (ay + ah > y && ay < y + h) {
          panel(ctx, ax, ay, cw, ah, px(8), on ? 'rgba(232,181,58,0.12)' : 'rgba(255,255,255,0.03)', on ? 'rgba(232,181,58,0.5)' : 'rgba(255,255,255,0.08)');
          ctx.fillStyle = on ? COL.gold : 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(ax + px(20), ay + ah / 2, px(12), 0, Math.PI * 2); ctx.fill();
          trophy(ctx, ax + px(20), ay + ah / 2, px(16), on ? '#2a1c04' : 'rgba(0,0,0,0.4)');
          txt(ctx, on || !a.secret ? (a.name || a.id) : '???', ax + px(40), ay + px(17), { font: F(11, 'bold'), color: on ? COL.ink : COL.muted, outline: false, maxW: cw - px(48) });
          txt(ctx, on || !a.secret ? (a.desc || a.description || '') : 'Secret.', ax + px(40), ay + px(31), { font: F(9, '', FONT_TEXT), color: COL.muted, outline: false, maxW: cw - px(48) });
          if (!on && !a.secret && a.goal && a.progress > 0) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(ax + px(40), ay + ah - px(5), cw - px(52), px(2)); ctx.fillStyle = COL.gold; ctx.fillRect(ax + px(40), ay + ah - px(5), (cw - px(52)) * clamp01(a.progress), px(2)); }
        }
      }
      ry += Math.ceil(ach.length / cols) * (ah + px(6));
    }
    return ry;
  }

  // ------------------------------------------------------------ v0.3 events ----
  function bindEventsV3(Ev) {
    Ev.on('gps:set', gpsSet);
    Ev.on('gps:clear', function () { ui.gps = null; });
    Ev.on('phone:call', phoneCall);
    Ev.on('chapter', chapterCard);
    Ev.on('interior:fade', interiorFade);
    Ev.on('interior:enter', interiorEnter);
    Ev.on('interior:exit', function () { ui.interior = null; if (ui.modal && ui.modal.kind === 'armory') closeModal(); ui.range = null; });
    Ev.on('armory:inspect', function (e) { var st = ui.interior && ui.interior.store; if (ui.modal && ui.modal.kind === 'armory') { var S2 = armoryState(); for (var i = 0; i < S2.rows.length; i++) if ((S2.rows[i].weaponId || S2.rows[i].id) === (e && e.weaponId)) { ui.modal.row = i; ui.modal.isel = 0; ui.modal.focus = 1; } return; } openArmory((e && (e.store || e.storeId)) || (st && (st.id || st)) || null, e && e.weaponId); });
    Ev.on('range:start', rangeStart);
    Ev.on('range:hit', rangeHit);
    Ev.on('range:end', rangeEnd);
    Ev.on('clothing:open', function (e) { openWardrobe('clothing', e); });
    Ev.on('barber:open', function (e) { openWardrobe('barber', e); });
    Ev.on('modshop:open', function (e) { if (ui.modal && ui.modal.kind === 'modshop' && e && ui.modal.vehicle === e.vehicle) return; openModShop(e); });
    Ev.on('modshop:close', function () { if (ui.modal && ui.modal.kind === 'modshop') closeModal(); });
    Ev.on('property:open', openProperty);
    Ev.on('heist:board', openHeistBoard);
    Ev.on('boss:phase', bossPhase);
    Ev.on('boss:start', bossStart);
    Ev.on('boss:end', bossEnd);
    Ev.on('boss:defeated', bossDefeated);
    Ev.on('special:state', specialState);
    Ev.on('achievement', achievementToast);
    Ev.on('golf:start', golfStart);
    Ev.on('golf:end', golfEnd);
    Ev.on('golf:hole', golfHole);
    Ev.on('vehicle:enter', function (e) { var p = player(), v = e && (e.vehicle || e); if (!v || (e && e.ped && e.ped !== p) || (e && e.driver && e.driver !== p)) return; ui.vehName = { name: vehicleName(v), sub: v.mods && v.mods.engine ? 'TUNED' : '', t: 0 }; });
    Ev.on('vehicle:exit', function () { ui.vehName = null; });
    Ev.on('cover:enter', function (e) { ui.cover.on = true; ui.cover.low = !!(e && (e.low || e.high === false)); });
    Ev.on('cover:exit', function () { ui.cover.on = false; });
    Ev.on('hitmarker', function (e) { if (e && e.zone === 'head') ui.headshots++; });
  }
  function updateV3(dt) {
    var g = game(); if (!g) return;
    updateGps(dt); updateCalls(dt); updateAchievements(dt); updateFade(dt); updateBoss(dt); updateSpecials(dt); updateRange(dt); updateGolf(dt); updateModal(dt);
    if (ui.chapter) { ui.chapter.t += dt; if (ui.chapter.t > ui.chapter.dur) ui.chapter = null; }
    if (ui.placeCard) { ui.placeCard.t += dt; if (ui.placeCard.t > 3.6) ui.placeCard = null; }
    if (ui.vehName) { ui.vehName.t += dt; if (ui.vehName.t > 3) ui.vehName = null; }
    // the aim tutor: counts aims, retires after three or 40 s on screen
    var CB = GTP.Combat, aiming = !!(CB && CB.aim && CB.aim.active);
    if (aiming && !ui.aimTutor.was) ui.aimTutor.n++;
    ui.aimTutor.was = aiming;
    if (ui.prompts && ui.prompts.indexOf('AIM') >= 0) ui.aimTutor.shown += dt;
  }
  // world-space labels and HUD pieces drawn while playing (the core HUD is drawn first)
  function drawPlayV3(ctx) {
    drawPrompts(ctx); drawParachute(ctx); drawCookHUD(ctx); drawRange(ctx); drawGolf(ctx);
    drawInteriorHint(ctx); drawPlaceCard(ctx); drawVehicleName(ctx); drawCall(ctx);
  }

  // ----------------------------------------------------------------- API ----
  var UI = GTP.UI = {
    // the other tracks' fallbacks stand down when these are set: GTP.Interiors' DOM fade, GTP.Bosses' plain boss bar and special meters
    interiorFade: true, drawsBossBar: true, drawsSpecials: true,
    drawsBarks: true,
    minigames: { debate: debate, ratio: ratio },
    init: function () {
      if (ui.inited) return;
      ui.inited = true;
      var Rd = GTP.Render, g = game();
      layout(Rd ? Rd.width : W, Rd ? Rd.height : H);
      try { ui.touch.coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { ui.touch.coarse = false; }
      ui.touch.visible = ui.touch.coarse;
      try { if (localStorage.getItem('gtp.mute') === '1') setMuted(true); } catch (e) { /* storage may be blocked */ }
      // saved settings apply at once; the quality preset only when the URL did not pick one (tests and ?quality= win)
      var had = loadSettings(), opts = (g && g.opts) || {};
      var urlQuality = !!(opts.quality || opts.low) || (g && g.headless);
      if (had) applyAllSettings({ skipQuality: urlQuality, skipDraw: !!opts.low }); else { if (GTP.Input) GTP.Input.gamepadEnabled = true; applyVolumes(); }
      ui.storedQuality = ui.settings.quality; ui.storedDraw = ui.settings.drawDistance;
      if (urlQuality && Rd && Rd.quality) { ui.settings.quality = Rd.quality.auto ? 'auto' : Rd.quality.current; ui.qualityFromUrl = true; }
      if (opts.low) ui.lowFromUrl = true;
      bindEvents();
      var cv = Rd && Rd.hudCanvas;
      if (cv && !ui._bound) {
        ui._bound = true;
        cv.addEventListener('mousedown', function (e) {
          if (GTP.Audio && GTP.Audio.unlock) { try { GTP.Audio.unlock(); } catch (e2) { /* optional */ } }
          if (e.button !== 0) return;
          var pt = canvasPoint(e);
          if (onMapPage()) return;   // the map handles its own press / drag / release in mapInput
          if (menuState() || ui.dialogue || (ui.card && ui.card.kind === 'failed')) pointerTap(pt.x, pt.y);
        });
        window.addEventListener('keydown', function () { if (GTP.Audio && GTP.Audio.unlock) { try { GTP.Audio.unlock(); } catch (e2) { /* optional */ } } }, { passive: true });
      }
      if (g && g.state === 'title') startAttract();
    },
    resize: function (w, h) { layout(w, h); },
    update: function (dt) {
      var g = game(); if (!g) return;
      ui.t += dt;
      try {
        trackPointer();
        if (ui.inputStep !== g.steps) handleInput(g.state);
        ui.inputStep = -1;
        updateLoading(dt);
        if (g.state === 'title') { updateAttract(dt); if (ui.title.page === 'credits') updateCredits(dt); for (var i = ui.toasts.length - 1; i >= 0; i--) { ui.toasts[i].t += dt; if (ui.toasts[i].t > ui.toasts[i].dur) ui.toasts.splice(i, 1); } return; }
        trackStats();
        updateMoney(dt); updateWanted(dt); updateCards(dt); updateDialogue(dt); updateTicker(dt); updateStunt(dt);
        if (g.state === 'playing' || (g.state === 'paused' && ui.pause.page === 'phone')) updateRoute(dt);   // the map page draws the route of a waypoint just set
        if (g.state === 'minigame' && ui.minigame && ui.minigame.obj) ui.minigame.obj.update(dt);
        if (g.state === 'paused' && ui.pause.page === 'credits') updateCredits(dt);
        if (ui.shopOpen) { ui.shop.turn += dt * 1.6; if (ui.shop.msgT > 0) ui.shop.msgT -= dt; if (ui.shop.flash > 0) ui.shop.flash -= dt * 3; }
        updateV3(dt);
      } catch (e) { U.reportError(e, 'ui.update'); }
    },
    draw: draw,
    onState: onState,
    handleInput: function (state) {
      var g = GTP.game, In = GTP.Input;
      ui.inputStep = g ? g.steps : 0;
      var r = handleInput(state);
      // a key a menu or a dialogue used is used up: the Enter that resumes, loads or advances a line never also exits the
      // car, jumps or fires in play on the same step (QA-B-FE-03, QA-D SAVE-03)
      if (In && In.consume && g && g.state === 'playing' && (r || state !== 'playing')) In.consume(['confirm', 'enter', 'jump', 'action', 'shoot', 'cancel', 'pause', 'map']);
      return r;
    },
    // mission hooks
    banner: banner, card: card, showDialogue: showDialogue, hideDialogue: hideDialogue, advanceDialogue: advanceDialogue,
    ticker: function (text) { ui.ticker.queue.unshift({ text: String(text || ''), tag: 'BREAKING', color: COL.red }); ui.ticker.forceT = 14; if (ui.ticker.cur && !ui.ticker.cur.nap) ui.ticker.cur.done = true; },
    startMinigame: startMinigame, endMinigame: endMinigame, credits: credits, toast: toast,
    bark: function (/* ped, text */) { },
    touch: { handle: handleTouch, show: function (on) { ui.touch.visible = on !== false; } },
    // the expansion's screens
    openShop: function (store, lm) { openShop(store, lm); },
    closeShop: closeShop,
    openMap: function () { var g = game(); if (!g) return; if (g.state === 'paused') { ui.pause.page = 'phone'; ui.pause.tab = 0; } else openPause('phone'); ui.pause.tab = 0; mapCenterOnPlayer(); },
    setWaypoint: setWaypoint, waypoint: waypoint,
    drawWeaponWheel: drawWeaponWheel,
    settings: ui.settings, applySetting: applySetting, saveSettings: saveSettings, settingRows: SETTING_ROWS,
    glyph: glyph, device: device,
    // helpers other modules / tests may use
    drawPortrait: drawPortrait, castPortrait: castPortrait, drawWeaponIcon: drawWeaponIcon, landmarkLabel: landmarkLabel, rozSign: rozSign, currentStation: currentStation,
    openPause: openPause, closePause: closePause, setMuted: setMuted, isMuted: function () { return ui.muted; },
    // v0.3 screens (the events in PLAN_V03 open them too)
    openArmory: openArmory, openModShop: function (vehicle) { return openModShop({ vehicle: vehicle }); }, openWardrobe: openWardrobe,
    openProperty: function (id) { return openProperty({ id: id }); }, openHeistBoard: function (e) { return openHeistBoard(typeof e === 'object' && e ? e : { missionId: e }); },
    closeModal: closeModal, modal: function () { return ui.modal; },
    gps: { set: gpsSet, clear: function () { ui.gps = null; }, get: function () { return ui.gps; } },
    skipCall: skipCallLine,
    wantsMenuPad: function () { var c = ui.card; return !!(c && c.kind === 'failed' && retryOffer() && c.t >= 0.8); },
    phoneTabs: PHONE_TABS, allMarkers: allMarkers, pauseItems: function () { return PAUSE_ITEMS.map(function (it) { return { id: it.id, label: it.id === 'mute' ? 'MUTE: ' + (ui.muted ? 'ON' : 'OFF') : it.label }; }); }, openStory: function () { openPause('phone'); ui.pause.tab = PHONE_TABS.indexOf('STORY'); ui.pause.row = 0; ui.pause.scroll = 0; },
    state: ui,
    _v3: { crossState: crossState, drawCrosshair: drawCrosshair, gpsTurn: gpsTurn, armoryState: function () { return ui.modal && ui.modal.kind === 'armory' ? armoryState() : null; }, retryOffer: retryOffer, stockList: stockList, wardrobeCats: wardrobeCats, modCats: modCats, heistDef: heistDef, vehCat: vehCat, chuteState: chuteState, promptList: promptList, missionRowActivate: missionRowActivate, retryActivate: retryActivate }
  };
})();
