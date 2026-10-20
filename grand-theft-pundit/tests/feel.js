/* feel.js: the game loop outside missions, on a non-headless page started from the title screen.
 *  1 the Loop: a sports car driven flat out around the elevated highway for 20 s with auto-steering on the lane field;
 *    screenshots every 5 s (feel_loop_05 .. feel_loop_20); the car stays on the deck and tops 30 m/s
 *  2 three stars on the Loop: cruisers respond; a drive into Detail & Evidence resprays for $300 and clears the stars (feel_garage)
 *  3 death: RATIO'D card (feel_wasted), hospital respawn with full health, fists only, -10% cash
 *  4 busted: a cop at arm's reach for a second -> DEPLATFORMED (feel_busted), precinct respawn, -$500
 *  5 save, reload the page, CONTINUE from the title: position, money, weapons, completed missions and flags restored (feel_continue)
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/feel.js */
'use strict';
const H = require('./_harness');

H.run('feel', async (t) => {
  const page = await t.browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(300000);
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const ctx = { page, pageErrors, consoleErrors };
  const url = t.url({ headless: 0, skipTitle: 0, seed: 7, mute: 1 });

  async function fromTitle(expectContinue) {
    await page.goto(url);
    await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.booted && GTP.game.state === 'title', null, { timeout: 240000 });
    await page.waitForFunction(() => GTP.game.frames >= 2, null, { timeout: 240000 });
    const items = await page.evaluate(() => { cancelAnimationFrame(GTP.game._raf); GTP.game._raf = 0; GTP.game.render(); return GTP.UI.state.title.items.map((i) => i.id); });
    t.assert((items[0] === 'continue') === expectContinue, 'title menu ' + (expectContinue ? 'offers CONTINUE first' : 'has no CONTINUE') + ': ' + items.join(','));
    await page.keyboard.press('Enter');
    const st = await page.evaluate(() => { GTP.game.advance(0.3); return GTP.game.state; });
    t.assert(st === 'playing', 'Enter starts play: ' + st);
    return items;
  }
  await page.goto('about:blank');
  await page.goto(url);
  await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.booted, null, { timeout: 240000 });
  await page.evaluate(() => { try { localStorage.removeItem('gtp.save.v2'); } catch (e) { /* blocked storage */ } });
  await fromTitle(false);

  // ---- 1. the Loop at full speed ----
  const loopStart = await page.evaluate(() => {
    const W = GTP.World, U = GTP.util, C = GTP.C, TILE = C.TILE, p = GTP.game.player;
    // a straight deck tile (no junction) in the middle of the Loop's tile list
    const tiles = GTP.AI.spawner.deckTiles.filter((i) => { const tx = i % W.w, tz = (i / W.w) | 0; const h = W.dlaneH[i], v = W.dlaneV[i]; return (h && !v) || (v && !h); });
    const i = tiles[Math.floor(tiles.length * 0.37)], tx = i % W.w, tz = (i / W.w) | 0;
    const x = (tx + 0.5) * TILE, z = (tz + 0.5) * TILE, y = C.DECK_Y;
    const rd = W.roadDir(x, z, y);
    GTP.game.debug.teleport(x, z, y);
    const v = GTP.game.debug.spawnVehicle(x, z, 'sports', { yaw: U.dirToYaw(rd.dx, rd.dz), y: y, color: '#ff2d6f' });
    const d = v.doorWorld(0); GTP.game.debug.teleport(d.x, d.z, y); GTP.game.advance(0.1);
    GTP.Input.set('enter', true); GTP.game.advance(1 / 60); GTP.Input.set('enter', false); GTP.game.advance(0.8);
    GTP.game.debug.setClock(16.5);
    window.F_ = { v, samples: [], onDeck: 0, n: 0, maxSpeed: 0, fell: 0 };
    return { inCar: p.inVehicle === v, x: Math.round(x), z: Math.round(z), y: v.y, deck: rd.deck, dir: [rd.dx, rd.dz] };
  });
  console.log('  loop start: ' + JSON.stringify(loopStart));
  t.assert(loopStart.inCar && loopStart.deck, 'in a sports car on the Loop deck');
  // a driver: read the lane field ahead (lookahead grows with speed, so the square corners are seen coming),
  // steer with the analog stick, lift off and brake when the heading error is big (how a player survives a corner)
  await page.evaluate(() => {
    window.F_.drive = function (seconds) {
      const W = GTP.World, U = GTP.util, F = window.F_, v = F.v, In = GTP.Input;
      In.touch.stick.active = true; In.touch.stick.y = 0;
      F.stuckT = F.stuckT || 0; F.revT = F.revT || 0;
      for (let k = 0; k < seconds * 10; k++) {
        // the lane on our own heading axis (a ramp joining the deck must not pull us off the ring)
        const f = U.yawToDir(v.yaw), axis = Math.abs(f.x) >= Math.abs(f.z) ? 'h' : 'v', rd = W.roadDir(v.x, v.z, v.y, axis);
        let steer = 0, diff = 0, corner = false;
        if (rd) {
          const same = (q) => q && q.dx === rd.dx && q.dz === rd.dz;
          const sp = Math.abs(v.speed), far = W.roadDir(rd.cx + rd.dx * (10 + sp * 1.3), rd.cz + rd.dz * (10 + sp * 1.3), v.y, axis);
          const near = W.roadDir(rd.cx + rd.dx * 12, rd.cz + rd.dz * 12, v.y, axis);
          let target;
          if (same(near)) target = { x: rd.cx + rd.dx * 12, z: rd.cz + rd.dz * 12 };
          else { const other = W.roadDir(v.x, v.z, v.y, axis === 'h' ? 'v' : 'h'); target = other && !same(other) ? { x: other.cx + other.dx * 8, z: other.cz + other.dz * 8 } : { x: rd.cx + rd.dx * 6, z: rd.cz + rd.dz * 6 }; }   // the corner: swing onto the next edge
          diff = U.wrapAngle(U.dirToYaw(target.x - v.x, target.z - v.z) - v.yaw); steer = U.clamp(-diff * 1.8, -1, 1);
          corner = (!same(far) || !same(near)) && sp > 12;   // a square corner needs ~10 m/s
        }
        if (Math.abs(v.speed) < 0.8) F.stuckT += 0.1; else F.stuckT = 0;
        if (F.stuckT > 1.5) { F.revT = 1.0; F.stuckT = 0; F.unsticks = (F.unsticks || 0) + 1; }
        if (F.revT > 0) { F.revT -= 0.1; In.set('forward', false); In.set('back', true); In.touch.stick.x = -steer; }
        else { In.set('forward', !corner); In.set('back', corner); In.touch.stick.x = steer; }
        GTP.game.advance(0.1);
        F.n++; if (v.y > 6) F.onDeck++; F.maxSpeed = Math.max(F.maxSpeed, v.speed); if (corner) F.braked = (F.braked || 0) + 1;
      }
      In.set('forward', false); In.set('back', false);
      F.samples.push({ x: Math.round(v.x), z: Math.round(v.z), y: +v.y.toFixed(1), speed: +v.speed.toFixed(1), street: W.streetAt(v.x, v.z, v.y), hp: Math.round(v.hp), braked: F.braked || 0 });
      return F.samples[F.samples.length - 1];
    };
  });
  for (let leg = 1; leg <= 4; leg++) {
    const r = await page.evaluate(() => window.F_.drive(5));
    console.log('  loop ' + (leg * 5) + 's: ' + JSON.stringify(r));
    await t.shot(page, 'feel_loop_' + (leg * 5 < 10 ? '0' : '') + leg * 5);
  }
  const loop = await page.evaluate(() => { const F = window.F_, In = GTP.Input; In.touch.stick.active = false; In.touch.stick.x = 0; GTP.game.advance(0.2); return { onDeck: F.onDeck / F.n, maxSpeed: +F.maxSpeed.toFixed(1), samples: F.samples, hp: Math.round(F.v.hp), inCar: GTP.game.player.inVehicle === F.v, dist: +Math.hypot(F.samples[3].x - F.samples[0].x, F.samples[3].z - F.samples[0].z).toFixed(0), errors: GTP.errors.length }; });
  console.log('  loop: ' + JSON.stringify(loop));
  t.assert(loop.onDeck > 0.8, 'the car stayed on the Loop deck: ' + loop.onDeck);
  t.assert(loop.maxSpeed > 30, 'the sports car topped 30 m/s: ' + loop.maxSpeed);
  t.assert(loop.inCar && loop.hp > 0, 'the car survived 20 s of the Loop with a driver who brakes into corners (hp ' + loop.hp + ')');
  t.assert(loop.samples.every((s) => s.street === 'The Loop'), 'the HUD names the Loop: ' + loop.samples.map((s) => s.street).join(','));

  // ---- 2. three stars, then pay-and-spray ----
  // three stars on the Loop: the response arrives within a few seconds (longer and a roadblock after the ramp ends the run in a bust)
  const stars = await page.evaluate(() => {
    const p = GTP.game.player;
    GTP.game.debug.setMoney(1000);   // a new game's $250 does not cover a three-star respray
    GTP.game.debug.setWanted(3);
    window.F_.drive(3);
    GTP.Input.touch.stick.active = false; GTP.Input.touch.stick.x = 0;
    const c = GTP.AI.debug.counts();
    return { wanted: p.wanted, counts: c, state: GTP.game.state, money: p.money, inCar: !!p.inVehicle };
  });
  console.log('  three stars: ' + JSON.stringify(stars));
  t.assert(stars.wanted === 3 && stars.state === 'playing' && stars.inCar && stars.counts.cruisers + stars.counts.foot > 0, 'three stars bring a response: ' + JSON.stringify(stars));
  const spray = await page.evaluate(() => {
    const p = GTP.game.player, v = p.inVehicle, W = GTP.World;
    const g = W.landmark('strip_garage');
    let ev = null; GTP.Events.on('garage', (e) => { ev = e; });
    const money0 = p.money, color0 = v.color;
    GTP.game.debug.teleport(g.garage.cx, g.garage.cz); v.vx = v.vz = 0; v.speed = 0;
    let s = 0; while (s < 4 && p.wanted > 0) { GTP.game.advance(0.25); s += 0.25; }
    GTP.Render.rig.yaw = v.yaw + 2.6; GTP.Render.rig.pitch = 0.3; GTP.Render.rig.snap(); GTP.game.advance(0.1);
    return { ev, wanted: p.wanted, heat: GTP.AI.wanted.heat, spent: money0 - p.money, s, hp: Math.round(v.hp), recolored: v.color !== color0, state: GTP.game.state };
  });
  console.log('  respray: ' + JSON.stringify(spray));
  t.assert(spray.ev && spray.ev.landmark === 'strip_garage' && spray.ev.cost === 300 && spray.spent === 300, 'Detail & Evidence resprays three stars for $300: ' + JSON.stringify(spray));
  t.assert(spray.wanted === 0 && spray.heat === 0 && spray.hp === 80 && spray.s < 1.5, 'stars cleared and the car repaired within a second');
  await t.shot(page, 'feel_garage');

  // ---- 3. death and the hospital ----
  const dead = await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World;
    p.exitVehicle(); GTP.game.advance(0.4);
    GTP.game.debug.giveWeapon('pistol', 12);
    const money0 = p.money;
    p.applyDamage(999, null, 'debug');
    GTP.game.advance(0.9);
    const out = { state: GTP.game.state, card: GTP.Combat.death && GTP.Combat.death.text, money0 };
    GTP.game.render();
    return out;
  });
  console.log('  dead: ' + JSON.stringify(dead));
  t.assert(dead.state === 'wasted' && dead.card === 'RATIO\'D', 'death shows the RATIO\'D card: ' + JSON.stringify(dead));
  await page.screenshot({ path: t.OUT + '/feel_wasted.png' });
  const hospital = await page.evaluate((money0) => {
    const p = GTP.game.player, W = GTP.World;
    GTP.game.advance(3.2);
    const h = W.landmark('hospital').door;
    return { state: GTP.game.state, hp: p.hp, weapons: Object.keys(p.weapons), money: p.money, expected: Math.round(money0 * 0.9), dHosp: +Math.hypot(p.x - h.x, p.z - h.z).toFixed(1), alive: p.alive, control: p.controlEnabled };
  }, dead.money0);
  console.log('  hospital: ' + JSON.stringify(hospital));
  t.assert(hospital.state === 'playing' && hospital.alive && hospital.hp === 100 && hospital.weapons.join(',') === 'fist' && hospital.money === hospital.expected && hospital.dHosp < 8 && hospital.control, 'respawned at the hospital: ' + JSON.stringify(hospital));

  // ---- 4. busted and the precinct ----
  const bust = await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World;
    const q = W.landmark('campus_quad').door; GTP.game.debug.teleport(q.x, q.z); GTP.game.advance(0.2);
    GTP.game.debug.setMoney(2000);
    GTP.game.debug.setWanted(1);
    const cop = GTP.game.debug.spawnPed(p.x + 1.1, p.z, null, 'cop');
    let s = 0; while (s < 4 && GTP.game.state !== 'busted') { GTP.game.advance(0.25); s += 0.25; }
    GTP.game.advance(0.6);
    GTP.game.render();
    return { state: GTP.game.state, s, card: GTP.Combat.death && GTP.Combat.death.text, copLine: cop.line };
  });
  console.log('  busted: ' + JSON.stringify(bust));
  t.assert(bust.state === 'busted' && bust.card === 'DEPLATFORMED', 'a cop at arm\'s reach deplatforms: ' + JSON.stringify(bust));
  await page.screenshot({ path: t.OUT + '/feel_busted.png' });
  const precinct = await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World;
    GTP.game.advance(3.2);
    const h = W.landmark('police_hq').door;
    return { state: GTP.game.state, money: p.money, wanted: p.wanted, dHQ: +Math.hypot(p.x - h.x, p.z - h.z).toFixed(1), control: p.controlEnabled };
  });
  console.log('  precinct: ' + JSON.stringify(precinct));
  // the fine (GDD_EXPANSION 6.9): $500 at one star, never over 15% of the cash: $300 of $2,000
  t.assert(precinct.state === 'playing' && precinct.money === 2000 - Math.min(500, Math.floor(2000 * 0.15)) && precinct.wanted === 0 && precinct.dHQ < 8 && precinct.control, 'released from the precinct, fined: ' + JSON.stringify(precinct));

  // ---- 5. save, reload, CONTINUE ----
  const saved = await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World, M = GTP.Missions;
    // the expansion's chain puts m01b_airport between m01_van and m02_read (GDD_EXPANSION §3.3): with it done, only m03 is lit
    ['m00_intro', 'm01_van', 'm01b_airport', 'm02_read'].forEach((id) => M.state.completed.add(id));
    M.state.flags.has_table = true; M.state.flags.has_van = true; M.state.flags.seen_airport = true; M.state.flags.sponsored = true;
    M.refreshMarkers();
    GTP.game.debug.setMoney(4321);
    GTP.game.debug.giveWeapon('pistol', 17); GTP.game.debug.giveWeapon('smg', 33);
    const d = W.landmark('nap_depot').door; GTP.game.debug.teleport(d.x + 4, d.z); p.yaw = 1.2;
    GTP.game.debug.setClock(9.25);
    GTP.game.advance(0.2);
    const ok = GTP.game.save();
    return { ok, x: +p.x.toFixed(2), z: +p.z.toFixed(2), money: p.money, weapons: Object.assign({}, p.weapons, { fist: 'inf' }), weapon: p.weapon, completed: Array.from(M.state.completed), markers: M.markers().map((m) => m.id), clock: +GTP.game.time.clock.toFixed(2), hasSave: GTP.game.hasSave() };
  });
  console.log('  saved: ' + JSON.stringify(saved));
  t.assert(saved.ok && saved.hasSave && saved.markers.join(',') === 'm03_ratio', 'saved with m00..m02 done (m03 lit): ' + JSON.stringify(saved));
  await fromTitle(true);
  const loaded = await page.evaluate(() => {
    const p = GTP.game.player, M = GTP.Missions;
    GTP.game.advance(0.5);
    return { state: GTP.game.state, x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2), money: p.money, weapons: Object.assign({}, p.weapons, { fist: 'inf' }), weapon: p.weapon, completed: Array.from(M.state.completed), flags: M.state.flags, markers: M.markers().map((m) => m.id), clock: +GTP.game.time.clock.toFixed(2), errors: GTP.errors.length };
  });
  console.log('  loaded: ' + JSON.stringify(loaded));
  t.assert(loaded.state === 'playing', 'CONTINUE resumes play');
  t.assert(Math.hypot(loaded.x - saved.x, loaded.z - saved.z) < 1.5 && Math.abs(loaded.yaw - 1.2) < 0.05, 'position restored: ' + loaded.x + ',' + loaded.z);
  t.assert(loaded.money === 4321, 'money restored: ' + loaded.money);
  t.assert(loaded.weapons.pistol === 17 && loaded.weapons.smg === 33 && loaded.weapon === saved.weapon, 'weapons and ammo restored: ' + JSON.stringify(loaded.weapons));
  t.assert(loaded.completed.length === 4 && loaded.completed.indexOf('m02_read') >= 0 && loaded.flags.sponsored === true && loaded.markers.join(',') === 'm03_ratio', 'completed missions, flags and the next light restored: ' + JSON.stringify({ completed: loaded.completed, markers: loaded.markers }));
  t.assert(Math.abs(loaded.clock - saved.clock) < 0.05, 'clock restored: ' + loaded.clock);
  await page.evaluate(() => { GTP.Render.rig.pitch = 0.2; GTP.Render.rig.snap(); GTP.game.advance(0.05); });
  await t.shot(page, 'feel_continue');

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
  await page.close();
});
