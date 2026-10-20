#!/usr/bin/env node
/* make-icon.js: render build/icon.html to the icon PNGs electron-builder consumes.
 *
 *   build/icon.png        1024x1024, macOS style (rounded tile on the 824px grid, transparent margin)
 *   build/icon-full.png   1024x1024, the same tile filling the canvas (Windows .ico and Linux)
 *
 * Needs Playwright with a Chromium download. It is deliberately NOT a dependency of this package:
 * the PNGs are committed, so a normal build never runs this. To regenerate after editing icon.html:
 *
 *   npx --yes playwright@1.56.1 install chromium   (once, if no Chromium is present)
 *   NODE_PATH=$(npm root -g) npm run icon           (or any resolvable `playwright` module)
 */
'use strict';
const path = require('path');
const fs = require('fs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('make-icon: cannot resolve the "playwright" module. See the header of build/make-icon.js.');
  process.exit(2);
}

const HERE = __dirname;
const PAGE = 'file://' + path.join(HERE, 'icon.html');
const OUT = [
  { id: 'mac', file: path.join(HERE, 'icon.png') },
  { id: 'full', file: path.join(HERE, 'icon-full.png') }
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 2200 }, deviceScaleFactor: 1 });
    await page.goto(PAGE);
    await page.evaluate(() => document.fonts.ready); // eslint-disable-line no-undef -- runs in the page
    for (const o of OUT) {
      const el = await page.$('#' + o.id);
      await el.screenshot({ path: o.file, omitBackground: true, type: 'png' });
      const st = fs.statSync(o.file);
      console.log('make-icon: wrote ' + path.relative(process.cwd(), o.file) + ' (' + (st.size / 1024).toFixed(0) + ' KB)');
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error('make-icon failed: ' + (e && e.stack || e));
  process.exit(1);
});
