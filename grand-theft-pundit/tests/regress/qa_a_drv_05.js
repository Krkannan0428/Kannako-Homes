/* QA-A-DRV-05: the mansion's hedge maze (props 'hedge', drawn 1 m wide and 14..22 m long via sz) collides only as an r 1
 * circle at each hedge's centre, so the player walks straight through every hedge away from its middle. */
'use strict';
const H = require('../_harness');
H.run('qa_a_drv_05 hedge maze', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, U = GTP.util, In = GTP.Input, W = GTP.World;
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    const hs = W.props.filter((q) => q.kind === 'hedge' && q.sz > 15).sort((a, b) => a.x - b.x);
    const h = hs[0];
    // 5 m off the hedge's centre, still well within its drawn length (sz / 2 = 8.5 m)
    g.debug.teleport(h.x - 4, h.z + 5); GTP.Render.rig.yaw = U.dirToYaw(1, 0); g.advance(0.05);
    In.set('forward', true); In.set('run', true); for (let i = 0; i < 60; i++) g.advance(1 / 30); In.set('forward', false); In.set('run', false);
    return { hedge: [h.x, h.z, h.sz], player: [+p.x.toFixed(2), +p.z.toFixed(2)] };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.hedge[2] > 15, 'setup: a long hedge');
  t.assert(r.player[0] < r.hedge[0] - 0.5, 'the hedge (1 m wide at x ' + r.hedge[0] + ') stops the player: ' + JSON.stringify(r));
});
