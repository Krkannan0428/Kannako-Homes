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
 * Messages use Electron dialogs and native notifications, never alert/confirm in the page. An
 * update the player did not ask about opens a dialog only while the game is on its title screen or
 * paused; in the middle of play it shows a notification (click it for the dialog) and the dialog
 * waits until the player next pauses or goes back to the title, so a dialog never pops up in the
 * middle of a chase (where Enter, the game's confirm key, would press its default button).
 * "Check for Updates..." in the menu always answers, even with "you are up to date".
 *
 * Install mode is used only where the update can really be applied: a genuine AppImage (the
 * process runs inside $APPDIR and $APPIMAGE is a file in a writable folder; an APPIMAGE variable
 * inherited from some other program does not count), the NSIS-installed game on Windows (its
 * uninstaller sits next to the exe), and a Developer-ID-signed macOS app that is not running from
 * the disk image or a translocated path. Everything else gets notify mode.
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
let readyVersion = null;   // downloaded and waiting for a restart
let downloadingVersion = null; // found and downloading in the background
let announced = new Set(); // versions already announced this session (notify mode and notifications)
let timer = null;
let pendingOffer = null;   // a dialog waiting for the player to pause or return to the title
let pendingTimer = null;
const notifications = new Set(); // shown notifications, kept referenced so their click handler survives GC

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

function writable(dir) {
  try { fs.accessSync(dir, fs.constants.W_OK); return true; } catch (_e) { return false; }
}

/* A genuine AppImage run: AppRun sets APPDIR to the mount point the binary runs from and APPIMAGE to
 * the .AppImage file. An APPIMAGE inherited from another program (a terminal opened from some other
 * AppImage) must not make the updater delete that program's file. */
function realAppImage() {
  const file = process.env.APPIMAGE, dir = process.env.APPDIR;
  if (!file || !dir || !path.isAbsolute(file)) return false;
  if (!process.execPath.startsWith(path.resolve(dir) + path.sep)) return false;
  try { if (!fs.statSync(file).isFile()) return false; } catch (_e) { return false; }
  return writable(path.dirname(file));
}

async function pickMode() {
  const forced = String(process.env.GTP_UPDATES || '').toLowerCase();
  if (forced === 'off' || forced === 'notify' || forced === 'install') return forced;
  if (!app.isPackaged) return 'off';
  if (process.platform === 'win32') {
    // only the NSIS-installed game can run the next installer; the portable exe and unpacked or
    // copied folders have no uninstaller next to the exe
    if (process.env.PORTABLE_EXECUTABLE_DIR) return 'notify';
    return fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall ' + PRODUCT + '.exe')) ? 'install' : 'notify';
  }
  if (process.platform === 'linux') return realAppImage() ? 'install' : 'notify';
  if (process.platform === 'darwin') {
    const bundle = path.resolve(process.execPath, '..', '..', '..');
    // run from the disk image, or moved by Gatekeeper's App Translocation: Squirrel cannot swap it
    if (/^\/Volumes\//.test(bundle) || /\/AppTranslocation\//.test(bundle) || !writable(path.dirname(bundle))) return 'notify';
    return (await macSignedWithDeveloperId()) ? 'install' : 'notify';
  }
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

/* Is the player at a point where a dialog interrupts nothing: the game window is visible and the
 * game is on its title screen or paused? (Answers false if the page is too busy to say within 2 s.) */
async function gameAtRest() {
  const win = mainWindow();
  if (!win || !win.isVisible()) return false;
  const state = await Promise.race([
    win.webContents.executeJavaScript('(window.GTP && GTP.game && GTP.game.state) || ""', true).catch(() => ''),
    new Promise((resolve) => setTimeout(() => resolve(''), 2000))
  ]);
  return state === 'title' || state === 'paused';
}

/* Show the offer the next time the player pauses or goes back to the title (checked every 5 s). */
function offerWhenAtRest(openDialog) {
  pendingOffer = openDialog;
  if (pendingTimer) return;
  pendingTimer = setInterval(async () => {
    if (!pendingOffer || !(await gameAtRest())) return;
    const open = pendingOffer;
    pendingOffer = null;
    clearInterval(pendingTimer);
    pendingTimer = null;
    open();
  }, 5000);
  if (pendingTimer.unref) pendingTimer.unref();
}

/* Tell the player about an update: a dialog now if they asked (menu) or are on the title/paused,
 * otherwise a notification now and the dialog at their next pause. */
async function announce(version, asked, openDialog) {
  if (asked || (await gameAtRest())) {
    pendingOffer = null;
    openDialog();
    return;
  }
  offerWhenAtRest(openDialog);
  if (!Notification.isSupported()) return;
  const body = readyVersion
    ? 'Version ' + version + ' is downloaded. Click to restart now, or it installs when you quit.'
    : 'Version ' + version + ' is available. Click for details.';
  const n = new Notification({ title: PRODUCT + ' update', body, silent: true });
  notifications.add(n);
  const forget = () => notifications.delete(n);
  n.on('click', () => {
    forget();
    pendingOffer = null;
    openDialog();
  });
  n.on('close', forget);
  n.on('failed', forget);
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
  await announce(rel.version, manualCheck, () => offerDownload(rel.version, rel.url));
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
    // silent + run after: the Windows installer installs without its wizard and starts the game
    // again; on macOS and the AppImage the new version starts as well
    if (response === 0) setImmediate(() => autoUpdater.quitAndInstall(true, true));
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
  const provider = feed.url ? { provider: 'generic', url: feed.url } : { provider: 'github', owner: feed.owner, repo: feed.repo };
  // electron-updater reads resources/app-update.yml for its download cache folder even when the
  // feed is set in code; builds made without a publish config (npm run dist:* locally) have none,
  // so write the equivalent into the data folder for them
  if (!fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
    const file = path.join(app.getPath('userData'), 'app-update.yml');
    const yml = Object.entries(Object.assign({}, provider, { updaterCacheDirName: 'grand-theft-pundit-updater' }))
      .map(([k, v]) => k + ': ' + JSON.stringify(String(v))).join('\n') + '\n';
    fs.writeFileSync(file, yml);
    autoUpdater.updateConfigPath = file;
    log('no app-update.yml in this build; using ' + file);
  }
  autoUpdater.setFeedURL(provider);
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('update-available', (info) => {
    downloadingVersion = info.version;
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
    downloadingVersion = null;
    if (announced.has('ready:' + info.version) && !manualCheck) return;
    announced.add('ready:' + info.version);
    announce(info.version, manualCheck, () => offerRestart(info.version));
  });
  autoUpdater.on('error', (err) => {
    setProgress(-1);
    downloadingVersion = null;
    fail('install-mode update failed: ' + (err && err.stack || err));
  });
}

async function checkInstall() {
  if (readyVersion) {
    if (manualCheck) offerRestart(readyVersion);
    return;
  }
  const result = await autoUpdater.checkForUpdates();
  // null: electron-updater considers itself inactive here (not packaged, no APPIMAGE, ...)
  if (!result) throw new Error('the updater is not active in this copy of the game');
  // the download continues in the background; wait for it so errors land in our catch
  if (result.downloadPromise) await result.downloadPromise;
}

// ------------------------------------------------------------------------------------ shared

function upToDate() {
  showBox({ type: 'info', title: PRODUCT, message: 'You have the latest version', detail: PRODUCT + ' ' + app.getVersion() + ' is the newest release.', buttons: ['OK'] });
}

async function check(manual) {
  if (mode === 'off') return;
  if (checking) {
    if (!manual) return;
    if (downloadingVersion) {
      // a background download is under way; say so now rather than when it finishes
      showBox({ type: 'info', title: PRODUCT + ' update', message: 'Downloading version ' + downloadingVersion, detail: 'It downloads in the background; you will be asked to restart when it is ready.', buttons: ['OK'] });
    } else {
      // a background check is running; let its result answer the menu click
      manualCheck = true;
    }
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
