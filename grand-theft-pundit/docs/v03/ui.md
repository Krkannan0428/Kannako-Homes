# v0.3 track: ui (`js/11_ui.js`, `js/02_input.js`)

Branch `v03/ui`. Every screen in the PLAN_V03 "ui" section is built in `js/11_ui.js` (the v0.3 block sits between
the minigames and the API, plus small hooks in the existing HUD, map, phone, input and event code). The other v0.3
modules are stubs on this branch, so every screen reads the plan's events and APIs with feature detection, falls back to
built-in sample data where content is missing, and is tested by emitting the events with sample payloads
(`tests/ui_v03.js`). No wrapper is installed on another track's module.

**Integration round 1** (merged `game/grand-theft-pundit` 65dc2b7, then 10ba585): every screen now reads the real
modules' APIs and events (see "Integration round 1" below; the tables that follow describe the screens, the section
below is what they consume now). The QA triage of every finding whose hint points at this track is in
`docs/v03/triage_ui.md`.

## What was built

| Screen | Opened / fed by | Notes |
|---|---|---|
| Phone calls | `phone:call {from, lines}` | A call card (portrait in a ringing ring, INCOMING CALL, then the lines one by one with a timer and progress dots). Lines are strings or `{who, text}`. Calls queue and wait for `playing` (never over a cutscene, menu or shop). Player keeps control. Every line goes to a call log (STORY tab). |
| GPS | `gps:set {x, z, label, kind}`, `gps:clear` | Route from `GTP.World.route(ax, az, bx, bz)`, else `World.findPath(.., {mode:'car'})`, else a straight line; trimmed as it is driven, rebuilt every 3 s or 35 m off route. Drawn thick in the kind's colour on the minimap (rim diamond when far) and on the big map (with the label). A turn chip above the minimap: next turn (left / right / around / straight), distance, destination, total. The HUD arrow falls back to the GPS target, so a new player always has an arrow. Kinds: `story` gold, `job` cyan, `shop` green, `property` white, other purple. Non-story GPS clears on arrival (12 m). |
| Chapter cards | `chapter {act, title}` | Full-width cinematic card (ACT II / title) for 5.2 s over play and cutscenes. |
| STORY tab | `GTP.Story.chapter`, `GTP.Story.next()` | Phone tab 2 and a STORY item in the pause menu. Chapter header with story progress, NEXT UP (giver portrait, mission title, place, distance, SET GPS -> emits `gps:set` kind story), the chapter list from `GTP.Content.parity.chapters`, recent calls. Without `GTP.Story` NEXT UP uses the first `Missions.available()` mission. |
| Long-range labels | `Missions.allMarkers()` + the GPS target | Floating labels with distance over mission markers out to 420 m (shops / doors to 160 m), fading with distance, decluttered, the story's next mission tagged STORY in gold. |
| Armory | `interior:enter {kind:'armory'}`, `armory:inspect {weaponId}`, `UI.openArmory(storeId, weaponId)`, TAB (lockOn) inside the armory | Weapon list (class-sorted, owned / price / LOCKED) + weapon card: hero icon with tint colour, class, hold, flavor, five stat bars (attachment hover previews the change), tabs PURCHASE (facts: magazine, reserve, reload, range, carrying) / AMMO / ATTACHMENTS (slot tags) / TINTS (swatches), Merle's line, BUY / EQUIP, a Gear & Services page. Icons for any of the 32+ parity weapons by class. |
| Range HUD | `range:start {seconds, medals}`, `range:hit {points}`, `range:end {score, medal}` | Timer, score, hits, a medal track with bronze / silver / gold ticks, `+points` floats; a medal card on the end. `GTP.Interiors.range.hud()` (if present) overrides the clock and score. |
| Mod shop | `modshop:open {vehicle}`, `UI.openModShop(vehicle)` | Spin Doctor Customs: categories (primary / secondary colour, finish, wheels 0-5, spoiler 0-3, tint 0-3, engine 0-4, brakes 0-3, armor 0-5, turbo, horn) and options with prices, live preview, performance bars with the preview delta, orbit camera on the car, revert on exit unless bought. |
| Clothing / barber | `clothing:open`, `barber:open`, `UI.openWardrobe('clothing'|'barber')` | Category chips, items with swatches and prices, live preview on `player.look`, the camera in front of the player (framed clear of the panel), revert on exit unless bought. |
| Property | `property:open {id}`, `UI.openProperty(id)` | Listing card: illustration, FOR SALE / OWNED ribbon, price, income per day, garage, description, BUY. |
| Heist board | `heist:board {missionId}`, `UI.openHeistBoard(missionId)` | Corkboard: approach index cards, crew polaroids per role with cuts, string to the take sticky note (gross, crew %, skill), CONFIRM emits `heist:plan {approach, crew:[castIds], missionId, take}`. |
| Golf | `golf:start [{hole, par, wind:{speed, dir}, club, dist}]`, `golf:end {strokes, par}` | Scorecard chip, wind disc, swing meter (aim left / right, shoot or jump starts the meter, the second press sets power and emits `golf:shot {power, angle, hole}`), result card (HOLE IN ONE / EAGLE / BIRDIE / PAR / BOGEY ...). Player control is held while a hole is in play. |
| Cover and aim prompts | `cover:enter [{low}]`, `cover:exit`, `player.pose.cover`, `Combat.cover.available(player)` | Bottom-centre key pills: TAKE COVER near cover; PEEK / BLIND FIRE / VAULT (low cover) / LEAVE COVER in cover; AIM / FIRE while a gun is out until the player has aimed 3 times (or 40 s); HOLD TO COOK for thrown weapons; BAIL OUT in an aircraft above 30 m; CUT AWAY under a canopy. |
| Crosshair states | `Combat.aim`, `Combat.hud()` | A dot with four ticks spread by the bloom. States (`UI.state.crosshair.state`): aim, hostile (red), friendly (amber), range (grey, hollow), hit, headshot (gold + tag), kill (pink X), reload (arc), blind (dashed ring), melee (ring), throw (lob arc), hip (bare dot after hip fire), scope. |
| Vehicle HUDs | `vehicle.hud() -> {speed, alt, pitch, roll, heading, throttle, gear}` | Bike (speed arc in MPH, lean gauge, gear, WHEELIE), helicopter / plane / jet (attitude ball, heading tape, ALT and speed readouts, V/S, gear, rotor spin-up, throttle or collective bar, PULL UP / STALL), boat (knots, heading, throttle, PLANING). Optional extra fields read: `vspeed`, `stall`, `pullUp`, `rotor`, `planing`. Vehicle name on `vehicle:enter`. |
| Parachute | `player.parachute = {state:'freefall'|'open'}` or `player.freefall`, or a vehicle of type `parachute` | Freefall: a pulsing DEPLOY PARACHUTE prompt with the altitude (red below 60 m). Canopy: altitude, descent rate, steering keys. |
| Boss bar | `boss:phase {id, phase, hp, maxHp, name, [phases]}`, `boss:defeated {id}` | Name, PHASE n (flash + announcement on change), hp with a damage trail and phase dividers; a RATIO'D stamp on defeat. Bottom-centre on desktop, under the minimap on phones. |
| Special meters | `special:state {id, meter, active}` | One ring per special that reported a state (focus, shout, chatmob, boost + any other id), meter 0..1 or 0..100, glow while active, a pulse when full, the `special` key when a full one is usable here. |
| Achievements | `achievement {id, name, [desc]}` | A gold pill sliding from the top with a trophy, queued, once per id; description from `GTP.Content.parity.achievements`. |
| STOCKS tab | `GTP.Systems.stocks` | Tickers with sparkline, price, change pill, holdings, portfolio and cash; BUY 1 / BUY 10 / SELL 10 / SELL ALL; Enter buys 10, Delete / X sells 10. Without systems the parity tickers show MARKET CLOSED. |
| STATS | `GTP.Systems.stats()`, achievements | The v0.2 rows plus career sections from systems and the achievements grid (secret ones hidden until unlocked). |
| Interior fades | `interior:fade {phase}`, `interior:enter`, `interior:exit` | 0.35 s fade to / from black (a lone `out` clears after 3 s), the place name card, a browse hint in the armory / clothing / barber / safehouse. |

| Radio ticker (v0.3 radio track) | `GTP.Audio.radio.nowPlaying()` or `station.nowPlaying` (a string or `{kind:'song'|'show'|'news'|'caller', title, artist, caller, text}`), `station.bulletins` / `station.newsBulletins` / `station.news` (array of strings or `{text|headline}`), `station.callers` / `calls` / `callIns` (strings or `{caller, text}`) | The station chip as before; a new now-playing item shows once when it changes (NOW PLAYING / ON AIR / NEWS / CALLER tags), one bulletin per game hour in the first 3 minutes (tag `NEWS 14:00`), a caller every seventh line. |
| Stranger side missions (v0.3 strangers track) | `GTP.Strangers.markers() -> [{id, x, z, y, title, giver}]`, `GTP.Strangers.list() -> [{id, title, giver, status:'available'|'active'|'done'|'locked', line, x, z}]` | A purple `?` blip on the minimap and the map (legend entry), a long-range label, a row in the phone's MISSIONS tab with GPS (emits `gps:set` kind `stranger`). Without `list()` the rows come from the markers. If the strangers register as Missions or Strands instead, the existing mission / strand paths show them. |

Phone tabs are now `MAP, STORY, MISSIONS, STOCKS, STATS, STRANDS, REPLAY` (`GTP.UI.phoneTabs`), the pause menu has
STORY after RESUME. Every screen works at 400 px wide (side panels become bottom sheets, lists shrink, the heist board
scales its polaroids, touch buttons add COVER / SPCL and switch labels in vehicles and aircraft).

## Integration round 1 (the real modules)

What each screen reads now (all still feature-detected; the sample-payload paths stay as fallbacks for a build
without the module):

| Screen | Real source | Notes |
|---|---|---|
| GPS / chapter / calls / STORY | `09_missions.js` (`GTP.Story`): `gps:set {x, z, label, kind:'story'|'objective', route, missionId, giver, landmark}`, `chapter {act, title, roman, missionId}`, `phone:call {from, lines:[{who, name, color, text}]}`, `Story.next()`, `Story.progress() {done, total}` | The payload's `route` is used when present (there is no `World.route`; `World.findPath` otherwise). Story / objective / stranger routes never auto-clear. The chip says STORY or OBJECTIVE. The chapter card strips the "Act I:" prefix and shows `roman`. Call lines keep the speaker's name and colour. |
| Heist board | `heist:board {missionId, approaches:[{id, name, hostiles, payout, wanted, line}], crew:[{id, name, cut, perk}], mission}` from `GTP.Heist` | The payload is authoritative (its ids are what `Heist.setPlan` knows); `parity.heists.<id>` only adds the board title, an approach's pitch and a crew member's role / pitch. Crew is a row of toggles (up to 4, `Heist.setPlan` keeps 4); the sticky note shows the job's pay (`h03_job` reward x payout, minus the cuts capped at 60 %, the same rule as `Heist.payout`) and the heat stars. `heist:plan {approach, crew, missionId, take}`. The board reopens on the saved plan. |
| Interiors | `13_interiors.js`: `interior:enter {id, kind, store, branch, landmark}`, `interior:fade`, `interior:exit`, `armory:inspect {weaponId, itemId, store, ...}`, `UI.openArmory({store, landmark, counter})`, `clothing:open {store, wardrobe, booth}`, `barber:open {store}` | `GTP.UI.interiorFade = true` so Interiors skips its DOM fade (the UI draws it). Store names come from `Combat.shop._stores` / `World.landmark(id)`. Indoors (`Interiors.active`) the minimap becomes an INDOORS card with the store name and the GPS chip, the objective arrow and the long-range labels are hidden (the rooms are built far from the city: the newplayer run showed "TURN AROUND 4.3 km" in the armory). |
| Range | `range:start {store, weapon, seconds}`, `range:hit {points, zone, score, moderator}`, `range:end {score, medal, hits, shots, best, aborted, bonus}`, `GTP.Interiors.range` (raw `{running, t, score, hits, shots}`), `GTP.Interiors.MEDALS` | A 3-2-1 countdown (Interiors' `COUNTDOWN` 3 s is inside `range.t`), the clock from `range.t`, negative floats for moderators, hits / shots, an aborted round is a toast instead of a medal card. |
| Armory | `Combat.catalog(store)`, `Combat.buy(itemId, {store})` | `{store}` (not `storeId`); an owned attachment toggles (REMOVED: ... when `equipped` comes back false). Tint swatches from `GTP.Assets.weaponTints[variant].main`. |
| Cover / aim | `Combat.hud()`: `cover {active, high, edge, canVault, blind}` or `{near, nearHigh}`, `prompt 'counter'|'cover'|'vault'|'peek'`, `crosshair {hostile, target, inRange}` | COUNTER prompt (jump) on an incoming melee; PEEK at an edge or over low cover, else AIM; VAULT on `canVault`. The aim tutor retires after the first aim (or 15 s) and never shows under the `h_aim` hint. |
| Lock-on labels | entities | A boss weak point (a `BossPart`, kind `heli`) shows its `label`, never WEATHER BALLOON, and is not a cop blip; a boss ped's bar uses the encounter's hp (its own is a 100000 placeholder); vehicles show their display name (`Vehicles.hud(v).name`, else the UI table), never the class id. |
| Vehicle HUDs | `06b_vehicles_air_sea.js`: `vehicle.hud() {family, name, mph, alt, vs, pitch, roll, heading (degrees), throttle, gear, rotor, stall, lean, wheelie, chute, prompt}`, `vehicle.cls.family` | The category comes from `cls.family`; heading is degrees; the bike gauge uses `lean` / `wheelie`; BAIL OUT follows `hud().prompt`. Parachute: `v.chute 'free'` is the DEPLOY prompt, `'open'` the canopy panel (CUT AWAY), `'landed'` nothing; the radio ticker is hidden under a canopy. |
| Mod shop | `Vehicles.modCatalog(v)`, `buyMod(v, part, value)`, `priceOf`, `mod` | Categories are the catalog's parts; a colour costs a respray (`priceOf('paint', {finish})`); `buyMod` charges and emits `shop:buy` itself. |
| Property | `Systems.properties.list()` rows `{id, name, kind, price, income, garage, flavor, landmark, owned, locked, unlock}`, `buy(id)` (reasons `money`, `mission`, `locked`, `owned`), `sleep(id)` | `property:open`'s payload gets `handled = true` so Systems does not also toast / save. An owned safehouse shows SLEEP & SAVE (Systems sleeps six hours and saves; refused while wanted, on a mission or in a cutscene). A locked listing names the mission that unlocks it. |
| Stocks | `Systems.stocks.list()` `{ticker, name, price, change (24 h), history, qty, avg, gain}`, `buy/sell(ticker, qty)` (reasons `money`, `none`, `qty`) | Systems plays the register sound; the toast shows the total with the fee. |
| Golf | `Systems.golf.state()` | Systems owns the round and reads the input itself; the UI only draws (hole 1-based, `clubName`, `distToPin`, the meter while swinging, wind relative to the aim, the card total) and never emits `golf:shot`. `golf:hole` shows the hole's card, `golf:end {strokes, par, toPar, holes, full}` the round's (queued behind a hole card). |
| Stats / achievements | `Systems.statsPage()` sections, `Systems.achievements.list()` (+ `def(id).hidden`) | With the page present the phone keeps only Subscribers, Day / time and Wanted on top; achievements show progress bars; hidden ones read ??? until unlocked. |
| Wardrobe / barber | `Systems.wardrobe.items(slot, store)` / `buy(id)`, `Systems.barber.options()` / `buy(styleId, colorId)` | The rows carry `_sys` so the buy goes back with the same ids; Systems applies the look. Rows that are not clothing (see "Other tracks" below) are dropped and the content list is bought locally instead. |
| Map markers | `Systems.markers()` (properties, safehouses, golf, jobs, job calls, the pin), strangers' missions | Systems' entries are appended (icons golf, $, job, fire, client); a mission whose `strandOf()` is a stranger strand is drawn as a purple `?` and listed in MISSIONS as a purple row with the strand's progress and a GPS button (the fake `Strangers.markers()` / `list()` paths are gone). |
| Boss bar / specials | `boss:start`, `boss:phase {id, phase, phases, hp, maxHp, name, shield, state, hint}`, `boss:end`, `boss:defeated`, `Bosses.hud()`; `special:state {id, meter, active, unlocked, name}` | `GTP.UI.drawsBossBar = drawsSpecials = true` so 08b_bosses' fallback bar and meters stand down. Grey bar and the shield text while shielded, the hint under it; no PHASE announcement (the bosses banner it); hidden during dialogue. A special that is not `unlocked` is not shown. |
| Radio | `Content.radio.nowPlaying(id)` for stations with songs | `Audio.radio.nowPlaying()` returns the "Station - tagline" string; it is ignored (the chip already says it). The news runner in `23_content_radio.js` keeps calling `UI.ticker` (not replaced). |
| Hints | `GTP.Hints.current()` / `dismiss()` | A hint leaves a second after the player did what it asks (aim, move, look, reload, open the wheel, open the map) instead of its full six seconds. |
| Title | `GTP.VERSION` | Shows 0.3.0 while `00_util.js` still says 0.2.0 (`desktop/package.json` is 0.3.0); a newer `GTP.VERSION` wins. |

Exposed for the other tracks and tests: `GTP.UI.interiorFade`, `drawsBossBar`, `drawsSpecials` (flags),
`openArmory({store, landmark, counter})` as well as `(storeId, weaponId)`, `openHeistBoard(payload | missionId)`,
`allMarkers()`, `pauseItems()` (the pause menu ids / labels; `tests/newplayer.js` walks to SAVE with it),
`wantsMenuPad()` (02_input asks it for the pad context), `Input.consume(actions)`.

## Interfaces consumed before integration (sample payloads; still the fallbacks)

- Events listened to: `gps:set`, `gps:clear`, `phone:call`, `chapter`, `interior:fade`, `interior:enter`,
  `interior:exit`, `armory:inspect`, `range:start`, `range:hit`, `range:end`, `clothing:open`, `barber:open`,
  `modshop:open`, `property:open`, `heist:board`, `boss:phase`, `boss:defeated`, `special:state`, `achievement`,
  `golf:start`, `golf:end`, `vehicle:enter`, `vehicle:exit`, `cover:enter`, `cover:exit`, `hitmarker` (zone `head`).
- Events emitted: `gps:set` (STORY tab SET GPS), `heist:plan {approach, crew, missionId, take}`,
  `golf:shot {power, angle, hole}`, `shop:buy {item:{id, kind:'mod'|'clothing'|'barber', ...}, price, player}` (mod
  shop / wardrobe fallback buys only), `property:buy {id, price}` (fallback buy only), `ui:close {kind}` when a v0.3
  screen closes.
- `GTP.Story.next() -> {missionId, giver, landmark, x, z}`, `GTP.Story.chapter` (object `{act, title}`, a number /
  string act id, or a function returning either).
- `GTP.World.route(ax, az, bx, bz) -> [{x, z}]` (fallback `World.findPath`), `World.raycastBuildings` (modal camera
  pull-in), `World.heightAt`.
- `GTP.Combat.catalog(storeId) -> [{id, kind, weaponId, name, price, owned, equipped, locked, lockReason, stats}]`;
  optional item fields read: `slot` (attachments; else `Content.parity.attachments[id].slot`, else parsed from the id),
  `color` / `hex` (tints; else `Content.parity.tints`), `canBuy`, `listPrice`, `pitch`.
  `GTP.Combat.buy(itemId, {storeId, weaponId, equip:true}) -> {ok, reason, price, need, lockedBy}`; reasons shown:
  `funds`, `locked`, `owned`, `notOwned` / `noWeapon`, `full`, `flagship`. Buying an owned attachment or tint is how
  the UI asks to equip it. Without `catalog` the v0.2 `Combat.shop.items()` / `shop.buy()` feed the same card.
- `GTP.Combat.cover.available(player)` (or `.available` / `.candidate(player)`, or `player.coverHint`) for the TAKE
  COVER prompt; `player.pose.cover {high, blind}` for the in-cover prompts and the blind-fire crosshair.
- `GTP.Combat.hud()` (`weapon`, `bloom`, `hitmark {age, kill, zone}`, `scope`, `cook`), `GTP.Combat.aim`
  (`active, screen, target, targetScreen, hover, inRange, lockT`).
- `GTP.Content.parity`: `weapons` (class, hold, flavor, mag, reserve, reload, range, projectile), `attachments`,
  `tints`, `chapters`, `achievements`, `modshop` (`categories` merged by id over the built-in ones, `paints`),
  `clothing` / `barber` (an array of items with `slot` / `category`, an array of `{id, name, items}`, `{items}`,
  `{categories}`, or an object of arrays; item fields `id, name, price, color|hex, style`), `properties`,
  `stocks`, `missions[].heist` (or `heists[missionId]`) `{take, approaches:[{id, name, desc, mult, risk, color}],
  roles:[{id, name, options:[{id castId, cut, skill}]}]}`, `range.medals`.
- `GTP.Vehicles.mod(vehicle, mods)` for the preview and the result, `GTP.Vehicles.buyMod(vehicle, cat, value, price)`
  if it exists (then the UI does not charge). Without `Vehicles.mod` the UI sets `vehicle.mods` / `vehicle.color` and
  rebuilds the mesh.
- `GTP.Systems`: `buyClothing(id, {slot})` / `clothing.buy`, `buyHaircut(id, {slot})` / `barber.buy`,
  `buy(kind, id, {slot})`, `owns(id)`; `buyProperty(id)` / `properties.buy(id)`, `properties.get(id)` /
  `properties.list`, `properties.owned(id)` / `ownsProperty(id)`; `stocks.list()` (or an array / `{tickers}`) of
  `{id|symbol, name, price, history, shares}`, `stocks.buy(id, n)`, `stocks.sell(id, n)`, `stocks.portfolio()`;
  `stats()` -> rows or `{sections:[{title, rows}]}`; `unlocked(id)` / `achievements.unlocked`; `golf.hud()` ->
  `{hole, par, strokes, wind, club, dist, lie, phase, power, angle}` (when it reports `power` the UI only draws and
  does not emit `golf:shot`). Results may be `true` or `{ok, reason}`; without these the UI pays and applies itself.
- `GTP.Render.rebuildEntityMesh(entity)` (fallback: `Render.detach` + `attach`), `Render.freeCam`, `Render.camera`.
- `GTP.Interiors.active`, `GTP.Interiors.range.hud()`.
- `vehicle.hud()`, `vehicle.type` (`moto`/`bike`/`scooter`, `heli`, `plane`/`jet`, `speedboat`/`jetski`/`boat`,
  `parachute`), `vehicle.name`, `vehicle.air`.

## Interfaces exposed

`GTP.UI`: `openArmory(storeId, weaponId)`, `openModShop(vehicle)`, `openWardrobe('clothing'|'barber')`,
`openProperty(id)`, `openHeistBoard(missionId)`, `closeModal()`, `modal()`, `openStory()`, `phoneTabs`,
`gps.set / clear / get`, `skipCall()`, `state.modal` (the open v0.3 screen), `state.gps`, `state.crosshair.state`,
`state.prompts`, `_v3` (test hooks).

`GTP.Input` (`js/02_input.js`):
- New actions `cover` (Q; pad B tap < 0.22 s, B held stays sprint), `special` (Shift + right mouse, which also aims;
  X; pad L3), `pitchUp pitchDown rollLeft rollRight yawLeft yawRight throttleUp throttleDown` (W S / A D / Q E /
  Shift Ctrl; pad context `air`: left stick pitch + roll, LB RB yaw, RT LT throttle). Boats use the car controls.
- `Input.flight = {pitch, roll, yaw, throttle}` (-1..1, pitch +1 nose up, roll +1 right) every step from keys, pad and
  the touch stick. `Input.inAircraft()`.
- `Input.latch(actions)` / `Input.latched(action)`: hold actions released until every source lets go.
- Pad contexts `foot`, `car`, `air`, `menu` (a v0.3 modal is `menu`). Camera mode left the pad on foot (L3 is the
  special; V on the keyboard; R3 in vehicles).
- Q no longer aims (the right mouse button / LT do). The hint text "(or Q)" from the v0.2 content is stripped at draw
  time; the content line in `24_content_expansion.js` should drop it at integration.

## Decisions

- The v0.3 shop screens are modals in state `playing` (like the v0.2 shop page): the world ticks, the player is held,
  the UI consumes input; a modal closes on any state but `playing` / `paused`, and closing latches the confirm / shoot
  keys so the closing press never fires.
- The mod shop and wardrobe charge `player.money` and emit `shop:buy` only when no systems / vehicles API exists; with
  the API the UI only calls it.
- Golf: with `GTP.Systems.golf` present the systems module owns the swing and its input and the UI only draws; the
  UI's own meter (`golf:shot {power, angle}`) is the fallback for a build without it.
- Integration: a payload from the module that owns the data (heist ids, store ids, golf holes) wins over the content
  tables; the content only adds text. A module's flag (`interiorFade`, `drawsBossBar`, `drawsSpecials`) is set once the
  UI draws that piece, so the fallbacks never double up.
- Indoors the HUD stops navigating the city (no GPS chip, objective arrow, long-range labels, city minimap).
- STORY sits right after MAP in the phone so RB from the map lands on it.
- GPS story routes do not clear on arrival (the story track moves them on); other kinds do.
- Hip fire shows a bare dot only while the bloom from recent shots is up.

## QA bugs fixed (docs/v03/qa_r1_bugs.json)

- QA-C1-02: QUIT on the CONTEXT STAMPED card drops that retry for good: the UI remembers the dropped `lastFail` and
  `retryOffer()` ignores it, so a later death or bust never re-offers the card (and `Missions._dropRetry` is still
  called if the story track adds it).
- QA-C1-07: NEW GAME with no saves passes `{opening: true}` (`FAST_START_OPENING = true`), so the first-ever game plays
  `cs_opening` and the `h_move` / `h_look` hints.
- QA-C1-08: Escape in a skippable cutscene no longer opens the pause menu (the cutscene skips the shot; P / Start
  pause); on the CONTEXT STAMPED card Escape is QUIT before the pause check.
- QA-C1-09: REPLAY from the phone closes the pause menu first, so `Missions.replay` runs from `playing` and plays the
  intro; a refusal reopens the phone.
- QA-C1-12: a MISSION PASSED card is dropped when a cutscene starts.
- CMB-06: closing a dialogue line with a click or E latches shoot / action until released, and every return to
  `playing` latches them too, so the dismissing press never fires.
- CMB-12: the hot mic fuse is drawn outside aim mode (on foot from the hip and in a car), with the seconds left.
- CMB-14 (UI part): STATS shows hits capped by shots with an accuracy %, and head shots fall back to a UI count of
  `hitmarker` events with zone `head` while `stats.headshots` is missing (the counting itself is the combat track's).

## Tests

```
cd grand-theft-pundit
NODE_PATH=/opt/node-tools/node_modules node tests/ui_v03.js   # every v0.3 screen, the input actions, the QA bugs, phone width
NODE_PATH=/opt/node-tools/node_modules node tests/ui.js       # the v0.2 UI suite, updated for STORY / the pause index / ten touch buttons
```

Screenshots: `tests/out/v3_*.png` (gps_hud, gps_map, labels, call_ring, call_talk, chapter, story_tab, armory_enter,
armory_card, armory_attach, armory_tints, armory_ammo, armory_locked, range_hud, range_medal, modshop, modshop_engine,
wardrobe, barber, property, property_owned, heist, golf, golf_end, prompts_cover, cross_aim, cross_gallery, cook_fuse,
parachute_open, parachute_freefall, veh_moto, veh_heli, veh_jet, veh_speedboat, boss_specials, boss_down, achievement,
stocks, stats, touch_foot, phone_armory, phone_modshop, phone_heist, phone_wardrobe, phone_story, phone_golf,
phone_call, night_hud, strangers_phone, strangers_map).

## Known issues / for integration

- With the opening now on the fast NEW GAME path (QA-C1-07), `tests/audio.js`, `tests/feel.js` and
  `tests/campaign.js` (not this track's) fail on this branch: each presses Enter on the title and then drives or
  replays the opening itself, but the opening cutscene now starts on its own. Verified: with `FAST_START_OPENING`
  set back to false all three pass. Fix at integration in those tests (clear `GTP.game._openingPending` after the
  title's Enter, as `tests/ui.js` does, or expect the cutscene); the story track owns the New Game flow.
  `tests/all.js` on this branch: 17 of 20 files pass, those three are the only failures.
- `24_content_expansion.js` hint `h_aim` still says "(or Q)" and lists Q; the UI strips both at draw time.
- The wardrobe and mod shop cameras pull in for buildings only (props such as signs can block the view outdoors; the
  shops open inside interiors in the real flow).
- The fake vehicle HUD screenshots use a sedan with its type swapped for one frame; the real meshes come from the
  vehicles track.
