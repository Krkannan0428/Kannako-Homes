/* crash-log.js: a plain-text log of everything that went wrong, in the user-data folder.
 *
 *   macOS    ~/Library/Application Support/Grand Theft Pundit/logs/crash.log
 *   Windows  %APPDATA%\Grand Theft Pundit\logs\crash.log
 *   Linux    ~/.config/Grand Theft Pundit/logs/crash.log
 *
 * What lands in it: uncaught exceptions and unhandled rejections in the main process, a renderer or
 * GPU process that died, uncaught errors and console.error lines from the game page, failed update
 * checks, and one "started" line per launch (version, platform) so a report always has context.
 * Native minidumps from Electron's crash reporter go to the Crashpad folder next to it (never
 * uploaded). The log is capped: past MAX_BYTES it is renamed to crash.old.log and a new one starts.
 */
'use strict';
const { app, crashReporter } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MAX_BYTES = 1024 * 1024;

let file = null;

function logDir() {
  return path.join(app.getPath('userData'), 'logs');
}

function logFile() {
  return file || path.join(logDir(), 'crash.log');
}

function rotate() {
  try {
    if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, path.join(logDir(), 'crash.old.log'));
  } catch (_err) { /* no file yet */ }
}

function write(kind, message) {
  if (!file) return;
  const line = new Date().toISOString() + ' [' + kind + '] ' + String(message).replace(/\r?\n/g, '\n    ') + '\n';
  try {
    fs.appendFileSync(file, line);
  } catch (_err) { /* a read-only disk must never take the game down */ }
}

function errText(err) {
  return err && err.stack ? err.stack : String(err);
}

/* init() runs once, after app 'ready' paths are usable (app.getPath works before ready). */
function init() {
  try {
    fs.mkdirSync(logDir(), { recursive: true });
  } catch (_err) { /* write() stays silent */ }
  file = path.join(logDir(), 'crash.log');
  rotate();
  try {
    crashReporter.start({ uploadToServer: false, compress: true });
  } catch (_err) { /* not fatal */ }
  write('start', app.getName() + ' ' + app.getVersion() + ' on ' + process.platform + ' ' + os.release() + ' ' + process.arch +
    ' (electron ' + process.versions.electron + ', packaged ' + app.isPackaged + ')');

  process.on('uncaughtException', (err) => write('main', errText(err)));
  process.on('unhandledRejection', (reason) => write('main', 'unhandled rejection: ' + errText(reason)));
  app.on('child-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || details.reason === 'killed') return;
    write('process', details.type + ' process gone: ' + details.reason + ' (exit code ' + details.exitCode + ')');
  });
}

/* watch(webContents) records the game page's own failures. */
function watch(wc) {
  wc.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    write('renderer', 'game process gone: ' + details.reason + ' (exit code ' + details.exitCode + ')');
  });
  wc.on('unresponsive', () => write('renderer', 'the game page stopped responding'));
  wc.on('preload-error', (_event, p, err) => write('renderer', 'preload ' + p + ': ' + errText(err)));
  wc.on('did-fail-load', (_event, code, desc, url, isMainFrame) => {
    if (isMainFrame) write('renderer', 'failed to load ' + url + ': ' + desc + ' (' + code + ')');
  });
  // Electron 35+ passes a single event object with level 'error' | 'warning' | 'info' | 'debug'
  wc.on('console-message', (event) => {
    if (event.level !== 'error') return;
    const where = event.sourceId ? ' (' + path.basename(event.sourceId) + ':' + event.lineNumber + ')' : '';
    write('page', event.message + where);
  });
}

module.exports = { init, watch, write, logFile, logDir };
