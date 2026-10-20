/* perf.js: simulation steps per second over a 30 s headless advance and ms per rendered chase-camera frame, then the
 * frame cost of every quality preset (low / medium / high / ultra) at 1280 x 720 and medium again at 1920 x 1080.
 *
 * Honest numbers: GTP.game.render() only queues GL work, so every timed frame here ends with a one-pixel readPixels
 * that waits for the GPU (here SwiftShader, a CPU rasteriser) to finish: `gpuMs` is the whole frame, `cpuMs` the
 * JavaScript side alone. SwiftShader is 20-50x slower than an integrated GPU and scales with pixels and shader work
 * the way one does, so the ratios between presets carry over, the absolute numbers do not. Each preset also reports
 * its work counters (draw calls, triangles, post passes, shadow-map texels drawn, pixels shaded by full-screen passes)
 * for the notes in docs/v03/environment.md. */
'use strict';
const H = require('./_harness');

// one preset at the current viewport: warm (shader variants, render targets, the surface maps), then N timed frames
async function measure(page, preset, N) {
  return page.evaluate(({ preset, N }) => {
    const R = GTP.Render, gl = R.renderer.getContext(), px = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    R.quality.set(preset);
    for (let i = 0; i < 6; i++) { GTP.Input.setLook(20, 0); GTP.game.advance(1 / 30); GTP.game.render(); sync(); }
    let cpu = 0, gpu = 0, calls = 0, tris = 0, passes = 0, far0 = R.stats.farShadow || 0;
    for (let i = 0; i < N; i++) {
      GTP.Input.setLook(20, 0); GTP.game.advance(1 / 30);
      const t0 = performance.now(); GTP.game.render(); const t1 = performance.now(); sync(); const t2 = performance.now();
      cpu += t1 - t0; gpu += t2 - t0; calls += R.stats.calls; tris += R.stats.triangles; passes += GTP.PostFX.enabled ? GTP.PostFX.stats.passes : 0;
    }
    const Q = GTP.C.QUALITY, w = R.renderer.domElement.width, h = R.renderer.domElement.height;
    const farPerFrame = ((R.stats.farShadow || 0) - far0) / N;
    const shadowTexels = Q.shadows ? Q.shadowMap * Q.shadowMap + (Q.cascades >= 2 ? farPerFrame * Q.shadowMapFar * Q.shadowMapFar : 0) : 0;
    return {
      preset, w, h, gpuMs: +(gpu / N).toFixed(1), cpuMs: +(cpu / N).toFixed(1), calls: Math.round(calls / N), tris: Math.round(tris / N), passes: Math.round(passes / N),
      shadowMTexels: +(shadowTexels / 1e6).toFixed(2), postMPixels: +((passes / N) * w * h / 1e6 * 0.55).toFixed(1),
      taa: GTP.PostFX.stats.taa, ssr: GTP.PostFX.stats.ssr, lights: R.lights.points.filter((l) => l.visible).length, grass: R.stats.grass || 0, errors: GTP.errors.length
    };
  }, { preset, N });
}

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
  console.log('  frames (low, chase): ' + JSON.stringify(frames));
  t.assert(frames.calls < 540, 'draw calls per frame stay bounded: ' + frames.calls);
  t.assert(frames.tris < 450000, 'triangles per frame stay bounded: ' + frames.tris);
  // ---- the presets at 1280 x 720 (the counter covers the shadow passes and the post passes at medium and up) ----
  const presets = {};
  for (const preset of ['low', 'medium', 'high', 'ultra']) {
    presets[preset] = await measure(page, preset, 6);
    console.log('  preset ' + preset + ': ' + JSON.stringify(presets[preset]));
    t.assert(presets[preset].errors === 0, preset + ' renders without errors');
    t.assert(presets[preset].calls < (preset === 'low' ? 540 : preset === 'ultra' ? 1500 : 1300), preset + ' draw calls stay bounded: ' + presets[preset].calls);
  }
  t.assert(presets.high.passes >= 10 && presets.high.taa && presets.low.passes === 0, 'high runs the post passes with TAA, low draws straight to the canvas');
  t.assert(presets.medium.shadowMTexels <= 1.1 * 1024 * 1024 * (1 + 1 / 3) / 1e6 + 0.01, 'medium draws at most a 1024 near map and a third of a 1024 far map per frame: ' + presets.medium.shadowMTexels);
  t.assert(!presets.medium.taa && !presets.medium.ssr, 'medium keeps the costly passes (TAA, SSR) off');
  const rel = (p) => +(presets[p].gpuMs / presets.low.gpuMs).toFixed(2);
  console.log('  relative to low (whole frame, SwiftShader): ' + JSON.stringify({ medium: rel('medium'), high: rel('high'), ultra: rel('ultra') }));
  await page.evaluate(() => GTP.Render.quality.set('low'));
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
  await page.close();
  // ---- medium at 1920 x 1080 (the resolution the 60 fps target is quoted at) ----
  const big = await t.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  big.setDefaultTimeout(240000);
  await big.goto(t.url({ seed: 7, quality: 'medium' }));
  await t.waitPlaying(big);
  const m1080 = await measure(big, 'medium', 4);
  console.log('  preset medium @1080p: ' + JSON.stringify(m1080));
  t.assert(m1080.errors === 0 && m1080.calls < 1300, 'medium at 1080p renders within its draw-call budget: ' + m1080.calls);
  await big.close();
});
