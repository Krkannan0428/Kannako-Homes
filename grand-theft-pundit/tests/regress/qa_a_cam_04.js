/* QA-A-CAM-04: first person on the bike puts the eye at handlebar height. The vehicle eye point is H * 0.82 of the body
 * (bike height 1.1 -> 0.9 m), but the rider sits on a 0.86 m saddle with the hips 0.84 m above the feet, so the rider's eyes
 * are ~1.6 m up (C.PLAYER.eye 1.6 above the feet, minus 0.84 + 0.86). The first-person camera must be near the rider's eyes. */
'use strict';
const H = require('../_harness');
H.run('qa_a_cam_04 bike first-person eye height', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, R = GTP.Render;
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    const v = g.debug.spawnVehicle(120, 90, 'bike', { yaw: GTP.util.dirToYaw(1, 0) }); v.persistent = true;
    g.debug.teleport(120, 90); v.enter(p, 0); g.advance(0.1);
    p.cameraMode = 'first'; R.rig.snap(); g.advance(0.1);
    return { inBike: p.inVehicle === v, eyeAboveGround: +(R.camera.position.y - v.y).toFixed(2) };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.inBike, 'setup: riding the bike');
  t.assert(r.eyeAboveGround >= 1.4, 'the first-person eye is at the rider\'s eyes (>= 1.4 m), not ' + r.eyeAboveGround + ' m');
});
