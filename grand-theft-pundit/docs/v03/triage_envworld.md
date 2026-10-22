# Integration round 1, environment + world + AI (branch v03r1/envworld): work in progress

Paused by request. Nothing in the game code has changed yet; this file holds what was found so far.

## perf.js "simulation keeps up (>600 steps/s)": first measurements
Headless run of 30 s with the player running, seed 7, per-subsystem wall time in ms. These were measured
while the full suite ran, so the numbers are noisy; compare them with each other, not as absolutes.

| subsystem | v0.2 (ea6a035) | merged (10ba585) |
|---|---|---|
| Entities.update | 1770 | 2727 |
| AI.update | 437 | 747 |
| Combat.update | 115 | 246 |
| Hints.update | 5 | 48 |
| steps/s | 726 | 451 |

Leads in the CPU profile:
- The interiors wrapper `Wd.resolveCapsule` (js/13_interiors.js:954) adds roughly 270 ms of collision cost.
  World.resolveCapsule is called about 310 times per step, and the wrapper seems to stop V8 inlining it into
  `_collideWorld`. Plan: fold the room check into js/04_world.js with a cheap `x < -3000` gate that calls
  `GTP.Interiors.roomAt` (already exposed), and ask the combat session to skip `wrapWorld` when World handles it.
- js/06b_vehicles_air_sea.js `VP.update` router and the `E.update` wrapper (fleetTick, ambientTick) cost about 250 ms.
- js/08_combat.js `fillPose` costs about 90 ms.
- js/07_ai.js `AI.update` grew from 98 to 131 ms self time.

## Next steps
1. Fold the interiors wrapper into World and profile AI.update again.
2. Triage the QA bugs whose hint names my files. About 75 match: qa_a TRF/CAM/GEO/DRV/VIS/NGT/ENT, qa_c
   QAC-01..57, qa_d stab-01/03/04/08/09, and the qa_r1 items the world and environment tracks already marked fixed.
3. Do the per-preset perf comparison against v0.2, look at district screenshots, then run the full suite.

Baseline full suite on 10ba585, partial run before the pause: actors.js FAIL (crash damage, not my file), ai.js PASS, artifact.js PASS.
