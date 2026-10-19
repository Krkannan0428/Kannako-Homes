/* render.js: free-camera screenshots of the city at street level and from above, by day and at
 * night. Each PNG must not be monochrome, the night shot must contain warm lit windows / lamps,
 * worldToScreen and the chunk cache must behave, and nothing may throw. Look at tests/out/*.png. */
'use strict';
const H = require('./_harness');

const SHOTS = [
  // name, camera xyz, lookAt xyz, clock
  { name: 'render_campus_quad', cam: [113, 1.7, 296], look: [112, 2.5, 250], clock: 15 },
  { name: 'render_downtown_avenue', cam: [327, 1.7, 372], look: [329, 6, 300], clock: 15 },
  { name: 'render_loop_deck', cam: [183, 9.2, 330], look: [184, 6.5, 230], clock: 15 },
  { name: 'render_marina_piers', cam: [300, 5, 566], look: [300, 1, 508], clock: 17.3 },
  { name: 'render_capitol_dome', cam: [328, 2.2, 122], look: [328, 9, 60], clock: 14 },
  { name: 'render_stadium', cam: [524, 4, 160], look: [588, 9, 134], clock: 14 },
  { name: 'render_downtown_night', cam: [327, 2, 372], look: [329, 8, 300], clock: 22 },
  { name: 'render_strip_night', cam: [262, 1.8, 427], look: [256, 4, 395], clock: 21.5 },
  { name: 'render_sunset', cam: [330, 3, 500], look: [230, 22, 545], clock: 18.6 },
  { name: 'render_ramp', cam: [126, 2.2, 232], look: [190, 8, 232], clock: 15 },
  { name: 'render_bridge', cam: [452, 2.2, 281], look: [530, 5, 279], clock: 15 },
  { name: 'render_overview', cam: [330, 150, 520], look: [320, 0, 250], clock: 15 }
];

H.run('render', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  const api = await page.evaluate(() => {
    const R = GTP.Render;
    const out = { renderer: !!R.renderer, scene: !!R.scene, camera: !!R.camera && R.camera.isPerspectiveCamera, fov: R.camera.fov, chunks: R.chunks.size, fog: !!R.scene.fog, sky: !!R.sky, lights: !!(R.lights && R.lights.sun && R.lights.hemi), water: !!R.water, fx: typeof R.fx.add === 'function', w2s: null, styles: GTP.Assets.facadeStyles(), atlasCells: Object.keys(GTP.Assets.cells).length };
    const p = GTP.game.player; const s = R.worldToScreen(p.x, p.y + 1, p.z); out.w2s = s;
    out.shadow = R.renderer.shadowMap.enabled;
    out.night = R.night;
    return out;
  });
  console.log('  render api: ' + JSON.stringify(api));
  t.assert(api.renderer && api.scene && api.camera && api.fog && api.sky && api.lights && api.water && api.fx, 'render surface');
  t.assert(Math.abs(api.fov - 60) < 0.1, 'fov 60');
  t.assert(api.w2s && api.w2s.visible && api.w2s.sx > 200 && api.w2s.sx < 1080 && api.w2s.sy > 100 && api.w2s.sy < 620, 'player projects near the screen centre: ' + JSON.stringify(api.w2s));
  t.assert(api.styles.length >= 8, 'facade styles');
  t.assert(api.atlasCells >= 30, 'atlas cells: ' + api.atlasCells);
  t.assert(api.night === 0, 'starts in daylight at 17:30');
  // the atlas has the required ground variants
  const cells = await page.evaluate(() => Object.keys(GTP.Assets.cells));
  ['asphalt', 'road_half', 'ave_inner', 'ave_outer', 'cross', 'cross_stop', 'sidewalk', 'sidewalk_edge', 'sidewalk_corner', 'curbface', 'grass', 'sand', 'parking', 'parking_bay', 'plaza', 'hw_inner', 'hw_outer', 'barrier', 'concrete', 'dock'].forEach((c) => t.assert(cells.indexOf(c) >= 0, 'atlas cell ' + c));

  const results = {};
  for (const s of SHOTS) {
    await page.evaluate((s) => {
      GTP.game.debug.setClock(s.clock);
      GTP.game.debug.freeCam(s.cam[0], s.cam[1], s.cam[2], s.look[0], s.look[1], s.look[2]);
    }, s);
    const file = await t.shot(page, s.name);
    const st = await t.pixelStats(page);
    const info = await page.evaluate(() => ({ chunks: GTP.Render.chunks.size, tris: GTP.Render.stats.triangles, calls: GTP.Render.stats.calls, ms: Math.round(GTP.Render.stats.frameMs), night: +GTP.Render.night.toFixed(2) }));
    results[s.name] = Object.assign({}, st, info);
    console.log('  ' + s.name + ': ' + JSON.stringify(results[s.name]) + ' -> ' + file);
    t.assert(st.colors > 400, s.name + ' is not monochrome: ' + st.colors + ' colours');
    t.assert(st.dark < 0.9 && st.bright < 0.9, s.name + ' is not blank');
  }
  // daylight shots have sky (blue) and the night shot is darker with warm lights
  t.assert(results.render_campus_quad.blue > 0.08, 'campus shot shows sky');
  t.assert(results.render_campus_quad.green > 0.04, 'campus shot shows lawns/trees');
  t.assert(results.render_marina_piers.blue > 0.1, 'marina shot shows water/sky');
  const day = results.render_downtown_avenue, night = results.render_downtown_night;
  t.assert(night.night >= 0.99, 'night at 22:00');
  t.assert(night.mean[0] + night.mean[1] + night.mean[2] < day.mean[0] + day.mean[1] + day.mean[2] - 60, 'night is darker than day');
  t.assert(night.warm > 0.004, 'night shot has warm lit windows / lamps: ' + night.warm);
  t.assert(results.render_sunset.warm > 0.03, 'sunset sky is warm: ' + results.render_sunset.warm);
  t.assert(results.render_bridge.blue > 0.15, 'bridge shot shows the channel: ' + results.render_bridge.blue);
  t.assert(results.render_overview.chunks >= 60, 'overview built most chunks: ' + results.render_overview.chunks);
  // back to the chase camera, which follows the player
  const back = await page.evaluate(() => {
    GTP.game.debug.followCam(); GTP.game.debug.setClock(17.5); GTP.game.advance(0.2);
    const p = GTP.game.player, c = GTP.Render.camera.position;
    return { d: Math.hypot(c.x - p.x, c.z - p.z), dy: c.y - p.y };
  });
  t.assert(back.d > 2.5 && back.d < 6 && back.dy > 0.5, 'chase camera restored: ' + JSON.stringify(back));
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
