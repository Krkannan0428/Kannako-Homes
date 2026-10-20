/* QA-A-CAM-05: the chase camera goes inside solid props. Render.rig only raycasts World.buildings, so orbiting the camera
 * (or the auto-yaw turning a corner) next to a container stack in the Manifest Container Yard, or an airliner on the apron
 * puts the camera inside the prop: the screen shows container ribs / the fuselage from inside and hides
 * the player. The camera must not end up inside a solid container box. */
'use strict';
const H = require('../_harness');
H.run('qa_a_cam_05 chase camera inside containers', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, W = GTP.World, R = GTP.Render, out = [];
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0; g.debug.godMode(true);
    const conts = W.props.filter((q) => q.kind === 'container');
    const inCont = (c) => conts.some((q) => {
      const rot = q.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot), dx = c.x - q.x, dz = c.z - q.z;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      return Math.abs(lx) < 1.1 && Math.abs(lz) < 2.9 && c.y > (q.y || 0) && c.y < (q.y || 0) + 2.6;
    });
    const stacks = conts.filter((q) => q.y > 2 && (q.rot || 0) === 0).filter((_, i) => i % 23 === 0);
    for (const c of stacks) {
      if (out.length >= 3) break;
      for (const side of [-1, 1]) {
        const x = c.x + side * 3.4, z = c.z;
        if (conts.some((q) => Math.abs(q.x - x) < 1.6 && Math.abs(q.z - z) < 3.2)) continue;
        g.debug.teleport(x, z); g.advance(0.05);
        R.rig.yaw = GTP.util.dirToYaw(p.x - c.x, p.z - c.z); R.rig.pitch = 0.15; R.rig.snap(); g.advance(1 / 60);
        const cam = R.camera.position;
        out.push({ stack: [c.x, c.z], player: [+p.x.toFixed(2), +p.z.toFixed(2)], cam: [+cam.x.toFixed(2), +cam.y.toFixed(2), +cam.z.toFixed(2)], camInContainer: inCont(cam) });
        break;
      }
    }
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.length >= 2, 'setup: found container stacks');
  for (const q of r) t.assert(!q.camInContainer, 'the chase camera is not inside a container: ' + JSON.stringify(q));
});
