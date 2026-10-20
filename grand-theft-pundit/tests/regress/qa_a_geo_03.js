/* QA-A-GEO-03: the Velvetine Pier's moored boats (dock props at x 322.4, z 528 and 552, r 1.8, y -0.85, top +1.35) sit on the
 * Sponsor Span's west lane (BRIDGE tiles x 80). A car on the bridge crashes into them (hp 100 -> 68) and northbound it is
 * shoved over the edge into the bay. No solid prop at ground level may overlap a BRIDGE tile, and a car must cross the span. */
'use strict';
const H = require('../_harness');
H.run('qa_a_geo_03', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, T = W.T, g = GTP.game, p = g.player, out = { onBridge: [] };
    W.props.forEach((q) => {
      if (!q.solid || q.fallen || !(q.r > 0)) return;
      const y0 = q.y || 0, y1 = y0 + (q.h || 3); if (y1 < 0.3 || y0 > 2) return;
      for (const [dx, dz] of [[0, 0], [q.r, 0], [-q.r, 0], [0, q.r], [0, -q.r]]) if (W.tileAt(q.x + dx, q.z + dz) === T.BRIDGE) { out.onBridge.push(q.kind + '@' + q.x.toFixed(1) + ',' + q.z.toFixed(1)); break; }
    });
    g.debug.godMode(true);
    const press = (a) => { GTP.Input.set(a, true); g.advance(1 / 60); GTP.Input.set(a, false); g.advance(1 / 60); };
    g.debug.teleport(322, 500); g.advance(0.2);
    const v = g.debug.spawnVehicle(322, 500, 'sedan', { yaw: Math.PI });
    const d = v.doorWorld(0); g.debug.teleport(d.x, d.z); g.advance(0.1); press('enter'); g.advance(0.8);
    v.x = 322; v.z = 500; v.yaw = Math.PI; v.vx = v.vz = 0;
    out.entered = p.inVehicle === v;
    const hp0 = v.hp;
    GTP.Input.set('forward', true);
    for (let i = 0; i < 24; i++) g.advance(0.25);
    GTP.Input.set('forward', false);
    out.end = [+v.x.toFixed(1), +v.z.toFixed(1), +v.y.toFixed(2)]; out.hpLoss = hp0 - v.hp;
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.entered, 'player entered the test car');
  t.assert(r.onBridge.length === 0, 'solid props on the bridge deck: ' + r.onBridge.join(', '));
  t.assert(r.end[1] > 580 && r.hpLoss === 0, 'a car driving south down the Sponsor Span west lane from z 500 should cross it unharmed in 6 s: ended at ' + JSON.stringify(r.end) + ' hp lost ' + r.hpLoss);
});
