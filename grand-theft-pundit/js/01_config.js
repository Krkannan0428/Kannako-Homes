/* Grand Theft Pundit: 01_config.js
 * GTP.C: every tunable constant and the render palette. Numbers here are the
 * knobs that change how the game feels; code elsewhere reads them, never
 * hard-codes them. Units: meters, seconds, radians. x east, z south, y up.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};

  var C = GTP.C = {
    // --- world geometry ---------------------------------------------------
    TILE: 4,                  // meters per tile
    MAP_W: 224,               // tiles (896 m; the expansion grew the city from 160: three new landmasses east and south)
    MAP_H: 224,               // tiles
    STEP: 1 / 60,             // fixed simulation step (s)
    MAX_STEPS: 5,             // max steps per animation frame before dropping time
    MAX_FRAME_DT: 0.25,       // clamp wall-clock dt (s) when the tab stalls
    CHUNK_TILES: 16,          // static chunk edge in tiles (64 m)
    CURB_H: 0.12,             // sidewalks and plazas sit this high above the asphalt
    DECK_Y: 7,                // elevated Loop deck height
    DECK_THICK: 0.7,          // deck slab thickness
    WATER_Y: -1.2,            // sea level
    FLOOR_H: 3.2,             // one building floor
    RAMP_LEN: 9,              // ramp length in tiles (36 m climb to the deck)
    MAX_DPR: 2,

    // --- quality ----------------------------------------------------------
    // C.QUALITY is the LIVE object every module reads (identity never changes; Render.quality.set mutates it in place).
    // The first keys are common to every preset; QUALITY_PRESETS below overlays the per-preset keys. The draw ranges
    // sit inside the fog, which buys a denser street; prebuildPerCall = chunks per loading-screen step.
    QUALITY: {
      preset: 'medium',
      drawDistance: 260, fogStart: 120, shadowBox: 120, pedDraw: 110, vehicleDraw: 200, prebuildPerCall: 3,
      // overlaid from the preset:
      shadows: true, shadowMap: 1024, softShadows: false, anisotropy: 4,
      post: true, ssao: false, ssaoSamples: 12, bloom: true, fxaa: true, grain: false,
      pointLights: 0, headlights: 1, weatherFx: true, rainCount: 900, puddles: 24,
      normalMaps: true, envMap: true, clearcoat: false, lodDistance: 120, clouds: true
    },
    // Presets (GTP.Render.quality.set(name) applies one; 'auto' starts at medium and steps down when the measured
    // frame time stays above QUALITY_AUTO.slowMs for QUALITY_AUTO.slowSeconds). Headless boots default to low unless
    // ?quality= says otherwise. low: no post, no shadows, emissive-only night. medium: shadows 1024, FXAA, bloom.
    // high: SSAO, soft shadows 2048, real lamp / headlight lights, weather fx. ultra: shadows 4096, more lights, full SSAO.
    QUALITY_PRESETS: {
      low:    { shadows: false, shadowMap: 1024, softShadows: false, anisotropy: 2,  post: false, ssao: false, ssaoSamples: 8,  bloom: false, fxaa: false, grain: false, pointLights: 0,  headlights: 0, weatherFx: false, rainCount: 400,  puddles: 0,  normalMaps: false, envMap: true, clearcoat: false, lodDistance: 90,  clouds: true },
      medium: { shadows: true,  shadowMap: 1024, softShadows: false, anisotropy: 4,  post: true,  ssao: false, ssaoSamples: 8,  bloom: true,  fxaa: true,  grain: false, pointLights: 0,  headlights: 1, weatherFx: true,  rainCount: 900,  puddles: 24, normalMaps: true,  envMap: true, clearcoat: false, lodDistance: 120, clouds: true },
      high:   { shadows: true,  shadowMap: 2048, softShadows: true,  anisotropy: 8,  post: true,  ssao: true,  ssaoSamples: 12, bloom: true,  fxaa: true,  grain: true,  pointLights: 8,  headlights: 4, weatherFx: true,  rainCount: 1600, puddles: 40, normalMaps: true,  envMap: true, clearcoat: true,  lodDistance: 150, clouds: true },
      ultra:  { shadows: true,  shadowMap: 4096, softShadows: true,  anisotropy: 16, post: true,  ssao: true,  ssaoSamples: 16, bloom: true,  fxaa: true,  grain: true,  pointLights: 12, headlights: 6, weatherFx: true,  rainCount: 2400, puddles: 60, normalMaps: true,  envMap: true, clearcoat: true,  lodDistance: 200, clouds: true }
    },
    QUALITY_AUTO: { start: 'medium', slowMs: 22, slowSeconds: 5, cooldown: 12 },

    // --- weather (Render.weather; GDD: a slow cycle, clear / overcast / rain) ---
    WEATHER: {
      start: 'clear',
      transition: 40,            // seconds to blend between states
      holdHours: [3, 8],         // game hours a state lasts before the cycle rolls the next one
      odds: { clear: 0.55, overcast: 0.27, rain: 0.18 },
      wetRise: 0.07,             // wetness gained per second of rain
      wetDry: 0.0045,            // wetness lost per second once the rain stops (about four minutes to dry)
      wetRoughness: 0.32,        // ground roughness multiplier when soaked (dry 1.0)
      rainFall: 15,              // m/s
      rainBox: 18,               // half-size of the streak volume around the camera
      fogStartWet: 0.62          // fog near as a fraction of the dry value in rain
    },

    // --- camera (the GTA feel lives here) ---------------------------------
    CAMERA: {
      fov: 60,
      footDist: 4.2, footHeight: 1.9, footLookHeight: 1.25,
      carDist: 7.5, carHeight: 3.0, busDist: 10, truckDist: 9,
      carPitch: 0.14, carAutoYawDelay: 0.7, carAutoYawRate: 3.2, reverseFlipDelay: 0.5,
      rollMax: 0.05, rollDamp: 4,
      closeScale: 0.5,
      aimDist: 2.0, aimSide: 0.7, aimHeight: 1.85, aimLookHeight: 1.5, aimFov: 50,   // over the right shoulder, a touch above head height so the gun hand and the target both read
      pitchMin: -20 * Math.PI / 180, pitchMax: 60 * Math.PI / 180,
      lookSens: 0.0032,         // radians per pixel of mouse delta
      autoYawDelay: 1.2,        // seconds without look input before the camera eases behind movement
      autoYawRate: 2.2,         // 1/s
      posDamp: 12, yawDamp: 6, fovDamp: 4,
      fovSpeedMax: 75, fovSpeedAt: 35,
      collisionPad: 0.3,
      shakeDecay: 5
    },

    // --- day clock --------------------------------------------------------
    DAY: {
      startClock: 17.5,       // 17:30, a sunset first frame
      secondsPerHour: 90,     // 1 game hour = 90 real seconds
      sunrise: 6.2, sunset: 19.6,
      duskStart: 18.0, darkStart: 20.5, dawnStart: 5.0, dayStart: 7.0
    },

    // --- player / peds ----------------------------------------------------
    PLAYER: { walk: 2.6, run: 6.5, radius: 0.4, height: 1.8, eye: 1.6, hp: 100, accel: 30, startMoney: 250, enterRange: 3, jump: 1.1, stepUp: 0.5 },
    PED: { walk: 1.6, run: 5.5, radius: 0.4, height: 1.8, hp: 60, accel: 20, separation: 0.9, knockdownSpeed: 4, getUp: 2.5 },

    // --- physics feel (06_entities reads these) ---------------------------
    PHYS: {
      gravity: 22,
      steerLerp: 10, drag: 0.012, rolling: 1.2,
      gripRate: 12,             // lateral slip decay = grip * gripRate (1/s)
      handbrakeBrake: 0.55,     // handbrake deceleration as a fraction of cls.brake
      accelTaper: 0.25,         // acceleration lost at top speed (fraction)
      maxYawRate: 2.4,          // rad/s steering cap
      spinDamp: 3.5,            // collision spin decay (1/s)
      spinKick: 0.9,            // collision spin per m/s of impact (scaled by lever arm)
      scrape: 0.92,             // tangential velocity kept on a wall hit
      restitution: 0.3, carRestitution: 0.35,
      damageSpeed: 5, damagePerSpeed: 2.2,
      occupantHurtSpeed: 14, occupantHurtPerSpeed: 1.2,
      landDamageSpeed: 7, landDamagePerSpeed: 3,
      pedHitDamage: 8, pedHitDamagePerSpeed: 4,
      burnSeconds: 3, explodeRadius: 8, explodePedDamage: 70, explodeVehicleDamage: 150, explodeOccupantDamage: 35,
      corpseSeconds: 10, wreckSeconds: 60, offroadSpeed: 0.7,
      sinkSeconds: 3, swim: 1.3, swimRun: 1.9, climbOut: 1.6,
      bailSpeed: 6,             // exiting faster than this knocks the ped down
      knockSpeed: 5.5,          // a car this fast knocks over lamp posts, hydrants, bins, benches and tables (trees and signals stand)
      knockSlow: 0.78,          // speed kept through a knocked prop
      enterWalk: 0.4,           // seconds of door walk before the seat
      skidLateral: 3.5,         // lateral slip (m/s) that leaves skid marks
      pedSeparation: 0.9
    },

    // --- vehicles ---------------------------------------------------------
    // accel m/s^2, maxSpeed m/s, steerMax rad, grip 0..1 lateral bleed per step scale.
    VEHICLES: {
      sedan:  { accel: 10, maxSpeed: 38, reverseMax: 10, brake: 22, steerMax: 0.62, steerSpeedFalloff: 0.55, grip: 0.9,  driftGrip: 0.25, mass: 1300, hp: 100, length: 4.5, width: 1.9, height: 1.45, seats: 4, wheelRadius: 0.33, colors: ['#c94040', '#3d6fcf', '#d8d8d8', '#2b2b2b', '#7a5c3a', '#2f9e6a', '#e8b53a'] },
      sports: { accel: 14, maxSpeed: 52, reverseMax: 12, brake: 26, steerMax: 0.66, steerSpeedFalloff: 0.6,  grip: 0.94, driftGrip: 0.2,  mass: 1200, hp: 80,  length: 4.3, width: 1.9, height: 1.2,  seats: 2, wheelRadius: 0.34, colors: ['#ff2d6f', '#ffd400', '#15e0ff', '#1a1a1a', '#ff7a00'] },
      suv:    { accel: 8,  maxSpeed: 36, reverseMax: 10, brake: 20, steerMax: 0.58, steerSpeedFalloff: 0.5,  grip: 0.88, driftGrip: 0.3,  mass: 2100, hp: 140, length: 4.9, width: 2.0, height: 1.8,  seats: 4, wheelRadius: 0.38, colors: ['#1d1d1d', '#5c5c5c', '#8a2f2f', '#2a4a6e', '#e6e6e6'] },
      truck:  { accel: 5,  maxSpeed: 28, reverseMax: 7,  brake: 16, steerMax: 0.5,  steerSpeedFalloff: 0.45, grip: 0.85, driftGrip: 0.35, mass: 6000, hp: 220, length: 7.5, width: 2.4, height: 3.0,  seats: 2, wheelRadius: 0.5,  colors: ['#9c9c9c', '#b65a1f', '#2d5f8a', '#4c4c4c'] },
      van:    { accel: 7,  maxSpeed: 32, reverseMax: 9,  brake: 18, steerMax: 0.56, steerSpeedFalloff: 0.5,  grip: 0.86, driftGrip: 0.3,  mass: 2400, hp: 160, length: 5.4, width: 2.1, height: 2.3,  seats: 3, wheelRadius: 0.36, colors: ['#f2f2f2', '#2c3e7a', '#8e3a8e', '#3a8e5e', '#d14b4b', '#d9cfa6'] },
      cop:    { accel: 12, maxSpeed: 46, reverseMax: 11, brake: 26, steerMax: 0.64, steerSpeedFalloff: 0.58, grip: 0.93, driftGrip: 0.25, mass: 1500, hp: 120, length: 4.8, width: 1.9, height: 1.5,  seats: 4, wheelRadius: 0.34, colors: ['#f4f4f4'] },
      taxi:   { accel: 9,  maxSpeed: 39, reverseMax: 10, brake: 22, steerMax: 0.62, steerSpeedFalloff: 0.55, grip: 0.9,  driftGrip: 0.25, mass: 1300, hp: 100, length: 4.5, width: 1.9, height: 1.5,  seats: 4, wheelRadius: 0.33, colors: ['#ffc21a'] },
      bus:    { accel: 4,  maxSpeed: 26, reverseMax: 6,  brake: 14, steerMax: 0.46, steerSpeedFalloff: 0.4,  grip: 0.84, driftGrip: 0.4,  mass: 9000, hp: 300, length: 10,  width: 2.5, height: 3.2,  seats: 8, wheelRadius: 0.5,  colors: ['#e8e2c8', '#3b7bd3'] },
      bike:   { accel: 12, maxSpeed: 45, reverseMax: 3,  brake: 20, steerMax: 0.75, steerSpeedFalloff: 0.65, grip: 0.95, driftGrip: 0.3,  mass: 250,  hp: 40,  length: 2.1, width: 0.7, height: 1.1,  seats: 1, wheelRadius: 0.32, colors: ['#1a1a1a', '#c0392b', '#f1c40f'] }
    },

    // --- AI budgets -------------------------------------------------------
    PEDS_TARGET: 76,
    CARS_TARGET: 40,
    ACTIVE_RADIUS: 220,
    SPAWN: { pedRadius: [40, 140], vehicleRadius: [60, 180] },

    // --- wanted / police --------------------------------------------------
    WANTED: {
      thresholds: [2, 6, 12, 20, 30],
      decayDelay: 4,
      decayRate: 1.2,
      heat: { hitPed: 1, killPed: 3, shootNearCop: 2, stealOccupied: 2, stealSeen: 1, destroyVehicle: 3, attackCop: 5, ramCop: 3 },   // ramCop: a cop knocked over by the player's car (rate-limited, see C.AI.heatEvery)
      sprayCostPerStar: 100
    },

    // --- economy ----------------------------------------------------------
    ECONOMY: { deathCashLoss: 0.1, bustedFine: 500, startMoney: 250 },

    // --- palette ----------------------------------------------------------
    // Neon-noir cable-news town: cool asphalt, warm sodium light, teal water.
    PAL: {
      asphalt: '#2f3238', asphaltLight: '#3a3d44', asphaltDark: '#25272c',
      laneWhite: '#dcd9cc', laneYellow: '#e2b43a',
      crosswalk: '#e6e3d8',
      sidewalk: '#9b9ca3', sidewalkLine: '#84858c', sidewalkDark: '#8b8c93',
      curb: '#6c6e75', curbLight: '#b6b8bf',
      grass: '#4a8a3c', grassDark: '#3b7330', grassLight: '#5c9e48',
      sand: '#d9c58c', sandDark: '#c6b079',
      water: '#1e6a8c', waterDeep: '#174f6b', waterLight: '#2f8fb5', foam: '#bfe8f4',
      concrete: '#8d8f94', concreteDark: '#5f6166', concreteLight: '#b3b5ba',
      barrier: '#b8bac0', barrierStripe: '#e3b23a',
      parking: '#34363c', parkingLine: '#d7d6cb',
      runway: '#262930', runwayLine: '#e8e6dc', runwayNumber: '#f2efe4', apronLine: '#e2b43a',
      containers: ['#c94040', '#3d6fcf', '#2f9e6a', '#e2b43a', '#8e3a8e', '#6f7378'],
      planeGold: '#e8b53a', planeTrim: '#f4efe4',
      plaza: '#a9a6a1', plazaLine: '#938f8a', plazaWarm: '#b8ad9a',
      path: '#c2b391',
      dock: '#8a6a44', dockLine: '#6e5436',
      gravel: '#7e7a72',
      roofs: ['#4a4f63', '#5a5d66', '#6b6660', '#4f5a62', '#5e5648', '#484c55', '#6d6a5a'],
      roofGravel: '#6f6c66',
      facades: {
        downtown: ['#4f6b8a', '#3e5873', '#5b7a9c', '#2f4a66', '#6a7f93', '#46617b'],
        campus: ['#8a4a3a', '#95553f', '#7e4536', '#a06a4a', '#8f5a44'],
        suburbs: ['#d9d1bc', '#c9d7d9', '#e0c9a6', '#b9c7b2', '#e6dccf', '#cdb9b1'],
        industrial: ['#7c7f85', '#8b8c86', '#6f7378', '#9a9284', '#7d8a90'],
        marina: ['#f0d2d0', '#d3e8e4', '#f4e4b8', '#cfd9f0', '#f2cfae', '#dfe9c9'],
        capitol: ['#d6cfbd', '#cfc6b0', '#e0d9c7', '#c9bfa8'],
        strip: ['#b02a7b', '#2a8ab0', '#c9a227', '#3a3a3a', '#7a2ab0', '#2ab08a'],
        stadium: ['#9ea1a8', '#8b8e95', '#a9acb3'],
        mansion: ['#efe4cd', '#f1e9d8', '#e9dcc2', '#f3ead9'],
        // expansion districts (GDD_EXPANSION §1.1)
        brownstone: ['#7a4a35', '#8a5a40', '#6e4030', '#9a6a4a', '#5e3a2a'],
        airport: ['#dfe3e8', '#c9d3dc', '#eef1f4'],
        port: ['#6f7378', '#8b5a3c', '#3f6f8a', '#8a8a7a']
      },
      neon: ['#ff3fa4', '#2ee6ff', '#ffbe3c', '#9dff3c', '#ff6a3c', '#b56bff'],
      windowLit: '#ffd98a', windowLitCool: '#bfe3ff', windowDark: '#1b2230',
      lamp: '#c9ccd4', lampGlow: '#ffc45a',
      tree: ['#2f6b2c', '#3a7d34', '#2c7a4a', '#5b7f2a', '#467a30'],
      trunk: '#5a3f2a',
      gold: '#e8b53a'
    },

    // --- sky / lighting by time of day (Render interpolates) ---------------
    SKY: {
      day:    { top: '#3f7fd6', horizon: '#bcd7ee', sun: '#fff4d6', fog: '#b9cde0', hemiSky: '#9fc3f0', hemiGround: '#6c6a5c', sunI: 1.25, hemiI: 0.65, ambient: 0.0 },
      sunset: { top: '#3f4790', horizon: '#ff8a44', sun: '#ff9a50', fog: '#e89a6c', hemiSky: '#c88aa8', hemiGround: '#5c4f44', sunI: 0.95, hemiI: 0.55, ambient: 0.0 },
      night:  { top: '#05070f', horizon: '#1b2240', sun: '#8aa0d8', fog: '#0c1020', hemiSky: '#263160', hemiGround: '#111318', sunI: 0.16, hemiI: 0.32, ambient: 0.0 }
    }
  };

  // Per-district filler styles: lot sizes in tiles, floors, facade style key,
  // ground remnant, tree density, lamps. GTP.Content.world.districtStyles may override.
  C.DISTRICT_STYLES = {
    downtown:   { lotW: [3, 6], lotH: [3, 6], gap: 0, alleyChance: 0.3, floors: [5, 20], facade: 'downtown', roof: 'flat', remnant: 'plaza', trees: 0.15, lamps: true, signals: true },
    strip:      { lotW: [3, 6], lotH: [3, 5], gap: 1, alleyChance: 0.5, floors: [2, 5], facade: 'strip', roof: 'flat', remnant: 'parking', trees: 0.1, lamps: true, signals: true },
    campus:     { lotW: [4, 7], lotH: [3, 5], gap: 1, alleyChance: 0.8, floors: [2, 4], facade: 'campus', roof: 'flat', remnant: 'grass', trees: 0.7, lamps: true, signals: false },
    suburbs:    { lotW: [2, 3], lotH: [2, 3], gap: 1, alleyChance: 1, floors: [1, 2], facade: 'suburbs', roof: 'gable', remnant: 'grass', trees: 0.5, lamps: false, signals: false },
    industrial: { lotW: [5, 9], lotH: [4, 6], gap: 1, alleyChance: 0.6, floors: [2, 3], facade: 'industrial', roof: 'flat', remnant: 'gravel', trees: 0.05, lamps: true, signals: false },
    capitol:    { lotW: [4, 7], lotH: [3, 5], gap: 1, alleyChance: 0.9, floors: [3, 5], facade: 'capitol', roof: 'flat', remnant: 'grass', trees: 0.6, lamps: true, signals: true },
    stadium:    { lotW: [3, 5], lotH: [3, 4], gap: 2, alleyChance: 1, floors: [2, 3], facade: 'mansion', roof: 'gable', remnant: 'grass', trees: 0.6, lamps: false, signals: false },
    marina:     { lotW: [2, 4], lotH: [2, 3], gap: 1, alleyChance: 0.8, floors: [1, 3], facade: 'marina', roof: 'flat', remnant: 'plaza', trees: 0.3, lamps: true, signals: false },
    // expansion districts (GDD_EXPANSION §1.1): Heirloom Heights, Goldplate International, Manifest Harbor
    brownstone: { lotW: [2, 4], lotH: [2, 3], gap: 0, alleyChance: 0.4, floors: [3, 5], facade: 'brownstone', roof: 'mansard', remnant: 'plaza', trees: 0.5, lamps: true, signals: true },
    airport:    { lotW: [5, 9], lotH: [4, 7], gap: 2, alleyChance: 1,   floors: [1, 2], facade: 'airport',    roof: 'flat',    remnant: 'parking', trees: 0.05, lamps: true, signals: true },
    port:       { lotW: [5, 9], lotH: [4, 6], gap: 1, alleyChance: 0.5, floors: [1, 3], facade: 'port',       roof: 'flat',    remnant: 'gravel', trees: 0.02, lamps: true, signals: false }
  };
})();
