/* newplayer.js: the v0.3 new-player acceptance test (PLAN_V03.md "The bar for v0.3").
 *
 * A first-time player opens the game (non-headless: loading screen, title menu), presses Enter on NEW GAME and then plays with
 * scripted inputs that follow ONLY what the screen shows: the objective text, the HUD arrow, the minimap / map markers, the GPS
 * line (gps:set events and GTP.World.route, the line the minimap draws), dialogue boxes, the cutscene's HOLD TO SKIP pill, the
 * debate cards, the pause menu. No teleports, no debug helpers, no direct mission starts. Inputs go through GTP.Input.set /
 * GTP.Input.setLook (keys and mouse look) and page.keyboard on the title. Simulated time starts at the Enter press.
 *
 * Steps (each reports PASS / FAIL / SKIP with the reason; a missing feature is reported, never a crash):
 *   1 title        the title menu shows NEW GAME and Enter starts a new game
 *   2 story_1min   a story mission is running (intro or objective on screen) within 60 s, without walking into a marker
 *   3 gps_first    the first objective is reached by following the on-screen GPS route, no waypoint set by hand
 *   4 m00          m00_intro (Table Stakes) completed
 *   5 m01_van      m01_van (Loud & Correct) completed (m01c_both_sides requires it in the v0.3 chain)
 *   6 m01c         m01c_both_sides (Merle's free pistol, the range, how buying works) completed
 *   7 armory       inside the Both Sides Arms armory interior (GTP.Interiors.active, interior:enter kind armory)
 *   8 pistol       holding a pistol that is visible on the player's model while inside the armory
 *   9 aim          aimed the pistol once (over-the-shoulder aim on hold)
 *  10 cover        took cover once (input action `cover`, event cover:enter)
 *  11 save         saved the game by hand from the pause menu (event `saved`, not an autosave)
 *  12 ten_min      all of the above within 600 s of simulated time
 * Fallbacks keep the run going after a failed step so later steps still get measured (for example walking into the blue light
 * when the story does not start by itself, or the test's own path search when there is no GPS line); a step reached through a
 * fallback stays FAIL.
 *
 * Exit code 0 only when every step passes. Output: a step table on stdout, tests/out/newplayer_report.json, screenshots
 * tests/out/newplayer_<n>_<name>.png (look at them).
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/newplayer.js
 *   NEWPLAYER_SEED=<int> (default 7), NEWPLAYER_BUDGET=<seconds> (default 600, the bar), NEWPLAYER_VERBOSE=1 (the in-page log) */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./_harness');

const SEED = +(process.env.NEWPLAYER_SEED || 7);
const BUDGET = +(process.env.NEWPLAYER_BUDGET || 600);
const VERBOSE = !!process.env.NEWPLAYER_VERBOSE;
const STEPS = [
  ['title', 'Title menu shows NEW GAME; Enter starts a new game'],
  ['story_1min', 'In the story within 60 s (a mission starts by itself)'],
  ['gps_first', 'First objective reached by following the on-screen GPS route'],
  ['m00', 'm00_intro completed'],
  ['m01_van', 'm01_van completed'],
  ['m01c', 'm01c_both_sides completed'],
  ['armory', 'Inside the armory interior'],
  ['pistol', 'Holding a visible pistol inside the armory'],
  ['aim', 'Aimed the pistol once'],
  ['cover', 'Took cover once'],
  ['save', 'Saved the game by hand'],
  ['ten_min', 'All of it within ten minutes of simulated time']
];

// ------------------------------------------------------------------------------------------------ in-page player --
// Installed once in the page (a classic-script context). Everything it reads is something the screen shows; the comments say which.
function installPlayer(budget) {
  const U = GTP.util, M = GTP.Missions, In = GTP.Input, STEP = GTP.C.STEP || 1 / 60;
  const NP = window.NP = {
    budget,
    t0steps: GTP.game.steps,
    log: [], notes: {}, events: { gps: [], phone: [], chapter: [], interiorEnter: [], interiorExit: [], coverEnter: 0, saved: [], complete: [], start: [], fail: [], range: [], buy: [], objective: [] },
    held: {},
    usedFallback: {},
    // ---- clock: simulated seconds since the Enter press (fixed steps the game ran) ----
    now() { return (GTP.game.steps - NP.t0steps) * STEP; },
    over() { return NP.now() > NP.budget + 120; },   // hard stop a little past the budget so later steps still report
    say(s) { NP.log.push('[' + NP.now().toFixed(1) + 's] ' + s); },
    // ---- inputs (keys and mouse look only) ----
    hold(a, on) { if (NP.held[a] === !!on) return; NP.held[a] = !!on; In.set(a, !!on); },
    releaseAll() { for (const a in NP.held) if (NP.held[a]) In.set(a, false); NP.held = {}; },
    press(a) { In.set(a, true); GTP.game.advance(STEP); In.set(a, false); GTP.game.advance(STEP); },
    adv(s) { GTP.game.advance(s); },
    // turn the camera toward a world yaw with mouse-look deltas (the rig reads look.dx px * lookSens rad)
    lookToward(yaw, maxRadPerCall) {
      const rig = GTP.Render.rig, sens = (GTP.C.CAMERA && GTP.C.CAMERA.lookSens) || 0.0032;
      let err = U.wrapAngle(yaw - rig.yaw); const lim = maxRadPerCall || 0.35;
      err = Math.max(-lim, Math.min(lim, err));
      if (Math.abs(err) > 0.002) In.setLook(-err / sens, 0);
    },
    // ---- what the screen shows ----
    p() { return GTP.game.player; },
    hud() { return M.hud ? M.hud() : {}; },
    objectiveText() { const h = NP.hud(); return h && h.active && h.phase === 'play' ? (h.objective || '') : ''; },
    arrow() { try { return M.objectiveTarget ? M.objectiveTarget() : null; } catch (e) { return null; } },   // the HUD arrow
    markers() { try { return (M.allMarkers ? M.allMarkers() : M.markers()) || []; } catch (e) { return []; } },   // minimap blips
    talking() { return !!GTP.UI.state.dialogue || !!(M.dialogue && M.dialogue.active); },
    cutscene() { const Cs = GTP.Cutscenes; return !!(Cs && Cs.active); },
    lastGps() { const g = NP.events.gps; return g.length ? g[g.length - 1] : null; },
    // the GPS line the minimap draws: GTP.World.route (v0.3) to the current GPS target; null when the game has none
    gpsRoute(tx, tz) {
      const W = GTP.World, p = NP.p();
      if (W.route) { try { const r = W.route(p.x, p.z, tx, tz); if (r && r.length) return { pts: r, src: 'World.route' }; } catch (e) { NP.say('World.route threw ' + e.message); } }
      return null;
    },
    // a fallback path when the game shows no GPS line: what a player would piece together from the map (marked as a fallback)
    ownRoute(tx, tz, mode) {
      const W = GTP.World, p = NP.p();
      let path = null; try { path = W.findPath(p.x, p.z, tx, tz, { mode: mode || 'ped', fromY: p.y }); } catch (e) { path = null; }
      if (!path || !path.length) return { pts: [{ x: tx, z: tz }], src: 'straight' };
      return { pts: path.map((n) => ({ x: n.x, z: n.z })), src: 'findPath' };
    },
    // ---- generic housekeeping while playing: dialogue, cutscenes, cards, phone calls ----
    housekeeping() {
      const g = GTP.game, ui = GTP.UI.state;
      if (NP.cutscene()) {   // the HOLD TO SKIP pill
        NP.releaseAll(); In.set('confirm', true); NP.adv(0.8); In.set('confirm', false); NP.adv(0.1);
        NP.notes.cutscenesSkipped = (NP.notes.cutscenesSkipped || 0) + 1; return true;
      }
      if (ui.dialogue) {   // read the line (about a second), then confirm
        NP.releaseAll();
        if ((ui.dialogue.t || 0) > 0.9) NP.press('confirm'); else NP.adv(0.1);
        return true;
      }
      if (ui.confirm) { NP.press('confirm'); return true; }
      if (g.state === 'wasted' || g.state === 'busted') { NP.releaseAll(); NP.adv(0.5); NP.notes.deaths = (NP.notes.deaths || 0) + 1; return true; }
      if (g.state === 'paused') { NP.press('pause'); return true; }
      return false;
    },
    // ---- moving on foot: camera toward the next point, forward + run held ----
    // follow(route) walks a list of points; stop() decides when the job is done. Returns {ok, why}.
    walk(getRoute, stop, maxSec, opts) {
      opts = opts || {};
      const p = NP.p(); let route = getRoute(), i = 0, t = 0, lastProg = 0, best = 1e9, stuck = 0, reroutes = 0, sideT = 0, detour = null;
      const W = GTP.World;
      while (t < maxSec && !NP.over()) {
        if (stop()) { NP.releaseAll(); return { ok: true, t }; }
        if (NP.housekeeping()) { t += 0.2; continue; }
        if (GTP.game.state === 'minigame') { NP.releaseAll(); return { ok: false, why: 'minigame' }; }
        if (p.inVehicle) { NP.releaseAll(); return { ok: false, why: 'in a vehicle' }; }
        const pts = route.pts;
        while (i < pts.length - 1 && U.dist2d(p.x, p.z, pts[i].x, pts[i].z) < 2.6) i++;
        if (detour && (U.dist2d(p.x, p.z, detour.x, detour.z) < 1.2 || t > detour.until)) detour = null;
        const k = i, tg = detour || pts[k], d = U.dist2d(p.x, p.z, tg.x, tg.z);
        NP.lookToward(U.dirToYaw(tg.x - p.x, tg.z - p.z));
        NP.hold('forward', true); NP.hold('run', d > 3 && !opts.walk);
        if (sideT > 0) { NP.hold(stuck % 2 ? 'left' : 'right', true); sideT -= 1 / 30; } else { NP.hold('left', false); NP.hold('right', false); }
        NP.adv(1 / 30); t += 1 / 30;
        // progress along the route; stuck for 1.5 s: jump and sidestep, then re-route
        const rem = U.dist2d(p.x, p.z, pts[pts.length - 1].x, pts[pts.length - 1].z) + (pts.length - 1 - i) * 4;
        if (rem < best - 0.5) { best = rem; lastProg = t; }
        if (t - lastProg > 1.5) {
          stuck++; lastProg = t; NP.press('jump'); sideT = 0.5;
          // still stuck: step around it, a few metres to one side (alternating, growing), on open ground
          if (stuck >= 2 && !detour) {
            const f = U.yawToDir(p.yaw), side = stuck % 2 ? 1 : -1, r = 3 + Math.min(9, stuck * 1.5);
            for (const back of [0, -2, 2]) {
              const dx = p.x + (-f.z) * side * r + f.x * back, dz = p.z + f.x * side * r + f.z * back;
              if (!W.solidAt(dx, dz, p.y + 0.5)) { detour = { x: dx, z: dz, until: t + 4 }; break; }
            }
            NP.notes.detours = (NP.notes.detours || 0) + 1;
          }
          if (stuck % 3 === 0 && reroutes < 12) { route = getRoute(); i = 0; best = 1e9; reroutes++; }
        }
        // at the end of the route: stand still there (a mission light needs the player to stay inside it for a moment)
        if (i >= pts.length - 1 && d < 1.0) {
          NP.releaseAll(); NP.adv(0.8); t += 0.8; if (stop()) return { ok: true, t };
          if (opts.keepGoing) { NP.releaseAll(); return { ok: stop(), t, why: 'stood at the end of the route, nothing happened' }; }
          route = getRoute(); i = 0;
        }
      }
      NP.releaseAll();
      return { ok: stop(), t, why: NP.over() ? 'out of time' : 'gave up after ' + maxSec + ' s' };
    },
    // ---- driving: throttle + left / right keys (pulse steering), handbrake to stop ----
    drive(getRoute, stop, maxSec) {
      const p = NP.p(); let route = getRoute(), i = 0, t = 0, lastProg = 0, best = 1e9, rev = 0, reroutes = 0;
      while (t < maxSec && !NP.over()) {
        if (stop()) { NP.releaseAll(); NP.hold('jump', true); NP.adv(0.4); NP.releaseAll(); return { ok: true, t }; }
        if (NP.housekeeping()) { t += 0.2; continue; }
        const v = p.inVehicle; if (!v) { NP.releaseAll(); return { ok: false, why: 'not in a vehicle' }; }
        const pts = route.pts;
        while (i < pts.length - 1 && U.dist2d(v.x, v.z, pts[i].x, pts[i].z) < 6) i++;
        let k = i; while (k < pts.length - 1 && U.dist2d(v.x, v.z, pts[k].x, pts[k].z) < 9) k++;
        const tg = pts[k], d = U.dist2d(v.x, v.z, tg.x, tg.z), last = pts[pts.length - 1];
        const dEnd = U.dist2d(v.x, v.z, last.x, last.z);
        const err = U.wrapAngle(U.dirToYaw(tg.x - v.x, tg.z - v.z) - v.yaw);
        // corner ahead: slow down by the turn angle between this leg and the next
        let turn = 0; if (k < pts.length - 1) { const a1 = U.dirToYaw(tg.x - v.x, tg.z - v.z), a2 = U.dirToYaw(pts[k + 1].x - tg.x, pts[k + 1].z - tg.z); turn = Math.abs(U.wrapAngle(a2 - a1)); }
        let want = dEnd < 25 ? 7 : (Math.abs(err) > 0.6 || turn > 0.8 ? 8 : 16);
        // something in the lane ahead (a car, a pedestrian): ease off like a careful new driver
        const fwd = U.yawToDir(v.yaw);
        const ahead = GTP.Entities.near(v.x, v.z, 14).some((e) => {
          if (e === v || e === p || e.removed || !(e.kind === 'vehicle' || (e.kind === 'ped' && e.alive && !e.inVehicle))) return false;
          const dx = e.x - v.x, dz = e.z - v.z, along = dx * fwd.x + dz * fwd.z, side = Math.abs(dx * -fwd.z + dz * fwd.x);
          return along > 1.5 && along < 4 + Math.max(0, v.speed) * 0.8 && side < (e.kind === 'vehicle' ? 2.2 : 1.6);
        });
        if (ahead) want = Math.min(want, 4);
        if (rev > 0) {   // backing out of a wall: reverse with opposite lock
          NP.hold('forward', false); NP.hold('back', true); NP.hold(err > 0 ? 'right' : 'left', true); NP.hold(err > 0 ? 'left' : 'right', false); rev -= 1 / 30;
          if (rev <= 0) { NP.hold('back', false); NP.hold('left', false); NP.hold('right', false); }
        } else {
          const sp = v.speed;
          NP.hold('forward', sp < want); NP.hold('back', sp > want + 4);
          const thr = 0.06; NP.hold('left', err > thr); NP.hold('right', err < -thr);
        }
        NP.adv(1 / 30); t += 1 / 30;
        const rem = dEnd + (pts.length - 1 - i) * 4;
        if (rem < best - 0.5) { best = rem; lastProg = t; }
        if (t - lastProg > 2.5 && rev <= 0) {
          rev = 1.4; lastProg = t;
          if (++reroutes % 2 === 0 && reroutes < 20) { route = getRoute(); i = 0; best = 1e9; }
        }
        void d;
      }
      NP.releaseAll();
      return { ok: stop(), t, why: NP.over() ? 'out of time' : 'gave up after ' + maxSec + ' s' };
    },
    // the nearest objective blip on the minimap (pickups show one blip each), else the HUD arrow's point
    objectivePoint() {
      const p = NP.p(), mk = NP.markers().filter((m) => m.kind === 'objective');
      let best = null, bd = 1e9; for (const m of mk) { const d = U.dist2d(p.x, p.z, m.x, m.z); if (d < bd) { bd = d; best = m; } }
      const a = NP.arrow();
      if (best && (!a || U.dist2d(p.x, p.z, a.x, a.z) > bd - 1)) return { x: best.x, z: best.z, src: 'blip' };
      return a ? { x: a.x, z: a.z, src: 'arrow' } : (best ? { x: best.x, z: best.z, src: 'blip' } : null);
    },
    // the route to a point: the game's GPS line when it draws one, else the fallback (recorded)
    routeTo(pt, mode, tag) {
      const r = NP.gpsRoute(pt.x, pt.z);
      if (r) { NP.routeSrc = r.src; return r; }
      NP.usedFallback[tag || 'route'] = true; NP.routeSrc = 'fallback';
      return NP.ownRoute(pt.x, pt.z, mode);
    },
    // ---- the debate: the opponent's card is on screen with the counter keys under it ----
    debate(maxSec) {
      const D = GTP.UI.minigames && GTP.UI.minigames.debate; if (!D) return { ok: false, why: 'no debate UI' };
      const COUNTER = { FACT: 'forward', FEELING: 'left', GOTCHA: 'right', ANECDOTE: 'back' };
      let t = 0;
      while (D.active && t < maxSec) {
        NP.adv(1 / 60); t += 1 / 60;
        const st = D.state;
        if (st.phase === 'card' && st.card && st.card.t > 0.45 && COUNTER[st.card.card]) NP.press(COUNTER[st.card.card]);
        else if (st.phase === 'summary' && st.phaseT > 1.2) NP.press('confirm');
      }
      const st = D.state || {};
      return { ok: !!st.win, t, why: st.summary || '' };
    },
    // ---- one objective's worth of play, chosen from the objective text and what the HUD points at ----
    // returns {ok, why} once the objective text changes or the mission ends
    playObjective(maxSec) {
      const text0 = NP.objectiveText(), mid = NP.hud().active, p = NP.p();
      const changed = () => NP.hud().active !== mid || NP.objectiveText() !== text0 || NP.hud().phase !== 'play';
      const t0 = NP.now();
      while (!changed() && NP.now() - t0 < maxSec && !NP.over()) {
        if (NP.housekeeping()) continue;
        if (GTP.game.state === 'minigame') { const r = NP.debate(120); NP.say('debate: ' + JSON.stringify(r)); NP.adv(0.5); continue; }
        const txt = text0.toLowerCase();
        const pt = NP.objectivePoint();
        if (!pt) { NP.adv(0.25); continue; }
        // "Get in the ..." with a vehicle under the arrow: walk to it and press F
        const veh = GTP.Entities.near(pt.x, pt.z, 3, 'vehicle').find((v) => !v.wreck);
        if (!p.inVehicle && veh && /get in|enter|hop in|take the/.test(txt)) {
          // walk to a door of the van (the driver's side first), then press F
          const doors = veh.doorWorld ? [veh.doorWorld(0), veh.doorWorld(1)] : [{ x: veh.x, z: veh.z }];
          const di = (NP.notes.enterTries = (NP.notes.enterTries || 0) + 1) % doors.length, dr = doors[di];
          NP.walk(() => NP.routeTo(dr, 'ped', 'objective'), () => changed() || U.dist2d(p.x, p.z, dr.x, dr.z) < 2.2 || U.dist2d(p.x, p.z, veh.x, veh.z) < 2.6, 30);
          if (changed()) break;
          NP.press('enter'); NP.adv(2); continue;
        }
        if (p.inVehicle) {
          NP.myCar = p.inVehicle;
          const r = NP.drive(() => NP.routeTo(pt, 'car', 'objective'), () => changed() || U.dist2d(p.inVehicle ? p.inVehicle.x : p.x, p.inVehicle ? p.inVehicle.z : p.z, pt.x, pt.z) < 3.5, 40);
          if (!r.ok && r.why === 'not in a vehicle') continue;
          if (!changed()) {
            // parked beside the blip but it did not count (a kerb, a bench, a lamp in the way): roll forward a touch, then hop out for it
            const v = p.inVehicle; NP.hold('forward', true); NP.adv(0.6); NP.releaseAll(); NP.adv(0.4);
            if (!changed() && v && U.dist2d(v.x, v.z, pt.x, pt.z) < 6 && !/back to|bring|return|drive/.test(txt)) {
              NP.press('enter'); NP.adv(1.2); NP.notes.hopOuts = (NP.notes.hopOuts || 0) + 1;
              NP.walk(() => ({ pts: [{ x: pt.x, z: pt.z }] }), () => changed() || U.dist2d(p.x, p.z, pt.x, pt.z) < 0.6, 10);
            }
          }
        } else if (NP.myCar && !NP.myCar.removed && !NP.myCar.wreck && !NP.myCar.driver && U.dist2d(p.x, p.z, pt.x, pt.z) > 20 && U.dist2d(p.x, p.z, NP.myCar.x, NP.myCar.z) < 60) {
          // the next blip is far and the van is right there: back in
          const v = NP.myCar, dr = v.doorWorld ? v.doorWorld(0) : { x: v.x, z: v.z };
          NP.walk(() => ({ pts: [{ x: dr.x, z: dr.z }] }), () => changed() || U.dist2d(p.x, p.z, dr.x, dr.z) < 2.2 || U.dist2d(p.x, p.z, v.x, v.z) < 2.6, 15);
          NP.press('enter'); NP.adv(2);
          if (!p.inVehicle) NP.myCar = null;
        } else {
          NP.walk(() => NP.routeTo(pt, 'ped', 'objective'), () => changed() || U.dist2d(p.x, p.z, pt.x, pt.z) < 1.0, 40);
        }
      }
      NP.releaseAll();
      return { ok: changed(), text: text0, t: NP.now() - t0 };
    },
    // play the running mission until it completes or fails; returns {ok, why}
    playMission(id, maxSec) {
      const t0 = NP.now(); let guard = 0;
      while (NP.now() - t0 < maxSec && !NP.over() && guard++ < 200) {
        if (NP.events.complete.indexOf(id) >= 0) return { ok: true, t: NP.now() - t0 };
        const h = NP.hud();
        if (!h.active) {
          if (NP.housekeeping()) continue;
          NP.adv(0.3);
          const h2 = NP.hud();
          if (!h2.active && NP.events.complete.indexOf(id) < 0) {
            // the CONTEXT STAMPED card: RETRY is highlighted; a new player takes it (twice at most)
            if (h2.retry && (NP.notes.retries || 0) < 2) { NP.say('RETRY after ' + JSON.stringify(NP.events.fail.slice(-1))); NP.notes.retries = (NP.notes.retries || 0) + 1; NP.adv(1.2); NP.press('confirm'); NP.adv(1); continue; }
            if (h2.retry || NP.events.fail.length) return { ok: false, why: 'mission failed: ' + JSON.stringify(NP.events.fail.slice(-1)) + (NP.notes.retries ? ' after ' + NP.notes.retries + ' retries' : '') };
          }
          continue;
        }
        if (h.active !== id) return { ok: false, why: 'a different mission is running: ' + h.active };
        if (h.phase !== 'play') { if (!NP.housekeeping()) NP.adv(0.2); continue; }
        const r = NP.playObjective(90);
        NP.say(id + ' objective "' + r.text + '" ' + (r.ok ? 'done' : 'NOT done') + ' in ' + r.t.toFixed(1) + ' s (route ' + NP.routeSrc + ')');
      }
      // let the outro, the MISSION PASSED card and any act cutscene play out
      let s = 0; while (s < 20 && NP.events.complete.indexOf(id) < 0) { if (!NP.housekeeping()) NP.adv(0.2); s += 0.2; }
      return { ok: NP.events.complete.indexOf(id) >= 0, why: 'not completed after ' + (NP.now() - t0).toFixed(0) + ' s', t: NP.now() - t0 };
    },
    // the next story mission as the screen shows it: GTP.Story.next() / the story GPS (v0.3), else the nearest blue light
    nextStory() {
      if (GTP.Story && GTP.Story.next) { try { const n = GTP.Story.next(); if (n && typeof n.x === 'number') return { id: n.missionId, x: n.x, z: n.z, src: 'Story.next' }; } catch (e) { /* fall through */ } }
      const g = NP.lastGps(); if (g && g.kind === 'story') return { id: null, x: g.x, z: g.z, src: 'gps:set story' };
      const p = NP.p(), mk = NP.markers().filter((m) => m.kind === 'mission');
      let best = null, bd = 1e9; for (const m of mk) { const d = U.dist2d(p.x, p.z, m.x, m.z); if (d < bd) { bd = d; best = m; } }
      return best ? { id: best.missionId || best.id, x: best.x, z: best.z, src: 'nearest blue light (no story GPS)' } : null;
    },
    // walk (or drive, if seated) into a mission's light; returns the mission id that started or null
    goStart(target, maxSec) {
      const p = NP.p(), t0 = NP.now();
      if (p.inVehicle) { NP.press('enter'); NP.adv(1); }
      const started = () => !!NP.hud().active;
      const r = NP.walk(() => NP.routeTo(target, 'ped', 'story'), started, maxSec, { keepGoing: true });
      if (!started()) {   // circle the light once: a marker may arm only on entry
        // (a New Game spawns the player inside the first light, which arms only once they have stepped out of it)
        for (const a of [0, 1.6, 3.2, 4.8]) {
          if (started()) break;
          NP.walk(() => ({ pts: [{ x: target.x + Math.cos(a) * 4.5, z: target.z + Math.sin(a) * 4.5 }] }), () => started() || GTP.util.dist2d(p.x, p.z, target.x + Math.cos(a) * 4.5, target.z + Math.sin(a) * 4.5) < 0.8, 8);
          NP.walk(() => ({ pts: [{ x: target.x, z: target.z }] }), started, 8, { keepGoing: true });
          NP.notes.steppedOutOfLight = (NP.notes.steppedOutOfLight || 0) + 1;
        }
      }
      return { ok: started(), id: NP.hud().active, t: NP.now() - t0, why: r.why };
    },
    // ---- v0.3 features, detected ----
    interior() { const I = GTP.Interiors; if (!I) return null; const c = I.current; return I.active ? (c && typeof c === 'object' ? { id: c.id, kind: c.kind || c.template || null, store: c.store || null } : { id: String(c || I.active) }) : null; },
    inArmory() { const c = NP.interior(); return !!c && (c.kind === 'armory' || /armory|arms/i.test(String(c.id || ''))); },
    isPistol(id) {
      if (!id) return false;
      const P = GTP.Content && GTP.Content.parity, w = P && P.weapons ? P.weapons.find((x) => x.id === id) : null;
      if (w) return w.class === 'pistol' || w.class === 'handgun' || /pistol/i.test(w.class || '') || id === 'pistol';
      return id === 'pistol';
    },
    // the gun in the player's hand is drawn: a visible mesh under the player's model tagged as the held weapon
    gunVisible() {
      const p = NP.p(), root = p.mesh || p.group || p.obj || null; if (!root || !root.traverse) return { ok: false, why: 'no player mesh' };
      let found = null;
      root.traverse((o) => {
        if (found) return;
        const ud = o.userData || {};
        const tagged = ud.weaponId === p.weapon || ud.weapon === p.weapon || ud.heldWeapon === p.weapon || (ud.held && (ud.weaponId || ud.weapon)) || /^(weapon|gun|held)[:_-]?/i.test(o.name || '') && (o.name || '').indexOf(p.weapon) >= 0;
        if (!tagged) return;
        let vis = true, a = o; while (a) { if (a.visible === false) { vis = false; break; } a = a.parent; }
        if (vis) found = o;
      });
      if (!found) return { ok: false, why: 'no visible mesh tagged with the held weapon "' + p.weapon + '" under the player model (userData.weaponId)' };
      const wp = new THREE.Vector3(); found.getWorldPosition(wp);
      const ndc = wp.clone().project(GTP.Render.camera), on = Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z < 1;
      return { ok: on, why: on ? 'mesh "' + (found.name || found.type) + '" in view' : 'the gun mesh is off screen', name: found.name };
    },
    // cycle weapons with ] until the HUD's weapon is a pistol (the HUD shows the weapon name)
    equipPistol() {
      const p = NP.p(); for (let i = 0; i < 40 && !NP.isPistol(p.weapon); i++) { NP.press('weaponNext'); NP.adv(0.1); }
      return NP.isPistol(p.weapon);
    }
  };
  const E = GTP.Events;
  E.on('gps:set', (e) => { NP.events.gps.push(Object.assign({ t: NP.now() }, e || {})); });
  E.on('phone:call', (e) => { NP.events.phone.push({ t: NP.now(), from: e && e.from }); });
  E.on('chapter', (e) => { NP.events.chapter.push({ t: NP.now(), act: e && e.act, title: e && e.title }); });
  E.on('interior:enter', (e) => { NP.events.interiorEnter.push(Object.assign({ t: NP.now() }, e || {})); });
  E.on('interior:exit', (e) => { NP.events.interiorExit.push(Object.assign({ t: NP.now() }, e || {})); });
  E.on('cover:enter', () => { NP.events.coverEnter++; });
  E.on('saved', (e) => { NP.events.saved.push({ t: NP.now(), slot: e && e.slot, auto: !!(e && e.auto), reason: e && e.reason }); });
  E.on('mission:complete', (e) => { NP.events.complete.push(e && (e.id || e.missionId)); NP.say('MISSION COMPLETE ' + (e && (e.id || e.missionId))); });
  E.on('mission:start', (e) => { NP.events.start.push({ t: NP.now(), id: e && (e.id || e.missionId) }); NP.say('mission start ' + (e && (e.id || e.missionId))); });
  E.on('mission:fail', (e) => { NP.events.fail.push({ t: NP.now(), id: e && (e.id || e.missionId), why: e && (e.reason || e.why || e.text) }); NP.say('mission FAIL ' + JSON.stringify(e && { id: e.id, reason: e.reason || e.text })); });
  E.on('mission:objective', (e) => { NP.events.objective.push({ t: NP.now(), text: e && (e.text || (e.def && e.def.text)) }); });
  E.on('range:end', (e) => { NP.events.range.push(Object.assign({ t: NP.now() }, e || {})); });
  E.on('shop:buy', (e) => { NP.events.buy.push(Object.assign({ t: NP.now() }, e && { item: e.item, price: e.price })); });
  return { ok: true };
}

// ------------------------------------------------------------------------------------------------------ the run --
module.exports = { installPlayer };
if (require.main === module) H.run('newplayer', async (t) => {
  const steps = {}; STEPS.forEach(([id, desc]) => { steps[id] = { id, desc, status: 'SKIP', note: 'not reached' }; });
  const set = (id, ok, note, extra) => { steps[id] = Object.assign({}, steps[id], { status: ok ? 'PASS' : 'FAIL', note }, extra || {}); console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + id + ': ' + note); };
  const shots = [];
  let shotN = 0;
  const page = await t.browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(600000);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));
  const shot = async (name) => {
    const f = path.join(t.OUT, 'newplayer_' + String(++shotN).padStart(2, '0') + '_' + name + '.png');
    fs.mkdirSync(t.OUT, { recursive: true });
    try { await page.evaluate(() => GTP.game.render()); await page.screenshot({ path: f }); shots.push(path.relative(t.ROOT, f)); } catch (e) { console.log('  (screenshot ' + name + ' failed: ' + e.message + ')'); }
  };
  const ev = async (fn, arg) => { try { return await page.evaluate(fn, arg); } catch (e) { return { ok: false, why: 'page error: ' + String(e.message || e).split('\n')[0] }; } };
  const clock = async () => ev(() => window.NP ? NP.now() : 0);
  let report = null;
  try {
    // ---- 1. title (non-headless: the live loop runs the loading screen and the title) ----
    await page.goto(t.url({ headless: 0, skipTitle: 0, seed: SEED, mute: 1 }));
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* a first-time player */ } });
    await page.reload();
    await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.state === 'title' && !GTP.game.loading.active && GTP.game.frames >= 3, null, { timeout: 300000 });
    const title = await page.evaluate(() => ({ items: (GTP.UI.state.title.items || []).map((i) => i.label || i.id), ids: (GTP.UI.state.title.items || []).map((i) => i.id), sel: GTP.UI.state.title.sel }));
    await page.screenshot({ path: path.join(t.OUT, 'newplayer_00_title.png') }); shots.push('tests/out/newplayer_00_title.png');
    // Enter on the highlighted first item (NEW GAME on a first launch)
    await page.keyboard.press('Enter');
    const tEnter = Date.now();
    await page.waitForFunction(() => GTP.game.state !== 'title' || GTP.UI.state.title.page !== 'menu', null, { timeout: 60000 }).catch(() => null);
    // a slot picker or a confirm may come up: Enter again picks the highlighted (empty) slot, as a player would
    for (let i = 0; i < 3; i++) {
      const st = await page.evaluate(() => ({ state: GTP.game.state, page: GTP.UI.state.title.page, confirm: !!GTP.UI.state.confirm }));
      if (st.state !== 'title') break;
      await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    }
    await page.waitForFunction(() => GTP.game.state !== 'title' && !GTP.game.loading.active, null, { timeout: 300000 }).catch(() => null);
    const started = await page.evaluate(() => ({ state: GTP.game.state, loading: GTP.game.loading.active, slot: GTP.game.activeSlot }));
    // from here the simulation is stepped (deterministic, simulated time); the real-time frames the loop ran so far count too
    await page.evaluate(() => { cancelAnimationFrame(GTP.game._raf); GTP.game._raf = 0; });
    const realLoad = (Date.now() - tEnter) / 1000;
    set('title', title.ids[0] === 'play' && started.state !== 'title', 'menu ' + JSON.stringify(title.items) + ', after Enter: ' + JSON.stringify(started) + ' (' + realLoad.toFixed(1) + ' s real to playable)');
    await ev(installPlayer, BUDGET);
    // count the frames the live loop ran since Enter as simulated time too
    await ev((sec) => { NP.t0steps = GTP.game.steps - Math.round(sec / (GTP.C.STEP || 1 / 60)); }, 0);

    // ---- 2. in the story within 60 s, hands off (cutscenes may be skipped with the on-screen pill; dialogue is read) ----
    const story = await ev(() => {
      const t0 = NP.now(); let first = null;
      while (NP.now() - t0 < 60) {
        const h = NP.hud();
        if (h.active) { first = first || { id: h.active, t: NP.now(), phase: h.phase }; if (h.phase === 'play' && h.objective) break; }
        if (!NP.housekeeping()) NP.adv(0.25);
      }
      const h = NP.hud();
      return { first, active: h.active, phase: h.phase, objective: h.objective, t: NP.now(), story: !!(GTP.Story && GTP.Story.next), opening: NP.notes.cutscenesSkipped || 0, gps: NP.events.gps.length, phone: NP.events.phone.length, chapter: NP.events.chapter.slice(0, 2) };
    });
    await shot('story_start');
    const inStory = !!(story.first && story.first.t <= 60);
    set('story_1min', inStory, inStory
      ? story.first.id + ' started at ' + story.first.t.toFixed(1) + ' s, objective "' + story.objective + '"'
      : 'no mission started by itself within 60 s (GTP.Story ' + (story.story ? 'present' : 'missing') + ', gps:set events ' + story.gps + ', state ' + JSON.stringify({ active: story.active, phase: story.phase }) + '); a new player is standing at the spawn with no objective on screen', { data: story });
    // fallback: walk into the blue light shown on the minimap
    let cur = await ev(() => NP.hud().active);
    if (!cur) {
      const r = await ev(() => { const n = NP.nextStory(); if (!n) return { ok: false, why: 'no blue light on the minimap' }; const g = NP.goStart(n, 90); return Object.assign({ target: n }, g); });
      console.log('    fallback: walked to the blue light: ' + JSON.stringify(r));
      cur = r.id || null;
      // the intro plays; get to the first objective on screen
      await ev(() => { const t0 = NP.now(); while (NP.now() - t0 < 60 && !(NP.hud().phase === 'play' && NP.hud().objective)) { if (!NP.housekeeping()) NP.adv(0.25); } });
    }

    // ---- 3. the first objective via the GPS, then 4. the rest of m00 ----
    const firstObj = await ev(() => {
      const text = NP.objectiveText(), arrow = NP.arrow(), gps = NP.lastGps();
      const W = GTP.World, gpsLine = !!W.route;
      const fb0 = Object.keys(NP.usedFallback).length;
      NP.usedFallback = {};
      const r = NP.playObjective(120);
      return { text, arrow: arrow && { x: Math.round(arrow.x), z: Math.round(arrow.z), dist: Math.round(arrow.dist) }, gps: gps && { label: gps.label, kind: gps.kind }, gpsLine, done: r.ok, t: r.t, fallback: Object.keys(NP.usedFallback), routeSrc: NP.routeSrc, waypoint: GTP.game.waypoint || null, next: NP.objectiveText(), fb0 };
    });
    await shot('first_objective');
    const noManual = firstObj.done && !!firstObj.text && !firstObj.fallback.length && !firstObj.waypoint;
    set('gps_first', noManual, firstObj.done
      ? (noManual ? '"' + firstObj.text + '" reached in ' + firstObj.t.toFixed(1) + ' s on the GPS line (' + firstObj.routeSrc + ')'
        : '"' + firstObj.text + '" reached in ' + firstObj.t.toFixed(1) + ' s only with the test\'s own path search: the game drew no GPS route (GTP.World.route ' + (firstObj.gpsLine ? 'present' : 'missing') + ', gps:set ' + (firstObj.gps ? JSON.stringify(firstObj.gps) : 'never emitted') + ')')
      : 'the first objective "' + firstObj.text + '" was not reached (' + JSON.stringify(firstObj) + ')', { data: firstObj });

    // the rest of the current mission, then the story chain: m00 -> m01_van -> m01c_both_sides
    const chain = ['m00_intro', 'm01_van', 'm01c_both_sides'], stepOf = { m00_intro: 'm00', m01_van: 'm01_van', m01c_both_sides: 'm01c' };
    const hasM01c = await ev(() => !!(M => M && M.missionById && M.missionById('m01c_both_sides'))(GTP.Missions));
    for (const id of chain) {
      const sid = stepOf[id];
      if (id === 'm01c_both_sides' && !hasM01c) { set(sid, false, 'mission m01c_both_sides is not registered (GTP.Missions.missionById returns nothing; content track missing)'); continue; }
      let active = await ev(() => NP.hud().active);
      if (active !== id) {
        // follow the story GPS (or the nearest blue light) to the next giver
        const r = await ev((want) => {
          let s = 0; while (s < 12 && !NP.hud().active) { if (!NP.housekeeping()) NP.adv(0.25); s += 0.25; }   // the phone call, the card
          if (NP.hud().active === want) return { ok: true, id: want, how: 'already running' };
          if (NP.hud().active) return { ok: false, why: 'another mission is running: ' + NP.hud().active };
          const n = NP.nextStory(); if (!n) return { ok: false, why: 'nothing on screen points at the next mission' };
          const g = NP.goStart(n, 150);
          return Object.assign({ target: { id: n.id, src: n.src, x: Math.round(n.x), z: Math.round(n.z) } }, g);
        }, id);
        console.log('    to ' + id + ': ' + JSON.stringify(r));
        active = await ev(() => NP.hud().active);
        if (active !== id) { set(sid, false, 'could not start ' + id + ' from what the screen shows: ' + JSON.stringify(r) + ' (running: ' + active + ')'); if (active) await ev(() => { if (GTP.Missions.abort) GTP.Missions.abort(); NP.adv(1); }); if (id === 'm00_intro') break; continue; }
        await ev(() => { const t0 = NP.now(); while (NP.now() - t0 < 60 && !(NP.hud().phase === 'play' && NP.hud().objective)) { if (!NP.housekeeping()) NP.adv(0.25); } });
      }
      await shot(id + '_play');
      const r = await ev((mid) => NP.playMission(mid, 420), id);
      await shot(id + '_end');
      const tnow = await clock();
      set(sid, !!r.ok, r.ok ? 'completed in ' + r.t.toFixed(0) + ' s (at ' + tnow.toFixed(0) + ' s)' : (r.why || 'not completed'), { data: r });
      if (id === 'm00_intro') {
        const after = await ev(() => ({ gps: NP.events.gps.slice(-2), phone: NP.events.phone.slice(-2), story: GTP.Story && GTP.Story.next ? GTP.Story.next() : null }));
        steps.m00.after = after;
        console.log('    after m00: gps ' + JSON.stringify(after.gps) + ' phone ' + JSON.stringify(after.phone) + ' Story.next ' + JSON.stringify(after.story));
      }
      if (await ev(() => NP.over())) break;
    }

    // ---- 7. the armory interior: by now (m01c) or by walking to the Both Sides Arms door shown on the minimap ----
    let arm = await ev(() => ({ in: NP.inArmory(), seen: NP.events.interiorEnter.find((e) => e.kind === 'armory' || /arm/i.test(String(e.id))) || null, api: !!GTP.Interiors, enter: !!(GTP.Interiors && GTP.Interiors.enter) }));
    if (!arm.in) {
      arm = await ev(() => {
        const api = !!(GTP.Interiors && GTP.Interiors.enter);
        // the green Both Sides Arms blip nearest the player (the minimap legend calls it out)
        const CB = GTP.Combat, p = NP.p(); let st = null;
        try { const ss = CB.shop && CB.shop.stores ? CB.shop.stores() : []; let bd = 1e9; ss.forEach((s) => { const d = GTP.util.dist2d(p.x, p.z, s.x, s.z); if (d < bd) { bd = d; st = s; } }); } catch (e) { st = null; }
        if (!st) return { in: false, api, why: 'no Both Sides Arms blip on the minimap' };
        if (p.inVehicle) { NP.press('enter'); NP.adv(1); }
        const r = NP.walk(() => NP.routeTo(st, 'ped', 'armory'), () => NP.inArmory() || GTP.UI.state.shopOpen || GTP.game.state !== 'playing' && !NP.cutscene(), 150, { keepGoing: true });
        let s = 0; while (s < 4 && !NP.inArmory()) { if (!NP.housekeeping()) NP.adv(0.25); s += 0.25; }
        const shopOpen = !!GTP.UI.state.shopOpen;
        return { in: NP.inArmory(), api, store: st.id, walked: r.ok, shopOpen, why: r.why };
      });
    }
    await shot('armory');
    set('armory', !!arm.in, arm.in ? 'inside ' + JSON.stringify(await ev(() => NP.interior())) : (arm.api ? 'GTP.Interiors exists but the armory was not entered: ' + JSON.stringify(arm) : 'GTP.Interiors is missing (interiors track); walking into the Both Sides Arms door ' + (arm.shopOpen ? 'opens the old shop menu overlay' : 'did not open anything') + ' ' + JSON.stringify(arm)));
    // close a v0.2 shop overlay if one came up
    await ev(() => { let i = 0; while (GTP.UI.state.shopOpen && i++ < 5) NP.press('cancel'); NP.adv(0.3); });

    // ---- 8. a visible pistol in the armory, 9. aim ----
    const gun = await ev(() => {
      const p = NP.p(), have = Object.keys(p.weapons || {}).filter((w) => (p.weapons[w] > 0 || p.weapons[w] === Infinity) && NP.isPistol(w));
      const eq = NP.equipPistol();
      NP.adv(0.4);
      return { owned: have, weapon: p.weapon, equipped: eq, inArmory: NP.inArmory(), vis: NP.gunVisible() };
    });
    await shot('pistol');
    const pistolOk = gun.inArmory && gun.equipped && gun.vis.ok;
    set('pistol', pistolOk, pistolOk ? gun.weapon + ' in hand, ' + gun.vis.why
      : [gun.inArmory ? null : 'not inside the armory', gun.owned.length ? null : 'the player owns no pistol (m01c gives Merle\'s free pistol)', gun.equipped ? null : 'could not equip a pistol with ] (held: ' + gun.weapon + ')', gun.vis.ok ? null : gun.vis.why].filter(Boolean).join('; '), { data: gun });
    const aim = await ev(() => {
      const p = NP.p(); if (!NP.isPistol(p.weapon)) return { ok: false, why: 'no pistol in hand' };
      NP.hold('aim', true); NP.adv(0.5);
      const pose = p.pose || null, CB = GTP.Combat;
      const out = { aiming: !!p.aiming, pose: pose ? !!pose.aim : null, ads: !!(CB && CB.aim && (CB.aim.active || CB.aim.on || CB.aim.ads)) };
      NP.hold('aim', false); NP.adv(0.2);
      return { ok: out.aiming && out.pose !== false, data: out };
    });
    set('aim', !!aim.ok, aim.ok ? 'aiming with the pistol: ' + JSON.stringify(aim.data) : (aim.why || 'aim did not engage: ' + JSON.stringify(aim.data)));

    // ---- 10. cover: walk to the nearest wall and press the cover action ----
    const cover = await ev(() => {
      const In = GTP.Input, has = In.actions.indexOf('cover') >= 0;
      if (!has) return { ok: false, why: 'no `cover` input action in GTP.Input.actions (shooting / ui tracks)' };
      const p = NP.p(), W = GTP.World;
      if (p.inVehicle) { NP.press('enter'); NP.adv(1); }
      // the nearest solid within 12 m (a wall, a counter, a car): probe eight directions
      let best = null;
      for (let a = 0; a < 16; a++) {
        const yaw = a / 16 * Math.PI * 2, d = GTP.util.yawToDir(yaw);
        for (let r = 0.8; r < 12; r += 0.4) { if (W.solidAt(p.x + d.x * r, p.z + d.z * r, p.y + 0.5)) { if (!best || r < best.r) best = { yaw, r }; break; } }
      }
      const cars = GTP.Entities.near(p.x, p.z, 12, 'vehicle'); if (cars.length) { const c = cars[0], r = GTP.util.dist2d(p.x, p.z, c.x, c.z) - 1.5; if (!best || r < best.r) best = { yaw: GTP.util.dirToYaw(c.x - p.x, c.z - p.z), r, car: true }; }
      if (!best) return { ok: false, why: 'no wall or car within 12 m to take cover behind' };
      const n0 = NP.events.coverEnter;
      for (let i = 0; i < 90 && NP.events.coverEnter === n0; i++) {
        NP.lookToward(best.yaw); NP.hold('forward', true); NP.adv(1 / 30);
        if (i > 6 && i % 10 === 0) NP.press('cover');
      }
      NP.releaseAll(); NP.press('cover'); NP.adv(0.4);
      const got = NP.events.coverEnter > n0;
      return { ok: got, why: got ? 'cover:enter after walking ' + best.r.toFixed(1) + ' m to ' + (best.car ? 'a car' : 'a wall') : 'pressed cover next to ' + (best.car ? 'a car' : 'a wall') + ', no cover:enter event', pose: p.pose && p.pose.cover || null };
    });
    await shot('cover');
    set('cover', !!cover.ok, cover.why, { data: cover });
    await ev(() => { if (NP.events.coverEnter) { NP.press('cover'); NP.adv(0.3); } NP.hold('back', true); NP.adv(0.4); NP.releaseAll(); });

    // ---- 11. save from the pause menu: Esc, SAVE, the highlighted slot, confirm an overwrite ----
    const save = await ev(() => {
      const ui = GTP.UI.state, g = GTP.game, n0 = NP.events.saved.filter((s) => !s.auto).length;
      let guard = 0; while ((g.state !== 'playing' || NP.talking() || NP.cutscene()) && guard++ < 200) { if (!NP.housekeeping()) NP.adv(0.25); }
      NP.press('pause'); NP.adv(0.2);
      if (g.state !== 'paused') return { ok: false, why: 'Esc did not open the pause menu (state ' + g.state + ')' };
      // walk the menu down to the SAVE item by its label
      const items = () => (GTP.UI.pauseItems ? GTP.UI.pauseItems() : null);
      for (let i = 0; i < 12; i++) {
        const lbl = (window.__npPauseLabel = (function () { try { const it = items(); return it ? it[ui.pause.sel] && it[ui.pause.sel].label : null; } catch (e) { return null; } })());
        if (lbl ? /^SAVE/.test(lbl) : ui.pause.sel === 1) break;
        NP.press('back');   // S / Down steps the selection
      }
      NP.press('confirm'); NP.adv(0.2);
      for (let i = 0; i < 4 && NP.events.saved.filter((s) => !s.auto).length === n0; i++) { NP.press('confirm'); NP.adv(0.3); }
      const ok = NP.events.saved.filter((s) => !s.auto).length > n0;
      // back to play
      for (let i = 0; i < 4 && g.state !== 'playing'; i++) { NP.press('cancel'); NP.adv(0.2); if (g.state === 'paused' && ui.pause.page === 'pause') { NP.press('pause'); NP.adv(0.2); } }
      return { ok, why: ok ? 'saved to slot ' + NP.events.saved[NP.events.saved.length - 1].slot + ' from the pause menu' : 'no manual save event after SAVE + confirm (page ' + ui.pause.page + ')', state: g.state };
    });
    await shot('saved');
    set('save', !!save.ok, save.why);

    // ---- 12. the clock ----
    const total = await clock();
    const required = ['title', 'story_1min', 'gps_first', 'm00', 'm01_van', 'm01c', 'armory', 'pistol', 'aim', 'cover', 'save'];
    const allOk = required.every((id) => steps[id].status === 'PASS');
    set('ten_min', allOk && total <= BUDGET, 'simulated ' + total.toFixed(0) + ' s of ' + BUDGET + ' s' + (allOk ? '' : ' (steps missing: ' + required.filter((id) => steps[id].status !== 'PASS').join(', ') + ')'));
    const inPage = await ev(() => ({ log: NP.log, notes: NP.notes, events: { gps: NP.events.gps.length, phone: NP.events.phone.map((p) => p.from), chapter: NP.events.chapter, interiors: NP.events.interiorEnter, saved: NP.events.saved, complete: NP.events.complete, fail: NP.events.fail } }));
    const gerr = await t.gameErrors(page).catch(() => []);
    report = { seed: SEED, budget: BUDGET, simulated: +total.toFixed(1), steps: STEPS.map(([id]) => steps[id]), screenshots: shots, events: inPage.events, notes: inPage.notes, errors: pageErrors.concat(gerr).slice(0, 20), log: inPage.log };
    if (VERBOSE) console.log(inPage.log.join('\n'));
  } catch (e) {
    console.log('  the run stopped early: ' + (e && e.stack || e));
    report = { seed: SEED, crashed: String(e && e.message || e), steps: STEPS.map(([id]) => steps[id]), screenshots: shots };
  }
  fs.mkdirSync(t.OUT, { recursive: true });
  fs.writeFileSync(path.join(t.OUT, 'newplayer_report.json'), JSON.stringify(report, null, 1));
  // the step table
  console.log('\n  NEW-PLAYER STEP REPORT (seed ' + SEED + ', budget ' + BUDGET + ' s simulated)');
  STEPS.forEach(([id, desc], i) => { const s = steps[id]; console.log('  ' + String(i + 1).padStart(2) + ' ' + s.status.padEnd(4) + ' ' + id.padEnd(11) + ' ' + desc + (s.status === 'PASS' ? '' : '\n' + ' '.repeat(20) + '-> ' + s.note)); });
  if (report && report.errors && report.errors.length) console.log('  page / game errors: ' + report.errors.length + '\n    ' + report.errors.slice(0, 5).map((e) => e.split('\n')[0]).join('\n    '));
  const failed = STEPS.filter(([id]) => steps[id].status !== 'PASS').map(([id]) => id);
  t.assert(!failed.length, 'the new-player bar is not met; missing steps: ' + failed.join(', '));
});
