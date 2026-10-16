/* Grand Theft Pundit: 04_world.js
 * GTP.World: tile map generation from GTP.Content.world, districts, landmarks,
 * buildings, props, road lane field, collision and A* pathing.
 *
 * Tile arrays (w*h, row-major, index = ty*w + tx):
 *   tiles  : T.* enum
 *   meta   : bit flags (M.*): H/V road membership, class, crosswalk, shoulder, dock, path
 *   laneH  : (laneIndex << 4) | roadWidth for tiles that belong to a horizontal road
 *   laneV  : same for vertical roads
 *   zone   : district index + 1
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util;
  var TILE = C.TILE;

  var T = { VOID: 0, ROAD: 1, SIDEWALK: 2, BUILDING: 3, GRASS: 4, WATER: 5, SAND: 6, PARKING: 7, PLAZA: 8, BRIDGE: 9 };
  var M = { H: 1, V: 2, AVENUE: 4, HIGHWAY: 8, CROSSWALK: 16, SHOULDER: 32, DOCK: 64, PATH: 128 };
  var DIR_E = Object.freeze({ dx: 1, dy: 0 }), DIR_W = Object.freeze({ dx: -1, dy: 0 });
  var DIR_S = Object.freeze({ dx: 0, dy: 1 }), DIR_N = Object.freeze({ dx: 0, dy: -1 });
  var ROAD_W = { street: 2, avenue: 4, highway: 4 };

  // roof style per landmark kind (default: the kind itself)
  var KIND_ROOF = { embassy: 'stone', radio: 'office', terminal: 'office', yard: 'shack', house: 'house' };
  var KIND_HEIGHT = { tower: 34, hotel: 26, agency: 22, bank: 14, mall: 12, stadium: 16, police: 14, hospital: 16, capitol: 20, stone: 14, casino: 20, club: 12, studio: 14, diner: 6, gas: 6, garage: 8, brick: 12, house: 7, warehouse: 10, factory: 12, shack: 6, office: 12, mansion: 10, radio: 8, embassy: 12, yard: 5 };
  var KIND_COLOR = { tower: '#3a4160', hotel: '#5a4a6e', agency: '#1d2230', bank: '#cfc8b6', mall: '#7a7266', stadium: '#8a8f9a', police: '#2f3f66', hospital: '#e6e9ee', capitol: '#e3dcc8', stone: '#d6cfbd', casino: '#b02a7b', club: '#2a2a3a', studio: '#5c6170', diner: '#c8ced6', gas: '#d94040', garage: '#6d6f74', brick: '#8a4a3a', house: '#7a4f3a', warehouse: '#8b8c86', factory: '#7c7f85', shack: '#6f5a44', office: '#6a6150', mansion: '#b5643c', radio: '#6f7378', embassy: '#cfc6b0', yard: '#6f5a44' };

  var World = GTP.World = {
    T: T, M: M,
    w: 0, h: 0,
    tiles: null, meta: null, laneH: null, laneV: null, zone: null,
    districts: [], landmarks: [], buildings: [], props: [], lots: [], piers: [],
    _seed: null, _lm: {}, _roadTiles: [], _sidewalkTiles: [],

    // ------------------------------------------------------------ queries --
    idx: function (tx, ty) { return ty * World.w + tx; },
    inBounds: function (tx, ty) { return tx >= 0 && ty >= 0 && tx < World.w && ty < World.h; },
    tile: function (tx, ty) { return World.inBounds(tx, ty) ? World.tiles[ty * World.w + tx] : T.VOID; },
    metaAt: function (tx, ty) { return World.inBounds(tx, ty) ? World.meta[ty * World.w + tx] : 0; },
    tileAt: function (px, py) { return World.tile(Math.floor(px / TILE), Math.floor(py / TILE)); },
    isSolidTile: function (t) { return t === T.BUILDING || t === T.WATER || t === T.VOID; },
    solidAt: function (px, py) { return World.isSolidTile(World.tileAt(px, py)); },
    isRoadTile: function (t) { return t === T.ROAD || t === T.BRIDGE; },
    isIntersection: function (tx, ty) { var m = World.metaAt(tx, ty); return (m & M.H) !== 0 && (m & M.V) !== 0; },
    tileCenter: function (tx, ty) { return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }; },

    // Lane direction for traffic. At intersections prefers the wider road,
    // ties go to the horizontal road; pass prefAxis 'h'|'v' to choose.
    roadDir: function (px, py, prefAxis) {
      var tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      if (!World.inBounds(tx, ty)) return null;
      var i = ty * World.w + tx, t = World.tiles[i];
      if (t !== T.ROAD && t !== T.BRIDGE) return null;
      var h = World.laneH[i], v = World.laneV[i];
      var useH;
      if (h && v) {
        if (prefAxis === 'h') useH = true; else if (prefAxis === 'v') useH = false;
        else useH = (h & 15) >= (v & 15);
      } else useH = !!h;
      if (useH && h) return ((h >> 4) < (h & 15) / 2) ? DIR_W : DIR_E;
      if (v) return ((v >> 4) < (v & 15) / 2) ? DIR_S : DIR_N;
      return null;
    },
    // Center line of the lane containing the point, with its direction.
    laneCenter: function (px, py, prefAxis) {
      var d = World.roadDir(px, py, prefAxis);
      if (!d) return null;
      var tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      if (d.dy === 0) return { x: px, y: (ty + 0.5) * TILE, dx: d.dx, dy: 0 };
      return { x: (tx + 0.5) * TILE, y: py, dx: 0, dy: d.dy };
    },
    roadClass: function (tx, ty) {
      var m = World.metaAt(tx, ty);
      return (m & M.HIGHWAY) ? 'highway' : (m & M.AVENUE) ? 'avenue' : 'street';
    },

    landmark: function (id) { return World._lm[id] || null; },
    districtAt: function (px, py) {
      var tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      if (!World.inBounds(tx, ty)) return null;
      var z = World.zone[ty * World.w + tx];
      return z ? World.districts[z - 1] : null;
    },

    randomRoadPoint: function () {
      var i = GTP.rng.pick(World._roadTiles);
      return World.tileCenter(i % World.w, Math.floor(i / World.w));
    },
    randomSidewalkPoint: function () {
      var i = GTP.rng.pick(World._sidewalkTiles);
      return World.tileCenter(i % World.w, Math.floor(i / World.w));
    },
    nearestRoadPoint: function (px, py) {
      var tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      for (var r = 0; r < 24; r++) {
        for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          var t = World.tile(tx + dx, ty + dy);
          if (t === T.ROAD || t === T.BRIDGE) {
            var c = World.tileCenter(tx + dx, ty + dy);
            var l = World.laneCenter(c.x, c.y);
            return l ? { x: l.x, y: l.y, dx: l.dx, dy: l.dy } : c;
          }
        }
      }
      return null;
    },
    nearestTileOf: function (px, py, pred, maxR) {
      var tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      maxR = maxR || 24;
      for (var r = 0; r < maxR; r++) {
        for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (World.inBounds(tx + dx, ty + dy) && pred(World.tiles[(ty + dy) * World.w + tx + dx], tx + dx, ty + dy)) return { tx: tx + dx, ty: ty + dy };
        }
      }
      return null;
    },

    // Push a circle out of solid tiles. Returns {x,y,hitX,hitY}.
    resolveCircle: function (x, y, r) {
      var hitX = false, hitY = false, res = World._res;
      // center inside a solid tile (teleport, bad spawn): jump to the nearest open tile first
      if (World.solidAt(x, y)) {
        var open = World.nearestTileOf(x, y, function (tt) { return !World.isSolidTile(tt); }, 12);
        if (open) { x = (open.tx + 0.5) * TILE; y = (open.ty + 0.5) * TILE; hitX = hitY = true; }
      }
      for (var iter = 0; iter < 3; iter++) {
        var moved = false;
        var tx0 = Math.floor((x - r) / TILE), ty0 = Math.floor((y - r) / TILE);
        var tx1 = Math.floor((x + r) / TILE), ty1 = Math.floor((y + r) / TILE);
        for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
          if (!World.isSolidTile(World.tile(tx, ty))) continue;
          var rx = tx * TILE, ry = ty * TILE;
          var cx = x < rx ? rx : (x > rx + TILE ? rx + TILE : x);
          var cy = y < ry ? ry : (y > ry + TILE ? ry + TILE : y);
          var dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 < 1e-6) {
            // center inside the tile: exit along the shortest axis
            var lx = x - rx, rxd = rx + TILE - x, uy = y - ry, dyd = ry + TILE - y;
            var m = Math.min(lx, rxd, uy, dyd);
            if (m === lx) { x = rx - r; hitX = true; } else if (m === rxd) { x = rx + TILE + r; hitX = true; } else if (m === uy) { y = ry - r; hitY = true; } else { y = ry + TILE + r; hitY = true; }
          } else {
            var d = Math.sqrt(d2), push = r - d + 0.01;
            x += dx / d * push; y += dy / d * push;
            if (Math.abs(dx) > Math.abs(dy)) hitX = true; else hitY = true;
          }
          moved = true;
        }
        if (!moved) break;
      }
      res.x = x; res.y = y; res.hitX = hitX; res.hitY = hitY;
      return res;
    },
    _res: { x: 0, y: 0, hitX: false, hitY: false },

    // Bounded A* on the tile grid. mode 'car' sticks to roads, 'ped' avoids
    // roads. Returns [{x,y}] in px (tile centers, collinear points removed).
    findPath: function (ax, ay, bx, by, opts) {
      opts = opts || {};
      var mode = opts.mode || 'ped', w = World.w, h = World.h;
      var cost = mode === 'car' ? World._carCost : World._pedCost;
      var sx = Math.floor(ax / TILE), sy = Math.floor(ay / TILE), gx = Math.floor(bx / TILE), gy = Math.floor(by / TILE);
      var s = World._snap(sx, sy, cost), g = World._snap(gx, gy, cost);
      if (!s || !g) return null;
      sx = s.tx; sy = s.ty; gx = g.tx; gy = g.ty;
      var N = w * h, maxExp = opts.maxExpansions || 20000;
      var P = World._path;
      if (!P || P.g.length !== N) P = World._path = { g: new Float32Array(N), from: new Int32Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), gen: 0 };
      P.gen = (P.gen + 1) >>> 0; if (P.gen === 0) { P.stamp.fill(0); P.closed.fill(0); P.gen = 1; }
      var gen = P.gen, start = sy * w + sx, goal = gy * w + gx;
      var heap = new GTP.BinHeap(function (n) { return n.f; });
      P.g[start] = 0; P.stamp[start] = gen; P.from[start] = -1;
      heap.push({ i: start, g: 0, f: 0 });
      var expansions = 0, found = false, HMIN = 0.8; // smallest step cost keeps the heuristic admissible
      var dxs = [1, -1, 0, 0], dys = [0, 0, 1, -1];
      while (heap.size()) {
        var cur = heap.pop(), ci = cur.i;
        if (ci === goal) { found = true; break; }
        if (cur.g > P.g[ci] || P.closed[ci] === gen) continue; // stale duplicate
        P.closed[ci] = gen;
        if (++expansions > maxExp) break;
        var cx = ci % w, cy = (ci / w) | 0, cg = P.g[ci];
        for (var k = 0; k < 4; k++) {
          var nx = cx + dxs[k], ny = cy + dys[k];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          var ni = ny * w + nx, c = cost(ni);
          if (c <= 0) continue;
          var ng = cg + c;
          if (P.stamp[ni] === gen && P.g[ni] <= ng) continue;
          P.stamp[ni] = gen; P.g[ni] = ng; P.from[ni] = ci;
          var hh = (Math.abs(nx - gx) + Math.abs(ny - gy)) * HMIN;
          heap.push({ i: ni, g: P.g[ni], f: ng + hh }); // store the float32-rounded g so the stale check is exact
        }
      }
      World._pathStats = { expansions: expansions, found: found, heapLeft: heap.size(), start: start, goal: goal };
      if (!found) return null;
      var out = [], i = goal;
      while (i >= 0) { out.push(i); i = P.from[i]; }
      out.reverse();
      var pts = [];
      for (var j = 0; j < out.length; j++) {
        var tx = out[j] % w, ty = (out[j] / w) | 0;
        var p = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
        if (pts.length >= 2) {
          var a = pts[pts.length - 2], b = pts[pts.length - 1];
          if ((b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x) === 0) { pts[pts.length - 1] = p; continue; }
        }
        pts.push(p);
      }
      return pts;
    },
    _carCost: function (i) {
      var t = World.tiles[i];
      if (t === T.ROAD || t === T.BRIDGE) return (World.meta[i] & M.HIGHWAY) ? 0.8 : 1;
      if (t === T.PARKING) return 2;
      if (t === T.PLAZA) return 6;
      if (t === T.SIDEWALK) return 8;
      return 0;
    },
    _pedCost: function (i) {
      var t = World.tiles[i];
      if (t === T.SIDEWALK || t === T.PLAZA) return 1;
      if (t === T.GRASS || t === T.SAND || t === T.PARKING) return 1.4;
      if (t === T.ROAD) return (World.meta[i] & M.CROSSWALK) ? 1.2 : 3;
      if (t === T.BRIDGE) return 2;
      return 0;
    },
    _snap: function (tx, ty, cost) {
      if (World.inBounds(tx, ty) && cost(ty * World.w + tx) > 0) return { tx: tx, ty: ty };
      return World.nearestTileOf((tx + 0.5) * TILE, (ty + 0.5) * TILE, function (t, x, y) { return cost(y * World.w + x) > 0; }, 8);
    },

    // ----------------------------------------------------------- generate --
    generate: function (seed) {
      seed = seed | 0;
      if (World._seed === seed && World.tiles) return;
      var CW = GTP.Content.world, L = CW.layout;
      var w = World.w = L.w || C.MAP_W, h = World.h = L.h || C.MAP_H, N = w * h;
      var R = GTP.makeRng((U.hash('world') ^ seed) >>> 0);
      var tiles = World.tiles = new Uint8Array(N);
      var meta = World.meta = new Uint8Array(N);
      var laneH = World.laneH = new Uint8Array(N);
      var laneV = World.laneV = new Uint8Array(N);
      var zone = World.zone = new Uint8Array(N);
      var assigned = new Uint8Array(N);   // 1 = tile belongs to a landmark lot / building / zone
      var parkTile = new Uint8Array(N);   // 1 = park-type ground (keep grass, plant trees)
      World.buildings = []; World.props = []; World.lots = []; World.piers = []; World.landmarks = []; World._lm = {};
      World._seed = seed;

      function I(tx, ty) { return ty * w + tx; }
      function inB(tx, ty) { return tx >= 0 && ty >= 0 && tx < w && ty < h; }
      function fillRect(r, t) {
        for (var y = Math.max(0, r.y); y < Math.min(h, r.y + r.h); y++) for (var x = Math.max(0, r.x); x < Math.min(w, r.x + r.w); x++) tiles[I(x, y)] = t;
      }
      var baseT = L.base === 'sand' ? T.SAND : T.GRASS;
      tiles.fill(baseT);

      // 1. districts
      World.districts = (L.districts || []).map(function (d, i) {
        var dd = { id: d.id, name: d.name, x: d.x, y: d.y, w: d.w, h: d.h, style: d.style, tint: d.tint, px: d.x * TILE, py: d.y * TILE, pw: d.w * TILE, ph: d.h * TILE };
        for (var y = d.y; y < d.y + d.h; y++) for (var x = d.x; x < d.x + d.w; x++) if (inB(x, y)) zone[I(x, y)] = i + 1;
        return dd;
      });
      var styles = {};
      for (var sk in C.DISTRICT_STYLES) styles[sk] = C.DISTRICT_STYLES[sk];
      for (sk in (CW.districtStyles || {})) styles[sk] = Object.assign({}, styles[sk] || {}, CW.districtStyles[sk]);
      function styleAt(tx, ty) { var z = zone[I(tx, ty)]; var d = z ? World.districts[z - 1] : null; return (d && styles[d.style]) || styles.downtown; }

      // 2. water, sand
      (L.water || []).forEach(function (r) { fillRect(r, T.WATER); });
      (L.sand || []).forEach(function (r) { fillRect(r, T.SAND); });

      // 3. roads
      (L.roads || []).forEach(function (seg) {
        var width = ROAD_W[seg.cls] || 2;
        var lo = seg.at - (width >> 1), hi = lo + width - 1;
        var cls = seg.cls === 'highway' ? M.HIGHWAY : seg.cls === 'avenue' ? M.AVENUE : 0;
        for (var a = seg.from; a <= seg.to; a++) {
          for (var l = 0; l < width; l++) {
            var tx = seg.axis === 'h' ? a : lo + l, ty = seg.axis === 'h' ? lo + l : a;
            if (!inB(tx, ty)) continue;
            var i = I(tx, ty), t = tiles[i];
            if (t === T.WATER) { if (!seg.bridge) continue; tiles[i] = T.BRIDGE; }
            else if (t !== T.BRIDGE) tiles[i] = T.ROAD;
            meta[i] |= (seg.axis === 'h' ? M.H : M.V) | cls;
            if (seg.axis === 'h') laneH[i] = (l << 4) | width; else laneV[i] = (l << 4) | width;
            assigned[i] = 1;
          }
        }
        if (seg.cls === 'highway') {
          for (a = seg.from; a <= seg.to; a++) {
            var sides = [lo - 1, hi + 1];
            for (var s = 0; s < 2; s++) {
              tx = seg.axis === 'h' ? a : sides[s]; ty = seg.axis === 'h' ? sides[s] : a;
              if (!inB(tx, ty)) continue;
              i = I(tx, ty);
              if (tiles[i] === baseT || tiles[i] === T.SAND) { tiles[i] = T.SIDEWALK; meta[i] |= M.SHOULDER; assigned[i] = 1; }
            }
          }
        }
      });
      // outer corners of highway loops: grass with 2+ shoulder neighbours becomes shoulder
      for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
        var ii = I(x, y);
        if (tiles[ii] !== baseT) continue;
        var n = 0;
        if (meta[ii - 1] & M.SHOULDER) n++;
        if (meta[ii + 1] & M.SHOULDER) n++;
        if (meta[ii - w] & M.SHOULDER) n++;
        if (meta[ii + w] & M.SHOULDER) n++;
        if (n >= 2) { tiles[ii] = T.SIDEWALK; meta[ii] |= M.SHOULDER; assigned[ii] = 1; }
      }
      // crosswalks + stop lines: non-highway single-axis road tiles next to an intersection
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        ii = I(x, y);
        if (tiles[ii] !== T.ROAD || (meta[ii] & M.HIGHWAY)) continue;
        var m = meta[ii], isH = (m & M.H) && !(m & M.V), isV = (m & M.V) && !(m & M.H);
        if (isH && ((x > 0 && World._isX(meta[ii - 1])) || (x < w - 1 && World._isX(meta[ii + 1])))) meta[ii] |= M.CROSSWALK;
        if (isV && ((y > 0 && World._isX(meta[ii - w])) || (y < h - 1 && World._isX(meta[ii + w])))) meta[ii] |= M.CROSSWALK;
      }

      // 4. landmarks
      var LM = CW.landmarks || [];
      LM.forEach(function (def) {
        var lot = { x: def.block.bx, y: def.block.by, w: def.size.w, h: def.size.h };
        var lmk = { id: def.id, name: def.name, kind: def.kind, label: def.label || def.name, lot: lot, building: null,
          x: (lot.x + lot.w / 2) * TILE, y: (lot.y + lot.h / 2) * TILE, w: lot.w * TILE, h: lot.h * TILE, district: null };
        var d = World.districtAt(lmk.x, lmk.y); lmk.district = d ? d.id : null;
        World.landmarks.push(lmk); World._lm[def.id] = lmk;
        if (def.kind === 'bridge') return;
        var ground = def.ground || (def.kind === 'park' || def.kind === 'quad' ? 'grass' : def.kind === 'beach' ? 'sand' : 'plaza');
        var groundT = { plaza: T.PLAZA, grass: T.GRASS, parking: T.PARKING, sand: T.SAND, yard: T.PARKING }[ground] || T.PLAZA;
        for (var yy = lot.y; yy < lot.y + lot.h; yy++) for (var xx = lot.x; xx < lot.x + lot.w; xx++) {
          if (!inB(xx, yy)) continue;
          var i = I(xx, yy);
          if (tiles[i] === T.ROAD || tiles[i] === T.BRIDGE || tiles[i] === T.WATER || (meta[i] & M.SHOULDER)) continue;
          tiles[i] = groundT; assigned[i] = 1;
          if (ground === 'yard') meta[i] |= M.PATH; // concrete yard: no painted bays
          if (def.kind === 'park' || def.kind === 'quad') parkTile[i] = 1;
        }
        var fpw = def.footprint ? def.footprint.w : 0, fph = def.footprint ? def.footprint.h : 0;
        var bx = lot.x + Math.floor((lot.w - fpw) / 2), by = lot.y + Math.floor((lot.h - fph) / 2);
        switch (def.kind) {
          case 'park': case 'quad': World._makePark(lot, def.kind, R); break;
          case 'pier': World._makePier(lot, R); break;
          case 'beach': World._scatter(lot, 'umbrella', 0.05, R); break;
          case 'helipad': World.props.push({ type: 'helipad', x: lmk.x, y: lmk.y, r: Math.min(lot.w, lot.h) * TILE * 0.35 }); break;
          case 'docks': World._makeDocks(lot, R); break;
          case 'yard':
            World._scatter(lot, 'container', 0.18, R); World._scatter(lot, 'crate', 0.1, R);
            if (fpw) lmk.building = World._addBuilding(bx, by, fpw, fph, 'shack', lmk, R);
            break;
          case 'embassy': {
            var n = 3, gap = 1, bw = Math.floor((fpw - gap * (n - 1)) / n), b;
            for (var k = 0; k < n; k++) {
              b = World._addBuilding(bx + k * (bw + gap), by, bw, fph, 'stone', lmk, R);
              if (k === 0) lmk.building = b;
            }
            break;
          }
          case 'radio':
            lmk.building = World._addBuilding(bx, by, fpw, fph, 'office', lmk, R);
            World.props.push({ type: 'mast', x: lmk.x, y: lmk.y + fph * TILE, h: 60 });
            break;
          case 'gas':
            lmk.building = World._addBuilding(bx, by, fpw, fph, 'gas', lmk, R);
            World.props.push({ type: 'canopy', x: (bx + fpw / 2) * TILE, y: (by + fph + 2) * TILE, w: (fpw + 2) * TILE, h: 2 * TILE });
            break;
          case 'mansion':
            lmk.building = World._addBuilding(bx, by, fpw, fph, 'mansion', lmk, R);
            World.props.push({ type: 'pool', x: (bx + fpw / 2) * TILE, y: (by + fph + 1.6) * TILE, w: 2.4 * TILE, h: 1.4 * TILE });
            World._scatter(lot, 'tree', 0.12, R);
            break;
          default:
            if (fpw && fph) lmk.building = World._addBuilding(bx, by, fpw, fph, KIND_ROOF[def.kind] || def.kind, lmk, R);
            if (groundT === T.GRASS) World._scatter(lot, 'tree', 0.1, R);
        }
        if (lmk.building) { lmk.x = lmk.building.x + lmk.building.w / 2; lmk.y = lmk.building.y + lmk.building.h / 2; }
        // the marker point of a landmark must be walkable (a park center can sit in its pond)
        if (def.kind !== 'bridge' && World.isSolidTile(World.tileAt(lmk.x, lmk.y))) {
          var near = World.nearestTileOf(lmk.x, lmk.y, function (tt) { return !World.isSolidTile(tt); }, 12);
          if (near) { lmk.x = (near.tx + 0.5) * TILE; lmk.y = (near.ty + 0.5) * TILE; }
        }
      });

      // 5. sidewalks: base ground next to a road becomes sidewalk
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        ii = I(x, y);
        var t = tiles[ii];
        if (t !== baseT && t !== T.SAND) continue;
        if (parkTile[ii] && t === baseT) { /* parks keep a sidewalk ring too */ }
        var nb = (x > 0 && World.isRoadTile(tiles[ii - 1])) || (x < w - 1 && World.isRoadTile(tiles[ii + 1])) || (y > 0 && World.isRoadTile(tiles[ii - w])) || (y < h - 1 && World.isRoadTile(tiles[ii + w]));
        if (nb) { tiles[ii] = T.SIDEWALK; assigned[ii] = 1; }
      }

      // 6. blocks: pack buildings into remaining base-ground components
      var visited = new Uint8Array(N), stack = [];
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        ii = I(x, y);
        if (visited[ii] || assigned[ii] || tiles[ii] !== baseT) continue;
        // flood fill
        var comp = [], x0 = x, y0 = y, x1 = x, y1 = y;
        stack.length = 0; stack.push(ii); visited[ii] = 1;
        while (stack.length) {
          var ci = stack.pop(); comp.push(ci);
          var cx = ci % w, cy = (ci / w) | 0;
          if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
          var nbs = [ci - 1, ci + 1, ci - w, ci + w];
          for (var k = 0; k < 4; k++) {
            var ni = nbs[k];
            if (ni < 0 || ni >= N) continue;
            if (k === 0 && cx === 0) continue; if (k === 1 && cx === w - 1) continue;
            if (visited[ni] || assigned[ni] || tiles[ni] !== baseT) continue;
            visited[ni] = 1; stack.push(ni);
          }
        }
        if (comp.length < 4) continue;
        World._packBlock(comp, x0, y0, x1, y1, assigned, styleAt, R);
      }

      // 7. parking lots (connected PARKING components) for bay painting
      visited.fill(0);
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        ii = I(x, y);
        if (visited[ii] || tiles[ii] !== T.PARKING || (meta[ii] & M.PATH)) continue;
        x0 = x; y0 = y; x1 = x; y1 = y; stack.length = 0; stack.push(ii); visited[ii] = 1; var cnt = 0;
        while (stack.length) {
          ci = stack.pop(); cnt++;
          cx = ci % w; cy = (ci / w) | 0;
          if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
          nbs = [ci - 1, ci + 1, ci - w, ci + w];
          for (k = 0; k < 4; k++) {
            ni = nbs[k];
            if (ni < 0 || ni >= N) continue;
            if (k === 0 && cx === 0) continue; if (k === 1 && cx === w - 1) continue;
            if (visited[ni] || tiles[ni] !== T.PARKING || (meta[ni] & M.PATH)) continue;
            visited[ni] = 1; stack.push(ni);
          }
        }
        World.lots.push({ tx: x0, ty: y0, tw: x1 - x0 + 1, th: y1 - y0 + 1, x: x0 * TILE, y: y0 * TILE, w: (x1 - x0 + 1) * TILE, h: (y1 - y0 + 1) * TILE, count: cnt });
      }

      // 8. street furniture: lamps, hydrants, trees on grass, dumpsters in alleys
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        ii = I(x, y);
        t = tiles[ii];
        var st = styleAt(x, y);
        if (t === T.SIDEWALK && !(meta[ii] & M.SHOULDER)) {
          var rl = x > 0 && World.isRoadTile(tiles[ii - 1]), rr = x < w - 1 && World.isRoadTile(tiles[ii + 1]);
          var ru = y > 0 && World.isRoadTile(tiles[ii - w]), rd = y < h - 1 && World.isRoadTile(tiles[ii + w]);
          var hv = U.hash2(x, y, seed);
          if (st.lamps && ((x + y) % 5 === 0) && (rl || rr || ru || rd) && hv < 0.9) {
            var lx = (x + 0.5) * TILE, ly = (y + 0.5) * TILE;
            if (rl) lx -= 9; else if (rr) lx += 9; if (ru) ly -= 9; else if (rd) ly += 9;
            World.props.push({ type: 'lamp', x: lx, y: ly });
          } else if (hv > 0.975 && (rl || rr || ru || rd)) {
            World.props.push({ type: 'hydrant', x: (x + 0.5) * TILE + (rl ? -8 : rr ? 8 : 0), y: (y + 0.5) * TILE + (ru ? -8 : rd ? 8 : 0) });
          } else if (st.trees > 0.4 && hv > 0.82 && hv < 0.9 && (rl || rr || ru || rd)) {
            World.props.push({ type: 'tree', x: (x + 0.5) * TILE + (rl ? 7 : rr ? -7 : 0), y: (y + 0.5) * TILE + (ru ? 7 : rd ? -7 : 0), r: 9 + hv * 20 });
          }
        } else if (t === T.GRASS && !(meta[ii] & M.PATH)) {
          var p = parkTile[ii] ? 0.22 : st.trees * 0.28;
          var hv2 = U.hash2(x, y, seed + 7);
          if (hv2 < p) World.props.push({ type: 'tree', x: (x + 0.5) * TILE + (U.hash2(x, y, 3) - 0.5) * 14, y: (y + 0.5) * TILE + (U.hash2(x, y, 4) - 0.5) * 14, r: 9 + U.hash2(x, y, 5) * 7 });
          else if (parkTile[ii] && hv2 > 0.93) World.props.push({ type: 'bench', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, a: U.hash2(x, y, 6) < 0.5 ? 0 : Math.PI / 2 });
        } else if (t === T.PLAZA && !assigned[ii] && (st.remnant === 'plaza') && U.hash2(x, y, seed + 9) > 0.94) {
          World.props.push({ type: 'dumpster', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, a: U.hash2(x, y, 10) < 0.5 ? 0 : Math.PI / 2 });
        } else if (t === T.PARKING && (meta[ii] & M.PATH) && !assigned[ii] && U.hash2(x, y, seed + 11) > 0.9) {
          World.props.push({ type: 'container', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, a: U.hash2(x, y, 13) < 0.5 ? 0 : Math.PI / 2, color: U.hash2(x, y, 12) });
        }
      }

      // 9. road / sidewalk tile lists for spawning
      World._roadTiles = []; World._sidewalkTiles = [];
      for (var i2 = 0; i2 < N; i2++) {
        if (tiles[i2] === T.ROAD && !((meta[i2] & M.H) && (meta[i2] & M.V))) World._roadTiles.push(i2);
        else if (tiles[i2] === T.SIDEWALK && !(meta[i2] & M.SHOULDER)) World._sidewalkTiles.push(i2);
      }
      // keep buildings sorted by y for painter order
      World.buildings.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      if (GTP.Render && GTP.Render.invalidateAll) GTP.Render.invalidateAll();
    },
    _isX: function (m) { return (m & M.H) && (m & M.V); },

    _addBuilding: function (tx, ty, tw, th, roofStyle, lmk, R) {
      var tiles = World.tiles, w = World.w;
      for (var y = ty; y < ty + th; y++) for (var x = tx; x < tx + tw; x++) if (World.inBounds(x, y)) tiles[y * w + x] = T.BUILDING;
      var d = World.districtAt((tx + tw / 2) * TILE, (ty + th / 2) * TILE);
      var kind = lmk ? lmk.kind : null;
      var color = kind && KIND_COLOR[kind] ? KIND_COLOR[kind] : (KIND_COLOR[roofStyle] || '#666');
      var height = kind && KIND_HEIGHT[kind] ? KIND_HEIGHT[kind] : (KIND_HEIGHT[roofStyle] || 10);
      var b = { x: tx * TILE, y: ty * TILE, w: tw * TILE, h: th * TILE, tx: tx, ty: ty, tw: tw, th: th,
        roofStyle: roofStyle, kind: kind, height: height, color: color, landmark: lmk ? lmk.id : null,
        district: d ? d.id : null, seed: R.int(1, 1e9) };
      World.buildings.push(b);
      return b;
    },

    _splitLength: function (total, min, max, gap, R) {
      if (total < min) return total >= 2 ? [total] : [];
      var nMin = Math.ceil((total + gap) / (max + gap)), nMax = Math.floor((total + gap) / (min + gap));
      if (nMax < 1) return [total];
      if (nMin > nMax) nMin = nMax;
      var n = R.int(nMin, nMax);
      var segs = [], rem = total - (n * min + (n - 1) * gap);
      for (var i = 0; i < n; i++) segs.push(min);
      var guard = 0;
      while (rem > 0 && guard++ < 1000) {
        var k = R.int(0, n - 1);
        if (segs[k] < max) { segs[k]++; rem--; }
      }
      if (rem > 0) segs[n - 1] += rem; // absorb leftovers into the last lot
      return segs;
    },

    _packBlock: function (comp, x0, y0, x1, y1, assigned, styleAt, R) {
      var w = World.w, tiles = World.tiles, meta = World.meta;
      var st = styleAt(comp[0] % w, (comp[0] / w) | 0);
      var inComp = new Set(comp);
      var gap = R.chance(st.alleyChance) ? Math.max(1, st.gap) : st.gap;
      var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      var rows = World._splitLength(bh, st.lotH[0], st.lotH[1], gap, R);
      var roofKeys = Object.keys(st.roofMix);
      function pickRoof() {
        var r = R.random(), acc = 0;
        for (var i = 0; i < roofKeys.length; i++) { acc += st.roofMix[roofKeys[i]]; if (r < acc) return roofKeys[i]; }
        return roofKeys[0];
      }
      var pal = C.PAL.buildingRoofs[st.roof === 'house' ? 'suburb' : st.roof === 'tower' ? 'downtown' : st.roof === 'casino' ? 'strip' : st.roof === 'brick' ? 'campus' : st.roof === 'warehouse' ? 'industrial' : st.roof === 'stone' ? 'capitol' : st.roof === 'mansion' ? 'hills' : st.roof === 'shack' ? 'marina' : 'office'] || C.PAL.buildingRoofs.office;
      var y = y0;
      for (var r = 0; r < rows.length; r++) {
        var rh = rows[r];
        var cols = World._splitLength(bw, st.lotW[0], st.lotW[1], gap, R);
        var x = x0;
        for (var c = 0; c < cols.length; c++) {
          var cw = cols[c], ok = true;
          for (var yy = y; yy < y + rh && ok; yy++) for (var xx = x; xx < x + cw; xx++) {
            if (!inComp.has(yy * w + xx)) { ok = false; break; }
          }
          if (ok && R.random() > 0.04) {
            var roof = pickRoof();
            var b = World._addBuilding(x, y, cw, rh, roof, null, R);
            b.color = R.pick(pal);
            b.height = R.int(st.height[0], st.height[1]);
            if (roof === 'office') b.color = R.pick(C.PAL.buildingRoofs.office);
            if (roof === 'factory') b.color = R.pick(C.PAL.buildingRoofs.industrial);
            if (roof === 'mansion') World.props.push({ type: 'pool', x: (x + cw / 2) * TILE + (R.chance(0.5) ? cw * TILE * 0.5 + 24 : -cw * TILE * 0.5 - 24), y: (y + rh / 2) * TILE, w: 44, h: 30 });
            for (yy = y; yy < y + rh; yy++) for (xx = x; xx < x + cw; xx++) assigned[yy * w + xx] = 1;
          }
          x += cw + gap;
        }
        y += rh + gap;
      }
      // remnants: convert leftover base tiles in this component
      var rem = st.remnant;
      for (var i = 0; i < comp.length; i++) {
        var ci = comp[i];
        if (assigned[ci] || tiles[ci] === T.BUILDING) continue;
        if (rem === 'plaza') { tiles[ci] = T.PLAZA; }
        else if (rem === 'parking') { tiles[ci] = T.PARKING; }
        else if (rem === 'yard') { tiles[ci] = T.PARKING; meta[ci] |= M.PATH; }
        else if (rem === 'sand') { tiles[ci] = T.SAND; }
        else { meta[ci] &= ~M.PATH; }
      }
      // tiny parking slivers look wrong: 1-wide parking strips become plaza
      if (rem === 'parking') {
        for (i = 0; i < comp.length; i++) {
          ci = comp[i];
          if (tiles[ci] !== T.PARKING) continue;
          var cx = ci % w, cy = (ci / w) | 0;
          var horiz = (World.tile(cx - 1, cy) === T.PARKING) || (World.tile(cx + 1, cy) === T.PARKING);
          var vert = (World.tile(cx, cy - 1) === T.PARKING) || (World.tile(cx, cy + 1) === T.PARKING);
          if (!horiz || !vert) tiles[ci] = T.PLAZA;
        }
      }
    },

    _makePark: function (lot, kind, R) {
      var w = World.w, tiles = World.tiles, meta = World.meta;
      var cx = lot.x + (lot.w >> 1), cy = lot.y + (lot.h >> 1);
      // cross paths through the center + a ring one tile in from the edge for quads
      for (var x = lot.x; x < lot.x + lot.w; x++) { var i = cy * w + x; if (tiles[i] === T.GRASS) { tiles[i] = T.PLAZA; meta[i] |= M.PATH; } }
      for (var y = lot.y; y < lot.y + lot.h; y++) { i = y * w + cx; if (tiles[i] === T.GRASS) { tiles[i] = T.PLAZA; meta[i] |= M.PATH; } }
      if (kind === 'quad') {
        for (x = lot.x + 1; x < lot.x + lot.w - 1; x++) for (y = lot.y + 1; y < lot.y + lot.h - 1; y++) {
          if (x !== lot.x + 1 && x !== lot.x + lot.w - 2 && y !== lot.y + 1 && y !== lot.y + lot.h - 2) continue;
          i = y * w + x; if (tiles[i] === T.GRASS) { tiles[i] = T.PLAZA; meta[i] |= M.PATH; }
        }
      }
      World.props.push({ type: 'fountain', x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE, r: kind === 'quad' ? 22 : 18 });
      void R;
    },

    _makePier: function (lot, R) {
      var w = World.w, h = World.h, tiles = World.tiles, meta = World.meta;
      var shoreY = lot.y + lot.h; // first water row
      var n = Math.max(1, Math.floor(lot.w / 6));
      for (var k = 0; k < n; k++) {
        var px = lot.x + 2 + k * 6;
        if (px >= lot.x + lot.w - 1) break;
        var len = 6 + R.int(0, 3);
        var pier = { tx: px, ty: shoreY, len: len };
        for (var y = shoreY; y < Math.min(h, shoreY + len); y++) {
          var i = y * w + px;
          if (tiles[i] !== T.WATER) break;
          tiles[i] = T.PLAZA; meta[i] |= M.DOCK;
        }
        World.piers.push(pier);
        for (var b = 0; b < len - 1; b += 2 + R.int(0, 2)) {
          var side = R.chance(0.5) ? -1 : 1;
          World.props.push({ type: 'boat', x: (px + 0.5 + side * 1.0) * TILE, y: (shoreY + b + 1.2) * TILE, w: 22, h: 48 + R.int(0, 24), color: R.pick(['#f4f4f4', '#e8e2c8', '#2b4c7e', '#c94040', '#f0c050']) });
        }
      }
    },

    _makeDocks: function (lot, R) {
      World._scatter(lot, 'container', 0.22, R);
      World.props.push({ type: 'crane', x: (lot.x + lot.w * 0.3) * TILE, y: (lot.y + lot.h - 0.5) * TILE, len: 150 });
      World.props.push({ type: 'crane', x: (lot.x + lot.w * 0.7) * TILE, y: (lot.y + lot.h - 0.5) * TILE, len: 150 });
      var w = World.w, h = World.h, tiles = World.tiles, meta = World.meta;
      var shoreY = lot.y + lot.h;
      for (var k = 0; k < 2; k++) {
        var px = lot.x + 4 + k * 12;
        for (var y = shoreY; y < Math.min(h, shoreY + 5); y++) { var i = y * w + px; if (tiles[i] !== T.WATER) break; tiles[i] = T.PLAZA; meta[i] |= M.DOCK; }
        World.props.push({ type: 'boat', x: (px + 1.6) * TILE, y: (shoreY + 2) * TILE, w: 34, h: 110, color: '#7a7f88' });
      }
    },

    _scatter: function (lot, type, p, R) {
      var w = World.w, tiles = World.tiles;
      for (var y = lot.y; y < lot.y + lot.h; y++) for (var x = lot.x; x < lot.x + lot.w; x++) {
        if (!World.inBounds(x, y)) continue;
        var t = tiles[y * w + x];
        if (t === T.BUILDING || t === T.ROAD || t === T.WATER || t === T.SIDEWALK) continue;
        if (R.random() < p) {
          var pr = { type: type, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, a: R.chance(0.5) ? 0 : Math.PI / 2, color: R.random(), r: 9 + R.random() * 6 };
          World.props.push(pr);
        }
      }
    }
  };
})();
