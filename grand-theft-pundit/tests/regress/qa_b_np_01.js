/* QA-B-NP-01: every mission timer is labelled 'CODE EXPIRES IN' (js/11_ui.js drawObjective), the joke of m02_read's sponsor code.
 * In m01_van the objective reads 'Collect 5 subscribers before the battery dies' and Gus says the battery lasts two and a half
 * minutes, but the bar under it says CODE EXPIRES IN. This test boards the pod van in m01_van and records every string the HUD
 * draws: the timer label must not be the sponsor-code line.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_np_01.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_np_01 m01 timer label', async (t) => {
  const ctx = await t.boot({ mute: 1, mission: 'm01_van' });
  const r = await ctx.page.evaluate(() => {
    const g = GTP.game, M = GTP.Missions, In = GTP.Input, p = g.player;
    for (let i = 0; i < 300 && M.hud().phase !== 'play'; i++) g.advance(0.1);
    const v = GTP.Entities.near(p.x, p.z, 60, 'vehicle').find((e) => e.tag === 'podvan');
    if (!v) return { error: 'no pod van' };
    const d = v.doorWorld(0); g.debug.teleport(d.x, d.z); g.advance(0.2);
    In.set('enter', true); g.advance(1 / 60); In.set('enter', false); g.advance(2);
    const texts = [], of = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s) { texts.push(String(s)); return of.apply(this, arguments); };
    try { g.render(); } finally { CanvasRenderingContext2D.prototype.fillText = of; }
    return { objective: M.hud().objective, timer: M.hud().timer, inVeh: !!p.inVehicle, texts };
  });
  console.log('  objective: ' + r.objective + ' | timer: ' + JSON.stringify(r.timer));
  t.assert(!r.error, r.error);
  t.assert(r.timer && /battery/i.test(r.objective), 'm01_van battery timer running (got ' + JSON.stringify({ o: r.objective, t: r.timer }) + ')');
  const label = r.texts.filter((s) => /EXPIRES|TIME|BATTERY|LEFT/.test(s));
  console.log('  timer-ish labels drawn: ' + JSON.stringify(label));
  t.assert(r.texts.indexOf('CODE EXPIRES IN') < 0, 'the m01_van battery timer is not labelled with m02_read\'s "CODE EXPIRES IN"');
});
