# Radio track: full-suite triage, integration round 1

**Build:** `v03/radio` after merging `origin/game/grand-theft-pundit` at 65dc2b7, plus the radio UI-feed commits.

**How the suite was run:**
- `NODE_PATH=/opt/node-tools/node_modules node tests/all.js` ran in the background until its job hit the time limit,
  during `newplayer.js` (17 of 33 files done).
- The remaining 16 files ran one by one with the same command (`node tests/<file>.js`).
- `content_audit.js` is green (234 files, 0 hits).

## Summary

| file | result | owner | radio-related? |
|---|---|---|---|
| actors, ai, artifact, content_parity, cover, cutscenes, feel2, perf, render, smoke, tune, world | PASS | - | - |
| **radio** | **PASS** | radio | yes, green |
| audio | FAIL (`phoneRing`) | vehicles | no (its radio checks pass) |
| ui | FAIL (`nap.length === 4`) | ui | the data is correct; the test hard-codes four stations |
| bosses | FAIL | bosses | no |
| campaign | FAIL | story / content | no |
| characters | FAIL | models | no |
| combat | FAIL | shooting | no |
| feel | FAIL | story (marker list) | no |
| interiors | FAIL | interiors | no |
| missions | FAIL | story | no |
| newplayer | FAIL | qa-b (reflects story / world / interiors) | no |
| saves | FAIL | story | no |
| story | FAIL | story | no |
| strands | FAIL | story (strands in `09_missions.js`) | no |
| strangers | FAIL | strangers | no |
| systems | FAIL | systems | no |
| ui_v03 | FAIL (mod-shop paint buy) | ui / vehicles | no. Its later radio-ticker check would pass with the radio data (verified separately, below). |
| vehicles | FAIL (jet ski lean) | vehicles | no |

## Failures in other tracks' files

- **audio.js** (vehicles): `every SFX name makes a voice; failed: phoneRing`. The v0.3 wiring cues `phoneRing` on
  `phone:call` just before the all-names loop, and `MIN_GAP.phoneRing` is 1.2 s, so the second play is rate-limited
  and returns false. The fix belongs in the test (wait or skip names played within their gap) or in the gap table.
  The radio parts of the test passed before it stopped: station cycling, `nowPlaying` matching `/Pennant/`, and the
  in-car sequencer.
  - **Earlier in this round** it failed on `nowPlaying` because the radio wrapper returned an object. That was radio's
    fault and is fixed: the wrapper now returns a plain string.
- **ui.js** (ui): `the mattress ad runs at minute 20 on every station`. Its own log prints
  `nap ads: [true,true,true,true,true,true]`: all six stations, the two new ones included, run the Nap Dynasty ad at
  minute 20. The test then asserts `nap.length === 4`. Change it to `nap.length === GTP.Content.radio.stations.length`
  (or `>= 4`).
- **bosses.js** (bosses): `b01_goldplate: the mission completed (the boss beaten) within 360 s of play`. The bot dealt
  436 pistol damage, but the boss stayed in phase 1 and was not defeated.
- **campaign.js** (story/content): `m01b_airport started by walking into its light`. The result was "no marker for
  m01b_airport", and only `m01c_both_sides` was lit. The new chain inserts m01c before m01b, so the test's expected
  order is stale, or the marker logic is.
- **characters.js** (models): `aimed rifle: in the right hand, barrel along the facing at chest height` fails with
  `y` 0.01, `leftAhead` -0.1.
- **combat.js** (shooting): `an unowned segment can be stepped off with [ and equips what is owned` (wheel stepping
  ends on `smg`).
- **feel.js** (story): `saved with m00..m02 done (m03 lit)`. The lit markers include `m01c_both_sides` (the new chain).
- **interiors.js** (interiors): `racks stocked with every weapon as a real mesh` (45 of 52, with 12 named weapons
  missing meshes).
- **missions.js** (story): `17 base missions (25 with the expansion), got 17 / 61`. The count is stale after v0.3
  added missions.
- **newplayer.js** (qa-b): the new-player bar is not met. It reports `GTP.World.route` missing (no GPS line), then
  the page closed during m01c and the armory steps.
- **saves.js** (story): `missions, flags, best times and the next light come back: m01c_both_sides`.
- **story.js** (story): `m01_van: the GPS and the call go to the next story mission`. It got `next: null`, no
  gps:set and no call.
- **strands.js** (story): `braking on the start line for a second starts the race`. The car was not entered
  (`inCar: false`).
- **strangers.js** (strangers): `st_ghost_1` and `st_proof_1` are not started by walking into the marker.
- **systems.js** (systems): the `tables` assertion fails (26 achievements against the expected 25, and similar counts).
- **ui_v03.js** (ui / vehicles): `a paint previews through Vehicles.mod, BUY pays and emits shop:buy`. Money was not
  deducted and `applied` is null.
- **vehicles.js** (vehicles): `the jet ski leans into the turn with the rider on it`.

## Radio-side changes made for integration round 1

- **Ticker feed.** Every station now has `station.nowPlaying`, `station.bulletins` and (WAIL 101) `station.callers`
  in the shapes `docs/v03/ui.md` reads.
  - These are getters with setters: assigning overrides them, as `ui_v03.js` does, and assigning `null` restores the
    live feed.
  - WAIL's `dj` carries only host lines, since the calls arrive as CALLER lines.
- **Now playing.** `GTP.Audio.radio.nowPlaying()` (wrapped) returns `Title  ·  Artist  ·  <station text>`, or the
  call-in segment on WAIL. The ON AIR line therefore changes with every song.
- **Nap Dynasty ad.** It is on all six stations (`napAd`, `napMinute` = 20). The `ui.js` failure is the test's
  hard-coded count, as above.
- **Play check.** All six stations play on the merged engine. `tests/radio.js` runs each station live in a car (a
  click unlocks audio) and renders all 26 songs offline. The talk station's bumper and murmur cycle, the new song
  sections, the opening headroom (under 0.995) and the song-to-song differences all pass.
- **ui_v03 radio block, run separately.** On WAIL and Pennant it shows `ON AIR: Call Me Maybe Wrong`, `NEWS 14:00`
  and `CALLER: Deb…` as its assertion expects.
