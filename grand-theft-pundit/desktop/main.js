/* Grand Theft Pundit: Electron main process.
 *
 * One BrowserWindow that loads app/index.html (copied from the repository by sync-game.js).
 * The game itself is plain browser code and needs nothing from Node, so the renderer runs with
 * the default hardening (context isolation on, node integration off, sandbox on, web security on).
 *
 * Window-level behaviour:
 *   - 1280x800, minimum 960x600, dark background so there is no white flash at start
 *   - no default menu on Windows/Linux (auto-hidden menu bar); a small app menu on macOS
 *   - F11 and Cmd/Ctrl+F toggle full screen; Esc is left alone for the game
 *   - pointer lock and fullscreen permission requests are granted, everything else is denied
 *   - links that leave the app open in the system browser; new windows are never created
 *   - a single instance: launching the game twice focuses the running window
 *   - a mods folder (see MODS below): *.js and *.css files there are loaded into the game after
 *     every page load, and images there are handed to those scripts as data URLs
 */
'use strict';
const { app, BrowserWindow, Menu, shell, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

const PRODUCT = 'Grand Theft Pundit';
const BG = '#06070d'; // --bg in index.html
const APP_INDEX = path.join(__dirname, 'app', 'index.html');
const IS_MAC = process.platform === 'darwin';

app.name = PRODUCT;

// only one copy of the game at a time
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  app.whenReady().then(start);
}

function start() {
  nativeTheme.themeSource = 'dark';
  if (IS_MAC) {
    app.setAboutPanelOptions({ applicationName: PRODUCT, applicationVersion: app.getVersion(), copyright: 'A parody. No real pundits were harmed.' });
  }
  installMenu();
  if (!fs.existsSync(APP_INDEX)) {
    dialog.showErrorBox(PRODUCT + ': game files missing',
      'Could not find ' + APP_INDEX + '\n\nRun `npm run sync` (or any `npm run dist:*` script) inside desktop/ first; it copies index.html, js/ and vendor/ into desktop/app/.');
    app.quit();
    return;
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    title: PRODUCT,
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: BG,
    show: false,
    autoHideMenuBar: true,
    fullscreenable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  const wc = win.webContents;

  // pointer lock (mouse look) and fullscreen are the only permissions the game may ask for
  const allowed = new Set(['pointerLock', 'fullscreen', 'keyboardLock']);
  wc.session.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  wc.session.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  // F11 and Cmd/Ctrl+F toggle fullscreen. Esc is deliberately not handled here so the game
  // keeps it (pause menu, exiting pointer lock) and nothing else is intercepted.
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    const mod = IS_MAC ? input.meta : input.control;
    const isF = input.key === 'f' || input.key === 'F';
    if (input.key === 'F11' || (mod && isF && !input.alt && !input.shift)) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
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
    dialog.showErrorBox(PRODUCT + ' stopped', 'The game process ended unexpectedly (' + details.reason + '). Please start it again.');
    app.quit();
  });

  wc.on('did-finish-load', () => { loadMods(wc); });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (BrowserWindow.getAllWindows().length === 0) app.quit();
  });
  win.loadFile(APP_INDEX);
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
  '(View > Toggle Developer Tools is not in the menu; press Ctrl+Shift+I or Cmd+Option+I).',
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

function isLocal(url) {
  return /^(file|about|devtools):/i.test(url);
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
}

function toggleFullScreen() {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win) win.setFullScreen(!win.isFullScreen());
}

function installMenu() {
  if (!IS_MAC) {
    // Windows/Linux: no menu at all (F11 / Ctrl+F still work through before-input-event)
    Menu.setApplicationMenu(null);
    return;
  }
  // macOS needs an application menu for Cmd+Q, Cmd+H and friends to behave; keep it small
  const template = [
    {
      label: PRODUCT,
      submenu: [
        { role: 'about', label: 'About ' + PRODUCT },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: 'Ctrl+Cmd+F', click: toggleFullScreen },
        { label: 'Open Mods Folder', click: openModsFolder },
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
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// quit on every platform once the last window closes: a game, not a document app
app.on('window-all-closed', () => app.quit());
