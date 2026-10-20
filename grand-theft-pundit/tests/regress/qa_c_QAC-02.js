/* qa_c_QAC-02.js (QA-C QAC-02, js/07_ai.js:278): the per-crime heat throttle stamps (heatT) live at module scope and
 * AI.reset never clears them, while New Game and Load restart GTP.game.time.t at 0. After a long session, a new game
 * (or a load) earns no heat for assaults until the clock passes the old session's time.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_c_QAC-02.js */
'use strict';
const H = require('../_harness');

H.run('qa_c_QAC-02', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const g = GTP.game, A = GTP.AI;
    const hit = () => { const p = g.player; const c = A.spawner.spawnPed(p.x + 1.5, p.z, 'civ'); c.maxHp = c.hp = 1000; const h0 = A.wanted.heat; c.applyDamage(5, p, 'fist'); const dh = A.wanted.heat - h0; c.destroy(); A.wanted.clear(); return +dh.toFixed(2); };
    const fresh = hit();
    g.time.t = 1800; g.advance(1); const late = hit();   // a 30-minute session
    g.newGame(7); g.advance(10);
    const afterNewGame = hit();
    return { fresh, late, afterNewGame };
  });
  console.log('  heat per assault: ' + JSON.stringify(r));
  t.assert(r.fresh > 0, 'precondition: an assault earns heat (' + r.fresh + ')');
  t.assert(r.afterNewGame > 0, 'an assault 10 s into a new game after a 30-minute session earns heat (got ' + r.afterNewGame + ')');
});
