/* interiors.js: the v0.3 interiors track (js/13_interiors.js).
 *  1 the API and the wrappers (World collision, Combat.fire, Combat.update, Render.updateEnvironment)
 *  2 the Strip armory: enter with the fade, events, the room's floor, walls and counter, the stocked racks with real
 *    weapon meshes, Merle behind the counter, screenshots (player view, the counter, both rack walls, the range)
 *  3 browse: looking at a rack item and pressing action emits armory:inspect; the in-world prompt buys on a second press
 *    (no UI armory card yet); ammo is only offered for an owned weapon; no shooting in the store
 *  4 the range: start on the line, a hit scores and emits range:hit, the round ends at 60 s with range:end and a medal;
 *    the inventory is put back exactly
 *  5 the counter opens the shop page; exit through the door back to the street; walking into the Strip door enters
 *  6 the port and uptown branches, the clothing store, the barber, a safehouse (bed save stores the door outside)
 * Screenshots: tests/out/int_*.png
 */
'use strict';
const H = require('./_harness');

H.run('interiors', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  const shots = [];
  async function shot(name) { shots.push(name); return t.shot(page, name); }
  async function view(name, v) {
    await page.evaluate((v) => { const r = GTP.Interiors.room(); GTP.game.debug.freeCam(r.ox + v[0], v[1], r.oz + v[2], r.ox + v[3], v[4], r.oz + v[5]); }, v);
    await shot(name);
    await page.evaluate(() => GTP.game.debug.followCam());
  }

  // ---- 1. API and wrappers ----
  const api = await page.evaluate(() => {
    const I = GTP.Interiors, W = GTP.World, CB = GTP.Combat;
    window.__ev = [];
    ['interior:fade', 'interior:enter', 'interior:exit', 'armory:inspect', 'armory:buy', 'range:start', 'range:hit', 'range:end', 'clothing:open', 'barber:open', 'shop:open', 'shop:buy', 'safehouse:sleep', 'saved']
      .forEach((n) => GTP.Events.on(n, (e) => window.__ev.push({ n, e: e ? JSON.parse(JSON.stringify(e, (k, v) => (k === 'landmark' || k === 'item' || k === 'player' || k === 'room') ? (v && v.id) || null : v)) : null })));
    return { fns: ['enter', 'exit', 'update', 'medalFor'].filter((k) => typeof I[k] !== 'function'), active: I.active, current: I.current,
      wrapped: !!(W.heightAt._interiors && W.solidAt._interiors && W.resolveCapsule._interiors && CB.fire._interiors),
      cityHeight: W.heightAt(300, 300, 0), citySolidOk: typeof W.solidAt(300, 300, 0) === 'boolean', medals: [I.medalFor(10), I.medalFor(60), I.medalFor(150), I.medalFor(300)] };
  });
  console.log('  api: ' + JSON.stringify(api));
  t.assert(api.fns.length === 0 && api.active === false && api.current === null, 'GTP.Interiors API: ' + JSON.stringify(api));
  t.assert(api.wrapped, 'World collision and Combat.fire wrapped');
  t.assert(JSON.stringify(api.medals) === JSON.stringify([null, 'bronze', 'silver', 'gold']), 'medal thresholds: ' + api.medals);

  // ---- 2. the Strip armory ----
  const enter = await page.evaluate(() => {
    const I = GTP.Interiors, p = GTP.game.player, W = GTP.World;
    p.money = 5000;
    const outside = { x: p.x, z: p.z };
    const ok = I.enter('both_sides_strip');
    const mid = { active: I.active, control: p.controlEnabled };
    GTP.game.advance(0.8);
    const r = I.room(), ev = window.__ev.map((e) => e.n);
    const items = I.debug.items(), ids = new Set(items.map((i) => i.weaponId).filter(Boolean));
    const meshes = r.items.filter((it) => { let held = 0; it.mesh.traverse((o) => { if (o.isMesh && o.name === 'held') held++; }); return held > 0; }).length;
    const wall = W.solidAt(r.ox - 9.3, r.oz, 1), floor = W.heightAt(r.ox, r.oz + 2, 0), inside = W.solidAt(r.ox, r.oz + 4, 0.5);
    const counter = W.solidAt(r.ox - 1, r.oz - 2.6, 0.5);
    // walk north into the counter: it stops the player
    GTP.Input.set('forward', true); GTP.game.advance(3); GTP.Input.set('forward', false); GTP.game.advance(0.2);
    const stopped = { z: p.z - r.oz, x: p.x - r.ox };
    const merle = GTP.Entities.list.filter((e) => e.castId === 'merle' && e.interior === 'armory');
    const enterEv = window.__ev.find((e) => e.n === 'interior:enter');
    return { ok, mid, active: I.active, cur: I.current && { id: I.current.id, kind: I.current.kind, store: I.current.store, branch: I.current.branch }, ev, enterEv: enterEv && enterEv.e, items: items.length, distinct: ids.size, ids: Array.from(ids), order: GTP.Combat.ORDER.filter((id) => id !== 'fist' && !ids.has(id)),
      meshes, wall, floor, inside, counter, stopped, merle: merle.length, merleName: merle[0] && merle[0].name, pos: { x: p.x - r.ox, z: p.z - r.oz, y: p.y }, outside, ctlAfter: p.controlEnabled, district: (W.districtAt(p.x, p.z) || {}).id };
  });
  console.log('  enter: ' + JSON.stringify(enter));
  t.assert(enter.ok && enter.mid.active === false && enter.mid.control === false, 'enter starts a fade with the player held');
  t.assert(enter.active && enter.cur.id === 'armory' && enter.cur.store === 'both_sides_strip' && enter.cur.branch === 'strip', 'inside the Strip armory');
  t.assert(enter.ev.indexOf('interior:fade') >= 0 && enter.ev.indexOf('interior:enter') > enter.ev.indexOf('interior:fade') && enter.enterEv.id === 'armory' && enter.enterEv.store === 'both_sides_strip', 'interior:fade then interior:enter {id, kind, store}');
  t.assert(enter.ctlAfter === true, 'control comes back after the fade');
  t.assert(enter.items >= 40 && enter.distinct >= 11 && enter.order.length === 0 && enter.meshes === enter.items - 1, 'racks stocked with every weapon as a real mesh: ' + enter.items + ' items, ' + enter.distinct + ' weapons, missing ' + enter.order);
  t.assert(enter.wall === true && enter.floor === 0 && enter.inside === false && enter.counter === true, 'room collision: walls solid, floor at 0, open floor walkable, counter solid');
  t.assert(enter.stopped.z > -2.3 && enter.stopped.z < 0 && Math.abs(enter.pos.y) < 0.05, 'walking north stops at the counter: ' + JSON.stringify(enter.stopped));
  t.assert(enter.merle === 1 && enter.merleName === 'Merle Firmness', 'Merle Firmness behind the counter');
  t.assert(enter.district === 'strip', 'the HUD district chip says the Strip, not open water: ' + enter.district);

  await page.evaluate(() => { const r = GTP.Interiors.room(), p = GTP.game.player; GTP.game.debug.teleport(r.ox, r.oz + 4.3); p.yaw = 0; GTP.Render.rig.yaw = 0; GTP.Render.rig.snap(); GTP.game.advance(1.2); });
  await shot('int_armory_player');
  await view('int_armory_counter', [0, 3.0, 6.4, -1, 1.6, -5]);
  await view('int_armory_west_rack', [-5.5, 2.0, 3.8, -9, 1.9, 0.8]);
  await view('int_armory_east_rack', [5.5, 2.0, 3.8, 9, 1.9, 0.8]);
  await view('int_armory_back_wall', [-2, 1.8, -1.2, -3, 2.0, -7]);
  await view('int_armory_front', [0, 2.6, -1.8, 0, 1.4, 7]);

  // ---- 3. browse, the in-world prompt, no shooting in the store ----
  const browse = await page.evaluate(() => {
    const I = GTP.Interiors, p = GTP.game.player, In = GTP.Input, r = I.room();
    // the player in front of the west pegboard, facing it
    const items = I.debug.items(), target = items.find((i) => i.face === 'e' && i.weaponId === 'pistol');
    const Ms = GTP.Missions.state; Object.values(GTP.Combat.UNLOCK || {}).forEach((m) => m && Ms.completed.add(m));
    p.money = 20000;
    GTP.game.debug.teleport(target.x + 1.3, target.z); p.yaw = -Math.PI / 2; p.moveYaw = p.yaw;
    // look where the player looks: the camera behind the shoulder, its centre on the pistol
    GTP.game.debug.freeCam(target.x + 3.2, target.y + 0.5, target.z + 0.3, target.x, target.y, target.z);
    GTP.game.advance(0.3);
    const looking = I.debug.browse(), prompt1 = I.debug.prompt();
    window.__ev = [];
    In.press('action'); GTP.game.advance(0.05);
    const inspect = window.__ev.find((e) => e.n === 'armory:inspect');
    const prompt2 = I.debug.prompt();
    const money0 = p.money, owned0 = p.weapons[looking && looking.weaponId] || 0;
    In.press('action'); GTP.game.advance(0.05);
    const prompt3 = I.debug.prompt(), buy = window.__ev.find((e) => e.n === 'shop:buy');
    const owned1 = p.weapons[looking && looking.weaponId] || 0;
    GTP.game.advance(2.5);
    // owned now: the next confirm offers ammo, never the weapon again
    window.__ev = [];
    In.press('action'); GTP.game.advance(0.05);
    const prompt4 = I.debug.prompt();
    In.press('action'); GTP.game.advance(0.05);
    const ammoBuy = window.__ev.find((e) => e.n === 'shop:buy');
    // no shooting in the store
    p.weapon = looking.weaponId; const shotOk = GTP.Combat.fire(p, p.weapon);
    return { looking, prompt1, inspect: inspect && inspect.e, prompt2, prompt3, buy: buy && buy.e, owned0, owned1, spent: money0 - p.money, prompt4, ammoBuy: ammoBuy && ammoBuy.e, shotOk };
  });
  console.log('  browse: ' + JSON.stringify(browse));
  t.assert(browse.looking && browse.looking.weaponId === 'pistol' && /PISTOL/i.test(browse.prompt1), 'looking at the pistol on the rack labels it: ' + browse.prompt1);
  t.assert(browse.inspect && browse.inspect.weaponId === 'pistol' && browse.inspect.store === 'both_sides_strip', 'action emits armory:inspect {weaponId}');
  t.assert(/Buy for \$\d+/.test(browse.prompt2) && /CONFIRM/.test(browse.prompt2), 'without an armory UI the prompt asks to confirm the purchase: ' + browse.prompt2);
  t.assert(browse.buy && browse.owned0 === 0 && browse.owned1 > 0 && browse.spent > 0 && /SOLD/.test(browse.prompt3), 'the second press buys it: ' + browse.prompt3);
  t.assert(/Ammo/.test(browse.prompt4) && browse.ammoBuy && /^ammo_/.test(browse.ammoBuy.item), 'an owned weapon offers ammo: ' + browse.prompt4);
  t.assert(browse.shotOk === false, 'no shooting in the store');
  await shot('int_armory_browse');
  await page.evaluate(() => GTP.game.debug.followCam());

  // ---- 4. the range ----
  const range = await page.evaluate(() => {
    const I = GTP.Interiors, p = GTP.game.player, r = I.room();
    const before = { weapons: Object.assign({}, p.weapons), weapon: p.weapon, ammo: JSON.stringify(p.ammo || {}) };
    // walk through the back door to the line
    GTP.game.debug.teleport(r.ox + 6.5, r.oz - 10.1); p.yaw = 0; GTP.Render.rig.yaw = 0; GTP.Render.rig.snap();
    window.__ev = [];
    GTP.game.advance(1.0);
    const started = window.__ev.find((e) => e.n === 'range:start');
    GTP.game.advance(3.2);                 // the countdown
    const n = I.debug.raiseAll();
    // hip fire at the middle lane's nearest target with the assist
    const tg = I.debug.targets().filter((q) => q.state === 'up' && !q.mover).sort((a, b) => b.z - a.z)[0];
    p.yaw = GTP.util.dirToYaw(tg.x - p.x, tg.z - p.z); p.aimYaw = p.yaw;
    const fired = GTP.Combat.fire(p, p.weapon);
    GTP.game.advance(0.05);
    const hits = window.__ev.filter((e) => e.n === 'range:hit').map((e) => e.e);
    const during = { score: I.range.score, weapon: p.weapon, canShoot: fired };
    return { started: started && started.e, raised: n, during, hits, before };
  });
  console.log('  range: ' + JSON.stringify(range));
  t.assert(range.started && range.started.seconds === 60, 'standing on the line starts a 60 s round');
  t.assert(range.during.canShoot === true && range.hits.length >= 1 && range.hits[0].points > 0 && range.during.score > 0, 'a shot at a standing target scores: ' + JSON.stringify(range.hits));
  await page.evaluate(() => { const p = GTP.game.player; p.yaw = 0; p.aimYaw = 0; GTP.Render.rig.yaw = 0; GTP.Render.rig.pitch = 0.05; GTP.Render.rig.snap(); GTP.game.advance(0.1); });
  await shot('int_range_player');
  await view('int_range_targets', [7.6, 2.3, -8.6, 6, 0.9, -30]);
  const rend = await page.evaluate((before) => {
    const I = GTP.Interiors, p = GTP.game.player;
    window.__ev = [];
    GTP.game.advance(60);
    const end = window.__ev.find((e) => e.n === 'range:end');
    return { end: end && end.e, running: I.range.running, same: JSON.stringify(Object.assign({}, p.weapons)) === JSON.stringify(before.weapons) && p.weapon === before.weapon && JSON.stringify(p.ammo || {}) === before.ammo, best: I.serialize().rangeBest };
  }, range.before);
  console.log('  range end: ' + JSON.stringify(rend));
  t.assert(rend.end && typeof rend.end.score === 'number' && rend.end.score > 0 && 'medal' in rend.end && !rend.running, 'the round ends with range:end {score, medal}');
  t.assert(rend.same, 'range rounds are on the house: the inventory is back exactly as it was');
  t.assert(rend.best === rend.end.score, 'the best score is kept for the save');
  await shot('int_range_line');

  // ---- 5. the counter, the exit, the door ----
  const counter = await page.evaluate(() => {
    const I = GTP.Interiors, p = GTP.game.player, r = I.room();
    GTP.game.debug.teleport(r.ox - 1.5, r.oz - 1.6); p.yaw = 0; GTP.game.advance(0.2);
    window.__ev = [];
    GTP.Input.press('action'); GTP.game.advance(0.1);
    const opened = window.__ev.find((e) => e.n === 'shop:open'), page = !!(GTP.UI.state && GTP.UI.state.shopOpen);
    GTP.Combat.shop.close(); if (GTP.UI.closeShop) GTP.UI.closeShop(); GTP.game.advance(0.2);
    return { opened: !!opened, store: opened && opened.e && opened.e.store, page };
  });
  console.log('  counter: ' + JSON.stringify(counter));
  t.assert(counter.opened, 'Merle\'s counter opens the Both Sides Arms shop page');
  const exit = await page.evaluate(() => {
    const I = GTP.Interiors, p = GTP.game.player, r = I.room(), W = GTP.World, lm = W.landmark('both_sides_strip');
    GTP.game.debug.teleport(r.ox, r.oz + 5.9); p.yaw = Math.PI; GTP.Render.rig.yaw = Math.PI; GTP.Render.rig.snap();
    window.__ev = [];
    const pre = { page: !!GTP.UI.state.shopOpen, shop: GTP.Combat.shop.state.open, control: p.controlEnabled, state: GTP.game.state };
    GTP.Input.set('forward', true); GTP.game.advance(0.4); GTP.Input.set('forward', false);
    GTP.game.advance(1.0);
    const ev = window.__ev.map((e) => e.n);
    return { pre, active: I.active, ev, dist: Math.hypot(p.x - lm.door.x, p.z - lm.door.z), y: p.y, solid: W.solidAt(p.x, p.z, p.y + 0.5), groupInScene: !!r.group.parent, npcs: GTP.Entities.list.filter((e) => e.interior).length };
  });
  console.log('  exit: ' + JSON.stringify(exit));
  t.assert(!exit.active && exit.ev.indexOf('interior:exit') >= 0, 'walking into the door from inside leaves: ' + exit.ev);
  t.assert(exit.dist < 7 && !exit.solid && !exit.groupInScene && exit.npcs === 0, 'back on the street at the door, the room and Merle gone: ' + JSON.stringify(exit));
  await shot('int_strip_outside');
  const door = await page.evaluate(() => {
    const I = GTP.Interiors, p = GTP.game.player, W = GTP.World, lm = W.landmark('both_sides_strip');
    const d = I.debug.doors().find((q) => q.id === 'both_sides_strip');
    // step away to re-arm, come back and walk into the facade
    GTP.game.debug.teleport(d.x - d.nx * 5, d.z - d.nz * 5); GTP.game.advance(0.3);
    GTP.game.debug.teleport(d.x - d.nx * 0.4, d.z - d.nz * 0.4);
    p.yaw = GTP.util.dirToYaw(d.nx, d.nz); GTP.Render.rig.yaw = p.yaw; GTP.Render.rig.snap();
    GTP.Input.set('forward', true); GTP.game.advance(1.2); GTP.Input.set('forward', false); GTP.game.advance(0.4);
    const r = { doors: I.debug.doors().map((q) => q.kind + ':' + q.id), active: I.active, id: I.current && I.current.store };
    I.exit({ instant: true });
    return r;
  });
  console.log('  door: ' + JSON.stringify(door));
  t.assert(door.active && door.id === 'both_sides_strip', 'walking into the Both Sides Arms door enters the armory');

  // ---- 6. the branches and the other rooms ----
  for (const b of ['both_sides_port', 'both_sides_uptown']) {
    const ok = await page.evaluate((b) => { const ok = GTP.Interiors.enter(b, { instant: true }); GTP.game.advance(0.6); return { ok, branch: GTP.Interiors.current && GTP.Interiors.current.branch }; }, b);
    t.assert(ok.ok && ok.branch === b.replace('both_sides_', ''), b + ' uses the armory with its branch decor');
    await view('int_armory_' + ok.branch, [0, 3.0, 6.4, -1, 1.6, -5]);
    await page.evaluate(() => GTP.Interiors.exit({ instant: true }));
  }
  const rooms = await page.evaluate(() => {
    const I = GTP.Interiors, p = GTP.game.player, out = {};
    function at(kind) { return I.debug.interactables().find((q) => q.kind === kind); }
    function use(kind) { const q = at(kind); GTP.game.debug.teleport(q.x, q.z); GTP.game.advance(0.15); window.__ev = []; GTP.Input.press('action'); GTP.game.advance(0.1); return window.__ev.map((e) => e.n); }
    out.clothing = I.enter('clothing', { instant: true }); GTP.game.advance(0.5);
    const shirt0 = p.look && p.look.shirt;
    out.clothingEv = use('booth'); out.shirtChanged = p.look.shirt !== shirt0; out.clothingMesh = !!p.mesh;
    I.exit({ instant: true });
    out.barber = I.enter('barber', { instant: true }); GTP.game.advance(0.5);
    const hair0 = p.look.hair; out.barberEv = use('chair'); out.hairChanged = p.look.hair !== hair0;
    I.exit({ instant: true });
    const before = { x: p.x, z: p.z };
    out.safe = I.enter('safe_penthouse', { instant: true }); GTP.game.advance(0.5);
    out.safeBranch = I.current && I.current.branch;
    out.bedEv = use('bed');
    let saved = null; try { const g = GTP.game, raw = localStorage.getItem('gtp.save.v3.slot' + (g.activeSlot || 1)); saved = raw ? JSON.parse(raw) : null; } catch (e) { saved = null; }
    out.savedPos = saved ? { x: saved.x, z: saved.z, far: saved.x < -1000, interiors: saved.interiors } : null;
    out.before = before;
    return out;
  });
  console.log('  rooms: ' + JSON.stringify(rooms));
  t.assert(rooms.clothing && rooms.clothingEv.indexOf('clothing:open') >= 0 && rooms.shirtChanged && rooms.clothingMesh, 'Lanyard & Co.: the changing booth emits clothing:open and (no systems yet) changes the outfit');
  t.assert(rooms.barber && rooms.barberEv.indexOf('barber:open') >= 0 && rooms.hairChanged, 'the Clip Joint chair emits barber:open and cuts the hair');
  t.assert(rooms.safe && rooms.safeBranch === 'safe_penthouse' && rooms.bedEv.indexOf('safehouse:sleep') >= 0, 'the safehouse bed sleeps');
  t.assert(rooms.savedPos && !rooms.savedPos.far && rooms.savedPos.interiors && rooms.savedPos.interiors.rangeBest > 0, 'a save made inside stores the door outside and the range record: ' + JSON.stringify(rooms.savedPos));
  await view('int_safehouse', [5.5, 2.4, 4.6, -3, 1.0, -3]);
  await page.evaluate(() => GTP.Interiors.exit({ instant: true }));
  for (const k of [['clothing', [5.5, 2.6, 4.8, -3, 1.2, -3]], ['barber', [3.5, 2.3, 4.2, -1, 1.2, -3.5]], ['safe_brownstone', [5.5, 2.4, 4.6, -3, 1.0, -3]]]) {
    await page.evaluate((id) => { GTP.Interiors.enter(id, { instant: true }); GTP.game.advance(0.5); }, k[0]);
    await view('int_' + k[0], k[1]);
    await shot('int_' + k[0] + '_player');
    await page.evaluate(() => GTP.Interiors.exit({ instant: true }));
  }
  // night: the room's own lights carry it (the sky does not leak in)
  await page.evaluate(() => { GTP.game.debug.setClock(23); GTP.Interiors.enter('both_sides_strip', { instant: true }); GTP.game.advance(0.6); });
  await view('int_armory_night', [0, 3.0, 6.4, -1, 1.6, -5]);
  const night = await t.pixelStats(page);
  await page.evaluate(() => GTP.Interiors.exit({ instant: true }));
  console.log('  night stats: ' + JSON.stringify(night));
  t.assert(night.mean[0] + night.mean[1] + night.mean[2] > 150, 'the armory is lit at night');

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'no errors:\n' + errs.join('\n'));
  console.log('  screenshots: ' + shots.join(', '));
});
