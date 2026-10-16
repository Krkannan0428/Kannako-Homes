/* Grand Theft Pundit: 01_config.js
 * GTP.C: every tunable constant and the render palette. Numbers here are the
 * knobs that change how the game feels; code elsewhere reads them, never
 * hard-codes them.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};

  var C = GTP.C = {
    // --- world geometry ---------------------------------------------------
    TILE: 32,                 // px per tile
    MAP_W: 128,               // tiles
    MAP_H: 128,               // tiles
    VIEW_W: 1280,             // logical viewport px
    VIEW_H: 720,
    STEP: 1 / 60,             // fixed simulation step (s)
    MAX_STEPS: 5,             // max steps per animation frame before dropping time
    MAX_FRAME_DT: 0.25,       // clamp wall-clock dt (s) when the tab stalls
    ACTIVE_RADIUS: 1600,      // px from player beyond which dynamic entities despawn
    CHUNK_TILES: 16,          // chunk cache: tiles per chunk edge (512 px)
    CHUNK_CACHE_MAX: 40,      // LRU cap on cached chunk canvases
    MAX_DPR: 2,               // cap devicePixelRatio for the backing store

    // --- camera -----------------------------------------------------------
    CAMERA: {
      smooth: 7,              // exponential follow rate (higher = snappier)
      leadFoot: 0.35,         // seconds of velocity to lead on foot
      leadVehicle: 0.75,      // seconds of velocity to lead in a vehicle
      maxLead: 260,           // px cap on lead offset
      zoomFoot: 1,
      zoomVehicle: 0.85,      // slight zoom-out while driving
      zoomSmooth: 2.5,
      shakeDecay: 6
    },

    // --- day clock --------------------------------------------------------
    DAY: {
      startClock: 10.5,       // hours (0..24) at new game
      secondsPerHour: 60,     // 1 game hour = 60 real seconds
      duskStart: 18.0,        // night ramps 0 -> 1 between dusk and dark
      darkStart: 21.0,
      dawnStart: 5.0,         // night ramps 1 -> 0 between dawn and day
      dayStart: 7.0
    },

    // --- player / peds ----------------------------------------------------
    PLAYER: { walk: 70, run: 140, radius: 9, hp: 100, accel: 900, startMoney: 250, enterRange: 48 },
    PED: { walk: 70, run: 140, radius: 8, hp: 60, accel: 900, separation: 14, knockdownSpeed: 60 },

    // --- physics feel (05_entities reads these) ---------------------------
    PHYS: {
      steerLerp: 14,          // steering input smoothing (1/s)
      steerFullSpeed: 90,     // px/s at which steering reaches full authority
      highSpeedSteerLoss: 0.3,// fraction of turn rate lost at top speed
      gripRate: 14,           // lateral slip decay = grip * gripRate (1/s)
      handbrakeGrip: 0.14,    // grip multiplier while the handbrake is held
      handbrake: 0.5,         // handbrake braking as a fraction of cls.brake
      drag: 0.32,             // air drag (fraction of speed per second)
      rolling: 40,            // rolling friction px/s^2 when coasting
      offroadSpeed: 0.62,     // top speed multiplier off the road
      offroadDrag: 2.4,       // drag multiplier off the road
      angDamp: 5,             // collision spin damping (1/s)
      torque: 0.55,           // collision spin strength
      tileRestitution: 0.28,  // bounce off walls
      carRestitution: 0.35,   // bounce between cars
      scrape: 0.985,          // tangential speed kept per wall contact
      damageSpeed: 70,        // impact speed (px/s) below which no damage
      damagePerSpeed: 0.16,   // hp per px/s above damageSpeed
      occupantHurtSpeed: 260, // impacts above this hurt the driver
      pedHitDamage: 8,        // base damage to a ped hit by a car
      pedHitDamagePerSpeed: 0.2,
      burnSeconds: 3,         // fire before the explosion
      explodeRadius: 110,
      explodePedDamage: 70,
      explodeVehicleDamage: 150,  // a touching car chain-reacts, one lane away is heavy damage
      explodeOccupantDamage: 90,
      corpseSeconds: 12,      // downed peds linger this long
      wreckSeconds: 40,       // wrecks linger this long
      bailSpeed: 120          // exiting above this speed knocks you down
    },

    // --- vehicles ---------------------------------------------------------
    // w = length along heading, h = width. Speeds in px/s, accel px/s^2,
    // turnRate rad/s at full steer, grip 0..1 = fraction of lateral velocity
    // removed per second scaled (handbrake lowers it).
    VEHICLES: {
      sedan:  { accel: 220, maxSpeed: 330, brake: 520, reverse: 120, turnRate: 2.6, grip: 0.86, hp: 100, w: 44, h: 22, seats: 4, mass: 1.0, colors: ['#c94040', '#3d6fcf', '#d8d8d8', '#2b2b2b', '#7a5c3a', '#2f9e6a', '#e8b53a'] },
      sports: { accel: 320, maxSpeed: 440, brake: 560, reverse: 130, turnRate: 3.0, grip: 0.9,  hp: 80,  w: 42, h: 20, seats: 2, mass: 0.9, colors: ['#ff2d6f', '#ffd400', '#15e0ff', '#1a1a1a', '#ff7a00'] },
      suv:    { accel: 200, maxSpeed: 310, brake: 500, reverse: 110, turnRate: 2.3, grip: 0.84, hp: 140, w: 48, h: 24, seats: 4, mass: 1.3, colors: ['#1d1d1d', '#5c5c5c', '#8a2f2f', '#2a4a6e', '#e6e6e6'] },
      truck:  { accel: 140, maxSpeed: 260, brake: 420, reverse: 90,  turnRate: 1.8, grip: 0.8,  hp: 220, w: 64, h: 26, seats: 2, mass: 2.2, colors: ['#9c9c9c', '#b65a1f', '#2d5f8a', '#4c4c4c'] },
      van:    { accel: 170, maxSpeed: 280, brake: 460, reverse: 100, turnRate: 2.1, grip: 0.82, hp: 160, w: 52, h: 24, seats: 3, mass: 1.5, colors: ['#f2f2f2', '#2c3e7a', '#8e3a8e', '#3a8e5e', '#d14b4b'] },
      cop:    { accel: 280, maxSpeed: 400, brake: 560, reverse: 130, turnRate: 2.9, grip: 0.9,  hp: 120, w: 46, h: 22, seats: 4, mass: 1.1, colors: ['#f4f4f4'] },
      taxi:   { accel: 230, maxSpeed: 340, brake: 520, reverse: 120, turnRate: 2.7, grip: 0.86, hp: 100, w: 44, h: 22, seats: 4, mass: 1.0, colors: ['#ffc21a'] },
      bus:    { accel: 110, maxSpeed: 230, brake: 380, reverse: 80,  turnRate: 1.5, grip: 0.8,  hp: 300, w: 80, h: 26, seats: 8, mass: 3.0, colors: ['#e8e2c8', '#3b7bd3'] },
      bike:   { accel: 300, maxSpeed: 380, brake: 480, reverse: 60,  turnRate: 3.6, grip: 0.95, hp: 40,  w: 26, h: 12, seats: 1, mass: 0.4, colors: ['#1a1a1a', '#c0392b', '#f1c40f'] }
    },

    // --- wanted / police (AI module reads these) --------------------------
    WANTED: {
      thresholds: [2, 6, 12, 20, 30],
      decayDelay: 4,          // seconds without cop LOS before heat decays
      decayRate: 1.2,         // heat per second once decaying
      heat: { hitPed: 1, killPed: 3, shootNearCop: 2, stealOccupied: 2, stealSeen: 1, destroyVehicle: 3, attackCop: 5 },
      sprayCost: 300
    },

    // --- spawner budgets --------------------------------------------------
    SPAWN: { peds: 60, vehicles: 30, pedRadius: [500, 1100], vehicleRadius: [600, 1300] },

    // --- palette ----------------------------------------------------------
    // The city is a neon-noir cable-news town: cool asphalt, warm sodium
    // light, saturated roof colors per district, teal water.
    PAL: {
      bg: '#06070d',
      void: '#04050a',
      road: '#2c2f38',
      roadDark: '#262930',
      roadLine: '#d9d6c8',
      roadLineYellow: '#e6b63c',
      roadCrosswalk: '#e4e2d6',
      highway: '#30333c',
      shoulder: '#5a5d66',
      barrier: '#9ea3ad',
      sidewalk: '#8f919a',
      sidewalkLine: '#7d8089',
      curb: '#5e616a',
      curbLight: '#b2b5bd',
      grass: '#3f7a3a',
      grassDark: '#356b31',
      grassLight: '#4c8a44',
      sand: '#d8c48a',
      sandDark: '#c7b277',
      water: '#1b5a7a',
      waterDeep: '#154a66',
      waterLight: '#2f7fa4',
      foam: '#b9e6f4',
      parking: '#45484f',
      parkingLine: '#d0cfc5',
      plaza: '#a6a3a0',
      plazaLine: '#948f8c',
      dock: '#8a6a44',
      dockLine: '#6e5436',
      bridge: '#4a4d57',
      bridgeRail: '#c3c6cc',
      shadow: 'rgba(0,0,0,0.38)',
      wall: '#1f2128',
      treeShadow: 'rgba(0,0,0,0.3)',
      tree: ['#2f6b2c', '#3a7d34', '#2c7a4a', '#5b7f2a'],
      treeLight: ['#4f9a44', '#5aa64e', '#48a06a', '#86ad3c'],
      lamp: '#c9ccd4',
      lampGlow: 'rgba(255,196,90,0.55)',
      night: 'rgba(18,22,66,1)',
      buildingRoofs: {
        downtown: ['#4a4f63', '#3c4258', '#555a70', '#2f3346', '#61677f', '#434a66'],
        office: ['#6a6150', '#5f5a4e', '#73685a', '#5a554b'],
        campus: ['#8a4a3a', '#95553f', '#7e4536', '#a06a4a'],
        suburb: ['#7a4f3a', '#8c5a44', '#6b6b6b', '#5d4a3f', '#8a7a5a', '#4e5e6e'],
        industrial: ['#7c7f85', '#8b8c86', '#6f7378', '#9a9284', '#7d8a90'],
        capitol: ['#d6cfbd', '#cfc6b0', '#e0d9c7', '#c9bfa8'],
        strip: ['#b02a7b', '#2a8ab0', '#c9a227', '#3a3a3a', '#7a2ab0', '#2ab08a'],
        hills: ['#b5643c', '#c0714a', '#a85a36', '#c9834f'],
        marina: ['#6f5a44', '#8a6f52', '#5c6e7a', '#9a8464']
      },
      roofDetail: '#9a9ea8',
      roofDetailDark: '#55585f',
      helipad: '#d8d8d8',
      glass: '#6fb7d8',
      pool: '#39b6e8',
      neon: ['#ff3fa4', '#2ee6ff', '#ffbe3c', '#9dff3c', '#ff6a3c']
    }
  };

  // Per-district building generation styles. Content world may override
  // through GTP.Content.world.districtStyles (merged at generate time).
  C.DISTRICT_STYLES = {
    downtown:   { lotW: [4, 7], lotH: [4, 7], gap: 0, alleyChance: 0.35, height: [16, 30], roof: 'tower', roofMix: { tower: 0.6, office: 0.4 }, remnant: 'plaza', trees: 0.15, lamps: true },
    strip:      { lotW: [4, 8], lotH: [4, 6], gap: 1, alleyChance: 0.5, height: [10, 18], roof: 'casino', roofMix: { casino: 0.7, office: 0.3 }, remnant: 'parking', trees: 0.1, lamps: true },
    campus:     { lotW: [5, 8], lotH: [4, 6], gap: 1, alleyChance: 0.8, height: [8, 12], roof: 'brick', roofMix: { brick: 1 }, remnant: 'grass', trees: 0.7, lamps: true },
    suburb:     { lotW: [3, 4], lotH: [3, 4], gap: 1, alleyChance: 1, height: [6, 8], roof: 'house', roofMix: { house: 1 }, remnant: 'grass', trees: 0.5, lamps: false },
    industrial: { lotW: [6, 10], lotH: [4, 7], gap: 1, alleyChance: 0.6, height: [8, 12], roof: 'warehouse', roofMix: { warehouse: 0.8, factory: 0.2 }, remnant: 'yard', trees: 0.05, lamps: true },
    capitol:    { lotW: [5, 8], lotH: [4, 6], gap: 1, alleyChance: 0.9, height: [10, 14], roof: 'stone', roofMix: { stone: 1 }, remnant: 'grass', trees: 0.6, lamps: true },
    hills:      { lotW: [4, 6], lotH: [4, 5], gap: 2, alleyChance: 1, height: [8, 10], roof: 'mansion', roofMix: { mansion: 1 }, remnant: 'grass', trees: 0.6, lamps: false },
    marina:     { lotW: [3, 5], lotH: [3, 4], gap: 1, alleyChance: 0.8, height: [6, 8], roof: 'shack', roofMix: { shack: 1 }, remnant: 'plaza', trees: 0.25, lamps: true }
  };
})();
