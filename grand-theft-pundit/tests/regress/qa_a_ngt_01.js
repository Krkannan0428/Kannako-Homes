/* QA-A-NGT-01: every street lamp's arm and head point the wrong way. The lamp geometry puts the arm and head at
 * local +z ("toward the road at rot 0"), the InstancedMesh rotates it by p.rot about +y, which sends +z to
 * (sin rot, cos rot); but the night glow sprite, the ground light pool and the high/ultra point light are placed at
 * p + yawToDir(rot) * 1.4 = (-sin rot, -cos rot) * 1.4. So the head overhangs the sidewalk away from the road and
 * the orange glow floats in mid air 2.85 m from it, on the road side, at every one of the 816 lamps.
 * Compares each lamp instance's head position (matrix * the head's local centre) with its glow sprite. */
'use strict';
const H = require('../_harness');

H.run('qa_a_ngt_01 lamp glow sits on the lamp head', async (t) => {
  const ctx = await t.boot({ seed: 7, clock: 22 });
  const r = await ctx.page.evaluate(() => {
    const R = GTP.Render, res = { n: 0, bad: 0, maxD: 0, ex: null };
    R.chunks.forEach((ch) => {
      if (!ch.glowPts || !ch.group) return;
      const im = ch.group.children.find((o) => o.name === 'props:lamp'); if (!im) return;
      const gp = ch.glowPts.geometry.attributes.position, m = new THREE.Matrix4();
      for (let k = 0; k < im.count && k < gp.count; k++) {
        im.getMatrixAt(k, m);
        const head = new THREE.Vector3(0, 5.93, 1.45).applyMatrix4(m);
        const d = Math.hypot(head.x - gp.getX(k), head.z - gp.getZ(k));
        res.n++; res.maxD = Math.max(res.maxD, d);
        if (d > 0.6) { res.bad++; if (!res.ex) res.ex = { head: [head.x, head.z].map((x) => +x.toFixed(2)), glow: [gp.getX(k), gp.getZ(k)].map((x) => +x.toFixed(2)) }; }
      }
    });
    return res;
  });
  console.log('  lamps: ' + JSON.stringify(r));
  t.assert(r.n > 20, 'lamps found in the built chunks: ' + r.n);
  t.assert(r.bad === 0, r.bad + ' of ' + r.n + ' lamp heads are ' + r.maxD.toFixed(2) + ' m from their glow sprite / light pool: ' + JSON.stringify(r.ex));
});
