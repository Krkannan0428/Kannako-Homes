// QA-A-ENT-02: a running pedestrian keeps a foot on the ground.
// Ped.syncMesh swings both straight legs +-1.05 rad about the hips and adds the bob upward, so through the run cycle
// the lowest point of the figure rides 3-28 cm above the pavement (never touching it): runners hover.
'use strict';
const H = require('../_harness');
H.run('qa_a_ent_02 running peds keep a foot on the ground', async (t) => {
  const ctx = await t.boot({ seed: 7, clock: 12 });
  const r = await ctx.page.evaluate(() => {
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    for (const e of GTP.Entities.list.slice()) if ((e.kind === 'vehicle' && !e.hasPlayer()) || e.kind === 'ped') e.destroy();
    GTP.game.debug.teleport(150, 810); GTP.game.advance(0.2);
    const p = GTP.game.debug.spawnPed(160, 824); p.persistent = true;
    const bb = new THREE.Box3(), ys = [];
    for (let i = 0; i < 150; i++) {
      p.moveTo(p.x + 20, p.z, true);
      GTP.game.advance(1 / 60); GTP.Entities.sync(1);
      if (i < 40) continue;
      p.mesh.updateMatrixWorld(true); bb.setFromObject(p.mesh);
      ys.push(bb.min.y - GTP.World.heightAt(p.x, p.z, p.y));
    }
    return { state: p.state, speed: p.speed, min: Math.min(...ys), max: Math.max(...ys), over10: ys.filter((y) => y > 0.1).length / ys.length };
  });
  console.log(JSON.stringify(r));
  t.assert(r.state === 'run' && r.speed > 3, 'ped is not running: ' + r.state + ' ' + r.speed);
  t.assert(r.max < 0.08, 'running ped hovers: lowest point up to ' + r.max.toFixed(3) + ' m above the ground (' + Math.round(r.over10 * 100) + '% of frames above 10 cm)');
});
