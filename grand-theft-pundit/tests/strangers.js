/* strangers.js: the ten "Strangers" side strands (js/26_content_strangers.js).
 *  1 schema: ten strands, each with a cast-resolved eccentric, a home landmark in its district, two or three missions in the
 *    story mission schema (registered into GTP.Missions.allMissions() through GTP.Content.expansion.missions), intro and
 *    outro dialogue, rewards, an epilogue line; every landmark, landmark point, giver, dialogue speaker, ped, vehicle type,
 *    weapon id, minigame opponent and stunt ramp resolves; only existing objective types; `spawned:<tag>` and
 *    `vehicle_lost:<tag>` name a tag the mission spawns; the requires graph is a DAG; each strand's first mission waits for
 *    the story mission whose onComplete sets the strand's unlock flag; the homes and the objectives cover all eleven districts
 *  2 a new game shows no stranger marker; after the unlock mission the home marker appears at the home door with the
 *    eccentric standing at it
 *  3 every strand mission is started by walking into its blue light, its intro is shown with the giver's portrait line, and
 *    its objectives are driven to completion through the real checks headless (debug teleports stand in for the driving;
 *    fights, tails, pickups, stops, passengers, races, stunts, escapes and both minigames run through the real code);
 *    the reward is paid, the flags are set, a finished strand emits its epilogue and reads 'done'
 *  4 replay, the phone's completed list and the save carry the strand missions; GTP.errors stays empty
 * Screenshots: tests/out/strangers_home_<strand>.png (the first home marker with its eccentric), strangers_mid_<id>.png.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/strangers.js
 *   STRANGERS_ONLY=<strand id>[,<strand id>] drives only those strands (the schema checks always run) */
'use strict';
const H = require('./_harness');

const ALLOWED_TYPES = ['goto', 'drive_to', 'enter_vehicle', 'pickup', 'follow', 'escape_wanted', 'survive', 'destroy', 'defeat', 'dialogue', 'minigame', 'timer_wrap',
  'equip', 'deliver_passenger', 'stop_vehicle', 'stunt', 'race', 'collect_any', 'cutscene', 'shop'];

function installDriver() {
  const U = GTP.util, M = GTP.Missions;
  const COUNTER = { FACT: 'forward', FEELING: 'left', GOTCHA: 'right', ANECDOTE: 'back' };
  const ST = window.ST = {
    log: [], events: [], epilogues: [], fails: [], retries: [],
    p() { return GTP.game.player; },
    adv(s) { GTP.game.advance(s); return s; },
    press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
    hold(a, on) { GTP.Input.set(a, !!on); },
    tp(x, z, y) { GTP.game.debug.teleport(x, z, y); },
    def() { const c = M.current(); return c ? c.def : null; },
    ctx() { const c = M.current(); return c ? c.ctx : null; },
    talking() { return !!(M.dialogue && M.dialogue.active) || !!GTP.UI.state.dialogue; },
    pedOut(h) { return !h || h.removed || !h.alive || h.knockedDown || h.fled; },
    lost(v) { return !v || v.removed || v.wreck || v.sinking; },
    walkable(x, z) { const W = GTP.World, T = W.T, t = W.tileAt(x, z); return (t === T.SIDEWALK || t === T.PLAZA || t === T.GRASS || t === T.SAND || t === T.PARKING || t === T.ROAD) && !W.solidAt(x, z, 0.5); },
    target() { const t = M.objectiveTarget(); return t ? { x: t.x, z: t.z, y: t.y } : null; },
    until(pred, maxSec, step) { step = step || 0.1; let s = 0; while (s < maxSec) { GTP.game.advance(step); s += step; if (pred()) return s; } return -1; },
    skipTalk(maxSec, stop) {
      stop = stop || (() => !ST.talking() && GTP.game.state !== 'cutscene');
      let s = 0;
      while (s < maxSec) {
        if (stop()) return s;
        if (GTP.Cutscenes && GTP.Cutscenes.active) { ST.hold('confirm', true); ST.adv(0.8); ST.hold('confirm', false); s += 0.8; continue; }
        const d = GTP.UI.state.dialogue;
        if (d && d.t > 0.15) ST.press('confirm');
        s += ST.adv(0.15);
      }
      return stop() ? s : -1;
    },
    bestWeapon() {
      const w = ST.p().weapons, d = ST.def();
      if (d && d.weapon) return d.weapon;
      for (const id of ['smg', 'pistol', 'shotgun', 'rifle', 'revolver', 'tableleg']) if (w[id] > 0) return id;
      return 'fist';
    },
    hasRounds(w) { const n = ST.p().weapons[w]; return n === Infinity || n > 0; },
    face(x, z) { const p = ST.p(), yaw = U.dirToYaw(x - p.x, z - p.z); p.yaw = yaw; p.moveYaw = yaw; GTP.Render.rig.yaw = yaw; GTP.Render.rig.pitch = 0.16; GTP.Render.rig.snap(); GTP.Render.updateCamera(0); },
    dodge() {
      const p = ST.p(), fl = M.state.flags || {};
      const cop = GTP.Entities.near(p.x, p.z, 3.2, 'ped').find((e) => e.alive && !e.inVehicle && !e.hostile && !e.knockedDown && (e.role === 'cop' || e.role === 'swat' || (e.role === 'hoa' && fl.hoa_enemy)));
      if (!cop) return false;
      const dx = p.x - cop.x, dz = p.z - cop.z, l = Math.hypot(dx, dz) || 1;
      const r = GTP.World.resolveCapsule(p.x + dx / l * 8, p.z + dz / l * 8, p.y + 0.5, 0.45);
      ST.tp(r.x, r.z);
      return true;
    },
    loseStars() {
      const wd = GTP.AI.wanted, p = ST.p(), W = GTP.World; if (!wd.level) return 0;
      if (p.inVehicle) { p.exitVehicle(); ST.adv(0.3); }
      const lk = wd.lastKnown; let best = null, bd = 0;
      for (const lid of ['fish_shack', 'moon_mine', 'memo_press', 'campus_quad', 'goldplate_links', 'balloon_depot', 'afterparty_yacht', 'clarity_barn', 'hangar_row', 'heirloom_club']) {
        const lm = W.landmark(lid); if (!lm || !lm.door) continue;
        const d = U.dist2d(lm.door.x, lm.door.z, lk.x, lk.z); if (d > bd) { bd = d; best = lm; }
      }
      ST.tp(best.door.x, best.door.z);
      return ST.until(() => { ST.dodge(); return wd.level === 0; }, 90, 0.5);
    },
    enterVehicle(v) {
      for (const seat of [0, 0, 1]) {
        const d = v.doorWorld(seat); ST.tp(d.x, d.z); ST.adv(0.1);
        ST.press('enter');
        if (ST.until(() => ST.p().inVehicle === v, 1.5, 0.1) > 0) return true;
      }
      return false;
    },
    car() {
      const p = ST.p(); if (p.inVehicle) return true;
      const cands = GTP.Entities.near(p.x, p.z, 50, 'vehicle').filter((v) => !v.wreck && !v.sinking && !v.driver && !v.locked && v.type !== 'bike' && v.type !== 'bus' && v.type !== 'truck' && !v.mission);
      cands.sort((a, b) => U.dist2d(a.x, a.z, p.x, p.z) - U.dist2d(b.x, b.z, p.x, p.z));
      for (const v of cands.slice(0, 3)) if (ST.enterVehicle(v)) return true;
      const rp = GTP.World.nearestRoadPoint(p.x, p.z), sv = GTP.game.debug.spawnVehicle(rp.x, rp.z, 'sedan');
      return ST.enterVehicle(sv);
    },
    // the vehicle a `spawned:<tag>` reference names: the one the player sits in, else the newest live one with the tag
    tagged(def) {
      const m = def && typeof def.vehicle === 'string' && /^spawned:/.exec(def.vehicle); if (!m) return null;
      const tag = def.vehicle.slice(8), p = ST.p();
      const live = GTP.Entities.list.filter((e) => e.kind === 'vehicle' && e.tag === tag && !e.removed && !e.wreck);
      if (p.inVehicle && live.indexOf(p.inVehicle) >= 0) return p.inVehicle;
      return live.length ? live[live.length - 1] : null;
    },
    ensureVehicle(def) {
      const p = ST.p(), want = ST.tagged(def);
      if (want && p.inVehicle !== want) { if (p.inVehicle) { p.exitVehicle(); ST.adv(0.3); } if (!ST.enterVehicle(want)) return 'could not get into the ' + want.type + ' (' + want.tag + ')'; }
      if (!p.inVehicle && !ST.car()) return 'no car';
      return null;
    },
    // ---- one step per objective type: each returns a note; the loop checks that the objective moved on ----
    goto() {
      const p = ST.p(), def = ST.def();
      if (p.inVehicle) { p.exitVehicle(); ST.adv(0.4); if (ST.def() !== def) return 'there on stepping out'; }
      const c = ST.ctx(), d = c.target || ST.target(); if (!d) return 'no target';
      ST.tp(d.x, d.z);
      ST.until(() => ST.def() !== def, 4);
      return 'walked to ' + (c.target && c.target.name);
    },
    drive_to() {
      const def = ST.def(), err = ST.ensureVehicle(def); if (err) return err;
      if (ST.def() !== def) return 'already there';
      const v = ST.p().inVehicle, c = ST.ctx(), tg = c.target;
      let x = tg.x, z = tg.z;
      // park on the door's road side when the target is a landmark door
      if (tg.lm && !tg.point) { let ox = tg.x - tg.lm.x, oz = tg.z - tg.lm.z; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol; x += ox * 3; z += oz * 3; }
      ST.tp(x, z); v.vx = v.vz = 0; v.speed = 0;
      if (ST.until(() => ST.def() !== def, 3) < 0) { ST.tp(tg.x, tg.z); v.vx = v.vz = 0; v.speed = 0; ST.until(() => ST.def() !== def, 3); }
      return 'drove the ' + v.type + ' to ' + tg.name;
    },
    enter_vehicle() {
      const c = ST.ctx(), v = c.vehicle, def = ST.def();
      if (!v) return 'no spawned vehicle';
      const p = ST.p(); if (p.inVehicle && p.inVehicle !== v) { p.exitVehicle(); ST.adv(0.3); }
      const ok = ST.enterVehicle(v);
      ST.until(() => ST.def() !== def, 2);
      return (ok ? 'in the ' : 'FAILED to enter the ') + v.type + ' (' + v.tag + ')';
    },
    pickup() {
      const c = ST.ctx(), def = ST.def(), p = ST.p();
      let n = 0;
      for (const pk of c.pickups) {
        if (ST.def() !== def) break;
        if (pk.removed) { n++; continue; }
        ST.tp(pk.x, pk.z); ST.adv(p.inVehicle ? 0.4 : 0.3);
        if (!pk.removed) { ST.tp(pk.x + 0.3, pk.z + 0.2); ST.adv(0.4); }
        if (!pk.removed) { ST.tp(pk.x - 0.4, pk.z - 0.3); ST.adv(0.4); }
        n++;
      }
      ST.until(() => ST.def() !== def, 3);
      return n + '/' + c.total + ' ' + (c.label || 'crates') + (p.inVehicle ? ' from the ' + p.inVehicle.type : ' on foot');
    },
    collect_any() { return ST.pickup(); },
    dialogue() { const def = ST.def(), s = ST.skipTalk(40, () => ST.def() !== def); return 'lines skipped in ' + s + 's'; },
    equip() { const def = ST.def(); ST.adv(0.1); return 'equipped ' + def.weaponId + ' (' + ST.p().weapon + ')'; },
    deliver_passenger() {
      const c = ST.ctx(), def = ST.def(), p = ST.p(), f = c.ped;
      const err = ST.ensureVehicle(def); if (err) return err;
      const v = p.inVehicle;
      ST.tp(f.x + 3.2, f.z); v.vx = v.vz = 0; v.speed = 0;
      const s1 = ST.until(() => c.phase === 'ride', 8, 0.1);
      if (s1 < 0) { ST.tp(f.x - 3.2, f.z); v.vx = v.vz = 0; v.speed = 0; if (ST.until(() => c.phase === 'ride', 8, 0.1) < 0) return 'the passenger never boarded (phase ' + c.phase + ')'; }
      ST.adv(0.3);
      const to = c.to; ST.tp(to.x + 3, to.z); v.vx = v.vz = 0; v.speed = 0;
      const s2 = ST.until(() => ST.def() !== def, 6, 0.1);
      return f.castId + ' boarded, dropped at ' + to.name + (s2 > 0 ? '' : ' (not yet)');
    },
    stop_vehicle() {
      const c = ST.ctx(), def = ST.def(), p = ST.p(), v = c.v;
      if (!v) return 'no target vehicle';
      if (!p.inVehicle && !ST.car()) return 'no car';
      const x0 = v.x, z0 = v.z; ST.adv(2);
      const fled = Math.round(Math.hypot(v.x - x0, v.z - z0));
      let s = 0;
      while (s < 12 && ST.def() === def) { ST.tp(v.x + 3.2, v.z); v.vx = v.vz = 0; v.speed = 0; v.setControls(0, 0, true, 1); s += ST.adv(0.1); }
      return 'the ' + v.type + ' ran ' + fled + ' m, boxed in for ' + s.toFixed(1) + 's';
    },
    stunt() {
      const c = ST.ctx(), def = ST.def(), p = ST.p(), ramp = c.ramp;
      if (!ramp) return 'no ramp';
      const err = ST.ensureVehicle(def); if (err) return err;
      const v = p.inVehicle, f = U.yawToDir(ramp.yaw), runs = [];
      const L = (ev) => { runs.push('launch ' + (+(ev.speed || 0).toFixed(1))); }, D = (ev) => { runs.push('land ' + ev.airT + 's ' + (ev.ok ? 'ok' : ev.reason) + (ev.inZone ? '' : ' out')); };
      GTP.Events.on('stunt:launch', L); GTP.Events.on('stunt:land', D);
      // a player's run-up: stopped on the ramp's heading `back` metres out, throttle held to the wedge and through the landing
      let tries = 0;
      const plans = [45, 40, 50, 35, 55, 30];
      GTP.game.debug.godMode(true);
      while (tries < plans.length && ST.def() === def) {
        const back = plans[tries++];
        if (v.wreck || v.sinking) break;
        ST.tp(ramp.x - f.x * back, ramp.z - f.z * back, ramp.y); v.yaw = ramp.yaw; v.vx = v.vz = v.vy = 0; v.speed = 0; v.snap(); ST.adv(0.2);
        v.x = ramp.x - f.x * back; v.z = ramp.z - f.z * back; v.yaw = ramp.yaw; v.vx = v.vz = 0; v.speed = 0; v.snap();
        ST.hold('forward', true);
        const n0 = runs.length;
        ST.until(() => ST.def() !== def || runs.slice(n0).some((r) => /^land/.test(r)), 10, 0.1);
        ST.hold('forward', false);
        ST.hold('back', true); ST.until(() => Math.abs(v.speed) < 0.5 || v.sinking, 3, 0.1); ST.hold('back', false);
        ST.adv(0.5);
      }
      GTP.Events.off('stunt:launch', L); GTP.Events.off('stunt:land', D);
      GTP.game.debug.godMode(false);
      return ramp.id + ' after ' + tries + ' run(s): ' + runs.join(', ') + (v.wreck ? ' WRECKED' : '');
    },
    race() {
      const def = ST.def(), err = ST.ensureVehicle(def); if (err) return err;
      const Rc = GTP.Strands.races, v = ST.p().inVehicle;
      if (ST.until(() => Rc.active(), 3, 0.1) < 0 && !Rc.active()) return 'no race running';
      ST.until(() => Rc.hud().countdown <= 0, 6, 0.1);
      const r = Rc.cur, laps = r.laps;
      let guard = 0;
      while (Rc.active() && ST.def() === def && guard++ < laps * r.cps.length + 6) {
        const cp = Rc.nextCheckpoint(); if (!cp) break;
        ST.tp(cp.x, cp.z, cp.y); v.vx = v.vz = 0; v.speed = 0; ST.adv(0.2);
      }
      ST.until(() => ST.def() !== def, 3);
      return 'race through ' + r.cps.length + ' checkpoints x' + laps + ', field ' + r.racers.length;
    },
    follow() {
      const c = ST.ctx(), f = c.ped, p = ST.p(), def = ST.def();
      if (!f) return 'no follow target';
      if (p.inVehicle) { p.exitVehicle(); ST.adv(0.3); }
      const away = U.yawToDir(f.yaw), r0 = GTP.World.resolveCapsule(f.x - away.x * 9, f.z - away.z * 9, f.y + 0.5, 0.45);
      ST.tp(r0.x, r0.z);
      const trail = []; let s = 0, minD = 1e9, maxD = 0;
      while (s < 320 && ST.def() === def && M.state.active) {
        ST.adv(0.5); s += 0.5;
        trail.push({ x: f.x, z: f.z });
        for (let i = trail.length - 1; i >= 0; i--) { const tr = trail[i]; if (U.dist2d(tr.x, tr.z, f.x, f.z) >= 11) { if (U.dist2d(p.x, p.z, tr.x, tr.z) > 0.5) ST.tp(tr.x, tr.z); break; } }
        // a route that doubles back walks the target into the tail: a player steps away to keep the gap
        if (U.dist2d(p.x, p.z, f.x, f.z) < 8) {
          let ax = p.x - f.x, az = p.z - f.z; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
          for (const rot of [0, 0.6, -0.6, 1.2, -1.2, Math.PI]) {
            const c = Math.cos(rot), sn = Math.sin(rot), bx = ax * c - az * sn, bz = ax * sn + az * c;
            const r = GTP.World.resolveCapsule(f.x + bx * 12, f.z + bz * 12, f.y + 0.5, 0.45);
            if (ST.walkable(r.x, r.z) && U.dist2d(r.x, r.z, f.x, f.z) > 9) { ST.tp(r.x, r.z); trail.length = 0; break; }
          }
        }
        const d = U.dist2d(p.x, p.z, f.x, f.z); minD = Math.min(minD, d); maxD = Math.max(maxD, d);
      }
      const diag = ST.def() === def ? ' STALLED ' + JSON.stringify({ x: Math.round(f.x), z: Math.round(f.z), wi: c.wi, wps: c.wps.length, wp: c.wps[c.wi] ? [Math.round(c.wps[c.wi].x), Math.round(c.wps[c.wi].z)] : null, ri: f.ai && f.ai.ri, rl: f.ai && f.ai.route ? f.ai.route.length : null, stucks: f.ai && f.ai.stucks, sp: +f.speed.toFixed(2), kd: !!f.knockedDown, brain: f.ai && f.ai.mission, tile: GTP.World.tileAt(f.x, f.z), px: Math.round(p.x), pz: Math.round(p.z) }) : '';
      return 'tailed ' + f.castId + ' for ' + s + 's at ' + minD.toFixed(1) + '..' + maxD.toFixed(1) + ' m' + diag;
    },
    fightOne(h, w) {
      const p = ST.p(), W = GTP.World, wd = GTP.Combat.WEAPONS[w], melee = wd.melee, range = melee ? 1.2 : 6;
      let dx = p.x - h.x, dz = p.z - h.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const r = W.resolveCapsule(h.x + dx * range, h.z + dz * range, h.y + 0.5, 0.45);
      ST.tp(r.x, r.z); p.yaw = U.dirToYaw(h.x - p.x, h.z - p.z); p.aimYaw = p.yaw; p.weapon = w;
      ST.hold('shoot', true); ST.adv(0.6); ST.hold('shoot', false);
    },
    defeat() {
      const c = ST.ctx(), def = ST.def(), p = ST.p();
      if (p.inVehicle) { p.exitVehicle(); ST.adv(0.3); }
      GTP.game.debug.godMode(true);
      const attention = new Map(); let s = 0, forced = 0;
      while (s < 90 && ST.def() === def && M.state.active) {
        ST.dodge();
        const live = c.peds.filter((h) => !ST.pedOut(h));
        if (!live.length) { s += ST.adv(0.25); continue; }
        const h = live[0], w = ST.bestWeapon();
        ST.fightOne(h, w); s += 0.6;
        attention.set(h.id, (attention.get(h.id) || 0) + 0.6);
        if (attention.get(h.id) > 9 && !ST.pedOut(h)) { GTP.Combat.damage(h, 999, p, w); forced++; }
      }
      GTP.game.debug.godMode(false);
      return c.total + ' with ' + ST.bestWeapon() + (forced ? ', ' + forced + ' forced' : '') + (c.wrong ? ', WRONG TAKE ' + c.wrong : '');
    },
    survive() {
      const c = ST.ctx(), def = ST.def(), p = ST.p();
      if (p.inVehicle) { p.exitVehicle(); ST.adv(0.3); }
      GTP.game.debug.godMode(true);
      let s = 0, maxLive = 0, swings = 0;
      while (s < c.total + 15 && ST.def() === def && M.state.active) {
        ST.dodge();
        const live = c.hostiles.filter((h) => !ST.pedOut(h)); maxLive = Math.max(maxLive, live.length);
        const near = live.find((h) => U.dist2d(h.x, h.z, p.x, p.z) < 6);
        if (near) { ST.fightOne(near, ST.bestWeapon()); swings++; s += 0.6; } else s += ST.adv(0.5);
      }
      GTP.game.debug.godMode(false);
      return 'held ' + c.total + 's, max ' + maxLive + ' live, ' + swings + ' swings';
    },
    wreckOne(v) {
      const p = ST.p(), W = GTP.World;
      if (p.inVehicle) { p.exitVehicle(); ST.adv(0.3); }
      const w = ST.bestWeapon(), wd = GTP.Combat.WEAPONS[w];
      const f = U.yawToDir(v.yaw), r = W.resolveCapsule(v.x - f.x * 8, v.z - f.z * 8, v.y + 0.5, 0.45);
      ST.tp(r.x, r.z);
      if (w !== 'fist' && !wd.melee && !wd.lobbed && !wd.rocket && ST.hasRounds(w)) {
        p.weapon = w;
        ST.hold('aim', true); GTP.Render.rig.yaw = U.dirToYaw(v.x - p.x, v.z - p.z); GTP.Render.rig.pitch = 0.14; GTP.Render.rig.snap(); ST.adv(0.1);
        ST.hold('shoot', true); ST.adv(0.8); ST.hold('shoot', false); ST.hold('aim', false);
      }
      if (!ST.lost(v)) v.applyDamage(999, p, w === 'fist' || wd.melee ? 'hottake' : w);
    },
    destroy() {
      const c = ST.ctx(), def = ST.def(), p = ST.p(), W = GTP.World;
      if (p.inVehicle) {
        const v = p.inVehicle, live = c.vehicles.filter((q) => !ST.lost(q));
        let ax = 1, az = 0;
        if (live.length) { ax = v.x - live[0].x; az = v.z - live[0].z; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l; }
        const rp = W.nearestRoadPoint(v.x + ax * 45, v.z + az * 45);
        if (rp) { ST.tp(rp.x, rp.z); v.vx = v.vz = 0; v.speed = 0; }
        p.exitVehicle(); ST.adv(0.3);
      }
      GTP.game.debug.godMode(true);
      let last = null;
      for (const v of c.vehicles) { if (ST.lost(v)) continue; ST.wreckOne(v); last = v; ST.adv(0.5); }
      if (last) { const sp = W.nearestSidewalkPoint(last.x + 26, last.z + 8); if (sp) ST.tp(sp.x, sp.z); }
      let s = ST.until(() => { ST.dodge(); return ST.def() !== def; }, 8, 0.25), guard = 0;
      while (s < 0 && ST.def() === def && guard++ < 6) {
        const again = c.vehicles.find((v) => !ST.lost(v));
        if (again) { ST.wreckOne(again); ST.adv(0.5); const sp2 = W.nearestSidewalkPoint(again.x + 26, again.z + 8); if (sp2) ST.tp(sp2.x, sp2.z); }
        s = ST.until(() => { ST.dodge(); return ST.def() !== def; }, 6, 0.25);
      }
      GTP.game.debug.godMode(false);
      return c.total + ' ' + (c.spawn.vehicle || 'vehicle') + '(s) wrecked';
    },
    escape_wanted() {
      const wd = GTP.AI.wanted, def = ST.def(), p = ST.p(), W = GTP.World;
      ST.adv(1.1);
      const lvl = wd.level;
      if (lvl >= 3) {
        const garages = W.landmarks.filter((l) => l.garage);
        garages.sort((a, b) => U.dist2d(a.garage.cx, a.garage.cz, p.x, p.z) - U.dist2d(b.garage.cx, b.garage.cz, p.x, p.z));
        const g = garages[0];
        if (!p.inVehicle && !ST.car()) return 'no car for the respray';
        const v = p.inVehicle, money0 = p.money;
        ST.tp(g.garage.cx, g.garage.cz); v.vx = v.vz = 0; v.speed = 0;
        ST.until(() => wd.level === 0, 4, 0.1); ST.until(() => ST.def() !== def, 4, 0.1);
        return lvl + ' stars resprayed at ' + g.id + ' for $' + (money0 - p.money);
      }
      const s = ST.loseStars(); ST.until(() => ST.def() !== def, 3, 0.2);
      return lvl + ' star(s) waited out in ' + s + 's';
    },
    minigame() {
      const d = ST.def(), game = d.params && d.game === 'ratio' ? 'ratio' : (d.game || 'debate');
      const G = GTP.UI.minigames[game];
      if (!G.active) ST.adv(0.2);
      if (!G.active) return 'no ' + game + ' running (state ' + GTP.game.state + ')';
      let guard = 0, n = 0;
      while (G.active && guard++ < 16000) {
        ST.adv(1 / 60);
        const st = G.state;
        if (game === 'debate') {
          if (st.phase === 'card' && st.card && st.card.t > 0.3) { ST.press(COUNTER[st.card.card]); n++; }
          else if (st.phase === 'summary' && st.phaseT > 0.7) ST.press('confirm');
        } else if (st.phase === 'play') {
          if (st.dogpile > 0 && st.hottake) { ST.press('shoot'); continue; }
          const green = st.dogpile > 0 ? 0.05 : 0.10, sp = 1.2 * st.speed * (st.dogpile > 0 ? 2 : 1), next = st.meter + st.dir * sp / 60;
          if (st.postsLeft > 0 && (st.primed || Math.abs(next - 0.5) < green - 0.012)) { ST.press('action'); n++; }
        } else if (st.phase === 'summary' && st.phaseT > 0.7) ST.press('confirm');
      }
      const st = G.state; ST.adv(0.2);
      return game + ' vs ' + st.opp.name + (st.opp.fallback ? ' (FALLBACK OPPONENT)' : '') + ': ' + (st.win ? 'won' : 'LOST') + ' ' + st.summary + ' (' + n + ' inputs)';
    },
    // the home marker from the road side: the player 9 m out from the door, the camera over the shoulder on the light and the giver
    homeShot(id) {
      const mk = M.markers().find((m) => m.id === id && m.kind === 'mission'); if (!mk) return null;
      const p = ST.p(); if (p.inVehicle) { p.exitVehicle(); ST.adv(0.3); }
      const lm = GTP.World.landmark(mk.landmark);
      let ox = mk.x - lm.x, oz = mk.z - lm.z; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      let spot = null;
      for (const d of [9, 7, 5]) for (const s of [0, 3, -3]) { const x = mk.x + ox * d - oz * s, z = mk.z + oz * d + ox * s; if (!spot && ST.walkable(x, z)) spot = { x, z }; }
      spot = spot || { x: mk.x + ox * 6, z: mk.z + oz * 6 };
      ST.tp(spot.x, spot.z); ST.adv(4.0);
      ST.face(mk.x, mk.z); GTP.Render.rig.pitch = 0.12; GTP.Render.rig.snap(); ST.adv(0.3); ST.face(mk.x, mk.z); GTP.Render.updateCamera(0);
      const giver = GTP.Entities.list.find((e) => e.kind === 'ped' && !e.removed && e.ai && e.ai.mission === 'giver' && e.ai.marker && e.ai.marker.id === id);
      return { giver: giver ? giver.castId : null, at: spot };
    },
    // ---- a whole mission: walk into the light, the intro, the objectives through the real checks, the outro ----
    startByMarker(id) {
      ST.loseStars();
      const mk = M.markers().find((m) => m.id === id && m.kind === 'mission');
      if (!mk) return { ok: false, note: 'no marker for ' + id + ': ' + M.markers().map((m) => m.id).join(',') };
      const p = ST.p(); if (p.inVehicle) { p.exitVehicle(); ST.adv(0.3); }
      const lm = GTP.World.landmark(mk.landmark);
      let ox = mk.x - lm.x, oz = mk.z - lm.z; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const dirs = [[ox, oz], [-oz, ox], [oz, -ox], [-ox, -oz]];
      // approach: the giver walks up to the light first (placed within giverRange)
      ST.tp(mk.x + ox * 12, mk.z + oz * 12); ST.adv(1.2);
      const giver = GTP.Entities.list.find((e) => e.kind === 'ped' && !e.removed && e.ai && e.ai.mission === 'giver' && e.ai.marker && e.ai.marker.id === id);
      const giverAt = giver ? { castId: giver.castId, d: +Math.hypot(giver.x - mk.x, giver.z - mk.z).toFixed(1) } : null;
      let how = null;
      outer: for (const dist of [7, 5, 3.5]) for (const d of dirs) {
        const sx = mk.x + d[0] * dist, sz = mk.z + d[1] * dist;
        if (!ST.walkable(sx, sz)) continue;
        ST.tp(sx, sz); ST.adv(0.1); ST.face(mk.x, mk.z);
        ST.hold('forward', true); ST.hold('run', true);
        const s = ST.until(() => M.state.active === id, 6, 0.1);
        ST.hold('forward', false); ST.hold('run', false);
        if (s > 0) { how = 'walk@' + dist; break outer; }
      }
      if (!how) { M.start(id); how = 'direct'; }
      ST.adv(1 / 60);
      const first = M.state.dialogue[0] || (GTP.UI.state.dialogue && GTP.UI.state.dialogue.line) || null;
      return { ok: M.state.active === id, how, giverAt, firstLine: first ? first.who : null, firstName: first ? first.name : null, state: GTP.game.state, marker: { x: Math.round(mk.x), z: Math.round(mk.z), landmark: mk.landmark } };
    },
    runMission(id, opts) {
      opts = opts || {};
      const p = ST.p(), m = M.missionById(id), out = { id, steps: [], ok: false };
      const money0 = p.money, subs0 = p.subs | 0;
      const st = ST.startByMarker(id); out.start = st;
      if (!st.ok) { out.note = st.note || 'did not start'; return out; }
      ST.skipTalk(60, () => M.state.phase === 'play' || !M.state.active);
      let guard = 0, lastDef = null, same = 0, retries = 0, shot = false;
      while (guard++ < 80) {
        if (!M.state.active) {
          const lf = M.lastFail && M.lastFail();
          if (lf && lf.id === id && retries < 3 && M.canRetry()) {
            retries++; ST.retries.push(id + ': ' + lf.reason + ' -> RETRY'); out.steps.push('FAILED (' + lf.reason + '), RETRY ' + retries);
            GTP.AI.wanted.clear(); ST.adv(0.5);
            if (!M.retry()) break;
            ST.adv(0.2); continue;
          }
          break;
        }
        if (M.state.phase === 'outro') { ST.skipTalk(60, () => M.state.active !== id); break; }
        if (ST.talking() && (!ST.def() || ST.def().type !== 'dialogue')) { ST.skipTalk(30); continue; }
        const d = ST.def();
        if (!d) { ST.adv(0.2); continue; }
        if (d === lastDef) { if (++same > 3) { out.steps.push('STUCK on ' + d.type + ': ' + d.text); M.completeObjective(); ST.fails.push(id + ': forced ' + d.type); same = 0; continue; } } else same = 0;
        lastDef = d;
        if (opts.shotAt != null && !shot && out.steps.length === opts.shotAt) { shot = true; out.shotPending = true; return Object.assign(out, { paused: true, money0, subs0, retries, guard }); }
        let note;
        try { note = ST[d.type] ? ST[d.type]() : 'no driver for ' + d.type; } catch (e) { note = 'threw ' + e.message; }
        out.steps.push(d.type + ': ' + note);
      }
      return ST.finishMission(out, money0, subs0, retries);
    },
    finishMission(out, money0, subs0, retries) {
      const id = out.id, p = ST.p(), m = M.missionById(id);
      ST.adv(0.5);
      const oc = m.onComplete || {}, want = (oc.setFlags || []).concat(oc.setFlag ? [oc.setFlag] : []);
      out.completed = M.state.completed.has(id);
      out.flags = want.filter((f) => !M.state.flags[f]);
      out.money = p.money - money0; out.subs = (p.subs | 0) - subs0; out.reward = m.reward; out.retries = retries;
      out.active = M.state.active; out.errors = GTP.errors.length;
      out.ok = out.completed && !out.flags.length && !M.state.active;
      return out;
    },
    resume(out) {
      // the screenshot pause: continue the same mission loop from where it stopped
      const id = out.id;
      let guard = out.guard || 0, lastDef = null, same = 0, retries = out.retries || 0;
      while (guard++ < 80) {
        if (!M.state.active) {
          const lf = M.lastFail && M.lastFail();
          if (lf && lf.id === id && retries < 3 && M.canRetry()) { retries++; out.steps.push('FAILED (' + lf.reason + '), RETRY ' + retries); GTP.AI.wanted.clear(); ST.adv(0.5); if (!M.retry()) break; ST.adv(0.2); continue; }
          break;
        }
        if (M.state.phase === 'outro') { ST.skipTalk(60, () => M.state.active !== id); break; }
        if (ST.talking() && (!ST.def() || ST.def().type !== 'dialogue')) { ST.skipTalk(30); continue; }
        const d = ST.def();
        if (!d) { ST.adv(0.2); continue; }
        if (d === lastDef) { if (++same > 3) { out.steps.push('STUCK on ' + d.type); M.completeObjective(); ST.fails.push(id + ': forced ' + d.type); same = 0; continue; } } else same = 0;
        lastDef = d;
        let note;
        try { note = ST[d.type] ? ST[d.type]() : 'no driver for ' + d.type; } catch (e) { note = 'threw ' + e.message; }
        out.steps.push(d.type + ': ' + note);
      }
      delete out.paused; delete out.shotPending;
      return ST.finishMission(out, out.money0, out.subs0, retries);
    }
  };
  GTP.Events.on('strangers:epilogue', (e) => ST.epilogues.push(e.id + ': ' + e.line));
  ['start', 'complete', 'fail', 'retry'].forEach((ev) => GTP.Events.on('mission:' + ev, (e) => ST.events.push(ev + ':' + (e.id || ''))));
}

H.run('strangers', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  await page.evaluate(installDriver);

  // ---- 1. schema ----
  const schema = await page.evaluate((ALLOWED) => {
    const S = GTP.Content.strangers, M = GTP.Missions, W = GTP.World, Ct = GTP.Content, errs = [];
    if (!S) return { errs: ['GTP.Content.strangers missing'] };
    const all = M.allMissions(), byId = {}; all.forEach((m) => { byId[m.id] = m; });
    const story = Ct.missions.map((m) => m.id).concat((Ct.expansion.missions || []).filter((m) => m.kind !== 'stranger').map((m) => m.id));
    const lm = (id, where) => { const l = W.landmark(id); if (!l) errs.push(where + ': unknown landmark ' + id); else if (!l.door) errs.push(where + ': landmark without a door ' + id); return l; };
    const castOrRole = (id, where) => { if (!Ct.cast[id] && !Ct.looks.roles[id]) errs.push(where + ': unknown cast / role ' + id); };
    const districts = new Set(), types = new Set(), homes = [];
    const allDistricts = Ct.world.layout.districts.map((d) => d.id);
    const point = (t, where) => {
      if (!t) return;
      if (t.landmark) { const l = lm(t.landmark, where); if (l) { districts.add(l.district); if (t.point && !(l.points && l.points[t.point])) errs.push(where + ': unknown point ' + t.point + ' on ' + t.landmark); } }
    };
    if (S.strands.length !== 10) errs.push('expected 10 strands, got ' + S.strands.length);
    const ids = new Set();
    S.strands.forEach((st) => {
      const w = 'strand ' + st.id;
      if (!Ct.cast[st.giver]) errs.push(w + ': giver ' + st.giver + ' not in the cast');
      else { const c = Ct.cast[st.giver]; if (!c.portrait || !c.look || !c.name || !c.voice || !c.bio || !c.color) errs.push(w + ': cast entry incomplete'); }
      const home = lm(st.home, w + '.home');
      if (home) { homes.push(home.district); if (home.district !== st.district) errs.push(w + ': home ' + st.home + ' is in ' + home.district + ', not ' + st.district); districts.add(home.district); }
      if (!st.epilogue || st.epilogue.length < 20) errs.push(w + ': no epilogue');
      if (!st.missions || st.missions.length < 2 || st.missions.length > 3) errs.push(w + ': needs 2-3 missions, has ' + (st.missions || []).length);
      const u = st.unlock;
      if (!u || !byId[u.mission] || story.indexOf(u.mission) < 0) errs.push(w + ': unlock mission ' + (u && u.mission) + ' is not a story mission');
      else { const oc = byId[u.mission].onComplete || {}; if (oc.setFlag !== u.flag && (oc.setFlags || []).indexOf(u.flag) < 0) errs.push(w + ': ' + u.mission + ' does not set the unlock flag ' + u.flag); }
      st.missions.forEach((mid, k) => {
        const m = byId[mid], mw = mid;
        if (!m) { errs.push(w + ': mission ' + mid + ' not registered in allMissions()'); return; }
        if (ids.has(mid)) errs.push('duplicate id ' + mid); ids.add(mid);
        if (story.indexOf(mid) >= 0) errs.push(mid + ' collides with a story id');
        if (m.kind !== 'stranger' || !m.side || m.strand !== st.id) errs.push(mw + ': not stamped kind/side/strand');
        if (m.giver !== st.giver) errs.push(mw + ': giver ' + m.giver + ' is not the strand\'s ' + st.giver);
        if (m.marker !== st.home) errs.push(mw + ': marker ' + m.marker + ' is not the home ' + st.home);
        if (!(m.reward > 0)) errs.push(mw + ': no reward');
        if (!m.title) errs.push(mw + ': no title');
        if ([1, 2, 3].indexOf(m.act) < 0) errs.push(mw + ': act');
        const req = m.requires || [];
        if (k === 0 && (req.length !== 1 || req[0] !== u.mission)) errs.push(mw + ': first mission must require exactly the unlock mission ' + u.mission);
        if (k > 0 && req.indexOf(st.missions[k - 1]) < 0) errs.push(mw + ': must require ' + st.missions[k - 1]);
        req.forEach((r) => { if (!byId[r]) errs.push(mw + ' requires unknown ' + r); });
        if ((m.failOn || []).indexOf('player_dead') < 0) errs.push(mw + ': failOn lacks player_dead');
        if ((m.intro || []).length < 3) errs.push(mw + ': intro shorter than 3 lines');
        if ((m.outro || []).length < 3) errs.push(mw + ': outro shorter than 3 lines');
        const tags = new Set(), say = (l, where) => { if (!Ct.cast[l.who]) errs.push(where + ': dialogue who ' + l.who); if (!l.text) errs.push(where + ': empty line'); };
        (m.intro || []).forEach((l) => say(l, mw + '.intro')); (m.outro || []).forEach((l) => say(l, mw + '.outro'));
        if (!(m.intro || []).some((l) => l.who === st.giver)) errs.push(mw + ': the giver never speaks in the intro');
        const walk = (o, where) => {
          types.add(o.type);
          if (ALLOWED.indexOf(o.type) < 0) errs.push(where + ': objective type ' + o.type + ' is not an existing type');
          if (o.type !== 'timer_wrap' && o.type !== 'dialogue' && o.type !== 'equip' && !o.text) errs.push(where + ': no HUD text');
          point(o.target, where); point(o.to, where);
          const sp = o.spawn || {};
          point(sp.at, where); point(sp.around, where); (sp.path || []).forEach((p) => point(p, where));
          if (sp.around && sp.around.tag && !tags.has(sp.around.tag)) errs.push(where + ': around tag ' + sp.around.tag + ' is not spawned earlier');
          if (sp.ped) castOrRole(sp.ped, where);
          if (sp.type && !GTP.C.VEHICLES[sp.type]) errs.push(where + ': unknown vehicle type ' + sp.type);
          if (sp.vehicle && !GTP.C.VEHICLES[sp.vehicle]) errs.push(where + ': unknown vehicle type ' + sp.vehicle);
          if (sp.tag) tags.add(sp.tag);
          if (o.vehicle && o.vehicle !== 'any') { const tg = String(o.vehicle).replace(/^spawned:/, ''); if (!tags.has(tg)) errs.push(where + ': vehicle ' + o.vehicle + ' names no tag spawned before it'); }
          if (o.weapon && !GTP.Combat.WEAPONS[o.weapon]) errs.push(where + ': unknown weapon ' + o.weapon);
          if (o.type === 'equip' && !GTP.Combat.WEAPONS[o.weaponId]) errs.push(where + ': unknown weapon ' + o.weaponId);
          if (o.type === 'minigame') {
            const G = o.game === 'ratio' ? Ct.ratio : Ct.debate, opp = o.params && o.params.opponent;
            if (['debate', 'ratio'].indexOf(o.game) < 0) errs.push(where + ': unknown minigame ' + o.game);
            else if (!opp || !G.opponents[opp]) errs.push(where + ': unknown ' + o.game + ' opponent ' + opp);
          }
          if (o.type === 'stunt' && !GTP.Strands.stunts.ramp(o.ramp)) errs.push(where + ': unknown ramp ' + o.ramp);
          if (o.type === 'stunt' && o.ramp) { const r = GTP.Strands.stunts.ramp(o.ramp); if (r) { const d = W.districtAt(r.x, r.z); if (d) districts.add(d.id); } }
          if (o.type === 'race') { if (!o.race && !(o.checkpoints && o.checkpoints.length >= 2)) errs.push(where + ': race without checkpoints'); (o.checkpoints || []).forEach((c) => point(c, where)); }
          (o.lines || []).forEach((l) => say(l, where));
          if (o.type === 'timer_wrap') { if (!(o.seconds > 0)) errs.push(where + ': timer without seconds'); (o.objectives || []).forEach((oo, j) => walk(oo, where + '/' + j)); }
        };
        m.objectives.forEach((o, j) => walk(o, mw + '.obj' + j));
        (m.failOn || []).forEach((f) => { if (/^vehicle_lost:/.test(f) && !tags.has(f.slice(13))) errs.push(mw + ': failOn ' + f + ' names no spawned tag'); });
      });
    });
    // the registered missions are exactly the strands' missions
    const reg = all.filter((m) => m.kind === 'stranger').map((m) => m.id);
    if (reg.length !== ids.size) errs.push('allMissions() has ' + reg.length + ' stranger missions, the strands list ' + ids.size);
    // DAG over the whole list
    const state = {};
    const visit = (id, chain) => { if (state[id] === 2) return; if (state[id] === 1) { errs.push('cycle: ' + chain.concat(id).join(' -> ')); return; } state[id] = 1; (byId[id].requires || []).forEach((r) => { if (byId[r]) visit(r, chain.concat(id)); }); state[id] = 2; };
    all.forEach((m) => visit(m.id, []));
    // the opponents and the cast were registered without clobbering
    ['clause', 'hoa_board', 'family_counsel'].forEach((k) => { if (!Ct.debate.opponents[k] || Ct.debate.opponents[k].cards.length < 4) errs.push('debate opponent ' + k); });
    ['scab_heckler', 'smirk', 'house_style'].forEach((k) => { if (!Ct.ratio.opponents[k] || Ct.ratio.opponents[k].replies.length < 4) errs.push('ratio opponent ' + k); });
    ['gus', 'kip', 'merle', 'cutout'].forEach((k) => { if (Ct.cast[k] && Ct.cast[k].stranger) errs.push('cast ' + k + ' was overwritten'); });
    return {
      errs, strands: S.strands.length, missions: ids.size, homes: Array.from(new Set(homes)), districts: Array.from(districts).sort(), allDistricts: allDistricts.sort(),
      types: Array.from(types).sort(), total: all.length, story: story.length,
      rewards: S.missions.reduce((a, m) => a + m.reward, 0), api: Object.keys(GTP.Strangers).join(',')
    };
  }, ALLOWED_TYPES);
  console.log('  schema: ' + JSON.stringify(Object.assign({}, schema, { errs: schema.errs.length })));
  t.assert(schema.errs.length === 0, 'strand data problems:\n' + schema.errs.join('\n'));
  t.assert(schema.strands === 10 && schema.missions >= 20 && schema.missions <= 30, 'ten strands with 2-3 missions each: ' + schema.missions);
  t.assert(schema.homes.length === 10, 'ten homes in ten different districts: ' + schema.homes.join(','));
  t.assert(schema.allDistricts.length === 11 && schema.allDistricts.every((d) => schema.districts.indexOf(d) >= 0), 'the strands cover all eleven districts: ' + schema.districts.join(',') + ' of ' + schema.allDistricts.join(','));
  for (const ty of ['drive_to', 'follow', 'defeat', 'survive', 'pickup', 'race', 'minigame', 'stunt', 'destroy', 'deliver_passenger', 'stop_vehicle', 'escape_wanted', 'timer_wrap'])
    t.assert(schema.types.indexOf(ty) >= 0, 'the strands use ' + ty);

  // ---- 2. a new game: no stranger markers; nothing is available before its story mission ----
  const fresh = await page.evaluate(() => {
    GTP.game.advance(0.5);
    const st = GTP.Strangers.summary();
    return { markers: GTP.Missions.markers().filter((m) => m.kind === 'mission').map((m) => m.id), states: st.map((s) => s.id + ':' + s.state), avail: GTP.Missions.available().filter((m) => m.kind === 'stranger').length };
  });
  console.log('  new game: ' + JSON.stringify(fresh));
  t.assert(fresh.markers.length === 1 && fresh.markers[0] === 'm00_intro' && fresh.avail === 0 && fresh.states.every((s) => /:locked$/.test(s)), 'a new game shows only m00_intro; every strand is locked');

  // ---- 3. every strand mission, by marker, through the real checks ----
  const only = (process.env.STRANGERS_ONLY || '').split(',').filter(Boolean);
  const strands = await page.evaluate(() => GTP.Content.strangers.strands.map((s) => ({ id: s.id, home: s.home, giver: s.giver, unlock: s.unlock.mission, missions: s.missions.slice() })));
  const results = [], problems = [];
  for (const st of strands) {
    if (only.length && only.indexOf(st.id) < 0) continue;
    // the story up to the unlock: prep() completes its requires chain and starts it; abort keeps them done; then the unlock itself
    const unlocked = await page.evaluate((s) => {
      const M = GTP.Missions, p = GTP.game.player;
      if (!M.state.completed.has(s.unlock)) {
        M.prep(s.unlock); GTP.game.advance(0.2); M.abort(); GTP.game.advance(0.2);
        // complete the unlock mission the way prep marks its prerequisites (flags, weapons), without playing it
        const m = M.missionById(s.unlock); M.state.completed.add(s.unlock);
        const oc = m.onComplete || {}; if (oc.setFlag) M.state.flags[oc.setFlag] = true; (oc.setFlags || []).forEach((f) => { M.state.flags[f] = true; });
        if (oc.unlockWeapon) p.weapons[oc.unlockWeapon] = Math.max(p.weapons[oc.unlockWeapon] || 0, 40);
        if (oc.takeWeapon) delete p.weapons[oc.takeWeapon];
      }
      if (p.inVehicle) p.exitVehicle();
      GTP.AI.wanted.clear(); M.refreshMarkers(); GTP.game.advance(1.2);
      const first = s.missions[0], mk = M.markers().find((x) => x.id === first), lm = GTP.World.landmark(s.home);
      return { status: GTP.Strangers.status(s.id).state, marker: !!mk, atHome: mk ? +Math.hypot(mk.x - lm.door.x, mk.z - lm.door.z).toFixed(1) : null, flag: M.state.flags[GTP.Strangers.strand(s.id).unlock.flag] === true };
    }, st);
    if (!unlocked.marker || unlocked.atHome > 6 || unlocked.status !== 'available' || !unlocked.flag) problems.push(st.id + ': unlock ' + JSON.stringify(unlocked));
    const hs = await page.evaluate((id) => ST.homeShot(id), st.missions[0]);
    await t.shot(page, 'strangers_home_' + st.id);
    if (!hs || hs.giver !== st.giver) problems.push(st.id + ': the home shot found no ' + st.giver + ' at the light: ' + JSON.stringify(hs));
    for (let k = 0; k < st.missions.length; k++) {
      const id = st.missions[k];
      let r = await page.evaluate((a) => ST.runMission(a.id, { shotAt: a.k === 0 ? 1 : null }), { id, k });
      if (k === 0) {
        // the home marker shot was taken by the walk-in; a mid-mission screenshot at the first real step
        await page.evaluate(() => { const g = GTP.game; if (g.state === 'playing') { GTP.Render.rig.pitch = Math.max(GTP.Render.rig.pitch, 0.14); GTP.Render.rig.snap(); g.advance(0.05); } g.render(); });
        await t.shot(page, 'strangers_mid_' + id);
        if (r.paused) r = await page.evaluate((o) => ST.resume(o), r);
      }
      results.push(r);
      console.log('  ' + id + (r.ok ? ' OK' : ' FAILED') + ' [' + r.start.how + ', giver ' + JSON.stringify(r.start.giverAt) + ', first line ' + r.start.firstLine + '] $' + r.money + ' / reward $' + r.reward + ', subs +' + r.subs + (r.retries ? ', retries ' + r.retries : '') + '\n      ' + r.steps.join('\n      '));
      if (!r.ok) problems.push(id + ': ' + JSON.stringify({ completed: r.completed, flags: r.flags, active: r.active, note: r.note }));
      if (!r.start.ok || r.start.how === 'direct') problems.push(id + ': not started by walking into the marker (' + r.start.how + ')');
      if (!r.start.giverAt || r.start.giverAt.castId !== st.giver || r.start.giverAt.d > 6) problems.push(id + ': the giver ' + st.giver + ' did not stand at the marker: ' + JSON.stringify(r.start.giverAt));
      if (r.start.firstLine == null) problems.push(id + ': no intro line on start');
      if (r.retries) problems.push(id + ': needed ' + r.retries + ' RETRY: ' + r.steps.filter((s) => /FAILED/.test(s)).join(' | '));
      if (r.ok && r.money < r.reward * 0.5) problems.push(id + ': reward not paid ($' + r.money + ' of $' + r.reward + ')');
      if (r.steps.some((s) => /STUCK|FALLBACK OPPONENT|LOST|threw|no driver|FAILED to|no target/.test(s))) problems.push(id + ': ' + r.steps.filter((s) => /STUCK|FALLBACK OPPONENT|LOST|threw|no driver|FAILED to|no target/.test(s)).join(' | '));
    }
    const done = await page.evaluate((s) => ({ status: GTP.Strangers.status(s.id), epilogue: GTP.Strangers.epilogue(s.id), flag: GTP.Strangers.flagged(s.id), events: ST.epilogues.filter((e) => e.indexOf(s.id + ':') === 0).length }), st);
    console.log('  strand ' + st.id + ': ' + done.status.state + ' ' + done.status.done + '/' + done.status.total + ', epilogue "' + done.epilogue + '"');
    if (done.status.state !== 'done' || !done.epilogue || !done.flag || done.events !== 1) problems.push(st.id + ': not finished cleanly ' + JSON.stringify(done));
  }
  // ---- 4. replay, the phone list, the save, errors ----
  const after = await page.evaluate((onlyIds) => {
    const M = GTP.Missions, S = GTP.Content.strangers, g = GTP.game;
    const mine = S.missions.map((m) => m.id).filter((id) => !onlyIds.length || onlyIds.indexOf(GTP.Strangers.strandOf(id)) >= 0);
    const listed = M.completedList().map((r) => r.id);
    const missing = mine.filter((id) => listed.indexOf(id) < 0);
    const money0 = g.player.money;
    const replay = M.replay(mine[0]); g.advance(0.2);
    const replayState = { ok: replay, active: M.state.active, hud: M.hud().replay };
    M.abort(); g.advance(0.3);
    const data = g.serialize(1);
    const savedMissing = mine.filter((id) => data.completed.indexOf(id) < 0);
    const savedFlags = mine.map((id) => 'st_' + id.replace(/^st_/, '')).filter((f) => !data.flags[f]);
    return { missing, replayState, moneyAfterReplay: g.player.money - money0, savedMissing, savedFlags, errors: GTP.errors.map((e) => e.where + ': ' + e.message), summary: GTP.Strangers.summary().map((s) => s.id + ':' + s.state), events: ST.events.filter((e) => /^fail/.test(e)), forced: ST.fails };
  }, only);
  console.log('  after: ' + JSON.stringify(after));
  t.assert(after.missing.length === 0, 'the phone\'s completed list carries every strand mission: missing ' + after.missing.join(','));
  t.assert(after.replayState.ok && after.replayState.hud === true, 'a strand mission replays from the phone: ' + JSON.stringify(after.replayState));
  t.assert(after.savedMissing.length === 0 && after.savedFlags.length === 0, 'the save carries the strand missions and flags: ' + after.savedMissing.concat(after.savedFlags).join(','));
  t.assert(after.forced.length === 0, 'no objective had to be forced: ' + after.forced.join(' | '));
  t.assert(problems.length === 0, 'strand run problems:\n' + problems.join('\n'));
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'no errors: ' + errs.join('\n'));
});
