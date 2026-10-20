/* QA-B-TCH-09: on a touch screen the phone's MISSIONS and REPLAY lists cannot be scrolled.
 * Only the MAP tab handles drags (handleTouch 'map' records); on the list tabs a touch is a 'tap' record and
 * touchmove ignores it (js/11_ui.js ~2936). The list scrolls only by keys, the mouse wheel or pad selection, so
 * on a 400x800 phone the rows past the first ~12 (their REPLAY buttons) are out of reach.
 * This test completes all missions, opens MISSIONS at 400x800 with touch and swipes up over the list twice (CDP
 * touch events through the canvas): the list must scroll so the last mission's REPLAY button gets a hit rect.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_tch_09.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_tch_09 touch scrolls the phone lists', async (t) => {
  const ctx = await t.browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  await page.goto(t.url({ headless: 1, skipTitle: 1, seed: 7, mute: 1 }));
  await t.waitPlaying(page);
  await page.touchscreen.tap(280, 320);
  const cv = await page.evaluate(() => { const r = GTP.Render.hudCanvas.getBoundingClientRect(); return { l: r.left, t: r.top }; });
  const m = await page.evaluate(() => {
    const all = GTP.Missions.allMissions ? GTP.Missions.allMissions() : GTP.Content.missions;
    all.forEach((x) => GTP.Missions.state.completed.add(x.id));
    GTP.UI.openPause('phone'); GTP.UI.state.pause.tab = 1; GTP.game.advance(0.05); GTP.game.render();
    return { rows: GTP.UI.state.pause.rows.length };
  });
  const client = await page.context().newCDPSession(page);
  const swipe = async (x, y0, y1) => {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0, id: 1 }] });
    for (let k = 1; k <= 8; k++) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * k / 8, id: 1 }] });
      await page.evaluate(() => { GTP.game.advance(1 / 60); GTP.game.render(); });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.evaluate(() => { GTP.game.advance(1 / 60); GTP.game.render(); });
  };
  await swipe(cv.l + 200, cv.t + 600, cv.t + 300);
  await swipe(cv.l + 200, cv.t + 600, cv.t + 300);
  const r = await page.evaluate(() => ({ state: GTP.game.state, tab: GTP.UI.state.pause.tab, scroll: GTP.UI.state.pause.scroll, rows: GTP.UI.state.pause.rows.length, ids: (GTP.UI.state.hit || []).filter((h) => /^mrow-/.test(h.id)).map((h) => +h.id.slice(5)) }));
  r.maxVisible = r.ids.length ? Math.max.apply(null, r.ids) : -1;
  delete r.ids;
  console.log('  ' + JSON.stringify(Object.assign({ rows0: m.rows }, r)));
  t.assert(r.state === 'paused' && r.tab === 1 && r.rows >= 25, 'the MISSIONS tab lists every mission: ' + JSON.stringify(r));
  t.assert(r.maxVisible === r.rows - 1, 'after two upward swipes the last mission row (' + (r.rows - 1) + ') must be reachable; the last row with a button is ' + r.maxVisible + ', scroll ' + r.scroll);
  await ctx.close();
});
