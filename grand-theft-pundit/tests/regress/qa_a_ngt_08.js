/* QA-A-NGT-08: the night sky has a starless hole overhead. Render._initSky scatters the 700 stars at elevations
 * e = 0.06 + random * 0.92 radians, i.e. 3.4 to 56 degrees, so the 34-degree cap of sky around the zenith has no stars
 * at all: looking up on a clear night (or from a car on a hill / the deck) shows a blank disc ringed by stars.
 * Reads the star geometry and requires stars near the zenith. */
'use strict';
const H = require('../_harness');

H.run('qa_a_ngt_08 stars reach the zenith', async (t) => {
  const ctx = await t.boot({ seed: 7, clock: 23, weather: 'clear' });
  const r = await ctx.page.evaluate(() => {
    const pos = GTP.Render.sky.stars.geometry.attributes.position;
    let maxEl = 0, above60 = 0, above75 = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), el = Math.atan2(y, Math.hypot(x, z)) * 180 / Math.PI;
      maxEl = Math.max(maxEl, el); if (el > 60) above60++; if (el > 75) above75++;
    }
    return { n: pos.count, maxEl: +maxEl.toFixed(1), above60, above75 };
  });
  console.log('  stars: ' + JSON.stringify(r));
  // a uniform sky would put about 13% of the stars above 60 degrees and 3% above 75
  t.assert(r.above60 >= r.n * 0.05, 'stars above 60 degrees: ' + r.above60 + ' of ' + r.n + ' (highest ' + r.maxEl + ' deg)');
  t.assert(r.above75 >= 5, 'stars above 75 degrees: ' + r.above75);
});
