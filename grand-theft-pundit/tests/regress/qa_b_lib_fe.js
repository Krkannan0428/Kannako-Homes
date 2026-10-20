/* Shared helpers for the qa-b front-end regression tests (tests/regress/qa_b_fe_*.js).
 * bootTitle(t, params, opts) opens a NON-headless page on the title (the real front end, loading screen included),
 * waits for the attract camera, stops the rAF loop and installs window.T_ step helpers:
 *   T_.press(action)   one virtual press + release through GTP.Input.set, one step each
 *   T_.sel(id)         select a title menu item by id
 *   T_.finishLoading() finish a live New Game / Load chunk prebuild synchronously
 *   T_.quietRoad()     teleport the player to a road at least 60 m from every landmark (no mission markers)
 *   T_.carUp(type)     spawn a vehicle beside the player and get in (Enter action)
 *   T_.hitById(id)     the centre / rect of a clickable UI hit rect recorded by the last draw
 * PAD_INIT is an addInitScript body that installs a fake standard gamepad (window.__padSet(index, on)).
 */
'use strict';
const H = require('../_harness');

async function bootTitle(t, params, opts) {
  opts = opts || {};
  const page = await t.browser.newPage({ viewport: opts.viewport || { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.stack || e)));
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(t.url(Object.assign({ headless: 0, skipTitle: 0, seed: 7, mute: 1 }, params || {})));
  await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.booted && GTP.game.state === 'title' && !GTP.game.loading.active && GTP.game.frames >= 2, null, { timeout: 240000 });
  await page.evaluate(() => {
    cancelAnimationFrame(GTP.game._raf); GTP.game._raf = 0;
    window.T_ = {
      press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
      sel(id) { const items = GTP.UI.state.title.items; GTP.UI.state.title.sel = Math.max(0, items.findIndex((i) => i.id === id)); },
      finishLoading() { if (GTP.game.loading.active) { GTP.Render.prebuild(GTP.game.player.x, GTP.game.player.z, 100); GTP.game._loadT = 0; GTP.game._endLoading(); } },
      quietRoad() {
        const W = GTP.World;
        for (let i = 0; i < 600; i++) { const q = W.randomRoadPoint(); if (W.landmarks.every((l) => Math.hypot(l.x - q.x, l.z - q.z) >= 60)) { GTP.game.debug.teleport(q.x, q.z); GTP.game.advance(0.3); return q; } }
        return null;
      },
      carUp(type) {
        const p = GTP.game.player; if (p.inVehicle) return p.inVehicle;
        const v = GTP.game.debug.spawnVehicle(p.x + 3, p.z, type || 'sedan'); const d = v.doorWorld(0);
        GTP.game.debug.teleport(d.x, d.z); GTP.game.advance(0.1); T_.press('enter'); GTP.game.advance(1.5);
        return p.inVehicle;
      },
      newGame() { T_.sel('play'); T_.press('confirm'); T_.finishLoading(); GTP.game.advance(0.3); },
      quitToTitle() { T_.press('pause'); GTP.UI.state.pause.sel = 8; T_.press('confirm'); GTP.UI.state.confirm.sel = 0; T_.press('confirm'); GTP.game.advance(0.1); GTP.game.render(); },
      hitById(id) { const h = GTP.UI.state.hit.find((q) => q.id === id); return h ? { x: h.x + h.w / 2, y: h.y + h.h / 2, x0: h.x, y0: h.y, w: h.w, h: h.h } : null; }
    };
    GTP.game.render();
  });
  return { page, errs };
}

const PAD_INIT = () => {
  const pad = { index: 0, id: 'QA Fake Pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: [] };
  for (let i = 0; i < 17; i++) pad.buttons.push({ pressed: false, touched: false, value: 0 });
  window.__padSet = (i, on) => { pad.buttons[i].pressed = !!on; pad.buttons[i].value = on ? 1 : 0; };
  navigator.getGamepads = () => [pad, null, null, null];
};

module.exports = { H, bootTitle, PAD_INIT };
