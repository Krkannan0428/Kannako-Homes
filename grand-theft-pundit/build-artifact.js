#!/usr/bin/env node
/* build-artifact.js: inline css + vendor/three.min.js + every js/ file (in the order index.html
 * lists them) into dist/artifact.html with the <!doctype>, <html>, <head> and <body> wrappers
 * stripped, so the result can be published as a single artifact page. No dependencies.
 *
 *   node build-artifact.js            -> dist/artifact.html
 *   node build-artifact.js out.html   -> custom output path
 */
'use strict';
var fs = require('fs');
var path = require('path');

var root = __dirname;
var src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var outPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'dist', 'artifact.html');

function between(html, open, close) {
  var a = html.search(open), b = html.search(close);
  if (a < 0 || b < 0) return '';
  var start = html.indexOf('>', a) + 1;
  return html.slice(start, b);
}

var head = between(src, /<head[^>]*>/i, /<\/head>/i);
var body = between(src, /<body[^>]*>/i, /<\/body>/i);

// drop metas the artifact skeleton provides itself
head = head.replace(/<meta\s+charset=[^>]*>\s*/i, '').replace(/<meta\s+name="viewport"[^>]*>\s*/i, '');

// inline external scripts (local files only, in document order)
var inlined = [];
body = body.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, function (m, file) {
  var p = path.join(root, file);
  if (!fs.existsSync(p)) {
    // a content file another agent is still writing: leave a note instead of failing the build
    if (/^js\/2[0-9]_content_/.test(file)) { inlined.push(file + ' (missing, skipped)'); return '<script>/* ' + file + ' not present at build time */</script>'; }
    throw new Error('missing script: ' + file);
  }
  var js = fs.readFileSync(p, 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  inlined.push(file);
  return '<script>\n/* ' + file + ' */\n' + js + '\n</script>';
});

// inline external stylesheets, if any are ever added
head = head.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, function (m, file) {
  var p = path.join(root, file);
  if (!fs.existsSync(p)) return m; // leave remote links alone
  return '<style>\n' + fs.readFileSync(p, 'utf8') + '\n</style>';
});

var out = head.trim() + '\n' + body.trim() + '\n';
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out);
console.log('wrote ' + path.relative(root, outPath) + ' (' + (out.length / 1024).toFixed(1) + ' KB), inlined ' + inlined.length + ' scripts:\n  ' + inlined.join('\n  '));
