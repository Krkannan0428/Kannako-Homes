/* QA-A-TRF-04: a bus on the campus avenue (z 272..288) drives off the west end of the city into the sea.
 * The avenue's last junction (x 36..44) only crosses a two-lane street, so a bus (no right turns, left only avenue to
 * avenue) is left with 'straight' into the one-tile stub at x 32..36; junctionPlan() keeps straight even for a stub
 * (weight 0.15) and the dead-end stop only starts once the bus is already in the stub, so it overruns the kerb at ~9 m/s,
 * and the off-road recovery (forward only, toward a road point behind it) arcs it into the water, where it sinks and
 * vanishes. Expect the bus never to enter water and never to leave the roadway for more than a second. */
'use strict';
const H = require('../_harness');

H.run('qa_a_trf_04 buses never drive into the sea at a road stub', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, T = W.T, S = GTP.AI.spawner;
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0; GTP.C.AI.parkedTarget = 0;
    GTP.Entities.list.forEach((e) => { if (e.kind === 'vehicle' || (e.kind === 'ped' && e.ai)) e.removed = true; });
    GTP.game.debug.teleport(100, 290); GTP.game.advance(0.1);
    const v = S.placeTraffic({ x: 140, z: 278, y: 0, tx: 35, tz: 69, axis: 'h', dir: -1, laneC: 278, deck: false }, 'bus');
    let water = false, off = 0, maxOff = 0, minX = 1e9;
    for (let k = 0; k < 40 * 4; k++) {
      GTP.game.advance(0.25);
      if (v.removed) break;
      const tt = W.tileAt(v.x, v.z);
      if (tt === T.WATER) water = true;
      if (tt !== T.ROAD && tt !== T.BRIDGE) { off += 0.25; maxOff = Math.max(maxOff, off); } else off = 0;
      minX = Math.min(minX, v.x);
    }
    return { removed: !!v.removed, water, maxOff, minX: +minX.toFixed(1), end: [+v.x.toFixed(1), +v.z.toFixed(1), +v.y.toFixed(2)] };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(!r.water, 'the bus never enters the water (min x ' + r.minX + ', end ' + JSON.stringify(r.end) + ')');
  t.assert(r.maxOff <= 1, 'the bus never leaves the roadway for more than 1 s: ' + r.maxOff + ' s');
  t.assert(!r.removed, 'the bus is not lost (sunk/recycled) within 40 s');
});
