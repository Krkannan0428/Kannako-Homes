/* perf.js: simulation steps per second over a 30 s headless advance and ms per rendered chase-camera
 * frame. SwiftShader numbers are only relative: report them and watch for regressions. */
'use strict';
const H = require('./_harness');

H.run('perf', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
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
    return { msPerFrame: +per.toFixed(1), tris: r.triangles, calls: r.calls, chunks: GTP.Render.chunks.size, errors: GTP.errors.length };
  });
  console.log('  frames: ' + JSON.stringify(frames));
  t.assert(frames.calls < 500, 'draw calls per frame stay bounded: ' + frames.calls);
  t.assert(frames.tris < 400000, 'triangles per frame stay bounded: ' + frames.tris);
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
