# v0.3 content track (`v03/content`)

Owner files: `js/25_content_parity.js` (new), the `requires` arrays in `js/22_content_missions.js` and
`js/24_content_expansion.js`, `tests/content_parity.js` (new), this file and `docs/v03/triage_content.md`.

Status after integration round 1: merged `65dc2b7` (a fast-forward), every new mission checked against the real
runtime, data fitted to what the story, bosses, shooting and interiors tracks actually read. `node tests/content_audit.js`
is green. `tests/content_parity.js` is green: 6,106 data checks plus the live-game checks.

## What I built

`GTP.Content.parity` (all data, written in the GDD voice):

| key | what | count |
|---|---|---|
| `weapons` | the plan's weapon schema. The 12 original ids, then the shooting track's 25 ids (see "One arsenal") | 37 |
| `weaponOrder` | ids in table order | 37 |
| `attachmentSlots`, `attachments` | slots `muzzle mag optic grip light`; `{id, slot, name, price, mods, fits:[classes], flavor}` | 5, 13 |
| `tints` | `{id, name, color, price, unlock}` | 10 |
| `modshop` | Spin Doctor Customs: paint colors and finishes, `wheels` 0..5, `spoiler` 0..3, `tint` 0..3, `engine` 0..4, `brakes` 0..3, `armor` 0..5 (array index = the level for `GTP.Vehicles.mod`), `turbo`, `horns`, `repair`, barks | |
| `clothing` | Lanyard & Co.: `items` by slot (`top bottom shoes hat glasses`, each with `style`, `color`, `price`), `outfits` | 31 items, 6 outfits |
| `barber` | the Clip Joint: `styles` (one per cast `hair` enum value), `colors` | 9, 9 |
| `properties` | 5 safehouses (`safe_dorm` = the pod van, owned) + 6 businesses `{id, kind, landmark, price, income/day, garage, save, wardrobe}` | 11 |
| `stocks`, `stockApp` | 8 invented tickers `{ticker, name, price, vol, reacts:{missionId: fraction}}`; the app is "Liquidity" | 8 |
| `golf` | Goldplate Links, 9 holes `{hole, name, par, displayPar:10, tee, pin, hazards, gag}`, caddy lines, score names | 9 |
| `events` | random street events `{id, name, kind, weight, districts, setup, wanted?, reward, lines}` | 8 |
| `jobs` | `damage_control` (paramedic parody) and `hot_take_brigade` (firefighter parody) | 2 |
| `achievements` | `{id, name, desc, hidden?, trigger}`; trigger hints: `mission`, `anyMission`, `event`, `flag`, `stat`+`count` | 26 |
| `cheats` | `{code, effect, name, toast}`, letters only, none contained in another | 8 |
| `loadingTips` | v0.3 tips, naming actions (Aim, Fire, Cover), never keys | 24 |
| `radio` | `ticker` (16), `ads[stationId]` (3 each), `dj[stationId]` (2 each), `news[missionId]` (ticker line on completion) | |
| `missions` | the 10 new story missions, 22_ schema plus `act`, `story: true` (and `heist` on h02/h03) | 10 |
| `chain`, `acts`, `actTitles` | the 35 story ids in order; acts 1/2/3 | 35 |
| `requiresPatches` | the plan's story-chain table as data | |
| `chapters` | the three act cards `{id, act, title (bare: the UI prints "ACT I"), subtitle, from}` | 3 |
| `interludes` | mid-act cards `{id, act, title, subtitle, from}`: the heist interlude, the finale | 2 |
| `calls` | `{missionId: {from, lines:[{who, text}]}}`, one per story mission, from its giver | 35 |
| `heists.hedge_job` | the design table: board text, roles, crew with skills, approaches, per-approach objective `variants` | |
| `heist` | the same, in the shape `GTP.Heist` (09) reads, built at load | |
| `retune` | guarded load-time data patches to existing missions (see hooks) | |
| `introShots` | cs_intro specs for the new missions, in 24_'s INTRO_SHOTS format | 10 |
| `pendingLandmarks` | landmark ids my tables use that the world track adds in round 2 | 9 |

Helpers: `weaponById, attachment, attachmentsFor(weaponId), missionById, call, actOf, chapterFor, nextInChain, stock,
property, heistObjectives(heistId, missionId, approach), register()`.

### New story missions

| id | title | giver | marker | requires | reward | unlocks (equipped on completion) |
|---|---|---|---|---|---|---|
| `m01c_both_sides` | Free Sample | merle | both_sides_strip | m01_van | 150 | pistol |
| `b01_goldplate` | Rated a Ten | sloane | stadium | m06_rally | 1,800 | doublebarrel (The Both-Sider) |
| `b02_velvetine` | The Silent Yacht | gus | velvetine_pier | m07b_ferry | 2,000 | confetti (Confetti Cannon) |
| `b03_warbanner` | Volume Is Policy | roz | bravadia_embassy | m08b_jets | 2,200 | carbine (The Panel) |
| `b04_redacted` | Weather Balloon, Repaired | kip | balloon_depot | m09b_hotmic | 2,400 | stickynote (Sticky Note) |
| `h01_casing` | Casing the Hedge | gus | pod_garage | m12b_scope | 500 | - |
| `h02_prep` | Prep Work | sloane | pod_garage | h01_casing | 500 | smoke (Smoke & Mirrors) |
| `h03_job` | The Hedge Job | gus | pod_garage | h02_prep | 9,000 (the take) | lmg (The Endless Segment) |
| `b05_dunk` | Next Table Over | sloane | campus_quad | m13_thursday | 3,000 | autoshotgun (Town Hall) |
| `b06_panel` | The Undercard | chyron | protest_plaza | m13b_ratio | 3,500 | spin (The Spin Machine) |

- `m01c_both_sides`: `goto` the Both Sides Arms door, `interior {interior:'armory', store:'both_sides_strip'}`, `equip` the
  free pistol, a dialogue (aim, fire, cover), `range {medal:'bronze'}`, `buy {item:'ammo_pistol'}`.
- Boss missions: `goto` the boss arena (`GTP.Bosses.arenaTarget(id)`, with a literal fallback; radius 160 = 20 m), then
  `{type:'boss', bossId:<mission id>}`, a short humiliation dialogue, and for b01/b03/b04 an `escape_wanted`.
- The heist: h01 cases Vaultwright Capital and ends on `heist_board`. h02 and h03 hold all three approaches' objective
  lists, each objective tagged `approach: 'quiet' | 'loud' | 'both_sides'`. 09 runs only the plan's list. Story beat:
  the vault holds Bryce's sold contract; its back page is a Monday Memo subscription signed "Respectfuly".

## One arsenal (integration round 1)

`08_combat.js` keeps its own 25-weapon fallback table and merges `parity.weapons` over it **by id, never removing an
id**. My first table used different ids for the same ideas, so the merged game had 45+ weapons:
- duplicate concepts (`pdw` "The Live Blog" beside `liveblog` "The Live Blogger");
- clashing names (my LMG "The Filibuster" beside their pistol `filibuster`);
- ids with no mesh, so the interiors racks failed "stocked with every weapon".

`parity.weapons` now covers exactly the 12 originals plus the shooting track's 25 ids (`knuckles selfie gavel bat oped
filibuster pocketsmg threadpistol liveblog combatmg lmg carbine bullpup battlerifle sawnoff doublebarrel autoshotgun
marksman heavysniper coffee smoke stickynote firework confetti spin`). It keeps their numbers (their tests are tuned
to them), keeps their names, uses my lines where theirs were weaker or harsher, and sets the unlocks to the story:
each boss and heist reward is one of these. The test checks every combat fallback id is covered and every parity id
has a mesh builder in 05b. Live, `Combat.WEAPONS` equals the parity table and every id builds a mesh.

## Interfaces

Exposed: `GTP.Content.parity`. Consumed (feature-detected): `GTP.Content.expansion.missions / missionById / introShots /
introScript` (24_), `GTP.Bosses.arenaTarget` (08b).

What other tracks read, and the shape they get:
- **story (09)**: `parity.missions` (with `story: true`), `parity.chapters` (`[{act, title, from}]`), `parity.calls[id]`
  (`{from, lines}`), `parity.heist` (`{missions, approaches:[{id, name, hostiles, payout, wanted, line}], crew:[{id, name,
  cut, perk}]}`), approach-tagged objectives, `radio.news[id]`. 09 pays a heist mission's reward x approach.payout x
  (1 - crew cuts, capped at 60%), so h03's listed reward is the take.
- **bosses (08b)**: boss mission id = boss id; the approach `goto` targets the arena the fight uses.
- **shooting (08)**: `weapons`, `attachments` (`mods` are multipliers plus flags), `tints`. Unlocks: `unlock.mission` puts a
  weapon and its ammo on the shop wall.
- **interiors (13)**: `range` / `interior` objectives use its events; the armory racks show `parity.weapons`.
- **systems (14)**: properties, stocks (`reacts` on `mission:complete`), golf, achievements, cheats (`effect` ids
  `heal clear_wanted gold_everything big_heads low_gravity spawn_vehicle cycle_weather money`), jobs, clothing, barber.
- **world (round 2)**: `events`, golf tee/pin (metres from the goldplate_links door; move them to lawn, QA-A-GEO-04), and the
  new door markers in `parity.pendingLandmarks` (`spin_doctor_strip/port`, `lanyard_strip/uptown`, `clip_joint`,
  `safe_brownstone/marina_loft/suburb/penthouse`).

## Load-time hooks (in my file, guarded and idempotent)

`parity.register()` runs once at load:
1. appends `parity.missions` to `expansion.missions` (so 24_'s `missionById` and its cutscene builder find them; `story:true`
   keeps 09 from reading them as side missions);
2. applies `parity.retune` once. Patches are `{path, value, from?}`: with `from`, a patch applies only while the field still
   holds that text, so an owner who fixes their own line is never overwritten. `retuneLog` records the result.
   - `m03b_range`: no longer takes back the pistol that m01c gave away.
   - `m05_peer`: hands over the Op-Ed Compact instead of a second pistol.
   - `m01_van`: counts five subscribers (QA-B-TXT-03).
3. builds `cs_intro_<id>` for the 10 new missions, and rebuilds the intro of any mission whose intro text was retuned.

## Played on the merged build (headless, real runtime)

Script: a scratch driver that reuses `tests/campaign.js`'s in-page driver for ordinary objectives and
`tests/bosses.js`'s fight bot for the boss objectives. Interior, range, buy and heist board go through the real
`GTP.Interiors` (door, room, range on the line), `GTP.Combat.shop.buy` and `heist:plan`.

| mission | result |
|---|---|
| m01c | completes for real: armory entered, range silver (140), ammo bought, call from Sloane, next light m01b |
| h01, h02 x3, h03 x3 | complete for real under all three approaches. h03 take: quiet $6,570, loud $8,191 (11 guards after the hostile multiplier), both sides $7,578 |
| b05 Dunk | beaten for real in 172 s: all three phases, reward, call, next light |
| b01, b02 | the bot stays in phase 1 for 420 s (bosses issue, below) |
| b03 | the bot reaches phase 3 in 420 s |
| b04 | fails "You left the fight" (bosses issue, below) |
| b06 | the bot reaches phase 2 in 420 s |

Fixed in my data because of this run: the m01c shop deadlock (pistol unlock moved to m01_van), the boss approaches
(arena targets; b01 and b06 markers moved next to their arenas), the missing `story:true`, the heist shape, the chapter
shape, and b01's reward (09 equips the reward, and a melee weapon would go into b02, where the speakers must be shot).

## Failures in other tracks' files (evidence)

From `tests/all.js` on `65dc2b7` (run in a clean worktree) and my probes:

| test / area | failure | evidence and cause | owner |
|---|---|---|---|
| bosses | b01 not beaten in 360 s | My probe: for 240 s `encounter.target()` returns the shielded boss ped ("IN THE HELICOPTER", 9 m up), never a spool. The bot chases it and runs dry to fists. b02 shows the same ("SHHH. THE BARON IS LISTENING", target ped, never a speaker). In b04 the target stays at the arena 21 m up while the player drifts 165 m away on fists; the 150 m rule then fails it. | 08b (target() should return the breakable part while shielded) / the bot in tests/bosses.js |
| campaign | "no marker for m01b_airport: m01c_both_sides" | its fixed ORDER still has 25 missions; v0.3 is 35 (`GTP.Story.order()` already returns them) | story (tests/campaign.js) |
| missions | "17 base missions (25 with the expansion), got 17 / 61" | counts `allMissions()`, which now also merges 26 strangers; story missions are 35 | story (tests/missions.js) |
| feel | "saved with m00..m02 done (m03 lit)" shows m01c lit too | the test marks m00..m02 done by hand without m01c, which m01b now requires | story/feel test fixture |
| combat | after my reconciliation: "pistol rounds: 24 for $60" refused `locked` | the fixture completes only `m03b_range`. Pistol ammo follows the merged `UNLOCK.pistol` = m01_van (needed so m01c can sell its own rounds), while 24_'s pistol shop item still says m03b_range. Fix: complete the earlier chain in the fixture, or have `shop.unlocked()` accept an unlock mission that is an ancestor of a completed one. `unlock:null` in parity falls back to the base m03b (08:282), which would re-break m01c | shooting (tests/combat.js / 08) |
| combat (baseline) | "an unowned segment can be stepped off with [" saw `carbine` | the wheel test expected `rifle` in slot 6; my old table added a cheaper rifle-class `carbine`. Gone after the reconciliation (combat now passes this step) | - |
| interiors (baseline) | racks missing 12 weapons | the 45-weapon arsenal; fixed by the reconciliation. The next assertion ("without an armory UI the prompt asks to confirm the purchase: Pistol / $450 / [E] INSPECT") is the interiors track's prompt | interiors |
| audio | "every SFX name makes a voice; failed: phoneRing,gps" | no voices for those SFX | vehicles/audio (03_audio) |
| characters | "aimed rifle ... leftToBarrel 1.411" | left hand far from the barrel | models (06c) |

The remaining files were still running when this was written; see the final round report for the full list.

## Tests

```
cd grand-theft-pundit
node tests/content_audit.js                                         # green
NODE_PATH=/opt/node-tools/node_modules node tests/content_parity.js  # 6,106 data checks + live checks, green
```
Part 1 (plain node, vm over js/20..25):
- schemas, unique ids, and that every landmark, cast id, weapon, mission, station and district referenced resolves;
- the 35-mission DAG against the plan table, the chain line, acts, calls, chapters;
- the heist (both shapes, tagged objectives, payout floor);
- rules learned from the runtime: boss approaches go to the arenas, boss rewards are not melee, a `buy` item is unlocked
  before its mission, no `goto` after a vehicle leg without "get out", lost tagged vehicles fail the mission;
- text rules: lines fit the 114-character box, no asterisks, American spelling;
- the arsenal: covers combat's fallback ids, every id has a 05b mesh builder;
- 22_/24_ changed only in `requires:` lines; the audit passes.

Part 2 (Playwright): the 35 missions in `Missions.allMissions()` and `Story.order()`, the 10 intro cutscenes, `Combat.WEAPONS`
equal to the parity table with a mesh for every id, the boss approach targets on the live arena centres, no errors from 25_.

## Decisions

- The pistol (and its ammo) is on the wall from m01_van, so m01c can give one and sell its rounds.
- One arsenal of 37: the shooting track's ids and numbers, our names, lines and story unlocks.
- Shotgun 66 per volley and table leg 30 (CMB-15/16); the other ten original weapons keep v0.2 numbers.
- Boss rewards are guns (09 equips the reward). b01's marker is the stadium and b06's the plaza set, next to their arenas.
- Heist: three approaches (quiet, loud, both sides), three roles, six crew from the cast (Kip's cut is zero). h03's
  reward is the take, so 09's payout rule applies to it.
- Retune patches to other tracks' text only for data the content retune itself caused (m01_van's count, the pistol
  handover), always from-guarded. Everything else is reported to its owner in `triage_content.md`.

## Known issues

- Boss completion depends on the bosses track's `target()` and bot (above); the content side lands each fight in its arena.
- Economy (QA-STR-16): the ten missions add $25,050 in listed rewards; subscribers use the listed reward. Tune
  `subsPerReward` (09) or the tiers (24).
- The world track's door markers and golf tee/pin points arrive in round 2. The ids in `pendingLandmarks` must match
  theirs, or integration renames them here.
- 24_'s pistol shop item says `unlock: 'm03b_range'` while parity says m01_van (the weapon item and its ammo unlock at
  different missions). Harmless in play; the 24 owner can drop or align it.
