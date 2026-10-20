/* QA-A-VIS-06: sign and billboard textures are painted at only three aspect ratios (1, 2 or 4) while the sign planes
 * are up to 13:1, so the lettering on about half of the signs is stretched sideways (THE YELL NETWORK 3.2x,
 * CUSTOMS: NOTHING TO DECLARE 3.1x, GOLDPLATE 2.8x, GOLDPLATE INTERNATIONAL 2.7x, THE HEIRLOOM CLUB 2x).
 * Builds the chunks around the whole city and compares each sign plane's aspect with its texture's aspect. */
'use strict';
const H = require('../_harness');

H.run('qa_a_vis_06 sign text is not stretched', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const R = GTP.Render, W = GTP.World, T = GTP.C.TILE;
    R.prebuild(W.w * T / 2, W.h * T / 2, 2000);
    const rows = [];
    R.scene.traverse((o) => {
      if (!o.isMesh || o.name !== 'sign' || !o.material || !o.material.map || !o.geometry.parameters) return;
      const g = o.geometry.parameters, img = o.material.map.image;
      const plane = g.width / g.height, tex = img.width / img.height, s = plane / tex;
      rows.push({ s: +s.toFixed(2), plane: +plane.toFixed(2), tex: +tex.toFixed(2) });
    });
    const bad = rows.filter((x) => x.s > 1.25 || x.s < 0.8).sort((a, b) => Math.abs(Math.log(b.s)) - Math.abs(Math.log(a.s)));
    return { n: rows.length, bad: bad.length, worst: bad.slice(0, 5) };
  });
  console.log('  signs: ' + JSON.stringify(r));
  t.assert(r.n > 50, 'signs were built: ' + r.n);
  t.assert(r.bad === 0, r.bad + ' of ' + r.n + ' sign planes stretch their texture by more than 25%, worst: ' + JSON.stringify(r.worst));
});
