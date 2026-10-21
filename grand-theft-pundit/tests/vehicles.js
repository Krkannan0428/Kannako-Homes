/* vehicles.js: the v0.3 vehicles track (js/06b_vehicles_air_sea.js).
 *  1 registration: seven new types in GTP.C.VEHICLES with a family, GTP.Assets.vehicleMeshes[type] builds a mesh,
 *    vehicle.hud() on every vehicle (a sedan too), the fleet parks aircraft at the airport and boats at the marina
 *  2 helicopter on real inputs: F enters, the rotor spins up, Shift climbs, a hands-off hover holds, W flies forward,
 *    the real Q key yaws, a bail above 30 m opens the Golden Parachute (Space), a soft landing; the empty heli
 *    falls and wrecks or sinks; a rotor strike on a tower is a crash; a gamepad (RT climb, RB yaw) flies it too
 *  3 prop plane: W rolls her down the runway, S rotates, a bank turns, a landing on the runway, S brakes to a stop;
 *    the jet takes off and folds its gear; a nose-in arrival is a crash; past the map edge the aircraft is turned back
 *  4 boats: the speedboat from the water (enter while swimming), throttle planes her, a wake, the quay is a wall;
 *    the jet ski leans into a turn
 *  5 motorcycle: lean in turns, a Shift wheelie, the rider drawn on the saddle, a wall at speed throws the rider
 *  5b drive_to objectives (real missions): a heli set down in the marker (hovering over it does not count), a speedboat
 *    at a waterline target, the moto
 *  6 the mod shop and garages: GTP.Vehicles.mod changes stats and rebuilds the mesh, modCatalog / buyMod charge money,
 *    a Spin Doctor drive-in bay emits modshop:open, store / retrieve, GTP.SaveRegistry.vehicles and a slot save keep them
 *  7 edge rules: inverted pitch, a burning heli comes down, the parachute cut-away, a wrecked boat sinks, an AI helmsman,
 *    a jet ski beached on sand, a save in a heli loads back in it, New Game empties the garages
 * Screenshots in tests/out (look at them): veh_heli_flight, veh_parachute, veh_plane_flight, veh_jet_flight,
 * veh_speedboat, veh_jetski, veh_moto, veh_lineup_air, veh_lineup_sea, veh_mods */
'use strict';
const H = require('./_harness');

H.run('vehicles', async (t) => {
  const ctx = await t.boot({ seed: 7, clock: 13 });
  const { page } = ctx;
  await page.evaluate(() => {
    window.T_ = {
      press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
      hold(a, s) { GTP.Input.set(a, true); GTP.game.advance(s); GTP.Input.set(a, false); },
      board(v) { const d = v.doorWorld(0); GTP.game.debug.teleport(d.x, d.z); GTP.game.advance(0.1); T_.press('enter'); GTP.game.advance(1.0); return GTP.game.player.inVehicle === v; },
      brief(v) { const h = v.hud(); return { sp: h.speed, alt: h.alt, p: h.pitch, r: h.roll, hd: h.headingDeg, thr: h.throttle, gear: h.gear, og: h.onGround, wreck: !!v.wreck, x: Math.round(v.x), z: Math.round(v.z) }; },
      rw() { return GTP.World.landmark('airport_runway').points.west; },
      clearAround(x, z, r) { GTP.Entities.list.slice().forEach((e) => { if (e.kind === 'vehicle' && !e.persistent && !e.hasPlayer() && GTP.util.dist2d(e.x, e.z, x, z) < r) e.destroy(); }); GTP.game.advance(1 / 60); }
    };
  });

  // ---- 1. registration ----
  const reg = await page.evaluate(() => {
    const V = GTP.Vehicles, C = GTP.C, out = {};
    out.types = V.types.map((ty) => ({ ty, fam: C.VEHICLES[ty] && C.VEHICLES[ty].family, mesh: !!(GTP.Assets.vehicleMeshes[ty] && GTP.Assets.vehicleMeshes[ty]({ type: ty, cls: C.VEHICLES[ty], color: '#c94040' }).isObject3D) }));
    const p = GTP.game.player, sedan = GTP.game.debug.spawnVehicle(p.x + 6, p.z, 'sedan');
    out.sedanHud = sedan.hud();
    GTP.game.advance(2);
    out.fleet = V.state().fleet;
    out.api = ['mod', 'modCatalog', 'buyMod', 'store', 'retrieve', 'garage', 'spawn', 'hud', 'riderPose'].filter((k) => typeof V[k] !== 'function');
    out.registry = !!(GTP.SaveRegistry && GTP.SaveRegistry.vehicles && GTP.SaveRegistry.vehicles.get && GTP.SaveRegistry.vehicles.set);
    out.state = V.state();
    sedan.destroy();
    return out;
  });
  console.log('  registration: ' + JSON.stringify({ types: reg.types, fleet: reg.fleet.map((s) => s.type + '@' + s.x + ',' + s.z), state: { installed: reg.state.installed, render: reg.state.render, saves: reg.state.saves } }));
  t.assert(reg.types.length === 7 && reg.types.every((x) => x.fam && x.mesh), 'seven types with a family and a mesh builder');
  t.assert(['moto', 'heli', 'plane', 'jet', 'speedboat', 'jetski', 'parachute'].every((ty) => reg.types.some((x) => x.ty === ty)), 'every planned type is registered');
  t.assert(reg.sedanHud && reg.sedanHud.family === 'car' && 'speed' in reg.sedanHud && 'alt' in reg.sedanHud && 'heading' in reg.sedanHud && 'headingDeg' in reg.sedanHud && 'gear' in reg.sedanHud && 'throttle' in reg.sedanHud && 'pitch' in reg.sedanHud && 'roll' in reg.sedanHud, 'hud() on a car: ' + JSON.stringify(reg.sedanHud));
  t.assert(reg.api.length === 0 && reg.registry, 'the API and the save registry entry exist: ' + reg.api.join(','));
  t.assert(reg.state.installed && reg.state.render && reg.state.saves, 'the deferred hooks installed');
  const fleetTypes = new Set(reg.fleet.map((s) => s.type));
  t.assert(['plane', 'jet', 'heli', 'speedboat', 'moto'].every((ty) => fleetTypes.has(ty)), 'the fleet parks planes, a jet, helicopters, boats and bikes: ' + [...fleetTypes].join(','));

  // the line-ups (stills): every model side by side
  await page.evaluate(() => {
    const V = GTP.Vehicles, rw = T_.rw();
    V.fleet.enabled = false; V.fleet.refresh();
    const bx = rw.x + 150, bz = rw.z;
    GTP.game.debug.teleport(bx, bz - 16); GTP.game.advance(0.3); T_.clearAround(bx, bz, 80);
    window._line = [['plane', -26, 0, 0.6], ['jet', -8, 0, 0.7], ['heli', 10, 0, 0.9], ['moto', 21, 3, 1.2], ['parachute', 28, 2, 1.0]].map(([ty, dx, dz, yaw]) => V.spawn(ty, bx + dx, bz + dz, { yaw: Math.PI * yaw }));
    const rider = new GTP.Ped({ x: bx + 28, z: bz + 2 }); GTP.Entities.add(rider); window._line[4].enter(rider, 0);
    const biker = new GTP.Ped({ x: bx + 21, z: bz + 3 }); GTP.Entities.add(biker); window._line[3].enter(biker, 0);
    window._line[2].rotor = 1;
    GTP.game.advance(1 / 60);
    window._line[4].chute = 'open'; window._line[4].openT = 3; window._line[4].y = 0.4;
    GTP.Render.freeCam(true);
    const cam = GTP.Render.camera; cam.position.set(bx + 2, 7, bz + 26); cam.lookAt(bx + 2, 2, bz);
  });
  console.log('  ' + await t.shot(page, 'veh_lineup_air'));
  await page.evaluate(() => {
    const V = GTP.Vehicles, W = GTP.World;
    window._line.forEach((v) => v.destroy());
    const lm = W.landmark('velvetine_pier'), sp = V.findClear(lm.door.x, lm.door.z, 'water', 5, 80);
    GTP.game.debug.teleport(lm.door.x, lm.door.z); GTP.game.advance(0.3);
    window._line = [V.spawn('speedboat', sp.x, sp.z, { yaw: 0.6 }), V.spawn('jetski', sp.x + 6, sp.z + 4, { yaw: -0.5 })];
    GTP.game.advance(0.5);
    const cam = GTP.Render.camera; cam.position.set(sp.x + 3, 3.5, sp.z + 13); cam.lookAt(sp.x + 3, -0.6, sp.z + 1);
  });
  console.log('  ' + await t.shot(page, 'veh_lineup_sea'));
  await page.evaluate(() => { window._line.forEach((v) => v.destroy()); GTP.Render.freeCam(false); GTP.game.advance(0.1); });

  // ---- 2. the helicopter ----
  const heli = await page.evaluate(() => {
    const V = GTP.Vehicles, g = GTP.game, p = g.player, out = {}, rw = T_.rw();
    const hx = rw.x + 160, hz = rw.z;
    g.debug.teleport(hx + 6, hz); g.advance(0.2); T_.clearAround(hx, hz, 30);
    const h = window._heli = V.spawn('heli', hx, hz, { yaw: Math.PI / 2 });
    out.boarded = T_.board(h);
    g.advance(2.6); out.rotor = +h.rotor.toFixed(2); out.engine = GTP.Audio.state().engine;
    T_.hold('run', 3.5); out.climb = T_.brief(h);
    g.advance(1.0); const a0 = h.hud().alt; g.advance(2.0); out.hoverDrift = +(h.hud().alt - a0).toFixed(2); out.hover = T_.brief(h);
    T_.hold('forward', 4); out.forward = T_.brief(h);
    return out;
  });
  // the real Q key through the raw listener
  const hd0 = await page.evaluate(() => window._heli.hud().headingDeg);
  await page.keyboard.down('KeyQ');
  await page.evaluate(() => GTP.game.advance(1.2));
  await page.keyboard.up('KeyQ');
  const hd1 = await page.evaluate(() => { GTP.game.advance(0.2); return window._heli.hud().headingDeg; });
  await page.evaluate(() => GTP.game.advance(0.3));
  console.log('  ' + await t.shot(page, 'veh_heli_flight'));
  const bail = await page.evaluate(() => {
    const g = GTP.game, p = g.player, h = window._heli, out = {};
    T_.hold('run', 4); out.high = T_.brief(h);
    T_.press('enter'); g.advance(0.2);
    out.chute = p.inVehicle && p.inVehicle.type; out.hud = p.inVehicle && p.inVehicle.hud();
    g.advance(1.2); out.free = p.inVehicle && p.inVehicle.hud();
    T_.press('jump'); g.advance(1.5); out.open = p.inVehicle && p.inVehicle.hud();
    window._chute = p.inVehicle;
    return out;
  });
  await page.evaluate(() => GTP.game.advance(0.2));
  console.log('  ' + await t.shot(page, 'veh_parachute'));
  const land = await page.evaluate(() => {
    const g = GTP.game, p = g.player, h = window._heli, out = {};
    let n = 0; while (p.inVehicle && n < 80) { g.advance(0.5); n++; }
    out.landed = { t: n * 0.5, inV: !!p.inVehicle, hp: Math.round(p.hp), alive: p.alive, swim: p.swimming };
    n = 0; while (!h.wreck && !h.sinking && !h.removed && n < 60) { g.advance(0.5); n++; }
    out.heli = { wreck: h.wreck, sinking: h.sinking, removed: h.removed, rotor: +(h.rotor || 0).toFixed(2) };
    out.stats = { skydives: p.stats.skydives };
    return out;
  });
  console.log('  heli: ' + JSON.stringify({ heli, hd0, hd1, bail: { high: bail.high, chute: bail.chute, free: bail.free && { alt: bail.free.alt, vs: bail.free.vs, prompt: bail.free.prompt }, open: bail.open && { vs: bail.open.vs, chute: bail.open.chute } }, land }));
  t.assert(heli.boarded && heli.rotor >= 0.95, 'F boards the heli and the rotor spins up: ' + heli.rotor);
  t.assert(heli.engine.cls === 'heli' && heli.engine.level > 0.5, 'the engine voice follows the heli: ' + JSON.stringify(heli.engine));
  t.assert(heli.climb.alt > 15 && !heli.climb.og, 'Shift climbs: ' + JSON.stringify(heli.climb));
  t.assert(Math.abs(heli.hoverDrift) < 0.6, 'hands off, she settles into a hover: drift ' + heli.hoverDrift);
  t.assert(heli.forward.sp > 15 && heli.forward.p < -0.2, 'W tips the nose and flies forward: ' + JSON.stringify(heli.forward));
  const dh = ((hd1 - hd0 + 540) % 360) - 180;
  t.assert(Math.abs(dh) > 25, 'the Q key yaws through the raw listener: ' + hd0 + ' -> ' + hd1);
  t.assert(bail.high.alt > 30 && bail.chute === 'parachute' && bail.hud.chute === 'free' && bail.hud.prompt, 'bailing above 30 m puts the player under the Golden Parachute in freefall: ' + JSON.stringify(bail.hud && bail.hud.prompt));
  t.assert(bail.free.vs < -12, 'freefall picks up speed: ' + bail.free.vs);
  t.assert(bail.open.chute === 'open' && bail.open.vs > -8, 'Space opens the canopy and slows the descent: ' + JSON.stringify(bail.open));
  t.assert(!land.landed.inV && land.landed.alive && land.landed.hp > 60, 'a soft landing under the canopy: ' + JSON.stringify(land.landed));
  t.assert(land.heli.wreck || land.heli.sinking || land.heli.removed, 'the empty heli comes down: ' + JSON.stringify(land.heli));
  t.assert(land.stats.skydives >= 1, 'the skydive is counted');

  const strike = await page.evaluate(() => {
    const V = GTP.Vehicles, g = GTP.game, p = g.player, out = {};
    if (p.inVehicle) p.inVehicle.exit(p);
    const b = GTP.World.buildings.filter((bb) => bb.h > 25).sort((a, c) => c.h - a.h)[0];
    g.debug.teleport(b.x - 60, b.z + b.d / 2); g.advance(0.2);
    const crashes = []; const fn = (e) => crashes.push(e.cause); GTP.Events.on('vehicle:crash', fn);
    // an empty news heli on autopilot, at half the tower's height, told to fly through it
    const h = V.spawn('heli', b.x - 30, b.z + b.d / 2, { y: b.y + b.h * 0.5, yaw: GTP.util.dirToYaw(1, 0) });
    h.rotor = 1; h.onGround = false; h.autopilot = { x: b.x + b.w / 2, z: b.z + b.d / 2, alt: b.h * 0.5 };
    let n = 0; while (!h.wreck && n < 60) { g.advance(0.25); n++; if (n === 3) out.rotorSound = GTP.Audio.state().heli; }
    out.wreck = h.wreck; out.cause = crashes; out.t = n * 0.25; out.alt = Math.round(h.y);
    GTP.Events.off('vehicle:crash', fn);
    return out;
  });
  console.log('  rotor strike: ' + JSON.stringify(strike));
  t.assert(strike.wreck && strike.cause.length >= 1, 'flying into a tower is a crash: ' + JSON.stringify(strike));
  t.assert(strike.rotorSound && strike.rotorSound.on, 'an AI-flown heli drives the rotor loop: ' + JSON.stringify(strike.rotorSound));

  const pad = await page.evaluate(() => {
    const V = GTP.Vehicles, g = GTP.game, p = g.player, out = {}, rw = T_.rw();
    const fake = { index: 0, id: 'Fake Standard Pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] };
    for (let i = 0; i < 17; i++) fake.buttons.push({ pressed: false, value: 0 });
    navigator.getGamepads = () => [fake];
    const hx = rw.x + 200, hz = rw.z;
    g.debug.teleport(hx + 6, hz); g.advance(0.2); T_.clearAround(hx, hz, 25);
    const h = V.spawn('heli', hx, hz, { yaw: 0 });
    h.enter(p, 0); g.advance(2.6);
    fake.buttons[7] = { pressed: true, value: 1 }; g.advance(3); fake.buttons[7] = { pressed: false, value: 0 };
    out.climb = T_.brief(h);
    const y0 = h.hud().headingDeg;
    fake.buttons[5] = { pressed: true, value: 1 }; g.advance(1); fake.buttons[5] = { pressed: false, value: 0 };
    out.yaw = [y0, h.hud().headingDeg];
    fake.axes[1] = -1; g.advance(2); fake.axes[1] = 0; out.fwd = T_.brief(h);
    fake.buttons[6] = { pressed: true, value: 1 }; g.advance(2); fake.buttons[6] = { pressed: false, value: 0 }; out.down = T_.brief(h);
    navigator.getGamepads = () => []; g.advance(1 / 60); GTP.Input._device('keyboard');
    // land it and step out
    GTP.Vehicles.virtAxes = { collective: -1 }; let n = 0; while (!h.onGround && n < 40) { g.advance(0.25); n++; } GTP.Vehicles.virtAxes = null;
    out.landed = h.onGround && !h.wreck;
    T_.press('enter'); g.advance(0.5); out.out = !p.inVehicle;
    return out;
  });
  console.log('  gamepad: ' + JSON.stringify(pad));
  t.assert(pad.climb.alt > 10, 'RT climbs on a pad: ' + JSON.stringify(pad.climb));
  t.assert(Math.abs(((pad.yaw[1] - pad.yaw[0] + 540) % 360) - 180) > 20, 'RB yaws on a pad: ' + pad.yaw);
  t.assert(pad.fwd.sp > 8, 'the left stick flies it forward: ' + JSON.stringify(pad.fwd));
  t.assert(pad.down.alt < pad.fwd.alt - 4, 'LT descends: ' + pad.down.alt + ' < ' + pad.fwd.alt);
  t.assert(pad.landed && pad.out, 'set down and step out');

  // ---- 3. planes ----
  const plane = await page.evaluate(() => {
    const V = GTP.Vehicles, g = GTP.game, p = g.player, out = {}, rw = T_.rw();
    T_.clearAround(rw.x + 60, rw.z, 70);
    const pl = window._plane = V.spawn('plane', rw.x + 22, rw.z, { yaw: GTP.util.dirToYaw(1, 0) });
    out.boarded = T_.board(pl);
    GTP.Input.set('forward', true);
    for (let i = 0; i < 16 && pl.air < pl.cls.vRotate + 3; i++) g.advance(0.5);
    GTP.Input.set('forward', false);
    out.roll = T_.brief(pl); out.rollDist = Math.round(pl.x - rw.x - 22);
    T_.hold('back', 0.6); g.advance(3); out.air = T_.brief(pl);
    T_.hold('right', 0.6); g.advance(1.5); out.bank = T_.brief(pl);
    return out;
  });
  console.log('  ' + await t.shot(page, 'veh_plane_flight'));
  const plane2 = await page.evaluate(() => {
    const g = GTP.game, p = g.player, pl = window._plane, out = {}, rw = T_.rw();
    // the approach: a shallow glide onto the runway at a third throttle
    pl.x = rw.x + 15; pl.z = rw.z; pl.yaw = GTP.util.dirToYaw(1, 0); pl.y = 12; pl.pitch = -0.05; pl.roll = 0; pl.air = pl.cls.vStall + 7; pl.thr = 0.3; pl.onGround = false; pl.vx = pl.vz = pl.vy = 0; pl.snap();
    let n = 0; while (!pl.onGround && !pl.wreck && n < 80) { g.advance(0.25); n++; }
    out.touch = T_.brief(pl);
    GTP.Input.set('back', true); n = 0; while (pl.air > 0.5 && n < 40) { g.advance(0.25); n++; } GTP.Input.set('back', false);
    out.stopped = T_.brief(pl); out.stopX = Math.round(pl.x - rw.x);
    T_.press('enter'); g.advance(0.5); out.out = !p.inVehicle;
    // a nose-in arrival
    const crashes = []; const fn = (e) => crashes.push(e.cause); GTP.Events.on('vehicle:crash', fn);
    pl.y = 50; pl.pitch = -0.8; pl.air = 45; pl.onGround = false; pl.thr = 1; pl.snap();
    n = 0; while (!pl.wreck && n < 40) { g.advance(0.25); n++; }
    out.crash = { wreck: pl.wreck, causes: crashes };
    GTP.Events.off && GTP.Events.off('vehicle:crash', fn);
    return out;
  });
  const jet = await page.evaluate(() => {
    const V = GTP.Vehicles, g = GTP.game, p = g.player, out = {}, rw = T_.rw();
    T_.clearAround(rw.x + 60, rw.z, 70);
    const j = window._jet = V.spawn('jet', rw.x + 22, rw.z, { yaw: GTP.util.dirToYaw(1, 0) });
    out.boarded = T_.board(j);
    GTP.Input.set('forward', true);
    for (let i = 0; i < 16 && j.air < j.cls.vRotate + 4; i++) g.advance(0.5);
    GTP.Input.set('forward', false);
    out.roll = T_.brief(j);
    T_.hold('back', 0.5); g.advance(2.5); out.air = T_.brief(j);
    out.engine = GTP.Audio.state().engine;
    return out;
  });
  console.log('  ' + await t.shot(page, 'veh_jet_flight'));
  const edge = await page.evaluate(() => {
    const g = GTP.game, j = window._jet, out = {}, W = GTP.World;
    // past the south edge at speed: turned back, never stopped dead or crashed
    j.x = (W.bounds.x0 + W.bounds.x1) / 2; j.z = W.bounds.z1 + 100; j.y = 150; j.yaw = GTP.util.dirToYaw(0, 1); j.pitch = 0; j.roll = 0; j.air = 80; j.thr = 0.7; j.snap();
    g.advance(12);
    out.z = Math.round(j.z); out.limit = Math.round(W.bounds.z1 + 260); out.wreck = j.wreck; out.heading = j.hud().headingDeg;
    T_.press('enter'); g.advance(0.3);
    const ch = GTP.game.player.inVehicle; if (ch) ch.destroy();
    GTP.game.player.alive = true; GTP.game.player.hp = 100; GTP.game.player.knockedDown = false;
    GTP.game.debug.teleport(T_.rw().x + 40, T_.rw().z - 20); g.advance(0.5);
    if (g.state !== 'playing') g.setState('playing');
    return out;
  });
  console.log('  plane: ' + JSON.stringify({ plane, plane2, jet, edge }));
  t.assert(plane.boarded && plane.roll.sp > 24 && plane.roll.og && plane.rollDist < 260, 'W rolls the plane up to rotate speed on the runway: ' + JSON.stringify(plane.roll) + ' in ' + plane.rollDist + ' m');
  t.assert(!plane.air.og && plane.air.alt > 8, 'S rotates her off the ground: ' + JSON.stringify(plane.air));
  t.assert(plane.bank.hd > plane.air.hd + 10 && plane.bank.hd < 200, 'D banks her right and she turns: ' + plane.air.hd + ' -> ' + plane.bank.hd);
  t.assert(plane2.touch.og && !plane2.touch.wreck, 'a glide onto the runway lands: ' + JSON.stringify(plane2.touch));
  t.assert(plane2.stopped.sp < 1 && !plane2.stopped.wreck && plane2.stopped.og, 'S brakes her to a stop on the ground: ' + JSON.stringify(plane2.stopped));
  t.assert(plane2.out && plane2.crash.wreck && plane2.crash.causes.length, 'a nose-in arrival is a crash: ' + JSON.stringify(plane2.crash));
  t.assert(jet.boarded && jet.roll.sp > 40 && !jet.air.og && jet.air.alt > 22 && jet.air.gear === 'up', 'the jet takes off and folds its gear: ' + JSON.stringify(jet.air));
  t.assert(jet.engine.cls === 'jet', 'the jet engine voice: ' + JSON.stringify(jet.engine));
  t.assert(!edge.wreck && edge.z <= edge.limit && edge.heading > 270 || edge.heading < 90, 'past the map edge the jet is turned back, intact: ' + JSON.stringify(edge));

  // ---- 4. boats ----
  const boat = await page.evaluate(() => {
    const V = GTP.Vehicles, W = GTP.World, g = GTP.game, p = g.player, out = {};
    // open water south of the marina
    // the bay between the mainland and the airport (z 520..600): the first stretch with 14 m of open water around it
    const lm = W.landmark('velvetine_pier'); let sp = null;
    for (let dx = 40; dx < 400 && !sp; dx += 16) { const c = V.findClear(lm.door.x - dx, 562, 'water', 14, 6); if (c) sp = c; }
    out.spot = sp;
    const b = window._boat = V.spawn('speedboat', sp.x, sp.z, { yaw: GTP.util.dirToYaw(-1, 0) });   // west, away from the Sponsor Span
    g.debug.teleport(sp.x, sp.z + 3); g.advance(0.3); out.swim = p.swimming;
    T_.press('enter'); g.advance(1.6); out.boarded = p.inVehicle === b;
    const fx0 = GTP.Render.fx.list.length;
    T_.hold('forward', 5); out.fast = T_.brief(b); out.fx = GTP.Render.fx.list.length - fx0; out.y = +b.y.toFixed(2);
    GTP.Input.set('forward', true); GTP.Input.set('left', true); g.advance(0.6);
    return out;
  });
  console.log('  ' + await t.shot(page, 'veh_speedboat'));
  const boat2 = await page.evaluate(() => {
    const V = GTP.Vehicles, W = GTP.World, g = GTP.game, p = g.player, b = window._boat, out = {};
    g.advance(1.4); GTP.Input.set('left', false); out.turn = T_.brief(b);
    // full throttle at the shore for 14 s: she stops at the wall, never on land
    const lm = W.landmark('velvetine_pier');
    b.yaw = GTP.util.dirToYaw(lm.door.x - b.x, lm.door.z - b.z);
    g.advance(14); GTP.Input.set('forward', false);
    out.shore = T_.brief(b); out.wet = W.tileAt(b.x, b.z) === W.T.WATER || W.tileAt(b.x, b.z) === W.T.SAND;
    b.vx = b.vz = 0; T_.press('enter'); g.advance(0.6); out.swimOut = !p.inVehicle && (p.swimming || p.onGround);
    b.destroy();
    const sp = window._boatSpot = V.findClear(b.x, b.z, 'water', 10, 120);
    const j = window._ski = V.spawn('jetski', sp.x, sp.z, { yaw: GTP.util.dirToYaw(-1, 0) });
    j.enter(p, 0); g.advance(0.2);
    GTP.Input.set('forward', true); g.advance(3); GTP.Input.set('right', true); g.advance(0.8);
    out.ski = T_.brief(j); g.render(); out.skiRider = !!(p.mesh && p.mesh.visible);
    return out;
  });
  console.log('  ' + await t.shot(page, 'veh_jetski'));
  await page.evaluate(() => { GTP.Input.set('right', false); GTP.Input.set('forward', false); const p = GTP.game.player, j = window._ski; j.vx = j.vz = 0; GTP.game.advance(0.5); if (p.inVehicle) T_.press('enter'); GTP.game.advance(0.3); j.destroy(); });
  console.log('  boats: ' + JSON.stringify({ boat, boat2 }));
  t.assert(boat.swim && boat.boarded, 'a swimmer boards the speedboat');
  t.assert(boat.fast.sp > 15 && boat.fast.p > 0.02 && boat.y > -1.4 && boat.y < -0.8, 'throttle planes her at the waterline: ' + JSON.stringify(boat.fast) + ' y ' + boat.y);
  t.assert(boat.fx > 10, 'a wake trails her: ' + boat.fx + ' fx');
  t.assert(boat2.turn.hd !== boat.fast.hd, 'she turns');
  t.assert(boat2.wet && boat2.shore.sp < 3, 'the quay is a wall: ' + JSON.stringify(boat2.shore));
  t.assert(boat2.swimOut, 'stepping off at the quay: on the quay or in the water');
  t.assert(Math.abs(boat2.ski.r) > 0.08 && boat2.ski.sp > 10 && boat2.skiRider, 'the jet ski leans into the turn with the rider on it: ' + JSON.stringify(boat2.ski));

  // ---- 5. the motorcycle ----
  const moto = await page.evaluate(() => {
    const V = GTP.Vehicles, g = GTP.game, p = g.player, out = {}, rw = T_.rw();
    g.debug.teleport(rw.x + 40, rw.z - 10); g.advance(0.3); T_.clearAround(rw.x + 60, rw.z, 90);
    const m = window._moto = V.spawn('moto', rw.x + 30, rw.z, { yaw: GTP.util.dirToYaw(1, 0) });
    out.boarded = T_.board(m);
    T_.hold('forward', 1.8); out.fast = T_.brief(m);
    GTP.Input.set('forward', true); GTP.Input.set('run', true); g.advance(1.2);
    out.wheelie = { w: +m._wheelie.toFixed(2), pitch: +m.pitch.toFixed(2), hud: m.hud().wheelie };
    g.render(); out.rider = !!(p.mesh && p.mesh.visible);
    out.pose = V.riderPose(p);
    // swing the camera to the side for the picture (a look input holds it there)
    GTP.Render.rig.yaw = m.yaw - Math.PI / 2; GTP.Input.lastLookTime = g.time.t + 5; g.advance(0.25);
    return out;
  });
  console.log('  ' + await t.shot(page, 'veh_moto'));
  const moto2 = await page.evaluate(() => {
    const g = GTP.game, p = g.player, m = window._moto, out = {};
    GTP.Input.set('run', false); g.advance(1.0);
    out.drop = +m._wheelie.toFixed(2);
    GTP.Input.set('left', true); g.advance(0.35); out.lean = { r: +m.roll.toFixed(2), lean: +m._lean.toFixed(2) }; GTP.Input.set('left', false);
    GTP.Input.set('forward', false); T_.hold('back', 2.5);
    out.afterLean = { inV: p.inVehicle === m, alive: p.alive, state: g.state, sp: +m.speed.toFixed(1) };
    g.advance(0.5); p.hp = p.maxHp;
    if (p.inVehicle) { p.inVehicle.vx = p.inVehicle.vz = 0; p.inVehicle.speed = 0; p.inVehicle.exit(p); }
    g.advance(3);
    // a building with a clear 40 m run-up on its west side (no water, no other walls on the line)
    const W = GTP.World, okRun = (bb) => { const zc = bb.z + bb.d / 2; for (let d = 1; d <= 40; d += 1) { const x = bb.x - d; if (W.solidAt(x, zc, 1) || W.tileAt(x, zc) === W.T.WATER || W.tileAt(x, zc) === W.T.VOID || W.tileAt(x, zc) === W.T.RAMP) return false; } return true; };
    const wall = W.buildings.filter((bb) => bb.h > 4 && bb.d > 8 && okRun(bb)).sort((a1, b1) => GTP.util.dist2d(a1.x, a1.z, p.x, p.z) - GTP.util.dist2d(b1.x, b1.z, p.x, p.z))[0];
    out.wall = wall ? { x: Math.round(wall.x), z: Math.round(wall.z) } : null;
    g.debug.teleport(wall.x - 36, wall.z + wall.d / 2 + 3); g.advance(0.3);
    T_.clearAround(wall.x - 20, wall.z + wall.d / 2, 30);
    const m2 = GTP.Vehicles.spawn('moto', wall.x - 36, wall.z + wall.d / 2, { yaw: GTP.util.dirToYaw(1, 0) });
    m2.enter(p, 0); g.advance(0.2);
    const thrown0 = p.stats.thrown || 0;
    const thrown = []; const fn = (e) => thrown.push(e.cause); GTP.Events.on('moto:thrown', fn);
    T_.hold('forward', 5);
    out.thrown = { inV: !!p.inVehicle, causes: thrown, down: p.knockedDown || p.state === 'knockdown', stat: (p.stats.thrown || 0) - thrown0 };
    GTP.Events.off && GTP.Events.off('moto:thrown', fn);
    g.advance(3); p.hp = p.maxHp;
    return out;
  });
  console.log('  moto: ' + JSON.stringify({ moto, moto2 }));
  t.assert(moto.boarded && moto.fast.sp > 20, 'the bike pulls away: ' + JSON.stringify(moto.fast));
  t.assert(moto2.lean.r > 0.25, 'she leans into a left turn: ' + JSON.stringify(moto2.lean));
  t.assert(moto.wheelie.w > 0.3 && moto.wheelie.pitch > 0.3 && moto.wheelie.hud > 0.3, 'Shift pulls a wheelie: ' + JSON.stringify(moto.wheelie));
  t.assert(moto2.drop < 0.1, 'the wheel comes down when Shift is let go: ' + moto2.drop);
  t.assert(moto.rider && moto.pose && moto.pose.kind === 'moto', 'the rider sits on the saddle (drawn): ' + JSON.stringify(moto.pose));
  t.assert(!moto2.thrown.inV && moto2.thrown.causes.length >= 1 && moto2.thrown.stat >= 1, 'a wall at speed throws the rider: ' + JSON.stringify(moto2.thrown));

  // ---- 5b. drive_to objectives work with the new types (a heli set down in the marker, a boat at a waterline target, the moto) ----
  const dto = await page.evaluate(() => {
    const V = GTP.Vehicles, W = GTP.World, g = GTP.game, p = g.player, Ms = GTP.Missions, out = {}, rw = T_.rw();
    if (p.inVehicle) { p.inVehicle.vx = p.inVehicle.vz = 0; p.inVehicle.speed = 0; p.inVehicle.exit(p); }
    p.hp = p.maxHp; p.wanted = 0;
    const done = []; const fn = (e) => done.push(e && (e.id || (e.mission && e.mission.id))); GTP.Events.on('mission:complete', fn);
    const mk = (id, x, z, text) => { GTP.Content.missions.push({ id, title: 'Test ' + id, giver: null, requires: [], marker: null, reward: { cash: 1 }, objectives: [{ type: 'drive_to', target: { x, z }, radius: 10, vehicle: 'any', text }] }); };
    // heli: hovering 20 m over the marker does not count, setting down in it does
    const tx = rw.x + 110, tz = rw.z;
    mk('t_veh_heli', tx, tz, 'Set the Spin Cycle down on the runway');
    g.debug.teleport(tx - 40, tz - 12); g.advance(0.2); T_.clearAround(tx, tz, 40);
    const h = V.spawn('heli', tx - 30, tz, {}); h.enter(p, 0); g.advance(2.6);
    out.started = Ms.start('t_veh_heli', { skipIntro: true }); g.advance(0.5);
    h.x = tx; h.z = tz; h.y = W.heightAt(tx, tz, 0) + 20; h.onGround = false; h.vx = h.vz = h.vy = 0; h.snap(); g.advance(1.5);
    out.hover = done.indexOf('t_veh_heli') >= 0;
    GTP.Vehicles.virtAxes = { collective: -1 }; let n = 0; while (!h.onGround && n < 40) { g.advance(0.25); n++; } GTP.Vehicles.virtAxes = null;
    g.advance(2); out.landed = done.indexOf('t_veh_heli') >= 0; out.heliOk = !h.wreck;
    // the speedboat to a waterline target in the bay
    const lm = W.landmark('velvetine_pier'); let sp = null;
    for (let dx = 40; dx < 400 && !sp; dx += 16) { const c = V.findClear(lm.door.x - dx, 562, 'water', 12, 6); if (c) sp = c; }
    T_.press('enter'); g.advance(0.5); if (p.inVehicle) p.inVehicle.exit(p);
    g.debug.teleport(sp.x, sp.z - 30); g.advance(0.5);
    while (g.state !== 'playing' && n++ < 200) { GTP.Input.press('confirm'); g.advance(0.2); }
    mk('t_veh_boat', sp.x, sp.z, 'Bring the boat round');
    const b = V.spawn('speedboat', sp.x - 25, sp.z, { yaw: GTP.util.dirToYaw(1, 0) }); b.enter(p, 0); g.advance(0.3);
    out.started2 = Ms.start('t_veh_boat', { skipIntro: true }); g.advance(0.5);
    GTP.Input.set('forward', true); n = 0; while (done.indexOf('t_veh_boat') < 0 && n < 40) { g.advance(0.25); n++; } GTP.Input.set('forward', false);
    out.boat = done.indexOf('t_veh_boat') >= 0;
    b.vx = b.vz = 0; b.destroy(); g.advance(0.5);
    // the moto
    g.debug.teleport(rw.x + 40, rw.z - 12); g.advance(0.5);
    while (g.state !== 'playing' && n++ < 300) { GTP.Input.press('confirm'); g.advance(0.2); }
    mk('t_veh_moto', rw.x + 90, rw.z, 'Ride down the runway');
    const m = V.spawn('moto', rw.x + 40, rw.z, { yaw: GTP.util.dirToYaw(1, 0) }); m.enter(p, 0); g.advance(0.3);
    out.started3 = Ms.start('t_veh_moto', { skipIntro: true }); g.advance(0.5);
    GTP.Input.set('forward', true); n = 0; while (done.indexOf('t_veh_moto') < 0 && n < 40) { g.advance(0.25); n++; } GTP.Input.set('forward', false);
    out.moto = done.indexOf('t_veh_moto') >= 0;
    GTP.Events.off('mission:complete', fn);
    T_.hold('back', 2); if (p.inVehicle) { m.vx = m.vz = 0; m.speed = 0; m.exit(p); }
    while (g.state !== 'playing' && n++ < 400) { GTP.Input.press('confirm'); g.advance(0.2); }
    out.done = done; out.state = g.state;
    return out;
  });
  console.log('  drive_to: ' + JSON.stringify(dto));
  t.assert(dto.started && !dto.hover && dto.landed && dto.heliOk, 'drive_to: a heli hovering over the marker does not count, setting down completes it: ' + JSON.stringify(dto));
  t.assert(dto.started2 && dto.boat, 'drive_to: a speedboat reaches a waterline target');
  t.assert(dto.started3 && dto.moto, 'drive_to: the moto rides into the marker');

  // ---- 6. the mod shop, garages, saves ----
  const mods = await page.evaluate(() => {
    const V = GTP.Vehicles, g = GTP.game, p = g.player, out = {}, rw = T_.rw();
    if (p.inVehicle) p.inVehicle.exit(p);
    g.debug.teleport(rw.x + 40, rw.z - 20); g.advance(0.3);
    const car = window._car = g.debug.spawnVehicle(rw.x + 46, rw.z - 4, 'sports', { yaw: GTP.util.dirToYaw(1, 0) });
    const base = { accel: car.cls.accel, max: car.cls.maxSpeed, brake: car.cls.brake, hp: car.maxHp }, mesh0 = car.mesh;
    const r = V.mod(car, { engine: 4, brakes: 3, armor: 5, turbo: true, spoiler: 3, wheels: 2, tint: 3, horn: 'trombone', paint: { primary: '#2f6fd8', secondary: '#e8b53a', finish: 'chrome' } });
    out.ok = r.ok; out.stats = { accel: +(car.cls.accel / base.accel).toFixed(2), max: +(car.cls.maxSpeed / base.max).toFixed(2), brake: +(car.cls.brake / base.brake).toFixed(2), hp: car.maxHp / base.hp };
    out.shared = GTP.C.VEHICLES.sports.accel === base.accel;
    out.rebuilt = car.mesh !== mesh0 && !!car.mesh;
    // the looks: the models track draws them from vehicle.mods (its mods key), else 06b's overlay (a spoiler and rims)
    out.models = !!(GTP.Models && GTP.Models.syncVehicle); GTP.game.render();
    out.spoiler = out.models ? !!(GTP.Models.modsKey && GTP.Models.modsKey(car.mods)) : !!car.mesh.getObjectByName('spoiler');
    out.rims = out.models ? true : !!car.mesh.getObjectByName('rims'); out.color = car.color;
    const hp0 = car.hp; car.applyDamage(50, null, 'test'); out.armorTook = +(hp0 - car.hp).toFixed(1); car.hp = car.maxHp;
    out.catalog = V.modCatalog(car).length;
    // a purchase: the money moves and shop:buy fires
    p.money = 10000; const buys = []; const fn = (e) => buys.push(e.item && e.item.kind === 'mod' ? e.item.id : '?'); GTP.Events.on('shop:buy', fn);
    const car2 = window._car2 = g.debug.spawnVehicle(rw.x + 60, rw.z - 4, 'sedan', { yaw: 0 });
    const b1 = V.buyMod(car2, 'engine', 2), b2 = V.buyMod(car2, 'engine', 2), b3 = V.buyMod(car2, 'paint', { primary: '#d22f2f', finish: 'matte' });
    p.money = 10; const b4 = V.buyMod(car2, 'armor', 5);
    out.buy = { b1, b2: b2.reason, b3: b3.ok, b4: b4.reason, money: p.money, items: buys, engine: car2.mods.engine };
    GTP.Events.off && GTP.Events.off('shop:buy', fn);
    // a heli takes only engine and armour
    const h = V.spawn('heli', rw.x + 90, rw.z - 30, {});
    out.heliParts = [...new Set(V.modCatalog(h).map((x) => x.part))];
    h.destroy();
    return out;
  });
  await page.evaluate(() => {
    const car = window._car; GTP.Render.freeCam(true);
    const cam = GTP.Render.camera; cam.position.set(car.x + 4.5, 2.4, car.z + 5.5); cam.lookAt(car.x, 0.6, car.z);
  });
  console.log('  ' + await t.shot(page, 'veh_mods'));
  const shop = await page.evaluate(() => {
    const V = GTP.Vehicles, W = GTP.World, g = GTP.game, p = g.player, out = {};
    GTP.Render.freeCam(false);
    // a Spin Doctor bay (the world track places the real two; a stand-in here) and a drive-in
    const car = window._car2, bay = { x: car.x + 14, z: car.z };
    W.landmarks.push({ id: 'spin_doctor_test', name: 'Spin Doctor Customs', kind: 'modshop', x: bay.x, z: bay.z, door: { x: bay.x, z: bay.z, y: 0 } });
    W._lm.spin_doctor_test = W.landmarks[W.landmarks.length - 1];
    V.modshop.lmRef = null;
    const opened = []; const fn = (e) => opened.push(e.shop + ':' + (e.vehicle === car) + ':' + (e.catalog || []).length); GTP.Events.on('modshop:open', fn);
    car.yaw = GTP.util.dirToYaw(1, 0); car.snap();
    car.enter(p, 0); g.advance(0.2);
    p.wanted = 0;
    car.x = bay.x - 1; car.vx = car.vz = 0; car.snap(); g.advance(0.6);
    out.opened = opened.slice(); out.state = V.modshop.open;
    car.x = bay.x + 30; car.snap(); g.advance(0.6); out.closed = V.modshop.open;
    GTP.Events.off && GTP.Events.off('modshop:open', fn);
    W.landmarks.pop(); delete W._lm.spin_doctor_test; V.modshop.lmRef = null;
    // garages
    const sv = V.store('safe_penthouse', car);
    out.store = { ok: sv.ok, slot: sv.slot, inV: !!p.inVehicle, removed: car.removed, list: V.garage('safe_penthouse').map((r) => r.type + ':' + r.mods.engine) };
    out.full = (() => { const extra = []; for (let i = 0; i < 4; i++) { const c = g.debug.spawnVehicle(p.x + 8 + i * 5, p.z + 8, 'sedan'); extra.push(V.store('safe_penthouse', c)); } return extra.map((r) => r.ok ? 'ok' : r.reason); })();
    const back = V.retrieve('safe_penthouse', 0);
    out.retrieve = back ? { type: back.type, engine: back.mods && back.mods.engine, color: back.color, left: V.garage('safe_penthouse').length } : null;
    // the registry round trip and a slot save / load
    const snap = GTP.SaveRegistry.vehicles.get();
    out.registry = { garages: Object.keys(snap.garages), count: snap.garages.safe_penthouse.length };
    GTP.SaveRegistry.vehicles.set({ v: 1, garages: {} }); out.cleared = V.garage('safe_penthouse').length;
    GTP.SaveRegistry.vehicles.set(snap); out.restored = V.garage('safe_penthouse').length;
    out.saved = g.saveSlot(3, { reason: 'test' });
    GTP.SaveRegistry.vehicles.set({ v: 1, garages: {} });
    out.loaded = g.loadSlot(3); g.advance(0.5);
    out.afterLoad = V.garage('safe_penthouse').length;
    return out;
  });
  console.log('  mods: ' + JSON.stringify(mods));
  console.log('  shop: ' + JSON.stringify(shop));
  t.assert(mods.ok && mods.stats.accel > 1.3 && mods.stats.max > 1.1 && mods.stats.brake > 1.3 && mods.stats.hp >= 2, 'mods change the stats: ' + JSON.stringify(mods.stats));
  t.assert(mods.shared, 'the class table is untouched (per-vehicle copies)');
  t.assert(mods.rebuilt && mods.spoiler && mods.rims && mods.color === '#2f6fd8', 'the mesh is rebuilt with the paint, a spoiler and rims');
  t.assert(mods.armorTook < 40, 'armour soaks damage: ' + mods.armorTook);
  t.assert(mods.catalog > 20, 'the catalog lists the parts: ' + mods.catalog);
  t.assert(mods.buy.b1.ok && mods.buy.b2 === 'owned' && mods.buy.b3 && mods.buy.b4 === 'funds' && mods.buy.engine === 2 && mods.buy.items.length === 2 && mods.buy.items.every((i) => /^mod:/.test(i)), 'buyMod charges, refuses owned parts and empty wallets, emits shop:buy: ' + JSON.stringify(mods.buy));
  t.assert(mods.heliParts.indexOf('spoiler') < 0 && mods.heliParts.indexOf('engine') >= 0 && mods.heliParts.indexOf('armor') >= 0, 'aircraft take engine and armour only: ' + mods.heliParts);
  t.assert(shop.opened.length === 1 && /^spin_doctor_test:true:\d+/.test(shop.opened[0]) && !shop.closed, 'driving into the Spin Doctor bay opens the mod shop, leaving closes it: ' + JSON.stringify(shop));
  t.assert(shop.store.ok && !shop.store.inV && shop.store.removed && shop.store.list[0] === 'sedan:2', 'store() parks the car in the garage (the driver steps out): ' + JSON.stringify(shop.store));
  t.assert(shop.full.slice(0, 3).every((r) => r === 'ok') && shop.full[3] === 'full', 'a garage holds four: ' + shop.full);
  t.assert(shop.retrieve && shop.retrieve.type === 'sedan' && shop.retrieve.engine === 2 && shop.retrieve.color === '#d22f2f' && shop.retrieve.left === 3, 'retrieve() brings it back modded: ' + JSON.stringify(shop.retrieve));
  t.assert(shop.registry.count === 3 && shop.cleared === 0 && shop.restored === 3, 'the SaveRegistry entry round-trips the garages');
  t.assert(shop.saved && shop.loaded && shop.afterLoad === 3, 'a slot save and load keeps the garage: ' + JSON.stringify([shop.saved, shop.loaded, shop.afterLoad]));

  // ---- 7. edge rules: inverted pitch, the cut-away, a burning heli, a wrecked boat, sand, an AI helmsman, save / load in a heli, New Game ----
  const edges = await page.evaluate(() => {
    const V = GTP.Vehicles, W = GTP.World, g = GTP.game, p = g.player, out = {}, rw = T_.rw();
    if (p.inVehicle) { p.inVehicle.vx = p.inVehicle.vz = 0; p.inVehicle.speed = 0; p.inVehicle.exit(p); }
    p.hp = p.maxHp; p.knockedDown = false;
    const hx = rw.x + 120, hz = rw.z;
    g.debug.teleport(hx + 8, hz); g.advance(0.3); T_.clearAround(hx, hz, 40);
    // inverted pitch: W lifts the nose
    const h = V.spawn('heli', hx, hz, {}); h.enter(p, 0); h.rotor = 1; h.y += 30; h.onGround = false; h.snap();
    V.controls.invertPitch = true; T_.hold('forward', 0.8); out.inverted = +h.pitch.toFixed(2); V.controls.invertPitch = false; g.advance(1);
    // a burning heli loses lift and comes down (crash or wreck), it never hovers on
    p.godMode = true; h.applyDamage(h.hp + 5, null, 'test'); out.burning = h.burning;
    let n = 0; while (!h.wreck && n < 60) { g.advance(0.25); n++; }
    out.burnDown = { wreck: h.wreck, t: n * 0.25 }; p.godMode = false;
    g.advance(3); p.hp = p.maxHp; p.knockedDown = false; if (p.inVehicle) p.inVehicle.exit(p);
    while (g.state !== 'playing' && n++ < 400) { GTP.Input.press('confirm'); g.advance(0.2); }
    // the cut-away: F under an open canopy drops the rider (a tracked fall); the empty canopy goes away
    g.debug.teleport(hx, hz); g.advance(0.2);
    const ch = V.spawn('parachute', hx, hz, { y: 40 }); ch.chute = 'open'; ch.openT = 2; ch.enter(p, 0); g.advance(0.5);
    T_.press('enter'); g.advance(0.1); out.cut = { inV: !!p.inVehicle, falling: !p.onGround, tracked: !!p._fall, chute: ch.chute };
    p.godMode = true; g.advance(4); p.godMode = false; out.cutGone = ch.removed; p.hp = p.maxHp; p.knockedDown = false;
    // a wrecked boat on the water sinks; an AI helmsman drives a boat with the car controls
    const lm = W.landmark('velvetine_pier'); let sp = null;
    for (let dx = 40; dx < 400 && !sp; dx += 16) { const c = V.findClear(lm.door.x - dx, 562, 'water', 12, 6); if (c) sp = c; }
    g.debug.teleport(sp.x, sp.z - 40); g.advance(0.3);
    const wb = V.spawn('speedboat', sp.x, sp.z, {}); g.advance(0.2); wb.applyDamage(wb.hp + 10, null, 'test'); n = 0; while (!wb.sinking && !wb.removed && n < 40) { g.advance(0.25); n++; }
    out.boatSinks = wb.sinking || wb.removed;
    const ab = V.spawn('jetski', sp.x + 10, sp.z + 8, { yaw: GTP.util.dirToYaw(-1, 0) }), helm = new GTP.Ped({ x: sp.x + 10, z: sp.z + 8 }); GTP.Entities.add(helm); ab.enter(helm, 0);
    const x0 = ab.x; ab.setControls(1, 0, false, 0); g.advance(3); out.aiBoat = Math.round(x0 - ab.x);
    ab.destroy(); helm.destroy();
    // sand: a boat driven onto a beach is beached, never under the sand or floating over it
    let beach = null;
    for (let i = 0; i < W.tiles.length && !beach; i += 7) { if (W.tiles[i] !== W.T.SAND) continue; const tx = i % W.w, tz = (i / W.w) | 0, x = tx * 4 + 2, z = tz * 4 + 2; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (W.tileAt(x + dx * 12, z + dz * 12) === W.T.WATER && W.tileAt(x + dx * 24, z + dz * 24) === W.T.WATER) { beach = { x, z, dx, dz }; break; } } }
    out.beachFound = !!beach;
    if (beach) {
      g.debug.teleport(beach.x + beach.dx * 30, beach.z + beach.dz * 30 - 8); g.advance(0.3);
      const bb = V.spawn('jetski', beach.x + beach.dx * 22, beach.z + beach.dz * 22, { yaw: GTP.util.dirToYaw(-beach.dx, -beach.dz) }); bb.enter(p, 0); g.advance(0.2);
      T_.hold('forward', 4); g.advance(1);
      out.beach = { beached: bb.hud().beached, y: +bb.y.toFixed(2), ground: +W.heightAt(bb.x, bb.z, bb.y + 1).toFixed(2), tile: W.tileAt(bb.x, bb.z) };
      bb.vx = bb.vz = 0; T_.press('enter'); g.advance(0.5); bb.destroy();
    }
    // save in a heli, load: back in the heli; New Game empties the garages
    g.debug.teleport(hx + 8, hz); g.advance(0.3); T_.clearAround(hx, hz, 40);
    const sh = V.spawn('heli', hx, hz, {}); sh.enter(p, 0); g.advance(0.5);
    V.store('safe_brownstone', g.debug.spawnVehicle(p.x + 20, p.z + 10, 'sedan'));
    out.saved = g.saveSlot(2, { reason: 'test' }); out.loaded = g.loadSlot(2); g.advance(1);
    out.reloaded = { inV: p.inVehicle && p.inVehicle.type, garage: V.garage('safe_brownstone').length };
    V.fleet.enabled = true; g.newGame(7); g.advance(1);
    out.newGame = { garage: V.garage('safe_brownstone').length + V.garage('safe_penthouse').length, fleet: V.state().fleet.length };
    return out;
  });
  console.log('  edges: ' + JSON.stringify(edges));
  t.assert(edges.inverted > 0.15, 'inverted pitch: W lifts the nose: ' + edges.inverted);
  t.assert(edges.burning && edges.burnDown.wreck, 'a burning heli comes down: ' + JSON.stringify(edges.burnDown));
  t.assert(!edges.cut.inV && edges.cut.falling && edges.cut.tracked && edges.cut.chute === 'landed' && edges.cutGone, 'F under the canopy cuts away (a tracked fall) and the canopy goes: ' + JSON.stringify(edges.cut));
  t.assert(edges.boatSinks, 'a wrecked boat sinks');
  t.assert(edges.aiBoat > 10, 'an AI helmsman drives a jet ski with the car controls: ' + edges.aiBoat + ' m');
  t.assert(!edges.beachFound || (edges.beach.beached && edges.beach.y >= edges.beach.ground - 0.05 && edges.beach.y < edges.beach.ground + 0.6), 'a jet ski run onto sand is beached on it: ' + JSON.stringify(edges.beach));
  t.assert(edges.saved && edges.loaded && edges.reloaded.inV === 'heli' && edges.reloaded.garage === 1, 'a save in a heli loads back in the heli with the garage: ' + JSON.stringify(edges.reloaded));
  t.assert(edges.newGame.garage === 0 && edges.newGame.fleet > 4, 'New Game empties the garages and rebuilds the fleet: ' + JSON.stringify(edges.newGame));

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
