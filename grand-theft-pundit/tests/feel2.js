/* feel2.js: the expansion's feel pass, nine looks at the bigger game (headless, seed 7), each a screenshot under tests/out/ to be
 * looked at, plus the checks that make them real: a rendered frame that is not monochrome and GTP.errors empty.
 *  1 feel2_opening.png      the opening cutscene (cs_opening) with its letterbox, Gus and Kip on the quad
 *  2 feel2_runway.png       a sports car flat out down Runway 10/10 (the chase camera, speed over 25 m/s)
 *  3 feel2_port.png         on foot in the container maze at Manifest Harbor (containers, stencils, a crane)
 *  4 feel2_uptown_night.png Heirloom Heights at 22:00: the club's awning and stanchions, lit windows, lamps
 *  5 feel2_race.png         Loop Race lr_01 just after the lights: the field on the deck
 *  6 feel2_rampage.png      Ratio Rampage rr_01: the hecklers with their signs closing in, the table leg up
 *  7 feel2_sniper.png       the Fact Checker's scope on a ped across the channel (the scope vignette, 2x)
 *  8 feel2_rocket.png       a Ratio Launcher rocket on a parked car (the fireball)
 *  9 feel2_map.png          the map page with a waypoint and its route
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/feel2.js */
'use strict';
const H = require('./_harness');

H.run('feel2', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  const shots = {};
  const look = async (name, minColors) => {
    const file = await t.shot(page, name);
    const px = await t.pixelStats(page);
    shots[name] = px;
    console.log('  ' + name + ': ' + file + ' ' + JSON.stringify(px));
    t.assert(px.colors > (minColors || 300), name + ' is not monochrome: ' + px.colors + ' colours');
  };
  await page.evaluate(() => {
    window.T_ = {
      press(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); },
      until(pred, maxSec, step) { step = step || 0.1; let s = 0; while (s < maxSec) { GTP.game.advance(step); s += step; if (pred()) return s; } return -1; },
      tp(x, z, y) { GTP.game.debug.teleport(x, z, y); },
      lookAt(x, z, pitch) { const p = GTP.game.player, R = GTP.Render.rig; R.yaw = GTP.util.dirToYaw(x - p.x, z - p.z); R.pitch = pitch == null ? 0.15 : pitch; R.snap(); GTP.game.advance(0.05); },
      enter(v) { const p = GTP.game.player, d = v.doorWorld(0); T_.tp(d.x, d.z); GTP.game.advance(0.1); T_.press('enter'); GTP.game.advance(0.7); return p.inVehicle === v; },
      reset() {
        const p = GTP.game.player; if (GTP.Strands.active()) GTP.Strands.end('test');
        GTP.Input.set('aim', false); GTP.Input.set('forward', false); GTP.Input.set('jump', false);
        // a car is braked to a stop before stepping out (stepping out at 35 m/s is a knockdown)
        if (p.inVehicle) { const v = p.inVehicle; v.vx = v.vz = 0; v.speed = 0; GTP.game.advance(0.1); p.exitVehicle(); }
        GTP.AI.wanted.clear(); GTP.game.debug.godMode(false); GTP.game.advance(0.3);
      }
    };
  });

  // ---- 1. the opening ----
  let r = await page.evaluate(() => {
    const Cs = GTP.Cutscenes;
    const ok = Cs.play('cs_opening', () => {});
    GTP.game.advance(1.8);
    return { ok, state: GTP.game.state, title: Cs.hud().title, actors: Object.keys(Cs.actors()) };
  });
  console.log('  opening: ' + JSON.stringify(r));
  t.assert(r.ok && r.state === 'cutscene' && r.actors.indexOf('gus') >= 0, 'the opening plays');
  await look('feel2_opening');
  await page.evaluate(() => { GTP.Cutscenes.cancel(); GTP.game.advance(0.2); T_.reset(); });

  // ---- 2. the runway at speed ----
  r = await page.evaluate(() => {
    const lm = GTP.World.landmark('airport_runway'), e = lm.points.east, w = lm.points.west, p = GTP.game.player;
    const yaw = GTP.util.dirToYaw(w.x - e.x, w.z - e.z);
    const car = GTP.game.debug.spawnVehicle(e.x, e.z, 'sports', { yaw });
    const inCar = T_.enter(car);
    GTP.Input.set('forward', true); GTP.game.advance(3.2);
    GTP.Render.rig.pitch = 0.12; GTP.Render.rig.snap(); GTP.game.advance(0.05);
    const out = { inCar, speed: +car.speed2d().toFixed(1), x: Math.round(car.x), z: Math.round(car.z), runway: !!(GTP.World.meta[GTP.World.tileIndex(Math.floor(car.x / 4), Math.floor(car.z / 4))] & GTP.World.M.RUNWAY), loop: GTP.World.loopAt(car.x, car.z, car.y), street: GTP.UI.state && GTP.UI.state.chip ? GTP.UI.state.chip : null };
    return out;
  });
  console.log('  runway: ' + JSON.stringify(r));
  t.assert(r.inCar && r.speed > 25 && r.runway, 'the sports car is flat out on the runway strip: ' + JSON.stringify(r));
  await look('feel2_runway');
  await page.evaluate(() => T_.reset());

  // ---- 3. the port maze ----
  r = await page.evaluate(() => {
    const lm = GTP.World.landmark('container_yard'), W = GTP.World, p = GTP.game.player;
    const mz = lm.maze || null;
    // a lane of the maze: the first open spot inside the yard rectangle east of the door
    let spot = null;
    for (let dx = 6; dx < 60 && !spot; dx += 2) for (let dz = -20; dz <= 20 && !spot; dz += 2) { const x = lm.door.x + dx, z = lm.door.z + dz; const tt = W.tileAt(x, z); if ((tt === W.T.PARKING || tt === W.T.PLAZA) && !W.solidAt(x, z, 0.5) && W.props.some((pr) => pr.kind === 'container' && Math.hypot(pr.x - x, pr.z - z) < 7)) spot = { x, z }; }
    if (!spot) spot = { x: lm.door.x, z: lm.door.z };
    T_.tp(spot.x, spot.z);
    const cont = W.props.filter((pr) => pr.kind === 'container' && Math.hypot(pr.x - p.x, pr.z - p.z) < 16);
    const crane = W.props.find((pr) => pr.kind === 'crane');
    const aim = cont.length ? cont[0] : (crane || lm);
    T_.lookAt(aim.x, aim.z, 0.1);
    return { spot, containers: cont.length, crane: !!crane, maze: !!mz, district: W.districtAt(p.x, p.z) && W.districtAt(p.x, p.z).id };
  });
  console.log('  port: ' + JSON.stringify(r));
  t.assert(r.containers >= 2 && r.district === 'port', 'on foot among the containers at the port: ' + JSON.stringify(r));
  await look('feel2_port');

  // ---- 4. uptown at night ----
  r = await page.evaluate(() => {
    const lm = GTP.World.landmark('heirloom_club'), W = GTP.World, p = GTP.game.player;
    GTP.game.debug.setClock(22);
    const d = lm.door, nx = d.x - (lm.building.x + lm.building.w / 2), nz = d.z - (lm.building.z + lm.building.d / 2), l = Math.hypot(nx, nz) || 1;
    T_.tp(d.x + nx / l * 9, d.z + nz / l * 9);
    T_.lookAt(d.x, d.z, 0.08);
    GTP.game.advance(0.5);
    return { district: W.districtAt(p.x, p.z) && W.districtAt(p.x, p.z).id, night: +GTP.Render.env.night.toFixed(2), awning: W.props.some((pr) => pr.kind === 'awning' && Math.hypot(pr.x - d.x, pr.z - d.z) < 8), stanchions: W.props.filter((pr) => pr.kind === 'stanchion' && Math.hypot(pr.x - d.x, pr.z - d.z) < 10).length, doorman: !!(lm.npcs && lm.npcs.some((n) => n.role === 'doorman')) };
  });
  console.log('  uptown: ' + JSON.stringify(r));
  t.assert(r.district === 'uptown' && r.night > 0.5 && r.stanchions >= 2 && r.doorman, 'the club at night in uptown (stanchions and a doorman at the door): ' + JSON.stringify(r));
  await look('feel2_uptown_night');
  await page.evaluate(() => { GTP.game.debug.setClock(12.5); T_.reset(); });

  // ---- 5. a race ----
  r = await page.evaluate(() => {
    const S = GTP.Strands, start = S.debug.markers().find((m) => m.id === 'lr_01');
    const car = GTP.game.debug.spawnVehicle(start.x, start.z + 10, 'sports', { yaw: 0, y: start.y });
    const inCar = T_.enter(car);
    T_.tp(start.x, start.z, start.y); GTP.game.advance(0.3);
    GTP.Input.set('jump', true);
    const s1 = T_.until(() => S.races.active(), 4, 0.1);
    GTP.Input.set('jump', false);
    GTP.game.advance(5.5);   // the lights, then the field (lined up behind the line) launches past the standing player
    const rc = S.races.cur;
    T_.lookAt(start.x, start.z - 40, 0.2);
    return { inCar, s1, racers: rc ? rc.racers.length : 0, countdown: rc ? +rc.countdown.toFixed(1) : null, hud: S.races.hud() };
  });
  console.log('  race: ' + JSON.stringify(r));
  t.assert(r.inCar && r.s1 > 0 && r.racers === 3, 'Loop Race lr_01 started with three racers: ' + JSON.stringify(r));
  await look('feel2_race');
  await page.evaluate(() => T_.reset());

  // ---- 6. a rampage ----
  r = await page.evaluate(() => {
    const S = GTP.Strands, p = GTP.game.player;
    GTP.game.debug.godMode(true);
    const mk = S.debug.markers().find((m) => m.id === 'rr_01');
    T_.tp(mk.x + 20, mk.z); GTP.game.advance(0.3); T_.tp(mk.x, mk.z);
    const s1 = T_.until(() => S.active() === 'ratio_rampages', 3, 0.1);
    const c = S.current();
    const s2 = T_.until(() => c && c.hecklers.length > 0, 8, 0.25);
    GTP.game.advance(1.5);
    const h = c && c.hecklers.find((x) => x.alive);
    if (h) { p.yaw = GTP.util.dirToYaw(h.x - p.x, h.z - p.z); T_.lookAt(h.x, h.z, 0.12); }
    return { s1, s2, weapon: p.weapon, hecklers: c ? c.hecklers.length : 0, nearest: h ? +Math.hypot(h.x - p.x, h.z - p.z).toFixed(1) : null };
  });
  console.log('  rampage: ' + JSON.stringify(r));
  t.assert(r.s1 > 0 && r.s2 > 0 && r.weapon === 'tableleg' && r.hecklers >= 4, 'the rampage is on with the table leg: ' + JSON.stringify(r));
  await look('feel2_rampage');
  await page.evaluate(() => T_.reset());

  // ---- 7. the sniper's scope ----
  r = await page.evaluate(() => {
    const p = GTP.game.player, CB = GTP.Combat, U = GTP.util;
    const lm = GTP.World.landmark('causeway_east');
    const pt = lm.points && lm.points.uptown ? lm.points.uptown : lm.door;
    T_.tp(pt.x, pt.z);
    GTP.game.debug.giveWeapon('sniper', 10); p.weapon = 'sniper';
    // a target across the water: a ped 70 m away along the causeway
    const far = lm.points && lm.points.island ? lm.points.island : { x: pt.x - 70, z: pt.z };
    const dx = far.x - pt.x, dz = far.z - pt.z, l = Math.hypot(dx, dz) || 1, tx = pt.x + dx / l * 70, tz = pt.z + dz / l * 70;
    const ped = GTP.game.debug.spawnPed(tx, tz);
    ped.ai = { mission: 'cutscene' };
    T_.lookAt(ped.x, ped.z, 0);
    GTP.Input.set('aim', true); GTP.game.advance(0.4);
    const eye = p.y + 1.6, dist = U.dist2d(ped.x, ped.z, p.x, p.z);
    GTP.Render.rig.pitch = Math.asin(U.clamp(2 * (eye - (ped.y + 1.0)) / dist, -0.5, 0.5)); GTP.Render.rig.snap(); GTP.game.advance(0.3);
    const hud = CB.hud();
    return { scope: !!(hud.scope && hud.scope.active), zoom: hud.scope && hud.scope.zoom, fov: Math.round(GTP.Render.camera.fov), cam: p.cameraMode, dist: Math.round(dist), range: hud.scope && Math.round(hud.scope.range) };
  });
  console.log('  sniper: ' + JSON.stringify(r));
  t.assert(r.scope && r.zoom === 2 && r.fov <= 31 && r.cam === 'first', 'the scope is up at 2x: ' + JSON.stringify(r));
  await look('feel2_sniper', 60);
  const sniped = await page.evaluate(() => {
    const p = GTP.game.player, ped = GTP.Entities.list.find((e) => e.kind === 'ped' && e.ai && e.ai.mission === 'cutscene' && !e.removed);
    const hp0 = ped ? ped.hp : 0;
    GTP.Input.set('shoot', true); GTP.game.advance(2 / 60); GTP.Input.set('shoot', false); GTP.game.advance(0.3);
    const out = { hp0, hp: ped ? ped.hp : null, alive: ped ? ped.alive : null, ammo: p.weapons.sniper, mag: p.ammo && p.ammo.sniper ? p.ammo.sniper.mag : null };
    T_.reset();
    return out;
  });
  console.log('  sniped: ' + JSON.stringify(sniped));
  t.assert(sniped.ammo < 10, 'the Fact Checker fired: ' + JSON.stringify(sniped));

  // ---- 8. a rocket ----
  r = await page.evaluate(() => {
    const p = GTP.game.player, U = GTP.util, W = GTP.World;
    const q = W.landmark('stadium').door; T_.tp(q.x, q.z); GTP.game.advance(0.2);
    const rp = W.nearestRoadPoint(p.x + 22, p.z);
    const car = GTP.game.debug.spawnVehicle(rp.x, rp.z, 'sedan');
    GTP.game.debug.giveWeapon('ratio', 6); p.weapon = 'ratio';
    GTP.game.debug.godMode(true);
    T_.lookAt(car.x, car.z, 0.04);
    GTP.Input.set('aim', true); GTP.game.advance(0.3);
    const hp0 = car.hp;
    // the launcher is semi-automatic and the trigger cadence carries over from the last shot: pull it until the rocket goes
    let s = -1;
    for (let i = 0; i < 12 && s < 0; i++) {
      GTP.Input.set('shoot', true); GTP.game.advance(2 / 60); GTP.Input.set('shoot', false);
      if (p.weapons.ratio < 6) s = T_.until(() => car.hp < hp0 || car.wreck, 3, 1 / 30);   // the flight (29 m at 40 m/s), then the burst
      else GTP.game.advance(0.25);
    }
    GTP.game.advance(0.12);
    const rockets = p.stats.rockets || 0, am = GTP.Combat.debug.ammoOf(p, 'ratio');
    return { s, hp0, hp: car.hp, wreck: car.wreck, ammo: p.weapons.ratio, rockets, mag: am && am.mag, reload: +(p.reloadT || 0).toFixed(2), aiming: p.aiming, aimActive: GTP.Combat.aim.active, weapon: p.weapon, state: GTP.game.state, control: p.controlEnabled, alive: p.alive, kd: p.knockedDown, explosion: GTP.Render.fx.list.filter((f) => f.type === 'explosion' || f.type === 'fire').length, dist: Math.round(U.dist2d(car.x, car.z, p.x, p.z)) };
  });
  console.log('  rocket: ' + JSON.stringify(r));
  t.assert(r.s > 0 && r.hp < r.hp0 && r.ammo < 6, 'the rocket hit the sedan: ' + JSON.stringify(r));
  await look('feel2_rocket');
  await page.evaluate(() => T_.reset());

  // ---- 9. the map with a waypoint ----
  r = await page.evaluate(() => {
    const p = GTP.game.player, lm = GTP.World.landmark('airport_terminal');
    GTP.UI.openMap(); GTP.game.advance(0.2);
    const wp = GTP.UI.setWaypoint(lm.door.x, lm.door.z);
    GTP.game.advance(0.5); GTP.game.render(); GTP.game.advance(2.2); GTP.game.render();   // the route refreshes on the drawn page every 2 s
    const st = GTP.UI.state;
    return { state: GTP.game.state, page: st.pause.page, tab: st.pause.tab, waypoint: wp, saved: GTP.game.waypoint, route: st.map && st.map.route ? st.map.route.length : null, dist: Math.round(Math.hypot(lm.door.x - p.x, lm.door.z - p.z)) };
  });
  console.log('  map: ' + JSON.stringify(r));
  t.assert(r.state === 'paused' && r.page === 'phone' && r.waypoint && r.saved && r.dist > 100, 'the map page is up with a waypoint set across the city: ' + JSON.stringify(r));
  await look('feel2_map');
  await page.evaluate(() => { GTP.UI.closePause(); GTP.game.advance(0.2); GTP.UI.setWaypoint(GTP.game.waypoint.x, GTP.game.waypoint.z); });

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
