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
- the world track's spots (`World.vehicleSpots`, 04_world), placed exactly: a helicopter on each of the five
  `World.helipads`, the plane and the jet on their `World.aircraft` stands (the apron north of the runway), and a boat
  in each of the nine `World.boatSlips` (a jet ski at the Fish Shack and Manifest Quay slips, a speedboat elsewhere);
- without those (an older world): the plane and the jet on the west end of Runway 10/10, a helicopter on any
  `helipad` landmark or point (else the airport apron by the tower and Perpetual Assembly Plaza), and a speedboat or
  jet ski on any `slip|boatyard|boat_dock` landmark plus the four waterfront fallbacks. These fallbacks are moved to a
  clear spot that is off every `World._noPark` tile (pads, apron, links, stunt lines) and away from every drive-in door;
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
  heading (rad, 0 = north, clockwise), headingDeg (0..359), throttle (0..1), gear (car / moto: 1..6 | 'R' | 'N'; plane: 'down' | 'up';
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
  buyMod(v, part, value, shownPrice?) -> {ok, price, mods} | {ok: false, reason: 'funds'|'owned'|'unknown part'}
      // part also takes the UI's paint categories primary / secondary / finish; shownPrice (the UI's price) is what is charged;
      // charges player.money, emits shop:buy {item: {id: 'mod:<part>:<value>', kind: 'mod', category, value, name}, price, vehicle, player}
  repair(v), repairPrice(v), priceOf(part, value), parts, defaultMods,
  store(propertyId, v) -> {ok, slot, record} | {ok: false, code, reason}   // the driver steps out, the vehicle leaves the world
      // code: 'no property'|'no vehicle'|'wrecked'|'not storable'|'too big'|'not yours'|'full'; reason: a sentence to toast
      // ('The garage takes cars and bikes.', 'Garage full (2 of 2).'): 07_ai's garage door toasts res.reason as is
  canStore(propertyId, v) -> {ok} | {ok: false, code, reason}   // the same checks without storing
  retrieve(propertyId, slot) -> Vehicle | null   // rolls out in front of the world's garage door (5 m past its ring, clear of
      // every drive-in door, so getting in does not store it again), else landmark points.garage | bay | car | door
  garage(propertyId) -> [record], capacity(propertyId),   // 4, or Content.parity.properties[id].garage
  deploy(chute), autopilot: vehicle.autopilot = {x, z, alt?, speed?} (heli / boat / plane fly or sail themselves; null stops),
  fleet: {enabled, slots(), plan(), refresh()}, modshop: {open: shopId|null}, controls: {invertPitch},
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

`mod(v, mods)` is the preview path (the UI calls it on every step): an unchanged set returns `{ok, mods, unchanged:
true}` with no rebuild and no event, and it plays no sound; `buyMod` plays the install (`modApply`, or `modSpray` for
paint). Aircraft, boats and the parachute take engine, armour, paint and repairs only: `mod` ignores the car parts and
`buyMod` refuses them (`unknown part`). Maxing engine, brakes and armour on one car counts `stats.maxedCars` and calls
`GTP.Systems.unlock('spin_doctored')` (the content achievement; 14_systems reads `stat` / `condition`, not `trigger`).

Spin Doctor Customs: 06b's drive-in bay opens every shop (any landmark with `kind: 'modshop'`, an id starting
`spin_doctor` or "Spin Doctor" in its name; its `points.bay`, else its door; stopping within 6 m under 2.5 m/s; refused
with stars on). The world track's door marker (07_ai, `World.doors` kind `modshop`) stands down while
`GTP.Vehicles.modshop` exists (07_ai.js doorTrigger), so there is one `modshop:open` per drive-in; the bay never opens a
second time while a shop is open. Whoever emits `modshop:open {vehicle, shop, landmark?, catalog?}`, 06b plays the
wrench and emits `modshop:close {shop}` once the car is 12 m from where the shop opened. The UI draws the shop and
calls `buyMod` (or `mod` for previews).

Garages: driving into an owned safehouse's garage door (07_ai, `World.doors` kind `garage`) calls `store` (refusals
are toasted from `reason`). Taking a car out: on foot within the door ring (plus 1.5 m) of an owned garage that holds
something, a toast says "E: take out the <name>" and the action key (E) calls `retrieve(property, 0)`; the press is
latched so it does not also throw a punch. Ownership is read like 07_ai does (`Systems.owns` / `properties.owns` /
`properties.owned`; unknown = allowed). Records: `{type, color, color2, wrap, mods, hp, name}`. New Game
(`load:begin` with reason `new`) empties them.

## Events

Emitted: `vehicle:crash {vehicle, cause: 'ground'|'wall'|'rotor'|'water'}`, `aircraft:takeoff {vehicle}`,
`aircraft:land {vehicle}`, `vehicle:stall {vehicle}`, `parachute:deploy {vehicle, from}` (the bail),
`parachute:open {vehicle}`, `parachute:land {vehicle, ped, x, z, open, hard, water}`, `moto:thrown {vehicle, ped, cause}`,
`stunt:wheelie {vehicle, seconds}`, `vehicle:mod {vehicle, mods}`, `shop:buy {item: {id: 'mod:...', kind: 'mod', ...}, price, vehicle, player}`,
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
`target` is `{x, z}`, `{landmark, point?, dx?, dz?}` or a world spot `{helipad | slip | spot: id}` (a `landmark` that is
not a landmark is also looked up in `World.helipads` / `boatSlips` / `aircraft`). An unresolved target reports an error
and completes at once (rather than locking the mission). These three objectives draw their own GPS line: 09_missions
only draws it for its own types, so 06b emits `gps:set {x, z, label, kind: 'objective'}` on `mission:objective` and
`gps:clear` in the objective's cleanup. While the player flies, sails or glides, `World.route` from the player returns a
straight line (`[a, b]`) instead of a road route.

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
- `GTP.Vehicle.prototype.applyDamage`: the armour mod's damage reduction; a hit on a parachute goes to its rider (the
  police door gunner aims at the vehicle; the canopy took the hits).
- `GTP.Vehicle.prototype.syncMesh`: after the shared placement, animates the custom meshes (rotors, props, wheels,
  forks, gear, afterburner, canopy, nav-light blink, wreck look) and the car mod extras (rims, spoiler).
- `GTP.Vehicle.prototype.hud` (new method).
- `GTP.Player.prototype.control`: the new families read `readAxes()`; the moto runs the car control and adds the wheelie.
- `GTP.Player.prototype.update`: tracked-fall landing damage.
- `GTP.Ped.prototype._syncRider`: draws the rider on the moto (lean, wheelie), the jet ski and under the canopy;
  everything else falls through. **For the models track:** if the new `GTP.Anim` replaces `syncMesh` and does not
  call `_syncRider`, use `GTP.Vehicles.riderPose(ped, alpha)` for the position / rotation and draw the ride pose.
- `GTP.Entities.update` (the fleet, mod-shop and garage ticks run first) and `GTP.Entities.add` (installs the deferred hooks).
- `GTP.Assets.vehicleGeometry`: a stub record (eye point, light points, no body) for the new types so nothing
  builds a car body for a heli; car classes go through untouched (the models track's override included).

Deferred (DOMContentLoaded before the autoboot, or the first vehicle add / step):
- `GTP.Render.buildEntityMesh`: the new types get `vehicleMeshes[type](v)`; a car with mods gets the mod looks.
  (When the environment track honours `vehicleMeshes` itself, this wrapper is harmless.)
- `GTP.Render.syncVehicle`: skipped for the custom meshes (they have no `rec`).
- `GTP.Render.rebuildEntityMesh`: defined **only if missing** (detach + attach), flagged `_vehiclesFallback`; the
  environment track's own is wrapped instead to dispose the custom meshes' `paint2` and tinted glass clone (Render
  disposes `userData.paint` only). `GTP.Render.detach` is wrapped the same way.
- `GTP.Render._postInputs`: an aircraft's motion blur fades with height above ground (full near the ground, a quarter
  from about 50 m); the environment track's blur follows ground speed only.
- `GTP.Ped.prototype.syncMesh` (once `GTP.Anim` exists): riders of these families get the anim with `pose.ride`, then the
  body is placed from `riderPose()` (moto pillion, hanging legs under the canopy). It wraps whatever chain is current:
  07_ai wraps `syncMesh` after 06c (the cower pose), so it no longer requires `syncMesh === GTP.Anim.syncMesh`.
- `GTP.World.route`: straight `[a, b]` from the player while in an aircraft, boat or parachute.
- Events: `modshop:open` (any source: the wrench, the 12 m close), `mission:objective` (the GPS line above).
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
  `Audio.counts['shot_<class>']` counts them; `Audio.shotClass(opts)` exposes the routing; each class has its own
  audible range (sniper 220 m, launcher 160 m, suppressed 30 m). **For the shooting track:** pass `{weapon: id, ped}`
  (and `suppressed`) to `Audio.play('shot', ...)`: today 08_combat.js passes neither, so the class is inferred from the
  armed ped nearest the muzzle (usually the shooter, but an armed bystander right at the muzzle can win).
- New names (all in `Audio.names`): `dryFire reloadShell reloadBolt cover coverSlide melee_light melee_heavy
  melee_counter whoosh rotorStart chuteOpen bail stall gearUp splash phoneRing phoneBlip phoneHang chapter
  bossStinger bossPhase bossDefeat special_focus special_focusEnd special_shout special_chatmob special_boost
  specialReady shopBuy shopBrowse shopDeny modApply modWrench modSpray golfSwing golfPutt golfCup achievement
  rangeStart rangeHit rangeMedal door gps`.
- Horns: `moto`, `speedboat` (a ship horn), `jetski`; the mod shop horns (`air clown fanfare gavel trombone`) play
  for a vehicle whose `mods.horn` is set (or `opts.horn`).
- Wired events (several have no emitter yet in this branch; they fire once the other tracks land): `phone:call` (ring), `phone:answer` (blip), `phone:end` / `phone:hangup`, `chapter`, `boss:phase`
  (the first phase of a boss stings, a phase change hits; repeats of the same phase are silent; reset on a load or a
  failed mission), `boss:defeated`, `special:state` (activation per id, focus end,
  meter full = ready), `shop:buy` (not when the payload carries `player`: the Combat shop plays its own `cash`; not `mod:` items: the mod
  shop plays its wrench and spray), `shop:deny`,
  `shop:open` / `armory:inspect` / `clothing:open` / `barber:open` / `property:open` / `heist:board` (browse tick),
  `heist:plan`, `golf:shot` (putt when `club: 'putter'`, `putt`, or power < 0.2), `golf:end`, `achievement`,
  `range:start` / `range:hit` / `range:end` (medal fanfare by medal, the fail slide with none), `interior:enter` /
  `interior:exit` (the shop bell), `cover:enter` / `cover:exit`, `melee` / `melee:hit {type: light|heavy|counter}`,
  `weapon:dry`, `gps:set {kind: 'story'}`, `parachute:land {water}` and `vehicle:sunk` (splash).
- `Audio.render(kind, opts)` now also reports `zcr` (zero crossings per second over the audible samples) and renders
  the new engine kinds; `Audio.state().engine.kind`.
- Round 2 (the merged world / environment build):
  - `shot` with no ped at the muzzle within 4 m of the live police heli is the door gunner: `smg`.
  - `melee {phase}`: `start` plays only the swing (`whoosh`), `impact` plays `melee_<type>` without its own swing
    (`noSwing`); a miss emits no impact, so it is a whoosh only. The dead `melee:hit` listener is gone.
  - `reload` is routed by the reloading weapon (`ped.reloadId`): shotgun class / shell loaders `reloadShell`; `reloadDone`
    of a sniper / marksman `reloadBolt` (only while a reload 03 saw start is open: a quiet gun's shot also plays
    `reloadDone` in 08_combat).
  - `shop:buy` also stands down for `kind: 'property' | 'clothing' | 'barber'` (14_systems plays `cash`).
  - `race:finish`: first place the mission fanfare, a loss or DNF a soft fail (not inside a mission).
  - `golfCup` on `golf:hole` (not when picked up), no longer on `golf:end`.
  - `range:end`: exactly one sound: `rangeMedal` for a medal (the UI's `achievement` chime in the same dispatch is
    dropped), a soft fail without one, nothing when `aborted`.
  - `interior:exit {quiet}` rings no bell; `heist:plan` stands down for the UI (it plays `cash`).
  - The siren scan skips driverless parked / roadblock cruisers at zero stars (QA stab-QA-D-03); `Audio.heli(false)` is
    ignored while the police heli is leaving, alive and not removed (stab-QA-D-09).
  - The first-star whoop keeps its own last wanted level (scripted `wanted` events carry `prev === level`).
  - Call blips: `Audio.update` watches `GTP.UI.state.call` (ring > talk > end) and plays `phoneBlip` / `phoneHang` unless
    a `phone:answer` / `phone:end` event already did.
  - New cues: `garageDoor` (`garage:store` / `garage:retrieve`), `eventSting` (`event:start`), `gasp` (`ped:cower`, 25 m).
  - 06b: `mod()` previews are silent; `buyMod` plays `modApply` (`modSpray` for paint); the wrench plays on any
    `modshop:open`.

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
wall), the jet ski's lean and rider, the moto's wheelie, lean, rider and the wall throw, real `drive_to` missions
(a heli hovering over the marker does not complete it, setting down does; a speedboat at a waterline target; the
moto), the mods (stats, mesh rebuild,
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

## Review fixes (an adversarial self-review of this branch)

- Exits from an aircraft over or on a roof below bail height are refused with a toast (peds cannot stand on roofs:
  `World.heightAt` has no roofs); the parachute lands on the ground (the canopy slides off roofs).
- A plane no longer bounces back into the air after a nose-up touchdown (takeoff needs S on a takeoff roll);
  a stale `lastImpact` no longer turns a light bump into a crash; rolling off a ledge builds the sink under gravity.
- A save made in the air (or under the canopy) stores no vehicle: the player loads on foot below it. A pre-0.3 save
  clears the garages. A boat leaves a garage only where there is water within 120 m (else it stays stored).
- Cutscenes / knockouts zero a boat's throttle; a landed canopy is locked; the flight camera has the building guard;
  the fleet rng is reseeded from the game seed; the fleet rebuilds on every `load:begin` (New Game, a load).
- A thrown rider takes one dose of damage (not two) and a pillion comes off too.
- Audio: per-class report ranges, `boss:phase` cues only on a phase change, the specials map seeded silently and reset
  on a load, the Combat shop's purchase no longer double-plays, a dry-fire rate limit.

## Known issues / for other tracks

- UI: the radio ticker is drawn whenever the player is in a vehicle; under the parachute the radio is silent, so the
  UI may want to hide the ticker when `vehicle.cls.family === 'chute'`. The UI also needs to draw `vehicle.hud()`
  (altimeter, artificial horizon, throttle, gear) and the parachute prompt (`hud().prompt`).
- Riders: the moto (and its pillion), the jet ski, the parachute, and the pilot / helm seat of the heli, plane, jet
  and speedboat (seen through the glass) are drawn; other passengers are hidden as in cars.
- AI peds may carjack a parked aircraft; an AI-driven aircraft without `autopilot` sits idle on the ground.
- Cops do not follow the player into the air or onto the water (they drive to the nearest road point).
- `Render.detach` disposes only `userData.paint`; the custom meshes' second paint and a tinted glass clone leak a
  material per despawned vehicle (small; folding `paint2` / `glass` into detach at integration fixes it).
- Players cannot land a helicopter on a roof and step out (see the review fixes); a roof-aware ped floor would allow it.
- No touch controls for the aircraft axes beyond the move stick (collective / throttle need the keyboard or a pad).
