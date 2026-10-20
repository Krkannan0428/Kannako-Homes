/* QA-B-TCH-12: on a touch screen the long-press weapon wheel cannot be steered by the finger that holds WPN.
 * The wheel's hint reads "drag picks · release", but handleTouch (js/11_ui.js ~2936) ignores touchmove for a
 * 'button' record, so dragging the WPN finger never reaches Input.touch.look / Combat.wheel; only a second finger
 * on the right half (the look area) moves the selection.
 * This test long-presses WPN at 400x800, drags the same finger straight down (towards the bottom segment) and
 * releases: the wheel's index must have moved and the equipped weapon must follow the drag.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_tch_12.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_tch_12 drag from WPN picks a wheel segment', async (t) => {
  const ctx = await t.browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  await page.goto(t.url({ headless: 1, skipTitle: 1, seed: 7, mute: 1 }));
  await t.waitPlaying(page);
  await page.touchscreen.tap(280, 320);
  const r = await page.evaluate(() => {
    GTP.game.advance(0.3);
    const p = GTP.game.player, CB = GTP.Combat;
    GTP.game.debug.giveWeapon('pistol', 24); GTP.game.debug.giveWeapon('rifle', 60); p.weapon = 'fist';   // rifle = index 6, the bottom of the ring
    const b = GTP.UI.state.touch.buttons.find((x) => x.id === 'weapon');
    GTP.UI.touch.handle({ type: 'touchstart', changedTouches: [{ identifier: 3, clientX: b.x, clientY: b.y }] });
    GTP.game.advance(0.4);
    const out = { open: CB.wheel.open, i0: CB.wheel.index };
    for (let k = 1; k <= 8; k++) { GTP.UI.touch.handle({ type: 'touchmove', changedTouches: [{ identifier: 3, clientX: b.x, clientY: b.y + k * 6 }] }); GTP.game.advance(1 / 30); }
    out.i1 = CB.wheel.index;
    GTP.UI.touch.handle({ type: 'touchend', changedTouches: [{ identifier: 3, clientX: b.x, clientY: b.y + 48 }] });
    GTP.game.advance(0.2);
    out.weapon = p.weapon;
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.open && r.i0 === 0, 'a long press on WPN opens the wheel on the fists: ' + JSON.stringify(r));
  t.assert(r.i1 === 6 && r.weapon === 'rifle', 'dragging the WPN finger down must pick the bottom segment (rifle) and equip it on release: ' + JSON.stringify(r));
  await ctx.close();
});
