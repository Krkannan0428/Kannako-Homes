#!/usr/bin/env node
/* sync-game.js: copy the browser game (index.html, vendor/, js/) from the repository into
 * desktop/app/ so the Electron build never references files outside desktop/.
 *
 *   node sync-game.js          copies ../index.html, ../vendor, ../js  ->  ./app
 *
 * It also works as an electron-builder `beforePack` hook (see electron-builder.yml), so a bare
 * `npx electron-builder` still picks up the current game files. app/ is rebuilt from scratch on
 * every run so files deleted upstream do not linger in the package. No dependencies.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DESKTOP = __dirname;
const GAME = path.resolve(DESKTOP, '..');
const APP = path.join(DESKTOP, 'app');
const ITEMS = ['index.html', 'vendor', 'js'];

function copyTree(src, dst, stats) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) copyTree(path.join(src, name), path.join(dst, name), stats);
  } else {
    fs.copyFileSync(src, dst);
    stats.files += 1;
    stats.bytes += st.size;
  }
}

function sync() {
  for (const item of ITEMS) {
    if (!fs.existsSync(path.join(GAME, item))) {
      throw new Error('sync-game: ' + path.join(GAME, item) + ' is missing; desktop/ must live inside the grand-theft-pundit checkout');
    }
  }
  fs.rmSync(APP, { recursive: true, force: true });
  fs.mkdirSync(APP, { recursive: true });
  const stats = { files: 0, bytes: 0 };
  for (const item of ITEMS) copyTree(path.join(GAME, item), path.join(APP, item), stats);
  // the game never needs these at runtime; they only bloat the package
  for (const junk of ['.DS_Store', 'Thumbs.db']) {
    const p = path.join(APP, junk);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  console.log('sync-game: copied ' + ITEMS.join(', ') + ' -> ' + path.relative(process.cwd(), APP) + ' (' + stats.files + ' files, ' + (stats.bytes / 1024).toFixed(0) + ' KB)');
  return stats;
}

// electron-builder calls the exported function once per platform/arch with a BeforePackContext
module.exports = function beforePack() {
  sync();
};
module.exports.sync = sync;

if (require.main === module) {
  try {
    sync();
  } catch (e) {
    console.error(e && e.message ? e.message : e);
    process.exit(1);
  }
}
