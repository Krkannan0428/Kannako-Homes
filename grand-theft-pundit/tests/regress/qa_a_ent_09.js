// QA-A-ENT-09: a swimmer is in the water, not lying on top of it.
// Entering the water sets ped.y = WATER_Y + 0.25 and Ped.syncMesh lowers the mesh only 0.12 m while the swim tilt
// (-1.35 rad, about the feet) lays the figure flat: hips, torso and legs ride 0.2-0.4 m above the surface and only
// the hands dip in. Walks the player off the Pennant Point quay (seed 7) and checks the hip pivot against the water.
'use strict';
const H = require('../_harness');
H.run('qa_a_ent_09 swimmers sit in the water', async (t) => {
  const ctx = await t.boot({ seed: 7, clock: 12 });
  const r = await ctx.page.evaluate(() => {
    const g = GTP.game, p = g.player;
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    for (const e of GTP.Entities.list.slice()) if ((e.kind === 'vehicle' && !e.hasPlayer()) || e.kind === 'ped') e.destroy();
    g.debug.teleport(468, 206); g.advance(0.2);
    p.yaw = -Math.PI / 2; GTP.Render.rig.yaw = p.yaw;
    GTP.Input.set('forward', true); for (let i = 0; i < 150 && !p.swimming; i++) g.advance(1 / 30); g.advance(1.0); GTP.Input.set('forward', false); g.advance(0.6);
    GTP.Entities.sync(1); p.mesh.updateMatrixWorld(true);
    const hip = new THREE.Vector3(); const torso = p.mesh.getObjectByName('torso'); if (torso) torso.getWorldPosition(hip);
    const bb = new THREE.Box3().setFromObject(p.mesh);
    return { swimming: !!p.swimming, hasTorso: !!torso, hipY: hip.y, minY: bb.min.y, waterY: GTP.C.WATER_Y };
  });
  console.log(JSON.stringify(r));
  t.assert(r.swimming && r.hasTorso, 'test setup: the player is not swimming');
  t.assert(r.hipY < r.waterY + 0.1, 'swimmer floats on the water: hips at ' + r.hipY.toFixed(2) + ' m, ' + (r.hipY - r.waterY).toFixed(2) + ' m above the surface (' + r.waterY + ')');
});
