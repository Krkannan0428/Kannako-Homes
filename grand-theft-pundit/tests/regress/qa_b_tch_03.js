/* QA-B-TCH-03: one mouse click on a menu control is applied twice. The hud canvas 'mousedown' listener in
 * UI.init (js/11_ui.js ~3288) calls pointerTap at once, and the next step's handleInput calls pointerTap again
 * for the same click (`In.pressed('shoot') && In.mouse.down`, e.g. shopInput, the 'minigame' and 'paused'
 * cases) while the button is still down, which it is for any human click (~100 ms, several steps).
 * Effects: one click on an unselected Both Sides Arms row selects AND buys it; one click on MUTE toggles twice
 * (nothing changes); one click on the ratio war's POST posts twice and burns the HOTTAKE.
 * This test does real mouse presses that are held over one simulation step.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_tch_03.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_tch_03 one click = one activation', async (t) => {
  const { page } = await t.boot({ mute: 1 });
  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.evaluate(() => { GTP.game.advance(1 / 60); });
    await page.mouse.down();
    await page.evaluate(() => { GTP.game.advance(1 / 60); });
    await page.mouse.up();
    await page.evaluate(() => { GTP.game.advance(1 / 60); GTP.game.render(); });
  };
  const hitOf = (id) => page.evaluate((id) => (GTP.UI.state.hit || []).find((h) => h.id === id), id);
  // 1) the shop: the vest row (unselected)
  await page.evaluate(() => {
    const W = GTP.World, CB = GTP.Combat, lm = W.landmarks.filter((l) => l.kind === 'gunshop')[0];
    GTP.game.debug.setMoney(3000);
    const st = CB.shop.stores().find((s) => s.id === lm.id) || { x: lm.door.x, z: lm.door.z };
    GTP.game.debug.teleport(st.x, st.z); GTP.game.advance(0.8);
    GTP.UI.state.shop.tab = 2; GTP.UI.state.shop.sel = 0; GTP.game.player.armor = 0; GTP.game.render();
  });
  const row = await hitOf('shop-item-2');
  await page.evaluate(() => { GTP.UI.state.shop.sel = 0; });
  await page.mouse.move(5, 5);
  await click(row.x + row.w / 2, row.y + row.h / 2);
  const shop = await page.evaluate(() => ({ open: GTP.UI.state.shopOpen, sel: GTP.UI.state.shop.sel, money: GTP.game.player.money, armor: GTP.game.player.armor }));
  console.log('  shop: ' + JSON.stringify(shop));
  // 2) MUTE in the pause menu
  await page.evaluate(() => { GTP.UI.closeShop(); GTP.game.advance(0.3); GTP.UI.openPause('pause'); GTP.game.advance(0.05); GTP.game.render(); });
  const mute = await hitOf('menu-mute');
  const m0 = await page.evaluate(() => GTP.UI.isMuted());
  await click(mute.x + mute.w / 2, mute.y + mute.h / 2);
  const m1 = await page.evaluate(() => GTP.UI.isMuted());
  console.log('  mute: ' + m0 + ' -> ' + m1);
  // 3) the ratio war's POST
  await page.evaluate(() => { GTP.UI.closePause(); GTP.game.advance(0.1); GTP.UI.startMinigame('ratio', { posts: 5, speed: 1, opponent: 'dunk' }, () => {}); GTP.game.advance(0.3); GTP.game.render(); });
  const post = await hitOf('post');
  await click(post.x + post.w / 2, post.y + post.h - 8);
  const ratio = await page.evaluate(() => { const st = GTP.UI.minigames.ratio.state; return { postsLeft: st.postsLeft, hottake: st.hottake }; });
  console.log('  ratio: ' + JSON.stringify(ratio));
  t.assert(shop.sel === 2 && shop.money === 3000 && shop.armor === 0, 'one click on an unselected shop row selects it and must not buy it: ' + JSON.stringify(shop));
  t.assert(m1 !== m0, 'one click on MUTE must toggle the mute (it toggles twice): ' + m0 + ' -> ' + m1);
  t.assert(ratio.postsLeft === 4 && ratio.hottake === true, 'one click on POST posts once and keeps the HOTTAKE: ' + JSON.stringify(ratio));
});
