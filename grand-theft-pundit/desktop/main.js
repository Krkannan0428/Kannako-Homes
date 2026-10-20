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

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (BrowserWindow.getAllWindows().length === 0) app.quit();
  });
  win.loadFile(APP_INDEX);
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
