/* QA-B-HUD-10: a minimap rim arrow for a target due north is hidden under the "N" badge.
 * js/11_ui.js drawMinimap draws the rim arrows of far markers at radius r - 12 px and then the north tick
 * (a 7 px ink disc with "N") at radius r - 11 px on top of them, so any objective / race checkpoint / mission
 * straight north of the player (common on the axis-aligned Loop: lr_01's first leg runs due north) shows no
 * direction at all on the minimap. This test starts a goto objective 200 m due north and counts amber
 * (#ffbe3c) pixels inside the minimap square.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_hud_10.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_hud_10 rim arrow due north stays visible', async (t) => {
  const ctx = await t.boot({ clock: 12, mute: 1 });
  const r = await ctx.page.evaluate(() => {
    const p = GTP.game.player;
    GTP.Missions.registerTest({ id: 't_qa_b_hud_10', title: 'North', giver: 'gus', marker: 'campus_quad', requires: [], reward: 0, intro: [], outro: [],
      objectives: [{ type: 'goto', target: { x: p.x, z: p.z - 200 }, radius: 16, text: 'Go north' }], failOn: [] });
    GTP.Missions.start('t_qa_b_hud_10', { skipIntro: true });
    for (let i = 0; i < 100 && GTP.Missions.state.phase !== 'play'; i++) GTP.game.advance(0.1);
    const out = {};
    const x0 = p.x, z0 = p.z;
    for (const run of ['north', 'control']) {   // target due north; then the player 70 m west, so the target bears 19 deg east of north
      if (run === 'control') { GTP.game.debug.teleport(x0 - 70, z0); GTP.game.advance(0.3); }
      const yaw = 0;
      GTP.Render.rig.yaw = yaw; GTP.game.advance(1 / 60); GTP.Render.rig.yaw = yaw; GTP.game.advance(1 / 60);
      GTP.game.render();
      const cv = GTP.Render.hudCanvas, d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const W = GTP.Render.width, Hh = GTP.Render.height, k = cv.width / W;
      const S = Math.min(Math.max(Math.min(W / 1280, Hh / 720), 0.62), 1.3), size = Math.round(220 * S);
      const mm = { x: W - 16 * S - size, y: Hh - 12 * S - size, s: size };
      let amber = 0;
      for (let y = Math.floor(mm.y * k); y < Math.ceil((mm.y + mm.s) * k); y++) for (let x = Math.floor(mm.x * k); x < Math.ceil((mm.x + mm.s) * k); x++) {
        const i = (y * cv.width + x) * 4;
        if (d[i + 3] > 200 && d[i] > 225 && d[i + 1] > 160 && d[i + 1] < 215 && d[i + 2] < 110) amber++;
      }
      out[run] = amber;
    }
    out.dist = Math.round(GTP.Missions.objectiveTarget().dist);
    return out;
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.control >= 10, 'set-up: a target 19 deg east of north gets a visible rim arrow (amber px ' + r.control + ')');
  t.assert(r.north >= 10, 'facing north, the rim arrow for a target due north is visible, not under the N badge (amber px ' + r.north + ')');
});
