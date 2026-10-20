/* QA-B-TCH-08: in portrait (400x800) the ratio war's HOTTAKE cannot be tapped and the NOTES boxes are hidden.
 * ratio.draw's narrow layout (js/11_ui.js ~2826-2870) places the hottake icon and the NOTES row at y3 + px(10),
 * which lands under the meter and the POST button; the POST hit rect (pushed later, so it wins in pointerTap)
 * covers the hottake's, so a tap on the HOTTAKE posts instead.
 * This test draws the ratio war at 400x800 with touch, checks that the hottake's hit rect is not covered by the
 * post's, and taps the centre of the hottake rect: the HOTTAKE must fire and no post may be spent.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_tch_08.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_tch_08 portrait ratio HOTTAKE is tappable', async (t) => {
  const ctx = await t.browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  await page.goto(t.url({ headless: 1, skipTitle: 1, seed: 7, mute: 1 }));
  await t.waitPlaying(page);
  await page.touchscreen.tap(280, 320);
  const r = await page.evaluate(() => {
    GTP.game.advance(0.2);
    GTP.UI.startMinigame('ratio', { posts: 8, speed: 1, opponent: 'dunk' }, () => {});
    GTP.game.advance(0.3); GTP.game.render();
    const hs = GTP.UI.state.hit || [], hot = hs.find((h) => h.id === 'hottake'), post = hs.find((h) => h.id === 'post');
    const cx = hot.x + hot.w / 2, cy = hot.y + hot.h / 2;
    const covered = cx >= post.x && cx <= post.x + post.w && cy >= post.y && cy <= post.y + post.h;
    const st = GTP.UI.minigames.ratio.state, posts0 = st.postsLeft;
    GTP.UI.touch.handle({ type: 'touchstart', changedTouches: [{ identifier: 1, clientX: cx, clientY: cy }] });
    GTP.game.advance(1 / 60);
    GTP.UI.touch.handle({ type: 'touchend', changedTouches: [{ identifier: 1, clientX: cx, clientY: cy }] });
    GTP.game.advance(1 / 60);
    return { hot: [Math.round(hot.x), Math.round(hot.y), Math.round(hot.w), Math.round(hot.h)], post: [Math.round(post.x), Math.round(post.y), Math.round(post.w), Math.round(post.h)], covered, hottakeLeft: st.hottake, posts0, posts1: st.postsLeft };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(!r.covered, 'the HOTTAKE control sits under the POST control in portrait: ' + JSON.stringify(r));
  t.assert(r.hottakeLeft === false && r.posts1 === r.posts0, 'a tap on the HOTTAKE must fire it without posting: ' + JSON.stringify(r));
  await ctx.close();
});
