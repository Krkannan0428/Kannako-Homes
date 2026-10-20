// QA-A-ENT-08: vehicle body decals do not share a plane with the surface under them (z-fighting).
// Assets.vehicleGeometry: the front licence plate's face (z = -hl - 0.02) lies in the grille's face on the sedan, taxi,
// cop, sports, SUV and van; the podcast van's chrome beltline (x = +-(hw + 0.012)) lies in the LOUD & CORRECT wrap quad;
// the bus's navy stripe box is exactly as wide as the bus, so its sides lie in the body sides. Each pair flickers in
// stripes. Scans every body for outward axis-aligned triangles of different material / colour that overlap in one plane.
'use strict';
const H = require('../_harness');
H.run('qa_a_ent_08 no coplanar overlapping decals on vehicle bodies', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const A = GTP.Assets, out = [];
    const names = Object.fromEntries(Object.entries(A.GROUPS).map(([k, v]) => [v, k]));
    function clip(poly, a, b) {
      const o = [], side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(p), sq = side(q); if (sp >= 0) o.push(p); if ((sp >= 0) !== (sq >= 0)) { const k = sp / (sp - sq); o.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); } }
      return o;
    }
    const area = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
    function inter(t1, t2) { if (area(t1) < 0) t1 = t1.slice().reverse(); if (area(t2) < 0) t2 = t2.slice().reverse(); let p = t1; for (let i = 0; i < 3 && p.length; i++) p = clip(p, t2[i], t2[(i + 1) % 3]); return p.length >= 3 ? Math.abs(area(p)) : 0; }
    for (const [cls, wrap] of [['sedan'], ['taxi'], ['cop'], ['sports'], ['suv'], ['van'], ['van', 'pod'], ['bus']]) {
      const spec = GTP.C.VEHICLES[cls], hl = spec.length / 2, hw = spec.width / 2;
      const g = A.vehicleGeometry(cls, wrap).body, pos = g.attributes.position.array, idx = g.index.array, nor = g.attributes.normal.array, col = g.attributes.color.array;
      const planes = new Map();
      for (const gr of g.groups) for (let i = gr.start; i < gr.start + gr.count; i += 3) {
        const v = [idx[i], idx[i + 1], idx[i + 2]], n = [nor[v[0] * 3], nor[v[0] * 3 + 1], nor[v[0] * 3 + 2]];
        const ax = [0, 2].find((k) => Math.abs(n[k]) > 0.999); if (ax == null) continue;   // side (x) and end (z) faces
        const c = pos[v[0] * 3 + ax];
        // outward only: a side face on the body's outside (|x| >= hw - 0.02) facing out, an end face at the front / rear facing out
        const lim = ax === 0 ? hw - 0.02 : hl - 0.05;
        if (Math.abs(c) < lim || Math.sign(c) !== Math.sign(n[ax])) continue;
        const u = ax === 0 ? 1 : 0, w = ax === 0 ? 2 : 1;
        const key = ax + ':' + c.toFixed(4);
        if (!planes.has(key)) planes.set(key, []);
        planes.get(key).push({ tri: v.map((q) => [pos[q * 3 + u], pos[q * 3 + w]]), tag: names[gr.materialIndex] + '[' + [0, 1, 2].map((k) => col[v[0] * 3 + k].toFixed(2)).join(',') + ']' });
      }
      planes.forEach((list, key) => {
        let ar = 0, ex = null;
        for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
          if (list[a].tag === list[b].tag) continue;
          const x = inter(list[a].tri, list[b].tri); if (x > 1e-4) { ar += x; ex = list[a].tag + ' x ' + list[b].tag; }
        }
        if (ar > 0.002) out.push(cls + (wrap ? ':' + wrap : '') + ' plane ' + key + ' ' + ex + ' ' + ar.toFixed(3) + ' m2');
      });
    }
    return out;
  });
  console.log(r.join('\n'));
  t.assert(r.length === 0, r.length + ' coplanar overlapping face sets on vehicle bodies (z-fighting), e.g. ' + r.slice(0, 3).join(' | '));
});
