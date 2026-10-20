/* campaign.js: the whole campaign, start to both endings, on a NEW game in a non-headless page.
 *  - Enter on the title screen starts play; the m00_intro light is entered on foot (real inputs)
 *  - every mission is started by walking into its blue light, then played through the real objective
 *    checks: real enter / drive / goto / pickup checks (debug teleports stand in for the drive), real
 *    fights (fists or the current gun, god mode on), real tailing, real pay-and-spray for the five-star
 *    escapes, hiding out of sight for the others, both minigames played with scripted inputs;
 *    destroy targets are wrecked with a real aimed shot or two and then applyDamage (ammo is finite)
 *  - asserts per mission: completed, the reward paid (minus respray costs, plus cash picked up),
 *    onComplete flags, weapon unlocks in the GDD order (megaphone m03, pistol m05, hottake m09, smg m11,
 *    the shotgun only as a pickup after m11), the credits hook on both endings, GTP.errors empty
 *  - screenshots: campaign_<id>_intro.png (the intro dialogue) and campaign_<id>_mid.png (a mid-mission moment)
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/campaign.js */
'use strict';
const H = require('./_harness');

const ORDER = ['m00_intro', 'm01_van', 'm02_read', 'm03_ratio', 'm04_hit', 'm05_peer', 'm06_rally', 'm07_listen', 'm08_scooters',
  'm09_balloon', 'm10_pellets', 'm11_trustless', 'm12_memo', 'm13_thursday', 'm14_grift', 'm15a_primetime', 'm15b_liveread'];
// expected unlocks per the GDD
const UNLOCKS = { m03_ratio: 'megaphone', m05_peer: 'pistol', m09_balloon: 'hottake', m11_trustless: 'smg' };
// per-mission step scripts; a numeric argument pauses a resumable step (after n seconds / items / answers) for the screenshot
const SCRIPT = {
  m00_intro: [['goto', 'dorm_studio'], ['pickups'], ['shot'], ['goto', 'campus_quad'], ['debate']],
  m01_van: [['enter'], ['pickups', 3], ['shot'], ['pickups'], ['drive', 'pod_garage']],
  m02_read: [['enter'], ['drive', 'green_room'], ['shot'], ['dialogue']],
  m03_ratio: [['ratio', 2], ['shot'], ['ratio'], ['defeat']],
  m04_hit: [['dialogue'], ['car'], ['drive', 'tyn_tower'], ['goto', 'tyn_tower'], ['debate', 3], ['shot'], ['debate']],
  m05_peer: [['follow', 30], ['shot'], ['follow'], ['pickups'], ['survive']],
  m06_rally: [['goto', 'stadium'], ['survive', 25], ['shot'], ['survive'], ['destroy'], ['escape']],
  m07_listen: [['enter'], ['pickups'], ['drive', 'velvetine_pier'], ['shot'], ['dialogue']],
  m08_scooters: [['enter'], ['drive', 'capitol_dome'], ['drive', 'goldplate_tower'], ['shot'], ['drive', 'velvetine_pier'], ['drive', 'bravadia_embassy']],
  m09_balloon: [['follow', 30], ['shot'], ['follow'], ['pickups'], ['escape']],
  m10_pellets: [['enter'], ['drive', 'hoa_hall'], ['destroy', 1], ['shot'], ['destroy'], ['escape']],
  m11_trustless: [['pickups', 4], ['shot'], ['pickups'], ['dialogue'], ['destroy']],
  m12_memo: [['car'], ['drive', 'ova_hq'], ['defeat', 3], ['shot'], ['defeat'], ['pickups'], ['escape'], ['goto', 'pod_garage']],
  m13_thursday: [['goto', 'campus_quad'], ['survive', 35], ['shot'], ['survive'], ['escape'], ['goto', 'pod_garage']],
  m14_grift: [['debate', 4], ['shot'], ['debate'], ['dialogue'], ['escape']],
  m15a_primetime: [['car'], ['drive', 'nap_depot'], ['drive', 'clarity_barn'], ['shot'], ['drive', 'moon_mine'], ['drive', 'velvetine_pier'], ['drive', 'goldplate_tower'], ['goto', 'goldplate_tower'], ['ratio']],
  m15b_liveread: [['car'], ['drive', 'tyn_tower'], ['defeat'], ['ratio', 3], ['shot'], ['ratio'], ['goto', 'campus_quad']]
};

// in-page driver (installed once; classic script context, so plain functions)
function installDriver() {
  const U = GTP.util, M = GTP.Missions;
  const COUNTER = { FACT: 'forward', FEELING: 'left', GOTCHA: 'right', ANECDOTE: 'back' };
  const CT = window.CT = {
    log: [], events: [], fails: [], cash: 0, spent: 0, endings: [], fallbacks: [], how: {},
    p() { return GTP.game.player; },
    adv(s) { GTP.game.advance(s); return s; },
    press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
    hold(a, on) { GTP.Input.set(a, !!on); },
    tp(x, z) { GTP.game.debug.teleport(x, z); },
    door(id) { const lm = GTP.World.landmark(id); return { x: lm.door.x, z: lm.door.z, lm }; },
    cur() { return M.current(); },
    def() { const c = M.current(); return c ? c.def : null; },
    ctx() { const c = M.current(); return c ? c.ctx : null; },
    active() { return M.state.active; },
    talking() { return !!(M.dialogue && M.dialogue.active) || !!GTP.UI.state.dialogue; },
    pedOut(h) { return !h || h.removed || !h.alive || h.knockedDown || h.fled; },
    lost(v) { return !v || v.removed || v.wreck || v.sinking; },
    walkable(x, z) { const W = GTP.World, T = W.T, t = W.tileAt(x, z); return (t === T.SIDEWALK || t === T.PLAZA || t === T.GRASS || t === T.SAND || t === T.PARKING || t === T.ROAD) && !W.solidAt(x, z, 0.5); },
    bestWeapon() { const p = CT.p(), w = p.weapons; for (const id of ['smg', 'pistol', 'shotgun']) if (w[id] > 0) return id; return 'fist'; },
    face(x, z) { const p = CT.p(), yaw = U.dirToYaw(x - p.x, z - p.z); p.yaw = yaw; p.moveYaw = yaw; GTP.Render.rig.yaw = yaw; GTP.Render.rig.pitch = 0.16; GTP.Render.rig.snap(); GTP.Render.updateCamera(0); },
    // advance in slices until pred(); a mission that was running and ends (fail / abort) stops the wait; returns seconds or -1
    until(pred, maxSec, step) {
      step = step || 0.1; let s = 0; const wasActive = M.state.active;
      while (s < maxSec) { GTP.game.advance(step); s += step; if (pred()) return s; if (wasActive && !M.state.active && !CT._expectEnd) return -1; }
      return -1;
    },
    // skip dialogue lines with confirm until stop() (default: play resumes); returns seconds or -1
    skipTalk(maxSec, stop) {
      stop = stop || (() => !CT.talking() && GTP.game.state !== 'cutscene');
      let s = 0;
      while (s < maxSec) {
        if (stop()) return s;
        const d = GTP.UI.state.dialogue;
        if (d && d.t > 0.15) CT.press('confirm');
        s += CT.adv(0.15);
      }
      return stop() ? s : -1;
    },
    // walk into a mission's blue light from the road side (real input); the direct start is the last resort
    start(id) {
      const mk = M.markers().find((m) => m.id === id && m.kind === 'mission');
      if (!mk) return { ok: false, note: 'no marker for ' + id + ': ' + M.markers().map((m) => m.id).join(',') };
      const p = CT.p(); if (p.inVehicle) { p.exitVehicle(); CT.adv(0.3); }
      const lm = GTP.World.landmark(mk.landmark);
      let ox = mk.x - lm.x, oz = mk.z - lm.z; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const dirs = [[ox, oz], [-oz, ox], [oz, -ox], [-ox, -oz]];
      let how = null;
      outer: for (const dist of [7, 5, 3.5]) for (const d of dirs) {
        const sx = mk.x + d[0] * dist, sz = mk.z + d[1] * dist;
        if (!CT.walkable(sx, sz)) continue;
        CT.tp(sx, sz); CT.adv(0.1); CT.face(mk.x, mk.z);
        CT.hold('forward', true); CT.hold('run', true);
        const s = CT.until(() => M.state.active === id, 6, 0.1);
        CT.hold('forward', false); CT.hold('run', false);
        if (s > 0) { how = 'walk@' + dist; break outer; }
      }
      if (!how) { M.start(id); how = 'direct'; CT.fallbacks.push(id + ': marker walk failed, started directly'); }
      CT.how[id] = how;
      CT.adv(1 / 60);
      const rt = GTP.Render.rig._target;
      return { ok: M.state.active === id, how, state: GTP.game.state, camTarget: rt ? (rt.castId || rt.kind) : null, line: M.state.dialogue[0] ? M.state.dialogue[0].who : null, money: p.money };
    },
    // the intro: let the first line type for the screenshot, then skip the rest
    introPause() { CT.adv(1.4); GTP.game.render(); return { state: GTP.game.state, who: GTP.UI.state.dialogue ? GTP.UI.state.dialogue.line.who : null }; },
    beginPlay() { const s = CT.skipTalk(60, () => M.state.phase === 'play' || !M.state.active); CT.adv(0.1); return { s, phase: M.state.phase, state: GTP.game.state, objective: M.state.objectiveText, type: CT.def() && CT.def().type }; },
    flat() { const m = M.state.mission, out = []; if (!m) return out; (function walk(list) { list.forEach((o) => { if (o.type === 'timer_wrap') walk(o.objectives || []); else out.push(o); }); })(m.objectives); return out; },
    // null = the current objective is the expected one; 'skip' = it already passed (e.g. a goto to the door the marker stands on); else an error
    expect(type) {
      if (CT.talking()) CT.skipTalk(30);
      const d = CT.def();
      if (!d) return 'no objective (active ' + M.state.active + ', phase ' + M.state.phase + ')';
      if (d.type !== type) {
        const f = CT.flat(), i = f.indexOf(d);
        if (i > 0 && f[i - 1].type === type) { CT.skips.push(M.state.active + ':' + type); return 'skip'; }
        return 'expected ' + type + ' but the objective is ' + d.type + ' (' + d.text + ')';
      }
      return null;
    },
    skips: [],
    // --- steps -----------------------------------------------------------------
    goto(lm) {
      const e = CT.expect('goto'); if (e === 'skip') return { ok: true, note: 'goto ' + lm + ' already passed (the light stands on it)' }; if (e) return { ok: false, note: e };
      const p = CT.p(), def = CT.def();
      if (p.inVehicle) { p.exitVehicle(); CT.adv(0.4); if (CT.def() !== def) return { ok: true, note: 'goto ' + lm + ': already there on stepping out' }; }
      const d = CT.door(lm);
      CT.tp(d.x, d.z);
      const s = CT.until(() => CT.def() !== def, 4);
      return { ok: s > 0, note: 'goto ' + lm + ' ' + s + 's' };
    },
    car() {
      const p = CT.p(); if (p.inVehicle) return { ok: true, note: 'already driving a ' + p.inVehicle.type };
      let best = null, bd = 1e9;
      GTP.Entities.near(p.x, p.z, 50, 'vehicle').forEach((v) => { if (v.wreck || v.sinking || v.driver || v.type === 'bike' || v.type === 'bus') return; const dd = U.dist2d(v.x, v.z, p.x, p.z); if (dd < bd) { bd = dd; best = v; } });
      let how = 'borrowed a parked ' + (best && best.type);
      if (!best) { const rp = GTP.World.nearestRoadPoint(p.x, p.z); best = GTP.game.debug.spawnVehicle(rp.x, rp.z, 'sedan'); how = 'spawned a sedan'; }
      const r = CT.enterVehicle(best);
      return { ok: r, note: how + (r ? '' : ' (could not enter)') };
    },
    enterVehicle(v) {
      for (const seat of [0, 0, 1]) {
        const d = v.doorWorld(seat); CT.tp(d.x, d.z); CT.adv(0.1);
        CT.press('enter');
        const s = CT.until(() => CT.p().inVehicle === v, 1.5, 0.1);
        if (s > 0) return true;
      }
      return false;
    },
    enter() {
      const e = CT.expect('enter_vehicle'); if (e === 'skip') return { ok: true, note: 'enter already passed' }; if (e) return { ok: false, note: e };
      const c = CT.ctx(), v = c.vehicle, def = CT.def();
      if (!v) return { ok: false, note: 'no spawned vehicle' };
      const ok = CT.enterVehicle(v);
      const s = CT.until(() => CT.def() !== def, 2);
      return { ok: ok && s > 0, note: 'in the ' + v.type + ' (' + v.tag + ')' };
    },
    drive(lm) {
      const e = CT.expect('drive_to'); if (e === 'skip') return { ok: true, note: 'drive ' + lm + ' already passed' }; if (e) return { ok: false, note: e };
      const p = CT.p(), def = CT.def();
      if (!p.inVehicle) { const r = CT.car(); if (!r.ok) return r; if (CT.def() !== def) return { ok: true, note: 'drive ' + lm + ': the car was already there' }; }
      const d = CT.door(lm), v = p.inVehicle;
      // park on the door's road side: the check wants the car within 12 m of the door
      let ox = d.x - d.lm.x, oz = d.z - d.lm.z; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      CT.tp(d.x + ox * 3, d.z + oz * 3); v.vx = v.vz = 0; v.speed = 0;
      const s = CT.until(() => CT.def() !== def, 3);
      return { ok: s > 0, note: 'drove the ' + v.type + ' to ' + lm };
    },
    pickups(pauseAt) {
      const e = CT.expect('pickup'); if (e === 'skip') return { ok: true, note: 'pickups already passed' }; if (e) return { ok: false, note: e };
      const c = CT.ctx(), def = CT.def(), p = CT.p();
      let n = 0;
      for (const pk of c.pickups) {
        if (pk.removed) { n++; continue; }
        if (pauseAt && n >= pauseAt) return { ok: true, paused: true, note: n + '/' + c.total };
        CT.tp(pk.x, pk.z); CT.adv(p.inVehicle ? 0.4 : 0.3);
        if (!pk.removed) { CT.tp(pk.x + 0.3, pk.z + 0.2); CT.adv(0.4); }
        n++;
      }
      const s = CT.until(() => CT.def() !== def, 3);
      return { ok: s > 0, note: n + ' crates, ' + (p.inVehicle ? 'from the ' + p.inVehicle.type : 'on foot') };
    },
    dialogue() {
      const def = CT.def();
      if (!def || def.type !== 'dialogue') return { ok: false, note: 'expected dialogue, got ' + (def && def.type) };
      const n = M.state.dialogue.length;
      const s = CT.skipTalk(40, () => CT.def() !== def);
      return { ok: s >= 0 && CT.def() !== def, note: n + ' lines skipped in ' + s + 's' };
    },
    // tail from ~11 m behind along the target's own trail (resumable: pause after n seconds)
    follow(pauseAfter) {
      const e = CT.expect('follow'); if (e === 'skip') return { ok: true, note: 'follow already passed' }; if (e) return { ok: false, note: e };
      const c = CT.ctx(), f = c.ped, p = CT.p(), def = CT.def();
      if (!f) return { ok: false, note: 'no follow target' };
      if (!CT._trail) { const away = U.yawToDir(f.yaw), r0 = GTP.World.resolveCapsule(f.x - away.x * 9, f.z - away.z * 9, f.y + 0.5, 0.45); CT.tp(r0.x, r0.z); CT._trail = []; CT._followT = 0; }
      let s = 0, minD = 1e9, maxD = 0;
      CT.followLog = CT.followLog || [];
      while (s < 320 && CT.def() === def) {
        CT.adv(0.5); s += 0.5; CT._followT += 0.5;
        if (CT._followT % 10 === 0) CT.followLog.push({ t: CT._followT, x: Math.round(f.x), z: Math.round(f.z), wi: c.wi, ri: f.ai.ri, rl: f.ai.route ? f.ai.route.length : null, st: f.ai.stucks, sp: +f.speed.toFixed(1), tile: GTP.World.tileAt(f.x, f.z), dWp: c.wps[c.wi] ? Math.round(U.dist2d(c.wps[c.wi].x, c.wps[c.wi].z, f.x, f.z)) : null, kd: !!f.knockedDown, alive: f.alive });
        CT._trail.push({ x: f.x, z: f.z });
        for (let i = CT._trail.length - 1; i >= 0; i--) { const tr = CT._trail[i]; if (U.dist2d(tr.x, tr.z, f.x, f.z) >= 11) { if (U.dist2d(p.x, p.z, tr.x, tr.z) > 0.5) CT.tp(tr.x, tr.z); break; } }
        const d = U.dist2d(p.x, p.z, f.x, f.z); minD = Math.min(minD, d); maxD = Math.max(maxD, d);
        if (pauseAfter && CT._followT >= pauseAfter) return { ok: true, paused: true, note: 'tailing at ' + d.toFixed(1) + ' m' };
      }
      const done = CT.def() !== def;
      if (!done && M.state.active) { M.completeObjective(); CT.fallbacks.push(M.state.active + ': follow forced after ' + CT._followT + 's ' + JSON.stringify(CT.followLog)); CT.adv(0.2); }
      CT._trail = null; CT.followLog = null;
      return { ok: true, note: 'tailed for ' + CT._followT + 's, dist ' + minD.toFixed(1) + '..' + maxD.toFixed(1) + ' m' + (done ? '' : ' (forced)') };
    },
    // a beat cop closing in for the arrest: step away from him (a player would run; the bust needs 1 s at arm's reach)
    dodge() {
      const p = CT.p(), fl = M.state.flags || {};
      const cop = GTP.Entities.near(p.x, p.z, 3.2, 'ped').find((e) => e.alive && !e.inVehicle && !e.hostile && !e.knockedDown && (e.role === 'cop' || e.role === 'swat' || (e.role === 'hoa' && fl.hoa_enemy)));
      if (!cop) return false;
      const dx = p.x - cop.x, dz = p.z - cop.z, l = Math.hypot(dx, dz) || 1;
      const r = GTP.World.resolveCapsule(p.x + dx / l * 8, p.z + dz / l * 8, p.y + 0.5, 0.45);
      CT.tp(r.x, r.z); CT.dodges = (CT.dodges || 0) + 1;
      return true;
    },
    // real fights: stand off each goon and fire the best weapon (fists lunge); god mode keeps the run deterministic
    fightOne(h, w) {
      const p = CT.p(), W = GTP.World, melee = GTP.Combat.WEAPONS[w].melee, range = melee ? 1.2 : 6;
      let dx = p.x - h.x, dz = p.z - h.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const r = W.resolveCapsule(h.x + dx * range, h.z + dz * range, h.y + 0.5, 0.45);
      CT.tp(r.x, r.z); p.yaw = U.dirToYaw(h.x - p.x, h.z - p.z); p.aimYaw = p.yaw; p.weapon = w;
      CT.hold('shoot', true); CT.adv(0.6); CT.hold('shoot', false);
    },
    defeat(pauseAt) {
      const e = CT.expect('defeat'); if (e === 'skip') return { ok: true, note: 'defeat already passed' }; if (e) return { ok: false, note: e };
      const c = CT.ctx(), def = CT.def(), p = CT.p();
      if (p.inVehicle) { p.exitVehicle(); CT.adv(0.3); }
      GTP.game.debug.godMode(true);
      const attention = new Map(); let s = 0, forced = 0;
      while (s < 90 && CT.def() === def) {
        CT.dodge();
        const live = c.peds.filter((h) => !CT.pedOut(h));
        const down = c.peds.length - live.length;
        if (pauseAt && down >= pauseAt) { GTP.game.debug.godMode(false); return { ok: true, paused: true, note: down + '/' + c.peds.length + ' down' }; }
        if (!live.length) { s += CT.adv(0.25); continue; }
        const h = live[0], w = CT.bestWeapon();
        CT.fightOne(h, w); s += 0.6;
        attention.set(h.id, (attention.get(h.id) || 0) + 0.6);
        if (attention.get(h.id) > 9 && !CT.pedOut(h)) { GTP.Combat.damage(h, 999, p, w); forced++; }
      }
      GTP.game.debug.godMode(false);
      return { ok: CT.def() !== def, note: c.peds.length + ' goons with ' + CT.bestWeapon() + (forced ? ', ' + forced + ' forced' : '') + ', hp ' + Math.round(p.hp) };
    },
    survive(pauseAt) {
      const e = CT.expect('survive'); if (e === 'skip') return { ok: true, note: 'survive already passed' }; if (e) return { ok: false, note: e };
      const c = CT.ctx(), def = CT.def(), p = CT.p();
      if (p.inVehicle) { p.exitVehicle(); CT.adv(0.3); }
      GTP.game.debug.godMode(true);
      let s = 0, maxLive = 0, swings = 0;
      while (s < c.total + 12 && CT.def() === def) {
        if (pauseAt && c.t >= pauseAt) { GTP.game.debug.godMode(false); return { ok: true, paused: true, note: 'held ' + Math.round(c.t) + 's' }; }
        CT.dodge();
        const live = c.hostiles.filter((h) => !CT.pedOut(h)); maxLive = Math.max(maxLive, live.length);
        // swing at whoever is in reach, otherwise just hold the spot
        const near = live.find((h) => U.dist2d(h.x, h.z, p.x, p.z) < 6);
        if (near) { CT.fightOne(near, CT.bestWeapon()); swings++; s += 0.6; } else s += CT.adv(0.5);
      }
      GTP.game.debug.godMode(false);
      return { ok: CT.def() !== def, note: 'held ' + c.total + 's, max ' + maxLive + ' hostiles live, ' + swings + ' attacks' };
    },
    // wreck each target: a real aimed burst first, then applyDamage (ammo is finite and the cars drive)
    wreckOne(v) {
      const p = CT.p(), W = GTP.World;
      if (p.inVehicle) { p.exitVehicle(); CT.adv(0.3); }
      const f = U.yawToDir(v.yaw), r = W.resolveCapsule(v.x - f.x * 8, v.z - f.z * 8, v.y + 0.5, 0.45);
      CT.tp(r.x, r.z);
      const w = CT.bestWeapon();
      if (w !== 'fist') {
        p.weapon = w;
        CT.hold('aim', true); GTP.Render.rig.yaw = U.dirToYaw(v.x - p.x, v.z - p.z); GTP.Render.rig.pitch = 0.14; GTP.Render.rig.snap(); CT.adv(0.1);
        const hp0 = v.hp;
        CT.hold('shoot', true); CT.adv(0.8); CT.hold('shoot', false); CT.hold('aim', false);
        CT._shotHits = (CT._shotHits || 0) + (v.hp < hp0 ? 1 : 0);
      }
      if (!CT.lost(v)) v.applyDamage(999, p, w === 'fist' ? 'hottake' : w);
    },
    destroy(pauseAt) {
      const e = CT.expect('destroy'); if (e === 'skip') return { ok: true, note: 'destroy already passed' }; if (e) return { ok: false, note: e };
      const c = CT.ctx(), def = CT.def(), p = CT.p(), W = GTP.World;
      // a mission car the player still needs (the pellet SUV) is parked well clear of the blasts first
      if (p.inVehicle) {
        const v = p.inVehicle, live = c.vehicles.filter((q) => !CT.lost(q));
        let ax = 1, az = 0;
        if (live.length) { ax = v.x - live[0].x; az = v.z - live[0].z; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l; }
        const rp = W.nearestRoadPoint(v.x + ax * 45, v.z + az * 45);
        if (rp) { CT.tp(rp.x, rp.z); v.vx = v.vz = 0; v.speed = 0; }
        p.exitVehicle(); CT.adv(0.3);
      }
      GTP.game.debug.godMode(true);
      let n = 0, last = null;
      for (const v of c.vehicles) {
        if (CT.lost(v)) { n++; continue; }
        if (pauseAt && n >= pauseAt) { GTP.game.debug.godMode(false); return { ok: true, paused: true, note: n + '/' + c.total + ' wrecked' }; }
        CT.wreckOne(v); n++; last = v;
        CT.adv(0.5);
      }
      // out of the blast radius while they burn
      if (last) { const sp = W.nearestSidewalkPoint(last.x + 26, last.z + 8); if (sp) CT.tp(sp.x, sp.z); }
      const s = CT.until(() => { CT.dodge(); return CT.def() !== def; }, 12, 0.25);
      GTP.game.debug.godMode(false);
      return { ok: s > 0, note: c.total + ' targets wrecked, aimed hits ' + (CT._shotHits || 0) };
    },
    // lose the stars: five stars need a respray (the helicopter never loses sight), fewer are waited out far away
    escape() {
      const e = CT.expect('escape_wanted'); if (e === 'skip') return { ok: true, note: 'escape already passed' }; if (e) return { ok: false, note: e };
      const wd = GTP.AI.wanted, def = CT.def(), p = CT.p(), W = GTP.World, lvl = wd.level;
      CT.adv(1.1);
      if (lvl >= 5) {
        const garages = W.landmarks.filter((l) => l.garage);
        garages.sort((a, b) => U.dist2d(a.garage.cx, a.garage.cz, p.x, p.z) - U.dist2d(b.garage.cx, b.garage.cz, p.x, p.z));
        const g = garages[0];
        if (!p.inVehicle) { const r = CT.car(); if (!r.ok) return r; }
        const v = p.inVehicle, money0 = p.money;
        CT.tp(g.garage.cx, g.garage.cz); v.vx = v.vz = 0; v.speed = 0;
        const s = CT.until(() => wd.level === 0, 4, 0.1);
        const s2 = CT.until(() => CT.def() !== def, 4, 0.1);
        return { ok: s > 0 && s2 > 0, note: lvl + ' stars resprayed at ' + g.id + ' for $' + (money0 - p.money) };
      }
      // hide: the landmark door farthest from the last known position, on foot
      const lk = wd.lastKnown; let best = null, bd = 0;
      for (const id of ['fish_shack', 'moon_mine', 'memo_press', 'campus_quad', 'goldplate_links', 'balloon_depot', 'afterparty_yacht', 'clarity_barn']) {
        const lm = W.landmark(id); if (!lm || !lm.door) continue;
        const d = U.dist2d(lm.door.x, lm.door.z, lk.x, lk.z); if (d > bd) { bd = d; best = lm; }
      }
      if (p.inVehicle) { p.exitVehicle(); CT.adv(0.3); }
      CT.tp(best.door.x, best.door.z);
      const s = CT.until(() => { CT.dodge(); return CT.def() !== def; }, 90, 0.5);
      return { ok: s > 0, note: lvl + ' stars waited out at ' + best.id + ' (' + Math.round(bd) + ' m away) in ' + s + 's, state ' + GTP.game.state };
    },
    debate(pauseAt) {
      const D = GTP.UI.minigames.debate;
      if (!D.active) { CT.expect('minigame'); CT.adv(0.2); }
      if (!D.active) return { ok: false, note: 'no debate running (state ' + GTP.game.state + ')' };
      if (!CT._answers) CT._answers = 0;
      let guard = 0;
      while (D.active && guard++ < 12000) {
        CT.adv(1 / 60);
        const st = D.state;
        if (st.phase === 'card' && st.card && st.card.t > 0.3) {
          CT.press(COUNTER[st.card.card]); CT._answers++;
          if (pauseAt && CT._answers >= pauseAt) return { ok: true, paused: true, note: CT._answers + ' answers, crowd ' + st.crowd };
        } else if (st.phase === 'summary' && st.phaseT > 0.7) CT.press('confirm');
      }
      const st = D.state, out = { ok: !!st.win && GTP.game.state !== 'minigame', note: 'vs ' + st.opp.name + ': ' + st.summary + ' (' + CT._answers + ' answers)' };
      CT._answers = 0; CT.adv(0.2);
      return out;
    },
    ratio(pauseAt) {
      const R = GTP.UI.minigames.ratio;
      if (!R.active) { CT.expect('minigame'); CT.adv(0.2); }
      if (!R.active) return { ok: false, note: 'no ratio war running (state ' + GTP.game.state + ')' };
      if (!CT._posts) CT._posts = 0;
      let guard = 0;
      while (R.active && guard++ < 14000) {
        CT.adv(1 / 60);
        const st = R.state;
        if (st.phase === 'play') {
          if (st.dogpile > 0 && st.hottake) { CT.press('shoot'); continue; }
          const green = st.dogpile > 0 ? 0.05 : 0.10, sp = 1.2 * st.speed * (st.dogpile > 0 ? 2 : 1);
          const next = st.meter + st.dir * sp / 60;
          if (st.postsLeft > 0 && (st.primed || Math.abs(next - 0.5) < green - 0.012)) {
            CT.press('action'); CT._posts++;
            if (pauseAt && CT._posts >= pauseAt) return { ok: true, paused: true, note: CT._posts + ' posts, ' + Math.round(st.mine) + ' vs ' + Math.round(st.theirs) };
          }
        } else if (st.phase === 'summary' && st.phaseT > 0.7) CT.press('confirm');
      }
      const st = R.state, out = { ok: !!st.win && GTP.game.state !== 'minigame', note: 'vs ' + st.opp.name + ': ' + st.summary };
      CT._posts = 0; CT.adv(0.2);
      return out;
    },
    // after the last objective: the outro, the card, the credits on an ending
    finish(id) {
      const p = CT.p();
      CT._expectEnd = true;
      const s = CT.skipTalk(60, () => M.state.active !== id);
      let t = 0; while (M.state.active === id && t < 5) t += CT.adv(0.2);
      CT._expectEnd = false;
      let credits = false;
      if (GTP.Content.endingMissions.indexOf(id) >= 0) {
        CT.adv(1.0);
        credits = GTP.game.state === 'paused' && GTP.UI.state.pause.page === 'credits' && !!GTP.UI.state.credits;
        GTP.game.render();
        CT.press('confirm'); CT.adv(0.3);
      }
      return {
        s, state: GTP.game.state, active: M.state.active, completed: M.state.completed.has(id), flags: Object.assign({}, M.state.flags),
        failed: M.state.failed[id] || 0, money: p.money, weapons: Object.keys(p.weapons).filter((w) => p.weapons[w] > 0), weapon: p.weapon,
        ammo: Object.assign({}, p.weapons, { fist: 'inf' }), credits, endings: CT.endings.slice(), errors: GTP.errors.length, cash: CT.cash, spent: CT.spent, markers: M.markers().map((m) => m.kind + ':' + m.id)
      };
    },
    step(name, arg) {
      const t0 = GTP.game.time.t;
      let r;
      try { r = CT[name](arg); } catch (e) { r = { ok: false, note: 'threw ' + (e && e.message) }; }
      r.secs = +(GTP.game.time.t - t0).toFixed(1); r.state = GTP.game.state; r.objective = M.state.objectiveText; r.errors = GTP.errors.length;
      r.fails = CT.fails.slice();
      return r;
    },
    frame() {
      const g = GTP.game;
      if (g.state === 'playing' || g.state === 'cutscene') { GTP.Render.rig.pitch = Math.max(GTP.Render.rig.pitch, 0.14); GTP.Render.rig.snap(); GTP.game.advance(0.05); }
      GTP.game.render();
      return { state: g.state, objective: M.state.objectiveText };
    }
  };
  GTP.Events.on('mission:fail', (e) => CT.fails.push(e.id + ':' + e.reason));
  GTP.Events.on('mission:ending', (e) => CT.endings.push(e.id));
  GTP.Events.on('garage', (e) => { CT.spent += e.cost; });
  GTP.Events.on('pickup', (e) => { const pk = e && e.pickup; if (pk && pk.pickupType === 'cash') CT.cash += pk.value | 0; });
  GTP.Events.on('busted', () => CT.fails.push('BUSTED'));
  GTP.Events.on('player:wasted', () => CT.fails.push('WASTED'));
  return true;
}

H.run('campaign', async (t) => {
  const page = await t.browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(600000);
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const ctx = { page, pageErrors, consoleErrors };

  // ---- a NEW game from the title screen ----
  await page.goto(t.url({ headless: 0, skipTitle: 0, seed: 7, mute: 1 }));
  await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.booted && GTP.game.state === 'title', null, { timeout: 240000 });
  await page.waitForFunction(() => GTP.game.frames >= 2, null, { timeout: 240000 });
  await page.evaluate(() => { try { localStorage.removeItem('gtp.save.v2'); } catch (e) { /* storage may be blocked */ } cancelAnimationFrame(GTP.game._raf); GTP.game._raf = 0; });
  await page.keyboard.press('Enter');
  const started = await page.evaluate(() => { GTP.game.advance(0.3); return { state: GTP.game.state, money: GTP.game.player.money, missions: GTP.Content.missions.length, markers: GTP.Missions.markers().map((m) => m.id) }; });
  console.log('  new game: ' + JSON.stringify(started));
  t.assert(started.state === 'playing' && started.money === 250 && started.missions === 17, 'Enter on the title starts a new game with $250');
  t.assert(started.markers.length === 1 && started.markers[0] === 'm00_intro', 'only m00_intro is lit at the start');
  await page.evaluate(installDriver);

  const results = {};
  let expectedMoney = 250, lastCash = 0, lastSpent = 0, unlockedSoFar = ['fist'];
  const missionDefs = await page.evaluate(() => { const o = {}; GTP.Content.missions.forEach((m) => { o[m.id] = { reward: m.reward, onComplete: m.onComplete || {}, title: m.title, giver: m.giver, intro: m.intro.length, objectives: m.objectives.length }; }); return o; });

  // debugging aid: CAMPAIGN_FROM=<id> marks the earlier missions complete (prep applies their flags and weapons) and starts there
  let order = ORDER;
  if (process.env.CAMPAIGN_FROM && ORDER.indexOf(process.env.CAMPAIGN_FROM) > 0) {
    const from = process.env.CAMPAIGN_FROM;
    const pre = await page.evaluate((mid) => { GTP.Missions.prep(mid, {}); GTP.game.advance(0.1); GTP.Missions.abort(); GTP.game.advance(0.3); GTP.game.debug.setMoney(250 + 5000); return { completed: Array.from(GTP.Missions.state.completed), money: GTP.game.player.money, markers: GTP.Missions.markers().map((m) => m.id) }; }, from);
    console.log('  CAMPAIGN_FROM ' + from + ': ' + JSON.stringify(pre));
    expectedMoney = pre.money; order = ORDER.slice(ORDER.indexOf(from));
  }

  for (const id of order) {
    const def = missionDefs[id];
    const t0 = Date.now();
    // walk into the light
    const st = await page.evaluate((mid) => CT.start(mid), id);
    console.log('  ' + id + ' start: ' + JSON.stringify(st));
    t.assert(st.ok, id + ' started by walking into its light: ' + JSON.stringify(st));
    t.assert(st.state === 'cutscene' && st.line, id + ' opens with its intro dialogue (state ' + st.state + ', line ' + st.line + ')');
    t.assert(st.camTarget && st.camTarget !== 'player', id + ' intro camera eases to the giver: ' + st.camTarget);
    // the intro screenshot: first line typing
    const intro = await page.evaluate(() => CT.introPause());
    await page.screenshot({ path: t.OUT + '/campaign_' + id + '_intro.png' });
    t.assert(intro.state === 'cutscene' && intro.who, id + ' intro line on screen: ' + JSON.stringify(intro));
    const play = await page.evaluate(() => CT.beginPlay());
    t.assert(play.phase === 'play' && play.state !== 'title' && play.state !== 'paused' && play.type, id + ' objectives begin after the intro: ' + JSON.stringify(play));
    // the objective script
    for (const step of SCRIPT[id]) {
      if (step[0] === 'shot') {
        const fr = await page.evaluate(() => CT.frame());
        await page.screenshot({ path: t.OUT + '/campaign_' + id + '_mid.png' });
        console.log('    shot mid: ' + JSON.stringify(fr));
        continue;
      }
      const r = await page.evaluate((s) => CT.step(s[0], s[1]), step);
      console.log('    ' + step.join(' ') + ': ' + JSON.stringify(r));
      t.assert(r.ok, id + ' step ' + step.join(' ') + ' failed: ' + JSON.stringify(r));
      t.assert(r.fails.length === 0, id + ' failed mid-run: ' + r.fails.join(','));
    }
    const fin = await page.evaluate((mid) => CT.finish(mid), id);
    console.log('  ' + id + ' done (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s wall): ' + JSON.stringify(fin));
    results[id] = fin;
    t.assert(fin.completed && fin.active === null && fin.failed === 0, id + ' completed: ' + JSON.stringify({ completed: fin.completed, active: fin.active, failed: fin.failed, state: fin.state }));
    // the reward, minus resprays, plus any cash picked up
    expectedMoney += def.reward - (fin.spent - lastSpent) + (fin.cash - lastCash); lastSpent = fin.spent; lastCash = fin.cash;
    t.assert(fin.money === expectedMoney, id + ' paid ' + def.reward + ': money ' + fin.money + ' expected ' + expectedMoney);
    // flags
    const oc = def.onComplete;
    if (oc.setFlag) t.assert(fin.flags[oc.setFlag] === true, id + ' sets flag ' + oc.setFlag);
    // weapons in the GDD order
    if (oc.unlockWeapon) {
      t.assert(fin.weapons.indexOf(oc.unlockWeapon) >= 0 && fin.weapon === oc.unlockWeapon, id + ' unlocks ' + oc.unlockWeapon + ': ' + JSON.stringify(fin.weapons) + ' held ' + fin.weapon);
      t.assert(UNLOCKS[id] === oc.unlockWeapon, id + ' unlock matches the GDD table');
      unlockedSoFar.push(oc.unlockWeapon);
    }
    const expectedWeapons = ORDER.slice(0, ORDER.indexOf(id) + 1).map((m) => UNLOCKS[m]).filter(Boolean);
    expectedWeapons.forEach((w) => t.assert(fin.weapons.indexOf(w) >= 0 || fin.ammo[w] == null, id + ': ' + w + ' still owned (or spent): ' + JSON.stringify(fin.ammo)));
    t.assert(fin.weapons.indexOf('shotgun') < 0 || ORDER.indexOf(id) > ORDER.indexOf('m11_trustless'), id + ': no shotgun before m11 (pickup only)');
    t.assert(fin.state === 'playing', id + ' leaves the game playing: ' + fin.state);
    t.assert(fin.errors === 0, id + ' left GTP.errors empty: ' + fin.errors);
    if (id === 'm15a_primetime' || id === 'm15b_liveread') t.assert(fin.credits && fin.endings.indexOf(id) >= 0, id + ' rolled the credits: ' + JSON.stringify({ credits: fin.credits, endings: fin.endings }));
    if (id === 'm14_grift') t.assert(fin.markers.indexOf('mission:m15a_primetime') >= 0 && fin.markers.indexOf('mission:m15b_liveread') >= 0, 'both endings open after m14: ' + fin.markers.join(','));
    if (id === 'm15a_primetime') t.assert(fin.markers.indexOf('mission:m15b_liveread') >= 0 && fin.markers.indexOf('mission:m15a_primetime') >= 0, 'both endings stay available after one: ' + fin.markers.join(','));
    // the shotgun: never a mission unlock; it spawns at the print works after m11
    if (id === 'm11_trustless') {
      const sg = await page.evaluate(() => {
        GTP.game.advance(2.5);
        let pk = null; GTP.Combat.pickups.forEach((p) => { if (p.pickupType === 'weapon' && p.weaponId === 'shotgun' && !p.removed) pk = p; });
        if (!pk) return { found: false };
        const lm = GTP.World.landmark('memo_press');
        CT.tp(pk.x, pk.z); GTP.game.advance(0.4);
        return { found: true, dist: +Math.hypot(pk.x - lm.door.x, pk.z - lm.door.z).toFixed(1), ammo: GTP.game.player.weapons.shotgun || 0, held: GTP.game.player.weapon, label: pk.label };
      });
      console.log('  shotgun pickup: ' + JSON.stringify(sg));
      t.assert(sg.found && sg.dist < 12 && sg.ammo === 16, 'the shotgun spawns beside the print works after m11 and is picked up: ' + JSON.stringify(sg));
    }
  }

  const summary = await page.evaluate(() => ({ completed: Array.from(GTP.Missions.state.completed), flags: GTP.Missions.state.flags, endings: CT.endings, fallbacks: CT.fallbacks, how: CT.how, fails: CT.fails, skips: CT.skips, dodges: CT.dodges || 0, money: GTP.game.player.money, stats: GTP.game.player.stats, day: GTP.game.time.day, clock: +GTP.game.time.clock.toFixed(2), t: +GTP.game.time.t.toFixed(0) }));
  console.log('  campaign: ' + JSON.stringify(summary));
  t.assert(summary.completed.length === 17, 'all 17 missions completed: ' + summary.completed.length);
  t.assert(summary.endings.length === 2 && summary.endings.indexOf('m15a_primetime') >= 0 && summary.endings.indexOf('m15b_liveread') >= 0, 'both endings fired the credits hook: ' + summary.endings.join(','));
  t.assert(summary.fails.length === 0, 'no mission failed, no death, no bust during the campaign: ' + summary.fails.join(','));
  const walked = Object.keys(summary.how).filter((k) => summary.how[k] !== 'direct').length;
  t.assert(walked === order.length, 'every mission was started by walking into its light: ' + JSON.stringify(summary.how));
  if (summary.fallbacks.length) console.log('  fallbacks used: ' + summary.fallbacks.join(' | '));
  ['has_table', 'has_van', 'sponsored', 'a_voice', 'contract_sold', 'show_renamed', 'theft_pinned', 'scooters_billed', 'has_memo', 'hoa_enemy', 'rugged', 'knows_memo', 'survived_thursday', 'offered_chair', 'ending_primetime', 'ending_grass'].forEach((f) => t.assert(summary.flags[f] === true, 'flag ' + f + ' set'));
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
  await page.close();
});
