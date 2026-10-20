// QA-A-ENT-01: car interiors (seats, dash) must stay inside the cabin glass.
// Sedan / taxi / cop / sports / SUV seat backs stand up through the roof and the rear seat backs sit outside the cabin
// on the trunk lid. Checks every seat / dash coloured vertex of the body geometry against the cabin prism that the
// glass group spans (bottom z range at the glass's lowest y, top z range at its highest y, linear in between).
'use strict';
const H = require('../_harness');
H.run('qa_a_ent_01 car seats and dash stay inside the cabin', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const res = await ctx.page.evaluate(() => {
    const A = GTP.Assets, out = {};
    const near = (c, r, g, b) => Math.abs(c[0] - r) < 0.01 && Math.abs(c[1] - g) < 0.01 && Math.abs(c[2] - b) < 0.01;
    for (const cls of ['sedan', 'taxi', 'cop', 'sports', 'suv']) {
      const g = A.vehicleGeometry(cls).body, pos = g.attributes.position.array, col = g.attributes.color.array, idx = g.index.array;
      const glassGrp = g.groups.find((q) => q.materialIndex === A.GROUPS.glass);
      const gv = new Set();
      for (let i = glassGrp.start; i < glassGrp.start + glassGrp.count; i++) gv.add(idx[i]);
      let yb = 1e9, yt = -1e9;
      gv.forEach((v) => { yb = Math.min(yb, pos[v * 3 + 1]); yt = Math.max(yt, pos[v * 3 + 1]); });
      let zb0 = 1e9, zb1 = -1e9, zt0 = 1e9, zt1 = -1e9;
      gv.forEach((v) => { const y = pos[v * 3 + 1], z = pos[v * 3 + 2]; if (Math.abs(y - yb) < 0.01) { zb0 = Math.min(zb0, z); zb1 = Math.max(zb1, z); } if (Math.abs(y - yt) < 0.01) { zt0 = Math.min(zt0, z); zt1 = Math.max(zt1, z); } });
      let worst = 0, n = 0, bad = 0;
      for (let v = 0; v < pos.length / 3; v++) {
        const c = [col[v * 3], col[v * 3 + 1], col[v * 3 + 2]];
        if (!near(c, 0.16, 0.15, 0.16) && !near(c, 0.1, 0.1, 0.11)) continue;   // SEAT, DASH
        n++;
        const y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        if (y <= yb) continue;
        const f = Math.min(1, (y - yb) / (yt - yb)), lo = zb0 + f * (zt0 - zb0), hi = zb1 + f * (zt1 - zb1);
        const over = Math.max(y - yt, lo - z, z - hi, 0);
        if (over > 0.03) bad++;
        worst = Math.max(worst, over);
      }
      out[cls] = { n, bad, worst: +worst.toFixed(3) };
    }
    return out;
  });
  console.log(JSON.stringify(res));
  for (const [cls, r] of Object.entries(res)) {
    t.assert(r.n > 0, cls + ': no interior found');
    t.assert(r.bad === 0, cls + ': ' + r.bad + ' interior vertices outside the cabin glass (worst ' + r.worst + ' m)');
  }
});
