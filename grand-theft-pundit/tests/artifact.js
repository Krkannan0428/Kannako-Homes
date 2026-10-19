/* artifact.js: build-artifact.js inlines css + vendor + js, strips the html/head/body wrappers, and
 * the resulting single page boots headless from file:// and renders a frame. Also enforces the
 * repo rules: no Math.random and no ES module syntax in js/. */
'use strict';
const H = require('./_harness');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

H.run('artifact', async (t) => {
  const out = path.join(t.ROOT, 'dist', 'artifact.html');
  execFileSync(process.execPath, [path.join(t.ROOT, 'build-artifact.js'), out], { stdio: 'inherit' });
  const html = fs.readFileSync(out, 'utf8');
  t.assert(!/<!doctype|<html|<\/html>|<head>|<\/head>|<body|<\/body>/i.test(html), 'wrappers must be stripped');
  t.assert(html.trimStart().startsWith('<title>Grand Theft Pundit</title>'), '<title> must come first');
  t.assert(html.indexOf('<meta name="claude:viewport-fit-sides" content="cover">') > 0, 'viewport-fit-sides meta');
  t.assert(!/<script\s+src=/.test(html), 'all scripts must be inlined');
  t.assert(html.indexOf('/* vendor/three.min.js */') > 0 && /WebGLRenderer/.test(html) && /"152"/.test(html), 'three.js r152 is inlined');
  t.assert(/padding-left:\s*max\(16px,\s*env\(safe-area-inset-left/.test(html) && /padding-right:\s*max\(16px,\s*env\(safe-area-inset-right/.test(html), 'safe-area gutters');
  t.assert(/color-scheme:\s*dark/.test(html) && /html,\s*body\s*\{\s*height:\s*100%/.test(html), 'theme + 100% height');
  t.assert(!/100vh/.test(html), 'never 100vh');
  t.assert(!/\b(alert|confirm|prompt)\s*\(/.test(html.replace(/\/\*[\s\S]*?\*\//g, '')), 'no alert/confirm/prompt');
  t.assert(html.length < 16 * 1024 * 1024, 'artifact too large');
  // repo rules on js/
  const jsFiles = fs.readdirSync(path.join(t.ROOT, 'js')).filter((f) => f.endsWith('.js'));
  const bad = jsFiles.filter((f) => /Math\.random\s*\(/.test(fs.readFileSync(path.join(t.ROOT, 'js', f), 'utf8')));
  t.assert(bad.length === 0, 'Math.random() called in ' + bad.join(','));
  const esm = jsFiles.filter((f) => /^\s*(import|export)\s/m.test(fs.readFileSync(path.join(t.ROOT, 'js', f), 'utf8')));
  t.assert(esm.length === 0, 'ES module syntax in ' + esm.join(','));
  const dialogs = jsFiles.filter((f) => /\b(alert|confirm|prompt)\s*\(/.test(fs.readFileSync(path.join(t.ROOT, 'js', f), 'utf8')));
  t.assert(dialogs.length === 0, 'alert/confirm/prompt in ' + dialogs.join(','));

  // the inlined page boots headless from file://
  const ctx = await t.boot({ seed: 7 }, 'file://' + out);
  const r = await ctx.page.evaluate(() => { GTP.Input.set('forward', true); GTP.game.advance(2); GTP.Input.set('forward', false); GTP.game.render(); return { errors: GTP.errors.length, t: GTP.game.time.t, title: document.title, chunks: GTP.Render.chunks.size, x: GTP.game.player.x, z: GTP.game.player.z }; });
  console.log('  artifact boot: ' + JSON.stringify(r));
  t.assert(r.errors === 0 && r.t > 1.9 && r.chunks > 0, 'inlined page runs ' + JSON.stringify(r));
  t.assert(r.title === 'Grand Theft Pundit', 'title: ' + r.title);
  const file = await t.shot(ctx.page, 'artifact');
  const st = await t.pixelStats(ctx.page);
  console.log('  artifact shot: ' + file + ' ' + JSON.stringify(st));
  t.assert(st.colors > 300, 'artifact frame is not monochrome');
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
