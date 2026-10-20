/* QA-A-GEO-06: the Ferry to Elsewhere's pier (tiles x 192..193, z 216..221, turned from water into PLAZA) lies outside the port
 * district rectangle, so World.districtAt returns null there and the minimap chip reads 'OPEN WATER' on the pier.
 * Every non-water tile must belong to a district. */
'use strict';
const H = require('../_harness');
H.run('qa_a_geo_06', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, T = W.T, out = [];
    for (let i = 0; i < W.w * W.h; i++) if (W.tiles[i] !== T.WATER && !W.districtAt((i % W.w + 0.5) * 4, (((i / W.w) | 0) + 0.5) * 4)) out.push((i % W.w) + ',' + ((i / W.w) | 0));
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.length === 0, 'land tiles without a district: ' + r.join(' '));
});
