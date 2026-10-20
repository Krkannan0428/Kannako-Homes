/* QA-B-TCH-04: Enter / Space (or pad A) on the phone's STATS or STRANDS tab abandons the running mission.
 * drawPhoneStats / drawPhoneStrands never reset ui.pause.rows, so the MISSIONS tab's rows stay live after a
 * tab switch, and handleInput's phone branch (js/11_ui.js ~3099) runs missionRowActivate(rows[pg.row]) on
 * confirm: row 0 is the 'active' mission, whose activation is abortMission(), with no confirmation.
 * This test starts a test mission, opens the map page with M, steps to MISSIONS (]) and STATS (right arrow)
 * with a frame drawn every step (as the live loop does) and presses Enter: the mission must still be running.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_tch_04.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_tch_04 confirm on STATS does not abort the mission', async (t) => {
  const { page } = await t.boot({ mute: 1 });
  const step = () => page.evaluate(() => { GTP.game.advance(1 / 60); GTP.game.render(); });
  const key = async (k) => { await page.keyboard.down(k); await step(); await page.keyboard.up(k); await step(); };
  const res = [];
  for (const tabKey of [['ArrowRight'], ['ArrowRight', 'ArrowRight']]) {
    await page.evaluate(() => {
      if (!GTP.Missions.state.active) {
        GTP.Missions.registerTest({ id: 't_qa_tch04', title: 'Stats Probe', giver: 'gus', marker: 'campus_quad', requires: [], reward: 100, intro: [], outro: [], objectives: [{ type: 'goto', target: { landmark: 'dorm_studio' }, radius: 48, text: 'Get to Dorm 4B' }], failOn: ['player_dead'] });
        GTP.Missions.start('t_qa_tch04', { skipIntro: true });
      }
      GTP.game.advance(0.3);
    });
    await key('KeyM'); await key('BracketRight');
    for (const k of tabKey) await key(k);
    const tab = await page.evaluate(() => GTP.UI.state.pause.tab);
    await key('Enter');
    const after = await page.evaluate(() => ({ active: GTP.Missions.state.active, state: GTP.game.state }));
    res.push({ tab, after });
    if (after.state === 'paused') await key('Escape');
  }
  console.log('  ' + JSON.stringify(res));
  t.assert(res[0].tab === 2 && res[0].after.active === 't_qa_tch04', 'Enter on the STATS tab must not abandon the mission: ' + JSON.stringify(res[0]));
  t.assert(res[1].tab === 3 && res[1].after.active === 't_qa_tch04', 'Enter on the STRANDS tab must not abandon the mission: ' + JSON.stringify(res[1]));
});
