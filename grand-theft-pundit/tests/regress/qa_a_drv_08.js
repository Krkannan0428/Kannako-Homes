/* QA-A-DRV-08: a stunt wedge (ramp_prop, 6 x 3.2 m, 1.3 m tall at its front) has no side or front collision for cars: driving
 * into the 1.3 m vertical face pops the car up onto the wedge with no impact and no speed loss (Vehicle.update snaps y to
 * the wheel height when the step is over 0.4 m; resolveCapsule tests only RAMP tiles, not wedges). Peds are blocked by the
 * 0.5 m step-up; cars should hit the face like a kerb wall. */
'use strict';
const H = require('../_harness');
H.run('qa_a_drv_08 stunt wedge face', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, W = GTP.World, U = GTP.util, In = GTP.Input, out = [];
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    for (const id of ['sj_01', 'sj_02']) {
      const s = W.stuntRamps.find((q) => q.id === id), f = U.yawToDir(s.yaw);
      // 14 m beyond the wedge's tall front, driving back at it
      const x = s.x + f.x * 14, z = s.z + f.z * 14;
      const v = g.debug.spawnVehicle(x, z, 'sedan', { yaw: U.dirToYaw(-f.x, -f.z) }); g.debug.teleport(x, z); v.enter(p, 0); g.advance(0.1);
      In.set('forward', true); let maxY = 0, minD = 99;
      for (let i = 0; i < 75; i++) { g.advance(1 / 30); maxY = Math.max(maxY, v.y); minD = Math.min(minD, Math.hypot(v.x - s.x, v.z - s.z)); }
      In.set('forward', false);
      out.push({ id, base: s.y, maxY: +maxY.toFixed(2), closest: +minD.toFixed(1) });
      v.vx = v.vz = 0; g.advance(0.1); p.exitVehicle(); g.advance(0.1); v.destroy(); g.debug.teleport(300, 300); g.advance(0.1);
    }
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  for (const q of r) t.assert(q.maxY < q.base + 0.5, 'driving into the 1.3 m front face of ' + q.id + ' does not lift the car onto the wedge: ' + JSON.stringify(q));
});
