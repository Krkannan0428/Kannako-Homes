/* smoke.js: boots headless, advances 10 s, asserts no errors, renders, screenshots. */
'use strict';
const H = require('./_harness');

H.run('smoke', async (t) => {
  const { page, pageErrors, consoleErrors } = await t.openGame({ seed: 7 });
  const steps = await page.evaluate(() => GTP.game.advance(10));
  t.assert(steps === 600, 'advance(10) ran ' + steps + ' steps, expected 600');
  const errs = await t.gameErrors(page);
  t.assert(errs.length === 0, 'GTP.errors not empty:\n' + errs.join('\n'));
  t.assert(pageErrors.length === 0, 'page errors:\n' + pageErrors.join('\n'));
  t.assert(consoleErrors.length === 0, 'console errors:\n' + consoleErrors.join('\n'));
  const info = await page.evaluate(() => ({
    state: GTP.game.state, t: GTP.game.time.t, player: { x: GTP.game.player.x, y: GTP.game.player.y },
    solid: GTP.World.solidAt(GTP.game.player.x, GTP.game.player.y),
    ents: GTP.Entities.list.length, landmarks: GTP.World.landmarks.length, districts: GTP.World.districts.length
  }));
  t.assert(info.state === 'playing', 'state is ' + info.state);
  t.assert(Math.abs(info.t - 10) < 1e-6, 'sim time is ' + info.t);
  t.assert(!info.solid, 'player spawned inside a solid tile');
  t.assert(info.landmarks >= 24, 'only ' + info.landmarks + ' landmarks');
  t.assert(info.districts >= 6, 'only ' + info.districts + ' districts');
  const file = await t.screenshot(page, 'smoke');
  const errs2 = await t.gameErrors(page);
  t.assert(errs2.length === 0, 'errors after render:\n' + errs2.join('\n'));
  console.log('  screenshot: ' + file + '  player=' + JSON.stringify(info.player));
});
