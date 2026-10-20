/* QA-B-TCH-07: holding Tab (or pad R3) in the Both Sides Arms shop opens an invisible weapon wheel behind the page.
 * The shop is a modal overlay in state 'playing' with player.controlEnabled = false, but Combat's updateWheel
 * (js/08_combat.js ~1080) only checks aiming / alive / state, and the UI skips drawWeaponWheel while shopping
 * (js/11_ui.js draw). The world drops to 0.2x, and the ] / [ presses that switch shop tabs also step the hidden
 * wheel, so releasing Tab silently equips another weapon.
 * This test holds Tab in the shop with real key events and presses ] three times, then releases.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_tch_07.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_tch_07 no weapon wheel inside the shop', async (t) => {
  const { page } = await t.boot({ mute: 1 });
  const step = (n) => page.evaluate((n) => { for (let i = 0; i < (n || 1); i++) { GTP.game.advance(1 / 60); GTP.game.render(); } }, n);
  const key = async (k) => { await page.keyboard.down(k); await step(); await page.keyboard.up(k); await step(); };
  await page.evaluate(() => {
    const W = GTP.World, CB = GTP.Combat, p = GTP.game.player;
    GTP.game.debug.giveWeapon('pistol', 24); GTP.game.debug.giveWeapon('smg', 60); p.weapon = 'fist';
    const lm = W.landmarks.filter((l) => l.kind === 'gunshop')[0];
    const st = CB.shop.stores().find((s) => s.id === lm.id) || { x: lm.door.x, z: lm.door.z };
    GTP.game.debug.teleport(st.x, st.z); GTP.game.advance(0.8);
  });
  await page.keyboard.down('Tab'); await step(20);
  const held = await page.evaluate(() => { const t0 = GTP.game.time.t; GTP.game.advance(1); return { shop: GTP.UI.state.shopOpen, wheel: GTP.Combat.wheel.open, worldSeconds: +(GTP.game.time.t - t0).toFixed(2) }; });
  await key('BracketRight'); await key('BracketRight'); await key('BracketRight');
  await page.keyboard.up('Tab'); await step(5);
  const after = await page.evaluate(() => ({ weapon: GTP.game.player.weapon, shop: GTP.UI.state.shopOpen }));
  console.log('  held: ' + JSON.stringify(held) + ' after: ' + JSON.stringify(after));
  t.assert(held.shop, 'the shop page is open');
  t.assert(!held.wheel && held.worldSeconds > 0.9, 'holding Tab in the shop must not open the (hidden) weapon wheel or slow the world: ' + JSON.stringify(held));
  t.assert(after.weapon === 'fist', 'browsing the shop with Tab held and ] must not change the equipped weapon: ' + after.weapon);
});
