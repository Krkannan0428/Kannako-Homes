#!/usr/bin/env node
/* make-dmg-background.js: render build/dmg-background.html to the macOS disk-image backgrounds.
 *
 *   build/background.png      560x400   (electron-builder.yml `dmg.background`)
 *   build/background@2x.png   1120x800  (picked up next to it automatically for Retina displays)
 *
 * Like make-icon.js it needs Playwright with a Chromium download and is deliberately NOT a
 * dependency of this package: the PNGs are committed, so a normal build never runs this.
 *
 *   npx --yes playwright@1.56.1 install chromium   (once, if no Chromium is present)
 *   NODE_PATH=$(npm root -g) npm run dmg-background (or any resolvable `playwright` module)
 */
'use strict';
const path = require('path');
const fs = require('fs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('make-dmg-background: cannot resolve the "playwright" module. See the header of build/make-dmg-background.js.');
  process.exit(2);
}

const HERE = __dirname;
const PAGE = 'file://' + path.join(HERE, 'dmg-background.html');
const OUT = [
  { scale: 1, file: path.join(HERE, 'background.png') },
  { scale: 2, file: path.join(HERE, 'background@2x.png') }
];

(async () => {
  const browser = await chromium.launch();
  try {
    for (const o of OUT) {
      const page = await browser.newPage({ viewport: { width: 600, height: 440 }, deviceScaleFactor: o.scale });
      await page.goto(PAGE);
      await page.evaluate(() => document.fonts.ready); // eslint-disable-line no-undef -- runs in the page
      const el = await page.$('#bg');
      await el.screenshot({ path: o.file, type: 'png' });
      await page.close();
      const st = fs.statSync(o.file);
      console.log('make-dmg-background: wrote ' + path.relative(process.cwd(), o.file) + ' (' + (st.size / 1024).toFixed(0) + ' KB)');
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error('make-dmg-background failed: ' + (e && e.stack || e));
  process.exit(1);
});
