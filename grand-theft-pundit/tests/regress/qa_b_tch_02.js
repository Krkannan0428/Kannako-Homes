/* QA-B-TCH-02: on a touch screen a cutscene cannot be skipped, although the pill reads "HOLD TAP TO SKIP" and
 * "BACK skips the shot". Cutscenes.update (js/12_cutscenes.js) skips on Input.down('confirm') held or
 * Input.pressed('back'), and no touch path ever sets 'confirm' or 'back' (js/11_ui.js handleTouch: in state
 * 'cutscene' a touch goes to the invisible gameplay buttons, the stick or the look area).
 * This test plays cs_opening at 400x800 (touch) and holds a finger on the screen centre and then on the skip pill
 * for 3 s each (skipHold is shorter): the cutscene must be skipped.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_tch_02.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_tch_02 touch can skip a cutscene', async (t) => {
  const ctx = await t.browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  await page.goto(t.url({ headless: 1, skipTitle: 1, seed: 7, mute: 1 }));
  await t.waitPlaying(page);
  await page.touchscreen.tap(280, 320);
  const r = await page.evaluate(() => {
    GTP.game.advance(0.2);
    const Cs = GTP.Cutscenes; if (!Cs.scriptFor('cs_opening')) return { none: true };
    let done = false; Cs.play('cs_opening', () => { done = true; }); GTP.game.advance(0.8);
    const W = GTP.Render.width, Hh = GTP.Render.height, out = { state: GTP.game.state };
    const hold = (id, x, y) => {
      GTP.UI.touch.handle({ type: 'touchstart', changedTouches: [{ identifier: id, clientX: x, clientY: y }] });
      GTP.game.advance(3);
      GTP.UI.touch.handle({ type: 'touchend', changedTouches: [{ identifier: id, clientX: x, clientY: y }] });
      GTP.game.advance(0.05);
    };
    hold(1, W / 2, Hh / 2); out.afterCentre = done || !Cs.active;
    if (!out.afterCentre) { hold(2, W - 70, Hh - 40); }
    out.skipped = done || !Cs.active;
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(!r.none && r.state === 'cutscene', 'cs_opening plays: ' + JSON.stringify(r));
  t.assert(r.skipped, 'holding a finger on the screen (or on the HOLD TAP TO SKIP pill) for 3 s must skip the cutscene');
  await ctx.close();
});
