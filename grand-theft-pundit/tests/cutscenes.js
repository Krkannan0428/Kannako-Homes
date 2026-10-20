/* cutscenes.js: the cutscene player (12_cutscenes) and the tutorial hints, headless and deterministic.
 *  1 play cs_opening: state cutscene, letterbox flag, free camera, actors present (gus, kip, the player at the table),
 *    the camera moves between keyframes, the first line is Bryce's, lines advance, shot 2 begins
 *  2 screenshot of shot 1 with the letterbox bars (cutscene_opening.png)
 *  3 hold confirm skips the script: onDone fires, state playing, actors gone, chase camera back, control restored
 *  4 playOnce sets flags.cs_cs_opening and refuses a second time; back skips one shot
 *  5 determinism: the same script twice puts the camera in the same place at the same time
 *  6 a mission intro (m00_intro from its light) plays cs_intro_m00_intro with the marker's giver and Kip reused; abort cleans up
 *  7 the `cutscene` objective type plays an inline script and completes; roof actors stand on Goldplate Tower
 *  8 hints: fire once per save as 'hint' events, queued 2 s apart, never two at once; h_enter from proximity */
'use strict';
const H = require('./_harness');

H.run('cutscenes', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;

  await page.evaluate(() => {
    window.T_ = {
      events: [], hints: [],
      press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
      until(pred, maxSec, step) { step = step || 0.1; let s = 0; while (s < maxSec) { GTP.game.advance(step); s += step; if (pred()) return s; } return -1; },
      cam() { const c = GTP.Render.camera.position; return { x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2) }; },
      actors() { return GTP.Entities.list.filter((e) => e.kind === 'ped' && e.cutscene && !e.removed).map((e) => e.castId); }
    };
    ['cutscene:start', 'cutscene:shot', 'cutscene:end'].forEach((ev) => GTP.Events.on(ev, (e) => T_.events.push(ev.split(':')[1] + ':' + (e.id || '') + (e.shot != null ? '#' + e.shot : ''))));
    GTP.Events.on('hint', (e) => T_.hints.push(e.id));
    // the GDD's opening (§4.2) is the content's; a one-shot stand-in keeps the test meaningful if the content file is missing
    if (!GTP.Cutscenes.scriptFor('cs_opening')) {
      GTP.Content.expansion.cutscenes.cs_opening = { id: 'cs_opening', letterbox: true, skippable: true, music: 'off', shots: [
        { cam: { from: { landmark: 'campus_quad', offset: { x: -14, y: 9, z: 18 } }, to: { landmark: 'campus_quad', offset: { x: 0, y: 1, z: -6 } }, seconds: 7, ease: 'inout', move: { to: { landmark: 'campus_quad', offset: { x: -6, y: 3, z: 9 } } } },
          actors: [{ castId: 'player', at: { landmark: 'campus_quad', offset: { x: -0.8, z: -6 } }, face: Math.PI, anim: 'table' }, { castId: 'gus', at: { landmark: 'campus_quad', offset: { x: 2.2, z: -5 } }, face: 'player', anim: 'idle' }, { castId: 'kip', at: { landmark: 'campus_quad', offset: { x: 9, z: -2 } }, face: 'player', anim: 'wave' }],
          lines: [{ who: 'player', text: 'Grievance City. Two time zones, one opinion.' }, { who: 'gus', text: 'You\'re talking to nobody.' }, { who: 'player', text: 'Respectfully, Gus, a journalist warms up.' }] },
        { cam: { from: { entity: 'actor:gus', offset: { x: -0.6, y: 1.7, z: -2.2 } }, to: { entity: 'player' }, seconds: 6, ease: 'inout' }, actors: [{ castId: 'player', anim: 'talk' }, { castId: 'gus', anim: 'talk' }],
          lines: [{ who: 'gus', text: 'Minds changed so far: zero.' }, { who: 'kip', text: 'Hi. Is this... I\'ll ask later.' }], hold: 1.2 }
      ] };
    }
  });

  // ---- 1. play the opening ----
  const play = await page.evaluate(() => {
    const Cs = GTP.Cutscenes, M = GTP.Missions, p = GTP.game.player;
    T_.done = 0;
    const ok = Cs.play('cs_opening', () => { T_.done++; });
    GTP.game.advance(0.1);
    const out = { ok, state: GTP.game.state, active: Cs.active, letterbox: Cs.letterbox, free: GTP.Render.free, hud: Cs.hud(), actors: T_.actors(), actorIds: Object.keys(Cs.actors()), line0: M.state.dialogue[0] && M.state.dialogue[0].who, cam0: T_.cam(), events: T_.events.slice() };
    const gus = Cs.actors().gus, kip = Cs.actors().kip, d = GTP.World.landmark('campus_quad').door;
    out.gusAt = gus ? { dx: +(gus.x - d.x).toFixed(1), dz: +(gus.z - d.z).toFixed(1), frozen: !!gus._frozen, pose: gus.poseAnim, brain: gus.ai && gus.ai.mission } : null;
    out.kipPose = kip ? kip.poseAnim : null;
    out.playerAt = { dx: +(p.x - d.x).toFixed(1), dz: +(p.z - d.z).toFixed(1), pose: p.poseAnim, control: p.controlEnabled };
    GTP.game.advance(2.9);
    out.cam3 = T_.cam();
    // the look direction points at the `to` point (the table in front of the player)
    const c = GTP.Render.camera, dir = new THREE.Vector3(); c.getWorldDirection(dir);
    const to = { x: d.x, y: d.y + 1, z: d.z - 6 }, toDir = new THREE.Vector3(to.x - c.position.x, to.y - c.position.y, to.z - c.position.z).normalize();
    out.lookDot = +dir.dot(toDir).toFixed(3);
    out.line3 = M.state.dialogue[0] && M.state.dialogue[0].who;
    T_.press('confirm'); GTP.game.advance(0.3);
    out.lineAfterConfirm = M.state.dialogue[0] && M.state.dialogue[0].who;
    out.shotAt3 = Cs.hud().shot;
    const s = T_.until(() => Cs.hud().shot === 1, 20, 0.25);
    out.shot2After = s;
    out.cam2 = T_.cam(); out.shot2Line = M.state.dialogue[0] && M.state.dialogue[0].who; out.stateMid = GTP.game.state;
    return out;
  });
  console.log('  play: ' + JSON.stringify(play));
  t.assert(play.ok && play.state === 'cutscene' && play.active && play.letterbox && play.free && play.hud.active && play.hud.shots >= 2, 'cs_opening plays in state cutscene with the letterbox flag and a free camera');
  t.assert(play.actors.indexOf('gus') >= 0 && play.actors.indexOf('kip') >= 0 && play.actorIds.indexOf('player') >= 0, 'Gus and Kip were spawned as actors and the player is cast: ' + play.actorIds.join(','));
  t.assert(play.gusAt && Math.abs(play.gusAt.dx - 2.2) < 1.2 && Math.abs(play.gusAt.dz + 5) < 1.2 && play.gusAt.frozen && play.gusAt.pose === 'idle' && play.gusAt.brain === 'cutscene', 'Gus stands at his door offset, frozen, posed, with a cutscene brain: ' + JSON.stringify(play.gusAt));
  t.assert(Math.abs(play.playerAt.dx + 0.8) < 1.2 && Math.abs(play.playerAt.dz + 6) < 1.2 && play.playerAt.pose === 'table' && play.playerAt.control === false, 'the player was moved to the table and posed: ' + JSON.stringify(play.playerAt));
  t.assert(play.kipPose === 'wave', 'Kip waves');
  const moved = Math.hypot(play.cam3.x - play.cam0.x, play.cam3.y - play.cam0.y, play.cam3.z - play.cam0.z);
  t.assert(moved > 2 && play.lookDot > 0.9, 'the camera dollied ' + moved.toFixed(1) + ' m in 3 s and looks at the table (dot ' + play.lookDot + ')');
  t.assert(play.line0 === 'player' && play.line3 && play.lineAfterConfirm && play.lineAfterConfirm !== play.line3 || play.lineAfterConfirm === undefined, 'the lines run through the dialogue queue and confirm advances them: ' + play.line0 + ' -> ' + play.line3 + ' -> ' + play.lineAfterConfirm);
  t.assert(play.shotAt3 === 0 && play.shot2After > 0 && play.stateMid === 'cutscene' && play.events.indexOf('start:cs_opening') === 0, 'shot 2 began after the camera time and the lines (' + play.shot2After + ' s)');

  // ---- 2. the letterbox screenshot: back to shot 1's wide frame ----
  await page.evaluate(() => {
    const Cs = GTP.Cutscenes;
    Cs.cancel(); GTP.game.advance(0.1);
    Cs.play('cs_opening', () => {});
    GTP.game.advance(1.6);
  });
  const shot1 = await t.shot(page, 'cutscene_opening');
  const px = await t.pixelStats(page);
  console.log('  shot: ' + shot1 + ' ' + JSON.stringify(px));
  const bars = await page.evaluate(() => {
    // the HUD canvas: the top and bottom 8% are black bars in state cutscene
    const cv = document.getElementById('hud'), ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
    const row = (y) => { const d = ctx.getImageData(0, y, w, 1).data; let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] < 30 && d[i + 1] < 30 && d[i + 2] < 30) dark++; return dark / w; };
    return { top: +row(Math.round(h * 0.03)).toFixed(2), bottom: +row(Math.round(h * 0.97)).toFixed(2), mid: +row(Math.round(h * 0.5)).toFixed(2), state: GTP.game.state };
  });
  console.log('  letterbox: ' + JSON.stringify(bars));
  t.assert(bars.state === 'cutscene' && bars.top > 0.9 && bars.bottom > 0.9 && bars.mid < 0.5, 'the letterbox bars are drawn top and bottom');
  t.assert(px.colors > 200, 'the scene behind the bars is not monochrome: ' + px.colors);

  // ---- 3. hold confirm to skip ----
  const skip = await page.evaluate(() => {
    const Cs = GTP.Cutscenes, p = GTP.game.player;
    T_.done = 0; T_.events.length = 0;
    Cs.cancel(); GTP.game.advance(0.1);
    Cs.play('cs_opening', () => { T_.done++; });
    GTP.game.advance(1);
    GTP.Input.set('confirm', true);
    const half = { skip: Cs.hud().skip, active: Cs.active };
    GTP.game.advance(0.3);
    const mid = { skip: +Cs.hud().skip.toFixed(2), active: Cs.active };
    GTP.game.advance(0.5);
    GTP.Input.set('confirm', false);
    GTP.game.advance(0.2);
    return { half, mid, active: Cs.active, state: GTP.game.state, done: T_.done, actors: T_.actors(), free: GTP.Render.free, control: p.controlEnabled, pose: p.poseAnim || null, frozen: !!p._frozen, camDist: +Math.hypot(GTP.Render.camera.position.x - p.x, GTP.Render.camera.position.z - p.z).toFixed(1), events: T_.events.slice(), peds: GTP.Entities.list.filter((e) => e.kind === 'ped' && e.cutscene).length };
  });
  console.log('  skip: ' + JSON.stringify(skip));
  t.assert(skip.half.active && skip.mid.active && skip.mid.skip > 0.3 && skip.mid.skip < 0.9, 'the HOLD TO SKIP pill fills while confirm is held: ' + skip.mid.skip);
  t.assert(!skip.active && skip.state === 'playing' && skip.done === 1 && skip.actors.length === 0 && skip.peds === 0, 'holding confirm 0.6 s skips the script: onDone fired, actors removed');
  t.assert(!skip.free && skip.control && !skip.pose && !skip.frozen && skip.camDist < 8, 'the chase camera and the player\'s control are back');
  t.assert(skip.events.some((e) => /^end:cs_opening/.test(e)), 'cutscene:end fired: ' + skip.events.join(','));

  // ---- 4. playOnce and back-skips-a-shot ----
  const once = await page.evaluate(() => {
    const Cs = GTP.Cutscenes, M = GTP.Missions;
    delete M.state.flags.cs_cs_opening;
    const a = Cs.playOnce('cs_opening', () => {});
    GTP.game.advance(0.5);
    const flag = M.state.flags.cs_cs_opening, shot0 = Cs.hud().shot;
    T_.press('back'); GTP.game.advance(0.8);
    const shotAfterBack = Cs.hud().shot;
    Cs.skip(); GTP.game.advance(0.2);
    const b = Cs.playOnce('cs_opening', () => {});
    return { a, b, flag, shot0, shotAfterBack, active: Cs.active };
  });
  console.log('  once: ' + JSON.stringify(once));
  t.assert(once.a === true && once.flag === true && once.b === false && !once.active, 'playOnce plays once per save (flags.cs_cs_opening)');
  t.assert(once.shot0 === 0 && once.shotAfterBack === 1, 'back skips the current shot');

  // ---- 5. determinism ----
  const det = await page.evaluate(() => {
    const Cs = GTP.Cutscenes;
    const run = () => { Cs.play('cs_opening', () => {}); GTP.game.advance(2); const c = T_.cam(); Cs.cancel(); GTP.game.advance(0.1); return c; };
    const a = run(), b = run();
    return { a, b, same: a.x === b.x && a.y === b.y && a.z === b.z };
  });
  console.log('  determinism: ' + JSON.stringify(det));
  t.assert(det.same, 'the same script puts the camera in the same place after 2 s');

  // ---- 6. a mission intro from its light ----
  const intro = await page.evaluate(() => {
    const M = GTP.Missions, Cs = GTP.Cutscenes, p = GTP.game.player;
    const scripted = !!Cs.scriptFor('cs_intro_m00_intro');
    const mk = M.markers()[0];
    const giverBefore = GTP.Entities.list.find((e) => e.kind === 'ped' && e.castId === 'gus' && e.ai && e.ai.mission === 'giver');
    GTP.game.debug.teleport(mk.x, mk.z + 7); GTP.game.advance(0.3);
    GTP.Render.rig.yaw = 0; GTP.Render.rig.snap();
    GTP.Input.set('forward', true);
    const s = T_.until(() => M.state.active === 'm00_intro', 8, 0.1);
    GTP.Input.set('forward', false);
    GTP.game.advance(0.3);
    const out = { scripted, s, state: GTP.game.state, active: Cs.active, giverReused: !!(giverBefore && Cs.actors().gus === giverBefore), line: M.state.dialogue[0] && M.state.dialogue[0].who, phase: M.state.phase, peds: T_.actors().length };
    // skip the whole intro: play begins at the first objective
    GTP.Input.set('confirm', true); GTP.game.advance(0.8); GTP.Input.set('confirm', false); GTP.game.advance(0.3);
    out.after = { phase: M.state.phase, objective: M.state.objectiveText, state: GTP.game.state, cutscene: Cs.active, giverGone: !giverBefore || giverBefore.removed || !giverBefore.ai || giverBefore.ai.mission !== 'cutscene', control: p.controlEnabled };
    M.abort(); GTP.game.advance(0.2);
    return out;
  });
  console.log('  intro: ' + JSON.stringify(intro));
  if (intro.scripted) {
    t.assert(intro.s > 0 && intro.state === 'cutscene' && intro.active && intro.giverReused && intro.phase === 'intro', 'the m00 intro plays its cs_intro script with the marker\'s Gus reused as the actor');
    t.assert(intro.line === 'gus', 'the intro\'s first line is Gus\'s: ' + intro.line);
  } else t.assert(intro.s > 0 && intro.state === 'cutscene', 'the m00 intro plays (no script in the content yet)');
  t.assert(intro.after.phase === 'play' && /Dorm 4B/.test(intro.after.objective) && intro.after.state === 'playing' && !intro.after.cutscene && intro.after.control, 'skipping the intro starts the first objective: ' + JSON.stringify(intro.after));

  // ---- 7. the cutscene objective, and roof actors ----
  const obj = await page.evaluate(() => {
    const M = GTP.Missions, Cs = GTP.Cutscenes;
    M.registerTest({ id: 't_cs', title: 'Cut', giver: 'gus', marker: 'campus_quad', requires: [], reward: 5, intro: [], outro: [], failOn: ['player_dead'], objectives: [
      { type: 'cutscene', cutscene: { id: 'cs_t', letterbox: true, shots: [{ cam: { from: { landmark: 'goldplate_tower', offset: { x: -20, y: 70, z: 20 } }, to: { landmark: 'goldplate_tower', offset: { x: 0, y: 64, z: 0 } }, seconds: 1.5 },
        actors: [{ castId: 'goldplate', at: { landmark: 'goldplate_tower', offset: { x: -2, z: -2 }, roof: true }, anim: 'point' }, { castId: 'thug', at: { landmark: 'goldplate_tower', offset: { x: 2, z: 2 }, roof: true }, anim: 'idle' }] }] }, text: 'Watch' },
      { type: 'goto', target: { landmark: 'stadium' }, radius: 48, text: 'Far away' }
    ] });
    M.start('t_cs', { skipIntro: true }); GTP.game.advance(0.2);
    const lm = GTP.World.landmark('goldplate_tower'), top = lm.building ? lm.building.h : 0;
    const gp = Cs.actors().goldplate, th = Cs.actors().thug;
    const out = { state: GTP.game.state, active: Cs.active, roofY: gp ? +gp.y.toFixed(1) : null, top: +top.toFixed(1), extra: th ? (th.role || null) : null, extraLook: !!(th && th.look) };
    const s = T_.until(() => !Cs.active, 6, 0.25);
    out.s = s; out.after = { state: GTP.game.state, def: M.current() && M.current().def.type };
    M.abort(); GTP.game.advance(0.2);
    return out;
  });
  console.log('  objective: ' + JSON.stringify(obj));
  t.assert(obj.state === 'cutscene' && obj.active && obj.roofY != null && obj.top > 20 && Math.abs(obj.roofY - obj.top) < 1.5, 'the cutscene objective plays; Goldplate stands on the tower roof at ' + obj.roofY + ' m (top ' + obj.top + ')');
  t.assert(obj.extraLook && obj.s > 0 && obj.after.state === 'playing' && obj.after.def === 'goto', 'a role extra got a rolled look; the objective completed into the next one');

  // ---- 8. hints ----
  const hints = await page.evaluate(() => {
    const Hn = GTP.Hints, M = GTP.Missions, p = GTP.game.player;
    // a clean slate: the earlier steps fired hints of their own (a far objective, a car nearby); stand on the quad away from cars
    Object.keys(M.state.flags).forEach((k) => { if (/^hint_/.test(k)) delete M.state.flags[k]; });
    Hn.reset(); T_.hints.length = 0;
    const q = GTP.World.landmark('campus_quad').door; GTP.game.debug.teleport(q.x, q.z - 8); GTP.game.advance(0.1);
    const a = Hn.fire('h_move'), b = Hn.fire('h_move'), c = Hn.fire('h_wanted');
    GTP.game.advance(0.1);
    const first = { cur: Hn.current() && Hn.current().id, queued: T_.hints.slice(), flag: M.state.flags.hint_h_move };
    GTP.game.advance(3);   // h_move shows 6 s; h_wanted waits
    const during = { cur: Hn.current() && Hn.current().id, fired: T_.hints.slice() };
    GTP.game.advance(6);   // h_move expires, a 2 s gap, then h_wanted
    const later = { cur: Hn.current() && Hn.current().id, fired: T_.hints.slice() };
    const again = Hn.fire('h_move');
    // h_enter from proximity to a car on foot
    const v = GTP.game.debug.spawnVehicle(p.x + 2, p.z, 'sedan');
    T_.until(() => T_.hints.indexOf('h_enter') >= 0, 30, 0.5);   // behind whatever is queued (h_look follows h_move), 6 s + 2 s each
    const near = T_.hints.slice();
    v.removed = true;
    return { a, b, c, first, during, later, again, near, hud: Hn.hud(), errors: GTP.errors.length };
  });
  console.log('  hints: ' + JSON.stringify(hints));
  t.assert(hints.a === true && hints.b === false && hints.c === true && hints.first.cur === 'h_move' && hints.first.flag === true, 'a hint fires once per save as the current hint');
  t.assert(hints.during.fired.length === 1 && hints.later.fired.indexOf('h_wanted') === 1 && hints.again === false, 'the second hint waits for the first to expire plus the gap: ' + hints.later.fired.join(','));
  t.assert(hints.near.indexOf('h_enter') >= 0 && hints.errors === 0, 'h_enter fires within 3 m of a car on foot: ' + hints.near.join(','));

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
