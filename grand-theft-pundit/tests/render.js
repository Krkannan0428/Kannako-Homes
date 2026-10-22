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
    // VIS-05: the far LOD Lambert materials carry the sky-ambient factor of their near twins
    out.farAmb = [A.groundMaterialFar(), A.propMaterialFar(), A.facadeMaterialFar ? A.facadeMaterialFar('downtown') : null].map((m) => m && m.userData.farAmb ? +m.userData.farAmb.value.toFixed(2) : 0);
    return out;
  });
  console.log('  envw2 assets: ' + JSON.stringify(as2));
  t.assert(as2.lampWorst < 0.3, 'every lamp head sits over its glow, pool and light (QA-A-NGT-01): worst ' + as2.lampWorst.toFixed(2) + ' m');
  t.assert(!as2.wrapper && as2.folded.every((f) => !f.crate && !f.wrapped && f.verts > 30), 'the helipad, teebox, barber pole, mannequin, pontoon and tyre stack are 05_assets builders: ' + JSON.stringify(as2.folded));
  // QAC-33: stepping down to low frees the normal / roughness maps' GPU copies (they stayed resident)
  const q33 = await vp.evaluate(() => {
    const R = GTP.Render, info = R.renderer.info.memory; GTP.game.render();
    const before = info.textures; R.quality.set('low'); GTP.game.advance(0.2); GTP.game.render();
    const low = info.textures; R.quality.set('medium'); GTP.game.advance(0.2); GTP.game.render();
    return { before, low, back: info.textures };
  });
  console.log('  QAC-33 textures: ' + JSON.stringify(q33));
  t.assert(q33.low < q33.before, 'going down to low frees the surface maps on the GPU (QAC-33): ' + JSON.stringify(q33));
  t.assert(as2.farAmb.every((k) => k > 1.5),'the far LOD materials make up the near ones\' sky ambient (QA-A-VIS-05): ' + as2.farAmb);
  t.assert(as2.folded.filter((f) => !f.shadow).map((f) => f.k).join() === 'helipad,teebox', 'the flush helipad and teebox cast no shadow: ' + JSON.stringify(as2.folded));
  const v3e = await t.errors(v3);
  t.assert(v3e.length === 0, 'v0.3 errors:\n' + v3e.join('\n'));
  await vp.close();

  // ==== the camera rig (integration round 2, render-camera): walls, props, the deck, NaN, interpolation ====
  const cr = await t.boot({ seed: 7 });
  const cp = cr.page;
  const camRig = await cp.evaluate(() => {
    const g = GTP.game, p = g.player, W = GTP.World, R = GTP.Render, out = {};
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0; g.debug.godMode(true);
    const inB = (v) => W.buildings.some((b) => v.x > b.x && v.x < b.x + b.w && v.z > b.z && v.z < b.z + b.d && v.y > b.y && v.y < b.y + b.h);
    // QA-A-CAM-01: aim 3 m and 6 m from a wall: the camera stays behind the player, outside the building
    const walls = W.buildings.filter((b) => {
      if (b.h < 12) return false;
      const tz = b.tz + (b.td >> 1);
      for (let k = 1; k <= 3; k++) if (!W.isWalkable(W.tile(b.tx - k, tz)) || W.deck[tz * W.w + b.tx - k]) return false;
      return true;
    }).slice(0, 2);
    out.aim = [];
    for (const b of walls) for (const dist of [3, 6]) {
      const yaw = -Math.PI / 2;
      g.debug.teleport(b.x - dist, b.z + b.d / 2 + 0.5); p.yaw = p.moveYaw = p.aimYaw = yaw; R.rig.yaw = yaw; R.rig.pitch = 0.1; R.rig.snap(); g.advance(1 / 60);
      GTP.Input.set('aim', true); for (let i = 0; i < 40; i++) g.advance(1 / 60);
      const c = R.camera.position;
      out.aim.push({ b: b.id, dist, aiming: !!p.aiming, ahead: +(c.x - p.x).toFixed(2), inB: inB(c) });
      GTP.Input.set('aim', false); g.advance(0.3);
    }
    // QA-A-CAM-02: first person against a wall: no point of the near plane inside the building
    const fpB = W.buildings.filter((b) => b.h >= 12 && W.tile(b.tx - 1, b.tz + (b.td >> 1)) === W.T.SIDEWALK && !W.deck[(b.tz + (b.td >> 1)) * W.w + b.tx - 1]).slice(0, 2);
    out.fp = [];
    for (const b of fpB) {
      const yaw = -Math.PI / 2;
      g.debug.teleport(b.x - 0.42, b.z + b.d / 2 + 0.5); p.yaw = p.moveYaw = p.aimYaw = yaw;
      p.cameraMode = 'first'; R.rig.yaw = yaw; R.rig.pitch = 0; R.rig.snap(); g.advance(2 / 60);
      const cam = R.camera; cam.updateMatrixWorld();
      const n = cam.near, hh = Math.tan(cam.fov * Math.PI / 360) * n, hw = hh * cam.aspect; let k = 0;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) if (inB(new THREE.Vector3(sx * hw, sy * hh, -n).applyMatrix4(cam.matrixWorld))) k++;
      out.fp.push({ b: b.id, near: n, inside: k });
      p.cameraMode = 'chase'; g.advance(0.05);
    }
    out.nearBack = R.camera.near;
    // QA-A-CAM-05: the chase camera looking from a container stack (or an airliner) toward the player stays out of it
    const conts = W.props.filter((q) => q.kind === 'container');
    const inCont = (c) => conts.some((q) => {
      const cs = Math.cos(q.rot || 0), sn = Math.sin(q.rot || 0), dx = c.x - q.x, dz = c.z - q.z;
      return Math.abs(dx * cs - dz * sn) < 1.1 && Math.abs(dx * sn + dz * cs) < 2.9 && c.y > (q.y || 0) && c.y < (q.y || 0) + 2.6;
    });
    out.cont = [];
    for (const c of conts.filter((q) => q.y > 2 && (q.rot || 0) === 0).filter((_, i) => i % 23 === 0)) {
      if (out.cont.length >= 3) break;
      for (const side of [-1, 1]) {
        const x = c.x + side * 3.4, z = c.z;
        if (conts.some((q) => Math.abs(q.x - x) < 1.6 && Math.abs(q.z - z) < 3.2)) continue;
        g.debug.teleport(x, z); g.advance(0.05);
        R.rig.yaw = GTP.util.dirToYaw(p.x - c.x, p.z - c.z); R.rig.pitch = 0.15; R.rig.snap(); g.advance(0.5);
        out.cont.push({ inCont: inCont(R.camera.position) });
        break;
      }
    }
    const pl = W.props.filter((q) => q.kind === 'plane' && q.r >= 7)[0];
    if (pl) {
      g.debug.teleport(pl.x + 9, pl.z); g.advance(0.05);
      R.rig.yaw = GTP.util.dirToYaw(p.x - pl.x, p.z - pl.z); R.rig.pitch = 0.15; R.rig.snap(); g.advance(0.5);
      out.planeD = +Math.hypot(R.camera.position.x - pl.x, R.camera.position.z - pl.z).toFixed(2); out.planeR = pl.r;
    }
    // QA-A-DRV-07: under the Loop in a car, looking up keeps the camera under the slab
    out.deck = [];
    for (const [x, z, yaw] of [[184, 186, -Math.PI / 2], [300, 376, 0]]) {
      const v = g.debug.spawnVehicle(x, z, 'sedan', { yaw, y: 0 }); v.y = 0; g.debug.teleport(x, z, 0); v.enter(p, 0);
      R.rig.yaw = yaw; R.rig.snap(); g.advance(0.1);
      for (let i = 0; i < 10; i++) { GTP.Input.setLook(0, 30); g.advance(1 / 60); }
      GTP.Input.setLook(0, 0); g.advance(0.05);
      const c = R.rig.pos;
      out.deck.push({ under: !!W.deck[W.tileIndex(Math.floor(x / 4), Math.floor(z / 4))], camY: +c.y.toFixed(2), camOverDeck: !!W.deck[W.tileIndex(Math.floor(c.x / 4), Math.floor(c.z / 4))], pitch: +R.rig.pitch.toFixed(2) });
      p.exitVehicle(); g.advance(0.1); v.destroy(); g.debug.teleport(300, 300); g.advance(0.1);
    }
    // QAC-28: one NaN target step does not poison the rig
    const x0 = p.x; p.x = NaN; R.updateCamera(1 / 60); p.x = x0;
    for (let i = 0; i < 10; i++) g.advance(1 / 60);
    g.render();
    out.nan = { cam: Number.isFinite(R.camera.position.x) && Number.isFinite(R.camera.position.y), rig: Number.isFinite(R.rig.pos.x) && Number.isFinite(R.rig.focus.x), d: +Math.hypot(R.camera.position.x - p.x, R.camera.position.z - p.z).toFixed(2) };
    R.rig.yaw = NaN; g.advance(2 / 60); g.render();
    out.nanYaw = Number.isFinite(R.rig.yaw) && Number.isFinite(R.camera.position.x);
    return out;
  });
  console.log('  camera rig: ' + JSON.stringify(camRig));
  t.assert(camRig.aim.length >= 4 && camRig.aim.every((q) => q.aiming && !q.inB && q.ahead < 0.5), 'QA-A-CAM-01: the aim camera stays behind the player and out of a near wall: ' + JSON.stringify(camRig.aim));
  t.assert(camRig.fp.length >= 2 && camRig.fp.every((q) => q.inside === 0), 'QA-A-CAM-02: the first-person near plane does not cut into a wall: ' + JSON.stringify(camRig.fp));
  t.assert(camRig.nearBack === 0.3, 'the chase camera is back on the 0.3 m near plane: ' + camRig.nearBack);
  t.assert(camRig.cont.length >= 2 && camRig.cont.every((q) => !q.inCont), 'QA-A-CAM-05: the chase camera is not inside a container stack: ' + JSON.stringify(camRig.cont));
  t.assert(camRig.planeD > camRig.planeR, 'QA-A-CAM-05: the chase camera is not inside the airliner: ' + JSON.stringify([camRig.planeD, camRig.planeR]));
  t.assert(camRig.deck.length === 2 && camRig.deck.every((q) => q.under && q.pitch > 0.8 && !(q.camOverDeck && q.camY > 6.3)), 'QA-A-DRV-07: looking up under the Loop keeps the camera under the slab: ' + JSON.stringify(camRig.deck));
  t.assert(camRig.nan.cam && camRig.nan.rig && camRig.nan.d < 8 && camRig.nanYaw, 'QAC-28: a NaN target or yaw does not poison the rig: ' + JSON.stringify([camRig.nan, camRig.nanYaw]));
  const camRig2 = await cp.evaluate(() => {
    const g = GTP.game, p = g.player, W = GTP.World, R = GTP.Render, C = GTP.C, out = {};
    // QA-A-CAM-03 / QAC-17: flat out, the car holds its place on screen whatever the render alpha
    const v = g.debug.spawnVehicle(40, 90, 'sports', { yaw: GTP.util.dirToYaw(1, 0) }); v.persistent = true;
    g.debug.teleport(40, 90); v.enter(p, 0); g.advance(0.05); R.rig.yaw = v.yaw; R.rig.snap();
    GTP.Input.set('forward', true); for (let i = 0; i < 240; i++) g.advance(1 / 60);
    const ys = [];
    for (const a of [0, 0.5, 1]) { g.render(a); ys.push(R.worldToScreen(v.mesh.position.x, v.mesh.position.y + 0.8, v.mesh.position.z).sy); }
    GTP.Input.set('forward', false);
    out.interp = { speed: +v.speed2d().toFixed(1), range: +(Math.max(...ys) - Math.min(...ys)).toFixed(2) };
    p.exitVehicle(); g.advance(0.1); v.destroy(); g.advance(0.05);
    // QA-A-CAM-06: a bus backed up to a wall: the boom climbs, its own roof does not fill the screen
    const b = W.buildings.filter((b) => b.h >= 9 && [1, 2, 3].every((k) => W.isWalkable(W.tile(b.tx - k, b.tz + (b.td >> 1))) && !W.deck[(b.tz + (b.td >> 1)) * W.w + b.tx - k]))[0];
    const z = b.z + b.d / 2 + 0.5, yaw = Math.PI / 2;
    const bus = g.debug.spawnVehicle(b.x - 30, z, 'bus', { yaw }); bus.persistent = true;
    g.debug.teleport(b.x - 30, z); bus.enter(p, 0); g.advance(0.05);
    g.debug.teleport(b.x - bus.cls.length / 2 - 0.35, z); bus.yaw = yaw; bus.snap();
    R.rig.yaw = yaw; R.rig.pitch = 0.14; R.rig.snap(); g.advance(0.5);
    GTP.Entities.sync(1); R.camera.updateMatrixWorld(); bus.mesh.updateMatrixWorld(true);
    const rc = new THREE.Raycaster(); rc.layers.enableAll(); let hit = 0, n = 0;
    for (let i = 0; i < 32; i++) for (let j = 0; j < 18; j++) { rc.setFromCamera(new THREE.Vector2((i + 0.5) / 16 - 1, (j + 0.5) / 9 - 1), R.camera); n++; if (rc.intersectObject(bus.mesh, true).length) hit++; }
    out.bus = { cover: +(hit / n).toFixed(2), camY: +R.camera.position.y.toFixed(2), camInB: W.tile(Math.floor(R.camera.position.x / 4), Math.floor(R.camera.position.z / 4)) === W.T.BUILDING };
    p.exitVehicle(); g.advance(0.1); bus.destroy(); g.advance(0.05);
    // QA-A-CAM-07: after a teleport (live chunk budget) no chunk in view and inside the fog start is missing on the first frame
    const missing = () => {
      const cam = R.camera, S = C.TILE * C.CHUNK_TILES; cam.updateMatrixWorld();
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const nn = Math.ceil(W.w / C.CHUNK_TILES), list = [];
      for (let zz = 0; zz < nn; zz++) for (let xx = 0; xx < nn; xx++) {
        const qx = Math.max(xx * S, Math.min(cam.position.x, xx * S + S)), qz = Math.max(zz * S, Math.min(cam.position.z, zz * S + S));
        const dn = Math.hypot(qx - cam.position.x, qz - cam.position.z);
        if (dn > R.scene.fog.near) continue;
        if (!fr.intersectsBox(new THREE.Box3(new THREE.Vector3(xx * S, -2, zz * S), new THREE.Vector3(xx * S + S, 30, zz * S + S)))) continue;
        if (!R.chunks.has(xx + ',' + zz)) list.push(xx + ',' + zz);
      }
      return list;
    };
    R.headless = false;
    R.invalidateAll(); R.prebuild(110, 270, 300);
    g.debug.teleport(560, 610); p.yaw = Math.PI; R.rig.yaw = Math.PI; R.rig.snap(); g.advance(1 / 60); g.render();
    out.pop = missing();
    // QAC-10: a sweep over the map keeps a ring of chunks, not the whole city
    let maxN = 0;
    for (const [x, zq] of [[100, 100], [800, 100], [800, 800], [100, 800], [450, 450]]) {
      g.debug.teleport(x, zq); g.advance(1 / 60);
      for (let i = 0; i < 80; i++) R.ensureChunks();
      maxN = Math.max(maxN, R.chunks.size);
    }
    R.headless = true;
    out.evict = { maxN, total: Math.ceil(W.w / C.CHUNK_TILES) * Math.ceil(W.h / C.CHUNK_TILES), unbuilds: R.stats.chunkUnbuilds || 0 };
    // QA-A-CAM-08: the entity draw ranges sit inside the fog, where it already hides them
    g.render();
    const fog = R.scene.fog, Q = C.QUALITY;
    out.draw = { near: fog.near, far: fog.far, ped: Q.pedDraw, car: Q.vehicleDraw, pedFog: +((Q.pedDraw - fog.near) / (fog.far - fog.near)).toFixed(2), carFog: +((Q.vehicleDraw - fog.near) / (fog.far - fog.near)).toFixed(2) };
    return out;
  });
  console.log('  camera rig 2: ' + JSON.stringify(camRig2));
  t.assert(camRig2.interp.speed > 30 && camRig2.interp.range < 2, 'QA-A-CAM-03 / QAC-17: the camera is interpolated with the car (screen drift across alpha < 2 px): ' + JSON.stringify(camRig2.interp));
  t.assert(camRig2.bus.cover < 0.4 && !camRig2.bus.camInB, 'QA-A-CAM-06: a bus at a wall covers less than 40% of the screen: ' + JSON.stringify(camRig2.bus));
  t.assert(camRig2.pop.length === 0, 'QA-A-CAM-07: no chunk in view inside the fog start is missing after a teleport: ' + JSON.stringify(camRig2.pop));
  t.assert(camRig2.evict.unbuilds > 0 && camRig2.evict.maxN < camRig2.evict.total * 0.6, 'QAC-10: far chunks are unbuilt: ' + JSON.stringify(camRig2.evict));
  t.assert(camRig2.draw.pedFog >= 0.5 && camRig2.draw.carFog >= 0.5 && camRig2.draw.ped < camRig2.draw.far && camRig2.draw.car < camRig2.draw.far, 'QA-A-CAM-08: peds and vehicles are culled inside the fog: ' + JSON.stringify(camRig2.draw));
  const crErr = await t.errors(cr);
  t.assert(crErr.length === 0, 'camera rig errors:\n' + crErr.join('\n'));
  await cp.close();
  // ==== integration round 2, render-look (branch envw2/render-look): depth of field, mission markers, night lights,
  // scorch decals, sky, roofs, signs, weather repaint, post target limits, projectile geometry. One high-preset boot. ====
  const rl = await t.boot({ seed: 7, quality: 'high', weather: 'clear' });
  const rp = rl.page;
  // a luminance probe of the GL canvas: mean |dL/dx| (detail) inside a box, and the blue share of the frame
  await rp.evaluate(() => {
    window.__rlProbe = (box) => {
      const cv = document.getElementById('gl'), off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
      const ctx = off.getContext('2d'); GTP.game.render(); ctx.drawImage(cv, 0, 0);
      const W = off.width, H = off.height, x0 = Math.floor(box[0] * W), x1 = Math.floor(box[2] * W), y0 = Math.floor(box[1] * H), y1 = Math.floor(box[3] * H);
      const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data, w = x1 - x0; let g = 0, n = 0, blue = 0, m = 0;
      for (let y = 0; y < y1 - y0; y += 2) for (let x = 0; x < w - 1; x++) {
        const i = (y * w + x) * 4, l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11, l2 = d[i + 4] * 0.3 + d[i + 5] * 0.59 + d[i + 6] * 0.11;
        g += Math.abs(l2 - l); n++; if (d[i + 2] > d[i] + 25 && d[i + 2] > d[i + 1] + 5) blue++; m++;
      }
      return { detail: +(g / n).toFixed(2), blue: +(blue / m).toFixed(3) };
    };
    // what the marker group adds to the frame: shown vs hidden, the mean |difference| and the mean blue shift (b - r)
    window.__rlTint = () => {
      const R = GTP.Render, cv = document.getElementById('gl'), off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
      const ctx = off.getContext('2d'), grab = () => { GTP.game.render(); ctx.drawImage(cv, 0, 0); return ctx.getImageData(0, 0, off.width, off.height).data; };
      R.markerGroup.visible = false; grab(); const a = grab().slice(0); R.markerGroup.visible = true; grab(); const b = grab();
      let s = 0, sb = 0, n = 0;
      for (let i = 0; i < a.length; i += 16) { s += (Math.abs(b[i] - a[i]) + Math.abs(b[i + 1] - a[i + 1]) + Math.abs(b[i + 2] - a[i + 2])) / 3; sb += (b[i + 2] - a[i + 2]) - (b[i] - a[i]); n++; }
      return { diff: +(s / n).toFixed(2), blueShift: +(sb / n).toFixed(2) };
    };
  });
  // (P1a) DoF: a two-shot 4.5 m from the player. The focal plane keeps its detail, the frame is not smeared (coordinator:
  // the speakers and the backgrounds were a smear), and DoF stays off outside a cutscene
  const dof = await rp.evaluate(() => {
    const R = GTP.Render, CS = GTP.Cutscenes, p = GTP.game.player, out = {};
    GTP.game.debug.setClock(15); GTP.Render.weather.set('clear', true);
    GTP.game.debug.teleport(327, 340); GTP.game.advance(0.3);
    GTP.game.debug.freeCam(p.x + 3.2, p.y + 1.7, p.z + 3.2, p.x, p.y + 1.3, p.z);
    for (let i = 0; i < 6; i++) GTP.game.render();
    // the speaker's torso and head (the camera looks at the chest), and the whole frame
    const centre = [0.475, 0.28, 0.525, 0.62], frame = [0.02, 0.05, 0.98, 0.95];
    out.offC = __rlProbe(centre); out.offF = __rlProbe(frame);
    // CS.active without a script: Render auto-focuses on the screen centre, here the player's chest (as the fx3 check does)
    window.__rlWasCs = CS.active;
    CS.active = true;
    for (let i = 0; i < 6; i++) GTP.game.render();
    out.onC = __rlProbe(centre); out.onF = __rlProbe(frame); out.ran = GTP.PostFX.stats.dof; out.focus = +R.dofFocus.toFixed(2);
    out.aperture = R.dofAperture; out.band = R.dofBand;
    out.keepC = +(out.onC.detail / Math.max(0.01, out.offC.detail)).toFixed(2); out.keepF = +(out.onF.detail / Math.max(0.01, out.offF.detail)).toFixed(2);
    return out;
  });
  await t.shot(rp, 'render_look_dof_twoshot');
  Object.assign(dof, await rp.evaluate(() => {
    const out = {}; GTP.Cutscenes.active = window.__rlWasCs; GTP.game.render(); out.after = GTP.PostFX.stats.dof;
    GTP.game.debug.followCam(); GTP.game.advance(0.2); GTP.game.render(); out.street = GTP.PostFX.stats.dof;
    return out;
  }));
  console.log('  render-look dof: ' + JSON.stringify(dof));
  t.assert(dof.ran && !dof.after && !dof.street && dof.aperture <= 0.8 && dof.band > 0, 'DoF runs in the cutscene only, with a gentle aperture and a crisp band: ' + JSON.stringify(dof));
  // the speaker box also holds a little of the softened background round his silhouette (measured 0.65 / 0.72 on high)
  t.assert(dof.keepC >= 0.55, 'the focal plane stays crisp under DoF (detail kept on the speaker): ' + JSON.stringify(dof));
  t.assert(dof.keepF >= 0.6, 'DoF is a subtle background blur, not a smear of the frame: ' + JSON.stringify(dof));
  // (P1b) the mission marker: a narrow light column (< 1 m), normal blending, faded near the camera; standing in it or
  // aiming beside it does not turn the frame blue (before: blue share 0.67 standing in it, 0.95 aiming)
  const mk = await rp.evaluate(() => {
    const R = GTP.Render, out = {};
    const g = R.markerMesh(0x2f6cff), mesh = g.userData.mesh, pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.gtpCol;
    let rc = 0, rr = 0; for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getZ(i)); if (col.getX(i) > 0.5) rc = Math.max(rc, r); else rr = Math.max(rr, r); }
    out.columnWidth = +(rc * 2).toFixed(2); out.ring = +rr.toFixed(2); out.additive = mesh.material.blending === THREE.AdditiveBlending; out.fade = !!mesh.material.userData.gtpFade;
    // a beacon added afterwards (09_missions addBeacon) gets the fade too
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.2, 40, 8, 1, true), new THREE.MeshBasicMaterial({ transparent: true })); g.add(beam); out.beaconFade = !!beam.material.userData.gtpFade;
    R.removeMarker(g);
    GTP.game.debug.setClock(16);
    const list = GTP.Missions && GTP.Missions.markers ? GTP.Missions.markers() : [];
    let m = list[0], own = null;
    if (!m) { own = R.markerMesh(0x2f6cff); R.addMarker(own); own.position.set(110, 0.15, 270); m = { x: 110, z: 270 }; }
    GTP.game.debug.followCam(); GTP.game.debug.teleport(m.x, m.z + 0.2); GTP.game.player.yaw = 0; GTP.game.advance(0.8);
    out.inside = __rlTint();
    GTP.game.debug.teleport(m.x + 1.6, m.z + 0.4); GTP.game.player.yaw = 0; GTP.game.advance(0.3);
    for (let i = 0; i < 30; i++) { GTP.Input.set('aim', true); GTP.game.player.aiming = true; GTP.game.advance(1 / 60); }
    out.aim = __rlTint();
    GTP.game.debug.teleport(m.x + 6, m.z + 16); GTP.game.advance(0.3);
    GTP.game.debug.freeCam(m.x, 2.2, m.z + 14, m.x, 2, m.z); out.far = __rlTint(); GTP.game.debug.followCam();
    GTP.Input.set('aim', false); GTP.game.player.aiming = false; GTP.game.advance(0.3);
    if (own) R.removeMarker(own);
    return out;
  });
  console.log('  render-look marker: ' + JSON.stringify(mk));
  t.assert(mk.columnWidth < 1 && mk.ring >= 1 && !mk.additive && mk.fade && mk.beaconFade, 'the marker is a narrow soft column over a ground ring, faded near the camera: ' + JSON.stringify(mk));
  t.assert(mk.inside.diff < 5 && mk.inside.blueShift < 3 && mk.aim.diff < 5 && mk.aim.blueShift < 3, 'standing in or aiming beside a marker does not tint the frame blue: ' + JSON.stringify(mk));
  t.assert(mk.far.diff > 0.05, 'the marker is still seen from 14 m: ' + JSON.stringify(mk.far));
  // (QA-A-NGT-06, CMB-04, heli) entering a car at night compiles nothing and changes no light count; the muzzle and the
  // helicopter searchlight are resident at intensity 0
  const ngt6 = await rp.evaluate(() => {
    const R = GTP.Render, L = R.lights, p = GTP.game.player, out = {};
    GTP.game.debug.setClock(22); GTP.game.debug.teleport(327, 364); GTP.game.advance(0.3);
    const lightCount = () => { let n = 0; R.scene.traverse((o) => { if (o.isLight && o.visible) n++; }); return n; };
    const d = GTP.util.yawToDir(p.yaw), v = GTP.game.debug.spawnVehicle(p.x + d.x * 3, p.z + d.z * 3, 'sedan', {});
    for (let i = 0; i < 4; i++) { GTP.game.advance(1 / 30); GTP.game.render(); }
    out.progBefore = R.renderer.info.programs.length; out.lightsBefore = lightCount();
    v.enter(p, 0); GTP.game.advance(1 / 30); GTP.game.render(); GTP.game.advance(1 / 30); GTP.game.render();
    out.progAfter = R.renderer.info.programs.length; out.lightsAfter = lightCount(); out.headI = L.headlight.intensity; out.owner = L.headlightOwner === v;
    v.exit && v.exit(p); GTP.game.advance(0.3); GTP.game.render();
    out.headOff = L.headlight.intensity; out.lightsOut = lightCount();
    out.heli = !!L.heli && L.heli.isSpotLight && L.heli.parent === R.scene && L.heli.intensity === 0;
    out.muzzle = !!R.muzzleLight && R.muzzleLight.parent === R.scene;
    return out;
  });
  console.log('  render-look headlight: ' + JSON.stringify(ngt6));
  t.assert(ngt6.progAfter === ngt6.progBefore && ngt6.lightsAfter === ngt6.lightsBefore && ngt6.lightsOut === ngt6.lightsBefore, 'entering a car at night compiles no shader and keeps the light count (QA-A-NGT-06): ' + JSON.stringify(ngt6));
  t.assert(ngt6.owner && ngt6.headI > 1 && ngt6.headOff === 0, 'the player headlight is driven by intensity: ' + JSON.stringify(ngt6));
  t.assert(ngt6.heli && ngt6.muzzle, 'Render.lights.heli and the muzzle light are resident (CMB-04, the police searchlight)');
  // (QA-A-NGT-05) lamp light slots fade in and out as the focus walks down an avenue (no full-brightness pop)
  const ngt5 = await rp.evaluate(() => {
    const R = GTP.Render, L = R.lights, p = GTP.game.player, out = { maxDrop: 0, maxRise: 0, frames: 0, lit: 0 };
    GTP.game.debug.followCam(); GTP.game.debug.setClock(22); GTP.game.debug.teleport(327, 380); GTP.game.advance(0.5); GTP.game.render();
    let prev = L.points.map((l) => l.intensity), prevPos = L.points.map((l) => l.position.clone());
    // the pool runs in Render.frame; here it is stepped directly (120 high-preset renders took minutes under SwiftShader)
    for (let f = 0; f < 120; f++) {
      GTP.game.debug.teleport(327, 380 - f * 0.9); GTP.game.advance(1 / 30); R._updateLightPool(1 / 30); out.frames++;
      L.points.forEach((l, i) => {
        if (!l.visible) return;
        const moved = l.position.distanceTo(prevPos[i]) > 0.5, dI = l.intensity - prev[i];
        // a slot that changes lamp must have faded to ~0 first; on the same lamp the intensity moves by its fade rate only
        if (moved && prev[i] > 0.05) out.maxDrop = Math.max(out.maxDrop, prev[i]);
        if (!moved) { out.maxDrop = Math.max(out.maxDrop, -dI); out.maxRise = Math.max(out.maxRise, dI); }
        if (l.intensity > 0.3) out.lit++;
        prev[i] = l.intensity; prevPos[i].copy(l.position);
      });
    }
    out.maxDrop = +out.maxDrop.toFixed(3); out.maxRise = +out.maxRise.toFixed(3);
    return out;
  });
  console.log('  render-look lamp pool: ' + JSON.stringify(ngt5));
  t.assert(ngt5.lit > 120 && ngt5.maxDrop < 0.35 && ngt5.maxRise < 0.35, 'street lamp lights fade in and out of the pool (QA-A-NGT-05): ' + JSON.stringify(ngt5));
  await t.shot(rp, 'render_look_night_avenue');
  // (QA-A-ENT-05) decals are soft round marks, skids stay rectangles
  const ent5 = await rp.evaluate(() => {
    const F = GTP.Render.fx, p = GTP.game.player;
    const dcl = F.add({ type: 'decal', x: p.x + 2, y: 0.12, z: p.z, size: 5, color: 0x181818 }), sk = F.add({ type: 'skid', x: p.x - 2, y: 0.12, z: p.z, size: 0.3, size2: 2 });
    return { decal: F._decalShape.array[dcl.slot], skid: F._decalShape.array[sk.slot] };
  });
  t.assert(ent5.decal > 0 && ent5.skid === 0, 'explosion scorches are round soft marks, skids stay rectangles (QA-A-ENT-05): ' + JSON.stringify(ent5));
  // (QA-A-VIS-03) the dusk sky has no hard arc: the sky canvas column under the sun changes smoothly row to row
  const vis3 = await rp.evaluate(() => {
    const R = GTP.Render, out = {};
    for (const c of [18.6, 6.8]) {
      GTP.game.debug.setClock(c); R._envClock = null; GTP.game.render();
      const cv = GTP.Assets.skyCanvas, ctx = cv.getContext('2d'), d = R.lights.sunDir, sm = R._sunModel(c);
      const u = Math.round((Math.atan2(sm.dir.z, sm.dir.x) / (Math.PI * 2) + 0.5) * cv.width) % cv.width;
      // the sky above the sun disc (its own 7-13 px glow is steep by design); the old arc sat at 0.3 of the height
      const sv = (1 - (Math.asin(Math.max(-1, Math.min(1, sm.dir.y))) / Math.PI + 0.5)) * cv.height;
      const col = ctx.getImageData(u, 0, 1, Math.max(8, Math.floor(Math.min(sv - 18, cv.height * 0.48)))).data; let jump = 0;
      for (let y = 1; y < col.length / 4; y++) { const l0 = col[(y - 1) * 4] + col[(y - 1) * 4 + 1] + col[(y - 1) * 4 + 2], l1 = col[y * 4] + col[y * 4 + 1] + col[y * 4 + 2]; jump = Math.max(jump, Math.abs(l1 - l0) / 3); }
      out[c] = +jump.toFixed(1); void d;
    }
    return out;
  });
  t.assert(vis3['18.6'] < 8 && vis3['6.8'] < 8, 'the dusk / dawn sky has no hard band edge (QA-A-VIS-03): ' + JSON.stringify(vis3));
  // (QA-A-VIS-01) flat roof gravel has square texels; (QA-A-VIS-06) sign textures keep their letters' proportions
  const vis16 = await rp.evaluate(() => {
    const R = GTP.Render, A = GTP.Assets, quads = [], out = {};
    const g = { quad: (a, b, c, d, uv) => quads.push({ a, b, c, d, uv }), box() {}, cylinder() {}, sphere() {} };
    R._roof(g, { roof: 'flat', w: 30, d: 20, seed: 3, style: 'campus', floors: 3 }, A, 0, 0, 30, 20, 10, null);
    const gq = quads.filter((q) => q.a[1] === 10 && q.b[1] === 10 && q.c[1] === 10 && Array.isArray(q.uv));
    let worst = 1;
    gq.forEach((q) => {
      const dx = q.d[0] - q.a[0], dz = q.b[2] - q.a[2], du = Math.abs(q.uv[3][0] - q.uv[0][0]), dv = Math.abs(q.uv[1][1] - q.uv[0][1]);
      const pxX = du * 512 / dx, pxZ = dv * 1280 / dz, r = Math.max(pxX / pxZ, pxZ / pxX); worst = Math.max(worst, r);
    });
    out.roofQuads = gq.length; out.roofStretch = +worst.toFixed(2);
    let signs = 0, bad = 0, maxS = 1;
    R.chunks.forEach((ch) => ch.group.traverse((o) => {
      if (o.name !== 'sign' || !o.material || !o.material.map || !o.geometry.parameters) return;
      const im = o.material.map.image, pa = o.geometry.parameters.width / o.geometry.parameters.height; if (!im || !im.width || pa < 1) return;
      const s = Math.max(pa / (im.width / im.height), (im.width / im.height) / pa); signs++; if (s > 1.25) bad++; maxS = Math.max(maxS, s);
    }));
    out.signs = signs; out.signsStretched = bad; out.signMaxStretch = +maxS.toFixed(2);
    return out;
  });
  console.log('  render-look roofs / signs: ' + JSON.stringify(vis16));
  t.assert(vis16.roofQuads >= 8 && vis16.roofStretch < 1.15, 'flat roof gravel has square texels (QA-A-VIS-01): ' + JSON.stringify(vis16));
  t.assert(vis16.signs > 10 && vis16.signsStretched === 0, 'no sign stretches its lettering by more than 25 % (QA-A-VIS-06): ' + JSON.stringify(vis16));
  // (QAC-24) a weather transition repaints the sky in steps, not every frame; (stab-QA-D-08) projectiles share geometry
  const qac24 = await rp.evaluate(() => {
    const R = GTP.Render, orig = R._paintSky; let n = 0;
    R._paintSky = function () { n++; return orig.apply(this, arguments); };
    R.weather.set('clear', true); GTP.game.render(); n = 0;
    R.weather.set('rain', false);
    // Render.frame's weather and sky steps without the draw (60 high-preset renders are slow under SwiftShader)
    for (let i = 0; i < 60; i++) { GTP.game.advance(1 / 60); R.weather.update(1 / 60); const ck = GTP.game.time.clock; if (Math.abs(ck - (R._envClock == null ? -99 : R._envClock)) > 0.02) { R._envClock = ck; R.updateEnvironment(ck); } }
    R._paintSky = orig; R.weather.set('clear', true);
    const a = R.buildEntityMesh({ kind: 'projectile', weaponId: 'hottake' }), b = R.buildEntityMesh({ kind: 'projectile', weaponId: 'hottake' }), c = R.buildEntityMesh({ kind: 'projectile', weaponId: 'pistol' });
    return { repaints: n, shared: a.geometry === b.geometry && !!a.geometry.userData.shared && c.geometry !== a.geometry };
  });
  t.assert(qac24.repaints <= 10, 'a weather transition repaints the sky at most every few frames (QAC-24): ' + JSON.stringify(qac24));
  t.assert(qac24.shared, 'projectile meshes share their sphere geometry (stab-QA-D-08)');
  // (QAC-26) the post targets stay within the GPU limits on a huge canvas; the frame is not black
  const qac26 = await rp.evaluate(() => {
    const F = GTP.PostFX, r = GTP.Render.renderer, gl = r.getContext(), cap = Math.min(r.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    F.resize(cap * 3, 3000); const size = [F.width, F.height]; GTP.game.render();
    const ok = F.enabled && F.width <= cap && F.height <= cap;
    GTP.Render.resize(); GTP.game.render();
    return { cap, size, ok, back: [F.width, F.height], err: gl.getError() };
  });
  t.assert(qac26.ok && qac26.err === 0, 'PostFX clamps its targets to the GPU limits (QAC-26): ' + JSON.stringify(qac26));
  // (priority 3) stars to the zenith, the moon on the moonlight, puddles round the focus and inside sidewalk tiles, no rain
  // under the Loop deck, a knocked-over lamp goes dark, a context restore rebuilds the environment, no rain indoors
  const p3 = await rp.evaluate(() => {
    const R = GTP.Render, W = GTP.World, C = GTP.C, L = R.lights, sk = R.sky, out = {};
    const sp = sk.stars.geometry.attributes.position; let top = 0; for (let i = 0; i < sp.count; i++) top = Math.max(top, Math.asin(sp.getY(i) / 1000) * 180 / Math.PI); out.starTop = +top.toFixed(1);
    out.moon = [];
    for (const c of [22, 1, 3]) { GTP.game.debug.setClock(c); GTP.game.render(); const m = sk.moon.position.clone().sub(sk.dome.position).normalize(); out.moon.push({ c, ang: +(Math.acos(Math.min(1, m.dot(L.sunDir))) * 180 / Math.PI).toFixed(1), x: +m.x.toFixed(2) }); }
    // puddles in the rain round (326, 422): some south of the focus, sidewalk discs inside their tile
    R.weather.set('rain', true); GTP.game.debug.setClock(22); GTP.game.debug.followCam(); GTP.game.debug.teleport(326, 422); GTP.game.advance(0.3); R.weather._pudSeed = null; GTP.game.render();
    const im = R.weather._puddles, fx = R.focusPoint(), m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    let south = 0, n = 0, over = 0;
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m4); m4.decompose(p, q, s); if (s.x === 0) continue; n++;
      if (p.z > fx.z + 8) south++;
      const tx = Math.floor(p.x / C.TILE), tz = Math.floor(p.z / C.TILE);
      if (W.tile(tx, tz) === W.T.SIDEWALK) { const r = Math.max(s.x, s.z); if (p.x - r < tx * C.TILE - 0.01 || p.x + r > (tx + 1) * C.TILE + 0.01 || p.z - r < tz * C.TILE - 0.01 || p.z + r > (tz + 1) * C.TILE + 0.01) over++; }
    }
    out.puddles = { n, south, over, opacityNight: +im.material.opacity.toFixed(2) };
    // rain under the Loop deck (186, 402)
    GTP.game.debug.freeCam(186, 2, 402, 186, 2, 380); GTP.game.render();
    const rp2 = R.weather._rain.geometry.attributes.position, used = R.weather._rain.geometry.drawRange.count; let underDeck = 0;
    for (let i = 0; i < Math.min(used, rp2.count); i++) { const x = rp2.getX(i), y = rp2.getY(i), z = rp2.getZ(i); if (y > 0 && y < C.DECK_Y - C.DECK_THICK && Math.hypot(x - 186, z - 402) < 12 && W.deckAt(Math.floor(x / C.TILE), Math.floor(z / C.TILE))) underDeck++; }
    out.underDeck = underDeck; out.deckHere = W.deckAt(Math.floor(186 / C.TILE), Math.floor(402 / C.TILE));
    // indoors: no rain streaks, no puddles (folded from 13_interiors)
    const I = GTP.Interiors; if (I) { const was = I.active; I.active = true; GTP.game.render(); out.indoorRain = R.weather._rain.visible; out.indoorPuddles = R.weather._puddles.visible; I.active = was; }
    R.weather.set('clear', true); GTP.game.debug.followCam();
    // a knocked lamp: its glow sprite drops out of sight
    let lamp = null, chk = null;
    R.chunks.forEach((ch) => { if (lamp || !ch.glowPts || ch.glowPts.name === 'edgelights') return; const l = (W.props || []).find((pp) => pp.kind === 'lamp' && pp._glowCh === ch && !pp.fallen); if (l) { lamp = l; chk = ch; } });
    if (lamp) { const i = lamp._glowI; lamp.fallen = { t: GTP.game.time.t, dx: 1, dz: 0 }; R.knockProp(lamp); out.lampSpriteY = +chk.glowPts.geometry.attributes.position.getY(i).toFixed(1); out.lampPoolY = +chk.glow.geometry.attributes.position.getY(i * 4).toFixed(1); }
    // a context restore drops the PMREM and repaints: the next frame refreshes the environment
    const env0 = R.stats.envRefreshes; R.canvas.dispatchEvent(new Event('webglcontextrestored')); GTP.game.render(); out.envAfterRestore = R.stats.envRefreshes - env0;
    return out;
  });
  console.log('  render-look p3: ' + JSON.stringify(p3));
  t.assert(p3.starTop > 75, 'stars reach the zenith (QA-A-NGT-08): ' + p3.starTop);
  t.assert(p3.moon.every((m) => m.ang < 3) && p3.moon[0].x !== p3.moon[2].x, 'the moon sits on the moonlight and moves through the night (QA-A-NGT-04): ' + JSON.stringify(p3.moon));
  t.assert(p3.puddles.n >= 10 && p3.puddles.south >= 2 && p3.puddles.over === 0, 'puddles lie all round the focus, none overhang a kerb (QA-A-NGT-02 / 03): ' + JSON.stringify(p3.puddles));
  t.assert(!p3.deckHere || p3.underDeck === 0, 'no rain under the Loop deck (QA-A-NGT-07): ' + JSON.stringify([p3.deckHere, p3.underDeck]));
  if (p3.indoorRain != null) t.assert(!p3.indoorRain && !p3.indoorPuddles, 'no rain or puddles indoors (the folded interiors rule)');
  if (p3.lampSpriteY != null) t.assert(p3.lampSpriteY < 0 && p3.lampPoolY < 0, 'a knocked-over lamp loses its glow (QA-A-ENT-03): ' + JSON.stringify(p3));
  t.assert(p3.envAfterRestore >= 1, 'a WebGL context restore rebuilds the environment map (QAC-50): ' + p3.envAfterRestore);
  const rlE = await t.errors(rl);
  t.assert(rlE.length === 0, 'render-look errors:\n' + rlE.join('\n'));
});
