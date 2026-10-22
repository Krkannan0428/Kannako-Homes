/* Grand Theft Pundit: 08_combat.js
 * GTP.Combat (v0.3 shooting track): the arsenal, aiming, firing, cover, melee, damage, death, pickups and the
 * Both Sides Arms shop.
 *
 *   Arsenal      37 weapons: the twelve of GDD_EXPANSION §2 (ids unchanged) and 25 parody additions, merged under
 *                GTP.Content.parity.weapons when the content track's table is loaded (syncArsenal, by id; the schema
 *                {id, name, class, dmg, rate, mag, reserve, reload, spread, bloom, recoil, range, projectile, hold, price,
 *                unlock:{mission}, attachments, flavor} is normalised into WEAPONS). ORDER is grouped by the twelve wheel
 *                slots (SLOTS) and sorted by price inside a slot.
 *   Mods         player.weaponMods[id] = {muzzle, mag, optic, grip, light, tint} change the weapon's numbers (eff()) and its
 *                mesh (Assets.weaponMesh(id, mods)); player.weaponModsOwned[id] = {'slot:variant': true, 'tint:id': true}.
 *   Aim          hold aim: over-the-shoulder rig (Render.rig), a dot crosshair that opens with bloom, per-class ADS zoom (a
 *                wrapper on Render.rig.update), aim assist (settings.aimAssist: aiming snaps the camera onto the best
 *                hostile in a 20° cone, then a light stickiness; Tab cycles); the shot always goes where the screen centre
 *                rests (a 3° magnet onto the lock), so a lock never hijacks a shot onto something else (QA CMB-05). Without
 *                aim a gun hip-fires along the camera (assist: the best hostile within 30° of the camera), melee swings at
 *                the nearest body in front. Per-gun recoil patterns (rig.kick), hit markers, head-shot feedback.
 *   Visible gun  the held weapon is placed every frame after the ped's animation (Entities.sync -> Combat.postSync): raised
 *                in both hands while aiming or firing, low-ready otherwise; holstered weapons show on the body (a pistol on
 *                the right hip, a long gun across the back); without GTP.Anim the arms are posed onto the grip and the
 *                support point (a two-bone-free reach). Combat.handTargets(ped) gives the world hand targets to the models track.
 *   Pose         ped.pose (the plan's contract) is filled every step by Ped.update -> Combat.fillPose.
 *   Cover        input action 'cover' (Q / B; C as a fallback key until 02_input binds it): snap to a wall, a car or a low
 *                object within 2.4 m, move along it, peek and fire (aim), blind fire (fire without aim), vault low cover
 *                (jump), cover-to-cover (cover again while looking away); cover blocks shots from its far side (flanking
 *                works); 'cover:enter' / 'cover:exit' events; GTP.AI.coverAlert(x, z, info) when the AI module has it.
 *   Melee        light (tap: jab, cross, hook finisher), heavy (hold, or aim + fire), counter (jump while an attacker winds
 *                up); AI swings have a telegraphed wind-up, a cooldown and at most two attackers at a time (QA-C1-01).
 *   Shop         Combat.catalog(storeId) / Combat.buy(itemId, opts) (weapons, ammo, attachments, tints, gear), the legacy
 *                shop.items(tab) / shop.buy(id) on top of them, the green door markers at every gunshop landmark.
 *
 * Hooks used by other modules (all feature-detected): Combat.fire(ped, id) (Player.control, AI, missions), Combat.reload,
 * Combat.onPlayerDeath / onPlayerBusted, Combat.projectileHit, Combat.collectPickup, Combat.pickupMesh, Combat.postSync
 * (Entities.sync), Combat.fillPose (Ped.update), Combat.coverControl / coverToggle (Player.control), Combat.aim / scope /
 * wheel / shop / hud() (UI), Combat.handTargets (models track).
 * Wrappers installed on other modules: Render.rig.update (the per-class ADS fov; restored after each call).
 * Events: weapon, hitmarker {kill, zone, target, weapon}, reload, scope, wheel, shop:open, shop:close, shop:buy {item, price},
 *         shop:range, cover:enter, cover:exit, melee {type, ped, target, hit}, aim:assist {target}.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util;
  var scratch = [], scratch2 = [], scratch3 = [], candBuf = [];
  var _dir = null;   // THREE.Vector3 scratch (THREE is loaded before us)
  var RESPAWN_DELAY = 3, DEG = Math.PI / 180, HOLD_SCALE = 1.2;

  // ------------------------------------------------------------- weapons --
  // dmg per hit (shotguns: per volley, split over the pellets), range m, rate shots/s, mag / reserve rounds (no mag: ammo is the
  // reserve), reload s, spread = base cone half-angle (rad), bloom {add per shot, max, decay per s}, recoil = camera pitch kick
  // (degrees; autos per shot), knock m/s impulse on a hit, vehicleMul scales damage to cars, price = the Both Sides Arms list,
  // slot = the weapon wheel slot (SLOTS), hold 'one'|'two', pitch = Merle's line.
  var WEAPONS = {
    // the twelve of GDD_EXPANSION §2 (ids and names unchanged; the shotgun and the table leg retuned, QA CMB-15 / CMB-16)
    fist:      { name: 'Fists', cls: 'melee', dmg: 12, range: 1.7, rate: 2.5, ammo: Infinity, melee: true, lunge: 2.4, knock: 3.2, price: 0, slot: 0 },
    tableleg:  { name: 'Folding Table Leg', cls: 'melee', dmg: 32, range: 2.1, rate: 1.6, ammo: Infinity, melee: true, lunge: 2.6, knock: 4.5, flipWindow: 0.6, vehicleDmg: 6, price: 150, slot: 1 },
    megaphone: { name: 'Megaphone', cls: 'special', dmg: 0, range: 6, rate: 1.2, cone: true, arc: Math.PI / 3, push: 18, heat: 1, reserve: 40, pack: 20, price: 300, slot: 2 },
    pistol:    { name: 'Pistol', cls: 'pistol', dmg: 18, range: 35, rate: 4, mag: 12, reserve: 120, reload: 1.2, spread: 0.012, bloom: { add: 0.008, max: 0.04, decay: 0.10 }, recoil: 1.2, vehicleMul: 0.55, knock: 1.6, driveBy: true, price: 450, slot: 3 },
    revolver:  { name: 'The Rebuttal', cls: 'pistol', dmg: 40, range: 45, rate: 1.6, mag: 6, reserve: 60, reload: 2.0, spread: 0.006, bloom: { add: 0.010, max: 0.03, decay: 0.08 }, recoil: 2.4, vehicleMul: 0.7, knock: 3.0, headMul: 3, floors: true, driveBy: true, price: 900, slot: 4 },
    smg:       { name: 'SMG', cls: 'smg', dmg: 9, range: 30, rate: 11, mag: 30, reserve: 240, reload: 1.6, spread: 0.04, bloom: { add: 0.004, max: 0.09, decay: 0.14 }, recoil: 0.35, auto: true, vehicleMul: 0.5, knock: 0.9, driveBy: true, price: 1400, slot: 5 },
    rifle:     { name: 'The Monologue', cls: 'rifle', dmg: 24, range: 60, rate: 5.5, mag: 30, reserve: 180, reload: 2.0, spread: 0.018, aimSpread: 0.009, bloom: { add: 0.006, max: 0.055, decay: 0.12 }, recoil: 0.5, auto: true, pointShots: 3, vehicleMul: 0.65, knock: 1.2, price: 2400, slot: 6 },
    shotgun:   { name: 'Shotgun', cls: 'shotgun', dmg: 70, range: 12, rate: 1.1, mag: 6, reserve: 48, reload: 0.45, shellReload: true, pellets: 6, spread: 0.085, recoil: 3.0, vehicleMul: 0.6, knock: 2.5, driveBy: true, price: 1100, slot: 7 },
    sniper:    { name: 'The Fact Checker', cls: 'sniper', dmg: 120, range: 160, rate: 0.7, mag: 5, reserve: 30, reload: 2.6, spread: 0.08, scopedSpread: 0, recoil: 4.0, headMul: 3, vehicleMul: 1.0, scope: true, noAuto: true, casingDelay: 0.3, price: 4500, slot: 8 },
    hottake:   { name: 'Hot Take', cls: 'thrown', dmg: 12, range: 20, rate: 1, reserve: 12, lobbed: true, stun: 5, speed: 21, price: 90, pack: 3, slot: 9 },
    hotmic:    { name: 'Hot Mic', cls: 'thrown', dmg: 60, range: 24, rate: 0.8, reserve: 8, lobbed: true, speed: 18, fuse: 2.5, blast: 6, ring: 5, vehicleDmg: 180, restitution: 0.4, bounces: 2, cook: true, price: 120, pack: 1, slot: 10 },
    ratio:     { name: 'Ratio Launcher', cls: 'launcher', dmg: 200, range: 120, rate: 0.5, mag: 1, reserve: 6, reload: 3.0, spread: 0, recoil: 6.0, rocket: true, speed: 40, blast: 8, vehicleDmg: 200, flips: true, noAuto: true, price: 7500, slot: 11 },
    // the v0.3 additions (fallback table: the content track's parity table overrides any of these by id)
    knuckles:     { name: 'Brass Talking Points', cls: 'melee', dmg: 18, range: 1.75, rate: 2.8, ammo: Infinity, melee: true, lunge: 2.4, knock: 3.4, price: 200, slot: 0, unlock: 'm03_ratio', pitch: 'Four talking points. All of them hit.' },
    selfie:       { name: 'Selfie Stick', cls: 'melee', dmg: 16, range: 2.6, rate: 2.0, ammo: Infinity, melee: true, lunge: 2.2, knock: 2.6, price: 120, slot: 1, unlock: 'm02_read', pitch: 'Reach, engagement and a little bit of assault.' },
    gavel:        { name: 'The Gavel of Order', cls: 'melee', dmg: 34, range: 1.9, rate: 1.3, ammo: Infinity, melee: true, lunge: 2.5, knock: 4.2, vehicleDmg: 5, price: 260, slot: 1, unlock: 'm05_peer', pitch: 'Order. Order. Ordered it last week.' },
    bat:          { name: 'The Closing Argument', cls: 'melee', dmg: 40, range: 2.3, rate: 1.1, ammo: Infinity, melee: true, lunge: 2.7, knock: 5.2, vehicleDmg: 8, hold: 'two', price: 380, slot: 1, unlock: 'm06_rally', pitch: 'The argument closes. So does the jaw.' },
    oped:         { name: 'Op-Ed Compact', cls: 'pistol', dmg: 14, range: 30, rate: 5, mag: 15, reserve: 150, reload: 1.0, spread: 0.014, bloom: { add: 0.007, max: 0.04, decay: 0.12 }, recoil: 0.9, vehicleMul: 0.5, knock: 1.2, quiet: true, driveBy: true, price: 300, slot: 3, unlock: 'm03b_range', pitch: 'Short, quiet, nobody reads it. Perfect.' },
    filibuster:   { name: 'The Filibuster', cls: 'pistol', dmg: 32, range: 40, rate: 2.4, mag: 9, reserve: 90, reload: 1.6, spread: 0.01, bloom: { add: 0.012, max: 0.045, decay: 0.1 }, recoil: 2.0, vehicleMul: 0.65, knock: 2.4, headMul: 2.5, driveBy: true, price: 1250, slot: 4, unlock: 'm07_listen', pitch: 'It talks until the other side leaves.' },
    pocketsmg:    { name: 'Pocket Pundit', cls: 'smg', dmg: 7, range: 20, rate: 14, mag: 24, reserve: 240, reload: 1.2, spread: 0.055, bloom: { add: 0.005, max: 0.11, decay: 0.18 }, recoil: 0.3, auto: true, hold: 'one', vehicleMul: 0.45, knock: 0.7, driveBy: true, price: 800, slot: 5, unlock: 'm07b_ferry', pitch: 'Fits in a blazer. So does an opinion.' },
    threadpistol: { name: 'Thread Pistol', cls: 'smg', dmg: 8, range: 22, rate: 13, mag: 20, reserve: 200, reload: 1.3, spread: 0.05, bloom: { add: 0.005, max: 0.1, decay: 0.16 }, recoil: 0.45, auto: true, hold: 'one', vehicleMul: 0.45, knock: 0.8, driveBy: true, price: 1100, slot: 5, unlock: 'm08_scooters', pitch: 'One of twenty. A thread.' },
    liveblog:     { name: 'The Live Blogger', cls: 'smg', dmg: 10, range: 34, rate: 12, mag: 32, reserve: 256, reload: 1.7, spread: 0.035, bloom: { add: 0.004, max: 0.08, decay: 0.15 }, recoil: 0.3, auto: true, vehicleMul: 0.5, knock: 1.0, driveBy: true, price: 2100, slot: 5, unlock: 'm12_memo', pitch: 'Updates every eighty milliseconds.' },
    combatmg:     { name: 'Comment Section', cls: 'lmg', dmg: 22, range: 55, rate: 8, mag: 80, reserve: 240, reload: 3.6, spread: 0.028, bloom: { add: 0.004, max: 0.08, decay: 0.1 }, recoil: 0.45, auto: true, vehicleMul: 0.7, knock: 1.4, price: 5200, slot: 5, unlock: 'm12b_scope', pitch: 'Below the line. Endless. Mostly wrong.' },
    lmg:          { name: 'The Endless Segment', cls: 'lmg', dmg: 20, range: 55, rate: 9, mag: 100, reserve: 300, reload: 4.2, spread: 0.03, bloom: { add: 0.004, max: 0.08, decay: 0.1 }, recoil: 0.45, auto: true, vehicleMul: 0.7, knock: 1.3, price: 6200, slot: 5, unlock: 'm13_thursday', pitch: 'We are going long. We are always going long.' },
    carbine:      { name: 'The Panel', cls: 'rifle', dmg: 22, range: 58, rate: 6.5, mag: 30, reserve: 210, reload: 1.9, spread: 0.016, aimSpread: 0.008, bloom: { add: 0.005, max: 0.05, decay: 0.13 }, recoil: 0.45, auto: true, pointShots: 3, vehicleMul: 0.65, knock: 1.2, price: 3200, slot: 6, unlock: 'm09b_hotmic', pitch: 'Four voices, one opinion, thirty rounds.' },
    bullpup:      { name: 'Bullet Points', cls: 'rifle', dmg: 21, range: 55, rate: 7, mag: 30, reserve: 210, reload: 1.8, spread: 0.018, aimSpread: 0.009, bloom: { add: 0.005, max: 0.055, decay: 0.13 }, recoil: 0.4, auto: true, pointShots: 3, vehicleMul: 0.6, knock: 1.1, price: 2900, slot: 6, unlock: 'm11_trustless', pitch: 'Short. Punchy. Three of them.' },
    battlerifle:  { name: 'The Long Read', cls: 'rifle', dmg: 38, range: 75, rate: 3.2, mag: 20, reserve: 140, reload: 2.2, spread: 0.012, aimSpread: 0.005, bloom: { add: 0.01, max: 0.05, decay: 0.1 }, recoil: 1.3, vehicleMul: 0.75, knock: 1.8, headMul: 2.5, price: 3800, slot: 6, unlock: 'm10_pellets', pitch: 'Eight thousand words. Every one lands.' },
    sawnoff:      { name: 'Sawed-Off Soundbite', cls: 'shotgun', dmg: 80, range: 7, rate: 2.2, mag: 2, reserve: 40, reload: 1.6, pellets: 7, spread: 0.13, recoil: 3.4, hold: 'one', vehicleMul: 0.6, knock: 3, driveBy: true, price: 700, slot: 7, unlock: 'm04_hit', pitch: 'Cut for time. Still loud.' },
    doublebarrel: { name: 'The Both-Sider', cls: 'shotgun', dmg: 105, range: 9, rate: 2.4, mag: 2, reserve: 40, reload: 1.8, pellets: 8, spread: 0.1, recoil: 4.0, vehicleMul: 0.65, knock: 3.5, price: 900, slot: 7, unlock: 'm06_rally', pitch: 'One barrel for each side. That\'s balance.' },
    autoshotgun:  { name: 'Town Hall', cls: 'shotgun', dmg: 50, range: 12, rate: 3, mag: 12, reserve: 72, reload: 2.4, pellets: 6, spread: 0.09, recoil: 2.0, auto: true, vehicleMul: 0.6, knock: 2.2, price: 3600, slot: 7, unlock: 'm13_thursday', pitch: 'Everyone gets a question. Very fast.' },
    marksman:     { name: 'The Peer Reviewer', cls: 'sniper', dmg: 70, range: 120, rate: 2.0, mag: 10, reserve: 60, reload: 2.4, spread: 0.05, scopedSpread: 0.004, recoil: 2.4, headMul: 2.5, vehicleMul: 0.9, scope: true, noAuto: true, price: 5200, slot: 8, unlock: 'm13_thursday', pitch: 'Reviews you twice. Accepts with revisions.' },
    heavysniper:  { name: 'The Long Form', cls: 'sniper', dmg: 220, range: 200, rate: 0.5, mag: 6, reserve: 24, reload: 3.2, spread: 0.1, scopedSpread: 0, recoil: 6.0, headMul: 3, vehicleMul: 1.6, scope: true, noAuto: true, casingDelay: 0.35, price: 9000, slot: 8, unlock: 'm13b_ratio', pitch: 'It goes through the car. And the argument.' },
    smoke:        { name: 'Smoke & Mirrors', cls: 'thrown', dmg: 0, range: 20, rate: 1, reserve: 10, lobbed: true, speed: 18, fuse: 1.2, smoke: 12, bounces: 2, restitution: 0.35, price: 150, pack: 3, slot: 9, unlock: 'm08b_jets', pitch: 'Twelve seconds of nobody seeing anything. A press office in a can.' },
    coffee:       { name: 'Scalding Latte', cls: 'thrown', dmg: 5, range: 18, rate: 1, reserve: 10, lobbed: true, speed: 17, splash: 3.5, burn: 4, price: 80, pack: 3, slot: 9, unlock: 'm04_hit', pitch: 'Oat milk, extra hot, thrown with intent.' },
    stickynote:   { name: 'Sticky Note', cls: 'thrown', dmg: 80, range: 18, rate: 0.9, reserve: 10, lobbed: true, speed: 16, fuse: 3, blast: 5, ring: 3, vehicleDmg: 220, stick: true, price: 300, pack: 2, slot: 10, unlock: 'm11_trustless', pitch: 'A reminder. It goes off.' },
    confetti:     { name: 'Confetti Cannon', cls: 'launcher', dmg: 90, range: 40, rate: 1.2, mag: 6, reserve: 24, reload: 3.4, lobbed: true, impact: true, speed: 26, blast: 4, vehicleDmg: 110, noAuto: true, recoil: 3.0, price: 6500, slot: 11, unlock: 'm13b_ratio', pitch: 'Six chambers of celebration. Mostly celebration.' },
    firework:     { name: 'Viral Loop', cls: 'launcher', dmg: 140, range: 90, rate: 0.6, mag: 1, reserve: 10, reload: 2.6, spread: 0, recoil: 5.0, rocket: true, speed: 28, blast: 6, vehicleDmg: 160, noAuto: true, price: 4800, slot: 11, unlock: 'm12_memo', pitch: 'It goes up, it goes everywhere, it gets shared.' },
    spin:         { name: 'The Spin Machine', cls: 'launcher', dmg: 14, range: 45, rate: 18, mag: 300, reserve: 600, reload: 5, spread: 0.06, bloom: { add: 0.002, max: 0.08, decay: 0.2 }, recoil: 0.25, auto: true, spinUp: 0.6, vehicleMul: 0.6, knock: 1.0, noAuto: true, price: 15000, slot: 11, unlock: 'm14_grift', pitch: 'Two thousand rounds a minute. Every one of them on message.' }
  };
  // the twelve wheel slots (the wheel shows one weapon per slot; R cycles a slot's weapons while the wheel is open)
  var SLOTS = [
    { id: 'hand', name: 'Unarmed' }, { id: 'melee', name: 'Melee' }, { id: 'special', name: 'Specials' }, { id: 'pistol', name: 'Pistols' },
    { id: 'heavypistol', name: 'Heavy Pistols' }, { id: 'smg', name: 'SMGs & MGs' }, { id: 'rifle', name: 'Rifles' }, { id: 'shotgun', name: 'Shotguns' },
    { id: 'sniper', name: 'Snipers' }, { id: 'thrown', name: 'Thrown' }, { id: 'explosive', name: 'Explosives' }, { id: 'heavy', name: 'Heavy' }
  ];
  var ORDER = [];
  // the shop lists the original twelve first, in the GDD's order, then the additions by slot and price
  var BASE_ORDER = ['fist', 'tableleg', 'megaphone', 'pistol', 'revolver', 'smg', 'rifle', 'shotgun', 'sniper', 'hottake', 'hotmic', 'ratio'];
  function shopOrder() { var out = BASE_ORDER.filter(function (id) { return !!WEAPONS[id]; }); for (var i = 0; i < ORDER.length; i++) if (out.indexOf(ORDER[i]) < 0) out.push(ORDER[i]); return out; }
  // the story mission that puts each of the twelve on the shop wall (the launcher also opens at 40 Monday Memos: flags.memos40);
  // the additions carry their own `unlock`
  var UNLOCK = { megaphone: 'm03_ratio', tableleg: 'm03b_range', pistol: 'm03b_range', revolver: 'm05b_provenance', rifle: 'm08b_jets', hottake: 'm09_balloon', hotmic: 'm09b_hotmic', smg: 'm11_trustless', shotgun: 'm11_trustless', sniper: 'm12b_scope', ratio: 'm13_thursday' };
  // Every sponsor product is the same bottle, relabeled (GDD 9).
  var SPONSOR = { health: 'CLARITY PELLETS', armor: 'NAP DYNASTY', pistol: 'OCTANE OPINIONS', megaphone: 'LOUD & CORRECT', hottake: 'FRESH TAKES', smg: '$PUNDIT', shotgun: 'DEFENSE SCOOTERS', mission: 'MERCH',
    tableleg: "FOUNDERS' COLLEGE", revolver: 'VAULTWRIGHT CAPITAL', rifle: 'BRAVADIA', sniper: 'FULCRUM', hotmic: 'THE YELL NETWORK', ratio: 'BOTH SIDES ARMS' };
  var SPONSOR_COLOR = { 'CLARITY PELLETS': '#2f9e6a', 'NAP DYNASTY': '#2c3e7a', 'OCTANE OPINIONS': '#ff7a00', 'LOUD & CORRECT': '#ff3fa4', 'FRESH TAKES': '#2ee6ff', '$PUNDIT': '#ff2d6f', 'DEFENSE SCOOTERS': '#3d6fcf', 'MERCH': '#e8b53a',
    "FOUNDERS' COLLEGE": '#8a4a3a', 'VAULTWRIGHT CAPITAL': '#e8b53a', 'BRAVADIA': '#3d6fcf', 'FULCRUM': '#8a94c8', 'THE YELL NETWORK': '#c94040', 'BOTH SIDES ARMS': '#3fd27f' };
  var PITCH = { tableleg: 'It fell off the table. The honest weapon.', megaphone: 'Louder is a position.', pistol: 'For a journalist, four hundred. Four fifty.', revolver: 'Six rebuttals. Reload is a rebuttal too.', smg: 'Volume. That\'s the whole pitch.', rifle: 'It never stops talking. Neither do you.', shotgun: 'Everyone in the front row has an opinion.', sniper: 'Reads at two hundred metres. Breathe.', hottake: 'Still warm. Three to a box.', hotmic: 'It was on the whole time.', ratio: 'Ask about our loaner. There is no loaner.' };
  var SHOUTS = ['RESPECTFULLY,', 'READ THE MEMO!', 'RATIO!', 'CODE TAKES20!', 'I AM A JOURNALIST!'];
  var AI_DAMAGE_MUL = 0.45, AI_RIFLE_MUL = 0.4, AI_MELEE_MUL = 0.45;   // cops and goons hurt less than the player does (GDD_EXPANSION 6.9)
  var ZONE_MUL = { head: 2, torso: 1, legs: 0.7, prone: 1 };
  var DRIVEBY_REFUSAL = 'Not from the driver\'s seat. Respectfully.';
  // per-class mobility (the catalog's fifth bar; the aim walk speed scales with it) and the ADS fov multiplier
  var MOBILITY = { melee: 1, special: 0.9, pistol: 0.92, smg: 0.82, rifle: 0.66, shotgun: 0.66, sniper: 0.48, lmg: 0.4, launcher: 0.35, thrown: 0.95 };
  var ADS = { pistol: 1, smg: 1, rifle: 0.84, shotgun: 0.94, lmg: 0.88, launcher: 0.86, special: 1, thrown: 1, melee: 1, sniper: 0.84 };
  // the attachment variants' effects on the numbers
  var MOD_FX = {
    suppressor: { range: 0.9, dmg: 0.95, quiet: true }, compensator: { recoil: 0.7 }, extended: { mag: 1.5 },
    reddot: { aimSpread: 0.8, ads: -3 }, scope: { aimSpread: 0.65, ads: -14 }, grip: { recoil: 0.8, bloomAdd: 0.85 }, flashlight: {}
  };
  var settings = { aimAssist: true, holsters: true };
  // the aim rig the Render.rig.update wrapper puts in place while it runs (metres: behind, right, camera height, look height)
  var AIM_CAM = { dist: 1.55, side: 0.78, height: 1.72, look: 1.5 };

  // ------------------------------------------------------------- helpers --
  function W() { return GTP.World; }
  function E() { return GTP.Entities; }
  // Combat's randomness (spread, drops, fx jitter) runs on a seeded fork of GTP.rng so a
  // firefight never perturbs the city's deterministic spawn/traffic stream.
  var crng = null;
  function R() { return crng || (crng = GTP.rng.fork(0xC0B)); }
  function player() { return GTP.game ? GTP.game.player : null; }
  function simT() { return (GTP.game && GTP.game.time) ? GTP.game.time.t : 0; }
  function fx(o) { if (GTP.Render && GTP.Render.fx) { try { GTP.Render.fx.add(o); } catch (e) { /* fx optional */ } } }
  function sfx(name, x, z, gain) { if (GTP.Audio && GTP.Audio.play) { try { GTP.Audio.play(name, { x: x, z: z, gain: gain }); } catch (e) { /* audio optional */ } } }
  function toast(t) { if (GTP.UI && GTP.UI.toast) { try { GTP.UI.toast(t); } catch (e) { /* ui optional */ } } }
  function shake(a) { if (GTP.Render && GTP.Render.rig) GTP.Render.rig.shake(a); }
  function rig() { return GTP.Render && GTP.Render.rig ? GTP.Render.rig : null; }
  function wanted() { return GTP.AI && GTP.AI.wanted ? GTP.AI.wanted : null; }
  function alarm(x, z, r, src, mild) { if (GTP.AI && GTP.AI.alarm) { try { GTP.AI.alarm(x, z, r, src, mild); } catch (e) { /* ai optional */ } } }
  function emit(name, payload) { try { GTP.Events.emit(name, payload); } catch (e) { /* listeners report their own errors */ } }
  function isCopRole(p) { return !!p && (p.role === 'cop' || p.role === 'swat'); }
  function hostileRole(p) { return !!p && (p.role === 'cop' || p.role === 'swat' || p.role === 'thug' || !!p.hostile || (p.role === 'hoa' && GTP.Missions && GTP.Missions.state && GTP.Missions.state.flags && GTP.Missions.state.flags.hoa_enemy)); }
  // a ped the aim assist may grab on its own: hostiles (mission goons carry `hostile`), cops while wanted, anyone who hurt the player
  // lately; never a bystander, a mission giver or a passive cutout
  function assistable(e, pl) {
    if (e.kind === 'vehicle') return !!e.isPolice;
    if (e.kind === 'heli') return true;
    if (e.ai && e.ai.passive) return false;
    if (hostileRole(e) && !(isCopRole(e) && !(pl.wanted > 0) && !e.hostile)) return true;
    return !!(e._hurtPlayerT && simT() - e._hurtPlayerT < 20);
  }
  function failText(kind) {
    var Rd = GTP.Content && GTP.Content.radio, ft = Rd && Rd.failTexts;
    return (ft && ft[kind]) || (kind === 'busted' ? 'DEPLATFORMED' : 'RATIO\'D');
  }
  function crouchK(e) { return e.cover && !e.cover.peek && !e.cover.high && !e._vault ? 0.62 : 1; }
  function chestY(e) {
    if (e.kind === 'vehicle') return e.y + e.cls.height * 0.5;
    if (e.kind === 'heli') return e.y;
    return e.y + ((e.knockedDown || !e.alive) ? 0.35 : (e.height || 1.8) * 0.58 * crouchK(e));
  }
  function losClear(ax, ay, az, bx, by, bz) {
    var dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 0.01) return true;
    return !W().raycastBuildings(ax, ay, az, dx / l, dy / l, dz / l, l);
  }
  function camYaw() { var r = rig(); return r ? r.yaw : 0; }
  function upright(id) { var f = fitOf(id); return f ? !!f.upright : false; }
  function fitOf(id) { var A = GTP.Assets; return A && A.weaponFitFor ? A.weaponFitFor(id, WEAPONS[id] ? WEAPONS[id].cls : null) : null; }
  function holdOf(id) {
    var w = WEAPONS[id]; if (!w || id === 'fist') return 'none';
    if (w.hold) return w.hold;
    if (w.melee || w.cone || w.cls === 'thrown' || w.cls === 'pistol') return 'one';
    return 'two';
  }
  function modsOf(p, id) { return p && p.weaponMods && p.weaponMods[id] ? p.weaponMods[id] : null; }
  function modsKey(m) { return m ? [m.muzzle || '', m.mag || '', m.optic || '', m.grip || '', m.light || '', m.tint || ''].join(',') : ''; }

  // the weapon's numbers with the player's attachments applied (cached per mods signature); AI shooters use the base entry
  function eff(p, id) {
    var w = WEAPONS[id]; if (!w) return null;
    if (!p || p.kind !== 'player') return w;
    var m = modsOf(p, id); if (!m) return w;
    var key = id + '|' + modsKey(m), cache = p._effCache || (p._effCache = {});
    if (cache[key] && cache[key]._src === w) return cache[key];
    var o = Object.assign({}, w); o._src = w; o._base = w;
    var slots = ['muzzle', 'mag', 'optic', 'grip', 'light'];
    for (var i = 0; i < slots.length; i++) {
      var v = m[slots[i]], f = v && MOD_FX[v]; if (!f || !slotAllowed(id, slots[i])) continue;
      if (f.range) o.range = w.range * f.range;
      if (f.dmg) o.dmg = o.dmg * f.dmg;
      if (f.quiet) o.quiet = true;
      if (f.recoil) o.recoil = (o.recoil || 0) * f.recoil;
      if (f.mag && w.mag > 1) o.mag = Math.round(w.mag * f.mag);
      if (f.aimSpread) { o.aimSpread = (w.aimSpread != null ? w.aimSpread : (w.spread || 0) * 0.7) * f.aimSpread; if (w.scopedSpread != null) o.scopedSpread = w.scopedSpread * f.aimSpread; }
      if (f.ads) o.adsDeg = (o.adsDeg || 0) + f.ads;
      if (f.bloomAdd && w.bloom) o.bloom = { add: w.bloom.add * f.bloomAdd, max: w.bloom.max, decay: w.bloom.decay };
    }
    return (cache[key] = o);
  }
  function magOf(p, id) { var w = eff(p, id); return w ? (w.mag || 0) : 0; }
  function slotAllowed(id, slot) {
    var w = WEAPONS[id]; if (!w) return false;
    if (w.attachments) return w.attachments.indexOf(slot) >= 0;
    var f = fitOf(id); return !!(f && f.slots && f.slots.indexOf(slot) >= 0);
  }
  function variantAllowed(id, slot, variant) {
    if (!slotAllowed(id, slot)) return false;
    var w = WEAPONS[id];
    if (slot === 'optic' && variant === 'scope' && (w.cls === 'pistol' || w.cls === 'shotgun')) return false;   // a pistol takes the dot, not the tube
    if (slot === 'optic' && variant === 'reddot' && w.cls === 'sniper') return false;
    return true;
  }

  // ------------------------------------------------------------ the arsenal --
  // class aliases from the parity table to the classes the engine knows
  var CLS_ALIAS = { handgun: 'pistol', pistols: 'pistol', heavy_pistol: 'pistol', machinepistol: 'smg', mg: 'lmg', machinegun: 'lmg', assault: 'rifle', assault_rifle: 'rifle', carbine: 'rifle',
    marksman: 'sniper', heavy: 'launcher', explosive: 'thrown', throwable: 'thrown', grenade: 'thrown', blunt: 'melee', blade: 'melee' };
  function slotForClass(w) {
    var c = w.cls;
    if (c === 'melee') return w.slot != null ? w.slot : 1;
    if (c === 'special') return 2;
    if (c === 'pistol') return (w.dmg || 0) >= 30 ? 4 : 3;
    if (c === 'smg' || c === 'lmg') return 5;
    if (c === 'rifle') return 6;
    if (c === 'shotgun') return 7;
    if (c === 'sniper') return 8;
    if (c === 'thrown') return w.blast ? 10 : 9;
    return 11;
  }
  // The fallback table's additions that the content track's parity table also has under its own id: when the parity table is
  // loaded the parity id wins, takes the fallback entry's engine-only fields as its base, and the fallback id leaves the table
  // (one minigun, one Filibuster). Meshes follow the same map (05b).
  var LEGACY = { selfie_stick: 'selfie', heavy_pistol: 'filibuster', machine_pistol: 'threadpistol', pdw: 'liveblog', battle_rifle: 'battlerifle',
    both_barrels: 'doublebarrel', auto_shotgun: 'autoshotgun', heavy_sniper: 'heavysniper', sticky: 'stickynote', spin_smoke: 'smoke', minigun: 'spin' };
  // engine fields a parity row may carry beside the plan's schema (copied as they are)
  var ENGINE_KEYS = ['melee', 'lunge', 'knock', 'cone', 'arc', 'push', 'heat', 'stun', 'speed', 'fuse', 'blast', 'ring', 'vehicleDmg', 'restitution', 'bounces',
    'scope', 'scopedSpread', 'headMul', 'vehicleMul', 'noAuto', 'casingDelay', 'aimSpread', 'pointShots', 'shellReload', 'driveBy', 'floors', 'flipWindow',
    'spinUp', 'splash', 'burn', 'launch', 'zoom', 'mobility', 'cook'];
  // a parity weapon (the content track's schema) as an engine entry: known ids keep their engine-only fields
  function normalize(src, base) {
    var o = base ? Object.assign({}, base) : {};
    var cls = String(src.class || src.cls || (base && base.cls) || 'pistol').toLowerCase(); cls = CLS_ALIAS[cls] || cls;
    // a heavy rifle is a machine gun; a heavy special (the minigun) keeps its base's class
    if (src.heavy && cls === 'rifle') cls = 'lmg';
    if (src.heavy && cls === 'special') cls = base ? base.cls : 'launcher';
    o.name = src.name || o.name || src.id; o.cls = cls;
    var nums = ['dmg', 'rate', 'mag', 'reserve', 'reload', 'spread', 'recoil', 'range', 'price'];
    for (var i = 0; i < nums.length; i++) if (typeof src[nums[i]] === 'number' && isFinite(src[nums[i]])) o[nums[i]] = src[nums[i]];
    for (i = 0; i < ENGINE_KEYS.length; i++) if (src[ENGINE_KEYS[i]] != null) o[ENGINE_KEYS[i]] = src[ENGINE_KEYS[i]];
    if (src.sticks) o.stick = true;
    if (src.remote && !(o.fuse > 0)) o.fuse = 3;   // no detonator button: a sticky goes off on a timer
    if (src.smokeSeconds) { o.smoke = src.smokeSeconds; o.fuse = o.fuse || 1.2; o.bounces = o.bounces || 2; }
    // a lobbed thing that only shoves (the merch cannon's shirts) knocks over what it lands on instead of exploding
    if (src.projectile === 'lobbed' && !src.blast && !src.stun && !src.fuse && !src.smokeSeconds && (src.knock || 0) >= 5) { o.stun = 1.6; o.shove = true; }
    if (src.glow) o.glow = src.glow;
    if (src.bloom && typeof src.bloom === 'object') o.bloom = { add: +src.bloom.add || 0, max: +src.bloom.max || 0, decay: +src.bloom.decay || 0.1 };
    if (src.hold === 'one' || src.hold === 'two') o.hold = src.hold;
    if (src.attachments && src.attachments.length) o.attachments = src.attachments.slice();
    if (src.unlock !== undefined) o.unlock = src.unlock && src.unlock.mission ? src.unlock.mission : (typeof src.unlock === 'string' ? src.unlock : null);
    if (src.flavor) o.pitch = src.flavor;
    if (src.pellets) o.pellets = src.pellets;
    if (src.auto != null) o.auto = !!src.auto;
    if (src.pack) o.pack = src.pack;
    var pj = src.projectile;
    if (cls === 'melee') { o.melee = true; o.ammo = Infinity; o.lunge = o.lunge || 2.4; o.knock = o.knock || 3.2; o.range = Math.min(o.range || 1.8, 3); }
    else if (pj === 'rocket') { o.rocket = true; o.lobbed = false; o.speed = o.speed || 40; o.blast = o.blast || 7; o.noAuto = true; o.vehicleDmg = o.vehicleDmg || o.dmg; }
    else if (pj === 'lobbed') { o.lobbed = true; o.speed = o.speed || 18; if (!o.stun && !o.fuse && !o.smoke && !o.splash && !o.impact) { if (cls === 'launcher') { o.impact = true; o.blast = o.blast || 4; } else { o.fuse = o.fuse || 2.2; o.blast = o.blast || 5; o.ring = o.ring || 3; } } o.vehicleDmg = o.vehicleDmg || (o.dmg || 50) * 2; }
    else if (!base || (!base.cone && !base.lobbed && !base.rocket)) {
      if (o.mag == null && cls !== 'special') o.mag = 12;
      if (o.spread == null) o.spread = 0.02;
      if (o.reload == null) o.reload = 1.8;
      if (o.vehicleMul == null) o.vehicleMul = 0.6;
      if (o.knock == null) o.knock = 1.2;
      if (o.auto == null) o.auto = (o.rate || 1) > 5.5;
      if (cls === 'sniper') { o.scope = true; o.noAuto = true; if (o.scopedSpread == null) o.scopedSpread = 0; }
      if (cls === 'shotgun' && !o.pellets) o.pellets = 6;
      if ((cls === 'pistol' || cls === 'smg' || (cls === 'shotgun' && o.hold === 'one')) && o.driveBy == null) o.driveBy = true;
    }
    if (!o.rate) o.rate = 1; if (o.range == null) o.range = 30; if (o.dmg == null) o.dmg = 10; if (o.price == null) o.price = 500;
    // a thrown thing (and the megaphone) has no magazine whatever the table says; a magazine always has a reload time; a
    // shell-by-shell reload takes the table's whole-magazine time per shell
    if ((o.lobbed && !o.impact) || o.cone || o.melee) delete o.mag;
    if (o.mag > 0 && !(o.reload > 0)) o.reload = base && base.reload > 0 ? base.reload : 1.8;
    if (o.melee) { delete o.reload; delete o.reserve; }
    if (o.shellReload && o.mag > 0 && typeof src.reload === 'number' && src.reload > 0) o.reload = base && base.reload > 0 && Math.abs(src.reload - base.reload) < 1e-6 ? base.reload : Math.max(0.25, src.reload / o.mag);
    o.slot = base && base.slot != null && base.cls === cls ? base.slot : slotForClass(o);
    o.parity = true;
    return o;
  }
  var arsenal = { sig: null, parity: 0 }, LEGACY_ENTRIES = {}, LEGACY_OF = {};
  for (var lk in LEGACY) LEGACY_OF[LEGACY[lk]] = lk;
  function migrateLegacy(p) {
    for (var old in LEGACY_OF) {
      if (WEAPONS[old] || !(old in p.weapons)) continue;
      var nu = LEGACY_OF[old], n = p.weapons[old]; delete p.weapons[old];
      if (WEAPONS[nu]) p.weapons[nu] = Math.max(p.weapons[nu] || 0, n || 0);
      if (p.ammo && p.ammo[old]) { if (WEAPONS[nu] && !p.ammo[nu]) p.ammo[nu] = p.ammo[old]; delete p.ammo[old]; }
      if (p.weapon === old) p.weapon = WEAPONS[nu] ? nu : 'fist';
      if (p.weaponMods && p.weaponMods[old]) { p.weaponMods[nu] = p.weaponMods[nu] || p.weaponMods[old]; delete p.weaponMods[old]; }
    }
  }
  function rebuildOrder() {
    var ids = Object.keys(WEAPONS);
    ids.sort(function (a, b) { var wa = WEAPONS[a], wb = WEAPONS[b]; return (wa.slot - wb.slot) || ((wa.price || 0) - (wb.price || 0)) || (a < b ? -1 : 1); });
    ORDER.length = 0; for (var i = 0; i < ids.length; i++) ORDER.push(ids[i]);
    if (ORDER[0] !== 'fist') { ORDER.splice(ORDER.indexOf('fist'), 1); ORDER.unshift('fist'); }
    for (i = 0; i < ids.length; i++) { var w = WEAPONS[ids[i]]; if (w.unlock !== undefined && w.unlock !== null) UNLOCK[ids[i]] = w.unlock; else if (w.unlock === null && !UNLOCK_BASE[ids[i]]) delete UNLOCK[ids[i]]; if (w.pitch && !PITCH[ids[i]]) PITCH[ids[i]] = w.pitch; }
  }
  var UNLOCK_BASE = Object.assign({}, UNLOCK);
  // merge GTP.Content.parity.weapons over the table (cheap when nothing changed: a length + id signature)
  function syncArsenal() {
    var P = GTP.Content && GTP.Content.parity, list = P && P.weapons;
    if (list && !Array.isArray(list) && list === arsenal.obj && ORDER.length) return;
    arsenal.obj = list && !Array.isArray(list) ? list : null;
    var arr = list ? (Array.isArray(list) ? list : Object.keys(list).map(function (k) { var o = list[k]; if (o && !o.id) o.id = k; return o; })) : null;
    var sig = arr ? arr.length + ':' + (arr[0] && arr[0].id) + ':' + (arr[arr.length - 1] && arr[arr.length - 1].id) : 'none';
    if (sig === arsenal.sig && ORDER.length) return;
    arsenal.sig = sig; arsenal.parity = 0;
    if (arr) for (var i = 0; i < arr.length; i++) {
      var s = arr[i]; if (!s || !s.id || s.id === 'fist') continue;
      try {
        var leg = LEGACY[s.id], base = WEAPONS[s.id] || (leg && (WEAPONS[leg] || LEGACY_ENTRIES[leg])) || null;
        if (leg && WEAPONS[leg]) { LEGACY_ENTRIES[leg] = WEAPONS[leg]; delete WEAPONS[leg]; delete UNLOCK[leg]; delete PITCH[leg]; }
        WEAPONS[s.id] = normalize(s, base); arsenal.parity++;
      } catch (e) { U.reportError(e, 'combat.arsenal ' + s.id); }
    }
    rebuildOrder();
    // a legacy id still in a pocket (an old test or save) becomes its parity weapon
    var pl = player(); if (pl && pl.weapons) migrateLegacy(pl);
  }
  rebuildOrder();

  // ------------------------------------------------------- muzzle and frames --
  // The gun's frame in the world: where the trigger hand holds it (grip), the barrel direction (X), the gun's up (Y) and side
  // (Z), from the ped's body and pose alone (no mesh), so a headless shot leaves the same muzzle the render shows.
  // raised: aiming or firing (two hands on a long gun, the two-handed pistol stance, a launcher on the shoulder).
  var _gf = { gx: 0, gy: 0, gz: 0, X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1], s: 1, raised: false };
  function gunFrame(ped, id, raised, out, yawOverride, pitchOverride) {
    out = out || _gf;
    var sc = (ped.look && ped.look.scale) || 1, yaw = yawOverride != null ? yawOverride : ped.yaw, pitch = pitchOverride != null ? pitchOverride : (ped._aimPitch || 0);
    var f = U.yawToDir(yaw), fx_ = f.x, fz_ = f.z, rx = -fz_, rz = fx_, ck = crouchK(ped);
    var x = ped.x, y = ped.y, z = ped.z, fit = fitOf(id) || {}, hold = holdOf(id), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // the aim basis: a (forward with pitch), u (up with pitch), r (right)
    var ax = fx_ * cp, ay = sp, az = fz_ * cp, ux = -fx_ * sp, uy = cp, uz = -fz_ * sp;
    var shY = y + (1.38 * ck + (ck < 1 ? 0.06 : 0)) * sc, sx = x + rx * 0.3 * sc, sz = z + rz * 0.3 * sc;
    var gx, gy, gz, X, Y, rig3 = modelsRig();
    if (raised && rig3 && !fit.upright && !fit.melee && !fit.knuckle) {
      // the models-track rig (06c holdPose): the grip in the chest frame, rifle-likes (and launchers, the minigun) in the shoulder
      // pocket at (0.1 right, 0.1 up, 0.32 ahead), handguns out in front at (0.04, 0.18, 0.51); drawn at scale 1, so the shot leaves
      // the barrel the player sees
      var two = hold === 'two', ox = two ? 0.1 : 0.04, oy = two ? 0.1 : 0.18, oz = two ? 0.32 : 0.51, cy = y + MODEL_CHEST * ck * sc;
      gx = x + (rx * ox + ux * oy + ax * oz) * sc; gy = cy + (uy * oy + ay * oz) * sc; gz = z + (rz * ox + uz * oy + az * oz) * sc;
      X = [ax, ay, az]; Y = [ux, uy, uz];
    } else if (raised) {
      if (fit.spinBarrels) { gx = x + rx * 0.1 * sc + fx_ * 0.3 * sc; gy = y + 1.0 * ck * sc; gz = z + rz * 0.1 * sc + fz_ * 0.3 * sc; X = [ax, ay * 0.5, az]; Y = [ux, uy, uz]; }
      else if (fit.shoulder) { gx = sx + ax * 0.12 * sc - ux * 0.16 * sc; gy = shY + ay * 0.12 * sc - uy * 0.16 * sc; gz = sz + az * 0.12 * sc - uz * 0.16 * sc; X = [ax, ay, az]; Y = [ux, uy, uz]; }
      else if (fit.upright) { gx = sx + ax * 0.1 * sc + fx_ * 0.08 * sc; gy = shY + 0.12 * sc; gz = sz + az * 0.1 * sc + fz_ * 0.08 * sc; X = [rx, 0, rz]; Y = id === 'megaphone' ? [ax, ay, az] : [ux * 0.3 + fx_ * 0.2, 0.95, uz * 0.3 + fz_ * 0.2]; }
      else if (fit.melee || fit.knuckle) { gx = sx + fx_ * 0.35 * sc; gy = shY - 0.25 * sc; gz = sz + fz_ * 0.35 * sc; X = [fx_ * 0.6, 0.8, fz_ * 0.6]; Y = [-fx_ * 0.8, 0.6, -fz_ * 0.8]; }
      else if (hold === 'one') {
        // the two-handed pistol stance: arms out in front of the chest, a touch right
        var mx = x + rx * 0.15 * sc, mz = z + rz * 0.15 * sc;
        gx = mx + ax * 0.52 * sc + ux * 0.03 * sc; gy = shY + ay * 0.52 * sc + uy * 0.03 * sc; gz = mz + az * 0.52 * sc + uz * 0.03 * sc; X = [ax, ay, az]; Y = [ux, uy, uz];
      } else {
        // the stock in the right shoulder pocket, the cheek on the stock
        gx = sx + ax * 0.34 * sc - ux * 0.05 * sc - rx * 0.1 * sc; gy = shY + ay * 0.34 * sc - uy * 0.05 * sc; gz = sz + az * 0.34 * sc - uz * 0.05 * sc - rz * 0.1 * sc; X = [ax, ay, az]; Y = [ux, uy, uz];
      }
    } else {
      // low ready: a long gun across the chest, muzzle down and to the left; the rest in the hand at the side
      if (hold === 'two' && !fit.melee) { var dx = fx_ * 0.74 - rx * 0.36, dy = -0.5, dz = fz_ * 0.74 - rz * 0.36, dl = Math.sqrt(dx * dx + dy * dy + dz * dz); X = [dx / dl, dy / dl, dz / dl]; gx = x + rx * 0.16 * sc + fx_ * 0.24 * sc; gy = y + 1.05 * ck * sc; gz = z + rz * 0.16 * sc + fz_ * 0.24 * sc; }
      else { X = [fx_ * 0.55, -0.83, fz_ * 0.55]; gx = x + rx * 0.34 * sc + fx_ * 0.04 * sc; gy = y + 0.76 * ck * sc; gz = z + rz * 0.34 * sc + fz_ * 0.04 * sc; }
      var dot = X[1]; Y = [-X[0] * dot, 1 - X[1] * dot, -X[2] * dot];
    }
    // orthonormalise: Y perpendicular to X, Z = X x Y
    var xl = Math.sqrt(X[0] * X[0] + X[1] * X[1] + X[2] * X[2]) || 1; X[0] /= xl; X[1] /= xl; X[2] /= xl;
    var d2 = Y[0] * X[0] + Y[1] * X[1] + Y[2] * X[2]; Y[0] -= X[0] * d2; Y[1] -= X[1] * d2; Y[2] -= X[2] * d2;
    var yl = Math.sqrt(Y[0] * Y[0] + Y[1] * Y[1] + Y[2] * Y[2]) || 1; Y[0] /= yl; Y[1] /= yl; Y[2] /= yl;
    out.X[0] = X[0]; out.X[1] = X[1]; out.X[2] = X[2]; out.Y[0] = Y[0]; out.Y[1] = Y[1]; out.Y[2] = Y[2];
    out.Z[0] = X[1] * Y[2] - X[2] * Y[1]; out.Z[1] = X[2] * Y[0] - X[0] * Y[2]; out.Z[2] = X[0] * Y[1] - X[1] * Y[0];
    out.gx = gx; out.gy = gy; out.gz = gz; out.s = (rig3 ? 1 : holdScale(id)) * sc; out.raised = !!raised;
    return out;
  }
  // the models-track rig (05d + 06c): GTP.Anim draws the gun in the hand at scale 1; the chest frame's origin sits 1.243 m up
  var MODEL_CHEST = 1.243;
  function modelsRig() { return !!(GTP.Anim && GTP.Models); }
  // handguns read small in a fist the size of the fallback rig's: they are drawn a little larger than the long guns
  function holdScale(id) { var f = fitOf(id); return f && f.hold === 'one' && !f.melee && !f.upright && !f.knuckle ? HOLD_SCALE * 1.22 : HOLD_SCALE; }
  function framePoint(fr, p, out) {
    out = out || {};
    var s = fr.s; out.x = fr.gx + (fr.X[0] * p[0] + fr.Y[0] * p[1] + fr.Z[0] * p[2]) * s; out.y = fr.gy + (fr.X[1] * p[0] + fr.Y[1] * p[1] + fr.Z[1] * p[2]) * s; out.z = fr.gz + (fr.X[2] * p[0] + fr.Y[2] * p[1] + fr.Z[2] * p[2]) * s;
    return out;
  }
  function muzzle(ped, id) {
    var v = ped.inVehicle;
    id = id || ped.weapon;
    if (v) {
      // out of the driver's window (a scooter: over the bars), toward the aim yaw
      var a = U.yawToDir(ped.aimYaw != null ? ped.aimYaw : v.yaw), side = v.localToWorld(v.type === 'bike' ? 0 : -(v.hw + 0.25), v.type === 'bike' ? -0.6 : -v.hl * 0.15);
      return { x: side.x + a.x * 0.3, y: v.y + v.cls.height * (v.type === 'bike' ? 1.1 : 0.72), z: side.z + a.z * 0.3 };
    }
    var w = WEAPONS[id];
    if (!w || w.melee || !GTP.Assets || !GTP.Assets.weaponMuzzle) {
      var f = U.yawToDir(ped.yaw), rx = -f.z, rz = f.x, sc = (ped.look && ped.look.scale) || 1;
      return { x: ped.x + rx * 0.28 * sc + f.x * 0.35, y: ped.y + 1.32 * sc * crouchK(ped), z: ped.z + rz * 0.28 * sc + f.z * 0.35 };
    }
    var fr = gunFrame(ped, id, true, null, ped.aimYaw != null && (ped.aiming || ped.kind !== 'player') ? ped.aimYaw : ped.yaw);
    return framePoint(fr, GTP.Assets.weaponMuzzle(id, modsOf(ped, id)));
  }
  // pistol, revolver, SMG and shotgun (and every parity weapon flagged driveBy) fire from a driver's seat with aim held
  function driveByWeapon(id) { var w = WEAPONS[id]; return !!w && !!w.driveBy; }
  function jitter(d, spread) {
    if (!spread) return { x: d.x, y: d.y, z: d.z };
    var r = R(), ax = (r.random() - 0.5) * 2 * spread, ay = (r.random() - 0.5) * 2 * spread;
    var ux = -d.z, uz = d.x, ul = Math.sqrt(ux * ux + uz * uz) || 1; ux /= ul; uz /= ul;
    var vx = d.y * uz, vy = d.z * ux - d.x * uz, vz = -d.y * ux;
    var ox = d.x + ux * ax + vx * ay, oy = d.y + vy * ay, oz = d.z + uz * ax + vz * ay, l = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
    return { x: ox / l, y: oy / l, z: oz / l };
  }
  function raySphere(o, d, cx, cy, cz, r, maxT) {
    var lx = cx - o.x, ly = cy - o.y, lz = cz - o.z;
    var tca = lx * d.x + ly * d.y + lz * d.z;
    if (tca < 0) return -1;
    var d2 = lx * lx + ly * ly + lz * lz - tca * tca, r2 = r * r;
    if (d2 > r2) return -1;
    var t = tca - Math.sqrt(r2 - d2);
    if (t < 0) t = 0;
    return t > maxT ? -1 : t;
  }
  // the ped ray test: a head sphere (tested first), the upper body sphere, the lower sphere; a prone ped is one sphere;
  // a ped crouched in low cover is shorter (crouchK)
  var lastZone = 'torso';
  function rayPed(o, d, e, maxT) {
    var sc = (e.look && e.look.scale) || 1, k = crouchK(e);
    if (e.knockedDown || !e.alive) { lastZone = 'prone'; return raySphere(o, d, e.x, e.y + 0.35 * sc, e.z, 0.6 * sc, maxT); }
    var h = raySphere(o, d, e.x, e.y + 1.55 * sc * k, e.z, 0.22 * sc, maxT);
    if (h >= 0) { lastZone = 'head'; return h; }
    var a = raySphere(o, d, e.x, e.y + 1.05 * sc * k, e.z, 0.5 * sc * (k < 1 ? 0.8 : 1), maxT);
    var b = raySphere(o, d, e.x, e.y + 0.45 * sc * k, e.z, 0.42 * sc * (k < 1 ? 0.8 : 1), maxT);
    if (a < 0) { lastZone = 'legs'; return b; }
    if (b < 0 || a <= b) { lastZone = 'torso'; return a; }
    lastZone = 'legs'; return b;
  }
  function rayVehicle(o, d, v, maxT) {
    var f = U.yawToDir(v.yaw), rx = -f.z, rz = f.x;
    var dx = o.x - v.x, dz = o.z - v.z;
    var ox = dx * rx + dz * rz, oy = o.y - v.y, oz = dx * f.x + dz * f.z;
    var ddx = d.x * rx + d.z * rz, ddz = d.x * f.x + d.z * f.z;
    return U.rayAabb(ox, oy, oz, ddx, d.y, ddz, -v.hw, -0.1, -v.hl, v.hw, v.cls.height, v.hl, maxT);
  }
  // Hitscan trace: buildings, the ground, peds (three spheres, a zone), vehicles (oriented box), the helicopter.
  // out = {t, x, y, z, entity, zone, building, ground, water, nx, ny, nz}
  function trace(o, d, range, shooter, out) {
    var Wd = W(), bestT = range, hitE = null, hb = null, zone = null;
    out.ground = false; out.water = false; out.nx = out.ny = out.nz = 0;
    var b = Wd.raycastBuildings(o.x, o.y, o.z, d.x, d.y, d.z, range);
    if (b) { bestT = b.t; hb = b; }
    if (d.y < -1e-4) {
      // march the ground along the ray (a shoreline, a kerb or a ramp edge between the gun and a target below it stops the shot;
      // the camera's hover trace runs the same test, so the sight never shows a hit the bullet cannot make)
      var step = Math.max(1.5, bestT / 90), prevT = 0, tg = -1, gy = 0;
      for (var st = step; ; st += step) {
        var tt = Math.min(st, bestT), sy = o.y + d.y * tt;
        gy = Wd.heightAt(o.x + d.x * tt, o.z + d.z * tt, o.y);
        if (sy <= gy) {
          // the crossing is in (prevT, tt]: two bisections are plenty at this step
          var lo = prevT, hi = tt;
          for (var bi = 0; bi < 4; bi++) { var mid = (lo + hi) * 0.5; if (o.y + d.y * mid <= Wd.heightAt(o.x + d.x * mid, o.z + d.z * mid, o.y)) hi = mid; else lo = mid; }
          tg = hi; gy = Wd.heightAt(o.x + d.x * tg, o.z + d.z * tg, o.y); break;
        }
        prevT = tt; if (tt >= bestT) break;
      }
      if (tg > 0 && tg < bestT) { bestT = tg; hb = null; out.ground = true; out.water = gy <= (C.WATER_Y != null ? C.WATER_Y : -1.2) + 0.05; }
    }
    var mx = o.x + d.x * bestT * 0.5, mz = o.z + d.z * bestT * 0.5;
    var list = E().hash.query(mx, mz, bestT * 0.5 + 4, scratch);
    for (var i = 0; i < list.length; i++) {
      var e = list[i], t = -1;
      if (e === shooter || e.removed || (shooter && e === shooter.inVehicle)) continue;   // never your own car
      if (e.kind === 'ped' || e.kind === 'player') { if (!e.alive || e.inVehicle) continue; t = rayPed(o, d, e, bestT); if (t >= 0 && t < bestT) zone = lastZone; }
      else if (e.kind === 'vehicle') { if (e.sinking) continue; t = rayVehicle(o, d, e, bestT); }
      else if (e.kind === 'heli') { if (e.down) continue; t = raySphere(o, d, e.x, e.y, e.z, e.hitRadius || (e.radius ? e.radius + 0.4 : 3.4), bestT); }   // the police helicopter 3.4 m, a boss weak point its own size
      else continue;
      if (t >= 0 && t < bestT) { bestT = t; hitE = e; hb = null; out.ground = false; out.water = false; if (e.kind !== 'ped' && e.kind !== 'player') zone = null; }
    }
    out.t = bestT; out.entity = hitE; out.building = hb; out.zone = hitE ? zone : null;
    out.x = o.x + d.x * bestT; out.y = o.y + d.y * bestT; out.z = o.z + d.z * bestT;
    if (hb) { out.nx = hb.normal.x; out.ny = hb.normal.y; out.nz = hb.normal.z; }
    return out;
  }
  var traceOut = { t: 0, x: 0, y: 0, z: 0, entity: null, zone: null, building: null, ground: false, water: false, nx: 0, ny: 0, nz: 0 };

  // ------------------------------------------------------------------ fx --
  function muzzleFlash(o, d, quiet) {
    var x = o.x + d.x * 0.06, y = o.y + d.y * 0.06, z = o.z + d.z * 0.06;
    if (quiet) { fx({ type: 'puff', x: x, y: y, z: z, vx: d.x * 1.2, vy: 0.5, vz: d.z * 1.2, size: 0.18, life: 0.25, color: 0xb0b0b0 }); return; }
    fx({ type: 'explosion', x: x, y: y, z: z, size: 0.5, life: 0.06, color: 0xfff1b8 });
    fx({ type: 'spark', x: x, y: y, z: z, vx: d.x * 7, vy: d.y * 7 + 0.5, vz: d.z * 7, size: 0.3, life: 0.1, color: 0xffe08a });
    fx({ type: 'puff', x: x, y: y + 0.05, z: z, vx: d.x * 1.5, vy: 0.9, vz: d.z * 1.5, size: 0.26, life: 0.45, color: 0x9a9a9a });
  }
  function tracer(o, d, hit, id) {
    var w = WEAPONS[id] || {}, life = w.cls === 'smg' || w.cls === 'lmg' ? 0.07 : w.cls === 'sniper' ? 0.14 : 0.09;
    fx({ type: 'tracer', x: o.x + d.x * 0.1, y: o.y + d.y * 0.1, z: o.z + d.z * 0.1, x2: hit.x, y2: hit.y, z2: hit.z, life: life });
    // a bright bolt racing down the line so the shot reads at a distance (the line itself is one pixel wide)
    var bs = w.cls === 'sniper' ? 260 : 110, bl = Math.min(life, Math.max(0.03, (hit.t - 0.5) / bs));
    fx({ type: 'spark', x: o.x + d.x * 0.3, y: o.y + d.y * 0.3, z: o.z + d.z * 0.3, vx: d.x * bs, vy: d.y * bs, vz: d.z * bs, size: 0.4, life: bl, color: 0xfff6c8 });
  }
  // impact fx per surface: walls (dust, chips and a bullet hole), the ground (dust, a decal), water (a splash), peds, vehicles
  // (sparks and a dent puff), cover objects (sparks off the edge)
  function impactFx(hit, kind) {
    var r = R();
    if (kind === 'wall') {
      fx({ type: 'puff', x: hit.x + hit.nx * 0.12, y: hit.y + hit.ny * 0.12, z: hit.z + hit.nz * 0.12, size: 0.42, life: 0.35, color: 0xcfcac0, vy: 0.3 });
      for (var i = 0; i < 2; i++) fx({ type: 'spark', x: hit.x + hit.nx * 0.05, y: hit.y, z: hit.z + hit.nz * 0.05, vx: hit.nx * 3 + r.range(-2, 2), vy: r.range(1, 3), vz: hit.nz * 3 + r.range(-2, 2), size: 0.2, life: 0.25 });
      fx({ type: 'hole', x: hit.x + hit.nx * 0.012, y: hit.y + hit.ny * 0.012, z: hit.z + hit.nz * 0.012, nx: hit.nx, ny: hit.ny, nz: hit.nz, size: 0.11, life: 25, color: 0x1c1b1a });
    } else if (kind === 'water') {
      fx({ type: 'puff', x: hit.x, y: hit.y + 0.15, z: hit.z, size: 0.55, life: 0.45, color: 0xd8f0fa, vy: 2.2 });
      fx({ type: 'ring', x: hit.x, y: hit.y + 0.05, z: hit.z, size: 0.9, life: 0.5, color: 0xd8f0fa });
    } else if (kind === 'ground') {
      fx({ type: 'puff', x: hit.x, y: hit.y + 0.1, z: hit.z, size: 0.5, life: 0.4, color: 0xb8ad98, vy: 0.8 });
      fx({ type: 'decal', x: hit.x, y: hit.y, z: hit.z, size: 0.22, size2: 0.22, life: 20, color: 0x2a2a2a });
    } else if (kind === 'ped') {
      fx({ type: 'puff', x: hit.x, y: hit.y, z: hit.z, size: 0.4, life: 0.3, color: 0xffe2c0, vy: 0.6 });
      fx({ type: 'spark', x: hit.x, y: hit.y, z: hit.z, vx: r.range(-1, 1), vy: 1.5, vz: r.range(-1, 1), size: 0.22, life: 0.2, color: 0xfff0a0 });
    } else if (kind === 'vehicle' || kind === 'cover') {
      for (var k = 0; k < 3; k++) fx({ type: 'spark', x: hit.x, y: hit.y, z: hit.z, vx: r.range(-3, 3), vy: r.range(1, 3), vz: r.range(-3, 3), size: 0.22, life: 0.25 });
      fx({ type: 'puff', x: hit.x, y: hit.y, z: hit.z, size: 0.3, life: 0.3, color: kind === 'cover' ? 0xcfcac0 : 0xd8d8d8 });
    }
  }
  function textFx(text, x, y, z, color, life) { fx({ type: 'text', text: text, x: x, y: y, z: z, color: color || '#ff3fa4', life: life || 1.2 }); }
  // a shell casing out of the ejection port: to the right of the gun, up, gravity, one bounce (the Render.fx 'casing' type registered below)
  function ejectCasing(ped, o, d, id) {
    var rx = -d.z, rz = d.x, rl = Math.sqrt(rx * rx + rz * rz) || 1; rx /= rl; rz /= rl;
    var r = R(), red = WEAPONS[id] && WEAPONS[id].cls === 'shotgun';
    var bx = o.x - d.x * 0.35, by = o.y + 0.02, bz = o.z - d.z * 0.35;
    fx({ type: 'casing', x: bx, y: by, z: bz, vx: rx * 2 + r.range(-0.4, 0.4) + (ped.vx || 0) * 0.5, vy: 2.5 + r.range(-0.3, 0.3), vz: rz * 2 + r.range(-0.4, 0.4) + (ped.vz || 0) * 0.5, life: 0.9, color: red ? 0xd8322a : 0xd8b24a, size: red ? 0.07 : 0.06 });
  }
  // ----------------------------------------------------------- targeting --
  // signed angle from dir (x,z) to (dx,dz): positive = counter-clockwise seen from above
  function signedAngle(dir, dx, dz) { return Math.atan2(dir.x * dz - dir.z * dx, dir.x * dx + dir.z * dz); }
  function validTarget(e, shooter, allowVehicles) {
    if (!e || e === shooter || e.removed) return false;
    if (e.kind === 'ped' || e.kind === 'player') return e.alive && !e.inVehicle;
    if (e.kind === 'vehicle') return !!allowVehicles && !e.wreck && !e.sinking && !!e.driver && !e.hasPlayer();
    if (e.kind === 'heli') return !!allowVehicles && !e.down && !e.leaving;
    return false;
  }
  // the five-star helicopter sits 30 m up: the lock-on and the hitscan reach for it (the sniper reaches it at full range anyway)
  function reachFor(e, range) { return e && e.kind === 'heli' ? range * 1.9 : range; }
  // best target in a cone: facing dir {x,z}, half arc (rad), range; LOS vs buildings; hostiles first (and for the player's assist,
  // `strict` limits it to the assistable)
  function bestInCone(shooter, dir, halfArc, range, needLos, allowVehicles, strict) {
    var list = E().hash.query(shooter.x, shooter.z, range + 1, scratch2), best = null, bestS = 1e9;
    var ox = shooter.x, oy = shooter.y + 1.3, oz = shooter.z;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!validTarget(e, shooter, allowVehicles)) continue;
      if (shooter.kind !== 'player' && e.kind !== 'player' && e !== shooter.aimTarget) continue;   // AI shooters only fight the player (or a set target)
      if (strict && shooter.kind === 'player' && !assistable(e, shooter)) continue;
      var dx = e.x - ox, dz = e.z - oz, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.3 || d > range + (e.kind === 'vehicle' ? e.hl : 0.4)) continue;
      if (Math.abs(e.y - shooter.y) > 6) continue;
      var ang = Math.abs(signedAngle(dir, dx / d, dz / d));
      if (ang > halfArc) continue;
      if (needLos && !losClear(ox, oy, oz, e.x, chestY(e), e.z)) continue;
      var s = d / range + ang * 1.2 - (hostileRole(e) ? 0.35 : 0);
      if (s < bestS) { bestS = s; best = e; }
    }
    return best;
  }
  // the camera ray through the screen centre, stopped by buildings, entities and the ground
  function cameraRay() {
    var Rd = GTP.Render, cam = Rd && Rd.camera; if (!cam) return null;
    _dir = _dir || new THREE.Vector3();
    cam.getWorldDirection(_dir);
    return { o: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, d: { x: _dir.x, y: _dir.y, z: _dir.z } };
  }
  function cameraAimPoint(p, range) {
    var cr = cameraRay();
    if (!cr) { var f = U.yawToDir(p.yaw); return { x: p.x + f.x * range, y: p.y + 1.3, z: p.z + f.z * range, entity: null, zone: null, dist: range }; }
    var dc = U.dist2d(cr.o.x, cr.o.z, p.x, p.z);
    // the sight reaches as far as a shot at the helicopter does (1.9x), so a helicopter under the crosshair is the hover target
    var h = trace(cr.o, cr.d, range * 1.9 + dc + 2, p, traceOut);
    return { x: h.x, y: h.y, z: h.z, entity: h.entity, zone: h.zone, dist: Math.max(0, h.t - dc), dir: cr.d, o: cr.o };
  }
  // where a hip shot goes without a target: along the camera's yaw, level at the rig's resting pitch (0.2) and tilting with the look
  // (the chase camera itself looks down at the player, so its screen centre would put hip fire into the pavement); a thrown thing
  // goes where the screen centre meets the ground, within its range
  function hipPoint(p, w, range) {
    var r = rig(), cy = camYaw(), f = U.yawToDir(cy), sc = (p.look && p.look.scale) || 1;
    if (w.lobbed && !w.impact) {
      var cp = cameraAimPoint(p, range);
      if (cp.dist >= 2.5 && cp.dist <= range) return { x: cp.x, y: cp.y, z: cp.z, entity: cp.entity, zone: cp.zone, dist: cp.dist };
      return { x: p.x + f.x * range * 0.6, y: p.y + 0.3, z: p.z + f.z * range * 0.6, entity: null, zone: null, dist: range * 0.6 };
    }
    var e = U.clamp(0.2 - (r ? r.pitch : 0.2), -0.5, 0.7), ce = Math.cos(e), se = Math.sin(e);
    var o = { x: p.x, y: p.y + 1.35 * sc * crouchK(p), z: p.z }, d = { x: f.x * ce, y: se, z: f.z * ce };
    var h = trace(o, d, range, p, traceOut);
    return { x: h.x, y: h.y, z: h.z, entity: h.entity, zone: h.zone, dist: h.t };
  }
  // the centre of a ped's hit zone (the sight rests on the sphere; the shot goes for its middle)
  function zonePoint(e, zone, dist) {
    var sc = (e.look && e.look.scale) || 1, k = crouchK(e), h = zone === 'head' ? 1.55 : zone === 'torso' ? 1.05 : zone === 'legs' ? 0.45 : 0.35;
    return { x: e.x, y: e.y + h * sc * (zone === 'prone' ? 1 : k), z: e.z, entity: e, zone: zone, dist: dist };
  }
  // the angle between the camera ray and the direction from the camera to a point
  function rayAngleTo(cr, x, y, z) {
    var vx = x - cr.o.x, vy = y - cr.o.y, vz = z - cr.o.z, l = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    return Math.acos(U.clamp((vx * cr.d.x + vy * cr.d.y + vz * cr.d.z) / l, -1, 1));
  }

  // ------------------------------------------------------------ aim mode --
  var aim = {
    active: false, target: null, hover: null, point: null, screen: null, targetScreen: null, weapon: 'fist', inRange: false, lockT: 0, zone: null, range: 0,
    hip: false, assist: true, snapT: 0, wasActive: false, crosshair: null, hop: false
  };
  function lockValid(p, e, cd, range) {
    if (!validTarget(e, p, true)) return false;
    var dx = e.x - p.x, dz = e.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > range * 1.3 || d < 0.3) return false;
    if (Math.abs(signedAngle(cd, dx / d, dz / d)) > 0.75) return false;
    return losClear(p.x, p.y + 1.3, p.z, e.x, chestY(e), e.z);
  }
  // lock candidates in a cone around the camera yaw: assistable bodies anywhere in it; anyone else only right under the crosshair
  function lockCandidates(p, cd, range, halfArc, out, rocket) {
    var list = E().hash.query(p.x, p.z, range + 1, scratch2), cr = cameraRay();
    out.length = 0;
    var ox = p.x, oy = p.y + 1.3, oz = p.z;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!validTarget(e, p, true)) continue;
      if (e.kind === 'vehicle' && !e.isPolice && !rocket) continue;   // the launcher locks any driven car; guns only cruisers
      var dx = e.x - ox, dz = e.z - oz, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.3 || d > range) continue;
      if (Math.abs(e.y - p.y) > (e.kind === 'heli' ? 60 : 6)) continue;
      var sa = signedAngle(cd, dx / d, dz / d);
      if (Math.abs(sa) > halfArc) continue;
      var okAssist = assistable(e, p) || (rocket && e.kind === 'vehicle');
      if (!okAssist && !(cr && rayAngleTo(cr, e.x, chestY(e), e.z) < 5 * DEG)) continue;   // a bystander locks only when aimed at on purpose
      if (!losClear(ox, oy, oz, e.x, chestY(e), e.z)) continue;
      var bonus = (hostileRole(e) ? 0.35 : 0) + (rocket && (e.kind === 'vehicle' || e.kind === 'heli') ? 0.6 : 0);
      out.push({ e: e, score: d / range + Math.abs(sa) * 1.2 - bonus, ang: sa, d: d });
    }
    return out;
  }
  // turn the camera rig toward a world point: gain per second, the over-the-shoulder offset handled by measuring the real
  // camera ray (the rig moves its camera with the pitch, so this converges over a few steps instead of solving it)
  function steerCamera(x, y, z, gain, dt) {
    var r = rig(), cr = cameraRay(); if (!r || !cr) return 0;
    var vx = x - cr.o.x, vy = y - cr.o.y, vz = z - cr.o.z, hl = Math.sqrt(vx * vx + vz * vz) || 1;
    var dl = Math.sqrt(cr.d.x * cr.d.x + cr.d.z * cr.d.z) || 1;
    var yawErr = signedAngle({ x: cr.d.x / dl, z: cr.d.z / dl }, vx / hl, vz / hl);
    var elevT = Math.atan2(vy, hl), elevC = Math.atan2(cr.d.y, dl), pe = elevT - elevC;
    var k = 1 - Math.exp(-gain * dt), CAM = C.CAMERA;
    r.yaw -= yawErr * k;   // signedAngle is clockwise-positive against the rig's counter-clockwise yaw
    r.pitch = U.clamp(r.pitch - pe * k * 1.25, CAM.pitchMin, CAM.pitchMax);
    return Math.sqrt(yawErr * yawErr + pe * pe);
  }
  function updateAim(p, dt) {
    var In = GTP.Input, Rd = GTP.Render;
    var w = eff(p, p.weapon) || WEAPONS.fist;
    var active = !!p.aiming && p.alive && !p.knockedDown && !p.swimming && !p._vault && (!p.inVehicle || driveByWeapon(p.weapon));
    aim.weapon = p.weapon; aim.assist = settings.aimAssist;
    var rising = active && !aim.wasActive; aim.wasActive = active;
    aim.active = active;
    var range = w.melee ? 7 : Math.max(w.range, 8);
    if (!active) {
      aim.target = null; aim.point = null; aim.targetScreen = null; aim.zone = null; p.lockTarget = null; aim.snapT = 0; aim.hop = false;
      aim.hip = !!(p.alive && !p.inVehicle && !w.melee && !w.cone && p.weapon !== 'fist');
      if (aim.hip) {
        // the hip crosshair: a dot where a hip shot would go (the UI draws it from hud().crosshair)
        var hp = hipPoint(p, w, range); aim.hover = hp.entity || null; aim.range = hp.dist || 0;
        aim.screen = Rd && Rd.worldToScreen ? Rd.worldToScreen(hp.x, hp.y, hp.z) : null;
      } else { aim.hover = null; aim.screen = null; }
      decayAimPitch(p, dt);
      return;
    }
    aim.hip = false;
    var cd = U.yawToDir(camYaw());
    var cur = p.lockTarget;
    if (scope.active) cur = null;   // the scope is a pure sight: no lock-on magnetism
    else {
      if (cur && !lockValid(p, cur, cd, reachFor(cur, range))) {
        // a hard lock (kind 'heli': the police helicopter, a boss weak point) whose target went down hands over like a fresh aim
        // press: it dragged the rig up to the pitch limit, where the 6-degree crosshair re-acquire below never finds a body again
        if (cur.kind === 'heli' && (cur.removed || cur.down)) aim.hop = true;
        cur = null;
      }
      if (aim.hop && In.look && (In.look.dx || In.look.dy)) aim.hop = false;   // the player took the camera back
      var cycle = In.pressed('lockOn') && !wheel.open, hop = !!aim.hop && !cur && !cycle && settings.aimAssist;
      if ((rising && settings.aimAssist) || cycle || hop) {
        var cands = lockCandidates(p, cd, range, (rising || hop ? 20 : 45) * DEG, candBuf, !!w.rocket);
        if (cands.length) {
          if (cycle && cur) {
            cands.sort(function (a, b) { return a.ang - b.ang; });
            var idx = -1;
            for (var i = 0; i < cands.length; i++) if (cands[i].e === cur) { idx = i; break; }
            cur = cands[(idx + 1) % cands.length].e;
          } else {
            var best = cands[0];
            for (var k = 1; k < cands.length; k++) if (cands[k].score < best.score) best = cands[k];
            cur = best.e;
          }
          aim.hop = false;
          if (cur !== p.lockTarget) { aim.lockT = simT(); aim.snapT = 0; sfx('ui', p.x, p.z, 0.2); emit('aim:assist', { target: cur }); }
        } else if (cycle) cur = null;
      }
      if (!cur && !rising && !cycle && settings.aimAssist) {
        // held aim re-acquires: a body the crosshair passes over (within 6°), or the helicopter anywhere in the cone (the rig cannot
        // look up at it)
        var cr0 = cameraRay(), cs = lockCandidates(p, cd, range * (w.rocket ? 1 : 1.9), 20 * DEG, candBuf, !!w.rocket), pick = null;
        for (var q = 0; q < cs.length; q++) {
          var ce = cs[q].e; if (ce.kind !== 'heli' && cs[q].d > range) continue;
          if (ce.kind === 'heli' || (cr0 && rayAngleTo(cr0, ce.x, chestY(ce), ce.z) < 6 * DEG)) { if (!pick || cs[q].score < pick.score) pick = cs[q]; }
        }
        if (pick) { cur = pick.e; aim.lockT = simT(); aim.snapT = 0.31; aim.hop = false; }   // no snap: it is already under the sight
      }
    }
    // the assist: a snap onto the lock (0.3 s), then a light stickiness while the crosshair stays near it; looking well away
    // from it drops the lock (free aim)
    var cr = cameraRay();
    // a hard lock: the helicopter sits above where the rig can look, so its lock holds and the shots go to it
    var hard = !!cur && cur.kind === 'heli';
    if (cur && cr) {
      aim.snapT += dt;
      var tp = cur.kind === 'ped' || cur.kind === 'player' ? zonePoint(cur, 'torso', 0) : { x: cur.x, y: chestY(cur), z: cur.z };
      var off = rayAngleTo(cr, tp.x, tp.y, tp.z);
      if (aim.snapT > 0.35 && off > 10 * DEG && !hard) cur = null;
      else steerCamera(tp.x, tp.y, tp.z, aim.snapT <= 0.3 ? 16 : (settings.aimAssist ? 3.5 : 0), dt);
    }
    p.lockTarget = aim.target = cur;
    var pt, cp = cameraAimPoint(p, range);
    // the shot goes where the screen centre rests (aimed shots travel the camera's line, see hitscan); a lock pulls the shot onto
    // itself only when the crosshair is within 3° of it and rests on nothing else
    pt = cp;
    if (cur && cp.entity !== cur && cr && !(cp.entity && cp.entity !== cur)) {
      var cx = chestY(cur);
      if (hard || rayAngleTo(cr, cur.x, cx, cur.z) < (p.inVehicle ? 8 : 3) * DEG || aim.snapT <= 0.3) pt = { x: cur.x, y: cx, z: cur.z, entity: cur, zone: 'torso', dist: U.dist2d(p.x, p.z, cur.x, cur.z) };
    }
    aim.point = pt; aim.hover = pt.entity || null; aim.zone = pt.entity ? pt.zone : null; aim.range = pt.dist || 0;
    aim.inRange = U.dist2d(p.x, p.z, pt.x, pt.z) <= w.range + 0.5;
    aim.screen = Rd && Rd.worldToScreen ? Rd.worldToScreen(pt.x, pt.y, pt.z) : null;
    aim.targetScreen = cur && Rd && Rd.worldToScreen ? Rd.worldToScreen(cur.x, chestY(cur) + (cur.kind === 'vehicle' ? 0 : 0.1), cur.z) : null;
    // the body pitch the anim reads: the elevation of the shot from the shoulder
    var sy = p.y + 1.38 * ((p.look && p.look.scale) || 1) * crouchK(p), hd = U.dist2d(p.x, p.z, pt.x, pt.z);
    if (hd > 0.5) p._aimPitch = U.clamp(Math.atan2(pt.y - sy, hd), -1.2, 1.2);
  }
  function decayAimPitch(p, dt) { if (p._aimPitch && !(p.firePoseT > 0)) p._aimPitch = U.damp(p._aimPitch, 0, 6, dt); }
  // the per-class ADS fov (Render.rig.update reads CAMERA.aimFov; the wrapper sets it around each call)
  function adsFov(base) {
    var p = player(); if (!p || !p.aiming) return base;
    var w = eff(p, p.weapon); if (!w) return base;
    return Math.max(20, base * (ADS[w.cls] || 1) + (w.adsDeg || 0));
  }

  // ---------------------------------------------------------------- ammo --
  // player.ammo[id] = {mag, reserve, total}; player.weapons[id] stays the total (saves, missions, pickups and tests write it),
  // so the split is reconciled against the total every time it is read: new rounds fill the magazine first, then the reserve.
  function ammoOf(p, id) {
    var w = WEAPONS[id]; if (!w || w.melee || !p.weapons) return null;
    p.ammo = p.ammo || {};
    var total = p.weapons[id];
    if (!(total > 0)) { delete p.ammo[id]; return null; }
    var a = p.ammo[id], mag = magOf(p, id);
    if (total === Infinity) { if (!a) a = p.ammo[id] = {}; a.mag = mag || Infinity; a.reserve = Infinity; a.total = Infinity; return a; }
    if (!a) a = p.ammo[id] = { mag: 0, reserve: 0, total: 0 };
    if (!mag) { a.mag = 0; a.reserve = total; a.total = total; return a; }
    if (a.total !== total) {
      var delta = total - a.total;
      if (delta > 0) { var fill = Math.min(Math.max(0, mag - a.mag), delta); a.mag += fill; a.reserve += delta - fill; }
      else { a.reserve = Math.max(0, a.reserve + delta); if (a.mag + a.reserve > total) a.mag = Math.max(0, total - a.reserve); a.reserve = total - a.mag; }
      a.total = total;
    }
    if (a.mag > mag) { a.reserve += a.mag - mag; a.mag = mag; }   // the extended magazine came off
    return a;
  }
  function setAmmo(p, id, mag, reserve) {
    var a = ammoOf(p, id) || (p.ammo[id] = { mag: 0, reserve: 0, total: 0 });
    a.mag = mag; a.reserve = reserve; a.total = mag + reserve; p.weapons[id] = a.total;
    if (!(a.total > 0)) { delete p.ammo[id]; }
    return a;
  }
  // the most rounds a weapon holds (mag + reserve; the rampage_king strand reward raises the reserve by half, QA STR-15)
  function ammoCap(p, id) {
    var w = WEAPONS[id]; if (!w) return 0;
    var Ms = GTP.Missions && GTP.Missions.state, king = !!(Ms && Ms.flags && Ms.flags.rampage_king);
    return (magOf(p, id) || 0) + Math.round((w.reserve || 0) * (king ? 1.5 : 1));
  }
  // give rounds to a weapon (a new one gets a full magazine first); capped at ammoCap; returns the rounds that fit
  function giveAmmo(p, id, n, cap) {
    var w = WEAPONS[id]; if (!w || !(n > 0)) return 0;
    if (w.melee) { p.weapons[id] = Infinity; return Infinity; }
    var have = p.weapons[id] > 0 ? p.weapons[id] : 0, max = ammoCap(p, id);
    var give = cap && max ? Math.max(0, Math.min(n, max - have)) : n;
    p.weapons[id] = have + give; ammoOf(p, id);
    return give;
  }

  // -------------------------------------------------------------- reload --
  function canReload(p, id) {
    var w = eff(p, id), a = ammoOf(p, id);
    return !!(w && w.mag && a && a.mag < w.mag && a.reserve > 0 && !(p.reloadT > 0));
  }
  function startReload(p, id) {
    if (!canReload(p, id)) return false;
    var w = WEAPONS[id];
    p.reloadT = w.reload; p.reloadTotal = w.reload; p.reloadId = id; p._reloadInCar = !!p.inVehicle;
    sfx('reload', p.x, p.z, w.cls === 'shotgun' ? 0.5 : w.cls === 'pistol' ? 1 : 0.8);
    emit('reload', { ped: p, id: id, phase: 'start', seconds: w.reload });
    return true;
  }
  function cancelReload(p) {
    if (!(p.reloadT > 0)) return;
    p.reloadT = 0; p.reloadTotal = 0;
    emit('reload', { ped: p, id: p.reloadId, phase: 'cancel' });
  }
  function tickReload(p, dt) {
    if (!(p.reloadT > 0)) return;
    if (p.weapon !== p.reloadId || !p.alive || p.knockedDown || !!p.inVehicle !== p._reloadInCar || p.entering) { cancelReload(p); return; }
    p.reloadT -= dt;
    if (p.reloadT > 0) return;
    var w = WEAPONS[p.reloadId], a = ammoOf(p, p.reloadId), mag = magOf(p, p.reloadId);
    if (!w || !a) { p.reloadT = 0; return; }
    if (w.shellReload) {
      // one shell at a time; another click if there is room and a shell left
      if (a.mag < mag && a.reserve > 0) { setAmmo(p, p.reloadId, a.mag + 1, a.reserve - 1); }
      if (a.mag < mag && a.reserve > 0) { p.reloadT += w.reload; sfx('reload', p.x, p.z, 0.5); return; }
    } else {
      var n = Math.min(mag - a.mag, a.reserve);
      setAmmo(p, p.reloadId, a.mag + n, a.reserve - n);
    }
    p.reloadT = 0;
    sfx('reloadDone', p.x, p.z, 0.6);
    emit('reload', { ped: p, id: p.reloadId, phase: 'done' });
  }

  // --------------------------------------------------------------- bloom --
  // the cone opens with each shot and closes while the trigger rests (twice as fast standing still and aiming)
  var bloom = { cone: 0, max: 0.04, k: 0, burst: 0, id: null, lastShot: -9 };
  function tickBloom(p, dt) {
    var w = eff(p, p.weapon);
    if (!w || !w.bloom) { bloom.cone = 0; bloom.k = 0; bloom.max = w && w.spread ? w.spread : 0; bloom.burst = 0; bloom.id = p.weapon; return; }
    if (bloom.id !== p.weapon) { bloom.id = p.weapon; bloom.cone = 0; bloom.burst = 0; }
    bloom.max = w.bloom.max;
    var now = simT();
    if (now - bloom.lastShot > Math.max(0.12, 1 / w.rate + 0.05)) {   // "not firing": the trigger has rested longer than the weapon's cadence
      var still = Math.abs(p.vx || 0) + Math.abs(p.vz || 0) < 0.3, rate = w.bloom.decay * (still && p.aiming ? 2 : 1);
      bloom.cone = Math.max(0, bloom.cone - rate * dt);
    }
    if (now - bloom.lastShot > 0.5) bloom.burst = 0;
    bloom.k = bloom.max > 0 ? bloom.cone / bloom.max : 0;
  }
  function playerSpread(p, w, locked, hip) {
    var base = w.spread || 0;
    if (w.scope) base = scope.active ? (w.scopedSpread || 0) : w.spread;
    else if (w.aimSpread != null && p.aiming) base = w.aimSpread;
    if (hip) base = locked ? base * 1.1 + 0.002 : base * 1.6 + 0.004;   // from the hip: looser (the assist's target still gets a near-aimed cone)
    if (p.cover && p.cover.blind) base = base * 2.5 + 0.03;   // blind fire over or around cover
    if (w.pointShots && bloom.burst < w.pointShots && !hip) return base;   // the first rounds of a burst from rest: the "point"
    return base + bloom.cone * (locked ? 0.5 : 1);   // a lock-on is an aim assist: half the bloom lands on a locked target
  }
  function bloomShot(w) {
    if (!w.bloom) return;
    bloom.cone = Math.min(w.bloom.max, bloom.cone + w.bloom.add); bloom.lastShot = simT(); bloom.burst++;
    bloom.k = bloom.max > 0 ? bloom.cone / bloom.max : 0;
  }
  // the recoil pattern: a climb that grows over the burst and a sideways wander per weapon (seeded by the id), +-10% noise
  var patSeed = {};
  function recoilKick(p, w, id) {
    var r = rig(); if (!r || !r.kick || !w.recoil) return;
    var n = bloom.burst, s = patSeed[id] != null ? patSeed[id] : (patSeed[id] = (U.hash ? U.hash(id) : id.length) % 7);
    var pitch = w.recoil * (1 + Math.min(n, 8) * 0.06) * R().range(0.9, 1.1) * (p.inVehicle ? 0.5 : 1) * (p.cover && !p.cover.peek ? 0.7 : 1);
    var yaw = w.recoil * (0.35 * Math.sin(n * 0.7 + s) + (n > 4 ? (s % 2 ? 0.22 : -0.22) : 0)) + w.recoil * R().range(-0.12, 0.12);
    r.kick(pitch, yaw, w.auto ? 0.12 : 0.25);
  }

  // --------------------------------------------------------- hit markers --
  var hitmark = { t: -9, kill: false, zone: null, target: null, weapon: null };
  function markHit(shooter, e, killed, zone, hit, id) {
    if (!shooter || shooter.kind !== 'player') return;
    var now = simT(), fresh = now - hitmark.t < 0.4;
    hitmark.kill = !!killed || (hitmark.kill && fresh); hitmark.t = now; hitmark.zone = zone || null; hitmark.target = e; hitmark.weapon = id;
    if (killed) { hitmark.kill = true; sfx('confirm', shooter.x, shooter.z, 0.6); if (e.kind === 'ped') textFx(failText('wasted'), e.x, e.y + 2.0, e.z, '#ff3fa4', 1.0); }
    else if (hitmark._sfxT !== now) { hitmark._sfxT = now; sfx('hitmark', shooter.x, shooter.z, 0.35); }
    if (zone === 'head' && (e.kind === 'ped' || e.kind === 'player')) {
      shooter.stats.headshots = (shooter.stats.headshots || 0) + 1;
      textFx('WRITE THAT DOWN', e.x, e.y + 2.15, e.z, '#ffffff', 0.8);
      if (killed) { var r = R(); for (var i = 0; i < 5; i++) fx({ type: 'spark', x: hit.x, y: hit.y + 0.1, z: hit.z, vx: r.range(-3, 3), vy: r.range(2, 5), vz: r.range(-3, 3), size: 0.3, life: r.range(0.3, 0.6), color: 0xffd7a0 }); }   // the hat comes off
    }
    emit('hitmarker', { kill: !!killed, zone: zone || null, target: e, weapon: id, shooter: shooter });
  }
  // a blast's victims, for the player's hit marker and kill count (QA CMB-11)
  function blastCredit(owner, e, wasAlive, id, x, y, z) {
    if (!owner || owner.kind !== 'player' || e === owner) return;
    var killed = (e.kind === 'ped' && wasAlive && !e.alive) || (e.kind === 'vehicle' && wasAlive && (e.wreck || e.exploded));
    if (killed && e.kind === 'ped') owner.stats.kills = (owner.stats.kills || 0) + 1;
    markHit(owner, e, killed, null, { x: x, y: y, z: z }, id);
  }

  // --------------------------------------------------------------- firing --
  // where this shot goes: muzzle origin, unit direction, the target entity (or null) and the aim point
  function aimContext(ped, w, id) {
    var o = muzzle(ped, id), target = null, pt = null, isPlayer = ped.kind === 'player', hip = false;
    if (isPlayer) {
      if (ped.aiming) {
        ped.aimYaw = camYaw();
        if ((w.rocket || w.lobbed) && !scope.active && aim.target && lockValid(ped, aim.target, U.yawToDir(camYaw()), reachFor(aim.target, Math.max(w.range, 8)))) target = aim.target;
        if (target) pt = { x: target.x, y: chestY(target), z: target.z };
        else { var ap = aim.point || cameraAimPoint(ped, Math.max(w.range, 8)); pt = { x: ap.x, y: ap.y, z: ap.z }; if (ap.entity) target = ap.entity; }
        o = muzzle(ped, id);
      } else if (ped.inVehicle) {
        // out of the window without aim (a throw): along the camera's look
        var cy = camYaw(), cf = U.yawToDir(cy);
        ped.aimYaw = cy; o = muzzle(ped, id);
        pt = { x: o.x + cf.x * w.range * 0.6, y: o.y - 0.2, z: o.z + cf.z * w.range * 0.6 };
      } else if (w.melee) {
        var fd = U.yawToDir(ped.yaw);
        target = bestInCone(ped, fd, 1.3, w.range + 0.6, false, false);
        if (target) { pt = { x: target.x, y: chestY(target), z: target.z }; var ty = U.dirToYaw(target.x - ped.x, target.z - ped.z); ped.yaw = ty; ped.aimYaw = ty; }
        else { ped.aimYaw = ped.yaw; pt = { x: o.x + fd.x * w.range, y: o.y - 0.12, z: o.z + fd.z * w.range }; }
      } else {
        // hip fire: along the camera (the player turns to it); the assist takes the best hostile within 30° of the camera
        hip = true;
        var cyw = camYaw(), cfd = U.yawToDir(cyw);
        target = w.noAuto || !settings.aimAssist ? null : bestInCone(ped, cfd, 30 * DEG, w.range, true, false, true);
        if (!target && !w.noAuto) target = bestInCone(ped, cfd, 6 * DEG, w.range, true, false, false);
        if (target) {
          pt = { x: target.x, y: chestY(target), z: target.z };
          ped.aimYaw = U.dirToYaw(target.x - ped.x, target.z - ped.z);
        } else {
          ped.aimYaw = cyw;
          var hp2 = hipPoint(ped, w, Math.max(w.range, 8)); pt = { x: hp2.x, y: hp2.y, z: hp2.z };
        }
        ped.yaw = ped.aimYaw;
        o = muzzle(ped, id);
      }
    } else {
      target = ped.aimTarget && !ped.aimTarget.removed ? ped.aimTarget : player();
      if (target && (!target.alive || (target.kind === 'player' && target.inVehicle && w.melee))) target = null;
      if (target) {
        var lead = w.melee ? 0 : 0.12;
        pt = { x: target.x + (target.vx || 0) * lead, y: chestY(target), z: target.z + (target.vz || 0) * lead };
        ped.aimYaw = U.dirToYaw(pt.x - ped.x, pt.z - ped.z);
        if (w.melee) ped.yaw = ped.aimYaw;
        o = muzzle(ped, id);
      } else { var f2 = U.yawToDir(ped.aimYaw || ped.yaw); pt = { x: o.x + f2.x * w.range, y: o.y, z: o.z + f2.z * w.range }; }
    }
    var dx = pt.x - o.x, dy = pt.y - o.y, dz = pt.z - o.z, l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var hd = Math.sqrt(dx * dx + dz * dz);
    if (hd > 0.3 && !w.melee) ped._aimPitch = U.clamp(Math.atan2(dy, hd), -1.2, 1.2);
    return { origin: o, dir: { x: dx / l, y: dy / l, z: dz / l }, target: target, point: pt, dist: l, hip: hip };
  }
  function dryWeapon(p, id) {
    if (id === 'fist' || WEAPONS[id] && WEAPONS[id].melee) return;
    delete p.weapons[id]; if (p.ammo) delete p.ammo[id];
    if (p.weapon === id) p.weapon = 'fist';
    toast((WEAPONS[id] ? WEAPONS[id].name : id) + ': out of ammo');
  }
  function copHeat(p, quiet) {
    var now = simT(), wd = wanted();
    if (!wd || now - (p._copHeatT || -9) < 2) return;
    var list = E().hash.query(p.x, p.z, quiet ? 12 : 32, scratch3);
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.kind !== 'ped' || !e.alive || !isCopRole(e) || e.inVehicle || e.hostile) continue;   // mission goons in uniform are the attackers, not witnesses
      if (!losClear(e.x, e.y + 1.5, e.z, p.x, p.y + 1.2, p.z)) continue;
      p._copHeatT = now; wd.crime('shootNearCop', 'shootNearCop'); return;
    }
  }
  function shotAlarm(ped, r) {
    var now = simT();
    if (now - (ped._alarmT || -9) < 0.4) return;
    ped._alarmT = now; alarm(ped.x, ped.z, r, ped, false);
  }
  function hitEntity(shooter, w, id, hit, d, dmg, volley) {
    var e = hit.entity, isPlayer = shooter.kind === 'player';
    if (e.kind === 'ped' || e.kind === 'player') {
      var zone = isPlayer ? (hit.zone || 'torso') : 'torso';   // the AI never aims for the head
      dmg *= zone === 'head' ? (w.headMul || ZONE_MUL.head) : (ZONE_MUL[zone] || 1);
      if (!isPlayer) dmg *= id === 'rifle' ? AI_RIFLE_MUL : AI_DAMAGE_MUL;
      var before = e.alive;
      e.applyDamage(dmg, shooter, id);
      if (e.alive && !e.knockedDown && !e.inVehicle) {
        if (w.floors && zone !== 'head' && isPlayer && e.kind !== 'player') e.knockDown(d.x * w.knock, d.z * w.knock, 0, shooter, id);   // the Rebuttal puts a body hit on the floor
        else if (w.stun && !w.lobbed && e.kind !== 'player') e.knockDown(d.x * 0.5, d.z * 0.5, 0, shooter, id);   // the Mute Button: down and quiet
        else { e.vx += d.x * (w.knock || 1); e.vz += d.z * (w.knock || 1); }
        // a hit reaction the anim reads (pose.hit): the zone, which way it came from
        var hr = e._hitReact || (e._hitReact = { t: 0, zone: null, dx: 0, dz: 0 }); hr.t = 0.3; hr.zone = zone; hr.dx = d.x; hr.dz = d.z;
      }
      if (!isPlayer && e.kind === 'player') shooter._hurtPlayerT = simT();
      impactFx(hit, 'ped');
      if (isPlayer) {
        if (!volley || !volley.counted) { shooter.stats.hits = (shooter.stats.hits || 0) + 1; if (volley) volley.counted = true; }   // one hit per volley (QA CMB-14)
        if (before && !e.alive) shooter.stats.kills = (shooter.stats.kills || 0) + 1;
        markHit(shooter, e, before && !e.alive, zone, hit, id);
      }
      if (e.kind === 'player') { Combat.hurtFlash = 1; shake(0.18); }
      sfx('hit', hit.x, hit.z, 0.5);
      return true;
    }
    if (e.kind === 'vehicle') {
      var wasWreck = e.wreck;
      if (!e.wreck && !e.sinking) e.applyDamage(dmg * (w.vehicleMul || 0.5), shooter, id);
      impactFx(hit, 'vehicle');
      sfx('hit', hit.x, hit.z, 0.4);
      if (isPlayer) markHit(shooter, e, !wasWreck && (e.wreck || e.burning) && !e._markedDead && (e._markedDead = true), null, hit, id);
      return true;
    }
    if (e.kind === 'heli') {
      var wasDown = e.down;
      if (e.applyDamage) e.applyDamage(dmg, shooter, id);
      impactFx(hit, 'vehicle');
      sfx('hit', hit.x, hit.z, 0.5);
      if (isPlayer) {
        if (!volley || !volley.counted) { shooter.stats.hits = (shooter.stats.hits || 0) + 1; if (volley) volley.counted = true; }
        markHit(shooter, e, !wasDown && e.down, null, hit, id);
        // shooting the police helicopter is a crime: it keeps the heat alive (and the helicopter on station) while it takes fire
        var wd = wanted(), nowH = simT();
        if (wd && !e.down && nowH - (shooter._heliHeatT || -9) > 0.6) { shooter._heliHeatT = nowH; try { wd.crime('attackCop', 'shootHeli'); } catch (err) { /* ai optional */ } }
      }
      return true;
    }
    return false;
  }
  function hitscan(ped, w, id, ctx) {
    var pellets = w.pellets || 1, isPlayer = ped.kind === 'player';
    var spread = isPlayer ? playerSpread(ped, w, !!(ctx.target && ((ped.aiming && ctx.target === aim.target) || (ctx.hip && assistable(ctx.target, ped)))), ctx.hip) : (w.spread || 0) * 2.2 + 0.03;
    var o = ctx.origin, pelletHits = null, range = reachFor(ctx.target || aim.hover, w.range), volley = { counted: false };
    if (isPlayer && ctx.target && ctx.dist > range && ctx.target === aim.target) range = ctx.dist + 1;   // a locked target is in reach of the shot
    if (!isPlayer && smokeBetween(o.x, o.z, ctx.point.x, ctx.point.z)) spread = spread * 4 + 0.08;   // shooting blind through smoke
    muzzleFlash(o, ctx.dir, w.quiet);
    if (isPlayer) muzzleLight(o, ctx.dir, w);
    // a player in cover is safe from shots that come from the far side of it (flanking works); a peek exposes them
    var shield = !isPlayer && ctx.target && ctx.target.kind === 'player' ? coverShield(ctx.target, ped) : null;
    // an aimed shot travels down the camera's sight line (from level with the muzzle), so what the crosshair sees is what it hits:
    // no parallax between the eye over the shoulder and the gun below it; the tracer still leaves the gun
    var so = o, sdir = ctx.dir;
    if (isPlayer && ped.aiming && !ped.inVehicle && ctx.point) {
      var cr = cameraRay();
      if (cr) {
        var t0 = Math.max(0, (o.x - cr.o.x) * cr.d.x + (o.y - cr.o.y) * cr.d.y + (o.z - cr.o.z) * cr.d.z);
        so = { x: cr.o.x + cr.d.x * t0, y: cr.o.y + cr.d.y * t0, z: cr.o.z + cr.d.z * t0 };
        var sx = ctx.point.x - so.x, sy = ctx.point.y - so.y, sz = ctx.point.z - so.z, sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (sl > 0.5) sdir = { x: sx / sl, y: sy / sl, z: sz / sl }; else so = o;
      }
    }
    for (var k = 0; k < pellets; k++) {
      var d = jitter(sdir, spread);
      var hit = trace(so, d, range, ped, traceOut);
      if (shield && hit.entity === ctx.target) {
        hit.entity = null; hit.x = shield.x; hit.y = Math.min(hit.y, shield.y); hit.z = shield.z; hit.t = U.dist2d(o.x, o.z, shield.x, shield.z);
        tracer(o, d, hit, id); impactFx(hit, 'cover'); continue;
      }
      tracer(o, d, hit, id);
      if (hit.entity) {
        hitEntity(ped, w, id, hit, d, w.dmg / pellets, volley);
        if (pellets > 1 && (hit.entity.kind === 'ped' || hit.entity.kind === 'player')) { pelletHits = pelletHits || {}; var key = hit.entity.id; pelletHits[key] = pelletHits[key] ? pelletHits[key] + 1 : 1; pelletHits['e' + key] = hit.entity; }
      } else if (hit.building) impactFx(hit, 'wall');
      else if (hit.ground) impactFx(hit, hit.water ? 'water' : 'ground');
    }
    // a shotgun volley that lands mostly on one ped knocks them flat
    if (pelletHits) for (var pk in pelletHits) {
      if (pk.charAt(0) === 'e') continue;
      var e = pelletHits['e' + pk];
      if (pelletHits[pk] >= 3 && e.alive && !e.knockedDown && !e.inVehicle && U.dist2d(e.x, e.z, ped.x, ped.z) < 7) e.knockDown(ctx.dir.x * 4.5, ctx.dir.z * 4.5, 0, ped, id);
    }
    var gain = w.cls === 'shotgun' ? 1 : w.cls === 'smg' ? 0.5 : w.cls === 'sniper' || id === 'revolver' ? 0.95 : 0.8;
    sfx(w.quiet ? 'reloadDone' : 'shot', o.x, o.z, w.quiet ? 0.5 : gain);
    shotAlarm(ped, w.quiet ? 8 : w.cls === 'sniper' ? 40 : 24);
    if (isPlayer) {
      ped.stats.shots = (ped.stats.shots || 0) + 1; ped.stats.shooting = (ped.stats.shooting || 0) + 1; copHeat(ped, w.quiet);
      shake(w.cls === 'shotgun' ? 0.22 : w.cls === 'smg' || w.cls === 'lmg' ? 0.05 : w.cls === 'sniper' ? 0.16 : 0.09);
      bloomShot(w);
      recoilKick(ped, w, id);
      if (w.mag) { if (w.casingDelay) ped._casingT = w.casingDelay; else ejectCasing(ped, o, ctx.dir, id); }
      if (ped.cover) { ped.cover.blindT = !ped.cover.peek ? 0.45 : 0; }
    }
    return true;
  }
  function megaphone(ped, w, ctx) {
    var dx0 = ctx.dir.x, dz0 = ctx.dir.z, l0 = Math.sqrt(dx0 * dx0 + dz0 * dz0) || 1;
    var dir = { x: dx0 / l0, z: dz0 / l0 }, isPlayer = ped.kind === 'player', r = R();
    ped.aimYaw = U.dirToYaw(dir.x, dir.z); ped.firePoseT = 0.6;
    // the wave: three rings marching out of the cone, a shout, and a few puffs
    for (var i = 0; i < 3; i++) fx({ type: 'ring', x: ped.x + dir.x * (1.3 + i * 1.75), y: ped.y + 0.12, z: ped.z + dir.z * (1.3 + i * 1.75), size: 2.0 + i * 0.9, life: 0.42 + i * 0.14, color: 0x2ee6ff });
    for (i = 0; i < 4; i++) { var dd = 1 + i * 1.3, sw = (i % 2 ? 1 : -1) * 0.5 * i; fx({ type: 'puff', x: ped.x + dir.x * dd - dir.z * sw, y: ped.y + 1.1 + r.range(-0.2, 0.3), z: ped.z + dir.z * dd + dir.x * sw, vx: dir.x * 5, vy: 0.4, vz: dir.z * 5, size: 0.45, life: 0.4, color: 0xbfefff }); }
    textFx(r.pick(SHOUTS), ped.x + dir.x * 1.2, ped.y + 1.9, ped.z + dir.z * 1.2, '#2ee6ff', 1.0);
    var list = E().hash.query(ped.x, ped.z, w.range + 1.5, scratch2), hitAny = 0;
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      if (e === ped || e.removed) continue;
      var dx = e.x - ped.x, dz = e.z - ped.z, d = Math.sqrt(dx * dx + dz * dz) || 0.001;
      if (d > w.range + (e.kind === 'vehicle' ? e.hw : 0) || Math.abs(e.y - ped.y) > 2.5) continue;
      if (Math.abs(signedAngle(dir, dx / d, dz / d)) > w.arc / 2) continue;
      if (e.kind === 'ped' || e.kind === 'player') {
        if (!e.alive || e.inVehicle) continue;
        var k = 1 - 0.4 * d / w.range, push = w.push * k, nx = dx / d, nz = dz / d;
        e.knockDown(nx * push, nz * push, 0, ped, 'megaphone');
        e.downT = 1.2; e.lastHitBy = ped;
        hitAny++;
        fx({ type: 'puff', x: e.x, y: e.y + 1.2, z: e.z, size: 0.5, life: 0.35, color: 0xbfefff });
        if (e.kind === 'player') { Combat.hurtFlash = 0.5; shake(0.3); }
      } else if (e.kind === 'vehicle') {
        if (e.driver && !e.hasPlayer() && e.honk) e.honk();   // the horn is the setlist
      }
    }
    sfx('debate', ped.x, ped.z, 0.9);
    if (isPlayer) {
      ped.stats.debating = (ped.stats.debating || 0) + 1;
      shake(0.12);
      alarm(ped.x, ped.z, 11, ped, false);
      if (hitAny && wanted()) wanted().addHeat(w.heat * Math.min(hitAny, 3), 'megaphone');
    }
    return true;
  }
  // the lob: a hottake, a hot mic, a sticky note, smoke, a latte, a confetti shell, on a ballistic arc to the aim point
  function lob(ped, w, id, ctx, fuse) {
    var o = ctx.origin, pt = ctx.point;
    var dx = pt.x - o.x, dz = pt.z - o.z, dist = Math.sqrt(dx * dx + dz * dz) || 1;
    var hx = dx / dist, hz = dz / dist;
    dist = U.clamp(dist, 2.5, w.range);
    // the low arc that lands on the aim point from the hand's height (a target: at its feet)
    var g = C.PHYS.gravity, s = w.speed, s2 = s * s;
    var landY = ctx.target && ctx.target.kind !== 'vehicle' && ctx.target.kind !== 'heli' ? Math.max(W().heightAt(pt.x, pt.z, pt.y), pt.y - 1.2) : pt.y;
    var dy = landY - (o.y + 0.15), disc = s2 * s2 - g * (g * dist * dist + 2 * dy * s2);
    var ang = disc >= 0 ? Math.atan((s2 - Math.sqrt(disc)) / (g * dist)) : Math.PI / 4;
    ang += 0.02;   // a touch of loft so it clears the hand
    var opts = { x: o.x + hx * 0.3, y: o.y + 0.15, z: o.z + hz * 0.3, owner: ped, weaponId: id, dmg: w.dmg, life: 4, lobbed: true, stun: w.stun, radius: 0.2 };
    var pr;
    if (w.fuse || w.smoke || w.splash || w.stick) { opts.life = 14; opts.fuse = fuse != null ? fuse : (w.fuse || 0); opts.radius = 0.16; pr = new HotMic(opts); }
    else pr = new GTP.Projectile(opts);
    var vv = ped.inVehicle || null;
    pr.vx = hx * s * Math.cos(ang) + (vv ? vv.vx * 0.5 : 0); pr.vz = hz * s * Math.cos(ang) + (vv ? vv.vz * 0.5 : 0); pr.vy = s * Math.sin(ang) + (ped.vy || 0);
    pr.snap();
    E().add(pr);
    ped.firePoseT = 0.5;
    sfx(w.impact ? 'shot' : 'jump', o.x, o.z, w.impact ? 0.7 : 0.4);
    if (w.impact) { muzzleFlash(o, ctx.dir, false); if (ped.kind === 'player') { recoilKick(ped, w, id); muzzleLight(o, ctx.dir, w); } }
    if (ped.kind === 'player') { ped.stats.hottakes = (ped.stats.hottakes || 0) + 1; ped.stats.shooting = (ped.stats.shooting || 0) + 1; }
    return true;
  }
  // the rocket (and the firework): straight out of the tube, a trail, the backblast
  function launch(ped, w, id, ctx) {
    var o = ctx.origin, d = ctx.dir;
    var pr = new Rocket({ x: o.x + d.x * 0.4, y: o.y + d.y * 0.4, z: o.z + d.z * 0.4, owner: ped, weaponId: id, dmg: w.dmg, life: 7, radius: 0.25 });
    pr.vx = d.x * w.speed; pr.vy = d.y * w.speed; pr.vz = d.z * w.speed;
    if (id !== 'ratio') pr.straight = 1.6;
    pr.snap();
    E().add(pr);
    muzzleFlash(o, d);
    var r = R(), bx = o.x - d.x * 1.1, bz = o.z - d.z * 1.1;
    for (var i = 0; i < 4; i++) fx({ type: 'smoke', x: bx, y: o.y, z: bz, vx: -d.x * 4 + r.range(-1, 1), vy: 0.6, vz: -d.z * 4 + r.range(-1, 1), size: 1.3, life: 0.8, color: 0x8a8a90 });
    fx({ type: 'explosion', x: bx, y: o.y, z: bz, size: 1.6, life: 0.12, color: 0xffd0a0 });
    sfx('shot', o.x, o.z, 1);
    sfx('jump', o.x, o.z, 0.6);
    ped.firePoseT = 0.6;
    if (ped.kind === 'player') {
      if (ped.onGround && !ped.inVehicle) ped._backblast = { t: 0.3, x: -d.x * 5, z: -d.z * 5 };   // the backblast: about 1.5 m of slide (held against the ground friction)
      ped.stats.shots = (ped.stats.shots || 0) + 1; ped.stats.rockets = (ped.stats.rockets || 0) + 1; ped.stats.shooting = (ped.stats.shooting || 0) + 1;
      muzzleLight(o, d, w); shake(0.45); recoilKick(ped, w, id); copHeat(ped);
    }
    shotAlarm(ped, 30);
    return true;
  }

  // ---------------------------------------------------------------- melee --
  // Light (tap: a jab, a cross, a hook that floors), heavy (hold the trigger, or aim + fire: a wind-up and a big swing), counter
  // (jump while an attacker winds up within reach: a dodge and a strike). ped._melee = {type, t (0..1), dur, at (impact
  // fraction), hit, combo, id, target}. The AI swings with a telegraphed wind-up and a cooldown, two attackers at a time.
  var MELEE = {
    light: { dur: 0.34, at: 0.45, mul: [1, 1.1, 1.5], window: 0.38 },
    heavy: { dur: 0.62, at: 0.62, mul: [2.2] },
    counter: { dur: 0.36, at: 0.35, mul: [1.8] },
    ai: { dur: 0.75, at: 0.62, mul: [1] }
  };
  function meleeAttackers(target) {
    var n = 0, list = E().hash.query(target.x, target.z, 6, scratch3);
    for (var i = 0; i < list.length; i++) { var e = list[i]; if (e !== target && e._melee && e._melee.target === target && e._melee.t < e._melee.at) n++; }
    return n;
  }
  function startMelee(ped, id, type, combo, target) {
    var spec = MELEE[type], w = WEAPONS[id] || WEAPONS.fist, slow = w.rate < 2 ? 2 / Math.max(0.8, w.rate) * 0.5 + 0.5 : 1;
    ped._melee = { type: type, t: 0, dur: spec.dur * (type === 'ai' ? 1 : slow), at: spec.at, hit: false, combo: combo || 0, id: id, target: target || null, held: 0, queued: null };
    ped.punchT = Math.max(ped.punchT || 0, 0.28);
    var f = U.yawToDir(ped.yaw);
    if (ped.onGround && !ped.swimming && type !== 'ai') { var lunge = (w.lunge || 2.4) * (type === 'heavy' ? 1.25 : type === 'counter' ? 0.6 : 0.8); ped.vx += f.x * lunge; ped.vz += f.z * lunge; }
    if (type === 'ai') { var hx = ped.x + f.x * 0.5, hz = ped.z + f.z * 0.5; fx({ type: 'spark', x: hx, y: ped.y + 1.5, z: hz, vx: 0, vy: 0.6, vz: 0, size: 0.35, life: 0.25, color: 0xffffff }); }
    if (type === 'heavy') sfx('jump', ped.x, ped.z, 0.25);
    emit('melee', { type: type, ped: ped, target: target || null, hit: false, phase: 'start' });
    return ped._melee;
  }
  // the impact frame of a swing: who is in reach in front, damage, knockback, the table flip, a dent in a car
  function meleeImpact(ped, ms) {
    var w = eff(ped, ms.id) || WEAPONS.fist, id = ms.id, isPlayer = ped.kind === 'player', now = simT();
    var f = U.yawToDir(ped.yaw), spec = MELEE[ms.type], mul = spec.mul[Math.min(ms.combo, spec.mul.length - 1)];
    var target = ms.target;
    if (target && (!target.alive || target.inVehicle || target.removed)) target = null;
    if (!target || U.dist2d(target.x, target.z, ped.x, ped.z) > w.range + 0.75) target = isPlayer ? bestInCone(ped, f, 1.1, w.range + 0.6, false, false) : (target && U.dist2d(target.x, target.z, ped.x, ped.z) <= w.range + 0.75 ? target : null);
    if (!isPlayer && ms.target && ms.target._dodgeT > 0) target = null;   // countered: the swing hits air
    if (isPlayer) ped.stats.punches = (ped.stats.punches || 0) + 1;
    if (!target) {
      // the table leg (and the other blunt things) dent a car in reach
      if (w.vehicleDmg && isPlayer) {
        var list = E().hash.query(ped.x + f.x, ped.z + f.z, w.range + 2, scratch2);
        for (var i = 0; i < list.length; i++) {
          var v = list[i]; if (v.kind !== 'vehicle' || v.wreck || v.sinking || v === ped.inVehicle) continue;
          if (v.edgeDistance && v.edgeDistance(ped.x + f.x * 0.9, ped.z + f.z * 0.9) > 0.9) continue;
          v.applyDamage(w.vehicleDmg * mul, ped, id); v.vx += f.x * 0.6; v.vz += f.z * 0.6;
          var hx = ped.x + f.x * 1.1, hz = ped.z + f.z * 1.1;
          fx({ type: 'spark', x: hx, y: v.y + v.cls.height * 0.5, z: hz, vx: f.x * 2, vy: 2.5, vz: f.z * 2, size: 0.3, life: 0.3 });
          sfx('hit', hx, hz, 0.7); shake(0.1);
          markHit(ped, v, false, null, { x: hx, y: v.y + 0.8, z: hz }, id);
          return true;
        }
      }
      sfx('punch', ped.x, ped.z, 0.25); return false;
    }
    var dx = target.x - ped.x, dz = target.z - ped.z, l = Math.sqrt(dx * dx + dz * dz) || 1; dx /= l; dz /= l;
    ped.yaw = U.dirToYaw(dx, dz);
    var dmg = w.dmg * mul * (isPlayer ? 1 : AI_MELEE_MUL), wasAlive = target.alive;
    // the TABLE FLIP: a second table-leg swing landing within the window doubles the knockback and sends the victim sliding (not when
    // that swing finishes them or leaves them one hit from done, QA CMB-16)
    var flip = !!(w.flipWindow && isPlayer && target._legHitT != null && now - target._legHitT < w.flipWindow + 0.3 && now - target._legHitT > 0.2 && target.hp > dmg * 2);
    target.applyDamage(dmg, ped, id);
    if (w.flipWindow) target._legHitT = now;
    var floors = ms.type === 'heavy' || ms.type === 'counter' || (ms.type === 'light' && ms.combo >= 2);
    if (target.alive && !target.knockedDown) {
      if (flip) { target.knockDown(dx * w.knock * 2.2, dz * w.knock * 2.2, 0, ped, id); target.downT = 2.4; textFx('FLIPPED', target.x, target.y + 2.1, target.z, '#ffbe3c', 1.0); }
      else if (floors || target.hp < dmg * 1.5 || (isPlayer && R().chance(0.12))) target.knockDown(dx * (floors ? 5 : 3), dz * (floors ? 5 : 3), 0, ped, id);
      else { target.vx += dx * w.knock; target.vz += dz * w.knock; var hr = target._hitReact || (target._hitReact = { t: 0, zone: null, dx: 0, dz: 0 }); hr.t = 0.3; hr.zone = 'torso'; hr.dx = dx; hr.dz = dz; }
      target.lastHitBy = ped;
    }
    if (!isPlayer && target.kind === 'player') ped._hurtPlayerT = now;
    var hy = chestY(target) + 0.25;
    fx({ type: 'puff', x: target.x - dx * 0.3, y: hy, z: target.z - dz * 0.3, size: ms.type === 'heavy' ? 0.8 : 0.55, life: 0.3, color: 0xfff6d8, vy: 0.8 });
    fx({ type: 'spark', x: target.x - dx * 0.3, y: hy, z: target.z - dz * 0.3, vx: dx * 2, vy: 2, vz: dz * 2, size: 0.25, life: 0.2, color: 0xfff0a0 });
    if (ms.type === 'counter') textFx('COUNTERPOINT', target.x, target.y + 2.1, target.z, '#2ee6ff', 0.9);
    sfx('punch', target.x, target.z, ms.type === 'heavy' ? 1 : 0.8);
    if (isPlayer) {
      ped.stats.hits = (ped.stats.hits || 0) + 1; if (wasAlive && !target.alive) ped.stats.kills = (ped.stats.kills || 0) + 1;
      shotAlarm(ped, 10); shake(flip ? 0.2 : ms.type === 'heavy' ? 0.16 : 0.08);
      markHit(ped, target, wasAlive && !target.alive, 'torso', { x: target.x, y: hy, z: target.z }, id);
    }
    if (target.kind === 'player') { Combat.hurtFlash = 1; shake(0.25); }
    emit('melee', { type: ms.type, ped: ped, target: target, hit: true, phase: 'impact' });
    return true;
  }
  function tickMelee(ped, dt) {
    var ms = ped._melee; if (!ms) return;
    if (!ped.alive || ped.knockedDown || ped.inVehicle) { ped._melee = null; return; }
    var before = ms.t;
    ms.t += dt / ms.dur;
    if (ms.type === 'ai' && ms.t < ms.at && ms.target) ped.yaw = U.angleDamp(ped.yaw, U.dirToYaw(ms.target.x - ped.x, ms.target.z - ped.z), 8, dt);
    if (!ms.hit && before < ms.at && ms.t >= ms.at) { ms.hit = true; meleeImpact(ped, ms); }
    ped.punchT = Math.max(ped.punchT || 0, ms.t < 1 ? 0.05 : 0);
    if (ms.t >= 1) {
      var q = ms.queued; ped._melee = null;
      if (ped.kind !== 'player') ped._meleeCd = R().range(0.9, 1.5);
      else if (q) { var nc = q === 'light' ? (ms.type === 'light' ? (ms.combo + 1) % 3 : 0) : 0; startMelee(ped, ms.id, q, nc, null); ped._lastCombo = nc; }
      else ped._comboT = simT();
    }
  }
  // the player's melee input (Combat.fire with a melee weapon while the trigger is down)
  function playerMelee(p, id, w) {
    var In = GTP.Input, ms = p._melee, tap = In.pressed('shoot') || In.pressed('action');
    if (ms) {
      if (tap && ms.t > 0.35 && !ms.queued) ms.queued = 'light';
      return false;
    }
    var now = simT();
    if (p._meleeReady > now) return false;
    var heavy = !!p.aiming && !p.inVehicle;
    var combo = 0;
    if (!heavy && p._comboT != null && now - p._comboT < MELEE.light.window && p._lastCombo != null) combo = (p._lastCombo + 1) % 3;
    if (!tap && p._meleeHeld > 0.35 && !p._heavyDone) { heavy = true; p._heavyDone = true; }
    var target = bestInCone(p, U.yawToDir(p.yaw), 1.3, w.range + 0.6, false, false);
    if (target) p.yaw = U.dirToYaw(target.x - p.x, target.z - p.z);
    startMelee(p, id, heavy ? 'heavy' : 'light', heavy ? 0 : combo, target);
    p._lastCombo = heavy ? -1 : combo;
    p._meleeReady = now + 0.05;
    return true;
  }
  // a counter: the player's jump while an attacker's swing is coming within reach (0.1..0.5 s before it lands)
  function counterCandidate(p) {
    var list = E().hash.query(p.x, p.z, 3.2, scratch3), best = null;
    for (var i = 0; i < list.length; i++) {
      var e = list[i], ms = e._melee;
      if (e === p || !ms || ms.target !== p || ms.hit || !e.alive) continue;
      var left = (ms.at - ms.t) * ms.dur;
      if (left < 0.55 && left > -0.02 && U.dist2d(e.x, e.z, p.x, p.z) < 2.8) best = e;
    }
    return best;
  }
  function tryCounter(p) {
    var e = counterCandidate(p); if (!e) return false;
    p._dodgeT = 0.4;
    var w = WEAPONS[p.weapon] && WEAPONS[p.weapon].melee ? p.weapon : 'fist';
    p.yaw = U.dirToYaw(e.x - p.x, e.z - p.z);
    startMelee(p, w, 'counter', 0, e);
    p.stats.counters = (p.stats.counters || 0) + 1;
    return true;
  }

  // ---------------------------------------------------------- projectiles --
  // The hot mic and its cousins: a lobbed thing with a fuse. It bounces (restitution, a few times), comes to rest, and the ON AIR
  // cap blinks faster toward the bang. In water it fizzles. Peds and cars it lands on get a bump, not a blast (the blast is the
  // fuse's). The sticky note sticks to whatever it touches first (and rides a car), smoke pours a cloud for 12 s, the latte
  // splashes a scalding puddle where it lands.
  class HotMic extends GTP.Projectile {
    constructor(o) {
      super(o);
      var w = WEAPONS[o.weaponId] || WEAPONS.hotmic;
      this.fuse = o.fuse != null ? o.fuse : (w.fuse || 0); this.fuse0 = w.fuse || 1;
      this.bounces = 0; this.maxBounces = w.bounces != null ? w.bounces : 2; this.rest = false; this.spin = R().range(6, 11); this.lobbed = true;
      this.restitution = w.restitution != null ? w.restitution : 0.4; this.stuck = null; this.splashed = false;
    }
    syncMesh(alpha) {
      var m = this.mesh; if (!m) return;
      var a = alpha == null ? 1 : alpha;
      m.position.set(this._px + (this.x - this._px) * a, this._py + (this.y - this._py) * a, this._pz + (this.z - this._pz) * a);
      if (this.rest || this.stuck) { var ww = WEAPONS[this.weaponId]; m.rotation.set(ww && ww.stick ? 0 : Math.PI / 2, 0, 0.3); }
      else { m.rotation.x = this.age * this.spin; m.rotation.z = this.age * this.spin * 0.4; }
    }
    land() {
      var w = WEAPONS[this.weaponId];
      if (w && w.splash && !this.splashed) { this.splashed = true; coffeeSplash(this, this.owner); this.destroy(); return true; }
      return false;
    }
    update(dt) {
      this.age += dt;
      var w = WEAPONS[this.weaponId] || WEAPONS.hotmic;
      if (w.fuse) { this.fuse -= dt; if (this.fuse <= 0) { if (w.smoke) { startSmoke(this); this.destroy(); } else this.hit(null); return; } }
      if (this.age > 13) { this.destroy(); return; }
      if (this.stuck) {
        var v = this.stuck;
        if (v.removed) { this.stuck = null; this.rest = false; }
        else { var p = v.localToWorld(this._sr, this._sf); this.x = p.x; this.z = p.z; this.y = v.y + this._sy; }
        return;
      }
      if (this.rest) return;
      var Wd = W(), g = C.PHYS.gravity;
      this.vy -= g * dt;
      var nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
      if (Wd.solidAt(nx, nz, this.y + 0.1) || Wd.tileAt(nx, nz) === Wd.T.VOID) {
        if (w.stick) { this.vx = this.vy = this.vz = 0; this.rest = true; sfx('hit', this.x, this.z, 0.3); return; }
        if (this.land()) return;
        this.vx = -this.vx * this.restitution; this.vz = -this.vz * this.restitution; this.bounces++; sfx('hit', this.x, this.z, 0.3);
      } else { this.x = nx; this.z = nz; }
      this.y += this.vy * dt;
      var gy = Wd.heightAt(this.x, this.z, this.y + 0.3);
      if (this.y < C.WATER_Y + 0.05 && gy <= C.WATER_Y) { fx({ type: 'puff', x: this.x, y: C.WATER_Y + 0.2, z: this.z, size: 1.1, life: 0.6, color: 0xbfe8f4, vy: 0.8 }); sfx('land', this.x, this.z, 0.4); this.destroy(); return; }
      if (this.y <= gy) {
        this.y = gy;
        if (this.land()) return;
        if (w.stick) { this.vx = this.vy = this.vz = 0; this.rest = true; sfx('hit', this.x, this.z, 0.25); return; }
        if (this.vy < -1.2 && this.bounces < this.maxBounces) {
          this.vy = -this.vy * this.restitution; this.vx *= 0.7; this.vz *= 0.7; this.bounces++;
          fx({ type: 'puff', x: this.x, y: gy + 0.1, z: this.z, size: 0.4, life: 0.3, color: 0xcfc8b8, vy: 0.5 });
          sfx('hit', this.x, this.z, 0.25);
        } else {
          this.vy = 0; this.vx *= 0.82; this.vz *= 0.82;
          if (Math.abs(this.vx) + Math.abs(this.vz) < 0.25) { this.vx = this.vz = 0; this.rest = true; }
        }
      }
      // a bump off a car or a ped (the player's own car included: it rolls off the bonnet); a sticky note sticks to the car
      var list = E().hash.query(this.x, this.z, 1.5, scratch3);
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e === this || e.removed) continue;
        if (e.kind === 'vehicle' && !e.sinking) {
          if (e.pushCircle(this.x, this.z, this.radius) && this.y < e.y + e.cls.height + 0.3 && this.y > e.y - 0.3) {
            if (w.stick && !(this.owner && this.owner.inVehicle === e && this.age < 0.4)) {
              var lp = e.worldToLocal(this.x, this.z); this._sr = lp.x != null ? lp.x : lp.r; this._sf = lp.z != null ? lp.z : lp.f; this._sy = Math.max(0.3, Math.min(e.cls.height, this.y - e.y));
              if (this._sr == null || this._sf == null) { this._sr = 0; this._sf = 0; }
              this.stuck = e; this.vx = this.vy = this.vz = 0; sfx('hit', this.x, this.z, 0.3); return;
            }
            if (this.land()) return;
            var ox = this.x - e.x, oz = this.z - e.z, ol = Math.sqrt(ox * ox + oz * oz) || 1;
            this.vx = ox / ol * 2.5 + e.vx * 0.3; this.vz = oz / ol * 2.5 + e.vz * 0.3; this.vy = Math.max(this.vy * -0.3, 1.5); this.bounces++;
            sfx('hit', this.x, this.z, 0.3);
          }
        } else if ((e.kind === 'ped' || e.kind === 'player') && e !== this.owner && e.alive && !e.inVehicle) {
          if (U.dist2d(e.x, e.z, this.x, this.z) < e.radius + this.radius && this.y > e.y - 0.2 && this.y < e.y + e.height + 0.2) {
            if (this.land()) return;
            var px = this.x - e.x, pz = this.z - e.z, pl = Math.sqrt(px * px + pz * pz) || 1;
            this.vx = px / pl * 2; this.vz = pz / pl * 2; this.vy = Math.max(this.vy * -0.3, 1.2); this.bounces++;
            e.applyDamage(3, this.owner, this.weaponId); if (e.speakLine && !e._micLine && this.weaponId === 'hotmic') { e._micLine = true; e.speakLine('Is this on?'); }
          }
        }
      }
    }
  }
  // The rocket: straight for 3 s (the firework 1.6 s), then it drops. A trail of smoke and fire (the firework's is sparkly). It
  // bursts on anything it touches.
  class Rocket extends GTP.Projectile {
    constructor(o) { super(o); this.lobbed = false; this.trailT = 0; this.straight = 3; }
    syncMesh(alpha) {
      var m = this.mesh; if (!m) return;
      var a = alpha == null ? 1 : alpha;
      m.position.set(this._px + (this.x - this._px) * a, this._py + (this.y - this._py) * a, this._pz + (this.z - this._pz) * a);
      var vl = Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz) || 1;
      m.rotation.set(0, 0, 0);
      m.lookAt(m.position.x + this.vx / vl, m.position.y + this.vy / vl, m.position.z + this.vz / vl);
      m.rotateX(Math.PI / 2); m.rotateY(this.age * 14);
    }
    update(dt) {
      this.age += dt; this.life -= dt;
      if (this.life <= 0) { this.hit(null); return; }
      if (this.age > this.straight) this.vy -= C.PHYS.gravity * 0.6 * dt;
      var steps = 3, sdt = dt / steps, Wd = W();   // 40 m/s is 0.67 m per step: sub-step so a car's box never gets skipped
      for (var s = 0; s < steps; s++) {
        this.x += this.vx * sdt; this.y += this.vy * sdt; this.z += this.vz * sdt;
        if (this.y <= Wd.heightAt(this.x, this.z, this.y) || Wd.solidAt(this.x, this.z, this.y) || this.y < C.WATER_Y - 0.5 || Wd.tileAt(this.x, this.z) === Wd.T.VOID) { this.hit(null); return; }
        var list = E().hash.query(this.x, this.z, 4.5, scratch3);
        for (var i = 0; i < list.length; i++) {
          var e = list[i];
          if (e === this.owner || e === this || e.removed || (this.owner && e === this.owner.inVehicle && this.age < 0.25)) continue;
          if (e.kind === 'vehicle') { if (!e.sinking && e.pushCircle(this.x, this.z, this.radius + 0.2) && this.y < e.y + e.cls.height + 0.4 && this.y > e.y - 0.4) { this.hit(e); return; } }
          else if (e.kind === 'ped' || e.kind === 'player') { if (e.alive && !e.inVehicle && U.dist2d(e.x, e.z, this.x, this.z) < e.radius + this.radius + 0.1 && this.y > e.y - 0.3 && this.y < e.y + e.height + 0.3) { this.hit(e); return; } }
          else if (e.kind === 'heli') { if (!e.down) { var hx = e.x - this.x, hy = e.y - this.y, hz = e.z - this.z; if (hx * hx + hy * hy + hz * hz < 3.8 * 3.8) { this.hit(e); return; } } }
        }
      }
      this.trailT += dt;
      if (this.trailT > 0.025) {
        this.trailT = 0;
        var r = R(), fw = this.weaponId === 'firework';
        fx({ type: 'smoke', x: this.x + r.range(-0.1, 0.1), y: this.y + r.range(-0.1, 0.1), z: this.z + r.range(-0.1, 0.1), vx: r.range(-0.5, 0.5), vy: r.range(0.2, 0.8), vz: r.range(-0.5, 0.5), size: r.range(0.9, 1.4) * (fw ? 0.6 : 1), life: r.range(0.9, 1.4), color: fw ? 0xc8c0e0 : 0xa0a0a8 });
        fx({ type: fw ? 'spark' : 'fire', x: this.x - this.vx * 0.012, y: this.y - this.vy * 0.012, z: this.z - this.vz * 0.012, vx: -this.vx * 0.05 + (fw ? r.range(-2, 2) : 0), vy: 0.3, vz: -this.vz * 0.05 + (fw ? r.range(-2, 2) : 0), size: 0.7, life: fw ? 0.3 : 0.12, color: fw ? [0xff3fa4, 0x2ee6ff, 0xffd84a][r.int(0, 2)] : 0xffb060 });
      }
    }
  }
  // the hottake's 5 m stun
  var TAKE_TEXT = { flashbang: 'BREAKING NEWS', flare_gun: 'SIGNAL BOOST', merch_cannon: 'FREE SHIRT' };
  var TAKE_FX = {
    flashbang: { flash: 0xffffff, size: 5.5, life: 0.25, ring: 0xe8f0ff, bits: 'spark', bit: 0xffffff, bitSize: 0.3 },
    flare_gun: { flash: 0xff3fa4, size: 2.6, life: 0.6, ring: 0xff6fb8, bits: 'spark', bit: 0xff9ad0, bitSize: 0.35 },
    merch_cannon: { flash: 0xf4ecd8, size: 1.4, life: 0.3, ring: 0xff3fa4, bits: 'puff', bit: 0xf4ecd8, bitSize: 0.5 }
  };
  function takeBlast(proj, owner) {
    var pw = WEAPONS[proj.weaponId], w = pw && pw.stun ? pw : WEAPONS.hottake, r = R(), pid = pw ? proj.weaponId : 'hottake';
    var x = proj.x, y = proj.y, z = proj.z, Wd = W();
    var gy = Wd.heightAt(x, z, y); if (y < gy) y = gy;
    var rad = w.stun || 5, i;
    var look = TAKE_FX[pid];
    if (look) {
      // a non-explosive stun: the merch cannon's shirts, the flare's pink light, the flashbang's white flash
      fx({ type: 'explosion', x: x, y: y + 0.5, z: z, size: look.size, life: look.life, color: look.flash });
      fx({ type: 'ring', x: x, y: gy + 0.1, z: z, size: rad, life: 0.5, color: look.ring });
      for (i = 0; i < 8; i++) { var la = r.random() * Math.PI * 2, ls = r.range(2, 6); fx({ type: look.bits, x: x, y: y + 0.4, z: z, vx: Math.cos(la) * ls, vy: r.range(1.5, 4.5), vz: Math.sin(la) * ls, size: look.bitSize, life: r.range(0.4, 0.9), color: look.bit }); }
    } else {
      fx({ type: 'explosion', x: x, y: y + 0.5, z: z, size: 3.2, life: 0.5, color: 0xff8a30 });
      fx({ type: 'ring', x: x, y: gy + 0.1, z: z, size: rad, life: 0.55, color: 0xff9a40 });
      for (i = 0; i < 6; i++) fx({ type: 'fire', x: x + r.range(-0.5, 0.5), y: y + 0.3 + r.range(0, 0.6), z: z + r.range(-0.5, 0.5), vx: r.range(-2, 2), vy: r.range(1.5, 4), vz: r.range(-2, 2), size: r.range(0.8, 1.5), life: r.range(0.3, 0.6) });
      for (i = 0; i < 5; i++) fx({ type: 'smoke', x: x + r.range(-0.6, 0.6), y: y + 0.6, z: z + r.range(-0.6, 0.6), vx: r.range(-1, 1), vy: r.range(1, 2.5), vz: r.range(-1, 1), size: r.range(1.2, 2.2), life: r.range(1, 1.8), color: 0x553322 });
      for (i = 0; i < 8; i++) { var a = r.random() * Math.PI * 2, sp = r.range(3, 8); fx({ type: 'spark', x: x, y: y + 0.4, z: z, vx: Math.cos(a) * sp, vy: r.range(2, 6), vz: Math.sin(a) * sp, size: 0.35, life: r.range(0.3, 0.6), color: 0xffb060 }); }
      fx({ type: 'decal', x: x, y: gy, z: z, size: 2.2, size2: 2.2, life: 30, color: 0x2a1a10 });
    }
    textFx(TAKE_TEXT[pid] || 'RESPECTFULLY.', x, y + 1.6, z, '#ff7a20', 1.3);
    var list = E().hash.query(x, z, rad + 2.5, scratch);
    for (i = 0; i < list.length; i++) {
      var e = list[i]; if (e === proj || e.removed) continue;
      var dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz), ext = e.kind === 'vehicle' ? e.hw : 0.4;
      if (d > rad + ext) continue;
      var fall = 1 - 0.55 * Math.min(1, d / rad), nx = dx / (d || 1), nz = dz / (d || 1);
      if (e.kind === 'ped' || e.kind === 'player') {
        if (!e.alive || e.inVehicle) continue;
        var dmg = proj.dmg * fall * (e === owner ? 0.5 : 1), was = e.alive;
        e.knockDown(nx * 6 * fall, nz * 6 * fall, dmg, owner, pid);
        e.lastHitBy = owner || e.lastHitBy;
        if (e.kind === 'player') { Combat.hurtFlash = 0.7; }
        blastCredit(owner, e, was, 'hottake', e.x, e.y + 1, e.z);
      } else if (e.kind === 'vehicle' && !e.wreck && !e.sinking) {
        e.applyDamage(18 * fall, owner, 'hottake'); e.vx += nx * 2 * fall; e.vz += nz * 2 * fall;
      }
    }
    sfx('explode', x, z, 0.6);
    var pl = player(); if (pl) shake(U.clamp(0.9 - U.dist2d(pl.x, pl.z, x, z) / 25, 0.1, 0.9));
    alarm(x, z, 28, owner || proj, false);
  }
  // the big ones: the hot mic's 6 m blast (+ a 5 m knockdown ring), the sticky note's 5 m, the confetti shell's 4 m, the firework's
  // 6 m and the rocket's 8 m blast that flips cars
  var BLAST_COL = { ratio: [0xff9ad0, 0xff3fa4, 0x2a1a24], firework: [0xb0e8ff, 0x7a4aff, 0x221a2a], confetti: [0xfff0a0, 0xff3fa4, 0x2a2420], hotmic: [0xffb040, 0xff4a2a, 0x1e1a18], stickynote: [0xffe070, 0xff8a2a, 0x1e1a18], sticky: [0xffe070, 0xff8a2a, 0x1e1a18], grenade_launcher: [0xffd0a0, 0xff6a2a, 0x1e1a18] };
  function areaBlast(proj, owner, kind) {
    var w = WEAPONS[kind] || WEAPONS.hotmic, r = R(), Wd = W();
    var x = proj.x, y = proj.y, z = proj.z, gy = Wd.heightAt(x, z, y); if (y < gy) y = gy;
    var rad = w.blast || 5, ring = w.ring ? rad + w.ring : rad, i, rocket = !!w.rocket, flips = !!w.flips, big = rocket ? 1.25 : 1;
    var col = BLAST_COL[kind] || BLAST_COL.hotmic, hot = col[1];
    fx({ type: 'explosion', x: x, y: y + 1.0, z: z, size: 12.8 * big * rad / 8 + 3, life: 0.14, color: 0xfff6e0 });
    fx({ type: 'explosion', x: x, y: y + 1.4, z: z, size: 10.4 * big * rad / 8 + 2, life: 0.6, color: col[0], vy: 2.5 });
    fx({ type: 'explosion', x: x, y: y + 0.5, z: z, size: 7 * big * rad / 8 + 1.5, life: 0.45, color: hot, vy: 1.5 });
    fx({ type: 'ring', x: x, y: gy + 0.1, z: z, size: rad * 2, life: 0.6, color: hot });
    if (ring > rad) fx({ type: 'ring', x: x, y: gy + 0.12, z: z, size: ring * 2, life: 0.8, color: 0xff8a60 });
    for (i = 0; i < (rocket ? 10 : 7); i++) fx({ type: 'fire', x: x + r.range(-1.2, 1.2), y: y + r.range(0.2, 1.6), z: z + r.range(-1.2, 1.2), vx: r.range(-4, 4), vy: r.range(3, 9), vz: r.range(-4, 4), size: r.range(1.6, 3), life: r.range(0.5, 1) });
    for (i = 0; i < 7; i++) fx({ type: 'smoke', x: x + r.range(-0.8, 0.8), y: y + 1 + i * 0.5, z: z + r.range(-0.8, 0.8), vx: r.range(-0.7, 0.7), vy: r.range(2, 4), vz: r.range(-0.7, 0.7), size: r.range(2.5, 4.5), life: r.range(1.8, 3), color: col[2] });
    var confettiCols = [0xff3fa4, 0x2ee6ff, 0xffd84a, 0x9dff3c, 0xff7a20];
    for (i = 0; i < (kind === 'confetti' || kind === 'firework' ? 26 : 14); i++) { var a = r.random() * Math.PI * 2, sp = r.range(4, 13); fx({ type: 'spark', x: x, y: y + 0.6, z: z, vx: Math.cos(a) * sp, vy: r.range(3, 9), vz: Math.sin(a) * sp, size: 0.45, life: r.range(0.3, 0.9), color: kind === 'confetti' || kind === 'firework' ? confettiCols[i % 5] : (rocket ? 0xffb0e0 : 0xffc060) }); }
    fx({ type: 'decal', x: x, y: gy, z: z, size: rad * 0.7, size2: rad * 0.7, life: 60, color: 0x16120f });
    textFx(kind === 'ratio' ? failText('wasted') : kind === 'confetti' ? 'CONGRATULATIONS' : kind === 'firework' ? 'TRENDING' : kind === 'stickynote' || kind === 'sticky' ? 'REMINDER' : kind === 'grenade_launcher' ? 'FOLLOW-UP' : 'HOT MIC', x, y + 2.2, z, kind === 'ratio' ? '#ff3fa4' : '#ff4a2a', 1.4);
    var list = E().hash.query(x, z, ring + 4, scratch), direct = proj._direct || null;
    for (i = 0; i < list.length; i++) {
      var e = list[i]; if (e === proj || e.removed) continue;
      var dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz), ext = e.kind === 'vehicle' ? e.hw : e.kind === 'heli' ? 3 : 0.4;
      if (d > ring + ext) continue;
      var nx = dx / (d || 1), nz = dz / (d || 1), inBlast = d <= rad + ext, fall = inBlast ? 1 - 0.5 * Math.min(1, d / rad) : 0, was = e.kind === 'vehicle' ? !e.wreck : e.alive;
      if (e.kind === 'ped' || e.kind === 'player') {
        if (!e.alive || e.inVehicle) continue;
        if (inBlast) { var dmg = w.dmg * fall * (e === owner ? 0.5 : 1); e.knockDown(nx * 8 * fall, nz * 8 * fall, dmg, owner, kind); if (e.kind === 'player') Combat.hurtFlash = 0.9; }
        else e.knockDown(nx * 5, nz * 5, 0, owner, kind);   // the knockdown ring beyond the blast
        e.lastHitBy = owner || e.lastHitBy;
        blastCredit(owner, e, was, kind, e.x, e.y + 1, e.z);
      } else if (e.kind === 'vehicle' && !e.wreck && !e.sinking && inBlast) {
        // cars keep the full blast inside 40% of the radius (one mic wrecks a parked van), 60% of it at the edge
        var vfall = 1 - 0.4 * U.clamp((d - rad * 0.4) / (rad * 0.6), 0, 1);
        if (rocket && e === direct) {
          // a direct rocket hit wrecks the car through the damage path, so missions see a 'vehicle:damage' with the weapon (QA CMB-01)
          e.lastDamageSrc = owner || e.lastDamageSrc;
          e.applyDamage(Math.max(e.hp + 1, w.vehicleDmg || w.dmg), owner, kind);
          if (!e.exploded && e.explode) e.explode(owner);
        }
        else e.applyDamage((w.vehicleDmg || w.dmg) * vfall, owner, kind);
        e.vx += nx * (rocket ? 7 : 3) * fall; e.vz += nz * (rocket ? 7 : 3) * fall;
        if (flips) { e.vy = Math.max(e.vy, 9 * fall + 3); e.onGround = false; e.angVel += r.range(-2.5, 2.5); e._flipT = e._flipDur = 0.95; e._flipDir = nx * (U.yawToDir(e.yaw).z) - nz * (U.yawToDir(e.yaw).x) >= 0 ? 1 : -1; }
        else if (fall > 0.6) { e.vy = Math.max(e.vy, 2.5); e.onGround = false; }
        blastCredit(owner, e, was, kind, e.x, e.y + 1, e.z);
      } else if (e.kind === 'heli' && !e.down && inBlast && e.applyDamage) { e.applyDamage(w.dmg * fall, owner, kind); blastCredit(owner, e, true, kind, e.x, e.y, e.z); }
    }
    sfx('explode', x, z, rocket ? 1 : 0.85);
    var pl = player(); if (pl) shake(U.clamp((rocket ? 1.4 : 1.1) - U.dist2d(pl.x, pl.z, x, z) / 30, 0.15, 1.4));
    alarm(x, z, rocket ? 40 : 30, owner || proj, false);
    if (owner && owner.kind === 'player') { owner.stats.blasts = (owner.stats.blasts || 0) + 1; copHeat(owner); }
  }
  // smoke: a cloud that sits for w.smoke seconds; AI shots through it go wide (smokeBetween), and the AI module may ask Combat.inSmoke
  var smokes = [];
  function startSmoke(proj) {
    var w = WEAPONS[proj.weaponId] || WEAPONS.smoke;
    smokes.push({ x: proj.x, y: proj.y, z: proj.z, r: 5.5, t: w.smoke || 12, emitT: 0 });
    sfx('static', proj.x, proj.z, 0.5);
    textFx('NO COMMENT', proj.x, proj.y + 1.8, proj.z, '#cfd6e6', 1.6);
    alarm(proj.x, proj.z, 14, proj.owner || proj, true);
  }
  function tickSmokes(dt) {
    for (var i = smokes.length - 1; i >= 0; i--) {
      var s = smokes[i]; s.t -= dt; s.emitT -= dt;
      if (s.t <= 0) { smokes.splice(i, 1); continue; }
      if (s.emitT <= 0) {
        s.emitT = 0.12; var r = R(), a = r.random() * Math.PI * 2, rr = r.range(0, s.r * 0.8);
        fx({ type: 'smoke', x: s.x + Math.cos(a) * rr, y: s.y + r.range(0.3, 2.2), z: s.z + Math.sin(a) * rr, vx: r.range(-0.4, 0.4), vy: r.range(0.1, 0.5), vz: r.range(-0.4, 0.4), size: r.range(3, 4.5), life: r.range(2.2, 3.2), color: 0xd0d4dc });
      }
    }
  }
  function inSmoke(x, z) { for (var i = 0; i < smokes.length; i++) { var s = smokes[i]; if (U.dist2d(x, z, s.x, s.z) < s.r) return true; } return false; }
  function smokeBetween(ax, az, bx, bz) {
    for (var i = 0; i < smokes.length; i++) {
      var s = smokes[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = U.clamp(((s.x - ax) * dx + (s.z - az) * dz) / l2, 0, 1);
      if (U.dist2d(ax + dx * t, az + dz * t, s.x, s.z) < s.r) return true;
    }
    return false;
  }
  // the latte: a scalding puddle for w.burn seconds (every 0.5 s: a little damage, and the peds in it run)
  var puddles = [];
  function coffeeSplash(proj, owner) {
    var w = WEAPONS.coffee, x = proj.x, z = proj.z, gy = W().heightAt(x, z, proj.y + 0.5), r = R();
    puddles.push({ x: x, y: gy, z: z, r: w.splash, t: w.burn, tickT: 0, owner: owner || null });
    fx({ type: 'decal', x: x, y: gy, z: z, size: w.splash * 0.8, size2: w.splash * 0.8, life: 12, color: 0x5a3418 });
    for (var i = 0; i < 8; i++) { var a = r.random() * Math.PI * 2; fx({ type: 'puff', x: x, y: gy + 0.2, z: z, vx: Math.cos(a) * 3, vy: r.range(1, 2), vz: Math.sin(a) * 3, size: 0.5, life: 0.5, color: 0x8a5a30 }); }
    textFx('EXTRA HOT', x, gy + 1.6, z, '#ffbe3c', 1.2);
    sfx('hit', x, z, 0.6); alarm(x, z, 12, owner || proj, false);
  }
  function tickPuddles(dt) {
    for (var i = puddles.length - 1; i >= 0; i--) {
      var pd = puddles[i]; pd.t -= dt; pd.tickT -= dt;
      if (pd.t <= 0) { puddles.splice(i, 1); continue; }
      if (pd.tickT > 0) continue;
      pd.tickT = 0.5;
      fx({ type: 'puff', x: pd.x + R().range(-1, 1), y: pd.y + 0.3, z: pd.z + R().range(-1, 1), vy: 1, size: 0.6, life: 0.8, color: 0xf0e6dc });
      var list = E().hash.query(pd.x, pd.z, pd.r + 1, scratch3);
      for (var k = 0; k < list.length; k++) {
        var e = list[k]; if ((e.kind !== 'ped' && e.kind !== 'player') || !e.alive || e.inVehicle || U.dist2d(e.x, e.z, pd.x, pd.z) > pd.r) continue;
        var was = e.alive; e.applyDamage(WEAPONS.coffee.dmg * (e === pd.owner ? 0.5 : 1), pd.owner, 'coffee');
        if (e.kind === 'ped' && e.alive && e.state !== 'flee') { e.state = 'flee'; e.fleeFrom = pd.owner; e.fleeTimer = 4; }
        blastCredit(pd.owner, e, was, 'coffee', e.x, e.y + 1, e.z);
      }
    }
  }
  function projectileHit(proj, target) {
    var id = proj.weaponId, owner = proj.owner, w = WEAPONS[id];
    if (id === 'hottake' || (w && w.stun && !w.blast)) { takeBlast(proj, owner); return; }
    if (w && w.splash) { if (!proj.splashed) { proj.splashed = true; coffeeSplash(proj, owner); } return; }
    if (w && w.smoke) { startSmoke(proj); return; }
    if (w && w.rocket) { proj._direct = target && target.kind === 'vehicle' ? target : null; areaBlast(proj, owner, id); return; }
    if (w && (w.blast || w.impact)) { proj._direct = null; areaBlast(proj, owner, id); return; }
    takeBlast(proj, owner);
  }

  // ---------------------------------------------------------- the hot mic in hand --
  // holding shoot with a hot mic cooks it: the fuse runs in the hand, release throws what is left of it
  function startCook(p, id) {
    if (p._cook) return;
    p._cook = { t: 0, id: id, blink: 0 };
    p.firePoseT = 0.6;
    sfx('ui', p.x, p.z, 0.3);
  }
  function tickCook(p, dt, In) {
    var held = In.down('shoot') || In.down('action');
    if (!held) p._cookLock = false;   // the trigger came up: the next press may cook again (QA CMB-12)
    var ck = p._cook; if (!ck) return;
    var w = WEAPONS[ck.id];
    if (!p.alive || p.knockedDown || p.weapon !== ck.id || !(p.weapons[ck.id] > 0)) { p._cook = null; return; }   // a knockdown drops it quietly
    ck.t += dt; p.firePoseT = Math.max(p.firePoseT || 0, 0.3);
    if (ck.t >= w.fuse) {
      // it was on the whole time
      p._cook = null; p._cookLock = true; p._fireT = simT(); p._fireRate = w.rate;
      var pr = new HotMic({ x: p.x, y: p.y + 1.2, z: p.z, owner: p, weaponId: ck.id, dmg: w.dmg, life: 1, fuse: 0.01, radius: 0.16 });
      pr.snap(); E().add(pr);
      spend(p, ck.id);
      return;
    }
    if (!held || p.knockedDown) {
      p._cook = null;
      if (p.knockedDown) return;
      var ctx = aimContext(p, w, ck.id);
      if (lob(p, w, ck.id, ctx, Math.max(0.25, w.fuse - ck.t))) { p._fireT = simT(); p._fireRate = w.rate; spend(p, ck.id); }
    }
  }
  // spend one round of the player's weapon (the magazine for guns, the reserve for the rest)
  function spend(p, id) {
    var w = WEAPONS[id], a = ammoOf(p, id); if (!w || !a) return;
    if (a.total === Infinity) return;
    if (w.mag) setAmmo(p, id, Math.max(0, a.mag - 1), a.reserve); else setAmmo(p, id, 0, Math.max(0, a.reserve - 1));
    if (!(p.weapons[id] > 0)) dryWeapon(p, id);
    else if (w.mag === 1 && a.mag <= 0 && a.reserve > 0) startReload(p, id);   // a single-round tube reloads itself; the rest wait for the trigger or R
  }

  // --------------------------------------------------------- muzzle light --
  // one pooled point light at the player's muzzle for 0.06 s a shot (autos: it stays while the trigger is held and flickers).
  // Created with the scene at intensity 0 (the first Combat.update; QA CMB-04): adding a light later would recompile every material.
  var ml = { t: 0, auto: false, light: null };
  function ensureMuzzleLight() {
    var Rd = GTP.Render; if (!Rd || !Rd.scene) return null;
    var L = Rd.muzzleLight;
    if (!L) { L = Rd.muzzleLight = new THREE.PointLight(0xffd27a, 0, 9, 2); L.name = 'muzzleLight'; Rd.scene.add(L); }
    ml.light = L;
    return L;
  }
  function muzzleLight(o, d, w) {
    var L = ensureMuzzleLight(); if (!L) return;
    if (w.quiet) return;
    L.position.set(o.x + d.x * 0.15, o.y + d.y * 0.15, o.z + d.z * 0.15); L.intensity = 2.6; ml.t = 0.06; ml.auto = !!w.auto;
  }
  function tickMuzzleLight(dt, p, In) {
    var L = ml.light; if (!L) return;
    if (ml.t <= 0) { if (L.intensity) L.intensity = 0; return; }
    var w = p && WEAPONS[p.weapon];
    var held = ml.auto && p && p.alive && In && (In.down('shoot') || In.down('action')) && w && w.auto && !(p.reloadT > 0) && (ammoOf(p, p.weapon) || {}).mag > 0;
    if (held) { ml.t = 0.06; L.intensity = 2.6 * R().range(0.5, 1.0); var o = muzzle(p); L.position.set(o.x, o.y, o.z); }
    else { ml.t -= dt; if (ml.t <= 0) L.intensity = 0; }
  }
  // ------------------------------------------------------ casings (fx patch) --
  // Render.fx gets a 'casing' type: brass (or red shells) in one InstancedMesh, gravity, one bounce, 0.9 s, 60 live at most.
  var casings = { list: [], max: 60, im: null, free: [], M: null, P: null, Q: null, S: null, Eu: null, Col: null };
  function casingInit() {
    var Rd = GTP.Render; if (casings.im || !Rd || !Rd.fxGroup) return false;
    var geo = new THREE.BoxGeometry(1, 1, 1), mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    var im = new THREE.InstancedMesh(geo, mat, casings.max);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.name = 'casings'; im.castShadow = false;
    casings.M = new THREE.Matrix4(); casings.P = new THREE.Vector3(); casings.Q = new THREE.Quaternion(); casings.S = new THREE.Vector3(); casings.Eu = new THREE.Euler(); casings.Col = new THREE.Color();
    var zero = new THREE.Matrix4().makeScale(0, 0, 0), white = new THREE.Color(0xffffff);
    for (var i = 0; i < casings.max; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, white); casings.free.push(casings.max - 1 - i); }
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    Rd.fxGroup.add(im); casings.im = im;
    return true;
  }
  function casingAdd(o) {
    if (!casings.im && !casingInit()) return o;
    if (!casings.free.length) casingRelease(casings.list.shift());   // the oldest drops
    var slot = casings.free.pop(), r = R();
    var c = { type: 'casing', slot: slot, x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy == null ? 2.5 : o.vy, vz: o.vz || 0, t: 0, life: o.life || 0.9, size: o.size || 0.06, bounced: false, resting: false, rx: r.range(0, 6), ry: r.range(0, 6), wx: r.range(-14, 14), wy: r.range(-14, 14) };
    casings.Col.set(o.color || 0xd8b24a); casings.im.setColorAt(slot, casings.Col); casings.im.instanceColor.needsUpdate = true;
    casings.list.push(c);
    return c;
  }
  function casingRelease(c) {
    if (!c || c.slot == null) return;
    casings.M.makeScale(0, 0, 0); casings.im.setMatrixAt(c.slot, casings.M); casings.im.instanceMatrix.needsUpdate = true;
    casings.free.push(c.slot); c.slot = null;
  }
  function casingUpdate(dt) {
    var L = casings.list; if (!L.length) return;
    var Wd = W(), g = C.PHYS.gravity;
    for (var i = L.length - 1; i >= 0; i--) {
      var c = L[i]; c.t += dt;
      if (c.t >= c.life) { casingRelease(c); L.splice(i, 1); continue; }
      if (c.resting) continue;
      c.vy -= g * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.rx += c.wx * dt; c.ry += c.wy * dt;
      var gy = Wd ? Wd.heightAt(c.x, c.z, c.y + 0.5) : 0;
      if (c.y <= gy + c.size * 0.3 && c.vy < 0) {
        c.y = gy + c.size * 0.3;
        if (!c.bounced) { c.bounced = true; c.vy = -c.vy * C.PHYS.restitution; c.vx *= 0.5; c.vz *= 0.5; c.wx *= 0.4; c.wy *= 0.4; }
        else { c.vy = 0; c.vx = c.vz = 0; c.resting = true; c.rx = Math.PI / 2; }
      }
    }
  }
  function casingSync() {
    var L = casings.list; if (!L.length || !casings.im) return;
    for (var i = 0; i < L.length; i++) {
      var c = L[i];
      casings.P.set(c.x, c.y, c.z); casings.Eu.set(c.rx, c.ry, 0, 'YXZ'); casings.Q.setFromEuler(casings.Eu);
      casings.S.set(c.size * 0.4, c.size * 0.4, c.size);
      casings.M.compose(casings.P, casings.Q, casings.S); casings.im.setMatrixAt(c.slot, casings.M);
    }
    casings.im.instanceMatrix.needsUpdate = true;
  }
  function casingClear() { for (var i = 0; i < casings.list.length; i++) casingRelease(casings.list[i]); casings.list.length = 0; }
  var casingHandler = { add: casingAdd, update: casingUpdate, sync: casingSync, clear: casingClear, state: casings };
  // ----------------------------------------------------- bullet holes (fx patch) --
  // Render.fx gets a 'hole' type: a dark quad flush on the wall it hit, 90 live at most (the oldest goes), fading in its last 3 s.
  var holes = { list: [], max: 90, im: null, free: [], M: null, P: null, Q: null, S: null, N: null, Z: null };
  function holeInit() {
    var Rd = GTP.Render; if (holes.im || !Rd || !Rd.fxGroup) return false;
    var mat = new THREE.MeshBasicMaterial({ color: 0x1c1b1a, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    var im = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 7), mat, holes.max);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.name = 'bulletHoles';
    holes.M = new THREE.Matrix4(); holes.P = new THREE.Vector3(); holes.Q = new THREE.Quaternion(); holes.S = new THREE.Vector3(); holes.N = new THREE.Vector3(); holes.Z = new THREE.Vector3(0, 0, 1);
    var zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (var i = 0; i < holes.max; i++) { im.setMatrixAt(i, zero); holes.free.push(holes.max - 1 - i); }
    im.instanceMatrix.needsUpdate = true;
    Rd.fxGroup.add(im); holes.im = im;
    return true;
  }
  function holeAdd(o) {
    if (!holes.im && !holeInit()) return o;
    if (!holes.free.length) holeRelease(holes.list.shift());
    var h = { type: 'hole', slot: holes.free.pop(), t: 0, life: o.life || 25, size: o.size || 0.1 };
    holes.P.set(o.x, o.y, o.z); holes.N.set(o.nx || 0, o.ny || 0, o.nz || 1).normalize(); holes.Q.setFromUnitVectors(holes.Z, holes.N);
    holes.S.set(h.size, h.size, h.size); holes.M.compose(holes.P, holes.Q, holes.S); holes.im.setMatrixAt(h.slot, holes.M); holes.im.instanceMatrix.needsUpdate = true;
    holes.list.push(h);
    return h;
  }
  function holeRelease(h) { if (!h || h.slot == null) return; holes.M.makeScale(0, 0, 0); holes.im.setMatrixAt(h.slot, holes.M); holes.im.instanceMatrix.needsUpdate = true; holes.free.push(h.slot); h.slot = null; }
  function holeUpdate(dt) { for (var i = holes.list.length - 1; i >= 0; i--) { var h = holes.list[i]; h.t += dt; if (h.t >= h.life) { holeRelease(h); holes.list.splice(i, 1); } } }
  function holeClear() { for (var i = 0; i < holes.list.length; i++) holeRelease(holes.list[i]); holes.list.length = 0; }
  var holeHandler = { add: holeAdd, update: holeUpdate, sync: function () { }, clear: holeClear, state: holes };
  var hooked = { rig: false };
  function afterStep(dt) {
    var B = GTP.Bosses, Sp = GTP.Specials, I = GTP.Interiors;
    if (B && B.update) { try { B.update(dt); } catch (e) { U.reportError(e, 'bosses.tick'); } }
    if (Sp && Sp.update) { try { Sp.update(dt); } catch (e2) { U.reportError(e2, 'specials.tick'); } }
    if (I && I.update) { try { I.update(dt); } catch (e3) { U.reportError(e3, 'interiors.update'); } }
  }
  function ensureHooks() {
    var Rd = GTP.Render, F = Rd && Rd.fx;
    if (F && F.register && F.extensions) {
      if (!F.extensions.casing) { F.register('casing', casingHandler); F.casings = casings; }
      if (!F.extensions.hole) F.register('hole', holeHandler);
    }
    ensureMuzzleLight();
    // the per-class ADS zoom: Render.rig.update reads CAMERA.aimFov; set it around the call and put it back
    if (Rd && Rd.rig && !Rd.rig._combatAds && typeof Rd.rig.update === 'function') {
      var orig = Rd.rig.update;
      Rd.rig.update = function (dt, input) {
        var CAM = C.CAMERA, base = CAM.aimFov, d0 = CAM.aimDist, s0 = CAM.aimSide, h0 = CAM.aimHeight, l0 = CAM.aimLookHeight;
        CAM.aimFov = adsFov(base);
        // the shoulder camera: closer and further right than the base rig, so the gun in the hands reads beside the crosshair
        CAM.aimDist = AIM_CAM.dist; CAM.aimSide = AIM_CAM.side; CAM.aimHeight = AIM_CAM.height; CAM.aimLookHeight = AIM_CAM.look;
        try { var res = orig.call(this, dt, input); aimGuard(this); return res; } finally { CAM.aimFov = base; CAM.aimDist = d0; CAM.aimSide = s0; CAM.aimHeight = h0; CAM.aimLookHeight = l0; }
      };
      Rd.rig._combatAds = true; hooked.rig = true;
    }
    syncArsenal();
    registerSave();
    if (pendingSave && player() && GTP.SaveRegistry.combat) GTP.SaveRegistry.combat.set(pendingSave);
  }

  // The aim camera's wall guard (QA-A-CAM-01): Render's guard casts from the look-at point 8 m ahead, so with a wall or a counter in
  // those 8 m (in a shop, facing a building) it threw the camera in front of the player at floor height. While aiming on foot the
  // camera is kept on the line from the shoulder to the over-the-shoulder spot, pulled in to the first wall (at least 0.4 m).
  function aimGuard(r) {
    var t = r._target || player(), Wd = W(), CAM = C.CAMERA;
    if (!t || !t.aiming || t.inVehicle || scope.active || (t.cameraMode || r.mode) === 'first' || !Wd || !Wd.raycastBuildings) return;
    var d = U.yawToDir(r.yaw), rx = -d.z, rz = d.x, ox = t.x, oy = t.y + 1.5, oz = t.z, pad = CAM.collisionPad || 0.3;
    var ahead = (r.pos.x - t.x) * d.x + (r.pos.z - t.z) * d.z > 0.05;
    var cx = ahead ? t.x - d.x * AIM_CAM.dist + rx * AIM_CAM.side : r.pos.x, cy = ahead ? t.y + AIM_CAM.height + Math.sin(r.pitch) * 1.2 : r.pos.y, cz = ahead ? t.z - d.z * AIM_CAM.dist + rz * AIM_CAM.side : r.pos.z;
    var gx = cx - ox, gy = cy - oy, gz = cz - oz, gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    var hit = Wd.raycastBuildings(ox, oy, oz, gx / gl, gy / gl, gz / gl, gl + pad);
    if (!ahead && !hit) return;
    var tt = hit ? Math.max(0.4, Math.min(gl, hit.t - pad)) : gl;
    r.pos.x = ox + gx / gl * tt; r.pos.y = oy + gy / gl * tt; r.pos.z = oz + gz / gl * tt; r.pulled = !!hit;
  }

  // ----------------------------------------------------------- scope --
  // Combat.scope: a scoped weapon's sight (the Fact Checker, the Peer Reviewer, the Long Form). Holding aim puts the rig at eye
  // height (the player's cameraMode is parked and set to 'first' so the body hides), fov 30 (2x) or 15 (4x; [ ] / the wheel
  // toggles), a breath sway, 1/zoom look.
  var scope = { active: false, zoom: 2, fov: 30, range: 0, sway: 0.15, t: 0, stillT: 0, target: null };
  function updateScope(p, dt) {
    var w = WEAPONS[p.weapon];
    var want = !!(p.alive && !p.inVehicle && w && w.scope && p.aiming && !p.knockedDown && !p.swimming && !(p.cover && !p.cover.peek && p.cover.high) && GTP.game && GTP.game.state === 'playing');
    if (want && !scope.active) { scope.active = true; scope.t = 0; scope.stillT = 0; p._scopeCam = p.cameraMode; p.cameraMode = 'first'; sfx('ui', p.x, p.z, 0.25); emit('scope', { active: true, zoom: scope.zoom }); }
    else if (!want && scope.active) { scope.active = false; if (p.cameraMode === 'first') p.cameraMode = p._scopeCam || 'chase'; p._scopeCam = null; emit('scope', { active: false, zoom: scope.zoom }); }
    if (!scope.active) { scope.target = null; return; }
    scope.t += dt;
    var still = Math.abs(p.vx || 0) + Math.abs(p.vz || 0) < 0.3;
    scope.stillT = still ? scope.stillT + dt : 0;
    scope.fov = scope.zoom >= 4 ? 15 : 30;
    scope.range = aim.range || 0; scope.target = aim.hover || null;
  }
  function toggleZoom() { scope.zoom = scope.zoom >= 4 ? 2 : 4; sfx('ui', 0, 0, 0.2); emit('scope', { active: scope.active, zoom: scope.zoom }); }

  // ------------------------------------------------------------ the wheel --
  // Combat.wheel: hold lockOn (Tab) for 0.18 s while not aiming. Twelve slots (SLOTS), index 0 at the top, clockwise; the mouse
  // (or the right stick) picks the slot, [ ] steps it, R cycles the weapons inside the slot, release equips. The world runs at
  // timeScale (0.2) while it is open.
  var wheel = { open: false, index: 0, hold: 0, vx: 0, vy: 0, timeScale: 0.2, t: 0, source: null, _acc: 0, segments: null, pick: {} };
  function slotOf(id) { var w = WEAPONS[id]; return w && w.slot != null ? w.slot : 0; }
  function slotWeapons(slot) { var out = []; for (var i = 0; i < ORDER.length; i++) if (slotOf(ORDER[i]) === slot) out.push(ORDER[i]); return out; }
  function owns(p, id) { return !!p && !!p.weapons && (p.weapons[id] > 0 || p.weapons[id] === Infinity); }
  // the weapon a slot shows: the one picked there last, the held one, the first owned, else the first of the slot
  function slotPick(p, slot) {
    var ids = slotWeapons(slot), pk = wheel.pick[slot];
    if (p && ids.indexOf(p.weapon) >= 0) return p.weapon;
    if (pk && owns(p, pk)) return pk;
    for (var i = 0; i < ids.length; i++) if (owns(p, ids[i])) return ids[i];
    for (i = 0; i < ids.length; i++) if (BASE_ORDER.indexOf(ids[i]) >= 0) return ids[i];
    return ids[0] || 'fist';
  }
  function openWheel(p, source) {
    if (wheel.open) return;
    wheel.open = true; wheel.source = source || 'key'; wheel.t = 0; wheel.vx = wheel.vy = 0; wheel._acc = 0;
    wheel.index = slotOf(p.weapon);
    cancelReload(p);
    sfx('ui', p.x, p.z, 0.3);
    emit('wheel', { open: true, index: wheel.index, id: slotPick(p, wheel.index) });
  }
  function closeWheel(p, equip) {
    if (!wheel.open) return;
    wheel.open = false; wheel.hold = 0;
    var id = slotPick(p, wheel.index);
    if (equip && p && id && owns(p, id) && p.weapon !== id) { p.weapon = id; cancelReload(p); }
    emit('wheel', { open: false, index: wheel.index, id: id, equipped: equip ? p.weapon : null });
  }
  function updateWheel(p, dt) {
    var In = GTP.Input, g = GTP.game;
    var tabDown = In.down('lockOn') || In.down('wheel');
    if (!wheel.open) {
      if (tabDown && !p.aiming && p.alive && !p.knockedDown && g && g.state === 'playing') { wheel.hold += dt; if (wheel.hold >= 0.18) openWheel(p, 'key'); }
      else wheel.hold = 0;
      return;
    }
    wheel.t += dt;
    var n = SLOTS.length, look = In.look, pad = In.gamepad;
    if (look && (look.dx || look.dy)) { wheel.vx += look.dx; wheel.vy += look.dy; var m = Math.sqrt(wheel.vx * wheel.vx + wheel.vy * wheel.vy); if (m > 60) { wheel.vx *= 60 / m; wheel.vy *= 60 / m; } look.dx = 0; look.dy = 0; }   // the wheel owns the mouse: the camera holds
    if (pad && pad.index >= 0 && (pad.rx || pad.ry)) { wheel.vx = pad.rx * 60; wheel.vy = pad.ry * 60; }
    if (wheel.vx * wheel.vx + wheel.vy * wheel.vy > 12 * 12) {
      var ang = Math.atan2(wheel.vx, -wheel.vy); if (ang < 0) ang += Math.PI * 2;
      var idx = Math.round(ang / (Math.PI * 2 / n)) % n;
      if (idx !== wheel.index) { wheel.index = idx; sfx('ui', p.x, p.z, 0.15); }
    }
    if (In.pressed('weaponNext')) { wheel.index = (wheel.index + 1) % n; wheel.vx = wheel.vy = 0; }
    if (In.pressed('weaponPrev')) { wheel.index = (wheel.index + n - 1) % n; wheel.vx = wheel.vy = 0; }
    if (In.pressed('reload')) {
      // R: the next owned weapon inside the hovered slot
      var ids = slotWeapons(wheel.index).filter(function (id) { return owns(p, id); });
      if (ids.length > 1) { var cur = slotPick(p, wheel.index), k = ids.indexOf(cur); wheel.pick[wheel.index] = ids[(k + 1) % ids.length]; if (ids.indexOf(p.weapon) >= 0 && p.weapon !== wheel.pick[wheel.index]) { p.weapon = wheel.pick[wheel.index]; cancelReload(p); } sfx('ui', p.x, p.z, 0.2); }
    }
    if (!p.alive || p.knockedDown || !g || g.state !== 'playing') { closeWheel(p, false); return; }
    if (wheel.source === 'key' && !tabDown) closeWheel(p, true);
  }
  function wheelHud(p) {
    var segs = wheel.segments || (wheel.segments = SLOTS.map(function (s, i) { return { slot: i, slotName: s.name, id: null, name: '', cls: '', owned: false, ammo: null, mag: null, reserve: null, infinite: false, current: false, count: 0, ids: [] }; }));
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], id = slotPick(p, i), w = WEAPONS[id] || WEAPONS.fist, tot = p && p.weapons ? p.weapons[id] : 0, a = p && tot > 0 ? ammoOf(p, id) : null;
      var ids = slotWeapons(i); s.ids = p ? ids.filter(function (k) { return owns(p, k); }) : [];
      s.id = id; s.name = w.name; s.cls = w.cls; s.count = s.ids.length;
      s.owned = owns(p, id); s.infinite = tot === Infinity; s.ammo = tot === Infinity ? null : (tot | 0);
      s.mag = a && w.mag ? (a.mag === Infinity ? null : a.mag) : null; s.reserve = a ? (a.reserve === Infinity ? null : a.reserve) : null; s.current = !!p && p.weapon === id;
    }
    return { open: wheel.open, index: wheel.index, id: segs[wheel.index] ? segs[wheel.index].id : null, t: wheel.t, segments: segs, timeScale: wheel.timeScale };
  }
  // the slow step: input, menus, the wheel, the HUD and the camera tick; the world holds (4 of every 5 steps at 0.2x)
  function slowStep(g) {
    var dt = C.STEP;
    try {
      GTP.Input.beginFrame();
      if (g._handleGlobalInput) g._handleGlobalInput();
      if (g.state === 'playing' && g.player) updateWheel(g.player, dt);
      if (GTP.UI && GTP.UI.update) GTP.UI.update(dt);
      if (GTP.Render && GTP.Render.updateCamera) GTP.Render.updateCamera(dt);
    } catch (e) { U.reportError(e, 'step.wheel'); }
    finally { try { GTP.Input.endFrame(); } catch (e2) { U.reportError(e2, 'input.endFrame'); } }
  }
  // Game.step calls this first: true = the wheel is open and this step was a slow one (the world held, 4 of every 5 steps at 0.2x)
  function wheelStep(g) {
    if (!wheel.open || g.state !== 'playing' || !(wheel.timeScale < 1)) return false;
    wheel._acc += wheel.timeScale;
    if (wheel._acc < 1) { slowStep(g); return true; }
    wheel._acc -= 1;
    return false;
  }

  // Player.cycleWeapon delegates here: walk ORDER (owned only), toggle the scope zoom while scoped, yield to the open wheel; a switch
  // cancels a reload
  function cycleWeapon(p, dir) {
    syncArsenal();
    if (scope.active) { toggleZoom(); return; }
    if (wheel.open) return;
    var ids = ORDER.filter(function (id) { return p.weapons[id] > 0; });
    for (var k in p.weapons) if (p.weapons[k] > 0 && ids.indexOf(k) < 0) ids.push(k);
    if (!ids.length) return;
    var i = ids.indexOf(p.weapon); if (i < 0) i = 0;
    var next = ids[(i + dir + ids.length) % ids.length];
    if (next !== p.weapon) { p.weapon = next; cancelReload(p); p._cook = null; }
  }
  // ------------------------------------------------------- damage flashes --
  var FLASH_MAT = null, flashing = [];
  // a hot, still-shaded flash (flat white reads as a ghost from the side)
  function flashMaterial() { if (!FLASH_MAT) FLASH_MAT = new THREE.MeshLambertMaterial({ color: 0xffe0d8, emissive: new THREE.Color(0xff5a40), emissiveIntensity: 0.75 }); return FLASH_MAT; }
  function weaponPart(o) { for (var q = o; q; q = q.parent) { if (q.userData && q.userData.weaponPart) return true; if (q.isScene) break; } return false; }
  function startFlash(t) {
    var m = t.mesh; if (!m) return;
    var now = simT();
    if (t.kind === 'vehicle') {
      var ud = m.userData; if (!ud || !ud.paint) return;
      if (!t._flash) { t._flash = true; ud.paint.emissive.setHex(0x5a2a22); flashing.push(t); }
      t._flashUntil = now + 0.08;
      return;
    }
    if (!t._flash) {
      t._flash = true;
      m.traverse(function (o) { if (o.isMesh && !o.isSprite && o.name !== 'held' && o.name !== 'cap' && !weaponPart(o)) { o.userData.mat0 = o.material; o.material = flashMaterial(); } });
      flashing.push(t);
    }
    t._flashUntil = now + 0.09;
  }
  function endFlash(t) {
    t._flash = false;
    var m = t.mesh; if (!m) return;
    if (t.kind === 'vehicle') { if (m.userData && m.userData.paint) m.userData.paint.emissive.setHex(0); return; }
    m.traverse(function (o) { if (o.isMesh && o.userData.mat0) { o.material = o.userData.mat0; o.userData.mat0 = null; } });
  }
  function updateFlash() {
    var now = simT();
    for (var i = flashing.length - 1; i >= 0; i--) {
      var t = flashing[i];
      if (now >= t._flashUntil || !t.mesh || t.removed) { endFlash(t); flashing.splice(i, 1); }
    }
  }

  // ------------------------------------------- the visible gun, holsters, hands --
  // Entities.sync calls postSync(ped) after the ped's syncMesh: the held weapon (and the holstered ones) are children of the ped's
  // root group, placed in world space from gunFrame (raised) or the right hand (low-ready one-handers, melee, thrown) and turned
  // into root-local transforms. Without GTP.Anim the arms are then pointed at the grip and the support point.
  var V = null;   // THREE scratch, made on first use
  function vscratch() {
    if (V) return V;
    V = { m: new THREE.Matrix4(), inv: new THREE.Matrix4(), w: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), hand: new THREE.Vector3(0, -0.61, 0) };
    return V;
  }
  // a weapon mesh leaving a hand: its only per-mesh resource is the hot mic's blinking cap material
  function dropWeapon(obj) { if (!obj) return; if (obj.parent) obj.parent.remove(obj); obj.traverse(function (o) { if (o.userData && o.userData.cap && o.material && o.material.dispose) o.material.dispose(); }); }
  function tagWeapon(obj) { obj.userData.weaponPart = true; obj.traverse(function (o) { o.userData.noFlash = true; }); return obj; }
  function wantHeld(e) {
    if (!e.alive || !e.weapon || e.weapon === 'fist' || !WEAPONS[e.weapon]) return null;
    if (e.inVehicle) return e.inVehicle.type === 'bike' && e.aiming ? e.weapon : null;
    if (e.kind === 'player') return e.weapon;
    // AI peds draw only when they mean it: in a fight, aiming, a mission goon, or a cop while the player is wanted
    var pl = player();
    if (e.hostile || e.aiming || e.firePoseT > 0 || e._melee || (e.ai && e.ai.mission) || (isCopRole(e) && pl && pl.wanted > 0)) return e.weapon;
    return null;
  }
  // the holstered pair: the best owned hip weapon and the best owned back weapon that are not in the hand (the player); AI peds
  // carry their own weapon holstered while it is not drawn
  var _hol = [null, null], NO_HOL = [null, null];
  function holsterIds(e, heldId) {
    if (!settings.holsters) return NO_HOL;
    var hip = null, back = null, hipP = -1, backP = -1;
    if (e.kind !== 'player') {
      if (heldId || !e.weapon || e.weapon === 'fist' || !WEAPONS[e.weapon]) return NO_HOL;
      var f0 = fitOf(e.weapon); if (!f0) return NO_HOL;
      _hol[0] = f0.holster === 'hip' ? e.weapon : null; _hol[1] = f0.holster === 'back' ? e.weapon : null; return _hol;
    }
    for (var id in e.weapons) {
      if (id === heldId || id === 'fist' || !owns(e, id) || !WEAPONS[id]) continue;
      var f = fitOf(id); if (!f) continue;
      var pr = WEAPONS[id].price || 0;
      if (f.holster === 'hip' && pr > hipP) { hip = id; hipP = pr; }
      else if (f.holster === 'back' && pr > backP) { back = id; backP = pr; }
    }
    _hol[0] = hip; _hol[1] = back; return _hol;
  }
  function partsOf(e, m) {
    if (e._cparts && e._cparts.root === m) return e._cparts;
    return (e._cparts = { root: m, armR: m.getObjectByName('armR'), armL: m.getObjectByName('armL'), torso: m.getObjectByName('torso'), handR: m.getObjectByName('handR'), handL: m.getObjectByName('handL'), legL: m.getObjectByName('legL'), legR: m.getObjectByName('legR') });
  }
  // place obj (a child of root) at a world transform: position P, basis X, Y, Z (arrays), world scale s
  function placeWorld(obj, root, gx, gy, gz, X, Y, Z, s) {
    var v = vscratch();
    v.w.set(X[0] * s, Y[0] * s, Z[0] * s, gx, X[1] * s, Y[1] * s, Z[1] * s, gy, X[2] * s, Y[2] * s, Z[2] * s, gz, 0, 0, 0, 1);
    v.inv.copy((obj.parent || root).matrixWorld).invert();   // into the space of the object's actual parent (a bone, if re-parented)
    v.m.multiplyMatrices(v.inv, v.w);
    v.m.decompose(obj.position, obj.quaternion, obj.scale);
  }
  // the right hand's world frame (fallback rig: 0.61 m down the arm pivot; a models-track handR bone when there is one)
  function handFrame(parts, side, out) {
    var v = vscratch(), node = side === 'L' ? (parts.handL || parts.armL) : (parts.handR || parts.armR); if (!node) return null;
    out = out || {};
    var bone = side === 'L' ? parts.handL : parts.handR;
    if (bone) { bone.getWorldPosition(v.p); } else { v.p.copy(v.hand).applyMatrix4(node.matrixWorld); }
    var me = node.matrixWorld.elements;
    out.x = v.p.x; out.y = v.p.y; out.z = v.p.z;
    var sx = Math.hypot(me[0], me[1], me[2]) || 1, sy = Math.hypot(me[4], me[5], me[6]) || 1, sz = Math.hypot(me[8], me[9], me[10]) || 1;
    out.ax = [me[0] / sx, me[1] / sx, me[2] / sx]; out.ay = [me[4] / sy, me[5] / sy, me[6] / sy]; out.az = [me[8] / sz, me[9] / sz, me[10] / sz];
    return out;
  }
  function norm3(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; return a; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  // the fallback arms (no GTP.Anim): point an arm's -y at a world target from its shoulder pivot (and stretch it a little if short)
  function reach(arm, tx, ty, tz) {
    if (!arm || !arm.parent) return;
    var v = vscratch();
    v.a.set(tx, ty, tz); arm.parent.worldToLocal(v.a);
    var dx = v.a.x - arm.position.x, dy = v.a.y - arm.position.y, dz = v.a.z - arm.position.z, l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= l; dy /= l; dz /= l;
    var rz = Math.asin(U.clamp(dx, -1, 1)), cz = Math.cos(rz) || 1e-4;
    arm.rotation.set(Math.atan2(-dz / cz, -dy / cz), 0, rz, 'XYZ');
    arm.scale.y = U.clamp(l / 0.61, 0.8, 1.3);
  }
  // fallback swing poses for melee when nobody animates them (light: a jab, heavy: an overhead chop, counter: a hook)
  function meleeArms(e, parts) {
    var ms = e._melee; if (!ms || !parts.armR) return;
    var k = U.clamp(ms.t, 0, 1), a = ms.at;
    if (ms.type === 'heavy' || ms.type === 'ai') { var up = k < a ? k / a : 1 - (k - a) / (1 - a); parts.armR.rotation.set(k < a ? 0.6 + 2.2 * up : 0.4 + 2.4 * up, 0, -0.15); }
    else if (ms.type === 'counter') { var hk = Math.sin(Math.PI * k); parts.armR.rotation.set(1.3 * hk + 0.3, 0, -0.5 + 1.1 * hk); }
    else { var pk = Math.sin(Math.PI * k); if (ms.combo === 1) { parts.armL.rotation.set(0.4 + 1.3 * pk, 0, 0.2); } else parts.armR.rotation.set(0.4 + 1.35 * pk, 0, ms.combo === 2 ? -0.1 - 0.7 * pk : -0.1); }
  }
  var _hf = {}, _pt = {}, _pt2 = {};
  // the held weapon's mesh and the holstered ones, made or swapped when the weapon or its mods change (also run from the update, so
  // the meshes exist without a render); returns the held id
  function ensureHeld(e) {
    var m = e.mesh; if (!m) return null;
    var heldId = wantHeld(e), mods = heldId ? modsOf(e, heldId) : null, sig = heldId ? heldId + '|' + modsKey(mods) : null;
    if (e._heldSig !== sig) {
      if (e._held) { dropWeapon(e._held); e._held = null; }
      e._heldSig = sig; e._heldId = heldId;
      if (heldId && GTP.Assets && GTP.Assets.weaponMesh) { var wm = GTP.Assets.weaponMesh(heldId, mods); if (wm) { wm.name = 'held'; tagWeapon(wm); m.add(wm); e._held = wm; } }
    }
    var hol = holsterIds(e, heldId);
    syncHolster(e, m, 0, hol[0]); syncHolster(e, m, 1, hol[1]);
    return heldId;
  }
  function postSync(e) {
    if (e.kind !== 'ped' && e.kind !== 'player') return;
    var m = e.mesh; if (!m) return;
    if (!m.visible) { if (e._hands) e._hands.valid = false; return; }
    var heldId = ensureHeld(e);
    if (!e._held && !e._holH && !e._holB && !(e.cover && !GTP.Anim) && !(e._melee && !GTP.Anim)) { if (e._hands) e._hands.valid = false; return; }   // nothing to place
    var parts = partsOf(e, m), anim = !!GTP.Anim, bodyY = m.position.y;
    // the fallback rig's crouch behind low cover (the models track animates pose.crouch itself): sink, knees forward, lean in
    if (!anim && e.cover && !e.cover.high && !e._vault) {
      var ck = 1 - (e.cover.peekK || 0);
      if (ck > 0.01) {
        m.position.y -= 0.42 * ck;
        if (parts.legL) parts.legL.rotation.x = 1.25 * ck;
        if (parts.legR) parts.legR.rotation.x = 1.05 * ck;
        if (parts.torso) parts.torso.rotation.x = -0.28 * ck;
      }
    }
    m.updateMatrixWorld(true);
    var hands = e._hands || (e._hands = { valid: false, right: { x: 0, y: 0, z: 0 }, left: { x: 0, y: 0, z: 0 }, leftOn: false, raised: false });
    hands.valid = false; hands.leftOn = false;
    if (!anim && e._melee) { meleeArms(e, parts); m.updateMatrixWorld(true); }
    if (parts.armL) parts.armL.scale.y = 1; if (parts.armR) parts.armR.scale.y = 1;
    if (!e._held) { placeHolsters(e, m, parts); return; }
    var w = WEAPONS[heldId], fit = fitOf(heldId) || {}, held = e._held;
    var raised = !e.knockedDown && !(e._melee) && !fit.melee && !fit.knuckle && (e.aiming || e.firePoseT > 0 || !!e._cook || (e.cover && (e.cover.peek || e.cover.blindT > 0)) || (e.kind !== 'player' && e.hostile && !w.melee));
    if (e.reloadT > 0 && !fit.upright) raised = false;
    var yaw = m.rotation.y;
    // a models-track rig: GTP.Anim re-parented the gun into the handR bone and posed it with both arms (06c applyHeld); Anim is the
    // gun's only writer there. Publish the hand targets from the gun as drawn instead of placing it again.
    if (anim && held.parent && held.parent !== m) {
      var va = vscratch().a.set(0, 0, 0); held.localToWorld(va);
      hands.right.x = va.x; hands.right.y = va.y; hands.right.z = va.z;
      if (fit.support && (raised || holdOf(heldId) === 'two') && !fit.melee && !fit.upright) { held.localToWorld(V.b.set(fit.support[0], fit.support[1], fit.support[2])); hands.left.x = V.b.x; hands.left.y = V.b.y; hands.left.z = V.b.z; hands.leftOn = true; }
    } else if (raised) {
      var fr = gunFrame(e, heldId, true, null, yaw, e._aimPitch || 0);
      fr.gx += m.position.x - e.x; fr.gy += bodyY - e.y; fr.gz += m.position.z - e.z;   // gunFrame crouches on its own   // the interpolated body
      placeWorld(held, m, fr.gx, fr.gy, fr.gz, fr.X, fr.Y, fr.Z, fr.s);
      // the right hand on the grip (a handgun: low on the grip, so the slide shows above the fist)
      var oneH = holdOf(heldId) === 'one' && !fit.upright;
      if (oneH) { framePoint(fr, [-0.012, -0.05, 0], _pt); hands.right.x = _pt.x; hands.right.y = _pt.y; hands.right.z = _pt.z; }
      else { hands.right.x = fr.gx; hands.right.y = fr.gy; hands.right.z = fr.gz; }
      if (oneH) { framePoint(fr, [-0.02, -0.075, 0.04], _pt); hands.left.x = _pt.x; hands.left.y = _pt.y; hands.left.z = _pt.z; hands.leftOn = true; }
      else if (fit.support) { framePoint(fr, fit.support, _pt); hands.left.x = _pt.x; hands.left.y = _pt.y; hands.left.z = _pt.z; hands.leftOn = true; }
      if (!anim) {
        reach(parts.armR, hands.right.x, hands.right.y, hands.right.z);
        if (hands.leftOn) reach(parts.armL, hands.left.x, hands.left.y, hands.left.z);
      }
    } else if (holdOf(heldId) === 'two' && !fit.melee && !fit.upright) {
      // the long gun at low ready across the chest, both hands on it
      var fl = gunFrame(e, heldId, false, null, yaw, 0);
      fl.gx += m.position.x - e.x; fl.gy += bodyY - e.y; fl.gz += m.position.z - e.z;
      if (e.reloadT > 0) { var rk = 1 - e.reloadT / (e.reloadTotal || 1), ph = rk < 0.5 ? rk / 0.5 : 1 - (rk - 0.5) / 0.5; fl.gy += 0.12 * ph; }
      placeWorld(held, m, fl.gx, fl.gy, fl.gz, fl.X, fl.Y, fl.Z, fl.s);
      hands.right.x = fl.gx; hands.right.y = fl.gy; hands.right.z = fl.gz;
      if (fit.support) { framePoint(fl, e.reloadT > 0 ? fit.mag : fit.support, _pt); hands.left.x = _pt.x; hands.left.y = _pt.y; hands.left.z = _pt.z; hands.leftOn = true; }
      if (!anim) { reach(parts.armR, hands.right.x, hands.right.y, hands.right.z); if (hands.leftOn) reach(parts.armL, hands.left.x, hands.left.y, hands.left.z); }
    } else {
      // in the right hand: a pistol pointing at the ground ahead, a melee weapon raised out of the fist, a thrown thing in the palm
      var hf = handFrame(parts, 'R', _hf); if (!hf) { placeHolsters(e, m, parts); return; }
      var X, Y;
      var fwd = [-hf.az[0], -hf.az[1], -hf.az[2]], down = [-hf.ay[0], -hf.ay[1], -hf.ay[2]];
      if (fit.knuckle) { X = down.slice(); Y = fwd.slice(); }
      else if (fit.upright) { Y = norm3([hf.ay[0] * 0.2 + fwd[0] * 0.98, hf.ay[1] * 0.2 + fwd[1] * 0.98, hf.ay[2] * 0.2 + fwd[2] * 0.98]); X = hf.ax.slice(); }
      else if (fit.melee) { X = norm3([fwd[0] * 0.55 + hf.ay[0] * 0.83, fwd[1] * 0.55 + hf.ay[1] * 0.83, fwd[2] * 0.55 + hf.ay[2] * 0.83]); Y = norm3([fwd[0] * 0.83 - hf.ay[0] * 0.55, fwd[1] * 0.83 - hf.ay[1] * 0.55, fwd[2] * 0.83 - hf.ay[2] * 0.55]); }
      else {
        var c50 = 0.64, s50 = 0.77;
        if (e.reloadT > 0) { c50 = 0.95; s50 = 0.3; }
        X = norm3([fwd[0] * c50 + down[0] * s50, fwd[1] * c50 + down[1] * s50, fwd[2] * c50 + down[2] * s50]);
        Y = norm3([hf.ay[0] * c50 + fwd[0] * s50, hf.ay[1] * c50 + fwd[1] * s50, hf.ay[2] * c50 + fwd[2] * s50]);
      }
      var Z = cross3(X, Y); Y = cross3(Z, X);
      var s = holdScale(heldId) * ((e.look && e.look.scale) || 1);
      placeWorld(held, m, hf.x, hf.y, hf.z, X, Y, Z, s);
      hands.right.x = hf.x; hands.right.y = hf.y; hands.right.z = hf.z;
      // a two-handed melee weapon: the left hand just below the right on the handle
      if (fit.melee && holdOf(heldId) === 'two' && parts.armL) { framePoint({ gx: hf.x, gy: hf.y, gz: hf.z, X: X, Y: Y, Z: Z, s: s }, [-0.1, 0, 0], _pt2); hands.left.x = _pt2.x; hands.left.y = _pt2.y; hands.left.z = _pt2.z; hands.leftOn = true; if (!anim) reach(parts.armL, _pt2.x, _pt2.y, _pt2.z); }
      if (e.reloadT > 0 && fit.mag && !anim && parts.armL) { framePoint({ gx: hf.x, gy: hf.y, gz: hf.z, X: X, Y: Y, Z: Z, s: s }, fit.mag, _pt2); reach(parts.armL, _pt2.x, _pt2.y, _pt2.z); hands.left.x = _pt2.x; hands.left.y = _pt2.y; hands.left.z = _pt2.z; hands.leftOn = true; }
    }
    hands.raised = raised; hands.valid = true;
    // the minigun's barrels turn while it fires
    if (fit.spinBarrels) { var sp = held.getObjectByName('spin'); if (sp) sp.rotation.x = e._spinA || 0; }
    // the hot mic cooking in the hand: the ON AIR cap blinks faster toward the bang
    if (heldId === 'hotmic') { var cap = held.getObjectByName('cap'); if (cap) { var ck = e._cook, wm2 = WEAPONS.hotmic; var on = !ck ? (Math.sin(simT() * 3) > 0.3) : Math.sin(simT() * Math.PI * 2 * (2 + 10 * ck.t / wm2.fuse)) > 0; cap.material.color.setHex(on ? 0xff3a2a : 0x3a1010); } }
    placeHolsters(e, m, parts);
  }
  function syncHolster(e, m, slot, id) {
    var key = slot ? '_holB' : '_holH', sigK = key + 'Id', mods = id ? modsOf(e, id) : null, sig = id ? id + '|' + modsKey(mods) : null;
    if (e[sigK] === sig) return;
    var old = e[key]; if (old) dropWeapon(old);
    e[key] = null; e[sigK] = sig;
    if (!id || !GTP.Assets || !GTP.Assets.weaponMesh) return;
    var hm = GTP.Assets.weaponMesh(id, mods); if (!hm) return;
    hm.name = slot ? 'holsterBack' : 'holsterHip'; tagWeapon(hm); hm.castShadow = false;
    m.add(hm); e[key] = hm;
  }
  // the holsters ride the body: the hip one on the right thigh (barrel down), the back one diagonal across the back (muzzle up over
  // the left shoulder), both in the root's frame so they follow the body's turn and lean
  function placeHolsters(e, m, parts) {
    var sc = (e.look && e.look.scale) || 1, s = modelsRig() ? 1 : HOLD_SCALE * 0.95;   // the same size as the gun in the hand
    if (e._holH) {
      var hp = e._holH; hp.position.set(0.27, 0.86, 0.04); hp.scale.setScalar(s);
      vscratch().m.makeBasis(V.a.set(0, -1, 0), V.b.set(0, 0, -1), V.c.set(1, 0, 0)); hp.quaternion.setFromRotationMatrix(V.m);
      void sc;
    }
    if (e._holB) {
      var hb = e._holB, bb = hb.geometry && (hb.geometry.boundingBox || (hb.geometry.computeBoundingBox(), hb.geometry.boundingBox));
      var X = norm3([-0.5, 0.866, 0]), Z = [0, 0, 1], Y = cross3(Z, X), off = bb ? (bb.min.x + bb.max.x) * 0.5 * s : 0.2;
      // the middle of the gun on the middle of the back: the grip low on the right, the muzzle over the left shoulder
      hb.position.set(-X[0] * off, 1.22 - X[1] * off, 0.17); hb.scale.setScalar(s);
      vscratch().m.makeBasis(V.a.set(X[0], X[1], X[2]), V.b.set(Y[0], Y[1], Y[2]), V.c.set(Z[0], Z[1], Z[2])); hb.quaternion.setFromRotationMatrix(V.m);
    }
  }
  // the models track's hand targets (world space): where the right hand holds the gun and where the left hand goes (the support
  // point on a long gun, the cup under a pistol), and whether the gun is raised. Valid after the ped's last render frame.
  function handTargets(e) {
    var h = e && e._hands; if (!h || !h.valid) return null;
    return { right: h.right, left: h.leftOn ? h.left : null, raised: h.raised, weaponId: e._heldId || null, gun: e._held || null };
  }

  // ---------------------------------------------------------------- pose --
  // ped.pose, the plan's contract, refilled every step by Ped.update (06_entities): aim, aimPitch (rad, + up), aimYaw, fire (seconds
  // since the last shot), reload (0..1|null), melee ({type, t}|null), cover ({side, high, peek, blind}|null), hold, weaponId, drive,
  // ride, swim, fall, ragdoll ({vx, vy, vz, spin}|null). Extra fields: hit ({zone, t, dx, dz}|null, a flinch), vault (0..1|null),
  // spin (the minigun's barrel angle), crouch (bool, in low cover and not peeking).
  function fillPose(e, dt) {
    var P = e.pose;
    if (!P) P = e.pose = { aim: false, aimPitch: 0, aimYaw: 0, fire: 99, reload: null, melee: null, cover: null, hold: 'none', weaponId: 'fist', drive: false, ride: false, swim: false, fall: false, ragdoll: null, hit: null, vault: null, crouch: false };
    var v = e.inVehicle, w = WEAPONS[e.weapon];
    e._shotAge = (e._shotAge == null ? 99 : e._shotAge) + dt;
    P.weaponId = e.weapon || 'fist'; P.hold = holdOf(P.weaponId);
    P.aim = !!e.alive && !e.knockedDown && (!!e.aiming || (e.firePoseT > 0 && !!w && !w.melee) || !!e._cook || !!(e.cover && e.cover.peek && e.aiming));
    P.aimYaw = e.aimYaw != null ? e.aimYaw : e.yaw; P.aimPitch = e._aimPitch || 0; P.fire = e._shotAge;
    P.reload = e.reloadT > 0 ? U.clamp(1 - e.reloadT / (e.reloadTotal || 1), 0, 1) : null;
    if (e._melee) { var mm = P._melee || (P._melee = { type: 'light', t: 0, combo: 0 }); mm.type = e._melee.type === 'ai' ? 'light' : e._melee.type; mm.t = U.clamp(e._melee.t, 0, 1); mm.combo = e._melee.combo; mm.windup = e._melee.type === 'ai' && e._melee.t < e._melee.at; P.melee = mm; }
    else P.melee = null;
    if (e.cover) { var cv = P._cover || (P._cover = { side: 'right', high: false, peek: false, blind: false }); cv.side = e.cover.side; cv.high = !!e.cover.high; cv.peek = !!e.cover.peek; cv.blind = e.cover.blindT > 0; cv.edge = e.cover.edge || null; P.cover = cv; }
    else P.cover = null;
    P.drive = !!v && !(v.type === 'bike' || v.type === 'moto');
    P.ride = !!v && (v.type === 'bike' || v.type === 'moto');
    P.swim = !!e.swimming;
    P.fall = !v && !e.swimming && !e.onGround && !e.knockedDown && (e.vy || 0) < -2.5;
    if (!v && (e.knockedDown || !e.alive)) { var rg = P._rag || (P._rag = { vx: 0, vy: 0, vz: 0, spin: 0 }); rg.vx = e.vx || 0; rg.vy = e.vy || 0; rg.vz = e.vz || 0; rg.spin = e._ragSpin || 0; P.ragdoll = rg; }
    else P.ragdoll = null;
    if (e._hitReact && e._hitReact.t > 0) { e._hitReact.t -= dt; P.hit = e._hitReact.t > 0 ? e._hitReact : null; } else P.hit = null;
    P.vault = e._vault ? U.clamp(e._vault.t / e._vault.dur, 0, 1) : null;
    P.crouch = !!(e.cover && !e.cover.high && !e.cover.peek);
    P.spin = e._spinA || 0;
    if (e._dodgeT > 0) e._dodgeT -= dt;
    if (e._meleeCd > 0) e._meleeCd -= dt;
    return P;
  }

  // ---------------------------------------------------------------- cover --
  // p.cover = {kind:'wall'|'prop'|'vehicle', ref, high, nx, nz (the cover's normal, toward the player), bx, bz (the spot against it),
  // side:'left'|'right', edge:null|'left'|'right' (at an end of the cover), peek, peekK (0..1 the lean out), blindT, t}
  var COVER = { probe: 2.4, step: 0.15, hiH: 1.55, minR: 0.35, speed: 2.1, lowSpeed: 1.6, peekOut: 0.55, peekUp: 0.45, alertEvery: 4, runMax: 12 };
  var _cpt = { x: 0, z: 0, px: 0, pz: 0, nx: 0, nz: 0, kind: null, ref: null, h: 0 };
  // the first obstacle a 0.25 m probe meets walking from (x, z) along (dx, dz) up to maxD: buildings and solid props through
  // World.resolveCapsule (interiors wrap it, so room walls count), vehicles through their own push-out
  function probeCover(x, y, z, dx, dz, maxD, out) {
    var Wd = W(), r = 0.25;
    for (var s = 0.2; s <= maxD + 1e-6; s += COVER.step) {
      var qx = x + dx * s, qz = z + dz * s;
      var res = Wd.resolveCapsule(qx, qz, y + 0.4, r), pushed = Math.abs(res.x - qx) + Math.abs(res.z - qz) > 0.02;
      var veh = null, vp = null;
      if (!pushed) {
        var list = E().hash.query(qx, qz, 4, scratch3);
        for (var i = 0; i < list.length; i++) { var v = list[i]; if (v.kind !== 'vehicle' || v.removed || v.sinking || Math.abs(v.y - y) > 2) continue; var pc = v.pushCircle(qx, qz, r); if (pc) { veh = v; vp = pc; break; } }
      }
      if (!pushed && !veh) continue;
      if (!veh && res.prop && (res.prop.r || 0) < COVER.minR) return null;   // a lamp post, a hydrant, a bollard: in the way, but no cover
      out.kind = veh ? 'vehicle' : res.prop ? 'prop' : 'wall'; out.ref = veh || res.prop || null;
      var nx, nz;
      if (veh) { nx = vp.nx; nz = vp.nz; out.h = veh.cls.height; }
      else if (res.prop) { nx = qx - res.prop.x; nz = qz - res.prop.z; out.h = res.prop.h || 3; }
      else { nx = res.normal.x; nz = res.normal.z; out.h = buildingHeightNear(qx - dx * 0.3, qz - dz * 0.3, dx, dz, y); }
      var nl = Math.sqrt(nx * nx + nz * nz);
      if (nl < 1e-3) { nx = -dx; nz = -dz; nl = 1; }
      out.nx = nx / nl; out.nz = nz / nl;
      // the spot: the player's capsule against the face
      var pr = (C.PLAYER.radius || 0.4) + 0.04, sx = qx + out.nx * (pr - r), sz = qz + out.nz * (pr - r);
      var rr = Wd.resolveCapsule(sx, sz, y + 0.4, pr); sx = rr.x; sz = rr.z;
      if (veh) { var vp2 = veh.pushCircle(sx, sz, pr); if (vp2) { sx += vp2.px; sz += vp2.pz; } }
      out.x = sx; out.z = sz; out.dist = s;
      return out;
    }
    return null;
  }
  function buildingHeightNear(x, z, dx, dz, y) {
    var Wd = W(), b = Wd.raycastBuildings(x, y + COVER.hiH, z, dx, 0, dz, 1.2);
    if (b) return 9;
    b = Wd.raycastBuildings(x, y + 0.5, z, dx, 0, dz, 1.2);
    return b ? Math.max(0.5, (b.building ? b.building.y + b.building.h - y : 1)) : (Wd.solidAt(x + dx * 0.6, z + dz * 0.6, y + COVER.hiH) ? 9 : 1);
  }
  // the best cover near the player: probe the camera's look, the move direction, then around; prefer the camera's side
  function findCover(p, maxD) {
    var cy = camYaw(), best = null, bestS = 1e9, mv = GTP.Input && GTP.Input.move, dirs = [];
    var cf = U.yawToDir(cy); dirs.push([cf.x, cf.z, 0]);
    if (mv && (mv.x || mv.z)) { var rx = -cf.z, rz = cf.x, ix = cf.x * mv.z + rx * mv.x, iz = cf.z * mv.z + rz * mv.x, il = Math.sqrt(ix * ix + iz * iz) || 1; dirs.push([ix / il, iz / il, -0.2]); }
    for (var k = 0; k < 12; k++) { var a = cy + k / 12 * Math.PI * 2; var d = U.yawToDir(a); dirs.push([d.x, d.z, 0.15 + Math.abs(U.wrapAngle(a - cy)) * 0.25]); }
    for (var i = 0; i < dirs.length; i++) {
      var hit = probeCover(p.x, p.y, p.z, dirs[i][0], dirs[i][1], maxD || COVER.probe, _cpt);
      if (!hit) continue;
      var score = hit.dist + dirs[i][2];
      if (score < bestS) { bestS = score; best = { kind: hit.kind, ref: hit.ref, x: hit.x, z: hit.z, nx: hit.nx, nz: hit.nz, h: hit.h, dist: hit.dist }; }
    }
    return best;
  }
  function enterCover(p, cand) {
    if (!cand) return false;
    var cf = U.yawToDir(camYaw()), right = { x: cand.nz, z: -cand.nx };   // facing the cover (-n), its right hand is (n.z, -n.x)
    p.cover = { kind: cand.kind, ref: cand.ref, high: cand.h >= COVER.hiH, nx: cand.nx, nz: cand.nz, bx: cand.x, bz: cand.z, side: (cf.x * right.x + cf.z * right.z) >= 0 ? 'right' : 'left', edge: null, peek: false, peekK: 0, blindT: 0, t: 0, slide: { fx: p.x, fz: p.z, t: 0, dur: Math.min(0.28, 0.08 + cand.dist * 0.08) }, awayT: 0, alertT: 0 };
    p.cover.slideT = 0;
    p._coverRun = null;
    cancelReload(p);
    sfx('land', p.x, p.z, 0.45);
    emit('cover:enter', { player: p, x: cand.x, z: cand.z, nx: cand.nx, nz: cand.nz, high: p.cover.high, kind: cand.kind });
    coverAlert(p);
    p.stats.covers = (p.stats.covers || 0) + 1;
    return true;
  }
  function exitCover(p, reason) {
    if (!p.cover) return;
    var c = p.cover; p.cover = null;
    if (c.peekK > 0) { var r = W().resolveCapsule(c.bx, c.bz, p.y + 0.4, p.radius); p.x = r.x; p.z = r.z; }
    emit('cover:exit', { player: p, reason: reason || 'leave' });
  }
  function coverAlert(p) {
    if (GTP.AI && typeof GTP.AI.coverAlert === 'function') { try { GTP.AI.coverAlert(p.x, p.z, { nx: p.cover ? p.cover.nx : 0, nz: p.cover ? p.cover.nz : 0, high: !!(p.cover && p.cover.high), player: p }); } catch (e) { U.reportError(e, 'ai.coverAlert'); } }
  }
  // the cover shot block: a shooter on the far side of the cover (within 75° of straight through it) hits the cover instead,
  // unless the player is peeking out; returns the impact point on the cover or null
  function coverShield(p, shooter) {
    var c = p.cover; if (!c || c.peekK > 0.5 || p._vault) return null;
    var sx = shooter.x - c.bx, sz = shooter.z - c.bz, sl = Math.sqrt(sx * sx + sz * sz) || 1;
    var through = -(sx * c.nx + sz * c.nz) / sl;   // 1 = straight through the cover
    if (through < Math.cos(75 * DEG)) return null;   // flanked
    var cy = c.high ? p.y + 1.2 : p.y + (c.kind === 'vehicle' ? 0.9 : 0.7);
    return { x: c.bx - c.nx * 0.45, y: cy, z: c.bz - c.nz * 0.45 };
  }
  // Player.control hands the on-foot input to this while the player is in cover: move along the cover (the camera's left / right
  // projected on the face), hold at its edges, back away to leave, aim to peek, jump to vault a low one, cover again to leave or to
  // run to the next cover the camera looks at
  function coverControl(p, dt) {
    var In = GTP.Input, c = p.cover; if (!c) return;
    var mv = In.move, cy = camYaw(), cf = U.yawToDir(cy), rx = -cf.z, rz = cf.x;
    var ix = cf.x * mv.z + rx * mv.x, iz = cf.z * mv.z + rz * mv.x;
    var tx = c.nz, tz = -c.nx;   // the cover's right (facing it)
    var along = ix * tx + iz * tz, away = ix * c.nx + iz * c.nz;
    p.intent.x = 0; p.intent.z = 0; p.intent.run = false;
    p.aiming = In.down('aim') && !p.swimming;
    if (p.aiming) p.aimYaw = cy;
    if (In.pressed('cover')) {
      // cover again: run to the next cover the camera looks at (away from this one), or just leave
      if (cf.x * c.nx + cf.z * c.nz > 0.3) { var nc = findCoverAlong(p, cf.x, cf.z); if (nc) { exitCover(p, 'run'); p._coverRun = { cand: nc, t: 0 }; return; } }
      exitCover(p, 'key'); return;
    }
    if (In.pressed('jump') && !c.high && !p.aiming) { if (startVault(p)) return; }
    if (In.pressed('enter')) { exitCover(p, 'enter'); return; }
    if (away > 0.7) { c.awayT += dt; if (c.awayT > 0.22) { exitCover(p, 'away'); return; } } else c.awayT = 0;
    if (Math.abs(along) > 0.25 && !(c.peekK > 0.3)) {
      var sgn = along > 0 ? 1 : -1;
      c.side = sgn > 0 ? 'right' : 'left';
      // the edge: does the cover go on 0.45 m further that way?
      var ex = c.bx + tx * sgn * 0.45, ez = c.bz + tz * sgn * 0.45;
      if (probeCover(ex, p.y, ez, -c.nx, -c.nz, 0.95, _cpt)) {
        var sp = (c.high ? COVER.speed : COVER.lowSpeed) * Math.min(1, Math.abs(along));
        c.bx += tx * sgn * sp * dt; c.bz += tz * sgn * sp * dt; c.edge = null;
        // follow the face (a car's side curves, a wall has corners): re-snap to it
        var fol = probeCover(c.bx + c.nx * 0.3, p.y, c.bz + c.nz * 0.3, -c.nx, -c.nz, 1.2, _cpt);
        if (fol) { c.bx = fol.x; c.bz = fol.z; c.nx = fol.nx; c.nz = fol.nz; c.high = fol.h >= COVER.hiH; c.kind = fol.kind; c.ref = fol.ref; }
      } else c.edge = c.side;
    }
    // the weapon keys still work in cover
    if (In.pressed('weaponNext')) p.cycleWeapon(1);
    if (In.pressed('weaponPrev')) p.cycleWeapon(-1);
    var fire = In.down('shoot') || In.down('action');
    if (fire && GTP.Combat && GTP.Combat.fire) { try { Combat.fire(p, p.weapon); } catch (e) { U.reportError(e, 'combat.coverFire'); } }
    p.fireHeld = fire;
  }
  function findCoverAlong(p, dx, dz) {
    for (var s = 1.2; s <= COVER.runMax; s += 0.8) {
      var x = p.x + dx * s, z = p.z + dz * s;
      if (W().solidAt(x, z, p.y + 0.5)) return null;
      var hit = probeCover(x - dx * 0.4, p.y, z - dz * 0.4, dx, dz, 1.0, _cpt);
      if (hit && hit.dist > 0.2) return { kind: hit.kind, ref: hit.ref, x: hit.x, z: hit.z, nx: hit.nx, nz: hit.nz, h: hit.h, dist: 0.3 };
    }
    return null;
  }
  // the cover tick after the physics step: slide into the spot, hold it, lean out to peek, face the cover
  function coverTick(p, dt) {
    var c = p.cover;
    if (p._coverRun) {
      var cr = p._coverRun, cand = cr.cand; cr.t += dt;
      if (U.dist2d(p.x, p.z, cand.x, cand.z) > COVER.runMax + 4 || !p.alive || p.knockedDown || p.inVehicle || cr.t > 4 || (GTP.Input.move.x || GTP.Input.move.z)) { p._coverRun = null; }
      else { var d = p.moveTo(cand.x, cand.z, true); if (d < 0.5) { cand.dist = d; enterCover(p, cand); } }
      return;
    }
    if (!c) return;
    if (!p.alive || p.knockedDown || p.inVehicle || p.swimming || p.entering) { exitCover(p, 'interrupted'); return; }
    // a teleport (a mission retry, a restart, a load) leaves cover instead of snapping back to it
    if (U.dist2d(p.x, p.z, c.bx, c.bz) > 2 && !(c.slide && c.slide.t < c.slide.dur)) { exitCover(p, 'moved'); return; }
    if (c.kind === 'vehicle' && c.ref && (c.ref.removed || c.ref.speed2d() > 1.5 || c.ref.wreck)) { exitCover(p, 'moved'); return; }
    c.t += dt; c.alertT += dt;
    if (c.alertT > COVER.alertEvery) { c.alertT = 0; coverAlert(p); }
    if (c.blindT > 0) c.blindT -= dt;
    // the peek: low cover stands up; high cover leans out at an edge (only); a high wall mid-face stays a blind-fire spot
    var wantPeek = !!p.aiming && (!c.high || !!c.edge);
    c.peek = wantPeek;
    c.peekK = U.clamp(c.peekK + (wantPeek ? dt / 0.16 : -dt / 0.16), 0, 1);
    var tx = c.nz, tz = -c.nx, sgn = c.side === 'right' ? 1 : -1;
    var lean = c.high ? COVER.peekOut * c.peekK : 0;
    var gx = c.bx + tx * sgn * lean, gz = c.bz + tz * sgn * lean;
    var sl = c.slide;
    if (sl && sl.t < sl.dur) { sl.t += dt; var k = U.clamp(sl.t / sl.dur, 0, 1); k = k * (2 - k); gx = sl.fx + (gx - sl.fx) * k; gz = sl.fz + (gz - sl.fz) * k; }
    var r = W().resolveCapsule(gx, gz, p.y + 0.4, p.radius);
    p.x = r.x; p.z = r.z; p.vx = 0; p.vz = 0;
    if (!p.aiming && !(p.firePoseT > 0) && !p._melee) p.yaw = U.angleDamp(p.yaw, U.dirToYaw(-c.nx, -c.nz), 14, dt);
    if (p._sh) E().hash.update(p);
  }
  // the vault over low cover: find the far side (a free spot 0.6..2.6 m through the cover), then a 0.5 s hop over it
  function startVault(p) {
    var c = p.cover; if (!c || c.high) return false;
    var Wd = W();
    for (var d = 0.7; d <= 3.6; d += 0.15) {
      var x = c.bx - c.nx * d, z = c.bz - c.nz * d;
      var res = Wd.resolveCapsule(x, z, p.y + 0.4, p.radius);
      if (Math.abs(res.x - x) + Math.abs(res.z - z) > 0.02) continue;
      if (c.kind === 'vehicle' && c.ref && c.ref.pushCircle(x, z, p.radius)) continue;
      var gy = Wd.heightAt(x, z, p.y + 1.5);
      if (Math.abs(gy - p.y) > 1.2 || Wd.solidAt(x, z, gy + 0.5)) continue;
      var top = Math.max(p.y, gy) + Math.min(1.4, Math.max(0.6, (c.kind === 'vehicle' && c.ref ? c.ref.cls.height : 1.0)) + 0.25);
      p._vault = { t: 0, dur: 0.52, fx: p.x, fy: p.y, fz: p.z, tx: x + -c.nx * 0.1, ty: gy, tz: z + -c.nz * 0.1, top: top };
      exitCover(p, 'vault');
      p.yaw = U.dirToYaw(-c.nx, -c.nz);
      sfx('jump', p.x, p.z, 0.5);
      p.stats.vaults = (p.stats.vaults || 0) + 1;
      return true;
    }
    return false;
  }
  // Ped.update calls this while ped._vault is set (the physics step is skipped): the hop along an arc
  function vaultStep(p, dt) {
    var v = p._vault; if (!v) return false;
    if (!p.alive || p.knockedDown || p.inVehicle || p.entering || p.swimming) { p._vault = null; return false; }
    v.t += dt;
    var k = U.clamp(v.t / v.dur, 0, 1), e = k * k * (3 - 2 * k);
    p.x = v.fx + (v.tx - v.fx) * e; p.z = v.fz + (v.tz - v.fz) * e;
    var base = v.fy + (v.ty - v.fy) * e; p.y = base + (v.top - Math.max(v.fy, v.ty)) * Math.sin(Math.PI * k) * 0.9;
    p.vx = (v.tx - v.fx) / v.dur; p.vz = (v.tz - v.fz) / v.dur; p.vy = 0; p.onGround = false;
    if (k >= 1) { p._vault = null; p.y = v.ty; p.onGround = true; p.vx *= 0.4; p.vz *= 0.4; sfx('land', p.x, p.z, 0.35); }
    return true;
  }
  function coverToggle(p) {
    if (!p || !p.alive || p.inVehicle || p.swimming || p.knockedDown || p._vault) return false;
    if (p.cover) { exitCover(p, 'key'); return true; }
    return enterCover(p, findCover(p));
  }
  function coverHud(p) {
    if (p.cover) return { active: true, high: p.cover.high, side: p.cover.side, edge: p.cover.edge, peek: p.cover.peek, kind: p.cover.kind, canVault: !p.cover.high, blind: p.cover.blindT > 0 };
    return { active: false, near: !!(p._coverNear), nearHigh: !!(p._coverNear && p._coverNear.h >= COVER.hiH) };
  }
  // the fallback key for cover until 02_input binds the action: C (Q is still the aim key there)
  function installCoverKey() {
    if (typeof document === 'undefined' || installCoverKey.done) return;
    installCoverKey.done = true;
    function bound() { var In = GTP.Input; if (!In || !In.bindings) return false; for (var k in In.bindings) { var a = In.bindings[k]; if (a && a.indexOf && a.indexOf('cover') >= 0) return true; } return false; }
    document.addEventListener('keydown', function (ev) { if (ev.code !== 'KeyC' || ev.repeat || bound()) return; var In = GTP.Input; if (In && In.text && In.text.capture) return; if (In) In.set('cover', true); });
    document.addEventListener('keyup', function (ev) { if (ev.code !== 'KeyC' || bound()) return; if (GTP.Input) GTP.Input.set('cover', false); });
  }
  installCoverKey();

  // --------------------------------------------------------------- pickups --
  var pickupT = 1.9, labelTex = {}, geoCache = {}, lastWeapon = null;
  function labelTexture(label) {
    if (labelTex[label]) return labelTex[label];
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
    var ctx = cv.getContext('2d'), band = SPONSOR_COLOR[label] || '#e8b53a';
    ctx.fillStyle = '#f4ecd8'; ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = band; ctx.fillRect(0, 0, 256, 28); ctx.fillRect(0, 140, 256, 20);
    ctx.fillStyle = '#1a1a22'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var words = label.split(' '), size = words.length > 1 ? 34 : 40;
    ctx.font = 'bold ' + size + 'px Arial, Helvetica, sans-serif';
    if (words.length > 1) { ctx.fillText(words[0], 128, 66, 240); ctx.fillText(words.slice(1).join(' '), 128, 106, 240); }
    else ctx.fillText(label, 128, 84, 240);
    ctx.font = 'bold 14px Arial, sans-serif'; ctx.fillStyle = '#f4ecd8'; ctx.fillText('SPONSORED PRODUCT', 128, 150);
    var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    labelTex[label] = tex;
    return tex;
  }
  function labelMesh(label, w, h) {
    var mat = new THREE.MeshBasicMaterial({ map: labelTexture(label), transparent: false });
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.name = 'label';
    return m;
  }
  function geo(key, build) {
    if (geoCache[key]) return geoCache[key];
    var g = new GTP.GeoBuilder({ color: true }); build(g);
    return (geoCache[key] = g.build());
  }
  var BOTTLE = [0.93, 0.93, 0.95];
  function bottleGeo(cap) {
    return geo('bottle:' + cap.join(','), function (g) {
      g.cylinder(0, 0, 0, 0.13, 0.13, 0.38, 10, BOTTLE);
      g.cylinder(0, 0.38, 0, 0.13, 0.06, 0.07, 10, BOTTLE);
      g.cylinder(0, 0.45, 0, 0.06, 0.06, 0.07, 8, BOTTLE);
      g.cylinder(0, 0.52, 0, 0.07, 0.07, 0.06, 8, cap);
    });
  }
  function bottle(label, cap) {
    var grp = new THREE.Group();
    var body = new THREE.Mesh(bottleGeo(cap), GTP.Assets.propMaterial()); body.castShadow = true; body.name = 'bottle';
    grp.add(body);
    var a = labelMesh(label, 0.22, 0.17); a.position.set(0, 0.19, 0.133); grp.add(a);
    var b = labelMesh(label, 0.22, 0.17); b.position.set(0, 0.19, -0.133); b.rotation.y = Math.PI; grp.add(b);
    return grp;
  }
  function glowSprite(color, scale) {
    var A = GTP.Assets;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glow, color: color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    sp.scale.set(scale, scale, 1); sp.position.y = 0.15; sp.name = 'glow';
    return sp;
  }
  function sponsorFor(id) { return SPONSOR[id] || 'BOTH SIDES ARMS'; }
  function pickupMesh(pk) {
    var type = pk.pickupType, grp = new THREE.Group(), mat = GTP.Assets.propMaterial();
    var label = pk.label || (type === 'weapon' ? sponsorFor(pk.weaponId) : SPONSOR[type]) || null;
    if (type === 'cash') {
      var cg = geo('cash', function (g) {
        g.box(-0.24, 0, -0.14, 0.48, 0.07, 0.28, null, [0.25, 0.65, 0.3]);
        g.box(-0.22, 0.07, -0.12, 0.44, 0.06, 0.24, null, [0.3, 0.75, 0.35]);
        g.box(-0.06, 0, -0.15, 0.12, 0.14, 0.3, null, [0.95, 0.82, 0.3]);
      });
      var cm = new THREE.Mesh(cg, mat); cm.castShadow = true; grp.add(cm);
      grp.add(glowSprite(0x9dff3c, 1.3));
    } else if (type === 'health' || type === 'armor') {
      grp.add(bottle(label || (type === 'health' ? 'CLARITY PELLETS' : 'NAP DYNASTY'), type === 'health' ? [0.2, 0.75, 0.35] : [0.25, 0.45, 0.95]));
      grp.add(glowSprite(type === 'health' ? 0x5cff7a : 0x5aa8ff, 1.4));
    } else if (type === 'weapon' || type === 'mission') {
      var crate = geo('crate:' + (type === 'mission' ? 'gold' : 'wood'), function (g) {
        var wood = type === 'mission' ? [0.85, 0.68, 0.25] : [0.55, 0.4, 0.22], edge = type === 'mission' ? [0.6, 0.45, 0.12] : [0.35, 0.24, 0.12];
        g.box(-0.28, 0, -0.28, 0.56, 0.34, 0.56, null, wood);
        g.box(-0.29, 0.3, -0.29, 0.58, 0.05, 0.06, null, edge); g.box(-0.29, 0.3, 0.23, 0.58, 0.05, 0.06, null, edge);
        g.box(-0.29, 0.3, -0.29, 0.06, 0.05, 0.58, null, edge); g.box(0.23, 0.3, -0.29, 0.06, 0.05, 0.58, null, edge);
        g.box(-0.29, 0, -0.29, 0.06, 0.34, 0.06, null, edge); g.box(0.23, 0, -0.29, 0.06, 0.34, 0.06, null, edge);
        g.box(-0.29, 0, 0.23, 0.06, 0.34, 0.06, null, edge); g.box(0.23, 0, 0.23, 0.06, 0.34, 0.06, null, edge);
      });
      var crm = new THREE.Mesh(crate, mat); crm.castShadow = true; grp.add(crm);
      var lf = labelMesh(label || 'MERCH', 0.4, 0.22); lf.position.set(0, 0.17, 0.285); grp.add(lf);
      var lb = labelMesh(label || 'MERCH', 0.4, 0.22); lb.position.set(0, 0.17, -0.285); lb.rotation.y = Math.PI; grp.add(lb);
      if (type === 'weapon' && pk.weaponId && GTP.Assets.weaponMesh) {
        var wm = GTP.Assets.weaponMesh(pk.weaponId);
        if (wm) {
          var fit = fitOf(pk.weaponId) || {};
          if (fit.upright) { wm.position.set(-0.08, 0.35, 0.02); wm.rotation.set(0, 0.5, 0); }
          else { var sc = fit.pickupScale || 1, len = (fit.len || 0.3) * sc; wm.position.set(-len * 0.4, 0.44, 0.05); wm.rotation.set(0, 0.35, 0); wm.scale.setScalar(sc); }
          grp.add(wm);
        }
        // the sponsor's bottle, same bottle, new label
        var bt = bottle(label || 'MERCH', [0.9, 0.72, 0.2]); bt.scale.setScalar(0.7); bt.position.set(0.17, 0.34, -0.12); grp.add(bt);
      }
      grp.add(glowSprite(type === 'mission' ? 0xffd45a : 0xffbe3c, 1.5));
    } else {
      var om = new THREE.Mesh(geo('misc', function (g) { g.box(-0.2, 0, -0.2, 0.4, 0.3, 0.4, null, [0.8, 0.8, 0.85]); }), mat); grp.add(om);
      grp.add(glowSprite(0xffffff, 1.2));
    }
    grp.name = 'pickup:' + type;
    return grp;
  }
  function spawnPickup(o) {
    o = o || {};
    var Wd = W(), x = o.x, z = o.z;
    var pk = new GTP.Pickup({ x: x, z: z, pickupType: o.type || o.pickupType || 'cash', value: o.value || 0, weaponId: o.weaponId || null, ammo: o.ammo || 0, respawn: o.respawn || 0, persistent: !!o.persistent, tag: o.tag || null });
    pk.y = o.y != null ? o.y : Wd.heightAt(x, z, o.yHint || 0); pk.baseY = pk.y;
    pk.label = o.label || null;
    pk.snap();
    E().add(pk);
    return pk;
  }
  // a free spot beside a landmark door (the marker sits on the door itself)
  function pickupSpot(lm, i) {
    var Wd = W(), door = lm.door, ox = door.x - lm.x, oz = door.z - lm.z, ol = Math.sqrt(ox * ox + oz * oz) || 1;
    ox /= ol; oz /= ol;
    var sx = -oz, sz = ox, sign = (i % 2) ? -1 : 1, cands = [
      { x: door.x + sx * 3 * sign + ox * 0.8, z: door.z + sz * 3 * sign + oz * 0.8 },
      { x: door.x - sx * 3 * sign + ox * 0.8, z: door.z - sz * 3 * sign + oz * 0.8 },
      { x: door.x + ox * 3, z: door.z + oz * 3 },
      { x: door.x + sx * 1.6 * sign, z: door.z + sz * 1.6 * sign }
    ];
    for (var k = 0; k < cands.length; k++) {
      var c = cands[k], t = Wd.tileAt(c.x, c.z), T = Wd.T;
      if (t === T.BUILDING || t === T.WATER || t === T.VOID || t === T.ROAD || t === T.RAMP) continue;
      if (Wd.solidAt(c.x, c.z, 0.5)) continue;
      var r = Wd.resolveCapsule(c.x, c.z, 0.5, 0.5);
      return { x: r.x, z: r.z };
    }
    return { x: door.x, z: door.z };
  }
  function spawnWorldPickups() {
    var CW = GTP.Content && GTP.Content.world, tbl = CW && CW.spawn && CW.spawn.pickups;
    if (!tbl || !W().tiles) return;
    var done = GTP.Missions && GTP.Missions.state && GTP.Missions.state.completed;
    for (var i = 0; i < tbl.length; i++) {
      var d = tbl[i], key = i + ':' + d.type + ':' + (d.weaponId || '') + ':' + (d.landmark || '');
      var have = Combat.pickups.get(key);
      if (have && !have.removed) continue;
      if (d.after && !(done && done.has && done.has(d.after))) continue;
      var lm = W().landmark(d.landmark); if (!lm || !lm.door) continue;
      var pos = d.x != null ? { x: d.x, z: d.z } : pickupSpot(lm, i);
      var pk = spawnPickup({ type: d.type, value: d.value || (d.type === 'health' || d.type === 'armor' ? 50 : 0), weaponId: d.weaponId, ammo: d.ammo, x: pos.x, z: pos.z, persistent: true, respawn: d.respawn || (d.type === 'weapon' ? 180 : d.type === 'health' || d.type === 'armor' ? 60 : 90), label: d.label, tag: 'world' });
      Combat.pickups.set(key, pk);
    }
  }
  // a weapon pickup adds rounds up to the cap and switches only to a weapon that is new or from fists (QA CMB-08)
  function collectPickup(pk, p) {
    var t = pk.pickupType, msg = null, color = 0xfff0a0;
    if (t === 'cash') { p.money += pk.value | 0; msg = '+' + U.fmtMoney(pk.value); color = 0x9dff3c; }
    else if (t === 'health') { p.hp = Math.min(p.maxHp, p.hp + (pk.value || 50)); msg = (pk.label || SPONSOR.health) + ': health restored'; color = 0x5cff7a; }
    else if (t === 'armor') { p.armor = Math.min(100, (p.armor || 0) + (pk.value || 50)); msg = (pk.label || SPONSOR.armor) + ': firmness +' + (pk.value || 50); color = 0x5aa8ff; }
    else if (t === 'weapon' && pk.weaponId && WEAPONS[pk.weaponId]) {
      var id = pk.weaponId, w = WEAPONS[id], n = pk.ammo || (w.melee ? Infinity : 20), had = owns(p, id);
      if (w.melee) { p.weapons[id] = Infinity; msg = w.name; }
      else {
        var got = giveAmmo(p, id, n, true);
        if (!(got > 0) && had) return 'skip';   // full: the crate stays for later
        msg = w.name + ' +' + got;
      }
      if (pk.label) msg += ' (' + pk.label + ')';
      if (!had || p.weapon === 'fist') { p.weapon = id; cancelReload(p); }
      color = 0xffbe3c;
    } else return false;
    fx({ type: 'ring', x: pk.x, y: pk.y + 0.05, z: pk.z, size: 1.3, life: 0.4, color: color });
    textFx(msg, pk.x, pk.y + 1.4, pk.z, '#' + ('000000' + color.toString(16)).slice(-6), 1.2);
    toast(msg);
    p.stats.pickups = (p.stats.pickups || 0) + 1;
    return true;
  }

  // --------------------------------------------------- death and respawn --
  function clearPlayerCombatState(p) {
    p.ammo = {}; p.reloadT = 0; p.reloadTotal = 0; p._cook = null; p._casingT = 0; p._burst = null; p._melee = null; p._vault = null; p._coverRun = null; p._spin = 0;
    if (p.cover) exitCover(p, 'reset');
    bloom.cone = 0; bloom.k = 0; bloom.burst = 0;
    if (scope.active) { scope.active = false; if (p.cameraMode === 'first') p.cameraMode = p._scopeCam || 'chase'; p._scopeCam = null; }
    if (wheel.open) closeWheel(p, false);
  }
  function deathTick(p, dt) {
    var g = GTP.game, d = Combat.death;
    if (!d) d = Combat.death = { kind: g.state === 'busted' ? 'busted' : 'wasted', t: 0, text: failText(g.state === 'busted' ? 'busted' : 'wasted') };
    d.t += dt;
    // the body keeps simulating while the rest of the city is frozen
    p._px = p.x; p._py = p.y; p._pz = p.z; p._pyaw = p.yaw;
    try { p.update(dt); } catch (e) { U.reportError(e, 'combat.deathTick'); }
    if (p._sh) E().hash.update(p);
    var r = rig();
    if (r && d.kind === 'wasted') { r.pitch = U.damp(r.pitch, 0.62, 1.4, dt); r.yaw += dt * 0.3; }
    if (d.t >= RESPAWN_DELAY) respawnPlayer(d.kind === 'busted' ? 'police' : 'hospital');
  }
  function respawnPlayer(kind) {
    var p = player(), g = GTP.game, Wd = W(); if (!p || !g) return;
    var CW = GTP.Content && GTP.Content.world, rs = (CW && CW.respawn) || {};
    var id = kind === 'police' ? (rs.police || 'police_hq') : (rs.hospital || 'hospital');
    var lm = Wd.landmark(id), door = lm && lm.door ? lm.door : null;
    var x = door ? door.x : p.x, z = door ? door.z : p.z, yaw = p.yaw;
    if (lm && door) {
      var ox = door.x - lm.x, oz = door.z - lm.z, ol = Math.sqrt(ox * ox + oz * oz) || 1; ox /= ol; oz /= ol;
      x = door.x + ox * 1.6; z = door.z + oz * 1.6; yaw = U.dirToYaw(ox, oz);
      var res = Wd.resolveCapsule(x, z, 0.5, C.PLAYER.radius); x = res.x; z = res.z;
      if (Wd.solidAt(x, z, 0.5)) { x = door.x; z = door.z; }
    }
    var fine = 0;
    if (kind === 'police') {
      // the fine by the stars at the bust (GDD_EXPANSION 6.9: $500, $800 at 3+, never over 15% of the cash)
      var lvl = Combat.death && Combat.death.level != null ? Combat.death.level : 1;
      fine = GTP.AI && GTP.AI.bustFine ? GTP.AI.bustFine(lvl, p.money) : C.ECONOMY.bustedFine;
      p.money = Math.max(0, p.money - fine); p.stats.busted = (p.stats.busted || 0) + 1;
    }
    else { fine = Math.round(p.money * C.ECONOMY.deathCashLoss); p.money = Math.round(p.money * (1 - C.ECONOMY.deathCashLoss)); p.stats.deaths = (p.stats.deaths || 0) + 1; }
    if (p.inVehicle) p.exitVehicle();
    p.weapons = { fist: Infinity }; p.weapon = 'fist';
    clearPlayerCombatState(p);
    p.alive = true; p.hp = p.maxHp; p.armor = 0; p.knockedDown = false; p.downT = 0; p.swimming = false; p.state = 'idle';
    p.corpseT = 0; p.deadT = 0; p.tilt = 0; p.hurtT = 0; p.entering = null; p.lastHitBy = null; p.lastHitType = null; p.respawnT = 0;
    p.x = x; p.z = z; p.y = Wd.heightAt(x, z, 0); p.yaw = yaw; p.vx = p.vz = p.vy = 0; p.onGround = true;
    p.aiming = false; p.lockTarget = null; p.firePoseT = 0; p.punchT = 0; p.intent.x = p.intent.z = 0;
    p.snap();
    if (p._sh) E().hash.update(p);
    if (wanted()) wanted().clear();
    p.controlEnabled = true;
    Combat.death = null; Combat.hurtFlash = 0;
    aim.active = false; aim.target = null;
    g.setState('playing');
    var r = rig(); if (r) { r.yaw = yaw; r.pitch = 0.2; r.snap(); GTP.Render.updateCamera(0); }
    var name = lm ? (lm.label || lm.name) : (kind === 'police' ? 'the precinct' : 'the hospital');
    toast(kind === 'police' ? 'Released from ' + name + '. Fine: ' + U.fmtMoney(fine) + '. Rated a four.' : 'Discharged from ' + name + '. The bandage has a coupon code. ' + U.fmtMoney(-fine));
    GTP.Events.emit('player:respawn', { player: p, at: kind });
  }
  // --------------------------------------------------------------- update --
  function armCop(e) {
    // cops at three stars or more may carry The Rebuttal; SWAT carry The Monologue (once, on sight; mission goons keep theirs)
    e._armed = true;
    if (e.hostile || (e.ai && e.ai.mission)) return;
    var lvl = wanted() ? wanted().level : 0;
    if (e.role === 'swat') e.weapon = 'rifle';
    else if (e.role === 'cop' && lvl >= 3 && (e.weapon === 'pistol' || !e.weapon) && R().chance(0.5)) e.weapon = 'revolver';
  }
  function entityPass(dt) {
    var list = E().list, cs = C.PHYS.corpseSeconds;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.removed) continue;
      if (e.kind === 'ped' || e.kind === 'player') {
        if (e.kind === 'ped' && !e._armed && isCopRole(e)) armCop(e);
        if (e._melee) tickMelee(e, dt);
        if (e.mesh && (e.kind === 'player' || e._held || e.weapon !== 'fist')) ensureHeld(e);
        if (e.mesh && !e.alive && e.kind === 'ped' && !e.persistent) {
          // the fade: sink and shrink into the pavement over the last 1.5 s
          var k = (e.corpseT - (cs - 1.5)) / 1.5;
          if (k > 0) { var base = (e.look && e.look.scale) || 1, s = base * (1 - U.clamp(k, 0, 0.98)); e.mesh.scale.set(base, Math.max(0.02, s), base); e._fading = true; }
          else if (e._fading) { e._fading = false; var b2 = (e.look && e.look.scale) || 1; e.mesh.scale.setScalar(b2); }
        }
        // an AI burst: autos fire two more rounds after the first
        if (e._burst && e.kind === 'ped') {
          var bu = e._burst; bu.t += dt;
          if (!e.alive || e.inVehicle || e.knockedDown || !WEAPONS[bu.id]) e._burst = null;
          else if (bu.t >= 0.09) { bu.t = 0; bu.n--; var bw = WEAPONS[bu.id]; hitscan(e, bw, bu.id, aimContext(e, bw, bu.id)); e.firePoseT = Math.max(e.firePoseT || 0, 0.5); e._shotAge = 0; if (bu.n <= 0) e._burst = null; }
        }
        // the sniper's casing comes out with the bolt, a beat after the shot
        if (e._casingT > 0) { e._casingT -= dt; if (e._casingT <= 0) { var mo = muzzle(e), md = U.yawToDir(e.aimYaw || e.yaw); ejectCasing(e, mo, { x: md.x, y: 0, z: md.z }, e.weapon); } }
      } else if (e.kind === 'projectile') {
        if (e.weaponId === 'hottake') { e._trailT = (e._trailT || 0) + dt; if (e._trailT > 0.05) { e._trailT = 0; fx({ type: 'smoke', x: e.x, y: e.y, z: e.z, size: 0.35, life: 0.5, color: 0xffa060, vy: 0.4 }); } }
        syncProjectile(e, dt);
      } else if (e.kind === 'vehicle' && e._flipT > 0) {
        // the rocket's flip: a barrel roll over the airtime (the physics damps roll toward the ground slope; this rides on top)
        e._flipT -= dt;
        var fk = 1 - Math.max(0, e._flipT) / e._flipDur;
        e.roll = fk * Math.PI * 2 * (e._flipDir || 1);
        if (e._flipT <= 0) { e._flipT = 0; e.roll = 0; }
      }
    }
  }
  // a hot mic in flight / a rocket in flight: skin the entity's default sphere with the real thing
  var ROCKET_GEO = null;
  function skinProjectile(e) {
    if (e._skinned || !e.mesh) return;
    e._skinned = true;
    var A = GTP.Assets;
    var w = WEAPONS[e.weaponId] || {};
    if ((e instanceof HotMic || w.fuse || w.smoke || w.splash || w.stick) && A.weaponGeometry && A.weaponGeometry(e.weaponId)) {
      var wm = A.weaponMesh(e.weaponId); if (!wm) return;
      e.mesh.geometry = wm.geometry; e.mesh.material = wm.material; e.mesh.scale.setScalar(1.1);
      var cap = wm.getObjectByName('cap'); if (cap) { wm.remove(cap); e.mesh.add(cap); e._cap = cap; }
    } else if (w.rocket) {
      if (!ROCKET_GEO) { var g = new GTP.GeoBuilder({ color: true }); g.cylinder(0, -0.3, 0, 0.09, 0.09, 0.5, 7, [0.35, 0.37, 0.4]); g.cylinder(0, 0.2, 0, 0.09, 0.02, 0.2, 7, [1, 0.25, 0.64]); g.box(-0.16, -0.3, -0.01, 0.32, 0.12, 0.02, GTP.GeoBuilder.UV0, [0.9, 0.9, 0.95]); g.box(-0.01, -0.3, -0.16, 0.02, 0.12, 0.32, GTP.GeoBuilder.UV0, [0.9, 0.9, 0.95]); ROCKET_GEO = g.build(); }
      e.mesh.geometry = ROCKET_GEO; e.mesh.material = A.propMaterial ? A.propMaterial() : e.mesh.material;
    }
  }
  function syncProjectile(e, dt) {
    if (!e.mesh) return;
    if (e.weaponId === 'hottake') { e.mesh.rotation.x += dt * 12; return; }
    skinProjectile(e);
    if (e._cap && e.fuse0) { var f = 2 + 10 * (1 - U.clamp(e.fuse / e.fuse0, 0, 1)); e._cap.material.color.setHex(Math.sin(e.age * Math.PI * 2 * f) > 0 ? 0xff3a2a : 0x3a1010); }
  }
  // the player's per-step combat housekeeping (playing only)
  function playerTick(p, dt) {
    var In = GTP.Input;
    tickReload(p, dt);
    tickBloom(p, dt);
    updateScope(p, dt);
    updateWheel(p, dt);
    tickCook(p, dt, In);
    coverTick(p, dt);
    if (p._backblast) { var bb = p._backblast; bb.t -= dt; if (bb.t <= 0 || !p.onGround || p.inVehicle || p.knockedDown) p._backblast = null; else { p.vx = bb.x; p.vz = bb.z; } }
    var w = eff(p, p.weapon);
    // the melee hold (heavy) and the minigun's spin-up
    var trig = In.down('shoot') || In.down('action');
    if (trig) p._meleeHeld = (p._meleeHeld || 0) + dt; else { p._meleeHeld = 0; p._heavyDone = false; }
    if (w && w.spinUp) { p._spin = U.clamp((p._spin || 0) + (trig && p.alive && !p.inVehicle ? dt : -dt * 0.7) / w.spinUp, 0, 1); p._spinA = (p._spinA || 0) + p._spin * dt * 40; }
    else p._spin = 0;
    // a cover prompt when cover is within reach (the UI reads hud().cover.near), checked a few times a second
    p._coverNearT = (p._coverNearT || 0) - dt;
    if (p._coverNearT <= 0 && !p.cover && !p.inVehicle) { p._coverNearT = 0.25; p._coverNear = (p.alive && GTP.game && GTP.game.state === 'playing') ? findCover(p, 1.8) : null; }
    if (!p.alive || !p.controlEnabled) return;
    if (In.pressed('reload') && !wheel.open && !p._cook) { if (!p.inVehicle || driveByWeapon(p.weapon)) Combat.reload(p); }
    if (p.inVehicle && p.inVehicle.driver === p && w) {
      // thrown things go out of the window without aim (one per press: a held trigger never cooks a second mic, QA CMB-12); the long
      // guns refuse with a toast
      if (w.lobbed && !w.impact && (In.down('shoot') || In.down('action')) && !p._cook && !p._cookLock) { try { Combat.fire(p, p.weapon); } catch (e) { U.reportError(e, 'combat.windowThrow'); } }
      else if (In.down('aim') && !w.melee && !w.cone && !(w.lobbed && !w.impact) && !w.driveBy) { var now = simT(); if (now - (p._refuseT || -9) > 3) { p._refuseT = now; toast(DRIVEBY_REFUSAL); } }
    }
  }
  // the aim walk speed (Ped._walk reads Combat.moveScale): heavier weapons slow an aiming player
  function moveScale(p) {
    if (!p || p.kind !== 'player') return 1;
    var w = WEAPONS[p.weapon]; if (!w) return 1;
    var mob = w.mobility != null ? w.mobility : MOBILITY[w.cls] != null ? MOBILITY[w.cls] : 0.8;
    if (w.spinUp) return p.aiming || p._spin > 0.2 ? 0.45 : 0.85;
    return p.aiming ? 0.7 + 0.3 * mob : 1;
  }

  // ----------------------------------------------------------------- shop --
  // Both Sides Arms. Weapons, ammo, attachments, tints and gear (GDD_EXPANSION.md 2.4; Content.expansion.shop.items overrides an
  // item by id); stores are every landmark of kind 'gunshop' (plus Content.expansion.shop.stores ids). A green marker at each
  // door; 0.5 s inside it on foot emits 'shop:open' (and calls UI.openShop when the UI has one).
  var SHOP_ITEMS = [
    { id: 'ammo_pistol', tab: 'ammo', weapon: 'pistol', rounds: 24, price: 60, name: 'Pistol rounds (24)' },
    { id: 'ammo_revolver', tab: 'ammo', weapon: 'revolver', rounds: 12, price: 90, name: 'Rebuttal rounds (12)' },
    { id: 'ammo_smg', tab: 'ammo', weapon: 'smg', rounds: 60, price: 150, name: 'SMG rounds (60)' },
    { id: 'ammo_rifle', tab: 'ammo', weapon: 'rifle', rounds: 60, price: 220, name: 'Monologue rounds (60)' },
    { id: 'ammo_shotgun', tab: 'ammo', weapon: 'shotgun', rounds: 12, price: 120, name: 'Shells (12)' },
    { id: 'ammo_sniper', tab: 'ammo', weapon: 'sniper', rounds: 5, price: 250, name: 'Fact Checker rounds (5)' },
    { id: 'ammo_hottake', tab: 'ammo', weapon: 'hottake', rounds: 3, price: 90, name: 'Hot Takes (3)' },
    { id: 'ammo_hotmic', tab: 'ammo', weapon: 'hotmic', rounds: 4, price: 400, name: 'Hot Mics (4)' },
    { id: 'ammo_ratio', tab: 'ammo', weapon: 'ratio', rounds: 1, price: 600, name: 'Rocket (1)' },
    { id: 'ammo_megaphone', tab: 'ammo', weapon: 'megaphone', rounds: 20, price: 40, name: 'Megaphone charges (20)' },
    { id: 'clarity_pellets', tab: 'gear', price: 150, hp: 50, name: 'Clarity Pellets', pitch: "Your doctor won't sell you these. I will." },
    { id: 'clarity_family', tab: 'gear', price: 400, hp: 'full', name: 'Clarity Pellets, Family Size', pitch: 'The family is you, four times.' },
    { id: 'firmness_vest', tab: 'gear', price: 500, armor: 100, name: 'Nap Dynasty Firmness Vest', pitch: 'Firmness level nine. Code VEST20 does nothing.' },
    { id: 'range_reset', tab: 'range', price: 50, flagship: true, name: 'Range reset', pitch: 'Six hecklers, sixty seconds. They still don\'t sue.' }
  ];
  // an ammo box for every weapon with rounds that the table above does not list: two magazines (a thrown thing: its pack) at about
  // 4% of the weapon's price per magazine
  function ammoItems() {
    var out = [], have = {};
    for (var i = 0; i < SHOP_ITEMS.length; i++) if (SHOP_ITEMS[i].weapon) have[SHOP_ITEMS[i].weapon] = true;
    for (i = 0; i < ORDER.length; i++) {
      var id = ORDER[i], w = WEAPONS[id]; if (have[id] || w.melee || w.cone || !(w.reserve > 0)) continue;
      var rounds = w.mag ? Math.max(1, w.mag * 2) : (w.pack || 1), price = Math.max(20, Math.round((w.price || 500) * (w.mag ? 0.045 * Math.min(2, rounds / Math.max(1, w.mag)) : 0.85 / Math.max(1, w.pack || 1) * rounds) / 5) * 5);
      if (w.rocket || w.impact) price = Math.max(price, Math.round((w.price || 5000) * 0.07 / 5) * 5 * rounds);
      out.push({ id: 'ammo_' + id, tab: 'ammo', weapon: id, rounds: Math.min(rounds, w.reserve + (w.mag || 0)), price: price, name: w.name + (w.mag ? ' rounds (' : ' (') + Math.min(rounds, w.reserve + (w.mag || 0)) + ')' });
    }
    return out;
  }
  function attachmentList() {
    var A = GTP.Assets, base = (A && A.weaponAttachments) || {}, P = GTP.Content && GTP.Content.parity, list = {}, s;
    for (s in base) list[s] = base[s].slice();
    var pa = P && P.attachments;
    if (pa) {
      var arr = Array.isArray(pa) ? pa : Object.keys(pa).map(function (k) { var o = pa[k]; if (o && !o.id) o.id = k; return o; });
      for (var i = 0; i < arr.length; i++) {
        var a = arr[i]; if (!a || !a.id) continue;
        var slot = a.slot || a.kind; if (!slot) continue;
        var known = MOD_FX[a.id] ? a.id : (a.variant && MOD_FX[a.variant] ? a.variant : (slot === 'muzzle' ? 'suppressor' : slot === 'mag' ? 'extended' : slot === 'optic' ? (/scope|lens|long/i.test(a.id + a.name) ? 'scope' : 'reddot') : slot === 'grip' ? 'grip' : 'flashlight'));
        list[slot] = list[slot] || [];
        var found = null; for (var k = 0; k < list[slot].length; k++) if (list[slot][k].id === known) found = list[slot][k];
        if (found) { if (a.name) found.name = a.name; if (a.price != null) found.price = a.price; if (a.flavor) found.pitch = a.flavor; }
        else list[slot].push({ id: known, name: a.name || known, price: a.price != null ? a.price : 400, pitch: a.flavor || '' });
      }
    }
    return list;
  }
  function tintList() {
    var A = GTP.Assets, base = (A && A.weaponTints) || [{ id: 'stock', name: 'Factory Finish', price: 0 }], P = GTP.Content && GTP.Content.parity, pt = P && P.tints;
    if (!pt) return base;
    var arr = Array.isArray(pt) ? pt : Object.keys(pt).map(function (k) { var o = pt[k]; if (o && !o.id) o.id = k; return o; });
    var out = base.map(function (t) { return Object.assign({}, t); });
    for (var i = 0; i < arr.length; i++) { var t = arr[i]; if (!t || !t.id) continue; for (var k = 0; k < out.length; k++) if (out[k].id === t.id) { if (t.name) out[k].name = t.name; if (t.price != null) out[k].price = t.price; } }
    return out;
  }
  function shopItems() {
    syncArsenal();
    var out = [], i, so = shopOrder();
    for (i = 1; i < so.length; i++) { var id = so[i], w = WEAPONS[id]; out.push({ id: id, tab: 'weapons', weapon: id, price: w.price, name: w.name, unlock: UNLOCK[id] || null, pitch: PITCH[id] || w.pitch || '' }); }
    for (i = 0; i < SHOP_ITEMS.length; i++) out.push(Object.assign({ unlock: UNLOCK[SHOP_ITEMS[i].weapon] || null }, SHOP_ITEMS[i]));
    var am = ammoItems(); for (i = 0; i < am.length; i++) out.push(Object.assign({ unlock: UNLOCK[am[i].weapon] || null }, am[i]));
    var X = GTP.Content && GTP.Content.expansion && GTP.Content.expansion.shop, ext = X && X.items;
    if (ext && ext.length) for (i = 0; i < ext.length; i++) {
      var it = ext[i], found = false;
      for (var k = 0; k < out.length; k++) if (out[k].id === it.id) {
        // the v0.2 expansion rows add pitch lines and art; a weapon from the parity table keeps its own unlock, name and price
        // (the v0.3 story moved some unlocks: the pistol now comes with m01c_both_sides)
        var keep = out[k].tab === 'weapons' && WEAPONS[it.id] && WEAPONS[it.id].parity ? { unlock: out[k].unlock, name: out[k].name, price: out[k].price } : null;
        out[k] = Object.assign(out[k], it); if (keep) Object.assign(out[k], keep);
        found = true; break;
      }
      if (!found) out.push(Object.assign({}, it));
    }
    return out;
  }
  function missionTitle(id) {
    var P = GTP.Content && GTP.Content.parity;
    var lists = [GTP.Content && GTP.Content.missions, GTP.Content && GTP.Content.expansion && GTP.Content.expansion.missions, P && P.missions];
    for (var l = 0; l < lists.length; l++) { var L = lists[l]; if (!L || !L.length) continue; for (var i = 0; i < L.length; i++) if (L[i] && L[i].id === id) return L[i].title || L[i].name || id; }
    return 'a later story mission';
  }
  function unlocked(item) {
    if (!item.unlock) return true;
    var Ms = GTP.Missions && GTP.Missions.state; if (!Ms) return false;
    if (Ms.completed && Ms.completed.has && Ms.completed.has(item.unlock)) return true;
    if (item.weapon === 'ratio' && Ms.flags && (Ms.flags.memos40 || Ms.flags.ratio_unlocked)) return true;
    return false;
  }
  // the five bars, 0..1, with the player's attachments on the weapon
  function weaponStats(id, p) {
    var w = p ? eff(p, id) : WEAPONS[id]; if (!w) return null;
    var vol = w.pellets ? w.dmg : w.dmg, dps = w.melee ? w.dmg * w.rate : w.cone ? 0 : vol * Math.min(w.rate, 18);
    var acc = w.melee ? 1 : w.cone || w.lobbed && !w.rocket ? 0.45 : U.clamp(1 - ((w.aimSpread != null ? w.aimSpread : w.spread || 0) + (w.bloom ? w.bloom.max * 0.5 : 0)) / 0.12, 0.08, 1);
    if (w.scope) acc = Math.max(acc, 0.92);
    var mob = w.mobility != null ? w.mobility : MOBILITY[w.cls] != null ? MOBILITY[w.cls] : 0.7;
    if (p && modsOf(p, id) && modsOf(p, id).optic === 'scope') mob *= 0.95;
    return { damage: U.clamp(vol / 160, 0.04, 1), rate: U.clamp(w.rate / 14, 0.03, 1), range: U.clamp(w.range / 160, 0.02, 1), accuracy: acc, mobility: U.clamp(mob, 0.05, 1), volume: U.clamp((w.mag || w.reserve || 1) / 30, 0.05, 1), dps: dps };
  }
  var shop = {
    state: { open: false, landmark: null, store: null, flagship: false },
    discountHook: null,        // fn(player) -> 0..0.4 (Monday Memos / subscriber tiers) for when the content rule is missing
    rangeT: 0, rangeBest: null,
    _stores: [], _markers: [], _seed: null, _armed: {}, _hold: 0, _cur: null, _pulse: 0,
    // the content's rule when it is there, else the missions' hook, never both (they count the same two perks: QA STR-08)
    discount: function () {
      var p = player(), d = 0, X = GTP.Content && GTP.Content.expansion && GTP.Content.expansion.shop;
      try {
        if (X && typeof X.discount === 'function') d = X.discount(p) || 0;
        else if (typeof shop.discountHook === 'function') d = shop.discountHook(p) || 0;
      } catch (e) { U.reportError(e, 'shop.discount'); }
      return U.clamp(d, 0, 0.4);
    },
    price: function (item) { return Math.round(item.price * (1 - shop.discount())); },
    stores: function () { shopRefresh(); return shop._stores; },
    items: function (tab) {
      var p = player(), raw = shopItems(), out = [], disc = shop.discount();
      for (var i = 0; i < raw.length; i++) {
        var it = raw[i]; if (tab && it.tab !== tab) continue;
        var w = it.weapon ? WEAPONS[it.weapon] : null, tot = p && w ? p.weapons[it.weapon] : 0, a = p && w && tot > 0 ? ammoOf(p, it.weapon) : null, lock = !unlocked(it);
        var notOwned = it.tab === 'ammo' && !!w && !(tot > 0);
        out.push(Object.assign({}, it, {
          listPrice: it.price, price: Math.round(it.price * (1 - disc)), locked: lock, lockedBy: lock ? missionTitle(it.unlock) : null,
          owned: it.tab === 'weapons' ? tot > 0 || tot === Infinity : false, ammo: tot === Infinity ? null : (tot | 0), mag: a && w.mag ? a.mag : null, reserve: a ? a.reserve : null,
          needsWeapon: notOwned,
          stats: w ? weaponStats(it.weapon, p) : null, canBuy: !!p && !lock && !notOwned && p.money >= Math.round(it.price * (1 - disc)) && !(it.flagship && !shop.state.flagship) && !(it.tab === 'weapons' && (tot > 0 || tot === Infinity))
        }));
      }
      return out;
    },
    buy: function (itemId) {
      var p = player(), items = shop.items(), item = null;
      for (var i = 0; i < items.length; i++) if (items[i].id === itemId) { item = items[i]; break; }
      if (!item) return /^(att|tint)_/.test(String(itemId)) ? Combat.buy(itemId) : { ok: false, reason: 'unknown', item: null, price: 0 };
      if (!p) return { ok: false, reason: 'unknown', item: null, price: 0 };
      var price = item.price;
      if (item.locked) return { ok: false, reason: 'locked', item: item, price: price, lockedBy: item.lockedBy };
      if (item.flagship && !shop.state.flagship) return { ok: false, reason: 'flagship', item: item, price: price };
      if (item.tab === 'weapons' && item.owned) return { ok: false, reason: 'owned', item: item, price: price };
      // ammo needs the weapon (QA STR-09 / CMB-02): the weapon's own price is the gate
      if (item.tab === 'ammo' && item.needsWeapon) return { ok: false, reason: 'notOwned', item: item, price: price, msg: 'Buy the weapon first' };
      if (p.money < price) return { ok: false, reason: 'funds', item: item, price: price, need: price - p.money };
      var w = item.weapon ? WEAPONS[item.weapon] : null, msg = item.name;
      if (item.tab === 'weapons' && w) {
        if (w.melee) p.weapons[item.weapon] = Infinity;
        else {
          // a gun comes with a magazine and a spare; a thrown thing or the megaphone with its box (QA STR-14)
          var give = w.mag ? magOf(p, item.weapon) * 2 : (w.pack || ammoPackOf(item.weapon) || 1);
          p.weapons[item.weapon] = (p.weapons[item.weapon] || 0) + give; ammoOf(p, item.weapon); msg += ' +' + give;
        }
        p.weapon = item.weapon; cancelReload(p);
      } else if (item.tab === 'ammo' && w) {
        var fit = giveAmmo(p, item.weapon, item.rounds, true);
        if (!(fit > 0)) return { ok: false, reason: 'full', item: item, price: price };
        msg += ' +' + fit; if (p.weapon === 'fist') p.weapon = item.weapon;
      } else if (item.hp) { if (p.hp >= p.maxHp && !item.armor) return { ok: false, reason: 'full', item: item, price: price }; p.hp = item.hp === 'full' ? p.maxHp : Math.min(p.maxHp, p.hp + item.hp); }
      else if (item.armor) { if ((p.armor || 0) >= 100) return { ok: false, reason: 'full', item: item, price: price }; p.armor = Math.min(100, item.armor); }
      else if (item.id === 'range_reset') { shop.rangeT = 60; emit('shop:range', { landmark: shop.state.landmark, seconds: 60 }); }
      p.money -= price; p.stats.spent = (p.stats.spent || 0) + price; p.stats.shopBuys = (p.stats.shopBuys || 0) + 1;
      sfx('cash', p.x, p.z, 0.8);
      emit('shop:buy', { item: item, price: price, player: p });
      if (p.weapon === item.weapon || item.tab !== 'weapons') toast(msg + ': ' + U.fmtMoney(-price));
      return { ok: true, item: item, price: price, msg: msg };
    },
    open: function (landmarkId) {
      var lm = landmarkId && typeof landmarkId === 'object' ? landmarkId : (W() && W().landmark ? W().landmark(landmarkId) : null);
      var st = storeFor(lm);
      shop.state.open = true; shop.state.landmark = lm || null; shop.state.store = st; shop.state.flagship = !!(st && st.flagship);
      sfx('ui', 0, 0, 0.4);
      emit('shop:open', { landmark: lm, store: st });
      if (GTP.UI && typeof GTP.UI.openShop === 'function') { try { GTP.UI.openShop(st, lm); } catch (e) { U.reportError(e, 'ui.openShop'); } }
      return shop.state;
    },
    close: function () {
      if (!shop.state.open) return;
      shop.state.open = false; var lm = shop.state.landmark; shop.state.landmark = null; shop.state.store = null; shop.state.flagship = false;
      if (lm) shop._armed[lm.id] = false;
      emit('shop:close', { landmark: lm });
    },
    refresh: function () { shop._seed = null; shopRefresh(); return shop._stores; }
  };
  function ammoPackOf(id) { var am = shopItems(); for (var i = 0; i < am.length; i++) if (am[i].tab === 'ammo' && am[i].weapon === id) return am[i].rounds; return 0; }
  // ---- the plan's shop API: catalog(storeId) and buy(itemId, opts) ----
  // item ids: a weapon id; 'ammo_<weapon>'; 'att_<weapon>_<slot>_<variant>'; 'tint_<weapon>_<tint>'; gear ids
  function storeFlagship(storeId) {
    if (!storeId) return !!shop.state.flagship;
    var st = null; shopRefresh(); for (var i = 0; i < shop._stores.length; i++) if (shop._stores[i].id === storeId) st = shop._stores[i];
    if (st) return !!st.flagship;
    var lm = W() && W().landmark ? W().landmark(storeId) : null; return !!(lm && lmFlag(lm, 'flagship'));
  }
  function catalog(storeId) {
    var p = player(), flag = storeFlagship(storeId), disc = shop.discount(), out = [];
    var legacy = shop.items(), i;
    for (i = 0; i < legacy.length; i++) {
      var it = legacy[i];
      if (it.flagship && !flag) continue;
      var kind = it.tab === 'weapons' ? 'weapon' : it.tab === 'ammo' ? 'ammo' : 'gear';
      var lockReason = it.locked ? 'Unlocked by ' + it.lockedBy : it.needsWeapon ? 'Buy the weapon first' : null;
      out.push({ id: it.id, kind: kind, weaponId: it.weapon || null, name: it.name, price: it.price, listPrice: it.listPrice, owned: !!it.owned, equipped: kind === 'weapon' && !!p && p.weapon === it.weapon,
        locked: !!(it.locked || it.needsWeapon), lockReason: lockReason, stats: it.stats || null, tab: it.tab, rounds: it.rounds || null, pitch: it.pitch || '', cls: it.weapon && WEAPONS[it.weapon] ? WEAPONS[it.weapon].cls : null, slot: null, variant: null });
    }
    var atts = attachmentList(), tints = tintList();
    for (i = 1; i < ORDER.length; i++) {
      var id = ORDER[i], w = WEAPONS[id]; if (w.melee || w.cone || w.cls === 'thrown') continue;
      var own = owns(p, id), wl = !unlocked({ unlock: UNLOCK[id], weapon: id }), lr = wl ? 'Unlocked by ' + missionTitle(UNLOCK[id]) : !own ? 'Buy the weapon first' : null, m = modsOf(p, id) || {}, mo = (p && p.weaponModsOwned && p.weaponModsOwned[id]) || {};
      for (var s in atts) {
        if (!slotAllowed(id, s)) continue;
        for (var k = 0; k < atts[s].length; k++) {
          var a = atts[s][k]; if (!variantAllowed(id, s, a.id)) continue;
          var ownedA = !!mo[s + ':' + a.id], pr = ownedA ? 0 : Math.round(attPrice(a.price, w) * (1 - disc));
          out.push({ id: 'att_' + id + '_' + s + '_' + a.id, kind: 'attachment', weaponId: id, slot: s, variant: a.id, name: a.name, price: pr, listPrice: attPrice(a.price, w), owned: ownedA, equipped: m[s] === a.id,
            locked: !!lr, lockReason: lr, stats: own ? statsWith(p, id, s, a.id) : null, tab: 'mods', pitch: a.pitch || '', cls: w.cls });
        }
      }
      if (w.melee) continue;
      for (k = 0; k < tints.length; k++) {
        var t = tints[k], ownedT = t.id === 'stock' || !!mo['tint:' + t.id];
        out.push({ id: 'tint_' + id + '_' + t.id, kind: 'tint', weaponId: id, slot: 'tint', variant: t.id, name: t.name, price: ownedT ? 0 : Math.round((t.price || 0) * (1 - disc)), listPrice: t.price || 0, owned: ownedT, equipped: (m.tint || 'stock') === t.id,
          locked: !!lr, lockReason: lr, stats: null, tab: 'mods', pitch: '', cls: w.cls });
      }
    }
    return out;
  }
  function attPrice(base, w) { var k = w.cls === 'pistol' ? 0.7 : w.cls === 'sniper' || w.cls === 'lmg' ? 1.3 : 1; return Math.round(base * k / 5) * 5; }
  function statsWith(p, id, slot, variant) {
    if (!p) return weaponStats(id, null);
    var saved = p.weaponMods && p.weaponMods[id] ? Object.assign({}, p.weaponMods[id]) : null;
    p.weaponMods = p.weaponMods || {}; p.weaponMods[id] = Object.assign({}, saved || {}); p.weaponMods[id][slot] = variant;
    var st = weaponStats(id, p);
    if (saved) p.weaponMods[id] = saved; else delete p.weaponMods[id];
    return st;
  }
  // buy(itemId, {equip, store}) -> {ok, reason, item, price}: weapons, ammo and gear go through the shop; an attachment or a tint
  // needs the weapon, buys once and equips (an owned one just toggles: equip:false takes it off)
  function buy(itemId, opts) {
    opts = opts || {};
    var p = player(); if (!p) return { ok: false, reason: 'unknown', item: null, price: 0 };
    var m = /^(att|tint)_(.+)$/.exec(String(itemId || ''));
    if (!m) {
      if (opts.store) { var keep = shop.state.flagship; shop.state.flagship = storeFlagship(opts.store); var r0 = shop.buy(itemId); shop.state.flagship = keep; return r0; }
      return shop.buy(itemId);
    }
    var cat = catalog(opts.store || null), item = null;
    for (var i = 0; i < cat.length; i++) if (cat[i].id === itemId) { item = cat[i]; break; }
    if (!item) return { ok: false, reason: 'unknown', item: null, price: 0 };
    if (item.locked) return { ok: false, reason: owns(p, item.weaponId) ? 'locked' : 'notOwned', item: item, price: item.price, msg: item.lockReason };
    var id = item.weaponId;
    p.weaponMods = p.weaponMods || {}; p.weaponModsOwned = p.weaponModsOwned || {};
    var mods = p.weaponMods[id] || (p.weaponMods[id] = {}), owned = p.weaponModsOwned[id] || (p.weaponModsOwned[id] = {});
    var key = item.kind === 'tint' ? 'tint:' + item.variant : item.slot + ':' + item.variant;
    if (item.owned) {
      // already bought: equip it (or take it off)
      if (item.kind === 'tint') mods.tint = item.variant === 'stock' ? null : item.variant;
      else mods[item.slot] = opts.equip === false || (item.equipped && opts.equip !== true) ? null : item.variant;
      afterMods(p, id);
      return { ok: true, reason: null, item: item, price: 0, equipped: item.kind === 'tint' ? (mods.tint || 'stock') === item.variant : mods[item.slot] === item.variant };
    }
    if (p.money < item.price) return { ok: false, reason: 'funds', item: item, price: item.price, need: item.price - p.money };
    p.money -= item.price; p.stats.spent = (p.stats.spent || 0) + item.price; p.stats.shopBuys = (p.stats.shopBuys || 0) + 1;
    owned[key] = true;
    if (opts.equip !== false) { if (item.kind === 'tint') mods.tint = item.variant === 'stock' ? null : item.variant; else mods[item.slot] = item.variant; }
    afterMods(p, id);
    sfx('cash', p.x, p.z, 0.8);
    emit('shop:buy', { item: item, price: item.price, player: p });
    toast(item.name + ' on ' + WEAPONS[id].name + ': ' + U.fmtMoney(-item.price));
    return { ok: true, reason: null, item: item, price: item.price, equipped: opts.equip !== false };
  }
  // after an attachment change: the magazine may shrink (the extra rounds go to the reserve), the stats cache is stale
  function afterMods(p, id) { p._effCache = null; ammoOf(p, id); }
  // a landmark option (flagship, gag) from the runtime landmark or, failing that, its content definition
  function lmFlag(lm, key) {
    if (!lm) return undefined;
    if (lm[key] !== undefined) return lm[key];
    var defs = GTP.Content && GTP.Content.world && GTP.Content.world.landmarks;
    if (defs) for (var i = 0; i < defs.length; i++) if (defs[i] && defs[i].id === lm.id) return defs[i][key];
    return undefined;
  }
  function storeFor(lm) {
    if (!lm) return null;
    for (var i = 0; i < shop._stores.length; i++) if (shop._stores[i].id === lm.id) return shop._stores[i];
    return { id: lm.id, name: lm.name || 'Both Sides Arms', flagship: !!lmFlag(lm, 'flagship'), landmark: lm };
  }
  // the store's trigger beside the door: 3.2 m along the wall on a walkable tile (the door itself when neither side is)
  function shopSpot(Wd, lm) {
    var d = lm.door, b = lm.building, T = Wd.T;
    if (!b || !Wd.tileAt) return { x: d.x, z: d.z };
    var nx = d.x - (b.x + b.w / 2), nz = d.z - (b.z + b.d / 2);
    var ax = Math.abs(nx) > Math.abs(nz) ? 0 : 1, az = ax ? 0 : 1;
    var cands = [[d.x + ax * 3.2, d.z + az * 3.2], [d.x - ax * 3.2, d.z - az * 3.2]];
    // Merle (the store's clerk, landmark.npcs) keeps his post on one side of the door: the light goes on the other (the podium's)
    var clerk = null; if (lm.npcs) for (var n = 0; n < lm.npcs.length; n++) if (lm.npcs[n].role === 'clerk') clerk = lm.npcs[n];
    if (clerk && U.dist2d(cands[0][0], cands[0][1], clerk.x, clerk.z) < U.dist2d(cands[1][0], cands[1][1], clerk.x, clerk.z)) cands.reverse();
    for (var i = 0; i < cands.length; i++) {
      var t = Wd.tileAt(cands[i][0], cands[i][1]);
      if ((t === T.SIDEWALK || t === T.PLAZA || t === T.PARKING || t === T.GRASS) && !Wd.solidAt(cands[i][0], cands[i][1], (d.y || 0) + 0.5)) return { x: cands[i][0], z: cands[i][1] };
    }
    return { x: d.x, z: d.z };
  }
  function shopRefresh() {
    var Wd = W(); if (!Wd || !Wd.landmarks) return;
    if (shop._seed === Wd._seed && shop._count === Wd.landmarks.length) return;
    shop._seed = Wd._seed; shop._count = Wd.landmarks.length;
    for (var m = 0; m < shop._markers.length; m++) if (GTP.Render && GTP.Render.removeMarker) GTP.Render.removeMarker(shop._markers[m]);
    shop._markers = []; shop._stores = []; shop._armed = {};
    var X = GTP.Content && GTP.Content.expansion && GTP.Content.expansion.shop, ids = (X && X.stores) || [], seen = {};
    var lms = Wd.landmarks.slice();
    for (var i = 0; i < ids.length; i++) { var id = typeof ids[i] === 'string' ? ids[i] : ids[i] && ids[i].id, lm0 = id && Wd.landmark(id); if (lm0 && lms.indexOf(lm0) < 0) lms.push(lm0); }
    for (i = 0; i < lms.length; i++) {
      var lm = lms[i]; if (!lm || seen[lm.id] || !lm.door) continue;
      var listed = false; for (var k = 0; k < ids.length; k++) if ((typeof ids[k] === 'string' ? ids[k] : ids[k] && ids[k].id) === lm.id) listed = true;
      if (lm.kind !== 'gunshop' && !listed) continue;
      seen[lm.id] = true;
      // the store's green light stands 3.2 m along the wall from the door, so a mission's blue light on the door (m03b at the
      // Strip shop) and the shop never share a trigger: the first 0.5 s stand would open the page under the mission
      var sp = shopSpot(Wd, lm);
      shop._stores.push({ id: lm.id, name: lm.name || 'Both Sides Arms', flagship: !!lmFlag(lm, 'flagship'), gag: lmFlag(lm, 'gag') || null, landmark: lm, x: sp.x, z: sp.z });
      if (GTP.Render && GTP.Render.markerMesh && GTP.Render.addMarker && GTP.Render.scene) {
        var mk = GTP.Render.markerMesh(0x3fd27f, { radius: 1.5, height: 6.5 }); mk.position.set(sp.x, lm.door.y || Wd.heightAt(sp.x, sp.z, 0), sp.z); mk.name = 'marker:shop:' + lm.id;
        GTP.Render.addMarker(mk); shop._markers.push(mk);
      }
    }
  }
  function shopTick(p, dt) {
    shopRefresh();
    if (!shop._stores.length) return;
    shop._pulse += dt;
    var k = 0.5 + 0.5 * Math.sin(shop._pulse * 3);
    for (var m = 0; m < shop._markers.length; m++) { var ud = shop._markers[m].userData; if (ud && ud.pulse) ud.pulse(k); }
    if (shop.state.open || p.inVehicle || !p.alive || p.knockedDown || (GTP.game && GTP.game.state !== 'playing')) return;
    // the interiors track's armory replaces the green light with the door itself
    if (GTP.Interiors && GTP.Interiors.active) return;
    var cur = null;
    for (var i = 0; i < shop._stores.length; i++) { var s = shop._stores[i]; if (U.dist2d(p.x, p.z, s.x, s.z) < C.MISSIONS.markerRadius + 0.2 && Math.abs(p.y - (s.landmark.door.y || 0)) < 2.5) { cur = s; break; } }
    for (i = 0; i < shop._stores.length; i++) if (shop._stores[i] !== cur) shop._armed[shop._stores[i].id] = true;
    if (!cur) { shop._cur = null; shop._hold = 0; return; }
    if (shop._armed[cur.id] === undefined) shop._armed[cur.id] = true;   // a store the player spawned inside arms on the first exit
    if (!shop._armed[cur.id]) return;
    if (shop._cur !== cur) { shop._cur = cur; shop._hold = 0; }
    shop._hold += dt;
    if (shop._hold >= C.MISSIONS.startHold) { shop._hold = 0; shop._armed[cur.id] = false; shop.open(cur.landmark); }
  }

  // ------------------------------------------------------------ saves --
  // GTP.SaveRegistry.combat (when the story track's registry exists): the attachments and tints the player owns and wears, and the
  // aim-assist setting; weapons and ammo stay in the save's player block as before
  var pendingSave = null;
  function registerSave() {
    var SR = GTP.SaveRegistry = GTP.SaveRegistry || {}; if (SR.combat) return;
    SR.combat = {
      get: function () { var p = player() || {}; return { v: 1, mods: p.weaponMods || {}, owned: p.weaponModsOwned || {}, aimAssist: settings.aimAssist, holsters: settings.holsters }; },
      set: function (j) {
        var p = player(); if (!j) return;
        if (!p) { pendingSave = j; return; }   // a load before the player exists: applied on the first update
        pendingSave = null;
        p.weaponMods = j.mods && typeof j.mods === 'object' ? j.mods : {}; p.weaponModsOwned = j.owned && typeof j.owned === 'object' ? j.owned : {};
        if (j.aimAssist != null) settings.aimAssist = !!j.aimAssist;
        if (j.holsters != null) settings.holsters = !!j.holsters;
        p._effCache = null;
      }
    };
  }

  // ------------------------------------------------------- the API --
  var Combat = GTP.Combat = {
    WEAPONS: WEAPONS,
    ORDER: ORDER,
    SLOTS: SLOTS,
    SPONSOR: SPONSOR,
    SPONSOR_COLOR: SPONSOR_COLOR,
    UNLOCK: UNLOCK,
    PITCH: PITCH,
    RESPAWN_DELAY: RESPAWN_DELAY,
    AI_DAMAGE_MUL: AI_DAMAGE_MUL,
    AI_MELEE_MUL: AI_MELEE_MUL,
    MELEE: MELEE,
    COVER: COVER,
    HOLD_SCALE: HOLD_SCALE,
    AIM_CAM: AIM_CAM,
    settings: settings,
    aim: aim,
    scope: scope,
    wheel: wheel,
    bloom: bloom,
    hitmark: hitmark,
    shop: shop,
    smokes: smokes,
    death: null,
    hurtFlash: 0,
    pickups: new Map(),
    HotMic: HotMic,
    Rocket: Rocket,

    cycleWeapon: cycleWeapon,
    wheelStep: wheelStep,
    catalog: catalog,
    buy: buy,
    syncArsenal: syncArsenal,
    weaponStats: weaponStats,
    eff: eff,
    holdOf: holdOf,
    slotOf: slotOf,
    fillPose: fillPose,
    postSync: postSync,
    handTargets: handTargets,
    gunFrame: function (ped, raised) { return gunFrame(ped, ped.weapon, raised !== false, { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }); },
    muzzle: muzzle,
    moveScale: moveScale,
    inSmoke: inSmoke,
    coverToggle: coverToggle,
    coverControl: coverControl,
    coverFind: function (p) { return findCover(p || player()); },
    coverEnter: function (p, cand) { return enterCover(p || player(), cand || findCover(p || player())); },
    coverExit: function (p, why) { exitCover(p || player(), why); },
    coverShield: coverShield,
    vaultStep: vaultStep,
    counter: function (p) { return tryCounter(p || player()); },
    counterReady: function (p) { p = p || player(); return !!p && p.alive && !p.inVehicle && !p.cover && !p.knockedDown && !!counterCandidate(p); },
    setAimAssist: function (on) { settings.aimAssist = !!on; return settings.aimAssist; },
    // the per-step tick (Game.step calls it in play, cutscenes, minigames and the death cards); after Combat's own work it runs the
    // modules that hang off the combat step: the bosses and the specials (08b), then the interiors (13), in that order, every step
    update: function (dt) {
      try { Combat._update(dt); } finally { afterStep(dt); }
    },
    _update: function (dt) {
      ensureHooks();
      var g = GTP.game, p = player(); if (!g || !p) return;
      var st = g.state;
      if (st === 'wasted' || st === 'busted') { deathTick(p, dt); updateFlash(); tickMuzzleLight(dt, null, null); return; }
      if (st !== 'playing' && st !== 'cutscene' && st !== 'minigame') return;
      if (p.alive && p.hp <= 0) p.die(p.lastHitBy || null, p.lastHitType || 'debug');
      else if (!p.alive && !Combat.death) Combat.onPlayerDeath(p, p.lastHitBy, p.lastHitType);
      if (Combat.death) {
        if (!p.alive) return;
        // someone (a mission, a load) put the game back in play mid-flow: drop the stale card state
        Combat.death = null; p.controlEnabled = true;
      }
      if (st === 'playing') { updateAim(p, dt); playerTick(p, dt); shopTick(p, dt); }
      else { aim.active = false; aim.target = null; aim.hip = false; p.lockTarget = null; if (scope.active) updateScope(p, dt); if (wheel.open) closeWheel(p, false); if (p.cover) exitCover(p, 'cutscene'); p._coverRun = null; }
      if (p.weapon !== lastWeapon) { lastWeapon = p.weapon; cancelReload(p); p._cook = null; GTP.Events.emit('weapon', { id: p.weapon, name: Combat.weaponName(p.weapon), ammo: p.weapons[p.weapon] }); }
      entityPass(dt);
      tickSmokes(dt); tickPuddles(dt);
      updateFlash();
      tickMuzzleLight(dt, p, GTP.Input);
      if (Combat.hurtFlash > 0) Combat.hurtFlash = Math.max(0, Combat.hurtFlash - dt * 2.5);
      pickupT += dt;
      if (pickupT > 2) { pickupT = 0; spawnWorldPickups(); }
    },

    // Fire the ped's weapon toward its target. Rate-limited per ped; the player spends ammo (and reloads an empty magazine).
    // Inside a shop the interiors module decides whether the player may shoot at all (only on the range), and scores range shots.
    fire: function (ped, weaponId) {
      var I = GTP.Interiors, me = !!ped && ped.kind === 'player';
      if (me && I && I.active && I.canFire && !I.canFire(ped)) return false;
      var r = Combat._fire(ped, weaponId);
      if (r && me && I && I.onPlayerShot) { try { I.onPlayerShot(ped); } catch (e) { U.reportError(e, 'interiors.shot'); } }
      return r;
    },
    _fire: function (ped, weaponId) {
      if (!ped || !ped.alive || ped.knockedDown || ped.entering || ped.swimming || ped._vault) return false;
      var id = weaponId || ped.weapon || 'fist', w0 = WEAPONS[id]; if (!w0) return false;
      var isPlayer = ped.kind === 'player', w = isPlayer ? eff(ped, id) : w0;
      if (ped.inVehicle && !(isPlayer && ((ped.aiming && driveByWeapon(id)) || (w.lobbed && !w.impact)))) return false;   // a drive-by needs a gun and the aim held
      var now = simT();
      if (isPlayer && wheel.open) return false;
      // melee: the player's combo state machine; the AI's telegraphed swing with a cooldown, two attackers at a time (QA-C1-01)
      if (w.melee) {
        if (isPlayer) return playerMelee(ped, id, w);
        if (ped._melee || ped._meleeCd > 0) return false;
        var tgt = ped.aimTarget && !ped.aimTarget.removed ? ped.aimTarget : player();
        if (!tgt || !tgt.alive || (tgt.kind === 'player' && tgt.inVehicle)) return false;
        if (U.dist2d(tgt.x, tgt.z, ped.x, ped.z) > w.range + 1.2) return false;
        if (meleeAttackers(tgt) >= 2) { ped._meleeCd = R().range(0.3, 0.6); return false; }
        ped.yaw = U.dirToYaw(tgt.x - ped.x, tgt.z - ped.z); ped.aimYaw = ped.yaw;
        ped._fireT = now;
        startMelee(ped, id, 'ai', 0, tgt);
        return true;
      }
      // the cadence comes first, the hot mic's cook too (QA CMB-03); it belongs to the weapon that fired last (a switch does not
      // inherit a slow weapon's wait)
      if (ped._fireT != null && now - ped._fireT < 1 / Math.max(ped._fireRate || 0, w.rate) - 1e-6) return false;
      if (isPlayer && w.cook && ped.weapons[id] > 0) { if (!ped._cook && !ped._cookLock) { startCook(ped, id); ped._cookLock = true; } return false; }   // the mic cooks until the trigger is released
      if (isPlayer && w.spinUp && (ped._spin || 0) < 1) return false;   // the minigun spins up first
      if (isPlayer && !w.melee) {
        var a = ammoOf(ped, id);
        if (!a) { if (now - (ped._dryT || -9) > 0.5) { ped._dryT = now; sfx('ui', ped.x, ped.z, 0.3); } dryWeapon(ped, id); return false; }
        if (w.mag && a.mag <= 0) {
          if (a.reserve > 0) { if (!(ped.reloadT > 0)) startReload(ped, id); }
          else { if (now - (ped._dryT || -9) > 0.5) { ped._dryT = now; sfx('ui', ped.x, ped.z, 0.3); } dryWeapon(ped, id); }
          return false;
        }
        if (ped.reloadT > 0) { if (w.shellReload && a.mag > 0) cancelReload(ped); else return false; }   // a pump interrupts its own shell-by-shell reload
      }
      ped._fireT = now; ped._fireRate = w.rate; ped._shotAge = 0;
      var ctx = aimContext(ped, w, id), fired;
      if (w.cone) fired = megaphone(ped, w, ctx);
      else if (w.rocket) fired = launch(ped, w, id, ctx);
      else if (w.lobbed) fired = lob(ped, w, id, ctx);
      else fired = hitscan(ped, w, id, ctx);
      ped.firePoseT = Math.max(ped.firePoseT || 0, 0.5);
      if (!isPlayer && fired && w.auto) ped._burst = { n: 2, id: id, t: 0 };
      if (isPlayer && fired) spend(ped, id);
      return !!fired;
    },
    reload: function (ped) { ped = ped || player(); if (!ped) return false; return startReload(ped, ped.weapon); },
    ammo: function (ped, id) { ped = ped || player(); return ped ? ammoOf(ped, id || ped.weapon) : null; },
    ammoCap: function (ped, id) { ped = ped || player(); return ped ? ammoCap(ped, id || ped.weapon) : 0; },
    giveAmmo: giveAmmo,

    damage: function (target, n, src, type) {
      if (!target || !(n > 0)) return 0;
      if (target.applyDamage) return target.applyDamage(n, src, type) || 0;
      return 0;
    },
    projectileHit: projectileHit,
    collectPickup: collectPickup,
    spawnPickup: spawnPickup,
    pickupMesh: pickupMesh,
    spawnWorldPickups: spawnWorldPickups,
    openWheel: function (source) { var p = player(); if (p) openWheel(p, source || 'api'); return wheel; },
    closeWheel: function (equip) { closeWheel(player(), equip !== false); return wheel; },
    setZoom: function (z) { scope.zoom = z >= 4 ? 4 : 2; emit('scope', { active: scope.active, zoom: scope.zoom }); },

    onPlayerDeath: function (p, src, type) {
      var g = GTP.game; if (!g || !p) return;
      if (Combat.death && Combat.death.kind === 'wasted') return;
      p.controlEnabled = false; p.aiming = false; p.lockTarget = null; p.firePoseT = 0; p.punchT = 0;
      p.intent.x = p.intent.z = 0;
      aim.active = false; aim.target = null;
      cancelReload(p); p._cook = null; p._melee = null;
      if (p.cover) exitCover(p, 'dead');
      if (scope.active) updateScope(p, 0);
      if (wheel.open) closeWheel(p, false);
      if (p.inVehicle) p.exitVehicle();
      Combat.death = { kind: 'wasted', t: 0, src: src || null, type: type || null, text: failText('wasted') };
      p.stats.deaths = p.stats.deaths || 0;   // counted on respawn
      sfx('fail', p.x, p.z, 1); shake(0.6);
      toast(failText('wasted'));
      if (g.state !== 'wasted') g.setState('wasted');
      GTP.Events.emit('player:wasted', { player: p, src: src || null, type: type || null });
    },
    onPlayerBusted: function (p, cop) {
      var g = GTP.game; if (!g || !p) return;
      if (Combat.death) return;
      p.controlEnabled = false; p.stop(); p.aiming = false; p.lockTarget = null; p.firePoseT = 0; p.punchT = 0;
      aim.active = false; aim.target = null;
      cancelReload(p); p._cook = null; p._melee = null;
      if (p.cover) exitCover(p, 'busted');
      if (scope.active) updateScope(p, 0);
      if (wheel.open) closeWheel(p, false);
      if (p.inVehicle) { var v = p.inVehicle; v.setControls(0, 0, true, 1); p.exitVehicle(); }
      p.vx = p.vz = 0;
      Combat.death = { kind: 'busted', t: 0, cop: cop || null, text: failText('busted'), level: GTP.AI && GTP.AI.wanted ? GTP.AI.wanted.level : (p.wanted | 0) };
      sfx('fail', p.x, p.z, 1);
      toast(failText('busted'));
      if (g.state !== 'busted') g.setState('busted');
    },
    respawn: function (kind) { respawnPlayer(kind === 'police' || kind === 'busted' ? 'police' : 'hospital'); },
    reset: function () {
      Combat.death = null; Combat.hurtFlash = 0; Combat.pickups.clear(); pickupT = 1.9; lastWeapon = null;
      crng = GTP.rng.fork(0xC0B);
      flashing.length = 0; aim.active = false; aim.target = null; aim.hover = null; aim.point = null; aim.screen = null; aim.targetScreen = null; aim.hip = false; aim.wasActive = false;
      var p = player(); if (p) clearPlayerCombatState(p);
      scope.active = false; scope.zoom = 2; wheel.open = false; wheel.hold = 0; wheel.pick = {}; bloom.cone = 0; bloom.k = 0; hitmark.t = -9; hitmark.kill = false;
      shop.state.open = false; shop.state.landmark = null; shop.state.store = null; shop._seed = null; shop._cur = null; shop._hold = 0; shop.rangeT = 0;
      smokes.length = 0; puddles.length = 0;
      casingClear(); if (holes.im) holeClear();
    },

    // UI helpers
    weaponName: function (id) { return WEAPONS[id] ? WEAPONS[id].name : String(id || ''); },
    driveByWeapon: driveByWeapon,
    hud: function () {
      var p = player() || {}, w = p.weapon || 'fist', def = WEAPONS[w], ew = p.kind ? eff(p, w) : def, ammo = p.weapons ? p.weapons[w] : 0, a = p.weapons ? ammoOf(p, w) : null, now = simT();
      var inf = ammo === Infinity;
      var ms = p._melee, incoming = p.kind ? counterCandidate(p) : null;
      return {
        weapon: { id: w, name: Combat.weaponName(w), ammo: inf ? null : (ammo | 0), infinite: inf, cls: def ? def.cls : 'melee', magSize: ew && ew.mag ? ew.mag : 0, slot: slotOf(w), hold: holdOf(w),
          mag: a && def && def.mag ? (a.mag === Infinity ? null : a.mag) : null, reserve: a ? (a.reserve === Infinity ? null : a.reserve) : null,
          reloading: p.reloadT > 0 ? { t: p.reloadT, total: p.reloadTotal || 1, k: 1 - p.reloadT / (p.reloadTotal || 1) } : null, mods: modsOf(p, w), spin: p._spin || 0 },
        aim: aim, death: Combat.death, hurtFlash: Combat.hurtFlash,
        bloom: { cone: bloom.cone, k: bloom.k, max: bloom.max },
        // the crosshair the UI draws: 'aim' (dot + ticks opened by the bloom), 'hip' (a dot), 'scope', 'none'; hostile/target colouring
        crosshair: { mode: scope.active ? 'scope' : aim.active ? 'aim' : aim.hip ? 'hip' : 'none', k: bloom.k, spreadPx: 4 + 18 * bloom.k, screen: aim.screen, hostile: !!(aim.hover && hostileRole(aim.hover)), target: !!aim.hover, inRange: aim.inRange, assist: settings.aimAssist, locked: !!aim.target },
        hitmark: now - hitmark.t < 0.45 ? { age: now - hitmark.t, kill: hitmark.kill, zone: hitmark.zone, weapon: hitmark.weapon } : null,
        scope: scope.active ? { active: true, zoom: scope.zoom, fov: scope.fov, range: scope.range, target: scope.target } : null,
        wheel: wheelHud(p.weapons ? p : null),
        cook: p._cook ? { t: p._cook.t, total: WEAPONS[p._cook.id].fuse, k: p._cook.t / WEAPONS[p._cook.id].fuse } : null,
        cover: p.kind ? coverHud(p) : null,
        melee: ms ? { type: ms.type, t: ms.t, combo: ms.combo } : null,
        // the prompt the UI may show by the crosshair: 'counter' (jump), 'cover' (Q), 'vault' (jump), 'peek' (aim)
        prompt: incoming ? 'counter' : p.cover ? (!p.cover.high ? 'vault' : p.cover.edge ? 'peek' : null) : (p._coverNear ? 'cover' : null),
        shop: shop.state
      };
    },
    // default crosshair + lock reticle (the UI module may call this or draw its own from Combat.aim / hud().crosshair)
    drawAimOverlay: function (ctx, w, h) {
      var g = GTP.game; if (!g || g.state !== 'playing' || !ctx) return;
      var s = aim.screen, t = aim.target, ts = aim.targetScreen, now = simT();
      if (!aim.active && aim.hip && s && s.visible) { ctx.save(); ctx.fillStyle = aim.hover && hostileRole(aim.hover) ? 'rgba(255,59,48,0.95)' : 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(s.sx, s.sy, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
      if (!aim.active) return;
      ctx.save();
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      if (scope.active && s) {
        var cx = w / 2, cy = h / 2, rad = Math.min(w, h) * 0.38;
        ctx.fillStyle = 'rgba(0,0,0,0.96)';
        ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(cx, cy, rad, 0, Math.PI * 2, true); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy); ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,63,164,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.font = 'bold 14px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(Math.round(scope.range) + ' m   ' + scope.zoom + 'x', cx - rad + 10, cy + rad - 8);
        ctx.restore();
        return;
      }
      if (s && s.visible) {
        var hot = !!aim.hover && !t;
        var hm = now - hitmark.t < 0.12, spreadPx = 4 + 18 * bloom.k + (hm ? 3 : 0);
        ctx.strokeStyle = hitmark.kill && now - hitmark.t < 0.4 ? 'rgba(255,63,164,0.95)' : hm ? 'rgba(255,255,255,0.95)' : hot ? 'rgba(255,63,164,0.95)' : (aim.inRange ? 'rgba(46,230,255,0.95)' : 'rgba(46,230,255,0.5)');
        ctx.beginPath();
        ctx.moveTo(s.sx - 14 - spreadPx, s.sy); ctx.lineTo(s.sx - 8 - spreadPx, s.sy); ctx.moveTo(s.sx + 8 + spreadPx, s.sy); ctx.lineTo(s.sx + 14 + spreadPx, s.sy);
        ctx.moveTo(s.sx, s.sy - 14 - spreadPx); ctx.lineTo(s.sx, s.sy - 8 - spreadPx); ctx.moveTo(s.sx, s.sy + 8 + spreadPx); ctx.lineTo(s.sx, s.sy + 14 + spreadPx);
        ctx.stroke();
        if (hitmark.kill && now - hitmark.t < 0.4) { ctx.beginPath(); ctx.moveTo(s.sx - 7, s.sy - 7); ctx.lineTo(s.sx + 7, s.sy + 7); ctx.moveTo(s.sx + 7, s.sy - 7); ctx.lineTo(s.sx - 7, s.sy + 7); ctx.stroke(); }
        ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(s.sx, s.sy, 1.8, 0, Math.PI * 2); ctx.fill();
        var pl = player();
        if (pl && pl.reloadT > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.sx, s.sy, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - pl.reloadT / (pl.reloadTotal || 1))); ctx.stroke(); }
      }
      if (t && ts && ts.visible) {
        var k = Math.min(1, (now - aim.lockT) / 0.25), size = 30 + (1 - k) * 26, half = size / 2, c = 9;
        ctx.strokeStyle = now - hitmark.t < 0.12 ? 'rgba(255,255,255,0.95)' : 'rgba(255,63,164,0.95)';
        ctx.translate(ts.sx, ts.sy); ctx.rotate((1 - k) * 0.6);
        ctx.beginPath();
        ctx.moveTo(-half, -half + c); ctx.lineTo(-half, -half); ctx.lineTo(-half + c, -half);
        ctx.moveTo(half - c, -half); ctx.lineTo(half, -half); ctx.lineTo(half, -half + c);
        ctx.moveTo(half, half - c); ctx.lineTo(half, half); ctx.lineTo(half - c, half);
        ctx.moveTo(-half + c, half); ctx.lineTo(-half, half); ctx.lineTo(-half, half - c);
        ctx.stroke();
        var hp = U.clamp((t.hp || 0) / (t.maxHp || 1), 0, 1);
        ctx.fillStyle = 'rgba(10,12,20,0.7)'; ctx.fillRect(-half, half + 6, size, 5);
        ctx.fillStyle = hp > 0.5 ? '#9dff3c' : hp > 0.25 ? '#ffbe3c' : '#ff3b30'; ctx.fillRect(-half, half + 6, size * hp, 5);
      }
      ctx.restore();
    },
    // tests / debug
    debug: {
      trace: function (o, d, range, shooter) { var out = {}; trace(o, d, range, shooter || player(), out); return out; }, ammoOf: ammoOf, casings: casings, holes: holes, muzzle: ml,
      hooked: function () { var F = GTP.Render && GTP.Render.fx; return !!(F && F.extensions && F.extensions.casing); },
      arsenal: arsenal, normalize: normalize, findCover: findCover, probeCover: probeCover, gunFrame: gunFrame, puddles: puddles, steerCamera: steerCamera
    }
  };
  // the hooks above are native: the bosses' and the interiors' load-time installers see these marks and leave the functions alone
  Combat.update._bosses = true; Combat.update._interiors = true; Combat.fire._interiors = true;

  // ------------------------------------------------------------- events --
  GTP.Events.on('damage', function (e) {
    var t = e && e.target; if (!t || !t.mesh || t.inVehicle) return;
    if (t.kind === 'player') { Combat.hurtFlash = Math.max(Combat.hurtFlash, 0.8); }
    startFlash(t);
  });
  GTP.Events.on('vehicle:damage', function (e) {
    var v = e && e.vehicle; if (!v || !v.mesh || !e.type) return;
    var w = WEAPONS[String(e.type)];
    if (w && !w.rocket && !(w.blast && !w.fuse)) startFlash(v);
  });
  // a vehicle explosion gets a proper fireball on top of the entity's own fx: a white flash, a big bloom, fire bits and a smoke column
  GTP.Events.on('vehicle:exploded', function (e) {
    var v = e && e.vehicle; if (!v) return;
    var r = R(), x = v.x, y = v.y + 1.2, z = v.z, i;
    fx({ type: 'explosion', x: x, y: y + 0.6, z: z, size: 15, life: 0.12, color: 0xfff6dc });
    fx({ type: 'explosion', x: x, y: y + 1.2, z: z, size: 11, life: 0.6, color: 0xffb040, vy: 2.5 });
    fx({ type: 'explosion', x: x, y: y + 0.4, z: z, size: 8, life: 0.45, color: 0xff6a20, vy: 1.5 });
    for (i = 0; i < 8; i++) fx({ type: 'fire', x: x + r.range(-1.5, 1.5), y: y + r.range(0, 1.5), z: z + r.range(-1.5, 1.5), vx: r.range(-4, 4), vy: r.range(3, 9), vz: r.range(-4, 4), size: r.range(2, 3.5), life: r.range(0.6, 1.1) });
    for (i = 0; i < 6; i++) fx({ type: 'smoke', x: x + r.range(-0.8, 0.8), y: y + 1 + i * 0.6, z: z + r.range(-0.8, 0.8), vx: r.range(-0.6, 0.6), vy: r.range(2, 4), vz: r.range(-0.6, 0.6), size: r.range(3, 5), life: r.range(2, 3.2), color: 0x1e1a18 });
  });
  // a dead ped sometimes drops cash; a dead cop sometimes drops a weapon (a rifle gives 15 rounds)
  GTP.Events.on('ped:dead', function (e) {
    var ped = e && e.ped; if (!ped || ped.kind === 'player' || ped._dropped) return;
    ped._dropped = true; ped._melee = null;
    var r = R(), x = ped.x + r.range(-0.7, 0.7), z = ped.z + r.range(-0.7, 0.7), Wd = W();
    var t = Wd.tileAt(x, z); if (t === Wd.T.BUILDING || t === Wd.T.WATER || t === Wd.T.VOID) { x = ped.x; z = ped.z; }
    if (isCopRole(ped) && ped.weapon && WEAPONS[ped.weapon] && !WEAPONS[ped.weapon].melee && r.chance(0.5)) {
      var n = ped.weapon === 'shotgun' ? 6 : ped.weapon === 'rifle' ? 15 : ped.weapon === 'revolver' ? 6 : 12;
      spawnPickup({ type: 'weapon', weaponId: ped.weapon, ammo: n, x: x, z: z, yHint: ped.y, label: sponsorFor(ped.weapon) });
    } else if (r.chance(0.4)) {
      spawnPickup({ type: 'cash', value: r.int(10, 50), x: x, z: z, yHint: ped.y });
    }
  });
  registerSave();   // at load, so a load from the title restores attachments and tints (the story track merges into the registry)
  // a cutscene or an interior teleport leaves cover
  GTP.Events.on('interior:fade', function () { var p = player(); if (!p) return; if (p.cover) exitCover(p, 'interior'); p._coverRun = null; p._vault = null; });
})();
