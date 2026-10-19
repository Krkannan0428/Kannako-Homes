/* world.js: the generated city matches GDD §2-3: every landmark id exists with a door on a sidewalk
 * next to a road, buildings never overlap, every landmark door is reachable by road from the
 * campus quad (BFS over ROAD/BRIDGE/HIGHWAY/RAMP, both layers), the Loop deck is connected to the
 * ground through its ramps, heightAt/solidAt behave per the contract, and pathing works. */
'use strict';
const H = require('./_harness');

const GDD_LANDMARKS = {
  campus: ['campus_quad', 'dorm_studio', 'pod_garage'],
  downtown: ['tyn_tower', 'green_room', 'impression_alley', 'goldplate_tower', 'vault_bank', 'hospital', 'police_hq'],
  strip: ['nap_depot', 'listening_room', 'strip_garage', 'strip_gas'],
  capitol: ['capitol_dome', 'fulcrum', 'char_charter', 'bravadia_embassy', 'ova_hq', 'protest_plaza'],
  hills: ['stadium', 'goldplate_links', 'vaultwright_manor', 'bridge_main'],
  suburbs: ['hoa_hall', 'clarity_barn', 'moon_mine', 'culdesac_gas'],
  industrial: ['warehouse_42', 'memo_press', 'balloon_depot'],
  marina: ['velvetine_pier', 'afterparty_yacht', 'fish_shack']
};
const GDD_DISTRICTS = { campus: 'campus', downtown: 'downtown', strip: 'strip', capitol: 'capitol', hills: 'stadium', suburbs: 'suburbs', industrial: 'industrial', marina: 'marina' };
const GDD_STREETS = ['Goldplate Avenue', 'Goldplate Goldplate Avenue', 'Respectfully Road', 'Lanyard Lane', 'Ratio Row', 'Lower Third Street', 'Sponsor Boulevard', 'Citation Pending Way', 'Par Ten Parkway', 'Balloon Repair Alley', 'Trustless Terrace', 'Pellet Place', 'Jet Street (extension pending)', 'Minds Changed Court', 'Monday Memo Mews', 'Quote Post Crescent', 'Coupon Code Circle'];

H.run('world', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  const r = await page.evaluate(({ GDD_LANDMARKS, GDD_DISTRICTS, GDD_STREETS }) => {
    const W = GTP.World, T = W.T, C = GTP.C, CW = GTP.Content.world, TILE = C.TILE;
    const out = { missing: [], wrongDistrict: [], doorBad: [], overlaps: [], unreachable: [], districts: [], streetsMissing: [], deckUnreached: 0, deckTiles: 0 };
    // districts with the GDD style keywords
    const dmap = {}; W.districts.forEach((d) => { dmap[d.id] = d; });
    Object.keys(GDD_DISTRICTS).forEach((id) => { if (!dmap[id]) out.districts.push('missing ' + id); else if (dmap[id].style !== GDD_DISTRICTS[id]) out.districts.push(id + ' style ' + dmap[id].style); });
    // landmarks: ids verbatim, in their GDD district, each with a door on a SIDEWALK touching a ROAD/BRIDGE
    const ROADISH = (tt) => tt === T.ROAD || tt === T.BRIDGE;
    Object.keys(GDD_LANDMARKS).forEach((did) => GDD_LANDMARKS[did].forEach((id) => {
      const l = W.landmark(id);
      if (!l) { out.missing.push(id); return; }
      if (l.district !== did) out.wrongDistrict.push(id + ' in ' + l.district);
      const d = l.door;
      if (!d) { out.doorBad.push(id + ': no door'); return; }
      const tx = Math.floor(d.x / TILE), tz = Math.floor(d.z / TILE);
      if (W.tile(tx, tz) !== T.SIDEWALK) out.doorBad.push(id + ': door tile ' + W.tile(tx, tz));
      const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => ROADISH(W.tile(tx + dx, tz + dz)));
      if (!adj) out.doorBad.push(id + ': no road next to door');
      const dd = W.districtAt(d.x, d.z);
      if (!dd || dd.id !== did) out.doorBad.push(id + ': door in district ' + (dd && dd.id));
    }));
    out.landmarkCount = W.landmarks.length;
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
    // streets from GDD §9 exist on road segments
    const names = new Set(W.roads.map((rd) => rd.name)); names.add(W.loopName);
    GDD_STREETS.forEach((s) => { if (!names.has(s)) out.streetsMissing.push(s); });
    out.loopName = W.loopName;
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
    // solid inside buildings, not on doors or roads
    out.solidIn = B.slice(0, 40).every((b) => W.solidAt(b.cx, b.cz, 1));
    out.solidAbove = W.solidAt(B[0].cx, B[0].cz, B[0].y + B[0].h + 1);
    out.solidDoor = W.landmarks.some((l) => W.solidAt(l.door.x, l.door.z, 0.5));
    out.solidRoad = W.solidAt(rp.x, rp.z, 0.5);
    // resolveCapsule pushes a circle out of a building
    const b0 = B[0]; const res = W.resolveCapsule(b0.x + 0.2, b0.cz, 0, 0.4);
    out.pushOut = res.x <= b0.x - 0.39 || res.x >= b0.x + b0.w + 0.39 || res.z <= b0.z - 0.39 || res.z >= b0.z + b0.d + 0.39;
    // pathing: car from the quad to the stadium (over the bridge), ped to the dorm
    const a = W.landmark('campus_quad').door, s = W.landmark('stadium').door, dm = W.landmark('dorm_studio').door;
    const carPath = W.findPath(a.x, a.z, s.x, s.z, { mode: 'car' });
    out.carPath = carPath ? carPath.length : 0;
    // waypoints are corners (collinear points are merged), so check that a segment crosses the channel
    const channel = CW.layout.land[0].x + CW.layout.land[0].w, channel1 = CW.layout.land[1].x;
    out.carPathBridge = !!carPath && carPath.some((p, i) => i > 0 && Math.min(p.x, carPath[i - 1].x) < channel * TILE && Math.max(p.x, carPath[i - 1].x) > channel1 * TILE);
    out.carPathEnd = carPath ? Math.hypot(carPath[carPath.length - 1].x - s.x, carPath[carPath.length - 1].z - s.z) : 1e9;
    let carLen = 0; if (carPath) for (let i = 1; i < carPath.length; i++) carLen += Math.hypot(carPath[i].x - carPath[i - 1].x, carPath[i].z - carPath[i - 1].z);
    out.carLen = Math.round(carLen);
    const pedPath = W.findPath(a.x, a.z, dm.x, dm.z, { mode: 'ped' });
    out.pedPath = pedPath ? pedPath.length : 0;
    // road direction field is right-hand: on an eastbound lane the lane centre is to the north of the road axis
    const rd = W.roadDir(rp.x, rp.z, 0); out.roadDir = !!rd && Math.abs(rd.dx) + Math.abs(rd.dz) === 1;
    // props and spawn data
    const kinds = {}; W.props.forEach((p) => { kinds[p.kind] = (kinds[p.kind] || 0) + 1; });
    out.props = kinds;
    out.billboardPairs = W.props.filter((p) => p.kind === 'billboard' && p.landmark === 'impression_alley').length;
    out.playerSpawn = CW.playerSpawn; out.spawnOk = !!(CW.spawn && CW.spawn.peds && CW.spawn.vehicles && CW.spawn.pickups);
    out.lookPool = typeof CW.spawn.peds.lookPool === 'function' ? CW.spawn.peds.lookPool('campus').length : -1;
    out.districtAtSpawn = W.districtAt(GTP.game.player.x, GTP.game.player.z).id;
    // determinism: regenerating with the same seed gives the same tiles
    const sum1 = W.tiles.reduce((acc, v, i) => (acc + v * (i % 97)) | 0, 0) ^ W.props.length;
    W._seed = null; W.generate(7);
    const sum2 = W.tiles.reduce((acc, v, i) => (acc + v * (i % 97)) | 0, 0) ^ W.props.length;
    out.deterministic = sum1 === sum2;
    return out;
  }, { GDD_LANDMARKS, GDD_DISTRICTS, GDD_STREETS });
  console.log('  world: ' + JSON.stringify(Object.assign({}, r, { props: undefined })));
  console.log('  props: ' + JSON.stringify(r.props));
  t.assert(r.districts.length === 0, 'districts: ' + r.districts.join(', '));
  t.assert(r.missing.length === 0, 'missing landmarks: ' + r.missing.join(', '));
  t.assert(r.landmarkCount === 34, '34 GDD landmarks, got ' + r.landmarkCount);
  t.assert(r.wrongDistrict.length === 0, 'wrong district: ' + r.wrongDistrict.join(', '));
  t.assert(r.doorBad.length === 0, 'doors: ' + r.doorBad.join('; '));
  t.assert(r.overlaps.length === 0, 'overlapping buildings: ' + r.overlaps.slice(0, 10).join(', '));
  t.assert(r.badBuildingIndex === 0, 'building index mismatches: ' + r.badBuildingIndex);
  t.assert(r.unreachable.length === 0, 'unreachable by road: ' + r.unreachable.join(', '));
  t.assert(r.deckTiles > 400 && r.deckUnreached === 0, 'Loop deck connected: ' + r.deckUnreached + '/' + r.deckTiles + ' unreached');
  t.assert(r.roadUnreached === 0, 'all road tiles connected: ' + r.roadUnreached + '/' + r.roadTiles);
  t.assert(r.streetsMissing.length === 0, 'streets missing: ' + r.streetsMissing.join(', '));
  t.assert(r.loopName === 'The Loop', 'loop name');
  t.assert(r.hStreet === 0, 'street height 0: ' + r.hStreet);
  t.assert(Math.abs(r.hDeck - 7) < 0.01, 'deck height 7: ' + r.hDeck);
  t.assert(r.hUnderDeck < 1, 'ground under the deck: ' + r.hUnderDeck);
  t.assert(r.hRampMid > 2.5 && r.hRampMid < 4.5, 'ramp midpoint interpolates: ' + r.hRampMid);
  t.assert(r.hRampQuarter > 1 && r.hRampQuarter < r.hRampMid, 'ramp quarter below mid: ' + r.hRampQuarter);
  t.assert(Math.abs(r.hWater + 1.2) < 0.01 && Math.abs(r.hOff + 1.2) < 0.01, 'water -1.2: ' + r.hWater + ' ' + r.hOff);
  t.assert(Math.abs(r.hSidewalk - 0.12) < 0.01, 'sidewalk curb height: ' + r.hSidewalk);
  t.assert(r.solidIn && !r.solidAbove && !r.solidDoor && !r.solidRoad, 'solidAt: ' + JSON.stringify([r.solidIn, r.solidAbove, r.solidDoor, r.solidRoad]));
  t.assert(r.pushOut, 'resolveCapsule pushes out of a building');
  t.assert(r.carPath >= 3 && r.carPathBridge && r.carPathEnd < 10 && r.carLen > 400, 'car path to the stadium crosses the bridge: ' + JSON.stringify([r.carPath, r.carPathBridge, r.carPathEnd, r.carLen]));
  t.assert(r.pedPath > 1, 'ped path to the dorm');
  t.assert(r.roadDir, 'roadDir on a road tile');
  t.assert(r.props.tree > 200 && r.props.lamp > 100 && r.props.signal > 20 && r.props.bench > 10 && r.props.hydrant > 5 && r.props.table >= 9 && r.props.sign > 20, 'prop counts');
  t.assert(r.billboardPairs >= 8, 'Impression Alley billboard pairs: ' + r.billboardPairs);
  t.assert(r.playerSpawn === 'campus_quad' && r.spawnOk && r.districtAtSpawn === 'campus', 'spawn tables and player spawn');
  t.assert(r.lookPool > 0, 'lookPool helper: ' + r.lookPool);
  t.assert(r.deterministic, 'generation is deterministic');
  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
