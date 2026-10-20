/* QA-B-FE-05 (medium): with a gamepad, A / B do nothing on in-play menus whose prompts name them: a dialogue line
 * ("A ▶"), a cutscene ("HOLD A TO SKIP", "B skips the shot") and the CONTEXT STAMPED card (RETRY / RESTART / QUIT).
 * Input._padContext() returns 'foot' in cutscenes and in play, and PAD_FOOT maps A to jump, B to run, the d-pad to
 * quick slots: no confirm / cancel / back / left / right reaches the UI.
 * Checks (fake standard pad): A advances a dialogue line; holding A 2.5 s skips a cutscene; A on the failed card retries.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_fe_05.js
 */
'use strict';
const { H, bootTitle, PAD_INIT } = require('./qa_b_lib_fe');

H.run('qa_b_fe_05 gamepad A/B on dialogue, cutscene, retry card', async (t) => {
  const { page } = await bootTitle(t, {}, { init: PAD_INIT });
  const r = await page.evaluate(() => {
    const tap = (i, hold) => { __padSet(i, true); GTP.game.advance(hold || 1 / 30); __padSet(i, false); GTP.game.advance(1 / 30); };
    T_.newGame(); T_.quietRoad();
    const out = { padConnected: GTP.Input.padConnected() };
    // 1. a dialogue line
    window.__n = 0;
    GTP.UI.showDialogue({ who: 'firmness', name: 'Merle', text: 'A long line that takes a while to read so it does not auto-advance in the next second or two, okay.' }, () => { __n++; });
    GTP.game.advance(0.5); tap(0); GTP.game.advance(0.2);
    out.dialogue = { glyph: GTP.UI.glyph('confirm'), advanced: __n };
    GTP.UI.hideDialogue(); GTP.game.advance(0.2);
    // 2. a cutscene: hold A
    GTP.Cutscenes.play('cs_opening', () => {}); GTP.game.advance(0.5);
    const was = !!GTP.Cutscenes.active;
    __padSet(0, true); GTP.game.advance(2.5); __padSet(0, false); GTP.game.advance(0.1);
    out.cutscene = { was, stillActive: !!GTP.Cutscenes.active };
    if (GTP.Cutscenes.active) GTP.Cutscenes.skip();
    GTP.game.advance(0.5);
    // 3. the CONTEXT STAMPED card
    GTP.Missions.registerTest({ id: 't_qa_b_fe_05', title: 'Deadline Energy', giver: 'gus', marker: 'campus_quad', requires: [], reward: 100, intro: [], outro: [], objectives: [{ type: 'goto', target: { landmark: 'dorm_studio' }, radius: 48, text: 'Get to Dorm 4B' }, { type: 'timer_wrap', seconds: 1, objectives: [{ type: 'goto', target: { landmark: 'green_room' }, radius: 48, text: 'Then the motel. Fast.' }] }], failOn: ['player_dead'] });
    GTP.Missions.start('t_qa_b_fe_05', { skipIntro: true }); GTP.game.advance(0.2);
    GTP.Missions.completeObjective(); GTP.game.advance(0.2);
    for (let i = 0; i < 300 && GTP.Missions.state.active; i++) GTP.game.advance(1 / 60);
    GTP.game.advance(1.2);
    const card = GTP.UI.state.card && GTP.UI.state.card.kind, canRetry = GTP.Missions.canRetry();
    tap(0); GTP.game.advance(0.3);
    out.card = { card, canRetry, activeAfterA: GTP.Missions.state.active };
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.padConnected, 'the fake pad is connected');
  const fails = [];
  if (r.dialogue.advanced !== 1) fails.push('A (prompt "' + r.dialogue.glyph + ' ▶") did not advance the dialogue line');
  if (!r.cutscene.was || r.cutscene.stillActive) fails.push('holding A for 2.5 s did not skip the cutscene ("HOLD A TO SKIP")');
  if (!(r.card.card === 'failed' && r.card.canRetry)) fails.push('setup: no CONTEXT STAMPED card with RETRY: ' + JSON.stringify(r.card));
  else if (r.card.activeAfterA !== 't_qa_b_fe_05') fails.push('A on the CONTEXT STAMPED card (RETRY selected) did not retry');
  t.assert(!fails.length, fails.join('; '));
});
