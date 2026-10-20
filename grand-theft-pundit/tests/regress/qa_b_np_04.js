/* QA-B-NP-04: the only place the game teaches the enter-vehicle key is the one-shot h_enter hint, which fires the first time the
 * player walks within 3.5 m of ANY vehicle. On a fresh game that happens during m00 (seed 7: 26 s in, passing a parked car while
 * hunting the table parts), six seconds, out of context. When m01_van then asks "Get in the pod van" nothing on screen says F /
 * Enter (no objective hint line, no hint, no prompt at the door).
 * The test walks the player past a parked car in m00 (h_enter shows and expires), then starts m01_van and stands at the pod van's
 * door for 4 s, recording every string the HUD draws. Expected: the enter key ('F') is shown during the enter_vehicle objective.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_np_04.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_np_04 enter key shown for "Get in the pod van"', async (t) => {
  const ctx = await t.boot({ mute: 1, mission: 'm00_intro' });
  const r = await ctx.page.evaluate(() => {
    const g = GTP.game, M = GTP.Missions, p = g.player, U = GTP.util;
    for (let i = 0; i < 300 && M.hud().phase !== 'play'; i++) g.advance(0.1);
    // m00: walk up to a parked car (what the first play-through did on the way to the table parts)
    const cars = GTP.Entities.near(p.x, p.z, 150, 'vehicle').filter((v) => !v.driver && !v.wreck);
    if (!cars.length) return { error: 'no parked car near the quad' };
    const car = cars[0], dr = car.doorWorld(0);
    g.debug.teleport(dr.x + (dr.x - car.x) * 0.6, dr.z + (dr.z - car.z) * 0.6); g.advance(1.5);
    const shown = GTP.Hints.current() && GTP.Hints.current().id;
    g.advance(8);
    const flagged = !!M.state.flags.hint_h_enter;
    // m01_van: Get in the pod van
    M.abort(); g.advance(1);
    g._prepMission('m01_van', false);
    for (let i = 0; i < 300 && M.hud().phase !== 'play'; i++) g.advance(0.1);
    const obj = M.hud().objective;
    const v = GTP.Entities.near(p.x, p.z, 80, 'vehicle').find((e) => e.tag === 'podvan');
    if (!v) return { error: 'no pod van', obj };
    const d = v.doorWorld(0), ox = d.x + (d.x - v.x) * 1.2, oz = d.z + (d.z - v.z) * 1.2;
    g.debug.teleport(ox, oz); g.advance(0.5);
    const texts = new Set(), of = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s) { texts.add(String(s)); return of.apply(this, arguments); };
    try { for (let i = 0; i < 8; i++) { g.advance(0.5); g.render(); } } finally { CanvasRenderingContext2D.prototype.fillText = of; }
    return { shown, flagged, obj, objNow: M.hud().objective, dist: U.dist2d(p.x, p.z, v.x, v.z).toFixed(1), inVeh: !!p.inVehicle, texts: [...texts] };
  });
  console.log('  ' + JSON.stringify(Object.assign({}, r, { texts: undefined })));
  t.assert(!r.error, r.error);
  t.assert(r.shown === 'h_enter' && r.flagged, 'h_enter fired next to the parked car in m00 (' + r.shown + ')');
  t.assert(/get in the pod van/i.test(r.obj), 'm01 asks to get in the pod van (' + r.obj + ')');
  const keyShown = r.texts.some((s) => s === 'F' || /\bF\b.*(get|enter)|press F|F to enter/i.test(s));
  console.log('  HUD strings: ' + JSON.stringify(r.texts.filter((s) => s.length < 90)));
  t.assert(keyShown, 'standing at the pod van during "Get in the pod van", the HUD shows the enter key (F)');
});
