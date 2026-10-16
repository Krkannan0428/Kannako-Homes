/* Grand Theft Pundit: 00_util.js
 * GTP.util, GTP.rng (seeded, deterministic), GTP.makeRng, GTP.Vec, GTP.SpatialHash.
 * Classic script. Everything attaches to window.GTP.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.errors = GTP.errors || [];
  GTP.VERSION = '0.1.0';

  // ---------------------------------------------------------------- rng ----
  // mulberry32: tiny, fast, good enough for an arcade game, fully seedable.
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    var r = {
      seed: function (n) { s = (n >>> 0) || 1; return r; },
      state: function () { return s; },
      setState: function (n) { s = n >>> 0; },
      random: function () {
        s = (s + 0x6D2B79F5) | 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      range: function (a, b) { return a + (b - a) * r.random(); },
      int: function (a, b) { return a + Math.floor(r.random() * (b - a + 1)); },
      pick: function (arr) { return arr.length ? arr[Math.floor(r.random() * arr.length)] : undefined; },
      chance: function (p) { return r.random() < p; },
      sign: function () { return r.random() < 0.5 ? -1 : 1; },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = Math.floor(r.random() * (i + 1));
          var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      },
      fork: function (salt) { return makeRng((s ^ Math.imul(salt | 0, 0x9E3779B1)) >>> 0); }
    };
    return r;
  }
  GTP.makeRng = makeRng;
  GTP.rng = makeRng(1);

  // --------------------------------------------------------------- util ----
  var TAU = Math.PI * 2;
  var util = GTP.util = {
    TAU: TAU,
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    smoothstep: function (t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); },
    dist: function (x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); },
    dist2: function (x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
    angleTo: function (x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },
    wrapAngle: function (a) {
      a = a % TAU;
      if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU;
      return a;
    },
    angleLerp: function (a, b, t) { return a + util.wrapAngle(b - a) * t; },
    angleDiff: function (a, b) { return util.wrapAngle(b - a); },
    sign: function (v) { return v > 0 ? 1 : (v < 0 ? -1 : 0); },
    // FNV-1a style string hash -> 32-bit unsigned int
    hash: function (str) {
      str = String(str);
      var h = 0x811c9dc5;
      for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    },
    // integer lattice hash for procedural texture decisions, returns [0,1)
    hash2: function (x, y, salt) {
      var h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((salt | 0) + 0x9e3779b9, 0x85ebca6b);
      h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
      return (h >>> 0) / 4294967296;
    },
    circleHit: function (ax, ay, ar, bx, by, br) {
      var dx = bx - ax, dy = by - ay, r = ar + br;
      return dx * dx + dy * dy < r * r;
    },
    aabbHit: function (ax, ay, aw, ah, bx, by, bw, bh) {
      return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    },
    pointInRect: function (px, py, x, y, w, h) { return px >= x && py >= y && px < x + w && py < y + h; },
    fmtMoney: function (n) {
      n = Math.round(n || 0);
      var neg = n < 0; n = Math.abs(n);
      var s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return (neg ? '-$' : '$') + s;
    },
    fmtClock: function (clock) {
      var h = Math.floor(clock) % 24, m = Math.floor((clock % 1) * 60);
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    },
    pad: function (n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; },
    now: function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); },
    // tiny color helpers for procedural art
    rgba: function (r, g, b, a) { return 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + (a == null ? 1 : a) + ')'; },
    hexToRgb: function (hex) {
      hex = String(hex).replace('#', '');
      if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      var n = parseInt(hex, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },
    shade: function (hex, amt) { // amt in [-1,1]: darken (<0) or lighten (>0)
      var c = util.hexToRgb(hex);
      for (var i = 0; i < 3; i++) {
        c[i] = amt < 0 ? c[i] * (1 + amt) : c[i] + (255 - c[i]) * amt;
        c[i] = util.clamp(Math.round(c[i]), 0, 255);
      }
      return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    },
    mix: function (hexA, hexB, t) {
      var a = util.hexToRgb(hexA), b = util.hexToRgb(hexB);
      return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
    },
    // push an error into GTP.errors without throwing
    reportError: function (e, where) {
      var msg = (e && e.message) ? e.message : String(e);
      GTP.errors.push({ time: Date.now(), where: where || '', message: msg, stack: e && e.stack ? String(e.stack) : '' });
      if (GTP.errors.length > 200) GTP.errors.shift();
      if (typeof console !== 'undefined' && console.error) console.error('[GTP]', where || '', e);
    }
  };

  // ---------------------------------------------------------------- Vec ----
  GTP.Vec = {
    len: function (x, y) { return Math.sqrt(x * x + y * y); },
    norm: function (x, y) { var l = Math.sqrt(x * x + y * y) || 1; return { x: x / l, y: y / l }; },
    dot: function (ax, ay, bx, by) { return ax * bx + ay * by; },
    cross: function (ax, ay, bx, by) { return ax * by - ay * bx; },
    rot: function (x, y, a) { var c = Math.cos(a), s = Math.sin(a); return { x: x * c - y * s, y: x * s + y * c }; },
    fromAngle: function (a, l) { l = l == null ? 1 : l; return { x: Math.cos(a) * l, y: Math.sin(a) * l }; }
  };

  // -------------------------------------------------------- SpatialHash ----
  // Uniform grid hash for entity queries. Entities need x, y, radius and get a
  // private _sh field storing the cells they were inserted into.
  function SpatialHash(cellSize) {
    this.cell = cellSize || 128;
    this.map = new Map();
    this._stamp = 1;
  }
  SpatialHash.prototype._key = function (cx, cy) { return cx * 73856093 ^ cy * 19349663; };
  SpatialHash.prototype._cellsFor = function (e) {
    var r = e.radius || 8, c = this.cell;
    var x0 = Math.floor((e.x - r) / c), y0 = Math.floor((e.y - r) / c);
    var x1 = Math.floor((e.x + r) / c), y1 = Math.floor((e.y + r) / c);
    var out = [];
    for (var cy = y0; cy <= y1; cy++) for (var cx = x0; cx <= x1; cx++) out.push(this._key(cx, cy));
    return out;
  };
  SpatialHash.prototype.insert = function (e) {
    var keys = this._cellsFor(e);
    e._sh = keys;
    for (var i = 0; i < keys.length; i++) {
      var b = this.map.get(keys[i]);
      if (!b) { b = []; this.map.set(keys[i], b); }
      b.push(e);
    }
  };
  SpatialHash.prototype.remove = function (e) {
    var keys = e._sh;
    if (!keys) return;
    for (var i = 0; i < keys.length; i++) {
      var b = this.map.get(keys[i]);
      if (!b) continue;
      var idx = b.indexOf(e);
      if (idx >= 0) { b[idx] = b[b.length - 1]; b.pop(); }
      if (!b.length) this.map.delete(keys[i]);
    }
    e._sh = null;
  };
  SpatialHash.prototype.update = function (e) {
    var keys = this._cellsFor(e), old = e._sh;
    if (old && old.length === keys.length) {
      var same = true;
      for (var i = 0; i < keys.length; i++) if (keys[i] !== old[i]) { same = false; break; }
      if (same) return;
    }
    this.remove(e);
    this.insert(e);
  };
  SpatialHash.prototype.query = function (x, y, r, out) {
    out = out || [];
    out.length = 0;
    var c = this.cell, stamp = ++this._stamp;
    var x0 = Math.floor((x - r) / c), y0 = Math.floor((y - r) / c);
    var x1 = Math.floor((x + r) / c), y1 = Math.floor((y + r) / c);
    for (var cy = y0; cy <= y1; cy++) for (var cx = x0; cx <= x1; cx++) {
      var b = this.map.get(this._key(cx, cy));
      if (!b) continue;
      for (var i = 0; i < b.length; i++) {
        var e = b[i];
        if (e._qs === stamp) continue;
        e._qs = stamp;
        var dx = e.x - x, dy = e.y - y, rr = r + (e.radius || 0);
        if (dx * dx + dy * dy <= rr * rr) out.push(e);
      }
    }
    return out;
  };
  SpatialHash.prototype.queryRect = function (x, y, w, h, out) {
    out = out || [];
    out.length = 0;
    var c = this.cell, stamp = ++this._stamp;
    var x0 = Math.floor(x / c), y0 = Math.floor(y / c), x1 = Math.floor((x + w) / c), y1 = Math.floor((y + h) / c);
    for (var cy = y0; cy <= y1; cy++) for (var cx = x0; cx <= x1; cx++) {
      var b = this.map.get(this._key(cx, cy));
      if (!b) continue;
      for (var i = 0; i < b.length; i++) {
        var e = b[i];
        if (e._qs === stamp) continue;
        e._qs = stamp;
        var r = e.radius || 0;
        if (e.x + r >= x && e.x - r <= x + w && e.y + r >= y && e.y - r <= y + h) out.push(e);
      }
    }
    return out;
  };
  SpatialHash.prototype.clear = function () { this.map.clear(); };
  GTP.SpatialHash = SpatialHash;

  // ------------------------------------------------------------- BinHeap ----
  // Minimal binary heap used by World.findPath (A*).
  function BinHeap(scoreFn) { this.items = []; this.score = scoreFn; }
  BinHeap.prototype.push = function (v) {
    var a = this.items, i = a.length; a.push(v);
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (this.score(a[p]) <= this.score(a[i])) break;
      var t = a[p]; a[p] = a[i]; a[i] = t; i = p;
    }
  };
  BinHeap.prototype.pop = function () {
    var a = this.items, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      var i = 0, n = a.length;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < n && this.score(a[l]) < this.score(a[m])) m = l;
        if (r < n && this.score(a[r]) < this.score(a[m])) m = r;
        if (m === i) break;
        var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };
  BinHeap.prototype.size = function () { return this.items.length; };
  GTP.BinHeap = BinHeap;
})();
