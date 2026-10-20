/* combat.js: weapons, aiming, hitscan, projectiles, death and pickups (08_combat).
 *  1 pistol: a ped 8 m ahead loses hp, ammo drops, tracers + muzzle flash fx     2 aim mode locks the nearest ped in the cone, Tab cycles
 *  3 a ped behind a building is not hit (occlusion)                               4 an SMG'd sedan explodes: wreck remains, heat rose
 *  5 the megaphone pushes a ped 3+ m with no damage                               6 a hottake stuns every ped in its radius
 *  7 hp 0 -> wasted -> hospital respawn (full hp, fists only, -10% cash)          8 busted via the AI -> precinct respawn, -$500
 *  9 a cash pickup under the player pays out; world pickups exist with sponsor labels
 * Screenshots in tests/out: combat_aim.png, combat_firefight.png, combat_explosion.png (look at them). */
'use strict';
const H = require('./_harness');

H.run('combat', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  const EAST = -Math.PI / 2;

  // helpers that live in the page
  await page.evaluate(() => {
    window.T_ = {
      // an open tile with `len` m of flat, prop-free, road-free ground to its east; nearest to (cx, cz)
      openSpot(cx, cz, len) {
        const W = GTP.World, T = W.T, TILE = GTP.C.TILE; len = len || 18;
        const ok = [T.GRASS, T.PLAZA, T.PARKING, T.SIDEWALK, T.SAND];
        const n = Math.ceil(len / TILE);
        let best = null, bd = 1e9;
        for (let tz = 3; tz < W.h - 3; tz++) for (let tx = 3; tx < W.w - n - 3; tx++) {
          const x = (tx + 0.5) * TILE, z = (tz + 0.5) * TILE, d = Math.hypot(x - cx, z - cz);
          if (d > 90 || d >= bd) continue;
          if (ok.indexOf(W.tile(tx, tz)) < 0) continue;
          let good = true;
          for (let dz = -1; dz <= 1 && good; dz++) for (let k = -1; k <= n && good; k++) {
            const tt = W.tile(tx + k, tz + dz);
            if (ok.indexOf(tt) < 0 || W.deckAt(tx + k, tz + dz)) good = false;
          }
          if (!good) continue;
          for (let dz = -4; dz <= 4 && good; dz++) for (let k = -3; k <= n + 3 && good; k++) { const tt = W.tile(tx + k, tz + dz); if (tt === T.ROAD || tt === T.BRIDGE || tt === T.RAMP) good = false; }
          if (!good) continue;
          for (const p of W.props) { if (!p.solid) continue; if (p.x > x - 3 && p.x < x + len + 3 && Math.abs(p.z - z) < 4.5) { good = false; break; } }
          if (!good) continue;
          best = { x, z }; bd = d;
        }
        return best;
      },
      // a brain that never ticks: the ped stands where it is put
      freeze(ped) { ped.ai = { phase: 0.5, mode: 'idle', frozen: true }; ped.stop(); return ped; },
      clearNear(x, z, r) { GTP.Entities.near(x, z, r).forEach((e) => { if (e.kind === 'ped' || (e.kind === 'vehicle' && !e.hasPlayer()) || e.kind === 'pickup' || e.kind === 'projectile') e.destroy(); }); GTP.game.advance(1 / 60); },
      setup(spot, yaw) {
        const p = GTP.game.player;
        if (GTP.game.state !== 'playing') { let g = 0; while (GTP.game.state !== 'playing' && g++ < 40) GTP.game.advance(0.25); }   // a card from the last section plays out
        if (GTP.AI && GTP.AI.wanted) GTP.AI.wanted.clear();
        if (p.inVehicle) p.exitVehicle();
        GTP.game.debug.teleport(spot.x, spot.z); p.yaw = yaw; p.aimYaw = yaw; p.hp = p.maxHp;
        GTP.Render.rig.yaw = yaw; GTP.Render.rig.pitch = 0.2; GTP.Render.rig.snap();
        GTP.Input.set('shoot', false); GTP.Input.set('aim', false);
        GTP.game.advance(0.1); T_.clearNear(spot.x, spot.z, 40); GTP.Render.fx.clear();
      },
      arena() { return T_.openSpot(112, 254) || T_.openSpot(536, 150) || T_.openSpot(300, 110); },
      fxCount(type) { return GTP.Render.fx.list.filter((f) => f.type === type).length; }
    };
  });
  const spot = await page.evaluate(() => T_.arena());
  console.log('  arena: ' + JSON.stringify(spot));
  t.assert(spot, 'found an open arena');

  // ---- 1. pistol: ped 8 m ahead ----
  const shoot = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player;
    T_.setup(spot, EAST);
    GTP.game.debug.giveWeapon('pistol', 20);
    const ped = T_.freeze(GTP.game.debug.spawnPed(spot.x + 8, spot.z, null, 'civ')); ped.yaw = Math.PI / 2;
    GTP.game.advance(0.1);
    const hp0 = ped.hp, ammo0 = p.weapons.pistol, held0 = !!p._held;
    let tracerFrames = 0, flashFrames = 0, maxTracers = 0, shotEvents = 0;
    GTP.Events.on('damage', (e) => { if (e.target === ped) shotEvents++; });
    GTP.Input.set('shoot', true);
    for (let i = 0; i < 60; i++) {
      GTP.game.advance(1 / 60);
      const tr = T_.fxCount('tracer'); if (tr) tracerFrames++; maxTracers = Math.max(maxTracers, tr);
      if (T_.fxCount('explosion')) flashFrames++;
    }
    GTP.Input.set('shoot', false); GTP.game.advance(0.2);
    return { hp0, hp: ped.hp, alive: ped.alive, ammo0, ammo: p.weapons.pistol, tracerFrames, maxTracers, flashFrames, shotEvents, weapon: p.weapon, held0, heldName: p._held && p._held.name, yawErr: Math.abs(GTP.util.wrapAngle(p.yaw - EAST)), shots: p.stats.shots, hits: p.stats.hits, heat: GTP.AI.wanted.heat };
  }, { EAST, spot });
  console.log('  pistol: ' + JSON.stringify(shoot));
  t.assert(shoot.hp < shoot.hp0 && shoot.shotEvents >= 2, 'the ped took pistol damage: ' + shoot.hp0 + ' -> ' + shoot.hp);
  t.assert(shoot.ammo0 === 20 && shoot.ammo < 20 && shoot.ammo >= 14, 'ammo decreased: ' + shoot.ammo0 + ' -> ' + shoot.ammo);
  t.assert(shoot.tracerFrames >= 4 && shoot.flashFrames >= 4, 'tracer and muzzle flash fx emitted: ' + JSON.stringify([shoot.tracerFrames, shoot.flashFrames]));
  t.assert(shoot.held0 && shoot.heldName === 'held', 'the pistol mesh is in the player\'s hand');
  t.assert(shoot.yawErr < 0.25, 'auto-target kept the player facing the ped: ' + shoot.yawErr);

  // ---- 2. aim mode: lock the nearest in the cone, Tab cycles, over-the-shoulder camera ----
  const lock = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player;
    T_.setup(spot, EAST);
    GTP.game.debug.giveWeapon('pistol', 20);
    const a = T_.freeze(GTP.game.debug.spawnPed(spot.x + 9, spot.z - 1.5, null, 'thug')); a.hostile = true;
    const b = T_.freeze(GTP.game.debug.spawnPed(spot.x + 12, spot.z + 2.5, null, 'thug')); b.hostile = true;
    GTP.game.advance(0.1);
    const name = (e) => (e === a ? 'a' : e === b ? 'b' : e ? 'other' : null);
    GTP.Input.set('aim', true); GTP.game.advance(0.4);
    const first = name(p.lockTarget), aimActive = GTP.Combat.aim.active, fov = GTP.Render.camera.fov;
    const screen = GTP.Combat.aim.screen, ts = GTP.Combat.aim.targetScreen;
    const cam = GTP.Render.camera.position, camDist = Math.hypot(cam.x - p.x, cam.z - p.z);
    // the camera sits to the player's right
    const d = GTP.util.yawToDir(GTP.Render.rig.yaw), right = (cam.x - p.x) * (-d.z) + (cam.z - p.z) * d.x;
    GTP.Input.set('lockOn', true); GTP.game.advance(1 / 60); GTP.Input.set('lockOn', false); GTP.game.advance(0.1);
    const second = name(p.lockTarget);
    GTP.Input.set('lockOn', true); GTP.game.advance(1 / 60); GTP.Input.set('lockOn', false); GTP.game.advance(0.1);
    const third = name(p.lockTarget);
    // a shot in aim mode goes to the locked target (the assist has turned the camera onto it)
    GTP.game.advance(0.3);
    const hpA = a.hp, hpB = b.hp;
    GTP.Input.set('shoot', true); GTP.game.advance(0.3); GTP.Input.set('shoot', false);
    const hit = { a: hpA - a.hp, b: hpB - b.hp };
    GTP.Input.set('aim', false); GTP.game.advance(0.1);
    return { aimActive, first, second, third, fov, camDist, right, screen, ts, hit, released: p.lockTarget === null && !GTP.Combat.aim.active, pose: p.aiming };
  }, { EAST, spot });
  console.log('  aim: ' + JSON.stringify(lock));
  t.assert(lock.aimActive && lock.first === 'a', 'aim mode locked the nearest hostile in the cone: ' + lock.first);
  t.assert(lock.second === 'b' && lock.third === 'a', 'Tab cycles the lock: ' + lock.second + ', ' + lock.third);
  t.assert(lock.fov < 58 && lock.camDist < 2.6 && lock.right > 0.2, 'over-the-shoulder camera: fov ' + lock.fov + ', dist ' + lock.camDist + ', right ' + lock.right);
  t.assert(lock.screen && lock.screen.visible && lock.ts && lock.ts.visible, 'crosshair and reticle screen hooks are visible');
  t.assert(lock.hit.a > 0 && lock.hit.b === 0, 'the aimed shot hit the locked target only: ' + JSON.stringify(lock.hit));
  t.assert(lock.released, 'releasing aim clears the lock');

  // ---- 3. occlusion: a ped behind a building is not hit ----
  const occ = await page.evaluate(({ EAST }) => {
    const p = GTP.game.player, W = GTP.World, T = W.T;
    const okT = (tt) => tt === T.SIDEWALK || tt === T.PLAZA || tt === T.GRASS || tt === T.PARKING;
    let pick = null;
    W.buildings.forEach((b) => {
      if (b.w > 28 || b.w < 6 || b.h < 4) return;
      const px = b.x - 5, pz = b.cz, ex = b.x + b.w + 3, ez = b.cz;
      if (!okT(W.tileAt(px, pz)) || !okT(W.tileAt(ex, ez)) || W.solidAt(px, pz, 0.5) || W.solidAt(ex, ez, 0.5)) return;
      if (W.props.some((pr) => pr.solid && Math.hypot(pr.x - px, pr.z - pz) < 2)) return;
      const d = Math.hypot(b.cx - p.x, b.cz - p.z);
      if (!pick || d < pick.d) pick = { id: b.id, px, pz, ex, ez, d, w: b.w };
    });
    T_.setup({ x: pick.px, z: pick.pz }, EAST);
    GTP.game.debug.giveWeapon('pistol', 20);
    const ped = T_.freeze(GTP.game.debug.spawnPed(pick.ex, pick.ez, null, 'civ'));
    GTP.game.advance(0.1);
    const hp0 = ped.hp, ammo0 = p.weapons.pistol;
    let pedDamage = 0; GTP.Events.on('damage', (e) => { if (e.target === ped) pedDamage++; });
    GTP.Input.set('shoot', true); GTP.game.advance(1); GTP.Input.set('shoot', false);
    const wallPuffs = T_.fxCount('puff');
    GTP.game.advance(0.2);
    return { pick, hp0, hp: ped.hp, pedDamage, ammoUsed: ammo0 - p.weapons.pistol, lock: p.lockTarget, blocked: !!W.raycastBuildings(pick.px, 1.3, pick.pz, 1, 0, 0, 30), wallPuffs };
  }, { EAST });
  console.log('  occlusion: ' + JSON.stringify(occ));
  t.assert(occ.blocked, 'the building sits between the player and the ped');
  t.assert(occ.ammoUsed >= 3, 'shots were fired into the wall: ' + occ.ammoUsed);
  t.assert(occ.hp === occ.hp0 && occ.pedDamage === 0, 'the ped behind the building was not hit');

  // ---- 4. SMG a sedan until it explodes ----
  const boom = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player;
    GTP.game.debug.setClock(19.2);   // dusk: additive fire reads against the darker ground
    T_.setup(spot, EAST);
    GTP.AI.wanted.clear();
    GTP.game.debug.giveWeapon('smg', 400);
    const v = GTP.game.debug.spawnVehicle(spot.x + 11, spot.z, 'sedan', { yaw: 0 });
    GTP.game.advance(0.1);
    const hp0 = v.hp, heat0 = GTP.AI.wanted.heat;
    let exploded = false, explodedAt = -1, firstDamageAt = -1, burningAt = -1, sparks = 0;
    GTP.Events.on('vehicle:exploded', (e) => { if (e.vehicle === v) exploded = true; });
    GTP.Input.set('shoot', true);
    let tt = 0;
    for (let i = 0; i < 400; i++) {
      const step = v.burning ? 1 / 30 : 0.25;
      GTP.game.advance(step); tt += step;
      if (firstDamageAt < 0 && v.hp < hp0) firstDamageAt = tt;
      if (burningAt < 0 && v.burning) { burningAt = tt; GTP.Input.set('shoot', false); }
      sparks = Math.max(sparks, T_.fxCount('spark'));
      if (exploded) { explodedAt = tt; break; }
      if (tt > 14) break;
    }
    GTP.Input.set('shoot', false);
    GTP.game.advance(0.12);   // the fireball at its biggest for the screenshot
    return { hp0, firstDamageAt, burningAt, explodedAt, exploded, wreck: v.wreck, inList: GTP.Entities.list.indexOf(v) >= 0, heat0, heat: GTP.AI.wanted.heat, wanted: p.wanted, sparks, playerHp: p.hp, damage: Math.round(v.damage) };
  }, { EAST, spot });
  console.log('  vehicle: ' + JSON.stringify(boom));
  await t.shot(page, 'combat_explosion');
  t.assert(boom.firstDamageAt > 0 && boom.sparks > 0, 'bullets damage the car with sparks: ' + JSON.stringify([boom.firstDamageAt, boom.sparks]));
  t.assert(boom.exploded && boom.wreck && boom.inList, 'the car exploded and the wreck remains: ' + JSON.stringify([boom.explodedAt, boom.wreck, boom.inList]));
  t.assert(boom.heat > boom.heat0 && boom.wanted >= 1, 'heat rose for destroying a vehicle: ' + boom.heat0 + ' -> ' + boom.heat);
  t.assert(boom.playerHp === 100, 'the player kept out of the blast');

  // ---- 5. megaphone: a push, no damage ----
  const mega = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player;
    GTP.game.debug.setClock(14);
    T_.setup(spot, EAST);
    GTP.AI.wanted.clear();
    GTP.game.debug.giveWeapon('megaphone', 10);
    const ped = T_.freeze(GTP.game.debug.spawnPed(spot.x + 2.5, spot.z, null, 'civ')); ped.yaw = Math.PI / 2;
    GTP.game.advance(0.1);
    const hp0 = ped.hp, x0 = ped.x, z0 = ped.z, ammo0 = p.weapons.megaphone;
    let rings = 0, knocked = false, texts = 0;
    GTP.Input.set('shoot', true);
    for (let i = 0; i < 6; i++) { GTP.game.advance(1 / 60); rings = Math.max(rings, T_.fxCount('ring')); texts = Math.max(texts, GTP.Render.fx.texts.length); if (ped.knockedDown) knocked = true; }
    GTP.Input.set('shoot', false);
    GTP.game.advance(1.6);
    return { hp0, hp: ped.hp, moved: Math.hypot(ped.x - x0, ped.z - z0), rings, texts, knocked, up: !ped.knockedDown, ammoUsed: ammo0 - p.weapons.megaphone, heat: GTP.AI.wanted.heat, alive: ped.alive };
  }, { EAST, spot });
  console.log('  megaphone: ' + JSON.stringify(mega));
  t.assert(mega.moved >= 3 && mega.hp === mega.hp0 && mega.alive, 'the megaphone pushed the ped ' + mega.moved.toFixed(2) + ' m with no damage');
  t.assert(mega.rings >= 3 && mega.knocked && mega.up, 'visible wave fx, the ped tumbled and got up: ' + JSON.stringify([mega.rings, mega.knocked, mega.up]));
  t.assert(mega.ammoUsed === 1 && mega.heat > 0, 'one charge spent, heat rose: ' + JSON.stringify([mega.ammoUsed, mega.heat]));

  // ---- 6. hottake: a lobbed stun ----
  const hot = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player;
    T_.setup(spot, EAST);
    GTP.AI.wanted.clear();
    GTP.game.debug.giveWeapon('hottake', 5);
    const a = T_.freeze(GTP.game.debug.spawnPed(spot.x + 9, spot.z - 1.2, null, 'thug')); a.hostile = true;
    const b = T_.freeze(GTP.game.debug.spawnPed(spot.x + 10.5, spot.z + 1.6, null, 'thug')); b.hostile = true;
    GTP.game.advance(0.1);
    const hpA = a.hp, hpB = b.hp;
    GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false);
    let proj = GTP.Entities.byKind('projectile').length, landedAt = -1, maxY = 0, explosions = 0;
    for (let i = 0; i < 60; i++) {
      GTP.game.advance(0.05);
      const pr = GTP.Entities.byKind('projectile')[0]; if (pr) maxY = Math.max(maxY, pr.y - p.y);
      explosions = Math.max(explosions, T_.fxCount('explosion'));
      if (!pr && landedAt < 0) landedAt = (i + 1) * 0.05;
      if (landedAt > 0 && (i + 1) * 0.05 > landedAt + 0.3) break;
    }
    return { proj, landedAt, maxY, explosions, knockedA: a.knockedDown, knockedB: b.knockedDown, dmgA: hpA - a.hp, dmgB: hpB - b.hp, ammo: p.weapons.hottake, playerDown: p.knockedDown, dist: Math.hypot(a.x - b.x, a.z - b.z) };
  }, { EAST, spot });
  console.log('  hottake: ' + JSON.stringify(hot));
  t.assert(hot.proj === 1 && hot.landedAt > 0 && hot.landedAt < 2.5 && hot.maxY > 1.5, 'a lobbed projectile flew and landed: ' + JSON.stringify([hot.proj, hot.landedAt, hot.maxY]));
  t.assert(hot.knockedA && hot.knockedB && hot.dmgA > 0 && hot.dmgB > 0, 'both peds in the radius are stunned: ' + JSON.stringify(hot));
  t.assert(hot.explosions > 0 && !hot.playerDown && hot.ammo === 4, 'blast fx, the thrower stood clear, one hottake spent');

  // ---- 7. wasted: hp 0 -> RATIO'D -> the hospital ----
  const dead = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, W = GTP.World;
    T_.setup(spot, EAST);
    GTP.AI.wanted.clear();
    GTP.game.debug.giveWeapon('pistol', 20);
    GTP.game.advance(0.2);
    const money0 = p.money;
    p.hp = 0;
    GTP.game.advance(1 / 60);
    const out = { state1: GTP.game.state, control: p.controlEnabled, alive1: p.alive, death: GTP.Combat.death && GTP.Combat.death.kind, text: GTP.Combat.death && GTP.Combat.death.text };
    GTP.game.advance(1.5);
    out.tilt = +p.tilt.toFixed(2); out.stateMid = GTP.game.state;
    GTP.game.advance(2.5);
    const door = W.landmark('hospital').door;
    out.after = { state: GTP.game.state, hp: p.hp, alive: p.alive, weapons: Object.keys(p.weapons), weapon: p.weapon, money: p.money, money0, dHospital: +Math.hypot(p.x - door.x, p.z - door.z).toFixed(1), control: p.controlEnabled, wanted: p.wanted, knocked: p.knockedDown, solid: W.solidAt(p.x, p.z, p.y + 0.5), respawnEvent: null };
    return out;
  }, { EAST, spot });
  console.log('  wasted: ' + JSON.stringify(dead));
  t.assert(dead.state1 === 'wasted' && !dead.control && !dead.alive1 && dead.death === 'wasted' && dead.text === 'RATIO\'D', 'hp 0 -> state wasted with the GDD fail text: ' + JSON.stringify(dead));
  t.assert(dead.stateMid === 'wasted' && dead.tilt < -1.2, 'the body lies flat while the card shows: tilt ' + dead.tilt);
  t.assert(dead.after.state === 'playing' && dead.after.alive && dead.after.hp === 100 && dead.after.control && !dead.after.knocked, 'respawned alive with full hp: ' + JSON.stringify(dead.after));
  t.assert(dead.after.weapons.length === 1 && dead.after.weapons[0] === 'fist' && dead.after.weapon === 'fist', 'weapons cleared: ' + dead.after.weapons);
  t.assert(dead.after.money === Math.round(dead.after.money0 * 0.9), 'lost 10% cash: ' + dead.after.money0 + ' -> ' + dead.after.money);
  t.assert(dead.after.dHospital < 8 && !dead.after.solid, 'respawned by the hospital door: ' + dead.after.dHospital);

  // ---- 8. busted via the AI -> DEPLATFORMED -> the precinct ----
  const bust = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, W = GTP.World;
    T_.setup(spot, EAST);
    GTP.game.debug.giveWeapon('smg', 30);
    p.money = 1200;
    GTP.game.debug.setWanted(1);
    const cop = GTP.game.debug.spawnPed(spot.x + 1, spot.z, null, 'cop');
    let ev = null; GTP.Events.on('busted', (e) => { ev = { level: e.level, fine: e.fine }; });
    let bustedAt = -1;
    for (let s = 0; s < 16; s++) { GTP.game.advance(0.25); if (GTP.game.state === 'busted' && bustedAt < 0) { bustedAt = (s + 1) * 0.25; break; } }
    const out = { bustedAt, state: GTP.game.state, ev, control: p.controlEnabled, death: GTP.Combat.death && GTP.Combat.death.kind, text: GTP.Combat.death && GTP.Combat.death.text, copLine: cop.line };
    GTP.game.advance(3.5);
    const hq = W.landmark('police_hq').door;
    out.after = { state: GTP.game.state, money: p.money, weapons: Object.keys(p.weapons), wanted: p.wanted, dHQ: +Math.hypot(p.x - hq.x, p.z - hq.z).toFixed(1), control: p.controlEnabled, hp: p.hp, solid: W.solidAt(p.x, p.z, p.y + 0.5) };
    return out;
  }, { EAST, spot });
  console.log('  busted: ' + JSON.stringify(bust));
  t.assert(bust.bustedAt > 0 && bust.state === 'busted' && bust.ev && bust.death === 'busted' && bust.text === 'DEPLATFORMED' && !bust.control, 'the AI bust went through Combat: ' + JSON.stringify(bust));
  // the fine (GDD_EXPANSION 6.9): $500 at one star, never over 15% of the cash: $180 of $1,200
  t.assert(bust.after.state === 'playing' && bust.after.money === 1200 - Math.min(500, Math.floor(1200 * 0.15)) && bust.ev.fine === 180 && bust.after.wanted === 0 && bust.after.control, 'released: fined 15% of $1,200, stars cleared: ' + JSON.stringify(bust.after));
  t.assert(bust.after.weapons.length === 1 && bust.after.weapons[0] === 'fist' && bust.after.dHQ < 8 && !bust.after.solid, 'at the precinct door with fists only: ' + JSON.stringify(bust.after));

  // ---- 9. pickups ----
  const pick = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player;
    T_.setup(spot, EAST);
    const money0 = p.money;
    const pk = GTP.Combat.spawnPickup({ type: 'cash', value: 75, x: p.x, z: p.z });
    const hasMesh = !!pk.mesh;
    GTP.game.advance(0.2);
    const cash = { money0, money: p.money, removed: pk.removed };
    // a sponsor bottle: health at 20 hp
    p.hp = 20;
    const hb = GTP.Combat.spawnPickup({ type: 'health', value: 50, x: p.x + 1.5, z: p.z });
    const labels = []; hb.mesh.traverse((o) => { if (o.name === 'label') labels.push(o.material.map.image.width); });
    const bottle = hb.mesh.getObjectByName('bottle');
    GTP.Input.set('forward', false);
    GTP.game.debug.teleport(p.x + 1.5, p.z); GTP.game.advance(0.2);
    const health = { hp: p.hp, removed: hb.removed, labels: labels.length, bottle: !!bottle };
    // a weapon crate: the same bottle, relabeled, plus the gun on top
    const wc = GTP.Combat.spawnPickup({ type: 'weapon', weaponId: 'shotgun', ammo: 8, x: p.x + 1.5, z: p.z });
    const crateBottle = !!wc.mesh.getObjectByName('bottle'), crateLabels = []; wc.mesh.traverse((o) => { if (o.name === 'label') crateLabels.push(o); });
    GTP.game.debug.teleport(p.x + 1.5, p.z); GTP.game.advance(0.2);
    const crate = { weapon: p.weapon, ammo: p.weapons.shotgun, removed: wc.removed, crateBottle, labels: crateLabels.length, sponsor: GTP.Combat.SPONSOR.shotgun };
    // world pickups from the spawn table: the ungated ones exist, gated ones do not until the mission is done
    const world = []; GTP.Combat.pickups.forEach((v, k) => world.push({ k, type: v.pickupType, weaponId: v.weaponId, label: v.label || GTP.Combat.SPONSOR[v.pickupType === 'weapon' ? v.weaponId : v.pickupType] || null, persistent: v.persistent, removed: v.removed }));
    const gatedBefore = world.filter((w) => w.type === 'weapon').length;
    GTP.Missions.state.completed.add('m05_peer');
    GTP.game.advance(2.2);
    const gatedAfter = []; GTP.Combat.pickups.forEach((v) => { if (v.pickupType === 'weapon') gatedAfter.push(v.weaponId); });
    return { hasMesh, cash, health, crate, world: world.length, gatedBefore, gatedAfter, pickupsInList: GTP.Entities.byKind('pickup').length };
  }, { EAST, spot });
  console.log('  pickups: ' + JSON.stringify(pick));
  t.assert(pick.hasMesh && pick.cash.money === pick.cash.money0 + 75 && pick.cash.removed, 'a cash pickup under the player paid out: ' + JSON.stringify(pick.cash));
  t.assert(pick.health.hp === 70 && pick.health.removed && pick.health.bottle && pick.health.labels === 2, 'the health pickup is a labelled sponsor bottle that heals: ' + JSON.stringify(pick.health));
  t.assert(pick.crate.weapon === 'shotgun' && pick.crate.ammo === 8 && pick.crate.crateBottle && pick.crate.labels >= 2, 'the weapon crate arms the player and carries the relabeled bottle: ' + JSON.stringify(pick.crate));
  t.assert(pick.world >= 5 && pick.gatedBefore === 0 && pick.gatedAfter.indexOf('pistol') >= 0 && pick.gatedAfter.indexOf('smg') < 0, 'world pickups are act-gated by mission flags: ' + JSON.stringify([pick.world, pick.gatedBefore, pick.gatedAfter]));

  // ---- screenshots ----
  // aim mode by day: pistol, lock reticle on the nearer of two peds, crosshair
  await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player;
    GTP.game.debug.setClock(14);
    T_.setup(spot, EAST);
    GTP.game.debug.giveWeapon('pistol', 20);
    const a = T_.freeze(GTP.game.debug.spawnPed(spot.x + 7, spot.z - 1.2, null, 'thug')); a.yaw = Math.PI / 2;
    const b = T_.freeze(GTP.game.debug.spawnPed(spot.x + 11, spot.z + 2.2, null, 'civ')); b.yaw = Math.PI / 2;
    void p;
    GTP.game.advance(0.1);
    GTP.Input.set('aim', true); GTP.game.advance(0.8);
  }, { EAST, spot });
  await t.shot(page, 'combat_aim');
  const aimShot = await page.evaluate(() => ({ target: !!GTP.game.player.lockTarget, screen: GTP.Combat.aim.screen, ts: GTP.Combat.aim.targetScreen, armR: +GTP.game.player.mesh.getObjectByName('armR').rotation.x.toFixed(2) }));
  console.log('  aim shot: ' + JSON.stringify(aimShot));
  t.assert(aimShot.target && aimShot.armR > 1.3, 'the aim pose raises the arm forward and a target is locked');

  // a firefight at sunset: SMG vs three cops shooting back (2 stars), tracers both ways and a muzzle flash
  const fight = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player;
    GTP.Input.set('aim', false);
    GTP.game.debug.setClock(18.9);
    T_.setup(spot, EAST);
    GTP.game.debug.giveWeapon('smg', 300);
    // cops holding a line (roadblock brains stand and shoot instead of walking up for the bust)
    const cops = [[9, -3.2], [13, 3], [16, -0.4]].map(([dx, dz]) => { const c = GTP.AI.spawner.spawnPed(spot.x + dx, spot.z + dz, 'cop', { mode: 'roadblock' }); c.ai.ambient = false; c.ai.block = { released: false }; c.yaw = Math.PI / 2; return c; });
    GTP.game.debug.setWanted(2);
    GTP.Render.rig.yaw = EAST + 0.28; GTP.Render.rig.pitch = 0.1; GTP.Render.rig.snap();
    GTP.game.advance(1.2);
    let copShots = 0, frames = 0, tracersNow = 0;
    GTP.Events.on('damage', (e) => { if (e.target === p) copShots++; });
    GTP.Input.set('shoot', true);
    for (let i = 0; i < 90; i++) {
      GTP.game.advance(1 / 60); frames++;
      tracersNow = T_.fxCount('tracer');
      if (i > 20 && tracersNow >= 1 && T_.fxCount('explosion') > 0) break;
    }
    return { copShots, frames, tracersNow, copsAlive: cops.filter((c) => c.alive).length, copsAiming: cops.filter((c) => c.aiming).length, playerHp: p.hp, wanted: p.wanted, fired: cops.map((c) => c._fireT != null) };
  }, { EAST, spot });
  console.log('  firefight: ' + JSON.stringify(fight));
  await t.shot(page, 'combat_firefight');
  await page.evaluate(() => { GTP.Input.set('shoot', false); GTP.AI.wanted.clear(); GTP.game.advance(0.2); });
  t.assert(fight.tracersNow >= 1, 'tracers in the frame: ' + fight.tracersNow);
  t.assert(fight.fired.some((f) => f) || fight.copShots > 0, 'cops shot back at two stars: ' + JSON.stringify(fight.fired));
  const stats = await t.pixelStats(page);
  t.assert(stats.colors > 300, 'firefight shot is not monochrome: ' + JSON.stringify(stats));

  // ================================================================ the arsenal (GDD_EXPANSION 2) ====
  // ---- 10. every weapon fires, hurts (or pushes), spends ammo and sits in the hand ----
  const arsenal = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, out = {};
    GTP.game.debug.setClock(14);
    for (const id of CB.ORDER) {
      T_.setup(spot, EAST); GTP.AI.wanted.clear();
      p.weapons = { fist: Infinity }; p.ammo = {}; p.weapon = 'fist';
      const w = CB.WEAPONS[id];
      if (id !== 'fist') GTP.game.debug.giveWeapon(id, w.melee ? Infinity : 40);
      p.weapon = id;
      const dist = w.melee ? 1.3 : w.cone ? 3 : w.lobbed ? 9 : w.cls === 'shotgun' ? 5 : 8;
      const ped = T_.freeze(GTP.game.debug.spawnPed(spot.x + dist, spot.z, null, 'thug')); ped.yaw = Math.PI / 2; ped.hp = ped.maxHp = 1000; ped.hostile = true;
      GTP.game.advance(0.1);
      const hp0 = ped.hp, x0 = ped.x, ammo0 = p.weapons[id], a0 = Object.assign({}, CB.ammo(p, id));
      // the sniper and the launcher have no auto-target: they are aimed with the camera
      const aimed = !!(w.noAuto || w.scope);
      GTP.Render.rig.pitch = w.scope ? 0.06 : 0.1; GTP.Render.rig.snap();
      GTP.Input.set('aim', aimed); GTP.game.advance(aimed ? 0.5 : 0.3);
      GTP.Input.set('shoot', true); GTP.game.advance(w.cook ? 0.3 : w.spinUp ? 1.4 : 0.5); GTP.Input.set('shoot', false);
      GTP.game.advance(w.fuse ? w.fuse + 1.2 : w.splash ? (w.burn || 4) + 0.5 : (w.lobbed || w.rocket) ? 1.6 : 0.3);
      GTP.Input.set('aim', false); GTP.game.advance(0.1);
      const a1 = CB.ammo(p, id);
      out[id] = { dmg: +(hp0 - ped.hp).toFixed(1), moved: +Math.hypot(ped.x - x0, 0).toFixed(2), down: ped.knockedDown, ammoUsed: ammo0 === Infinity ? null : ammo0 - (p.weapons[id] || 0), held: !!(p._held && p._held.name === 'held'), mag: a0 && w.mag && w.mag > 1 ? [a0.mag, a1 ? a1.mag : null] : null, errors: GTP.errors.length, smoke: !!w.smoke, melee: !!w.melee, smokes: CB.smokes.length };
      GTP.Input.set('aim', false);
    }
    return out;
  }, { EAST, spot });
  console.log('  arsenal: ' + JSON.stringify(arsenal));
  for (const id of Object.keys(arsenal)) {
    const r = arsenal[id];
    if (id === 'megaphone') t.assert(r.moved > 2 && r.dmg === 0 && r.ammoUsed === 1, 'megaphone pushes without damage: ' + JSON.stringify(r));
    else if (r.smoke) t.assert(r.smokes >= 1 || r.ammoUsed >= 1, id + ' poured smoke: ' + JSON.stringify(r));
    else t.assert(r.dmg > 0, id + ' hurt the ped: ' + JSON.stringify(r));
    if (id !== 'fist') t.assert(r.held, id + ' mesh is in the hand');
    if (!r.melee) t.assert(r.ammoUsed >= 1, id + ' spent ammo: ' + JSON.stringify(r));
    if (r.mag) t.assert(r.mag[1] < r.mag[0], id + ' spent its magazine: ' + JSON.stringify(r.mag));
    t.assert(r.errors === 0, id + ' left no errors');
  }
  t.assert(Object.keys(arsenal).length >= 32, 'the arsenal has 32+ weapons: ' + Object.keys(arsenal).length);
  t.assert(arsenal.tableleg.dmg >= 32, 'the table leg hits for 32: ' + arsenal.tableleg.dmg);
  t.assert(arsenal.revolver.down, 'a Rebuttal body hit floors the ped');
  t.assert(arsenal.hotmic.dmg >= 25 && arsenal.hotmic.down, 'the hot mic blast hurt and floored the ped: ' + JSON.stringify(arsenal.hotmic));
  t.assert(arsenal.ratio.dmg >= 100, 'the rocket blast hit for triple digits: ' + arsenal.ratio.dmg);

  // ---- 11. magazines: an empty magazine reloads itself from the reserve, R reloads early, a switch cancels, the shotgun loads shell by shell ----
  const reload = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, A = GTP.Audio.counts;
    T_.setup(spot, EAST); GTP.AI.wanted.clear();
    p.weapons = { fist: Infinity }; p.ammo = {};
    GTP.game.debug.giveWeapon('pistol', 20);
    const ped = T_.freeze(GTP.game.debug.spawnPed(spot.x + 8, spot.z, null, 'thug')); ped.hp = ped.maxHp = 5000; ped.hostile = true;
    GTP.game.advance(0.1);
    const start = Object.assign({}, CB.ammo(p, 'pistol'));
    const ev = []; GTP.Events.on('reload', (e) => ev.push(e.phase));
    const r0 = A.reload || 0, d0 = A.reloadDone || 0;
    GTP.Input.set('shoot', true); GTP.game.advance(3.3);
    const empty = { mag: CB.ammo(p, 'pistol').mag, reserve: CB.ammo(p, 'pistol').reserve, reloading: p.reloadT > 0, hud: CB.hud().weapon.reloading, shots: p.stats.shots };
    GTP.Input.set('shoot', false); GTP.game.advance(1.3);
    const refilled = Object.assign({ total: p.weapons.pistol }, CB.ammo(p, 'pistol'));
    // a manual reload mid-magazine
    GTP.game.debug.giveWeapon('pistol', 24);
    const topped = Object.assign({}, CB.ammo(p, 'pistol'));
    GTP.Input.set('shoot', true); GTP.game.advance(0.6); GTP.Input.set('shoot', false); GTP.game.advance(0.05);
    const afterThree = Object.assign({}, CB.ammo(p, 'pistol'));
    GTP.Input.set('reload', true); GTP.game.advance(1 / 60); GTP.Input.set('reload', false);
    const manual = { reloading: p.reloadT > 0, t: +p.reloadT.toFixed(2), armR: null };
    GTP.game.advance(0.6); GTP.game.render(); manual.armR = +p.mesh.getObjectByName('armR').rotation.x.toFixed(2);
    GTP.game.advance(0.7);
    const manualDone = Object.assign({ reloading: p.reloadT > 0 }, CB.ammo(p, 'pistol'));
    // a switch cancels (rounds kept)
    GTP.Input.set('shoot', true); GTP.game.advance(0.6); GTP.Input.set('shoot', false); GTP.game.advance(0.05);
    GTP.Input.set('reload', true); GTP.game.advance(1 / 60); GTP.Input.set('reload', false);
    const before = Object.assign({ reloading: p.reloadT > 0 }, CB.ammo(p, 'pistol'));
    GTP.game.debug.giveWeapon('smg', 60); GTP.game.advance(0.1);
    const cancelled = { reloading: p.reloadT > 0, weapon: p.weapon, pistolMag: CB.ammo(p, 'pistol').mag };
    // the shotgun: shell by shell
    p.weapons = { fist: Infinity }; p.ammo = {}; GTP.game.debug.giveWeapon('shotgun', 10); GTP.game.advance(1.0);   // the per-ped cadence carries over a switch
    GTP.Input.set('shoot', true); GTP.game.advance(1.2); GTP.Input.set('shoot', false); GTP.game.advance(0.05);
    const sg0 = Object.assign({}, CB.ammo(p, 'shotgun'));
    GTP.Input.set('reload', true); GTP.game.advance(1 / 60); GTP.Input.set('reload', false);
    GTP.game.advance(0.5); const sg1 = CB.ammo(p, 'shotgun').mag;
    GTP.game.advance(0.45); const sg2 = CB.ammo(p, 'shotgun').mag;
    GTP.game.advance(0.5); const sg3 = Object.assign({ reloading: p.reloadT > 0 }, CB.ammo(p, 'shotgun'));
    return { start, empty, refilled, topped, afterThree, manual, manualDone, before, cancelled, sg: { sg0, sg1, sg2, sg3 }, ev, sfx: { reload: (A.reload || 0) - r0, done: (A.reloadDone || 0) - d0 } };
  }, { EAST, spot });
  console.log('  reload: ' + JSON.stringify(reload));
  t.assert(reload.start.mag === 12 && reload.start.reserve === 8, 'a fresh pistol with 20 rounds is 12 in the magazine, 8 in reserve: ' + JSON.stringify(reload.start));
  t.assert(reload.empty.mag === 0 && reload.empty.reserve === 8 && reload.empty.reloading && reload.empty.hud && reload.empty.shots >= 12, 'the magazine ran dry and the trigger started a reload: ' + JSON.stringify(reload.empty));
  t.assert(reload.refilled.mag === 8 && reload.refilled.reserve === 0 && reload.refilled.total === 8, 'the reload moved the reserve into the magazine: ' + JSON.stringify(reload.refilled));
  t.assert(reload.topped.mag === 12 && reload.topped.reserve === 20, 'new rounds fill the magazine first: ' + JSON.stringify(reload.topped));
  t.assert(reload.afterThree.mag <= 10 && reload.manual.reloading && reload.manual.t > 1 && reload.manual.armR < 1.3, 'R starts a reload with the forearm dropped: ' + JSON.stringify([reload.afterThree, reload.manual]));
  t.assert(!reload.manualDone.reloading && reload.manualDone.mag === 12 && reload.manualDone.reserve === 20 - (12 - reload.afterThree.mag), 'the manual reload refilled from the reserve: ' + JSON.stringify(reload.manualDone));
  t.assert(reload.before.reloading && !reload.cancelled.reloading && reload.cancelled.weapon === 'smg' && reload.cancelled.pistolMag === reload.before.mag, 'a weapon switch cancels the reload and keeps the rounds: ' + JSON.stringify([reload.before, reload.cancelled]));
  t.assert(reload.sg.sg0.mag <= 4 && reload.sg.sg1 === reload.sg.sg0.mag + 1 && reload.sg.sg2 === reload.sg.sg0.mag + 2 && reload.sg.sg3.mag === 6 && !reload.sg.sg3.reloading, 'the shotgun loads one shell every 0.45 s until full: ' + JSON.stringify(reload.sg));
  t.assert(reload.ev.indexOf('start') >= 0 && reload.ev.indexOf('done') >= 0 && reload.ev.indexOf('cancel') >= 0 && reload.sfx.reload >= 3 && reload.sfx.done >= 2, 'reload events and sfx fired: ' + JSON.stringify([reload.ev, reload.sfx]));

  // ---- 12. bloom: sustained SMG fire opens the cone, a pause closes it; recoil kicks the rig and recovers ----
  const bloom = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, R = GTP.Render.rig;
    T_.setup(spot, EAST); GTP.AI.wanted.clear();
    p.weapons = { fist: Infinity }; p.ammo = {}; GTP.game.debug.giveWeapon('smg', 300);
    GTP.game.advance(0.1);
    const k0 = CB.bloom.k, pitch0 = R.pitch;
    const pre = { weapon: p.weapon, ammo: CB.ammo(p, 'smg'), reloadT: p.reloadT, knocked: p.knockedDown, control: p.controlEnabled, cook: !!p._cook, wheel: CB.wheel.open, state: GTP.game.state, alive: p.alive, swimming: p.swimming, entering: !!p.entering, fireT: p._fireT, now: GTP.game.time.t };
    let maxK = 0, minPitch = 9;
    GTP.Input.set('shoot', true);
    for (let i = 0; i < 120; i++) { GTP.game.advance(1 / 60); maxK = Math.max(maxK, CB.bloom.k); minPitch = Math.min(minPitch, R.pitch); }
    const atFire = { k: +CB.bloom.k.toFixed(2), cone: +CB.bloom.cone.toFixed(4), hudBloom: CB.hud().bloom.k };
    GTP.Input.set('shoot', false); GTP.game.advance(1.2);
    const rested = { k: +CB.bloom.k.toFixed(3), cone: +CB.bloom.cone.toFixed(4), pitch: +R.pitch.toFixed(3), kickP: R.kickP };
    // a single revolver shot: the view jumps up (pitch drops) and comes back within a third of a second
    p.weapons = { fist: Infinity }; p.ammo = {}; GTP.game.debug.giveWeapon('revolver', 12); GTP.game.advance(0.2);
    const pBefore = R.pitch;
    GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false);
    const pKick = R.pitch; GTP.game.advance(0.5); const pAfter = R.pitch;
    return { pre, shots: p.stats.shots, k0, pitch0, maxK: +maxK.toFixed(2), minPitch: +minPitch.toFixed(3), atFire, rested, kick: { before: +pBefore.toFixed(3), kicked: +pKick.toFixed(3), after: +pAfter.toFixed(3), casings: CB.debug.casings.list.length } };
  }, { EAST, spot });
  console.log('  bloom: ' + JSON.stringify(bloom));
  t.assert(bloom.k0 === 0 && bloom.maxK > 0.6 && bloom.atFire.k > 0.6, 'two seconds of SMG fire opened the cone: ' + JSON.stringify(bloom.atFire));
  t.assert(bloom.rested.k < 0.05, 'a pause closed the cone again: ' + JSON.stringify(bloom.rested));
  t.assert(bloom.minPitch < bloom.pitch0 - 0.003, 'the SMG recoil lifted the view: ' + bloom.minPitch + ' < ' + bloom.pitch0);
  t.assert(bloom.kick.kicked < bloom.kick.before - 0.02 && Math.abs(bloom.kick.after - bloom.kick.before) < 0.01, 'the Rebuttal kicked the view up and it recovered: ' + JSON.stringify(bloom.kick));

  // ---- 13. hit zones: head x2 (revolver x3), legs x0.7; hit markers and the kill confirm ----
  const zones = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, R = GTP.Render.rig;
    T_.setup(spot, EAST); GTP.AI.wanted.clear();
    p.weapons = { fist: Infinity }; p.ammo = {}; GTP.game.debug.giveWeapon('pistol', 60);
    // the ped stands on the over-the-shoulder sight line (0.7 m right of the player's own line)
    const ped = T_.freeze(GTP.game.debug.spawnPed(spot.x + 6, spot.z + 0.7, null, 'thug')); ped.yaw = Math.PI / 2; ped.hp = ped.maxHp = 1000; ped.hostile = true;
    GTP.game.advance(0.1);
    // the raw trace: a ray at the head, the chest and the shins
    const o = { x: p.x, y: p.y + 1.3, z: p.z };
    const at = (y) => { const dx = ped.x - o.x, dy = ped.y + y - o.y, dz = ped.z - o.z, l = Math.hypot(dx, dy, dz); return CB.debug.trace(o, { x: dx / l, y: dy / l, z: dz / l }, 20, p); };
    const raw = { head: at(1.55).zone, torso: at(1.0).zone, legs: at(0.3).zone, hitPed: at(1.0).entity === ped };
    // through the sight: find the pitch that rests the crosshair on each zone, then one shot each (the aim assist off: it would pull
    // the sight onto the chest)
    CB.setAimAssist(false); const hs0 = p.stats.headshots || 0;
    const marks = []; GTP.Events.on('hitmarker', (e) => marks.push({ zone: e.zone, kill: e.kill }));
    // every pitch that rests the sight on the zone; the middle one (the shot leaves along the sight line, spread and all)
    const find = (zone) => {
      const ok = [];
      for (let pitch = -0.1; pitch < 0.45; pitch += 0.004) { R.pitch = pitch; R.snap(); GTP.game.advance(1 / 60); if (CB.aim.hover === ped && CB.aim.zone === zone && CB.aim.point && CB.aim.point.entity === ped && Math.abs(CB.aim.point.z - ped.z) < 0.5) ok.push(pitch); }
      if (!ok.length) return null;
      const mid = ok[Math.floor(ok.length / 2)]; R.pitch = mid; R.snap(); GTP.game.advance(1 / 60); GTP.game.advance(1 / 60);
      return mid;
    };
    GTP.Input.set('aim', true); GTP.game.advance(0.2);
    const shoot = (zone) => {
      const pitch = find(zone); if (pitch == null) return { zone, pitch: null };
      GTP.game.advance(0.7);   // the weapon's cadence
      const hp0 = ped.hp; GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false); GTP.game.advance(0.3);
      return { zone, pitch: +pitch.toFixed(3), dmg: +(hp0 - ped.hp).toFixed(1), texts: GTP.Render.fx.texts.map((t) => t.text) };
    };
    const head = shoot('head'), torso = shoot('torso'), legs = shoot('legs');
    // the Rebuttal's triple head shot and the kill confirm
    GTP.Input.set('aim', false); GTP.game.advance(0.1);
    p.weapons = { fist: Infinity }; p.ammo = {}; GTP.game.debug.giveWeapon('revolver', 12); GTP.game.advance(0.1);
    GTP.Input.set('aim', true); GTP.game.advance(0.2);
    const rev = shoot('head');
    ped.hp = 30; const hudBefore = CB.hud().hitmark;
    const kill = shoot('torso'); kill.alive = ped.alive; kill.hud = CB.hud().hitmark; kill.marks = marks.slice();
    GTP.Input.set('aim', false); GTP.game.advance(0.1);
    CB.setAimAssist(true);
    return { raw, head, torso, legs, rev, kill, hudBefore, headshots: (p.stats.headshots || 0) - hs0 };
  }, { EAST, spot });
  console.log('  zones: ' + JSON.stringify(zones));
  t.assert(zones.raw.head === 'head' && zones.raw.torso === 'torso' && zones.raw.legs === 'legs' && zones.raw.hitPed, 'the trace reports head / torso / legs zones: ' + JSON.stringify(zones.raw));
  t.assert(zones.head.pitch != null && zones.torso.pitch != null && zones.legs.pitch != null, 'the sight rests on every zone at 6 m: ' + JSON.stringify([zones.head.pitch, zones.torso.pitch, zones.legs.pitch]));
  t.assert(zones.head.dmg === 36 && zones.torso.dmg === 18 && Math.abs(zones.legs.dmg - 12.6) < 0.05, 'pistol: head 36, torso 18, legs 12.6: ' + JSON.stringify([zones.head.dmg, zones.torso.dmg, zones.legs.dmg]));
  t.assert(zones.head.texts.indexOf('WRITE THAT DOWN') >= 0, 'a head shot says WRITE THAT DOWN');
  t.assert(zones.rev.dmg === 120, 'the Rebuttal head shot is x3 (120): ' + zones.rev.dmg);
  t.assert(!zones.kill.alive && zones.kill.hud && zones.kill.hud.kill && zones.kill.texts.indexOf('RATIO\'D') >= 0, 'the kill confirm: hud hitmark kill + RATIO\'D over the victim: ' + JSON.stringify(zones.kill.hud));
  t.assert(zones.kill.marks.length >= 5 && zones.kill.marks[0].zone === 'head' && zones.kill.marks[zones.kill.marks.length - 1].kill, 'hitmarker events carry the zone and the kill: ' + JSON.stringify(zones.kill.marks));
  t.assert(zones.headshots === 2, 'stats.headshots counts the head hits (QA CMB-14): ' + zones.headshots);

  // ---- 14. the hot mic: it bounces, the ON AIR cap blinks, the fuse blasts peds and wrecks a van ----
  const mic = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat;
    T_.setup(spot, EAST); GTP.AI.wanted.clear();
    p.weapons = { fist: Infinity }; p.ammo = {}; GTP.game.debug.giveWeapon('hotmic', 4);
    // the van sits on the over-the-shoulder sight line; the ped stands 3.6 m from it, inside the blast
    const ped = T_.freeze(GTP.game.debug.spawnPed(spot.x + 11, spot.z + 4, null, 'thug')); ped.hp = ped.maxHp = 1000; ped.hostile = true;
    const van = GTP.game.debug.spawnVehicle(spot.x + 12.5, spot.z + 0.4, 'van', { yaw: 0 });
    GTP.game.advance(0.1);
    const hp0 = ped.hp, vhp0 = van.hp, ammo0 = p.weapons.hotmic;
    GTP.Render.rig.pitch = 0.05; GTP.Render.rig.snap();
    GTP.Input.set('aim', true); GTP.game.advance(0.2);
    const hover = CB.aim.hover === van;
    GTP.Input.set('shoot', true); GTP.game.advance(0.4);   // cooked for 0.4 s
    const cook = CB.hud().cook ? +CB.hud().cook.t.toFixed(2) : null;
    GTP.Input.set('shoot', false); GTP.game.advance(1 / 60); GTP.Input.set('aim', false);
    const pr = GTP.Entities.byKind('projectile')[0];
    const out = { hover, cook, isMic: pr instanceof CB.HotMic, fuse0: pr ? +pr.fuse.toFixed(2) : null, bounces: 0, rest: false, capBlinks: 0, blastAt: -1, maxY: 0, ammo: p.weapons.hotmic, ammo0 };
    let lastCap = null, tt = 0;
    for (let i = 0; i < 90 && !pr.removed; i++) {
      GTP.game.advance(0.05); tt += 0.05; GTP.game.render();
      out.bounces = Math.max(out.bounces, pr.bounces); out.rest = out.rest || pr.rest; out.maxY = Math.max(out.maxY, pr.y - p.y);
      const cap = pr._cap ? pr._cap.material.color.getHex() : null; if (cap != null && lastCap != null && cap !== lastCap) out.capBlinks++; lastCap = cap;
      if (pr.removed) out.blastAt = +tt.toFixed(2);
    }
    GTP.game.advance(0.3);
    out.ped = { dmg: +(hp0 - ped.hp).toFixed(1), down: ped.knockedDown };
    out.van = { dmg: +(vhp0 - van.hp).toFixed(1), burning: van.burning, wreck: van.wreck };
    out.texts = GTP.Render.fx.texts.map((t) => t.text); out.explosions = T_.fxCount('explosion');
    return out;
  }, { EAST, spot });
  console.log('  hot mic: ' + JSON.stringify(mic));
  t.assert(mic.cook > 0.3 && mic.isMic && mic.fuse0 < 2.2 && mic.fuse0 > 1.8, 'the mic cooked in the hand and left with what was left of the fuse: ' + JSON.stringify([mic.cook, mic.fuse0]));
  t.assert(mic.bounces >= 1 && mic.maxY > 1.5, 'it flew and bounced: ' + JSON.stringify([mic.bounces, mic.maxY]));
  t.assert(mic.capBlinks >= 4, 'the ON AIR cap blinked on the way: ' + mic.capBlinks);
  t.assert(mic.blastAt > 1.5 && mic.blastAt < 2.6, 'the fuse went at about two seconds: ' + mic.blastAt);
  t.assert(mic.ped.dmg >= 25 && mic.ped.down, 'the blast hurt and floored the ped: ' + JSON.stringify(mic.ped));
  t.assert(mic.van.dmg >= 120 || mic.van.burning || mic.van.wreck, 'one mic wrecks a parked van: ' + JSON.stringify(mic.van));
  t.assert(mic.ammo === mic.ammo0 - 1 && mic.texts.indexOf('HOT MIC') >= 0, 'one mic spent, the text fx said so: ' + JSON.stringify([mic.ammo, mic.texts]));

  // ---- 15. the Ratio Launcher: the rocket flies straight, a direct hit wrecks the car and the blast flips it ----
  const rocket = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, R = GTP.Render.rig;
    GTP.game.debug.setClock(18.6);
    T_.setup(spot, EAST); GTP.AI.wanted.clear();
    p.weapons = { fist: Infinity }; p.ammo = {}; GTP.game.debug.giveWeapon('ratio', 3);
    const v = GTP.game.debug.spawnVehicle(spot.x + 17, spot.z + 1, 'sedan', { yaw: 0 });
    const d = GTP.game.debug.spawnPed(spot.x + 17, spot.z + 4, null, 'thug'); d.hostile = true; v.enter(d, 0); T_.freeze(d);
    GTP.game.advance(0.2);
    R.yaw = EAST; R.pitch = 0.08; R.snap();
    GTP.Input.set('aim', true); GTP.game.advance(0.3);
    const lock = { target: CB.aim.target === v, weapon: CB.aim.weapon, mag: CB.ammo(p, 'ratio').mag, reserve: CB.ammo(p, 'ratio').reserve };
    let exploded = false; GTP.Events.on('vehicle:exploded', (e) => { if (e.vehicle === v) exploded = true; });
    const x0 = p.x;
    GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false);
    const pr = GTP.Entities.byKind('projectile')[0];
    const out = { lock, isRocket: pr instanceof CB.Rocket, speed: pr ? +Math.hypot(pr.vx, pr.vy, pr.vz).toFixed(1) : null, trail: 0, hitAt: -1, airborne: false, maxRoll: 0, maxY: 0, explodedAt: -1, backblast: 0 };
    let tt = 0;
    for (let i = 0; i < 40; i++) {
      GTP.game.advance(1 / 30); tt += 1 / 30;
      out.trail = Math.max(out.trail, T_.fxCount('smoke'));
      if (pr.removed && out.hitAt < 0) out.hitAt = +tt.toFixed(2);
      if (exploded && out.explodedAt < 0) out.explodedAt = +tt.toFixed(2);
      if (!v.onGround) out.airborne = true;
      out.maxRoll = Math.max(out.maxRoll, Math.abs(v.roll)); out.maxY = Math.max(out.maxY, v.y);
      if (out.explodedAt > 0 && tt > out.explodedAt + 0.08) break;
    }
    out.backblast = +(x0 - p.x).toFixed(2);
    out.texts = GTP.Render.fx.texts.map((t) => t.text);
    out.ammo = Object.assign({ total: p.weapons.ratio, reloading: p.reloadT > 0 }, CB.ammo(p, 'ratio') || {});
    return out;
  }, { EAST, spot });
  console.log('  rocket: ' + JSON.stringify(rocket));
  await t.shot(page, 'combat_rocket_blast');
  const rocketFlip = await page.evaluate(() => { const out = { maxRoll: 0, maxY: 0, airborne: false }; for (let i = 0; i < 40; i++) { GTP.game.advance(1 / 30); GTP.Entities.byKind('vehicle').forEach((v) => { if (v.wreck && Math.abs(v.roll) > out.maxRoll) out.maxRoll = Math.abs(v.roll); if (v.wreck && v.y > out.maxY) out.maxY = v.y; if (v.wreck && !v.onGround) out.airborne = true; }); } GTP.Input.set('aim', false); GTP.game.advance(0.2); return out; });
  console.log('  rocket flip: ' + JSON.stringify(rocketFlip));
  t.assert(rocket.lock.target && rocket.lock.mag === 1 && rocket.lock.reserve === 2, 'the launcher locks a driven car, one rocket in the tube: ' + JSON.stringify(rocket.lock));
  t.assert(rocket.isRocket && rocket.speed > 38 && rocket.speed < 42 && rocket.trail >= 3, 'a 40 m/s rocket with a smoke trail: ' + JSON.stringify([rocket.isRocket, rocket.speed, rocket.trail]));
  t.assert(rocket.hitAt > 0.2 && rocket.hitAt < 0.8 && rocket.explodedAt > 0, 'a direct hit wrecked the sedan at once: ' + JSON.stringify([rocket.hitAt, rocket.explodedAt]));
  t.assert((rocket.airborne || rocketFlip.airborne) && Math.max(rocket.maxRoll, rocketFlip.maxRoll) > 1.5, 'the blast flipped the car: ' + JSON.stringify([rocket.airborne, rocket.maxRoll, rocketFlip]));
  t.assert(rocket.backblast > 0.5 && rocket.texts.indexOf('RATIO\'D') >= 0, 'the backblast pushed the shooter and the blast said RATIO\'D: ' + JSON.stringify([rocket.backblast, rocket.texts]));
  t.assert(rocket.ammo.total === 2 && rocket.ammo.reloading, 'the tube reloads after the shot: ' + JSON.stringify(rocket.ammo));

  // ---- 16. the sniper scope: first-person sight, fov 30 / 15, the body hidden, released with the chase rig back ----
  const scope = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, R = GTP.Render;
    GTP.game.debug.setClock(14);
    T_.setup(spot, EAST); GTP.AI.wanted.clear();
    p.weapons = { fist: Infinity }; p.ammo = {}; GTP.game.debug.giveWeapon('sniper', 10);
    const ped = T_.freeze(GTP.game.debug.spawnPed(spot.x + 40, spot.z, null, 'thug')); ped.yaw = Math.PI / 2; ped.hp = ped.maxHp = 1000; ped.hostile = true;
    GTP.game.advance(0.2);
    const ev = []; GTP.Events.on('scope', (e) => ev.push([e.active, e.zoom]));
    const fov0 = R.camera.fov, cam0 = p.cameraMode;
    GTP.Input.set('aim', true); GTP.game.advance(0.7); GTP.game.render();
    const on = { active: CB.scope.active, zoom: CB.scope.zoom, fov: +R.camera.fov.toFixed(1), cameraMode: p.cameraMode, bodyHidden: !p.mesh.visible, hud: !!CB.hud().scope, lock: p.lockTarget, range: Math.round(CB.scope.range), eyeHeight: +(R.camera.position.y - p.y).toFixed(2) };
    GTP.Input.set('weaponNext', true); GTP.game.advance(1 / 60); GTP.Input.set('weaponNext', false); GTP.game.advance(0.7);
    const zoomed = { zoom: CB.scope.zoom, fov: +R.camera.fov.toFixed(1), weapon: p.weapon };
    // a scoped shot hits at 40 m
    const hp0 = ped.hp; R.rig.pitch = 0.0; R.rig.snap();
    const ks = []; for (let k = -0.06; k <= 0.08; k += 0.002) { R.rig.pitch = k; R.rig.snap(); GTP.game.advance(1 / 60); if (CB.aim.hover === ped) ks.push(k); }
    let hit = ks.length ? 1 : 0; if (hit) { R.rig.pitch = ks[Math.floor(ks.length / 2)]; R.rig.snap(); GTP.game.advance(1 / 60); GTP.game.advance(1 / 60); }   // the middle of the body
    const range = Math.round(CB.scope.range);
    GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false); GTP.game.advance(0.2);
    const shot = { hovered: hit, range, dmg: +(hp0 - ped.hp).toFixed(1), casingsSoon: CB.debug.casings.list.length };
    GTP.game.advance(0.4); shot.casingsLater = CB.debug.casings.list.length;
    return { fov0, cam0, on, zoomed, shot, ev };
  }, { EAST, spot });
  console.log('  scope: ' + JSON.stringify(scope));
  await t.shot(page, 'combat_scope');
  const unscoped = await page.evaluate(() => { const p = GTP.game.player, CB = GTP.Combat, R = GTP.Render; GTP.Input.set('aim', false); GTP.game.advance(0.8); return { active: CB.scope.active, cameraMode: p.cameraMode, fov: +R.camera.fov.toFixed(1), weapon: p.weapon }; });
  console.log('  unscoped: ' + JSON.stringify(unscoped));
  t.assert(scope.on.active && scope.on.zoom === 2 && scope.on.fov < 33 && scope.on.cameraMode === 'first' && scope.on.bodyHidden && scope.on.hud && !scope.on.lock, 'holding aim with the sniper scopes at 2x with the body hidden and no lock: ' + JSON.stringify(scope.on));
  t.assert(scope.on.eyeHeight > 1.3 && scope.on.eyeHeight < 1.9 && scope.on.range > 5, 'the scope sits at eye height and reads a range: ' + JSON.stringify(scope.on));
  t.assert(scope.zoomed.zoom === 4 && scope.zoomed.fov < 17 && scope.zoomed.weapon === 'sniper', 'the wheel toggles 4x without switching weapons: ' + JSON.stringify(scope.zoomed));
  t.assert(scope.shot.hovered && scope.shot.range > 30 && scope.shot.range < 50 && scope.shot.dmg >= 84, 'a scoped shot lands at 40 m and the readout says so: ' + JSON.stringify(scope.shot));
  t.assert(scope.shot.casingsSoon === 0 && scope.shot.casingsLater >= 1, 'the sniper ejects its casing a beat after the shot: ' + JSON.stringify(scope.shot));
  t.assert(!unscoped.active && unscoped.cameraMode === scope.cam0 && unscoped.fov > 50 && unscoped.weapon === 'sniper' && scope.ev.length >= 2 && scope.ev[1][1] === 4, 'releasing aim restores the chase rig; scope events reported the zoom: ' + JSON.stringify([unscoped, scope.ev]));

  // ---- 17. drive-by: the pistol hits a ped from a moving car; the rifle refuses with a toast; a hot take goes out of the window without aim ----
  const driveby = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, R = GTP.Render.rig, U = GTP.util;
    T_.setup(spot, EAST); GTP.AI.wanted.clear();
    p.weapons = { fist: Infinity }; p.ammo = {}; GTP.game.debug.giveWeapon('pistol', 24); GTP.game.debug.giveWeapon('rifle', 30); GTP.game.debug.giveWeapon('hottake', 3); p.weapon = 'pistol';
    const v = GTP.game.debug.spawnVehicle(spot.x + 1, spot.z, 'sedan', { yaw: EAST });
    GTP.game.advance(0.1); p.enterVehicle(v, 0); GTP.game.advance(1.0);
    const ped = T_.freeze(GTP.game.debug.spawnPed(spot.x + 14, spot.z - 4, null, 'thug')); ped.hostile = true; ped.hp = ped.maxHp = 1000;
    GTP.game.advance(0.1);
    const hp0 = ped.hp, vhp0 = v.hp, shots0 = p.stats.shots;
    GTP.Input.set('forward', true); GTP.game.advance(0.6);
    R.yaw = U.dirToYaw(ped.x - v.x, ped.z - v.z); R.pitch = 0.08; R.snap();
    GTP.Input.set('aim', true); GTP.game.advance(0.15);
    let maxSpeed = 0; const x0 = v.x;
    GTP.Input.set('shoot', true);
    for (let i = 0; i < 70; i++) { GTP.game.advance(1 / 60); maxSpeed = Math.max(maxSpeed, Math.abs(v.speed)); R.yaw = U.dirToYaw(ped.x - v.x, ped.z - v.z); }
    GTP.Input.set('shoot', false);
    const pistol = { inCar: p.inVehicle === v, shots: p.stats.shots - shots0, pedDmg: +(hp0 - ped.hp).toFixed(1), carDmg: +(vhp0 - v.hp).toFixed(1), moved: +(v.x - x0).toFixed(1), maxSpeed: +maxSpeed.toFixed(1), aimActive: CB.aim.active };
    // the rifle refuses
    p.weapon = 'rifle'; GTP.game.advance(0.1);
    const s2 = p.stats.shots; GTP.game.advance(0.5); GTP.Input.set('shoot', true); GTP.game.advance(0.5); GTP.Input.set('shoot', false);
    const last = GTP.UI.state.toasts[GTP.UI.state.toasts.length - 1];
    const rifle = { shots: p.stats.shots - s2, aimActive: CB.aim.active, toast: last ? last.text : '' };
    GTP.Input.set('aim', false);
    // a hot take out of the window with no aim held
    p.weapon = 'hottake'; GTP.game.advance(0.1);
    GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false);
    const take = { thrown: GTP.Entities.byKind('projectile').length, ammo: p.weapons.hottake, inCar: p.inVehicle === v };
    GTP.Input.set('forward', false); GTP.game.advance(1.5);
    p.exitVehicle(); GTP.game.advance(0.3);
    return { pistol, rifle, take };
  }, { EAST, spot });
  console.log('  drive-by: ' + JSON.stringify(driveby));
  t.assert(driveby.pistol.inCar && driveby.pistol.shots >= 3 && driveby.pistol.pedDmg >= 18 && driveby.pistol.carDmg === 0, 'the pistol drive-by hit the ped and never the player\'s own car: ' + JSON.stringify(driveby.pistol));
  t.assert(driveby.pistol.maxSpeed > 4 && driveby.pistol.moved > 4, 'the car kept driving through the drive-by: ' + JSON.stringify(driveby.pistol));
  t.assert(driveby.rifle.shots === 0 && !driveby.rifle.aimActive && /Respectfully/.test(driveby.rifle.toast), 'the rifle refuses from the driver\'s seat: ' + JSON.stringify(driveby.rifle));
  t.assert(driveby.take.thrown === 1 && driveby.take.ammo === 2 && driveby.take.inCar, 'a hot take goes out of the window without aim: ' + JSON.stringify(driveby.take));

  // ---- 18. the weapon wheel: a tap does nothing, a hold opens it, the mouse picks a segment, release equips; the world runs at 0.2x ----
  const wheel = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat;
    T_.setup(spot, EAST); GTP.AI.wanted.clear();
    p.weapons = { fist: Infinity, pistol: 20, smg: 30 }; p.ammo = {}; p.weapon = 'fist';
    GTP.game.advance(0.1);
    const ev = []; GTP.Events.on('wheel', (e) => ev.push([e.open, e.id, e.equipped || null]));
    GTP.Input.set('lockOn', true); GTP.game.advance(0.1); GTP.Input.set('lockOn', false); GTP.game.advance(0.1);
    const tap = { open: CB.wheel.open, weapon: p.weapon, events: ev.length };
    const t0 = GTP.game.time.t;
    GTP.Input.set('lockOn', true); GTP.game.advance(0.3);
    const held = { open: CB.wheel.open, index: CB.wheel.index, id: CB.hud().wheel.id, segments: CB.hud().wheel.segments.length, owned: CB.hud().wheel.segments.filter((s) => s.owned).map((s) => s.id) };
    const t1 = GTP.game.time.t;
    GTP.game.advance(1.0);
    const slow = +(GTP.game.time.t - t1).toFixed(3);
    GTP.Input.setLook(40, 0); GTP.game.advance(0.1);   // right = 90 degrees = segment 3 (the pistol)
    const picked = { index: CB.wheel.index, id: CB.hud().wheel.id, weaponStill: p.weapon };
    GTP.Input.set('lockOn', false); GTP.game.advance(0.1);
    const released = { open: CB.wheel.open, weapon: p.weapon };
    const t2 = GTP.game.time.t; GTP.game.advance(0.5); const normal = +(GTP.game.time.t - t2).toFixed(3);
    // an unowned segment leaves the weapon alone; [ ] steps the ring
    GTP.Input.set('lockOn', true); GTP.game.advance(0.3);
    GTP.Input.setLook(0, 40); GTP.game.advance(0.1);   // down = 180 degrees = segment 6 (the rifle, unowned)
    const unowned = { index: CB.wheel.index, id: CB.hud().wheel.id };
    GTP.Input.set('weaponPrev', true); GTP.game.advance(1 / 60); GTP.Input.set('weaponPrev', false); GTP.game.advance(0.05);
    const stepped = { index: CB.wheel.index, id: CB.hud().wheel.id };
    GTP.Input.set('lockOn', false); GTP.game.advance(0.1);
    const kept = { open: CB.wheel.open, weapon: p.weapon };
    return { tap, held, slow, picked, released, normal, unowned, stepped, kept, ev, t0 };
  }, { EAST, spot });
  console.log('  wheel: ' + JSON.stringify(wheel));
  t.assert(!wheel.tap.open && wheel.tap.weapon === 'fist' && wheel.tap.events === 0, 'a short Tab tap does not open the wheel');
  t.assert(wheel.held.open && wheel.held.index === 0 && wheel.held.id === 'fist' && wheel.held.segments === 12 && wheel.held.owned.join(',') === 'fist,pistol,smg', 'holding Tab opens the twelve-slot wheel on the held weapon: ' + JSON.stringify(wheel.held));
  t.assert(wheel.slow > 0.1 && wheel.slow < 0.3, 'the world runs at about 0.2x while the wheel is open: ' + wheel.slow + ' s of a 1 s advance');
  t.assert(wheel.picked.index === 3 && wheel.picked.id === 'pistol' && wheel.picked.weaponStill === 'fist', 'the mouse picks the pistol segment without equipping yet: ' + JSON.stringify(wheel.picked));
  t.assert(!wheel.released.open && wheel.released.weapon === 'pistol' && Math.abs(wheel.normal - 0.5) < 0.02, 'release equips the pistol and time runs normally again: ' + JSON.stringify([wheel.released, wheel.normal]));
  t.assert(wheel.unowned.id === 'rifle' && wheel.stepped.id === 'smg' && wheel.kept.weapon === 'smg', 'an unowned segment can be stepped off with [ and equips what is owned: ' + JSON.stringify([wheel.unowned, wheel.stepped, wheel.kept]));
  t.assert(wheel.ev.some((e) => e[0] === false && e[2] === 'pistol'), 'wheel events report the equip: ' + JSON.stringify(wheel.ev));

  // ---- 19. Both Sides Arms: the shop API (locked, owned, funds, ammo, gear, discounts) and the door marker ----
  const shop = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, W = GTP.World;
    T_.setup(spot, EAST); GTP.AI.wanted.clear();
    let lm = W.landmarks.filter((l) => l.kind === 'gunshop')[0];
    if (!lm) { lm = { id: 'both_sides_test', name: 'Both Sides Arms (Test)', kind: 'gunshop', x: spot.x + 6, z: spot.z + 8, door: { x: spot.x + 6, z: spot.z + 3, y: 0 }, flagship: true }; W.landmarks.push(lm); W._lm[lm.id] = lm; }
    const stores = CB.shop.refresh().map((s) => s.id);
    p.weapons = { fist: Infinity }; p.ammo = {}; p.weapon = 'fist'; p.money = 2000; p.hp = 40; p.armor = 0;
    GTP.Missions.state.completed.add('m03b_range');
    const items = CB.shop.items();
    const pistolItem = items.filter((i) => i.id === 'pistol')[0], sniperItem = items.filter((i) => i.id === 'sniper')[0];
    const buys = {};
    buys.pistol = CB.shop.buy('pistol'); buys.pistolState = { money: p.money, ammo: p.weapons.pistol, weapon: p.weapon, mag: CB.ammo(p, 'pistol').mag };
    buys.again = CB.shop.buy('pistol').reason;
    buys.sniper = CB.shop.buy('sniper');
    buys.ammo = CB.shop.buy('ammo_pistol'); buys.ammoState = { money: p.money, ammo: p.weapons.pistol };
    buys.pellets = CB.shop.buy('clarity_pellets'); buys.hp = p.hp;
    buys.vest = CB.shop.buy('firmness_vest'); buys.armor = p.armor; buys.moneyAfter = p.money;
    p.money = 10; buys.poor = CB.shop.buy('ammo_pistol');
    const XS = GTP.Content.expansion.shop, d0 = XS.discount; XS.discount = () => 0.5; const disc = CB.shop.items().filter((i) => i.id === 'pistol')[0].price; XS.discount = d0;
    const flagshipRefusal = CB.shop.buy('range_reset').reason;   // the shop is not open: no flagship
    // the door marker (the store's green light, 3.2 m along the wall from the door so a mission light can hold the door itself):
    // stand in it on foot for half a second
    const opened = []; GTP.Events.on('shop:open', (e) => opened.push(e.landmark && e.landmark.id));
    const st = CB.shop.stores().find((s) => s.id === lm.id) || { x: lm.door.x, z: lm.door.z };
    GTP.game.debug.teleport(st.x, st.z); GTP.game.advance(0.8);
    const entry = { opened: opened.slice(), state: Object.assign({}, CB.shop.state, { landmark: CB.shop.state.landmark && CB.shop.state.landmark.id, store: CB.shop.state.store && CB.shop.state.store.id }), markers: CB.shop._markers.length };
    p.money = 100; const range = CB.shop.buy('range_reset');
    CB.shop.close();
    GTP.game.advance(0.6); const reopen = opened.length;   // still standing in it: it does not re-open until the player leaves
    GTP.game.debug.teleport(st.x + 6, st.z + 6); GTP.game.advance(0.2); GTP.game.debug.teleport(st.x, st.z); GTP.game.advance(0.8);
    const reopened = opened.length; CB.shop.close();
    return { stores, lmId: lm.id, pistolItem: { price: pistolItem.price, locked: pistolItem.locked, owned: pistolItem.owned, stats: !!pistolItem.stats }, sniperItem: { locked: sniperItem.locked, lockedBy: sniperItem.lockedBy }, buys, disc, flagshipRefusal, entry, range: range.ok, reopen, reopened };
  }, { EAST, spot });
  console.log('  shop: ' + JSON.stringify(shop));
  t.assert(shop.stores.indexOf(shop.lmId) >= 0 && shop.entry.markers >= 1, 'every gunshop landmark is a store with a door marker: ' + JSON.stringify(shop.stores));
  t.assert(shop.pistolItem.price === 450 && !shop.pistolItem.locked && !shop.pistolItem.owned && shop.pistolItem.stats, 'the pistol is listed at $450 and unlocked after m03b: ' + JSON.stringify(shop.pistolItem));
  t.assert(shop.buys.pistol.ok && shop.buys.pistolState.money === 1550 && shop.buys.pistolState.ammo === 24 && shop.buys.pistolState.weapon === 'pistol' && shop.buys.pistolState.mag === 12, 'buying the pistol costs $450 and gives a magazine and a spare: ' + JSON.stringify(shop.buys.pistolState));
  t.assert(shop.buys.again === 'owned' && shop.buys.sniper.reason === 'locked' && shop.sniperItem.locked && typeof shop.sniperItem.lockedBy === 'string', 'an owned weapon and a locked one refuse with reasons: ' + JSON.stringify([shop.buys.again, shop.buys.sniper.reason, shop.sniperItem]));
  t.assert(shop.buys.ammo.ok && shop.buys.ammoState.ammo === 48 && shop.buys.ammoState.money === 1490, 'pistol rounds: 24 for $60: ' + JSON.stringify(shop.buys.ammoState));
  t.assert(shop.buys.pellets.ok && shop.buys.hp === 90 && shop.buys.vest.ok && shop.buys.armor === 100 && shop.buys.moneyAfter === 1490 - 150 - 500, 'gear heals and armours: ' + JSON.stringify([shop.buys.hp, shop.buys.armor, shop.buys.moneyAfter]));
  t.assert(shop.buys.poor.reason === 'funds' && shop.buys.poor.need === 50, 'insufficient funds says how much is missing: ' + JSON.stringify(shop.buys.poor));
  t.assert(shop.disc === 270 && shop.flagshipRefusal === 'flagship', 'discounts cap at 40%, the range needs the flagship: ' + JSON.stringify([shop.disc, shop.flagshipRefusal]));
  t.assert(shop.entry.opened.length === 1 && shop.entry.opened[0] === shop.lmId && shop.entry.state.open && shop.entry.state.landmark === shop.lmId, 'standing in the door marker opens the shop (shop:open): ' + JSON.stringify(shop.entry));
  t.assert(shop.range && shop.reopen === 1 && shop.reopened === 2, 'the range reset sells at the flagship; the marker re-arms only after leaving it: ' + JSON.stringify([shop.range, shop.reopen, shop.reopened]));

  // ================================================================ v0.3 shooting track ====
  // ---- 20. QA round 1, the shop: ammo needs the weapon (STR-09 / CMB-02), weapon starts (STR-14), the rampage_king cap (STR-15),
  // one discount rule (STR-08) ----
  const qashop = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, Ms = GTP.Missions.state;
    T_.setup(spot, EAST); GTP.AI.wanted.clear(); CB.syncArsenal();
    ['m13_thursday', 'm12b_scope', 'm09_balloon', 'm09b_hotmic', 'm03_ratio', 'm03b_range', 'm08b_jets'].forEach((id) => Ms.completed.add(id));
    const out = {};
    p.weapons = { fist: Infinity }; p.ammo = {}; p.money = 20000;
    out.ratioAmmo = CB.shop.buy('ammo_ratio').reason; out.sniperAmmo = CB.buy('ammo_sniper').reason;
    out.after = { ratio: p.weapons.ratio || 0, sniper: p.weapons.sniper || 0, money: p.money };
    const it = CB.shop.items('ammo').filter((i) => i.id === 'ammo_rifle')[0], ci = CB.catalog().filter((i) => i.id === 'ammo_rifle')[0];
    out.item = { canBuy: it.canBuy, needs: it.needsWeapon, locked: ci.locked, reason: ci.lockReason };
    p.weapons = { fist: Infinity }; p.ammo = {}; p.money = 20000;
    CB.shop.buy('megaphone'); CB.shop.buy('hottake'); CB.shop.buy('hotmic');
    out.starts = { megaphone: p.weapons.megaphone, hottake: p.weapons.hottake, hotmic: p.weapons.hotmic };
    p.weapons = { fist: Infinity, pistol: 132 }; p.ammo = {};
    out.full = CB.shop.buy('ammo_pistol').reason;
    Ms.flags.rampage_king = true; out.king = CB.shop.buy('ammo_pistol').ok; out.kingAmmo = p.weapons.pistol; out.kingCap = CB.ammoCap(p, 'pistol'); delete Ms.flags.rampage_king;
    out.cap = CB.ammoCap(p, 'pistol');
    Ms.flags.memo_discount = true; out.memo = CB.shop.discount();
    Ms.flags.sponsor_discount = true; out.both = CB.shop.discount(); delete Ms.flags.memo_discount;
    out.tier = CB.shop.discount(); delete Ms.flags.sponsor_discount;
    out.none = CB.shop.discount();
    return out;
  }, { EAST, spot });
  console.log('  qa shop: ' + JSON.stringify(qashop));
  t.assert(qashop.ratioAmmo === 'notOwned' && qashop.sniperAmmo === 'notOwned' && qashop.after.ratio === 0 && qashop.after.sniper === 0 && qashop.after.money === 20000, 'ammo for an unowned weapon is refused and gives nothing (STR-09 / CMB-02): ' + JSON.stringify(qashop));
  t.assert(!qashop.item.canBuy && qashop.item.needs && qashop.item.locked && /Buy the weapon first/.test(qashop.item.reason), 'the ammo row is greyed with a reason: ' + JSON.stringify(qashop.item));
  t.assert(qashop.starts.megaphone === 20 && qashop.starts.hottake === 3 && qashop.starts.hotmic === 1, 'weapon purchases give a sensible start (STR-14): ' + JSON.stringify(qashop.starts));
  t.assert(qashop.full === 'full' && qashop.king && qashop.kingAmmo === 156 && qashop.kingCap === 192 && qashop.cap === 132, 'rampage_king raises the reserve cap by half (STR-15): ' + JSON.stringify(qashop));
  t.assert(Math.abs(qashop.memo - 0.15) < 1e-9 && Math.abs(qashop.both - 0.4) < 1e-9 && Math.abs(qashop.tier - 0.25) < 1e-9 && qashop.none === 0, 'discounts count once: memos 15%, tier 3 25%, both 40% (STR-08): ' + JSON.stringify([qashop.memo, qashop.tier, qashop.both]));

  // ---- 21. QA round 1, combat ----
  const qa = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, out = {};
    const fresh = (id, n) => { T_.setup(spot, EAST); GTP.AI.wanted.clear(); p.weapons = { fist: Infinity }; p.ammo = {}; p.weapon = 'fist'; if (id) GTP.game.debug.giveWeapon(id, n); GTP.game.advance(0.1); };
    const thug = (dx, dz, hp) => { const e = T_.freeze(GTP.game.debug.spawnPed(spot.x + dx, spot.z + dz, null, 'thug')); e.hostile = true; e.yaw = Math.PI / 2; if (hp) e.hp = e.maxHp = hp; return e; };
    // CMB-04: the muzzle light is in the scene at rest
    out.light = { exists: !!GTP.Render.muzzleLight, inScene: !!(GTP.Render.muzzleLight && GTP.Render.muzzleLight.parent), intensity: GTP.Render.muzzleLight ? GTP.Render.muzzleLight.intensity : null };
    // CMB-03: tapping fire 30 times in a second throws at most two mics
    fresh('hotmic', 8); GTP.game.advance(2);
    const m0 = p.weapons.hotmic;
    for (let i = 0; i < 30; i++) { GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false); GTP.game.advance(1 / 60); }
    out.micTaps = m0 - p.weapons.hotmic; GTP.game.advance(4); p.hp = p.maxHp;
    // CMB-05: a parked van on the sight line and a bystander 17 degrees off: the van takes the shots
    fresh('pistol', 40);
    const van = GTP.game.debug.spawnVehicle(spot.x + 8, spot.z + 0.7, 'van', { yaw: 0 }); const civ = T_.freeze(GTP.game.debug.spawnPed(spot.x + 10, spot.z - 3.2, null, 'civ'));
    GTP.Render.rig.yaw = EAST; GTP.Render.rig.pitch = 0.12; GTP.Render.rig.snap(); GTP.game.advance(0.1);
    const vh0 = van.hp, ch0 = civ.hp;
    GTP.Input.set('aim', true); GTP.game.advance(0.4);
    out.lockCiv = p.lockTarget === civ;
    for (let i = 0; i < 3; i++) { GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false); GTP.game.advance(0.35); }
    GTP.Input.set('aim', false); GTP.game.advance(0.1);
    out.cmb05 = { van: +(vh0 - van.hp).toFixed(1), civ: +(ch0 - civ.hp).toFixed(1), wanted: p.wanted };
    van.destroy(); civ.destroy(); GTP.AI.wanted.clear();
    // CMB-08: a dropped pistol tops up to the cap and does not take the SMG out of the hand
    fresh('pistol', 132); GTP.game.debug.giveWeapon('smg', 60);
    GTP.Combat.spawnPickup({ type: 'weapon', weaponId: 'pistol', ammo: 12, x: p.x + 1.5, z: p.z }); GTP.Input.set('forward', true); GTP.game.advance(0.6); GTP.Input.set('forward', false);
    out.cmb08 = { weapon: p.weapon, pistol: p.weapons.pistol };
    GTP.Combat.spawnPickup({ type: 'weapon', weaponId: 'shotgun', ammo: 6, x: p.x + 1.5, z: p.z }); GTP.Input.set('forward', true); GTP.game.advance(0.6); GTP.Input.set('forward', false);
    out.cmb08.newGun = p.weapon;
    // CMB-11: an explosive kill gives a hit marker, the kill confirm and the kill stat
    fresh('hottake', 3);
    const weak = thug(8, 0, 10); const marks = []; const h = (e) => marks.push(e.kill); GTP.Events.on('hitmarker', h);
    const k0 = p.stats.kills || 0, c0 = GTP.Audio.counts.confirm || 0;
    GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false); GTP.game.advance(2);
    GTP.Events.off('hitmarker', h);
    out.cmb11 = { alive: weak.alive, kill: marks.indexOf(true) >= 0, kills: (p.stats.kills || 0) - k0, confirm: (GTP.Audio.counts.confirm || 0) - c0 };
    // CMB-14 / CMB-15: two shotgun volleys are two shots and two hits; one volley at 4 m drops a 60 hp thug
    fresh('shotgun', 20); GTP.game.advance(1);
    const sg = thug(4, 0, 1000); const s0 = p.stats.shots || 0, h0 = p.stats.hits || 0;
    GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false); GTP.game.advance(1.0);
    GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false); GTP.game.advance(0.2);
    out.cmb14 = { shots: (p.stats.shots || 0) - s0, hits: (p.stats.hits || 0) - h0 };
    sg.destroy(); GTP.game.advance(1);
    const sg2 = thug(4, 0, 60); GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false); GTP.game.advance(0.1);
    out.cmb15 = { alive: sg2.alive, hp: +sg2.hp.toFixed(1) };
    // CMB-16: the table leg kills a 60 hp thug in two swings, without sliding him out of reach first
    fresh('tableleg', Infinity);
    const tl = thug(1.4, 0, 60); let maxD = 0, t16 = -1;
    GTP.Input.set('shoot', true);
    for (let i = 0; i < 300 && tl.alive; i++) { GTP.game.advance(1 / 60); maxD = Math.max(maxD, Math.hypot(tl.x - p.x, tl.z - p.z)); if (!tl.alive) t16 = i / 60; }
    GTP.Input.set('shoot', false); GTP.game.advance(0.3);
    out.cmb16 = { dead: !tl.alive, at: t16, maxD: +maxD.toFixed(2) };
    // CMB-01: a direct rocket hit on a stopped van is a 'ratio' vehicle:damage (missions credit the weapon)
    fresh('ratio', 3);
    const rv = GTP.game.debug.spawnVehicle(spot.x + 14, spot.z + 0.8, 'van', { yaw: 0 });
    const rd = GTP.game.debug.spawnPed(spot.x + 14, spot.z + 3, null, 'thug'); rd.hostile = true; rv.enter(rd, 0); T_.freeze(rd);
    const vd = []; const hv = (e) => { if (e.vehicle === rv) vd.push(e.type); }; GTP.Events.on('vehicle:damage', hv);
    GTP.Render.rig.yaw = EAST; GTP.Render.rig.pitch = 0.1; GTP.Render.rig.snap();
    GTP.Input.set('aim', true); GTP.game.advance(0.5); GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false); GTP.game.advance(1.2); GTP.Input.set('aim', false);
    GTP.Events.off('vehicle:damage', hv);
    out.cmb01 = { types: vd, wreck: rv.wreck || rv.exploded };
    GTP.game.advance(0.5); p.hp = p.maxHp;
    // CMB-12: holding fire with a hot mic in a car spends one mic, never a second cook
    fresh('hotmic', 4);
    const car = GTP.game.debug.spawnVehicle(spot.x + 1.5, spot.z, 'sedan', { yaw: EAST }); GTP.game.advance(0.1); p.enterVehicle(car, 0); GTP.game.advance(1.0);
    const mc0 = p.weapons.hotmic; GTP.Input.set('shoot', true); GTP.game.advance(2.8); GTP.Input.set('shoot', false); GTP.game.advance(0.2);
    out.cmb12 = { spent: mc0 - (p.weapons.hotmic || 0), inCar: !!p.inVehicle };
    if (p.inVehicle) p.exitVehicle(); GTP.game.advance(3); if (!p.alive || GTP.game.state !== 'playing') { let g = 0; while (GTP.game.state !== 'playing' && g++ < 40) GTP.game.advance(0.25); } p.hp = p.maxHp;
    // QA-C1-01: four goons punching the whole time take a while to put a passive player down (two swing at once, wind-ups, cooldowns)
    fresh(null);
    const goons = [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].map(([dx, dz]) => { const g = T_.freeze(GTP.game.debug.spawnPed(p.x + dx, p.z + dz, null, 'thug')); g.hostile = true; g.aimTarget = p; return g; });
    let maxWind = 0, firstHit = -1; const hp0 = p.hp;
    for (let i = 0; i < 300; i++) {
      goons.forEach((g) => { if (g.alive) CB.fire(g, 'fist'); });
      GTP.game.advance(1 / 60);
      const wind = goons.filter((g) => g._melee && g._melee.t < g._melee.at).length; maxWind = Math.max(maxWind, wind);
      if (firstHit < 0 && p.hp < hp0) firstHit = i / 60;
    }
    out.c101 = { hp: Math.round(p.hp), maxWind, firstHit, alive: p.alive };
    goons.forEach((g) => g.destroy()); p.hp = p.maxHp;
    return out;
  }, { EAST, spot });
  console.log('  qa combat: ' + JSON.stringify(qa));
  t.assert(qa.light.exists && qa.light.inScene && qa.light.intensity === 0, 'the muzzle light lives in the scene at rest (CMB-04): ' + JSON.stringify(qa.light));
  t.assert(qa.micTaps >= 1 && qa.micTaps <= 2, 'thirty taps throw one or two hot mics (CMB-03): ' + qa.micTaps);
  t.assert(!qa.lockCiv && qa.cmb05.van > 0 && qa.cmb05.civ === 0, 'the shots hit the van under the crosshair, not the bystander off to the side (CMB-05): ' + JSON.stringify(qa.cmb05));
  t.assert(qa.cmb08.weapon === 'smg' && qa.cmb08.pistol === 132 && qa.cmb08.newGun === 'shotgun', 'a dropped gun tops up to the cap and leaves the held SMG alone; a new gun is equipped (CMB-08): ' + JSON.stringify(qa.cmb08));
  t.assert(!qa.cmb11.alive && qa.cmb11.kill && qa.cmb11.kills === 1 && qa.cmb11.confirm >= 1, 'an explosive kill gives the marker, the confirm and the stat (CMB-11): ' + JSON.stringify(qa.cmb11));
  t.assert(qa.cmb14.shots === 2 && qa.cmb14.hits === 2, 'shotgun volleys count one shot and one hit each (CMB-14): ' + JSON.stringify(qa.cmb14));
  t.assert(!qa.cmb15.alive, 'one shotgun volley at 4 m drops a 60 hp ped (CMB-15): ' + JSON.stringify(qa.cmb15));
  t.assert(qa.cmb16.dead && qa.cmb16.at < 2.2 && qa.cmb16.maxD < 3, 'the table leg finishes a 60 hp ped in two swings without the flip slide (CMB-16): ' + JSON.stringify(qa.cmb16));
  t.assert(qa.cmb01.types.indexOf('ratio') >= 0 && qa.cmb01.wreck, 'a direct rocket hit reports vehicle:damage with the ratio (CMB-01): ' + JSON.stringify(qa.cmb01));
  t.assert(qa.cmb12.spent === 1, 'holding fire in a car spends one hot mic (CMB-12): ' + JSON.stringify(qa.cmb12));
  t.assert(qa.c101.alive && qa.c101.hp >= 45 && qa.c101.hp < 100 && qa.c101.maxWind <= 2 && qa.c101.firstHit >= 0.3, 'four goons punch with wind-ups, two at a time: a passive player lives 5 s (QA-C1-01): ' + JSON.stringify(qa.c101));

  // ---- 22. the arsenal from GTP.Content.parity.weapons: new ids join, known ids take the numbers, unknown ids get a class mesh ----
  const parity = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, C = GTP.Content, A = GTP.Assets;
    const P = C.parity = C.parity || {}, saved = P.weapons, pistol0 = CB.WEAPONS.pistol;
    P.weapons = [
      { id: 'pistol', name: 'Pistol', class: 'pistol', dmg: 19, rate: 4, mag: 12, reserve: 120, reload: 1.2, spread: 0.012, bloom: { add: 0.008, max: 0.04, decay: 0.1 }, recoil: 1.2, range: 35, projectile: 'hitscan', hold: 'one', price: 450, unlock: { mission: 'm03b_range' }, attachments: ['muzzle', 'mag'], flavor: 'Four fifty.' },
      { id: 'zz_testcarbine', name: 'The Fact Sheet', class: 'rifle', dmg: 25, rate: 6, mag: 30, reserve: 120, reload: 2, spread: 0.02, bloom: { add: 0.005, max: 0.05, decay: 0.1 }, recoil: 0.5, range: 50, projectile: 'hitscan', hold: 'two', price: 1234, unlock: null, attachments: ['muzzle', 'optic'], flavor: 'One page. Bullet points.' },
      { id: 'zz_testlobber', name: 'The Pull Quote', class: 'heavy', dmg: 80, rate: 1, mag: 4, reserve: 12, reload: 3, spread: 0, recoil: 3, range: 30, projectile: 'lobbed', hold: 'two', price: 4000, unlock: { mission: 'm14_grift' }, attachments: [], flavor: 'Out of context, on impact.' }
    ];
    CB.syncArsenal();
    const W = CB.WEAPONS, c = W.zz_testcarbine, l = W.zz_testlobber;
    const out = { carbine: c ? { cls: c.cls, slot: c.slot, mag: c.mag, auto: c.auto, hold: CB.holdOf('zz_testcarbine') } : null, lobber: l ? { cls: l.cls, slot: l.slot, lobbed: l.lobbed, impact: l.impact, unlock: CB.UNLOCK.zz_testlobber } : null,
      pistol: { dmg: W.pistol.dmg, driveBy: W.pistol.driveBy, mag: W.pistol.mag, attachments: W.pistol.attachments }, order: CB.ORDER.indexOf('zz_testcarbine') > 0,
      mesh: !!A.weaponMesh('zz_testcarbine'), fit: A.weaponFitFor('zz_testcarbine') && A.weaponFitFor('zz_testcarbine').hold, lobMesh: !!A.weaponMesh('zz_testlobber') };
    const cat = CB.catalog();
    const ci = cat.filter((i) => i.id === 'zz_testcarbine')[0];
    out.cat = ci ? { price: ci.price, kind: ci.kind, stats: !!ci.stats } : null;
    out.slots = cat.filter((i) => i.weaponId === 'zz_testcarbine' && i.kind === 'attachment').map((i) => i.slot).filter((v, i, a) => a.indexOf(v) === i).sort();
    out.lobLocked = (cat.filter((i) => i.id === 'zz_testlobber')[0] || {}).locked;
    // it fires and hurts
    T_.setup(spot, EAST); GTP.AI.wanted.clear(); p.weapons = { fist: Infinity }; p.ammo = {};
    GTP.game.debug.giveWeapon('zz_testcarbine', 30);
    const e = T_.freeze(GTP.game.debug.spawnPed(spot.x + 8, spot.z, null, 'thug')); e.hostile = true; e.hp = e.maxHp = 1000;
    GTP.game.advance(0.1); GTP.Input.set('shoot', true); GTP.game.advance(0.5); GTP.Input.set('shoot', false); GTP.game.advance(0.2);
    out.fired = { dmg: 1000 - e.hp, held: !!p._held };
    // put the table back
    P.weapons = saved; delete W.zz_testcarbine; delete W.zz_testlobber; W.pistol = pistol0; CB.debug.arsenal.sig = null; CB.syncArsenal();
    out.restored = { order: CB.ORDER.indexOf('zz_testcarbine'), pistol: CB.WEAPONS.pistol.dmg };
    return out;
  }, { EAST, spot });
  console.log('  parity: ' + JSON.stringify(parity));
  t.assert(parity.carbine && parity.carbine.cls === 'rifle' && parity.carbine.slot === 6 && parity.carbine.mag === 30 && parity.carbine.auto && parity.carbine.hold === 'two' && parity.order, 'a parity rifle joins the arsenal in the rifle slot: ' + JSON.stringify(parity.carbine));
  t.assert(parity.lobber && parity.lobber.cls === 'launcher' && parity.lobber.lobbed && parity.lobber.impact && parity.lobber.unlock === 'm14_grift' && parity.lobLocked, 'a parity heavy lobber becomes an impact launcher, locked by its mission: ' + JSON.stringify(parity.lobber));
  t.assert(parity.pistol.dmg === 19 && parity.pistol.driveBy && parity.pistol.mag === 12 && parity.pistol.attachments.join() === 'muzzle,mag', 'a known id takes the parity numbers and keeps its engine fields: ' + JSON.stringify(parity.pistol));
  t.assert(parity.mesh && parity.lobMesh && parity.fit === 'two', 'unknown ids get a mesh of their class: ' + JSON.stringify(parity));
  t.assert(parity.cat && parity.cat.price === 1234 && parity.cat.kind === 'weapon' && parity.slots.join() === 'muzzle,optic', 'the catalog sells it with its own attachment slots: ' + JSON.stringify([parity.cat, parity.slots]));
  t.assert(parity.fired.dmg > 0 && parity.fired.held, 'it fires from the hand: ' + JSON.stringify(parity.fired));
  t.assert(parity.restored.order < 0 && parity.restored.pistol === 18, 'the table is restored: ' + JSON.stringify(parity.restored));

  // ---- 23. the catalog and buy(): attachments and tints change the numbers and the mesh ----
  const mods = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, Ms = GTP.Missions.state, out = {};
    T_.setup(spot, EAST); GTP.AI.wanted.clear();
    p.weapons = { fist: Infinity }; p.ammo = {}; p.weapon = 'fist'; p.money = 50000; p.weaponMods = {}; p.weaponModsOwned = {};
    Ms.completed.add('m08b_jets');
    const cat0 = CB.catalog('both_sides_strip');
    out.kinds = ['weapon', 'ammo', 'attachment', 'tint', 'gear'].map((k) => cat0.filter((i) => i.kind === k).length);
    out.weapons = cat0.filter((i) => i.kind === 'weapon').length;
    const sup0 = cat0.filter((i) => i.id === 'att_rifle_muzzle_suppressor')[0];
    out.before = { locked: sup0.locked, reason: sup0.lockReason, buy: CB.buy('att_rifle_muzzle_suppressor').reason, keys: Object.keys(sup0).sort().join(',') };
    out.rifle = CB.buy('rifle').ok;
    const base = CB.weaponStats('rifle', p), money0 = p.money;
    const r1 = CB.buy('att_rifle_muzzle_suppressor');
    out.sup = { ok: r1.ok, equipped: r1.equipped, mod: p.weaponMods.rifle.muzzle, paid: money0 - p.money, range: [base.range, CB.weaponStats('rifle', p).range] };
    const r2 = CB.buy('att_rifle_mag_extended'); out.mag = { ok: r2.ok, magSize: CB.hud().weapon.magSize };
    GTP.game.debug.giveWeapon('rifle', 60); p.weapon = 'rifle'; GTP.game.advance(0.1);
    out.mag.mag = CB.ammo(p, 'rifle').mag;
    const r3 = CB.buy('tint_rifle_gold'); out.tint = { ok: r3.ok, tint: p.weaponMods.rifle.tint };
    GTP.game.render();
    const kids = []; if (p._held) p._held.traverse((o) => { if (o.userData.attachment) kids.push(o.userData.attachment); });
    out.mesh = { sig: p._heldSig, kids: kids.sort().join(',') };
    const m0 = p.money, r4 = CB.buy('att_rifle_muzzle_suppressor');
    out.toggle = { ok: r4.ok, price: r4.price, paid: m0 - p.money, equipped: r4.equipped, mod: p.weaponMods.rifle.muzzle };
    CB.buy('att_rifle_muzzle_suppressor', { equip: true });
    // a suppressed shot: no muzzle light, a quiet report
    const shots0 = GTP.Audio.counts.shot || 0; GTP.game.advance(0.3);
    GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false);
    out.quiet = { light: GTP.Render.muzzleLight.intensity, shot: (GTP.Audio.counts.shot || 0) - shots0 };
    out.pistolScope = CB.catalog().filter((i) => i.weaponId === 'pistol' && i.variant === 'scope').length;
    out.saved = GTP.SaveRegistry && GTP.SaveRegistry.combat ? Object.keys(GTP.SaveRegistry.combat.get()).join(',') : 'no registry';
    GTP.game.advance(0.5);
    return out;
  }, { EAST, spot });
  console.log('  mods: ' + JSON.stringify(mods));
  t.assert(mods.kinds.every((n) => n > 0) && mods.weapons >= 32, 'the catalog lists weapons, ammo, attachments, tints and gear: ' + JSON.stringify(mods.kinds));
  t.assert(mods.before.locked && /Buy the weapon first/.test(mods.before.reason) && mods.before.buy === 'notOwned', 'an attachment needs the weapon: ' + JSON.stringify(mods.before));
  t.assert(['equipped', 'id', 'kind', 'lockReason', 'locked', 'name', 'owned', 'price', 'stats', 'weaponId'].every((k) => mods.before.keys.indexOf(k) >= 0), 'catalog items carry the plan\'s fields: ' + mods.before.keys);
  t.assert(mods.rifle && mods.sup.ok && mods.sup.equipped && mods.sup.mod === 'suppressor' && mods.sup.paid > 0 && mods.sup.range[1] < mods.sup.range[0], 'the suppressor buys, equips and costs range: ' + JSON.stringify(mods.sup));
  t.assert(mods.mag.ok && mods.mag.magSize === 45 && mods.mag.mag === 45, 'the extended magazine holds 45: ' + JSON.stringify(mods.mag));
  t.assert(mods.tint.ok && mods.tint.tint === 'gold' && /gold/.test(mods.mesh.sig) && /muzzle:suppressor/.test(mods.mesh.kids) && /mag:extended/.test(mods.mesh.kids), 'the tint and the attachments are on the held mesh: ' + JSON.stringify(mods.mesh));
  t.assert(mods.toggle.ok && mods.toggle.price === 0 && mods.toggle.paid === 0 && !mods.toggle.equipped && mods.toggle.mod === null, 'an owned attachment toggles for free: ' + JSON.stringify(mods.toggle));
  t.assert(mods.quiet.light === 0 && mods.quiet.shot === 0, 'a suppressed shot lights nothing and makes no loud report: ' + JSON.stringify(mods.quiet));
  t.assert(mods.pistolScope === 0, 'a pistol takes the dot, not the long scope');

  // ---- 24. the pose contract on every ped, every step ----
  const pose = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, out = {};
    const KEYS = ['aim', 'aimPitch', 'aimYaw', 'fire', 'reload', 'melee', 'cover', 'hold', 'weaponId', 'drive', 'ride', 'swim', 'fall', 'ragdoll'];
    T_.setup(spot, EAST); GTP.AI.wanted.clear(); p.weapons = { fist: Infinity }; p.ammo = {}; p.weaponMods = {};
    GTP.game.debug.giveWeapon('rifle', 60); GTP.game.advance(0.1);
    const ped = T_.freeze(GTP.game.debug.spawnPed(spot.x + 6, spot.z + 3, null, 'civ')); GTP.game.advance(1 / 60);
    out.keys = KEYS.filter((k) => !(k in p.pose)); out.pedKeys = ped.pose ? KEYS.filter((k) => !(k in ped.pose)) : ['no pose'];
    out.idle = { aim: p.pose.aim, hold: p.pose.hold, weaponId: p.pose.weaponId, reload: p.pose.reload, melee: p.pose.melee, cover: p.pose.cover };
    GTP.Render.rig.pitch = -0.05; GTP.Input.set('aim', true); GTP.game.advance(0.4); out.aiming = { aim: p.pose.aim, pitch: +p.pose.aimPitch.toFixed(2) };
    GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false); out.fire = +p.pose.fire.toFixed(3);
    GTP.Input.set('aim', false); GTP.game.advance(0.1);
    GTP.Input.set('reload', true); GTP.game.advance(1 / 60); GTP.Input.set('reload', false); GTP.game.advance(0.5); out.reload = p.pose.reload;
    GTP.game.advance(2);
    p.knockDown(4, 0, 0, null, 'test'); GTP.game.advance(0.1); out.rag = p.pose.ragdoll ? Object.keys(p.pose.ragdoll).sort().join(',') : null; GTP.game.advance(3);
    const car = GTP.game.debug.spawnVehicle(p.x + 2, p.z, 'sedan', { yaw: EAST }); GTP.game.advance(0.1); p.enterVehicle(car, 0); GTP.game.advance(1);
    out.drive = p.pose.drive; p.exitVehicle(); GTP.game.advance(0.4); out.out = p.pose.drive;
    p.weapon = 'fist'; GTP.game.advance(0.1); out.fist = p.pose.hold;
    return out;
  }, { EAST, spot });
  console.log('  pose: ' + JSON.stringify(pose));
  t.assert(pose.keys.length === 0 && pose.pedKeys.length === 0, 'ped.pose carries every field of the contract (player and peds): ' + JSON.stringify([pose.keys, pose.pedKeys]));
  t.assert(!pose.idle.aim && pose.idle.hold === 'two' && pose.idle.weaponId === 'rifle' && pose.idle.reload === null && pose.idle.melee === null && pose.idle.cover === null, 'idle with a rifle: ' + JSON.stringify(pose.idle));
  t.assert(pose.aiming.aim && pose.aiming.pitch > 0 && pose.fire < 0.05, 'aiming up: pose.aim, a positive aimPitch, fire resets on a shot: ' + JSON.stringify([pose.aiming, pose.fire]));
  t.assert(pose.reload > 0.1 && pose.reload < 0.6 && pose.rag === 'spin,vx,vy,vz' && pose.drive && !pose.out && pose.fist === 'none', 'reload progress, ragdoll velocity, drive, an empty hold: ' + JSON.stringify(pose));

  // ---- 25. holsters: the pistol on the hip, a long gun across the back; the held gun has hand targets ----
  const holster = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat;
    GTP.game.debug.setClock(15);
    T_.setup(spot, EAST); GTP.AI.wanted.clear(); p.weapons = { fist: Infinity, pistol: 20, rifle: 30, ratio: 2 }; p.ammo = {}; p.weapon = 'fist'; p.weaponMods = {};
    GTP.game.advance(0.2); GTP.game.render();
    const out = { hip: p._holHId && p._holHId.split('|')[0], back: p._holBId && p._holBId.split('|')[0], held: !!p._held };
    p.weapon = 'ratio'; GTP.game.advance(0.2); GTP.game.render();
    out.withLauncher = { hip: p._holHId && p._holHId.split('|')[0], back: p._holBId && p._holBId.split('|')[0], held: p._heldId };
    p.weapon = 'rifle'; GTP.Input.set('aim', true); GTP.game.advance(0.4); GTP.game.render();
    const h = CB.handTargets(p); out.hands = h ? { left: !!h.left, raised: h.raised, d: +Math.hypot(h.right.x - h.left.x, h.right.y - h.left.y, h.right.z - h.left.z).toFixed(2) } : null;
    GTP.Input.set('aim', false); p.weapon = 'fist'; GTP.game.advance(0.3);
    const f = GTP.util.yawToDir(EAST); GTP.Render.freeCam(true); GTP.Render.camera.position.set(p.x - f.x * 2.2 - f.z * 1.0, p.y + 1.6, p.z - f.z * 2.2 + f.x * 1.0); GTP.Render.camera.lookAt(p.x, p.y + 1.0, p.z);
    return out;
  }, { EAST, spot });
  await t.shot(page, 'combat_holsters');
  await page.evaluate(() => { GTP.Render.freeCam(false); GTP.game.advance(0.1); });
  console.log('  holsters: ' + JSON.stringify(holster));
  t.assert(holster.hip === 'pistol' && holster.back === 'ratio' && !holster.held, 'with fists: the pistol on the hip, the most expensive long gun on the back: ' + JSON.stringify(holster));
  t.assert(holster.withLauncher.held === 'ratio' && holster.withLauncher.back === 'rifle' && holster.withLauncher.hip === 'pistol', 'holding the launcher: the rifle moves to the back: ' + JSON.stringify(holster.withLauncher));
  t.assert(holster.hands && holster.hands.left && holster.hands.raised && holster.hands.d > 0.15 && holster.hands.d < 0.7, 'a raised rifle gives the left hand a support point: ' + JSON.stringify(holster.hands));

  // ---- 26. melee: a three-hit light combo floors, holding swings heavy, jump counters an incoming swing ----
  const melee = await page.evaluate(({ EAST, spot }) => {
    const p = GTP.game.player, CB = GTP.Combat, out = {};
    T_.setup(spot, EAST); GTP.AI.wanted.clear(); p.weapons = { fist: Infinity }; p.ammo = {}; p.weapon = 'fist';
    const ev = []; const h = (e) => { if (e.ped === p && e.phase === 'impact') ev.push(e.type + (e.type === 'light' ? ':' : '')); }; GTP.Events.on('melee', h);
    const types = []; const hs = (e) => { if (e.ped === p && e.phase === 'start') types.push(e.type); }; GTP.Events.on('melee', hs);
    const a = T_.freeze(GTP.game.debug.spawnPed(spot.x + 1.3, spot.z, null, 'thug')); a.hostile = true; a.hp = a.maxHp = 1000; a.yaw = Math.PI / 2;
    GTP.game.advance(0.1);
    const combos = [];
    for (let i = 0; i < 3; i++) { GTP.Input.set('shoot', true); GTP.game.advance(1 / 60); GTP.Input.set('shoot', false); GTP.game.advance(0.25); if (p._melee) combos.push(p._melee.combo); }
    GTP.game.advance(0.4);
    out.light = { types: types.slice(), combos, down: a.knockedDown, dmg: 1000 - a.hp };
    GTP.game.advance(3); a.x = spot.x + 1.3; a.z = spot.z; p.yaw = EAST; types.length = 0;
    GTP.Input.set('shoot', true); GTP.game.advance(1.0); GTP.Input.set('shoot', false); GTP.game.advance(0.6);
    out.heavy = types.slice();
    // the counter: a goon winds up, the player jumps inside the window
    a.destroy(); GTP.game.advance(0.1);
    const g = T_.freeze(GTP.game.debug.spawnPed(spot.x + 1.2, spot.z, null, 'thug')); g.hostile = true; g.aimTarget = p; g.hp = g.maxHp = 1000;
    GTP.game.advance(0.1); const hp0 = p.hp; types.length = 0;
    CB.fire(g, 'fist'); GTP.game.advance(0.2);
    out.prompt = CB.hud().prompt;
    GTP.Input.press('jump'); GTP.game.advance(1 / 60); GTP.game.advance(0.8);
    out.counter = { types: types.slice(), hpLost: hp0 - p.hp, goonDown: g.knockedDown, jumped: !p.onGround && false };
    GTP.Events.off('melee', h); GTP.Events.off('melee', hs);
    g.destroy();
    return out;
  }, { EAST, spot });
  console.log('  melee: ' + JSON.stringify(melee));
  t.assert(melee.light.types.length === 3 && melee.light.types.every((x) => x === 'light') && melee.light.combos.join() === '0,1,2' && melee.light.down, 'three taps: jab, cross, hook; the hook floors: ' + JSON.stringify(melee.light));
  t.assert(melee.heavy.indexOf('heavy') >= 0, 'holding the trigger swings heavy: ' + JSON.stringify(melee.heavy));
  t.assert(melee.prompt === 'counter' && melee.counter.types.indexOf('counter') >= 0 && melee.counter.hpLost === 0 && melee.counter.goonDown, 'jump during a wind-up counters: no damage taken, the goon floored: ' + JSON.stringify([melee.prompt, melee.counter]));

  // ---- screenshots: every weapon in the hand (a free camera in front of the aim pose) ----
  for (const id of ['tableleg', 'bat', 'megaphone', 'pistol', 'revolver', 'smg', 'rifle', 'carbine', 'shotgun', 'both_barrels', 'lmg', 'sniper', 'hottake', 'hotmic', 'ratio', 'minigun', 'grenade_launcher', 'micro_smg', 'clipboard', 'golf_club']) {
    const held = await page.evaluate(({ EAST, spot, id }) => {
      const p = GTP.game.player, R = GTP.Render, U = GTP.util;
      GTP.game.debug.setClock(14);
      T_.setup(spot, EAST); GTP.AI.wanted.clear();
      p.weapons = { fist: Infinity }; p.ammo = {}; GTP.game.debug.giveWeapon(id, 30); p.weapon = id;
      p.firePoseT = 3; p.aimYaw = EAST; p.yaw = EAST;   // the raised pose before the step that orients the held mesh
      GTP.game.advance(0.15);
      p.firePoseT = 3; p.aimYaw = EAST; p.yaw = EAST;
      const f = U.yawToDir(EAST), rx = -f.z, rz = f.x;
      R.freeCam(true);
      R.camera.position.set(p.x + f.x * 1.9 + rx * 1.3, p.y + 1.45, p.z + f.z * 1.9 + rz * 1.3);
      R.camera.lookAt(p.x + f.x * 0.3, p.y + 1.15, p.z + f.z * 0.3);
      R.camera.fov = 45; R.camera.updateProjectionMatrix();
      const held = p._held; let kids = 0; if (held) held.traverse(() => kids++);
      return { held: !!held, kids, tris: held && held.geometry ? held.geometry.index.count / 3 : 0 };
    }, { EAST, spot, id });
    await t.shot(page, 'combat_held_' + id);
    t.assert(held.held && held.tris > 20, id + ' held mesh has geometry: ' + JSON.stringify(held));
  }
  await page.evaluate(() => { GTP.Render.freeCam(false); GTP.Render.camera.fov = GTP.C.CAMERA.fov; GTP.Render.camera.updateProjectionMatrix(); GTP.Render.rig.snap(); GTP.game.advance(0.1); });

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
