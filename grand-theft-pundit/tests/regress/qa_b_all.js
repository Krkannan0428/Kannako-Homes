/* qa_b_all.js: runs every QA-B regression test (tests/regress/qa_b_<id>.js) one after another and prints a table.
 * Each test FAILS while its bug is present and passes once it is fixed, so on the v0.3 base every row reads OPEN.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_all.js [filter]
 *   filter: a substring of the file name, e.g. `txt` or `fe_0`. Exit code 0 always (it is a status report, not a gate). */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = __dirname, ROOT = path.resolve(DIR, '..', '..');
const filter = process.argv[2] || '';
const files = fs.readdirSync(DIR).filter((f) => /^qa_b_(?!lib_|all\.js).+\.js$/.test(f) && f.indexOf(filter) >= 0).sort();
const rows = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { cwd: ROOT, env: process.env, encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const why = (out.match(/(ASSERT:[^\n]*|FAIL[^\n]*)/) || [''])[0].slice(0, 160);
  rows.push({ f, status: r.status === 0 ? 'FIXED' : (r.error ? 'ERROR' : 'OPEN'), s: ((Date.now() - t0) / 1000).toFixed(0), why });
  console.log((r.status === 0 ? 'FIXED' : 'OPEN ') + '  ' + f.padEnd(20) + ' ' + rows[rows.length - 1].s.padStart(4) + ' s  ' + (r.status === 0 ? '' : why));
}
const open = rows.filter((r) => r.status !== 'FIXED').length;
console.log('\n' + rows.length + ' QA-B regression tests: ' + open + ' open, ' + (rows.length - open) + ' fixed');
