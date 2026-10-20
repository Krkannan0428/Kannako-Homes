/* QA-B-FE-08 (medium): a manual save with wanted stars shows the stars on the slot card, but loading it restores
 * zero stars (Game.serialize has no wanted field; _summary reads the live player's wanted).
 * Checks: the slot card's stars equal the wanted level the save restores.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_fe_08.js
 */
'use strict';
const { H, bootTitle } = require('./qa_b_lib_fe');

H.run('qa_b_fe_08 slot card stars vs the loaded wanted level', async (t) => {
  const { page } = await bootTitle(t);
  const r = await page.evaluate(() => {
    T_.newGame(); T_.quietRoad();
    GTP.game.debug.setWanted(3); GTP.game.advance(0.3);
    // pause -> SAVE -> slot 2
    T_.press('pause'); GTP.UI.state.pause.sel = 1; T_.press('confirm'); GTP.UI.state.pause.slotSel = 1; T_.press('confirm');
    if (GTP.UI.state.confirm) { GTP.UI.state.confirm.sel = 0; T_.press('confirm'); }
    const meta = GTP.game.slots()[1].meta;
    // pause -> LOAD GAME -> slot 2
    T_.press('cancel'); GTP.UI.state.pause.sel = 2; T_.press('confirm'); GTP.UI.state.pause.slotSel = 1; GTP.UI.state.pause.slotBtn = 0; T_.press('confirm');
    if (GTP.UI.state.confirm) { GTP.UI.state.confirm.sel = 0; T_.press('confirm'); }
    T_.finishLoading(); GTP.game.advance(0.5);
    return { cardStars: meta && meta.wanted, loadedWanted: GTP.game.player.wanted | 0, state: GTP.game.state, slot: GTP.game.activeSlot };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.state === 'playing' && r.slot === 2, 'slot 2 loaded');
  t.assert(r.cardStars === r.loadedWanted, 'the slot card shows ' + r.cardStars + ' stars but the save restores ' + r.loadedWanted);
});
