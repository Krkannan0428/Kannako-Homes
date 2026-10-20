/* QA-A-TRF-01: city traffic locks up for good within a few minutes.
 * Stand at the Chyron Center (318, 250) for 240 s of game time: in the current build nearly every AI car ends up
 * standing still (39 of 40 after 240 s), parked head-on against another car or queued behind one, because a car
 * blocked by another vehicle never gives up or backs out, and the frozen cars keep the 40-car budget so no fresh
 * traffic spawns. Expect traffic to keep flowing: most driven cars moving and no car stationary for over 60 s. */
'use strict';
const H = require('../_harness');

H.run('qa_a_trf_01 traffic never gridlocks', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    GTP.game.debug.teleport(318, 250);
    const still = new Map(); let maxStill = 0, worst = null;
    for (let k = 0; k < 240 * 2; k++) {
      GTP.game.advance(0.5);
      for (const v of GTP.Entities.list) {
        if (v.removed || v.kind !== 'vehicle' || !v.ai || v.ai.kind !== 'traffic' || !v.driver || v.wreck || v.hasPlayer()) continue;
        const s = Math.abs(v.speed) < 0.3 ? (still.get(v.id) || 0) + 0.5 : 0; still.set(v.id, s);
        if (s > maxStill) { maxStill = s; worst = { id: v.id, x: +v.x.toFixed(1), z: +v.z.toFixed(1), plan: v.ai.plan && v.ai.plan.kind, blockedBy: v.ai.capReason && v.ai.capReason.id }; }
      }
    }
    const L = GTP.Entities.list.filter((v) => !v.removed && v.kind === 'vehicle' && v.ai && v.ai.kind === 'traffic' && v.driver && !v.wreck && !v.hasPlayer());
    return { n: L.length, moving: L.filter((v) => Math.abs(v.speed) > 1).length, maxStill, worst };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.n >= 20, 'traffic present: ' + r.n);
  t.assert(r.moving >= r.n * 0.5, 'at least half the traffic is moving after 240 s: ' + r.moving + ' of ' + r.n);
  t.assert(r.maxStill <= 60, 'no traffic car stands still for more than 60 s: ' + r.maxStill + ' s ' + JSON.stringify(r.worst));
});
