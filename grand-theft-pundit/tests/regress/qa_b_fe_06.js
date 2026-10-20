/* QA-B-FE-06 (medium): a gamepad cannot start a Loud Cab (or HOA Patrol) shift. Strands.pollInput needs the
 * 'action' action, which no button maps to in PAD_CAR; the h_taxi / h_patrol hints and GLYPH.gamepad.action
 * print "Y", and Y in a car is 'enter': it throws the player out of the taxi.
 * Checks (fake standard pad, stopped in a taxi): the button the h_taxi hint names starts loud_cab and keeps the
 * player in the taxi.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_fe_06.js
 */
'use strict';
const { H, bootTitle, PAD_INIT } = require('./qa_b_lib_fe');
const PAD_INDEX = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11 };

H.run('qa_b_fe_06 gamepad starts a cab shift', async (t) => {
  const { page } = await bootTitle(t, {}, { init: PAD_INIT });
  const hint = await page.evaluate(() => { const h = (GTP.Content.expansion.hints || []).find((x) => x.id === 'h_taxi'); return h ? h.glyphs.gamepad[0] : GTP.UI.glyph('action'); });
  const idx = PAD_INDEX[String(hint).toUpperCase()];
  t.assert(idx != null, 'the h_taxi hint names a pad button: ' + hint);
  const r = await page.evaluate((b) => {
    const tap = (i) => { __padSet(i, true); GTP.game.advance(1 / 30); __padSet(i, false); GTP.game.advance(1 / 30); };
    T_.newGame(); T_.quietRoad(); T_.carUp('taxi');
    const p = GTP.game.player, v = p.inVehicle;
    const before = { inTaxi: !!(v && v.type === 'taxi'), speed: v ? Math.abs(v.speed) : -1, ctx: GTP.Input.gamepad.context };
    tap(b); GTP.game.advance(0.5);
    return { before, strand: GTP.Strands.active(), inVehicle: !!p.inVehicle };
  }, idx);
  console.log('  hint button ' + hint + ' (' + idx + '): ' + JSON.stringify(r));
  t.assert(r.before.inTaxi && r.before.ctx === 'car', 'stopped in a taxi with the pad in car context: ' + JSON.stringify(r.before));
  t.assert(r.strand === 'loud_cab' && r.inVehicle, 'pressing ' + hint + ' (the h_taxi hint) must start a Loud Cab shift and keep the player in the taxi: strand ' + r.strand + ', in vehicle ' + r.inVehicle);
});
