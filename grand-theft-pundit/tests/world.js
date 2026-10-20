/* world.js: the generated city matches GDD §2-3 and GDD_EXPANSION §1: every landmark id (34 base + 16
 * expansion) exists in its district with a door on a sidewalk next to a road, buildings never overlap, every
 * landmark door is reachable by road from the campus quad (BFS over ROAD/BRIDGE/HIGHWAY/RAMP, both layers),
 * the figure-eight Loop deck is connected to the ground through its six ramps, the runway strip is never in the
 * traffic lane field, the viaduct stands over water, both bridges and the extended Loop have the right heights,
 * the stunt wedges have real height, heightAt/solidAt behave per the contract, pathing works, generation is
 * deterministic and reports its progress. */
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
  t.assert(r.landmarkCount === 50, '34 GDD + 16 expansion landmarks, got ' + r.landmarkCount);
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
  t.assert(r.generateMs < 4000, 'World.generate stays quick: ' + r.generateMs + ' ms');
  t.assert(r.near.road > 200 && r.near.road < r.near.total / 2 && r.near.sidewalk > 200 && r.near.allRoad && r.near.allWalk && r.near.within, 'tilesNear buckets the spawner tiles around a point: ' + JSON.stringify(r.near));
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
