/* QA-A-CAM-03: the car shakes on screen at speed. Render.frame interpolates every entity mesh with the frame's alpha
 * (Entities.sync -> syncMesh(alpha)) but applies the camera rig at its last fixed-step pose (rig.apply ignores alpha), so
 * the car is drawn up to one step (0.8 m at 48 m/s) behind a camera that already moved. On a 144 Hz display the alpha
 * sequence makes the car bob ~8 px up and down every frame. The car must hold its place on screen across alpha. */
'use strict';
const H = require('../_harness');
H.run('qa_a_cam_03 camera not interpolated with the car', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, R = GTP.Render;
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0; g.debug.godMode(true);
    const v = g.debug.spawnVehicle(40, 90, 'sports', { yaw: GTP.util.dirToYaw(1, 0) }); v.persistent = true;
    g.debug.teleport(40, 90); v.enter(p, 0); g.advance(0.05); R.rig.yaw = v.yaw; R.rig.snap();
    GTP.Input.set('forward', true); for (let i = 0; i < 300; i++) g.advance(1 / 60);
    const ys = [];
    for (const a of [0, 0.5, 1]) { g.render(a); const s = R.worldToScreen(v.mesh.position.x, v.mesh.position.y + 0.8, v.mesh.position.z); ys.push(+s.sy.toFixed(1)); }
    GTP.Input.set('forward', false);
    return { speed: +v.speed2d().toFixed(1), ys, range: +(Math.max(...ys) - Math.min(...ys)).toFixed(1) };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.speed > 35, 'setup: the car is flat out ' + r.speed);
  t.assert(r.range < 2, 'the car keeps its screen position whatever the render alpha (moved ' + r.range + ' px): ' + JSON.stringify(r));
});
