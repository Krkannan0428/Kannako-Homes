/* updater.js: keep friends on the latest release without them having to think about it.
 *
 * Releases live on this repository's GitHub Releases page (public, so no token is needed). The
 * repository is read from "gtpUpdates" in package.json. Checks run a few seconds after launch and
 * then every CHECK_EVERY_MS while the game is open.
 *
 * Two modes, picked once at start (see pickMode):
 *
 *   install  electron-updater downloads the new version in the background (the window's taskbar or
 *            dock progress shows it) and then offers "Restart to update". If the player says Later,
 *            the update is applied the next time the game quits. Used for the Windows installer,
 *            the Linux AppImage and macOS builds signed with a Developer ID (Squirrel.Mac refuses
 *            to apply updates to an unsigned app).
 *   notify   no download: a "Version X is available" message with a button that opens the release
 *            page in the browser. Used for unsigned macOS builds, the Windows portable exe and
 *            Linux runs that are not an AppImage (unpacked folders, extracted AppImages).
 *
 * Messages use Electron dialogs and native notifications, never alert/confirm in the page. The
 * first check after launch speaks up with a dialog (the player is on the title screen); later
 * background checks use a notification that opens the same dialog when clicked, so a dialog never
 * pops up in the middle of a chase. "Check for Updates..." in the menu always answers, even with
 * "you are up to date".
 *
 * Both modes read the same metadata electron-builder writes and the release workflow attaches to
 * every release: latest.yml (Windows), latest-mac.yml, latest-linux.yml. Notify mode fetches the
 * one for this platform from releases/latest/download, so a release only counts as "available"
 * once its build for this platform is attached. Everything the updater does is written to
 * logs/update.log in the user-data folder; failures also go to the crash log.
 *
 * Environment overrides (testing and CI):
 *   GTP_UPDATES=off|notify|install   force a mode (off is also the default for unpackaged dev runs)
 *   GTP_UPDATE_FEED_URL=<url>        read the metadata from <url>/latest*.yml (an electron-updater
 *                                    "generic" feed, e.g. a local `python3 -m http.server` serving a
 *                                    dist/ folder) instead of GitHub Releases
 */
'use strict';
const { app, dialog, shell, Notification, BrowserWindow, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const crashLog = require('./crash-log');

const FIRST_CHECK_DELAY_MS = 8 * 1000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const PRODUCT = 'Grand Theft Pundit';
const LOG_MAX_BYTES = 256 * 1024;

let feed = null;           // { owner, repo } or { url } (GTP_UPDATE_FEED_URL)
let mode = 'off';
let autoUpdater = null;    // electron-updater, loaded only in install mode
let checking = false;
let manualCheck = false;   // the current check came from the menu
let firstCheck = true;     // the current check is the one right after launch
let readyVersion = null;   // downloaded and waiting for a restart
let announced = new Set(); // versions already announced this session (notify mode and notifications)
let timer = null;

function log(message) {
  try {
    const file = path.join(crashLog.logDir(), 'update.log');
    try { if (fs.statSync(file).size > LOG_MAX_BYTES) fs.renameSync(file, file.replace(/\.log$/, '.old.log')); } catch (_e) { /* new file */ }
    fs.appendFileSync(file, new Date().toISOString() + ' ' + String(message).replace(/\r?\n/g, '\n    ') + '\n');
  } catch (_err) { /* logging must never break the game */ }
}

function fail(message) {
  log('ERROR ' + message);
  crashLog.write('update', message);
}

function releasesPage(version) {
  if (feed.url) return feed.url;
  const base = 'https://github.com/' + feed.owner + '/' + feed.repo + '/releases';
  return version ? base + '/tag/v' + String(version).replace(/^v/, '') : base + '/latest';
}

/* where this platform's latest*.yml lives */
function metadataUrl() {
  const name = process.platform === 'win32' ? 'latest.yml' : process.platform === 'darwin' ? 'latest-mac.yml' : 'latest-linux.yml';
  const base = feed.url ? feed.url.replace(/\/+$/, '') : 'https://github.com/' + feed.owner + '/' + feed.repo + '/releases/latest/download';
  return base + '/' + name;
}

function readFeed() {
  if (process.env.GTP_UPDATE_FEED_URL) return { url: String(process.env.GTP_UPDATE_FEED_URL) };
  try {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    const f = pkg.gtpUpdates;
    if (f && f.owner && f.repo) return { owner: String(f.owner), repo: String(f.repo) };
  } catch (_err) { /* fall through */ }
  return null;
}

/* Is this macOS app signed with a Developer ID? Ad-hoc and unsigned builds are not. */
function macSignedWithDeveloperId() {
  return new Promise((resolve) => {
    const bundle = path.resolve(process.execPath, '..', '..', '..');
    execFile('/usr/bin/codesign', ['-dv', '--verbose=2', bundle], { timeout: 10000 }, (err, _stdout, stderr) => {
      if (err) return resolve(false);
      resolve(/Authority=Developer ID Application/.test(String(stderr)));
    });
  });
}

async function pickMode() {
  const forced = String(process.env.GTP_UPDATES || '').toLowerCase();
  if (forced === 'off' || forced === 'notify' || forced === 'install') return forced;
  if (!app.isPackaged) return 'off';
  if (process.platform === 'win32') return process.env.PORTABLE_EXECUTABLE_DIR ? 'notify' : 'install';
  if (process.platform === 'linux') return process.env.APPIMAGE ? 'install' : 'notify';
  if (process.platform === 'darwin') return (await macSignedWithDeveloperId()) ? 'install' : 'notify';
  return 'notify';
}

function mainWindow() {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.gtpMain) || null;
}

function showBox(options) {
  const win = mainWindow();
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

/* "1.2.10" > "1.2.9"; pre-release tags sort below the release. */
function newer(a, b) {
  const parse = (v) => {
    const [core, pre] = String(v).replace(/^v/, '').split('-');
    return { nums: core.split('.').map((n) => parseInt(n, 10) || 0), pre: pre || '' };
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((x.nums[i] || 0) !== (y.nums[i] || 0)) return (x.nums[i] || 0) > (y.nums[i] || 0);
  }
  if (x.pre === y.pre) return false;
  if (!x.pre) return true;
  if (!y.pre) return false;
  return x.pre > y.pre;
}

/* Ask once with a dialog now, or with a notification that opens the dialog when clicked. */
function announce(version, asDialog, openDialog) {
  if (asDialog || !Notification.isSupported()) {
    openDialog();
    return;
  }
  const body = readyVersion
    ? 'Version ' + version + ' is downloaded. Click to restart now, or it installs when you quit.'
    : 'Version ' + version + ' is available. Click for details.';
  const n = new Notification({ title: PRODUCT + ' update', body, silent: true });
  n.on('click', openDialog);
  n.show();
}

// ------------------------------------------------------------------------------- notify mode

async function latestRelease() {
  const url = metadataUrl();
  const res = await net.fetch(url, { headers: { 'User-Agent': PRODUCT + '/' + app.getVersion() }, cache: 'no-store' });
  // 404: no release yet, or the latest one has no build for this platform (releases before 0.3)
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('the update server answered ' + res.status + ' for ' + url);
  const m = /^version:\s*['"]?([0-9][^'"\s]*)/m.exec(await res.text());
  if (!m) throw new Error('no version in ' + url);
  return { version: m[1], url: releasesPage(m[1]) };
}

function offerDownload(version, url) {
  return showBox({
    type: 'info',
    title: PRODUCT + ' update',
    message: 'Version ' + version + ' is available',
    detail: 'You have version ' + app.getVersion() + '. This copy of the game cannot update itself' +
      (process.platform === 'darwin' ? ' (it is not signed by a registered Apple developer)' : '') +
      ', so download the new version from the release page and replace this one. Your saves and mods folder are kept.',
    buttons: ['Open Release Page', 'Later'],
    defaultId: 0,
    cancelId: 1
  }).then(({ response }) => {
    if (response === 0) shell.openExternal(url).catch(() => {});
  });
}

async function checkNotify() {
  const rel = await latestRelease();
  log('notify: latest is ' + (rel ? rel.version : 'none') + ', running ' + app.getVersion());
  if (!rel || !rel.version || !newer(rel.version, app.getVersion())) {
    if (manualCheck) upToDate();
    return;
  }
  if (!manualCheck && announced.has(rel.version)) return;
  announced.add(rel.version);
  announce(rel.version, firstCheck || manualCheck, () => offerDownload(rel.version, rel.url));
}

// ------------------------------------------------------------------------------ install mode

function offerRestart(version) {
  return showBox({
    type: 'info',
    title: PRODUCT + ' update',
    message: 'Version ' + version + ' is ready to install',
    detail: 'Restart the game now to update (about ten seconds), or keep playing and it installs the next time you quit. Your saves and mods folder are kept.',
    buttons: ['Restart to Update', 'Later'],
    defaultId: 0,
    cancelId: 1
  }).then(({ response }) => {
    if (response === 0) setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });
}

function setProgress(fraction) {
  const win = mainWindow();
  if (win) win.setProgressBar(fraction);
}

function initInstallMode() {
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.logger = {
    info: (m) => log(String(m)),
    debug: () => {},
    warn: (m) => log('WARN ' + m),
    error: (m) => log('ERROR ' + m)
  };
  autoUpdater.setFeedURL(feed.url ? { provider: 'generic', url: feed.url } : { provider: 'github', owner: feed.owner, repo: feed.repo });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('update-available', (info) => {
    if (manualCheck) {
      showBox({ type: 'info', title: PRODUCT + ' update', message: 'Downloading version ' + info.version, detail: 'It downloads in the background; you will be asked to restart when it is ready.', buttons: ['OK'] });
    }
  });
  autoUpdater.on('update-not-available', () => {
    if (manualCheck) upToDate();
  });
  autoUpdater.on('download-progress', (p) => setProgress(Math.max(0, Math.min(1, (p.percent || 0) / 100))));
  autoUpdater.on('update-downloaded', (info) => {
    setProgress(-1);
    readyVersion = info.version;
    if (announced.has('ready:' + info.version) && !manualCheck) return;
    announced.add('ready:' + info.version);
    announce(info.version, firstCheck || manualCheck, () => offerRestart(info.version));
  });
  autoUpdater.on('error', (err) => {
    setProgress(-1);
    fail('install-mode update failed: ' + (err && err.stack || err));
  });
}

async function checkInstall() {
  if (readyVersion) {
    if (manualCheck) offerRestart(readyVersion);
    return;
  }
  const result = await autoUpdater.checkForUpdates();
  // the download continues in the background; wait for it so errors land in our catch
  if (result && result.downloadPromise) await result.downloadPromise;
}

// ------------------------------------------------------------------------------------ shared

function upToDate() {
  showBox({ type: 'info', title: PRODUCT, message: 'You have the latest version', detail: PRODUCT + ' ' + app.getVersion() + ' is the newest release.', buttons: ['OK'] });
}

async function check(manual) {
  if (mode === 'off') return;
  if (checking) {
    // a background check is running; let its result answer the menu click
    if (manual) manualCheck = true;
    return;
  }
  checking = true;
  manualCheck = !!manual;
  try {
    if (mode === 'install') await checkInstall();
    else await checkNotify();
  } catch (err) {
    fail('update check failed: ' + (err && err.message || err));
    if (manualCheck) {
      const { response } = await showBox({
        type: 'warning',
        title: PRODUCT + ' update',
        message: 'Could not check for updates',
        detail: String(err && err.message || err).split('\n')[0] + '\n\nYou can always download the newest version from the release page.',
        buttons: ['Open Release Page', 'OK'],
        defaultId: 1,
        cancelId: 1
      });
      if (response === 0) shell.openExternal(releasesPage()).catch(() => {});
    }
  } finally {
    checking = false;
    manualCheck = false;
    firstCheck = false;
  }
}

async function start() {
  feed = readFeed();
  if (!feed) {
    fail('no gtpUpdates owner/repo in package.json; updates are off');
    return;
  }
  mode = await pickMode();
  log('version ' + app.getVersion() + ' on ' + process.platform + ', update mode ' + mode + ', feed ' + (feed.url || feed.owner + '/' + feed.repo));
  if (mode === 'off') return;
  if (mode === 'install') {
    try {
      initInstallMode();
    } catch (err) {
      fail('electron-updater failed to load, falling back to notify mode: ' + (err && err.stack || err));
      mode = 'notify';
    }
  }
  setTimeout(() => check(false), FIRST_CHECK_DELAY_MS);
  timer = setInterval(() => check(false), CHECK_EVERY_MS);
  if (timer.unref) timer.unref();
}

/* Menu entry: "Check for Updates..." */
function checkNow() {
  if (mode === 'off') {
    showBox({
      type: 'info',
      title: PRODUCT,
      message: 'Updates are off in this copy',
      detail: app.isPackaged ? 'Automatic updates were turned off (GTP_UPDATES=off).' : 'This is a development run (npm start); packaged builds check for updates.',
      buttons: ['Open Release Page', 'OK'],
      defaultId: 1,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0 && feed) shell.openExternal(releasesPage()).catch(() => {});
    });
    return;
  }
  check(true);
}

module.exports = { start, checkNow, releasesPage: (v) => feed ? releasesPage(v) : null, mode: () => mode, newer };
