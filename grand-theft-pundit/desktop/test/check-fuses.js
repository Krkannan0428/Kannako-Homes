#!/usr/bin/env node
/* check-fuses.js: read the Electron fuses back from a packaged app and fail unless they match
 * electron-builder.yml's electronFuses block (QAC-05).
 *
 *   node test/check-fuses.js <app binary, or the .app bundle on macOS> [...more]
 *
 *   node test/check-fuses.js dist/linux-unpacked/grand-theft-pundit
 *   node test/check-fuses.js "dist/mac-arm64/Grand Theft Pundit.app" "dist/mac/Grand Theft Pundit.app"
 *   node test/check-fuses.js "dist/win-unpacked/Grand Theft Pundit.exe"
 *
 * The expected values come from electron-builder.yml itself, so the two cannot drift apart; fuses the
 * yml does not mention are printed but not checked.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { getCurrentFuseWire } = require('@electron/fuses');
const { FuseV1Options } = require('@electron/fuses/dist/config');
const { FuseState } = require('@electron/fuses/dist/constants');

// electron-builder.yml key -> FuseV1Options name
const KEYS = {
  runAsNode: 'RunAsNode',
  enableCookieEncryption: 'EnableCookieEncryption',
  enableNodeOptionsEnvironmentVariable: 'EnableNodeOptionsEnvironmentVariable',
  enableNodeCliInspectArguments: 'EnableNodeCliInspectArguments',
  enableEmbeddedAsarIntegrityValidation: 'EnableEmbeddedAsarIntegrityValidation',
  onlyLoadAppFromAsar: 'OnlyLoadAppFromAsar',
  loadBrowserProcessSpecificV8Snapshot: 'LoadBrowserProcessSpecificV8Snapshot',
  grantFileProtocolExtraPrivileges: 'GrantFileProtocolExtraPrivileges'
};

/* The electronFuses block of electron-builder.yml: "  key: true|false" lines under it. */
function expectedFuses() {
  const yml = fs.readFileSync(path.join(__dirname, '..', 'electron-builder.yml'), 'utf8').split(/\r?\n/);
  const start = yml.findIndex((l) => /^electronFuses:\s*$/.test(l));
  if (start < 0) throw new Error('electron-builder.yml has no electronFuses block');
  const out = {};
  for (let i = start + 1; i < yml.length; i++) {
    const line = yml[i];
    if (/^[^\s#]/.test(line)) break;                       // the next top-level key ends the block
    if (/^\s*(#.*)?$/.test(line)) continue;                 // blank or comment
    const m = /^\s+([A-Za-z0-9]+):\s*(true|false)\s*(#.*)?$/.exec(line);
    if (!m) throw new Error('electron-builder.yml line ' + (i + 1) + ' in electronFuses is not "key: true|false": ' + line.trim());
    if (m[1] === 'resetAdHocDarwinSignature') continue;   // a build option, not a fuse
    if (!KEYS[m[1]]) throw new Error('electron-builder.yml line ' + (i + 1) + ': unknown fuse "' + m[1] + '" (add it to KEYS in test/check-fuses.js)');
    out[KEYS[m[1]]] = m[2] === 'true';
  }
  if (!Object.keys(out).length) throw new Error('electron-builder.yml electronFuses block sets no fuses');
  return out;
}

async function check(app, expected) {
  const wire = await getCurrentFuseWire(app);
  let ok = true;
  console.log(app);
  for (const [key, value] of Object.entries(wire)) {
    if (key === 'version' || key === 'resetAdHocDarwinSignature') continue;
    const name = FuseV1Options[key] || 'fuse ' + key;
    const state = value === FuseState.ENABLE ? true : value === FuseState.DISABLE ? false : null;
    const want = Object.prototype.hasOwnProperty.call(expected, name) ? expected[name] : undefined;
    const bad = want !== undefined && state !== want;
    if (bad) ok = false;
    console.log('  ' + (bad ? 'FAIL ' : want === undefined ? '     ' : 'ok   ') + name + ' is ' + (state === null ? 'state ' + value : state ? 'Enabled' : 'Disabled') +
      (want === undefined ? '' : ' (want ' + (want ? 'Enabled' : 'Disabled') + ')'));
  }
  for (const name of Object.keys(expected)) {
    if (!Object.values(wire).length || !Object.keys(wire).some((k) => FuseV1Options[k] === name)) {
      ok = false;
      console.log('  FAIL ' + name + ' is not in this Electron\'s fuse wire');
    }
  }
  return ok;
}

(async () => {
  const apps = process.argv.slice(2);
  if (!apps.length) {
    console.error('usage: node test/check-fuses.js <packaged app binary or .app> [...]');
    process.exit(2);
  }
  const expected = expectedFuses();
  let ok = true;
  for (const app of apps) {
    if (!fs.existsSync(app)) { console.error('not found: ' + app); ok = false; continue; }
    if (!(await check(app, expected))) ok = false;
  }
  console.log(ok ? 'FUSES OK' : 'FUSES WRONG');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
