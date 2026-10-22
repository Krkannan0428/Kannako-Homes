# Strangers: final round (v0.3.0)

Branch `v03/strangers`, with `origin/game/grand-theft-pundit` at 10ba585 (all seventeen tracks) merged. Files owned and
edited: `js/26_content_strangers.js`, `tests/strangers.js`, `docs/v03/strangers.md`, this file and
`docs/v03/triage_strangers.md`. No other file was touched. Design, interfaces and decisions are in `docs/v03/strangers.md`.

## What the track ships

Ten "Strangers and Freaks" side strands, 26 missions, each strand with an invented eccentric at a home light, two or three
missions built from existing objective types, intro and outro dialogue, rewards ($33,000 in total plus subscribers), an
unlock tied to a story flag and an epilogue ticker line. Homes: `campus_quad`, `impression_alley`, `nap_depot`,
`fulcrum`, `goldplate_links`, `hoa_hall`, `memo_press`, `afterparty_yacht`, `airport_terminal`, `heirloom_club` (ten
districts; the port is visited by three strands).

## Fixed this round

- **`st_ghost_1` and `st_proof_1` markers did not start their missions** (the round-1 failure). `st_ghost_1`: the systems
  track's business property `biz_green_room` sits on the Green Room door with the same 1.9 m / 0.5 s trigger as a mission
  light; walking into Marisol's light opened the property purchase modal, which turned the player's control off.
  `st_proof_1`: my test's unlock step started and aborted `m12_memo` with `Missions.prep`, which teleported the player onto
  the `safe_dorm` property marker at Gus's Garage; the modal it opened stayed up and froze the next walk. Fixes: Marisol's
  home moved to `impression_alley`; the test now marks the story chain done without any teleport; the schema check fails
  on any property, shop or `World.doors` trigger within 4 m of a home light.
- **Registration matches the integrated runtime**: the story track merges `GTP.Content.strangers.missions` natively, so
  the load-time push into `Content.expansion.missions` is gone; `Story.order()` / `next()` skip the strangers (asserted).
- **No double blips or rows in the UI**: `GTP.Strangers.markers()` / `list()` return `[]` because the strand missions
  already appear as ordinary missions; feeding the UI's stranger paths drew every light twice and listed each mission two
  or three times, with a GPS button that replaced the objective route mid-mission. The data moved to `blips()` /
  `strandRows()` for a future strand overview.
- **No story light on a home door that can be lit at the same time**: Gasp moved from `listening_room` (`m07_listen`) to
  `nap_depot`; Captain Brine from `velvetine_pier` (boss `b02_velvetine` unlocks on the same mission) to
  `afterparty_yacht`. One reviewed exception remains (below). The test enforces the rule.
- **Gameplay bugs found on the integrated build**: the Final Ruling's survive wave used live HOA patrol peds, which the
  city AI got back when the wave ended and which then busted the player during the outro (now the board's volunteer
  enforcers); `st_gasp_2` had no `vehicle_lost:jumpcar`, so a wrecked stunt car hung the mission; the sports car's launch
  on the new vehicle physics needed `minAir: 0.8`; Rutherford now boards any car after the jump (three hard landings can
  leave the taxi unboardable); the HOA appeal SUV's tag `hoasuv` clashed with the HOA Patrol strand's SUV (now
  `appealsuv`); two minigame opponents had their win and lose lines swapped; a second Kip stood at the marker while the
  passenger Kip rode along; Marisol's line about the listener now matches where the runtime spawns him.
- **Test driver made player-like** (no assertion was relaxed): the unlock step uses no teleports; approaches and walk-ins
  start on pavement, not in the road (a police car ran the player over once); every mission starts at full health;
  escapes at two or more stars use a respray (a hiding player at full health was shot dead at two stars); stunt run-ups
  are the measured working distances; a badly damaged car is swapped when any car will do. Any death, bust, retry or forced
  objective in a mission run is a test failure.

How the fixes were found: a stub comparison of every failing test (`docs/v03/triage_strangers.md`), a read-only
four-lens review of the module against the integrated runtime with two adversarial verifiers per finding (14 findings
upheld, 1 split, 2 refuted; every upheld one is fixed above), and measured probes of the stunt ramps on the new physics.

## Test results (final, on the merged 10ba585 build)

- `tests/strangers.js`: **PASS** (136 s). Schema (ten strands, 26 missions, every id resolves, all eleven districts,
  only existing objective types, DAG, unlock flags, no shared trigger or story light on a home door), a new game shows no
  stranger light, then all 26 missions started by walking into their light (26 of 26) and driven through the real
  objective checks: 0 retries, 0 forced objectives, 0 deaths or busts, every reward and flag, ten epilogues, replay,
  the phone's completed list, the save, `GTP.errors` empty.
- `tests/content_audit.js`: **PASS** (238 files, 0 hits).
- `tests/all.js` on the branch: 13 of 32 files pass; `strangers.js` failed in that run on `st_gasp_2`'s jump and is fixed
  (above); the other 18 failures all reproduce with the strangers module stubbed out, with the same assertions, and
  belong to other tracks: see `docs/v03/triage_strangers.md`, which also has the root cause and a verified one-line test fix
  for the `strands.js` race start (a systems property modal left open under the player, the same family as `st_ghost_1`).

## Still open

- **Moira's Quad and boss `b05_dunk`** share the `campus_quad` door. Both lights are lit at once only if Local 404 is left
  untouched from Act I to Act III; the runtime then nudges one light 4 m. Every campus door hosts a story light or a shop /
  safehouse trigger, so this stays as the one listed exception in the test.
- **Counts of "all missions" (other owners)**: `tests/missions.js` (17 or 25) and `tests/campaign.js:758` (25) assert
  `allMissions().length`, which is 35 without the strangers and 61 with them; the phone's MISSIONS header and the save
  summary's `missionsTotal` count side missions too. Filter on `kind === 'stranger'` / `side` or count `Story.order()`.
- **`tests/feel.js`** asserts the lit lights after m00..m02 are exactly `m03_ratio`; with the strangers Moira's
  `st_heckle_1` is lit by design (unlock `m02_read`), and the parity track's `m01c_both_sides` is lit without them. The
  check should compare story lights only (story owner).
- **No intro cutscenes** for stranger missions (the engine's over-the-shoulder two-shot plays); a strand overview tab can
  read `GTP.Strangers.strandRows()` / `blips()` if the UI wants one.
- **AI note for the world / story owners**: a tail target walking from the stadium door toward Vaultwright Manor can wedge
  at the stadium door; the caddie's tail avoids it.
