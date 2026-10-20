// QA-A-ENT-07: the bus's side windows stay on the bus and do not z-fight with its doors.
// Assets.vehicleGeometry('bus') lays 8 windows of 0.95 m with 0.18 m gaps from 1.5 m behind the nose: the row is 8.86 m
// long and ends 0.36 m past the rear of the 10 m bus (a pane hangs in the air on both sides), and the right-side rear
// door box (hl - 3.2 .. hl - 2.3) lies in exactly the same plane as two windows, which z-fight in stripes.
'use strict';
const H = require('../_harness');
H.run('qa_a_ent_07 bus windows inside the body, not coplanar with the doors', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const A = GTP.Assets, spec = GTP.C.VEHICLES.bus, hl = spec.length / 2, hw = spec.width / 2;
    const g = A.vehicleGeometry('bus').body, pos = g.attributes.position.array, idx = g.index.array, col = g.attributes.color.array;
    const side = (gi, colorTest) => {
      const out = [], grp = g.groups.find((q) => q.materialIndex === gi);
      for (let i = grp.start; i < grp.start + grp.count; i += 3) {
        const v = [0, 1, 2].map((k) => idx[i + k]);
        const xs = v.map((n) => pos[n * 3]);
        if (Math.abs(xs[0] - xs[1]) > 1e-4 || Math.abs(xs[0] - xs[2]) > 1e-4 || Math.abs(xs[0]) < hw - 0.05) continue;   // a side-facing face
        if (colorTest && !colorTest(v[0])) continue;
        const ys = v.map((n) => pos[n * 3 + 1]), zs = v.map((n) => pos[n * 3 + 2]);
        out.push({ x: xs[0], y0: Math.min(...ys), y1: Math.max(...ys), z0: Math.min(...zs), z1: Math.max(...zs) });
      }
      return out;
    };
    const glass = side(A.GROUPS.glass);
    const dark = side(A.GROUPS.detail, (n) => Math.abs(col[n * 3] - 0.12) < 0.01 && Math.abs(col[n * 3 + 2] - 0.14) < 0.01 && Math.abs(pos[n * 3 + 1] - 0.525) < 0.6);
    let maxZ = -1e9, minZ = 1e9;
    for (const f of glass) { maxZ = Math.max(maxZ, f.z1); minZ = Math.min(minZ, f.z0); }
    let coplanar = 0;
    for (const a of glass) for (const b of dark) {
      if (Math.abs(a.x - b.x) > 1e-4) continue;
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (oy > 0.02 && oz > 0.02) coplanar++;
    }
    return { hl, glassZ: [minZ, maxZ], coplanar, glassFaces: glass.length, darkFaces: dark.length };
  });
  console.log(JSON.stringify(r));
  t.assert(r.glassFaces > 0 && r.darkFaces > 0, 'test setup: no side glass / door faces found');
  t.assert(r.glassZ[1] <= r.hl + 0.02 && r.glassZ[0] >= -r.hl - 0.02, 'bus side glass runs from z ' + r.glassZ[0].toFixed(2) + ' to ' + r.glassZ[1].toFixed(2) + ', past the body (+-' + r.hl + ')');
  t.assert(r.coplanar === 0, r.coplanar + ' overlapping window / door face pairs share one plane (z-fighting)');
});
