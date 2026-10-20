/* QA-A-GEO-01: a landmark building (memo_press, Monday Memo Print Works) is stamped over Coupon Code Circle (tiles x 36..42, z 121..122):
 * the road's lanes run straight into the Print Works wall. Every tile of every road segment must stay drivable (ROAD/BRIDGE/RAMP)
 * or be water the segment does not bridge; no BUILDING tile may carry a lane byte or a road id. */
'use strict';
const H = require('../_harness');
H.run('qa_a_geo_01', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, T = W.T, out = { segTiles: [], laneOnBuilding: 0 };
    W.roads.forEach((s) => {
      const width = s.cls === 'avenue' || s.cls === 'highway' ? 4 : 2, lo = s.at - (width >> 1);
      for (let a = s.from; a <= s.to; a++) for (let l = 0; l < width; l++) {
        const tx = s.axis === 'h' ? a : lo + l, tz = s.axis === 'h' ? lo + l : a;
        if (!W.inBounds(tx, tz)) continue;
        if (W.tile(tx, tz) === T.BUILDING) out.segTiles.push(s.name + '@' + tx + ',' + tz);
      }
    });
    for (let i = 0; i < W.w * W.h; i++) if (W.tiles[i] === T.BUILDING && (W.laneH[i] || W.laneV[i])) out.laneOnBuilding++;
    return out;
  });
  console.log('  ' + JSON.stringify({ n: r.segTiles.length, sample: r.segTiles.slice(0, 6), laneOnBuilding: r.laneOnBuilding }));
  t.assert(r.segTiles.length === 0, 'road segment tiles covered by buildings: ' + r.segTiles.length + ' e.g. ' + r.segTiles.slice(0, 6).join(', '));
  t.assert(r.laneOnBuilding === 0, 'BUILDING tiles still carrying a lane byte: ' + r.laneOnBuilding);
});
