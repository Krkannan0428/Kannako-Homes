/* qa_c_soak.js (QA-C): a long-session memory and growth benchmark.
 * Simulates SOAK_MIN game minutes (default 20) with full AI: every minute the player teleports across the map
 * (chunk churn), starts and aborts a story mission, blows up three cars, takes 3-5 stars, dies and respawns, then
 * runs and looks around; a frame is rendered every 2 simulated seconds. Every minute it samples entity counts,
 * scene object counts, renderer.info.memory, shader programs, live Events listeners (on minus off since boot),
 * fx arrays and the JS heap. It fails when a counter keeps growing after the first few minutes.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_c_soak.js
 *      SOAK_MIN=5 for a quick run; SOAK_JSON=<file> writes the samples. */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../_harness');

const MIN = +(process.env.SOAK_MIN || 20);

(async () => {
  const t0 = Date.now();
  const browser = await require('playwright').chromium.launch({ args: H.ARGS.concat(['--enable-precise-memory-info', '--js-flags=--expose-gc']) });
  let failed = false;
  try {
    const ctx = await H.boot(browser, { seed: 7 });
    const { page } = ctx;
    await page.evaluate(() => {
      const ev = GTP.Events, on = ev.on, off = ev.off;
      window.__qac = { live: {}, addEL: 0, remEL: 0, timeouts: 0, intervals: 0 };
      ev.on = function (n, fn) { __qac.live[n] = (__qac.live[n] || 0) + 1; return on.call(ev, n, fn); };
      ev.off = function (n, fn) { __qac.live[n] = (__qac.live[n] || 0) - 1; return off.call(ev, n, fn); };
      const ael = EventTarget.prototype.addEventListener, rel = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function () { __qac.addEL++; return ael.apply(this, arguments); };
      EventTarget.prototype.removeEventListener = function () { __qac.remEL++; return rel.apply(this, arguments); };
      const st = window.setTimeout, si = window.setInterval;
      window.setTimeout = function () { __qac.timeouts++; return st.apply(window, arguments); };
      window.setInterval = function () { __qac.intervals++; return si.apply(window, arguments); };
      window.__qacSample = function (minute) {
        if (window.gc) window.gc();
        const R = GTP.Render, info = R.renderer.info, kinds = {};
        GTP.Entities.list.forEach((e) => { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
        let objects = 0, meshes = 0; R.scene.traverse((o) => { objects++; if (o.isMesh) meshes++; });
        const fx = R.fx || {};
        let hashCells = 0; try { hashCells = GTP.Entities.hash.map.size; } catch (e) { }
        let listeners = 0; Object.keys(__qac.live).forEach((k) => { listeners += __qac.live[k]; });
        return {
          minute, entities: GTP.Entities.list.length, kinds, objects, meshes, sceneChildren: R.scene.children.length,
          geometries: info.memory.geometries, textures: info.memory.textures, programs: (info.programs || []).length,
          calls: info.render.calls, chunks: R.chunks.size, hashCells,
          fx: (fx.list || []).length, fxTexts: (fx.texts || []).length, fxPool: (fx._pool || []).length,
          pickups: GTP.Combat.pickups ? GTP.Combat.pickups.size : null,
          gtpListeners: listeners, domListenersNet: __qac.addEL - __qac.remEL, timeouts: __qac.timeouts, intervals: __qac.intervals,
          heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
          errors: GTP.errors.length
        };
      };
    });
    const missions = await page.evaluate(() => (GTP.Content.missions || []).map((m) => m.id).filter(Boolean));
    const samples = [await page.evaluate(() => __qacSample(0))];
    console.log('  ' + JSON.stringify(samples[0]));
    for (let m = 1; m <= MIN; m++) {
      const mid = missions[(m - 1) % Math.max(1, missions.length)];
      await page.evaluate(({ m, mid }) => {
        const g = GTP.game, D = g.debug, r = GTP.rng, p = () => g.player;
        // 1) teleport across the map onto a road (chunk churn, spawner churn)
        const L = GTP.World.landmarks[(m * 7) % GTP.World.landmarks.length];
        const tx = L.door ? L.door.x : L.x, tz = L.door ? L.door.z : L.z;
        D.teleport(tx + 6, tz + 6);
        g.advance(2); g.render();
        // 2) start and abort a mission
        try { GTP.Missions.start(mid); g.advance(4); g.render(); GTP.Missions.abort(); } catch (e) { GTP.errors.push({ where: 'soak.mission', message: String(e) }); }
        g.advance(1);
        // 3) three explosions around the player
        for (let i = 0; i < 3; i++) {
          const v = D.spawnVehicle(p().x + 8 + i * 5, p().z + 8, 'sedan');
          if (v && v.explode) v.explode(p());
        }
        g.advance(2); g.render();
        // 4) heat
        D.setWanted(3 + (m % 3));
        for (let s = 0; s < 10; s++) { g.advance(2); g.render(); }
        // 5) die and respawn
        p().godMode = false;
        GTP.Combat.damage(p(), 99999, null, 'qa');
        for (let s = 0; s < 8 && !(p().alive && g.state === 'playing'); s++) g.advance(2);
        D.setWanted(0);
        // 6) run around and look for the rest of the minute
        GTP.Input.set('forward', true); GTP.Input.set('run', true);
        for (let s = 0; s < 12; s++) { GTP.Input.setLook(60 * (r.random() - 0.3), 0); g.advance(2); g.render(); }
        GTP.Input.set('forward', false); GTP.Input.set('run', false);
      }, { m, mid });
      const s = await page.evaluate((m) => __qacSample(m), m);
      samples.push(s);
      console.log('  ' + JSON.stringify(s));
    }
    if (process.env.SOAK_JSON) fs.writeFileSync(process.env.SOAK_JSON, JSON.stringify(samples, null, 1));
    // growth checks: compare the steady state (minute 3) with the end
    const a = samples[Math.min(3, samples.length - 1)], b = samples[samples.length - 1];
    const grow = (k, slack) => { if (b[k] != null && a[k] != null && b[k] > a[k] * (1 + slack) + 8) throw new Error('ASSERT: ' + k + ' keeps growing: ' + a[k] + ' at minute ' + a.minute + ' -> ' + b[k] + ' at minute ' + b.minute); };
    const problems = [];
    for (const [k, slack] of [['entities', 0.25], ['objects', 0.2], ['geometries', 0.2], ['textures', 0.2], ['programs', 0.1], ['gtpListeners', 0.05], ['domListenersNet', 0.05], ['fx', 0.5], ['hashCells', 0.5], ['heapMB', 0.35]]) {
      try { grow(k, slack); } catch (e) { problems.push(e.message); }
    }
    if (b.errors) problems.push('GTP.errors: ' + b.errors);
    if (problems.length) throw new Error(problems.join('\n'));
    console.log('PASS qa_c_soak (' + MIN + ' game min, ' + (Date.now() - t0) + ' ms)');
  } catch (e) {
    failed = true;
    console.error('FAIL qa_c_soak: ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
})();
