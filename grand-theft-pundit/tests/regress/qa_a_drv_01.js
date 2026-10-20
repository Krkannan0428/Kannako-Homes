/* QA-A-DRV-01: stepping out of a car on the Lower Loop viaduct over the bay drops the player into the sea under it.
 * Vehicle.exit tests isWaterTile(x, z) (the ground layer) and ignores the deck the car is standing on. */
'use strict';
const H = require('../_harness');
H.run('qa_a_drv_01 viaduct exit', async (t) => {
  const { page } = await t.boot({ seed: 7 });
  const r = await page.evaluate(() => {
    const g = GTP.game, p = g.player, W = GTP.World, out = [];
    // the middle of both viaduct legs over the bay (deck y 7 over WATER tiles, z 520..599)
    for (const [x, z] of [[424, 540], [184, 560]]) {
      const v = g.debug.spawnVehicle(x, z, 'sedan', { yaw: Math.PI, y: 7 }); v.y = 7;
      g.debug.teleport(x, z, 7); v.enter(p, 0); g.advance(0.2);
      p.exitVehicle(); g.advance(0.5);
      out.push({ x, z, water: W.tileAt(x, z) === W.T.WATER, deck: !!W.deck[W.tileIndex(Math.floor(x / 4), Math.floor(z / 4))], y: +p.y.toFixed(2), swimming: !!p.swimming });
      g.debug.teleport(300, 300); v.destroy(); g.advance(0.1);
    }
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  for (const q of r) {
    t.assert(q.water && q.deck, 'setup: (' + q.x + ',' + q.z + ') is a viaduct deck tile over water');
    t.assert(q.y > 6 && !q.swimming, 'stepping out on the viaduct keeps the player on the deck (y ' + q.y + ', swimming ' + q.swimming + ')');
  }
});
