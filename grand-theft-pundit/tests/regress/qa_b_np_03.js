/* QA-B-NP-03: pickup objectives put nothing on the minimap. H.pickup (js/09_missions.js) never calls addObjMarker, so
 * GTP.Missions.markers() has no 'objective' entry while "Grab the table legs, top and sign" (m00) or "Collect 5 subscribers
 * before the battery dies" (m01, a 150 s timer) runs; the only guide is the HUD chevron to the nearest one. A new player cannot
 * see where the other subscribers are or plan a route against the clock.
 * The test boards the pod van in m01_van and counts the objective markers the minimap draws. Expected: one per open pickup.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_np_03.js
 */
'use strict';
const H = require('../_harness');

H.run('qa_b_np_03 pickups on the minimap', async (t) => {
  const ctx = await t.boot({ mute: 1, mission: 'm01_van' });
  const r = await ctx.page.evaluate(() => {
    const g = GTP.game, M = GTP.Missions, In = GTP.Input, p = g.player;
    for (let i = 0; i < 300 && M.hud().phase !== 'play'; i++) g.advance(0.1);
    const v = GTP.Entities.near(p.x, p.z, 60, 'vehicle').find((e) => e.tag === 'podvan');
    if (!v) return { error: 'no pod van' };
    const d = v.doorWorld(0); g.debug.teleport(d.x, d.z); g.advance(0.2);
    In.set('enter', true); g.advance(1 / 60); In.set('enter', false); g.advance(2);
    const cur = M.current(), open = cur && cur.ctx && cur.ctx.pickups ? cur.ctx.pickups.filter((pk) => !pk.removed).length : -1;
    const objMarkers = M.allMarkers().filter((m) => m.kind === 'objective').length;
    return { objective: M.hud().objective, type: cur && cur.def.type, open, objMarkers };
  });
  console.log('  ' + JSON.stringify(r));
  t.assert(!r.error, r.error);
  t.assert(r.type === 'pickup' && r.open > 0, 'the subscriber pickup objective is running (' + JSON.stringify(r) + ')');
  t.assert(r.objMarkers >= r.open, 'every open subscriber has an objective blip on the minimap (' + r.objMarkers + ' markers for ' + r.open + ' pickups)');
});
