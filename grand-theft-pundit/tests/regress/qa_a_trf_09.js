/* QA-A-TRF-09: two signalled junction boxes are only half stamped in the lane field, so traffic in the missing half never
 * sees the junction and drives through on red at cruise speed:
 *  - Heirloom Heights (uptown) T-junction at x 724..732, z 420..428 (tiles 181..182, 105..106): tiles (182, 105..106)
 *    carry no laneH, so northbound cars in lane x 730 cruise through at 11 m/s on red;
 *  - the foot of the Jet Ramp on the Strip, x 276..284, z 420..428 (tiles 69..70, 105..106): tiles (69..70, 105) carry no
 *    laneV, so westbound cars in lane z 422 drive through at 10 m/s on red.
 * Expect every junction box to be a full rectangle of tiles with both lane bytes, and the northbound car to stop. */
'use strict';
const H = require('../_harness');

H.run('qa_a_trf_09 junction boxes are complete and every lane stops on red', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, S = GTP.AI.spawner, w = W.w, bad = [], seen = new Set();
    for (let tz = 0; tz < W.h; tz++) for (let tx = 0; tx < w; tx++) {
      const i = tz * w + tx, h = W.laneH[i], v = W.laneV[i]; if (!h || !v) continue;
      const z0 = tz - (h >> 4), x0 = tx - (v >> 4), key = x0 + ',' + z0; if (seen.has(key)) continue; seen.add(key);
      for (let z = z0; z < z0 + (h & 15); z++) for (let x = x0; x < x0 + (v & 15); x++) { const j = z * w + x; if (!(W.laneH[j] && W.laneV[j])) bad.push([x, z]); }
    }
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0; GTP.C.AI.parkedTarget = 0;
    GTP.Entities.list.forEach((x) => { if (x.kind === 'vehicle' || (x.kind === 'ped' && x.ai)) x.removed = true; });
    GTP.game.debug.teleport(744, 462); GTP.game.advance(0.1);
    let g = 0; while (!(W.signalPhase(181, 105, GTP.game.time.t) === 'ew' && W.signalPhase(181, 105, GTP.game.time.t - 0.1) !== 'ew') && g++ < 2000) GTP.game.advance(1 / 60);
    const car = S.placeTraffic({ x: 730, z: 462, y: 0, tx: 182, tz: 115, axis: 'v', dir: -1, laneC: 730, deck: false }, 'sedan');
    let minZ = 1e9; for (let k = 0; k < 40; k++) { GTP.game.advance(0.2); if (W.signalPhase(181, 105, GTP.game.time.t) === 'ew') minZ = Math.min(minZ, car.z); }
    return { bad, minZ: +minZ.toFixed(1) };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.bad.length === 0, 'every junction box is complete: tiles missing a lane byte ' + JSON.stringify(r.bad));
  t.assert(r.minZ > 428, 'the northbound car in lane x 730 waits at the red light before the box (z 420..428): reached z ' + r.minZ);
});
