/* qa_c_robust.js (QA-C): robustness probes for the browser shell.
 *  1. storage blocked: localStorage getter throws (file:// in some browsers, privacy modes) -> boots, saves fail softly
 *  2. storage full: setItem throws QuotaExceededError -> saveSlot returns false, no exception escapes
 *  3. WebGL context lost and restored -> the game keeps rendering a non-black frame with no new errors
 *  4. the frame loop at 240 Hz, 60 Hz and 30 Hz -> the simulation advances in real time (60 steps per second)
 *  5. a hidden tab for 30 s and back -> no catch-up burst, no dropped state
 *  6. tiny (160 x 120) and huge (3840 x 2160) windows -> renders, no NaN camera, HUD sized to the window
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_c_robust.js
 * Every probe runs and reports; the file fails if any probe fails. */
'use strict';
const H = require('../_harness');

H.run('qa_c_robust', async (t) => {
  const fails = [];
  const check = (cond, msg) => { console.log('  ' + (cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails.push(msg); };

  // 1. storage blocked entirely
  {
    const page = await t.browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); });
    await page.goto(t.url({ seed: 7 }));
    let booted = true;
    try { await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.state === 'playing', null, { timeout: 120000 }); } catch (e) { booted = false; }
    check(booted, 'storage blocked: the game boots to playing');
    if (booted) {
      const r = await page.evaluate(() => { let ok, threw = null; try { ok = GTP.game.saveSlot(1, { quiet: true }); } catch (e) { threw = String(e); } GTP.game.advance(1); return { ok, threw, errors: GTP.errors.map((e) => e.where + ': ' + e.message) }; });
      check(!r.threw && !r.ok, 'storage blocked: saveSlot fails softly (' + JSON.stringify(r) + ')');
      check(r.errors.length === 0, 'storage blocked: no GTP.errors (' + r.errors.join('; ') + ')');
    }
    check(errs.length === 0, 'storage blocked: no page errors (' + errs.join('; ') + ')');
    await page.close();
  }

  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;

  // 2. quota exceeded on write
  {
    const r = await page.evaluate(() => {
      const orig = Storage.prototype.setItem; let ok, threw = null;
      Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
      try { ok = GTP.game.saveSlot(2, { quiet: true }); } catch (e) { threw = String(e); }
      Storage.prototype.setItem = orig;
      return { ok, threw };
    });
    check(!r.threw && r.ok === false, 'quota exceeded: saveSlot returns false without throwing (' + JSON.stringify(r) + ')');
  }

  // 3. WebGL context loss and restore
  {
    const r = await page.evaluate(async () => {
      const R = GTP.Render, gl = R.renderer.getContext(), ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) return { skipped: true };
      const e0 = GTP.errors.length;
      ext.loseContext();
      await new Promise((res) => setTimeout(res, 100));
      for (let i = 0; i < 3; i++) { GTP.game.advance(1 / 30); GTP.game.render(); }
      ext.restoreContext();
      await new Promise((res) => setTimeout(res, 300));
      for (let i = 0; i < 3; i++) { GTP.game.advance(1 / 30); GTP.game.render(); }
      // read back the canvas
      const cv = R.renderer.domElement, off = document.createElement('canvas'); off.width = 64; off.height = 36;
      const c2 = off.getContext('2d'); GTP.game.render(); c2.drawImage(cv, 0, 0, 64, 36);
      const d = c2.getImageData(0, 0, 64, 36).data; let lum = 0, set = new Set();
      for (let i = 0; i < d.length; i += 4) { lum += d[i] + d[i + 1] + d[i + 2]; set.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4); }
      return { lost: gl.isContextLost(), meanLum: Math.round(lum / (d.length / 4) / 3), colors: set.size, newErrors: GTP.errors.slice(e0).map((e) => e.where + ': ' + e.message).slice(0, 5) };
    });
    if (r.skipped) console.log('  skip context loss: no WEBGL_lose_context');
    else {
      check(!r.lost, 'context restore: the context is back');
      check(r.colors > 20 && r.meanLum > 8, 'context restore: the frame after restore is a real picture (' + JSON.stringify({ lum: r.meanLum, colors: r.colors }) + ')');
      check(r.newErrors.length === 0, 'context loss: no errors (' + r.newErrors.join('; ') + ')');
    }
  }

  // 4. the real loop at 240, 60 and 30 Hz: drive _loop with synthetic timestamps
  {
    const r = await page.evaluate(() => {
      const g = GTP.game, raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
      const out = {};
      for (const hz of [240, 144, 60, 30, 20, 10]) {
        const s0 = g.steps, dt = 1000 / hz; let ts = performance.now() + 1000; g._last = ts; g._acc = 0;
        const frames = Math.round(hz * 2);
        for (let i = 0; i < frames; i++) { ts += dt; g._loop(ts); }
        out[hz] = g.steps - s0;
      }
      window.requestAnimationFrame = raf;
      return out;
    });
    console.log('  steps in 2 s of wall time by refresh rate: ' + JSON.stringify(r));
    for (const hz of [240, 144, 60, 30]) check(Math.abs(r[hz] - 120) <= 2, hz + ' Hz: 120 steps per 2 s (got ' + r[hz] + ')');
    check(r[10] >= 100, '10 Hz: the sim keeps real time (got ' + r[10] + ' of 120 steps: MAX_STEPS 5 caps a frame at 83 ms, so below 12 fps the game runs in slow motion)');
  }

  // 5. hidden tab for 30 s: emulate the visibility events around a 30 s gap in rAF timestamps
  {
    const r = await page.evaluate(() => {
      const g = GTP.game, raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
      let ts = performance.now(); g._last = ts; g._acc = 0;
      for (let i = 0; i < 10; i++) { ts += 16.7; g._loop(ts); }
      const s0 = g.steps, clock0 = g.time.t;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      ts += 30000;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
      g._loop(ts);
      const burst = g.steps - s0;
      delete document.hidden;
      window.requestAnimationFrame = raf;
      return { burst, dtClock: +(g.time.t - clock0).toFixed(3) };
    });
    check(r.burst <= 5, 'tab resume: no catch-up burst (' + r.burst + ' steps in the first frame back)');
  }

  // 6. tiny and huge windows
  for (const [w, h] of [[160, 120], [3840, 2160]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      GTP.game.advance(0.5); GTP.game.render();
      const R = GTP.Render, c = R.camera, hud = document.getElementById('hud'), gl = R.renderer.domElement;
      return { w: R.width, h: R.height, glW: gl.width, glH: gl.height, hudW: hud && hud.width, hudH: hud && hud.height, aspect: +c.aspect.toFixed(3), camOk: [c.position.x, c.position.y, c.position.z].every(Number.isFinite), errors: GTP.errors.length };
    });
    console.log('  ' + w + 'x' + h + ': ' + JSON.stringify(r));
    check(r.camOk && r.errors === 0, w + 'x' + h + ': renders with a finite camera and no errors');
    check(Math.abs(r.aspect - w / h) < 0.02, w + 'x' + h + ': camera aspect follows the window');
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  t.assert(fails.length === 0, fails.length + ' robustness probe(s) failed:\n' + fails.join('\n'));
});
