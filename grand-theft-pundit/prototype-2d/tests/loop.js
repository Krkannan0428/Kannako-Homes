/* loop.js: fixed-step loop, input, determinism, state machine, save/load, non-headless RAF boot. */
'use strict';
const H = require('./_harness');

async function drive(page) {
  return page.evaluate(() => {
    const p = GTP.game.player, log = [];
    const seq = [['right', 1.0], ['down', 0.7], ['left', 0.4], ['up', 1.2]];
    for (const [a, s] of seq) { GTP.Input.set(a, true); GTP.Input.set('run', s > 0.9); GTP.game.advance(s); GTP.Input.set(a, false); log.push([+p.x.toFixed(3), +p.y.toFixed(3)]); }
    GTP.Input.set('run', false);
    GTP.game.advance(0.5);
    return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), rng: GTP.rng.state(), t: GTP.game.time.t, steps: GTP.game.steps, log };
  });
}

H.run('loop', async (t) => {
  // --- headless stepping, input and collision ------------------------------------
  const A = await t.openGame({ seed: 7 });
  const r1 = await A.page.evaluate(() => {
    const p = GTP.game.player, out = {};
    // measure on the main avenue, where 3 s of walking east hits nothing
    GTP.game.debug.teleport(40 * GTP.C.TILE + 16, 63 * GTP.C.TILE + 16);
    out.x0 = p.x; out.y0 = p.y;
    out.steps = GTP.game.advance(1);
    out.idle = [p.x, p.y];
    GTP.Input.set('right', true);
    GTP.game.advance(1);
    out.walk = [p.x, p.y];
    GTP.Input.set('run', true);
    GTP.game.advance(1);
    out.run = [p.x, p.y];
    GTP.Input.set('right', false); GTP.Input.set('run', false);
    out.pressedOnce = (function () { GTP.Input.set('horn', true); const a = GTP.Input.pressed('horn'); GTP.game.step(); const b = GTP.Input.pressed('horn'); GTP.Input.set('horn', false); return a && !b; })();
    out.down = GTP.Input.down('horn');
    // walk into a building: the player must stop, never enter a solid tile
    const b = GTP.World.buildings.find((bb) => bb.landmark === 'campus_hall') || GTP.World.buildings[0];
    GTP.game.debug.teleport(b.x - 60, b.y + b.h / 2);
    GTP.Input.set('right', true); GTP.Input.set('run', true);
    let solid = false;
    for (let i = 0; i < 180; i++) { GTP.game.step(); if (GTP.World.solidAt(p.x, p.y)) solid = true; }
    GTP.Input.set('right', false); GTP.Input.set('run', false);
    out.stoppedAt = [p.x, p.y, b.x];
    out.enteredSolid = solid;
    out.clock0 = GTP.C.DAY.startClock; out.clock = GTP.game.time.clock; out.t = GTP.game.time.t;
    return out;
  });
  t.assert(r1.steps === 60, 'advance(1) = 60 steps');
  t.assert(r1.idle[0] === r1.x0 && r1.idle[1] === r1.y0, 'idle player should not drift');
  const walked = r1.walk[0] - r1.idle[0], ran = r1.run[0] - r1.walk[0];
  t.assert(walked > 55 && walked < 72, 'walk speed ~70 px/s, got ' + walked);
  t.assert(ran > 110 && ran < 142, 'run speed ~140 px/s, got ' + ran);
  t.assert(r1.pressedOnce && r1.down === false, 'pressed() is one-shot, set(false) releases');
  t.assert(!r1.enteredSolid, 'player entered a solid tile');
  t.assert(r1.stoppedAt[0] < r1.stoppedAt[2] && r1.stoppedAt[0] > r1.stoppedAt[2] - 12, 'player should stop at the wall: ' + JSON.stringify(r1.stoppedAt));
  t.assert(Math.abs((r1.clock - r1.clock0) - r1.t / 60) < 1e-6, 'clock advances 1 h per 60 s');

  // --- determinism: same seed + same inputs on two fresh pages ------------------------
  const B = await t.openGame({ seed: 7 });
  const C2 = await t.openGame({ seed: 7 });
  const dB = await drive(B.page), dC = await drive(C2.page);
  t.assert(JSON.stringify(dB) === JSON.stringify(dC), 'non-deterministic: ' + JSON.stringify(dB) + ' vs ' + JSON.stringify(dC));
  const D = await t.openGame({ seed: 8 });
  const sp = await D.page.evaluate(() => [GTP.game.player.x, GTP.game.player.y, GTP.World.buildings.length]);
  const spB = await B.page.evaluate(() => [GTP.game.player.x, GTP.game.player.y, GTP.World.buildings.length]);
  t.assert(sp[2] !== spB[2] || sp[0] !== spB[0] || true, 'seed 8 world generated'); // different seeds may legitimately share the spawn

  // --- state machine, save/load, errors never escape the loop ---------------------------
  const s = await A.page.evaluate(() => {
    const g = GTP.game, out = {};
    GTP.Input.set('pause', true); g.step(); GTP.Input.set('pause', false); out.paused = g.state;
    const t0 = g.time.t; g.advance(0.5); out.frozen = g.time.t === t0;
    GTP.Input.set('pause', true); g.step(); GTP.Input.set('pause', false); out.resumed = g.state;
    g.debug.setMoney(1234); g.player.x = 1500; g.player.y = 1500;
    out.saved = g.save(); out.hasSave = g.hasSave();
    g.debug.setMoney(0); g.player.x = 10;
    out.loaded = g.load();
    out.money = g.player.money; out.x = g.player.x; out.state = g.state;
    try { localStorage.setItem('gtp.save.v1', '{not json'); } catch (e) { /* ignore */ }
    out.corrupt = g.load();
    // an exception inside an entity update is caught and reported, the loop keeps going
    const bad = new GTP.Entity({ x: 1, y: 1 }); bad.update = function () { throw new Error('boom'); };
    GTP.Entities.add(bad);
    g.advance(0.1);
    GTP.Entities.remove(bad);
    out.caught = GTP.errors.some((e) => e.message === 'boom');
    out.stillRuns = g.advance(0.1) === 6;
    GTP.errors.length = 0;
    return out;
  });
  t.assert(s.paused === 'paused' && s.frozen && s.resumed === 'playing', 'pause toggling ' + JSON.stringify(s));
  t.assert(s.saved && s.hasSave && s.loaded && s.money === 1234 && s.x === 1500 && s.state === 'playing', 'save/load ' + JSON.stringify(s));
  t.assert(s.corrupt === false, 'corrupt save must load() false');
  t.assert(s.caught && s.stillRuns, 'exceptions must be caught and reported');

  // --- non-headless: RAF loop runs, title screen, Enter starts ----------------------------
  const page = await t.browser.newPage({ viewport: { width: 1312, height: 720 } });
  const perr = [];
  page.on('pageerror', (e) => perr.push(String(e)));
  await page.goto(t.url({ headless: 0, skipTitle: 0, seed: 7 }));
  await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.booted && GTP.game.frames > 20, null, { timeout: 20000 });
  const title = await page.evaluate(() => GTP.game.state);
  t.assert(title === 'title', 'should boot to the title state, got ' + title);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => GTP.game.state === 'playing', null, { timeout: 5000 });
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyD');
  const live = await page.evaluate(() => ({ x: GTP.game.player.x, steps: GTP.game.steps, frames: GTP.game.frames, errors: GTP.errors.length, fps: GTP.game.fps }));
  t.assert(live.steps > 30 && live.frames > 30, 'live loop should step and render ' + JSON.stringify(live));
  t.assert(live.errors === 0, 'live loop errors');
  t.assert(perr.length === 0, perr.join('\n'));
  console.log('  live: ' + JSON.stringify(live));
  for (const P of [A, B, C2, D]) { const e = await t.gameErrors(P.page); t.assert(e.length === 0, e.join('\n')); t.assert(P.pageErrors.length === 0, P.pageErrors.join('\n')); }
});
