// QA-A-ENT-04: skid marks lie on the surface they were made on.
// Vehicle._effects drops each mark at the rear wheel's x/z but at the car's centre height (this.y), flat: on a Loop
// ramp a slide uphill leaves marks floating 0.1-0.3 m above the asphalt and a slide downhill buries them 0.12-0.26 m
// under it (invisible).
'use strict';
const H = require('../_harness');
H.run('qa_a_ent_04 skid marks on a ramp lie on the ramp', async (t) => {
  const ctx = await t.boot({ seed: 7, clock: 12 });
  const res = await ctx.page.evaluate(() => {
    const W = GTP.World, U = GTP.util, g = GTP.game, p = g.player, out = {};
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    for (const e of GTP.Entities.list.slice()) if ((e.kind === 'vehicle' && !e.hasPlayer()) || e.kind === 'ped') e.destroy();
    g.debug.godMode(true);
    // ramp foot tiles (seed 7): (69,103) climbs north, (101,81) descends west from the deck end
    for (const [mode, tx, tz, dx, dz] of [['up', 69, 103, 0, -1], ['down', 101, 81, -1, 0]]) {
      if (p.inVehicle) { const o = p.inVehicle; p.exitVehicle(); g.advance(0.2); o.destroy(); }
      GTP.Render.fx.clear();
      const x = tx * 4 + 2, z = tz * 4 + 2;
      if (W.tileAt(x, z) !== W.T.RAMP) return { err: 'no ramp at ' + tx + ',' + tz };
      const v = g.debug.spawnVehicle(x, z, 'sedan', { yaw: U.dirToYaw(dx, dz) }); v.persistent = true;
      v.y = W.heightAt(x, z, mode === 'down' ? 8 : 0); v.snap();
      g.debug.teleport(x, z, v.y); v.enter(p, 0); g.advance(0.2);
      GTP.Input.set('forward', true); g.advance(mode === 'up' ? 1.6 : 0.8);
      GTP.Input.set('jump', true); GTP.Input.set('left', true); g.advance(0.9);
      GTP.Input.set('forward', false); GTP.Input.set('jump', false); GTP.Input.set('left', false); g.advance(0.3);
      const d = GTP.Render.fx.list.filter((o) => o.type === 'skid' && W.tileAt(o.x, o.z) === W.T.RAMP).map((o) => o.y - W.heightAt(o.x, o.z, o.y + 0.5));
      out[mode] = { n: d.length, min: d.length ? Math.min(...d) : null, max: d.length ? Math.max(...d) : null };
    }
    return out;
  });
  console.log(JSON.stringify(res));
  t.assert(!res.err, res.err);
  for (const m of ['up', 'down']) {
    const r = res[m];
    t.assert(r.n > 0, m + ': the slide left no skid marks on the ramp (test setup)');
    t.assert(r.max < 0.06 && r.min > -0.03, m + ': skid marks ' + r.min.toFixed(2) + '..' + r.max.toFixed(2) + ' m off the ramp surface');
  }
});
