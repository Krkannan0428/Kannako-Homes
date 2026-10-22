# Integration round 1: environment, world and AI (branch `v03r1/envworld`)

Files owned: `js/05_assets.js`, `js/10_render.js`, `js/10b_postfx.js`, `js/01_config.js`, `js/04_world.js`,
`js/20_content_world.js`, `js/07_ai.js` and the tests `render`, `perf`, `world`, `ai`, `events` and `tune`. The work
went into seven area branches (`envw/ai-police`, `envw2/ai-traffic`, `envw2/render-camera`, `envw2/render-look`,
`envw2/layout-assets`, `envw2/world-collision`). Each was merged into `v03r1/envworld`, together with
`origin/game/grand-theft-pundit` a94bf77. Test results and what is still open are in `final_envworld.md`.

Statuses: **fixed**, **already-fixed** (re-verified on the combined build), **not-reproducible**, **wontfix** (with the
reason), **cross-track** (the fix belongs in another session's file; the patch is below), **open** (not reached).

## QA bugs whose hint points at our files

### qa_r1_bugs.json
| id | status | what was done / found | guard |
|---|---|---|---|
| QA-STR-03 | already-fixed | All ten stunt jumps land. The drive test now stops the car before stepping out, because v0.3 bail damage used to kill the player before sj_10. | tests/world.js stunt drive |
| QA-STR-04 | cross-track | 07_ai's wrapper on `Strands.drivers.take` still routes lr_03 round the tower, and the racer reaches cp6 and cp7. The story track's `direct: segmentClear` alone is not enough: `drivers.tick` drives any leg under 60 m straight, and cp5→cp6 is 54 m. Patch C3. | tests/ai.js race |
| QA-STR-11 | already-fixed | HOA patrol traffic is tagged `hoapatrol`. The strand side (vest spawn) is 09_missions. | tests/ai.js |
| QA-STR-15 | already-fixed | AI parts: pod-livery taxis and the tier-4 copAccuracyDelta. | tests/ai.js |
| QA-C1-13 | already-fixed | weaponAmmo: rifle 90, launcher 3. | tests/render.js |
| CMB-04 | already-fixed | The muzzle light is resident from boot at intensity 0. | tests/render.js |
| CMB-07 | already-fixed | Aiming looks up to 67°. | tests/render.js |
| CMB-09 | already-fixed | The heli gunner fires five-round bursts at 4+ stars (45 shots, 10 hits in the test). | tests/ai.js |
| CMB-13 | already-fixed | Recoil drift at the top of the pitch range is 0°. | tests/render.js |

### qa_a.json
| id | status | what was done / found | guard |
|---|---|---|---|
| QA-A-GEO-01 | fixed | Coupon Code Circle is split at the Print Works lot (8..34 and 45..117). The building, the RNG stream and the landmark points are unchanged. | tests/world.js layout block |
| QA-A-GEO-02 | fixed | Departures Drive becomes a dead stub before the Lower Loop leg, and 6 bollards stand before every ramp's deck-end face. | tests/world.js |
| QA-A-GEO-03 | already-fixed | Dock boats are placed only on open water. | tests/world.js |
| QA-A-GEO-04 | already-fixed | The golf lanes are clear on seeds 7 and 11. | tests/world.js |
| QA-A-GEO-05 | fixed | `spawner.reset` drops parking and fleet bays whose van footprint holds a solid ground prop (`bayProp`). | tests/ai.js block 9 |
| QA-A-GEO-06 | fixed | The ferry pier tiles take the terminal lot's district. | tests/world.js |
| QA-A-DRV-03 | fixed | Walkway tiles beside water clamp movers inside the railing. Boats pass. | tests/world.js collision block |
| QA-A-DRV-04 | fixed | Containers collide as 2.4 x 6 m oriented boxes in the prop grid. | tests/world.js |
| QA-A-DRV-05 | fixed | Hedges collide as their full box. The three long hedges by the sj_05 ramp start 7 m from the wedge centre so the jump still lands, which leaves a 4 m open stretch at that end of the maze. | tests/world.js |
| QA-A-DRV-06 | cross-track | The hint is `09_missions.js stunts.update` (uncapped lift): story's file. | |
| QA-A-DRV-07 | fixed | The camera ray treats the deck slab as solid from below. | tests/render.js camera block |
| QA-A-DRV-08 | cross-track | Cars climbing a wedge's 1.3 m face: `06_entities.js Vehicle.update` ground snap (combat session). | |
| QA-A-TRF-01 | fixed | Give-up recycle out of view after 24 s, dead-end queue unwinding, the bus ped look-ahead past its nose, and a dead-end U-turn only behind the same queue. 4-minute soaks at 7 spots: 21-31 of 35-39 cars moving at 240 s. | tests/regress/qa_a_trf_01.js, tests/ai.js |
| QA-A-TRF-02 | fixed | A car swerves only round an inert car (no or dead driver, wreck, parked, roadblock) or after 12 s behind the player's car; it tries a same-direction lane first. | tests/ai.js block 9 |
| QA-A-TRF-03 | fixed | `planAhead` keeps a lane of the car's own direction. | tests/ai.js block 9 |
| QA-A-TRF-04 | fixed | A car goes straight into a stub only if it can stop and turn there; otherwise it turns at the box, and recovery backs up to a road point. | tests/ai.js block 9 |
| QA-A-TRF-07 | fixed | `bayFit`/`bayZ`/`fitType`: the body slides along the bay, or a shorter district type takes it. | tests/ai.js block 9 |
| QA-A-TRF-08 | fixed | The ground street no longer shares lanes with the Manifest Ramp; an AI car climbs onto the deck. | tests/world.js |
| QA-A-TRF-09 | fixed | Jet Street and Vetted Vista cover their whole junction boxes. | tests/world.js |
| QA-A-CAM-01 | fixed | The guard and pull-in cast from the head, not the aim focus 8 m ahead. | tests/render.js camera block |
| QA-A-CAM-02 | fixed | First person on foot and the scope use `C.CAMERA.nearFirst` 0.15. | tests/render.js |
| QA-A-CAM-03 | fixed | The camera blends with the frame alpha like the meshes; screen drift went from 9.6 px to 0.04 px. | tests/render.js |
| QA-A-CAM-04 | cross-track | The visible bike comes from `05d_models.js`, whose eye cap is H-0.12 = 0.98 m. Patch C9. | |
| QA-A-CAM-05 | fixed | The camera ray hits containers (boxes, stacked too) and big solid props (cylinders). | tests/render.js |
| QA-A-CAM-06 | fixed | A shortened vehicle boom swings up but never over a building: the bus covers 19% of the screen (was 59%). | tests/render.js |
| QA-A-CAM-07 | fixed | Every chunk inside the fog start is built in the same frame after a teleport (a one-frame hitch). | tests/render.js |
| QA-A-CAM-08 | fixed | Ped and car draw ranges follow the drawn fog (medium 204 / 225 m). | tests/render.js |
| QA-A-VIS-01 | fixed | Flat roof gravel is mapped in 2.5 m strips with u along x. | tests/render.js render-look block |
| QA-A-VIS-02 | fixed | The runway centre dashes are symmetric, with no seam. | screenshot |
| QA-A-VIS-03 | fixed | The dusk band is painted as an ellipse that fades inside the canvas. | tests/render.js |
| QA-A-VIS-04 | fixed | `_fitTrees`: a tree is moved to the kerb, else shrunk, else dropped. On seed 7: 215 moved, 42 shrunk, 27 dropped. No RNG. | tests/world.js |
| QA-A-VIS-05 | fixed | The far materials make up the sky ambient (factor 2.6, extrapolated; see final notes). | tests/render.js |
| QA-A-VIS-06 | fixed | 13 sign aspect buckets up to 16:1; the billboard canvas widens. | tests/render.js |
| QA-A-NGT-01 | fixed | The lamp arm and head point at the road; the head-to-glow gap is 0.04 m (was 2.85 m). | tests/render.js |
| QA-A-NGT-02..09 | fixed | Puddles all round the focus and inside their tile, the moon on the moonlight and moving, lamp lights fade, a constant light count when entering a car at night, no rain under the deck, stars to the zenith, lighter night puddles. | tests/render.js render-look block |
| QA-A-ENT-01, ENT-07, ENT-08 | not-reproducible | The visible cars come from `05d_models.js` (seats inside, bus glass inside, plates 6 mm proud). The buggy code is only the 05_assets fallback, which the nine classes never reach. | screenshots |
| QA-A-ENT-03 | fixed | A knocked-over lamp loses its glow sprite and pool. | tests/render.js |
| QA-A-ENT-05 | fixed | Explosion decals are soft, ragged round scorches; skids stay rectangles. | tests/render.js |
| QA-A-ENT-06 | cross-track | The hint is `11_ui.js drawBarks` (UI's file). | |

### qa_b.json
| id | status | what was done / found |
|---|---|---|
| QA-B-TXT-06 | cross-track | `GTP.AI.bustFine(level, money)` is the single source of truth and is what is charged ($500, $800 at 3+ stars, at most 15% of cash). The DEPLATFORMED card in `11_ui.js drawDeathCard` prints the config constant instead. Patch C7. |

### qa_c.json
| id | status | what was done / found |
|---|---|---|
| QAC-01 | already-fixed | `05d_models` shares ped geometry with reference counts and evicts idle entries beyond 48; the old 05_assets cache is never called. |
| QAC-02 | fixed | Heat throttle stamps reset at New Game and Load (`heatReady`, `resetHeatStamps`). Guard: tests/events.js section 6. |
| QAC-08 | fixed (render side) / cross-track | Projectile meshes share two cached sphere geometries. The hot-mic cap in `05b weaponMesh` still allocates per throw (patch C4). |
| QAC-10 | fixed | Chunks beyond draw distance + 140 m are unbuilt, two per frame; shared materials are kept. |
| QAC-17 | fixed | Same fix as QA-A-CAM-03. |
| QAC-20, QAC-21 | open | A* lateral ramp steps and props on paths were not reached. |
| QAC-22 | fixed | A same-seed `generate` resets fallen props. |
| QAC-23 | fixed | One resident heli SpotLight (`Render.lights.heli`), driven by intensity: no recompile at five stars (the first heli frame was 1243 ms, now about 45 ms). |
| QAC-24 | fixed | The sky repaints in 0.02 steps during transitions, and uploads only when the PMREM rebuilds. |
| QAC-26 | fixed | PostFX targets are clamped to the drawing buffer and the GL limits. |
| QAC-28 | fixed | The rig skips non-finite targets and never writes NaN. |
| QAC-32 | fixed | The heli geometry and materials are built once and shared. |
| QAC-33 | fixed | Low quality frees the normal and roughness maps (GPU textures 174 → 135). |
| QAC-35 | fixed | The cruiser quota counts only cruisers a live AI cop drives. |
| QAC-36 | fixed | The plaza marchers and precinct guards re-arm once their peds are gone. |
| QAC-37 | fixed | `heliT` resets at New Game and counts down with no stars. |
| QAC-39 | cross-track | The hint is `12_cutscenes.js` (story). |
| QAC-45 | fixed | The duplicate `h` key: billboards are 9 x 3.4 m. |
| QAC-46 | fixed | No per-step objects in aheadCaps, carStep, copCarTick, copCarStep or planAhead. |
| QAC-49 | fixed | No per-frame garbage in the rig or the light pool. |
| QAC-50 | fixed | A WebGL context restore rebuilds the env map, the sky texture and the post targets. |
| QAC-53 | wontfix | `C.MAX_STEPS` 5 is the guard against a spiral of death. Raising it adds simulation work on exactly the machines that are already under 12 fps. If wanted, the loop in `30_game.js` (story) could carry the excess time instead of dropping it. |
| QAC-55 | cross-track | The hint is `11_ui.js` (UI). |
| QAC-56 | fixed | A capsule at a prop's exact centre is pushed along a hashed direction and gets a normal. |
| QAC-57 | fixed | NaN y is read as 0, and a NaN x/z moves to the map centre with one console warning. |

### qa_d.json
| id | status | what was done / found |
|---|---|---|
| stab-QA-D-01 | already-fixed | Same as QAC-01. |
| stab-QA-D-03 | fixed | At 0 stars, police cars nobody drives turn their siren and lights off. |
| stab-QA-D-04 | fixed | Same fix as QAC-23. |
| stab-QA-D-08 | fixed | Same fix as QAC-08 (render side). |
| stab-QA-D-09 | fixed | The rotor keeps sounding while the heli flies off and fades over the last 3 s. |

### From the coordinator and the integration runs
| id | status | what was done / found |
|---|---|---|
| COORD-DOF | fixed | The circle of confusion has a crisp ±12% band, an aperture of 0.6 scaled for far focus, a capped foreground and a 6-texel gather. DoF runs only in cutscenes; the "street" smear was the mission-intro cutscenes. Before/after: `final_envworld_dof_marker.jpg`. |
| COORD-MARKER | fixed | The column is ≤ 0.8 m, a lighter tint with normal blending and a crisp ring, and it fades within 3.5-11 m of the camera, so standing in it or aiming beside it tints nothing (blue share 0.95 → 0.14). It also covers the story beacon. |
| ENV-RAIN | fixed | Rain puddles covered half the flat ground in a speckle (threshold near the noise median). They now cover the top ~15% of the field on a 15 m scale; the SSR pass reads the same field. |
| INT-MODSHOP | fixed | After vehicles 89fe24d, 06b's bay stands down for world doors. The 07_ai door marker is the one drive-in again, so tests/events.js and tests/vehicles.js open the shop once. |
| INT-TRF02 | test | The systems track parks its Hot Take Brigade truck in the northbound lane at ~(234, 206), and the red-light test's queued car rightly steered round it. The test clears it. Note C10 for systems. |
| INT-SJ10 | test | v0.3 bail damage (stepping out of a moving car) killed the player over nine jumps; the drive test stops the car and starts each jump at full health. |

## Wrappers folded
- `GTP.Assets.prop` (20_content_world): the six prop builders (helipad, teebox, barberpole, mannequin, pontoon,
  tirestack) now live in 05_assets, and the wrapper is removed. The screenshots are identical.
- `World.heightAt / solidAt / resolveCapsule / raycastBuildings / tileAt / districtAt` (13_interiors): World answers the
  far interior region itself behind one `x < -3000` compare and calls `World.setInteriorHooks({roomAt, height, solid,
  resolve, ray, tile, district})`. Until 13_interiors registers its hooks (patch C1), `generate` adopts its installed
  wrappers as far-region-only handlers, so the city queries carry no wrapper. Parity: 60,000 city samples and
  6,000 room samples, 0 differences.
- `Render.syncVehicle` skip for 06b's custom meshes and `Render.weather.frame` indoor rain/puddle hide (13_interiors):
  both are native now, and behave the same with the old wrappers still installed (removal patches C2, C5).
- `GTP.AI.wanted.crime / addHeat` boss-fight rule (08b_bosses): native in `wanted.addHeat` through
  `GTP.Bosses.fighting()` or the Bosses list (removal patch C6).
- 07_ai's own v0.2 cowering `syncMesh` wrapper is installed only when `GTP.Anim` is missing.
- Not folded (they depend on the other file's private state): 13's `updateEnvironment` (indoor light), 06b's
  `buildEntityMesh` and `rig.update` flight camera, 05d's `attach` / `detach`. Also 07_ai's own wrapper on
  `Strands.drivers.take` (patch C3 folds it into 09_missions).

## Cross-track requests (file, function, why, patch)

**C1. `js/13_interiors.js` wrapWorld** (perf; the six World wrappers). Register hooks instead of wrapping; every behaviour is kept:
```diff
   var wrapped = { world: false, combat: false, update: false, env: false };
+  function roomDistrict(room, x, z) {
+    var Wd = W(), lm = S.current && S.current.landmark, ds = (Wd && Wd.districts) || [];
+    for (var i = 0; lm && i < ds.length; i++) if (ds[i] && (ds[i].id === lm.district || ds[i] === lm.district)) return ds[i];
+    if (!S.fakeDistrict) S.fakeDistrict = Object.assign({}, ds[0] || {}, { id: 'interior', name: 'Indoors' });
+    return S.fakeDistrict;
+  }
+  var HOOKS = { roomAt: roomAt, height: function () { return 0; }, solid: roomSolid, resolve: roomResolve, ray: roomRay,
+    tile: function () { var Wd = W(); return Wd && Wd.T ? Wd.T.PLAZA : 8; }, district: roomDistrict };
   function wrapWorld() {
     var Wd = W(); if (!Wd || wrapped.world || !Wd.heightAt) return;
     wrapped.world = true;
+    if (Wd.setInteriorHooks) {
+      Wd.setInteriorHooks(HOOKS);
+      Wd.heightAt._interiors = Wd.solidAt._interiors = Wd.resolveCapsule._interiors = true;
+      return;
+    }
+    // an older World without the hooks: keep the wrappers below (districtAt can call roomDistrict(rm, x, z))
```

**C2. `js/13_interiors.js` wrapRender**: delete the `if (Wx && Wx.frame) { var oF = Wx.frame; Wx.frame = ...; }` block,
because `Render.weather.frame` hides rain and puddles while `GTP.Interiors.active`. Keep the `updateEnvironment` wrap.

**C3. `js/09_missions.js` races.begin** (QA-STR-04): replace the racer's `drivers.take(rv, 'route', {... route: route,
onCheckpoint: function (ci) {...}})` with
```js
var onCp = function (ci) { /* same body */ };
var rr = GTP.AI && GTP.AI.routeVias ? GTP.AI.routeVias(route, true, onCp) : {};
rc.c = drivers.take(rv, 'route', { role: 'civ', speedMul: SK.raceSpeed, route: rr.route || route, loop: true, track: false, onCheckpoint: rr.onCheckpoint || onCp });
```
then 07_ai's `hookStrands` can go. A route that is already split gains nothing, so the two never double up.
Also `addBeacon`: `new T.CylinderGeometry(0.16, 0.42, h, 10, 1, true)`, colour `0x9cc4ff`, opacity 0.18. Render already
fades the beacon near the camera; this narrows and lightens it.

**C4. `js/08_combat.js` (perf) and `js/05b_assets_weapons.js`:**
- `fillPose`: about 105 ms per 1800 headless steps, every ped every step. Fill it every second step for non-player peds far from the camera.
- `ensureHeld`: about 43 ms. Early out when `e._heldFor === e.weapon`.
- `Combat.update`: 89 → 177 ms since v0.2. Throttle `holsterIds` to 10 Hz.
- `weaponMesh('hotmic')`: cache the cap geometry and material (`userData.shared`).

**C5. `js/06b_vehicles_air_sea.js`:**
- hookRender: delete the `R.syncVehicle` wrapper and the inert `R.rebuildEntityMesh` fallback.
- flightCam guard (~line 1693): cast through `Render.rig._cast(fx0, fy0, fz0, dirx, diry, dirz, len + pad)` when it exists, so the heli, plane and boat cameras also stop at containers, big props and the deck slab.
- Perf: the `VP.update` router (~107 ms per 1800 steps) should be installed only on moto, heli, plane, boat and chute entities.
- Perf: the `E.add` mesh builds (~115 ms inside sim steps) should be deferred to the first render.
- Optional: `modshopTick` lacks the doors' "only the armory during a mission" rule.

**C6. `js/08b_bosses.js`**: export `fighting: function () { return fighting(); }` on `GTP.Bosses` and delete
`installCrime` (07_ai's `wanted.addHeat` applies the rule).

**C7. `js/11_ui.js` drawDeathCard** (QA-B-TXT-06):
`var pl = player(), fine = busted && GTP.AI && GTP.AI.bustFine ? GTP.AI.bustFine(d.level, pl ? pl.money : null) : C.ECONOMY.bustedFine;`

**C8. `js/06c_animation.js` animate**: pose `ped.cowering` (07_ai sets it while a gun is aimed at a civilian). Just
before `syncHeld(...)`:
```js
st.cowerW = U.damp(st.cowerW || 0, p.cowering && alive && !armed ? 1 : 0, 9, dt);
var cwr = st.cowerW;
if (cwr > 0.01) {
  mixRot(B.armL, 0.45, 0, -2.45, cwr); mixRot(B.armR, 0.45, 0, 2.45, cwr);
  mixRot(B.lowerArmL, 0.75, 0, 0, cwr); mixRot(B.lowerArmR, 0.75, 0, 0, cwr);
  B.legL.rotation.x += 0.45 * cwr; B.legR.rotation.x += 0.35 * cwr; B.lowerLegL.rotation.x -= 0.75 * cwr; B.lowerLegR.rotation.x -= 0.6 * cwr;
  B.hips.position.y -= 0.12 * cwr; B.torso.rotation.x += 0.14 * cwr; B.neck.rotation.x += 0.3 * cwr;
}
```

**C9. `js/05d_models.js` vehicleGeometry eyeY** (QA-A-CAM-04):
`eyeY = info.seats ? (cls === 'bike' ? info.seats[0].y + 0.72 : Math.min(H - 0.12, info.seats[0].y + 0.72)) : H * 0.82;`

**C10. `js/14_systems.js`:**
- ensureJobCars `roadSpot(d.vehicle.parkedAt)`: it parks the job truck in a travel lane (the Hot Take Brigade truck at ~(234, 206) blocks the northbound lane, and traffic has to swerve round it). Pick a PARKING tile, or a kerb lane with `World._noPark` respected.
- `Ms.update` (~53 ms per 1800 steps): run at 10 Hz.

**C11. `ARCHITECTURE.md`** (integration): document the AI police state (`police.heliT, bustLevel, reset()`), the resident
heli searchlight, the per-session heat stamps, the boss-fight heat rule, the zero-star stand-down,
`World.setInteriorHooks`, `Render.markerFade`, `Render.lights.heli` and `C.CAMERA.nearFirst` / `QUALITY.pedFog` and
`vehicleFog`.
