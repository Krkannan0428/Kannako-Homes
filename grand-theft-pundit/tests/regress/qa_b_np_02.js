/* QA-B-NP-02: the minimap's white Home icon is drawn on top of the blue mission light of m01_van (and the yellow objective of
 * "Bring the van back to Gus"), because both sit on the pod_garage point and GTP.Missions.allMarkers() lists the strands' home
 * marker after the mission / objective markers. After MISSION PASSED on Table Stakes a new player sees no blue M anywhere on the
 * minimap: the next mission is hidden under the house.
 * The test completes m00 (prep of m01, then abort: m01's light is back at the garage), stands the player 50 m from it and counts
 * the mission-blue (#4aa8ff) pixels of the minimap on the #hud canvas. Expected: the blue M is visible.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_np_02.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_np_02 m01 blue light visible on the minimap', async (t) => {
  const ctx = await t.boot({ mute: 1, mission: 'm01_van' });
  const r = await ctx.page.evaluate(() => {
    const g = GTP.game, M = GTP.Missions, p = g.player;
    M.abort(); g.advance(1);
    const mk = M.allMarkers(), mis = mk.find((m) => m.kind === 'mission' && m.missionId === 'm01_van'), home = mk.find((m) => m.icon === 'home');
    if (!mis) return { error: 'no m01_van light after abort: ' + JSON.stringify(mk.map((m) => m.kind + ':' + (m.missionId || m.icon))) };
    // stand ~50 m away on open ground (inside the minimap's 90 m radius, not on the rim)
    let spot = null;
    for (let a = 0; a < 16 && !spot; a++) {
      const x = mis.x + Math.cos(a / 16 * Math.PI * 2) * 50, z = mis.z + Math.sin(a / 16 * Math.PI * 2) * 50;
      if (!GTP.World.solidAt(x, z, 1) && !(GTP.World.isWater && GTP.World.isWater(x, z))) spot = { x, z };
    }
    if (!spot) return { error: 'no open ground near the garage' };
    g.debug.teleport(spot.x, spot.z); g.advance(0.5);
    g.render();
    const cv = document.getElementById('hud'), c = cv.getContext('2d'), w = cv.width, h = cv.height;
    const s = Math.round(Math.min(w, h) * 0.42), data = c.getImageData(w - s, h - s, s, s).data;   // the bottom-right corner (minimap)
    let blue = 0;
    for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - 74) < 14 && Math.abs(data[i + 1] - 168) < 14 && Math.abs(data[i + 2] - 255) < 14) blue++;
    return { blue, dHome: home ? Math.hypot(home.x - mis.x, home.z - mis.z) : null, order: mk.map((m) => m.icon || m.kind), dist: Math.hypot(p.x - mis.x, p.z - mis.z) };
  });
  console.log('  ' + JSON.stringify({ blue: r.blue, homeToLight: r.dHome, playerToLight: r.dist && r.dist.toFixed(1), error: r.error }));
  await t.shot(ctx.page, 'qa_b_np_02');
  t.assert(!r.error, r.error);
  t.assert(r.blue >= 8, 'the blue mission M of m01_van shows on the minimap (mission-blue pixels: ' + r.blue + '; the Home icon ' + (r.dHome != null ? r.dHome.toFixed(1) + ' m away' : 'missing') + ' is drawn over it)');
});
