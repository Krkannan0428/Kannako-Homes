/* bosses.js: the v0.3 bosses track. Every boss through every phase as a mission objective, played by a bot on real inputs
 * (the lock-on aim, the trigger, the move keys, jumps; the debate minigame resolved as a win after a few seconds), the phase
 * checkpoint (die in phase 2, RETRY resumes in phase 2), the boss events, the four specials and their meters, screenshots.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/bosses.js   (ONLY=b03_warbanner for one boss)
 */
'use strict';
const H = require('./_harness');

const ALL = ['b01_goldplate', 'b02_velvetine', 'b03_warbanner', 'b04_redacted', 'b05_dunk', 'b06_panel'];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

// the bot, installed in the page: one decision every few fixed steps
function installBot() {
  const U = GTP.util, In = GTP.Input;
  const keys = ['forward', 'back', 'left', 'right', 'aim', 'shoot', 'run', 'jump'];
  const bot = window.__bot = { stats: { steps: 0, jumps: 0, dodges: 0, deaths: 0, retries: 0, debates: 0, hpLost: 0 }, debateT: 0, lastHp: 100 };
  bot.release = function () { for (const k of keys) In.set(k, false); };
  // move along world direction (dx, dz) relative to the camera yaw (the player's control reads the keys camera-relative)
  function moveDir(dx, dz) {
    const l = Math.hypot(dx, dz);
    In.set('forward', false); In.set('back', false); In.set('left', false); In.set('right', false);
    if (l < 0.01) return;
    const f = U.yawToDir(GTP.Render.rig.yaw), rx = -f.z, rz = f.x;
    const fw = (dx * f.x + dz * f.z) / l, rt = (dx * rx + dz * rz) / l;
    if (fw > 0.3) In.set('forward', true); else if (fw < -0.3) In.set('back', true);
    if (rt > 0.3) In.set('right', true); else if (rt < -0.3) In.set('left', true);
  }
  bot.decide = function () {
    const g = GTP.game, p = g.player, M = GTP.Missions, B = GTP.Bosses;
    bot.stats.steps++;
    if (M.dialogue && M.dialogue.active) { if (GTP.UI && GTP.UI.advanceDialogue) GTP.UI.advanceDialogue(); else M.advanceDialogue(); return; }
    if (g.state === 'minigame') {
      bot.debateT += 1;
      if (bot.debateT > 40) { bot.debateT = 0; bot.stats.debates++; B.debug.resolveDebate(true); }
      return;
    }
    if (M.canRetry && M.canRetry()) { bot.release(); bot.stats.retries++; M.retry(); return; }
    if (g.state !== 'playing') { bot.release(); return; }
    if (p.hp < bot.lastHp) bot.stats.hpLost += bot.lastHp - p.hp;
    bot.lastHp = p.hp;
    if (!p.alive || p.knockedDown) { bot.release(); return; }
    const enc = B.active;
    if (!enc || enc.state !== 'fight') { bot.release(); return; }
    let tg = enc.target();
    // goons in your face come first, like a player would
    let nearAdd = null, nd = enc.id === 'b05_dunk' ? 4 : 8;
    for (const a of enc.adds) { if (!a.alive || a.removed || a.knockedDown || a.fled || a.inVehicle) continue; const d = Math.hypot(a.x - p.x, a.z - p.z); if (d < nd) { nd = d; nearAdd = a; } }
    if (nearAdd) tg = nearAdd;
    In.set('run', true);
    let mx = 0, mz = 0, dodging = false;
    // telegraphs: step out of an armed circle / strip, jump an incoming ring
    for (const t of enc.tele) {
      if (t.shape === 'ring') {
        if (!t.struck && t.t < t.warn) continue;
        const d = Math.hypot(p.x - t.x, p.z - t.z), gap = d - t.rr;
        if (gap > 0.4 && gap < 2.4 && p.onGround && !t.hit && !t.dodged) { In.press('jump'); bot.stats.jumps++; }
        continue;
      }
      if (t.struck || t.dmg <= 0 && !(enc.id === 'b05_dunk' || t.color === 0x3d6fcf)) continue;
      if (!t.inside(p.x, p.z) && !(t.shape === 'circle' && Math.hypot(p.x - t.x, p.z - t.z) < t.r + 1.2)) continue;
      dodging = true; bot.stats.dodges++;
      if (t.shape === 'circle') { mx += p.x - t.x; mz += p.z - t.z; if (Math.abs(mx) + Math.abs(mz) < 0.1) mx = 1; }
      else { const f = U.yawToDir(t.yaw), rx = -f.z, rz = f.x, side = ((p.x - t.x) * rx + (p.z - t.z) * rz) >= 0 ? 1 : -1; mx += rx * side; mz += rz * side; }
    }
    // a player picks up the crates the fight leaves out when hurt
    if (!dodging && p.hp < 55) {
      let best = null, bd = 40;
      for (const k of enc.pickups) { if (k.removed || k.hidden || (k.pickupType !== 'health' && k.pickupType !== 'armor')) continue; const d = Math.hypot(k.x - p.x, k.z - p.z); if (d < bd) { bd = d; best = k; } }
      if (best) { GTP.Render.rig.yaw = U.dirToYaw(best.x - p.x, best.z - p.z); moveDir(best.x - p.x, best.z - p.z); In.set('aim', false); In.set('shoot', false); return; }
    }
    if (!tg) { moveDir(mx, mz); In.set('aim', false); In.set('shoot', false); return; }
    // the camera turns to the target: the lock-on takes the best target within 20 degrees of the rig's yaw
    const dx = tg.x - p.x, dz = tg.z - p.z, dist = Math.hypot(dx, dz);
    GTP.Render.rig.yaw = U.dirToYaw(dx, dz);
    const melee = enc.id === 'b05_dunk';
    let want = melee ? 1.1 : (enc.id === 'b01_goldplate' && tg.kind === 'heli' ? 7 : 9);
    let attack = true;
    if (melee) {
      const card = enc.data.card, mode = enc.data.mode;
      if (card === 'blocked' || mode === 'block') attack = false;
      if (tg === enc.ped && mode !== 'stunned') { want = 5; attack = false; }
      if (tg !== enc.ped) { want = 1.1; attack = true; }
    }
    if (!dodging) {
      if (dist > want + 1.5) { mx = dx; mz = dz; }
      else if (dist < want - 2.5) { mx = -dx; mz = -dz; }
    }
    moveDir(mx, mz);
    In.set('aim', attack);
    In.set('shoot', attack && (melee ? dist < 2.2 : dist < 32));
  };
  bot.run = function (seconds, every) {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) { if (i % (every || 4) === 0) bot.decide(); GTP.game.step(); }
  };
}

H.run('bosses', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  const surface = await page.evaluate(() => ({
    bosses: GTP.Bosses && GTP.Bosses.ids, specials: GTP.Specials && GTP.Specials.ids,
    mode: GTP.Bosses.objectiveMode || null, register: typeof GTP.Missions.registerObjectiveType,
    defs: GTP.Bosses.ids.map((id) => { const d = GTP.Bosses.defs[id]; return { id, phases: d.thresholds.length, lines: Object.keys(d.lines), barks: Object.keys(d.barks || {}).length, hints: (d.hints || []).length }; })
  }));
  console.log('  surface: ' + JSON.stringify({ bosses: surface.bosses, specials: surface.specials, mode: surface.mode, register: surface.register }));
  t.assert(surface.bosses.length === 6 && surface.specials.length === 4, 'six bosses, four specials');
  t.assert(surface.mode === (surface.register === 'function' ? 'registered' : 'fallback'), 'the boss objective type is installed (' + surface.mode + ')');
  for (const d of surface.defs) t.assert(d.phases >= 3 && d.lines.includes('intro') && d.lines.includes('defeat') && d.barks >= 2 && d.hints === d.phases, 'boss data complete: ' + JSON.stringify(d));

  await page.evaluate(installBot);
  // the boss events, recorded for the whole run
  await page.evaluate(() => {
    const log = window.__bossLog = { phase: [], defeated: [], start: [], end: [], hits: 0, barks: 0 };
    GTP.Events.on('boss:phase', (e) => { const last = log.phase[log.phase.length - 1]; if (!last || last.id !== e.id || last.phase !== e.phase || last.state !== e.state) log.phase.push({ id: e.id, phase: e.phase, hp: e.hp, maxHp: e.maxHp, state: e.state, name: e.name }); });
    GTP.Events.on('boss:defeated', (e) => log.defeated.push(e.id));
    GTP.Events.on('boss:start', (e) => log.start.push(e.id));
    GTP.Events.on('boss:end', (e) => log.end.push(e.id + ':' + e.reason));
    GTP.Events.on('boss:hit', () => log.hits++);
    GTP.Events.on('boss:bark', () => log.barks++);
    log.dmg = {};
    GTP.Events.on('damage', (e) => { if (!e || e.target !== GTP.game.player) return; const k = (e.type || '?') + ':' + (e.src ? (e.src.castId || e.src.role || e.src.kind) : 'none'); log.dmg[k] = Math.round((log.dmg[k] || 0) + e.amount); });
  });

  const results = {};
  for (const id of ALL) {
    if (ONLY && !ONLY.includes(id)) continue;
    const t0 = Date.now();
    await page.evaluate(() => { window.__bossLog.dmg = {}; });
    // a test mission: one approach objective and the boss, started at the arena like the content's missions will be
    const start = await page.evaluate((id) => {
      const B = GTP.Bosses, M = GTP.Missions, g = GTP.game, p = g.player;
      B.endAll('test'); B.debug.clearResume();
      if (M.state.active) M.abort();
      const mid = 't_' + id; window.__curMission = mid;
      M.registerTest({ id: mid, title: 'Test: ' + B.defs[id].title, giver: B.defs[id].cast, objectives: [{ type: 'boss', bossId: id, text: 'Beat ' + B.defs[id].name }], outro: [{ who: 'player', text: 'Next.' }], reward: 0 });
      // the arena is resolved from the boss data; arrive at its edge with a gun
      const def = B.defs[id], lm = GTP.World.landmark(def.arena.landmark), c = { x: lm.door.x + def.arena.offset.x, z: lm.door.z + def.arena.offset.z };
      const sp = GTP.World.nearestSidewalkPoint(c.x - 12, c.z - 6) || { x: c.x, z: c.z - 10 };
      if (p.inVehicle) p.exitVehicle();
      g.debug.teleport(sp.x, sp.z); p.hp = p.maxHp; p.armor = 50;
      g.debug.giveWeapon('pistol', 600); p.weapon = id === 'b05_dunk' ? 'fist' : 'pistol';
      window.__bot.stats = { steps: 0, jumps: 0, dodges: 0, deaths: 0, retries: 0, debates: 0, hpLost: 0 }; window.__bot.lastHp = p.hp;
      const ok = M.start(mid, { skipIntro: true });
      const enc = B.active;
      return { ok, enc: !!enc, state: enc && enc.state, center: enc && [Math.round(enc.center.x), Math.round(enc.center.z)], mission: M.state.active, objective: M.state.objectiveText };
    }, id);
    t.assert(start.ok && start.enc && start.mission === 't_' + id, id + ': the boss objective spawned the encounter: ' + JSON.stringify(start));

    // play: the bot fights until the mission completes (a sim-time budget), with screenshots in phase 1 and the last phase
    let shotsTaken = 0, done = false, simT = 0;
    const budget = id === 'b06_panel' ? 420 : 360;
    while (simT < budget) {
      const chunk = shotsTaken === 0 ? 1 : 5;
      const st = await page.evaluate((chunk) => { window.__bot.run(chunk); const B = GTP.Bosses, e = B.active, M = GTP.Missions;
        return { state: e ? e.state : null, phase: e ? e.phase : 0, hp: e ? Math.round(e.hp) : 0, completed: M.state.completed.has(window.__curMission), active: M.state.active, retry: !!M.lastFail(), tele: e ? e.tele.length : 0, gs: GTP.game.state, hpP: Math.round(GTP.game.player.hp) }; }, chunk);
      simT += chunk;
      if (shotsTaken === 0 && st.state === 'fight' && simT >= 4) {
        // the set piece from a free camera: behind the player, the boss's rig (helicopter, balloon, dais...) in frame
        await page.evaluate(() => {
          const e = GTP.Bosses.active, p = GTP.game.player, c = e.center;
          const focus = e.heli || e.balloon || (e.ped && !e.ped.removed ? e.ped : null) || c;
          const fy = (focus.y != null ? focus.y : c.y) + (e.balloon ? -4 : 1);
          let dx = p.x - focus.x, dz = p.z - focus.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          const back = e.heli || e.balloon ? 30 : 18, up = e.heli ? 13 : e.balloon ? 6 : 7;
          GTP.game.debug.freeCam(focus.x + dx * back, c.y + up, focus.z + dz * back, focus.x, fy, focus.z);
        });
        await t.shot(page, 'boss_' + id + '_p1');
        await page.evaluate(() => GTP.game.debug.followCam());
        shotsTaken++;
      }
      if (shotsTaken === 1 && st.state === 'fight' && st.phase >= 2) {
        await page.evaluate(() => { const e = GTP.Bosses.active, p = GTP.game.player, tg = e.target() || e.center; GTP.Render.rig.yaw = GTP.util.dirToYaw(tg.x - p.x, tg.z - p.z); GTP.Render.rig.pitch = (tg.y || 0) > p.y + 5 ? -0.25 : 0.18; });
        await t.shot(page, 'boss_' + id + '_p2'); shotsTaken++;
      }
      if (st.completed) { done = true; break; }
      if (!st.active && !st.retry && st.gs === 'playing') break;
    }
    const res = await page.evaluate((id) => {
      const M = GTP.Missions, log = window.__bossLog, b = window.__bot;
      const phases = log.phase.filter((e) => e.id === id && e.state === 'fight').map((e) => e.phase);
      return { completed: M.state.completed.has('t_' + id), phases: Array.from(new Set(phases)), defeated: log.defeated.includes(id), errors: GTP.errors.slice(0, 6).map((e) => e.where + ': ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 4).join(' < ')), bot: b.stats, dmg: log.dmg, hits: log.hits, barks: log.barks, name: (log.phase.find((e) => e.id === id) || {}).name };
    }, id);
    results[id] = Object.assign(res, { simSeconds: simT, ms: Date.now() - t0 });
    console.log('  ' + id + ': ' + JSON.stringify(results[id]));
    t.assert(done && res.completed, id + ': the mission completed (the boss beaten) within ' + budget + ' s of play: ' + JSON.stringify(res));
    t.assert(res.defeated, id + ': boss:defeated');
    const want = (await page.evaluate((id) => GTP.Bosses.defs[id].thresholds.length, id));
    for (let k = 1; k <= want; k++) t.assert(res.phases.includes(k), id + ': boss:phase reported phase ' + k + ' (' + res.phases + ')');
    t.assert(res.errors.length === 0, id + ': no errors: ' + res.errors.join(' | '));
    // the humiliated boss is still there (never killed), then the set clears
    const after = await page.evaluate((id) => { const peds = GTP.Entities.list.filter((e) => e.kind === 'ped' && e.bossId === id); return { peds: peds.length, alive: peds.every((e) => e.alive), humiliated: peds.some((e) => e.humiliated) }; }, id);
    t.assert(after.peds === 0 || (after.alive && after.humiliated), id + ': the boss is humiliated, never killed: ' + JSON.stringify(after));
    await page.evaluate(() => { GTP.game.advance(2); });
  }

  // the phase checkpoint: die in phase 2 of the President, RETRY resumes in phase 2 at the phase's start
  if (!ONLY || ONLY.includes('checkpoint')) {
    const cp = await page.evaluate(() => {
      const B = GTP.Bosses, M = GTP.Missions, g = GTP.game, p = g.player;
      B.endAll('test'); B.debug.clearResume(); if (M.state.active) M.abort();
      const def = B.defs.b01_goldplate, lm = GTP.World.landmark('stadium');
      g.debug.teleport(lm.door.x - 30, lm.door.z + 8); p.hp = p.maxHp; g.debug.giveWeapon('pistol', 200);
      M.registerTest({ id: 't_cp', title: 'Checkpoint', objectives: [{ type: 'goto', target: { landmark: 'stadium', offset: { x: -30, z: 8 }, metres: true }, text: 'Arrive' }, { type: 'boss', bossId: 'b01_goldplate', text: 'Ground him' }] });
      M.start('t_cp', { skipIntro: true });
      for (let i = 0; i < 20 && !B.active; i++) g.advance(0.25);
      const out = { spawned: !!B.active };
      for (let i = 0; i < 40 && B.active && B.active.state !== 'fight'; i++) { if (M.dialogue.active) M.skipDialogue(); g.advance(0.25); }
      B.debug.skipPhase();
      for (let i = 0; i < 40 && B.active && !(B.active.state === 'fight' && B.active.phase === 2); i++) { if (M.dialogue.active) M.skipDialogue(); g.advance(0.25); }
      out.phaseBefore = B.active && B.active.phase;
      const enc = B.active; out.cpPhase = M.debug.snapshot() && M.debug.snapshot().bossPhase;
      // walk somewhere else in the arena, then die
      g.debug.teleport(enc.center.x + 5, enc.center.z + 5);
      p.applyDamage(9999, null, 'test');
      for (let i = 0; i < 40 && !M.canRetry(); i++) g.advance(0.25);
      out.canRetry = M.canRetry(); out.failed = M.lastFail() && M.lastFail().reason;
      out.retried = M.retry();
      for (let i = 0; i < 40 && B.active && B.active.state !== 'fight'; i++) { if (M.dialogue.active) M.skipDialogue(); g.advance(0.25); }
      const e2 = B.active;
      out.after = e2 ? { phase: e2.phase, hp: e2.hp, state: e2.state, resumed: e2.resumed || 0 } : null;
      out.playerNear = e2 ? Math.round(Math.hypot(p.x - e2.center.x, p.z - e2.center.z)) : -1;
      out.objective = M.state.objectiveText;
      M.abort();
      out.endedOnAbort = !B.active;
      out.errors = GTP.errors.slice(0, 4).map((e) => e.where + ': ' + e.message);
      return out;
    });
    console.log('  checkpoint: ' + JSON.stringify(cp));
    t.assert(cp.spawned && cp.phaseBefore === 2 && cp.cpPhase === 2, 'the checkpoint is refreshed at phase 2: ' + JSON.stringify(cp));
    t.assert(cp.canRetry && cp.retried && cp.after && cp.after.phase === 2 && cp.after.hp === 200 && cp.after.resumed === 2, 'RETRY resumes the boss in phase 2: ' + JSON.stringify(cp));
    t.assert(cp.playerNear >= 0 && cp.playerNear < 30, 'RETRY puts the player back in the arena');
    t.assert(cp.endedOnAbort && cp.errors.length === 0, 'abort ends the fight; no errors');
  }

  // the specials: locked at first, then each one on real inputs, special:state on every change
  if (!ONLY || ONLY.includes('specials')) {
    const sp = await page.evaluate(() => {
      const S = GTP.Specials, In = GTP.Input, g = GTP.game, p = g.player, B = GTP.Bosses, out = {};
      B.endAll('test'); if (GTP.Missions.state.active) GTP.Missions.abort();
      const evs = []; const on = (e) => evs.push(e); GTP.Events.on('special:state', on);
      for (const k of S.ids) delete GTP.Missions.state.flags['special_' + k];
      S.reset();
      const lm = GTP.World.landmark('campus_quad'); g.debug.teleport(lm.door.x, lm.door.z - 18); g.advance(0.5);
      out.locked = S.ids.map((id) => S.unlocked(id));
      out.lockedTrigger = S.trigger('shout');
      for (const k of S.ids) S.unlock(k);
      out.unlocked = S.ids.map((id) => S.unlocked(id));
      // shout: a tap of the special action knocks the peds around flat
      const peds = []; for (let i = 0; i < 3; i++) peds.push(g.debug.spawnPed(p.x + 2 + i, p.z + 1.5, null, 'thug'));
      In.set('special', true); g.step(); g.step(); In.set('special', false); g.advance(0.1);
      out.shout = { meter: +S.meters.shout.toFixed(2), down: peds.filter((q) => q.knockedDown).length };
      // chat mob: a hold
      In.set('special', true); g.advance(0.8); In.set('special', false); g.advance(0.2);
      out.mob = { allies: S.allies().length, active: S.state().chatmob.active, meter: +S.meters.chatmob.toFixed(2) };
      // the allies go for a hostile goon
      const goon = g.debug.spawnPed(p.x + 6, p.z + 6, null, 'thug'); goon.hostile = true; const hp0 = goon.hp;
      g.advance(4);
      out.mobHit = goon.hp < hp0 || goon.knockedDown || !goon.alive;
      g.advance(18); out.mobGone = S.allies().length === 0 && !S.state().chatmob.active;
      // focus: aim + special
      In.set('aim', true); g.step(); In.press('special'); g.step();
      out.focus = { active: S.state().focus.active, timeScale: g.timeScale };
      g.advance(0.5); const m1 = S.meters.focus;
      In.press('special'); g.step(); In.set('aim', false); g.step();
      out.focusOff = { active: S.state().focus.active, timeScale: g.timeScale, drained: +(1 - m1).toFixed(3) };
      // boost: in a car, hold special; the car gains speed it would not without it
      const v = g.debug.spawnVehicle(p.x + 4, p.z, 'sedan', { yaw: 0 }); p.enterVehicle(v, 0); g.advance(1.2);
      const runFor = (s, boost) => { In.set('forward', true); In.set('special', !!boost); g.advance(s); const sp = v.speed; In.set('special', false); In.set('forward', false); g.step(); return sp; };
      // a straight on the open ground: from rest, the same throttle with and without the boost
      const lmR = GTP.World.landmark('airport_runway'); g.debug.teleport(lmR.door.x - 60, lmR.door.z + 26); v.yaw = Math.PI / 2; v.vx = v.vz = 0; v.speed = 0; v.snap(); g.advance(0.5);
      const plain = runFor(1.5, false); v.vx = v.vz = 0; v.speed = 0; g.debug.teleport(lmR.door.x - 60, lmR.door.z + 26); v.yaw = Math.PI / 2; v.snap(); g.advance(0.5);
      S.meters.boost = 1;
      const boosted = runFor(1.5, true);
      out.boost = { plain: +plain.toFixed(1), boosted: +boosted.toFixed(1), meter: +S.meters.boost.toFixed(2), active: S.state().boost.active };
      v.vx = v.vz = 0; v.speed = 0; p.exitVehicle(); g.advance(1);
      // the fallback key (no `special` binding in this build): X taps a shout
      S.meters.shout = 1;
      out.keyFallback = null;
      GTP.Events.off('special:state', on);
      out.events = { n: evs.length, ids: Array.from(new Set(evs.map((e) => e.id))), shape: Object.keys(evs[0] || {}) };
      out.errors = GTP.errors.slice(0, 4).map((e) => e.where + ': ' + e.message);
      return out;
    });
    // the X key on the real keyboard
    await page.keyboard.press('x');
    sp.keyFallback = await page.evaluate(() => { GTP.game.advance(0.1); return +GTP.Specials.meters.shout.toFixed(2); });
    console.log('  specials: ' + JSON.stringify(sp));
    t.assert(sp.locked.every((u) => !u) && sp.lockedTrigger === false, 'specials start locked');
    t.assert(sp.unlocked.every((u) => u), 'unlock() opens them');
    t.assert(sp.shout.down >= 2 && sp.shout.meter < 0.2, 'shout: a tap knocks the peds around flat and spends the meter: ' + JSON.stringify(sp.shout));
    t.assert(sp.mob.allies === 3 && sp.mob.active && sp.mob.meter < 0.2, 'chat mob: a hold calls three allies: ' + JSON.stringify(sp.mob));
    t.assert(sp.mobHit && sp.mobGone, 'the chat mob fights a goon and logs off after its time');
    t.assert(sp.focus.active && sp.focus.timeScale < 1 && !sp.focusOff.active && sp.focusOff.timeScale === 1 && sp.focusOff.drained > 0, 'focus: aim + special slows time, drains, toggles off: ' + JSON.stringify([sp.focus, sp.focusOff]));
    t.assert(sp.boost.boosted > sp.boost.plain + 4 && sp.boost.meter < 0.7 && !sp.boost.active, 'boost: the car outruns its own throttle and drains the meter: ' + JSON.stringify(sp.boost));
    t.assert(sp.keyFallback < 0.2, 'the X key fallback taps a shout: ' + sp.keyFallback);
    t.assert(sp.events.n > 6 && sp.events.ids.length === 4 && ['id', 'meter', 'active'].every((k) => sp.events.shape.includes(k)), 'special:state {id, meter, active} for all four: ' + JSON.stringify(sp.events));
    t.assert(sp.errors.length === 0, 'no errors in the specials: ' + sp.errors.join(' | '));
  }

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'no errors: ' + errs.slice(0, 5).join('\n'));
  console.log('  summary: ' + Object.keys(results).map((k) => k + ' ' + results[k].simSeconds + 's sim, hp lost ' + Math.round(results[k].bot.hpLost) + ', retries ' + results[k].bot.retries).join('; '));
});
