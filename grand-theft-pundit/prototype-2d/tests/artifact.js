/* artifact.js: build-artifact.js inlines everything, strips wrappers, and the result boots. */
'use strict';
const H = require('./_harness');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

H.run('artifact', async (t) => {
  const out = path.join(t.OUT, 'artifact.html');
  execFileSync(process.execPath, [path.join(t.ROOT, 'build-artifact.js'), out], { stdio: 'inherit' });
  const html = fs.readFileSync(out, 'utf8');
  t.assert(!/<!doctype|<html|<\/html>|<head>|<\/head>|<body|<\/body>/i.test(html), 'wrappers must be stripped');
  t.assert(html.trimStart().startsWith('<title>Grand Theft Pundit</title>'), '<title> must come first');
  t.assert(html.indexOf('<meta name="claude:viewport-fit-sides" content="cover">') > 0, 'viewport-fit-sides meta');
  t.assert(!/<script\s+src=/.test(html), 'all scripts must be inlined');
  t.assert(/padding-left:\s*max\(16px,\s*env\(safe-area-inset-left/.test(html) && /padding-right:\s*max\(16px,\s*env\(safe-area-inset-right/.test(html), 'safe-area gutters');
  t.assert(/color-scheme:\s*dark/.test(html) && /html,\s*body\s*\{\s*height:\s*100%/.test(html), 'theme + 100% height');
  t.assert(html.length < 16 * 1024 * 1024, 'artifact too large');
  // Math.random is banned in js/
  const bad = fs.readdirSync(path.join(t.ROOT, 'js')).filter((f) => /Math\.random/.test(fs.readFileSync(path.join(t.ROOT, 'js', f), 'utf8')));
  t.assert(bad.length === 0, 'Math.random used in ' + bad.join(','));
  const esm = fs.readdirSync(path.join(t.ROOT, 'js')).filter((f) => /^\s*(import|export)\s/m.test(fs.readFileSync(path.join(t.ROOT, 'js', f), 'utf8')));
  t.assert(esm.length === 0, 'ES module syntax in ' + esm.join(','));

  // the inlined page boots headless from file://
  const page = await t.browser.newPage({ viewport: { width: 1312, height: 720 } });
  const perr = [];
  page.on('pageerror', (e) => perr.push(String(e)));
  await page.goto('file://' + out + '?headless=1&seed=7&skipTitle=1');
  await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.state === 'playing', null, { timeout: 20000 });
  const r = await page.evaluate(() => { GTP.game.advance(2); GTP.game.render(); return { errors: GTP.errors.length, t: GTP.game.time.t, title: document.title }; });
  t.assert(r.errors === 0 && r.t > 1.9, 'inlined page runs ' + JSON.stringify(r));
  t.assert(r.title === 'Grand Theft Pundit', 'title: ' + r.title);
  t.assert(perr.length === 0, perr.join('\n'));
  await page.locator('#game').screenshot({ path: path.join(t.OUT, 'artifact.png') });
});
