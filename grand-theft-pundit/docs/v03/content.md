# v0.3 content track (`v03/content`)

Owner files: `js/25_content_parity.js` (new), the `requires` arrays in `js/22_content_missions.js` and
`js/24_content_expansion.js`, `tests/content_parity.js` (new), this file.

## What I built

`GTP.Content.parity` (all data, written in the GDD voice, `node tests/content_audit.js` green):

| key | what | count |
|---|---|---|
| `weapons` | the plan's weapon schema; the 12 existing ids first, then 25 new ones | 37 |
| `weaponOrder` | ids in table order (a suggested wheel / cycle order) | 37 |
| `attachmentSlots`, `attachments` | slots `muzzle mag optic grip light`; `{id, slot, name, price, mods, fits:[classes], flavor}` | 5, 13 |
| `tints` | `{id, name, color, price, unlock}` | 10 |
| `modshop` | Spin Doctor Customs: paint colours and finishes, `wheels` 0..5, `spoiler` 0..3, `tint` 0..3, `engine` 0..4, `brakes` 0..3, `armor` 0..5 (array index = the level passed to `GTP.Vehicles.mod`), `turbo`, `horns`, `repair`, barks | |
| `clothing` | Lanyard & Co.: `items` by slot (`top bottom shoes hat glasses`, each with `style`, `color`, `price`), `outfits` presets | 31 items, 6 outfits |
| `barber` | the Clip Joint: `styles` (one per cast `hair` enum value), `colors` | 9, 9 |
| `properties` | 5 safehouses (`safe_dorm` = the pod van, owned) + 6 businesses; `{id, kind, landmark, price, income/day, garage, save, wardrobe}` | 11 |
| `stocks`, `stockApp` | 8 invented tickers `{ticker, name, price, vol, reacts:{missionId: fraction}}`; the app is "Liquidity" | 8 |
| `golf` | Goldplate Links, 9 holes `{hole, name, par, displayPar:10, tee, pin, hazards, gag}`, caddy lines, score names | 9 |
| `events` | random street events `{id, name, kind, weight, districts, setup, wanted?, reward, lines}` | 8 |
| `jobs` | `damage_control` (paramedic parody) and `hot_take_brigade` (firefighter parody) with vehicle, rules, timer/pay formulas, 12 levels, calls, rewards | 2 |
| `achievements` | `{id, name, desc, hidden?, trigger}`; trigger hints: `mission`, `anyMission`, `event`, `flag`, `stat`+`count` | 26 |
| `cheats` | `{code, effect, name, toast}`, letters only, none contained in another | 8 |
| `loadingTips` | v0.3 tips (aim, cover, armory, range, phone/GPS, shops, golf, stocks, heists...) | 24 |
| `radio` | `ticker` (16), `ads[stationId]` (3 per station), `dj[stationId]` (2 per station), `news[missionId]` (ticker line on completion) | |
| `missions` | the 10 new story missions in the 22_ schema plus `act` (and `heist` on h02/h03) | 10 |
| `chain`, `acts`, `actTitles` | the 35 story ids in order; acts 1/2/3 | 35 |
| `requiresPatches` | the plan's story-chain table as data (a record and a test fixture) | |
| `chapters` | chapter cards `{id, act, title, subtitle, first}`: three acts, the heist interlude, the finale | 5 |
| `calls` | `{missionId: {from, lines:[{who, text}]}}` for every story mission | 35 |
| `heists.hedge_job` | approaches, roles, crew, payout rule, objective `variants` per approach, board lines | |
| `retune` | load-time data patches (see hooks) | |
| `introShots` | cs_intro specs for the new missions, in 24_'s INTRO_SHOTS format | 10 |
| `pendingLandmarks` | landmark ids my tables use that the world track adds in v0.3 | 9 |

Helpers: `weaponById, attachment, attachmentsFor(weaponId), missionById, call, actOf, chapterFor, nextInChain,
stock, property, heistObjectives(heistId, missionId, approach), register()`.

### New story missions (full dialogue)

| id | title | giver | marker | requires | reward | unlocks |
|---|---|---|---|---|---|---|
| `m01c_both_sides` | Free Sample | merle | both_sides_strip | m01_van | 150 | pistol |
| `b01_goldplate` | Rated a Ten | sloane | goldplate_tower | m06_rally | 1,800 | golf_club |
| `b02_velvetine` | The Silent Yacht | gus | velvetine_pier | m07b_ferry | 2,000 | mic_stand |
| `b03_warbanner` | Volume Is Policy | roz | bravadia_embassy | m08b_jets | 2,200 | carbine |
| `b04_redacted` | Weather Balloon, Repaired | kip | balloon_depot | m09b_hotmic | 2,400 | sticky |
| `h01_casing` | Casing the Hedge | gus | pod_garage | m12b_scope | 500 | - |
| `h02_prep` | Prep Work | sloane | pod_garage | h01_casing | 500 | spin_smoke |
| `h03_job` | The Hedge Job | gus | pod_garage | h02_prep | 2,500 + heist take | lmg |
| `b05_dunk` | Next Table Over | sloane | campus_quad | m13_thursday | 3,000 | auto_shotgun |
| `b06_panel` | The Undercard | chyron | stadium | m13b_ratio | 3,500 | minigun |

`m01c_both_sides` objectives: `goto` the Both Sides Arms door, `interior {interior:'armory', store:'both_sides_strip'}`,
`equip` the free pistol (24 rounds), a dialogue that teaches aim / fire / cover, `range {medal:'bronze'}`,
`buy {item:'ammo_pistol'}`. Boss missions: an approach objective, `{type:'boss', bossId:<mission id>}`, a short
humiliation dialogue (bosses are grounded, exposed, ratio'd; nobody is hurt), and for b01/b03/b04 an
`escape_wanted`. The heist: h01 cases the bank and ends on `{type:'heist_board', heist:'hedge_job'}`; h02 and h03's
own `objectives` are the `quiet` approach; `heists.hedge_job.variants.loud|both_sides[missionId]` replace them.

The story beat: the vault holds Bryce's sold contract (m05). The twist at the end of h03 is that its back page is
a Monday Memo subscription, signed "Respectfuly", which leads straight into m13's confession.

## Requires rewiring (the only edits outside my file)

`22_content_missions.js`: m07_listen → b01_goldplate, m08_scooters → b02_velvetine, m09_balloon → b03_warbanner,
m10_pellets → b04_redacted, m13_thursday → h03_job, m14_grift → b06_panel.
`24_content_expansion.js`: m01b_airport → m01c_both_sides, m13b_ratio → b05_dunk. The result is one line of 33
missions plus the two endings (both still require m14_grift); `tests/content_parity.js` checks this against the plan
table and checks that the git diff of 22_/24_ since ea6a035 touches only `requires:` lines.

24_'s `chain`, `acts` and `requiresPatches` still describe the 25-mission v0.2 line (I may not edit them);
`parity.chain` / `parity.acts` are the v0.3 versions.

## Interfaces

Exposed: `GTP.Content.parity` (above). Consumed: `GTP.Content.expansion.missions`, `.missionById`, `.introShots`,
`.introScript` (all in 24_, feature-detected).

Contracts other tracks read (my reading of PLAN_V03.md):
- **shooting**: merge `parity.weapons` over the 12 by id. Melee entries use `projectile:'hitscan'` with
  `melee:true` (the schema has no melee projectile; the existing table uses the `melee` flag). Extra fields match
  08_'s names (`knock, pellets, driveBy, auto, headMul, vehicleMul, lobbed, speed, fuse, blast, stun, scope...`);
  new ones a weapon may use or ignore: `launch` (golf club), `sticks/remote` (sticky), `smoke/smokeSeconds/
  breaksSight` (spin smoke), `spinUp`, `heavy`, `mobility`, `zoom`, `glow`. `unlock.mission` is when the shop sells it.
  Attachment `mods` are multipliers (`dmg spread recoil range reload mag mobility adsZoom adsSpeed hipSpread sway`)
  plus flags (`noise:-1` suppressed, `light`, `laser`, `flash`).
- **story**: `calls[missionId]` is keyed by the mission the call **pitches** (`from` = its giver), so after a mission
  completes, phone with `calls[next.missionId]` (both endings have their own call). `parity.chain` is the order,
  `chapters[i].first` is where each card fires, `radio.news[missionId]` is a ticker line on completion.
  New objective types used: `interior {interior, store}`, `range {medal}`, `buy {item}`, `boss {bossId}`,
  `heist_board {heist}`. Heist runtime: on `heist:plan {approach, crew}` swap h02/h03 objectives via
  `parity.heistObjectives('hedge_job', id, approach)`; pay `base * payoutMul * (0.6 + 0.4 * mean skill) * (1 - cuts)`
  (min `payout.minimum`) on h03's outro; `approach.guardsMul` scales defeat counts, `approach.wanted` the stars.
- **systems**: properties, stocks (`reacts` applied on `mission:complete`), golf holes, achievements (`trigger`
  hints), cheats (`effect` ids: `heal clear_wanted gold_everything big_heads low_gravity spawn_vehicle cycle_weather
  money`), jobs, clothing (`items[].style` + slot) and barber (`styles[].hair`, `colors[].hex`).
- **world**: `events` (kinds `chase_ped defeat debate destroy stop_vehicle ride collect push`), golf `tee`/`pin`
  are metres from goldplate_links' door and may be moved to valid lawn; please use the ids in
  `parity.pendingLandmarks` for the new door markers: `spin_doctor_strip`, `spin_doctor_port` (mod shops),
  `lanyard_strip`, `lanyard_uptown` (clothing), `clip_joint` (barber), `safe_brownstone`, `safe_marina_loft`,
  `safe_suburb`, `safe_penthouse` (the plan's names). If world picks other ids, integration renames them here.
- **models**: clothing ids and `style` values; hat and glasses styles are the cast enums.
- **bosses**: mission ids equal boss ids; each boss mission's `text` describes the mechanic from the plan.

## Load-time hooks (in my file, guarded and idempotent)

`parity.register()` runs once at load and can be called again safely:
1. appends `parity.missions` to `GTP.Content.expansion.missions`, so `GTP.Missions.allMissions()` (09_) and
   `expansion.missionById` already see the 35-mission story without another file changing;
2. applies `parity.retune` once: **m03b_range no longer takes the pistol back** (`onComplete.takeWeapon` deleted, the
   loaner lines rewritten), because m01c now hands the player that pistol for keeps;
3. registers `cs_intro_<id>` for the 10 new missions through `expansion.introShots` + `introScript(id, true)`, and
   rebuilds `cs_intro_m03b_range` from the retuned line.
Integration may fold these into 09_/24_.

## Decisions (made autonomously)

- Pistol is unlocked (shop and give) by m01c, not m03b, to meet "a visible gun within ten minutes".
- Balance fixes in data: **shotgun 66 per volley** (was 45; CMB-15, one volley drops a 60 hp ped up close) and
  **table leg 30** (was 28; CMB-16, two hits drop a 60 hp ped). The other ten existing weapons keep v0.2 numbers
  exactly (tested).
- Every new weapon gets a story unlock so the shop wall fills as the story goes; the selfie stick is sold from start.
- Weapon classes are the existing nine (no new `lmg` class): the LMG and minigun are `rifle`/`special` with `heavy`.
- Heist target is Vaultwright Capital (`vault_bank`); three approaches (`quiet`, `loud`, `both_sides`), three roles
  (driver, tech, muscle), six crew from the existing cast (Kip's cut is zero).
- Stock tickers are invented four-letter strings (NAPZ GPLT VLTW VELV BDSC PNDT TYNX BSAR).
- Cheat codes are letters only (keyboard buffers), and none contains another.

## Tests

```
cd grand-theft-pundit
node tests/content_audit.js                                         # green
NODE_PATH=/opt/node-tools/node_modules node tests/content_parity.js  # 2930 checks + the in-game check, green
```
`content_parity.js` part 1 is plain node (vm sandbox over js/20..25); part 2 boots the game headless when
Playwright is present and checks the 35 missions and 10 new intro cutscenes are live with no errors from 25_.

## Known issues / for integration

- **Expected red in story-owned tests** after the chain change: `tests/missions.js` asserts "25 with the expansion"
  (now 35) and `tests/saves.js` expects the next light after m01_van to be m01b (now m01c_both_sides);
  `tests/campaign.js` compares `expansion.chain` with its own 25-id ORDER and walks missions that now need the v0.3
  objective types. `tests/cutscenes.js` and `tests/strands.js` stay green.
- Until the story track registers `interior`, `range`, `buy`, `boss` and `heist_board`, 09_'s `beginObjective`
  skips each unknown type with a `GTP.errors` entry (no throw, no stall): m01c plays as goto, equip, dialogue; boss
  missions skip the fight; h01 skips the board. Campaign runs that reach them fail their "no GTP.errors" assert.
  Nothing reads `mission.heist` / `heists.hedge_job.variants` yet, so h02/h03 always run the quiet list.
- **Dependency on the shooting track:** `onComplete.unlockWeapon` names 8 new ids (golf_club, mic_stand, carbine,
  sticky, spin_smoke, lmg, auto_shotgun, minigun). They only work once `parity.weapons` is merged into
  `Combat.WEAPONS`. Before that, 09_'s applyComplete gives 30 "rounds" of an id `Combat.fire` refuses, selects it,
  and toasts the raw id. I kept the grants (they are the point of the reward) rather than drop them. Integration
  must merge the weapons before these missions can be played.
- Runtime review fixes already in the data: h02/h03 `failOn` cover every tagged vehicle a variant drives (drive_to
  never fails on a lost vehicle by itself); no `goto` follows a vehicle leg without telling the player to get out
  (QA-C1-10); Goldplate's b01 call-down is a `radio` line. The test enforces both rules. h03's `enter_vehicle newsvan`
  spawns a fresh van, because h02's van is no longer persistent after cleanup. That is harmless, but two vans with
  the same tag can be on screen.
- QA bugs whose hints point at 24_ beyond the `requires` arrays (QA-STR-05 passenger `name`, QA-STR-13 memo offsets,
  QA-C1-04 intro shot-2 camera `z` sign in buildIntro, QA-C1-06 m12b courier sightlines, QA-C1-12 cs_ending_b
  from-point) are outside what I may edit; the intros I add go through the same builder and inherit QA-C1-04's
  camera until it is fixed there or in 12_cutscenes.js. No QA bug points at a file I own.
- Economy (QA-STR-16): the new missions add $18,550 in rewards plus the heist take (about $5k to $12k), which at
  x5 subscribers pushes the story further past tier 3; tune `subsPerReward` (09_) or the tier thresholds (24_).
