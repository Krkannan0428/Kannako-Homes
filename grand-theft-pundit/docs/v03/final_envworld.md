# Final: environment, world and AI (branch `v03r1/envworld`)

`v03r1/envworld` holds the integration fixes for `js/05_assets.js`, `js/10_render.js`, `js/10b_postfx.js`,
`js/01_config.js`, `js/04_world.js`, `js/20_content_world.js` and `js/07_ai.js`, merged with
`origin/game/grand-theft-pundit` a94bf77. Per-bug detail and the cross-track patches are in `triage_envworld.md`;
the per-preset numbers are in `environment.md` → Performance.

## Fixed
- **Perf**: `tests/perf.js` passes on a quiet machine at **742 sim steps/s** (bar 600; v0.2 726).
  - `World.resolveCapsule` has a tile-byte fast path (82 → 22 ns per call for 82% of calls).
  - Solid-prop colliders are flat typed arrays.
  - The AI step is cheaper: no per-ped 16 m hash query for the car dodge, and no per-step objects.
  - The interiors wrapper is folded into World behind one compare.
  - On a loaded machine these are worth about +10%. The rest of the growth since v0.2 is in other tracks' files (C1, C4, C5, C10).
- **Looks**:
  - Cutscene depth of field: a crisp focal plane with a gentle background blur, cutscenes only.
  - Mission marker: a narrow (< 1 m) light column with a crisp ring that never tints the player or the frame.
  - Before/after: `final_envworld_dof_marker.jpg`.
  - Rain puddles are pools, no longer a half-the-ground speckle.
  - Lamps face the road.
  - Lamp lights fade in and out; entering a car at night no longer freezes the game.
  - Soft scorch marks, a dusk sky with no dark arc, the moon on the moonlight, stars up to the zenith.
  - Roof gravel and sign text are no longer stretched; runway dashes are clean.
  - Far LOD buildings no longer turn darker; no rain under the Loop deck.
  - Trees no longer push into facades.
- **Camera**:
  - It stays out of walls when aiming, out of containers, airliners and the Loop deck, and out of the bus roof.
  - First person no longer sees through walls.
  - It no longer jitters against a fast car (interpolated with the frame).
  - A NaN target no longer breaks it.
  - No pop-in after a teleport; far chunks are unbuilt.
  - Ped and car draw ranges follow the fog.
- **World**:
  - Roads no longer run under the Print Works or into the Manifest Ramp's deck end.
  - Junction boxes are complete; the ferry pier has a district.
  - Containers and hedges collide as boxes; bridge railings are solid.
  - Collision queries are NaN-safe; knocked props stand again on New Game.
  - The six new prop builders are folded into Assets.
- **AI**:
  - No permanent gridlock: 4-minute soaks keep 21-31 of 35-39 cars moving.
  - No swerving at red lights, no wrong-way lanes, no buses into the sea.
  - Parked cars fit their bays and no longer sit inside props.
  - The 5-star helicopter adds no light (no ~1.2 s recompile freeze); its meshes are shared and the rotor fades out as it leaves.
  - Heat, the heli timer, the cruiser quota and the parked-cruiser sirens are fixed; the marchers and guards come back.
  - The mod-shop door works again with the vehicles track's change.

## Tests (combined build, this branch)
| test | result |
|---|---|
| tests/perf.js | PASS (742 steps/s alone; medium draw calls 511, ultra 440) |
| tests/render.js | PASS |
| tests/tune.js | PASS |
| tests/world.js | PASS on the merged build before the last two merges; final re-run pending |
| tests/ai.js | PASS on the merged build before the last two merges; final re-run pending |
| tests/events.js | PASS on the merged build before the last two merges; final re-run pending |
| tests/content_audit.js | PASS (256 files, 0 hits) |
| tests/vehicles.js (not ours) | PASS on this branch, including "the real Spin Doctor door opens the shop once" |

Run them one at a time: with several Playwright files in parallel on 4 cores the perf numbers drop into the 400s.

## Still open
- **Ours:** QAC-20 and QAC-21 (A* steps sideways onto ramp tiles; A* ignores solid props) were not reached. QA-A-DRV-05 leaves a 4 m
  open stretch at the sj_05 end of the hedge maze so the stunt still lands. A car waits indefinitely behind the player
  standing in its lane (v0.2 behaviour). One unsignalled junction at seed 11 (555, 186) needs repeated gridlock breaks
  but clears.
- **Medium at 60 fps on an integrated GPU** cannot be measured here. Per frame on SwiftShader, v0.3 medium costs 1.5x
  v0.2's at 720p and 1.6x at 1080p. If it misses on real hardware, the trims are in `environment.md`.
- **Other sessions** (patches in `triage_envworld.md`): C1 13_interiors hooks (perf), C2 / C5 wrapper removals, C3
  09_missions race vias and a narrower story beacon, C4 08_combat per-step cost, C6 08b_bosses heat rule, C7 11_ui
  bust fine, C8 06c cowering pose, C9 05d bike eye height, C10 14_systems job truck parked in a traffic lane, C11
  ARCHITECTURE.md.
