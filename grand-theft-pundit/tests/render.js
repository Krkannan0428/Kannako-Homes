/* render.js (v0.3 environment track adds the last section: cascades, interiors, ocean, grass, TAA / SSR / DoF, the
 * rebuildEntityMesh / vehicleMeshes APIs, the camera QA fixes, a district sample on high and medium).
 * Free-camera screenshots of the city at street level and from above, by day and at
 * night, including the expansion's three districts (the airport runway with the tower, the port's
 * container maze and quay, uptown's brownstones, the Sponsor Span, the Lower Loop's viaduct). Each
 * PNG must not be monochrome, the night shots must contain warm lit windows / lamps, worldToScreen,
 * the chunk cache and the incremental prebuild must behave, and nothing may throw.
 * Look at tests/out/*.png. */
'use strict';
const H = require('./_harness');

const SHOTS = [
  // name, camera xyz, lookAt xyz, clock
  { name: 'render_campus_quad', cam: [113, 1.7, 296], look: [112, 2.5, 250], clock: 15 },
  { name: 'render_downtown_avenue', cam: [327, 1.7, 372], look: [329, 6, 300], clock: 15 },
  { name: 'render_loop_deck', cam: [183, 9.2, 330], look: [184, 6.5, 230], clock: 15 },
  { name: 'render_marina_piers', cam: [300, 5, 566], look: [300, 1, 508], clock: 17.3 },
  { name: 'render_capitol_dome', cam: [328, 2.2, 122], look: [328, 9, 60], clock: 14 },
  { name: 'render_stadium', cam: [524, 4, 160], look: [588, 9, 134], clock: 14 },
  { name: 'render_downtown_night', cam: [327, 2, 372], look: [329, 8, 300], clock: 22 },
  { name: 'render_strip_night', cam: [262, 1.8, 427], look: [256, 4, 395], clock: 21.5 },
  { name: 'render_sunset', cam: [330, 3, 500], look: [230, 22, 545], clock: 18.6 },
  { name: 'render_ramp', cam: [126, 2.2, 232], look: [190, 8, 232], clock: 15 },
  { name: 'render_bridge', cam: [452, 2.2, 281], look: [530, 5, 279], clock: 15 },
  // the expansion (GDD_EXPANSION §1)
  { name: 'render_airport_runway', cam: [150, 6, 846], look: [400, 10, 800], clock: 15 },
  { name: 'render_control_tower', cam: [318, 2, 706], look: [356, 24, 690], clock: 14 },
  { name: 'render_airport_terminal', cam: [346, 5, 730], look: [296, 8, 696], clock: 15 },
  { name: 'render_port_maze', cam: [556, 3, 735], look: [556, 3, 650], clock: 15, minColors: 300 },   // flat-shaded container walls: fewer colours than a street
  { name: 'render_port_quay', cam: [612, 4, 796], look: [660, 6, 870], clock: 16, minColors: 300 },   // a wide concrete quay: fewer colours than a street
  { name: 'render_uptown_brownstones', cam: [680, 1.8, 400], look: [680, 3, 300], clock: 15 },
  { name: 'render_uptown_museum', cam: [664, 2, 184], look: [704, 9, 184], clock: 14 },
  { name: 'render_bridge_south', cam: [294, 6, 556], look: [330, 4, 600], clock: 15 },
  { name: 'render_lower_loop', cam: [184, 9.2, 500], look: [184, 6.5, 600], clock: 15 },
  { name: 'render_viaduct', cam: [232, 4, 548], look: [184, 6, 560], clock: 16 },
  { name: 'render_airport_night', cam: [330, 6, 760], look: [290, 7, 700], clock: 22 },
  { name: 'render_overview', cam: [330, 150, 520], look: [320, 0, 250], clock: 15 }
];

H.run('render', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  const api = await page.evaluate(() => {
    const R = GTP.Render;
    const out = { renderer: !!R.renderer, scene: !!R.scene, camera: !!R.camera && R.camera.isPerspectiveCamera, fov: R.camera.fov, chunks: R.chunks.size, fog: !!R.scene.fog, sky: !!R.sky, lights: !!(R.lights && R.lights.sun && R.lights.hemi), water: !!R.water, fx: typeof R.fx.add === 'function', w2s: null, styles: GTP.Assets.facadeStyles(), atlasCells: Object.keys(GTP.Assets.cells).length };
    const p = GTP.game.player; const s = R.worldToScreen(p.x, p.y + 1, p.z); out.w2s = s;
    out.shadow = R.renderer.shadowMap.enabled;
    out.night = R.night;
    out.fogStart = R.scene.fog.near; out.fogFar = R.scene.fog.far; out.drawDistance = GTP.C.QUALITY.drawDistance;
    return out;
  });
  console.log('  render api: ' + JSON.stringify(api));
  t.assert(api.renderer && api.scene && api.camera && api.fog && api.sky && api.lights && api.water && api.fx, 'render surface');
  t.assert(Math.abs(api.fov - 60) < 0.1, 'fov 60');
  t.assert(api.w2s && api.w2s.visible && api.w2s.sx > 200 && api.w2s.sx < 1080 && api.w2s.sy > 100 && api.w2s.sy < 620, 'player projects near the screen centre: ' + JSON.stringify(api.w2s));
  t.assert(api.styles.length >= 11 && ['brownstone', 'airport', 'port'].every((s) => api.styles.indexOf(s) >= 0), 'facade styles include the expansion: ' + api.styles.join(','));
  t.assert(api.atlasCells >= 30, 'atlas cells: ' + api.atlasCells);
  t.assert(api.night === 0, 'starts in daylight at 17:30');
  t.assert(api.fogStart === 120 && api.fogFar === 260 && api.drawDistance === 260, 'draw distance and fog unchanged: ' + JSON.stringify([api.fogStart, api.fogFar, api.drawDistance]));
  // the atlas has the required ground variants, including the runway paint
  const cells = await page.evaluate(() => Object.keys(GTP.Assets.cells));
  ['asphalt', 'road_half', 'ave_inner', 'ave_outer', 'cross', 'cross_stop', 'sidewalk', 'sidewalk_edge', 'sidewalk_corner', 'curbface', 'grass', 'sand', 'parking', 'parking_bay', 'plaza', 'hw_inner', 'hw_outer', 'barrier', 'concrete', 'dock', 'runway', 'runway_center', 'runway_edge', 'runway_thresh', 'runway_1', 'runway_0', 'apron'].forEach((c) => t.assert(cells.indexOf(c) >= 0, 'atlas cell ' + c));
  // the runway tiles classify to the runway cells (threshold at the ends, digits, a centreline and edges)
  const rwc = await page.evaluate(() => {
    const W = GTP.World, lm = W.landmark('airport_runway'), lot = lm.lot, s = lm.def.strip;
    const cell = (tx, tz) => GTP.Render._classify(tx, tz)[0];
    return { thresh: cell(lot.x, s.z0 + 2), threshE: cell(lot.x + lot.w - 1, s.z0 + 2), digit: cell(lot.x + 3, s.z0 + 2), centre: cell(lot.x + 20, s.z0 + 2), centre2: cell(lot.x + 20, s.z0 + 3), edge: cell(lot.x + 20, s.z0), plain: cell(lot.x + 20, s.z0 + 1), apron: cell(lot.x + 20, lot.z + 1) };
  });
  console.log('  runway cells: ' + JSON.stringify(rwc));
  t.assert(rwc.thresh === 'runway_thresh' && rwc.threshE === 'runway_thresh' && /^runway_[01]$/.test(rwc.digit) && rwc.centre === 'runway_center' && rwc.centre2 === 'runway_center' && rwc.edge === 'runway_edge' && rwc.plain === 'runway' && /^(apron|parking)$/.test(rwc.apron), 'runway paint: ' + JSON.stringify(rwc));

  // the incremental prebuild: synchronous without onDone (headless), builds the chunks around a point, reports progress
  const pre = await page.evaluate(() => {
    const R = GTP.Render, before = R.chunks.size, lm = GTP.World.landmark('airport_terminal');
    const fr = [], ev = [];
    const onEv = (e) => { if (e.stage === 'chunks') ev.push(+e.frac.toFixed(2)); };
    GTP.Events.on('load:progress', onEv);
    let doneN = -1;
    const n = R.prebuild(lm.door.x, lm.door.z, 150, (f, label) => fr.push(+f.toFixed(2)), (k) => { doneN = k; });
    GTP.Events.off('load:progress', onEv);
    const again = R.prebuild(lm.door.x, lm.door.z, 150);
    return { before, after: R.chunks.size, n, again, doneN, fr, ev, last: fr[fr.length - 1], monotonic: fr.every((f, i) => i === 0 || f >= fr[i - 1]) };
  });
  console.log('  prebuild: ' + JSON.stringify(pre));
  t.assert(pre.n >= 9 && pre.after === pre.before + pre.n && pre.doneN === pre.n, 'prebuild builds the chunks around the terminal: ' + JSON.stringify(pre));
  t.assert(pre.again === 0, 'prebuild is idempotent: ' + pre.again);
  t.assert(pre.fr.length >= 3 && pre.last === 1 && pre.monotonic && pre.ev.length === pre.fr.length, 'prebuild reports progress to 1: ' + JSON.stringify([pre.fr, pre.ev]));

  const results = {};
  for (const s of SHOTS) {
    await page.evaluate((s) => {
      GTP.game.debug.setClock(s.clock);
      GTP.game.debug.freeCam(s.cam[0], s.cam[1], s.cam[2], s.look[0], s.look[1], s.look[2]);
    }, s);
    const file = await t.shot(page, s.name);
    const st = await t.pixelStats(page);
    const info = await page.evaluate(() => ({ chunks: GTP.Render.chunks.size, tris: GTP.Render.stats.triangles, calls: GTP.Render.stats.calls, ms: Math.round(GTP.Render.stats.frameMs), night: +GTP.Render.night.toFixed(2) }));
    results[s.name] = Object.assign({}, st, info);
    console.log('  ' + s.name + ': ' + JSON.stringify(results[s.name]) + ' -> ' + file);
    t.assert(st.colors > (s.minColors || 400), s.name + ' is not monochrome: ' + st.colors + ' colours');
    t.assert(st.dark < 0.9 && st.bright < 0.9, s.name + ' is not blank');
    t.assert(info.calls < 700, s.name + ' draw calls stay bounded: ' + info.calls);
  }
  // daylight shots have sky (blue) and the night shot is darker with warm lights
  t.assert(results.render_campus_quad.blue > 0.08, 'campus shot shows sky');
  t.assert(results.render_campus_quad.green > 0.04, 'campus shot shows lawns/trees');
  t.assert(results.render_marina_piers.blue > 0.1, 'marina shot shows water/sky');
  const day = results.render_downtown_avenue, night = results.render_downtown_night;
  t.assert(night.night >= 0.99, 'night at 22:00');
  t.assert(night.mean[0] + night.mean[1] + night.mean[2] < day.mean[0] + day.mean[1] + day.mean[2] - 45 && night.dark > day.dark + 0.3, 'night is darker than day: ' + JSON.stringify([day.mean, night.mean, day.dark, night.dark]));
  t.assert(night.warm > 0.004, 'night shot has warm lit windows / lamps: ' + night.warm);
  t.assert(results.render_sunset.warm > 0.03, 'sunset sky is warm: ' + results.render_sunset.warm);
  t.assert(results.render_bridge.blue > 0.15, 'bridge shot shows the channel: ' + results.render_bridge.blue);
  t.assert(results.render_bridge_south.blue > 0.12, 'Sponsor Span shot shows the bay: ' + results.render_bridge_south.blue);
  t.assert(results.render_viaduct.blue > 0.12, 'viaduct shot shows the bay: ' + results.render_viaduct.blue);
  t.assert(results.render_airport_night.warm > 0.003, 'airport at night has lit glass and lamps: ' + results.render_airport_night.warm);
  t.assert(results.render_overview.chunks >= 60, 'overview built most chunks: ' + results.render_overview.chunks);
  // back to the chase camera, which follows the player
  const back = await page.evaluate(() => {
    GTP.game.debug.followCam(); GTP.game.debug.setClock(17.5); GTP.game.advance(0.2);
    const p = GTP.game.player, c = GTP.Render.camera.position;
    return { d: Math.hypot(c.x - p.x, c.z - p.z), dy: c.y - p.y };
  });
  t.assert(back.d > 2.5 && back.d < 6 && back.dy > 0.5, 'chase camera restored: ' + JSON.stringify(back));
  // the headless default is the low preset: no post, no shadows, the surface maps never generated
  const lowQ = await page.evaluate(() => ({ preset: GTP.Render.quality.current, q: GTP.C.QUALITY.preset, post: GTP.PostFX.enabled, shadows: GTP.Render.renderer.shadowMap.enabled, maps: !!GTP.Assets.atlasNormal, env: !!GTP.Render.scene.environment, auto: GTP.Render.quality.auto, list: GTP.Render.quality.list(), weather: GTP.Render.weather.state, setWeather: typeof GTP.game.debug.setWeather }));
  console.log('  low preset: ' + JSON.stringify(lowQ));
  t.assert(lowQ.preset === 'low' && lowQ.q === 'low' && !lowQ.post && !lowQ.shadows && !lowQ.maps && !lowQ.auto, 'headless boots on the low preset: ' + JSON.stringify(lowQ));
  t.assert(lowQ.env && lowQ.list.join(',') === 'low,medium,high,ultra' && lowQ.setWeather === 'function', 'environment map, preset list and the debug.setWeather hook');
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
  await page.close();

  // ---- the high preset: post-processing, soft shadows, lamp lights, weather, the PBR close-ups (GDD: the graphics track) ----
  const hq = await t.boot({ seed: 7, quality: 'high', weather: 'overcast' });
  const hp = hq.page;
  const hqInfo = await hp.evaluate(() => ({ preset: GTP.Render.quality.current, post: GTP.PostFX.enabled, supported: GTP.PostFX.supported, ssao: GTP.PostFX.flags.ssao, bloom: GTP.PostFX.flags.bloom, fxaa: GTP.PostFX.flags.fxaa, shadows: GTP.Render.renderer.shadowMap.enabled, soft: GTP.Render.renderer.shadowMap.type === THREE.PCFSoftShadowMap, shadowMap: GTP.Render.lights.sun.shadow.mapSize.x, points: GTP.Render.lights.points.filter((l) => l.visible).length, spots: GTP.Render.lights.spots.filter((l) => l.visible).length, maps: !!GTP.Assets.atlasNormal && !!GTP.Assets.groundMaterial().normalMap, env: !!GTP.Render.scene.environment, toneMapping: GTP.Render.renderer.toneMapping, weather: GTP.Render.weather.state, overcast: GTP.Render.weather.overcast, cycle: GTP.Render.weather.cycle, clearcoat: GTP.C.QUALITY.clearcoat, mapsMs: Math.round(GTP.Assets.mapsMs || 0) }));
  console.log('  high preset: ' + JSON.stringify(hqInfo));
  t.assert(hqInfo.preset === 'high' && hqInfo.post && hqInfo.supported && hqInfo.ssao && hqInfo.bloom && hqInfo.fxaa, 'high: post pipeline on with SSAO, bloom and FXAA: ' + JSON.stringify(hqInfo));
  t.assert(hqInfo.shadows && hqInfo.soft && hqInfo.shadowMap === 2048 && hqInfo.points === 8 && hqInfo.spots === 4, 'high: soft 2048 shadows, 8 lamp lights, 4 headlight spots');
  t.assert(hqInfo.maps && hqInfo.env && hqInfo.toneMapping === 0 /* THREE.NoToneMapping */ && hqInfo.clearcoat, 'high: surface maps, environment map, tone mapping deferred to the post pass, clearcoat paint');
  t.assert(hqInfo.weather === 'overcast' && hqInfo.overcast === 1 && hqInfo.cycle === false, '?weather=overcast boots overcast with the cycle off: ' + JSON.stringify([hqInfo.weather, hqInfo.overcast, hqInfo.cycle]));
  const HQ = [
    // name, camera, lookAt, clock, weather, where the player stands (the shadow box and the light pool follow them)
    { name: 'render_hq_downtown_noon', cam: [327, 1.7, 372], look: [329, 6, 300], clock: 12, weather: 'clear', at: [327, 364] },
    { name: 'render_hq_marina_sunset', cam: [300, 5, 566], look: [300, 1, 508], clock: 18.6, weather: 'clear', at: [300, 520] },
    { name: 'render_hq_downtown_rain_night', cam: [327, 2, 372], look: [329, 8, 300], clock: 22, weather: 'rain', at: [327, 364] },
    { name: 'render_hq_loop_dusk', cam: [183, 9.2, 330], look: [184, 6.5, 230], clock: 19.1, weather: 'clear', at: [184, 320, 7] },
    { name: 'render_hq_car_paint', special: 'car', clock: 15, weather: 'clear', at: [327, 364] },
    { name: 'render_hq_ped', special: 'ped', clock: 15, weather: 'clear', at: [327, 364] }
  ];
  const hqResults = {};
  for (const s of HQ) {
    await hp.evaluate((s) => {
      GTP.Render.weather.set(s.weather, true);
      GTP.game.debug.setClock(s.clock);
      GTP.game.debug.teleport(s.at[0], s.at[1], s.at[2]);
      const p = GTP.game.player, d = GTP.util.yawToDir(p.yaw);
      if (s.special === 'car') {
        const v = GTP.game.debug.spawnVehicle(p.x + d.x * 4, p.z + d.z * 4, 'sports', { color: '#ff2d6f', yaw: p.yaw + 0.7 });
        GTP.game.debug.freeCam(v.x - d.x * 1.2 - 4.2, v.y + 1.5, v.z - d.z * 1.2 + 2.6, v.x, v.y + 0.7, v.z);
      } else if (s.special === 'ped') GTP.game.debug.freeCam(p.x + d.x * 2.6 + 0.9, p.y + 1.45, p.z + d.z * 2.6, p.x, p.y + 1.1, p.z);
      else GTP.game.debug.freeCam(s.cam[0], s.cam[1], s.cam[2], s.look[0], s.look[1], s.look[2]);
      GTP.game.advance(0.3);
    }, s);
    const file = await t.shot(hp, s.name);
    const st = await t.pixelStats(hp);
    const info = await hp.evaluate(() => ({ calls: GTP.Render.stats.calls, tris: GTP.Render.stats.triangles, ms: Math.round(GTP.Render.stats.frameMs), passes: GTP.PostFX.stats.passes, night: +GTP.Render.night.toFixed(2), wet: +GTP.Render.weather.wet.toFixed(2), rain: +GTP.Render.weather.rain.toFixed(2), lodNear: GTP.Render.stats.lodNear, lodFar: GTP.Render.stats.lodFar, rainVisible: GTP.Render.weather._rain.visible, puddles: GTP.Render.weather._puddles.visible, lamps: GTP.Render.lights.points.filter((l) => l.visible && l.intensity > 0).length, envRefreshes: GTP.Render.stats.envRefreshes }));
    hqResults[s.name] = Object.assign({}, st, info);
    console.log('  ' + s.name + ': ' + JSON.stringify(hqResults[s.name]) + ' -> ' + file);
    t.assert(st.colors > 400, s.name + ' is not monochrome: ' + st.colors + ' colours');
    t.assert(st.dark < 0.9 && st.bright < 0.9, s.name + ' is not blank');
    t.assert(info.passes >= 10, s.name + ' went through the post passes: ' + info.passes);
    // the renderer's counter now covers the shadow pass and the post passes too (info.autoReset is off, frame() resets it)
    t.assert(info.calls < 1300, s.name + ' draw calls (scene + shadow pass + post) stay bounded: ' + info.calls);
  }
  const noon = hqResults.render_hq_downtown_noon, rain = hqResults.render_hq_downtown_rain_night, sunsetHq = hqResults.render_hq_marina_sunset;
  t.assert(noon.blue > 0.1 && noon.night === 0, 'noon shows sky and daylight');
  t.assert(rain.night >= 0.99 && rain.rain === 1 && rain.wet > 0.5 && rain.rainVisible && rain.puddles && rain.lamps >= 4, 'the rain shot rains on wet roads under real lamp lights: ' + JSON.stringify([rain.rain, rain.wet, rain.rainVisible, rain.puddles, rain.lamps]));
  t.assert(rain.mean[2] < noon.mean[2] && rain.blue < noon.blue * 0.5, 'the rainy night has less sky blue than noon: ' + JSON.stringify([rain.blue, noon.blue, rain.mean, noon.mean]));
  t.assert(rain.warm > 0.01, 'the rainy night has warm lamp pools and lit windows: ' + rain.warm);
  t.assert(sunsetHq.warm > 0.1, 'the marina sunset is warm: ' + sunsetHq.warm);
  t.assert(hqResults.render_hq_loop_dusk.envRefreshes >= 3, 'the environment map followed the clock and the weather: ' + hqResults.render_hq_loop_dusk.envRefreshes);
  // the quality API the settings menu will use: presets apply live, auto starts at medium
  const sw = await hp.evaluate(() => {
    const out = {};
    GTP.Render.quality.set('low'); GTP.game.render();
    out.low = { preset: GTP.C.QUALITY.preset, post: GTP.PostFX.enabled, shadows: GTP.Render.renderer.shadowMap.enabled, points: GTP.Render.lights.points.filter((l) => l.visible).length, tone: GTP.Render.renderer.toneMapping, normal: !!GTP.Assets.groundMaterial().normalMap, errors: GTP.errors.length };
    GTP.Render.quality.set('medium'); GTP.game.render();
    out.medium = { preset: GTP.C.QUALITY.preset, post: GTP.PostFX.enabled, ssao: GTP.PostFX.flags.ssao, bloom: GTP.PostFX.flags.bloom, shadows: GTP.Render.renderer.shadowMap.enabled, shadowMap: GTP.Render.lights.sun.shadow.mapSize.x, errors: GTP.errors.length };
    GTP.Render.quality.set('auto'); GTP.game.render();
    out.auto = { preset: GTP.C.QUALITY.preset, auto: GTP.Render.quality.auto, current: GTP.Render.quality.current };
    GTP.Render.quality.set('ultra'); GTP.game.render();
    out.ultra = { preset: GTP.C.QUALITY.preset, shadowMap: GTP.Render.lights.sun.shadow.mapSize.x, points: GTP.Render.lights.points.filter((l) => l.visible).length, samples: GTP.PostFX.flags.samples, errors: GTP.errors.length };
    GTP.Render.quality.set('high');
    out.bad = GTP.Render.quality.set('potato');
    out.weatherBad = GTP.game.debug.setWeather('hail');
    out.weatherOk = GTP.game.debug.setWeather('overcast'); out.weatherState = GTP.Render.weather.target;
    return out;
  });
  console.log('  quality switches: ' + JSON.stringify(sw));
  t.assert(sw.low.preset === 'low' && !sw.low.post && !sw.low.shadows && sw.low.points === 0 && sw.low.tone === 4 /* THREE.ACESFilmicToneMapping */ && !sw.low.normal && sw.low.errors === 0, 'quality.set(low) turns post, shadows, lights and surface maps off: ' + JSON.stringify(sw.low));
  t.assert(sw.medium.preset === 'medium' && sw.medium.post && !sw.medium.ssao && sw.medium.bloom && sw.medium.shadows && sw.medium.shadowMap === 1024 && sw.medium.errors === 0, 'quality.set(medium): shadows 1024, bloom, no SSAO: ' + JSON.stringify(sw.medium));
  t.assert(sw.auto.auto && sw.auto.preset === 'medium' && sw.auto.current === 'medium', 'auto starts at medium: ' + JSON.stringify(sw.auto));
  t.assert(sw.ultra.preset === 'ultra' && sw.ultra.shadowMap === 4096 && sw.ultra.points === 12 && sw.ultra.samples === 16 && sw.ultra.errors === 0, 'ultra: 4096 shadows, 12 lights, 16 SSAO samples: ' + JSON.stringify(sw.ultra));
  t.assert(sw.bad === false && sw.weatherBad === false && sw.weatherOk === true && sw.weatherState === 'overcast', 'unknown presets and weather states are refused');
  const hqErrs = await t.errors(hq);
  t.assert(hqErrs.length === 0, 'high-quality errors:\n' + hqErrs.join('\n'));
  await hp.close();

  // ---- v0.3 environment: the systems, the APIs, the QA fixes, and a district / time-of-day sample on medium and high ----
  const v3 = await t.boot({ seed: 7, quality: 'high', weather: 'clear' });
  const vp = v3.page;
  const sys = await vp.evaluate(() => {
    const R = GTP.Render, A = GTP.Assets, L = R.lights, out = {};
    GTP.game.debug.setClock(12); GTP.game.debug.teleport(536, 300); GTP.game.advance(0.3); GTP.game.render(); GTP.game.render();
    out.cascades = { far: !!L.sunFar && L.sunFar.castShadow, nearMap: !!(L.sun.shadow.map), farMap: !!(L.sunFar.shadow.map), farRenders: R.stats.farShadow || 0, chunkPatched: !!THREE.ShaderChunk.__gtpCascades };
    out.muzzle = { resident: !!R.muzzleLight && R.muzzleLight.parent === R.scene, intensity: R.muzzleLight && R.muzzleLight.intensity };
    out.masks = Object.keys(A.masks || {}).length;
    const dm = A.masks && A.masks.downtown, ctx = dm && dm.getContext('2d'), d = ctx ? ctx.getImageData(0, 0, dm.width, dm.height / 8 * 5).data : [];
    let glass = 0, lit = 0, n = 0; for (let i = 0; i < d.length; i += 64) { n++; if (d[i] > 128) glass++; if (d[i + 1] > 128) lit++; }
    out.downtownGlass = +(glass / n).toFixed(2); out.downtownLit = +(lit / n).toFixed(2);
    out.glassShader = !!A.facadeMaterial('downtown').userData.glass;
    out.shore = !!R._shoreTex && !!A.waterUniforms.tGtpShore.value;
    out.grass = R.stats.grass || 0;
    out.trees = !!A.prop('tree').foliage && A.prop('tree').material.alphaTest > 0;
    out.post = { taa: GTP.PostFX.stats.taa, flags: GTP.PostFX.flags };
    out.signs = (() => { let k = 0; R.chunks.forEach((ch) => { if (ch.signs) k++; }); return k; })();
    out.tint = R.districtTint ? R.districtTint.ground.map((v) => +v.toFixed(2)) : null;
    out.ammo = GTP.C.MISSIONS && GTP.C.MISSIONS.weaponAmmo ? [GTP.C.MISSIONS.weaponAmmo.rifle, GTP.C.MISSIONS.weaponAmmo.ratio] : null;
    out.missionsK = GTP.Missions && GTP.Missions.K && GTP.Missions.K.weaponAmmo ? [GTP.Missions.K.weaponAmmo.rifle, GTP.Missions.K.weaponAmmo.ratio] : null;
    return out;
  });
  console.log('  v0.3 systems: ' + JSON.stringify(sys));
  t.assert(sys.cascades.far && sys.cascades.nearMap && sys.cascades.farMap && sys.cascades.farRenders >= 1 && sys.cascades.chunkPatched, 'two shadow cascades render: ' + JSON.stringify(sys.cascades));
  t.assert(sys.muzzle.resident && sys.muzzle.intensity === 0, 'the muzzle light is resident from boot at intensity 0 (QA CMB-04)');
  t.assert(sys.masks >= 3 && sys.downtownGlass > 0.25 && sys.downtownLit > 0.05 && sys.glassShader, 'facade glass masks and the interior-mapped glass shader: ' + JSON.stringify([sys.masks, sys.downtownGlass, sys.downtownLit]));
  t.assert(sys.shore && sys.trees && sys.grass > 200, 'the ocean shore field, leaf-card trees and the grass around a park: ' + JSON.stringify([sys.shore, sys.trees, sys.grass]));
  t.assert(sys.post.taa && sys.post.flags.ssr && sys.post.flags.dof, 'high resolves with TAA and has SSR and DoF on');
  t.assert(sys.ammo && sys.ammo[0] === 90 && sys.ammo[1] === 3, 'mission unlock ammo follows GDD_EXPANSION 2.1 (QA-C1-13): ' + JSON.stringify(sys.ammo));
  if (sys.missionsK) t.assert(sys.missionsK[0] === 90 && sys.missionsK[1] === 3, 'Missions.K picks the config table up: ' + JSON.stringify(sys.missionsK));
  // the APIs: rebuildEntityMesh (mods applied), GTP.Assets.vehicleMeshes[type]
  const api3 = await vp.evaluate(() => {
    const R = GTP.Render, A = GTP.Assets, p = GTP.game.player, out = {};
    const v = GTP.game.debug.spawnVehicle(p.x + 6, p.z, 'sedan', { color: '#c94040' });
    const m0 = v.mesh; v.mods = { paint: { primary: '#22cc44', finish: 'matte' }, tint: 2 };
    const m1 = R.rebuildEntityMesh(v);
    out.rebuilt = !!m1 && m1 !== m0 && m1.parent === R.entityGroup && !m0.parent && Math.abs(m1.position.x - v.x) < 1e-6;
    const mats = m1.userData.mats; out.paint = mats ? '#' + mats[0].color.getHexString() : null; out.finish = mats ? mats[0].userData.finish : null; out.tinted = mats ? mats[2].name : null;
    A.vehicleMeshes.sedan = function (veh) { const g = new THREE.Group(); g.name = 'custom:' + veh.type; g.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), A.propMaterial())); return g; };
    const m2 = R.rebuildEntityMesh(v); out.custom = m2 && m2.name; delete A.vehicleMeshes.sedan;
    GTP.game.advance(0.1); GTP.game.render();
    out.syncOk = GTP.errors.length === 0;
    const m3 = R.rebuildEntityMesh(p); out.ped = !!m3 && m3.parent === R.entityGroup;
    return out;
  });
  console.log('  v0.3 api: ' + JSON.stringify(api3));
  t.assert(api3.rebuilt && api3.paint === '#22cc44' && api3.finish === 'matte' && api3.tinted === 'glass2', 'rebuildEntityMesh rebuilds with vehicle.mods: ' + JSON.stringify(api3));
  t.assert(api3.custom === 'custom:sedan' && api3.syncOk && api3.ped, 'GTP.Assets.vehicleMeshes[type] is honoured and syncs without errors; peds rebuild too');
  // the camera: aiming looks far up (QA CMB-07), recoil at the top of the range recovers in full (QA CMB-13)
  const cam3 = await vp.evaluate(() => {
    const R = GTP.Render, rig = R.rig, p = GTP.game.player, C = GTP.C, out = {};
    GTP.game.debug.followCam(); if (!p.weapons || !p.weapons.pistol) { try { GTP.Combat.giveAmmo(p, 'pistol', 30, true); } catch (e) { /* the shooting track may rename it */ } } p.weapon = p.weapons && p.weapons.pistol ? 'pistol' : p.weapon;
    GTP.Input.set('aim', true);
    for (let i = 0; i < 40; i++) { GTP.Input.set('aim', true); p.aiming = true; GTP.Input.setLook(0, -60); GTP.game.advance(1 / 60); p.aiming = true; }
    const dir = new THREE.Vector3(); R.camera.getWorldDirection(dir);
    out.aimPitchDeg = +(rig.pitch * 180 / Math.PI).toFixed(1); out.aimElevDeg = +(Math.asin(dir.y) * 180 / Math.PI).toFixed(1);
    const before = rig.pitch;
    for (let k = 0; k < 6; k++) { rig.kick(3, 0, 0.25); for (let j = 0; j < 42; j++) { p.aiming = true; GTP.game.advance(1 / 60); } }
    out.recoilDriftDeg = +((rig.pitch - before) * 180 / Math.PI).toFixed(2);
    GTP.Input.set('aim', false); p.aiming = false; GTP.game.advance(1.5);
    out.chasePitchDeg = +(rig.pitch * 180 / Math.PI).toFixed(1); out.chaseMinDeg = +(C.CAMERA.pitchMin * 180 / Math.PI).toFixed(1);
    return out;
  });
  console.log('  v0.3 camera: ' + JSON.stringify(cam3));
  t.assert(cam3.aimElevDeg > 45, 'aiming can look 45+ degrees up (the helicopter at 49 degrees): ' + JSON.stringify(cam3));
  t.assert(Math.abs(cam3.recoilDriftDeg) < 0.2, 'recoil at the top of the pitch range does not drift the view down: ' + cam3.recoilDriftDeg);
  t.assert(cam3.chasePitchDeg >= cam3.chaseMinDeg - 0.5, 'leaving aim eases the pitch back into the chase range: ' + JSON.stringify(cam3));
  // DoF follows a cutscene, motion blur follows speed (inputs only; the passes run on high)
  const fx3 = await vp.evaluate(() => {
    const R = GTP.Render, CS = GTP.Cutscenes, out = {};
    GTP.game.debug.freeCam(327, 2, 372, 329, 6, 300);
    const was = CS ? CS.active : false; if (CS) CS.active = true;
    GTP.game.render(); out.dof = GTP.PostFX.stats.dof; out.dofActive = R.dofActive;
    if (CS) CS.active = was; GTP.game.render(); out.dofAfter = GTP.PostFX.stats.dof;
    GTP.Render.weather.set('rain', true); GTP.game.debug.setClock(22); for (let i = 0; i < 3; i++) GTP.game.render(); out.ssr = GTP.PostFX.stats.ssr;
    GTP.Render.weather.set('clear', true);
    return out;
  });
  console.log('  v0.3 post: ' + JSON.stringify(fx3));
  t.assert(fx3.dof && fx3.dofActive && !fx3.dofAfter && fx3.ssr, 'DoF runs only in cutscenes, SSR runs on wet roads: ' + JSON.stringify(fx3));
  // a district / time sample: high and medium (each shot several frames so TAA settles)
  const V3 = [
    { name: 'v3_downtown_noon', cam: [327, 1.7, 372], look: [329, 6, 300], clock: 12, weather: 'clear' },
    { name: 'v3_strip_rain_night', cam: [262, 1.8, 427], look: [256, 4, 395], clock: 21.5, weather: 'rain' },
    { name: 'v3_uptown_sunset', cam: [672, 1.7, 380], look: [690, 6, 362], clock: 18.7, weather: 'clear' },
    { name: 'v3_marina_noon', cam: [300, 5, 566], look: [300, 1, 508], clock: 12, weather: 'clear' },
    { name: 'v3_park_noon', cam: [524, 4, 160], look: [588, 9, 134], clock: 12, weather: 'clear' },
    { name: 'v3_downtown_night', cam: [327, 2, 372], look: [329, 8, 300], clock: 22.5, weather: 'clear' }
  ];
  const v3r = {};
  for (const preset of ['high', 'medium']) {
    await vp.evaluate((p) => GTP.Render.quality.set(p), preset);
    for (const s of V3) {
      await vp.evaluate((s) => {
        GTP.Render.weather.set(s.weather, true); GTP.game.debug.setClock(s.clock);
        const dx = s.look[0] - s.cam[0], dz = s.look[2] - s.cam[2], l = Math.hypot(dx, dz) || 1;
        GTP.game.debug.teleport(s.cam[0] + dx / l * 6, s.cam[2] + dz / l * 6);
        GTP.game.debug.freeCam(s.cam[0], s.cam[1], s.cam[2], s.look[0], s.look[1], s.look[2]);
        GTP.game.advance(0.3); for (let i = 0; i < 5; i++) GTP.game.render();
      }, s);
      const nm = s.name + '_' + preset;
      const file = await t.shot(vp, nm);
      const st = await t.pixelStats(vp);
      v3r[nm] = st;
      console.log('  ' + nm + ': ' + JSON.stringify(st) + ' -> ' + file);
      t.assert(st.colors > 400 && st.dark < 0.9 && st.bright < 0.9, nm + ' is a real picture: ' + JSON.stringify(st));
    }
  }
  t.assert(v3r.v3_strip_rain_night_high.warm > 0.01, 'the strip in the rain has warm light and neon: ' + v3r.v3_strip_rain_night_high.warm);
  t.assert(v3r.v3_park_noon_high.green > 0.1, 'the park reads green (grass, trees): ' + v3r.v3_park_noon_high.green);
  t.assert(v3r.v3_marina_noon_high.blue > 0.1, 'the marina shows sea and sky: ' + v3r.v3_marina_noon_high.blue);

  // ---- envw2 assets: builders in js/05_assets.js (QA-A-NGT-01, the v0.3 place props folded in from 20_content_world) ----
  const as2 = await vp.evaluate(() => {
    const A = GTP.Assets, W = GTP.World, U = GTP.util, out = {};
    // NGT-01: the lamp head, turned by the instance's yaw about +y, lands where the glow / pool / point light go (yawToDir * 1.4)
    const pos = A.prop('lamp').geometry.attributes.position; let sx = 0, sz = 0, n = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 5.8 && Math.abs(pos.getZ(i)) > 0.9) { sx += pos.getX(i); sz += pos.getZ(i); n++; }
    sx /= n; sz /= n; out.lampWorst = 0;
    W.props.filter((p) => p.kind === 'lamp').forEach((p) => {
      const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0), d = U.yawToDir(p.rot || 0);
      const hx = p.x + sx * c + sz * s, hz = p.z - sx * s + sz * c;
      out.lampWorst = Math.max(out.lampWorst, Math.hypot(hx - (p.x + d.x * 1.4), hz - (p.z + d.z * 1.4)));
    });
    // the six v0.3 place props are native builders: not the crate fallback, no wrapper left on Assets.prop
    const crate = A.prop('crate').geometry.attributes.position.count;
    out.folded = ['helipad', 'teebox', 'barberpole', 'mannequin', 'pontoon', 'tirestack'].map((k) => { const r = A.prop(k); return { k, verts: r.geometry.attributes.position.count, crate: r.geometry.attributes.position.count === crate, wrapped: !!r._world, shadow: r.castShadow }; });
    out.wrapper = !!A.prop._worldProps;
    return out;
  });
  console.log('  envw2 assets: ' + JSON.stringify(as2));
  t.assert(as2.lampWorst < 0.3, 'every lamp head sits over its glow, pool and light (QA-A-NGT-01): worst ' + as2.lampWorst.toFixed(2) + ' m');
  t.assert(!as2.wrapper && as2.folded.every((f) => !f.crate && !f.wrapped && f.verts > 30), 'the helipad, teebox, barber pole, mannequin, pontoon and tyre stack are 05_assets builders: ' + JSON.stringify(as2.folded));
  t.assert(as2.folded.filter((f) => !f.shadow).map((f) => f.k).join() === 'helipad,teebox', 'the flush helipad and teebox cast no shadow: ' + JSON.stringify(as2.folded));
  const v3e = await t.errors(v3);
  t.assert(v3e.length === 0, 'v0.3 errors:\n' + v3e.join('\n'));
});
