/* window-state.js: remember the game window's size, position, maximized and fullscreen state.
 *
 * Saved as window-state.json in the user-data folder whenever the window is moved, resized,
 * maximized or switched in or out of full screen (debounced), and once more on close. On the next
 * start the saved bounds are used only if they still overlap a connected display by a usable
 * amount, so unplugging a monitor never strands the window off-screen.
 */
'use strict';
const { app, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const SAVE_DELAY_MS = 400;
const MIN_VISIBLE = 120; // px of the window that must be on some display

function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function visibleOnSomeDisplay(b) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    const w = Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x);
    const h = Math.min(b.y + b.height, a.y + a.height) - Math.max(b.y, a.y);
    return w >= MIN_VISIBLE && h >= MIN_VISIBLE;
  });
}

/* load(defaults) -> {width, height, x?, y?, maximized, fullscreen} for the BrowserWindow options. */
function load(defaults) {
  const out = { width: defaults.width, height: defaults.height, maximized: false, fullscreen: false };
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch (_err) {
    return out;
  }
  if (!saved || typeof saved !== 'object') return out;
  const num = (v) => typeof v === 'number' && isFinite(v);
  if (num(saved.width) && num(saved.height)) {
    out.width = Math.max(defaults.minWidth || 0, Math.round(saved.width));
    out.height = Math.max(defaults.minHeight || 0, Math.round(saved.height));
  }
  if (num(saved.x) && num(saved.y) && visibleOnSomeDisplay({ x: saved.x, y: saved.y, width: out.width, height: out.height })) {
    out.x = Math.round(saved.x);
    out.y = Math.round(saved.y);
  }
  out.maximized = saved.maximized === true;
  out.fullscreen = saved.fullscreen === true;
  return out;
}

/* track(win) keeps window-state.json current for this window. */
function track(win) {
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = null;
    if (win.isDestroyed()) return;
    // normal bounds are the restore size, also while maximized, minimized or in full screen
    const b = win.getNormalBounds();
    const state = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized(), fullscreen: win.isFullScreen() };
    try {
      fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2));
    } catch (_err) { /* best effort */ }
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(ev, later);
  win.on('close', save);
}

module.exports = { load, track, stateFile };
