/* QA-A-TRF-03: a traffic car that finds itself on the oncoming side takes that lane as its own and keeps driving the
 * wrong way. planAhead() copies the lane under the car (ai.lane / ai.laneC = laneInfo(tile).center) without checking
 * that the lane's direction matches ai.dir, so after a swerve or an unfinished three-point turn the car drives on in the
 * oncoming lane until it meets a car head-on (the standoffs behind QA-A-TRF-01).
 * Setup: a sedan heading north (dir -1) on the street at x 232..236, but standing in the southbound lane (x 230).
 * Expect it to steer back to its own lane centre (x 234) within 3 s. */
'use strict';
const H = require('../_harness');

H.run('qa_a_trf_03 cars never adopt an oncoming lane', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, S = GTP.AI.spawner;
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0; GTP.C.AI.parkedTarget = 0;
    GTP.Entities.list.forEach((e) => { if (e.kind === 'vehicle' || (e.kind === 'ped' && e.ai)) e.removed = true; });
    GTP.game.debug.teleport(246, 270); GTP.game.advance(0.1);
    const v = S.placeTraffic({ x: 230, z: 262, y: 0, tx: 57, tz: 65, axis: 'v', dir: -1, laneC: 234, deck: false }, 'sedan');
    const laneDir = () => { const tx = Math.floor(v.ai.laneC / 4), tz = Math.floor(v.z / 4), b = W.laneV[tz * W.w + tx]; if (!b) return 0; const l = b >> 4, w = b & 15; return l < w / 2 ? 1 : -1; };
    const out = [];
    for (let k = 0; k < 30; k++) { GTP.game.advance(0.1); if (k % 5 === 4) out.push({ t: (k + 1) / 10, x: +v.x.toFixed(2), z: +v.z.toFixed(1), dir: v.ai.dir, laneC: v.ai.laneC, laneDir: laneDir(), plan: v.ai.plan && v.ai.plan.kind }); }
    return out;
  });
  r.forEach((s) => console.log('  ' + JSON.stringify(s)));
  const last = r[r.length - 1];
  t.assert(r.every((s) => s.laneDir === 0 || s.laneDir === s.dir || (s.plan && s.plan !== 'straight' && s.plan !== 'cruise')), 'the lane the car follows always runs in its own direction');
  t.assert(Math.abs(last.x - 234) < 1.0, 'back in its own (northbound) lane after 3 s: x ' + last.x + ' (lane centre 234)');
});
