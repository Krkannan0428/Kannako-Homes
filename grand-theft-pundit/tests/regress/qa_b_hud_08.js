/* QA-B-HUD-08: on a gamepad the map page cannot place a waypoint anywhere but the city centre at 1x.
 * js/11_ui.js mapInput: the left stick pans ui.map.cx/cz and A calls setWaypoint(M.cx, M.cz) (the view
 * centre; no cursor is drawn), but mapClampCenter pins the centre to the middle of the bake while the
 * whole city fits (zoom 1, the zoom the page opens at), so the stick does nothing and A always drops the
 * waypoint at (448, 448). This test opens the map with a fake pad, presses A once without touching the
 * stick and once after holding the stick right for 1.5 s: the second waypoint must lie well to the east
 * of the first.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_hud_08.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_hud_08 gamepad waypoint follows the stick', async (t) => {
  const ctx = await t.boot({ clock: 12, mute: 1 });
  const r = await ctx.page.evaluate(() => {
    const fake = { index: 0, id: 'Fake Standard Pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] };
    for (let i = 0; i < 17; i++) fake.buttons.push({ pressed: false, value: 0 });
    navigator.getGamepads = () => [fake];
    const tap = (b) => { fake.buttons[b].pressed = true; fake.buttons[b].value = 1; GTP.game.advance(1 / 60); fake.buttons[b].pressed = false; fake.buttons[b].value = 0; GTP.game.advance(1 / 60); };
    GTP.game.advance(0.2);
    tap(8); GTP.game.render();   // Back opens the map page
    const page = GTP.UI.state.pause.page;
    tap(0); const wp1 = GTP.game.waypoint && { x: GTP.game.waypoint.x, z: GTP.game.waypoint.z };
    tap(0);   // a second A within 12 m clears it again
    fake.axes[0] = 1; for (let i = 0; i < 90; i++) { GTP.game.advance(1 / 60); GTP.game.render(); } fake.axes[0] = 0; GTP.game.advance(1 / 60);
    tap(0); const wp2 = GTP.game.waypoint && { x: GTP.game.waypoint.x, z: GTP.game.waypoint.z };
    return { page, device: GTP.UI.device(), zoom: GTP.UI.state.map.zoom, wp1, wp2 };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.page === 'phone' && r.device === 'gamepad' && r.wp1 && r.wp2, 'set-up: the map page is open on the pad and A sets waypoints: ' + JSON.stringify(r));
  t.assert(r.wp2.x - r.wp1.x > 20, 'holding the stick right moves where A puts the waypoint (wp1 ' + JSON.stringify(r.wp1) + ', wp2 ' + JSON.stringify(r.wp2) + ')');
});
