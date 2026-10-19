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
    vehicleGeometry: function (cls) {
      if (Assets._vehicles[cls]) return Assets._vehicles[cls];
      var spec = C.VEHICLES[cls] || C.VEHICLES.sedan;
      var paint = new GB({ color: true }), det = new GB({ color: true });
      var L = spec.length, W = spec.width, H = spec.height, wr = spec.wheelRadius;
      var white = [1, 1, 1], glass = [0.22, 0.3, 0.38], dark = [0.1, 0.1, 0.12], chrome = [0.75, 0.78, 0.82], red = [0.9, 0.1, 0.08], amber = [1, 0.75, 0.2], headl = [1, 0.98, 0.85];
      var y0 = wr * 0.9; // chassis bottom
      function cabin(x0, x1, zHalf, yb, yt, inset) {
        // a cabin box with glass on the sides and front/back, roof painted
        var z0 = -zHalf + inset, z1 = zHalf - inset;
        det.box(x0, yb, z0, x1 - x0, yt - yb, z1 - z0, GB.UV0, function (f) { return f === 'top' ? white : glass; }, { top: 0, bottom: 0, north: 1, south: 1, west: 1, east: 1 });
        paint.box(x0, yt - 0.02, z0, x1 - x0, 0.02, z1 - z0, GB.UV0, white, { top: 1, bottom: 0, north: 0, south: 0, west: 0, east: 0 });
      }
      // body coordinates: x along length (front = +x), z across (width), y up
      var fx = L / 2, bx = -L / 2, hz = W / 2;
      if (cls === 'truck') {
        paint.box(fx - 2.2, y0, -hz, 2.2, 0.9, W, GB.UV0, white);       // hood
        cabin(fx - 2.1, fx - 0.3, hz, y0 + 0.9, y0 + 1.9, 0.12);
        paint.box(fx - 2.1, y0 + 1.88, -hz + 0.1, 1.8, 0.1, W - 0.2, GB.UV0, white);
        det.box(bx, y0 + 0.2, -hz, L - 2.4, H - y0 - 0.2, W, GB.UV0, [0.85, 0.85, 0.82]); // cargo box
        det.box(bx + 0.2, y0 - 0.2, -hz + 0.2, L - 2.6, 0.3, W - 0.4, GB.UV0, dark);
      } else if (cls === 'bus') {
        paint.box(bx, y0, -hz, L, H - y0 - 0.9, W, GB.UV0, white);
        det.box(bx + 0.1, y0 + (H - y0 - 0.9) - 0.05, -hz + 0.05, L - 0.2, 0.75, W - 0.1, GB.UV0, function (f) { return f === 'top' ? white : glass; });
        paint.box(bx + 0.05, H - 0.2, -hz + 0.05, L - 0.1, 0.2, W - 0.1, GB.UV0, white);
      } else if (cls === 'van') {
        paint.box(bx, y0, -hz, L, 0.9, W, GB.UV0, white);
        det.box(bx + 0.1, y0 + 0.88, -hz + 0.08, L - 0.2, 0.7, W - 0.16, GB.UV0, function (f) { return f === 'top' ? white : glass; });
        paint.box(bx + 0.1, y0 + 1.56, -hz + 0.08, L - 0.2, H - y0 - 1.56, W - 0.16, GB.UV0, white);
      } else if (cls === 'bike') {
        paint.box(bx + 0.5, y0 + 0.15, -0.18, L - 1.0, 0.35, 0.36, GB.UV0, white);
        det.box(bx + 0.3, y0 + 0.5, -0.12, 0.8, 0.12, 0.24, GB.UV0, dark);  // seat
        det.box(fx - 0.7, y0 + 0.5, -0.35, 0.08, 0.08, 0.7, GB.UV0, chrome); // bars
        det.box(bx + 0.2, y0 - 0.1, -0.25, L - 0.4, 0.25, 0.5, GB.UV0, dark);
      } else {
        var lowH = cls === 'sports' ? 0.55 : cls === 'suv' ? 0.95 : 0.7;
        paint.box(bx, y0, -hz, L, lowH, W, GB.UV0, white);
        var cabFront = cls === 'sports' ? fx - 1.6 : cls === 'suv' ? fx - 1.4 : fx - 1.5;
        var cabBack = cls === 'sports' ? bx + 0.9 : cls === 'suv' ? bx + 0.2 : bx + 0.9;
        cabin(cabBack, cabFront, hz, y0 + lowH, H, 0.15);
        if (cls === 'cop') { det.box(-0.5, H, -0.55, 1.0, 0.18, 0.5, GB.UV0, red); det.box(-0.5, H, 0.05, 1.0, 0.18, 0.5, GB.UV0, [0.2, 0.4, 1]); }
        if (cls === 'taxi') det.box(-0.4, H, -0.3, 0.8, 0.25, 0.6, GB.UV0, amber);
      }
      // bumpers, lights, grille, plate
      det.box(fx - 0.12, y0 + 0.05, -hz, 0.14, 0.3, W, GB.UV0, chrome);
      det.box(bx - 0.02, y0 + 0.05, -hz, 0.14, 0.3, W, GB.UV0, chrome);
      var ly = y0 + (cls === 'bus' || cls === 'truck' ? 0.6 : 0.45), lw = cls === 'bike' ? 0.18 : 0.36;
      det.box(fx - 0.04, ly, -hz + 0.15, 0.06, 0.2, lw, GB.UV0, headl);
      det.box(fx - 0.04, ly, hz - 0.15 - lw, 0.06, 0.2, lw, GB.UV0, headl);
      det.box(bx - 0.04, ly, -hz + 0.15, 0.06, 0.18, lw, GB.UV0, red);
      det.box(bx - 0.04, ly, hz - 0.15 - lw, 0.06, 0.18, lw, GB.UV0, red);
      if (cls !== 'bike') det.box(fx - 0.03, ly - 0.02, -0.4, 0.05, 0.22, 0.8, GB.UV0, dark);
      // merge: group 0 = paint (material.color = vehicle color), group 1 = details
      var gp = paint.build(), gd = det.build();
      var body = GB.merge([gp, gd]);
      var np = gp.getIndex().count;
      body.clearGroups(); body.addGroup(0, np, 0); body.addGroup(np, gd.getIndex().count, 1);
      // wheel
      var wg = new GB({ color: true });
      var ww = cls === 'bike' ? 0.12 : cls === 'truck' || cls === 'bus' ? 0.32 : 0.24;
      wheelCyl(wg, wr, ww, dark, chrome);
      var wheelOffsets = cls === 'bike'
        ? [{ x: fx - 0.45, z: 0, steer: true }, { x: bx + 0.45, z: 0, steer: false }]
        : [{ x: fx - L * 0.22, z: -hz + ww * 0.4, steer: true }, { x: fx - L * 0.22, z: hz - ww * 0.4, steer: true }, { x: bx + L * 0.2, z: -hz + ww * 0.4, steer: false }, { x: bx + L * 0.2, z: hz - ww * 0.4, steer: false }];
      var rec = Assets._vehicles[cls] = {
        body: body, wheel: wg.build(), wheelRadius: wr, wheelOffsets: wheelOffsets, groups: { paint: 0, detail: 1 },
        lightPoints: { headL: { x: fx, y: ly + 0.1, z: -hz + 0.3 }, headR: { x: fx, y: ly + 0.1, z: hz - 0.3 }, tailL: { x: bx, y: ly + 0.1, z: -hz + 0.3 }, tailR: { x: bx, y: ly + 0.1, z: hz - 0.3 }, roof: { x: 0, y: H + 0.1, z: 0 } },
        doorPoints: [{ x: 0.3, z: -hz - 0.6, seat: 0 }, { x: 0.3, z: hz + 0.6, seat: 1 }],
        size: { length: L, width: W, height: H }
      };
      return rec;
    },

    // ---------------------------------------------------------------- peds --
    pedParts: function (look) {
      look = look || {};
      var skinTones = ['#f3d9c4', '#e8c39e', '#d1a074', '#b57a4d', '#8d5524', '#5c3a21'];
      var skin = skinTones[U.clamp((look.skin || 2) - 1, 0, 5)];
      var shirt = look.shirt || '#6a8fcf', pants = look.pants || '#2a2f4a', hairC = look.hairColor || '#3a2a1a';
      var g = new THREE.Group();
      var mSkin = Assets.colorMaterial(skin), mShirt = Assets.colorMaterial(shirt), mPants = Assets.colorMaterial(pants), mHair = Assets.colorMaterial(hairC), mShoe = Assets.colorMaterial('#222228');
      var sc = look.scale || 1;
      function part(name, geo, mat, x, y, z) { var m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(x, y, z); m.castShadow = true; return m; }
      var legH = 0.85, torsoH = 0.62, headR = 0.14;
      // legs pivot at the hip
      ['legL', 'legR'].forEach(function (n, i) {
        var piv = new THREE.Group(); piv.name = n; piv.position.set(i ? 0.11 : -0.11, legH, 0);
        piv.add(part(n + 'Mesh', new THREE.BoxGeometry(0.17, legH, 0.2), mPants, 0, -legH / 2, 0));
        piv.add(part(n + 'Shoe', new THREE.BoxGeometry(0.18, 0.08, 0.28), mShoe, 0, -legH + 0.04, 0.04));
        g.add(piv);
      });
      g.add(part('torso', new THREE.BoxGeometry(0.46, torsoH, 0.26), mShirt, 0, legH + torsoH / 2, 0));
      ['armL', 'armR'].forEach(function (n, i) {
        var piv = new THREE.Group(); piv.name = n; piv.position.set(i ? 0.3 : -0.3, legH + torsoH - 0.04, 0);
        piv.add(part(n + 'Mesh', new THREE.BoxGeometry(0.13, 0.6, 0.14), mShirt, 0, -0.26, 0));
        piv.add(part(n + 'Hand', new THREE.BoxGeometry(0.12, 0.12, 0.12), mSkin, 0, -0.6, 0));
        g.add(piv);
      });
      var headY = legH + torsoH + 0.06 + headR;
      g.add(part('head', new THREE.BoxGeometry(headR * 2, headR * 2.1, headR * 2), mSkin, 0, headY, 0));
      // hair: a cap shaped by style
      var hair = look.hair || 'short', hg = null;
      if (hair === 'short' || hair === 'slick') hg = new THREE.BoxGeometry(0.3, 0.1, 0.3);
      else if (hair === 'long') hg = new THREE.BoxGeometry(0.31, 0.36, 0.31);
      else if (hair === 'bob') hg = new THREE.BoxGeometry(0.32, 0.26, 0.32);
      else if (hair === 'bun') hg = new THREE.BoxGeometry(0.3, 0.12, 0.3);
      else if (hair === 'pompadour') hg = new THREE.BoxGeometry(0.3, 0.2, 0.26);
      else if (hair === 'mohawk') hg = new THREE.BoxGeometry(0.08, 0.22, 0.3);
      else if (hair === 'afro') hg = new THREE.BoxGeometry(0.4, 0.34, 0.4);
      if (hg && hair !== 'bald') {
        var hy = hair === 'long' ? headY + 0.02 : hair === 'bob' ? headY + 0.04 : headY + headR + 0.02;
        g.add(part('hair', hg, mHair, 0, hy, hair === 'pompadour' ? -0.02 : 0));
        if (hair === 'bun') g.add(part('bun', new THREE.BoxGeometry(0.12, 0.12, 0.12), mHair, 0, headY + headR, -0.16));
      }
      if (look.hat && look.hat !== 'none') {
        var hm = Assets.colorMaterial(look.hatColor || (look.hat === 'crown' ? '#e8b53a' : look.hat === 'helmet' ? '#e8b53a' : '#2b2b2b'));
        var hatG = look.hat === 'cowboy' ? new THREE.BoxGeometry(0.5, 0.06, 0.5) : look.hat === 'cap' ? new THREE.BoxGeometry(0.3, 0.1, 0.36) : new THREE.BoxGeometry(0.32, 0.16, 0.32);
        g.add(part('hat', hatG, hm, 0, headY + headR + 0.06, look.hat === 'cap' ? 0.03 : 0));
      }
      if (look.glasses && look.glasses !== 'none') g.add(part('glasses', new THREE.BoxGeometry(0.26, 0.05, 0.04), Assets.colorMaterial(look.glasses === 'shades' ? '#111' : '#333'), 0, headY + 0.02, headR + 0.01));
      if (look.extra && look.extra !== 'none') g.add(part('extra', new THREE.BoxGeometry(0.06, 0.16, 0.06), Assets.colorMaterial(look.extra === 'mic' ? '#222' : '#c9ccd4'), 0.16, legH + torsoH - 0.2, 0.16));
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

  function wheelCyl(g, r, w, dark, hub) {
    // axis along z (across the car); drawn as a cylinder around z by building in xy then rotating isn't available, so build segments directly
    var segs = 10;
    for (var i = 0; i < segs; i++) {
      var a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU;
      var x0 = Math.cos(a0) * r, y0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
      g.quad([x0, y0, -w / 2], [x0, y0, w / 2], [x1, y1, w / 2], [x1, y1, -w / 2], GB.UV0, dark);
      var i0 = g.vertex(0, 0, w / 2, 0, 0, 1, 0, 0, hub), i1 = g.vertex(x0, y0, w / 2, 0, 0, 1, 0, 0, i % 2 ? hub : dark), i2 = g.vertex(x1, y1, w / 2, 0, 0, 1, 0, 0, i % 2 ? hub : dark);
      g.idx.push(i0, i1, i2);
      var j0 = g.vertex(0, 0, -w / 2, 0, 0, -1, 0, 0, hub), j1 = g.vertex(x0, y0, -w / 2, 0, 0, -1, 0, 0, i % 2 ? hub : dark), j2 = g.vertex(x1, y1, -w / 2, 0, 0, -1, 0, 0, i % 2 ? hub : dark);
      g.idx.push(j0, j2, j1);
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
