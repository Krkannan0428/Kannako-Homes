# Vehicles track: final notes (v0.3.0)

Branch `v03/vehicles`, merged with `origin/game/grand-theft-pundit` at `10ba585` (the environment and world tracks);
no newer base commits at the time of the last push. Owned files: `js/06b_vehicles_air_sea.js`, `js/03_audio.js`,
`tests/vehicles.js`, `tests/audio.js`, `docs/v03/vehicles.md` (the interface notes), `docs/v03/triage_vehicles.md`
(round 1), this file.

## Fixed in the final round

The round-1 items the coordinator listed are closed: the **jet ski lean** (see the first bullet below),
**phoneRing** (round 1: the test cleared the rate limits; `tests/audio.js` passes), and the rest of the round-1 triage
(`triage_vehicles.md`).

The world and environment merge broke or left open these, all fixed and covered by `tests/vehicles.js` /
`tests/audio.js`:

- **Riders were invisible on every moto, boat, aircraft and the parachute** (the jet ski test failed on the merged
  build). 07_ai now wraps `Ped.syncMesh` after 06c installs `GTP.Anim`'s, so 06b's rider hook (which required
  `syncMesh === GTP.Anim.syncMesh`) never installed. It now wraps whatever chain is current.
- **The fleet ignored the world's spots.** Helicopters now park on the five `World.helipads`, the plane and jet on the
  `World.aircraft` apron, and a boat in each of the nine `World.boatSlips`, placed exactly. A latent bug moved every
  "place exactly" slot (`clear: 0` became 3, so even the old runway slots went through `findClear`). Fallback slots
  now stay off `World._noPark` tiles and drive-in doors.
- **Garages:**
  - A stored car could never come out again: nothing called `retrieve`. On foot at an owned garage door with something
    inside, a toast offers "E: take out the <name>", and the action key rolls it out. The press is latched, so it
    doesn't also throw a punch.
  - `retrieve` used to drop the car on the drive-in marker, which stored it again at once. It now places the car past
    the door ring, clear of every drive-in door.
  - `store` refuses aircraft, boats and strand or mission vehicles.
  - Refusals carry a readable `reason`, which 07_ai toasts as is, plus a `code`. `canStore()` was added.
- **The mod shop opened twice** per drive-in (06b's bay and 07_ai's door), and 06b's ignored the mission gating.
  06b now stands down where a world door exists. The 12 m close and the wrench follow any `modshop:open`.
- **The mod shop on the preview path:**
  - `mod()` played the 1.8 s install jingle and rebuilt the mesh on every UI preview step. An unchanged set is now a
    no-op, and only `buyMod` plays the install.
  - Aircraft, boats and the parachute are no longer sold car parts.
  - The "Spin Doctored" achievement can now unlock: `stats.maxedCars`, plus `GTP.Systems.unlock('spin_doctored')`.
- **A hit on the parachute hit the canopy**, not the rider: the police door gunner's bursts did nothing to a
  skydiver, and the canopy burned at negative hp.
- **Leaks:** each mod rebuild or despawn of a custom vehicle leaked its second paint material and its tinted glass
  clone, because Render disposes only `userData.paint`. Both are now disposed.
- **`fly_to` / `land` / `skydive` had no GPS line**, because 09_missions clears it for types it doesn't know. 06b now
  draws it on `mission:objective` and clears it on cleanup. World helipad, slip and apron ids resolve as targets.
  While flying, sailing or gliding, `World.route` from the player is a straight line instead of a road route.
- **Rendering:**
  - Wake and downwash puffs were cut in half by the new ocean plane; they now start above it.
  - An aircraft's motion blur, which follows ground speed, now fades with height.
  - An aircraft saved on a roof loads the player on foot.
- **Planes made outside `spawn()`** (a save load, a mission, `debug.spawnVehicle`) now get wingtip contacts.
- **Audio** (03_audio). The full list is in `vehicles.md`, under Audio, Round 2.
  - **Weapons:**
    - The police door gunner is an SMG, not a pistol.
    - Melee plays the swing on start and the impact on impact, instead of the full cue twice.
    - Shotgun and bolt reloads have their own voices.
  - **Doubled or misplaced cues:**
    - Systems purchases no longer double with `cash`.
    - `golfCup` plays on a holed ball, not on quitting.
    - `range:end` plays exactly one sound.
    - A quiet interior exit no longer rings the bell.
    - Confirming the heist plan no longer doubles with the UI's `cash`.
  - **New or restored cues:**
    - The race finish has a sound.
    - The first-star whoop works for scripted wanted levels.
    - Call blips play from the UI's call card phases.
    - New cues: a garage door sound, a street-event sting and a cowering gasp.
  - **QA stab-QA-D-03** (released roadblock sirens) and **stab-QA-D-09** (the leaving police heli going silent) are
    mitigated on the audio side.

## Still open (other tracks; not changed here: outside this track)

A review pass over the merged build reported these. The ones marked *checked* I confirmed in the code; the rest are
the reviewer's reading, with the exact change it proposed.

- **UI (11_ui.js):**
  - *Checked:* `vehCat()` tests `/plane|jet/` before the boat pattern, so the jet ski gets the aircraft panel ("GEAR
    UP", the attitude ball; visible in `tests/out/veh_jetski.png`). Fix: use `v.cls.family` / `hud().family` first.
  - `chuteState()` reports `open` during freefall, so the DEPLOY prompt never shows for 06b's parachute.
    Fix: `v.chute === 'free' ? 'freefall' : ...`.
  - `phone:answer` / `phone:end` are never emitted (03 now watches the call card instead).
  - "Not enough cash" plays the mission-fail slide; `shop:deny` is never emitted.
  - A boss defeat plays `chapter` (UI) and `mission` (bosses) together; `bossDefeat` never plays.
  - The wardrobe test reads the UI's fallback clothing while the UI shows the content track's (round 1).
- **Shooting (08_combat.js):**
  - A suppressed gun plays `reloadDone` instead of `shot`: use `sfx('shot', ...)` with `{weapon, ped, suppressed}`.
  - Dry fire plays `ui` (`weapon:dry` is never emitted).
  - Cover plays `land` on top of 03's `cover`.
  - The scope zoom click plays at world (0, 0).
  - A sinking vehicle plays `land` plus 03's splash (06_entities.js:636).
- **Bosses (08b_bosses.js):**
  - Specials are voiced twice (four direct `sfx` calls plus 03's `special:state` cues).
  - The Goldplate helicopter's rotor goes silent 1.6 s in: call `GTP.Audio.heli(level, x, z)` from the b01 tick.
- **Story (09_missions.js):**
  - *Checked:* `GPS_TYPES` lists only the story's own objective types (worked around here, see above).
  - A queued call rings twice.
- **World / AI (07_ai.js, 04_world.js):**
  - The garage door steps the player out before `store()`; calling `store` alone (it steps occupants out) avoids a
    pointless exit on a refusal.
  - Drive doors accept aircraft. `store` refuses them, and the mod shop sells them only engine, armour and paint.
  - The heli `leave()` and roadblock siren root causes (mitigated in 03).
  - `wanted.set()` emits `prev === level`.
  - The reviewer also reports that the v0.3 sj_01 stunt line runs through the m00 giver (Kip Gratis).
- **Environment (10_render.js, 10b_postfx.js, tests/perf.js):**
  - Aircraft above about 25–40 m lose their shadow: the near cascade doesn't follow the light ray.
  - Car window tint is applied twice (the environment's glass on top of the models track's tinted vertex colours).
  - TAA resets every frame for a fast jet at low fps.
  - `perf.js` stops at the sim-speed gate before its frame and draw-call checks.
- **Systems (14_systems.js):**
  - *Checked:* `achievements.defs()` reads `stat` / `condition`, not the content table's `trigger: {stat, count}`, so
    content achievements with only a `trigger` never unlock by stats. 06b unlocks Spin Doctored directly.

Not done in this track (low impact, noted for later): boat bob and pitch are not phase-locked to the ocean shader's
swells (render-only), and a few 06b hot paths still allocate small objects per step (`readAxes`, `riderPose`, the
first-person camera vector).

## Test results (this branch, final state)

- `tests/vehicles.js`: PASS. It adds a 6c section on the real world doors and spots:
  - the fleet on the pads, apron and slips;
  - a garage door store, and an E retrieve that does not re-store;
  - the real Spin Doctor door opening the shop once;
  - aircraft refusals, the canopy hit and the no-op preview;
  - the `fly_to` GPS line to a helipad.
- `tests/audio.js`: PASS (new counts for every audio fix above). `tests/radio.js`: PASS.
- `tests/content_audit.js`: OK (238 files, 0 hits).
- Other tracks' tests that touch these paths: see below.
