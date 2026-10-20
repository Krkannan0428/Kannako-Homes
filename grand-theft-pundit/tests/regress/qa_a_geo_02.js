/* QA-A-GEO-02: Departures Drive (h 158, x 8..107) runs under the Lower Loop's east leg straight into the top (7 m) end of the
 * Manifest Ramp (x 108..116). Its eastbound lane continues onto the ramp tile in the lane field, AI traffic stalls there for
 * good, and a player car driving east is lifted from y 0 to y 6.95 in one frame and comes out on the ramp. No ground lane may
 * lead into a ramp's deck end, and a car driving east on Departures Drive must never jump more than 1 m in a frame. */
'use strict';
const H = require('../_harness');
H.run('qa_a_geo_02', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, T = W.T, g = GTP.game, p = g.player, out = { feeds: [] };
    // ground lanes that lead into a ramp's high end (the tile past the ramp's deck end, along its axis)
    W.ramps.forEach((rp) => {
      for (let l = 0; l < 2; l++) {
        const a = rp.end + rp.dir, tx = rp.axis === 'h' ? a : rp.at - 1 + l, tz = rp.axis === 'h' ? rp.at - 1 + l : a;
        const tt = W.tile(tx, tz), lane = rp.axis === 'h' ? W.laneH[tz * W.w + tx] : W.laneV[tz * W.w + tx];
        if ((tt === T.ROAD || tt === T.BRIDGE) && lane) out.feeds.push(rp.name + ' <- ground lane at ' + tx + ',' + tz);
      }
    });
    // drive east along Departures Drive's eastbound lane (z 634) at full throttle
    g.debug.godMode(true);
    const press = (a) => { GTP.Input.set(a, true); g.advance(1 / 60); GTP.Input.set(a, false); g.advance(1 / 60); };
    g.debug.teleport(380, 634); g.advance(0.2);
    const v = g.debug.spawnVehicle(380, 634, 'sedan', { yaw: -Math.PI / 2 });
    const d = v.doorWorld(0); g.debug.teleport(d.x, d.z); g.advance(0.1); press('enter'); g.advance(0.8);
    v.x = 380; v.z = 634; v.yaw = -Math.PI / 2; v.vx = v.vz = 0;
    out.entered = p.inVehicle === v;
    let prev = v.y, maxJump = 0, at = null;
    GTP.Input.set('forward', true);
    for (let i = 0; i < 150; i++) { g.advance(1 / 30); if (v.y - prev > maxJump) { maxJump = v.y - prev; at = [+v.x.toFixed(1), +prev.toFixed(2), +v.y.toFixed(2)]; } prev = v.y; }
    GTP.Input.set('forward', false);
    out.maxJump = +maxJump.toFixed(2); out.at = at;
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.entered, 'player entered the test car');
  t.assert(r.feeds.length === 0, 'ground lanes run into a ramp top: ' + r.feeds.join('; '));
  t.assert(r.maxJump < 1, 'car lifted ' + r.maxJump + ' m in one frame at ' + JSON.stringify(r.at) + ' (Departures Drive into the Manifest Ramp end)');
});
