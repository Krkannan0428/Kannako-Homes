#!/usr/bin/env node
/* smoke.js: launch the packaged desktop game and check it reaches a rendered title screen with no errors.
 *
 *   node test/smoke.js <path to the app executable> [--out <dir>] [--timeout <seconds>]
 *
 *   Linux CI:  xvfb-run -a -s "-screen 0 1280x800x24" node test/smoke.js squashfs-root/grand-theft-pundit
 *   local:     npm run pack && xvfb-run -a node test/smoke.js dist/linux-unpacked/grand-theft-pundit
 *
 * No dependencies: it talks to the app over the Chrome DevTools Protocol (--remote-debugging-port)
 * with Node's built-in fetch and WebSocket (Node 22+). What it checks:
 *   1. the app starts and exposes the game page (app/index.html inside the asar)
 *   2. the game boots (GTP.game.booted), reaches state 'title' and the loading screen finishes
 *   3. the splash window has closed and the game window is visible
 *   4. the GL canvas and the HUD canvas show a real picture (many distinct colours, not one flat fill)
 *   5. no page exceptions, no console errors, GTP.errors is empty, and the crash log in the test
 *      user-data folder holds nothing but its "start" line
 *   6. a test mod dropped into the mods folder ran (GTP_MODS.loaded), so the mods loader works
 *   7. the window state is remembered: a second start with a saved size opens at that size, and
 *      quitting writes the state back; in that second start a mod with a syntax error lands in
 *      GTP_MODS.errors (QAC-43) while the good mod still runs
 *   8. a new game starts the way a player starts one: Enter on NEW GAME (and on a slot picker if
 *      one comes up), the loading screen finishes, the opening cutscene plays and is skipped by
 *      holding Enter as its on-screen pill says, dialogue is answered with Enter, and the first
 *      mission objective appears on the HUD. Steps 5's error checks run after this, so errors
 *      during the new game fail the test too. (--no-new-game skips this step.)
 *   9. the window stays on the game: a script navigating to another file:// page and a file
 *      dropped on the window both leave app/index.html in place with the game still running (QAC-29)
 * The app is quit the way a player quits it (closing the window), so it runs its close handlers on
 * every platform; it falls back to SIGTERM/SIGKILL. Runs on Linux (under xvfb), macOS
 * (".../Grand Theft Pundit.app/Contents/MacOS/Grand Theft Pundit") and Windows
 * ("...\\win-unpacked\\Grand Theft Pundit.exe").
 * It writes smoke-title.png, smoke-cutscene.png, smoke-objective.png and smoke-crash.log into
 * --out (default: test/out).
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');

const args = process.argv.slice(2);
const exe = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out' && args[args.indexOf(a) - 1] !== '--timeout');
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const OUT = path.resolve(opt('--out', path.join(__dirname, 'out')));
const TIMEOUT_S = parseInt(opt('--timeout', '180'), 10);
const NEW_GAME = !args.includes('--no-new-game');
const NEW_GAME_TIMEOUT_S = 300;

if (!exe || !fs.existsSync(exe)) {
  console.error('usage: node test/smoke.js <path to the app executable> [--out dir] [--timeout s]' + (exe ? '\nnot found: ' + exe : ''));
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failures.push(msg); };

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

/* a minimal CDP client over one target's WebSocket */
function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = [];
    ws.onopen = () => resolve({
      send(method, params) {
        return new Promise((res, rej) => {
          const n = ++id;
          pending.set(n, { res, rej });
          ws.send(JSON.stringify({ id: n, method, params: params || {} }));
        });
      },
      on(fn) { listeners.push(fn); },
      close() { try { ws.close(); } catch (_e) { /* gone */ } }
    });
    ws.onerror = (e) => reject(new Error('websocket error: ' + (e && e.message || e)));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result);
      } else if (msg.method) {
        for (const fn of listeners) fn(msg);
      }
    };
  });
}

async function targets(port) {
  const res = await fetch('http://127.0.0.1:' + port + '/json/list');
  return res.json();
}

function launch(userData, port) {
  const appArgs = [
    '--remote-debugging-port=' + port,
    // software WebGL under xvfb, as in the game's own Playwright tests
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'
  ];
  // the setuid chrome-sandbox inside an extracted AppImage is not root-owned, and CI runners restrict
  // unprivileged user namespaces; the smoke test is about the game, not the sandbox
  if (process.platform === 'linux') appArgs.push('--no-sandbox');
  const child = spawn(exe, appArgs, {
    env: Object.assign({}, process.env, { GTP_USER_DATA_DIR: userData, GTP_UPDATES: 'off', ELECTRON_ENABLE_LOGGING: '1' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const run = { child, output: '', exited: null };
  child.stdout.on('data', (d) => { run.output += d; });
  child.stderr.on('data', (d) => { run.output += d; });
  child.on('exit', (code, signal) => { run.exited = { code, signal }; });
  return run;
}

/* Quit like a player: close the game window (main.js quits when it closes), so close handlers such
 * as window-state.js run on every platform; on Windows child.kill() is TerminateProcess, which runs
 * none. Falls back to SIGTERM and SIGKILL. */
async function stop(run, client) {
  if (run.exited) return;
  if (client) {
    client.send('Runtime.evaluate', { expression: 'window.close()' }).catch(() => {});
    for (let i = 0; i < 100 && !run.exited; i++) await sleep(100);
  }
  if (!run.exited) {
    run.child.kill('SIGTERM');
    for (let i = 0; i < 50 && !run.exited; i++) await sleep(100);
  }
  if (!run.exited) run.child.kill('SIGKILL');
  for (let i = 0; i < 20 && !run.exited; i++) await sleep(100);
}

async function waitForGamePage(port, run, deadline) {
  while (Date.now() < deadline && !run.exited) {
    try {
      const page = (await targets(port)).find((t) => t.type === 'page' && /app\/index\.html/.test(t.url));
      if (page) return page;
    } catch (_e) { /* not listening yet */ }
    await sleep(250);
  }
  return null;
}

/* a real key press through the renderer's input pipeline, the way the keyboard delivers it */
const KEYS = { Enter: { code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 } };
async function keyDown(client, name) { await client.send('Input.dispatchKeyEvent', Object.assign({ type: 'rawKeyDown' }, KEYS[name])); }
async function keyUp(client, name) { await client.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, KEYS[name])); }
async function press(client, name) { await keyDown(client, name); await sleep(120); await keyUp(client, name); }

async function screenshot(client, name) {
  const shot = await client.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log('  screenshot: ' + file);
}

/* 8. NEW GAME -> loading -> opening cutscene -> first objective, with real key presses */
async function playNewGame(client) {
  const evaluate = (expr) => evaluateIn(client, expr);
  const deadline = Date.now() + NEW_GAME_TIMEOUT_S * 1000;
  const title = await evaluate('(() => { const t = GTP.UI && GTP.UI.state && GTP.UI.state.title; return t ? { ids: (t.items || []).map((i) => i.id), labels: (t.items || []).map((i) => i.label || i.id), sel: t.sel, page: t.page } : null; })()');
  check(title && title.ids[0] === 'play' && title.sel === 0, 'the title menu highlights NEW GAME first (' + JSON.stringify(title && title.labels) + ')');

  const t0 = Date.now();
  await press(client, 'Enter');
  // a slot picker or a confirm may come up: Enter again takes the highlighted (empty) slot
  for (let i = 0; i < 6; i++) {
    await sleep(700);
    const st = await evaluate('GTP.game.state');
    if (st !== 'title') break;
    await press(client, 'Enter');
  }
  let st = null;
  while (Date.now() < deadline) {
    st = await evaluate('({ state: GTP.game.state, loading: !!GTP.game.loading.active })').catch(() => null);
    if (st && st.state !== 'title' && !st.loading) break;
    await sleep(500);
  }
  check(st && st.state !== 'title' && !st.loading, 'Enter on NEW GAME starts a new game and its loading screen finishes (' + JSON.stringify(st) + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');

  const STATUS = `(() => {
    const Cs = GTP.Cutscenes, cs = Cs && Cs.hud ? Cs.hud() : { active: !!(Cs && Cs.active) };
    const ui = GTP.UI.state, M = GTP.Missions, h = M && M.hud ? M.hud() : {};
    const ph = ui.phone || ui.call || ui.phoneCall;
    return { state: GTP.game.state, cutscene: cs.active ? { title: cs.title || null, skip: cs.skip || 0, skippable: cs.skippable !== false } : null,
      talk: !!ui.dialogue || !!(h && h.dialogue), confirm: !!ui.confirm, phone: !!(ph && (ph.ringing || ph.incoming) && !ph.answered),
      mission: h && h.active ? { id: h.active, title: h.title, phase: h.phase, objective: h.objective || '' } : null };
  })()`;
  const cutscenes = [];
  let cutShot = false, objective = null, last = null;
  while (Date.now() < deadline) {
    last = await evaluate(STATUS).catch(() => null);
    if (!last) { await sleep(500); continue; }
    if (last.cutscene) {
      if (!cutscenes.includes(last.cutscene.title)) cutscenes.push(last.cutscene.title);
      if (!cutShot) { await sleep(1500); await screenshot(client, 'smoke-cutscene.png'); cutShot = true; }
      if (!last.cutscene.skippable) { await sleep(1000); continue; }
      // HOLD TO SKIP: keep Enter down until the cutscene ends (the hold is measured in game time)
      await keyDown(client, 'Enter');
      for (let i = 0; i < 60; i++) {
        await sleep(250);
        const c = await evaluate('!!(GTP.Cutscenes && GTP.Cutscenes.active)').catch(() => true);
        if (!c) break;
      }
      await keyUp(client, 'Enter');
      await sleep(400);
      continue;
    }
    if (last.mission && last.mission.phase === 'play' && last.mission.objective) { objective = last.mission; break; }
    if (last.talk || last.confirm || last.phone) { await press(client, 'Enter'); await sleep(600); continue; }
    await sleep(400);
  }
  check(cutscenes.length > 0, 'the opening cutscene played (' + JSON.stringify(cutscenes) + ')');
  check(!!objective, 'the first mission objective is on screen' + (objective ? ' (' + objective.id + ' "' + objective.title + '": ' + objective.objective + ')' : ' (last ' + JSON.stringify(last) + ')'));
  console.log('  new game to first objective: ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  if (objective) { await sleep(1500); await screenshot(client, 'smoke-objective.png'); }
}

async function evaluateIn(client, expr) {
  const r = await client.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('evaluate failed: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
  return r.result.value;
}

/* 9. a script navigation to another file:// page and a dropped file must both leave the game page in
 * place (main.js will-navigate). The "foreign" page sets a title the game never uses. */
async function checkNavigationLock(client, port, userData) {
  const foreign = path.join(userData, 'smoke-dropped.html');
  fs.writeFileSync(foreign, '<!doctype html><title>DROPPED</title><p>not the game</p>');
  const { pathToFileURL } = require('url');
  const where = async () => ({
    url: ((await targets(port)).find((t) => t.type === 'page' && !/splash\.html/.test(t.url)) || {}).url || null,
    page: await evaluateIn(client, '({ title: document.title, game: !!(window.GTP && GTP.game && GTP.game.booted) })').catch(() => null)
  });
  const onGame = (w) => !!(w.url && /app\/index\.html/.test(w.url) && w.page && w.page.game && w.page.title !== 'DROPPED');

  await evaluateIn(client, 'location.assign(' + JSON.stringify(pathToFileURL(foreign).href) + '), true').catch(() => null);
  await sleep(2000);
  const afterScript = await where();
  check(onGame(afterScript), 'a script cannot navigate the window away from the game (' + JSON.stringify(afterScript) + ')');

  // a real drag and drop of the file onto the middle of the window
  const box = await evaluateIn(client, '({ x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2) })').catch(() => ({ x: 400, y: 300 }));
  const data = { items: [], files: [foreign], dragOperationsMask: 1 };
  try {
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await client.send('Input.dispatchDragEvent', { type, x: box.x, y: box.y, data });
      await sleep(150);
    }
  } catch (err) {
    console.log('  note: Input.dispatchDragEvent failed: ' + err.message);
  }
  await sleep(2000);
  const afterDrop = await where();
  check(onGame(afterDrop), 'dropping a file on the window does not replace the game (' + JSON.stringify(afterDrop) + ')');
}

/* 7. a saved size is used on the next start, and the state is written back when the game quits.
 * (Electron does not implement CDP's Browser.setWindowBounds, so the size is seeded in the file.) */
async function checkWindowState(userData) {
  const WANT = { width: 1100, height: 680 };
  const file = path.join(userData, 'window-state.json');
  // "seeded" is not a field window-state.js writes, so its absence afterwards proves the app saved
  fs.writeFileSync(file, JSON.stringify({ x: 30, y: 20, width: WANT.width, height: WANT.height, maximized: false, fullscreen: false, seeded: true }));
  // a mod with a syntax error on line 2: it must be reported, and must not stop the next mod
  fs.writeFileSync(path.join(userData, 'mods', 'zz-bad-mod.js'), 'window.__gtpBadMod = 1;\n}{\n');
  const port = await freePort();
  const run = launch(userData, port);
  let client = null;
  try {
    const page = await waitForGamePage(port, run, Date.now() + 60000);
    if (!page) throw new Error('second launch: no game page');
    client = await cdp(page.webSocketDebuggerUrl);
    let size = null;
    for (let i = 0; i < 240; i++) {
      size = await evaluateIn(client, '({ w: window.outerWidth, h: window.outerHeight, x: window.screenX, y: window.screenY, booted: !!(window.GTP && GTP.game && GTP.game.booted), vis: document.visibilityState })').catch(() => null);
      if (size && size.booted && size.vis === 'visible') break;
      await sleep(250);
    }
    check(size && Math.abs(size.w - WANT.width) <= 2 && Math.abs(size.h - WANT.height) <= 40, 'the saved window size is used on the next start (' + JSON.stringify(size) + ')');
    let mods = null;
    for (let i = 0; i < 40; i++) {
      mods = await evaluateIn(client, '({ loaded: (window.GTP_MODS && GTP_MODS.loaded) || [], errors: (window.GTP_MODS && GTP_MODS.errors) || [], bad: window.__gtpBadMod || null })').catch(() => null);
      if (mods && mods.loaded.includes('zz-smoke-mod.js')) break;
      await sleep(250);
    }
    const badErr = mods && mods.errors.find((e) => e.file === 'zz-bad-mod.js');
    check(!!badErr && /SyntaxError/.test(badErr.message) && /line 2/.test(badErr.message) && mods.bad === null && mods.loaded.includes('zz-smoke-mod.js'),
      'a mod with a syntax error is reported in GTP_MODS.errors and the next mod still runs (' + JSON.stringify(mods) + ')');
  } finally {
    await stop(run, client);
    if (client) client.close();
  }
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_e) { /* checked below */ }
  check(saved && !saved.seeded && saved.width === WANT.width && saved.height === WANT.height, 'the window state is saved when the game quits (' + JSON.stringify(saved) + ')');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gtp-smoke-'));
  const modsDir = path.join(userData, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  fs.writeFileSync(path.join(modsDir, 'zz-smoke-mod.js'), 'window.__gtpSmokeMod = (window.GTP ? "with-gtp" : "no-gtp");\n');
  const port = await freePort();

  console.log('smoke: launching ' + exe + ' (user data ' + userData + ', CDP port ' + port + ')');
  const t0 = Date.now();
  const run = launch(userData, port);
  const deadline = t0 + TIMEOUT_S * 1000;
  let client = null;
  const pageErrors = [];
  try {
    // 1. the game page appears
    const page = await waitForGamePage(port, run, deadline);
    check(!!page, 'the game page is up' + (page ? ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)' : run.exited ? ' (app exited: ' + JSON.stringify(run.exited) + ')' : ''));
    if (!page) throw new Error('no game page');

    client = await cdp(page.webSocketDebuggerUrl);
    client.on((msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        pageErrors.push('exception: ' + (d.exception && d.exception.description || d.text));
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        pageErrors.push('console.error: ' + msg.params.args.map((a) => a.value != null ? a.value : a.description).join(' '));
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        pageErrors.push('log: ' + msg.params.entry.text + (msg.params.entry.url ? ' (' + msg.params.entry.url + ')' : ''));
      }
    });
    await client.send('Runtime.enable');
    await client.send('Log.enable');
    const evaluate = (expr) => evaluateIn(client, expr);

    // 2. booted, on the title, loading finished
    let st = null;
    while (Date.now() < deadline && !run.exited) {
      st = await evaluate('(() => { const g = window.GTP && GTP.game; return g ? { booted: !!g.booted, state: g.state, loading: !!(g.loading && g.loading.active), fraction: g.loading && g.loading.fraction } : null; })()').catch(() => null);
      if (st && st.booted && st.state === 'title' && !st.loading) break;
      await sleep(500);
    }
    check(st && st.booted, 'the game booted');
    check(st && st.state === 'title', 'the game is on the title screen (state ' + (st && st.state) + ')');
    check(st && !st.loading, 'the loading screen finished');
    // 3. the splash hands over once the title has drawn its first frame (main.js waitForGame), and
    // the game window is the only page left
    let splashOpen = true;
    for (let i = 0; i < 120 && splashOpen; i++) {
      splashOpen = (await targets(port)).some((t) => t.type === 'page' && /splash\.html/.test(t.url));
      if (splashOpen) await sleep(500);
    }
    check(!splashOpen, 'the splash window has closed');
    // let a few frames of the attract camera run
    await sleep(1500);
    const visible = await evaluate('document.visibilityState');
    check(visible === 'visible', 'the game window is visible (' + visible + ')');

    // 4. a real picture on both canvases
    const pix = await evaluate(`(() => {
      function stats(cv, render) {
        if (!cv || !cv.width) return null;
        const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
        const ctx = off.getContext('2d');
        if (render) { try { GTP.game.render(); } catch (e) { /* the loop renders anyway */ } }
        ctx.drawImage(cv, 0, 0);
        const d = ctx.getImageData(0, 0, off.width, off.height).data;
        const set = new Set(); let lit = 0, n = 0;
        for (let i = 0; i < d.length; i += 16) { n++; if (d[i + 3] > 0) { lit++; set.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)); } }
        return { w: off.width, h: off.height, colors: set.size, lit: +(lit / n).toFixed(3) };
      }
      return { gl: stats(document.getElementById('gl'), true), hud: stats(document.getElementById('hud'), false) };
    })()`);
    console.log('  canvas stats: ' + JSON.stringify(pix));
    check(pix.gl && pix.gl.colors >= 40, 'the 3D view renders a picture (' + (pix.gl && pix.gl.colors) + ' colours)');
    check(!pix.hud || pix.hud.colors >= 8, 'the title menu is drawn on the HUD (' + (pix.hud && pix.hud.colors) + ' colours)');

    await screenshot(client, 'smoke-title.png');

    // 6. the mods loader ran our test mod after the game scripts
    const mods = await evaluate('({ loaded: (window.GTP_MODS && GTP_MODS.loaded) || [], errors: (window.GTP_MODS && GTP_MODS.errors) || [], flag: window.__gtpSmokeMod || null })');
    check(mods.loaded.includes('zz-smoke-mod.js') && mods.flag === 'with-gtp' && mods.errors.length === 0, 'the mods folder loads scripts after the game (' + JSON.stringify(mods) + ')');

    // 8. a new game up to its first objective
    if (NEW_GAME) await playNewGame(client);

    // 9. the window stays on the game
    await checkNavigationLock(client, port, userData);

    // 5. no errors anywhere (title, new game, navigation attempts)
    const gtpErrors = await evaluate('(window.GTP && GTP.errors || []).map((e) => (e.where || "") + ": " + (e.message || e))');
    check(gtpErrors.length === 0, 'GTP.errors is empty' + (gtpErrors.length ? ': ' + gtpErrors.join(' | ') : ''));
    check(pageErrors.length === 0, 'no page exceptions or console errors' + (pageErrors.length ? ': ' + pageErrors.join(' | ') : ''));
  } catch (err) {
    failures.push(String(err && err.message || err));
    console.log('  FAIL ' + (err && err.stack || err));
  } finally {
    await stop(run, client);
    if (client) client.close();
  }

  const logPath = path.join(userData, 'logs', 'crash.log');
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
  fs.writeFileSync(path.join(OUT, 'smoke-crash.log'), log);
  const problems = log.split('\n').filter((l) => /^\S+ \[/.test(l) && !/ \[start\] /.test(l));
  check(/ \[start\] /.test(log), 'the crash log was created with a start line');
  check(problems.length === 0, 'the crash log has no errors' + (problems.length ? ':\n    ' + problems.join('\n    ') : ''));

  if (!failures.length) {
    try {
      await checkWindowState(userData);
    } catch (err) {
      failures.push(String(err && err.message || err));
      console.log('  FAIL ' + (err && err.stack || err));
    }
  }

  if (failures.length) {
    console.log('\n--- app output (last 60 lines) ---\n' + run.output.split('\n').slice(-60).join('\n'));
    console.log('\nSMOKE FAILED: ' + failures.length + ' problem(s)');
    process.exit(1);
  }
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch (_e) { /* Windows may still hold a file for a moment */ }
  console.log('\nSMOKE PASSED in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
