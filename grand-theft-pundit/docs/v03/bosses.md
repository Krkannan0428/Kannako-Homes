# v0.3 bosses track: notes for integration

Branch `v03/bosses`, file `js/08b_bosses.js` (new), test `tests/bosses.js` (new). Nothing else was edited.

## What was built

### GTP.Bosses: six boss encounters

Every fight has three phases (the panel has five), readable telegraphs, adds, a mechanic that is not just
damage, dialogue and barks as data (`GTP.Bosses.defs[id].lines` / `.barks` / `.hints` / `.ticker`), a phase
checkpoint, and a humiliating defeat. Nobody dies: a boss ped's damage goes into the encounter's own hp pool
(`ped.applyDamage` is replaced on that ped), the ped is never killed, and the defeat is a slump (head down,
arms limp), a RATIO'D sign over the head, a ticker line and a walk-off ("LOGGED OFF").

| id | arena (default) | the mechanic | adds | telegraphs |
|---|---|---|---|---|
| `b01_goldplate` | Goldplate Links, `stadium` door + (-40, 30) | the gold helicopter is untouchable; shoot the gold **ribbon spools** hanging under it (3 / 4 / 5); with all cut the ribbon fouls the rotor, it lands and the President steps out for a 14 s window (capped at 56 damage, so two landings a phase at least) | interns (phase 2), a Gold Detail cop (phase 3) | RATING RUN strips along its heading, GOLD RAIN circles |
| `b02_velvetine` | The Afterparty, `afterparty_yacht` door + (-10, 10) | the Baron is "listening" (no damage) while a **speaker stack** stands; wreck them (4 / 4 / 3, on carts in phase 3) to expose him for 16 s; the roadies rebuild | bouncers | each speaker's SILENT DROP is an expanding ring: jump it; champagne TOAST circles (faster when exposed) |
| `b03_warbanner` | Runway 10/10, `airport_runway` door + (0, 26) | the PM narrates behind a PRESS PASS while **Defense Scooters** run; wreck them (shoot, ram, or lure them under the jets, which wreck scooters too); phase 2 he rides one himself (wreck it, hit him while he is down); phase 3 on foot | Bravadian guards on scooters, then on foot | SCOOTER CHARGE lines, INCOMING: THE JETS (PROBABLY) strips (crossing in phase 3) with the jet streaking over |
| `b04_redacted` | Weather Balloon Repair Depot lot, `balloon_depot` door + (50, 10) | only the black **[REDACTED] patch** on the balloon takes damage; it orbits the envelope and goes [CLASSIFIED] (grey) on a beat it flashes before; each pop deflates a stage (3 / 4 / 4 pops) | OVA vans lap the lot and drop agents (wreck a van to stop it for 25 s) | [REDACTED] bars (rectangles) on the player |
| `b05_dunk` | Founders' Quad, `campus_quad` door + (0, -20) | **counter his cards**: DIDN'T READ (a charge down a flashing line: step out or jump, he trips: STUNNED), RATIO (a ring: jump it as it passes: LEFT ON READ), QUOTE POST (two reply guys: drop both in 10 s: NO REPLIES, else he heals), BLOCKED (guard up: hitting him bounces you; hold off and he is OVERCOMMITTED). Hits outside a stun do a quarter; a stun takes full damage capped at 55 a window | reply guys | the charge strip, the ratio ring |
| `b06_panel` | outdoor panel set beside the stadium, `stadium` door + (-40, -20) | **debate rounds** (the UI's debate minigame via `GTP.UI.startMinigame('debate', params, done)`: a loss costs 18 hp and the round restarts) alternate with **combat waves** of the subscribers' security; each won round ratios its panelists; the last is ONE MEMO against all five. Without `UI.startMinigame` the round is an in-world "take duel" (break four orbiting talking points in 30 s) | security waves (two pushes each) | MONDAY MEMO page circles |

Arena centres were chosen with a probe: open, walkable, off the Loop decks and at least 30 m from mission and
strand markers (a rampage bubble's light washed out the first Goldplate arena). `opts.at` or the objective's
`at` overrides them.

**Travel stage.** A boss objective that starts with the player more than 70 m from its arena waits in state
`travel`: the set is already up (the gold helicopter circles its golf course), the HUD arrow and the hint
(`defs[id].travel`, e.g. "Follow the gold helicopter to Goldplate Links") point at the arena, there is no leash and
no crime suppression, and the intro opens when the player comes within 45 m. The content track's approaches end at
the landmark doors (`b01` under Goldplate Tower, 208 m from the Links; the others within 14 to 51 m).

Every phase start leaves a health crate, an ammo crate for the gun in hand (a pistol otherwise) and, from
phase 2, an armor crate beside the arena. While a fight runs (intro, fight, the beat between phases) the
wanted level is held at zero and any stars the player arrives with are cleared: a boss fight is a set piece.

### GTP.Specials: four specials with meters

| id | trigger | effect | meter | unlocked by |
|---|---|---|---|---|
| `focus` | `special` while aiming on foot (toggle) | `game.timeScale = 0.4` | drains over 6 real seconds, refills in 40 s | `m03b_range` or `flags.special_focus` |
| `shout` | a tap of `special` on foot (released under 0.35 s) | WELL, ACTUALLY!: every ped within 9 m is knocked down and pushed (8 damage to hostiles; 1 heat when a civilian is hit); breaks Dunk's BLOCKED card | full meter, refills in 22 s | `m03_ratio` |
| `chatmob` | hold `special` 0.6 s on foot | three invulnerable chat allies with signs (FIRST, W TAKE, RATIO) fight the nearest hostile or boss for 20 s, then log off | full meter, refills in 45 s | `b01_goldplate` |
| `boost` | hold `special` while driving | forward thrust to 1.35x the car's top speed, flames at the back | drains in 3 s, refills in 12 s | `m08_scooters` |

Landing hits tops every meter up a little (1.2%, 3.6% on a kill). The meters save through `GTP.SaveRegistry`
(`specials: {meters}`) or, without it, `GTP.SaveHooks`.

## Interfaces exposed

```js
GTP.Bosses.spawn(id, {at:{x,z}, mission:bool, phase:n}) -> encounter | null
GTP.Bosses.get(id?), list(), end(id, reason), endAll(reason), update(dt), hud(), target()
GTP.Bosses.arena(id) -> {x, y, z, landmark}            // the resolved centre
GTP.Bosses.arenaTarget(id) -> {landmark, offset, metres:true}   // drop into an approach objective's target
GTP.Bosses.defs[id]       // {name, cast, title, arena, maxHp, thresholds, lines:{intro, p2, p3, ..., defeat}, barks, hints, ticker, ...}
GTP.Bosses.ids, cards (Dunk's four), objective (the handler), objectiveMode ('registered' | 'fallback'), resumeInfo()
GTP.Bosses.debug = { encounter(), skipPhase(), breakParts(kind), resolveDebate(win), telegraphs(), clearResume() }
encounter.hud() -> {id, name, castId, color, phase, phases, hp, maxHp, shield, shieldText, state, hint, card, telegraphs}
encounter.state: 'intro' | 'fight' | 'break' | 'defeated' | 'done' | 'failed' | 'ended'

GTP.Specials.state() -> {focus|shout|chatmob|boost: {id, name, meter, active, unlocked}}
GTP.Specials.trigger(id), stop(id), unlock(id), unlocked(id), allies(), clear(), reset(), update(dt), meters, K (= GTP.C.SPECIALS)
GTP.C.BOSSES, GTP.C.SPECIALS   // tunables
```

The objective: `{type:'boss', bossId, at?: target, text}`. It spawns the encounter, its `hint` follows the
fight (the HUD's hint line), its `target` is the current thing to hit (the HUD arrow), it completes when the
defeat lines are over and fails (`failReason` is the sentence) when the player leaves the arena for 10 s
(150 m, 170 m on the runway). Suggested content shape for the six boss missions:

```js
objectives: [
  { type: 'goto', target: GTP.Bosses.arenaTarget('b01_goldplate'), radius: 200, text: 'Get to Goldplate Links' },
  { type: 'boss', bossId: 'b01_goldplate', text: 'Ground the gold helicopter' }
]
```

(`GTP.Bosses` is defined before the content files load, so `arenaTarget` can be called from content data, or the
landmark + offset can be copied from the table above.)

## Events

Emitted: `boss:start {id, name, phases, resumed}`, `boss:phase {id, phase, phases, hp, maxHp, name, shield,
state, hint}` (every phase change, every shield change, and on damage at most every 0.1 s), `boss:defeated {id,
name}`, `boss:end {id, reason}`, `boss:bark {id, who, text}`, `boss:hit {id, dmg, shape}` (a telegraph landed on
the player), `boss:counter {id, why}` (a Dunk counter), `special:state {id, meter, active, unlocked, name}`
(every 1% meter step, toggle and unlock), `special:focus {on}`, `special:shout {n}`, `special:chatmob
{allies}`, `special:boost {on}`, and the cartoon `damage` event for boss peds (with `boss: id`).

Consumed: `mission:objective` (fallback), `mission:start`, `mission:retry`, `mission:abort`, `hitmarker`
(meter gain), `player:respawn`, `player:wasted` (a fight outside a mission ends), `state` (Focus and the defeat
slow motion stop outside play), `loaded` and `load:begin` (every fight ends, the specials clear, the meters stay),
`load:progress` (installers).

Flags written: `flags.boss_<id>` on a defeat; `flags.special_<id>` by `Specials.unlock`. Stats:
`player.stats.bossesDefeated`, `player.stats.chatmobs`.

## Interfaces consumed (all feature-detected)

`GTP.Missions.registerObjectiveType` (story track; absent on this branch, so the fallback runs),
`Missions.say` (phase lines go through the dialogue queue, the fight pauses), `Missions.debug.run()` (the
fallback handler swap, the checkpoint refresh), `Missions.checkpoint(info)` if the story track adds one,
`Missions.resolvePoint`, `GTP.UI.startMinigame / endMinigame / banner / ticker / toast / advanceDialogue`,
`GTP.AI.say`, `GTP.AI.wanted`, `GTP.Combat.fire / spawnPickup / WEAPONS`, `GTP.SaveRegistry` or
`GTP.SaveHooks`, `GTP.Input.down / pressed('special')`, `GTP.Audio.play / heli`, `GTP.Render.scene / fx /
rig.shake`, `GTP.GeoBuilder`, `GTP.Assets.propMaterial`.

## Wrappers installed on other modules (fold these in at integration)

**Integration round 1 status (merged build):** wrapper 2 does not install (the story track's
`registerObjectiveType` exists; the boss type also sits in `GTP.ObjectiveTypes.boss` for `Missions.init`); the
fallback HUD in wrapper 4 stands down (the ui track's state carries `boss` and `specials`); wrapper 5 stands down
(`02_input.js` binds `special` to Shift + right mouse, X and L3). Wrappers 1, 3 and 6 remain.

1. **`GTP.Combat.update`** is wrapped at load time (Combat loads first): after the original it runs
   `Bosses.update(dt)` and `Specials.update(dt)`, both of which only act in state `playing`. Integration:
   call both from `Game.step` after `Combat.update` and drop the wrapper.
2. **`GTP.Missions.start` and `registerTest`** are wrapped **only when `registerObjectiveType` is missing**:
   a mission's `{type:'boss'}` objectives are rewritten to an inert `dialogue` with no lines (`_boss` keeps the
   id) and on `mission:objective` the running objective's handler is swapped for `GTP.Bosses.objective`
   through `Missions.debug.run()`. With the story track's `registerObjectiveType` none of this installs.
3. **`GTP.AI.wanted.crime` and `addHeat`** drop crimes while a fight is in `intro`, `fight` or `break`. Boss
   weak points are entities of kind `'heli'` (the only non-ped, non-vehicle kind Combat's hitscan, lock-on,
   rockets and blasts reach), so without this every shot at a spool would be the `shootHeli` crime.
4. **`GTP.UI.draw`** draws a fallback boss bar (bottom centre: name, phase, hp with the phase ticks, the shield
   text or the hint) and the special meters (bottom left), unless `GTP.UI.drawsBossBar` / `GTP.UI.drawsSpecials`
   is true. The ui track sets those once it draws its own from `boss:phase` / `special:state`.
5. A `keydown` / `keyup` listener on `window` for **X** acts as `special` while no input binding names
   `special`; with no binding, Shift while aiming also toggles Focus (silently when it is locked). Both stand
   down once `GTP.Input` has the action.
6. The specials meters register as `GTP.SaveRegistry.specials` (or a `GTP.SaveHooks` entry `specials`).

### Asks for the other tracks

- **ui** (still open on the merged build): the lock reticle labels boss weak points WEATHER BALLOON
  (`11_ui.js` around lines 1041 and 3849: `tg.kind === 'heli' ? 'WEATHER BALLOON'`); use `tg.label` when
  `tg.bossPart` is set (`spool`, `speaker`, `patch`, `scooter`, `talkingpoint`), and skip `bossPart` entities in the
  minimap's helicopter crosses (around line 567). Done: the boss bar from `boss:phase`, the meters from
  `special:state`, the `special` binding. The debate params carry `boss: 'b06_panel'` and `vs: [castIds]`.
- **vehicles (audio)**: stingers on `boss:start`, `boss:phase` (a new phase), `boss:defeated`; special sounds
  on `special:focus {on}`, `special:shout`, `special:chatmob`, `special:boost {on}`; `boss:hit` is a good thud.
- **content**: the six boss missions (`objectives:[..., {type:'boss', bossId}]`); the table above has the
  arena for each approach objective.
- **systems**: an achievement per `boss:defeated` (or one for all six through `flags.boss_<id>`), and one for
  the first `special:chatmob`.

## Decisions

- Phases end at hp thresholds; the boss bar is one bar with ticks. The mechanic gates the damage (a shield
  while the spools, speakers or scooters stand; the patch is the only hittable thing on the balloon; Dunk takes
  a quarter outside a stun) and window caps make each phase take at least two openings on the bosses where one
  good window would otherwise end it.
- Brawler adds (fists) run this file's brain: they wind up for 0.45 s before every swing and take a 1.2 to
  1.9 s breather after; the missions' hostile brain (a punch every 0.4 s each) made three of them lethal in
  seconds. Ranged adds keep the missions' hostile brain.
- Telegraph damage is 10 to 22 with 1.25 to 2.6 s of warning; a ring is avoided by being airborne as it passes
  (a jump), circles and strips by stepping out. A player in a car takes the hit on the car.
- Phase lines go through the mission dialogue queue (the world pauses), so every phase change reads as a beat.
- Retry: each phase start (2+) rewrites the mission checkpoint's player record (position, at least 75% hp, the
  weapons and ammo as they are) and remembers the phase; RETRY of that mission resumes the boss there with the
  hp at the phase's top. A fresh start or a restart begins at phase 1.
- A won fight leaves the set (rigs, the humiliated cast) up for the outro and clears it 40 s later or once the
  player is 180 m away. Its wrecks and a scooter the player rides off on become ordinary city vehicles.
- Lifecycle: a new game (detected by `load:begin` and by the player object changing under a fight), a load, an
  abort or the player's death outside a mission ends the encounter and removes everything it added (entities,
  scene objects, owned geometries and label materials). Boss vehicles brake between phases and after the fight.
  The defeat's 0.45x slow motion (not in headless) plays before the defeat lines, never under them.

- Scooters stay the `bike` class: the game's own Defense Scooter (`m08_scooters`, `22_content_missions.js`) is a
  `bike`, so the boss's scooters match it; the vehicles track's `moto` is the Hot Take 600 motorbike.
- Attacks aimed at the player (rating runs, gold rain, toasts, redaction bars, memo pages, the jets) wait while the
  player is knocked down, so a knockdown never chains into the next volley; the redaction bars stagger (no knockdown).

## Tests

```
cd grand-theft-pundit
NODE_PATH=/opt/node-tools/node_modules node tests/bosses.js            # ~80 s
ONLY=b05_dunk NODE_PATH=/opt/node-tools/node_modules node tests/bosses.js   # one boss (or: content, checkpoint, specials, lifecycle)
node tests/content_audit.js
```

`tests/bosses.js` registers a test mission per boss (`{type:'boss'}` through the real objective path) and
plays it with a bot on real inputs: it faces the boss's current target and presses aim (the shooting track's assist
grabs a target within 20 degrees on the press, then steers the camera in yaw and pitch, so the bot leaves the
camera alone while the lock holds), switches to a gun when it holds fists or a thrown weapon, the move keys step out of armed circles and strips, `jump` clears incoming rings, it fights
adds within 8 m, picks up crates when hurt, counters Dunk's cards with fists, wins the debate minigame after
2.7 s, and takes RETRY when it dies. It asserts every phase is reported by `boss:phase`, `boss:defeated`, the
mission completes within 6 minutes of play, no errors, and the boss is humiliated, not dead. Then the
checkpoint (die in Goldplate's phase 2, RETRY resumes phase 2 at 200 hp in the arena), and all four specials
(locked at first, shout knocks peds down, chat mob calls three allies that hit a goon and log off, focus slows
time and toggles off, boost outruns plain throttle 33.7 vs 13.8 m/s in 1.5 s, the X fallback key, `special:state`
shape), and the lifecycle regressions an adversarial review turned up (spools cut while the helicopter takes off,
a fight outside a mission ending on death, wrecks cleared, vehicles parked between phases, a new game clearing a
running fight down to zero boss entities and scene objects, Focus stopped by a minigame, the X key ignored while
paused), a far start waiting in `travel`, and the content track's six boss missions end to end (`Missions.prep`,
the approach objectives forced through, the walk to the arena as a teleport, the fight by the bot, the mission's
own dialogue and outro, MISSION PASSED). Screenshots: `tests/out/boss_<id>_p1.png` (the set piece from a free camera) and `_p2.png` (a later
phase from the chase camera).

Last run on the merged build (seed 7): all six test fights and all six content missions passed, each boss in 60 to
215 s of simulated play with 0 or 1 retries. See `docs/v03/triage_bosses.md` for the full-suite run. The bot aims perfectly through the lock-on and dodges every armed telegraph, so a first-time player
will take longer and take more hits; each phase hands out health (and armor from phase 2) and RETRY resumes at
the phase.

## Known issues

- On this branch the UI labels weak points WEATHER BALLOON (its label for kind `'heli'`) and the minimap draws
  them as helicopter crosses (see the asks above).
- Weak points use Combat's fixed 3.4 m hit sphere for kind `'heli'`: generous on purpose, but a shot that
  grazes a spool's neighbour counts for the neighbour.
- `focus` only slows the wall-clock loop (`game.timeScale`); `advance()` in headless ignores it, so tests check
  the flag and the drain.
- Headless timing, not real timing: the debate rounds are resolved by the test after 2.7 s.
