/* QA-A-TRF-02: a car queued behind another car at a red light pulls out into the oncoming lane.
 * Two cars northbound on the street at x 232..236 (lane centre x 234), the first waiting at the red light of the
 * junction at z 180..188 (tiles 57..58, 45..46), the second right behind it. After K.stuckTime (3 s) the second car
 * sets ai.swerve (3.2 m to the left) while the light is still red; when the light turns green it pulls out into the
 * southbound lane (centre x 230) and drives up the oncoming side to the junction.
 * Expect the follower to wait in its own lane (no swerve) and to follow the lead car through on green (offset under 1 m). */
'use strict';
const H = require('../_harness');

H.run('qa_a_trf_02 no swerve into the oncoming lane at a red light', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, S = GTP.AI.spawner;
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0; GTP.C.AI.parkedTarget = 0;
    GTP.Entities.list.forEach((e) => { if (e.kind === 'vehicle' || (e.kind === 'ped' && e.ai)) e.removed = true; });
    GTP.game.debug.teleport(246, 214); GTP.game.advance(0.1);
    // wait for the start of the east-west phase (northbound traffic on red for 10 s)
    let guard = 0; while (!(W.signalPhase(58, 45, GTP.game.time.t) === 'ew' && W.signalPhase(58, 45, GTP.game.time.t - 0.1) === 'ns') && guard++ < 2000) GTP.game.advance(1 / 60);
    const mk = (z) => S.placeTraffic({ x: 234, z, y: 0, tx: 58, tz: Math.floor(z / 4), axis: 'v', dir: -1, laneC: 234, deck: false }, 'sedan');
    const a = mk(199), b = mk(208);
    let maxOff = 0, swerved = false, aWaiting = false, swerveT = null, worst = null;
    for (let k = 0; k < 16 * 10; k++) {
      GTP.game.advance(0.1);
      if (k < 80 && a.ai.stopAlong != null) aWaiting = true;
      if (b.z > 188) { const off = Math.abs(b.x - 234); if (off > maxOff) { maxOff = off; worst = { t: (k + 1) / 10, x: +b.x.toFixed(2), z: +b.z.toFixed(1), phase: W.signalPhase(58, 45, GTP.game.time.t) }; } }
      if (b.ai.swerve && !swerved) { swerved = true; swerveT = { t: (k + 1) / 10, phase: W.signalPhase(58, 45, GTP.game.time.t), leadWaitingAtLight: a.ai.stopAlong != null }; }
    }
    return { aWaiting, maxOff: +maxOff.toFixed(2), worst, swerved, swerveT };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.aWaiting, 'setup: the lead car waits at the red light');
  t.assert(!r.swerved, 'the follower never swerves while queued at the light: ' + JSON.stringify(r.swerveT));
  t.assert(r.maxOff < 1.0, 'the follower stays in its lane up to the junction when the light turns green (max lateral offset ' + r.maxOff + ' m; the oncoming lane centre is 4 m away) ' + JSON.stringify(r.worst));
});
