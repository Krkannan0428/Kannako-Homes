/* QA-B-TCH-11: in portrait the shop's off-screen list rows still take taps that land on the item card.
 * drawShop (js/11_ui.js ~2289-2305) clips the list's drawing to its rect but records a hit() for every row,
 * including the rows scrolled below the list, which on a phone (narrow, stacked layout) lie under the card.
 * A tap on the card's stat bars selects a hidden item, and a second tap there buys it.
 * This test opens the shop at 400x800 (touch) and checks that no shop-item hit rect extends outside the visible
 * list area; then taps the card body above the BUY button: the selection must not change.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_tch_11.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_tch_11 hidden shop rows do not take taps', async (t) => {
  const ctx = await t.browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  await page.goto(t.url({ headless: 1, skipTitle: 1, seed: 7, mute: 1 }));
  await t.waitPlaying(page);
  await page.touchscreen.tap(280, 320);
  const r = await page.evaluate(() => {
    const W = GTP.World, CB = GTP.Combat, lm = W.landmarks.filter((l) => l.kind === 'gunshop')[0];
    const st = CB.shop.stores().find((s) => s.id === lm.id) || { x: lm.door.x, z: lm.door.z };
    GTP.game.debug.teleport(st.x, st.z); GTP.game.advance(0.8); GTP.game.render();
    const hs = GTP.UI.state.hit, rows = hs.filter((h) => /^shop-item-/.test(h.id)), buy = hs.find((h) => h.id === 'shop-buy');
    const items = CB.shop.items('weapons');
    const firstRow = rows[0], visibleRows = rows.filter((h) => h.y + h.h <= buy.y - 80);   // generous
    const cardTapY = buy.y - 50, cardTapX = buy.x + 10;
    const under = rows.filter((h) => cardTapX >= h.x && cardTapX <= h.x + h.w && cardTapY >= h.y && cardTapY <= h.y + h.h).map((h) => h.id);
    const sel0 = GTP.UI.state.shop.sel;
    GTP.UI.touch.handle({ type: 'touchstart', changedTouches: [{ identifier: 1, clientX: cardTapX, clientY: cardTapY }] });
    GTP.game.advance(1 / 60);
    GTP.UI.touch.handle({ type: 'touchend', changedTouches: [{ identifier: 1, clientX: cardTapX, clientY: cardTapY }] });
    GTP.game.advance(1 / 60);
    const sel1 = GTP.UI.state.shop.sel;
    return { open: GTP.UI.state.shopOpen, rows: rows.length, items: items.length, under, sel0, sel1, item1: items[sel1] && items[sel1].name, firstRowY: Math.round(firstRow.y), visible: visibleRows.length };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.open, 'the shop page is open');
  t.assert(r.under.length === 0 && r.sel1 === r.sel0, 'a tap on the item card must not select a hidden list row: ' + JSON.stringify(r));
  await ctx.close();
});
