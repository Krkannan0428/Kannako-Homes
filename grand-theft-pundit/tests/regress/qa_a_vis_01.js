/* QA-A-VIS-01: flat roofs map the roof-gravel band across the building with u and v swapped: v (the band's 160 px
 * height) spans the whole width while u repeats b.w / 8 times along the depth, so the gravel is stretched 5-40x
 * into streaks, and the band's bottom edge (next to the swatch band) bleeds a rainbow fringe along one parapet.
 * Builds flat roofs of several sizes with Render._roof and measures the texel density along x and z of the roof quad. */
'use strict';
const H = require('../_harness');

H.run('qa_a_vis_01 flat roof gravel is not stretched', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const res = await ctx.page.evaluate(() => {
    const R = GTP.Render, A = GTP.Assets, GB = GTP.GeoBuilder, out = [];
    const tex = A.facade('industrial').day.image, TW = tex.width, TH = tex.height;
    for (const [w, d] of [[30, 20], [20, 30], [12, 12], [40, 16]]) {
      const g = new GB({ color: true });
      R._roof(g, { w, d, roof: 'flat', seed: 5, style: 'industrial', floors: 3, special: null }, A, 0, 0, w, d, 10, null);
      // the roof top is the first upward-facing quad at y = top spanning the footprint
      let q = -1;
      for (let k = 0; k + 3 < g.n; k += 4) { if (g.nor[k * 3 + 1] > 0.99 && Math.abs(g.pos[k * 3 + 1] - 10) < 1e-6) { q = k; break; } }
      if (q < 0) { out.push({ w, d, err: 'no roof quad' }); continue; }
      // gradient of (u px, v px) per metre along x and along z, from three corners
      const P = (i) => [g.pos[(q + i) * 3], g.pos[(q + i) * 3 + 2]], T = (i) => [g.uv[(q + i) * 2] * TW, g.uv[(q + i) * 2 + 1] * TH];
      let gx = null, gz = null;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        if (i === j) continue; const a = P(i), b = P(j), ta = T(i), tb = T(j);
        const dx = b[0] - a[0], dz = b[1] - a[1];
        if (Math.abs(dz) < 1e-6 && Math.abs(dx) > 1) gx = Math.hypot(tb[0] - ta[0], tb[1] - ta[1]) / Math.abs(dx);
        if (Math.abs(dx) < 1e-6 && Math.abs(dz) > 1) gz = Math.hypot(tb[0] - ta[0], tb[1] - ta[1]) / Math.abs(dz);
      }
      out.push({ w, d, pxPerMx: +gx.toFixed(1), pxPerMz: +gz.toFixed(1), ratio: +(Math.max(gx, gz) / Math.min(gx, gz)).toFixed(2) });
    }
    return out;
  });
  console.log('  roof texel density: ' + JSON.stringify(res));
  res.forEach((r) => t.assert(!r.err && r.ratio < 1.6, 'a ' + r.w + ' x ' + r.d + ' m flat roof has square gravel texels (x ' + r.pxPerMx + ' px/m vs z ' + r.pxPerMz + ' px/m, ratio ' + r.ratio + ')'));
});
