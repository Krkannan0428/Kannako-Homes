/* qa_c_QAC-04.js (QA-C QAC-04 / QAC-18 / QAC-19, js/11_ui.js:3288 + :2368): every left click on a menu is handled twice,
 * once by the HUD canvas mousedown listener (pointerTap) and again on the next step by the menu's
 * pressed('shoot') && mouse.down branch, against the same hit list. One click on BUY buys twice.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_c_QAC-04.js */
'use strict';
const H = require('../_harness');

H.run('qa_c_QAC-04', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  const pre = await page.evaluate(() => {
    const p = GTP.game.player, M = GTP.Missions;
    (M.allMissions() || []).forEach((m) => M.state.completed.add(m.id));
    p.money = 100000; p.weapons.pistol = 12; p.weapon = 'pistol';
    const st = GTP.Combat.shop.stores()[0]; GTP.Combat.shop.open(st.landmark || st.id);
    GTP.UI.state.shop.tab = 1;
    const items = GTP.Combat.shop.items('ammo'), i = items.findIndex((x) => x.weapon === 'pistol' && x.canBuy);
    GTP.UI.state.shop.sel = i;
    GTP.game.render();
    const r = GTP.UI.state.hit.find((x) => x.id === 'shop-buy'), cv = GTP.Render.hudCanvas.getBoundingClientRect();
    return { price: items[i].price, money: p.money, buys: p.stats.shopBuys || 0, x: r && cv.left + r.x + r.w / 2, y: r && cv.top + r.y + r.h / 2 };
  });
  t.assert(pre.x != null, 'the shop BUY button is on screen');
  await page.mouse.move(pre.x, pre.y); await page.evaluate(() => GTP.game.render());
  await page.mouse.down(); await page.evaluate(() => GTP.game.advance(2 / 60));
  await page.mouse.up(); await page.evaluate(() => GTP.game.advance(2 / 60));
  const post = await page.evaluate(() => { const p = GTP.game.player; return { money: p.money, buys: p.stats.shopBuys || 0 }; });
  console.log('  one click on BUY: ' + JSON.stringify({ pre, post }));
  t.assert(post.buys - pre.buys === 1 && pre.money - post.money === pre.price, 'one click buys once: ' + (post.buys - pre.buys) + ' purchases, $' + (pre.money - post.money) + ' spent for a $' + pre.price + ' item');
});
