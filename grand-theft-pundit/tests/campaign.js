/* campaign.js: the whole expanded campaign, start to both endings, on a NEW game in a non-headless page.
 *  - Enter on the title screen starts play; the opening cutscene (cs_opening) is verified to start, screenshotted and skipped
 *  - every one of the 25 story missions (GDD_EXPANSION §3.3 order) is started by walking into its blue light; its intro cutscene
 *    (cs_intro_<id>) is verified to start (state cutscene, the first line on screen) and skipped; the objectives are then played
 *    through the real checks: real enter / drive / goto / pickup checks (debug teleports stand in for the drive), real fights
 *    (fists or the current gun, the mission's required weapon when it names one: pistol at the range, the sniper from the
 *    causeway, the hot mics and the Ratio Launcher on the vans; god mode on), real tailing, the passenger ride, the courier van
 *    boxed in, the jet truck off the runway wedge, real pay-and-spray for the four- and five-star escapes, hiding out of sight
 *    for the others, both minigames played with scripted inputs; destroy targets are wrecked with a real aimed shot or two and
 *    then applyDamage with the same weapon (ammo is finite)
 *  - stars left over from a mission (a destroy objective's blast) are lost before the next light, lying low far from the police
 *  - the act cutscenes (cs_act2, cs_act3, cs_twist, cs_ending_a, cs_ending_b) are verified to start after MISSION PASSED and skipped
 *  - asserts per mission: completed, the reward paid (minus respray costs, plus cash picked up), onComplete flags, weapon
 *    unlocks in the GDD order (megaphone m03, table leg m03b, pistol m05, revolver m05b, rifle m08b, hottake m09, hot mic m09b,
 *    smg m11, sniper m12b, launcher m13b; the shotgun only as a pickup after m11), the subscribers counter (reward x 5) and its
 *    tier, the credits hook on both endings, GTP.errors empty
 *  - after the endings: one cycle of every side strand (Loud Cab, HOA Patrol, Sponsor Runs, a Ratio Rampage, ten Monday Memos,
 *    Loop Race lr_01, Stunt Jump sj_07) with its reward and subscribers, and a purchase at Both Sides Arms
 *  - screenshots: campaign_opening.png, campaign_<id>_intro.png (the intro cutscene) and campaign_<id>_mid.png (a mid-mission moment)
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/campaign.js
 *   CAMPAIGN_FROM=<id> preps the earlier missions complete and starts there; CAMPAIGN_TO=<id> stops after that mission */
'use strict';
const H = require('./_harness');

const ORDER = ['m00_intro', 'm01_van', 'm01b_airport', 'm02_read', 'm03_ratio', 'm03b_range', 'm04_hit', 'm05_peer', 'm05b_provenance', 'm06_rally',
  'm07_listen', 'm07b_ferry', 'm08_scooters', 'm08b_jets', 'm09_balloon', 'm09b_hotmic', 'm10_pellets', 'm11_trustless', 'm12_memo', 'm12b_scope',
  'm13_thursday', 'm13b_ratio', 'm14_grift', 'm15a_primetime', 'm15b_liveread'];
// expected unlocks per the GDD (and GDD_EXPANSION §2 / §3)
const UNLOCKS = { m03_ratio: 'megaphone', m03b_range: 'tableleg', m05_peer: 'pistol', m05b_provenance: 'revolver', m08b_jets: 'rifle', m09_balloon: 'hottake',
  m09b_hotmic: 'hotmic', m11_trustless: 'smg', m12b_scope: 'sniper', m13b_ratio: 'ratio' };
// the act cutscenes that follow a completion (GDD_EXPANSION §4.1)
const AFTER = { m04_hit: 'cs_act2', m11_trustless: 'cs_act3', m12_memo: 'cs_twist', m15a_primetime: 'cs_ending_a', m15b_liveread: 'cs_ending_b' };
// per-mission step scripts; a numeric argument pauses a resumable step (after n seconds / items / answers) for the screenshot;
// `goto` / `drive` without a landmark go to the objective's own target (a landmark point, a tagged vehicle); `equip` objectives are instant
const SCRIPT = {
  m00_intro: [['goto', 'dorm_studio'], ['pickups'], ['shot'], ['goto', 'campus_quad'], ['debate']],
  m01_van: [['enter'], ['pickups', 3], ['shot'], ['pickups'], ['drive', 'pod_garage']],
  m01b_airport: [['enter'], ['drive', 'airport_terminal'], ['shot'], ['deliver'], ['dialogue']],
  m02_read: [['enter'], ['drive', 'green_room'], ['shot'], ['dialogue']],
  m03_ratio: [['ratio', 2], ['shot'], ['ratio'], ['defeat']],
  m03b_range: [['goto'], ['defeat', 3], ['shot'], ['defeat'], ['dialogue'], ['escape']],
  m04_hit: [['dialogue'], ['car'], ['drive', 'tyn_tower'], ['goto', 'tyn_tower'], ['debate', 3], ['shot'], ['debate']],
  m05_peer: [['follow', 30], ['shot'], ['follow'], ['pickups'], ['survive']],
  m05b_provenance: [['goto', 'museum_of_takes'], ['defeat', 2], ['shot'], ['defeat'], ['pickups'], ['enter'], ['escape'], ['drive', 'vaultwright_manor']],
  m06_rally: [['goto', 'stadium'], ['survive', 25], ['shot'], ['survive'], ['destroy'], ['escape']],
  m07_listen: [['enter'], ['pickups'], ['drive', 'velvetine_pier'], ['shot'], ['dialogue']],
  m07b_ferry: [['enter'], ['pickups', 2], ['shot'], ['pickups'], ['destroy'], ['drive', 'ferry_terminal'], ['dialogue']],
  m08_scooters: [['enter'], ['drive', 'capitol_dome'], ['drive', 'goldplate_tower'], ['shot'], ['drive', 'velvetine_pier'], ['drive', 'bravadia_embassy']],
  m08b_jets: [['enter'], ['drive'], ['shot'], ['stunt'], ['dialogue'], ['escape']],
  m09_balloon: [['follow', 30], ['shot'], ['follow'], ['pickups'], ['escape']],
  m09b_hotmic: [['enter'], ['stop'], ['shot'], ['pickups'], ['destroy'], ['escape']],
  m10_pellets: [['enter'], ['drive', 'hoa_hall'], ['destroy', 1], ['shot'], ['destroy'], ['escape']],
  m11_trustless: [['pickups', 4], ['shot'], ['pickups'], ['dialogue'], ['destroy']],
  m12_memo: [['car'], ['drive', 'ova_hq'], ['defeat', 3], ['shot'], ['defeat'], ['pickups'], ['escape'], ['goto', 'pod_garage']],
  m12b_scope: [['goto', 'causeway_east'], ['defeat', 2], ['shot'], ['defeat'], ['pickups'], ['escape'], ['goto', 'museum_of_takes']],
  m13_thursday: [['goto', 'campus_quad'], ['survive', 35], ['shot'], ['survive'], ['escape'], ['goto', 'pod_garage']],
  m13b_ratio: [['destroy', 2], ['shot'], ['destroy'], ['escape'], ['goto', 'pod_garage']],
  m14_grift: [['debate', 4], ['shot'], ['debate'], ['dialogue'], ['escape']],
  m15a_primetime: [['car'], ['drive', 'nap_depot'], ['drive', 'clarity_barn'], ['shot'], ['drive', 'moon_mine'], ['drive', 'velvetine_pier'], ['drive', 'goldplate_tower'], ['goto', 'goldplate_tower'], ['ratio']],
  m15b_liveread: [['car'], ['drive', 'tyn_tower'], ['defeat'], ['ratio', 3], ['shot'], ['ratio'], ['goto', 'campus_quad']]
};

// in-page driver (installed once; classic script context, so plain functions)
function installDriver() {
  const U = GTP.util, M = GTP.Missions;
  const COUNTER = { FACT: 'forward', FEELING: 'left', GOTCHA: 'right', ANECDOTE: 'back' };
  const CT = window.CT = {
    log: [], events: [], fails: [], cash: 0, spent: 0, endings: [], fallbacks: [], how: {}, cutscenes: [], subsLog: [],
    p() { return GTP.game.player; },
    adv(s) { GTP.game.advance(s); return s; },
    press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
    hold(a, on) { GTP.Input.set(a, !!on); },
    tp(x, z, y) { GTP.game.debug.teleport(x, z, y); },
    door(id) { const lm = GTP.World.landmark(id); return { x: lm.door.x, z: lm.door.z, lm }; },
    cur() { return M.current(); },
    def() { const c = M.current(); return c ? c.def : null; },
    ctx() { const c = M.current(); return c ? c.ctx : null; },
    active() { return M.state.active; },
    talking() { return !!(M.dialogue && M.dialogue.active) || !!GTP.UI.state.dialogue; },
    pedOut(h) { return !h || h.removed || !h.alive || h.knockedDown || h.fled; },
    lost(v) { return !v || v.removed || v.wreck || v.sinking; },
    walkable(x, z) { const W = GTP.World, T = W.T, t = W.tileAt(x, z); return (t === T.SIDEWALK || t === T.PLAZA || t === T.GRASS || t === T.SAND || t === T.PARKING || t === T.ROAD) && !W.solidAt(x, z, 0.5); },
    // the gun for a fight: the objective's required weapon when it names one, else the campaign's usual order (the new guns as fallbacks)
    bestWeapon() {
      const p = CT.p(), w = p.weapons, d = CT.def();
      // the objective's named weapon even when its ammo is gone (the applyDamage fallback carries the weapon type; a shot needs rounds)
      if (d && d.weapon) return d.weapon;
      for (const id of ['smg', 'pistol', 'shotgun', 'rifle', 'revolver', 'tableleg']) if (w[id] > 0) return id;
      return 'fist';
    },
    hasRounds(w) { const n = CT.p().weapons[w]; return n === Infinity || n > 0; },
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
    // hold confirm to skip a whole cutscene script (0.6 s); returns the seconds until it ended or -1
    skipCutscene(maxSec) {
      const Cs = GTP.Cutscenes; if (!Cs.active) return 0;
      CT.hold('confirm', true); CT.adv(0.8); CT.hold('confirm', false);
      let s = 0.8; while (s < (maxSec || 6) && Cs.active) s += CT.adv(0.1);
      CT.adv(0.2);
      return Cs.active ? -1 : s;
    },
    // the opening cutscene on a new game: the slot flow's flag, then the engine's own path (Game._maybeOpening -> Cutscenes.playOnce)
    opening() {
      const g = GTP.game, Cs = GTP.Cutscenes;
      g._openingPending = true; g._maybeOpening(); CT.adv(0.2);
      const hud = Cs.hud();
      const out = { scripted: !!Cs.scriptFor('cs_opening'), state: g.state, active: Cs.active, title: hud.title, shots: hud.shots, letterbox: Cs.letterbox, control: CT.p().controlEnabled, actors: Object.keys(Cs.actors()) };
      CT.adv(1.6); GTP.game.render();
      return out;
    },
    openingSkip() {
      const s = CT.skipCutscene(8), p = CT.p();
      return { s, state: GTP.game.state, flag: M.state.flags.cs_cs_opening === true, control: p.controlEnabled, markers: M.markers().map((m) => m.id), hint: GTP.Hints && GTP.Hints.current() ? GTP.Hints.current().id : null };
    },
    // stars left over from the last mission (a destroy objective's blast, a driver caught in it): a player loses them before
    // walking into the next light, here by lying low at the landmark door farthest from where the police last saw him
    loseStars() {
      const wd = GTP.AI.wanted, p = CT.p(), W = GTP.World; if (!wd.level) return 0;
      const lvl = wd.level, lk = wd.lastKnown; let best = null, bd = 0;
      for (const lid of ['fish_shack', 'moon_mine', 'memo_press', 'campus_quad', 'goldplate_links', 'balloon_depot', 'afterparty_yacht', 'clarity_barn', 'hangar_row', 'heirloom_club']) {
        const lm = W.landmark(lid); if (!lm || !lm.door) continue;
        const d = U.dist2d(lm.door.x, lm.door.z, lk.x, lk.z); if (d > bd) { bd = d; best = lm; }
      }
      if (p.inVehicle) { p.exitVehicle(); CT.adv(0.3); }
      CT.tp(best.door.x, best.door.z);
      const s = CT.until(() => { CT.dodge(); return wd.level === 0; }, 90, 0.5);
      CT.starsLost = (CT.starsLost || []).concat([lvl + '@' + best.id + ':' + s + 's']);
      return s;
    },
    // walk into a mission's blue light from the road side (real input); the direct start is the last resort
    start(id) {
      CT.loseStars();
      const mk = M.markers().find((m) => m.id === id && m.kind === 'mission');
      if (!mk) return { ok: false, note: 'no marker for ' + id + ': ' + M.markers().map((m) => m.id).join(',') + (M.busy() ? ' (busy)' : '') };
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
      const rt = GTP.Render.rig._target, Cs = GTP.Cutscenes;
      return { ok: M.state.active === id, how, state: GTP.game.state, camTarget: rt ? (rt.castId || rt.kind) : null, line: M.state.dialogue[0] ? M.state.dialogue[0].who : null, money: p.money,
        cutscene: Cs.active ? { id: Cs.hud().title, shots: Cs.hud().shots, letterbox: Cs.letterbox } : null };
    },
    // the intro: let the first line type for the screenshot, then skip the rest
    introPause() { CT.adv(1.4); GTP.game.render(); return { state: GTP.game.state, who: GTP.UI.state.dialogue ? GTP.UI.state.dialogue.line.who : null, cutscene: GTP.Cutscenes.active }; },
    beginPlay() {
      // a scripted intro is skipped as a player would (hold confirm); the old two-shot's lines are confirmed through
      if (GTP.Cutscenes.active) CT.skipCutscene(8);
      const s = CT.skipTalk(60, () => M.state.phase === 'play' || !M.state.active); CT.adv(0.1);
      return { s, phase: M.state.phase, state: GTP.game.state, objective: M.state.objectiveText, type: CT.def() && CT.def().type };
    },
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
    target() { const t = M.objectiveTarget(); return t ? { x: t.x, z: t.z, y: t.y } : null; },
    // --- steps -----------------------------------------------------------------
    goto(lm) {
      const e = CT.expect('goto'); if (e === 'skip') return { ok: true, note: 'goto ' + lm + ' already passed (the light stands on it)' }; if (e) return { ok: false, note: e };
      const p = CT.p(), def = CT.def();
      if (p.inVehicle) { p.exitVehicle(); CT.adv(0.4); if (CT.def() !== def) return { ok: true, note: 'goto ' + lm + ': already there on stepping out' }; }
      const d = lm ? CT.door(lm) : CT.target();
      if (!d) return { ok: false, note: 'goto: no target' };
      CT.tp(d.x, d.z);
      const s = CT.until(() => CT.def() !== def, 4);
      return { ok: s > 0, note: 'goto ' + (lm || 'the objective point') + ' ' + s + 's' };
    },
    car() {
      const p = CT.p(); if (p.inVehicle) return { ok: true, note: 'already driving a ' + p.inVehicle.type };
      // the nearest parked cars first (a locked fleet truck or a boxed-in one is skipped for the next), then a spawned sedan
      const cands = GTP.Entities.near(p.x, p.z, 50, 'vehicle').filter((v) => !v.wreck && !v.sinking && !v.driver && !v.locked && v.type !== 'bike' && v.type !== 'bus' && v.type !== 'truck');
      cands.sort((a, b) => U.dist2d(a.x, a.z, p.x, p.z) - U.dist2d(b.x, b.z, p.x, p.z));
      for (const v of cands.slice(0, 3)) { if (CT.enterVehicle(v)) return { ok: true, note: 'borrowed a parked ' + v.type }; }
      const rp = GTP.World.nearestRoadPoint(p.x, p.z), sv = GTP.game.debug.spawnVehicle(rp.x, rp.z, 'sedan');
      const r = CT.enterVehicle(sv);
      return { ok: r, note: 'spawned a sedan' + (r ? '' : ' (could not enter)') + (cands.length ? ' after ' + Math.min(3, cands.length) + ' parked car(s) refused' : '') };
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
    // the mission's own car when the objective names one ('spawned:<tag>'): back to it after a hide-out on foot
    tagged(def) {
      const m = def && typeof def.vehicle === 'string' && /^spawned:/.exec(def.vehicle); if (!m) return null;
      const tag = def.vehicle.slice(8), p = CT.p();
      const live = GTP.Entities.list.filter((e) => e.kind === 'vehicle' && e.tag === tag && !e.removed && !e.wreck);
      // the one the player sits in, else the newest (a kept pod van from an earlier mission may still carry the tag)
      if (p.inVehicle && live.indexOf(p.inVehicle) >= 0) return p.inVehicle;
      return live.length ? live[live.length - 1] : null;
    },
    drive(lm) {
      const e = CT.expect('drive_to'); if (e === 'skip') return { ok: true, note: 'drive ' + lm + ' already passed' }; if (e) return { ok: false, note: e };
      const p = CT.p(), def = CT.def(), want = CT.tagged(def);
      if (want && p.inVehicle !== want) { if (p.inVehicle) { p.exitVehicle(); CT.adv(0.3); } if (!CT.enterVehicle(want)) return { ok: false, note: 'could not get back into the ' + want.type + ' (' + want.tag + ')' }; }
      if (!p.inVehicle) { const r = CT.car(); if (!r.ok) return r; if (CT.def() !== def) return { ok: true, note: 'drive ' + lm + ': the car was already there' }; }
      const v = p.inVehicle;
      if (lm) {
        const d = CT.door(lm);
        // park on the door's road side: the check wants the car within 12 m of the door
        let ox = d.x - d.lm.x, oz = d.z - d.lm.z; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
        CT.tp(d.x + ox * 3, d.z + oz * 3);
      } else { const tg = CT.target(); if (!tg) return { ok: false, note: 'drive: no target' }; CT.tp(tg.x, tg.z); }
      v.vx = v.vz = 0; v.speed = 0;
      const s = CT.until(() => CT.def() !== def, 3);
      return { ok: s > 0, note: 'drove the ' + v.type + ' to ' + (lm || 'the objective point') };
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
        if (!pk.removed) { CT.tp(pk.x - 0.4, pk.z - 0.3); CT.adv(0.4); }
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
    // the passenger ride (m01b): pull up beside the hailing ped in the tagged van, wait for them to board, drive to the drop-off, stop
    deliver() {
      const e = CT.expect('deliver_passenger'); if (e === 'skip') return { ok: true, note: 'deliver already passed' }; if (e) return { ok: false, note: e };
      const c = CT.ctx(), def = CT.def(), p = CT.p(), f = c.ped, v = p.inVehicle;
      if (!f) return { ok: false, note: 'no passenger' };
      if (!v) return { ok: false, note: 'not in the van' };
      CT.tp(f.x + 3.2, f.z); v.vx = v.vz = 0; v.speed = 0;
      const s1 = CT.until(() => c.phase === 'ride', 8, 0.1);
      if (s1 < 0) return { ok: false, note: 'the passenger never boarded (phase ' + c.phase + ', hold ' + c.holdT + ')' };
      const to = c.to; CT.adv(0.3);
      CT.tp(to.x + 3, to.z); v.vx = v.vz = 0; v.speed = 0;
      const s2 = CT.until(() => CT.def() !== def, 6, 0.1);
      return { ok: s2 > 0, note: f.castId + ' boarded in ' + s1 + 's, dropped in ' + s2 + 's, seat ' + f.seat };
    },
    // the courier van (m09b): the player's SUV beside it, the van held still (boxed in) for the hold time
    stop() {
      const e = CT.expect('stop_vehicle'); if (e === 'skip') return { ok: true, note: 'stop already passed' }; if (e) return { ok: false, note: e };
      const c = CT.ctx(), def = CT.def(), p = CT.p(), v = c.v;
      if (!v) return { ok: false, note: 'no target vehicle' };
      if (!p.inVehicle) { const r = CT.car(); if (!r.ok) return r; }
      const x0 = v.x, z0 = v.z; CT.adv(2);
      const fled = +Math.hypot(v.x - x0, v.z - z0).toFixed(1);
      let s = 0;
      while (s < 12 && CT.def() === def) { CT.tp(v.x + 3.2, v.z); v.vx = v.vz = 0; v.speed = 0; v.setControls(0, 0, true, 1); s += CT.adv(0.1); }
      return { ok: CT.def() !== def, note: 'the ' + v.type + ' ran ' + fled + ' m, boxed in and held for ' + s.toFixed(1) + 's' };
    },
    // the stunt (m08b): the tagged truck lined up 35 m before the wedge at speed, forward held through the launch and the landing
    stunt() {
      const e = CT.expect('stunt'); if (e === 'skip') return { ok: true, note: 'stunt already passed' }; if (e) return { ok: false, note: e };
      const c = CT.ctx(), def = CT.def(), p = CT.p(), ramp = c.ramp, v = p.inVehicle;
      if (!ramp) return { ok: false, note: 'no ramp' };
      if (!v) return { ok: false, note: 'not in the truck' };
      const f = U.yawToDir(ramp.yaw);
      let tries = 0, launch = null, land = null;
      const L = (ev) => { launch = { speed: +(ev.speed || 0).toFixed(1) }; }, D = (ev) => { land = { airT: +(ev.airT || 0).toFixed(2), ok: ev.ok }; };
      GTP.Events.on('stunt:launch', L); GTP.Events.on('stunt:land', D);
      while (tries++ < 3 && CT.def() === def) {
        const back = 35 + tries * 10, speed = 24 + tries * 3;
        CT.tp(ramp.x - f.x * back, ramp.z - f.z * back, ramp.y); v.yaw = ramp.yaw; v.vx = f.x * speed; v.vz = f.z * speed; v.speed = speed; v.snap();
        CT.hold('forward', true);
        CT.until(() => CT.def() !== def || (land && !land.ok), 12, 0.1);
        CT.hold('forward', false);
        if (CT.def() === def) { land = null; CT.adv(1); }
      }
      // on the sand: brake before the water (a player would; the beach past the wedge is short)
      CT.hold('back', true); CT.until(() => Math.abs(v.speed) < 0.5 || v.sinking, 3, 0.1); CT.hold('back', false);
      CT.adv(0.3);
      return { ok: CT.def() !== def && !v.wreck, note: ramp.id + ' after ' + tries + ' run(s): launch ' + JSON.stringify(launch) + ' land ' + JSON.stringify(land) + ', truck ' + (v.wreck ? 'WRECKED' : 'fine') + ' at ' + Math.round(v.x) + ',' + Math.round(v.z) };
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
        if (CT._followT % 5 === 0) CT.followLog.push({ t: CT._followT, x: Math.round(f.x), z: Math.round(f.z), wi: c.wi, ri: f.ai.ri, rl: f.ai.route ? f.ai.route.length : null, st: f.ai.stucks, sp: +f.speed.toFixed(1), tile: GTP.World.tileAt(f.x, f.z), dWp: c.wps[c.wi] ? Math.round(U.dist2d(c.wps[c.wi].x, c.wps[c.wi].z, f.x, f.z)) : null, kd: !!f.knockedDown, alive: f.alive });
        CT._trail.push({ x: f.x, z: f.z });
        for (let i = CT._trail.length - 1; i >= 0; i--) { const tr = CT._trail[i]; if (U.dist2d(tr.x, tr.z, f.x, f.z) >= 11) { if (U.dist2d(p.x, p.z, tr.x, tr.z) > 0.5) CT.tp(tr.x, tr.z); break; } }
        const d = U.dist2d(p.x, p.z, f.x, f.z); minD = Math.min(minD, d); maxD = Math.max(maxD, d);
        if (pauseAfter && CT._followT >= pauseAfter) return { ok: true, paused: true, note: 'tailing at ' + d.toFixed(1) + ' m' };
        if (!M.state.active) { const log = CT.followLog; CT._trail = null; CT.followLog = null; return { ok: false, note: 'the tail failed after ' + CT._followT + 's at ' + d.toFixed(1) + ' m: ' + JSON.stringify(log) + ' last ' + JSON.stringify({ x: Math.round(f.x), z: Math.round(f.z), px: Math.round(p.x), pz: Math.round(p.z), kd: !!f.knockedDown, inVeh: !!f.inVehicle, sp: +f.speed.toFixed(1) }) }; }
      }
      const done = CT.def() !== def;
      if (!done && M.state.active) { M.completeObjective(); CT.fallbacks.push(M.state.active + ': follow forced after ' + CT._followT + 's ' + JSON.stringify(CT.followLog)); CT.adv(0.2); }
      CT._trail = null; CT.followLog = null;
      return { ok: true, note: 'tailed for ' + CT._followT + 's, dist ' + minD.toFixed(1) + '..' + maxD.toFixed(1) + ' m' + (done ? '' : ' (forced)') };
    },
    // a beat cop closing in for the arrest: step away from him (a player would run; the bust needs 2.2 s at arm's reach)
    dodge() {
      const p = CT.p(), fl = M.state.flags || {};
      const cop = GTP.Entities.near(p.x, p.z, 3.2, 'ped').find((e) => e.alive && !e.inVehicle && !e.hostile && !e.knockedDown && (e.role === 'cop' || e.role === 'swat' || (e.role === 'hoa' && fl.hoa_enemy)));
      if (!cop) return false;
      const dx = p.x - cop.x, dz = p.z - cop.z, l = Math.hypot(dx, dz) || 1;
      const r = GTP.World.resolveCapsule(p.x + dx / l * 8, p.z + dz / l * 8, p.y + 0.5, 0.45);
      CT.tp(r.x, r.z); CT.dodges = (CT.dodges || 0) + 1;
      return true;
    },
    // sprint away from every cop within 30 m (the test's stand-in for running): a sidewalk or road point `dist` metres off,
    // directly away from the cops' centroid, so a car can be borrowed without a cop at the door
    runFromCops(dist) {
      const p = CT.p(), W = GTP.World;
      const cops = GTP.Entities.near(p.x, p.z, 30, 'ped').filter((e) => e.alive && !e.inVehicle && (e.role === 'cop' || e.role === 'swat' || e.role === 'hoa'));
      if (!cops.length) return 0;
      let cx = 0, cz = 0; cops.forEach((c) => { cx += c.x; cz += c.z; }); cx /= cops.length; cz /= cops.length;
      let dx = p.x - cx, dz = p.z - cz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      for (const k of [1, 0.7, 1.4]) {
        const sp = W.nearestRoadPoint(p.x + dx * dist * k, p.z + dz * dist * k) || W.nearestSidewalkPoint(p.x + dx * dist * k, p.z + dz * dist * k);
        if (sp && GTP.Entities.near(sp.x, sp.z, 14, 'ped').every((e) => !(e.alive && (e.role === 'cop' || e.role === 'swat')))) { CT.tp(sp.x, sp.z); CT.adv(0.1); return cops.length; }
      }
      return cops.length;
    },
    // a sighted shot: the rig put on the target (the scope's first-person eye or the aim rig over the shoulder), aim held, one trigger pull
    aimedShot(tx, ty, tz, scoped) {
      const p = CT.p(), R = GTP.Render.rig;
      const dist = U.dist2d(tx, tz, p.x, p.z) || 1;
      R.yaw = U.dirToYaw(tx - p.x, tz - p.z);
      // first person (the scope): the look leaves the eye 1.6 m up and drops 3 m per 6 m forward per unit of sin(pitch);
      // the aim rig: the camera 1.85 m up and 2 m back looks 8 m ahead at 1.5 m, so the same slope rule holds about as well
      const eye = p.y + (scoped ? 1.6 : 1.85), slope = (eye - ty) / dist;
      R.pitch = Math.asin(U.clamp(slope * (scoped ? 2 : 1.4), -0.9, 0.9));
      p.yaw = R.yaw; p.aimYaw = R.yaw;
      CT.hold('aim', true); R.snap(); GTP.Render.updateCamera(0); CT.adv(2 / 60);
      CT.hold('shoot', true); CT.adv(2 / 60); CT.hold('shoot', false); CT.adv(0.25);
      CT.hold('aim', false); CT.adv(1 / 60);
    },
    // real fights: stand off each goon and fire the best weapon (fists lunge; the sniper from 40 m through its scope); god mode keeps the run deterministic
    fightOne(h, w) {
      const p = CT.p(), W = GTP.World, wd = GTP.Combat.WEAPONS[w], melee = wd.melee, scoped = !!wd.scope, range = melee ? 1.2 : scoped ? 40 : 6;
      let dx = p.x - h.x, dz = p.z - h.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const r = W.resolveCapsule(h.x + dx * range, h.z + dz * range, h.y + 0.5, 0.45);
      CT.tp(r.x, r.z); p.yaw = U.dirToYaw(h.x - p.x, h.z - p.z); p.aimYaw = p.yaw; p.weapon = w;
      if (scoped) { const hp0 = h.hp; CT.aimedShot(h.x, h.y + 1.05, h.z, true); CT._snipes = (CT._snipes || 0) + 1; if (h.hp < hp0 || !h.alive) CT._snipeHits = (CT._snipeHits || 0) + 1; return; }
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
      return { ok: CT.def() !== def, note: c.peds.length + ' goons with ' + CT.bestWeapon() + (forced ? ', ' + forced + ' forced' : '') + (CT._snipes ? ', snipes ' + CT._snipeHits + '/' + CT._snipes : '') + ', hp ' + Math.round(p.hp) };
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
    // wreck each target: a real aimed burst (or rocket / hot mic) first, then applyDamage with the same weapon (ammo is finite and the cars drive)
    wreckOne(v) {
      const p = CT.p(), W = GTP.World;
      if (p.inVehicle) { p.exitVehicle(); CT.adv(0.3); }
      const w = CT.bestWeapon(), wd = GTP.Combat.WEAPONS[w], heavy = !!(wd.rocket || wd.lobbed);
      const f = U.yawToDir(v.yaw), back = heavy ? 14 : 8, r = W.resolveCapsule(v.x - f.x * back, v.z - f.z * back, v.y + 0.5, 0.45);
      CT.tp(r.x, r.z);
      if (w !== 'fist' && !wd.melee && CT.hasRounds(w)) {
        p.weapon = w;
        const hp0 = v.hp;
        if (heavy) { CT.aimedShot(v.x, v.y + 0.8, v.z, false); CT.adv(wd.lobbed ? 2.8 : 0.6); }
        else {
          CT.hold('aim', true); GTP.Render.rig.yaw = U.dirToYaw(v.x - p.x, v.z - p.z); GTP.Render.rig.pitch = 0.14; GTP.Render.rig.snap(); CT.adv(0.1);
          CT.hold('shoot', true); CT.adv(0.8); CT.hold('shoot', false); CT.hold('aim', false);
        }
        CT._shotHits = (CT._shotHits || 0) + (v.hp < hp0 ? 1 : 0);
      }
      if (!CT.lost(v)) v.applyDamage(999, p, w === 'fist' || wd.melee ? 'hottake' : w);
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
      let s = CT.until(() => { CT.dodge(); return CT.def() !== def; }, 8, 0.25), extra = 0;
      // a WRONG TAKE (a van wrecked by something other than the named weapon) re-spawns the van: wreck the new one too
      let guard = 0;
      while (s < 0 && CT.def() === def && guard++ < 6) {
        const again = c.vehicles.find((v) => !CT.lost(v));
        if (again) { CT.wreckOne(again); extra++; CT.adv(0.5); const sp2 = W.nearestSidewalkPoint(again.x + 26, again.z + 8); if (sp2) CT.tp(sp2.x, sp2.z); }
        s = CT.until(() => { CT.dodge(); return CT.def() !== def; }, 6, 0.25);
      }
      GTP.game.debug.godMode(false);
      return { ok: s > 0, note: c.total + ' targets wrecked with ' + CT.bestWeapon() + ', aimed hits ' + (CT._shotHits || 0) + (extra ? ', ' + extra + ' re-spawned (WRONG TAKE ' + (c.wrong || 0) + ')' : '') };
    },
    // lose the stars: four and five stars need a respray (SWAT and the helicopter never lose sight), fewer are waited out far away
    escape() {
      const e = CT.expect('escape_wanted'); if (e === 'skip') return { ok: true, note: 'escape already passed' }; if (e) return { ok: false, note: e };
      const wd = GTP.AI.wanted, def = CT.def(), p = CT.p(), W = GTP.World, lvl = wd.level;
      CT.adv(1.1);
      if (lvl >= 4) {
        const garages = W.landmarks.filter((l) => l.garage);
        garages.sort((a, b) => U.dist2d(a.garage.cx, a.garage.cz, p.x, p.z) - U.dist2d(b.garage.cx, b.garage.cz, p.x, p.z));
        const g = garages[0];
        // on foot at four or five stars a player runs before borrowing a car: out of the closing cops' reach first (a car
        // stopped with a cop at the door is a bust), then the nearest parked car or a fresh one on the road
        if (!p.inVehicle) { CT.runFromCops(45); const r = CT.car(); if (!r.ok) return r; }
        const v = p.inVehicle, money0 = p.money;
        CT.tp(g.garage.cx, g.garage.cz); v.vx = v.vz = 0; v.speed = 0;
        const s = CT.until(() => wd.level === 0, 4, 0.1);
        const s2 = CT.until(() => CT.def() !== def, 4, 0.1);
        return { ok: s > 0 && s2 > 0, note: lvl + ' stars resprayed at ' + g.id + ' for $' + (money0 - p.money) };
      }
      // hide: the landmark door farthest from the last known position, on foot
      const lk = wd.lastKnown; let best = null, bd = 0;
      for (const id of ['fish_shack', 'moon_mine', 'memo_press', 'campus_quad', 'goldplate_links', 'balloon_depot', 'afterparty_yacht', 'clarity_barn', 'hangar_row', 'heirloom_club']) {
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
    // after the last objective: the outro, the card, an act cutscene (verified, then skipped), the credits on an ending
    finish(id, after) {
      const p = CT.p(), Cs = GTP.Cutscenes;
      CT._expectEnd = true;
      const s = CT.skipTalk(60, () => M.state.active !== id);
      let t = 0; while (M.state.active === id && t < 5) t += CT.adv(0.2);
      CT._expectEnd = false;
      let cutscene = null;
      if (after) {
        const w = CT.until(() => Cs.active, 6, 0.1);
        const hud = Cs.hud();
        cutscene = { id: after, started: w > 0 && Cs.active, after: w, title: hud.title, shots: hud.shots, letterbox: Cs.letterbox, state: GTP.game.state, actors: Object.keys(Cs.actors()) };
        CT.adv(1.2); GTP.game.render();
        cutscene.skipped = CT.skipCutscene(8);
        cutscene.flag = M.state.flags['cs_' + after] === true;
        CT.cutscenes.push(cutscene);
      }
      let credits = false;
      if (GTP.Content.endingMissions.indexOf(id) >= 0) {
        CT.adv(1.0);
        credits = GTP.game.state === 'paused' && GTP.UI.state.pause.page === 'credits' && !!GTP.UI.state.credits;
        GTP.game.render();
        CT.press('confirm'); CT.adv(0.3);
      }
      const subs = M.subscribers();
      return {
        s, state: GTP.game.state, active: M.state.active, completed: M.state.completed.has(id), flags: Object.assign({}, M.state.flags),
        failed: M.state.failed[id] || 0, money: p.money, weapons: Object.keys(p.weapons).filter((w) => p.weapons[w] > 0), weapon: p.weapon,
        ammo: Object.assign({}, p.weapons, { fist: 'inf' }), credits, endings: CT.endings.slice(), errors: GTP.errors.length, cash: CT.cash, spent: CT.spent, markers: M.markers().map((m) => m.kind + ':' + m.id),
        cutscene, subs: { count: subs.count, tier: subs.tier, name: subs.name }, busy: M.busy()
      };
    },
    step(name, arg) {
      const t0 = GTP.game.time.t;
      let r;
      try { r = CT[name](arg); } catch (e) { r = { ok: false, note: 'threw ' + (e && e.message) + ' ' + (e && e.stack || '').split('\n').slice(1, 3).join(' ') }; }
      r.secs = +(GTP.game.time.t - t0).toFixed(1); r.state = GTP.game.state; r.objective = M.state.objectiveText; r.errors = GTP.errors.length;
      r.fails = CT.fails.slice();
      return r;
    },
    frame() {
      const g = GTP.game;
      if (g.state === 'playing' || g.state === 'cutscene') { GTP.Render.rig.pitch = Math.max(GTP.Render.rig.pitch, 0.14); GTP.Render.rig.snap(); GTP.game.advance(0.05); }
      GTP.game.render();
      return { state: g.state, objective: M.state.objectiveText };
    },
    // ---- after the endings: the side strands, one cycle each (the strands test drives each in depth) ----
    strandSetup() {
      const p = CT.p();
      if (p.inVehicle) { p.exitVehicle(); CT.adv(0.2); }
      if (GTP.Strands.active()) GTP.Strands.end('test');
      GTP.AI.wanted.clear(); GTP.game.debug.godMode(false); CT.adv(0.3);
      CT._sev = []; if (!CT._sevOn) { CT._sevOn = true; ['strand:start', 'strand:cycle', 'strand:end', 'race:finish', 'stunt:land', 'memo', 'subs:tier'].forEach((ev) => GTP.Events.on(ev, (e) => CT._sev.push(ev + ':' + (e.id || e.ramp || e.race || '')))); }
    },
    spawnCar(type, dx) { const p = CT.p(); const rp = GTP.World.nearestRoadPoint(p.x + (dx || 12), p.z); return GTP.game.debug.spawnVehicle(rp.x, rp.z, type); },
    strandCab() {
      const S = GTP.Strands, p = CT.p(), money0 = p.money, subs0 = p.subs;
      CT.strandSetup();
      const taxi = CT.spawnCar('taxi'), inCab = CT.enterVehicle(taxi); CT.adv(0.5);
      CT.press('action'); CT.adv(0.2);
      const out = { inCab, active: S.active() };
      const s1 = CT.until(() => S.current() && S.current().fare, 6, 0.25);
      const f = S.current() && S.current().fare; if (!f) return Object.assign(out, { ok: false, note: 'no fare hailed' });
      CT.tp(f.ped.x + 2.5, f.ped.z); CT.adv(0.2);
      const s2 = CT.until(() => f.phase === 'ride', 6, 0.1);
      CT.tp(f.dest.x + 2, f.dest.z); CT.adv(0.1);
      const s3 = CT.until(() => !S.current() || !S.current().fare, 4, 0.1);
      CT.press('action'); CT.adv(0.2);
      return Object.assign(out, { ok: inCab && s1 > 0 && s2 > 0 && s3 > 0 && S.active() === null, note: 'fare in ' + s1 + 's, boarded ' + s2 + 's, paid ' + s3 + 's', money: p.money - money0, subs: p.subs - subs0, fares: S.progress().loud_cab.fares, cycles: CT._sev.filter((e) => /strand:cycle:loud_cab/.test(e)).length });
    },
    strandHoa() {
      const S = GTP.Strands, p = CT.p(), money0 = p.money;
      CT.strandSetup();
      const cop = CT.spawnCar('cop'), inCar = CT.enterVehicle(cop); CT.adv(0.5);
      CT.press('action'); CT.adv(0.2);
      const s1 = CT.until(() => S.current() && S.current().target, 8, 0.25);
      const c = S.current(), tgt = c && c.target; if (!tgt) return { ok: false, note: 'no violation flagged' };
      CT.adv(2);
      tgt.applyDamage(999, p, 'smg');
      const s2 = CT.until(() => c.level === 2, 10, 0.25);
      CT.press('action'); CT.adv(0.3);
      if (S.active()) S.end('test');
      return { ok: inCar && s1 > 0 && s2 > 0, note: 'flagged in ' + s1 + 's (' + c.violation + '), stopped in ' + s2 + 's', money: p.money - money0, stops: S.progress().hoa_patrol.stops, cycles: CT._sev.filter((e) => /strand:cycle:hoa_patrol/.test(e)).length };
    },
    strandSponsor() {
      const S = GTP.Strands, p = CT.p(), money0 = p.money;
      CT.strandSetup();
      const depot = GTP.World.landmark('nap_depot').door; CT.tp(depot.x + 6, depot.z); CT.adv(0.5);
      const s0 = CT.until(() => GTP.Entities.list.some((e) => e.kind === 'vehicle' && e.tag === 'sponsorvan' && !e.removed), 8, 0.5);
      const van = GTP.Entities.list.find((e) => e.kind === 'vehicle' && e.tag === 'sponsorvan' && !e.removed);
      if (!van) return { ok: false, note: 'no sponsor van at the depot after ' + s0 + 's' };
      const inVan = CT.enterVehicle(van); CT.adv(0.3);
      const c = S.current(); if (!c || !c.run) return { ok: false, note: 'the chain did not start (active ' + S.active() + ')' };
      CT.tp(c.run.dest.x + 2, c.run.dest.z); CT.adv(0.1);
      const s1 = CT.until(() => c.i === 1, 4, 0.1);
      p.exitVehicle(); CT.adv(0.2);
      const s2 = CT.until(() => !S.active(), 20, 0.5);
      return { ok: inVan && s1 > 0 && s2 > 0, note: 'run 1 paid in ' + s1 + 's, chain ended ' + s2 + 's after leaving the van', money: p.money - money0, runs: S.progress().sponsor_runs.runs, cycles: CT._sev.filter((e) => /strand:cycle:sponsor_runs/.test(e)).length };
    },
    strandRampage() {
      const S = GTP.Strands, p = CT.p(), money0 = p.money;
      CT.strandSetup(); GTP.game.debug.godMode(true);
      const mk = S.debug.markers().find((m) => m.id === 'rr_01'); if (!mk) return { ok: false, note: 'no rr_01 marker' };
      CT.tp(mk.x + 20, mk.z); CT.adv(0.3); CT.tp(mk.x, mk.z);
      const s1 = CT.until(() => S.active() === 'ratio_rampages', 3, 0.1);
      const c = S.current(); if (!c) return { ok: false, note: 'the rampage did not start' };
      const s2 = CT.until(() => c.hecklers.length > 0, 6, 0.25);
      let guard = 0;
      while (S.active() === 'ratio_rampages' && guard++ < 40) { c.hecklers.forEach((h) => { if (h.alive && !h.removed) GTP.Combat.damage(h, 999, p, c.def.weapon); }); CT.adv(0.5); }
      GTP.game.debug.godMode(false);
      return { ok: s1 > 0 && s2 > 0 && S.active() === null && c.kills >= 12, note: 'weapon ' + c.def.weapon + ', ' + c.kills + ' hecklers, wrong ' + c.wrong, money: p.money - money0, done: S.progress().ratio_rampages.done, cycles: CT._sev.filter((e) => /strand:cycle:ratio_rampages/.test(e)).length };
    },
    strandMemos() {
      const S = GTP.Strands, p = CT.p(), money0 = p.money, before = S.memos().collected.length;
      CT.strandSetup();
      const pks = Object.values(S.memoPickups()).slice(0, 10);
      for (const k of pks) { CT.tp(k.x, k.z, k.y); CT.adv(0.3); }
      CT.adv(0.5);
      const got = S.memos().collected.length - before;
      return { ok: got === 10, note: got + ' memos collected (' + S.memos().collected.length + '/' + S.memos().total + ')', money: p.money - money0, memos: CT._sev.filter((e) => /^memo:/.test(e)).length };
    },
    strandRace() {
      const S = GTP.Strands, p = CT.p(), money0 = p.money;
      CT.strandSetup();
      const start = S.debug.markers().find((m) => m.id === 'lr_01'); if (!start) return { ok: false, note: 'no lr_01 marker' };
      const car = GTP.game.debug.spawnVehicle(start.x, start.z + 10, 'sports', { yaw: 0, y: start.y });
      const inCar = CT.enterVehicle(car);
      CT.tp(start.x, start.z, start.y); CT.adv(0.3);
      GTP.Input.set('jump', true);
      const s1 = CT.until(() => S.races.active(), 4, 0.1);
      GTP.Input.set('jump', false);
      const rc = S.races.cur; if (!rc) return { ok: false, note: 'the race did not start' };
      CT.adv(1.2); GTP.Render.rig.yaw = Math.PI; GTP.Render.rig.pitch = 0.22; GTP.Render.rig.snap(); CT.adv(0.05); GTP.game.render();
      GTP.game.debug.godMode(true);
      CT.adv(2.5);
      for (let i = 0; i < 12 && S.races.active(); i++) { const cp = S.races.nextCheckpoint(); CT.tp(cp.x, cp.z, cp.y); CT.adv(0.3); }
      GTP.game.debug.godMode(false);
      const pr = S.progress().loop_races;
      return { ok: inCar && s1 > 0 && !S.races.active() && pr.finishes.lr_01 === 1, note: 'racers ' + rc.racers.length + ', finished, best ' + pr.best.lr_01, money: p.money - money0, finishes: CT._sev.filter((e) => /race:finish:lr_01/.test(e)).length };
    },
    strandStunt() {
      const S = GTP.Strands, p = CT.p(), money0 = p.money, subs0 = p.subs;
      CT.strandSetup();
      const ramp = S.stunts.ramp('sj_07'); if (!ramp) return { ok: false, note: 'no sj_07' };
      const f = GTP.util.yawToDir(ramp.yaw);
      const car = GTP.game.debug.spawnVehicle(ramp.x - f.x * 40, ramp.z - f.z * 40, 'sports', { yaw: ramp.yaw });
      const inCar = CT.enterVehicle(car);
      GTP.Input.set('forward', true);
      const s1 = CT.until(() => CT._sev.some((e) => /stunt:land:sj_07/.test(e)), 16, 0.1);
      GTP.Input.set('forward', false); CT.adv(0.5);
      const pr = S.progress().stunt_jumps;
      return { ok: inCar && s1 > 0 && pr.done.indexOf('sj_07') >= 0 && !car.wreck, note: 'landed in ' + s1 + 's, time scale ' + GTP.game.timeScale, money: p.money - money0, subs: p.subs - subs0 };
    },
    shopBuy() {
      const CB = GTP.Combat, p = CT.p(), money0 = p.money;
      CT.strandSetup();
      const lm = GTP.World.landmark('both_sides_strip'); if (!lm) return { ok: false, note: 'no shop landmark' };
      CT.tp(lm.door.x, lm.door.z); CT.adv(0.2);
      let bought = null; GTP.Events.on('shop:buy', (e) => { bought = { id: e.item.id, price: e.price }; });
      CB.shop.open(lm.id); CT.adv(0.1);
      const open = { page: !!GTP.UI.state.shopOpen, open: CB.shop.state.open, store: CB.shop.state.store && CB.shop.state.store.name, control: p.controlEnabled };
      const items = CB.shop.items(), pick = items.find((it) => it.canBuy && it.tab === 'ammo') || items.find((it) => it.canBuy && it.tab === 'gear') || items.find((it) => it.canBuy);
      if (!pick) return { ok: false, note: 'nothing buyable: ' + items.map((it) => it.id + (it.locked ? '(locked)' : it.owned ? '(owned)' : '')).join(','), open };
      const r = CB.shop.buy(pick.id); CT.adv(0.2);
      CB.shop.close(); CT.adv(0.2);
      return { ok: r.ok && bought && bought.id === pick.id && p.money === money0 - pick.price && !CB.shop.state.open, note: pick.id + ' for $' + pick.price + (r.reason ? ' (' + r.reason + ')' : ''), open, bought, money: p.money - money0, page: !!GTP.UI.state.shopOpen, stats: p.stats.shopBuys };
    }
  };
  GTP.Events.on('mission:fail', (e) => CT.fails.push(e.id + ':' + e.reason));
  GTP.Events.on('mission:ending', (e) => CT.endings.push(e.id));
  GTP.Events.on('garage', (e) => { CT.spent += e.cost; });
  GTP.Events.on('pickup', (e) => { const pk = e && e.pickup; if (pk && pk.pickupType === 'cash') CT.cash += pk.value | 0; });
  GTP.Events.on('busted', () => CT.fails.push('BUSTED'));
  GTP.Events.on('player:wasted', () => CT.fails.push('WASTED'));
  GTP.Events.on('subs:tier', (e) => CT.subsLog.push(e));
  // every point of heat, with its source: a campaign run should never attract the police by accident
  CT.heat = [];
  GTP.Events.on('heat', (e) => { const s = e.src; CT.heat.push({ t: +GTP.game.time.t.toFixed(1), n: e.amount, src: typeof s === 'string' ? s : s ? (s.kind + ':' + (s.role || s.type || '') + (s.hostile ? '!' : '')) : null, heat: +e.heat.toFixed(1), mission: M.state.active, obj: M.state.objectiveText }); });
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
  await page.evaluate(() => { try { localStorage.removeItem('gtp.save.v2'); for (let i = 1; i <= 3; i++) localStorage.removeItem('gtp.save.v3.slot' + i); } catch (e) { /* storage may be blocked */ } cancelAnimationFrame(GTP.game._raf); GTP.game._raf = 0; });
  await page.keyboard.press('Enter');
  // the loading screen (the chunk prebuild over the page's own animation frames, then a 0.3 s hold ticked by step) must be over
  // before play, and the opening, can begin; the game loop is cancelled, so the poll steps the hold down itself
  await page.waitForFunction(() => { GTP.game.advance(0.1); return GTP.game.state === 'playing' && !GTP.game.loading.active; }, null, { timeout: 240000, polling: 200 });
  const started = await page.evaluate(() => { GTP.game.advance(0.3); return { state: GTP.game.state, money: GTP.game.player.money, missions: GTP.Missions.allMissions().length, markers: GTP.Missions.markers().map((m) => m.id), loading: GTP.game.loading.active }; });
  console.log('  new game: ' + JSON.stringify(started));
  t.assert(started.state === 'playing' && started.money === 250 && started.missions === 25, 'Enter on the title starts a new game with $250 and 25 story missions');
  t.assert(started.markers.length === 1 && started.markers[0] === 'm00_intro', 'only m00_intro is lit at the start');
  await page.evaluate(installDriver);

  // ---- the opening cutscene (the NEW GAME slot flow's path), verified and skipped ----
  const opening = await page.evaluate(() => CT.opening());
  await page.screenshot({ path: t.OUT + '/campaign_opening.png' });
  const openingSkip = await page.evaluate(() => CT.openingSkip());
  console.log('  opening: ' + JSON.stringify(opening) + ' skip: ' + JSON.stringify(openingSkip));
  t.assert(opening.scripted && opening.state === 'cutscene' && opening.active && opening.letterbox && opening.shots >= 2 && opening.control === false, 'cs_opening plays on the new game with the letterbox and the player parked: ' + JSON.stringify(opening));
  t.assert(opening.actors.indexOf('gus') >= 0 && opening.actors.indexOf('kip') >= 0, 'Gus and Kip are on the quad for the opening: ' + opening.actors.join(','));
  t.assert(openingSkip.s > 0 && openingSkip.state === 'playing' && openingSkip.flag && openingSkip.control && openingSkip.markers.join(',') === 'm00_intro', 'holding confirm skips it once per save and the first light waits: ' + JSON.stringify(openingSkip));

  const results = {};
  let expectedMoney = 250, lastCash = 0, lastSpent = 0, expectedSubs = 0, lastTier = 0;
  const missionDefs = await page.evaluate(() => { const o = {}; GTP.Missions.allMissions().forEach((m) => { o[m.id] = { reward: m.reward, onComplete: m.onComplete || {}, title: m.title, giver: m.giver, intro: m.intro.length, objectives: m.objectives.length, act: m.act || null }; }); return o; });
  const tiers = await page.evaluate(() => (GTP.Content.expansion.subscriberTiers || []).map((x) => ({ subs: x.subs | 0, name: x.name })));
  const tierFor = (n) => { let k = 0; tiers.forEach((x, i) => { if (n >= x.subs) k = i; }); return k; };
  const chain = await page.evaluate(() => GTP.Content.expansion.chain.slice());
  t.assert(chain.join(',') === ORDER.join(','), 'the content\'s chain is the GDD order: ' + chain.join(','));

  // debugging aid: CAMPAIGN_FROM=<id> marks the earlier missions complete (prep applies their flags and weapons) and starts there
  let order = ORDER;
  if (process.env.CAMPAIGN_FROM && ORDER.indexOf(process.env.CAMPAIGN_FROM) > 0) {
    const from = process.env.CAMPAIGN_FROM;
    const pre = await page.evaluate((mid) => { GTP.Missions.prep(mid, {}); GTP.game.advance(0.1); GTP.Missions.abort(); GTP.game.advance(0.3); GTP.game.debug.setMoney(250 + 5000); return { completed: Array.from(GTP.Missions.state.completed), money: GTP.game.player.money, subs: GTP.game.player.subs, markers: GTP.Missions.markers().map((m) => m.id) }; }, from);
    console.log('  CAMPAIGN_FROM ' + from + ': ' + JSON.stringify(pre));
    expectedMoney = pre.money; expectedSubs = pre.subs; order = ORDER.slice(ORDER.indexOf(from));
  }

  for (const id of order) {
    const def = missionDefs[id];
    const t0 = Date.now();
    // walk into the light
    const st = await page.evaluate((mid) => CT.start(mid), id);
    console.log('  ' + id + ' start: ' + JSON.stringify(st));
    t.assert(st.ok, id + ' started by walking into its light: ' + JSON.stringify(st));
    t.assert(st.state === 'cutscene' && st.line, id + ' opens with its intro (state ' + st.state + ', line ' + st.line + ')');
    t.assert(st.cutscene && st.cutscene.shots >= 2 && st.cutscene.letterbox, id + ' intro is a cs_intro cutscene with two shots: ' + JSON.stringify(st.cutscene));
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
    const fin = await page.evaluate(({ mid, after }) => CT.finish(mid, after), { mid: id, after: AFTER[id] || null });
    console.log('  ' + id + ' done (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s wall): ' + JSON.stringify(fin));
    results[id] = fin;
    const heat = await page.evaluate(() => { const h = CT.heat.slice(); CT.heat.length = 0; return { log: h, wanted: GTP.game.player.wanted, heat: +GTP.AI.wanted.heat.toFixed(1) }; });
    if (heat.log.length) console.log('  ' + id + ' heat: ' + JSON.stringify(heat));
    if (process.env.CAMPAIGN_TO === id) { console.log('  CAMPAIGN_TO ' + id + ': stopping here'); break; }
    t.assert(fin.completed && fin.active === null && fin.failed === 0, id + ' completed: ' + JSON.stringify({ completed: fin.completed, active: fin.active, failed: fin.failed, state: fin.state }));
    // the reward, minus resprays, plus any cash picked up
    expectedMoney += def.reward - (fin.spent - lastSpent) + (fin.cash - lastCash); lastSpent = fin.spent; lastCash = fin.cash;
    t.assert(fin.money === expectedMoney, id + ' paid ' + def.reward + ': money ' + fin.money + ' expected ' + expectedMoney);
    // subscribers: reward x 5 per story mission (chaos subs may add a trickle), the tier from the content's table and never down
    expectedSubs += def.reward * 5;
    t.assert(fin.subs.count >= expectedSubs && fin.subs.tier === tierFor(fin.subs.count) && fin.subs.tier >= lastTier, id + ' subscribers ' + JSON.stringify(fin.subs) + ' (expected at least ' + expectedSubs + ', tier ' + tierFor(fin.subs.count) + ')');
    lastTier = fin.subs.tier;
    // flags
    const oc = def.onComplete;
    if (oc.setFlag) t.assert(fin.flags[oc.setFlag] === true, id + ' sets flag ' + oc.setFlag);
    // weapons in the GDD order
    if (oc.unlockWeapon) {
      t.assert(fin.weapons.indexOf(oc.unlockWeapon) >= 0 && fin.weapon === oc.unlockWeapon, id + ' unlocks ' + oc.unlockWeapon + ': ' + JSON.stringify(fin.weapons) + ' held ' + fin.weapon);
      t.assert(UNLOCKS[id] === oc.unlockWeapon, id + ' unlock matches the GDD table');
    }
    if (oc.takeWeapon) t.assert(fin.weapons.indexOf(oc.takeWeapon) < 0, id + ' takes the ' + oc.takeWeapon + ' back: ' + JSON.stringify(fin.weapons));
    const expectedWeapons = ORDER.slice(0, ORDER.indexOf(id) + 1).map((m) => UNLOCKS[m]).filter(Boolean);
    expectedWeapons.forEach((w) => t.assert(fin.weapons.indexOf(w) >= 0 || fin.ammo[w] == null, id + ': ' + w + ' still owned (or spent): ' + JSON.stringify(fin.ammo)));
    t.assert(fin.weapons.indexOf('shotgun') < 0 || ORDER.indexOf(id) > ORDER.indexOf('m11_trustless'), id + ': no shotgun before m11 (pickup only)');
    t.assert(fin.state === 'playing' && !fin.busy, id + ' leaves the game playing and the runtime idle: ' + fin.state + (fin.busy ? ' (busy)' : ''));
    t.assert(fin.errors === 0, id + ' left GTP.errors empty: ' + fin.errors);
    if (AFTER[id]) t.assert(fin.cutscene && fin.cutscene.started && fin.cutscene.shots >= 2 && fin.cutscene.letterbox && fin.cutscene.skipped > 0 && fin.cutscene.flag, id + ' is followed by ' + AFTER[id] + ', verified and skipped: ' + JSON.stringify(fin.cutscene));
    if (id === 'm15a_primetime' || id === 'm15b_liveread') t.assert(fin.credits && fin.endings.indexOf(id) >= 0, id + ' rolled the credits after its ending cutscene: ' + JSON.stringify({ credits: fin.credits, endings: fin.endings }));
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

  const summary = await page.evaluate(() => ({ completed: Array.from(GTP.Missions.state.completed), flags: GTP.Missions.state.flags, endings: CT.endings, fallbacks: CT.fallbacks, how: CT.how, fails: CT.fails, skips: CT.skips, dodges: CT.dodges || 0, starsLost: CT.starsLost || [], money: GTP.game.player.money, subs: GTP.Missions.subscribers(), tiers: CT.subsLog.map((e) => e.tier + ':' + e.name), cutscenes: CT.cutscenes.map((c) => c.id + ':' + (c.started ? 'ok' : 'MISSING')), stats: GTP.game.player.stats, day: GTP.game.time.day, clock: +GTP.game.time.clock.toFixed(2), t: +GTP.game.time.t.toFixed(0) }));
  console.log('  campaign: ' + JSON.stringify(summary));
  if (process.env.CAMPAIGN_TO) { await page.close(); return; }   // a partial debugging run: no campaign-wide assertions
  t.assert(summary.completed.length === 25, 'all 25 missions completed: ' + summary.completed.length);
  t.assert(summary.endings.length === 2 && summary.endings.indexOf('m15a_primetime') >= 0 && summary.endings.indexOf('m15b_liveread') >= 0, 'both endings fired the credits hook: ' + summary.endings.join(','));
  t.assert(summary.fails.length === 0, 'no mission failed, no death, no bust during the campaign: ' + summary.fails.join(','));
  const walked = Object.keys(summary.how).filter((k) => summary.how[k] !== 'direct').length;
  t.assert(walked === order.length, 'every mission was started by walking into its light: ' + JSON.stringify(summary.how));
  if (summary.fallbacks.length) console.log('  fallbacks used: ' + summary.fallbacks.join(' | '));
  ['has_table', 'has_van', 'seen_airport', 'sponsored', 'a_voice', 'range_trained', 'contract_sold', 'table_loaned', 'show_renamed', 'ferry_friend', 'theft_pinned', 'jets_arrived', 'scooters_billed', 'byline', 'has_memo', 'hoa_enemy', 'rugged', 'knows_memo', 'cited', 'survived_thursday', 'launched', 'offered_chair', 'ending_primetime', 'ending_grass'].forEach((f) => t.assert(summary.flags[f] === true, 'flag ' + f + ' set'));
  // the cutscene flags come from playing: a CAMPAIGN_FROM run preps the earlier missions without their act cutscenes
  (process.env.CAMPAIGN_FROM ? ['cs_cs_ending_a', 'cs_cs_ending_b'] : ['cs_cs_opening', 'cs_cs_act2', 'cs_cs_act3', 'cs_cs_twist', 'cs_cs_ending_a', 'cs_cs_ending_b']).forEach((f) => t.assert(summary.flags[f] === true, 'cutscene flag ' + f + ' set'));
  const fullRun = !process.env.CAMPAIGN_FROM;
  t.assert(summary.subs.count >= expectedSubs && summary.subs.tier >= tierFor(expectedSubs) && (!fullRun || summary.subs.tier >= 3), 'the campaign\'s rewards climb the subscriber tiers (' + summary.subs.count + ' subs, tier ' + summary.subs.tier + ' ' + summary.subs.name + '; reward subs ' + expectedSubs + ')');
  t.assert(summary.tiers.length >= (fullRun ? 3 : 1), 'subs:tier fired as the tiers were crossed: ' + summary.tiers.join(','));

  // ---- the side strands, one cycle each, and a purchase at Both Sides Arms ----
  const strands = {};
  for (const name of ['strandCab', 'strandHoa', 'strandSponsor', 'strandRampage', 'strandMemos', 'strandRace', 'strandStunt', 'shopBuy']) {
    const r = await page.evaluate((n) => { const t0 = GTP.game.time.t; let out; try { out = CT[n](); } catch (e) { out = { ok: false, note: 'threw ' + (e && e.message) + ' ' + (e && e.stack || '').split('\n').slice(1, 3).join(' ') }; } out.secs = +(GTP.game.time.t - t0).toFixed(1); out.errors = GTP.errors.length; return out; }, name);
    console.log('  ' + name + ': ' + JSON.stringify(r));
    if (name === 'strandRace') await page.screenshot({ path: t.OUT + '/campaign_race.png' });
    strands[name] = r;
    t.assert(r.ok, name + ' completed one cycle: ' + JSON.stringify(r));
    t.assert(r.errors === 0, name + ' left GTP.errors empty');
  }
  t.assert(strands.strandCab.money >= 50 && strands.strandCab.subs >= 150 && strands.strandCab.cycles === 1, 'Loud Cab: the fare paid and the cycle counted: ' + JSON.stringify(strands.strandCab));
  t.assert(strands.strandHoa.money === 200 && strands.strandHoa.stops >= 1 && strands.strandHoa.cycles === 1, 'HOA Patrol: a stop at level 2 pays $200: ' + JSON.stringify(strands.strandHoa));
  t.assert(strands.strandSponsor.money >= 100 && strands.strandSponsor.runs >= 1 && strands.strandSponsor.cycles === 1, 'Sponsor Runs: the first delivery paid: ' + JSON.stringify(strands.strandSponsor));
  t.assert(strands.strandRampage.money === 400 && strands.strandRampage.done >= 1 && strands.strandRampage.cycles === 1, 'Ratio Rampage: twelve hecklers down pays $400: ' + JSON.stringify(strands.strandRampage));
  t.assert(strands.strandMemos.memos === 10 && strands.strandMemos.money === 500, 'Monday Memos: ten memos, the $500 at ten: ' + JSON.stringify(strands.strandMemos));
  t.assert(strands.strandRace.finishes === 1 && strands.strandRace.money > 0, 'Loop Race lr_01: a finish with a prize: ' + JSON.stringify(strands.strandRace));
  t.assert(strands.strandStunt.money === 500 && strands.strandStunt.subs === 1000, 'Stunt Jump sj_07: STUNT PUNDIT pays $500 and 1000 subs: ' + JSON.stringify(strands.strandStunt));
  t.assert(strands.shopBuy.open.page && strands.shopBuy.open.open && strands.shopBuy.bought && strands.shopBuy.stats >= 1 && !strands.shopBuy.page, 'Both Sides Arms: the page opens at the door, the purchase is paid and the page closes: ' + JSON.stringify(strands.shopBuy));

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
  await page.close();
});
