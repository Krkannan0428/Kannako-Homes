/* QA-B-NP-05: a pickup objective prints its count twice in the objective panel: the text gets ' (0/3)' appended
 * (js/09_missions.js, objective text + progress) and drawObjective (js/11_ui.js) draws the same '0/3' again in amber at the right:
 * "Grab the table legs, top and sign (0/3)    0/3".
 * The test records the strings the HUD draws in m00's pickup objective. Expected: the count appears once.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_np_05.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_np_05 pickup count drawn once', async (t) => {
  const ctx = await t.boot({ mute: 1, mission: 'm00_intro' });
  const r = await ctx.page.evaluate(() => {
    const g = GTP.game, M = GTP.Missions, p = g.player;
    for (let i = 0; i < 300 && M.hud().phase !== 'play'; i++) g.advance(0.1);
    // the first objective: walk into Dorm 4B's circle (teleport onto the objective point)
    const tg = M.objectiveTarget(); if (!tg) return { error: 'no objective target' };
    g.debug.teleport(tg.x, tg.z); g.advance(1.5);
    const texts = [], of = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s) { texts.push(String(s)); return of.apply(this, arguments); };
    try { g.render(); } finally { CanvasRenderingContext2D.prototype.fillText = of; }
    return { objective: M.hud().objective, progress: M.hud().progress, texts };
  });
  console.log('  ' + JSON.stringify({ objective: r.objective, progress: r.progress, error: r.error }));
  t.assert(!r.error, r.error);
  t.assert(r.progress && r.progress.total === 3, 'the table-parts pickup objective is running');
  const count = r.progress.n + '/' + r.progress.total;
  const hits = r.texts.filter((s) => s.indexOf(count) >= 0);
  console.log('  strings with "' + count + '": ' + JSON.stringify(hits));
  t.assert(hits.length === 1, 'the objective panel shows the count "' + count + '" once (drawn ' + hits.length + ' times)');
});
