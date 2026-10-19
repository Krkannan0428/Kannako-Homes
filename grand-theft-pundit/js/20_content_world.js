/* Grand Theft Pundit: 20_content_world.js
 * GTP.Content.world: Grievance City (GDD §2-3, §9). Pure data plus tiny
 * helpers. All coordinates are TILES (4 m) on a 160 x 160 map; x east, z south.
 * GTP.World.generate reads this.
 *
 * Conventions
 * - roads: {axis:'h'|'v', at, from, to, cls:'street'|'avenue', bridge?, name}. `at` is the
 *   grid line: streets are 2 tiles wide (at-1..at), avenues 4 (at-2..at+1).
 * - loop.legs: elevated highway legs (4 wide, 7 m up). ramps: 2-wide ground streets that climb
 *   from `start` (ground end) to `end` (the tile touching the deck).
 * - landmarks: lot = {bx, bz, w, d} tiles; footprint = building size in tiles, centered in the
 *   lot unless `fpOffset`; the rest of the lot is `ground` ('plaza'|'grass'|'parking'|'gravel').
 *   Kinds with no building: park, dock, bridge, campus (quad).
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.Content = GTP.Content || {};

  function rect(x, z, w, h) { return { x: x, z: z, w: w, h: h }; }
  function road(axis, at, from, to, name, cls, extra) {
    var r = { axis: axis, at: at, from: from, to: to, cls: cls || 'street', name: name };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }
  function lm(id, name, kind, district, bx, bz, w, d, opts) {
    var o = { id: id, name: name, kind: kind, district: district, lot: { bx: bx, bz: bz, w: w, d: d }, label: name };
    if (opts) for (var k in opts) o[k] = opts[k];
    return o;
  }
  function fp(w, d) { return { w: w, d: d }; }

  GTP.Content.world = {
    cityName: 'Grievance City',
    motto: 'Two time zones, one opinion.',
    playerSpawn: 'campus_quad',
    respawn: { hospital: 'hospital', police: 'police_hq' },

    layout: {
      w: 160, h: 160,
      base: 'grass',
      // land masses; everything else is sea. Mainland + the President's island across the channel.
      land: [rect(6, 6, 112, 124), rect(128, 12, 26, 112)],
      sand: [rect(151, 12, 3, 112), rect(6, 6, 2, 50), rect(116, 6, 2, 26)],
      coastJitter: 0.45,

      roads: [
        // west side, north-south
        road('v', 10, 8, 127, 'Balloon Repair Alley'),
        road('v', 22, 8, 127, 'Monday Memo Mews'),
        road('v', 34, 8, 127, 'Trustless Terrace'),
        road('v', 46, 8, 30, 'Lot C Lane'),
        road('v', 46, 97, 127, 'Lot C Lane'),
        road('v', 58, 8, 22, 'Citation Pending Way'),
        road('v', 58, 36, 127, 'Citation Pending Way'),
        road('v', 70, 8, 91, 'Jet Street (extension pending)'),
        road('v', 70, 106, 127, 'Jet Street (extension pending)'),
        road('v', 82, 21, 127, 'Lower Third Street', 'avenue'),
        road('v', 94, 8, 127, 'Ratio Row'),
        road('v', 110, 37, 91, 'Quote Post Crescent'),
        road('v', 140, 14, 122, 'Par Ten Parkway'),
        // east-west
        road('h', 10, 8, 117, 'Pellet Place'),
        road('h', 22, 8, 117, 'Embassy Row'),
        road('h', 34, 8, 42, 'Clarity Close'),
        road('h', 46, 8, 110, 'Lanyard Lane'),
        road('h', 58, 8, 34, 'Respectfully Road'),
        road('h', 58, 49, 110, 'Respectfully Road'),
        road('h', 70, 8, 117, 'Goldplate Avenue', 'avenue'),
        road('h', 70, 118, 127, 'Goldplate Goldplate Bridge', 'avenue', { bridge: true, landmark: 'bridge_main' }),
        road('h', 70, 128, 152, 'Goldplate Goldplate Avenue', 'avenue'),
        road('h', 82, 8, 94, 'Chyron Crossing'),
        road('h', 94, 8, 42, 'Printworks Parade'),
        road('h', 106, 8, 117, 'Sponsor Boulevard'),
        road('h', 114, 8, 117, 'Fresh Takes Drive'),
        road('h', 122, 8, 117, 'Coupon Code Circle'),
        road('h', 122, 118, 127, 'Coupon Code Circle', 'street', { bridge: true }),
        road('h', 122, 128, 152, 'Coupon Code Circle'),
        // the island
        road('h', 22, 130, 152, 'Ribbon Cutting Road'),
        road('h', 46, 130, 152, 'Clubhouse Drive'),
        road('h', 94, 130, 152, 'Hedge Maze Lane'),
        // a cul-de-sac with zero houses
        road('h', 40, 23, 29, 'Minds Changed Court', 'street', { dead: true })
      ],

      // The Loop: elevated highway ringing downtown, 4 tiles wide, 7 m up, four ramps.
      loop: {
        name: 'The Loop',
        y: 7,
        legs: [
          { axis: 'v', at: 46, from: 32, to: 95 },
          { axis: 'v', at: 106, from: 32, to: 95 },
          { axis: 'h', at: 34, from: 44, to: 107 },
          { axis: 'h', at: 94, from: 44, to: 107 }
        ],
        ramps: [
          { axis: 'h', at: 58, start: 35, end: 43, name: 'Respectfully Ramp' },   // campus -> west leg
          { axis: 'v', at: 58, start: 23, end: 31, name: 'Citation Ramp' },       // capitol -> north leg
          { axis: 'h', at: 82, start: 95, end: 103, name: 'Chyron Ramp' },        // downtown -> east leg
          { axis: 'v', at: 70, start: 104, end: 96, name: 'Jet Ramp' }            // strip -> south leg
        ]
      },

      districts: [
        { id: 'suburbs',    name: 'Culdesac Heights', x: 6,   z: 6,   w: 38, h: 52,  style: 'suburbs' },
        { id: 'campus',     name: "Founders' College", x: 6,  z: 58,  w: 38, h: 36,  style: 'campus' },
        { id: 'industrial', name: 'The Printworks',   x: 6,   z: 94,  w: 40, h: 36,  style: 'industrial' },
        { id: 'capitol',    name: 'Lobby Row',        x: 44,  z: 6,   w: 74, h: 26,  style: 'capitol' },
        { id: 'downtown',   name: 'Chyron Center',    x: 44,  z: 32,  w: 74, h: 64,  style: 'downtown' },
        { id: 'strip',      name: 'The Sponsor Strip', x: 46, z: 96,  w: 72, h: 19,  style: 'strip' },
        { id: 'marina',     name: 'Velvetine Docks',  x: 46,  z: 115, w: 72, h: 15,  style: 'marina' },
        { id: 'hills',      name: 'Pennant Point',    x: 118, z: 6,   w: 36, h: 124, style: 'stadium' }
      ],

      // promenade along the downtown waterfront (plaza with trees and benches)
      promenade: rect(111, 37, 7, 55),
      // green lots with no buildings: the cul-de-sac with zero houses, a pocket park by the bridge
      parks: [rect(23, 35, 10, 10), rect(129, 72, 10, 8)]
    },

    // ---------------------------------------------------------- landmarks --
    // ids, names, kinds and districts verbatim from GDD §3.
    landmarks: [
      // campus
      lm('campus_quad', "Founders' Quad", 'campus', 'campus', 23, 59, 10, 9, { ground: 'grass', door: 's', sign: "ASK ME ANYTHING, I'LL ANSWER SOMETHING ELSE", gag: "Standing-room-only by design." }),
      lm('dorm_studio', 'Dorm 4B Studio', 'studio', 'campus', 35, 59, 8, 9, { footprint: fp(5, 5), floors: 3, facade: 'campus', ground: 'grass', door: 'w', sign: 'ON AIR' }),
      lm('pod_garage', "Gus's Garage", 'garage', 'campus', 11, 72, 10, 9, { footprint: fp(6, 4), floors: 1, height: 5.5, facade: 'industrial', ground: 'parking', door: 's', sign: "GUS'S GARAGE" }),
      // downtown
      lm('tyn_tower', 'The Yell Network', 'studio', 'downtown', 71, 47, 9, 10, { footprint: fp(8, 6), floors: 13, facade: 'downtown', roof: 'studio', ground: 'plaza', door: 's', sign: 'TYN' }),
      lm('green_room', 'Green Room Motel', 'hotel', 'downtown', 59, 59, 10, 9, { footprint: fp(8, 5), floors: 6, facade: 'marina', ground: 'parking', door: 'n', sign: 'GREEN ROOM', neon: true }),
      lm('impression_alley', 'Impression Alley', 'park', 'downtown', 71, 72, 9, 9, { ground: 'plaza', door: 'n' }),
      lm('goldplate_tower', 'Goldplate Tower', 'tower', 'downtown', 84, 59, 9, 9, { footprint: fp(7, 7), floors: 19, facade: 'goldplate', roof: 'tower', ground: 'plaza', door: 'w', sign: 'GOLDPLATE', roofSign: '2' }),
      lm('vault_bank', 'Vaultwright Capital', 'bank', 'downtown', 49, 59, 8, 9, { footprint: fp(6, 6), floors: 7, facade: 'capitol', ground: 'plaza', door: 'e', sign: 'VAULTWRIGHT' }),
      lm('hospital', 'Goldplate Memorial', 'hospital', 'downtown', 95, 47, 8, 10, { footprint: fp(6, 7), floors: 6, facade: 'hospital', ground: 'parking', door: 'w', sign: 'GOLDPLATE MEMORIAL' }),
      lm('police_hq', '1st Precinct', 'police', 'downtown', 49, 47, 8, 10, { footprint: fp(6, 6), floors: 4, facade: 'police', ground: 'parking', door: 'e', sign: '1ST PRECINCT' }),
      // the strip
      lm('nap_depot', 'Nap Dynasty Mattress Depot', 'mall', 'strip', 59, 97, 10, 8, { footprint: fp(8, 4), floors: 2, facade: 'strip', ground: 'parking', door: 's', sign: 'NAP DYNASTY', neon: true }),
      lm('listening_room', 'Velvetine Listening Room', 'club', 'strip', 84, 97, 9, 8, { footprint: fp(6, 5), floors: 3, facade: 'strip', ground: 'plaza', door: 's', sign: 'LISTENING ROOM', neon: true }),
      lm('strip_garage', 'Detail & Evidence', 'garage', 'strip', 95, 107, 10, 6, { footprint: fp(6, 3), floors: 1, height: 5.5, facade: 'industrial', ground: 'parking', door: 'n', sign: 'DETAIL & EVIDENCE' }),
      lm('strip_gas', 'Octane Opinions', 'gas', 'strip', 47, 107, 10, 6, { footprint: fp(3, 2), floors: 1, height: 4, facade: 'strip', ground: 'parking', door: 'n', sign: 'OCTANE OPINIONS', neon: true }),
      // capitol
      lm('capitol_dome', 'The Capitol', 'capitol', 'capitol', 71, 11, 22, 10, { footprint: fp(14, 5), floors: 4, facade: 'capitol', roof: 'dome', ground: 'grass', door: 's', sign: 'THE CAPITOL' }),
      lm('fulcrum', 'Fulcrum Foundation', 'hq', 'capitol', 71, 23, 9, 9, { footprint: fp(6, 5), floors: 4, facade: 'capitol', ground: 'grass', door: 'n', sign: 'FULCRUM' }),
      lm('char_charter', 'Char & Charter', 'diner', 'capitol', 59, 23, 10, 9, { footprint: fp(6, 4), floors: 2, facade: 'capitol', ground: 'parking', door: 'n', sign: 'CHAR & CHARTER' }),
      lm('bravadia_embassy', 'Bravadian Embassy', 'embassy', 'capitol', 95, 11, 10, 10, { footprint: fp(8, 5), floors: 3, facade: 'capitol', ground: 'grass', door: 's', sign: 'BRAVADIA' }),
      lm('ova_hq', 'Office of Vibes Assessment', 'hq', 'capitol', 107, 11, 11, 10, { footprint: fp(7, 5), floors: 3, facade: 'stadium', ground: 'parking', door: 's', sign: 'WEATHER BALLOON REPAIR', antennas: 13 }),
      lm('protest_plaza', 'Perpetual Assembly Plaza', 'park', 'capitol', 84, 23, 9, 9, { ground: 'plaza', door: 'n' }),
      // the island
      lm('stadium', 'Goldplate Goldplate Stadium', 'stadium', 'hills', 141, 23, 12, 22, { footprint: fp(10, 18), height: 16, facade: 'stadium', ground: 'parking', door: 'w', sign: 'GOLDPLATE GOLDPLATE' }),
      lm('goldplate_links', 'Goldplate Links', 'park', 'hills', 129, 23, 10, 45, { ground: 'lawn', door: 'e', sign: 'PAR 10' }),
      lm('vaultwright_manor', 'Vaultwright Manor', 'mansion', 'hills', 141, 47, 12, 21, { footprint: fp(7, 5), floors: 3, facade: 'mansion', roof: 'gable', ground: 'grass', door: 'w' }),
      lm('bridge_main', 'Goldplate Goldplate Bridge', 'bridge', 'hills', 118, 67, 10, 6, { doorAt: { tx: 123, tz: 67 } }),
      // suburbs
      lm('hoa_hall', 'Culdesac HOA Hall', 'hq', 'suburbs', 23, 11, 10, 10, { footprint: fp(6, 4), floors: 2, facade: 'suburbs', ground: 'parking', door: 'n', sign: 'HOA' }),
      lm('clarity_barn', 'Clarity Pellet Wellness Barn', 'warehouse', 'suburbs', 11, 35, 10, 10, { footprint: fp(7, 5), floors: 2, facade: 'barn', roof: 'gable', ground: 'grass', door: 'e', sign: 'CLARITY PELLETS' }),
      lm('moon_mine', 'Moonsworth Mining Shed', 'warehouse', 'suburbs', 35, 47, 10, 10, { footprint: fp(4, 3), floors: 1, height: 4, facade: 'industrial', ground: 'gravel', door: 'w', sign: '$PUNDIT', antennas: 3 }),
      lm('culdesac_gas', 'Pump & Circumstance', 'gas', 'suburbs', 11, 47, 10, 10, { footprint: fp(3, 2), floors: 1, height: 4, facade: 'suburbs', ground: 'parking', door: 'e', sign: 'PUMP & CIRCUMSTANCE' }),
      // industrial
      lm('warehouse_42', 'Warehouse 42', 'warehouse', 'industrial', 23, 95, 10, 10, { footprint: fp(8, 6), floors: 2, facade: 'industrial', ground: 'gravel', door: 'w', sign: '42' }),
      lm('memo_press', 'Monday Memo Print Works', 'warehouse', 'industrial', 35, 115, 10, 15, { footprint: fp(8, 9), floors: 3, facade: 'industrial', ground: 'gravel', door: 'w', sign: 'PRINT WORKS', stack: true }),
      lm('balloon_depot', 'Weather Balloon Repair Depot', 'warehouse', 'industrial', 11, 123, 10, 7, { footprint: fp(7, 3), floors: 2, facade: 'industrial', ground: 'parking', door: 'n', sign: 'BALLOON REPAIR' }),
      // marina
      lm('velvetine_pier', 'Velvetine Listening Pier', 'dock', 'marina', 71, 123, 9, 7, { ground: 'plaza', door: 'n', sign: 'LISTENING PIER', neon: true }),
      lm('afterparty_yacht', 'The Afterparty', 'club', 'marina', 95, 123, 10, 7, { ground: 'plaza', door: 'n', yacht: true, sign: 'THE AFTERPARTY', neon: true }),
      lm('fish_shack', 'Fresh Takes Fish Shack', 'diner', 'marina', 59, 123, 10, 7, { footprint: fp(4, 3), floors: 1, height: 4.5, facade: 'marina', ground: 'plaza', door: 'n', sign: 'FRESH TAKES' })
    ],

    // optional overrides of GTP.C.DISTRICT_STYLES keyed by style name
    districtStyles: {},

    // ------------------------------------------------------------ streets --
    // The HUD chip reads World.streetAt; names live on the road segments above.
    streets: {
      highway: 'The Loop',
      highwayLine: 'On the Loop you are legally a party.',
      culdesac: 'Minds Changed Court'
    },

    // --------------------------------------------------------- billboards --
    // Impression Alley: pairs face each other across the path; one is losing.
    billboards: {
      pairs: [
        ["DIDN'T READ.", 'REPLIED ANYWAY.'],
        ['RATE THIS AD: 10', 'RATED BY THE AD'],
        ['RESPECTFULLY,', 'NO.'],
        ['WE SHORT WHAT WE LOVE', 'WE LOVE THIS BILLBOARD'],
        ['VOLUME IS POLICY', 'POLICY IS VOLUME'],
        ['THE MEMO SAYS HI', 'I AM THE MEMO']
      ],
      // single sponsor boards for the strip and the highway
      ads: [
        'NAP DYNASTY: CODE TAKES20',
        "CLARITY PELLETS: YOUR DOCTOR WON'T TELL YOU",
        '$PUNDIT: TRUSTLESS',
        'THE YELL NETWORK: 24 HOURS, 0 DAYS',
        'OCTANE OPINIONS: PREMIUM HAS A STANCE',
        'FRESH TAKES: REHEATED HOURLY',
        'RATED A TEN BY THE MAN WHO RATES IT',
        'DEFENSE SCOOTERS: FOR BOTH SIDES',
        'LOUD & CORRECT: NOW A VAN'
      ]
    },

    // ------------------------------------------------------------- spawn --
    // Placeholder looks; GTP.Content.looks (21) overrides when present.
    spawn: {
      peds: {
        looks: [
          { skin: 2, hair: 'short', hairColor: '#3a2a1a', shirt: '#6a8fcf', pants: '#2a2f4a', glasses: 'none', hat: 'none' },
          { skin: 4, hair: 'bob', hairColor: '#1a1a1a', shirt: '#d9534f', pants: '#333333', glasses: 'thick', hat: 'none' },
          { skin: 5, hair: 'short', hairColor: '#111111', shirt: '#f0ad4e', pants: '#2b3a55', glasses: 'none', hat: 'cap' },
          { skin: 1, hair: 'long', hairColor: '#b58a3c', shirt: '#5cb85c', pants: '#4a4a4a', glasses: 'round', hat: 'none' },
          { skin: 3, hair: 'bun', hairColor: '#2a1a0a', shirt: '#9b59b6', pants: '#2a2a2a', glasses: 'none', hat: 'beanie' },
          { skin: 6, hair: 'afro', hairColor: '#111111', shirt: '#2c3e50', pants: '#7f8c8d', glasses: 'shades', hat: 'none' },
          { skin: 2, hair: 'slick', hairColor: '#8e3a8e', shirt: '#ffffff', pants: '#1a1a1a', glasses: 'none', hat: 'fedora' },
          { skin: 4, hair: 'mohawk', hairColor: '#ff7a00', shirt: '#15e0ff', pants: '#2b2b2b', glasses: 'round', hat: 'none' }
        ],
        rolesByDistrict: {
          campus: { civ: 0.6, student: 0.3, protester: 0.1 },
          downtown: { civ: 0.8, cop: 0.15, npc: 0.05 },
          capitol: { civ: 0.55, cop: 0.3, lobbyist: 0.15 },
          strip: { civ: 0.8, thug: 0.2 },
          industrial: { civ: 0.5, thug: 0.5 },
          suburbs: { civ: 0.85, hoa: 0.15 },
          hills: { civ: 0.6, cop: 0.3, donor: 0.1 },
          marina: { civ: 0.9, thug: 0.1 }
        },
        density: { campus: 1.2, downtown: 1.3, capitol: 0.9, strip: 1.1, industrial: 0.5, suburbs: 0.5, hills: 0.4, marina: 0.9 }
      },
      vehicles: {
        byDistrict: {
          downtown: ['sedan', 'taxi', 'sedan', 'sports', 'bus', 'cop', 'suv'],
          strip: ['sports', 'sedan', 'taxi', 'suv', 'van'],
          campus: ['sedan', 'bike', 'van', 'sedan'],
          capitol: ['suv', 'sedan', 'cop', 'cop', 'suv'],
          suburbs: ['sedan', 'suv', 'van', 'sedan'],
          industrial: ['truck', 'van', 'truck', 'sedan', 'van'],
          hills: ['sports', 'suv', 'suv', 'sedan'],
          marina: ['sedan', 'van', 'bike', 'taxi', 'sports']
        },
        parked: {
          byDistrict: {
            downtown: ['sedan', 'taxi', 'sports'], strip: ['sports', 'sedan', 'van'], campus: ['van', 'bike', 'sedan'],
            capitol: ['suv', 'sedan'], suburbs: ['sedan', 'suv', 'van'], industrial: ['van', 'van', 'truck'], hills: ['sports', 'suv'], marina: ['sedan', 'bike']
          },
          // the balloon depot's forty beige vans and the campus podcast van
          landmarks: { balloon_depot: { type: 'van', count: 8, color: '#d9cfa6' }, campus_quad: { type: 'van', count: 1, color: '#f2f2f2' }, nap_depot: { type: 'sedan', count: 4 }, stadium: { type: 'suv', count: 6 } }
        }
      },
      pickups: [
        { type: 'health', landmark: 'hospital' },
        { type: 'health', landmark: 'fish_shack' },
        { type: 'armor', landmark: 'police_hq' },
        { type: 'cash', value: 50, landmark: 'vault_bank' },
        { type: 'cash', value: 25, landmark: 'nap_depot' },
        { type: 'weapon', weaponId: 'pistol', ammo: 30, landmark: 'strip_garage', after: 'm05_peer' },
        { type: 'weapon', weaponId: 'megaphone', ammo: 20, landmark: 'protest_plaza', after: 'm03_ratio' },
        { type: 'weapon', weaponId: 'hottake', ammo: 10, landmark: 'impression_alley', after: 'm09_balloon' },
        { type: 'weapon', weaponId: 'smg', ammo: 60, landmark: 'warehouse_42', after: 'm11_trustless' },
        { type: 'weapon', weaponId: 'shotgun', ammo: 16, landmark: 'memo_press', after: 'm11_trustless' }
      ]
    }
  };
})();
