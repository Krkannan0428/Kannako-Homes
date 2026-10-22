# v0.3 integration round 1: bosses triage

Branch `v03r1/bosses` (from `game/grand-theft-pundit` at 10ba585). Files edited: `js/08b_bosses.js`, `tests/bosses.js`, this file.
Everything below that names another file is a request for that file's owner; nothing outside the two files was changed.

## The failure from the merge log, root-caused

`b01_goldplate ... phases [1] ... dmg {"pistol:goldplate":436}`: the ribbon spools did take hits (kind `'heli'` parts are still
hard-locked and traced by 08_combat.js). What broke was the step after: the merged lock-on (08_combat.js `updateAim`, the
CMB-05 fix) only re-acquires under a **held** aim when a body passes within 6 degrees of the crosshair. The test bot held aim
from the spools (camera pitched up at the helicopter) into the landing, so the landed President was never locked again and
every shot went over his head while he shot back. A player re-presses aim or moves the mouse, so the fix is in the bot
(`tests/bosses.js`): it looks level at a ground target and presses aim again, and when locked on the wrong thing it presses
Tab (`lockOn`) to cycle, as the HUD tip says. The bot also compared `enc.target()` (a `{x, y, z, entity}` wrapper) with
entities, so Dunk's stun logic and Goldplate's stand-off never applied; fixed.

## What changed in js/08b_bosses.js

Content rules (CONTENT_RULES.md says whoever finds a breach fixes it on the spot and reports it; these were in this file):
- **Goldplate (b01)**: the President is never the target. On the ground he is unarmed and reads his ratings off a gold
  teleprompter (a weak point, `bossPart: 'prompter'`), which takes the window's damage into the boss pool (same damage scale
  and window cap as before). A hit on the man shows `NOT THE SUIT. THE TELEPROMPTER.` and does nothing (`def.pedProof`;
  chat-mob allies and the shout skip him too). The arena moved off Goldplate Links (14_systems.js's golf course, x 516..556):
  a president fight on his own golf course with guns reads as a real event (rule 2). New arena: stadium door + (20, 60), the
  park and crossing east of the stadium (water 30 m, buildings 24 m). Real-person verbal tics in his lines ("Many people are
  saying", "Nobody X like me. Nobody.") replaced; the bark "You hit a President" replaced.
- **Dunk (b05)**: fists and counters only (`def.noGuns`): a gun in hand is holstered for the whole fight with a toast, and no
  weapon crate drops. A gun at a campus folding-table debate reads as a real event (rule 2). The content mission already says
  "Bring your fists".
- **Warbanner (b03)**: the ticker and the defeat chyron no longer say the jets "bomb" the PM ("paper" / "bury in press releases").

Fights:
- **Approach state**: a mission's boss objective that starts with the player more than 70 m from the arena (`C.BOSSES.arrive`)
  sets the fight up and waits (`state: 'approach'`, hint `Get to <place>: <boss> is waiting`, the HUD arrow on the arena centre);
  the intro lines and the leash start on arrival. The content's b01 approach (`goto goldplate_tower`) ends about 250 m from the
  arena, so on the combined build the real mission failed "You left the fight" 10 s after the intro.
- **Telegraph grace**: a telegraph that knocks the player down grants `getUp + 0.8 s` before another counts, and brawler adds
  don't swing at a player on the floor. Stacked bars/rain/charges chained knockdowns into deaths on the combined build.
- **Redacted (b04)**: one patch at a time (a phase change could leave an orphan patch that kept spawning more); the vans' 22 m
  lap is pulled in wherever the lot ends (the depot is 16 m from the harbour on the merged map; vans drove into the water);
  tuned for the merged lock-on (goons steal the lock from the patch): agents capped 4/5/5 (was 6), a drop every 10 s (was 9),
  one gunman alive at a time in phase 3, patch hp 110/100/90, bars every 4.8/4.2/3.8 s.
- **Warbanner (b03)** riders thrown off a scooter, and Redacted's van drivers on foot, now brawl (`EP.brawlerBrain`); the
  missions' `swat` brain held 12 m off and never landed a fist.
- **Goldplate's rotor sound** is refreshed every 0.5 s from the helicopter (03_audio.js forgets `Audio.heli` 1.6 s after the
  last call, so the old one-shot call left the helicopter silent; this was qa_d stab-QA-D-09's symptom).
- Boss weak points carry `hostile = true`, so Combat's lock-on ranks them with the goons around them.
- A fight starts with the heat cleared too, not only the stars (a stray round in the last fight's defeat beat left heat under
  the first star; in the full test sequence the player was then busted at Redacted's start and lost their guns), and crimes
  are dropped during the defeat beat as well.
- Back in play from a menu or the pause screen, `Input.latch(['special'])` drops a `special` press made while paused.

UI seams (feature-detected; each stands down once the UI owns it):
- The fallback boss bar and special meters no longer draw under the UI's own (`UI.state.boss` / `UI.state.specials` exist on
  the combined build; both bars drew on top of each other). With the UI's bar, only a shield line is drawn above it
  (`IN THE HELICOPTER (TEN OUT OF TEN)` etc.), until the UI sets `drawsBossShield`. `boss:phase` now also carries `shieldText`.
- The phase banner (`UI.banner(name, 'PHASE n / N')`) is skipped when the UI's bar is there (it announces PHASE n itself).
- `special:state` is not emitted for a locked special (the UI drew a ring for all four on a new game, with the ready-key pill).
- On `boss:end` the UI's bar is cleared (`UI.state.boss = null` when it is this boss) unless `UI.handlesBossEnd` is set: the UI
  has no `boss:end` handler, so a failed or aborted fight left its bar on screen.
- The X-key / Shift fallback for `special` is gone (02_input.js binds `special` to X, Shift + right mouse and L3).
- The `Combat.update` tick wrapper stays (Game.step does not tick the bosses); it stands down if `game.ticksBosses` is set.

Kept as is:
- **Scooters stay class `bike`** (the scooter mesh). The vehicles track's `moto` is the "Hot Take 600" sport bike, which
  doesn't read as a "Defense Scooter", and its thrown-rider path (06b `throwRider`) would leave a thrown guard idle and count
  a throw as a wreck. If 06b adds a scooter family, `_scooter` in b03 is the one line to change (keep a `C.VEHICLES[type]`
  guard: an unknown type silently becomes a sedan).

## Requests for other files

### js/11_ui.js (ui)
1. **Weak-point labels.** `drawScope` (≈1041) and the lock-on label (≈3849) hardcode `'WEATHER BALLOON'` for kind `'heli'`, so
   every spool, speaker, scooter, patch, teleprompter and talking point says WEATHER BALLOON. Patch both:
   `tg.kind === 'heli' ? (tg.label || 'WEATHER BALLOON') : ...`
2. **Minimap.** `copBlips` (≈585) pushes every kind `'heli'` entity; skip boss parts:
   `if (e.kind === 'heli') { if (!e.bossPart) out.push({ x: e.x, z: e.z, kind: 'heli' }); continue; }`
3. **`boss:end`.** Clear the bar when a fight ends without a defeat, then set `handlesBossEnd: true` on `GTP.UI` (08b stops
   clearing it):
   `Ev.on('boss:end', function (e) { if (ui.boss && (!e || ui.boss.id === e.id)) ui.boss = null; });`
4. **Shield state.** `bossPhase` ignores `shield` / `shieldText` / `hint`. Keep `b.shield = !!e.shield; b.shieldText =
   e.shieldText || null;`, grey the bar and draw the text under it while shielded, then set `drawsBossShield: true` (08b's
   caption stands down).
5. Optional: `special:state.unlocked` is ignored; harmless now that 08b no longer reports locked specials. The debate's
   `params.boss` / `params.vs` (portraits) are unused.

### js/08_combat.js (combat)
1. **Re-lock after a target goes down under a held aim.** When a locked target goes down or is removed, the held aim only
   re-acquires within 6 degrees of the crosshair. After a hard lock on a helicopter-kind target the camera is pitched up, so
   the next target (the landed boss, the goon beside you) is never taken. Proposed, in `updateAim`:
   ```js
   var lost = cur && (cur.removed || cur.down || cur.alive === false);
   if (cur && !lockValid(p, cur, cd, reachFor(cur, range))) { if (lost) aim.lostT = simT(); cur = null; }
   var relock = !cur && aim.lostT && simT() - aim.lostT < 0.6 && settings.aimAssist;
   if ((rising && settings.aimAssist) || cycle || relock) { aim.lostT = 0; /* ...the rising-press cone pick, unchanged... */ }
   ```
2. **Hit radius.** `trace` uses a fixed 3.4 m sphere for kind `'heli'`. A per-entity radius would let small weak points be
   honest: `raySphere(o, d, e.x, e.y, e.z, e.hitRadius || 3.4, bestT)` (08b would set `hitRadius` on parts).
3. **Crime for boss parts.** `hitEntity` charges `wd.crime('attackCop', 'shootHeli')` for any kind `'heli'`; skip `e.bossPart`
   (08b's `AI.wanted.crime` wrapper could then go).
4. Side bug found while reading (not bosses): `aimContext`'s AI branch recomputes `ped.aimYaw`, overwriting the cops' tier-4
   miss nudge from 07_ai.js `copShoot` (≈1364), so the nudge has no effect.

### js/30_game.js / js/09_missions.js (story)
1. **Tick the bosses in Game.step.** After `Combat.update(dt)`: `if (GTP.Bosses) GTP.Bosses.update(dt); if (GTP.Specials)
   GTP.Specials.update(dt);` and set `game.ticksBosses = true`; 08b's wrapper then only installs.
2. **A checkpoint API.** 08b refreshes the phase checkpoint by editing `Missions.debug.run().checkpoint.player` in place
   (`EP.checkpoint`). A public `Missions.refreshCheckpoint(patch)` (merge into the current snapshot) would replace that.
   08b already calls `Missions.checkpoint(info)` if it exists.
3. `tests/missions.js:73` expects 17 / 25 missions; the six boss missions make it 61 (stale expectation in merge1_all.log:237).

### js/25_content_parity.js (content; no v0.3 owner per qa_b.md)
1. **Approach targets.** b01 goes to `goldplate_tower` (about 250 m from the arena) and b06 to the `stadium` door (112 m from
   its arena). 08b now waits for the player (approach state), but the goto should end at the fight:
   `{ type: 'goto', target: GTP.Bosses.arenaTarget('b01_goldplate'), radius: 40, text: 'Get to the park east of the stadium' }`
   and the same with `'b06_panel'` (`text: 'Get to the outdoor set west of the stadium'`).
2. **CONTENT_RULES 2/4, b01.** The mission text frames the fight on the golf course ("sand trap", "bunker", the putter
   reward). With a president archetype and guns that maps onto a real event; the fight has moved off the course and he is no
   longer a target. Please drop the golf framing from b01's lines and reward (a human should decide on the reward).
3. **Text vs the fights.** b01 says "four ribbon spools" (3 / 4 / 5); b02 "Six of them blow" (4 / 4 / 3 speakers); b03 calls the
   jet "a cutout on a truck" that ends "in the sea", and "forty" scooters (3 / 2 / 0); b05 says Dunk plays "shove, slam, flip"
   (his cards are DIDN'T READ / RATIO / QUOTE POST / BLOCKED) at "nine tables" (five); b06 promises "five rounds... five waves of
   the audience" (3 debates, 2 waves of Security).
4. QA-B-TXT-12 (Warbanner's debate cards drop his tic) is in `Content.debate.opponents.panel`, the deck b06 uses.

### js/03_audio.js (vehicles/audio)
- The seen-boss list resets on `load:begin`, `mission:fail(ed)`, `failed`, `player:wasted`, not on `boss:end`: a fight that
  ended (leash, abort, test) and starts again plays `bossPhase` or nothing instead of `bossStinger`. Add `'boss:end'` to that
  list (≈970).

### QA items that reach boss fights (open, not 08b's)
- qa_b QA-B-TCH-05: Escape/Backspace in the debate plays DEFINE TERMS (`11_ui.js` ≈2502, `02_input.js` Escape → `back`). b06's
  debate rounds are affected.
- qa_b QA-B-TCH-06: no SHOUT in the debate on a gamepad (`11_ui.js` ≈2584 reads `run`; PAD_MENU has none).
- qa_d pers-QA-SAVE-14: no pause/mute/quit during a debate (`11_ui.js` 'minigame' input case). If a pause is added, 08b's b06
  cleanup only resets when `g.state === 'minigame'`; tell me and I'll handle the paused case.
- Fixed elsewhere and checked against 08b: QA-C1-01 (melee cooldown; 08b's brawlers have their own), QA-C1-02 (retry armed
  after QUIT; 08b's resume point is only armed on a matching `mission:retry`), QA-STR-01 (death ends a non-mission fight).
- stab-QA-D-09 (helicopter rotor silent): fixed in 08b for the gold helicopter (see above).

## Tests

`NODE_PATH=/opt/node-tools/node_modules node tests/bosses.js` (about 4 minutes; `ONLY=b04_redacted`, `ONLY=rules`, etc.).
New section `rules`: the far start waits in `approach` with an arrow and starts on arrival; the landed President is unarmed,
takes no damage, his teleprompter does and is the target; Dunk holsters a gun and drops no weapon crate.
