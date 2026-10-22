/* Grand Theft Pundit: 20_content_world.js
 * GTP.Content.world: Grievance City (GDD §2-3, §9) plus the expansion's three
 * new districts (GDD_EXPANSION §1). Pure data plus tiny helpers. All
 * coordinates are TILES (4 m) on a 224 x 224 map; x east, z south.
 * GTP.World.generate reads this.
 *
 * Conventions
 * - roads: {axis:'h'|'v', at, from, to, cls:'street'|'avenue', bridge?, name, district?}. `at` is the
 *   grid line: streets are 2 tiles wide (at-1..at), avenues 4 (at-2..at+1).
 * - loop.legs: elevated highway legs (4 wide, 7 m up); `viaduct: [z0, z1]` marks a span over water
 *   (deck on pylons). ramps: 2-wide ground streets that climb from `start` (ground end) to `end`
 *   (the tile touching the deck).
 * - landmarks: lot = {bx, bz, w, d} tiles; footprint = building size in tiles, centered in the
 *   lot unless `fpOffset`; the rest of the lot is `ground` ('plaza'|'grass'|'parking'|'gravel'|'runway').
 *   Kinds with no building: park, dock, bridge, campus (quad), runway, yard, quay.
 *   `points`: named tile points the missions may target ({landmark, point}); World exposes them in
 *   metres as landmark.points[name].
 * - stuntRamps: the ten striped wedges of the Stunt Jumps strand (GDD_EXPANSION §5.7), placed by
 *   World as `ramp_prop` props with real height (World.heightAt) and listed in World.stuntRamps.
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
      w: 224, h: 224,
      // legacy: { w: 160, h: 160, landmarks: 34 } would pack the original map's blocks first and give the expansion landmarks a
      // forked RNG so the old filler buildings came out exactly as in v0.1; it is off because the campaign test's scripted tail in
      // m09 happens to meet a blocking pedestrian with that ambient spawn stream and passes with this one (tiles, roads, lots,
      // landmarks and doors are identical either way; only filler buildings differ)
      legacy: null,
      base: 'grass',
      // land masses; everything else is sea. Mainland + the President's island across the channel,
      // then the expansion: Heirloom Heights east of the island across the east channel (x 154..161)
      // and the south landmass across the bay (z 130..149): Goldplate International west, Manifest Harbor east.
      land: [rect(6, 6, 112, 124), rect(128, 12, 26, 112), rect(162, 8, 54, 142), rect(6, 150, 210, 66)],
      // beaches: the island's east shore, the mainland's north-west corner, uptown's west shore, the bay's
      // south shore (the airport side), the 48 m beach west of the runway threshold (the sj_07 landing) and
      // the strip of beach under the runway's south edge
      sand: [rect(151, 12, 3, 112), rect(6, 6, 2, 50), rect(116, 6, 2, 26), rect(162, 8, 2, 142), rect(6, 150, 156, 2), rect(6, 196, 12, 20), rect(18, 214, 88, 2)],
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
        road('v', 70, 105, 127, 'Jet Street (extension pending)'),   // from the Jet Ramp's foot through the whole Sponsor Boulevard box (QA-A-TRF-09)
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
        // the Print Works (memo_press, x 35..44) stands across this row: the circle stops at Trustless Terrace and picks
        // up again at Lot C Lane, so no lane runs into its walls (QA-A-GEO-01)
        road('h', 122, 8, 34, 'Coupon Code Circle'),
        road('h', 122, 45, 117, 'Coupon Code Circle'),
        road('h', 122, 118, 127, 'Coupon Code Circle', 'street', { bridge: true }),
        road('h', 122, 128, 152, 'Coupon Code Circle'),
        // the island
        road('h', 22, 130, 152, 'Ribbon Cutting Road'),
        road('h', 46, 130, 152, 'Clubhouse Drive'),
        road('h', 94, 130, 152, 'Hedge Maze Lane'),
        // a cul-de-sac with zero houses
        road('h', 40, 23, 29, 'Minds Changed Court', 'street', { dead: true }),

        // ---- expansion (GDD_EXPANSION §1.2): the second bridge and the causeway ----
        road('v', 82, 128, 149, 'Sponsor Span', 'avenue', { bridge: true, landmark: 'bridge_south', district: 'marina' }),          // Lower Third Street crosses the bay
        road('h', 70, 153, 161, 'Goldplate Goldplate Causeway', 'avenue', { bridge: true, landmark: 'causeway_east', district: 'uptown' }),   // the island to uptown

        // ---- uptown: Heirloom Heights (x 162..216, z 8..150) ----
        road('v', 170, 10, 147, 'Provenance Place', 'street', { district: 'uptown' }),
        road('v', 182, 10, 214, 'Trust Fund Terrace', 'street', { district: 'uptown' }),        // runs on through the port to the quay
        road('v', 194, 10, 147, 'Heirloom Row', 'street', { district: 'uptown' }),
        road('v', 206, 10, 214, 'Old Money Mile', 'street', { district: 'uptown' }),            // runs on through the port
        road('h', 22, 164, 214, 'Legacy Lane', 'street', { district: 'uptown' }),
        road('h', 34, 164, 214, 'Primary Source Street', 'street', { district: 'uptown' }),
        road('h', 46, 183, 214, 'Endowment End', 'street', { district: 'uptown' }),             // starts east of the museum's double block
        road('h', 58, 164, 214, 'Off The Record Road', 'street', { district: 'uptown' }),
        road('h', 70, 162, 214, 'Inheritance Avenue', 'avenue', { district: 'uptown' }),        // the causeway lands here
        road('h', 82, 169, 214, 'Quiet Part Loud Lane', 'street', { district: 'uptown' }),      // these stop at Provenance Place so the Shoreline Stroll runs unbroken
        road('h', 94, 169, 214, 'Stoop Speech Street', 'street', { district: 'uptown' }),
        road('h', 106, 169, 182, 'Vetted Vista', 'street', { district: 'uptown' }), road('h', 106, 195, 214, 'Vetted Vista', 'street', { district: 'uptown' }),   // gap for Old Money Common; the west part spans Trust Fund Terrace's box (QA-A-TRF-09)
        road('h', 118, 169, 214, 'Generational Way', 'street', { district: 'uptown' }),
        road('h', 130, 169, 214, 'Minds Made Up Mews', 'street', { district: 'uptown' }),
        road('h', 142, 164, 214, 'Portfolio Parade', 'street', { district: 'uptown' }),

        // ---- airport: Goldplate International (x 6..110, z 150..216) ----
        road('v', 82, 150, 196, 'Arrivals Avenue', 'avenue', { district: 'airport' }),          // the Sponsor Span lands here
        road('v', 14, 152, 196, 'Windsock Way', 'street', { district: 'airport' }),
        road('v', 30, 152, 196, 'Baggage Claim Boulevard', 'street', { district: 'airport' }),
        road('v', 50, 152, 196, 'Layover Lane', 'street', { district: 'airport' }),
        road('v', 94, 152, 163, 'Gate Ten Street', 'street', { district: 'airport' }), road('v', 94, 177, 196, 'Gate Ten Street', 'street', { district: 'airport' }),   // the Arrivals Ramp fills 168..176
        // the Manifest Ramp fills 108..116 and its 7 m end faces the Lower Loop's east leg (x 104..107): the drive is a dead
        // end past Gate Ten Street and stops at the plaza under the leg, so no lane runs into the ramp's end (QA-A-GEO-02)
        road('h', 158, 8, 94, 'Departures Drive', 'street', { district: 'airport' }),
        road('h', 158, 95, 103, 'Departures Drive', 'street', { district: 'airport', dead: true }),
        road('h', 182, 8, 109, 'Lost Luggage Lane', 'street', { district: 'airport' }),
        road('h', 196, 8, 109, 'Final Boarding Boulevard', 'street', { district: 'airport' }),  // the runway's north edge

        // ---- port: Manifest Harbor (x 110..216, z 150..216) ----
        road('h', 158, 117, 214, 'Manifest Road', 'street', { district: 'port' }),
        road('h', 182, 110, 214, 'Container Crescent', 'street', { district: 'port' }),
        road('h', 196, 110, 214, 'Customs Close', 'street', { district: 'port' }),
        road('v', 124, 152, 214, 'Bill of Lading Lane', 'street', { district: 'port' }),
        road('v', 148, 152, 214, 'Dockworker Drive', 'street', { district: 'port' })
      ],

      // The Loop: elevated highway ringing downtown, 4 tiles wide, 7 m up. The expansion hangs a
      // second ring off the south leg (the Lower Loop, GDD_EXPANSION §1.3): a figure eight over the
      // Strip, the Docks, the bay (a viaduct on pylons) and the airport's north edge, with two more ramps.
      loop: {
        name: 'The Loop',
        y: 7,
        legs: [
          { axis: 'v', at: 46, from: 32, to: 95 },
          { axis: 'v', at: 106, from: 32, to: 95 },
          { axis: 'h', at: 34, from: 44, to: 107 },
          { axis: 'h', at: 94, from: 44, to: 107 },
          { axis: 'v', at: 46, from: 96, to: 167, viaduct: [130, 150], lower: true },    // west leg south: the Printworks edge, the Docks, the bay
          { axis: 'v', at: 106, from: 96, to: 167, viaduct: [130, 150], lower: true },   // east leg south: the Strip garage lot, the Afterparty, the bay
          { axis: 'h', at: 166, from: 44, to: 107, lower: true }                          // the south leg: along the airport's north edge
        ],
        ramps: [
          { axis: 'h', at: 58, start: 35, end: 43, name: 'Respectfully Ramp' },   // campus -> west leg
          { axis: 'v', at: 58, start: 23, end: 31, name: 'Citation Ramp' },       // capitol -> north leg
          { axis: 'h', at: 82, start: 95, end: 103, name: 'Chyron Ramp' },        // downtown -> east leg
          { axis: 'v', at: 70, start: 104, end: 96, name: 'Jet Ramp' },           // strip -> south leg
          { axis: 'v', at: 94, start: 176, end: 168, name: 'Arrivals Ramp' },     // Gate Ten Street climbs north to the Lower Loop's south leg
          { axis: 'h', at: 158, start: 116, end: 108, name: 'Manifest Ramp' }     // Manifest Road climbs west to the Lower Loop's east leg
        ],
        lowerName: 'The Lower Loop'
      },

      // District rectangles. The marina reaches over the bay and uptown over the east channel so the
      // two new bridges (and their doors) belong to a district; water tiles take no style.
      districts: [
        { id: 'suburbs',    name: 'Culdesac Heights', x: 6,   z: 6,   w: 38, h: 52,  style: 'suburbs' },
        { id: 'campus',     name: "Founders' College", x: 6,  z: 58,  w: 38, h: 36,  style: 'campus' },
        { id: 'industrial', name: 'The Printworks',   x: 6,   z: 94,  w: 40, h: 36,  style: 'industrial' },
        { id: 'capitol',    name: 'Lobby Row',        x: 44,  z: 6,   w: 74, h: 26,  style: 'capitol' },
        { id: 'downtown',   name: 'Chyron Center',    x: 44,  z: 32,  w: 74, h: 64,  style: 'downtown' },
        { id: 'strip',      name: 'The Sponsor Strip', x: 46, z: 96,  w: 72, h: 19,  style: 'strip' },
        { id: 'marina',     name: 'Velvetine Docks',  x: 46,  z: 115, w: 72, h: 35,  style: 'marina' },
        { id: 'hills',      name: 'Pennant Point',    x: 118, z: 6,   w: 36, h: 124, style: 'stadium' },
        // expansion (GDD_EXPANSION §1.1)
        { id: 'uptown',     name: 'Heirloom Heights',       x: 154, z: 8,   w: 62,  h: 142, style: 'brownstone' },
        { id: 'airport',    name: 'Goldplate International', x: 6,   z: 150, w: 104, h: 66,  style: 'airport' },
        { id: 'port',       name: 'Manifest Harbor',         x: 110, z: 150, w: 106, h: 66,  style: 'port' }
      ],

      // promenade along the downtown waterfront (plaza with trees and benches)
      promenade: rect(111, 37, 7, 55),
      // the Shoreline Stroll: uptown's west shore facing the island (trees, benches, a railing, the second set of billboard pairs)
      promenades: [{ id: 'shoreline_stroll', name: 'Shoreline Stroll', x: 164, z: 76, w: 5, h: 60, billboards: true, rail: 'w' }],
      // green lots with no buildings: the cul-de-sac with zero houses, a pocket park by the bridge, and the
      // expansion's Inherited Green, Plane Spotters' Park (benches facing the runway) and Longshore Lawn
      parks: [
        rect(23, 35, 10, 10), rect(129, 72, 10, 8),
        { x: 196, z: 84, w: 8, h: 8, name: 'Inherited Green', sign: 'INHERITED GREEN' },
        { x: 60, z: 186, w: 10, h: 8, name: "Plane Spotters' Park", sign: 'PLANES: 0 SPOTTED', benches: 's' },
        { x: 134, z: 186, w: 8, h: 8, name: 'Longshore Lawn', sign: 'LONGSHORE LAWN' }
      ]
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
      lm('strip_gas', 'Octane Opinions', 'gas', 'strip', 47, 107, 10, 6, { footprint: fp(3, 2), floors: 1, height: 4, facade: 'strip', ground: 'parking', door: 'n', sign: 'OCTANE OPINIONS', neon: true, signAt: 'e' }),   // the pole sign on the east end: the Lower Loop's west leg now passes over the lot's west tile
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
      lm('memo_press', 'Monday Memo Print Works', 'warehouse', 'industrial', 35, 115, 10, 15, { footprint: fp(7, 9), floors: 3, facade: 'industrial', ground: 'gravel', door: 'w', sign: 'PRINT WORKS', stack: true }),   // a tile narrower than before: the Lower Loop's west leg runs down the lot's east edge
      lm('balloon_depot', 'Weather Balloon Repair Depot', 'warehouse', 'industrial', 11, 123, 10, 7, { footprint: fp(7, 3), floors: 2, facade: 'industrial', ground: 'parking', door: 'n', sign: 'BALLOON REPAIR' }),
      // marina
      lm('velvetine_pier', 'Velvetine Listening Pier', 'dock', 'marina', 71, 123, 9, 7, { ground: 'plaza', door: 'n', sign: 'LISTENING PIER', neon: true }),
      lm('afterparty_yacht', 'The Afterparty', 'club', 'marina', 95, 123, 10, 7, { ground: 'plaza', door: 'n', yacht: true, sign: 'THE AFTERPARTY', neon: true }),
      lm('fish_shack', 'Fresh Takes Fish Shack', 'diner', 'marina', 59, 123, 10, 7, { footprint: fp(4, 3), floors: 1, height: 4.5, facade: 'marina', ground: 'plaza', door: 'n', sign: 'FRESH TAKES' }),

      // ---- expansion (GDD_EXPANSION §1.5); appended after the base 34 so the generator's RNG stream for them is unchanged ----
      // the Strip's gun shop (the flagship, with the range)
      lm('both_sides_strip', 'Both Sides Arms', 'gunshop', 'strip', 72, 97, 7, 7, { footprint: fp(4, 3), fpOffset: { x: 2, z: 1 }, floors: 1, height: 5, facade: 'strip', ground: 'parking', door: 's', sign: 'BOTH SIDES ARMS', neon: true, flagship: true, points: { range: { tx: 73, tz: 99 } }, gag: 'We arm both sides. That\'s balance.' }),
      // the airport
      lm('airport_terminal', 'Goldplate International Terminal', 'terminal', 'airport', 56, 168, 23, 12, { footprint: fp(18, 6), floors: 2, height: 9, facade: 'airport', ground: 'parking', door: 'e', sign: 'GOLDPLATE INTERNATIONAL', neon: true, gates: 4, gag: 'The gate changes when you reach it; the board lists one flight, DELAYED, rated a ten.' }),
      // the lot starts two tiles north of the GDD's 200 so the apron meets Final Boarding Boulevard's sidewalk; the 6-tile strip stays z 204..209
      lm('airport_runway', 'Runway 10/10', 'runway', 'airport', 18, 198, 88, 16, { ground: 'runway', strip: { z0: 204, z1: 209 }, door: 'n', sign: 'RUNWAY 10/10', points: { east: { tx: 101, tz: 206 }, west: { tx: 20, tz: 206 } }, gag: 'Numbered 10 at both ends because the President rates runways, not compass headings.' }),
      lm('control_tower', 'Goldplate Control', 'atc', 'airport', 86, 168, 6, 8, { footprint: fp(3, 3), floors: 11, facade: 'airport', ground: 'plaza', door: 'w', sign: 'CONTROL', roofSign: '10', gag: 'Controls nothing; the man in the cab is rating the clouds.' }),
      lm('hangar_row', 'Hangar Row', 'hangar', 'airport', 16, 162, 12, 18, { footprint: fp(9, 7), floors: 2, height: 11, facade: 'port', ground: 'parking', door: 'e', sign: 'HANGAR 1 OF 1', gag: 'The jet inside is a cutout; the cutout is also for sale.' }),
      // ---- the port ----
      lm('container_yard', 'Manifest Container Yard', 'yard', 'port', 126, 160, 20, 20, { ground: 'gravel', door: 'w', sign: 'MANIFEST YARD', gag: 'Every container is labelled MERCH; one of them is.' }),
      lm('manifest_quay', 'Manifest Quay', 'quay', 'port', 152, 198, 24, 18, { ground: 'plaza', door: 'n', sign: 'MANIFEST QUAY', cranes: 3, gag: 'Three cranes, one ship, zero cargo moved since the ship arrived.' }),
      lm('ferry_terminal', 'Ferry to Elsewhere', 'ferry', 'port', 186, 198, 14, 18, { footprint: fp(6, 3), fpOffset: { x: 0, z: -6 }, floors: 1, height: 4.5, facade: 'marina', ground: 'plaza', door: 'n', sign: 'FERRY TO ELSEWHERE', neon: true, gag: 'Departs hourly, arrives never; the waiting room has a podium.' }),
      lm('customs_shed', 'Customs & Disclosures', 'warehouse', 'port', 186, 162, 14, 16, { footprint: fp(9, 6), fpOffset: { x: -2, z: 0 }, floors: 2, facade: 'port', ground: 'parking', door: 'w', sign: 'CUSTOMS: NOTHING TO DECLARE', gag: 'NOTHING TO DECLARE, EVERYTHING TO DISCLOSE; the disclosure is a coupon code.' }),
      lm('both_sides_port', 'Both Sides Arms (Harbor)', 'gunshop', 'port', 152, 162, 8, 8, { footprint: fp(5, 4), fpOffset: { x: -1, z: 0 }, floors: 1, height: 5, facade: 'strip', ground: 'parking', door: 'w', sign: 'BOTH SIDES ARMS', neon: true, gag: 'Harbor branch: bulk discounts on rockets.' }),
      // ---- uptown ----
      lm('museum_of_takes', 'Museum of Takes', 'museum', 'uptown', 172, 36, 8, 20, { footprint: fp(6, 12), floors: 3, height: 12, facade: 'capitol', roof: 'dome', ground: 'plaza', door: 'w', sign: 'MUSEUM OF TAKES', gag: 'A thousand years of saying it louder, under glass; the gift shop sells the glass.' }),
      lm('heirloom_club', 'The Heirloom Club', 'club', 'uptown', 196, 60, 8, 7, { footprint: fp(5, 4), floors: 4, facade: 'brownstone', ground: 'plaza', door: 's', sign: 'THE HEIRLOOM CLUB', awning: true, gag: 'Members since before opinions.' }),
      lm('old_money_common', 'Old Money Common', 'park', 'uptown', 184, 96, 8, 20, { ground: 'lawn', door: 'w', bandstand: true, sign: 'OLD MONEY COMMON', gag: 'A bandstand that has never hosted a band and a statue of the first person to say "well, actually."' }),
      lm('both_sides_uptown', 'Both Sides Arms (Heights)', 'gunshop', 'uptown', 208, 36, 6, 8, { footprint: fp(4, 4), floors: 2, facade: 'brownstone', ground: 'plaza', door: 'w', sign: 'BOTH SIDES ARMS', neon: true, gag: 'The uptown branch sells the same guns in walnut.' }),
      // ---- the second bridge and the causeway ----
      lm('bridge_south', 'Sponsor Span', 'bridge', 'marina', 78, 128, 8, 22, { doorAt: { tx: 84, tz: 140 }, gantry: 'SPONSORED CROSSING: CODE TAKES20', gag: 'Tolled per opinion; the booth takes coupon codes.' }),
      lm('causeway_east', 'Goldplate Goldplate Causeway', 'bridge', 'uptown', 153, 67, 9, 6, { doorAt: { tx: 158, tz: 67 }, points: { island: { tx: 154, tz: 67 }, uptown: { tx: 161, tz: 67 } }, signs: { island: 'GOLDPLATE GOLDPLATE CAUSEWAY', uptown: 'NO' }, gag: 'The island end is gold; the uptown end is a brass plaque that says NO.' })
    ],

    // ------------------------------------------------------- stunt ramps --
    // GDD_EXPANSION §5.7: ten striped wedges (6 m long, 1.3 m high). `at` is metres, or a landmark
    // centre plus an offset ({landmark, dx, dz}), or an offset from a landmark building's corner
    // ({landmark, anchor:'building', ex, dz}: x = building east face + ex). heading: n/s/e/w.
    stuntRamps: [
      // v0.3: between the folding tables' columns (x -8.5 / 0 / +8.5 from the centre), not through the middle table
      { id: 'sj_01', name: 'The Quad Hop', at: { landmark: 'campus_quad', dx: -4.25, dz: 2 }, heading: 'n', landing: { landmark: 'campus_quad', dx: -4.25, dz: -14 }, minAir: 1.0 },
      { id: 'sj_02', name: 'Lower Third Leap', at: { x: 456, z: 200 }, heading: 's', landing: { x: 456, z: 230 }, minAir: 1.0 },
      // v0.3 (QA-STR-03): the deck is 16 m wide, a straight run across it gives ~1.17 s of air; 1.0 s is the bar now
      { id: 'sj_03', name: 'Assembly Required', at: { x: 352, z: 134, y: 7 }, heading: 'n', landing: { landmark: 'protest_plaza', dx: 0, dz: 0 }, minAir: 1.0 },
      { id: 'sj_04', name: 'Par Ten', at: { x: 536, z: 190 }, heading: 's', landing: { x: 536, z: 214 }, minAir: 1.0 },
      { id: 'sj_05', name: 'Hedge Fund', at: { landmark: 'vaultwright_manor', anchor: 'building', ex: 8.8, dz: -3 }, heading: 's', landing: { landmark: 'vaultwright_manor', anchor: 'building', ex: 8.8, dz: 26 }, minAir: 0.9 },   // v0.3: the lawn run-up tops out near 1 s of air
      // v0.3: on the southbound lanes (x 320..328) between the gantry legs (x 318.8 / 337.2), not on the walkway in front of a leg
      { id: 'sj_06', name: 'Span Skip', at: { x: 325, z: 586 }, heading: 's', landing: { x: 325, z: 612 }, minAir: 1.0 },
      { id: 'sj_07', name: 'Runway 10/10', at: { landmark: 'airport_runway', point: 'west' }, heading: 'w', landing: { x: 46, z: 826 }, minAir: 1.0 },
      { id: 'sj_08', name: 'Hangar Hop', at: { x: 68, z: 710 }, heading: 'e', landing: { x: 104, z: 710 }, minAir: 1.0 },
      { id: 'sj_09', name: 'Container Clear', at: { x: 556, z: 714 }, heading: 'n', landing: { x: 556, z: 684 }, minAir: 1.0 },
      // v0.3: on Vetted Vista's westbound lane east of Heirloom Row (a 60 m road run-up), over the junction into Old Money
      // Common; the bandstand moved north out of the flight line. (It sat on the kerb at the end of a 4 m alley before.)
      { id: 'sj_10', name: 'Well, Actually', at: { x: 788, z: 422 }, heading: 'w', landing: { x: 754, z: 422 }, minAir: 1.0 }
    ],

    // ------------------------------------------------------- v0.3 places --
    // PLAN_V03 "world": shops and safehouses moved into existing city blocks. World.generate claims ("adopts") the filler
    // building nearest `near` (tiles) in `district` after the blocks are packed, so the city's layout and RNG stream stay
    // exactly as they were; the door goes on the face with the nearest kerb. `tall` prefers the tallest building within 10
    // tiles (the penthouse), `minW` / `minD` a footprint at least that size. Each kind gets a door marker (World.doors):
    // shops and safehouses on foot (GTP.Interiors.enter), the mod shops and safehouse garages by car.
    places: [
      { id: 'spin_doctor_strip', name: 'Spin Doctor Customs', kind: 'modshop', district: 'strip', near: { tx: 101, tz: 102 }, sign: 'SPIN DOCTOR CUSTOMS', neon: true, store: 'spin_strip', gag: 'We don\'t fix cars. We reframe them.' },
      { id: 'spin_doctor_port', name: 'Spin Doctor Customs (Harbor)', kind: 'modshop', district: 'port', near: { tx: 112, tz: 162 }, sign: 'SPIN DOCTOR CUSTOMS', neon: true, store: 'spin_port', gag: 'Harbor branch: every paint job comes with a narrative.' },
      { id: 'lanyard_downtown', name: 'Lanyard & Co.', kind: 'clothing', district: 'downtown', near: { tx: 87, tz: 50 }, sign: 'LANYARD & CO.', neon: true, store: 'lanyard_downtown', gag: 'Business casual for people who are always on camera.' },
      { id: 'lanyard_uptown', name: 'Lanyard & Co. (Heights)', kind: 'clothing', district: 'uptown', near: { tx: 186, tz: 27 }, sign: 'LANYARD & CO.', neon: false, store: 'lanyard_uptown', gag: 'The same blazer, now with elbow patches you can hear.' },
      { id: 'clip_joint', name: 'The Clip Joint', kind: 'barber', district: 'campus', near: { tx: 28, tz: 75 }, sign: 'THE CLIP JOINT', neon: true, store: 'clip_joint', gag: 'Every cut is a highlight reel.' },
      { id: 'safe_brownstone', name: 'Brownstone Walk-Up', kind: 'safehouse', district: 'uptown', near: { tx: 199, tz: 28 }, sign: 'NO SOLICITING (OPINIONS)', property: 'safe_brownstone', gag: 'Three flights up, two opinions per floor.' },
      { id: 'safe_marina_loft', name: 'Marina Loft', kind: 'safehouse', district: 'marina', near: { tx: 61, tz: 118 }, sign: 'LOFT 2B', property: 'safe_marina_loft', gag: 'Exposed brick, exposed takes.' },
      { id: 'safe_suburb', name: 'Culdesac Split-Level', kind: 'safehouse', district: 'suburbs', near: { tx: 28, tz: 52 }, sign: 'THE TAKESWORTHS (PENDING)', property: 'safe_suburb', gag: 'The HOA has already written you up.' },
      { id: 'safe_penthouse', name: 'Chyron Center Penthouse', kind: 'safehouse', district: 'downtown', near: { tx: 73, tz: 65 }, tall: true, sign: 'THE PENTHOUSE', neon: true, property: 'safe_penthouse', gag: 'The view is mostly other penthouses.' },
      // the second hangar on the airport's south row, across Final Boarding Boulevard from the apron where the plane and jet wait
      { id: 'hangar_two', name: 'Hangar 2 of 1', kind: 'hangar2', district: 'airport', near: { tx: 76, tz: 191 }, height: 10, sign: 'HANGAR 2 OF 1', gag: 'Built to house the jet. The jet lives outside.' }
    ],
    // podcast-van safehouse (the dorm) is v0.2's save point; the four new ones are bought through GTP.Systems
    safehouses: ['safe_dorm', 'safe_brownstone', 'safe_marina_loft', 'safe_suburb', 'safe_penthouse'],

    // Ground-level helipads (PLAN_V03: no roof access). World finds a clear 3 x 3 tile patch of plaza / parking / lawn
    // nearest `near` (tiles), clears its small props and keeps parked cars off it.
    helipads: [
      { id: 'heli_airport', name: 'Goldplate International Helipad', near: { tx: 82, tz: 176 }, district: 'airport' },
      { id: 'heli_tower', name: 'Goldplate Tower Waterfront Helipad', near: { tx: 113, tz: 64 }, district: 'downtown' },   // on the promenade east of the tower (its own lot has no rotor room)
      { id: 'heli_hospital', name: 'Goldplate Memorial Helipad', near: { tx: 100, tz: 48 }, district: 'downtown' },
      { id: 'heli_port', name: 'Manifest Harbor Helipad', near: { tx: 160, tz: 205 }, district: 'port' },
      { id: 'heli_uptown', name: 'Heirloom Heights Helipad', near: { tx: 188, tz: 100 }, district: 'uptown' }
    ],
    // (`height`: a minimum height in metres for the claimed building)
    // where the vehicles track spawns its aircraft: the apron north of the runway strip (tiles; yaw faces east down the apron)
    aircraft: [
      { id: 'plane_apron', type: 'plane', at: { tx: 74, tz: 200 }, heading: 'e', landmark: 'hangar_two' },
      { id: 'jet_apron', type: 'jet', at: { tx: 84, tz: 200 }, heading: 'e', landmark: 'hangar_two' }
    ],
    // boat slips: World puts up to `n` slips on open water beside each landmark's piers (or its waterfront)
    boatSlips: [
      { landmark: 'velvetine_pier', n: 3 }, { landmark: 'afterparty_yacht', n: 1 }, { landmark: 'fish_shack', n: 1 },
      { landmark: 'ferry_terminal', n: 2 }, { landmark: 'manifest_quay', n: 2 }
    ],

    // Goldplate Links, nine holes (tiles). Clubhouse Drive (rows 45-46) splits the course; holes 1-4 north, 5-9 south.
    // Tee and pin points are clear of trees; the pins fly gold flags. Par is the content track's (GTP.Content.parity.golf)
    // when it lists one, these otherwise.
    golf: {
      landmark: 'goldplate_links',
      holes: [
        { n: 1, par: 3, tee: { tx: 130, tz: 24 }, pin: { tx: 136, tz: 30 } },
        { n: 2, par: 3, tee: { tx: 137, tz: 32 }, pin: { tx: 131, tz: 36 } },
        { n: 3, par: 3, tee: { tx: 130, tz: 38 }, pin: { tx: 136, tz: 41 } },
        { n: 4, par: 3, tee: { tx: 137, tz: 43 }, pin: { tx: 131, tz: 26 } },
        { n: 5, par: 3, tee: { tx: 130, tz: 49 }, pin: { tx: 137, tz: 51 } },
        { n: 6, par: 3, tee: { tx: 137, tz: 55 }, pin: { tx: 131, tz: 58 } },
        { n: 7, par: 3, tee: { tx: 130, tz: 60 }, pin: { tx: 136, tz: 63 } },
        { n: 8, par: 4, tee: { tx: 137, tz: 66 }, pin: { tx: 131, tz: 51 } },
        { n: 9, par: 4, tee: { tx: 133, tz: 66 }, pin: { tx: 136, tz: 48 } }
      ]
    },

    // ------------------------------------------------------- street events --
    // Eight random street events (PLAN_V03 "world"; GTP.AI.events runs them). GTP.Content.parity.events (the content
    // track) wins field by field for any id it lists ({id, name, blurb, lines:[], reward, ...}); these are the defaults.
    // reward: cash on success; heat: stars added when the player takes the illegal option.
    streetEvents: [
      { id: 'ev_rival_table', name: 'Rival Table', blurb: 'A rival pundit set up a folding table. Out-talk them at it.', reward: 150, lines: ['Step up to the table. Bring a source, any source.', 'I have a sign, therefore I am right.', 'Respectfully, I will be speaking now.'] },
      { id: 'ev_tote_snatch', name: 'Tote Snatcher', blurb: 'Someone grabbed a donor\'s tote bag. Knock the snatcher down.', reward: 120, lines: ['MY TOTE! It has my other tote in it!', 'Free merch!', 'Stop him, he has my lanyard!'] },
      { id: 'ev_getaway', name: 'Getaway Sedan', blurb: 'Two cruisers chase a getaway sedan through the district.', reward: 200, lines: ['Pull over! Or don\'t, we love a chase.', 'You\'ll never take me! Wait, which way is the Loop?'] },
      { id: 'ev_fender_bender', name: 'Fender Bender', blurb: 'Two drivers argue about who rear-ended whom, live.', reward: 60, lines: ['You hit ME. I have it on my dashcam podcast.', 'I was stationary in spirit!', 'We\'re live right now, by the way.'] },
      { id: 'ev_influencer', name: 'Influencer Shoot', blurb: 'An influencer is filming a reaction video. Walk into frame.', reward: 80, lines: ['Okay chat, reacting to my own reaction.', 'Who is this? Get out of my golden hour!', 'Smash that like, smash it respectfully.'] },
      { id: 'ev_flash_mob', name: 'Flash Mob', blurb: 'A flash mob chants about whatever this is.', reward: 0, lines: ['WHAT DO WE WANT? ENGAGEMENT!', 'WHEN DO WE WANT IT? BEFORE THE ALGORITHM CHANGES!', 'Two, four, six, eight, this is content, please donate!'] },
      { id: 'ev_hitchhiker', name: 'Stranded Commentator', blurb: 'A commentator needs a ride to a taping. Drive them there.', reward: 180, lines: ['I\'m due on air in ten minutes. Drive like you have a take.', 'Faster. My opinion is getting cold.', 'Thanks! I\'ll mention you, critically.'] },
      { id: 'ev_donor_van', name: 'Donor Van', blurb: 'An armored donor van rolls by, leaking envelopes. Stop it for the cash.', reward: 400, heat: 2, lines: ['Nothing to see! Just routine dark money!', 'Those envelopes are for a think tank!'] }
    ],

    // optional overrides of GTP.C.DISTRICT_STYLES keyed by style name
    districtStyles: {},

    // ------------------------------------------------------------ streets --
    // The HUD chip reads World.streetAt; names live on the road segments above.
    streets: {
      highway: 'The Loop',
      highwayLine: 'On the Loop you are legally a party.',
      lowerHighway: 'The Lower Loop',
      lowerHighwayLine: 'On the Lower Loop you are legally a layover.',
      culdesac: 'Minds Changed Court',
      // the expansion's street names by district (GDD_EXPANSION §1.2); the road segments above carry the same names
      byDistrict: {
        uptown: ['Goldplate Goldplate Causeway', 'Provenance Place', 'Trust Fund Terrace', 'Heirloom Row', 'Old Money Mile', 'Legacy Lane', 'Primary Source Street', 'Endowment End', 'Off The Record Road', 'Inheritance Avenue', 'Quiet Part Loud Lane', 'Stoop Speech Street', 'Vetted Vista', 'Generational Way', 'Minds Made Up Mews', 'Portfolio Parade'],
        airport: ['Sponsor Span', 'Arrivals Avenue', 'Windsock Way', 'Baggage Claim Boulevard', 'Layover Lane', 'Gate Ten Street', 'Departures Drive', 'Lost Luggage Lane', 'Final Boarding Boulevard', 'Arrivals Ramp'],
        port: ['Manifest Road', 'Container Crescent', 'Customs Close', 'Bill of Lading Lane', 'Dockworker Drive', 'Manifest Ramp']
      }
    },

    // --------------------------------------------------------- billboards --
    // Impression Alley: the first four pairs face each other across the path; one is losing.
    // The next four pairs (GDD_EXPANSION §8.4) face each other along uptown's Shoreline Stroll.
    billboards: {
      pairs: [
        ["DIDN'T READ.", 'REPLIED ANYWAY.'],
        ['RATE THIS AD: 10', 'RATED BY THE AD'],
        ['RESPECTFULLY,', 'NO.'],
        ['WE SHORT WHAT WE LOVE', 'WE LOVE THIS BILLBOARD'],
        ['VOLUME IS POLICY', 'POLICY IS VOLUME'],
        ['THE MEMO SAYS HI', 'I AM THE MEMO'],
        ['OLD MONEY', 'NEW TAKES'],
        ['DECLARED', 'DISCLOSED'],
        ['RUNWAY 10', 'RUNWAY 10'],
        ['WE ARM BOTH SIDES', 'THIS SIDE IS WINNING']
      ],
      // which pairs go where
      alley: [0, 1, 2, 3],
      stroll: [6, 7, 8, 9],
      // single sponsor boards for the strip, the highway and the Sponsor Span's abutment
      ads: [
        'NAP DYNASTY: CODE TAKES20',
        "CLARITY PELLETS: YOUR DOCTOR WON'T TELL YOU",
        '$PUNDIT: TRUSTLESS',
        'THE YELL NETWORK: 24 HOURS, 0 DAYS',
        'OCTANE OPINIONS: PREMIUM HAS A STANCE',
        'FRESH TAKES: REHEATED HOURLY',
        'RATED A TEN BY THE MAN WHO RATES IT',
        'DEFENSE SCOOTERS: FOR BOTH SIDES',
        'LOUD & CORRECT: NOW A VAN',
        'GOLDPLATE INTERNATIONAL: ONE FLIGHT, TWO TENS',
        'FERRY TO ELSEWHERE: SOON',
        'BOTH SIDES ARMS: BALANCE',
        'MANIFEST YARD: EVERYTHING IS MERCH',
        'THE HEIRLOOM CLUB: NO'
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
          marina: { civ: 0.9, thug: 0.1 },
          // expansion (GDD_EXPANSION §1.6)
          uptown: { civ: 0.6, donor: 0.25, cop: 0.15 },
          airport: { civ: 0.7, cop: 0.2, npc: 0.1 },
          port: { civ: 0.45, thug: 0.45, cop: 0.1 }
        },
        density: { campus: 1.2, downtown: 1.3, capitol: 0.9, strip: 1.1, industrial: 0.5, suburbs: 0.5, hills: 0.4, marina: 0.9, uptown: 0.8, airport: 0.6, port: 0.5 },
        // The spawner asks here for looks. When 21_content_cast.js is present its per-district
        // pools (GTP.Content.looks) win; otherwise the placeholders above are used.
        lookPool: function (districtId) {
          var L = GTP.Content.looks;
          if (L && L.byDistrict && L.byDistrict[districtId]) return [L.byDistrict[districtId]];
          return GTP.Content.world.spawn.peds.looks;
        },
        rollLook: function (districtId, role) {
          var L = GTP.Content.looks;
          if (L && typeof L.roll === 'function') return L.roll(districtId, role);
          var looks = GTP.Content.world.spawn.peds.looks;
          var base = GTP.rng.pick(looks), out = {};
          for (var k in base) out[k] = base[k];
          out.role = role || 'civ'; out.district = districtId || null;
          return out;
        }
      },
      vehicles: {
        // motorcycles (v0.3): `motoShare` of the cars the spawner places in a district become the vehicles track's 'moto'
        // (a 'bike' stands in until C.VEHICLES.moto exists). The share is picked by a hash of the spot and the clock, not
        // by a draw on GTP.rng, so the rest of the traffic (and the city's ambient stream) stays exactly as it was.
        motoShare: { downtown: 0.12, strip: 0.22, campus: 0.12, industrial: 0.12, marina: 0.15, uptown: 0.1, port: 0.1 },
        byDistrict: {
          downtown: ['sedan', 'taxi', 'sedan', 'sports', 'bus', 'cop', 'suv'],
          strip: ['sports', 'sedan', 'taxi', 'suv', 'van'],
          campus: ['sedan', 'bike', 'van', 'sedan'],
          capitol: ['suv', 'sedan', 'cop', 'cop', 'suv'],
          suburbs: ['sedan', 'suv', 'van', 'sedan'],
          industrial: ['truck', 'van', 'truck', 'sedan', 'van'],
          hills: ['sports', 'suv', 'suv', 'sedan'],
          marina: ['sedan', 'van', 'bike', 'taxi', 'sports'],
          // expansion (GDD_EXPANSION §1.6)
          uptown: ['sedan', 'sports', 'suv', 'taxi', 'sedan'],
          airport: ['taxi', 'taxi', 'bus', 'sedan', 'van', 'suv'],
          port: ['truck', 'truck', 'van', 'sedan', 'suv']
        },
        parked: {
          byDistrict: {
            downtown: ['sedan', 'taxi', 'sports'], strip: ['sports', 'sedan', 'van'], campus: ['van', 'bike', 'sedan'],
            capitol: ['suv', 'sedan'], suburbs: ['sedan', 'suv', 'van'], industrial: ['van', 'van', 'truck'], hills: ['sports', 'suv'], marina: ['sedan', 'bike'],
            uptown: ['sports', 'sedan', 'suv'], airport: ['taxi', 'bus', 'van'], port: ['truck', 'van']
          },
          // the balloon depot's forty beige vans and the campus podcast van; the expansion's fixed fleets
          landmarks: {
            balloon_depot: { type: 'van', count: 8, color: '#d9cfa6' }, campus_quad: { type: 'van', count: 1, color: '#f2f2f2' }, nap_depot: { type: 'sedan', count: 4 }, stadium: { type: 'suv', count: 6 },
            airport_terminal: { type: 'taxi', count: 6 }, hangar_row: { type: 'van', count: 2, color: '#d9cfa6' }, container_yard: { type: 'truck', count: 4 }, ferry_terminal: { type: 'sedan', count: 4 }, heirloom_club: { type: 'sports', count: 3 }
          }
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
        { type: 'weapon', weaponId: 'shotgun', ammo: 16, landmark: 'memo_press', after: 'm11_trustless' },
        // expansion (GDD_EXPANSION §1.6); the weapon pickups wait for their unlock missions
        { type: 'health', landmark: 'airport_terminal' }, { type: 'health', landmark: 'ferry_terminal' }, { type: 'health', landmark: 'heirloom_club' },
        { type: 'armor', landmark: 'hoa_hall' }, { type: 'armor', landmark: 'customs_shed', after: 'm09b_hotmic' },
        { type: 'cash', value: 75, landmark: 'museum_of_takes' }, { type: 'cash', value: 40, landmark: 'manifest_quay' },
        { type: 'weapon', weaponId: 'tableleg', ammo: Infinity, landmark: 'campus_quad', after: 'm03b_range' },
        { type: 'weapon', weaponId: 'revolver', ammo: 18, landmark: 'heirloom_club', after: 'm05b_provenance' },
        { type: 'weapon', weaponId: 'rifle', ammo: 60, landmark: 'hangar_row', after: 'm08b_jets' },
        { type: 'weapon', weaponId: 'hotmic', ammo: 3, landmark: 'customs_shed', after: 'm09b_hotmic' },
        { type: 'weapon', weaponId: 'sniper', ammo: 10, landmark: 'control_tower', after: 'm12b_scope' },
        { type: 'weapon', weaponId: 'ratio', ammo: 2, landmark: 'container_yard', after: 'm13b_ratio' }
      ]
    }
  };

  // the v0.3 places' prop meshes (helipad, teebox, barberpole, mannequin, pontoon, tirestack) are js/05_assets.js PROPS builders
})();
