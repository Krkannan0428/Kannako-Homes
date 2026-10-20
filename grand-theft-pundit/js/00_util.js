/* Grand Theft Pundit: 00_util.js
 * GTP.util, GTP.rng (seeded, deterministic), GTP.makeRng, GTP.SpatialHash,
 * GTP.Events, GTP.BinHeap, GTP.GeoBuilder (merges quads/boxes into one
 * BufferGeometry: three r152 UMD ships no addons, so this is our merge helper).
 * Classic script. Everything attaches to window.GTP.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.errors = GTP.errors || [];
  GTP.VERSION = '0.2.0';

  // ---------------------------------------------------------------- rng ----
  // mulberry32: tiny, fast, fully seedable. Math.random is banned in js/.
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
    // frame-rate independent exponential smoothing toward b
    damp: function (a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); },
    smoothstep: function (t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); },
    dist2d: function (ax, az, bx, bz) { var dx = bx - ax, dz = bz - az; return Math.sqrt(dx * dx + dz * dz); },
    dist: function (ax, az, bx, bz) { var dx = bx - ax, dz = bz - az; return Math.sqrt(dx * dx + dz * dz); },
    dist2: function (ax, az, bx, bz) { var dx = bx - ax, dz = bz - az; return dx * dx + dz * dz; },
    wrapAngle: function (a) {
      a = a % TAU;
      if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU;
      return a;
    },
    angleLerp: function (a, b, t) { return a + util.wrapAngle(b - a) * t; },
    angleDamp: function (a, b, lambda, dt) { return a + util.wrapAngle(b - a) * (1 - Math.exp(-lambda * dt)); },
    angleDiff: function (a, b) { return util.wrapAngle(b - a); },
    // yaw 0 faces -z (north); yaw increases counter-clockwise seen from above (three.js rotation.y)
    yawToDir: function (yaw) { return { x: -Math.sin(yaw), z: -Math.cos(yaw) }; },
    dirToYaw: function (x, z) { return Math.atan2(-x, -z); },
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
    // integer lattice hash for procedural decisions, returns [0,1)
    hash2: function (x, y, salt) {
      var h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((salt | 0) + 0x9e3779b9, 0x85ebca6b);
      h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
      return (h >>> 0) / 4294967296;
    },
    hash3: function (x, y, z, salt) { return util.hash2(x, y, (z | 0) * 131 + (salt | 0)); },
    circleHit: function (ax, az, ar, bx, bz, br) {
      var dx = bx - ax, dz = bz - az, r = ar + br;
      return dx * dx + dz * dz < r * r;
    },
    aabbHit: function (ax, az, aw, ad, bx, bz, bw, bd) {
      return ax < bx + bw && ax + aw > bx && az < bz + bd && az + ad > bz;
    },
    pointInRect: function (px, pz, x, z, w, d) { return px >= x && pz >= z && px < x + w && pz < z + d; },
    // circle (cx,cz,r) vs axis-aligned box (ax,az,aw,ad): {hit, px, pz} push-out vector for the circle
    aabbCircle: function (ax, az, aw, ad, cx, cz, r) {
      var nx = cx < ax ? ax : (cx > ax + aw ? ax + aw : cx);
      var nz = cz < az ? az : (cz > az + ad ? az + ad : cz);
      var dx = cx - nx, dz = cz - nz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return { hit: false, px: 0, pz: 0 };
      if (d2 < 1e-9) {
        // center inside: exit along the shortest axis
        var l = cx - ax, rr = ax + aw - cx, u = cz - az, dd = az + ad - cz;
        var m = Math.min(l, rr, u, dd);
        if (m === l) return { hit: true, px: -(l + r), pz: 0 };
        if (m === rr) return { hit: true, px: rr + r, pz: 0 };
        if (m === u) return { hit: true, px: 0, pz: -(u + r) };
        return { hit: true, px: 0, pz: dd + r };
      }
      var d = Math.sqrt(d2), push = r - d + 0.001;
      return { hit: true, px: dx / d * push, pz: dz / d * push };
    },
    // ray vs AABB (slab test); returns t of entry or -1
    rayAabb: function (ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1, maxT) {
      var tmin = 0, tmax = maxT;
      var o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
      for (var i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return -1; continue; }
        var inv = 1 / d[i], t1 = (lo[i] - o[i]) * inv, t2 = (hi[i] - o[i]) * inv;
        if (t1 > t2) { var tt = t1; t1 = t2; t2 = tt; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
      return tmin;
    },
    fmtMoney: function (n) {
      n = Math.round(n || 0);
      var neg = n < 0; n = Math.abs(n);
      var s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return (neg ? '-$' : '$') + s;
    },
    fmtTime: function (s) {
      s = Math.max(0, Math.floor(s || 0));
      var m = Math.floor(s / 60), r = s % 60;
      return m + ':' + (r < 10 ? '0' : '') + r;
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
    hexToInt: function (hex) { hex = String(hex).replace('#', ''); if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]; return parseInt(hex, 16); },
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

  // ------------------------------------------------------------- Events ----
  var listeners = {};
  GTP.Events = {
    on: function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); return fn; },
    off: function (name, fn) { var l = listeners[name]; if (!l) return; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit: function (name, payload) {
      var l = listeners[name]; if (!l) return;
      for (var i = 0; i < l.length; i++) { try { l[i](payload); } catch (e) { util.reportError(e, 'event:' + name); } }
    },
    clear: function () { listeners = {}; }
  };

  // -------------------------------------------------------- SpatialHash ----
  // Uniform grid hash on XZ. Entities need x, z, radius; get a private _sh field.
  function SpatialHash(cellSize) {
    this.cell = cellSize || 16;
    this.map = new Map();
    this._stamp = 1;
  }
  SpatialHash.prototype._key = function (cx, cz) { return cx * 73856093 ^ cz * 19349663; };
  SpatialHash.prototype._cellsFor = function (e) {
    var r = e.radius || 0.5, c = this.cell;
    var x0 = Math.floor((e.x - r) / c), z0 = Math.floor((e.z - r) / c);
    var x1 = Math.floor((e.x + r) / c), z1 = Math.floor((e.z + r) / c);
    var out = [];
    for (var cz = z0; cz <= z1; cz++) for (var cx = x0; cx <= x1; cx++) out.push(this._key(cx, cz));
    return out;
  };
  SpatialHash.prototype.insert = function (e) {
    var keys = this._cellsFor(e);
    e._sh = keys; e._shR = null;   // update() re-derives the cached cell range
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
  // called for every moving entity every step: the cell range is compared first, so an entity that stays in its cells
  // (nearly always, with 16 m cells) costs four floors and no allocation
  SpatialHash.prototype.update = function (e) {
    var r = e.radius || 0.5, c = this.cell;
    var x0 = Math.floor((e.x - r) / c), z0 = Math.floor((e.z - r) / c), x1 = Math.floor((e.x + r) / c), z1 = Math.floor((e.z + r) / c);
    if (e._sh && e._shR === this && e._shx0 === x0 && e._shz0 === z0 && e._shx1 === x1 && e._shz1 === z1) return;
    this.remove(e);
    this.insert(e);
    e._shR = this; e._shx0 = x0; e._shz0 = z0; e._shx1 = x1; e._shz1 = z1;
  };
  SpatialHash.prototype.query = function (x, z, r, out) {
    out = out || [];
    out.length = 0;
    var c = this.cell, stamp = ++this._stamp;
    var x0 = Math.floor((x - r) / c), z0 = Math.floor((z - r) / c);
    var x1 = Math.floor((x + r) / c), z1 = Math.floor((z + r) / c);
    for (var cz = z0; cz <= z1; cz++) for (var cx = x0; cx <= x1; cx++) {
      var b = this.map.get(this._key(cx, cz));
      if (!b) continue;
      for (var i = 0; i < b.length; i++) {
        var e = b[i];
        if (e._qs === stamp) continue;
        e._qs = stamp;
        var dx = e.x - x, dz = e.z - z, rr = r + (e.radius || 0);
        if (dx * dx + dz * dz <= rr * rr) out.push(e);
      }
    }
    return out;
  };
  SpatialHash.prototype.clear = function () { this.map.clear(); };
  GTP.SpatialHash = SpatialHash;

  // ------------------------------------------------------------- BinHeap ----
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

  // ---------------------------------------------------------- GeoBuilder ----
  // Accumulates triangles (position, normal, uv, optional color) and builds
  // one indexed THREE.BufferGeometry. Used for chunk meshes and prop shapes.
  function GeoBuilder(opts) {
    opts = opts || {};
    this.useColor = !!opts.color;
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
    this.n = 0;
  }
  GeoBuilder.prototype.vertex = function (x, y, z, nx, ny, nz, u, v, c) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v);
    if (this.useColor) { c = c || GeoBuilder.WHITE; this.col.push(c[0], c[1], c[2]); }
    return this.n++;
  };
  GeoBuilder.WHITE = [1, 1, 1];
  // quad from 4 corners (counter-clockwise seen from the front), uv list [[u,v] x4], color [r,g,b].
  // The face normal comes from (b - a) x (d - a); when a corner pair coincides (a sphere's pole row, a cone's tip) the
  // other diagonal pair is used, so a degenerate quad never carries a zero normal (NaN lighting: black facets, and the
  // bloom chain spreads a NaN across the frame).
  GeoBuilder.prototype.quad = function (a, b, c, d, uvs, color) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    var vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    var l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-9) {   // a == b or a == d: the triangle (b, c, d) still spans the face
      ux = c[0] - b[0]; uy = c[1] - b[1]; uz = c[2] - b[2];
      vx = d[0] - b[0]; vy = d[1] - b[1]; vz = d[2] - b[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
      l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l < 1e-9) {   // b == c (or c == d): the triangle (a, c, d) or (a, b, c)
        ux = c[0] - a[0]; uy = c[1] - a[1]; uz = c[2] - a[2];
        vx = d[0] - a[0]; vy = d[1] - a[1]; vz = d[2] - a[2];
        nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
        l = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (l < 1e-9) { vx = b[0] - a[0]; vy = b[1] - a[1]; vz = b[2] - a[2]; nx = vy * uz - vz * uy; ny = vz * ux - vx * uz; nz = vx * uy - vy * ux; l = Math.sqrt(nx * nx + ny * ny + nz * nz); }
      }
    }
    if (l < 1e-9) { nx = 0; ny = 1; nz = 0; l = 1; }
    nx /= l; ny /= l; nz /= l;
    uvs = uvs || GeoBuilder.UV0;
    var i0 = this.vertex(a[0], a[1], a[2], nx, ny, nz, uvs[0][0], uvs[0][1], color);
    var i1 = this.vertex(b[0], b[1], b[2], nx, ny, nz, uvs[1][0], uvs[1][1], color);
    var i2 = this.vertex(c[0], c[1], c[2], nx, ny, nz, uvs[2][0], uvs[2][1], color);
    var i3 = this.vertex(d[0], d[1], d[2], nx, ny, nz, uvs[3][0], uvs[3][1], color);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  };
  GeoBuilder.UV0 = [[0, 0], [1, 0], [1, 1], [0, 1]];
  // axis-aligned box: min corner (x,y,z), size (w,h,d). uvFn(face) -> uvs or null; color per box or per face via colorFn
  GeoBuilder.prototype.box = function (x, y, z, w, h, d, uvs, color, faces) {
    var x1 = x + w, y1 = y + h, z1 = z + d;
    var f = faces || GeoBuilder.ALL_FACES;
    var u = typeof uvs === 'function' ? uvs : function () { return uvs; };
    var c = typeof color === 'function' ? color : function () { return color; };
    if (f.top) this.quad([x, y1, z1], [x1, y1, z1], [x1, y1, z], [x, y1, z], u('top'), c('top'));
    if (f.bottom) this.quad([x, y, z], [x1, y, z], [x1, y, z1], [x, y, z1], u('bottom'), c('bottom'));
    if (f.north) this.quad([x1, y, z], [x, y, z], [x, y1, z], [x1, y1, z], u('north'), c('north'));   // faces -z
    if (f.south) this.quad([x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1], u('south'), c('south')); // faces +z
    if (f.west) this.quad([x, y, z], [x, y, z1], [x, y1, z1], [x, y1, z], u('west'), c('west'));      // faces -x
    if (f.east) this.quad([x1, y, z1], [x1, y, z], [x1, y1, z], [x1, y1, z1], u('east'), c('east'));   // faces +x
  };
  GeoBuilder.ALL_FACES = { top: 1, bottom: 1, north: 1, south: 1, west: 1, east: 1 };
  GeoBuilder.NO_BOTTOM = { top: 1, bottom: 0, north: 1, south: 1, west: 1, east: 1 };
  // vertical cylinder (low poly), centered at (x, z) from y to y+h
  GeoBuilder.prototype.cylinder = function (x, y, z, r0, r1, h, segs, color, uvs, caps) {
    segs = segs || 8;
    var i, a0, a1, c0, s0, c1, s1;
    uvs = uvs || GeoBuilder.UV0;
    for (i = 0; i < segs; i++) {
      a0 = i / segs * TAU; a1 = (i + 1) / segs * TAU;
      c0 = Math.cos(a0); s0 = Math.sin(a0); c1 = Math.cos(a1); s1 = Math.sin(a1);
      this.quad([x + c0 * r0, y, z + s0 * r0], [x + c0 * r1, y + h, z + s0 * r1], [x + c1 * r1, y + h, z + s1 * r1], [x + c1 * r0, y, z + s1 * r0], uvs, color);
    }
    if (caps !== false && r1 > 0.001) {
      // top cap as a fan of quads (two tris each, degenerate-safe)
      for (i = 0; i < segs; i++) {
        a0 = i / segs * TAU; a1 = (i + 1) / segs * TAU;
        var ax = x + Math.cos(a0) * r1, az = z + Math.sin(a0) * r1, bx = x + Math.cos(a1) * r1, bz = z + Math.sin(a1) * r1;
        var i0 = this.vertex(x, y + h, z, 0, 1, 0, uvs[0][0], uvs[0][1], color);
        var i1 = this.vertex(ax, y + h, az, 0, 1, 0, uvs[1][0], uvs[1][1], color);
        var i2 = this.vertex(bx, y + h, bz, 0, 1, 0, uvs[2][0], uvs[2][1], color);
        this.idx.push(i0, i2, i1);
      }
    }
  };
  // low poly sphere/blob centered (x,y,z)
  GeoBuilder.prototype.sphere = function (x, y, z, r, segs, rings, color, uvs, squash) {
    segs = segs || 7; rings = rings || 4; squash = squash || 1;
    uvs = uvs || GeoBuilder.UV0;
    for (var j = 0; j < rings; j++) {
      var p0 = -Math.PI / 2 + j / rings * Math.PI, p1 = -Math.PI / 2 + (j + 1) / rings * Math.PI;
      var y0 = Math.sin(p0) * r * squash, y1 = Math.sin(p1) * r * squash, r0 = Math.cos(p0) * r, r1 = Math.cos(p1) * r;
      for (var i = 0; i < segs; i++) {
        var a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU;
        var c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        this.quad([x + c0 * r0, y + y0, z + s0 * r0], [x + c1 * r0, y + y0, z + s1 * r0], [x + c1 * r1, y + y1, z + s1 * r1], [x + c0 * r1, y + y1, z + s0 * r1], uvs, color);
      }
    }
  };
  GeoBuilder.prototype.count = function () { return this.idx.length / 3; };
  GeoBuilder.prototype.build = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.useColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  };
  // Merge a list of BufferGeometries (same attribute set) by concatenation.
  GeoBuilder.merge = function (geos) {
    var names = ['position', 'normal', 'uv', 'color'], attrs = {}, idx = [], base = 0, i, j;
    for (j = 0; j < names.length; j++) attrs[names[j]] = [];
    for (i = 0; i < geos.length; i++) {
      var g = geos[i], count = g.getAttribute('position').count;
      for (j = 0; j < names.length; j++) {
        var a = g.getAttribute(names[j]);
        if (a) for (var k = 0; k < a.array.length; k++) attrs[names[j]].push(a.array[k]);
      }
      var ix = g.getIndex();
      if (ix) for (k = 0; k < ix.count; k++) idx.push(ix.getX(k) + base);
      else for (k = 0; k < count; k++) idx.push(k + base);
      base += count;
    }
    var out = new THREE.BufferGeometry();
    for (j = 0; j < names.length; j++) if (attrs[names[j]].length) out.setAttribute(names[j], new THREE.Float32BufferAttribute(attrs[names[j]], names[j] === 'uv' ? 2 : 3));
    out.setIndex(base > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  };
  GTP.GeoBuilder = GeoBuilder;
})();
