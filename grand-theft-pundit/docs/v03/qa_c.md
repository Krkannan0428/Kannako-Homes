# QA-C: engine review of the v0.3 base

Reviewed `game/grand-theft-pundit` at `3a5252c` (read-only). The full records are in `docs/v03/qa_c.json`: id,
severity, area, file:line, evidence, impact and fix. Each finding was checked before it was recorded. 43 of the 57
were reproduced in headless Chromium (SwiftShader) or node, and the other 14 were checked by reading the code. Every
finding is new: none repeats `qa_r1_bugs.json`.

**57 findings: 0 critical, 4 high, 25 medium, 28 low.**

| Area | High | Medium | Low |
|---|---|---|---|
| memory (leaks, retained GPU data) | 1 | 4 | 3 |
| correctness | 3 | 12 | 11 |
| performance | 0 | 3 | 4 |
| robustness | 0 | 4 | 8 |
| security (desktop build, CI) | 0 | 2 | 2 |

## How it was reviewed

- Ten reviewers split `js/`, `desktop/` and the CI workflows by module. Every finding was then deduplicated: the
  ped-geometry cache, the projectile sphere and the weapon-mesh leak were each found two or three times.
- **Long session:** `tests/regress/qa_c_soak.js` runs 20 game minutes with full AI. Every minute the player
  teleports across the map, starts and aborts a story mission, blows up three cars, takes 3-5 stars, dies and
  respawns, and runs around; a frame is rendered every 2 s.
- **Robustness:** `tests/regress/qa_c_robust.js` covers blocked localStorage, a full storage quota, WebGL context
  loss and restore, the real frame loop driven at 240/144/60/30/20/10 Hz, a 30 s hidden tab, and 160x120 and
  3840x2160 windows.

### Soak results (seed 7, 20 game minutes)

| minute | entities | scene objects | chunks | geometries | textures | programs | JS heap MB |
|---|---|---|---|---|---|---|---|
| 0 | 232 | 2491 | 54 | 169 | 31 | 20 | 38 |
| 3 | 245 | 3267 | 130 | 902 | 95 | 45 | 104 |
| 7 | 246 | 3821 | 195 | 1534 | 131 | 48 | 158 |
| 14 | 247 | 3829 | 195 | 2143 | 137 | 49 | 220 |
| 20 | 251 | 3877 | 195 | 2513 | 137 | 49 | 256 |

What stayed flat:
- Entities, scene objects, fx and spatial hash cells.
- `GTP.Events` listeners and DOM listeners (net 0 added).
- Timers, and `GTP.errors` (0).

What does not stay flat:
- Chunks are never unloaded (QAC-10).
- After minute 7, with every chunk already built, geometries still grow by about 75 a minute and the heap by about
  8 MB a minute. A creation-site trace put all of that on ped look geometry (QAC-01), with smaller per-use leaks on
  top (QAC-07/08/09). At this rate a two-hour session holds about 9,000 GPU geometries.

### Robustness results

The browser shell holds up:
- **Storage:** with storage blocked or full the game boots, and saves fail softly with autosave turned off.
- **WebGL context:** a lost and restored context renders a real picture again with no errors.
- **Frame rate:** 240, 144, 60 and 30 Hz all advance exactly 60 steps per second.
- **Hidden tab:** coming back after 30 s runs at most 5 steps (MAX_STEPS).
- **Window size:** tiny and 4K windows keep a finite camera and the right aspect.

The weak spots are smaller:
- Below 12 fps the game runs in slow motion (QAC-53).
- Engine, siren and rotor loops keep sounding in a hidden tab (QAC-27).
- Very wide canvases go black at medium quality and up (QAC-26).
- One NaN position poisons the camera for good (QAC-28).

## Fix first (top ten)

1. **QAC-01 (high, memory) `js/05_assets.js:1006`: the ped geometry cache grows without bound.** `pedGeo` keys
   merged torso, arm and head geometry by every look field (colours, hair, hat, glasses, extra) and never evicts.
   Each new rolled look uploads new geometry. This is the main leak in the soak (about 75 geometries and 8 MB a
   minute). Fix: build parts in neutral colours and tint per ped through vertex or instance colour, or reference-count
   the entries and dispose them when no ped uses them. Test: `qa_c_pedgeo.js`.
2. **QAC-04 (high) `js/11_ui.js:3288` + `:2368`: every menu mouse click is handled twice.**
   - One click on BUY buys twice ($120 for a $60 item).
   - The same root cause makes Ratio War spend two posts per click (QAC-18).
   - Settings toggles and MUTE flip twice, so they can't be changed with a mouse; QUALITY and DRAW DISTANCE skip
     every other value (QAC-19).
   - Fix: handle a click in one place, either the mousedown listener or the step's `pressed('shoot')` branch.
   - Test: `qa_c_QAC-04.js`.
3. **QAC-03 (high) `js/09_missions.js:989`: abort or fail keeps the weapon an `equip` objective handed out.**
   `run.equipped` is recorded but never read back. Start and abort of m13b farms Ratio Launcher ammo 0 → 6 → 12 →
   18 → 24 (cap 7), and m12b does the same for the sniper. Fix: in `teardownRun`, take back what `run.equipped`
   gave unless the mission passed. Test: `qa_c_QAC-03.js`.
4. **QAC-02 (high) `js/07_ai.js:278`: the heat throttle stamps `heatT` survive New Game and Load.** Game time
   restarts at 0, so after a long session assaults earn no heat until the clock catches up. Fix: reset `heatT` in
   `AI.reset`, or store the stamps relative to the session. Test: `qa_c_QAC-02.js`.
5. **QAC-07, QAC-08, QAC-09 (medium, memory): GPU geometry created per use and never disposed.**
   - Held-weapon meshes for the hot mic and Ratio Launcher: 30 switches leave 30 geometries.
   - Every thrown projectile's `SphereGeometry`: 10 hot takes leave 9.
   - Pickup label planes and materials: 10 removed weapon crates leave 42.
   - Fix: share these geometries as `userData.shared`, or dispose them in `Render.detach`.
   - Test: `qa_c_gpuleaks.js`.
6. **QAC-10 (medium, memory) `js/10_render.js:709-735`: static chunks are never unbuilt.** One sweep of the map
   leaves all 196 chunks, about 1M vertices and roughly 44 MB, loaded for the session, plus 100+ textures. Fix: unbuild
   and dispose chunks beyond drawDistance plus a margin, with hysteresis.
7. **QAC-14 / QAC-15 / QAC-16 (medium) `js/09_missions.js`: missions leave state behind.**
   - Abort during `escape_wanted` keeps the mission's 2-5 stars.
   - RETRY spawns a second copy of the checkpoint car every time: 10 retries left 9 cars stacked at the checkpoint.
   - RESTART during a Ratio Rampage hands the previous game's weapons to the new player.
8. **QAC-11 (medium) `js/12_cutscenes.js:412`: dying during a cutscene leaves it running through WASTED.** The
   letterbox and camera stay on, and the old wanted stars are restored after the respawn. Fix: end or skip the
   cutscene on player death and on state changes.
9. **QAC-05 / QAC-06 / QAC-29 (medium, security): the desktop build and its CI.**
   - The packaged Electron app sets no fuses: RunAsNode, NODE_OPTIONS and `--inspect` are enabled and asar integrity
     is off.
   - The release workflow gives `contents: write` to every job, including the `npm ci` build jobs, and pins
     `action-gh-release` by tag instead of commit.
   - `will-navigate` allows any `file://` URL: dropping a file on the window replaces the game, and a dropped page
     can read and overwrite the save slots.
   - Note: `js/` itself has no `eval`, `new Function` or `innerHTML`; the save loader doesn't pollute prototypes; and
     the Electron window settings (contextIsolation, sandbox, no nodeIntegration, permissions, window-open) are
     correct.
10. **QAC-23 / QAC-24 / QAC-25 (medium, performance): frame hitches and repeated work.**
    - The five-star helicopter's `SpotLight` recompiles every lit material: a 731 ms first frame and +16 shader
      programs.
    - A weather transition repaints and re-uploads the sky texture every frame for 40 s.
    - The waypoint route reruns A* (up to 20,000 expansions) every 2 s, even while paused: 7-10 ms a time when the
      waypoint is unreachable.

## The rest, by module

- **World (04):**
  - A* steps onto Loop ramps from the side wall (QAC-20).
  - Paths go head-on into props (QAC-21).
  - Knocked-over props survive Restart and Load (QAC-22).
  - Billboards are 9x9 m from a duplicate `h` key (QAC-45).
  - A capsule at a prop's exact centre gets no push-out (QAC-56).
  - NaN passes through the collision queries (QAC-57).
- **Game and core (00, 30):**
  - Load drops the saved height, so a save on the Loop deck loads under it (QAC-13).
  - The wanted level is not saved (QAC-41).
  - `Events.off` called inside `emit` skips the next listener (QAC-40).
  - Input during the loading screen is queued (QAC-51).
  - `?clock=abc` breaks boot (QAC-52).
  - One bad `%` escape drops the URL parameters after it (QAC-54).
  - Below 12 fps the game runs in slow motion (QAC-53).
- **Render, PostFX and assets (10, 10b, 05):**
  - The camera is not interpolated with the render alpha, causing judder on 120 Hz+ screens (QAC-17).
  - PostFX targets go past MAX_TEXTURE_SIZE (QAC-26).
  - A NaN camera never recovers (QAC-28).
  - Normal maps stay loaded after stepping down to Low (QAC-33).
  - The sky reflection map is not rebuilt after context restore (QAC-50).
  - Per-frame garbage in the camera rig (QAC-49).
- **AI (07):**
  - The helicopter mesh is never disposed (QAC-32).
  - Driverless cruisers count toward the quota (QAC-35).
  - Protest marchers and precinct guards vanish between 220 and 280 m (QAC-36).
  - The heli respawn timer survives New Game (QAC-37).
  - About 2,400 objects allocated per second in the traffic loops (QAC-46).
- **Entities (06):** about 600 objects allocated per physics step (QAC-48).
- **Missions and strands (09):**
  - Strand drivers stay persistent for good (QAC-34).
  - Loading inside a strand vehicle duplicates it (QAC-42).
- **Audio and cutscenes (03, 12):**
  - Cutscene radio music is never audible (QAC-12).
  - Engine and siren loops keep playing in a hidden tab (QAC-27).
  - N protesters collapse into one (QAC-38).
  - The placard mesh is not rebuilt (QAC-39).
  - The radio still builds notes at music volume 0 (QAC-47).
- **UI (11):**
  - Tiny windows break the click mapping (QAC-55).
  - Title animations are tied to the frame rate (QAC-44).
- **Desktop and CI:**
  - The tag name is pasted unquoted into a bash script (QAC-30).
  - There is no CSP (QAC-31).
  - Mod errors are invisible to mod authors (QAC-43).

## Notes for the v0.3 tracks

v0.3 adds the following, and each one multiplies the leak patterns above:
- Clothing ids in the look, which makes QAC-01's cache key bigger.
- 32 weapon meshes.
- Interiors built from primitives.
- Boss set pieces.
- `rebuildEntityMesh`.

Every new mesh path should:
- mark geometry it shares as `userData.shared`, and dispose everything else when the entity is detached;
- never add real lights to the scene at run time (QAC-23 pattern);
- reset any module-level state in the module's `reset()` (QAC-02 pattern).

## Tests (`tests/regress/`)

Run each with `cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/<file>`.

| File | Covers | Today |
|---|---|---|
| `qa_c_soak.js` | 20-minute growth of entities, objects, geometries, textures, programs, listeners and heap (`SOAK_MIN=5` for a quick run) | fails |
| `qa_c_pedgeo.js` | QAC-01 | fails |
| `qa_c_gpuleaks.js` | QAC-07, 08, 09 | fails |
| `qa_c_QAC-02.js` | heat after New Game | fails |
| `qa_c_QAC-03.js` | equip loaner farming | fails |
| `qa_c_QAC-04.js` | one click, one purchase (QAC-18 and QAC-19 share the root cause) | fails |
| `qa_c_robust.js` | storage, context loss, refresh rates, hidden tab, window sizes | passes (guard) |
