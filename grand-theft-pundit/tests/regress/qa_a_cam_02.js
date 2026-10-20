/* QA-A-CAM-02: first-person on foot (V twice) facing a wall sees through the building: the eye sits 0.15 m in front of the
 * player's centre, 0.25-0.27 m from the wall, but the camera near plane is 0.3 m (and its corners reach ~0.47 m), so the
 * wall face is clipped away and the whole street behind the building shows. The first-person rig has no collision at all
 * (the guard runs only when mode !== 'first'). No point of the near-plane rectangle may lie inside a building. */
'use strict';
const H = require('../_harness');
H.run('qa_a_cam_02 first person near plane through walls', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, W = GTP.World, R = GTP.Render, out = [];
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0; g.debug.godMode(true);
    const inB = (v) => W.buildings.some((b) => v.x > b.x && v.x < b.x + b.w && v.z > b.z && v.z < b.z + b.d && v.y > b.y && v.y < b.y + b.h);
    const cands = W.buildings.filter((b) => b.h >= 12 && W.tile(b.tx - 1, b.tz + (b.td >> 1)) === W.T.SIDEWALK && !W.deck[(b.tz + (b.td >> 1)) * W.w + b.tx - 1]).slice(0, 3);
    for (const b of cands) {
      const yaw = -Math.PI / 2;   // facing east, into the west face
      g.debug.teleport(b.x - 0.42, b.z + b.d / 2 + 0.5); p.yaw = p.moveYaw = p.aimYaw = yaw;
      p.cameraMode = 'first'; R.rig.yaw = yaw; R.rig.pitch = 0; R.rig.snap(); g.advance(2 / 60);
      const cam = R.camera; cam.updateMatrixWorld();
      const n = cam.near, hh = Math.tan(cam.fov * Math.PI / 360) * n, hw = hh * cam.aspect; let k = 0;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) { const v = new THREE.Vector3(sx * hw, sy * hh, -n).applyMatrix4(cam.matrixWorld); if (inB(v)) k++; }
      out.push({ b: b.id, player: [+p.x.toFixed(2), +p.z.toFixed(2)], cam: [+cam.position.x.toFixed(2), +cam.position.z.toFixed(2)], wallX: b.x, near: n, nearPointsInside: k });
      p.cameraMode = 'chase'; g.advance(0.05);
    }
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.length >= 2, 'setup: found walls');
  for (const q of r) {
    t.assert(q.player[0] < q.wallX, 'setup: the player stands outside the wall ' + JSON.stringify(q));
    t.assert(q.nearPointsInside === 0, 'the first-person near plane does not cut into the wall: ' + JSON.stringify(q));
  }
});
