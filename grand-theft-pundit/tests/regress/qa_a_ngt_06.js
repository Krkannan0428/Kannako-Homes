/* QA-A-NGT-06: getting into a car at night (or nightfall while driving) freezes the game while every lit material
 * recompiles. Render.syncVehicle sets Render.lights.headlight.visible = lightsOn, and a SpotLight that turns visible
 * changes the scene's light count, which is part of every lit program's key: entering a car at 22:00 compiles 14-18
 * new programs in one frame (medium: 9.0 s under SwiftShader against 14 ms the frame before). The pool lights
 * avoid this by staying visible at intensity 0; the player's headlight does not.
 * Enters a car at night and checks that the visible light count and the program count do not change. */
'use strict';
const H = require('../_harness');

H.run('qa_a_ngt_06 entering a car at night compiles no shaders', async (t) => {
  const ctx = await t.boot({ seed: 7, clock: 22, weather: 'clear' });
  const r = await ctx.page.evaluate(() => {
    const d = GTP.game.debug, R = GTP.Render, g = GTP.game, pl = g.player;
    const p = GTP.World.nearestRoadPoint(pl.x, pl.z);
    const v = d.spawnVehicle(p.x, p.z, 'sedan');
    for (let i = 0; i < 4; i++) { g.advance(1 / 30); g.render(); }
    const lights = () => { let n = 0; R.scene.traverseVisible((o) => { if (o.isLight) n++; }); return n; };
    const before = { programs: R.renderer.info.programs.length, lights: lights() };
    v.enter(pl, 0);
    g.advance(1 / 30); g.render();
    const after = { programs: R.renderer.info.programs.length, lights: lights(), headlight: R.lights.headlight.visible };
    return { before, after, night: +R.night.toFixed(2) };
  });
  console.log('  enter at night: ' + JSON.stringify(r));
  t.assert(r.night > 0.9 && r.after.headlight, 'night, and the player car headlight is on: ' + JSON.stringify(r));
  t.assert(r.after.lights === r.before.lights, 'the visible light count stays the same (' + r.before.lights + ' -> ' + r.after.lights + ')');
  t.assert(r.after.programs - r.before.programs <= 1, 'no shader recompile on entering: ' + r.before.programs + ' -> ' + r.after.programs + ' programs');
});
