/* QA-A-DRV-04: the Manifest Container Yard's container walls can be driven and walked through. Each 2.4 x 6 m container
 * is one r 1.3 circle at its centre (World props 'container'), so between two containers of a column there is a 3.4 m gap
 * in the collision where the boxes visibly touch. Column k is centred at x = 514 + 12k (boxes x 511.35..516.65), rows every
 * 6 m from z 647; z 650 is the seam between two boxes. */
'use strict';
const H = require('../_harness');
H.run('qa_a_drv_04 container walls', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, U = GTP.util, In = GTP.Input, out = [];
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    const W = GTP.World;
    const boxes = W.props.filter((q) => q.kind === 'container' && q.solid && !q.rot && (q.y || 0) < 1);
    const inside = (x, z, m) => boxes.some((b) => Math.abs(x - b.x) < 1.2 + m && Math.abs(z - b.z) < 3);
    for (const z of [650, 656]) {
      const v = g.debug.spawnVehicle(498, z, 'sedan', { yaw: U.dirToYaw(1, 0) }); g.debug.teleport(498, z); v.enter(p, 0); g.advance(0.1);
      In.set('forward', true); let hit = false; let maxX = 0;
      for (let i = 0; i < 75; i++) { g.advance(1 / 30); maxX = Math.max(maxX, v.x); if (inside(v.x, v.z, 0)) hit = true; }
      In.set('forward', false); v.vx = v.vz = 0; g.advance(0.1); p.exitVehicle(); g.advance(0.2); v.destroy();
      out.push({ who: 'car', z, maxX: +maxX.toFixed(1), centreInsideContainer: hit });
    }
    g.debug.teleport(508, 650); GTP.Render.rig.yaw = U.dirToYaw(1, 0); g.advance(0.05);
    In.set('forward', true); In.set('run', true); let pin = false;
    for (let i = 0; i < 75; i++) { g.advance(1 / 30); if (inside(p.x, p.z, 0)) pin = true; }
    In.set('forward', false); In.set('run', false);
    out.push({ who: 'ped', z: 650, maxX: +p.x.toFixed(1), centreInsideContainer: pin });
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  for (const q of r) t.assert(!q.centreInsideContainer && q.maxX < 511.35, 'the ' + q.who + ' is stopped by the container column at x 511.35 (seam z ' + q.z + '): ' + JSON.stringify(q));
});
