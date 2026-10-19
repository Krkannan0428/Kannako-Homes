/* Grand Theft Pundit: 10_render.js
 * GTP.Render: three.js scene, chunked static meshes built from the tile map
 * and the building list, InstancedMesh props, sky dome + sun, fog, day/night
 * (lit windows, neon, lamp glow), water, fx, the third-person camera rig,
 * worldToScreen and a free camera for tests.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util, GB = GTP.GeoBuilder;
  var TILE = C.TILE, CURB = C.CURB_H, DECK_Y = C.DECK_Y, THICK = C.DECK_THICK, WATER_Y = C.WATER_Y, FLOOR_H = C.FLOOR_H;
  var CH = C.CHUNK_TILES;
  var UNIT_H = { pillar: 1, flag: 1, mast: 1, stack: 1, antenna: 1, sign: 1, bin: 1, billboard: 1 };
  var _v = null, _v2 = null, _m = null, _q = null, _col = null;

  var Render = GTP.Render = {
    renderer: null, scene: null, camera: null, canvas: null, hudCanvas: null, hudCtx: null,
    width: 1280, height: 720, dpr: 1,
    chunks: new Map(), chunkGroup: null, entityGroup: null, fxGroup: null,
    sky: null, lights: null, water: null, night: 0, env: null,
    free: false, headless: false,
    stats: { frameMs: 0, chunkBuilds: 0, triangles: 0, calls: 0 },
    _A: null, _World: null, _buildQueue: [], _camChunk: null,

    init: function (canvasGl) {
      var A = Render._A = GTP.Assets, W = Render._World = GTP.World;
      A.init();
      _v = new THREE.Vector3(); _v2 = new THREE.Vector3(); _m = new THREE.Matrix4(); _q = new THREE.Quaternion(); _col = new THREE.Color();
      Render.canvas = canvasGl;
      Render.headless = !!(GTP.game && GTP.game.headless);
      var r = Render.renderer = new THREE.WebGLRenderer({ canvas: canvasGl, antialias: !Render.headless, powerPreference: 'high-performance', alpha: false, stencil: false });
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
      r.shadowMap.enabled = !!C.QUALITY.shadows; r.shadowMap.type = THREE.PCFShadowMap;
      r.setClearColor(0x0c1020, 1);
      var s = Render.scene = new THREE.Scene();
      s.fog = new THREE.Fog(0xb9cde0, C.QUALITY.fogStart, C.QUALITY.drawDistance);
      Render.camera = new THREE.PerspectiveCamera(C.CAMERA.fov, 16 / 9, 0.3, 1500);
      Render.chunkGroup = new THREE.Group(); Render.chunkGroup.name = 'chunks'; s.add(Render.chunkGroup);
      Render.entityGroup = new THREE.Group(); Render.entityGroup.name = 'entities'; s.add(Render.entityGroup);
      Render.fxGroup = new THREE.Group(); Render.fxGroup.name = 'fx'; s.add(Render.fxGroup);
      Render._initLights();
      Render._initSky();
      Render._initWater();
      Render.fx.init();
      Render.hudCanvas = document.getElementById('hud');
      if (Render.hudCanvas) Render.hudCtx = Render.hudCanvas.getContext('2d');
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
      if (GTP.UI && GTP.UI.resize) GTP.UI.resize(w, h);
    },

    // ------------------------------------------------------------ lights --
    _initLights: function () {
      var s = Render.scene;
      var hemi = new THREE.HemisphereLight(0x9fc3f0, 0x6c6a5c, 0.65);
      var sun = new THREE.DirectionalLight(0xfff4d6, 1.25);
      sun.castShadow = !!C.QUALITY.shadows;
      var box = C.QUALITY.shadowBox / 2;
      sun.shadow.camera.left = -box; sun.shadow.camera.right = box; sun.shadow.camera.top = box; sun.shadow.camera.bottom = -box;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
      sun.shadow.mapSize.set(C.QUALITY.shadowMap, C.QUALITY.shadowMap);
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
      var target = new THREE.Object3D();
      s.add(hemi); s.add(sun); s.add(target); sun.target = target;
      var fill = new THREE.AmbientLight(0x202838, 0.0);
      s.add(fill);
      Render.lights = { hemi: hemi, sun: sun, target: target, fill: fill, sunDir: new THREE.Vector3(0.5, 0.6, 0.4) };
    },
    _initSky: function () {
      var A = Render._A, s = Render.scene;
      var dome = new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 16), new THREE.MeshBasicMaterial({ map: A.sky, side: THREE.BackSide, fog: false, depthWrite: false }));
      dome.renderOrder = -10; dome.frustumCulled = false;
      var sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.sun, color: 0xffffff, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
      sun.scale.set(180, 180, 1); sun.renderOrder = -9;
      var moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.particle, color: 0xcfd8f0, fog: false, depthWrite: false, transparent: true, opacity: 0 }));
      moon.scale.set(60, 60, 1); moon.renderOrder = -9;
      // stars
      var R = GTP.makeRng(4242), pos = [];
      for (var i = 0; i < 500; i++) {
        var a = R.random() * Math.PI * 2, e = 0.08 + R.random() * 0.9, c = Math.cos(e);
        pos.push(Math.cos(a) * c * 1000, Math.sin(e) * 1000, Math.sin(a) * c * 1000);
      }
      var sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      var stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false }));
      stars.renderOrder = -9; stars.frustumCulled = false;
      s.add(dome); s.add(sun); s.add(moon); s.add(stars);
      Render.sky = { dome: dome, sun: sun, moon: moon, stars: stars, last: -1 };
    },
    _initWater: function () {
      var A = Render._A, W = Render._World;
      var size = 2600;
      var geo = new THREE.PlaneGeometry(size, size, 1, 1);
      geo.rotateX(-Math.PI / 2);
      var mat = new THREE.MeshPhongMaterial({ map: A.water, color: 0xffffff, shininess: 90, specular: new THREE.Color(0x66aacc), transparent: true, opacity: 0.94 });
      A.water.repeat.set(size / 10, size / 10);
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(C.MAP_W * TILE / 2, WATER_Y, C.MAP_H * TILE / 2);
      mesh.receiveShadow = true; mesh.renderOrder = -1;
      Render.scene.add(mesh);
      Render.water = mesh;
      void W;
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
    // interpolate sky/light presets from the clock and push them to the scene
    updateEnvironment: function (clock) {
      var D = C.DAY, SKY = C.SKY, L = Render.lights, A = Render._A;
      clock = ((clock % 24) + 24) % 24;
      var night = Render.night = Render.nightFromClock(clock);
      var dayFrac = (clock - D.sunrise) / (D.sunset - D.sunrise);
      var elev = Math.sin(Math.PI * U.clamp(dayFrac, 0, 1)) * 62 * Math.PI / 180;   // radians above the horizon
      if (dayFrac < 0 || dayFrac > 1) elev = -0.3;
      var az = Math.PI * U.clamp(dayFrac, -0.1, 1.1);
      var sunDir = L.sunDir.set(Math.cos(az), Math.max(Math.sin(elev), -0.2), 0.45).normalize();
      var horizonW = U.clamp(1 - Math.abs(elev) / (24 * Math.PI / 180), 0, 1) * (1 - night);
      function mixc(key) {
        var d = new THREE.Color(SKY.day[key]), s = new THREE.Color(SKY.sunset[key]), n = new THREE.Color(SKY.night[key]);
        d.lerp(s, horizonW); d.lerp(n, night); return d;
      }
      function mixn(key) { var v = U.lerp(SKY.day[key], SKY.sunset[key], horizonW); return U.lerp(v, SKY.night[key], night); }
      var top = mixc('top'), hor = mixc('horizon'), fog = mixc('fog'), sunC = mixc('sun');
      Render.scene.fog.color.copy(fog);
      Render.renderer.setClearColor(fog, 1);
      L.hemi.color.copy(mixc('hemiSky')); L.hemi.groundColor.copy(mixc('hemiGround')); L.hemi.intensity = mixn('hemiI');
      L.sun.color.copy(sunC); L.sun.intensity = mixn('sunI') * (night > 0.99 ? 1 : Math.max(0.25, Math.min(1, elev * 3 + 0.3)));
      if (night > 0.5) { L.sun.intensity = SKY.night.sunI; sunDir.set(-0.3, 0.7, 0.4).normalize(); }
      // sky gradient texture: zenith at the top of the canvas
      var cv = A.skyCanvas, ctx = cv.getContext('2d');
      var g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#' + top.getHexString());
      g.addColorStop(0.42, '#' + top.clone().lerp(hor, 0.65).getHexString());
      g.addColorStop(0.52, '#' + hor.getHexString());
      g.addColorStop(0.6, '#' + fog.getHexString());
      g.addColorStop(1, '#' + fog.clone().multiplyScalar(0.8).getHexString());
      ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
      A.sky.needsUpdate = true;
      var sk = Render.sky;
      sk.sun.material.opacity = elev > -0.05 ? U.clamp(1 - night, 0, 1) : 0;
      sk.sun.material.color.copy(sunC);
      sk.moon.material.opacity = night * 0.9;
      sk.stars.material.opacity = Math.max(0, night - 0.2) * 0.9;
      // emissive windows / signs / lamp glow
      var lit = U.clamp((night - 0.02) / 0.5, 0, 1);
      Render.lit = lit;
      var mats = A._facadeMats;
      for (var k in mats) mats[k].emissiveIntensity = lit * 1.0;
      var sm = A._signMats;
      for (k in sm) sm[k].emissiveIntensity = sm[k].userData.neon ? 0.45 + 0.65 * lit : 0.12 + 0.3 * lit;
      Render.chunks.forEach(function (ch) { if (ch.glow) { ch.glow.visible = lit > 0.02; ch.glow.material.opacity = lit; } if (ch.glowPts) { ch.glowPts.visible = lit > 0.02; ch.glowPts.material.opacity = lit; } });
      Render.env = { night: night, elev: elev, horizonW: horizonW, lit: lit };
    },

    // ---------------------------------------------------------------- frame --
    frame: function (alpha) {
      var t0 = U.now(), W = Render._World, cam = Render.camera, g = GTP.game;
      if (!Render.renderer) return;
      if (GTP.Entities && GTP.Entities.sync) GTP.Entities.sync(alpha == null ? 1 : alpha);
      if (g && g.player && g.player.mesh && g.player.syncMesh) g.player.syncMesh(alpha == null ? 1 : alpha);
      if (!Render.free) Render.rig.apply(alpha);
      var clock = g && g.time ? g.time.clock : C.DAY.startClock;
      if (Math.abs(clock - (Render._envClock == null ? -99 : Render._envClock)) > 0.02) { Render._envClock = clock; Render.updateEnvironment(clock); }
      // sky and sun follow the camera; sun light + shadow box follow the focus point
      var sk = Render.sky, L = Render.lights;
      sk.dome.position.set(cam.position.x, cam.position.y - 40, cam.position.z);
      sk.sun.position.copy(L.sunDir).multiplyScalar(950).add(sk.dome.position);
      sk.moon.position.set(-L.sunDir.x, 0.6, -L.sunDir.z).normalize().multiplyScalar(950).add(sk.dome.position);
      sk.stars.position.copy(sk.dome.position);
      var fx = Render.rig.focus;
      L.target.position.set(fx.x, 0, fx.z);
      L.sun.position.copy(L.sunDir).multiplyScalar(160).add(L.target.position);
      // water shimmer
      var t = g && g.time ? g.time.t : 0;
      Render.water.material.map.offset.set(t * 0.012, t * 0.008);
      Render.ensureChunks();
      Render.fx.sync();
      Render.renderer.render(Render.scene, cam);
      // HUD overlay
      if (Render.hudCtx) {
        var ctx = Render.hudCtx;
        ctx.clearRect(0, 0, Render.width, Render.height);
        if (GTP.UI && GTP.UI.draw) { try { GTP.UI.draw(ctx, Render.width, Render.height); } catch (e) { U.reportError(e, 'ui.draw'); } }
      }
      var info = Render.renderer.info.render;
      Render.stats.triangles = info.triangles; Render.stats.calls = info.calls;
      Render.stats.frameMs = U.now() - t0;
      void W;
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
      while (Render.chunkGroup && Render.chunkGroup.children.length) Render.chunkGroup.remove(Render.chunkGroup.children[0]);
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
      // hide chunks far from the camera
      Render.chunks.forEach(function (ch) {
        var dx = (ch.cx + 0.5) * TILE * CH - cam.position.x, dz = (ch.cz + 0.5) * TILE * CH - cam.position.z;
        ch.group.visible = Math.sqrt(dx * dx + dz * dz) < C.QUALITY.drawDistance + 70;
      });
    },
    buildChunk: function (cx, cz) {
      var key = cx + ',' + cz;
      if (Render.chunks.has(key)) return Render.chunks.get(key);
      var W = Render._World, A = Render._A;
      var group = new THREE.Group(); group.name = 'chunk ' + key;
      var ch = { cx: cx, cz: cz, group: group, glow: null, glowPts: null };
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
        if (m & M.YARD) return ['gravel', (tx + tz) & 3];
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
      ch.group.add(mesh);
    },
    _groundMaterial: function () {
      if (!Render._gmat) Render._gmat = new THREE.MeshLambertMaterial({ map: Render._A.atlas });
      return Render._gmat;
    },
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
        ch.group.add(mesh);
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
        }
      }
      Render._roof(g, b, A, x0, z0, x1, z1, top, tint);
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
      var byKind = {}, signs = [], lamps = [];
      var x0 = tx0 * TILE, z0 = tz0 * TILE, x1 = tx1 * TILE, z1 = tz1 * TILE;
      for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (p.x < x0 || p.x >= x1 || p.z < z0 || p.z >= z1) continue;
        if (p.kind === 'sign' || p.kind === 'billboard') signs.push(p);
        if (p.kind === 'sign' && !p.standing && !p.pole) continue;   // wall-mounted signs have no post
        if (p.kind === 'lamp') lamps.push(p);
        (byKind[p.kind] || (byKind[p.kind] = [])).push(p);
      }
      Object.keys(byKind).forEach(function (kind) {
        var list = byKind[kind], rec = A.prop(kind);
        var im = new THREE.InstancedMesh(rec.geometry, rec.material, list.length);
        im.castShadow = rec.castShadow; im.receiveShadow = true; im.name = 'props:' + kind;
        // Every batch gets an instance colour (white by default): the shared vertex-colour
        // material renders an instanced batch black under shadow maps when one is missing.
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3).fill(1), 3);
        for (var k = 0; k < list.length; k++) {
          var p = list[k], sx = p.scale || 1, sy = sx, sz = sx;
          if (UNIT_H[kind]) { sy = p.h || 1; if (kind === 'sign' || kind === 'billboard') sy = Math.max(0.5, p.y - (p.h || 1) / 2); }
          if (kind === 'hedge') { sx = p.sx || 1; sz = p.sz || 1; sy = p.h || 1; }
          var py = UNIT_H[kind] ? (kind === 'sign' || kind === 'billboard' ? (p.ground != null ? p.ground : W.heightAt(p.x, p.z, 0)) : (p.y == null ? CURB : p.y)) : (p.y == null ? CURB : p.y);
          if (kind === 'sign' || kind === 'billboard') py = W.heightAt(p.x, p.z, 0);
          _q.setFromAxisAngle(_v2.set(0, 1, 0), p.rot || 0);
          _m.compose(_v.set(p.x, py, p.z), _q, _v2.set(sx, sy, sz));
          im.setMatrixAt(k, _m);
          if (p.color) { _col.set(p.color); im.setColorAt(k, _col); }
          else if (kind === 'tree' || kind === 'palm' || kind === 'hedge') { var hv = U.hash2(p.x * 10, p.z * 10, 3); _col.setRGB(0.85 + hv * 0.3, 0.85 + U.hash2(p.x, p.z, 4) * 0.3, 0.85 + hv * 0.2); im.setColorAt(k, _col); }
        }
        im.instanceColor.needsUpdate = true;
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = true;
        im.computeBoundingSphere();
        ch.group.add(im);
      });
      // text signs: one plane each (textures cached by text)
      signs.forEach(function (p) {
        var ar = Math.max(1, (p.w || 4) / (p.h || 1));
        var ratio = ar >= 3 ? 4 : ar >= 1.5 ? 2 : 1;
        var mat = A.signMaterial(p.text || '', !!p.neon, ratio);
        var geo = Render._planeGeo(p.w || 4, p.h || 1);
        var mesh = new THREE.Mesh(geo, mat);
        // p.rot is a yaw (0 faces -z); a PlaneGeometry faces +z at rotation 0, hence the half turn
        var dir = U.yawToDir(p.rot || 0), faceRot = (p.rot || 0) + Math.PI;
        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.y = faceRot;
        mesh.castShadow = false; mesh.name = 'sign';
        ch.group.add(mesh);
        if (p.double) { var back = new THREE.Mesh(geo, mat); back.position.set(p.x - dir.x * 0.05, p.y, p.z - dir.z * 0.05); back.rotation.y = faceRot + Math.PI; ch.group.add(back); }
        if (p.kind === 'billboard' && !p.double) {
          // a dark backing board facing away from the text
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
    },
    _planeGeo: function (w, h) {
      var key = w.toFixed(2) + 'x' + h.toFixed(2);
      Render._planes = Render._planes || {};
      if (!Render._planes[key]) Render._planes[key] = new THREE.PlaneGeometry(w, h);
      return Render._planes[key];
    },
    _backMat: function () { if (!Render._bmat) Render._bmat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 }); return Render._bmat; },
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
    detach: function (e) { if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh); },
    buildEntityMesh: function (e) {
      var A = Render._A;
      if (e.kind === 'ped' || e.kind === 'player') return A.pedParts(e.look || {});
      if (e.kind === 'vehicle') {
        var v = A.vehicleGeometry(e.type || 'sedan');
        var paint = new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color(e.color || '#c94040') });
        var grp = new THREE.Group();
        var body = new THREE.Mesh(v.body, [paint, A.propMaterial()]); body.castShadow = true; body.name = 'body'; grp.add(body);
        v.wheelOffsets.forEach(function (o, i) { var wm = new THREE.Mesh(v.wheel, A.propMaterial()); wm.position.set(o.x, v.wheelRadius, o.z); wm.name = 'wheel' + i; wm.userData.steer = o.steer; grp.add(wm); });
        return grp;
      }
      if (e.kind === 'pickup') return A.pickupMesh(e.pickupType);
      if (e.kind === 'projectile') { var m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), A.colorMaterial('#ffe08a')); return m; }
      return null;
    },

    // ------------------------------------------------------------------ fx --
    fx: {
      list: [], texts: [], _pool: [], _lines: [],
      init: function () { },
      add: function (o) {
        o = o || {}; o.t = 0;
        var type = o.type || 'puff';
        o.life = o.life || (type === 'explosion' ? 0.9 : type === 'smoke' ? 1.6 : type === 'tracer' ? 0.08 : type === 'decal' || type === 'skid' ? 12 : type === 'text' ? 1.2 : 0.5);
        if (type === 'text') { Render.fx.texts.push(o); return o; }
        if (type === 'tracer') {
          var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([o.x, o.y, o.z, o.x2, o.y2, o.z2], 3));
          o.obj = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9 })); o.obj.userData.own = true;
        } else if (type === 'decal' || type === 'skid') {
          o.obj = new THREE.Mesh(Render._planeGeo(o.size || 0.6, o.size2 || (o.size || 0.6)), new THREE.MeshBasicMaterial({ color: type === 'skid' ? 0x14161a : 0x303030, transparent: true, opacity: 0.6, depthWrite: false }));
          o.obj.rotation.x = -Math.PI / 2; o.obj.rotation.z = o.rot || 0; o.obj.position.set(o.x, (o.y || 0) + 0.02, o.z);
        } else {
          var sp = Render.fx._pool.pop();
          if (!sp) sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: Render._A.particle, transparent: true, depthWrite: false }));
          sp.material.blending = (type === 'spark' || type === 'fire' || type === 'explosion') ? THREE.AdditiveBlending : THREE.NormalBlending;
          sp.material.color.set(o.color || (type === 'puff' ? 0xd8d8d8 : type === 'smoke' ? 0x444444 : type === 'spark' ? 0xffd080 : type === 'fire' ? 0xff7a20 : 0xffb050));
          sp.material.opacity = 1; sp.visible = true;
          o.obj = sp; o.size = o.size || (type === 'explosion' ? 6 : type === 'smoke' ? 1.5 : 0.6);
          o.vx = o.vx || 0; o.vy = o.vy == null ? (type === 'smoke' ? 1.2 : 0.4) : o.vy; o.vz = o.vz || 0;
        }
        if (o.obj) Render.fxGroup.add(o.obj);
        Render.fx.list.push(o);
        return o;
      },
      update: function (dt) {
        var L = Render.fx.list;
        for (var i = L.length - 1; i >= 0; i--) {
          var o = L[i]; o.t += dt;
          if (o.vx != null) { o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; }
          if (o.t >= o.life) { Render.fx._release(o); L.splice(i, 1); }
        }
        var T = Render.fx.texts;
        for (i = T.length - 1; i >= 0; i--) { T[i].t += dt; if (T[i].t >= T[i].life) T.splice(i, 1); }
      },
      sync: function () {
        var L = Render.fx.list;
        for (var i = 0; i < L.length; i++) {
          var o = L[i], k = o.t / o.life;
          if (o.obj && o.obj.isSprite) {
            o.obj.position.set(o.x, o.y, o.z);
            var s = o.size * (o.type === 'explosion' ? 0.4 + k * 1.2 : 0.6 + k * 0.8);
            o.obj.scale.set(s, s, 1);
            o.obj.material.opacity = (1 - k) * (o.type === 'smoke' ? 0.6 : 1);
          } else if (o.obj && o.obj.material && (o.type === 'decal' || o.type === 'skid')) o.obj.material.opacity = 0.6 * (1 - Math.max(0, k - 0.7) / 0.3);
        }
      },
      _release: function (o) {
        if (!o.obj) return;
        Render.fxGroup.remove(o.obj);
        if (o.obj.isSprite) { o.obj.visible = false; Render.fx._pool.push(o.obj); }
        else { if (o.obj.geometry && o.obj.userData.own) o.obj.geometry.dispose(); if (o.obj.material && o.obj.material.dispose && !o.obj.isSprite) o.obj.material.dispose(); }
      },
      clear: function () { var L = Render.fx.list; for (var i = 0; i < L.length; i++) Render.fx._release(L[i]); L.length = 0; Render.fx.texts.length = 0; }
    },

    // ----------------------------------------------------------------- rig --
    // Third-person chase camera. Game.step calls update(dt) each fixed step;
    // frame() applies the result (apply). Never snaps except on reset/teleport.
    rig: {
      mode: 'chase', yaw: 0, pitch: 0.2, dist: C.CAMERA.footDist, fov: C.CAMERA.fov,
      pos: { x: 0, y: 2, z: 5 }, focus: { x: 0, y: 1.25, z: 0 }, shakeAmt: 0, _shakeT: 0, _snap: true, _target: null, _lastMoveYaw: 0,
      target: function (e) { Render.rig._target = e; Render.rig._snap = true; return e; },
      reset: function () { var r = Render.rig; r.yaw = 0; r.pitch = 0.2; r._snap = true; r.shakeAmt = 0; r.fov = C.CAMERA.fov; },
      snap: function () { Render.rig._snap = true; },
      shake: function (a) { Render.rig.shakeAmt = Math.min(1.5, Render.rig.shakeAmt + a); },
      update: function (dt, input) {
        var r = Render.rig, CAM = C.CAMERA, W = Render._World;
        var t = r._target || (GTP.game && GTP.game.player);
        if (!t) return;
        var look = input ? input.look : null;
        var inCar = t.vehicle || t.inVehicle;
        var mode = (t.cameraMode || r.mode);
        if (look && (look.dx || look.dy)) {
          r.yaw -= look.dx * CAM.lookSens; r.pitch = U.clamp(r.pitch + look.dy * CAM.lookSens, CAM.pitchMin, CAM.pitchMax);
        } else {
          var speed = Math.sqrt((t.vx || 0) * (t.vx || 0) + (t.vz || 0) * (t.vz || 0));
          var since = (GTP.game ? GTP.game.time.t : 0) - (input ? input.lastLookTime : -1e9);
          if (speed > 0.6 && since > CAM.autoYawDelay) {
            var moveYaw = U.dirToYaw(t.vx, t.vz);
            if (inCar && (t.vehicle || t.inVehicle).reversing) moveYaw += Math.PI;
            r.yaw = U.angleDamp(r.yaw, moveYaw, inCar ? CAM.autoYawRate * 1.6 : CAM.autoYawRate, dt);
            r.pitch = U.damp(r.pitch, inCar ? 0.16 : 0.2, 1.5, dt);
          }
        }
        var dist = inCar ? ((t.vehicle || t.inVehicle).type === 'bus' ? CAM.busDist : CAM.carDist) : CAM.footDist;
        var height = inCar ? CAM.carHeight : CAM.footHeight;
        var lookH = inCar ? 1.0 : CAM.footLookHeight;
        if (mode === 'close') { dist *= CAM.closeScale; height *= 0.8; }
        var aiming = t.aiming && !inCar;
        var fx = t.x, fy = t.y + lookH, fz = t.z;
        var d = U.yawToDir(r.yaw), rx = -d.z, rz = d.x;   // right vector
        var desired;
        if (mode === 'first') { desired = { x: t.x + d.x * 0.15, y: t.y + C.PLAYER.eye, z: t.z + d.z * 0.15 }; fx += d.x * 5; fy = desired.y + Math.sin(r.pitch) * 5; fz += d.z * 5; }
        else if (aiming) { desired = { x: t.x - d.x * CAM.aimDist + rx * CAM.aimSide, y: t.y + 1.55 + Math.sin(r.pitch) * 1.2, z: t.z - d.z * CAM.aimDist + rz * CAM.aimSide }; fx = t.x + d.x * 8 + rx * CAM.aimSide; fy = t.y + 1.45 - Math.sin(r.pitch) * 6; fz = t.z + d.z * 8 + rz * CAM.aimSide; }
        else {
          var D = dist * Math.cos(r.pitch), H = dist * Math.sin(r.pitch) + (height - lookH);
          desired = { x: fx - d.x * D, y: fy + H, z: fz - d.z * D };
          // pull in when a building is between the focus and the camera
          var ddx = desired.x - fx, ddy = desired.y - fy, ddz = desired.z - fz, len = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
          var hit = W.raycastBuildings(fx, fy, fz, ddx / len, ddy / len, ddz / len, len + CAM.collisionPad);
          if (hit) { var tt = Math.max(0.6, hit.t - CAM.collisionPad); desired.x = fx + ddx / len * tt; desired.y = fy + ddy / len * tt; desired.z = fz + ddz / len * tt; }
          var floor = W.heightAt(desired.x, desired.z, desired.y) + 0.45;
          if (desired.y < floor) desired.y = floor;
        }
        var targetFov = inCar ? U.lerp(CAM.fov, CAM.fovSpeedMax, U.clamp(Math.sqrt((t.vx || 0) * (t.vx || 0) + (t.vz || 0) * (t.vz || 0)) / CAM.fovSpeedAt, 0, 1)) : (aiming ? CAM.aimFov : CAM.fov);
        if (r._snap) { r.pos.x = desired.x; r.pos.y = desired.y; r.pos.z = desired.z; r.focus.x = fx; r.focus.y = fy; r.focus.z = fz; r.fov = targetFov; r._snap = false; }
        else {
          var far = U.dist2d(r.pos.x, r.pos.z, desired.x, desired.z) > 40;
          var k = far ? 1e3 : CAM.posDamp;
          r.pos.x = U.damp(r.pos.x, desired.x, k, dt); r.pos.y = U.damp(r.pos.y, desired.y, k, dt); r.pos.z = U.damp(r.pos.z, desired.z, k, dt);
          r.focus.x = U.damp(r.focus.x, fx, k * 1.5, dt); r.focus.y = U.damp(r.focus.y, fy, k * 1.5, dt); r.focus.z = U.damp(r.focus.z, fz, k * 1.5, dt);
          r.fov = U.damp(r.fov, targetFov, CAM.fovDamp, dt);
        }
        if (r.shakeAmt > 0) { r._shakeT += dt * 40; r.shakeAmt = Math.max(0, r.shakeAmt - dt * CAM.shakeDecay * r.shakeAmt - dt * 0.2); }
      },
      apply: function () {
        var r = Render.rig, cam = Render.camera;
        var sx = 0, sy = 0;
        if (r.shakeAmt > 0) { sx = Math.sin(r._shakeT * 1.3) * r.shakeAmt * 0.12; sy = Math.cos(r._shakeT) * r.shakeAmt * 0.1; }
        cam.position.set(r.pos.x + sx, r.pos.y + sy, r.pos.z);
        cam.lookAt(r.focus.x, r.focus.y, r.focus.z);
        if (Math.abs(cam.fov - r.fov) > 0.05) { cam.fov = r.fov; cam.updateProjectionMatrix(); }
      }
    }
  };
})();
