/* world.js: GTP.World generation, queries, lane field, collision and pathing. */
'use strict';
const H = require('./_harness');

H.run('world', async (t) => {
  const { page, pageErrors } = await t.openGame({ seed: 7 });
  const r = await page.evaluate(() => {
    const W = GTP.World, T = W.T, C = GTP.C, out = {};
    out.w = W.w; out.h = W.h; out.len = W.tiles.length;
    // tile histogram
    const hist = {};
    for (let i = 0; i < W.tiles.length; i++) hist[W.tiles[i]] = (hist[W.tiles[i]] || 0) + 1;
    out.hist = hist;
    out.districts = W.districts.map((d) => d.id);
    out.landmarks = W.landmarks.length;
    out.lmBad = W.landmarks.filter((l) => l.kind !== 'bridge' && l.kind !== 'pier' && W.tileAt(l.x, l.y) === T.WATER).map((l) => l.id);
    out.lmIds = W.landmarks.map((l) => l.id);
    out.buildings = W.buildings.length;
    out.props = W.props.length;
    out.lots = W.lots.length;
    out.lookup = !!W.landmark('campus_quad') && W.landmark('nope') === null;
    // right-hand traffic on the main avenue (line y=64 -> tiles 62..65): top lanes go west, bottom lanes go east
    const x = 40 * C.TILE + 16;
    out.laneTop = W.roadDir(x, 62 * C.TILE + 16);
    out.laneBottom = W.roadDir(x, 65 * C.TILE + 16);
    // vertical avenue x=64 (tiles 62..65): left lanes south, right lanes north
    const y = 40 * C.TILE + 16;
    out.laneLeft = W.roadDir(62 * C.TILE + 16, y);
    out.laneRight = W.roadDir(65 * C.TILE + 16, y);
    out.offRoad = W.roadDir(1, 1);
    out.intersection = W.isIntersection(63, 63) && !W.isIntersection(40, 63);
    out.districtAt = (W.districtAt(50 * C.TILE, 50 * C.TILE) || {}).id;
    out.districtWater = W.districtAt(2, 2) ? W.districtAt(2, 2).id : null;
    // collision: a circle inside a building is pushed out
    const b = W.buildings[0];
    const inside = W.resolveCircle(b.x + b.w / 2, b.y + b.h / 2, 8);
    out.pushedOut = !W.solidAt(inside.x, inside.y);
    const open = W.randomSidewalkPoint();
    const same = W.resolveCircle(open.x, open.y, 6);
    out.openUnchanged = Math.abs(same.x - open.x) < 1e-6 && Math.abs(same.y - open.y) < 1e-6 && !same.hitX && !same.hitY;
    out.solidWater = W.solidAt(2 * C.TILE, 2 * C.TILE) && W.solidAt(-5, -5);
    // pathing on roads between two distant road points
    const a = W.nearestRoadPoint(36 * C.TILE, 40 * C.TILE), z = W.nearestRoadPoint(110 * C.TILE, 90 * C.TILE);
    const path = W.findPath(a.x, a.y, z.x, z.y, { mode: 'car' });
    out.pathLen = path ? path.length : -1;
    out.pathOnRoad = path ? path.every((p) => { const tt = W.tileAt(p.x, p.y); return tt === T.ROAD || tt === T.BRIDGE || tt === T.PARKING; }) : false;
    const pp = W.findPath(a.x, a.y, a.x + 3 * C.TILE, a.y, { mode: 'ped' });
    out.pedPath = pp ? pp.length : -1;
    out.noPath = W.findPath(10, 10, 20, 20, { mode: 'car' });
    // determinism: regenerate with the same seed is a no-op, a different seed changes buildings
    const sig = W.buildings.map((bb) => bb.seed).join(',');
    W.generate(7);
    out.idempotent = sig === W.buildings.map((bb) => bb.seed).join(',');
    const s7 = GTP.rng.state();
    W.generate(99);
    out.differs = sig !== W.buildings.map((bb) => bb.seed).join(',');
    out.rngUntouched = GTP.rng.state() === s7; // world gen uses its own rng stream
    W.generate(7);
    out.restored = sig === W.buildings.map((bb) => bb.seed).join(',');
    out.spawnRoad = W.randomRoadPoint();
    out.errors = GTP.errors.length;
    return out;
  });
  t.assert(r.w === 128 && r.h === 128 && r.len === 128 * 128, 'map size');
  t.assert(r.districts.length >= 6 && r.districts.length <= 8, 'districts: ' + r.districts.join(','));
  t.assert(r.landmarks >= 24, 'landmarks: ' + r.landmarks);
  t.assert(r.lmBad.length === 0, 'landmarks in water: ' + r.lmBad.join(','));
  for (const id of ['campus_quad', 'downtown_tower', 'capitol', 'embassy_row', 'marina_docks', 'stadium', 'studio_lot', 'hospital', 'police_hq', 'garage_1', 'mall', 'park_central', 'diner_1', 'gas_1', 'bank', 'hotel', 'warehouse_1', 'club_1', 'mansion_hill', 'hq_agency', 'bridge_main']) {
    t.assert(r.lmIds.includes(id), 'missing landmark ' + id);
  }
  t.assert(r.lookup, 'landmark() lookup');
  t.assert(r.buildings > 80, 'buildings: ' + r.buildings);
  t.assert(r.props > 200, 'props: ' + r.props);
  t.assert(r.lots > 5, 'parking lots: ' + r.lots);
  const T = { ROAD: 1, SIDEWALK: 2, BUILDING: 3, GRASS: 4, WATER: 5, BRIDGE: 9 };
  t.assert(r.hist[T.ROAD] > 1500 && r.hist[T.SIDEWALK] > 800 && r.hist[T.BUILDING] > 1500 && r.hist[T.WATER] > 3000 && r.hist[T.BRIDGE] >= 24, 'tile histogram ' + JSON.stringify(r.hist));
  t.assert(r.laneTop && r.laneTop.dx === -1, 'top lane of avenue should go west: ' + JSON.stringify(r.laneTop));
  t.assert(r.laneBottom && r.laneBottom.dx === 1, 'bottom lane of avenue should go east: ' + JSON.stringify(r.laneBottom));
  t.assert(r.laneLeft && r.laneLeft.dy === 1, 'left lane should go south: ' + JSON.stringify(r.laneLeft));
  t.assert(r.laneRight && r.laneRight.dy === -1, 'right lane should go north: ' + JSON.stringify(r.laneRight));
  t.assert(r.offRoad === null, 'roadDir off road is null');
  t.assert(r.intersection, 'isIntersection');
  t.assert(r.districtAt === 'downtown', 'districtAt downtown: ' + r.districtAt);
  t.assert(r.pushedOut, 'resolveCircle pushes out of buildings');
  t.assert(r.openUnchanged, 'resolveCircle leaves open space alone');
  t.assert(r.solidWater, 'water and out-of-bounds are solid');
  t.assert(r.pathLen > 5 && r.pathOnRoad, 'car path len=' + r.pathLen + ' onRoad=' + r.pathOnRoad);
  t.assert(r.pedPath >= 2, 'ped path');
  t.assert(r.noPath === null, 'no path from water');
  t.assert(r.idempotent && r.differs && r.restored && r.rngUntouched, 'generation determinism ' + JSON.stringify({ i: r.idempotent, d: r.differs, r: r.restored, rng: r.rngUntouched }));
  t.assert(r.errors === 0, 'GTP.errors ' + r.errors);
  t.assert(pageErrors.length === 0, pageErrors.join('\n'));
});
