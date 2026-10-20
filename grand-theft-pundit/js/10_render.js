/* Grand Theft Pundit: 10_render.js
 * GTP.Render: three.js scene, chunked static meshes built from the tile map
 * and the building list, InstancedMesh props, sky dome + sun, fog, day/night
 * (lit windows, neon, lamp glow), water, fx, the third-person camera rig,
 * worldToScreen and a free camera for tests.
 *
 * Graphics track (this file + 05_assets.js + 10b_postfx.js): physically based materials under an ACES pipeline,
 * a sun / hemisphere model by the clock with an equirect sky painted on a canvas that doubles as the PMREM
 * environment map (car paint and glass reflect the sky), soft shadows, a pool of real point lights for the nearest
 * street lamps and spot lights for the nearest headlights at night, clouds / moon / stars, weather (clear, overcast,
 * rain: streaks, wet roads, puddles), chunk LOD (PBR near the camera, the old Lambert look beyond
 * QUALITY.lodDistance), quality presets with an auto mode (GTP.Render.quality) and the post-processing hand-off
 * (GTP.PostFX.render).
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util, GB = GTP.GeoBuilder;
  var TILE = C.TILE, CURB = C.CURB_H, DECK_Y = C.DECK_Y, THICK = C.DECK_THICK, WATER_Y = C.WATER_Y, FLOOR_H = C.FLOOR_H;
  var CH = C.CHUNK_TILES;
  var UNIT_H = { pillar: 1, flag: 1, mast: 1, stack: 1, antenna: 1, sign: 1, bin: 1, billboard: 1, column: 1, craneleg: 1 };
  var NO_SHADOW = { pool: 1, canopy: 1, edgelight: 1, beacon: 1, railing: 1, fence: 1, steps: 1 };
  var MAX_POINTS = 12, MAX_SPOTS = 6, MAX_RAIN = 2400, MAX_PUDDLES = 60;
  // which facade styles get which street-level and roof detail in _building (the building's own facade paints the
  // doors; the geometry lines up with them through the band's u offset)
  var DETAIL = {
    awnings: { strip: 1, marina: 1, brownstone: 1, campus: 1, suburbs: 1, barn: 0, mansion: 1 },
    canopies: { downtown: 1, goldplate: 1, capitol: 1, police: 1, hospital: 1, airport: 1, stadium: 1 },
    steps: { capitol: 1, police: 1, campus: 1, mansion: 1 },
    planters: { downtown: 1, goldplate: 1, hospital: 1, airport: 1, capitol: 1 },
    balconies: { brownstone: 1, marina: 1, mansion: 1, suburbs: 1 },
    ledges: { downtown: 1, goldplate: 1, capitol: 1, hospital: 1, airport: 1, campus: 1, police: 1, brownstone: 1 }
  };
  var _v = null, _v2 = null, _m = null, _q = null, _q2 = null, _col = null, _e = null, _c1 = null, _c2 = null, _c3 = null;

  // sky ramps the clock blends between on top of C.SKY (day / sunset / night): the dusk band, overcast and rain
  var SKYX = {
    dusk:     { top: '#2b2860', horizon: '#d9668c', fog: '#b07a8a', sun: '#ff9a60', hemiSky: '#8a6a98', hemiGround: '#3a3038' },
    dawn:     { top: '#3a5a90', horizon: '#f0b070', fog: '#d0a890', sun: '#ffd0a0', hemiSky: '#a0a0b8', hemiGround: '#4a4440' },
    overcast: { top: '#6e7a88', horizon: '#a7afb8', fog: '#9aa3ad', sun: '#dde2e8', hemiSky: '#9aa4b0', hemiGround: '#55585c', sunI: 0.5, hemiI: 0.85 },
    rain:     { top: '#4c5560', horizon: '#7f8992', fog: '#6f7982', sun: '#c8ced4', hemiSky: '#7d8792', hemiGround: '#3d4044', sunI: 0.32, hemiI: 0.8 },
    overcastNight: { top: '#06070b', horizon: '#141720', fog: '#0b0d13', sun: '#5a6478', hemiSky: '#1c2230', hemiGround: '#0c0d10' }
  };

  var Render = GTP.Render = {
    renderer: null, scene: null, camera: null, canvas: null, hudCanvas: null, hudCtx: null,
    width: 1280, height: 720, dpr: 1,
    chunks: new Map(), chunkGroup: null, entityGroup: null, fxGroup: null,
    sky: null, lights: null, water: null, night: 0, env: null, envMap: null,
    free: false, headless: false,
    stats: { frameMs: 0, chunkBuilds: 0, triangles: 0, calls: 0, envRefreshes: 0, lodNear: 0, lodFar: 0 },
    _A: null, _World: null, _buildQueue: [], _camChunk: null, _pmrem: null, _envRT: null, _envKey: null,

    init: function (canvasGl) {
      var A = Render._A = GTP.Assets, W = Render._World = GTP.World;
      _v = new THREE.Vector3(); _v2 = new THREE.Vector3(); _m = new THREE.Matrix4(); _q = new THREE.Quaternion(); _q2 = new THREE.Quaternion(); _col = new THREE.Color(); _e = new THREE.Euler();
      _c1 = new THREE.Color(); _c2 = new THREE.Color(); _c3 = new THREE.Color();
      Render.canvas = canvasGl;
      Render.headless = !!(GTP.game && GTP.game.headless);
      Render.quality.choose();                 // the preset: ?quality=, else low in headless, else auto (medium)
      A.init();
      var r = Render.renderer = new THREE.WebGLRenderer({ canvas: canvasGl, antialias: !Render.headless, powerPreference: 'high-performance', alpha: false, stencil: false });
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
      r.shadowMap.enabled = !!C.QUALITY.shadows; r.shadowMap.type = C.QUALITY.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      r.setClearColor(0x0c1020, 1);
      r.info.autoReset = false;   // frame() resets it, so stats cover the scene and every post pass
      var s = Render.scene = new THREE.Scene();
      s.fog = new THREE.Fog(0xb9cde0, C.QUALITY.fogStart, C.QUALITY.drawDistance);
      Render.camera = new THREE.PerspectiveCamera(C.CAMERA.fov, 16 / 9, 0.3, 1500);
      Render.chunkGroup = new THREE.Group(); Render.chunkGroup.name = 'chunks'; s.add(Render.chunkGroup);
      Render.entityGroup = new THREE.Group(); Render.entityGroup.name = 'entities'; s.add(Render.entityGroup);
      Render.fxGroup = new THREE.Group(); Render.fxGroup.name = 'fx'; s.add(Render.fxGroup);
      Render._initLights();
      Render._initSky();
      Render._initWater();
      Render.weather.init();
      Render.fx.init();
      Render.hudCanvas = document.getElementById('hud');
      if (Render.hudCanvas) Render.hudCtx = Render.hudCanvas.getContext('2d');
      if (GTP.PostFX && GTP.PostFX.init) { try { GTP.PostFX.init(r); } catch (e) { U.reportError(e, 'postfx.init'); } }
      Render.quality.apply(true);
      Render.resize();
      if (typeof window !== 'undefined') window.addEventListener('resize', function () { Render.resize(); });
      Render.rig.reset();
      Render.updateEnvironment(C.DAY.startClock);
    },

    resize: function () {
      var stage = Render.canvas.parentElement;
      var w = Math.max(320, (stage && stage.clientWidth) || window.innerWidth || 1280);
      var h = Math.max(240, (stage && stage.clientHeight) || window.innerHeight || 720);
      var dpr = Render.headless ? 1 : Math.min(C.MAX_DPR, window.devicePixelRatio || 1);
      Render.width = w; Render.height = h; Render.dpr = dpr;
      Render.renderer.setPixelRatio(dpr);
      Render.renderer.setSize(w, h, false);
      Render.camera.aspect = w / h; Render.camera.updateProjectionMatrix();
      if (Render.hudCanvas) {
        Render.hudCanvas.width = Math.round(w * dpr); Render.hudCanvas.height = Math.round(h * dpr);
        Render.hudCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (GTP.PostFX && GTP.PostFX.resize) { try { GTP.PostFX.resize(Math.round(w * dpr), Math.round(h * dpr)); } catch (e) { U.reportError(e, 'postfx.resize'); } }
      if (GTP.UI && GTP.UI.resize) GTP.UI.resize(w, h);
    },

    // ----------------------------------------------------------- quality --
    // Presets live in C.QUALITY_PRESETS; C.QUALITY is the live object (identity kept, keys overlaid). `auto` starts at
    // QUALITY_AUTO.start and steps down one preset whenever the frame time stays above slowMs for slowSeconds.
    quality: {
      current: 'medium', auto: false, order: ['low', 'medium', 'high', 'ultra'], _ema: 0, _slowT: 0, _cool: 0, _lastT: 0, history: [],
      list: function () { return Render.quality.order.slice(); },
      choose: function () {
        var q = Render.quality, opts = (GTP.game && GTP.game.opts) || {}, want = opts.quality ? String(opts.quality).toLowerCase() : null;
        if (!want && (opts.low === '1' || opts.low === 1 || opts.low === true || opts.low === 'true')) want = 'low';
        if (!want) want = Render.headless ? 'low' : 'auto';
        if (want === 'auto') { q.auto = true; want = C.QUALITY_AUTO.start || 'medium'; } else q.auto = false;
        if (q.order.indexOf(want) < 0) want = 'medium';
        q._overlay(want);
      },
      _overlay: function (name) {
        var P = C.QUALITY_PRESETS[name]; if (!P) return false;
        for (var k in P) C.QUALITY[k] = P[k];
        C.QUALITY.preset = name;
        Render.quality.current = name;
        return true;
      },
      // the settings menu entry point: mutate the live object, then push the change through the renderer
      set: function (name) {
        var q = Render.quality;
        if (name === 'auto') { q.auto = true; name = C.QUALITY_AUTO.start || 'medium'; } else if (C.QUALITY_PRESETS[name]) q.auto = false;
        if (!q._overlay(name)) return false;
        if (Render.renderer) q.apply(false);
        q._slowT = 0; q._cool = C.QUALITY_AUTO.cooldown || 10;
        q.history.push({ preset: name, t: GTP.game && GTP.game.time ? GTP.game.time.t : 0 });
        GTP.Events.emit('quality', { preset: name, auto: q.auto });
        return true;
      },
      // push C.QUALITY into the renderer, the lights, the materials and the post pipeline
      apply: function (first) {
        var Q = C.QUALITY, r = Render.renderer, L = Render.lights, A = Render._A, i;
        if (!r) return;
        r.shadowMap.enabled = !!Q.shadows;
        var type = Q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
        if (r.shadowMap.type !== type) r.shadowMap.type = type;
        if (L && L.sun) {
          L.sun.castShadow = !!Q.shadows;
          if (L.sun.shadow.mapSize.x !== Q.shadowMap) { L.sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap); if (L.sun.shadow.map) { L.sun.shadow.map.dispose(); L.sun.shadow.map = null; } }
          for (i = 0; i < L.points.length; i++) L.points[i].visible = i < (Q.pointLights | 0);
          for (i = 0; i < L.spots.length; i++) L.spots[i].visible = i < (Q.headlights | 0);
        }
        if (A && A.applyQuality) A.applyQuality(Q);
        if (GTP.PostFX && GTP.PostFX.setPreset) { try { GTP.PostFX.setPreset(Q); } catch (e) { U.reportError(e, 'postfx.preset'); } }
        var post = !!(Q.post && GTP.PostFX && GTP.PostFX.enabled);
        r.toneMapping = post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
        r.shadowMap.needsUpdate = true;
        if (!first) Render._refreshMaterials();
        if (Render.weather) Render.weather.applyQuality();
        if (Render.sky && Render.sky.clouds) Render.sky.clouds.visible = !!Q.clouds;
        Render._envKey = null;   // the environment map follows the preset's needs
        Render.quality._lastT = 0;
      },
      // the auto mode's watchdog, fed by frame() with the wall time between rendered frames
      measure: function (now) {
        var q = Render.quality, QA = C.QUALITY_AUTO;
        if (!q.auto || Render.headless) return;
        if (q._lastT) {
          var dt = now - q._lastT;
          if (dt > 0 && dt < 250 && GTP.game && !(GTP.game.loading && GTP.game.loading.active)) {
            q._ema = q._ema ? q._ema * 0.9 + dt * 0.1 : dt;
            if (q._cool > 0) q._cool -= dt / 1000;
            else if (q._ema > QA.slowMs) { q._slowT += dt / 1000; if (q._slowT >= QA.slowSeconds) { var idx = q.order.indexOf(q.current); if (idx > 0) { q.set(q.order[idx - 1]); q.auto = true; } q._slowT = 0; } }
            else q._slowT = Math.max(0, q._slowT - dt / 1000 * 0.5);
          }
        }
        q._lastT = now;
      }
    },
    // every material in the scene recompiles (shadow type / map toggles are not tracked by three's program cache)
    _refreshMaterials: function () {
      var seen = new Set();
      function mark(m) { if (m && !seen.has(m)) { seen.add(m); m.needsUpdate = true; } }
      Render.scene.traverse(function (o) { if (o.material) { if (Array.isArray(o.material)) o.material.forEach(mark); else mark(o.material); } });
      var A = Render._A;
      if (A) { mark(A.propMaterial()); mark(A.groundMaterial()); mark(A.waterMaterial()); A.litMaterials().forEach(mark); }
    },

    // ------------------------------------------------------------ lights --
    _initLights: function () {
      var s = Render.scene, Q = C.QUALITY, i;
      var hemi = new THREE.HemisphereLight(0x9fc3f0, 0x6c6a5c, 0.65);
      var sun = new THREE.DirectionalLight(0xfff4d6, 1.25);
      sun.castShadow = !!Q.shadows;
      var box = Q.shadowBox / 2;
      sun.shadow.camera.left = -box; sun.shadow.camera.right = box; sun.shadow.camera.top = box; sun.shadow.camera.bottom = -box;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
      sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
      sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5; sun.shadow.radius = 2;
      var target = new THREE.Object3D();
      s.add(hemi); s.add(sun); s.add(target); sun.target = target;
      var fill = new THREE.AmbientLight(0x202838, 0.0);
      s.add(fill);
      // the player's car headlights (one spot, no shadows)
      var head = new THREE.SpotLight(0xfff1d0, 4.5, 70, 0.55, 0.6, 1.0);
      head.castShadow = false; head.visible = false;
      s.add(head); s.add(head.target);
      // the pools: point lights for the nearest street lamps, spots for the nearest headlights (preset sets how many
      // are visible; an unused one sits at intensity 0 so the shader's light count never changes mid-game)
      var points = [], spots = [];
      for (i = 0; i < MAX_POINTS; i++) { var pl = new THREE.PointLight(0xffc27a, 0, 26, 1.6); pl.visible = i < (Q.pointLights | 0); pl.name = 'lamp' + i; s.add(pl); points.push(pl); }
      for (i = 0; i < MAX_SPOTS; i++) { var sl = new THREE.SpotLight(0xfff1d0, 0, 55, 0.5, 0.55, 1.0); sl.castShadow = false; sl.visible = i < (Q.headlights | 0); sl.name = 'head' + i; s.add(sl); s.add(sl.target); spots.push(sl); }
      Render.lights = { hemi: hemi, sun: sun, target: target, fill: fill, headlight: head, headlightOwner: null, sunDir: new THREE.Vector3(0.5, 0.6, 0.4), points: points, spots: spots, _lampT: 0, _lamps: null, exposure: 1.0 };
    },
    _initSky: function () {
      var A = Render._A, s = Render.scene;
      var dome = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), new THREE.MeshBasicMaterial({ map: A.sky, side: THREE.BackSide, fog: false, depthWrite: false }));
      dome.renderOrder = -10; dome.frustumCulled = false;
      var sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.sun, color: 0xffffff, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
      sun.scale.set(180, 180, 1); sun.renderOrder = -9;
      var moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.moon, color: 0xffffff, fog: false, depthWrite: false, transparent: true, opacity: 0 }));
      moon.scale.set(48, 48, 1); moon.renderOrder = -9;
      // stars
      var R = GTP.makeRng(4242), pos = [], sizes = [];
      for (var i = 0; i < 700; i++) {
        var a = R.random() * Math.PI * 2, e = 0.06 + R.random() * 0.92, c = Math.cos(e);
        pos.push(Math.cos(a) * c * 1000, Math.sin(e) * 1000, Math.sin(a) * c * 1000); sizes.push(1 + R.random() * 2);
      }
      var sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      var stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false }));
      stars.renderOrder = -9; stars.frustumCulled = false;
      // clouds: a wide plane high over the camera, layered noise thresholded by the weather's cover, drifting with the wind
      var cg = new THREE.PlaneGeometry(3600, 3600, 1, 1); cg.rotateX(-Math.PI / 2);
      var cm = new THREE.ShaderMaterial({
        uniforms: { map: { value: A.clouds }, offset: { value: new THREE.Vector2(0, 0) }, cover: { value: 0.35 }, softness: { value: 0.18 }, color: { value: new THREE.Color(0xffffff) }, shade: { value: new THREE.Color(0x8a94a8) }, opacity: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [
          'uniform sampler2D map; uniform vec2 offset; uniform float cover, softness, opacity; uniform vec3 color, shade; varying vec2 vUv;',
          'void main() {',
          '  vec2 uv = vUv * 7.0 + offset;',
          '  float n = texture2D(map, uv).r * 0.62 + texture2D(map, uv * 2.9 + offset * 0.7 + 0.37).r * 0.38;',
          '  float lo = 1.0 - cover - softness, hi = 1.0 - cover + softness;',
          '  float a = smoothstep(lo, hi, n);',
          '  float r = length(vUv - 0.5) * 2.0;',
          '  a *= 1.0 - smoothstep(0.38, 0.9, r);',
          '  float lit = smoothstep(lo, hi + 0.25, n);',
          '  vec3 col = mix(color, shade, lit * 0.75);',
          '  gl_FragColor = vec4(col, a * opacity);',
          '  #include <tonemapping_fragment>',
          '  #include <encodings_fragment>',
          '}'].join('\n'),
        transparent: true, depthWrite: false, fog: false
      });
      var clouds = new THREE.Mesh(cg, cm); clouds.renderOrder = -8; clouds.frustumCulled = false; clouds.visible = !!C.QUALITY.clouds; clouds.name = 'clouds';
      s.add(dome); s.add(sun); s.add(moon); s.add(stars); s.add(clouds);
      Render.sky = { dome: dome, sun: sun, moon: moon, stars: stars, clouds: clouds, cloudMat: cm, last: -1 };
    },
    _initWater: function () {
      var A = Render._A;
      var size = 2600;
      var geo = new THREE.PlaneGeometry(size, size, 1, 1);
      geo.rotateX(-Math.PI / 2);
      var mat = A.waterMaterial();
      A.water.repeat.set(size / 10, size / 10);
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(C.MAP_W * TILE / 2, WATER_Y, C.MAP_H * TILE / 2);
      mesh.receiveShadow = true; mesh.renderOrder = -1;
      Render.scene.add(mesh);
      Render.water = mesh;
    },

    // ------------------------------------------------------- day / night --
    nightFromClock: function (c) {
      var D = C.DAY;
      c = ((c % 24) + 24) % 24;
      if (c >= D.dayStart && c <= D.duskStart) return 0;
      if (c > D.duskStart && c < D.darkStart) return U.smoothstep((c - D.duskStart) / (D.darkStart - D.duskStart));
      if (c >= D.dawnStart && c < D.dayStart) return 1 - U.smoothstep((c - D.dawnStart) / (D.dayStart - D.dawnStart));
      return 1;
    },
    // the sun's direction and its intensity / colour factors from the clock (shared by the lights and the sky painter)
    _sunModel: function (clock) {
      var D = C.DAY, dayFrac = (clock - D.sunrise) / (D.sunset - D.sunrise);
      var elev = Math.sin(Math.PI * U.clamp(dayFrac, 0, 1)) * 62 * Math.PI / 180;   // radians above the horizon
      if (dayFrac < 0 || dayFrac > 1) elev = -0.3;
      var az = Math.PI * U.clamp(dayFrac, -0.1, 1.1);
      // the arc leans south (+z) so the noon sun sits about 55 degrees up and shadows always fall somewhere
      var dir = { x: Math.cos(az) * Math.cos(Math.max(elev, -0.2)), y: Math.max(Math.sin(elev), -0.2), z: 0.62 };
      var l = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z) || 1; dir.x /= l; dir.y /= l; dir.z /= l;
      var elevTrue = Math.asin(U.clamp(dir.y, -1, 1));
      var elevDeg = Math.max(0, elevTrue) * 180 / Math.PI;
      return { elev: elev < 0 ? elev : elevTrue, elevDeg: elevDeg, az: az, dir: dir, dayFrac: dayFrac, rising: dayFrac < 0.5 };
    },
    // interpolate sky/light presets from the clock and the weather and push them to the scene
    updateEnvironment: function (clock) {
      var SKY = C.SKY, L = Render.lights, A = Render._A, Wx = Render.weather, Q = C.QUALITY;
      clock = ((clock % 24) + 24) % 24;
      var night = Render.night = Render.nightFromClock(clock);
      var sm = Render._sunModel(clock), elev = sm.elev;
      var sunDir = L.sunDir.set(sm.dir.x, sm.dir.y, sm.dir.z);
      // warm horizon blend: full once the sun is at/below the horizon, fading out above 32 degrees
      var horizonW = Math.pow(U.clamp(1 - sm.elevDeg / 32, 0, 1), 0.6) * (1 - night);
      var duskW = 4 * night * (1 - night);                      // peaks half way through dusk and dawn
      var overcast = Wx ? Wx.overcast : 0, rain = Wx ? Wx.rain : 0;
      var twilight = sm.rising ? SKYX.dawn : SKYX.dusk;
      function mixc(key) {
        var d = _c1.set(SKY.day[key]), s = _c2.set(SKY.sunset[key]), n = _c3.set(SKY.night[key]);
        d.lerp(s, horizonW); d.lerp(_c2.set(twilight[key]), duskW * 0.55); d.lerp(n, night);
        if (overcast > 0) { var oc = _c2.set(SKYX.overcast[key]).lerp(_c3.set(SKYX.rain[key]), rain); oc.lerp(_c3.set(SKYX.overcastNight[key]), night); d.lerp(oc, overcast * 0.9); }
        return d.clone();
      }
      function mixn(key) { var v = U.lerp(SKY.day[key], SKY.sunset[key], horizonW); v = U.lerp(v, SKY.night[key], night); if (overcast > 0) { var o = U.lerp(SKYX.overcast[key], SKYX.rain[key], rain); o = U.lerp(o, SKY.night[key], night); v = U.lerp(v, o, overcast); } return v; }
      var top = mixc('top'), hor = mixc('horizon'), fog = mixc('fog'), sunC = mixc('sun'), ground = mixc('hemiGround');
      fog.multiplyScalar(U.lerp(0.94, 1.0, Math.max(night, overcast)));   // the day haze a touch less milky (the horizon band follows, so the skyline still melts into it)
      Render.scene.fog.color.copy(fog);
      var fogNear = Q.fogStart * U.lerp(1, C.WEATHER.fogStartWet, rain) * U.lerp(1, 0.85, overcast * (1 - rain));
      Render.scene.fog.near = fogNear; Render.scene.fog.far = Q.drawDistance;
      Render.renderer.setClearColor(fog, 1);
      L.hemi.color.copy(mixc('hemiSky')); L.hemi.groundColor.copy(ground); L.hemi.intensity = mixn('hemiI');
      // a physically plausible sun: the preset intensity shaped by elevation (a cosine-ish rise, warm and weak at the
      // horizon), dimmed by cloud cover; at night a faint cool moon from the opposite side
      var elevK = U.clamp(Math.sin(Math.max(0, elev)) * 2.2 + 0.08, 0, 1);
      L.sun.color.copy(sunC);
      L.sun.intensity = mixn('sunI') * (night > 0.99 ? 1 : Math.max(0.25, elevK)) * U.lerp(1, 0.38, overcast);
      if (night > 0.5) { L.sun.intensity = SKY.night.sunI * U.lerp(1, 0.5, overcast); sunDir.set(-0.3, 0.7, 0.4).normalize(); }
      // exposure by time of day (the post pipeline reads it; the renderer applies it when post is off)
      var exposure = U.lerp(U.lerp(1.0, 0.96, horizonW), 0.92, night) * U.lerp(1, 0.94, overcast);
      L.exposure = exposure;
      if (Render.renderer.toneMapping !== THREE.NoToneMapping) Render.renderer.toneMappingExposure = exposure;
      Render._paintSky(top, hor, fog, sunC, ground, sm, night, horizonW, overcast);
      var sk = Render.sky;
      sk.sun.material.opacity = elev > -0.05 ? U.clamp(1 - night, 0, 1) * U.lerp(1, 0.25, overcast) : 0;
      sk.sun.material.color.copy(sunC);
      var sunScale = 180 * (1 + horizonW * 0.7);   // the disc swells and reddens near the horizon
      sk.sun.scale.set(sunScale, sunScale, 1);
      sk.moon.material.opacity = night * 0.95 * U.lerp(1, 0.2, overcast);
      sk.stars.material.opacity = Math.max(0, night - 0.2) * 0.9 * (1 - overcast);
      // clouds: cover and tint follow the weather; the sunlit side takes the sun's colour, the shade the sky's
      var cm = sk.cloudMat.uniforms;
      cm.cover.value = U.lerp(0.34, 0.9, overcast) + rain * 0.06;
      cm.softness.value = U.lerp(0.16, 0.08, overcast);
      cm.color.value.copy(_c1.set('#ffffff').lerp(sunC, 0.35 + horizonW * 0.4).lerp(_c2.set('#0e1222'), night).lerp(_c3.set('#b8bec6'), overcast * (1 - night)));
      cm.shade.value.copy(_c1.copy(hor).lerp(top, 0.5).multiplyScalar(0.9).lerp(_c2.set('#060810'), night * 0.8).lerp(_c3.set('#5f6870'), overcast * (1 - night) * 0.8));
      cm.opacity.value = 0.92;
      // emissive windows / signs / lamp glow
      var lit = U.clamp((night - 0.02) / 0.5, 0, 1);
      lit = Math.max(lit, overcast * 0.35 * (1 - night) * 0.6);   // a grey afternoon turns some lights on early
      Render.lit = lit;
      A.litMaterials().forEach(function (m) { m.emissiveIntensity = lit * 0.95; });
      var smats = A._signMats;
      for (var k in smats) smats[k].emissiveIntensity = smats[k].userData.neon ? 0.5 + 0.8 * lit : 0.12 + 0.35 * lit;
      if (A.setPropGlow) A.setPropGlow(0.3 + 1.1 * lit);
      Render.chunks.forEach(function (ch) { if (ch.glow) { ch.glow.visible = lit > 0.02; ch.glow.material.opacity = lit; } if (ch.glowPts) { ch.glowPts.visible = lit > 0.02; ch.glowPts.material.opacity = lit; } if (ch.glowPts2) { ch.glowPts2.visible = lit > 0.02; ch.glowPts2.material.opacity = lit; } });
      Render.env = { night: night, elev: elev, horizonW: horizonW, lit: lit, overcast: overcast, rain: rain, exposure: exposure, sunColor: sunC, fogColor: fog, skyTop: top, horizon: hor, duskW: duskW, clock: clock };
      // the environment map follows the sky every half hour of the clock and every notable change of weather
      var key = Math.floor(clock * 2) + ':' + Math.round(overcast * 4) + ':' + Math.round(rain * 2);
      if (key !== Render._envKey) { Render._envKey = key; Render._refreshEnv(); }
    },
    // the equirect sky canvas: zenith at the top, the horizon half way down, a ground half below; the sun as a soft
    // glow at its azimuth (u = atan2(z, x) / 2pi + 0.5) and a warm band along the horizon on its side when it is low
    _paintSky: function (top, hor, fog, sunC, ground, sm, night, horizonW, overcast) {
      var A = Render._A, cv = A.skyCanvas, ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
      var g = ctx.createLinearGradient(0, 0, 0, H);
      var mid = _c1.copy(top).lerp(hor, 0.28);
      g.addColorStop(0, '#' + top.getHexString());
      g.addColorStop(0.32, '#' + mid.getHexString());
      g.addColorStop(0.42, '#' + _c2.copy(top).lerp(hor, 0.72).getHexString());
      g.addColorStop(0.465, '#' + hor.getHexString());
      g.addColorStop(0.5, '#' + fog.getHexString());
      g.addColorStop(0.53, '#' + _c2.copy(fog).multiplyScalar(0.86).getHexString());
      g.addColorStop(0.7, '#' + _c2.copy(fog).lerp(ground, 0.6).multiplyScalar(0.7).getHexString());
      g.addColorStop(1, '#' + _c2.copy(ground).multiplyScalar(0.45).getHexString());
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (night < 0.98) {
        var d = sm.dir, u = (Math.atan2(d.z, d.x) / (Math.PI * 2) + 0.5) * W, v = (1 - (Math.asin(U.clamp(d.y, -1, 1)) / Math.PI + 0.5)) * H;
        var k = (1 - night) * (1 - overcast * 0.7);
        ctx.globalCompositeOperation = 'lighter';
        // the broad warm glow around the sun, wider when it is low
        var rg = ctx.createRadialGradient(u, v, 2, u, v, 60 + horizonW * 110);
        rg.addColorStop(0, 'rgba(' + sunRGB(sunC, 0.75 * k) + ')'); rg.addColorStop(0.35, 'rgba(' + sunRGB(sunC, 0.28 * k) + ')'); rg.addColorStop(1, 'rgba(' + sunRGB(sunC, 0) + ')');
        ctx.fillStyle = rg;
        for (var ox = -W; ox <= W; ox += W) { ctx.save(); ctx.translate(ox, 0); ctx.fillRect(0, 0, W, H); ctx.restore(); }
        // the horizon band on the sun's side at dusk / dawn
        if (horizonW > 0.02) {
          var hg = ctx.createRadialGradient(u, H * 0.5, 10, u, H * 0.5, W * 0.45);
          hg.addColorStop(0, 'rgba(' + sunRGB(hor, 0.4 * horizonW * k) + ')'); hg.addColorStop(1, 'rgba(' + sunRGB(hor, 0) + ')');
          ctx.fillStyle = hg;
          for (ox = -W; ox <= W; ox += W) { ctx.save(); ctx.translate(ox, 0); ctx.fillRect(0, H * 0.3, W, H * 0.25); ctx.restore(); }
        }
        // the disc itself (the env map needs a hot spot so car paint shows a sun highlight)
        var dg = ctx.createRadialGradient(u, v, 0, u, v, 7 + horizonW * 6);
        dg.addColorStop(0, 'rgba(255,255,250,' + (0.95 * k).toFixed(3) + ')'); dg.addColorStop(0.6, 'rgba(' + sunRGB(sunC, 0.6 * k) + ')'); dg.addColorStop(1, 'rgba(' + sunRGB(sunC, 0) + ')');
        ctx.fillStyle = dg;
        for (ox = -W; ox <= W; ox += W) { ctx.save(); ctx.translate(ox, 0); ctx.fillRect(0, 0, W, H); ctx.restore(); }
        ctx.globalCompositeOperation = 'source-over';
      }
      A.sky.needsUpdate = true; A.env.needsUpdate = true;
      function sunRGB(c, a) { return Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ',' + a.toFixed(3); }
    },
    // PMREM from the equirect sky canvas: scene.environment, so every PBR material reflects the current sky
    _refreshEnv: function () {
      var r = Render.renderer, A = Render._A;
      if (!r || !C.QUALITY.envMap) { if (Render.scene.environment) Render.scene.environment = null; return; }
      try {
        if (!Render._pmrem) Render._pmrem = new THREE.PMREMGenerator(r);
        var old = Render._envRT;
        Render._envRT = Render._pmrem.fromEquirectangular(A.env);
        Render.scene.environment = Render._envRT.texture;
        Render.envMap = Render._envRT.texture;
        if (old) old.dispose();
        Render.stats.envRefreshes++;
      } catch (e) { U.reportError(e, 'env'); C.QUALITY.envMap = false; }
    },

    // ----------------------------------------------------------- weather --
    // clear / overcast / rain. `overcast` and `rain` blend over C.WEATHER.transition seconds, `wet` rises in the rain
    // and dries slowly after it (wet roads: lower ground roughness, puddles, headlight and neon reflections).
    weather: {
      state: 'clear', target: 'clear', overcast: 0, rain: 0, wet: 0, wind: 0.6, cycle: true, _hold: 0, _rng: null, _rain: null, _puddles: null, _pudSeed: null, _t: 0,
      init: function () {
        var Wx = Render.weather, opts = (GTP.game && GTP.game.opts) || {}, s = Render.scene, A = Render._A;
        Wx._rng = GTP.rng.fork(0x5EA7);
        Wx._hold = Wx._nextHold();
        // rain streaks: a Points cloud around the camera (MAX_RAIN slots, the preset picks the draw range)
        var pos = new Float32Array(MAX_RAIN * 3), R = GTP.makeRng(0x8A1);
        for (var i = 0; i < MAX_RAIN; i++) { pos[i * 3] = (R.random() - 0.5) * 2; pos[i * 3 + 1] = R.random(); pos[i * 3 + 2] = (R.random() - 0.5) * 2; }
        var rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
        var rm = new THREE.PointsMaterial({ map: A.rain, color: 0xdce8f4, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0.0, depthWrite: false, fog: true });
        var rainPts = new THREE.Points(rg, rm); rainPts.frustumCulled = false; rainPts.visible = false; rainPts.renderOrder = 7; rainPts.name = 'rain';
        s.add(rainPts); Wx._rain = rainPts; Wx._rainUnit = pos.slice(0);
        // puddles: flat discs on the road with a mirror-like material (the environment map and the lights reflect in them)
        var pg = new THREE.CircleGeometry(1, 14); pg.rotateX(-Math.PI / 2);
        var pm = new THREE.MeshStandardMaterial({ color: 0x2a323c, roughness: 0.02, metalness: 0.4, envMapIntensity: 2.0, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        var im = new THREE.InstancedMesh(pg, pm, MAX_PUDDLES); im.frustumCulled = false; im.visible = false; im.renderOrder = 2; im.name = 'puddles'; im.receiveShadow = true;
        var zero = new THREE.Matrix4().makeScale(0, 0, 0);
        for (i = 0; i < MAX_PUDDLES; i++) im.setMatrixAt(i, zero);
        im.instanceMatrix.needsUpdate = true;
        s.add(im); Wx._puddles = im;
        var want = opts.weather ? String(opts.weather).toLowerCase() : (C.WEATHER.start || 'clear');
        if (opts.weather) Wx.cycle = false;
        Wx.set(want, true);
      },
      _nextHold: function () { var h = C.WEATHER.holdHours; return (h[0] + Render.weather._rng.random() * (h[1] - h[0])) * C.DAY.secondsPerHour; },
      states: function () { return ['clear', 'overcast', 'rain']; },
      set: function (state, instant) {
        var Wx = Render.weather;
        if (['clear', 'overcast', 'rain'].indexOf(state) < 0) return false;
        Wx.target = state;
        if (instant) { Wx.state = state; Wx.overcast = state === 'clear' ? 0 : 1; Wx.rain = state === 'rain' ? 1 : 0; if (state === 'rain') Wx.wet = Math.max(Wx.wet, 0.8); Wx._applyNow(); Render._envClock = null; }
        Wx._hold = Wx._nextHold();
        GTP.Events.emit('weather', { state: state, instant: !!instant });
        return true;
      },
      // the cycle: after a hold, roll the next state by the odds (never the same twice in a row)
      update: function (dt) {
        var Wx = Render.weather, WC = C.WEATHER;
        if (Wx.cycle && !Render.headless) {
          Wx._hold -= dt;
          if (Wx._hold <= 0) {
            var r = Wx._rng.random(), pick = r < WC.odds.clear ? 'clear' : r < WC.odds.clear + WC.odds.overcast ? 'overcast' : 'rain';
            if (pick === Wx.target) pick = pick === 'clear' ? 'overcast' : 'clear';
            Wx.set(pick, false);
          }
        }
        var k = dt / Math.max(1, WC.transition);
        var wantO = Wx.target === 'clear' ? 0 : 1, wantR = Wx.target === 'rain' ? 1 : 0;
        var o0 = Wx.overcast, r0 = Wx.rain;
        Wx.overcast = U.clamp(Wx.overcast + Math.sign(wantO - Wx.overcast) * k, 0, 1);
        Wx.rain = U.clamp(Wx.rain + Math.sign(wantR - Wx.rain) * k, 0, 1);
        if (Math.abs(Wx.overcast - wantO) < 1e-3 && Math.abs(Wx.rain - wantR) < 1e-3) Wx.state = Wx.target;
        if (Wx.rain > 0.05) Wx.wet = Math.min(1, Wx.wet + WC.wetRise * Wx.rain * dt); else Wx.wet = Math.max(0, Wx.wet - WC.wetDry * dt);
        if (Math.abs(Wx.overcast - o0) > 1e-4 || Math.abs(Wx.rain - r0) > 1e-4) Render._envClock = null;   // repaint the sky as the weather moves
        Wx._applyNow();
      },
      _applyNow: function () {
        var Wx = Render.weather, A = Render._A, WC = C.WEATHER, wet = Wx.wet;
        var gm = A._mats.ground;
        if (gm) { gm.roughness = U.lerp(1.0, WC.wetRoughness, wet); gm.metalness = 0.14 * wet; gm.envMapIntensity = 0.5 + 1.1 * wet; }
        if (Wx._puddles) { Wx._puddles.material.opacity = 0.6 * U.smoothstep(wet * 1.6); Wx._puddles.visible = wet > 0.03 && (C.QUALITY.puddles | 0) > 0; }
      },
      applyQuality: function () {
        var Wx = Render.weather, Q = C.QUALITY;
        if (Wx._rain) { Wx._rain.geometry.setDrawRange(0, Math.min(MAX_RAIN, Q.rainCount | 0)); }
        Wx._pudSeed = null;
      },
      // per frame: the streaks fall through a box around the camera; the puddles re-seed when the player moves on
      frame: function (dt, cam) {
        var Wx = Render.weather, Q = C.QUALITY, WC = C.WEATHER;
        var rainOn = Wx.rain > 0.02 && Q.weatherFx && (Q.rainCount | 0) > 0;
        if (Wx._rain) {
          Wx._rain.visible = rainOn;
          if (rainOn) {
            var n = Math.min(MAX_RAIN, Q.rainCount | 0), used = Math.max(1, Math.floor(n * (0.3 + 0.7 * Wx.rain)));
            Wx._rain.geometry.setDrawRange(0, used);
            Wx._rain.material.opacity = 0.42 * U.clamp(Wx.rain * 1.5, 0, 1);
            var pos = Wx._rain.geometry.attributes.position, arr = pos.array, box = WC.rainBox;
            var cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
            Wx._t += dt;
            for (var i = 0; i < used; i++) {
              var k = i * 3, u = Wx._rainUnit;
              // each drop lives in unit space and is wrapped around the camera every frame (no per-drop state to keep)
              var y = u[k + 1] - (Wx._t * WC.rainFall) / (box * 2); y -= Math.floor(y);
              var x = u[k] * box + (Wx._t * Wx.wind) % (box * 2); x = ((x + box) % (box * 2) + (box * 2)) % (box * 2) - box;
              arr[k] = cx + x; arr[k + 1] = cy - box * 0.6 + y * box * 2; arr[k + 2] = cz + u[k + 2] * box;
            }
            pos.needsUpdate = true;
          }
        }
        if (Wx._puddles && Wx._puddles.visible) Wx._placePuddles(cam);
      },
      _placePuddles: function (cam) {
        var Wx = Render.weather, W = Render._World, Q = C.QUALITY, im = Wx._puddles;
        var fx = Render.rig.focus, px = fx.x, pz = fx.z;
        var seed = Math.round(px / 24) + ',' + Math.round(pz / 24) + ',' + (Q.puddles | 0);
        if (seed === Wx._pudSeed || !W.tiles) return;
        Wx._pudSeed = seed;
        var T = W.T, n = Math.min(MAX_PUDDLES, Q.puddles | 0), placed = 0;
        var tx0 = Math.max(0, Math.floor(px / TILE) - 16), tz0 = Math.max(0, Math.floor(pz / TILE) - 16);
        for (var tz = tz0; tz < Math.min(W.h, tz0 + 32) && placed < n; tz++) for (var tx = tx0; tx < Math.min(W.w, tx0 + 32) && placed < n; tx++) {
          var t = W.tile(tx, tz);
          if (t !== T.ROAD && t !== T.PARKING && t !== T.PLAZA && t !== T.SIDEWALK) continue;
          var h = U.hash2(tx, tz, 0x9D);
          if (h > 0.085) continue;
          var ox = U.hash2(tx, tz, 0x9E), oz = U.hash2(tx, tz, 0x9F), sx = 1.0 + U.hash2(tx, tz, 0xA0) * 2.2, sz = 0.7 + U.hash2(tx, tz, 0xA1) * 1.4;
          var x = tx * TILE + 0.6 + ox * (TILE - 1.2), z = tz * TILE + 0.6 + oz * (TILE - 1.2), y = W.groundY(t) + 0.012;
          _q.setFromAxisAngle(_v2.set(0, 1, 0), U.hash2(tx, tz, 0xA2) * Math.PI);
          _m.compose(_v.set(x, y, z), _q, _v2.set(sx, 1, sz));
          im.setMatrixAt(placed++, _m);
        }
        _m.makeScale(0, 0, 0);
        for (var k = placed; k < MAX_PUDDLES; k++) im.setMatrixAt(k, _m);
        im.instanceMatrix.needsUpdate = true;
        void cam;
      }
    },

    // the light pools: the nearest lamps get a point light, the nearest lit cars (not the player's, which has its own) a spot
    _updateLightPool: function (dt) {
      var L = Render.lights, Q = C.QUALITY, W = Render._World, lit = Render.lit || 0, i;
      var nP = Math.min(MAX_POINTS, Q.pointLights | 0), nS = Math.min(MAX_SPOTS, Q.headlights | 0);
      if (nP > 0) {
        L._lampT -= dt;
        if (!L._lamps || L._lamps.world !== W._seed) { L._lamps = { world: W._seed, list: (W.props || []).filter(function (p) { return p.kind === 'lamp'; }) }; L._lampT = 0; }
        if (L._lampT <= 0 || !L._near) {
          L._lampT = 0.3;
          var fx = Render.rig.focus, list = L._lamps.list, near = [];
          for (i = 0; i < list.length; i++) {
            var p = list[i]; if (p.fallen) continue;
            var dx = p.x - fx.x, dz = p.z - fx.z, d2 = dx * dx + dz * dz;
            if (d2 > 80 * 80) continue;
            var j = near.length;
            if (j < nP || d2 < near[j - 1].d2) {
              near.push({ p: p, d2: d2 });
              for (var k = near.length - 1; k > 0 && near[k].d2 < near[k - 1].d2; k--) { var tmp = near[k]; near[k] = near[k - 1]; near[k - 1] = tmp; }
              if (near.length > nP) near.pop();
            }
          }
          L._near = near;
        }
        for (i = 0; i < nP; i++) {
          var pl = L.points[i], rec = L._near[i];
          if (!rec || lit < 0.02) { pl.intensity = 0; continue; }
          var pp = rec.p, d = U.yawToDir(pp.rot || 0);
          pl.position.set(pp.x + d.x * 1.4, (pp.y == null ? CURB : pp.y) + 5.6, pp.z + d.z * 1.4);
          pl.intensity = 1.35 * lit * U.clamp(1.3 - Math.sqrt(rec.d2) / 80, 0.25, 1);
        }
      }
      if (nS > 0 && GTP.Entities) {
        var cars = GTP.Entities.list, cand = [], night = Render.night || 0, fx2 = Render.rig.focus;
        if (night > 0.25) for (i = 0; i < cars.length; i++) {
          var v = cars[i];
          if (v.kind !== 'vehicle' || v.removed || v.wreck || v.sinking || !(v.driver || v.lights) || v.hasPlayer()) continue;
          if (!v.mesh || !v.mesh.visible) continue;
          var ddx = v.x - fx2.x, ddz = v.z - fx2.z, dd2 = ddx * ddx + ddz * ddz;
          if (dd2 > 70 * 70) continue;
          cand.push({ v: v, d2: dd2 });
        }
        cand.sort(function (a, b) { return a.d2 - b.d2; });
        for (i = 0; i < nS; i++) {
          var sl = L.spots[i], cv = cand[i];
          if (!cv) { sl.intensity = 0; continue; }
          var vv = cv.v, hp = vv.localToWorld(0, vv.cls.length / 2 - 0.1), tp = vv.localToWorld(0, vv.cls.length / 2 + 13);
          sl.position.set(hp.x, vv.y + 0.7, hp.z); sl.target.position.set(tp.x, vv.y - 0.3, tp.z);
          sl.intensity = 2.8 * U.clamp((night - 0.25) / 0.3, 0, 1) * U.clamp(1.4 - Math.sqrt(cv.d2) / 70, 0.3, 1);
        }
      }
    },

    // ---------------------------------------------------------------- frame --
    frame: function (alpha) {
      var t0 = U.now(), cam = Render.camera, g = GTP.game;
      if (!Render.renderer) return;
      Render.renderer.info.reset();
      Render.quality.measure(t0);
      if (GTP.Entities && GTP.Entities.sync) GTP.Entities.sync(alpha == null ? 1 : alpha);
      if (!Render.free) Render.rig.apply(alpha);
      var t = g && g.time ? g.time.t : 0, dt = Render._lastSimT == null ? 0 : U.clamp(t - Render._lastSimT, 0, 0.25);
      Render._lastSimT = t;
      if (Render.weather) Render.weather.update(dt);
      var clock = g && g.time ? g.time.clock : C.DAY.startClock;
      if (Math.abs(clock - (Render._envClock == null ? -99 : Render._envClock)) > 0.02) { Render._envClock = clock; Render.updateEnvironment(clock); }
      // sky and sun follow the camera; sun light + shadow box follow the focus point
      var sk = Render.sky, L = Render.lights;
      sk.dome.position.set(cam.position.x, cam.position.y - 40, cam.position.z);
      sk.sun.position.copy(L.sunDir).multiplyScalar(950).add(sk.dome.position);
      sk.moon.position.set(-L.sunDir.x, 0.6, -L.sunDir.z).normalize().multiplyScalar(950).add(sk.dome.position);
      sk.stars.position.copy(sk.dome.position);
      sk.clouds.position.set(cam.position.x, cam.position.y + 240, cam.position.z);
      sk.cloudMat.uniforms.offset.value.set(t * 0.0022 * Render.weather.wind, t * 0.0009);
      var fx = Render.rig.focus;
      L.target.position.set(fx.x, 0, fx.z);
      L.sun.position.copy(L.sunDir).multiplyScalar(160).add(L.target.position);
      // water shimmer: the colour map and the ripple normals scroll against each other
      var wm = Render.water.material;
      wm.map.offset.set(t * 0.012, t * 0.008);
      if (wm.normalMap) wm.normalMap.offset.set(-t * 0.02, t * 0.015);
      Render.ensureChunks();
      Render._animateFallen();
      Render._updateLightPool(dt);
      if (Render.weather) Render.weather.frame(dt, cam);
      // airfield beacons blink at 0.5 Hz (one shared material)
      if (Render._beaconM) Render._beaconM.opacity = (Math.floor(t * 2) % 2 === 0) ? 0.95 : 0.15;
      Render.fx.sync();
      if (GTP.PostFX && GTP.PostFX.render) GTP.PostFX.render(Render.renderer, Render.scene, cam);
      else Render.renderer.render(Render.scene, cam);
      // HUD overlay
      if (Render.hudCtx) {
        var ctx = Render.hudCtx;
        ctx.clearRect(0, 0, Render.width, Render.height);
        if (GTP.UI && GTP.UI.draw) { try { GTP.UI.draw(ctx, Render.width, Render.height); } catch (e) { U.reportError(e, 'ui.draw'); } }
      }
      var info = Render.renderer.info.render;
      Render.stats.triangles = info.triangles; Render.stats.calls = info.calls;
      Render.stats.frameMs = U.now() - t0;
    },
    // Called once per fixed step. The rig is applied to the camera right away so
    // worldToScreen and headless tests see the current camera without a render.
    updateCamera: function (dt) { if (!Render.free) { Render.rig.update(dt, GTP.Input); Render.rig.apply(); } },
    freeCam: function (enabled) {
      Render.free = enabled !== false;
      if (!Render.free) Render.rig.snap();
    },
    worldToScreen: function (x, y, z) {
      _v.set(x, y, z).project(Render.camera);
      var visible = _v.z > -1 && _v.z < 1 && Math.abs(_v.x) <= 1.2 && Math.abs(_v.y) <= 1.2;
      return { sx: (_v.x + 1) / 2 * Render.width, sy: (1 - _v.y) / 2 * Render.height, visible: visible, depth: _v.z };
    },
    invalidateAll: function () {
      Render.chunks.forEach(function (ch) { Render._disposeChunk(ch); });
      Render.chunks.clear();
      Render._runways = null;
      if (Render.lights) { Render.lights._lamps = null; Render.lights._near = null; }
      if (Render.weather) Render.weather._pudSeed = null;
      while (Render.chunkGroup && Render.chunkGroup.children.length) Render.chunkGroup.remove(Render.chunkGroup.children[0]);
    },
    // Build the chunks within `radius` metres of (x, z) for a loading screen. With onDone (and not headless) a few
    // chunks (QUALITY.prebuildPerCall) go per animation frame and onProgress(fraction, label) is called between
    // steps, so the screen can draw; without onDone, or headless, everything is built synchronously before the
    // call returns. Either way 'load:progress' events {stage:'chunks', frac, bar} go out. Returns the chunk count.
    prebuild: function (x, z, radius, onProgress, onDone) {
      var W = Render._World; if (!W || !W.tiles) { if (onDone) onDone(0); return 0; }
      radius = radius || C.QUALITY.drawDistance + 60;
      var nx = Math.ceil(W.w / CH), nz = Math.ceil(W.h / CH), reach = Math.ceil(radius / (TILE * CH)) + 1;
      var cx = Math.floor(x / (TILE * CH)), cz = Math.floor(z / (TILE * CH)), want = [];
      for (var zz = Math.max(0, cz - reach); zz < Math.min(nz, cz + reach + 1); zz++) for (var xx = Math.max(0, cx - reach); xx < Math.min(nx, cx + reach + 1); xx++) {
        if (Render.chunks.has(xx + ',' + zz)) continue;
        var dx = (xx + 0.5) * TILE * CH - x, dz = (zz + 0.5) * TILE * CH - z, d = Math.sqrt(dx * dx + dz * dz);
        if (d < radius) want.push({ x: xx, z: zz, d: d });
      }
      want.sort(function (a, b) { return a.d - b.d; });
      var total = want.length, done = 0, per = Math.max(1, C.QUALITY.prebuildPerCall | 0);
      function report() {
        var frac = total ? done / total : 1;
        if (typeof onProgress === 'function') { try { onProgress(frac, 'Building the ' + total + ' chunks around the spawn'); } catch (e) { U.reportError(e, 'render.progress'); } }
        GTP.Events.emit('load:progress', { stage: 'chunks', frac: frac, bar: 0.70 + 0.25 * frac, label: 'Building the ' + total + ' chunks around the spawn', source: 'render' });
      }
      function step() {
        for (var k = 0; k < per && done < total; k++) { var c = want[done++]; Render.buildChunk(c.x, c.z); }
        report();
      }
      var sync = typeof onDone !== 'function' || Render.headless || typeof requestAnimationFrame !== 'function';
      if (sync) {
        while (done < total) step();
        if (!total) report();
        if (typeof onDone === 'function') onDone(total);
        return total;
      }
      report();
      (function tick() {
        if (done < total) { step(); requestAnimationFrame(tick); }
        else onDone(total);
      })();
      return total;
    },
    _disposeChunk: function (ch) {
      ch.group.traverse(function (o) { if (o.geometry && o.userData.own) o.geometry.dispose(); });
      if (ch.group.parent) ch.group.parent.remove(ch.group);
    },

    // ------------------------------------------------------------- chunks --
    // Build chunks near the camera (all needed ones at once in headless, a few per frame live).
    ensureChunks: function () {
      var W = Render._World; if (!W.tiles) return;
      var cam = Render.camera, cx = Math.floor(cam.position.x / (TILE * CH)), cz = Math.floor(cam.position.z / (TILE * CH));
      var nx = Math.ceil(W.w / CH), nz = Math.ceil(W.h / CH);
      var reach = Math.ceil((C.QUALITY.drawDistance + 40) / (TILE * CH));
      var budget = Render.headless ? 1e9 : (Render.chunks.size < 8 ? 1e9 : 3);
      var want = [];
      for (var z = Math.max(0, cz - reach); z < Math.min(nz, cz + reach + 1); z++) for (var x = Math.max(0, cx - reach); x < Math.min(nx, cx + reach + 1); x++) {
        var key = x + ',' + z, ch = Render.chunks.get(key);
        var dx = (x + 0.5) * TILE * CH - cam.position.x, dz = (z + 0.5) * TILE * CH - cam.position.z, d = Math.sqrt(dx * dx + dz * dz);
        if (!ch) { if (d < C.QUALITY.drawDistance + 60) want.push({ x: x, z: z, d: d }); }
        else ch.group.visible = d < C.QUALITY.drawDistance + 70;
      }
      want.sort(function (a, b) { return a.d - b.d; });
      for (var i = 0; i < want.length && i < budget; i++) Render.buildChunk(want[i].x, want[i].z);
      // hide chunks far from the camera; swap the LOD materials with a little hysteresis around QUALITY.lodDistance
      var lod = C.QUALITY.lodDistance || 120, near = 0, farN = 0;
      Render.chunks.forEach(function (ch) {
        var dx = (ch.cx + 0.5) * TILE * CH - cam.position.x, dz = (ch.cz + 0.5) * TILE * CH - cam.position.z, dd = Math.sqrt(dx * dx + dz * dz);
        ch.group.visible = dd < C.QUALITY.drawDistance + 70;
        if (!ch.group.visible) return;
        var wantFar = ch.far ? dd > lod + 24 : dd > lod + 48;
        if (wantFar !== ch.far) Render._setChunkLod(ch, wantFar);
        if (ch.far) farN++; else near++;
      });
      Render.stats.lodNear = near; Render.stats.lodFar = farN;
    },
    _setChunkLod: function (ch, far) {
      var A = Render._A;
      ch.far = far;
      if (ch.ground) ch.ground.material = far ? A.groundMaterialFar() : A.groundMaterial();
      if (ch.buildings) ch.buildings.forEach(function (b) { b.mesh.material = far ? A.facadeMaterialFar(b.style) : A.facadeMaterial(b.style); });
      if (ch.props) ch.props.forEach(function (im) { im.material = far ? A.propMaterialFar() : A.propMaterial(); });
    },
    buildChunk: function (cx, cz) {
      var key = cx + ',' + cz;
      if (Render.chunks.has(key)) return Render.chunks.get(key);
      var W = Render._World, A = Render._A;
      var group = new THREE.Group(); group.name = 'chunk ' + key;
      var ch = { cx: cx, cz: cz, group: group, glow: null, glowPts: null, far: false, ground: null, buildings: [], props: [] };
      var tx0 = cx * CH, tz0 = cz * CH, tx1 = Math.min(W.w, tx0 + CH), tz1 = Math.min(W.h, tz0 + CH);
      try {
        Render._buildGround(ch, tx0, tz0, tx1, tz1);
        Render._buildBuildings(ch, tx0, tz0, tx1, tz1);
        Render._buildProps(ch, tx0, tz0, tx1, tz1);
      } catch (e) { U.reportError(e, 'buildChunk ' + key); }
      Render.chunkGroup.add(group);
      Render.chunks.set(key, ch);
      Render.stats.chunkBuilds++;
      if (ch.glow) { ch.glow.visible = Render.lit > 0.02; ch.glow.material.opacity = Render.lit || 0; }
      if (ch.glowPts) { ch.glowPts.visible = Render.lit > 0.02; ch.glowPts.material.opacity = Render.lit || 0; }
      if (ch.glowPts2) { ch.glowPts2.visible = Render.lit > 0.02; ch.glowPts2.material.opacity = Render.lit || 0; }
      return ch;
    },

    // which atlas cell + rotation a ground tile uses
    _classify: function (tx, tz) {
      var W = Render._World, T = W.T, M = W.M, i = tz * W.w + tx, t = W.tiles[i], m = W.meta[i];
      var h = W.laneH[i], v = W.laneV[i];
      function laneCell(h, v, m, hw) {
        var isX = (m & M.H) && (m & M.V);
        if (isX) return ['asphalt', 0];
        var useH = !!h, lane = useH ? (h >> 4) : (v >> 4), width = useH ? (h & 15) : (v & 15);
        var rot = useH ? (lane < width / 2 ? 0 : 2) : (lane < width / 2 ? 3 : 1);
        if (m & M.CROSSWALK) {
          // stop bar on the lane that flows toward the intersection
          var dirTo = useH ? ((tx + 1 < W.w && W._isX(W.meta[i + 1]) && W.tiles[i + 1] === T.ROAD) ? 1 : -1) : ((tz + 1 < W.h && W._isX(W.meta[i + W.w]) && W.tiles[i + W.w] === T.ROAD) ? 1 : -1);
          var flow = useH ? (lane < width / 2 ? -1 : 1) : (lane < width / 2 ? 1 : -1);
          var r = useH ? (dirTo > 0 ? 0 : 2) : (dirTo > 0 ? 1 : 3);
          return [flow === dirTo ? 'cross_stop' : 'cross', r];
        }
        if (m & M.DEAD) return ['road_dead', rot];
        if (width <= 2) return [hw ? 'hw_outer' : 'road_half', rot];
        var inner = lane === 1 || lane === 2;
        if (hw) return [inner ? 'hw_inner' : 'hw_outer', inner ? (useH ? (lane === 1 ? 0 : 2) : (lane === 1 ? 3 : 1)) : rot];
        return [inner ? 'ave_inner' : 'ave_outer', inner ? (useH ? (lane === 1 ? 0 : 2) : (lane === 1 ? 3 : 1)) : rot];
      }
      if (t === T.ROAD || t === T.BRIDGE || t === T.RAMP) return laneCell(h, v, m, false);
      if (t === T.SIDEWALK) {
        var n = W.isRoadTile(W.tile(tx, tz - 1)), s = W.isRoadTile(W.tile(tx, tz + 1)), e = W.isRoadTile(W.tile(tx + 1, tz)), w = W.isRoadTile(W.tile(tx - 1, tz));
        if (m & M.WALKWAY) return ['sidewalk', 0];
        if (n && w) return ['sidewalk_corner', 0]; if (n && e) return ['sidewalk_corner', 1]; if (s && e) return ['sidewalk_corner', 2]; if (s && w) return ['sidewalk_corner', 3];
        if (n) return ['sidewalk_edge', 0]; if (e) return ['sidewalk_edge', 1]; if (s) return ['sidewalk_edge', 2]; if (w) return ['sidewalk_edge', 3];
        return ['sidewalk', (tx + tz) & 3];
      }
      if (t === T.GRASS) return [(m & M.LAWN) ? 'lawn' : (U.hash2(tx, tz, 5) < 0.3 ? 'grass2' : 'grass'), (tx * 7 + tz * 3) & 3];
      if (t === T.SAND) return ['sand', (tx + tz) & 3];
      if (t === T.PARKING) {
        if (m & M.RUNWAY) return Render._runwayCell(tx, tz);
        if (m & M.YARD) return ['gravel', (tx + tz) & 3];
        if (m & M.LOT) { var rw = Render._runwayAt(tx, tz); if (rw) return [((tz - rw.lot.z) % 3 === 1) ? 'apron' : 'parking', 0]; }
        // bays in rows: every other row of tiles painted, orientation by the lot's longer axis
        return [(tz & 1) ? 'parking_bay' : 'parking', 0];
      }
      if (t === T.PLAZA) {
        if (m & M.DOCK) return ['dock', (W.tile(tx, tz - 1) === T.PLAZA || W.tile(tx, tz + 1) === T.PLAZA) ? 0 : 1];
        if (m & M.PATH) return ['path', 0];
        if (m & M.CORRIDOR) return ['concrete', 0];
        return [U.hash2(tx, tz, 9) < 0.5 ? 'plaza' : 'plaza2', (tx + tz) & 3];
      }
      return ['asphalt', 0];
    },

    // the runway lots (cached per world): strip rows and lot rects, for the runway paint
    _runwayAt: function (tx, tz) {
      var W = Render._World;
      if (!Render._runways) {
        Render._runways = [];
        W.landmarks.forEach(function (l) { if (l.def && l.def.ground === 'runway') Render._runways.push({ lot: l.lot, strip: l.def.strip || { z0: l.lot.z + 6, z1: l.lot.z + 11 } }); });
      }
      for (var i = 0; i < Render._runways.length; i++) { var r = Render._runways[i], lt = r.lot; if (tx >= lt.x && tx < lt.x + lt.w && tz >= lt.z && tz < lt.z + lt.d) return r; }
      return null;
    },
    // Runway 10/10: threshold bars across the first and last two tiles, the "10" at each end (read by a pilot
    // on approach), a dashed centreline where the two middle rows meet, a solid line along each edge
    _runwayCell: function (tx, tz) {
      var r = Render._runwayAt(tx, tz);
      if (!r) return ['runway', 0];
      var x0 = r.lot.x, x1 = r.lot.x + r.lot.w - 1, z0 = r.strip.z0, z1 = r.strip.z1, zc = Math.floor((z0 + z1) / 2);
      if (tx <= x0 + 1 || tx >= x1 - 1) return ['runway_thresh', 1];
      if (tx === x0 + 3 && (tz === zc || tz === zc + 1)) return [tz === zc ? 'runway_1' : 'runway_0', 1];
      if (tx === x1 - 3 && (tz === zc || tz === zc + 1)) return [tz === zc ? 'runway_0' : 'runway_1', 3];
      if (tz === zc) return ['runway_center', 0];
      if (tz === zc + 1) return ['runway_center', 2];
      if (tz === z0) return ['runway_edge', 0];
      if (tz === z1) return ['runway_edge', 2];
      return ['runway', U.hash2(tx, tz, 17) < 0.5 ? 0 : 2];
    },

    _buildGround: function (ch, tx0, tz0, tx1, tz1) {
      var W = Render._World, A = Render._A, T = W.T, M = W.M;
      var g = new GB({ color: false });
      var tiles = W.tiles, deck = W.deck, w = W.w;
      var uvTop = function (name, r) { var c = A.cellUVs(name, r); return [c[0], c[3], c[2], c[1]]; };
      function tileY(tx, tz) { var t = W.tile(tx, tz); return t === T.RAMP ? W.rampY[tz * w + tx] : W.groundY(t); }
      function rampCorner(rp, x, z) { var a = rp.axis === 'h' ? x : z; return DECK_Y * U.clamp((a - rp.a0) / (rp.a1 - rp.a0), 0, 1); }
      function wall(ax, az, bx, bz, y0, y1, name, lenScale) {
        var len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
        var uv = A.faceUVs(name, len * (lenScale || 1), y1 - y0);
        g.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], uv);
      }
      function slopedWall(ax, az, bx, bz, y0a, y0b, y1a, y1b, name) {
        var uv = A.faceUVs(name, 4, Math.max(y1a - y0a, y1b - y0b));
        g.quad([ax, y0a, az], [bx, y0b, bz], [bx, y1b, bz], [ax, y1a, az], uv);
      }
      var stadiumField = null;
      for (var tz = tz0; tz < tz1; tz++) for (var tx = tx0; tx < tx1; tx++) {
        var i = tz * w + tx, t = tiles[i], m = W.meta[i];
        var x0 = tx * TILE, z0 = tz * TILE, x1 = x0 + TILE, z1 = z0 + TILE;
        var tN = W.tile(tx, tz - 1), tS = W.tile(tx, tz + 1), tE = W.tile(tx + 1, tz), tW = W.tile(tx - 1, tz);
        if (t !== T.WATER && t !== T.VOID) {
          var cell = Render._classify(tx, tz), name = cell[0], rot = cell[1];
          var y = W.groundY(t);
          var yNW = y, yNE = y, ySE = y, ySW = y;
          if (t === T.RAMP) {
            var rp = W.ramps[W._rampIndex[i]];
            yNW = rampCorner(rp, x0, z0); yNE = rampCorner(rp, x1, z0); ySE = rampCorner(rp, x1, z1); ySW = rampCorner(rp, x0, z1);
          } else if (t === T.SAND) {
            // beaches slope into the water
            var dip = WATER_Y + 0.35;
            if (tN === T.WATER) { yNW = dip; yNE = dip; } if (tS === T.WATER) { ySW = dip; ySE = dip; }
            if (tE === T.WATER) { yNE = dip; ySE = dip; } if (tW === T.WATER) { yNW = dip; ySW = dip; }
          }
          g.quad([x0, yNW, z0], [x0, ySW, z1], [x1, ySE, z1], [x1, yNE, z0], uvTop(name, rot));
          // curb faces where a raised tile meets a lower neighbour
          if (y > 0.01 && t !== T.RAMP) {
            if (W.groundY(tS) < y - 0.01 && tS !== T.WATER && tS !== T.RAMP && tS !== T.VOID) wall(x0, z1, x1, z1, 0, y, 'curbface', 0.25);
            if (W.groundY(tN) < y - 0.01 && tN !== T.WATER && tN !== T.RAMP && tN !== T.VOID) wall(x1, z0, x0, z0, 0, y, 'curbface', 0.25);
            if (W.groundY(tE) < y - 0.01 && tE !== T.WATER && tE !== T.RAMP && tE !== T.VOID) wall(x1, z1, x1, z0, 0, y, 'curbface', 0.25);
            if (W.groundY(tW) < y - 0.01 && tW !== T.WATER && tW !== T.RAMP && tW !== T.VOID) wall(x0, z0, x0, z1, 0, y, 'curbface', 0.25);
          }
          // sea walls, dock sides, bridge edges
          var isPier = (m & M.DOCK) || (m & M.WALKWAY);
          var seaName = isPier ? 'dockside' : 'seawall', seaBottom = WATER_Y - 0.8;
          if (t !== T.SAND) {
            if (tS === T.WATER || tS === T.VOID) wall(x0, z1, x1, z1, seaBottom, ySW, seaName);
            if (tN === T.WATER || tN === T.VOID) wall(x1, z0, x0, z0, seaBottom, yNW, seaName);
            if (tE === T.WATER || tE === T.VOID) wall(x1, z1, x1, z0, seaBottom, yNE, seaName);
            if (tW === T.WATER || tW === T.VOID) wall(x0, z0, x0, z1, seaBottom, yNW, seaName);
          }
          if (t === T.BRIDGE) {
            if (tS === T.WATER) wall(x0, z1, x1, z1, -0.9, 0, 'concrete'); if (tN === T.WATER) wall(x1, z0, x0, z0, -0.9, 0, 'concrete');
            if (tE === T.WATER) wall(x1, z1, x1, z0, -0.9, 0, 'concrete'); if (tW === T.WATER) wall(x0, z0, x0, z1, -0.9, 0, 'concrete');
          }
          // railings on bridge walkways along the water edge
          if (m & M.WALKWAY) {
            var railUV = A.pointUV('white');
            if (tS === T.WATER) Render._rail(g, x0, z1 - 0.2, x1, z1 - 0.2, y, railUV);
            if (tN === T.WATER) Render._rail(g, x0, z0 + 0.2, x1, z0 + 0.2, y, railUV);
            if (tE === T.WATER) Render._rail(g, x1 - 0.2, z0, x1 - 0.2, z1, y, railUV);
            if (tW === T.WATER) Render._rail(g, x0 + 0.2, z0, x0 + 0.2, z1, y, railUV);
          }
          // ramp retaining walls and parapets along the ramp's sides
          if (t === T.RAMP) {
            var rpp = W.ramps[W._rampIndex[i]];
            var sides = rpp.axis === 'h' ? [[tN, x0, z0, x1, z0, yNW, yNE, -1], [tS, x0, z1, x1, z1, ySW, ySE, 1]] : [[tW, x0, z0, x0, z1, yNW, ySW, -1], [tE, x1, z0, x1, z1, yNE, ySE, 1]];
            for (var k = 0; k < 2; k++) {
              var sd = sides[k];
              if (sd[0] === T.RAMP || W.deckAt(tx + (rpp.axis === 'h' ? 0 : sd[7]), tz + (rpp.axis === 'h' ? sd[7] : 0))) continue;
              var ax = sd[1], az = sd[2], bx = sd[3], bz = sd[4], ha = sd[5], hb = sd[6];
              // outward-facing wall from the ground to the ramp top, then a parapet
              if (sd[7] > 0 && rpp.axis === 'h') { slopedWall(ax, az, bx, bz, 0, 0, ha, hb, 'concrete'); slopedWall(ax, az, bx, bz, ha, hb, ha + 0.9, hb + 0.9, 'barrier'); slopedWall(bx, bz - 0.3, ax, az - 0.3, hb, ha, hb + 0.9, ha + 0.9, 'concrete'); }
              else if (rpp.axis === 'h') { slopedWall(bx, bz, ax, az, 0, 0, hb, ha, 'concrete'); slopedWall(bx, bz, ax, az, hb, ha, hb + 0.9, ha + 0.9, 'barrier'); slopedWall(ax, az + 0.3, bx, bz + 0.3, ha, hb, ha + 0.9, hb + 0.9, 'concrete'); }
              else if (sd[7] > 0) { slopedWall(bx, bz, ax, az, 0, 0, hb, ha, 'concrete'); slopedWall(bx, bz, ax, az, hb, ha, hb + 0.9, ha + 0.9, 'barrier'); slopedWall(ax - 0.3, az, bx - 0.3, bz, ha, hb, ha + 0.9, hb + 0.9, 'concrete'); }
              else { slopedWall(ax, az, bx, bz, 0, 0, ha, hb, 'concrete'); slopedWall(ax, az, bx, bz, ha, hb, ha + 0.9, hb + 0.9, 'barrier'); slopedWall(bx + 0.3, bz, ax + 0.3, az, hb, ha, hb + 0.9, ha + 0.9, 'concrete'); }
            }
          }
        }
        // the elevated deck
        if (deck[i]) {
          var dm = W.dmeta[i], dh = W.dlaneH[i], dv = W.dlaneV[i];
          var isX = (dm & M.H) && (dm & M.V), dname = 'asphalt', drot = 0;
          if (!isX) {
            var useH = !!dh, lane = useH ? (dh >> 4) : (dv >> 4);
            var inner = lane === 1 || lane === 2;
            dname = inner ? 'hw_inner' : 'hw_outer';
            drot = useH ? ((lane === 0 || lane === 1) ? 0 : 2) : ((lane === 0 || lane === 1) ? 3 : 1);
          }
          g.quad([x0, DECK_Y, z0], [x0, DECK_Y, z1], [x1, DECK_Y, z1], [x1, DECK_Y, z0], uvTop(dname, drot));
          g.quad([x0, DECK_Y - THICK, z0], [x1, DECK_Y - THICK, z0], [x1, DECK_Y - THICK, z1], [x0, DECK_Y - THICK, z1], uvTop('concrete_dark', 0));
          var open = function (ax, az) { return W.deckAt(ax, az) !== 0 || (W.tile(ax, az) === T.RAMP && W.rampY[az * w + ax] > DECK_Y - 1.2); };
          var edges = [[0, 1, x0, z1, x1, z1], [0, -1, x1, z0, x0, z0], [1, 0, x1, z1, x1, z0], [-1, 0, x0, z0, x0, z1]];
          for (k = 0; k < 4; k++) {
            var ed = edges[k];
            if (open(tx + ed[0], tz + ed[1])) continue;
            wall(ed[2], ed[3], ed[4], ed[5], DECK_Y - THICK, DECK_Y, 'concrete');
            Render._barrier(g, ed[2], ed[3], ed[4], ed[5], DECK_Y, ed[0], ed[1], A);
          }
        }
        // stadium field: one quad per stadium building, built from the chunk containing its centre
        if (t === T.BUILDING) {
          var b = W.buildings[W.bidx[i] - 1];
          if (b && b.special === 'stadium' && !stadiumField && Math.floor(b.cx / TILE) === tx && Math.floor(b.cz / TILE) === tz) stadiumField = b;
        }
      }
      if (stadiumField) {
        var b2 = stadiumField, fx0 = b2.x + b2.w * 0.2, fx1 = b2.x + b2.w * 0.8, fz0 = b2.z + b2.d * 0.12, fz1 = b2.z + b2.d * 0.88;
        var fu = A.uv('field'), fuv = [[fu[0], fu[3]], [fu[0], fu[1]], [fu[2], fu[1]], [fu[2], fu[3]]];
        g.quad([fx0, 1.2, fz0], [fx0, 1.2, fz1], [fx1, 1.2, fz1], [fx1, 1.2, fz0], fuv);
      }
      if (g.count() === 0) return;
      var mat = Render._groundMaterial();
      var mesh = new THREE.Mesh(g.build(), mat);
      mesh.receiveShadow = true; mesh.castShadow = true; mesh.userData.own = true; mesh.name = 'ground';
      ch.group.add(mesh); ch.ground = mesh;
    },
    _groundMaterial: function () { return Render._A.groundMaterial(); },
    _rail: function (g, ax, az, bx, bz, y, uv) {
      var len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)), n = Math.max(1, Math.round(len / 2));
      for (var k = 0; k <= n; k++) {
        var px = ax + (bx - ax) * k / n, pz = az + (bz - az) * k / n;
        g.box(px - 0.04, y, pz - 0.04, 0.08, 1.0, 0.08, uv, null, GB.NO_BOTTOM);
      }
      var minx = Math.min(ax, bx) - 0.05, minz = Math.min(az, bz) - 0.05;
      g.box(minx, y + 0.95, minz, Math.abs(bx - ax) + 0.1, 0.08, Math.abs(bz - az) + 0.1, uv, null, GB.NO_BOTTOM);
      g.box(minx, y + 0.5, minz, Math.abs(bx - ax) + 0.1, 0.05, Math.abs(bz - az) + 0.1, uv, null, GB.NO_BOTTOM);
    },
    // jersey barrier along a deck edge (inside the tile, 0.45 thick, 1.0 tall)
    _barrier: function (g, ax, az, bx, bz, y, nx, nz, A) {
      var th = 0.45, h = 1.0;
      var minx = Math.min(ax, bx), maxx = Math.max(ax, bx), minz = Math.min(az, bz), maxz = Math.max(az, bz);
      if (nx !== 0) { if (nx > 0) { minx = maxx - th; } else { maxx = minx + th; } }
      else { if (nz > 0) { minz = maxz - th; } else { maxz = minz + th; } }
      var side = A.faceUVs('barrier', 4, 1), top = A.pointUV('concrete');
      g.box(minx, y, minz, maxx - minx, h, maxz - minz, function (f) { return f === 'top' ? top : side; }, null, GB.NO_BOTTOM);
    },

    _buildBuildings: function (ch, tx0, tz0, tx1, tz1) {
      var W = Render._World, A = Render._A, T = W.T, w = W.w;
      var byStyle = {};
      var seen = new Set();
      for (var tz = tz0; tz < tz1; tz++) for (var tx = tx0; tx < tx1; tx++) {
        var i = tz * w + tx;
        if (W.tiles[i] !== T.BUILDING) continue;
        var b = W.buildings[W.bidx[i] - 1];
        if (!b || seen.has(b.id)) continue;
        // a building belongs to the chunk holding its centre tile
        var bcx = Math.floor(b.cx / TILE), bcz = Math.floor(b.cz / TILE);
        if (bcx < tx0 || bcx >= tx1 || bcz < tz0 || bcz >= tz1) continue;
        seen.add(b.id);
        var style = A.facadeStyles().indexOf(b.style) >= 0 ? b.style : 'downtown';
        var g = byStyle[style] || (byStyle[style] = new GB({ color: true }));
        if (b.special === 'stadium') Render._stadium(g, b, A);
        else Render._building(g, b, A);
      }
      for (var s in byStyle) {
        var mesh = new THREE.Mesh(byStyle[s].build(), A.facadeMaterial(s));
        mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.own = true; mesh.name = 'buildings:' + s;
        ch.group.add(mesh); ch.buildings.push({ mesh: mesh, style: s });
      }
    },
    // per-building colour tint (vertex colours multiply the shared facade texture) so a street of
    // one style is not a street of identical clones
    TINTS: {
      downtown: [[1, 1, 1], [0.9, 0.95, 1.05], [1.05, 1.0, 0.93], [0.84, 0.88, 0.95], [0.95, 1.03, 1.0], [1.08, 1.04, 0.98]],
      suburbs: [[1, 1, 1], [0.96, 0.92, 0.88], [0.9, 0.95, 0.92], [1.04, 1.02, 0.96], [0.93, 0.93, 0.98]],
      marina: [[1, 1, 1], [1.04, 0.96, 0.96], [0.95, 1.03, 1.0], [1.04, 1.02, 0.92], [0.96, 0.98, 1.05]],
      industrial: [[1, 1, 1], [0.9, 0.9, 0.9], [1.05, 1.0, 0.94], [0.95, 0.98, 1.0]],
      campus: [[1, 1, 1], [0.92, 0.9, 0.9], [1.05, 1.0, 0.96], [0.96, 0.94, 0.9]],
      capitol: [[1, 1, 1], [0.96, 0.95, 0.92], [1.03, 1.02, 0.98]],
      strip: [[1, 1, 1], [0.9, 0.95, 1.05], [1.05, 0.95, 1.0], [0.95, 1.05, 0.95]],
      brownstone: [[1, 1, 1], [0.9, 0.86, 0.84], [1.08, 1.02, 0.96], [0.96, 0.9, 0.86], [1.04, 0.98, 0.9]],
      airport: [[1, 1, 1], [0.96, 0.97, 1.0], [1.02, 1.01, 0.98]],
      port: [[1, 1, 1], [0.9, 0.9, 0.9], [1.06, 1.0, 0.94], [0.94, 0.98, 1.02]],
      'default': [[1, 1, 1], [0.95, 0.94, 0.92], [1.03, 1.02, 0.99]]
    },
    _tint: function (b) {
      var list = Render.TINTS[b.style] || Render.TINTS['default'];
      return list[Math.floor(U.hash2(b.seed, 77, 5) * list.length) % list.length];
    },
    _building: function (g, b, A) {
      var x0 = b.x, z0 = b.z, x1 = b.x + b.w, z1 = b.z + b.d, y0 = b.y, top = b.y + b.h;
      var floors = Math.max(1, Math.ceil(b.h / FLOOR_H)), tint = Render._tint(b);
      var walls = [[x0, z1, x1, z1], [x1, z0, x0, z0], [x1, z1, x1, z0], [x0, z0, x0, z1]];   // S, N, E, W (outward normals)
      for (var f = 0; f < floors; f++) {
        var fy0 = y0 + f * FLOOR_H, fy1 = Math.min(top, fy0 + FLOOR_H);
        if (fy1 - fy0 < 0.3) continue;
        var frac = (fy1 - fy0) / FLOOR_H;
        for (var k = 0; k < 4; k++) {
          var wl = walls[k], len = k < 2 ? b.w : b.d;
          var band = f === 0 ? 0 : 1 + (Math.floor(U.hash3(b.seed, f, k, 3) * 4) % 4);
          if (b.h <= 4.6 && f === 0) band = 0;
          var uv = A.bandUV(band, len / 8);
          var vTop = uv[1] + (uv[3] - uv[1]) * frac;
          var uoff = (k * 0.37 + U.hash2(b.seed, k, 1)) % 1;   // shift the pattern so a door is not always centred
          var q = [[uoff, uv[1]], [uoff + len / 8, uv[1]], [uoff + len / 8, vTop], [uoff, vTop]];
          g.quad([wl[0], fy0, wl[1]], [wl[2], fy0, wl[3]], [wl[2], fy1, wl[3]], [wl[0], fy1, wl[1]], q, tint);
          if (f === 0) Render._groundFloorDetail(g, b, A, k, wl, len, uoff, fy0, tint);
          else if (DETAIL.balconies[b.style] && k < 2 && (f % 2) === 1 && b.h > 7) Render._balconies(g, b, A, k, wl, len, uoff, fy0, tint);
        }
        // a ledge every four floors on the taller masonry and glass styles
        if (f > 0 && f % 4 === 0 && floors >= 5 && DETAIL.ledges[b.style]) Render._ledge(g, A, x0, z0, x1, z1, fy0, tint);
      }
      Render._roof(g, b, A, x0, z0, x1, z1, top, tint);
      Render._roofProps(g, b, A, x0, z0, x1, z1, top, tint, floors);
    },
    // Walls run a -> b with the outward normal to the right of travel; `out` is that normal and `along` the unit
    // direction, so a feature at distance s along the wall sits at a + along * s and protrudes along out.
    _wallFrame: function (wl) {
      var ax = wl[0], az = wl[1], bx = wl[2], bz = wl[3], dx = bx - ax, dz = bz - az, len = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= len; dz /= len;
      return { ax: ax, az: az, alongX: dx, alongZ: dz, outX: -dz, outZ: dx };
    },
    // a box in wall space: s0..s1 along the wall, o0..o1 out from it, y0..y1 up (4 side faces + top)
    _wallBox: function (g, fr, s0, s1, o0, o1, y0, y1, uv, tint) {
      function P(s, o, y) { return [fr.ax + fr.alongX * s + fr.outX * o, y, fr.az + fr.alongZ * s + fr.outZ * o]; }
      g.quad(P(s0, o1, y0), P(s1, o1, y0), P(s1, o1, y1), P(s0, o1, y1), uv, tint);          // front (outward)
      g.quad(P(s1, o0, y0), P(s1, o1, y0), P(s1, o1, y1), P(s1, o0, y1), uv, tint);          // end at s1
      g.quad(P(s0, o1, y0), P(s0, o0, y0), P(s0, o0, y1), P(s0, o1, y1), uv, tint);          // end at s0
      g.quad(P(s0, o0, y1), P(s0, o1, y1), P(s1, o1, y1), P(s1, o0, y1), uv, tint);          // top
      g.quad(P(s0, o1, y0), P(s0, o0, y0), P(s1, o0, y0), P(s1, o1, y0), uv, tint);          // underside
    },
    // where the facade band paints its door (pattern u 0.5) along this wall, every 8 m repeat
    _doorPositions: function (len, uoff) {
      var out = [], first = ((0.5 - uoff) % 1 + 1) % 1 * 8;
      for (var s = first; s < len - 1.2; s += 8) if (s > 1.2) out.push(s);
      return out;
    },
    _groundFloorDetail: function (g, b, A, k, wl, len, uoff, fy0, tint) {
      var style = b.style, fr = Render._wallFrame(wl), sw = A.swatchUV, doors = Render._doorPositions(len, uoff);
      if (!doors.length) return;
      var R = U.hash3;
      if (DETAIL.awnings[style]) {
        // a striped awning over the door (and the shopfront beside it on the strip): a sloped sheet, a valance, two arms
        var col = sw(['red', 'blue', 'green', 'yellow', 'teal', 'orange'][Math.floor(R(b.seed, k, 5, 0) * 6)]), w = style === 'strip' ? 5.2 : 3.2, depth = 1.15;
        doors.forEach(function (s) {
          var s0 = s - w / 2, s1 = s + w / 2, yw = fy0 + 2.85, yo = fy0 + 2.45;
          function P(ss, o, y) { return [fr.ax + fr.alongX * ss + fr.outX * o, y, fr.az + fr.alongZ * ss + fr.outZ * o]; }
          g.quad(P(s0, 0.02, yw), P(s0, depth, yo), P(s1, depth, yo), P(s1, 0.02, yw), col, tint);       // top
          g.quad(P(s1, 0.02, yw), P(s1, depth, yo), P(s0, depth, yo), P(s0, 0.02, yw), col, tint);       // underside
          g.quad(P(s0, depth, yo - 0.3), P(s1, depth, yo - 0.3), P(s1, depth, yo), P(s0, depth, yo), col, tint);   // valance
          g.quad(P(s0, 0.02, yw), P(s0, depth, yo), P(s0, depth, yo - 0.3), P(s0, 0.02, yw - 0.3), col, tint);
          g.quad(P(s1, 0.02, yw - 0.3), P(s1, depth, yo - 0.3), P(s1, depth, yo), P(s1, 0.02, yw), col, tint);
          Render._wallBox(g, fr, s0 + 0.1, s0 + 0.18, 0.02, depth - 0.1, yo - 0.55, yo - 0.25, sw('metal'), tint);
          Render._wallBox(g, fr, s1 - 0.18, s1 - 0.1, 0.02, depth - 0.1, yo - 0.55, yo - 0.25, sw('metal'), tint);
        });
      } else if (DETAIL.canopies[style]) {
        // a flat entrance canopy with a dark fascia and a lit soffit strip
        doors.forEach(function (s) {
          Render._wallBox(g, fr, s - 1.7, s + 1.7, 0.02, 1.4, fy0 + 3.05, fy0 + 3.3, sw(style === 'goldplate' ? 'gold' : 'concreteDark'), tint);
          Render._wallBox(g, fr, s - 1.6, s + 1.6, 1.2, 1.38, fy0 + 2.75, fy0 + 3.05, sw('black'), tint);
        });
      }
      if (DETAIL.steps[style]) {
        doors.forEach(function (s) { Render._wallBox(g, fr, s - 1.4, s + 1.4, 0.02, 0.7, fy0 - 0.01, fy0 + 0.15, sw('concreteLight'), tint); Render._wallBox(g, fr, s - 1.2, s + 1.2, 0.02, 0.36, fy0 + 0.15, fy0 + 0.3, sw('concreteLight'), tint); });
      }
      if (DETAIL.planters[style] && len > 10) {
        doors.forEach(function (s) {
          [s - 2.6, s + 2.6].forEach(function (ps) {
            if (ps < 0.8 || ps > len - 0.8) return;
            Render._wallBox(g, fr, ps - 0.5, ps + 0.5, 0.05, 0.95, fy0, fy0 + 0.5, sw('concrete'), tint);
            Render._wallBox(g, fr, ps - 0.4, ps + 0.4, 0.15, 0.85, fy0 + 0.5, fy0 + 0.95, sw('green'), tint);
          });
        });
      }
    },
    _balconies: function (g, b, A, k, wl, len, uoff, fy0, tint) {
      var fr = Render._wallFrame(wl), sw = A.swatchUV, rail = sw(b.style === 'marina' ? 'white' : 'black'), slab = sw(b.style === 'brownstone' ? 'sandstone' : 'concreteLight');
      // one balcony per 8 m repeat at the middle window (pattern u 0.5 for the brownstone's 3-window band is 0.5)
      var first = ((0.5 - uoff) % 1 + 1) % 1 * 8;
      for (var s = first; s < len - 1.0; s += 8) {
        if (s < 1.0) continue;
        Render._wallBox(g, fr, s - 0.9, s + 0.9, 0.02, 0.8, fy0 + 0.0, fy0 + 0.12, slab, tint);
        Render._wallBox(g, fr, s - 0.9, s - 0.84, 0.74, 0.8, fy0 + 0.12, fy0 + 1.0, rail, tint);
        Render._wallBox(g, fr, s + 0.84, s + 0.9, 0.74, 0.8, fy0 + 0.12, fy0 + 1.0, rail, tint);
        Render._wallBox(g, fr, s - 0.9, s + 0.9, 0.74, 0.8, fy0 + 0.94, fy0 + 1.0, rail, tint);
        Render._wallBox(g, fr, s - 0.9, s + 0.9, 0.74, 0.8, fy0 + 0.5, fy0 + 0.54, rail, tint);
        for (var p = -0.6; p <= 0.6; p += 0.3) Render._wallBox(g, fr, s + p - 0.02, s + p + 0.02, 0.75, 0.79, fy0 + 0.12, fy0 + 0.94, rail, tint);
      }
    },
    _ledge: function (g, A, x0, z0, x1, z1, y, tint) {
      var pt = A.bandUV(7, 1), pq = [[0, pt[1]], [1, pt[1]], [1, pt[3]], [0, pt[3]]], o = 0.24, h = 0.3, sw = A.swatchUV;
      var face = function (f) { return f === 'top' ? sw('concreteLight') : pq; };
      g.box(x0 - o, y - h / 2, z0 - o, (x1 - x0) + 2 * o, h, o, face, tint, GB.ALL_FACES);
      g.box(x0 - o, y - h / 2, z1, (x1 - x0) + 2 * o, h, o, face, tint, GB.ALL_FACES);
      g.box(x0 - o, y - h / 2, z0, o, h, z1 - z0, face, tint, GB.ALL_FACES);
      g.box(x1, y - h / 2, z0, o, h, z1 - z0, face, tint, GB.ALL_FACES);
    },
    _roofProps: function (g, b, A, x0, z0, x1, z1, top, tint, floors) {
      if (b.roof !== 'flat' || b.special) return;
      var sw = A.swatchUV, s = b.seed, R = U.hash2, w = x1 - x0, d = z1 - z0;
      // a water tank on legs for the older masonry roofs
      if ((b.style === 'brownstone' || b.style === 'campus' || b.style === 'industrial' || b.style === 'strip') && w >= 8 && d >= 8 && R(s, 31, 0) < 0.5) {
        var tx = x0 + 1.5 + R(s, 32, 0) * (w - 4.5), tz = z0 + 1.5 + R(s, 33, 0) * (d - 4.5);
        for (var j = 0; j < 4; j++) g.box(tx + (j % 2) * 2.2 - 0.1, top, tz + (j >> 1) * 2.2 - 0.1, 0.2, 2.2, 0.2, sw('metal'), tint, GB.NO_BOTTOM);
        g.box(tx - 0.2, top + 2.1, tz - 0.2, 2.4, 0.15, 2.4, sw('metal'), tint, GB.NO_BOTTOM);
        g.cylinder(tx + 1.0, top + 2.25, tz + 1.0, 1.25, 1.2, 2.4, 10, tint, sw('brown'));
        g.cylinder(tx + 1.0, top + 4.65, tz + 1.0, 1.3, 0.15, 0.8, 10, tint, sw('rust'));
      }
      // an antenna mast and a red aircraft light on the tall towers; a helipad on the tallest
      if (floors >= 10 && (b.style === 'downtown' || b.style === 'goldplate' || b.style === 'hospital')) {
        var mx = x0 + 1.2 + R(s, 34, 0) * (w - 2.4), mz = z0 + 1.2 + R(s, 35, 0) * (d - 2.4);
        g.box(mx - 0.12, top, mz - 0.12, 0.24, 7 + R(s, 36, 0) * 5, 0.24, sw('metal'), tint, GB.NO_BOTTOM);
        g.box(mx - 0.6, top + 5, mz - 0.03, 1.2, 0.06, 0.06, sw('metal'), tint);
        g.box(mx - 0.1, top + 7 + R(s, 36, 0) * 5, mz - 0.1, 0.2, 0.2, 0.2, sw('red'), tint);
      }
      if (floors >= 15 && w >= 12 && d >= 12 && R(s, 37, 0) < 0.6) {
        var hx = x0 + w / 2 + (R(s, 38, 0) - 0.5) * (w - 9), hz = z0 + d / 2 + (R(s, 39, 0) - 0.5) * (d - 9);
        g.cylinder(hx, top, hz, 3.6, 3.6, 0.12, 20, tint, sw('concreteDark'));
        for (var r = 0; r < 20; r++) { var a0 = r / 20 * Math.PI * 2, a1 = (r + 1) / 20 * Math.PI * 2; g.quad([hx + Math.cos(a0) * 3.3, top + 0.13, hz + Math.sin(a0) * 3.3], [hx + Math.cos(a0) * 3.6, top + 0.13, hz + Math.sin(a0) * 3.6], [hx + Math.cos(a1) * 3.6, top + 0.13, hz + Math.sin(a1) * 3.6], [hx + Math.cos(a1) * 3.3, top + 0.13, hz + Math.sin(a1) * 3.3], sw('white'), tint); }
        g.box(hx - 1.3, top + 0.12, hz - 0.2, 0.4, 0.02, 0.4, sw('white'), tint); g.box(hx - 1.3, top + 0.12, hz - 1.4, 0.4, 0.02, 2.8, sw('white'), tint); g.box(hx + 0.9, top + 0.12, hz - 1.4, 0.4, 0.02, 2.8, sw('white'), tint); g.box(hx - 0.9, top + 0.12, hz - 0.2, 1.8, 0.02, 0.4, sw('white'), tint);
      }
    },
    _roof: function (g, b, A, x0, z0, x1, z1, top, tint) {
      var ruv = A.bandUV(5, b.w / 8), swatch = A.swatchUV, R = U.hash2;
      tint = tint || GB.WHITE;
      if (b.roof === 'gable') {
        var alongX = b.w >= b.d, ov = 0.35, rise = Math.min(2.6, Math.max(1.2, Math.min(b.w, b.d) * 0.28));
        var col = swatch(b.style === 'barn' ? 'metal' : (R(b.seed, 2, 0) < 0.5 ? 'brown' : 'rust'));
        var gab = A.bandUV(7, 1);
        var gq = [[0, gab[1]], [1, gab[1]], [1, gab[3]], [0, gab[3]]];
        if (alongX) {
          var cz = (z0 + z1) / 2;
          g.quad([x0 - ov, top, z1 + ov], [x1 + ov, top, z1 + ov], [x1 + ov, top + rise, cz], [x0 - ov, top + rise, cz], col, tint);
          g.quad([x1 + ov, top, z0 - ov], [x0 - ov, top, z0 - ov], [x0 - ov, top + rise, cz], [x1 + ov, top + rise, cz], col, tint);
          g.quad([x1, top, z1], [x1, top, z0], [x1, top + rise, cz], [x1, top + rise, cz], gq, tint);
          g.quad([x0, top, z0], [x0, top, z1], [x0, top + rise, cz], [x0, top + rise, cz], gq, tint);
        } else {
          var cx = (x0 + x1) / 2;
          g.quad([x1 + ov, top, z0 - ov], [x1 + ov, top, z1 + ov], [cx, top + rise, z1 + ov], [cx, top + rise, z0 - ov], col, tint);
          g.quad([x0 - ov, top, z1 + ov], [x0 - ov, top, z0 - ov], [cx, top + rise, z0 - ov], [cx, top + rise, z1 + ov], col, tint);
          g.quad([x0, top, z1], [x1, top, z1], [cx, top + rise, z1], [cx, top + rise, z1], gq, tint);
          g.quad([x1, top, z0], [x0, top, z0], [cx, top + rise, z0], [cx, top + rise, z0], gq, tint);
        }
        // chimney
        g.box(x0 + b.w * 0.25, top, z0 + b.d * 0.3, 0.7, rise + 0.6, 0.7, swatch('rust'), tint, GB.NO_BOTTOM);
        return;
      }
      if (b.roof === 'mansard') {
        // a brownstone's mansard: a cornice slab, steep dark slate slopes inset to a flat cap, two dormers on the long side
        var inset = Math.min(1.6, Math.min(b.w, b.d) * 0.18), mh = 2.4, slate = swatch('slate'), cq = A.bandUV(7, 1), cornice = [[0, cq[1]], [1, cq[1]], [1, cq[3]], [0, cq[3]]];
        g.box(x0 - 0.3, top, z0 - 0.3, b.w + 0.6, 0.45, b.d + 0.6, function (f) { return f === 'top' ? swatch('concreteLight') : cornice; }, tint, GB.NO_BOTTOM);
        var ty = top + 0.45, cy = ty + mh, ix0 = x0 + inset, ix1 = x1 - inset, iz0 = z0 + inset, iz1 = z1 - inset;
        g.quad([x0, ty, z1], [x1, ty, z1], [ix1, cy, iz1], [ix0, cy, iz1], slate, tint);   // south slope
        g.quad([x1, ty, z0], [x0, ty, z0], [ix0, cy, iz0], [ix1, cy, iz0], slate, tint);   // north
        g.quad([x1, ty, z1], [x1, ty, z0], [ix1, cy, iz0], [ix1, cy, iz1], slate, tint);   // east
        g.quad([x0, ty, z0], [x0, ty, z1], [ix0, cy, iz1], [ix0, cy, iz0], slate, tint);   // west
        g.quad([ix0, cy, iz0], [ix0, cy, iz1], [ix1, cy, iz1], [ix1, cy, iz0], swatch('concreteDark'), tint);
        var alongX2 = b.w >= b.d, dn = 2, dw = 1.1, dh = 1.3;
        for (var dk = 0; dk < dn; dk++) {
          var f2 = (dk + 1) / (dn + 1);
          if (alongX2) { var dx2 = x0 + b.w * f2 - dw / 2; g.box(dx2, ty + 0.2, z1 - inset * 0.55 - 0.3, dw, dh, inset * 0.55 + 0.3, function (f) { return f === 'south' ? swatch('glass') : swatch('concreteLight'); }, tint, GB.NO_BOTTOM); }
          else { var dz2 = z0 + b.d * f2 - dw / 2; g.box(x1 - inset * 0.55 - 0.3, ty + 0.2, dz2, inset * 0.55 + 0.3, dh, dw, function (f) { return f === 'east' ? swatch('glass') : swatch('concreteLight'); }, tint, GB.NO_BOTTOM); }
        }
        g.box(x0 + b.w * 0.3, cy, z0 + b.d * 0.3, 0.7, 1.1, 0.7, swatch('rust'), tint, GB.NO_BOTTOM);
        return;
      }
      // flat roof: gravel, parapet, details
      var rq = [[0, ruv[1]], [b.w / 8, ruv[1]], [b.w / 8, ruv[3]], [0, ruv[3]]];
      g.quad([x0, top, z0], [x0, top, z1], [x1, top, z1], [x1, top, z0], rq, tint);
      var pt = A.bandUV(7, 1), pq = [[0, pt[1]], [1, pt[1]], [1, pt[3]], [0, pt[3]]], pth = 0.35, ph = 0.6;
      var parapet = function (f) { return f === 'top' ? swatch('concreteLight') : pq; };
      g.box(x0, top, z0, b.w, ph, pth, parapet, tint, GB.NO_BOTTOM);
      g.box(x0, top, z1 - pth, b.w, ph, pth, parapet, tint, GB.NO_BOTTOM);
      g.box(x0, top, z0 + pth, pth, ph, b.d - 2 * pth, parapet, tint, GB.NO_BOTTOM);
      g.box(x1 - pth, top, z0 + pth, pth, ph, b.d - 2 * pth, parapet, tint, GB.NO_BOTTOM);
      var s = b.seed, n = 1 + Math.floor(R(s, 7, 0) * 3), big = b.w >= 10 && b.d >= 10;
      if (b.style === 'airport') {
        // the airport's roofs: a red beacon strip along the parapet and rows of vents
        g.box(x0 + 0.2, top + ph, z0 + 0.05, b.w - 0.4, 0.18, 0.25, swatch('red'), tint, GB.NO_BOTTOM);
        g.box(x0 + 0.2, top + ph, z1 - 0.3, b.w - 0.4, 0.18, 0.25, swatch('red'), tint, GB.NO_BOTTOM);
        for (var vk = 0; vk < Math.floor(b.w / 4); vk++) g.box(x0 + 1.5 + vk * 4, top, z0 + b.d * 0.5 - 0.5, 1.2, 0.7, 1.0, swatch('metal'), tint, GB.NO_BOTTOM);
        n = 0;
      }
      for (var k = 0; k < n; k++) {
        var ux = x0 + 1 + R(s, k, 11) * (b.w - 3.5), uz = z0 + 1 + R(s, k, 12) * (b.d - 3), uw = 1.2 + R(s, k, 13) * 1.4, ud = 1 + R(s, k, 14) * 1.2;
        g.box(ux, top, uz, uw, 0.8 + R(s, k, 15) * 0.6, ud, swatch(R(s, k, 16) < 0.6 ? 'metal' : 'concreteLight'), tint, GB.NO_BOTTOM);
      }
      if (big || b.floors >= 6) {
        var sx = x0 + 1.2 + R(s, 21, 0) * (b.w - 4.2), sz = z0 + 1.2 + R(s, 22, 0) * (b.d - 4.2);
        g.box(sx, top, sz, 3, 2.6, 2.8, function (f) { return f === 'top' ? swatch('concreteDark') : swatch('concrete'); }, tint, GB.NO_BOTTOM);
      }
      if ((b.style === 'campus' || b.style === 'industrial') && b.w > 8 && R(s, 23, 0) < 0.5) {
        var tx = x0 + b.w * 0.7, tz = z0 + b.d * 0.3;
        for (var j = 0; j < 4; j++) g.box(tx + (j % 2) * 2.4 - 0.1, top, tz + (j >> 1) * 2.4 - 0.1, 0.2, 2, 0.2, swatch('metal'), tint, GB.NO_BOTTOM);
        g.cylinder(tx + 1.2, top + 2, tz + 1.2, 1.5, 1.5, 2, 8, tint, swatch('rust'));
        g.cylinder(tx + 1.2, top + 4, tz + 1.2, 1.5, 0.2, 0.7, 8, tint, swatch('rust'));
      }
      if (b.roof === 'dome') {
        var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, dr = Math.min(b.w, b.d) * 0.32;
        g.cylinder(cx, top, cz, dr * 1.15, dr * 1.15, 3.5, 16, tint, pq);
        g.sphere(cx, top + 3.5, cz, dr, 16, 6, tint, swatch('white'), 1.0);
        g.cylinder(cx, top + 3.5 + dr * 0.95, cz, 0.6, 0.4, 3, 8, tint, swatch('white'));
        g.box(cx - 0.3, top + 3.5 + dr * 0.95 + 3, cz - 0.3, 0.6, 1.2, 0.6, swatch('gold'), tint);
      } else if (b.roof === 'studio') {
        // lower-third: a wide slab cantilevered over the front
        g.box(x0 - 1.5, top + 0.6, z1 - 2.5, b.w + 3, 2.4, 4.5, function (f) { return f === 'south' ? swatch('pink') : swatch('metal'); }, tint);
        g.box(x0 + 1, top + 3, z0 + 1, 0.3, 9, 0.3, swatch('metal'), tint, GB.NO_BOTTOM);
      } else if (b.roof === 'tower') {
        var cw = b.w * 0.6, cd = b.d * 0.6, cx2 = (x0 + x1) / 2, cz2 = (z0 + z1) / 2;
        var crown = function (f) { return f === 'top' ? swatch('gold') : swatch('gold'); };
        g.box(cx2 - cw / 2, top, cz2 - cd / 2, cw, 2.5, cd, crown, tint, GB.NO_BOTTOM);
        g.box(cx2 - cw / 3, top + 2.5, cz2 - cd / 3, cw * 2 / 3, 2, cd * 2 / 3, crown, tint, GB.NO_BOTTOM);
        g.cylinder(cx2, top + 4.5, cz2, 0.5, 0.1, 8, 6, tint, swatch('gold'));
      }
    },
    _stadium: function (g, b, A) {
      // an oval bowl: outer wall ring with the stadium facade, stepped tiers inside, light rings
      var cx = b.cx, cz = b.cz, rx = b.w / 2, rz = b.d / 2, segs = 28, h = b.h, y0 = b.y, tint = GB.WHITE;
      var swatch = A.swatchUV, band = A.bandUV(1, 1), gband = A.bandUV(0, 1);
      for (var i = 0; i < segs; i++) {
        var a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2;
        var ax = cx + Math.cos(a0) * rx, az = cz + Math.sin(a0) * rz, bx = cx + Math.cos(a1) * rx, bz = cz + Math.sin(a1) * rz;
        var len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)), ur = len / 8;
        // walls run counter-clockwise seen from above, so build b->a for an outward normal
        g.quad([bx, y0, bz], [ax, y0, az], [ax, y0 + FLOOR_H, az], [bx, y0 + FLOOR_H, bz], [[0, gband[1]], [ur, gband[1]], [ur, gband[3]], [0, gband[3]]], tint);
        for (var f = 1; f * FLOOR_H < h; f++) {
          var fy0 = y0 + f * FLOOR_H, fy1 = Math.min(y0 + h, fy0 + FLOOR_H), frac = (fy1 - fy0) / FLOOR_H;
          g.quad([bx, fy0, bz], [ax, fy0, az], [ax, fy1, az], [bx, fy1, bz], [[0, band[1]], [ur, band[1]], [ur, band[1] + (band[3] - band[1]) * frac], [0, band[1] + (band[3] - band[1]) * frac]], tint);
        }
        // top rim and inner stepped tiers
        var tiers = 5;
        for (var t = 0; t < tiers; t++) {
          var s0 = 1 - t * 0.09, s1 = 1 - (t + 1) * 0.09, ty = y0 + h - t * (h * 0.55 / tiers), ty1 = ty - (h * 0.55 / tiers);
          var ox0 = cx + Math.cos(a0) * rx * s0, oz0 = cz + Math.sin(a0) * rz * s0, ox1 = cx + Math.cos(a1) * rx * s0, oz1 = cz + Math.sin(a1) * rz * s0;
          var ix0 = cx + Math.cos(a0) * rx * s1, iz0 = cz + Math.sin(a0) * rz * s1, ix1 = cx + Math.cos(a1) * rx * s1, iz1 = cz + Math.sin(a1) * rz * s1;
          g.quad([ox0, ty, oz0], [ox1, ty, oz1], [ix1, ty, iz1], [ix0, ty, iz0], t === 0 ? swatch('concreteLight') : swatch(t % 2 ? 'red' : 'blue'), tint);
          g.quad([ix0, ty, iz0], [ix1, ty, iz1], [ix1, ty1, iz1], [ix0, ty1, iz0], swatch('concrete'), tint);
        }
      }
    },

    _buildProps: function (ch, tx0, tz0, tx1, tz1) {
      var W = Render._World, A = Render._A, props = W.props;
      var byKind = {}, signs = [], lamps = [], beacons = [], edgelights = [];
      var x0 = tx0 * TILE, z0 = tz0 * TILE, x1 = tx1 * TILE, z1 = tz1 * TILE;
      for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (p.x < x0 || p.x >= x1 || p.z < z0 || p.z >= z1) continue;
        if (p.hidden) continue;   // collision-only props (a ship's hull circles, crane legs)
        if (p.kind === 'sign' || p.kind === 'billboard') signs.push(p);
        if (p.kind === 'sign' && !p.standing && !p.pole) continue;   // wall-mounted signs have no post
        if (p.kind === 'lamp') lamps.push(p);
        if (p.kind === 'beacon') beacons.push(p);
        if (p.kind === 'edgelight') edgelights.push(p);
        (byKind[p.kind] || (byKind[p.kind] = [])).push(p);
      }
      Object.keys(byKind).forEach(function (kind) {
        var list = byKind[kind], rec = A.prop(kind);
        var im = new THREE.InstancedMesh(rec.geometry, rec.material, list.length);
        im.castShadow = rec.castShadow && !NO_SHADOW[kind]; im.receiveShadow = true; im.name = 'props:' + kind;
        // Every batch gets an instance colour (white by default): the shared vertex-colour
        // material renders an instanced batch black under shadow maps when one is missing.
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3).fill(1), 3);
        for (var k = 0; k < list.length; k++) {
          var p = list[k], sx = p.sx || p.scale || 1, sy = p.sy || p.scale || 1, sz = p.sz || p.scale || 1;
          if (UNIT_H[kind]) { sy = p.h || 1; if (kind === 'sign' || kind === 'billboard') sy = Math.max(0.5, p.y - (p.h || 1) / 2); }
          if (kind === 'hedge') { sx = p.sx || 1; sz = p.sz || 1; sy = p.h || 1; }
          var py = UNIT_H[kind] ? (kind === 'sign' || kind === 'billboard' ? (p.ground != null ? p.ground : W.heightAt(p.x, p.z, 0)) : (p.y == null ? CURB : p.y)) : (p.y == null ? CURB : p.y);
          if (kind === 'sign' || kind === 'billboard') py = W.heightAt(p.x, p.z, 0);
          _q.setFromAxisAngle(_v2.set(0, 1, 0), p.rot || 0);
          _m.compose(_v.set(p.x, py, p.z), _q, _v2.set(sx, sy, sz));
          // remembered so a knocked-over prop can be tilted in place (and stays down across a rebuild)
          p._inst = { im: im, k: k, x: p.x, y: py, z: p.z, sx: sx, sy: sy, sz: sz, rot: p.rot || 0 };
          if (p.fallen) Render._fallenMatrix(p, 1, _m);
          im.setMatrixAt(k, _m);
          if (p.color) { _col.set(p.color); im.setColorAt(k, _col); }
          else if (kind === 'tree' || kind === 'palm' || kind === 'hedge') { var hv = U.hash2(p.x * 10, p.z * 10, 3); _col.setRGB(0.85 + hv * 0.3, 0.85 + U.hash2(p.x, p.z, 4) * 0.3, 0.85 + hv * 0.2); im.setColorAt(k, _col); }
        }
        im.instanceColor.needsUpdate = true;
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = true;
        im.computeBoundingSphere();
        ch.group.add(im); ch.props.push(im);
      });
      // text signs: one plane each (textures cached by text)
      signs.forEach(function (p) {
        var ar = Math.max(1, (p.w || 4) / (p.h || 1));
        var ratio = p.banner ? 0.5 : ar >= 3 ? 4 : ar >= 1.5 ? 2 : 1;
        var mat = A.signMaterial(p.text || '', !!p.neon, ratio, (p.target || p.gold || p.brass || p.banner) ? { target: !!p.target, gold: !!p.gold, brass: !!p.brass, banner: !!p.banner } : null);
        var geo = Render._planeGeo(p.w || 4, p.h || 1);
        var mesh = new THREE.Mesh(geo, mat);
        // p.rot is a yaw (0 faces -z); a PlaneGeometry faces +z at rotation 0, hence the half turn
        var dir = U.yawToDir(p.rot || 0), faceRot = (p.rot || 0) + Math.PI;
        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.y = faceRot;
        mesh.castShadow = false; mesh.name = 'sign';
        ch.group.add(mesh);
        if (p.double) { var back = new THREE.Mesh(geo, mat); back.position.set(p.x - dir.x * 0.05, p.y, p.z - dir.z * 0.05); back.rotation.y = faceRot + Math.PI; ch.group.add(back); }
        else if (p.kind === 'billboard' || p.standing || p.pole) {
          // a grey backing board with a frame where the back of a free-standing sign can be seen (wall signs have the wall)
          var backing = new THREE.Mesh(Render._planeGeo((p.w || 4) + 0.3, (p.h || 1) + 0.3), Render._backMat());
          backing.position.set(p.x - dir.x * 0.08, p.y, p.z - dir.z * 0.08); backing.rotation.y = faceRot + Math.PI; ch.group.add(backing);
        }
      });
      // night glow: light pools on the ground under lamps + a soft sprite at each head
      if (lamps.length) {
        var g = new GB({ color: false }), pts = [];
        lamps.forEach(function (p) {
          var d = U.yawToDir(p.rot || 0), hx = p.x + d.x * 1.4, hz = p.z + d.z * 1.4, gy = W.heightAt(hx, hz, p.y) + 0.03;
          var r = 5.5;
          g.quad([hx - r, gy, hz - r], [hx - r, gy, hz + r], [hx + r, gy, hz + r], [hx + r, gy, hz - r], [[0, 1], [0, 0], [1, 0], [1, 1]]);
          pts.push(hx, (p.y || CURB) + 5.9, hz);
        });
        var glow = new THREE.Mesh(g.build(), Render._glowMat());
        glow.renderOrder = 5; glow.userData.own = true; glow.name = 'glow';
        ch.group.add(glow); ch.glow = glow;
        var pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        var pm = new THREE.PointsMaterial({ map: A.glow, size: 3.2, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, color: 0xffd9a0 });
        var ptsMesh = new THREE.Points(pg, pm); ptsMesh.renderOrder = 6; ptsMesh.userData.own = true;
        ch.group.add(ptsMesh); ch.glowPts = ptsMesh;
      }
      // the airfield: runway edge lights glow at night (a second Points batch), beacons blink red all day
      if (edgelights.length) {
        var ep = [];
        edgelights.forEach(function (p) { ep.push(p.x, (p.y == null ? 0 : p.y) + 0.35, p.z); });
        var eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3));
        var em = new THREE.PointsMaterial({ map: A.glow, size: 1.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, color: 0xfff0b0 });
        var ePts = new THREE.Points(eg, em); ePts.renderOrder = 6; ePts.userData.own = true; ePts.name = 'edgelights';
        ch.group.add(ePts);
        if (!ch.glowPts) ch.glowPts = ePts; else ch.glowPts2 = ePts;
      }
      if (beacons.length) {
        var bp = [];
        beacons.forEach(function (p) { bp.push(p.x, (p.y == null ? CURB : p.y) + 0.4, p.z); });
        var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
        if (!Render._beaconM) Render._beaconM = new THREE.PointsMaterial({ map: A.glow, size: 2.4, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9, color: 0xff3030 });
        var bPts = new THREE.Points(bg, Render._beaconM); bPts.renderOrder = 6; bPts.userData.own = true; bPts.name = 'beacons';
        ch.group.add(bPts);
      }
    },
    // ---------------------------------------------------- knocked props --
    // A knocked prop tips over its base in the car's direction over 0.45 s (an InstancedMesh matrix update, no new draw).
    _fallen: [],
    knockProp: function (p) { if (p && Render._fallen.indexOf(p) < 0) Render._fallen.push(p); },
    _fallenMatrix: function (p, k, out) {
      var inst = p._inst, f = p.fallen, ease = k * k * (3 - 2 * k), tilt = ease * 1.5;
      _v2.set(f.dz, 0, -f.dx);   // up x fallDir: tipping about this axis leans the prop toward the fall direction
      if (_v2.lengthSq() < 1e-6) _v2.set(1, 0, 0);
      _q.setFromAxisAngle(_v2.normalize(), tilt);
      _q2.setFromAxisAngle(_v2.set(0, 1, 0), inst.rot);
      _q.multiply(_q2);
      out.compose(_v.set(inst.x, inst.y, inst.z), _q, _v2.set(inst.sx, inst.sy, inst.sz));
      return out;
    },
    _animateFallen: function () {
      var list = Render._fallen; if (!list.length) return;
      var now = GTP.game && GTP.game.time ? GTP.game.time.t : 0;
      for (var i = list.length - 1; i >= 0; i--) {
        var p = list[i], inst = p._inst;
        if (!p.fallen || !inst || !inst.im.parent) { if (!p.fallen) list.splice(i, 1); continue; }   // the chunk is gone: the rebuild sets the final pose
        var k = Math.min(1, (now - p.fallen.t) / 0.45);
        inst.im.setMatrixAt(inst.k, Render._fallenMatrix(p, k, _m));
        inst.im.instanceMatrix.needsUpdate = true;
        if (k >= 1) list.splice(i, 1);
      }
    },
    _planeGeo: function (w, h) {
      var key = w.toFixed(2) + 'x' + h.toFixed(2);
      Render._planes = Render._planes || {};
      if (!Render._planes[key]) Render._planes[key] = new THREE.PlaneGeometry(w, h);
      return Render._planes[key];
    },
    // the back of a sign: painted steel with a frame and struts (a canvas texture, so it never reads as a flat black slab)
    _backMat: function () {
      if (Render._bmat) return Render._bmat;
      var cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
      var c = cv.getContext('2d');
      c.fillStyle = '#6e737d'; c.fillRect(0, 0, 256, 128);
      c.fillStyle = '#5a5f68'; for (var i = 0; i < 6; i++) c.fillRect(0, 20 + i * 18, 256, 2);
      c.fillStyle = '#4a4e57'; c.fillRect(0, 0, 256, 8); c.fillRect(0, 120, 256, 8); c.fillRect(0, 0, 8, 128); c.fillRect(248, 0, 8, 128);
      c.fillRect(84, 0, 6, 128); c.fillRect(166, 0, 6, 128);
      c.fillStyle = '#8a8f99'; c.fillRect(0, 8, 256, 2); c.fillRect(8, 0, 2, 128);
      var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      Render._bmat = new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color(0x1a1c22), emissiveIntensity: 0.6, roughness: 0.6, metalness: 0.3 });
      return Render._bmat;
    },
    _glowMat: function () {
      if (!Render._glmat) Render._glmat = new THREE.MeshBasicMaterial({ map: Render._A.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, color: 0xffc070 });
      return Render._glmat;
    },

    // ------------------------------------------------------------ entities --
    attach: function (e) {
      if (!e.mesh) {
        try { e.mesh = Render.buildEntityMesh(e); } catch (err) { U.reportError(err, 'attach'); }
      }
      if (e.mesh && !e.mesh.parent) Render.entityGroup.add(e.mesh);
      if (e.mesh) { e.mesh.position.set(e.x, e.y, e.z); e.mesh.rotation.y = e.yaw || 0; }
    },
    detach: function (e) {
      if (!e.mesh) return;
      if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
      var ud = e.mesh.userData;
      if (ud && ud.paint) ud.paint.dispose();
      if (e.kind === 'vehicle' && Render.lights && Render.lights.headlightOwner === e) { Render.lights.headlight.visible = false; Render.lights.headlightOwner = null; }
    },
    buildEntityMesh: function (e) {
      var A = Render._A;
      if (e.kind === 'ped' || e.kind === 'player') return A.pedParts(e.look || {});
      if (e.kind === 'vehicle') return Render.buildVehicleMesh(e);
      if (e.kind === 'pickup') return (GTP.Combat && GTP.Combat.pickupMesh) ? GTP.Combat.pickupMesh(e) : A.pickupMesh(e.pickupType);
      if (e.kind === 'projectile') {
        var pm = new THREE.Mesh(new THREE.SphereGeometry(e.weaponId === 'hottake' ? 0.16 : 0.07, 6, 4), e.weaponId === 'hottake' ? Render._hotMat() : A.colorMaterial('#ffe08a'));
        return pm;
      }
      return null;
    },
    _hotMat: function () { if (!Render._hm) Render._hm = new THREE.MeshBasicMaterial({ color: 0xff7a20 }); return Render._hm; },
    // shared vehicle materials; the body mesh swaps slots between these by state. The "on" lamps are HDR emitters
    // (values above 1) so the bloom pass blooms headlights, brake lights and light bars.
    _vehicleMats: function () {
      if (Render._vm) return Render._vm;
      var A = Render._A;
      function off(col, rough) { return new THREE.MeshStandardMaterial({ vertexColors: true, color: col, roughness: rough == null ? 0.25 : rough, metalness: 0.3, envMapIntensity: 0.8 }); }
      Render._vm = {
        detail: A.propMaterial(),
        glass: A.glassMaterial(),
        chrome: A.chromeMaterial(),
        headOff: off(0xd6d6cc, 0.15), headOn: A.emitterMaterial(3.2, 3.1, 2.7),
        tailOff: off(0x8a6a68, 0.2), tailOn: A.emitterMaterial(2.4, 0.3, 0.22), tailBrake: A.emitterMaterial(4.5, 0.55, 0.4),
        barOff: off(0x555555), barDim: off(0xffffff, 0.2), barOn: A.emitterMaterial(4.0, 4.0, 4.0),
        wreck: new THREE.MeshStandardMaterial({ color: 0x1f1d1b, roughness: 0.95, metalness: 0.1 }), wreckGlass: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.2 })
      };
      return Render._vm;
    },
    _beamMat: function () {
      if (!Render._bmm) Render._bmm = new THREE.MeshBasicMaterial({ map: Render._A.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.42, color: 0xffe3a8 });
      return Render._bmm;
    },
    _wrapMat: function (name) {
      Render._wm = Render._wm || {};
      if (!Render._wm[name]) Render._wm[name] = new THREE.MeshStandardMaterial({ map: Render._A.wrapTexture(name), vertexColors: true, roughness: 0.45, metalness: 0.1, envMapIntensity: 0.6 });
      return Render._wm[name];
    },
    buildVehicleMesh: function (e) {
      var A = Render._A, rec = A.vehicleGeometry(e.type || 'sedan', e.wrap), M = Render._vehicleMats();
      var paint = A.paintMaterial(e.color || '#c94040');
      var mats = [paint, M.detail, M.glass, M.headOff, M.tailOff, M.barDim, M.barDim, e.wrap ? Render._wrapMat(e.wrap) : M.detail, M.chrome];
      var grp = new THREE.Group();
      var body = new THREE.Mesh(rec.body, mats); body.castShadow = true; body.receiveShadow = false; body.name = 'body'; grp.add(body);
      var n = rec.wheelOffsets.length;
      var wheels = new THREE.InstancedMesh(rec.wheel, M.detail, n);
      wheels.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      wheels.castShadow = true; wheels.name = 'wheels'; wheels.frustumCulled = false;
      grp.add(wheels);
      // headlight pool on the road ahead (additive glow quad, shown when the lights are on)
      var beam = new THREE.Mesh(Render._planeGeo(rec.size.width + 3, 15), Render._beamMat());
      beam.rotation.x = -Math.PI / 2; beam.position.set(0, 0.05 - rec.wheelRadius * 0, -rec.size.length / 2 - 7.2); beam.visible = false; beam.renderOrder = 4; beam.name = 'beam';
      grp.add(beam);
      grp.userData = { rec: rec, mats: mats, paint: paint, wheels: wheels, beam: beam, wrecked: false };
      _e = _e || new THREE.Euler();
      for (var i = 0; i < n; i++) { var o = rec.wheelOffsets[i]; _m.compose(_v.set(o.x, rec.wheelRadius, o.z), _q.identity(), _v2.set(1, 1, 1)); wheels.setMatrixAt(i, _m); }
      wheels.instanceMatrix.needsUpdate = true;
      return grp;
    },
    // called from Vehicle.syncMesh: wheels, light states, wreck look, the player's headlight spot
    syncVehicle: function (v) {
      var m = v.mesh, ud = m && m.userData; if (!ud || !ud.rec) return;
      var rec = ud.rec, mats = ud.mats, M = Render._vehicleMats(), wheels = ud.wheels, i, o;
      for (i = 0; i < rec.wheelOffsets.length; i++) {
        o = rec.wheelOffsets[i];
        _e.set(v.wheelSpin, o.steer ? v.wheelSteer : 0, 0, 'YXZ'); _q.setFromEuler(_e);
        _m.compose(_v.set(o.x, rec.wheelRadius, o.z), _q, _v2.set(1, 1, 1)); wheels.setMatrixAt(i, _m);
      }
      wheels.instanceMatrix.needsUpdate = true;
      if (v.wreck) {
        if (!ud.wrecked) { ud.wrecked = true; mats[0] = M.wreck; mats[1] = M.wreck; mats[2] = M.wreckGlass; mats[3] = M.wreck; mats[4] = M.wreck; mats[5] = M.wreck; mats[6] = M.wreck; mats[7] = M.wreck; mats[8] = M.wreck; if (ud.wheels) ud.wheels.material = M.wreck; if (ud.beam) ud.beam.visible = false; }
      } else {
        var night = Render.night || 0, driven = !!v.driver || v.lights;
        var lightsOn = driven && night > 0.25 && !v.sinking;
        if (ud.beam) ud.beam.visible = lightsOn && Render.lit > 0.05;
        mats[3] = lightsOn ? M.headOn : M.headOff;
        mats[4] = v.braking ? M.tailBrake : (lightsOn ? M.tailOn : M.tailOff);
        if (v.isPolice) {
          if (v.siren) { var ph = Math.floor(v.age * 5) % 2; mats[5] = ph ? M.barOn : M.barOff; mats[6] = ph ? M.barOff : M.barOn; }
          else { mats[5] = M.barDim; mats[6] = M.barDim; }
        }
        // the player's car throws a real spotlight at night
        var L = Render.lights;
        if (L && L.headlight && v.hasPlayer()) {
          L.headlightOwner = v;
          L.headlight.visible = lightsOn;
          if (lightsOn) {
            var p = v.localToWorld(0, v.cls.length / 2 - 0.1), t = v.localToWorld(0, v.cls.length / 2 + 14);
            L.headlight.position.set(p.x, v.y + rec.lightPoints.head.y, p.z);
            L.headlight.target.position.set(t.x, v.y - 0.3, t.z);
          }
        } else if (L && L.headlightOwner === v) { L.headlight.visible = false; L.headlightOwner = null; }
      }
    },

    // ------------------------------------------------------------- markers --
    // Mission markers: a translucent cylinder of light (blue: an available mission at a giver's door,
    // yellow: the current objective) with a bright core and a ground ring. Missions owns the list and
    // positions; Render owns the look. userData.pulse(k) breathes the opacity (k 0..1).
    markerGroup: null,
    _markerTex: function () {
      if (Render._mtex) return Render._mtex;
      var cv = document.createElement('canvas'); cv.width = 8; cv.height = 128;
      var ctx = cv.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(255,255,255,0.35)'); g.addColorStop(0.92, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0.6)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 128);
      var tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      Render._mtex = tex;
      return tex;
    },
    // one shared geometry per size: the tube, a brighter core, the ground ring and a dim disc merged into a single draw;
    // the ring and disc sample fixed rows of the gradient (bright near the bottom, dim higher up)
    _markerGeo: function (r, h) {
      Render._mgeo = Render._mgeo || {};
      var key = r.toFixed(2) + 'x' + h.toFixed(2);
      if (Render._mgeo[key]) return Render._mgeo[key];
      var parts = [], m = new THREE.Matrix4();
      function add(g, mat, u, v) {
        if (g.index) g = g.toNonIndexed();
        if (u != null) { var a = g.attributes.uv.array; for (var i = 0; i < a.length; i += 2) { a[i] = u; a[i + 1] = v; } }
        g.applyMatrix4(mat); parts.push(g);
      }
      add(new THREE.CylinderGeometry(r, r, h, 28, 1, true), m.makeTranslation(0, h / 2, 0));
      add(new THREE.CylinderGeometry(r * 0.45, r * 0.45, h * 0.8, 16, 1, true), m.makeTranslation(0, h * 0.4, 0));
      add(new THREE.RingGeometry(r * 0.78, r * 1.18, 40), m.makeRotationX(-Math.PI / 2).setPosition(0, 0.07, 0), 0.5, 0.04);
      add(new THREE.CircleGeometry(r * 0.8, 32), m.makeRotationX(-Math.PI / 2).setPosition(0, 0.06, 0), 0.5, 0.45);
      var n = 0, i;
      for (i = 0; i < parts.length; i++) n += parts[i].attributes.position.count;
      var pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), o = 0;
      for (i = 0; i < parts.length; i++) { var g = parts[i]; pos.set(g.attributes.position.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.userData.shared = true;
      Render._mgeo[key] = geo;
      return geo;
    },
    markerMesh: function (color, opts) {
      opts = opts || {};
      var r = opts.radius || 1.6, h = opts.height || 7.5;
      var mat = new THREE.MeshBasicMaterial({ map: Render._markerTex(), color: color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
      var mesh = new THREE.Mesh(Render._markerGeo(r, h), mat);
      mesh.renderOrder = 8; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.name = 'light';
      var grp = new THREE.Group();
      grp.add(mesh);
      grp.userData = { color: color, mesh: mesh, pulse: function (k) { mat.opacity = 0.42 + 0.26 * k; } };
      grp.name = 'marker';
      return grp;
    },
    addMarker: function (mesh) {
      if (!mesh || !Render.scene) return;
      if (!Render.markerGroup) { Render.markerGroup = new THREE.Group(); Render.markerGroup.name = 'markers'; Render.scene.add(Render.markerGroup); }
      Render.markerGroup.add(mesh);
    },
    removeMarker: function (mesh) {
      if (!mesh) return;
      if (mesh.parent) mesh.parent.remove(mesh);
      mesh.traverse(function (o) { if (o.isMesh) { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); } });
    },

    // ------------------------------------------------------------------ fx --
    fx: {
      list: [], texts: [], _pool: [], _lines: [], decals: 0, MAX_DECALS: 220,
      // skid marks and decals live in one InstancedMesh (one draw call for all of them) with a per-instance colour and alpha;
      // a free instance is scaled to nothing. Before the batch, forty cars braking for lights carpeted the avenues in
      // 180 skid meshes, each its own draw call
      _decalIM: null, _decalFree: [], _decalAlpha: null, _decalDirty: false,
      init: function () {
        var F = Render.fx, N = F.MAX_DECALS, i;
        if (F._decalIM) return;
        var geo = new THREE.PlaneGeometry(1, 1);
        var alpha = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); alpha.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('iAlpha', alpha);
        var mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        mat.onBeforeCompile = function (sh) {
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float iAlpha;\nvarying float vIAlpha;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvIAlpha = iAlpha;');
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying float vIAlpha;')
            .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vIAlpha );');
        };
        mat.customProgramCacheKey = function () { return 'gtp-decals'; };
        var im = new THREE.InstancedMesh(geo, mat, N);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.frustumCulled = false; im.renderOrder = 3; im.name = 'decals';
        var zero = new THREE.Matrix4().makeScale(0, 0, 0), white = new THREE.Color(0xffffff);
        for (i = 0; i < N; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, white); }
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        F._decalIM = im; F._decalAlpha = alpha; F._decalFree = [];
        for (i = N - 1; i >= 0; i--) F._decalFree.push(i);
        F._decalM = new THREE.Matrix4(); F._decalP = new THREE.Vector3(); F._decalQ = new THREE.Quaternion(); F._decalS = new THREE.Vector3(); F._decalE = new THREE.Euler(); F._decalC = new THREE.Color();
        Render.fxGroup.add(im);
      },
      _placeDecal: function (o, slot) {
        var F = Render.fx;
        F._decalP.set(o.x, (o.y || 0) + 0.025, o.z);
        F._decalE.set(-Math.PI / 2, o.rot || 0, 0, 'YXZ');   // flat on the ground, turned to the heading
        F._decalQ.setFromEuler(F._decalE);
        F._decalS.set(o.size || 0.6, o.size2 || (o.size || 0.6), 1);
        F._decalM.compose(F._decalP, F._decalQ, F._decalS);
        F._decalIM.setMatrixAt(slot, F._decalM);
        F._decalC.set(o.color || (o.type === 'skid' ? 0x14161a : 0x303030));
        F._decalIM.setColorAt(slot, F._decalC);
        F._decalAlpha.array[slot] = o.type === 'skid' ? 0.55 : 0.7;
        F._decalIM.instanceMatrix.needsUpdate = true; F._decalIM.instanceColor.needsUpdate = true; F._decalAlpha.needsUpdate = true;
      },
      add: function (o) {
        o = o || {}; o.t = 0;
        var type = o.type || 'puff';
        var ext = Render.fx.extensions[type]; if (ext) return ext.add(o);   // a registered type (Combat's shell casings)
        o.life = o.life || (type === 'explosion' ? 0.9 : type === 'smoke' ? 1.6 : type === 'tracer' ? 0.08 : type === 'decal' || type === 'skid' ? 12 : type === 'text' ? 1.2 : type === 'ring' ? 0.5 : type === 'fire' ? 0.45 : 0.5);
        if (type === 'text') { Render.fx.texts.push(o); return o; }
        if (type === 'tracer') {
          var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([o.x, o.y, o.z, o.x2, o.y2, o.z2], 3));
          o.obj = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9 })); o.obj.userData.own = true;
        } else if (type === 'decal' || type === 'skid') {
          if (!Render.fx._decalIM) Render.fx.init();
          if (!Render.fx._decalFree.length) {   // the batch is full: the oldest mark goes
            var L0 = Render.fx.list;
            for (var di = 0; di < L0.length; di++) if (L0[di].type === 'decal' || L0[di].type === 'skid') { Render.fx._release(L0[di]); L0.splice(di, 1); break; }
          }
          var slot = Render.fx._decalFree.pop();
          if (slot == null) return o;
          Render.fx.decals++;
          o.slot = slot; o.obj = null;
          Render.fx._placeDecal(o, slot);
        } else if (type === 'ring') {
          o.obj = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 28), new THREE.MeshBasicMaterial({ color: o.color || 0xffb060, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
          o.obj.rotation.x = -Math.PI / 2; o.obj.position.set(o.x, (o.y || 0) + 0.08, o.z); o.obj.userData.own = true; o.size = o.size || 6;
        } else {
          var sp = Render.fx._pool.pop();
          if (!sp) sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: Render._A.particle, transparent: true, depthWrite: false }));
          sp.material.blending = (type === 'spark' || type === 'fire' || type === 'explosion') ? THREE.AdditiveBlending : THREE.NormalBlending;
          sp.material.color.set(o.color || (type === 'puff' ? 0xd8d8d8 : type === 'smoke' ? 0x444444 : type === 'spark' ? 0xffd080 : type === 'fire' ? 0xff7a20 : 0xffb050));
          sp.material.opacity = 1; sp.visible = true;
          o.obj = sp; o.size = o.size || (type === 'explosion' ? 6 : type === 'smoke' ? 1.5 : type === 'fire' ? 1.2 : 0.6);
          o.vx = o.vx || 0; o.vy = o.vy == null ? (type === 'smoke' ? 1.2 : type === 'fire' ? 2 : 0.4) : o.vy; o.vz = o.vz || 0;
          o.gravity = type === 'spark' ? 9 : 0;
        }
        if (o.obj) Render.fxGroup.add(o.obj);
        Render.fx.list.push(o);
        return o;
      },
      // another module's fx type: {add(o) -> o, update(dt), sync(), clear()} runs beside the built-in list (Combat registers 'casing')
      extensions: {},
      register: function (type, handler) { Render.fx.extensions[type] = handler; return handler; },
      _each: function (method, arg) { var X = Render.fx.extensions; for (var k in X) if (X[k] && X[k][method]) X[k][method](arg); },
      update: function (dt) {
        var L = Render.fx.list;
        for (var i = L.length - 1; i >= 0; i--) {
          var o = L[i]; o.t += dt;
          if (o.vx != null) { if (o.gravity) o.vy -= o.gravity * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; }
          if (o.t >= o.life) { Render.fx._release(o); L.splice(i, 1); }
        }
        var T = Render.fx.texts;
        for (i = T.length - 1; i >= 0; i--) { T[i].t += dt; if (T[i].t >= T[i].life) T.splice(i, 1); }
        Render.fx._each('update', dt);
      },
      sync: function () {
        Render.fx._each('sync');
        var L = Render.fx.list;
        for (var i = 0; i < L.length; i++) {
          var o = L[i], k = o.t / o.life;
          if (o.obj && o.obj.isSprite) {
            o.obj.position.set(o.x, o.y, o.z);
            var s = o.size * (o.type === 'explosion' ? 0.4 + k * 1.2 : o.type === 'fire' ? 1.1 - k * 0.7 : o.type === 'spark' ? 1 - k * 0.6 : 0.6 + k * 0.8);
            o.obj.scale.set(s, s, 1);
            o.obj.material.opacity = (1 - k) * (o.type === 'smoke' ? 0.55 : 1);
          } else if (o.obj && o.type === 'ring') { var rs = o.size * (0.15 + k * 0.85); o.obj.scale.set(rs, rs, 1); o.obj.material.opacity = 0.9 * (1 - k); }
          else if (o.slot != null && k > 0.7) { Render.fx._decalAlpha.array[o.slot] = (o.type === 'skid' ? 0.55 : 0.7) * (1 - (k - 0.7) / 0.3); Render.fx._decalDirty = true; }
        }
        if (Render.fx._decalDirty) { Render.fx._decalAlpha.needsUpdate = true; Render.fx._decalDirty = false; }
      },
      _release: function (o) {
        if (o.slot != null) {   // a batched decal: its instance is scaled to nothing and the slot goes back on the free list
          var F = Render.fx;
          F.decals = Math.max(0, F.decals - 1);
          F._decalM.makeScale(0, 0, 0); F._decalIM.setMatrixAt(o.slot, F._decalM); F._decalIM.instanceMatrix.needsUpdate = true;
          F._decalFree.push(o.slot); o.slot = null;
          return;
        }
        if (!o.obj) return;
        Render.fxGroup.remove(o.obj);
        if (o.obj.isSprite) { o.obj.visible = false; Render.fx._pool.push(o.obj); }
        else { if (o.obj.geometry && o.obj.userData.own) o.obj.geometry.dispose(); if (o.obj.material && o.obj.material.dispose && !o.obj.isSprite) o.obj.material.dispose(); }
        o.obj = null;
      },
      clear: function () { var L = Render.fx.list; for (var i = 0; i < L.length; i++) Render.fx._release(L[i]); L.length = 0; Render.fx.texts.length = 0; Render.fx.decals = 0; Render.fx._each('clear'); }
    },

    // ----------------------------------------------------------------- rig --
    // Third-person chase camera. Game.step calls update(dt) each fixed step; frame()
    // applies the result. Never snaps except on reset/teleport/respawn.
    //   chase on foot: 4.2 m back, 1.9 m up, looks at the chest; yaw eases behind movement after 1.2 s without look input
    //   chase in a vehicle: 7.5 m (bus 10, truck 9), 3 m up, yaw eases toward the velocity direction (reverse flips after 0.5 s),
    //                       fov 60 -> 75 with speed, slight roll on hard turns, shake on impacts
    //   close halves distances; first is at eye height (bonnet view in a car); aim is over the right shoulder
    //   collision: raycast focus -> desired against buildings, pull in by 0.3 m; a final guard keeps the smoothed camera out of any AABB
    rig: {
      mode: 'chase', yaw: 0, pitch: 0.2, dist: C.CAMERA.footDist, fov: C.CAMERA.fov, roll: 0,
      pos: { x: 0, y: 2, z: 5 }, focus: { x: 0, y: 1.25, z: 0 }, shakeAmt: 0, _shakeT: 0, _snap: true, _target: null, _lastMoveYaw: 0, pulled: false,
      kickP: 0, kickY: 0, _kickLam: 16, _swayP: 0, _swayY: 0,
      // follow an entity; ease = glide there instead of snapping (cutscenes)
      target: function (e, ease) { Render.rig._target = e; if (!ease) Render.rig._snap = true; return e; },
      reset: function () { var r = Render.rig; r.yaw = 0; r.pitch = 0.2; r._snap = true; r.shakeAmt = 0; r.fov = C.CAMERA.fov; r.roll = 0; r.kickP = r.kickY = 0; r._swayP = r._swayY = 0; },
      snap: function () { Render.rig._snap = true; },
      shake: function (a) { Render.rig.shakeAmt = Math.min(1.5, Render.rig.shakeAmt + a); },
      // recoil (Combat): the view jumps up (and a little sideways) and recovers by damp over `recover` seconds (0.25 default)
      kick: function (pitchDeg, yawDeg, recover) {
        var r = Render.rig, kp = (pitchDeg || 0) * Math.PI / 180, ky = (yawDeg || 0) * Math.PI / 180;
        r.pitch = Math.max(C.CAMERA.pitchMin, r.pitch - kp); r.yaw += ky;
        r.kickP += kp; r.kickY += ky; r._kickLam = 4 / (recover || 0.25);
      },
      update: function (dt, input) {
        var r = Render.rig, CAM = C.CAMERA, W = Render._World;
        var t = r._target || (GTP.game && GTP.game.player);
        if (!t) return;
        var look = input ? input.look : null;
        // the sniper's scope (Combat.scope): the look is divided by the zoom, the fov follows the zoom and a breath sway rides on top
        var sc = GTP.Combat && GTP.Combat.scope && GTP.Combat.scope.active ? GTP.Combat.scope : null, fov0 = r.fov;
        if (sc && look && (look.dx || look.dy)) { look.dx /= sc.zoom; look.dy /= sc.zoom; }
        var v = t.inVehicle || t.vehicle || null, inCar = !!v;
        var mode = (t.cameraMode || r.mode);
        var speed = Math.sqrt((t.vx || 0) * (t.vx || 0) + (t.vz || 0) * (t.vz || 0));
        var now = GTP.game ? GTP.game.time.t : 0;
        if (look && (look.dx || look.dy)) {
          r.yaw -= look.dx * CAM.lookSens; r.pitch = U.clamp(r.pitch + look.dy * CAM.lookSens, CAM.pitchMin, CAM.pitchMax);
        } else {
          var since = now - (input ? input.lastLookTime : -1e9);
          if (inCar) {
            if (since > CAM.carAutoYawDelay && !t.aiming) {   // a drive-by holds the camera where the mouse put it
              var tgt;
              if (v.reversing) tgt = v.reverseTime > CAM.reverseFlipDelay ? v.yaw + Math.PI : v.yaw;
              else tgt = speed > 2.5 ? U.dirToYaw(t.vx, t.vz) : v.yaw;
              r.yaw = U.angleDamp(r.yaw, tgt, CAM.carAutoYawRate * U.clamp(speed / 6, 0.45, 1), dt);
              r.pitch = U.damp(r.pitch, CAM.carPitch, 1.5, dt);
            }
          } else if (speed > 0.6 && since > CAM.autoYawDelay && !t.aiming && !t.knockedDown && t.alive !== false) {
            // ease behind where the player is going: the move intent, so a bump from a car or a crowd does not swing the
            // camera (and a knockdown slide never does: the camera holds until the player is up and moving again)
            var it = t.intent, useIntent = it && (it.x * it.x + it.z * it.z) > 0.09;
            if (useIntent) r.yaw = U.angleDamp(r.yaw, U.dirToYaw(it.x, it.z), CAM.autoYawRate, dt);
            r.pitch = U.damp(r.pitch, 0.2, 1.5, dt);
          }
        }
        var dist, height, lookH;
        if (inCar) { dist = v.type === 'bus' ? CAM.busDist : v.type === 'truck' ? CAM.truckDist : CAM.carDist; height = CAM.carHeight * U.clamp(v.cls.height / 1.5, 1, 1.5); lookH = Math.min(1.7, v.cls.height * 0.6); }
        else { dist = CAM.footDist; height = CAM.footHeight; lookH = CAM.footLookHeight; }
        if (mode === 'close') { dist *= CAM.closeScale; height *= 0.8; }
        var aiming = !!t.aiming && !inCar;
        var fx = t.x, fy = t.y + lookH, fz = t.z;
        var d = U.yawToDir(r.yaw), rx = -d.z, rz = d.x;   // right vector
        var desired; r.pulled = false;
        if (mode === 'first') {
          if (inCar) {
            var rec = Render._A.vehicleGeometry(v.type, v.wrap), eye = rec.lightPoints.eye, ep = v.localToWorld(eye.x, -eye.z);
            desired = { x: ep.x, y: v.y + eye.y, z: ep.z };
          } else desired = { x: t.x + d.x * 0.15, y: t.y + C.PLAYER.eye, z: t.z + d.z * 0.15 };
          fx = desired.x + d.x * 6; fy = desired.y - Math.sin(r.pitch) * 3; fz = desired.z + d.z * 6;
        } else if (aiming) {
          var ah = CAM.aimHeight || 1.85, al = CAM.aimLookHeight || 1.5;
          desired = { x: t.x - d.x * CAM.aimDist + rx * CAM.aimSide, y: t.y + ah + Math.sin(r.pitch) * 1.2, z: t.z - d.z * CAM.aimDist + rz * CAM.aimSide };
          fx = t.x + d.x * 8 + rx * CAM.aimSide; fy = t.y + al - Math.sin(r.pitch) * 6; fz = t.z + d.z * 8 + rz * CAM.aimSide;
          desired = Render.rig._pullIn(t.x, t.y + 1.5, t.z, desired, 0.4);
        } else {
          var D = dist * Math.cos(r.pitch), Hh = dist * Math.sin(r.pitch) + (height - lookH);
          desired = { x: fx - d.x * D, y: fy + Hh, z: fz - d.z * D };
          desired = Render.rig._pullIn(fx, fy, fz, desired, 0.6);
          var floor = W.heightAt(desired.x, desired.z, desired.y) + 0.45;
          if (desired.y < floor) desired.y = floor;
        }
        var targetFov = inCar ? U.lerp(CAM.fov, CAM.fovSpeedMax, U.clamp(speed / CAM.fovSpeedAt, 0, 1)) : (aiming ? CAM.aimFov : CAM.fov);
        if (r._snap) { r.pos.x = desired.x; r.pos.y = desired.y; r.pos.z = desired.z; r.focus.x = fx; r.focus.y = fy; r.focus.z = fz; r.fov = targetFov; r.roll = 0; r._snap = false; }
        else {
          var far = U.dist2d(r.pos.x, r.pos.z, desired.x, desired.z) > 40;
          var k = far ? 1e3 : (mode === 'first' ? 60 : CAM.posDamp);
          r.pos.x = U.damp(r.pos.x, desired.x, k, dt); r.pos.y = U.damp(r.pos.y, desired.y, k, dt); r.pos.z = U.damp(r.pos.z, desired.z, k, dt);
          r.focus.x = U.damp(r.focus.x, fx, k * 1.5, dt); r.focus.y = U.damp(r.focus.y, fy, k * 1.5, dt); r.focus.z = U.damp(r.focus.z, fz, k * 1.5, dt);
          r.fov = U.damp(r.fov, targetFov, CAM.fovDamp, dt);
        }
        // guard: the smoothed camera never sits inside a building (smoothing can cut a corner the raycast missed)
        if (mode !== 'first') {
          var gx = r.pos.x - fx, gy = r.pos.y - fy, gz = r.pos.z - fz, gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
          var ghit = W.raycastBuildings(fx, fy, fz, gx / gl, gy / gl, gz / gl, gl + CAM.collisionPad);
          if (ghit) { var gt = Math.max(0.5, ghit.t - CAM.collisionPad); r.pos.x = fx + gx / gl * gt; r.pos.y = fy + gy / gl * gt; r.pos.z = fz + gz / gl * gt; r.pulled = true; }
        }
        var rollT = inCar && mode !== 'first' ? U.clamp(-v.yawRate * speed * 0.0045, -CAM.rollMax, CAM.rollMax) : 0;
        r.roll = U.damp(r.roll, rollT, CAM.rollDamp, dt);
        if (r.shakeAmt > 0) { r._shakeT += dt * 40; r.shakeAmt = Math.max(0, r.shakeAmt - dt * CAM.shakeDecay * r.shakeAmt - dt * 0.2); }
        // recoil recovery: the kicked offset eases back out of yaw / pitch
        if (r.kickP || r.kickY) {
          var np = U.damp(r.kickP, 0, r._kickLam, dt), ny = U.damp(r.kickY, 0, r._kickLam, dt);
          r.pitch += r.kickP - np; r.yaw += ny - r.kickY;
          r.kickP = Math.abs(np) < 1e-4 ? 0 : np; r.kickY = Math.abs(ny) < 1e-4 ? 0 : ny;
        }
        if (sc) {
          r.fov = U.damp(fov0, sc.fov, 9, dt);
          var amp = (sc.sway || 0.15) * Math.PI / 180 * (sc.stillT > 1 ? 0.5 : 1), sy = Math.sin(sc.t * Math.PI) * amp, sp = Math.sin(sc.t * Math.PI * 1.3 + 1) * amp * 0.6;
          r.yaw += sy - r._swayY; r.pitch += sp - r._swayP; r._swayY = sy; r._swayP = sp;
        } else if (r._swayY || r._swayP) { r.yaw -= r._swayY; r.pitch -= r._swayP; r._swayY = r._swayP = 0; }
      },
      // pull the desired camera in to the first building face between the focus and the camera
      _pullIn: function (fx, fy, fz, desired, minDist) {
        var CAM = C.CAMERA, W = Render._World;
        var ddx = desired.x - fx, ddy = desired.y - fy, ddz = desired.z - fz, len = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
        var hit = W.raycastBuildings(fx, fy, fz, ddx / len, ddy / len, ddz / len, len + CAM.collisionPad);
        if (hit) { var tt = Math.max(minDist, hit.t - CAM.collisionPad); Render.rig.pulled = true; return { x: fx + ddx / len * tt, y: fy + ddy / len * tt, z: fz + ddz / len * tt }; }
        return desired;
      },
      apply: function () {
        var r = Render.rig, cam = Render.camera;
        var sx = 0, sy = 0, sr = 0;
        if (r.shakeAmt > 0) { sx = Math.sin(r._shakeT * 1.3) * r.shakeAmt * 0.12; sy = Math.cos(r._shakeT) * r.shakeAmt * 0.1; sr = Math.sin(r._shakeT * 0.7) * r.shakeAmt * 0.012; }
        cam.position.set(r.pos.x + sx, r.pos.y + sy, r.pos.z);
        cam.lookAt(r.focus.x, r.focus.y, r.focus.z);
        if (r.roll || sr) cam.rotateZ(r.roll + sr);
        if (Math.abs(cam.fov - r.fov) > 0.05) { cam.fov = r.fov; cam.updateProjectionMatrix(); }
      }
    }
  };
})();