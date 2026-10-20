/* QA-A-TRF-07: parked cars are put down through solid props and into building walls. spawnParked() places a car on the
 * centre of a parking tile with yaw 0 or PI and never checks its footprint: an SUV is parked around the stadium's light
 * mast at (609.5, 173.5), a taxi on a cargo pallet at the airport (106, 670), and trucks / vans (5.4..7.5 m long on a
 * 4 m tile) back into the port warehouses (e.g. (610, 676)). Expect every parked car's body clear of solid props and
 * building volumes. */
'use strict';
const H = require('../_harness');

H.run('qa_a_trf_07 parked cars clear of props and walls', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, U = GTP.util, seen = new Set(), bad = [];
    for (const [x, z] of [[590, 160], [640, 700], [100, 680], [110, 40], [400, 760]]) {
      GTP.game.debug.teleport(x, z); GTP.game.advance(6);
      for (const v of GTP.Entities.list) {
        if (v.removed || v.kind !== 'vehicle' || !v.ai || v.ai.kind !== 'parked' || seen.has(v.id)) continue; seen.add(v.id);
        const f = U.yawToDir(v.yaw), rr = { x: -f.z, z: f.x };
        let wall = false;
        for (const sf of [-1, -0.5, 0, 0.5, 1]) for (const sr of [-1, 1]) if (W.solidAt(v.x + f.x * v.hl * sf + rr.x * v.hw * sr, v.z + f.z * v.hl * sf + rr.z * v.hw * sr, 0.8)) wall = true;
        let prop = null;
        for (const p of W.props) { if (!p.solid || p.hidden || p.fallen || Math.abs(p.x - v.x) > 12 || Math.abs(p.z - v.z) > 12 || (p.y || 0) > 2) continue; const l = v.worldToLocal(p.x, p.z), pen = p.r - Math.hypot(Math.max(0, Math.abs(l.r) - v.hw), Math.max(0, Math.abs(l.f) - v.hl)); if (pen > 0.2) { prop = p.kind; break; } }
        if (wall || prop) bad.push({ type: v.type, at: [+v.x.toFixed(1), +v.z.toFixed(1)], wall, prop });
      }
    }
    return { parked: seen.size, bad };
  });
  console.log('  parked ' + r.parked + ', clipping ' + r.bad.length + ': ' + JSON.stringify(r.bad.slice(0, 12)));
  t.assert(r.parked >= 20, 'parked cars spawned: ' + r.parked);
  t.assert(r.bad.length === 0, 'no parked car overlaps a solid prop or a building: ' + JSON.stringify(r.bad.slice(0, 12)));
});
