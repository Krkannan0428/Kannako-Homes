/* QA-B-FE-04 (medium): Backspace (and Esc) are bound to the 'back' movement action, so holding the menu back-out
 * key in play reverses the car / walks the player backwards.
 * Checks: a stopped car does not move while Backspace is held for 2 s.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_fe_04.js
 */
'use strict';
const { H, bootTitle } = require('./qa_b_lib_fe');

H.run('qa_b_fe_04 Backspace drives backwards', async (t) => {
  const { page } = await bootTitle(t);
  const a = await page.evaluate(() => { T_.newGame(); T_.quietRoad(); T_.carUp('sedan'); const v = GTP.game.player.inVehicle; GTP.game.advance(0.5); return { inCar: !!v, x: v.x, z: v.z }; });
  t.assert(a.inCar, 'in a car');
  await page.keyboard.down('Backspace');
  await page.evaluate(() => GTP.game.advance(2));
  const b = await page.evaluate(() => { const v = GTP.game.player.inVehicle; return { x: v.x, z: v.z, speed: v.speed, state: GTP.game.state }; });
  await page.keyboard.up('Backspace');
  const moved = Math.hypot(b.x - a.x, b.z - a.z);
  console.log('  Backspace held 2 s: moved ' + moved.toFixed(2) + ' m, speed ' + b.speed.toFixed(2) + ', state ' + b.state);
  t.assert(moved < 1, 'holding Backspace (a menu back-out key) must not reverse the car: moved ' + moved.toFixed(2) + ' m');
});
