/* Grand Theft Pundit: 11_ui.js
 * GTP.UI: the 2D overlay on canvas#hud (crisp at devicePixelRatio; Render sets
 * the transform and passes logical width/height). Title screen with the
 * attract camera, HUD (health/armor, money roll-up, wanted stars, weapon +
 * ammo, objective panel + timer, crosshair + lock reticle, off-screen arrow,
 * rotating minimap baked from the tiles, district/street chip, radio ticker),
 * dialogue box with parametric portraits, mission banners and cards, the
 * RATIO'D / DEPLATFORMED cards, pause menu, phone (map, missions, stats,
 * controls, abort), toasts, floating fx texts, hurt vignette, barks, touch
 * controls, credits, and both minigames (debate, ratio) per GDD section 7.
 *
 * Input: Game._handleGlobalInput calls GTP.UI.handleInput(state) first; when
 * it returns true the UI consumed the frame's menu input (title, pause, phone,
 * dialogue advance). update(dt) falls back to the same handler when the hook
 * did not run this step. Everything cosmetic that needs randomness uses a
 * fork of GTP.rng.
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
    blue: '#4a7cff', panel: 'rgba(13,16,32,0.86)', panelSoft: 'rgba(13,16,32,0.62)', line: 'rgba(46,230,255,0.25)', dark: 'rgba(6,7,13,0.8)', outline: 'rgba(4,6,14,0.82)'
  };
  var MINIMAP_PX = 220, LOGICAL_W = 1280, LOGICAL_H = 720;

  // ------------------------------------------------------------ state ----
  var W = 1280, H = 720, S = 1, portrait = false, safe = { l: 0, r: 0, t: 0, b: 0 };
  var urng = GTP.makeRng ? GTP.makeRng(0x0B1E) : null;   // UI-only cosmetic rng (never the city stream)
  var ui = {
    inited: false, inputStep: -1, t: 0, wall: 0, state: 'title', prevState: 'title',
    title: { sel: 0, page: 'menu', t: 0, items: [] },
    attract: { on: false, t: 0, tour: null },
    pause: { page: 'pause', sel: 0, from: 'playing', tab: 0, scroll: 0 },
    hit: [],                        // clickable rects recorded during draw: {x,y,w,h,fn,id}
    hover: null,
    toasts: [],
    banner: null, card: null,
    dialogue: null, dlgToken: 0,
    ticker: { queue: [], cur: null, x: 0, lineT: 0, forceT: 0, lastNapHour: -1, n: 0 },
    money: { shown: null, delta: 0, deltaT: 0, last: null },
    wanted: { last: 0, flashT: 0 },
    minigame: null,
    credits: null,
    touch: { visible: false, coarse: false, ids: {}, stick: null, look: null, buttons: [], btnDown: {} },
    lastStat: null, statSnap: {},
    hudTop: 0, objBottom: 0, chipBottom: 0,
    map: { bake: null, seed: null, w: 0, h: 0 },
    captionLog: [],
    muted: false,
    debugLine: ''
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
  function hovering(x, y, w, h) { var m = GTP.Input && GTP.Input.mouse; return !!m && m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h; }
  function sfx(name, gain) { var p = player(); if (GTP.Audio && GTP.Audio.play) { try { GTP.Audio.play(name, { x: p ? p.x : 0, z: p ? p.z : 0, gain: gain == null ? 0.5 : gain }); } catch (e) { /* audio optional */ } } }
  function cast(id) { var Cc = GTP.Content && GTP.Content.cast; return Cc ? (Cc[id] || null) : null; }
  function castName(id) { var c = cast(id); return c ? c.name : String(id || ''); }
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
    return (st && m[st.id]) || COL.cyan;
  }
  function failText(kind, dflt) { var R = GTP.Content && GTP.Content.radio; return (R && R.failTexts && R.failTexts[kind]) || dflt; }
  var ROLE_LABEL = { civ: 'CIVILIAN', cop: 'COP', swat: 'BALLOON UNIT', thug: 'GOON', protester: 'MARCHER', hoa: 'HOA PATROL', npc: 'SOMEBODY', raccoon: 'RACCOON', courier: 'COURIER' };
  function roleLabel(role) { return ROLE_LABEL[role] || String(role || 'ped').toUpperCase(); }

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
    if (ui.touch.visible) return { x: W - safe.r - size, y: ui.hudTop + px(140), s: size, top: true, left: false };
    return { x: W - safe.r - size, y: H - safe.b - size, s: size, top: false, left: false };
  }

  // ---------------------------------------------------------- portraits ----
  var portraitCache = {};
  var MOUTH = { smug: 'smirk', clipped: 'flat', flat: 'flat', hopeful: 'smile', lazy: 'slack', breaking: 'shout', whisper: 'o', academic: 'frown', boast: 'grin', podium: 'open', toast: 'grin', redacted: 'flat', hype: 'grin', serene: 'smile', retail: 'smile', chant: 'shout', earnest: 'smile', mute: 'flat', memo: 'flat', gruff: 'frown', crowd: 'open', cop: 'frown' };
  var BROW = { boast: 'down', gruff: 'down', breaking: 'down', hopeful: 'up', earnest: 'up', whisper: 'up', lazy: 'flat', smug: 'cock', hype: 'up', chant: 'down', cop: 'down', clipped: 'flat' };
  function skinHex(skin) { var L = GTP.Content && GTP.Content.looks; return L && L.skinColor ? L.skinColor(skin) : ['#f1d3b3', '#e8c39e', '#c68642', '#a46f3c', '#8d5524', '#5c3a1e'][U.clamp((skin | 0) - 1, 0, 5)]; }
  // recipe: {skin, hair, hairColor, glasses, hat, extra, tie}; opts: {color (accent), shirt, voice, id, sign}
  function drawPortrait(ctx, recipe, x, y, size, opts) {
    recipe = recipe || {}; opts = opts || {};
    var key = JSON.stringify([recipe, opts.color, opts.shirt, opts.voice, opts.id, Math.round(size * (GTP.Render ? GTP.Render.dpr : 1) * 4)]);
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
  function drawWeaponIcon(ctx, id, x, y, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 40, s / 40);
    ctx.fillStyle = color || COL.ink; ctx.strokeStyle = color || COL.ink; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (id) {
      case 'megaphone': ctx.beginPath(); ctx.moveTo(6, 16); ctx.lineTo(18, 16); ctx.lineTo(34, 6); ctx.lineTo(34, 34); ctx.lineTo(18, 24); ctx.lineTo(6, 24); ctx.closePath(); ctx.fill(); ctx.fillRect(10, 24, 6, 10); break;
      case 'pistol': ctx.beginPath(); ctx.moveTo(2, 11); ctx.lineTo(36, 11); ctx.lineTo(36, 20); ctx.lineTo(34, 20); ctx.lineTo(30, 36); ctx.lineTo(22, 36); ctx.lineTo(24, 20); ctx.lineTo(2, 20); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(18, 23, 4, 0, Math.PI * 2); ctx.stroke(); ctx.fillRect(2, 8, 4, 3); break;
      case 'smg': ctx.beginPath(); ctx.moveTo(2, 12); ctx.lineTo(38, 12); ctx.lineTo(38, 18); ctx.lineTo(30, 18); ctx.lineTo(30, 22); ctx.lineTo(24, 22); ctx.lineTo(24, 18); ctx.lineTo(16, 18); ctx.lineTo(14, 36); ctx.lineTo(8, 36); ctx.lineTo(9, 18); ctx.lineTo(2, 18); ctx.closePath(); ctx.fill(); ctx.fillRect(20, 18, 4, 12); break;
      case 'shotgun': ctx.beginPath(); ctx.moveTo(2, 14); ctx.lineTo(38, 14); ctx.lineTo(38, 19); ctx.lineTo(20, 19); ctx.lineTo(20, 24); ctx.lineTo(10, 24); ctx.lineTo(6, 32); ctx.lineTo(1, 32); ctx.lineTo(4, 19); ctx.lineTo(2, 19); ctx.closePath(); ctx.fill(); break;
      case 'hottake': ctx.beginPath(); ctx.moveTo(10, 14); ctx.lineTo(30, 14); ctx.lineTo(27, 36); ctx.lineTo(13, 36); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff7a20'; ctx.beginPath(); ctx.moveTo(14, 12); ctx.quadraticCurveTo(12, 4, 20, 2); ctx.quadraticCurveTo(18, 8, 22, 10); ctx.quadraticCurveTo(26, 4, 28, 12); ctx.closePath(); ctx.fill(); break;
      default: // fist
        rr(ctx, 8, 12, 24, 20, 5); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (var i = 0; i < 4; i++) ctx.fillRect(10 + i * 5.5, 12, 2, 6); ctx.fillStyle = color || COL.ink; rr(ctx, 4, 18, 8, 14, 3); ctx.fill();
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
      if (t === T.PLAZA && Wd.meta && (Wd.meta[i] & M.DOCK)) col = '#7a6646';
      if (t === T.GRASS && Wd.meta && (Wd.meta[i] & M.LAWN)) col = '#376a3d';
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
    if (ui.map.bake && ui.map.seed === seed) return ui.map.bake;
    try { ui.map.bake = bakeMap(); ui.map.seed = seed; } catch (e) { U.reportError(e, 'ui.bakeMap'); ui.map.bake = null; }
    return ui.map.bake;
  }
  function copBlips(out) {
    out.length = 0;
    var E = GTP.Entities; if (!E) return out;
    var list = E.list;
    for (var i = 0; i < list.length; i++) {
      var e = list[i]; if (e.removed) continue;
      if (e.kind === 'heli') { out.push({ x: e.x, z: e.z, kind: 'heli' }); continue; }
      if (e.kind === 'vehicle' && e.isPolice && !e.wreck && e.driver) { out.push({ x: e.x, z: e.z, kind: 'car' }); continue; }
      if (e.kind === 'ped' && e.alive && !e.inVehicle && (e.role === 'cop' || e.role === 'swat' || e.role === 'hoa')) out.push({ x: e.x, z: e.z, kind: 'cop' });
    }
    return out;
  }
  var blipBuf = [];
  function drawMinimap(ctx) {
    var p = player(), Rd = GTP.Render, m = minimapRect(); if (!p || !Rd) return;
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
    // blips: missions, objectives, cops
    var toLocal = function (x, z) { var dx = (x - p.x) * zoom, dz = (z - p.z) * zoom, cs = Math.cos(yaw), sn = Math.sin(yaw); return { x: cx + dx * cs - dz * sn, y: cy + dx * sn + dz * cs, far: Math.sqrt(dx * dx + dz * dz) > r - px(12) }; };
    var clampEdge = function (l) { var dx = l.x - cx, dy = l.y - cy, d = Math.sqrt(dx * dx + dy * dy) || 1, rr2 = r - px(12); return { x: cx + dx / d * rr2, y: cy + dy / d * rr2, ang: Math.atan2(dy, dx) }; };
    var Ms = GTP.Missions, marks = Ms && Ms.markers ? Ms.markers() : [];
    var t = ui.t;
    for (var i = 0; i < marks.length; i++) {
      var mk = marks[i], l = toLocal(mk.x, mk.z), col = mk.kind === 'objective' ? COL.amber : '#4aa8ff';
      if (l.far) { var e = clampEdge(l); ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px(7), 0); ctx.lineTo(-px(4), -px(5)); ctx.lineTo(-px(4), px(5)); ctx.closePath(); ctx.fill(); ctx.restore(); continue; }
      var pulse = 1 + 0.15 * Math.sin(t * 4 + i);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(l.x, l.y, px(5.5) * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
      if (mk.kind === 'mission') { ctx.fillStyle = '#0b1020'; ctx.font = F(8, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('M', l.x, l.y + 0.5); }
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
    // north tick
    var nx = cx + Math.sin(yaw) * (r - px(11)), ny = cy - Math.cos(yaw) * (r - px(11));
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(nx, ny, px(7), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b1020'; ctx.font = F(9, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', nx, ny + 0.5);
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
    var line1 = d ? String(d.name || d.id).toUpperCase() : 'OPEN WATER', line2 = near ? landmarkLabel(near) : (street || '');
    var chipFont = F(13, 'bold'), cw = Math.max(measure(ctx, line1, F(10, 'bold')), measure(ctx, line2, chipFont)) + px(22);
    cw = Math.min(cw, portrait ? W - safe.l - safe.r : px(360));
    var chx = m.left ? m.x : m.x + size - cw, chy = m.top ? m.y + size + px(6) : m.y - px(44);
    panel(ctx, chx, chy, cw, px(38), px(8), COL.panelSoft, 'rgba(255,255,255,0.12)');
    var tx = m.left ? chx + px(10) : chx + cw - px(10), al = m.left ? 'left' : 'right';
    txt(ctx, line1, tx, chy + px(14), { font: F(10, 'bold'), color: COL.cyan, align: al, outline: false, maxW: cw - px(20) });
    txt(ctx, line2, tx, chy + px(30), { font: chipFont, color: COL.ink, align: al, outline: false, maxW: cw - px(20) });
    ui.chipBottom = chy + px(38);
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
    if (m.shown == null) { m.shown = target; m.last = target; return; }
    if (target !== m.last) { m.delta += target - m.last; m.deltaT = 2.2; m.last = target; }
    var diff = target - m.shown;
    if (diff !== 0) {
      var step = Math.max(1, Math.abs(diff) * dt * 6, dt * 400);
      if (Math.abs(diff) <= step) m.shown = target; else m.shown += (diff > 0 ? 1 : -1) * step;
    }
    if (m.deltaT > 0) { m.deltaT -= dt; if (m.deltaT <= 0) m.delta = 0; }
  }
  function drawMoney(ctx, rx, y) {
    var m = ui.money, str = U.fmtMoney(m.shown == null ? 0 : m.shown);
    txt(ctx, str, rx, y, { font: F(26, 'bold'), color: COL.lime, align: 'right', lw: px(4) });
    if (m.deltaT > 0 && m.delta) {
      var a = Math.min(1, m.deltaT / 0.6), ds = (m.delta > 0 ? '+' : '') + U.fmtMoney(m.delta);
      txt(ctx, ds, rx, y + px(18), { font: F(13, 'bold'), color: m.delta > 0 ? COL.amber : COL.red, align: 'right', alpha: a });
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
  }
  function drawWeapon(ctx, rx, y) {
    var CB = GTP.Combat, h = CB && CB.hud ? CB.hud() : null, w = h ? h.weapon : { id: 'fist', name: 'Fists', infinite: true, ammo: null };
    var bw = px(150), bh = px(44), x = rx - bw;
    panel(ctx, x, y, bw, bh, px(8), COL.panelSoft, 'rgba(255,255,255,0.14)');
    drawWeaponIcon(ctx, w.id, x + px(6), y + px(4), px(36), COL.ink);
    txt(ctx, String(w.name || w.id).toUpperCase(), x + px(48), y + px(18), { font: F(11, 'bold'), color: COL.muted, outline: false });
    var ammo = w.infinite ? '∞' : String(w.ammo == null ? 0 : w.ammo);
    txt(ctx, ammo, x + bw - px(10), y + px(38), { font: F(w.infinite ? 22 : 18, 'bold'), color: (!w.infinite && w.ammo <= 5) ? COL.red : COL.ink, align: 'right', outline: false });
    if (ui.wanted.last === 0 && w.id === 'fist') txt(ctx, 'wheel / [ ] cycle', x + px(48), y + px(36), { font: F(9), color: 'rgba(143,151,179,0.8)', outline: false });
  }
  function drawClock(ctx, rx, y) {
    var g = game(); if (!g) return;
    txt(ctx, U.fmtClock(g.time.clock), rx, y, { font: F(16, 'bold'), color: COL.ink, align: 'right' });
    txt(ctx, 'DAY ' + g.time.day, rx - px(64), y, { font: F(10, 'bold'), color: COL.muted, align: 'right' });
  }
  function drawObjective(ctx, y) {
    var Ms = GTP.Missions, h = Ms && Ms.hud ? Ms.hud() : null;
    if (!h || !h.active || h.phase !== 'play' || !h.objective) return y;
    var maxW = Math.min(px(620), W - safe.l - safe.r - (portrait ? 0 : px(20)));
    var objFont = F(15, 'bold', FONT_TEXT);
    var lines = wrap(ctx, h.objective, objFont, maxW - px(28));
    var hasTimer = !!h.timer, hasProg = !!(h.progress && h.progress.total);
    var ph = px(14) + lines.length * px(19) + (hasTimer ? px(24) : 0) + (h.hint ? px(16) : 0);
    // the panel hugs its text (a timer bar keeps the full width so the countdown has room)
    var want = px(28) + (hasProg ? px(60) : 0);
    for (var li = 0; li < lines.length; li++) want = Math.max(want, measure(ctx, lines[li], objFont) + px(32) + (hasProg ? px(56) : 0));
    if (h.hint) want = Math.max(want, measure(ctx, h.hint, F(11)) + px(32));
    var pw = hasTimer ? maxW : U.clamp(want, Math.min(px(300), maxW), maxW), x = (W - pw) / 2;
    panel(ctx, x, y, pw, ph, px(10), COL.panelSoft, 'rgba(46,230,255,0.22)');
    ctx.fillStyle = COL.amber; ctx.fillRect(x, y + px(8), px(4), ph - px(16));
    var ty = y + px(24);
    for (var i = 0; i < lines.length; i++) { txt(ctx, lines[i], x + px(16), ty, { font: F(15, 'bold', FONT_TEXT), color: COL.ink, outline: false, maxW: pw - px(32) }); ty += px(19); }
    if (hasProg) {
      var pr = h.progress, ps = pr.n != null ? pr.n + '/' + pr.total : (pr.seconds != null ? Math.ceil(pr.seconds) + 's' : '');
      txt(ctx, ps, x + pw - px(12), y + px(24), { font: F(14, 'bold'), color: COL.amber, align: 'right', outline: false });
    }
    if (h.hint) { txt(ctx, h.hint, x + px(16), ty - px(2), { font: F(11), color: COL.muted, outline: false, maxW: pw - px(32) }); ty += px(16); }
    if (hasTimer) {
      var rem = Math.max(0, h.timer.remaining), tot = Math.max(1, h.timer.total), k = rem / tot, urgent = rem < 10;
      var bw = pw - px(32), by = ty - px(4);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, x + px(16), by, bw, px(6), px(3)); ctx.fill();
      ctx.fillStyle = urgent ? (Math.floor(ui.t * 6) % 2 ? COL.red : '#ff8a80') : COL.cyan; rr(ctx, x + px(16), by, bw * k, px(6), px(3)); ctx.fill();
      txt(ctx, U.fmtTime(Math.ceil(rem)), x + pw - px(12), by - px(6), { font: F(16, 'bold'), color: urgent ? COL.red : COL.ink, align: 'right', outline: false });
      txt(ctx, 'CODE EXPIRES IN', x + px(16), by - px(6), { font: F(9, 'bold'), color: COL.muted, outline: false });
    }
    return y + ph + px(8);
  }
  // objective arrow: a chevron over the target when on screen, an edge arrow when not
  function drawObjectiveArrow(ctx) {
    var Ms = GTP.Missions, Rd = GTP.Render, p = player(); if (!Ms || !Ms.objectiveTarget || !Rd || !p) return;
    var t = null; try { t = Ms.objectiveTarget(); } catch (e) { t = null; }
    if (!t) return;
    var s = Rd.worldToScreen(t.x, (t.y || 0) + 2.6, t.z);
    var distTxt = Math.round(t.dist) + ' m';
    var inside = s.visible && s.depth < 1 && s.sx > px(30) && s.sx < W - px(30) && s.sy > px(80) && s.sy < H - px(60);
    if (inside) {
      var bob = Math.sin(ui.t * 4) * px(4);
      ctx.fillStyle = COL.amber; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.sx, s.sy + bob); ctx.lineTo(s.sx - px(9), s.sy - px(14) + bob); ctx.lineTo(s.sx + px(9), s.sy - px(14) + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
      txt(ctx, distTxt, s.sx, s.sy - px(18) + bob, { font: F(11, 'bold'), color: COL.amber, align: 'center' });
      return;
    }
    var yaw = Rd.rig ? Rd.rig.yaw : 0, dx = t.x - p.x, dz = t.z - p.z;
    var cs = Math.cos(yaw), sn = Math.sin(yaw), lx = dx * cs - dz * sn, ly = dx * sn + dz * cs;   // same rotation as the minimap (up = camera forward)
    var ang = Math.atan2(ly, lx), cx = W / 2, cy = H / 2;
    var ex = cx + Math.cos(ang) * (W / 2 - px(42)), ey = cy + Math.sin(ang) * (H / 2 - px(42));
    ex = U.clamp(ex, px(42), W - px(42)); ey = U.clamp(ey, px(110), H - px(70));
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
    ctx.fillStyle = COL.amber; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px(16), 0); ctx.lineTo(-px(8), -px(11)); ctx.lineTo(-px(3), 0); ctx.lineTo(-px(8), px(11)); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    txt(ctx, distTxt, ex, ey + px(26), { font: F(11, 'bold'), color: COL.amber, align: 'center' });
  }
  // aim mode: crosshair at the aim point, lock reticle on the target
  function drawAimOverlay(ctx) {
    var CB = GTP.Combat, g = game(); if (!CB || !g || g.state !== 'playing' || !CB.aim || !CB.aim.active) return;
    var aim = CB.aim, s = aim.screen, t = aim.target, ts = aim.targetScreen, now = g.time.t;
    ctx.save(); ctx.lineCap = 'round';
    if (s && s.visible) {
      var hot = !!aim.hover && !t, col = hot ? COL.pink : (aim.inRange ? COL.cyan : 'rgba(46,230,255,0.55)');
      ctx.lineWidth = px(5); ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.arc(s.sx, s.sy, px(9), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.sx - px(19), s.sy); ctx.lineTo(s.sx - px(12), s.sy); ctx.moveTo(s.sx + px(12), s.sy); ctx.lineTo(s.sx + px(19), s.sy); ctx.moveTo(s.sx, s.sy - px(19)); ctx.lineTo(s.sx, s.sy - px(12)); ctx.moveTo(s.sx, s.sy + px(12)); ctx.lineTo(s.sx, s.sy + px(19)); ctx.stroke();
      ctx.lineWidth = px(2); ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(s.sx, s.sy, px(9), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.sx - px(19), s.sy); ctx.lineTo(s.sx - px(12), s.sy); ctx.moveTo(s.sx + px(12), s.sy); ctx.lineTo(s.sx + px(19), s.sy); ctx.moveTo(s.sx, s.sy - px(19)); ctx.lineTo(s.sx, s.sy - px(12)); ctx.moveTo(s.sx, s.sy + px(12)); ctx.lineTo(s.sx, s.sy + px(19)); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s.sx, s.sy, px(1.8), 0, Math.PI * 2); ctx.fill();
    }
    if (t && ts && ts.visible) {
      var k = Math.min(1, (now - (aim.lockT || 0)) / 0.25), size = px(32) + (1 - k) * px(28), half = size / 2, c = px(9);
      var hostile = t.role === 'cop' || t.role === 'swat' || t.role === 'thug' || t.hostile || (t.kind === 'vehicle' && t.isPolice) || t.kind === 'heli';
      ctx.save(); ctx.translate(ts.sx, ts.sy); ctx.rotate((1 - k) * 0.6);
      var bracket = function () { ctx.beginPath(); ctx.moveTo(-half, -half + c); ctx.lineTo(-half, -half); ctx.lineTo(-half + c, -half); ctx.moveTo(half - c, -half); ctx.lineTo(half, -half); ctx.lineTo(half, -half + c); ctx.moveTo(half, half - c); ctx.lineTo(half, half); ctx.lineTo(half - c, half); ctx.moveTo(-half + c, half); ctx.lineTo(-half, half); ctx.lineTo(-half, half - c); ctx.stroke(); };
      ctx.lineWidth = px(5); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; bracket();
      ctx.lineWidth = px(2.2); ctx.strokeStyle = hostile ? COL.red : COL.pink; bracket();
      var hp = U.clamp((t.hp || 0) / (t.maxHp || 1), 0, 1);
      ctx.fillStyle = 'rgba(10,12,20,0.75)'; rr(ctx, -half, half + px(6), size, px(6), px(3)); ctx.fill();
      ctx.fillStyle = hp > 0.5 ? COL.lime : hp > 0.25 ? COL.amber : COL.red; rr(ctx, -half, half + px(6), size * hp, px(6), px(3)); ctx.fill();
      var label = t.kind === 'vehicle' ? (t.isPolice ? 'CRUISER' : String(t.type || 'car').toUpperCase()) : t.kind === 'heli' ? 'WEATHER BALLOON' : (t.castId ? castName(t.castId) : roleLabel(t.role));
      txt(ctx, label, 0, half + px(24), { font: F(11, 'bold'), color: COL.ink, align: 'center' });
      ctx.restore();
    }
    ctx.restore();
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
      var a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1, size = o.size || 16;
      txt(ctx, o.text, s.sx, s.sy, { font: F(size * (1 + Math.min(k, 0.15)), 'bold', FONT_DISPLAY), color: o.color || COL.pink, align: 'center', alpha: a, lw: px(4) });
    }
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
    var n = Math.min(cands.length, 8), font = F(12, 'bold', FONT_TEXT);
    for (i = 0; i < n; i++) {
      var p = cands[i].e, sc = (p.look && p.look.scale) || 1, s = Rd.worldToScreen(p.x, p.y + (p.height || 1.8) * sc + 0.45, p.z);
      if (!s.visible || s.depth > 1 || s.sx < px(20) || s.sx > W - px(20) || s.sy < px(40) || s.sy > H - px(20)) continue;   // off-screen peds keep their lines to themselves
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
    var slot = n % 7;
    if ((slot === 2 || slot === 5) && dj.length) return { text: dj[Math.floor(n / 7 + slot) % dj.length], tag: 'DJ', color: stationColor(st) };
    if (slot === 6 && news.length) return { text: news[Math.floor(n / 7) % news.length], tag: 'NEWS', color: COL.red };
    if (ads.length) return { text: ads[(Math.floor(n / 7) * 3 + slot) % ads.length], tag: 'AD', color: COL.amber };
    return null;
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
    var ps = px(portrait ? 76 : 96), bw = Math.min(px(780), W - safe.l - safe.r), bh = ps + px(24);
    var bx = (W - bw) / 2, by = H - safe.b - bh - px(ui.touch.visible && game().state === 'playing' ? 150 : 16);
    var a = Math.min(1, d.t / 0.18);
    ctx.save(); ctx.globalAlpha = a;
    panel(ctx, bx, by, bw, bh, px(12), 'rgba(10,12,24,0.9)', hexA(color, 0.6), px(2));
    // portrait + name plate
    castPortrait(ctx, who, bx + px(12), by + px(12), ps);
    var tx = bx + ps + px(28), tw = bw - ps - px(44);
    var nameFont = F(13, 'bold'), nw = measure(ctx, name.toUpperCase(), nameFont) + px(18);
    ctx.fillStyle = color; rr(ctx, tx, by + px(10), nw, px(22), px(5)); ctx.fill();
    txt(ctx, name.toUpperCase(), tx + nw / 2, by + px(26), { font: nameFont, color: '#0b1020', align: 'center', outline: false });
    if (cm && cm.role && !portrait) txt(ctx, cm.role, tx + nw + px(10), by + px(26), { font: F(11), color: COL.muted, outline: false, maxW: tw - nw - px(12) });
    // typewriter text
    var shown = String(line.text || '').slice(0, Math.floor(d.chars)), font = F(portrait ? 14 : 17, '', FONT_TEXT);
    var lines = wrap(ctx, shown, font, tw), ly = by + px(54);
    var lineH = px(portrait ? 18 : 22), maxLines = Math.max(1, Math.floor((bh - px(58)) / lineH));
    if (lines.length > maxLines) lines = lines.slice(lines.length - maxLines);
    for (var i = 0; i < lines.length; i++) { txt(ctx, lines[i], tx, ly, { font: font, color: COL.ink, outline: false }); ly += lineH; }
    if (d.done && Math.floor(d.t * 2) % 2 === 0) txt(ctx, ui.touch.visible ? 'TAP ▶' : 'ENTER ▶', bx + bw - px(14), by + bh - px(10), { font: F(10, 'bold'), color: COL.muted, align: 'right', outline: false });
    ctx.restore();
  }

  // ------------------------------------------------ banner, cards, toasts ----
  function banner(title, sub) { ui.banner = { title: String(title || ''), sub: sub ? String(sub) : '', t: 0, dur: 4.2 }; if (ui.card && ui.card.kind === 'passed') ui.card = null; }   // the next mission's banner replaces a lingering PASSED card
  function card(kind, title, sub) { ui.card = { kind: kind || 'passed', title: String(title || ''), sub: sub ? String(sub) : '', t: 0, dur: kind === 'failed' ? 4.2 : 4.8 }; }
  function toast(text) {
    text = String(text == null ? '' : text);
    // the full-screen cards already say it
    if (text === failText('wasted', 'RATIO\'D') || text === failText('busted', 'DEPLATFORMED')) return;
    ui.toasts.push({ text: text, t: 0, dur: 3.2 }); if (ui.toasts.length > 4) ui.toasts.shift();
  }
  function updateCards(dt) {
    if (ui.banner) { ui.banner.t += dt; if (ui.banner.t > ui.banner.dur) ui.banner = null; }
    if (ui.card) { ui.card.t += dt; if (ui.card.t > ui.card.dur) ui.card = null; }
    for (var i = ui.toasts.length - 1; i >= 0; i--) { ui.toasts[i].t += dt; if (ui.toasts[i].t > ui.toasts[i].dur) ui.toasts.splice(i, 1); }
  }
  function drawBanner(ctx) {
    var b = ui.banner; if (!b) return;
    var k = b.t / b.dur, a = k < 0.08 ? k / 0.08 : k > 0.85 ? (1 - k) / 0.15 : 1, slide = (1 - ease(Math.min(1, b.t / 0.5))) * px(60);
    var font = F(portrait ? 26 : 36, '900', FONT_DISPLAY);
    ctx.save(); ctx.globalAlpha = a;
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
  function drawCard(ctx) {
    var c = ui.card; if (!c) return;
    var k = c.t / c.dur, a = k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1, pop = 1 + (1 - ease(Math.min(1, c.t / 0.35))) * 0.25;
    var failed = c.kind === 'failed', col = failed ? COL.red : COL.gold;
    var cy = H * 0.4;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(6,7,13,0.55)'; ctx.fillRect(0, cy - px(58), W, px(120));
    ctx.fillStyle = col; ctx.fillRect(0, cy - px(58), W, px(3)); ctx.fillRect(0, cy + px(59), W, px(3));
    ctx.save(); ctx.translate(W / 2, cy); ctx.scale(pop, pop);
    txt(ctx, c.title, 0, px(8), { font: F(portrait ? 30 : 44, '900', FONT_DISPLAY), color: col, align: 'center', lw: px(6), outline: 'rgba(0,0,0,0.9)', maxW: W - px(40) });
    ctx.restore();
    if (c.sub) txt(ctx, c.sub, W / 2, cy + px(40), { font: F(16, 'bold'), color: COL.ink, align: 'center', maxW: W - px(40) });
    ctx.restore();
  }
  function drawToasts(ctx) {
    if (!ui.toasts.length) return;
    var y = ui.touch.visible ? H * 0.56 : H - safe.b - px(56) - (ui.dialogue ? px(120) : 0) - (ui.ticker.cur ? px(32) : 0);
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
    var sub = busted ? 'Rate your arrest, one to ten. Fine: ' + U.fmtMoney(C.ECONOMY.bustedFine) + '.' : 'Discharged with a bandage that has a coupon code. Cash -' + Math.round(C.ECONOMY.deathCashLoss * 100) + '%.';
    var lines = wrap(ctx, sub, F(15, 'bold', FONT_TEXT), W - px(60));
    for (var i = 0; i < lines.length; i++) txt(ctx, lines[i], W / 2, cy + px(44) + i * px(20), { font: F(15, 'bold', FONT_TEXT), color: COL.ink, align: 'center', alpha: k });
    if (t > 1.2) txt(ctx, busted ? 'Respawning at the precinct' : 'Respawning at the hospital', W / 2, cy + px(48) + lines.length * px(20) + px(10), { font: F(11), color: COL.muted, align: 'center', alpha: Math.min(1, (t - 1.2) / 0.5) });
  }

  // --------------------------------------------------------------- title ----
  var CONTROLS = [
    ['WASD / arrows', 'Move  (steer in a vehicle)'], ['Shift', 'Run'], ['Space', 'Jump  /  handbrake'],
    ['Q or right mouse', 'Aim  (lock-on)'], ['E, left mouse or Ctrl', 'Action  /  fire'], ['F or Enter', 'Enter / exit vehicle'],
    ['Tab', 'Next target'], ['Mouse wheel or [ ]', 'Cycle weapon'], ['H', 'Horn  (siren in a cruiser)'],
    ['R', 'Radio station'], ['M', 'Phone: map, missions, stats'], ['V', 'Camera mode'], ['Esc or P', 'Pause']
  ];
  function titleItems() {
    var g = game(), items = [{ id: 'play', label: 'NEW GAME' }];
    if (g && g.hasSave && g.hasSave()) items.unshift({ id: 'continue', label: 'CONTINUE' });
    items.push({ id: 'controls', label: 'CONTROLS' });
    return items;
  }
  function startAttract() {
    var Rd = GTP.Render, Wd = GTP.World; if (!Rd || !Rd.freeCam) return;
    var ids = ['goldplate_tower', 'campus_quad', 'stadium', 'velvetine_pier', 'capitol_dome', 'nap_depot', 'tyn_tower', 'bridge_main'], stops = [];
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
  function drawLogo(ctx, cx, y, scale) {
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
    txt(ctx, 'Steal the Discourse.', cx, y2 + px(34 * scale), { font: F(22 * scale, 'italic bold', FONT_TEXT), color: COL.pink, align: 'center', lw: px(4) });
    ctx.restore();
  }
  function drawTitle(ctx) {
    var tt = ui.title; tt.t += 1 / 60;
    // cinematic vignette
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(6,7,13,0.75)'); g.addColorStop(0.35, 'rgba(6,7,13,0.15)'); g.addColorStop(0.7, 'rgba(6,7,13,0.25)'); g.addColorStop(1, 'rgba(6,7,13,0.85)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var scale = portrait ? 0.62 : Math.min(1, W / 900);
    drawLogo(ctx, W / 2, H * (portrait ? 0.16 : 0.2), scale);
    if (tt.page === 'controls') { drawControlsPanel(ctx, 'CONTROLS', function () { tt.page = 'menu'; }); }
    else {
      var items = titleItems(); tt.items = items; if (tt.sel >= items.length) tt.sel = 0;
      var y = H * (portrait ? 0.56 : 0.6), font = F(22, 'bold');
      var blink = Math.floor(tt.t * 1.6) % 2 === 0;
      txt(ctx, ui.touch.visible ? 'TAP TO PLAY' : 'PRESS ENTER TO PLAY', W / 2, y - px(34), { font: F(15, 'bold'), color: blink ? COL.cyan : 'rgba(46,230,255,0.45)', align: 'center' });
      for (var i = 0; i < items.length; i++) {
        var it = items[i], iw = px(280), ih = px(40), ix = W / 2 - iw / 2, iy = y + i * px(48), sel = i === tt.sel;
        if (hovering(ix, iy, iw, ih)) { tt.sel = i; sel = true; }
        panel(ctx, ix, iy, iw, ih, px(8), 'rgba(10,12,24,0.88)', sel ? COL.pink : 'rgba(255,255,255,0.15)', sel ? 2 : 1);
        if (sel) panel(ctx, ix, iy, iw, ih, px(8), 'rgba(255,63,164,0.22)', null);
        txt(ctx, (sel ? '▶  ' : '') + it.label, W / 2, iy + px(27), { font: font, color: sel ? COL.ink : COL.muted, align: 'center', outline: false });
        hit(ix, iy, iw, ih, titleActivate.bind(null, it.id), it.id);
      }
    }
    txt(ctx, 'A parody. All characters are fictional.', W / 2, H - safe.b - px(34), { font: F(12, 'bold'), color: COL.ink, align: 'center' });
    txt(ctx, 'Grievance City: two time zones, one opinion.  v' + (GTP.VERSION || ''), W / 2, H - safe.b - px(14), { font: F(10), color: COL.muted, align: 'center' });
  }
  function drawControlsPanel(ctx, title, onClose) {
    var pw = Math.min(px(620), W - safe.l - safe.r), rows = CONTROLS.length, rh = px(portrait ? 22 : 24), ph = px(70) + rows * rh;
    var x = (W - pw) / 2, y = Math.max(px(20), Math.min(H * 0.4, H - ph - px(50)));
    panel(ctx, x, y, pw, ph, px(12), 'rgba(10,12,24,0.97)', COL.line, 1.5);
    txt(ctx, title, x + px(20), y + px(32), { font: F(18, '900', FONT_DISPLAY), color: COL.gold, outline: false });
    txt(ctx, 'Enter / Esc: back', x + pw - px(20), y + px(30), { font: F(10, 'bold'), color: COL.muted, align: 'right', outline: false });
    var ty = y + px(60), split = x + pw * (portrait ? 0.46 : 0.42);
    for (var i = 0; i < rows; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0)'; ctx.fillRect(x + px(8), ty - rh + px(6), pw - px(16), rh);
      txt(ctx, CONTROLS[i][0], split - px(10), ty, { font: F(portrait ? 11 : 13, 'bold'), color: COL.cyan, align: 'right', outline: false, maxW: split - x - px(20) });
      txt(ctx, CONTROLS[i][1], split + px(6), ty, { font: F(portrait ? 11 : 13, '', FONT_TEXT), color: COL.ink, outline: false, maxW: x + pw - split - px(20) });
      ty += rh;
    }
    if (ui.touch.visible) txt(ctx, 'Touch: left stick moves, right side looks, buttons fire / aim / enter / jump / weapon / map / pause.', x + px(20), y + ph - px(14), { font: F(10), color: COL.muted, outline: false, maxW: pw - px(40) });
    hit(x, y, pw, ph, onClose, 'controls-close');
  }
  function titleActivate(id) {
    var g = game(); if (!g) return;
    sfx('ui', 0.4);
    if (id === 'controls') { ui.title.page = 'controls'; return; }
    if (id === 'continue') { if (g.load && g.load()) return; toast('No save to continue; starting new'); }
    if (ui.sessionStarted && g.newGame) { g.newGame(g.seed); ui.money.shown = null; ui.wanted.last = 0; }   // back from "quit to title": a fresh city
    g.setState('playing');
  }

  // ------------------------------------------------ pause, phone, credits ----
  var PAUSE_ITEMS = ['RESUME', 'CONTROLS', 'MUTE', 'RESTART', 'QUIT TO TITLE'];
  var PHONE_TABS = ['MAP', 'MISSIONS', 'STATS', 'CONTROLS'];
  function openPause(page) {
    var g = game(); if (!g) return;
    if (g.state === 'paused') { ui.pause.page = page; return; }
    if (g.state !== 'playing' && g.state !== 'cutscene') return;
    ui.pause.from = g.state; ui.pause.page = page; ui.pause.sel = 0; ui.pause.scroll = 0;
    g.setState('paused');
    if (GTP.Input.releasePointerLock) GTP.Input.releasePointerLock();
  }
  function closePause() {
    var g = game(); if (!g || g.state !== 'paused') return;
    var to = ui.pause.from === 'cutscene' && GTP.Missions && GTP.Missions.dialogue && GTP.Missions.dialogue.active ? 'cutscene' : 'playing';
    g.setState(to);
  }
  function pauseActivate(i) {
    var g = game(); if (!g) return;
    sfx('ui', 0.4);
    switch (PAUSE_ITEMS[i]) {
      case 'RESUME': closePause(); break;
      case 'CONTROLS': ui.pause.page = 'controls'; break;
      case 'MUTE': setMuted(!ui.muted); break;
      case 'RESTART': g.newGame(g.seed); ui.money.shown = null; ui.wanted.last = 0; ui.toasts.length = 0; ui.dialogue = null; g.setState('playing'); toast('New game. Minds changed: zero.'); break;
      case 'QUIT TO TITLE': g.setState('title'); break;
      default: break;
    }
  }
  function setMuted(m) {
    ui.muted = !!m;
    if (GTP.Audio && GTP.Audio.setMuted) { try { GTP.Audio.setMuted(ui.muted); } catch (e) { /* optional */ } }
    try { localStorage.setItem('gtp.mute', ui.muted ? '1' : '0'); } catch (e) { /* storage may be blocked */ }
  }
  function drawPause(ctx) {
    var pg = ui.pause;
    ctx.fillStyle = 'rgba(6,7,13,0.62)'; ctx.fillRect(0, 0, W, H);
    if (pg.page === 'phone') { drawPhone(ctx); return; }
    if (pg.page === 'credits') { drawCredits(ctx); return; }
    if (pg.page === 'controls') { drawControlsPanel(ctx, 'CONTROLS', function () { pg.page = 'pause'; }); return; }
    var pw = px(360), ph = px(84) + PAUSE_ITEMS.length * px(46), x = (W - pw) / 2, y = (H - ph) / 2;
    panel(ctx, x, y, pw, ph, px(14), 'rgba(10,12,24,0.94)', COL.line, 1.5);
    txt(ctx, 'PAUSED', W / 2, y + px(44), { font: F(30, '900', FONT_DISPLAY), color: COL.gold, align: 'center', outline: false });
    for (var i = 0; i < PAUSE_ITEMS.length; i++) {
      var iw = pw - px(48), ih = px(38), ix = x + px(24), iy = y + px(66) + i * px(46), sel = i === pg.sel;
      if (hovering(ix, iy, iw, ih)) { pg.sel = i; sel = true; }
      panel(ctx, ix, iy, iw, ih, px(8), sel ? 'rgba(255,63,164,0.22)' : 'rgba(255,255,255,0.04)', sel ? COL.pink : 'rgba(255,255,255,0.12)', sel ? 2 : 1);
      var label = PAUSE_ITEMS[i] === 'MUTE' ? 'MUTE: ' + (ui.muted ? 'ON' : 'OFF') : PAUSE_ITEMS[i];
      txt(ctx, (sel ? '▶  ' : '') + label, ix + iw / 2, iy + px(25), { font: F(16, 'bold'), color: sel ? COL.ink : COL.muted, align: 'center', outline: false });
      hit(ix, iy, iw, ih, pauseActivate.bind(null, i), 'pause-' + i);
    }
    txt(ctx, 'Esc resumes  ·  M opens the phone', W / 2, y + ph + px(22), { font: F(11), color: COL.muted, align: 'center' });
  }
  function drawPhone(ctx) {
    var pg = ui.pause, pw = Math.min(px(560), W - safe.l - safe.r), ph = Math.min(px(600), H - safe.t - safe.b - px(10)), x = (W - pw) / 2, y = (H - ph) / 2;
    panel(ctx, x, y, pw, ph, px(22), 'rgba(12,14,26,0.96)', 'rgba(255,255,255,0.22)', px(3));
    ctx.fillStyle = '#05060b'; rr(ctx, x + pw / 2 - px(50), y + px(6), px(100), px(14), px(7)); ctx.fill();   // the notch
    var g = game(), p = player();
    txt(ctx, g ? U.fmtClock(g.time.clock) : '', x + px(22), y + px(30), { font: F(12, 'bold'), color: COL.muted, outline: false });
    txt(ctx, p ? U.fmtMoney(p.money) : '', x + pw - px(22), y + px(30), { font: F(12, 'bold'), color: COL.lime, align: 'right', outline: false });
    // tabs
    var tabW = (pw - px(32)) / PHONE_TABS.length, ty = y + px(44);
    for (var i = 0; i < PHONE_TABS.length; i++) {
      var tx = x + px(16) + i * tabW, sel = i === pg.tab;
      if (hovering(tx, ty, tabW, px(30))) { /* hover only highlights on click */ }
      panel(ctx, tx + px(2), ty, tabW - px(4), px(30), px(6), sel ? 'rgba(46,230,255,0.2)' : 'rgba(255,255,255,0.05)', sel ? COL.cyan : 'rgba(255,255,255,0.1)');
      txt(ctx, PHONE_TABS[i], tx + tabW / 2, ty + px(20), { font: F(11, 'bold'), color: sel ? COL.ink : COL.muted, align: 'center', outline: false });
      hit(tx, ty, tabW, px(30), (function (k) { return function () { pg.tab = k; pg.sel = 0; pg.scroll = 0; }; })(i), 'tab-' + i);
    }
    var cx = x + px(16), cy = ty + px(42), cw = pw - px(32), ch = ph - px(100);
    ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip();
    if (pg.tab === 0) drawPhoneMap(ctx, cx, cy, cw, ch);
    else if (pg.tab === 1) drawPhoneMissions(ctx, cx, cy, cw, ch);
    else if (pg.tab === 2) drawPhoneStats(ctx, cx, cy, cw, ch);
    else drawPhoneControls(ctx, cx, cy, cw, ch);
    ctx.restore();
    txt(ctx, '← → tabs   ·   M / Esc close', W / 2, y + ph - px(12), { font: F(10), color: COL.muted, align: 'center', outline: false });
  }
  function drawPhoneMap(ctx, x, y, w, h) {
    var bake = ensureMap(), p = player(), Wd = GTP.World; if (!bake || !p) return;
    var size = Math.min(w, h - px(30)), mx = x + (w - size) / 2, my = y;
    var k = size / bake.width;
    ctx.fillStyle = '#0d1424'; ctx.fillRect(mx, my, size, size);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(bake, mx, my, size, size);
    // district names
    var ds = (Wd && Wd.districts) || [];
    for (var i = 0; i < ds.length; i++) txt(ctx, String(ds[i].name || ds[i].id).toUpperCase(), mx + ds[i].cx * k, my + ds[i].cz * k, { font: F(9, 'bold'), color: 'rgba(238,241,251,0.85)', align: 'center', lw: 2 });
    var Ms = GTP.Missions, marks = Ms && Ms.markers ? Ms.markers() : [];
    for (i = 0; i < marks.length; i++) {
      var mk = marks[i], sx = mx + mk.x * k, sy = my + mk.z * k;
      ctx.fillStyle = mk.kind === 'objective' ? COL.amber : '#4aa8ff'; ctx.beginPath(); ctx.arc(sx, sy, px(5), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
      if (mk.kind === 'mission') txt(ctx, mk.title, sx, sy - px(8), { font: F(9, 'bold'), color: '#bfe3ff', align: 'center', lw: 2 });
    }
    ctx.save(); ctx.translate(mx + p.x * k, my + p.z * k); ctx.rotate(-(p.yaw || 0));
    ctx.fillStyle = COL.ink; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -px(7)); ctx.lineTo(px(5), px(6)); ctx.lineTo(0, px(3)); ctx.lineTo(-px(5), px(6)); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    var d = Wd.districtAt ? Wd.districtAt(p.x, p.z) : null, st = Wd.streetAt ? Wd.streetAt(p.x, p.z, p.y) : null;
    txt(ctx, (d ? d.name : 'Open water') + (st ? '  ·  ' + st : ''), x + w / 2, my + size + px(20), { font: F(12, 'bold'), color: COL.ink, align: 'center', outline: false, maxW: w });
  }
  function drawPhoneMissions(ctx, x, y, w, h) {
    var Ms = GTP.Missions, st = Ms && Ms.state, Cm = (GTP.Content && GTP.Content.missions) || [];
    var rows = [], i;
    if (st && st.active) rows.push({ kind: 'active', title: st.mission ? st.mission.title : st.active, sub: st.objectiveText || 'In progress' });
    var av = Ms && Ms.available ? Ms.available() : [];
    for (i = 0; i < av.length; i++) { var lm = GTP.World.landmark(av[i].marker); rows.push({ kind: 'avail', title: av[i].title, sub: castName(av[i].giver) + '  ·  ' + (lm ? landmarkLabel(lm) : av[i].marker) + '  ·  ' + U.fmtMoney(av[i].reward || 0) }); }
    for (i = 0; i < Cm.length; i++) if (st && st.completed && st.completed.has(Cm[i].id)) rows.push({ kind: 'done', title: Cm[i].title, sub: 'Completed  ·  ' + U.fmtMoney(Cm[i].reward || 0) });
    var done = st && st.completed ? st.completed.size : 0;
    txt(ctx, 'MISSIONS  ' + done + ' / ' + Cm.length, x, y + px(14), { font: F(12, 'bold'), color: COL.cyan, outline: false });
    var ry = y + px(26) - ui.pause.scroll;
    if (!rows.length) txt(ctx, 'Nothing booked. Find a blue light.', x, ry + px(20), { font: F(13, '', FONT_TEXT), color: COL.muted, outline: false });
    for (i = 0; i < rows.length; i++) {
      var r = rows[i], rh = px(44), col = r.kind === 'active' ? COL.amber : r.kind === 'avail' ? '#4aa8ff' : COL.lime;
      if (ry + rh > y && ry < y + h) {
        panel(ctx, x, ry, w, rh - px(6), px(8), 'rgba(255,255,255,0.05)', hexA(col, 0.5));
        ctx.fillStyle = col; rr(ctx, x, ry, px(5), rh - px(6), px(2)); ctx.fill();
        txt(ctx, (r.kind === 'done' ? '✓  ' : r.kind === 'active' ? '▶  ' : '') + r.title, x + px(14), ry + px(17), { font: F(13, 'bold'), color: COL.ink, outline: false, maxW: w - px(30) });
        txt(ctx, r.sub, x + px(14), ry + px(32), { font: F(10), color: COL.muted, outline: false, maxW: w - px(30) });
      }
      ry += rh;
    }
    if (st && st.active) {
      var bw = Math.min(px(190), w * 0.5), bh = px(24), bx = x + w - bw, by = y;
      var hov = hovering(bx, by, bw, bh);
      panel(ctx, bx, by, bw, bh, px(6), hov ? 'rgba(255,59,48,0.35)' : 'rgba(255,59,48,0.18)', COL.red, 1.5);
      txt(ctx, 'ABORT MISSION  (Backspace)', bx + bw / 2, by + px(16), { font: F(9, 'bold'), color: COL.ink, align: 'center', outline: false, maxW: bw - px(8) });
      hit(bx, by, bw, bh, abortMission, 'abort');
    }
  }
  function abortMission() {
    var Ms = GTP.Missions; if (!Ms || !Ms.state || !Ms.state.active) return;
    Ms.abort(); closePause();
  }
  function drawPhoneStats(ctx, x, y, w, h) {
    var p = player(), g = game(), st = (p && p.stats) || {}, Ms = GTP.Missions;
    var wl = (GTP.AI && GTP.AI.wanted) ? GTP.AI.wanted.level : 0;
    var rows = [
      ['Cash', p ? U.fmtMoney(p.money) : '$0'], ['Missions passed', String(Ms && Ms.state ? Ms.state.completed.size : 0)],
      ['Day / time', g ? 'Day ' + g.time.day + ', ' + U.fmtClock(g.time.clock) : ''], ['Wanted', wl ? wl + ' star' + (wl > 1 ? 's' : '') : 'clean'],
      ['Distance on foot', Math.round(st.distance || 0) + ' m'], ['Distance driven', Math.round(st.distanceDriven || 0) + ' m'],
      ['Vehicles borrowed', String(st.vehiclesStolen || 0)], ['Crashes', String(st.crashes || 0)], ['Peds bumped', String(st.pedsHit || 0)],
      ['Shots / hits', (st.shots || 0) + ' / ' + (st.hits || 0)], ['Hecklers floored', String(st.knockdowns || 0)], ['Debates shouted', String(st.debating || 0)],
      ['Honks', String(st.honking || 0)], ['Times ratio\'d', String(st.deaths || 0)], ['Times deplatformed', String(st.busted || 0)], ['Minds changed', '0']
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
    txt(ctx, 'Roz\'s sign today: ' + sign, x + px(8), Math.min(y + h - px(8), ry + px(10)), { font: F(10), color: COL.amber, outline: false, maxW: w - px(16) });
  }
  function drawPhoneControls(ctx, x, y, w, h) {
    txt(ctx, 'CONTROLS', x, y + px(14), { font: F(12, 'bold'), color: COL.cyan, outline: false });
    var rh = px(22), ry = y + px(36) - ui.pause.scroll, split = x + w * 0.44;
    for (var i = 0; i < CONTROLS.length; i++) {
      if (ry > y - rh && ry < y + h + rh) {
        txt(ctx, CONTROLS[i][0], split - px(8), ry, { font: F(11, 'bold'), color: COL.cyan, align: 'right', outline: false, maxW: split - x - px(10) });
        txt(ctx, CONTROLS[i][1], split + px(6), ry, { font: F(11, '', FONT_TEXT), color: COL.ink, outline: false, maxW: x + w - split - px(10) });
      }
      ry += rh;
    }
    void h;
  }
  // credits roll as ad tickers
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
    lines.push({ t: 'KIP GRATIS asks: Is this paid?', who: 'kip' }, { t: '' }, { t: id === 'm15b_liveread' ? 'Reward: $11. One per listener.' : 'Rated a ten by the man who rates it.', sub: true });
    ui.credits = { id: id || null, lines: lines, y: 0, t: 0, done: false };
    var g = game();
    if (g && (g.state === 'playing' || g.state === 'cutscene')) openPause('credits');
    else if (g && g.state === 'paused') ui.pause.page = 'credits';
  }
  function updateCredits(dt) {
    var c = ui.credits; if (!c) return;
    c.t += dt; c.y += dt * px(42);
    var total = c.lines.length * px(34) + H;
    if (c.y > total) endCredits();
  }
  function endCredits() {
    ui.credits = null;
    var g = game(); if (g && g.state === 'paused' && ui.pause.page === 'credits') { ui.pause.page = 'pause'; closePause(); }
    toast('Thanks for listening to listening.');
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
    txt(ctx, 'Enter / Esc: skip', W - safe.r, H - safe.b - px(10), { font: F(10), color: COL.muted, align: 'right' });
  }

  // ============================================================ minigames ====
  // Both games use only the engine's input actions and resolve onResult(win).
  var CARD_TYPES = ['FACT', 'FEELING', 'GOTCHA', 'ANECDOTE'];
  var COUNTERS = { 'SOURCE?': 'FACT', 'LOUDER': 'FEELING', 'PIVOT': 'GOTCHA', 'DEFINE TERMS': 'ANECDOTE' };
  var COUNTER_KEYS = [{ id: 'SOURCE?', action: 'forward', glyph: '↑', key: 'W' }, { id: 'LOUDER', action: 'left', glyph: '←', key: 'A' }, { id: 'PIVOT', action: 'right', glyph: '→', key: 'D' }, { id: 'DEFINE TERMS', action: 'back', glyph: '↓', key: 'S' }];
  var CARD_COLOR = { FACT: '#4aa8ff', FEELING: '#ff3fa4', GOTCHA: '#ffbe3c', ANECDOTE: '#9dff3c' };
  var mgSerial = 0;
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
          var shout = In.down('run');
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
        txt(ctx, it.grey ? 'E / Space' : it.key + ' / arrow', cxx + cwid - px(6), cyy + px(13), { font: F(8 * ts, 'bold'), color: 'rgba(238,241,251,0.55)', align: 'right', outline: false });
        txt(ctx, it.id, cxx + cwid / 2, cyy + chgt * 0.68, { font: F((it.id === 'DEFINE TERMS' ? 10 : 12) * ts, 'bold'), color: it.grey ? COL.muted : COL.ink, align: 'center', outline: false, maxW: cwid - px(8) });
        txt(ctx, it.grey ? 'never wins, never loses (-5)' : 'beats ' + COUNTERS[it.id], cxx + cwid / 2, cyy + chgt * 0.86, { font: F(8 * ts, ''), color: COL.muted, align: 'center', outline: false, maxW: cwid - px(6) });
        hit(cxx, cyy, cwid, chgt, (function (id) { return function () { debate.answer(id, GTP.Input.down('run')); }; })(it.id), 'card-' + it.id);
      }
      var shoutOn = GTP.Input.down('run');
      txt(ctx, shoutOn ? 'SHOUT ARMED (Shift): +40 on a hit, double loss on a miss' : 'hold Shift to SHOUT: +40 on a hit, double loss on a miss, heat on exit', bx + pad, cardsY + blockH + px(16), { font: F(10 * ts, 'bold'), color: shoutOn ? COL.pink : COL.muted, outline: false, maxW: bw - pad * 2 });
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
        if (In.pressed('shoot')) ratio.hottake();
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
      if (narrow) { colH -= px(70); }
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
      var hx = narrow ? bx + pad + ppw / 2 - px(60) : rx + px(14), hy = narrow ? y3 + px(10) : ry + px(142), hs = px(34) * ts;
      panel(ctx, hx, hy, hs, hs, px(8), st.hottake ? 'rgba(255,122,32,0.25)' : 'rgba(255,255,255,0.04)', st.hottake ? '#ff7a20' : 'rgba(255,255,255,0.15)', 1.5);
      drawWeaponIcon(ctx, 'hottake', hx + hs * 0.1, hy + hs * 0.1, hs * 0.8, st.hottake ? '#ffd0a0' : 'rgba(255,255,255,0.25)');
      txt(ctx, st.hottake ? 'HOTTAKE (Ctrl / click)' : st.primed ? 'PRIMED' : 'USED', hx + hs + px(8), hy + hs * 0.62, { font: F(9 * ts, 'bold'), color: st.hottake ? '#ffd0a0' : COL.muted, outline: false, maxW: narrow ? px(90) : rightW - hs - px(26) });
      hit(hx, hy, hs + px(90), hs, function () { ratio.hottake(); }, 'hottake');
      var nby = hy + hs + px(12), nbx = narrow ? hx : rx + px(14);
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
      txt(ctx, st.primed ? 'POST (guaranteed DUNK)' : 'POST  (E / Space / tap)', pbx + pbw / 2, pby + pbh * 0.68, { font: F(11 * ts, 'bold'), color: COL.ink, align: 'center', outline: false, maxW: pbw - px(10) });
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
      { id: 'fire', action: 'shoot', label: 'FIRE', carLabel: 'HORN', carAction: 'horn', x: right - big - px(10), y: bottom - big - px(10), r: big, color: COL.pink },
      { id: 'aim', action: 'aim', label: 'AIM', carLabel: 'RADIO', carAction: 'radio', x: right - big * 2 - r - px(30), y: bottom - r - px(28), r: r, color: COL.cyan },
      { id: 'jump', action: 'jump', label: 'JUMP', carLabel: 'BRAKE', carAction: 'jump', x: right - big - px(10), y: bottom - big * 2 - r - px(34), r: r, color: COL.lime },
      { id: 'enter', action: 'enter', label: 'ENTER', carLabel: 'EXIT', carAction: 'enter', x: right - big * 2 - r - px(30), y: bottom - r * 3 - px(58), r: r, color: COL.amber },
      { id: 'weapon', action: 'weaponNext', label: 'WPN', carLabel: 'CAM', carAction: 'cameraMode', x: right - big - px(10), y: bottom - big * 2 - r * 3 - px(56), r: px(24), color: COL.ink },
      { id: 'map', action: 'map', label: 'MAP', carLabel: 'MAP', carAction: 'map', x: W / 2 + px(portrait ? 32 : 44), y: safe.t + px(14), r: px(14), hw: px(portrait ? 28 : 40), color: COL.ink, pill: true },
      { id: 'pause', action: 'pause', label: 'PAUSE', carLabel: 'PAUSE', carAction: 'pause', x: W / 2 - px(portrait ? 32 : 44), y: safe.t + px(14), r: px(14), hw: px(portrait ? 28 : 40), color: COL.ink, pill: true }
    ];
  }
  function canvasPoint(t) {
    var cv = GTP.Render && GTP.Render.hudCanvas, r = cv ? cv.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function touchButtonAt(x, y) {
    var p = player(), inCar = !!(p && p.inVehicle), bs = ui.touch.buttons;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i], bw = b.pill ? b.hw : b.r, dx = x - b.x, dy = y - b.y;
      if (b.pill ? (Math.abs(dx) <= bw && Math.abs(dy) <= b.r) : (dx * dx + dy * dy <= (b.r + px(8)) * (b.r + px(8)))) return { b: b, action: inCar ? b.carAction : b.action };
    }
    return null;
  }
  function menuState() { var g = game(); return !g || g.state === 'title' || g.state === 'paused' || g.state === 'minigame' || g.state === 'wasted' || g.state === 'busted' || g.state === 'gameover'; }
  function handleTouch(e) {
    var In = GTP.Input, T = ui.touch, i, t, id, rec;
    T.visible = true;
    var list = e.changedTouches || e.touches || [];
    if (e.type === 'touchstart') {
      for (i = 0; i < list.length; i++) {
        t = list[i]; id = t.identifier; var pt = canvasPoint(t);
        if (menuState() || ui.dialogue) { pointerTap(pt.x, pt.y); T.ids[id] = { kind: 'tap' }; continue; }
        var hb = touchButtonAt(pt.x, pt.y);
        if (hb) { T.ids[id] = { kind: 'button', action: hb.action, b: hb.b }; In.set(hb.action, true); T.btnDown[hb.b.id] = true; continue; }
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
        }
      }
    } else {
      for (i = 0; i < list.length; i++) {
        t = list[i]; id = t.identifier; rec = T.ids[id]; if (!rec) continue;
        delete T.ids[id];
        if (rec.kind === 'stick') { T.stick = null; In.touch.stick.x = 0; In.touch.stick.y = 0; In.touch.stick.active = false; In.touch.buttons.run = false; }
        else if (rec.kind === 'look') T.look = null;
        else if (rec.kind === 'button') { In.set(rec.action, false); T.btnDown[rec.b.id] = false; }
      }
    }
  }
  function drawTouch(ctx) {
    var g = game(), T = ui.touch; if (!g || g.state !== 'playing') return;
    var p = player(), inCar = !!(p && p.inVehicle);
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
      var b = bs[i], down = !!T.btnDown[b.id], label = inCar ? b.carLabel : b.label;
      if (b.id === 'aim' && inCar && !label) continue;
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
    if (g.state === 'title') { if (ui.title.page === 'controls') ui.title.page = 'menu'; else titleActivate(titleItems()[ui.title.sel] ? titleItems()[ui.title.sel].id : 'play'); return true; }
    if (g.state === 'cutscene' && ui.dialogue) { advanceDialogue(); return true; }
    if (g.state === 'paused' && ui.pause.page === 'credits') { endCredits(); return true; }
    return false;
  }
  // called every step before Game's own global input; returns true when the frame's menu input is consumed
  function handleInput(state) {
    var In = GTP.Input, g = game(); if (!In || !g) return false;
    var click = In.pressed('shoot') && In.mouse && In.mouse.down;
    switch (state) {
      case 'title': {
        var tt = ui.title, items = titleItems();
        if (tt.page === 'controls') { if (In.pressed('back') || In.pressed('confirm') || In.pressed('enter') || In.pressed('pause') || click) { if (click) pointerTap(In.mouse.x, In.mouse.y); else tt.page = 'menu'; } return true; }
        if (In.pressed('forward')) { tt.sel = (tt.sel - 1 + items.length) % items.length; sfx('ui', 0.2); }
        if (In.pressed('back')) { tt.sel = (tt.sel + 1) % items.length; sfx('ui', 0.2); }
        if (In.pressed('confirm') || In.pressed('enter')) titleActivate(items[tt.sel] ? items[tt.sel].id : 'play');
        else if (click) pointerTap(In.mouse.x, In.mouse.y);
        return true;
      }
      case 'playing':
        if (In.pressed('map')) { openPause('phone'); return true; }
        if (In.pressed('pause')) { openPause('pause'); return true; }
        if (ui.dialogue && ui.dialogue.t > 0.12 && (In.pressed('confirm') || In.pressed('action') || click)) { advanceDialogue(); return true; }
        return false;
      case 'cutscene':
        if (In.pressed('pause')) { openPause('pause'); return true; }
        if (ui.dialogue && ui.dialogue.t > 0.12 && (In.pressed('confirm') || In.pressed('action') || click)) { advanceDialogue(); return true; }
        if (In.pressed('map')) { openPause('phone'); return true; }
        return true;
      case 'paused': {
        var pg = ui.pause;
        if (pg.page === 'credits') { if (In.pressed('confirm') || In.pressed('back') || In.pressed('pause')) endCredits(); else if (click) pointerTap(In.mouse.x, In.mouse.y); return true; }
        if (pg.page === 'controls') { if (In.pressed('back') || In.pressed('pause') || In.pressed('confirm')) pg.page = 'pause'; else if (click) pointerTap(In.mouse.x, In.mouse.y); return true; }
        if (pg.page === 'phone') {
          if (In.pressed('back') && !In.pressed('pause')) {   // Backspace: abort from the missions tab, otherwise close
            if (pg.tab === 1 && GTP.Missions && GTP.Missions.state && GTP.Missions.state.active) abortMission(); else closePause();
            return true;
          }
          if (In.pressed('map') || In.pressed('pause')) { closePause(); return true; }
          if (In.pressed('left')) { pg.tab = (pg.tab + PHONE_TABS.length - 1) % PHONE_TABS.length; pg.scroll = 0; }
          if (In.pressed('right')) { pg.tab = (pg.tab + 1) % PHONE_TABS.length; pg.scroll = 0; }
          if (In.down('forward')) pg.scroll = Math.max(0, pg.scroll - px(4));
          if (In.down('back') && !In.pressed('back')) pg.scroll += px(4);
          if (In.wheelDelta) pg.scroll = Math.max(0, pg.scroll + In.wheelDelta * 0.5);
          if (click) pointerTap(In.mouse.x, In.mouse.y);
          return true;
        }
        if (In.pressed('pause') || In.pressed('back')) { closePause(); return true; }
        if (In.pressed('map')) { pg.page = 'phone'; return true; }
        if (In.pressed('forward')) { pg.sel = (pg.sel - 1 + PAUSE_ITEMS.length) % PAUSE_ITEMS.length; sfx('ui', 0.2); }
        if (In.pressed('back')) { pg.sel = (pg.sel + 1) % PAUSE_ITEMS.length; sfx('ui', 0.2); }
        if (In.pressed('confirm')) pauseActivate(pg.sel);
        else if (click) pointerTap(In.mouse.x, In.mouse.y);
        return true;
      }
      case 'minigame':
        if (click) pointerTap(In.mouse.x, In.mouse.y);
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

  // --------------------------------------------------------------- state ----
  function onState(s, prev) {
    ui.prevState = prev; ui.state = s;
    var In = GTP.Input;
    if (s === 'title') { ui.title.page = 'menu'; ui.title.sel = 0; ui.dialogue = null; ui.toasts.length = 0; ui.banner = null; ui.card = null; endMinigame(); startAttract(); if (In) In.pointerLockWanted = false; }
    else if (prev === 'title') { stopAttract(); ui.money.shown = null; ui.wanted.last = 0; ui.statSnap = {}; }
    if (s === 'playing') { ui.sessionStarted = true; if (In) In.pointerLockWanted = true; if (ui.pause.page === 'credits' && ui.credits) ui.credits = null; }
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
      // letterbox
      var bar = Math.round(H * 0.08);
      ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
      var Ms = GTP.Missions, h = Ms && Ms.hud ? Ms.hud() : null;
      if (h && h.title) txt(ctx, h.title.toUpperCase(), W - safe.r, bar - px(10), { font: F(11, 'bold'), color: COL.gold, align: 'right', outline: false });
      return;
    }
    ui.hudTop = top;
    var stacked = ui.touch.visible && portrait;   // phone portrait: objective row first, then map left / weapon right
    drawBars(ctx, lx, top, portrait ? px(150) : px(210));
    drawMoney(ctx, rx, top + px(24));
    drawStars(ctx, rx, top + px(46));
    var oy = top + (portrait ? px(56) : px(2));
    ui.objBottom = drawObjective(ctx, oy);
    if (stacked) { drawWeapon(ctx, rx, ui.objBottom + px(6)); drawClock(ctx, rx, ui.objBottom + px(68)); }
    else { drawClock(ctx, rx, top + px(76)); drawWeapon(ctx, rx, top + px(86)); }
    drawMinimap(ctx);
    var m = minimapRect(), ty;
    if (stacked) ty = ui.chipBottom + px(8);
    else if (ui.touch.visible) ty = H - safe.b - px(26);
    else ty = m.y + m.s - px(26);
    if (!ui.dialogue) drawTicker(ctx, ty);
  }
  function draw(ctx, w, h) {
    if (!ctx) return;
    if (w && h && (w !== W || h !== H)) layout(w, h);
    ui.hit.length = 0;
    var g = game(); if (!g) return;
    var st = g.state;
    try {
      if (st === 'title') { drawTitle(ctx); drawToasts(ctx); return; }
      var p = player();
      var hudStates = st === 'playing' || st === 'cutscene' || st === 'paused';
      if (p && (st === 'playing' || st === 'cutscene')) {
        drawBarks(ctx);
        drawFxTexts(ctx);
        if (st === 'playing') { drawObjectiveArrow(ctx); drawAimOverlay(ctx); }
      }
      drawHurt(ctx);
      if (hudStates && (st !== 'paused' || ui.pause.page !== 'credits')) drawHUD(ctx);
      if (st === 'cutscene' || st === 'playing') drawDialogue(ctx);
      if (st === 'playing' || st === 'cutscene') { drawBanner(ctx); drawCard(ctx); }
      if (st === 'wasted' || st === 'busted') drawDeathCard(ctx);
      if (st === 'minigame') {
        ctx.fillStyle = 'rgba(6,7,13,0.55)'; ctx.fillRect(0, 0, W, H);
        if (ui.minigame && ui.minigame.obj) ui.minigame.obj.draw(ctx);
        else txt(ctx, 'MINIGAME', W / 2, H / 2, { font: F(36, '900', FONT_DISPLAY), color: COL.gold, align: 'center' });
      }
      if (st === 'paused') drawPause(ctx);
      if (ui.touch.visible) drawTouch(ctx);
      drawToasts(ctx);
      if (g.debugMode) {
        var s = g.debug.snapshot();
        txt(ctx, JSON.stringify(s.player) + ' ' + s.state + ' fps ' + s.fps + ' calls ' + s.render.calls, safe.l, H - safe.b - px(2), { font: F(10), color: 'rgba(255,255,255,0.85)', maxW: W - safe.l - safe.r });
      }
    } catch (e) { U.reportError(e, 'ui.draw'); }
  }

  // ----------------------------------------------------------------- API ----
  var UI = GTP.UI = {
    drawsBarks: true,
    minigames: { debate: debate, ratio: ratio },
    init: function () {
      if (ui.inited) return;
      ui.inited = true;
      var Rd = GTP.Render;
      layout(Rd ? Rd.width : W, Rd ? Rd.height : H);
      try { ui.touch.coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { ui.touch.coarse = false; }
      ui.touch.visible = ui.touch.coarse;
      try { if (localStorage.getItem('gtp.mute') === '1') setMuted(true); } catch (e) { /* storage may be blocked */ }
      var cv = Rd && Rd.hudCanvas;
      if (cv && !ui._bound) {
        ui._bound = true;
        cv.addEventListener('mousedown', function (e) { if (GTP.Audio && GTP.Audio.unlock) { try { GTP.Audio.unlock(); } catch (e2) { /* optional */ } } if (e.button !== 0) return; var pt = canvasPoint(e); if (menuState() || ui.dialogue) pointerTap(pt.x, pt.y); });
        window.addEventListener('keydown', function () { if (GTP.Audio && GTP.Audio.unlock) { try { GTP.Audio.unlock(); } catch (e2) { /* optional */ } } }, { passive: true });
      }
      var g = game();
      if (g && g.state === 'title') startAttract();
    },
    resize: function (w, h) { layout(w, h); },
    update: function (dt) {
      var g = game(); if (!g) return;
      ui.t += dt;
      try {
        if (ui.inputStep !== g.steps) handleInput(g.state);
        ui.inputStep = -1;
        if (g.state === 'title') { updateAttract(dt); return; }
        trackStats();
        updateMoney(dt); updateWanted(dt); updateCards(dt); updateDialogue(dt); updateTicker(dt);
        if (g.state === 'minigame' && ui.minigame && ui.minigame.obj) ui.minigame.obj.update(dt);
        if (g.state === 'paused' && ui.pause.page === 'credits') updateCredits(dt);
      } catch (e) { U.reportError(e, 'ui.update'); }
    },
    draw: draw,
    onState: onState,
    handleInput: function (state) { ui.inputStep = GTP.game ? GTP.game.steps : 0; return handleInput(state); },
    // mission hooks
    banner: banner, card: card, showDialogue: showDialogue, hideDialogue: hideDialogue, advanceDialogue: advanceDialogue,
    ticker: function (text) { ui.ticker.queue.unshift({ text: String(text || ''), tag: 'BREAKING', color: COL.red }); ui.ticker.forceT = 14; if (ui.ticker.cur && !ui.ticker.cur.nap) ui.ticker.cur.done = true; },
    startMinigame: startMinigame, endMinigame: endMinigame, credits: credits, toast: toast,
    bark: function (/* ped, text */) { },
    touch: { handle: handleTouch, show: function (on) { ui.touch.visible = on !== false; } },
    // helpers other modules / tests may use
    drawPortrait: drawPortrait, castPortrait: castPortrait, landmarkLabel: landmarkLabel, rozSign: rozSign, currentStation: currentStation,
    openPause: openPause, closePause: closePause, setMuted: setMuted, isMuted: function () { return ui.muted; },
    state: ui
  };
})();
