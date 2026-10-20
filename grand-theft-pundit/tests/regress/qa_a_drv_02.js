/* QA-A-DRV-02: getting out of a car parked against a Loop deck barrier puts the player on the street 7 m below.
 * Vehicle.doorSpot accepts a door point past the deck edge (World.resolveCapsule only applies the deck barrier when the
 * point's own tile is a deck tile), and exit() then sets y = heightAt(..) = the ground. */
'use strict';
const H = require('../_harness');
H.run('qa_a_drv_02 exit at the deck barrier', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, W = GTP.World, out = [];
    // upper west leg against the outer barrier (x 176), upper north leg against z 128, lower east leg against x 432
    for (const [x, z, yaw] of [[177.2, 300, 0], [300, 129.2, -Math.PI / 2], [430.8, 250, Math.PI]]) {
      const v = g.debug.spawnVehicle(x, z, 'sedan', { yaw, y: 7 }); v.y = 7;
      g.debug.teleport(x, z, 7); v.enter(p, 0); g.advance(0.3);
      const car = [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
      p.exitVehicle(); g.advance(0.3);
      out.push({ car, player: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], deckTile: !!W.deck[W.tileIndex(Math.floor(p.x / 4), Math.floor(p.z / 4))] });
      g.debug.teleport(300, 300); v.destroy(); g.advance(0.1);
    }
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  for (const q of r) {
    t.assert(q.car[1] === 7, 'setup: the car sits on the deck ' + JSON.stringify(q.car));
    t.assert(q.player[1] > 6 && q.deckTile, 'the player steps out onto the deck, not onto the street below: ' + JSON.stringify(q));
  }
});
