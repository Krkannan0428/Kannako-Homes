/* QA-A-DRV-03: the white railings drawn along the bridge walkways (Sponsor Span, bridge_main, the causeway) are not solid:
 * a car at 18 m/s and a walking player both pass straight through them into the water. */
'use strict';
const H = require('../_harness');
H.run('qa_a_drv_03 bridge railings', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, W = GTP.World, U = GTP.util, In = GTP.Input, out = { cars: [], peds: [] };
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    const run = (keys, sec) => { keys.forEach((k) => In.set(k, true)); for (let i = 0; i < sec * 30; i++) g.advance(1 / 30); keys.forEach((k) => In.set(k, false)); };
    // cars: along the bridge, then steer for the railing
    for (const [x, z, yaw, steer] of [[330, 530, Math.PI, 'left'], [460, 280, -Math.PI / 2, 'right'], [605, 280, -Math.PI / 2, 'left']]) {
      const v = g.debug.spawnVehicle(x, z, 'sedan', { yaw }); g.debug.teleport(x, z); v.enter(p, 0); g.advance(0.1);
      run(['forward'], 2.2); run(['forward', steer], 2.5);
      out.cars.push({ x, z, sinking: !!v.sinking, swimming: !!p.swimming, at: [+v.x.toFixed(1), +v.y.toFixed(2), +v.z.toFixed(1)] });
      if (p.inVehicle) { v.vx = v.vz = 0; g.advance(0.1); p.exitVehicle(); }
      g.debug.teleport(300, 300); g.advance(0.2); if (!v.removed) v.destroy();
    }
    // on foot: walk straight at the railing from the bridge deck
    for (const [x, z, dx, dz] of [[334, 560, 1, 0], [322, 560, -1, 0], [492, 268, 0, -1]]) {
      g.debug.teleport(x, z); GTP.Render.rig.yaw = U.dirToYaw(dx, dz); g.advance(0.05);
      run(['forward'], 3);
      out.peds.push({ x, z, swimming: !!p.swimming, at: [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)] });
    }
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  for (const c of r.cars) t.assert(!c.sinking && !c.swimming, 'a car steered into the bridge railing stays on the bridge: ' + JSON.stringify(c));
  for (const q of r.peds) t.assert(!q.swimming, 'walking into the bridge railing does not drop the player into the water: ' + JSON.stringify(q));
});
