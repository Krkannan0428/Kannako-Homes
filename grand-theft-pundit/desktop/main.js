/* Grand Theft Pundit: Electron main process.
 *
 * One BrowserWindow that loads app/index.html (copied from the repository by sync-game.js).
 * The game itself is plain browser code and needs nothing from Node, so the renderer runs with
 * the default hardening (context isolation on, node integration off, sandbox on, web security on).
 *
 * Window-level behaviour:
 *   - a small splash window (splash/splash.html) while the game boots. It shows "Loading the game"
 *     while the ~2.5 MB of scripts load, then mirrors the game's own loading screen (GTP.game.loading
 *     fraction and label), and the game window appears only once that loading is done and the title
 *     has drawn, so the player sees one loading UI and never the game's half-built loading screen
 *     (BOOT_TIMEOUT_MS caps the wait)
 *   - size, position, maximized and full screen state remembered between runs (lib/window-state.js);
 *     1280x800 the first time, minimum 960x600, dark background so there is no white flash
 *   - macOS: a small app menu. Windows/Linux: a hidden menu bar that Alt shows (Game and Help menus)
 *   - F11 and Cmd/Ctrl+F toggle full screen; Esc is left alone for the game
 *   - Ctrl+Shift+M (Cmd+Shift+M) opens the mods folder, Ctrl+Shift+I (Cmd+Option+I) the developer tools
 *   - pointer lock and fullscreen permission requests are granted, everything else is denied
 *   - links that leave the app open in the system browser; new windows are never created
 *   - a single instance: launching the game twice focuses the running window
 *   - a mods folder (see MODS below): *.js and *.css files there are loaded into the game after
 *     every page load, and images there are handed to those scripts as data URLs
 *   - a crash log in the user-data folder (lib/crash-log.js), with a menu item that opens it
 *   - automatic updates from GitHub Releases (lib/updater.js)
 *
 * Environment (tests and CI): GTP_USER_DATA_DIR=<dir> uses that folder instead of the normal
 * user-data folder (window state, mods, logs); GTP_UPDATES=off|notify|install (see lib/updater.js).
 */
'use strict';
const { app, BrowserWindow, Menu, shell, dialog, nativeTheme, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const PRODUCT = 'Grand Theft Pundit';
const BG = '#06070d'; // --bg in index.html
const APP_INDEX = path.join(__dirname, 'app', 'index.html');
const SPLASH = path.join(__dirname, 'splash', 'splash.html');
const ICON = path.join(__dirname, 'splash', 'icon.png');
const IS_MAC = process.platform === 'darwin';
const WINDOW_DEFAULTS = { width: 1280, height: 800, minWidth: 960, minHeight: 600 };
const BOOT_TIMEOUT_MS = 60 * 1000;
const BOOT_POLL_MS = 120;

app.name = PRODUCT;
// Linux: X11 shows the GTK theme's window background (light grey on Adwaita) for as long as the page
// has not painted, which after the splash is the length of the game's first heavy frame: a white
// flash between the splash and the title. A dark GTK theme for this app makes that background dark
// (dialogs follow nativeTheme 'dark' anyway). Must be set before GTK starts; a user's own GTK_THEME wins.
const SET_GTK_THEME = process.platform === 'linux' && !process.env.GTK_THEME;
if (SET_GTK_THEME) process.env.GTK_THEME = 'Adwaita:dark';
if (process.env.GTP_USER_DATA_DIR) app.setPath('userData', path.resolve(process.env.GTP_USER_DATA_DIR));

// required after the userData path is final: both write there
const crashLog = require('./lib/crash-log');
const windowState = require('./lib/window-state');
const updater = require('./lib/updater');

crashLog.init();

// only one copy of the game at a time
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = gameWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  app.whenReady().then(start);
}

function gameWindow() {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.gtpMain) || null;
}

function start() {
  // GTK has read it by now; programs we launch (file manager, browser) keep the user's own theme
  if (SET_GTK_THEME) delete process.env.GTK_THEME;
  nativeTheme.themeSource = 'dark';
  app.setAboutPanelOptions({
    applicationName: PRODUCT,
    applicationVersion: app.getVersion(),
    version: 'Electron ' + process.versions.electron,
    copyright: 'A parody. No real pundits were harmed.',
    iconPath: ICON
  });
  installMenu();
  if (!fs.existsSync(APP_INDEX)) {
    crashLog.write('main', 'game files missing: ' + APP_INDEX);
    dialog.showErrorBox(PRODUCT + ': game files missing',
      'Could not find ' + APP_INDEX + '\n\nRun `npm run sync` (or any `npm run dist:*` script) inside desktop/ first; it copies index.html, js/ and vendor/ into desktop/app/.');
    app.quit();
    return;
  }
  createWindow();
  updater.start().catch((err) => crashLog.write('update', 'updater did not start: ' + (err && err.stack || err)));
  app.on('activate', () => {
    if (!gameWindow()) createWindow();
  });
}

function createSplash() {
  const splash = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    center: true,
    backgroundColor: BG,
    title: PRODUCT,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  splash.setMenu(null);
  splash.once('ready-to-show', () => { if (!splash.isDestroyed()) splash.show(); });
  splash.loadFile(SPLASH, { hash: 'v=' + encodeURIComponent(app.getVersion()) }).catch(() => {});
  return splash;
}

function createWindow() {
  const state = windowState.load(WINDOW_DEFAULTS);
  const splash = createSplash();
  const win = new BrowserWindow({
    title: PRODUCT,
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    center: state.x == null,
    minWidth: WINDOW_DEFAULTS.minWidth,
    minHeight: WINDOW_DEFAULTS.minHeight,
    backgroundColor: BG,
    show: false,
    autoHideMenuBar: true,
    fullscreenable: true,
    icon: IS_MAC ? undefined : ICON,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // the game boots while the window is still hidden behind the splash
      backgroundThrottling: false
    }
  });
  win.gtpMain = true;
  const wc = win.webContents;
  crashLog.watch(wc);

  // pointer lock (mouse look) and fullscreen are the only permissions the game may ask for
  const allowed = new Set(['pointerLock', 'fullscreen', 'keyboardLock']);
  wc.session.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  wc.session.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  // Window shortcuts. Esc is deliberately not handled here so the game keeps it (pause menu,
  // exiting pointer lock). The menus show these accelerators but do not register them, so the
  // only keys taken from the game are exactly these combinations.
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    const mod = IS_MAC ? input.meta : input.control;
    const key = String(input.key || '').toLowerCase();
    if (input.key === 'F11' || (mod && key === 'f' && !input.alt && !input.shift)) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    } else if (mod && input.shift && !input.alt && key === 'm') {
      event.preventDefault();
      openModsFolder();
    } else if ((IS_MAC ? (input.meta && input.alt && !input.shift) : (input.control && input.shift && !input.alt)) && key === 'i') {
      event.preventDefault();
      wc.toggleDevTools();
    }
  });

  // no zooming the game by accident (pinch / Ctrl+wheel)
  wc.setVisualZoomLevelLimits(1, 1).catch(() => {});

  // never open child windows; http(s) links go to the system browser
  wc.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    if (!isLocal(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  wc.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || details.reason === 'killed') return;
    if (!splash.isDestroyed()) splash.destroy();
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: PRODUCT + ' stopped',
      message: 'The game stopped unexpectedly (' + details.reason + ').',
      detail: 'Your last save is safe. The details were written to the crash log:\n' + crashLog.logFile(),
      buttons: ['Restart the Game', 'Open Crash Log', 'Quit'],
      defaultId: 0,
      cancelId: 2
    });
    if (choice === 0) {
      wc.reload();
    } else {
      if (choice === 1) openCrashLog();
      app.quit();
    }
  });

  wc.on('did-finish-load', () => {
    loadMods(wc);
    waitForGame(wc, (p) => splashProgress(splash, p)).then(reveal);
  });

  // Show the game window once the game has booted, close the splash, and restore maximized or
  // full screen state. ready-to-show alone is too early: it fires before the game scripts run.
  let revealed = false;
  function reveal() {
    if (revealed || win.isDestroyed()) return;
    revealed = true;
    if (state.maximized) win.maximize();
    win.show();
    if (state.fullscreen) win.setFullScreen(true);
    win.focus();
    if (!splash.isDestroyed()) splash.destroy();
  }
  // a page that never loads must not leave the player staring at the splash
  setTimeout(reveal, BOOT_TIMEOUT_MS + 5000);

  windowState.track(win);
  win.on('closed', () => {
    if (!splash.isDestroyed()) splash.destroy();
    if (!gameWindow()) app.quit();
  });
  win.loadFile(APP_INDEX).catch((err) => crashLog.write('main', 'loadFile failed: ' + (err && err.message || err)));
}

/* Resolves once the game has booted, its loading screen is done and it has drawn its first real
 * frame (GTP.game.frames does not count loading-screen frames), or after BOOT_TIMEOUT_MS. Waiting
 * for that frame matters: the first title frame compiles the scene's shaders and can take seconds
 * on slow GPUs, and the page cannot answer (or paint) until it is done, so showing the window
 * earlier would show a dark, frozen window while the splash, its own process, keeps animating.
 * onProgress({booted, fraction, label}) is called on every poll for the splash. */
const GAME_STATUS = '(() => { const g = window.GTP && GTP.game; if (!g) return null; const L = g.loading || {};' +
  ' return { booted: !!g.booted, loading: !!L.active, fraction: +L.fraction || 0, label: String(L.label || ""), frames: g.frames | 0, state: g.state }; })()';

function waitForGame(wc, onProgress) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const poll = () => {
      if (wc.isDestroyed()) return resolve(false);
      wc.executeJavaScript(GAME_STATUS, true)
        .then((st) => {
          if (st && st.booted && !st.loading && st.frames >= 1) return resolve(true);
          if (Date.now() - t0 > BOOT_TIMEOUT_MS) {
            crashLog.write('main', 'the game was not ready within ' + BOOT_TIMEOUT_MS / 1000 + ' s (' + JSON.stringify(st) + '); showing the window anyway');
            return resolve(false);
          }
          onProgress(st ? { booted: st.booted, fraction: st.booted ? st.fraction : 0, label: st.booted ? st.label : '' } : { booted: false, fraction: 0, label: '' });
          setTimeout(poll, BOOT_POLL_MS);
        })
        .catch(() => resolve(false));
    };
    poll();
  });
}

/* Hand the game's loading progress to the splash page (window.gtpSplash in splash/splash.html). */
function splashProgress(splash, p) {
  if (!splash || splash.isDestroyed()) return;
  splash.webContents.executeJavaScript('window.gtpSplash && window.gtpSplash(' + JSON.stringify(p) + ')', true).catch(() => {});
}

/* MODS
 * The mods folder lives in the app's user-data directory, so it survives updates and needs no
 * rebuild:
 *   macOS    ~/Library/Application Support/Grand Theft Pundit/mods
 *   Windows  %APPDATA%\Grand Theft Pundit\mods
 *   Linux    ~/.config/Grand Theft Pundit/mods
 * On every page load:
 *   1. every image in the folder (png, jpg, jpeg, webp, gif; up to MOD_IMAGE_MAX bytes each) is
 *      read and exposed to the page as window.GTP_MODS.images['file-name.png'] = 'data:...';
 *      data URLs work everywhere in the page, WebGL textures included
 *   2. every *.css file is inserted, in file-name order
 *   3. every *.js file runs in the page, in file-name order, each in its own try/catch; errors are
 *      collected in window.GTP_MODS.errors and logged to the console
 * window.GTP_MODS.dir holds the folder path. Mods run after the game's own scripts, so they can
 * use or override anything on window.GTP. The folder is created with a README on first start. */
const MOD_IMAGE_MAX = 8 * 1024 * 1024;
const MOD_IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const MODS_README = [
  PRODUCT + ' mods folder',
  '',
  'Files here are loaded into the game every time it starts, in file-name order:',
  '  *.js   scripts that run after the game has loaded (window.GTP is the whole game)',
  '  *.css  style sheets for the page',
  '  images (png, jpg, webp, gif, up to 8 MB each) become data URLs in',
  '         window.GTP_MODS.images["your-file.png"] for your scripts to use',
  '',
  'Script errors are collected in window.GTP_MODS.errors and shown in the developer console',
  '(press Ctrl+Shift+I, or Cmd+Option+I on a Mac).',
  'Delete or rename a file (for example to .js.off) to turn it off. Restart the game after changes.',
  ''
].join('\n');

function modsDir() {
  return path.join(app.getPath('userData'), 'mods');
}

function ensureModsDir() {
  const dir = modsDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const readme = path.join(dir, 'README.txt');
    if (!fs.existsSync(readme)) fs.writeFileSync(readme, MODS_README);
  } catch (err) {
    console.error('mods: could not create ' + dir + ': ' + err.message);
  }
  return dir;
}

function listMods(dir) {
  try {
    return fs.readdirSync(dir).filter((name) => !name.startsWith('.')).sort((a, b) => a.localeCompare(b));
  } catch (_err) {
    return [];
  }
}

async function loadMods(wc) {
  const dir = ensureModsDir();
  const names = listMods(dir);
  const images = {};
  for (const name of names) {
    const type = MOD_IMAGE_TYPES[path.extname(name).toLowerCase()];
    if (!type) continue;
    try {
      const file = path.join(dir, name);
      const size = fs.statSync(file).size;
      if (size > MOD_IMAGE_MAX) { console.warn('mods: skipped ' + name + ' (larger than 8 MB)'); continue; }
      images[name] = 'data:' + type + ';base64,' + fs.readFileSync(file).toString('base64');
    } catch (err) {
      console.warn('mods: could not read ' + name + ': ' + err.message);
    }
  }
  const setup = 'window.GTP_MODS = { dir: ' + JSON.stringify(dir) + ', images: ' + JSON.stringify(images) + ', errors: [], loaded: [] };';
  try {
    await wc.executeJavaScript(setup, true);
  } catch (err) {
    console.error('mods: setup failed: ' + err.message);
    return;
  }
  for (const name of names) {
    const ext = path.extname(name).toLowerCase();
    if (ext !== '.js' && ext !== '.css') continue;
    let source;
    try {
      source = fs.readFileSync(path.join(dir, name), 'utf8');
    } catch (err) {
      console.warn('mods: could not read ' + name + ': ' + err.message);
      continue;
    }
    if (ext === '.css') {
      try { await wc.insertCSS(source); } catch (err) { console.warn('mods: ' + name + ': ' + err.message); }
      continue;
    }
    const wrapped = '(function(){try{' + source + '\n;window.GTP_MODS.loaded.push(' + JSON.stringify(name) + ');}catch(e){' +
      'window.GTP_MODS.errors.push({file:' + JSON.stringify(name) + ',message:String(e&&e.message||e)});' +
      'console.error("mod " + ' + JSON.stringify(name) + ' + ": ", e);}})();';
    try {
      await wc.executeJavaScript(wrapped, true);
    } catch (err) {
      console.warn('mods: ' + name + ' did not run: ' + err.message);
    }
  }
}

function openModsFolder() {
  shell.openPath(ensureModsDir()).catch(() => {});
}

function openCrashLog() {
  const file = crashLog.logFile();
  try {
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '');
    }
  } catch (_err) { /* openPath reports below */ }
  shell.openPath(file).then((err) => {
    // no app registered for .log files: show it in the file manager instead
    if (err) shell.showItemInFolder(file);
  }).catch(() => shell.showItemInFolder(file));
}

function isLocal(url) {
  return /^(file|about|devtools):/i.test(url);
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
}

function toggleFullScreen() {
  const win = gameWindow();
  if (win) win.setFullScreen(!win.isFullScreen());
}

function toggleDevTools() {
  const win = gameWindow();
  if (win) win.webContents.toggleDevTools();
}

function openReleasePage() {
  const url = updater.releasesPage(app.getVersion());
  if (url) openExternal(url);
}

/* Windows and Linux: About as a dialog (macOS has the native panel through role 'about'). */
function showAbout() {
  const win = gameWindow();
  const opts = {
    type: 'none',
    icon: nativeImage.createFromPath(ICON),
    title: 'About ' + PRODUCT,
    message: PRODUCT + ' ' + app.getVersion(),
    detail: 'A parody. No real pundits were harmed.\n\n' +
      'Electron ' + process.versions.electron + ', Chromium ' + process.versions.chrome + '\n' +
      'Updates: ' + ({ install: 'automatic', notify: 'you are told when a new version is out', off: 'off' }[updater.mode()] || 'off') + '\n' +
      'Data folder: ' + app.getPath('userData'),
    buttons: ['OK']
  };
  if (win) dialog.showMessageBox(win, opts); else dialog.showMessageBox(opts);
}

function installMenu() {
  // Accelerators here are labels only (registerAccelerator: false); before-input-event in
  // createWindow handles the keys so a hidden menu never swallows game input.
  const accel = (a) => ({ accelerator: a, registerAccelerator: false });
  const helpItems = [
    { label: 'Check for Updates...', click: () => updater.checkNow() },
    { label: 'Release Notes', click: openReleasePage },
    { type: 'separator' },
    { label: 'Open Mods Folder', ...accel('CmdOrCtrl+Shift+M'), click: openModsFolder },
    { label: 'Open Crash Log', click: openCrashLog },
    { label: 'Toggle Developer Tools', ...accel(IS_MAC ? 'Alt+Cmd+I' : 'Ctrl+Shift+I'), click: toggleDevTools }
  ];
  if (!IS_MAC) {
    // Windows/Linux: the bar stays hidden (autoHideMenuBar) until Alt is pressed
    const template = [
      {
        label: 'Game',
        submenu: [
          { label: 'Toggle Full Screen', ...accel('F11'), click: toggleFullScreen },
          { label: 'Open Mods Folder', ...accel('Ctrl+Shift+M'), click: openModsFolder },
          { type: 'separator' },
          { label: 'Quit', click: () => app.quit() }
        ]
      },
      {
        label: 'Help',
        submenu: [...helpItems, { type: 'separator' }, { label: 'About ' + PRODUCT, click: showAbout }]
      }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    return;
  }
  // macOS needs an application menu for Cmd+Q, Cmd+H and friends to behave; keep it small
  const template = [
    {
      label: PRODUCT,
      submenu: [
        { role: 'about', label: 'About ' + PRODUCT },
        { label: 'Check for Updates...', click: () => updater.checkNow() },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: 'Ctrl+Cmd+F', click: toggleFullScreen },
        { label: 'Open Mods Folder', ...accel('Cmd+Shift+M'), click: openModsFolder },
        { type: 'separator' },
        { role: 'hide', label: 'Hide ' + PRODUCT },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit ' + PRODUCT }
      ]
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    { role: 'help', submenu: helpItems }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// quit on every platform once the last game window closes: a game, not a document app
app.on('window-all-closed', () => app.quit());
