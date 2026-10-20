/* QA-A-CAM-06: backing a bus or truck up to a wall pulls the chase camera in to just over its own roof (0.5-0.9 m above it,
 * right behind the focus), and the roof fills about three quarters of the screen: the road ahead cannot be seen. The rig's
 * pull-in (Render.rig._pullIn / guard) shortens the boom along the same pitch and never raises it to clear the vehicle.
 * Normal chase view: the bus covers ~20% of the screen; against the wall ~75%. Require < 40%. */
'use strict';
const H = require('../_harness');
H.run('qa_a_cam_06 bus against a wall: camera over the roof', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, W = GTP.World, R = GTP.Render, out = [];
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0; g.debug.godMode(true);
    const spots = W.buildings.filter((b) => b.h >= 9 && [1, 2, 3].every((k) => W.isWalkable(W.tile(b.tx - k, b.tz + (b.td >> 1))) && !W.deck[(b.tz + (b.td >> 1)) * W.w + b.tx - k])).filter((_, i) => i % 7 === 0).slice(0, 2);
    for (const b of spots) for (const ty of ['bus', 'truck']) {
      const z = b.z + b.d / 2 + 0.5, yaw = Math.PI / 2;   // facing west, rear to the west face
      const v = g.debug.spawnVehicle(b.x - 30, z, ty, { yaw }); v.persistent = true;
      g.debug.teleport(b.x - 30, z); v.enter(p, 0); g.advance(0.05);
      R.rig.yaw = yaw; R.rig.pitch = 0.14; R.rig.snap(); g.advance(2 / 60);
      const baseline = (() => { GTP.Entities.sync(1); R.camera.updateMatrixWorld(); v.mesh.updateMatrixWorld(true); const rc = new THREE.Raycaster(); let hit = 0, n = 0; for (let i = 0; i < 32; i++) for (let j = 0; j < 18; j++) { rc.setFromCamera(new THREE.Vector2((i + 0.5) / 16 - 1, (j + 0.5) / 9 - 1), R.camera); n++; if (rc.intersectObject(v.mesh, true).length) hit++; } return +(hit / n).toFixed(2); })();
      const half = v.cls.length / 2;
      g.debug.teleport(b.x - half - 0.35, z); v.yaw = yaw; v.snap();
      R.rig.yaw = yaw; R.rig.pitch = 0.14; R.rig.snap(); g.advance(2 / 60);
      // fraction of the screen covered by the own vehicle: rays through a 32 x 18 grid against its mesh
      const cover = () => {
        GTP.Entities.sync(1); R.camera.updateMatrixWorld(); v.mesh.updateMatrixWorld(true);
        const rc = new THREE.Raycaster(); let hit = 0, n = 0;
        for (let i = 0; i < 32; i++) for (let j = 0; j < 18; j++) { rc.setFromCamera(new THREE.Vector2((i + 0.5) / 16 - 1, (j + 0.5) / 9 - 1), R.camera); n++; if (rc.intersectObject(v.mesh, true).length) hit++; }
        return +(hit / n).toFixed(2);
      };
      const blocked = cover(), c = R.camera.position;
      out.push({ b: b.id, ty, cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], roofY: +(v.y + v.cls.height).toFixed(2), screenCovered: blocked, openRoadBaseline: baseline });
      p.exitVehicle(); g.advance(0.1); v.destroy(); g.advance(0.05);
    }
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.length >= 2, 'setup');
  for (const q of r) t.assert(q.screenCovered < 0.4, 'the own vehicle covers less than 40% of the screen, not ' + q.screenCovered + ' ('  + q.ty + '): ' + JSON.stringify(q));
});
