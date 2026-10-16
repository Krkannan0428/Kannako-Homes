# Grand Theft Pundit: engine contract

A top-down, GTA 1/2 style open-city game in plain HTML5 canvas and vanilla
JavaScript. Zero dependencies, zero build step. `index.html` runs from `file://`,
from any static server, and (via `build-artifact.js`) as a single inlined page.

Everything in this document is a contract. Agents implementing one module must
honor the interfaces here so the other modules fit. If a change to the contract
is unavoidable, update this file in the same commit and say so in your report.

## 0. Hard constraints

- **Classic scripts only.** No ES modules, no `import`, no bundler. Every file in
  `js/` is loaded by `index.html` with `<script src>` in the order listed below.
  All modules attach to one global namespace: `window.GTP`.
- **No external assets.** No images, fonts, or audio files. Sprites are drawn
  procedurally into offscreen canvases. Sound is synthesized with WebAudio.
- **Deterministic simulation.** All randomness goes through `GTP.rng` (seeded).
  The fixed timestep is `1/60 s`. Given a seed and an input sequence the world
  evolves identically. `Math.random()` is banned in `js/`.
- **Headless mode.** `index.html?headless=1` disables requestAnimationFrame,
  audio, and the title screen. Tests then call `GTP.game.advance(seconds)` to
  step the simulation synchronously. Rendering still works on demand via
  `GTP.game.render()`.
- **Never throw out of the loop.** The loop catches exceptions, pushes them to
  `GTP.errors` (array of `{time, message, stack}`), and keeps running. Tests
  assert `GTP.errors.length === 0`.
- **Content rules.** `CONTENT_RULES.md` applies to all strings and art.
- **Artifact-ready.** `index.html` must work when its `<!doctype>`, `<html>`,
  `<head>` and `<body>` wrappers are stripped and everything is inlined
  (`build-artifact.js` does that). So: `<title>` first, a `<style>` block with
  all CSS tokens on `:root`, `color-scheme: dark` (single dark arcade theme),
  `html, body { height: 100% }` not `100vh`, side gutter
  `padding-left: max(16px, env(safe-area-inset-left, 0px))` and the matching
  right padding on the outer wrapper, every `localStorage` access in try/catch,
  audio only starts after a click/keypress, and `confirm()/alert()/prompt()`
  are never used.

## 1. Files and load order

```
grand-theft-pundit/
  index.html             page shell: <title>, <style>, <div id="app">, <canvas id="game">, overlay DOM, scripts
  build-artifact.js      node script: inlines css+js into dist/artifact.html (no html/head/body wrappers)
  js/00_util.js          GTP.util, GTP.rng, GTP.Vec helpers, GTP.SpatialHash
  js/01_config.js        GTP.C  (all tunable constants and the palette)
  js/02_input.js         GTP.Input
  js/03_audio.js         GTP.Audio (SFX + radio synth)
  js/04_world.js         GTP.World (tile map, districts, landmarks, road direction field, collision, pathing)
  js/05_entities.js      GTP.Entity base + Ped, Vehicle, Player, Projectile, Pickup
  js/06_ai.js            GTP.AI (ped wandering, traffic, police + wanted system)
  js/07_combat.js        GTP.Combat (weapons table, damage, death, respawn)
  js/08_missions.js      GTP.Missions (objective interpreter, markers, dialogue queue, minigames hooks)
  js/09_render.js        GTP.Render (camera, chunk cache, sprites, effects, weather/night tint)
  js/10_ui.js            GTP.UI (HUD, minimap, dialogue box, menus, title, death screens, phone, touch controls)
  js/20_content_world.js   GTP.Content.world  (district layout, landmarks, spawn tables)
  js/21_content_cast.js    GTP.Content.cast   (characters, portrait recipes, voice style)
  js/22_content_missions.js GTP.Content.missions (mission scripts)
  js/23_content_radio.js   GTP.Content.radio  (stations, ad reads, ticker lines)
  js/30_game.js          GTP.Game: boot, state machine, fixed-step loop, save/load, debug API
  tests/                 Playwright scripts (node, no npm install; use /opt/node-tools/node_modules/playwright)
  tests/smoke.js         boots the page headless, advances 10 s, asserts no errors, screenshots
  tests/content_audit.js scans js/ and *.md for banned terms (see CONTENT_RULES.md)
  README.md
```

Content files (`2x_*`) are pure data plus small helper functions. Engine files
(`0x_*`, `1x_*`) never hard-code content; they read `GTP.Content`.

## 2. Coordinates and units

- World units are pixels. `GTP.C.TILE = 32`. The map is `GTP.C.MAP_W` x
  `GTP.C.MAP_H` tiles (default 128 x 128, 4096 px square).
- `x` grows right, `y` grows down. Angles are radians, `0` = facing +x,
  increasing clockwise on screen (standard canvas).
- Time: `dt` is seconds; the fixed step is `GTP.C.STEP = 1/60`.
- Logical viewport: `GTP.C.VIEW_W = 1280`, `GTP.C.VIEW_H = 720`. The canvas is
  resized to the container and scaled uniformly (letterboxed) to show that
  logical area; `GTP.Render.cam.zoom` applies on top (default 1).

## 3. Globals and module interfaces

### GTP.util / GTP.rng (00_util.js)

```js
GTP.rng.seed(n)              // reseed (mulberry32 or similar)
GTP.rng.random()             // [0,1)
GTP.rng.range(a,b)           // float in [a,b)
GTP.rng.int(a,b)             // integer in [a,b]
GTP.rng.pick(arr)            // random element
GTP.rng.chance(p)            // boolean
GTP.util.clamp(v,a,b); lerp(a,b,t); dist(x1,y1,x2,y2); angleTo(x1,y1,x2,y2)
GTP.util.wrapAngle(a); angleLerp(a,b,t); sign(v); hash(str) -> int
GTP.util.circleHit(ax,ay,ar,bx,by,br); aabbHit(ax,ay,aw,ah,bx,by,bw,bh)
GTP.util.fmtMoney(n) -> "$1,234"
GTP.SpatialHash(cellSize)    // insert(ent), remove(ent), update(ent), query(x,y,r) -> array, clear()
```

### GTP.C (01_config.js)

All numbers that tune feel live here, with comments: player walk/run speed,
vehicle classes (`sedan`, `sports`, `suv`, `truck`, `van`, `cop`, `taxi`,
`bus`, `bike`), each with `accel, maxSpeed, brake, turnRate, grip, hp, w, h,
seats, color pools`; weapon stats are in 07_combat. Palette tokens for render:
`GTP.C.PAL = { road, roadLine, sidewalk, grass, water, sand, parking, buildingRoofs:[...], ... }`.

### GTP.Input (02_input.js)

```js
GTP.Input.init(canvas)       // keyboard, mouse, touch listeners
GTP.Input.down(action)       // boolean, action from the table below
GTP.Input.pressed(action)    // true only on the frame the action went down
GTP.Input.set(action, bool)  // virtual input (tests, touch controls)
GTP.Input.endFrame()         // clears pressed flags; called by Game after each step
GTP.Input.mouse              // {x, y, worldX, worldY, down, moved}
GTP.Input.actions            // list of action names
```

Actions: `up down left right run action shoot enter weaponNext weaponPrev horn
radio map pause confirm back`. Default bindings: WASD + arrows; Shift = run;
Space = action/shoot (on foot) and handbrake (in car); F or Enter = enter/exit
vehicle; Q/E = weapon cycle (also mouse wheel); H = horn; R = radio; M = map;
Esc/P = pause; Enter/Space = confirm in menus; Esc/Backspace = back.
Touch (see UI): left-half virtual stick, right-side buttons.

### GTP.Audio (03_audio.js)

```js
GTP.Audio.init()             // creates AudioContext lazily on first user gesture; no-op in headless
GTP.Audio.unlock()           // call from a click/keydown handler
GTP.Audio.play(name, opts)   // sfx: 'shot','punch','hit','explode','pickup','horn','siren','enter','mission','fail','ui','cash','debate'
GTP.Audio.engine(level)      // 0..1 continuous engine loop
GTP.Audio.radio.setStation(i) / next() / current() -> {name, ...} / stop()
GTP.Audio.setMuted(bool) / muted
```

Radio stations are tiny procedural sequencers (oscillators + gain envelopes) with
patterns defined in `23_content_radio.js`. Ads and DJ lines are shown as text
tickers by the UI, never spoken.

### GTP.World (04_world.js)

```js
GTP.World.generate(seed)     // builds tiles from GTP.Content.world; idempotent for a seed
GTP.World.w, .h              // in tiles
GTP.World.tiles              // Uint8Array w*h of GTP.World.T.*
GTP.World.T                  // enum: VOID, ROAD, SIDEWALK, BUILDING, GRASS, WATER, SAND, PARKING, PLAZA, BRIDGE
GTP.World.tileAt(px, py)     // tile enum at world pixel
GTP.World.solidAt(px, py)    // true if blocks peds/cars (BUILDING, WATER, VOID)
GTP.World.roadDir(px, py)    // {dx,dy} unit lane direction for traffic on ROAD tiles, or null
GTP.World.isIntersection(tx,ty)
GTP.World.districts          // [{id,name,x,y,w,h (tiles),style,tint}]
GTP.World.landmarks          // [{id,name,district,x,y (px center),w,h,kind,label}]
GTP.World.landmark(id)       // -> landmark or null
GTP.World.districtAt(px,py)  // -> district or null
GTP.World.randomRoadPoint(), randomSidewalkPoint(), nearestRoadPoint(px,py)
GTP.World.findPath(ax,ay,bx,by, {mode:'car'|'ped'}) -> [{x,y},...] or null (A* on coarse grid, bounded)
GTP.World.buildings          // [{x,y,w,h (px), roofStyle, height, landmark|null}] for render + collision
GTP.World.resolveCircle(x,y,r) -> {x,y,hitX,hitY} // pushes a circle out of solid tiles (slides)
```

Map generation: `GTP.Content.world.layout` describes a block grid (road every N
tiles, district rectangles with styles, water edges, a bridge, parks, a highway
loop) plus a list of landmarks pinned to blocks. `generate` carves roads,
sidewalks and buildings deterministically from it. Roads are 2 lanes each way
(4 tiles wide) on avenues and 1 each way (2 tiles) on streets. Lane direction:
right-hand traffic.

### GTP.Entity and subclasses (05_entities.js)

```js
class GTP.Entity { id, kind ('ped'|'vehicle'|'player'|'projectile'|'pickup'|'fx'), x, y, vx, vy, angle, radius, hp, maxHp, alive, age, update(dt), onDeath(), bounds() }
class GTP.Ped extends Entity   { name, look{...}, state ('idle'|'walk'|'flee'|'attack'|'chase'|'dead'), target, inVehicle, weapon, role ('civ'|'cop'|'thug'|'protester'|'npc'), speakLine() }
class GTP.Vehicle extends Entity { type, cls (from GTP.C.VEHICLES), speed, steer, driver (Ped|null), passengers[], color, damage, isPolice, siren, honk(), enter(ped), exit(ped), applyDamage(n, src) }
class GTP.Player extends Ped   { money, wanted (0..5), wantedHeat (float), weapons {id: ammo}, weapon (id), armor, vehicle (Vehicle|null), stats {...} }
class GTP.Projectile extends Entity { owner, weaponId, dmg, life }
class GTP.Pickup extends Entity { pickupType ('cash'|'health'|'armor'|'weapon'|'mission'), value, weaponId }
GTP.Entities = { list: [], hash: SpatialHash, add(e), remove(e), byKind(kind), near(x,y,r,kind?), clearDynamic() }
```

Physics rules:
- Peds: velocity set from intent (walk 70 px/s, run 140 px/s), resolved against
  `World.resolveCircle`, pushed apart from other peds lightly.
- Vehicles: arcade car model. `speed` along `angle`; `accel/brake/reverse` from
  driver intent; steering scaled by speed; lateral velocity bled by `grip`
  (handbrake lowers grip for drifts). Collide with solid tiles as an oriented
  box approximated by 4 corner circles: bounce, lose speed, take damage. Collide
  with other vehicles via circle approximation with impulse. Hitting a ped at
  speed > 60 px/s knocks them down and damages them; the ped ragdoll-slides.
- Vehicle `hp` 0 → smoke, then fire, then explosion after 3 s (damages nearby).
- Entities farther than `GTP.C.ACTIVE_RADIUS` (1600 px) from the player are
  despawned by the AI spawner unless flagged `persistent` (mission entities).

### GTP.AI (06_ai.js)

```js
GTP.AI.update(dt)            // runs ped brains, traffic, police, spawner
GTP.AI.spawner               // keeps ~N peds and ~M cars alive around the player using World spawn points
GTP.AI.wanted                // {level, heat, add(amount, reason), decay(dt), onCrime(type, x, y)}
GTP.AI.policeResponse(level) // what spawns per star: 1 foot cops, 2 cruisers, 3 roadblocks, 4 SWAT vans, 5 helicopter shadow + everything
GTP.AI.driveTo(vehicle, path) / followLane(vehicle) / avoidAhead(vehicle)
```

Crimes and heat: hitting a ped (+1 heat), killing a ped (+3), shooting near
cops (+2), stealing an occupied car (+2, +1 more if a cop sees), destroying a
vehicle (+3), attacking a cop (+5). Levels: heat thresholds `[2, 6, 12, 20, 30]`.
Heat decays when no cop has line of sight to the player for 4 s. Cops on foot
try to arrest (touch for 1 s while the player is on foot or stopped → `busted`).
Cruisers ram and box in. Pay-and-spray style escape: entering a landmark of kind
`garage` with a car clears wanted for `$` cost.

### GTP.Combat (07_combat.js)

```js
GTP.Combat.WEAPONS = { fist:{...}, pistol:{dmg,rate,speed,range,ammoPerPickup,spread}, smg:{...}, shotgun:{...}, megaphone:{ /* pushes peds back, no damage, raises heat */ }, hottake:{ /* throws a flaming take, area stun */ } }
GTP.Combat.fire(shooter, weaponId, angle) // spawns projectiles/melee hit, consumes ammo, plays sfx
GTP.Combat.damage(target, amount, source, kind)
GTP.Combat.autoAim(shooter, maxRange, coneRad) -> target entity or null
GTP.Combat.onPlayerDeath() -> Game.setState('wasted'); respawn at hospital after 3 s, lose weapons, keep money minus 10%
GTP.Combat.onPlayerBusted() -> Game.setState('busted'); respawn at police station, lose weapons, fine $500
```

### GTP.Missions (08_missions.js)

Mission data shape (in `22_content_missions.js`):

```js
{
  id: 'm01_table',            // unique, sortable
  title: 'Prove Me Right',    // shown in banner
  giver: 'sloane',            // character id in GTP.Content.cast
  marker: 'campus_quad',      // landmark id where the mission starts (blue marker)
  requires: ['m00_intro'],    // ids that must be complete
  reward: 400,                // $ on completion
  intro: [ {who:'sloane', text:'...'}, {who:'player', text:'...'} ],  // dialogue before objectives
  outro: [ ... ],             // dialogue after the last objective
  objectives: [
    { type:'goto', target:{landmark:'campus_quad'} , text:'Get to the quad', radius:48 },
    { type:'drive_to', target:{x:1000,y:800}, vehicle:'any'|'spawned:<tag>', text:'Drive the van to the station' },
    { type:'enter_vehicle', spawn:{type:'van', tag:'podvan', at:{landmark:'parking_lot'}}, text:'Get in the pod van' },
    { type:'pickup', spawn:{pickupType:'mission', count:5, around:{landmark:'mall'}, radius:300}, text:'Collect 5 sponsor boxes' },
    { type:'follow', spawn:{ped:'leaker', at:{...}, path:[...]}, maxDist:400, text:'Tail the leaker' },
    { type:'escape_wanted', setWanted:2, text:'Lose the cops' },
    { type:'survive', seconds:45, waves:{thug:6}, text:'Hold the table for 45 s' },
    { type:'destroy', spawn:{vehicle:'van', count:3, tag:'ads'}, text:'Wreck the rival ad vans' },
    { type:'defeat', spawn:{ped:'thug', count:4, around:{...}}, text:'Clear out the hecklers' },
    { type:'dialogue', lines:[...] },
    { type:'minigame', game:'debate'|'ratio', text:'Win the debate', params:{rounds:3} },
    { type:'timer_wrap', seconds:90, objectives:[ ... ] }   // fail if inner objectives not done in time
  ],
  failOn: ['player_dead','vehicle_lost:podvan'],   // optional extra fail rules
  onComplete: { unlockWeapon:'smg', setFlag:'has_van' }      // optional
}
```

Runtime:

```js
GTP.Missions.init(); update(dt); state: {active: mission|null, objectiveIndex, flags:{}, completed:Set, failed:{id:count}}
GTP.Missions.available()     // missions whose requires are complete and not yet done
GTP.Missions.start(id); abort(); completeObjective(); fail(reason)
GTP.Missions.markers()       // [{x,y,kind:'mission'|'objective', id}] for Render and minimap
GTP.Missions.on(event, fn)   // events: 'start','objective','complete','fail'
GTP.Missions.dialogue        // queue of lines; UI pops them; Missions pauses the objective clock while a line shows
```

Objective evaluation is pure: each objective type has `start(ctx)`, `check(ctx) -> 'done'|'fail'|null`, `cleanup(ctx)`. `ctx` exposes the player, world, entities, spawned tagged entities, and timers. Minigames are implemented in UI (`GTP.UI.minigames.debate`, `.ratio`) and resolve a promise-like callback `onResult(win)`.

### GTP.Render (09_render.js)

```js
GTP.Render.init(canvas); resize(); cam = {x,y,zoom,shake}; worldToScreen(x,y) / screenToWorld(sx,sy)
GTP.Render.frame(alpha)      // draws world layers, entities (sorted by y then z), fx, weather, then UI.draw(ctx)
GTP.Render.sprites           // cache: vehicle(type,color), ped(look), building roofs; all procedural
GTP.Render.fx.add({type:'puff'|'spark'|'smoke'|'fire'|'explosion'|'text', x,y,...})
GTP.Render.night             // 0..1 from the day clock; applies a tint overlay and headlights/streetlights
```

Chunk cache: static tiles are pre-rendered into 16x16-tile offscreen canvases
on first use (LRU-capped). Markers: mission markers are pulsing cylinders;
objective markers are arrows; the minimap shows them as dots. Camera leads the
player in the direction of motion (more in a vehicle), with smoothing.

### GTP.UI (10_ui.js)

```js
GTP.UI.init(); update(dt); draw(ctx)
GTP.UI.screen                // 'title'|'none'|'pause'|'wasted'|'busted'|'missionComplete'|'missionFailed'|'phone'|'minigame'
GTP.UI.showDialogue(line) / closeDialogue()      // line {who, text}; portrait from cast recipe; advance with confirm
GTP.UI.banner(text, sub)     // mission title cards
GTP.UI.toast(text)           // small timed notice (pickups, radio station changes, wanted)
GTP.UI.touch                 // virtual stick + buttons; shown when pointer is coarse or on first touch
GTP.UI.minigames.debate(params, onResult) / ratio(params, onResult)
GTP.UI.drawPortrait(ctx, recipe, x, y, size)      // parametric face (skin, hair, glasses, hat, tie, mic...)
```

HUD layout (logical 1280x720): top-left health/armor bars and money; top-right
wanted stars; bottom-left weapon + ammo; bottom-right minimap (200x200, rotates
with nothing, north-up, shows roads, player arrow, markers, cops when wanted);
top-center objective text; bottom-center dialogue box when active; a radio
ticker strip above the minimap when in a vehicle.

### GTP.Content (2x files)

- `world`: `layout` (see World), `landmarks` (`id, name, kind, block:{bx,by}, size, label`), `spawn` tables (ped looks and roles per district, vehicle types per district), `districtStyles`.
- `cast`: `{ id: { name, role, portrait: {skin, hair, hairColor, glasses, hat, extra, tie}, color, voice: 'smug'|'bored'|..., bio (one line, in-world) } }`. Must include `player`.
- `missions`: ordered array; the first (`m00_intro`) has `requires: []`.
- `radio`: `stations: [{id, name, tagline, bpm, scale, pattern: {...}, adLines:[...], djLines:[...]}]`, `ticker: [...]`.

### GTP.Game (30_game.js)

```js
GTP.game = new GTP.Game(); GTP.game.boot({headless, seed, mission, skipTitle})
GTP.game.state               // 'title'|'playing'|'paused'|'wasted'|'busted'|'cutscene'|'minigame'|'gameover'
GTP.game.setState(s)
GTP.game.step()              // one fixed step: Input → Missions → AI → entities → Combat → Camera; then Input.endFrame()
GTP.game.advance(seconds)    // headless: run round(seconds/STEP) steps synchronously
GTP.game.render()            // one frame
GTP.game.time                // {t (sim seconds), clock (0..24 h day clock, 1 game hour = 60 real s), day}
GTP.game.player              // the Player entity
GTP.game.newGame(seed); save(); load() -> bool; hasSave()
GTP.game.debug = { teleport(x,y), spawnVehicle(x,y,type), giveWeapon(id, ammo), setWanted(n), setMoney(n), startMission(id), completeObjective(), completeMission(), godMode(bool), listLandmarks() }
```

Boot sequence: parse URL params → Input.init → Render.init → Audio.init →
World.generate(seed) → Entities.clearDynamic → player spawn at
`Content.world.playerSpawn` → AI.spawner.warmup → Missions.init → UI.init →
state 'title' (or 'playing' when headless/skipTitle) → loop.

URL params: `headless=1`, `seed=<int>`, `mission=<id>` (start that mission
immediately after boot with its prerequisites marked complete), `skipTitle=1`,
`mute=1`, `debug=1` (draws collision and AI debug overlays).

## 4. Save format

`localStorage['gtp.save.v1']` = JSON `{ version:1, seed, money, x, y, weapons, armor, hp, completed:[ids], flags, stats, clock, radioStation }`. Loading rebuilds the world from `seed`. Any error in read/write/parse is swallowed and reported via `GTP.UI.toast`.

## 5. Testing

- Playwright from the global install: `NODE_PATH=/opt/node-tools/node_modules node tests/smoke.js`.
- Tests open `file://<abs path>/index.html?headless=1&seed=7&skipTitle=1`, wait for `window.GTP && GTP.game && GTP.game.state === 'playing'`, then drive with `GTP.Input.set(...)` and `GTP.game.advance(...)`, then assert on `GTP.game.player`, `GTP.Missions.state`, `GTP.errors`, and take screenshots (`page.screenshot`) after `GTP.game.render()`.
- Every subsystem agent adds a test under `tests/` for what they built and keeps all existing tests green.
- `tests/all.js` runs every `tests/*.js` except itself and exits non-zero on any failure.

## 6. Performance targets

60 fps at 1280x720 on a laptop with ~60 peds and ~30 vehicles active. Chunk
cache for tiles, spatial hash for queries, no per-frame allocations in hot
loops where avoidable, sprites cached per (type, color).
