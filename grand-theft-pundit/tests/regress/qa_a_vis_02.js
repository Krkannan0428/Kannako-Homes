/* QA-A-VIS-02: the runway's dashed centreline is painted half in each of the two middle tile rows, and the two
 * halves do not line up: the dash pattern of runway_center is not symmetric, and the second row shows it rotated
 * 180 degrees, so every dash has a 0.3 m step where the halves meet.
 * Samples the ground atlas in world space just north and just south of the centreline seam along the whole runway
 * and requires the dash coverage of the two halves to agree. */
'use strict';
const H = require('../_harness');

H.run('qa_a_vis_02 runway centreline halves line up', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const R = GTP.Render, A = GTP.Assets, W = GTP.World, TILE = GTP.C.TILE;
    const cv = A.atlasCanvas, img = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const lm = W.landmark('airport_runway'), lot = lm.lot, s = lm.def.strip, zc = Math.floor((s.z0 + s.z1) / 2);
    // texel colour at world (x, z): classify the tile, map the local position through the cell's corner uvs [NW, NE, SE, SW]
    function sample(x, z) {
      const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE), c = R._classify(tx, tz), uv = A.cellUVs(c[0], c[1]);
      const fx = x / TILE - tx, fz = z / TILE - tz;
      const u = (uv[0][0] * (1 - fx) + uv[1][0] * fx) * (1 - fz) + (uv[3][0] * (1 - fx) + uv[2][0] * fx) * fz;
      const v = (uv[0][1] * (1 - fx) + uv[1][1] * fx) * (1 - fz) + (uv[3][1] * (1 - fx) + uv[2][1] * fx) * fz;
      const px = Math.min(cv.width - 1, Math.floor(u * cv.width)), py = Math.min(cv.height - 1, Math.floor((1 - v) * cv.height));
      const i = (py * cv.width + px) * 4; return (img[i] + img[i + 1] + img[i + 2]) / 3;
    }
    const seam = (zc + 1) * TILE;   // the boundary between the two middle rows
    let n = 0, north = 0, south = 0, mismatch = 0;
    // skip the threshold bars and the "10"s at each end
    for (let x = (lot.x + 4) * TILE; x < (lot.x + lot.w - 4) * TILE; x += 0.1) {
      const a = sample(x, seam - 0.06) > 150, b = sample(x, seam + 0.06) > 150;
      n++; if (a) north++; if (b) south++; if (a !== b) mismatch++;
    }
    return { n, north, south, mismatch, frac: mismatch / n };
  });
  console.log('  centreline samples: ' + JSON.stringify(r));
  t.assert(r.north > r.n * 0.2 && r.south > r.n * 0.2, 'the centreline is painted on both sides of the seam: ' + JSON.stringify(r));
  t.assert(r.frac < 0.03, 'the dashes of the two halves line up (north and south of the seam disagree at ' + (r.frac * 100).toFixed(1) + '% of the runway length): ' + JSON.stringify(r));
});
