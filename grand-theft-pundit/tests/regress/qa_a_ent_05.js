// QA-A-ENT-05: an explosion's scorch mark is a soft round burn, not a hard black square.
// Render.fx decals are untextured PlaneGeometry instances (one flat colour, one alpha): a car explosion leaves a 5 x 5 m
// black square with sharp corners (rockets, hot takes, the helicopter likewise). Renders a scorch on the empty runway
// from straight above and compares a pixel at the square's corner (2.2 m, 2.2 m from the centre) with the plain runway.
'use strict';
const H = require('../_harness');
H.run('qa_a_ent_05 scorch marks have no hard square corners', async (t) => {
  const ctx = await t.boot({ seed: 7, clock: 12, quality: 'low' });
  const r = await ctx.page.evaluate(() => {
    const g = GTP.game, R = GTP.Render;
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    for (const e of GTP.Entities.list.slice()) if ((e.kind === 'vehicle' && !e.hasPlayer()) || e.kind === 'ped') e.destroy();
    g.debug.godMode(true); g.debug.teleport(180, 822); g.advance(0.3);
    const x = 200, z = 822;
    const v = g.debug.spawnVehicle(x, z, 'sedan', { yaw: 0 }); v.persistent = true; g.advance(0.2);
    v.explode(); g.advance(5); v.destroy(); g.advance(0.1);
    if (!R.fx.list.some((o) => o.type === 'decal')) return { err: 'no scorch decal' };
    g.debug.freeCam(x, 30, z + 0.001, x, 0, z); g.render();
    const cv = document.getElementById('gl'), off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
    const c2 = off.getContext('2d'); c2.drawImage(cv, 0, 0);
    const lum = (wx, wz) => { const s = R.worldToScreen(wx, 0, wz), k = cv.width / cv.getBoundingClientRect().width; let sum = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const d = c2.getImageData(Math.round(s.sx * k) + dx, Math.round(s.sy * k) + dy, 1, 1).data; sum += (d[0] + d[1] + d[2]) / 3; } return sum / 9; };
    return { centre: lum(x, z), corners: [lum(x + 2.2, z + 2.2), lum(x - 2.2, z + 2.2), lum(x + 2.2, z - 2.2), lum(x - 2.2, z - 2.2)], plain: [lum(x + 4.5, z), lum(x - 4.5, z)] };
  });
  console.log(JSON.stringify(r));
  t.assert(!r.err, r.err);
  const plain = (r.plain[0] + r.plain[1]) / 2, corner = r.corners.reduce((a, b) => a + b, 0) / 4;
  t.assert(r.centre < plain - 15, 'the scorch should darken its centre (test setup): centre ' + r.centre.toFixed(0) + ' plain ' + plain.toFixed(0));
  t.assert(corner > plain - (plain - r.centre) * 0.35, 'scorch is a hard square: corner luminance ' + corner.toFixed(0) + ' is as dark as the centre ' + r.centre.toFixed(0) + ' (plain runway ' + plain.toFixed(0) + ')');
});
