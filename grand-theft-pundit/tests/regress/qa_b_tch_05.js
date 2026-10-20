/* QA-B-TCH-05: pressing Escape (or Backspace) during a debate plays the DEFINE TERMS card.
 * Escape and Backspace are bound to 'back' as well as 'pause' / 'cancel' (js/02_input.js BINDINGS), and the
 * debate reads COUNTER_KEYS by action, DEFINE TERMS = 'back' (js/11_ui.js ~2470, debate.update ~2553), while the
 * 'minigame' state never opens the pause menu. A player reaching for the pause key answers a card (usually
 * wrong: -20 crowd). The fix should read the S / ArrowDown key only (e.g. `back && !cancel`, like menuDown).
 * This test deals a card and presses Escape, then Backspace, with real key events: neither may answer.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_tch_05.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_tch_05 Escape does not answer a debate card', async (t) => {
  const { page } = await t.boot({ mute: 1 });
  const res = [];
  for (const k of ['Escape', 'Backspace']) {
    await page.evaluate(() => {
      GTP.UI.endMinigame(); if (GTP.game.state !== 'playing') GTP.game.setState('playing'); GTP.game.advance(0.1);
      GTP.UI.startMinigame('debate', { rounds: 1, points: 4, timer: 6, bluff: 0, opponent: 'freshman' }, () => {});
      const st = GTP.UI.minigames.debate.state; let g = 0; while (st.phase !== 'card' && g++ < 300) GTP.game.advance(1 / 60);
      GTP.game.advance(0.1);
    });
    await page.keyboard.down(k); await page.evaluate(() => GTP.game.advance(1 / 60)); await page.keyboard.up(k); await page.evaluate(() => GTP.game.advance(1 / 60));
    res.push(await page.evaluate((k) => { const st = GTP.UI.minigames.debate.state; return { key: k, phase: st.phase, answered: st.lastAnswer ? st.lastAnswer.id : null, result: st.result && st.result.text }; }, k));
  }
  console.log('  ' + JSON.stringify(res));
  res.forEach((r) => t.assert(!r.answered, r.key + ' must not play a debate card: ' + JSON.stringify(r)));
});
