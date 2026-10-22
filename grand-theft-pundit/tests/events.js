/* events.js: the v0.3 street life of 07_ai (PLAN_V03 "world").
 *  1 the eight random street events: each starts near the player (event:start, entities on the street), resolves the
 *    way its blurb says (event:end ok with its reward), and leaves nothing persistent behind
 *  2 the scheduler starts one by itself when no mission runs, and never while a mission is active or the player is wanted
 *  3 door markers: walking into Both Sides Arms calls GTP.Interiors.enter('armory', {store, landmark, door}) once until the
 *    player steps away; a clothing door, an unowned safehouse (property:open), a mod shop by car (modshop:open); the
 *    marker meshes stand at the doors
 *  4 GTP.Interiors.active pauses the city: no ambient spawns, no events, no door triggers
 *  5 World.route draws a GPS line on the roads
 * Screenshot: tests/out/events_flash_mob.png (look at it). */
'use strict';
const H = require('./_harness');

H.run('events', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;

  // ---- 1. the eight events ----
  const ev = await page.evaluate(() => {
    const AI = GTP.AI, W = GTP.World, E = GTP.Entities, g = GTP.game, p = g.player, U = GTP.util;
    const log = [];
    GTP.Events.on('event:start', (e) => log.push(['start', e.id, e.name]));
    GTP.Events.on('event:end', (e) => log.push(['end', e.id, e.ok, e.reward, e.reason]));
    const home = W.landmark('campus_quad').door;
    function reset() { if (p.inVehicle) p.exitVehicle(); p.x = home.x; p.z = home.z; p.y = W.heightAt(p.x, p.z, 0); p.vx = p.vz = 0; p.snap(); GTP.AI.wanted.clear(); p.hp = p.maxHp; }
    function to(x, z) { p.x = x; p.z = z; p.y = W.heightAt(x, z, 0); p.vx = p.vz = 0; p.snap(); }
    function persistentLeft(id) { return E.list.filter((e) => !e.removed && e.eventId === id && e.persistent).length; }
    const out = { defs: AI.events.list().map((d) => d.id + ':' + d.name), runs: {} };
    const ids = ['ev_rival_table', 'ev_tote_snatch', 'ev_getaway', 'ev_fender_bender', 'ev_influencer', 'ev_flash_mob', 'ev_hitchhiker', 'ev_donor_van'];
    for (const id of ids) {
      reset(); g.advance(0.5);
      let c = null;
      for (let k = 0; k < 6 && !c; k++) { c = AI.events.start(id); if (!c) { g.advance(0.3); } }
      const r = out.runs[id] = { started: !!c, ents: c ? c.ents.length : 0, dist: c ? Math.round(U.dist2d(p.x, p.z, c.x, c.z)) : -1 };
      if (!c) continue;
      g.advance(1);
      const money0 = p.money;
      if (id === 'ev_rival_table') { to(c.host.x + 1.5, c.host.z); g.advance(5); }
      else if (id === 'ev_tote_snatch') { g.advance(1); r.thiefRan = Math.round(U.dist2d(c.thief.x, c.thief.z, c.victim.x, c.victim.z)); c.thief.knockDown(1, 0, 1, p, 'test'); g.advance(1); }
      else if (id === 'ev_getaway') { g.advance(2); r.copsChase = c.cops.length && c.cops.every((v) => v.ai && v.ai.mode === 'evchase'); r.getawayMoved = Math.round(c.car.speed2d()); c.car.driver.applyDamage(999, null, 'test'); g.advance(0.5); }
      else if (id === 'ev_fender_bender') { to(c.x + 0.8, c.z + 0.8); g.advance(4); }
      else if (id === 'ev_influencer') { const f = U.yawToDir(c.host.yaw); to(c.host.x + f.x * 4, c.host.z + f.z * 4); g.advance(4); }
      else if (id === 'ev_flash_mob') { to(c.x + 6, c.z); g.advance(42); }
      else if (id === 'ev_hitchhiker') {
        const rider = c.rider, v = new GTP.Vehicle({ x: rider.x + 3, z: rider.z, type: 'sedan' });
        v.y = W.heightAt(v.x, v.z, 0); v.snap(); E.add(v); p.enterVehicle(v, 0); g.advance(1.5);
        r.boarded = rider.inVehicle === v; r.dest = c.dest && c.dest.label;
        if (c.dest) { v.x = c.dest.x + 2; v.z = c.dest.z; v.y = W.heightAt(v.x, v.z, 0); v.vx = v.vz = 0; v.speed = 0; v.snap(); g.advance(1.5); }
        r.riderOut = !rider.inVehicle;
      }
      else if (id === 'ev_donor_van') { c.van.applyDamage(c.van.hp * 0.8, p, 'test'); g.advance(0.5); r.cash = E.list.filter((e) => e.kind === 'pickup' && !e.removed && e.pickupType === 'cash').length; r.wanted = AI.wanted.level; }
      g.advance(0.5);
      const end = log.filter((l) => l[0] === 'end' && l[1] === id).pop();
      r.end = end || null; r.paid = p.money - money0; r.cur = AI.events.current() ? AI.events.current().id : null; r.left = persistentLeft(id);
      if (AI.events.current()) AI.events.stop(false, 'test');
      if (p.inVehicle) p.exitVehicle();
    }
    out.starts = log.filter((l) => l[0] === 'start').length;
    out.errors = GTP.errors.map((e) => e.where + ': ' + e.message);
    reset();
    return out;
  });
  console.log('  events: ' + JSON.stringify(ev));
  t.assert(ev.defs.length === 8, 'eight street events: ' + ev.defs.join(', '));
  Object.keys(ev.runs).forEach((id) => {
    const r = ev.runs[id];
    t.assert(r.started && r.ents > 0, id + ' starts with people on the street: ' + JSON.stringify(r));
    t.assert(r.end && r.end[2] === true, id + ' resolves: ' + JSON.stringify(r));
    t.assert(r.left === 0, id + ' leaves nothing persistent: ' + JSON.stringify(r));
  });
  t.assert(ev.runs.ev_tote_snatch.thiefRan > 2, 'the snatcher runs: ' + ev.runs.ev_tote_snatch.thiefRan);
  t.assert(ev.runs.ev_getaway.copsChase, 'cruisers chase the getaway car');
  t.assert(ev.runs.ev_hitchhiker.boarded && ev.runs.ev_hitchhiker.riderOut && ev.runs.ev_hitchhiker.paid > 0, 'the commentator rides along and pays: ' + JSON.stringify(ev.runs.ev_hitchhiker));
  t.assert(ev.runs.ev_donor_van.cash >= 3 && ev.runs.ev_donor_van.wanted >= 2, 'the donor van spills cash and calls the cops: ' + JSON.stringify(ev.runs.ev_donor_van));
  t.assert(ev.runs.ev_rival_table.paid > 0 && ev.runs.ev_influencer.paid > 0, 'rewards paid');
  t.assert(ev.errors.length === 0, 'no game errors: ' + ev.errors.join('; '));

  // ---- 2. the scheduler ----
  const sch = await page.evaluate(() => {
    const AI = GTP.AI, Ms = GTP.Missions, g = GTP.game, out = {};
    const saved = Ms.state.active;
    Ms.state.active = 'test_mission'; AI.events.setNext(0.2); g.advance(2);
    out.duringMission = AI.events.current() ? AI.events.current().id : null; out.whyMission = AI.events.eligible();
    Ms.state.active = null; AI.wanted.set(1); g.advance(2);
    out.whileWanted = AI.events.current() ? AI.events.current().id : null; out.whyWanted = AI.events.eligible();
    AI.wanted.clear(); AI.events.setNext(0.2);
    let started = null; for (let i = 0; i < 20 && !started; i++) { g.advance(0.5); started = AI.events.current() ? AI.events.current().id : null; }
    out.auto = started;
    if (AI.events.current()) AI.events.stop(false, 'test');
    Ms.state.active = saved;
    return out;
  });
  console.log('  scheduler: ' + JSON.stringify(sch));
  t.assert(!sch.duringMission && sch.whyMission === 'mission', 'no event during a mission: ' + JSON.stringify(sch));
  t.assert(!sch.whileWanted && sch.whyWanted === 'wanted', 'no event while wanted');
  t.assert(!!sch.auto, 'an event starts on its own when the street is free');

  // ---- 3. door markers ----
  const dr = await page.evaluate(() => {
    const AI = GTP.AI, W = GTP.World, g = GTP.game, p = g.player, E = GTP.Entities, out = {};
    const I0 = GTP.Interiors, S0 = GTP.Systems, calls = [], evs = [];
    GTP.Interiors = { active: false, enter: function (id, o) { calls.push({ id: id, store: o.store, landmark: o.landmark, door: !!o.door, yaw: o.door && o.door.yaw }); } };
    GTP.Systems = Object.assign(Object.create(S0 || {}), { owns: (id) => id === 'safe_suburb' });
    ['property:open', 'modshop:open', 'door:enter'].forEach((n) => GTP.Events.on(n, (e) => evs.push([n, e.id || e.shop || e.kind, !!e.vehicle])));
    function to(x, z) { if (p.inVehicle) p.exitVehicle(); p.x = x; p.z = z; p.y = W.heightAt(x, z, 0); p.vx = p.vz = 0; p.snap(); }
    AI.wanted.clear(); AI.doors.release();
    out.kinds = {}; W.doors.forEach((d) => { out.kinds[d.kind] = (out.kinds[d.kind] || 0) + 1; });
    const arm = W.doors.find((d) => d.id === 'both_sides_strip');
    to(arm.x + 8, arm.z); g.advance(0.5); to(arm.x, arm.z); g.advance(0.5); g.advance(1);
    out.armory = calls.slice();
    to(arm.x + 6, arm.z); g.advance(0.5); to(arm.x, arm.z); g.advance(0.5);
    out.armoryAgain = calls.length;
    out.markers = (GTP.Render.markerGroup ? GTP.Render.markerGroup.children : []).filter((m) => /^door:/.test(m.name)).map((m) => m.name);
    const clo = W.doors.find((d) => d.kind === 'clothing'); to(clo.x + 8, clo.z); g.advance(0.3); to(clo.x, clo.z); g.advance(0.5);
    out.clothing = calls[calls.length - 1];
    const safe = W.doors.find((d) => d.id === 'safe_brownstone'); to(safe.x + 8, safe.z); g.advance(0.3); to(safe.x, safe.z); g.advance(0.5);
    out.unowned = evs.filter((e) => e[0] === 'property:open').map((e) => e[1]);
    const own = W.doors.find((d) => d.id === 'safe_suburb'); to(own.x + 8, own.z); g.advance(0.3); to(own.x, own.z); g.advance(0.5);
    out.owned = calls[calls.length - 1];
    // a mission runs: the clothing door stays shut, the armory still lets the player in (m01c walks them there)
    const Ms = GTP.Missions, savedActive = Ms.state.active; Ms.state.active = 'test_mission';
    const nCalls = calls.length; to(clo.x + 8, clo.z); g.advance(0.3); to(clo.x, clo.z); g.advance(0.5);
    out.clothingInMission = calls.length - nCalls;
    to(arm.x + 8, arm.z); g.advance(0.3); to(arm.x, arm.z); g.advance(0.5);
    out.armoryInMission = calls.length - nCalls;
    Ms.state.active = savedActive;
    out.doorYaw = calls.length ? calls[calls.length - 1] : null;
    const ms = W.doors.find((d) => d.kind === 'modshop'); to(ms.x + 9, ms.z);
    const v = new GTP.Vehicle({ x: ms.x + 9, z: ms.z, type: 'sedan' }); v.y = W.heightAt(v.x, v.z, 0); v.snap(); E.add(v); p.enterVehicle(v, 0); g.advance(1);
    v.x = ms.x; v.z = ms.z; v.vx = v.vz = 0; v.speed = 0; v.snap(); g.advance(0.5);
    out.modshop = evs.filter((e) => e[0] === 'modshop:open');
    if (p.inVehicle) p.exitVehicle(); v.destroy();
    GTP.Interiors = I0; GTP.Systems = S0;
    out.errors = GTP.errors.map((e) => e.where + ': ' + e.message);
    return out;
  });
  console.log('  doors: ' + JSON.stringify(dr));
  t.assert(dr.kinds.armory === 3 && dr.kinds.modshop === 2 && dr.kinds.clothing === 2 && dr.kinds.barber === 1 && dr.kinds.safehouse === 4 && dr.kinds.garage === 4, 'door markers per kind: ' + JSON.stringify(dr.kinds));
  t.assert(dr.armory.length === 1 && dr.armory[0].id === 'armory' && dr.armory[0].landmark === 'both_sides_strip' && dr.armory[0].door, 'the armory door calls Interiors.enter once: ' + JSON.stringify(dr.armory));
  t.assert(dr.armoryAgain === 2, 'stepping away and back enters again: ' + dr.armoryAgain);
  t.assert(dr.markers.length >= 1, 'marker meshes at the doors: ' + dr.markers.join(','));
  t.assert(dr.clothing && dr.clothing.id === 'clothing', 'the clothing door: ' + JSON.stringify(dr.clothing));
  t.assert(dr.unowned.indexOf('safe_brownstone') >= 0, 'an unowned safehouse opens the property card: ' + JSON.stringify(dr.unowned));
  t.assert(dr.owned && dr.owned.id === 'safehouse' && dr.owned.landmark === 'safe_suburb', 'an owned safehouse goes in: ' + JSON.stringify(dr.owned));
  t.assert(dr.modshop.length === 1 && dr.modshop[0][2], 'driving into the mod shop: ' + JSON.stringify(dr.modshop));
  t.assert(dr.clothingInMission === 0 && dr.armoryInMission === 1, 'during a mission only the armory door opens: ' + JSON.stringify([dr.clothingInMission, dr.armoryInMission]));
  t.assert(dr.errors.length === 0, 'no game errors: ' + dr.errors.join('; '));

  // ---- 4. interiors pause the city ----
  const pause = await page.evaluate(() => {
    const AI = GTP.AI, g = GTP.game, E = GTP.Entities, out = {};
    const I0 = GTP.Interiors;
    GTP.Interiors = { active: true, enter: function () {} };   // inside first, then clear the street
    E.list.forEach((e) => { if (e.kind === 'ped' && e.ai && e.ai.ambient && !e.inVehicle) e.destroy(); });
    g.advance(0.1);
    AI.events.setNext(0.2);
    const t0 = AI.spawner.t; g.advance(3);
    out.spawnT = [t0, AI.spawner.t]; out.peds = AI.spawner.counts().peds; out.event = AI.events.current() ? AI.events.current().id : null; out.why = AI.events.eligible();
    GTP.Interiors = I0; g.advance(3);
    out.pedsAfter = AI.spawner.counts().peds;
    if (AI.events.current()) AI.events.stop(false, 'test');
    return out;
  });
  console.log('  interior pause: ' + JSON.stringify(pause));
  t.assert(pause.peds === 0 && !pause.event && pause.why === 'interior', 'nothing spawns inside an interior: ' + JSON.stringify(pause));
  t.assert(pause.pedsAfter > 0, 'the city fills again outside: ' + pause.pedsAfter);

  // ---- 5. the GPS route ----
  const rt = await page.evaluate(() => {
    const W = GTP.World, T = W.T, TILE = GTP.C.TILE, a = W.landmark('campus_quad').door, b = W.landmark('museum_of_takes').door, c = W.landmark('airport_terminal').door;
    function check(r, from, to) {
      let off = 0;
      for (let i = 1; i < r.length - 1; i++) { const p = r[i], tx = Math.floor(p.x / TILE), tz = Math.floor(p.z / TILE), tt = W.tile(tx, tz); if (!(tt === T.ROAD || tt === T.BRIDGE || tt === T.RAMP || W.deckAt(tx, tz) || tt === T.PARKING || tt === T.SIDEWALK || tt === T.PLAZA)) off++; }
      return { n: r.length, off, len: Math.round(W.routeLength(r)), straight: Math.round(Math.hypot(to.x - from.x, to.z - from.z)), start: Math.hypot(r[0].x - from.x, r[0].z - from.z), end: Math.hypot(r[r.length - 1].x - to.x, r[r.length - 1].z - to.z) };
    }
    const t0 = performance.now(); const r1 = W.route(a.x, a.z, b.x, b.z); const ms = performance.now() - t0;
    const t1 = performance.now(); W.route(a.x, a.z, b.x, b.z); const cached = performance.now() - t1;
    return { museum: check(r1, a, b), airport: check(W.route(a.x, a.z, c.x, c.z), a, c), ms: Math.round(ms), cached: +cached.toFixed(2) };
  });
  console.log('  route: ' + JSON.stringify(rt));
  [rt.museum, rt.airport].forEach((r) => t.assert(r.n >= 3 && r.off === 0 && r.start < 0.01 && r.end < 0.01 && r.len < r.straight * 2.2 && r.len >= r.straight, 'GPS route on the roads: ' + JSON.stringify(r)));
  t.assert(rt.cached <= rt.ms, 'route cache');

  // a screenshot of a civilian cowering at an aimed pistol (the camera swung to the side once the aim is let go)
  await page.evaluate(() => {
    const g = GTP.game, p = g.player, U = GTP.util, W = GTP.World, d = W.landmark('nap_depot').door;
    g.debug.teleport(d.x, d.z); g.advance(0.5); p.weapons.pistol = 60; p.weapon = 'pistol';
    const civ = g.debug.spawnPed(p.x + 5, p.z, null, 'civ'); civ.persistent = true; g.advance(0.1);
    for (let i = 0; i < 18; i++) { GTP.Input.set('aim', true); GTP.Render.rig.yaw = U.dirToYaw(civ.x - p.x, civ.z - p.z); g.advance(1 / 12); }
    GTP.Input.set('aim', false); g.advance(1 / 12);
    const R = GTP.Render.rig; R.yaw = U.dirToYaw(civ.x - p.x, civ.z - p.z) + 0.6; R.pitch = 0.1; R.snap(); g.advance(1 / 30);
    window._cower = { mode: civ.ai.mode, cowering: !!civ.cowering };
  });
  await t.shot(page, 'events_cower');
  const cw = await page.evaluate(() => window._cower);
  t.assert(cw.mode === 'cower' && cw.cowering, 'the pictured civilian cowers: ' + JSON.stringify(cw));

  // a screenshot of a street event
  await page.evaluate(() => { const AI = GTP.AI, p = GTP.game.player; const c = AI.events.start('ev_flash_mob'); if (c) { const W = GTP.World; p.x = c.x + 9; p.z = c.z + 2; p.y = W.heightAt(p.x, p.z, 0); p.yaw = GTP.util.dirToYaw(c.x - p.x, c.z - p.z); p.snap(); if (GTP.Render.rig) { GTP.Render.rig.yaw = p.yaw; GTP.Render.rig.snap(); } GTP.game.advance(1.5); } });
  const shot = await t.shot(page, 'events_flash_mob');
  console.log('  screenshot: ' + shot);
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
