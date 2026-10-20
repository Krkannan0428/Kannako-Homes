/* Grand Theft Pundit: 04_world.js
 * GTP.World: tile map generated from GTP.Content.world, height layers (ground,
 * ramps, the elevated Loop deck), districts, landmarks with door points,
 * buildings, props, the lane direction field, collision and A* pathing.
 *
 * Layers (w*h, row-major, index = tz*w + tx):
 *   tiles  : T.* ground layer. RAMP tiles are solid wedges whose top is rampY.
 *   deck   : 0 or T.HIGHWAY: the Loop deck 7 m above the ground tile
 *   meta   : M.* flags for the ground layer (road axes, class, crosswalks, ...)
 *   dmeta  : M.* flags for the deck layer
 *   laneH/laneV, dlaneH/dlaneV : (laneIndex << 4) | roadWidth per axis per layer
 *   rampY  : ramp top height at the tile center (RAMP tiles only)
 *   zone   : district index + 1
 *   bidx   : building index + 1 for BUILDING tiles
 *   roadId : road segment index + 1 (street names)
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util;
  var TILE = C.TILE, CURB = C.CURB_H, DECK_Y = C.DECK_Y, WATER_Y = C.WATER_Y;

  var T = { VOID: 0, ROAD: 1, SIDEWALK: 2, BUILDING: 3, GRASS: 4, WATER: 5, SAND: 6, PARKING: 7, PLAZA: 8, BRIDGE: 9, RAMP: 10, HIGHWAY: 11 };
  // RUNWAY: the drivable runway strip (a PARKING tile with its own atlas texture; never in the lane field, never a parking bay).
  // LOWER (deck layer only): the Lower Loop's legs, for the street chip.
  var M = { H: 1, V: 2, AVENUE: 4, CROSSWALK: 8, SHOULDER: 16, DOCK: 32, PATH: 64, YARD: 128, WALKWAY: 256, CORRIDOR: 512, LAWN: 1024, DEAD: 2048, LOT: 4096, RUNWAY: 8192, LOWER: 16384 };
  var ROAD_W = { street: 2, avenue: 4, highway: 4 };
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var HEADING_YAW = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
  var STUNT_LEN = 6, STUNT_W = 3.2, STUNT_H = 1.3;   // GDD_EXPANSION §5.7: the striped wedge

  // Default floors / facade per landmark kind when the content entry does not say.
  var KIND_FLOORS = { tower: 18, hotel: 6, bank: 7, mall: 2, stadium: 5, police: 4, hospital: 6, capitol: 4, hq: 4, club: 3, studio: 3, diner: 1, gas: 1, garage: 1, warehouse: 2, mansion: 3, embassy: 3, terminal: 2, atc: 11, hangar: 2, ferry: 1, gunshop: 1, museum: 3 };
  var KIND_FACADE = { tower: 'downtown', hotel: 'marina', bank: 'capitol', mall: 'strip', stadium: 'stadium', police: 'police', hospital: 'hospital', capitol: 'capitol', hq: 'capitol', club: 'strip', studio: 'downtown', diner: 'marina', gas: 'strip', garage: 'industrial', warehouse: 'industrial', mansion: 'mansion', embassy: 'capitol', terminal: 'airport', atc: 'airport', hangar: 'port', ferry: 'marina', gunshop: 'strip', museum: 'capitol' };
  // loading-screen stages this module reports (GDD_EXPANSION §6.1): bar = the absolute share of the loading bar at the stage's start
  var STAGES = { tiles: { label: 'Paving Grievance City', bar: 0.10 }, roads: { label: 'Painting lanes, elevating the Loop', bar: 0.25 }, landmarks: { label: 'Renaming things after the President', bar: 0.35 }, props: { label: 'Setting up folding tables', bar: 0.50 }, done: { label: 'City generated', bar: 0.60 } };

  var World = GTP.World = {
    T: T, M: M,
    w: 0, h: 0,
    tiles: null, deck: null, meta: null, dmeta: null, laneH: null, laneV: null, dlaneH: null, dlaneV: null,
    rampY: null, zone: null, bidx: null, roadId: null,
    districts: [], landmarks: [], buildings: [], props: [], ramps: [], piers: [], roads: [], lots: [], stuntRamps: [], parks: [], promenades: [],
    bounds: { x0: 0, z0: 0, x1: 0, z1: 0 },
    loopName: 'The Loop', lowerLoopName: 'The Lower Loop', generateMs: 0,
    _seed: null, _lm: {}, _roadTiles: [], _sidewalkTiles: [], _propGrid: null, _propTile: null, _wedges: null, _wedgeTile: null, _stamp: 1,

    // ------------------------------------------------------------ queries --
    tileIndex: function (tx, tz) { return tz * World.w + tx; },
    inBounds: function (tx, tz) { return tx >= 0 && tz >= 0 && tx < World.w && tz < World.h; },
    tile: function (tx, tz) { return World.inBounds(tx, tz) ? World.tiles[tz * World.w + tx] : T.VOID; },
    deckAt: function (tx, tz) { return World.inBounds(tx, tz) ? World.deck[tz * World.w + tx] : 0; },
    metaAt: function (tx, tz) { return World.inBounds(tx, tz) ? World.meta[tz * World.w + tx] : 0; },
    tileAt: function (x, z) { return World.tile(Math.floor(x / TILE), Math.floor(z / TILE)); },
    tileCenter: function (tx, tz) { return { x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE }; },
    isRoadTile: function (t) { return t === T.ROAD || t === T.BRIDGE || t === T.RAMP; },
    isIntersection: function (tx, tz) { var m = World.metaAt(tx, tz); return (m & M.H) !== 0 && (m & M.V) !== 0; },
    isWalkable: function (t) { return t === T.SIDEWALK || t === T.PLAZA || t === T.GRASS || t === T.SAND || t === T.PARKING || t === T.ROAD || t === T.BRIDGE || t === T.RAMP; },

    // ground surface height of a tile type (ramps and water handled by heightAt)
    groundY: function (t) {
      if (t === T.WATER || t === T.VOID) return WATER_Y;
      if (t === T.ROAD || t === T.BRIDGE || t === T.PARKING || t === T.SAND) return 0;
      return CURB;
    },
    // continuous ramp height at (x,z) in meters (0..DECK_Y); 0 off ramps
    rampHeight: function (x, z) {
      var tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
      if (!World.inBounds(tx, tz) || World.tiles[tz * World.w + tx] !== T.RAMP) return 0;
      for (var i = 0; i < World.ramps.length; i++) {
        var r = World.ramps[i];
        if (x < r.x0 || x >= r.x1 || z < r.z0 || z >= r.z1) continue;
        var a = r.axis === 'h' ? x : z;
        var t = (a - r.a0) / (r.a1 - r.a0);
        return DECK_Y * U.clamp(t, 0, 1);
      }
      return World.rampY[tz * World.w + tx];
    },
    // surface height under (x,z): the layer nearest at/below yHint + 0.6
    heightAt: function (x, z, yHint) {
      var tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
      if (!World.inBounds(tx, tz)) return WATER_Y;
      var i = tz * World.w + tx, t = World.tiles[i];
      if (yHint == null) yHint = 0;
      if (World._wedgeTile && World._wedgeTile[i]) { var wy = World._wedgeAt(i, x, z, yHint); if (wy != null) return wy; }   // a byte test first: heightAt runs ~800 times a step
      if (World.deck[i] && yHint + 0.6 >= DECK_Y) return DECK_Y;
      if (t === T.RAMP) return World.rampHeight(x, z);
      return World.groundY(t);
    },
    // a stunt ramp wedge (ramp_prop) under (x, z): its sloped top, or null. The wedge rises along its heading
    // from the back (base height) to the front (base + 1.3 m); a mover below the wedge's base (under the deck) ignores it.
    _wedgeAt: function (i, x, z, yHint) {
      var list = World._wedges.get(i); if (!list) return null;
      for (var k = 0; k < list.length; k++) {
        var p = list[k];
        if (yHint + 0.6 < p.y) continue;
        var dx = x - p.x, dz = z - p.z, along = dx * p.fx + dz * p.fz, across = -dx * p.fz + dz * p.fx;
        if (across < -p.w / 2 || across > p.w / 2 || along < -p.len / 2 || along > p.len / 2) continue;
        return p.y + p.h * (along + p.len / 2) / p.len;
      }
      return null;
    },
    surfaces: function (tx, tz) {
      if (!World.inBounds(tx, tz)) return [{ y: WATER_Y, kind: 'water' }];
      var i = tz * World.w + tx, t = World.tiles[i], out = [];
      if (t === T.RAMP) out.push({ y: World.rampY[i], kind: 'ramp' });
      else out.push({ y: World.groundY(t), kind: t === T.WATER ? 'water' : 'ground' });
      if (World.deck[i]) out.push({ y: DECK_Y, kind: 'deck' });
      return out;
    },
    // blocks movement at that height: building volumes, ramp wedges, the void
    solidAt: function (x, z, y) {
      var tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
      if (!World.inBounds(tx, tz)) return true;
      var i = tz * World.w + tx, t = World.tiles[i];
      if (y == null) y = 0;
      if (t === T.BUILDING) { var b = World.buildings[World.bidx[i] - 1]; return !b || y < b.y + b.h; }
      if (t === T.RAMP) return y < World.rampHeight(x, z) - 0.3;
      if (World.deck[i] && y > DECK_Y - C.DECK_THICK - 0.05 && y < DECK_Y - 0.05) return true;
      return false;
    },

    // Lane direction field. Picks the deck layer when y says so (or the point is on a ramp).
    // Returns {dx, dz, lane, width, deck, cx, cz, laneCenterOffset} or null off road.
    roadDir: function (x, z, y, prefAxis) {
      var tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
      if (!World.inBounds(tx, tz)) return null;
      var i = tz * World.w + tx, t = World.tiles[i];
      var onDeck = !!World.deck[i] && t !== T.RAMP && (y == null ? false : y > DECK_Y - 2.5);
      var h, v, m;
      if (onDeck) { h = World.dlaneH[i]; v = World.dlaneV[i]; m = World.dmeta[i]; }
      else {
        if (t !== T.ROAD && t !== T.BRIDGE && t !== T.RAMP) return null;
        h = World.laneH[i]; v = World.laneV[i]; m = World.meta[i];
      }
      var useH;
      if (h && v) {
        if (prefAxis === 'h') useH = true; else if (prefAxis === 'v') useH = false;
        else useH = (h & 15) >= (v & 15);
      } else useH = !!h;
      if (!h && !v) return null;
      var lane, width, dx, dz, cx, cz, off;
      if (useH) {
        lane = h >> 4; width = h & 15; dx = lane < width / 2 ? -1 : 1; dz = 0;
        cx = x; cz = (tz + 0.5) * TILE;
        off = (z - cz) * dx;             // positive to the right of travel (right of eastbound is south)
      } else {
        lane = v >> 4; width = v & 15; dx = 0; dz = lane < width / 2 ? 1 : -1;
        cx = (tx + 0.5) * TILE; cz = z;
        off = (cx - x) * dz;             // right of southbound is west
      }
      return { dx: dx, dz: dz, lane: lane, width: width, deck: onDeck, cx: cx, cz: cz, laneCenterOffset: off, intersection: !!(m & M.H) && !!(m & M.V) };
    },
    roadClass: function (tx, tz) {
      var m = World.metaAt(tx, tz);
      return (m & M.AVENUE) ? 'avenue' : 'street';
    },
    // traffic signal phase at an intersection: 'ns' (north-south green) or 'ew'
    signalPhase: function (tx, tz, t) {
      var i = World.inBounds(tx, tz) ? tz * World.w + tx : 0;
      var ox = tx - (World.laneV[i] >> 4), oz = tz - (World.laneH[i] >> 4);
      var offset = U.hash2(ox, oz, 77) * 20;
      return (((t || 0) + offset) % 20) < 10 ? 'ns' : 'ew';
    },

    landmark: function (id) { return World._lm[id] || null; },
    districtAt: function (x, z) {
      var tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
      if (!World.inBounds(tx, tz)) return null;
      var zi = World.zone[tz * World.w + tx];
      return zi ? World.districts[zi - 1] : null;
    },
    // which ring of the figure eight is under (x, z, y): 'upper' (the original ring), 'lower' (the Lower Loop's legs and
    // its two ramps) or null off the highway. The HUD chip can read it to add the Lower Loop's line.
    loopAt: function (x, z, y) {
      var tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
      if (!World.inBounds(tx, tz)) return null;
      var i = tz * World.w + tx;
      if (World.deck[i] && (y || 0) > 3) return (World.dmeta[i] & M.LOWER) ? 'lower' : 'upper';
      if (World.tiles[i] === T.RAMP) { var rr = World.ramps[World._rampIndex[i]]; return rr && rr.lower ? 'lower' : 'upper'; }
      return null;
    },
    // name of the nearest road (y > 3 on a deck tile gives the highway; both rings of the figure eight are "The Loop")
    streetAt: function (x, z, y) {
      var tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
      if (!World.inBounds(tx, tz)) return null;
      var i = tz * World.w + tx;
      if (World.deck[i] && (y || 0) > 3) return World.loopName;
      if (World.tiles[i] === T.RAMP) return World.loopName;
      for (var r = 0; r < 5; r++) {
        for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          var nx = tx + dx, nz = tz + dz;
          if (!World.inBounds(nx, nz)) continue;
          var id = World.roadId[nz * World.w + nx];
          if (id) return World.roads[id - 1].name;
        }
      }
      return null;
    },

    randomRoadPoint: function () {
      var i = GTP.rng.pick(World._roadTiles);
      var c = World.tileCenter(i % World.w, Math.floor(i / World.w));
      var d = World.roadDir(c.x, c.z, 0);
      return { x: c.x, z: c.z, y: 0, dx: d ? d.dx : 1, dz: d ? d.dz : 0 };
    },
    // The road / sidewalk tile indices within r metres of (x, z), gathered from 64 m buckets (a superset by up to one
    // bucket). On the 224-tile map a spawner that rejection-samples the whole tile list wastes most of its tries far
    // from the player; sampling from these keeps its hit rate. `kind` is 'road' (default) or 'sidewalk'.
    tilesNear: function (x, z, r, kind) {
      var B = kind === 'sidewalk' ? World._sidewalkBuckets : World._roadBuckets, out = [];
      if (!B) return out;
      var bs = TILE * C.CHUNK_TILES, nb = B.n, bx0 = Math.max(0, Math.floor((x - r) / bs)), bx1 = Math.min(nb - 1, Math.floor((x + r) / bs));
      var bz0 = Math.max(0, Math.floor((z - r) / bs)), bz1 = Math.min(nb - 1, Math.floor((z + r) / bs));
      for (var bz = bz0; bz <= bz1; bz++) for (var bx = bx0; bx <= bx1; bx++) { var list = B.lists[bz * nb + bx]; if (list) for (var k = 0; k < list.length; k++) out.push(list[k]); }
      return out;
    },
    _bucketTiles: function (indices) {
      var bs = C.CHUNK_TILES, nb = Math.ceil(Math.max(World.w, World.h) / bs), lists = new Array(nb * nb);
      for (var k = 0; k < indices.length; k++) {
        var i = indices[k], tx = i % World.w, tz = (i / World.w) | 0, key = Math.floor(tz / bs) * nb + Math.floor(tx / bs);
        (lists[key] || (lists[key] = [])).push(i);
      }
      return { n: nb, lists: lists };
    },
    randomSidewalkPoint: function () {
      var i = GTP.rng.pick(World._sidewalkTiles);
      var c = World.tileCenter(i % World.w, Math.floor(i / World.w));
      return { x: c.x, z: c.z, y: CURB };
    },
    nearestTileOf: function (x, z, pred, maxR) {
      var tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
      maxR = maxR || 24;
      for (var r = 0; r < maxR; r++) {
        for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          if (World.inBounds(tx + dx, tz + dz) && pred(World.tiles[(tz + dz) * World.w + tx + dx], tx + dx, tz + dz)) return { tx: tx + dx, tz: tz + dz };
        }
      }
      return null;
    },
    nearestRoadPoint: function (x, z) {
      var t = World.nearestTileOf(x, z, function (tt, tx, tz) { return (tt === T.ROAD || tt === T.BRIDGE) && !World.isIntersection(tx, tz); }, 30);
      if (!t) return null;
      var c = World.tileCenter(t.tx, t.tz), d = World.roadDir(c.x, c.z, 0);
      return { x: c.x, z: c.z, y: 0, dx: d ? d.dx : 1, dz: d ? d.dz : 0 };
    },
    nearestSidewalkPoint: function (x, z) {
      var t = World.nearestTileOf(x, z, function (tt) { return tt === T.SIDEWALK || tt === T.PLAZA; }, 30);
      if (!t) return null;
      var c = World.tileCenter(t.tx, t.tz);
      return { x: c.x, z: c.z, y: CURB };
    },

    // ---------------------------------------------------------- collision --
    // XZ push-out of a capsule (circle of radius r at height y) vs building
    // volumes, ramp wedges, deck barriers, solid props and the map edge.
    _res: { x: 0, z: 0, hitX: false, hitZ: false, normal: { x: 0, z: 0 }, prop: null },
    resolveCapsule: function (x, z, y, r) {
      var res = World._res, hitX = false, hitZ = false, nx = 0, nz = 0;
      var w = World.w, tiles = World.tiles, stamp = ++World._stamp;
      res.prop = null;   // the last solid prop that pushed (vehicles knock the small ones over)
      if (y == null) y = 0;
      // map edge
      var lim = World.bounds;
      if (x < lim.x0 + r) { x = lim.x0 + r; hitX = true; nx = 1; }
      if (x > lim.x1 - r) { x = lim.x1 - r; hitX = true; nx = -1; }
      if (z < lim.z0 + r) { z = lim.z0 + r; hitZ = true; nz = 1; }
      if (z > lim.z1 - r) { z = lim.z1 - r; hitZ = true; nz = -1; }
      for (var iter = 0; iter < 3; iter++) {
        var moved = false;
        var tx0 = Math.floor((x - r) / TILE), tz0 = Math.floor((z - r) / TILE);
        var tx1 = Math.floor((x + r) / TILE), tz1 = Math.floor((z + r) / TILE);
        for (var tz = tz0; tz <= tz1; tz++) for (var tx = tx0; tx <= tx1; tx++) {
          if (!World.inBounds(tx, tz)) continue;
          var i = tz * w + tx, t = tiles[i], p;
          if (t === T.BUILDING) {
            var b = World.buildings[World.bidx[i] - 1];
            if (!b || b._st === stamp) continue;
            b._st = stamp;
            if (y >= b.y + b.h - 0.05) continue;
            p = U.aabbCircle(b.x, b.z, b.w, b.d, x, z, r);
            if (p.hit) { x += p.px; z += p.pz; moved = true; if (Math.abs(p.px) > Math.abs(p.pz)) { hitX = true; nx = U.sign(p.px); nz = 0; } else { hitZ = true; nz = U.sign(p.pz); nx = 0; } }
          } else if (t === T.RAMP) {
            // the wedge is solid where its top is above the capsule's feet (+ step-up)
            var rx = tx * TILE, rz = tz * TILE;
            var qx = x < rx ? rx : (x > rx + TILE ? rx + TILE : x), qz = z < rz ? rz : (z > rz + TILE ? rz + TILE : z);
            var hTop = World.rampHeight(Math.min(rx + TILE - 0.01, Math.max(rx, qx)), Math.min(rz + TILE - 0.01, Math.max(rz, qz)));
            if (hTop > y + 0.6) {
              p = U.aabbCircle(rx, rz, TILE, TILE, x, z, r);
              if (p.hit) { x += p.px; z += p.pz; moved = true; if (Math.abs(p.px) > Math.abs(p.pz)) { hitX = true; nx = U.sign(p.px); nz = 0; } else { hitZ = true; nz = U.sign(p.pz); nx = 0; } }
            }
          }
          // solid props
          var pl = World._propTile[i] ? World._propGrid.get(i) : null;   // a byte test before the Map lookup (most tiles hold no solid prop)
          if (pl) for (var k = 0; k < pl.length; k++) {
            var pr = pl[k];
            if (pr._st === stamp) continue; pr._st = stamp;
            if (pr.fallen || y > pr.y + (pr.h || 3) - 0.1) continue;
            var ddx = x - pr.x, ddz = z - pr.z, rr = r + pr.r, d2 = ddx * ddx + ddz * ddz;
            if (d2 >= rr * rr) continue;
            var d = Math.sqrt(d2) || 0.001, push = rr - d + 0.001;
            x += ddx / d * push; z += ddz / d * push; moved = true; res.prop = pr;
            if (Math.abs(ddx) > Math.abs(ddz)) { hitX = true; nx = U.sign(ddx); nz = 0; } else { hitZ = true; nz = U.sign(ddz); nx = 0; }
          }
        }
        if (!moved) break;
      }
      // deck barriers and ramp side rails: keep elevated movers on the slab
      var ctx = Math.floor(x / TILE), ctz = Math.floor(z / TILE);
      if (World.inBounds(ctx, ctz)) {
        var ci = ctz * w + ctx, ct = tiles[ci], pad = r + 0.25;
        var onDeck = World.deck[ci] && y > DECK_Y - 1.2 && y < DECK_Y + 1.6;
        var onRamp = ct === T.RAMP && World.rampHeight(x, z) > 0.8 && y < World.rampHeight(x, z) + 1.6;
        if (onDeck || onRamp) {
          for (var k2 = 0; k2 < 4; k2++) {
            var ax = ctx + DIRS[k2][0], az = ctz + DIRS[k2][1];
            var open;
            if (onDeck) {
              open = World.deckAt(ax, az) !== 0 || (World.tile(ax, az) === T.RAMP && World.rampY[az * w + ax] > DECK_Y - 1.2);
            } else {
              var at = World.tile(ax, az), ramp = World.ramps[World._rampIndex[ci]];
              var along = ramp && ((ramp.axis === 'h' && DIRS[k2][1] === 0) || (ramp.axis === 'v' && DIRS[k2][0] === 0));
              open = along || at === T.RAMP || World.deckAt(ax, az) !== 0;
            }
            if (open) continue;
            var ex = ctx * TILE, ez = ctz * TILE;
            if (DIRS[k2][0] === 1 && x > ex + TILE - pad) { x = ex + TILE - pad; hitX = true; nx = -1; }
            if (DIRS[k2][0] === -1 && x < ex + pad) { x = ex + pad; hitX = true; nx = 1; }
            if (DIRS[k2][1] === 1 && z > ez + TILE - pad) { z = ez + TILE - pad; hitZ = true; nz = -1; }
            if (DIRS[k2][1] === -1 && z < ez + pad) { z = ez + pad; hitZ = true; nz = 1; }
          }
        }
      }
      res.x = x; res.z = z; res.hitX = hitX; res.hitZ = hitZ; res.normal.x = nx; res.normal.z = nz;
      return res;
    },

    // Ray vs building boxes (camera pull-in, bullets). Returns {t, point, normal} | null.
    raycastBuildings: function (ox, oy, oz, dx, dy, dz, maxDist) {
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= l; dy /= l; dz /= l;
      maxDist = maxDist || 100;
      var w = World.w, tiles = World.tiles, stamp = ++World._stamp;
      var tx = Math.floor(ox / TILE), tz = Math.floor(oz / TILE);
      var stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
      var tMaxX = dx !== 0 ? (((dx > 0 ? tx + 1 : tx) * TILE) - ox) / dx : 1e9;
      var tMaxZ = dz !== 0 ? (((dz > 0 ? tz + 1 : tz) * TILE) - oz) / dz : 1e9;
      var tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : 1e9, tDeltaZ = dz !== 0 ? Math.abs(TILE / dz) : 1e9;
      var best = null, bestT = maxDist, tCur = 0, guard = 0;
      while (tCur <= bestT && guard++ < 400) {
        if (World.inBounds(tx, tz)) {
          var i = tz * w + tx;
          if (tiles[i] === T.BUILDING) {
            var b = World.buildings[World.bidx[i] - 1];
            if (b && b._st !== stamp) {
              b._st = stamp;
              var t = U.rayAabb(ox, oy, oz, dx, dy, dz, b.x, b.y, b.z, b.x + b.w, b.y + b.h, b.z + b.d, bestT);
              if (t >= 0 && t < bestT) { bestT = t; best = b; }
            }
          }
        } else if (tCur > 0) break;
        if (tMaxX < tMaxZ) { tCur = tMaxX; tMaxX += tDeltaX; tx += stepX; }
        else { tCur = tMaxZ; tMaxZ += tDeltaZ; tz += stepZ; }
      }
      if (!best) return null;
      var px = ox + dx * bestT, py = oy + dy * bestT, pz = oz + dz * bestT, e = 0.01, n = { x: 0, y: 0, z: 0 };
      if (Math.abs(px - best.x) < e) n.x = -1; else if (Math.abs(px - best.x - best.w) < e) n.x = 1;
      else if (Math.abs(pz - best.z) < e) n.z = -1; else if (Math.abs(pz - best.z - best.d) < e) n.z = 1;
      else if (Math.abs(py - best.y - best.h) < e) n.y = 1; else n.y = -1;
      return { t: bestT, point: { x: px, y: py, z: pz }, normal: n, building: best };
    },

    // ------------------------------------------------------------ pathing --
    // Bounded A* on the layered tile graph. mode 'car' sticks to roads (ground +
    // ramps + deck), 'ped' prefers sidewalks and crosswalks. Returns [{x,z,y}] | null.
    findPath: function (ax, az, bx, bz, opts) {
      opts = opts || {};
      var mode = opts.mode || 'ped', w = World.w, h = World.h, N = w * h;
      var cost = mode === 'car' ? World._carCost : World._pedCost;
      var startDeck = opts.fromY != null && opts.fromY > 3.5, goalDeck = opts.toY != null && opts.toY > 3.5;
      var s = World._snapNode(Math.floor(ax / TILE), Math.floor(az / TILE), startDeck, cost);
      var g = World._snapNode(Math.floor(bx / TILE), Math.floor(bz / TILE), goalDeck, cost);
      if (s < 0 || g < 0) return null;
      var maxExp = opts.maxExpansions || 30000;
      var P = World._path;
      if (!P || P.g.length !== 2 * N) P = World._path = { g: new Float32Array(2 * N), from: new Int32Array(2 * N), stamp: new Uint32Array(2 * N), closed: new Uint32Array(2 * N), gen: 0 };
      P.gen = (P.gen + 1) >>> 0; if (P.gen === 0) { P.stamp.fill(0); P.closed.fill(0); P.gen = 1; }
      var gen = P.gen;
      var heap = new GTP.BinHeap(function (n) { return n.f; });
      P.g[s] = 0; P.stamp[s] = gen; P.from[s] = -1;
      heap.push({ i: s, g: 0, f: 0 });
      var gx = (g % N) % w, gz = ((g % N) / w) | 0;
      var expansions = 0, found = false, HMIN = 0.8;
      var nbrs = [];
      while (heap.size()) {
        var cur = heap.pop(), ci = cur.i;
        if (ci === g) { found = true; break; }
        if (cur.g > P.g[ci] || P.closed[ci] === gen) continue;
        P.closed[ci] = gen;
        if (++expansions > maxExp) break;
        World._neighbors(ci, nbrs);
        var cg = P.g[ci];
        for (var k = 0; k < nbrs.length; k++) {
          var ni = nbrs[k], c = cost(ni);
          if (c <= 0) continue;
          var ng = cg + c;
          if (P.stamp[ni] === gen && P.g[ni] <= ng) continue;
          P.stamp[ni] = gen; P.g[ni] = ng; P.from[ni] = ci;
          var nx = (ni % N) % w, nz = ((ni % N) / w) | 0;
          var hh = (Math.abs(nx - gx) + Math.abs(nz - gz)) * HMIN;
          heap.push({ i: ni, g: P.g[ni], f: ng + hh });
        }
      }
      World._pathStats = { expansions: expansions, found: found };
      if (!found) return null;
      var out = [], i = g;
      while (i >= 0) { out.push(i); i = P.from[i]; }
      out.reverse();
      var pts = [];
      for (var j = 0; j < out.length; j++) {
        var node = out[j], ti = node % N, deckL = node >= N;
        var tx = ti % w, tz = (ti / w) | 0;
        var px = (tx + 0.5) * TILE, pz = (tz + 0.5) * TILE;
        var py = deckL ? DECK_Y : (World.tiles[ti] === T.RAMP ? World.rampY[ti] : World.groundY(World.tiles[ti]));
        var p = { x: px, z: pz, y: py };
        if (pts.length >= 2) {
          var a = pts[pts.length - 2], b = pts[pts.length - 1];
          if ((b.x - a.x) * (p.z - b.z) - (b.z - a.z) * (p.x - b.x) === 0 && a.y === b.y && b.y === p.y) { pts[pts.length - 1] = p; continue; }
        }
        pts.push(p);
      }
      return pts;
    },
    _neighbors: function (node, out) {
      out.length = 0;
      var w = World.w, N = w * World.h, deckL = node >= N, ti = node % N, tx = ti % w, tz = (ti / w) | 0;
      var tiles = World.tiles, deck = World.deck;
      for (var k = 0; k < 4; k++) {
        var nx = tx + DIRS[k][0], nz = tz + DIRS[k][1];
        if (nx < 0 || nz < 0 || nx >= w || nz >= World.h) continue;
        var ni = nz * w + nx;
        if (deckL) {
          if (deck[ni]) out.push(N + ni);
          if (tiles[ni] === T.RAMP && World.rampY[ni] > DECK_Y - 1.2) out.push(ni);
        } else {
          out.push(ni);
          if (tiles[ti] === T.RAMP && World.rampY[ti] > DECK_Y - 1.2 && deck[ni]) out.push(N + ni);
        }
      }
    },
    _carCost: function (node) {
      var N = World.w * World.h;
      if (node >= N) return World.deck[node - N] ? 0.8 : 0;
      var t = World.tiles[node];
      if (t === T.ROAD || t === T.BRIDGE) return (World.meta[node] & M.AVENUE) ? 0.9 : 1;
      if (t === T.RAMP) return 1;
      if (t === T.PARKING) return 2;
      if (t === T.PLAZA) return 6;
      if (t === T.SIDEWALK) return 8;
      return 0;
    },
    _pedCost: function (node) {
      var N = World.w * World.h;
      if (node >= N) return World.deck[node - N] ? 8 : 0;
      var t = World.tiles[node];
      if (t === T.SIDEWALK || t === T.PLAZA) return 1;
      if (t === T.GRASS || t === T.SAND || t === T.PARKING) return 1.4;
      if (t === T.ROAD) return (World.meta[node] & M.CROSSWALK) ? 1.2 : 3;
      if (t === T.BRIDGE) return 2.5;
      if (t === T.RAMP) return 4;
      return 0;
    },
    _snapNode: function (tx, tz, deckL, cost) {
      var w = World.w, N = w * World.h;
      if (World.inBounds(tx, tz)) {
        var n = (deckL ? N : 0) + tz * w + tx;
        if (cost(n) > 0) return n;
        if (deckL && cost(tz * w + tx) > 0) return tz * w + tx;
      }
      var t = World.nearestTileOf((tx + 0.5) * TILE, (tz + 0.5) * TILE, function (tt, x, z) { return cost(z * w + x) > 0; }, 10);
      return t ? t.tz * w + t.tx : -1;
    },

    // ----------------------------------------------------------- generate --
    // generate(seed, onProgress): onProgress(fraction, label) is called between the stages (fraction 0..1 of this
    // module's own work) and a 'load:progress' event {stage, frac, bar, label} goes out for the loading screen
    // (bar = the absolute share of the loading bar, GDD_EXPANSION §6.1). Synchronous either way.
    generate: function (seed, onProgress) {
      seed = seed | 0;
      var genT0 = U.now ? U.now() : 0;
      function prog(stage, frac) {
        var s = STAGES[stage] || STAGES.done;
        if (typeof onProgress === 'function') { try { onProgress(frac, s.label); } catch (e) { U.reportError(e, 'world.progress'); } }
        GTP.Events.emit('load:progress', { stage: stage, frac: frac, bar: s.bar, label: s.label, source: 'world' });
      }
      if (World._seed === seed && World.tiles) { prog('done', 1); return; }
      prog('tiles', 0);
      var CW = GTP.Content.world, L = CW.layout;
      var w = World.w = L.w || C.MAP_W, h = World.h = L.h || C.MAP_H, N = w * h;
      var R = GTP.makeRng((U.hash('world') ^ seed) >>> 0), Rmain = R;
      var tiles = World.tiles = new Uint8Array(N);
      var deck = World.deck = new Uint8Array(N);
      var meta = World.meta = new Uint16Array(N);
      var dmeta = World.dmeta = new Uint16Array(N);
      var laneH = World.laneH = new Uint8Array(N), laneV = World.laneV = new Uint8Array(N);
      var dlaneH = World.dlaneH = new Uint8Array(N), dlaneV = World.dlaneV = new Uint8Array(N);
      var rampY = World.rampY = new Float32Array(N);
      var zone = World.zone = new Uint8Array(N);
      var bidx = World.bidx = new Int16Array(N);
      var roadId = World.roadId = new Uint8Array(N);
      var rampIndex = World._rampIndex = new Int8Array(N); rampIndex.fill(-1);
      var assigned = new Uint8Array(N);   // 1 = tile belongs to a road / lot / building
      var parkTile = new Uint8Array(N);   // 1 = park-type ground (plant trees, benches)
      World.buildings = []; World.props = []; World.landmarks = []; World._lm = {}; World.ramps = []; World.piers = []; World.lots = []; World.stuntRamps = []; World.parks = []; World.promenades = [];
      World.roads = L.roads.slice();
      World.loopName = (CW.streets && CW.streets.highway) || 'The Loop';
      World.lowerLoopName = (CW.streets && CW.streets.lowerHighway) || (L.loop && L.loop.lowerName) || 'The Lower Loop';
      World._seed = seed;
      World.bounds = { x0: 0, z0: 0, x1: w * TILE, z1: h * TILE };
      World._propGrid = new Map(); World._propTile = new Uint8Array(N);
      World._wedges = new Map(); World._wedgeTile = new Uint8Array(N);

      function I(tx, tz) { return tz * w + tx; }
      function inB(tx, tz) { return tx >= 0 && tz >= 0 && tx < w && tz < h; }
      function fillRect(r, t) {
        for (var z = Math.max(0, r.z); z < Math.min(h, r.z + r.h); z++) for (var x = Math.max(0, r.x); x < Math.min(w, r.x + r.w); x++) tiles[I(x, z)] = t;
      }
      var baseT = L.base === 'sand' ? T.SAND : T.GRASS;

      // 1. sea, land, sand, coastline jitter, districts
      tiles.fill(T.WATER);
      (L.land || []).forEach(function (r) { fillRect(r, baseT); });
      (L.sand || []).forEach(function (r) { fillRect(r, T.SAND); });
      if (L.coastJitter) {
        var jit = L.coastJitter;
        for (var z = 1; z < h - 1; z++) for (var x = 1; x < w - 1; x++) {
          var ii = I(x, z), tCoast = tiles[ii];   // (not `t0`: that var is the generate() timer, function-scoped)
          if (tCoast === T.WATER) continue;
          var nw = (tiles[ii - 1] === T.WATER) + (tiles[ii + 1] === T.WATER) + (tiles[ii - w] === T.WATER) + (tiles[ii + w] === T.WATER);
          if (nw === 0) continue;
          var hv = U.hash2(x, z, seed + 1);
          if (nw >= 2 && hv < jit) tiles[ii] = T.WATER;
          else if (hv < jit * 0.6 && tCoast === T.GRASS) tiles[ii] = T.SAND;
        }
      }
      World.districts = (L.districts || []).map(function (d, i) {
        var dd = { id: d.id, name: d.name, x: d.x, z: d.z, w: d.w, h: d.h, style: d.style, px: d.x * TILE, pz: d.z * TILE, pw: d.w * TILE, ph: d.h * TILE, cx: (d.x + d.w / 2) * TILE, cz: (d.z + d.h / 2) * TILE };
        for (var z = d.z; z < d.z + d.h; z++) for (var x = d.x; x < d.x + d.w; x++) if (inB(x, z)) zone[I(x, z)] = i + 1;
        return dd;
      });
      var styles = {};
      for (var sk in C.DISTRICT_STYLES) styles[sk] = C.DISTRICT_STYLES[sk];
      for (sk in (CW.districtStyles || {})) styles[sk] = Object.assign({}, styles[sk] || {}, CW.districtStyles[sk]);
      function districtOf(tx, tz) { var zi = zone[I(tx, tz)]; return zi ? World.districts[zi - 1] : null; }
      function styleAt(tx, tz) { var d = districtOf(tx, tz); return (d && styles[d.style]) || styles.downtown; }
      prog('roads', 0.12);

      // 2. ground roads (+ bridges with walkways)
      World.roads.forEach(function (seg, si) {
        var width = ROAD_W[seg.cls] || 2;
        var lo = seg.at - (width >> 1);
        var cls = seg.cls === 'avenue' ? M.AVENUE : 0;
        for (var a = seg.from; a <= seg.to; a++) {
          for (var l = 0; l < width; l++) {
            var tx = seg.axis === 'h' ? a : lo + l, tz = seg.axis === 'h' ? lo + l : a;
            if (!inB(tx, tz)) continue;
            var i = I(tx, tz), t = tiles[i];
            if (t === T.WATER) { if (!seg.bridge) continue; tiles[i] = T.BRIDGE; }
            else if (t !== T.BRIDGE) tiles[i] = T.ROAD;
            meta[i] |= (seg.axis === 'h' ? M.H : M.V) | cls | (seg.dead ? M.DEAD : 0);
            if (seg.axis === 'h') laneH[i] = (l << 4) | width; else laneV[i] = (l << 4) | width;
            assigned[i] = 1; roadId[i] = si + 1;
          }
          if (seg.bridge) {
            var sides = [lo - 1, lo + width];
            for (var s = 0; s < 2; s++) {
              tx = seg.axis === 'h' ? a : sides[s]; tz = seg.axis === 'h' ? sides[s] : a;
              if (!inB(tx, tz)) continue;
              i = I(tx, tz);
              if (tiles[i] === T.WATER) { tiles[i] = T.SIDEWALK; meta[i] |= M.WALKWAY; assigned[i] = 1; }
            }
          }
        }
      });

      // 3. ramps: solid wedges climbing to the deck
      var loop = L.loop || { legs: [], ramps: [] };
      (loop.ramps || []).forEach(function (rp, ri) {
        var lo = rp.at - 1, dir = rp.end >= rp.start ? 1 : -1, len = Math.abs(rp.end - rp.start) + 1;
        var rec = { axis: rp.axis, at: rp.at, start: rp.start, end: rp.end, dir: dir, len: len, name: rp.name };
        // a0 = ground end coordinate (m), a1 = deck end coordinate (m); height rises from a0 to a1
        rec.a0 = dir > 0 ? rp.start * TILE : (rp.start + 1) * TILE;
        rec.a1 = dir > 0 ? (rp.end + 1) * TILE : rp.end * TILE;
        var amin = Math.min(rp.start, rp.end), amax = Math.max(rp.start, rp.end);
        if (rp.axis === 'h') { rec.x0 = amin * TILE; rec.x1 = (amax + 1) * TILE; rec.z0 = lo * TILE; rec.z1 = (lo + 2) * TILE; }
        else { rec.z0 = amin * TILE; rec.z1 = (amax + 1) * TILE; rec.x0 = lo * TILE; rec.x1 = (lo + 2) * TILE; }
        World.ramps.push(rec);
        for (var a = amin; a <= amax; a++) for (var l = 0; l < 2; l++) {
          var tx = rp.axis === 'h' ? a : lo + l, tz = rp.axis === 'h' ? lo + l : a;
          if (!inB(tx, tz)) continue;
          var i = I(tx, tz);
          tiles[i] = T.RAMP; assigned[i] = 1; rampIndex[i] = ri;
          meta[i] = (meta[i] & ~(M.H | M.V | M.AVENUE | M.CROSSWALK)) | (rp.axis === 'h' ? M.H : M.V);
          if (rp.axis === 'h') { laneH[i] = (l << 4) | 2; laneV[i] = 0; } else { laneV[i] = (l << 4) | 2; laneH[i] = 0; }
          var cm = (rp.axis === 'h' ? tx : tz) * TILE + TILE / 2;
          rampY[i] = DECK_Y * U.clamp((cm - rec.a0) / (rec.a1 - rec.a0), 0, 1);
        }
      });

      // 4. the Loop deck (second layer) and the plaza corridor beneath it. A `viaduct` span lays the deck over
      //    water (the ground stays water: fall off, swim, sink); `lower` legs are the Lower Loop for the street chip.
      (loop.legs || []).forEach(function (leg) {
        var lo = leg.at - 2;
        for (var a = leg.from; a <= leg.to; a++) {
          for (var l = -1; l < 5; l++) {
            var tx = leg.axis === 'h' ? a : lo + l, tz = leg.axis === 'h' ? lo + l : a;
            if (!inB(tx, tz)) continue;
            var i = I(tx, tz);
            if (l >= 0 && l < 4) {
              deck[i] = T.HIGHWAY;
              dmeta[i] |= (leg.axis === 'h' ? M.H : M.V) | (leg.lower ? M.LOWER : 0);
              if (leg.axis === 'h') dlaneH[i] = (l << 4) | 4; else dlaneV[i] = (l << 4) | 4;
            }
            if (tiles[i] === baseT || tiles[i] === T.SAND) { tiles[i] = T.PLAZA; meta[i] |= M.CORRIDOR; }
            if (tiles[i] === T.PLAZA) assigned[i] = 1;
          }
        }
      });
      // a ramp that meets a Lower Loop leg belongs to the lower ring
      World.ramps.forEach(function (rec) {
        var ex = rec.axis === 'h' ? rec.end + rec.dir : rec.at - 1, ez = rec.axis === 'h' ? rec.at - 1 : rec.end + rec.dir;
        rec.lower = inB(ex, ez) && !!(dmeta[I(ex, ez)] & M.LOWER);
      });
      prog('landmarks', 0.3);

      // 5. landmarks: lots, buildings, kind-specific props. The expansion's landmarks (past L.legacy.landmarks in the
      //    table) draw from a forked stream so the original 34 and the blocks after them keep the seeds they had.
      var LM = CW.landmarks || [], legacyN = (L.legacy && L.legacy.landmarks) || LM.length, Rx = R.fork(0xE1);
      LM.forEach(function (def, li) {
        var R = li < legacyN ? Rmain : Rx;
        var lot = { x: def.lot.bx, z: def.lot.bz, w: def.lot.w, d: def.lot.d };
        var lmk = { id: def.id, name: def.name, kind: def.kind, label: def.label || def.name, lot: lot, building: null, district: def.district,
          x: (lot.x + lot.w / 2) * TILE, z: (lot.z + lot.d / 2) * TILE, y: CURB, w: lot.w * TILE, d: lot.d * TILE, door: null, sign: def.sign || null, gag: def.gag || null, def: def, points: {}, npcs: [] };
        World.landmarks.push(lmk); World._lm[def.id] = lmk;
        if (def.kind === 'bridge') { World._landmarkProps(lmk, def, lot, R, parkTile); return; }
        var ground = def.ground || (def.kind === 'park' || def.kind === 'campus' ? 'grass' : 'plaza');
        var groundT = { plaza: T.PLAZA, grass: T.GRASS, parking: T.PARKING, sand: T.SAND, gravel: T.PARKING, lawn: T.GRASS, runway: T.PARKING }[ground] || T.PLAZA;
        var strip = ground === 'runway' ? (def.strip || { z0: lot.z + 6, z1: lot.z + 11 }) : null;
        for (var zz = lot.z; zz < lot.z + lot.d; zz++) for (var xx = lot.x; xx < lot.x + lot.w; xx++) {
          if (!inB(xx, zz)) continue;
          var i = I(xx, zz), t = tiles[i];
          if (t === T.ROAD || t === T.BRIDGE || t === T.WATER || t === T.RAMP || (meta[i] & M.CORRIDOR) || (meta[i] & M.WALKWAY)) continue;
          tiles[i] = groundT; assigned[i] = 1; meta[i] |= M.LOT;
          if (ground === 'gravel') meta[i] |= M.YARD;
          if (ground === 'lawn') meta[i] |= M.LAWN;
          // the runway strip: its own texture, free driving (no lanes), and the YARD bit keeps the traffic
          // spawner from parking on it (it parks on plain PARKING tiles); the rest of the lot is apron
          if (strip && zz >= strip.z0 && zz <= strip.z1) meta[i] |= M.RUNWAY | M.YARD;
          if (def.kind === 'park' || def.kind === 'campus') parkTile[i] = 1;
        }
        var fpw = def.footprint ? def.footprint.w : 0, fpd = def.footprint ? def.footprint.d : 0;
        var bx = lot.x + Math.floor((lot.w - fpw) / 2), bz = lot.z + Math.floor((lot.d - fpd) / 2);
        if (def.fpOffset) { bx += def.fpOffset.x | 0; bz += def.fpOffset.z | 0; }
        if (fpw && fpd) {
          lmk.building = World._addBuilding(bx, bz, fpw, fpd, {
            style: def.facade || KIND_FACADE[def.kind] || 'downtown',
            floors: def.floors || KIND_FLOORS[def.kind] || 3,
            height: def.height, roof: def.roof || (def.kind === 'stadium' ? 'stadium' : 'flat'),
            landmark: lmk, kind: def.kind, sign: def.sign, neon: !!def.neon, roofSign: def.roofSign, special: def.kind === 'stadium' ? 'stadium' : null
          }, R);
          lmk.x = lmk.building.x + lmk.building.w / 2; lmk.z = lmk.building.z + lmk.building.d / 2;
        }
        World._landmarkProps(lmk, def, lot, R, parkTile);
      });

      // 6. green lots without buildings (named ones get a sign and benches), then the waterfront promenades
      (L.parks || []).forEach(function (pk) {
        for (var kz = pk.z; kz < pk.z + pk.h; kz++) for (var kx = pk.x; kx < pk.x + pk.w; kx++) {
          if (!inB(kx, kz)) continue;
          var ki = I(kx, kz);
          if (tiles[ki] === baseT || tiles[ki] === T.SAND) { tiles[ki] = T.GRASS; assigned[ki] = 1; parkTile[ki] = 1; }
        }
        World.parks.push({ x: pk.x, z: pk.z, w: pk.w, h: pk.h, name: pk.name || null, cx: (pk.x + pk.w / 2) * TILE, cz: (pk.z + pk.h / 2) * TILE });
        if (pk.sign) World._prop({ kind: 'sign', text: pk.sign, x: (pk.x + pk.w / 2) * TILE, z: pk.z * TILE + TILE + 0.6, y: 1.5, rot: 0, w: Math.min(pk.w * TILE - 2, 6), h: 0.9, standing: true, solid: false });
        if (pk.benches === 's') for (var bk = 0; bk < Math.max(2, pk.w - 4); bk++) World._prop({ kind: 'bench', x: (pk.x + 2 + bk) * TILE + 2, z: (pk.z + pk.h - 1.5) * TILE, rot: 0, r: 0.7, solid: true, h: 0.9 });
      });
      var proms = [];
      if (L.promenade) proms.push(Object.assign({ id: 'promenade', rail: 'e' }, L.promenade));
      (L.promenades || []).forEach(function (p) { proms.push(p); });
      proms.forEach(function (pr, pk) {
        for (var pz = pr.z; pz < pr.z + pr.h; pz++) for (var px = pr.x; px < pr.x + pr.w; px++) {
          if (!inB(px, pz)) continue;
          var pi = I(px, pz);
          if (tiles[pi] === baseT || tiles[pi] === T.SAND) { tiles[pi] = T.PLAZA; assigned[pi] = 1; parkTile[pi] = 2 + pk; }
        }
        World.promenades.push({ id: pr.id || 'promenade', name: pr.name || null, x: pr.x, z: pr.z, w: pr.w, h: pr.h, rail: pr.rail || 'e', billboards: !!pr.billboards });
      });

      // 7. sidewalks: land next to a road becomes sidewalk (buildings, water, ramps and corridors excepted)
      for (var z2 = 0; z2 < h; z2++) for (var x2 = 0; x2 < w; x2++) {
        ii = I(x2, z2);
        var tt = tiles[ii];
        if (tt === T.WATER || tt === T.BUILDING || tt === T.ROAD || tt === T.BRIDGE || tt === T.RAMP || tt === T.SIDEWALK) continue;
        if (meta[ii] & M.CORRIDOR) continue;
        var nb = (x2 > 0 && World.isRoadTile(tiles[ii - 1])) || (x2 < w - 1 && World.isRoadTile(tiles[ii + 1])) || (z2 > 0 && World.isRoadTile(tiles[ii - w])) || (z2 < h - 1 && World.isRoadTile(tiles[ii + w]));
        if (nb) { tiles[ii] = T.SIDEWALK; meta[ii] &= ~(M.LAWN | M.YARD | M.PATH); assigned[ii] = 1; }
      }
      // crosswalks: non-intersection road tiles touching an intersection (not on ramps/bridges/dead ends)
      for (z2 = 0; z2 < h; z2++) for (x2 = 0; x2 < w; x2++) {
        ii = I(x2, z2);
        if (tiles[ii] !== T.ROAD || (meta[ii] & M.DEAD)) continue;
        var m = meta[ii], isH = (m & M.H) && !(m & M.V), isV = (m & M.V) && !(m & M.H);
        if (isH && ((x2 > 0 && World._isX(meta[ii - 1]) && tiles[ii - 1] === T.ROAD) || (x2 < w - 1 && World._isX(meta[ii + 1]) && tiles[ii + 1] === T.ROAD))) meta[ii] |= M.CROSSWALK;
        if (isV && ((z2 > 0 && World._isX(meta[ii - w]) && tiles[ii - w] === T.ROAD) || (z2 < h - 1 && World._isX(meta[ii + w]) && tiles[ii + w] === T.ROAD))) meta[ii] |= M.CROSSWALK;
      }

      // 8. blocks: pack filler buildings into the remaining base-ground components. Components on the expansion's
      //    land (L.legacy: the original map's extent) are packed after the original city's, so the RNG stream the
      //    old blocks draw from is the one they had before the city grew and the old streets keep their buildings.
      var visited = new Uint8Array(N), stack = [], legacy = L.legacy || null, deferred = [];
      for (z2 = 0; z2 < h; z2++) for (x2 = 0; x2 < w; x2++) {
        ii = I(x2, z2);
        if (visited[ii] || assigned[ii] || tiles[ii] !== baseT) continue;
        var comp = [], x0 = x2, z0 = z2, x1 = x2, z1 = z2;
        stack.length = 0; stack.push(ii); visited[ii] = 1;
        while (stack.length) {
          var ci = stack.pop(); comp.push(ci);
          var cx = ci % w, cz = (ci / w) | 0;
          if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cz < z0) z0 = cz; if (cz > z1) z1 = cz;
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
        if (legacy && (x1 >= legacy.w || z1 >= legacy.h)) { deferred.push([comp, x0, z0, x1, z1]); continue; }
        World._packBlock(comp, x0, z0, x1, z1, assigned, styleAt, R);
      }
      deferred.forEach(function (d) { World._packBlock(d[0], d[1], d[2], d[3], d[4], assigned, styleAt, R); });
      prog('props', 0.7);

      // 9. street furniture and greenery
      World._furnish(styleAt, parkTile, seed, R);

      // 10. doors, named points, stunt ramps, tile lists, building index, prop grid
      World.landmarks.forEach(function (lmk) {
        World._placeDoor(lmk);
        var pts = lmk.def.points || {};
        for (var pn in pts) lmk.points[pn] = World._doorAt(pts[pn].tx, pts[pn].tz);
      });
      World._placeStuntRamps(CW.stuntRamps || []);
      World._roadTiles = []; World._sidewalkTiles = [];
      for (var i2 = 0; i2 < N; i2++) {
        if (tiles[i2] === T.ROAD && !((meta[i2] & M.H) && (meta[i2] & M.V)) && !(meta[i2] & M.DEAD)) World._roadTiles.push(i2);
        else if (tiles[i2] === T.SIDEWALK && !(meta[i2] & M.WALKWAY)) World._sidewalkTiles.push(i2);
      }
      World._roadBuckets = World._bucketTiles(World._roadTiles);
      World._sidewalkBuckets = World._bucketTiles(World._sidewalkTiles);
      World.props.forEach(function (p, pi) {
        p.index = pi;
        if (!p.solid) return;
        var r = p.r || 0.4;
        var tx0 = Math.floor((p.x - r) / TILE), tz0 = Math.floor((p.z - r) / TILE), tx1 = Math.floor((p.x + r) / TILE), tz1 = Math.floor((p.z + r) / TILE);
        for (var tz = tz0; tz <= tz1; tz++) for (var tx = tx0; tx <= tx1; tx++) {
          if (!inB(tx, tz)) continue;
          var key = I(tx, tz), arr = World._propGrid.get(key);
          if (!arr) { arr = []; World._propGrid.set(key, arr); World._propTile[key] = 1; }
          arr.push(p);
        }
      });
      World.generateMs = U.now ? U.now() - genT0 : 0;
      prog('done', 1);
      GTP.Events.emit('world:generated', { seed: seed, ms: World.generateMs });
      if (GTP.Render && GTP.Render.invalidateAll) GTP.Render.invalidateAll();
    },

    // The Stunt Jumps' ten striped wedges (GDD_EXPANSION §5.7): a ramp_prop with real height under the wheels
    // (World.heightAt reads the wedge), listed in World.stuntRamps for the strand runtime.
    _placeStuntRamps: function (defs) {
      var w = World.w;
      function resolve(at) {
        if (!at) return null;
        if (at.landmark) {
          var lmk = World._lm[at.landmark]; if (!lmk) return null;
          if (at.point && lmk.points[at.point]) return { x: lmk.points[at.point].x, z: lmk.points[at.point].z };
          if (at.anchor === 'building' && lmk.building) return { x: lmk.building.x + lmk.building.w + (at.ex || 0), z: lmk.building.z + (at.dz || 0) };
          return { x: lmk.x + (at.dx || 0), z: lmk.z + (at.dz || 0) };
        }
        return { x: at.x, z: at.z };
      }
      defs.forEach(function (d) {
        var pos = resolve(d.at), land = resolve(d.landing); if (!pos) return;
        var yHint = d.at && d.at.y != null ? d.at.y : 0;
        var y = World.heightAt(pos.x, pos.z, yHint), yaw = HEADING_YAW[d.heading] || 0, f = U.yawToDir(yaw);
        var p = World._prop({ kind: 'ramp_prop', x: pos.x, z: pos.z, y: y, rot: yaw, solid: false, h: STUNT_H, len: STUNT_LEN, w: STUNT_W, fx: f.x, fz: f.z, stunt: d.id });
        var rec = { id: d.id, name: d.name, x: pos.x, z: pos.z, y: y, yaw: yaw, heading: d.heading, landing: land ? { x: land.x, z: land.z } : null, minAir: d.minAir || 1, prop: p };
        World.stuntRamps.push(rec);
        // every tile the wedge's rotated footprint can touch
        var ext = Math.max(STUNT_LEN, STUNT_W) / 2 + 0.2;
        var tx0 = Math.floor((pos.x - ext) / TILE), tz0 = Math.floor((pos.z - ext) / TILE), tx1 = Math.floor((pos.x + ext) / TILE), tz1 = Math.floor((pos.z + ext) / TILE);
        for (var tz = tz0; tz <= tz1; tz++) for (var tx = tx0; tx <= tx1; tx++) {
          if (!World.inBounds(tx, tz)) continue;
          var key = tz * w + tx, arr = World._wedges.get(key);
          if (!arr) { arr = []; World._wedges.set(key, arr); World._wedgeTile[key] = 1; }
          arr.push(p);
        }
      });
    },
    _isX: function (m) { return (m & M.H) && (m & M.V); },

    // ------------------------------------------------------------ builders --
    _addBuilding: function (tx, tz, tw, td, o, R) {
      var tiles = World.tiles, w = World.w, idx = World.buildings.length;
      for (var z = tz; z < tz + td; z++) for (var x = tx; x < tx + tw; x++) if (World.inBounds(x, z)) { tiles[z * w + x] = T.BUILDING; World.bidx[z * w + x] = idx + 1; World.meta[z * w + x] &= ~(M.LAWN | M.YARD | M.PATH); }
      var d = World.districtAt((tx + tw / 2) * TILE, (tz + td / 2) * TILE);
      var floors = o.floors || 3;
      var height = o.height || floors * C.FLOOR_H;
      var b = { id: idx, x: tx * TILE, z: tz * TILE, y: CURB, w: tw * TILE, d: td * TILE, h: height, tx: tx, tz: tz, tw: tw, td: td,
        style: o.style || 'downtown', roof: o.roof || 'flat', floors: floors, landmark: o.landmark ? o.landmark.id : null, kind: o.kind || null,
        district: d ? d.id : null, seed: R.int(1, 1e9), sign: o.sign || null, neon: !!o.neon, roofSign: o.roofSign || null, special: o.special || null,
        aabb: { x0: tx * TILE, z0: tz * TILE, x1: (tx + tw) * TILE, z1: (tz + td) * TILE }, _st: 0 };
      b.cx = b.x + b.w / 2; b.cz = b.z + b.d / 2;
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
      if (rem > 0) segs[n - 1] += rem;
      return segs;
    },

    _packBlock: function (comp, x0, z0, x1, z1, assigned, styleAt, R) {
      var w = World.w, tiles = World.tiles, meta = World.meta;
      var st = styleAt(comp[0] % w, (comp[0] / w) | 0);
      var inComp = new Set(comp);
      var gap = R.chance(st.alleyChance) ? Math.max(1, st.gap) : st.gap;
      var bw = x1 - x0 + 1, bh = z1 - z0 + 1;
      var rows = World._splitLength(bh, st.lotH[0], st.lotH[1], gap, R);
      var z = z0;
      for (var r = 0; r < rows.length; r++) {
        var rh = rows[r];
        var cols = World._splitLength(bw, st.lotW[0], st.lotW[1], gap, R);
        var x = x0;
        for (var c = 0; c < cols.length; c++) {
          var cw = cols[c], ok = true;
          for (var zz = z; zz < z + rh && ok; zz++) for (var xx = x; xx < x + cw; xx++) {
            if (!inComp.has(zz * w + xx)) { ok = false; break; }
          }
          if (ok && R.random() > 0.05) {
            var floors = R.int(st.floors[0], st.floors[1]);
            // downtown: a few landmark-scale towers
            if (st.facade === 'downtown' && R.chance(0.2)) floors = R.int(st.floors[1], st.floors[1] + 8);
            // pitched roofs belong on houses, not on towers; brownstones wear a slate mansard
            var gableRoll = st.roof === 'gable' ? R.chance(0.8) : (st.facade === 'airport' || st.facade === 'port' ? false : R.chance(0.08));
            var roof = (gableRoll && floors <= 4) ? 'gable' : 'flat';
            if (st.roof === 'mansard' && R.chance(0.75)) roof = 'mansard';
            World._addBuilding(x, z, cw, rh, { style: st.facade, floors: floors, roof: roof }, R);
            for (zz = z; zz < z + rh; zz++) for (xx = x; xx < x + cw; xx++) assigned[zz * w + xx] = 1;
          }
          x += cw + gap;
        }
        z += rh + gap;
      }
      // remnants: convert leftover base tiles in this component
      var rem = st.remnant;
      for (var i = 0; i < comp.length; i++) {
        var ci = comp[i];
        if (assigned[ci] || tiles[ci] === T.BUILDING) continue;
        if (rem === 'plaza') tiles[ci] = T.PLAZA;
        else if (rem === 'parking') tiles[ci] = T.PARKING;
        else if (rem === 'gravel') { tiles[ci] = T.PARKING; meta[ci] |= M.YARD; }
        else if (rem === 'sand') tiles[ci] = T.SAND;
      }
      if (rem === 'parking') {
        for (i = 0; i < comp.length; i++) {
          ci = comp[i];
          if (tiles[ci] !== T.PARKING) continue;
          var cx = ci % w, cz = (ci / w) | 0;
          var horiz = (World.tile(cx - 1, cz) === T.PARKING) || (World.tile(cx + 1, cz) === T.PARKING);
          var vert = (World.tile(cx, cz - 1) === T.PARKING) || (World.tile(cx, cz + 1) === T.PARKING);
          if (!horiz || !vert) tiles[ci] = T.PLAZA;
        }
      }
    },

    _prop: function (p) { if (p.y == null) p.y = CURB; if (p.rot == null) p.rot = 0; World.props.push(p); return p; },

    // kind-specific decoration for a landmark lot
    _landmarkProps: function (lmk, def, lot, R, parkTile) {
      var w = World.w, tiles = World.tiles, meta = World.meta, b = lmk.building, P = World._prop;
      var lx = lot.x * TILE, lz = lot.z * TILE, lw = lot.w * TILE, ld = lot.d * TILE;
      var cxm = lx + lw / 2, czm = lz + ld / 2;
      var i, x, z, k;
      function interior(fn) { for (var zz = lot.z + 1; zz < lot.z + lot.d - 1; zz++) for (var xx = lot.x + 1; xx < lot.x + lot.w - 1; xx++) fn(xx, zz, zz * w + xx); }
      function paths(cross, ring) {
        var cx = lot.x + (lot.w >> 1), cz = lot.z + (lot.d >> 1);
        interior(function (xx, zz, ii) {
          if (tiles[ii] !== T.GRASS) return;
          var onCross = cross && (xx === cx || zz === cz);
          var onRing = ring && (xx === lot.x + 1 || xx === lot.x + lot.w - 2 || zz === lot.z + 1 || zz === lot.z + lot.d - 2);
          if (onCross || onRing) { tiles[ii] = T.PLAZA; meta[ii] |= M.PATH; }
        });
      }
      // the door face: its outward point at distance `out`, its yaw, and the face's right vector (along the face)
      function face(side, out) {
        side = side || def.door || 's';
        if (side === 's') return { x: b.cx, z: b.z + b.d + out, rot: Math.PI, rx: -1, rz: 0, len: b.w };
        if (side === 'n') return { x: b.cx, z: b.z - out, rot: 0, rx: 1, rz: 0, len: b.w };
        // rot is a yaw: 0 faces north (-z), PI south, -PI/2 east (+x), PI/2 west (-x)
        if (side === 'e') return { x: b.x + b.w + out, z: b.cz, rot: -Math.PI / 2, rx: 0, rz: 1, len: b.d };
        return { x: b.x - out, z: b.cz, rot: Math.PI / 2, rx: 0, rz: -1, len: b.d };
      }
      function facadeSign(text, neon, big, opts) {
        if (!b || !text) return;
        var f = face((opts && opts.side) || def.door || 's', 0.12);
        var sw = Math.min(f.len - 1, Math.max(3, text.length * (big ? 0.7 : 0.5) + 1.2));
        P({ kind: 'sign', text: text, x: f.x, z: f.z, y: Math.min(b.h - 0.3, C.FLOOR_H + 0.9), rot: f.rot, w: sw, h: big ? 1.6 : 1.1, neon: !!neon, target: !!(opts && opts.target), landmark: lmk.id, solid: false });
      }
      // a strip of the lot's plaza turned into parking bays (the fixed fleets of the spawn table need PARKING tiles)
      function parkStrip(x0, z0, cw, cd) {
        for (var zz = z0; zz < z0 + cd; zz++) for (var xx = x0; xx < x0 + cw; xx++) {
          if (xx < lot.x || zz < lot.z || xx >= lot.x + lot.w || zz >= lot.z + lot.d || !World.inBounds(xx, zz)) continue;
          var ii = zz * w + xx; if (tiles[ii] === T.PLAZA && (meta[ii] & M.LOT)) tiles[ii] = T.PARKING;
        }
      }
      function trees(n, salt) { for (var q = 0; q < n; q++) P({ kind: 'tree', x: lx + TILE * 1.5 + U.hash2(q, salt, lmk.id.length) * (lw - 3 * TILE), z: lz + TILE * 1.5 + U.hash2(q, salt + 1, lmk.id.length) * (ld - 3 * TILE), r: 0.5, solid: true, scale: 0.9 + U.hash2(q, salt + 2, 3) * 0.5, h: 7 }); }
      switch (def.kind) {
        case 'campus': {
          paths(true, true);
          // nine folding tables and zero chairs, around the central path crossing
          var n = 0;
          for (var tz = 0; tz < 3; tz++) for (var tx = 0; tx < 3; tx++) {
            x = cxm + (tx - 1) * 7 + (tx === 1 ? 0 : (tx - 1) * 1.5); z = czm + (tz - 1) * 6;
            if (tx === 1 && tz === 1) { x += 0; z -= 0; }
            P({ kind: 'table', x: x, z: z, rot: (n % 2) * Math.PI / 2 + R.range(-0.2, 0.2), r: 0.9, solid: true, h: 0.8 }); n++;
          }
          P({ kind: 'sign', text: def.sign, x: cxm, z: lz + ld - TILE - 0.6, y: 1.4, rot: Math.PI, w: 7, h: 1.2, neon: false, landmark: lmk.id, solid: false, standing: true });
          P({ kind: 'sign', text: 'LOUD & CORRECT', x: cxm, z: lz + TILE + 0.6, y: 1.4, rot: 0, w: 5, h: 1.0, neon: false, landmark: lmk.id, solid: false, standing: true });
          [[lot.x + 1.5, lot.z + 1.5], [lot.x + lot.w - 1.5, lot.z + 1.5], [lot.x + 1.5, lot.z + lot.d - 1.5], [lot.x + lot.w - 1.5, lot.z + lot.d - 1.5]].forEach(function (c) {
            P({ kind: 'tree', x: c[0] * TILE, z: c[1] * TILE, r: 0.5, solid: true, scale: 1.3, h: 7 });
          });
          break;
        }
        case 'park': {
          if (lmk.id === 'impression_alley') {
            // billboards quote-posting each other across the central path
            var pairs = (GTP.Content.world.billboards && GTP.Content.world.billboards.pairs) || [];
            var pathX = lot.x + (lot.w >> 1);
            interior(function (xx, zz, ii) { if (xx === pathX || zz === lot.z + (lot.d >> 1)) { meta[ii] |= M.PATH; } });
            for (k = 0; k < Math.min(4, pairs.length); k++) {
              z = lz + TILE * 1.5 + k * (ld - 3 * TILE) / 3;
              P({ kind: 'billboard', text: pairs[k][0], x: (pathX + 0.5) * TILE - 8, z: z, rot: -Math.PI / 2, w: 6, h: 3, y: 2.2, neon: k % 2 === 0, solid: true, r: 0.6, landmark: lmk.id, pair: k, side: 0 });
              P({ kind: 'billboard', text: pairs[k][1], x: (pathX + 0.5) * TILE + 8, z: z, rot: Math.PI / 2, w: 6, h: 3, y: 2.2, neon: k % 2 === 1, solid: true, r: 0.6, landmark: lmk.id, pair: k, side: 1 });
            }
            for (k = 0; k < 4; k++) P({ kind: 'bench', x: (pathX + 0.5) * TILE + (k % 2 ? 2.2 : -2.2), z: lz + ld * (0.3 + 0.4 * (k >> 1)), rot: k % 2 ? -Math.PI / 2 : Math.PI / 2, r: 0.7, solid: true, h: 0.9 });
          } else if (lmk.id === 'protest_plaza') {
            var texts = ['WHATEVER THIS IS', 'CHEESE', 'NO CHEESE', 'PARKING', 'STOP DEBATING', 'WE ARE NOT HERE TO...'];
            for (k = 0; k < 6; k++) {
              var a = k / 6 * Math.PI * 2;
              P({ kind: 'sign', text: texts[k], x: cxm + Math.cos(a) * 8, z: czm + Math.sin(a) * 8, y: 1.5, rot: -a + Math.PI / 2, w: 3, h: 0.9, neon: false, standing: true, solid: true, r: 0.3, h2: 2 });
            }
            P({ kind: 'kiosk', x: cxm, z: czm, rot: 0, r: 2.2, solid: true, h: 3, text: 'GIFT SHOP' });
            P({ kind: 'sign', text: 'PERPETUAL ASSEMBLY PLAZA', x: cxm, z: lz + TILE + 0.5, y: 2.4, rot: 0, w: 7, h: 0.9, standing: true, solid: false });
          } else if (def.bandstand) {
            // Old Money Common: paths, an octagonal bandstand that has never hosted a band, a fountain, the WELL, ACTUALLY statue
            paths(true, true);
            P({ kind: 'gazebo', x: cxm, z: czm, rot: 0, r: 4.2, solid: true, h: 6 });
            P({ kind: 'fountain', x: cxm, z: lz + 12, rot: 0, r: 0, solid: false, h: 1 });
            P({ kind: 'statue', x: cxm, z: lz + ld - 12, rot: 0, r: 0.9, solid: true, h: 4 });
            P({ kind: 'sign', text: 'WELL, ACTUALLY', x: cxm, z: lz + ld - 12 + 1.3, y: 0.9, rot: Math.PI, w: 2.4, h: 0.6, solid: false });
            trees(12, 31);
            for (k = 0; k < 8; k++) P({ kind: 'bench', x: cxm + ((k % 2) ? 6 : -6), z: lz + 10 + k * (ld - 20) / 7, rot: (k % 2) ? -Math.PI / 2 : Math.PI / 2, r: 0.7, solid: true, h: 0.9 });
            if (def.sign) P({ kind: 'sign', text: def.sign, x: lx + 0.9, z: czm, y: 1.5, rot: Math.PI / 2, w: 5, h: 0.9, standing: true, solid: false });
          } else if (lmk.id === 'goldplate_links') {
            // mown stripes, five par-ten holes with flags, two bunkers, a sign
            interior(function (xx, zz, ii) { if (tiles[ii] === T.GRASS) meta[ii] |= M.LAWN; });
            for (k = 0; k < 5; k++) {
              z = lz + TILE * 3 + k * (ld - 6 * TILE) / 4; x = cxm + ((k % 2) ? 8 : -8);
              P({ kind: 'flag', x: x, z: z, rot: 0, r: 0.2, solid: true, h: 3, color: '#e8b53a' });
            }
            [[lot.x + 2, lot.z + 10], [lot.x + 6, lot.z + 30]].forEach(function (c) {
              for (var dz = 0; dz < 2; dz++) for (var dx = 0; dx < 2; dx++) { i = (c[1] + dz) * w + c[0] + dx; if (tiles[i] === T.GRASS) { tiles[i] = T.SAND; meta[i] &= ~M.LAWN; } }
            });
            P({ kind: 'sign', text: 'GOLDPLATE LINKS: PAR 10', x: lx + lw - TILE - 0.6, z: czm, y: 1.6, rot: -Math.PI / 2, w: 6, h: 1.0, standing: true, solid: false });
            for (k = 0; k < 10; k++) P({ kind: 'tree', x: lx + TILE * 1.5 + R.random() * (lw - 3 * TILE), z: lz + TILE * 1.5 + R.random() * (ld - 3 * TILE), r: 0.5, solid: true, scale: R.range(0.9, 1.4), h: 7 });
          } else {
            paths(true, false);
          }
          break;
        }
        case 'studio': {
          if (b) {
            P({ kind: 'dish', x: b.x + 2, z: b.z + 2, y: b.y + b.h, rot: R.range(0, 6), r: 0, solid: false, h: 2.5 });
            facadeSign(def.sign || 'ON AIR', true, false);
            if (lmk.id === 'tyn_tower') P({ kind: 'sign', text: 'THE YELL NETWORK', x: b.cx, z: b.z + b.d + 0.15, y: b.h - 2.2, rot: Math.PI, w: b.w - 1, h: 2.4, neon: true, solid: false, landmark: lmk.id });
            else P({ kind: 'sign', text: 'DORM 4B', x: b.x - 0.12, z: b.cz, y: C.FLOOR_H * 2 + 1, rot: Math.PI / 2, w: 4, h: 1, neon: false, solid: false });
          }
          break;
        }
        case 'garage': {
          if (b) {
            var side = def.door || 's';
            var gx = b.cx, gz = side === 's' ? b.z + b.d + 2.5 : b.z - 2.5;
            lmk.garage = { x: gx - 3, z: gz - 2.5, w: 6, d: 5, cx: gx, cz: gz };
            facadeSign(def.sign, lmk.id === 'strip_garage', true);
          }
          break;
        }
        case 'gas': {
          if (b) {
            var cz2 = (def.door === 'n') ? b.z - 7 : b.z + b.d + 7;
            P({ kind: 'canopy', x: b.cx, z: cz2, rot: 0, r: 0, solid: false, h: 4.5, w: 12, d: 7 });
            P({ kind: 'pump', x: b.cx - 2.5, z: cz2, rot: 0, r: 0.7, solid: true, h: 1.8 });
            P({ kind: 'pump', x: b.cx + 2.5, z: cz2, rot: 0, r: 0.7, solid: true, h: 1.8 });
            facadeSign(def.sign, !!def.neon, false);
            P({ kind: 'sign', text: def.sign, x: def.signAt === 'e' ? lx + lw - 2.5 : lx + 2.5, z: def.door === 'n' ? lz + TILE + 1 : lz + ld - TILE - 1, y: 5.5, rot: def.door === 'n' ? 0 : Math.PI, w: 5, h: 1.6, neon: !!def.neon, standing: true, pole: true, solid: true, r: 0.3 });
          }
          break;
        }
        case 'dock': {
          var shoreZ = lot.z + lot.d;
          for (k = 0; k < 2; k++) {
            var px = lot.x + 2 + k * 4, len = 9;
            for (z = shoreZ; z < Math.min(World.h, shoreZ + len); z++) for (var dx2 = 0; dx2 < 2; dx2++) {
              i = z * w + px + dx2; if (tiles[i] !== T.WATER) continue; tiles[i] = T.PLAZA; meta[i] |= M.DOCK;
            }
            World.piers.push({ tx: px, tz: shoreZ, tw: 2, len: len });
            for (var bz2 = 1; bz2 < len - 1; bz2 += 3) {
              var sd = (bz2 % 2) ? 1 : -1;
              P({ kind: 'boat', x: (px + 1 + sd * 2.6) * TILE, z: (shoreZ + bz2 + 1) * TILE, y: WATER_Y + 0.35, rot: sd > 0 ? 0 : Math.PI, r: 1.8, solid: true, h: 2.2, color: R.pick(['#f4f4f4', '#e8e2c8', '#2b4c7e', '#c94040', '#f0c050']) });
              P({ kind: 'bollard', x: (px + 2) * TILE - 0.4, z: (shoreZ + bz2 + 0.5) * TILE, r: 0.2, solid: true, h: 0.7 });
            }
          }
          P({ kind: 'sign', text: def.sign, x: cxm, z: lz + TILE + 0.6, y: 3.2, rot: 0, w: 7, h: 1.3, neon: true, standing: true, pole: true, solid: true, r: 0.3 });
          for (k = 0; k < 3; k++) P({ kind: 'palm', x: lx + TILE * 1.5 + k * 3.2 * TILE / 2.5, z: lz + ld - TILE * 1.5, r: 0.4, solid: true, scale: R.range(0.9, 1.3), h: 7 });
          break;
        }
        case 'club': {
          if (def.yacht) {
            var shore = lot.z + lot.d, yx = lot.x + 2;
            for (z = shore; z < shore + 3; z++) for (var dx3 = 0; dx3 < 2; dx3++) { i = z * w + yx + dx3; if (tiles[i] === T.WATER) { tiles[i] = T.PLAZA; meta[i] |= M.DOCK; } }
            World.piers.push({ tx: yx, tz: shore, tw: 2, len: 3 });
            P({ kind: 'yacht', x: (yx + 5) * TILE, z: (shore + 3) * TILE, y: WATER_Y + 0.2, rot: 0, r: 7, solid: true, h: 9, text: def.sign });
            P({ kind: 'sign', text: def.sign, x: cxm, z: lz + TILE + 0.6, y: 3.2, rot: 0, w: 7, h: 1.3, neon: true, standing: true, pole: true, solid: true, r: 0.3 });
            for (k = 0; k < 3; k++) P({ kind: 'palm', x: lx + TILE * 1.5 + k * 5, z: lz + ld - TILE * 1.5, r: 0.4, solid: true, scale: R.range(0.9, 1.3), h: 7 });
          } else {
            facadeSign(def.sign, true, true);
            if (def.awning && b) {
              // the Heirloom Club: an awning over the door, two stanchions with rope, a doorman (spawned by the AI from lmk.npcs)
              var fa = face(def.door, 1.3);
              P({ kind: 'awning', x: fa.x, z: fa.z, y: 2.9, rot: fa.rot, r: 0, solid: false, h: 1, w: 4.5, d: 2.4, color: '#2c3e7a' });
              P({ kind: 'stanchion', x: fa.x + fa.rx * 1.6, z: fa.z + fa.rz * 1.6, rot: fa.rot, r: 0.2, solid: true, h: 1 });
              P({ kind: 'stanchion', x: fa.x - fa.rx * 1.6, z: fa.z - fa.rz * 1.6, rot: fa.rot, r: 0.2, solid: true, h: 1 });
              lmk.npcs.push({ role: 'doorman', x: fa.x + fa.rx * 2.4, z: fa.z + fa.rz * 2.4, yaw: fa.rot, barks: 'doorman' });   // beside the rope, facing the street
              // three members' sports cars on the lot's east side (the spawn table parks them)
              parkStrip(lot.x + lot.w - 2, lot.z, 2, lot.d - 1);
            }
          }
          break;
        }
        case 'stadium': {
          if (b) {
            [[b.x - 1.5, b.z - 1.5], [b.x + b.w + 1.5, b.z - 1.5], [b.x - 1.5, b.z + b.d + 1.5], [b.x + b.w + 1.5, b.z + b.d + 1.5]].forEach(function (c) {
              P({ kind: 'mast', x: c[0], z: c[1], r: 0.6, solid: true, h: 26 });
            });
            P({ kind: 'sign', text: 'GOLDPLATE GOLDPLATE STADIUM', x: b.x - 0.3, z: b.cz, y: b.h - 2, rot: Math.PI / 2, w: 22, h: 3, neon: true, solid: false, landmark: lmk.id });
          }
          break;
        }
        case 'hq': case 'embassy': {
          if (b) {
            var flags = def.kind === 'embassy' ? 2 : 1, fsz = def.kind === 'embassy' ? 1.6 : 1;
            for (k = 0; k < flags; k++) P({ kind: 'flag', x: b.cx + (k - (flags - 1) / 2) * 6, z: def.door === 'n' ? b.z - 3.5 : b.z + b.d + 3.5, r: 0.25, solid: true, h: 8, scale: fsz, color: def.kind === 'embassy' ? '#3d6fcf' : '#2c3e7a' });
            for (k = 0; k < (def.antennas || 0); k++) P({ kind: 'antenna', x: b.x + 1 + U.hash2(k, 1, b.seed) * (b.w - 2), z: b.z + 1 + U.hash2(k, 2, b.seed) * (b.d - 2), y: b.y + b.h, r: 0, solid: false, h: 2 + U.hash2(k, 3, b.seed) * 3 });
            facadeSign(def.sign, false, def.kind === 'embassy');
          }
          break;
        }
        case 'mansion': {
          if (b) {
            // the hedge maze (also a hedge) and a pool
            var mx = b.x + b.w + 4, mz = b.z;
            for (k = 0; k < 5; k++) P({ kind: 'hedge', x: mx + k * 2.4, z: mz + b.d / 2 + ((k % 2) ? 1.5 : -1.5), rot: 0, r: 1, solid: true, h: 1.8, sx: 1, sz: b.d - 3 - ((k % 2) ? 3 : 0) });
            P({ kind: 'pool', x: b.cx, z: b.z + b.d + 5, rot: 0, r: 0, solid: false, h: 0.1, w: 9, d: 5 });
            for (k = 0; k < 8; k++) P({ kind: 'tree', x: lx + TILE * 1.5 + R.random() * (lw - 3 * TILE), z: lz + TILE * 1.5 + R.random() * (ld - 3 * TILE), r: 0.5, solid: true, scale: R.range(0.9, 1.4), h: 7 });
            P({ kind: 'hedge', x: b.x - 2, z: b.cz, rot: 0, r: 1, solid: true, h: 1.2, sx: 1, sz: b.d + 2 });
          }
          break;
        }
        case 'warehouse': {
          if (b) {
            for (k = 0; k < 6; k++) {
              var cxk = lx + TILE * 1.5 + U.hash2(k, 5, b.seed) * (lw - 3 * TILE), czk = lz + TILE * 1.5 + U.hash2(k, 6, b.seed) * (ld - 3 * TILE);
              if (U.pointInRect(cxk, czk, b.x - 1, b.z - 1, b.w + 2, b.d + 2)) continue;
              P({ kind: 'crate', x: cxk, z: czk, rot: U.hash2(k, 7, b.seed) * 1.5, r: 0.9, solid: true, h: 1.3 });
            }
            if (def.stack) P({ kind: 'stack', x: b.x + b.w - 2, z: b.z + 2, y: 0, r: 1.2, solid: true, h: b.h + 10 });
            for (k = 0; k < (def.antennas || 0); k++) P({ kind: 'antenna', x: b.x + 1 + k * 1.2, z: b.z + 1, y: b.y + b.h, r: 0, solid: false, h: 3 });
            facadeSign(def.sign, false, true);
          }
          break;
        }
        case 'tower': {
          if (b) {
            facadeSign(def.sign, true, true);
            P({ kind: 'sign', text: def.sign, x: b.x + b.w + 0.15, z: b.cz, y: b.h - 4, rot: -Math.PI / 2, w: b.d - 1, h: 2.4, neon: true, solid: false });
            P({ kind: 'sign', text: def.sign, x: b.cx, z: b.z + b.d + 0.15, y: b.h - 4, rot: Math.PI, w: b.w - 1, h: 2.4, neon: true, solid: false });
            if (def.roofSign) P({ kind: 'sign', text: def.roofSign, x: b.cx, z: b.cz, y: b.y + b.h + 3, rot: 0, w: 4, h: 4, neon: true, solid: false, standing: true, double: true });
          }
          break;
        }
        case 'capitol': {
          if (b) {
            facadeSign(def.sign, false, true);
            for (k = 0; k < 2; k++) P({ kind: 'flag', x: b.cx + (k ? 10 : -10), z: b.z + b.d + 4, r: 0.25, solid: true, h: 9, scale: 1.3, color: '#e8b53a' });
          }
          break;
        }
        // ---- expansion kinds (GDD_EXPANSION §1.5) ----
        case 'terminal': {
          if (b) {
            var side = def.door || 'e', fd = face(side, 4.6), fa2 = face(side === 'e' ? 'w' : side === 'w' ? 'e' : side === 'n' ? 's' : 'n', 4.6);
            facadeSign(def.sign, !!def.neon, true);
            // a canopy over the landside curb (the taxi rank parks under it), four jetbridges on the airside face
            P({ kind: 'canopy', x: fd.x, z: fd.z, rot: fd.rot + Math.PI / 2, r: 0, solid: false, h: 4.5, w: 12, d: 7 });
            var gates = def.gates || 4;
            for (k = 0; k < gates; k++) {
              var gx = fa2.x + fa2.rx * ((k + 0.5) / gates - 0.5) * fa2.len, gz = fa2.z + fa2.rz * ((k + 0.5) / gates - 0.5) * fa2.len;
              P({ kind: 'jetbridge', x: gx, z: gz, rot: fa2.rot, r: 1.2, solid: true, h: 5 });
              // the gate number painted on the airside wall above each bridge (the face point sits 4.6 m out; the wall is 0.4 m further in)
              P({ kind: 'sign', text: 'GATE ' + (k + 1), x: gx + (fa2.rot === Math.PI / 2 ? 4.2 : fa2.rot === -Math.PI / 2 ? -4.2 : 0), z: gz + (fa2.rot === 0 ? 4.2 : fa2.rot === Math.PI ? -4.2 : 0), y: 6.4, rot: fa2.rot, w: 2.2, h: 0.7, neon: false, solid: false });
            }
            // ARRIVALS / DEPARTURES on the two short faces, a beacon on the roof, luggage carts on the apron
            var shortA = (side === 'e' || side === 'w') ? 'n' : 'e', shortB = (side === 'e' || side === 'w') ? 's' : 'w';
            facadeSign('ARRIVALS', true, false, { side: shortA }); facadeSign('DEPARTURES', true, false, { side: shortB });
            P({ kind: 'beacon', x: b.cx, z: b.cz, y: b.y + b.h + 0.4, rot: 0, r: 0, solid: false, h: 1, color: '#ff3030' });
            for (k = 0; k < 6; k++) P({ kind: 'luggage', x: fa2.x + fa2.rx * (U.hash2(k, 1, 9) - 0.5) * fa2.len * 0.8 + (fa2.rot === Math.PI / 2 ? -6 - U.hash2(k, 2, 9) * 8 : fa2.rot === -Math.PI / 2 ? 6 + U.hash2(k, 2, 9) * 8 : 0), z: fa2.z + fa2.rz * (U.hash2(k, 1, 9) - 0.5) * fa2.len * 0.8 + (fa2.rot === 0 ? -6 - U.hash2(k, 2, 9) * 8 : fa2.rot === Math.PI ? 6 + U.hash2(k, 2, 9) * 8 : 0), rot: U.hash2(k, 3, 9) * 6, r: 0.6, solid: true, h: 1.2 });
            P({ kind: 'sign', text: 'ONE FLIGHT: DELAYED (10/10)', x: fd.x + fd.rx * 0, z: fd.z, y: 7.2, rot: fd.rot, w: 9, h: 1.0, neon: true, solid: false, standing: true, pole: true, r: 0.2 });
          }
          break;
        }
        case 'runway': {
          var strip = def.strip || { z0: lot.z + 6, z1: lot.z + 11 }, sz0 = strip.z0 * TILE, sz1 = (strip.z1 + 1) * TILE;
          // edge lights every 4 tiles along both strip edges, a windsock at each end, the airliners on the north apron
          for (x = lx + 2; x < lx + lw; x += 4 * TILE) { P({ kind: 'edgelight', x: x, z: sz0 - 0.5, y: 0, rot: 0, r: 0, solid: false, h: 1 }); P({ kind: 'edgelight', x: x, z: sz1 + 0.5, y: 0, rot: 0, r: 0, solid: false, h: 1 }); }
          P({ kind: 'windsock', x: lx + 2.5, z: sz1 + 6, y: 0, rot: 0, r: 0.3, solid: true, h: 6 });
          P({ kind: 'windsock', x: lx + lw - 2.5, z: sz0 - 6, y: 0, rot: 0, r: 0.3, solid: true, h: 6 });
          [12, 44, 76].forEach(function (off, q) {
            var pxm = (lot.x + off) * TILE + 2, pzm = lz + (strip.z0 - lot.z) * TILE / 2;
            P({ kind: 'plane', x: pxm, z: pzm, y: 0, rot: q === 1 ? Math.PI : 0, r: 7, solid: true, h: 9 });
            P({ kind: 'plane', x: pxm, z: pzm + (q === 1 ? -9 : 9), y: 0, rot: 0, r: 2.6, solid: true, h: 4, hidden: true });   // the tail
            P({ kind: 'plane', x: pxm, z: pzm + (q === 1 ? 9 : -9), y: 0, rot: 0, r: 2.2, solid: true, h: 4, hidden: true });   // the nose
            P({ kind: 'sign', text: 'GOLDPLATE AIR', x: pxm - 1.62, z: pzm + (q === 1 ? -1 : 1), y: 3.3, rot: Math.PI / 2, w: 7, h: 1.0, neon: false, solid: false });
            P({ kind: 'sign', text: 'GOLDPLATE AIR', x: pxm + 1.62, z: pzm + (q === 1 ? -1 : 1), y: 3.3, rot: -Math.PI / 2, w: 7, h: 1.0, neon: false, solid: false });
          });
          // the jet on its plinth at the east end of the south apron
          P({ kind: 'jet', x: lx + lw - 8, z: sz1 + 8, y: 0, rot: Math.PI / 2, r: 2.5, solid: true, h: 5 });
          P({ kind: 'sign', text: 'THE JET: ARRIVING', x: lx + lw - 8, z: sz1 + 3.4, y: 1.6, rot: 0, w: 5, h: 0.9, standing: true, solid: false });
          P({ kind: 'sign', text: def.sign, x: cxm, z: lz + 0.6, y: 2.2, rot: 0, w: 7, h: 1.2, neon: true, standing: true, pole: true, solid: true, r: 0.3 });
          break;
        }
        case 'atc': {
          if (b) {
            facadeSign(def.sign, true, false);
            P({ kind: 'cab', x: b.cx, z: b.cz, y: b.y + b.h + 1.2, rot: Math.PI / 8, r: 0, solid: false, h: 4.7 });
            P({ kind: 'dish', x: b.cx + 3, z: b.cz + 3, y: b.y + b.h + 4.7, rot: R.range(0, 6), r: 0, solid: false, h: 2.5 });
            P({ kind: 'beacon', x: b.cx, z: b.cz, y: b.y + b.h + 5.2, rot: 0, r: 0, solid: false, h: 1, color: '#ff3030' });
            if (def.roofSign) P({ kind: 'sign', text: def.roofSign, x: b.cx, z: b.cz, y: b.y + b.h + 8.2, rot: 0, w: 3.6, h: 3.6, neon: true, solid: false, standing: true, double: true });
          }
          break;
        }
        case 'hangar': {
          if (b) {
            var fh = face(def.door, 0.2);
            P({ kind: 'rolldoor', x: fh.x, z: fh.z, y: b.y, rot: fh.rot, r: 0, solid: false, h: 1, w: 9, d: 6.5 });
            P({ kind: 'sign', text: def.sign, x: fh.x + fh.rx * 0, z: fh.z, y: b.h - 1.2, rot: fh.rot, w: 8, h: 1.4, neon: false, solid: false });
            P({ kind: 'sign', text: def.sign, x: lx + lw - 2.5, z: lz + 2.5, y: 4.5, rot: fh.rot, w: 5, h: 1.3, neon: false, standing: true, pole: true, solid: true, r: 0.3 });
            P({ kind: 'windsock', x: lx + 2, z: lz + 2, y: 0, rot: 0, r: 0.3, solid: true, h: 6 });
            P({ kind: 'pallet', x: b.x - 2.5, z: b.z + b.d - 2, rot: 0.3, r: 0.9, solid: true, h: 1.4 });
            P({ kind: 'pallet', x: b.x + b.w + 2, z: b.z + 2, rot: 1.1, r: 0.9, solid: true, h: 1.4 });
            // the cutout jet, parked diagonally on the south apron (sj_08 jumps it)
            P({ kind: 'plane', x: cxm + 2, z: lz + ld - 11, y: 0, rot: 0.35, r: 4.2, solid: true, h: 5.5, scale: 0.6 });
          }
          break;
        }
        case 'yard': {
          // columns of MERCH containers every 3 tiles, a 2-tile gap every 5 tiles so the lanes cross; stacks 1..3 high by hash
          var cols = C.PAL.containers || ['#c94040'], n2 = 0;
          for (k = 0; k < 6; k++) {
            var cxk2 = (lot.x + 2 + 3 * k) * TILE + 2;
            for (var zt = lot.z + 1; zt < lot.z + lot.d - 1; zt += 1.5) {
              var rowIn = Math.floor((zt - lot.z - 1) / 1.5);
              if (rowIn % 5 === 4) continue;   // the cross lane
              var hgt = 1 + Math.floor(U.hash2(k, rowIn, 41) * 3);
              for (var s2 = 0; s2 < 2; s2++) for (var lvl = 0; lvl < hgt; lvl++) {
                if (lvl > 0 && U.hash2(k, rowIn, 43 + lvl + s2) < 0.25) break;
                P({ kind: 'container', x: cxk2 + (s2 ? 1.35 : -1.35), z: zt * TILE + 3, y: CURB + lvl * 2.6, rot: 0, r: 1.3, solid: lvl === 0, h: 2.6, color: cols[(k * 7 + rowIn * 3 + lvl + s2) % cols.length], hidden: false });
                n2++;
              }
            }
          }
          // a few MERCH stencils facing the lanes (the rest is implied; the one that is merch is not marked)
          for (k = 0; k < 8; k++) {
            var mk = k % 6, mrow = (k * 3) % 10; if (mrow % 5 === 4) mrow++;
            P({ kind: 'sign', text: 'MERCH', x: (lot.x + 2 + 3 * mk) * TILE + 2 + 2.57, z: (lot.z + 1) * TILE + 6 * mrow + 3, y: 1.4, rot: -Math.PI / 2, w: 2.2, h: 0.8, neon: false, solid: false });
          }
          // the Container Clear jump's single-high box across its lane
          P({ kind: 'container', x: (lot.x + 2 + 3 * 3) * TILE + 2 + 6, z: lz + ld - 20, y: CURB, rot: Math.PI / 2, r: 1.3, solid: true, h: 2.6, color: cols[2] });
          // two gantry cranes straddling the east lanes (the legs are the solid part), a kiosk at the gate, the sign
          for (k = 0; k < 2; k++) {
            var crx = (lot.x + 2 + 3 * 4) * TILE + 2 + 6, crz = lz + 16 + k * 34;
            P({ kind: 'crane', x: crx, z: crz, rot: 0, r: 0, solid: false, h: 18 });
            [[-5, -3], [5, -3], [-5, 3], [5, 3]].forEach(function (lg) { P({ kind: 'craneleg', x: crx + lg[0], z: crz + lg[1], rot: 0, r: 0.8, solid: true, h: 16, hidden: true }); });
          }
          P({ kind: 'kiosk', x: lx + 5, z: czm + 6, rot: Math.PI / 2, r: 2.2, solid: true, h: 3, text: 'GATE: ASK INSIDE' });
          P({ kind: 'sign', text: 'GATE: ASK INSIDE', x: lx + 5 - 1.7, z: czm + 6, y: 1.6, rot: Math.PI / 2, w: 3, h: 0.8, solid: false });
          P({ kind: 'sign', text: def.sign, x: lx + 5, z: czm - 6, y: 5.5, rot: Math.PI / 2, w: 6, h: 1.4, neon: false, standing: true, pole: true, solid: true, r: 0.3 });
          lmk.maze = { x: lx + 2 * TILE, z: lz + TILE, w: 18 * TILE, d: ld - 2 * TILE, pitch: 3 * TILE };
          break;
        }
        case 'quay': {
          // three cranes along the water edge, the ship moored half a tile offshore, bollards, loose containers, the sign
          var qz = lz + ld, cranes = def.cranes || 3;
          for (k = 0; k < cranes; k++) {
            var qx = lx + lw * (k + 0.5) / cranes;
            P({ kind: 'crane', x: qx, z: qz - 7, rot: 0, r: 0, solid: false, h: 18 });
            [[-5, -3], [5, -3], [-5, 3], [5, 3]].forEach(function (lg) { P({ kind: 'craneleg', x: qx + lg[0], z: qz - 7 + lg[1], rot: 0, r: 0.8, solid: true, h: 16, hidden: true }); });
          }
          var shipX = cxm, shipZ = qz + 2 + 7;
          P({ kind: 'ship', x: shipX, z: shipZ, y: WATER_Y + 0.4, rot: 0, r: 0, solid: false, h: 14, text: 'THE MANIFEST' });
          for (k = -2; k <= 2; k++) P({ kind: 'ship', x: shipX + k * 12, z: shipZ, y: WATER_Y + 0.4, rot: 0, r: 7, solid: true, h: 14, hidden: true });
          P({ kind: 'sign', text: 'THE MANIFEST', x: shipX, z: shipZ - 7.1, y: WATER_Y + 3.4, rot: 0, w: 10, h: 1.4, neon: false, solid: false });
          for (x = lx + 2; x < lx + lw - 1; x += 3 * TILE) P({ kind: 'bollard', x: x, z: qz - 0.5, r: 0.2, solid: true, h: 0.7 });
          var cols2 = C.PAL.containers || ['#c94040'];
          for (k = 0; k < 8; k++) P({ kind: 'container', x: lx + 4 + U.hash2(k, 51, 7) * (lw - 8), z: lz + 4 + U.hash2(k, 52, 7) * (ld - 14), y: CURB, rot: U.hash2(k, 53, 7) * 3, r: 1.3, solid: true, h: 2.6, color: cols2[k % cols2.length] });
          P({ kind: 'sign', text: def.sign, x: cxm, z: lz + TILE + 0.6, y: 3.2, rot: 0, w: 7, h: 1.3, neon: true, standing: true, pole: true, solid: true, r: 0.3 });
          lmk.ship = { x: shipX, z: shipZ };
          break;
        }
        case 'ferry': {
          // the waiting room, a 2 x 6 tile pier into the water (the dock rule), the ferry alongside, a ticket kiosk, benches, the board
          var fz = lot.z + lot.d, fpx = lot.x + 6, flen = 6;
          for (z = fz; z < Math.min(World.h, fz + flen); z++) for (var dx4 = 0; dx4 < 2; dx4++) { i = z * w + fpx + dx4; if (tiles[i] === T.WATER) { tiles[i] = T.PLAZA; meta[i] |= M.DOCK; } }
          World.piers.push({ tx: fpx, tz: fz, tw: 2, len: flen });
          P({ kind: 'ferryboat', x: (fpx + 2) * TILE + 5.2, z: (fz + 2.5) * TILE, y: WATER_Y + 0.3, rot: 0, r: 0, solid: false, h: 5 });
          for (k = -1; k <= 1; k++) P({ kind: 'ferryboat', x: (fpx + 2) * TILE + 5.2, z: (fz + 2.5) * TILE + k * 7, y: WATER_Y + 0.3, rot: 0, r: 4.5, solid: true, h: 5, hidden: true });
          for (k = 0; k < 3; k++) P({ kind: 'bollard', x: (fpx + 2) * TILE - 0.4, z: (fz + 1 + k * 2) * TILE, r: 0.2, solid: true, h: 0.7 });
          P({ kind: 'kiosk', x: cxm - 9, z: lz + ld - 10, rot: Math.PI, r: 2.2, solid: true, h: 3, text: 'TICKETS: ELSEWHERE $11' });
          P({ kind: 'sign', text: 'TICKETS: ELSEWHERE $11', x: cxm - 9, z: lz + ld - 10 + 1.7, y: 1.6, rot: Math.PI, w: 3.6, h: 0.9, solid: false });
          P({ kind: 'sign', text: 'NEXT FERRY: SOON', x: cxm + 8, z: lz + ld - 6, y: 2.6, rot: 0, w: 5, h: 1.2, neon: true, standing: true, pole: true, solid: true, r: 0.25 });
          for (k = 0; k < 4; k++) P({ kind: 'bench', x: lx + 6 + k * 9, z: lz + ld - 3, rot: Math.PI, r: 0.7, solid: true, h: 0.9 });
          if (b) { facadeSign(def.sign, !!def.neon, true); P({ kind: 'podium', x: b.cx + 3, z: b.z - 1.4, rot: 0, r: 0.5, solid: true, h: 1.3 }); }
          parkStrip(lot.x, lot.z + 1, 2, 6); parkStrip(lot.x + lot.w - 2, lot.z + 1, 2, 6);
          for (k = 0; k < 3; k++) P({ kind: 'palm', x: lx + 10 + k * 14, z: lz + ld - 1.5, r: 0.4, solid: true, scale: R.range(0.9, 1.3), h: 7 });
          break;
        }
        case 'gunshop': {
          if (b) {
            facadeSign(def.sign, true, true, { target: true });
            var fg = face(def.door, 1.1);
            P({ kind: 'awning', x: fg.x, z: fg.z, y: 2.7, rot: fg.rot, r: 0, solid: false, h: 1, w: 4, d: 2, color: '#3fd27f' });
            P({ kind: 'podium', x: fg.x + fg.rx * 2.6, z: fg.z + fg.rz * 2.6, rot: fg.rot, r: 0.5, solid: true, h: 1.3 });
            lmk.npcs.push({ role: 'clerk', cast: 'merle', x: fg.x - fg.rx * 2.4, z: fg.z - fg.rz * 2.4, yaw: fg.rot });   // the other side of the door from the podium, facing the street
            if (def.flagship) {
              // the range: a fenced 8 x 28 m lane down the lot's west side with six cardboard hecklers in a column
              var rx0 = lx + 8, rz0 = lz + 1, rz1 = lz + Math.min(ld - 1, 29);
              for (z = rz0; z < rz1; z += 4) P({ kind: 'fence', x: rx0, z: z + 2, rot: 0, r: 0, solid: false, h: 2, sz: 1 });
              for (x = lx + 0.5; x < rx0; x += 4) P({ kind: 'fence', x: x + 2, z: rz0, rot: Math.PI / 2, r: 0, solid: false, h: 2 });
              for (k = 0; k < 6; k++) {
                P({ kind: 'cutout', x: lx + 4, z: rz0 + 5 + k * 3.6, rot: Math.PI, r: 0.4, solid: true, h: 2, color: '#e8dcc2' });
                P({ kind: 'sign', text: 'WRONG', x: lx + 4, z: rz0 + 5 + k * 3.6 + 0.06, y: 1.05, rot: Math.PI, w: 0.8, h: 0.32, neon: false, solid: false });
              }
              P({ kind: 'sign', text: 'ASK ABOUT OUR LOANER', x: lx + 4, z: rz1 - 0.8, y: 1.8, rot: 0, w: 5, h: 1.0, standing: true, solid: false });
              lmk.range = { x: lx, z: rz0, w: 8, d: rz1 - rz0, cutouts: 6 };
            }
          }
          break;
        }
        case 'museum': {
          if (b) {
            facadeSign(def.sign, false, true);
            var fm = face(def.door, 1.5);
            for (k = 0; k < 6; k++) P({ kind: 'column', x: fm.x + fm.rx * ((k + 0.5) / 6 - 0.5) * (fm.len - 2), z: fm.z + fm.rz * ((k + 0.5) / 6 - 0.5) * (fm.len - 2), rot: 0, r: 0.5, solid: true, h: 8.5 });
            P({ kind: 'steps', x: fm.x + fm.rx * 0 + (fm.rot === Math.PI / 2 ? -2.2 : fm.rot === -Math.PI / 2 ? 2.2 : 0), z: fm.z + (fm.rot === 0 ? -2.2 : fm.rot === Math.PI ? 2.2 : 0), y: 0, rot: fm.rot, r: 0, solid: false, h: 1, w: fm.len - 2, d: 3 });
            P({ kind: 'sign', text: 'THE TAKE: 1,000 YEARS OF SAYING IT LOUDER', x: fm.x + fm.rx * (fm.len / 2 - 1), z: fm.z + fm.rz * (fm.len / 2 - 1) + (fm.rz ? 0 : 0), y: 6.5, rot: fm.rot, w: 2.6, h: 5, neon: false, standing: true, pole: true, solid: true, r: 0.2, banner: true });
            P({ kind: 'sign', text: 'NOW SHOWING: YOUR COMMENTS', x: fm.x - fm.rx * (fm.len / 2 - 1), z: fm.z - fm.rz * (fm.len / 2 - 1), y: 6.5, rot: fm.rot, w: 2.6, h: 5, neon: false, standing: true, pole: true, solid: true, r: 0.2, banner: true });
            var stx = fm.x + (fm.rot === Math.PI / 2 ? -6.5 : fm.rot === -Math.PI / 2 ? 6.5 : 0), stz = fm.z + (fm.rot === 0 ? -6.5 : fm.rot === Math.PI ? 6.5 : 0);
            P({ kind: 'statue_table', x: stx, z: stz, rot: fm.rot, r: 1.2, solid: true, h: 3 });
            P({ kind: 'sign', text: 'THE FIRST TAKE (ATTRIBUTED)', x: stx, z: stz + 1.5, y: 0.7, rot: Math.PI, w: 2.6, h: 0.5, solid: false });
            for (k = 0; k < 4; k++) P({ kind: 'stanchion', x: fm.x + fm.rx * (k - 1.5) * 2.2 + (fm.rot === Math.PI / 2 ? -3.8 : fm.rot === -Math.PI / 2 ? 3.8 : 0), z: fm.z + fm.rz * (k - 1.5) * 2.2 + (fm.rot === 0 ? -3.8 : fm.rot === Math.PI ? 3.8 : 0), rot: fm.rot, r: 0.2, solid: true, h: 1 });
            trees(4, 61);
          }
          break;
        }
        case 'bridge': {
          var bx0 = lot.x, bx1 = lot.x + lot.w, bz0 = lot.z, bz1 = lot.z + lot.d;
          if (def.gantry) {
            // the Sponsor Span: a toll gantry over the lanes at each end, lamps along the walkways, a board on the south abutment
            var gxm = (bx0 + bx1) / 2 * TILE, spanW = 4 * TILE + 1.6;
            [bz0 * TILE + 10, bz1 * TILE - 6].forEach(function (gz2, q) {
              P({ kind: 'gantry', x: gxm, z: gz2, y: 0, rot: 0, r: 0, solid: false, h: 1, w: spanW });
              P({ kind: 'sign', text: def.gantry, x: gxm, z: gz2 + (q ? 0.3 : -0.3), y: 6.2, rot: q ? 0 : Math.PI, w: 11, h: 1.3, neon: true, solid: false });
              [[-1, 0], [1, 0]].forEach(function (s3) { P({ kind: 'craneleg', x: gxm + s3[0] * (spanW / 2 + 0.4), z: gz2, rot: 0, r: 0.4, solid: true, h: 6.5, hidden: true }); });
            });
            for (z = bz0 + 2; z < bz1 - 1; z += 4) {
              P({ kind: 'lamp', x: gxm - 2 * TILE - 2.2, z: (z + 0.5) * TILE, rot: -Math.PI / 2, r: 0.2, solid: true, h: 7 });
              P({ kind: 'lamp', x: gxm + 2 * TILE + 2.2, z: (z + 0.5) * TILE, rot: Math.PI / 2, r: 0.2, solid: true, h: 7 });
            }
            var adsB = (GTP.Content.world.billboards && GTP.Content.world.billboards.ads) || [];
            if (adsB.length) P({ kind: 'billboard', text: adsB[adsB.length - 5] || adsB[0], x: gxm + 2 * TILE + 5.5, z: bz1 * TILE + 3, y: 6.5, rot: 0, w: 9, h: 3.4, neon: true, solid: true, r: 0.5, pole: true, h2: 9, abutment: true });
          }
          if (def.signs) {
            // the causeway: a gold sign at the island end, a brass plaque at the uptown end reading NO
            var czc = (bz0 + bz1) / 2 * TILE;
            if (def.signs.island) P({ kind: 'sign', text: def.signs.island, x: bx0 * TILE + 1.5, z: czc - 2 * TILE - 2.4, y: 3.4, rot: -Math.PI / 2, w: 8, h: 1.5, neon: true, standing: true, pole: true, solid: true, r: 0.3, gold: true });
            if (def.signs.uptown) P({ kind: 'sign', text: def.signs.uptown, x: bx1 * TILE - 1.5, z: czc - 2 * TILE - 2.4, y: 1.4, rot: Math.PI / 2, w: 1.6, h: 0.9, neon: false, standing: true, solid: false, brass: true });
          }
          break;
        }
        default:
          facadeSign(def.sign, !!def.neon, def.kind === 'mall' || def.kind === 'hospital');
      }
      void parkTile;
    },

    // sidewalk tile adjacent to a road, nearest the lot's preferred side
    _placeDoor: function (lmk) {
      var w = World.w, tiles = World.tiles, meta = World.meta, def = lmk.def || {};
      function ok(tx, tz) {
        if (!World.inBounds(tx, tz) || tiles[tz * w + tx] !== T.SIDEWALK) return false;
        for (var k = 0; k < 4; k++) { var t = World.tile(tx + DIRS[k][0], tz + DIRS[k][1]); if (t === T.ROAD || t === T.BRIDGE) return true; }
        return false;
      }
      if (def.doorAt && ok(def.doorAt.tx, def.doorAt.tz)) { lmk.door = World._doorAt(def.doorAt.tx, def.doorAt.tz); return; }
      var b = lmk.building, lot = lmk.lot, side = def.door || 's';
      var fx, fz;
      if (b) {
        fx = b.cx; fz = b.cz;
        if (side === 's') fz = b.z + b.d; else if (side === 'n') fz = b.z; else if (side === 'e') fx = b.x + b.w; else fx = b.x;
      } else {
        fx = (lot.x + lot.w / 2) * TILE; fz = (lot.z + lot.d / 2) * TILE;
        if (side === 's') fz = (lot.z + lot.d) * TILE; else if (side === 'n') fz = lot.z * TILE; else if (side === 'e') fx = (lot.x + lot.w) * TILE; else fx = lot.x * TILE;
      }
      var best = null, bestD = 1e9, tx0 = Math.floor(fx / TILE), tz0 = Math.floor(fz / TILE);
      for (var r = 0; r <= 10 && !best; r++) {
        for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          var tx = tx0 + dx, tz = tz0 + dz;
          if (!ok(tx, tz)) continue;
          var inLot = tx >= lot.x && tx < lot.x + lot.w && tz >= lot.z && tz < lot.z + lot.d;
          var d = Math.abs((tx + 0.5) * TILE - fx) + Math.abs((tz + 0.5) * TILE - fz) + (inLot ? 0 : 6);
          if (d < bestD) { bestD = d; best = { tx: tx, tz: tz }; }
        }
        if (best && r >= 2) break;
      }
      if (best) lmk.door = World._doorAt(best.tx, best.tz);
      else lmk.door = { x: fx, z: fz, y: CURB, tx: tx0, tz: tz0 };
      void meta;
    },
    _doorAt: function (tx, tz) { return { x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE, y: CURB, tx: tx, tz: tz }; },

    // lamps, signals, hydrants, trees, benches, pillars, promenade, bridge pylons
    _furnish: function (styleAt, parkTile, seed, R) {
      var w = World.w, h = World.h, tiles = World.tiles, meta = World.meta, deck = World.deck, P = World._prop;
      var x, z, ii, t, st, hv;
      var isRoad = function (tx, tz) { var tt = World.tile(tx, tz); return tt === T.ROAD || tt === T.BRIDGE; };
      for (z = 0; z < h; z++) for (x = 0; x < w; x++) {
        ii = z * w + x; t = tiles[ii]; st = styleAt(x, z);
        var d = World.districtAt((x + 0.5) * TILE, (z + 0.5) * TILE), did = d ? d.id : '';
        if (t === T.SIDEWALK && !(meta[ii] & M.WALKWAY)) {
          var rl = isRoad(x - 1, z), rr = isRoad(x + 1, z), ru = isRoad(x, z - 1), rd = isRoad(x, z + 1);
          var anyRoad = rl || rr || ru || rd;
          hv = U.hash2(x, z, seed);
          var cx = (x + 0.5) * TILE, cz = (z + 0.5) * TILE;
          var ox = rl ? -1.35 : rr ? 1.35 : 0, oz = ru ? -1.35 : rd ? 1.35 : 0;
          // traffic signals on the corner tile diagonal to an intersection
          var corner = (rl || rr) && (ru || rd);
          var dxs = rl ? -1 : 1, dzs = ru ? -1 : 1;
          if (corner && World.isIntersection(x + dxs, z + dzs) && (st.signals || (World.metaAt(x + dxs, z + dzs) & M.AVENUE))) {
            P({ kind: 'signal', x: cx + dxs * 1.4, z: cz + dzs * 1.4, rot: Math.atan2(-dxs, -dzs) + Math.PI / 4, r: 0.25, solid: true, h: 5 });
            continue;
          }
          if (st.lamps && anyRoad && ((x + z) % 6 === 0) && !corner && hv < 0.9) {
            P({ kind: 'lamp', x: cx + ox, z: cz + oz, rot: rl ? Math.PI / 2 : rr ? -Math.PI / 2 : ru ? 0 : Math.PI, r: 0.2, solid: true, h: 7 });
          } else if (hv > 0.975 && anyRoad && !corner) {
            P({ kind: 'hydrant', x: cx + ox * 0.8, z: cz + oz * 0.8, r: 0.25, solid: true, h: 0.8 });
          } else if (st.trees > 0.3 && anyRoad && !corner && ((x + z) % 6 === 3) && hv < 0.8) {
            P({ kind: did === 'marina' ? 'palm' : 'tree', x: cx - ox * 0.5, z: cz - oz * 0.5, r: 0.4, solid: true, scale: 0.8 + hv * 0.5, h: 7 });
          } else if (hv > 0.94 && hv < 0.96 && anyRoad && (did === 'downtown' || did === 'strip' || did === 'capitol')) {
            P({ kind: 'bin', x: cx + ox * 0.7, z: cz + oz * 0.7, r: 0.3, solid: true, h: 1 });
          }
        } else if (t === T.GRASS) {
          var p = parkTile[ii] === 1 ? 0.2 : st.trees * 0.22;
          if (meta[ii] & M.LAWN) p = 0.03;
          var hv2 = U.hash2(x, z, seed + 7);
          if (hv2 < p) P({ kind: did === 'marina' ? 'palm' : 'tree', x: (x + 0.5) * TILE + (U.hash2(x, z, 3) - 0.5) * 2.6, z: (z + 0.5) * TILE + (U.hash2(x, z, 4) - 0.5) * 2.6, r: 0.45, solid: true, scale: 0.8 + U.hash2(x, z, 5) * 0.7, h: 7 });
          else if (parkTile[ii] === 1 && hv2 > 0.9) P({ kind: 'bench', x: (x + 0.5) * TILE, z: (z + 0.5) * TILE, rot: U.hash2(x, z, 6) < 0.5 ? 0 : Math.PI / 2, r: 0.7, solid: true, h: 0.9 });
        } else if (t === T.PLAZA && parkTile[ii] >= 2) {
          // a promenade: bollards (or a railing) at the water edge, benches and trees inland
          var prom = World.promenades[parkTile[ii] - 2], railW = prom && prom.rail === 'w';
          var waterE = railW ? (World.tile(x - 1, z) === T.SAND || World.tile(x - 1, z) === T.WATER) && x === prom.x : World.tile(x + 1, z) === T.WATER;
          var hv3 = U.hash2(x, z, seed + 9);
          if (waterE && railW) { P({ kind: 'railing', x: x * TILE + 0.3, z: (z + 0.5) * TILE, rot: 0, r: 0, solid: false, h: 1 }); if (z % 2 === 0) P({ kind: 'bollard', x: x * TILE + 0.9, z: (z + 0.5) * TILE, r: 0.2, solid: true, h: 0.7, hidden: true }); }
          else if (waterE && (z % 2 === 0)) P({ kind: 'bollard', x: (x + 1) * TILE - 0.5, z: (z + 0.5) * TILE, r: 0.2, solid: true, h: 0.7 });
          else if (!waterE && hv3 > 0.8 && (z % 3 === 0)) P({ kind: 'tree', x: (x + 0.5) * TILE, z: (z + 0.5) * TILE, r: 0.45, solid: true, scale: 1 + hv3 * 0.3, h: 7 });
          else if (!waterE && hv3 > 0.6 && hv3 < 0.7) P({ kind: 'bench', x: (x + 0.5) * TILE, z: (z + 0.5) * TILE, rot: railW ? Math.PI / 2 : -Math.PI / 2, r: 0.7, solid: true, h: 0.9 });
          else if (!waterE && hv3 < 0.08 && (z % 5 === 0)) P({ kind: 'lamp', x: (x + 0.5) * TILE, z: (z + 0.5) * TILE, rot: railW ? -Math.PI / 2 : Math.PI / 2, r: 0.2, solid: true, h: 7 });
        } else if (t === T.PARKING && (meta[ii] & M.YARD) && !(meta[ii] & M.LOT) && U.hash2(x, z, seed + 11) > 0.93) {
          P({ kind: 'crate', x: (x + 0.5) * TILE, z: (z + 0.5) * TILE, rot: U.hash2(x, z, 13) * 1.5, r: 0.9, solid: true, h: 1.3 });
        }
        // deck pillars along each leg's centerline, skipping roads that pass beneath (then the leg's outer edges carry
        // it); over water the viaduct stands on taller pylons rising from the sea bed
        if (deck[ii]) {
          var dm = World.dmeta[ii], isH = (dm & M.H) && !(dm & M.V), isV = (dm & M.V) && !(dm & M.H);
          var lane = isH ? (World.dlaneH[ii] >> 4) : isV ? (World.dlaneV[ii] >> 4) : -1;
          if (lane === 1) {
            var along = isH ? x : z;
            if (along % 3 === 0) {
              var tOther = isH ? World.tile(x, z + 1) : World.tile(x + 1, z);
              var blocks = function (tt) { return tt === T.ROAD || tt === T.BRIDGE || tt === T.RAMP || tt === T.WATER || tt === T.BUILDING; };
              var pxm = isH ? (x + 0.5) * TILE : (x + 1) * TILE, pzm = isH ? (z + 1) * TILE : (z + 0.5) * TILE;
              if (t === T.WATER && tOther === T.WATER) {
                P({ kind: 'pillar', x: pxm, z: pzm, y: WATER_Y - 2.5, r: 0.9, solid: true, h: DECK_Y - C.DECK_THICK + 0.05 - WATER_Y + 2.5, scale: 1.4 });
              } else if (!blocks(t) && !blocks(tOther)) {
                P({ kind: 'pillar', x: pxm, z: pzm, y: 0, r: 0.7, solid: true, h: DECK_Y - C.DECK_THICK + 0.05 });
              } else if (t !== T.WATER) {
                // a street runs under the leg: pillars on the plaza either side of it
                var oa = isH ? [x, z - 2, x, z + 3] : [x - 2, z, x + 3, z];
                [[oa[0], oa[1]], [oa[2], oa[3]]].forEach(function (oc) {
                  var ot = World.tile(oc[0], oc[1]);
                  if (ot === T.PLAZA || ot === T.SIDEWALK || ot === T.PARKING || ot === T.GRASS) P({ kind: 'pillar', x: (oc[0] + 0.5) * TILE, z: (oc[1] + 0.5) * TILE, y: 0, r: 0.7, solid: true, h: DECK_Y - C.DECK_THICK + 0.05 });
                });
              }
            }
          }
        }
        // bridge pylons in the water beside the deck
        if (t === T.SIDEWALK && (meta[ii] & M.WALKWAY)) {
          var alongB = (World.tile(x - 1, z) === T.BRIDGE || World.tile(x + 1, z) === T.BRIDGE) ? z : x;
          if (alongB % 4 === 2) {
            var wx = (x + 0.5) * TILE, wz = (z + 0.5) * TILE;
            P({ kind: 'pillar', x: wx, z: wz, y: WATER_Y - 2.5, r: 0, solid: false, h: 2.5 + CURB - 0.05, scale: 0.8 });
          }
        }
      }
      // boats along the marina shore
      var CW = GTP.Content.world;
      var marina = World.districts.filter(function (dd) { return dd.id === 'marina'; })[0];
      if (marina) {
        // the district rect reaches over the bay (for the Sponsor Span), so find the shore: the first water tile south of the docks
        for (x = marina.x + 2; x < marina.x + marina.w - 2; x += 5) {
          for (z = marina.z + 1; z < marina.z + marina.h; z++) if (World.tile(x, z) === T.WATER && World.tile(x, z - 1) !== T.WATER) break;
          if (z >= marina.z + marina.h || World.deckAt(x, z) || World.tile(x, z - 1) === T.BRIDGE) continue;
          if (U.hash2(x, 1, seed) > 0.4) {
            P({ kind: 'boat', x: (x + 0.5) * TILE, z: (z + 1.2) * TILE, y: WATER_Y + 0.35, rot: Math.PI / 2 + U.hash2(x, 2, seed) * 0.3, r: 1.8, solid: true, h: 2.2, color: R.pick(['#f4f4f4', '#e8e2c8', '#2b4c7e', '#c94040', '#f0c050']) });
          }
        }
      }
      // sponsor billboards along the Loop's outer shoulders, the strip, and the expansion's roads
      var ads = (CW.billboards && CW.billboards.ads) || [];
      // each board faces the Loop leg (or the road) beside it: yaw -PI/2 faces east, PI/2 west
      var adSpots = [[42, 50, -Math.PI / 2], [42, 80, -Math.PI / 2], [109, 42, Math.PI / 2], [109, 86, Math.PI / 2], [60, 30, Math.PI], [90, 30, Math.PI], [60, 97, 0], [90, 97, 0], [75, 108, 0],
        [42, 110, -Math.PI / 2], [109, 120, Math.PI / 2],                     // the Lower Loop's legs over the Strip and the Docks
        [60, 162, Math.PI], [90, 162, Math.PI], [40, 183, 0], [72, 197, 0],     // the airport: under the south leg, along Lost Luggage and Final Boarding
        [121, 159, 0], [160, 183, 0], [200, 197, 0],                            // the port
        [180, 23, Math.PI], [212, 72, Math.PI / 2], [180, 143, 0]];             // uptown
      for (var k = 0; k < adSpots.length && ads.length; k++) {
        var sx = adSpots[k][0], sz = adSpots[k][1], tt = World.tile(sx, sz);
        if (tt !== T.PLAZA && tt !== T.GRASS && tt !== T.SIDEWALK && tt !== T.PARKING) continue;
        if (World.deckAt(sx, sz)) continue;
        P({ kind: 'billboard', text: ads[k % ads.length], x: (sx + 0.5) * TILE, z: (sz + 0.5) * TILE, y: 6.5, rot: adSpots[k][2], w: 9, h: 3.4, neon: k % 3 === 0, solid: true, r: 0.5, pole: true, h: 9 });
      }
      // the Shoreline Stroll: the second set of billboard pairs face each other along the walk
      var pairs = (CW.billboards && CW.billboards.pairs) || [], strollIdx = (CW.billboards && CW.billboards.stroll) || [];
      World.promenades.forEach(function (pr) {
        if (!pr.billboards || !strollIdx.length) return;
        for (var q = 0; q < strollIdx.length; q++) {
          var pair = pairs[strollIdx[q]]; if (!pair) continue;
          var bz = (pr.z + 4) * TILE + q * ((pr.h - 8) * TILE) / Math.max(1, strollIdx.length - 1);
          P({ kind: 'billboard', text: pair[0], x: pr.x * TILE + 2.2, z: bz, rot: -Math.PI / 2, w: 6, h: 3, y: 2.2, neon: q % 2 === 0, solid: true, r: 0.6, promenade: pr.id, pair: q, side: 0 });
          P({ kind: 'billboard', text: pair[1], x: (pr.x + pr.w) * TILE - 2.2, z: bz, rot: Math.PI / 2, w: 6, h: 3, y: 2.2, neon: q % 2 === 1, solid: true, r: 0.6, promenade: pr.id, pair: q, side: 1 });
        }
      });
    }
  };
})();
