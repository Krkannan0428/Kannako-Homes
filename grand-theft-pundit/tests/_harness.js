/* Shared Playwright harness for Grand Theft Pundit tests.
 * Usage: const H = require('./_harness'); H.run('name', async (t) => { ... });
 * Run:   cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/<file>.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tests', 'out');
const INDEX = 'file://' + path.join(ROOT, 'index.html');

function url(params) {
  const p = Object.assign({ headless: 1, seed: 7, skipTitle: 1 }, params || {});
  return INDEX + '?' + Object.keys(p).map((k) => k + '=' + encodeURIComponent(p[k])).join('&');
}

async function openGame(browser, params, opts) {
  opts = opts || {};
  const page = await browser.newPage({ viewport: { width: 1312, height: 720 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(url(params));
  await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.state === 'playing', null, { timeout: 20000 });
  return { page, pageErrors, consoleErrors };
}

async function gameErrors(page) {
  return page.evaluate(() => (window.GTP && GTP.errors || []).map((e) => e.where + ': ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
}

async function screenshot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name + '.png');
  await page.evaluate(() => GTP.game.render());
  await page.locator('#game').screenshot({ path: file });
  return file;
}

function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

async function run(name, fn) {
  const t0 = Date.now();
  const browser = await chromium.launch();
  let failed = false;
  try {
    await fn({ browser, openGame: (p, o) => openGame(browser, p, o), screenshot, gameErrors, assert, url, OUT, ROOT });
    console.log('PASS ' + name + ' (' + (Date.now() - t0) + ' ms)');
  } catch (e) {
    failed = true;
    console.error('FAIL ' + name + ': ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { run, openGame, screenshot, gameErrors, assert, url, OUT, ROOT, INDEX };
