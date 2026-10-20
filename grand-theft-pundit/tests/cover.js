/* cover.js: the v0.3 cover system (08_combat Combat.cover*, Player.control's cover input, ped.pose.cover).
 *  1 the cover action snaps to a parked car: low cover, the spot against its side, cover:enter, GTP.AI.coverAlert
 *  2 shots from the far side hit the car, not the player; a flank from the side gets through
 *  3 move along the car, hold at its end (the edge), peek (aim: stand up, exposed), blind fire (fire without aim)
 *  4 vault the car (jump in low cover)
 *  5 a building wall is high cover: aim mid-wall is a blind spot, at the corner aim leans out; cover again leaves (cover:exit)
 *  6 cover to cover: cover pressed while looking away from the wall runs to the car and takes it
 *  7 lamp posts and hydrants are not cover; nothing near means no cover
 * Screenshots in tests/out: cover_low.png, cover_peek.png, cover_wall.png, cover_vault.png (look at them). */
'use strict';
const H = require('./_harness');

H.run('cover', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  const EAST = -Math.PI / 2;

  await page.evaluate(() => {
    window.T_ = {
      freeze(ped) { ped.ai = { phase: 0.5, mode: 'idle', frozen: true, mission: true }; ped.stop(); return ped; },
      clearNear(x, z, r) { GTP.Entities.near(x, z, r).forEach((e) => { if (e.kind === 'ped' || (e.kind === 'vehicle' && !e.hasPlayer()) || e.kind === 'pickup' || e.kind === 'projectile') e.destroy(); }); GTP.game.advance(1 / 60); },
      // an open patch of walkable ground with no solid prop within 14 m and no road within 3 tiles
      open() {
        const W = GTP.World, T = W.T, TILE = GTP.C.TILE, ok = [T.GRASS, T.PLAZA, T.PARKING, T.SIDEWALK];
        for (let tz = 10; tz < W.h - 10; tz++) for (let tx = 10; tx < W.w - 10; tx++) {
          let good = true;
          for (let dz = -4; dz <= 4 && good; dz++) for (let dx = -4; dx <= 4 && good; dx++) if (ok.indexOf(W.tile(tx + dx, tz + dz)) < 0 || W.deckAt(tx + dx, tz + dz)) good = false;
          if (!good) continue;
          const x = (tx + 0.5) * TILE, z = (tz + 0.5) * TILE;
          if (W.props.some((p) => p.solid && Math.abs(p.x - x) < 14 && Math.abs(p.z - z) < 14)) continue;
          return { x, z };
        }
        return null;
      },
      // a building's west face with 6 m of open walkable ground in front of it and its north corner reachable
      wall() {
        const W = GTP.World, T = W.T, ok = [T.GRASS, T.PLAZA, T.PARKING, T.SIDEWALK];
        let best = null;
        W.buildings.forEach((b) => {
          if (b.h < 4 || b.d < 8 || b.d > 30) return;
          const x = b.x - 1.2, z = b.z + b.d * 0.5;
          for (let k = -2; k <= 2; k++) for (const dx of [1, 3, 5]) if (ok.indexOf(W.tileAt(b.x - dx, z + k * 2)) < 0 || W.solidAt(b.x - dx, z + k * 2, 0.5)) return;
          if (ok.indexOf(W.tileAt(b.x - 1.2, b.z - 1.5)) < 0 || W.solidAt(b.x - 1.2, b.z - 1.5, 0.5) || W.solidAt(b.x + 1, b.z - 1.5, 0.5)) return;   // around the north corner
          if (W.props.some((p) => p.solid && p.x > b.x - 7 && p.x < b.x + 0.5 && p.z > b.z - 4 && p.z < b.z + b.d + 1)) return;
          if (Math.abs(W.heightAt(x, z, 0)) > 0.3) return;
          if (!best || b.d < best.d) best = { x, z, bx: b.x, bz: b.z, bd: b.d, h: b.h, d: b.d };
        });
        return best;
      },
      setup(x, z, yaw) {
        const p = GTP.game.player;
        if (GTP.game.state !== 'playing') { let g = 0; while (GTP.game.state !== 'playing' && g++ < 40) GTP.game.advance(0.25); }
        if (GTP.AI && GTP.AI.wanted) GTP.AI.wanted.clear();
        if (p.inVehicle) p.exitVehicle();
        if (p.cover) GTP.Combat.coverExit(p, 'test');
        ['cover', 'aim', 'shoot', 'left', 'right', 'forward', 'back', 'jump'].forEach((a) => GTP.Input.set(a, false));
        GTP.game.debug.teleport(x, z); p.yaw = yaw; p.aimYaw = yaw; p.hp = p.maxHp; p.armor = 0;
        GTP.Render.rig.yaw = yaw; GTP.Render.rig.pitch = 0.2; GTP.Render.rig.snap();
        GTP.game.advance(0.1); T_.clearNear(x, z, 40); GTP.Render.fx.clear();
        p.weapons = { fist: Infinity, pistol: 60 }; p.ammo = {}; p.weapon = 'pistol';
      },
      tap(a) { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); }
    };
    // a stand-in for the AI track's flank hook, so the call is observable
    window._alerts = [];
    if (!GTP.AI.coverAlert) { GTP.AI.coverAlert = function (x, z, info) { window._alerts.push({ x, z, high: info && info.high }); }; window._stubAlert = true; }
    else { const orig = GTP.AI.coverAlert; GTP.AI.coverAlert = function (x, z, info) { window._alerts.push({ x, z, high: info && info.high }); return orig.apply(this, arguments); }; }
  });
  const spot = await page.evaluate(() => T_.open());
  t.assert(spot, 'found an open patch');
  console.log('  open: ' + JSON.stringify(spot));

  // ---- 1. snap to a parked car ----
  const snap = await page.evaluate(({ spot, EAST }) => {
    const p = GTP.game.player, CB = GTP.Combat;
    T_.setup(spot.x, spot.z, EAST);
    const car = GTP.game.debug.spawnVehicle(spot.x + 2.4, spot.z, 'sedan', { yaw: 0 });
    car.hp = car.maxHp = 1e6;   // a durable test car: the shots below should not wreck it (a real one burns in a long firefight)
    GTP.game.advance(0.2);
    const ev = []; GTP.Events.on('cover:enter', (e) => ev.push({ high: e.high, kind: e.kind }));
    const near = CB.hud().cover; const prompt = CB.hud().prompt;
    T_.tap('cover'); GTP.game.advance(0.4);
    const c = p.cover;
    window._car = car;
    return { near, prompt, ev, cover: c ? { kind: c.kind, high: c.high, nx: +c.nx.toFixed(2), nz: +c.nz.toFixed(2) } : null, x: +p.x.toFixed(2), carSide: +(car.x - car.hw).toFixed(2), alerts: window._alerts.length, pose: p.pose.cover ? Object.assign({}, p.pose.cover) : null, crouch: p.pose.crouch, yaw: +GTP.util.wrapAngle(p.yaw - EAST).toFixed(2) };
  }, { spot, EAST });
  console.log('  snap: ' + JSON.stringify(snap));
  t.assert(snap.near && snap.near.near && snap.prompt === 'cover', 'cover in reach shows the prompt: ' + JSON.stringify([snap.near, snap.prompt]));
  t.assert(snap.cover && snap.cover.kind === 'vehicle' && !snap.cover.high && snap.cover.nx < -0.9, 'the sedan is low cover facing the player: ' + JSON.stringify(snap.cover));
  t.assert(snap.carSide - snap.x > 0.3 && snap.carSide - snap.x < 0.7, 'the player slid against the car side: ' + JSON.stringify([snap.x, snap.carSide]));
  t.assert(snap.ev.length === 1 && snap.alerts >= 1, 'cover:enter fired and the AI got a cover alert: ' + JSON.stringify([snap.ev, snap.alerts]));
  t.assert(snap.pose && snap.pose.side && snap.pose.high === false && snap.pose.peek === false && snap.crouch && Math.abs(snap.yaw) < 0.3, 'pose.cover is filled, crouched, facing the cover: ' + JSON.stringify([snap.pose, snap.crouch, snap.yaw]));
  await page.evaluate(({ spot }) => { const p = GTP.game.player; GTP.Render.freeCam(true); GTP.Render.camera.position.set(p.x - 3.2, p.y + 1.9, p.z - 2.2); GTP.Render.camera.lookAt(p.x + 1.2, p.y + 0.6, p.z); void spot; }, { spot });
  await t.shot(page, 'cover_low');
  await page.evaluate(() => GTP.Render.freeCam(false));

  // ---- 2. shots from the far side hit the car; a flank gets through ----
  const block = await page.evaluate(({ spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, car = window._car;
    const cop = T_.freeze(GTP.game.debug.spawnPed(spot.x + 12, spot.z, null, 'thug')); cop.hostile = true; cop.weapon = 'pistol'; cop.aimTarget = p;
    GTP.game.advance(0.1);
    const fire = (n) => { let shots = 0; for (let i = 0; i < n; i++) { if (CB.fire(cop, 'pistol')) shots++; GTP.game.advance(0.28); } return shots; };
    const hp0 = p.hp, car0 = car.hp;
    const s1 = fire(20);
    const front = { shots: s1, hpLost: +(hp0 - p.hp).toFixed(1), carHit: +(car0 - car.hp).toFixed(1), inCover: !!p.cover };
    // the flank: the same shooter along the car's side
    cop.x = p.x - 0.5; cop.z = p.z - 11; cop.snap(); GTP.game.advance(0.1);
    const hp1 = p.hp; const s2 = fire(20);
    const flank = { shots: s2, hpLost: +(hp1 - p.hp).toFixed(1) };
    window._cop = cop;
    return { front, flank };
  }, { spot });
  console.log('  block: ' + JSON.stringify(block));
  t.assert(block.front.shots >= 15 && block.front.hpLost === 0 && block.front.inCover, 'twenty shots from beyond the car never touch the player in cover: ' + JSON.stringify(block.front));
  t.assert(block.flank.shots >= 15 && block.flank.hpLost > 0, 'a flank along the car gets through: ' + JSON.stringify(block.flank));

  // ---- 3. move along the car to its end, peek, blind fire ----
  const move = await page.evaluate(({ spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, car = window._car, cop = window._cop;
    p.hp = p.maxHp; cop.x = spot.x + 12; cop.z = spot.z; cop.snap();
    const z0 = p.z, x0 = p.x;
    GTP.Input.set('right', true); GTP.game.advance(0.8);
    const mid = { dz: +(p.z - z0).toFixed(2), dx: +(p.x - x0).toFixed(2), cover: !!p.cover };
    GTP.game.advance(2.5); GTP.Input.set('right', false); GTP.game.advance(0.1);
    const end = { z: +p.z.toFixed(2), carEnd: +(car.z + car.hl).toFixed(2), edge: p.cover && p.cover.edge, cover: !!p.cover };
    // peek: aim stands up out of low cover (exposed)
    GTP.Input.set('aim', true); GTP.game.advance(0.4);
    const peek = { peek: p.cover && p.cover.peek, pose: p.pose.cover && p.pose.cover.peek, crouch: p.pose.crouch, aim: CB.aim.active };
    window._peek = true;
    return { mid, end, peek };
  }, { spot });
  console.log('  move: ' + JSON.stringify(move));
  await page.evaluate(() => { const p = GTP.game.player; GTP.Render.freeCam(true); GTP.Render.camera.position.set(p.x - 3, p.y + 1.7, p.z + 2.6); GTP.Render.camera.lookAt(p.x + 1, p.y + 1.1, p.z - 0.4); });
  await t.shot(page, 'cover_peek');
  await page.evaluate(() => GTP.Render.freeCam(false));
  const blind = await page.evaluate(() => {
    const p = GTP.game.player, CB = GTP.Combat, cop = window._cop;
    const hp0 = p.hp; let hits = 0;
    for (let i = 0; i < 20; i++) { CB.fire(cop, 'pistol'); GTP.game.advance(0.28); }
    const exposed = +(hp0 - p.hp).toFixed(1);
    GTP.Input.set('aim', false); GTP.game.advance(0.3);
    const x0 = p.x, shots0 = p.stats.shots || 0;
    GTP.Input.set('shoot', true); GTP.game.advance(1 / 60);
    const during = { blind: p.pose.cover && p.pose.cover.blind, crouch: p.pose.crouch };
    GTP.game.advance(0.5); GTP.Input.set('shoot', false); GTP.game.advance(0.1);
    void hits;
    return { exposed, shots: (p.stats.shots || 0) - shots0, during, stayed: Math.abs(p.x - x0) < 0.05 && !!p.cover };
  });
  console.log('  blind: ' + JSON.stringify(blind));
  t.assert(move.mid.dz > 0.8 && Math.abs(move.mid.dx) < 0.25 && move.mid.cover, 'right moves along the car, staying against it: ' + JSON.stringify(move.mid));
  t.assert(move.end.cover && move.end.edge === 'right' && move.end.z <= move.end.carEnd + 0.3, 'the move holds at the car\'s end (the edge): ' + JSON.stringify(move.end));
  t.assert(move.peek.peek && move.peek.pose && !move.peek.crouch && move.peek.aim, 'aim peeks up out of low cover: ' + JSON.stringify(move.peek));
  t.assert(blind.exposed > 0, 'a peeking player can be hit: ' + blind.exposed);
  t.assert(blind.shots >= 2 && blind.during.blind && blind.during.crouch && blind.stayed, 'fire without aim is blind fire from cover: ' + JSON.stringify(blind));

  // ---- 4. vault the car ----
  const vault = await page.evaluate(() => {
    const p = GTP.game.player, car = window._car, cop = window._cop;
    cop.destroy(); GTP.game.advance(0.1);
    p.hp = p.maxHp;
    const x0 = p.x; let maxY = p.y, sawVault = false, sawPose = false;
    GTP.Input.set('jump', true); GTP.game.advance(1 / 60); GTP.Input.set('jump', false);
    for (let i = 0; i < 45; i++) { GTP.game.advance(1 / 60); maxY = Math.max(maxY, p.y); if (p._vault) sawVault = true; if (p.pose.vault != null) sawPose = true; if (i === 14) GTP.game.render(); }
    return { x0: +x0.toFixed(2), x: +p.x.toFixed(2), far: +(car.x + car.hw).toFixed(2), maxY: +maxY.toFixed(2), sawVault, sawPose, cover: !!p.cover, onGround: p.onGround, solid: GTP.World.solidAt(p.x, p.z, p.y + 0.5), inCar: car.pushCircle(p.x, p.z, p.radius) };
  });
  console.log('  vault: ' + JSON.stringify(vault));
  t.assert(vault.sawVault && vault.sawPose && vault.x > vault.far && vault.maxY > 0.9 && !vault.cover && vault.onGround && !vault.inCar, 'jump in low cover vaults over the car: ' + JSON.stringify(vault));

  // ---- 5. a building wall: high cover, a blind spot mid-wall, a lean at the corner, cover again leaves ----
  const wallSpot = await page.evaluate(() => T_.wall());
  t.assert(wallSpot, 'found a building face with open ground in front');
  console.log('  wall spot: ' + JSON.stringify(wallSpot));
  const wall = await page.evaluate(({ w, EAST }) => {
    const p = GTP.game.player, CB = GTP.Combat;
    T_.setup(w.x, w.z, EAST); GTP.game.advance(0.2);
    const exits = []; GTP.Events.on('cover:exit', (e) => exits.push(e.reason));
    T_.tap('cover'); GTP.game.advance(0.4);
    const c = p.cover, on = c ? { kind: c.kind, high: c.high, nx: +c.nx.toFixed(2), x: +p.x.toFixed(2), face: w.bx } : null;
    GTP.Input.set('aim', true); GTP.game.advance(0.3);
    const mid = { peek: p.cover && p.cover.peek, edge: p.cover && p.cover.edge };
    GTP.Input.set('aim', false); GTP.game.advance(0.1);
    // to the north corner (left, facing east)
    GTP.Input.set('left', true); GTP.game.advance(Math.min(8, w.d / 2 / 1.6 + 1.5)); GTP.Input.set('left', false); GTP.game.advance(0.1);
    const corner = { edge: p.cover && p.cover.edge, z: +p.z.toFixed(2), wallStart: w.bz };
    const zBase = p.z;
    GTP.Input.set('aim', true); GTP.game.advance(0.4);
    const lean = { peek: p.cover && p.cover.peek, dz: +(zBase - p.z).toFixed(2), aim: CB.aim.active };
    GTP.Render.freeCam(true); GTP.Render.camera.position.set(p.x - 3.4, p.y + 1.8, p.z + 2.4); GTP.Render.camera.lookAt(p.x + 0.4, p.y + 1.1, p.z - 0.6);
    return { on, mid, corner, lean, exits };
  }, { w: wallSpot, EAST });
  await t.shot(page, 'cover_wall');
  const leave = await page.evaluate(() => {
    const p = GTP.game.player; GTP.Render.freeCam(false);
    GTP.Input.set('aim', false); GTP.game.advance(0.3);
    const ex = []; const h = (e) => ex.push(e.reason); GTP.Events.on('cover:exit', h);
    T_.tap('cover'); GTP.game.advance(0.2);
    GTP.Events.off('cover:exit', h);
    return { cover: !!p.cover, ex };
  });
  console.log('  wall: ' + JSON.stringify([wall, leave]));
  t.assert(wall.on && wall.on.kind === 'wall' && wall.on.high && wall.on.nx < -0.9 && wall.on.face - wall.on.x < 0.7, 'a building face is high cover: ' + JSON.stringify(wall.on));
  t.assert(!wall.mid.peek && !wall.mid.edge, 'aiming mid-wall does not lean out (it is a blind-fire spot): ' + JSON.stringify(wall.mid));
  t.assert(wall.corner.edge === 'left' && wall.corner.z >= wall.corner.wallStart - 0.6, 'moving left holds at the corner: ' + JSON.stringify(wall.corner));
  t.assert(wall.lean.peek && wall.lean.dz > 0.3 && wall.lean.aim, 'aim at the corner leans out past it: ' + JSON.stringify(wall.lean));
  t.assert(!leave.cover && leave.ex.indexOf('key') >= 0, 'cover again leaves (cover:exit): ' + JSON.stringify(leave));

  // ---- 6. cover to cover: looking away from the wall at a car, cover runs there and takes it ----
  const run = await page.evaluate(({ w, EAST }) => {
    const p = GTP.game.player;
    T_.setup(w.x, w.z, EAST); GTP.game.advance(0.2);
    T_.tap('cover'); GTP.game.advance(0.4);
    const car = GTP.game.debug.spawnVehicle(w.x - 6.5, w.z, 'sedan', { yaw: 0 });
    GTP.game.advance(0.1);
    GTP.Render.rig.yaw = -EAST; GTP.Render.rig.snap(); GTP.game.advance(0.1);   // look west, away from the wall, at the car
    T_.tap('cover');
    const running = !!p._coverRun;
    let took = -1; for (let i = 0; i < 180 && took < 0; i++) { GTP.game.advance(1 / 60); if (p.cover && p.cover.kind === 'vehicle') took = i / 60; }
    GTP.game.advance(0.3);
    return { running, took, kind: p.cover && p.cover.kind, nearCar: Math.abs(p.x - (car.x + car.hw)) < 0.8, px: +p.x.toFixed(2), face: +(car.x + car.hw).toFixed(2), ref: p.cover && p.cover.ref === car };
  }, { w: wallSpot, EAST });
  console.log('  run: ' + JSON.stringify(run));
  t.assert(run.running && run.took > 0 && run.took < 2.5 && run.kind === 'vehicle' && run.nearCar, 'cover to cover: a run from the wall to the car: ' + JSON.stringify(run));

  // ---- 7. a lamp post is not cover; open ground has none ----
  const none = await page.evaluate(({ spot, EAST }) => {
    const p = GTP.game.player, CB = GTP.Combat, W = GTP.World;
    T_.setup(spot.x, spot.z, EAST); GTP.game.advance(0.2);
    const open = !!CB.coverFind(p);
    T_.tap('cover'); const openTake = !!p.cover;
    // the nearest lamp post with open ground west of it
    let lamp = null; W.props.forEach((pr) => { if (pr.kind !== 'lamp' || pr.fallen || !pr.solid) return; if (W.solidAt(pr.x - 1.2, pr.z, 0.5) || [W.T.SIDEWALK, W.T.PLAZA].indexOf(W.tileAt(pr.x - 1.2, pr.z)) < 0) return; if (W.props.some((q) => q !== pr && q.solid && Math.hypot(q.x - pr.x, q.z - pr.z) < 4)) return; const d = Math.hypot(pr.x - p.x, pr.z - p.z); if (!lamp || d < lamp.d) lamp = { x: pr.x, z: pr.z, d }; });
    let lampTake = null;
    if (lamp) {
      T_.setup(lamp.x - 1.0, lamp.z, EAST); GTP.game.advance(0.2);
      const c = CB.coverFind(p); lampTake = c ? c.kind + ':' + (c.ref && c.ref.kind) : null;
    }
    return { open, openTake, lamp: !!lamp, lampTake };
  }, { spot, EAST });
  console.log('  none: ' + JSON.stringify(none));
  t.assert(!none.open && !none.openTake, 'open ground has no cover');
  t.assert(!none.lamp || none.lampTake === null || none.lampTake.indexOf('lamp') < 0, 'a lamp post is not cover: ' + JSON.stringify(none));

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
