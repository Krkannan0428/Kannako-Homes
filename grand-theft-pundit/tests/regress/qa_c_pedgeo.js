/* qa_c_pedgeo.js (QA-C finding QAC-01): GTP.Assets' ped geometry cache (pedGeoCache in js/05_assets.js) is keyed by
 * every look field and never evicts, so each new random look the spawner rolls uploads new merged geometries that
 * stay on the GPU for the rest of the session (about 75 geometries and 8 MB of heap per game minute in qa_c_soak).
 * This builds three batches of 500 looks from GTP.Content.looks.roll; the third batch must add only a small, bounded
 * number of new geometries.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_c_pedgeo.js */
'use strict';
const H = require('../_harness');

H.run('qa_c_pedgeo', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => {
    // the spawner's own look roller, the same districts and roles it uses
    const Lk = GTP.Content.looks, ds = ['downtown', 'campus', 'suburbs', 'marina', 'industrial', 'strip', 'docks', 'uptown'];
    const seen = new Set();
    const batch = (n) => {
      const before = seen.size;
      for (let i = 0; i < n; i++) {
        const grp = GTP.Assets.pedParts(Lk.roll(ds[i % ds.length], null));
        grp.traverse((o) => { if (o.isMesh && o.geometry) seen.add(o.geometry.uuid); });
      }
      return seen.size - before;
    };
    return { first500: batch(500), second500: batch(500), third500: batch(500) };
  });
  console.log('  distinct ped geometries added per 500 rolled looks: ' + JSON.stringify(r));
  t.assert(r.third500 < 60, 'the ped geometry cache stays bounded: the third batch of 500 looks still added ' + r.third500 + ' new geometries (never freed)');
});
