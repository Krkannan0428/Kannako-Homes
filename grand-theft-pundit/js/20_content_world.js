/* Grand Theft Pundit: 20_content_world.js
 * GTP.Content.world: the city. Pure data plus tiny helpers. All coordinates
 * are in TILES (32 px each) on a 128 x 128 map. GTP.World.generate reads this.
 *
 * Layout conventions
 * - roads: {axis:'h'|'v', at, from, to, cls, bridge?}. `at` is the grid line;
 *   streets are 2 tiles wide (at-1..at), avenues and highways 4 tiles wide
 *   (at-2..at+1). Highways get 1-tile concrete shoulders with barriers.
 *   A road never carves water unless bridge:true (then it becomes a BRIDGE).
 * - districts: tile rects with a style key from GTP.C.DISTRICT_STYLES.
 * - landmarks: block = top-left lot tile, size = lot size in tiles. The
 *   footprint (building) is centered in the lot; the rest of the lot is
 *   `ground` ('plaza'|'grass'|'parking'|'sand'). Kinds with no building:
 *   park, quad, pier, beach, helipad, docks, bridge.
 *   Ids are placeholders the content agent renames/extends.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.Content = GTP.Content || {};

  function rect(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }
  function road(axis, at, from, to, cls, bridge) {
    var r = { axis: axis, at: at, from: from, to: to, cls: cls || 'street' };
    if (bridge) r.bridge = true;
    return r;
  }
  function lm(id, name, kind, bx, by, w, h, opts) {
    var o = { id: id, name: name, kind: kind, block: { bx: bx, by: by }, size: { w: w, h: h }, label: name };
    if (opts) for (var k in opts) o[k] = opts[k];
    return o;
  }
  function fp(w, h) { return { w: w, h: h }; }

  GTP.Content.world = {
    cityName: 'Punditropolis',

    // where a new game starts: landmark center plus an offset in px
    playerSpawn: { landmark: 'campus_quad', dx: 0, dy: 140 },
    respawn: { hospital: 'hospital', police: 'police_hq' },

    layout: {
      w: 128, h: 128,
      base: 'grass',

      water: [
        rect(0, 0, 128, 6), rect(0, 122, 128, 6), rect(0, 0, 6, 128), rect(122, 0, 6, 128), // sea border
        rect(0, 102, 128, 26),     // the bay (south)
        rect(99, 40, 6, 62),       // the channel between the city and the island
        rect(104, 0, 24, 22),      // north-east cove
        rect(8, 54, 4, 4)          // pond in the west park
      ],
      sand: [
        rect(105, 22, 17, 1)       // thin beach on the cove
      ],

      roads: [
        // vertical
        road('v', 16, 6, 101, 'street'),
        road('v', 32, 6, 29, 'street'),
        road('v', 32, 30, 81, 'highway'),
        road('v', 32, 82, 101, 'street'),
        road('v', 48, 34, 101, 'street'),
        road('v', 64, 6, 101, 'avenue'),
        road('v', 80, 6, 101, 'street'),
        road('v', 96, 6, 29, 'street'),
        road('v', 96, 30, 81, 'highway'),
        road('v', 96, 82, 101, 'street'),
        road('v', 112, 23, 101, 'street'),
        // horizontal
        road('h', 16, 6, 32, 'street'),
        road('h', 16, 62, 103, 'street'),
        road('h', 32, 6, 29, 'street'),
        road('h', 32, 30, 97, 'highway'),
        road('h', 32, 98, 121, 'street'),
        road('h', 48, 6, 97, 'street'),
        road('h', 48, 105, 121, 'street'),
        road('h', 64, 6, 121, 'avenue', true),   // main avenue, bridge over the channel
        road('h', 80, 6, 29, 'street'),
        road('h', 80, 30, 97, 'highway'),
        road('h', 80, 105, 121, 'street'),
        road('h', 96, 6, 121, 'street', true)    // marina shore road, small bridge
      ],

      districts: [
        { id: 'suburbs',    name: 'Vinyl Acres',       x: 0,  y: 0,  w: 32, h: 64,  style: 'suburb',     tint: '#7fbf6a' },
        { id: 'industrial', name: 'Rustbelt Yards',    x: 0,  y: 64, w: 32, h: 64,  style: 'industrial', tint: '#b08a5a' },
        { id: 'campus',     name: 'Hot Take U',        x: 32, y: 0,  w: 32, h: 32,  style: 'campus',     tint: '#d08a6a' },
        { id: 'capitol',    name: 'Capitol Ridge',     x: 64, y: 0,  w: 32, h: 32,  style: 'capitol',    tint: '#e8dcb8' },
        { id: 'hills',      name: 'Donor Heights',     x: 96, y: 0,  w: 32, h: 104, style: 'hills',      tint: '#e0a070' },
        { id: 'downtown',   name: 'Chyron Center',     x: 32, y: 32, w: 48, h: 48,  style: 'downtown',   tint: '#8a94c8' },
        { id: 'strip',      name: 'The Sponsor Strip', x: 80, y: 32, w: 16, h: 48,  style: 'strip',      tint: '#ff5fb8' },
        { id: 'marina',     name: 'Gull Marina',       x: 32, y: 80, w: 64, h: 48,  style: 'marina',     tint: '#6fc8e0' }
      ]
    },

    landmarks: [
      // downtown (Chyron Center)
      lm('downtown_tower', 'Spire Tower', 'tower', 35, 35, 11, 11, { footprint: fp(9, 9), ground: 'plaza' }),
      lm('park_central', 'Central Park', 'park', 50, 35, 11, 11),
      lm('studio_lot', 'Studio Lot', 'studio', 67, 35, 11, 11, { footprint: fp(9, 6), ground: 'parking' }),
      lm('bank', 'Federal Bank', 'bank', 35, 50, 11, 5, { footprint: fp(9, 4), ground: 'plaza' }),
      lm('hotel', 'Grand Hotel', 'hotel', 35, 56, 11, 5, { footprint: fp(10, 4), ground: 'plaza' }),
      lm('mall', 'The Mall', 'mall', 50, 50, 11, 11, { footprint: fp(9, 7), ground: 'parking' }),
      lm('hq_agency', 'Agency HQ', 'agency', 67, 50, 11, 7, { footprint: fp(8, 6), ground: 'plaza' }),
      lm('police_hq', 'Police HQ', 'police', 35, 67, 11, 10, { footprint: fp(8, 6), ground: 'parking' }),
      lm('stadium', 'Stadium', 'stadium', 50, 67, 11, 10, { footprint: fp(11, 10), ground: 'plaza' }),
      lm('hospital', 'General Hospital', 'hospital', 67, 67, 11, 10, { footprint: fp(8, 6), ground: 'parking' }),
      // the strip
      lm('club_1', 'Club One', 'club', 82, 35, 11, 5, { footprint: fp(9, 4), ground: 'plaza' }),
      lm('diner_1', 'Diner', 'diner', 82, 41, 11, 5, { footprint: fp(6, 3), ground: 'parking' }),
      lm('casino_1', 'Casino', 'casino', 82, 50, 11, 11, { footprint: fp(9, 7), ground: 'parking' }),
      lm('gas_1', 'Gas Station', 'gas', 82, 67, 11, 4, { footprint: fp(3, 2), ground: 'parking' }),
      lm('garage_1', 'Garage', 'garage', 82, 72, 11, 5, { footprint: fp(8, 4), ground: 'parking' }),
      // campus
      lm('campus_quad', 'The Quad', 'quad', 42, 10, 11, 11),
      lm('campus_hall', 'Lecture Hall', 'brick', 34, 6, 8, 8, { footprint: fp(7, 6), ground: 'grass' }),
      lm('campus_library', 'Library', 'brick', 53, 19, 8, 9, { footprint: fp(7, 7), ground: 'grass' }),
      // capitol
      lm('capitol', 'The Capitol', 'capitol', 67, 18, 11, 11, { footprint: fp(7, 5), ground: 'grass' }),
      lm('embassy_row', 'Embassy Row', 'embassy', 82, 18, 12, 11, { footprint: fp(12, 4), ground: 'grass' }),
      lm('thinktank', 'Think Tank', 'stone', 67, 6, 11, 8, { footprint: fp(7, 5), ground: 'plaza' }),
      lm('courthouse', 'Courthouse', 'stone', 82, 6, 12, 8, { footprint: fp(8, 5), ground: 'plaza' }),
      // suburbs
      lm('player_home', 'Home', 'house', 7, 7, 4, 4, { footprint: fp(3, 3), ground: 'grass' }),
      lm('school', 'High School', 'brick', 18, 34, 11, 12, { footprint: fp(8, 6), ground: 'grass' }),
      lm('park_west', 'West Park', 'park', 6, 50, 8, 11),
      lm('gas_2', 'Gas Station West', 'gas', 18, 50, 11, 5, { footprint: fp(3, 2), ground: 'parking' }),
      // industrial
      lm('warehouse_1', 'Warehouse 1', 'warehouse', 18, 67, 11, 11, { footprint: fp(9, 6), ground: 'yard' }),
      lm('warehouse_2', 'Warehouse 2', 'warehouse', 6, 67, 8, 11, { footprint: fp(7, 5), ground: 'yard' }),
      lm('factory', 'Factory', 'factory', 18, 82, 12, 12, { footprint: fp(9, 7), ground: 'yard' }),
      lm('scrapyard', 'Scrapyard', 'yard', 6, 82, 8, 12, { footprint: fp(3, 3), ground: 'yard' }),
      lm('docks_west', 'West Docks', 'docks', 6, 98, 24, 4, { ground: 'plaza' }),
      // marina (lots take the top half of each block; shacks pack the rest)
      lm('boathouse', 'Boathouse', 'shack', 35, 83, 11, 6, { footprint: fp(6, 4), ground: 'sand' }),
      lm('diner_2', 'Seafood Diner', 'diner', 50, 83, 11, 6, { footprint: fp(6, 3), ground: 'parking' }),
      lm('club_2', 'Yacht Club', 'club', 67, 83, 11, 6, { footprint: fp(8, 4), ground: 'plaza' }),
      lm('terminal', 'Ferry Terminal', 'office', 82, 83, 12, 6, { footprint: fp(9, 4), ground: 'parking' }),
      lm('beach', 'Gull Beach', 'beach', 35, 98, 11, 4),
      lm('marina_docks', 'Marina Docks', 'pier', 50, 98, 44, 4, { ground: 'plaza' }),
      // the island (Donor Heights)
      lm('mansion_hill', 'Hilltop Mansion', 'mansion', 114, 34, 8, 12, { footprint: fp(5, 5), ground: 'grass' }),
      lm('donor_estate', 'Donor Estate', 'mansion', 114, 50, 8, 11, { footprint: fp(5, 4), ground: 'grass' }),
      lm('radio_tower', 'Radio Tower', 'radio', 105, 23, 5, 7, { footprint: fp(2, 2), ground: 'parking' }),
      lm('helipad', 'Helipad', 'helipad', 114, 23, 8, 7, { ground: 'plaza' }),
      lm('lookout_park', 'Lookout Park', 'park', 105, 82, 5, 12),
      lm('pier_east', 'East Pier', 'pier', 114, 98, 8, 4, { ground: 'plaza' }),
      lm('bridge_main', 'Main Bridge', 'bridge', 99, 62, 6, 4),
      lm('bridge_marina', 'Marina Bridge', 'bridge', 99, 95, 6, 2)
    ],

    // optional overrides of GTP.C.DISTRICT_STYLES, keyed by style name
    districtStyles: {},

    // spawn tables: placeholders the AI/content agents extend
    spawn: {
      peds: {
        looks: [
          { skin: '#e8c39e', shirt: '#6a8fcf', pants: '#2a2f4a', hair: '#3a2a1a' },
          { skin: '#c68642', shirt: '#d9534f', pants: '#333', hair: '#1a1a1a' },
          { skin: '#8d5524', shirt: '#f0ad4e', pants: '#2b3a55', hair: '#111' },
          { skin: '#f1d3b3', shirt: '#5cb85c', pants: '#4a4a4a', hair: '#b58a3c' },
          { skin: '#a46f3c', shirt: '#9b59b6', pants: '#2a2a2a', hair: '#2a1a0a' },
          { skin: '#e8c39e', shirt: '#2c3e50', pants: '#7f8c8d', hair: '#c0392b' }
        ],
        rolesByDistrict: {
          campus: { civ: 0.7, protester: 0.3 },
          downtown: { civ: 0.85, cop: 0.15 },
          capitol: { civ: 0.6, cop: 0.3, npc: 0.1 },
          strip: { civ: 0.8, thug: 0.2 },
          industrial: { civ: 0.5, thug: 0.5 },
          suburbs: { civ: 1 },
          hills: { civ: 0.7, cop: 0.3 },
          marina: { civ: 0.9, thug: 0.1 }
        }
      },
      vehicles: {
        byDistrict: {
          downtown: ['sedan', 'taxi', 'sedan', 'sports', 'bus', 'cop'],
          strip: ['sports', 'sedan', 'taxi', 'suv'],
          campus: ['sedan', 'bike', 'van'],
          capitol: ['suv', 'sedan', 'cop', 'cop'],
          suburbs: ['sedan', 'suv', 'van'],
          industrial: ['truck', 'van', 'truck', 'sedan'],
          hills: ['sports', 'suv', 'suv'],
          marina: ['sedan', 'van', 'bike', 'taxi']
        }
      }
    }
  };
})();
