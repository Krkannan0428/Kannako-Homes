/* QA-A-CAM-08: pedestrians and cars blink out in clear air. Entities hide their mesh beyond QUALITY.pedDraw (110 m) and
 * QUALITY.vehicleDraw (200 m), but the fog only starts at fogStart 120 m (medium; ends 260 m): a ped at 108.5 m is drawn
 * with no fog at all and is gone at 111.5 m, a van at 198.5 m is drawn 56% fogged and gone at 201.5 m. At its last drawn
 * distance an entity must already be (nearly) invisible: drawing it or not may change the frame by only a few levels. */
'use strict';
const H = require('../_harness');
H.run('qa_a_cam_08 entity draw distance inside the fog', async (t) => {
  const { page } = await t.boot({ seed: 7, quality: 'medium', weather: 'clear' });
  const r = await page.evaluate(() => {
    const g = GTP.game, R = GTP.Render, Q = GTP.C.QUALITY, out = [];
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    for (const e of GTP.Entities.list.slice()) if ((e.kind === 'vehicle' && !e.hasPlayer()) || e.kind === 'ped') e.destroy();
    g.debug.setClock(12); g.debug.teleport(30, 98); g.advance(0.1);
    const grab = () => { const cv = document.getElementById('gl'), off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height; const c = off.getContext('2d'); c.drawImage(cv, 0, 0); return c.getImageData(0, 0, off.width, off.height).data; };
    for (const [kind, lim] of [['ped', Q.pedDraw], ['vehicle', Q.vehicleDraw]]) {
      const d = lim - 1.5, cx = 40, cz = 90.5;
      const e = kind === 'ped' ? g.debug.spawnPed(cx + d, 90, null, 'civ') : g.debug.spawnVehicle(cx + d, 90, 'van', { yaw: GTP.util.dirToYaw(1, 0), color: '#ff2020' });
      e.persistent = true; if (e.ai) e.ai = null;
      g.debug.freeCam(cx, 3, cz, cx + 100, 2, cz);
      g.render(); const visible = e.mesh.visible; const a = grab();
      e.mesh.visible = false;   // the same frame without the entity (no Entities.sync, so it stays hidden)
      if (GTP.PostFX && GTP.PostFX.render) GTP.PostFX.render(R.renderer, R.scene, R.camera); else R.renderer.render(R.scene, R.camera);
      const b = grab();
      let max = 0; for (let i = 0; i < a.length; i += 4) { const dd = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; if (dd > max) max = dd; }
      out.push({ kind, dist: d, drawn: visible, maxPixelChange: Math.round(max) });
      e.destroy(); g.debug.followCam();
    }
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  for (const q of r) {
    t.assert(q.drawn, 'setup: the ' + q.kind + ' is drawn at ' + q.dist + ' m');
    t.assert(q.maxPixelChange <= 12, 'a ' + q.kind + ' about to be culled at ' + q.dist + ' m is already faded into the fog (max change ' + q.maxPixelChange + ' levels)');
  }
});
