/* perf.js: simulation steps per second over a 30 s headless advance and ms per rendered chase-camera
 * frame, then ms per frame at the low / medium / high quality presets (post-processing, shadows, lights).
 * SwiftShader numbers are only relative: report them and watch for regressions. */
'use strict';
const H = require('./_harness');

H.run('perf', async (t) => {
  // boot: page load to state playing (headless: assets, the 224 x 224 generation, the synchronous prebuild of the nine chunks)
  const b0 = Date.now();
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  const boot = await page.evaluate(() => ({ generateMs: Math.round(GTP.World.generateMs || 0), profile: GTP.game.bootTimes || null, chunks: GTP.Render.chunks.size, entities: GTP.Entities.list.length, tiles: GTP.World.w + 'x' + GTP.World.h, landmarks: GTP.World.landmarks.length, props: GTP.World.props.length, buildings: GTP.World.buildings.length }));
  boot.wallMs = Date.now() - b0;
  console.log('  boot: ' + JSON.stringify(boot));
  // the profile (ms): render = Assets.init + the scene, newGame = generate + entities + the AI warm-up, loading = the nine-chunk prebuild,
  // first = the first frame (shader compiles), atBoot = page load to the end of boot (script parse included)
  t.assert(boot.generateMs > 0 && boot.generateMs < 1500, 'World.generate stays quick on the bigger map: ' + boot.generateMs + ' ms');
  t.assert(boot.profile && boot.profile.newGame < 6000 && boot.profile.loading < 20000, 'the boot stages stay bounded: ' + JSON.stringify(boot.profile));
  t.assert(boot.wallMs < 120000, 'the headless boot finishes in a reasonable time: ' + boot.wallMs + ' ms');
  const sim = await page.evaluate(() => {
    GTP.Input.set('forward', true); GTP.Input.set('run', true);
    const t0 = performance.now();
    GTP.game.advance(30);
    const ms = performance.now() - t0;
    GTP.Input.set('forward', false); GTP.Input.set('run', false);
    const p = GTP.game.player;
    return { ms: Math.round(ms), stepsPerSec: Math.round(1800 / (ms / 1000)), x: Math.round(p.x), z: Math.round(p.z), entities: GTP.Entities.list.length, errors: GTP.errors.length };
  });
  console.log('  sim: ' + JSON.stringify(sim));
  t.assert(sim.stepsPerSec > 600, 'simulation keeps up (>600 steps/s headless): ' + sim.stepsPerSec);
  const frames = await page.evaluate(() => {
    GTP.game.render();   // warm: chunk builds + shader compiles
    const N = 12, t0 = performance.now();
    for (let i = 0; i < N; i++) { GTP.Input.setLook(40, 0); GTP.game.advance(1 / 30); GTP.game.render(); }
    const per = (performance.now() - t0) / N;
    const r = GTP.Render.stats;
    return { msPerFrame: +per.toFixed(1), tris: r.triangles, calls: r.calls, chunks: GTP.Render.chunks.size, preset: GTP.C.QUALITY.preset, errors: GTP.errors.length };
  });
  console.log('  frames (low): ' + JSON.stringify(frames));
  t.assert(frames.calls < 540, 'draw calls per frame stay bounded: ' + frames.calls);
  t.assert(frames.tris < 450000, 'triangles per frame stay bounded: ' + frames.tris);
  // the presets, relative to each other under SwiftShader (no absolute assertion: a real GPU is 20-50x faster here)
  const presets = {};
  for (const preset of ['low', 'medium', 'high']) {
    presets[preset] = await page.evaluate((preset) => {
      GTP.Render.quality.set(preset);
      GTP.game.render(); GTP.game.render();   // warm: shader variants, render targets, surface maps
      const N = 5, t0 = performance.now();
      for (let i = 0; i < N; i++) { GTP.Input.setLook(30, 0); GTP.game.advance(1 / 30); GTP.game.render(); }
      const per = (performance.now() - t0) / N, r = GTP.Render.stats;
      return { msPerFrame: +per.toFixed(1), renderMs: +r.frameMs.toFixed(1), calls: r.calls, tris: r.triangles, post: GTP.PostFX.enabled, passes: GTP.PostFX.stats.passes, shadows: GTP.Render.renderer.shadowMap.enabled, lights: GTP.Render.lights.points.filter((l) => l.visible).length, errors: GTP.errors.length };
    }, preset);
    console.log('  frames (' + preset + '): ' + JSON.stringify(presets[preset]));
    t.assert(presets[preset].errors === 0, preset + ' renders without errors');
    // the counter covers the shadow pass and the post passes at medium / high (about twice the scene's own calls)
    t.assert(presets[preset].calls < (preset === 'low' ? 540 : 1300), preset + ' draw calls stay bounded: ' + presets[preset].calls);
  }
  t.assert(presets.high.post && presets.high.passes >= 10 && !presets.low.post, 'high runs the post passes, low draws straight to the canvas');
  await page.evaluate(() => GTP.Render.quality.set('low'));
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
