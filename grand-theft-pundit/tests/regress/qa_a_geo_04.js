/* QA-A-GEO-04: Goldplate Links' lot spans Clubhouse Drive (z tiles 45..46): its first flag pole (solid, r 0.2, at 528,182) and its
 * standing 'GOLDPLATE LINKS: PAR 10' sign (post at 551.4,182) stand in the westbound lane, and on other seeds a lot tree lands
 * there too. A car driving west hits the pole at 24 m/s and stops dead. No solid prop and no sign post may stand on a ROAD tile. */
'use strict';
const H = require('../_harness');
H.run('qa_a_geo_04', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, T = W.T, out = [];
    W.props.forEach((q) => {
      if (q.hidden || q.kind === 'ramp_prop' || q.kind === 'gantry' || q.kind === 'edgelight') return;
      if ((q.y || 0) > 3) return;
      const post = (q.kind === 'sign' || q.kind === 'billboard') && (q.standing || q.pole || q.kind === 'billboard');
      if (!(q.solid && q.r > 0) && !post) return;
      if (W.tileAt(q.x, q.z) === T.ROAD) out.push(q.kind + (q.text ? ' "' + q.text + '"' : '') + '@' + q.x.toFixed(1) + ',' + q.z.toFixed(1));
    });
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.length === 0, 'props standing on road lanes: ' + r.join(', '));
});
