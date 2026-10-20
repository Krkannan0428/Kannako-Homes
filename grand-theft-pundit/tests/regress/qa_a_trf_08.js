/* QA-A-TRF-08: the Manifest Ramp (Lower Loop, x 432..468, z 628..636) shares its lane bytes with the ground street that
 * runs on under the Lower Loop's leg (tiles 100..107, 157..158). stepLayer() returns 'ground' for that street before it
 * checks the deck, so (a) a car climbing the ramp westbound plans to go straight along the ground street, arrives on
 * the deck at 11 m/s heading across the leg and slams into the far barrier at x 418, and (b) a ground car driving east
 * on the street under the deck drives into the ramp's 7 m high end at x 432 and rams it over and over.
 * Expect the climbing car to merge onto the Lower Loop without stopping and the ground car never to touch the ramp end. */
'use strict';
const H = require('../_harness');

H.run('qa_a_trf_08 Manifest Ramp joins the Lower Loop, not the street beneath', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, S = GTP.AI.spawner;
    const run = (s, secs) => {
      GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0; GTP.C.AI.parkedTarget = 0;
      GTP.Entities.list.forEach((x) => { if (x.kind === 'vehicle' || (x.kind === 'ped' && x.ai)) x.removed = true; });
      GTP.game.debug.teleport(450, 650); GTP.game.advance(0.05);
      const v = S.placeTraffic(s, 'sedan');
      let onDeck = false, minDeckSp = 99, maxNose = -1e9;
      for (let k = 0; k < secs * 10; k++) {
        GTP.game.advance(0.1);
        if (v.y > 6.5 && v.x < 432) { if (!onDeck) onDeck = k; if (k - onDeck < 40) minDeckSp = Math.min(minDeckSp, v.speed); }
        if (v.y < 1 && v.z > 626 && v.z < 638) { const f = GTP.util.yawToDir(v.yaw); maxNose = Math.max(maxNose, v.x + Math.abs(f.x) * v.hl + Math.abs(f.z) * v.hw); }
      }
      return { onDeck: onDeck !== false, minDeckSp: +minDeckSp.toFixed(1), maxNose: +maxNose.toFixed(2), end: [+v.x.toFixed(1), +v.z.toFixed(1), +v.y.toFixed(1)] };
    };
    return { up: run({ x: 464, z: 630, y: 0.4, tx: 116, tz: 157, axis: 'h', dir: -1, laneC: 630, deck: false }, 12), under: run({ x: 404, z: 634, y: 0, tx: 101, tz: 158, axis: 'h', dir: 1, laneC: 634, deck: false }, 14) };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.up.onDeck, 'the climbing car reaches the Lower Loop deck');
  t.assert(r.up.minDeckSp > 4, 'it merges without crashing to a stop in its first 4 s on the deck: min speed ' + r.up.minDeckSp);
  t.assert(r.under.maxNose < 431.5, 'the street car under the deck never drives into the ramp end wall at x 432: front reaches x ' + r.under.maxNose + ', end ' + JSON.stringify(r.under.end));
});
