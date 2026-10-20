/* QA-B-FE-02 (medium): a resting mouse pointer steals the keyboard selection in the menus.
 * drawMenuList / slotCards / drawSettings / drawConfirm re-select the hovered row on every frame, whether or not
 * the mouse moved, so arrow keys cannot move the selection while the pointer rests over the list and Enter
 * activates the hovered item.
 * Checks: pointer resting on LOAD GAME, ArrowDown twice moves the title selection to CONTROLS.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_fe_02.js
 */
'use strict';
const { H, bootTitle } = require('./qa_b_lib_fe');

H.run('qa_b_fe_02 hover steals the keyboard selection', async (t) => {
  const { page } = await bootTitle(t);
  const row = await page.evaluate(() => T_.hitById('menu-load'));
  t.assert(row, 'the title draws a LOAD GAME row');
  await page.mouse.move(row.x, row.y);
  await page.evaluate(() => GTP.game.render());
  const before = await page.evaluate(() => GTP.UI.state.title.items[GTP.UI.state.title.sel].id);
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('ArrowDown');
    await page.evaluate(() => { GTP.game.advance(1 / 60); GTP.game.render(); });
  }
  const after = await page.evaluate(() => GTP.UI.state.title.items.map((it) => it.id)[GTP.UI.state.title.sel]);
  console.log('  hovered: ' + before + ', after 2x ArrowDown: ' + after);
  t.assert(before === 'load', 'the hovered row is selected first: ' + before);
  t.assert(after === 'controls', 'two ArrowDown presses move the selection from LOAD GAME to CONTROLS even with the pointer resting on the menu: ' + after);
});
