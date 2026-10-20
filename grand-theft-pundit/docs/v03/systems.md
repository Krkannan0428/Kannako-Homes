# v0.3 systems track: notes

Branch `v03/systems`. Owns `js/14_systems.js` and `tests/systems.js`. Everything is simulation plus events; the UI
track draws the screens. No QA round-1 bug hints point at `14_systems.js` (it was a stub), so there was nothing to fix there.

Run: `cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/systems.js` (about 20 s, 10 sections, two
screenshots: `tests/out/systems_golf.png`, `tests/out/systems_wardrobe.png`). `node tests/content_audit.js` stays green.

## What is built

| Part | What it does |
|---|---|
| Properties | 5 safehouses (`safe_dorm` owned from the start, `safe_brownstone`, `safe_marina_loft`, `safe_suburb`, `safe_penthouse`) and 6 businesses. Buy with cash, some gated by a mission. Businesses pay income once per game day (`time.day` increments; up to 7 days are caught up at once). Owned safehouses are save points (`save`) and beds (`sleep`: +6 game hours, full health, then save). |
| Stocks | 8 invented tickers (NAPD, VLTW, GLDP, VLVT, PLLT, PNDT, YELL, BSCO). Each game hour every price takes one log-normal random-walk step (`vol`, `drift`, a soft pull toward the listing price), driven by the systems' own `GTP.rng.fork(0x5157)` stream. `mission:complete` (not a replay, first time only) applies the shock from the reactions table (for example `m10_pellets`: PLLT -35%). Buy and sell whole shares with a flat $10 fee, average cost basis, realized profit, 96 hours of history. |
| Golf | Goldplate Links, 9 holes (par 29). The aim moves with left/right, clubs with forward/back (driver, 7 iron, wedge, putter; the club is picked automatically for each shot). Swinging takes two presses (Space, left mouse or Enter): the first starts the meter (it climbs and falls over 1.6 s), the second locks the power. Ball flight has gravity, wind drift (each hole rolls its own wind), loft, bounces with backspin by club, and roll friction per lie (tee, fairway, green, rough, sand). Misses scatter on the seeded stream, more from rough and sand. Water (painted ponds and the real sea tiles) and out of bounds (beyond the lot, or resting on a road or building tile) cost a stroke and replay from the last spot. The cup catches a slow ball passing within 0.45 m. After par+4 strokes the ball is picked up. A scorecard tracks birdies, aces and best round, and the clubhouse pays $100 per stroke under par. F quits. A ball and a flag mesh are added to the scene only during a round. |
| Achievements | 25, each `{id, name, desc, stat, goal}` and unlocked when `Systems.stats()[stat] >= goal` (checked every second and after every systems action). `Systems.unlock(id)` emits `achievement {id, name, desc}` once. |
| Stats | `Systems.stats()` is a flat model: `player.stats` plus missions, money peak, properties, stocks, golf, jobs, cheats, wardrobe and play time. `Systems.statsPage()` returns 6 sections (`career money combat travel leisure jobs`) of `{label, value (string), raw}` rows for the UI's stats page. |
| Cheats | Six harmless codes typed on the keyboard (own `keydown` listener on `window`, letters and digits only, in `playing` or `paused`, never while `Input.text.capture` is on), or entered with `cheats.enter(code)`. GOLDENHOUR (sunset), RESPECTFULY (nearby peds open with "Respectfully,"), BIGTAKES (big heads, toggle), TRUSTLESS (moon jump, toggle), WEATHERBALLOON (next weather state), SLOWNEWSDAY (half speed via `game.timeScale`, toggle). Cheats never block achievements; they have two of their own. |
| Jobs | **Damage Control** (paramedic parody): in any vehicle, stop in the job marker at Goldplate Memorial. Level n spawns n clients (at most 8) on sidewalks 60 to 140+ m away. Stop next to one to pick them up (3 seats), then stop at the hospital door to drop them off: $40 each, +8 s on the clock. **Hot Take Brigade** (firefighter parody): starts at The Yell Network. Level n lights n hot takes (at most 6, fire and smoke fx) on roads, each with its own fuse. Park within 9 m for 2.5 s to cool one off ($30). A level pays level x $150 or $175. The job fails when the clock or a fuse runs out, when the player is on foot for more than 12 s, dies, gets busted, or a mission or strand starts, or a client is knocked out. Clearing level 12 pays a $5,000 bonus, sets the flag `sys_job_<id>` and grants a perk: Damage Control gives +25% max health, Hot Take Brigade respawns you with 50 armor. |
| Wardrobe | Clothing in 5 slots (`top bottom shoes hat glasses`, 18 items, some gated by a mission, free items count as owned). `buy` buys and wears an item; `equip` wears an owned one. The barber sells 9 styles and 6 colours. Every change writes `player.look.outfit[slot] = itemId` (for the models track) plus the item's `look` overrides (`shirt`, `pants`, `hat`, `hatColor`, `glasses`, `shoes`) for the current renderer, then calls `GTP.Render.rebuildEntityMesh(player)` (fallback: `Render.detach` + `attach`). The look is re-applied on load and respawn. |
| Markers | World markers (`Render.markerMesh` / `addMarker`, created only within 90 m of the player and hidden in cutscenes, missions, golf and jobs) for properties for sale, owned safehouses, the golf tee and the two job starts. Walking into one (on foot, 0.5 s) or stopping in one in a vehicle (jobs, 1 s) fires it once, and it re-arms when you leave. Minimap entries come through `Missions.allMarkers` (see the wrappers). |
| Saves | 8 entries in `GTP.SaveRegistry` (`sys_properties sys_stocks sys_golf sys_achievements sys_cheats sys_jobs sys_wardrobe sys_stats`, each `{get() -> json, set(json)}`) plus a `GTP.SaveHooks` entry `systems` (`data.systems`) for today's v3 saves. Both paths are idempotent, so running both is harmless. A golf round and a running job are not saved: the round ends when a save loads, and a job does not survive a load. |

## Decisions

- **Data.** Every table is read lazily from `GTP.Content.parity.<name>` (`25_content_parity.js` loads after this file),
  and a present, non-empty table replaces the fallback wholesale. Accepted shapes: an array, or an `{id: def}` map
  (`stocks` may also be `{list, reactions, fee}`, `golf` `{holes, clubs, lines, name}`, `barber` `{styles, colors}` or one
  array with `kind:'color'` entries). Missing fields fall back to the built-in table:
  - an achievement without `stat` / `goal` (or `condition: {stat, goal|gte}`) inherits them from the fallback with the same id;
  - a cheat whose `effect` is not one of `clock respectfully bigheads moonjump weather slowmo` borrows the fallback's
    effect (by id, else by position), so six codes always work;
  - a job is merged over the fallback of the same id or kind (`rescue` / `douse`), lines included.
  - The stock reactions table is `parity.stockReactions` or `parity.stocks.reactions` (`{missionId: {TICKER: fraction}}`).
  All the fallback data is original and lives in `GTP.Systems.fallback` for reference.
- **Golf course geometry.** On the v0.2 map the lot is two 40 m lawns split by a cross street, with the sea to the west.
  Holes are in course space `{u, v}` (u across the lot, v along its long side) and resolved against `World.landmark('goldplate_links')`.
  When the world track adds named points to that landmark (`tee1`/`pin1`, `hole1_tee`, `h1_tee` or `tee_1`), they are
  used instead, and absolute `{x, z}` in the content table works too.
- **Game state during golf.** The game stays in `playing` (no `minigame` state, which the UI's debate overlay owns). The
  player's own controls are frozen by a wrapper, and the player is placed behind the ball facing the aim.
  `Render.rig.yaw` follows the aim.
- **Markers instead of keys.** Golf, properties and jobs start by standing (or stopping) in a light, like missions.
  Free keys were scarce: on foot, `action` fires the weapon.
- **Unhandled `property:open`.** The payload carries `handled: false`. A UI listener sets it to `true` and shows the
  property screen. If no listener claims it, an owned safehouse saves on the spot and a sale shows a toast, so save
  points work without the UI.
- **No GPS writes.** Jobs and golf never emit `gps:set` / `gps:clear`, so they cannot clobber the story route. They
  expose targets through `jobs.state().target` and minimap markers instead.
- **Income** is paid straight into `player.money` (no till to collect), with a toast and `property:income`.

## Interfaces exposed (`GTP.Systems`)

```js
Systems.update(dt); reset(); serialize() -> json; deserialize(json) -> bool; hud() -> {golf, job}; markers() -> [minimap marker]
Systems.properties: defs(); def(id); list() -> [{...def, x, z, owned, locked, lockReason, canBuy}]; ownedList(); owned(id); point(id)
                    buy(id) -> {ok, reason: 'unknown'|'owned'|'locked'|'money'|'mission'|'noplayer', need?}
                    save(id, {quiet}) -> {ok, reason: 'notsafehouse'|'notowned'|'mission'|'wanted'|'nosave'|'failed'}
                    sleep(id, hours=6) -> same as save; payDay(days) -> total; nearest(x, z, kind?)
Systems.stocks:     defs(); list() -> [quote]; quote(t) -> {ticker, name, flavor, price, change (24 h), history (48), qty, cost, value, avg, gain}
                    buy(t, qty) / sell(t, qty?) -> {ok, reason: 'unknown'|'qty'|'money'|'none', qty, price, total, gain?}
                    portfolio() -> {rows, value, cost, gain, realized, trades}; history(t); news(); tick(hours); shock(t, frac); react(missionId); fee()
Systems.golf:       holes(); course(); clubs(); active; canStart(); start({hole, single, force}) -> {ok, reason}
                    aimBy(rad); setAim(yaw); aimAtPin(); selectClub(dir|id); press(); shoot(power 0..1, yaw?); next(); quit(); end(reason)
                    settle(maxSeconds); lieAt(x, z); scoreName(strokes, par)
                    state() -> {active, phase:'aim'|'swing'|'flight'|'holed', hole, holes, name, par, length, strokes, ball:{x,y,z,lie}, pin, tee,
                                hazards:[{kind,x,z,r}], aim, club, clubName, clubCarry, clubs, meter, power, wind:{speed, dir}, distToPin,
                                card:[{hole, par, strokes, name}], total, totalPar, message, last, course}
Systems.achievements: defs(); def(id); list() -> [{id, name, desc, unlocked, at, progress 0..1, stat, goal}]; unlocked(id); count()
Systems.unlock(id) -> bool;  Systems.checkAchievements()
Systems.stats() -> {flat numbers};  Systems.statsPage() -> [{id, title, rows:[{label, value, raw}]}]
Systems.cheats:     defs(); list() -> [{id, name, desc, found, on, toggle, code (once found)}]; enter(code) -> bool; type(char) -> bool; isOn(id); activate(id)
Systems.jobs:       defs(); def(id); list() -> [{id, name, kind, best, done, levels, x, z}]; active (id|null); canStart(id)
                    start(id, {level, force}) -> {ok, reason: 'unknown'|'active'|'noplayer'|'vehicle'|'mission'|'busy'}; stop(reason)
                    state() -> {active, id, name, kind, phase:'between'|'run', level, levels, timer, earned, aboard, capacity, remaining, total,
                                calls:[{x, z, state, fuse, douse}], target:{x, z, kind:'client'|'fire'|'deliver'}, message}
                    debug.finishLevel(); debug.job()
Systems.wardrobe (alias Systems.clothing): clothing(); slots(); items(slot?, store?) -> [{...item, owned, equipped, locked, canBuy}]; item(id)
                    buy(id) -> {ok, reason: 'unknown'|'locked'|'money'|'noplayer', price}; equip(id) -> bool
                    hairOptions() -> {styles, colors}; haircut(styleId?, colorId?) -> {ok, reason, price}; current()
Systems.barber = { options() (= wardrobe.hairOptions), buy(styleId, colorId) (= wardrobe.haircut) }
Systems.applyLook(); Systems.fallback (the built-in tables); Systems.debug = { marks(), rebuildMarks(), tickClock(), golfRun(), rng() }
```

### Events emitted

Plan events: `achievement {id, name, desc}`, `golf:start {hole, holes, par, course}`, `golf:shot {power, angle, club, hole, stroke}`,
`golf:end {strokes, par, toPar, holes, full, reason, card}`, `property:open {id, name, kind, owned, price, income, locked, handled}`,
`shop:buy {item, price, kind:'property'|'clothing'|'barber'}`.

Additional events (for UI toasts and audio): `property:buy {id, name, price, kind}`, `property:income {total, days, items}`, `property:save {id, ok}`,
`property:sleep {id}`, `stocks:tick {hours}`, `stocks:trade {ticker, side, qty, price, total, gain?}`, `stocks:news {mission, moves}`,
`golf:hole {hole, strokes, par, name}`, `golf:holeStart {hole, par}`, `golf:rest {hole, lie, dist, strokes}`, `golf:penalty {kind, hole, strokes}`,
`cheat {id, name, on}`, `job:start {id, name, level}`, `job:level {id, level, calls, timer}`, `job:pickup`, `job:deliver {count, pay}`,
`job:douse {pay}`, `job:levelComplete {id, level, pay}`, `job:complete {id, bonus, perk}`, `job:end {id, reason, level, best, earned}`,
`clothing:buy {id, slot, price}`, `clothing:equip {id, slot}`, `barber:buy {style, color, price}`, `systems:reset`, `systems:loaded`.
Audio cues requested via `GTP.Audio.play`: `cash`, `ui`, `golf_swing`, `golf_putt` (missing names are no-ops).

## Interfaces consumed

`GTP.game` (`player`, `state`, `time {clock, day}`, `playTime`, `timeScale`, `saveSlot`, `activeSlot`, `debug.setClock/setWeather/spawnPed/teleport`),
`GTP.Missions` (`state.active/completed/flags`, `allMissions()`), `GTP.Strands.active()`, `GTP.Interiors.active` (feature-detected),
`GTP.World` (`landmark`, `heightAt`, `tileAt`, `T`, `tilesNear`, `solidAt`, `randomRoadPoint`, `w`), `GTP.Render` (`markerMesh`, `addMarker`,
`removeMarker`, `scene`, `rig.yaw`, `fx.add`, `rebuildEntityMesh` (environment track) or `detach`/`attach`, `updateEnvironment`, `weather`),
`GTP.Entities` (`list`, `near`, `remove`), `GTP.UI.toast`, `GTP.Audio.play`, `GTP.Input` (`down`, `pressed`, `text.capture`), `GTP.rng.fork`,
`GTP.Content.parity` (above). Events listened to: `mission:complete`, `mission:start`, `strand:start`, `player:respawn`, `player:wasted`,
`busted`, `world:generated`.

## Wrappers installed (fold these into their modules at integration)

| Wrapped | Why | Fold into |
|---|---|---|
| `GTP.Missions.update(dt)` | runs `Systems.update(dt)` after it (every step in `playing`, `cutscene` and `minigame`) | `Game.step`: call `GTP.Systems.update(dt)` beside `Strands.update` |
| `GTP.Missions.init()` | runs `Systems.reset()` after it (once per `newGame`, after the world and the player exist, before the save hooks load) | `Game.newGame`: call `GTP.Systems.reset()` after `Strands.init()` |
| `GTP.Missions.allMarkers()` | appends `Systems.markers()` (kind `system` with icons `property`, `home`, `golf`, `job`; kind `objective` for job calls, the drop-off and the golf pin) | `Missions.allMarkers` or the UI's `allMarkers()` |
| `GTP.Player.prototype.control(dt)` | returns early during a golf round (intent zeroed, not aiming) | `Player.control`: `if (GTP.Systems && GTP.Systems.golf.active) return;` |

Each wrapper is installed once (`._sys` marker on the wrapped function) and calls through with `apply`.

## Asks for other tracks

- **UI:** draw the golf HUD from `golf.state()` (top-down hole with ball, pin, hazards and the aim line; power meter; wind arrow;
  club; scorecard on `golf:hole` / `golf:end`), the stock app from `stocks.list()` / `portfolio()` / `news()`, the property screen
  on `property:open` (set `payload.handled = true`, then call `properties.buy` / `save` / `sleep`), the clothing and barber screens on
  `clothing:open` / `barber:open` (`wardrobe.items(slot)`, `wardrobe.buy`, `barber.options`, `barber.buy`), the job HUD from `jobs.state()`,
  achievement toasts, the stats page from `statsPage()`, and the cheats list from `cheats.list()`. Minimap icons: `property`, `golf`, `job`, `client`, `fire`, `hospital`.
- **Interiors:** the safehouse bed should call `GTP.Systems.properties.sleep(id)` (or `save(id)`), and the wardrobe should open the clothing screen.
- **World:** if the safehouse landmarks (`safe_brownstone`, `safe_marina_loft`, `safe_suburb`, `safe_penthouse`) and the golf `tee<n>` / `pin<n>`
  points exist, they are used automatically. Until then the safehouses stand 7 m from `char_charter`, `fish_shack`, `culdesac_gas` and `goldplate_tower`.
- **Content:** the schemas above. The ids I key on are `damage_control`, `hot_take_brigade` and the cheat effects.
- **Story (saves v4):** iterate `GTP.SaveRegistry`. The `systems` SaveHook can then be dropped.
- **Vehicles:** `property.garage` holds the slot count per safehouse for `GTP.Vehicles.store`.

## Known issues / limits

- No dedicated ambulance or fire-truck vehicle: any vehicle works for the jobs. Clients are ordinary peds from
  `debug.spawnPed` and may wander a little. The call follows them.
- The camera does not follow the ball in flight. The HUD is expected to show the hole from above.
- The par-4 holes are short (64 m), because the course lot is two 40 x 80 m lawns. The parity table or world points can lengthen them.
- `SLOWNEWSDAY` sets `game.timeScale`, which the stunt slow motion also writes. Whichever writes last wins.
- Business income is paid on the `time.day` rollover only, and sleeping pays it too. Rewinding the clock never pays twice.
