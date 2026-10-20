/* QA-A-NGT-09: at night the rain puddles read as dark stains on a shining road. The puddle decals
 * (Render.weather._puddles: colour #2a323c, roughness 0.02, metalness 0.4, opacity 0.6) mirror the near-black night
 * environment map, while the wet ground around them (roughness 0.32) spreads the lamp light into broad highlights,
 * so each disc lays a darker layer over the lit asphalt and hides the lamp and neon reflections. Container
 * Crescent puddle at (619, 727): 36 inside against 56 around it (medium), 82 against 93 (high / ultra).
 * Looks at that puddle from 9 m and compares the screen luminance inside the disc with a ring of road around it. */
'use strict';
const H = require('../_harness');

H.run('qa_a_ngt_09 puddles are not darker than the wet road', async (t) => {
  const ctx = await t.boot({ seed: 7, quality: 'medium', clock: 23, weather: 'rain' });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, R = GTP.Render, d = GTP.game.debug;
    d.followCam(); const p = W.nearestRoadPoint(650, 730); d.teleport(p.x, p.z); GTP.game.advance(0.3); GTP.game.render();
    const f = R.rig.focus, im = R.weather._puddles, m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    let best = null;
    for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); m.decompose(v, q, sc); if (!sc.x || v.y > 0.05) continue; const dd = Math.hypot(v.x - f.x, v.z - f.z); if (dd < 50 && (!best || sc.x * sc.z > best.a)) best = { a: sc.x * sc.z, c: v.clone(), m: m.clone() }; }
    if (!best) return { none: true };
    const rd = W.roadDir(best.c.x, best.c.z, 0) || { dx: 1, dz: 0 };
    d.freeCam(best.c.x - rd.dx * 9, 1.7, best.c.z - rd.dz * 9, best.c.x, 0, best.c.z);
    R.weather._rain.material.visible = false;   // keep the streaks out of the samples
    GTP.game.render();
    const cv = document.getElementById('gl'), off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
    const ctx = off.getContext('2d'); ctx.drawImage(cv, 0, 0);
    const k = cv.width / R.width;
    const lum = (x, y, z) => { const s = R.worldToScreen(x, y, z); if (!s.visible) return null; const dd = ctx.getImageData(Math.round(s.sx * k), Math.round(s.sy * k), 1, 1).data; return (dd[0] + dd[1] + dd[2]) / 3; };
    let si = 0, ni = 0, so = 0, no = 0;
    for (let a = 0; a < 24; a++) {
      const ca = Math.cos(a / 24 * Math.PI * 2), sa = Math.sin(a / 24 * Math.PI * 2);
      const pi = new THREE.Vector3(ca * 0.5, 0, sa * 0.5).applyMatrix4(best.m), po = new THREE.Vector3(ca * 1.45, 0, sa * 1.45).applyMatrix4(best.m);
      const li = lum(pi.x, pi.y, pi.z); if (li != null) { si += li; ni++; }
      if (W.tileAt(po.x, po.z) === W.T.ROAD) { const lo = lum(po.x, 0, po.z); if (lo != null) { so += lo; no++; } }
    }
    return { puddle: best.c.toArray().map((x) => +x.toFixed(1)), inside: Math.round(si / ni), ring: Math.round(so / no), ni, no };
  });
  console.log('  puddle vs road: ' + JSON.stringify(r));
  t.assert(!r.none && r.ni >= 12 && r.no >= 8, 'a road puddle in view: ' + JSON.stringify(r));
  t.assert(r.inside >= r.ring * 0.9, 'the puddle is not a dark stain: inside ' + r.inside + ' vs the wet road around it ' + r.ring);
});
