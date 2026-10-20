/* QA-A-VIS-04: street and lawn trees are placed without regard to the buildings next to them: about 30% of the city's
 * trees push their canopy more than 0.6 m into a filler building's wall (Clarity Close, Monday Memo Mews, uptown),
 * so the leaves clip through facades and windows.
 * Measures each tree's canopy radius (from the tree geometry, scaled) against the nearest filler building footprint. */
'use strict';
const H = require('../_harness');

H.run('qa_a_vis_04 tree canopies stay out of building walls', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, pos = GTP.Assets.prop('tree').geometry.attributes.position;
    let rC = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 2.2) rC = Math.max(rC, Math.hypot(pos.getX(i), pos.getZ(i)));
    let trees = 0, clip = 0; const ex = [];
    W.props.forEach((p) => {
      if (p.kind !== 'tree' || p.hidden) return; trees++;
      const rad = rC * (p.scale || 1);
      for (const b of W.buildings) {
        if (b.landmark || b.h <= 2.5) continue;
        const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w)), dz = Math.max(b.z - p.z, 0, p.z - (b.z + b.d));
        if (Math.hypot(dx, dz) < rad - 0.6) { clip++; if (ex.length < 5) ex.push([+p.x.toFixed(1), +p.z.toFixed(1)]); break; }
      }
    });
    return { canopy: +rC.toFixed(2), trees, clip, frac: clip / trees, ex };
  });
  console.log('  trees: ' + JSON.stringify(r));
  t.assert(r.frac < 0.03, r.clip + ' of ' + r.trees + ' trees (' + (r.frac * 100).toFixed(0) + '%) push their canopy more than 0.6 m into a building, e.g. ' + JSON.stringify(r.ex));
});
