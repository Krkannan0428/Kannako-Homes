/* QA-A-GEO-05: the traffic spawner's parking tiles (AI.spawner.parkTiles) include tiles occupied by solid props, so parked cars
 * appear inside them: a hangar-row fleet van around the windsock pole (66,650; seen on seeds 7 and 11), cars under the parked
 * airliners and jetbridges, on the gas pumps, crates, the stadium floodlight mast. No parking tile may hold a solid prop. */
'use strict';
const H = require('../_harness');
H.run('qa_a_geo_05', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, S = GTP.AI.spawner, out = [];
    S.parkTiles.forEach((ti) => {
      const tx = ti % W.w, tz = (ti / W.w) | 0, cx = (tx + 0.5) * 4, cz = (tz + 0.5) * 4;
      W.props.forEach((p) => {
        if (!p.solid || p.fallen || !(p.r > 0) || (p.y || 0) > 1.5) return;
        // a parked car is up to 5.4 m long (van) and 2.1 m wide, along either axis: half extents 2.7 x 1.1 around the tile centre
        if (Math.abs(p.x - cx) < 1.1 + p.r && Math.abs(p.z - cz) < 2.7 + p.r) out.push(p.kind + '@' + p.x.toFixed(1) + ',' + p.z.toFixed(1) + ' tile ' + tx + ',' + tz);
      });
    });
    return out;
  });
  console.log('  ' + r.length + ' ' + JSON.stringify(r.slice(0, 12)));
  t.assert(r.length === 0, r.length + ' parking tiles overlap solid props, e.g. ' + r.slice(0, 8).join('; '));
});
