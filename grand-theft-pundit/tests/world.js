/* world.js: the generated city matches GDD §2-3 and GDD_EXPANSION §1: every landmark id (34 base + 16
 * expansion) exists in its district with a door on a sidewalk next to a road, buildings never overlap, every
 * landmark door is reachable by road from the campus quad (BFS over ROAD/BRIDGE/HIGHWAY/RAMP, both layers),
 * the figure-eight Loop deck is connected to the ground through its six ramps, the runway strip is never in the
 * traffic lane field, the viaduct stands over water, both bridges and the extended Loop have the right heights,
 * the stunt wedges have real height, heightAt/solidAt behave per the contract, pathing works, generation is
 * deterministic and reports its progress.
 * v0.3: the ten places (mod shops, clothing, barber, safehouses, the second hangar) claim buildings with doors on a kerb
 * the road graph reaches, door markers per kind, five clear ground-level helipads, the aircraft apron, boat slips on open
 * water, nine golf holes, stunt lines cleared of furniture with every wedge on its run-up surface, deterministic for two
 * seeds; screenshots tests/out/world_*.png of the new places (look at them). */
'use strict';
const H = require('./_harness');

const GDD_LANDMARKS = {
  campus: ['campus_quad', 'dorm_studio', 'pod_garage'],
  downtown: ['tyn_tower', 'green_room', 'impression_alley', 'goldplate_tower', 'vault_bank', 'hospital', 'police_hq'],
  strip: ['nap_depot', 'listening_room', 'strip_garage', 'strip_gas', 'both_sides_strip'],
  capitol: ['capitol_dome', 'fulcrum', 'char_charter', 'bravadia_embassy', 'ova_hq', 'protest_plaza'],
  hills: ['stadium', 'goldplate_links', 'vaultwright_manor', 'bridge_main'],
  suburbs: ['hoa_hall', 'clarity_barn', 'moon_mine', 'culdesac_gas'],
  industrial: ['warehouse_42', 'memo_press', 'balloon_depot'],
  marina: ['velvetine_pier', 'afterparty_yacht', 'fish_shack', 'bridge_south'],
  // expansion (GDD_EXPANSION §1.5)
  airport: ['airport_terminal', 'airport_runway', 'control_tower', 'hangar_row'],
  port: ['container_yard', 'manifest_quay', 'ferry_terminal', 'customs_shed', 'both_sides_port'],
  uptown: ['museum_of_takes', 'heirloom_club', 'old_money_common', 'both_sides_uptown', 'causeway_east']
};
const GDD_KINDS = { airport_terminal: 'terminal', airport_runway: 'runway', control_tower: 'atc', hangar_row: 'hangar', container_yard: 'yard', manifest_quay: 'quay', ferry_terminal: 'ferry', customs_shed: 'warehouse', both_sides_port: 'gunshop', museum_of_takes: 'museum', heirloom_club: 'club', old_money_common: 'park', both_sides_uptown: 'gunshop', both_sides_strip: 'gunshop', bridge_south: 'bridge', causeway_east: 'bridge' };
const GDD_DOORS = { bridge_south: [84, 140], causeway_east: [158, 67], bridge_main: [123, 67] };
const GDD_DISTRICTS = { campus: 'campus', downtown: 'downtown', strip: 'strip', capitol: 'capitol', hills: 'stadium', suburbs: 'suburbs', industrial: 'industrial', marina: 'marina', uptown: 'brownstone', airport: 'airport', port: 'port' };
const GDD_STREETS = ['Goldplate Avenue', 'Goldplate Goldplate Avenue', 'Respectfully Road', 'Lanyard Lane', 'Ratio Row', 'Lower Third Street', 'Sponsor Boulevard', 'Citation Pending Way', 'Par Ten Parkway', 'Balloon Repair Alley', 'Trustless Terrace', 'Pellet Place', 'Jet Street (extension pending)', 'Minds Changed Court', 'Monday Memo Mews', 'Quote Post Crescent', 'Coupon Code Circle',
  // expansion (GDD_EXPANSION §1.2)
  'Sponsor Span', 'Goldplate Goldplate Causeway', 'Provenance Place', 'Trust Fund Terrace', 'Heirloom Row', 'Old Money Mile', 'Legacy Lane', 'Primary Source Street', 'Endowment End', 'Off The Record Road', 'Inheritance Avenue', 'Quiet Part Loud Lane', 'Stoop Speech Street', 'Vetted Vista', 'Generational Way', 'Minds Made Up Mews', 'Portfolio Parade', 'Arrivals Avenue', 'Windsock Way', 'Baggage Claim Boulevard', 'Layover Lane', 'Gate Ten Street', 'Departures Drive', 'Lost Luggage Lane', 'Final Boarding Boulevard', 'Manifest Road', 'Container Crescent', 'Customs Close', 'Bill of Lading Lane', 'Dockworker Drive'];
const GDD_RAMPS = ['Respectfully Ramp', 'Citation Ramp', 'Chyron Ramp', 'Jet Ramp', 'Arrivals Ramp', 'Manifest Ramp'];
const GDD_STUNTS = ['sj_01', 'sj_02', 'sj_03', 'sj_04', 'sj_05', 'sj_06', 'sj_07', 'sj_08', 'sj_09', 'sj_10'];
const NEW_PROPS = ['jetbridge', 'beacon', 'luggage', 'edgelight', 'windsock', 'plane', 'jet', 'cab', 'rolldoor', 'pallet', 'container', 'crane', 'ship', 'ferryboat', 'podium', 'cutout', 'fence', 'column', 'statue', 'stanchion', 'gazebo', 'fountain', 'gantry', 'ramp_prop'];

H.run('world', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  const r = await page.evaluate(({ GDD_LANDMARKS, GDD_KINDS, GDD_DOORS, GDD_DISTRICTS, GDD_STREETS, GDD_RAMPS, GDD_STUNTS }) => {
    const W = GTP.World, T = W.T, M = W.M, C = GTP.C, CW = GTP.Content.world, TILE = C.TILE;
    const out = { missing: [], wrongDistrict: [], wrongKind: [], doorBad: [], overlaps: [], unreachable: [], districts: [], streetsMissing: [], rampsMissing: [], deckUnreached: 0, deckTiles: 0 };
    out.size = { w: W.w, h: W.h, cw: C.MAP_W, ch: C.MAP_H };
    // districts with the GDD style keywords
    const dmap = {}; W.districts.forEach((d) => { dmap[d.id] = d; });
    Object.keys(GDD_DISTRICTS).forEach((id) => { if (!dmap[id]) out.districts.push('missing ' + id); else if (dmap[id].style !== GDD_DISTRICTS[id]) out.districts.push(id + ' style ' + dmap[id].style); });
    // landmarks: ids verbatim, in their GDD district, each with a door on a SIDEWALK touching a ROAD/BRIDGE
    const ROADISH = (tt) => tt === T.ROAD || tt === T.BRIDGE;
    Object.keys(GDD_LANDMARKS).forEach((did) => GDD_LANDMARKS[did].forEach((id) => {
      const l = W.landmark(id);
      if (!l) { out.missing.push(id); return; }
      if (l.district !== did) out.wrongDistrict.push(id + ' in ' + l.district);
      if (GDD_KINDS[id] && l.kind !== GDD_KINDS[id]) out.wrongKind.push(id + ' kind ' + l.kind);
      const d = l.door;
      if (!d) { out.doorBad.push(id + ': no door'); return; }
      const tx = Math.floor(d.x / TILE), tz = Math.floor(d.z / TILE);
      if (W.tile(tx, tz) !== T.SIDEWALK) out.doorBad.push(id + ': door tile ' + W.tile(tx, tz));
      const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => ROADISH(W.tile(tx + dx, tz + dz)));
      if (!adj) out.doorBad.push(id + ': no road next to door');
      const dd = W.districtAt(d.x, d.z);
      if (!dd || dd.id !== did) out.doorBad.push(id + ': door in district ' + (dd && dd.id));
      if (GDD_DOORS[id] && (tx !== GDD_DOORS[id][0] || tz !== GDD_DOORS[id][1])) out.doorBad.push(id + ': door at ' + tx + ',' + tz + ' not ' + GDD_DOORS[id]);
    }));
    out.landmarkCount = W.landmarks.length;
    // named points the missions target
    const rw = W.landmark('airport_runway'), bs = W.landmark('both_sides_strip'), ce = W.landmark('causeway_east');
    out.points = { runwayEast: rw && rw.points.east && [Math.floor(rw.points.east.x / TILE), Math.floor(rw.points.east.z / TILE)], runwayWest: rw && rw.points.west && [Math.floor(rw.points.west.x / TILE), Math.floor(rw.points.west.z / TILE)], range: bs && bs.points.range && [Math.floor(bs.points.range.x / TILE), Math.floor(bs.points.range.z / TILE)], island: ce && ce.points.island && [Math.floor(ce.points.island.x / TILE), Math.floor(ce.points.island.z / TILE)] };
    out.rangePointTile = bs && bs.points.range ? W.tileAt(bs.points.range.x, bs.points.range.z) : -1;
    // no building overlaps (AABB)
    const B = W.buildings;
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z) out.overlaps.push((a.landmark || a.id) + '/' + (b.landmark || b.id));
    }
    // every BUILDING tile maps to a building that covers it
    let badIdx = 0;
    for (let i = 0; i < W.w * W.h; i++) if (W.tiles[i] === T.BUILDING) { const b = B[W.bidx[i] - 1]; const tx = i % W.w, tz = (i / W.w) | 0; if (!b || tx < b.tx || tx >= b.tx + b.tw || tz < b.tz || tz >= b.tz + b.td) badIdx++; }
    out.badBuildingIndex = badIdx;
    // no building under the Loop deck (the lots of strip_garage, afterparty_yacht, memo_press and strip_gas touch the new legs)
    let underDeck = 0;
    for (let i = 0; i < W.w * W.h; i++) if (W.tiles[i] === T.BUILDING && W.deck[i]) underDeck++;
    out.buildingsUnderDeck = underDeck;
    // BFS over drivable tiles on both layers from the road next to the campus quad door
    const N = W.w * W.h;
    const drivable = (node) => { if (node >= N) return !!W.deck[node - N]; const tt = W.tiles[node]; return tt === T.ROAD || tt === T.BRIDGE || tt === T.RAMP; };
    const roadNextTo = (door) => {
      const tx = Math.floor(door.x / TILE), tz = Math.floor(door.z / TILE);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ROADISH(W.tile(tx + dx, tz + dz))) return (tz + dz) * W.w + tx + dx;
      return -1;
    };
    const start = roadNextTo(W.landmark('campus_quad').door);
    const seen = new Uint8Array(2 * N); const q = [start]; seen[start] = 1; const nb = [];
    while (q.length) { const cur = q.pop(); W._neighbors(cur, nb); for (const n of nb) if (!seen[n] && drivable(n)) { seen[n] = 1; q.push(n); } }
    W.landmarks.forEach((l) => { const s = roadNextTo(l.door); if (s < 0 || !seen[s]) out.unreachable.push(l.id); });
    for (let i = 0; i < N; i++) if (W.deck[i]) { out.deckTiles++; if (!seen[N + i]) out.deckUnreached++; }
    let roadTiles = 0, roadUnreached = 0;
    for (let i = 0; i < N; i++) if (drivable(i)) { roadTiles++; if (!seen[i]) roadUnreached++; }
    out.roadTiles = roadTiles; out.roadUnreached = roadUnreached;
    // streets from GDD §9 and GDD_EXPANSION §1.2 exist on road segments; the six ramps exist
    const names = new Set(W.roads.map((rd) => rd.name)); names.add(W.loopName);
    GDD_STREETS.forEach((s) => { if (!names.has(s)) out.streetsMissing.push(s); });
    const rampNames = new Set(W.ramps.map((rp) => rp.name));
    GDD_RAMPS.forEach((s) => { if (!rampNames.has(s)) out.rampsMissing.push(s); });
    out.loopName = W.loopName; out.lowerLoopName = W.lowerLoopName;
    out.streetsByDistrict = { uptown: (CW.streets.byDistrict.uptown || []).length, airport: (CW.streets.byDistrict.airport || []).length, port: (CW.streets.byDistrict.port || []).length };
    // the chip names: both rings read The Loop (loopAt tells which), a new street says its name
    out.chipLower = W.streetAt(46 * TILE, 150 * TILE, 7);
    out.chipUpper = W.streetAt(46 * TILE, 60 * TILE, 7);
    out.chipUptown = W.streetAt(182 * TILE, 50 * TILE, 0);
    out.loopAt = [W.loopAt(46 * TILE, 150 * TILE, 7), W.loopAt(46 * TILE, 60 * TILE, 7), W.loopAt(46 * TILE, 150 * TILE, 0), W.loopAt(94 * TILE - 2, 172 * TILE, 0)];
    // heights: street 0, deck 7, ramp interpolated, water -1.2, sidewalk curb
    const rp = W.randomRoadPoint();
    out.hStreet = W.heightAt(rp.x, rp.z, 0);
    const leg = CW.layout.loop.legs[0];
    const deckX = (leg.at - 2 + 1.5) * TILE, deckZ = ((leg.from + leg.to) / 2) * TILE;
    out.hDeck = W.heightAt(deckX, deckZ, 7); out.hUnderDeck = W.heightAt(deckX, deckZ, 0);
    const ramp = W.ramps[0]; const mid = (ramp.a0 + ramp.a1) / 2;
    const rx = ramp.axis === 'h' ? mid : (ramp.x0 + ramp.x1) / 2, rz = ramp.axis === 'h' ? (ramp.z0 + ramp.z1) / 2 : mid;
    out.hRampMid = W.heightAt(rx, rz, 0);
    const q1 = ramp.a0 + (ramp.a1 - ramp.a0) * 0.25;
    out.hRampQuarter = W.heightAt(ramp.axis === 'h' ? q1 : rx, ramp.axis === 'h' ? rz : q1, 0);
    out.hWater = W.heightAt(2 * TILE, 2 * TILE, 0); out.hOff = W.heightAt(-50, -50, 0);
    const sw = W.randomSidewalkPoint(); out.hSidewalk = W.heightAt(sw.x, sw.z, 0);
    // the extended Loop: the viaduct deck is 7 m over water (ground under it is the bay), the south leg is 7 m over the airport
    const via = CW.layout.loop.legs.find((l) => l.viaduct);
    const vx = (via.at - 2 + 1.5) * TILE, vz = ((via.viaduct[0] + via.viaduct[1]) / 2) * TILE;
    out.hViaduct = W.heightAt(vx, vz, 7); out.hUnderViaduct = W.heightAt(vx, vz, 0); out.viaductGround = W.tileAt(vx, vz);
    out.viaductPylons = W.props.filter((p) => p.kind === 'pillar' && p.y < -1 && W.tileAt(p.x, p.z) === T.WATER).length;
    const south = CW.layout.loop.legs.find((l) => l.axis === 'h' && l.at === 166);
    const sx = ((south.from + south.to) / 2) * TILE, sz = (south.at - 2 + 1.5) * TILE;
    out.hSouthLeg = W.heightAt(sx, sz, 7); out.southLegUnder = W.heightAt(sx, sz, 0);
    // the two new ramps climb to the lower ring
    const arr = W.ramps.find((rp2) => rp2.name === 'Arrivals Ramp'), man = W.ramps.find((rp2) => rp2.name === 'Manifest Ramp');
    // a0 is the ground end, a1 the deck end along the ramp's axis; sample a metre inside each end
    out.hArrivalsTop = arr ? W.heightAt((arr.x0 + arr.x1) / 2, arr.a1 - arr.dir, 0) : -1; out.hArrivalsFoot = arr ? W.heightAt((arr.x0 + arr.x1) / 2, arr.a0 + arr.dir, 0) : -1;
    out.hManifestTop = man ? W.heightAt(man.a1 - man.dir, (man.z0 + man.z1) / 2, 0) : -1; out.hManifestFoot = man ? W.heightAt(man.a0 + man.dir, (man.z0 + man.z1) / 2, 0) : -1;
    out.lowerRamps = W.ramps.filter((rp2) => rp2.lower).map((rp2) => rp2.name);
    // both bridges: a deck at 0 over water with walkways, the lane field on the deck
    const bsLm = W.landmark('bridge_south'), cwLm = W.landmark('causeway_east');
    const bsx = 82 * TILE, bsz = 140 * TILE, cwx = 158 * TILE, cwz = 70 * TILE;
    out.bridgeSouth = { tile: W.tileAt(bsx, bsz), h: W.heightAt(bsx, bsz, 0), lane: !!W.roadDir(bsx, bsz, 0), walk: W.tileAt(bsLm.door.x, bsLm.door.z), under: W.tileAt(bsx + 4 * TILE + 6, bsz) };
    out.causeway = { tile: W.tileAt(cwx, cwz), h: W.heightAt(cwx, cwz, 0), lane: !!W.roadDir(cwx, cwz, 0), walk: W.tileAt(cwLm.door.x, cwLm.door.z), under: W.tileAt(cwx, cwz + 3 * TILE) };
    out.gantries = W.props.filter((p) => p.kind === 'gantry').length;
    // the runway: a PARKING strip flagged RUNWAY, never in the lane field, never a parked-car tile; the apron around it
    let runwayTiles = 0, runwayLane = 0, runwayBay = 0, runwayLaneField = 0;
    for (let i = 0; i < N; i++) if (W.meta[i] & M.RUNWAY) {
      runwayTiles++;
      const tx = i % W.w, tz = (i / W.w) | 0;
      if (W.tiles[i] !== T.PARKING) runwayBay++;
      if (W.roadDir((tx + 0.5) * TILE, (tz + 0.5) * TILE, 0)) runwayLane++;
      if (W.laneH[i] || W.laneV[i]) runwayLaneField++;
      if (!(W.meta[i] & M.YARD)) runwayBay++;
    }
    out.runway = { tiles: runwayTiles, lane: runwayLane, laneField: runwayLaneField, notParking: runwayBay, h: W.heightAt(rw.points.east.x, rw.points.east.z, 0), rows: new Set() };
    for (let i = 0; i < N; i++) if (W.meta[i] & M.RUNWAY) out.runway.rows.add((i / W.w) | 0);
    out.runway.rows = Array.from(out.runway.rows).sort((a, b) => a - b);
    out.runwayParkable = (GTP.AI.spawner.parkTiles || []).filter((ti) => W.meta[ti] & M.RUNWAY).length;
    // the stunt wedges: ten of them, each with a real sloped top under the wheels (and nothing under the deck ones at ground level)
    out.stunts = W.stuntRamps.map((s) => s.id);
    const sj = W.stuntRamps.find((s) => s.id === 'sj_07');
    const f = GTP.util.yawToDir(sj.yaw);
    out.wedge = { back: W.heightAt(sj.x - f.x * 2.9, sj.z - f.z * 2.9, sj.y), front: W.heightAt(sj.x + f.x * 2.9, sj.z + f.z * 2.9, sj.y), base: sj.y, beside: W.heightAt(sj.x - f.z * 3, sj.z + f.x * 3, sj.y) };
    const sj3 = W.stuntRamps.find((s) => s.id === 'sj_03');
    out.wedgeDeck = { base: sj3.y, top: W.heightAt(sj3.x, sj3.z, 7), ground: W.heightAt(sj3.x, sj3.z, 0) };
    // solid inside buildings, not on doors or roads
    out.solidIn = B.slice(0, 40).every((b) => W.solidAt(b.cx, b.cz, 1));
    out.solidAbove = W.solidAt(B[0].cx, B[0].cz, B[0].y + B[0].h + 1);
    out.solidDoor = W.landmarks.some((l) => W.solidAt(l.door.x, l.door.z, 0.5));
    out.solidRoad = W.solidAt(rp.x, rp.z, 0.5);
    // resolveCapsule pushes a circle out of a building, and out of a parked airliner
    const b0 = B[0]; const res = W.resolveCapsule(b0.x + 0.2, b0.cz, 0, 0.4);
    out.pushOut = res.x <= b0.x - 0.39 || res.x >= b0.x + b0.w + 0.39 || res.z <= b0.z - 0.39 || res.z >= b0.z + b0.d + 0.39;
    const plane = W.props.find((p) => p.kind === 'plane' && !p.hidden && p.r >= 7);
    const pres = W.resolveCapsule(plane.x + 1, plane.z, 0, 0.4);
    out.planeSolid = Math.hypot(pres.x - plane.x, pres.z - plane.z) >= plane.r + 0.39;
    // pathing: car from the quad to the stadium (over the bridge), to the airport terminal (over the Sponsor Span) and to
    // the museum (over both bridges); ped to the dorm
    const a = W.landmark('campus_quad').door, s = W.landmark('stadium').door, dm = W.landmark('dorm_studio').door;
    const carPath = W.findPath(a.x, a.z, s.x, s.z, { mode: 'car' });
    out.carPath = carPath ? carPath.length : 0;
    // waypoints are corners (collinear points are merged), so check that a segment crosses the channel
    const channel = CW.layout.land[0].x + CW.layout.land[0].w, channel1 = CW.layout.land[1].x;
    out.carPathBridge = !!carPath && carPath.some((p, i) => i > 0 && Math.min(p.x, carPath[i - 1].x) < channel * TILE && Math.max(p.x, carPath[i - 1].x) > channel1 * TILE);
    out.carPathEnd = carPath ? Math.hypot(carPath[carPath.length - 1].x - s.x, carPath[carPath.length - 1].z - s.z) : 1e9;
    let carLen = 0; if (carPath) for (let i = 1; i < carPath.length; i++) carLen += Math.hypot(carPath[i].x - carPath[i - 1].x, carPath[i].z - carPath[i - 1].z);
    out.carLen = Math.round(carLen);
    const term = W.landmark('airport_terminal').door, mus = W.landmark('museum_of_takes').door;
    const pathAir = W.findPath(a.x, a.z, term.x, term.z, { mode: 'car', maxExpansions: 60000 });
    out.carPathAirport = pathAir ? pathAir.length : 0; out.carPathAirportEnd = pathAir ? Math.hypot(pathAir[pathAir.length - 1].x - term.x, pathAir[pathAir.length - 1].z - term.z) : 1e9;
    out.carPathAirportBay = !!pathAir && pathAir.some((p, i) => i > 0 && Math.min(p.z, pathAir[i - 1].z) < 130 * TILE && Math.max(p.z, pathAir[i - 1].z) > 150 * TILE);
    const pathMus = W.findPath(a.x, a.z, mus.x, mus.z, { mode: 'car', maxExpansions: 60000 });
    out.carPathMuseum = pathMus ? pathMus.length : 0; out.carPathMuseumEnd = pathMus ? Math.hypot(pathMus[pathMus.length - 1].x - mus.x, pathMus[pathMus.length - 1].z - mus.z) : 1e9;
    const pedPath = W.findPath(a.x, a.z, dm.x, dm.z, { mode: 'ped' });
    out.pedPath = pedPath ? pedPath.length : 0;
    // road direction field is right-hand: on an eastbound lane the lane centre is to the north of the road axis
    const rd = W.roadDir(rp.x, rp.z, 0); out.roadDir = !!rd && Math.abs(rd.dx) + Math.abs(rd.dz) === 1;
    // props and spawn data
    const kinds = {}; W.props.forEach((p) => { kinds[p.kind] = (kinds[p.kind] || 0) + 1; });
    out.props = kinds;
    out.billboardPairs = W.props.filter((p) => p.kind === 'billboard' && p.landmark === 'impression_alley').length;
    out.strollPairs = W.props.filter((p) => p.kind === 'billboard' && p.promenade === 'shoreline_stroll').length;
    out.playerSpawn = CW.playerSpawn; out.spawnOk = !!(CW.spawn && CW.spawn.peds && CW.spawn.vehicles && CW.spawn.pickups);
    out.spawnDistricts = ['uptown', 'airport', 'port'].every((d) => CW.spawn.peds.rolesByDistrict[d] && CW.spawn.peds.density[d] && CW.spawn.vehicles.byDistrict[d] && CW.spawn.vehicles.parked.byDistrict[d]);
    out.lookPool = typeof CW.spawn.peds.lookPool === 'function' ? CW.spawn.peds.lookPool('campus').length : -1;
    out.districtAtSpawn = W.districtAt(GTP.game.player.x, GTP.game.player.z).id;
    out.npcs = { club: (W.landmark('heirloom_club').npcs || []).map((n) => n.role), shop: (W.landmark('both_sides_strip').npcs || []).map((n) => n.role) };
    out.maze = !!W.landmark('container_yard').maze; out.range = !!W.landmark('both_sides_strip').range;
    out.generateMs = Math.round(W.generateMs);
    // the radius-bucketed tile lists for the spawner: a superset of the tiles within r, all of them road / sidewalk
    const nr = W.tilesNear(a.x, a.z, 150), ns = W.tilesNear(a.x, a.z, 150, 'sidewalk');
    out.near = { road: nr.length, sidewalk: ns.length, allRoad: nr.every((i) => W.tiles[i] === T.ROAD), allWalk: ns.every((i) => W.tiles[i] === T.SIDEWALK), within: nr.every((i) => Math.hypot((i % W.w + 0.5) * TILE - a.x, (((i / W.w) | 0) + 0.5) * TILE - a.z) < (150 + 64) * Math.SQRT2), total: W._roadTiles.length };
    // determinism and progress: regenerating with the same seed gives the same tiles and reports its stages in order
    const sum1 = W.tiles.reduce((acc, v, i) => (acc + v * (i % 97)) | 0, 0) ^ W.props.length;
    const stages = [], fracs = [], labels = [];
    const onEv = (e) => { if (e.source === 'world') stages.push(e.stage); };
    GTP.Events.on('load:progress', onEv);
    W._seed = null; W.generate(7, (frac, label) => { fracs.push(frac); labels.push(label); });
    GTP.Events.off('load:progress', onEv);
    const sum2 = W.tiles.reduce((acc, v, i) => (acc + v * (i % 97)) | 0, 0) ^ W.props.length;
    out.deterministic = sum1 === sum2;
    out.progress = { stages, fracs, labels, monotonic: fracs.every((f2, i) => i === 0 || f2 >= fracs[i - 1]) };
    return out;
  }, { GDD_LANDMARKS, GDD_KINDS, GDD_DOORS, GDD_DISTRICTS, GDD_STREETS, GDD_RAMPS, GDD_STUNTS });
  console.log('  world: ' + JSON.stringify(Object.assign({}, r, { props: undefined })));
  console.log('  props: ' + JSON.stringify(r.props));
  t.assert(r.size.w === 224 && r.size.h === 224 && r.size.cw === 224 && r.size.ch === 224, 'map is 224 x 224 tiles: ' + JSON.stringify(r.size));
  t.assert(r.districts.length === 0, 'districts: ' + r.districts.join(', '));
  t.assert(r.missing.length === 0, 'missing landmarks: ' + r.missing.join(', '));
  t.assert(r.landmarkCount === 60, '34 GDD + 16 expansion + 10 v0.3 places, got ' + r.landmarkCount);
  t.assert(r.wrongDistrict.length === 0, 'wrong district: ' + r.wrongDistrict.join(', '));
  t.assert(r.wrongKind.length === 0, 'wrong kind: ' + r.wrongKind.join(', '));
  t.assert(r.doorBad.length === 0, 'doors: ' + r.doorBad.join('; '));
  t.assert(r.points.runwayEast && r.points.runwayEast[0] === 101 && r.points.runwayEast[1] === 206 && r.points.runwayWest[0] === 20 && r.points.range[0] === 73 && r.points.range[1] === 99 && r.points.island[0] === 154, 'GDD points: ' + JSON.stringify(r.points));
  t.assert(r.rangePointTile === 7, 'the range point stands on the lot (PARKING): ' + r.rangePointTile);
  t.assert(r.overlaps.length === 0, 'overlapping buildings: ' + r.overlaps.slice(0, 10).join(', '));
  t.assert(r.badBuildingIndex === 0, 'building index mismatches: ' + r.badBuildingIndex);
  t.assert(r.buildingsUnderDeck === 0, 'buildings under the Loop deck: ' + r.buildingsUnderDeck);
  t.assert(r.unreachable.length === 0, 'unreachable by road: ' + r.unreachable.join(', '));
  t.assert(r.deckTiles > 1600 && r.deckUnreached === 0, 'figure-eight Loop deck connected: ' + r.deckUnreached + '/' + r.deckTiles + ' unreached');
  t.assert(r.roadUnreached === 0, 'all road tiles connected: ' + r.roadUnreached + '/' + r.roadTiles);
  t.assert(r.streetsMissing.length === 0, 'streets missing: ' + r.streetsMissing.join(', '));
  t.assert(r.rampsMissing.length === 0, 'ramps missing: ' + r.rampsMissing.join(', '));
  t.assert(r.streetsByDistrict.uptown >= 15 && r.streetsByDistrict.airport >= 9 && r.streetsByDistrict.port >= 5, 'street names by district: ' + JSON.stringify(r.streetsByDistrict));
  t.assert(r.loopName === 'The Loop' && r.lowerLoopName === 'The Lower Loop', 'loop names: ' + r.loopName + ' / ' + r.lowerLoopName);
  t.assert(r.chipLower === 'The Loop' && r.chipUpper === 'The Loop' && r.chipUptown === 'Trust Fund Terrace', 'street chip names: ' + JSON.stringify([r.chipLower, r.chipUpper, r.chipUptown]));
  t.assert(r.loopAt.join(',') === 'lower,upper,,lower', 'loopAt tells the rings apart (deck, ground, ramp): ' + JSON.stringify(r.loopAt));
  t.assert(r.hStreet === 0, 'street height 0: ' + r.hStreet);
  t.assert(Math.abs(r.hDeck - 7) < 0.01, 'deck height 7: ' + r.hDeck);
  t.assert(r.hUnderDeck < 1, 'ground under the deck: ' + r.hUnderDeck);
  t.assert(r.hRampMid > 2.5 && r.hRampMid < 4.5, 'ramp midpoint interpolates: ' + r.hRampMid);
  t.assert(r.hRampQuarter > 1 && r.hRampQuarter < r.hRampMid, 'ramp quarter below mid: ' + r.hRampQuarter);
  t.assert(Math.abs(r.hWater + 1.2) < 0.01 && Math.abs(r.hOff + 1.2) < 0.01, 'water -1.2: ' + r.hWater + ' ' + r.hOff);
  t.assert(Math.abs(r.hSidewalk - 0.12) < 0.01, 'sidewalk curb height: ' + r.hSidewalk);
  t.assert(Math.abs(r.hViaduct - 7) < 0.01 && Math.abs(r.hUnderViaduct + 1.2) < 0.01 && r.viaductGround === 5, 'viaduct: deck 7 over water: ' + JSON.stringify([r.hViaduct, r.hUnderViaduct, r.viaductGround]));
  t.assert(r.viaductPylons >= 8, 'viaduct pylons stand in the bay: ' + r.viaductPylons);
  t.assert(Math.abs(r.hSouthLeg - 7) < 0.01 && r.southLegUnder < 1, 'Lower Loop south leg at 7 over the airport: ' + r.hSouthLeg + ' / ' + r.southLegUnder);
  t.assert(r.hArrivalsTop > 6 && r.hArrivalsFoot < 1 && r.hManifestTop > 6 && r.hManifestFoot < 1, 'the new ramps climb from the ground to the deck: ' + JSON.stringify([r.hArrivalsFoot, r.hArrivalsTop, r.hManifestFoot, r.hManifestTop]));
  t.assert(r.lowerRamps.length === 2 && r.lowerRamps.indexOf('Arrivals Ramp') >= 0 && r.lowerRamps.indexOf('Manifest Ramp') >= 0, 'the two new ramps belong to the lower ring: ' + r.lowerRamps.join(', '));
  t.assert(r.bridgeSouth.tile === 9 && r.bridgeSouth.h === 0 && r.bridgeSouth.lane && r.bridgeSouth.walk === 2 && r.bridgeSouth.under === 5, 'Sponsor Span: bridge deck at 0 with lanes and a walkway over the bay: ' + JSON.stringify(r.bridgeSouth));
  t.assert(r.causeway.tile === 9 && r.causeway.h === 0 && r.causeway.lane && r.causeway.walk === 2 && r.causeway.under === 5, 'the causeway: bridge deck at 0 with lanes and a walkway over the channel: ' + JSON.stringify(r.causeway));
  t.assert(r.gantries === 2, 'two toll gantries on the Sponsor Span: ' + r.gantries);
  t.assert(r.runway.tiles >= 500 && r.runway.lane === 0 && r.runway.laneField === 0 && r.runway.notParking === 0 && r.runway.h === 0, 'runway strip: parking tiles, no lanes: ' + JSON.stringify(Object.assign({}, r.runway, { rows: undefined })));
  t.assert(r.runway.rows.length === 6 && r.runway.rows[0] === 204 && r.runway.rows[5] === 209, 'runway strip rows z 204..209: ' + r.runway.rows.join(','));
  t.assert(r.runwayParkable === 0, 'the traffic spawner never parks on the runway: ' + r.runwayParkable);
  t.assert(GDD_STUNTS.every((id) => r.stunts.indexOf(id) >= 0) && r.stunts.length === 10, 'ten stunt wedges: ' + r.stunts.join(','));
  t.assert(Math.abs(r.wedge.back - r.wedge.base) < 0.1 && r.wedge.front > r.wedge.base + 1.1 && r.wedge.front <= r.wedge.base + 1.3 && Math.abs(r.wedge.beside - r.wedge.base) < 0.05, 'a stunt wedge rises 1.3 m along its heading: ' + JSON.stringify(r.wedge));
  t.assert(Math.abs(r.wedgeDeck.base - 7) < 0.01 && r.wedgeDeck.top > 7.3 && r.wedgeDeck.ground < 1, 'the deck wedge sits on the deck and not on the ground beneath: ' + JSON.stringify(r.wedgeDeck));
  t.assert(r.solidIn && !r.solidAbove && !r.solidDoor && !r.solidRoad, 'solidAt: ' + JSON.stringify([r.solidIn, r.solidAbove, r.solidDoor, r.solidRoad]));
  t.assert(r.pushOut, 'resolveCapsule pushes out of a building');
  t.assert(r.planeSolid, 'resolveCapsule pushes out of a parked airliner');
  t.assert(r.carPath >= 3 && r.carPathBridge && r.carPathEnd < 10 && r.carLen > 400, 'car path to the stadium crosses the bridge: ' + JSON.stringify([r.carPath, r.carPathBridge, r.carPathEnd, r.carLen]));
  t.assert(r.carPathAirport >= 3 && r.carPathAirportEnd < 10 && r.carPathAirportBay, 'car path to the airport crosses the bay: ' + JSON.stringify([r.carPathAirport, r.carPathAirportEnd, r.carPathAirportBay]));
  t.assert(r.carPathMuseum >= 3 && r.carPathMuseumEnd < 10, 'car path to the museum: ' + JSON.stringify([r.carPathMuseum, r.carPathMuseumEnd]));
  t.assert(r.pedPath > 1, 'ped path to the dorm');
  t.assert(r.roadDir, 'roadDir on a road tile');
  t.assert(r.props.tree > 200 && r.props.lamp > 100 && r.props.signal > 20 && r.props.bench > 10 && r.props.hydrant > 5 && r.props.table >= 9 && r.props.sign > 20 && r.props.boat >= 8, 'prop counts');
  const missingProps = NEW_PROPS.filter((k) => !(r.props[k] > 0));
  t.assert(missingProps.length === 0, 'expansion prop kinds placed: missing ' + missingProps.join(', '));
  t.assert(r.props.container >= 120 && r.props.crane >= 5 && r.props.plane >= 4 && r.props.edgelight >= 40 && r.props.cutout === 6, 'the yard, the quay, the airport and the range are furnished: ' + JSON.stringify([r.props.container, r.props.crane, r.props.plane, r.props.edgelight, r.props.cutout]));
  t.assert(r.billboardPairs >= 8, 'Impression Alley billboard pairs: ' + r.billboardPairs);
  t.assert(r.strollPairs === 8, 'Shoreline Stroll billboard pairs: ' + r.strollPairs);
  t.assert(r.playerSpawn === 'campus_quad' && r.spawnOk && r.districtAtSpawn === 'campus', 'spawn tables and player spawn');
  t.assert(r.spawnDistricts, 'spawn tables cover the new districts');
  t.assert(r.lookPool > 0, 'lookPool helper: ' + r.lookPool);
  t.assert(r.npcs.club.indexOf('doorman') >= 0 && r.npcs.shop.indexOf('clerk') >= 0 && r.maze && r.range, 'landmark hooks for the other modules (doorman, clerk, maze, range): ' + JSON.stringify(r.npcs));
  t.assert(r.deterministic, 'generation is deterministic');
  t.assert(r.progress.stages.join(',') === 'tiles,roads,landmarks,props,done' && r.progress.monotonic && r.progress.fracs.length === 5 && r.progress.labels.every((l) => typeof l === 'string' && l.length > 3), 'generate reports its stages: ' + JSON.stringify(r.progress));
  t.assert(r.generateMs > 0 && r.generateMs < 1500, 'World.generate stays quick: ' + r.generateMs + ' ms');
  t.assert(r.near.road > 200 && r.near.road < r.near.total / 2 && r.near.sidewalk > 200 && r.near.allRoad && r.near.allWalk && r.near.within, 'tilesNear buckets the spawner tiles around a point: ' + JSON.stringify(r.near));

  // ---- v0.3 (PLAN_V03 "world"): places, doors, helipads, the apron, boat slips, golf, stunt corridors ----
  const v3 = await page.evaluate(() => {
    const W = GTP.World, T = W.T, M = W.M, TILE = GTP.C.TILE, U = GTP.util, CW = GTP.Content.world, out = {};
    const N = W.w * W.h, ROADISH = (tt) => tt === T.ROAD || tt === T.BRIDGE;
    // the road graph from the campus quad (both layers), as above
    const drivable = (node) => { if (node >= N) return !!W.deck[node - N]; const tt = W.tiles[node]; return tt === T.ROAD || tt === T.BRIDGE || tt === T.RAMP; };
    const q0 = W.landmark('campus_quad').door, tx0 = Math.floor(q0.x / TILE), tz0 = Math.floor(q0.z / TILE);
    let start = -1; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ROADISH(W.tile(tx0 + dx, tz0 + dz))) start = (tz0 + dz) * W.w + tx0 + dx;
    const seen = new Uint8Array(2 * N), q = [start], nb = []; seen[start] = 1;
    while (q.length) { const cur = q.pop(); W._neighbors(cur, nb); for (const n of nb) if (!seen[n] && drivable(n)) { seen[n] = 1; q.push(n); } }
    out.places = (CW.places || []).map((pl) => { const l = W.landmark(pl.id); return l ? { id: pl.id, kind: l.kind, district: l.district, b: !!l.building && l.building.landmark === pl.id, h: Math.round(l.building.h), door: !!l.door } : { id: pl.id, missing: true }; });
    // every door marker stands on a kerb tile next to a road the quad's road graph reaches
    out.doorBad = [];
    W.doors.forEach((d) => {
      const tx = Math.floor(d.x / TILE), tz = Math.floor(d.z / TILE);
      if (W.tile(tx, tz) !== T.SIDEWALK) { out.doorBad.push(d.id + ': tile ' + W.tile(tx, tz)); return; }
      let ok = false; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i = (tz + dz) * W.w + tx + dx; if (ROADISH(W.tiles[i]) && seen[i]) ok = true; }
      if (!ok) out.doorBad.push(d.id + ': no reachable road');
      if (W.solidAt(d.x, d.z, 0.5)) out.doorBad.push(d.id + ': solid');
    });
    out.doorKinds = {}; W.doors.forEach((d) => { out.doorKinds[d.kind] = (out.doorKinds[d.kind] || 0) + 1; });
    // each door faces out of its building (the way the player faces stepping out of an interior)
    out.doorYawBad = W.doors.filter((d) => { const l = W.landmark(d.landmark), b = l.building, f = U.yawToDir(d.yaw); if (!b || typeof d.yaw !== 'number') return typeof d.yaw !== 'number'; const c = { x: b.x + b.w / 2, z: b.z + b.d / 2 }; return Math.hypot(d.x + f.x * 2 - c.x, d.z + f.z * 2 - c.z) <= Math.hypot(d.x - c.x, d.z - c.z); }).map((d) => d.id);
    out.shopDoors = ['both_sides_strip', 'both_sides_port', 'both_sides_uptown', 'spin_doctor_strip', 'spin_doctor_port', 'lanyard_downtown', 'lanyard_uptown', 'clip_joint', 'safe_brownstone', 'safe_marina_loft', 'safe_suburb', 'safe_penthouse'].filter((id) => !W.doors.some((d) => d.id === id));
    // a new place never sits on a landmark of v0.2, and claims a building of its own
    const owners = {}; W.buildings.forEach((b) => { if (b.landmark) owners[b.landmark] = (owners[b.landmark] || 0) + 1; });
    out.multiOwned = Object.keys(owners).filter((k) => owners[k] > 1);
    // helipads: clear, flat, off the road, nothing solid on the pad, no parking on it
    out.pads = W.helipads.map((h) => {
      const tiles = []; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) tiles.push(W.tile(h.tx + dx, h.tz + dz));
      const solid = W.props.filter((p) => p.solid && Math.hypot(p.x - h.x, p.z - h.z) < 5.5 + (p.r || 0)).map((p) => p.kind);
      const park = (GTP.AI.spawner.parkTiles || []).filter((ti) => Math.abs((ti % W.w) - h.tx) <= 1 && Math.abs(((ti / W.w) | 0) - h.tz) <= 1).length;
      return { id: h.id, flat: tiles.every((tt) => tt === T.PLAZA || tt === T.PARKING || tt === T.GRASS), solid, park, prop: W.props.some((p) => p.kind === 'helipad' && p.helipad === h.id) };
    });
    out.padIds = W.helipads.map((h) => h.id);
    // the aircraft apron: the plane and the jet on the apron (parking, off the strip), 8 m clear
    out.aircraft = W.aircraft.map((a) => ({ id: a.id, type: a.type, tile: W.tileAt(a.x, a.z), runway: !!(W.metaAt(Math.floor(a.x / TILE), Math.floor(a.z / TILE)) & M.RUNWAY), solid: W.props.filter((p) => p.solid && Math.hypot(p.x - a.x, p.z - a.z) < 8 + (p.r || 0)).map((p) => p.kind) }));
    out.spots = { heli: W.vehicleSpots('heli').length, plane: W.vehicleSpots('plane').length, jet: W.vehicleSpots('jet').length, boat: W.vehicleSpots('boat').length };
    // boat slips on open water (3 x 3 tiles), clear of moored boats, the yacht and the ship
    out.slips = W.boatSlips.map((s2) => { const tx = Math.floor(s2.x / TILE), tz = Math.floor(s2.z / TILE); let water = true; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (W.tile(tx + dx, tz + dz) !== T.WATER) water = false; return { id: s2.id, water, clear: !W.props.some((p) => p.solid && Math.hypot(p.x - s2.x, p.z - s2.z) < (p.r || 0.4) + 3.9) }; });
    out.slipLandmarks = Array.from(new Set(W.boatSlips.map((s2) => s2.landmark)));
    // golf: nine holes on the links' lawn, tees and pins clear of trees, landmark points tee1..pin9
    const gl = W.landmark('goldplate_links');
    out.golf = W.golf ? W.golf.holes.map((h) => ({ n: h.n, par: h.par, len: h.length, tee: W.tileAt(h.tee.x, h.tee.z), pin: W.tileAt(h.pin.x, h.pin.z), inLot: [h.tee, h.pin].every((pt) => { const tx = Math.floor(pt.x / TILE), tz = Math.floor(pt.z / TILE); return tx >= gl.lot.x && tx < gl.lot.x + gl.lot.w && tz >= gl.lot.z && tz < gl.lot.z + gl.lot.d; }), trees: W.props.filter((p) => (p.kind === 'tree' || p.kind === 'palm') && (Math.hypot(p.x - h.tee.x, p.z - h.tee.z) < 3.9 || Math.hypot(p.x - h.pin.x, p.z - h.pin.z) < 3.9)).length, pts: !!(gl.points['tee' + h.n] && gl.points['pin' + h.n]) })) : [];
    // QA-STR-03: each stunt line is clear of furniture within 3 m; anything solid left near it is under 1.2 m or structure
    // out of the flight line (reported)
    out.corridors = W.stuntCorridors.map((c) => {
      // props alongside the line (projection inside the segment), at the jump's level
      const dx = c.x1 - c.x0, dz = c.z1 - c.z0, l2 = dx * dx + dz * dz;
      const near = W.props.filter((p) => { const tt = ((p.x - c.x0) * dx + (p.z - c.z0) * dz) / l2; return tt > 0 && tt < 1 && p.solid && W._segDist(p.x, p.z, c.x0, c.z0, c.x1, c.z1) < 3 + (p.r || 0.4) && (c.y > 3 ? p.y > c.y - 3 : p.y < 3); });
      // the jump's own obstacle (the maze, the container, the cutout jet: p.jumpOver) is what the car flies over
      return { id: c.id, furniture: near.filter((p) => W._clearable[p.kind]).map((p) => p.kind), tall: near.filter((p) => !W._clearable[p.kind] && (p.h || 3) > 1.2 && p.jumpOver !== c.id).map((p) => p.kind + '@' + Math.round(p.x) + ',' + Math.round(p.z)) };
    });
    // nothing solid stands in a bridge's lanes (two marina boats did, on the Sponsor Span)
    out.onBridge = W.props.filter((p) => p.solid && W.tileAt(p.x, p.z) === T.BRIDGE && !p.hidden && p.y < 1).map((p) => p.kind + '@' + Math.round(p.x) + ',' + Math.round(p.z));
    const parkOnLines = (GTP.AI.spawner.parkTiles || []).filter((ti) => W._noPark[ti]).length;
    out.parkOnLines = parkOnLines;
    // the wedges sit on their run-up surface (sj_10: road level, not the kerb)
    out.wedgeBase = W.stuntRamps.map((s2) => { const f = U.yawToDir(s2.yaw); return { id: s2.id, base: +s2.y.toFixed(2), runup: +W.heightAt(s2.x - f.x * 3.4, s2.z - f.z * 3.4, s2.y).toFixed(2) }; });
    // determinism of the v0.3 layer: regenerate and compare
    const sig = () => JSON.stringify([W.doors.map((d) => [d.id, d.x, d.z]), W.helipads.map((h) => [h.x, h.z]), W.boatSlips.map((b) => [b.x, b.z]), W.golf && W.golf.holes.map((h) => [h.tee.x, h.pin.z]), W.props.length]);
    const s1 = sig(); W._seed = null; W.generate(7); out.deterministic = s1 === sig();
    // another seed still finds every place, helipad and door
    W._seed = null; W.generate(11);
    out.seed11 = { places: (CW.places || []).filter((pl) => W.landmark(pl.id)).length, pads: W.helipads.length, doors: W.doors.length, slips: W.boatSlips.length, holes: W.golf ? W.golf.holes.length : 0 };
    W._seed = null; W.generate(7);
    return out;
  });
  console.log('  v0.3: ' + JSON.stringify(v3));
  t.assert(v3.places.length === 10 && v3.places.every((pl) => !pl.missing && pl.b && pl.door), 'the v0.3 places claim buildings with doors: ' + JSON.stringify(v3.places));
  t.assert(v3.places.find((pl) => pl.id === 'safe_penthouse').h >= 50, 'the penthouse tops a tower: ' + JSON.stringify(v3.places.find((pl) => pl.id === 'safe_penthouse')));
  t.assert(v3.multiOwned.length === 0, 'one building per landmark: ' + v3.multiOwned.join(','));
  t.assert(v3.doorBad.length === 0, 'every door marker on a kerb by a reachable road: ' + v3.doorBad.join('; '));
  t.assert(v3.doorYawBad.length === 0, 'doors face the street: ' + v3.doorYawBad.join(', '));
  t.assert(v3.shopDoors.length === 0, 'shop and safehouse door markers: missing ' + v3.shopDoors.join(','));
  t.assert(v3.doorKinds.armory === 3 && v3.doorKinds.modshop === 2 && v3.doorKinds.clothing === 2 && v3.doorKinds.barber === 1 && v3.doorKinds.safehouse === 4 && v3.doorKinds.garage === 4, 'door kinds: ' + JSON.stringify(v3.doorKinds));
  t.assert(v3.pads.length === 5 && v3.padIds.indexOf('heli_airport') >= 0 && v3.padIds.indexOf('heli_tower') >= 0 && v3.pads.every((h) => h.flat && h.solid.length === 0 && h.park === 0 && h.prop), 'ground-level helipads, clear: ' + JSON.stringify(v3.pads));
  t.assert(v3.aircraft.length === 2 && v3.aircraft.every((a) => a.tile === 7 && !a.runway && a.solid.length === 0), 'the plane and jet wait on the apron: ' + JSON.stringify(v3.aircraft));
  t.assert(v3.spots.heli === 5 && v3.spots.plane === 1 && v3.spots.jet === 1 && v3.spots.boat >= 6, 'World.vehicleSpots: ' + JSON.stringify(v3.spots));
  t.assert(v3.slips.length >= 6 && v3.slips.every((s2) => s2.water && s2.clear) && v3.slipLandmarks.indexOf('velvetine_pier') >= 0 && v3.slipLandmarks.indexOf('manifest_quay') >= 0, 'boat slips at the marina and the port: ' + JSON.stringify(v3.slips));
  t.assert(v3.golf.length === 9 && v3.golf.every((h) => h.tee === 4 && h.pin === 4 && h.inLot && h.trees === 0 && h.pts && h.len > 20), 'nine golf holes on the links: ' + JSON.stringify(v3.golf));
  t.assert(v3.corridors.length === 10 && v3.corridors.every((c) => c.furniture.length === 0), 'stunt lines cleared of furniture: ' + JSON.stringify(v3.corridors));
  t.assert(v3.corridors.every((c) => c.tall.length === 0), 'no tall structure on a stunt line: ' + JSON.stringify(v3.corridors.filter((c) => c.tall.length)));
  t.assert(v3.onBridge.length === 0, 'nothing solid in the bridge lanes: ' + v3.onBridge.join(', '));
  t.assert(v3.parkOnLines === 0, 'no parking bays on the stunt lines, pads, apron or links: ' + v3.parkOnLines);
  t.assert(v3.wedgeBase.every((w2) => Math.abs(w2.base - w2.runup) < 0.05), 'every wedge sits on its run-up surface: ' + JSON.stringify(v3.wedgeBase));
  t.assert(v3.deterministic, 'the v0.3 layer is deterministic');
  t.assert(v3.seed11.places === 10 && v3.seed11.pads === 5 && v3.seed11.doors === 16 && v3.seed11.holes === 9 && v3.seed11.slips >= 6, 'seed 11 places everything too: ' + JSON.stringify(v3.seed11));

  // ---- QA-STR-03: drive every stunt jump (a sports car 40 m back, full throttle, held on the line until it launches) ----
  const jumps = await page.evaluate(() => {
    const W = GTP.World, U = GTP.util, E = GTP.Entities, g = GTP.game, p = g.player, St = GTP.Strands;
    if (!St || !St.stunts) return null;
    const out = {};
    let last = null; const on = (e) => { last = e; }; GTP.Events.on('stunt:land', on);
    for (const r of W.stuntRamps) {
      // 40 m of run-up; the deck jump (sj_03) runs across the 16 m deck from its south edge
      const back = r.y > 3 ? 7.5 : 40, f = U.yawToDir(r.yaw), sx = r.x - f.x * back, sz = r.z - f.z * back;
      if (p.inVehicle) p.exitVehicle();
      if (p.alive && p.maxHp) p.hp = p.maxHp;
      E.list.forEach((e) => { if (!e.removed && e !== p && (e.kind === 'vehicle' || e.kind === 'ped') && !e.persistent && Math.hypot(e.x - r.x, e.z - r.z) < 90) e.destroy(); });
      const v = new GTP.Vehicle({ x: sx, z: sz, type: 'sports' }); v.y = W.heightAt(sx, sz, r.y); v.yaw = r.yaw; v.snap(); E.add(v);
      const sd = W.solidAt(sx - f.z * 2.5, sz + f.x * 2.5, v.y + 0.5) ? -1 : 1;   // the clear side of the car (the yard's lanes are narrow)
      g.debug.teleport(sx + 3, sz); p.x = sx - f.z * 2.5 * sd; p.z = sz + f.x * 2.5 * sd; p.y = v.y; p.snap(); p.enterVehicle(v, 0);
      for (let k = 0; k < 60 && p.inVehicle !== v; k++) { g.advance(0.1); if (k % 10 === 9 && !p.entering && p.inVehicle !== v) { p.x = sx - f.z * 2.5 * sd; p.z = sz + f.x * 2.5 * sd; p.y = v.y; p.snap(); p.enterVehicle(v, 0); } }   // the walk to the door and the climb in
      v.x = sx; v.z = sz; v.y = W.heightAt(sx, sz, r.y); v.yaw = r.yaw; v.vx = v.vz = 0; v.snap();
      last = null; GTP.Input.set('forward', true);
      let launched = false, top = 0;
      for (let i = 0; i < 12 * 30 && !last; i++) {
        if (!launched && v.onGround) {
          // hold the car on the ramp's centre line until it leaves the wedge
          const dx = v.x - r.x, dz = v.z - r.z, along = dx * f.x + dz * f.z;
          if (along < -2) { v.x = r.x + f.x * along; v.z = r.z + f.z * along; v.yaw = r.yaw; const sp = Math.hypot(v.vx, v.vz); v.vx = f.x * sp; v.vz = f.z * sp; }
        }
        if (!v.onGround && Math.hypot(v.x - r.x, v.z - r.z) < 12) launched = true;
        top = Math.max(top, Math.hypot(v.vx, v.vz));
        g.advance(1 / 30);
      }
      GTP.Input.set('forward', false);
      out[r.id] = last ? { ok: last.ok, air: last.airT, reason: last.reason, speed: last.speed, inZone: last.inZone } : { ok: false, reason: 'no landing', launched, top: Math.round(top), at: [Math.round(v.x), Math.round(v.z)], state: g.state, seated: p.inVehicle === v, ts: g.timeScale };
      // stop before stepping out: bailing from a moving car hurts (v0.3), and nine bails in a row used to kill the player before sj_10
      v.vx = v.vz = 0; v.speed = 0; if (p.inVehicle) p.exitVehicle(); g.advance(1.2); v.destroy(); g.advance(0.2);
    }
    GTP.Events.off('stunt:land', on);
    g.timeScale = 1;
    return out;
  });
  console.log('  stunt jumps: ' + JSON.stringify(jumps));
  if (jumps) t.assert(Object.keys(jumps).length === 10 && Object.values(jumps).every((j) => j.ok), 'all ten stunt jumps can be landed (QA-STR-03): ' + JSON.stringify(jumps));

  // ---- screenshots of the new places (look at them) ----
  const views = await page.evaluate(() => {
    const W = GTP.World, U = GTP.util, out = [];
    function door(id) { return W.doors.find((d) => d.id === id); }
    function face(id) { const l = W.landmark(id), d = l.door, b = l.building; return { x: d.x, z: d.z, tx: b ? b.x + b.w / 2 : l.x, tz: b ? b.z + b.d / 2 : l.z }; }
    ['spin_doctor_strip', 'lanyard_downtown', 'clip_joint', 'safe_brownstone', 'safe_penthouse', 'hangar_two'].forEach((id) => { const f = face(id); out.push({ name: id, x: f.x, z: f.z, tx: f.tx, tz: f.tz, back: 9 }); });
    const h = W.helipads.find((p) => p.id === 'heli_airport'); out.push({ name: 'heli_airport', x: h.x + 14, z: h.z + 10, tx: h.x, tz: h.z, back: 0 });
    const ht = W.helipads.find((p) => p.id === 'heli_tower'); out.push({ name: 'heli_tower', x: ht.x + 12, z: ht.z + 9, tx: ht.x, tz: ht.z, back: 0 });
    const g1 = W.golf.holes[0]; out.push({ name: 'golf_hole1', x: g1.tee.x - 3, z: g1.tee.z - 3, tx: g1.pin.x, tz: g1.pin.z, back: 0 });
    // a slip from the shore behind it (its yaw points out to sea)
    const sl = W.boatSlips[0], sf = U.yawToDir(sl.yaw); let bx = sl.x, bz = sl.z; for (let k = 0; k < 40 && W.tileAt(bx, bz) === W.T.WATER; k++) { bx -= sf.x; bz -= sf.z; }
    out.push({ name: 'boat_slip', x: bx - sf.x * 3, z: bz - sf.z * 3, tx: sl.x, tz: sl.z, back: 0 });
    const ap = W.aircraft[0]; out.push({ name: 'apron', x: ap.x - 16, z: ap.z - 14, tx: ap.x + 10, tz: ap.z, back: 0 });
    const sj = W.stuntRamps.find((s) => s.id === 'sj_10'); const f10 = U.yawToDir(sj.yaw); out.push({ name: 'stunt_sj10', x: sj.x - f10.x * 14, z: sj.z - f10.z * 14, tx: sj.landing.x, tz: sj.landing.z, back: 0 });
    void door;
    return out;
  });
  for (const v of views) {
    await page.evaluate((v) => {
      const W = GTP.World, U = GTP.util, p = GTP.game.player;
      let x = v.x, z = v.z;
      if (v.back) { const dx = v.x - v.tx, dz = v.z - v.tz, l = Math.hypot(dx, dz) || 1; x = v.x + dx / l * v.back; z = v.z + dz / l * v.back; if (W.solidAt(x, z, 0.5)) { x = v.x; z = v.z; } }
      GTP.game.debug.teleport(x, z); GTP.game.advance(0.4);
      const R = GTP.Render.rig; R.yaw = U.dirToYaw(v.tx - p.x, v.tz - p.z); R.pitch = 0.12; R.snap(); GTP.game.advance(0.6);
    }, v);
    await t.shot(page, 'world_' + v.name);
  }
  console.log('  screenshots: ' + views.map((v) => 'tests/out/world_' + v.name + '.png').join(' '));

  // ---- envw2 layout: generation regressions (QA-A-GEO-01, GEO-02, TRF-08, TRF-09, GEO-06, VIS-04, QAC-45) ----
  const lay = await page.evaluate(() => {
    const W = GTP.World, T = W.T, M = W.M, N = W.w * W.h, out = {};
    // GEO-01: no building stands on a tile of the lane field (a road stamped first, a footprint over it later)
    out.buildingOnLane = [];
    for (let i = 0; i < N; i++) if (W.tiles[i] === T.BUILDING && (W.laneH[i] || W.laneV[i] || W.roadId[i])) out.buildingOnLane.push((i % W.w) + ',' + ((i / W.w) | 0));
    // GEO-01: a ground lane never ends against a building or a ramp's deck end: the tile past the last lane tile of each
    // axis run is road, ramp foot, sidewalk or open ground (never BUILDING, never a RAMP tile above kerb height)
    out.laneIntoWall = [];
    for (let z = 0; z < W.h; z++) for (let x = 0; x < W.w; x++) {
      const i = z * W.w + x; if (W.tiles[i] !== T.ROAD) continue;
      [['h', 1, 0], ['h', -1, 0], ['v', 0, 1], ['v', 0, -1]].forEach(([ax, dx, dz]) => {
        if (!(ax === 'h' ? W.laneH[i] : W.laneV[i])) return;
        const nx = x + dx, nz = z + dz; if (!W.inBounds(nx, nz)) return;
        const j = nz * W.w + nx, tj = W.tiles[j];
        if (tj === T.BUILDING || (tj === T.RAMP && W.rampY[j] > 0.6)) out.laneIntoWall.push(x + ',' + z + '>' + nx + ',' + nz + ' ' + (tj === T.RAMP ? 'ramp ' + W.rampY[j].toFixed(1) : 'building'));
      });
    }
    // TRF-09: every junction box (the crossing of an h band and a v band, sized from the lane bytes) carries both axes
    out.halfBox = []; const seen = new Set();
    for (let z = 0; z < W.h; z++) for (let x = 0; x < W.w; x++) {
      const i = z * W.w + x; if (W.tiles[i] !== T.ROAD || !W.laneH[i] || !W.laneV[i]) continue;
      const hz0 = z - (W.laneH[i] >> 4), hw = W.laneH[i] & 15, vx0 = x - (W.laneV[i] >> 4), vw = W.laneV[i] & 15;
      for (let bz = hz0; bz < hz0 + hw; bz++) for (let bx = vx0; bx < vx0 + vw; bx++) {
        const j = bz * W.w + bx; if (seen.has(j)) continue; seen.add(j);
        if (!W.laneH[j] || !W.laneV[j]) out.halfBox.push(bx + ',' + bz);
      }
    }
    out.rampPosts = W.props.filter((p) => p.rampEnd).length;
    // VIS-04: no tree canopy (05_assets tree 2.34 m, palm 2.6 m, x scale) reaches more than 0.6 m into a building
    const TILE = GTP.C.TILE; out.treesInWalls = [];
    W.props.forEach((p) => {
      if (p.kind !== 'tree' && p.kind !== 'palm') return;
      let g = 1e9; const tx0 = Math.floor(p.x / TILE), tz0 = Math.floor(p.z / TILE);
      for (let tz = tz0 - 2; tz <= tz0 + 2; tz++) for (let tx = tx0 - 2; tx <= tx0 + 2; tx++) if (W.tile(tx, tz) === T.BUILDING) g = Math.min(g, Math.hypot(Math.max(tx * TILE - p.x, 0, p.x - (tx + 1) * TILE), Math.max(tz * TILE - p.z, 0, p.z - (tz + 1) * TILE)));
      if ((p.kind === 'palm' ? 2.6 : 2.34) * (p.scale || 1) - g > 0.6) out.treesInWalls.push(p.x.toFixed(1) + ',' + p.z.toFixed(1));
    });
    out.trees = W.props.filter((p) => p.kind === 'tree' || p.kind === 'palm').length;
    // QAC-45: pole billboards are wider than tall (a duplicate h key made them 9 x 9 m)
    out.squareBoards = W.props.filter((p) => p.kind === 'billboard' && p.pole && !(p.h < p.w)).length;
    // GEO-06: every land tile (the ferry pier included) belongs to a district
    out.noDistrict = 0; for (let i = 0; i < N; i++) if (W.tiles[i] !== T.WATER && !W.zone[i]) out.noDistrict++;
    out.ferryPier = (W.districtAt(770, 870) || {}).id || null;
    const ccc = W.landmark('memo_press');
    out.memo = ccc && ccc.building ? [ccc.building.tx, ccc.building.tz, ccc.building.tw, ccc.building.td] : null;
    out.coupon = W.streetAt ? [W.streetAt(30 * 4, 122 * 4), W.streetAt(60 * 4, 122 * 4)] : null;
    return out;
  });
  console.log('  envw2 layout: ' + JSON.stringify(lay).slice(0, 600));
  t.assert(lay.buildingOnLane.length === 0, 'no building tile carries lane bytes or a road id (QA-A-GEO-01): ' + lay.buildingOnLane.slice(0, 10).join(' '));
  t.assert(lay.laneIntoWall.length === 0, 'no ground lane runs into a building wall or a ramp deck end (QA-A-GEO-01/02, TRF-08): ' + lay.laneIntoWall.slice(0, 10).join(' '));
  t.assert(lay.halfBox.length === 0, 'every junction box carries both lane axes (QA-A-TRF-09): ' + lay.halfBox.join(' '));
  t.assert(lay.treesInWalls.length === 0 && lay.trees > 600, 'tree canopies stay out of the facades (QA-A-VIS-04): ' + lay.trees + ' trees, in walls ' + lay.treesInWalls.slice(0, 8).join(' '));
  t.assert(lay.noDistrict === 0 && lay.ferryPier === 'port', 'every land tile has a district, the ferry pier reads Manifest Harbor (QA-A-GEO-06): ' + lay.noDistrict + ' ' + lay.ferryPier);
  t.assert(lay.squareBoards === 0,'pole billboards are 9 x 3.4 m panels, not 9 x 9 (QAC-45): ' + lay.squareBoards);
  t.assert(lay.rampPosts >= 30,'bollards stand in front of the ramps\' deck-end faces on the plaza under the Loop: ' + lay.rampPosts);
  // TRF-08 / GEO-02: an AI car climbing the Manifest Ramp westbound comes out on the Lower Loop deck (it used to keep
  // the ground street's lane and hit the deck's far barrier, or a street car rammed the ramp's 7 m end)
  const manifest = await page.evaluate(() => {
    const W = GTP.World, E = GTP.Entities, g = GTP.game, A = GTP.AI;
    if (!A || !A.spawner || !A.spawner.placeTraffic) return null;
    E.list.forEach((e) => { if (!e.removed && e !== g.player && e.kind === 'vehicle' && !e.persistent && Math.hypot(e.x - 440, e.z - 632) < 120) e.destroy(); });
    g.debug.teleport(470, 600); g.advance(0.2);
    const v = A.spawner.placeTraffic({ x: 464, z: 630, y: 0, axis: 'h', dir: -1, laneC: 630 }, 'sedan');
    if (!v) return { placed: false };
    let maxY = 0, minX = 1e9;
    for (let i = 0; i < 14 * 10; i++) { g.advance(0.1); if (v.removed) break; maxY = Math.max(maxY, v.y); minX = Math.min(minX, v.x); }
    const out = { placed: true, maxY: +maxY.toFixed(2), minX: Math.round(minX), at: [Math.round(v.x), Math.round(v.z), +v.y.toFixed(1)], removed: !!v.removed };
    if (!v.removed) v.destroy();
    return out;
  });
  console.log('  Manifest Ramp climb: ' + JSON.stringify(manifest));
  if (manifest && manifest.placed) t.assert(manifest.maxY > 6 && !(manifest.at[2] > 6 && manifest.at[0] > 400 && manifest.at[0] < 420 && Math.abs(manifest.at[1] - 632) < 6), 'an AI car climbing the Manifest Ramp reaches the Lower Loop deck and drives on (QA-A-TRF-08): ' + JSON.stringify(manifest));
  // ==== world-collision block (envw2/world-collision): the interior hooks, the fast path, QAC-56/57/22, QA-A-DRV-03/04/05 ====
  const col = await page.evaluate(() => {
    const W = GTP.World, T = W.T, out = {};
    // the six queries are World's own (13_interiors' wrappers adopted or replaced by hooks) and keep the interiors flag
    out.native = ['heightAt', 'solidAt', 'resolveCapsule', 'raycastBuildings', 'tileAt', 'districtAt'].every((n) => /FAR_X/.test(String(W[n])));
    out.flag = !!(W.resolveCapsule._interiors && W.heightAt._interiors && W.solidAt._interiors);
    // hooks: a fake room at x -5000; inside it the hooks answer, outside it (and in the city) World does
    const prev = W.interiorHooks, fake = { id: 'fake' }, seen = [];
    W.setInteriorHooks({ roomAt: (x, z) => (x > -5010 && x < -4990 && z > -10 && z < 10 ? fake : null),
      height: (rm, x, z, y) => { seen.push('h' + y); return 2.5; }, solid: (rm, x, z, y) => { seen.push('s' + y); return true; },
      resolve: (rm, x, z, y, r) => { seen.push('r' + y + '/' + r); return { x: x + 1, z, hitX: true, hitZ: false, normal: { x: 1, z: 0 }, prop: null }; },
      ray: (rm) => ({ t: 1, interior: rm.id }), tile: () => T.PLAZA, district: () => ({ id: 'indoors' }) });
    out.hook = { h: W.heightAt(-5000, 0), s: W.solidAt(-5000, 0), r: W.resolveCapsule(-5000, 0).x, ray: (W.raycastBuildings(-5000, 1, 0, 1, 0, 0, 10) || {}).interior, tile: W.tileAt(-5000, 0), d: (W.districtAt(-5000, 0) || {}).id, seen: seen.join(','),
      outside: W.heightAt(-4000, 0), city: W.heightAt(300, 300, 0) };
    W.setInteriorHooks(prev);
    // the fast path: a road capsule with nothing around answers unchanged; one against a building is pushed
    let k = 0; while (!(W.tiles[k] === T.ROAD && W._colTile[k] === 0 && !W.deck[k])) k++;
    const rx = (k % W.w + 0.5) * 4, rz = (Math.floor(k / W.w) + 0.5) * 4, rr = W.resolveCapsule(rx, rz, 0, 0.32);
    out.fast = { same: rr.x === rx && rr.z === rz && !rr.hitX && !rr.hitZ };
    const b = W.buildings[5], pb = W.resolveCapsule(b.x - 0.1, b.z + b.d / 2, 0.12, 0.4);
    out.fast.building = +(b.x - pb.x).toFixed(3);
    // QAC-57: NaN in, a finite in-map answer out; a NaN height hint reads as no hint
    const nq = W.resolveCapsule(NaN, 40, 0, 0.4), nx = nq.x, nz = nq.z;
    const deckI = W.deck.indexOf(T.HIGHWAY), dx = (deckI % W.w + 0.5) * 4, dz = (Math.floor(deckI / W.w) + 0.5) * 4;
    const a1 = W.resolveCapsule(b.x - 0.1, b.z + b.d / 2, NaN, 0.4).x, a2 = W.resolveCapsule(b.x - 0.1, b.z + b.d / 2, 0, 0.4).x;
    out.nan = { finite: isFinite(nx) && isFinite(nz) && nx > 0 && nz > 0 && nx < W.bounds.x1 && nz < W.bounds.z1, hint: W.heightAt(dx, dz, NaN) === W.heightAt(dx, dz, null), y: a1 === a2 };
    // QAC-56: a capsule at a solid prop's exact centre is pushed clear of it, with a normal
    const bench = W.props.find((p) => p.kind === 'bench' && p.solid && !p.fallen), q56 = W.resolveCapsule(bench.x, bench.z, bench.y, 0.4);
    out.centre = { d: +Math.hypot(q56.x - bench.x, q56.z - bench.z).toFixed(3), need: bench.r + 0.4, normal: Math.abs(q56.normal.x) + Math.abs(q56.normal.z) };
    // QA-A-DRV-04 / 05: a container is a 2.4 x 6 m box, a hedge its sx x sz box (a point 2.4 m along a container from its
    // centre sat outside the old 1.3 m circle)
    const boxes = W.props.filter((p) => p.kind === 'container' && p.solid && !p.rot);
    const cont = boxes.find((c) => !boxes.some((q) => q !== c && Math.abs(q.x - c.x - 2.7) < 0.3 && Math.abs(q.z - c.z) < 4)), qc = W.resolveCapsule(cont.x + 1.4, cont.z + 2.4, cont.y + 0.5, 0.4);
    out.container = { x: +(qc.x - cont.x).toFixed(3), outX: qc.x - cont.x >= 1.2 + 0.4 - 0.01 };
    const hedge = W.props.find((p) => p.kind === 'hedge' && (p.sz || 0) > 8), qh = W.resolveCapsule(hedge.x - 0.2, hedge.z + hedge.sz / 2 - 1.5, hedge.y, 0.4);
    out.hedge = { outX: +Math.abs(qh.x - hedge.x).toFixed(3), need: 0.5 + 0.4 };
    // QA-A-DRV-03: a bridge walkway's railing (0.2 m in from the water edge) stops a walker or a car point
    let wi = -1, side = 0;
    for (let i = 0; i < W.w * W.h && wi < 0; i++) if ((W.meta[i] & W.M.WALKWAY) && W.tile(i % W.w + 1, (i / W.w) | 0) === T.WATER) { wi = i; side = 1; }
    const wx = (wi % W.w + 1) * 4 - 0.15, wz = (Math.floor(wi / W.w) + 0.5) * 4, qw = Object.assign({}, W.resolveCapsule(wx, wz, 0.2, 0.4)), qb = W.resolveCapsule(wx, wz, -0.7, 0.4);
    out.rail = { found: wi >= 0 && side === 1, x: +(qw.x - (wi % W.w + 1) * 4).toFixed(3), hitX: qw.hitX, boat: qb.x === wx };
    return out;
  });
  console.log('  collision: ' + JSON.stringify(col));
  t.assert(col.native && col.flag, 'World answers its six queries itself, the interiors flag kept: ' + JSON.stringify(col));
  t.assert(col.hook.h === 2.5 && col.hook.s === true && col.hook.r === -4999 && col.hook.ray === 'fake' && col.hook.tile === 8 && col.hook.d === 'indoors' && col.hook.seen === 'h0,s0,r0/0.4' && col.hook.outside === -1.2 && (col.hook.city === 0.12 || col.hook.city === 0),'World.setInteriorHooks answers inside a room only (y defaulted, r 0.4): ' + JSON.stringify(col.hook));
  t.assert(col.fast.same && col.fast.building >= 0.39, 'fast path: an empty road answers unchanged, a building still pushes: ' + JSON.stringify(col.fast));
  t.assert(col.nan.finite && col.nan.hint && col.nan.y, 'QAC-57: NaN positions and hints recover: ' + JSON.stringify(col.nan));
  t.assert(col.centre.d >= col.centre.need - 0.01 && col.centre.normal === 1, 'QAC-56: a capsule at a prop centre is pushed out with a normal: ' + JSON.stringify(col.centre));
  t.assert(col.container.outX, 'QA-A-DRV-04: a container collides as its 2.4 x 6 m box: ' + JSON.stringify(col.container));
  t.assert(col.hedge.outX >= col.hedge.need - 0.01, 'QA-A-DRV-05: a maze hedge collides along its length: ' + JSON.stringify(col.hedge));
  t.assert(col.rail.found && col.rail.hitX && col.rail.x <= -0.6 + 0.01 && col.rail.boat, 'QA-A-DRV-03: the walkway railing stops a walker, not a boat: ' + JSON.stringify(col.rail));
  // QAC-22: a same-seed New Game stands knocked-over props up again
  const fallen = await page.evaluate(() => {
    const W = GTP.World, lamp = W.props.find((p) => p.kind === 'lamp' && p.solid), idx = lamp.index;
    lamp.fallen = { t: 5, dx: 1, dz: 0 }; lamp.solid = false;
    GTP.game.newGame(GTP.game.seed);
    const l2 = W.props[idx], q = W.resolveCapsule(l2.x + 0.3, l2.z, l2.y, 0.4);
    return { same: l2 === lamp, fallen: !!l2.fallen, solid: l2.solid, blocked: Math.hypot(q.x - l2.x, q.z - l2.z) >= l2.r + 0.4 - 0.01 };
  });
  console.log('  QAC-22: ' + JSON.stringify(fallen));
  t.assert(!fallen.fallen && fallen.solid && fallen.blocked, 'QAC-22: a knocked lamp stands again after a same-seed New Game: ' + JSON.stringify(fallen));
  // ==== end of the world-collision block ====

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
