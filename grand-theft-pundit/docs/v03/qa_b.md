# QA-B: play-test of the v0.3 base, and the new-player acceptance test

Track qa-b (branch `v03/qa-b`). Base under test: `game/grand-theft-pundit` at 3a5252c (v0.2 plus the v0.3 stubs).
No game code or existing test was edited. This track owns `docs/v03/qa_b.json`, this file, `tests/regress/qa_b_*.js` and
`tests/newplayer.js`.

## What was done

- **Two lenses, five passes.** Each pass played the base in Playwright (SwiftShader) with real inputs and looked at every
  screenshot:
  - UI and input, split three ways:
    - front end, menus, saves and settings (`FE`);
    - HUD, minimap, map, hints, day and night (`HUD`);
    - touch at 400x800 and 1024x768, the shop, the weapon wheel, the phone and the minigames (`TCH`).
  - Content and tone: every player-visible string in `js/2x`, the UI and the texture text (`TXT`).
  - Onboarding: the first ten minutes of a new player (`NP`).
- **Bug standard.** Every bug was reproduced twice: two runs, or two seeds or viewports; for text bugs, the string plus the
  code path that shows it. None repeats an entry in `qa_r1_bugs.json`.
- **Duplicates merged.** Four bugs found by two lenses were merged:
  - FE-06 into HUD-01;
  - FE-12 into TXT-01;
  - TCH-14 into FE-02;
  - TCH-15 into HUD-09.
- **Content audit.** `node tests/content_audit.js` is green (0 hits). TXT-15 lists gaps in its banned-term list; nothing
  in the game hits them today.

## Counts

**65 bugs: 3 high, 31 medium, 31 low.** The full records are in `docs/v03/qa_b.json`, which uses the same shape as
`qa_r1_bugs.json`. Each `hint` names the file and line to change; it also names the regression test where one exists.

| Lens | High | Medium | Low |
|---|---|---|---|
| FE (front end, input) | 1 | 6 | 9 |
| HUD (HUD, map, hints) | 0 | 5 | 8 |
| TCH (touch, shop, wheel, phone, minigames) | 1 | 11 | 2 |
| TXT (content and tone) | 0 | 6 | 9 |
| NP (onboarding) | 1 | 3 | 3 |

### The worst five

1. **QA-B-FE-01 (high), lose a save by double-clicking.** Double-clicking OVERWRITE or DELETE on a slot card destroys the
   save. The confirmation's destructive button opens under the pointer and is pre-selected by hover, so the second click
   confirms.
2. **QA-B-TCH-01 (high), trapped in the map on touch.** On a touch screen the map / phone page cannot be closed: it has
   no close control, and the MAP and PAUSE buttons disappear while it is open. One tap on MAP leaves a phone player stuck.
3. **QA-B-NP-02 (high), the next mission is invisible on the minimap.** The minimap's Home icon is drawn over m01_van's
   blue light (they are 0.0 m apart). After Table Stakes, a new player sees no next mission.
4. **QA-B-TCH-04 (medium), Enter abandons the mission.** Enter, Space or pad A on the phone's STATS or STRANDS tab
   abandons the running mission without asking. Stale MISSIONS rows stay live, and confirm activates ABORT.
5. **QA-B-FE-05 (medium), pad players can't skip or retry.** A and B do nothing on dialogue, cutscene skip and the
   CONTEXT STAMPED card, though the prompts name them. A pad-only player can never skip a cutscene or choose RETRY.

The next tier for integration:
- **Mouse:** TCH-03 (one click activates twice: an unselected shop row is bought) and FE-02 (a resting pointer takes
  over the keyboard and pad selection).
- **Dialogue:** TXT-01 (the dialogue box drops the opening of long story lines).
- **HUD:** HUD-03 (the objective arrow vanishes under the minimap) and NP-03 (pickups have no minimap blips during
  m01_van's 150 s timer).
- **Input:** FE-03 and FE-04 (Enter and Backspace are double-bound to "exit car" and "reverse").

### Who owns the fixes (by the file in each hint)

| Track | Bugs |
|---|---|
| **ui** (`11_ui.js`, `02_input.js`) | most FE, HUD and TCH bugs; NP-01, NP-05; TXT-06, TXT-07, TXT-14 (slot-prompt plurals) |
| **story** (`09_missions.js`, `12_cutscenes.js`, `30_game.js`) | NP-02 (marker order), NP-03, NP-04, FE-08, FE-16, TXT-04, HUD-12; the cutscene side of FE-05, FE-07, TCH-02 |
| **shooting** (`08_combat.js`) | TCH-07, TCH-13 (shop feedback) |
| **radio** (`23_content_radio.js`) | TXT-11 |
| **integration** | `22_content_missions.js` and `24_content_expansion.js` dialogue lines have no v0.3 owner (content may edit only the `requires` arrays): TXT-01 (line length), TXT-02, TXT-03, TXT-05, TXT-09, TXT-12, TXT-13, NP-06, NP-07 |
| **test infra** | TXT-15 (content-audit term list) |

## Regression tests

There are 37 tests in `tests/regress/qa_b_*.js`. Each one **fails while its bug is present** and passes once the bug is
fixed.
- **On the base:** all 37 are open (run 2026-10-20).
- **Browser tests:** `fe_*`, `hud_*`, `np_*` and `tch_*` take 10–40 s each.
- **Node-only:** `txt_*` run without a browser.

| File | Purpose |
|---|---|
| `qa_b_lib_load.js` | Loads the content files in a vm sandbox (used by the `txt_*` tests). |
| `qa_b_lib_fe.js` | Boots the real title; provides a fake gamepad (used by the `fe_*` tests). |
| `qa_b_lib_v03mock.js` | The new-player test's v0.3 stand-in (below). Not a test. |
| `qa_b_all.js` | Runs all of them and prints OPEN / FIXED per file. |

```
cd grand-theft-pundit
NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_all.js          # all, about 10 minutes
NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_all.js tch      # a subset by name
NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_fe_01.js        # one
node tests/regress/qa_b_txt_02.js                                              # node-only content checks
```

A note on TXT-10 (spelling consistency): its test assumes US spelling. If the team picks British spelling instead, flip
the test.

## tests/newplayer.js: the v0.3 bar as a test

```
cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/newplayer.js
#   NEWPLAYER_SEED=<int> (7)   NEWPLAYER_BUDGET=<s> (600)   NEWPLAYER_VERBOSE=1   NEWPLAYER_MOCK=1 (see below)
```

**How it plays.**
- **Start.** A non-headless boot with `localStorage` cleared shows the loading screen and title, and the test presses
  Enter on NEW GAME. From there the simulation is stepped with `GTP.game.advance`, and simulated time counts from the
  Enter press.
- **Inputs.** Only `GTP.Input.set` (keys) and `GTP.Input.setLook` (mouse look). No teleports, no debug API, no direct
  `Missions.start`.
- **What it reads (what the screen shows):**
  - the objective text and the HUD arrow (`Missions.hud()`, `Missions.objectiveTarget()`);
  - minimap blips (`Missions.allMarkers()`) and Both Sides Arms store blips;
  - the GPS line (`gps:set` and `GTP.World.route`), and `GTP.Story.next()`;
  - dialogue boxes (confirm after about a second of reading);
  - cutscenes (skipped with the HOLD TO SKIP pill), debate cards (answered by the counter key shown);
  - the CONTEXT STAMPED card (RETRY, at most twice);
  - the pause menu (Esc, SAVE, slot, confirm);
  - a ringing phone (confirm).
- **Moving.**
  - **Walking:** mouse-look toward the next route point, with forward and run held. When stuck it jumps, sidesteps, and
    detours to open ground.
  - **Driving:** pulse steering with A/D, a speed target that drops for corners, and easing off for anything in the lane
    ahead. When stuck it reverses with opposite lock, and it hops out for a blip it cannot reach by van.
- **Feature detection.** Each v0.3 feature is detected, so a missing one is reported as a failed step with the reason,
  never a crash:
  - `GTP.Story`, `GTP.World.route`, `gps:set`, `phone:call`;
  - `m01c_both_sides`, `GTP.Interiors` (interior kind `armory`);
  - range targets (`GTP.Interiors.range.targets`, `current.targets`, or meshes tagged `userData.rangeTarget`), `range:end`;
  - the armory list (`GTP.UI.state.armory.items/sel`), with `GTP.Combat.catalog/buy` as a fallback that only warns;
  - the held-gun mesh (a visible descendant of the player model with `userData.weaponId === player.weapon`, on screen);
  - `player.pose.aim`, the `cover` input action and `cover:enter`.
- **Fallbacks.** When a step fails, the run keeps going so later steps still get measured: it walks into the blue light
  if the story does not start by itself, and uses its own path search if there is no GPS line. A step reached through a
  fallback stays FAIL.
- **Output.**
  - Exit 0 only when all 12 steps pass.
  - Screenshots `tests/out/newplayer_<n>_<step>.png` and `tests/out/newplayer_report.json` (steps, events, notes,
    warnings, the in-page log).

### What the integrating tracks must expose for the test to see them

| Feature | What the test needs |
|---|---|
| Story start | The first mission starts by itself after New Game (`mission:start` within 60 s). |
| GPS | `GTP.World.route(ax, az, bx, bz)` returns `[{x, z}]`; or `GTP.Story.next()` returns `{missionId, x, z}`. |
| Armory | Entering sets `GTP.Interiors.active` and `GTP.Interiors.current = {id, kind:'armory', store}`. |
| Visible gun | The held weapon mesh has `userData.weaponId` (the model or shooting track). |
| Cover | The `cover` action is in `GTP.Input.actions`, pressed next to a wall emits `cover:enter`. |
| Aim | `player.aiming` is true and `player.pose.aim` is not false while aim is held. |

The PLAN asks for each of these; these are the exact names the test checks.

### Current step report on the base (seed 7, 2026-10-20)

```
 1 PASS title       Title menu shows NEW GAME; Enter starts a new game          (0.4 s real to playable)
 2 FAIL story_1min  no mission starts by itself within 60 s (GTP.Story missing, no gps:set); the player stands in an
                    un-armed blue light with no objective on screen
 3 FAIL gps_first   "Get to Dorm 4B" reached only with the test's own path search: no GPS route
                    (GTP.World.route missing, gps:set never emitted)
 4 PASS m00         m00_intro completed in 31 s (fallback: walked out of and back into the light)
 5 PASS m01_van     m01_van completed in 158-190 s
 6 FAIL m01c        m01c_both_sides is not registered (content track)
 7 FAIL armory      GTP.Interiors missing (interiors track); the door opens the old shop overlay
 8 FAIL pistol      not in the armory; no pistol owned; no held-weapon mesh tagged under the player model
 9 FAIL aim         no pistol in hand
10 FAIL cover       no `cover` input action (shooting / ui tracks)
11 PASS save        saved to slot 1 from the pause menu
12 FAIL ten_min     ~360-390 s simulated; steps missing: story_1min, gps_first, m01c, armory, pistol, aim, cover
```

### Checking the test itself before integration

`NEWPLAYER_MOCK=1` injects `tests/regress/qa_b_lib_v03mock.js`, a crude fake of the v0.3 surfaces:
- a road `World.route`, `Story.next` and `gps:set`;
- an auto-starting m00, and a test `m01c` with a goto to the shop door that then gives a pistol;
- an `Interiors` that turns active at a store door;
- a tagged pistol mesh, and a `cover` action.

With the mock, steps 1–9 and 11 pass (the run on 2026-10-20). The test's own range and buy handlers are not exercised,
because the mock's m01c has only a goto.

Two things to watch after integration:
- **The m01_van drive** is the slowest and most variable part: 160–270 s, sometimes one RETRY on the 150 s battery
  timer, depending on traffic. If the run goes over 600 s after integration, read the log (`NEWPLAYER_VERBOSE=1`) before
  blaming the game.
- **The mock's cover check** only fires within 1.8 m of a wall. One mock run (1.3 m at the time) missed it; the real
  cover is the shooting track's.

## Notes for integration

- The bar is not met on the base, by design. The new-player test fails at:
  - the story start (story),
  - the GPS (world / ui),
  - m01c (content),
  - the armory (interiors),
  - the held gun (models / shooting),
  - cover (shooting / ui).
- **QA-C1-07** (r1) still bites the first minute: the first New Game skips the opening and spawns the player inside an
  un-armed m00 light. The test steps out and back in, as a lost player would after a while.
- **Dialogue lines in `22`/`24` have no v0.3 owner.** The content-tone fixes in them (TXT-01, 02, 03, 05, 09, 12, 13,
  NP-06, NP-07) need an owner at integration.
