/* QA-B-HUD-01: a gamepad player cannot start a Loud Cab shift (or an HOA patrol).
 * The strands start a shift on Input.pressed('action') while stopped in a taxi / cruiser (js/09_missions.js
 * pollInput), but no gamepad button maps to 'action' in js/02_input.js (PAD_FOOT / PAD_CAR), and the
 * h_taxi / h_patrol hints tell the pad player to press Y, which is 'enter' and throws them out of the car.
 * This test sits a fake standard pad player in a stopped taxi and presses every button but Back / Start:
 * at least one must start the 'loud_cab' strand while the player is still in the taxi.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_hud_01.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_hud_01 gamepad starts a taxi shift', async (t) => {
  const ctx = await t.boot({ clock: 12, mute: 1 });
  const r = await ctx.page.evaluate(() => {
    const fake = { index: 0, id: 'Fake Standard Pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] };
    for (let i = 0; i < 17; i++) fake.buttons.push({ pressed: false, value: 0 });
    navigator.getGamepads = () => [fake];
    const p = GTP.game.player;
    GTP.game.debug.teleport(p.x + 300, p.z - 60); GTP.game.advance(0.5);   // away from the first mission marker
    const sp = GTP.World.nearestSidewalkPoint(p.x, p.z); GTP.game.debug.teleport(sp.x, sp.z); GTP.game.advance(0.5);
    const v = GTP.game.debug.spawnVehicle(p.x + 3, p.z, 'taxi');
    const board = () => {
      const d = v.doorWorld(0); GTP.game.debug.teleport(d.x, d.z); GTP.game.advance(0.1);
      fake.buttons[3].pressed = true; GTP.game.advance(1 / 60); fake.buttons[3].pressed = false; GTP.game.advance(1.5);
      return p.inVehicle === v;
    };
    if (!board()) return { error: 'could not board the taxi with Y' };
    const tried = [];
    for (let b = 0; b < 16; b++) {
      if (b === 8 || b === 9) continue;   // Back = map, Start = pause
      if (p.inVehicle !== v && !board()) return { error: 'could not re-board', tried };
      v.vx = v.vz = 0; v.speed = 0;
      fake.buttons[b].pressed = true; fake.buttons[b].value = 1;
      for (let i = 0; i < 4; i++) GTP.game.advance(1 / 60);
      fake.buttons[b].pressed = false; fake.buttons[b].value = 0; GTP.game.advance(0.4);
      const cur = GTP.Strands.debug.cur();
      tried.push(b + (p.inVehicle === v ? '' : ':left-car') + (cur ? ':' + cur.id : ''));
      if (cur && cur.id === 'loud_cab' && p.inVehicle === v) return { ok: true, button: b, tried };
    }
    return { ok: false, tried };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(!r.error, r.error);
  t.assert(r.ok, 'some gamepad button starts a Loud Cab shift in a stopped taxi (the h_taxi hint says Y); tried ' + JSON.stringify(r.tried));
});
