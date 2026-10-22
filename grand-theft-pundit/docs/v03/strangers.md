# v0.3 track: strangers

Branch `v03/strangers`. Owns `js/26_content_strangers.js` and `tests/strangers.js`. No other file was edited.

## What was built

Ten side-mission strands in the GTA "Strangers and Freaks" mould: ten invented eccentrics of the outrage economy, each
with a home marker at an existing landmark, two or three missions (26 in total) built only from existing objective
types, intro and outro dialogue in the GDD voice, rewards (money, subscribers through `reward x 5`, a finale `subs`
bonus), an unlock tied to a story progress flag, and an epilogue ticker line when the strand is finished.

| strand id | name | eccentric (cast id) | home (district) | unlock (flag) | missions | mechanics |
|---|---|---|---|---|---|---|
| `heckle_union` | Local 404 | Moira Cutoff, shop steward of the Amalgamated Hecklers (`moira`) | `campus_quad` (campus) | `m02_read` (`sponsored`) | `st_heckle_1..3` | bare-knuckle fight (`defeat` with `weapon: 'fist'`), ratio war, picket `survive`, wreck the scab bus, one star, union car + Kip passenger, debate vs Management |
| `ghostwriter` | Ghost Notes | Marisol Echo-Venn, ghostwriter for podcasts that do not exist (`marisol`) | `impression_alley` (downtown) | `m04_hit` (`a_voice`) | `st_ghost_1..3` | timed pickups + drive, on-foot tail of the only listener, a fight, an inline race to the Listening Room |
| `reaction_face` | Mouth Open | Gasp Haverly, professional thumbnail reaction face (`gasp`) | `nap_depot` (strip) | `m03b_range` (`range_trained`) | `st_gasp_1..3` | timed three-stop drive, stunt jump `sj_02`, two stars, wreck three vans, ratio war |
| `daylight` | Daylight Savings | Thaddeus Wainscot, think-tank intern who has never seen daylight (`thaddeus`) | `fulcrum` (capitol) | `m05_peer` (`contract_sold`) | `st_day_1..3` | passenger ride to the sky, `collect_any` 5 of 7 under a timer, a fight, a long timed drive to the runway, two ramming SUVs |
| `caddie` | Put Me Down for a Ten | Lyle Bunkerton, the President's caddie (`lyle`) | `goldplate_links` (hills) | `m06_rally` (`show_renamed`) | `st_caddie_1..3` | tail the rogue scorekeeper to the bridge dead drop, pickup, scooter race (podium place 3), table-leg-only fight (`equip` + `weapon`), pickup, drive |
| `hoa_appeals` | Appeal Pending | Dewey Varnum-Pleat, live-streams his HOA appeals (`dewey`) | `hoa_hall` (suburbs) | `m10_pellets` (`hoa_enemy`) | `st_hoa_1..3` | timed pickups + goto, one star, `stop_vehicle` on a fleeing HOA SUV, pickup at the tag, passenger to the Capitol, debate vs the Board, survive the board's volunteer enforcers |
| `proofreader` | The Second L | Ottoline Kerning, Monday Memo proofreader (`ottoline`) | `memo_press` (industrial) | `m12_memo` (`knows_memo`) | `st_proof_1..2` | truck pickups in the port container maze, drive back, timed wreck of four driving vans, ratio war vs House Style, three stars |
| `fresh_takes` | Catch of the Day | Captain Mortimer Brine, fishmonger of takes (`brine`) | `afterparty_yacht` (marina) | `m07b_ferry` (`ferry_friend`) | `st_brine_1..2` | timed van pickups on Manifest Quay (port) + drive back, the revolver (`equip`), wreck three trucks, two stars |
| `standby` | Now Boarding | Rutherford Standby, six years on standby (`rutherford`) | `airport_terminal` (airport) | `m08b_jets` (`jets_arrived`) | `st_standby_1..2` | timed three-gate taxi drive, stunt jump `sj_09` (port), passenger ride to the ferry |
| `apology` | Not as Such | Cornelius Ashby-Ledger IV, heir who would like to apologise (`cornelius`) | `heirloom_club` (uptown) | `m13_thursday` (`survived_thursday`) | `st_apology_1..2` | `stop_vehicle` on the lawyers' sedan, pickup at the tag, three stars, passenger to the museum, a fight, debate vs family counsel |

Ten homes in ten districts; port (the eleventh) is visited by the proofreader, the fishmonger and the standby passenger.
Rewards total $33,000 across the 26 missions, rising with the story act (Act I strands $400-1,500 a mission,
Act III $1,500-2,800). Weapons given or required are only ones the story has already unlocked by the strand's unlock
point (fists, the table leg after m03b, the revolver after m05b), so the GDD unlock order is untouched.

Supporting cast added: `listener` (Lenny Autoplay), `scorer` (Dot Tallymark), and opponents with portraits
`clause` (Prudence Clause), `hoa_board`, `family_counsel` (debate), `scab_heckler`, `smirk` (Rex Smirkwell),
`house_style` (ratio). All names are invented; `node tests/content_audit.js` passes.

## Decisions

- **Registration** (integration round 1): `GTP.Missions.allMissions()` merges `GTP.Content.strangers.missions` natively
  as side missions (`docs/v03/story.md`), so this file no longer appends anything to `Content.expansion.missions`. The
  blue-light markers, the giver and Kip at the door, the intro two-shot, the phone, REPLAY, RETRY, best times, rewards,
  subscribers and the save pick them up; `Story.order()` / `next()` skip them (asserted). Cast and minigame opponents
  are still merged here into `GTP.Content.cast`, `GTP.Content.debate.opponents` and `GTP.Content.ratio.opponents`
  (nobody else does it) without overwriting an existing id.
- **Home lights never share a spot** with another track's trigger or another mission's light:
  - the systems track's business properties sit on the `green_room`, `strip_gas` and `fish_shack` doors with the same
    1.9 m / 0.5 s trigger, so walking into Marisol's light at the Green Room opened the property purchase modal and took
    control away (the round-1 `st_ghost_1` failure; `st_proof_1` was my test's unlock step teleporting onto the
    `safe_dorm` property marker). Marisol moved to `impression_alley` (she writes on the bench under the billboards);
  - a story light on the same door that can be lit at the same time puts two blue lights 4 m apart (the runtime's nudge):
    Gasp moved from `listening_room` (`m07_listen`) to `nap_depot` (her mattress-thumbnail showroom; `m02_read`, its only
    story light, is always done before her unlock), and Captain Brine from `velvetine_pier` (`b02_velvetine` unlocks on the
    same mission, `m07b_ferry`) to `afterparty_yacht` (he fishes off the Baron's stern; Day-Old Dan's trucks are back on the
    pier);
  - one reviewed exception: Moira's `campus_quad` is also boss `b05_dunk`'s light (Act III). They overlap only if Local 404 is
    left untouched from Act I to Act III, and every campus door hosts a story light or a shop / safehouse trigger.
  - `tests/strangers.js` fails on any `GTP.Systems.markers()`, shop or `World.doors` trigger within 4 m of a home door, and on
    any non-stranger mission light on a home door that is not a prerequisite of the strand's unlock (exception listed).
- **No live HOA patrol peds in a survive wave**: on the integrated build a `survive` wave of the AI `hoa` role hands its
  patrol peds back to the city AI when the objective ends, and with `hoa_enemy` set they bust the player during the
  outro. The Final Ruling wave is the board's volunteer enforcers (thugs and protesters) instead.
- **Unlock = requires + flag**: the runtime's `available()` reads only `requires`, so each strand's first mission
  requires exactly the story mission whose `onComplete` sets the named flag (`unlock: {mission, flag}` on the mission and
  the strand). The test asserts the pair agrees. Later strand missions require the previous one only.
- **Stamps for other tracks**: every stranger mission carries `side: true`, `kind: 'stranger'`, `strand`, `strandName`
  and `act`, so the story track's `GTP.Story.next()`, chapter cards and mission counters can filter them out.
- **Giver as passenger**: when a `deliver_passenger` (or `follow`) objective's ped is the mission's own giver, the
  runtime removes the released giver ped from the kerb as the objective starts, so the eccentric is not standing at the
  door twice (a `mission:objective` listener in my file).
- **Epilogue**: on `mission:complete` of a strand's last mission (not a replay) the line goes to `GTP.UI.ticker`, a
  toast says STRAND COMPLETE, flag `stranger_<id>` is set and `strangers:epilogue {id, name, line, giver}` is emitted.
- **Stunts**: measured all ten ramps with every car class flat out from 25/45/70 m run-ups. `sj_06` (Span Skip) and
  `sj_08` (Hangar Hop) land every car class about 10-15 m past the wedge whatever the speed (something solid sits in
  the flight path; only the bike clears sj_06), so the strands use `sj_02` (sports car, 45 m flat out: 31 m/s, 1.18 s,
  in zone) and `sj_09` (taxi, 45-50 m flat out: 24-25 m/s, 0.95 s; the objective sets `minAir: 0.8`). On the
  integrated physics (vehicles track) the sports car leaves `sj_02` at 22-32 m/s from 20-50 m (0.88-1.23 s, in zone), so
  `st_gasp_2` also uses `minAir: 0.8`; a wrecked stunt car fails the mission (`vehicle_lost:jumpcar`). The world track's
  round-2 build lands all ten ramps in zone in tests/world.js, so the sj_06 / sj_08 note is closed.
- **Rutherford rides in any car** after the jump: three hard landings can leave the taxi too battered to board, so the
  pickup takes `vehicle: 'any'` and losing the taxi after the stunt is no failure (the tagNeeded rule).
- **Race places**: the ghostwriter race wants 1st; the caddie's scooter race wants 3rd ("third is a ten"), so a bike
  against the sports-car field is fair.

## Interfaces

Exposed:
- `GTP.Content.strangers = { version, cast, debate, ratio, strands, missions }`
- `GTP.Content.strangerIds` (the ten giver cast ids)
- `GTP.Strangers = { list(), markers(), blips(), strandRows(), strands(), strand(id), missions(id), status(id), summary(), homes(), epilogue(id), strandOf(missionId), flagged(id) }`;
  `list()` and `markers()` return `[]` on purpose: 11_ui.js draws a purple blip from `markers()` and a phone row from `list()`,
  but the strand missions already show as ordinary missions (blue light, MISSIONS rows, GPS), so feeding those paths drew every
  stranger light twice and listed it two or three times, with a GPS button that replaced the objective route mid-mission
  (`docs/v03/ui.md`: "if the strangers register as Missions ..., the existing mission paths show them"). The data is kept for
  a future strand overview: `strandRows()` `[{id, title, name, giver, castName, status, line, x, z, missionId, done, total}]`
  (x/z only while the strand is available) and `blips()` `[{id, x, z, y, title, giver, missionId}]` at the live mission light,
  `[]` while a mission runs. `strands()` returns the strand records;
  `status()` is `{id, name, giver, home, district, blurb, state: 'locked'|'available'|'active'|'done', done, total, next, unlock, epilogue}`;
  `homes()` is `[{id, strand, name, giver, landmark, x, z, state, color}]`
- event `strangers:epilogue {id, name, line, giver}`; flags `st_<mission id>` and `stranger_<strand id>`

Consumed (all feature-detected): `GTP.Content.cast`, `GTP.Content.debate/ratio.opponents`,
`GTP.Content.opponentIds`, `GTP.Events` (`mission:objective`, `mission:complete`), `GTP.Missions.state`, `GTP.Entities`,
`GTP.World.landmark`, `GTP.UI.ticker/toast`.

Wrappers installed on other modules: none.

## Tests

```
cd grand-theft-pundit
NODE_PATH=/opt/node-tools/node_modules node tests/strangers.js          # schema + all 26 missions headless (about 3-4 minutes)
STRANGERS_ONLY=standby,apology NODE_PATH=/opt/node-tools/node_modules node tests/strangers.js   # a subset
node tests/content_audit.js
```

`tests/strangers.js` validates the schema (every landmark, landmark point, giver, speaker, ped, vehicle type, weapon,
minigame opponent and ramp resolves; only existing objective types; tags referenced are spawned; DAG; unlock flags; all
eleven districts covered), checks that a new game shows no stranger markers, then for each strand completes the story up
to the unlock, checks the home marker and the eccentric at the door (screenshot `tests/out/strangers_home_<strand>.png`),
walks into the light for every mission, skips the intro, and drives every objective through the real checks
(screenshot `strangers_mid_<first mission>.png`): real fights with fists / the table leg / guns, real tails, real
pickups, the stop holds, the passenger rides, races (teleports through the checkpoints after the real countdown),
stunts (a held throttle from a run-up through the real launch and landing), escapes (waiting out of sight, or a
respray at 2+ stars: on the integrated build a hiding player at full health was shot dead by a
cop at two stars within 27 s), and both minigames with scripted inputs. It asserts completion, flags, the reward, the giver,
the epilogue, that no objective had to be forced or retried, the phone list, a replay, the save, and `GTP.errors` empty.

## Test results

See `docs/v03/final_strangers.md` for the final round (integrated build 10ba585 merged) and
`docs/v03/triage_strangers.md` for every other failing test file, each re-run with this module stubbed out.

## Known issues / for integration

- `tests/missions.js` (count 17 or 25) and `tests/campaign.js:758` (count 25) assert `allMissions().length`; on the
  integrated build it is 35 without the strangers and 61 with them, so both fail either way. Count story missions only
  (`GTP.Story.order()`, or skip `kind === 'stranger'`).
- AI (story / world): a `follow` target walking from the `stadium` door toward `vaultwright_manor` can wedge at the
  stadium door (route point 0 unreachable; 600 sidestep attempts in 320 s). The caddie tail was rerouted
  (`goldplate_links` → `vaultwright_manor` → `bridge_main`) and passes repeatably.
- `GTP.Story.order()` / `next()` skip the strangers (asserted by tests/strangers.js). The phone's MISSIONS header
  `n / total` and the save summary's `missionsTotal` still count `allMissions()`, side missions included; filter on
  `kind === 'stranger'` / `side` where the story alone is meant (UI / story owners).
- The intro of a stranger mission uses the engine's over-the-shoulder two-shot (no `cs_intro_st_*` scripts exist); the
  cutscene track could add them from `GTP.Content.strangers`.
- The phone's STRANDS tab reads `GTP.Strands.summary()` (the seven expansion strands); the strangers are listed in
  MISSIONS instead. `GTP.Strangers.summary()` / `homes()` are ready for a UI tab or map legend.
