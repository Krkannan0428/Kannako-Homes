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

  // ---- surface maps generated from the colour maps (the graphics track) ----
  // A tangent-space normal map from a canvas: luminance is read as height (mortar, grout, cracks and tar lines are
  // dark, so they read as grooves; slabs, bricks and panels stand proud), box-blurred once, then a Sobel gradient.
  // `scale` downsamples (an atlas normal at half the colour resolution is plenty), `strength` is the slope gain.
  function normalFromCanvas(src, scale, strength, blur) {
    var t0 = U.now(), out0 = normalFromCanvasInner(src, scale, strength, blur);
    Assets.mapsMs = (Assets.mapsMs || 0) + (U.now() - t0);
    return out0;
  }
  // read a canvas back at 1/scale resolution with a box filter in JS (getImageData on the source is cheap; drawing it
  // scaled into a scratch canvas and reading that back is a multi-second readback in headless Chromium)
  function sampleCanvas(src, scale) {
    var sw = src.width, sh = src.height, w = Math.max(2, Math.floor(sw / scale)), h = Math.max(2, Math.floor(sh / scale));
    var sd = src.getContext('2d').getImageData(0, 0, sw, sh).data;
    if (scale === 1) return { w: w, h: h, data: sd };
    var out = new Uint8ClampedArray(w * h * 4), inv = 1 / (scale * scale);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var r = 0, g = 0, b = 0;
      for (var oy = 0; oy < scale; oy++) { var row = ((y * scale + oy) * sw + x * scale) * 4; for (var ox = 0; ox < scale; ox++, row += 4) { r += sd[row]; g += sd[row + 1]; b += sd[row + 2]; } }
      var k = (y * w + x) * 4;
      out[k] = r * inv; out[k + 1] = g * inv; out[k + 2] = b * inv; out[k + 3] = 255;
    }
    return { w: w, h: h, data: out };
  }
  function normalFromCanvasInner(src, scale, strength, blur) {
    var smp = sampleCanvas(src, scale), w = smp.w, h = smp.h, d = smp.data;
    var cv = canvas(w, h), ctx = cv.getContext('2d');
    var n = w * h, lum = new Float32Array(n), i, x, y, row;
    for (i = 0; i < n; i++) lum[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
    // wrap-around neighbour tables (tileable, no modulo in the hot loops)
    var xl = new Int32Array(w), xr = new Int32Array(w), yu = new Int32Array(h), yd = new Int32Array(h);
    for (x = 0; x < w; x++) { xl[x] = x === 0 ? w - 1 : x - 1; xr[x] = x === w - 1 ? 0 : x + 1; }
    for (y = 0; y < h; y++) { yu[y] = (y === 0 ? h - 1 : y - 1) * w; yd[y] = (y === h - 1 ? 0 : y + 1) * w; }
    if (blur) {
      // a separable 3-tap box blur
      var tmp = new Float32Array(n), b = new Float32Array(n);
      for (y = 0; y < h; y++) { row = y * w; for (x = 0; x < w; x++) tmp[row + x] = (lum[row + xl[x]] + lum[row + x] + lum[row + xr[x]]) / 3; }
      for (y = 0; y < h; y++) { row = y * w; for (x = 0; x < w; x++) b[row + x] = (tmp[yu[y] + x] + tmp[row + x] + tmp[yd[y] + x]) / 3; }
      lum = b;
    }
    var out = ctx.createImageData(w, h), o = out.data, k = 0;
    for (y = 0; y < h; y++) {
      row = y * w;
      for (x = 0; x < w; x++, k += 4) {
        // height rises with luminance; v runs up the canvas (flipY), so the green slope is the downward difference
        var nx = (lum[row + xl[x]] - lum[row + xr[x]]) * strength, ny = (lum[yd[y] + x] - lum[yu[y] + x]) * strength;
        var inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        o[k] = (nx * inv * 0.5 + 0.5) * 255; o[k + 1] = (ny * inv * 0.5 + 0.5) * 255; o[k + 2] = (inv * 0.5 + 0.5) * 255; o[k + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    return cv;
  }
  function dataTexture(cv, srgb, repeat) {
    var t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = C.QUALITY.anisotropy || 4;
    return t;
  }
  // roughness in the green channel (three's roughnessMap convention), from a per-pixel rule over the colour canvas
  function roughnessFromCanvas(src, scale, rule) {
    var smp = sampleCanvas(src, scale), w = smp.w, h = smp.h, d = smp.data;
    var cv = canvas(w, h), ctx = cv.getContext('2d'), img = ctx.createImageData(w, h), o = img.data, n = w * h;
    for (var i = 0; i < n; i++) {
      var k = i * 4, r = d[k], g = d[k + 1], b = d[k + 2];
      var rough = rule(r, g, b, i % w, (i / w) | 0, w, h);
      o[k] = 0; o[k + 1] = Math.max(0, Math.min(255, rough * 255)) | 0; o[k + 2] = 0; o[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  // the facade rule: glass panes (a saturated blue) are glossy, everything else is masonry
  function facadeRoughRule(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx > 0 ? (mx - mn) / mx : 0;
    if (b >= r && b >= g && sat >= 0.25 && mx > 60) return 0.22;
    var lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    return 0.72 + (0.5 - lum) * 0.25;
  }
  // tileable value noise on a canvas (clouds, water normals); octaves of smooth random lattices
  function noiseCanvas(size, seed, octaves, persistence, alphaOnly, tint) {
    var cv = canvas(size, size), ctx = cv.getContext('2d'), R = GTP.makeRng(seed);
    var img = ctx.createImageData(size, size), d = img.data, total = new Float32Array(size * size);
    var amp = 1, sum = 0, freq = 4;
    for (var o = 0; o < octaves; o++) {
      var lat = new Float32Array(freq * freq);
      for (var i = 0; i < lat.length; i++) lat[i] = R.random();
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        var fx = x / size * freq, fy = y / size * freq, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        var x1 = (x0 + 1) % freq, y1 = (y0 + 1) % freq;
        var v = lat[y0 * freq + x0] * (1 - tx) * (1 - ty) + lat[y0 * freq + x1] * tx * (1 - ty) + lat[y1 * freq + x0] * (1 - tx) * ty + lat[y1 * freq + x1] * tx * ty;
        total[y * size + x] += v * amp;
      }
      sum += amp; amp *= persistence; freq *= 2;
    }
    for (var k = 0; k < size * size; k++) {
      var n = total[k] / sum, p = k * 4;
      if (alphaOnly) { d[p] = tint ? tint[0] : 255; d[p + 1] = tint ? tint[1] : 255; d[p + 2] = tint ? tint[2] : 255; d[p + 3] = n * 255; }
      else { d[p] = d[p + 1] = d[p + 2] = n * 255; d[p + 3] = 255; }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  var Assets = GTP.Assets = {
    atlas: null, atlasCanvas: null, atlasNormal: null, atlasRough: null, water: null, waterNormal: null, cells: cells,
    _facades: {}, _facadeMats: {}, _facadeMatsFar: {}, _signs: {}, _signMats: {}, _props: {}, _vehicles: {}, _mats: {},
    particle: null, glow: null, sky: null, skyCanvas: null, env: null, envCanvas: null, clouds: null, rain: null, moon: null, ready: false,

    init: function () {
      if (Assets.ready) return;
      var t0 = U.now();
      Assets._buildAtlas();
      Assets._buildWater();
      Assets._buildSprites();
      Assets.ready = true;
      Assets.initMs = U.now() - t0;
    },
    // Quality presets toggle the costly maps on the shared materials (null normal / roughness maps compile to
    // cheaper shaders); textures pick up the anisotropy. Render.quality.set calls this after mutating C.QUALITY.
    applyQuality: function (q) {
      q = q || C.QUALITY;
      var nm = !!q.normalMaps, k, m;
      if (nm) Assets.ensureSurfaceMaps();
      function setMaps(mat, normal, rough) {
        if (!mat) return;
        var want = nm ? normal : null;
        if (mat.normalMap !== want) { mat.normalMap = want; mat.needsUpdate = true; }
        var wantR = nm ? rough : null;
        if (mat.roughnessMap !== wantR) { mat.roughnessMap = wantR; mat.needsUpdate = true; }
      }
      setMaps(Assets._mats.ground, Assets.atlasNormal, Assets.atlasRough);
      for (k in Assets._facadeMats) { m = Assets._facadeMats[k]; var f = Assets._facades[k]; if (f) setMaps(m, f.normal, f.rough); }
      if (Assets._mats.water && nm) { Assets.waterUniforms.tGtpRip.value = Assets.waterNormal; Assets._mats.water.needsUpdate = true; }
      var aniso = q.anisotropy || 4;
      [Assets.atlas, Assets.atlasNormal, Assets.atlasRough, Assets.water].forEach(function (t) { if (t && t.anisotropy !== aniso) { t.anisotropy = aniso; t.needsUpdate = true; } });
      for (k in Assets._facades) { var ff = Assets._facades[k]; [ff.day, ff.night, ff.normal, ff.rough].forEach(function (t) { if (t && t.anisotropy !== aniso) { t.anisotropy = aniso; t.needsUpdate = true; } }); }
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
      // unused cells are asphalt-coloured: a coarse mip level blends neighbouring cells, and a loud fill would bleed into
      // tiles seen at a grazing angle (the runway showed magenta flecks when this was debug magenta)
      ctx.fillStyle = PAL.asphalt; ctx.fillRect(0, 0, ATLAS, ATLAS);
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
      if (C.QUALITY.normalMaps) Assets.ensureSurfaceMaps();
    },
    // The surface maps (generated from the colour canvases, at half resolution) are built the first time a preset
    // with normalMaps asks for them, so a low boot (and every headless test) pays nothing for them:
    //   atlasNormal  asphalt grain, tar lines and cracks, slab grout, kerb lips, dock planks
    //   atlasRough   the per-cell base roughness (ROUGH) modulated by luminance: paint reads glossier than aggregate
    //   waterNormal  layered-noise ripples
    ensureSurfaceMaps: function () {
      if (Assets.atlasNormal) return;
      var cv = Assets.atlasCanvas, names = Object.keys(cells);
      Assets.atlasNormal = dataTexture(normalFromCanvas(cv, 2, 2.6, true), false, false);
      var baseRough = {};
      names.forEach(function (name) { baseRough[cells[name].row * 8 + cells[name].col] = ROUGH[name] != null ? ROUGH[name] : 0.9; });
      var cellPx = CELL / 2;
      Assets.atlasRough = dataTexture(roughnessFromCanvas(cv, 2, function (r, g, b, x, y) {
        var base = baseRough[Math.floor(y / cellPx) * 8 + Math.floor(x / cellPx)];
        if (base == null) base = 0.9;
        var lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        return base - (lum - 0.45) * 0.3;
      }), false, false);
      Assets.waterNormal = dataTexture(normalFromCanvas(noiseCanvas(256, 0x3A7E2, 4, 0.55), 1, 3.2, true), false, true);
      Assets.waterNormal.repeat.set(2600 / 14, 2600 / 14);
      for (var k in Assets._facades) Assets._facadeMaps(Assets._facades[k]);
    },
    _facadeMaps: function (f) {
      if (f.normal) return;
      var day = f.day.image;
      f.normal = dataTexture(normalFromCanvas(day, 2, 2.2, true), false, true); f.normal.wrapT = THREE.ClampToEdgeWrapping;
      f.rough = dataTexture(roughnessFromCanvas(day, 2, facadeRoughRule), false, true); f.rough.wrapT = THREE.ClampToEdgeWrapping;
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
      // the sky: one 512 x 256 equirectangular canvas painted by Render.updateEnvironment (gradient, sun glow, horizon haze,
      // a ground half). The dome samples it mirrored (seen from inside), the PMREM environment map samples it straight.
      var sky = Assets.skyCanvas = canvas(512, 256);
      Assets.sky = new THREE.CanvasTexture(sky);
      Assets.sky.colorSpace = THREE.SRGBColorSpace;
      Assets.sky.minFilter = THREE.LinearFilter; Assets.sky.magFilter = THREE.LinearFilter; Assets.sky.generateMipmaps = false;
      Assets.sky.wrapS = THREE.RepeatWrapping; Assets.sky.repeat.x = -1;
      Assets.env = new THREE.CanvasTexture(sky);
      Assets.env.colorSpace = THREE.SRGBColorSpace; Assets.env.mapping = THREE.EquirectangularReflectionMapping;
      Assets.env.minFilter = THREE.LinearFilter; Assets.env.magFilter = THREE.LinearFilter; Assets.env.generateMipmaps = false;
      // the sun: soft warm disc
      var cv3 = canvas(128, 128), c3 = cv3.getContext('2d');
      var g3 = c3.createRadialGradient(64, 64, 10, 64, 64, 64);
      g3.addColorStop(0, 'rgba(255,250,230,1)'); g3.addColorStop(0.3, 'rgba(255,235,180,0.9)'); g3.addColorStop(0.55, 'rgba(255,200,120,0.25)'); g3.addColorStop(1, 'rgba(255,180,100,0)');
      c3.fillStyle = g3; c3.fillRect(0, 0, 128, 128);
      Assets.sun = new THREE.CanvasTexture(cv3); Assets.sun.colorSpace = THREE.SRGBColorSpace;
      // the moon: a pale disc with a few maria and a soft limb
      var cv4 = canvas(128, 128), c4 = cv4.getContext('2d'), Rm = rngTex.fork(0x300);
      var g4 = c4.createRadialGradient(64, 64, 40, 64, 64, 64);
      g4.addColorStop(0, 'rgba(236,240,250,1)'); g4.addColorStop(0.78, 'rgba(236,240,250,1)'); g4.addColorStop(0.86, 'rgba(220,228,245,0.6)'); g4.addColorStop(1, 'rgba(200,210,240,0)');
      c4.fillStyle = g4; c4.beginPath(); c4.arc(64, 64, 64, 0, TAU); c4.fill();
      c4.fillStyle = 'rgba(150,160,190,0.45)';
      for (var mi = 0; mi < 9; mi++) { var ma = Rm.random() * TAU, mr = Rm.random() * 36; c4.beginPath(); c4.ellipse(64 + Math.cos(ma) * mr, 64 + Math.sin(ma) * mr, 5 + Rm.random() * 11, 4 + Rm.random() * 8, Rm.random() * 3, 0, TAU); c4.fill(); }
      Assets.moon = new THREE.CanvasTexture(cv4); Assets.moon.colorSpace = THREE.SRGBColorSpace;
      // clouds: tileable multi-octave noise, thresholded in the shader (cover) so the sky can go from scattered to overcast
      Assets.clouds = dataTexture(noiseCanvas(512, 0xC10D5, 5, 0.52), false, true);
      Assets.clouds.anisotropy = 1;
      // a rain streak: a thin vertical line with soft ends, for a Points cloud around the camera
      var cv5 = canvas(32, 128), c5 = cv5.getContext('2d');
      var g5 = c5.createLinearGradient(0, 0, 0, 128);
      g5.addColorStop(0, 'rgba(255,255,255,0)'); g5.addColorStop(0.3, 'rgba(255,255,255,0.55)'); g5.addColorStop(0.85, 'rgba(255,255,255,0.9)'); g5.addColorStop(1, 'rgba(255,255,255,0)');
      c5.fillStyle = g5; c5.fillRect(13, 0, 6, 128);
      c5.fillStyle = 'rgba(255,255,255,0.2)'; c5.fillRect(11, 10, 10, 108);
      Assets.rain = new THREE.CanvasTexture(cv5); Assets.rain.minFilter = THREE.LinearFilter; Assets.rain.magFilter = THREE.LinearFilter;
    },

    // ----------------------------------------------------------- materials --
    // The shared PBR materials the chunks use near the camera; the *Far variants are the cheaper Lambert ones the
    // LOD swaps in beyond QUALITY.lodDistance (no normal map, no environment reflection).
    groundMaterial: function () {
      var M = Assets._mats;
      if (!M.ground) {
        if (C.QUALITY.normalMaps) Assets.ensureSurfaceMaps();
        M.ground = new THREE.MeshStandardMaterial({ map: Assets.atlas, normalMap: C.QUALITY.normalMaps ? Assets.atlasNormal : null, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: C.QUALITY.normalMaps ? Assets.atlasRough : null, roughness: 1.0, metalness: 0.0, envMapIntensity: 0.5 });
        M.ground.name = 'ground';
        Assets._groundShader(M.ground);
      }
      return M.ground;
    },
    // The ground's world-space layer: a macro variation from two octaves of the cloud noise (no two blocks of asphalt
    // read alike and the atlas stops looking tiled), and the rain: everything darkens and turns glossy with
    // Render.weather.wet, and puddles fill the low spots of a noise field on flat ground (mirror-smooth, flat-normal, so
    // the sky, the lamps and the neon reflect in them; the post pass adds screen-space reflections on top at high).
    groundUniforms: { tGtpNoise: { value: null }, uGtpWet: { value: 0 }, uGtpRain: { value: 0 }, uGtpTime: { value: 0 } },
    _groundShader: function (m) {
      var GU = Assets.groundUniforms;
      GU.tGtpNoise.value = Assets.clouds;
      m.onBeforeCompile = function (sh) {
        for (var k in GU) sh.uniforms[k] = GU[k];
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vGtpW;\nvarying float vGtpUp;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGtpW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvGtpUp = normalize( mat3( modelMatrix ) * objectNormal ).y;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D tGtpNoise; uniform float uGtpWet, uGtpRain, uGtpTime; varying vec3 vGtpW; varying float vGtpUp;')
          .replace('#include <map_fragment>', [
            '#include <map_fragment>',
            'vec2 gWp = vGtpW.xz;',
            'float gN1 = texture2D( tGtpNoise, gWp / 97.0 ).r, gN2 = texture2D( tGtpNoise, gWp / 23.0 + 0.37 ).r;',
            'diffuseColor.rgb *= 1.0 + ( gN1 - 0.5 ) * 0.24 + ( gN2 - 0.5 ) * 0.12;',
            'float gFlat = smoothstep( 0.9, 0.99, vGtpUp );',
            'float gPn = texture2D( tGtpNoise, gWp / 11.0 + 0.71 ).r * 0.65 + gN2 * 0.35;',
            'float gtpPuddle = smoothstep( 0.6 - 0.1 * uGtpWet, 0.66 - 0.1 * uGtpWet, gPn ) * gFlat * smoothstep( 0.12, 0.55, uGtpWet );',
            'float gtpWetK = uGtpWet * ( 0.55 + 0.45 * gFlat );',
            'diffuseColor.rgb *= mix( 1.0, 0.6, gtpWetK );',
            'diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 0.45, gtpPuddle );'
          ].join('\n'))
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, roughnessFactor * 0.5, gtpWetK );\nroughnessFactor = mix( roughnessFactor, 0.035, gtpPuddle );')
          .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nvec3 gtpGeoN = normal;')
          .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\niblIrradiance *= ' + IBL_DIFFUSE + ';')
          .replace('#include <normal_fragment_maps>', [
            '#include <normal_fragment_maps>',
            // rain rings on the puddles: two scrolling layers of noise bent into ripples while it rains
            'float gRip = ( texture2D( tGtpNoise, gWp / 1.7 + vec2( uGtpTime * 0.31, 0.0 ) ).r - texture2D( tGtpNoise, gWp / 1.3 - vec2( 0.0, uGtpTime * 0.27 ) ).r ) * uGtpRain * 0.35;',
            'normal = normalize( mix( normal, gtpGeoN + vec3( gRip, 0.0, -gRip ), gtpPuddle ) );'
          ].join('\n'));
      };
      m.customProgramCacheKey = function () { return 'gtp-ground'; };
    },
    groundMaterialFar: function () {
      var M = Assets._mats;
      if (!M.groundFar) { M.groundFar = new THREE.MeshLambertMaterial({ map: Assets.atlas }); M.groundFar.name = 'groundFar'; }
      return M.groundFar;
    },
    waterMaterial: function () {
      var M = Assets._mats;
      if (!M.water) {
        if (C.QUALITY.normalMaps) Assets.ensureSurfaceMaps();
        M.water = new THREE.MeshStandardMaterial({ map: Assets.water, color: 0xffffff, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.0 });
        M.water.name = 'water';
        Assets._oceanShader(M.water);
      }
      return M.water;
    },
    // The ocean: four directional swells (analytic slopes, no tessellation) plus two scrolling ripple layers give the
    // normal; three's own Fresnel reflects the sky in it and the sun glitters on the slopes. The colour runs from a
    // shallow teal by the shore to deep blue-green (Render's shore distance texture: 0 at the land, 1 eight tiles out)
    // and a band of foam breathes against every seawall, beach and pier.
    waterUniforms: { tGtpShore: { value: null }, tGtpNoise: { value: null }, tGtpRip: { value: null }, uGtpTime: { value: 0 }, uGtpMap: { value: 896 }, uGtpChop: { value: 0.5 } },
    _oceanShader: function (m) {
      var WU = Assets.waterUniforms;
      WU.tGtpNoise.value = Assets.clouds;
      m.onBeforeCompile = function (sh) {
        if (C.QUALITY.normalMaps) Assets.ensureSurfaceMaps();
        WU.tGtpRip.value = Assets.waterNormal || Assets.clouds;
        for (var k in WU) sh.uniforms[k] = WU[k];
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vGtpW;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGtpW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\n' + OCEAN_PARS)
          .replace('#include <map_fragment>', OCEAN_MAP)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( 0.045 + 0.05 * uGtpChop, 0.7, gtpFoam );')
          .replace('#include <normal_fragment_maps>', OCEAN_NORMAL);
      };
      m.customProgramCacheKey = function () { return 'gtp-ocean' + (Assets.waterNormal ? '-rip' : ''); };
    },
    // vehicle paint: a clearcoated metallic at high / ultra, a plain metallic standard below (Render.quality may change
    // the preset after a car is built; the car keeps its material until it is respawned)
    paintMaterial: function (hex) {
      var col = new THREE.Color(hex || '#c94040');
      var m = C.QUALITY.clearcoat
        ? new THREE.MeshPhysicalMaterial({ vertexColors: true, color: col, roughness: 0.42, metalness: 0.5, clearcoat: 1.0, clearcoatRoughness: 0.12, envMapIntensity: 1.0 })
        : new THREE.MeshStandardMaterial({ vertexColors: true, color: col, roughness: 0.32, metalness: 0.45, envMapIntensity: 1.0 });
      m.name = 'paint';
      return m;
    },
    glassMaterial: function () {
      var M = Assets._mats;
      if (!M.glass) { M.glass = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xb8c8d6, roughness: 0.05, metalness: 0.92, envMapIntensity: 1.1, transparent: true, opacity: 0.72 }); M.glass.name = 'glass'; }
      return M.glass;
    },
    chromeMaterial: function () {
      var M = Assets._mats;
      if (!M.chrome) { M.chrome = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.2, metalness: 1.0, envMapIntensity: 1.2 }); M.chrome.name = 'chrome'; }
      return M.chrome;
    },
    // HDR emitters for the lamps a car carries: values above 1 so the bloom pass picks them up
    emitterMaterial: function (r, g, b) {
      var key = 'em:' + r + ',' + g + ',' + b, M = Assets._mats;
      if (!M[key]) { M[key] = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color().setRGB(r, g, b), toneMapped: true }); M[key].name = key; }
      return M[key];
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
      f = Assets._facades[style] = { day: td, night: tn, mask: Assets._facadeMask(style, seed), normal: null, rough: null, style: style };
      // the surface maps (half resolution): brick courses, mullions, sills, siding laps and corrugations as relief; glass glossy
      if (Assets.atlasNormal) Assets._facadeMaps(f);
      return f;
    },
    // The glass mask (same layout as the facade): the night painters run once more in MASKING mode, then every pixel of
    // bands 0-4 becomes R = glass, G = lit at night, B = a cool (LED) light rather than a warm one. The facade shader
    // draws an interior-mapped room behind the glass and reflects the sky on it (Assets.facadeMaterial).
    _facadeMask: function (style, seed) {
      var cv = canvas(FW, FH), ctx = cv.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, FW, FH);
      MASKING = true;
      try { FACADES[style](ctx, true, GTP.makeRng(seed)); } finally { MASKING = false; ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
      var img = ctx.getImageData(0, 0, FW, FH), d = img.data, lim = 5 * BAND * FW * 4;
      for (var i = 0; i < d.length; i += 4) {
        var r = d[i], g = d[i + 1], b = d[i + 2];
        if (i >= lim) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255; continue; }
        var glass = Math.max(r, g, b) >= 4;
        d[i] = glass ? 255 : 0; d[i + 1] = glass && g >= 60 ? 255 : 0; d[i + 2] = glass && g >= 60 && b > g * 0.85 ? 255 : 0; d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      Assets.masks = Assets.masks || {}; Assets.masks[style] = cv;
      return dataTexture(cv, false, true);
    },
    // the light behind every window (Render.updateEnvironment): day = the daylight a room gets through its window,
    // night = the lamps of the lit rooms (the mask's G); one shared uniform for all facade materials
    interiorLight: { value: new THREE.Vector4(0.3, 0.0, 0.0, 0.0) },
    setInteriorLight: function (day, night) { Assets.interiorLight.value.x = day; Assets.interiorLight.value.y = night; },
    facadeMaterial: function (style) {
      if (!FACADES[style]) style = 'downtown';
      var m = Assets._facadeMats[style];
      if (m) return m;
      var f = Assets.facade(style);
      if (C.QUALITY.normalMaps) { Assets.ensureSurfaceMaps(); Assets._facadeMaps(f); }
      // vertexColors: the chunk builder tints each building slightly so a style is not a row of clones
      m = new THREE.MeshStandardMaterial({ map: f.day, emissiveMap: f.night, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0, vertexColors: true, normalMap: C.QUALITY.normalMaps ? f.normal : null, normalScale: new THREE.Vector2(0.75, 0.75), roughnessMap: C.QUALITY.normalMaps ? f.rough : null, roughness: 1.0, metalness: 0.0, envMapIntensity: 0.7 });
      m.userData.style = style; m.name = 'facade:' + style;
      Assets._glassShader(m, f, style);
      Assets._facadeMats[style] = m;
      return m;
    },
    // Glass behind the facade mask: dark, glossy (the sky and the sun reflect in it with three's own Fresnel), and an
    // interior-mapped room seen through it (a ray from the eye is cut against the room box behind each window cell:
    // back wall, side walls, floor, ceiling, a furniture card half way in, blinds at the pane; shops on the ground
    // floor get deeper rooms with shelves). The room adds emissive light: daylight by day, the room's lamp at night
    // when the mask marks the window lit, warm or cool. C.QUALITY.interiors off compiles none of it.
    _glassShader: function (m, f, style) {
      var room = ROOMS[style] || ROOMS.downtown;
      var U2 = { tGtpMask: { value: f.mask }, uGtpRoom: { value: new THREE.Vector4(room[0], room[1], C.FLOOR_H, room[2]) }, uGtpInt: Assets.interiorLight };
      m.userData.glass = U2;
      m.onBeforeCompile = function (sh) {
        if (!C.QUALITY.interiors) return;
        sh.uniforms.tGtpMask = U2.tGtpMask; sh.uniforms.uGtpRoom = U2.uGtpRoom; sh.uniforms.uGtpInt = U2.uGtpInt;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vGtpW;\nvarying vec3 vGtpN;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGtpW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvGtpN = normalize( mat3( modelMatrix ) * objectNormal );');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\n' + GLASS_PARS)
          .replace('#include <map_fragment>', '#include <map_fragment>\n' + GLASS_MAP)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.07, gtpGlass );')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = mix( totalEmissiveRadiance, gtpEmit, gtpGlass );')
          .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\niblIrradiance *= ' + IBL_DIFFUSE + ';');
      };
      m.customProgramCacheKey = function () { return C.QUALITY.interiors ? 'gtp-glass' : 'gtp-facade'; };
    },
    // window layout of a style for the chunk builder: {cols: [u in the 8 m repeat], w: u, sill, head} or null (curtain walls)
    windowLayout: function (style) {
      var L = WINDOWS[style]; if (!L) return null;
      if (!L.u) L.u = { cols: L.cols.map(function (px) { return px / FW; }), w: L.w / FW, sill: L.sill, head: L.head };
      return L.u;
    },
    // the storefront sign atlas: 32 invented shop names as backlit fascia boards (2 x 16 cells of 512 x 64), plus a dark
    // frame colour in the last cell's corner; shopSignUV(i) -> [u0, v0, u1, v1] of name i, shopSignFrameUV() a point
    shopSigns: function () {
      if (Assets._shopSigns) return Assets._shopSigns;
      var W = SIGN_W * SIGN_COLS, H = SIGN_H * SIGN_ROWS, cv = canvas(W, H), ctx = cv.getContext('2d'), R = rngTex.fork(0x5150);
      var bgs = ['#1d2233', '#2c3e7a', '#8a2f2f', '#2f6b4a', '#4a3a6a', '#e8e2c8', '#1a1a1a', '#c94040', '#f4efe4', '#2a7a7a', '#e2b43a', '#3a3a3a'];
      var inks = { '#e8e2c8': '#1d2233', '#f4efe4': '#8a2f2f', '#e2b43a': '#1a1a1a' };
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var i = 0; i < SIGN_COLS * SIGN_ROWS; i++) {
        var x = (i % SIGN_COLS) * SIGN_W, y = Math.floor(i / SIGN_COLS) * SIGN_H, bg = bgs[Math.floor(R.random() * bgs.length)], ink = inks[bg] || '#f4efe4';
        ctx.fillStyle = '#15161a'; ctx.fillRect(x, y, SIGN_W, SIGN_H);
        ctx.fillStyle = bg; ctx.fillRect(x + 4, y + 4, SIGN_W - 8, SIGN_H - 8);
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 4, y + 4, SIGN_W - 8, 6);
        var name = SHOP_NAMES[i % SHOP_NAMES.length], size = 40;
        do { ctx.font = (R.random() < 0.5 ? '900 ' : '700 ') + size + 'px "Arial Black", Impact, Arial, sans-serif'; size -= 2; } while (ctx.measureText(name).width > SIGN_W - 40 && size > 12);
        ctx.fillStyle = ink; ctx.fillText(name, x + SIGN_W / 2, y + SIGN_H / 2 + 2);
      }
      var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      var m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.05, roughness: 0.45, metalness: 0.0, envMapIntensity: 0.6 });
      m.name = 'shopSigns'; m.userData.signAtlas = true;
      Assets._shopSigns = { texture: tex, material: m, count: SIGN_COLS * SIGN_ROWS };
      return Assets._shopSigns;
    },
    shopSignUV: function (i) {
      i = ((i | 0) % (SIGN_COLS * SIGN_ROWS) + SIGN_COLS * SIGN_ROWS) % (SIGN_COLS * SIGN_ROWS);
      var W = SIGN_W * SIGN_COLS, H = SIGN_H * SIGN_ROWS, x = (i % SIGN_COLS) * SIGN_W, y = Math.floor(i / SIGN_COLS) * SIGN_H;
      return [x / W, 1 - (y + SIGN_H) / H, (x + SIGN_W) / W, 1 - y / H];
    },
    shopSignFrameUV: function () { var u = 1 / (SIGN_W * SIGN_COLS), v = 1 - 1 / (SIGN_H * SIGN_ROWS); return [[u, v], [u, v], [u, v], [u, v]]; },
    // the LOD's far facade: the old Lambert look, no relief, no reflections
    facadeMaterialFar: function (style) {
      if (!FACADES[style]) style = 'downtown';
      var m = Assets._facadeMatsFar[style];
      if (m) return m;
      var f = Assets.facade(style);
      m = new THREE.MeshLambertMaterial({ map: f.day, emissiveMap: f.night, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0, vertexColors: true });
      m.userData.style = style; m.name = 'facadeFar:' + style;
      Assets._facadeMatsFar[style] = m;
      return m;
    },
    // every shared material whose emissiveIntensity follows the night (Render.updateEnvironment drives them)
    litMaterials: function () {
      var out = [], k;
      for (k in Assets._facadeMats) out.push(Assets._facadeMats[k]);
      for (k in Assets._facadeMatsFar) out.push(Assets._facadeMatsFar[k]);
      if (Assets._shopSigns) out.push(Assets._shopSigns.material);
      return out;
    },
    facadeStyles: function () { return Object.keys(FACADES); },
    // band uv rect: [u0, v0(bottom), u1, v1(top)] for band b (0..7); u spans 0..uRepeat
    bandUV: function (b, uRepeat) { return [0, 1 - (b + 1) * BAND / FH, uRepeat == null ? 1 : uRepeat, 1 - b * BAND / FH]; },
    // uvs of a solid swatch color (band 6, 21 swatches of 24 px)
    swatchUV: function (name) {
      var i = SWATCH_NAMES.indexOf(name); if (i < 0) i = 0;
      var u = (i + 0.5) * SW / FW, v = 1 - (6 * BAND + BAND / 2) / FH;
      return [[u, v], [u, v], [u, v], [u, v]];
    },
    roof: function (style) { return Assets.facade(style).day; },

    // --------------------------------------------------------------- signs --
    // opts: neon, w (aspect), target (Both Sides Arms: concentric rings behind the text), gold (the President's
    // sign), brass (a plaque), banner (a hanging banner: tall aspect, text stacked)
    billboard: function (text, opts) {
      opts = opts || {};
      var variant = (opts.target ? 't' : '') + (opts.gold ? 'g' : '') + (opts.brass ? 'b' : '') + (opts.banner ? 'v' : '');
      var key = (opts.neon ? 'n:' : 'd:') + (opts.w || 2) + ':' + variant + ':' + text;
      if (Assets._signs[key]) return Assets._signs[key];
      var ar = opts.w || 2, W = 512, H = Math.round(W / ar), cv = canvas(W, H), ctx = cv.getContext('2d');
      var R = rngTex.fork(U.hash(text));
      var neon = !!opts.neon, color = opts.color || (neon ? R.pick(PAL.neon) : '#f4efe4');
      var bg = opts.bg || (neon ? '#0b0a12' : R.pick(['#1d2233', '#2c3e7a', '#8a2f2f', '#2f6b4a', '#4a3a6a', '#e8e2c8', '#c94040']));
      if (opts.gold) { bg = PAL.gold; color = '#2a2015'; neon = false; }
      if (opts.brass) { bg = '#8a6a2a'; color = '#2a2015'; neon = false; }
      if (opts.banner) { bg = R.pick(['#8a2f2f', '#2c3e7a', '#2f6b4a']); color = '#f4efe4'; }
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      if (opts.target) {
        // a neon target: concentric rings behind the words
        var ringC = neon ? R.pick(PAL.neon) : '#c94040';
        ctx.lineWidth = Math.max(4, H * 0.06); ctx.strokeStyle = ringC; ctx.globalAlpha = 0.55;
        if (neon) { ctx.shadowColor = ringC; ctx.shadowBlur = 16; }
        for (var rk = 1; rk <= 4; rk++) { ctx.beginPath(); ctx.arc(W / 2, H / 2, H * 0.11 * rk, 0, TAU); ctx.stroke(); }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      if (opts.gold || opts.brass) { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, W - 20, H - 20); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; ctx.strokeRect(16, 16, W - 32, H - 32); }
      if (!neon && !opts.gold && !opts.brass) {
        // printed poster: halftone dots + a border
        ctx.globalAlpha = 0.08; ctx.fillStyle = '#000';
        for (var y = 6; y < H; y += 12) for (var x = 6; x < W; x += 12) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, W - 16, H - 16);
        var light = U.hexToRgb(bg.replace('#', '')).reduce(function (a, b) { return a + b; }, 0) > 450;
        if (!opts.color) color = light ? '#1d2233' : '#f4efe4';
      }
      // fit text: shrink until it fits, wrap on long lines (a banner stacks every word)
      var words = String(text).split(' '), lines = opts.banner && words.length > 1 ? words.slice() : [text], size = Math.floor(H * (opts.banner ? 0.12 : 0.42));
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
    signMaterial: function (text, neon, ar, opts) {
      opts = opts || {};
      var variant = (opts.target ? 't' : '') + (opts.gold ? 'g' : '') + (opts.brass ? 'b' : '') + (opts.banner ? 'v' : '');
      var key = (neon ? 'n:' : 'd:') + (ar || 2) + ':' + variant + ':' + text;
      if (Assets._signMats[key]) return Assets._signMats[key];
      var tex = Assets.billboard(text, { neon: neon, w: ar || 2, target: opts.target, gold: opts.gold, brass: opts.brass, banner: opts.banner });
      // front face only: a double-sided plane reads mirrored from behind; the renderer adds a backing board where a back is visible
      var m = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: neon ? 0.5 : 0.1, side: THREE.FrontSide });
      m.userData.neon = !!neon;
      Assets._signMats[key] = m;
      return m;
    },

    // --------------------------------------------------------------- props --
    // The shared vertex-coloured PBR material for props, peds, weapons and pickups. A `glow` vertex attribute (0 by
    // default, so geometry without one is unaffected) makes a part emit its own colour: traffic-light lenses, lamp
    // heads, the hydrant's reflector. uGlow scales it (Render raises it at night).
    propMaterial: function () {
      if (!Assets._mats.prop) {
        var m = Assets._mats.prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.45 });
        m.name = 'prop';
        var glowU = { value: 0.35 };
        m.onBeforeCompile = function (sh) {
          sh.uniforms.uGlow = glowU;
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying float vGlow;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * uGlow;');
        };
        m.customProgramCacheKey = function () { return 'gtp-prop-glow'; };
        m.userData.glow = glowU;
      }
      return Assets._mats.prop;
    },
    propMaterialFar: function () {
      if (!Assets._mats.propFar) { Assets._mats.propFar = new THREE.MeshLambertMaterial({ vertexColors: true }); Assets._mats.propFar.name = 'propFar'; }
      return Assets._mats.propFar;
    },
    setPropGlow: function (k) { var m = Assets.propMaterial(); if (m.userData.glow) m.userData.glow.value = k; },
    prop: function (kind) {
      if (Assets._props[kind]) return Assets._props[kind];
      if (TREES[kind]) {
        var tg = TREES[kind](GTP.makeRng(U.hash('tree:' + kind)));
        return (Assets._props[kind] = { geometry: tg, material: Assets.treeMaterial(), materialFar: Assets.treeMaterialFar(), castShadow: true, foliage: true });
      }
      var fn = PROPS[kind] || PROPS.crate;
      var g = new GB({ color: true });
      g._glow = [];
      fn(g, GTP.makeRng(U.hash('prop:' + kind)));
      var geo = g.build();
      if (g._glow.length) {
        var arr = new Float32Array(geo.attributes.position.count);
        g._glow.forEach(function (rg) { for (var i = rg[0]; i < rg[1]; i++) arr[i] = rg[2]; });
        geo.setAttribute('glow', new THREE.BufferAttribute(arr, 1));
      }
      var rec = Assets._props[kind] = { geometry: geo, material: Assets.propMaterial(), castShadow: kind !== 'pool' && kind !== 'canopy' && kind !== 'edgelight' && kind !== 'beacon' };
      return rec;
    },
    // Foliage: leaf cards cut out of a leaf-cluster canvas (alpha tested, so the shadow map cuts the same holes), the
    // trunk on an opaque corner of it; the vertex colours carry the greens. The wind sways everything above 1.5 m by
    // the height and the tree's own position (Render drives uGtpTime / uGtpWind).
    treeUniforms: { uGtpTime: { value: 0 }, uGtpWind: { value: 0.6 } },
    leafTexture: function () {
      if (Assets._leafTex) return Assets._leafTex;
      var cv = canvas(256, 256), ctx = cv.getContext('2d'), R = rngTex.fork(0x1EAF);
      ctx.clearRect(0, 0, 256, 256);
      for (var i = 0; i < 150; i++) {
        var a = R.random() * TAU, r = Math.pow(R.random(), 0.6) * 84, x = 96 + Math.cos(a) * r, y = 96 + Math.sin(a) * r * 0.9;
        var t = 150 + Math.floor(R.random() * 105);
        ctx.fillStyle = 'rgb(' + Math.floor(t * 0.92) + ',' + t + ',' + Math.floor(t * 0.86) + ')';
        ctx.save(); ctx.translate(x, y); ctx.rotate(R.random() * TAU); ctx.beginPath(); ctx.ellipse(0, 0, 7 + R.random() * 6, 3 + R.random() * 2.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-6, -0.5, 12, 1); ctx.restore();
      }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(216, 0, 40, 256);   // the opaque strip (trunks, palm fronds)
      var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      Assets._leafTex = tex;
      return tex;
    },
    treeMaterial: function () {
      var M = Assets._mats;
      if (!M.tree) {
        var m = M.tree = new THREE.MeshStandardMaterial({ vertexColors: true, map: Assets.leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82, metalness: 0, envMapIntensity: 0.35 });
        m.name = 'tree';
        var TU = Assets.treeUniforms;
        m.onBeforeCompile = function (sh) {
          sh.uniforms.uGtpTime = TU.uGtpTime; sh.uniforms.uGtpWind = TU.uGtpWind;
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uGtpTime, uGtpWind;')
            .replace('#include <begin_vertex>', [
              '#include <begin_vertex>',
              '#ifdef USE_INSTANCING',
              'vec3 gIp = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );',
              '#else',
              'vec3 gIp = vec3( 0.0 );',
              '#endif',
              'float gSw = max( transformed.y - 1.5, 0.0 ) * 0.03 * uGtpWind;',
              'float gPh = uGtpTime * 1.3 + gIp.x * 0.37 + gIp.z * 0.21;',
              'transformed.x += sin( gPh ) * gSw + sin( uGtpTime * 3.7 + transformed.y * 2.0 + gIp.z ) * 0.025 * uGtpWind * step( 2.2, transformed.y );',
              'transformed.z += cos( gPh * 0.83 + 1.1 ) * gSw * 0.7;'
            ].join('\n'));
        };
        m.customProgramCacheKey = function () { return 'gtp-tree'; };
      }
      return M.tree;
    },
    treeMaterialFar: function () {
      var M = Assets._mats;
      if (!M.treeFar) { M.treeFar = new THREE.MeshLambertMaterial({ vertexColors: true, map: Assets.leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide }); M.treeFar.name = 'treeFar'; }
      return M.treeFar;
    },
    colorMaterial: function (hex) {
      var m = Assets._mats['c:' + hex];
      if (!m) m = Assets._mats['c:' + hex] = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.7, metalness: 0 });
      return m;
    },

    // ------------------------------------------------------------ vehicles --
    // Mesh-local frame: forward = -z, right = +x, up = +y, ground at y = 0.
    // Returns {body, groups, wheel, wheelRadius, wheelWidth, wheelOffsets[{x,z,steer}], lightPoints, doorPoints, size}.
    // Body geometry groups (material slots): paint 0, detail 1, glass 2, head 3, tail 4, barRed 5, barBlue 6, wrap 7, chrome 8.
    GROUPS: { paint: 0, detail: 1, glass: 2, head: 3, tail: 4, barRed: 5, barBlue: 6, wrap: 7, chrome: 8 },
    vehicleGeometry: function (cls, wrap) {
      var key = cls + (wrap ? ':' + wrap : '');
      if (Assets._vehicles[key]) return Assets._vehicles[key];
      var spec = C.VEHICLES[cls] || C.VEHICLES.sedan;
      if (!C.VEHICLES[cls]) cls = 'sedan';
      var L = spec.length, Wd = spec.width, H = spec.height, wr = spec.wheelRadius, hl = L / 2, hw = Wd / 2;
      var G = { paint: new GB({ color: true }), detail: new GB({ color: true }), glass: new GB({ color: true }), head: new GB({ color: true }), tail: new GB({ color: true }), barRed: new GB({ color: true }), barBlue: new GB({ color: true }), wrap: new GB({ color: true }), chrome: new GB({ color: true }) };
      var WHITE = [1, 1, 1], GLASS = [0.42, 0.55, 0.66], DARK = [0.12, 0.12, 0.14], CHROME = [0.8, 0.82, 0.86], NAVY = [0.14, 0.2, 0.42], AMBER = [1, 0.72, 0.15], LGREY = [0.86, 0.86, 0.84], RED = [1, 0.12, 0.08], HEADC = [1, 0.97, 0.82], BLUE = [0.2, 0.45, 1];
      var SEAT = [0.16, 0.15, 0.16], DASH = [0.1, 0.1, 0.11], PLATE = [0.92, 0.9, 0.82];
      var y0 = wr * 0.85;
      var ww = cls === 'bike' ? 0.1 : (cls === 'truck' || cls === 'bus') ? 0.3 : cls === 'suv' ? 0.26 : 0.22;
      function box(g, x, y, z, w, h, d, col, faces) { g.box(x, y, z, w, h, d, GB.UV0, col, faces); }
      function cbox(g, x, y, z, w, h, d, b, col, faces) { chamferBox(g, x, y, z, w, h, d, b, col, faces); }
      // a dark lamp housing behind each lens, a plate with a frame, a chrome exhaust tip, door seams and handles
      function housings(ly, lw, lh, inset, zf, zb) {
        zf = zf == null ? -hl : zf; zb = zb == null ? hl : zb;
        box(Dt, -hw + inset - 0.03, ly - 0.03, zf + 0.02, lw + 0.06, lh + 0.06, 0.1, DARK); box(Dt, hw - inset - lw - 0.03, ly - 0.03, zf + 0.02, lw + 0.06, lh + 0.06, 0.1, DARK);
        box(Dt, -hw + inset - 0.02, ly - 0.02, zb - 0.12, lw + 0.04, lh * 0.85 + 0.04, 0.1, DARK); box(Dt, hw - inset - lw - 0.02, ly - 0.02, zb - 0.12, lw + 0.04, lh * 0.85 + 0.04, 0.1, DARK);
      }
      function plates(y, zf, zb) {
        zf = zf == null ? -hl : zf; zb = zb == null ? hl : zb;
        box(Dt, -0.2, y - 0.01, zb - 0.02, 0.4, 0.14, 0.03, DARK); box(Dt, -0.18, y, zb, 0.36, 0.12, 0.02, PLATE); box(Dt, -0.12, y + 0.045, zb + 0.015, 0.24, 0.03, 0.01, [0.2, 0.25, 0.45]);
        box(Dt, -0.2, y - 0.01, zf - 0.01, 0.4, 0.14, 0.03, DARK); box(Dt, -0.18, y, zf - 0.02, 0.36, 0.12, 0.02, PLATE);
      }
      function seams(zb0, zb1, yb, yt) {
        var zm = (zb0 + zb1) / 2 + 0.05, seam = [0.06, 0.06, 0.07];
        box(Dt, -hw - 0.004, yb, zm - 0.012, 0.01, yt - yb, 0.024, seam); box(Dt, hw - 0.006, yb, zm - 0.012, 0.01, yt - yb, 0.024, seam);
        box(Dt, -hw - 0.004, yb, zb0 - 0.012, 0.01, yt - yb, 0.024, seam); box(Dt, hw - 0.006, yb, zb0 - 0.012, 0.01, yt - yb, 0.024, seam);
        var hy = yb + (yt - yb) * 0.55;
        box(G.chrome, -hw - 0.02, hy, zm - 0.28, 0.025, 0.04, 0.2, CHROME); box(G.chrome, hw - 0.005, hy, zm - 0.28, 0.025, 0.04, 0.2, CHROME);
        box(G.chrome, -hw - 0.02, hy, zb1 - 0.75, 0.025, 0.04, 0.2, CHROME); box(G.chrome, hw - 0.005, hy, zb1 - 0.75, 0.025, 0.04, 0.2, CHROME);
      }
      function beltline(y, zf, zb) { box(G.chrome, -hw - 0.012, y, zf, 0.016, 0.035, zb - zf, CHROME); box(G.chrome, hw - 0.004, y, zf, 0.016, 0.035, zb - zf, CHROME); }
      function exhaust(x, y) { G.chrome.cylinder(x, y, hl - 0.2, 0.045, 0.045, 0.3, 7, CHROME, null, false); }
      function interior(zb0, zb1, yFloor, rows) {
        // seats and a dash seen through the glass; a steering wheel on the left
        var sw = Math.min(0.5, Wd * 0.28);
        for (var r = 0; r < rows; r++) {
          var sz = zb0 + 0.75 + r * 0.9;
          box(Dt, -hw + 0.3, yFloor, sz, sw, 0.3, 0.5, SEAT); box(Dt, hw - 0.3 - sw, yFloor, sz, sw, 0.3, 0.5, SEAT);
          box(Dt, -hw + 0.3, yFloor + 0.3, sz + 0.35, sw, 0.5, 0.14, SEAT); box(Dt, hw - 0.3 - sw, yFloor + 0.3, sz + 0.35, sw, 0.5, 0.14, SEAT);
        }
        box(Dt, -hw + 0.12, yFloor + 0.45, zb0 + 0.05, Wd - 0.24, 0.22, 0.4, DASH);
        G.chrome.cylinder(-hw + 0.55, yFloor + 0.62, zb0 + 0.5, 0.17, 0.17, 0.03, 10, DARK);
        void zb1;
      }
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
      function pillars(zb0, zb1, yb, yt) {
        var zm = (zb0 + zb1) / 2;
        box(P, -hw + 0.08, yb, zm - 0.05, 0.05, yt - yb, 0.1, WHITE); box(P, hw - 0.13, yb, zm - 0.05, 0.05, yt - yb, 0.1, WHITE);
      }
      var cab = null;   // cabin extents for door/light placement
      if (cls === 'sedan' || cls === 'cop' || cls === 'taxi') {
        var bh = 0.55;
        cbox(P, -hw, y0, -hl, Wd, bh, L, 0.08, WHITE, GB.NO_BOTTOM);
        cab = { zb0: -hl + 1.55, zb1: hl - 0.95 };
        cbox(P, -hw + 0.02, y0 + bh - 0.02, -hl + 0.1, Wd - 0.04, 0.19, cab.zb0 + hl - 0.1 + 0.2, 0.05, WHITE, GB.NO_BOTTOM);      // hood
        cbox(P, -hw + 0.02, y0 + bh - 0.02, cab.zb1 - 0.2, Wd - 0.04, 0.17, hl - cab.zb1 + 0.1, 0.05, WHITE, GB.NO_BOTTOM);        // trunk
        interior(cab.zb0, cab.zb1, y0 + bh - 0.05, 2);
        prism(-hw + 0.1, hw - 0.1, y0 + bh + 0.17, H, cab.zb0, cab.zb1, cab.zb0 + 0.8, cab.zb1 - 0.45, 0.1, glassCab);
        pillars(cab.zb0 + 0.3, cab.zb1 - 0.1, y0 + bh + 0.17, H - 0.03);
        bumpers(0.24); underbody(); mirrors(cab.zb0 + 0.1, y0 + bh + 0.3); plates(y0 + 0.2);
        seams(cab.zb0, cab.zb1, y0 + 0.08, y0 + bh - 0.02); beltline(y0 + bh - 0.06, -hl + 0.3, hl - 0.3); exhaust(hw - 0.4, y0 - 0.02);
        box(Dt, -0.45, y0 + 0.2, -hl - 0.02, 0.9, 0.22, 0.05, DARK);   // grille
        for (var gk = 0; gk < 3; gk++) box(G.chrome, -0.42, y0 + 0.23 + gk * 0.07, -hl - 0.03, 0.84, 0.02, 0.02, CHROME);
        housings(y0 + 0.36, 0.36, 0.16, 0.14);
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
        cbox(P, -hw, y0, -hl, Wd, 0.4, L, 0.07, WHITE, GB.NO_BOTTOM);
        cab = { zb0: -hl + 1.75, zb1: hl - 1.05 };
        prism(-hw, hw, y0 + 0.4, y0 + 0.62, -hl + 0.05, hl - 0.05, cab.zb0 - 0.05, hl - 0.05, 0.02, { front: [P, WHITE], back: [P, WHITE], left: [P, WHITE], right: [P, WHITE], top: [P, WHITE] });
        interior(cab.zb0, cab.zb1, y0 + 0.4, 1);
        prism(-hw + 0.12, hw - 0.12, y0 + 0.62, H, cab.zb0, cab.zb1, cab.zb0 + 0.95, cab.zb1 - 0.3, 0.12, glassCab);
        pillars(cab.zb0 + 0.5, cab.zb1, y0 + 0.62, H - 0.03);
        box(Dt, -hw + 0.1, H - 0.22, hl - 0.5, 0.08, 0.2, 0.3, DARK); box(Dt, hw - 0.18, H - 0.22, hl - 0.5, 0.08, 0.2, 0.3, DARK);
        cbox(P, -hw + 0.05, H - 0.06, hl - 0.6, Wd - 0.1, 0.06, 0.4, 0.02, WHITE);   // wing
        box(Dt, -hw + 0.1, y0 - 0.08, -hl - 0.12, Wd - 0.2, 0.2, 0.2, DARK);  // splitter
        box(Dt, -hw - 0.02, y0 - 0.06, -hl + 0.9, 0.06, 0.12, L - 1.8, DARK); box(Dt, hw - 0.04, y0 - 0.06, -hl + 0.9, 0.06, 0.12, L - 1.8, DARK);   // skirts
        bumpers(0.18); underbody(); mirrors(cab.zb0 + 0.15, y0 + 0.7); plates(y0 + 0.14);
        seams(cab.zb0, cab.zb1, y0 + 0.06, y0 + 0.38); exhaust(-0.3, y0 - 0.04); exhaust(0.3, y0 - 0.04);
        box(Dt, -0.5, y0 + 0.08, -hl - 0.02, 1.0, 0.2, 0.05, DARK);
        box(G.chrome, -0.48, y0 + 0.16, -hl - 0.03, 0.96, 0.02, 0.02, CHROME);
        housings(y0 + 0.34, 0.42, 0.12, 0.12);
        lights(y0 + 0.34, 0.42, 0.12, 0.12);
      } else if (cls === 'suv') {
        cbox(P, -hw, y0, -hl, Wd, 0.72, L, 0.09, WHITE, GB.NO_BOTTOM);
        cab = { zb0: -hl + 1.45, zb1: hl - 0.15 };
        cbox(P, -hw + 0.03, y0 + 0.7, -hl + 0.08, Wd - 0.06, 0.28, cab.zb0 + hl + 0.1, 0.05, WHITE, GB.NO_BOTTOM);       // hood
        interior(cab.zb0, cab.zb1, y0 + 0.7, 2);
        prism(-hw + 0.06, hw - 0.06, y0 + 0.98, H, cab.zb0, cab.zb1, cab.zb0 + 0.55, cab.zb1 - 0.08, 0.08, glassCab);
        pillars(cab.zb0 + 0.3, cab.zb1 - 1.2, y0 + 0.98, H - 0.03); pillars(cab.zb0 + 1.9, cab.zb1 + 0.4, y0 + 0.98, H - 0.03);
        box(G.chrome, -hw + 0.25, H - 0.02, cab.zb0 + 0.6, 0.08, 0.1, cab.zb1 - cab.zb0 - 0.9, CHROME); box(G.chrome, hw - 0.33, H - 0.02, cab.zb0 + 0.6, 0.08, 0.1, cab.zb1 - cab.zb0 - 0.9, CHROME);   // roof rails
        box(G.chrome, -hw - 0.1, y0 + 0.05, -hl + 1.3, 0.12, 0.08, L - 2.6, CHROME); box(G.chrome, hw - 0.02, y0 + 0.05, -hl + 1.3, 0.12, 0.08, L - 2.6, CHROME);   // side steps
        bumpers(0.3); underbody(); mirrors(cab.zb0 + 0.1, y0 + 1.1); plates(y0 + 0.3);
        seams(cab.zb0, cab.zb1, y0 + 0.1, y0 + 0.7); exhaust(hw - 0.45, y0);
        box(Dt, -0.55, y0 + 0.28, -hl - 0.02, 1.1, 0.34, 0.05, DARK);
        for (var sk = 0; sk < 4; sk++) box(G.chrome, -0.52, y0 + 0.31 + sk * 0.08, -hl - 0.03, 1.04, 0.025, 0.02, CHROME);
        housings(y0 + 0.5, 0.34, 0.2, 0.14);
        lights(y0 + 0.5, 0.34, 0.2, 0.14);
      } else if (cls === 'truck') {
        var cabL = 2.5;
        box(Dt, -hw + 0.2, y0 - 0.1, -hl + 0.3, Wd - 0.4, 0.34, L - 0.6, DARK);                        // chassis rails
        cbox(P, -hw + 0.05, y0, -hl, Wd - 0.1, 1.0, 1.5, 0.08, WHITE);                                    // hood
        cab = { zb0: -hl + 1.3, zb1: -hl + cabL };
        prism(-hw + 0.05, hw - 0.05, y0 + 1.0, y0 + 2.1, cab.zb0, cab.zb1, cab.zb0 + 0.35, cab.zb1, 0.06, { front: [Gl, GLASS], back: [P, WHITE], left: [Gl, GLASS], right: [Gl, GLASS], top: [P, WHITE] });
        box(P, -hw + 0.05, y0, cab.zb0, Wd - 0.1, 1.0, cabL - 1.3, WHITE);                               // cab lower
        pillars(cab.zb0 + 0.6, cab.zb1 - 0.05, y0 + 1.0, y0 + 2.08);
        cbox(Dt, -hw, y0 + 0.3, -hl + cabL + 0.3, Wd, H - y0 - 0.3, L - cabL - 0.4, 0.06, LGREY);         // cargo box
        for (var rk = 0; rk < 5; rk++) box(Dt, -hw - 0.01, y0 + 0.6 + rk * 0.5, -hl + cabL + 0.4, 0.015, 0.06, L - cabL - 0.6, [0.72, 0.72, 0.7]);   // panel ribs (left)
        for (rk = 0; rk < 5; rk++) box(Dt, hw - 0.005, y0 + 0.6 + rk * 0.5, -hl + cabL + 0.4, 0.015, 0.06, L - cabL - 0.6, [0.72, 0.72, 0.7]);
        box(Dt, -0.03, y0 + 0.4, hl - 0.11, 0.06, H - y0 - 0.6, 0.03, DARK);                               // rear door seam
        G.chrome.cylinder(-0.3, y0 + 2.14, cab.zb0 + 0.3, 0.07, 0.07, 1.2, 7, CHROME, null, false);         // exhaust stack
        box(G.chrome, -hw + 0.3, y0 + 0.05, -hl - 0.15, Wd - 0.6, 0.4, 0.2, CHROME);                       // front bumper
        box(Dt, -0.6, y0 + 0.35, -hl - 0.02, 1.2, 0.5, 0.05, DARK);                                        // grille
        for (var tk = 0; tk < 5; tk++) box(G.chrome, -0.58, y0 + 0.4 + tk * 0.09, -hl - 0.03, 1.16, 0.03, 0.02, CHROME);
        mirrors(cab.zb0, y0 + 1.5); plates(y0 + 0.2);
        housings(y0 + 0.5, 0.36, 0.22, 0.2, -hl, hl);
        lights(y0 + 0.5, 0.36, 0.22, 0.2, -hl, hl);
      } else if (cls === 'van') {
        var noseL = 1.15;
        cbox(P, -hw + 0.02, y0, -hl, Wd - 0.04, 0.85, noseL + 0.1, 0.07, WHITE, GB.NO_BOTTOM);             // nose
        cbox(P, -hw, y0, -hl + noseL, Wd, H - y0, L - noseL, 0.08, WHITE, GB.NO_BOTTOM);                   // body
        prism(-hw + 0.02, hw - 0.02, y0 + 0.85, H, -hl + 0.3, -hl + noseL, -hl + noseL - 0.05, -hl + noseL, 0.0, { front: [Gl, GLASS], back: [P, WHITE], left: [P, WHITE], right: [P, WHITE], top: [P, WHITE] });
        box(Gl, -hw - 0.01, y0 + 1.05, -hl + noseL + 0.08, 0.03, H - y0 - 1.45, 1.0, GLASS); box(Gl, hw - 0.02, y0 + 1.05, -hl + noseL + 0.08, 0.03, H - y0 - 1.45, 1.0, GLASS);   // cab windows
        box(Dt, -0.02, y0 + 0.3, hl - 0.11, 0.04, H - y0 - 0.5, 0.03, DARK);                               // rear doors seam
        box(Dt, -hw + 0.3, y0 + 0.5, hl - 0.11, 0.3, 0.3, 0.03, GLASS); box(Dt, hw - 0.6, y0 + 0.5, hl - 0.11, 0.3, 0.3, 0.03, GLASS);
        box(Dt, -hw - 0.004, y0 + 0.2, -hl + noseL + 1.15, 0.01, H - y0 - 0.5, 0.024, [0.06, 0.06, 0.07]); box(Dt, hw - 0.006, y0 + 0.2, -hl + noseL + 1.15, 0.01, H - y0 - 0.5, 0.024, [0.06, 0.06, 0.07]);   // sliding door seam
        bumpers(0.26); underbody(); mirrors(-hl + noseL + 0.05, y0 + 1.25); plates(y0 + 0.2);
        beltline(y0 + 0.42, -hl + noseL + 0.1, hl - 0.2); exhaust(hw - 0.5, y0 - 0.02);
        box(Dt, -0.5, y0 + 0.25, -hl - 0.02, 1.0, 0.3, 0.05, DARK);
        box(G.chrome, -0.48, y0 + 0.38, -hl - 0.03, 0.96, 0.03, 0.02, CHROME);
        housings(y0 + 0.4, 0.34, 0.2, 0.15);
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
        cbox(P, -hw, y0, -hl, Wd, H - y0 - 0.12, L, 0.1, WHITE, GB.NO_BOTTOM);
        cbox(P, -hw + 0.1, H - 0.14, -hl + 0.3, Wd - 0.2, 0.14, L - 0.6, 0.05, WHITE);                      // roof
        plates(y0 + 0.25); beltline(y0 + 1.18, -hl + 0.2, hl - 0.2);
        for (var bk = 0; bk < 8; bk++) { var bz = -hl + 1.5 + bk * (winL + gap) + 0.2; box(Dt, -hw + 0.35, y0 + 0.65, bz, 0.5, 0.3, 0.45, SEAT); box(Dt, hw - 0.85, y0 + 0.65, bz, 0.5, 0.3, 0.45, SEAT); box(Dt, -hw + 0.35, y0 + 0.95, bz + 0.33, 0.5, 0.5, 0.12, SEAT); box(Dt, hw - 0.85, y0 + 0.95, bz + 0.33, 0.5, 0.5, 0.12, SEAT); }
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
      var order = ['paint', 'detail', 'glass', 'head', 'tail', 'barRed', 'barBlue', 'wrap', 'chrome'], parts = [], ranges = [];
      order.forEach(function (name, gi) {
        var gb = G[name]; if (!gb.count()) return;
        var geo = gb.build(); parts.push(geo); ranges.push({ gi: gi, count: geo.getIndex().count });
      });
      var body = GB.merge(parts), start = 0;
      body.clearGroups();
      ranges.forEach(function (r) { body.addGroup(start, r.count, r.gi); start += r.count; });
      // wheels: a tyre around the x axis with a dished rim, spokes and a hub; one geometry, one draw per car (the rim is
      // vertex-coloured light alloy rather than a second chrome material: forty cars is forty draw calls saved)
      var wg = new GB({ color: true });
      wheelAxle(wg, wg, wr, ww, DARK, [0.86, 0.87, 0.9], cls === 'bike' ? 8 : 14);
      var wheelGeo = wg.build();
      var wx = cls === 'bike' ? 0 : hw - ww * 0.5 + 0.02, fz = -(hl - L * 0.2), bz = hl - L * 0.2;
      var wheelOffsets;
      if (cls === 'bike') wheelOffsets = [{ x: 0, z: -0.72, steer: true }, { x: 0, z: 0.72, steer: false }];
      else if (cls === 'truck') wheelOffsets = [{ x: -wx, z: -hl + 1.0, steer: true }, { x: wx, z: -hl + 1.0, steer: true }, { x: -wx, z: hl - 1.0, steer: false }, { x: wx, z: hl - 1.0, steer: false }, { x: -wx, z: hl - 2.3, steer: false }, { x: wx, z: hl - 2.3, steer: false }];
      else if (cls === 'bus') wheelOffsets = [{ x: -wx, z: -hl + 1.7, steer: true }, { x: wx, z: -hl + 1.7, steer: true }, { x: -wx, z: hl - 2.4, steer: false }, { x: wx, z: hl - 2.4, steer: false }];
      else wheelOffsets = [{ x: -wx, z: fz, steer: true }, { x: wx, z: fz, steer: true }, { x: -wx, z: bz, steer: false }, { x: wx, z: bz, steer: false }];
      var ly = cls === 'bike' ? 0.78 : cls === 'truck' ? y0 + 0.6 : y0 + 0.45;
      var rec = Assets._vehicles[key] = {
        body: body, groups: Assets.GROUPS, wheel: wheelGeo, wheelRadius: wr, wheelWidth: ww, wheelOffsets: wheelOffsets,
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
      var shoe = [0.13, 0.13, 0.15], shoeSole = [0.06, 0.06, 0.07], pantsDark = shade3(pants, -0.18), shirtDark = shade3(shirt, -0.2);
      var legH = 0.84, torsoH = 0.6, headR = 0.14, hy = torsoH + 0.05 + 0.15;   // head centre in torso space
      function mesh(name, geo, x, y, z) { var m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.userData.own = false; if (x != null) m.position.set(x, y, z); return m; }
      function pivot(name, x, y, z) { var p = new THREE.Group(); p.name = name; p.position.set(x, y, z); return p; }
      // legs: a rounded thigh and shin (the knee a shade darker), a shoe with a sole
      var legGeo = pedGeo('leg:' + look.pants, function (L) {
        L.push(gcbox(-0.085, -legH * 0.52, -0.1, 0.17, legH * 0.52 - 0.02, 0.2, pants, 0.035));
        L.push(gcbox(-0.08, -legH, -0.095, 0.16, legH * 0.5, 0.19, pantsDark, 0.03));
        L.push(gcbox(-0.09, -legH, -0.16, 0.18, 0.075, 0.3, shoe, 0.025));
        L.push(gbox(-0.092, -legH - 0.004, -0.165, 0.184, 0.022, 0.31, shoeSole));
      });
      var legL = pivot('legL', -0.11, legH, 0), legR = pivot('legR', 0.11, legH, 0);
      legL.add(mesh('legLMesh', legGeo)); legR.add(mesh('legRMesh', legGeo));
      g.add(legL); g.add(legR);
      // torso pivot at the hip
      var torso = pivot('torso', 0, legH, 0);
      var torsoKey = ['torso', look.shirt, look.tie, look.extra, look.uniform, look.badge, look.skin].join('|');
      var torsoGeo = pedGeo(torsoKey, function (L) {
        L.push(gcbox(-0.22, 0, -0.125, 0.44, torsoH, 0.25, shirt, 0.045));       // the chest, rounded
        L.push(gcbox(-0.2, 0, -0.115, 0.4, 0.14, 0.23, pants, 0.03));            // the waistband
        L.push(gbox(-0.205, 0.13, -0.12, 0.41, 0.035, 0.24, [0.14, 0.1, 0.08]));  // the belt
        L.push(gbox(-0.025, 0.133, -0.125, 0.05, 0.03, 0.01, [0.75, 0.65, 0.3])); // the buckle
        L.push(gbox(-0.09, torsoH - 0.05, -0.135, 0.18, 0.05, 0.012, shirtDark));   // the collar
        L.push(gbox(-0.015, 0.16, -0.13, 0.03, torsoH - 0.24, 0.008, shirtDark));   // the placket
        L.push(gcbox(-0.06, torsoH - 0.01, -0.06, 0.12, 0.08, 0.12, skin, 0.02));   // neck
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
          L.push(gcbox(-0.07, -0.3, -0.075, 0.14, 0.3, 0.15, shirt, 0.035));            // upper arm
          L.push(gcbox(-0.062, -0.56, -0.067, 0.124, 0.28, 0.134, shirt, 0.03));         // forearm (sleeve)
          L.push(gbox(-0.066, -0.54, -0.07, 0.132, 0.025, 0.14, shirtDark));              // the cuff
          L.push(gcbox(-0.055, -0.67, -0.055, 0.11, 0.12, 0.11, skin, 0.025));           // hand
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
        var ht = 0.15, skinD = shade3(skin, -0.22), browC = shade3(hair, -0.1);   // half height
        L.push(gcbox(-headR, -ht, -headR, headR * 2, ht * 2, headR * 2, skin, 0.04));
        L.push(gcbox(-headR - 0.014, -0.03, -0.05, 0.016, 0.06, 0.04, skin, 0.008)); L.push(gcbox(headR - 0.002, -0.03, -0.05, 0.016, 0.06, 0.04, skin, 0.008));   // ears
        // eyes: whites, pupils, brows; a nose with a bridge; lips a shade darker than the skin
        L.push(gbox(-0.075, 0.0, -headR - 0.004, 0.045, 0.034, 0.006, [0.93, 0.93, 0.9])); L.push(gbox(0.03, 0.0, -headR - 0.004, 0.045, 0.034, 0.006, [0.93, 0.93, 0.9]));
        L.push(gbox(-0.062, 0.004, -headR - 0.008, 0.02, 0.024, 0.006, [0.08, 0.08, 0.1])); L.push(gbox(0.042, 0.004, -headR - 0.008, 0.02, 0.024, 0.006, [0.08, 0.08, 0.1]));
        L.push(gbox(-0.08, 0.045, -headR - 0.005, 0.055, 0.012, 0.006, browC)); L.push(gbox(0.025, 0.045, -headR - 0.005, 0.055, 0.012, 0.006, browC));
        L.push(gcbox(-0.018, -0.045, -headR - 0.022, 0.036, 0.055, 0.024, skin, 0.008));   // nose
        L.push(gbox(-0.045, -0.095, -headR - 0.004, 0.09, 0.014, 0.005, [0.5, 0.24, 0.22]));   // mouth
        L.push(gbox(-0.05, -0.108, -headR - 0.003, 0.1, 0.008, 0.004, skinD));
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
  function gcbox(x, y, z, w, h, d, col, b) { var g = new GB({ color: true }); chamferBox(g, x, y, z, w, h, d, b || 0.03, col); return g.build(); }
  function shade3(col, k) { return k < 0 ? [col[0] * (1 + k), col[1] * (1 + k), col[2] * (1 + k)] : [col[0] + (1 - col[0]) * k, col[1] + (1 - col[1]) * k, col[2] + (1 - col[2]) * k]; }
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
  // a chamfered box (bevel b on every edge): six inset faces, twelve edge strips and eight corner caps, each
  // wound so its normal points away from the box centre. The bevels catch the sun and the sky reflection along the
  // panel lines, which is most of what separates a car body from a crate.
  function chamferBox(g, x, y, z, w, h, d, b, col, faces) {
    b = Math.min(b, w / 3, h / 3, d / 3);
    var x1 = x + w, y1 = y + h, z1 = z + d, cx = x + w / 2, cy = y + h / 2, cz = z + d / 2, f = faces || GB.ALL_FACES;
    function oq(a, bb, c, dd) {
      var ux = bb[0] - a[0], uy = bb[1] - a[1], uz = bb[2] - a[2], vx = dd[0] - a[0], vy = dd[1] - a[1], vz = dd[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var mx = (a[0] + bb[0] + c[0] + dd[0]) / 4 - cx, my = (a[1] + bb[1] + c[1] + dd[1]) / 4 - cy, mz = (a[2] + bb[2] + c[2] + dd[2]) / 4 - cz;
      if (nx * mx + ny * my + nz * mz < 0) g.quad(a, dd, c, bb, GB.UV0, col); else g.quad(a, bb, c, dd, GB.UV0, col);
    }
    // faces
    oq([x + b, y1, z + b], [x1 - b, y1, z + b], [x1 - b, y1, z1 - b], [x + b, y1, z1 - b]);
    if (f.bottom) oq([x + b, y, z + b], [x1 - b, y, z + b], [x1 - b, y, z1 - b], [x + b, y, z1 - b]);
    oq([x + b, y + b, z], [x1 - b, y + b, z], [x1 - b, y1 - b, z], [x + b, y1 - b, z]);
    oq([x + b, y + b, z1], [x1 - b, y + b, z1], [x1 - b, y1 - b, z1], [x + b, y1 - b, z1]);
    oq([x, y + b, z + b], [x, y + b, z1 - b], [x, y1 - b, z1 - b], [x, y1 - b, z + b]);
    oq([x1, y + b, z + b], [x1, y + b, z1 - b], [x1, y1 - b, z1 - b], [x1, y1 - b, z + b]);
    // top and bottom edge strips
    [[y1, y1 - b], [y, y + b]].forEach(function (yy, k) {
      if (k === 1 && !f.bottom) return;
      var ya = yy[0], yb = yy[1];
      oq([x + b, ya, z + b], [x1 - b, ya, z + b], [x1 - b, yb, z], [x + b, yb, z]);
      oq([x + b, ya, z1 - b], [x1 - b, ya, z1 - b], [x1 - b, yb, z1], [x + b, yb, z1]);
      oq([x + b, ya, z + b], [x + b, ya, z1 - b], [x, yb, z1 - b], [x, yb, z + b]);
      oq([x1 - b, ya, z + b], [x1 - b, ya, z1 - b], [x1, yb, z1 - b], [x1, yb, z + b]);
    });
    // vertical edge strips
    oq([x, y + b, z + b], [x, y1 - b, z + b], [x + b, y1 - b, z], [x + b, y + b, z]);
    oq([x1, y + b, z + b], [x1, y1 - b, z + b], [x1 - b, y1 - b, z], [x1 - b, y + b, z]);
    oq([x, y + b, z1 - b], [x, y1 - b, z1 - b], [x + b, y1 - b, z1], [x + b, y + b, z1]);
    oq([x1, y + b, z1 - b], [x1, y1 - b, z1 - b], [x1 - b, y1 - b, z1], [x1 - b, y + b, z1]);
    // corner caps (a degenerate quad = one triangle)
    [[x, x + b, 1], [x1, x1 - b, -1]].forEach(function (xx) {
      [[z, z + b], [z1, z1 - b]].forEach(function (zz) {
        oq([xx[1], y1, zz[1]], [xx[0], y1 - b, zz[1]], [xx[1], y1 - b, zz[0]], [xx[1], y1 - b, zz[0]]);
        if (f.bottom) oq([xx[1], y, zz[1]], [xx[0], y + b, zz[1]], [xx[1], y + b, zz[0]], [xx[1], y + b, zz[0]]);
      });
    });
  }
  // wheel: a tyre (g) with a sidewall and tread groove, and a chrome rim with spokes and a hub (gr), around the x axis
  function wheelAxle(g, gr, r, w, tire, hub, segs) {
    segs = segs || 12;
    var hx = w / 2, ri = r * 0.62, i, a0, a1, y0, z0, y1, z1, rubber2 = [0.09, 0.09, 0.1], spokeDark = [0.3, 0.31, 0.34];
    for (i = 0; i < segs; i++) {
      a0 = i / segs * TAU; a1 = (i + 1) / segs * TAU;
      y0 = Math.cos(a0) * r; z0 = Math.sin(a0) * r; y1 = Math.cos(a1) * r; z1 = Math.sin(a1) * r;
      // tread: two bands with a groove between
      g.quad([-hx, y0, z0], [-hx, y1, z1], [-hx * 0.3, y1, z1], [-hx * 0.3, y0, z0], GB.UV0, i % 2 ? tire : rubber2);
      g.quad([-hx * 0.3, y0 * 0.985, z0 * 0.985], [-hx * 0.3, y1 * 0.985, z1 * 0.985], [hx * 0.3, y1 * 0.985, z1 * 0.985], [hx * 0.3, y0 * 0.985, z0 * 0.985], GB.UV0, rubber2);
      g.quad([hx * 0.3, y0, z0], [hx * 0.3, y1, z1], [hx, y1, z1], [hx, y0, z0], GB.UV0, i % 2 ? tire : rubber2);
      // sidewalls (tyre) out to the rim radius
      var s0 = g.vertex(hx, y0 * ri / r, z0 * ri / r, 1, 0, 0, 0, 0, tire), s1 = g.vertex(hx, y0, z0, 1, 0, 0, 0, 0, tire), s2 = g.vertex(hx, y1, z1, 1, 0, 0, 0, 0, tire), s3 = g.vertex(hx, y1 * ri / r, z1 * ri / r, 1, 0, 0, 0, 0, tire);
      g.idx.push(s0, s1, s2, s0, s2, s3);
      var t0 = g.vertex(-hx, y0 * ri / r, z0 * ri / r, -1, 0, 0, 0, 0, tire), t1 = g.vertex(-hx, y0, z0, -1, 0, 0, 0, 0, tire), t2 = g.vertex(-hx, y1, z1, -1, 0, 0, 0, 0, tire), t3 = g.vertex(-hx, y1 * ri / r, z1 * ri / r, -1, 0, 0, 0, 0, tire);
      g.idx.push(t0, t2, t1, t0, t3, t2);
      // rim: a dished disc (spokes alternate chrome / dark) with a hub cap, a hair proud of the sidewall
      var spoke = (i % 2 === 0) ? hub : spokeDark, px = hx + 0.008, hr = r * 0.2;
      var p0 = gr.vertex(px + 0.01, y0 * hr / r, z0 * hr / r, 1, 0, 0, 0, 0, spoke), p1 = gr.vertex(px, y0 * ri / r, z0 * ri / r, 1, 0, 0, 0, 0, spoke), p2 = gr.vertex(px, y1 * ri / r, z1 * ri / r, 1, 0, 0, 0, 0, spoke), p3 = gr.vertex(px + 0.01, y1 * hr / r, z1 * hr / r, 1, 0, 0, 0, 0, spoke);
      gr.idx.push(p0, p1, p2, p0, p2, p3);
      var c0 = gr.vertex(px + 0.015, 0, 0, 1, 0, 0, 0, 0, hub), c1 = gr.vertex(px + 0.01, y0 * hr / r, z0 * hr / r, 1, 0, 0, 0, 0, hub), c2 = gr.vertex(px + 0.01, y1 * hr / r, z1 * hr / r, 1, 0, 0, 0, 0, hub);
      gr.idx.push(c0, c1, c2);
      var q0 = gr.vertex(-px - 0.01, y0 * hr / r, z0 * hr / r, -1, 0, 0, 0, 0, spoke), q1 = gr.vertex(-px, y0 * ri / r, z0 * ri / r, -1, 0, 0, 0, 0, spoke), q2 = gr.vertex(-px, y1 * ri / r, z1 * ri / r, -1, 0, 0, 0, 0, spoke), q3 = gr.vertex(-px - 0.01, y1 * hr / r, z1 * hr / r, -1, 0, 0, 0, 0, spoke);
      gr.idx.push(q0, q2, q1, q0, q3, q2);
      var d0 = gr.vertex(-px - 0.015, 0, 0, -1, 0, 0, 0, 0, hub), d1 = gr.vertex(-px - 0.01, y0 * hr / r, z0 * hr / r, -1, 0, 0, 0, 0, hub), d2 = gr.vertex(-px - 0.01, y1 * hr / r, z1 * hr / r, -1, 0, 0, 0, 0, hub);
      gr.idx.push(d0, d2, d1);
    }
  }

  // ====================================================================== ground tiles
  // Each draws a 4 m tile into a 240 px square. "Top" of the cell is north at rotation 0.
  function asphaltBase(ctx, S, R, tone) {
    ctx.fillStyle = tone || PAL.asphalt; ctx.fillRect(0, 0, S, S);
    // aggregate: fine grit in two tones plus a few lighter stones
    speckle(ctx, S, S, 0.06, 'rgba(255,255,255,0.07)', 'rgba(0,0,0,0.16)', R);
    for (var i = 0; i < 70; i++) { ctx.fillStyle = 'rgba(200,200,205,' + (0.06 + R.random() * 0.08).toFixed(3) + ')'; ctx.fillRect(R.random() * S, R.random() * S, 1 + R.random() * 2, 1 + R.random() * 2); }
    // tyre wear: two polished, darker tracks along the lane (the tiles run their lanes left-right)
    for (var tk = 0; tk < 2; tk++) {
      var ty = S * (tk ? 0.66 : 0.3), tg = ctx.createLinearGradient(0, ty - 22, 0, ty + 22);
      tg.addColorStop(0, 'rgba(0,0,0,0)'); tg.addColorStop(0.5, 'rgba(0,0,0,0.13)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = tg; ctx.fillRect(0, ty - 22, S, 44);
    }
    // an oil drip line in the lane centre
    for (i = 0; i < 5; i++) { ctx.fillStyle = 'rgba(10,10,14,' + (0.12 + R.random() * 0.12).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(R.random() * S, S * 0.48 + (R.random() - 0.5) * 18, 4 + R.random() * 9, 3 + R.random() * 5, 0, 0, TAU); ctx.fill(); }
    // patches with crisp edges and tar lines (sealed cracks)
    for (i = 0; i < 3; i++) alphaFill(ctx, i % 2 ? PAL.asphaltLight : PAL.asphaltDark, 0.22, R.random() * S, R.random() * S, 30 + R.random() * 90, 20 + R.random() * 60);
    if (R.random() < 0.6) { var px = R.random() * S * 0.6, py = R.random() * S * 0.6, pw = 50 + R.random() * 70, ph = 30 + R.random() * 50; alphaFill(ctx, '#202228', 0.45, px, py, pw, ph); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(px, py, pw, ph); }
    ctx.strokeStyle = 'rgba(8,8,10,0.55)'; ctx.lineWidth = 2.2;
    for (i = 0; i < 2; i++) { var x = R.random() * S, y = R.random() * S; ctx.beginPath(); ctx.moveTo(x, y); for (var k = 0; k < 6; k++) { x += (R.random() - 0.3) * 34; y += (R.random() - 0.5) * 26; ctx.lineTo(x, y); } ctx.stroke(); }
    cracks(ctx, S, S, 2, 'rgba(0,0,0,0.25)', R);
  }
  // a cast-iron manhole cover centred at (x, y) and a kerb-side storm drain grate along the top edge
  function manhole(ctx, x, y, R) {
    ctx.fillStyle = '#1c1d21'; ctx.beginPath(); ctx.arc(x, y, 25, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a3b40'; ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, 20, 0, TAU); ctx.clip();
    ctx.strokeStyle = '#26272b'; ctx.lineWidth = 2;
    for (var k = -24; k <= 24; k += 6) { ctx.beginPath(); ctx.moveTo(x + k, y - 24); ctx.lineTo(x + k + 10, y + 24); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 24, y + k); ctx.lineTo(x + 24, y + k - 10); ctx.stroke(); }
    alphaFill(ctx, '#7a4a2a', 0.18, x - 20, y - 6, 40, 14);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 22, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    void R;
  }
  function drain(ctx, x, S) {
    ctx.fillStyle = '#18191c'; ctx.fillRect(x - 32, 22, 64, 18);
    ctx.fillStyle = '#4a4b50'; for (var k = 0; k < 8; k++) ctx.fillRect(x - 30 + k * 8, 24, 4, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 40, 40, 80, 6);
    void S;
  }
  // kerb paint on the top kerb strip of a sidewalk edge tile (red: no stopping by the corners, yellow: loading)
  function kerbPaint(ctx, S, col) { ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.fillRect(0, 0, S, 13); ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,0.15)'; for (var k = 0; k < 6; k++) ctx.fillRect(k * 40 + 7, 2 + (k % 3) * 3, 9, 3); }
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
    road_half_mh: function (ctx, S, R) { TILES.road_half(ctx, S, R); manhole(ctx, S * 0.45, S * 0.5, R); },
    road_half_dr: function (ctx, S, R) { TILES.road_half(ctx, S, R); drain(ctx, S * 0.5, S); },
    ave_outer_mh: function (ctx, S, R) { TILES.ave_outer(ctx, S, R); manhole(ctx, S * 0.55, S * 0.5, R); },
    ave_outer_dr: function (ctx, S, R) { TILES.ave_outer(ctx, S, R); drain(ctx, S * 0.4, S); },
    ave_inner_mh: function (ctx, S, R) { TILES.ave_inner(ctx, S, R); manhole(ctx, S * 0.5, S * 0.45, R); },
    asphalt_mh: function (ctx, S, R) { asphaltBase(ctx, S, R); manhole(ctx, S * 0.5, S * 0.5, R); },
    sidewalk_edge_red: function (ctx, S, R) { sidewalkBase(ctx, S, R); curbEdge(ctx, S); kerbPaint(ctx, S, '#b8322c'); },
    sidewalk_edge_yel: function (ctx, S, R) { sidewalkBase(ctx, S, R); curbEdge(ctx, S); kerbPaint(ctx, S, '#e2b43a'); },
    curbface_red: function (ctx, S, R) { TILES.curbface(ctx, S, R); alphaFill(ctx, '#b8322c', 0.85, 0, 0, S, S - 60); },
    curbface_yel: function (ctx, S, R) { TILES.curbface(ctx, S, R); alphaFill(ctx, '#e2b43a', 0.85, 0, 0, S, S - 60); },
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
    field: function (ctx, S, R) { grassBase(ctx, S, R, '#3f8f3a', '#56a84a', '#357a30'); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(0, 116, S, 6); ctx.fillRect(116, 0, 6, S); },
    // Runway 10/10 (GDD_EXPANSION §1.5): darker asphalt with tyre scuffs; the centreline tile carries its dashes on
    // the bottom edge (the row above the axis uses it at rotation 0, the row below at 2, so the dashes meet); the
    // edge tile a solid line on its top edge; the threshold tile the piano keys; the digits paint the "10".
    runway: function (ctx, S, R) { runwayBase(ctx, S, R); },
    runway_center: function (ctx, S, R) { runwayBase(ctx, S, R); ctx.fillStyle = PAL.runwayLine; ctx.globalAlpha = 0.85; ctx.fillRect(20, S - 7, 90, 7); ctx.fillRect(150, S - 7, 70, 7); ctx.globalAlpha = 1; },
    runway_edge: function (ctx, S, R) { runwayBase(ctx, S, R); ctx.fillStyle = PAL.runwayLine; ctx.globalAlpha = 0.8; ctx.fillRect(0, 6, S, 8); ctx.globalAlpha = 1; worn(ctx, 0, 6, S, 8, R, 5); ctx.fillStyle = PAL.runway; ctx.globalCompositeOperation = 'destination-over'; ctx.fillRect(0, 0, S, S); ctx.globalCompositeOperation = 'source-over'; },
    runway_thresh: function (ctx, S, R) { runwayBase(ctx, S, R); ctx.fillStyle = PAL.runwayLine; ctx.globalAlpha = 0.85; for (var k = 0; k < 3; k++) ctx.fillRect(14 + k * 80, 0, 36, S); ctx.globalAlpha = 1; for (k = 0; k < 3; k++) worn(ctx, 14 + k * 80, 0, 36, S, R, 10); ctx.fillStyle = PAL.runway; ctx.globalCompositeOperation = 'destination-over'; ctx.fillRect(0, 0, S, S); ctx.globalCompositeOperation = 'source-over'; },
    runway_1: function (ctx, S, R) { runwayBase(ctx, S, R); runwayDigit(ctx, S, '1'); },
    runway_0: function (ctx, S, R) { runwayBase(ctx, S, R); runwayDigit(ctx, S, '0'); },
    // airport apron: parking asphalt with a yellow taxi guide line
    apron: function (ctx, S, R) { asphaltBase(ctx, S, R, PAL.parking); ctx.fillStyle = PAL.apronLine; ctx.globalAlpha = 0.7; ctx.fillRect(0, S / 2 - 3, S, 6); ctx.globalAlpha = 1; worn(ctx, 0, S / 2 - 3, S, 6, R, 6); ctx.fillStyle = PAL.parking; ctx.globalCompositeOperation = 'destination-over'; ctx.fillRect(0, 0, S, S); ctx.globalCompositeOperation = 'source-over'; }
  };
  // base roughness per atlas cell (the roughness map modulates it by luminance: paint reads glossier than aggregate)
  var ROUGH = {
    road_half_mh: 0.9, road_half_dr: 0.9, ave_outer_mh: 0.9, ave_outer_dr: 0.9, ave_inner_mh: 0.9, asphalt_mh: 0.9, sidewalk_edge_red: 0.8, sidewalk_edge_yel: 0.8, curbface_red: 0.7, curbface_yel: 0.7,
    asphalt: 0.92, road_half: 0.92, road_dead: 0.92, ave_outer: 0.92, ave_inner: 0.92, cross: 0.88, cross_stop: 0.88, hw_outer: 0.9, hw_inner: 0.9,
    sidewalk: 0.84, sidewalk_edge: 0.84, sidewalk_corner: 0.84, curbface: 0.8, plaza: 0.62, plaza2: 0.6, path: 0.9, gravel: 0.98,
    grass: 1.0, grass2: 1.0, lawn: 1.0, field: 1.0, sand: 0.96, parking: 0.9, parking_bay: 0.9, apron: 0.9,
    concrete: 0.78, concrete_dark: 0.8, barrier: 0.75, dock: 0.7, dockside: 0.75, seawall: 0.8, roofgravel: 0.98,
    white: 0.5, black: 0.5, gold: 0.35, runway: 0.9, runway_center: 0.9, runway_edge: 0.9, runway_thresh: 0.9, runway_1: 0.9, runway_0: 0.9
  };
  function runwayBase(ctx, S, R) {
    ctx.fillStyle = PAL.runway; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, 0.04, 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.2)', R);
    for (var i = 0; i < 4; i++) alphaFill(ctx, '#000', 0.18, R.random() * S, R.random() * S, 8 + R.random() * 14, 40 + R.random() * 120);   // tyre scuffs along the strip
    cracks(ctx, S, S, 1, 'rgba(0,0,0,0.25)', R);
  }
  function runwayDigit(ctx, S, d) {
    ctx.fillStyle = PAL.runwayNumber; ctx.globalAlpha = 0.88; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 ' + Math.floor(S * 0.9) + 'px "Arial Black", Impact, Arial, sans-serif';
    ctx.fillText(d, S / 2, S / 2 + 6); ctx.globalAlpha = 1;
  }

  // ====================================================================== facades
  var SW = 24;   // swatch width in px (21 swatches across the 512 px band)
  var SWATCH_NAMES = ['concrete', 'concreteDark', 'concreteLight', 'gravel', 'metal', 'white', 'black', 'gold', 'red', 'blue', 'green', 'brown', 'yellow', 'glass', 'rust', 'pink', 'slate', 'sandstone', 'orange', 'navy', 'teal'];
  var SWATCH_COLORS = [PAL.concrete, PAL.concreteDark, PAL.concreteLight, PAL.roofGravel, '#3a3d44', '#f0f0f0', '#101014', PAL.gold, '#c94040', '#3d6fcf', '#2f9e6a', '#5a3f2a', '#e2b43a', '#6fb7d8', '#8b4a2a', '#ff3fa4', '#2e3038', '#9a6a4a', '#f08a2a', '#1c2a4a', '#2a7a7a'];

  function drawCommonBands(dctx, nctx, style, R) {
    // band 5: roof gravel (U repeats)
    var y = 5 * BAND;
    dctx.fillStyle = PAL.roofGravel; dctx.fillRect(0, y, FW, BAND);
    var i;
    dctx.save(); dctx.beginPath(); dctx.rect(0, y, FW, BAND); dctx.clip();
    for (i = 0; i < 8; i++) alphaFill(dctx, '#000', 0.12, R.random() * FW, y + R.random() * BAND, 30 + R.random() * 80, 20 + R.random() * 30);
    for (i = 0; i < 2500; i++) { dctx.fillStyle = R.random() < 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.22)'; dctx.fillRect(R.random() * FW, y + R.random() * BAND, 2, 2); }
    dctx.restore();
    // band 6: swatches (gold and pink glow at night)
    y = 6 * BAND;
    for (i = 0; i < SWATCH_COLORS.length; i++) { dctx.fillStyle = SWATCH_COLORS[i]; dctx.fillRect(i * SW, y, SW, BAND); nctx.fillStyle = (i === 15 || i === 7) ? SWATCH_COLORS[i] : '#000'; nctx.fillRect(i * SW, y, SW, BAND); }
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
    if (!lit) { ctx.fillStyle = MASKING ? '#ff0000' : '#05060a'; ctx.fillRect(x, y, w, h); return; }
    // the random draws happen in both modes, so the mask pass keeps the night pass's sequence (same lit windows)
    var blinds = R.random() < 0.4, shape = !blinds && R.random() < 0.5;
    if (MASKING) { ctx.fillStyle = warm ? PAL.windowLit : PAL.windowLitCool; ctx.fillRect(x, y, w, h); return; }
    var col = warm ? PAL.windowLit : PAL.windowLitCool;
    ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
    // blinds / interior shapes
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    if (blinds) for (var k = 0; k < h; k += 8) ctx.fillRect(x, y + k, w, 3);
    else if (shape) ctx.fillRect(x + w * 0.3, y + h * 0.4, w * 0.4, h * 0.6);
    ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.fillStyle = 'rgba(255,255,255,0.0)'; ctx.fillRect(x, y, w, h); ctx.shadowBlur = 0;
  }
  var MASKING = false;   // the glass-mask pass (Assets.facade): night-mode painters draw glass flat, skip paint and neon
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

  // interior mapping per facade style: [rooms per 8 m repeat (lined up between the painted windows), room depth (m),
  // how much the glass colour tints the room seen through it]
  var ROOMS = {
    downtown: [2, 5, 0.55], goldplate: [2, 5, 0.6], campus: [4, 4, 0.2], suburbs: [3, 3.5, 0.15], barn: [2, 4, 0.15], mansion: [3, 4, 0.15],
    industrial: [3, 5, 0.25], marina: [3, 3.5, 0.15], capitol: [4, 4.5, 0.2], police: [4, 4, 0.2], hospital: [5, 4, 0.25], strip: [4, 4, 0.3],
    stadium: [4, 4, 0.3], brownstone: [3, 4, 0.2], airport: [2, 6, 0.35], port: [3, 5, 0.25]
  };
  // where the upper-floor windows of each style sit (the painters above): column centres in px of the 512 px / 8 m
  // repeat, window width px, sill and head as fractions of the floor from its bottom. The chunk builder hangs AC units
  // under sills and lines fire escapes up with them.
  var WINDOWS = {
    campus: { cols: [60, 188, 316, 444], w: 72, sill: 0.21, head: 0.84 },
    suburbs: { cols: [92, 252, 412], w: 64, sill: 0.31, head: 0.75 },
    mansion: { cols: [92, 252, 412], w: 64, sill: 0.31, head: 0.75 },
    industrial: { cols: [48, 132, 216, 300, 384, 468], w: 56, sill: 0.51, head: 0.81 },
    marina: { cols: [85, 245, 405], w: 70, sill: 0.29, head: 0.81 },
    capitol: { cols: [72, 192, 312, 432], w: 56, sill: 0.24, head: 0.78 },
    police: { cols: [72, 192, 312, 432], w: 56, sill: 0.24, head: 0.78 },
    hospital: { cols: [60, 160, 260, 360, 460], w: 72, sill: 0.375, head: 0.81 },
    strip: { cols: [68, 188, 308, 428], w: 64, sill: 0.34, head: 0.79 },
    brownstone: { cols: [96, 256, 416], w: 80, sill: 0.175, head: 0.825 },
    port: { cols: [47, 129, 211, 293, 375, 457], w: 50, sill: 0.6, head: 0.85 }
  };
  // Storefront names for the fascia signs over the shops (one shared atlas, CONTENT_RULES: invented and harmless)
  var SHOP_NAMES = ['HOT TAKE COFFEE', 'BOTH SIDES BAGELS', 'DONOR DELI', 'THE RATIO BAR', 'CHYRON CLEANERS', 'PANEL PIZZA', 'TALKING POINTS TAILOR', 'SPIN CYCLE LAUNDRY',
    'CLICKBAIT & TACKLE', 'SPONSORED SUSHI', 'OUTRAGE OPTICAL', 'THINK TANK TOPS', 'FAIR & BALANCED FLORIST', 'AD READ ANTIQUES', 'PODCAST PAWN', 'DEBATE ME DONUTS',
    'LIKE & SUBSCRIBE LAUNDROMAT', 'FOLDING TABLE FURNITURE', 'HOT MIC MUSIC', 'SOUNDBITE SANDWICHES', 'FOCUS GROUP FITNESS', 'BREAKING NEWS BAKERY', 'TOWN HALL HARDWARE', 'GREEN ROOM GROCER',
    'CABLE CUTS BARBER', 'OP-ED OPTOMETRY', 'TEASER TACOS', 'B-ROLL BURGERS', 'CORRECTION CORNER', 'EXCLUSIVE NOODLES', 'PUNDIT PRINTS', 'NEWS CYCLE BIKES'];
  var SIGN_W = 512, SIGN_H = 64, SIGN_ROWS = 16, SIGN_COLS = 2;

  var OCEAN_PARS = [
    'uniform sampler2D tGtpShore, tGtpNoise, tGtpRip; uniform float uGtpTime, uGtpMap, uGtpChop; varying vec3 vGtpW;',
    'vec3 gtpSwell( vec2 p, float t ) {',
    '  vec3 r = vec3( 0.0 );',
    '  vec2 D[4]; float L[4]; float A[4];',
    '  D[0] = vec2( 0.96, 0.28 ); L[0] = 23.0; A[0] = 0.16;',
    '  D[1] = vec2( -0.37, 0.93 ); L[1] = 13.0; A[1] = 0.085;',
    '  D[2] = vec2( 0.8, -0.6 ); L[2] = 7.3; A[2] = 0.042;',
    '  D[3] = vec2( -0.98, -0.2 ); L[3] = 4.1; A[3] = 0.02;',
    '  for ( int i = 0; i < 4; i ++ ) {',
    '    float k = 6.2831853 / L[i], w = sqrt( 9.8 * k ), ph = dot( D[i], p ) * k - w * t;',
    '    float a = A[i] * ( 0.6 + 0.8 * uGtpChop );',
    '    r.xy += D[i] * a * k * cos( ph ); r.z += a * sin( ph );',
    '  }',
    '  return r;',
    '}'
  ].join('\n');
  var OCEAN_MAP = [
    'float gShore = texture2D( tGtpShore, vGtpW.xz / uGtpMap ).r;',
    'vec3 gSw = gtpSwell( vGtpW.xz, uGtpTime );',
    'vec3 gDeep = vec3( 0.018, 0.085, 0.12 ), gShallow = vec3( 0.04, 0.22, 0.24 );',
    'vec3 gCol = mix( gShallow, gDeep, smoothstep( 0.05, 0.7, gShore ) );',
    'gCol *= 0.9 + 0.35 * clamp( gSw.z * 4.0, -0.3, 0.6 );',   // the crests catch more light through the water
    'float gFn = texture2D( tGtpNoise, vGtpW.xz / 7.0 + vec2( uGtpTime * 0.013, -uGtpTime * 0.009 ) ).r;',
    'float gBand = 1.0 - smoothstep( 0.0, 0.2, gShore );',
    'float gPulse = 0.5 + 0.5 * sin( gShore * 38.0 - uGtpTime * 1.4 + gFn * 4.0 );',
    'float gtpFoam = clamp( gBand * ( gFn * 1.25 + gPulse * 0.55 ) - 0.42, 0.0, 1.0 ) * 1.6;',
    'gtpFoam = max( gtpFoam, smoothstep( 0.2, 0.32, gSw.z ) * smoothstep( 0.6, 0.85, gFn ) * uGtpChop );',   // whitecaps in a chop
    'gtpFoam = clamp( gtpFoam, 0.0, 1.0 );',
    'diffuseColor.rgb = mix( gCol, vec3( 0.86, 0.92, 0.94 ), gtpFoam );'
  ].join('\n');
  var OCEAN_NORMAL = [
    'vec3 gNw = normalize( vec3( -gSw.x, 1.0, -gSw.y ) );',
    'vec2 gR1 = texture2D( tGtpRip, vGtpW.xz / 9.0 + vec2( uGtpTime * 0.021, uGtpTime * 0.017 ) ).xy;',
    'vec2 gR2 = texture2D( tGtpRip, vGtpW.xz / 4.3 - vec2( uGtpTime * 0.026, -uGtpTime * 0.012 ) ).xy;',
    'gNw.xz += ( gR1 + gR2 - 1.0 ) * ( 0.22 + 0.25 * uGtpChop ) * ( 1.0 - gtpFoam * 0.7 );',
    'normal = normalize( ( viewMatrix * vec4( normalize( gNw ), 0.0 ) ).xyz );'
  ].join('\n');

  // the hemisphere light already carries the sky's ambient: the environment map's diffuse share on the ground and the
  // walls is trimmed to this (its reflections stay whole), or every shadow turns sky blue
  var IBL_DIFFUSE = '0.3';
  var GLASS_PARS = [
    'uniform sampler2D tGtpMask; uniform vec4 uGtpRoom; uniform vec4 uGtpInt; varying vec3 vGtpW; varying vec3 vGtpN;',
    'float gtpH( vec3 p ) { p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }'
  ].join('\n');
  var GLASS_MAP = [
    'float gtpGlass = 0.0; vec3 gtpEmit = vec3( 0.0 );',
    '{',
    '  vec4 gm = texture2D( tGtpMask, vMapUv );',
    '  vec3 gN = normalize( vGtpN );',
    '  gtpGlass = smoothstep( 0.3, 0.7, gm.r ) * ( 1.0 - step( 0.5, abs( gN.y ) ) );',
    '  if ( gtpGlass > 0.002 ) {',
    '    vec3 gT = vec3( gN.z, 0.0, -gN.x );',
    '    vec3 gV = normalize( vGtpW - cameraPosition );',
    '    float rooms = uGtpRoom.x, roomW = 8.0 / rooms, roomH = uGtpRoom.z;',
    '    vec2 rc = vec2( vMapUv.x * rooms, vMapUv.y * 8.0 );',
    '    vec2 cellId = floor( rc );',
    '    vec3 o = vec3( fract( rc ), 0.0 );',
    '    float shop = step( 6.5, cellId.y );',                                  // band 0 (the ground floor) sits at v 7/8..1
    '    float wallKey = floor( dot( vGtpW, gN ) * 2.0 + 0.5 ) + floor( dot( vGtpW, gT ) / 64.0 ) * 13.0;',
    '    float h1 = gtpH( vec3( cellId, wallKey ) ), h2 = gtpH( vec3( cellId.yx + 17.0, wallKey * 0.37 ) ), h3 = gtpH( vec3( cellId * 1.7 + 3.1, wallKey + 9.0 ) );',
    '    vec3 d = vec3( dot( gV, gT ) / roomW, gV.y / roomH, max( -dot( gV, gN ), 0.03 ) / ( uGtpRoom.y * ( 1.0 + shop * 0.6 ) ) );',
    '    vec3 sg = step( vec3( 0.0 ), d );',
    '    vec3 dd = mix( d, mix( vec3( -1e-4 ), vec3( 1e-4 ), sg ), step( abs( d ), vec3( 1e-4 ) ) );',
    '    vec3 tt = ( sg - o ) / dd;',
    '    float t = min( min( tt.x, tt.y ), tt.z );',
    '    vec3 hp = o + dd * t;',
    '    vec3 wallC = mix( vec3( 0.80, 0.76, 0.68 ), vec3( 0.60, 0.68, 0.73 ), h1 );',
    '    wallC = mix( wallC, vec3( 0.78, 0.58, 0.44 ), step( 0.8, h2 ) * 0.7 );',
    '    vec3 floorC = mix( vec3( 0.33, 0.22, 0.14 ), vec3( 0.30, 0.31, 0.34 ), step( 0.5, h2 ) );',
    '    vec3 col;',
    '    float face = 0.0;',                                                     // 0 back, 1 side, 2 floor, 3 ceiling
    '    if ( t == tt.z ) {',
    '      col = wallC;',
    '      float art = step( abs( hp.x - 0.5 + ( h3 - 0.5 ) * 0.4 ), 0.13 ) * step( abs( hp.y - 0.58 ), 0.12 ) * step( 0.35, h3 );',
    '      col = mix( col, mix( vec3( 0.2, 0.3, 0.45 ), vec3( 0.55, 0.25, 0.2 ), h1 ), art * ( 1.0 - shop ) );',
    '      float door = step( abs( hp.x - h3 ), 0.09 ) * step( hp.y, 0.72 ) * step( h2, 0.45 );',
    '      col = mix( col, vec3( 0.25, 0.18, 0.12 ), door * ( 1.0 - shop ) );',
    '      float shelf = step( fract( hp.y * 4.0 ), 0.12 ) * step( hp.y, 0.85 );',
    '      vec3 goods = mix( vec3( 0.75, 0.2, 0.2 ), vec3( 0.2, 0.45, 0.8 ), gtpH( vec3( floor( hp.x * 14.0 ), floor( hp.y * 4.0 ), h1 * 9.0 ) ) );',
    '      col = mix( col, mix( goods, vec3( 0.25 ), shelf ), shop * step( hp.y, 0.85 ) * step( 0.06, fract( hp.x * 14.0 ) ) );',
    '    } else if ( t == tt.x ) { col = wallC * 0.8; face = 1.0; }',
    '    else if ( dd.y < 0.0 ) { col = floorC; face = 2.0; }',
    '    else { col = vec3( 0.88 ); face = 3.0; }',
    // a furniture card part way in: a sofa or a desk, a tall shelf at one side; a counter in a shop
    '    float zc = 0.4 + 0.3 * h3, tc = zc / dd.z;',
    '    if ( tc < t ) {',
    '      vec3 fp = o + dd * tc;',
    '      float sofa = step( fp.y, 0.26 + 0.08 * h1 ) * step( abs( fp.x - 0.3 - 0.4 * h2 ), 0.22 ) * ( 1.0 - shop );',
    '      float tall = step( fp.y, 0.7 ) * step( fp.x, 0.08 + 0.12 * h3 ) * step( 0.5, h1 ) * ( 1.0 - shop );',
    '      float counter = step( fp.y, 0.3 ) * step( abs( fp.x - 0.5 ), 0.3 ) * shop;',
    '      float fur = max( max( sofa, tall ), counter );',
    '      col = mix( col, mix( vec3( 0.16, 0.14, 0.13 ), vec3( 0.42, 0.2, 0.16 ), step( 0.6, h2 ) * sofa ), fur );',
    '      hp.z = mix( hp.z, zc, fur );',
    '    }',
    '    float lit = smoothstep( 0.3, 0.7, gm.g ), cool = smoothstep( 0.3, 0.7, gm.b );',
    '    vec3 lampC = mix( vec3( 1.0, 0.68, 0.38 ), vec3( 0.62, 0.72, 0.85 ), cool );',
    '    float fall = face == 3.0 ? 1.4 : mix( 0.55, 1.1, smoothstep( 0.0, 1.0, hp.y ) );',
    '    float nightL = uGtpInt.y * lit * ( 0.65 + 0.6 * h3 ) * ( 1.0 + shop * 0.5 );',
    '    vec3 lightIn = vec3( uGtpInt.x ) * mix( 1.05, 0.4, clamp( hp.z, 0.0, 1.0 ) ) + lampC * nightL * fall;',
    '    vec3 inter = col * lightIn;',
    // blinds pulled part way down in some rooms (not the shops), with slats
    '    float blind = step( 1.0 - ( 0.12 + 0.55 * h2 ) * step( 0.55, h1 ), o.y ) * ( 1.0 - shop );',
    '    vec3 slat = vec3( 0.86, 0.82, 0.74 ) * ( 0.82 + 0.18 * step( 0.5, fract( o.y * roomH * 9.0 ) ) );',
    '    inter = mix( inter, slat * ( vec3( uGtpInt.x * 1.1 ) + lampC * nightL * 0.7 ), blind );',
    '    float cosT = clamp( -dot( gV, gN ), 0.0, 1.0 );',
    '    float F = 0.04 + 0.96 * pow( 1.0 - cosT, 5.0 );',
    '    vec3 tint = diffuseColor.rgb / max( max( diffuseColor.r, diffuseColor.g ), max( diffuseColor.b, 0.05 ) );',
    '    gtpEmit = inter * mix( vec3( 1.0 ), tint, uGtpRoom.w ) * ( 1.0 - F );',
    '  }',
    '  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 0.05, gtpGlass );',
    '}'
  ].join('\n');

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
          if (night) { ctx.fillStyle = U.shade(PAL.windowLitCool, -0.3); ctx.fillRect(60, y + 40, 392, BAND - 50); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(236, y + 50, 40, BAND - 60); }
          else { winDay(ctx, 60, y + 40, 392, BAND - 50, '#9aa3ad', '#8fc1e0', null); ctx.fillStyle = '#9aa3ad'; ctx.fillRect(0, y + 20, FW, 14); }
          if (!MASKING) { ctx.fillStyle = night ? '#ff4a4a' : '#d23c3c'; ctx.fillRect(238, y + 2, 36, 10); ctx.fillRect(251, y - 11 + 11, 10, 36); }
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
          if (MASKING) ctx.globalAlpha = 0;
          if (night) { ctx.shadowBlur = 18; ctx.shadowColor = neon; ctx.strokeStyle = neon; } else { ctx.shadowBlur = 0; ctx.strokeStyle = U.shade(neon, -0.5); }
          ctx.beginPath(); for (k = 0; k < 8; k++) ctx.lineTo(40 + k * 60, y + 16 + (k % 2) * 22); ctx.stroke();
          if (night) { ctx.shadowColor = neon2; ctx.strokeStyle = neon2; } else ctx.strokeStyle = U.shade(neon2, -0.5);
          ctx.beginPath(); ctx.arc(470, y + 27, 14, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(18, y + 27, 14, 0, TAU); ctx.stroke();
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        } else {
          for (k = 0; k < 4; k++) {
            var wx = 36 + k * 120, ww = 64, wy = y + 34, wh = 72;
            if (night) winNight(ctx, wx, wy, ww, wh, lit(), R.random() < 0.5, R); else winDay(ctx, wx, wy, ww, wh, '#1a1a1a', '#5a7f95', null);
          }
          if (b === 2 && night && !MASKING) { ctx.strokeStyle = neon; ctx.shadowColor = neon; ctx.shadowBlur = 14; ctx.lineWidth = 5; ctx.strokeRect(14, y + 14, FW - 28, BAND - 28); ctx.shadowBlur = 0; }
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
    },
    // ---- expansion styles (GDD_EXPANSION §1.1) ----
    // Heirloom Heights: warm sandstone, tall arched windows under white lintels, a five-step stoop with railings
    // and a raised door on the ground floor, basement windows under the stoop line
    brownstone: function (ctx, night, R) {
      var base = R.pick(PAL.facades.brownstone), lit = litDecider(R, 0.5), trim = '#efe6d6', dark = U.shade(base, -0.45);
      for (var b = 0; b < 5; b++) {
        var y = b * BAND, k, wx, ww;
        if (!night) ashlar(ctx, 0, y, FW, BAND, R, base);
        if (b === 0) {
          // the stoop: five steps up to the door at x 256, railings either side, two basement windows at street level
          var sx = 196, sw = 120;
          if (!night) {
            for (k = 0; k < 5; k++) { ctx.fillStyle = U.shade(trim, -0.1 - k * 0.05); ctx.fillRect(sx - k * 6, y + BAND - 14 - k * 12, sw + k * 12, 12); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx - k * 6, y + BAND - 14 - k * 12 + 10, sw + k * 12, 2); }
            ctx.fillStyle = '#2a2420'; ctx.fillRect(sx + 4, y + BAND - 74, 4, 60); ctx.fillRect(sx + sw - 8, y + BAND - 74, 4, 60);   // railing posts
            ctx.fillRect(sx - 20, y + BAND - 80, sw + 40, 4);                                                                            // hand rail
            for (k = 0; k < 8; k++) { ctx.fillRect(sx - 18 + k * 20, y + BAND - 78, 2, 22); }
            ctx.fillStyle = trim; ctx.fillRect(sx + 22, y + 10, sw - 44, 14);                                                             // door lintel
            ctx.fillStyle = '#3a2a1a'; ctx.fillRect(sx + 28, y + 24, sw - 56, BAND - 24 - 74);                                              // the door, up the steps
            ctx.fillStyle = '#c9a24a'; ctx.fillRect(sx + sw / 2 + 14, y + 60, 4, 4);
          } else { ctx.fillStyle = lit() ? PAL.windowLit : '#06070b'; ctx.fillRect(sx + 34, y + 30, sw - 68, 30); }
          for (k = 0; k < 2; k++) {
            wx = k ? 380 : 60; ww = 72;
            if (night) { winNight(ctx, wx, y + 30, ww, 90, lit(), true, R); ctx.fillStyle = lit() ? U.shade(PAL.windowLit, -0.3) : '#06070b'; ctx.fillRect(wx + 10, y + BAND - 40, ww - 20, 26); }
            else { ctx.fillStyle = trim; ctx.fillRect(wx - 8, y + 20, ww + 16, 10); winDay(ctx, wx, y + 30, ww, 90, dark, '#5f8fae', trim); ctx.fillStyle = dark; ctx.fillRect(wx + ww / 2 - 2, y + 30, 4, 90); ctx.fillStyle = '#1e1a16'; ctx.fillRect(wx + 10, y + BAND - 40, ww - 20, 26); ctx.fillStyle = '#2a2420'; for (var bb = 0; bb < 5; bb++) ctx.fillRect(wx + 10 + bb * 13, y + BAND - 40, 2, 26); }
          }
          if (!night) { ctx.fillStyle = U.shade(base, -0.5); ctx.fillRect(0, y + BAND - 6, FW, 6); }
        } else {
          for (k = 0; k < 3; k++) {
            wx = 56 + k * 160; ww = 80;
            if (night) winNight(ctx, wx, y + 28, ww, 104, lit(), true, R);
            else {
              ctx.fillStyle = trim; ctx.fillRect(wx - 8, y + 22, ww + 16, 10); ctx.beginPath(); ctx.arc(wx + ww / 2, y + 28, ww / 2 + 6, Math.PI, 0); ctx.fill();   // white lintel + arch
              winDay(ctx, wx, y + 28, ww, 104, dark, '#5f8fae', trim); ctx.fillStyle = '#5f8fae'; ctx.beginPath(); ctx.arc(wx + ww / 2, y + 28, ww / 2, Math.PI, 0); ctx.fill();
              ctx.fillStyle = dark; ctx.fillRect(wx + ww / 2 - 2, y + 28 - ww / 2, 4, 104 + ww / 2); ctx.fillRect(wx, y + 70, ww, 3);
            }
          }
          if (!night) { floorShadow(ctx, y); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(0, y + BAND - 12, FW, 4); }
        }
      }
    },
    // Goldplate International: pale composite panels, one long glass band per floor, a glass ground floor with
    // sliding doors; gate numbers painted on the panels
    airport: function (ctx, night, R) {
      var base = R.pick(PAL.facades.airport), lit = litDecider(R, 0.7);
      for (var b = 0; b < 5; b++) {
        var y = b * BAND, k;
        if (!night) {
          ctx.fillStyle = base; ctx.fillRect(0, y, FW, BAND);
          for (k = 0; k <= 8; k++) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(k * 64 - 2, y, 3, BAND); }
          ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(0, y + BAND - 10, FW, 10); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, y, FW, 4);
        }
        if (b === 0) {
          if (night) { ctx.fillStyle = U.shade(PAL.windowLitCool, -0.3); ctx.fillRect(12, y + 26, FW - 24, BAND - 30); ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (k = 0; k < 7; k++) ctx.fillRect(30 + k * 70, y + 40, 12, BAND - 50); }
          else { winDay(ctx, 12, y + 26, FW - 24, BAND - 30, '#8a949e', '#9fc7e0', null); ctx.fillStyle = '#8a949e'; for (k = 0; k < 7; k++) ctx.fillRect(30 + k * 70, y + 26, 6, BAND - 30); ctx.fillStyle = '#5a6470'; ctx.fillRect(236, y + 40, 40, BAND - 44); ctx.fillStyle = PAL.gold; ctx.fillRect(0, y + 14, FW, 8); }
        } else {
          // the glass band
          if (night) { for (k = 0; k < 8; k++) winNight(ctx, 10 + k * 64, y + 44, 46, 64, lit(), false, R); }
          else { winDay(ctx, 10, y + 44, FW - 20, 64, '#8a949e', '#9fc7e0', null); ctx.fillStyle = '#8a949e'; for (k = 1; k < 8; k++) ctx.fillRect(k * 64 - 3, y + 44, 6, 64); }
          // a gate number on a panel
          ctx.fillStyle = night ? '#101418' : '#1c2a4a'; ctx.font = '900 34px "Arial Black", Impact, Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          if (!MASKING) ctx.fillText('G' + (b * 3 + (b % 2)), 18, y + 36);
          if (!night) floorShadow(ctx, y);
        }
      }
    },
    // Manifest Harbor: corrugated metal in shipping colours, roll-up loading doors with stencilled bay numbers,
    // small high windows above
    port: function (ctx, night, R) {
      var base = R.pick(PAL.facades.port), lit = litDecider(R, 0.3), ink = 'rgba(245,240,225,0.8)';
      for (var b = 0; b < 5; b++) {
        var y = b * BAND, k;
        if (!night) corrugated(ctx, 0, y, FW, BAND, R, base);
        if (b === 0) {
          if (!night) {
            for (k = 0; k < 2; k++) {
              var dx = 36 + k * 260;
              ctx.fillStyle = '#3a3d44'; ctx.fillRect(dx, y + 18, 180, BAND - 18);
              for (var s = 0; s < 12; s++) { ctx.fillStyle = s % 2 ? '#4a4d55' : '#2f3238'; ctx.fillRect(dx + 4, y + 22 + s * 11, 172, 10); }
              ctx.fillStyle = PAL.gold; ctx.fillRect(dx, y + BAND - 16, 180, 4);
              ctx.fillStyle = ink; ctx.font = '900 40px "Arial Black", Impact, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('0' + (k + 1 + (R.random() < 0.5 ? 2 : 0)), dx + 90, y + 80);
            }
            ctx.fillStyle = PAL.concreteDark; ctx.fillRect(0, y + BAND - 12, FW, 12);
          } else { ctx.fillStyle = lit() ? PAL.windowLit : '#06070b'; ctx.fillRect(236, y + 50, 40, 36); }
        } else {
          for (k = 0; k < 6; k++) {
            var wx = 22 + k * 82, ww = 50, wy = y + 24, wh = 40;
            if (night) winNight(ctx, wx, wy, ww, wh, lit(), false, R);
            else { winDay(ctx, wx, wy, ww, wh, '#2b2e33', '#7b9aa8', null); ctx.fillStyle = '#2b2e33'; ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh); }
          }
          if (!night) { ctx.fillStyle = ink; ctx.font = '900 30px "Arial Black", Impact, Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText('BAY ' + (10 + b * 7), 20, y + BAND - 24); floorShadow(ctx, y); }
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
        if (night) { ctx.fillStyle = U.shade(gold ? PAL.windowLit : PAL.windowLitCool, -0.3); ctx.fillRect(16, y + 30, FW - 32, BAND - 40); ctx.fillStyle = 'rgba(0,0,0,0.45)'; for (i = 0; i < 6; i++) ctx.fillRect(40 + i * 80, y + 40, 18, BAND - 60); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(16, y + 30, FW - 32, 30); }
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
  // mark the vertices a builder adds inside fn() as self-lit (the prop material's glow attribute); k scales the emission
  function glowing(g, k, fn) { var from = g.n; fn(); if (g._glow) g._glow.push([from, g.n, k == null ? 1 : k]); }
  // ---- foliage (Assets.prop('tree' | 'palm')): smooth-normal geometry built vertex by vertex ----
  var LEAF_UV = [[0.02, 0.27], [0.73, 0.27], [0.73, 0.98], [0.02, 0.98]], SOLID_UV = [0.93, 0.5];
  function FoliageBuilder() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  FoliageBuilder.prototype.v = function (p, n, uv, c) { this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.uv.push(uv[0], uv[1]); this.col.push(c[0], c[1], c[2]); return this.n++; };
  FoliageBuilder.prototype.build = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  };
  function vnorm(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  // a tapered tube from p0 to p1 with smooth normals (trunks, boughs)
  function fbTube(fb, p0, p1, r0, r1, segs, col0, col1) {
    var ax = vnorm([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]), ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    var t1 = vnorm(vcross(ax, ref)), t2 = vcross(ax, t1), base = fb.n, i;
    for (i = 0; i <= segs; i++) {
      var a = i / segs * TAU, ca = Math.cos(a), sa = Math.sin(a), n = [t1[0] * ca + t2[0] * sa, t1[1] * ca + t2[1] * sa, t1[2] * ca + t2[2] * sa];
      fb.v([p0[0] + n[0] * r0, p0[1] + n[1] * r0, p0[2] + n[2] * r0], n, SOLID_UV, col0);
      fb.v([p1[0] + n[0] * r1, p1[1] + n[1] * r1, p1[2] + n[2] * r1], n, SOLID_UV, col1);
    }
    for (i = 0; i < segs; i++) { var a0 = base + i * 2; fb.idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
  }
  // a smooth blob (lat-long, normals from the centre, squashed by sy)
  function fbBlob(fb, cx, cy, cz, r, sy, col, colTop) {
    var segs = 9, rings = 6, base = fb.n, i, j;
    for (j = 0; j <= rings; j++) {
      var ph = -Math.PI / 2 + j / rings * Math.PI, cp = Math.cos(ph), sp = Math.sin(ph), k = (sp + 1) / 2;
      var cc = [col[0] + (colTop[0] - col[0]) * k, col[1] + (colTop[1] - col[1]) * k, col[2] + (colTop[2] - col[2]) * k];
      for (i = 0; i <= segs; i++) {
        var a = i / segs * TAU, n = [Math.cos(a) * cp, sp, Math.sin(a) * cp];
        fb.v([cx + n[0] * r, cy + n[1] * r * sy, cz + n[2] * r], n, SOLID_UV, cc);
      }
    }
    for (j = 0; j < rings; j++) for (i = 0; i < segs; i++) { var a0 = base + j * (segs + 1) + i, b0 = a0 + segs + 1; fb.idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
  }
  // a leaf card centred at p facing n (twisted by tw), size s; the vertex normals lean out from the canopy centre c
  function fbCard(fb, p, n, c, s, tw, col) {
    var ref = Math.abs(n[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0], t1 = vnorm(vcross(n, ref)), t2 = vcross(n, t1);
    var ct = Math.cos(tw), st = Math.sin(tw), u = [t1[0] * ct + t2[0] * st, t1[1] * ct + t2[1] * st, t1[2] * ct + t2[2] * st], w = vcross(n, u), h = s / 2;
    var out = vnorm([p[0] - c[0], (p[1] - c[1]) * 0.8 + 0.25, p[2] - c[2]]), nn = vnorm([out[0] * 0.75 + n[0] * 0.25, out[1] * 0.75 + n[1] * 0.25, out[2] * 0.75 + n[2] * 0.25]);
    var base = fb.n;
    fb.v([p[0] - u[0] * h - w[0] * h, p[1] - u[1] * h - w[1] * h, p[2] - u[2] * h - w[2] * h], nn, LEAF_UV[0], col);
    fb.v([p[0] + u[0] * h - w[0] * h, p[1] + u[1] * h - w[1] * h, p[2] + u[2] * h - w[2] * h], nn, LEAF_UV[1], col);
    fb.v([p[0] + u[0] * h + w[0] * h, p[1] + u[1] * h + w[1] * h, p[2] + u[2] * h + w[2] * h], nn, LEAF_UV[2], col);
    fb.v([p[0] - u[0] * h + w[0] * h, p[1] - u[1] * h + w[1] * h, p[2] - u[2] * h + w[2] * h], nn, LEAF_UV[3], col);
    fb.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  var TREES = {
    // a broadleaf street tree: a trunk with three boughs, a dark inner canopy of smooth blobs and ~60 leaf cards over it
    // (lighter on top, darker underneath and inside), about 7 m tall at scale 1
    tree: function (R) {
      var fb = new FoliageBuilder(), bark = c('#4e3826'), barkTop = c('#5d4630'), i;
      fbTube(fb, [0, -0.1, 0], [0, 3.0, 0], 0.27, 0.16, 9, bark, barkTop);
      fbTube(fb, [0, 2.4, 0], [0.9, 3.9, 0.3], 0.11, 0.05, 6, barkTop, barkTop);
      fbTube(fb, [0, 2.6, 0], [-0.8, 4.0, -0.4], 0.1, 0.05, 6, barkTop, barkTop);
      fbTube(fb, [0, 2.8, 0], [0.1, 4.3, -0.9], 0.09, 0.04, 6, barkTop, barkTop);
      var C0 = [0, 4.35, 0], RX = 2.25, RY = 1.85, inner = c('#1e4a1c'), innerTop = c('#2c6226');
      fbBlob(fb, 0, 4.2, 0, 1.55, 0.85, inner, innerTop);
      fbBlob(fb, 0.8, 4.5, 0.4, 1.1, 0.85, inner, innerTop);
      fbBlob(fb, -0.7, 4.6, -0.4, 1.1, 0.85, inner, innerTop);
      var greens = [c('#3c7a30'), c('#4a8a36'), c('#35702e'), c('#5b8f34')];
      for (i = 0; i < 64; i++) {
        var th = R.random() * TAU, y = R.random() * 2 - 1;
        y = y < 0 ? -Math.pow(-y, 1.6) : Math.pow(y, 0.8);   // more cards on the upper half
        var rr = Math.sqrt(Math.max(0, 1 - y * y)), d = [Math.cos(th) * rr, y, Math.sin(th) * rr], k = 0.72 + R.random() * 0.3;
        var p = [C0[0] + d[0] * RX * k, C0[1] + d[1] * RY * k, C0[2] + d[2] * RX * k];
        var n = vnorm([d[0] + (R.random() - 0.5) * 1.2, d[1] + (R.random() - 0.5) * 1.2 + 0.3, d[2] + (R.random() - 0.5) * 1.2]);
        var g0 = greens[Math.floor(R.random() * greens.length)], lift = (y + 1) * 0.5;
        var col = [g0[0] * (0.62 + 0.5 * lift), g0[1] * (0.62 + 0.5 * lift), g0[2] * (0.6 + 0.45 * lift)];
        fbCard(fb, p, n, C0, 1.35 + R.random() * 0.75, R.random() * TAU, col);
      }
      return fb.build();
    },
    // a palm: a ringed, slightly curved trunk and drooping fronds (two segments each, opaque, both sides) round a crown
    palm: function (R) {
      var fb = new FoliageBuilder(), i, trunk = c('#7a5c3c'), trunkD = c('#5e4630'), y = 0, x = 0;
      for (i = 0; i < 7; i++) { var y1 = y + 0.8, x1 = x + 0.05 * i * 0.3; fbTube(fb, [x, y, 0], [x1, y1, 0], 0.2 - i * 0.012, 0.19 - i * 0.012, 7, i % 2 ? trunk : trunkD, trunk); y = y1; x = x1; }
      var top = [x, y, 0];
      fbBlob(fb, top[0], top[1] + 0.05, 0, 0.32, 1, c('#5a4028'), c('#6a4a2a'));
      var fr = c('#3e8a36'), frD = c('#2c6a28');
      for (i = 0; i < 9; i++) {
        var a = i / 9 * TAU + R.random() * 0.3, dx = Math.cos(a), dz = Math.sin(a), L1 = 1.5 + R.random() * 0.4, L2 = 1.3 + R.random() * 0.4, wdt = 0.32;
        var p0 = top, p1 = [top[0] + dx * L1, top[1] + 0.35, top[2] + dz * L1], p2 = [p1[0] + dx * L2, p1[1] - 0.9 - R.random() * 0.4, p1[2] + dz * L2];
        var sx = -dz * wdt, sz = dx * wdt, base = fb.n, up = [0, 1, 0];
        [[p0, 0.25], [p1, 1], [p2, 0.15]].forEach(function (q, qi) { var pp = q[0], ww = q[1]; var cc = qi === 2 ? frD : fr; fb.v([pp[0] - sx * ww, pp[1], pp[2] - sz * ww], up, SOLID_UV, cc); fb.v([pp[0] + sx * ww, pp[1], pp[2] + sz * ww], up, SOLID_UV, cc); });
        fb.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3, base + 2, base + 4, base + 3, base + 3, base + 4, base + 5);
      }
      return fb.build();
    }
  };

  var PROPS = {
    tree: function (g, R) {
      // a trunk with a root flare and two boughs, then a canopy of eight blobs in three tones, dark at the core and
      // light at the sunlit top (the instance colour varies the whole tree a little more)
      g.cylinder(0, 0, 0, 0.3, 0.2, 0.5, 7, TRUNK, null, false);
      g.cylinder(0, 0.4, 0, 0.21, 0.15, 2.4, 7, TRUNK, null, false);
      g.cylinder(0.25, 2.3, 0.2, 0.09, 0.05, 1.3, 5, TRUNK, null, false); g.cylinder(-0.3, 2.5, -0.15, 0.08, 0.04, 1.1, 5, TRUNK, null, false);
      var base = c(R.pick(PAL.tree)), dark = shade3(base, -0.28), light = shade3(c(R.pick(PAL.tree)), 0.16);
      treeBlob(g, 0, 3.2, 0, 1.75, dark, 0.85);
      treeBlob(g, 0.9, 3.8, 0.5, 1.35, base, 0.9);
      treeBlob(g, -0.85, 3.9, -0.5, 1.3, base, 0.9);
      treeBlob(g, 0.3, 3.7, -1.0, 1.15, base, 0.9);
      treeBlob(g, -0.5, 3.6, 0.95, 1.1, dark, 0.9);
      treeBlob(g, 0.5, 4.7, 0.2, 1.1, light, 0.85);
      treeBlob(g, -0.4, 4.8, -0.3, 1.0, light, 0.85);
      treeBlob(g, 0, 5.4, 0, 0.75, light, 0.8);
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
      g.cylinder(0, 0, 0, 0.16, 0.1, 6.2, 8, METAL, null, false);
      g.cylinder(0, 0, 0, 0.2, 0.17, 0.5, 8, METAL, null, false);                // the base collar
      g.box(-0.06, 6.0, -0.06, 0.12, 0.12, 1.6, GB.UV0, METAL);   // arm reaching over the road (+z = toward the road at rot 0)
      g.box(-0.05, 5.5, -0.05, 0.1, 0.1, 0.1, GB.UV0, METAL); g.quad([-0.025, 5.55, 0.05], [0.025, 5.55, 0.05], [0.025, 6.0, 1.2], [-0.025, 6.0, 1.2], GB.UV0, METAL); g.quad([-0.025, 6.0, 1.2], [0.025, 6.0, 1.2], [0.025, 5.55, 0.05], [-0.025, 5.55, 0.05], GB.UV0, METAL);   // the stay (a two-sided strip; never coincide a quad's first two corners: a zero normal is NaN lighting)
      g.box(-0.24, 5.85, 1.05, 0.48, 0.22, 0.8, GB.UV0, LAMP);      // head
      glowing(g, 1.3, function () { g.box(-0.17, 5.82, 1.15, 0.34, 0.04, 0.55, GB.UV0, c(PAL.lampGlow)); });   // the lens, lit
      g.box(-0.25, 0, -0.25, 0.5, 0.25, 0.5, GB.UV0, CONCD);
    },
    signal: function (g) {
      g.cylinder(0, 0, 0, 0.12, 0.09, 4.6, 6, METAL, null, false);
      g.box(-0.06, 4.4, -0.06, 0.12, 0.12, 3.2, GB.UV0, METAL);
      g.box(-0.18, 3.5, 2.5, 0.36, 1.0, 0.36, GB.UV0, [0.12, 0.12, 0.13]);
      // visors over the lenses, then the lenses themselves lit through the glow attribute
      for (var vk = 0; vk < 3; vk++) g.box(-0.14, 4.44 - vk * 0.32, 2.84, 0.28, 0.03, 0.1, GB.UV0, [0.1, 0.1, 0.11]);
      glowing(g, 1.0, function () { g.box(-0.12, 4.22, 2.86, 0.24, 0.22, 0.02, GB.UV0, [1, 0.15, 0.1]); });
      glowing(g, 0.55, function () { g.box(-0.12, 3.9, 2.86, 0.24, 0.22, 0.02, GB.UV0, [1, 0.7, 0.1]); });
      glowing(g, 1.0, function () { g.box(-0.12, 3.58, 2.86, 0.24, 0.22, 0.02, GB.UV0, [0.2, 0.9, 0.3]); });
      g.box(-0.18, 2.2, -0.18, 0.36, 0.8, 0.36, GB.UV0, [0.12, 0.12, 0.13]);
      glowing(g, 1.0, function () { g.box(-0.12, 2.75, 0.18, 0.24, 0.2, 0.02, GB.UV0, [1, 0.15, 0.1]); });
      glowing(g, 1.0, function () { g.box(-0.12, 2.5, 0.18, 0.24, 0.2, 0.02, GB.UV0, [0.2, 0.9, 0.3]); });
      g.box(-0.2, 1.1, -0.1, 0.4, 0.3, 0.06, GB.UV0, [0.85, 0.85, 0.8]);   // the push-button plate
    },
    bench: function (g) {
      var wood = c('#8a6a44'), wood2 = c('#7a5a38');
      for (var sk = 0; sk < 3; sk++) g.box(-0.9, 0.4, -0.25 + sk * 0.17, 1.8, 0.06, 0.14, GB.UV0, sk % 2 ? wood2 : wood);   // seat slats
      for (sk = 0; sk < 3; sk++) g.box(-0.9, 0.5 + sk * 0.16, -0.3, 1.8, 0.12, 0.06, GB.UV0, sk % 2 ? wood2 : wood);     // back slats
      g.box(-0.85, 0, -0.25, 0.08, 0.45, 0.5, GB.UV0, METAL); g.box(0.77, 0, -0.25, 0.08, 0.45, 0.5, GB.UV0, METAL);
      g.box(-0.85, 0.45, -0.3, 0.08, 0.55, 0.08, GB.UV0, METAL); g.box(0.77, 0.45, -0.3, 0.08, 0.55, 0.08, GB.UV0, METAL);
      g.box(-0.85, 0.42, -0.25, 0.08, 0.06, 0.08, GB.UV0, METAL); g.box(0.77, 0.42, -0.25, 0.08, 0.06, 0.08, GB.UV0, METAL);   // armrest stubs
    },
    hydrant: function (g) {
      var red = c('#c94040'), cap = c('#e2b43a');
      g.cylinder(0, 0, 0, 0.2, 0.17, 0.12, 8, red); g.cylinder(0, 0.12, 0, 0.15, 0.14, 0.5, 8, red); g.sphere(0, 0.64, 0, 0.16, 7, 4, red);
      g.cylinder(0, 0.75, 0, 0.07, 0.05, 0.08, 6, cap);
      g.box(-0.27, 0.32, -0.07, 0.54, 0.14, 0.14, GB.UV0, red); g.cylinder(-0.3, 0.3, 0, 0.08, 0.08, 0.17, 6, cap, null, true); g.cylinder(0.3, 0.3, 0, 0.08, 0.08, 0.17, 6, cap, null, true);
      g.box(-0.08, 0.35, -0.2, 0.16, 0.1, 0.1, GB.UV0, cap);
      glowing(g, 0.4, function () { g.box(-0.06, 0.5, -0.17, 0.12, 0.05, 0.02, GB.UV0, [1, 1, 0.9]); });   // a reflector strip
    },
    // a bus shelter: two posts, a glass back, a roof and a bench (world prop kind 'busstop', yaw 0 opens toward -z)
    busstop: function (g) {
      var glass = c('#6f9bb5'), frame = METAL, seat = c('#8a6a44');
      g.box(-1.6, 0, 0.5, 0.1, 2.5, 0.1, GB.UV0, frame); g.box(1.5, 0, 0.5, 0.1, 2.5, 0.1, GB.UV0, frame);
      g.box(-1.55, 0.4, 0.55, 3.1, 1.9, 0.03, GB.UV0, glass);
      g.box(-1.8, 2.45, -0.9, 3.6, 0.12, 1.6, GB.UV0, frame); g.box(-1.75, 2.57, -0.85, 3.5, 0.06, 1.5, GB.UV0, c('#dfe3e8'));
      g.box(-1.3, 0.45, 0.2, 2.6, 0.06, 0.4, GB.UV0, seat); g.box(-1.2, 0, 0.3, 0.06, 0.45, 0.2, GB.UV0, frame); g.box(1.14, 0, 0.3, 0.06, 0.45, 0.2, GB.UV0, frame);
      g.box(1.62, 1.6, -0.6, 0.06, 0.5, 0.8, GB.UV0, c('#2c3e7a'));   // the route sign
    },
    // a concrete planter with a clipped shrub (world prop kind 'planter')
    planter: function (g) {
      g.box(-0.6, 0, -0.6, 1.2, 0.5, 1.2, GB.UV0, CONC); g.box(-0.65, 0.45, -0.65, 1.3, 0.08, 1.3, GB.UV0, CONCD);
      g.box(-0.55, 0.5, -0.55, 1.1, 0.06, 1.1, GB.UV0, c('#4a3a2a'));
      g.sphere(0, 0.85, 0, 0.55, 7, 4, c('#2f6b2c'), null, 0.8); g.sphere(0.25, 1.0, 0.2, 0.35, 6, 3, c('#3a7d34'), null, 0.9);
    },
    // a parked bicycle leaning on its stand (world prop kind 'bike'), along z
    bike: function (g) {
      var frame = c('#c0392b'), tyre = [0.1, 0.1, 0.11], rim = c('#c9ccd4');
      [[-0.55], [0.55]].forEach(function (p) {
        for (var i = 0; i < 10; i++) { var a0 = i / 10 * TAU, a1 = (i + 1) / 10 * TAU; g.quad([-0.02, 0.33 + Math.cos(a0) * 0.33, p[0] + Math.sin(a0) * 0.33], [0.02, 0.33 + Math.cos(a0) * 0.33, p[0] + Math.sin(a0) * 0.33], [0.02, 0.33 + Math.cos(a1) * 0.33, p[0] + Math.sin(a1) * 0.33], [-0.02, 0.33 + Math.cos(a1) * 0.33, p[0] + Math.sin(a1) * 0.33], GB.UV0, tyre); }
        g.box(-0.005, 0.03, p[0] - 0.02, 0.01, 0.6, 0.04, GB.UV0, rim); g.box(-0.005, 0.31, p[0] - 0.3, 0.01, 0.04, 0.6, GB.UV0, rim);
      });
      g.box(-0.02, 0.33, -0.55, 0.04, 0.04, 1.1, GB.UV0, frame);                          // the chain stay line
      g.quad([-0.02, 0.33, -0.55], [0.02, 0.33, -0.55], [0.02, 0.95, -0.2], [-0.02, 0.95, -0.2], GB.UV0, frame); g.quad([-0.02, 0.95, -0.2], [0.02, 0.95, -0.2], [0.02, 0.33, -0.55], [-0.02, 0.33, -0.55], GB.UV0, frame);
      g.quad([-0.02, 0.33, 0.55], [0.02, 0.33, 0.55], [0.02, 0.9, 0.2], [-0.02, 0.9, 0.2], GB.UV0, frame); g.quad([-0.02, 0.9, 0.2], [0.02, 0.9, 0.2], [0.02, 0.33, 0.55], [-0.02, 0.33, 0.55], GB.UV0, frame);
      g.box(-0.02, 0.9, -0.22, 0.04, 0.04, 0.44, GB.UV0, frame);                           // top tube
      g.box(-0.12, 0.95, 0.12, 0.24, 0.05, 0.18, GB.UV0, [0.12, 0.12, 0.13]);             // saddle
      g.box(-0.22, 0.97, -0.28, 0.44, 0.03, 0.03, GB.UV0, rim);                           // bars
    },
    // a street litter bin with a domed lid and a bag poking out (world prop kind 'trash')
    trash: function (g) {
      var green = c('#2f6b4a');
      g.cylinder(0, 0, 0, 0.3, 0.32, 0.9, 8, green); for (var k = 0; k < 8; k++) { var a = k / 8 * TAU; g.box(Math.cos(a) * 0.3 - 0.02, 0.1, Math.sin(a) * 0.3 - 0.02, 0.04, 0.7, 0.04, GB.UV0, shade3(green, -0.3)); }
      g.cylinder(0, 0.9, 0, 0.34, 0.3, 0.1, 8, METAL); g.sphere(0, 0.98, 0, 0.3, 8, 3, METAL, null, 0.5);
      g.box(-0.1, 0.95, -0.34, 0.2, 0.18, 0.04, GB.UV0, [0.1, 0.1, 0.1]);
      g.sphere(0.2, 1.05, 0.15, 0.12, 6, 3, [0.15, 0.15, 0.16], null, 0.9);
    },
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
    bin: function (g) {
      var navy = c('#2c3e50');
      g.cylinder(0, 0, 0, 0.3, 0.32, 1, 8, navy); for (var k = 0; k < 8; k++) { var a = (k + 0.5) / 8 * TAU; g.box(Math.cos(a) * 0.31 - 0.015, 0.08, Math.sin(a) * 0.31 - 0.015, 0.03, 0.8, 0.03, GB.UV0, shade3(navy, 0.18)); }
      g.cylinder(0, 0.95, 0, 0.35, 0.35, 0.08, 8, METAL); g.cylinder(0, 1.03, 0, 0.3, 0.22, 0.06, 8, METAL);
      g.box(-0.12, 0.5, -0.325, 0.24, 0.12, 0.02, GB.UV0, [0.9, 0.88, 0.8]);   // the notice
    },
    pool: function (g) { g.box(-4.5, 0, -2.5, 9, 0.3, 5, GB.UV0, CONCL()); g.box(-4.1, 0.05, -2.1, 8.2, 0.3, 4.2, GB.UV0, c('#39b6e8')); },
    tableSmall: function (g) { PROPS.table(g); },

    // ---- expansion props (GDD_EXPANSION §1.5). Mesh-local: yaw 0 faces -z; ground at y 0. ----
    // an 8 m glass tube on a leg, reaching out from the terminal's airside face (-z) to a parked plane
    jetbridge: function (g) {
      var glass = c('#6f9bb5'), frame = METAL;
      g.box(-1.2, 3.0, -8, 2.4, 2.4, 8, GB.UV0, glass, GB.NO_BOTTOM);
      g.box(-1.25, 2.95, -8, 2.5, 0.12, 8, GB.UV0, frame); g.box(-1.25, 5.3, -8, 2.5, 0.12, 8, GB.UV0, frame);
      g.box(-1.4, 2.6, -8.6, 2.8, 3.0, 1.4, GB.UV0, c('#dfe3e8'));   // the cab at the plane end
      g.cylinder(0, 0, -5.5, 0.35, 0.3, 3.0, 6, frame, null, false); g.box(-0.9, 0, -6.1, 1.8, 0.3, 1.2, GB.UV0, CONCD);
    },
    // a red airfield beacon dome (the blink is a Points sprite the renderer adds)
    beacon: function (g) { g.cylinder(0, 0, 0, 0.3, 0.3, 0.2, 6, METAL); g.sphere(0, 0.35, 0, 0.26, 6, 3, [1, 0.18, 0.15]); },
    // a baggage cart with two cases
    luggage: function (g) {
      g.box(-0.6, 0.35, -0.4, 1.2, 0.08, 0.8, GB.UV0, METAL); g.box(-0.62, 0.35, -0.42, 0.06, 0.9, 0.84, GB.UV0, METAL);
      for (var i = 0; i < 4; i++) g.cylinder(i % 2 ? 0.5 : -0.5, 0.1, i < 2 ? -0.3 : 0.3, 0.12, 0.12, 0.06, 6, [0.1, 0.1, 0.12]);
      g.box(-0.5, 0.43, -0.35, 0.9, 0.5, 0.7, GB.UV0, c('#8a2f2f')); g.box(-0.4, 0.93, -0.3, 0.7, 0.35, 0.6, GB.UV0, c('#2c3e7a'));
    },
    // a runway edge light: a small amber lens on a stub (the glow is a Points sprite)
    edgelight: function (g) { g.box(-0.12, 0, -0.12, 0.24, 0.22, 0.24, GB.UV0, METAL); g.sphere(0, 0.3, 0, 0.14, 6, 3, [1, 0.85, 0.4]); },
    // a 6 m pole with an orange sock streaming east
    windsock: function (g) {
      g.cylinder(0, 0, 0, 0.07, 0.05, 6, 6, METAL, null, false); g.cylinder(0, 5.75, 0, 0.3, 0.3, 0.1, 8, METAL);
      tubeX(g, 0.3, 3.2, 5.95, 0, 0.32, 0.12, 6, c('#f08a2a'));
      tubeX(g, 1.2, 2.0, 5.95, 0, 0.26, 0.2, 6, [1, 1, 1]);
    },
    // the airliner in Goldplate gold: a 24 m fuselage along z (nose at -z), 22 m wings, a tail, engines, gear
    plane: function (g) {
      var gold = c(PAL.planeGold), trim = c(PAL.planeTrim), dark = [0.12, 0.13, 0.16], L = 24, r = 1.6;
      tubeZ(g, -L / 2 + 3, L / 2 - 4, 2.2, 0, r, r, 10, gold);
      tubeZ(g, -L / 2, -L / 2 + 3, 2.2, 0, 0.35, r, 10, trim);           // nose
      tubeZ(g, L / 2 - 4, L / 2, 2.2, 0, r, 0.45, 10, gold);              // tail taper
      g.box(-r - 0.02, 2.5, -L / 2 + 3.5, r * 2 + 0.04, 0.5, L - 8, GB.UV0, dark);   // a window strip through both sides
      g.box(-r - 0.05, 1.3, -L / 2 + 0.5, r * 2 + 0.1, 0.35, L - 1.5, GB.UV0, trim);   // the cheat line
      // wings: swept planks either side, slightly thick so they read from above and below
      wingQuad(g, [r - 0.2, 1.6, -1.5], [11, 1.9, 1.5], [11, 1.9, 3.2], [r - 0.2, 1.6, 3.5], gold, 0.22);
      wingQuad(g, [-r + 0.2, 1.6, 3.5], [-11, 1.9, 3.2], [-11, 1.9, 1.5], [-r + 0.2, 1.6, -1.5], gold, 0.22);
      // tailplane and fin
      wingQuad(g, [0.4, 2.6, 8.5], [4.5, 2.7, 10.5], [4.5, 2.7, 11.5], [0.4, 2.6, 11], gold, 0.14);
      wingQuad(g, [-0.4, 2.6, 11], [-4.5, 2.7, 11.5], [-4.5, 2.7, 10.5], [-0.4, 2.6, 8.5], gold, 0.14);
      g.quad([0, 3.4, 8.2], [0, 3.4, 12], [0, 7.4, 12.2], [0, 7.4, 10.8], GB.UV0, trim); g.quad([0, 3.4, 12], [0, 3.4, 8.2], [0, 7.4, 10.8], [0, 7.4, 12.2], GB.UV0, trim);
      g.box(-0.08, 3.4, 8.2, 0.16, 4, 3.8, GB.UV0, gold);
      // engines under the wings, landing gear
      tubeZ(g, -0.5, 3.4, 1.0, 5.2, 0.75, 0.75, 8, trim); tubeZ(g, -0.5, 3.4, 1.0, -5.2, 0.75, 0.75, 8, trim);
      g.cylinder(0, 0, -8, 0.14, 0.14, 1.2, 5, METAL, null, false); g.cylinder(0, 0, -8, 0.45, 0.45, 0.4, 6, dark);
      g.cylinder(2.2, 0, 2, 0.14, 0.14, 1.2, 5, METAL, null, false); g.cylinder(2.2, 0, 2, 0.5, 0.5, 0.45, 6, dark);
      g.cylinder(-2.2, 0, 2, 0.14, 0.14, 1.2, 5, METAL, null, false); g.cylinder(-2.2, 0, 2, 0.5, 0.5, 0.45, 6, dark);
      g.box(-0.5, 2.9, -L / 2 + 2.2, 1.0, 0.5, 1.2, GB.UV0, dark);   // cockpit glass
    },
    // the cartoon fighter on its plinth: THE JET, ARRIVING
    jet: function (g) {
      var grey = c('#c9d3dc'), gold = c(PAL.planeGold), dark = [0.12, 0.13, 0.16];
      g.box(-1.5, 0, -1.5, 3, 1.0, 3, GB.UV0, CONC); g.box(-1.1, 1.0, -1.1, 2.2, 0.3, 2.2, GB.UV0, CONCD);
      g.box(-0.2, 1.3, -0.5, 0.4, 1.2, 1.0, GB.UV0, METAL);   // the pylon
      tubeZ(g, -4, 2.5, 3.0, 0, 0.55, 0.55, 8, grey); tubeZ(g, 2.5, 4, 3.0, 0, 0.55, 0.3, 8, gold);
      tubeZ(g, -4, -2.6, 3.0, 0, 0.5, 0.55, 8, grey);
      g.box(-0.35, 3.3, -2.6, 0.7, 0.45, 1.4, GB.UV0, dark);     // canopy
      wingQuad(g, [0.5, 2.9, 0], [3.2, 2.9, 2.6], [3.2, 2.9, 3.4], [0.5, 2.9, 3.0], grey, 0.12);
      wingQuad(g, [-0.5, 2.9, 3.0], [-3.2, 2.9, 3.4], [-3.2, 2.9, 2.6], [-0.5, 2.9, 0], grey, 0.12);
      g.box(-0.06, 3.4, 2.2, 0.12, 1.5, 1.6, GB.UV0, gold);       // fin
      g.box(-0.6, 2.6, 3.6, 1.2, 0.8, 0.3, GB.UV0, [1, 0.45, 0.1]);   // the burner
    },
    // the control tower's cab: a glass octagon 14 m across (it overhangs the 12 m shaft, so it reads from the street),
    // 3.4 m tall, on a flared floor slab under a wider roof disc
    cab: function (g) {
      g.cylinder(0, -1.2, 0, 5.2, 7.4, 1.2, 8, CONCD, null, false);
      g.cylinder(0, 0, 0, 7.4, 7.4, 0.5, 8, c('#dfe3e8'));
      g.cylinder(0, 0.5, 0, 7.0, 7.2, 2.6, 8, c('#4f7f9a'));
      for (var i = 0; i < 8; i++) { var a = i / 8 * TAU; g.box(Math.cos(a) * 7.05 - 0.1, 0.5, Math.sin(a) * 7.05 - 0.1, 0.2, 2.6, 0.2, GB.UV0, METAL); }
      g.cylinder(0, 3.1, 0, 7.8, 7.6, 0.4, 8, c('#dfe3e8'));
      g.cylinder(0, 3.5, 0, 2.0, 1.6, 0.5, 8, CONCD);
    },
    // the hangar's roll-up door across the whole front (faces -z)
    rolldoor: function (g) {
      g.box(-4.5, 0, -0.2, 9, 6.5, 0.2, GB.UV0, [0.23, 0.24, 0.27]);
      for (var i = 0; i < 12; i++) g.box(-4.4, 0.2 + i * 0.52, -0.24, 8.8, 0.26, 0.05, GB.UV0, i % 2 ? [0.3, 0.31, 0.34] : [0.18, 0.19, 0.22]);
      g.box(-4.6, 6.4, -0.3, 9.2, 0.3, 0.35, GB.UV0, c(PAL.gold));
    },
    // a pallet with two crates on it (knockable)
    pallet: function (g) { g.box(-0.6, 0, -0.5, 1.2, 0.14, 1.0, GB.UV0, c('#8a6a44')); g.box(-0.5, 0.14, -0.4, 0.6, 0.6, 0.8, GB.UV0, c('#8a6a44')); g.box(0.12, 0.14, -0.3, 0.42, 0.42, 0.6, GB.UV0, c('#5a3f2a')); },
    // a shipping container 2.4 x 2.6 x 6 m (white: the instance colour paints it), corrugated, doors at +z
    container: function (g) {
      var w = 2.4, h = 2.6, L = 6, hw = w / 2, hl = L / 2, base = [0.92, 0.92, 0.92], rib = [0.74, 0.74, 0.74];
      g.box(-hw, 0, -hl, w, h, L, GB.UV0, base);
      for (var i = 1; i < 12; i++) { var z = -hl + i * L / 12; g.box(-hw - 0.03, 0.15, z - 0.05, 0.03, h - 0.3, 0.1, GB.UV0, rib); g.box(hw, 0.15, z - 0.05, 0.03, h - 0.3, 0.1, GB.UV0, rib); }
      g.box(-hw + 0.1, 0.2, hl, w - 0.2, h - 0.4, 0.03, GB.UV0, rib); g.box(-0.03, 0.2, hl + 0.03, 0.06, h - 0.4, 0.02, GB.UV0, [0.3, 0.3, 0.3]);
      g.box(-hw + 0.3, 0.9, -1.2, 0.02, 0.6, 2.4, GB.UV0, [0.2, 0.2, 0.22]); g.box(hw - 0.32, 0.9, -1.2, 0.02, 0.6, 2.4, GB.UV0, [0.2, 0.2, 0.22]);   // the label plate
      for (i = 0; i < 4; i++) g.box(i % 2 ? hw - 0.2 : -hw, -0.02, i < 2 ? -hl : hl - 0.2, 0.2, 0.08, 0.2, GB.UV0, [0.2, 0.2, 0.22]);
    },
    // a gantry crane: four legs, a top frame, a boom with a trolley and a cab (the legs' collision is separate)
    crane: function (g) {
      var orange = c('#f08a2a'), dark = METAL;
      [[-5, -3], [5, -3], [-5, 3], [5, 3]].forEach(function (p) { g.box(p[0] - 0.4, 0, p[1] - 0.4, 0.8, 16, 0.8, GB.UV0, orange, GB.NO_BOTTOM); });
      g.box(-5.6, 16, -3.5, 11.2, 1.4, 1.2, GB.UV0, orange); g.box(-5.6, 16, 2.3, 11.2, 1.4, 1.2, GB.UV0, orange);
      g.box(-5.2, 16.2, -3.5, 0.6, 1.0, 7.0, GB.UV0, orange); g.box(4.6, 16.2, -3.5, 0.6, 1.0, 7.0, GB.UV0, orange);
      g.box(-5.6, 16.3, -0.6, 17.5, 0.9, 1.2, GB.UV0, orange);          // the boom reaching +x
      g.box(-2, 15.3, -1.2, 2.4, 1.2, 2.4, GB.UV0, dark);               // the trolley
      g.cylinder(-0.8, 10.5, 0, 0.05, 0.05, 4.8, 4, dark, null, false); g.box(-1.5, 9.6, -0.5, 1.4, 0.9, 1.0, GB.UV0, c(PAL.gold));   // the hook block
      g.box(1.0, 14.0, 3.6, 2.4, 2.0, 2.2, GB.UV0, c('#dfe3e8')); g.box(1.1, 14.6, 5.8, 2.2, 1.0, 0.05, GB.UV0, [0.3, 0.45, 0.55]);   // the cab
      for (var k = 0; k < 6; k++) { g.box(-5.3, 2 + k * 2.3, -3.2, 10.6, 0.25, 0.25, GB.UV0, dark); g.box(-5.3, 2 + k * 2.3, 2.95, 10.6, 0.25, 0.25, GB.UV0, dark); }
    },
    craneleg: function (g) { g.box(-0.4, 0, -0.4, 0.8, 1, 0.8, GB.UV0, c('#f08a2a'), GB.NO_BOTTOM); },
    // THE MANIFEST: a 60 m container ship along x, stern at -x, twelve containers on deck, a bridge and a funnel
    ship: function (g) {
      var hull = [0.16, 0.2, 0.3], red = c('#8a2f2f'), deck = [0.5, 0.52, 0.55], white = [0.93, 0.93, 0.9], L = 60, W = 14, hw = W / 2;
      g.box(-L / 2 + 4, -0.6, -hw, L - 10, 1.2, W, GB.UV0, red, GB.NO_BOTTOM);
      g.box(-L / 2 + 4, 0.6, -hw, L - 10, 4.4, W, GB.UV0, hull, GB.NO_BOTTOM);
      // bow: a wedge from the hull's +x end to a point
      g.quad([L / 2 - 6, -0.6, -hw], [L / 2 - 6, 5, -hw], [L / 2, 5, 0], [L / 2, -0.6, 0], GB.UV0, hull);
      g.quad([L / 2, -0.6, 0], [L / 2, 5, 0], [L / 2 - 6, 5, hw], [L / 2 - 6, -0.6, hw], GB.UV0, hull);
      g.quad([L / 2 - 6, 5, -hw], [L / 2 - 6, 5, hw], [L / 2, 5, 0], [L / 2, 5, 0], GB.UV0, deck);
      g.quad([-L / 2 + 4, -0.6, hw], [-L / 2 + 4, 5, hw], [-L / 2, 5, hw - 3], [-L / 2, -0.6, hw - 3], GB.UV0, hull);   // stern
      g.quad([-L / 2, -0.6, -hw + 3], [-L / 2, 5, -hw + 3], [-L / 2 + 4, 5, -hw], [-L / 2 + 4, -0.6, -hw], GB.UV0, hull);
      g.quad([-L / 2, -0.6, hw - 3], [-L / 2, 5, hw - 3], [-L / 2, 5, -hw + 3], [-L / 2, -0.6, -hw + 3], GB.UV0, hull);
      g.quad([-L / 2 + 4, 5, hw], [-L / 2 + 4, 5, -hw], [-L / 2, 5, -hw + 3], [-L / 2, 5, hw - 3], GB.UV0, deck);
      g.box(-L / 2 + 4, 5, -hw, L - 10, 0.2, W, GB.UV0, deck);
      // superstructure at the stern
      g.box(-L / 2 + 5, 5.2, -5, 9, 9, 10, GB.UV0, white); g.box(-L / 2 + 4.5, 12.5, -5.5, 10, 2.4, 11, GB.UV0, white);
      g.box(-L / 2 + 14.55, 13.1, -5, 0.05, 1.2, 10, GB.UV0, [0.2, 0.3, 0.4]);
      g.cylinder(-L / 2 + 8, 14.9, 0, 1.2, 1.0, 3.5, 8, red, null, false); g.cylinder(-L / 2 + 8, 18.3, 0, 1.0, 1.0, 0.4, 8, [0.1, 0.1, 0.12]);
      g.cylinder(-L / 2 + 12, 14.9, 0, 0.08, 0.06, 6, 4, METAL, null, false);
      // containers on deck: 2 rows x 3 columns x 2 high in the shipping colours
      var cols = PAL.containers || ['#c94040'];
      for (var i = 0; i < 12; i++) { var cx = -8 + (i % 3) * 6.5, cz = ((i >> 2) % 2 ? 1.4 : -4.0) + (i >= 6 ? 0 : 0), lvl = i >= 6 ? 1 : 0; var row = (i % 6) >= 3 ? 1 : 0; cz = row ? 1.4 : -4.0; g.box(cx, 5.2 + lvl * 2.6, cz, 6, 2.6, 2.4, GB.UV0, c(cols[(i * 5 + 1) % cols.length])); }
      for (i = 0; i < 6; i++) g.box(12 + (i % 3) * 3.0, 5.2, i < 3 ? -4 : 1.4, 2.4, 2.6, 2.4, GB.UV0, c(cols[(i * 3 + 2) % cols.length]));
      g.box(-L / 2 + 4, 5.2, -hw, L - 10, 0.9, 0.12, GB.UV0, white); g.box(-L / 2 + 4, 5.2, hw - 0.12, L - 10, 0.9, 0.12, GB.UV0, white);   // bulwarks
    },
    // the Ferry to Elsewhere: a 20 m flat ferry along z with a wheelhouse, moored and never leaving
    ferryboat: function (g) {
      var hull = [0.92, 0.92, 0.9], blue = c('#2c3e7a'), deck = [0.55, 0.5, 0.42], L = 20, W = 7, hw = W / 2;
      g.box(-hw, -0.3, -L / 2 + 1.5, W, 1.6, L - 3, GB.UV0, hull, GB.NO_BOTTOM);
      g.quad([-hw, -0.3, -L / 2 + 1.5], [-hw, 1.3, -L / 2 + 1.5], [0, 1.3, -L / 2], [0, -0.3, -L / 2], GB.UV0, hull);
      g.quad([0, -0.3, -L / 2], [0, 1.3, -L / 2], [hw, 1.3, -L / 2 + 1.5], [hw, -0.3, -L / 2 + 1.5], GB.UV0, hull);
      g.quad([hw, -0.3, L / 2 - 1.5], [hw, 1.3, L / 2 - 1.5], [0, 1.3, L / 2], [0, -0.3, L / 2], GB.UV0, hull);
      g.quad([0, -0.3, L / 2], [0, 1.3, L / 2], [-hw, 1.3, L / 2 - 1.5], [-hw, -0.3, L / 2 - 1.5], GB.UV0, hull);
      g.box(-hw, 0.2, -L / 2 + 1.5, W, 0.35, L - 3, GB.UV0, blue);   // the blue band
      g.box(-hw + 0.2, 1.3, -L / 2 + 1.2, W - 0.4, 0.15, L - 2.4, GB.UV0, deck);
      g.box(-1.6, 1.45, -1.5, 3.2, 2.6, 3.4, GB.UV0, hull); g.box(-1.65, 2.5, -1.55, 3.3, 0.9, 3.5, GB.UV0, [0.2, 0.3, 0.4]); g.box(-1.8, 4.05, -1.7, 3.6, 0.2, 3.8, GB.UV0, blue);
      g.cylinder(0, 4.2, 0, 0.06, 0.05, 2.0, 4, METAL, null, false);
      for (var k = 0; k <= 8; k++) { var z = -L / 2 + 1.6 + k * (L - 3.2) / 8; g.box(-hw + 0.1, 1.45, z - 0.04, 0.08, 1.0, 0.08, GB.UV0, METAL); g.box(hw - 0.18, 1.45, z - 0.04, 0.08, 1.0, 0.08, GB.UV0, METAL); }
      g.box(-hw + 0.1, 2.4, -L / 2 + 1.6, 0.08, 0.06, L - 3.2, GB.UV0, METAL); g.box(hw - 0.18, 2.4, -L / 2 + 1.6, 0.08, 0.06, L - 3.2, GB.UV0, METAL);
      g.box(-2.5, 1.0, L / 2 - 0.2, 5, 0.15, 2.4, GB.UV0, deck);   // the loading ramp, down but going nowhere
    },
    // a lectern: the podium every waiting room needs
    podium: function (g) { var wood = c('#5a3f2a'); g.box(-0.35, 0, -0.3, 0.7, 1.1, 0.6, GB.UV0, wood); g.quad([-0.45, 1.1, 0.3], [0.45, 1.1, 0.3], [0.45, 1.3, -0.35], [-0.45, 1.3, -0.35], GB.UV0, wood); g.box(-0.45, 1.05, -0.35, 0.9, 0.06, 0.65, GB.UV0, c('#8a6a44')); g.box(-0.1, 1.2, -0.05, 0.2, 0.25, 0.1, GB.UV0, METAL); },
    // a cardboard heckler on a stand (knockable): a ped-shaped flat with a raised fist
    cutout: function (g) {
      var card = [0.93, 0.88, 0.78], line = [0.3, 0.26, 0.22];
      g.box(-0.5, 0, -0.3, 1.0, 0.08, 0.6, GB.UV0, line); g.box(-0.04, 0, -0.04, 0.08, 1.0, 0.08, GB.UV0, line);
      g.box(-0.34, 0.25, -0.03, 0.68, 1.0, 0.06, GB.UV0, card);                 // torso
      g.box(-0.42, 0.95, -0.03, 0.26, 0.5, 0.06, GB.UV0, card); g.box(0.16, 1.1, -0.03, 0.26, 0.55, 0.06, GB.UV0, card);   // arms, one raised
      g.box(-0.2, 0, -0.03, 0.17, 0.3, 0.06, GB.UV0, card); g.box(0.03, 0, -0.03, 0.17, 0.3, 0.06, GB.UV0, card);
      g.sphere(0, 1.5, 0, 0.26, 7, 4, card, null, 1); g.box(-0.2, 1.42, -0.27, 0.4, 0.1, 0.02, GB.UV0, line);   // head, a scowl
    },
    // a 4 m chain-link panel along z: posts, three rails, wire
    fence: function (g) {
      g.box(-0.05, 0, -2.05, 0.1, 2.0, 0.1, GB.UV0, METAL); g.box(-0.05, 0, 1.95, 0.1, 2.0, 0.1, GB.UV0, METAL);
      for (var r = 0; r < 3; r++) g.box(-0.03, 0.1 + r * 0.9, -2, 0.06, 0.05, 4, GB.UV0, METAL);
      for (var k = 1; k < 10; k++) g.box(-0.01, 0.1, -2 + k * 0.4, 0.02, 1.85, 0.02, GB.UV0, [0.6, 0.62, 0.66]);
    },
    // a stone column (unit height, scaled by the prop's h)
    column: function (g) { g.cylinder(0, 0, 0, 0.5, 0.42, 1, 10, c(PAL.concreteLight)); g.cylinder(0, 0, 0, 0.62, 0.6, 0.03, 10, c(PAL.concreteLight)); g.cylinder(0, 0.96, 0, 0.44, 0.64, 0.04, 10, c(PAL.concreteLight)); },
    // the WELL, ACTUALLY statue: a bronze figure with one finger raised, on a plinth
    statue: function (g) {
      var bronze = c('#6b5a2a'), stone = CONC;
      g.box(-0.9, 0, -0.9, 1.8, 1.2, 1.8, GB.UV0, stone); g.box(-0.7, 1.2, -0.7, 1.4, 0.12, 1.4, GB.UV0, CONCD);
      g.cylinder(0, 1.3, 0, 0.32, 0.26, 1.1, 7, bronze); g.cylinder(0, 2.4, 0, 0.36, 0.3, 0.9, 7, bronze);
      g.sphere(0, 3.55, 0, 0.26, 7, 4, bronze, null, 1);
      g.box(-0.5, 2.3, -0.12, 0.2, 0.9, 0.24, GB.UV0, bronze);                 // the resting arm
      g.box(0.3, 2.6, -0.12, 0.2, 1.0, 0.24, GB.UV0, bronze); g.box(0.36, 3.6, -0.06, 0.08, 0.5, 0.12, GB.UV0, bronze);   // the raised arm, the finger
    },
    // THE FIRST TAKE (ATTRIBUTED): a bronze folding table on a plinth outside the museum
    statue_table: function (g) {
      var bronze = c('#6b5a2a');
      g.box(-1.3, 0, -0.8, 2.6, 0.9, 1.6, GB.UV0, CONC); g.box(-1.1, 0.9, -0.6, 2.2, 0.1, 1.2, GB.UV0, CONCD);
      g.box(-0.9, 1.72, -0.4, 1.8, 0.06, 0.8, GB.UV0, bronze);
      for (var i = 0; i < 4; i++) g.box((i % 2 ? 0.78 : -0.84), 1.0, (i < 2 ? -0.36 : 0.3), 0.06, 0.72, 0.06, GB.UV0, bronze);
      g.box(-0.5, 1.78, -0.2, 1.0, 0.02, 0.4, GB.UV0, c('#8a7a4a'));
    },
    // a stanchion with a rope trailing +x to its neighbour (knockable)
    stanchion: function (g) { var brass = c('#c9a24a'); g.cylinder(0, 0, 0, 0.2, 0.18, 0.05, 8, brass); g.cylinder(0, 0.05, 0, 0.04, 0.04, 0.95, 5, brass, null, false); g.sphere(0, 1.02, 0, 0.07, 6, 3, brass); g.box(0, 0.82, -0.025, 2.1, 0.05, 0.05, GB.UV0, c('#8a2f2f')); },
    // the bandstand that has never hosted a band: an octagonal floor, eight pillars, a conical roof
    gazebo: function (g) {
      var white = [0.93, 0.92, 0.88], roof = c('#2e3038');
      g.cylinder(0, 0, 0, 4.2, 4.2, 0.5, 8, CONCL()); g.cylinder(0, 0.5, 0, 4.0, 4.0, 0.08, 8, c('#8a6a44'));
      for (var i = 0; i < 8; i++) { var a = (i + 0.5) / 8 * TAU; g.cylinder(Math.cos(a) * 3.6, 0.58, Math.sin(a) * 3.6, 0.14, 0.12, 3.0, 6, white, null, false); g.box(Math.cos(a) * 3.6 - 0.6, 1.3, Math.sin(a) * 3.6 - 0.04, 1.2, 0.05, 0.08, GB.UV0, white); }
      g.cylinder(0, 3.5, 0, 4.5, 4.5, 0.25, 8, white);
      g.cylinder(0, 3.75, 0, 4.5, 0.25, 2.2, 8, roof);
      g.cylinder(0, 5.9, 0, 0.1, 0.1, 0.7, 4, c(PAL.gold), null, false); g.sphere(0, 6.6, 0, 0.18, 6, 3, c(PAL.gold));
    },
    // a round fountain with a tiered centre
    fountain: function (g) {
      var stone = CONCL(), water = c('#39b6e8');
      g.cylinder(0, 0, 0, 3.0, 3.0, 0.65, 14, stone, null, false); g.cylinder(0, 0, 0, 2.7, 2.7, 0.5, 14, water);
      g.cylinder(0, 0.5, 0, 0.3, 0.26, 1.2, 8, stone, null, false); g.cylinder(0, 1.7, 0, 1.0, 1.1, 0.25, 10, stone);
      g.cylinder(0, 1.95, 0, 0.9, 0.9, 0.04, 10, water); g.cylinder(0, 1.95, 0, 0.12, 0.08, 0.8, 6, stone);
    },
    // a toll gantry across the bridge's four lanes (17.6 m): two legs and a beam the sign hangs on
    gantry: function (g) {
      var steel = c('#8a8f99'), hw = 8.8;
      g.box(-hw - 0.5, 0, -0.5, 1.0, 6.2, 1.0, GB.UV0, steel, GB.NO_BOTTOM); g.box(hw - 0.5, 0, -0.5, 1.0, 6.2, 1.0, GB.UV0, steel, GB.NO_BOTTOM);
      g.box(-hw - 0.6, 6.0, -0.6, hw * 2 + 1.2, 0.5, 1.2, GB.UV0, steel); g.box(-hw - 0.6, 7.0, -0.6, hw * 2 + 1.2, 0.4, 1.2, GB.UV0, steel);
      for (var k = 0; k < 8; k++) g.box(-hw + 0.4 + k * 2.2, 6.5, -0.1, 0.2, 0.5, 0.2, GB.UV0, steel);
      g.box(-5.8, 5.5, -0.15, 11.6, 1.5, 0.3, GB.UV0, [0.06, 0.06, 0.09]);   // the board the sign sits on
      g.box(-hw - 0.9, 0, -1.6, 1.8, 0.4, 3.2, GB.UV0, CONCD); g.box(hw - 0.9, 0, -1.6, 1.8, 0.4, 3.2, GB.UV0, CONCD);
    },
    // a stunt ramp: a 6 m striped wedge rising toward -z (the heading); the top is a real surface via World.heightAt
    ramp_prop: function (g) {
      var hw = 1.6, L = 6, H = 1.3, a = c('#e2b43a'), b = [0.1, 0.1, 0.12], side = [0.3, 0.3, 0.33];
      for (var i = 0; i < 6; i++) {
        var z0 = L / 2 - i * (L / 6), z1 = L / 2 - (i + 1) * (L / 6), y0 = H * i / 6, y1 = H * (i + 1) / 6, col = i % 2 ? b : a;
        g.quad([-hw, y0, z0], [hw, y0, z0], [hw, y1, z1], [-hw, y1, z1], GB.UV0, col);
      }
      g.quad([-hw, 0, -L / 2], [-hw, H, -L / 2], [-hw, 0, L / 2], [-hw, 0, L / 2], GB.UV0, side);
      g.quad([hw, 0, L / 2], [hw, 0, L / 2], [hw, H, -L / 2], [hw, 0, -L / 2], GB.UV0, side);
      g.quad([hw, 0, -L / 2], [hw, H, -L / 2], [-hw, H, -L / 2], [-hw, 0, -L / 2], GB.UV0, side);
    },
    // a broad flight of three steps (12 m wide) up to a door at -z
    steps: function (g) { var s = CONCL(); for (var i = 0; i < 3; i++) g.box(-6, i * 0.2, -1.5 + i * 1.0, 12, 0.2, 3 - i * 1.0, GB.UV0, s, GB.NO_BOTTOM); },
    // a 4 m promenade railing along z
    railing: function (g) { for (var k = 0; k < 4; k++) g.box(-0.04, 0, -2 + k * 1.33 + 0.6, 0.08, 1.0, 0.08, GB.UV0, METAL); g.box(-0.05, 0.95, -2, 0.1, 0.08, 4, GB.UV0, METAL); g.box(-0.03, 0.5, -2, 0.06, 0.05, 4, GB.UV0, METAL); },
    // an awning over a door (white: the instance colour paints the stripes' partner), reaching -z from the wall
    awning: function (g) {
      var white = [0.95, 0.95, 0.95];
      g.box(-2, 0, -2, 4, 0.15, 2, GB.UV0, white);
      for (var k = 0; k < 8; k += 2) g.box(-2 + k * 0.5, 0.15, -2, 0.5, 0.03, 2, GB.UV0, [0.35, 0.35, 0.38]);
      g.box(-2.05, -0.3, -2.05, 4.1, 0.3, 0.1, GB.UV0, white);
      g.box(-1.9, -2.6, -0.06, 0.08, 2.6, 0.08, GB.UV0, METAL); g.box(1.82, -2.6, -0.06, 0.08, 2.6, 0.08, GB.UV0, METAL);
    }
  };
  function CONCL() { return c(PAL.concreteLight); }
  // a tapered tube along x from x0 to x1 (radius r0 at x0, r1 at x1), open ended
  function tubeX(g, x0, x1, y, z, r0, r1, segs, col) {
    for (var i = 0; i < segs; i++) {
      var a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU;
      g.quad([x0, y + Math.cos(a0) * r0, z + Math.sin(a0) * r0], [x1, y + Math.cos(a0) * r1, z + Math.sin(a0) * r1], [x1, y + Math.cos(a1) * r1, z + Math.sin(a1) * r1], [x0, y + Math.cos(a1) * r0, z + Math.sin(a1) * r0], GB.UV0, col);
    }
  }
  // a tapered tube along z from z0 to z1, capped at both ends
  function tubeZ(g, z0, z1, y, x, r0, r1, segs, col) {
    for (var i = 0; i < segs; i++) {
      var a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU;
      g.quad([x + Math.cos(a0) * r0, y + Math.sin(a0) * r0, z0], [x + Math.cos(a1) * r0, y + Math.sin(a1) * r0, z0], [x + Math.cos(a1) * r1, y + Math.sin(a1) * r1, z1], [x + Math.cos(a0) * r1, y + Math.sin(a0) * r1, z1], GB.UV0, col);
    }
    for (i = 0; i < segs; i++) {
      a0 = i / segs * TAU; a1 = (i + 1) / segs * TAU;
      g.quad([x, y, z0], [x + Math.cos(a1) * r0, y + Math.sin(a1) * r0, z0], [x + Math.cos(a0) * r0, y + Math.sin(a0) * r0, z0], [x, y, z0], GB.UV0, col);
      g.quad([x, y, z1], [x + Math.cos(a0) * r1, y + Math.sin(a0) * r1, z1], [x + Math.cos(a1) * r1, y + Math.sin(a1) * r1, z1], [x, y, z1], GB.UV0, col);
    }
  }
  // a thick quad (a wing): the top face, the bottom face offset down by t, and the edge faces
  function wingQuad(g, a, b, c2, d, col, t) {
    var lo = function (p) { return [p[0], p[1] - t, p[2]]; };
    g.quad(a, b, c2, d, GB.UV0, col); g.quad(lo(d), lo(c2), lo(b), lo(a), GB.UV0, col);
    g.quad(lo(a), lo(b), b, a, GB.UV0, col); g.quad(lo(b), lo(c2), c2, b, GB.UV0, col); g.quad(lo(c2), lo(d), d, c2, GB.UV0, col); g.quad(lo(d), lo(a), a, d, GB.UV0, col);
  }
})();
