/* Grand Theft Pundit: 09_render.js
 * GTP.Render: camera, chunk cache for the static world, procedural sprites,
 * effects, markers, day/night tint and lights, debug overlay.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util, PAL = C.PAL;
  var TILE = C.TILE, CH = C.CHUNK_TILES, CHPX = CH * TILE;
  var VW = C.VIEW_W, VH = C.VIEW_H;
  var W = null, T = null, M = null; // bound at init (World enums)

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function ellipse(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, U.TAU); }

  var Render = GTP.Render = {
    canvas: null, ctx: null,
    cam: { x: 0, y: 0, zoom: 1, shake: 0, free: false, _px: 0, _py: 0, targetZoom: 0 }, // targetZoom 0 = automatic (foot/vehicle)
    scale: 1, dpr: 1, offX: 0, offY: 0, cssW: VW, cssH: VH,
    night: 0,
    lights: [],
    chunks: new Map(),
    _buckets: null,
    _lampGlow: null,
    time: 0,
    stats: { chunkPaints: 0, drawnEntities: 0, frameMs: 0 },

    // ---------------------------------------------------------------- init --
    init: function (canvas) {
      Render.canvas = canvas;
      Render.ctx = canvas.getContext('2d', { alpha: false });
      W = GTP.World; T = W.T; M = W.M;
      Render.resize();
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', Render.resize);
        if (window.ResizeObserver) { try { new ResizeObserver(Render.resize).observe(canvas); } catch (e) { /* optional */ } }
      }
    },
    resize: function () {
      var cv = Render.canvas; if (!cv) return;
      var cssW = cv.clientWidth || VW, cssH = cv.clientHeight || VH;
      var dpr = Math.min(C.MAX_DPR, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      var bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      Render.cssW = cssW; Render.cssH = cssH; Render.dpr = dpr;
      Render.scale = Math.min(cssW / VW, cssH / VH);
      Render.offX = (cssW - VW * Render.scale) / 2;
      Render.offY = (cssH - VH * Render.scale) / 2;
    },
    clientToLogical: function (px, py) { return { x: (px - Render.offX) / Render.scale, y: (py - Render.offY) / Render.scale }; },
    worldToScreen: function (x, y) {
      var cam = Render.cam;
      return { x: (x - cam.x) * cam.zoom + VW / 2, y: (y - cam.y) * cam.zoom + VH / 2 };
    },
    screenToWorld: function (sx, sy) {
      var cam = Render.cam;
      return { x: (sx - VW / 2) / cam.zoom + cam.x, y: (sy - VH / 2) / cam.zoom + cam.y };
    },
    viewRect: function () {
      var cam = Render.cam, z = cam.zoom || 1;
      return { x: cam.x - VW / 2 / z, y: cam.y - VH / 2 / z, w: VW / z, h: VH / z };
    },

    // -------------------------------------------------------------- camera --
    snapCamera: function () {
      var g = GTP.game, p = g && g.player; if (!p) return;
      Render.cam.x = Render.cam._px = p.x; Render.cam.y = Render.cam._py = p.y;
    },
    updateCamera: function (dt) {
      var cam = Render.cam;
      cam._px = cam.x; cam._py = cam.y;
      if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - cam.shake * C.CAMERA.shakeDecay * dt - 2 * dt);
      if (cam.free) return;
      var g = GTP.game, p = g && g.player; if (!p) return;
      var K = C.CAMERA, veh = p.vehicle;
      var vx = veh ? veh.vx : p.vx, vy = veh ? veh.vy : p.vy;
      var lead = veh ? K.leadVehicle : K.leadFoot;
      var lx = U.clamp(vx * lead, -K.maxLead, K.maxLead), ly = U.clamp(vy * lead, -K.maxLead, K.maxLead);
      var fx = veh ? veh.x : p.x, fy = veh ? veh.y : p.y;
      var k = 1 - Math.exp(-K.smooth * dt);
      cam.x += (fx + lx - cam.x) * k;
      cam.y += (fy + ly - cam.y) * k;
      var tz = cam.targetZoom || (veh ? K.zoomVehicle : K.zoomFoot);
      cam.zoom += (tz - cam.zoom) * (1 - Math.exp(-K.zoomSmooth * dt));
      // keep the view inside the map
      var hw = VW / 2 / cam.zoom, hh = VH / 2 / cam.zoom;
      var mw = W.w * TILE, mh = W.h * TILE;
      cam.x = U.clamp(cam.x, Math.min(hw, mw / 2), Math.max(mw - hw, mw / 2));
      cam.y = U.clamp(cam.y, Math.min(hh, mh / 2), Math.max(mh - hh, mh / 2));
    },

    // --------------------------------------------------------------- frame --
    frame: function (alpha) {
      var ctx = Render.ctx; if (!ctx) return;
      var t0 = U.now();
      if (alpha == null) alpha = 1;
      var cam = Render.cam;
      var cx = U.lerp(cam._px, cam.x, alpha), cy = U.lerp(cam._py, cam.y, alpha), z = cam.zoom;
      if (cam.free) { cx = cam.x; cy = cam.y; }
      if (cam.shake > 0) {
        var s = cam.shake, tt = Render.time * 60;
        cx += Math.sin(tt * 1.7) * s; cy += Math.cos(tt * 2.3) * s;
      }
      // pixel-snap the camera in screen space to avoid chunk shimmer
      cx = Math.round(cx * z) / z; cy = Math.round(cy * z) / z;
      var g = GTP.game;
      if (g && g.time) Render.night = Render.nightFromClock(g.time.clock);
      Render.time = (g && g.time) ? g.time.t : Render.time;

      ctx.setTransform(Render.scale * Render.dpr, 0, 0, Render.scale * Render.dpr, Render.offX * Render.dpr, Render.offY * Render.dpr);
      // letterbox fill
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = PAL.bg;
      ctx.fillRect(0, 0, Render.canvas.width, Render.canvas.height);
      ctx.restore();

      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();
      ctx.translate(VW / 2, VH / 2);
      ctx.scale(z, z);
      ctx.translate(-cx, -cy);
      var view = { x: cx - VW / 2 / z, y: cy - VH / 2 / z, w: VW / z, h: VH / z };
      Render.drawWorld(ctx, view);
      Render.fx.drawGround(ctx, view);
      Render.drawMarkers(ctx, view);
      Render.drawEntities(ctx, view, alpha);
      Render.fx.draw(ctx, view);
      Render.drawNight(ctx, view);
      if (g && g.debugMode) Render.drawDebugWorld(ctx, view);
      ctx.restore();

      // screen-space layers
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();
      if (GTP.UI && GTP.UI.draw) { try { GTP.UI.draw(ctx); } catch (e) { U.reportError(e, 'ui.draw'); } }
      if (g && g.debugMode) Render.drawDebugHud(ctx);
      ctx.restore();
      Render.lights.length = 0;
      Render.stats.frameMs = U.now() - t0;
    },

    nightFromClock: function (c) {
      var D = C.DAY;
      if (c >= D.darkStart || c < D.dawnStart) return 1;
      if (c >= D.duskStart) return U.smoothstep((c - D.duskStart) / (D.darkStart - D.duskStart));
      if (c < D.dayStart) return 1 - U.smoothstep((c - D.dawnStart) / (D.dayStart - D.dawnStart));
      return 0;
    },

    // ---------------------------------------------------------- chunk cache --
    invalidateAll: function () { Render.chunks.clear(); Render._buckets = null; },
    invalidateChunk: function (cx, cy) { Render.chunks.delete(cy * 4096 + cx); },
    _buildBuckets: function () {
      var nx = Math.ceil(W.w / CH), ny = Math.ceil(W.h / CH);
      var B = Render._buckets = { nx: nx, ny: ny, buildings: [], props: [], lots: [] };
      for (var i = 0; i < nx * ny; i++) { B.buildings.push([]); B.props.push([]); B.lots.push([]); }
      function put(list, x0, y0, x1, y1, item) {
        var cx0 = Math.max(0, Math.floor(x0 / CHPX)), cy0 = Math.max(0, Math.floor(y0 / CHPX));
        var cx1 = Math.min(nx - 1, Math.floor(x1 / CHPX)), cy1 = Math.min(ny - 1, Math.floor(y1 / CHPX));
        for (var cy = cy0; cy <= cy1; cy++) for (var cx = cx0; cx <= cx1; cx++) list[cy * nx + cx].push(item);
      }
      W.buildings.forEach(function (b) { put(B.buildings, b.x - 8, b.y - 8, b.x + b.w + 48, b.y + b.h + 48, b); });
      W.props.forEach(function (p) { var r = (p.len || p.w || p.r || 24) + 40; put(B.props, p.x - r, p.y - r, p.x + r, p.y + r, p); });
      W.lots.forEach(function (l) { put(B.lots, l.x, l.y, l.x + l.w, l.y + l.h, l); });
    },
    getChunk: function (cx, cy) {
      var key = cy * 4096 + cx, ch = Render.chunks.get(key);
      if (ch) { Render.chunks.delete(key); Render.chunks.set(key, ch); return ch; }
      ch = Render.paintChunk(cx, cy);
      Render.chunks.set(key, ch);
      while (Render.chunks.size > C.CHUNK_CACHE_MAX) {
        var first = Render.chunks.keys().next().value;
        Render.chunks.delete(first);
      }
      return ch;
    },
    drawWorld: function (ctx, view) {
      if (!W || !W.tiles) return;
      var cx0 = Math.floor(view.x / CHPX), cy0 = Math.floor(view.y / CHPX);
      var cx1 = Math.floor((view.x + view.w) / CHPX), cy1 = Math.floor((view.y + view.h) / CHPX);
      var nx = Math.ceil(W.w / CH), ny = Math.ceil(W.h / CH);
      ctx.fillStyle = PAL.waterDeep;
      ctx.fillRect(view.x - 4, view.y - 4, view.w + 8, view.h + 8);
      for (var cy = cy0; cy <= cy1; cy++) for (var cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cy < 0 || cx >= nx || cy >= ny) continue;
        var ch = Render.getChunk(cx, cy);
        ctx.drawImage(ch, cx * CHPX, cy * CHPX);
      }
    },

    paintChunk: function (cx, cy) {
      if (!Render._buckets) Render._buildBuckets();
      Render.stats.chunkPaints++;
      var cv = makeCanvas(CHPX, CHPX), ctx = cv.getContext('2d');
      var ox = cx * CHPX, oy = cy * CHPX;
      ctx.translate(-ox, -oy);
      var tx0 = cx * CH, ty0 = cy * CH;
      var tx, ty;
      // pass 1: ground tiles
      for (ty = ty0; ty < ty0 + CH; ty++) for (tx = tx0; tx < tx0 + CH; tx++) Render.paintTile(ctx, tx, ty);
      // pass 2: curbs + road markings (need neighbours)
      for (ty = ty0; ty < ty0 + CH; ty++) for (tx = tx0; tx < tx0 + CH; tx++) Render.paintTileOverlay(ctx, tx, ty);
      var B = Render._buckets, bi = cy * B.nx + cx;
      // pass 3: parking bays
      var lots = B.lots[bi];
      for (var i = 0; i < lots.length; i++) Render.paintLot(ctx, lots[i]);
      // pass 4: building shadows, then roofs
      var blds = B.buildings[bi];
      for (i = 0; i < blds.length; i++) Render.paintShadow(ctx, blds[i]);
      for (i = 0; i < blds.length; i++) Render.paintBuilding(ctx, blds[i]);
      // pass 5: props
      var props = B.props[bi];
      for (i = 0; i < props.length; i++) Render.paintProp(ctx, props[i]);
      return cv;
    },

    // --------------------------------------------------------------- tiles --
    paintTile: function (ctx, tx, ty) {
      var t = W.tile(tx, ty), x = tx * TILE, y = ty * TILE;
      var m = W.metaAt(tx, ty), hv = U.hash2(tx, ty, 1);
      switch (t) {
        case T.VOID: ctx.fillStyle = PAL.void; ctx.fillRect(x, y, TILE, TILE); break;
        case T.WATER: Render.paintWater(ctx, tx, ty, x, y, hv); break;
        case T.GRASS:
          ctx.fillStyle = hv < 0.33 ? PAL.grass : hv < 0.66 ? PAL.grassDark : PAL.grassLight;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = PAL.grass; ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(0,0,0,' + (0.04 + hv * 0.06) + ')'; ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = PAL.grassLight;
          for (var k = 0; k < 4; k++) { var hx = U.hash2(tx, ty, 20 + k), hy = U.hash2(tx, ty, 30 + k); ctx.fillRect(x + (hx * 28) | 0, y + (hy * 28) | 0, 2, 2); }
          ctx.fillStyle = PAL.grassDark;
          for (k = 0; k < 3; k++) { hx = U.hash2(tx, ty, 40 + k); hy = U.hash2(tx, ty, 50 + k); ctx.fillRect(x + (hx * 28) | 0, y + (hy * 28) | 0, 3, 2); }
          break;
        case T.SAND:
          ctx.fillStyle = PAL.sand; ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(0,0,0,' + (hv * 0.05) + ')'; ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = PAL.sandDark;
          for (k = 0; k < 5; k++) { hx = U.hash2(tx, ty, 60 + k); hy = U.hash2(tx, ty, 70 + k); ctx.fillRect(x + (hx * 30) | 0, y + (hy * 30) | 0, 2, 2); }
          break;
        case T.SIDEWALK:
          if (m & M.SHOULDER) { ctx.fillStyle = PAL.shoulder; ctx.fillRect(x, y, TILE, TILE); ctx.fillStyle = 'rgba(0,0,0,' + (hv * 0.08) + ')'; ctx.fillRect(x, y, TILE, TILE); }
          else {
            ctx.fillStyle = PAL.sidewalk; ctx.fillRect(x, y, TILE, TILE);
            ctx.fillStyle = 'rgba(0,0,0,' + (hv * 0.07) + ')'; ctx.fillRect(x, y, TILE, TILE);
            ctx.fillStyle = PAL.sidewalkLine;
            ctx.fillRect(x + 15, y, 1, TILE); ctx.fillRect(x, y + 15, TILE, 1);
            if (hv > 0.9) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x + 4, y + 20, 10, 1); ctx.fillRect(x + 13, y + 21, 6, 1); }
          }
          break;
        case T.PLAZA:
          if (m & M.DOCK) Render.paintDock(ctx, tx, ty, x, y);
          else {
            var path = (m & M.PATH) !== 0;
            ctx.fillStyle = path ? '#b7a98a' : PAL.plaza; ctx.fillRect(x, y, TILE, TILE);
            ctx.fillStyle = 'rgba(0,0,0,' + (hv * 0.06) + ')'; ctx.fillRect(x, y, TILE, TILE);
            ctx.fillStyle = path ? '#a4967a' : PAL.plazaLine;
            ctx.fillRect(x + 15, y, 1, TILE); ctx.fillRect(x, y + 15, TILE, 1);
          }
          break;
        case T.PARKING:
          ctx.fillStyle = PAL.parking; ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(0,0,0,' + (hv * 0.06) + ')'; ctx.fillRect(x, y, TILE, TILE);
          break;
        case T.ROAD:
          ctx.fillStyle = (m & M.HIGHWAY) ? PAL.highway : PAL.road; ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(0,0,0,' + (hv * 0.05) + ')'; ctx.fillRect(x, y, TILE, TILE);
          if (hv > 0.93) { ctx.fillStyle = PAL.roadDark; ctx.fillRect(x + ((hv * 50) % 14 | 0), y + ((hv * 90) % 14 | 0), 10 + (hv * 10 | 0), 6); }
          break;
        case T.BRIDGE:
          ctx.fillStyle = PAL.bridge; ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(0,0,0,' + (hv * 0.05) + ')'; ctx.fillRect(x, y, TILE, TILE);
          break;
        case T.BUILDING:
          ctx.fillStyle = PAL.wall; ctx.fillRect(x, y, TILE, TILE);
          break;
        default:
          ctx.fillStyle = PAL.void; ctx.fillRect(x, y, TILE, TILE);
      }
    },
    paintWater: function (ctx, tx, ty, x, y, hv) {
      ctx.fillStyle = PAL.water; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(0,0,0,' + (hv * 0.08) + ')'; ctx.fillRect(x, y, TILE, TILE);
      // ripples
      ctx.fillStyle = 'rgba(120,200,230,0.28)';
      for (var k = 0; k < 2; k++) {
        var hx = U.hash2(tx, ty, 80 + k), hy = U.hash2(tx, ty, 90 + k);
        ctx.fillRect(x + (hx * 20) | 0, y + (hy * 30) | 0, 6 + (hx * 8) | 0, 1);
      }
      // shoreline foam / shadows from decks
      var n = [W.tile(tx, ty - 1), W.tile(tx + 1, ty), W.tile(tx, ty + 1), W.tile(tx - 1, ty)];
      var nm = [W.metaAt(tx, ty - 1), W.metaAt(tx + 1, ty), W.metaAt(tx, ty + 1), W.metaAt(tx - 1, ty)];
      for (k = 0; k < 4; k++) {
        var nt = n[k];
        if (nt === T.WATER || nt === T.VOID) continue;
        var deck = nt === T.BRIDGE || ((nm[k] & M.DOCK) !== 0);
        var ex = x, ey = y, ew = TILE, eh = TILE;
        if (deck) {
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          if (k === 0) ctx.fillRect(x, y, TILE, 7); else if (k === 1) ctx.fillRect(x + TILE - 7, y, 7, TILE);
          else if (k === 2) ctx.fillRect(x, y + TILE - 7, TILE, 7); else ctx.fillRect(x, y, 7, TILE);
          continue;
        }
        if (k === 0) { eh = 6; } else if (k === 1) { ex = x + TILE - 6; ew = 6; } else if (k === 2) { ey = y + TILE - 6; eh = 6; } else { ew = 6; }
        ctx.fillStyle = 'rgba(80,160,200,0.55)'; ctx.fillRect(ex, ey, ew, eh);
        ctx.fillStyle = PAL.foam;
        if (k === 0) ctx.fillRect(x, y, TILE, 2); else if (k === 1) ctx.fillRect(x + TILE - 2, y, 2, TILE);
        else if (k === 2) ctx.fillRect(x, y + TILE - 2, TILE, 2); else ctx.fillRect(x, y, 2, TILE);
      }
    },
    paintDock: function (ctx, tx, ty, x, y) {
      ctx.fillStyle = PAL.dock; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = PAL.dockLine;
      for (var k = 5; k < TILE; k += 6) ctx.fillRect(x, y + k, TILE, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y, 2, TILE); ctx.fillRect(x + TILE - 2, y, 2, TILE);
      if (ty % 2 === 0) { ctx.fillStyle = '#4a3a26'; ctx.fillRect(x - 1, y + 2, 4, 4); ctx.fillRect(x + TILE - 3, y + 2, 4, 4); }
    },

    paintTileOverlay: function (ctx, tx, ty) {
      var t = W.tile(tx, ty), x = tx * TILE, y = ty * TILE;
      if (t === T.ROAD || t === T.BRIDGE) { Render.paintRoadMarkings(ctx, tx, ty, x, y, t); return; }
      if (t === T.BUILDING || t === T.WATER || t === T.VOID) return;
      var m = W.metaAt(tx, ty);
      var n = [W.tile(tx, ty - 1), W.tile(tx + 1, ty), W.tile(tx, ty + 1), W.tile(tx - 1, ty)];
      if (m & M.DOCK) return;
      // curb against roads
      for (var k = 0; k < 4; k++) {
        if (!W.isRoadTile(n[k])) continue;
        if (m & M.SHOULDER) continue;
        ctx.fillStyle = PAL.curb;
        if (k === 0) ctx.fillRect(x, y, TILE, 2); else if (k === 1) ctx.fillRect(x + TILE - 2, y, 2, TILE);
        else if (k === 2) ctx.fillRect(x, y + TILE - 2, TILE, 2); else ctx.fillRect(x, y, 2, TILE);
        ctx.fillStyle = PAL.curbLight;
        if (k === 0) ctx.fillRect(x, y + 2, TILE, 1); else if (k === 1) ctx.fillRect(x + TILE - 3, y, 1, TILE);
        else if (k === 2) ctx.fillRect(x, y + TILE - 3, TILE, 1); else ctx.fillRect(x + 2, y, 1, TILE);
      }
      // highway shoulder barrier on the side facing away from the road
      if (m & M.SHOULDER) {
        var nm = [W.metaAt(tx, ty - 1), W.metaAt(tx + 1, ty), W.metaAt(tx, ty + 1), W.metaAt(tx - 1, ty)];
        for (k = 0; k < 4; k++) {
          var nt = n[k];
          if (W.isRoadTile(nt) || (nm[k] & M.SHOULDER)) continue;
          if (nt === T.WATER) continue;
          var opp = (k + 2) % 4;
          if (!W.isRoadTile(n[opp]) && !(nm[opp] & M.SHOULDER)) continue;
          ctx.fillStyle = PAL.barrier;
          if (k === 0) ctx.fillRect(x, y, TILE, 5); else if (k === 1) ctx.fillRect(x + TILE - 5, y, 5, TILE);
          else if (k === 2) ctx.fillRect(x, y + TILE - 5, TILE, 5); else ctx.fillRect(x, y, 5, TILE);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          if (k === 0) ctx.fillRect(x, y + 5, TILE, 1); else if (k === 1) ctx.fillRect(x + TILE - 6, y, 1, TILE);
          else if (k === 2) ctx.fillRect(x, y + TILE - 6, TILE, 1); else ctx.fillRect(x + 5, y, 1, TILE);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          if (k === 0) ctx.fillRect(x, y + 1, TILE, 1); else if (k === 1) ctx.fillRect(x + TILE - 2, y, 1, TILE);
          else if (k === 2) ctx.fillRect(x, y + TILE - 2, TILE, 1); else ctx.fillRect(x + 1, y, 1, TILE);
        }
      }
    },

    paintRoadMarkings: function (ctx, tx, ty, x, y, t) {
      var i = ty * W.w + tx, m = W.meta[i], h = W.laneH[i], v = W.laneV[i];
      var isX = h && v, hw = h & 15, vw = v & 15;
      var highway = (m & M.HIGHWAY) !== 0, avenue = (m & M.AVENUE) !== 0;
      if (t === T.BRIDGE) {
        // railings against water
        var n = [W.tile(tx, ty - 1), W.tile(tx + 1, ty), W.tile(tx, ty + 1), W.tile(tx - 1, ty)];
        for (var k = 0; k < 4; k++) {
          if (n[k] !== T.WATER) continue;
          ctx.fillStyle = PAL.bridgeRail;
          if (k === 0) ctx.fillRect(x, y, TILE, 3); else if (k === 1) ctx.fillRect(x + TILE - 3, y, 3, TILE);
          else if (k === 2) ctx.fillRect(x, y + TILE - 3, TILE, 3); else ctx.fillRect(x, y, 3, TILE);
          ctx.fillStyle = '#6a6e78';
          for (var p = 2; p < TILE; p += 8) {
            if (k === 0) ctx.fillRect(x + p, y, 2, 5); else if (k === 1) ctx.fillRect(x + TILE - 5, y + p, 5, 2);
            else if (k === 2) ctx.fillRect(x + p, y + TILE - 5, 2, 5); else ctx.fillRect(x, y + p, 5, 2);
          }
        }
      }
      if (isX) return;
      if (h) {
        var lane = h >> 4, w = hw;
        if (m & M.CROSSWALK) {
          ctx.fillStyle = PAL.roadCrosswalk;
          for (k = 0; k < 4; k++) ctx.fillRect(x + 3, y + 3 + k * 8, TILE - 6, 4);
          var xr = W._isX(W.metaAt(tx + 1, ty)), xl = W._isX(W.metaAt(tx - 1, ty));
          ctx.fillStyle = PAL.roadLine;
          if (xr && lane >= w / 2) ctx.fillRect(x, y + 1, 3, TILE - 2);
          if (xl && lane < w / 2) ctx.fillRect(x + TILE - 3, y + 1, 3, TILE - 2);
          return;
        }
        if (w === 2) {
          if (lane === 0) { ctx.fillStyle = PAL.roadLineYellow; ctx.fillRect(x + 4, y + TILE - 2, 16, 2); }
        } else {
          if (lane === w / 2 - 1) {
            if (highway) {
              ctx.fillStyle = PAL.shoulder; ctx.fillRect(x, y + TILE - 3, TILE, 3);
              ctx.fillStyle = PAL.roadLineYellow; ctx.fillRect(x, y + TILE - 5, TILE, 2);
            } else { ctx.fillStyle = PAL.roadLineYellow; ctx.fillRect(x, y + TILE - 5, TILE, 2); ctx.fillRect(x, y + TILE - 2, TILE, 2); }
          } else if (lane === w / 2 && highway) {
            ctx.fillStyle = PAL.shoulder; ctx.fillRect(x, y, TILE, 3);
            ctx.fillStyle = PAL.roadLineYellow; ctx.fillRect(x, y + 3, TILE, 2);
          } else if (lane === 0 || lane === w - 2) {
            ctx.fillStyle = PAL.roadLine; ctx.fillRect(x + 4, y + TILE - 1, 16, 2);
          }
          if (avenue || highway) {
            ctx.fillStyle = PAL.roadLine;
            if (lane === 0) ctx.fillRect(x, y + 2, TILE, 2);
            if (lane === w - 1) ctx.fillRect(x, y + TILE - 4, TILE, 2);
          }
        }
      } else if (v) {
        lane = v >> 4; w = vw;
        if (m & M.CROSSWALK) {
          ctx.fillStyle = PAL.roadCrosswalk;
          for (k = 0; k < 4; k++) ctx.fillRect(x + 3 + k * 8, y + 3, 4, TILE - 6);
          var xd = W._isX(W.metaAt(tx, ty + 1)), xu = W._isX(W.metaAt(tx, ty - 1));
          ctx.fillStyle = PAL.roadLine;
          if (xd && lane < w / 2) ctx.fillRect(x + 1, y, TILE - 2, 3);
          if (xu && lane >= w / 2) ctx.fillRect(x + 1, y + TILE - 3, TILE - 2, 3);
          return;
        }
        if (w === 2) {
          if (lane === 0) { ctx.fillStyle = PAL.roadLineYellow; ctx.fillRect(x + TILE - 2, y + 4, 2, 16); }
        } else {
          if (lane === w / 2 - 1) {
            if (highway) {
              ctx.fillStyle = PAL.shoulder; ctx.fillRect(x + TILE - 3, y, 3, TILE);
              ctx.fillStyle = PAL.roadLineYellow; ctx.fillRect(x + TILE - 5, y, 2, TILE);
            } else { ctx.fillStyle = PAL.roadLineYellow; ctx.fillRect(x + TILE - 5, y, 2, TILE); ctx.fillRect(x + TILE - 2, y, 2, TILE); }
          } else if (lane === w / 2 && highway) {
            ctx.fillStyle = PAL.shoulder; ctx.fillRect(x, y, 3, TILE);
            ctx.fillStyle = PAL.roadLineYellow; ctx.fillRect(x + 3, y, 2, TILE);
          } else if (lane === 0 || lane === w - 2) {
            ctx.fillStyle = PAL.roadLine; ctx.fillRect(x + TILE - 1, y + 4, 2, 16);
          }
          if (avenue || highway) {
            ctx.fillStyle = PAL.roadLine;
            if (lane === 0) ctx.fillRect(x + 2, y, 2, TILE);
            if (lane === w - 1) ctx.fillRect(x + TILE - 4, y, 2, TILE);
          }
        }
      }
    },

    paintLot: function (ctx, lot) {
      ctx.fillStyle = PAL.parkingLine;
      var x = lot.x, y = lot.y, w = lot.w, h = lot.h;
      // only paint bays on tiles that are really parking (yards carry the PATH flag: plain concrete)
      ctx.save();
      ctx.beginPath();
      var any = false;
      for (var ty = lot.ty; ty < lot.ty + lot.th; ty++) for (var tx = lot.tx; tx < lot.tx + lot.tw; tx++) {
        if (W.tile(tx, ty) === T.PARKING && !(W.metaAt(tx, ty) & M.PATH)) { ctx.rect(tx * TILE, ty * TILE, TILE, TILE); any = true; }
      }
      if (!any) { ctx.restore(); return; }
      ctx.clip();
      var stall = 18, depth = 24, sx;
      // nose-in stalls along the top and bottom edges, drive aisle in between
      for (sx = x + 6; sx < x + w - 6; sx += stall) { ctx.fillRect(sx, y + 4, 1, depth); ctx.fillRect(sx, y + h - 4 - depth, 1, depth); }
      ctx.fillRect(x + 6, y + 4 + depth, w - 12, 1); ctx.fillRect(x + 6, y + h - 5 - depth, w - 12, 1);
      // a central back-to-back row on big lots
      if (h >= 7 * TILE) {
        var cy = y + h / 2;
        for (sx = x + 6; sx < x + w - 6; sx += stall) ctx.fillRect(sx, cy - depth, 1, depth * 2);
        ctx.fillRect(x + 6, cy, w - 12, 1);
      }
      ctx.globalAlpha = 0.5; ctx.fillRect(x + 2, y + 2, 1, h - 4); ctx.fillRect(x + w - 3, y + 2, 1, h - 4); ctx.globalAlpha = 1;
      ctx.restore();
    },

    // ----------------------------------------------------------- buildings --
    paintShadow: function (ctx, b) {
      var s = 4 + b.height * 0.55;
      ctx.fillStyle = PAL.shadow;
      if (b.roofStyle === 'stadium') { ellipse(ctx, b.x + b.w / 2 + s, b.y + b.h / 2 + s, b.w / 2 - 2, b.h / 2 - 2); ctx.fill(); return; }
      ctx.fillRect(b.x + s, b.y + s, b.w, b.h);
    },
    paintBuilding: function (ctx, b) {
      var R = GTP.makeRng(b.seed);
      var x = b.x, y = b.y, w = b.w, h = b.h, st = b.roofStyle;
      if (st === 'stadium') { Render.roofs.stadium(ctx, b, R); return; }
      // walls (dark band) + roof inset
      var inset = 2 + Math.min(4, b.height * 0.1);
      ctx.fillStyle = PAL.wall; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = U.shade(b.color, -0.25); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      var rx = x + inset, ry = y + inset, rw = w - inset * 2, rh = h - inset * 2;
      if (st === 'house' || st === 'mansion') { Render.roofs.hip(ctx, b, R, rx, ry, rw, rh); }
      else {
        ctx.fillStyle = b.color; ctx.fillRect(rx, ry, rw, rh);
        var painter = Render.roofs[st] || Render.roofs.office;
        painter(ctx, b, R, rx, ry, rw, rh);
      }
      // bevel: light on top/left, dark on bottom/right (sun from NW)
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 1, y + h - 2, w - 2, 1); ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
    },
    roofs: {
      _ac: function (ctx, R, rx, ry, rw, rh, n) {
        for (var i = 0; i < n; i++) {
          var s = 6 + R.int(0, 5), ax = rx + 6 + R.random() * (rw - 12 - s), ay = ry + 6 + R.random() * (rh - 12 - s);
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(ax + 2, ay + 2, s, s);
          ctx.fillStyle = PAL.roofDetail; ctx.fillRect(ax, ay, s, s);
          ctx.fillStyle = PAL.roofDetailDark; ctx.beginPath(); ctx.arc(ax + s / 2, ay + s / 2, s * 0.32, 0, U.TAU); ctx.fill();
        }
      },
      _vents: function (ctx, R, rx, ry, rw, rh, n) {
        ctx.fillStyle = PAL.roofDetailDark;
        for (var i = 0; i < n; i++) ctx.fillRect(rx + 5 + R.random() * (rw - 14), ry + 5 + R.random() * (rh - 14), 4, 4);
      },
      _parapet: function (ctx, rx, ry, rw, rh, color) {
        ctx.strokeStyle = color || 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
        ctx.strokeRect(rx + 4, ry + 4, rw - 8, rh - 8);
      },
      _helipad: function (ctx, cx, cy, r) {
        ctx.fillStyle = '#3a3d44'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, U.TAU); ctx.fill();
        ctx.strokeStyle = PAL.helipad; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, U.TAU); ctx.stroke();
        ctx.fillStyle = PAL.helipad;
        var s = r * 0.5;
        ctx.fillRect(cx - s, cy - s, 3, s * 2); ctx.fillRect(cx + s - 3, cy - s, 3, s * 2); ctx.fillRect(cx - s, cy - 1.5, s * 2, 3);
      },
      _skylights: function (ctx, R, rx, ry, rw, rh, cols, rows) {
        cols = Math.max(1, Math.min(cols, 3)); rows = Math.max(1, Math.min(rows, 3));
        var sw = 12, sh = 12, gx = (rw - 16) / cols, gy = (rh - 16) / rows;
        for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
          var sx = rx + 8 + i * gx + (gx - sw) / 2, sy = ry + 8 + j * gy + (gy - sh) / 2;
          ctx.fillStyle = '#3b4652'; ctx.fillRect(sx - 1, sy - 1, sw + 2, sh + 2);
          ctx.fillStyle = PAL.glass; ctx.fillRect(sx, sy, sw, sh);
          ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(sx + 1, sy + 1, sw - 2, 2);
        }
        void R;
      },
      _antenna: function (ctx, x, y) {
        ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, U.TAU); ctx.fill();
      },
      tower: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs;
        // glass grid texture
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        for (var gx = rx + 8; gx < rx + rw; gx += 8) ctx.fillRect(gx, ry, 1, rh);
        for (var gy = ry + 8; gy < ry + rh; gy += 8) ctx.fillRect(rx, gy, rw, 1);
        RF._parapet(ctx, rx, ry, rw, rh, 'rgba(255,255,255,0.25)');
        // mechanical penthouse
        var pw = rw * 0.42, ph = rh * 0.42, px = rx + (rw - pw) * (0.3 + R.random() * 0.4), py = ry + (rh - ph) * (0.3 + R.random() * 0.4);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px + 4, py + 4, pw, ph);
        ctx.fillStyle = U.shade(b.color, 0.12); ctx.fillRect(px, py, pw, ph);
        ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(px, py, pw, 1); ctx.fillRect(px, py, 1, ph);
        RF._ac(ctx, R, px, py, pw, ph, 2);
        RF._ac(ctx, R, rx, ry, rw, rh, 3);
        if (rw >= 120 && rh >= 120 && R.chance(0.7)) RF._helipad(ctx, rx + rw * 0.72, ry + rh * 0.72, Math.min(rw, rh) * 0.14);
        RF._antenna(ctx, rx + 10, ry + 10);
      },
      office: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs;
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (var k = 0; k < 20; k++) ctx.fillRect(rx + R.random() * rw, ry + R.random() * rh, 2, 2);
        RF._parapet(ctx, rx, ry, rw, rh);
        RF._vents(ctx, R, rx, ry, rw, rh, 3 + R.int(0, 4));
        RF._ac(ctx, R, rx, ry, rw, rh, 1 + R.int(0, 2));
        if (rw > 100 && R.chance(0.5)) { ctx.fillStyle = PAL.glass; ctx.fillRect(rx + 10, ry + rh / 2 - 4, rw - 20, 8); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(rx + 10, ry + rh / 2 - 4, rw - 20, 2); }
      },
      brick: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs;
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for (var k = 0; k < 24; k++) ctx.fillRect(rx + R.random() * rw, ry + R.random() * rh, 2, 1);
        RF._parapet(ctx, rx, ry, rw, rh, 'rgba(255,230,200,0.3)');
        RF._skylights(ctx, R, rx, ry, rw, rh, Math.floor(rw / 80), Math.floor(rh / 80));
        RF._ac(ctx, R, rx, ry, rw, rh, 1);
        ctx.fillStyle = '#5a3a2e'; ctx.fillRect(rx + rw - 16, ry + 8, 8, 8);
        ctx.fillStyle = '#2a1a14'; ctx.fillRect(rx + rw - 14, ry + 10, 4, 4);
      },
      hip: function (ctx, b, R, rx, ry, rw, rh) {
        var base = b.color, horiz = rw >= rh, k = horiz ? rh / 2 : rw / 2;
        var light = U.shade(base, 0.18), mid = U.shade(base, 0.02), dark = U.shade(base, -0.22), darker = U.shade(base, -0.4);
        ctx.fillStyle = base; ctx.fillRect(rx, ry, rw, rh);
        if (horiz) {
          ctx.fillStyle = light; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw - k, ry + k); ctx.lineTo(rx + k, ry + k); ctx.fill();
          ctx.fillStyle = darker; ctx.beginPath(); ctx.moveTo(rx, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw - k, ry + k); ctx.lineTo(rx + k, ry + k); ctx.fill();
          ctx.fillStyle = mid; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + k, ry + k); ctx.lineTo(rx, ry + rh); ctx.fill();
          ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(rx + rw, ry); ctx.lineTo(rx + rw - k, ry + k); ctx.lineTo(rx + rw, ry + rh); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(rx + k, ry + k - 1, rw - 2 * k, 2);
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          for (var s = ry + 5; s < ry + k; s += 5) ctx.fillRect(rx + (s - ry), s, rw - 2 * (s - ry), 1);
          for (s = ry + rh - 5; s > ry + k; s -= 5) ctx.fillRect(rx + (ry + rh - s), s, rw - 2 * (ry + rh - s), 1);
        } else {
          ctx.fillStyle = light; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + k, ry + k); ctx.lineTo(rx + k, ry + rh - k); ctx.lineTo(rx, ry + rh); ctx.fill();
          ctx.fillStyle = darker; ctx.beginPath(); ctx.moveTo(rx + rw, ry); ctx.lineTo(rx + k, ry + k); ctx.lineTo(rx + k, ry + rh - k); ctx.lineTo(rx + rw, ry + rh); ctx.fill();
          ctx.fillStyle = mid; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + k, ry + k); ctx.fill();
          ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(rx, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + k, ry + rh - k); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(rx + k - 1, ry + k, 2, rh - 2 * k);
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          for (s = rx + 5; s < rx + k; s += 5) ctx.fillRect(s, ry + (s - rx), 1, rh - 2 * (s - rx));
          for (s = rx + rw - 5; s > rx + k; s -= 5) ctx.fillRect(s, ry + (rx + rw - s), 1, rh - 2 * (rx + rw - s));
        }
        // chimney
        var cx = rx + rw * (0.25 + R.random() * 0.5), cy = ry + rh * (0.3 + R.random() * 0.4);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx + 2, cy + 2, 7, 7);
        ctx.fillStyle = '#6b5048'; ctx.fillRect(cx, cy, 7, 7);
        ctx.fillStyle = '#2a1a14'; ctx.fillRect(cx + 2, cy + 2, 3, 3);
        if (b.roofStyle === 'mansion') { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(rx + 4, ry + 4, rw - 8, 1); }
      },
      warehouse: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs, horiz = rw >= rh;
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        if (horiz) for (var s = rx + 6; s < rx + rw; s += 8) ctx.fillRect(s, ry, 1, rh);
        else for (s = ry + 6; s < ry + rh; s += 8) ctx.fillRect(rx, s, rw, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        if (horiz) for (s = rx + 2; s < rx + rw; s += 8) ctx.fillRect(s, ry, 1, rh);
        else for (s = ry + 2; s < ry + rh; s += 8) ctx.fillRect(rx, s, rw, 1);
        RF._skylights(ctx, R, rx, ry, rw, rh, Math.floor(rw / 90), Math.floor(rh / 90));
        // loading dock on the long bottom edge
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(rx + 6, ry + rh - 9, rw - 12, 7);
        ctx.fillStyle = '#c9a227';
        for (s = rx + 12; s < rx + rw - 14; s += 24) ctx.fillRect(s, ry + rh - 8, 14, 5);
        RF._ac(ctx, R, rx, ry, rw, rh, 1);
      },
      factory: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs;
        RF.warehouse(ctx, b, R, rx, ry, rw, rh);
        for (var i = 0; i < 2 + R.int(0, 2); i++) {
          var cx = rx + 14 + R.random() * (rw - 28), cy = ry + 14 + R.random() * (rh - 28);
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(cx + 3, cy + 3, 7, 0, U.TAU); ctx.fill();
          ctx.fillStyle = '#5c5f66'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, U.TAU); ctx.fill();
          ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, U.TAU); ctx.fill();
        }
        var tx = rx + rw - 22, ty = ry + 16;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(tx + 3, ty + 3, 12, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#b8bcc4'; ctx.beginPath(); ctx.arc(tx, ty, 12, 0, U.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(tx - 3, ty - 3, 5, 0, U.TAU); ctx.fill();
      },
      stone: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs;
        RF._parapet(ctx, rx, ry, rw, rh, 'rgba(0,0,0,0.18)');
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(rx + 7.5, ry + 7.5, rw - 15, rh - 15);
        // columns along the front (bottom) edge
        ctx.fillStyle = '#8f877a';
        var n = Math.max(3, Math.floor(rw / 20));
        for (var i = 0; i < n; i++) { var cx = rx + 10 + (rw - 20) * (i / (n - 1)); ctx.beginPath(); ctx.arc(cx, ry + rh - 6, 2.5, 0, U.TAU); ctx.fill(); }
        if (b.kind === 'capitol') {
          var dr = Math.min(rw, rh) * 0.3, dx = rx + rw / 2, dy = ry + rh / 2;
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(dx + 5, dy + 5, dr, 0, U.TAU); ctx.fill();
          var grd = ctx.createRadialGradient(dx - dr * 0.35, dy - dr * 0.35, 2, dx, dy, dr);
          grd.addColorStop(0, '#f6f1e4'); grd.addColorStop(1, '#a9a08c');
          ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(dx, dy, dr, 0, U.TAU); ctx.fill();
          ctx.fillStyle = '#d9d2bf'; ctx.beginPath(); ctx.arc(dx, dy, dr * 0.3, 0, U.TAU); ctx.fill();
          ctx.fillStyle = '#6a6256'; ctx.beginPath(); ctx.arc(dx, dy, 3, 0, U.TAU); ctx.fill();
        } else {
          RF._skylights(ctx, R, rx, ry, rw, rh, 1, 1);
          RF._vents(ctx, R, rx, ry, rw, rh, 2);
        }
      },
      capitol: function (ctx, b, R, rx, ry, rw, rh) { Render.roofs.stone(ctx, b, R, rx, ry, rw, rh); },
      bank: function (ctx, b, R, rx, ry, rw, rh) {
        Render.roofs.stone(ctx, b, R, rx, ry, rw, rh);
        ctx.fillStyle = '#3a3f4a'; ctx.fillRect(rx + rw / 2 - 10, ry + rh / 2 - 10, 20, 20);
        ctx.fillStyle = '#c0c6d0'; ctx.fillRect(rx + rw / 2 - 7, ry + rh / 2 - 7, 14, 14);
      },
      casino: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs, neon = PAL.neon[R.int(0, PAL.neon.length - 1)];
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        for (var gx = rx + 6; gx < rx + rw; gx += 6) ctx.fillRect(gx, ry, 1, rh);
        ctx.save(); ctx.shadowColor = neon; ctx.shadowBlur = 10; ctx.strokeStyle = neon; ctx.lineWidth = 2; ctx.strokeRect(rx + 4, ry + 4, rw - 8, rh - 8); ctx.restore();
        // marquee sign
        var sw = Math.min(rw - 20, 70), sh = 14;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(rx + 12, ry + 12, sw, sh);
        ctx.fillStyle = '#15151c'; ctx.fillRect(rx + 10, ry + 10, sw, sh);
        for (var i = 0; i < 4; i++) { ctx.fillStyle = PAL.neon[(i + R.int(0, 4)) % PAL.neon.length]; ctx.fillRect(rx + 13 + i * (sw / 4), ry + 14, sw / 4 - 4, 6); }
        RF._ac(ctx, R, rx, ry, rw, rh, 2);
        if (rw > 120 && rh > 100) { ctx.fillStyle = PAL.pool; ctx.fillRect(rx + rw - 44, ry + rh - 34, 32, 22); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(rx + rw - 42, ry + rh - 32, 28, 4); }
      },
      club: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs, neon = R.chance(0.5) ? PAL.neon[0] : PAL.neon[1];
        ctx.save(); ctx.shadowColor = neon; ctx.shadowBlur = 12; ctx.strokeStyle = neon; ctx.lineWidth = 2; ctx.strokeRect(rx + 3, ry + 3, rw - 6, rh - 6); ctx.restore();
        var gx0 = rx + rw / 2 - 20, gy0 = ry + rh / 2 - 12;
        for (var i = 0; i < 5; i++) for (var j = 0; j < 3; j++) { ctx.fillStyle = PAL.neon[(i + j) % PAL.neon.length]; ctx.globalAlpha = 0.8; ctx.fillRect(gx0 + i * 8, gy0 + j * 8, 7, 7); }
        ctx.globalAlpha = 1;
        RF._vents(ctx, R, rx, ry, rw, rh, 3);
      },
      hotel: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs;
        RF.tower(ctx, b, R, rx, ry, rw, rh);
        ctx.fillStyle = '#d8dde6'; ctx.fillRect(rx + 10, ry + rh - 40, 50, 30);
        ctx.fillStyle = PAL.pool; ctx.fillRect(rx + 14, ry + rh - 36, 42, 22);
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(rx + 16, ry + rh - 34, 38, 3);
      },
      mall: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs;
        RF._parapet(ctx, rx, ry, rw, rh);
        ctx.fillStyle = '#3b4652'; ctx.fillRect(rx + 16, ry + rh / 2 - 8, rw - 32, 16);
        ctx.fillStyle = PAL.glass; ctx.fillRect(rx + 18, ry + rh / 2 - 6, rw - 36, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(rx + 18, ry + rh / 2 - 6, rw - 36, 3);
        RF._ac(ctx, R, rx, ry, rw, rh / 2 - 10, 4);
        RF._ac(ctx, R, rx, ry + rh / 2 + 10, rw, rh / 2 - 10, 4);
        RF._vents(ctx, R, rx, ry, rw, rh, 6);
      },
      agency: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs;
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (var gx = rx + 8; gx < rx + rw; gx += 8) ctx.fillRect(gx, ry, 1, rh);
        for (var gy = ry + 8; gy < ry + rh; gy += 8) ctx.fillRect(rx, gy, rw, 1);
        var cx = rx + rw / 2, cy = ry + rh / 2;
        ctx.fillStyle = '#0d1017'; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, U.TAU); ctx.fill();
        ctx.strokeStyle = '#3c4a66'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, U.TAU); ctx.stroke();
        ctx.strokeStyle = PAL.neon[1]; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, U.TAU); ctx.stroke(); ctx.globalAlpha = 1;
        for (var i = 0; i < 4; i++) { var dx = rx + 14 + (i % 2) * (rw - 28), dy = ry + 14 + Math.floor(i / 2) * (rh - 28); Render.props._dish(ctx, dx, dy, 7); }
        RF._helipad(ctx, rx + rw - 30, ry + rh - 30, 14);
        void R;
      },
      police: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs;
        RF._parapet(ctx, rx, ry, rw, rh, 'rgba(255,255,255,0.3)');
        ctx.fillStyle = '#e8ecf5'; ctx.fillRect(rx + 10, ry + 10, rw - 20, 6);
        ctx.fillStyle = '#3b7bd3'; ctx.fillRect(rx + 10, ry + 16, rw - 20, 4);
        RF._helipad(ctx, rx + rw * 0.65, ry + rh * 0.6, Math.min(rw, rh) * 0.22);
        RF._ac(ctx, R, rx, ry, rw / 2, rh, 2);
      },
      hospital: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs;
        RF._parapet(ctx, rx, ry, rw, rh, 'rgba(0,0,0,0.15)');
        var cx = rx + rw * 0.6, cy = ry + rh * 0.55, r = Math.min(rw, rh) * 0.24;
        ctx.fillStyle = '#c9ced8'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#e03b2f'; ctx.fillRect(cx - r * 0.6, cy - r * 0.2, r * 1.2, r * 0.4); ctx.fillRect(cx - r * 0.2, cy - r * 0.6, r * 0.4, r * 1.2);
        RF._ac(ctx, R, rx, ry, rw * 0.4, rh, 3);
        RF._vents(ctx, R, rx, ry, rw, rh, 4);
      },
      stadium: function (ctx, b, R) {
        var x = b.x, y = b.y, w = b.w, h = b.h, cx = x + w / 2, cy = y + h / 2;
        ctx.fillStyle = PAL.plaza; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = PAL.plazaLine;
        for (var gx = x + 16; gx < x + w; gx += 16) ctx.fillRect(gx, y, 1, h);
        for (var gy = y + 16; gy < y + h; gy += 16) ctx.fillRect(x, gy, w, 1);
        var rx = w / 2 - 6, ry = h / 2 - 6;
        var grd = ctx.createRadialGradient(cx, cy, ry * 0.5, cx, cy, rx);
        grd.addColorStop(0, '#9aa0ac'); grd.addColorStop(1, '#5c6270');
        ctx.fillStyle = grd; ellipse(ctx, cx, cy, rx, ry); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
        for (var k = 1; k <= 5; k++) { ellipse(ctx, cx, cy, rx - k * 6, ry - k * 6); ctx.stroke(); }
        ctx.fillStyle = PAL.wall; ellipse(ctx, cx, cy, rx, ry); ctx.lineWidth = 3; ctx.strokeStyle = PAL.wall; ctx.stroke();
        // field
        var fx = rx * 0.5, fy = ry * 0.48;
        ctx.fillStyle = '#2f8a3a'; ellipse(ctx, cx, cy, fx + 6, fy + 6); ctx.fill();
        ctx.fillStyle = '#3aa048'; ctx.fillRect(cx - fx, cy - fy, fx * 2, fy * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (k = 0; k < 6; k += 2) ctx.fillRect(cx - fx + k * (fx / 3), cy - fy, fx / 3, fy * 2);
        ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 2; ctx.strokeRect(cx - fx, cy - fy, fx * 2, fy * 2);
        ctx.beginPath(); ctx.moveTo(cx, cy - fy); ctx.lineTo(cx, cy + fy); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, Math.min(fx, fy) * 0.3, 0, U.TAU); ctx.stroke();
        // floodlights
        var pts = [[x + 10, y + 10], [x + w - 10, y + 10], [x + 10, y + h - 10], [x + w - 10, y + h - 10]];
        for (k = 0; k < 4; k++) { ctx.fillStyle = '#2a2d36'; ctx.beginPath(); ctx.arc(pts[k][0], pts[k][1], 4, 0, U.TAU); ctx.fill(); ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(pts[k][0], pts[k][1], 2, 0, U.TAU); ctx.fill(); }
        void R;
      },
      studio: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs;
        RF._parapet(ctx, rx, ry, rw, rh);
        for (var i = 0; i < 3; i++) Render.props._dish(ctx, rx + 20 + i * 24, ry + 20, 9);
        RF._antenna(ctx, rx + rw - 14, ry + 14);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(rx + 12, ry + rh - 30, rw - 24, 18);
        ctx.fillStyle = PAL.neon[0]; ctx.globalAlpha = 0.85; ctx.fillRect(rx + 14, ry + rh - 28, rw - 28, 5); ctx.globalAlpha = 1;
        RF._ac(ctx, R, rx, ry + rh / 2 - 10, rw, 30, 3);
      },
      diner: function (ctx, b, R, rx, ry, rw, rh) {
        ctx.fillStyle = '#e4e8ee'; roundRect(ctx, rx, ry, rw, rh, 10); ctx.fill();
        ctx.strokeStyle = '#d0362e'; ctx.lineWidth = 3; roundRect(ctx, rx + 4, ry + 4, rw - 8, rh - 8, 8); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (var s = rx + 8; s < rx + rw; s += 8) ctx.fillRect(s, ry + 8, 1, rh - 16);
        Render.roofs._ac(ctx, R, rx, ry, rw, rh, 1);
      },
      gas: function (ctx, b, R, rx, ry, rw, rh) {
        ctx.fillStyle = '#f0f0f0'; ctx.fillRect(rx + 4, ry + rh / 2 - 3, rw - 8, 6);
        Render.roofs._vents(ctx, R, rx, ry, rw, rh, 1);
      },
      garage: function (ctx, b, R, rx, ry, rw, rh) {
        var RF = Render.roofs;
        RF.warehouse(ctx, b, R, rx, ry, rw, rh);
        ctx.fillStyle = '#c9a227'; ctx.fillRect(rx + 6, ry + rh - 9, rw - 12, 7);
        ctx.fillStyle = '#2a2a2a'; for (var s = rx + 8; s < rx + rw - 8; s += 6) ctx.fillRect(s, ry + rh - 8, 1, 5);
      },
      shack: function (ctx, b, R, rx, ry, rw, rh) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (var s = ry + 4; s < ry + rh; s += 5) ctx.fillRect(rx, s, rw, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        for (s = ry + 2; s < ry + rh; s += 5) ctx.fillRect(rx, s, rw, 1);
        ctx.fillStyle = '#3a4a56'; ctx.beginPath(); ctx.arc(rx + rw - 9, ry + 9, 5, 0, U.TAU); ctx.fill();
        void R;
      },
      mansion: function (ctx, b, R, rx, ry, rw, rh) { Render.roofs.hip(ctx, b, R, rx, ry, rw, rh); },
      house: function (ctx, b, R, rx, ry, rw, rh) { Render.roofs.hip(ctx, b, R, rx, ry, rw, rh); }
    },

    // --------------------------------------------------------------- props --
    paintProp: function (ctx, p) {
      var f = Render.props[p.type];
      if (f) f(ctx, p);
    },
    props: {
      _dish: function (ctx, x, y, r) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x + 2, y + 2, r, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#d8dce2'; ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x - 1, y - 1, r, 2); ctx.beginPath(); ctx.arc(x + r - 1, y, 1.8, 0, U.TAU); ctx.fill();
      },
      tree: function (ctx, p) {
        var r = p.r || 12, k = Math.floor((p.color != null ? p.color : U.hash2(p.x | 0, p.y | 0, 2)) * PAL.tree.length) % PAL.tree.length;
        ctx.fillStyle = PAL.treeShadow; ellipse(ctx, p.x + r * 0.4, p.y + r * 0.45, r, r * 0.9); ctx.fill();
        ctx.fillStyle = U.shade(PAL.tree[k], -0.3); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, U.TAU); ctx.fill();
        ctx.fillStyle = PAL.tree[k]; ctx.beginPath(); ctx.arc(p.x - r * 0.1, p.y - r * 0.1, r * 0.85, 0, U.TAU); ctx.fill();
        ctx.fillStyle = PAL.treeLight[k]; ctx.beginPath(); ctx.arc(p.x - r * 0.28, p.y - r * 0.3, r * 0.45, 0, U.TAU); ctx.fill();
      },
      lamp: function (ctx, p) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(p.x + 1, p.y + 1, 4, 10);
        ctx.fillStyle = PAL.lamp; ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#fff2c4'; ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, U.TAU); ctx.fill();
      },
      hydrant: function (ctx, p) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(p.x + 1, p.y + 1.5, 3, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#d93a30'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#ff8a80'; ctx.beginPath(); ctx.arc(p.x - 0.8, p.y - 0.8, 1.2, 0, U.TAU); ctx.fill();
      },
      bench: function (ctx, p) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a || 0);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-7 + 1, -3 + 1, 14, 6);
        ctx.fillStyle = '#7a5230'; ctx.fillRect(-7, -3, 14, 6);
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(-7, -1, 14, 1); ctx.fillRect(-7, 1, 14, 1);
        ctx.restore();
      },
      dumpster: function (ctx, p) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a || 0);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-9 + 3, -6 + 3, 18, 12);
        ctx.fillStyle = '#2f5f3a'; ctx.fillRect(-9, -6, 18, 12);
        ctx.fillStyle = '#3f7a4c'; ctx.fillRect(-8, -5, 16, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-9, 0, 18, 1);
        ctx.restore();
      },
      container: function (ctx, p) {
        var cols = ['#c0392b', '#2b6cb0', '#2f855a', '#dd6b20', '#718096', '#b7791f'];
        var col = cols[Math.floor((p.color || 0) * cols.length) % cols.length];
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a || 0);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-22 + 4, -8 + 4, 44, 16);
        ctx.fillStyle = col; ctx.fillRect(-22, -8, 44, 16);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; for (var s = -20; s < 22; s += 4) ctx.fillRect(s, -8, 1, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-22, -8, 44, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(19, -8, 3, 16);
        ctx.restore();
      },
      crate: function (ctx, p) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(p.x - 5 + 2, p.y - 5 + 2, 10, 10);
        ctx.fillStyle = '#b08a52'; ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
        ctx.fillStyle = '#7a5a30'; ctx.fillRect(p.x - 5, p.y - 0.5, 10, 1); ctx.fillRect(p.x - 0.5, p.y - 5, 1, 10);
      },
      boat: function (ctx, p) {
        var w = p.w || 22, h = p.h || 48;
        ctx.save(); ctx.translate(p.x, p.y);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.moveTo(3, -h / 2 + 3); ctx.lineTo(w / 2 + 3, -h / 2 + 14); ctx.lineTo(w / 2 + 3, h / 2 + 3); ctx.lineTo(-w / 2 + 3, h / 2 + 3); ctx.lineTo(-w / 2 + 3, -h / 2 + 14); ctx.closePath(); ctx.fill();
        ctx.fillStyle = p.color || '#f4f4f4';
        ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, -h / 2 + 12); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.lineTo(-w / 2, -h / 2 + 12); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(-w / 2 + 3, -h / 2 + 14, w - 6, h - 18);
        ctx.fillStyle = '#5c6e7a'; ctx.fillRect(-w / 4, -4, w / 2, Math.min(18, h / 3));
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-w / 4 + 1, -3, w / 2 - 2, 3);
        ctx.restore();
      },
      pool: function (ctx, p) {
        var w = p.w || 44, h = p.h || 30;
        ctx.fillStyle = '#d5d8dd'; roundRect(ctx, p.x - w / 2 - 4, p.y - h / 2 - 4, w + 8, h + 8, 6); ctx.fill();
        ctx.fillStyle = PAL.pool; roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, 5); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(p.x - w / 2 + 4, p.y - h / 2 + 4, w * 0.5, 2); ctx.fillRect(p.x - w / 2 + 10, p.y + 2, w * 0.3, 2);
        ctx.fillStyle = '#e8e8e8'; ctx.fillRect(p.x + w / 2 - 2, p.y - 2, 10, 4);
      },
      fountain: function (ctx, p) {
        var r = p.r || 18;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(p.x + 2, p.y + 3, r, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#9a948c'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, U.TAU); ctx.fill();
        ctx.fillStyle = PAL.pool; ctx.beginPath(); ctx.arc(p.x, p.y, r - 4, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#b8b2a8'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.3, 0, U.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.12, 0, U.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(p.x - r * 0.6, p.y - r * 0.45, r * 0.5, 2); ctx.fillRect(p.x + r * 0.1, p.y + r * 0.4, r * 0.4, 2);
      },
      helipad: function (ctx, p) { Render.roofs._helipad(ctx, p.x, p.y, p.r || 30); },
      mast: function (ctx, p) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + (p.h || 60) * 0.7, p.y + (p.h || 60) * 0.7); ctx.stroke();
        ctx.fillStyle = '#4a4e57'; ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
        ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, U.TAU); ctx.fill();
      },
      canopy: function (ctx, p) {
        var w = p.w || 100, h = p.h || 48;
        // pumps under the canopy (drawn first, canopy is semi-transparent)
        for (var i = -1; i <= 1; i += 2) { ctx.fillStyle = '#bfc3ca'; ctx.fillRect(p.x + i * w * 0.22 - 10, p.y - 6, 20, 12); ctx.fillStyle = '#d0362e'; ctx.fillRect(p.x + i * w * 0.22 - 3, p.y - 3, 6, 6); }
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(ctx, p.x - w / 2 + 8, p.y - h / 2 + 8, w, h, 6); ctx.fill();
        ctx.globalAlpha = 0.92; ctx.fillStyle = '#e8eaee'; roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, 6); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#d0362e'; ctx.fillRect(p.x - w / 2 + 4, p.y - h / 2 + 4, w - 8, 4); ctx.fillRect(p.x - w / 2 + 4, p.y + h / 2 - 8, w - 8, 4);
        ctx.fillStyle = '#2a3b7a'; ctx.fillRect(p.x - w / 2 + 4, p.y - h / 2 + 8, w - 8, 2);
      },
      crane: function (ctx, p) {
        var len = p.len || 150;
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(p.x + 6, p.y + 6); ctx.lineTo(p.x + 6, p.y + len + 6); ctx.stroke();
        ctx.fillStyle = '#c9a227'; ctx.fillRect(p.x - 14, p.y - 14, 28, 28);
        ctx.fillStyle = '#2a2a2a'; ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
        ctx.strokeStyle = '#e0b52a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + len); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
        for (var s = 10; s < len; s += 10) { ctx.beginPath(); ctx.moveTo(p.x - 2.5, p.y + s); ctx.lineTo(p.x + 2.5, p.y + s + 6); ctx.stroke(); }
      },
      umbrella: function (ctx, p) {
        var r = 9, c1 = p.color < 0.5 ? '#ff5f8f' : '#2ee6ff';
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(p.x + 3, p.y + 4, r, 0, U.TAU); ctx.fill();
        for (var i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : c1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, r, i * Math.PI / 4, (i + 1) * Math.PI / 4); ctx.closePath(); ctx.fill(); }
      }
    },

    // ------------------------------------------------------------- sprites --
    // All sprites are procedural, drawn once into offscreen canvases and cached
    // by a key built from everything that changes the picture.
    sprites: {
      cache: new Map(),
      get: function (key, w, h, painter) {
        var c = Render.sprites.cache.get(key);
        if (c) return c;
        c = makeCanvas(w, h);
        var ctx = c.getContext('2d');
        ctx.translate(w / 2, h / 2);
        painter(ctx, w, h);
        Render.sprites.cache.set(key, c);
        return c;
      },
      _lookKey: function (look) {
        return (look.skin || '') + '|' + (look.shirt || '') + '|' + (look.pants || '') + '|' + (look.hair || '') + '|' + (look.hairStyle || '') + '|' +
          (look.hat || '') + '|' + (look.hatStyle || '') + '|' + (look.glasses || '') + '|' + (look.tie || '') + '|' + (look.prop || '') + '|' + (look.signColor || '') + '|' + (look.badge || '');
      },
      // top-down ped facing +x, 32x32. frame -1 = idle, 0..3 = walk cycle.
      ped: function (look, frame) {
        look = look || {};
        frame = frame == null ? -1 : frame;
        var key = 'ped|' + frame + '|' + Render.sprites._lookKey(look);
        return Render.sprites.get(key, 32, 32, function (ctx) { Render.sprites.paintPed(ctx, look, frame); });
      },
      // lying pose (knocked down / out cold), 40x24, head toward +x
      pedDown: function (look) {
        look = look || {};
        var key = 'pedDown|' + Render.sprites._lookKey(look);
        return Render.sprites.get(key, 40, 24, function (ctx) { Render.sprites.paintPedDown(ctx, look); });
      },
      _hair: function (ctx, look, hx, hy, r) {
        var hair = look.hair || '#3a2a1a', st = look.hairStyle || 'short';
        var hl = U.shade(hair, 0.25);
        function cap(a0, a1, rr) { ctx.fillStyle = hair; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.arc(hx, hy, rr, a0, a1); ctx.closePath(); ctx.fill(); }
        switch (st) {
          case 'bald': ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(hx - 1.2, hy - 1.2, 1.6, 0, U.TAU); ctx.fill(); break;
          case 'buzz': ctx.globalAlpha = 0.7; cap(Math.PI * 0.42, Math.PI * 1.58, r - 0.4); ctx.globalAlpha = 1; break;
          case 'long':
            cap(Math.PI * 0.3, Math.PI * 1.7, r + 0.2);
            ctx.fillStyle = hair; ellipse(ctx, hx - r - 1.2, hy, 2.6, r * 0.95); ctx.fill();
            ctx.fillStyle = hl; ctx.fillRect(hx - r - 2, hy - 2, 1, 4);
            break;
          case 'bun':
            cap(Math.PI * 0.4, Math.PI * 1.6, r);
            ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(hx - r - 0.6, hy, 2.4, 0, U.TAU); ctx.fill();
            ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(hx - r - 1.2, hy - 0.8, 0.9, 0, U.TAU); ctx.fill();
            break;
          case 'mohawk':
            ctx.fillStyle = hair; roundRect(ctx, hx - r + 0.4, hy - 1.3, r * 1.75, 2.6, 1); ctx.fill();
            ctx.fillStyle = hl; ctx.fillRect(hx - r + 1.5, hy - 0.5, r, 1);
            break;
          case 'curly':
            cap(Math.PI * 0.38, Math.PI * 1.62, r);
            ctx.fillStyle = hair;
            for (var a = Math.PI * 0.45; a <= Math.PI * 1.55; a += Math.PI * 0.22) { ctx.beginPath(); ctx.arc(hx + Math.cos(a) * r, hy + Math.sin(a) * r, 1.6, 0, U.TAU); ctx.fill(); }
            break;
          case 'side':
            cap(Math.PI * 0.4, Math.PI * 1.6, r);
            ctx.fillStyle = hair; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.arc(hx, hy, r, -Math.PI * 0.6, Math.PI * 0.4); ctx.closePath(); ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
            ctx.fillStyle = hl; ctx.fillRect(hx - 2, hy - 2.2, 3.5, 0.9);
            break;
          default: // short
            cap(Math.PI * 0.42, Math.PI * 1.58, r);
            ctx.fillStyle = hl; ctx.fillRect(hx - 3.2, hy - 1.6, 1.6, 0.9);
        }
      },
      _hat: function (ctx, look, hx, hy, r) {
        var hat = look.hat, st = look.hatStyle || 'cap', dark = U.shade(hat, -0.35), light = U.shade(hat, 0.25);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
        switch (st) {
          case 'beanie':
            ctx.fillStyle = hat; ctx.beginPath(); ctx.arc(hx - 0.3, hy, r + 0.6, 0, U.TAU); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(hx - 0.3, hy, r - 1.2, 0, U.TAU); ctx.stroke();
            ctx.fillStyle = light; ctx.beginPath(); ctx.arc(hx - 2, hy - 1, 1.1, 0, U.TAU); ctx.fill();
            break;
          case 'cop':
            ctx.fillStyle = hat; ctx.beginPath(); ctx.arc(hx - 0.5, hy, r + 0.3, 0, U.TAU); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#0d1120'; roundRect(ctx, hx + r - 1.5, hy - 3, 3.6, 6, 1.2); ctx.fill();
            ctx.fillStyle = look.badge || '#e8c14a'; ctx.beginPath(); ctx.arc(hx + 1.6, hy, 1.1, 0, U.TAU); ctx.fill();
            ctx.fillStyle = light; ctx.fillRect(hx - 3.5, hy - 0.5, 4, 1);
            break;
          case 'hardhat':
            ctx.fillStyle = hat; ctx.beginPath(); ctx.arc(hx - 0.3, hy, r + 0.8, 0, U.TAU); ctx.fill(); ctx.stroke();
            ctx.fillStyle = light; ctx.fillRect(hx - r, hy - 0.6, r * 2, 1.2);
            break;
          case 'fedora':
            ctx.fillStyle = dark; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(hx - 0.3, hy, r + 1.8, 0, U.TAU); ctx.fill(); ctx.globalAlpha = 1;
            ctx.fillStyle = hat; ctx.beginPath(); ctx.arc(hx - 0.3, hy, r - 0.6, 0, U.TAU); ctx.fill();
            ctx.fillStyle = '#1a1a1a'; ctx.fillRect(hx - r + 0.5, hy - 0.6, r * 2 - 1, 1.2);
            break;
          default: // cap
            ctx.fillStyle = hat; ctx.beginPath(); ctx.arc(hx - 0.3, hy, r + 0.2, 0, U.TAU); ctx.fill(); ctx.stroke();
            ctx.fillStyle = dark; roundRect(ctx, hx + r - 1.5, hy - 3.2, 4.2, 6.4, 1.5); ctx.fill();
            ctx.fillStyle = light; ctx.beginPath(); ctx.arc(hx - 0.3, hy, 0.9, 0, U.TAU); ctx.fill();
        }
      },
      _prop: function (ctx, look) {
        var p = look.prop;
        if (!p) return;
        if (p === 'sign') {
          var col = look.signColor || '#f4f4f4';
          ctx.fillStyle = '#5a3a20'; ctx.fillRect(4, -0.7, 7, 1.4);
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(8.5, -5, 7.5, 10);
          ctx.fillStyle = col; ctx.fillRect(8, -5.5, 7.5, 10);
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(8.5, -5, 6.5, 9);
          ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(10, -3, 3.5, 1); ctx.fillRect(10, -1, 3.5, 1); ctx.fillRect(10, 1, 2.5, 1);
        } else if (p === 'mic') {
          ctx.fillStyle = '#2a2a2a'; ctx.fillRect(5, 2, 4, 1.4);
          ctx.fillStyle = '#4a4a52'; ctx.beginPath(); ctx.arc(9.5, 2.7, 1.9, 0, U.TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(9, 2.2, 0.7, 0, U.TAU); ctx.fill();
        } else if (p === 'phone') {
          ctx.fillStyle = '#1a1a1a'; ctx.fillRect(6, -4.5, 3.2, 4.4);
          ctx.fillStyle = '#9fd8ff'; ctx.fillRect(6.5, -4, 2.2, 3.4);
        } else if (p === 'coffee') {
          ctx.fillStyle = '#f4f4f4'; ctx.beginPath(); ctx.arc(6.8, 3.2, 2, 0, U.TAU); ctx.fill();
          ctx.fillStyle = '#6b3f1d'; ctx.beginPath(); ctx.arc(6.8, 3.2, 1.1, 0, U.TAU); ctx.fill();
        } else if (p === 'bag') {
          ctx.fillStyle = '#7a4f2a'; roundRect(ctx, -5, 7, 7, 4, 1.2); ctx.fill();
          ctx.strokeStyle = '#4a2f18'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-1.5, 7); ctx.lineTo(1, 1); ctx.stroke();
        }
      },
      paintPed: function (ctx, look, frame) {
        var skin = look.skin || '#e8c39e', shirt = look.shirt || '#6a8fcf', pants = look.pants || '#2a2f4a';
        var ph = frame < 0 ? 0 : Math.sin(frame * Math.PI / 2); // 0, 1, 0, -1
        var stride = ph * 4, hs = -ph * 3.2;
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        // feet poke out front/back of the torso when walking
        ctx.fillStyle = U.shade(pants, -0.2);
        roundRect(ctx, -3 + stride, -6.2, 6.5, 3.4, 1.6); ctx.fill();
        roundRect(ctx, -3 - stride, 2.8, 6.5, 3.4, 1.6); ctx.fill();
        // torso (shoulders are wide across y)
        ellipse(ctx, -0.5, 0, 6, 8.6); ctx.fillStyle = shirt; ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.16)'; ellipse(ctx, -1.5, -2.8, 3.2, 3.4); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.14)'; ellipse(ctx, -2.2, 3.4, 2.8, 3.4); ctx.fill();
        // arms swing opposite to the feet
        ctx.fillStyle = shirt;
        roundRect(ctx, -1 + hs, -10.6, 6.5, 3.2, 1.6); ctx.fill(); roundRect(ctx, -1 - hs, 7.4, 6.5, 3.2, 1.6); ctx.fill();
        ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(4.6 + hs, -9, 2.2, 0, U.TAU); ctx.fill(); ctx.beginPath(); ctx.arc(4.6 - hs, 9, 2.2, 0, U.TAU); ctx.fill();
        Render.sprites._prop(ctx, look);
        if (look.tie) { ctx.fillStyle = look.tie; ctx.fillRect(2.5, -1, 5, 2); }
        // head + hair + glasses + hat
        var hx = 1.5, hy = 0, r = 4.9;
        ctx.beginPath(); ctx.arc(hx, hy, r, 0, U.TAU); ctx.fillStyle = skin; ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.arc(hx - 0.8, hy, r - 1.5, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
        Render.sprites._hair(ctx, look, hx, hy, r);
        if (look.glasses) {
          ctx.fillStyle = look.glasses === true ? '#1a1a1a' : look.glasses;
          ctx.fillRect(hx + 2.6, hy - 3.6, 2.6, 2.3); ctx.fillRect(hx + 2.6, hy + 1.3, 2.6, 2.3); ctx.fillRect(hx + 3.2, hy - 1.3, 1.2, 2.6);
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(hx + 3.1, hy - 3.1, 1, 0.8); ctx.fillRect(hx + 3.1, hy + 1.8, 1, 0.8);
        }
        if (look.hat) Render.sprites._hat(ctx, look, hx, hy, r);
      },
      paintPedDown: function (ctx, look) {
        var skin = look.skin || '#e8c39e', shirt = look.shirt || '#6a8fcf', pants = look.pants || '#2a2f4a';
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        // legs (behind, -x), one bent
        ctx.fillStyle = pants;
        roundRect(ctx, -17, -4.2, 11, 3.6, 1.6); ctx.fill();
        ctx.save(); ctx.translate(-7, 2.5); ctx.rotate(0.35); roundRect(ctx, -10, -1.8, 11, 3.6, 1.6); ctx.fill(); ctx.restore();
        ctx.fillStyle = U.shade(pants, -0.25); roundRect(ctx, -18.5, -4.5, 3.5, 4, 1.4); ctx.fill(); roundRect(ctx, -17.5, 3.6, 3.5, 4, 1.4); ctx.fill();
        // torso
        ellipse(ctx, -1, 0, 8.5, 5.6); ctx.fillStyle = shirt; ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.14)'; ellipse(ctx, -2, -1.5, 4, 2); ctx.fill();
        // arms: one flung up, one along the side
        ctx.fillStyle = shirt;
        ctx.save(); ctx.translate(3, -5); ctx.rotate(-0.9); roundRect(ctx, 0, -1.5, 9, 3, 1.4); ctx.fill(); ctx.restore();
        roundRect(ctx, -6, 4.5, 10, 3, 1.4); ctx.fill();
        ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(9.5, -11.5, 2, 0, U.TAU); ctx.fill(); ctx.beginPath(); ctx.arc(5, 6, 2, 0, U.TAU); ctx.fill();
        if (look.tie) { ctx.fillStyle = look.tie; ctx.fillRect(3, -1, 5, 2); }
        // head
        var hx = 10.5, hy = 0, r = 4.8;
        ctx.beginPath(); ctx.arc(hx, hy, r, 0, U.TAU); ctx.fillStyle = skin; ctx.fill(); ctx.stroke();
        Render.sprites._hair(ctx, look, hx, hy, r);
        if (look.glasses) { ctx.fillStyle = look.glasses === true ? '#1a1a1a' : look.glasses; ctx.fillRect(hx + 2.4, hy - 3.4, 2.4, 2.2); ctx.fillRect(hx + 2.4, hy + 1.2, 2.4, 2.2); }
        if (look.hat) Render.sprites._hat(ctx, look, hx - 0.5, hy, r);
        // little dizzy stars
        ctx.fillStyle = '#ffe66d';
        ctx.beginPath(); ctx.arc(hx + 5.5, hy - 5, 1, 0, U.TAU); ctx.fill(); ctx.beginPath(); ctx.arc(hx + 7, hy + 4, 0.8, 0, U.TAU); ctx.fill();
      },

      // top-down vehicle facing +x; canvas is (w+12)x(h+12)
      vehicle: function (type, color, variant) {
        var cls = C.VEHICLES[type] || C.VEHICLES.sedan;
        variant = variant | 0;
        var key = 'veh|' + type + '|' + color + '|' + variant;
        return Render.sprites.get(key, cls.w + 12, cls.h + 12, function (ctx) { Render.sprites.paintVehicle(ctx, type, cls, color || cls.colors[0], variant); });
      },
      wreck: function (type) {
        var cls = C.VEHICLES[type] || C.VEHICLES.sedan;
        return Render.sprites.get('wreck|' + type, cls.w + 12, cls.h + 12, function (ctx) { Render.sprites.paintWreck(ctx, type, cls); });
      },
      _cabin: function (type, w) {
        switch (type) {
          case 'sports': return [-w * 0.27, w * 0.03];
          case 'suv': return [-w * 0.37, w * 0.2];
          case 'van': return [-w / 2 + 5, w * 0.24];
          case 'truck': return [w * 0.1, w * 0.34];
          case 'bus': return [-w / 2 + 6, w / 2 - 8];
          default: return [-w * 0.3, w * 0.12];
        }
      },
      _wheels: function (ctx, type, w, h) {
        ctx.fillStyle = '#15161a';
        var wy = h / 2 - 0.5, xs;
        if (type === 'bus') xs = [w * 0.36, -w * 0.28, -w * 0.42];
        else if (type === 'truck') xs = [w * 0.36, -w * 0.26, -w * 0.42];
        else xs = [w * 0.31, -w * 0.31];
        for (var i = 0; i < xs.length; i++) {
          roundRect(ctx, xs[i] - 5, -wy - 2.5, 10, 4.2, 1.6); ctx.fill();
          roundRect(ctx, xs[i] - 5, wy - 1.7, 10, 4.2, 1.6); ctx.fill();
        }
        ctx.fillStyle = '#3a3c44';
        for (i = 0; i < xs.length; i++) { ctx.fillRect(xs[i] - 3, -wy - 1.5, 6, 1); ctx.fillRect(xs[i] - 3, wy + 0.5, 6, 1); }
      },
      paintVehicle: function (ctx, type, cls, color, variant) {
        var w = cls.w, h = cls.h;
        if (type === 'bike') { Render.sprites.paintBike(ctx, cls, color); return; }
        var dark = U.shade(color, -0.35), darker = U.shade(color, -0.55), light = U.shade(color, 0.28);
        var glass = '#1b2838', glassLight = 'rgba(190,220,255,0.5)';
        var boxy = type === 'bus' || type === 'truck' || type === 'van';
        Render.sprites._wheels(ctx, type, w, h);
        // body with a cross-body gradient so it reads as rounded at any heading
        var rad = boxy ? 3 : (type === 'sports' ? 7 : 5);
        roundRect(ctx, -w / 2, -h / 2, w, h, rad);
        var grd = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        grd.addColorStop(0, light); grd.addColorStop(0.42, color); grd.addColorStop(1, dark);
        ctx.fillStyle = grd; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.78)'; ctx.lineWidth = 1.5; ctx.stroke();
        var cab = Render.sprites._cabin(type, w), c0 = cab[0], c1 = cab[1];
        // panel gaps + hood crease
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        if (type !== 'bus') ctx.fillRect(w / 2 - 6, -h / 2 + 2, 1, h - 4);
        if (!boxy) ctx.fillRect(-w / 2 + 5, -h / 2 + 2, 1, h - 4);
        if (!boxy) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(c1 + 6, -0.5, w / 2 - c1 - 13, 1); }
        if (variant === 1 && !boxy && type !== 'cop' && type !== 'taxi') { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(-w / 2 + 2, -2.2, w - 4, 1.6); ctx.fillRect(-w / 2 + 2, 0.6, w - 4, 1.6); }
        // cargo box on trucks, before the cab
        if (type === 'truck') {
          ctx.fillStyle = darker; roundRect(ctx, -w / 2 + 2, -h / 2 + 1.5, c0 - 3 - (-w / 2 + 2), h - 3, 2); ctx.fill();
          ctx.fillStyle = U.shade(color, -0.15); roundRect(ctx, -w / 2 + 3, -h / 2 + 2.5, c0 - 5 - (-w / 2 + 3), h - 5, 1.5); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.22)'; for (var s = -w / 2 + 7; s < c0 - 5; s += 6) ctx.fillRect(s, -h / 2 + 2.5, 1, h - 5);
          ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-w / 2 + 3, -h / 2 + 2.5, c0 - 8 - (-w / 2 + 3), 1.2);
        }
        // roof recess + roof panel
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(ctx, c0 - 1, -h / 2 + 1.5, c1 - c0 + 2, h - 3, 3); ctx.fill();
        var roofCol = type === 'cop' ? '#f4f4f4' : U.shade(color, variant === 2 ? 0.06 : -0.06);
        ctx.fillStyle = roofCol; roundRect(ctx, c0 + 0.5, -h / 2 + 3, c1 - c0 - 1, h - 6, 2.5); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(c0 + 2, -h / 2 + 3.5, c1 - c0 - 4, 1.2);
        if (variant === 2 && !boxy) { ctx.fillStyle = glass; roundRect(ctx, (c0 + c1) / 2 - 4, -3, 8, 6, 1.5); ctx.fill(); }
        // windshield (front of cabin) + rear window
        ctx.fillStyle = glass; roundRect(ctx, c1 - 0.5, -h / 2 + 2.5, type === 'bus' ? 6 : 5.5, h - 5, 1.5); ctx.fill();
        ctx.fillStyle = glassLight; ctx.fillRect(c1 + 1, -h / 2 + 3.5, 1.6, h - 7);
        ctx.fillStyle = glass; roundRect(ctx, c0 - 4, -h / 2 + 3.5, 4.5, h - 7, 1.5); ctx.fill();
        ctx.fillStyle = 'rgba(190,220,255,0.3)'; ctx.fillRect(c0 - 3, -h / 2 + 4.5, 1, h - 9);
        // side windows
        ctx.fillStyle = glass;
        var span = c1 - c0 - 3, seg = type === 'bus' ? 7 : 6, gap = 2.5, n = Math.max(1, Math.floor((span + gap) / (seg + gap)));
        var start = c0 + 1.5 + (span - (n * seg + (n - 1) * gap)) / 2;
        for (var i = 0; i < n; i++) {
          var sx = start + i * (seg + gap);
          ctx.fillRect(sx, -h / 2 + 1.2, seg, 2); ctx.fillRect(sx, h / 2 - 3.2, seg, 2);
        }
        // type extras
        if (type === 'sports') { ctx.fillStyle = darker; roundRect(ctx, -w / 2 + 1.5, -h / 2 + 1, 4, h - 2, 1.5); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(-w / 2 + 2, -h / 2 + 1.5, 3, 1); }
        if (type === 'suv') { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(c0 + 3, -h / 2 + 5, c1 - c0 - 6, 1); ctx.fillRect(c0 + 3, h / 2 - 6, c1 - c0 - 6, 1); }
        if (type === 'van') { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(c0 + 6, -h / 2 + 1, 1, 4); ctx.fillRect(c0 + 6, h / 2 - 5, 1, 4); }
        if (type === 'bus') {
          ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-8, -4, 7, 8); ctx.fillRect(14, -4, 7, 8);
          ctx.fillStyle = '#d8dce2'; ctx.fillRect(-7, -3, 5, 6); ctx.fillRect(15, -3, 5, 6);
          ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(w / 2 - 20, h / 2 - 2.5, 6, 2); ctx.fillRect(-w / 2 + 16, h / 2 - 2.5, 6, 2);
        }
        if (type === 'cop') {
          ctx.fillStyle = '#1d3a8a';
          roundRect(ctx, -w / 2 + 6, -h / 2 + 0.8, w - 12, 3.2, 1); ctx.fill(); roundRect(ctx, -w / 2 + 6, h / 2 - 4, w - 12, 3.2, 1); ctx.fill();
          ctx.fillStyle = '#1d3a8a'; roundRect(ctx, c1 + 6, -h / 2 + 2, w / 2 - c1 - 12, h - 4, 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(c1 + 7, -0.5, w / 2 - c1 - 14, 1);
          // lightbar
          ctx.fillStyle = '#111'; roundRect(ctx, -4, -h / 2 + 4.5, 5, h - 9, 1); ctx.fill();
          ctx.fillStyle = '#ff3b30'; ctx.fillRect(-3.5, -h / 2 + 5, 4, (h - 10) / 2 - 0.5);
          ctx.fillStyle = '#2e6bff'; ctx.fillRect(-3.5, 0.5, 4, (h - 10) / 2 - 0.5);
          ctx.fillStyle = '#e8c14a'; ctx.beginPath(); ctx.arc(c0 + (c1 - c0) * 0.3, 0, 1.5, 0, U.TAU); ctx.fill();
        }
        if (type === 'taxi') {
          ctx.fillStyle = '#1a1a1a';
          for (var k = -w / 2 + 6; k < w / 2 - 6; k += 4) { var odd = ((k / 4) | 0) % 2 === 0; ctx.fillRect(k, -h / 2 + (odd ? 1 : 2.5), 2, 1.5); ctx.fillRect(k, h / 2 - (odd ? 2.5 : 4), 2, 1.5); }
          ctx.fillStyle = '#1a1a1a'; roundRect(ctx, -5, -4, 8, 8, 1.5); ctx.fill();
          ctx.fillStyle = '#ffe9a8'; ctx.fillRect(-4, -3, 6, 6); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-3, -1, 4, 2);
        }
        // lights
        ctx.fillStyle = '#fff6cc'; ctx.fillRect(w / 2 - 3, -h / 2 + 2, 3, 4); ctx.fillRect(w / 2 - 3, h / 2 - 6, 3, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(w / 2 - 2, -h / 2 + 3, 1, 2); ctx.fillRect(w / 2 - 2, h / 2 - 5, 1, 2);
        ctx.fillStyle = '#e0352b'; ctx.fillRect(-w / 2, -h / 2 + 2, 3, 4); ctx.fillRect(-w / 2, h / 2 - 6, 3, 4);
        if (type === 'bus') { ctx.fillStyle = '#ffb347'; ctx.fillRect(w / 2 - 3, -h / 2 + 6.5, 2, 2); ctx.fillRect(w / 2 - 3, h / 2 - 8.5, 2, 2); }
        // bumpers
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(w / 2 - 1, -h / 2 + 7, 1.5, h - 14); ctx.fillRect(-w / 2 - 0.5, -h / 2 + 7, 1.5, h - 14);
      },
      paintBike: function (ctx, cls, color) {
        var w = cls.w, h = cls.h, dark = U.shade(color, -0.35);
        ctx.fillStyle = '#15161a';
        roundRect(ctx, w * 0.34 - 4.5, -2, 9, 4, 2); ctx.fill(); roundRect(ctx, -w * 0.34 - 4.5, -2, 9, 4, 2); ctx.fill();
        ctx.fillStyle = '#4a4c54'; ctx.fillRect(w * 0.34 - 2, -0.5, 4, 1); ctx.fillRect(-w * 0.34 - 2, -0.5, 4, 1);
        // frame + tank + seat
        ctx.fillStyle = dark; roundRect(ctx, -w * 0.3, -1.6, w * 0.6, 3.2, 1.5); ctx.fill();
        ctx.fillStyle = color; roundRect(ctx, -1, -h / 2 + 1, w * 0.26, h - 2, 3); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(0, -h / 2 + 2, w * 0.2, 1.2);
        ctx.fillStyle = '#1a1a1a'; roundRect(ctx, -w * 0.3, -h / 2 + 2, w * 0.28, h - 4, 2); ctx.fill();
        // handlebars + headlight + tail light
        ctx.fillStyle = '#2a2a2a'; ctx.fillRect(w * 0.2, -h / 2 - 1, 2, h + 2);
        ctx.fillStyle = '#4a4a52'; ctx.fillRect(w * 0.2 - 1, -h / 2 - 1.5, 4, 2); ctx.fillRect(w * 0.2 - 1, h / 2 - 0.5, 4, 2);
        ctx.fillStyle = '#fff6cc'; ctx.fillRect(w / 2 - 3, -1.5, 2.5, 3);
        ctx.fillStyle = '#e0352b'; ctx.fillRect(-w / 2 + 0.5, -1.5, 2, 3);
      },
      paintWreck: function (ctx, type, cls) {
        var w = cls.w, h = cls.h, R = GTP.makeRng(U.hash('wreck' + type));
        ctx.fillStyle = '#121214';
        var wy = h / 2 - 0.5;
        roundRect(ctx, w * 0.3 - 5, -wy - 2.5, 10, 4.2, 1.6); ctx.fill(); roundRect(ctx, -w * 0.33 - 5, wy - 1.7, 10, 4.2, 1.6); ctx.fill();
        roundRect(ctx, -w * 0.3 - 5, -wy - 2.5, 10, 4.2, 1.6); ctx.fill();
        // crumpled body: jagged polygon
        ctx.beginPath();
        var n = 14;
        for (var i = 0; i < n; i++) {
          var t = i / n * U.TAU, bx = Math.cos(t) * (w / 2 - 1), by = Math.sin(t) * (h / 2 - 1);
          var fx = Math.abs(Math.cos(t)) > 0.72 ? Math.sign(Math.cos(t)) * (w / 2 - 1) : bx;
          var fy = Math.abs(Math.sin(t)) > 0.72 ? Math.sign(Math.sin(t)) * (h / 2 - 1) : by;
          var jx = (R.random() - 0.5) * 4, jy = (R.random() - 0.5) * 3;
          if (i === 0) ctx.moveTo(fx + jx, fy + jy); else ctx.lineTo(fx + jx, fy + jy);
        }
        ctx.closePath();
        ctx.fillStyle = '#2b2826'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#3a3532'; roundRect(ctx, -w * 0.3, -h / 2 + 4, w * 0.42, h - 8, 2); ctx.fill();
        ctx.fillStyle = '#0d0e10'; roundRect(ctx, w * 0.1, -h / 2 + 4, 5, h - 8, 1); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
        for (i = 0; i < 5; i++) { var x0 = -w / 2 + 4 + R.random() * (w - 8), y0 = -h / 2 + 3 + R.random() * (h - 6); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (R.random() - 0.5) * 12, y0 + (R.random() - 0.5) * 8); ctx.stroke(); }
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        for (i = 0; i < 4; i++) { ellipse(ctx, -w / 2 + 6 + R.random() * (w - 12), -h / 2 + 4 + R.random() * (h - 8), 3 + R.random() * 5, 2 + R.random() * 3); ctx.fill(); }
        ctx.fillStyle = '#6b4a2a'; ctx.fillRect(w / 2 - 4, -h / 2 + 2, 2, 3); ctx.fillRect(-w / 2 + 1, h / 2 - 5, 2, 3);
      },

      // pickup icons, 20x20
      pickup: function (type) {
        return Render.sprites.get('pickup|' + type, 20, 20, function (ctx) {
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
          if (type === 'cash') {
            ctx.fillStyle = '#2e8b45'; roundRect(ctx, -8, -5, 16, 10, 1.5); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#5bd16a'; ctx.fillRect(-7, -4, 14, 8);
            ctx.fillStyle = '#2e8b45'; ctx.beginPath(); ctx.arc(0, 0, 2.8, 0, U.TAU); ctx.fill();
            ctx.fillStyle = '#e8ffe8'; ctx.font = 'bold 6px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 0.5);
          } else if (type === 'health') {
            ctx.fillStyle = '#f4f4f4'; roundRect(ctx, -7, -7, 14, 14, 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#e03b2f'; ctx.fillRect(-5, -1.8, 10, 3.6); ctx.fillRect(-1.8, -5, 3.6, 10);
          } else if (type === 'armor') {
            ctx.fillStyle = '#2a4a8a'; ctx.beginPath(); ctx.moveTo(-7, -6); ctx.lineTo(7, -6); ctx.lineTo(6, 3); ctx.lineTo(0, 8); ctx.lineTo(-6, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#8fb6ff'; ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, -4); ctx.lineTo(3, 2); ctx.lineTo(0, 5); ctx.lineTo(-3, 2); ctx.closePath(); ctx.fill();
          } else if (type === 'weapon') {
            ctx.fillStyle = '#3a3d44'; roundRect(ctx, -8, -3, 16, 5, 1.5); ctx.fill(); ctx.stroke();
            ctx.fillRect(-3, 1, 4, 6); ctx.fillStyle = '#9aa0aa'; ctx.fillRect(-7, -2, 12, 1.5);
          } else {
            ctx.fillStyle = '#c98a2a'; roundRect(ctx, -7, -7, 14, 14, 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#ffbe3c'; ctx.fillRect(-6, -6, 12, 12);
            ctx.fillStyle = '#8a5a1a'; ctx.fillRect(-6, -1, 12, 2); ctx.fillRect(-1, -6, 2, 12);
          }
        });
      }
    },

    // ------------------------------------------------------------ entities --
    _drawList: [],
    drawEntities: function (ctx, view, alpha) {
      var E = GTP.Entities; if (!E) return;
      var list = E.list, dl = Render._drawList; dl.length = 0;
      var x0 = view.x - 90, y0 = view.y - 90, x1 = view.x + view.w + 90, y1 = view.y + view.h + 90;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
        if (e.inVehicle) continue; // riders of bikes are drawn by the bike
        dl.push(e);
      }
      dl.sort(function (a, b) { return (a.z - b.z) || (a.y - b.y) || (a.id - b.id); });
      Render.stats.drawnEntities = dl.length;
      for (i = 0; i < dl.length; i++) {
        e = dl[i];
        var ex = U.lerp(e._px == null ? e.x : e._px, e.x, alpha), ey = U.lerp(e._py == null ? e.y : e._py, e.y, alpha);
        var ea = e._pa == null ? e.angle : U.angleLerp(e._pa, e.angle, alpha);
        if (typeof e.draw === 'function') { try { e.draw(ctx, ex, ey, ea, alpha); } catch (err) { U.reportError(err, 'entity.draw'); } continue; }
        Render.drawEntityDefault(ctx, e, ex, ey, ea);
      }
    },
    drawEntityDefault: function (ctx, e, ex, ey, ea) {
      var k = e.kind;
      if (k === 'ped' || k === 'player') Render.drawPed(ctx, e, ex, ey, ea, 1, false);
      else if (k === 'vehicle') Render.drawVehicle(ctx, e, ex, ey, ea);
      else if (k === 'projectile') {
        ctx.strokeStyle = 'rgba(255,243,176,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - e.vx * 0.012, ey - e.vy * 0.012); ctx.stroke();
        ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(ex, ey, 2, 0, U.TAU); ctx.fill();
      } else if (k === 'pickup') {
        var bob = Math.sin(Render.time * 4 + e.id) * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ellipse(ctx, ex, ey + 7, 8, 3.5); ctx.fill();
        var spr = Render.sprites.pickup(e.pickupType);
        ctx.drawImage(spr, ex - 10, ey - 10 + bob);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.15 + 0.15 * Math.sin(Render.time * 5 + e.id)) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ex, ey, 13 + Math.sin(Render.time * 3 + e.id) * 2, 0, U.TAU); ctx.stroke();
      } else {
        ctx.fillStyle = '#ff00ff'; ctx.beginPath(); ctx.arc(ex, ey, e.radius || 6, 0, U.TAU); ctx.fill();
      }
    },
    drawPed: function (ctx, e, ex, ey, ea, scale, noShadow) {
      scale = scale || 1;
      var down = e.state === 'knocked' || e.state === 'dead' || (!e.alive && (e.kind === 'ped' || e.kind === 'player'));
      if (down) {
        var sd = Render.sprites.pedDown(e.look);
        if (!noShadow) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ellipse(ctx, ex + 2, ey + 3, 15, 8); ctx.fill(); }
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(ea); ctx.scale(scale, scale);
        if (e.state === 'dead') ctx.globalAlpha = Math.max(0.35, 1 - Math.max(0, (e.deadTimer || 0) - 8) / 4);
        ctx.drawImage(sd, -20, -12); ctx.restore();
        return;
      }
      var frame = e.animFrame ? e.animFrame() : -1;
      var spr = Render.sprites.ped(e.look, frame);
      if (!noShadow) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ellipse(ctx, ex + 2, ey + 3, 7.5 * scale, 5.5 * scale); ctx.fill(); }
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(ea); ctx.scale(scale, scale);
      ctx.drawImage(spr, -16, -16);
      ctx.restore();
      if (e.kind === 'player' && !e.inVehicle) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ex, ey, 11, 0, U.TAU); ctx.stroke();
      }
    },
    drawVehicle: function (ctx, e, ex, ey, ea) {
      var cls = e.cls, w = cls.w, h = cls.h, night = Render.night;
      var ca = Math.cos(ea), sa = Math.sin(ea);
      // drop shadow: fixed world offset (light from the north-west), shape follows the heading
      ctx.save(); ctx.translate(ex + 3, ey + 4); ctx.rotate(ea);
      ctx.fillStyle = 'rgba(0,0,0,0.36)'; roundRect(ctx, -w / 2, -h / 2, w, h, e.type === 'bike' ? 3 : 5); ctx.fill();
      ctx.restore();
      var spr = e.wreck ? Render.sprites.wreck(e.type) : Render.sprites.vehicle(e.type, e.color, e.variant);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(ea);
      ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
      if (!e.wreck) {
        var dmgF = e.maxHp ? e.damage / e.maxHp : 0;
        if (dmgF > 0.25) { // dents and scorch marks, deterministic per vehicle
          var n = Math.min(5, 1 + ((dmgF * 4) | 0));
          ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.55, 0.25 + dmgF * 0.25) + ')';
          for (var i = 0; i < n; i++) {
            var hx = U.hash2(e.id, i, 11), hy = U.hash2(e.id, i, 12);
            ellipse(ctx, -w / 2 + 6 + hx * (w - 12), -h / 2 + 3 + hy * (h - 6), 2 + hx * 3, 1.5 + hy * 2); ctx.fill();
          }
        }
        var phase = Math.floor(Render.time * 8) % 2;
        if (e.type !== 'bike') {
          if (e.braking) {
            ctx.fillStyle = '#ff5a4a'; ctx.fillRect(-w / 2 - 1, -h / 2 + 1.5, 3.5, 5); ctx.fillRect(-w / 2 - 1, h / 2 - 6.5, 3.5, 5);
            ctx.globalAlpha = 0.32; ctx.fillStyle = '#ff3b30'; ellipse(ctx, -w / 2 - 2, -h / 2 + 4, 7, 4.5); ctx.fill(); ellipse(ctx, -w / 2 - 2, h / 2 - 4, 7, 4.5); ctx.fill(); ctx.globalAlpha = 1;
          }
          if (e.reversing) { ctx.fillStyle = '#ffffff'; ctx.fillRect(-w / 2 - 0.5, -h / 2 + 6.5, 2, 2.5); ctx.fillRect(-w / 2 - 0.5, h / 2 - 9, 2, 2.5); }
          if (night > 0.05 && e.headlights !== false) {
            ctx.fillStyle = '#ffffe8'; ctx.fillRect(w / 2 - 3, -h / 2 + 1.5, 3.5, 5); ctx.fillRect(w / 2 - 3, h / 2 - 6.5, 3.5, 5);
            ctx.globalAlpha = 0.45 * night; ctx.fillStyle = '#fff6c0'; ellipse(ctx, w / 2 + 1, -h / 2 + 4, 6, 4.5); ctx.fill(); ellipse(ctx, w / 2 + 1, h / 2 - 4, 6, 4.5); ctx.fill(); ctx.globalAlpha = 1;
            if (!e.braking) { ctx.globalAlpha = 0.6 * night; ctx.fillStyle = '#ff3b30'; ctx.fillRect(-w / 2 - 0.5, -h / 2 + 2, 2.5, 4); ctx.fillRect(-w / 2 - 0.5, h / 2 - 6, 2.5, 4); ctx.globalAlpha = 1; }
          }
          if (e.siren) {
            ctx.fillStyle = phase ? '#ff3b30' : '#2e6bff';
            ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.arc(-1.5, phase ? -3 : 3, 3.2, 0, U.TAU); ctx.fill();
            ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(-1.5, phase ? -3 : 3, 10, 0, U.TAU); ctx.fill(); ctx.globalAlpha = 1;
          }
        } else if (night > 0.05 && e.headlights !== false) {
          ctx.fillStyle = '#ffffe8'; ctx.fillRect(w / 2 - 3, -2, 3, 4);
        }
      }
      ctx.restore();
      if (e.type === 'bike' && e.driver && !e.wreck) Render.drawPed(ctx, e.driver, ex - ca * 2, ey - sa * 2, ea, 0.82, true);
      if (night > 0.05 && !e.wreck) {
        if (e.headlights !== false) Render.lights.push({ x: ex + ca * w * 0.5, y: ey + sa * w * 0.5, r: e.type === 'bike' ? 70 : 110, a: ea, cone: 0.42, color: 'rgba(255,240,200,0.5)' });
        if (e.braking) Render.lights.push({ x: ex - ca * w * 0.5, y: ey - sa * w * 0.5, r: 22, glow: 'red' });
        if (e.siren) Render.lights.push({ x: ex, y: ey, r: 46, glow: (Math.floor(Render.time * 8) % 2) ? 'red' : 'blue' });
      }
    },

    // ------------------------------------------------------------- markers --
    drawMarkers: function (ctx, view) {
      var ms = (GTP.Missions && GTP.Missions.markers && GTP.Missions.markers()) || [];
      var t = Render.time;
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.x < view.x - 60 || m.x > view.x + view.w + 60 || m.y < view.y - 80 || m.y > view.y + view.h + 60) continue;
        var pulse = 0.5 + 0.5 * Math.sin(t * 3 + i);
        if (m.kind === 'objective') {
          var bob = Math.sin(t * 4) * 4;
          ctx.fillStyle = 'rgba(0,0,0,0.25)'; ellipse(ctx, m.x, m.y, 10, 5); ctx.fill();
          ctx.fillStyle = '#ffbe3c'; ctx.beginPath(); ctx.moveTo(m.x, m.y - 8 + bob); ctx.lineTo(m.x - 9, m.y - 22 + bob); ctx.lineTo(m.x - 4, m.y - 22 + bob); ctx.lineTo(m.x - 4, m.y - 34 + bob); ctx.lineTo(m.x + 4, m.y - 34 + bob); ctx.lineTo(m.x + 4, m.y - 22 + bob); ctx.lineTo(m.x + 9, m.y - 22 + bob); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        } else {
          var col = m.color || '#2ee6ff';
          ctx.fillStyle = col; ctx.globalAlpha = 0.18 + pulse * 0.1;
          ctx.fillRect(m.x - 22, m.y - 52, 44, 52);
          ctx.globalAlpha = 0.35 + pulse * 0.2; ellipse(ctx, m.x, m.y - 52, 22, 11); ctx.fill();
          ctx.globalAlpha = 0.5 + pulse * 0.3; ellipse(ctx, m.x, m.y, 22, 11); ctx.fill();
          ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 2; ellipse(ctx, m.x, m.y, 22 + pulse * 6, 11 + pulse * 3); ctx.stroke();
        }
      }
    },

    // --------------------------------------------------------------- night --
    _glows: {},
    _GLOW_COLORS: {
      amber: ['rgba(255,200,110,0.7)', 'rgba(255,180,90,0.28)', 'rgba(255,160,70,0)'],
      red: ['rgba(255,70,50,0.8)', 'rgba(255,50,40,0.3)', 'rgba(255,40,30,0)'],
      blue: ['rgba(90,140,255,0.8)', 'rgba(60,110,255,0.3)', 'rgba(40,90,255,0)'],
      white: ['rgba(255,255,240,0.75)', 'rgba(255,255,230,0.3)', 'rgba(255,255,220,0)']
    },
    _glowSprite: function (kind) {
      kind = kind || 'amber';
      var c = Render._glows[kind];
      if (c) return c;
      var cols = Render._GLOW_COLORS[kind] || Render._GLOW_COLORS.amber;
      c = makeCanvas(160, 160);
      var ctx = c.getContext('2d');
      var g = ctx.createRadialGradient(80, 80, 4, 80, 80, 80);
      g.addColorStop(0, cols[0]); g.addColorStop(0.3, cols[1]); g.addColorStop(1, cols[2]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 160, 160);
      Render._glows[kind] = c;
      return c;
    },
    drawNight: function (ctx, view) {
      var n = Render.night;
      if (n <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = U.mix('#ffffff', '#2a3270', n * 0.8);
      ctx.fillRect(view.x - 4, view.y - 4, view.w + 8, view.h + 8);
      ctx.globalCompositeOperation = 'lighter';
      var glow = Render._glowSprite();
      ctx.globalAlpha = n;
      if (Render._buckets) {
        var cx0 = Math.max(0, Math.floor(view.x / CHPX)), cy0 = Math.max(0, Math.floor(view.y / CHPX));
        var cx1 = Math.min(Render._buckets.nx - 1, Math.floor((view.x + view.w) / CHPX)), cy1 = Math.min(Render._buckets.ny - 1, Math.floor((view.y + view.h) / CHPX));
        for (var cy = cy0; cy <= cy1; cy++) for (var cx = cx0; cx <= cx1; cx++) {
          var props = Render._buckets.props[cy * Render._buckets.nx + cx];
          for (var i = 0; i < props.length; i++) {
            var p = props[i];
            if (p.type !== 'lamp') continue;
            if (p.x < view.x - 80 || p.x > view.x + view.w + 80 || p.y < view.y - 80 || p.y > view.y + view.h + 80) continue;
            ctx.drawImage(glow, p.x - 36, p.y - 36, 72, 72);
          }
        }
      }
      var L = Render.lights;
      for (i = 0; i < L.length; i++) {
        var l = L[i];
        if (l.cone) {
          // soft beam: a radial falloff clipped to a wedge, brightest near the lamp
          ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.a || 0);
          var g = ctx.createRadialGradient(0, 0, 2, 0, 0, l.r);
          g.addColorStop(0, l.color || 'rgba(255,240,200,0.5)'); g.addColorStop(0.35, 'rgba(255,236,190,0.22)'); g.addColorStop(1, 'rgba(255,236,190,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.lineTo(l.r * 0.9, -l.r * l.cone); ctx.quadraticCurveTo(l.r * 1.08, 0, l.r * 0.9, l.r * l.cone); ctx.closePath(); ctx.fill();
          ctx.restore();
        } else {
          ctx.drawImage(l.glow ? Render._glowSprite(l.glow) : glow, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
        }
      }
      ctx.restore();
    },

    // ------------------------------------------------------------------ fx --
    fx: {
      list: [],
      marks: [],     // ground layer: skid marks, drawn under entities
      MAX: 500,
      MAX_MARKS: 600,
      add: function (p) {
        var fx = Render.fx, R = GTP.rng;
        p.age = 0;
        if (p.life == null) p.life = { puff: 0.45, spark: 0.3, smoke: 1.4, fire: 0.35, explosion: 0.7, text: 1.3, ring: 0.5 }[p.type] || 0.5;
        if (p.type === 'explosion') {
          var big = !!p.big, ns = big ? 18 : 12, nk = big ? 10 : 6;
          for (var i = 0; i < ns; i++) {
            var a = R.random() * U.TAU, s = 90 + R.random() * (big ? 300 : 220);
            fx.list.push({ type: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + R.random() * 0.35, age: 0, color: R.chance(0.5) ? '#ffbe3c' : '#ff6a3c' });
          }
          for (i = 0; i < nk; i++) fx.list.push({ type: 'smoke', x: p.x + (R.random() - 0.5) * 26, y: p.y + (R.random() - 0.5) * 26, vx: (R.random() - 0.5) * 30, vy: -22 - R.random() * 26, life: 1.3 + R.random() * 1.2, age: 0, r: 7 + R.random() * 8, color: '#2c2d33' });
          for (i = 0; i < 5; i++) fx.list.push({ type: 'fire', x: p.x + (R.random() - 0.5) * 30, y: p.y + (R.random() - 0.5) * 20, vx: (R.random() - 0.5) * 20, vy: -10 - R.random() * 20, life: 0.4 + R.random() * 0.4, age: 0, r: 6 + R.random() * 6 });
          fx.list.push({ type: 'ring', x: p.x, y: p.y, life: 0.55, age: 0, r1: big ? 150 : 110 });
          if (Render.cam) Render.cam.shake = Math.max(Render.cam.shake, big ? 12 : 8);
        }
        fx.list.push(p);
        if (fx.list.length > fx.MAX) fx.list.splice(0, fx.list.length - fx.MAX);
        return p;
      },
      // a skid mark segment on the ground (world coords)
      addMark: function (x0, y0, x1, y1, color) {
        var m = Render.fx.marks;
        m.push({ x0: x0, y0: y0, x1: x1, y1: y1, age: 0, life: 10, color: color || null });
        if (m.length > Render.fx.MAX_MARKS) m.splice(0, m.length - Render.fx.MAX_MARKS);
      },
      clear: function () { Render.fx.list.length = 0; Render.fx.marks.length = 0; },
      update: function (dt) {
        var l = Render.fx.list;
        for (var i = l.length - 1; i >= 0; i--) {
          var p = l[i];
          p.age += dt;
          if (p.vx) p.x += p.vx * dt;
          if (p.vy) p.y += p.vy * dt;
          if (p.type === 'spark') { p.vx *= 0.9; p.vy *= 0.9; }
          if (p.age >= p.life) { l[i] = l[l.length - 1]; l.pop(); }
        }
        var m = Render.fx.marks;
        for (i = m.length - 1; i >= 0; i--) { m[i].age += dt; if (m[i].age >= m[i].life) m.splice(i, 1); }
      },
      drawGround: function (ctx, view) {
        var m = Render.fx.marks;
        if (!m.length) return;
        ctx.lineCap = 'round'; ctx.lineWidth = 3;
        for (var i = 0; i < m.length; i++) {
          var k = m[i];
          if (k.x0 < view.x - 40 || k.x0 > view.x + view.w + 40 || k.y0 < view.y - 40 || k.y0 > view.y + view.h + 40) continue;
          var a = 0.42 * Math.min(1, (k.life - k.age) / 3);
          ctx.strokeStyle = k.color || ('rgba(18,18,22,' + a.toFixed(3) + ')');
          ctx.beginPath(); ctx.moveTo(k.x0, k.y0); ctx.lineTo(k.x1, k.y1); ctx.stroke();
        }
        ctx.lineCap = 'butt';
      },
      draw: function (ctx, view) {
        var l = Render.fx.list;
        for (var i = 0; i < l.length; i++) {
          var p = l[i];
          if (p.x < view.x - 100 || p.x > view.x + view.w + 100 || p.y < view.y - 100 || p.y > view.y + view.h + 100) continue;
          var t = p.age / p.life, k = 1 - t;
          switch (p.type) {
            case 'puff':
              ctx.globalAlpha = k * 0.7; ctx.fillStyle = p.color || '#e8e8e8';
              ctx.beginPath(); ctx.arc(p.x, p.y, (p.r0 || 3) + t * ((p.r1 || 12) - (p.r0 || 3)), 0, U.TAU); ctx.fill(); break;
            case 'spark':
              ctx.globalAlpha = k; ctx.strokeStyle = p.color || '#fff3b0'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); break;
            case 'smoke':
              ctx.globalAlpha = k * 0.5; ctx.fillStyle = p.color || '#555a66';
              ctx.beginPath(); ctx.arc(p.x, p.y, (p.r || 6) + t * 14, 0, U.TAU); ctx.fill(); break;
            case 'fire': {
              // a flame: orange outer tongue, yellow core, rising and shrinking, flickering sideways
              var fr = (p.r || 6) * (1 - t * 0.45), fxx = p.x + Math.sin(p.age * 40 + p.x) * 1.5, fyy = p.y - t * 10;
              ctx.globalAlpha = k * 0.9; ctx.fillStyle = t < 0.6 ? '#ff7a2a' : '#c43a1a';
              ellipse(ctx, fxx, fyy - fr * 0.3, fr, fr * 1.5); ctx.fill();
              ctx.globalAlpha = k; ctx.fillStyle = '#ffd23c';
              ellipse(ctx, fxx, fyy, fr * 0.55, fr * 0.9); ctx.fill();
              ctx.globalAlpha = k * 0.8; ctx.fillStyle = '#fff6c0';
              ellipse(ctx, fxx, fyy + fr * 0.2, fr * 0.25, fr * 0.45); ctx.fill(); break;
            }
            case 'explosion':
              ctx.globalAlpha = k; ctx.fillStyle = t < 0.25 ? '#fff6d0' : (t < 0.6 ? '#ffb13c' : '#ff6a3c');
              ctx.beginPath(); ctx.arc(p.x, p.y, 12 + t * (p.big ? 70 : 50), 0, U.TAU); ctx.fill();
              ctx.globalAlpha = k * 0.6; ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(p.x, p.y, 6 + t * 22, 0, U.TAU); ctx.fill(); break;
            case 'ring':
              ctx.globalAlpha = k * 0.85; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 4 * k + 1;
              ctx.beginPath(); ctx.arc(p.x, p.y, 16 + t * (p.r1 || 110), 0, U.TAU); ctx.stroke(); break;
            case 'text':
              ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = p.color || '#ffffff';
              ctx.font = 'bold ' + (p.size || 14) + 'px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'center';
              ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3; ctx.strokeText(p.text || '', p.x, p.y - t * 28); ctx.fillText(p.text || '', p.x, p.y - t * 28); break;
          }
        }
        ctx.globalAlpha = 1;
      }
    },

    // --------------------------------------------------------------- debug --
    drawDebugWorld: function (ctx, view) {
      if (!W.tiles) return;
      var tx0 = Math.max(0, Math.floor(view.x / TILE)), ty0 = Math.max(0, Math.floor(view.y / TILE));
      var tx1 = Math.min(W.w - 1, Math.floor((view.x + view.w) / TILE)), ty1 = Math.min(W.h - 1, Math.floor((view.y + view.h) / TILE));
      ctx.lineWidth = 1;
      for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
        var t = W.tile(tx, ty), x = tx * TILE, y = ty * TILE;
        if (W.isSolidTile(t)) { ctx.fillStyle = 'rgba(255,0,0,0.18)'; ctx.fillRect(x, y, TILE, TILE); }
        var d = W.roadDir(x + 16, y + 16);
        if (d) {
          ctx.strokeStyle = 'rgba(0,255,255,0.7)'; ctx.beginPath(); ctx.moveTo(x + 16 - d.dx * 8, y + 16 - d.dy * 8); ctx.lineTo(x + 16 + d.dx * 8, y + 16 + d.dy * 8); ctx.stroke();
          ctx.fillStyle = 'rgba(0,255,255,0.9)'; ctx.fillRect(x + 16 + d.dx * 8 - 2, y + 16 + d.dy * 8 - 2, 4, 4);
        }
      }
      ctx.strokeStyle = 'rgba(255,255,0,0.4)';
      for (var cx = Math.floor(view.x / CHPX) * CHPX; cx < view.x + view.w; cx += CHPX) { ctx.beginPath(); ctx.moveTo(cx, view.y); ctx.lineTo(cx, view.y + view.h); ctx.stroke(); }
      for (var cy = Math.floor(view.y / CHPX) * CHPX; cy < view.y + view.h; cy += CHPX) { ctx.beginPath(); ctx.moveTo(view.x, cy); ctx.lineTo(view.x + view.w, cy); ctx.stroke(); }
      var E = GTP.Entities;
      if (E) for (var i = 0; i < E.list.length; i++) { var e = E.list[i]; ctx.strokeStyle = 'rgba(0,255,0,0.8)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, U.TAU); ctx.stroke(); }
    },
    drawDebugHud: function (ctx) {
      var g = GTP.game, p = g.player;
      var lines = [
        'fps ' + (g.fps | 0) + '  frame ' + Render.stats.frameMs.toFixed(1) + 'ms  steps ' + g.steps,
        'cam ' + (Render.cam.x | 0) + ',' + (Render.cam.y | 0) + ' z' + Render.cam.zoom.toFixed(2) + '  chunks ' + Render.chunks.size + ' (' + Render.stats.chunkPaints + ' paints)',
        'ents ' + (GTP.Entities ? GTP.Entities.list.length : 0) + ' drawn ' + Render.stats.drawnEntities + '  fx ' + Render.fx.list.length + '  errors ' + GTP.errors.length,
        p ? ('player ' + (p.x | 0) + ',' + (p.y | 0) + ' tile ' + Math.floor(p.x / TILE) + ',' + Math.floor(p.y / TILE) + ' ' + ((W.districtAt(p.x, p.y) || {}).id || '-') + ' clock ' + U.fmtClock(g.time.clock) + ' night ' + Render.night.toFixed(2)) : ''
      ];
      ctx.font = '12px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'left';
      for (var i = 0; i < lines.length; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(8, VH - 70 + i * 15, ctx.measureText(lines[i]).width + 8, 14);
        ctx.fillStyle = '#9dff3c'; ctx.fillText(lines[i], 12, VH - 59 + i * 15);
      }
    }
  };
})();
