# v0.3 story track (`v03/story`)

Files owned and changed: `js/09_missions.js`, `js/12_cutscenes.js`, `js/30_game.js`; tests `tests/story.js` (new),
`tests/campaign.js`, `tests/missions.js`, `tests/cutscenes.js`, `tests/saves.js`.

The player's complaint was "I did not see a story or missions". After this track a brand-new game goes
**title -> loading -> cs_opening -> ACT I chapter card -> m00 intro -> "Get to Dorm 4B" on screen** with no input at all
(about 52 s of game time with every line read; holding confirm skips both cutscenes). After every story mission the GPS
points at the next one, its giver phones, and a sky beam stands over the light.

## What I built

### New Game hands over to the story (`30_game.js`)
- `Game.newGame(seed, opts)`: `opts.opening` defaults to **true when called while the game is on the title** (the UI's fast
  NEW GAME path calls the bare `newGame(seed)` from the title, the slot picker passes `{opening:true}`). A restart from the
  pause menu or a load never plays it. URL opt-outs: `?opening=0` or `?story=0`; `?story=1` turns it on in headless.
- `_maybeOpening()` plays `cs_opening` once loading is done, and its `onDone` calls `Game._beginStory()` ->
  `GTP.Story.begin()`, which starts the first available story mission (m00) with its intro. No `cs_opening` script: the
  story begins at once. If the player is already in a car or more than 30 m from the spawn when loading ends (tests that
  teleport, a player that is already off), the cutscene is not forced on them: the GPS and Gus's call point at m00 instead.
- After a load, `GTP.Story.refresh()` and `GTP.Story.gps(true)` re-point the GPS at the next story mission.

### `GTP.Story` (`09_missions.js`)
```
GTP.Story = {
  next() -> {missionId, title, giver, giverName, landmark, landmarkName, x, z, y, act, chapter} | null,
  chapter: {act, title},            // the act of the next story mission (or the last one when the story is done)
  order() -> [missionId],           // play order: topological over `requires`, ranked by Content.expansion.chain
  actOf(id), chapterTitle(act), progress() -> {done, total}, refresh(),
  gps(force) -> payload | null,     // gps:set to the next story mission
  call(id?) -> bool,                // place the giver's call now
  begin({teleport}) -> bool,        // the new game's hand-off: start the next story mission
  gpsTarget, lastCall, pendingCall(), reset()
}
```
- Story missions are `allMissions()` minus `registerTest` ones, minus `story:false` / `side:true`. `allMissions()` now
  also merges **`GTP.Content.parity.missions`** (anything with an `objectives` array), so `m01c_both_sides`, the boss
  missions and the heist join the chain as soon as the content track's `requires` edits land. Nothing is hard-coded per
  mission id.
- **Side missions never join the story.** `allMissions()` also merges `GTP.Content.strangers.missions` (from
  `js/26_content_strangers.js`), and those are always side missions. A mission is not story if it is flagged
  (`story:false`, `side`, `stranger`, `strand`, or `kind`/`category` set to `side`, `stranger`, `strands`, `strand` or
  `oddjob`), or if it sits in `Content.expansion.missions` but outside `expansion.chain` (a side mission registered the
  expansion's way). `story:true` overrides all of these. Side missions keep their blue lights and play normally, but
  `Story.order()` and `Story.next()` skip them and they never fire chapters or calls. Completing one points the GPS back
  at the story. The campaign test plays `Story.order()`, so it ignores them.
- Acts: a mission's numeric `act`, else `GTP.Content.parity.chapters` (`[{act, title, from?}]` or `{act: title}`), else the
  GDD: Act I from m00, Act II from m05_peer, Act III from m12_memo; titles "Folding Table", "Four Clients", "The Monday Memo".
- After a non-replay story mission completes: `gps:set` to the next one, and once the MISSION PASSED card, any act
  cutscene, dialogue and minigame are gone (+`C.MISSIONS.callDelay` 3.5 s) the next giver **phones**. If the player walks
  into that light first, the call is dropped. One call per mission per save (`flags.called_<id>`).
- On a story mission start: `chapter` when the act goes up (`flags.story_act`), `gps:clear`; during a mission every
  objective with a fixed target (goto, drive_to, interior, shop, buy, range) gets `gps:set {kind:'objective'}`, others
  `gps:clear`. On fail / abort the GPS goes back to the story mission's light.
- Beacons: every mission marker gets a 140 m light column (`C.MISSIONS.beaconHeight`). It is brightest over
  `Story.next()`, fades near the light, and its width scales with distance, so it reads from 200 m and more.
  `Missions.markers()` entries gain `story` (it is `Story.next()`), `beacon`, `labelRange: 400`, `dist` and `act` for the
  UI's long-range labels.

### Objective types
- `GTP.Missions.registerObjectiveType(name, {start(o,c,p), check(o,c,p) -> 'done'|'fail'|null, update?, cleanup?, hint?,
  target?, progress?})` -> bool. A registered type takes precedence over a built-in one of the same name.
- Files that load **before** 09 (`08b_bosses.js`) can leave definitions in `GTP.ObjectiveTypes[name]`. They are registered at
  `Missions.init()` and checked again when an objective of that type starts.
- `Missions.objectiveTypes()` lists every type.
- New built-in types:
  - `interior` `{interior:'armory'|'clothing'|'barber'|'safehouse'|..., store?, landmark?|target?}` completes on
    `interior:enter` with a matching `id`/`kind` (`armory` also matches the `gunshop` kind). The objective marker and the GPS
    go to the nearest door of that kind. **Fallback:** without `GTP.Interiors.enter`, reaching the door on foot completes it.
  - `buy` `{item, fund?, landmark?}` completes on `shop:buy`. `item` matches the item `id`, its `tab`, `kind`, `weapon`, an id
    prefix (`ammo` matches `ammo_pistol`), or `'any'`. `fund` tops a broke wallet up to that amount.
  - `range` `{medal:'bronze'|'silver'|'gold'}` completes on `range:end` with that medal or a better one. A worse run toasts
    "go again". **Fallback:** without `GTP.Interiors` it passes after 1 s with a toast.
  - `heist_board` emits `heist:board {missionId, approaches, crew, mission}` and completes on `heist:plan {approach, crew}`.
    **Fallback:** if nothing listens for `heist:board` and the UI has no `heistBoard`/`openHeistBoard`, the default plan is
    picked after 1.5 s.
  - `boss` `{bossId, opts?}` is a fallback for the bosses track: it calls `GTP.Bosses.spawn(bossId, opts)` and completes on
    `boss:defeated {id}`. With no bosses module it is skipped with a toast. The bosses track's own registration replaces it.

### The heist runtime (`GTP.Heist`)
```
GTP.Heist = { approaches(), crewList(), approach(id), approachName(id), defaultPlan(), plan(), setPlan({approach, crew}, missionId),
  isHeist(mission), hostileMul(), payout(mission, base), objectiveRuns(def), reset(), serialize(), load(d) }
```
- The tables come from `GTP.Content.parity.heist = {missions, approaches:[{id, name, hostiles, payout, wanted, line}],
  crew:[{id, name, cut, perk}]}`. The defaults are `quiet` (hostiles x0.6, payout x1.0) and `loud` (x1.5, x1.3), and the crew
  Gus 10%, Roz 8%, Kip 2%. Heist missions are `h01_casing`, `h02_prep`, `h03_job`, or any mission with `heist: true`.
- `heist:plan` stores the plan (flags `heist_planned`, `heist_<approach>`, and the `mission:heistPlan` event).
- During a heist mission the `defeat` counts and `survive` wave quotas are multiplied by `hostileMul()`. An objective tagged
  `approach: 'loud'` (or an array of approaches) runs only under that plan. The reward paid is `payout()`: the base reward x
  the approach's payout x (1 - the crew's cuts, capped at 60%). Subscribers still use the listed reward.

### `GTP.SaveRegistry` and save v4 (`30_game.js`)
- `GTP.SaveRegistry = {key: {get() -> json, set(json)}}`. It is created by 09 and by 30; any file may add entries at load
  time with `GTP.SaveRegistry = GTP.SaveRegistry || {}`.
- `serialize()` writes `data.registry[key] = get()` (round-tripped through the Infinity-safe encoder). `applyData()` calls
  `set(value)` after the `SaveHooks`, and only for keys present in the save.
- Save v4 is stored at `localStorage['gtp.save.v4.slot' + n]` with `version: 4` and `registry`. At boot,
  `migrateV3Saves()` copies every v3 slot (`gtp.save.v3.slot<n>` or `gtp.slot.<n>.v3`) whose v4 key is empty into v4
  (`registry: {}`, `migratedFrom: 3`). The v3 key stays, but `deleteSlot()` removes it too so the migration cannot bring the
  slot back. `slots()` and `loadSlot()` also read an unmigrated v3 slot by upgrading it in memory. The v2 save still goes
  to slot 1, now as v4.
- The story registers `SaveRegistry.story = {v:1, heist}`. Chapters and calls live in the flags.
- New helpers: `Game.v3Key(n)`, `Game.prototype.migrateV3Saves`, `upgradeV3`, `_readSlot`, `_registryGet`/`_registrySet`.

## Events emitted
`gps:set {x, z, label, kind:'story'|'objective', missionId, route, giver?, landmark?}` (`route` comes from
`GTP.World.route(px, pz, x, z)` when the world track provides it), `gps:clear`,
`phone:call {from, name, lines:[{who, name, color, text}], missionId, title, landmark, landmarkName}`,
`chapter {act, title, roman, missionId}`, `heist:board {missionId, approaches, crew, mission}`, `story:begin {missionId,
started}`, `story:done {last}`, `mission:supply {weapon, ammo}`, `mission:heistPlan`, and `save:migrated {slot, from:3}`.

Phone call lines are `GTP.Content.parity.calls[missionId]`, which may be an array of strings, an array of `{who|from, text}`,
or `{from, lines}`. Without that data the call uses one of four generic giver lines naming the place and the mission title.

## Events consumed
`interior:enter`, `shop:buy`, `range:end`, `heist:plan`, `boss:defeated`, `player:wasted`, `busted`, `vehicle:exploded`,
`vehicle:damage`, `pickup`, `vehicle:enter`.

## Wrappers on other modules (fold in at integration)
- **`GTP.Events.on` / `off`** (00_util) are wrapped once at 09's load to keep a listener count per event name
  (`hasListener()`). The fallbacks use it to know whether a UI draws the heist board, the phone (`phone:call`) or the
  chapter card (`chapter`). With no listener and no `GTP.UI.phoneCall` / `GTP.UI.chapter`, a call shows as toasts and a
  chapter as an `ACT I: ...` toast. At integration, give `GTP.Events` a `count(name)` and drop the wrapper.
- **`GTP.Input.down` / `pressed`** are swapped for the length of `player.control()` while `Game._fireLatch` is set, so they
  read `shoot`/`action` as up (QA-CMB-06). The latch is set by every `setState('playing')` and cleared once both buttons
  are released. At integration this belongs in the Input module as a `latch(actions)` API.
- UI hooks called when present (all optional): `GTP.UI.phoneCall(payload)`, `GTP.UI.chapter(c)`, `GTP.UI.chip(text)` (the
  race start prompt), `GTP.UI.glyph('jump')`, `GTP.UI.heistBoard` / `openHeistBoard` (presence only).

## Interfaces consumed (feature-detected)
`GTP.World.route`, `GTP.Interiors.{enter, active, current}`, `GTP.Bosses.spawn`, `GTP.Content.parity.{missions, calls,
chapters, heist}`, `GTP.Combat.{shop.items, giveAmmo, WEAPONS, weaponName, spawnPickup}`, `GTP.Render.{markerMesh,
addMarker, removeMarker, updateEnvironment}`, `THREE` (for the beacon mesh).

## QA round-1 bugs fixed (hint in my files)
| id | fix |
|---|---|
| STR-01 | `player:wasted` / `busted` end any strand at once. The rampage fails (CONTEXT STAMPED) and the loaner goes back before Combat's respawn penalty; the tier-3 weapon stash is re-taken from the cleaned loadout |
| STR-02 | `C.STRANDS.stopNear: 6` |
| STR-04 | Race legs are driven straight only when `segmentClear(prev, cp)`; a blocked leg paths on the roads |
| STR-05 | `fareName(def)` = `name` or `archetype` (HUD and `spawnCastPed`) |
| STR-06/07 | Rampage end: on a win the player keeps `max(had, min(left, mag + reserve))`; on a fail, death or bust the loaner goes back whole; a weapon the shop still locks is never kept from a loaner |
| STR-08 | The subscriber `discountHook` adds nothing when `Content.expansion.shop.discount` exists (Combat adds both) |
| STR-10 | Out of the cab for `fareLeave` seconds ends the shift with or without a fare; a blocked rampage bubble and the sponsor van toast "One strand at a time" |
| STR-11 | The strand SUV is tagged `hoasuv` (patrols start only from it or a cop car); the HOA vest appears whenever `hoa_vest` is set; the h_patrol hint uses the new tag |
| STR-12 | In a race start light: a "Hold SPACE (or the brake) to start: <race>" chip (toast fallback). The foot brake held while stopped holds the car instead of reversing it, and counts as the start |
| STR-15 (part) | The memo-20 vest spawns at the pod van / garage when `memo_vest` is set. The rest (rampage_king reserve, the cab livery, the pod3 wrap, tier-4 accuracy, gold tables) live in 08/07/render: not mine |
| STR-16 | `subsPerReward` 5 -> 3: the story alone ends in tier 3 |
| STR-17 | A repeat race win or podium pays 20% of the prize (`raceRepeatPay`); `raceCooldown` (0) can rest the light |
| C1-01 | Mission goons punch every 1.6-2.4 s after a 0.35 s wind-up, and at most two swing at once; four idle-player goons now take ~6 hp/s instead of 30-70 |
| C1-02 | `Missions._dropRetry()` (QUIT); a retry offer is also dropped by a later death or bust with no mission, and expires after 180 s |
| C1-03 | `supplyWeapon`: a weapon-restricted defeat or destroy objective refills the named weapon 2 s after it runs dry (toast "Mission supply") |
| C1-04 | `shoulderFrom`: an entity-offset camera that would sit between its entity and the look-at target is mirrored behind it, whichever sign the script used; in a mission intro's later shots, actors without their own facing turn to the player and the player to the giver |
| C1-05 | The tail target spawns `followLead` (14 m) ahead along its route; the spotted clock starts after `followGrace` (4 s) or once the target first pulls away |
| C1-09 | `Missions.start` from the pause menu sets the state to playing first, so the replay intro plays |
| C1-10 | A goto reached by car completes once the car is stopped in the light (`onFoot: true` insists, with the hint "Get out on foot") |
| C1-11 | `Cutscenes.finish` puts the player back where they stood when the script placed them on a roof |
| C1-12 | `script.clock` is honoured for the script's length and the game clock comes back, moved on by the elapsed time; `cutsceneAfterDelay` 2.6 -> 5 s so MISSION PASSED (4.8 s) is gone before an act cutscene |
| C1-13 | `weaponAmmo` rifle 90, ratio 3 |
| C1-14 | `h_save` fires only when sitting in the van really saves (no mission, strand, stars or cutscene) |
| C1-15 | `vehicleName` / `backIn`: "Get back in the SUV", "Get back on the scooter" (drive_to, deliver_passenger, stunt, fail text) |
| CMB-01 | A `vehicle:exploded` with no `vehicle:damage` (a direct rocket) records the player's weapon as the ignite hit, so m13b's vans count |
| CMB-06 | The fire latch (above) |
| CMB-10 | Stationary ranged goons open fire from `max(weapon range, spawn.fireRange, 140 m)`. Inside the gun's range they fire real rounds. Beyond it they take potshots that land short and wide ("badly": a tracer, a report and `mission:potshot`, but no real round), so a sniper duel does not alarm the city's police. The courier sightlines in 24_content are content-side |

## Decisions
- The first mission starts by itself after the opening, **with** its intro cutscene. The intro is story, and the dialogue
  auto-advances, so no input is needed to reach the objective.
- The phone call comes from the **next** mission's giver and uses the next mission's call lines
  (`parity.calls[nextMissionId]`).
- The mission beacon is a plain mesh made here (`THREE.CylinderGeometry`, normal blending), so it works with the current
  `Render.markerMesh`. The environment track can restyle it.
- `feel.js`, `audio.js` and `ui.js` start from the title with Enter. A player who is already in a car or far from the spawn
  is not pulled into the opening, which keeps those tests as they were; they now see the GPS and a call instead.

## Tests
```
cd grand-theft-pundit
NODE_PATH=/opt/node-tools/node_modules node tests/story.js      # new game -> m00 objective with no input, GPS + call after each mission, types, heist, QA regressions
NODE_PATH=/opt/node-tools/node_modules node tests/campaign.js   # the whole story (GTP.Story.order(): 25 now, the content track's new missions when they land)
NODE_PATH=/opt/node-tools/node_modules node tests/missions.js
NODE_PATH=/opt/node-tools/node_modules node tests/cutscenes.js  # + QA-C1-04 shot 2, C1-12 clock, C1-11 roof
NODE_PATH=/opt/node-tools/node_modules node tests/saves.js      # v4 + registry + v3 and v2 migrations
```
Missions without a script in `campaign.js` (the content track's v0.3 missions) are played by a generic per-objective
driver. The event types are fed their events, and anything else goes through `Missions.completeObjective()`, recorded as
a fallback.

## Known issues
- Until the UI track lands, the phone call and the chapter card show as toasts.
- STR-15's remaining rewards and CMB-10's courier positions are in files I do not own (see the table).
- The beacon's tone-mapped colour is pale against a bright dusk sky; the environment track's marker shader can do better.
