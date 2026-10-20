/* QA-B-HUD-03: the off-screen objective arrow disappears under the minimap when the target is behind and
 * to the right of the camera.
 * js/11_ui.js drawObjectiveArrow places the edge arrow on an ellipse around the screen centre and only clamps
 * it to [42, W-42] x [110, H-70]; for a target about 20..50 degrees below the right-hand horizontal it lands
 * inside the minimap's square (bottom-right), and draw() paints the arrow before drawHUD paints the minimap
 * over it. This test starts a goto objective whose target sits 35 degrees behind-right of the camera and
 * counts amber (#ffbe3c) arrow pixels on the HUD canvas outside the minimap and the top HUD rows.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_hud_03.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_hud_03 objective arrow not hidden by the minimap', async (t) => {
  const ctx = await t.boot({ clock: 12, mute: 1 });
  const r = await ctx.page.evaluate(() => {
    const p = GTP.game.player;
    // target 60 m away at local screen angle +35 deg (right and down = behind-right)
    const ang = 35 * Math.PI / 180, yaw = 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const lx = Math.cos(ang) * 60, ly = Math.sin(ang) * 60;
    const dx = lx * cs + ly * sn, dz = -lx * sn + ly * cs;   // inverse of the minimap rotation
    GTP.Missions.registerTest({ id: 't_qa_b_hud_03', title: 'Arrow', giver: 'gus', marker: 'campus_quad', requires: [], reward: 0, intro: [], outro: [],
      objectives: [{ type: 'goto', target: { x: p.x + dx, z: p.z + dz }, radius: 16, text: 'Go there' }], failOn: [] });
    GTP.Missions.start('t_qa_b_hud_03', { skipIntro: true });
    for (let i = 0; i < 100 && GTP.Missions.state.phase !== 'play'; i++) GTP.game.advance(0.1);
    GTP.Render.rig.yaw = yaw; GTP.Render.rig.pitch = 0.2; GTP.game.advance(1 / 60); GTP.Render.rig.yaw = yaw; GTP.game.advance(1 / 60);
    GTP.game.render();
    const t = GTP.Missions.objectiveTarget();
    const cv = GTP.Render.hudCanvas, c = cv.getContext('2d'), d = c.getImageData(0, 0, cv.width, cv.height).data;
    const W = GTP.Render.width, Hh = GTP.Render.height, k = cv.width / W;
    const S = Math.min(Math.max(Math.min(W / 1280, Hh / 720), 0.62), 1.3), size = Math.round(220 * S);
    const mm = { x: W - 16 * S - size, y: Hh - 12 * S - size, s: size };
    let amber = 0, amberInMinimap = 0;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4, rr = d[i], gg = d[i + 1], bb = d[i + 2], aa = d[i + 3];
      if (aa < 200 || rr < 225 || gg < 160 || gg > 215 || bb > 110) continue;
      const lx2 = x / k, ly2 = y / k;
      if (lx2 >= mm.x && lx2 <= mm.x + mm.s && ly2 >= mm.y && ly2 <= mm.y + mm.s) { amberInMinimap++; continue; }
      if (ly2 < 160 * S) continue;   // the objective panel accent, hint frame, money delta
      amber++;
    }
    const s = GTP.Render.worldToScreen(t.x, t.y + 2.6, t.z);
    return { target: [Math.round(t.x), Math.round(t.z)], player: [Math.round(p.x), Math.round(p.z)], onScreen: s.visible && s.depth < 1 && s.sx > 30 && s.sx < W - 30, amber, amberInMinimap };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(!r.onScreen, 'set-up: the target is off screen');
  t.assert(r.amber >= 20, 'an amber off-screen objective arrow is visible outside the minimap (amber px outside the minimap: ' + r.amber + ', inside: ' + r.amberInMinimap + ')');
});
