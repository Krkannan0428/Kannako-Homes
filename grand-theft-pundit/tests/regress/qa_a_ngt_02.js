/* QA-A-NGT-02: rain puddles only ever appear north of the player. Render.weather._placePuddles scans a 32 x 32 tile
 * window row by row from its north-west corner and stops at QUALITY.puddles, so the budget (24 medium / 40 high /
 * 60 ultra) is spent on the northern rows: every puddle is 0-65 m north of the player, none to the south, and often
 * none within 30 m. Walking south the puddles vanish in front of you and re-seed every 24 m.
 * Places the puddles at four spots in the rain and requires some to lie south of the focus and near it. */
'use strict';
const H = require('../_harness');

H.run('qa_a_ngt_02 puddles surround the player', async (t) => {
  const ctx = await t.boot({ seed: 7, quality: 'medium', weather: 'rain', clock: 22 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, R = GTP.Render, d = GTP.game.debug, out = [];
    for (const s of [[322, 254], [326, 422], [650, 730], [230, 730]]) {
      const p = W.nearestRoadPoint(s[0], s[1]);
      d.teleport(p.x, p.z); GTP.game.advance(0.2); GTP.game.render();
      const im = R.weather._puddles, m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), f = R.rig.focus;
      let n = 0, south = 0, near = 0;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m); m.decompose(v, q, sc); if (!sc.x) continue;
        n++; if (v.z - f.z > 8) south++; if (Math.hypot(v.x - f.x, v.z - f.z) < 40) near++;
      }
      out.push({ at: [Math.round(f.x), Math.round(f.z)], n, south, near });
    }
    return out;
  });
  console.log('  puddles: ' + JSON.stringify(r));
  t.assert(r.every((s) => s.n > 0), 'puddles are placed in the rain: ' + JSON.stringify(r));
  t.assert(r.every((s) => s.south >= 2), 'some puddles lie south of the player at every spot: ' + JSON.stringify(r));
  t.assert(r.filter((s) => s.near >= 4).length >= 3, 'puddles are placed near the player (within 40 m): ' + JSON.stringify(r));
});
