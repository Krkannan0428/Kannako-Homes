/* QA-B-TCH-06: a gamepad player can neither SHOUT in the debate nor fire the HOTTAKE in the ratio war.
 * In state 'minigame' the pad uses PAD_MENU (js/02_input.js), which maps no button to 'run' (the debate's SHOUT
 * is Input.down('run'), js/11_ui.js ~2552) and maps RT to 'zoomIn', not 'shoot' (the ratio's HOTTAKE is
 * Input.pressed('shoot'), ~2766). The screens also only print keyboard keys ("W / arrow", "hold Shift to SHOUT",
 * "HOTTAKE (Ctrl / click)") while the pad glyphs are active.
 * This test uses a fake standard pad: holding any button must arm the shout on a dealt card, and some button
 * (not Start / Back / A) must fire the HOTTAKE.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_tch_06.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_tch_06 gamepad SHOUT and HOTTAKE', async (t) => {
  const { page } = await t.boot({ mute: 1 });
  const r = await page.evaluate(() => {
    const fake = { index: 0, id: 'Fake Standard Pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] };
    for (let i = 0; i < 17; i++) fake.buttons.push({ pressed: false, value: 0 });
    navigator.getGamepads = () => [fake];
    const set = (i, on) => { fake.buttons[i].pressed = on; fake.buttons[i].value = on ? 1 : 0; };
    GTP.game.advance(0.1);
    // the debate: hold each button in turn on a dealt card and look for the shout flag ('run' held)
    GTP.UI.startMinigame('debate', { rounds: 1, points: 4, timer: 30, bluff: 0, opponent: 'freshman' }, () => {});
    const st = GTP.UI.minigames.debate.state; let g = 0; while (st.phase !== 'card' && g++ < 300) GTP.game.advance(1 / 60);
    const shoutBy = [];
    for (let i = 0; i < 17; i++) {
      if (i === 0 || (i >= 12 && i <= 15) || i === 9 || i === 8) continue;   // A = WHATABOUT, d-pad = the cards, Start / Back
      set(i, true); GTP.game.advance(1 / 60); if (GTP.Input.down('run')) shoutBy.push(i); set(i, false); GTP.game.advance(1 / 60);
    }
    const device = GTP.Input.lastDevice;
    GTP.UI.endMinigame(); GTP.game.setState('playing'); GTP.game.advance(0.1);
    // the ratio war: tap every button but A / Start / Back and see whether the HOTTAKE goes
    GTP.UI.startMinigame('ratio', { posts: 8, speed: 1, opponent: 'dunk' }, () => {});
    const rs = GTP.UI.minigames.ratio.state; GTP.game.advance(0.2);
    let hotBy = null;
    for (let i = 1; i < 17; i++) {
      if (i === 8 || i === 9) continue;
      set(i, true); GTP.game.advance(1 / 60); set(i, false); GTP.game.advance(1 / 60);
      if (!rs.hottake) { hotBy = i; break; }
    }
    GTP.UI.endMinigame(); GTP.game.setState('playing');
    return { device, shoutBy, hotBy };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.device === 'gamepad', 'the pad is the active device');
  t.assert(r.shoutBy.length > 0, 'no gamepad button arms the debate SHOUT');
  t.assert(r.hotBy !== null, 'no gamepad button fires the ratio war HOTTAKE');
});
