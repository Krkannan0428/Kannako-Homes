/* render.js: chunk cache, free camera screenshots (downtown, marina, campus), night tint, fx, sprites. */
'use strict';
const H = require('./_harness');
// Classify the rendered canvas pixels in-page (no image libraries needed).
function colorStats(page) {
  return page.evaluate(() => {
    const cv = GTP.Render.canvas, ctx = GTP.Render.ctx;
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0, blue = 0, green = 0, gray = 0, dark = 0;
    for (let i = 0; i < d.length; i += 16) { // every 4th pixel
      const r = d[i], g = d[i + 1], b = d[i + 2]; n++;
      if (b > r + 30 && b > g) blue++; else if (g > r + 20 && g > b + 10) green++;
      else if (Math.abs(r - g) < 12 && Math.abs(g - b) < 16) { if (r < 60) dark++; else gray++; }
    }
    return { blue: +(blue / n).toFixed(3), green: +(green / n).toFixed(3), gray: +(gray / n).toFixed(3), dark: +(dark / n).toFixed(3), w: cv.width, h: cv.height };
  });
}

H.run('render', async (t) => {
  const { page, pageErrors, consoleErrors } = await t.openGame({ seed: 7 });
  const base = await page.evaluate(() => ({
    scale: GTP.Render.scale, cssW: GTP.Render.cssW, cssH: GTP.Render.cssH,
    chunks: GTP.Render.chunks.size, paints: GTP.Render.stats.chunkPaints
  }));
  t.assert(base.cssW === 1280 && base.cssH === 720 && Math.abs(base.scale - 1) < 1e-6, 'canvas sizing ' + JSON.stringify(base));
  t.assert(base.chunks > 0 && base.chunks <= 9, 'initial chunk cache ' + JSON.stringify(base));

  const spots = { downtown: [1792, 1700], marina: [1900, 3000], campus: [1520, 520] };
  const stats = {};
  for (const name of Object.keys(spots)) {
    const s = spots[name];
    await page.evaluate((s) => { GTP.game.debug.freeCam(s[0], s[1], 1); GTP.game.render(); }, s);
    const file = await t.screenshot(page, 'render_' + name);
    stats[name] = await colorStats(page);
    console.log('  ' + name + ': ' + file + ' ' + JSON.stringify(stats[name]));
  }
  t.assert(stats.marina.w === 1280 && stats.marina.h === 720, 'backing store should be 1280x720 at dpr 1');
  t.assert(stats.marina.blue > 0.08, 'marina shot should show water');
  t.assert(stats.campus.green > 0.25, 'campus shot should be mostly grass');
  t.assert(stats.downtown.gray + stats.downtown.dark > 0.5, 'downtown should be mostly asphalt and concrete');
  // directly settable camera (no helper), render without advancing
  await page.evaluate(() => { GTP.Render.cam.x = 600; GTP.Render.cam.y = 1000; GTP.game.render(); });
  const camAfter = await page.evaluate(() => [GTP.Render.cam.x, GTP.Render.cam.y]);
  t.assert(camAfter[0] === 600 && camAfter[1] === 1000, 'render() must not move a manually set camera');

  // chunk cache: a still camera repaints nothing, a full-map sweep stays under the LRU cap
  const sweep = await page.evaluate(() => {
    GTP.game.debug.freeCam(1792, 1700, 1); GTP.game.render();
    const before = GTP.Render.stats.chunkPaints;
    for (let i = 0; i < 10; i++) GTP.game.render();
    const still = GTP.Render.stats.chunkPaints - before;
    for (let y = 300; y < 4096; y += 700) for (let x = 300; x < 4096; x += 1200) { GTP.game.debug.freeCam(x, y, 1); GTP.game.render(); }
    const total = Math.ceil(GTP.World.w / GTP.C.CHUNK_TILES) * Math.ceil(GTP.World.h / GTP.C.CHUNK_TILES);
    return { still, paints: GTP.Render.stats.chunkPaints, size: GTP.Render.chunks.size, cap: GTP.C.CHUNK_CACHE_MAX, total };
  });
  t.assert(sweep.still === 0, 'still camera must not repaint chunks ' + JSON.stringify(sweep));
  t.assert(sweep.size <= sweep.cap && sweep.size > 0, 'chunk cache exceeded cap ' + JSON.stringify(sweep));
  t.assert(sweep.paints <= sweep.total + 20, 'a single sweep should paint about one map worth of chunks ' + JSON.stringify(sweep));

  // follow camera: after moving the player the camera tracks them
  const follow = await page.evaluate(() => {
    GTP.game.debug.followCam();
    const p = GTP.game.player;
    GTP.Input.set('right', true); GTP.Input.set('run', true);
    GTP.game.advance(2);
    GTP.Input.set('right', false); GTP.Input.set('run', false);
    GTP.game.advance(1.5);
    return { px: p.x, py: p.y, cx: GTP.Render.cam.x, cy: GTP.Render.cam.y };
  });
  t.assert(Math.abs(follow.cx - follow.px) < 40 && Math.abs(follow.cy - follow.py) < 40, 'camera should settle on the player ' + JSON.stringify(follow));

  // night tint + lights + fx + sprites render without errors
  await page.evaluate(() => {
    GTP.game.debug.setClock(23);
    const p = GTP.game.player;
    GTP.game.debug.spawnVehicle(p.x + 80, p.y, 'sedan');
    GTP.game.debug.spawnVehicle(p.x - 80, p.y + 40, 'cop');
    GTP.Entities.add(new GTP.Ped({ x: p.x + 30, y: p.y - 30 }));
    GTP.Entities.add(new GTP.Pickup({ x: p.x - 40, y: p.y - 40, pickupType: 'cash' }));
    GTP.Render.fx.add({ type: 'explosion', x: p.x + 120, y: p.y + 60 });
    GTP.Render.fx.add({ type: 'text', x: p.x, y: p.y - 30, text: '+$50', color: '#5bd16a' });
    GTP.Render.fx.add({ type: 'puff', x: p.x + 20, y: p.y + 20 });
    GTP.game.advance(0.2);
    GTP.game.render(0.5);
  });
  const night = await page.evaluate(() => ({ night: GTP.Render.night, fx: GTP.Render.fx.list.length, sprites: GTP.Render.sprites.cache.size, shake: GTP.Render.cam.shake }));
  t.assert(night.night === 1, 'night should be 1 at 23:00, got ' + night.night);
  t.assert(night.sprites >= 3, 'sprite cache should hold ped + vehicle sprites: ' + night.sprites);
  const nightFile = await t.screenshot(page, 'render_night');
  console.log('  night: ' + nightFile + ' ' + JSON.stringify(night));
  // dawn ramp is monotonic
  const ramp = await page.evaluate(() => [4.9, 5.5, 6.5, 7.1, 12, 18.5, 20, 21.5].map((c) => +GTP.Render.nightFromClock(c).toFixed(3)));
  t.assert(ramp[0] === 1 && ramp[1] < ramp[0] && ramp[2] < ramp[1] && ramp[3] === 0 && ramp[4] === 0 && ramp[5] > 0 && ramp[6] > ramp[5] && ramp[7] === 1, 'night ramp ' + JSON.stringify(ramp));
  // frame cost sanity (headless software rendering is slow; this only catches pathological cases)
  const cost = await page.evaluate(() => { GTP.game.debug.setClock(12); let s = 0; for (let i = 0; i < 20; i++) { GTP.game.render(1); s += GTP.Render.stats.frameMs; } return s / 20; });
  console.log('  avg frame ms (cached chunks): ' + cost.toFixed(2));
  t.assert(cost < 60, 'frame too slow: ' + cost + ' ms');

  const errs = await t.gameErrors(page);
  t.assert(errs.length === 0, 'GTP.errors:\n' + errs.join('\n'));
  t.assert(pageErrors.length === 0, pageErrors.join('\n'));
  t.assert(consoleErrors.length === 0, consoleErrors.join('\n'));
});
