# v0.3 final: bosses (js/08b_bosses.js, tests/bosses.js)

Branch `v03r1/bosses`, from `game/grand-theft-pundit` at 10ba585 (the base had not moved at the final push, so there was
nothing to merge). Details, decisions and the patches requested from other files: `docs/v03/triage_bosses.md`.

## Fixed

- **The merge-log failure** (`b01_goldplate ... phases [1]`): the spools did take hits; the merged lock-on only re-acquires a
  held aim within 6 degrees of the crosshair, so the test bot never locked the landed President. Bot fixed (re-press aim,
  look level, Tab to cycle, the `enc.target()` wrapper unwrapped, a per-boss `reaimAt`).
- **Content rules** (fixed in this file, flagged for a human in triage):
  - Goldplate: the arena is off the golf course;
  - he is unarmed on the ground and his gold teleprompter takes the hits, he never does;
  - real-person verbal tics are gone from his lines;
  - Dunk is fists only, enforced at `Combat.fire`;
  - Warbanner's jets no longer "bomb" the PM.
- **Approach state**: a mission's fight waits for the player (arrow and hint on the arena) instead of failing the leash. The
  content's Goldplate approach ends about 250 m out.
- **Fairness**: after a telegraph knockdown the player gets up before the next one counts, and brawlers don't hit a downed
  player. Fights start with stars and heat cleared, again on arrival, and no crimes count during the defeat beat.
- **Redacted**:
  - one patch at a time;
  - the vans lap on land (the depot is on the harbour);
  - fewer agents, one gunman at a time;
  - patch hp 110/100/90.
- **Warbanner / Redacted riders and drivers on foot** brawl instead of standing 12 m off.
- **Gold helicopter rotor sound** is kept up while it flies, winds down after the defeat, and yields to the police helicopter.
- **UI seams**:
  - no duplicate boss bar, meters or phase banner under the UI's own; only a shield line above its bar;
  - no rings for locked specials;
  - the UI's bar clears on `boss:end`;
  - the X-key fallback is removed (Input binds `special`).
- **Sibling branches** (trial-merged `v03r1/combat`, `v03r1/story` and `v03r1/envworld` onto this branch, not pushed):
  - `Bosses.fighting()` is exposed for 07_ai.js's heat stamps;
  - weak points carry `hitRadius` for combat's per-entity hit sphere. Without it, Redacted failed and Warbanner took three
    retries on the trial merge.
  - Combat's native step hook marks `Combat.update._bosses`, so this file's tick wrapper stands down and nothing ticks twice.
- **Scooters** stay class `bike`: the `moto` is a sport bike with a thrown-rider path that leaves guards idle.

## Still open (other owners; patches in triage_bosses.md)

- **ui (11_ui.js)**:
  - weak points are labelled WEATHER BALLOON (should read `entity.label`) and show on the minimap's helicopter X;
  - `boss:end` and the shield state aren't handled (08b covers both from its side until the UI sets `handlesBossEnd` /
    `drawsBossShield`).
- **combat**: re-lock after a hard-locked target goes down is on `v03r1/combat` ("hop off a downed hard lock"); no crime for
  hitting a boss part. 08b's wrapper on `AI.wanted.crime` still covers it.
- **story**: Game.step ticking the bosses is done on `v03r1/combat` instead (fine). A public checkpoint API is still wanted;
  08b edits `Missions.debug.run().checkpoint` in place.
- **content (25_content_parity.js, no owner)**:
  - point the b01 and b06 approach goals at `GTP.Bosses.arenaTarget(id)`;
  - drop the golf framing and the putter reward from b01 (a human decision);
  - mission text doesn't match the fights (spool, speaker and table counts; Dunk's cards; the Panel's rounds).
- **audio**: reset the boss stinger on `boss:end`.
- **QA, debate minigame** (b06): Escape plays DEFINE TERMS; no gamepad SHOUT; no pause during a debate.
- **Balance to watch**:
  - Warbanner is the hardest fight for the bot on the trial merge (3 retries, mostly the guards' and the PM's pistols in
    phase 3). If the merged combat makes AI shots land more, its phase 3 cadence (`bossShoot` 2.4 to 2.8 s) is the knob.
  - The bot aims perfectly through the lock-on, so first-time players will take longer; every phase hands out health
    (armor from phase 2), and RETRY resumes at the phase.

## Test results

- `tests/bosses.js` on `v03r1/bosses` (seed 7, all six in one page): PASS.

  | Fight | Play time | hp lost |
  |---|---|---|
  | Goldplate | 149 s | 52 |
  | Velvetine | 149 s | 5 |
  | Warbanner | 124 s | 121 |
  | Redacted | 124 s | 34 |
  | Dunk | 119 s | 0 |
  | Panel | 65 s | 80 |

  No retries. The rules, checkpoint, specials and lifecycle sections pass.
- `tests/bosses.js` on a trial merge of this branch with `v03r1/combat`, `v03r1/story` and `v03r1/envworld`: PASS.

  | Fight | Play time | Retries |
  |---|---|---|
  | Goldplate | 129 s | 0 |
  | Velvetine | 139 s | 0 |
  | Warbanner | 179 s | 3 |
  | Redacted | 234 s | 1 |
  | Dunk | 89 s | 0 |
  | Panel | 70 s | 0 |

- `tests/content_audit.js`: OK (238 files, 0 hits). `tests/smoke.js`: PASS.
- `tests/systems.js` (achievement/cheat counts) and `tests/ui_v03.js` (mod shop) fail as in `docs/v03/merge1_all_b.log`,
  not through 08b.

Run: `cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/bosses.js` (about 2 minutes; `ONLY=b04_redacted`,
`ONLY=rules,checkpoint,specials,lifecycle` for parts).
