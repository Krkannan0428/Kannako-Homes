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
        const p = GTP.game.player; if (p.inVehicle) p.exitVehicle();
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
    const a = T_.freeze(GTP.game.debug.spawnPed(spot.x + 9, spot.z - 1.5, null, 'civ'));
    const b = T_.freeze(GTP.game.debug.spawnPed(spot.x + 12, spot.z + 2.5, null, 'civ'));
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
    // a shot in aim mode goes to the locked target
    const hpA = a.hp, hpB = b.hp;
    GTP.Input.set('shoot', true); GTP.game.advance(0.3); GTP.Input.set('shoot', false);
    const hit = { a: hpA - a.hp, b: hpB - b.hp };
    GTP.Input.set('aim', false); GTP.game.advance(0.1);
    return { aimActive, first, second, third, fov, camDist, right, screen, ts, hit, released: p.lockTarget === null && !GTP.Combat.aim.active, pose: p.aiming };
  }, { EAST, spot });
  console.log('  aim: ' + JSON.stringify(lock));
  t.assert(lock.aimActive && lock.first === 'a', 'aim mode locked the nearest ped in the cone: ' + lock.first);
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
    const a = T_.freeze(GTP.game.debug.spawnPed(spot.x + 9, spot.z - 1.2, null, 'civ'));
    const b = T_.freeze(GTP.game.debug.spawnPed(spot.x + 10.5, spot.z + 1.6, null, 'civ'));
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
  t.assert(bust.after.state === 'playing' && bust.after.money === 700 && bust.after.wanted === 0 && bust.after.control, 'released: -$500, stars cleared: ' + JSON.stringify(bust.after));
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

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
