/* Shared Playwright harness for Grand Theft Pundit tests.
 * Usage: const H = require('./_harness'); H.run('name', async (t) => { ... });
 * Run:   cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/<file>.js
 *
 * launch()           chromium with the SwiftShader flags, viewport 1280x720
 * boot(page, params) opens index.html?headless=1&seed=7&skipTitle=1 (+params) and waits for playing
 * waitPlaying(page)  waits for window.GTP && GTP.game && GTP.game.state === 'playing'
 * errors(page)       page errors + console errors + GTP.errors (one tolerated load failure: js/2x_content_*.js)
 * shot(page, name)   renders a frame and saves tests/out/<name>.png; returns the path
 * pixelStats(page)   colour statistics of the GL canvas (not monochrome checks)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tests', 'out');
const INDEX = 'file://' + path.join(ROOT, 'index.html');
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const EVAL_TIMEOUT = 240000;

function url(params, file) {
  const p = Object.assign({ headless: 1, seed: 7, skipTitle: 1 }, params || {});
  return (file || INDEX) + '?' + Object.keys(p).map((k) => k + '=' + encodeURIComponent(p[k])).join('&');
}

async function launch() {
  return chromium.launch({ args: ARGS });
}

// a missing js/2x_content_*.js is tolerated (another agent may still be writing it)
function tolerated(msg) {
  return /js\/2[0-9]_content_[a-z]+\.js/.test(msg) && /(Failed to load resource|ERR_FILE_NOT_FOUND|net::)/.test(msg);
}

async function boot(browser, params, file) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(EVAL_TIMEOUT);
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!tolerated(t)) consoleErrors.push(t); } });
  page.on('requestfailed', (r) => { const u = r.url(); if (!/js\/2[0-9]_content_/.test(u)) consoleErrors.push('request failed: ' + u); });
  await page.goto(url(params, file));
  await waitPlaying(page);
  return { page, pageErrors, consoleErrors };
}

async function waitPlaying(page) {
  await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.state === 'playing', null, { timeout: EVAL_TIMEOUT });
}

async function gameErrors(page) {
  return page.evaluate(() => (window.GTP && GTP.errors || []).map((e) => e.where + ': ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
}

async function errors(ctx) {
  const inPage = await gameErrors(ctx.page);
  return [].concat(ctx.pageErrors.map((e) => 'pageerror: ' + e), ctx.consoleErrors.map((e) => 'console: ' + e), inPage.map((e) => 'GTP.errors: ' + e));
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name + '.png');
  await page.evaluate(() => GTP.game.render());
  await page.screenshot({ path: file });
  return file;
}

// colour statistics of the GL canvas: distinct colours, channel spread, dominant hue buckets
async function pixelStats(page) {
  return page.evaluate(() => {
    const cv = document.getElementById('gl');
    const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
    const ctx = off.getContext('2d');
    GTP.game.render();
    ctx.drawImage(cv, 0, 0);
    const d = ctx.getImageData(0, 0, off.width, off.height).data;
    const set = new Set(); let n = 0, sumR = 0, sumG = 0, sumB = 0, blue = 0, green = 0, warm = 0, dark = 0, bright = 0;
    for (let i = 0; i < d.length; i += 16) {
      const r = d[i], g = d[i + 1], b = d[i + 2]; n++;
      set.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
      sumR += r; sumG += g; sumB += b;
      if (b > r + 25 && b > g + 5) blue++; else if (g > r + 15 && g > b + 15) green++; else if (r > g + 20 && r > b + 30) warm++;
      const l = (r + g + b) / 3; if (l < 28) dark++; else if (l > 225) bright++;
    }
    return { w: off.width, h: off.height, colors: set.size, mean: [sumR / n, sumG / n, sumB / n].map((v) => Math.round(v)), blue: +(blue / n).toFixed(3), green: +(green / n).toFixed(3), warm: +(warm / n).toFixed(3), dark: +(dark / n).toFixed(3), bright: +(bright / n).toFixed(3) };
  });
}

function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

async function run(name, fn) {
  const t0 = Date.now();
  const browser = await launch();
  let failed = false;
  try {
    await fn({ browser, boot: (p, f) => boot(browser, p, f), shot, errors, gameErrors, pixelStats, waitPlaying, assert, url, OUT, ROOT, INDEX });
    console.log('PASS ' + name + ' (' + (Date.now() - t0) + ' ms)');
  } catch (e) {
    failed = true;
    console.error('FAIL ' + name + ': ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { run, launch, boot, waitPlaying, errors, gameErrors, shot, pixelStats, assert, url, OUT, ROOT, INDEX, ARGS };
