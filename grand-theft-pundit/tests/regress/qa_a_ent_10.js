// QA-A-ENT-10: in first person the player's headlight spot keeps lighting the road ahead of the car.
// Vehicle.syncMesh calls Render.syncVehicle (which places Render.lights.headlight) only while the car mesh is visible,
// and the car is hidden in first person: the spot freezes where the view was switched. After 3 s of driving at night
// the light is 44 m behind the car and the road ahead is dark.
'use strict';
const H = require('../_harness');
H.run('qa_a_ent_10 first-person headlights follow the car', async (t) => {
  const ctx = await t.boot({ seed: 7, clock: 22 });
  const r = await ctx.page.evaluate(() => {
    const g = GTP.game, p = g.player;
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    for (const e of GTP.Entities.list.slice()) if ((e.kind === 'vehicle' && !e.hasPlayer()) || e.kind === 'ped') e.destroy();
    g.debug.godMode(true);
    const v = g.debug.spawnVehicle(120, 824, 'sedan', { yaw: -Math.PI / 2 }); v.persistent = true;
    g.debug.teleport(120, 824); v.enter(p, 0); g.advance(0.5); g.render();
    p.cameraMode = 'first';
    GTP.Input.set('forward', true); g.advance(3); GTP.Input.set('forward', false); g.advance(0.2); g.render();
    const L = GTP.Render.lights.headlight, f = GTP.util.yawToDir(v.yaw);
    const dx = L.position.x - v.x, dz = L.position.z - v.z, tx = L.target.position.x - v.x, tz = L.target.position.z - v.z;
    return { lit: L.visible && L.intensity > 0, dist: Math.hypot(dx, dz), ahead: dx * f.x + dz * f.z, targetAhead: tx * f.x + tz * f.z, moved: v.x - 120 };
  });
  console.log(JSON.stringify(r));
  t.assert(r.moved > 20, 'test setup: the car did not drive');
  t.assert(r.lit, 'the headlight spot is off at night in first person');
  t.assert(r.dist < 4 && r.targetAhead > 5, 'headlight left behind: the spot is ' + r.dist.toFixed(1) + ' m from the car (target ' + r.targetAhead.toFixed(1) + ' m ahead)');
});
