/* QA-A-NGT-07: it rains under the Loop deck. Render.weather.frame wraps the streak cloud (QUALITY.rainCount drops) in an
 * 18 m box around the camera with no notion of cover, so standing or driving on the road under the elevated Loop (the
 * deck is 7 m up) the drops fall between the pillars right in front of the camera, through the deck slab.
 * Puts the camera on the road under the deck at two places in the rain and counts the drawn drops that are under
 * the deck slab (deck tile overhead, drop below the deck); a covered road should have none. */
'use strict';
const H = require('../_harness');

H.run('qa_a_ngt_07 no rain under the Loop deck', async (t) => {
  const ctx = await t.boot({ seed: 7, quality: 'medium', weather: 'rain', clock: 22 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, d = GTP.game.debug, R = GTP.Render, Wx = R.weather, DY = GTP.C.DECK_Y, out = [];
    const spots = [];
    for (let tz = 100; tz < 160 && spots.length < 1; tz++) { const i = tz * W.w + 46; if (W.deck[i] && W.tiles[i] === W.T.ROAD && W.deck[i + 2 * W.w] && W.deck[i - 2 * W.w]) spots.push([46 * 4 + 2, tz * 4 + 2]); }
    for (let tz = 40; tz < 100 && spots.length < 2; tz++) for (let tx = 30; tx < 60 && spots.length < 2; tx++) { const i = tz * W.w + tx; if (W.deck[i] && W.tiles[i] === W.T.ROAD && W.deck[i + 2 * W.w] && W.deck[i - 2 * W.w] && Math.abs(tz * 4 - spots[0][1]) > 80) spots.push([tx * 4 + 2, tz * 4 + 2]); }
    for (const s of spots) {
      d.followCam(); d.teleport(s[0], s[1]); GTP.game.advance(0.2);
      d.freeCam(s[0], 1.6, s[1] - 6, s[0], 2.8, s[1] + 30);
      Wx.frame(1 / 30, R.camera);
      const pos = Wx._rain.geometry.attributes.position, n = Wx._rain.geometry.drawRange.count;
      let covered = 0, total = 0;
      for (let i = 0; i < Math.min(n, pos.count); i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (Math.hypot(x - s[0], z - s[1]) > 12) continue;
        total++;
        const tx = Math.floor(x / 4), tz = Math.floor(z / 4);
        if (W.inBounds(tx, tz) && W.deck[tz * W.w + tx] && y < DY - 0.4 && y > 0) covered++;
      }
      out.push({ at: s, visible: Wx._rain.visible, near: total, underDeck: Wx._rain.visible ? covered : 0 });
    }
    return out;
  });
  console.log('  rain under the deck: ' + JSON.stringify(r));
  t.assert(r.length === 2, 'two road spots under the deck: ' + JSON.stringify(r));
  r.forEach((s) => t.assert(s.underDeck === 0, 'at ' + s.at + ' ' + s.underDeck + ' of ' + s.near + ' nearby drops fall under the deck slab'));
});
