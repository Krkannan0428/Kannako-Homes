/* Grand Theft Pundit: 25_content_parity.js
 * GTP.Content.parity: every v0.3 content table (PLAN_V03.md, "content"). Pure data plus tiny
 * helpers; loads after 20..24 and needs only window (24_ is used when present).
 *
 *   weapons       37 guns, blades and props in the plan's schema {id, name, class, dmg, rate, mag, reserve,
 *                 reload, spread, bloom:{add,max,decay}, recoil, range, projectile, hold, price,
 *                 unlock:{mission}|null, attachments:[slotIds], flavor} plus the optional engine extras the
 *                 existing WEAPONS table uses (melee, knock, pellets, driveBy, auto, headMul, vehicleMul, ...).
 *                 The first 12 are the existing ids with the existing numbers (two balance fixes, see notes).
 *   attachments   {id, slot, name, price, mods, fits, flavor}; slots: muzzle mag optic grip light
 *   tints         {id, name, color, price, unlock}
 *   modshop       Spin Doctor Customs: the catalogue for GTP.Vehicles.mod(vehicle, {...})
 *   clothing      Lanyard & Co.: items by slot (top bottom shoes hat glasses) and outfits
 *   barber        the Clip Joint: hair styles (the cast `hair` enum) and colours
 *   properties    5 safehouses + 6 businesses {id, kind, landmark, price, income, garage}
 *   stocks        8 invented tickers with reactions to story missions
 *   golf          the 9 holes of Goldplate Links (every hole a par ten, on the card)
 *   events        8 random street events
 *   jobs          Damage Control (paramedic parody) and Hot Take Brigade (firefighter parody)
 *   achievements  26 achievements; cheats 8 harmless cheat codes; loadingTips 24
 *   radio         new ticker lines, ads, DJ lines, and per-mission news reactions
 *   missions      10 new story missions (m01c_both_sides, b01..b06, h01..h03) in the 22_ schema
 *   chain/acts    the 35 story ids in order; calls {missionId: {from, lines}} for every story mission
 *                 (keyed by the mission the call pitches; `from` is its giver); chapters
 *   heists        hedge_job: approaches, crew, payout rule, objective variants per approach
 *   retune        {missionId: [{path, value}]} data patches applied once at load (value null deletes)
 *
 * Load-time hooks (guarded, idempotent; see docs/v03/content.md):
 *   - appends parity.missions to GTP.Content.expansion.missions so every existing missionById /
 *     allMissions sees the 35-mission story without another file changing;
 *   - registers cs_intro_<id> two-shots for the new missions through expansion.introShots / introScript;
 *   - applies parity.retune (m03b_range no longer takes back the pistol Merle gave away in m01c).
 * Every string obeys CONTENT_RULES.md; every character is an invented archetype.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.Content = GTP.Content || {};

  var GUN = ['muzzle', 'mag', 'optic', 'grip', 'light'];
  var PISTOL = ['muzzle', 'mag', 'optic', 'light'];
  var SHOTTY = ['muzzle', 'mag', 'grip', 'light'];
  var SCOPE = ['muzzle', 'mag', 'optic', 'grip'];
  function un(mission) { return mission ? { mission: mission } : null; }
  // a boss fight's arena as a mission target: the bosses track's own centre when 08b is loaded, else the same numbers
  // copied from docs/v03/bosses.md (offsets in metres). The fight fails if the player stays 150 m away for 10 s.
  var ARENAS = { b01_goldplate: ['stadium', -40, 30], b02_velvetine: ['afterparty_yacht', -10, 10], b03_warbanner: ['airport_runway', 0, 26],
    b04_redacted: ['balloon_depot', 50, 10], b05_dunk: ['campus_quad', 0, -20], b06_panel: ['protest_plaza', 100, 40] };
  function arena(id) {
    var B = GTP.Bosses, t = B && typeof B.arenaTarget === 'function' ? B.arenaTarget(id) : null, a = ARENAS[id];
    return t || { landmark: a[0], offset: { x: a[1], z: a[2] }, metres: true };
  }

  var P = GTP.Content.parity = { version: '0.3' };

  // ================================================================== weapons ==
  P.weapons = [
    // ---- the existing twelve (ids, names and numbers from 08_combat.js) --------------------------
    { id: 'fist', name: 'Fists', class: 'melee', dmg: 12, rate: 2.5, mag: 0, reserve: 0, reload: 0, spread: 0, bloom: null, recoil: 0, range: 1.7, projectile: 'hitscan', hold: 'none', price: 0, unlock: null, attachments: [],
      melee: true, lunge: 2.4, knock: 3.2, flavor: 'Two of them. Both yours. No refunds.' },
    { id: 'tableleg', name: 'Folding Table Leg', class: 'melee', dmg: 30, rate: 1.6, mag: 0, reserve: 0, reload: 0, spread: 0, bloom: null, recoil: 0, range: 2.1, projectile: 'hitscan', hold: 'one', price: 150, unlock: un('m03b_range'), attachments: [],
      melee: true, lunge: 2.6, knock: 4.5, flipWindow: 0.6, vehicleDmg: 6, flavor: "It fell off the table. It's the honest weapon." },
    { id: 'megaphone', name: 'Megaphone', class: 'special', dmg: 0, rate: 1.2, mag: 0, reserve: 40, reload: 0, spread: 0, bloom: null, recoil: 0, range: 6, projectile: 'hitscan', hold: 'one', price: 300, unlock: un('m03_ratio'), attachments: [],
      cone: true, arc: Math.PI / 3, push: 18, heat: 1, flavor: 'Pushes people. Use it on the ones who like you too.' },
    { id: 'pistol', name: 'Pistol', class: 'pistol', dmg: 18, rate: 4, mag: 12, reserve: 120, reload: 1.2, spread: 0.012, bloom: { add: 0.008, max: 0.04, decay: 0.10 }, recoil: 1.2, range: 35, projectile: 'hitscan', hold: 'one', price: 450, unlock: un('m01c_both_sides'), attachments: PISTOL,
      vehicleMul: 0.55, knock: 1.6, driveBy: true, flavor: 'The first one is free. The bullets are the business model.' },
    { id: 'revolver', name: 'The Rebuttal', class: 'pistol', dmg: 40, rate: 1.6, mag: 6, reserve: 60, reload: 2.0, spread: 0.006, bloom: { add: 0.010, max: 0.03, decay: 0.08 }, recoil: 2.4, range: 45, projectile: 'hitscan', hold: 'one', price: 900, unlock: un('m05b_provenance'), attachments: ['optic', 'light'],
      vehicleMul: 0.7, knock: 3.0, headMul: 3, floors: true, driveBy: true, flavor: 'Six points. Each one ends the conversation. The hedge has a hedge now.' },
    { id: 'smg', name: 'SMG', class: 'smg', dmg: 9, rate: 11, mag: 30, reserve: 240, reload: 1.6, spread: 0.04, bloom: { add: 0.004, max: 0.09, decay: 0.14 }, recoil: 0.35, range: 30, projectile: 'hitscan', hold: 'two', price: 1400, unlock: un('m11_trustless'), attachments: GUN,
      auto: true, vehicleMul: 0.5, knock: 0.9, driveBy: true, flavor: 'Bought with liquidity. It was a sponsorship.' },
    { id: 'rifle', name: 'The Monologue', class: 'rifle', dmg: 24, rate: 5.5, mag: 30, reserve: 180, reload: 2.0, spread: 0.018, bloom: { add: 0.006, max: 0.055, decay: 0.12 }, recoil: 0.5, range: 60, projectile: 'hitscan', hold: 'two', price: 2400, unlock: un('m08b_jets'), attachments: GUN,
      aimSpread: 0.009, auto: true, pointShots: 3, vehicleMul: 0.65, knock: 1.2, flavor: "It's from the jet. There is no jet. Keeps talking until the magazine runs out." },
    { id: 'shotgun', name: 'Shotgun', class: 'shotgun', dmg: 66, rate: 1.1, mag: 6, reserve: 48, reload: 0.45, spread: 0.085, bloom: null, recoil: 3.0, range: 12, projectile: 'hitscan', hold: 'two', price: 1100, unlock: un('m11_trustless'), attachments: SHOTTY,
      shellReload: true, pellets: 6, vehicleMul: 0.6, knock: 2.5, driveBy: true, flavor: 'Six opinions at once. One of them lands.' },
    { id: 'sniper', name: 'The Fact Checker', class: 'sniper', dmg: 120, rate: 0.7, mag: 5, reserve: 30, reload: 2.6, spread: 0.08, bloom: null, recoil: 4.0, range: 160, projectile: 'hitscan', hold: 'two', price: 4500, unlock: un('m12b_scope'), attachments: SCOPE,
      scopedSpread: 0, headMul: 3, vehicleMul: 1.0, scope: true, noAuto: true, casingDelay: 0.3, flavor: 'Kept for peer review. Reads at two hundred metres.' },
    { id: 'hottake', name: 'Hot Take', class: 'thrown', dmg: 12, rate: 1, mag: 0, reserve: 12, reload: 0, spread: 0, bloom: null, recoil: 0, range: 20, projectile: 'lobbed', hold: 'one', price: 90, unlock: un('m09_balloon'), attachments: [],
      lobbed: true, stun: 5, speed: 21, pack: 3, flavor: "A [REDACTED] that goes off. Everyone near it stops to have an opinion." },
    { id: 'hotmic', name: 'Hot Mic', class: 'thrown', dmg: 60, rate: 0.8, mag: 0, reserve: 8, reload: 0, spread: 0, bloom: null, recoil: 0, range: 24, projectile: 'lobbed', hold: 'one', price: 120, unlock: un('m09b_hotmic'), attachments: [],
      lobbed: true, speed: 18, fuse: 2.5, blast: 6, ring: 5, vehicleDmg: 180, restitution: 0.4, bounces: 2, pack: 1, flavor: "It was on the whole time. Throw it. Don't hold it. Everyone holds it." },
    { id: 'ratio', name: 'Ratio Launcher', class: 'launcher', dmg: 200, rate: 0.5, mag: 1, reserve: 6, reload: 3.0, spread: 0, bloom: null, recoil: 6.0, range: 120, projectile: 'rocket', hold: 'two', price: 7500, unlock: un('m13_thursday'), attachments: ['optic'],
      rocket: true, speed: 40, blast: 8, noAuto: true, flavor: 'Trustless. You point it, it ratios. The warranty is the token.' },

    // ---- melee ----------------------------------------------------------------------------------
    { id: 'clipboard', name: 'The Run of Show', class: 'melee', dmg: 16, rate: 2.2, mag: 0, reserve: 0, reload: 0, spread: 0, bloom: null, recoil: 0, range: 1.9, projectile: 'hitscan', hold: 'one', price: 120, unlock: un('m01c_both_sides'), attachments: [],
      melee: true, lunge: 2.4, knock: 2.6, flavor: "Sloane's spare clipboard. Every hit lasts exactly four minutes. Three." },
    { id: 'selfie_stick', name: 'Selfie Stick', class: 'melee', dmg: 14, rate: 2.6, mag: 0, reserve: 0, reload: 0, spread: 0, bloom: null, recoil: 0, range: 2.6, projectile: 'hitscan', hold: 'one', price: 60, unlock: null, attachments: [],
      melee: true, lunge: 2.8, knock: 2.0, flavor: "Extends to the length of your reach. Your reach is mostly the stick." },
    { id: 'golf_club', name: 'Par Ten Putter', class: 'melee', dmg: 32, rate: 1.2, mag: 0, reserve: 0, reload: 0, spread: 0, bloom: null, recoil: 0, range: 2.3, projectile: 'hitscan', hold: 'two', price: 1000, unlock: un('b01_goldplate'), attachments: [],
      melee: true, lunge: 2.4, knock: 6.0, launch: 1.4, flavor: "Fell out of a gold helicopter. Every swing is a ten. On the card." },
    { id: 'mic_stand', name: 'The Mic Stand', class: 'melee', dmg: 34, rate: 1.1, mag: 0, reserve: 0, reload: 0, spread: 0, bloom: null, recoil: 0, range: 2.4, projectile: 'hitscan', hold: 'two', price: 400, unlock: un('b02_velvetine'), attachments: [],
      melee: true, lunge: 2.6, knock: 5.0, vehicleDmg: 8, flavor: "Off the Baron's yacht. Nobody ever stood at it. Now somebody stands near it, briefly." },

    // ---- pistols --------------------------------------------------------------------------------
    { id: 'pocket', name: 'The Footnote', class: 'pistol', dmg: 22, rate: 2.5, mag: 2, reserve: 40, reload: 1.4, spread: 0.02, bloom: { add: 0.012, max: 0.05, decay: 0.12 }, recoil: 1.6, range: 18, projectile: 'hitscan', hold: 'one', price: 350, unlock: un('m05_peer'), attachments: ['light'],
      headMul: 3, vehicleMul: 0.4, knock: 1.4, driveBy: true, flavor: "Tiny. Fits under anything you said. [citation pending]" },
    { id: 'heavy_pistol', name: 'The Closing Statement', class: 'pistol', dmg: 32, rate: 2.6, mag: 9, reserve: 90, reload: 1.5, spread: 0.01, bloom: { add: 0.012, max: 0.045, decay: 0.10 }, recoil: 2.0, range: 40, projectile: 'hitscan', hold: 'one', price: 1200, unlock: un('m06_rally'), attachments: PISTOL,
      vehicleMul: 0.65, knock: 2.4, driveBy: true, flavor: "Heavy, final, and somehow still interrupted." },
    { id: 'machine_pistol', name: 'The Interruption', class: 'pistol', dmg: 8, rate: 13, mag: 20, reserve: 200, reload: 1.3, spread: 0.05, bloom: { add: 0.005, max: 0.10, decay: 0.16 }, recoil: 0.4, range: 22, projectile: 'hitscan', hold: 'one', price: 1100, unlock: un('m07_listen'), attachments: PISTOL,
      auto: true, vehicleMul: 0.45, knock: 0.8, driveBy: true, flavor: "Talks over everyone in the room, twenty times a magazine." },
    { id: 'flare_gun', name: 'The Signal Boost', class: 'special', dmg: 20, rate: 0.6, mag: 1, reserve: 10, reload: 1.8, spread: 0.01, bloom: null, recoil: 2.2, range: 40, projectile: 'lobbed', hold: 'one', price: 500, unlock: un('m09_balloon'), attachments: [],
      lobbed: true, speed: 30, stun: 2, glow: '#ff3fa4', flavor: "Puts a pink light on whatever you just said. Everyone looks. Nobody reads it." },

    // ---- SMGs -----------------------------------------------------------------------------------
    { id: 'micro_smg', name: 'The Thread', class: 'smg', dmg: 7, rate: 15, mag: 32, reserve: 256, reload: 1.4, spread: 0.055, bloom: { add: 0.004, max: 0.11, decay: 0.16 }, recoil: 0.3, range: 24, projectile: 'hitscan', hold: 'one', price: 1300, unlock: un('m10_pellets'), attachments: PISTOL,
      auto: true, vehicleMul: 0.45, knock: 0.7, driveBy: true, flavor: "1/32. 2/32. 3/32. Nobody reads past 4/32." },
    { id: 'pdw', name: 'The Live Blog', class: 'smg', dmg: 11, rate: 10, mag: 35, reserve: 245, reload: 1.8, spread: 0.032, bloom: { add: 0.004, max: 0.08, decay: 0.14 }, recoil: 0.32, range: 34, projectile: 'hitscan', hold: 'two', price: 1900, unlock: un('m12_memo'), attachments: GUN,
      auto: true, vehicleMul: 0.55, knock: 1.0, driveBy: true, flavor: "Updates every few seconds. Refresh for more." },

    // ---- rifles ---------------------------------------------------------------------------------
    { id: 'carbine', name: 'The Talking Point', class: 'rifle', dmg: 21, rate: 6, mag: 30, reserve: 180, reload: 1.9, spread: 0.02, bloom: { add: 0.006, max: 0.05, decay: 0.12 }, recoil: 0.45, range: 55, projectile: 'hitscan', hold: 'two', price: 2000, unlock: un('b03_warbanner'), attachments: GUN,
      aimSpread: 0.01, auto: true, vehicleMul: 0.6, knock: 1.1, flavor: "A gift from Bravadia. Gifts are tax-free, and that's why we need the jets." },
    { id: 'battle_rifle', name: 'The Op-Ed', class: 'rifle', dmg: 36, rate: 3.5, mag: 20, reserve: 120, reload: 2.2, spread: 0.014, bloom: { add: 0.010, max: 0.05, decay: 0.10 }, recoil: 1.1, range: 75, projectile: 'hitscan', hold: 'two', price: 3200, unlock: un('m09b_hotmic'), attachments: GUN,
      aimSpread: 0.007, vehicleMul: 0.75, knock: 1.8, flavor: "Eight hundred words, all of them aimed. The editor cut the rest." },
    { id: 'bullpup', name: 'The Hot Seat', class: 'rifle', dmg: 23, rate: 6.5, mag: 30, reserve: 180, reload: 2.4, spread: 0.016, bloom: { add: 0.005, max: 0.05, decay: 0.13 }, recoil: 0.42, range: 58, projectile: 'hitscan', hold: 'two', price: 2900, unlock: un('m12b_scope'), attachments: GUN,
      aimSpread: 0.008, auto: true, vehicleMul: 0.65, knock: 1.2, flavor: "Short, loud, and always the one being asked the follow-up." },
    { id: 'lmg', name: 'The Filibuster', class: 'rifle', dmg: 26, rate: 8, mag: 100, reserve: 300, reload: 4.5, spread: 0.04, bloom: { add: 0.004, max: 0.08, decay: 0.10 }, recoil: 0.6, range: 60, projectile: 'hitscan', hold: 'two', price: 5500, unlock: un('h03_job'), attachments: ['muzzle', 'optic', 'grip'],
      auto: true, heavy: true, mobility: 0.75, vehicleMul: 0.7, knock: 1.4, flavor: "A hundred rounds and no intention of yielding the floor." },

    // ---- shotguns -------------------------------------------------------------------------------
    { id: 'both_barrels', name: 'Both Barrels', class: 'shotgun', dmg: 90, rate: 1.6, mag: 2, reserve: 40, reload: 2.0, spread: 0.1, bloom: null, recoil: 4.0, range: 10, projectile: 'hitscan', hold: 'two', price: 1300, unlock: un('m10_pellets'), attachments: ['light'],
      pellets: 8, vehicleMul: 0.7, knock: 3.4, driveBy: true, flavor: "One barrel for each side. That's balance." },
    { id: 'auto_shotgun', name: 'The Pile-On', class: 'shotgun', dmg: 50, rate: 3, mag: 8, reserve: 64, reload: 2.6, spread: 0.095, bloom: { add: 0.01, max: 0.04, decay: 0.12 }, recoil: 2.4, range: 11, projectile: 'hitscan', hold: 'two', price: 3800, unlock: un('b05_dunk'), attachments: SHOTTY,
      auto: true, pellets: 6, vehicleMul: 0.6, knock: 2.2, flavor: "Dunk's chat in a box. Nobody read the post. Everybody fires." },

    // ---- snipers --------------------------------------------------------------------------------
    { id: 'marksman', name: 'The Peer Review', class: 'sniper', dmg: 55, rate: 2.2, mag: 10, reserve: 60, reload: 2.4, spread: 0.03, bloom: { add: 0.008, max: 0.04, decay: 0.12 }, recoil: 1.8, range: 110, projectile: 'hitscan', hold: 'two', price: 3600, unlock: un('m12b_scope'), attachments: SCOPE,
      scope: true, zoom: 3, scopedSpread: 0.004, headMul: 2.5, vehicleMul: 0.8, flavor: "Semi-automatic review. Ten reviewers, one opinion, sent back for revisions." },
    { id: 'heavy_sniper', name: 'The Retraction', class: 'sniper', dmg: 220, rate: 0.45, mag: 4, reserve: 20, reload: 3.4, spread: 0.1, bloom: null, recoil: 5.5, range: 200, projectile: 'hitscan', hold: 'two', price: 9000, unlock: un('m14_grift'), attachments: ['muzzle', 'optic'],
      scope: true, zoom: 6, scopedSpread: 0, headMul: 3, vehicleMul: 1.6, noAuto: true, casingDelay: 0.4, flavor: "Undoes whatever it hits, on the record, at two hundred metres." },

    // ---- thrown ---------------------------------------------------------------------------------
    { id: 'flashbang', name: 'Breaking News', class: 'thrown', dmg: 0, rate: 1, mag: 0, reserve: 8, reload: 0, spread: 0, bloom: null, recoil: 0, range: 22, projectile: 'lobbed', hold: 'one', price: 200, unlock: un('m04_hit'), attachments: [],
      lobbed: true, speed: 20, fuse: 1.5, stun: 4, ring: 7, pack: 2, flavor: "A white flash and a chyron. Everyone in range forgets what they were doing, briefly, like viewers." },
    { id: 'sticky', name: 'The Sticky Take', class: 'thrown', dmg: 140, rate: 1, mag: 0, reserve: 6, reload: 0, spread: 0, bloom: null, recoil: 0, range: 18, projectile: 'lobbed', hold: 'one', price: 300, unlock: un('b04_redacted'), attachments: [],
      lobbed: true, speed: 16, sticks: true, remote: true, blast: 5, vehicleDmg: 260, pack: 1, flavor: "Sticks to whatever it touches, like everything you have ever said. Press again to set it off." },
    { id: 'spin_smoke', name: 'The Spin', class: 'thrown', dmg: 0, rate: 1, mag: 0, reserve: 10, reload: 0, spread: 0, bloom: null, recoil: 0, range: 22, projectile: 'lobbed', hold: 'one', price: 150, unlock: un('h02_prep'), attachments: [],
      lobbed: true, speed: 18, smoke: 8, smokeSeconds: 12, breaksSight: true, pack: 3, flavor: "A cloud of context. Nobody can see what happened, which is the point." },

    // ---- launchers and specials -----------------------------------------------------------------
    { id: 'grenade_launcher', name: 'The Follow-Up Question', class: 'launcher', dmg: 120, rate: 1.2, mag: 6, reserve: 24, reload: 3.2, spread: 0.01, bloom: null, recoil: 3.5, range: 60, projectile: 'lobbed', hold: 'two', price: 6000, unlock: un('m13b_ratio'), attachments: ['optic'],
      lobbed: true, speed: 26, fuse: 0, blast: 5, vehicleDmg: 200, noAuto: true, flavor: "Six follow-up questions in six seconds. Every one of them lands, none of them gets answered." },
    { id: 'minigun', name: 'The News Cycle', class: 'special', dmg: 14, rate: 20, mag: 300, reserve: 600, reload: 5.0, spread: 0.06, bloom: { add: 0.002, max: 0.08, decay: 0.08 }, recoil: 0.25, range: 50, projectile: 'hitscan', hold: 'two', price: 12000, unlock: un('b06_panel'), attachments: [],
      auto: true, heavy: true, spinUp: 0.8, mobility: 0.6, vehicleMul: 0.6, knock: 1.0, flavor: "From the props department. Runs twenty-four hours a day and covers everything badly." },
    { id: 'merch_cannon', name: 'The Merch Cannon', class: 'special', dmg: 6, rate: 1.5, mag: 5, reserve: 40, reload: 2.0, spread: 0.02, bloom: null, recoil: 2.0, range: 30, projectile: 'lobbed', hold: 'two', price: 800, unlock: un('m07_listen'), attachments: [],
      lobbed: true, speed: 24, knock: 7.0, flavor: "Fires rolled-up LOUD & CORRECT shirts. Knocks people over. They keep the shirt. Reach." },
    { id: 'mute_button', name: 'The Mute Button', class: 'special', dmg: 4, rate: 1, mag: 1, reserve: 20, reload: 1.0, spread: 0.01, bloom: null, recoil: 0.5, range: 8, projectile: 'hitscan', hold: 'one', price: 650, unlock: un('m09_balloon'), attachments: [],
      stun: 3, vehicleMul: 0, flavor: "Point, press, and they stop talking for three seconds. The most powerful weapon in media." }
  ];
  P.weaponOrder = P.weapons.map(function (w) { return w.id; });

  // ============================================================== attachments ==
  // mods multiply the weapon's numbers (dmg, spread, recoil, range, reload, mag) or add (noise -1 = suppressed)
  P.attachmentSlots = ['muzzle', 'mag', 'optic', 'grip', 'light'];
  P.attachments = [
    { id: 'suppressor', slot: 'muzzle', name: 'The Quiet Part', price: 900, mods: { noise: -1, range: 0.9, dmg: 0.95 }, fits: ['pistol', 'smg', 'rifle', 'sniper', 'shotgun'], flavor: 'Says the quiet part quietly. Cops hear less; everyone else hears nothing new.' },
    { id: 'compensator', slot: 'muzzle', name: 'The Both-Sides Brake', price: 450, mods: { recoil: 0.7 }, fits: ['pistol', 'smg', 'rifle', 'shotgun'], flavor: 'Pushes the muzzle down as hard as it goes up. Balanced, technically.' },
    { id: 'flash_hider', slot: 'muzzle', name: 'Off the Record', price: 300, mods: { spread: 0.95, flash: 0.3 }, fits: ['rifle', 'smg', 'sniper'], flavor: 'Hides the flash. The bang is still on the record.' },
    { id: 'ext_mag', slot: 'mag', name: 'Extended Remarks', price: 600, mods: { mag: 1.5, reload: 1.1 }, fits: ['pistol', 'smg', 'rifle', 'shotgun', 'sniper'], flavor: 'Half again as many rounds. Twice as long to wrap up.' },
    { id: 'drum_mag', slot: 'mag', name: 'The Drum Circle', price: 1500, mods: { mag: 2.5, reload: 1.35, mobility: 0.9 }, fits: ['smg', 'rifle', 'shotgun'], flavor: 'Goes on and on. Everyone in it thinks it is going somewhere.' },
    { id: 'red_dot', slot: 'optic', name: 'Laser Focus Dot', price: 500, mods: { spread: 0.85, adsZoom: 1.2 }, fits: ['pistol', 'smg', 'rifle', 'shotgun', 'launcher'], flavor: 'A red dot that never moves. The only thing in the city that never moves.' },
    { id: 'holo', slot: 'optic', name: 'The Hologram', price: 800, mods: { spread: 0.8, adsZoom: 1.4 }, fits: ['smg', 'rifle', 'launcher'], flavor: 'A sight that is not really there. Like most guests.' },
    { id: 'scope_4x', slot: 'optic', name: 'Close Reading', price: 1200, mods: { spread: 0.7, adsZoom: 4 }, fits: ['rifle', 'sniper'], flavor: 'For people who read past the headline. Rare. Collectible.' },
    { id: 'scope_8x', slot: 'optic', name: 'The Deep Dive', price: 2200, mods: { spread: 0.6, adsZoom: 8, sway: 1.2 }, fits: ['sniper'], flavor: 'Zooms all the way into the footnotes. Wobbles when you breathe, like a pundit.' },
    { id: 'fore_grip', slot: 'grip', name: 'The Firm Handshake', price: 400, mods: { recoil: 0.8, spread: 0.92 }, fits: ['smg', 'rifle', 'shotgun', 'sniper'], flavor: 'Nap Dynasty approved. Firmness level nine. Code GRIP20 does nothing.' },
    { id: 'angled_grip', slot: 'grip', name: 'The Angle', price: 450, mods: { adsSpeed: 1.25, recoil: 0.9 }, fits: ['smg', 'rifle', 'shotgun'], flavor: 'Everyone has one. This one is ergonomic.' },
    { id: 'flashlight', slot: 'light', name: 'The Spotlight', price: 250, mods: { light: 1 }, fits: ['pistol', 'smg', 'rifle', 'shotgun'], flavor: 'Lights up whoever is in front of you. They love it. Most of them.' },
    { id: 'laser', slot: 'light', name: 'Laser Pointer of Blame', price: 350, mods: { hipSpread: 0.75, laser: 1 }, fits: ['pistol', 'smg', 'rifle', 'shotgun'], flavor: 'Points at someone so you do not have to. It is always them.' }
  ];

  // ==================================================================== tints ==
  P.tints = [
    { id: 'stock', name: 'Factory Default', color: '#2a2a2a', price: 0, unlock: null },
    { id: 'pink', name: 'Loud & Correct Pink', color: '#ff3fa4', price: 250, unlock: null },
    { id: 'beige', name: 'Weather Balloon Beige', color: '#d9cfa6', price: 250, unlock: null },
    { id: 'navy', name: 'Nap Dynasty Navy', color: '#2c3e7a', price: 300, unlock: null },
    { id: 'purple', name: 'Velvetine Velvet', color: '#8e3a8e', price: 400, unlock: { mission: 'b02_velvetine' } },
    { id: 'blue', name: 'Bravadian Press-Release Blue', color: '#3d6fcf', price: 400, unlock: { mission: 'b03_warbanner' } },
    { id: 'camo', name: 'Hedge Maze Camo', color: '#3c5a32', price: 600, unlock: { mission: 'm05b_provenance' } },
    { id: 'redacted', name: '[REDACTED] Black', color: '#111111', price: 700, unlock: { mission: 'b04_redacted' } },
    { id: 'chrome', name: 'Lower-Third Chrome', color: '#cfd6dc', price: 1200, unlock: { mission: 'm14_grift' } },
    { id: 'gold', name: 'Goldplate (Rated a Ten)', color: '#e8b53a', price: 2500, unlock: { mission: 'b01_goldplate' } }
  ];

  // ================================================================== mod shop ==
  P.modshop = {
    name: 'Spin Doctor Customs', tagline: "We don't fix cars. We reframe them.",
    shops: ['spin_doctor_strip', 'spin_doctor_port'],
    clerk: { name: 'Doc Rewrap', line: 'Every dent is a narrative. Every narrative is two hundred dollars.' },
    paint: {
      colors: [
        { id: 'pink', name: 'Takesworth Pink', hex: '#ff3fa4' }, { id: 'gold', name: 'Goldplate Gold', hex: '#e8b53a' },
        { id: 'bravadia', name: 'Bravadian Blue', hex: '#3d6fcf' }, { id: 'velvet', name: 'Velvetine Purple', hex: '#8e3a8e' },
        { id: 'navy', name: 'Nap Navy', hex: '#2c3e7a' }, { id: 'clarity', name: 'Clarity Green', hex: '#2f9e6a' },
        { id: 'beige', name: 'Balloon Beige', hex: '#d9cfa6' }, { id: 'redacted', name: 'Redacted Black', hex: '#1a1a1a' },
        { id: 'chyron', name: 'Chyron Red', hex: '#c94040' }, { id: 'white', name: 'Lower-Third White', hex: '#f2f2f2' },
        { id: 'cawti', name: 'CAWTI Orange', hex: '#ff7a00' }, { id: 'pundit', name: '$PUNDIT Magenta', hex: '#ff2d6f' },
        { id: 'gus', name: 'Garage Green', hex: '#7fbf6a' }, { id: 'teal', name: 'Producer Teal', hex: '#27c9c2' },
        { id: 'lavender', name: 'Footnote Lavender', hex: '#8a94c8' }, { id: 'stoop', name: 'Stoop Brown', hex: '#7a4a35' }
      ],
      primaryPrice: 300, secondaryPrice: 150,
      finishes: [
        { id: 'gloss', name: 'Gloss', price: 0, line: 'Shiny. Like a take with no sources.' },
        { id: 'metallic', name: 'Metallic', price: 250, line: 'Glitters in the light of a ring light.' },
        { id: 'matte', name: 'Matte', price: 400, line: 'Absorbs criticism. And light.' },
        { id: 'chrome', name: 'Chrome', price: 1500, line: 'You can see yourself in it, which is the whole point of you.' }
      ]
    },
    // index = the level passed to GTP.Vehicles.mod
    wheels: [
      { level: 0, name: 'Stock Rims', price: 0 }, { level: 1, name: 'Talking Spokes', price: 400 }, { level: 2, name: 'Gold-Adjacent Alloys', price: 800 },
      { level: 3, name: 'Hedge Fund Hubcaps', price: 1200 }, { level: 4, name: 'Spinners (They Spin)', price: 1800 }, { level: 5, name: 'Rated-a-Ten Twenty-Twos', price: 2600 }
    ],
    spoiler: [
      { level: 0, name: 'None', price: 0 }, { level: 1, name: 'Lip Service', price: 350 }, { level: 2, name: 'The Hot Take Wing', price: 750 }, { level: 3, name: 'Podium Spoiler', price: 1300 }
    ],
    tint: [
      { level: 0, name: 'Clear', price: 0 }, { level: 1, name: 'Light Smoke', price: 200 }, { level: 2, name: 'Off the Record', price: 400 }, { level: 3, name: 'Fully Redacted', price: 700 }
    ],
    engine: [
      { level: 0, name: 'Stock', price: 0 }, { level: 1, name: 'Stage 1: Talking Points', price: 900 }, { level: 2, name: 'Stage 2: Hot Takes', price: 1800 },
      { level: 3, name: 'Stage 3: Primetime', price: 3200 }, { level: 4, name: 'Stage 4: Twenty-Four Hour Cycle', price: 5000 }
    ],
    brakes: [
      { level: 0, name: 'Stock', price: 0 }, { level: 1, name: 'Second Thoughts', price: 500 }, { level: 2, name: 'Walk It Back', price: 1100 }, { level: 3, name: 'Full Retraction', price: 2000 }
    ],
    armor: [
      { level: 0, name: 'None', price: 0 }, { level: 1, name: 'Thick Skin 20%', price: 600 }, { level: 2, name: 'Thick Skin 40%', price: 1200 },
      { level: 3, name: 'Plausible Deniability 60%', price: 2000 }, { level: 4, name: 'Plausible Deniability 80%', price: 3200 }, { level: 5, name: 'Mattress-Lined 100%', price: 5000 }
    ],
    turbo: { name: 'Outrage Turbo', price: 3500, line: 'Spools up when someone disagrees with you. It is always spooled.' },
    horns: [
      { id: 'stock', name: 'Stock Horn', price: 0 },
      { id: 'breaking', name: 'BREAKING Sting', price: 300, line: 'Three brass notes. Everyone stops to see if it is them.' },
      { id: 'coupon', name: 'Coupon Jingle', price: 250, line: 'Plays "code TAKES20". Dale gets a royalty.' },
      { id: 'toast', name: 'The Toast', price: 250, line: 'A tiny voice says "To you!" Nobody knows who it is for.' },
      { id: 'jets', name: 'Flyover', price: 400, line: 'A jet roar. There is no jet.' },
      { id: 'ten', name: 'Rated a Ten', price: 350, line: 'A voice says "Ten!" every time. The President licensed it to himself.' },
      { id: 'kazoo', name: 'Kazoo of Dissent', price: 150, line: 'CAWTI-approved. Against whatever this is.' }
    ],
    repair: { perHp: 2, min: 50, line: 'Repaired. We did not fix it, we contextualised it.' },
    barks: ['Welcome to Spin Doctor. What are we reframing today?', 'That dent? Bold choice. We can make it look intentional.', 'Gold paint is a ten. The President told us. Personally.', 'Armor? Smart. The comment section has cars now.']
  };

  // ================================================================= clothing ==
  // style hints for the models track: top tee|hoodie|blazer|polo|vest|coverall|jersey|suit|sweater;
  // bottom jeans|slacks|shorts|cargo|tracksuit; shoes sneakers|loafers|boots|slides; hat and glasses use the cast enums
  P.clothing = {
    name: 'Lanyard & Co.', tagline: 'Dress for the segment you want.',
    stores: ['lanyard_strip', 'lanyard_uptown'],
    clerk: { name: 'Lana Yard', line: 'Every outfit comes with a lanyard. The lanyard is the outfit.' },
    items: [
      { id: 'top_tee_pink', slot: 'top', style: 'tee', name: 'LOUD & CORRECT Tee', color: '#ff3fa4', price: 40, flavor: 'Merch. Wearing your own merch is reach.' },
      { id: 'top_tee_table', slot: 'top', style: 'tee', name: 'ASK ME ANYTHING Tee', color: '#f4f4f4', price: 45, flavor: "The back says I'LL ANSWER SOMETHING ELSE." },
      { id: 'top_hoodie_grey', slot: 'top', style: 'hoodie', name: 'Dorm 4B Hoodie', color: '#6a6a6a', price: 70, flavor: 'Smells like the mini-fridge. The mini-fridge is on air.' },
      { id: 'top_hoodie_pundit', slot: 'top', style: 'hoodie', name: '$PUNDIT Launch Hoodie', color: '#ff2d6f', price: 90, flavor: 'Bought with liquidity. Worth more than the coin.' },
      { id: 'top_polo_hoa', slot: 'top', style: 'polo', name: 'HOA Board Polo', color: '#f4ead8', price: 85, flavor: 'Cream. Approved. Mailbox adjacent.' },
      { id: 'top_blazer_cable', slot: 'top', style: 'blazer', name: 'Cable-Ready Blazer', color: '#2a2f4a', price: 260, flavor: 'Looks great from the waist up. The waist down is your business.' },
      { id: 'top_blazer_gold', slot: 'top', style: 'blazer', name: 'Gold Lamé Blazer (A Ten)', color: '#e8b53a', price: 900, flavor: 'Rated a ten by the man who rates blazers.' },
      { id: 'top_suit_anchor', slot: 'top', style: 'suit', name: 'Anchor Suit', color: '#1a1a24', price: 1400, flavor: 'For people who never finish a sentence, tailored.' },
      { id: 'top_vest_firm', slot: 'top', style: 'vest', name: 'Firmness Vest (Fashion)', color: '#2c3e7a', price: 300, flavor: 'Looks like the armor. Is a mattress cover. Code VEST20.' },
      { id: 'top_coverall_ova', slot: 'top', style: 'coverall', name: 'Balloon Repair Coveralls', color: '#c8b89a', price: 180, flavor: 'WEATHER BALLOON REPAIR on the back. Nobody asks what you repair.' },
      { id: 'top_jersey_stadium', slot: 'top', style: 'jersey', name: 'Goldplate Goldplate Jersey', color: '#ffd400', price: 150, flavor: 'Both words on the back. Your name on neither.' },
      { id: 'top_sweater_tweed', slot: 'top', style: 'sweater', name: 'Heirloom Tweed', color: '#7a5c3a', price: 480, flavor: 'Has been in a family since before opinions. Not your family.' },
      { id: 'bottom_jeans', slot: 'bottom', style: 'jeans', name: 'Campus Jeans', color: '#2a3a5a', price: 60, flavor: 'Distressed, like the host.' },
      { id: 'bottom_slacks_cable', slot: 'bottom', style: 'slacks', name: 'Off-Camera Slacks', color: '#2a2a2a', price: 120, flavor: 'Never on camera. Pressed anyway.' },
      { id: 'bottom_shorts_links', slot: 'bottom', style: 'shorts', name: 'Par Ten Shorts', color: '#e8dcc8', price: 80, flavor: 'Pleated. Ten pleats. Rated a ten.' },
      { id: 'bottom_cargo_port', slot: 'bottom', style: 'cargo', name: 'Manifest Cargos', color: '#5a5a3a', price: 95, flavor: 'Eleven pockets, all declared, none disclosed.' },
      { id: 'bottom_track_pink', slot: 'bottom', style: 'tracksuit', name: 'Ratio Tracksuit Bottoms', color: '#ff3fa4', price: 140, flavor: 'For running from your own clips.' },
      { id: 'shoes_sneakers', slot: 'shoes', style: 'sneakers', name: 'Quad Sneakers', color: '#f2f2f2', price: 70, flavor: 'Standing-room-only shoes. There are no chairs.' },
      { id: 'shoes_loafers', slot: 'shoes', style: 'loafers', name: 'Donor Loafers', color: '#3a2418', price: 380, flavor: 'Whisper when you walk. Like their owner.' },
      { id: 'shoes_boots', slot: 'shoes', style: 'boots', name: 'Printworks Boots', color: '#4a3a2a', price: 160, flavor: 'Steel toes. For kicking memos.' },
      { id: 'shoes_slides', slot: 'shoes', style: 'slides', name: 'Wellness Slides', color: '#2f9e6a', price: 55, flavor: 'Your doctor will not tell you to wear these.' },
      { id: 'hat_cap_loud', slot: 'hat', style: 'cap', name: 'LOUD Cap', color: '#ff3fa4', price: 35, flavor: 'Says LOUD on the front. CORRECT is on the back where you cannot see it.' },
      { id: 'hat_beanie', slot: 'hat', style: 'beanie', name: 'Sound Guy Beanie', color: '#3a5a3a', price: 30, flavor: 'Gus has the same one. He is not flattered.' },
      { id: 'hat_fedora', slot: 'hat', style: 'fedora', name: 'Listening Session Fedora', color: '#2a1a2a', price: 220, flavor: 'Worn to parties where nothing is played.' },
      { id: 'hat_beret', slot: 'hat', style: 'beret', name: 'Asset Beret', color: '#2b2b2b', price: 140, flavor: 'Legally never here.' },
      { id: 'hat_cowboy', slot: 'hat', style: 'cowboy', name: 'Culdesac Ranch Hat', color: '#9a6a3a', price: 160, flavor: 'The HOA approved it in spirit.' },
      { id: 'hat_helmet_gold', slot: 'hat', style: 'helmet', name: 'Gold Hard Hat (Ribbon Not Included)', color: '#e8b53a', price: 600, flavor: 'There is always a ribbon. You just cannot see it yet.' },
      { id: 'glasses_round', slot: 'glasses', style: 'round', name: 'Did-the-Reading Rounds', color: '#2a2a2a', price: 90, flavor: 'Makes you look like you did the reading. You did not.' },
      { id: 'glasses_aviator', slot: 'glasses', style: 'aviator', name: 'Flyover Aviators', color: '#c0a060', price: 180, flavor: "And that's why we need the shades." },
      { id: 'glasses_thick', slot: 'glasses', style: 'thick', name: 'Producer Frames', color: '#111111', price: 120, flavor: 'Four minutes of vision. Three.' },
      { id: 'glasses_shades', slot: 'glasses', style: 'shades', name: 'Didn\'t-Read Shades', color: '#111111', price: 75, flavor: 'Cannot see the post. Replying anyway.' }
    ],
    // one-click presets (each slot's item id or null for none)
    outfits: [
      { id: 'campus_casual', name: 'Campus Casual', price: 220, items: { top: 'top_tee_table', bottom: 'bottom_jeans', shoes: 'shoes_sneakers', hat: null, glasses: null } },
      { id: 'cable_ready', name: 'Cable Ready', price: 700, items: { top: 'top_blazer_cable', bottom: 'bottom_slacks_cable', shoes: 'shoes_loafers', hat: null, glasses: 'glasses_thick' } },
      { id: 'balloon_repair', name: 'Weather Balloon Repairman', price: 420, items: { top: 'top_coverall_ova', bottom: 'bottom_cargo_port', shoes: 'shoes_boots', hat: 'hat_beret', glasses: 'glasses_shades' }, disguise: 'ova' },
      { id: 'old_money', name: 'Old Money (Borrowed)', price: 1100, items: { top: 'top_sweater_tweed', bottom: 'bottom_slacks_cable', shoes: 'shoes_loafers', hat: null, glasses: 'glasses_round' } },
      { id: 'links_day', name: 'Tee Time', price: 900, items: { top: 'top_jersey_stadium', bottom: 'bottom_shorts_links', shoes: 'shoes_loafers', hat: 'hat_helmet_gold', glasses: 'glasses_aviator' } },
      { id: 'primetime', name: 'Primetime', price: 2600, items: { top: 'top_suit_anchor', bottom: 'bottom_slacks_cable', shoes: 'shoes_loafers', hat: null, glasses: null }, unlock: { mission: 'm14_grift' } }
    ],
    barks: ['Welcome to Lanyard & Co. You look like a guest. We can make you look like a host.', 'That one is very you. Everything is very you. It is a business.', 'The changing booth is the only room in the city without a camera. We checked.']
  };

  // =================================================================== barber ==
  P.barber = {
    name: 'The Clip Joint', tagline: 'We take a little off the top. Of the take.',
    stores: ['clip_joint'],
    clerk: { name: 'Barry Fade', line: 'Short back and sides, or short sides and back? Same price. Different segment.' },
    // hair: the cast portrait enum (bald short long pompadour bun mohawk slick afro bob)
    styles: [
      { id: 'cut_short', hair: 'short', name: 'The Respectfully', price: 40, flavor: 'Neat enough to say something rude in.' },
      { id: 'cut_pompadour', hair: 'pompadour', name: 'The Lower-Third', price: 120, flavor: 'Takes up exactly the top fifth of the screen.' },
      { id: 'cut_slick', hair: 'slick', name: 'The Hedge', price: 150, flavor: 'Slicked back toward both candidates.' },
      { id: 'cut_long', hair: 'long', name: 'The Listening Session', price: 90, flavor: 'Long, flowing, nothing ever played on it.' },
      { id: 'cut_bun', hair: 'bun', name: 'The Citation Pending', price: 70, flavor: 'Holds forty pens and one opinion.' },
      { id: 'cut_bob', hair: 'bob', name: 'The Segment', price: 80, flavor: 'Ends exactly at four minutes. Three.' },
      { id: 'cut_mohawk', hair: 'mohawk', name: 'The Counter-Protest', price: 110, flavor: 'Against whatever this is. Also against hats.' },
      { id: 'cut_afro', hair: 'afro', name: 'The Full Volume', price: 100, flavor: 'Maximum volume. The crowd meter loves it.' },
      { id: 'cut_bald', hair: 'bald', name: 'The Clean Slate', price: 30, flavor: 'Nothing on top. Like the memo, before the comments.' }
    ],
    colors: [
      { id: 'natural', name: 'Natural', hex: null, price: 0 },
      { id: 'black', name: 'Anchor Black', hex: '#1a1a1a', price: 40 },
      { id: 'brown', name: 'Stoop Brown', hex: '#3a2a1a', price: 40 },
      { id: 'blond', name: 'Ring-Light Blond', hex: '#d8b860', price: 60 },
      { id: 'grey', name: 'Distinguished Panel Grey', hex: '#9c9c9c', price: 60 },
      { id: 'pink', name: 'Loud & Correct Pink', hex: '#ff3fa4', price: 90 },
      { id: 'orange', name: 'CAWTI Orange', hex: '#ff7a00', price: 90 },
      { id: 'purple', name: 'Velvetine Purple', hex: '#8e3a8e', price: 90 },
      { id: 'gold', name: 'Goldplate Gold (A Ten)', hex: '#e8b53a', price: 250 }
    ],
    barks: ['Sit down. Not you, the chair. We have one chair. It is the only chair in the city.', 'You want it to say "pundit" or "journalist"? Journalist costs more. Nobody can afford it.', 'Look in the mirror. That is the main character. I am being paid to say that.']
  };

  // =============================================================== properties ==
  // income: dollars per game day (paid at 06:00). garage: vehicle slots for GTP.Vehicles.store
  P.properties = [
    { id: 'safe_dorm', kind: 'safehouse', landmark: 'pod_garage', name: 'The Pod Van', price: 0, owned: true, income: 0, garage: 1, save: true, wardrobe: false, flavor: 'Your face on it twice. The bed is the back seat. Sitting in it saves the game.' },
    { id: 'safe_suburb', kind: 'safehouse', landmark: 'safe_suburb', name: 'Culdesac Split-Level (Approved in Spirit)', price: 18000, income: 0, garage: 3, save: true, wardrobe: true, flavor: 'Three-car garage, one-car HOA permit. The mailbox is a violation.' },
    { id: 'safe_brownstone', kind: 'safehouse', landmark: 'safe_brownstone', name: 'Stoop & Grievance Brownstone', price: 32000, income: 0, garage: 2, save: true, wardrobe: true, flavor: 'Five steps up to a stoop where you can say things loudly at strangers. Old money next door says NO.' },
    { id: 'safe_marina_loft', kind: 'safehouse', landmark: 'safe_marina_loft', name: 'Velvetine Docks Loft (Formerly a Listening Room)', price: 40000, income: 0, garage: 2, save: true, wardrobe: true, flavor: 'Soundproofed for parties where nothing played. Your podcast will be the loudest thing it has ever heard.' },
    { id: 'safe_penthouse', kind: 'safehouse', landmark: 'safe_penthouse', name: 'Goldplate Tower Penthouse (The Gold Floor)', price: 85000, income: 0, garage: 4, save: true, wardrobe: true, flavor: 'The elevator has one button. It says GOLDPLATE. The view is rated a ten, by the view.' },
    { id: 'biz_fish_shack', kind: 'business', landmark: 'fish_shack', name: 'Fresh Takes Fish Shack', price: 12000, income: 400, garage: 0, flavor: 'Takes caught daily, reheated hourly. Now they are your takes.' },
    { id: 'biz_strip_gas', kind: 'business', landmark: 'strip_gas', name: 'Octane Opinions', price: 15000, income: 500, garage: 0, flavor: 'Premium is regular with a stance. You own the stance.' },
    { id: 'biz_culdesac_gas', kind: 'business', landmark: 'culdesac_gas', name: 'Pump & Circumstance', price: 14000, income: 450, garage: 0, flavor: 'The HOA approved the pump but not the price. Now you set the price. They will issue a star.' },
    { id: 'biz_green_room', kind: 'business', landmark: 'green_room', name: 'Green Room Motel', price: 22000, income: 700, garage: 0, flavor: 'Four hours of waiting, billed by the hour. The bagels are sponsored, so they are free money.' },
    { id: 'biz_char_charter', kind: 'business', landmark: 'char_charter', name: 'Char & Charter', price: 30000, income: 950, garage: 0, flavor: 'The menu is a donor tier list. You are now Platinum. The salad is still Bronze.' },
    { id: 'biz_stadium_name', kind: 'business', landmark: 'stadium', name: 'Stadium Naming Rights (the Third Word)', price: 99000, income: 2500, garage: 0, unlock: { mission: 'b06_panel' }, flavor: 'Goldplate Goldplate Takesworth Stadium. The President rates the third word a two. It pays a ten.' }
  ];

  // =================================================================== stocks ==
  // price in dollars; vol = daily random walk sigma; reacts = {missionId: fractional change on completion}
  P.stocks = [
    { ticker: 'NAPZ', name: 'Nap Dynasty Mattresses', price: 42, vol: 0.02, flavor: 'Sponsors everything. Therefore owns everything. Therefore boring. Therefore safe.',
      reacts: { m02_read: 0.05, m15a_primetime: 0.2, m15b_liveread: -0.05 } },
    { ticker: 'GPLT', name: 'Goldplate Holdings', price: 110, vol: 0.04, flavor: 'Rated a ten by its chairman, its auditor and its auditor, who is its chairman.',
      reacts: { m06_rally: 0.08, b01_goldplate: -0.22, m08b_jets: 0.04, m15a_primetime: 0.1 } },
    { ticker: 'VLTW', name: 'Vaultwright Capital', price: 230, vol: 0.015, flavor: 'We short what we love. Currently shorting itself, as a hedge.',
      reacts: { m05_peer: 0.03, m05b_provenance: 0.04, h03_job: -0.25, m13_thursday: 0.02 } },
    { ticker: 'VELV', name: 'Velvetine Records', price: 18, vol: 0.05, flavor: 'Nothing released. Still charting. The stock is a listening session.',
      reacts: { m07_listen: 0.06, m07b_ferry: 0.04, b02_velvetine: 0.35 } },
    { ticker: 'BDSC', name: 'Bravadian Defense Scooters', price: 27, vol: 0.05, flavor: "Sells scooters to both sides. And that's why we need the dividends.",
      reacts: { m08_scooters: 0.15, m08b_jets: 0.1, b03_warbanner: -0.3 } },
    { ticker: 'PNDT', name: '$PUNDIT (Trustless)', price: 0.42, vol: 0.15, flavor: 'Backed by takes. Down only, except when it is up four hundred percent.',
      reacts: { m11_trustless: -0.8, m13b_ratio: 4.0, m14_grift: -0.5 } },
    { ticker: 'TYNX', name: 'The Yell Network', price: 64, vol: 0.03, flavor: 'Twenty-four hours, zero days of reporting, steady margins.',
      reacts: { m04_hit: 0.03, b04_redacted: 0.1, b06_panel: 0.12, m14_grift: 0.2, m15b_liveread: -0.3 } },
    { ticker: 'BSAR', name: 'Both Sides Arms', price: 75, vol: 0.02, flavor: 'Goes up whenever anything happens to anyone. Balanced.',
      reacts: { m01c_both_sides: 0.02, b01_goldplate: 0.03, b03_warbanner: 0.05, b05_dunk: 0.03, h03_job: 0.06, m13_thursday: 0.08 } }
  ];
  P.stockApp = { name: 'Liquidity', by: 'Kyler Moonsworth', tagline: 'Trade trustlessly. That means trust us.', fee: 0.01 };

  // ===================================================================== golf ==
  // tee / pin: metres from goldplate_links' door (x east, z south); the world track may move them to valid lawn.
  // par: the honest par; displayPar: what the scorecard says (every hole a par ten).
  P.golf = {
    course: 'Goldplate Links', landmark: 'goldplate_links', greenFee: 200, displayPar: 10, windMax: 6,
    holes: [
      { hole: 1, name: 'The Ribbon', par: 3, displayPar: 10, tee: { x: -6, z: -84 }, pin: { x: -30, z: -50 }, hazards: ['ribbon'], gag: 'A ribbon is stretched across the fairway. Nobody has ever cut it. It is rated a ten in advance.' },
      { hole: 2, name: 'Both Words', par: 4, displayPar: 10, tee: { x: -34, z: -44 }, pin: { x: -8, z: -6 }, hazards: ['bunker'], gag: 'Two flags on one green. Both say GOLDPLATE. Either counts.' },
      { hole: 3, name: 'The Gold Bunker', par: 3, displayPar: 10, tee: { x: -6, z: 0 }, pin: { x: -32, z: 28 }, hazards: ['bunker', 'ramp'], gag: 'The bunker is gold sand. A stunt ramp lands on the fairway. Mind the trucks.' },
      { hole: 4, name: 'Water Feature (A Ten)', par: 4, displayPar: 10, tee: { x: -34, z: 34 }, pin: { x: -10, z: 70 }, hazards: ['water'], gag: 'The pond is a fountain is a pond. Balls in it are donated.' },
      { hole: 5, name: 'Formerly a Bunker', par: 3, displayPar: 10, tee: { x: -6, z: 76 }, pin: { x: -30, z: 86 }, hazards: ['bunker'], gag: 'Was a bunker. Renamed a sand trap. Renamed a gold trap. Still sand.' },
      { hole: 6, name: 'The Helipad', par: 4, displayPar: 10, tee: { x: -20, z: 84 }, pin: { x: -20, z: 30 }, hazards: ['helicopter'], gag: 'A gold helicopter landed here once, on purpose. The divot is listed on the deed.' },
      { hole: 7, name: 'Mulligan Alley', par: 4, displayPar: 10, tee: { x: -14, z: 22 }, pin: { x: -26, z: -22 }, hazards: [], gag: 'Every shot here is rated before it lands. The ball is a ten. The ball is in the pond.' },
      { hole: 8, name: 'The Hedge', par: 3, displayPar: 10, tee: { x: -20, z: -30 }, pin: { x: -14, z: -70 }, hazards: ['hedge'], gag: 'Borders the manor. The hedge is a hedge. Balls over it become a tax shelter.' },
      { hole: 9, name: 'Clubhouse (A Ten)', par: 3, displayPar: 10, tee: { x: -26, z: -76 }, pin: { x: -6, z: -88 }, hazards: [], gag: 'Finish at the clubhouse door. The clubhouse is rated a ten. You are rated a seven.' }
    ],
    caddy: { name: 'Kip (Caddying)', lines: ['Wind is coming from the left. Or the comments. Is this paid?', 'Par ten. You are at four. That is a six under. He will call it a ten.', 'I cleaned your ball. It had a coupon code on it.', 'Hole in one? He will add his name to the hole. Twice.'] },
    scoreNames: { '-3': 'Albatross (Rated a Ten)', '-2': 'Eagle (Rated a Ten)', '-1': 'Birdie (A Ten)', 0: 'Par (Ten)', 1: 'Bogey (Still a Ten)', 2: 'Double Bogey (An Eight, Respectfully)', 3: 'Triple (The Green Was Leased)' }
  };

  // =================================================================== events ==
  // random street events for the world track. kind: chase_ped | defeat | debate | destroy | stop_vehicle | ride | collect | push
  P.events = [
    { id: 'take_snatch', name: 'Take Snatcher', kind: 'chase_ped', weight: 3, districts: ['downtown', 'strip', 'campus', 'marina'],
      setup: { victim: 'civ', thief: 'thug', item: 'phone' }, reward: { money: 150, subs: 300 },
      lines: { start: ["Somebody grabbed my phone! I was LIVE! I'm still live! He's live now!"], win: ["You got it back! Say hi to my chat. My chat says you're a seven."], lose: ["He's streaming my stream. I'm being ratio'd by my own phone."] } },
    { id: 'fender_main', name: 'Main Character Fender-Bender', kind: 'defeat', weight: 2, districts: ['downtown', 'suburbs', 'uptown', 'airport'],
      setup: { peds: [{ role: 'civ', count: 2, hostile: true }], vehicles: [{ type: 'sedan', count: 2, dented: true }] }, reward: { money: 120, subs: 200 },
      lines: { start: ["I'm the main character! No, I'M the main character! You! Settle it!"], win: ["Neither of us is the main character. Noted. Respectfully."], lose: ["We agree on one thing: you're the side character."] } },
    { id: 'popup_table', name: 'Pop-Up Debate', kind: 'debate', weight: 2, districts: ['campus', 'capitol', 'downtown', 'uptown'],
      setup: { prop: 'folding_table', opponent: 'freshman', params: { rounds: 1, points: 3, timer: 6, bluff: 0.1 } }, reward: { money: 200, subs: 500 },
      lines: { start: ["Someone has set up a folding table. The sign says DEBATE ME. It means you."], win: ["Minds changed: zero. Crowd: loud. Close enough."], lose: ["They did the reading. Context stamped."] } },
    { id: 'hedge_truck', name: 'Hedge Transport', kind: 'destroy', weight: 1, districts: ['downtown', 'uptown', 'hills'],
      setup: { vehicles: [{ type: 'truck', count: 1, color: '#e8b53a', label: 'VAULTWRIGHT HEDGE TRANSPORT', driven: 'traffic' }], dropCash: 600 }, wanted: 2, reward: { money: 0, subs: 400 },
      lines: { start: ["A Vaultwright Capital truck. Gold. Slow. Carrying a hedge."], win: ["The hedge spilled. It was cash. It was always cash."], lose: ["It got away. Hedges always do."] } },
    { id: 'hoa_citation', name: 'Citation in Progress', kind: 'stop_vehicle', weight: 2, districts: ['suburbs'],
      setup: { vehicles: [{ type: 'suv', count: 1, color: '#f4ead8', driven: 'traffic', flee: true }] }, reward: { money: 180, subs: 250 },
      lines: { start: ["An HOA patrol just cited a mailbox for being adjacent. It's getting away with the clipboard."], win: ["Citation voided. The mailbox thanks you. The mailbox is fine."], lose: ["The mailbox has a wanted star now. It will never be the same."] } },
    { id: 'stalled_influencer', name: 'Stalled Influencer', kind: 'ride', weight: 2, districts: ['strip', 'marina', 'airport', 'suburbs'],
      setup: { passenger: 'civ', destinations: ['tyn_tower', 'listening_room', 'clarity_barn', 'airport_terminal', 'heirloom_club'] }, reward: { money: 160, subs: 350 },
      lines: { start: ["My car died mid-unboxing. I have to be at a launch in three minutes. You have a face I recognise. Drive."], win: ["Made it. I'll tag you. I won't tag you. I'll think about tagging you."], lose: ["Missed it. The launch launched without me. I'm the launch."] } },
    { id: 'balloon_spill', name: 'Balloon Spill', kind: 'collect', weight: 1, districts: ['industrial', 'capitol', 'port'],
      setup: { vehicles: [{ type: 'van', count: 1, color: '#d9cfa6', wrecked: true }], pickups: { count: 5, label: 'MEMO', radius: 40 }, timer: 45, agents: { role: 'thug', count: 3, delay: 20 } }, reward: { money: 250, subs: 300 },
      lines: { start: ["A weather balloon van has crashed. Envelopes everywhere. No balloons. Never any balloons."], win: ["Five memos. Same memo. Mattress. Jets. Pellets."], lose: ["The agents got them. They will be read nowhere, by everyone."] } },
    { id: 'counter_march', name: 'Counter-Counter-Protest', kind: 'push', weight: 2, districts: ['capitol', 'downtown', 'campus'],
      setup: { peds: [{ role: 'protester', count: 10, groups: 2 }], blocksRoad: true, weapon: 'megaphone' }, reward: { money: 100, subs: 450 },
      lines: { start: ["Two CAWTI marches, one road. One is against it. One is against the first one. Roz is in both."], win: ["Road clear. Both marches agree: you're the problem. Unity."], lose: ["They merged. It is now a march against you."] } }
  ];

  // ===================================================================== jobs ==
  P.jobs = {
    damage_control: {
      id: 'damage_control', name: 'Damage Control', parody: 'paramedic',
      vehicle: { type: 'van', wrap: 'damage_control', color: '#f2f2f2', label: 'DAMAGE CONTROL', parkedAt: 'hospital' },
      start: 'Sit in the Damage Control van and press E while stopped.', banner: 'DAMAGE CONTROL',
      dropOff: ['hospital', 'green_room'], levels: 12,
      rules: 'Level n has n patients. Each is a pundit who has just been ratio\'d. Pick them up, deliver them to Goldplate Memorial or the Green Room Motel before their take goes cold.',
      timer: { base: 40, perMetre: 1 / 9, perPatient: 10 }, pay: { perPatient: 60, perLevel: 120 },
      patients: [
        { id: 'pt_ratio', name: 'a freshly ratio\'d pundit', line: "Thirty thousand replies. All of them correct. Take me somewhere with no Wi-Fi." },
        { id: 'pt_clip', name: 'a man clipped out of context', line: "They clipped me! The context was worse! Hurry!" },
        { id: 'pt_notes', name: 'a context-stamped influencer', line: "They stamped me. CONTEXT. Three times. I can feel the footnotes." },
        { id: 'pt_hot', name: 'a take that cooled', line: "My take is getting cold. Fresh Takes reheats them but I can't make it." },
        { id: 'pt_panel', name: 'a panelist who ran over time', line: "They left it there. They left ME there. Drive." },
        { id: 'pt_memo', name: 'a guest who read the wrong memo', line: "I said pellets on the jets segment. I'm ruined. Code TAKES20 me." },
        { id: 'pt_dunk', name: 'a dunk victim', line: "I got dunked on by a man who didn't read my post. Twice." },
        { id: 'pt_lanyard', name: 'a donor with a tangled lanyard', line: "My lanyard is tangled with another donor's lanyard. We're legally one donor now." },
        { id: 'pt_hoa', name: 'an HOA board member in shock', line: "Somebody painted their door an unapproved colour. I saw it. I SAW it." },
        { id: 'pt_coin', name: 'a $PUNDIT holder', line: "Down ninety percent. Up four hundred. Down ninety. I need a chair. There are no chairs." },
        { id: 'pt_caller', name: 'a radio caller who was told he was wrong', line: "He said I was wrong and hung up! I hadn't finished being wrong!" },
        { id: 'pt_kip', name: 'Kip', line: "I'm not hurt. I just wanted a ride. Is this paid?" }
      ],
      lines: { levelUp: ['LEVEL UP. Damage controlled. The narrative is stable.', 'Another level. The hospital bandages have a coupon code.'], fail: ['The take went cold. The patient is fine, but nobody cares anymore.'], complete: ['Twelve levels. You have controlled all the damage. Clarity Pellets now heal twice as much on you.'] },
      rewards: [{ level: 6, money: 1500, text: 'Bandage sponsor deal: +$1,500' }, { level: 12, flag: 'damage_controlled', money: 5000, text: 'Clarity Pellets heal double; the van has armor' }]
    },
    hot_take_brigade: {
      id: 'hot_take_brigade', name: 'Hot Take Brigade', parody: 'firefighter',
      vehicle: { type: 'truck', wrap: 'brigade', color: '#d23a2a', label: 'HOT TAKE BRIGADE', parkedAt: 'police_hq' },
      start: 'Sit in the Hot Take Brigade truck and press E while stopped.', banner: 'HOT TAKE BRIGADE',
      levels: 12,
      rules: 'Level n has n flame wars: billboards, cars and folding tables that have caught a take. Drive close, hold Shoot to spray the cooling foam (it is decaf), put each one out before the timer ends.',
      timer: { base: 45, perMetre: 1 / 9, perFire: 12 }, pay: { perFire: 70, perLevel: 130 }, sprayRange: 14,
      fires: [
        { id: 'fw_billboard', name: 'a billboard quote-posting another billboard', line: 'The Impression Alley boards are at it again. One of them is losing, and on fire.' },
        { id: 'fw_table', name: 'a folding table mid-debate', line: 'A campus debate got heated. Literally. The sign is fine.' },
        { id: 'fw_car', name: 'a car with a bumper sticker', line: 'Two opinions on one bumper. Spontaneous combustion.' },
        { id: 'fw_grill', name: 'a donor steakhouse grill', line: 'The Platinum tier ordered it well done. Very well done.' },
        { id: 'fw_mailbox', name: 'an HOA mailbox', line: 'The mailbox was cited, then it caught fire out of embarrassment.' },
        { id: 'fw_pellets', name: 'a pallet of Clarity Pellets', line: 'The pellets are "detoxing." Loudly. With flames.' },
        { id: 'fw_rig', name: 'a $PUNDIT mining rig', line: 'Thirty GPUs or one space heater. It was the heater.' },
        { id: 'fw_memo', name: 'a stack of Monday Memos', line: 'Four thousand copies. Nobody ordered them. Nobody will miss them.' }
      ],
      lines: { levelUp: ['LEVEL UP. The flame war is out. The war continues, but cooler.', 'Another one out. Fire is clean, says nobody qualified.'], fail: ['It spread to the replies. Nobody can put out the replies.'], complete: ['Twelve levels. The city is still angry, just not on fire. You are fireproof now.'] },
      rewards: [{ level: 6, money: 1500, text: 'Brigade helmet in the wardrobe; +$1,500' }, { level: 12, flag: 'fireproof', money: 5000, text: 'Fireproof: explosions and hot takes knock you down less' }]
    }
  };

  // ============================================================= achievements ==
  // trigger hints for the systems track: event (+count), flag, mission, stat >= n
  P.achievements = [
    { id: 'first_take', name: 'First Take', desc: 'Win your first debate. Minds changed: zero.', trigger: { mission: 'm00_intro' } },
    { id: 'pre_viral', name: 'Pre-Viral', desc: 'Get a van with your face on it. Twice.', trigger: { mission: 'm01_van' } },
    { id: 'free_sample', name: 'Free Sample', desc: 'Take the free pistol from Merle. The bullets are the business model.', trigger: { mission: 'm01c_both_sides' } },
    { id: 'gold_standard', name: 'Gold Standard', desc: 'Score gold on the Both Sides Arms range. Merle raises the price.', trigger: { event: 'range:end', medal: 'gold' } },
    { id: 'balanced', name: 'Balanced', desc: 'Buy something at all three Both Sides Arms branches.', trigger: { stat: 'shopsVisited', count: 3 } },
    { id: 'full_wall', name: 'Full Wall', desc: 'Own twenty weapons. Merle has qualified you for nothing.', trigger: { stat: 'weaponsOwned', count: 20 } },
    { id: 'dressed_for_it', name: 'Dressed for the Segment', desc: 'Buy an outfit at Lanyard & Co.', trigger: { event: 'clothing:buy' } },
    { id: 'fresh_cut', name: 'Fresh Cut', desc: 'Get a haircut at the Clip Joint. The only chair in the city.', trigger: { event: 'barber:buy' } },
    { id: 'spin_doctored', name: 'Spin Doctored', desc: 'Max out engine, brakes and armor on one car.', trigger: { stat: 'maxedCars', count: 1 } },
    { id: 'landlord', name: 'Landlord of Discourse', desc: 'Buy a property.', trigger: { event: 'property:buy' } },
    { id: 'hedge_fund', name: 'Hedge Fund', desc: 'Make $10,000 profit on the Liquidity app.', trigger: { stat: 'stockProfit', count: 10000 } },
    { id: 'par_ten', name: 'Par Ten', desc: 'Finish all nine holes at Goldplate Links. Every score is a ten.', trigger: { event: 'golf:end', holes: 9 } },
    { id: 'ace', name: 'Ace (Renamed)', desc: 'Hole in one. The President rates the hole a ten and adds his name. Twice.', trigger: { event: 'golf:hole', strokes: 1 } },
    { id: 'ribbon_cut', name: 'Ribbon Cutting', desc: 'Ground the gold helicopter.', trigger: { mission: 'b01_goldplate' } },
    { id: 'the_drop', name: 'The Drop', desc: 'Make the silent yacht play something.', trigger: { mission: 'b02_velvetine' } },
    { id: 'no_jets', name: 'No Jets', desc: "Ground the flyover. And that's why we don't need the jets.", trigger: { mission: 'b03_warbanner' } },
    { id: 'popped', name: 'Weather Balloon, Repaired', desc: 'Pop the giant balloon of your own face.', trigger: { mission: 'b04_redacted' } },
    { id: 'next_table', name: 'Next Table Over', desc: 'Ratio Ptolemy Dunk table to table.', trigger: { mission: 'b05_dunk' } },
    { id: 'undercard', name: 'Undercard Champion', desc: 'Win the stadium undercard.', trigger: { mission: 'b06_panel' } },
    { id: 'retrieval', name: 'Retrieval Specialist', desc: 'Pull off the Hedge Job. It was a retrieval.', trigger: { mission: 'h03_job' } },
    { id: 'whole_department', name: 'Lose the Entire Department', desc: 'Escape a five-star wanted level.', trigger: { event: 'wanted:cleared', stars: 5 } },
    { id: 'write_that_down', name: 'Write That Down', desc: 'Land 100 head shots.', trigger: { stat: 'headshots', count: 100 } },
    { id: 'damage_controlled', name: 'Damage Controlled', desc: 'Reach level 12 in Damage Control.', trigger: { flag: 'damage_controlled' } },
    { id: 'fireproof', name: 'Fireproof', desc: 'Reach level 12 in the Hot Take Brigade.', trigger: { flag: 'fireproof' } },
    { id: 'minds_changed', name: 'Minds Changed: One', desc: 'Finish the story either way.', trigger: { anyMission: ['m15a_primetime', 'm15b_liveread'] } },
    { id: 'respectfully_cheating', name: 'Respectfully, Cheating', desc: 'Type a cheat code. Nobody is in charge, so nobody minds.', hidden: true, trigger: { event: 'cheat' } }
  ];

  // =================================================================== cheats ==
  // typed on the keyboard during play (letters only, case-insensitive); effects are for the systems track
  P.cheats = [
    { code: 'RESPECTFULLY', effect: 'heal', name: 'Respectfully, You\'re Fine', toast: 'Health and armor restored. Respectfully.' },
    { code: 'DIDNTREAD', effect: 'clear_wanted', name: 'Didn\'t Read the Warrant', toast: 'Wanted level cleared. Didn\'t read it. Replied anyway.' },
    { code: 'TENOUTOFTEN', effect: 'gold_everything', name: 'Rated a Ten', toast: 'Every car is gold now. The President approves.' },
    { code: 'BIGTAKES', effect: 'big_heads', name: 'Big Takes', toast: 'Everyone\'s head is the size of their opinion.' },
    { code: 'TRUSTLESS', effect: 'low_gravity', name: 'Trustless Gravity', toast: 'Gravity is now trustless. That means trust it less.' },
    { code: 'CODETAKESTWENTY', effect: 'spawn_vehicle', vehicle: 'truck', wrap: 'nap', name: 'Code TAKES20', toast: 'A Nap Dynasty demo truck has arrived. Firmness level nine.' },
    { code: 'WEATHERBALLOON', effect: 'cycle_weather', name: 'Weather Balloon Repair', toast: 'A balloon has been repaired. The weather has been changed. No questions were taken.' },
    { code: 'ISTHISPAID', effect: 'money', amount: 11, name: 'Is This Paid?', toast: 'Yes. $11. Kip is proud of you.' }
  ];

  // ============================================================== loadingTips ==
  P.loadingTips = [
    'Hold right mouse to aim over the shoulder. The gun is the one in your hands. Left mouse fires.',
    'Press Q next to a wall, a car or a low wall to take cover. Peek to fire. Walls do not sue.',
    'Both Sides Arms has three branches. Walk in through the door. Merle is the same man at all three.',
    'The back room at the Strip branch is a shooting range. Bronze, silver, gold. Gold raises the price.',
    'Your phone rings when the next mission is ready. The GPS line on the minimap goes straight to it.',
    'Spin Doctor Customs repaints, re-rims and reframes your car. Drive in. Bring money and a narrative.',
    'Lanyard & Co. sells outfits. Every outfit comes with a lanyard. The lanyard is the outfit.',
    'The Clip Joint has one chair. It is the only chair in the city. Sit in it.',
    'Buy a safehouse to get a bed, a wardrobe and a garage. Sleeping saves. So does the pod van.',
    'Businesses pay every morning at six. Fresh Takes reheats the money hourly.',
    'The Liquidity app trades eight stocks. Your missions move them. Think before you wreck a scooter company.',
    'Goldplate Links: nine holes, every one a par ten on the card. The wind is real. The par is not.',
    'Bosses are defeated, humiliated and ratio\'d. Nobody is ever really hurt. Their ratings are.',
    'Focus, Shout, Chat Mob and Boost are your specials. Each meter fills by playing loudly.',
    'Damage Control drives ratio\'d pundits to the hospital. Their takes go cold if you are slow.',
    'The Hot Take Brigade puts out flame wars. The foam is decaf.',
    'Heists start with a planning board. Pick an approach and a crew. Crews take a cut. Kip takes nothing.',
    'Attachments change a gun. The Quiet Part makes it quiet. The Drum Circle makes it go on and on.',
    'Street events pop up anywhere: a stolen phone, a pop-up debate, a gold truck full of hedge.',
    'Tints are cosmetic. Goldplate tint is rated a ten and costs like one.',
    'Every mission is a checkpoint chain. Failing sends you back a step, not home.',
    'Jump out of an aircraft above 30 metres to open a parachute. It is branded. Everything is branded.',
    'Typing certain words during play does things. Respectfully, we will not say which.',
    'Minds changed so far: zero. The counter is on the stats page. It has never moved.'
  ];

  // ==================================================================== radio ==
  P.radio = {
    ticker: [
      'GOLD HELICOPTER LANDS IN BUNKER; PRESIDENT CALLS IT A TEN-POINT LANDING',
      'SILENT YACHT PLAYS MUSIC; GUESTS ENJOY IT; BARON "BEWILDERED, THEN TOASTING"',
      'BRAVADIAN FLYOVER ENDS IN SEA; PM REQUESTS SECOND JET',
      'GIANT WEATHER BALLOON POPS OVER PRINTWORKS; OVA DENIES BALLOON, DENIES WEATHER',
      'LOCAL PUNDITS BRAWL ACROSS NINE TABLES; ZERO CHAIRS INVOLVED',
      'STADIUM UNDERCARD DRAWS RECORD CROWD OF GOONS; PANEL RESCHEDULED TO TONIGHT',
      'VAULTWRIGHT CAPITAL REPORTS "RETRIEVAL"; HEDGE DOWN, HEDGE MAZE UP',
      'BOTH SIDES ARMS OPENS SHOOTING RANGE; BOTH SIDES SHOOT, BOTH SIDES MISS',
      'SPIN DOCTOR CUSTOMS REFRAMES 400 CARS; DENTS NOW "PART OF THE STORY"',
      'LANYARD & CO. REPORTS RECORD LANYARD SALES; LANYARDS NOW OUTNUMBER CITIZENS',
      'CLIP JOINT STILL HAS ONE CHAIR; CITY CHAIR COUNT HOLDS AT ONE',
      '$PUNDIT UP 400%, DOWN 80%, UP; ANALYSTS SAY "TRUSTLESS"',
      'GOLDPLATE LINKS REPORTS ALL ROUNDS SHOT AT PAR TEN; PAR "SOMEWHAT LOWER"',
      'DAMAGE CONTROL VAN DELIVERS 12 RATIO\'D PUNDITS; ALL "FINE, JUST OFFLINE"',
      'HOT TAKE BRIGADE PUTS OUT FLAME WAR; WAR CONTINUES, COOLER',
      'GOLDPLATE TOWER PENTHOUSE LISTED; ELEVATOR HAS ONE BUTTON, RATED A TEN'
    ],
    ads: {
      wail_101: [
        'Both Sides Arms. We arm both sides. That\'s balance. First one\'s free, ask Merle.',
        'Damage Control. Ratio\'d? Clipped? Context stamped? We drive you somewhere with no signal.',
        'Spin Doctor Customs. We don\'t fix cars. We reframe them.'
      ],
      pennant_fm: [
        'Goldplate Links. Nine holes, every one a ten. Tee times by decree.',
        'The Goldplate Tower Penthouse. One button in the elevator. It says GOLDPLATE.',
        'Liquidity, the trading app. Buy GPLT. It\'s a ten. Sell everything else.'
      ],
      velvetine_888: [
        'Lanyard & Co. Dress for the segment you want. The lanyard is the outfit.',
        'The Velvetine Docks Loft. Soundproofed for parties where nothing played. Now leasing to anyone loud.',
        'The Clip Joint. One chair. The only chair in the city. Book now.'
      ],
      quiet_signal: [
        'The Hot Take Brigade. A fire has been reported. A truck has been sent. The fire was an opinion.',
        'Stoop & Grievance Realty. A property has been purchased. A garage has been included. A wardrobe has been assumed.',
        'Spin Smoke by Both Sides Arms. Nothing has been seen. Nothing will be.'
      ]
    },
    dj: {
      wail_101: ['Caller, you were ratio\'d? Stay on the line, Damage Control is on the way.', 'Breaking: a gold helicopter. We are against it. Or for it. Calls are open.'],
      pennant_fm: ['That song was a ten. The President named it after himself. It was already named after him. Ten.', 'The helicopter landing was on purpose. The bunker was on purpose. Ten.'],
      velvetine_888: ['The Baron\'s yacht played a song last night. We will not be playing it. To the silence.', 'This next track has never been released. Here it is, not being released.'],
      quiet_signal: ['A balloon was popped. A balloon was never there. Both statements are accurate.', 'A bank was visited. A retrieval occurred. Nothing was taken that was not already gone.']
    },
    // a ticker line shown when the mission completes
    news: {
      m01c_both_sides: 'LOCAL PUNDIT ACCEPTS FREE GUN; BULLETS NOT FREE; MERLE "THRILLED"',
      b01_goldplate: 'GOLD HELICOPTER LANDS IN BUNKER; PRESIDENT CALLS IT A TEN-POINT LANDING',
      b02_velvetine: 'SILENT YACHT PLAYS MUSIC; GUESTS ENJOY IT; BARON "BEWILDERED, THEN TOASTING"',
      b03_warbanner: 'BRAVADIAN FLYOVER ENDS IN SEA; PM REQUESTS SECOND JET',
      b04_redacted: 'GIANT WEATHER BALLOON POPS OVER PRINTWORKS; OVA DENIES BALLOON, DENIES WEATHER',
      h01_casing: 'VAULTWRIGHT CAPITAL VISITED BY "TOURISTS" WITH A BOARD',
      h02_prep: 'TYN NEWS VAN MISSING; TYN REPORTS ON ITSELF, LIVE',
      h03_job: 'VAULTWRIGHT CAPITAL REPORTS "RETRIEVAL"; HEDGE DOWN, HEDGE MAZE UP',
      b05_dunk: 'LOCAL PUNDITS BRAWL ACROSS NINE TABLES; ZERO CHAIRS INVOLVED',
      b06_panel: 'STADIUM UNDERCARD DRAWS RECORD CROWD OF GOONS; PANEL RESCHEDULED TO TONIGHT'
    }
  };

  // ================================================================= missions ==
  // the 22_ schema plus `act`; new objective types: interior {interior, store}, range {medal}, buy {item},
  // boss {bossId}, heist_board {heist} (PLAN_V03.md story / bosses tracks)
  P.missions = [

    // ------------------------------------------------------------- Act I --
    {
      id: 'm01c_both_sides', story: true, title: 'Free Sample', act: 1,
      giver: 'merle', marker: 'both_sides_strip', requires: ['m01_van'], reward: 150,
      intro: [
        { who: 'merle', text: "Bryce Takesworth. Saw your van. Saw your face on your van. Twice. Merle Firmness, Both Sides Arms." },
        { who: 'player', text: "Firmness? Any relation to anything?" },
        { who: 'merle', text: "Dale's cousin. Nap Dynasty. He sells sleep, I sell the other thing. First one's free. For a journalist, also free. Free." },
        { who: 'sloane', text: "Ten minutes. Learn to hold it, learn to aim it, learn to pay for it. The paying is the segment." }
      ],
      objectives: [
        { type: 'goto', target: { landmark: 'both_sides_strip' }, radius: 40, text: 'Walk up to the Both Sides Arms door' },
        { type: 'interior', interior: 'armory', store: 'both_sides_strip', text: 'Step inside. Mind the podium' },
        { type: 'equip', weaponId: 'pistol', ammo: 24, text: 'Take the free pistol off the counter' },
        { type: 'dialogue', lines: [
          { who: 'merle', text: "Hold right mouse to aim. Left to fire. The gun is the one in your hand. Q puts your back to a wall. Walls don't sue." },
          { who: 'merle', text: "Back room's the range. Sixty seconds. Bronze or better and you keep it." },
          { who: 'player', text: "And if I get gold?" },
          { who: 'merle', text: "Then I raise the price." }
        ] },
        { type: 'range', medal: 'bronze', text: 'Score bronze or better on the back-room range (60 s)' },
        { type: 'buy', item: 'ammo_pistol', text: 'Buy a starter box of pistol rounds at the counter' }
      ],
      outro: [
        { who: 'merle', text: "Sixty dollars. For a journalist, forty. Sixty. Welcome to the loyalty program. Nobody has qualified." },
        { who: 'player', text: "Respectfully, I came here for the free thing." },
        { who: 'merle', text: "The gun was free. The bullets are the business model. Same as your show." },
        { who: 'kip', text: "I bought a holster. It's a lanyard. Is this paid?" }
      ],
      failOn: ['player_dead'],
      onComplete: { unlockWeapon: 'pistol', setFlag: 'armory_intro' }
    },

    // ------------------------------------------------------------ Act II --
    {
      id: 'b01_goldplate', story: true, title: 'Rated a Ten', act: 2,
      giver: 'sloane', marker: 'stadium', requires: ['m06_rally'], reward: 1800,
      intro: [
        { who: 'sloane', text: "He renamed the show. Now he's flying the new name over his own stadium. On a ribbon. Behind a gold helicopter." },
        { who: 'player', text: "He has a helicopter?" },
        { who: 'sloane', text: "He has one. The roof sign says two. That's why the ticker says both." },
        { who: 'goldplate', radio: true, text: "Takesworth! Look up! THE GOLDPLATE HOUR WITH GOLDPLATE. The ribbon's a ten. The helicopter's a ten. You're a guest." },
        { who: 'gus', text: "The ribbon's on four spools under the skids. Shoot the spools. I'm sound, but even I can hear that's physics." }
      ],
      objectives: [
        { type: 'goto', target: arena('b01_goldplate'), radius: 160, text: 'Get under the gold helicopter, over the stadium lots' },
        { type: 'boss', bossId: 'b01_goldplate', text: 'Shoot the four ribbon spools under the gold helicopter to ground it' },
        { type: 'dialogue', lines: [
          { who: 'goldplate', text: "I'm landing. On purpose. It's a ten-point landing. In a bunker. On purpose." },
          { who: 'player', text: "Respectfully, sir, you're in a sand trap." },
          { who: 'goldplate', text: "It's a gold trap. I'm renaming it." }
        ] },
        { type: 'escape_wanted', setWanted: 2, text: 'Presidential security rates you a two. Lose them' }
      ],
      outro: [
        { who: 'sloane', text: "The ribbon's down. The show is Loud & Correct again. For now. He's already ordering more ribbon." },
        { who: 'goldplate', text: "Takesworth. Tough guy. I rate you an eight. Keep the putter, it fell out of the helicopter. It's a ten." },
        { who: 'player', text: "Why is there a putter in a helicopter?" },
        { who: 'goldplate', text: "I rate everything. The helicopter's a ten. The putter's a ten. You're an eight." },
        { who: 'kip', text: "I was holding the other end of the ribbon. Is this paid?" }
      ],
      failOn: ['player_dead'],
      onComplete: { unlockWeapon: 'golf_club', setFlag: 'ribbon_cut' }
    },

    {
      id: 'b02_velvetine', story: true, title: 'The Silent Yacht', act: 2,
      giver: 'gus', marker: 'velvetine_pier', requires: ['m07b_ferry'], reward: 2000,
      intro: [
        { who: 'gus', text: "The Baron's yacht has forty speakers and none of them are on. That offends me professionally." },
        { who: 'player', text: "The Baron pinned the warehouse on me and parked me at customs." },
        { who: 'gus', text: "So we turn them on. Too loud. Six of them blow. He hides behind the silence. No silence, no Baron." },
        { who: 'velvetine', text: "To silence! To the absence of the drop! Nobody touch the speakers, they've never been used, they're vintage!" },
        { who: 'kip', text: "I'm the DJ tonight. I'm reading a spreadsheet. Is this paid?" }
      ],
      objectives: [
        { type: 'goto', target: arena('b02_velvetine'), radius: 160, text: "Get to the Baron's yacht" },
        { type: 'boss', bossId: 'b02_velvetine', text: 'Wreck the silent speakers on deck to expose the Baron' },
        { type: 'dialogue', lines: [
          { who: 'velvetine', text: "To... the drop. Oh no. It dropped." },
          { who: 'gus', text: "That's what a speaker does. You've had them on mute for nine years." },
          { who: 'velvetine', text: "To mute! To nine years!" }
        ] }
      ],
      outro: [
        { who: 'velvetine', text: "To you! You played something! Out loud! On my yacht! The guests LIKED it! To... liking!" },
        { who: 'player', text: "Respectfully, that's what music is." },
        { who: 'velvetine', text: "To music, I suppose. Take the mic stand. Nobody here ever stood at one." },
        { who: 'gus', text: "Levels were perfect. First time in my life." },
        { who: 'kip', text: "I DJ'd. I read the spreadsheet over the music. Nobody noticed. Is this paid?" }
      ],
      failOn: ['player_dead'],
      onComplete: { unlockWeapon: 'mic_stand', setFlag: 'yacht_played' }
    },

    {
      id: 'b03_warbanner', story: true, title: 'Volume Is Policy', act: 2,
      giver: 'roz', marker: 'bravadia_embassy', requires: ['m08b_jets'], reward: 2200,
      intro: [
        { who: 'roz', text: "WE'RE NOT HERE TO STOP THE PARADE. We're here to stand in front of it. Loudly." },
        { who: 'warbanner', text: "The Bravadian Volume Day Flyover. Today the jet flies, low, over the runway. And that's why we need the jets." },
        { who: 'player', text: "The jet is a cutout on a truck." },
        { who: 'warbanner', text: "The new jet is a cutout on a faster truck. Forty Defense Scooters ride alongside. And that's why we need the jets." },
        { who: 'sloane', text: "Runway. Dodge the flyover, wreck the scooter column. Two minutes. One." }
      ],
      objectives: [
        { type: 'goto', target: arena('b03_warbanner'), radius: 160, text: 'Get to Runway 10/10 before the flyover. Drive; it is across the bay' },
        { type: 'boss', bossId: 'b03_warbanner', text: 'Dodge the jet flyover and wreck the Defense Scooter column' },
        { type: 'dialogue', lines: [
          { who: 'warbanner', text: "The jet has landed. On its side. In the sea. And that's why we need the jets. Plural, now." },
          { who: 'roz', text: "WE'RE NOT HERE TO CHEER! HOORAY, HOORAY, THE JET'S IN THE BAY!" }
        ] },
        { type: 'escape_wanted', setWanted: 3, text: 'Airport security rates the flyover a three. Lose them' }
      ],
      outro: [
        { who: 'warbanner', text: "A setback. The scooters are wrecked. The invoice is still addressed to your podcast. And that's why we need the jets." },
        { who: 'player', text: "Respectfully, I'm not paying for scooters I wrecked." },
        { who: 'warbanner', text: "Then Bravadia gifts you a carbine. Gifts are tax-free. And that's why we need the jets." },
        { who: 'roz', text: "NO JETS TODAY, MORE JETS TOMORROW! WE'RE NOT HERE TO BE CONSISTENT, WE'RE HERE TO BORROW!" },
        { who: 'kip', text: "I was on the truck. With the jet. In the sea. Is this paid?" }
      ],
      failOn: ['player_dead'],
      onComplete: { unlockWeapon: 'carbine', setFlag: 'flyover_grounded' }
    },

    {
      id: 'b04_redacted', story: true, title: 'Weather Balloon, Repaired', act: 2,
      giver: 'kip', marker: 'balloon_depot', requires: ['m09b_hotmic'], reward: 2400,
      intro: [
        { who: 'kip', text: "I'm in the balloon. I'm not supposed to be in the balloon. There is a balloon. It's huge. Is this paid?" },
        { who: 'redacted', text: "You found the [REDACTED]. It is a weather balloon. It has never measured weather. It measures [REDACTED]." },
        { who: 'player', text: "It's shaped like my face." },
        { who: 'redacted', text: "Everything we [REDACTED] is shaped like your face. The vans circle. The vans always circle." },
        { who: 'gus', text: "It's got panels. Each one pops at about ninety decibels. Pop them all. You'll be peaking." }
      ],
      objectives: [
        { type: 'goto', target: arena('b04_redacted'), radius: 160, text: 'Get into the depot lot, under the balloon' },
        { type: 'boss', bossId: 'b04_redacted', text: 'Pop the giant weather balloon panel by panel while the vans circle' },
        { type: 'dialogue', lines: [
          { who: 'redacted', text: "The [REDACTED] has been [REDACTED]." },
          { who: 'player', text: "It's popped. You can say popped." },
          { who: 'redacted', text: "The [REDACTED] is [REDACTED]. Popped is [REDACTED]." }
        ] },
        { type: 'escape_wanted', setWanted: 3, text: 'The balloons have sirens. Even the popped one. Lose them' }
      ],
      outro: [
        { who: 'redacted', text: "Good. The [REDACTED] will be blamed on the weather. The weather will be blamed on you." },
        { who: 'player', text: "Respectfully, it was a balloon of my face." },
        { who: 'redacted', text: "It was a [REDACTED] of your [REDACTED]. Take this. It sticks. Like everything you say." },
        { who: 'kip', text: "I came down with the balloon. Slowly. It was nice. Is this paid?" }
      ],
      failOn: ['player_dead'],
      onComplete: { unlockWeapon: 'sticky', setFlag: 'balloon_popped' }
    },

    // ----------------------------------------------------------- Act III --
    {
      id: 'h01_casing', story: true, title: 'Casing the Hedge', act: 3,
      giver: 'gus', marker: 'pod_garage', requires: ['m12b_scope'], reward: 500,
      intro: [
        { who: 'gus', text: "Vaultwright sold your contract to the President, then kept it in his own vault. As a hedge. Vaultwright Capital, downtown." },
        { who: 'player', text: "We're robbing a bank?" },
        { who: 'gus', text: "We're retrieving a document. With a crew. And a board. I bought a board." },
        { who: 'sloane', text: "Case it first. Cameras, guards, the vault door. Three photos, then the board. Four minutes. Three." },
        { who: 'kip', text: "I've interned there. I've interned everywhere. Is this paid?" }
      ],
      objectives: [
        { type: 'drive_to', target: { landmark: 'vault_bank' }, vehicle: 'any', text: "Drive to Vaultwright Capital. Don't park like a robber" },
        { type: 'pickup', spawn: { pickupType: 'mission', count: 3, around: { landmark: 'vault_bank' }, radius: 120, label: ['CAMERA', 'GUARD ROTA', 'VAULT DOOR'] }, text: 'Photograph the cameras, the guard rota and the vault door' },
        { type: 'dialogue', lines: [
          { who: 'gus', text: "Cameras on the corners. Guards on the hour. The vault door is a hedge. A literal hedge. Behind it, a door." },
          { who: 'kip', text: "The guards are interns. They don't get paid either. We have a union. It's me." }
        ] },
        { type: 'drive_to', target: { landmark: 'pod_garage' }, vehicle: 'any', text: 'Back to the garage. The board is in the van' },
        { type: 'heist_board', heist: 'hedge_job', text: 'Pick an approach and a crew on the planning board' }
      ],
      outro: [
        { who: 'gus', text: "Approach picked. Crew picked. Nobody's in charge, so it's me." },
        { who: 'sloane', text: "Prep tomorrow. Job the day after. Ninety seconds of planning. Sixty." },
        { who: 'player', text: "Respectfully, this feels like a real crime." },
        { who: 'gus', text: "It's a retrieval. With a crew. You're peaking." },
        { who: 'kip', text: "I photographed the board. Is this paid?" }
      ],
      failOn: ['player_dead'],
      onComplete: { setFlag: 'heist_planned' }
    },

    {
      id: 'h02_prep', story: true, title: 'Prep Work', act: 3,
      giver: 'sloane', marker: 'pod_garage', requires: ['h01_casing'], reward: 500, heist: 'hedge_job',
      intro: [
        { who: 'sloane', text: "Prep day. Whatever you picked on the board, we need a vehicle and a costume. The board says which." },
        { who: 'player', text: "What did the board say?" },
        { who: 'sloane', text: "What you told it. That's what boards do. Two minutes each. One." },
        { who: 'gus', text: "Don't scratch anything we're about to use to commit a retrieval." }
      ],
      // the default (approach 'quiet'); heists.hedge_job.variants holds the other approaches' lists
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'van', tag: 'newsvan', at: { landmark: 'tyn_tower' }, color: '#c94040' }, text: "Borrow a Yell Network news van. They have forty. They won't count" },
        { type: 'escape_wanted', setWanted: 2, text: "TYN noticed. They're reporting it live. Lose them" },
        { type: 'pickup', spawn: { pickupType: 'mission', count: 4, around: { landmark: 'green_room' }, radius: 160, label: 'CREW LANYARD' }, text: 'Collect four crew lanyards from the Green Room Motel' },
        { type: 'drive_to', target: { landmark: 'pod_garage' }, vehicle: 'spawned:newsvan', text: "Park the news van at Gus's Garage" }
      ],
      outro: [
        { who: 'sloane', text: "Vehicle's in the bay. Costumes are on the hook. Tomorrow we do a segment inside a vault." },
        { who: 'player', text: "Respectfully, are we sure about this?" },
        { who: 'sloane', text: "Nobody's sure. Sure is for anchors." },
        { who: 'kip', text: "I laminated the plan. Is this paid?" }
      ],
      failOn: ['player_dead', 'vehicle_lost:newsvan', 'vehicle_lost:hedgetruck', 'vehicle_lost:drillvan'],
      onComplete: { unlockWeapon: 'spin_smoke', setFlag: 'heist_prepped' }
    },

    {
      id: 'h03_job', story: true, title: 'The Hedge Job', act: 3,
      giver: 'gus', marker: 'pod_garage', requires: ['h02_prep'], reward: 9000, heist: 'hedge_job',
      intro: [
        { who: 'gus', text: "Job day. The vault, the contract, and the cash Vaultwright keeps as a hedge. In, out, levels steady." },
        { who: 'sloane', text: "Crew's in position. Everyone knows their segment. Nobody improvises. You will improvise." },
        { who: 'player', text: "Respectfully, I'm a professional." },
        { who: 'gus', text: "You're a pundit. Same skill set. Talk fast and leave before anyone checks." }
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'van', tag: 'newsvan', at: { landmark: 'pod_garage' }, color: '#c94040' }, text: 'Get in the news van' },
        { type: 'drive_to', target: { landmark: 'vault_bank' }, vehicle: 'spawned:newsvan', text: "Drive to Vaultwright Capital. You're live in two minutes" },
        { type: 'goto', target: { landmark: 'vault_bank' }, radius: 32, text: "Park, get out and walk in with the camera crew. Smile. You're on" },
        { type: 'timer_wrap', seconds: 120, objectives: [
          { type: 'pickup', spawn: { pickupType: 'mission', count: 6, around: { landmark: 'vault_bank' }, radius: 90, label: ['THE CONTRACT', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE'] }, text: 'Grab the contract and the hedge cash before the segment ends' }
        ] },
        { type: 'dialogue', lines: [
          { who: 'vaultwright', text: "Mr. Takesworth. In my vault. On camera. I'm whispering *nine hundred thousand*. That's the alarm." },
          { who: 'gus', text: "That's our cue. Out the side door. Levels." }
        ] },
        { type: 'escape_wanted', setWanted: 3, text: "Lose the bank's private security, and the public kind" },
        { type: 'drive_to', target: { landmark: 'pod_garage' }, vehicle: 'any', text: 'Get the contract back to the garage' }
      ],
      outro: [
        { who: 'gus', text: "Contract's back. Your show. Your name. Read it." },
        { who: 'player', text: "Back page: 'Monday Memo subscription, auto-renew.' Signed... Respectfuly." },
        { who: 'sloane', text: "One L. You subscribed to your own memo." },
        { who: 'vaultwright', text: "I'm whispering *hedged*. The contract was always worth less than the cash. Keep both. I shorted you." },
        { who: 'kip', text: "I countersigned it. Thursday's tomorrow. Is this paid?" }
      ],
      failOn: ['player_dead', 'vehicle_lost:newsvan', 'vehicle_lost:hedgetruck'],
      onComplete: { unlockWeapon: 'lmg', setFlag: 'heist_done' }
    },

    {
      id: 'b05_dunk', story: true, title: 'Next Table Over', act: 3,
      giver: 'sloane', marker: 'campus_quad', requires: ['m13_thursday'], reward: 3000,
      intro: [
        { who: 'sloane', text: "Dunk's set up on the Quad. Next to your table. Bigger table. He's calling it a debate. It's a brawl with a sign." },
        { who: 'dunk', text: "Didn't read the calendar. Thursday's over. Replied anyway. Table to table, Takesworth. Bring cards." },
        { who: 'player', text: "Respectfully, Ptolemy, we're both on the list. Everyone's on the list." },
        { who: 'dunk', text: "Didn't read the list." },
        { who: 'gus', text: "He plays cards: shove, slam, flip. Counter the card, then hit him. He telegraphs. He's peaking." }
      ],
      objectives: [
        { type: 'goto', target: arena('b05_dunk'), radius: 160, text: "Get to Dunk's table on the Quad" },
        { type: 'boss', bossId: 'b05_dunk', text: "Brawl table to table: counter Dunk's cards, then hit back" },
        { type: 'dialogue', lines: [
          { who: 'dunk', text: "Didn't read it. Lost anyway." },
          { who: 'player', text: "You fought across nine tables." },
          { who: 'dunk', text: "Eight. The ninth was the Clip Joint's chair. The only chair. Didn't read the sign." }
        ] }
      ],
      outro: [
        { who: 'dunk', text: "Ratio'd. By a folding table. My chat is clipping it. My chat is clipping me losing. Engagement's up." },
        { who: 'player', text: "Respectfully, you were the content." },
        { who: 'dunk', text: "Everyone's the content. Take the Pile-On. It's what my chat does to people. Didn't read the manual." },
        { who: 'kip', text: "I sold nine tickets. Standing room. Is this paid?" }
      ],
      failOn: ['player_dead'],
      onComplete: { unlockWeapon: 'auto_shotgun', setFlag: 'dunk_ratiod' }
    },

    {
      id: 'b06_panel', story: true, title: 'The Undercard', act: 3,
      giver: 'chyron', marker: 'protest_plaza', requires: ['m13b_ratio'], reward: 3500,
      intro: [
        { who: 'chyron', text: "BREAKING. Undercard. Outdoor set. Five rounds. Between rounds: the audience." },
        { who: 'player', text: "The audience?" },
        { who: 'chyron', text: "Everyone's goons. Debate a round, survive a wave, debate a round. WE'LL HAVE TO LEAVE IT THERE. Eventually." },
        { who: 'sloane', text: "It's a rehearsal for tonight. Rehearsals are live now. Everything's live. Go." },
        { who: 'kip', text: "I'm the floor manager. Nobody told me. Is this paid?" }
      ],
      objectives: [
        { type: 'goto', target: arena('b06_panel'), radius: 160, text: "Get to The Yell Network's outdoor set past the plaza" },
        { type: 'boss', bossId: 'b06_panel', text: 'Win the undercard: debate rounds and audience waves, alternating' },
        { type: 'dialogue', lines: [
          { who: 'chyron', text: "BREAKING. Kid wins the undercard. The main event is tonight." },
          { who: 'goldplate', text: "I rate the undercard a ten. I was on it. I lost. I rate losing a ten." }
        ] }
      ],
      outro: [
        { who: 'chyron', text: "Five guests, five rounds, five waves. Ratings: yes. Tonight it's the real panel. Same guests. Same memo." },
        { who: 'player', text: "Respectfully, they all said the same thing every round." },
        { who: 'chyron', text: "That's the format. Here: the News Cycle, from the props department. Runs all day, like us. WE'LL HAVE TO LEAVE IT THERE." },
        { who: 'kip', text: "I counted the waves. Five. Is this paid?" }
      ],
      failOn: ['player_dead'],
      onComplete: { unlockWeapon: 'minigun', setFlag: 'undercard_won' }
    }
  ];

  // =================================================================== heists ==
  // heists.hedge_job is the design table (board text, roles, skills, per-approach objective lists). The story runtime
  // (GTP.Heist in 09_missions.js) reads P.heist, built from it below: {missions, approaches:[{id, name, hostiles, payout,
  // wanted, line}], crew:[{id, name, cut, perk}]}. heist:plan {approach, crew:[castIds]} picks the plan; 09 pays each heist
  // mission's reward x approach.payout x (1 - crew cuts, capped at 60%), multiplies defeat/survive counts by
  // approach.hostiles, and runs only the objectives whose `approach` tag matches the plan. h02/h03's objectives are
  // therefore all three approaches' lists, tagged (built at load from the mission's quiet list and `variants`).
  P.heists = {
    hedge_job: {
      id: 'hedge_job', name: 'The Hedge Job', target: 'vault_bank', missions: ['h01_casing', 'h02_prep', 'h03_job'],
      board: { title: 'THE HEDGE JOB', subtitle: 'A retrieval. With a crew.', note: 'Nobody is in charge, so Gus is.' },
      payout: { base: 12000, minimum: 2000 },
      roles: [
        { id: 'driver', name: 'Driver' }, { id: 'tech', name: 'Tech' }, { id: 'muscle', name: 'Muscle' }
      ],
      crew: [
        { castId: 'gus', role: 'driver', cut: 0.12, skill: 0.9, pitch: 'Drives like he mixes: steady. Will not shut up about levels.' },
        { castId: 'dunk', role: 'driver', cut: 0.05, skill: 0.4, pitch: "Cheap. Didn't read the route. Will take a wrong turn on purpose for the clip." },
        { castId: 'moonsworth', role: 'tech', cut: 0.2, skill: 0.85, pitch: 'Trustless encryption. Opens anything. Takes a big cut, in liquidity.' },
        { castId: 'kip', role: 'tech', cut: 0, skill: 0.55, pitch: 'Has interned in the bank IT department. Cut: zero. He will ask if it is paid.' },
        { castId: 'merle', role: 'muscle', cut: 0.15, skill: 0.9, pitch: 'Brings the gear. Sells it to both sides of the vault door.' },
        { castId: 'roz', role: 'muscle', cut: 0.08, skill: 0.6, pitch: 'Not muscle. A protest. Forty marchers in the lobby are better than muscle.' }
      ],
      approaches: [
        { id: 'quiet', name: 'Respectfully Quiet', payoutMul: 1.0, wanted: 3, guardsMul: 0.6,
          pitch: 'Sloane books a fake segment: LIVE FROM THE VAULT. The crew walks in as a camera crew with lanyards. Nobody stops a camera.' },
        { id: 'loud', name: 'Loud & Correct', payoutMul: 1.3, wanted: 4, guardsMul: 1.4,
          pitch: 'An armored hedge truck through the front door and the Ratio Launcher for the conversation. More cash, more stars.' },
        { id: 'both_sides', name: 'Both Sides', payoutMul: 1.15, wanted: 3, guardsMul: 1.0,
          pitch: 'A protest out front, both sides of it, while Gus drills in from the alley. Balance.' }
      ],
      // h02_prep / h03_job objective lists per approach (quiet is also the missions' own default list)
      variants: {
        loud: {
          h02_prep: [
            { type: 'enter_vehicle', spawn: { type: 'truck', tag: 'hedgetruck', at: { landmark: 'memo_press' }, color: '#e8b53a', wrap: 'hedge' }, text: "Take the Vaultwright hedge truck from the Print Works loading dock" },
            { type: 'escape_wanted', setWanted: 3, text: 'The hedge truck has a tracker. The tracker has a liaison. Lose them' },
            { type: 'equip', weaponId: 'hotmic', ammo: 4, text: "Pick up Merle's breaching mics" },
            { type: 'drive_to', target: { landmark: 'pod_garage' }, vehicle: 'spawned:hedgetruck', text: "Park the hedge truck at Gus's Garage" }
          ],
          h03_job: [
            { type: 'enter_vehicle', spawn: { type: 'truck', tag: 'hedgetruck', at: { landmark: 'pod_garage' }, color: '#e8b53a', wrap: 'hedge' }, text: 'Get in the hedge truck' },
            { type: 'drive_to', target: { landmark: 'vault_bank' }, vehicle: 'spawned:hedgetruck', text: 'Drive the hedge truck to Vaultwright Capital. Through the front' },
            { type: 'defeat', spawn: { ped: 'thug', count: 8, around: { landmark: 'vault_bank' }, radius: 140 }, text: 'Clear the lobby. The guards are interns with binders' },
            { type: 'timer_wrap', seconds: 90, objectives: [
              { type: 'pickup', spawn: { pickupType: 'mission', count: 6, around: { landmark: 'vault_bank' }, radius: 90, label: ['THE CONTRACT', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE'] }, text: 'Grab the contract and the hedge cash' }
            ] },
            { type: 'escape_wanted', setWanted: 4, text: 'Every cruiser in Chyron Center is coming. Lose them' },
            { type: 'drive_to', target: { landmark: 'pod_garage' }, vehicle: 'any', text: 'Get the contract back to the garage' }
          ]
        },
        both_sides: {
          h02_prep: [
            { type: 'drive_to', target: { landmark: 'protest_plaza' }, vehicle: 'any', text: 'Get to Perpetual Assembly Plaza' },
            { type: 'pickup', spawn: { pickupType: 'mission', count: 6, around: { landmark: 'protest_plaza' }, radius: 160, label: 'BOTH-SIDED SIGN' }, text: 'Collect six protest signs. Both sides of each' },
            { type: 'enter_vehicle', spawn: { type: 'van', tag: 'drillvan', at: { landmark: 'warehouse_42' }, color: '#7fbf6a' }, text: "Take the drill van from Warehouse 42" },
            { type: 'drive_to', target: { landmark: 'pod_garage' }, vehicle: 'spawned:drillvan', text: "Park the drill van at Gus's Garage" }
          ],
          h03_job: [
            { type: 'drive_to', target: { landmark: 'vault_bank' }, vehicle: 'any', text: 'Get to Vaultwright Capital' },
            { type: 'goto', target: { landmark: 'vault_bank' }, radius: 64, text: 'Get out on foot and start the protest' },
            { type: 'survive', seconds: 45, waves: { protester: 6, thug: 3 }, text: 'Hold the protest, both sides of it, while Gus drills' },
            { type: 'timer_wrap', seconds: 100, objectives: [
              { type: 'pickup', spawn: { pickupType: 'mission', count: 6, around: { landmark: 'vault_bank' }, radius: 90, label: ['THE CONTRACT', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE'] }, text: 'Through the drill hole: grab the contract and the hedge cash' }
            ] },
            { type: 'escape_wanted', setWanted: 3, text: 'Both sides are under arrest. Lose them' },
            { type: 'drive_to', target: { landmark: 'pod_garage' }, vehicle: 'any', text: 'Get the contract back to the garage' }
          ]
        }
      },
      lines: {
        planned: { quiet: 'Respectfully Quiet. Lanyards and a fake segment. Nobody stops a camera.', loud: 'Loud & Correct. The hedge truck through the front door.', both_sides: 'Both Sides. A protest out front, a drill out back.' },
        payout: "Take: ${take}. Crew cuts: ${cuts}. Kip's cut: zero. He asked."
      }
    }
  };

  (function buildHeist() {
    var H = P.heists.hedge_job, cast = GTP.Content.cast || {};
    P.heist = {
      id: H.id, name: H.name, missions: H.missions.slice(), board: H.board, roles: H.roles,
      approaches: H.approaches.map(function (a) { return { id: a.id, name: a.name, hostiles: a.guardsMul, payout: a.payoutMul, wanted: a.wanted, line: a.pitch }; }),
      crew: H.crew.map(function (c) { return { id: c.castId, name: cast[c.castId] ? cast[c.castId].name : c.castId, cut: c.cut, perk: c.role, role: c.role, skill: c.skill, line: c.pitch }; })
    };
    function tag(list, a) { return list.map(function (o) { var t = { approach: a }; for (var k in o) t[k] = o[k]; return t; }); }
    ['h02_prep', 'h03_job'].forEach(function (mid) {
      var m = null; for (var i = 0; i < P.missions.length; i++) if (P.missions[i].id === mid) m = P.missions[i];
      if (!m || m._tagged) return;
      m.objectives = tag(m.objectives, 'quiet').concat(tag(H.variants.loud[mid], 'loud'), tag(H.variants.both_sides[mid], 'both_sides'));
      Object.defineProperty(m, '_tagged', { value: true, enumerable: false });
    });
  })();

  // ============================================================= chain & acts ==
  P.chain = ['m00_intro', 'm01_van', 'm01c_both_sides', 'm01b_airport', 'm02_read', 'm03_ratio', 'm03b_range', 'm04_hit',
    'm05_peer', 'm05b_provenance', 'm06_rally', 'b01_goldplate', 'm07_listen', 'm07b_ferry', 'b02_velvetine', 'm08_scooters', 'm08b_jets',
    'b03_warbanner', 'm09_balloon', 'm09b_hotmic', 'b04_redacted', 'm10_pellets', 'm11_trustless',
    'm12_memo', 'm12b_scope', 'h01_casing', 'h02_prep', 'h03_job', 'm13_thursday', 'b05_dunk', 'm13b_ratio', 'b06_panel', 'm14_grift',
    'm15a_primetime', 'm15b_liveread'];
  P.acts = {
    1: ['m00_intro', 'm01_van', 'm01c_both_sides', 'm01b_airport', 'm02_read', 'm03_ratio', 'm03b_range', 'm04_hit'],
    2: ['m05_peer', 'm05b_provenance', 'm06_rally', 'b01_goldplate', 'm07_listen', 'm07b_ferry', 'b02_velvetine', 'm08_scooters', 'm08b_jets', 'b03_warbanner', 'm09_balloon', 'm09b_hotmic', 'b04_redacted', 'm10_pellets', 'm11_trustless'],
    3: ['m12_memo', 'm12b_scope', 'h01_casing', 'h02_prep', 'h03_job', 'm13_thursday', 'b05_dunk', 'm13b_ratio', 'b06_panel', 'm14_grift', 'm15a_primetime', 'm15b_liveread']
  };
  // the plan's "Story chain" table: new mission -> what it requires, and which existing mission now requires it
  P.requiresPatches = {
    m01c_both_sides: ['m01_van'], m01b_airport: ['m01c_both_sides'],
    b01_goldplate: ['m06_rally'], m07_listen: ['b01_goldplate'],
    b02_velvetine: ['m07b_ferry'], m08_scooters: ['b02_velvetine'],
    b03_warbanner: ['m08b_jets'], m09_balloon: ['b03_warbanner'],
    b04_redacted: ['m09b_hotmic'], m10_pellets: ['b04_redacted'],
    h01_casing: ['m12b_scope'], h02_prep: ['h01_casing'], h03_job: ['h02_prep'], m13_thursday: ['h03_job'],
    b05_dunk: ['m13_thursday'], m13b_ratio: ['b05_dunk'],
    b06_panel: ['m13b_ratio'], m14_grift: ['b06_panel']
  };

  // chapter cards: `chapter {act, title}` when an act's first mission starts (09 and the UI print "ACT I" before the title)
  P.chapters = [
    { id: 'act1', act: 1, title: 'Folding Table', subtitle: 'Minds changed so far: zero.', from: 'm00_intro' },
    { id: 'act2', act: 2, title: 'Four Clients', subtitle: 'Everyone wants the podcast. Everyone gets it.', from: 'm05_peer' },
    { id: 'act3', act: 3, title: 'The Monday Memo', subtitle: 'Respectfuly. One L.', from: 'm12_memo' }
  ];
  // cards inside an act (not acts: the story shows these only if it wants a mid-act card)
  P.interludes = [
    { id: 'heist', act: 3, title: 'Interlude: The Hedge Job', subtitle: 'A retrieval. With a crew.', from: 'h01_casing' },
    { id: 'finale', act: 3, title: 'Finale: Primetime or the Table', subtitle: 'Two minutes. One.', from: 'm14_grift' }
  ];
  P.actTitles = { 1: 'Folding Table', 2: 'Four Clients', 3: 'The Monday Memo' };

  // ==================================================================== calls ==
  // calls[missionId]: the phone call that pitches that mission, from its giver, when it becomes available
  function call(from, lines) { return { from: from, lines: lines.map(function (l) { return { who: l[0], text: l[1] }; }) }; }
  P.calls = {
    m00_intro: call('gus', [['gus', "Table's in 4B. I'm not carrying it. Come to the Quad. Follow the blue light."], ['player', 'Respectfully, Gus, I am on my way.'], ['gus', "You're peaking already. Impressive."]]),
    m01_van: call('sloane', [['sloane', 'Sloane Vexley. Producer. Yours, as of now. Gus\'s Garage has a van with your face on it.'], ['player', 'My face?'], ['sloane', 'Twice. Four minutes. Three.']]),
    m01c_both_sides: call('merle', [['merle', "Merle Firmness, Both Sides Arms, on the Strip. Dale's cousin. First gun's free."], ['player', "I don't need a gun to win an argument."], ['merle', 'Then come for the free part. Bag\'s ten dollars. For a journalist, five. Ten.']]),
    m01b_airport: call('sloane', [['sloane', 'The sponsor\'s mattress is landing at Goldplate International. We have an airport.'], ['player', 'Since when?'], ['sloane', 'Since the sponsor bought one. Garage. Four minutes. Three.']]),
    m02_read: call('firmness', [['firmness', 'Dale Firmness, Nap Dynasty. Come by the depot. Bring the van. Code TAKES20.'], ['player', 'What is the code for?'], ['firmness', 'For you, Bryce. Code YOU20.']]),
    m03_ratio: call('sloane', [['sloane', 'Dunk is quote-posting your read on the Impression Alley boards. Both boards.'], ['player', 'Respectfully, that\'s defamation.'], ['sloane', 'It\'s engagement. Go win it. Ninety seconds.']]),
    m03b_range: call('gus', [['gus', 'You keep swinging at people who are already leaving. Meet me at Merle\'s. Range out back.'], ['player', 'I have a free pistol.'], ['gus', 'You have a free pistol and no aim. That\'s a podcast.']]),
    m04_hit: call('chyron', [['chyron', 'BREAKING. Kid. Green Room Motel. Four minutes of airtime. Tonight.'], ['player', 'Four minutes on television?'], ['chyron', 'Four minutes of waiting. WE\'LL HAVE TO LEAVE IT THERE.']]),
    m05_peer: call('vaultwright', [['vaultwright', 'Mr. Takesworth. Fulcrum Foundation, Lobby Row. I am whispering *forty thousand*.'], ['player', 'Why are you whispering?'], ['vaultwright', 'It is rude to say numbers aloud. Come.']]),
    m05b_provenance: call('vaultwright', [['vaultwright', 'The Museum of Takes has acquired your table. Meet me at the Heirloom Club.'], ['player', 'My table is in a museum?'], ['vaultwright', 'Attributed. I am whispering *attributed*.']]),
    m06_rally: call('goldplate', [['goldplate', 'Takesworth! Big rally. The biggest. The stadium, both words. I need a young face.'], ['player', 'What do I say?'], ['goldplate', 'Whatever the memo says. Loudly. I rate your face a seven. Come.']]),
    b01_goldplate: call('sloane', [['sloane', 'Look up. Your show\'s new name is on a ribbon behind a gold helicopter.'], ['player', 'He renamed it AND flew it?'], ['sloane', 'Goldplate Tower. Ninety seconds. Bring something that hits a spool.']]),
    m07_listen: call('velvetine', [['velvetine', 'To you! To crates! The Listening Room, tonight!'], ['player', 'What is tonight?'], ['velvetine', 'Nothing! Nothing will be played! To whatever this is!']]),
    m07b_ferry: call('velvetine', [['velvetine', 'To the ferry! The mixtape must leave! The Ferry to Elsewhere, at the harbor!'], ['player', 'Didn\'t you pin a theft on me?'], ['velvetine', 'To forgiveness! To me forgiving you!']]),
    b02_velvetine: call('gus', [['gus', 'Forty speakers on that yacht and not one is on. Meet me at the pier.'], ['player', 'Is this about the Baron?'], ['gus', 'It\'s about levels. The Baron is collateral.']]),
    m08_scooters: call('warbanner', [['warbanner', 'Mr. Takesworth. Bravadia calls. The embassy. A tourism ad. And that\'s why we need the jets.'], ['player', 'How is a tourism ad about jets?'], ['warbanner', 'Everything is about jets. Come.']]),
    m08b_jets: call('warbanner', [['warbanner', 'The jets have arrived. Goldplate International. And that\'s why we need the jets.'], ['player', 'Plural?'], ['warbanner', 'One. In profile. Come.']]),
    b03_warbanner: call('roz', [['roz', 'WE\'RE NOT HERE TO CALL YOU. The flyover is today. Embassy. Bring your loudest.'], ['player', 'Which side are we on?'], ['roz', 'Both. I brought three signs.']]),
    m09_balloon: call('redacted', [['redacted', 'This call is not happening. Office of [REDACTED]. Thirteen antennas. Come alone.'], ['player', 'Who is this?'], ['redacted', '[REDACTED]. Come anyway.']]),
    m09b_hotmic: call('redacted', [['redacted', 'The [REDACTED] goes through customs now. Customs & Disclosures, the harbor.'], ['player', 'What do I bring?'], ['redacted', 'Nothing. We have [REDACTED]. It is on.']]),
    b04_redacted: call('kip', [['kip', 'I\'m in a balloon. A big one. The balloon depot, in the Printworks. Bring a pin.'], ['player', 'How did you get in a balloon?'], ['kip', 'I interned here. Is this paid?']]),
    m10_pellets: call('saffron', [['saffron', 'Bryce. Your voicemail sounds toxic. Clarity Barn. Pellets.'], ['player', 'What do pellets do?'], ['saffron', 'Clarity. And your doctor won\'t tell you that.']]),
    m11_trustless: call('moonsworth', [['moonsworth', 'Bro. Trustless. $PUNDIT launches today. The mining shed. Bring liquidity.'], ['player', 'What is liquidity?'], ['moonsworth', 'Your money, but trustless. Come.']]),
    m12_memo: call('gus', [['gus', 'We matched the typo. One L. Get to the garage. Roz is here.'], ['player', 'Roz is helping?'], ['gus', 'She says she isn\'t. That means yes.']]),
    m12b_scope: call('footnote', [['footnote', '[citation pending] The Museum of Takes. I have found where the opinion comes from.'], ['player', 'Where?'], ['footnote', 'Come and see. Bring patience. I will bring the rifle.']]),
    h01_casing: call('gus', [['gus', 'Your contract is in Vaultwright\'s vault. I bought a board. Garage.'], ['player', 'A board for what?'], ['gus', 'Planning. We\'re casing a bank. Respectfully.']]),
    h02_prep: call('sloane', [['sloane', 'Prep day. The board said what we need. Garage.'], ['player', 'What did it say?'], ['sloane', 'What you told it. Two minutes. One.']]),
    h03_job: call('gus', [['gus', 'Job day. Crew\'s ready. Levels are steady. Garage.'], ['player', 'Respectfully, I\'m nervous.'], ['gus', 'Good. Nervous is a level. Come.']]),
    m13_thursday: call('kip', [['kip', 'It\'s Thursday. I have to tell you something. Dorm 4B.'], ['player', 'Is this about being paid?'], ['kip', 'No. For once, no. Just come.']]),
    b05_dunk: call('sloane', [['sloane', 'Dunk has built a bigger table next to yours on the Quad. He\'s calling it a debate.'], ['player', 'Is it a debate?'], ['sloane', 'It\'s a brawl with a sign. Bring your fists. And your cards.']]),
    m13b_ratio: call('moonsworth', [['moonsworth', 'Pivot, bro. $PUNDIT is a launcher now. The container yard.'], ['player', 'How is a coin a launcher?'], ['moonsworth', 'Utility. Come point it at things.']]),
    b06_panel: call('chyron', [['chyron', 'BREAKING. The undercard. Outdoor set, by the plaza. Five guests, five rounds, one kid.'], ['player', 'Tonight?'], ['chyron', 'Before tonight. WE\'LL HAVE TO LEAVE IT THERE.']]),
    m14_grift: call('sloane', [['sloane', 'Chyron\'s panel. The tower. Five guests, one memo.'], ['player', 'The same memo?'], ['sloane', 'It\'s always the same memo. Two minutes. One.']]),
    m15a_primetime: call('chyron', [['chyron', 'BREAKING. The chair. It is yours. Come to the tower.'], ['player', 'Forever?'], ['chyron', 'Forever is a segment. WE\'LL HAVE TO LEAVE IT THERE.']]),
    m15b_liveread: call('gus', [['gus', 'Or. Dorm 4B. Eleven people. One memo, read out loud.'], ['player', 'What happens after?'], ['gus', 'You walk back. No van. You\'re not peaking. For once.']])
  };

  // =================================================================== retune ==
  // m01c gives the pistol for keeps, so m03b no longer takes its "loaner" back and m05 hands over the Footnote
  // instead of a second pistol (value null deletes the key)
  P.retune = {
    m05_peer: [
      { path: 'outro.3.text', value: "It was. Here's the Footnote. A small pistol, for a small hedge. I'm whispering *three fifty*." },
      { path: 'onComplete.unlockWeapon', value: 'pocket' }
    ],
    m03b_range: [
      { path: 'intro.1.text', value: "Range fee: fifty. For a journalist, forty. Fifty. Bring the free one. Six hecklers out back. Cardboard. They don't sue." },
      { path: 'objectives.0.text', value: 'Load the pistol Merle gave you' },
      { path: 'outro.0.text', value: "The cops rated the noise a four. Keep the pistol. You own it. I sold it to you for free." },
      { path: 'onComplete.takeWeapon', value: null }
    ]
  };

  // ============================================================ intro two-shots ==
  // specs for 24_content_expansion.js's cs_intro builder (see INTRO_SHOTS there)
  P.introShots = {
    m01c_both_sides: { camA: [7, 4, 8], camB: [3, 2, 4], split: 2, extras: [{ castId: 'sloane', at: [-2.4, 3], anim: 'idle' }], look: 'merle', note: 'neon target sign on; the podium by the door' },
    b01_goldplate: { camA: [-16, 10, 14], camB: [-5, 3, 5], split: 3, tilt: 0.5, extras: [{ castId: 'gus', at: [-3, 2] }], look: 'sloane', note: 'camA tilts up past the stadium mast; the gold helicopter and its ribbon cross the sky' },
    b02_velvetine: { camA: [-10, 5, -9], camB: [-3, 2, -3], split: 3, extras: [{ castId: 'velvetine', at: [6, -8], anim: 'talk' }], look: 'velvetine', note: 'the yacht behind, forty silent speakers on deck' },
    b03_warbanner: { camA: [9, 5, 9], camB: [3, 2, 4], split: 3, extras: [{ castId: 'warbanner', at: [-3, 1], anim: 'talk' }, { castId: 'sloane', at: [4, 3] }], look: 'warbanner', note: 'two embassy flags; scooters idling on the kerb' },
    b04_redacted: { camA: [8, 6, 8], camB: [3, 2, 3], split: 2, tilt: 0.6, extras: [{ castId: 'redacted', at: [-2.6, 1.4], anim: 'idle' }, { castId: 'gus', at: [3.6, 3] }], look: 'redacted', note: "Kip waves from the balloon's basket at the door; the balloon of Bryce's face fills the sky" },
    h01_casing: { camA: [9, 4, 9], camB: [4, 2, 4], split: 3, extras: [{ castId: 'sloane', at: [2, 3] }], look: 'gus', note: 'the planning board leans on the van' },
    h02_prep: { camA: [-9, 4, 8], camB: [-3, 2, 4], split: 2, extras: [{ castId: 'gus', at: [-3, 2] }], look: 'sloane' },
    h03_job: { camA: [10, 5, 10], camB: [4, 2, 4], split: 2, extras: [{ castId: 'sloane', at: [2, 3] }, { castId: 'kip', at: [3, 2], anim: 'wave' }], look: 'gus', note: 'the crew lined up in front of the bay' },
    b05_dunk: { camA: [-10, 6, 10], camB: [-4, 2, 5], split: 3, extras: [{ castId: 'dunk', at: [6, -6], anim: 'table' }, { castId: 'gus', at: [-4, -4] }], look: 'dunk', note: 'nine folding tables in frame; Dunk at the biggest one' },
    b06_panel: { camA: [-14, 8, 10], camB: [-5, 3, 4], split: 3, protesters: 6, extras: [{ castId: 'sloane', at: [3, 4] }], look: 'chyron', note: 'the plaza, a TYN rig behind; the audience is goons' }
  };

  // ================================================================== helpers ==
  P.weaponById = function (id) { for (var i = 0; i < P.weapons.length; i++) if (P.weapons[i].id === id) return P.weapons[i]; return null; };
  P.attachment = function (id) { for (var i = 0; i < P.attachments.length; i++) if (P.attachments[i].id === id) return P.attachments[i]; return null; };
  P.attachmentsFor = function (weaponId) {
    var w = P.weaponById(weaponId); if (!w) return [];
    return P.attachments.filter(function (a) { return w.attachments.indexOf(a.slot) >= 0 && a.fits.indexOf(w.class) >= 0; });
  };
  P.missionById = function (id) { for (var i = 0; i < P.missions.length; i++) if (P.missions[i].id === id) return P.missions[i]; return null; };
  P.call = function (missionId) { return P.calls[missionId] || null; };
  P.actOf = function (missionId) { for (var a in P.acts) if (P.acts[a].indexOf(missionId) >= 0) return +a; return null; };
  P.chapterFor = function (missionId) { var all = P.chapters.concat(P.interludes); for (var i = 0; i < all.length; i++) if (all[i].from === missionId) return all[i]; return null; };
  P.nextInChain = function (missionId) { var i = P.chain.indexOf(missionId); return i >= 0 && i + 1 < P.chain.length ? P.chain[i + 1] : null; };
  P.stock = function (ticker) { for (var i = 0; i < P.stocks.length; i++) if (P.stocks[i].ticker === ticker) return P.stocks[i]; return null; };
  P.property = function (id) { for (var i = 0; i < P.properties.length; i++) if (P.properties[i].id === id) return P.properties[i]; return null; };
  // the objectives a mission runs under an approach (untagged ones always run, as in GTP.Heist.objectiveRuns)
  P.heistObjectives = function (heistId, missionId, approach) {
    var m = P.missionById(missionId); if (!m) return null;
    return m.objectives.filter(function (o) { return o.approach == null || o.approach === approach || (Array.isArray(o.approach) && o.approach.indexOf(approach) >= 0); });
  };
  // the landmarks the world track adds in v0.3 (ids referenced here before they exist; the content test accepts them)
  P.pendingLandmarks = ['spin_doctor_strip', 'spin_doctor_port', 'lanyard_strip', 'lanyard_uptown', 'clip_joint',
    'safe_brownstone', 'safe_marina_loft', 'safe_suburb', 'safe_penthouse'];

  function setPath(obj, path, value) {
    var keys = path.split('.'), o = obj;
    for (var i = 0; i < keys.length - 1; i++) { o = o[keys[i]]; if (o == null) return false; }
    var k = keys[keys.length - 1];
    if (value === null) delete o[k]; else o[k] = value;
    return true;
  }

  // =================================================================== hooks ==
  // 1. the new missions join the expansion list, so every existing allMissions / missionById sees them
  var X = GTP.Content.expansion;
  P.register = function () {
    X = GTP.Content.expansion;
    if (!X || !Array.isArray(X.missions)) return false;
    var have = {}, i;
    for (i = 0; i < X.missions.length; i++) have[X.missions[i].id] = true;
    for (i = 0; i < P.missions.length; i++) if (!have[P.missions[i].id]) X.missions.push(P.missions[i]);
    // 2. retune (once; the m03b pistol handover)
    if (!P._retuned) {
      P._retuned = true;
      for (var mid in P.retune) {
        var m = (X.missionById && X.missionById(mid)) || null;
        if (!m) continue;
        P.retune[mid].forEach(function (r) { setPath(m, r.path, r.value); });
      }
    }
    // 3. cs_intro_<id> for the new missions, through the expansion's own builder
    if (X.introShots && typeof X.introScript === 'function') {
      for (var id in P.introShots) {
        if (!X.introShots[id]) X.introShots[id] = P.introShots[id];
        X.introScript(id, true);
      }
      if (P.retune.m03b_range && X.introShots.m03b_range) X.introScript('m03b_range', true);
    }
    return true;
  };
  P.register();
})();
