# Integration round 1: vehicles track triage

Branch `v03/vehicles`, merged with `game/grand-theft-pundit` at `65dc2b7` (fifteen tracks). Files owned:
`js/06b_vehicles_air_sea.js`, `js/03_audio.js`, `tests/vehicles.js`, `tests/audio.js`, `docs/v03/vehicles.md`, this file.

## QA bugs whose hint points at 03_audio.js or 06b

| Bug | Status | What was done |
|---|---|---|
| stab-QA-D-02 (medium): switching tabs leaves the engine, siren and radio playing | **fixed** | `Audio.init` adds `visibilitychange` / `pagehide` / `pageshow` listeners (live boots only): a hidden page suspends the context, showing it again resumes it (only when the hide suspended it). Covered by `tests/audio.js` 4c (running > suspended > running). Opening the pause menu on hide is the story / UI tracks' call (30_game / 11_ui); the sound part is root-fixed here. |
| pers-QA-SAVE-13 (low): with the tab hidden the engine and siren keep sounding | **fixed** | The same fix (the context is suspended, so every loop goes quiet). |
| stab-QA-D-06 (medium): the cutscene score never plays on foot | **fixed** | `updateRadio` has a score mode: while the game is in `cutscene` and `GTP.Cutscenes.current.script.music` is `station:<id>`, the sequencer plays that station (at 0.8 level) on foot, and stops when the cutscene ends (12_cutscenes already sets / restores the station). `tests/audio.js` 4c. |
| stab-QA-D-07 (low): a gamepad-only player never hears anything | **fixed** | `Audio.update` calls `unlock()` when a pad button is newly down and the context is missing or not running (rate-limited to once a second). `tests/audio.js` 4d: a fake pad's Y creates the context (state running in the test browser). |
| stab-QA-D-10 (low): the title screen is silent | **fixed** | A title theme: on the `title` state the radio plays `Content.radio.titleStation` (default `office_hours`, the lo-fi station) at 0.55 without changing the player's station; leaving the title retunes silently (no static). `tests/audio.js` 4d asserts it on the title. |
| stab-QA-D-09 (low): the helicopter rotor goes silent the moment the stars clear | **not mine (07_ai.js)** | `Heli.leave()` and `update()` call `Audio.heli(false, ...)` while it flies away. `Audio.heli(false)` also means "shot down", so muting on false is right on the audio side; the fix is the hint's: keep calling `Audio.heli(true, x, z)` while leaving. Evidence: `07_ai.js` `leave()` and the 0.5 s update call `Audio.heli(!this.leaving, ...)`. |
| stab-QA-D-03 (medium): roadblock cruisers keep their siren after the stars clear | **not mine (07_ai.js)** | The siren loop follows `vehicle.siren`, which stays true on released roadblock cars (`updateRoadblocks`); clearing it there stops the loop. |

No bug in `qa_r1_bugs.json`, `qa_a.json`, `qa_b.json` or `qa_c.json` points at 06b or 03_audio. QA-A-GEO-05 mentions "the fleet lots" in `07_ai.js` spawner (the AI's parked cars), not this track's fleet; the vehicles fleet places every slot with `findClear`, which rejects solid props and buildings.

## Coordinator items

- **`audio.js` failure "every SFX name makes a voice; failed: phoneRing"**: the name existed; the story track had just
  rung it, so the per-name rate limit (1.2 s) dropped the test's play. `Audio._clearGaps()` (tests) clears the limits
  before the all-names check. Fixed.
- **Names other tracks play**: a grep of every `Audio.play` / `sfx('...')` literal across `js/` found `phone`
  (09_missions placeCall, 11_ui call card), `golf_swing` and `golf_putt` (14_systems) missing. All three now exist
  (aliases of `phoneRing`, `golfSwing`, `golfPutt`). Double cues removed: the v0.3 UI already voices `chapter`,
  `achievement`, `range:end`, `boss:defeated` and `phone:call`, the systems track voices `golf:shot` and the story rings
  `phone` before `phone:call`, so 03_audio's own handlers stand down for those when that module is present.
- **The opening cutscene in `audio.js`**: after Enter on the title the test clears `GTP.game._openingPending` and skips
  any active cutscene, as `tests/ui.js` does.
- **The radio track (docs/v03/radio.md)**: `state().talkBar` and `.id` are kept (the pattern view reads them). New:
  the station `kit` hint is honoured (`march soft house break none`; `break` is a short punchy kick and a crisp snare for
  Loop 174, `none` keeps only a soft clock-tick hat for Quiet Signal); `radio.nowPlaying()` returns
  "Station - Title by Artist" from `Content.radio.nowPlaying(id)` (the ticker now shows the song), `radio.song()`
  returns the raw record; the radio track's `Audio.update` wrapper is folded in: `Audio.update` calls
  `Content.radio._newsTick()` and `Audio._radioNewsWrapped` is set at load, so 23_content_radio.js no longer wraps.
  `tests/radio.js` passes on this branch.
- **The jet ski rider on the models track's animation**: `06c` replaces `Ped.syncMesh` and seats riders from the vehicle
  record's `seats` (the custom meshes have none) and only for `bike` / `moto`. 06b now wraps the new `Ped.syncMesh` at
  install time: a rider of these families runs the anim with `pose.ride` on (the rig takes the saddle pose), then the
  body is placed from `GTP.Vehicles.riderPose()` (corrected for the new rig's 0.96 m hips), the moto pillion is drawn,
  and under the canopy the legs hang. `tests/vehicles.js` passes ("the jet ski leans into the turn with the rider on
  it"); `tests/out/veh_jetski.png` and a close-up of the moto with a pillion, a heli pilot and a parachutist were checked.
- **The models track draws car mods itself** (wheels, spoiler, tint, paint from `vehicle.mods`), so 06b's car-mod
  overlay (hubcaps, spoiler) stands down when `GTP.Models.syncVehicle` exists (no double spoiler).
- **The UI mod shop's BUY**: the UI calls `GTP.Vehicles.buyMod(vehicle, cat, value, price)` with its own categories
  (`primary`, `secondary`, `finish`, `wheels`, `spoiler`, `tint`, `engine`, `brakes`, `armor`, `turbo`, `horn`) and
  expects `{ok:false, reason:'funds'}` when the wallet is short. `buyMod` returned 'unknown part' for the paint
  categories and `reason: 'money'`, so the UI showed "No sale." Now: `primary` / `secondary` / `finish` map to the paint,
  the fourth argument (the price the UI showed) is the price charged, a short wallet returns `reason: 'funds'`, any horn
  id is accepted (the UI's `airhorn debate_bell kazoo applause` and the content table's `breaking coupon toast jets ten
  kazoo` all have voices in 03_audio), and the content track's modshop table (`Content.parity.modshop`: level arrays,
  `horns`, the `turbo` object, `paint.finishes` and `primaryPrice` / `secondaryPrice`) prices the catalog.
  **The exact call:** `GTP.Vehicles.buyMod(vehicle, categoryId, value, shownPrice)` -> `{ok: true, price, mods}` (it has
  charged `player.money`, applied the mod, rebuilt the mesh and emitted `shop:buy {item: {id: 'mod:<cat>:<value>', kind:
  'mod', category, value, name}, price, vehicle, player}` (the UI's own item shape); the UI must not charge again) or `{ok: false, reason: 'funds' | 'owned' | 'unknown part'}`.
- **The vehicle HUD (UI track)**: the UI reads `hud().heading` in radians (its tape converts with `* 180 / PI`); 06b
  returned degrees. `heading` is now radians (0 = north, clockwise), like `pitch` / `roll`, plus `headingDeg`.
  **For the UI track:** `vehCat()` in 11_ui.js tests `/plane|jet|.../` before `/boat|jetski|.../`, so the jet ski gets
  the aircraft panel ("GEAR UP", an attitude ball): test the boat pattern first, or use `vehicle.cls.family` /
  `hud().family` (`car moto heli plane boat chute`).
- **Garages**: `capacity(propertyId)` now reads `Content.parity.properties[].garage` (safe_dorm 1, suburb 3, brownstone 2,
  marina loft 2, penthouse 4); the test uses the penthouse.

## Full suite on the merged build

`node tests/all.js` on this branch (merged with `65dc2b7`); every failing file was then re-run on a clean worktree of
`65dc2b7` (the base, without this track's round-1 changes). The full run hit the 2 h cap; the files it did not reach
were run as a second batch.

**This track's files: all pass.** `vehicles.js`, `audio.js`, `radio.js` (the radio track's test of 03_audio) pass, and
so do `render.js`, `smoke.js`, `tune.js` and `world.js`.

**Failing, identical on the base (not caused by this track):**

| File | First failing assert | Owner / evidence |
|---|---|---|
| bosses | b01_goldplate not beaten in 360 s (`hits: 0`, pistol dealing damage the boss never takes) | bosses / combat; same numbers on base |
| campaign | m01b_airport has no marker (`no marker for m01b_airport: m01c_both_sides`) | story / missions; the m01c insert changed the chain |
| characters | the aimed rifle's grip is at `gripY 2.75`, the left hand off the barrel | models / animation |
| combat | `[` on the weapon wheel does not step past an unowned segment | combat / UI |
| feel | the save expects m03 lit after m02; `m01c_both_sides` is lit as well | story (m01c chain) |
| interiors | 12 weapons have no rack mesh (megaphone, flare_gun, minigun, carbine, rifle...) | interiors / models |
| missions | `17 base missions (25 with the expansion), got 17 / 61` | missions test count stale vs. the content |
| newplayer | `GTP.World.route` missing, so no GPS route; later steps follow | world / UI |
| perf | sim speed 549 steps/s (base 417), below the 600 bar while another suite ran alongside | load; not a regression |
| saves | m01c_both_sides comes back lit | story (m01c chain) |
| story | m01_van: no next mission, GPS or call | story (m01c chain) |
| strands | the race car is not entered at lr_01 (`inCar: false`); a fresh boot enters it fine, so it depends on earlier sections | strands (09_missions) |
| strangers | strand run problems | strangers |
| systems | `tables` (the golf course table) | systems |
| ui | "the mattress ad runs at minute 20 on every station": it does on all 6 (`[true x6]`); the test still expects 4 stations | UI test vs. the radio track's 6 stations |

**ui_v03**: on the base it fails at the mod shop BUY (`money1 20000, applied null`). Fixed here (see "The UI mod shop's
BUY" above): the paint step passes on this branch (`money 20000 -> 19700`, `ev: 'mod'`). It now fails one step later,
at the wardrobe: the UI reads the content track's clothing (`Content.parity` `top_tee_table` first) while the test
expects the UI's own fallback list (`top_quarterzip` second). That is a UI / content-parity mismatch, not this track's.
