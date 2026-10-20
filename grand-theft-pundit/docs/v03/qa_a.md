# QA-A play-test: world, driving and visuals (v0.3 base 3a5252c)

Track qa-a, branch `v03/qa-a`. Base under test: `game/grand-theft-pundit` at 3a5252c (v0.2 plus the v0.3 stubs).
Lenses: **world and driving** (every district, the Loop and its ramps, both bridges and the causeway, the runway,
the port maze, uptown, traffic, peds, water, every car class at full speed, the camera in tight places) and
**visuals** (every district at noon, sunset, night and rain at the low / medium / high / ultra presets, LOD and
streaming, entities and effects, performance per preset).

How it was tested: headless Chromium through SwiftShader with `tests/_harness.js` (seed 7, every generation bug
confirmed on seed 11 or 3), long simulations sampled per step, free-camera and chase-camera screenshots (every
one looked at), and a data audit of tiles, lanes, props, buildings and parking. Each bug was reproduced twice.
Bugs already in `docs/v03/qa_r1_bugs.json` are not repeated. Duplicates found by two lenses are merged into one
entry ("Also reported as").

**Regression tests:** every bug that can be guarded has `tests/regress/qa_a_<id>.js`. Each one was run against
3a5252c and fails on the assertion that names the bug. It will pass once that bug is fixed.
Run one with `cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_a_<id>.js`.
Paths named `scratchpad/...` in the repro and evidence fields are the testers' working scripts and screenshots.
They were not committed (qa-a owns only these docs and `tests/regress/qa_a_*`), so each regression test is the
committed repro.

**Perf per preset** (`tests/perf.js` passed; SwiftShader numbers are relative only):
low 9-13 ms/frame at 463-510 draw calls; medium 22 ms at 1127 calls; high slow under software GL (renderMs about 3 s).
Downtown draw calls with the camera still, day / night / night rain: low 265 / 317 / 342, medium 411 / 481 / 555,
high and ultra 414 / 484 / 558. The port follows the same pattern. Triangles stay between 200k and 360k.
No preset blows the budget, there are no shader compile errors, and `GTP.errors` stayed empty in every run.
Measured ms per frame was not reliable while five testers shared four CPUs, so it is not reported as a bug.

**Checked and clean:** the road network is one component, and car paths link all 50 landmark doors. Every door and
pickup is reachable on foot. No building overlaps another. No sign is mirrored or faces a wall. A ram test of 860
deck-edge tiles never got a car off the Loop. All six ramps, the bridges and the runway are clean for every class,
and every class reaches its top speed. Peds never stand in buildings or walk on the deck, and none crossed against
a signal in about 1,000 crossings. Two consecutive renders never differed (no flicker). There is no z-fighting,
shadow acne or SSAO halo at medium or high. No night scene is too dark, and bloom never blows out. Streaming flat out
across the map never left a chunk missing in view.


## Counts

| severity | bugs |
|---|---|
| high | 9 |
| medium | 26 |
| low | 20 |
| **total** | **55** |

By lens: GEO 6, DRV 8, TRF 7, CAM 8, VIS 7, NGT 9, ENT 10.

## All bugs, most severe first

| id | sev | area | title | regression test |
|---|---|---|---|---|
| QA-A-CAM-01 | high | camera / aim mode on foot | Aiming at a building less than ~8 m away throws the camera 7.5 m forward into the building: the screen shows the street from knee height inside the wall and the player vanishes | `tests/regress/qa_a_cam_01.js` |
| QA-A-DRV-01 | high | vehicles / exit on the Lower Loop viaduct | Getting out of a car anywhere on the Lower Loop viaduct over the bay drops the player into the sea under it | `tests/regress/qa_a_drv_01.js` |
| QA-A-ENT-01 | high | vehicles / car meshes | Sedan, taxi, cop, sports car and SUV interiors stick out of the car: the rear seat backs stand on the trunk lid behind the rear window, and the seats and dash come up through the roof and windscreen | `tests/regress/qa_a_ent_01.js` |
| QA-A-GEO-01 | high | world generation: landmark lots vs roads (memo_press / Coupon Code Circle) | Monday Memo Print Works is built on top of Coupon Code Circle: the road's lanes run straight into the warehouse wall | `tests/regress/qa_a_geo_01.js` |
| QA-A-GEO-02 | high | world generation: Manifest Ramp / Departures Drive (lane field + heights) | Departures Drive runs under the Lower Loop straight into the 7 m top end of the Manifest Ramp: AI cars jam there forever and a player car is lifted 7 m in one frame | `tests/regress/qa_a_geo_02.js` |
| QA-A-GEO-03 | high | world generation: Velvetine Pier dock props vs the Sponsor Span | Two of the Velvetine Pier's moored boats sit on the Sponsor Span's west lane: cars crash into them and are shoved off the bridge into the bay | `tests/regress/qa_a_geo_03.js` |
| QA-A-TRF-01 | high | ai/traffic | City traffic gridlocks for good within 3-4 minutes: nearly every AI car ends up standing still, head-on against another car or queued behind one, and no new traffic spawns | `tests/regress/qa_a_trf_01.js` |
| QA-A-TRF-02 | high | ai/traffic | A car queued behind another at a red light swerves into the oncoming lane after 3 s, then drives up the wrong side into the junction on green | `tests/regress/qa_a_trf_02.js` |
| QA-A-TRF-03 | high | ai/traffic | A traffic car on the oncoming side takes that lane as its own and keeps driving the wrong way: planAhead copies the lane under the car without checking its direction | `tests/regress/qa_a_trf_03.js` |
| QA-A-CAM-02 | medium | camera / first person on foot | First person on foot sees straight through any wall it faces: the 0.3 m near plane is deeper than the eye's 0.25 m distance to the wall, so the whole street behind the building shows | `tests/regress/qa_a_cam_02.js` |
| QA-A-CAM-03 | medium | camera / render interpolation | At speed the player's car bobs up and down on screen every frame: entity meshes are interpolated with the frame alpha but the camera is not | `tests/regress/qa_a_cam_03.js` |
| QA-A-CAM-05 | medium | camera / collision with props | The chase camera goes inside container stacks and parked airliners: the screen shows container ribs or the fuselage from inside and hides the player | `tests/regress/qa_a_cam_05.js` |
| QA-A-DRV-02 | medium | vehicles / exit on the Loop deck | Getting out of a car parked against a Loop deck barrier teleports the player down to the street 7 m below | `tests/regress/qa_a_drv_02.js` |
| QA-A-DRV-03 | medium | world / bridges | Bridge walkway railings are not solid: cars and pedestrians go straight through them into the water on every bridge | `tests/regress/qa_a_drv_03.js` |
| QA-A-DRV-04 | medium | world / port container maze | The container maze's walls can be driven and walked through: each 6 m container collides as one 1.3 m circle | `tests/regress/qa_a_drv_04.js` |
| QA-A-DRV-06 | medium | stunt jumps / sj_07 and the map edge | Flat out down Runway 10/10, sj_07 throws the fast cars into the sea; the sports car flies 10 m high into the invisible map edge and explodes | `tests/regress/qa_a_drv_06.js` |
| QA-A-ENT-02 | medium | peds / animation | Running pedestrians hover: through the whole run cycle both feet are off the ground, 3-28 cm above the pavement | `tests/regress/qa_a_ent_02.js` |
| QA-A-ENT-03 | medium | props / knocked-over lamps at night | A lamp post knocked over by the player's car keeps glowing: its orange glow sprite hangs 6 m up in empty air and its light pool stays on the road, also after the chunk is rebuilt | `tests/regress/qa_a_ent_03.js` |
| QA-A-ENT-05 | medium | fx / explosion decals | Every explosion leaves a hard-edged black square on the ground (5 x 5 m for a car), not a scorch mark | `tests/regress/qa_a_ent_05.js` |
| QA-A-ENT-07 | medium | vehicles / bus mesh | The bus's last side window hangs 0.36 m off the back of the bus on both sides, and its rear door z-fights with two windows (flickering stripes) | `tests/regress/qa_a_ent_07.js` |
| QA-A-ENT-09 | medium | peds / swimming | Swimmers lie on top of the water: the torso and legs ride 0.2-0.4 m above the surface and only the hands dip in | `tests/regress/qa_a_ent_09.js` |
| QA-A-ENT-10 | medium | vehicles / player headlight | Driving at night in first person the headlights stay behind: the spot light freezes where the view was switched and the road ahead is dark | `tests/regress/qa_a_ent_10.js` |
| QA-A-GEO-04 | medium | world generation: Goldplate Links lot props vs Clubhouse Drive | A Goldplate Links flag pole (and on seed 11 a tree) stands in the westbound lane of the road through the course, and the PAR 10 sign's post stands in the lane too | `tests/regress/qa_a_geo_04.js` |
| QA-A-GEO-05 | medium | AI parked-car spawner tiles vs solid props | Parked cars spawn inside solid props: a hangar-row van around the windsock pole, cars under the airliners and jetbridges, on the gas pumps, crates and the stadium floodlight mast | `tests/regress/qa_a_geo_05.js` |
| QA-A-NGT-01 | medium | render / street lamps at night | Every street lamp's arm and head point away from the road, so the orange night glow, the ground light pool and the high/ultra point light hang in mid-air 2.85 m from the lamp head | `tests/regress/qa_a_ngt_01.js` |
| QA-A-NGT-02 | medium | render / weather / puddles | Rain puddles only ever appear north of the player: the puddle budget is spent on the northern rows of the 32x32-tile window, none to the south and often none within 30 m | `tests/regress/qa_a_ngt_02.js` |
| QA-A-NGT-05 | medium | render / lamp light pool (high, ultra) | Street-lamp point lights pop on and off at full brightness while driving (no fade), and a third of them light lamps behind the camera | `tests/regress/qa_a_ngt_05.js` |
| QA-A-NGT-06 | medium | render / player headlight / performance | Getting into a car at night freezes the game: the player's headlight SpotLight turning visible changes the light count and recompiles every lit material | `tests/regress/qa_a_ngt_06.js` |
| QA-A-TRF-04 | medium | ai/traffic | Buses and trucks drive off the west end of the city into the sea: junctions leave long vehicles only 'straight' into a one-tile road stub | `tests/regress/qa_a_trf_04.js` |
| QA-A-TRF-07 | medium | ai/spawner | Long parked vehicles (vans 5.4 m, trucks 7.5 m) are placed on 4 m parking tiles with no footprint check: their bodies stick into building walls (14 of 435 parked cars in a city sweep, e.g. a truck box inside a port warehouse at (610, 676)) | `tests/regress/qa_a_trf_07.js` |
| QA-A-TRF-08 | medium | world/lanes + ai | Manifest Ramp (Lower Loop) shares lanes with the ground street under the Loop: AI cars climbing it crash across the deck into the barrier, and street cars ram the ramp's 7 m end wall | `tests/regress/qa_a_trf_08.js` |
| QA-A-TRF-09 | medium | world/lanes | Two signalled junctions are only half in the lane field: northbound cars in Heirloom Heights (724,420) and westbound cars at the Jet Ramp foot on the Strip (276,420) drive through on red at full speed | `tests/regress/qa_a_trf_09.js` |
| QA-A-VIS-01 | medium | render / building roofs | Flat roofs stretch the gravel texture 5-40x into streaks (u and v swapped on the roof quad) | `tests/regress/qa_a_vis_01.js` |
| QA-A-VIS-03 | medium | render / sky at dusk and dawn | At sunset and sunrise the sky shows a hard dark arc about 36 degrees up when looking toward the sun | `tests/regress/qa_a_vis_03.js` |
| QA-A-VIS-06 | medium | render / signs and billboards | Sign lettering is stretched sideways on half the signs (up to 3.2x): textures come in only 1:1, 2:1 and 4:1 | `tests/regress/qa_a_vis_06.js` |
| QA-A-CAM-04 | low | camera / first person on the bike | First person on the bike puts the eye at handlebar height (0.9 m), below a standing pedestrian's chest | `tests/regress/qa_a_cam_04.js` |
| QA-A-CAM-06 | low | camera / bus and truck against walls | Backing a bus or truck up to a wall pulls the chase camera down onto its own roof: the roof covers 60-70% of the screen and the road ahead is hidden | `tests/regress/qa_a_cam_06.js` |
| QA-A-CAM-07 | low | chunk streaming | After a teleport into an area not built yet (and right after the boot) whole blocks pop in over 11-22 frames: chunks 37-83 m away are missing from the first frame | `tests/regress/qa_a_cam_07.js` |
| QA-A-CAM-08 | low | entity draw distance vs fog | Pedestrians vanish at 110 m in clear air (fog starts at 120 m) and cars at 200 m while only 56% fogged: visible pop-in/out down every long avenue | `tests/regress/qa_a_cam_08.js` |
| QA-A-DRV-05 | low | world / mansion hedge maze | The mansion hedge maze can be walked through: each 14-22 m hedge collides only as a 1 m circle at its centre | `tests/regress/qa_a_drv_05.js` |
| QA-A-DRV-07 | low | camera / under the Loop | Under the Loop, looking up in a car puts the chase camera through the deck: the screen shows only the deck's asphalt | `tests/regress/qa_a_drv_07.js` |
| QA-A-DRV-08 | low | stunt ramps / wedge collision | Cars drive straight up the 1.3 m vertical front and the sides of a stunt wedge with no impact | `tests/regress/qa_a_drv_08.js` |
| QA-A-ENT-04 | low | fx / skid marks | Skid marks on the Loop ramps float up to 0.3 m above the asphalt (sliding uphill) or are buried under it (sliding downhill) | `tests/regress/qa_a_ent_04.js` |
| QA-A-ENT-06 | low | peds / barks (speech bubbles) | Pedestrians' speech bubbles are drawn through buildings: a ped on the far side of a block 'talks' out of the facade | `tests/regress/qa_a_ent_06.js` |
| QA-A-ENT-08 | low | vehicles / body decals | Coplanar body details z-fight: the front licence plate inside the grille on six car classes, the podcast van's chrome strip across its LOUD & CORRECT wrap, the bus's navy stripe in the bus's sides | `tests/regress/qa_a_ent_08.js` |
| QA-A-GEO-06 | low | districts: ferry pier outside the port rectangle | The Ferry to Elsewhere's pier has no district: World.districtAt returns null and the minimap chip reads OPEN WATER while you stand on it | `tests/regress/qa_a_geo_06.js` |
| QA-A-NGT-03 | low | render / weather / puddles | Sidewalk puddles float over the road: a disc at curb height (0.13 m) placed anywhere in a sidewalk tile reaches 1-2 m out over the asphalt | `tests/regress/qa_a_ngt_03.js` |
| QA-A-NGT-04 | low | render / night sky | The moon is 80 degrees away from the moonlight that lights the city, and it never moves during the night | `tests/regress/qa_a_ngt_04.js` |
| QA-A-NGT-07 | low | render / weather / rain streaks | It rains under the Loop deck: the streak cloud falls through the 7 m deck onto the covered road | `tests/regress/qa_a_ngt_07.js` |
| QA-A-NGT-08 | low | render / night sky | Starless hole overhead: the 700 stars only go up to 56 degrees, so the sky around the zenith is blank | `tests/regress/qa_a_ngt_08.js` |
| QA-A-NGT-09 | low | render / weather / puddles | At night the rain puddles look like dark stains on the shining wet road and hide the lamp reflections | `tests/regress/qa_a_ngt_09.js` |
| QA-A-VIS-02 | low | render / airport runway paint | Runway centreline dashes are split in two mismatched halves with a step and a dark seam down every dash | `tests/regress/qa_a_vis_02.js` |
| QA-A-VIS-04 | low | world / prop placement (trees) | About 30% of the city's trees push their canopy through the wall of the building next to them | `tests/regress/qa_a_vis_04.js` |
| QA-A-VIS-05 | low | render / chunk LOD | Chunk LOD pop: beyond lodDistance whole blocks turn 20-30% darker (Lambert far materials lack the environment light) | `tests/regress/qa_a_vis_05.js` |
| QA-A-VIS-90 | low | page layout / index.html | The game view never fills a desktop window: 16 px black bars down both sides (the GL and HUD canvases are 1248 px wide in a 1280 px window) | `tests/regress/qa_a_vis_90.js` |

## Details

### QA-A-CAM-01 (high): Aiming at a building less than ~8 m away throws the camera 7.5 m forward into the building: the screen shows the street from knee height inside the wall and the player vanishes

- **Area:** camera / aim mode on foot
- **Repro:** seed=7. Stand on the pavement facing any building wall 3-6 m away (e.g. teleport(281, 208.5) facing east, wall of building #2 at x=284; or (785,252.5) / (805,36.5) facing east) and hold aim (RMB). Also: stand with the right shoulder against a wall (teleport(239.58,254.5), facing north, building #3 to the east) and aim. Scripts: scratchpad/cam/foot2.js, scratchpad/cam/foot.js
- **Expected:** Over-the-shoulder camera 2 m behind / 0.7 m right of the player, pulled in toward the player if a wall is behind; the player and crosshair visible.
- **Actual:** At 3 m and 6 m from the wall (3 buildings, 6 of 6 cases) the camera sits 7.54 m IN FRONT of the player at y 0.95-1.07, inside the building (e.g. player x=281 -> camera x=288.5 inside the box 284..). Shoulder-to-wall: camera at (240.26, 0.51, 246.99), 7.5 m ahead, inside building #3. At 9 m it is fine (camera 2.1 m behind). Screens: the player is gone; the view is a street seen from ground level beyond/inside the wall.
- **Hint:** js/10_render.js rig.update: in aim mode the focus is 8 m ahead (+0.7 m right) of the player; when that point is inside a building, the final guard raycasts FROM the focus (U.rayAabb returns t=0 from inside a box) and sets gt = max(0.5, 0 - pad) -> the camera is put 0.5 m from the focus. The guard (and _pullIn) should cast from the player's shoulder/head, not from the aim focus, and the aim focus should be clamped to the first wall.
- **Regression test:** `tests/regress/qa_a_cam_01.js`

### QA-A-DRV-01 (high): Getting out of a car anywhere on the Lower Loop viaduct over the bay drops the player into the sea under it

- **Area:** vehicles / exit on the Lower Loop viaduct
- **Repro:** seed=7. debug.spawnVehicle(424,540,'sedan',{yaw:PI,y:7}), teleport(424,540,7), enter, then press F (or p.exitVehicle()). Also at (184,560) on the west viaduct and (187.9,536.7) after driving a van south along the lower west leg. Scripts: drv/exit_deck.js, drv/exit_edge.js (cases 3-4).
- **Expected:** The player steps out onto the deck at y 7, like anywhere else on the Loop.
- **Actual:** The player appears at y -0.91..-0.99, swimming in the bay under the deck (exit point (425.65,540.34) is a deck tile in the middle of the 16 m deck). Reproduced 4 times at 2 legs. AI drivers (cops at a roadblock, carjacked drivers) take the same path.
- **Hint:** js/06_entities.js Vehicle.exit: `if (this.sinking || isWaterTile(ped.x, ped.z))` tests the ground tile and ignores the deck (should test ped.y / World.heightAt(..., this.y) > WATER_Y); the same isWaterTile ground test is used by Ped._down for a knocked-down ped
- **Regression test:** `tests/regress/qa_a_drv_01.js`

### QA-A-ENT-01 (high): Sedan, taxi, cop, sports car and SUV interiors stick out of the car: the rear seat backs stand on the trunk lid behind the rear window, and the seats and dash come up through the roof and windscreen

- **Area:** vehicles / car meshes
- **Repro:** ?seed=7&clock=12&quality=medium. Spawn each class on the runway: GTP.game.debug.spawnVehicle(200,824,'sedan',{yaw:Math.PI/2}), then look at it with debug.freeCam from the side (200,1.3,829 -> 200,1,824), from above (203,4.2,827 -> 200,0.6,824) and from behind (206,1.6,826 -> 200,1,824). Repeat for taxi, cop, sports and suv. Scripts: scratchpad/ent/close.js medium sedan,cop ; scratchpad/ent/close.js medium sports,suv,truck,van,bus,bike ; scratchpad/ent/geo.js (seat-vertex heights) ; regress qa_a_ent_01.js.
- **Expected:** Seats, seat backs, dash and steering wheel sit inside the cabin glass and under the roof.
- **Actual:** Two dark seat-back slabs stand on the trunk lid behind the rear window and poke above the roof line; the dash pokes through the windscreen in front. The highest seat vertex is above the roof: sedan/taxi 1.581 m vs roof 1.45/1.50, cop 1.589 vs 1.50, sports 1.489 vs 1.20, SUV 1.823 vs 1.80. Checked against the cabin prism the glass spans: sedan 102 of 216 seat/dash vertices are outside it (worst 0.75 m), taxi 102 (0.67 m), cop 66 (0.68 m), sports 48 of 120 (0.90 m), SUV 12 (0.38 m). The rear row's back sits at cab.zb1 + 0..0.14 m, behind the rear edge of the cabin. It shows on every common traffic car, at every preset (low too), and on wrecks.
- **Hint:** js/05_assets.js vehicleGeometry interior(zb0, zb1, yFloor, rows): seat back height (yFloor + 0.3 + 0.5) ignores the cabin height (H - yb is 0.45 m on the sedan, 0.58 m on the sports car), the rows are spaced 0.9 m from zb0 + 0.75 regardless of the cabin length, and the slanted glass (zt0 = zb0 + 0.8, zt1 = zb1 - 0.45) is not taken into account. Scale the seats to the cabin and keep them inside the prism (or use one row on the short cabins).
- **Regression test:** `tests/regress/qa_a_ent_01.js`

### QA-A-GEO-01 (high): Monday Memo Print Works is built on top of Coupon Code Circle: the road's lanes run straight into the warehouse wall

- **Area:** world generation: landmark lots vs roads (memo_press / Coupon Code Circle)
- **Repro:** index.html?seed=7 (same on seed 11; the layout is seed-independent). GTP.World: tiles x 36..42, z 121..122 are BUILDING (memo_press) but carry laneH bytes and roadId of Coupon Code Circle (h 122, x 8..117). Drive: spawn a sedan at (100,490) yaw -PI/2, enter it, hold forward 5 s: it hits the wall at x 140. AI: GTP.AI.spawner.placeTraffic({x:100,z:490,y:0,axis:'h',dir:1,laneC:490},'sedan') drives into the wall, swerves and is removed after ~4 s. Scripts: geo/audit1.js 7 (buildingOnRoad), geo/drive.js 7 (coupon_east_player / coupon_east_ai). Screenshot: freeCam(112,5,488, 150,4,490).
- **Expected:** Coupon Code Circle stays a continuous road from x 8 to 117 (the lot generator skips road tiles), or the street is cut with a dead end before the lot.
- **Actual:** 14 road tiles (x 36..42, z 121..122) are BUILDING; their lane field still points east/west into the wall. Player sedan at 23.9 m/s stops dead at x 140 (hp 100 -> 57); an AI car drives into it and is despawned. The screenshot shows the crosswalk and both lanes ending at the PRINT WORKS facade.
- **Hint:** js/04_world.js generate step 5 / _addBuilding: the lot loop skips ROAD tiles but _addBuilding stamps T.BUILDING unconditionally; js/20_content_world.js memo_press lot (35,115,10,15) with footprint 7x9 centred over z 121..122 (move fpOffset or the lot, or refuse footprints over road tiles).
- **Regression test:** `tests/regress/qa_a_geo_01.js`

### QA-A-GEO-02 (high): Departures Drive runs under the Lower Loop straight into the 7 m top end of the Manifest Ramp: AI cars jam there forever and a player car is lifted 7 m in one frame

- **Area:** world generation: Manifest Ramp / Departures Drive (lane field + heights)
- **Repro:** seed 7 and 11. Departures Drive (h 158, x 8..107) ends at x 107 under the east leg; tile x 108 is the Manifest Ramp's deck end (rampY 6.6, heightAt 7). Lane field: laneH on (107,157/158) continues onto the ramp tile and AI stepLayer treats RAMP as road. (1) Player: spawn sedan at (380,634) yaw -PI/2, enter, hold forward: at x 430.5 v.y goes 0 -> 6.95 in a single 1/30 s step, then the car rolls down the ramp to x 469 (geo/p_dep.js). (2) AI: placeTraffic({x:380,z:634,y:0,axis:'h',dir:1,laneC:634},'sedan'): stops at x 422 and stays at speed 0 for the remaining 10 s (geo/drive.js departures_east_ai). heightAt step check: geo/audit1.js heightSteps (6 samples ROAD(107,157..158) 0 -> RAMP 7). Screenshot: freeCam(412,2.5,636, 434,3,634) shows the road continuing under the deck into a pale ramp face.
- **Expected:** A ground road never feeds a ramp's high end: Departures Drive ends (DEAD, kerb/barrier) before the deck, or is offset so the ramp foot is where traffic enters; cars cannot pass through the 7 m face.
- **Actual:** Eastbound lane leads into the ramp end; AI traffic stalls permanently at x 422; a player car at 26 m/s is teleported from y 0.00 to 6.95 at x 430.5 and comes out on the ramp. Same on seed 11.
- **Hint:** js/20_content_world.js road('h',158,8,107,'Departures Drive') vs loop.ramps Manifest Ramp (start 116, end 108); js/04_world.js heightAt returns rampHeight on a RAMP tile regardless of yHint (so wheel samples under the top end read 7), and js/07_ai.js stepLayer returns 'ground' for any RAMP neighbour, including the high end.
- **Regression test:** `tests/regress/qa_a_geo_02.js`

### QA-A-GEO-03 (high): Two of the Velvetine Pier's moored boats sit on the Sponsor Span's west lane: cars crash into them and are shoved off the bridge into the bay

- **Area:** world generation: Velvetine Pier dock props vs the Sponsor Span
- **Repro:** seed 7 and 11. World.props boat at (322.4,528) and (322.4,552): kind 'boat', solid, r 1.8, y -0.85, h 2.2 (top +1.35), on BRIDGE tiles x 80 (the dock case in _landmarkProps puts boats at pier x + 2.6 tiles, the bridge starts 1 tile east of the pier). Spawn a sedan at (322,500) yaw PI, enter, hold forward: stops at z 524 hp 100 -> 68. Northbound from (322,580) yaw 0: stops at z 557 and is pushed to (309.9,562.2) y -2.37 - into the water. Script geo/drive.js (span_south_player_x322 / span_north_player_x322). Screenshot freeCam(332,6,505, 322,0,528): white and blue boats standing on the asphalt.
- **Expected:** Boats are moored in the water beside the pier, clear of the bridge deck.
- **Actual:** Boat hulls stand on the bridge's west lane, visible on the asphalt; a car hits them at 19 m/s (31.8 hp lost) and northbound traffic is pushed sideways off the 0 m deck into the bay (y -2.37). (Also found by the traffic lens as QA-A-TRF-05: the player car stops dead and bounces back at the first boat; AI cars are pushed onto the walkway. Scripts: trf/props.js.)
- **Hint:** js/04_world.js _landmarkProps case 'dock': boats at (px + 1 + sd*2.6) tiles with sd = +1 land on the Sponsor Span (x 80..83) because velvetine_pier's second pier is at lot.x+2..; skip boats whose circle touches a non-water tile, or flip them to the west side.
- **Also reported as:** QA-A-TRF-05
- **Regression test:** `tests/regress/qa_a_geo_03.js`

### QA-A-TRF-01 (high): City traffic gridlocks for good within 3-4 minutes: nearly every AI car ends up standing still, head-on against another car or queued behind one, and no new traffic spawns

- **Area:** ai/traffic
- **Repro:** ?seed=7&headless=1&skipTitle=1. GTP.game.debug.teleport(318,250) (Chyron Center), then advance 240 s in 20 s steps and count driven traffic cars with |speed|>1. Script: scratchpad/trf/jam.js (node jam.js 7 318,250 240 jam_downtown). The same happens at every location tried: scratchpad/trf/sim.js 7 240 suburbs campus industrial capitol downtown strip marina hills uptown airport port 490,282 330,556 628,282 and sim.js 11 240 campus downtown hills airport 330,556.
- **Expected:** Traffic keeps flowing indefinitely: queues clear on green, no car waits more than one signal cycle (20 s).
- **Actual:** Seed 7 at (318,250): moving cars 31/40 at t=20 s, 20/39 at 60 s, 11/40 at 160 s, 4/40 at 180 s, 1/40 at 240 s. Every one of the 14 locations ended with 17-40 cars stationary for over 40 s (most 100-240 s). Seed 11 at (94,298): 35/40 moving at 20 s, 4/40 at 240 s. The stuck cars stand in head-on pairs (e.g. #118 dir +1 and #98 dir -1 both in lane x 234 at z 170/176, blocked by each other, blockedT 218 s) with queues behind them. They are never recycled, because stuckT only counts while there is no capReason and recycle needs the car out of view, so they keep the 40-car budget (avgCars 39.7-40) and no fresh traffic spawns.
- **Hint:** js/07_ai.js carStep(): the unstick and recycle path (ai.stuckT) is skipped whenever ai.capReason is set, so two cars blocking each other (or a queue behind them) wait forever. aheadCaps() only swerves. Needs a give-up for long blockedT, such as reversing or recycling after N s. Feeds on QA-A-TRF-02/03, which put cars on the wrong side in the first place.
- **Regression test:** `tests/regress/qa_a_trf_01.js`

### QA-A-TRF-02 (high): A car queued behind another at a red light swerves into the oncoming lane after 3 s, then drives up the wrong side into the junction on green

- **Area:** ai/traffic
- **Repro:** seed 7: clear traffic (C.CARS_TARGET=0), wait for the start of the 'ew' phase at junction tiles (57..58,45..46), AI.spawner.placeTraffic two sedans northbound in lane x 234 (dir -1) at z 199 and z 208. Advance 16 s. Script: scratchpad/regress/qa_a_trf_02.js; screenshot scratchpad/trf/swerveshot.js.
- **Expected:** The follower waits in its lane behind the lead car and follows it through on green.
- **Actual:** At t=7.8 s, still on red with the lead car waiting at the stop line (stopAlong set), the follower sets ai.swerve=-3.2. When the light turns green it pulls 3.23 m left to x 230.8, the southbound lane centre, and enters the junction on the oncoming side (shots/swerve_green.png: yellow taxi left of the double yellow line beside the red lead car). In free traffic, 64 of 158 swerves in 120 s (seed 7, 318,250) and 21 of 371 (seed 11, 542,270) were behind a car waiting at a signal (lanemis.js).
- **Hint:** js/07_ai.js aheadCaps(): the 'stationary obstacle ahead' swerve fires for any vehicle reason with cap<0.5 after K.stuckTime (3 s). It ignores that the blocker is waiting at a light (reason.ai.stopAlong != null) or queued behind one, and the 3.2 m offset puts the car into the opposing lane.
- **Regression test:** `tests/regress/qa_a_trf_02.js`

### QA-A-TRF-03 (high): A traffic car on the oncoming side takes that lane as its own and keeps driving the wrong way: planAhead copies the lane under the car without checking its direction

- **Area:** ai/traffic
- **Repro:** seed 7: clear traffic, AI.spawner.placeTraffic a sedan with axis 'v', dir -1 (northbound), laneC 234 but standing at x 230 (southbound lane), z 262. Advance 3 s and read v.ai.laneC / v.x. Script: scratchpad/regress/qa_a_trf_03.js. In free traffic (seed 7, 318,250) traced with scratchpad/trf/trace.js 7 318,250 118 9 17: car #118 does a three-point turn that does not finish in 7 s, adoptLane picks dir +1, then planAhead resets laneC to 234 (lane 1, which runs northbound).
- **Expected:** The car steers back to a lane that runs in its direction (x 234 here).
- **Actual:** After 0.5 s ai.laneC becomes 230 (a southbound lane) while ai.dir stays -1. The car drives north along x 230.0 for the whole 3 s. In traffic this produces wrong-way cars: lanemis.js counted 5 lane/direction mismatches in 120 s (seed 7), and every gridlock cluster in QA-A-TRF-01 starts with one. Seed 11 also showed a wrong-way car on the Loop deck at (405->366, 377), lane 2 dir +1, travelling west at speed (loop.js 11).
- **Hint:** js/07_ai.js planAhead(): `ai.lane = li.l; ai.w = li.w; ai.lo = li.lo; ai.laneC = li.center` uses laneInfo of the tile under the car with no check that li.dir === ai.dir (adoptLane checks it, planAhead overrides it). It should keep or pick the nearest lane with laneDirOf()===dir.
- **Regression test:** `tests/regress/qa_a_trf_03.js`

### QA-A-CAM-02 (medium): First person on foot sees straight through any wall it faces: the 0.3 m near plane is deeper than the eye's 0.25 m distance to the wall, so the whole street behind the building shows

- **Area:** camera / first person on foot
- **Repro:** seed=7. Press V twice (first person). Walk up to any building wall, e.g. teleport(239.58, 254.5) facing east into building #3 (west face x=240), or (339.58,254.5) / (383.58,206.5) / (191.58,74.5). Script: scratchpad/cam/foot.js (case D), regress qa_a_cam_02.js
- **Expected:** The wall fills the view (eye kept at least near-plane distance from walls, or near plane smaller).
- **Actual:** Camera at x=239.73, 0.27 m from the wall; camera.near = 0.3; all 9 sampled near-plane points lie inside the building (5 buildings tested, all the same). The screen shows the avenue and buildings on the far side of the block as if the wall were not there.
- **Hint:** js/10_render.js rig.update, mode 'first': desired = player + dir*0.15 at eye height with no collision (the guard is skipped for mode 'first'); PerspectiveCamera near 0.3 (Render.init). Pull the eye back from walls by >= near*(1+aspect) or use a near of ~0.05 in first person.
- **Regression test:** `tests/regress/qa_a_cam_02.js`

### QA-A-CAM-03 (medium): At speed the player's car bobs up and down on screen every frame: entity meshes are interpolated with the frame alpha but the camera is not

- **Area:** camera / render interpolation
- **Repro:** seed=7. Sports car on the avenue at z=90 from x=40 heading east (or the bike, or the Loop's west leg at x=182 y=7), full throttle 5-6 s (~44-47 m/s). Render the same sim state with game.render(alpha) for alpha 0..1, or emulate a 144 Hz display (steps of 1/60, renders every 1/144 with alpha = acc*60). Script: scratchpad/cam/jitter.js, regress qa_a_cam_03.js
- **Expected:** At constant speed the car stays at a fixed place on screen (camera and car interpolated together).
- **Actual:** Car screen y moves 9.6-9.8 px between alpha 0 and 1 (sports 46.7 m/s; bike 9.1 px at 40 m/s); camera-to-car distance varies 10.93..11.66 m. 144 Hz cadence (bike 40.6 m/s): per-frame car y = 329.2, 325.4, 330.7, 326.9, 332.3, 328.4, 324.7, ... a constant 4-8 px sawtooth shake. Any display rate that is not exactly 60 Hz (or uneven frame pacing) shows it.
- **Hint:** js/10_render.js frame(): Entities.sync(alpha) interpolates meshes (06_entities syncMesh) but rig.apply(alpha) ignores alpha and uses the last fixed-step rig.pos/focus. Keep the previous rig pose and lerp pos/focus by alpha in apply (or render the rig relative to the interpolated target).
- **Regression test:** `tests/regress/qa_a_cam_03.js`

### QA-A-CAM-05 (medium): The chase camera goes inside container stacks and parked airliners: the screen shows container ribs or the fuselage from inside and hides the player

- **Area:** camera / collision with props
- **Repro:** seed=7, on foot. Container Yard: teleport(518.75,659) next to the stack at (515.35,659) (also (533.25,665) and (557.25,665)) and turn the camera so it looks from the stack toward the player (mouse orbit; the auto-yaw does it when walking away from a stack). Apron: teleport(131,804) or (259,804) beside the airliners at (122,804)/(250,804), camera from the plane side. Script: scratchpad/cam/props.js, regress qa_a_cam_05.js
- **Expected:** Camera pulled in in front of the prop like it is for buildings.
- **Actual:** Camera at (514.6, 2.53, 659), inside the stacked container box (3 of 3 stacks); for both airliners the camera (126.85/254.85, 2.53, 804) is inside the plane prop's radius and height (r 7, h 9). Screens: a cage of blue container ribs over the player, dark interior band; on the apron half the view is the inside of the fuselage/wing. (Different from QA-A-DRV-07, which is the Loop deck slab.)
- **Hint:** js/10_render.js rig._pullIn and the final guard only call World.raycastBuildings; solid props (World.props with solid && h > 2: container, plane, ship, crane legs, ferry boats, kiosks) are ignored. Add a ray vs prop (circle/box) test for big solid props to the pull-in.
- **Regression test:** `tests/regress/qa_a_cam_05.js`

### QA-A-DRV-02 (medium): Getting out of a car parked against a Loop deck barrier teleports the player down to the street 7 m below

- **Area:** vehicles / exit on the Loop deck
- **Repro:** seed=7. Sedan at (177.2,300,y 7) yaw 0 (upper west leg, driver side against the outer barrier x=176; the barrier itself lets the car sit there), enter, press F. Same at (300,129.2) yaw -PI/2 (north leg), (430.8,250) yaw PI (east leg), (177.2,450), (300,670.8) yaw PI/2 (lower h leg). Script: drv/exit_edge2.js.
- **Expected:** The player gets out on the deck (passenger side if the driver door is over the edge).
- **Actual:** The player is placed at the driver door point 0.45 m past the deck edge, at y 0.12 on the street under the Loop (5/5 cases), with no fall.
- **Hint:** js/06_entities.js Vehicle.doorSpot: the candidate is only checked with solidAt and resolveCapsule; resolveCapsule applies the deck barrier only when the point's own tile is a deck tile, so a point just off the deck passes; exit() then takes heightAt(spot, y+0.5) = ground. Reject candidates whose surface is more than ~1 m below the car
- **Regression test:** `tests/regress/qa_a_drv_02.js`

### QA-A-DRV-03 (medium): Bridge walkway railings are not solid: cars and pedestrians go straight through them into the water on every bridge

- **Area:** world / bridges
- **Repro:** seed=7, no traffic. Sedan at (330,530) yaw PI on the Sponsor Span: hold W 2.2 s, then W+A 2.5 s. Same on bridge_main (460,280) yaw -PI/2 with W+D and the causeway (605,280) with W+A. On foot: teleport(334,560) and walk east 3 s (also (322,560) west, (492,268) north). Script: drv/bridges.js, drv/misc.js.
- **Expected:** The white railings drawn along the walkways stop a car (a crash) and a walking player, like the Loop's barriers.
- **Actual:** At 18-19 m/s the car crosses the walkway and the railing with no impact and sinks (e.g. Sponsor Span: x 338.3 -> 343.2, y -1.3, sinking); the player walks through the railing and swims (341,-0.91,560). 6/6 car runs and 3/3 walks on three bridges. The screenshot shows the car past the railing in the water.
- **Hint:** js/04_world.js: the walkway railing is only drawn (Render._rail in js/10_render.js for M.WALKWAY tiles next to WATER) and the 'railing' props are solid:false; resolveCapsule has no edge rule for WALKWAY/BRIDGE tiles next to WATER (the deck-barrier rule could be reused)
- **Regression test:** `tests/regress/qa_a_drv_03.js`

### QA-A-DRV-04 (medium): The container maze's walls can be driven and walked through: each 6 m container collides as one 1.3 m circle

- **Area:** world / port container maze
- **Repro:** seed=7, no traffic. Sedan at (498,650) yaw east (the seam between two containers of the first column, x 511.35..516.65), hold W 2.5 s; also z 656 (sports), 662 (bike), 650 (truck). On foot: teleport(508,650), walk east. Script: drv/maze.js, drv/maze_shot.js, drv/clip.js.
- **Expected:** The container columns are solid walls (the maze is the point of the yard).
- **Actual:** The car drives through the column with no impact (x 508.8 -> 516.7 -> 526.4 at 15-21 m/s) and can stop inside it (514.4,650: hidden inside the boxes, see the top-down shot); the player walks through (508 -> 523.9). Only the middle 2.6 m of each 6 m box blocks (z 647 stops the car at x 508.9).
- **Hint:** js/04_world.js layout case 'yard' (and 'quay'): P({kind:'container', r:1.3}) for a 2.4 x 6 m box; resolveCapsule only knows circles. Give long props an oriented box (sx/sz) or several circles along their length
- **Regression test:** `tests/regress/qa_a_drv_04.js`

### QA-A-DRV-06 (medium): Flat out down Runway 10/10, sj_07 throws the fast cars into the sea; the sports car flies 10 m high into the invisible map edge and explodes

- **Area:** stunt jumps / sj_07 and the map edge
- **Repro:** seed=7, no traffic. Spawn each class at airport_runway.points.east (406,826) yaw west, hold W until it comes down. Scripts: drv/sj07.js, drv/runway_end.js.
- **Expected:** GDD_EXPANSION 5.7 (sj_07): the landing is the 48 m beach and 'nothing on wheels reaches the sea'; the map edge should never be met in the air.
- **Actual:** Launch speed / apex / landing: sports 50.6 m/s, apex 10 m, never lands: hits the map-edge wall at x 0 in mid-air at 50.6 m/s (hp 80 -> -18, burns) and sinks at x 8; cop 45 m/s apex 8.2 -> lands in the sea (x 2.4); bike 44 m/s -> sea, then slides on to x -6.9 outside the map while sinking; taxi 38 m/s -> lands in the water (stunt result 'water'); sedan lands at x 26 two metres from the water. Truck, van, suv, bus land on the beach. Reproduced in two runs.
- **Hint:** js/09_missions.js stunts.update: lift = speed * sin(SK.stuntLaunchAngle) with no cap, so apex grows with speed squared; cap the lift (or the take-off speed) per ramp, or lengthen the beach; js/04_world.js resolveCapsule's map-edge clamp also applies to airborne cars (an invisible wall over the sea)
- **Regression test:** `tests/regress/qa_a_drv_06.js`

### QA-A-ENT-02 (medium): Running pedestrians hover: through the whole run cycle both feet are off the ground, 3-28 cm above the pavement

- **Area:** peds / animation
- **Repro:** ?seed=7&clock=12&quality=medium, no traffic. debug.spawnPed(160,824) on the runway, ped.moveTo(x+20, z, true) every step for 2 s, read the lowest point of ped.mesh (Box3.setFromObject after GTP.Entities.sync) against World.heightAt. Script scratchpad/ent/stride.js medium (shot at the stride extreme). Also seen on natural peds: scratchpad/ent/peds.js medium 330 254 lists runners with their lowest point 0.116 m up (and npcs.js: a running thug at 0.12 m). Regress qa_a_ent_02.js.
- **Expected:** A foot is planted on the ground for most of the cycle (lowest point ~0).
- **Actual:** Running (speed 4.65-4.69 m/s): lowest point min 0.029 m, max 0.279 m, mean 0.15 m, above 10 cm in 60-61% of frames - the runner never touches the ground and its shadow shows the gap (stride_medium_run.png). Walking peaks at 0.089 m.
- **Hint:** js/06_entities.js Ped.syncMesh: both straight legs swing +-sw (run amp 1.05 rad) about the hip, which raises both feet by legLen*(1-cos sw) (~0.45 m at the extremes), and the bob is added upward (y + bob). Lower the body by legLen*(1-cos(sw)) (or bend the trailing knee) so the stance foot stays on the ground.
- **Regression test:** `tests/regress/qa_a_ent_02.js`

### QA-A-ENT-03 (medium): A lamp post knocked over by the player's car keeps glowing: its orange glow sprite hangs 6 m up in empty air and its light pool stays on the road, also after the chunk is rebuilt

- **Area:** props / knocked-over lamps at night
- **Repro:** ?seed=7&clock=22&quality=medium (and high). Lamp at (319.35, 310): free cam (325.35,3,322 -> 319.35,3.2,310) shows it lit. Spawn a sedan at (333.35,310) facing -x, enter it, full throttle until the lamp is fallen, get out and drive it away, same camera: the lamp lies on the pavement, the glow and the pool are unchanged. Teleport 450 m away and back (chunk rebuilt): still there. Second lamp: (336.65,314) driving +x at high. Scripts scratchpad/ent/knock2.js medium ; knock2.js high 336.65 314 1 0 ; knock.js medium 22 lamp,lamp. Regress qa_a_ent_03.js.
- **Expected:** A fallen lamp is dark: no head glow, no ground pool (the high-preset point light already skips fallen lamps).
- **Actual:** After the knock the chunk's glow Points still has the sprite at the old head position (y 6.02) and the 'glow' mesh still has the 11 x 11 m pool quad; both remain after the chunk rebuild (glow counts before/after/rebuilt: sprites 1/1/1, pool 1/1/1). knock2_medium_after.png: lamp lying on the sidewalk, glow ball floating above it, orange pool on the road. Independent of QA-A-NGT-01 (where the glow sits relative to a standing lamp).
- **Hint:** js/10_render.js chunk build (around line 1281: if (p.kind === 'lamp') lamps.push(p)) includes fallen lamps in the glow / pool batches, and Render.knockProp only animates the instance matrix. Skip p.fallen when building the glow, and on knockProp remove that lamp's sprite (e.g. move its Points vertex to the ground / set its alpha) and its pool quad.
- **Regression test:** `tests/regress/qa_a_ent_03.js`

### QA-A-ENT-05 (medium): Every explosion leaves a hard-edged black square on the ground (5 x 5 m for a car), not a scorch mark

- **Area:** fx / explosion decals
- **Repro:** ?seed=7&clock=12&quality=medium. Blow up a car: v = debug.spawnVehicle(200,824,'sedan'); v.applyDamage(500) (burns, then explodes) or v.explode(); advance 4 s and look at the ground. Seen on the runway, on the Loop deck (429.2,7,130) and on a downtown street (330,302). Scripts scratchpad/ent/fx.js medium (burn / explode / wreck shots), scratchpad/ent/scorch.js medium. Regress qa_a_ent_05.js.
- **Expected:** A soft, round burn mark that fades out at its edge.
- **Actual:** A solid dark square with sharp corners and straight edges (fx_medium_wreck.png, scorch_medium_deck.png, scorch_medium_street.png); on the deck it runs under the barrier. From straight above the square's corner (2.2 m, 2.2 m from the centre) is as dark as its centre (luminance 17 vs 18, plain runway 47). Rockets (rad*0.7), hot takes (2.2 m) and the helicopter crash (6 m) use the same square.
- **Hint:** js/10_render.js Render.fx.init: decals and skids share an untextured PlaneGeometry InstancedMesh whose MeshBasicMaterial has no map/alphaMap, so every decal is a uniformly coloured rectangle. Give 'decal' instances a radial alpha (a soft round texture, or a per-instance flag sampled in the onBeforeCompile shader) while skids keep the rectangle.
- **Regression test:** `tests/regress/qa_a_ent_05.js`

### QA-A-ENT-07 (medium): The bus's last side window hangs 0.36 m off the back of the bus on both sides, and its rear door z-fights with two windows (flickering stripes)

- **Area:** vehicles / bus mesh
- **Repro:** ?seed=7&clock=12&quality=medium. debug.spawnVehicle(200,824,'bus',{yaw:Math.PI/2}); look at the right (door) side: freeCam(200,1.4,815 -> 200,1,824), and the left side from (212,1.6,837). Scripts scratchpad/ent/close3.js medium bus,truck 9 (right side), scratchpad/ent/show.js medium (left side, show_medium_side_6.png), scratchpad/ent/coplanar.js. Regress qa_a_ent_07.js.
- **Expected:** All windows inside the 10 m body; doors drawn in front of (or instead of) the windows they cover.
- **Actual:** Side glass runs from z -3.50 to +5.36 on a body that ends at +5.00: a pale glass pane sticks out past the rear corner on both sides (crop_bus_rear.png, crop_bus_left.png). The right rear door (z 1.8..2.7) is in exactly the same plane (x = 1.265) as windows 4 and 5 (0.756 m2 of overlap): the door's upper half shows horizontal z-fighting stripes. The door's lower half also sits behind the rear wheel.
- **Hint:** js/05_assets.js vehicleGeometry bus: nWin 8 * winL 0.95 + 7 * gap 0.18 = 8.86 m from -hl + 1.5 overruns hl by 0.36 m (use 7 windows or fit winL to the length); the rear door box(hw - 0.015, ..., 0.03 wide) shares the window boxes' x faces - skip the windows the door covers or push the door out a few mm, and move it clear of the rear axle (hl - 2.4).
- **Regression test:** `tests/regress/qa_a_ent_07.js`

### QA-A-ENT-09 (medium): Swimmers lie on top of the water: the torso and legs ride 0.2-0.4 m above the surface and only the hands dip in

- **Area:** peds / swimming
- **Repro:** ?seed=7&clock=12&quality=medium. Teleport to the Pennant Point quay (468,206), face west (yaw -PI/2) and walk forward into the bay; 1.6 s after p.swimming turns true, look from (p.x-2.5, -0.3, p.z+3). Second place: the airport beach (29,834), walk west (yaw +PI/2), quality high. Script scratchpad/ent/swim.js medium ; swim.js high 29 834 1.5708. Regress qa_a_ent_09.js.
- **Expected:** The swimmer is half in the water: head and shoulders above, torso and legs below the surface.
- **Actual:** Hip pivot at y -0.85, 0.35 m above the water (-1.2); the whole figure apart from the hands is above the surface (bbox -1.33..-0.02 at Pennant Point, -1.39..-0.50 at the beach) - the body looks like it is lying on glass (swim_medium_468_206.png, swim_high_29_834.png).
- **Hint:** js/06_entities.js: entering water sets o.y = WATER_Y + 0.25 (startSinking / the ped water check) and Ped.syncMesh only does y -= 0.12 while swimming, with the tilt (-1.35 rad) applied about the feet. Lower the swimming mesh so the hips sit at about WATER_Y (e.g. y = WATER_Y - 0.2 with the tilt about the hips/chest).
- **Regression test:** `tests/regress/qa_a_ent_09.js`

### QA-A-ENT-10 (medium): Driving at night in first person the headlights stay behind: the spot light freezes where the view was switched and the road ahead is dark

- **Area:** vehicles / player headlight
- **Repro:** ?seed=7&clock=22&quality=medium. Spawn a sedan at (120,824) facing east (yaw -PI/2), enter it, render once (headlight on, 2 m ahead of the car), set GTP.game.player.cameraMode = 'first' (the C key cycle), drive 3 s full throttle; read GTP.Render.lights.headlight.position. Second run downtown at high: (330,302) heading north. Script scratchpad/ent/fphead.js medium ; fphead.js high 330 302 0. Regress qa_a_ent_10.js.
- **Expected:** The spot stays at the car's nose and lights the road ahead in every camera mode.
- **Actual:** After 44 m of driving the SpotLight is still at (122.2, 824) - 42-44.6 m behind the car, its target behind it too; the first-person view shows an unlit road (fphead_medium_120_824.png, fphead_high_330_302.png). Same at both places.
- **Hint:** js/06_entities.js Vehicle.syncMesh calls Render.syncVehicle only when m.visible, and the player's car is hidden in first person (hidden = pl.inVehicle === this && cameraMode === 'first'). Move the headlight placement (and the lights-on state) out of the visibility gate, or call it for the player's car regardless.
- **Regression test:** `tests/regress/qa_a_ent_10.js`

### QA-A-GEO-04 (medium): A Goldplate Links flag pole (and on seed 11 a tree) stands in the westbound lane of the road through the course, and the PAR 10 sign's post stands in the lane too

- **Area:** world generation: Goldplate Links lot props vs Clubhouse Drive
- **Repro:** seed 7: World.props flag at (528,182) (solid, r 0.2, h 3) and sign 'GOLDPLATE LINKS: PAR 10' (standing, post) at (551.4,182), both on ROAD tiles of the road at z tiles 45..46 that crosses the goldplate_links lot. Seed 11 adds a lot tree at (523.9,183.86) on the same lane. Spawn a sedan at (580,182) yaw PI/2 (west), hold forward 4 s: at 24 m/s it hits the pole at x 531 and stops (hp 100 -> 54). The sign's post is non-solid, so cars drive through it. Scripts geo/audit1.js (propOnRoad), geo/drive.js (clubhouse_west_player). Screenshot freeCam(548,3,184, 528,1.5,182): yellow pole in the middle of the lane.
- **Expected:** Course flags, trees and the course sign stand on the grass, never on the road through the lot.
- **Actual:** Solid flag pole in the lane (car stopped from 25.2 to 2.6 m/s, 46 hp lost); sign post in the lane with no collision; seed 11 also has a solid tree on the road. (Also found by the traffic lens as QA-A-TRF-06: AI cars hit the flag on Clubhouse Drive, mount the pavement and stay stuck there; seed 11 adds a tree in the same street.)
- **Hint:** js/04_world.js _landmarkProps case 'park' goldplate_links: flags at cxm +-8, z = lz + 12 + k*..., the sign at lx+lw-TILE-0.6, czm and the random trees ignore that the lot includes road tiles (the lot loop skips them); place only on GRASS tiles.
- **Also reported as:** QA-A-TRF-06
- **Regression test:** `tests/regress/qa_a_geo_04.js`

### QA-A-GEO-05 (medium): Parked cars spawn inside solid props: a hangar-row van around the windsock pole, cars under the airliners and jetbridges, on the gas pumps, crates and the stadium floodlight mast

- **Area:** AI parked-car spawner tiles vs solid props
- **Repro:** seed 7: 59 of the 1527 GTP.AI.spawner.parkTiles overlap a solid ground prop (39 airliner 'plane', 4 jetbridge, 4 crate, 2 pump, 2 pallet, 2 windsock, 2 jet, mast, flag, podium, luggage) - geo/p_parktiles.js. In play: teleport to the hangar_row door and advance 1.5 s: a beige fleet van is parked at (66,650) with the windsock (66,650) through its roof (seed 7 and seed 11); seed 7 also parks a sports car at (610,174) on the stadium mast (609.5,173.5), seed 11 a van at (770,662) on a crate (771,662.7). geo/p_park.js. Screenshot: freeCam(56,5,640, 66,1,650).
- **Expected:** Parking bays and fleet tiles exclude tiles under props (planes, pumps, jetbridges, windsocks, masts, crates); a parked car never overlaps a solid prop.
- **Actual:** Windsock pole sticks out of the parked van's roof (both seeds); cars are placed under the parked airliners' collision circles and on the gas pumps.
- **Hint:** js/07_ai.js spawner.reset builds parkTiles from every PARKING tile (and the fleet lots) without consulting World._propGrid; drop tiles whose 5.4 x 2.2 footprint meets a solid prop (or check at spawnParked).
- **Regression test:** `tests/regress/qa_a_geo_05.js`

### QA-A-NGT-01 (medium): Every street lamp's arm and head point away from the road, so the orange night glow, the ground light pool and the high/ultra point light hang in mid-air 2.85 m from the lamp head

- **Area:** render / street lamps at night
- **Repro:** index.html?headless=1&seed=7&skipTitle=1&quality=medium&clock=22 (also low/high/ultra). debug.followCam(); debug.teleport(329,524); debug.freeCam(329,1.8,524, 326,4,590) (Sponsor Span, marina) or teleport/freeCam(727,1.8,312 -> 730,4,246) (uptown). Script: scratchpad/vnight/survey.js medium 22 clear marina,uptown; numeric check scratchpad/vnight/p1_probe.js medium (LAMP line).
- **Expected:** The lamp head overhangs the road and the glow sprite / light pool / point light sit under and on the lens.
- **Actual:** All 816 lamps: the head mesh is at p - yawToDir(rot)*1.4 (over the sidewalk / away from the road) while the glow sprite, the 11 m ground pool and the point light are at p + yawToDir(rot)*1.4; measured head-to-glow distance 2.85 m on every lamp (min 2.8500, max 2.8500, e.g. head (81.9, 258) vs glow (84.75, 258)). On screen a bright orange ball floats in the air beside each lamp head, on the road side, in every lamp district (marina, uptown, airport, port, downtown, capitol) and at every preset.
- **Hint:** js/05_assets.js prop builders 'lamp' builds the arm toward local +z ('toward the road at rot 0'), but the InstancedMesh in js/10_render.js chunk build rotates it by p.rot about +y (sends +z to (sin rot, cos rot)), whereas the glow / pool (10_render night glow block) and _updateLightPool use U.yawToDir(rot) = (-sin, -cos). Build the arm toward -z (or compose with rot + PI) so mesh and lights agree; world gen's rot already points yawToDir at the road.
- **Regression test:** `tests/regress/qa_a_ngt_01.js`

### QA-A-NGT-02 (medium): Rain puddles only ever appear north of the player: the puddle budget is spent on the northern rows of the 32x32-tile window, none to the south and often none within 30 m

- **Area:** render / weather / puddles
- **Repro:** index.html?headless=1&seed=7&skipTitle=1&quality=medium&weather=rain&clock=22. For each spot (322,254) (98,126) (326,422) (650,730) (738,314) (230,730): debug.teleport(nearestRoadPoint), GTP.game.advance(0.2), render, then read Render.weather._puddles instance matrices. Script: scratchpad/vnight/p1_probe.js medium (PUDDLES line); overhead view scratchpad/vnight/p2_puddles.js medium 13.
- **Expected:** Puddles scattered around the player in all directions (and near him), so a rainy street shows puddles ahead whichever way he faces.
- **Actual:** All 24 puddles (medium; same at 40 high / 60 ultra) lie between 65 m north and 4 m south of the focus: mean dz -29..-46 m, max dz +4, 0 puddles more than 8 m to the south at all 6 spots; within 30 m only 0-5 (Sponsor Strip: 0, nearest 31 m). Walking or driving south you never see a puddle in front of you; the set re-seeds every 24 m of movement.
- **Hint:** js/10_render.js weather._placePuddles: scans tz0..tz0+32, tx0..tx0+32 in row order from the north-west corner and stops at QUALITY.puddles; candidates (hash < 0.085) outnumber the budget so the southern rows are never reached. Collect all candidates, then pick by distance to the focus (or a hash-ordered subset).
- **Regression test:** `tests/regress/qa_a_ngt_02.js`

### QA-A-NGT-05 (medium): Street-lamp point lights pop on and off at full brightness while driving (no fade), and a third of them light lamps behind the camera

- **Area:** render / lamp light pool (high, ultra)
- **Repro:** index.html?headless=1&seed=7&skipTitle=1&quality=high&clock=22&weather=clear. Spawn a sedan at the nearest road point of (322,254) (and of (738,314)), v.enter(player,0), hold forward, step GTP.game.advance(1/30) + Render.frame(1) for 150 frames, diff Render.lights.points each frame. Script: scratchpad/vnight/p5_pool.js high. A/B of one swap: scratchpad/vnight/p15_ab.js high 322 254.
- **Expected:** Lamps entering or leaving the 8 (12) light slots fade in/out, and slots go to lamps in view.
- **Actual:** Route 1 (downtown, up to 32 m/s): 20 lamps left the pool in 5 s, all 20 at intensity > 0.8 (1.24-1.35); route 2 (uptown): 23, all > 0.8. 379/1200 and 440/1200 lit slot-frames were lamps more than 8 m behind the camera. The A/B of one swap-out (lamp at (335.3, 218), 42 m ahead, intensity 1.10) turns the far crossing and the building base from warm-lit to blue-dark in one frame (17305 pixels change by > 20 levels).
- **Hint:** js/10_render.js _updateLightPool: every 0.3 s re-sorts lamps by distance to rig.focus and writes the new lamp position into each slot with intensity 1.35*lit*clamp(1.3-d/80, 0.25, 1); keep per-lamp slots with a fade (intensity lerp over ~0.4 s) and weight candidates by the camera frustum / forward direction.
- **Regression test:** `tests/regress/qa_a_ngt_05.js`

### QA-A-NGT-06 (medium): Getting into a car at night freezes the game: the player's headlight SpotLight turning visible changes the light count and recompiles every lit material

- **Area:** render / player headlight / performance
- **Repro:** index.html?headless=1&seed=7&skipTitle=1&quality=medium&clock=22 (also low, high). Spawn a sedan next to the player, render a few frames, v.enter(player,0), advance 1/30 and render. Script: scratchpad/vnight/p6_headlight.js medium / high.
- **Expected:** No shader compile when the headlights come on (the pool lights already avoid it by staying visible at intensity 0).
- **Actual:** medium: the entering frame takes 8996 ms (SwiftShader) against 14 ms before, programs 36 -> 50 -> 54; high: 18153 ms, programs 39 -> 54 -> 58; low: programs 24 -> 37, visible lights 3 -> 4. Later entries are fast (programs cached), so it hits the first car of a night session, and again when night falls (night > 0.25) while driving.
- **Hint:** js/10_render.js syncVehicle: L.headlight.visible = lightsOn (and the initial head.visible = false in _initLights). Keep the headlight spot visible always and drive intensity (0 when off), like the points / spots pools.
- **Regression test:** `tests/regress/qa_a_ngt_06.js`

### QA-A-TRF-04 (medium): Buses and trucks drive off the west end of the city into the sea: junctions leave long vehicles only 'straight' into a one-tile road stub

- **Area:** ai/traffic
- **Repro:** seed 7: clear traffic, AI.spawner.placeTraffic a bus westbound on the campus avenue, lane z 278 (tile 69, dir -1), at x 140. Advance 40 s. Script: scratchpad/regress/qa_a_trf_04.js and scratchpad/trf/stub.js. Free traffic: sim.js 7 (bus #152 at (20.5,276.7) y -1.3, sedan at (23.2,178.9), SUV at (375.8,23.5) on the capitol north edge) and sim.js 11 (bus #363 at (22.7,277.7), truck #411 at (23.9,452.9)).
- **Expected:** A long vehicle that cannot turn at the last junction stops or turns before the stub. Nothing leaves the roadway or enters the water.
- **Actual:** The bus keeps plan 'straight' into the one-tile stub at x 32..36 at 8.8 m/s, overruns the kerb, gets ai.recover, arcs into the water and sinks (y -4.4, removed). It did this 2 of 2 times. In free traffic it happened 3 times in seed 7 (bus, sedan, SUV) and 2 times in seed 11 (bus 75 m from the player, truck). The sinking car is removed in view (popOut events at 79-140 m).
- **Hint:** js/07_ai.js junctionPlan(): 'straight' stays an option (w 0.15) when the lane beyond the box runs only 1 tile (run=1) to the sea wall; for long vehicles (no rights, lefts only avenue to avenue) it is the only option. Also deadPlan braking starts too late, and the recover mode (carStep, ts 4, forward only) drives toward a road point behind the car.
- **Regression test:** `tests/regress/qa_a_trf_04.js`

### QA-A-TRF-07 (medium): Long parked vehicles (vans 5.4 m, trucks 7.5 m) are placed on 4 m parking tiles with no footprint check: their bodies stick into building walls (14 of 435 parked cars in a city sweep, e.g. a truck box inside a port warehouse at (610, 676))

- **Area:** ai/spawner
- **Repro:** seed 7: teleport near (590,160) and advance 8 s. A parked car spawns at (610,174) around the 'mast' prop at (609.5,173.5). Teleport (640,700) and advance 8 s: a parked truck at (610,676.25) has its box inside a warehouse. Scripts: scratchpad/trf/parked.js 7 parked_mast, scratchpad/trf/parkshot.js 7 640 700 park_wall_port, scratchpad/trf/parkwall.js 7, scratchpad/regress/qa_a_trf_07.js.
- **Expected:** Parked cars sit inside their bay, clear of props and walls.
- **Actual:** shots/parked_mast.png: a dark SUV with the light mast through its roof. shots/park_wall_port.png: a truck's box sunk into the warehouse wall. Seed 7 has 22 eligible bays overlapping a solid prop (mast, jet bridges, pallets, windsocks, planes, crates, a billboard pole) and seed 11 has similar ones (crates, luggage, jet bridge). A city sweep (parkwall.js) found 14 of 435 parked cars with their body in a building (vans 5.4 m and trucks 7.5 m long on 4 m tiles, at the suburbs, port and airport). In free traffic: SUV in the mast and taxi on the pallet at (106,670) in sim.js.
- **Hint:** js/07_ai.js spawner.spawnParked(): it never tests the car's footprint (type length vs the 4 m tile, yaw 0/PI) against World.solidAt or the solid prop grid; it only checks the building pattern of the neighbouring tiles. AI.spawner.reset's parkTiles also include bays with props.
- **Related:** QA-A-GEO-05 (the same spawner also ignores solid props)
- **Note:** The screenshot park_wall_port.png first attached here was taken with the free camera inside a shop building and does not show the truck; the wall overlap is measured by solidAt at the body corners (regression test: a van at (610, 677.3) with a corner inside a building).
- **Regression test:** `tests/regress/qa_a_trf_07.js`

### QA-A-TRF-08 (medium): Manifest Ramp (Lower Loop) shares lanes with the ground street under the Loop: AI cars climbing it crash across the deck into the barrier, and street cars ram the ramp's 7 m end wall

- **Area:** world/lanes + ai
- **Repro:** seed 7: clear traffic. (a) placeTraffic a sedan westbound at the ramp foot (464,630), lane tile 157 dir -1. (b) placeTraffic a sedan eastbound on the street under the deck at (404,634), tile 158 dir +1. Advance 12-14 s. Scripts: scratchpad/trf/manifest.js 7 manifest, scratchpad/trf/area.js 100 150 120 165, scratchpad/regress/qa_a_trf_08.js. Free traffic: loop.js 7 at 376,690 and 450,640, loop.js 11 at 450,640, jam.js 7 450,640.
- **Expected:** The ramp leads onto the Lower Loop deck with a right merge, and the street under the deck ends (or turns) before the ramp wall.
- **Actual:** (a) The car reaches the deck at 11.6 m/s still on plan 'cruise' along the ground street (axis h), hits the far barrier at x 418.6 (speed 1.1, then -0.4), and only turns onto the leg after reversing. (b) The car drives into the ramp's high end at x 429.7 (nose at x 432.1) and rams it, reverses and rams again for the whole 14 s (shots/manifest.png: taxi nose against the ramp end under the deck). In free traffic, cars on the Lower Loop near this ramp were moving only 24-29% of the time (loop.js, both seeds), with head-on standoffs on the ramp top.
- **Hint:** Ground tiles (100..107, 157..158) under the Lower Loop's leg carry the same laneH bytes as the Manifest Ramp, and js/07_ai.js stepLayer() returns 'ground' for a ROAD neighbour before it checks the ramp-to-deck case. The other five ramps' top ends border non-road ground. Fix in js/04_world.js (do not run the street into the ramp end) and/or in stepLayer (prefer 'deck' when rampY > DECK_Y-1.2).
- **Related:** QA-A-GEO-02 (same spot: the ground street feeding the ramp's high end)
- **Regression test:** `tests/regress/qa_a_trf_08.js`

### QA-A-TRF-09 (medium): Two signalled junctions are only half in the lane field: northbound cars in Heirloom Heights (724,420) and westbound cars at the Jet Ramp foot on the Strip (276,420) drive through on red at full speed

- **Area:** world/lanes
- **Repro:** seed 7: static scan of all 149 junction boxes (scratchpad/trf/boxes.js). Then clear traffic and wait for phase 'ew' at tile (181,105). placeTraffic a sedan northbound in lane x 730 (tile 182, dir -1) at z 462. Do the same westbound in lane z 422 (tile 105) at x 304 with phase 'ns' at (69,105). Scripts: scratchpad/trf/halfbox.js, scratchpad/regress/qa_a_trf_09.js.
- **Expected:** Every junction box is a full rectangle of tiles with both laneH and laneV, so every approach lane sees the junction, its signal and its yield.
- **Actual:** Tiles (182,105),(182,106) have no laneH and (69,105),(70,105) have no laneV. The northbound car stays on plan 'cruise' and passes the box (z 420..428) at 11.1 m/s on red, while a southbound car in the other half stops at z 413. The westbound car at z 422 passes x 276..284 at 10.4 m/s on red, while the eastbound car in lane z 426 stops at x 262.3. These lanes never yield to crossing traffic either.
- **Hint:** js/04_world.js road stamping (laneH/laneV around line 571) or js/20_content_world.js road extents: the uptown east-west street stops one tile short of the far half of the north-south street (to=181 instead of 182), and the Jet Ramp's north-south lanes stop at its foot (tile row 104) instead of running through the box row 105.
- **Regression test:** `tests/regress/qa_a_trf_09.js`

### QA-A-VIS-01 (medium): Flat roofs stretch the gravel texture 5-40x into streaks (u and v swapped on the roof quad)

- **Area:** render / building roofs
- **Repro:** ?seed=7&quality=low (also medium/high), GTP.game.debug.setClock(12); freeCam(40,45,500, 110,0,430) (industrial) or freeCam(40,45,40, 100,0,110) (suburbs) or any elevated view / the Loop deck. Script: scratchpad/vday/shoot.js (views industrial_up, suburbs_up, campus_up), probe scratchpad/vday/p_roof.js
- **Expected:** Roof gravel with square texels: the same pixels per metre along x and z
- **Actual:** Every flat roof shows long parallel streaks. Render._roof maps the gravel band with v (the band's 160 px height) across the whole roof width and u repeating b.w/8 times along the depth: a 30 x 20 m roof gets 5.3 px/m along x vs 96 px/m along z (18x), a 40 x 16 m roof 4 vs 160 px/m (40x), 12 x 12 m 13.3 vs 64 (4.8x)
- **Hint:** js/10_render.js _roof (flat roof branch): rq = [[0, ruv[1]], [b.w/8, ruv[1]], [b.w/8, ruv[3]], [0, ruv[3]]] is assigned to the corners (x0,z0),(x0,z1),(x1,z1),(x1,z0), so u runs along z and v along x; the u span should follow x (b.w/8) and the v span should repeat with b.d (the band is clamped in v, so tile it by splitting or use a dedicated gravel cell)
- **Regression test:** `tests/regress/qa_a_vis_01.js`

### QA-A-VIS-03 (medium): At sunset and sunrise the sky shows a hard dark arc about 36 degrees up when looking toward the sun

- **Area:** render / sky at dusk and dawn
- **Repro:** ?seed=7&quality=low or high, setClock(18.6) (also 6.8); look toward the sun: sunDir = GTP.Render.lights.sunDir, freeCam(330,60,560, 330+sunDir.x*100, 60+sunDir.y*100, 560+sunDir.z*100). Script: scratchpad/vday/sun.js (PRESET=low and PRESET=high), probe scratchpad/vday/p_sky.js
- **Expected:** A smooth gradient from the warm horizon glow to the dusk zenith
- **Actual:** A sharp curved band edge across the top of the frame (both at 18:36 and 06:48, every preset, at any camera height). In the sky canvas column under the sun the luminance jumps 15.7-18.3 levels between two rows at 0.297 of the sky height (18:36) and 13.7-14.3 at 06:48, against at most 4-5 per row anywhere else (noon 4.3)
- **Hint:** js/10_render.js _paintSky: the dusk horizon band (hg, a radial gradient of radius W*0.45 centred at H*0.5) is filled only into ctx.fillRect(-ox, H*0.3, W, H*0.25), so the gradient is cut off at row 0.3H where it is still bright; fill the whole canvas height (or fade the gradient to 0 before 0.3H)
- **Regression test:** `tests/regress/qa_a_vis_03.js`

### QA-A-VIS-06 (medium): Sign lettering is stretched sideways on half the signs (up to 3.2x): textures come in only 1:1, 2:1 and 4:1

- **Area:** render / signs and billboards
- **Repro:** ?seed=7&quality=medium, setClock(12); look at THE YELL NETWORK (300,220,y 39.4), GOLDPLATE INTERNATIONAL (304,696), OCTANE OPINIONS (206,436), THE HEIRLOOM CLUB (798,260) head-on. Script: scratchpad/vday/signshot.js, probe scratchpad/vday/p_sign4.js
- **Expected:** Letters keep their proportions on every sign
- **Actual:** Wide squat lettering: Render._buildProps picks a texture ratio of 1, 2 or 4 (0.5 for banners) while the planes are up to 13:1, so 72 of 138 sign planes stretch their texture by more than 25%: THE YELL NETWORK 3.23x (31 x 2.4 m on a 4:1 texture), CUSTOMS: NOTHING TO DECLARE 3.14x, GOLDPLATE 2.81x, WEATHER BALLOON REPAIR 2.77x, GOLDPLATE INTERNATIONAL 2.70x, THE HEIRLOOM CLUB 2.05x
- **Hint:** js/10_render.js _buildProps signs.forEach: ratio = banner ? 0.5 : ar >= 3 ? 4 : ar >= 1.5 ? 2 : 1 - pass the real aspect (rounded to a few buckets up to 16) to Assets.signMaterial / Assets.billboard (js/05_assets.js), which already sizes the canvas as 512 x 512/ar
- **Regression test:** `tests/regress/qa_a_vis_06.js`

### QA-A-CAM-04 (low): First person on the bike puts the eye at handlebar height (0.9 m), below a standing pedestrian's chest

- **Area:** camera / first person on the bike
- **Repro:** seed=7. spawnVehicle(120,90,'bike'), get on, press V twice (first person). Scripts: scratchpad/cam/fp.js, regress qa_a_cam_04.js
- **Expected:** Eye at the rider's head, ~1.6 m (saddle 0.86 m + torso; the close chase shot shows the rider's head ~1.7 m up).
- **Actual:** Camera y = v.y + 0.90 (sedan 1.19, truck 2.46, bus 2.62). Hydrants and pedestrians look huge; the view is from the handlebars.
- **Hint:** js/05_assets.js vehicleGeometry lightPoints.eye: y = H * 0.82 uses the bike body height 1.1; for the bike use the rider's eye (saddle 0.86 + C.PLAYER.eye - 0.84).
- **Regression test:** `tests/regress/qa_a_cam_04.js`

### QA-A-CAM-06 (low): Backing a bus or truck up to a wall pulls the chase camera down onto its own roof: the roof covers 60-70% of the screen and the road ahead is hidden

- **Area:** camera / bus and truck against walls
- **Repro:** seed=7. Bus or truck facing west with its rear 0.35 m from the west face of building #0 (x=144, z=254.5) or building #13 (x=288, z=110.5). Script: scratchpad/cam/misc.js (PART=wall), regress qa_a_cam_06.js
- **Expected:** The camera rises / tilts to look over the vehicle (as in the open, where the bus covers ~11% of the screen).
- **Actual:** Camera 0.65 m above the bus roof (y 3.88, roof 3.23) and 0.44 m above the truck box; the own vehicle covers 59% (bus) and 70-72% (truck) of the screen vs 9-11% on an open road; both locations identical. Screens show a flat grey roof up to the horizon.
- **Hint:** js/10_render.js rig.update: _pullIn/guard shorten the boom along the same line (pitch kept), so a short boom ends right over the roof; when pulled in in a vehicle, raise the camera / pitch down to keep the view over the body (or clamp min distance for tall vehicles and raise height).
- **Regression test:** `tests/regress/qa_a_cam_06.js`

### QA-A-CAM-07 (low): After a teleport into an area not built yet (and right after the boot) whole blocks pop in over 11-22 frames: chunks 37-83 m away are missing from the first frame

- **Area:** chunk streaming
- **Repro:** seed=7, live chunk budget (Render.headless=false: 3 chunks per frame once 8 exist). (a) boot like the game: invalidateAll + prebuild(spawn, 100 m) -> first frame misses 8 chunks in view, nearest 83 m, complete after 11 frames. (b) having seen only the campus (prebuild 110,270 r300), teleport to the port (560,610) -> 22 chunks missing, nearest 37 m, 22 frames to fill; uptown (760,300) -> 19 missing, nearest 48 m, 18 frames. Happens on save load, mission/cutscene moves, respawn into unvisited areas. Script: scratchpad/cam/spawnpop.js, scratchpad/cam/stream.js, regress qa_a_cam_07.js
- **Expected:** No visible hole inside the fog after a teleport: build the chunks in view (at least within fogStart) synchronously or behind a fade.
- **Actual:** Uptown first frame shows sky where the brick rows behind the player belong; they appear over the next 18 frames (compare spawnpop_teleport_uptown_f1.png / _done.png). While driving flat out (sports, 47-51 m/s, Loop west leg + lower leg, 6 legs across the map) no chunk was ever missing in view: the 3/frame budget keeps up; chunk builds cost 1.7 ms mean, 9 ms max.
- **Hint:** js/10_render.js ensureChunks: budget 3 per frame once Render.chunks.size >= 8; debug.teleport / Entities respawn / load do not call Render.prebuild. Prebuild (sync) the chunks in view within fogStart on teleport/respawn/load, or raise the budget for chunks closer than fog.near.
- **Regression test:** `tests/regress/qa_a_cam_07.js`

### QA-A-CAM-08 (low): Pedestrians vanish at 110 m in clear air (fog starts at 120 m) and cars at 200 m while only 56% fogged: visible pop-in/out down every long avenue

- **Area:** entity draw distance vs fog
- **Repro:** seed=7, quality medium, noon. Free camera at (40,3,90.5) looking east along the avenue; spawn a ped at x=40+108.5 then x=40+111.5; a red van at +198.5 then +201.5. Script: scratchpad/cam/pop.js, regress qa_a_cam_08.js
- **Expected:** Entities are culled where the fog already hides them (or fade out).
- **Actual:** QUALITY pedDraw 110, vehicleDraw 200, fog 120..260. Ped at 108.5 m: drawn, fog amount 0, ~10 px tall, removing it changes pixels by up to 47 levels; at 111.5 m gone. Van at 198.5 m drawn (fog 0.56, max change 18 levels), gone at 201.5 m. The 'far' draw setting (fog 166..360) makes it worse (peds pop with no fog at all, cars at 17% fog).
- **Hint:** js/01_config.js QUALITY pedDraw/vehicleDraw vs fogStart/drawDistance (also 11_ui.js applySetting drawDistance changes fog but not the entity ranges); js/06_entities.js tooFar(). Tie the cull distances to the fog (e.g. near + 0.85*(far-near)) or fade.
- **Regression test:** `tests/regress/qa_a_cam_08.js`

### QA-A-DRV-05 (low): The mansion hedge maze can be walked through: each 14-22 m hedge collides only as a 1 m circle at its centre

- **Area:** world / mansion hedge maze
- **Repro:** seed=7. The hedges at x 604..613.6, z 228.5/231.5 (sz 14-17) and x 570 (sz 22). teleport(600,233.5), walk east 2.5 s; or teleport(566,235) and walk east. Script: drv/clip.js, regress qa_a_drv_05.js.
- **Expected:** The hedges (drawn 1 m wide, 1.2-1.8 m tall) block the player.
- **Actual:** The player walks straight through all five maze hedges (x 600 -> 616.3 at z 233.5) and through the 22 m boundary hedge (566 -> 571.6).
- **Hint:** js/04_world.js case 'mansion': P({kind:'hedge', r:1, sx:1, sz:...}); the collider ignores sx/sz (same root as QA-A-DRV-04)
- **Regression test:** `tests/regress/qa_a_drv_05.js`

### QA-A-DRV-07 (low): Under the Loop, looking up in a car puts the chase camera through the deck: the screen shows only the deck's asphalt

- **Area:** camera / under the Loop
- **Repro:** seed=7. Sedan on the street under the upper west leg at (184,186,y 0) yaw east (or under the z-94 leg at (300,376) yaw 0); move the mouse up (Input.setLook(0,30) x10). Script: drv/cam_deck.js.
- **Expected:** The camera stays under the slab (pulled in against it) so the car stays in view.
- **Actual:** The camera rises to y 8.6-9.6 above the 6.3-7 m slab (pitch 1.05) and the frame is filled by the top of the deck; the car is not visible (cam_deck_4.png). On foot the same pitch stays under (5.5 m).
- **Hint:** js/10_render.js Render.rig.update/_pullIn: the pull-in and the guard only raycast World.raycastBuildings; add the deck slab (World.deck tiles, y 6.3..7) to the camera ray test, or clamp the camera height under a deck tile when the focus is below it
- **Regression test:** `tests/regress/qa_a_drv_07.js`

### QA-A-DRV-08 (low): Cars drive straight up the 1.3 m vertical front and the sides of a stunt wedge with no impact

- **Area:** stunt ramps / wedge collision
- **Repro:** seed=7. Sedan 14 m in front of sj_01's tall end (stuntRamps[0], driving back toward the wedge), hold W 2.5 s; same for sj_02 and sj_04, and from the side (12 m off, perpendicular). Script: drv/wedge.js.
- **Expected:** The tall end (a 1.3 m wall) stops the car like a kerb wall / crash; the sides likewise.
- **Actual:** The car hits the face at 9-13 m/s, is snapped up to y 1.0 on top of the wedge without an impact event or speed loss, and rolls off the low end (3/3 wedges); from the side it rides up 0.45 m onto the wedge (3/3). Peds are correctly blocked by the 0.5 m step-up.
- **Hint:** js/06_entities.js Vehicle.update: on the ground `this.y = |g.c - y| > 0.4 ? g.c : damp(...)` accepts any step up; js/04_world.js resolveCapsule handles RAMP tiles but not wedges (World._wedges). Treat a wheel height jump above ~0.5 m as a wall (push back) or add the wedge's front and sides to resolveCapsule
- **Regression test:** `tests/regress/qa_a_drv_08.js`

### QA-A-ENT-04 (low): Skid marks on the Loop ramps float up to 0.3 m above the asphalt (sliding uphill) or are buried under it (sliding downhill)

- **Area:** fx / skid marks
- **Repro:** ?seed=7&clock=12&quality=medium, no traffic. Put the player's sedan on a Loop ramp foot heading up (e.g. tile 57,23 heading +z, or 69,103 heading -z), full throttle 1.6 s, then handbrake + left 0.9 s; compare each Render.fx 'skid' entry's y with World.heightAt at its x/z. Same from a ramp top heading down (tile 57,29 heading -z; 101,81 heading -x; 109,157 heading +x). Script scratchpad/ent/skid.js medium 0 (side shots from just above the ramp surface) and skid.js low 3/12/25 for the other ramps. Regress qa_a_ent_04.js.
- **Expected:** Skid marks lie on the ramp surface.
- **Actual:** Uphill: 10-24 marks 0.06-0.30 m above the ramp (skid_medium_up_0_side.png: dark stripes hovering with asphalt visible under them). Downhill: every mark 0.12-0.26 m under the surface, invisible. Same numbers on four different ramps.
- **Hint:** js/06_entities.js (skid fx, ~line 936): y: this.y is the car centre's height, but the mark is placed 0.62*hl behind it; and the decal is always flat (Render.fx._placeDecal). Use World.heightAt(wx, wz, this.y) for y and tilt the decal by the car's pitch/roll (the same applies to the explosion scorch decal on a slope).
- **Regression test:** `tests/regress/qa_a_ent_04.js`

### QA-A-ENT-06 (low): Pedestrians' speech bubbles are drawn through buildings: a ped on the far side of a block 'talks' out of the facade

- **Area:** peds / barks (speech bubbles)
- **Repro:** ?seed=7&clock=12&quality=medium. Building (304..316, 432..448), 12.8 m tall: ped = debug.spawnPed(310, 429.8) on the sidewalk behind it, ped.speakLine('...'), free cam on the street in front (308, 2, 458 -> 310, 4, 440). Second: the building at (428..448, 96..116), ped at (437.9, 93.8), camera at z 126. Script scratchpad/ent/bark.js medium 330 300 ; bark.js medium 700 200. Regress qa_a_ent_06.js.
- **Expected:** A bubble shows only when its ped can be seen (or at least not over an opaque building between the camera and the ped).
- **Actual:** The bubble is drawn in the middle of the facade at the hidden ped's head height (bark_medium_330_300.png, bark_medium_700_200.png); HUD pixels in the bubble rectangle: 1020 opaque for the hidden ped vs 1320 for the same ped in plain view.
- **Hint:** js/11_ui.js drawBarks: candidates are filtered by distance (40 m), mesh.visible (draw distance only) and the screen rectangle, with no occlusion test. Cast World.raycastBuildings from the camera to the ped's head (as 07_ai's 3D bark sprite path could, with depthTest) and skip occluded peds.
- **Regression test:** `tests/regress/qa_a_ent_06.js`

### QA-A-ENT-08 (low): Coplanar body details z-fight: the front licence plate inside the grille on six car classes, the podcast van's chrome strip across its LOUD & CORRECT wrap, the bus's navy stripe in the bus's sides

- **Area:** vehicles / body decals
- **Repro:** ?seed=7&clock=12&quality=high. Spawn a sedan at (200,824), a bus at (220,824) and the pod van debug.spawnVehicle(240,824,'van',{wrap:'pod'}) facing -x; close free-cam views: plate (196.6,0.75,824.3 -> 200,0.55,824), wrap strip (240.5,0.9,826.6 -> 241.5,0.75,825.05). Script scratchpad/ent/zf.js high ; geometry scan scratchpad/ent/coplanar.js. Regress qa_a_ent_08.js.
- **Expected:** Decals (plate, strips, stripes) sit a few mm proud of the surface under them.
- **Actual:** Overlapping outward faces in one plane: front plate vs grille at z = -hl - 0.02 on sedan, taxi, cop, sports, SUV (0.043 m2) and van (0.025 m2) - the plate shows torn, flickering edges (zf_high_plate.png); pod van chrome beltline vs the wrap quad at x = +-1.062 (0.100 m2 per side) - a jagged line through 'ASK ME ANYTHING...' (zf_high_belt.png, crop_wrap.png); bus navy stripe vs body sides at x = +-1.25 (0.576 m2 per side).
- **Hint:** js/05_assets.js vehicleGeometry: plates() front PLATE box front face at zf - 0.02 equals the grille box front (zf - 0.02); beltline() chrome outer face at hw + 0.012 equals the wrap quad offset e = 0.012; the bus stripe box is exactly Wd wide. Offset each decal by ~5 mm (or shorten the grille / drop the beltline under the wrap).
- **Regression test:** `tests/regress/qa_a_ent_08.js`

### QA-A-GEO-06 (low): The Ferry to Elsewhere's pier has no district: World.districtAt returns null and the minimap chip reads OPEN WATER while you stand on it

- **Area:** districts: ferry pier outside the port rectangle
- **Repro:** seed 7 and 11: tiles x 192..193, z 216..221 (the 2 x 6 ferry pier the dock rule turns from water into PLAZA) have zone 0; World.districtAt(770,870) === null. ui.js minimap chip: line1 = d ? name : 'OPEN WATER'. geo/audit2.js (noDistrictTiles, 12 tiles, both seeds).
- **Expected:** The pier reads MANIFEST HARBOR like the rest of the ferry terminal (district-keyed spawn tables and the chip agree).
- **Actual:** 12 walkable PLAZA tiles with no district on both seeds; the only land tiles in the map without one.
- **Hint:** js/20_content_world.js port district rect ends at z 215 while ferry_terminal's pier (04_world.js _landmarkProps case 'ferry', fz = lot.z + lot.d = 216, flen 6) extends to z 221; extend the rect or assign zone when the pier is laid.
- **Regression test:** `tests/regress/qa_a_geo_06.js`

### QA-A-NGT-03 (low): Sidewalk puddles float over the road: a disc at curb height (0.13 m) placed anywhere in a sidewalk tile reaches 1-2 m out over the asphalt

- **Area:** render / weather / puddles
- **Repro:** index.html?headless=1&seed=7&skipTitle=1&quality=medium&weather=rain&clock=22; teleport to the nearest road point of (322,254), (326,422), (650,730), (738,314), call Render.weather._placePuddles and sample each disc rim (0.85-0.9 r) against World.heightAt. Scripts: scratchpad/vnight/p1_probe.js (overhang counts), scratchpad/regress/qa_a_ngt_03.js; close-up scratchpad/vnight/p17_evidence.js (kerb_puddle).
- **Expected:** A puddle lies on the surface it covers (clipped to its tile or kept clear of the kerb).
- **Actual:** 13 of 96 placed puddles hang over lower ground, e.g. disc centre (309.0, 0.13, 188.7) r 2.4: its rim at (310.9, 187.4) is 0.13 m above the road (heightAt 0). Per spot 3-7 of 24 overhang. The dark mirror sheet hovers above the gutter with its edge in the air.
- **Hint:** js/10_render.js weather._placePuddles: y = W.groundY(t) + 0.012 per tile, x/z anywhere in the tile and scale up to 3.2 x 2.1 m; clamp the radius to the distance to the tile edge (or reject discs whose rim leaves tiles of the same ground height).
- **Regression test:** `tests/regress/qa_a_ngt_03.js`

### QA-A-NGT-04 (low): The moon is 80 degrees away from the moonlight that lights the city, and it never moves during the night

- **Area:** render / night sky
- **Repro:** index.html?headless=1&seed=7&skipTitle=1&clock=22&weather=clear; for h in 22, 1, 3: debug.setClock(h); GTP.game.render(); compare (sky.moon.position - sky.dome.position) with (lights.sun.position - lights.target.position). Script: scratchpad/vnight/p1_probe.js (MOON line); view scratchpad/vnight/p16_moon.js.
- **Expected:** The night directional light (and its shadows) comes from where the moon is drawn, and the moon crosses the sky over the night.
- **Actual:** Moon direction (0.42, 0.72, -0.56) (north-east, 46 deg up) vs light direction (-0.35, 0.81, 0.46) (south-west): 80 deg apart at 22:00, 01:00 and 03:00; both identical at all three hours.
- **Hint:** js/10_render.js updateEnvironment sets sunDir to a fixed (-0.3, 0.7, 0.4) when night > 0.5, and frame() places the moon at (-sunDir.x, 0.6, -sunDir.z): the sign flip mirrors it. Derive both from one moon model (e.g. opposite the sun's arc) and place the sprite along +lightDir.
- **Regression test:** `tests/regress/qa_a_ngt_04.js`

### QA-A-NGT-07 (low): It rains under the Loop deck: the streak cloud falls through the 7 m deck onto the covered road

- **Area:** render / weather / rain streaks
- **Repro:** index.html?headless=1&seed=7&skipTitle=1&quality=medium&weather=rain&clock=23. debug.followCam(); debug.teleport(186,402); advance 0.3; debug.freeCam(187,1.6,396, 187,2.8,432) (Lower Loop leg) or teleport(178,182) + freeCam(179,1.6,172, 179,2.8,215) (upper Loop). Scripts: scratchpad/vnight/p16_moon.js (underloop shot), scratchpad/vnight/p17_evidence.js.
- **Expected:** No drops under the deck slab (rain only falls where the sky is open).
- **Actual:** Drops fall between the pillars right in front of the camera under the deck; of the 321 drawn drops within 12 m, 37 (186,402) and 39 (178,182) are under the deck slab (deck tile overhead, y < 6.6 m).
- **Hint:** js/10_render.js weather.frame wraps every drop in an 18 m box around the camera with no cover test; drop (or clamp the column of) drops whose tile has World.deck set when the camera is below DECK_Y, or hide the streaks under cover.
- **Regression test:** `tests/regress/qa_a_ngt_07.js`

### QA-A-NGT-08 (low): Starless hole overhead: the 700 stars only go up to 56 degrees, so the sky around the zenith is blank

- **Area:** render / night sky
- **Repro:** index.html?headless=1&seed=7&skipTitle=1&quality=medium&clock=23&weather=clear; debug.freeCam(330,3,400, 330.01,200,400.2) (look straight up). Script: scratchpad/vnight/p8_misc.js medium (zenith_clear); geometry check scratchpad/regress/qa_a_ngt_08.js.
- **Expected:** Stars spread over the whole sky dome, including straight up.
- **Actual:** Highest star at 56.1 deg; 0 of 700 stars above 60 deg (a uniform sky has ~13%). Looking up shows a large empty disc ringed by stars.
- **Hint:** js/10_render.js _initSky: e = 0.06 + R.random() * 0.92 (radians: 3.4 to 56 deg). Use e = asin(0.06 + random * 0.94) (uniform on the dome) or extend the range to PI/2.
- **Regression test:** `tests/regress/qa_a_ngt_08.js`

### QA-A-NGT-09 (low): At night the rain puddles look like dark stains on the shining wet road and hide the lamp reflections

- **Area:** render / weather / puddles
- **Repro:** index.html?headless=1&seed=7&skipTitle=1&quality=ultra&weather=rain&clock=23 (also medium/high). debug.teleport(325,248), debug.freeCam(325,1.8,248, 322,4,314): puddle at (322.8, 248.8) ahead. Port: puddle at (619.3, 727) seen from 9 m along the road. Scripts: scratchpad/vnight/survey.js ultra 23 rain downtown, scratchpad/vnight/p18_puddlelook.js ultra|high|medium.
- **Expected:** A puddle reads as a mirror, at least as bright as the wet road around it, with the lamps and neon reflected in it.
- **Actual:** Puddles render as dark matte ellipses over the lit asphalt and cover the lane dashes: screen luminance inside vs a ring of road around the Container Crescent puddle: 36 vs 56 (medium), 82 vs 93 (high), 81 vs 92 (ultra); the downtown one is a dark blot in the middle of the lamp glare.
- **Hint:** js/10_render.js weather.init puddle material (color #2a323c, roughness 0.02, metalness 0.4, opacity 0.6, envMapIntensity 2): at night it mirrors the near-black env map and its tiny highlight hides the broad wet-road specular below. Blend additively / multiply-darken less, raise roughness a little so lamps spread, or reflect the lit facades (planar reflection or a night env with lit windows).
- **Regression test:** `tests/regress/qa_a_ngt_09.js`

### QA-A-VIS-02 (low): Runway centreline dashes are split in two mismatched halves with a step and a dark seam down every dash

- **Area:** render / airport runway paint
- **Repro:** ?seed=7 (any preset), setClock(12), freeCam(150,1.5,830, 300,0,822) (street level on Runway 10/10). Script: scratchpad/vday/shoot.js view runway_low (low, medium and high presets)
- **Expected:** One continuous dashed centreline, each dash a single clean bar
- **Actual:** Each dash is drawn half in the tile row zc and half in zc+1 (runway_center rotated 0 and 2); the dash pattern in the cell (fillRect 20..110 and 150..220 px) is not symmetric, so the 180-degree half is offset: sampling 0.06 m either side of the seam over the runway length, north and south disagree on 17.5% of the length (559 of 3200 samples) - every dash shows a ~0.3 m stagger and a thin dark line along its middle
- **Hint:** js/05_assets.js TILES.runway_center (asymmetric dash positions) + js/10_render.js _runwayCell (zc gets rot 0, zc+1 rot 2): mirror the second row (flip v instead of a 180 turn) or make the dash pattern symmetric about the cell centre, and paint the dash to the cell edge so the gutter does not leave a seam
- **Regression test:** `tests/regress/qa_a_vis_02.js`

### QA-A-VIS-04 (low): About 30% of the city's trees push their canopy through the wall of the building next to them

- **Area:** world / prop placement (trees)
- **Repro:** ?seed=7&quality=medium, setClock(12); stand on the sidewalk of Clarity Close: teleport(102,130), chase camera facing +x (scratchpad/vday/street.js, shot st_medium_12_suburbs.png); or freeCam(103,3,108, 107.2,3,101.5) (Monday Memo Mews, scratchpad/vday/views_tree.json). Probe scratchpad/vday/p_tree.js
- **Expected:** Street and lawn trees planted clear of facades (canopy outside the walls)
- **Actual:** Leaves clip straight through house siding and windows. The tree canopy radius is 2.34 m x scale; 245 of 787 trees reach more than 0.6 m into a filler building (uptown 136, suburbs 45, hills 24, campus 20, capitol 20), e.g. (107.2,101.5), (170.5,107.2), (154,304.8)
- **Hint:** js/04_world.js street furniture (tree at cx - ox*0.5 on sidewalk tiles beside lots, ~line 1405) and GRASS tiles (~line 1413, jitter of +-1.3 m): no clearance check against World.buildings / BUILDING neighbour tiles; skip or shrink trees within canopy radius of a building
- **Regression test:** `tests/regress/qa_a_vis_04.js`

### QA-A-VIS-05 (low): Chunk LOD pop: beyond lodDistance whole blocks turn 20-30% darker (Lambert far materials lack the environment light)

- **Area:** render / chunk LOD
- **Repro:** ?seed=7&quality=low (also high), setClock(12), freeCam(260,40,420, 330,0,250) over downtown and freeCam(30,30,30, 120,0,200) over the suburbs; compare with GTP.C.QUALITY.lodDistance = 1e5 (all chunks near). Script: scratchpad/vday/lod.js
- **Expected:** The far LOD matches the near look, so nothing changes as a block crosses QUALITY.lodDistance
- **Actual:** Pixels the swap changes go from mean RGB (78,100,123) to (57,73,89) downtown and (117,133,143) to (88,101,107) in the suburbs on low; (95,122,151) to (78,98,120) downtown on high. With every chunk forced far vs near the changed pixels drop from 107.5 to 81.5 (ratio 0.76). Driving or walking, a block visibly brightens/darkens as it crosses lodDistance (90/120/150/200 m) and the skyline shows a brightness seam between near and far chunks
- **Hint:** js/05_assets.js facadeMaterialFar / groundMaterialFar / propMaterialFar are MeshLambertMaterial without scene.environment (the near MeshStandardMaterial gets envMapIntensity 0.5-0.7 of the sky PMREM as extra ambient): raise the far materials' colour/emissive or add an ambient term to match, or use a cheap Standard variant
- **Note:** The camera lens measured the swap changing only 0-0.8% of the screen while driving, so the pop is subtle in motion; it reads as a darker band of distant towers in still views (vday/crops/lod.png: left near, right far).
- **Regression test:** `tests/regress/qa_a_vis_05.js`

### QA-A-VIS-90 (low): The game view never fills a desktop window: 16 px black bars down both sides (the GL and HUD canvases are 1248 px wide in a 1280 px window)

- **Area:** page layout / index.html
- **Repro:** Open index.html?headless=1&seed=7&skipTitle=1 in a 1280x720 viewport and take any screenshot (e.g. tests/out/qa_boot.png, or any feel2_*.png). document.getElementById('gl').getBoundingClientRect() -> x 16, width 1248. Seen on every screenshot of every tester (two separate boots checked).
- **Expected:** On a desktop (no safe-area insets) the game fills the window edge to edge, as a GTA-style game should; the gutter belongs only where a notch or rounded corner needs it.
- **Actual:** #app has padding-left/right max(16px, env(safe-area-inset-*)), so a constant 16 px dark strip frames the view on both sides at every size; the HUD's left health bar sits next to it.
- **Hint:** index.html #app CSS: use env(safe-area-inset-left, 0px) alone (or a max() with 0) so the gutter is only the safe area; Render.resize already reads the stage size.
- **Regression test:** `tests/regress/qa_a_vis_90.js`
