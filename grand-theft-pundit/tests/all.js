/* all.js: runs every tests/*.js except itself and helpers (_*.js); exits non-zero on any failure. */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'all.js' && !f.startsWith('_')).sort();
let failed = 0;
const results = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit', env: process.env, cwd: path.resolve(dir, '..') });
  const ok = r.status === 0;
  if (!ok) failed++;
  results.push((ok ? 'ok   ' : 'FAIL ') + f + ' (' + (Date.now() - t0) + ' ms)');
}
console.log('\n' + results.join('\n'));
console.log(failed ? '\n' + failed + ' of ' + files.length + ' test file(s) failed' : '\nall ' + files.length + ' test files passed');
process.exit(failed ? 1 : 0);
