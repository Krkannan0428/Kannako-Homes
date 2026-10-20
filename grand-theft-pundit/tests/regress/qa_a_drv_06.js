/* QA-A-DRV-06: Runway 10/10 flat out into sj_07 throws the fast cars into the sea: the launch (Strands.stunts, lift = speed *
 * sin(0.42)) has no cap, so a sports car at 50 m/s rises to 10 m, clears the 48 m beach and the sea, and hits the invisible
 * map edge at x = 0 in mid-air at 50 m/s (it explodes); a cop car lands in the water. GDD_EXPANSION 5.7: "nothing on wheels
 * reaches the sea". A car driven flat out off sj_07 must come down on land and never touch the map edge. */
'use strict';
const H = require('../_harness');
H.run('qa_a_drv_06 sj_07 overshoot', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, W = GTP.World, U = GTP.util, In = GTP.Input, out = [];
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    const impacts = []; GTP.Events.on('vehicle:impact', (e) => { if (e.kind === 'wall') impacts.push({ x: e.x, imp: e.impact }); });
    for (const ty of ['sports', 'cop']) {
      impacts.length = 0;
      const e = W.landmark('airport_runway').points.east;
      const v = g.debug.spawnVehicle(e.x, e.z, ty, { yaw: U.dirToYaw(-1, 0) }); g.debug.teleport(e.x, e.z); v.enter(p, 0); g.godMode = true; g.debug.godMode(true); g.advance(0.1);
      In.set('forward', true);
      let launched = false, landed = null, k = 0;
      while (k++ < 30 * 20 && !v.removed) {
        g.advance(1 / 30);
        if (!v.onGround && v.y > 1.5) launched = true;
        if (launched && (v.onGround || v.sinking)) { landed = { x: +v.x.toFixed(1), tile: W.tileAt(v.x, v.z), sinking: !!v.sinking }; In.set('forward', false); break; }
      }
      In.set('forward', false);
      out.push({ ty, launched, landed, edgeHits: impacts.filter((i) => i.x < 6).map((i) => +i.imp.toFixed(1)) });
      g.debug.teleport(300, 300); g.advance(0.2); if (!v.removed) v.destroy();
    }
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  for (const q of r) {
    t.assert(q.launched && q.landed, 'setup: the ' + q.ty + ' took off from sj_07: ' + JSON.stringify(q));
    t.assert(!q.edgeHits.length, 'the ' + q.ty + ' never hits the map edge in the air: ' + JSON.stringify(q));
    t.assert(!q.landed.sinking && q.landed.tile !== 5, 'the ' + q.ty + ' lands on land, not in the sea: ' + JSON.stringify(q));
  }
});
