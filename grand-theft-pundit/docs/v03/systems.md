# v0.3 systems track: notes

Branch `v03/systems`. Owns `js/14_systems.js` and `tests/systems.js`. The module is simulation plus events; the UI
track draws the screens.

After integration round 1, the module reads the real `GTP.Content.parity` tables and the real UI, interiors and save APIs.
The built-in fallback data tables were removed because content now supplies them. Only what parity lacks stays built in:
golf clubs and physics lines, stand-in anchors for the four safehouses until the world track's landmarks land, cheat
effect code, and job tuning numbers. QA triage is in `docs/v03/triage_systems.md`; no QA finding points at this file.

Run: `cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/systems.js` (about 40 s, 10 sections, two
screenshots: `tests/out/systems_golf.png` (the golfer and the UI golf panel), `tests/out/systems_wardrobe.png`).
`node tests/content_audit.js` stays green.

## What is built

| Part | What it does |
|---|---|
| Properties | `parity.properties` (11 on this build: the pod van, 4 safehouses, 6 businesses, one locked behind `b06_panel`). An entry with `owned: true` or price 0 is owned from the start. Buying charges cash. Businesses pay `income` once per game day, catching up to 7 days at once. Owned safehouses are save points: `save`, and `sleep` (+6 h, full health, then save). **Safehouse interiors need owning:** a wrapper on `GTP.Interiors.enter` refuses an unowned safehouse and emits `property:open` instead, which the UI's property card shows. Until the world track lands the `safe_*` landmarks, the safehouses use stand-in markers about 7 m from `char_charter`, `velvetine_pier`, `culdesac_gas` and `goldplate_tower`. Saving there works directly. Once a real landmark exists, the interior's bed takes over and the stand-in marker disappears. |
| Stocks | The 8 parity tickers. Each game hour every price takes a log-normal step (`vol`, `drift`, a soft pull toward the listing price) on the systems' own rng. Every ticker's `reacts` table applies on the first non-replay `mission:complete`; the effect is a fraction (`b02_velvetine` sends VELV up 35%). Trades use `stockApp.fee`: a value below 1 is a fraction of the trade (at least $1); otherwise it is flat dollars. Money moves in whole dollars. Buy cost rounds up. Sell proceeds round down. The cost basis includes the buy fee. 96 hours of history are kept. |
| Golf | `parity.golf`: 9 holes. `tee` / `pin` are metres from the `goldplate_links` door. A World point on that landmark (`tee1`/`pin1`, `hole1_tee`, `h1_tee`, `tee_1`) wins when the world track adds one. Hazard names become geometry: `bunker` is a sand circle short of the green; `water` is a pond across the middle; `ribbon`, `hedge`, `helicopter` and `ramp` are gags for the HUD. The green's 11 m circle counts as lawn even where the pin sits on a street tile (holes 3 and 9 do on this map). The `greenFee` ($200) is charged at the tee light, which refuses with reason `funds` when you are short. Score names come from `scoreNames` ("Birdie (A Ten)"). `displayPar` and the gag are passed through. Caddy lines sometimes appear after a shot. The physics: 4 clubs (auto-picked per shot), two-press power meter, wind, loft, bounce with backspin, roll per lie, penalties for water and OB with a replay from the spot, cup radius 0.45 m, pick-up at par+4. The clubhouse pays $100 per stroke under par, at most $500 a round. |
| Golf and the UI | `golf.hud()` feeds `11_ui.js`'s golf panel (hole 1-based, par, strokes, wind, club name, distance, lie, phase, power, angle). Because it reports `power`, the UI only draws and leaves the swing to this module. `golf:start` fires for every hole (the UI panel restarts per hole) with `{hole (1-based), index, holes, par, displayPar, course, wind, club, dist}`. Controls: A/D aim, W/S club, Space, left mouse or Enter swings (two presses), F quits. The camera snaps behind the golfer when he walks to the ball. |
| Achievements | `parity.achievements` (26) with their `trigger`: `{mission}`, `{anyMission}`, `{flag}`, `{stat, count}`, and `{event, ...fields}`. For an event trigger, every other field must equal the payload's; `stars`, `holes`, `score`, `level` and `count` compare with `>=`. Event listeners are added on the first reset. `hidden` passes through. Stats added for parity triggers: `weaponsOwned` (from `player.weapons`), `shopsVisited` (distinct armory stores on `interior:enter`) and `maxedCars` (vehicles reaching engine 4, brakes 3 and armor 5 on `vehicle:mod`). Nobody else emits **`wanted:cleared {stars}`**, so this module does when the wanted level drops to 0 while the player is alive (not on a bust or death). `Systems.unlock(id)` emits `achievement {id, name, desc}` once; `Systems.unlocked(id)` answers the UI. |
| Stats | `Systems.stats()` returns the flat number model plus `sections` (6: career, money, discourse, getting around, leisure, jobs; `{title, rows:[{label, value, raw}]}`), which is what the UI's phone STATS tab reads. `Systems.statModel()` returns the numbers only. |
| Cheats | `parity.cheats` (8), typed on the keyboard (own `keydown` listener, in `playing` or `paused`, never while `Input.text.capture` is on) or entered with `cheats.enter(code)`. The toast is the entry's `toast`. Effects: `heal` (health full, armor 100), `clear_wanted`, `gold_everything` (every car gold, new ones too while on; off restores the old paint), `big_heads` (toggle), `low_gravity` (moon jumps, toggle), `spawn_vehicle` (`vehicle`, `wrap`), `cycle_weather`, `money` (`amount`). Kept for content that wants them: `clock`, `respectfully`, `slowmo`. |
| Jobs | `parity.jobs`. **Damage Control:** a van (`vehicle.type/color/wrap/label`) parked on the road by `vehicle.parkedAt` (the hospital). Get in and press **E (`action`) while stopped** to start; E again while stopped ends the run. Level n has n patients (named, with lines, from `patients`) on sidewalks. Stop beside one to pick them up (3 seats), then stop at the nearest `dropOff` door (Goldplate Memorial or the Green Room Motel). **Hot Take Brigade:** a truck at `police_hq`. Level n has n flame wars (`fires`, with fire and smoke fx). **Hold shoot within `sprayRange` (14 m)** to spray the foam, or park within 9 m; 2.5 s puts one out. Timer: `base + Σ(perMetre × leg + perPatient\|perFire)`. Pay: `perPatient\|perFire` per call plus `perLevel × level`. `rewards` apply once per save at their level: money, a flag (`damage_controlled`, `fireproof`) and a toast. The flags are perks: `damage_controlled` makes health pickups heal double and gives the van double hp; `fireproof` refunds 40% of explosion, hot-take and fire damage. A job fails when the clock runs out, after 12 s on foot, or when a patient is knocked out; death, a bust, or a mission or strand starting ends it too. Job vehicles exist only within 220 m of their spot and are cleared beyond 320 m when nobody is in them. A wrecked one comes back out of sight. |
| Wardrobe | `parity.clothing.items` `{id, slot, style, color, price}`. Top colour goes to `look.shirt`, bottom to `look.pants`, shoes to `look.shoes`; hat to `look.hat = style` plus `hatColor`; glasses to `look.glasses = style`. Every item also goes into `look.outfit[slot] = id` for the models track. `hat_none` / `glasses_none` are implicit free items. `outfits` are bundles: the bundle price unless every piece is owned. Barber: `styles[].hair` goes to `look.hair`; `colors[].hex` goes to `look.hairColor`, and `hex: null` ("Natural") restores the starting colour (kept on `player._sysBaseLook`). The mesh is rebuilt through `Render.rebuildEntityMesh` when it exists, else `detach` + `attach`; the cached pivots `_parts` are cleared. |
| Markers | World lights (`Render.markerMesh`, within 90 m, 12 m hysteresis, hidden in cutscenes, missions, golf and jobs) for properties for sale, owned stand-in safehouses and the golf tee. Minimap entries come from `Systems.markers()`: kind `system` with icons `property`, `home`, `golf` and `job` (the live job vehicles); kind `objective` for patients, flame wars, the drop-off and the golf pin. |
| Saves | 8 `GTP.SaveRegistry` entries (`sys_properties sys_stocks sys_golf sys_achievements sys_cheats sys_jobs sys_wardrobe sys_stats`, `{get, set}`) in the v4 `registry`. The systems' rng state rides in `sys_stats.rng`. The `systems` SaveHook is now **load-only**: it reads `data.systems` from v3 saves migrated into v4 with an empty registry, and writes nothing. A golf round and a running job are not saved. |

## Decisions (integration round 1)

- **Removed the fallback tables** for properties, stocks, golf holes, achievements, cheats, jobs, clothing and barber:
  `25_content_parity.js` supplies them. Without parity the lists are empty and nothing throws. Golf refuses with `nocourse`.
- **Reason names follow the UI:** money refusals are `funds` everywhere (properties, stocks, clothing, barber, golf);
  selling more shares than held is `shares`.
- **UI call names** added as aliases: `buyClothing(id, {slot})` (an outfit id works too), `buyHaircut(id, {slot})`,
  `barber.buy(id, {slot})` (the id may be a style or a colour), `buy(kind, id, opts)`, `owns(id)`, `buyProperty`,
  `ownsProperty`, `properties.get(id)`, `unlocked(id)`, `golf.hud()`. Stock quotes carry `id`, `symbol` and `shares`.
- **Jobs start from their own vehicle,** as the content's `start` text says, instead of a road marker. Entering a job
  vehicle shows that text as a toast.
- **`property:open`** is marked `handled: true` when `GTP.UI.openProperty` exists, since the UI opens its card on the event.
- **Golf prize capped** at $500 a round: holes on this map are short (23 to 54 m), and a perfect bot shoots 18 on par 31.

## Interfaces exposed (`GTP.Systems`)

```js
Systems.update(dt); reset(); serialize(); deserialize(json); hud() -> {golf: golf.hud(), job}; markers() -> [minimap marker]
Systems.properties: defs(); def(id); get(id); list(); ownedList(); owned(id); point(id); byLandmark(id)
                    buy(id) -> {ok, reason: 'unknown'|'owned'|'locked'|'funds'|'mission'|'noplayer'}; save(id); sleep(id, hours=6); payDay(days); nearest(x, z, kind?)
Systems.stocks:     defs(); list() -> [{id, ticker, symbol, name, price, change, history, shares, qty, cost, value, avg, gain}]; quote(t)
                    buy(t, n) / sell(t, n?) -> {ok, reason: 'unknown'|'qty'|'funds'|'none'|'shares'}; portfolio(); history(t); news(); tick(h); shock(t, f); react(missionId); fee(value); app()
Systems.golf:       holes(); course(); clubs(); config(); fee(); active; canStart(); start({hole, single, force}) -> {ok, reason, fee}
                    aimBy(rad); setAim(yaw); aimAtPin(); selectClub(dir|id); press(); shoot(power, yaw?); next(); quit(); end(reason); settle(s)
                    lieAt(x, z); scoreName(strokes, par); state() (full simulation); hud() (the UI panel)
Systems.achievements: defs(); def(id); list() -> [{id, name, desc, hidden, unlocked, at, progress, stat, goal}]; unlocked(id); count()
Systems.unlock(id); unlocked(id); checkAchievements(); stats() -> {numbers..., sections}; statModel(); statsPage()
Systems.cheats:     defs(); list(); enter(code); type(char); isOn(id); activate(id)
Systems.jobs:       defs(); def(id); list() -> [{id, name, kind, best, done, levels, start, x, z}]; vehicle(id); active; canStart(id)
                    start(id, {level, force}); stop(reason); state() -> {active, id, name, banner, kind, phase, level, levels, timer, earned, aboard,
                    capacity, remaining, total, calls:[{x, z, state, name, douse}], target:{x, z, kind:'patient'|'fire'|'deliver', name}, message}
Systems.wardrobe (= Systems.clothing): clothing(); outfits(); slots(); items(slot?, store?); item(id); owns(id); buy(id); equip(id); buyOutfit(id)
                    hairOptions(); haircut(a, b|{slot}); current()
Systems.barber = { options(), buy(id, {slot}) }; buyClothing; buyOutfit; buyHaircut; owns; buyProperty; ownsProperty; buy(kind, id, opts)
Systems.applyLook(); Systems.debug = { marks(), rebuildMarks(), tickClock(), ensureJobCars(), golfRun(), rng() }
```

### Events

- **Emitted (plan):** `achievement`, `golf:start`, `golf:shot`, `golf:end`, `property:open`, `shop:buy {item, price, kind}`.
- **Emitted (extra):** `wanted:cleared {stars}`, `property:buy | income | save | sleep`, `stocks:tick | trade | news`, `golf:hole {hole, index, strokes, par, name, pickedUp}`,
  `golf:holeStart`, `golf:rest`, `golf:penalty`, `cheat {id, name, effect, on}`, `job:start | level | pickup | deliver | douse |
  levelComplete | reward | complete | end`, `clothing:buy`, `clothing:equip`, `barber:buy`, `systems:reset`, `systems:loaded`.
- **Consumed:** `mission:complete`, `mission:start`, `strand:start`, `player:respawn`, `player:wasted`, `busted`, `world:generated`, `pickup`,
  `damage`, `interior:enter`, `vehicle:mod`, `vehicle:enter`, plus every achievement trigger's event.

## Interfaces consumed

- **Content:** `GTP.Content.parity`: properties, stocks, stockApp, golf, achievements, cheats, jobs, clothing, barber.
- **Game:** `GTP.game` (player, state, time, playTime, timeScale, saveSlot, activeSlot, steps, debug.setClock / setWeather / setWanted / spawnPed / spawnVehicle).
- **Missions and strands:** `GTP.Missions` (state, allMissions), `GTP.Strands.active()`.
- **Interiors:** `GTP.Interiors.enter / active`.
- **World:** `GTP.World` (landmark, door, points, heightAt, tileAt, T, tilesNear, solidAt, nearestRoadPoint, nearestSidewalkPoint).
- **Render:** `GTP.Render` (markerMesh / addMarker / removeMarker, scene, rig.yaw / snap, fx.add, rebuildEntityMesh or detach / attach, updateEnvironment, weather).
- **Entities, AI and input:** `GTP.Entities`, `GTP.AI.wanted.clear`, `GTP.Input` (down, pressed, text.capture).
- **UI:** `GTP.UI` (toast, openProperty, modal).
- **Audio and randomness:** `GTP.Audio.play`, `GTP.rng.fork`.

## Wrappers installed (fold these into their modules at integration)

| Wrapped | Why | Fold into |
|---|---|---|
| `GTP.Missions.update(dt)` | runs `Systems.update(dt)` after it (playing, cutscene, minigame) | `Game.step`: `GTP.Systems.update(dt)` beside `Strands.update` |
| `GTP.Missions.init()` | runs `Systems.reset()` after it (once per `newGame`, before the save hooks and registry load) | `Game.newGame`: `GTP.Systems.reset()` after `Strands.init()` |
| `GTP.Player.prototype.control(dt)` | returns early during a golf round | `Player.control`: `if (GTP.Systems && GTP.Systems.golf.active) return;` |
| `GTP.Interiors.enter(id, opts)` | refuses an unowned safehouse (`safe_*` id, a `safehouse` kind or landmark) and opens the property card (throttled to once per 2 s while the door keeps retrying); `opts.force` bypasses | `Interiors` door logic: ask `GTP.Systems.properties.owned(prop.id)` for safehouses |

## Seen in other tracks (evidence, not fixed: not my files)

- **UI (`js/11_ui.js` `wardrobeCats` / `applyItemToLook`):** the barber screen lists every array in `parity.barber` as a category
  (`stores` and `barks` next to `styles` and `colors`). `applyItemToLook` reads `it.style` where parity barber styles carry `it.hair`.
  After a haircut the UI writes `look.hair = 'cut_mohawk'` (the item id) over the `'mohawk'` this module applied. Suggested fix:
  `it.hair || it.style`, and only `styles` / `colors` as barber categories.
- **UI:** `Systems.markers()` (property, golf and job icons) is not yet appended in the UI's `allMarkers()`. The minimap
  therefore shows no systems icons.
- **Input:** typing a cheat code that contains P (ISTHISPAID) pauses the game, because P is the pause key. The code still
  registers, since the listener runs in `paused`.

## Adversarial review 2 (integrated build)

Fixed in `14_systems.js`:
- **`wanted:cleared` false positives:** a mission retry, abort, fail or start clears the stars without an escape, and a save never carries a chase (`peakStars` is not saved).
- **CODETAKESTWENTY:** with no road in reach (interiors, the sea) it shows a toast instead of throwing.
- **Job vehicles:**
  - A job counts only in its own van or truck (`jobs.start(id, {anyVehicle: true})` lifts that, for tools).
  - A wrecked one is released to the normal wreck timer, and its replacement waits until the wreck is gone.
  - After a load, the job vehicle the player sat in is adopted again from its `sys_job:<id>` tag.
- **Golf on reset or load:** a round in progress ends with `golf:end` (reason `reset`), so the UI's panel closes.
- **Throws in job vehicles:** spraying or pressing E never throws the equipped mic out of the window. While the player sits in a job vehicle the module holds Combat's `_cookLock`.
- **Smaller fixes:**
  - The safehouse door's refusal throttle resets on a new game or load.
  - `hud().wind.dir` is relative to the aim, for the UI's screen-space arrow.
  - Fireproof covers the real damage types: `explosion`, `explode`, `hottake`, `hotmic`, `ratio`, `rocket`, `stickynote`, `confetti`, `firework`.
  - Outfits honour `unlock`.
  - The maxed-cars stat no longer requires turbo, matching the achievement text.
  - `properties.get(id)` computes one property, and points are cached per world.
  - A patient removed by another module no longer fails the job.

Found in other tracks' files (not fixed here):
- **UI wardrobe:** after a successful buy the UI rebuilds `p.look` from its own `applyItemToLook`. This drops the shoe colour, writes the barber item id as `look.hair` and reverts "Natural" hair colour. The UI also reads parity directly, so `hat_none` / `glasses_none` and the outfits never show. Suggested fix: after `res.ok`, use `m.committed = cloneLook(p.look)`, and take the rows from `Systems.wardrobe.items()`.
- **UI golf end banner:** `golfTerm(strokes, par)` runs on the round totals, so 18 on par 31 reads "ALBATROSS". Use `toPar` / `full`, and show the per-hole `golf:hole`.
- **UI hidden achievements:** the achievements grid checks `a.secret`, but parity uses `hidden`.
- **UI job HUD and minimap:** the UI never reads `jobs.state()`, so no job timer appears on screen. It also does not append `Systems.markers()` in `allMarkers()`.
- **Interiors bed:** sleep has no cooldown, so pressing it repeatedly fast-forwards days and farms property income once `safe_*` interiors are live. A cooldown, or calling `Systems.properties.sleep`, would fix it.
- **Input:** the gamepad has no `action` binding, so jobs (E) cannot start on a pad.

## Adversarial review (before integration)

A reviewer subagent read the module against the engine. Fixed:
- Enter quitting golf.
- Stale animation pivots after a look change.
- Unlock markers missing until a reload.
- A job restarting itself on its own start spot.
- The unbounded marker pulse.
- Perk stacking.
- The rng not being saved.
- NaN on a sell.
- Trade rounding.
- A stale ball mesh after `settle`.
- WEATHERBALLOON entered twice quickly.
- An unclamped job level.
- The spawn fallback drawing from the world's rng.
- Per-step allocations.
- Marker churn at the draw edge.
- Two strings too close to real-world references.

## Known issues / limits

- The parity golf holes are short on this map (23 to 54 m), and some tees and pins sit on street tiles. They play,
  because the green counts as lawn and the ball never rests on the tee's tile, but the world track's tee and pin points
  (round 2) will place them on real lawn.
- Patients are ordinary peds from `debug.spawnPed` and may wander a little; the call follows them.
- The camera does not follow the ball in flight. The UI panel shows the numbers.
- `slowmo` (when content uses it) and the stunt slow motion both write `game.timeScale`.
