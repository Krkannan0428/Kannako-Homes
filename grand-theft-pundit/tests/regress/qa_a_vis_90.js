/* QA-A-VIS-90: on a desktop window with no safe-area insets the game canvas must fill the window edge to edge
 * (today #app's 16 px side padding leaves black bars). */
'use strict';
const H = require('../_harness');
H.run('qa_a_vis_90 canvas fills the window', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const r = await ctx.page.evaluate(() => { const b = document.getElementById('gl').getBoundingClientRect(); return { x: b.x, w: b.width, win: innerWidth }; });
  console.log('  ' + JSON.stringify(r));
  t.assert(r.x === 0 && r.w === r.win, 'the GL canvas spans the whole window: ' + JSON.stringify(r));
});
