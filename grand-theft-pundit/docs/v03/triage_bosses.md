# Triage: bosses track, integration round 1

Merged build: `game/grand-theft-pundit` at `10ba585` (all seventeen tracks), merged into `v03/bosses` as a
fast-forward. The fixes from this round are in `e694e70` and later.

## QA reports: bugs touching `js/08b_bosses.js`

Searched `docs/v03/qa_r1_bugs.json` (48 bugs), `qa_a.json` (55), `qa_b.json` (65), `qa_c.json` (0) and
`qa_d.json` (28), plus the matching `.md` reports, for `08b`, `boss`, `special` and `chat mob`. **None of them
points at this file.** One note applies to it:

| Source | What it says | Status here |
|---|---|---|
| `qa_c.md`, "Notes for the v0.3 tracks" | Boss set pieces multiply the mesh-leak patterns: mark shared geometry `userData.shared`, dispose everything else on detach, never add real lights at run time, reset module state in `reset()` | **Done.** The cached boss geometries carry `userData.shared`. Owned geometries (`userData.ownGeo`) and label materials (`material.userData.own`) are disposed when a part breaks or a fight ends. No lights are added. A load, a new game, an abort or a death outside a mission ends every fight and clears the specials (`tests/bosses.js` lifecycle: zero boss entities and zero boss scene objects after a new game). |

## Issues found on the merged build and fixed in this file

1. **The reported failure: "b01_goldplate ... phases [1]", with spools apparently taking no hits.**
   - **Cause:** the test bot, not the fight. The shooting track's new aim assist grabs a target within 20 degrees
     only when aim is first pressed. It then steers the camera in yaw and pitch, and drops a ped lock once the
     crosshair is more than 10 degrees off.
   - The bot held aim and kept turning the camera yaw itself. The spools are kind `'heli'`, which the assist locks
     hard, so they kept being hit. Goldplate on the ground (a ped) was never locked, so the phase never moved.
   - **Fix (`tests/bosses.js`):** the bot faces the target and presses aim, and leaves the camera alone while the
     lock holds. Nothing for the shooting track to change: weak points are hit, locked and blast-damaged as
     before.
2. **The content missions' approaches end far from some arenas.** `b01` ends under Goldplate Tower, 208 m from the
   Links; `b06` ended at the stadium, 112 m away. A fight spawned there would trip the 10 s leash.
   - **Fix:** a boss objective that starts more than 70 m away waits in state `travel`. The arrow and the hint point
     at the arena, and the fight opens within 45 m. `b06` also moved beside the stadium.
3. **`b04` patch respawn could wait on a stale pointer:** fixed to always respawn a patch while pops remain.
4. **Knockdown chains:** an attack aimed at the player now waits while they are on the floor, and the redaction bars
   stagger instead of knocking down. The content run lost the bot 424 hp to chained bars before this.
5. **Duplicate HUD:** the ui track's state carries `boss` and `specials`, so the fallback bar and meters stand down.
   The story track's `registerObjectiveType` is used (the start-time fallback does not install). `special` is bound
   in `02_input.js` (the X stand-in stands down).
6. **Dunk's card sprite covered the top of the screen at punching range:** it is now half the size and lower.

The content track's six boss missions now pass end to end in `tests/bosses.js` (`ONLY=content`): prep, approach,
fight, dialogue, outro, MISSION PASSED.

## Still open, owned by other tracks

- **ui (`js/11_ui.js`):** the lock reticle labels boss weak points WEATHER BALLOON.
  - Where: around line 1041 and line 3849, `tg.kind === 'heli' ? 'WEATHER BALLOON'`.
  - Fix: use `tg.label` when `tg.bossPart` is set.
  - Also: skip `bossPart` entities in the minimap's helicopter crosses (around line 567).
  - Evidence: `tests/out/boss_b03_warbanner_p1.png`, where the scooter's weak point reads WEATHER BALLOON.

## Full suite on the merged build (`tests/all.js`, run before the fixes above landed)

`20 of 32 test file(s) failed`. Log: `docs/v03/merge1_all*.log` from the coordinator.

- **Mine:** `bosses.js`. The run started before the bot fix reached disk. On the current code `tests/bosses.js`
  passes: all six test fights, all six content missions, the checkpoint, the specials and the lifecycle.
- **Not this file's.** No error names `08b_bosses.js`, and `GTP.errors` stays empty in every boss run. The first
  assertion of each failing file:

| File | First failing assertion | Owner by the file it tests |
|---|---|---|
| actors.js | `crash damage: 0` | shooting / vehicles (06_entities) |
| audio.js | `every SFX name makes a voice; failed: phoneRing` | vehicles (03_audio) |
| campaign.js | `m01b_airport started by walking into its light ...: no marker for m01b_airport: m01c_both_sides` | story / content (the chain now inserts m01c) |
| characters.js | `aimed rifle: in the right hand, barrel along the facing at chest height ... gripY 2.75` | models (06c_animation) |
| combat.js | `a scoped shot lands at 40 m and the readout says so: dmg 0` | shooting |
| events.js | `driving into the mod shop: [spin_doctor_strip, spin_strip]` (two opens) | world |
| feel.js | `saved with m00..m02 done (m03 lit)`: markers show m01c_both_sides | story / content (chain) |
| interiors.js | `racks stocked with every weapon as a real mesh: missing megaphone, flare_gun, ...` | interiors / shooting (05b meshes) |
| missions.js | `17 base missions (25 with the expansion), got 17 / 61` | story (the count grew with the parity missions) |
| newplayer.js | `the new-player bar is not met; missing steps: m01c, pistol, aim, save, ten_min` | story / ui |
| perf.js | `simulation keeps up (>600 steps/s headless): 568` (549 on a rerun alone) | see below |
| saves.js | `missions, flags, best times and the next light come back: m01c_both_sides` | story |
| story.js | `m01_van: the GPS and the call go to the next story mission: next null` | story |
| strands.js | `braking on the start line ... starts the race: racers 0` | story (Strands) |
| strangers.js | `strand run problems:` | strangers |
| systems.js | `tables: {...}` | systems |
| ui.js | `the mattress ad runs at minute 20 on every station` | ui / radio |
| ui_v03.js | `a paint previews through Vehicles.mod, BUY pays and emits shop:buy: applied null` | ui / vehicles |
| vehicles.js | `the jet ski leans into the turn with the rider on it` | vehicles |

**perf.js:** the boss and specials tick was measured on the merged build over 1,800 steps with no fight running:
7.8 µs per step, 0.5% of the simulation time. A/B with the tick switched off: 590 steps/s off against 635 on, which
is noise. The shortfall is elsewhere (AI, world and render ticks).
