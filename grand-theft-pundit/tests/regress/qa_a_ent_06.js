// QA-A-ENT-06: a pedestrian's speech bubble is not drawn through a building.
// UI drawBarks draws the bubble of every ped within 40 m of the camera whose mesh is visible, with no occlusion test:
// a ped on the far side of a block "talks" through the facade. Puts a ped behind the 12.8 m building at (310, 440)
// (seed 7), the camera on the street in front of it, and reads the HUD canvas where the bubble would be.
'use strict';
const H = require('../_harness');
H.run('qa_a_ent_06 speech bubbles are hidden behind buildings', async (t) => {
  const ctx = await t.boot({ seed: 7, clock: 12 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, g = GTP.game, R = GTP.Render;
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    for (const e of GTP.Entities.list.slice()) if ((e.kind === 'vehicle' && !e.hasPlayer()) || e.kind === 'ped') e.destroy();
    const b = W.buildings.find((q) => q.aabb.x0 === 304 && q.aabb.z0 === 432);
    if (!b) return { err: 'building not found' };
    const camZ = b.aabb.z1 + 10;
    g.debug.teleport(b.cx + 3, camZ + 1); g.advance(0.3);
    function bubbleAlpha(ped) {
      ped.speakLine('CAN YOU SEE ME');
      g.debug.freeCam(b.cx - 2, 2.0, camZ, b.cx, 4, b.cz); g.render();
      const s = R.worldToScreen(ped.x, ped.y + 2.25, ped.z), hud = R.hudCanvas, k = hud.width / hud.getBoundingClientRect().width;
      const d = R.hudCtx.getImageData(Math.round((s.sx - 30) * k), Math.round((s.sy - 30) * k), Math.round(60 * k), Math.round(22 * k)).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 100) n++;
      return n;
    }
    // control: the same ped in plain view in front of the building
    const front = g.debug.spawnPed(b.cx, b.aabb.z1 + 2.5); front.persistent = true; front.ai = null; g.advance(0.2);
    const seen = bubbleAlpha(front); front.destroy();
    const back = g.debug.spawnPed(b.cx, b.aabb.z0 - 2.2); back.persistent = true; back.ai = null; g.advance(0.2);
    const hidden = bubbleAlpha(back);
    return { seen, hidden, behind: back.z < b.aabb.z0 };
  });
  console.log(JSON.stringify(r));
  t.assert(!r.err, r.err);
  t.assert(r.seen > 50, 'a ped in plain view should show its bubble (test setup): ' + r.seen);
  t.assert(r.behind, 'test setup: ped not behind the building');
  t.assert(r.hidden < 10, 'the bubble of a ped behind the building is drawn over the facade (' + r.hidden + ' opaque HUD pixels)');
});
