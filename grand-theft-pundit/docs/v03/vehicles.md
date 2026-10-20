# v0.3 vehicles track: notes for integration

Branch `v03/vehicles`, from `game/grand-theft-pundit` at `ea6a035`. Files owned and changed:
`js/06b_vehicles_air_sea.js` (new, about 1,500 lines), `js/03_audio.js`, `tests/vehicles.js` (new),
`tests/audio.js` (extended), this file. No other file was edited.

## What was built

| Type | Family | Name (in-game) | Feel |
|---|---|---|---|
| `moto` | `moto` | Hot Take 600 | the car model (bicycle steering, grip, collisions) plus a lean from the lateral acceleration (up to 0.78 rad), a Shift wheelie (pitch up to ~0.65 rad, steering cut while up, the wheelie clock and a toast after 1.5 s), the rider thrown off on a wall / car hit over 10 m/s or a pedestrian over 17 m/s |
| `heli` | `heli` | Spin Cycle | rotor spin-up 2.4 s when someone is aboard (down in 6 s when empty), collective sets a climb rate the rotor chases (hands off = hover), cyclic tips the nose / rolls (forward up to ~44 m/s), Q / E yaw plus a bank-coordinated turn, downwash puffs, landing rules (too fast, too steep or too tilted = crash), rotor strike on any building = crash, water = sinks |
| `plane` | `plane` | Op-Ed (prop) | throttle level (Shift / Ctrl, RT / LT), on the ground W rolls (the throttle comes up), S brakes (unless the throttle is up past 0.6 near rotate speed: then S rotates), nosewheel steering, rotate at 24 m/s, pitch / roll rates with authority by airspeed, auto roll-level, coordinated turns (yaw rate from bank), drag and gravity on the climb, stall below 19 m/s (nose drops, sink, a stall horn), landing rules (sink rate > 7 m/s, bank > 0.42, nose down, burning = crash; a ditching sinks), wingtip collision points |
| `jet` | `plane` | Long Read | the same model: thrust 16, top ~118 m/s, rotate at 42 m/s, gear retracts above 22 m (a hydraulic sfx), afterburner cone above 55% throttle |
| `speedboat` | `boat` | Hot Water | buoyancy at `WATER_Y` with a bob, planing (bow up through the hump, a little lift), a sliding hull (low lateral grip, Space loosens it), rudder authority from the flow, a wake of foam puffs and spray, shores are walls (sand lets her beach), stepping off on water means swimming |
| `jetski` | `boat` | Splash Damage | lighter, quicker, leans into turns, the rider drawn on the seat |
| `parachute` | `chute` | Golden Parachute | spawned under the player when they bail (F / Enter / pad Y) from an aircraft 30 m or more above the surface: freefall (W dives, A / D turn, terminal ~52 m/s), Space or E opens it (deploy 0.8 s), W / S trade descent for glide, A / D turn, landing: soft when open, a hard knockdown when it never opened, water = swimming. F under the open canopy cuts away |

Every vehicle (the nine car classes too) has `vehicle.hud()`.

Exits: leaving an aircraft in the air never teleports the ped to the ground; they keep the aircraft's height and
velocity and fall (a drop over 7 m hurts on landing; only these tracked falls, the city's own hops are unchanged).
An empty aircraft keeps flying the way it was left (a heli's rotor spins down and it falls; a plane glides on) and
crashes or sinks.

Map edge: aircraft get 260 m of open sea past the map. Past 140 m a growing yaw nudge turns them back (with a toast),
at 260 m a wall. World collision is skipped outside the map (`resolveCapsule` would treat the map edge as a wall).
Boats stop 8 m inside the map.

The fleet (parked vehicles; GTP.rng is untouched: a private `GTP.makeRng(0x7EB1C)` stream):
- the plane and the jet on the west end of Runway 10/10, facing east (take off down the runway);
- a helicopter on every landmark whose id / kind / name matches `helipad` or that has a point named `helipad*`
  (the world track's helipads); until those exist, one on the airport apron by the tower and one on Perpetual Assembly Plaza;
- a speedboat on every landmark matching `slip|boatyard|boat_dock` or with a point named `slip*` / `boat*` (`*ski*` = jet ski);
  plus fallbacks by Velvetine Pier (speedboat), the Fish Shack (jet ski), the Ferry pier (speedboat) and Manifest Quay (jet ski);
- motorcycles by Detail & Evidence and the Monday Memo Print Works. Nothing parks within 170 m of the player's
  spawn: a vehicle created on the first step changes the boot's traffic for every other system and test (the
  actors crash test and the perf draw-call counts are identical to the base build).
Each slot respawns 60 s after its vehicle is taken (30 s after it is wrecked). The first pass fills every slot within
170 m; later passes spawn only 60..170 m from the player (no pop-in in view). Paused while `GTP.Interiors.active`.
`GTP.Vehicles.fleet.enabled = false` (then `fleet.refresh()`) turns it off; tests that need an empty street can use it.

## Controls (keyboard / gamepad)

| Vehicle | Keyboard | Gamepad |
|---|---|---|
| heli | W / S cyclic pitch, A / D cyclic roll, Q / E yaw, Shift collective up, Ctrl down | left stick cyclic, RT / LT collective, LB / RB yaw |
| plane / jet | W / S pitch (W = nose down), A / D roll (nosewheel on the ground), Q / E rudder, Shift / Ctrl throttle; on the ground W also opens the throttle and S brakes | left stick pitch / roll, RT / LT throttle, LB / RB rudder |
| boats | the car controls (W / S, A / D, Space slide, H horn) | the car map |
| moto | the car controls, Shift = wheelie | the car map, right stick pulled down = wheelie |
| parachute | Space or E opens, W / S dive / flare, A / D turn, F cuts away | A opens, left stick |
| all | F / Enter exit (bail above 30 m) , N radio, V camera mode | Y exit |

The keys that 0.2 does not bind (Q / E as yaw, Ctrl as down) are read from a raw `keydown` listener in 06b.
**Consumed input action names** (used when `02_input.js` defines them, so the UI track can rebind): `collectiveUp`,
`throttleUp`, `ascend`; `collectiveDown`, `throttleDown`, `descend`; `yawLeft`, `rudderLeft`; `yawRight`,
`rudderRight`; `parachute`, `deploy`; `wheelie`, `leanBack`. Recommended: `yawLeft yawRight throttleUp throttleDown wheelie`.
`GTP.Vehicles.controls.invertPitch` (saved) flips W / S for aircraft. `GTP.Vehicles.virt[code]` and
`GTP.Vehicles.virtAxes = {pitch, roll, yaw, collective, throttle, steer, ...}` are the test / touch overrides.

Cameras: aircraft, boats and the parachute get their own chase camera (`Render.rig.update` wrapper): further back
(heli 13 m, plane 15, jet 19, speedboat 10, jet ski 7, parachute 12), it follows the heading and the climb, rolls a
little with a plane's bank, the fov widens with speed; `first` mode is a cockpit eye point. Mouse / right-stick look
works as on foot. The moto keeps the car camera.

## Interfaces exposed

```js
GTP.C.VEHICLES.{moto, heli, plane, jet, speedboat, jetski, parachute}   // registered at load; `family` + flight / boat keys
GTP.Assets.vehicleMeshes[type](vehicle) -> THREE.Group                  // for the environment track's buildEntityMesh
GTP.Vehicle.prototype.hud() -> { family: 'car'|'moto'|'heli'|'plane'|'boat'|'chute', type, name,
  speed (m/s), kmh, mph, alt (m above the surface or roof below), altSea, vs (m/s), pitch, roll (rad),
  heading (deg, 0 = north, clockwise), throttle (0..1), gear (car / moto: 1..6 | 'R' | 'N'; plane: 'down' | 'up';
  heli: 'skids'; boat: 'F' | 'N' | 'R'; chute: 'free' | 'open' | 'landed'), rotor (0..1), stall, hp (0..1),
  onGround, chute, wheelie (rad), lean (rad), beached, prompt ('Open the parachute' | 'Bail out' | null) }
GTP.Vehicles = {
  specs, types, family(v), isAir(v), isSea(v), surfaceAt(x, z, y), findClear(x, z, 'land'|'water', r, maxR),
  spawn(type, x, z, {y, yaw, color, wrap, tag, persistent}) -> Vehicle,
  hud(v), riderPose(ped, alpha) -> {kind: 'moto'|'jetski'|'chute', x, y, z, pitch, yaw, roll, chute, seat} | null,
  mod(v, {paint: {primary, secondary, finish: 'gloss'|'metallic'|'matte'|'chrome'}, wheels: 0..5, spoiler: 0..3,
          tint: 0..3, engine: 0..4, brakes: 0..3, armor: 0..5, turbo: bool, horn: 'stock'|'air'|'clown'|'fanfare'|'gavel'|'trombone'})
     -> {ok, mods, reason}            // sets v.mods, a per-vehicle copy of the class stats, then GTP.Render.rebuildEntityMesh(v)
  modCatalog(v) -> [{part, value, name, price, current, owned, stat}]   // aircraft / boats: engine, armour, paint, repair
  buyMod(v, part, value) -> {ok, price, reason: 'money'|'owned'|'unknown part'}   // charges player.money, emits shop:buy {item: 'mod:<part>:<value>', price}
  repair(v), repairPrice(v), priceOf(part, value), parts, defaultMods,
  store(propertyId, v) -> {ok, slot, record, reason: 'full'|'wrecked'|'not storable'|...}   // the driver steps out, the vehicle leaves the world
  retrieve(propertyId, slot) -> Vehicle | null   // spawns at landmark(propertyId).points.garage | bay | car | door, mods re-applied
  garage(propertyId) -> [record], capacity(propertyId),   // 4, or Content.parity.properties[id].garage
  deploy(chute), autopilot: vehicle.autopilot = {x, z, alt?, speed?} (heli / boat / plane fly or sail themselves; null stops),
  fleet: {enabled, slots(), refresh()}, modshop: {open: shopId|null}, controls: {invertPitch},
  virt, virtAxes, readAxes(), install(), save(), load(json), state()
}
GTP.SaveRegistry.vehicles = { get() -> {v: 1, garages, current: {type, mods}|null, controls}, set(json) }
```

Mod stats: engine +8% acceleration (+thrust) and +3% top speed per level, turbo +10% / +2.5%, brakes +12% per level,
armour +20% hull per level and -7% damage taken per level (`Vehicle.applyDamage` wrapper), spoiler +2% grip per level,
non-stock wheels +3% grip. Names and prices are data in 06b (`PARTS`); `GTP.Content.parity.modshop[part]` overrides
them when the content track supplies `{names, prices}` or `[{name, price}]`.

Mod looks on cars: when the models track's `vehicleGeometry(cls, wrap, mods)` does **not** mark its record
`rec.modsApplied = true`, 06b layers the looks on the car mesh itself: the paint finish (roughness / metalness on the
paint material), tinted glass (a per-vehicle glass clone), rims (an instanced hubcap disc that copies the wheel
matrices each frame) and a spoiler (lip / wing / GT wing). Set `rec.modsApplied` to take over.

Spin Doctor Customs: any landmark with `kind: 'modshop'`, an id starting `spin_doctor`, or "Spin Doctor" in its name is
a drive-in bay (its `points.bay`, else its door). Stopping a car or bike there (within 6 m, under 2.5 m/s) emits
`modshop:open {vehicle, shop, catalog}`; driving 12 m away emits `modshop:close {shop}`. With stars on, a toast
refuses. The UI draws the shop and calls `buyMod` (or `mod` for free changes).

Garages: the four safehouses (`safe_dorm`, `safe_brownstone`, `safe_marina_loft`, `safe_suburb`, `safe_penthouse`)
are just property ids; the systems / UI tracks decide when to call `store` / `retrieve` (for example from a garage
door marker). Records: `{type, color, color2, wrap, mods, hp, name}`. New Game (`load:begin` with reason `new`)
empties them.

## Events

Emitted: `vehicle:crash {vehicle, cause: 'ground'|'wall'|'rotor'|'water'}`, `aircraft:takeoff {vehicle}`,
`aircraft:land {vehicle}`, `vehicle:stall {vehicle}`, `parachute:deploy {vehicle, from}` (the bail),
`parachute:open {vehicle}`, `parachute:land {vehicle, ped, x, z, open, hard, water}`, `moto:thrown {vehicle, ped, cause}`,
`stunt:wheelie {vehicle, seconds}`, `vehicle:mod {vehicle, mods}`, `shop:buy {item: 'mod:...', price, vehicle}`,
`modshop:open {vehicle, shop, catalog}`, `modshop:close {shop}`, `garage:store {propertyId, slot, record}`,
`garage:retrieve {propertyId, slot, vehicle}`. The existing `vehicle:enter` / `vehicle:exit` fire for every type.

Consumed: `vehicle:impact` and `vehicle:hitPed` (the moto throw), `vehicle:enter` (re-apply saved mods),
`load:begin` (a new game empties the garages).

Player stats added: `wheelieBest`, `thrown`, `skydives`, `takeoffs`, `landings`, `aircraftCrashed`, `modsBought`.

## Objective types (registered when `GTP.Missions.registerObjectiveType` exists)

- `fly_to {target, radius = 25, family?, vehicle?, minAlt?, maxAlt?}`: done when the player's aircraft (or the given
  family / type) is within the radius horizontally, at any altitude unless bounded.
- `land {target, radius = 20, family?, vehicle?}`: done when it is on the ground there, under 3 m/s.
- `skydive {target, radius = 15}`: done when the player lands by parachute there (not a hard landing).
`target` is `{x, z}` or `{landmark, point?, dx?, dz?}`.

The existing `drive_to` already works with every new type: it needs the player in a vehicle within the radius and
within 4 m of the target's height, so a boat at a waterline target, a moto, or a heli / plane set down at the
target all complete it (a hovering heli must come within 4 m of the ground there). `drive_to` with a tagged
vehicle (`vehicle: 'tag'`) works the same.

## Wrappers installed on other modules (to fold in at integration)

At load (06b runs after 06_entities):
- `GTP.Vehicle.prototype.update`: routes the new families to their own steps (moto: the car step, then lean and
  wheelie); cars untouched. Autopilot step for AI-flown vehicles.
- `GTP.Vehicle.prototype.exit`: airborne exits from aircraft keep the ped's height (fall), the bail spawns the
  parachute; the parachute's exit is the cut-away. Cars and motos untouched.
- `GTP.Vehicle.prototype.applyDamage`: the armour mod's damage reduction.
- `GTP.Vehicle.prototype.syncMesh`: after the shared placement, animates the custom meshes (rotors, props, wheels,
  forks, gear, afterburner, canopy, nav-light blink, wreck look) and the car mod extras (rims, spoiler).
- `GTP.Vehicle.prototype.hud` (new method).
- `GTP.Player.prototype.control`: the new families read `readAxes()`; the moto runs the car control and adds the wheelie.
- `GTP.Player.prototype.update`: tracked-fall landing damage.
- `GTP.Ped.prototype._syncRider`: draws the rider on the moto (lean, wheelie), the jet ski and under the canopy;
  everything else falls through. **For the models track:** if the new `GTP.Anim` replaces `syncMesh` and does not
  call `_syncRider`, use `GTP.Vehicles.riderPose(ped, alpha)` for the position / rotation and draw the ride pose.
- `GTP.Entities.update` (the fleet and mod-shop ticks run first) and `GTP.Entities.add` (installs the deferred hooks).
- `GTP.Assets.vehicleGeometry`: a stub record (eye point, light points, no body) for the new types so nothing
  builds a car body for a heli; car classes go through untouched (the models track's override included).

Deferred (DOMContentLoaded before the autoboot, or the first vehicle add / step):
- `GTP.Render.buildEntityMesh`: the new types get `vehicleMeshes[type](v)`; a car with mods gets the mod looks.
  (When the environment track honours `vehicleMeshes` itself, this wrapper is harmless.)
- `GTP.Render.syncVehicle`: skipped for the custom meshes (they have no `rec`).
- `GTP.Render.rebuildEntityMesh`: defined **only if missing** (detach + attach), flagged `_vehiclesFallback`.
- `GTP.Render.rig.update`: the aircraft / boat / parachute chase camera; everything else goes to the original.
- `GTP.SaveRegistry.vehicles` (created if missing; re-added at DOMContentLoaded in case a later file replaces the
  object) and a `GTP.SaveHooks` entry `vehicles` (writes `data.vehicles`; load is idempotent, so both paths can run).

## Audio (03_audio.js)

- Engine voices by type (`Audio.engine(level, type)`; `ENGINE[type].kind`): `moto` (a six-gear sport-bike piston),
  `heli` (kind `rotor`: blade-pass thump at 2..13 Hz with rpm, turbine whine), `plane` (`prop`: a saw chopped at the
  blade rate), `jet` (`jet`: roar band + whine + hiss + sub), `speedboat` / `jetski` (`outboard`: a lumpy square + water
  hiss, the ski higher and buzzier), `parachute` (`wind`: rushing noise with flutter). The radio does not play under
  the canopy.
- `shot` is routed by weapon class: `opts.cls` / `opts.weapon` when the caller gives them, else the gun in the hands of
  the ped nearest the muzzle (`GTP.Combat.WEAPONS[id].cls` or `Content.parity.weapons`), a suppressor
  (`ped.weaponMods[id].muzzle` matching /supp|silenc/, or `opts.suppressed`, or `def.suppressed`) gives
  `shot_suppressed`. Voices: `shot_pistol revolver smg rifle lmg shotgun sniper launcher heavy thrown special suppressed`
  (class aliases: handgun, magnum, pdw, assault, carbine, mg, dmr, marksman, rocket, grenade, minigun, gatling, ...).
  `Audio.counts['shot_<class>']` counts them; `Audio.shotClass(opts)` exposes the routing. **For the shooting track:**
  pass `{weapon: id}` (and `suppressed`) to `Audio.play('shot', ...)` to skip the inference.
- New names (all in `Audio.names`): `dryFire reloadShell reloadBolt cover coverSlide melee_light melee_heavy
  melee_counter whoosh rotorStart chuteOpen bail stall gearUp splash phoneRing phoneBlip phoneHang chapter
  bossStinger bossPhase bossDefeat special_focus special_focusEnd special_shout special_chatmob special_boost
  specialReady shopBuy shopBrowse shopDeny modApply modWrench modSpray golfSwing golfPutt golfCup achievement
  rangeStart rangeHit rangeMedal door gps`.
- Horns: `moto`, `speedboat` (a ship horn), `jetski`; the mod shop horns (`air clown fanfare gavel trombone`) play
  for a vehicle whose `mods.horn` is set (or `opts.horn`).
- Wired events: `phone:call` (ring), `phone:answer` (blip), `phone:end` / `phone:hangup`, `chapter`, `boss:phase`
  (the first phase of a boss stings, later ones hit), `boss:defeated`, `special:state` (activation per id, focus end,
  meter full = ready), `shop:buy` (not `mod:` items: the mod shop plays its own wrench and spray), `shop:deny`,
  `shop:open` / `armory:inspect` / `clothing:open` / `barber:open` / `property:open` / `heist:board` (browse tick),
  `heist:plan`, `golf:shot` (putt when `club: 'putter'`, `putt`, or power < 0.2), `golf:end`, `achievement`,
  `range:start` / `range:hit` / `range:end` (medal fanfare by medal, the fail slide with none), `interior:enter` /
  `interior:exit` (the shop bell), `cover:enter` / `cover:exit`, `melee` / `melee:hit {type: light|heavy|counter}`,
  `weapon:dry`, `gps:set {kind: 'story'}`, `parachute:land {water}` and `vehicle:sunk` (splash).
- `Audio.render(kind, opts)` now also reports `zcr` (zero crossings per second over the audible samples) and renders
  the new engine kinds; `Audio.state().engine.kind`.

## Tests

```
cd grand-theft-pundit
NODE_PATH=/opt/node-tools/node_modules node tests/vehicles.js
NODE_PATH=/opt/node-tools/node_modules node tests/audio.js
node tests/content_audit.js
```

`tests/vehicles.js` covers registration, the fleet, a helicopter on real inputs (F, Shift, W, the real Q key through
the raw listener, the hover), the bail and the parachute, an autopilot heli flown into a tower (rotor strike), a fake
gamepad flying a heli (RT, RB, the stick, LT), the plane's takeoff roll / rotate / bank / landing / braking / crash,
the jet's takeoff and gear, the map-edge turn-back, the speedboat (boarding from the water, planing, the wake, the quay
wall), the jet ski's lean and rider, the moto's wheelie, lean, rider and the wall throw, the mods (stats, mesh rebuild,
armour), `buyMod`, a stand-in Spin Doctor bay, the garages, the registry and a slot save / load. It writes
screenshots: `veh_lineup_air`, `veh_lineup_sea`, `veh_heli_flight`, `veh_parachute`, `veh_plane_flight`,
`veh_jet_flight`, `veh_speedboat`, `veh_jetski`, `veh_moto`, `veh_mods`.

## Decisions

- New types are registered into `GTP.C.VEHICLES` from 06b rather than 01_config (not mine); the family flag keeps
  them apart from the nine car classes (code that iterates `C.VEHICLES` should skip entries with a `family`).
- The parachute is a vehicle type the player rides, so the HUD, the camera, the rider pose and the save code treat it
  like the others.
- Air physics use their own gravity (14 m/s²) instead of the city's arcade 22, for floaty but readable flight.
- On the ground a plane's W / S are throttle / brake (and S rotates on a full-throttle takeoff roll), in the air
  pitch: a new player can take off with W then S without learning the throttle keys first.
- Bridges (`BRIDGE` tiles) are not water, so boats cannot pass under the Sponsor Span.
- Each custom vehicle is 6 to 9 draw calls (detail parts merged with baked vertex colours, one mesh per animated part;
  the moto and jet ski also fold chrome / glass / the second paint into the detail mesh).
- No QA bug in `docs/v03/qa_r1_bugs.json` has a hint pointing at `03_audio.js` or `06b_vehicles_air_sea.js`, so
  none were fixed here (CMB-07 and CMB-09 mention the police helicopter, which lives in 07_ai.js / 10_render.js).

## Known issues / for other tracks

- UI: the radio ticker is drawn whenever the player is in a vehicle; under the parachute the radio is silent, so the
  UI may want to hide the ticker when `vehicle.cls.family === 'chute'`. The UI also needs to draw `vehicle.hud()`
  (altimeter, artificial horizon, throttle, gear) and the parachute prompt (`hud().prompt`).
- Riders: the moto (and its pillion), the jet ski, the parachute, and the pilot / helm seat of the heli, plane, jet
  and speedboat (seen through the glass) are drawn; other passengers are hidden as in cars.
- AI peds may carjack a parked aircraft; an AI-driven aircraft without `autopilot` sits idle on the ground.
- Cops do not follow the player into the air or onto the water (they drive to the nearest road point).
- No touch controls for the aircraft axes beyond the move stick (collective / throttle need the keyboard or a pad).
