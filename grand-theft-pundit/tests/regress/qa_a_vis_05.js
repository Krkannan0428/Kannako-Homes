/* QA-A-VIS-05: the chunk LOD swaps the PBR facade / ground / prop materials for Lambert *Far variants that are about
 * 25-30% darker (no environment lighting), so every block visibly darkens as it crosses QUALITY.lodDistance and the
 * city shows a brightness seam between near and far chunks.
 * Renders a fixed free-camera view over downtown at noon with every chunk forced near, then forced far, and compares
 * the mean brightness of the pixels the swap changes. */
'use strict';
const H = require('../_harness');

H.run('qa_a_vis_05 LOD far materials match the near look', async (t) => {
  const ctx = await t.boot({ seed: 7, weather: 'clear' });
  const r = await ctx.page.evaluate(() => {
    const D = GTP.game.debug, R = GTP.Render, Q = GTP.C.QUALITY;
    D.followCam(); D.teleport(330, 250); GTP.game.advance(0.1); D.setClock(12);
    D.freeCam(260, 40, 420, 330, 0, 250);
    const cv = document.getElementById('gl');
    const grab = () => { GTP.game.render(); const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height; const c = o.getContext('2d'); c.drawImage(cv, 0, 0); return c.getImageData(0, 0, o.width, o.height).data; };
    const save = Q.lodDistance;
    Q.lodDistance = 1e5; const near = grab();      // every chunk on the near (PBR) materials
    Q.lodDistance = 0; const far = grab();         // every chunk on the far (Lambert) materials
    Q.lodDistance = save; GTP.game.render();
    let n = 0, sn = 0, sf = 0;
    for (let i = 0; i < near.length; i += 4) {
      const a = near[i] + near[i + 1] + near[i + 2], b = far[i] + far[i + 1] + far[i + 2];
      if (Math.abs(a - b) > 6) { n++; sn += a; sf += b; }
    }
    return { changed: n / (near.length / 4), near: sn / Math.max(1, n) / 3, far: sf / Math.max(1, n) / 3 };
  });
  r.ratio = r.far / r.near;
  console.log('  LOD swap: ' + JSON.stringify(r));
  t.assert(r.ratio > 0.92 && r.ratio < 1.08, 'the far LOD keeps the near brightness (far / near = ' + r.ratio.toFixed(3) + ', ' + r.near.toFixed(1) + ' -> ' + r.far.toFixed(1) + ' over ' + (r.changed * 100).toFixed(1) + '% of the frame)');
});
