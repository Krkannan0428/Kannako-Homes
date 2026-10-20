/* QA-A-VIS-03: at dusk and dawn the warm horizon band on the sun's side of the sky is a radial gradient drawn into a
 * rectangle that starts at 0.3 of the sky canvas height, so the band ends in a hard edge 36 degrees up: a dark,
 * sharp arc across the top of the screen whenever the player looks toward a low sun (18:00-19:30, 6:00-9:00).
 * Paints the sky at 18:36 and 06:48 and measures the largest one-row luminance step in the sky canvas column under
 * the sun (the sun disc itself excluded); a smooth sky changes by a few levels per row. */
'use strict';
const H = require('../_harness');

H.run('qa_a_vis_03 dusk sky has no hard band edge', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const res = await ctx.page.evaluate(() => {
    const D = GTP.game.debug, R = GTP.Render, A = GTP.Assets, out = [];
    for (const clock of [18.6, 6.8, 12]) {
      D.setClock(clock);
      const cv = A.skyCanvas, W = cv.width, Hh = cv.height, d = R.lights.sunDir;
      const u = Math.round((Math.atan2(d.z, d.x) / (Math.PI * 2) + 0.5) * W) % W;
      const col = cv.getContext('2d').getImageData(u, 0, 1, Hh).data, L = [];
      for (let y = 0; y < Hh; y++) L.push((col[y * 4] + col[y * 4 + 1] + col[y * 4 + 2]) / 3);
      const sv = Math.round((1 - (Math.asin(d.y) / Math.PI + 0.5)) * Hh);
      let best = 0, at = -1;
      for (let y = Math.round(0.05 * Hh); y < Math.round(0.45 * Hh); y++) { if (Math.abs(y - sv) < 20) continue; const s = Math.abs(L[y + 1] - L[y]); if (s > best) { best = s; at = y; } }
      out.push({ clock, maxStep: +best.toFixed(1), atFrac: +(at / Hh).toFixed(3) });
    }
    return out;
  });
  console.log('  sky column steps: ' + JSON.stringify(res));
  res.forEach((r) => t.assert(r.maxStep < 9, 'the sky at ' + r.clock + ' h has no hard edge: a ' + r.maxStep + '-level jump between two rows at ' + r.atFrac + ' of the sky height'));
});
