/* QA-A-CAM-01: aiming on foot at a building less than ~8 m away throws the camera 7.5 m forward into the building.
 * In aim mode Render.rig.update puts the focus 8 m ahead of the player (+0.7 m right); when that point is inside a building the
 * final guard raycasts from the focus (inside the box, U.rayAabb returns t = 0) and places the camera 0.5 m from the focus,
 * i.e. inside the wall at knee height. The over-the-shoulder camera must stay behind the player and out of the building. */
'use strict';
const H = require('../_harness');
H.run('qa_a_cam_01 aim camera at a near wall', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, W = GTP.World, R = GTP.Render, out = [];
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0; g.debug.godMode(true);
    const inB = (x, y, z) => W.buildings.some((b) => x > b.x && x < b.x + b.w && z > b.z && z < b.z + b.d && y > b.y && y < b.y + b.h);
    // tall buildings with open walkable ground 3 tiles west of their west face
    const cands = W.buildings.filter((b) => {
      if (b.h < 12) return false;
      const tz = b.tz + (b.td >> 1);
      for (let k = 1; k <= 3; k++) if (!W.isWalkable(W.tile(b.tx - k, tz)) || W.deck[tz * W.w + b.tx - k]) return false;
      return true;
    }).slice(0, 3);
    for (const b of cands) {
      for (const dist of [3, 6]) {
        const x = b.x - dist, z = b.z + b.d / 2 + 0.5, yaw = -Math.PI / 2;   // facing east, at the wall
        g.debug.teleport(x, z); p.yaw = p.moveYaw = p.aimYaw = yaw; R.rig.yaw = yaw; R.rig.pitch = 0.1; R.rig.snap(); g.advance(1 / 60);
        GTP.Input.set('aim', true); for (let i = 0; i < 40; i++) g.advance(1 / 60);
        const c = R.camera.position;
        out.push({ b: b.id, dist, aiming: !!p.aiming, player: [+p.x.toFixed(2), +p.z.toFixed(2)], cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], camAhead: +(c.x - p.x).toFixed(2), camInBuilding: inB(c.x, c.y, c.z) });
        GTP.Input.set('aim', false); g.advance(0.3);
      }
    }
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.length >= 4, 'setup: found walls to aim at');
  for (const q of r) {
    t.assert(q.aiming, 'setup: aim mode is on ' + JSON.stringify(q));
    t.assert(!q.camInBuilding, 'the aim camera is not inside the building: ' + JSON.stringify(q));
    t.assert(q.camAhead < 0.5, 'the aim camera stays behind the player (not ' + q.camAhead + ' m ahead): ' + JSON.stringify(q));
  }
});
