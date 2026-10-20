/* QA-A-NGT-05: the street-lamp light pool (high: 8 point lights, ultra: 12) pops. _updateLightPool re-picks the
 * lamps nearest the focus every 0.3 s and moves each light straight to its new lamp, so a lamp that falls out of
 * the set loses a light of intensity ~1.0-1.35 from one frame to the next (its crossing / facade goes from warm-lit to
 * blue-dark 40 m ahead), and the newcomer pops in at full strength. Driving at 30 m/s that is ~4 pops a second; and
 * a third of the slots light lamps behind the camera.
 * Moves the player along an avenue at 30 m/s at night and records every lamp that leaves the pool with the
 * intensity it had the frame before; a pool that fades lamps in and out drops none above 0.3. */
'use strict';
const H = require('../_harness');

H.run('qa_a_ngt_05 lamp lights fade instead of popping', async (t) => {
  const ctx = await t.boot({ seed: 7, clock: 22, weather: 'clear' });
  const r = await ctx.page.evaluate(() => {
    const d = GTP.game.debug, R = GTP.Render, L = R.lights, W = GTP.World;
    GTP.C.QUALITY.pointLights = 8;   // the high preset's pool, without paying for a high-preset render
    d.setClock(22); d.followCam();
    const p = W.nearestRoadPoint(322, 254);
    let x = p.x, z = p.z; const dx = p.dx, dz = p.dz;
    d.teleport(x, z); GTP.game.advance(0.2);
    for (let i = 0; i < 12; i++) R._updateLightPool(1 / 30);
    const key = (l) => Math.round(l.position.x * 10) + ',' + Math.round(l.position.z * 10);
    let prev = L.points.slice(0, 8).map((l) => ({ k: key(l), i: l.intensity }));
    let steps = 0, out = 0, popped = 0, worst = 0;
    for (let f = 0; f < 150; f++) {
      x += dx * 1.0; z += dz * 1.0;   // 30 m/s
      if (W.solidAt && W.solidAt(x, z)) break;
      d.teleport(x, z); GTP.game.advance(1 / 30); R._updateLightPool(1 / 30); steps++;
      const now = L.points.slice(0, 8).map((l) => ({ k: key(l), i: l.intensity }));
      const nk = new Set(now.filter((o) => o.i > 0).map((o) => o.k));
      prev.forEach((o) => { if (o.i > 0 && !nk.has(o.k)) { out++; worst = Math.max(worst, o.i); if (o.i > 0.3) popped++; } });
      prev = now;
    }
    return { steps, out, popped, worst: +worst.toFixed(2), lit: +(R.lit || 0).toFixed(2) };
  });
  console.log('  pool: ' + JSON.stringify(r));
  t.assert(r.lit > 0.9 && r.steps > 60, 'night and a long enough run: ' + JSON.stringify(r));
  t.assert(r.out > 0, 'lamps leave the pool along the way: ' + JSON.stringify(r));
  t.assert(r.popped === 0, r.popped + ' of ' + r.out + ' lamps dropped out of the pool while lit (up to intensity ' + r.worst + ')');
});
