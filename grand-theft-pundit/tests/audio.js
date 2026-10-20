/* audio.js: GTP.Audio (03_audio).
 *  1 headless boot: audio is a no-op (no AudioContext) but the engine's SFX calls still arrive (enter, horn, shot, exit),
 *    the radio's logical state follows the vehicle, 10 s of city with no errors
 *  2 non-headless boot: a click on the canvas unlocks (an AudioContext in state running or suspended), Enter starts play;
 *    a spawned car + enter: the radio fades in; R twice changes radio.current(); the engine loop follows the speed;
 *    a screenshot of the HUD in the car (the station chip on the ticker); every contract SFX plays as a voice under the cap;
 *    a siren car next to the player drives the siren loop with a pan; wanted 2 runs with no errors; the helicopter hook;
 *    mute silences (no voices, loops stop) and unmute restores
 *  3 a muted boot (mute=1): no voices are ever created, no errors
 * Screenshot in tests/out: audio_radio_car (look at it). */
'use strict';
const H = require('./_harness');

async function livePage(t, params) {
  const page = await t.browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(t.url(params));
  await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.booted, null, { timeout: 240000 });
  await page.waitForFunction(() => GTP.game.frames >= 2, null, { timeout: 240000 });
  // freeze the live loop so the rest of the test drives the game deterministically with advance()
  await page.evaluate(() => { cancelAnimationFrame(GTP.game._raf); GTP.game._raf = 0; });
  await page.evaluate(() => {
    window.T_ = {
      press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
      car() {
        const p = GTP.game.player;
        if (p.inVehicle) return p.inVehicle;
        const rp = GTP.World.nearestRoadPoint(p.x, p.z) || { x: p.x + 3, z: p.z };   // on a lane, so forward drives instead of crashing
        const v = GTP.game.debug.spawnVehicle(rp.x, rp.z, 'sedan');
        const d = v.doorWorld(0); GTP.game.debug.teleport(d.x, d.z); GTP.game.advance(0.1);
        T_.press('enter'); GTP.game.advance(0.8);
        return v;
      },
      stop() { const v = GTP.game.player.inVehicle; if (v) { v.speed = 0; v.vx = 0; v.vz = 0; v.lateral = 0; } GTP.game.advance(0.1); }   // no bail-out knockdown on exit
    };
  });
  return { page, pageErrors, consoleErrors };
}

H.run('audio', async (t) => {
  // ---- 1. headless: a silent no-op with the logical surface intact ----
  const hctx = await t.boot({ seed: 7 });
  const headless = await hctx.page.evaluate(() => {
    const A = GTP.Audio, out = {};
    GTP.game.advance(10);
    out.ctx = A.ctx; out.muted = A.muted; out.headless = A.headless; out.state0 = A.state();
    out.names = A.names.slice();
    window.T_ = {
      press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
      stop() { const v = GTP.game.player.inVehicle; if (v) { v.speed = 0; v.vx = 0; v.vz = 0; v.lateral = 0; } GTP.game.advance(0.1); }
    };
    const p = GTP.game.player, rp = GTP.World.nearestRoadPoint(p.x, p.z) || { x: p.x + 3, z: p.z };
    const v = GTP.game.debug.spawnVehicle(rp.x, rp.z, 'sedan');
    const d = v.doorWorld(0); GTP.game.debug.teleport(d.x, d.z); GTP.game.advance(0.1);
    T_.press('enter'); GTP.game.advance(0.8);
    out.inCar = p.inVehicle === v;
    GTP.game.advance(0.6);
    out.radioOn = A.radio.isPlaying(); out.level = A.radio.level(); out.station0 = A.radio.current() && A.radio.current().id;
    T_.press('horn');
    T_.press('radio'); out.station1 = A.radio.current() && A.radio.current().id; out.now = A.radio.nowPlaying();
    GTP.Input.set('forward', true); GTP.game.advance(2); GTP.Input.set('forward', false);
    out.engine = A.state().engine;
    T_.stop(); T_.press('enter'); GTP.game.advance(0.5);
    out.radioOff = A.radio.isPlaying();
    GTP.game.debug.giveWeapon('pistol', 20);
    GTP.Input.set('shoot', true); GTP.game.advance(0.3); GTP.Input.set('shoot', false);
    GTP.game.advance(0.5);
    out.counts = Object.assign({}, A.counts);
    out.played = A.names.map((n) => A.play(n, { x: p.x, z: p.z, gain: 0.5 }));
    out.state = A.state();
    return out;
  });
  console.log('  headless: ' + JSON.stringify({ ctx: headless.ctx, inCar: headless.inCar, radioOn: headless.radioOn, station: [headless.station0, headless.station1], now: headless.now, engine: headless.engine, counts: headless.counts }));
  t.assert(headless.ctx === null && headless.muted && headless.headless, 'headless: no AudioContext, muted');
  t.assert(headless.names.length >= 19 && ['shot', 'horn', 'siren', 'crash', 'debate', 'dunk'].every((n) => headless.names.indexOf(n) >= 0), 'the contract names are listed');
  t.assert(headless.inCar && headless.radioOn && headless.level > 0.9, 'the radio is logically on in a car: ' + JSON.stringify([headless.radioOn, headless.level]));
  t.assert(headless.station0 === 'wail_101' && headless.station1 === 'pennant_fm' && /Pennant/.test(headless.now), 'R moves to the next station and nowPlaying names it');
  t.assert(headless.engine.cls === 'sedan' && headless.engine.level > 0.1 && !headless.engine.on, 'engine level follows the car (no loop without a context)');
  t.assert(!headless.radioOff, 'the radio stops on exit');
  t.assert(headless.counts.enter >= 1 && headless.counts.horn >= 1 && headless.counts.exit >= 1 && headless.counts.shot >= 1, 'the engine emits enter / horn / exit / shot: ' + JSON.stringify(headless.counts));
  t.assert(headless.played.every((r) => !r) && headless.state.voices === 0, 'play() creates nothing in headless');
  const herrs = await t.errors(hctx);
  t.assert(herrs.length === 0, 'headless errors:\n' + herrs.join('\n'));
  await hctx.page.close();

  // ---- 2. a live page: unlock, radio, engine, SFX, siren, heli, mute ----
  const ctx = await livePage(t, { headless: 0, skipTitle: 0, seed: 7 });
  const { page } = ctx;
  const before = await page.evaluate(() => ({ ctx: GTP.Audio.ctx, state: GTP.game.state }));
  t.assert(before.ctx === null && before.state === 'title', 'no AudioContext before a gesture: ' + JSON.stringify(before));
  await page.mouse.click(640, 200);          // a gesture on the canvas (the title menu sits lower)
  const unlocked = await page.evaluate(() => { const A = GTP.Audio; return { has: !!A.ctx, state: A.ctx && A.ctx.state, unlocked: A.unlocked, game: GTP.game.state }; });
  console.log('  unlock: ' + JSON.stringify(unlocked));
  t.assert(unlocked.has && (unlocked.state === 'running' || unlocked.state === 'suspended'), 'a click creates the AudioContext (running or suspended)');
  if (unlocked.game === 'title') { await page.keyboard.press('Enter'); await page.evaluate(() => GTP.game.advance(0.2)); }
  const playing = await page.evaluate(() => GTP.game.state);
  t.assert(playing === 'playing', 'Enter starts play: ' + playing);

  const car = await page.evaluate(() => {
    const A = GTP.Audio, p = GTP.game.player, out = {};
    const v = T_.car(); out.inCar = p.inVehicle === v;
    GTP.game.advance(0.6);
    out.radio0 = A.radio.state(); out.station0 = A.radio.current().id;
    T_.press('radio'); out.station1 = A.radio.current().id;
    T_.press('radio'); out.station2 = A.radio.current().id; out.index = A.station;
    GTP.game.advance(0.3);
    out.radio1 = A.radio.state(); out.static = A.counts.static | 0;
    GTP.Input.set('forward', true); GTP.game.advance(3); GTP.Input.set('forward', false);
    out.engine = A.state().engine; out.speed = v.speed;
    GTP.game.advance(0.2);
    out.voices = A.state().voices;
    return out;
  });
  console.log('  car: ' + JSON.stringify(car));
  t.assert(car.inCar && car.radio0.playing && car.radio0.level > 0.8 && car.radio0.live, 'the radio fades in inside the car and the sequencer is live');
  t.assert(car.station0 !== car.station1 && car.station1 !== car.station2 && car.index === 2, 'R twice changes radio.current(): ' + [car.station0, car.station1, car.station2].join(' > '));
  t.assert(car.static >= 2, 'tuning static on each switch: ' + car.static);
  t.assert(car.radio1.scheduled > 0, 'the sequencer scheduled steps: ' + car.radio1.scheduled);
  t.assert(car.engine.on && car.engine.cls === 'sedan' && car.engine.level > 0.2 && car.engine.rpm > 0.2, 'the engine loop runs and follows the speed: ' + JSON.stringify(car.engine));
  t.assert(car.voices <= 28, 'voices under the cap: ' + car.voices);
  await page.waitForTimeout(400);             // let the context clock move for the scheduled notes
  await t.shot(page, 'audio_radio_car');

  const sfx = await page.evaluate(() => {
    const A = GTP.Audio, p = GTP.game.player, out = {};
    T_.stop(); T_.press('enter'); GTP.game.advance(0.6);
    out.onFoot = !p.inVehicle; out.radioOff = A.radio.isPlaying();
    GTP.game.advance(1.2); out.level = A.radio.level(); out.engineOff = !A.state().engine.on;
    GTP.game.debug.giveWeapon('pistol', 30);
    GTP.Input.set('shoot', true); GTP.game.advance(0.4); GTP.Input.set('shoot', false);
    out.shots = A.counts.shot | 0;
    return out;
  });
  console.log('  sfx: ' + JSON.stringify(sfx));
  t.assert(sfx.onFoot && !sfx.radioOff && sfx.level < 0.05 && sfx.engineOff, 'leaving the car fades the radio out and stops the engine loop: ' + JSON.stringify([sfx.radioOff, sfx.level, sfx.engineOff]));
  t.assert(sfx.shots >= 1, 'firing a weapon plays shots: ' + sfx.shots);
  await page.waitForTimeout(150);             // past the per-name rate limits (the context clock is real time)
  const all = await page.evaluate(() => {
    const A = GTP.Audio, p = GTP.game.player, out = { played: {} };
    A.names.forEach((n) => { out.played[n] = A.play(n, { x: p.x + 2, z: p.z - 3, gain: 0.8 }); });
    out.voices = A.state().voices; out.max = A.state().maxVoices;
    out.far = A.play('ui', { x: p.x + 900, z: p.z, gain: 1 });   // beyond earshot: nothing is created
    return out;
  });
  console.log('  all names: ' + JSON.stringify(all));
  const missing = Object.keys(all.played).filter((n) => !all.played[n]);
  t.assert(missing.length === 0, 'every SFX name makes a voice; failed: ' + missing.join(','));
  t.assert(all.voices > 0 && all.voices <= all.max, 'voices within the cap: ' + all.voices + '/' + all.max);
  t.assert(all.far === false, 'a sound beyond earshot is skipped');
  await page.waitForTimeout(150);
  const horns = await page.evaluate(() => {
    // horn by class: a bus and a bike next to the player get their own voicings without an error
    const A = GTP.Audio, p = GTP.game.player, out = {};
    const bus = GTP.game.debug.spawnVehicle(p.x + 8, p.z + 8, 'bus'), bike = GTP.game.debug.spawnVehicle(p.x - 8, p.z + 8, 'bike');
    GTP.game.advance(0.2);
    out.bus = A.play('horn', { x: bus.x, z: bus.z, gain: 0.8 });
    out.bike = A.play('horn', { x: bike.x, z: bike.z, gain: 0.8, cls: 'bike' });
    out.truck = A.play('horn', { x: p.x, z: p.z, gain: 0.8, cls: 'truck' });
    return out;
  });
  console.log('  horns: ' + JSON.stringify(horns));
  t.assert(horns.bus && horns.bike && horns.truck, 'class horns from different spots all play: ' + JSON.stringify(horns));

  const sirens = await page.evaluate(() => {
    const A = GTP.Audio, p = GTP.game.player, out = {};
    const cop = GTP.game.debug.spawnVehicle(p.x + 14, p.z, 'cop');
    cop.siren = true; cop.lights = true;
    GTP.game.advance(0.6);
    out.s1 = A.state().siren;
    cop.siren = false; GTP.game.advance(0.5); out.s2 = A.state().siren;
    GTP.game.advance(1.5); out.s3 = A.state().siren;
    // the real thing: two stars bring cruisers
    GTP.game.debug.setWanted(2); GTP.game.advance(6);
    out.s4 = A.state().siren; out.wanted = GTP.game.player.wanted;
    GTP.AI.wanted.clear(); GTP.game.advance(0.5);
    // the helicopter hook
    A.heli(true, p.x + 40, p.z - 30); GTP.game.advance(0.3); out.h1 = A.state().heli;
    A.heli(false); GTP.game.advance(3.2); out.h2 = A.state().heli;
    return out;
  });
  console.log('  sirens: ' + JSON.stringify(sirens));
  t.assert(sirens.s1.active && sirens.s1.count === 1 && sirens.s1.gain > 0.3 && Math.abs(sirens.s1.pan) <= 1 && sirens.s1.dist < 20, 'a siren car next to the player drives the loop: ' + JSON.stringify(sirens.s1));
  t.assert(sirens.s2.count === 0 && sirens.s2.gain === 0 && !sirens.s3.active, 'the loop fades and stops when the siren goes off');
  t.assert(sirens.wanted === 2, 'two stars held through the chase: ' + sirens.wanted);
  t.assert(sirens.h1.on && sirens.h1.active && sirens.h1.gain > 0.05, 'the helicopter rotor loop: ' + JSON.stringify(sirens.h1));
  t.assert(!sirens.h2.on && !sirens.h2.active, 'the rotor stops after the helicopter leaves');

  const mute = await page.evaluate(() => {
    const A = GTP.Audio, p = GTP.game.player, out = {};
    T_.car(); GTP.game.advance(0.5);
    out.before = { engine: A.state().engine.on, live: A.radio.state().live };
    A.setMuted(true);
    out.playMuted = A.play('ui', { x: p.x, z: p.z, gain: 1 });
    GTP.game.advance(1.5);
    out.muted = A.state();
    A.setMuted(false); GTP.game.advance(0.5);
    out.playBack = A.play('cash', { x: p.x, z: p.z, gain: 1 });
    out.after = { engine: A.state().engine.on, live: A.radio.state().live, muted: A.muted };
    return out;
  });
  console.log('  mute: ' + JSON.stringify({ before: mute.before, playMuted: mute.playMuted, muted: { engine: mute.muted.engine.on, live: mute.muted.radio.live, muted: mute.muted.muted }, playBack: mute.playBack, after: mute.after }));
  t.assert(mute.before.engine && mute.before.live, 'engine and radio run before the mute');
  t.assert(mute.playMuted === false && mute.muted.muted && !mute.muted.engine.on && !mute.muted.radio.live, 'mute: no voices, loops torn down');
  t.assert(mute.playBack === true && mute.after.engine && mute.after.live && !mute.after.muted, 'unmute restores the loops and voices');
  // ---- offline renders: every sound has a sane level and shape (the audio equivalent of looking at a screenshot) ----
  const render = await page.evaluate(async () => {
    const A = GTP.Audio, out = { sfx: {}, stations: {}, engine: {} };
    for (const n of A.names) out.sfx[n] = await A.render(n, { seconds: 2.5, gain: 0.8 });
    out.sfx.horn_truck = await A.render('horn', { seconds: 1.6, cls: 'truck', gain: 0.8 });
    out.sfx.horn_bike = await A.render('horn', { seconds: 1.0, cls: 'bike', gain: 0.8 });
    out.sfx.crash_soft = await A.render('crash', { seconds: 2.5, gain: 0.25 });
    const st = GTP.Content.radio.stations;
    for (let i = 0; i < st.length; i++) out.stations[st[i].id] = await A.render('radio', { station: i, seconds: st[i].pattern && st[i].pattern.talk ? 14 : 6 });
    for (const c of ['sedan', 'sports', 'truck', 'bike']) out.engine[c] = await A.render('engine', { cls: c, level: 0.6, seconds: 2 });
    out.sirenLoop = await A.render('sirenLoop', { seconds: 3 });
    out.heliLoop = await A.render('heliLoop', { seconds: 2 });
    return out;
  });
  const row = (k, r) => k.padEnd(11) + ' peak ' + r.peak.toFixed(2) + '  rms ' + r.rms.toFixed(3) + '  loud ' + r.loudUntil.toFixed(1) + 's';
  console.log('  renders:\n    ' + Object.keys(render.sfx).map((k) => row(k, render.sfx[k])).join('\n    '));
  console.log('    ' + Object.keys(render.stations).map((k) => row(k, render.stations[k])).join('\n    '));
  console.log('    ' + Object.keys(render.engine).map((k) => row('eng:' + k, render.engine[k])).join('\n    '));
  console.log('    ' + row('sirenLoop', render.sirenLoop) + '\n    ' + row('heliLoop', render.heliLoop));
  const badSfx = Object.keys(render.sfx).filter((k) => { const r = render.sfx[k]; return !r || !(r.peak > 0.02) || r.peak > 0.995 || !(r.rms > 0.001) || r.loudUntil > 2.4; });
  t.assert(badSfx.length === 0, 'every SFX renders audible, unclipped and finite: ' + badSfx.join(','));
  const S = render.sfx;
  t.assert(S.ui.rms < S.shot.rms && S.ui.loudUntil < 0.4, 'the UI tick is a small short blip');
  t.assert(S.explode.loudUntil > 0.9 && S.explode.rms > S.hit.rms, 'the explosion is long and loud');
  t.assert(S.horn_truck.loudUntil > S.horn_bike.loudUntil + 0.3, 'the truck air horn holds longer than the bike beep');
  t.assert(S.crash_soft.loudUntil < S.crash.loudUntil && S.crash_soft.rms < S.crash.rms, 'a soft crash is shorter and quieter than a hard one');
  t.assert(S.mission.loudUntil > 1.2 && S.fail.loudUntil > 1.2, 'the fanfare and the fail slide last');
  const badSt = Object.keys(render.stations).filter((k) => { const r = render.stations[k]; return !r || !(r.rms > 0.01) || r.peak > 0.995; });
  t.assert(badSt.length === 0, 'every station renders music at a sane level: ' + badSt.join(','));
  const wail = render.stations.wail_101, bumper = wail.env.slice(0, 40), talk = wail.env.slice(105, 135);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  console.log('  wail bumper rms ' + mean(bumper).toFixed(4) + ' vs talk rms ' + mean(talk).toFixed(4));
  t.assert(mean(bumper) > mean(talk) * 1.5 && mean(talk) > 0.002, 'the talk station: four bars of bumper, then a quieter but audible host murmur');
  const badEng = Object.keys(render.engine).filter((k) => { const r = render.engine[k]; return !r || !(r.rms > 0.02) || r.peak > 0.995 || r.loudUntil < 1.9; });
  t.assert(badEng.length === 0, 'engine loops render continuous sound per class: ' + badEng.join(','));
  t.assert(render.sirenLoop.rms > 0.05 && render.sirenLoop.loudUntil >= 2.9 && render.heliLoop.rms > 0.02 && render.heliLoop.loudUntil >= 1.9, 'siren and rotor loops are continuous');

  const final = await page.evaluate(() => GTP.Audio.state());
  t.assert(final.errors === 0 && !final.disabled && (final.ctx === 'running' || final.ctx === 'suspended'), 'audio healthy at the end: ' + JSON.stringify({ errors: final.errors, ctx: final.ctx }));
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
  await page.close();

  // ---- 3. muted boot ----
  const mctx = await livePage(t, { headless: 0, skipTitle: 1, seed: 7, mute: 1 });
  await mctx.page.mouse.click(640, 200);
  const muted = await mctx.page.evaluate(() => {
    const A = GTP.Audio, p = GTP.game.player, out = { ctx: A.ctx ? A.ctx.state : null, muted: A.muted };
    T_.car(); T_.press('radio'); GTP.game.advance(1);
    out.station = A.radio.current().id; out.playing = A.radio.isPlaying();
    out.played = A.names.map((n) => A.play(n, { x: p.x, z: p.z, gain: 1 }));
    GTP.Input.set('forward', true); GTP.game.advance(1); GTP.Input.set('forward', false);
    out.state = A.state();
    return out;
  });
  console.log('  muted boot: ' + JSON.stringify({ ctx: muted.ctx, muted: muted.muted, station: muted.station, playing: muted.playing, voices: muted.state.voices, engine: muted.state.engine.on }));
  t.assert(muted.muted && muted.played.every((r) => !r) && muted.state.voices === 0 && !muted.state.engine.on && !muted.state.radio.live, 'mute=1 silences everything without errors');
  t.assert(muted.station === 'pennant_fm' && muted.playing, 'the radio logic still runs while muted');
  const merrs = await t.errors(mctx);
  t.assert(merrs.length === 0, 'muted errors:\n' + merrs.join('\n'));
  await mctx.page.close();
});
