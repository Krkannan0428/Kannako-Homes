/* QA-A-NGT-03: puddles on sidewalk tiles float over the road. _placePuddles puts a disc of radius up to 3.2 x 2.1 m
 * anywhere inside a 4 m SIDEWALK / PLAZA tile at curb height (y 0.13), so a disc next to the kerb reaches 1-2 m out
 * over the road at 0 m: a dark mirror sheet hovering 13 cm above the asphalt (and a road puddle reaches under the kerb).
 * Places the puddles at several spots and samples each disc's rim against World.heightAt. */
'use strict';
const H = require('../_harness');

H.run('qa_a_ngt_03 puddles lie on the ground they cover', async (t) => {
  const ctx = await t.boot({ seed: 7, quality: 'medium', weather: 'rain', clock: 22 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, R = GTP.Render, d = GTP.game.debug, res = { n: 0, floating: 0, ex: null };
    for (const s of [[322, 254], [326, 422], [650, 730], [738, 314]]) {
      const p = W.nearestRoadPoint(s[0], s[1]);
      d.teleport(p.x, p.z); GTP.game.advance(0.2);
      R.weather._placePuddles(R.camera);
      const im = R.weather._puddles, m = new THREE.Matrix4(), v = new THREE.Vector3();
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m); if (m.elements[0] === 0 && m.elements[2] === 0) continue;
        res.n++;
        for (let a = 0; a < 24; a++) {
          v.set(Math.cos(a / 24 * Math.PI * 2) * 0.85, 0, Math.sin(a / 24 * Math.PI * 2) * 0.85).applyMatrix4(m);
          const gy = W.heightAt(v.x, v.z, 0);
          if (v.y - gy > 0.06) { res.floating++; if (!res.ex) res.ex = { rim: [+v.x.toFixed(1), +v.y.toFixed(2), +v.z.toFixed(1)], ground: gy }; break; }
        }
      }
    }
    return res;
  });
  console.log('  puddles: ' + JSON.stringify(r));
  t.assert(r.n > 30, 'puddles placed: ' + r.n);
  t.assert(r.floating === 0, r.floating + ' of ' + r.n + ' puddles hang over lower ground (rim above the ground by > 6 cm): ' + JSON.stringify(r.ex));
});
