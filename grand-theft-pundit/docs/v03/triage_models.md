# v0.3 integration round 1 — models track triage

Branch `v03/models`, merged with `origin/game/grand-theft-pundit` @ 10ba585. Owned files: `js/05d_models.js`,
`js/06c_animation.js`, `tests/characters.js`, `docs/v03/models.md`, this file.

Sources triaged: `docs/v03/qa_r1_bugs.json`, `qa_a.json`, `qa_b.json`, `qa_c.json`, `qa_d.json`. Every bug whose `hint`/`file`
points at character or vehicle meshes, the ped rig or animation was re-checked on the merged build
(scratch probes plus the QA block in `tests/characters.js`). The v0.2 code the hints name (`05_assets.js vehicleGeometry`,
`Ped.syncMesh` in `06_entities.js`, `pedGeo`) is replaced at runtime by 05d / 06c, so the fixes land there.

## Bugs in the models / animation area

| Id | Status | Root cause and fix | Verification |
|---|---|---|---|
| QA-A-ENT-01 (interiors stick out of the car) | fixed | The dash top sat 3 cm above the beltline on some classes; it is now `beltline + 0.03 - 0.11`. Seats were already inside the greenhouse. | `tests/characters.js` "qa": for all nine classes, 0 interior vertices above the body (roof furniture — taxi sign, light bar, rails — excluded by `y > spec.height + 0.01`). |
| QA-A-ENT-02 (running peds hover) | fixed | 06c now grounds the stance foot after the locomotion pose: forward kinematics of both legs, the hips drop by the lower ankle's excess over rest (a run keeps a 2.5 cm flight phase) and rise if it sinks > 8 mm. | QA block: lowest ankle over a run cycle 0.077–0.11 m (rest ~0.08). |
| QA-A-ENT-07 (bus side window past the back) | already fixed | The lofted bus body places windows inside ±half-length; no v0.2 window strip is drawn. | Probe: max window z within the body length. |
| QA-A-ENT-08 (front plate z-fights inside the grille) | fixed | Front plate now sits below the grille (`max(bottom + 0.09, grilleY - grilleH - 0.085)`, trucks keep the bumper plate); stripes and decals moved 8 mm off the skin. | Probe + `characters_cars` screenshot. |
| QA-A-ENT-09 (swimmers lie on the water) | fixed | Swim pose drops the root 0.54 m (hips at the waterline, head just above it). | QA block: hips −0.04 m, head +0.1 m relative to the water. |
| QA-A-CAM-04 (first person on the bike at handlebar height) | fixed | The bike's `lightPoints.eye` comes from the seat: `seats[0].y + 0.64` = 1.52 m. | QA block: eye > 1.4 m. |
| stab-QA-D-01 / QAC-01 (ped geometry cache never evicts) | already fixed | 05d's look cache is ref-counted with a 48-entry idle LRU; the Render.detach / attach wrappers release and re-acquire (a re-attached ped re-registers an evicted entry). | `tests/characters.js` crowd / LRU block (geometries plateau, refcount survives re-attach). |

## Integration fixes (failures in tests on the merged build caused by models / animation)

| Failure | Status | Cause and fix |
|---|---|---|
| `characters.js` rifle assert (gripY 2.75, leftToBarrel 1.411) | fixed | 06c re-parented Combat's held gun to the hand while Combat 0.3 places it on the root from `gunFrame`. 06c no longer re-parents: it IKs both hands to Combat's `debug.gunFrame` targets (grip, support / mag), with grip anchor nodes `handR` / `handL` under the `wristR` / `wristL` bones, a bladed stance and the support hand sliding along the handguard when the 1.2x guns put it out of reach. The test now checks the gun on the root, the grip height and both hands on the gun line. |
| `combat.js` "the aim pose raises the arm forward" (`armR.rotation.x` 1.24 < 1.3) | fixed | The pistol stance's elbow pole pointed down, so the upper arm hung low. Raised one-handers use an elbows-out pole now (pistol `armR.x` 1.32 un-pitched, passes in the test). |
| `vehicles.js` "the jet ski leans into the turn with the rider on it" | fixed | (Red on base too.) 06c replaced `syncMesh` without calling 06b's `_syncRider`; it now uses `GTP.Vehicles.riderPose(ped, alpha)` for moto, jet ski, cockpit seats and chute (hands on bars / stick, free-fall spread and open-canopy poses). |
| `vehicles.js` "the mesh is rebuilt with the paint, a spoiler and rims" | fixed | Records now set `rec.modsApplied = true` (05d builds rims, spoiler, tint and finish itself, so 06b stops layering a second set). The spoiler and rims are merged into the body / wheel geometry, so 05d adds empty `spoiler` / `rims` marker nodes on modded cars for code that looks them up by name. |

## Not in the models area (other tracks), with evidence

These were seen in the full suite (`tests/all.js`, log kept in the scratchpad) and checked against the base branch
`origin/game/grand-theft-pundit` @ 10ba585 in a separate worktree, without the round-1 models changes.

| Test | Failure | Evidence it is not models |
|---|---|---|
| actors | `crash damage: 0` | Same output on base (`impact 5.5`, `gap 15.8`, hits a wall 15 m before the building). Physics / world. |
| combat | `a scoped shot lands at 40 m` (`dmg 0`) | Same on base. Combat / aim. |
| events | `driving into the mod shop` fires twice (`spin_doctor_strip`, `spin_strip`) | Same on base: two mod-shop landmarks (world/content vs vehicles). |
| interiors | racks missing 12 weapon meshes | Same on base. Interiors / weapon assets. |
| vehicles | `a garage holds four: full,full,full,full` | `js/14_systems.js` gives `safe_dorm` `garage: 1`; 06b's `capacity()` returns that, the test expects 4. Systems vs vehicles data. Base stops earlier, at the jet ski rider (fixed here). |
| audio | `phoneRing` makes no voice | Audio. |
| bosses, campaign, feel, missions, newplayer | mission / marker / content counts | Missions / content; no mesh or animation in the asserts. |
| perf | `simulation keeps up (>600 steps/s)` | `game.advance` only steps the simulation (no `syncMesh`, no models code). Measured while other test processes were running; see models.md for the re-measure. |

Other hints in the QA files that mention meshes but belong to other owners: QA-A-ENT-10 (headlight gate in
`Vehicle.syncMesh` / `Render.syncVehicle`), QA-A-CAM-03 / QAC-17 (render interpolation), QA-A-TRF-07 (parked-car footprint
in 07_ai), QAC-39 (cutscene placard rebuild in 12_cutscenes; the 05d detach / attach wrappers keep the look refcount right
either way), QAC-07/08/09/32, stab-QA-D-08 (weapon, projectile, pickup and helicopter meshes in 05b / 10 / 07).
