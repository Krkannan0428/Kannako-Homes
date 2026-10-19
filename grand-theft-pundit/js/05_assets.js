/* Grand Theft Pundit: 05_assets.js
 * GTP.Assets: every texture and mesh is generated here, once, from canvases
 * and primitives. Nothing is loaded from the network.
 *
 *   atlas            ground tiles (2048 px, 8x8 cells of 240 px with 8 px gutters)
 *   facade(style)    {day, night} CanvasTextures per facade style, 512 x 1280, 8 bands of 160 px:
 *                    0 ground floor, 1-4 upper floor variants, 5 roof, 6 swatches, 7 trim
 *   facadeMaterial   MeshLambertMaterial with the night texture as emissiveMap (lit windows)
 *   billboard(text)  signage texture; signMaterial(text, neon)
 *   prop(kind)       {geometry, material} vertex-colored low-poly props for InstancedMesh
 *   vehicleGeometry  low-poly car bodies with paint/detail groups; pedParts: articulated ped Group
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util, PAL = C.PAL, GB = GTP.GeoBuilder;
  var TAU = Math.PI * 2;

  var ATLAS = 2048, CELL = 256, S = 240, GUT = 8;   // atlas: cell pitch 256, content 240, gutter 8
  var FW = 512, FH = 1280, BAND = 160;              // facade texture
  var cells = {};                                   // name -> {col,row}
  var rngTex = GTP.makeRng(0xA55E7);

  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rgb(hex) { return hex; }
  function noise(ctx, w, h, n, amp, R) {
    for (var i = 0; i < n; i++) {
      var v = (R.random() - 0.5) * amp;
      ctx.fillStyle = v > 0 ? 'rgba(255,255,255,' + (v / 255).toFixed(3) + ')' : 'rgba(0,0,0,' + (-v / 255).toFixed(3) + ')';
      var sz = 1 + Math.floor(R.random() * 3);
      ctx.fillRect(R.random() * w, R.random() * h, sz, sz);
    }
  }
  function speckle(ctx, w, h, density, light, dark, R) {
    var n = Math.floor(w * h * density);
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = R.random() < 0.5 ? light : dark;
      ctx.fillRect(R.random() * w, R.random() * h, 2, 2);
    }
  }
  function cracks(ctx, w, h, n, color, R) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    for (var i = 0; i < n; i++) {
      var x = R.random() * w, y = R.random() * h;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (var k = 0; k < 5; k++) { x += (R.random() - 0.5) * 40; y += (R.random() - 0.5) * 40; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  function worn(ctx, x, y, w, h, R, n) {
    // erase little chips from painted lines so they look driven on
    for (var i = 0; i < (n || 6); i++) {
      ctx.clearRect(x + R.random() * w, y + R.random() * h, 2 + R.random() * 6, 1 + R.random() * 2);
    }
  }
  function alphaFill(ctx, color, a, x, y, w, h) { ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; }

  var Assets = GTP.Assets = {
    atlas: null, atlasCanvas: null, water: null, cells: cells,
    _facades: {}, _facadeMats: {}, _signs: {}, _signMats: {}, _props: {}, _vehicles: {}, _mats: {},
    particle: null, glow: null, sky: null, skyCanvas: null, ready: false,

    init: function () {
      if (Assets.ready) return;
      var t0 = U.now();
      Assets._buildAtlas();
      Assets._buildWater();
      Assets._buildSprites();
      Assets.ready = true;
      Assets.initMs = U.now() - t0;
    },

    // --------------------------------------------------------------- atlas --
    // uv(name) -> [u0, v0(bottom), u1, v1(top)] in GL space
    uv: function (name) {
      var c = cells[name] || cells.asphalt;
      var px = c.col * CELL + GUT, py = c.row * CELL + GUT;
      return [px / ATLAS, 1 - (py + S) / ATLAS, (px + S) / ATLAS, 1 - py / ATLAS];
    },
    // corner uvs [NW, NE, SE, SW] for a ground quad, rotated r quarter turns clockwise (seen from above)
    cellUVs: function (name, r) {
      var u = Assets.uv(name);
      var L = [[u[0], u[3]], [u[2], u[3]], [u[2], u[1]], [u[0], u[1]]];
      r = ((r | 0) % 4 + 4) % 4;
      return [L[(0 - r + 4) % 4], L[(1 - r + 4) % 4], L[(2 - r + 4) % 4], L[(3 - r + 4) % 4]];
    },
    // uvs for a vertical face: u spans [0..len/4] of the cell horizontally (clamped to the cell), v spans the cell
    faceUVs: function (name, len, height) {
      var u = Assets.uv(name);
      var fu = Math.min(1, (len || 4) / 4), fv = Math.min(1, (height || 4) / 4);
      var u1 = u[0] + (u[2] - u[0]) * fu, v1 = u[1] + (u[3] - u[1]) * fv;
      return [[u[0], u[1]], [u1, u[1]], [u1, v1], [u[0], v1]];
    },
    // uv of a solid point inside a cell (for flat-colored faces)
    pointUV: function (name) { var u = Assets.uv(name); var cu = (u[0] + u[2]) / 2, cv = (u[1] + u[3]) / 2; return [[cu, cv], [cu, cv], [cu, cv], [cu, cv]]; },

    _buildAtlas: function () {
      var cv = Assets.atlasCanvas = canvas(ATLAS, ATLAS), ctx = cv.getContext('2d');
      var tile = canvas(S, S), tctx = tile.getContext('2d');
      var names = Object.keys(TILES), idx = 0;
      ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, ATLAS, ATLAS);
      names.forEach(function (name) {
        var col = idx % 8, row = Math.floor(idx / 8); idx++;
        cells[name] = { col: col, row: row };
        tctx.clearRect(0, 0, S, S);
        tctx.save(); TILES[name](tctx, S, rngTex.fork(U.hash(name))); tctx.restore();
        var px = col * CELL, py = row * CELL;
        ctx.save(); ctx.beginPath(); ctx.rect(px, py, CELL, CELL); ctx.clip();
        // the gutter wraps the tile's own edges so mipmaps and filtering never bleed a neighbor in
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) ctx.drawImage(tile, px + GUT + dx * S, py + GUT + dy * S);
        ctx.restore();
      });
      var tex = Assets.atlas = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.anisotropy = C.QUALITY.anisotropy; tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
    },
    _buildWater: function () {
      var cv = canvas(256, 256), ctx = cv.getContext('2d'), R = rngTex.fork(99);
      ctx.fillStyle = PAL.water; ctx.fillRect(0, 0, 256, 256);
      function wave(color, a, n) {
        ctx.strokeStyle = color; ctx.globalAlpha = a; ctx.lineWidth = 2 + R.random() * 2;
        for (var i = 0; i < n; i++) {
          var y = R.random() * 256, x = R.random() * 256, len = 40 + R.random() * 80;
          for (var ox = -256; ox <= 256; ox += 256) for (var oy = -256; oy <= 256; oy += 256) {
            ctx.beginPath(); ctx.moveTo(x + ox, y + oy);
            ctx.quadraticCurveTo(x + ox + len / 2, y + oy - 6 + R.random() * 12, x + ox + len, y + oy);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
      wave(PAL.waterDeep, 0.5, 40); wave(PAL.waterLight, 0.45, 40); wave(PAL.foam, 0.25, 14);
      var tex = Assets.water = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    },
    _buildSprites: function () {
      var cv = canvas(64, 64), ctx = cv.getContext('2d');
      var g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
      Assets.particle = new THREE.CanvasTexture(cv);
      var cv2 = canvas(128, 128), c2 = cv2.getContext('2d');
      var g2 = c2.createRadialGradient(64, 64, 2, 64, 64, 62);
      g2.addColorStop(0, 'rgba(255,230,170,1)'); g2.addColorStop(0.25, 'rgba(255,200,110,0.55)'); g2.addColorStop(0.6, 'rgba(255,170,70,0.15)'); g2.addColorStop(1, 'rgba(255,150,50,0)');
      c2.fillStyle = g2; c2.fillRect(0, 0, 128, 128);
      Assets.glow = new THREE.CanvasTexture(cv2);
      Assets.glow.colorSpace = THREE.SRGBColorSpace;
      var sky = Assets.skyCanvas = canvas(4, 256);
      Assets.sky = new THREE.CanvasTexture(sky);
      Assets.sky.colorSpace = THREE.SRGBColorSpace;
      Assets.sky.minFilter = THREE.LinearFilter; Assets.sky.magFilter = THREE.LinearFilter;
      // the sun: soft warm disc
      var cv3 = canvas(128, 128), c3 = cv3.getContext('2d');
      var g3 = c3.createRadialGradient(64, 64, 10, 64, 64, 64);
      g3.addColorStop(0, 'rgba(255,250,230,1)'); g3.addColorStop(0.3, 'rgba(255,235,180,0.9)'); g3.addColorStop(0.55, 'rgba(255,200,120,0.25)'); g3.addColorStop(1, 'rgba(255,180,100,0)');
      c3.fillStyle = g3; c3.fillRect(0, 0, 128, 128);
      Assets.sun = new THREE.CanvasTexture(cv3); Assets.sun.colorSpace = THREE.SRGBColorSpace;
    },

    // ------------------------------------------------------------- facades --
    facade: function (style /*, floors */) {
      if (!FACADES[style]) style = 'downtown';
      var f = Assets._facades[style];
      if (f) return f;
      var day = canvas(FW, FH), night = canvas(FW, FH);
      var dctx = day.getContext('2d'), nctx = night.getContext('2d');
      nctx.fillStyle = '#000'; nctx.fillRect(0, 0, FW, FH);
      var R = rngTex.fork(U.hash('facade:' + style));
      var seed = R.int(1, 1e9);
      FACADES[style](dctx, false, GTP.makeRng(seed));
      FACADES[style](nctx, true, GTP.makeRng(seed));
      drawCommonBands(dctx, nctx, style, GTP.makeRng(seed + 1));
      var td = new THREE.CanvasTexture(day), tn = new THREE.CanvasTexture(night);
      [td, tn].forEach(function (t) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = C.QUALITY.anisotropy; t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; });
      f = Assets._facades[style] = { day: td, night: tn, style: style };
      return f;
    },
    facadeMaterial: function (style) {
      if (!FACADES[style]) style = 'downtown';
      var m = Assets._facadeMats[style];
      if (m) return m;
      var f = Assets.facade(style);
      // vertexColors: the chunk builder tints each building slightly so a style is not a row of clones
      m = new THREE.MeshLambertMaterial({ map: f.day, emissiveMap: f.night, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0, vertexColors: true });
      m.userData.style = style;
      Assets._facadeMats[style] = m;
      return m;
    },
    facadeStyles: function () { return Object.keys(FACADES); },
    // band uv rect: [u0, v0(bottom), u1, v1(top)] for band b (0..7); u spans 0..uRepeat
    bandUV: function (b, uRepeat) { return [0, 1 - (b + 1) * BAND / FH, uRepeat == null ? 1 : uRepeat, 1 - b * BAND / FH]; },
    // uvs of a solid swatch color (band 6, 16 swatches of 32 px)
    swatchUV: function (name) {
      var i = SWATCH_NAMES.indexOf(name); if (i < 0) i = 0;
      var u = (i + 0.5) * 32 / FW, v = 1 - (6 * BAND + BAND / 2) / FH;
      return [[u, v], [u, v], [u, v], [u, v]];
    },
    roof: function (style) { return Assets.facade(style).day; },

    // --------------------------------------------------------------- signs --
    billboard: function (text, opts) {
      opts = opts || {};
      var key = (opts.neon ? 'n:' : 'd:') + (opts.w || 2) + ':' + text;
      if (Assets._signs[key]) return Assets._signs[key];
      var ar = opts.w || 2, W = 512, H = Math.round(W / ar), cv = canvas(W, H), ctx = cv.getContext('2d');
      var R = rngTex.fork(U.hash(text));
      var neon = !!opts.neon, color = opts.color || (neon ? R.pick(PAL.neon) : '#f4efe4');
      var bg = opts.bg || (neon ? '#0b0a12' : R.pick(['#1d2233', '#2c3e7a', '#8a2f2f', '#2f6b4a', '#4a3a6a', '#e8e2c8', '#c94040']));
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      if (!neon) {
        // printed poster: halftone dots + a border
        ctx.globalAlpha = 0.08; ctx.fillStyle = '#000';
        for (var y = 6; y < H; y += 12) for (var x = 6; x < W; x += 12) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, W - 16, H - 16);
        var light = U.hexToRgb(bg.replace('#', '')).reduce(function (a, b) { return a + b; }, 0) > 450;
        if (!opts.color) color = light ? '#1d2233' : '#f4efe4';
      }
      // fit text: shrink until it fits, wrap on long lines
      var words = String(text).split(' '), lines = [text], size = Math.floor(H * 0.42);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      function setFont(sz) { ctx.font = '900 ' + sz + 'px "Arial Black", Impact, Arial, sans-serif'; }
      for (var tries = 0; tries < 20; tries++) {
        setFont(size);
        var widest = 0; lines.forEach(function (l) { widest = Math.max(widest, ctx.measureText(l).width); });
        if (widest <= W * 0.86 && lines.length * size * 1.1 <= H * 0.86) break;
        if (lines.length === 1 && words.length > 2 && widest > W * 0.86) {
          var mid = Math.ceil(words.length / 2);
          lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
        } else size = Math.floor(size * 0.86);
      }
      var lh = size * 1.1, y0 = H / 2 - (lines.length - 1) * lh / 2;
      lines.forEach(function (l, i) {
        if (neon) { ctx.shadowColor = color; ctx.shadowBlur = size * 0.5; ctx.lineWidth = Math.max(2, size * 0.08); ctx.strokeStyle = color; ctx.strokeText(l, W / 2, y0 + i * lh); ctx.strokeText(l, W / 2, y0 + i * lh); ctx.shadowBlur = 0; ctx.fillStyle = '#fff6ff'; ctx.globalAlpha = 0.85; ctx.fillText(l, W / 2, y0 + i * lh); ctx.globalAlpha = 1; }
        else { ctx.fillStyle = color; ctx.fillText(l, W / 2, y0 + i * lh); }
      });
      var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      tex.userData = { w: W, h: H, neon: neon };
      Assets._signs[key] = tex;
      return tex;
    },
    signMaterial: function (text, neon, ar) {
      var key = (neon ? 'n:' : 'd:') + (ar || 2) + ':' + text;
      if (Assets._signMats[key]) return Assets._signMats[key];
      var tex = Assets.billboard(text, { neon: neon, w: ar || 2 });
      var m = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: neon ? 0.5 : 0.1, side: THREE.DoubleSide });
      m.userData.neon = !!neon;
      Assets._signMats[key] = m;
      return m;
    },

    // --------------------------------------------------------------- props --
    propMaterial: function () {
      if (!Assets._mats.prop) Assets._mats.prop = new THREE.MeshLambertMaterial({ vertexColors: true });
      return Assets._mats.prop;
    },
    prop: function (kind) {
      if (Assets._props[kind]) return Assets._props[kind];
      var fn = PROPS[kind] || PROPS.crate;
      var g = new GB({ color: true });
      fn(g, GTP.makeRng(U.hash('prop:' + kind)));
      var rec = Assets._props[kind] = { geometry: g.build(), material: Assets.propMaterial(), castShadow: kind !== 'pool' && kind !== 'canopy' ? true : false };
      return rec;
    },
    colorMaterial: function (hex) {
      var m = Assets._mats['c:' + hex];
      if (!m) m = Assets._mats['c:' + hex] = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
      return m;
    },

    // ------------------------------------------------------------ vehicles --
    // Mesh-local frame: forward = -z, right = +x, up = +y, ground at y = 0.
    // Returns {body, groups, wheel, wheelRadius, wheelWidth, wheelOffsets[{x,z,steer}], lightPoints, doorPoints, size}.
    // Body geometry groups (material slots): paint 0, detail 1, glass 2, head 3, tail 4, barRed 5, barBlue 6, wrap 7.
    GROUPS: { paint: 0, detail: 1, glass: 2, head: 3, tail: 4, barRed: 5, barBlue: 6, wrap: 7 },
    vehicleGeometry: function (cls, wrap) {
      var key = cls + (wrap ? ':' + wrap : '');
      if (Assets._vehicles[key]) return Assets._vehicles[key];
      var spec = C.VEHICLES[cls] || C.VEHICLES.sedan;
      if (!C.VEHICLES[cls]) cls = 'sedan';
      var L = spec.length, Wd = spec.width, H = spec.height, wr = spec.wheelRadius, hl = L / 2, hw = Wd / 2;
      var G = { paint: new GB({ color: true }), detail: new GB({ color: true }), glass: new GB({ color: true }), head: new GB({ color: true }), tail: new GB({ color: true }), barRed: new GB({ color: true }), barBlue: new GB({ color: true }), wrap: new GB({ color: true }) };
      var WHITE = [1, 1, 1], GLASS = [0.42, 0.55, 0.66], DARK = [0.12, 0.12, 0.14], CHROME = [0.8, 0.82, 0.86], NAVY = [0.14, 0.2, 0.42], AMBER = [1, 0.72, 0.15], LGREY = [0.86, 0.86, 0.84], RED = [1, 0.12, 0.08], HEADC = [1, 0.97, 0.82], BLUE = [0.2, 0.45, 1];
      var y0 = wr * 0.85;
      var ww = cls === 'bike' ? 0.1 : (cls === 'truck' || cls === 'bus') ? 0.3 : cls === 'suv' ? 0.26 : 0.22;
      function box(g, x, y, z, w, h, d, col, faces) { g.box(x, y, z, w, h, d, GB.UV0, col, faces); }
      // trapezoid prism: bottom rect z[zb0,zb1] at yb, top rect z[zt0,zt1] (inset on x) at yt; cols = {front, back, left, right, top} -> [geo, color]
      function prism(x0, x1, yb, yt, zb0, zb1, zt0, zt1, inset, cols) {
        var A = [x0, yb, zb0], B = [x1, yb, zb0], Cc = [x1, yb, zb1], D = [x0, yb, zb1];
        var E = [x0 + inset, yt, zt0], F = [x1 - inset, yt, zt0], Gg = [x1 - inset, yt, zt1], Hh = [x0 + inset, yt, zt1];
        cols.front[0].quad(B, A, E, F, GB.UV0, cols.front[1]);
        cols.back[0].quad(D, Cc, Gg, Hh, GB.UV0, cols.back[1]);
        cols.right[0].quad(Cc, B, F, Gg, GB.UV0, cols.right[1]);
        cols.left[0].quad(A, D, Hh, E, GB.UV0, cols.left[1]);
        cols.top[0].quad(E, Hh, Gg, F, GB.UV0, cols.top[1]);
      }
      var P = G.paint, Dt = G.detail, Gl = G.glass;
      var glassCab = { front: [Gl, GLASS], back: [Gl, GLASS], left: [Gl, GLASS], right: [Gl, GLASS], top: [P, WHITE] };
      function lights(ly, lw, lh, inset, zf, zb) {
        zf = zf == null ? -hl : zf; zb = zb == null ? hl : zb;
        box(G.head, -hw + inset, ly, zf - 0.03, lw, lh, 0.08, HEADC); box(G.head, hw - inset - lw, ly, zf - 0.03, lw, lh, 0.08, HEADC);
        box(G.tail, -hw + inset, ly, zb - 0.05, lw, lh * 0.85, 0.08, RED); box(G.tail, hw - inset - lw, ly, zb - 0.05, lw, lh * 0.85, 0.08, RED);
      }
      function bumpers(h, zf, zb) {
        zf = zf == null ? -hl : zf; zb = zb == null ? hl : zb;
        box(Dt, -hw + 0.04, y0 - 0.02, zf - 0.1, Wd - 0.08, h, 0.14, DARK);
        box(Dt, -hw + 0.04, y0 - 0.02, zb - 0.04, Wd - 0.08, h, 0.14, DARK);
      }
      function underbody() { box(Dt, -hw + 0.15, y0 - 0.14, -hl + 0.4, Wd - 0.3, 0.16, L - 0.8, DARK, GB.ALL_FACES); }
      function mirrors(zc, yc) { box(Dt, -hw - 0.14, yc, zc, 0.16, 0.08, 0.1, DARK); box(Dt, hw - 0.02, yc, zc, 0.16, 0.08, 0.1, DARK); }
      function plate(zb, y) { box(Dt, -0.18, y, zb - 0.01, 0.36, 0.12, 0.03, LGREY); }
      function pillars(zb0, zb1, yb, yt) {
        var zm = (zb0 + zb1) / 2;
        box(P, -hw + 0.08, yb, zm - 0.05, 0.05, yt - yb, 0.1, WHITE); box(P, hw - 0.13, yb, zm - 0.05, 0.05, yt - yb, 0.1, WHITE);
      }
      var cab = null;   // cabin extents for door/light placement
      if (cls === 'sedan' || cls === 'cop' || cls === 'taxi') {
        var bh = 0.55;
        box(P, -hw, y0, -hl, Wd, bh, L, WHITE, GB.NO_BOTTOM);
        cab = { zb0: -hl + 1.55, zb1: hl - 0.95 };
        box(P, -hw + 0.02, y0 + bh, -hl + 0.1, Wd - 0.04, 0.17, cab.zb0 + hl - 0.1 + 0.2, WHITE);      // hood
        box(P, -hw + 0.02, y0 + bh, cab.zb1 - 0.2, Wd - 0.04, 0.15, hl - cab.zb1 + 0.1, WHITE);        // trunk
        prism(-hw + 0.1, hw - 0.1, y0 + bh + 0.17, H, cab.zb0, cab.zb1, cab.zb0 + 0.8, cab.zb1 - 0.45, 0.1, glassCab);
        pillars(cab.zb0 + 0.3, cab.zb1 - 0.1, y0 + bh + 0.17, H - 0.03);
        bumpers(0.24); underbody(); mirrors(cab.zb0 + 0.1, y0 + bh + 0.3); plate(hl, y0 + 0.2);
        box(Dt, -0.45, y0 + 0.2, -hl - 0.02, 0.9, 0.22, 0.05, DARK);   // grille
        lights(y0 + 0.36, 0.36, 0.16, 0.14);
        if (cls === 'cop') {
          box(Dt, -0.6, H - 0.02, -0.25, 1.2, 0.06, 0.5, DARK);
          box(G.barRed, -0.58, H + 0.04, -0.2, 0.56, 0.16, 0.4, RED); box(G.barBlue, 0.02, H + 0.04, -0.2, 0.56, 0.16, 0.4, BLUE);
          box(Dt, -hw - 0.01, y0 + 0.18, cab.zb0 - 0.2, 0.02, 0.26, cab.zb1 - cab.zb0 + 0.4, NAVY); box(Dt, hw - 0.01, y0 + 0.18, cab.zb0 - 0.2, 0.02, 0.26, cab.zb1 - cab.zb0 + 0.4, NAVY);
          box(Dt, -hw + 0.25, y0 + 0.05, -hl - 0.3, 0.07, 0.5, 0.07, DARK); box(Dt, hw - 0.32, y0 + 0.05, -hl - 0.3, 0.07, 0.5, 0.07, DARK); box(Dt, -hw + 0.25, y0 + 0.45, -hl - 0.32, Wd - 0.5, 0.08, 0.08, DARK);   // push bar
          box(P, -hw, y0 + bh - 0.01, -hl + 0.3, Wd, 0.02, L - 0.6, [0.1, 0.14, 0.3]);   // dark beltline
        }
        if (cls === 'taxi') {
          box(Dt, -0.4, H - 0.01, -0.25, 0.8, 0.24, 0.34, AMBER);
          box(Dt, -0.28, H + 0.05, -0.27, 0.56, 0.1, 0.02, DARK); box(Dt, -0.28, H + 0.05, 0.08, 0.56, 0.1, 0.02, DARK);
          for (var ck = 0; ck < 10; ck++) { var cz = -hl + 0.3 + ck * (L - 0.6) / 10; box(Dt, -hw - 0.01, y0 + 0.3, cz, 0.02, 0.12, (L - 0.6) / 10, ck % 2 ? DARK : WHITE); box(Dt, hw - 0.01, y0 + 0.3, cz, 0.02, 0.12, (L - 0.6) / 10, ck % 2 ? DARK : WHITE); }
        }
      } else if (cls === 'sports') {
        box(P, -hw, y0, -hl, Wd, 0.4, L, WHITE, GB.NO_BOTTOM);
        cab = { zb0: -hl + 1.75, zb1: hl - 1.05 };
        prism(-hw, hw, y0 + 0.4, y0 + 0.62, -hl + 0.05, hl - 0.05, cab.zb0 - 0.05, hl - 0.05, 0.02, { front: [P, WHITE], back: [P, WHITE], left: [P, WHITE], right: [P, WHITE], top: [P, WHITE] });
        prism(-hw + 0.12, hw - 0.12, y0 + 0.62, H, cab.zb0, cab.zb1, cab.zb0 + 0.95, cab.zb1 - 0.3, 0.12, glassCab);
        pillars(cab.zb0 + 0.5, cab.zb1, y0 + 0.62, H - 0.03);
        box(Dt, -hw + 0.1, H - 0.22, hl - 0.5, 0.08, 0.2, 0.3, DARK); box(Dt, hw - 0.18, H - 0.22, hl - 0.5, 0.08, 0.2, 0.3, DARK);
        box(P, -hw + 0.05, H - 0.06, hl - 0.6, Wd - 0.1, 0.06, 0.4, WHITE);   // wing
        box(Dt, -hw + 0.1, y0 - 0.08, -hl - 0.12, Wd - 0.2, 0.2, 0.2, DARK);  // splitter
        box(Dt, -hw - 0.02, y0 - 0.06, -hl + 0.9, 0.06, 0.12, L - 1.8, DARK); box(Dt, hw - 0.04, y0 - 0.06, -hl + 0.9, 0.06, 0.12, L - 1.8, DARK);   // skirts
        bumpers(0.18); underbody(); mirrors(cab.zb0 + 0.15, y0 + 0.7); plate(hl, y0 + 0.14);
        box(Dt, -0.5, y0 + 0.08, -hl - 0.02, 1.0, 0.2, 0.05, DARK);
        lights(y0 + 0.34, 0.42, 0.12, 0.12);
      } else if (cls === 'suv') {
        box(P, -hw, y0, -hl, Wd, 0.72, L, WHITE, GB.NO_BOTTOM);
        cab = { zb0: -hl + 1.45, zb1: hl - 0.15 };
        box(P, -hw + 0.03, y0 + 0.72, -hl + 0.08, Wd - 0.06, 0.26, cab.zb0 + hl + 0.1, WHITE);       // hood
        prism(-hw + 0.06, hw - 0.06, y0 + 0.98, H, cab.zb0, cab.zb1, cab.zb0 + 0.55, cab.zb1 - 0.08, 0.08, glassCab);
        pillars(cab.zb0 + 0.3, cab.zb1 - 1.2, y0 + 0.98, H - 0.03); pillars(cab.zb0 + 1.9, cab.zb1 + 0.4, y0 + 0.98, H - 0.03);
        box(Dt, -hw + 0.25, H - 0.02, cab.zb0 + 0.6, 0.08, 0.1, cab.zb1 - cab.zb0 - 0.9, DARK); box(Dt, hw - 0.33, H - 0.02, cab.zb0 + 0.6, 0.08, 0.1, cab.zb1 - cab.zb0 - 0.9, DARK);   // roof rails
        box(Dt, -hw - 0.1, y0 + 0.05, -hl + 1.3, 0.12, 0.08, L - 2.6, DARK); box(Dt, hw - 0.02, y0 + 0.05, -hl + 1.3, 0.12, 0.08, L - 2.6, DARK);   // side steps
        bumpers(0.3); underbody(); mirrors(cab.zb0 + 0.1, y0 + 1.1); plate(hl, y0 + 0.3);
        box(Dt, -0.55, y0 + 0.28, -hl - 0.02, 1.1, 0.34, 0.05, DARK);
        lights(y0 + 0.5, 0.34, 0.2, 0.14);
      } else if (cls === 'truck') {
        var cabL = 2.5;
        box(Dt, -hw + 0.2, y0 - 0.1, -hl + 0.3, Wd - 0.4, 0.34, L - 0.6, DARK);                        // chassis rails
        box(P, -hw + 0.05, y0, -hl, Wd - 0.1, 1.0, 1.5, WHITE);                                           // hood
        cab = { zb0: -hl + 1.3, zb1: -hl + cabL };
        prism(-hw + 0.05, hw - 0.05, y0 + 1.0, y0 + 2.1, cab.zb0, cab.zb1, cab.zb0 + 0.35, cab.zb1, 0.06, { front: [Gl, GLASS], back: [P, WHITE], left: [Gl, GLASS], right: [Gl, GLASS], top: [P, WHITE] });
        box(P, -hw + 0.05, y0, cab.zb0, Wd - 0.1, 1.0, cabL - 1.3, WHITE);                               // cab lower
        pillars(cab.zb0 + 0.6, cab.zb1 - 0.05, y0 + 1.0, y0 + 2.08);
        box(Dt, -hw, y0 + 0.3, -hl + cabL + 0.3, Wd, H - y0 - 0.3, L - cabL - 0.4, LGREY);              // cargo box
        box(Dt, -0.03, y0 + 0.4, hl - 0.11, 0.06, H - y0 - 0.6, 0.03, DARK);                               // rear door seam
        box(Dt, -0.25, y0 + 2.14, cab.zb0 + 0.2, 0.5, 0.25, 0.3, CHROME);                                 // exhaust stack / horn
        box(Dt, -hw + 0.3, y0 + 0.05, -hl - 0.15, Wd - 0.6, 0.4, 0.2, CHROME);                            // front bumper
        box(Dt, -0.6, y0 + 0.35, -hl - 0.02, 1.2, 0.5, 0.05, DARK);                                        // grille
        mirrors(cab.zb0, y0 + 1.5);
        lights(y0 + 0.5, 0.36, 0.22, 0.2, -hl, hl);
      } else if (cls === 'van') {
        var noseL = 1.15;
        box(P, -hw + 0.02, y0, -hl, Wd - 0.04, 0.85, noseL + 0.1, WHITE, GB.NO_BOTTOM);                   // nose
        box(P, -hw, y0, -hl + noseL, Wd, H - y0, L - noseL, WHITE, GB.NO_BOTTOM);                         // body
        prism(-hw + 0.02, hw - 0.02, y0 + 0.85, H, -hl + 0.3, -hl + noseL, -hl + noseL - 0.05, -hl + noseL, 0.0, { front: [Gl, GLASS], back: [P, WHITE], left: [P, WHITE], right: [P, WHITE], top: [P, WHITE] });
        box(Gl, -hw - 0.01, y0 + 1.05, -hl + noseL + 0.08, 0.03, H - y0 - 1.45, 1.0, GLASS); box(Gl, hw - 0.02, y0 + 1.05, -hl + noseL + 0.08, 0.03, H - y0 - 1.45, 1.0, GLASS);   // cab windows
        box(Dt, -0.02, y0 + 0.3, hl - 0.11, 0.04, H - y0 - 0.5, 0.03, DARK);                               // rear doors seam
        box(Dt, -hw + 0.3, y0 + 0.5, hl - 0.11, 0.3, 0.3, 0.03, GLASS); box(Dt, hw - 0.6, y0 + 0.5, hl - 0.11, 0.3, 0.3, 0.03, GLASS);
        bumpers(0.26); underbody(); mirrors(-hl + noseL + 0.05, y0 + 1.25); plate(hl, y0 + 0.2);
        box(Dt, -0.5, y0 + 0.25, -hl - 0.02, 1.0, 0.3, 0.05, DARK);
        lights(y0 + 0.4, 0.34, 0.2, 0.15);
        if (wrap) {
          // side panels + rear doors carry the wrap texture (u runs front -> back on the left, back -> front on the right)
          // texture: upper half = side panels (u front -> back on the left, back -> front on the right), lower half centre = rear doors
          var wz0 = -hl + noseL + 1.2, wz1 = hl - 0.05, wy0 = y0 + 0.35, wy1 = H - 0.25, e = 0.012;
          G.wrap.quad([-hw - e, wy0, wz0], [-hw - e, wy0, wz1], [-hw - e, wy1, wz1], [-hw - e, wy1, wz0], [[0, 0.5], [1, 0.5], [1, 1], [0, 1]], WHITE);
          G.wrap.quad([hw + e, wy0, wz1], [hw + e, wy0, wz0], [hw + e, wy1, wz0], [hw + e, wy1, wz1], [[0, 0.5], [1, 0.5], [1, 1], [0, 1]], WHITE);
          G.wrap.quad([-hw + 0.1, wy0, hl + e], [hw - 0.1, wy0, hl + e], [hw - 0.1, wy1, hl + e], [-hw + 0.1, wy1, hl + e], [[0.25, 0], [0.75, 0], [0.75, 0.5], [0.25, 0.5]], WHITE);
        }
      } else if (cls === 'bus') {
        var wy = y0 + 1.25, wh = 1.05, winL = 0.95, gap = 0.18, nWin = 8;
        box(P, -hw, y0, -hl, Wd, H - y0 - 0.12, L, WHITE, GB.NO_BOTTOM);
        box(P, -hw + 0.1, H - 0.14, -hl + 0.3, Wd - 0.2, 0.14, L - 0.6, WHITE);                           // roof
        for (var wi = 0; wi < nWin; wi++) {
          var wz = -hl + 1.5 + wi * (winL + gap);
          box(Gl, -hw - 0.015, wy, wz, 0.03, wh, winL, GLASS); box(Gl, hw - 0.015, wy, wz, 0.03, wh, winL, GLASS);
        }
        box(Gl, -hw + 0.12, y0 + 1.0, -hl - 0.02, Wd - 0.24, H - y0 - 1.3, 0.04, GLASS);                   // windshield
        box(Gl, -hw + 0.2, wy, hl - 0.02, Wd - 0.4, wh, 0.04, GLASS);                                      // rear window
        box(Dt, hw - 0.015, y0 + 0.1, -hl + 0.45, 0.03, H - y0 - 0.5, 0.9, DARK);                           // front door (right side)
        box(Dt, hw - 0.015, y0 + 0.1, hl - 3.2, 0.03, H - y0 - 0.5, 0.9, DARK);                             // rear door
        box(Dt, -0.9, H - 0.55, -hl - 0.03, 1.8, 0.3, 0.05, AMBER);                                         // destination sign
        box(Dt, -hw, y0 + 0.5, -hl + 0.2, Wd, 0.06, L - 0.4, NAVY);                                         // stripe
        bumpers(0.3); underbody(); mirrors(-hl + 0.1, y0 + 1.6);
        lights(y0 + 0.55, 0.3, 0.2, 0.2);
      } else if (cls === 'bike') {
        box(Dt, -0.2, 0.3, -0.35, 0.4, 0.06, 0.9, DARK);                                                     // floorboard
        box(P, -0.22, 0.42, 0.05, 0.44, 0.34, 0.8, WHITE);                                                   // rear body
        box(Dt, -0.17, 0.76, 0.0, 0.34, 0.1, 0.72, DARK);                                                    // seat
        prism(-0.2, 0.2, 0.35, 0.95, -0.9, -0.62, -0.8, -0.64, 0.0, { front: [P, WHITE], back: [P, WHITE], left: [P, WHITE], right: [P, WHITE], top: [P, WHITE] });   // front shield
        box(Dt, -0.03, 0.9, -0.78, 0.06, 0.12, 0.06, DARK);                                                  // column
        box(Dt, -0.32, 1.0, -0.8, 0.64, 0.04, 0.04, CHROME);                                                 // bars
        box(Dt, -0.07, 0.5, -0.9, 0.14, 0.09, 0.02, LGREY);                                                  // the tiny front plate
        box(G.head, -0.09, 0.72, -0.9, 0.18, 0.14, 0.04, HEADC);
        box(G.tail, -0.08, 0.6, 0.84, 0.16, 0.08, 0.04, RED);
        box(Dt, -0.06, 0.1, -0.76, 0.12, 0.3, 0.1, DARK); box(Dt, -0.06, 0.1, 0.66, 0.12, 0.3, 0.1, DARK);   // forks
      }
      // merge with stable group indices
      var order = ['paint', 'detail', 'glass', 'head', 'tail', 'barRed', 'barBlue', 'wrap'], parts = [], ranges = [];
      order.forEach(function (name, gi) {
        var gb = G[name]; if (!gb.count()) return;
        var geo = gb.build(); parts.push(geo); ranges.push({ gi: gi, count: geo.getIndex().count });
      });
      var body = GB.merge(parts), start = 0;
      body.clearGroups();
      ranges.forEach(function (r) { body.addGroup(start, r.count, r.gi); start += r.count; });
      // wheels: a cylinder around the x axis with a hub cap so the spin reads
      var wg = new GB({ color: true });
      wheelAxle(wg, wr, ww, DARK, CHROME, cls === 'bike' ? 8 : 12);
      var wx = cls === 'bike' ? 0 : hw - ww * 0.5 + 0.02, fz = -(hl - L * 0.2), bz = hl - L * 0.2;
      var wheelOffsets;
      if (cls === 'bike') wheelOffsets = [{ x: 0, z: -0.72, steer: true }, { x: 0, z: 0.72, steer: false }];
      else if (cls === 'truck') wheelOffsets = [{ x: -wx, z: -hl + 1.0, steer: true }, { x: wx, z: -hl + 1.0, steer: true }, { x: -wx, z: hl - 1.0, steer: false }, { x: wx, z: hl - 1.0, steer: false }, { x: -wx, z: hl - 2.3, steer: false }, { x: wx, z: hl - 2.3, steer: false }];
      else if (cls === 'bus') wheelOffsets = [{ x: -wx, z: -hl + 1.7, steer: true }, { x: wx, z: -hl + 1.7, steer: true }, { x: -wx, z: hl - 2.4, steer: false }, { x: wx, z: hl - 2.4, steer: false }];
      else wheelOffsets = [{ x: -wx, z: fz, steer: true }, { x: wx, z: fz, steer: true }, { x: -wx, z: bz, steer: false }, { x: wx, z: bz, steer: false }];
      var ly = cls === 'bike' ? 0.78 : cls === 'truck' ? y0 + 0.6 : y0 + 0.45;
      var rec = Assets._vehicles[key] = {
        body: body, groups: Assets.GROUPS, wheel: wg.build(), wheelRadius: wr, wheelWidth: ww, wheelOffsets: wheelOffsets,
        lightPoints: { headL: { x: -hw + 0.3, y: ly, z: -hl }, headR: { x: hw - 0.3, y: ly, z: -hl }, head: { x: 0, y: ly, z: -hl }, tailL: { x: -hw + 0.3, y: ly, z: hl }, tailR: { x: hw - 0.3, y: ly, z: hl }, roof: { x: 0, y: H + 0.1, z: 0 }, eye: { x: cls === 'bike' ? 0 : -0.4, y: H * 0.82, z: cab ? cab.zb0 + 0.6 : -hl * 0.2 } },
        doorPoints: [{ x: -(hw + 0.7), z: -hl * 0.15, seat: 0 }, { x: hw + 0.7, z: -hl * 0.15, seat: 1 }],
        size: { length: L, width: Wd, height: H }, wrap: wrap || null
      };
      return rec;
    },
    // the podcast van livery: canvas texture with the game logo (the T is a folding table)
    wrapTexture: function (name) {
      Assets._wraps = Assets._wraps || {};
      if (Assets._wraps[name]) return Assets._wraps[name];
      // upper half: the side panel; lower half, centre 512 px: the rear doors
      var Wc = 1024, Hc = 768, Hs = 384, cv = canvas(Wc, Hc), ctx = cv.getContext('2d');
      ctx.fillStyle = '#f4f1ea'; ctx.fillRect(0, 0, Wc, Hc);
      function tableT(tx, ty, s) { ctx.fillStyle = PAL.gold; ctx.fillRect(tx - 46 * s, ty, 92 * s, 16 * s); ctx.fillRect(tx - 30 * s, ty + 16 * s, 10 * s, 58 * s); ctx.fillRect(tx + 20 * s, ty + 16 * s, 10 * s, 58 * s); }
      // headless browsers may lack Arial Black: shrink the display font until the line fits
      function fitFont(text, size, maxW) {
        for (var k = 0; k < 12; k++) { ctx.font = '900 ' + size + 'px "Arial Black", Impact, Arial, sans-serif'; if (ctx.measureText(text).width <= maxW) break; size = Math.floor(size * 0.9); }
        return size;
      }
      // side: diagonal neon bands, the logo, the tagline
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, Wc, Hs); ctx.clip();
      ctx.save(); ctx.rotate(-0.12);
      ctx.fillStyle = PAL.neon[0]; ctx.fillRect(-100, 250, Wc + 300, 70);
      ctx.fillStyle = PAL.neon[1]; ctx.fillRect(-100, 330, Wc + 300, 30);
      ctx.restore();
      ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, Wc, 30); ctx.fillRect(0, Hs - 34, Wc, 34);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var fs = fitFont('LOUD & CORRECT', 118, Wc * 0.84);
      ctx.fillStyle = '#101014'; ctx.fillText('LOUD & CORRECT', Wc / 2 + 4, 132);
      ctx.fillStyle = PAL.neon[0]; ctx.fillText('LOUD & CORRECT', Wc / 2, 126);
      var lw = ctx.measureText('LOUD & CORRECT').width, tw = ctx.measureText('T').width;
      tableT(Wc / 2 + lw / 2 - tw / 2, 126 - fs * 0.36, fs / 118);
      ctx.font = '700 44px ui-monospace, Menlo, Consolas, monospace'; ctx.fillStyle = '#101014';
      ctx.fillText('A PODCAST. FROM A VAN.', Wc / 2, 215);
      ctx.font = '700 26px ui-monospace, Menlo, Consolas, monospace'; ctx.fillStyle = '#f4f1ea';
      ctx.fillText('ASK ME ANYTHING, I\'LL ANSWER SOMETHING ELSE', Wc / 2, Hs - 17);
      ctx.fillText('CODE TAKES20', Wc - 160, 15);
      ctx.restore();
      // rear doors (x 256..768, y 384..768): two-line logo, a band, the sponsor code
      ctx.save(); ctx.beginPath(); ctx.rect(256, Hs, 512, Hs); ctx.clip();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';   // restore() above reset the alignment
      ctx.fillStyle = PAL.neon[0]; ctx.fillRect(256, Hs + 250, 512, 44); ctx.fillStyle = PAL.neon[1]; ctx.fillRect(256, Hs + 300, 512, 18);
      ctx.fillStyle = '#101014'; ctx.fillRect(256, Hs, 512, 20); ctx.fillRect(256, Hc - 36, 512, 36);
      var fs2 = fitFont('CORRECT', 96, 512 * 0.86);
      ctx.fillStyle = '#101014'; ctx.fillText('LOUD &', 512 + 3, Hs + 92); ctx.fillText('CORRECT', 512 + 3, Hs + 190);
      ctx.fillStyle = PAL.neon[0]; ctx.fillText('LOUD &', 512, Hs + 88); ctx.fillText('CORRECT', 512, Hs + 186);
      var cw = ctx.measureText('CORRECT').width, tw2 = ctx.measureText('T').width;
      tableT(512 + cw / 2 - tw2 / 2, Hs + 186 - fs2 * 0.36, fs2 / 118);
      ctx.font = '700 30px ui-monospace, Menlo, Consolas, monospace'; ctx.fillStyle = '#f4f1ea';
      ctx.fillText('CODE TAKES20', 512, Hc - 17);
      ctx.restore();
      var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      Assets._wraps[name] = tex;
      return tex;
    },

    // ---------------------------------------------------------------- peds --
    // Articulated low-poly figure. Root group (feet at y 0, faces -z) with pivots:
    //   legL legR (hips), torso (hip pivot holding the torso mesh, armL armR shoulder pivots, head)
    // Each pivot holds one merged vertex-coloured mesh, so a ped costs six draw calls.
    pedParts: function (look) {
      look = look || {};
      var g = new THREE.Group();
      var mat = Assets.propMaterial();
      var sc = look.scale || 1;
      var skin = c(skinHex(look.skin)), shirt = c(look.shirt || '#6a8fcf'), pants = c(look.pants || '#2a2f4a'), hair = c(look.hairColor || '#3a2a1a');
      var shoe = [0.13, 0.13, 0.15];
      var legH = 0.84, torsoH = 0.6, headR = 0.14, hy = torsoH + 0.05 + 0.15;   // head centre in torso space
      function mesh(name, geo, x, y, z) { var m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.userData.own = false; if (x != null) m.position.set(x, y, z); return m; }
      function pivot(name, x, y, z) { var p = new THREE.Group(); p.name = name; p.position.set(x, y, z); return p; }
      // legs
      var legGeo = pedGeo('leg:' + look.pants, function (L) {
        L.push(gbox(-0.085, -legH, -0.1, 0.17, legH - 0.04, 0.2, pants));
        L.push(gbox(-0.09, -legH, -0.15, 0.18, 0.08, 0.3, shoe));
      });
      var legL = pivot('legL', -0.11, legH, 0), legR = pivot('legR', 0.11, legH, 0);
      legL.add(mesh('legLMesh', legGeo)); legR.add(mesh('legRMesh', legGeo));
      g.add(legL); g.add(legR);
      // torso pivot at the hip
      var torso = pivot('torso', 0, legH, 0);
      var torsoKey = ['torso', look.shirt, look.tie, look.extra, look.uniform, look.badge, look.skin].join('|');
      var torsoGeo = pedGeo(torsoKey, function (L) {
        L.push(gbox(-0.23, 0, -0.13, 0.46, torsoH, 0.26, shirt));
        L.push(gbox(-0.05, torsoH - 0.01, -0.05, 0.1, 0.07, 0.1, skin));   // neck
        if (look.uniform === 'swat') L.push(gbox(-0.25, 0.12, -0.15, 0.5, 0.42, 0.3, [0.1, 0.11, 0.14]));
        if (look.badge) L.push(gbox(0.08, torsoH - 0.2, -0.14, 0.06, 0.07, 0.012, c(look.badge)));
        var tie = look.tie && look.tie !== 'none' ? look.tie : null;
        if (tie === 'bowtie') { var bc = [0.1, 0.1, 0.12]; L.push(gbox(-0.08, torsoH - 0.08, -0.145, 0.06, 0.05, 0.02, bc)); L.push(gbox(0.02, torsoH - 0.08, -0.145, 0.06, 0.05, 0.02, bc)); L.push(gbox(-0.02, torsoH - 0.07, -0.15, 0.04, 0.03, 0.025, bc)); }
        else if (tie) { var tc = c(tie === 'red' ? '#c94040' : tie === 'blue' ? '#3d6fcf' : '#e8b53a'); L.push(gbox(-0.035, torsoH - 0.08, -0.14, 0.07, 0.05, 0.02, tc)); L.push(gbox(-0.03, torsoH - 0.4, -0.138, 0.06, 0.33, 0.015, tc)); }
        if (look.extra === 'lanyard') { var lc = c(look.lanyardColor || '#c94040'); L.push(gbox(-0.09, torsoH - 0.34, -0.14, 0.02, 0.3, 0.012, lc)); L.push(gbox(0.07, torsoH - 0.34, -0.14, 0.02, 0.3, 0.012, lc)); L.push(gbox(-0.05, torsoH - 0.46, -0.142, 0.1, 0.13, 0.012, [0.95, 0.95, 0.95])); L.push(gbox(-0.04, torsoH - 0.42, -0.145, 0.08, 0.02, 0.012, [0.2, 0.2, 0.2])); }
        if (look.extra === 'medal') { L.push(gbox(-0.15, torsoH - 0.2, -0.14, 0.05, 0.08, 0.012, [0.8, 0.1, 0.1])); L.push(gcyl(-0.125, torsoH - 0.27, -0.145, 0.05, 0.012, c('#e8b53a'), Math.PI / 2)); }
        if (look.extra === 'flag_pin') { L.push(gbox(-0.17, torsoH - 0.16, -0.14, 0.06, 0.04, 0.012, [0.2, 0.35, 0.8])); L.push(gbox(-0.17, torsoH - 0.14, -0.142, 0.06, 0.012, 0.012, [0.95, 0.95, 0.95])); }
      });
      torso.add(mesh('torsoMesh', torsoGeo));
      // arms (shoulder pivots in torso space)
      function armGeo(side) {
        var held = side > 0 ? (look.extra === 'mic' || look.extra === 'phone' ? look.extra : null) : (look.sign ? 'sign' : null);
        return pedGeo(['arm', side, look.shirt, look.skin, held].join('|'), function (L) {
          L.push(gbox(-0.065, -0.56, -0.07, 0.13, 0.54, 0.14, shirt));
          L.push(gbox(-0.06, -0.66, -0.06, 0.12, 0.11, 0.12, skin));
          if (held === 'mic') { L.push(gcyl(0, -0.72, -0.04, 0.025, 0.2, [0.12, 0.12, 0.14], 0)); L.push(gsphere(0, -0.5, -0.04, 0.045, [0.55, 0.55, 0.58])); }
          if (held === 'phone') L.push(gbox(-0.035, -0.7, -0.14, 0.07, 0.13, 0.015, [0.1, 0.1, 0.12]));
          if (held === 'sign') { L.push(gbox(-0.015, -0.7, -0.1, 0.03, 1.0, 0.03, c('#8a6a44'))); L.push(gbox(-0.26, 0.2, -0.11, 0.52, 0.36, 0.02, [0.95, 0.93, 0.88])); L.push(gbox(-0.2, 0.3, -0.122, 0.4, 0.05, 0.012, c('#ff7a00'))); L.push(gbox(-0.16, 0.22, -0.122, 0.32, 0.04, 0.012, c('#ff7a00'))); }
        });
      }
      var armL = pivot('armL', -0.3, torsoH - 0.06, 0), armR = pivot('armR', 0.3, torsoH - 0.06, 0);
      armL.add(mesh('armLMesh', armGeo(-1))); armR.add(mesh('armRMesh', armGeo(1)));
      torso.add(armL); torso.add(armR);
      // head: face, hair, hat, glasses, face extras
      var hat = look.hat && look.hat !== 'none' ? look.hat : null, hairStyle = look.hair || 'short', glasses = look.glasses && look.glasses !== 'none' ? look.glasses : null;
      var headKey = ['head', look.skin, hairStyle, look.hairColor, hat, look.hatColor, glasses, look.extra, look.mask].join('|');
      var headGeo = pedGeo(headKey, function (L) {
        var ht = 0.15;   // half height
        L.push(gbox(-headR, -ht, -headR, headR * 2, ht * 2, headR * 2, skin));
        L.push(gbox(-headR - 0.012, -0.03, -0.05, 0.012, 0.06, 0.04, skin)); L.push(gbox(headR, -0.03, -0.05, 0.012, 0.06, 0.04, skin));   // ears
        L.push(gbox(-0.07, 0.01, -headR - 0.004, 0.035, 0.03, 0.006, [0.08, 0.08, 0.1])); L.push(gbox(0.035, 0.01, -headR - 0.004, 0.035, 0.03, 0.006, [0.08, 0.08, 0.1]));   // eyes
        L.push(gbox(-0.02, -0.04, -headR - 0.02, 0.04, 0.05, 0.02, skin));   // nose
        L.push(gbox(-0.04, -0.1, -headR - 0.003, 0.08, 0.012, 0.004, [0.45, 0.2, 0.2]));   // mouth
        if (look.mask) L.push(gbox(-headR - 0.005, -0.005, -headR - 0.006, headR * 2 + 0.01, 0.06, headR * 2 + 0.006, c(look.mask)));
        var top = ht, capY = top - 0.04;
        var hideHairTop = hat === 'beanie' || hat === 'helmet' || hat === 'cap';
        if (hairStyle !== 'bald' || !hairStyle) {
          if (hairStyle === 'short') { L.push(gbox(-headR - 0.01, capY, -headR - 0.005, headR * 2 + 0.02, 0.1, headR * 2 + 0.015, hair)); L.push(gbox(-headR - 0.01, -0.08, headR - 0.03, headR * 2 + 0.02, 0.2, 0.04, hair)); }
          else if (hairStyle === 'slick') { L.push(gbox(-headR - 0.008, top - 0.02, -headR - 0.002, headR * 2 + 0.016, 0.055, headR * 2 + 0.012, hair)); L.push(gbox(-headR - 0.008, -0.06, headR - 0.02, headR * 2 + 0.016, 0.2, 0.03, hair)); }
          else if (hairStyle === 'long') { L.push(gbox(-headR - 0.012, capY, -headR - 0.005, headR * 2 + 0.024, 0.1, headR * 2 + 0.02, hair)); L.push(gbox(-headR - 0.012, -0.5, headR - 0.05, headR * 2 + 0.024, 0.6, 0.08, hair)); L.push(gbox(-headR - 0.03, -0.36, -0.08, 0.03, 0.46, headR + 0.1, hair)); L.push(gbox(headR, -0.36, -0.08, 0.03, 0.46, headR + 0.1, hair)); }
          else if (hairStyle === 'bob') { L.push(gbox(-headR - 0.012, capY, -headR - 0.005, headR * 2 + 0.024, 0.1, headR * 2 + 0.02, hair)); L.push(gbox(-headR - 0.035, -0.17, -0.06, 0.035, 0.28, headR + 0.08, hair)); L.push(gbox(headR, -0.17, -0.06, 0.035, 0.28, headR + 0.08, hair)); L.push(gbox(-headR - 0.035, -0.17, headR - 0.04, headR * 2 + 0.07, 0.28, 0.06, hair)); }
          else if (hairStyle === 'bun') { L.push(gbox(-headR - 0.01, capY, -headR - 0.005, headR * 2 + 0.02, 0.1, headR * 2 + 0.015, hair)); L.push(gsphere(0, top, headR + 0.02, 0.07, hair)); }
          else if (hairStyle === 'pompadour') { L.push(gbox(-headR - 0.01, capY, -0.02, headR * 2 + 0.02, 0.09, headR + 0.03, hair)); L.push(gbox(-headR + 0.01, top - 0.02, -headR - 0.05, headR * 2 - 0.02, 0.2, 0.17, hair)); L.push(gbox(-headR - 0.01, -0.06, headR - 0.02, headR * 2 + 0.02, 0.2, 0.03, hair)); }
          else if (hairStyle === 'mohawk') { L.push(gbox(-0.035, top - 0.02, -headR + 0.01, 0.07, 0.22, headR * 2 - 0.02, hair)); L.push(gbox(-headR - 0.006, top - 0.03, -headR, headR * 2 + 0.012, 0.03, headR * 2 + 0.01, [0.2, 0.18, 0.18])); }
          else if (hairStyle === 'afro') { L.push(gsphere(0, 0.05, 0.01, 0.26, hair, 1.0)); }
        }
        var ht2 = top;
        if (hat === 'cap') { var hc = c(look.hatColor || '#2b2b2b'); L.push(gbox(-headR - 0.01, ht2 - 0.02 + (hideHairTop ? 0.04 : 0), -headR - 0.005, headR * 2 + 0.02, 0.1, headR * 2 + 0.015, hc)); L.push(gbox(-0.13, ht2 + 0.02, -headR - 0.14, 0.26, 0.025, 0.14, hc)); }
        else if (hat === 'beanie') { var bc2 = c(look.hatColor || '#2f9e6a'); L.push(gbox(-headR - 0.015, ht2 - 0.1, -headR - 0.012, headR * 2 + 0.03, 0.17, headR * 2 + 0.024, bc2)); L.push(gbox(-headR - 0.02, ht2 - 0.1, -headR - 0.016, headR * 2 + 0.04, 0.05, headR * 2 + 0.032, c(U.shade(look.hatColor || '#2f9e6a', -0.25)))); }
        else if (hat === 'cowboy') { var cc = c(look.hatColor || '#6a4a2a'); L.push(gbox(-0.27, ht2 + 0.04, -0.26, 0.54, 0.025, 0.52, cc)); L.push(gbox(-headR + 0.01, ht2 + 0.06, -headR + 0.005, headR * 2 - 0.02, 0.16, headR * 2 - 0.01, cc)); L.push(gbox(-headR, ht2 + 0.06, -headR - 0.005, headR * 2, 0.04, headR * 2 + 0.01, c(U.shade(look.hatColor || '#6a4a2a', -0.35)))); }
        else if (hat === 'fedora') { var fc = c(look.hatColor || '#2b2b2b'); L.push(gbox(-0.22, ht2 + 0.04, -0.22, 0.44, 0.025, 0.44, fc)); L.push(gbox(-headR + 0.01, ht2 + 0.06, -headR + 0.005, headR * 2 - 0.02, 0.14, headR * 2 - 0.01, fc)); L.push(gbox(-headR + 0.005, ht2 + 0.07, -headR, headR * 2 - 0.01, 0.04, headR * 2, c('#8a2f2f'))); }
        else if (hat === 'beret') { L.push(gboxRot(-0.16, ht2 + 0.03, -0.16, 0.32, 0.05, 0.32, c(look.hatColor || '#2b2b2b'), 0.22, 0.04, ht2 + 0.05)); L.push(gbox(-0.01, ht2 + 0.09, -0.01, 0.02, 0.03, 0.02, [0.1, 0.1, 0.1])); }
        else if (hat === 'crown') { var gc = c('#e8b53a'); L.push(gbox(-headR - 0.012, ht2 + 0.01, -headR - 0.012, headR * 2 + 0.024, 0.07, headR * 2 + 0.024, gc)); for (var ci = 0; ci < 4; ci++) L.push(gbox((ci % 2 ? headR - 0.04 : -headR - 0.012), ht2 + 0.08, (ci < 2 ? -headR - 0.012 : headR - 0.04), 0.052, 0.07, 0.052, gc)); L.push(gbox(-0.026, ht2 + 0.08, -headR - 0.012, 0.052, 0.09, 0.052, gc)); }
        else if (hat === 'helmet') { var hh = c(look.hatColor || '#e8b53a'); L.push(gbox(-headR - 0.02, ht2 - 0.04, -headR - 0.02, headR * 2 + 0.04, 0.14, headR * 2 + 0.04, hh)); L.push(gbox(-headR - 0.05, ht2 - 0.04, -headR - 0.1, headR * 2 + 0.1, 0.025, headR * 2 + 0.14, hh)); L.push(gbox(-0.05, ht2 + 0.1, -headR, 0.1, 0.03, headR * 2, hh)); }
        if (glasses) {
          var fz = -headR - 0.012, gy = 0.015;
          if (glasses === 'round') { var rc = [0.3, 0.25, 0.2]; L.push(gring(-0.062, gy, fz, 0.045, 0.01, rc)); L.push(gring(0.062, gy, fz, 0.045, 0.01, rc)); L.push(gbox(-0.02, gy, fz, 0.04, 0.008, 0.008, rc)); }
          else if (glasses === 'aviator') { var av = [0.12, 0.1, 0.1], fr = c('#e8b53a'); L.push(gbox(-0.125, gy - 0.045, fz, 0.11, 0.08, 0.012, av)); L.push(gbox(0.015, gy - 0.045, fz, 0.11, 0.08, 0.012, av)); L.push(gbox(-0.14, gy + 0.03, fz, 0.28, 0.008, 0.008, fr)); }
          else if (glasses === 'thick') { var tk = [0.06, 0.06, 0.07]; L.push(gbox(-0.13, gy - 0.04, fz, 0.115, 0.075, 0.018, tk)); L.push(gbox(0.015, gy - 0.04, fz, 0.115, 0.075, 0.018, tk)); L.push(gbox(-0.1, gy - 0.025, fz - 0.004, 0.055, 0.045, 0.006, [0.7, 0.85, 0.95])); L.push(gbox(0.045, gy - 0.025, fz - 0.004, 0.055, 0.045, 0.006, [0.7, 0.85, 0.95])); L.push(gbox(-0.02, gy, fz, 0.04, 0.012, 0.012, tk)); }
          else { L.push(gbox(-0.135, gy - 0.035, fz, 0.27, 0.065, 0.014, [0.05, 0.05, 0.06])); L.push(gbox(-0.14, gy + 0.025, fz, 0.28, 0.008, 0.008, [0.1, 0.1, 0.1])); }
        }
        if (look.extra === 'earpiece') { var ec = c('#c9ccd4'); L.push(gbox(headR + 0.005, -0.03, -0.04, 0.03, 0.045, 0.035, ec)); L.push(gbox(headR + 0.015, -0.2, -0.015, 0.01, 0.18, 0.01, [0.9, 0.9, 0.92])); }
        if (look.extra === 'cigar') { L.push(gcyl(0.045, -0.1, -headR - 0.07, 0.016, 0.14, c('#5a3f2a'), Math.PI / 2 - 0.25)); L.push(gsphere(0.045, -0.085, -headR - 0.145, 0.018, [1, 0.45, 0.1])); }
      });
      var head = mesh('head', headGeo, 0, hy, 0);
      torso.add(head);
      g.add(torso);
      g.scale.setScalar(sc);
      g.userData.look = look;
      return g;
    },
    weaponMesh: function (id) {
      var g = new GB({ color: true });
      if (id === 'megaphone') { g.cylinder(0, 0, 0, 0.05, 0.14, 0.3, 8, [0.9, 0.3, 0.2]); g.box(-0.03, -0.12, -0.03, 0.06, 0.14, 0.06, GB.UV0, [0.2, 0.2, 0.2]); }
      else if (id === 'hottake') { g.cylinder(0, 0, 0, 0.06, 0.06, 0.18, 8, [1, 0.35, 0.1]); g.box(-0.04, 0.16, -0.04, 0.08, 0.04, 0.08, GB.UV0, [1, 0.8, 0.3]); }
      else if (id === 'fist' || !id) return null;
      else { var l = id === 'shotgun' ? 0.75 : id === 'smg' ? 0.45 : 0.22; g.box(0, -0.03, -0.02, l, 0.06, 0.04, GB.UV0, [0.15, 0.15, 0.17]); g.box(0.02, -0.14, -0.015, 0.05, 0.12, 0.03, GB.UV0, [0.3, 0.2, 0.12]); }
      var m = new THREE.Mesh(g.build(), Assets.propMaterial()); m.castShadow = true; return m;
    },
    pickupMesh: function (type) {
      var col = type === 'health' ? [0.3, 0.9, 0.4] : type === 'armor' ? [0.3, 0.6, 1] : type === 'cash' ? [0.3, 0.8, 0.3] : [0.9, 0.9, 0.95];
      var g = new GB({ color: true });
      if (type === 'cash') g.box(-0.25, 0, -0.15, 0.5, 0.08, 0.3, GB.UV0, col);
      else if (type === 'health') { g.box(-0.08, 0, -0.25, 0.16, 0.16, 0.5, GB.UV0, col); g.box(-0.25, 0, -0.08, 0.5, 0.16, 0.16, GB.UV0, col); }
      else if (type === 'armor') g.box(-0.22, 0, -0.1, 0.44, 0.5, 0.2, GB.UV0, col);
      else g.box(-0.3, 0, -0.08, 0.6, 0.12, 0.16, GB.UV0, col);
      var m = new THREE.Mesh(g.build(), Assets.propMaterial()); m.castShadow = true; return m;
    }
  };

  // ---- actor geometry helpers (ped parts are merged per limb; wheels spin around x) ----
  function skinHex(skin) {
    if (typeof skin === 'string') return skin;
    var Lk = GTP.Content && GTP.Content.looks;
    if (Lk && Lk.skinColor) return Lk.skinColor(skin);
    var tones = ['#f3d9c4', '#e8c39e', '#d1a074', '#b57a4d', '#8d5524', '#5c3a21'];
    return tones[U.clamp((skin || 2) - 1, 0, 5)];
  }
  var pedGeoCache = new Map();
  function pedGeo(key, fn) {
    var g = pedGeoCache.get(key); if (g) return g;
    var list = []; fn(list);
    g = GB.merge(list); pedGeoCache.set(key, g);
    return g;
  }
  function gbox(x, y, z, w, h, d, col) { var g = new GB({ color: true }); g.box(x, y, z, w, h, d, GB.UV0, col); return g.build(); }
  function gboxRot(x, y, z, w, h, d, col, rz, px, py) { var geo = gbox(x, y, z, w, h, d, col); geo.translate(-px, -py, 0); geo.rotateZ(rz); geo.translate(px, py, 0); return geo; }
  // vertical cylinder of height h standing at (x, y, z), optionally tilted about x around its base
  function gcyl(x, y, z, r, h, col, rx) { var g = new GB({ color: true }); g.cylinder(0, 0, 0, r, r, h, 7, col); var geo = g.build(); if (rx) geo.rotateX(rx); geo.translate(x, y, z); return geo; }
  function gsphere(x, y, z, r, col, squash) { var g = new GB({ color: true }); g.sphere(x, y, z, r, 7, 4, col, null, squash || 1); return g.build(); }
  // a flat ring in the xy plane (glasses rim), thickness t
  function gring(x, y, z, r, t, col) {
    var g = new GB({ color: true }), n = 10;
    function pt(cc, ss, rr, zz) { return [x + cc * rr, y + ss * rr, z + zz]; }
    for (var i = 0; i < n; i++) {
      var a0 = i / n * TAU, a1 = (i + 1) / n * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      g.quad(pt(c0, s0, r + t, -t), pt(c1, s1, r + t, -t), pt(c1, s1, r + t, t), pt(c0, s0, r + t, t), GB.UV0, col);
      g.quad(pt(c0, s0, r - t, t), pt(c1, s1, r - t, t), pt(c1, s1, r - t, -t), pt(c0, s0, r - t, -t), GB.UV0, col);
      g.quad(pt(c0, s0, r - t, -t), pt(c1, s1, r - t, -t), pt(c1, s1, r + t, -t), pt(c0, s0, r + t, -t), GB.UV0, col);
      g.quad(pt(c0, s0, r + t, t), pt(c1, s1, r + t, t), pt(c1, s1, r - t, t), pt(c0, s0, r - t, t), GB.UV0, col);
    }
    return g.build();
  }
  // wheel: tyre + spoked caps around the x axis, centred at the origin
  function wheelAxle(g, r, w, tire, hub, segs) {
    segs = segs || 12;
    var hx = w / 2, ri = r * 0.5, i, a0, a1, y0, z0, y1, z1;
    for (i = 0; i < segs; i++) {
      a0 = i / segs * TAU; a1 = (i + 1) / segs * TAU;
      y0 = Math.cos(a0) * r; z0 = Math.sin(a0) * r; y1 = Math.cos(a1) * r; z1 = Math.sin(a1) * r;
      g.quad([-hx, y0, z0], [-hx, y1, z1], [hx, y1, z1], [hx, y0, z0], GB.UV0, tire);
      var spoke = (i % 3 === 0) ? hub : [0.2, 0.2, 0.22];
      var o0 = g.vertex(hx, 0, 0, 1, 0, 0, 0, 0, spoke), o1 = g.vertex(hx, y0, z0, 1, 0, 0, 0, 0, spoke), o2 = g.vertex(hx, y1, z1, 1, 0, 0, 0, 0, spoke);
      g.idx.push(o0, o1, o2);
      var n0 = g.vertex(-hx, 0, 0, -1, 0, 0, 0, 0, spoke), n1 = g.vertex(-hx, y0, z0, -1, 0, 0, 0, 0, spoke), n2 = g.vertex(-hx, y1, z1, -1, 0, 0, 0, 0, spoke);
      g.idx.push(n0, n2, n1);
      // hub cap disc, a hair proud of the sidewall
      var p0 = g.vertex(hx + 0.006, 0, 0, 1, 0, 0, 0, 0, hub), p1 = g.vertex(hx + 0.006, y0 * ri / r, z0 * ri / r, 1, 0, 0, 0, 0, hub), p2 = g.vertex(hx + 0.006, y1 * ri / r, z1 * ri / r, 1, 0, 0, 0, 0, hub);
      g.idx.push(p0, p1, p2);
      var q0 = g.vertex(-hx - 0.006, 0, 0, -1, 0, 0, 0, 0, hub), q1 = g.vertex(-hx - 0.006, y0 * ri / r, z0 * ri / r, -1, 0, 0, 0, 0, hub), q2 = g.vertex(-hx - 0.006, y1 * ri / r, z1 * ri / r, -1, 0, 0, 0, 0, hub);
      g.idx.push(q0, q2, q1);
    }
  }

  // ====================================================================== ground tiles
  // Each draws a 4 m tile into a 240 px square. "Top" of the cell is north at rotation 0.
  function asphaltBase(ctx, S, R, tone) {
    ctx.fillStyle = tone || PAL.asphalt; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, 0.045, 'rgba(255,255,255,0.07)', 'rgba(0,0,0,0.16)', R);
    // patches and tar lines
    for (var i = 0; i < 3; i++) alphaFill(ctx, i % 2 ? PAL.asphaltLight : PAL.asphaltDark, 0.25, R.random() * S, R.random() * S, 30 + R.random() * 90, 20 + R.random() * 60);
    cracks(ctx, S, S, 2, 'rgba(0,0,0,0.25)', R);
  }
  function lineH(ctx, y, color, R, dashed) {
    ctx.fillStyle = color; ctx.globalAlpha = 0.88;
    if (dashed) { ctx.fillRect(30, y - 3, 60, 6); ctx.fillRect(150, y - 3, 60, 6); }
    else ctx.fillRect(0, y - 3, S, 6);
    ctx.globalAlpha = 1;
    worn(ctx, 0, y - 3, S, 6, R, dashed ? 3 : 7);
    // re-fill the chips with asphalt so clearRect holes do not show magenta
    ctx.fillStyle = PAL.asphalt; ctx.globalCompositeOperation = 'destination-over'; ctx.fillRect(0, 0, S, S); ctx.globalCompositeOperation = 'source-over';
  }
  function sidewalkBase(ctx, S, R) {
    ctx.fillStyle = PAL.sidewalk; ctx.fillRect(0, 0, S, S);
    // 2 x 2 slabs with slight tone variance and grout
    for (var j = 0; j < 2; j++) for (var i = 0; i < 2; i++) {
      alphaFill(ctx, R.random() < 0.5 ? '#ffffff' : '#000000', 0.04 + R.random() * 0.05, i * 120, j * 120, 120, 120);
    }
    speckle(ctx, S, S, 0.03, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.1)', R);
    ctx.fillStyle = PAL.sidewalkLine; ctx.fillRect(118, 0, 4, S); ctx.fillRect(0, 118, S, 4);
    cracks(ctx, S, S, 1, 'rgba(0,0,0,0.18)', R);
  }
  function curbEdge(ctx, S) {
    // raised kerb strip along the top edge
    ctx.fillStyle = PAL.curbLight; ctx.fillRect(0, 0, S, 14);
    ctx.fillStyle = PAL.curb; ctx.fillRect(0, 13, S, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 0, S, 3);
  }
  function grassBase(ctx, S, R, base, light, dark) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
    for (var i = 0; i < 26; i++) {
      ctx.fillStyle = R.random() < 0.5 ? light : dark; ctx.globalAlpha = 0.2 + R.random() * 0.25;
      ctx.beginPath(); ctx.ellipse(R.random() * S, R.random() * S, 12 + R.random() * 30, 8 + R.random() * 20, R.random() * 3, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = light; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.5;
    for (i = 0; i < 160; i++) { var x = R.random() * S, y = R.random() * S; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (R.random() - 0.5) * 4, y - 4 - R.random() * 5); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function concreteBase(ctx, S, R, tone) {
    ctx.fillStyle = tone || PAL.concrete; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, 0.035, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.12)', R);
    for (var i = 0; i < 2; i++) alphaFill(ctx, '#000', 0.08, R.random() * S, R.random() * S, 60, 30);
  }
  var TILES = {
    asphalt: function (ctx, S, R) { asphaltBase(ctx, S, R); },
    road_half: function (ctx, S, R) { asphaltBase(ctx, S, R); lineH(ctx, 18, PAL.laneWhite, R, false); lineH(ctx, S - 8, PAL.laneYellow, R, false); },
    road_dead: function (ctx, S, R) { asphaltBase(ctx, S, R); lineH(ctx, 18, PAL.laneWhite, R, false); },
    ave_outer: function (ctx, S, R) { asphaltBase(ctx, S, R); lineH(ctx, 18, PAL.laneWhite, R, false); lineH(ctx, S - 3, PAL.laneWhite, R, true); },
    ave_inner: function (ctx, S, R) { asphaltBase(ctx, S, R); lineH(ctx, 3, PAL.laneWhite, R, true); lineH(ctx, S - 8, PAL.laneYellow, R, false); },
    cross: function (ctx, S, R) {
      asphaltBase(ctx, S, R);
      ctx.fillStyle = PAL.crosswalk; ctx.globalAlpha = 0.9;
      for (var k = 0; k < 5; k++) ctx.fillRect(0, 12 + k * 48, S, 24);
      ctx.globalAlpha = 1;
      for (k = 0; k < 5; k++) worn(ctx, 0, 12 + k * 48, S, 24, R, 10);
      ctx.fillStyle = PAL.asphalt; ctx.globalCompositeOperation = 'destination-over'; ctx.fillRect(0, 0, S, S); ctx.globalCompositeOperation = 'source-over';
    },
    cross_stop: function (ctx, S, R) {
      TILES.cross(ctx, S, R);
      ctx.fillStyle = PAL.crosswalk; ctx.globalAlpha = 0.92; ctx.fillRect(4, 0, 16, S); ctx.globalAlpha = 1;
    },
    sidewalk: function (ctx, S, R) { sidewalkBase(ctx, S, R); },
    sidewalk_edge: function (ctx, S, R) { sidewalkBase(ctx, S, R); curbEdge(ctx, S); },
    sidewalk_corner: function (ctx, S, R) {
      sidewalkBase(ctx, S, R); curbEdge(ctx, S);
      ctx.save(); ctx.translate(0, S); ctx.rotate(-Math.PI / 2); curbEdge(ctx, S); ctx.restore();
    },
    curbface: function (ctx, S, R) { ctx.fillStyle = PAL.curbLight; ctx.fillRect(0, 0, S, S); speckle(ctx, S, S, 0.03, 'rgba(255,255,255,0.1)', 'rgba(0,0,0,0.15)', R); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, S - 60, S, 60); },
    grass: function (ctx, S, R) { grassBase(ctx, S, R, PAL.grass, PAL.grassLight, PAL.grassDark); },
    grass2: function (ctx, S, R) { grassBase(ctx, S, R, PAL.grassDark, PAL.grass, '#2f5f28'); },
    lawn: function (ctx, S, R) {
      grassBase(ctx, S, R, PAL.grass, PAL.grassLight, PAL.grassDark);
      for (var i = 0; i < 4; i += 2) alphaFill(ctx, '#ffffff', 0.09, i * 60, 0, 60, S);
    },
    sand: function (ctx, S, R) {
      ctx.fillStyle = PAL.sand; ctx.fillRect(0, 0, S, S);
      speckle(ctx, S, S, 0.05, 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.08)', R);
      ctx.strokeStyle = PAL.sandDark; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
      for (var i = 0; i < 6; i++) { var y = R.random() * S; ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(S / 2, y + (R.random() - 0.5) * 30, S, y); ctx.stroke(); }
      ctx.globalAlpha = 1;
    },
    parking: function (ctx, S, R) { asphaltBase(ctx, S, R, PAL.parking); },
    parking_bay: function (ctx, S, R) {
      asphaltBase(ctx, S, R, PAL.parking);
      ctx.fillStyle = PAL.parkingLine; ctx.globalAlpha = 0.8; ctx.fillRect(0, 0, 5, S); ctx.fillRect(S - 5, 0, 5, S); ctx.globalAlpha = 1;
      worn(ctx, 0, 0, 5, S, R, 5); worn(ctx, S - 5, 0, 5, S, R, 5);
      ctx.fillStyle = PAL.parking; ctx.globalCompositeOperation = 'destination-over'; ctx.fillRect(0, 0, S, S); ctx.globalCompositeOperation = 'source-over';
    },
    plaza: function (ctx, S, R) {
      ctx.fillStyle = PAL.plaza; ctx.fillRect(0, 0, S, S);
      for (var j = 0; j < 2; j++) for (var i = 0; i < 2; i++) alphaFill(ctx, (i + j) % 2 ? PAL.plazaWarm : '#ffffff', 0.12 + R.random() * 0.08, i * 120, j * 120, 120, 120);
      speckle(ctx, S, S, 0.03, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.1)', R);
      ctx.fillStyle = PAL.plazaLine; ctx.fillRect(118, 0, 4, S); ctx.fillRect(0, 118, S, 4);
    },
    plaza2: function (ctx, S, R) {
      ctx.fillStyle = PAL.plazaWarm; ctx.fillRect(0, 0, S, S);
      for (var j = 0; j < 4; j++) for (var i = 0; i < 4; i++) alphaFill(ctx, '#000', 0.03 + R.random() * 0.07, i * 60, j * 60, 60, 60);
      ctx.fillStyle = PAL.plazaLine; for (var k = 1; k < 4; k++) { ctx.fillRect(k * 60 - 1, 0, 2, S); ctx.fillRect(0, k * 60 - 1, S, 2); }
      speckle(ctx, S, S, 0.02, 'rgba(255,255,255,0.1)', 'rgba(0,0,0,0.1)', R);
    },
    path: function (ctx, S, R) { ctx.fillStyle = PAL.path; ctx.fillRect(0, 0, S, S); speckle(ctx, S, S, 0.06, 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.12)', R); },
    gravel: function (ctx, S, R) { ctx.fillStyle = PAL.gravel; ctx.fillRect(0, 0, S, S); speckle(ctx, S, S, 0.12, 'rgba(255,255,255,0.14)', 'rgba(0,0,0,0.18)', R); for (var i = 0; i < 3; i++) alphaFill(ctx, '#000', 0.12, R.random() * S, R.random() * S, 50, 50); },
    hw_outer: function (ctx, S, R) { asphaltBase(ctx, S, R, '#33363e'); lineH(ctx, 14, PAL.laneWhite, R, false); lineH(ctx, S - 3, PAL.laneWhite, R, true); },
    hw_inner: function (ctx, S, R) { asphaltBase(ctx, S, R, '#33363e'); lineH(ctx, 3, PAL.laneWhite, R, true); lineH(ctx, S - 6, PAL.laneYellow, R, false); },
    concrete: function (ctx, S, R) { concreteBase(ctx, S, R); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 118, S, 3); },
    concrete_dark: function (ctx, S, R) { concreteBase(ctx, S, R, PAL.concreteDark); },
    barrier: function (ctx, S, R) {
      concreteBase(ctx, S, R, PAL.barrier);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, S - 50, S, 50);
      ctx.fillStyle = PAL.barrierStripe; ctx.globalAlpha = 0.7; ctx.fillRect(0, 40, S, 18); ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0, 0, S, 10);
    },
    dock: function (ctx, S, R) {
      ctx.fillStyle = PAL.dock; ctx.fillRect(0, 0, S, S);
      for (var y = 0; y < S; y += 20) { alphaFill(ctx, R.random() < 0.5 ? '#000' : '#fff', 0.04 + R.random() * 0.1, 0, y, S, 20); ctx.fillStyle = PAL.dockLine; ctx.fillRect(0, y, S, 2); }
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; for (var i = 0; i < S; i += 20) { ctx.fillRect(14, i + 9, 3, 3); ctx.fillRect(S - 17, i + 9, 3, 3); }
      cracks(ctx, S, S, 2, 'rgba(0,0,0,0.2)', R);
    },
    dockside: function (ctx, S, R) {
      ctx.fillStyle = '#6e5436'; ctx.fillRect(0, 0, S, S);
      for (var x = 0; x < S; x += 30) { alphaFill(ctx, '#000', 0.05 + R.random() * 0.15, x, 0, 30, S); ctx.fillStyle = '#4d3a26'; ctx.fillRect(x, 0, 2, S); }
      ctx.fillStyle = 'rgba(20,60,70,0.45)'; ctx.fillRect(0, S - 70, S, 70);
    },
    seawall: function (ctx, S, R) { concreteBase(ctx, S, R, PAL.concreteDark); ctx.fillStyle = 'rgba(20,70,80,0.5)'; ctx.fillRect(0, S - 60, S, 60); ctx.fillStyle = 'rgba(0,0,0,0.2)'; for (var y = 0; y < S; y += 60) ctx.fillRect(0, y, S, 3); },
    roofgravel: function (ctx, S, R) { ctx.fillStyle = PAL.roofGravel; ctx.fillRect(0, 0, S, S); speckle(ctx, S, S, 0.1, 'rgba(255,255,255,0.1)', 'rgba(0,0,0,0.2)', R); for (var i = 0; i < 4; i++) alphaFill(ctx, '#000', 0.1, R.random() * S, R.random() * S, 40 + R.random() * 60, 20); },
    white: function (ctx, S) { ctx.fillStyle = '#f0f0f0'; ctx.fillRect(0, 0, S, S); },
    black: function (ctx, S) { ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, S, S); },
    gold: function (ctx, S, R) { ctx.fillStyle = PAL.gold; ctx.fillRect(0, 0, S, S); speckle(ctx, S, S, 0.02, 'rgba(255,255,255,0.3)', 'rgba(0,0,0,0.15)', R); },
    field: function (ctx, S, R) { grassBase(ctx, S, R, '#3f8f3a', '#56a84a', '#357a30'); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(0, 116, S, 6); ctx.fillRect(116, 0, 6, S); }
  };

  // ====================================================================== facades
  var SWATCH_NAMES = ['concrete', 'concreteDark', 'concreteLight', 'gravel', 'metal', 'white', 'black', 'gold', 'red', 'blue', 'green', 'brown', 'yellow', 'glass', 'rust', 'pink'];
  var SWATCH_COLORS = [PAL.concrete, PAL.concreteDark, PAL.concreteLight, PAL.roofGravel, '#3a3d44', '#f0f0f0', '#101014', PAL.gold, '#c94040', '#3d6fcf', '#2f9e6a', '#5a3f2a', '#e2b43a', '#6fb7d8', '#8b4a2a', '#ff3fa4'];

  function drawCommonBands(dctx, nctx, style, R) {
    // band 5: roof gravel (U repeats)
    var y = 5 * BAND;
    dctx.fillStyle = PAL.roofGravel; dctx.fillRect(0, y, FW, BAND);
    var i;
    dctx.save(); dctx.beginPath(); dctx.rect(0, y, FW, BAND); dctx.clip();
    for (i = 0; i < 8; i++) alphaFill(dctx, '#000', 0.12, R.random() * FW, y + R.random() * BAND, 30 + R.random() * 80, 20 + R.random() * 30);
    for (i = 0; i < 2500; i++) { dctx.fillStyle = R.random() < 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.22)'; dctx.fillRect(R.random() * FW, y + R.random() * BAND, 2, 2); }
    dctx.restore();
    // band 6: swatches
    y = 6 * BAND;
    for (i = 0; i < 16; i++) { dctx.fillStyle = SWATCH_COLORS[i]; dctx.fillRect(i * 32, y, 32, BAND); nctx.fillStyle = (i === 15 || i === 7) ? SWATCH_COLORS[i] : '#000'; nctx.fillRect(i * 32, y, 32, BAND); }
    // band 7: parapet / cornice trim: concrete light with a shadow line
    y = 7 * BAND;
    dctx.fillStyle = PAL.concreteLight; dctx.fillRect(0, y, FW, BAND);
    dctx.fillStyle = 'rgba(0,0,0,0.25)'; dctx.fillRect(0, y + BAND - 24, FW, 24);
    dctx.fillStyle = 'rgba(255,255,255,0.25)'; dctx.fillRect(0, y, FW, 10);
    dctx.save(); dctx.beginPath(); dctx.rect(0, y, FW, BAND); dctx.clip();
    for (i = 0; i < 1200; i++) { dctx.fillStyle = R.random() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)'; dctx.fillRect(R.random() * FW, y + R.random() * BAND, 2, 2); }
    dctx.restore();
  }

  // window helpers: draw one window at (x, y, w, h) by day or lit by night
  function winDay(ctx, x, y, w, h, frame, glass, sill) {
    ctx.fillStyle = frame; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, U.shade(glass, 0.25)); g.addColorStop(1, U.shade(glass, -0.2));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + 2, y + 2, w * 0.3, h - 4);
    if (sill) { ctx.fillStyle = sill; ctx.fillRect(x - 6, y + h + 2, w + 12, 5); }
  }
  function winNight(ctx, x, y, w, h, lit, warm, R) {
    if (!lit) { ctx.fillStyle = '#05060a'; ctx.fillRect(x, y, w, h); return; }
    var col = warm ? PAL.windowLit : PAL.windowLitCool;
    ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
    // blinds / interior shapes
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    if (R.random() < 0.4) for (var k = 0; k < h; k += 8) ctx.fillRect(x, y + k, w, 3);
    else if (R.random() < 0.5) ctx.fillRect(x + w * 0.3, y + h * 0.4, w * 0.4, h * 0.6);
    ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.fillStyle = 'rgba(255,255,255,0.0)'; ctx.fillRect(x, y, w, h); ctx.shadowBlur = 0;
  }
  function litDecider(R, p) { return function () { return R.random() < p; }; }

  // brick wall fill
  function bricks(ctx, x, y, w, h, R, base, mortar) {
    ctx.fillStyle = mortar; ctx.fillRect(x, y, w, h);
    var bh = 16, bw = 32;
    for (var row = 0, yy = y; yy < y + h; yy += bh, row++) {
      var off = (row % 2) * bw / 2;
      for (var xx = x - off; xx < x + w; xx += bw) {
        var v = (R.random() - 0.5) * 0.3;
        ctx.fillStyle = U.shade(base, v);
        ctx.fillRect(Math.max(x, xx + 1), yy + 1, Math.min(bw - 2, x + w - xx - 1), bh - 2);
      }
    }
  }
  function ashlar(ctx, x, y, w, h, R, base) {
    ctx.fillStyle = U.shade(base, -0.35); ctx.fillRect(x, y, w, h);
    var bh = 40, bw = 64;
    for (var row = 0, yy = y; yy < y + h; yy += bh, row++) {
      var off = (row % 2) * bw / 2;
      for (var xx = x - off; xx < x + w; xx += bw) {
        ctx.fillStyle = U.shade(base, (R.random() - 0.5) * 0.12);
        ctx.fillRect(Math.max(x, xx + 2), yy + 2, Math.min(bw - 4, x + w - xx - 2), bh - 4);
      }
    }
    for (var i = 0; i < 300; i++) { ctx.fillStyle = R.random() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'; ctx.fillRect(x + R.random() * w, y + R.random() * h, 2, 2); }
  }
  function siding(ctx, x, y, w, h, R, base) {
    ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
    for (var yy = y; yy < y + h; yy += 12) { ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(x, yy + 10, w, 2); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, yy, w, 2); }
  }
  function corrugated(ctx, x, y, w, h, R, base) {
    ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
    for (var xx = x; xx < x + w; xx += 8) { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(xx, y, 3, h); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(xx + 4, y, 3, h); }
    for (var i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(120,60,30,' + (0.1 + R.random() * 0.25) + ')'; var rx = x + R.random() * w; ctx.fillRect(rx, y, 4 + R.random() * 8, 20 + R.random() * (h - 20)); }
  }
  function stucco(ctx, x, y, w, h, R, base) {
    ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
    for (var i = 0; i < w * h / 60; i++) { ctx.fillStyle = R.random() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'; ctx.fillRect(x + R.random() * w, y + R.random() * h, 2 + R.random() * 2, 2); }
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(x, y + h - 10, w, 10);
  }
  function floorShadow(ctx, y) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, y, FW, 6); }

  var FACADES = {
    downtown: function (ctx, night, R) { glassTower(ctx, night, R, '#3e5873', '#1a2430', false); },
    goldplate: function (ctx, night, R) { glassTower(ctx, night, R, '#8a6a2a', '#c9a24a', true); },
    campus: function (ctx, night, R) {
      var base = R.pick(PAL.facades.campus), lit = litDecider(R, 0.45);
      for (var b = 0; b < 5; b++) {
        var y = b * BAND;
        if (!night) bricks(ctx, 0, y, FW, BAND, R, base, U.shade(base, -0.45));
        if (b === 0) {
          // arcade: three arches, the middle one a doorway
          for (var k = 0; k < 3; k++) {
            var cx = 85 + k * 171, aw = 100, ah = 128;
            if (!night) { ctx.fillStyle = PAL.concreteLight; ctx.fillRect(cx - aw / 2 - 8, y + 20, aw + 16, ah + 8); ctx.beginPath(); ctx.arc(cx, y + 20 + aw / 2 + 8, aw / 2 + 8, Math.PI, 0); ctx.fill(); }
            ctx.fillStyle = night ? (k === 1 ? PAL.windowLit : '#06070b') : '#2a2420';
            ctx.beginPath(); ctx.moveTo(cx - aw / 2, y + BAND - 8); ctx.lineTo(cx - aw / 2, y + 28 + aw / 2); ctx.arc(cx, y + 28 + aw / 2, aw / 2, Math.PI, 0); ctx.lineTo(cx + aw / 2, y + BAND - 8); ctx.closePath(); ctx.fill();
            if (k === 1 && !night) { ctx.fillStyle = '#5a3f2a'; ctx.fillRect(cx - 30, y + 60, 60, BAND - 68); }
            if (k !== 1) { if (night) { ctx.fillStyle = lit() ? PAL.windowLit : '#06070b'; ctx.fillRect(cx - aw / 2 + 12, y + 50, aw - 24, 60); } else winDay(ctx, cx - aw / 2 + 12, y + 50, aw - 24, 60, '#3a2a1a', '#6f9bb5', null); }
          }
          if (!night) { ctx.fillStyle = U.shade(base, -0.5); ctx.fillRect(0, y + BAND - 10, FW, 10); }
        } else {
          for (k = 0; k < 4; k++) {
            var wx = 24 + k * 128, ww = 72, wy = y + 26, wh = 100;
            if (night) { winNight(ctx, wx, wy, ww, wh, lit(), true, R); }
            else {
              // arched top window with a stone sill
              ctx.fillStyle = PAL.concreteLight; ctx.fillRect(wx - 6, wy - 6, ww + 12, wh + 12); ctx.beginPath(); ctx.arc(wx + ww / 2, wy - 6 + ww / 2 + 6, ww / 2 + 6, Math.PI, 0); ctx.fill();
              winDay(ctx, wx, wy, ww, wh, '#2e2420', '#5f8fae', PAL.concreteLight);
              ctx.fillStyle = '#5f8fae'; ctx.beginPath(); ctx.arc(wx + ww / 2, wy, ww / 2, Math.PI, 0); ctx.fill();
              ctx.fillStyle = '#2e2420'; ctx.fillRect(wx + ww / 2 - 2, wy - ww / 2, 4, wh + ww / 2);
            }
          }
          if (!night) floorShadow(ctx, y);
        }
      }
    },
    suburbs: function (ctx, night, R) { houseFacade(ctx, night, R, R.pick(PAL.facades.suburbs), false); },
    barn: function (ctx, night, R) { houseFacade(ctx, night, R, '#9c2f2a', true); },
    mansion: function (ctx, night, R) { houseFacade(ctx, night, R, R.pick(PAL.facades.mansion), false, true); },
    industrial: function (ctx, night, R) {
      var base = R.pick(PAL.facades.industrial), lit = litDecider(R, 0.3);
      for (var b = 0; b < 5; b++) {
        var y = b * BAND;
        if (!night) corrugated(ctx, 0, y, FW, BAND, R, base);
        if (b === 0) {
          // roll-up loading door + a person door
          if (!night) { ctx.fillStyle = '#3a3d44'; ctx.fillRect(40, y + 20, 220, BAND - 20); for (var k = 0; k < 12; k++) { ctx.fillStyle = k % 2 ? '#4a4d55' : '#2f3238'; ctx.fillRect(44, y + 24 + k * 11, 212, 10); } ctx.fillStyle = '#2a2d33'; ctx.fillRect(360, y + 40, 60, BAND - 40); ctx.fillStyle = PAL.concreteDark; ctx.fillRect(0, y + BAND - 14, FW, 14); ctx.fillStyle = '#e2b43a'; ctx.fillRect(40, y + BAND - 16, 220, 4); }
          else { ctx.fillStyle = lit() ? PAL.windowLit : '#06070b'; ctx.fillRect(372, y + 46, 36, 36); }
        } else {
          for (k = 0; k < 6; k++) {
            var wx = 20 + k * 84, ww = 56, wy = y + 30, wh = 48;
            if (night) winNight(ctx, wx, wy, ww, wh, lit(), false, R);
            else { winDay(ctx, wx, wy, ww, wh, '#2b2e33', '#7b9aa8', null); ctx.fillStyle = '#2b2e33'; ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh); ctx.fillRect(wx, wy + wh / 2 - 2, ww, 4); }
          }
          if (!night) floorShadow(ctx, y);
        }
      }
    },
    marina: function (ctx, night, R) {
      var base = R.pick(PAL.facades.marina), lit = litDecider(R, 0.5), awn = R.pick(['#c94040', '#2b4c7e', '#2f9e6a', '#e2b43a']);
      for (var b = 0; b < 5; b++) {
        var y = b * BAND;
        if (!night) stucco(ctx, 0, y, FW, BAND, R, base);
        if (b === 0) {
          // shopfront with a striped awning
          var sx = 40, sw = 300;
          if (night) { ctx.fillStyle = PAL.windowLit; ctx.fillRect(sx, y + 50, sw, BAND - 60); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(sx + sw / 2 - 20, y + 60, 40, BAND - 70); }
          else { winDay(ctx, sx, y + 50, sw, BAND - 60, '#f4f4f4', '#6fb7d8', null); ctx.fillStyle = '#f4f4f4'; ctx.fillRect(sx + sw / 2 - 24, y + 50, 48, BAND - 60); }
          for (var k = 0; k < 10; k++) { ctx.fillStyle = night ? (k % 2 ? '#111' : '#0a0a0a') : (k % 2 ? awn : '#f4f4f4'); ctx.fillRect(sx - 10 + k * 32, y + 24, 32, 30); }
          if (!night) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx - 10, y + 54, sw + 20, 10); ctx.fillStyle = '#5a3f2a'; ctx.fillRect(400, y + 60, 60, BAND - 60); }
          else { ctx.fillStyle = '#06070b'; ctx.fillRect(400, y + 60, 60, BAND - 60); }
        } else {
          for (k = 0; k < 3; k++) {
            var wx = 50 + k * 160, ww = 70, wy = y + 30, wh = 84;
            if (night) winNight(ctx, wx, wy, ww, wh, lit(), true, R);
            else { winDay(ctx, wx, wy, ww, wh, '#f4f4f4', '#6fb7d8', '#f4f4f4'); ctx.fillStyle = '#f4f4f4'; ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(wx - 16, wy + wh + 8, ww + 32, 6); }
          }
          if (!night) floorShadow(ctx, y);
        }
      }
    },
    capitol: function (ctx, night, R) { stoneFacade(ctx, night, R, R.pick(PAL.facades.capitol), false); },
    police: function (ctx, night, R) { stoneFacade(ctx, night, R, '#a9a69c', true); },
    hospital: function (ctx, night, R) {
      var lit = litDecider(R, 0.6);
      for (var b = 0; b < 5; b++) {
        var y = b * BAND;
        if (!night) { ctx.fillStyle = '#e9ebee'; ctx.fillRect(0, y, FW, BAND); ctx.fillStyle = '#b9d1e8'; ctx.fillRect(0, y + BAND - 26, FW, 20); for (var i = 0; i < 400; i++) { ctx.fillStyle = R.random() < 0.5 ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.05)'; ctx.fillRect(R.random() * FW, y + R.random() * BAND, 2, 2); } }
        if (b === 0) {
          if (night) { ctx.fillStyle = PAL.windowLitCool; ctx.fillRect(60, y + 40, 392, BAND - 50); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(236, y + 50, 40, BAND - 60); }
          else { winDay(ctx, 60, y + 40, 392, BAND - 50, '#9aa3ad', '#8fc1e0', null); ctx.fillStyle = '#9aa3ad'; ctx.fillRect(0, y + 20, FW, 14); }
          ctx.fillStyle = night ? '#ff4a4a' : '#d23c3c'; ctx.fillRect(238, y + 2, 36, 10); ctx.fillRect(251, y - 11 + 11, 10, 36);
        } else {
          for (var k = 0; k < 5; k++) {
            var wx = 24 + k * 100, ww = 72, wy = y + 30, wh = 70;
            if (night) winNight(ctx, wx, wy, ww, wh, lit(), false, R); else winDay(ctx, wx, wy, ww, wh, '#9aa3ad', '#8fc1e0', null);
          }
          if (!night) floorShadow(ctx, y);
        }
      }
    },
    strip: function (ctx, night, R) {
      var base = R.pick(PAL.facades.strip), lit = litDecider(R, 0.5), neon = R.pick(PAL.neon), neon2 = R.pick(PAL.neon);
      for (var b = 0; b < 5; b++) {
        var y = b * BAND;
        if (!night) { stucco(ctx, 0, y, FW, BAND, R, U.shade(base, -0.15)); }
        if (b === 0) {
          // shopfront glass + a neon sign band above it
          if (night) { ctx.fillStyle = U.shade(PAL.windowLit, -0.1); ctx.fillRect(30, y + 60, 452, BAND - 70); ctx.fillStyle = 'rgba(0,0,0,0.5)'; for (var k = 0; k < 5; k++) ctx.fillRect(60 + k * 90, y + 70, 30, 60); }
          else { winDay(ctx, 30, y + 60, 452, BAND - 70, '#1a1a1a', '#5a7f95', null); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, y + 50, FW, 12); }
          // neon tubes: zigzag + rings
          ctx.lineWidth = 6; ctx.lineCap = 'round';
          if (night) { ctx.shadowBlur = 18; ctx.shadowColor = neon; ctx.strokeStyle = neon; } else { ctx.shadowBlur = 0; ctx.strokeStyle = U.shade(neon, -0.5); }
          ctx.beginPath(); for (k = 0; k < 8; k++) ctx.lineTo(40 + k * 60, y + 16 + (k % 2) * 22); ctx.stroke();
          if (night) { ctx.shadowColor = neon2; ctx.strokeStyle = neon2; } else ctx.strokeStyle = U.shade(neon2, -0.5);
          ctx.beginPath(); ctx.arc(470, y + 27, 14, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(18, y + 27, 14, 0, TAU); ctx.stroke();
          ctx.shadowBlur = 0;
        } else {
          for (k = 0; k < 4; k++) {
            var wx = 36 + k * 120, ww = 64, wy = y + 34, wh = 72;
            if (night) winNight(ctx, wx, wy, ww, wh, lit(), R.random() < 0.5, R); else winDay(ctx, wx, wy, ww, wh, '#1a1a1a', '#5a7f95', null);
          }
          if (b === 2 && night) { ctx.strokeStyle = neon; ctx.shadowColor = neon; ctx.shadowBlur = 14; ctx.lineWidth = 5; ctx.strokeRect(14, y + 14, FW - 28, BAND - 28); ctx.shadowBlur = 0; }
          if (!night) floorShadow(ctx, y);
        }
      }
    },
    stadium: function (ctx, night, R) {
      var base = R.pick(PAL.facades.stadium), lit = litDecider(R, 0.35);
      for (var b = 0; b < 5; b++) {
        var y = b * BAND;
        if (!night) { concreteBase2(ctx, 0, y, FW, BAND, R, base); ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, y + BAND - 18, FW, 18); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, y + BAND - 20, FW, 3); }
        for (var k = 0; k < 4; k++) {
          var wx = 30 + k * 124, ww = 76, wy = y + (b === 0 ? 50 : 36), wh = b === 0 ? BAND - 60 : 56;
          if (night) winNight(ctx, wx, wy, ww, wh, b === 0 ? true : lit(), false, R); else { ctx.fillStyle = '#2a2d33'; ctx.fillRect(wx, wy, ww, wh); if (b === 0) { ctx.fillStyle = '#e2b43a'; ctx.fillRect(wx, wy - 8, ww, 6); } }
        }
      }
    }
  };
  function concreteBase2(ctx, x, y, w, h, R, base) {
    ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
    for (var i = 0; i < w * h / 80; i++) { ctx.fillStyle = R.random() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'; ctx.fillRect(x + R.random() * w, y + R.random() * h, 2, 2); }
    for (var xx = x; xx < x + w; xx += 128) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(xx, y, 3, h); }
  }
  function glassTower(ctx, night, R, glass, mullion, gold) {
    var lit = litDecider(R, 0.55);
    for (var b = 0; b < 5; b++) {
      var y = b * BAND;
      if (!night) {
        var g = ctx.createLinearGradient(0, y, 0, y + BAND);
        g.addColorStop(0, U.shade(glass, 0.3)); g.addColorStop(0.6, glass); g.addColorStop(1, U.shade(glass, -0.25));
        ctx.fillStyle = g; ctx.fillRect(0, y, FW, BAND);
        // reflection streaks
        for (var i = 0; i < 6; i++) alphaFill(ctx, '#ffffff', 0.08 + R.random() * 0.08, R.random() * FW, y, 10 + R.random() * 30, BAND);
      }
      if (b === 0) {
        // lobby: tall glass, dark frame, lit band, revolving door
        if (night) { ctx.fillStyle = gold ? PAL.windowLit : PAL.windowLitCool; ctx.fillRect(16, y + 30, FW - 32, BAND - 40); ctx.fillStyle = 'rgba(0,0,0,0.45)'; for (i = 0; i < 6; i++) ctx.fillRect(40 + i * 80, y + 40, 18, BAND - 60); }
        else { ctx.fillStyle = mullion; ctx.fillRect(0, y + 20, FW, BAND - 20); var lg = ctx.createLinearGradient(0, y + 30, 0, y + BAND); lg.addColorStop(0, U.shade(glass, 0.5)); lg.addColorStop(1, U.shade(glass, -0.1)); ctx.fillStyle = lg; ctx.fillRect(16, y + 30, FW - 32, BAND - 40); ctx.fillStyle = mullion; for (i = 0; i < 6; i++) ctx.fillRect(40 + i * 80, y + 30, 6, BAND - 40); ctx.fillStyle = gold ? PAL.gold : PAL.concreteLight; ctx.fillRect(0, y + 20, FW, 10); ctx.fillStyle = '#1a2430'; ctx.fillRect(236, y + 60, 40, BAND - 70); }
      } else {
        // curtain wall: 8 panes per 8 m, spandrel band
        for (var k = 0; k < 8; k++) {
          var wx = k * 64 + 5, ww = 54, wy = y + 12, wh = 104;
          if (night) winNight(ctx, wx, wy, ww, wh, lit(), gold || R.random() < 0.35, R);
        }
        if (!night) { ctx.fillStyle = mullion; for (k = 0; k <= 8; k++) ctx.fillRect(k * 64 - 3, y, 6, BAND); ctx.fillStyle = gold ? U.shade(glass, -0.5) : '#232d3a'; ctx.fillRect(0, y + 118, FW, 42); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, y + 118, FW, 4); ctx.fillStyle = mullion; ctx.fillRect(0, y + 8, FW, 5); }
      }
    }
  }
  function houseFacade(ctx, night, R, base, barn, grand) {
    var lit = litDecider(R, 0.5), trim = barn ? '#f0f0f0' : grand ? '#f3ead9' : '#ffffff';
    for (var b = 0; b < 5; b++) {
      var y = b * BAND;
      if (!night) { if (barn) { ctx.fillStyle = base; ctx.fillRect(0, y, FW, BAND); for (var xx = 0; xx < FW; xx += 16) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(xx + 13, y, 3, BAND); } } else if (grand) stucco(ctx, 0, y, FW, BAND, R, base); else siding(ctx, 0, y, FW, BAND, R, base); }
      if (b === 0) {
        if (barn) {
          if (!night) { ctx.fillStyle = '#5a3f2a'; ctx.fillRect(176, y + 30, 160, BAND - 30); ctx.strokeStyle = trim; ctx.lineWidth = 8; ctx.strokeRect(180, y + 34, 152, BAND - 38); ctx.beginPath(); ctx.moveTo(180, y + 34); ctx.lineTo(332, y + BAND - 4); ctx.moveTo(332, y + 34); ctx.lineTo(180, y + BAND - 4); ctx.stroke(); }
          for (var k = 0; k < 2; k++) { var wx = 40 + k * 380, ww = 52; if (night) winNight(ctx, wx, y + 50, ww, 56, lit(), true, R); else winDay(ctx, wx, y + 50, ww, 56, trim, '#6fb7d8', null); }
        } else {
          // door with a porch roof, two windows
          if (!night) { ctx.fillStyle = grand ? '#3a2a1a' : '#5a3f2a'; ctx.fillRect(226, y + 56, 60, BAND - 56); ctx.fillStyle = trim; ctx.fillRect(200, y + 40, 112, 10); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(200, y + 50, 112, 8); if (grand) { ctx.fillStyle = trim; ctx.fillRect(190, y + 50, 14, BAND - 50); ctx.fillRect(308, y + 50, 14, BAND - 50); } else { ctx.fillStyle = trim; ctx.fillRect(204, y + 50, 6, BAND - 50); ctx.fillRect(302, y + 50, 6, BAND - 50); } }
          else { ctx.fillStyle = lit() ? PAL.windowLit : '#06070b'; ctx.fillRect(244, y + 64, 24, 30); }
          for (k = 0; k < 2; k++) { wx = 60 + k * 320; ww = 72; if (night) winNight(ctx, wx, y + 46, ww, 70, lit(), true, R); else { winDay(ctx, wx, y + 46, ww, 70, trim, '#6fb7d8', trim); ctx.fillStyle = trim; ctx.fillRect(wx + ww / 2 - 2, y + 46, 4, 70); ctx.fillStyle = grand ? U.shade(base, -0.4) : '#2c3e50'; ctx.fillRect(wx - 22, y + 44, 16, 74); ctx.fillRect(wx + ww + 6, y + 44, 16, 74); } }
        }
      } else {
        for (k = 0; k < 3; k++) {
          wx = 60 + k * 160; ww = 64;
          if (night) winNight(ctx, wx, y + 40, ww, 70, lit(), true, R);
          else { winDay(ctx, wx, y + 40, ww, 70, trim, '#6fb7d8', trim); ctx.fillStyle = trim; ctx.fillRect(wx + ww / 2 - 2, y + 40, 4, 70); ctx.fillStyle = grand ? U.shade(base, -0.4) : '#2c3e50'; ctx.fillRect(wx - 20, y + 38, 14, 74); ctx.fillRect(wx + ww + 6, y + 38, 14, 74); }
        }
        if (!night) floorShadow(ctx, y);
      }
    }
  }
  function stoneFacade(ctx, night, R, base, police) {
    var lit = litDecider(R, 0.4);
    for (var b = 0; b < 5; b++) {
      var y = b * BAND;
      if (!night) ashlar(ctx, 0, y, FW, BAND, R, base);
      if (b === 0) {
        // pilasters with capitals, a tall door, steps
        if (!night) { for (var k = 0; k < 5; k++) { var px = 16 + k * 120; ctx.fillStyle = U.shade(base, 0.2); ctx.fillRect(px, y + 10, 26, BAND - 10); ctx.fillStyle = U.shade(base, -0.2); ctx.fillRect(px + 20, y + 10, 6, BAND - 10); ctx.fillStyle = U.shade(base, 0.35); ctx.fillRect(px - 6, y + 10, 38, 12); ctx.fillRect(px - 6, y + BAND - 14, 38, 14); } ctx.fillStyle = U.shade(base, 0.3); ctx.fillRect(0, y, FW, 10); ctx.fillStyle = '#2a2420'; ctx.fillRect(226, y + 48, 60, BAND - 48); ctx.fillStyle = police ? '#2c3e7a' : U.shade(base, -0.3); ctx.fillRect(0, y + 22, FW, police ? 22 : 6); }
        else { ctx.fillStyle = PAL.windowLit; ctx.fillRect(238, y + 56, 36, 40); if (police) { ctx.fillStyle = '#3d6fcf'; ctx.fillRect(0, y + 22, FW, 22); } }
        for (k = 0; k < 2; k++) { var wx = 70 + k * 320, ww = 56; if (night) winNight(ctx, wx, y + 56, ww, 70, lit(), true, R); else winDay(ctx, wx, y + 56, ww, 70, U.shade(base, -0.3), '#5a7f95', null); }
      } else {
        for (k = 0; k < 4; k++) {
          wx = 44 + k * 120; ww = 56;
          if (night) winNight(ctx, wx, y + 36, ww, 86, lit(), true, R);
          else { ctx.fillStyle = U.shade(base, 0.25); ctx.fillRect(wx - 10, y + 22, ww + 20, 10); ctx.beginPath(); ctx.moveTo(wx - 14, y + 32); ctx.lineTo(wx + ww / 2, y + 12); ctx.lineTo(wx + ww + 14, y + 32); ctx.fill(); winDay(ctx, wx, y + 36, ww, 86, U.shade(base, -0.3), '#5a7f95', U.shade(base, 0.25)); ctx.fillStyle = U.shade(base, -0.3); ctx.fillRect(wx + ww / 2 - 2, y + 36, 4, 86); }
        }
        if (!night) floorShadow(ctx, y);
      }
    }
  }

  // ====================================================================== props
  function c(hex) { var r = U.hexToRgb(hex); return [r[0] / 255, r[1] / 255, r[2] / 255]; }
  var CONC = c(PAL.concrete), CONCD = c(PAL.concreteDark), METAL = c('#3a3d44'), LAMP = c(PAL.lamp), WHITE = [0.95, 0.95, 0.95], TRUNK = c(PAL.trunk);
  function treeBlob(g, x, y, z, r, col, squash) { g.sphere(x, y, z, r, 7, 4, col, null, squash); }
  var PROPS = {
    tree: function (g, R) {
      g.cylinder(0, 0, 0, 0.22, 0.16, 2.2, 6, TRUNK, null, false);
      var col = c(R.pick(PAL.tree)), col2 = c(R.pick(PAL.tree));
      treeBlob(g, 0, 3.3, 0, 1.7, col, 0.9);
      treeBlob(g, 0.8, 4.1, 0.4, 1.3, col2, 0.9);
      treeBlob(g, -0.7, 4.3, -0.5, 1.2, col, 0.9);
      treeBlob(g, 0, 5.1, 0, 1.0, col2, 0.9);
    },
    palm: function (g, R) {
      g.cylinder(0, 0, 0, 0.2, 0.14, 5.5, 6, c('#8a6a44'), null, false);
      var col = c('#3a8a3a');
      for (var k = 0; k < 7; k++) {
        var a = k / 7 * TAU, dx = Math.cos(a), dz = Math.sin(a);
        g.quad([0, 5.5, 0], [dx * 0.4 - dz * 0.35, 5.6, dz * 0.4 + dx * 0.35], [dx * 2.6, 4.9, dz * 2.6], [dx * 0.4 + dz * 0.35, 5.6, dz * 0.4 - dx * 0.35], GB.UV0, col);
        g.quad([0, 5.5, 0], [dx * 0.4 + dz * 0.35, 5.6, dz * 0.4 - dx * 0.35], [dx * 2.6, 4.9, dz * 2.6], [dx * 0.4 - dz * 0.35, 5.6, dz * 0.4 + dx * 0.35], GB.UV0, col);
      }
      g.sphere(0, 5.5, 0, 0.35, 6, 3, c('#6a4a2a'));
      void R;
    },
    lamp: function (g) {
      g.cylinder(0, 0, 0, 0.14, 0.09, 6.2, 6, METAL, null, false);
      g.box(-0.06, 6.0, -0.06, 0.12, 0.12, 1.6, GB.UV0, METAL);   // arm reaching over the road (+z = toward the road at rot 0)
      g.box(-0.22, 5.85, 1.1, 0.44, 0.2, 0.7, GB.UV0, LAMP);      // head
      g.box(-0.16, 5.82, 1.2, 0.32, 0.04, 0.5, GB.UV0, c(PAL.lampGlow));
      g.box(-0.25, 0, -0.25, 0.5, 0.25, 0.5, GB.UV0, CONCD);
    },
    signal: function (g) {
      g.cylinder(0, 0, 0, 0.12, 0.09, 4.6, 6, METAL, null, false);
      g.box(-0.06, 4.4, -0.06, 0.12, 0.12, 3.2, GB.UV0, METAL);
      g.box(-0.18, 3.5, 2.5, 0.36, 1.0, 0.36, GB.UV0, [0.12, 0.12, 0.13]);
      g.box(-0.12, 4.22, 2.86, 0.24, 0.22, 0.02, GB.UV0, [1, 0.15, 0.1]);
      g.box(-0.12, 3.9, 2.86, 0.24, 0.22, 0.02, GB.UV0, [1, 0.7, 0.1]);
      g.box(-0.12, 3.58, 2.86, 0.24, 0.22, 0.02, GB.UV0, [0.2, 0.9, 0.3]);
      g.box(-0.18, 2.2, -0.18, 0.36, 0.8, 0.36, GB.UV0, [0.12, 0.12, 0.13]);
      g.box(-0.12, 2.75, 0.18, 0.24, 0.2, 0.02, GB.UV0, [1, 0.15, 0.1]);
      g.box(-0.12, 2.5, 0.18, 0.24, 0.2, 0.02, GB.UV0, [0.2, 0.9, 0.3]);
    },
    bench: function (g) {
      var wood = c('#8a6a44');
      g.box(-0.9, 0.4, -0.25, 1.8, 0.08, 0.5, GB.UV0, wood);
      g.box(-0.9, 0.5, -0.3, 1.8, 0.5, 0.08, GB.UV0, wood);
      g.box(-0.85, 0, -0.25, 0.08, 0.45, 0.5, GB.UV0, METAL);
      g.box(0.77, 0, -0.25, 0.08, 0.45, 0.5, GB.UV0, METAL);
    },
    hydrant: function (g) { var red = c('#c94040'); g.cylinder(0, 0, 0, 0.16, 0.14, 0.6, 6, red); g.sphere(0, 0.62, 0, 0.16, 6, 3, red); g.box(-0.26, 0.3, -0.07, 0.52, 0.14, 0.14, GB.UV0, red); },
    billboard: function (g) { g.cylinder(-0.6, 0, 0, 0.12, 0.12, 5.2, 6, METAL, null, false); g.cylinder(0.6, 0, 0, 0.12, 0.12, 5.2, 6, METAL, null, false); },
    table: function (g) {
      g.box(-0.9, 0.72, -0.4, 1.8, 0.06, 0.8, GB.UV0, WHITE);
      for (var i = 0; i < 4; i++) g.box((i % 2 ? 0.78 : -0.84), 0, (i < 2 ? -0.36 : 0.3), 0.06, 0.72, 0.06, GB.UV0, METAL);
      g.box(-0.5, 0.78, -0.2, 1.0, 0.02, 0.4, GB.UV0, [0.9, 0.3, 0.6]); // a tablecloth-ish banner
    },
    sign: function (g) { g.cylinder(0, 0, 0, 0.06, 0.06, 1, 5, METAL, null, false); },
    pillar: function (g) { g.box(-0.6, 0, -0.6, 1.2, 1, 1.2, GB.UV0, CONC); g.box(-0.9, 0.93, -0.9, 1.8, 0.07, 1.8, GB.UV0, CONCD); },
    dish: function (g) { g.cylinder(0, 0, 0, 0.08, 0.08, 1.2, 5, METAL, null, false); g.cylinder(0, 1.0, 0.2, 0.2, 1.1, 0.5, 10, WHITE, null, false); g.cylinder(0, 1.0, 0.2, 1.1, 0.95, 0.12, 10, [0.8, 0.8, 0.85]); },
    pump: function (g) { g.box(-0.45, 0, -0.3, 0.9, 1.7, 0.6, GB.UV0, c('#d9d9d9')); g.box(-0.3, 1.0, -0.32, 0.6, 0.45, 0.04, GB.UV0, [0.1, 0.15, 0.2]); g.box(-0.3, 0.2, -0.32, 0.6, 0.6, 0.04, GB.UV0, c('#c94040')); g.box(-0.6, 0, -0.45, 1.2, 0.15, 0.9, GB.UV0, CONCD); },
    canopy: function (g) {
      g.box(-6, 4.4, -3.5, 12, 0.5, 7, GB.UV0, c('#e8e2c8'));
      g.box(-6, 4.3, -3.5, 12, 0.12, 7, GB.UV0, c('#c94040'));
      for (var i = 0; i < 4; i++) g.cylinder(i % 2 ? 4.5 : -4.5, 0, i < 2 ? -2.5 : 2.5, 0.2, 0.2, 4.4, 6, CONC, null, false);
    },
    boat: function (g) {
      var hull = WHITE;
      g.box(-1.1, 0, -2.4, 2.2, 0.9, 4.8, GB.UV0, hull);
      g.quad([-1.1, 0.9, 2.4], [1.1, 0.9, 2.4], [0, 0.95, 3.6], [0, 0.95, 3.6], GB.UV0, hull);
      g.quad([0, 0.0, 3.6], [1.1, 0, 2.4], [1.1, 0.9, 2.4], [0, 0.95, 3.6], GB.UV0, hull);
      g.quad([-1.1, 0, 2.4], [0, 0.0, 3.6], [0, 0.95, 3.6], [-1.1, 0.9, 2.4], GB.UV0, hull);
      g.box(-0.9, 0.9, -1.8, 1.8, 0.08, 3.6, GB.UV0, c('#8a6a44'));
      g.box(-0.8, 0.98, -0.4, 1.6, 0.9, 1.6, GB.UV0, hull);
      g.box(-0.7, 1.3, -0.45, 1.4, 0.4, 0.05, GB.UV0, [0.2, 0.3, 0.4]);
    },
    yacht: function (g) {
      var hull = WHITE, deck = c('#e8e2c8');
      g.box(-4, 0, -11, 8, 3, 22, GB.UV0, hull);
      g.quad([-4, 3, 11], [4, 3, 11], [0, 3.1, 16], [0, 3.1, 16], GB.UV0, hull);
      g.quad([0, 0, 16], [4, 0, 11], [4, 3, 11], [0, 3.1, 16], GB.UV0, hull);
      g.quad([-4, 0, 11], [0, 0, 16], [0, 3.1, 16], [-4, 3, 11], GB.UV0, hull);
      g.box(-3.8, 3, -10.8, 7.6, 0.1, 21.6, GB.UV0, deck);
      g.box(-3, 3.1, -6, 6, 2.6, 12, GB.UV0, hull);
      g.box(-3.05, 4.2, -5.5, 6.1, 0.8, 11, GB.UV0, [0.15, 0.2, 0.3]);
      g.box(-2.2, 5.7, -2, 4.4, 2.2, 6, GB.UV0, hull);
      g.box(-2.25, 6.5, -1.5, 4.5, 0.7, 5, GB.UV0, [0.15, 0.2, 0.3]);
      g.cylinder(0, 7.9, 0, 0.1, 0.1, 2.5, 5, METAL, null, false);
      g.box(-0.1, 0.5, -11.1, 0.2, 2.2, 0.1, GB.UV0, c('#ff3fa4'));
    },
    hedge: function (g) { g.box(-0.5, 0, -0.5, 1, 1, 1, GB.UV0, c('#2f6b2c')); },
    antenna: function (g) { g.cylinder(0, 0, 0, 0.05, 0.03, 1, 4, METAL, null, false); g.box(-0.3, 0.6, -0.02, 0.6, 0.04, 0.04, GB.UV0, METAL); g.box(-0.02, 0.98, -0.02, 0.04, 0.06, 0.04, GB.UV0, [1, 0.2, 0.2]); },
    crate: function (g) { g.box(-0.6, 0, -0.6, 1.2, 1.2, 1.2, GB.UV0, c('#8a6a44')); g.box(-0.62, 0.5, -0.62, 1.24, 0.2, 1.24, GB.UV0, c('#5a3f2a')); },
    bollard: function (g) { g.cylinder(0, 0, 0, 0.14, 0.12, 0.7, 6, METAL); g.box(-0.1, 0.5, -0.1, 0.2, 0.06, 0.2, GB.UV0, WHITE); },
    flag: function (g) { g.cylinder(0, 0, 0, 0.06, 0.04, 1, 5, LAMP, null, false); g.quad([0, 0.98, 0], [0.5, 0.98, 0], [0.5, 0.85, 0], [0, 0.85, 0], GB.UV0, WHITE); g.quad([0, 0.85, 0], [0.5, 0.85, 0], [0.5, 0.98, 0], [0, 0.98, 0], GB.UV0, WHITE); },
    mast: function (g) { g.cylinder(0, 0, 0, 0.3, 0.2, 0.9, 6, METAL, null, false); g.box(-0.9, 0.86, -0.3, 1.8, 0.14, 0.6, GB.UV0, METAL); g.box(-0.85, 0.9, -0.32, 1.7, 0.08, 0.04, GB.UV0, [1, 1, 0.85]); },
    stack: function (g) { g.cylinder(0, 0, 0, 1.2, 0.8, 1, 8, c('#8b4a2a'), null, false); g.cylinder(0, 0.94, 0, 0.82, 0.82, 0.06, 8, METAL); },
    kiosk: function (g) { g.box(-2, 0, -1.6, 4, 2.6, 3.2, GB.UV0, c('#2f6b4a')); g.box(-2.3, 2.5, -1.9, 4.6, 0.3, 3.8, GB.UV0, c('#e8b53a')); g.box(-1.5, 0.9, 1.55, 3, 1.2, 0.1, GB.UV0, [0.4, 0.6, 0.7]); },
    bin: function (g) { g.cylinder(0, 0, 0, 0.3, 0.32, 1, 7, c('#2c3e50')); g.cylinder(0, 0.95, 0, 0.34, 0.34, 0.08, 7, METAL); },
    pool: function (g) { g.box(-4.5, 0, -2.5, 9, 0.3, 5, GB.UV0, CONCL()); g.box(-4.1, 0.05, -2.1, 8.2, 0.3, 4.2, GB.UV0, c('#39b6e8')); },
    tableSmall: function (g) { PROPS.table(g); }
  };
  function CONCL() { return c(PAL.concreteLight); }
})();
