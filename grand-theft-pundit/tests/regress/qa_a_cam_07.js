/* QA-A-CAM-07: buildings pop in after a teleport into an area that was not built yet (loading a save, mission/cutscene
 * moves, respawn) and right after the boot. Render.ensureChunks builds at most 3 chunks per frame once 8 exist, nearest
 * first, and only the boot prebuilds (100 m around the spawn), so the first frames show empty ground / sky where chunks
 * 37-83 m away belong (18-22 frames to fill in). After a teleport the first rendered frame must not miss any chunk that
 * is in view and closer than the fog start. Uses the live budget (Render.headless = false). */
'use strict';
const H = require('../_harness');
H.run('qa_a_cam_07 chunk pop-in after a teleport', async (t) => {
  const { page } = await t.boot({ seed: 7, quality: 'medium' });
  const r = await page.evaluate(() => {
    const g = GTP.game, R = GTP.Render, C = GTP.C, out = [];
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    const missing = () => {
      const cam = R.camera, S = C.TILE * C.CHUNK_TILES; cam.updateMatrixWorld();
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const n = Math.ceil(GTP.World.w / C.CHUNK_TILES); const list = [];
      for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
        const cx = Math.max(x * S, Math.min(cam.position.x, x * S + S)), cz = Math.max(z * S, Math.min(cam.position.z, z * S + S));
        const dn = Math.hypot(cx - cam.position.x, cz - cam.position.z);
        if (dn > R.scene.fog.near) continue;
        if (!fr.intersectsBox(new THREE.Box3(new THREE.Vector3(x * S, -2, z * S), new THREE.Vector3(x * S + S, 30, z * S + S)))) continue;
        if (!R.chunks.has(x + ',' + z)) list.push(x + ',' + z + '@' + Math.round(dn));
      }
      return list;
    };
    R.headless = false;   // the live chunk budget
    for (const [x, z, yaw] of [[560, 610, Math.PI], [760, 300, 0]]) {
      R.invalidateAll(); R.prebuild(110, 270, 300);   // only the campus was ever seen
      g.debug.teleport(x, z); g.player.yaw = yaw; R.rig.yaw = yaw; R.rig.snap(); g.advance(1 / 60);
      g.render();
      out.push({ at: [x, z], missingInView: missing() });
    }
    R.headless = true;
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  for (const q of r) t.assert(q.missingInView.length === 0, 'no chunk in view closer than the fog start is missing on the first frame after a teleport: ' + JSON.stringify(q));
});
