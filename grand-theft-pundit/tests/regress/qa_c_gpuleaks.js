/* qa_c_gpuleaks.js (QA-C QAC-07, QAC-08, QAC-09): GPU geometries that are created per use and never disposed.
 *  QAC-07 held-weapon switches to the hot mic / Ratio Launcher (Assets.weaponMesh builds new geometry each call)
 *  QAC-08 thrown projectiles (Render.buildEntityMesh makes a SphereGeometry per projectile, detach never frees it)
 *  QAC-09 pickups (labelMesh makes a PlaneGeometry + material per label, never freed)
 * The AI spawner is frozen so only the tested path allocates; each case must return renderer.info.memory.geometries
 * to within a small constant of where it started.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_c_gpuleaks.js */
'use strict';
const H = require('../_harness');

H.run('qa_c_gpuleaks', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    const g = GTP.game, R = GTP.Render, p = g.player; p.godMode = true;
    GTP.AI.update = function () { };
    const geo = () => { g.render(); return R.renderer.info.memory.geometries; };
    g.advance(1); const res = {};
    g.debug.giveWeapon('hotmic', 5); g.debug.giveWeapon('pistol', 30); g.debug.giveWeapon('ratio', 3);
    // warm one of each so the first-use caches are filled
    for (const w of ['hotmic', 'pistol', 'ratio', 'fist']) { p.weapon = w; g.advance(0.05); g.render(); }
    let g0 = geo();
    for (let i = 0; i < 30; i++) { p.weapon = ['hotmic', 'pistol', 'ratio'][i % 3]; g.advance(0.05); g.render(); }
    p.weapon = 'fist'; g.advance(0.1);
    res.weaponSwitches30 = geo() - g0;
    g0 = geo(); g.debug.giveWeapon('hottake', 20);
    for (let i = 0; i < 10; i++) { p.weapon = 'hottake'; GTP.Combat.fire(p, 'hottake'); g.advance(0.15); g.render(); g.advance(1.0); g.render(); }
    p.weapon = 'fist'; g.advance(2);
    res.hottakes10 = geo() - g0;
    const fwd = new THREE.Vector3(); R.camera.getWorldDirection(fwd);
    g0 = geo();
    const pks = []; for (let i = 0; i < 10; i++) pks.push(GTP.Combat.spawnPickup({ type: 'weapon', weaponId: 'pistol', ammo: 5, x: p.x + fwd.x * 6 + (i - 5) * 0.4, z: p.z + fwd.z * 6 }));
    g.advance(0.05); geo();
    pks.forEach((e) => e.destroy()); g.advance(0.1);
    res.weaponPickups10 = geo() - g0;
    return res;
  });
  console.log('  geometries left behind: ' + JSON.stringify(r));
  const fails = [];
  if (r.weaponSwitches30 > 3) fails.push('QAC-07: 30 held-weapon switches left ' + r.weaponSwitches30 + ' geometries');
  if (r.hottakes10 > 2) fails.push('QAC-08: 10 thrown hot takes left ' + r.hottakes10 + ' geometries');
  if (r.weaponPickups10 > 2) fails.push('QAC-09: 10 removed weapon pickups left ' + r.weaponPickups10 + ' geometries');
  t.assert(fails.length === 0, fails.join('\n'));
});
