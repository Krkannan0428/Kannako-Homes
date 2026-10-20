/* QA-A-NGT-04: the moon and the moonlight disagree. At night (Render.night > 0.5) updateEnvironment points the
 * directional light from a fixed (-0.3, 0.7, 0.4) (south-west, high), while frame() places the moon sprite at
 * (-sunDir.x, 0.6, -sunDir.z), i.e. mirrored into the north-east: the visible moon is 80 degrees away from the
 * light that casts the night shadows and lights the facades, and it never moves between 21:00 and 05:00.
 * Measures the angle between the moon sprite (from the sky dome centre) and the night light direction. */
'use strict';
const H = require('../_harness');

H.run('qa_a_ngt_04 the moon sits where the moonlight comes from', async (t) => {
  const ctx = await t.boot({ seed: 7, clock: 22, weather: 'clear' });
  const r = await ctx.page.evaluate(() => {
    const R = GTP.Render, out = {};
    for (const h of [22, 1, 3]) {
      GTP.game.debug.setClock(h); GTP.game.render();
      const L = R.lights, sk = R.sky;
      const md = sk.moon.position.clone().sub(sk.dome.position).normalize();
      const ld = L.sun.position.clone().sub(L.target.position).normalize();
      out[h] = { angle: Math.round(Math.acos(Math.max(-1, Math.min(1, md.dot(ld)))) * 180 / Math.PI), night: +R.night.toFixed(2), moonOpacity: +sk.moon.material.opacity.toFixed(2) };
    }
    return out;
  });
  console.log('  moon vs moonlight: ' + JSON.stringify(r));
  [22, 1, 3].forEach((h) => t.assert(r[h].night > 0.9 && r[h].moonOpacity > 0.5, 'night with a visible moon at ' + h + ':00: ' + JSON.stringify(r[h])));
  [22, 1, 3].forEach((h) => t.assert(r[h].angle < 25, 'at ' + h + ':00 the moonlight comes from the moon (angle ' + r[h].angle + ' deg)'));
});
