# v0.3 track: ui (`js/11_ui.js`, `js/02_input.js`)

Branch `v03/ui`. Every screen in the PLAN_V03 "ui" section is built in `js/11_ui.js` (the v0.3 block sits between
the minigames and the API, plus small hooks in the existing HUD, map, phone, input and event code). The other v0.3
modules are stubs on this branch, so every screen reads the plan's events and APIs with feature detection, falls back to
built-in sample data where content is missing, and is tested by emitting the events with sample payloads
(`tests/ui_v03.js`). No wrapper is installed on another track's module.

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

Phone tabs are now `MAP, STORY, MISSIONS, STOCKS, STATS, STRANDS, REPLAY` (`GTP.UI.phoneTabs`), the pause menu has
STORY after RESUME. Every screen works at 400 px wide (side panels become bottom sheets, lists shrink, the heist board
scales its polaroids, touch buttons add COVER / SPCL and switch labels in vehicles and aircraft).

## Interfaces consumed (all feature-detected)

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
- The swing meter belongs to the UI (the plan has the systems track simulate, the UI draw); `golf:shot` carries the
  power (0..1) and the aim angle (radians, + right).
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
phone_call).

## Known issues / for integration

- With the opening now on the fast NEW GAME path, `tests/feel.js` and `tests/campaign.js` (other tracks / shared) may
  see a cutscene right after the title's Enter; they should clear `GTP.game._openingPending` or skip the opening the
  way `tests/ui.js` does. The story track's New Game flow is expected to own this anyway.
- `24_content_expansion.js` hint `h_aim` still says "(or Q)" and lists Q; the UI strips both at draw time.
- The wardrobe and mod shop cameras pull in for buildings only (props such as signs can block the view outdoors; the
  shops open inside interiors in the real flow).
- The fake vehicle HUD screenshots use a sedan with its type swapped for one frame; the real meshes come from the
  vehicles track.
