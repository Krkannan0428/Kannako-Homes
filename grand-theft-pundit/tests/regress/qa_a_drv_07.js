/* QA-A-DRV-07: under the Loop the camera rig ignores the deck slab: in a car, looking up with the mouse lifts the chase camera
 * through the deck (rig y 8.6..9.6 above a 6.3..7 m slab) and the screen shows only the top of the deck. Render.rig.update
 * pulls in against buildings (World.raycastBuildings) only. Camera and focus must stay on the same side of the slab. */
'use strict';
const H = require('../_harness');
H.run('qa_a_drv_07 camera through the deck', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, W = GTP.World, R = GTP.Render, out = [];
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    for (const [x, z, yaw] of [[184, 186, -Math.PI / 2], [300, 376, 0]]) {
      const v = g.debug.spawnVehicle(x, z, 'sedan', { yaw, y: 0 }); v.y = 0; g.debug.teleport(x, z, 0); v.enter(p, 0);
      R.rig.yaw = yaw; R.rig.snap(); g.advance(0.1);
      for (let i = 0; i < 10; i++) { GTP.Input.setLook(0, 30); g.advance(1 / 60); }
      GTP.Input.setLook(0, 0); g.advance(0.05);
      const c = R.rig.pos, f = R.rig.focus, deckAt = (a) => !!W.deck[W.tileIndex(Math.floor(a.x / 4), Math.floor(a.z / 4))];
      out.push({ at: [x, z], underDeck: deckAt({ x, z }), carY: +v.y.toFixed(2), cam: [+c.x.toFixed(1), +c.y.toFixed(2), +c.z.toFixed(1)], camOverDeck: deckAt(c), focusY: +f.y.toFixed(2), pitch: +R.rig.pitch.toFixed(2) });
      p.exitVehicle(); g.advance(0.1); v.destroy(); g.debug.teleport(300, 300); g.advance(0.1);
    }
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  for (const q of r) {
    t.assert(q.underDeck && q.carY < 1, 'setup: the car is on the street under the deck ' + JSON.stringify(q));
    t.assert(!(q.camOverDeck && q.cam[1] > 6.3), 'the camera stays under the deck slab (y < 6.3): ' + JSON.stringify(q));
  }
});
