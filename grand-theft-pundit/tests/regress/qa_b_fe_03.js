/* QA-B-FE-03 (medium): Enter used as a menu / dialogue confirm also fires the 'enter' action (get out of the car).
 * Enter is bound to ['enter', 'confirm']; UI.handleInput consumes the confirm but player.control still runs in the
 * same step and reads pressed('enter').
 * Checks: in a car, (a) Esc then Enter on RESUME and (b) Enter to advance a dialogue line leave the player in the car.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_fe_03.js
 */
'use strict';
const { H, bootTitle } = require('./qa_b_lib_fe');

H.run('qa_b_fe_03 Enter as confirm exits the car', async (t) => {
  const { page } = await bootTitle(t);
  const a = await page.evaluate(() => { T_.newGame(); T_.quietRoad(); T_.carUp('sedan'); T_.press('pause'); return { inCar: !!GTP.game.player.inVehicle, state: GTP.game.state, sel: GTP.UI.state.pause.sel }; });
  t.assert(a.inCar && a.state === 'paused' && a.sel === 0, 'paused in a car with RESUME selected: ' + JSON.stringify(a));
  await page.keyboard.press('Enter');
  const b = await page.evaluate(() => { GTP.game.advance(1.2); return { state: GTP.game.state, inCar: !!GTP.game.player.inVehicle }; });
  const c = await page.evaluate(() => {
    T_.carUp('sedan'); window.__n = 0;
    GTP.UI.showDialogue({ who: 'firmness', name: 'Merle', text: 'Short line.' }, () => { __n++; });
    GTP.game.advance(1.0);
    return { inCar: !!GTP.game.player.inVehicle, dlg: !!GTP.UI.state.dialogue };
  });
  await page.keyboard.press('Enter');
  const d = await page.evaluate(() => { GTP.game.advance(1.2); return { advanced: __n, inCar: !!GTP.game.player.inVehicle }; });
  console.log('  RESUME: ' + JSON.stringify(b) + '  dialogue: ' + JSON.stringify(c) + ' -> ' + JSON.stringify(d));
  const fails = [];
  if (!(b.state === 'playing' && b.inCar)) fails.push('Enter on RESUME took the player out of the car');
  if (!(c.inCar && d.advanced === 1 && d.inCar)) fails.push('Enter on a dialogue line took the player out of the car');
  t.assert(!fails.length, fails.join('; '));
});
