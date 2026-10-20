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
| `ghostwriter` | Ghost Notes | Marisol Echo-Venn, ghostwriter for podcasts that do not exist (`marisol`) | `green_room` (downtown) | `m04_hit` (`a_voice`) | `st_ghost_1..3` | timed pickups + drive, on-foot tail of the only listener, a fight, an inline race to the Listening Room |
| `reaction_face` | Mouth Open | Gasp Haverly, professional thumbnail reaction face (`gasp`) | `strip_gas` (strip) | `m03b_range` (`range_trained`) | `st_gasp_1..3` | timed three-stop drive, stunt jump `sj_02`, two stars, wreck three vans, ratio war |
| `daylight` | Seasonal Affective Discourse | Thaddeus Wainscot, think-tank intern who has never seen daylight (`thaddeus`) | `fulcrum` (capitol) | `m05_peer` (`contract_sold`) | `st_day_1..3` | passenger ride to the sky, `collect_any` 5 of 7 under a timer, a fight, a long timed drive to the runway, two ramming SUVs |
| `caddie` | Put Me Down for a Ten | Lyle Bunkerton, the President's caddie (`lyle`) | `goldplate_links` (hills) | `m06_rally` (`show_renamed`) | `st_caddie_1..3` | tail the rogue scorekeeper, pickup, scooter race (podium place 3), table-leg-only fight (`equip` + `weapon`), pickup, drive |
| `hoa_appeals` | Appeal Pending | Dewey Varnum-Pleat, live-streams his HOA appeals (`dewey`) | `hoa_hall` (suburbs) | `m10_pellets` (`hoa_enemy`) | `st_hoa_1..3` | timed pickups + goto, one star, `stop_vehicle` on a fleeing HOA SUV, pickup at the tag, passenger to the Capitol, debate vs the Board, survive HOA patrol waves |
| `proofreader` | The Second L | Ottoline Kerning, Monday Memo proofreader (`ottoline`) | `memo_press` (industrial) | `m12_memo` (`knows_memo`) | `st_proof_1..2` | truck pickups in the port container maze, drive back, timed wreck of four driving vans, ratio war vs House Style, three stars |
| `fresh_takes` | Catch of the Day | Captain Mortimer Brine, fishmonger of takes (`brine`) | `fish_shack` (marina) | `m07b_ferry` (`ferry_friend`) | `st_brine_1..2` | timed van pickups on Manifest Quay (port) + drive back, the revolver (`equip`), wreck three trucks, two stars |
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

- **Registration**: every strand mission is appended at load time to `GTP.Content.expansion.missions`, the list
  `GTP.Missions.allMissions()` concatenates after the story (its cache keys on the list length). That is the mechanism the
  expansion missions use, and it means the blue-light markers, the giver and Kip at the door, the intro two-shot, the
  phone's MISSIONS tab, REPLAY, checkpoints / RETRY, best times, rewards, subscribers and the save (`completed`, `flags`)
  pick them up with no other file touched. Cast and minigame opponents are merged into `GTP.Content.cast`,
  `GTP.Content.debate.opponents` and `GTP.Content.ratio.opponents` without overwriting an existing id.
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
  in zone) and `sj_09` (taxi, 45 m flat out: 24 m/s, 0.95 s; the objective sets `minAir: 0.8`). Reported below for the
  world track.
- **Race places**: the ghostwriter race wants 1st; the caddie's scooter race wants 3rd ("third is a ten"), so a bike
  against the sports-car field is fair.

## Interfaces

Exposed:
- `GTP.Content.strangers = { version, cast, debate, ratio, strands, missions }`
- `GTP.Content.strangerIds` (the ten giver cast ids)
- `GTP.Strangers = { list(), strand(id), missions(id), status(id), summary(), homes(), epilogue(id), strandOf(missionId), flagged(id) }`;
  `status()` is `{id, name, giver, home, district, blurb, state: 'locked'|'available'|'active'|'done', done, total, next, unlock, epilogue}`;
  `homes()` is `[{id, strand, name, giver, landmark, x, z, state, color}]` for a map legend or a phone tab
- event `strangers:epilogue {id, name, line, giver}`; flags `st_<mission id>` and `stranger_<strand id>`

Consumed (all feature-detected): `GTP.Content.expansion.missions`, `GTP.Content.cast`, `GTP.Content.debate/ratio.opponents`,
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
respray at 3+ stars), and both minigames with scripted inputs. It asserts completion, flags, the reward, the giver,
the epilogue, that no objective had to be forced or retried, the phone list, a replay, the save, and `GTP.errors` empty.

## Known issues / for integration

- `tests/missions.js` asserts `allMissions().length` is 17 or 25; with the strands it is 51 (and with the content
  track's ten new story missions it will be 61). The count check should count `m.kind !== 'stranger'` (story track).
- Anything that counts `allMissions()` as "the story" (the phone's MISSIONS header `n / total`, the save summary's
  `missionsTotal`, a future `GTP.Story.next()`) now includes the 26 side missions; filter on `kind === 'stranger'` /
  `side` where the story alone is meant.
- The intro of a stranger mission uses the engine's over-the-shoulder two-shot (no `cs_intro_st_*` scripts exist); the
  cutscene track could add them from `GTP.Content.strangers`.
- World track: stunt ramps `sj_06` and `sj_08` do not let any car reach their landing zones (see Decisions).
- The phone's STRANDS tab reads `GTP.Strands.summary()` (the seven expansion strands); the strangers are listed in
  MISSIONS instead. `GTP.Strangers.summary()` / `homes()` are ready for a UI tab or map legend.
