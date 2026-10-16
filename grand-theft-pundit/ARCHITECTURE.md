# Grand Theft Pundit: engine contract (3D, third person)

A third-person, 360-degree-movement open-city game in the style of GTA III /
Vice City, running in the browser on three.js (vendored, MIT) with custom arcade
physics. Zero build step. `index.html` runs from `file://`, from any static
server, and (via `build-artifact.js`) as one inlined page.

Everything here is a contract. If a change is unavoidable, update this file in
the same change and say so in your report. The earlier 2D prototype lives in
`prototype-2d/` for reference only (its world layout, config, input, wanted
system and UI ideas are worth borrowing; its rendering is not).

## 0. Hard constraints

- **Classic scripts only.** No ES modules, no bundler. `vendor/three.min.js`
  (r152, UMD, defines `window.THREE`) loads first, then every `js/` file in the
  order below. All game code attaches to one global, `window.GTP`.
- **No external assets.** No image, font, model or audio files. Textures are
  generated on canvases (`THREE.CanvasTexture`), meshes are built from
  primitives, sound is WebAudio synthesis.
- **Deterministic simulation.** All randomness goes through `GTP.rng` (seeded).
  Fixed step `1/60 s`. `Math.random()` is banned in `js/`.
- **Headless mode.** `?headless=1` disables requestAnimationFrame, audio and the
  title screen. Tests call `GTP.game.advance(seconds)` to step synchronously
  and `GTP.game.render()` to draw one frame. WebGL works in headless Chromium
  through SwiftShader; launch Playwright's chromium with
  `args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']`.
- **Never throw out of the loop.** Exceptions are caught, pushed to `GTP.errors`
  (`{time, message, stack}`), and the loop continues. Tests assert it is empty.
- **Content rules.** `CONTENT_RULES.md` applies to every string and every
  texture. `GDD.md` is the single source of content truth.
- **Artifact-ready page.** `index.html` must survive having its `<!doctype>`,
  `<html>`, `<head>`, `<body>` wrappers stripped and all css/js (including
  `vendor/three.min.js`) inlined by `build-artifact.js` into
  `dist/artifact.html`. So: `<title>` first, `<meta name="claude:viewport-fit-sides" content="cover">`,
  a `<style>` with every color as a token on `:root` and `color-scheme: dark`
  (single deliberate dark arcade theme), `html, body { height: 100% }` (never
  `100vh`), outer wrapper with `padding-left: max(16px, env(safe-area-inset-left, 0px))`
  and the matching right padding plus `padding-block` for the top/bottom
  insets, `localStorage` only inside try/catch, audio only after a user gesture,
  never `alert`/`confirm`/`prompt`, pointer lock and fullscreen treated as
  optional (handle rejection), no `window.open`.

## 1. Files and load order

```
grand-theft-pundit/
  index.html                 shell: <title>, <style>, #app > #stage > canvas#gl (three) + canvas#hud (2D overlay) + #overlay (DOM, rarely used)
  vendor/three.min.js        three r152 UMD (do not edit)
  build-artifact.js          node: inline css + vendor + js into dist/artifact.html (strips html/head/body wrappers)
  js/00_util.js              GTP.util, GTP.rng, GTP.SpatialHash, GTP.Events
  js/01_config.js            GTP.C: all tunables, vehicle classes, palette tokens, weapon table lives in combat
  js/02_input.js             GTP.Input: keyboard, mouse (+pointer lock), wheel, gamepad (optional), touch, virtual actions
  js/03_audio.js             GTP.Audio: SFX synth, engine loop, siren, radio sequencer
  js/04_world.js             GTP.World: tile map, height layers, districts, landmarks, lane field, collision, pathing
  js/05_assets.js            GTP.Assets: procedural textures (atlas, facades, decals, billboards) and geometry builders (vehicle classes, ped parts, props)
  js/06_entities.js          GTP.Entity base + Ped, Vehicle, Player, Projectile, Pickup; physics
  js/07_ai.js                GTP.AI: spawner, ped brains, traffic, police + wanted
  js/08_combat.js            GTP.Combat: weapons, lock-on, damage, death, respawn, pickups
  js/09_missions.js          GTP.Missions: objective interpreter, markers, dialogue queue, flags, minigame hooks
  js/10_render.js            GTP.Render: three scene, chunked static meshes, lighting, sky, fog, day/night, camera rig, fx
  js/11_ui.js                GTP.UI: HUD overlay (2D canvas), minimap, dialogue, title, pause, phone, cards, touch controls, minigames
  js/20_content_world.js     GTP.Content.world: district layout, landmark placements, spawn tables, street names, billboards
  js/21_content_cast.js      GTP.Content.cast
  js/22_content_missions.js  GTP.Content.missions
  js/23_content_radio.js     GTP.Content.radio (stations, ads, DJ lines, ticker, barks)
  js/30_game.js              GTP.Game: boot, state machine, fixed-step loop, save/load, debug API
  tests/_harness.js          shared Playwright helpers (launch flags, boot(url), waitPlaying, errors capture, shot(name))
  tests/*.js                 one file per subsystem; tests/all.js runs them all; tests/content_audit.js scans content
  README.md
```

Engine files never hard-code content; they read `GTP.Content`. Content files are
pure data plus tiny helpers.

## 2. Units, axes, scale

- Meters. three.js axes: `x` east, `z` south (screen-down on the minimap),
  `y` up. Yaw `0` faces `-z` (north); yaw increases counter-clockwise seen from
  above (standard three.js `rotation.y`). `GTP.util.yawToDir(yaw) -> {x, z}`.
- Tiles: `GTP.C.TILE = 4` m. Map `GTP.C.MAP_W = GTP.C.MAP_H = 160` tiles
  (640 m square, sea around it). Tile `(tx, tz)` covers
  `x in [tx*4, tx*4+4)`, `z in [tz*4, tz*4+4)`.
- Streets are 2 tiles wide (one lane each way); avenues 4 tiles (two each way);
  the highway loop ("the Loop") is 4 tiles wide and elevated 7 m with ramps.
  Sidewalks are 1 tile. Blocks are 8 to 14 tiles. Right-hand traffic.
- Fixed step `GTP.C.STEP = 1/60`. Player walk 2.6 m/s, run 6.5 m/s, sprint
  burst optional. Cars: sedan top speed ~38 m/s, sports ~52, truck ~28, bike ~45.
- Heights: ped capsule radius 0.4, height 1.8, eye 1.6. Step-up height 0.5.

## 3. Globals and module interfaces

### GTP.util / GTP.rng / GTP.Events (00_util.js)

```js
GTP.rng.seed(n); random(); range(a,b); int(a,b); pick(arr); chance(p); shuffle(arr)
GTP.util.clamp, lerp, damp(a,b,lambda,dt), dist2d(ax,az,bx,bz), angleLerp, wrapAngle, yawToDir(yaw), dirToYaw(x,z), hash(str), fmtMoney(n), fmtTime(s)
GTP.util.aabbCircle(ax,az,aw,ad, cx,cz,r) -> {hit, px, pz} (push-out vector)
GTP.SpatialHash(cell) : insert/remove/update/query(x,z,r)/clear
GTP.Events : on(name, fn), off, emit(name, payload)
```

### GTP.C (01_config.js)

Tunables with comments: movement, camera (distances, heights, lag, fov by
speed, collision radius), vehicle classes
`sedan sports suv truck van cop taxi bus bike` each with
`{accel, maxSpeed, reverseMax, brake, steerMax, steerSpeedFalloff, grip, driftGrip, mass, hp, length, width, height, seats, colors[], wheelRadius}`,
AI counts (`PEDS_TARGET 70, CARS_TARGET 35, ACTIVE_RADIUS 220 m`), wanted
thresholds, economy, palette tokens for textures
(`GTP.C.PAL = { asphalt, laneWhite, laneYellow, sidewalk, curb, grass, water, sand, concrete, facades: {downtown:[...], campus:[...], ...}, roofs: [...], neon: [...] }`),
and `GTP.C.QUALITY = { shadows: true, drawDistance: 260, fogStart: 120 }`
(`?low=1` sets shadows off / draw distance 160).

### GTP.Input (02_input.js)

Actions: `forward back left right run jump action shoot aim enter weaponNext
weaponPrev horn radio map pause confirm back cameraMode lockOn`.
Bindings: WASD/arrows move; Shift run; Space jump (on foot) / handbrake (in
vehicle); left mouse or Ctrl = shoot; right mouse (hold) or Q = aim/lock-on;
F or Enter = enter/exit vehicle; Tab = next target; mouse wheel or [ ] =
weapon cycle; H horn; R radio; M map/phone; V camera mode; Esc/P pause.

```js
GTP.Input.init(canvas); down(a); pressed(a); set(a, bool); endFrame()
GTP.Input.look = { dx, dy }          // mouse/touch look delta this frame (pixels), consumed by the camera rig; zero in headless unless set
GTP.Input.setLook(dx, dy)            // virtual look for tests/touch
GTP.Input.pointerLocked, requestPointerLock() (optional; from a click), releasePointerLock()
GTP.Input.move -> {x, z}             // normalized move vector in INPUT space (x right, z forward) from keys or stick
GTP.Input.touch = { active, stick:{x,y}, buttons:{...} }  // filled by UI.touch
```

### GTP.Audio (03_audio.js)

Same as the 2D contract: lazy `AudioContext` on `unlock()`, silent no-op in
headless/muted. `play(name, {x, z, gain})` positions SFX relative to the camera
(simple distance attenuation and stereo pan). SFX names: `shot punch hit
explode pickup horn siren enter exit mission fail ui cash debate dunk jump land
skid crash`. `engine(level, cls)`, `radio.setStation/next/current/stop`,
`setMuted`. Radio plays only inside a vehicle, fades on exit.

### GTP.World (04_world.js)

```js
GTP.World.generate(seed)             // from GTP.Content.world; deterministic
GTP.World.T = { VOID, ROAD, SIDEWALK, BUILDING, GRASS, WATER, SAND, PARKING, PLAZA, BRIDGE, RAMP, HIGHWAY }
GTP.World.tiles (Uint8Array), w, h, tileAt(x,z), tileIndex(tx,tz)
GTP.World.heightAt(x, z, yHint)      // surface height under (x,z) nearest at/below yHint+0.6 (ground 0; bridge deck; highway deck 7; ramps interpolate); water returns -1.2
GTP.World.surfaces(tx,tz)            // [{y, kind}] layers at a tile (ground always; deck when elevated)
GTP.World.solidAt(x, z, y)           // blocks movement at that height (building volumes, void, walls)
GTP.World.buildings                  // [{x, z, w, d, h, style, roof, landmark|null, aabb}]  (meters)
GTP.World.props                      // [{kind:'tree'|'lamp'|'signal'|'bench'|'hydrant'|'billboard'|'table'|'sign', x, z, y, rot, r, solid, text?}]
GTP.World.resolveCapsule(x, z, y, r) -> {x, z, hitX, hitZ, normal}  // XZ push-out vs building AABBs, props, map edge
GTP.World.roadDir(x, z)              // {dx, dz, lane, laneCenterOffset} lane direction field on ROAD/BRIDGE/HIGHWAY/RAMP tiles or null
GTP.World.isIntersection(tx,tz), signalPhase(tx,tz,t) -> 'ns'|'ew'
GTP.World.districts, landmarks, landmark(id), districtAt(x,z)
GTP.World.randomRoadPoint(), randomSidewalkPoint(), nearestRoadPoint(x,z), nearestSidewalkPoint(x,z)
GTP.World.findPath(ax,az,bx,bz,{mode:'car'|'ped'}) -> [{x,z,y}] | null   // A* on tile graph, bounded
GTP.World.raycastBuildings(ox,oy,oz, dx,dy,dz, maxDist) -> {t, point, normal} | null  // for camera and bullets
```

Generation reads `GTP.Content.world.layout`: outer sea, a bay, a channel that
separates the President's island (`hills`) with `bridge_main`, district
rectangles with style keywords, the avenue/street grid per district, the
elevated Loop with four ramps, parks, plazas, parking lots, and the landmark
table (id, kind, district, footprint tiles, height, label, facade style, roof
feature). Landmarks are real buildings with a door point (`landmark.door`)
on the sidewalk where markers sit. Each landmark kind implies a prop set
(a `campus` gets folding tables and lawns, a `studio` gets a roof dish and an
ON AIR sign, a `stadium` is an oval bowl with a field, a `dock` is piers over
water, a `gas` has a canopy and pumps, a `garage` has a roll-up door marker).

### GTP.Assets (05_assets.js)

```js
GTP.Assets.init()                     // builds everything once; cheap enough for a 2 s boot
GTP.Assets.atlas                      // CanvasTexture 2048 px: ground tiles (asphalt, lane variants, crosswalk, sidewalk, curb, grass, sand, water, parking bays, plaza, ramp, highway with barriers) + lookup uv(name) -> [u0,v0,u1,v1]
GTP.Assets.facade(style, floors)      // cached CanvasTexture per (style, floors) with windows lit by a night uniform (two textures: day/night, blended by material onBeforeCompile or by swapping emissiveMap)
GTP.Assets.roof(style)                // roof texture with AC units, vents, skylights
GTP.Assets.billboard(text, colors)    // CanvasTexture for signage with the game's fonts
GTP.Assets.vehicleGeometry(cls)       // {body: BufferGeometry (merged, vertex colors for windows/lights), wheel: BufferGeometry, wheelOffsets: [...], lightPoints: {...}}
GTP.Assets.pedParts(look)             // Group with named children: head, hair, torso, armL, armR, legL, legR, hat, glasses, extra; materials by look
GTP.Assets.prop(kind)                 // cached geometry+material per prop kind for InstancedMesh
GTP.Assets.weaponMesh(id), pickupMesh(type)
```

Textures are generated with care: asphalt noise, slightly worn lane paint,
crosswalk stripes, sidewalk slabs with cracks, facade styles per district
(downtown glass towers with mullions, campus brick with arched windows,
suburbs siding with porches, industrial corrugated metal with loading doors,
marina pastel stucco, capitol stone with columns, strip neon signage, stadium
concrete). Low-poly meshes with crisp vertex colors; the look is "PS2-era GTA
with modern lighting". Nothing uses images from the network.

### Entities (06_entities.js)

```js
class GTP.Entity { id, kind, x, y, z, vx, vy, vz, yaw, radius, height, hp, maxHp, alive, age, persistent, tag, mesh (THREE.Object3D|null), update(dt), syncMesh(alpha), onDeath(), destroy() }
class GTP.Ped extends Entity   { look, role, state, target, path, inVehicle, seat, weapon, onGround, knockedDown, animTime, speakLine(text) }
class GTP.Vehicle extends Entity { type, cls, speed, steer, throttle, brake, handbrake, driver, passengers, color, damage, isPolice, siren, wheelSpin, wheelSteer, lights, honk(), enter(ped, seat), exit(ped), applyDamage(n, src), explode() }
class GTP.Player extends Ped    { money, wanted, heat, weapons, weapon, armor, vehicle, lockTarget, cameraMode ('chase'|'close'|'first'), stats }
class GTP.Projectile extends Entity { owner, weaponId, dmg, life, tracer }
class GTP.Pickup extends Entity { pickupType, value, weaponId, bob }
GTP.Entities = { list, hash, add(e), remove(e), byKind(kind), near(x,z,r,kind?), clearDynamic(), update(dt), sync(alpha) }
```

Physics (all custom, no library):
- Peds: capsule on XZ, gravity on Y, `World.heightAt` for the floor,
  `resolveCapsule` for walls, light separation from other peds, step-up 0.5 m,
  jump 1.1 m. Knockdown when hit by a car faster than 4 m/s or by a hottake;
  lie flat, slide with friction, get up after 2.5 s unless dead.
- Vehicles: bicycle-model arcade car on XZ. Throttle/brake/reverse, steering
  limited by speed, lateral velocity bled by `grip` (handbrake uses
  `driftGrip`), rolling resistance and drag. Four wheel points sample
  `heightAt` for pitch/roll and ramps; gravity when airborne. Collision with
  buildings and props via the oriented box's four corners against AABBs:
  push out, reflect velocity with restitution 0.3, damage by impact speed,
  camera shake. Vehicle-vehicle: two circles per vehicle (front/rear) with
  impulse by mass. Vehicle-ped: knockdown and damage. `hp` 0: smoke → fire →
  explosion (area damage 8 m) → wreck mesh that stays 60 s.
- Entering: nearest vehicle within 3 m by door point; the ped walks to the
  door (0.4 s), disappears into the seat; the mesh hides. Exiting places the
  ped at the driver door, or the other side if blocked.
- Despawn beyond `ACTIVE_RADIUS` unless `persistent`.

### GTP.AI (07_ai.js)

Same contract as the 2D version adapted to 3D: spawner (peds on sidewalks,
cars in lanes, parked cars in parking tiles), ped brains (wander along
sidewalks, cross at crosswalks on the walk phase, flee, bark lines from
`Content.radio.barks` by district), traffic (follow `roadDir` lanes, stop on
red, yield, avoid ahead, unstick), police response per wanted level
(1 foot cops, 2 cruisers, 3 roadblocks, 4 SWAT vans, 5 helicopter: a
spotlight and rotor sound circling above), busted detection, HOA patrols in
`suburbs` (flagged, see GDD). Heat sources and thresholds as before:
`[2, 6, 12, 20, 30]`, decay only without cop line of sight (raycast vs
buildings) for 4 s. Garages (`kind: 'garage'`) clear stars for $100 each when
the player drives in.

### GTP.Combat (08_combat.js)

Weapons `fist pistol smg shotgun megaphone hottake` with the GDD's feel. Aim:
holding `aim` enters aim mode (camera over the shoulder, crosshair, lock-on
to the best target in a 40° cone within range, Tab cycles); without aim,
`shoot` auto-targets the nearest valid target in front (GTA III style).
Hitscan for guns with tracer fx and impact decals; hottake is a lobbed
projectile with a 5 m stun; megaphone a 6 m cone push with a visible wave.
Damage flashes, knockback, ped death (fall, fade after 10 s, cash drop),
vehicle bullet damage, player death → `wasted` ("RATIO'D") → hospital
respawn after 3 s, lose weapons, lose 10% cash; busted → `busted`
("DEPLATFORMED") → police respawn, lose weapons, $500 fine.

### GTP.Missions (09_missions.js)

Identical data shape and runtime to the 2D contract (`goto drive_to
enter_vehicle pickup follow escape_wanted survive destroy defeat dialogue
minigame timer_wrap`), with 3D targets `{x, z}` or `{landmark}` (door point).
Markers: a translucent vertical cylinder of light at the door point (blue for
available missions, yellow for objectives) plus minimap icons and a HUD arrow
toward the objective when it is off screen. Mission starts when the player
stands in the marker on foot for 0.5 s. Objectives pause while a dialogue
line shows. `GTP.Missions._resolveMinigame(win)` exists for tests.

### GTP.Render (10_render.js)

```js
GTP.Render.init(canvasGl); resize(); renderer, scene, camera (PerspectiveCamera 60°), hudCanvas
GTP.Render.rig = { mode, yaw, pitch, dist, target(entity), update(dt, input), shake(amount) }   // third-person chase rig
GTP.Render.frame(alpha)               // sync entity meshes, update rig, lights, sky, draw scene, then GTP.UI.draw(hudCtx)
GTP.Render.chunks                     // 16x16-tile static chunks: ground mesh (atlas), building mesh (facade materials by style), props InstancedMesh per kind; built lazily, frustum culled by three
GTP.Render.sky                        // gradient dome + sun/moon; fog color follows time of day
GTP.Render.lights                     // hemisphere + directional sun with a 120 m shadow box following the player (QUALITY.shadows), vehicle headlights (spot) for the player car, emissive windows and neon at night
GTP.Render.fx.add({type:'puff'|'spark'|'smoke'|'fire'|'explosion'|'tracer'|'decal'|'text'|'skid', ...})
GTP.Render.worldToScreen(x,y,z) -> {sx, sy, visible}
GTP.Render.freeCam(enabled)           // tests: place camera anywhere via camera.position/lookAt
```

Camera rig rules (this is where GTA feel lives):
- Chase on foot: distance 4.2 m, height 1.9 m, looks at the player's chest.
  Mouse/touch look orbits yaw/pitch (pitch clamped -20°..60°). When the
  player moves and no look input for 1.2 s, the yaw eases behind the movement
  direction. Collision: raycast from target to desired camera position
  against buildings; pull in to the hit point minus 0.3 m.
- Chase in vehicle: distance 7.5 m (bus 10), height 3 m, yaw eases toward the
  vehicle's velocity direction (reverse flips after 0.5 s), fov 60 → 75 with
  speed, slight roll on hard turns, shake on impacts.
- `close` halves distances; `first` is at eye height with the body hidden.
- Aim mode: over the right shoulder, 1.6 m back, 0.6 m right, fov 50.
- Smoothing via `damp` per axis; never snap except on respawn or teleport.

### GTP.UI (11_ui.js)

2D overlay on `canvas#hud` (same size as the GL canvas, crisp at
devicePixelRatio). Everything the 2D contract listed: title screen (attract
camera flying over the city, logo with the folding-table T, "Press Enter /
Tap", Continue, Controls, the "A parody. All characters are fictional." line),
HUD (health/armor, money roll-up, wanted stars, weapon + ammo, objective text,
crosshair in aim mode, lock-on reticle on the target, off-screen objective
arrow, minimap 220 px rotating with camera yaw with the player arrow fixed,
roads/water/buildings baked from tiles into an offscreen canvas, markers,
cops when wanted, a north tick), radio ticker when in a vehicle, dialogue box
with parametric portraits from the cast recipe, mission banners and
complete/failed cards, WASTED (“RATIO'D”) and BUSTED (“DEPLATFORMED”) cards,
pause menu, phone (missions, stats, controls), toasts, timer countdown, touch
controls (left stick, right-side look area, buttons: Shoot, Aim, Enter, Jump,
Weapon, Map, Pause), and both minigames exactly as specified in GDD §7.

### GTP.Content (2x)

- `world`: `layout` (districts with rects and style, grid spacing, water,
  channel, bridge, loop ramps, parks, plazas), `landmarks` (id, name, kind,
  district, block anchor `{bx, bz}`, footprint `{w, d}` tiles, height m,
  facade, roof, `label`), `spawn` (ped looks and roles per district, vehicle
  types per district, parked cars, weapon/health pickups with act gating),
  `streets` (names for the minimap and the HUD "district / street" chip),
  `billboards` (text pairs for Impression Alley), `playerSpawn` landmark id.
- `cast`, `missions`, `radio`: straight from GDD §4, §6, §8-9 (ids verbatim).

### GTP.Game (30_game.js)

As in the 2D contract: `boot({headless, seed, mission, skipTitle, low, mute,
debug})`, states `title playing paused wasted busted cutscene minigame
gameover`, `step()`, `advance(seconds)`, `render()`, `time {t, clock, day}`
(1 game hour = 90 real s; start at 17:30 for a sunset first frame), `player`,
`newGame(seed)`, `save()`, `load()`, `hasSave()`, and
`debug = { teleport(x,z), spawnVehicle(x,z,type), giveWeapon(id, ammo), setWanted(n), setMoney(n), startMission(id), completeObjective(), completeMission(), godMode(b), listLandmarks(), setClock(h), snapshot() }`.
`snapshot()` returns a plain-object summary (player pos, state, wanted, mission,
counts, fps) for tests and for `window.claude?.hot?.snapshot`.

URL params: `headless=1 seed=<int> mission=<id> skipTitle=1 mute=1 low=1 debug=1 clock=<h>`.

## 4. Save format

`localStorage['gtp.save.v2']` = JSON `{ version:2, seed, money, x, z, yaw, weapons, armor, hp, completed, flags, stats, clock, radioStation, cameraMode }`. Load rebuilds the world from `seed`. All errors are swallowed and reported with a toast.

## 5. Testing

- `NODE_PATH=/opt/node-tools/node_modules node tests/<file>.js`. `tests/_harness.js`
  exports `launch()` (chromium with the SwiftShader flags above, viewport
  1280x720), `boot(page, params)`, `waitPlaying(page)`, `errors(page)`,
  `shot(page, name)` (renders a frame first, saves `tests/out/<name>.png`).
- Tests drive the game with `GTP.Input.set`, `GTP.Input.setLook`,
  `GTP.game.advance`, the debug API, and assert on `GTP.game.debug.snapshot()`,
  `GTP.Missions.state`, `GTP.errors`, and pixel checks on screenshots when
  useful. Every subsystem agent adds a test file and keeps `tests/all.js`
  green. Screenshots are looked at (Read tool) and judged.
- `tests/perf.js`: 30 s advance with full AI at steps/s, and 60 rendered
  frames with the chase camera at ms/frame (SwiftShader numbers are only
  relative; report them, target no regressions).

## 6. Performance targets

60 fps at 1080p on an integrated GPU: static geometry merged per chunk (one
draw per material per chunk), props instanced, ~70 peds and ~35 cars each one
Group with shared geometries, shadows limited to a 120 m box, draw distance
260 m with fog, no per-frame allocations in hot loops, textures generated once.
