/* qa_c_QAC-03.js (QA-C QAC-03, js/09_missions.js:989-1003): an 'equip' objective gives a loaner weapon and records it
 * in run.equipped, but abort / fail never takes it back (teardownRun restores weapons only for replays). Starting and
 * aborting m13b_ratio farms Ratio Launcher rockets far past its cap.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_c_QAC-03.js */
'use strict';
const H = require('../_harness');

H.run('qa_c_QAC-03', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const M = GTP.Missions, g = GTP.game, p = g.player, seq = [p.weapons.ratio || 0];
    for (let i = 0; i < 4; i++) {
      if (i === 0) M.prep('m13b_ratio', {}); else M.start('m13b_ratio', { skipIntro: true });
      g.advance(0.5); M.abort(); g.advance(0.2);
      seq.push(p.weapons.ratio || 0);
    }
    return seq;
  });
  console.log('  ratio launcher ammo before and after each start + abort: ' + JSON.stringify(r));
  t.assert(r[r.length - 1] <= Math.max(r[0], r[1]), 'aborting m13b does not keep stacking the loaned launcher ammo: ' + JSON.stringify(r));
});
