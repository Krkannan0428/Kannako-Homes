/* QA-B-FE-01 (high): a double-click on a slot card's OVERWRITE overwrites the save without a real confirmation.
 * The in-page OVERWRITE SLOT 2? box draws its destructive button under the pointer that opened it (and hover
 * pre-selects it), so the second click of a double-click lands on OVERWRITE.
 * Checks: two clicks at the same spot on slot 2's OVERWRITE leave slot 2's save intact.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_fe_01.js
 */
'use strict';
const { H, bootTitle } = require('./qa_b_lib_fe');

H.run('qa_b_fe_01 double-click OVERWRITE', async (t) => {
  const { page } = await bootTitle(t);
  await page.evaluate(() => {
    T_.newGame(); T_.quietRoad();
    GTP.game.debug.setMoney(1234); GTP.game.saveSlot(1, { quiet: true });
    GTP.game.debug.setMoney(5678); GTP.game.saveSlot(2, { quiet: true });
    T_.quitToTitle();
    T_.sel('play'); T_.press('confirm'); GTP.game.render();   // saves exist: the NEW GAME slot picker
  });
  const r = await page.evaluate(() => ({ page: GTP.UI.state.title.page, mode: GTP.UI.state.title.slotMode, btn: T_.hitById('slot-new-2') }));
  t.assert(r.page === 'slots' && r.mode === 'new' && r.btn, 'the NEW GAME picker shows slot 2 OVERWRITE: ' + JSON.stringify(r));
  const x = r.btn.x, y = r.btn.y0 + r.btn.h * 0.8;   // the lower part of the button
  await page.mouse.click(x, y);
  const c = await page.evaluate(() => { GTP.game.render(); const cf = GTP.UI.state.confirm; return { title: cf && cf.title, sel: cf && cf.sel }; });
  console.log('  first click: ' + JSON.stringify(c));
  t.assert(c.title === 'OVERWRITE SLOT 2?', 'the first click asks in-page');
  await page.mouse.click(x, y);   // the second click of a double-click
  const after = await page.evaluate(() => { GTP.game.advance(1 / 60); const m = GTP.game.slots()[1].meta; return { state: GTP.game.state, money: m && m.money }; });
  console.log('  after the second click: ' + JSON.stringify(after));
  t.assert(after.money === 5678 && after.state === 'title', 'a double-click must not overwrite slot 2 (money ' + after.money + ', state ' + after.state + ')');
});
