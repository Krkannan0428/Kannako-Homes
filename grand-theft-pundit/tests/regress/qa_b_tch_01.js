/* QA-B-TCH-01: on a touch screen the map / phone page cannot be closed.
 * The MAP touch button opens the page (state 'paused', page 'phone'), but drawTouch only draws the touch buttons
 * in state 'playing', the phone records no close / back hit region (js/11_ui.js drawPhone), and handleTouch sends
 * every touch on a paused page to pointerTap or the map. The footer even says "MAP / BACK close".
 * This test opens the page with a tap on the MAP button at 400x800 (touch), then tries a tap on every clickable
 * region the page draws plus the spot where the MAP / PAUSE buttons were: at least one must return to 'playing'.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_tch_01.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_tch_01 touch can close the map page', async (t) => {
  const ctx = await t.browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  await page.goto(t.url({ headless: 1, skipTitle: 1, seed: 7, mute: 1 }));
  await t.waitPlaying(page);
  await page.touchscreen.tap(280, 320);
  const r = await page.evaluate(() => {
    const tap = (x, y) => {
      GTP.UI.touch.handle({ type: 'touchstart', changedTouches: [{ identifier: 1, clientX: x, clientY: y }] });
      GTP.game.advance(1 / 60);
      GTP.UI.touch.handle({ type: 'touchend', changedTouches: [{ identifier: 1, clientX: x, clientY: y }] });
      GTP.game.advance(1 / 60); GTP.game.render();
    };
    GTP.game.advance(0.3); GTP.game.render();
    const mapBtn = GTP.UI.state.touch.buttons.find((b) => b.id === 'map'), pauseBtn = GTP.UI.state.touch.buttons.find((b) => b.id === 'pause');
    const open = () => { if (GTP.game.state !== 'playing') { GTP.game.setState('playing'); GTP.game.advance(0.05); } tap(mapBtn.x, mapBtn.y); };
    open();
    const opened = { state: GTP.game.state, page: GTP.UI.state.pause.page };
    const targets = [['map-button-spot', mapBtn.x, mapBtn.y], ['pause-button-spot', pauseBtn.x, pauseBtn.y]];
    for (let tab = 0; tab < 5; tab++) {
      GTP.UI.state.pause.tab = tab; GTP.game.render();
      (GTP.UI.state.hit || []).forEach((h) => { if (!/^tab-/.test(h.id) && !/^map-zoom/.test(h.id)) targets.push([h.id + '@tab' + tab, h.x + h.w / 2, h.y + h.h / 2, tab]); });
    }
    const closedBy = [];
    for (const tg of targets) {
      open(); if (tg[3] != null) { GTP.UI.state.pause.tab = tg[3]; GTP.game.render(); }
      tap(tg[1], tg[2]);
      if (GTP.game.state === 'playing') closedBy.push(tg[0]);
    }
    return { opened, tried: targets.map((x) => x[0]), closedBy };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.opened.state === 'paused' && r.opened.page === 'phone', 'the MAP touch button opens the phone page: ' + JSON.stringify(r.opened));
  t.assert(r.closedBy.length > 0, 'no tap closes the map / phone page on a touch screen; tried: ' + r.tried.join(', '));
  await ctx.close();
});
