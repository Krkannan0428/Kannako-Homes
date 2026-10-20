# v0.3 world track: notes

Branch `v03/world`. Files owned: `js/04_world.js`, `js/20_content_world.js`, `js/07_ai.js`; tests `tests/world.js`,
`tests/ai.js`, `tests/events.js`.

```
cd grand-theft-pundit
NODE_PATH=/opt/node-tools/node_modules node tests/world.js    # ~25 s, 12 screenshots tests/out/world_*.png
NODE_PATH=/opt/node-tools/node_modules node tests/ai.js       # ~45 s
NODE_PATH=/opt/node-tools/node_modules node tests/events.js   # ~15 s, tests/out/events_flash_mob.png
```

## What I built

### New places (04_world `_adoptPlaces`, data in 20_content_world `places`)

The ten v0.3 places do not carve new lots out of the map. After the filler blocks are packed, each place **claims the
unclaimed filler building nearest its `near` tile in its district** that has a kerb (a sidewalk tile next to a road) on
one of its faces, and becomes a landmark (`World.landmark(id)`, `building.landmark = id`) with its door on that face.
No RNG draws are made, so the v0.2 city (tiles, buildings, props, filler seeds) is unchanged and every place exists on
any seed (tested on 7 and 11). A tree, lamp, bin or hydrant within 7.5 m of the new shop front is removed so the sign
reads.

| id | kind | district | door marker |
|---|---|---|---|
| `spin_doctor_strip`, `spin_doctor_port` | `modshop` (Spin Doctor Customs) | strip, port | drive-in |
| `lanyard_downtown`, `lanyard_uptown` | `clothing` (Lanyard & Co.) | downtown, uptown | foot |
| `clip_joint` | `barber` (The Clip Joint) | campus | foot |
| `safe_brownstone`, `safe_marina_loft`, `safe_suburb`, `safe_penthouse` | `safehouse` | uptown, marina, suburbs, downtown (the tallest tower near (73,65), 90 m) | foot + garage (drive) |
| `hangar_two` | `hangar2` ("Hangar 2 of 1", 10 m tall) | airport | none (the apron is across the road) |

`safe_dorm` (the podcast van) stays v0.2's save point. `GTP.Content.world.safehouses` lists all five ids.
Props per kind: neon facade sign, roll-up door and tyre stacks (mod shop), awning and mannequins (clothing), awning and a
barber pole (barber), a facade sign (safehouse). The meshes for the new prop kinds (`helipad`, `teebox`, `barberpole`,
`mannequin`, `pontoon`, `tirestack`) are built in 20_content_world through a **wrapper on `GTP.Assets.prop`**
(environment track's file): it serves only those six kinds and only when 05_assets has not cached its own builder.

### World data the other tracks consume

- `World.doors`: `[{id, landmark, kind, x, y, z, yaw, r, mode:'foot'|'drive', interior, store, property, label, color}]`;
  `yaw` faces out of the building toward the street (the way a player faces stepping out of the interior).
  Kinds: `armory` (the three Both Sides Arms), `modshop`, `clothing`, `barber`, `safehouse`, `garage` (`<id>:garage`).
  Every door stands on a kerb tile next to a road the campus quad's road graph reaches (tests/world.js).
- `World.helipads`: `[{id, name, x, y, z, tx, tz}]`, five ground-level pads (`heli_airport`, `heli_tower` (on the
  waterfront promenade east of Goldplate Tower), `heli_hospital`, `heli_port`, `heli_uptown`), each the clear 3 x 3 tile
  patch of plaza / parking / lawn nearest its tile with no building in the tile ring round it and no billboard, crane,
  canopy, mast or pillar within 7.5 m (rotor room); small props cleared, no parking bays, a `helipad` prop drawn.
- `World.aircraft`: `[{id, type:'plane'|'jet', x, y, z, yaw, landmark:'hangar_two'}]` on the apron north of the runway
  strip, facing east, 9 m clear.
- `World.boatSlips`: `[{id, landmark, x, y, z, yaw}]`, 9 slips (Velvetine Listening Pier 3, the Afterparty, the fish
  shack, the ferry 2, Manifest Quay 2) on open water (3 x 3 water tiles), 4 m clear of moored boats, the yacht and the
  ship; yaw points out to sea; a `pontoon` prop beside each.
- `World.vehicleSpots(type)` -> `[{id, x, y, z, yaw}]` for `'heli'` (pads), `'plane'` / `'jet'` (apron), `'boat'` /
  `'speedboat'` / `'jetski'` (slips). For the vehicles track's spawns.
- `World.golf = {landmark:'goldplate_links', holes:[{n, par, tee:{x,y,z}, pin:{x,y,z}, length}]}`, nine holes (par from
  `GTP.Content.parity.golf` when it lists `holes[i].par` or `[i].par`, else 3/4). Landmark points `tee1..tee9`,
  `pin1..pin9` on `World.landmark('goldplate_links').points`. Tee boxes and gold pin flags are props (pins non-solid);
  the five old decorative flags are gone. For the systems track's golf.
- `World.route(ax, az, bx, bz, {fromY, toY, maxExpansions}) -> [{x, z}]`: the GPS line. Car A* (roads, ramps, the
  Loop; parking / plaza / sidewalk at a cost), ends snapped to the nearest road when off-network, starts exactly at a
  and ends exactly at b, corners only; a straight `[a, b]` when no route exists. Cached per tile pair (12 entries).
  `World.routeLength(pts)`. ~5 ms for a cross-city route.
- `World.segmentClear(ax, az, bx, bz, y)`: no building / ramp wedge / void / water on the straight segment.
- `World.stuntCorridors`: `[{id, x0, z0, x1, z1, w, y}]`, the cleared stunt lines.
- `World._noPark` (Uint8Array per tile): pads, apron, links, stunt lines; the spawner never parks there.

### AI (07_ai)

- **Door markers** (`GTP.AI.doors`): a ring of light (`GTP.Render.markerMesh` / `addMarker`) at every door within 120 m.
  A foot door fires when the player walks in on foot; a drive door when the player drives in (driver, < 7 m/s). It fires
  once, then waits until the player has stepped 1.5 m out of it (and after leaving an interior the door they come out at
  is latched; a garage that shares its kerb tile with the front door also latches the front door). While a mission, a
  race or an on-foot strand runs, or a vehicle strand (cab shift, HOA patrol) while the player sits in its vehicle
  ("Finish what you started first."), or while wanted ("Lose the heat first."), only the armory door opens (m01c walks
  the player into the armory as an objective).
  - shops and owned safehouses: `GTP.Interiors.enter(door.interior, {store, landmark, kind, door:{x,y,z,yaw}, property,
    branch})` where `door.yaw` faces the street and `door.interior` is `'armory' | 'clothing' | 'barber' | 'safehouse'` and `store` / `landmark` /
    `branch` name the branch (`both_sides_strip`, `lanyard_uptown`, `safe_penthouse`, ...).
  - without `GTP.Interiors.enter`: clothing emits `clothing:open {store, landmark}`, barber `barber:open`.
  - a safehouse or garage whose `GTP.Systems.owns(id)` (or `Systems.properties.owns/owned(id)`) is `false` emits
    `property:open {id, landmark}`; unknown ownership (no Systems API) lets the player in.
  - mod shop: brakes the car, emits `modshop:open {vehicle, shop, landmark}` (shop = `spin_strip` / `spin_port`).
  - garage: emits `garage:enter {id, vehicle, landmark}`; when `GTP.Vehicles.store` exists the player steps out and
    `GTP.Vehicles.store(propertyId, vehicle)` is called (a `{ok:false, reason}` result is toasted).
  - always emits `door:enter {door, landmark, kind, vehicle}` first.
  - `AI.doors.list()`, `AI.doors.markers()`, `AI.doors.last()`, `AI.doors.release()`.
- **Street events** (`GTP.AI.events`): eight events, one at a time, 35-75 m from the player, every 70-130 s (the first
  after 40-70 s, drawn from a hash, not the city's RNG stream) while no mission or strand runs, no star is lit, the
  player is outside and no cutscene plays. Data: `GTP.Content.world.streetEvents`
  (`{id, name, blurb, reward, heat?, lines[]}`); **`GTP.Content.parity.events` wins field by field** for any id it
  lists (array of `{id, ...}` or an object keyed by id). Events:
  `ev_rival_table` (out-debate a rival pundit: stand at the table 4 s), `ev_tote_snatch` (knock the running snatcher
  down), `ev_getaway` (two cruisers chase a getaway sedan; stop it), `ev_fender_bender` (mediate: stand between the
  arguing drivers 3 s), `ev_influencer` (walk into the shot 2 s), `ev_flash_mob` (watch the chanting mob), `ev_hitchhiker`
  (stop by the stranded commentator, they get in, drive them to a landmark 250-650 m away; sends `gps:set {x, z, label,
  kind:'event'}` and `gps:clear {kind:'event'}`), `ev_donor_van` (stop the armoured donor van: cash pickups spill and
  2 stars). Emits `event:start {id, name, blurb, x, z}` and `event:end {id, ok, reward, reason}`; pays the reward (the
  van pays in pickups). Event people are persistent while it runs; afterwards they go back to the city (or are removed
  off camera). A running event's clock stops in cutscenes and any non-playing state, and it ends (`reason:'story'`) when a
  mission or strand starts. API: `AI.events.list()`, `def(id)`, `start(id)` (forced, ignores eligibility), `stop(ok, reason)`,
  `current()`, `eligible()` (null or why not), `markers()`, `setNext(seconds)`.
- **Motorcycles in traffic**: `'moto'` is in every district's traffic table except capitol, suburbs, hills and airport.
  `AI.spawner.vehicleType('moto')` rides a `'bike'` until the vehicles track registers `C.VEHICLES.moto`; then motos
  spawn with their own cruise speed (`K.cruiseMoto`).
- **Cowering** (shots fired near a cowering civilian break it into a run): a civilian (any non-cop ped on the AI's brain) within 28 m in the line of a gun the player aims (aim
  held, a weapon that is not melee) stops, faces the player and cowers (`ped.cowering = true`, `ai.mode = 'cower'`,
  emits `ped:cower {ped}`, a "Don't shoot!" bark); 1.4 s after the aim leaves them they run. `AI.isAimedAt(ped)`.
  For v0.2's figures a wrapper on `GTP.Ped.prototype.syncMesh` (from 07_ai at load; 06c loads before 07) raises the
  hands and drops the head; it stands aside as soon as `GTP.Anim` exists, and the animation track should pose
  `ped.cowering` itself (a hands-up crouch). Screenshot: tests/out/events_cower.png.
- **Flanking**: `GTP.AI.coverAlert(x, z)` (also on the event `cover:enter` with `{x, z}` or the player's position while
  wanted; `cover:exit` ends it). The nearest chasing cop pins the player; the others alternate left and right to a point
  ~70 degrees round the cover, 8-13 m out, on walkable ground with a clear line to the player, and shoot from there.
  Reassigned every 2.5 s while the player stays within 4 m of the cover. Emits `ai:flank {x, z, n}`. `AI.cover` is the
  state.
- **Interiors pause the city**: while `GTP.Interiors.active` the spawner, police response, bust checks, street events and
  door triggers stop, and the door markers hide.
- **Police helicopter gunner** (CMB-09): at 4+ stars a heli that sees the player fires five-round bursts within 60 m
  (9 damage, x1.5 on a car; worse against a moving target), tracers and ground puffs on misses; emits
  `heli:fire {heli, hit}`.
- **Map blips**: `GTP.AI.blips()` -> `[{id, kind:'place'|'event', icon, x, z, title, color}]` (non-armory doors and the
  running event). Not merged into `Missions.allMarkers` because `tests/strands.js` counts that list exactly; the UI
  track should append `AI.blips()` in its `allMarkers()`.

## QA bugs fixed (docs/v03/qa_r1_bugs.json)

- **QA-STR-03** (stunt jumps): every stunt line is cleared of trees, lamps, benches and other furniture within 3 m from
  40 m before the wedge to 14 m past the landing, and no parking bay sits on it; a wedge's base is now the run-up surface
  under its back edge (sj_10's kerb wedge); sj_06 moved onto the southbound lanes between the gantry legs; sj_08's
  cutout jet collides only up to 1 m (a car in the air clears it); sj_10 moved to Vetted Vista's westbound lane with a
  60 m road run-up over the junction into Old Money Common, and the bandstand moved north out of its line; sj_03
  minAir 1.6 -> 1.0, sj_05 1.2 -> 0.9. The designed obstacles (the maze hedges, the yard container, the cutout jet) carry
  `jumpOver: <ramp id>`. sj_01 runs between the Quad's folding-table columns (it hit the middle table and came up
  short). tests/world.js asserts the lines are clear and **drives all ten jumps** (a sports car 40 m back at full throttle,
  held on the line until it launches; the deck jump from the deck's edge): all ten land `ok` with 1.03-1.15 s of air.
- **QA-STR-04** (lr_03 racers into the tower): `GTP.Strands.drivers.take` is **wrapped from 07_ai** (installed on the
  first `AI.update`, flag `take._worldRoute`): a `'route'` leg whose straight segment hits a building gets the car A*
  corners as pass-through points (`via: true`); the wrapped `onCheckpoint` only reports real checkpoints, by their own
  index; a loop's closing leg's corners go at the end of the list. `AI.routeVias(route, loop, onCp)` is the helper.
  tests/ai.js drives a racer cp5 -> cp6 -> cp7 round the tower.
- **QA-STR-11** (HOA SUV tag): suburb HOA patrol traffic is tagged `'hoapatrol'` (and carries `vehicle.hoaPatrol = true`),
  so `liveTagged('hoa')` finds only the strand's parked SUV. Note for the story track: `S.hoa_patrol.canStart` and the
  `h_patrol` hint (12_cutscenes) check `tag === 'hoa'`, so hijacking an ambient patrol SUV no longer starts the strand;
  that matches the bug's hint (the strand SUV gets its own tag) but test `v.hoaPatrol` if the hijack start is wanted. (The strand side of that bug, spawning the vest when `hoa_vest` is set, is the story track's.)
- **QA-STR-15** (my parts): taxis spawn (driven and parked) with wrap `'pod'` once `flags.cab_livery` is set; cops (and
  the heli gunner) miss on purpose by the subscriber tiers' `copAccuracyDelta` (tier 4: 15%), read from
  `GTP.Content.expansion.subscriberTiers` and `Missions.subscribers().tier`. (rampage_king, memo_vest and the gold tables
  are Combat / Missions / Render.)
- **CMB-09** (police heli never shoots): the gunner above.
- Found and fixed while testing: two moored boats of the Listening Pier sat in the Sponsor Span's lanes (a solid 1.8 m
  circle on the bridge deck since the bridge was added); boats are only placed on open water now (the colour is still
  drawn so the RNG stream is unchanged). tests/world.js asserts nothing solid stands in a bridge lane.

## Wrappers on other modules

- `GTP.Assets.prop` (05_assets, environment): serves the six new prop kinds, from 20_content_world at load time.
- `GTP.Strands.drivers.take` (09_missions, story): the race route fix, from 07_ai on the first AI update.
- `GTP.Ped.prototype.syncMesh` (06_entities / 06c): the cowering pose, from 07_ai at load; inert once `GTP.Anim` exists.

## Interfaces consumed (feature-detected)

`GTP.Interiors.active`, `GTP.Interiors.enter(id, opts)`; `GTP.Systems.owns(id)` (or `Systems.properties.owns/owned`);
`GTP.Vehicles.store(propertyId, vehicle)`; `C.VEHICLES.moto`; `GTP.Content.parity.events`, `GTP.Content.parity.golf`;
`GTP.Render.markerMesh/addMarker/removeMarker`; `player.aiming`, `player.aimYaw`, `player.pose.aim/aimYaw`;
events `cover:enter`, `cover:exit`, `interior:exit`.

## Decisions

- Places adopt existing buildings instead of new lots: zero disturbance to the v0.2 city, and they exist on every seed.
- The plane and jet wait on the runway's north apron across Final Boarding Boulevard from the new "Hangar 2 of 1"; the
  original hangar's south apron is sj_08's landing.
- `heli_tower` is at ground level on the waterfront promenade east of Goldplate Tower (the tower's own lot has no
  12 m clear patch, and the nearest plaza is Impression Alley between its billboard pairs).
- The golf course keeps its sign and bunkers; nine short holes (27-73 m) zigzag the links on both sides of Clubhouse
  Drive. The ball physics, scoring and wind are the systems track's.
- World landmark count is now 60 (34 + 16 + 10); tests/world.js asserts it.

## Known issues

- Until the vehicles track lands `C.VEHICLES.moto`, motorcycles in traffic are the scooter (`bike`).
- The race fix is a wrapper; integration may want to fold the via logic into `09_missions` `races.begin`.
- Street events and door markers have no minimap icons until the UI appends `AI.blips()`.
- Flankers that are assigned the same side can pick nearby points (they spread as they walk).
- Test files of other tracks that depend on the exact ambient traffic: with this branch, `tests/strands.js` "the flagged
  car drives off (> 8 m in 4 s)" picks a different traffic car (a stopped sedan that spends the 4 s turning round, 5.7 m)
  because the traffic tables now include motorcycles; it passes on the base commit. `tests/campaign.js` passes (it failed
  once mid-development when cowering civilians froze in the line of fire; gunfire now breaks a cower).
- The traffic test in tests/ai.js (>= 80% of a 20-car sample advance 30 m in 10 s) is sensitive to the ambient RNG
  stream; the street-event timer avoids drawing from it.
