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
  js/02_input.js             GTP.Input: keyboard, mouse (+pointer lock), wheel, gamepad (standard layout, context maps, rumble), touch, text capture, virtual actions
  js/03_audio.js             GTP.Audio: SFX synth, engine loop, siren, radio sequencer
  js/04_world.js             GTP.World: tile map, height layers, districts, landmarks, lane field, collision, pathing
  js/05_assets.js            GTP.Assets: procedural textures (atlas, facades, decals, billboards) and geometry builders (vehicle classes, ped parts, props)
  js/05b_assets_weapons.js   expansion: weapon meshes and pickup visuals for the 12-weapon arsenal (registers into GTP.Assets)
  js/06_entities.js          GTP.Entity base + Ped, Vehicle, Player, Projectile, Pickup; physics
  js/07_ai.js                GTP.AI: spawner, ped brains, traffic, police + wanted
  js/08_combat.js            GTP.Combat: weapons, lock-on, damage, death, respawn, pickups
  js/09_missions.js          GTP.Missions: objective interpreter, markers, dialogue queue, flags, minigame hooks, checkpoints / retry / replay,
                             subscribers; GTP.Strands: the side-strand runtime (cab, HOA patrol, sponsor runs, rampages, memos, races, stunts)
  js/10_render.js            GTP.Render: three scene, chunked static meshes, lighting, sky, fog, day/night, camera rig, fx
  js/10b_postfx.js           GTP.PostFX: post-processing (half-float scene target + depth, SSAO, bloom, height fog, ACES + grading, vignette, grain, FXAA); graphics track
  js/11_ui.js                GTP.UI: HUD overlay (2D canvas), minimap, dialogue, loading screen, title menu + slot cards + settings, pause, map page,
                             shop, weapon wheel, scope, retry card, hints, race / stunt / memo overlays, touch controls, gamepad glyphs, minigames
  js/12_cutscenes.js         GTP.Cutscenes: data-driven cutscene player (letterbox, camera keyframes, actors, dialogue, skip); GTP.Hints: tutorial prompts; see GDD_EXPANSION.md §4, §6.6
  js/20_content_world.js     GTP.Content.world: district layout, landmark placements, spawn tables, street names, billboards
  js/21_content_cast.js      GTP.Content.cast
  js/22_content_missions.js  GTP.Content.missions
  js/23_content_radio.js     GTP.Content.radio (stations, ads, DJ lines, ticker, barks)
  js/24_content_expansion.js GTP.Content.expansion: new story missions, cutscene scripts, side strands, shop, hints, loading tips, new radio lines
  js/30_game.js              GTP.Game: boot (staged loading), state machine, fixed-step loop, the v3 slot saves + autosave, debug API
  tests/_harness.js          shared Playwright helpers (launch flags, boot(url), waitPlaying, errors capture, shot(name))
  tests/*.js                 one file per subsystem; tests/all.js runs them all; tests/content_audit.js scans content
                             integration: campaign.js (a new game through the opening, all 25 missions with their intro and act
                             cutscenes, both endings, one cycle of every strand and a shop purchase on real inputs),
                             feel.js (the Loop flat out, pay-and-spray, death, bust, save + Continue), feel2.js (the expansion's
                             feel pass: the opening, the runway at speed, the port maze, uptown at night, a race, a rampage, the
                             scope, a rocket, the map with a waypoint), tune.js (heat limits, knock-over props, drive-by, the
                             shootable helicopter, the aim camera)
  README.md                  what it is, how to run, controls, tests, the content rules pointer, credits
```

Engine files never hard-code content; they read `GTP.Content`. Content files are
pure data plus tiny helpers.

## 2. Units, axes, scale

- Meters. three.js axes: `x` east, `z` south (screen-down on the minimap),
  `y` up. Yaw `0` faces `-z` (north); yaw increases counter-clockwise seen from
  above (standard three.js `rotation.y`). `GTP.util.yawToDir(yaw) -> {x, z}`.
- Tiles: `GTP.C.TILE = 4` m. Map `GTP.C.MAP_W = GTP.C.MAP_H = 224` tiles
  (896 m square, sea around it; the expansion grew it from 160: every tile of
  the old 160 x 160 city keeps its coordinates, the new land is east and
  south). Tile `(tx, tz)` covers `x in [tx*4, tx*4+4)`, `z in [tz*4, tz*4+4)`.
  The minimap bake is 896 px; the chunk grid is 14 x 14 (built lazily).
- Landmasses: the mainland (x 6..117, z 6..129), the President's island
  (x 128..153, z 12..123), Heirloom Heights / `uptown` east of the island
  across the 32 m east channel (x 162..215, z 8..149) and the south landmass
  across the 80 m bay (z 130..149): Goldplate International / `airport`
  (x 6..109) west and Manifest Harbor / `port` (x 110..215) east, z 150..215.
  The `marina` district rect reaches over the bay and `uptown` over the east
  channel so the two new bridges (`bridge_south`, the Sponsor Span; and
  `causeway_east`) and their doors belong to a district; water takes no style.
- Streets are 2 tiles wide (one lane each way); avenues 4 tiles (two each way);
  the highway loop ("the Loop") is 4 tiles wide and elevated 7 m with ramps.
  The expansion makes it a figure eight: the Lower Loop hangs off the z = 94
  leg, runs south over the Strip and the Docks, crosses the bay on a viaduct
  (deck over `WATER` on pylons; the ground beneath stays water) and back along
  the airport's north edge (z = 166), with two more ramps (Arrivals Ramp,
  Manifest Ramp). Both rings read "The Loop" on the chip; `World.loopAt`
  says which (`'upper' | 'lower'`). Sidewalks are 1 tile. Blocks are 8 to 14
  tiles. Right-hand traffic.
- The runway (`airport_runway`, kind `runway`) is a `PARKING` lot whose 6-tile
  strip (z 204..209) carries `M.RUNWAY | M.YARD`: its own atlas paint, never in
  the lane field (`roadDir` is null, traffic never enters a lot) and never a
  parked-car tile (the spawner skips `YARD`); the rest of the lot is apron.
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
AI counts (`PEDS_TARGET 76, CARS_TARGET 40, ACTIVE_RADIUS 220 m`), wanted
thresholds and heat per crime (`WANTED.heat`, including `ramCop 3` for a cop
knocked over by the player's car), economy, palette tokens for textures
(`GTP.C.PAL = { asphalt, laneWhite, laneYellow, sidewalk, curb, grass, water, sand, concrete, runway, runwayLine, apronLine, containers: [...], planeGold, facades: {downtown:[...], campus:[...], ..., brownstone, airport, port}, roofs: [...], neon: [...] }`),
`GTP.C.DISTRICT_STYLES` (eleven filler styles; `brownstone` has `roof: 'mansard'`),
and `GTP.C.QUALITY`, the LIVE quality object (identity never changes): the common
keys `drawDistance: 260, fogStart: 120, shadowBox: 120, pedDraw: 110, vehicleDraw: 200, prebuildPerCall: 3`
plus the keys a preset overlays: `preset, shadows, shadowMap, softShadows, anisotropy, post, ssao, ssaoSamples,
bloom, fxaa, grain, pointLights, headlights, weatherFx, rainCount, puddles, normalMaps, envMap, clearcoat,
lodDistance, clouds`. `GTP.C.QUALITY_PRESETS = { low, medium, high, ultra }` holds the overlays
(low: no post, no shadows, emissive-only night; medium: shadows 1024, FXAA, bloom; high: SSAO, soft 2048
shadows, 8 lamp lights + 4 headlight spots, weather fx, clearcoat paint; ultra: 4096 shadows, 12 lights,
16 SSAO samples), `GTP.C.QUALITY_AUTO = { start: 'medium', slowMs: 22, slowSeconds: 5, cooldown: 12 }` the auto
mode and `GTP.C.WEATHER` the weather cycle knobs (transition 40 s, hold 3..8 game hours, odds, wet rise / dry
rates, wet roughness 0.32, rain fall / box, fog near in rain). `Render.quality.set(preset)` applies a preset
live. URL: `?quality=low|medium|high|ultra|auto` (headless boots default to low, everything else to auto, which
starts at medium and steps down when the frame time stays over 22 ms for 5 s); `?low=1` still means low plus
draw distance 160; `?weather=clear|overcast|rain` fixes the weather and stops the cycle. The entity draw ranges sit
inside the fog so the denser street stays under the draw-call budget (~470 scene calls at low; the counter also
covers the shadow and post passes at medium and above, about twice that).
`PHYS.knockSpeed 5.5` / `knockSlow 0.78`: the speed at which a car knocks a
small prop over and the speed it keeps through it. `CAMERA.aimDist 2.0,
aimSide 0.7, aimHeight 1.85, aimLookHeight 1.5, aimFov 50` is the aim rig.

### GTP.Input (02_input.js)

Actions: `forward back left right run jump action shoot aim enter weaponNext
weaponPrev horn radio map pause confirm back cameraMode lockOn` plus the
expansion's `reload wheel waypoint zoomIn zoomOut secondary tabNext cancel
quickUp quickRight quickDown quickLeft`.
Bindings: WASD/arrows move; Shift run; Space jump (on foot) / handbrake (in
vehicle); left mouse or Ctrl = shoot; right mouse (hold) or Q = aim/lock-on;
F or Enter = enter/exit vehicle; Tab = next target (`lockOn` + `wheel`: held
0.18 s it is the weapon wheel); mouse wheel or [ ] = weapon cycle (scope zoom
while scoped); H horn; **R reload; N radio**; M map; V camera mode; + / -
`zoomIn` / `zoomOut`; Delete `secondary` (DELETE on a slot card); Esc = `pause`
+ `back` + `cancel`, P pause, Backspace = `back` + `cancel`. `back` is both the
move-down key (S / ArrowDown) and the legacy menu back; `cancel` is the
unambiguous menu back-out (Escape, Backspace, pad B), so menus read
`pressed('back') && !pressed('cancel')` as "step down" and `pressed('cancel')`
as "leave".

Gamepad (GDD_EXPANSION §6.8, standard layout, `navigator.getGamepads`, dead
zone 0.18): three button maps by context (`Input.padMaps.foot / car / menu`;
`Input.gamepad.context`): on foot A jump, B sprint, X reload, Y enter, LB/RB
weapon prev/next, LT aim, RT shoot, Back map, Start pause, L3 camera, R3
lock-on (held: wheel), d-pad `quick*` slots (the UI equips the best owned
pistol / rifle / thrown / melee class); in a car B horn, X radio, A handbrake;
in menus (title, paused, minigame, the death cards) A confirm, B cancel, X
secondary, Y tabNext, LB/RB pages, LT/RT zoom, d-pad and the left stick
(crossings at 0.5, a repeat every 250 ms) navigate as `forward back left
right`; the right stick is look (14 px per unit per step). A context change
releases the old action. `Input.gamepadEnabled = false` (Settings) ignores the
pad; `Input.lastDevice` (`'keyboard' | 'gamepad' | 'touch'`) picks the glyphs
the UI prints; `Input.rumble(ms, strength)` is a quiet no-op without a
`vibrationActuator` (the UI fires it on `hitmarker`, player `damage` and the
player car's `vehicle:impact`).

```js
GTP.Input.init(canvas); down(a); pressed(a); set(a, bool); press(a) (one-step pulse); endFrame()
GTP.Input.look = { dx, dy }          // mouse/touch look delta this frame (pixels), consumed by the camera rig; zero in headless unless set
GTP.Input.setLook(dx, dy)            // virtual look for tests/touch
GTP.Input.pointerLocked, requestPointerLock() (optional; from a click), releasePointerLock()
GTP.Input.move -> {x, z}             // normalized move vector in INPUT space (x right, z forward) from keys or stick
GTP.Input.touch = { active, stick:{x,y}, buttons:{...} }  // filled by UI.touch
GTP.Input.gamepad = { index, connected, id, lx, ly, rx, ry, lt, rt, buttons:{action: bool}, context }; padConnected(); gamepadEnabled; lastDevice; rumble(ms, k)
GTP.Input.text = { capture, queue }  // the seed field: with capture on, printable keys / Backspace / Enter / Escape queue as e.key (digits never become actions)
```

### GTP.Audio (03_audio.js)

Same as the 2D contract: lazy `AudioContext` on `unlock()` (every keydown,
mousedown and touch calls it; it also resumes a suspended context), silent
no-op in headless (no context is ever created) and gain 0 with no voices when
muted. `play(name, {x, z, gain})` positions SFX relative to the camera rig
(the listener is the rig focus facing the rig yaw: full volume within 5 m,
quadratic falloff to a per-sound range, stereo pan by the right vector; a sound
beyond earshot creates nothing). SFX names: `shot punch hit explode pickup horn
siren enter exit mission fail ui cash debate dunk jump land skid crash`, plus
`swap` (weapon switch, from the `weapon` event), `static` (radio tuning) and the
arsenal's `reload` (magazine out and in), `reloadDone` (the bolt home),
`hitmark` (the hit tick) and `confirm` (the kill chime), which Combat plays.
`horn` picks its voicing by the vehicle class at `{x, z}` (or `opts.cls`);
`crash` and `land` scale their length and metal ring with `gain`; `siren` as a
one-shot is a whoop (the bust, the first star). All synthesis: noise bursts and
oscillators through envelopes and filters, a feedback delay for body.

```js
GTP.Audio.init({headless, mute}); unlock(); play(name, {x, z, gain, cls?}) -> bool; setMuted(b); muted, headless, unlocked, ctx
GTP.Audio.engine(level, cls)          // Player.control each step: speed / top speed and the vehicle type (null on foot);
                                       // saw + sub + detuned saw through a lowpass, four or five gears, an idle lump, revs on throttle;
                                       // forgotten after 0.25 s without a call, so menus and the title go quiet
GTP.Audio.heli(on|level, x, z)        // AI.Heli: rotor thump (AM at the blade-pass rate) + turbine whine; forgotten after 1.6 s
GTP.Audio.radio = { setStation(n), next(), prev(), current() -> station|null, stop(), isPlaying(), nowPlaying() -> string, level(), state() }
GTP.Audio.station                     // the public station index (save/load and the UI write it; current() reads it)
GTP.Audio.update(dt)                  // Game.step: radio logic + sequencer, engine, the siren scan (every 0.2 s), heli, voice GC
GTP.Audio.state()                     // tests: {ctx, voices, counts, radio, engine, siren, heli, errors, disabled}
GTP.Audio.counts[name]                // play() calls per name, even in headless
GTP.Audio.render(kind, opts) -> Promise<{peak, rms, env, loudUntil}>   // tests/tuning: offline render of an SFX name
                                       // ({gain, cls}), 'radio' ({station, seconds}), 'engine' ({cls, level}), 'sirenLoop', 'heliLoop'
```

The siren loop scans vehicles with `siren` set within 160 m of the listener
and follows the nearest one (gain by distance, pan, the wail LFO faster with
more cars). The radio is a sixteen-step sequencer over
`GTP.Content.radio.stations[i].pattern` (see that file's header): bass and
lead degrees in the station scale, a pad chord per bar from `chords`, a drum
kit chosen by tempo (march / soft / house), swing on the off-sixteenths,
`sustain`, `transposeBass`, `jingle` (ducks the music), `talk` (four bars of
bumper, eight of host murmur behind phone-line static). It plays only inside a
vehicle in `playing` / `cutscene`, fades in and out over about half a second,
realigns to the context clock when it comes back (the station "kept playing"),
and plays `static` on a switch. Audio randomness runs on `GTP.makeRng(0xA0D10)`.
After six caught errors the module disables itself (`disabled`).

### GTP.World (04_world.js)

```js
GTP.World.generate(seed, onProgress) // from GTP.Content.world; deterministic; synchronous. onProgress(fraction, label) between the stages
                                     // (tiles, roads, landmarks, props, done) and a 'load:progress' event {stage, frac, bar, label, source:'world'}
                                     // (bar = the absolute share of the loading bar, GDD_EXPANSION §6.1); World.generateMs is the cost (about 0.5 s on a
                                     // desktop, 3 to 4 s in the SwiftShader test browser; tests/perf.js and tests/world.js watch it)
GTP.World.T = { VOID, ROAD, SIDEWALK, BUILDING, GRASS, WATER, SAND, PARKING, PLAZA, BRIDGE, RAMP, HIGHWAY }
GTP.World.M                          // meta bits; the expansion adds RUNWAY (the runway strip) and LOWER (deck layer: the Lower Loop's legs)
GTP.World.tiles (Uint8Array), w, h, tileAt(x,z), tileIndex(tx,tz)
GTP.World.heightAt(x, z, yHint)      // surface height under (x,z) nearest at/below yHint+0.6 (ground 0; bridge deck; highway deck 7; ramps interpolate; a stunt
                                     // wedge's sloped top when a ramp_prop lies under the point and the mover is at or above its base); water returns -1.2
GTP.World.loopAt(x, z, y) -> 'upper'|'lower'|null   // which ring of the figure eight (deck tiles with y > 3, and the ramps)
GTP.World.stuntRamps                 // [{id, name, x, z, y, yaw, heading, landing:{x,z}|null, minAir, prop}] the ten striped wedges of GDD_EXPANSION §5.7 (from Content.world.stuntRamps)
GTP.World.parks, promenades          // [{x, z, w, h (tiles), name, cx, cz}], [{id, name, x, z, w, h, rail:'e'|'w', billboards}]
GTP.World.lowerLoopName              // 'The Lower Loop' (Content.world.streets.lowerHighway); loopName stays 'The Loop'
GTP.World.surfaces(tx,tz)            // [{y, kind}] layers at a tile (ground always; deck when elevated)
GTP.World.solidAt(x, z, y)           // blocks movement at that height (building volumes, void, walls)
GTP.World.buildings                  // [{x, z, w, d, h, style, roof, landmark|null, aabb}]  (meters)
GTP.World.props                      // [{kind:'tree'|'lamp'|'signal'|'bench'|'hydrant'|'billboard'|'table'|'sign'|..., x, z, y, rot, r, solid, text?, fallen?, hidden?, sx?, sy?, sz?}]
                                     // fallen = {t, dx, dz, by}: a lamp / hydrant / bin / bench / table a car knocked over; no longer solid
                                     // hidden = collision only (a ship's hull circles, crane legs, the gantry legs): the renderer skips it
                                     // expansion kinds: jetbridge beacon luggage edgelight windsock plane jet cab rolldoor pallet container crane craneleg ship
                                     // ferryboat podium cutout fence column statue statue_table stanchion gazebo fountain gantry ramp_prop steps railing awning
                                     // (06_entities' KNOCKABLE list: lamp hydrant bin bench table luggage pallet stanchion cutout, GDD_EXPANSION §1.5)
GTP.World.resolveCapsule(x, z, y, r) -> {x, z, hitX, hitZ, normal, prop}  // XZ push-out vs building AABBs, props, map edge; prop = the last solid prop that pushed
GTP.World.roadDir(x, z)              // {dx, dz, lane, laneCenterOffset} lane direction field on ROAD/BRIDGE/HIGHWAY/RAMP tiles or null
GTP.World.isIntersection(tx,tz), signalPhase(tx,tz,t) -> 'ns'|'ew'
GTP.World.districts, landmarks, landmark(id), districtAt(x,z)
                                     // landmark: {id, name, kind, district, lot, building|null, x, z, door:{x,z,y,tx,tz}, points:{name:{x,z,y,tx,tz}} (Content `points`,
                                     // e.g. airport_runway east/west, both_sides_strip range, causeway_east island/uptown), npcs:[{role:'doorman'|'clerk', cast?, x, z, yaw}]
                                     // (the AI / content spawn them), maze (container_yard), range (both_sides_strip), ship (manifest_quay), garage (garages)}
GTP.World.randomRoadPoint(), randomSidewalkPoint(), nearestRoadPoint(x,z), nearestSidewalkPoint(x,z)
GTP.World.tilesNear(x, z, r, 'road'|'sidewalk') -> [tileIndex]   // the spawnable tiles within r (64 m buckets, a superset by one bucket): the AI spawner
                                     // samples these (cached per kind until the centre moves 24 m, AI.spawner.nearTiles) instead of the whole-city lists
GTP.World.findPath(ax,az,bx,bz,{mode:'car'|'ped'}) -> [{x,z,y}] | null   // A* on tile graph, bounded
GTP.World.raycastBuildings(ox,oy,oz, dx,dy,dz, maxDist) -> {t, point, normal} | null  // for camera and bullets
```

Generation reads `GTP.Content.world.layout`: outer sea, a bay, a channel that
separates the President's island (`hills`) with `bridge_main`, district
rectangles with style keywords, the avenue/street grid per district (a road
segment may carry `district`; `Content.world.streets.byDistrict` lists the
expansion's names), the elevated Loop with six ramps (legs with `viaduct:
[z0, z1]` lay the deck over water on pylons; `lower: true` legs are the Lower
Loop), parks (a park may carry `name`, `sign`, `benches: 's'`), promenades
(`promenade` plus `promenades[]`: `rail: 'w'` puts the railing and the
second set of billboard pairs on the Shoreline Stroll), plazas, parking lots,
the landmark table (id, kind, district, footprint tiles, height, label, facade
style, roof feature, `points`, `ground: 'runway'` with `strip: {z0, z1}`) and
`stuntRamps`. An optional `layout.legacy = {w, h, landmarks}` packs the
original map's blocks before the expansion's and gives the later landmarks a
forked RNG (the v0.1 filler buildings come back exactly); it is off, see the
content file. Landmarks are real buildings with a door point (`landmark.door`)
on the sidewalk where markers sit. Each landmark kind implies a prop set
(a `campus` gets folding tables and lawns, a `studio` gets a roof dish and an
ON AIR sign, a `stadium` is an oval bowl with a field, a `dock` is piers over
water, a `gas` has a canopy and pumps, a `garage` has a roll-up door marker;
the expansion's `terminal` (canopy, jetbridges, beacon, luggage), `runway`
(edge lights, windsocks, three airliners, the jet on its plinth), `atc` (the
overhanging cab, dish, beacon, the "10"), `hangar` (roll-up door, the cutout
jet), `yard` (the container maze with its two cranes, `landmark.maze`), `quay`
(three cranes, THE MANIFEST moored offshore, `landmark.ship`), `ferry` (pier,
ferry, kiosk, board), `gunshop` (target sign, podium, awning; the flagship's
fenced range with six cutouts, `landmark.range`), `museum` (columns, steps,
banners, the bronze table, stanchions), `club` with `awning` (awning,
stanchions, a doorman in `landmark.npcs`), `park` with `bandstand` (gazebo,
fountain, the WELL, ACTUALLY statue) and `bridge` with `gantry` / `signs`
(toll gantries and lamps on the Sponsor Span; the causeway's gold sign and
brass NO), see GDD_EXPANSION §1.5).

### GTP.Assets (05_assets.js)

```js
GTP.Assets.init()                     // builds everything once; cheap enough for a 2 s boot
GTP.Assets.atlas                      // CanvasTexture 2048 px: ground tiles (asphalt, lane variants, crosswalk, sidewalk, curb, grass, sand, water, parking bays, plaza, ramp, highway with barriers,
                                      // the runway: runway, runway_center, runway_edge, runway_thresh, runway_1, runway_0, apron) + lookup uv(name) -> [u0,v0,u1,v1]; unused cells are asphalt-coloured (mip bleed)
GTP.Assets.facade(style, floors)      // cached CanvasTexture per (style, floors) with windows lit by a night uniform (two textures: day/night, blended by material onBeforeCompile or by swapping emissiveMap)
                                      // styles: downtown goldplate campus suburbs barn mansion industrial marina capitol police hospital strip stadium + brownstone airport port (GDD_EXPANSION §1.1)
GTP.Assets.roof(style)                // roof texture with AC units, vents, skylights; Render._roof draws 'flat' | 'gable' | 'mansard' (slate slopes, dormers) | 'dome' | 'studio' | 'tower'
GTP.Assets.swatchUV(name)             // 21 solid swatches (24 px each) in facade band 6: ... + slate sandstone orange navy teal
GTP.Assets.billboard(text, opts)      // CanvasTexture for signage with the game's fonts; opts: neon, w (aspect), target (concentric rings), gold, brass, banner (tall, words stacked)
GTP.Assets.signMaterial(text, neon, ar, opts)   // cached per text/variant; a prop's `target`, `gold`, `brass`, `banner` flags select the variant
GTP.Assets.vehicleGeometry(cls, wrap) // {body: BufferGeometry (merged, vertex colors; material groups paint/detail/glass/head/tail/barRed/barBlue/wrap, see Assets.GROUPS), wheel, wheelRadius, wheelWidth, wheelOffsets: [{x, z, steer}] (mesh-local: forward = -z, right = +x), lightPoints: {headL, headR, head, tailL, tailR, roof, eye}, doorPoints, size}
GTP.Assets.wrapTexture(name)          // livery CanvasTexture ('pod' = the Loud & Correct van); passed as the vehicle's `wrap`
GTP.Assets.pedParts(look)             // Group (feet at y 0, faces -z) with pivots legL, legR (hips), torso (hip pivot holding armL, armR shoulder pivots and head). Hair, hat, glasses, tie, lanyard, medal, pin, badge, mic, phone, sign are merged into those six vertex-coloured meshes (six draw calls per ped), so there are no separate hair/hat/glasses/extra children; look.scale, look.uniform, look.badge, look.mask, look.sign honoured
GTP.Assets.prop(kind)                 // cached geometry+material per prop kind for InstancedMesh; a `glow` vertex attribute (traffic-light lenses, lamp heads,
                                      // the hydrant's reflector) makes a part self-lit through the prop material; new kinds busstop planter bike trash are
                                      // registered for the world to place
GTP.Assets.weaponMesh(id), pickupMesh(type)
// the graphics track (PBR under an ACES pipeline; 05_assets owns the materials, 10_render the lights, 10b_postfx the post)
GTP.Assets.ensureSurfaceMaps()        // generates the normal / roughness maps from the colour canvases the first time a preset with normalMaps asks
                                      // (luminance as height: mortar, grout, cracks and tar lines read as grooves): atlasNormal, atlasRough (ROUGH per cell,
                                      // paint glossier than aggregate), waterNormal, and per facade {normal, rough} (glass panes glossy by a colour rule)
GTP.Assets.applyQuality(q)            // toggles those maps on the shared materials and the anisotropy (Render.quality.apply calls it)
GTP.Assets.groundMaterial() / groundMaterialFar()      // MeshStandard (atlas + maps, wet roughness driven by Render.weather) / the old Lambert for the LOD
GTP.Assets.facadeMaterial(style) / facadeMaterialFar(style) / litMaterials()   // MeshStandard with emissiveMap (night windows) + maps / Lambert / every emissive one
GTP.Assets.propMaterial() / propMaterialFar() / setPropGlow(k)                  // the shared vertex-coloured PBR material (peds, props, weapons, pickups) / Lambard LOD / glow scale
GTP.Assets.waterMaterial(), paintMaterial(hex) (clearcoat Physical at high / ultra, Standard below), glassMaterial() (dark tinted, reflective),
GTP.Assets.chromeMaterial(), emitterMaterial(r, g, b) (HDR MeshBasic above 1.0, so headlights / brake lights / light bars bloom)
GTP.Assets.sky / skyCanvas / env      // one 512 x 256 equirect canvas Render._paintSky paints (gradient, sun glow, horizon band, ground half): the dome samples it
                                      // mirrored (repeat.x -1), the PMREM environment map samples it straight; clouds (tileable noise), rain (streak sprite), moon
GTP.Assets.GROUPS                     // vehicle material slots: paint 0, detail 1, glass 2, head 3, tail 4, barRed 5, barBlue 6, wrap 7, chrome 8
```

Textures are generated with care: asphalt noise, slightly worn lane paint,
crosswalk stripes, sidewalk slabs with cracks, facade styles per district
(downtown glass towers with mullions, campus brick with arched windows,
suburbs siding with porches, industrial corrugated metal with loading doors,
marina pastel stucco, capitol stone with columns, strip neon signage, stadium
concrete). Meshes stay low-poly with crisp vertex colors, now chamfered where
it counts: car bodies, hoods and trunks are bevelled boxes with chrome trim,
door seams and handles, lamp housings, framed plates front and back, dished
rims, seats and a dash seen through tinted glass; peds have rounded limbs,
knees, cuffs, a collar, a belt and buckle, eyes with whites and brows. The
look is "modern stylized GTA" at high and still reads at low. A quad's first
two corners must never coincide (a zero normal is NaN lighting, and the bloom
chain spreads a NaN across the frame); a degenerate triangle repeats the
third corner instead. Nothing uses images from the network.

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

Driving a Ped (AI, missions): set `ped.intent = {x, z, run}` (world-space direction, length <= 1) or call
`ped.moveTo(x, z, run)` / `ped.stop()`; `ped.wantJump = true`; `ped.enterVehicle(v, seat)` (door walk, then the
seat; seat 0 carjacks a driver, who gets `state 'flee'`), `ped.exitVehicle()`, `ped.knockDown(ix, iz, dmg, src)`,
`ped.applyDamage(n, src, type)` (armor first, `die()` at 0, `GTP.Combat.damage` routes here), `ped.speakLine(text)`.
Driving a Vehicle: `v.throttle` (-1..1), `v.brake` (0..1), `v.steer` (-1..1, +1 = right), `v.handbrake`, or
`v.setControls(throttle, steer, handbrake, brake)`; only a living `v.driver` makes them count. Vehicle local frame:
forward = `yawToDir(yaw)`, right = (-f.z, f.x); `v.localToWorld(right, forward)`, `v.worldToLocal(x, z)`,
`v.doorWorld(0|1|2)`, `v.pushCircle(x, z, r)`, `v.edgeDistance(x, z)`. State flags: `onGround, burning, exploded,
wreck, sinking, reversing, reverseTime, braking, lights, siren, offroad, yawRate, pitch, roll, wheelSpin, wheelSteer`.
Events (GTP.Events): `damage, ped:dead, vehicle:enter, vehicle:exit, vehicle:damage, vehicle:impact, vehicle:hitPed,
vehicle:exploded, vehicle:sunk, honk, pickup, player:respawn, prop:knocked {prop, vehicle}`. A car faster than
`PHYS.knockSpeed` knocks a lamp post, hydrant, bin, bench or table over (`v._knockProp`: the prop goes `fallen`, the car
keeps `knockSlow` of its speed, a little damage, sparks, `Render.knockProp`); trees and signals still stop it. A ped in a
car is hidden; the driver of a `bike` is drawn seated on the saddle (`Ped._syncRider`, legs and arms posed). The player
fires a pistol / SMG / shotgun from the driver's seat while `aim` is held (`Player.control` -> `Combat.fire`, a drive-by;
`[` `]` / the wheel cycle weapons in a car too). Combat owns the RATIO'D / DEPLATFORMED flows
(`Combat.onPlayerDeath` / `onPlayerBusted`); the entity-side hospital fallback only runs when that hook is missing.
Ped pose fields `firePoseT` (arm raised after a shot) and `punchT` (jab swing) are set by Combat and read by
`syncMesh`; while `aiming`, `firePoseT > 0` or `punchT > 0` the ped faces `aimYaw` and strafes. Meshes are hidden beyond
`QUALITY.pedDraw` / `QUALITY.vehicleDraw` metres from the camera.

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

Same contract as the 2D version adapted to 3D: spawner (peds on sidewalks and
cars in lanes sampled from `World.tilesNear` around the player, or around the
last known position for the police response, through `spawner.nearTiles`,
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

```js
GTP.AI.update(dt); reset(); updateRespawn(dt)   // Game.step calls updateRespawn while the state is wasted/busted (the AI's fallback DEPLATFORMED flow, a no-op now that Combat defines onPlayerBusted)
GTP.AI.wanted = { level, heat, lastSeen, lastKnown:{x,z}, addHeat(n, src), crime(name, src), set(n), clear(), see(cop) }   // mirrors player.wanted / player.heat; lastKnown is where the response converges
GTP.AI.alarm(x, z, r, src, mild)          // Combat calls it on shots and blasts: peds within r flee (mild = honk: only hurries peds off the road)
GTP.AI.drive(v, kind?) / release(v)       // hand a vehicle with a living non-player driver to the traffic ('traffic'|'cop'|'hoa') brain, or take it back; vehicles never get a brain by themselves
GTP.AI.say(ped, text, color)              // bark: ped.speakLine + a 3D-anchored sprite above the head unless GTP.UI.drawsBarks is true (then the UI draws ped.line itself; GTP.UI.bark(ped, text) is also called when present)
GTP.AI.spawner = { warmup(), update(dt), spawnPed(x,z,role,opts), spawnVehicle(x,z,type,opts), counts() }
GTP.AI.police  = { roadblocks, heli, bustT }   // GTP.AI.Heli: the five-star helicopter entity (kind 'heli', spotlight cone)
GTP.AI.debug   = { counts(), cops(), nearestCop(), vehicles() }
GTP.C.AI       // knobs: cadences, cruise speeds, turn radii, gaps, sight ranges, bust range/time, response quotas per star, roadblock and heli settings; 01_config.js may override
```

Peds made elsewhere (debug.spawnPed, missions) get a brain (`ped.ai`) on sight
unless the brain they carry has `ai.mission` set (a mission brain the AI leaves
alone); a vehicle only drives itself after `GTP.AI.drive(v)`. A `persistent`
vehicle is never recycled by the traffic brain. Hurting or killing a ped with
`ped.hostile` set (mission goons) adds no heat, and hostile cops in a mission's
waves are not witnesses for `shootNearCop`. A goon keeps `hostile` after
Missions releases it (one that gives up and runs, or a survivor at the end):
the last punch landing on a goon as he turns is never the crime that brings
the police. Heat per hit is rate-limited
(`C.AI.heatEvery 0.6 s` for hitPed / attackCop / ramCop, `heatEveryCar 2.5 s`
for denting a cruiser), so an SMG burst or a roadblock ram is one crime, not
one per bullet or contact step; kills count in full. Events:
`wanted {level, prev}`, `heat`, `busted {player, cop, level, fine}`, `bark {ped, text}`,
`roadblock`, `heli {on}`, `heli:down {heli, src}`, `garage {landmark, cost}`. Audio hook: `GTP.Audio.heli(on, x, z)`
when defined (rotor loop). Long vehicles (bus, truck) never turn at street corners.
A turn is only planned into an exit lane that runs on for at least three tiles
(`laneRun`; a one-tile stub at the sea wall is never entered, a short one is
weighted like a dead end). A dead end is a three-point turn: reverse with lock,
swing forward, and another reverse leg (up to three) whenever the nose reaches
the far kerb before the car is round, so the turn stays off the pavement.
The helicopter (`GTP.AI.Heli`, kind `heli`, 400 hp) can be locked and shot:
`applyDamage` smokes it under half health and at 0 sets `down` (a spin to the
ground, a blast with area damage, `police.heli = null`); another one comes after
`C.AI.heli.respawn` (45 s). Its lookup through the Loop deck is a known gap: the
deck is not in `raycastBuildings`, so at five stars the player loses the heli by
outrunning it (26 m/s) or a respray, not by hiding under the Loop.

### GTP.Combat (08_combat.js)

The twelve-weapon arsenal of GDD_EXPANSION §2 in `Combat.ORDER`: `fist
tableleg megaphone pistol revolver smg rifle shotgun sniper hottake hotmic
ratio`, each with the GDD's stats (magazine, reserve, reload, spread, bloom,
recoil, range, price, unlocking mission; `player.ammo[id] = {mag, reserve}`
beside the `player.weapons[id]` total, which saves, missions and pickups keep
writing). Reloads (R, or an empty magazine; shell by shell for the shotgun;
the one-round launcher reloads itself), bloom and recoil, head / torso / legs
hit zones, hit markers and the kill confirm (`hitmarker` events), shell casings,
the muzzle light, the sniper scope and the weapon wheel (below). Aim: holding
`aim` enters aim mode (camera over the shoulder, crosshair, lock-on to the
best target in a 40° cone within range, Tab cycles); without aim, `shoot`
auto-targets the nearest valid target in front (GTA III style; the sniper and
the launcher, `noAuto`, fire straight ahead). Hitscan for guns with tracer fx
and impact decals; the hot take is a lobbed projectile with a 5 m stun, the
hot mic a lobbed charge with a 2.5 s fuse and a 6 m blast, the launcher's
rocket flies straight at 40 m/s and bursts for 8 m; the megaphone is a 6 m
cone push with a visible wave.
Damage flashes, knockback, ped death (fall, fade after 10 s, cash drop),
vehicle bullet damage, player death → `wasted` ("RATIO'D") → hospital
respawn after 3 s, lose weapons, lose 10% cash; busted → `busted`
("DEPLATFORMED") → police respawn, lose weapons, $500 fine.

```js
GTP.Combat.WEAPONS[id] -> {name, dmg, range, rate, spread?, pellets?, melee?, cone?, lobbed?, stun?}; ORDER; SPONSOR (pickup labels)
GTP.Combat.update(dt)                          // also ticks the wasted/busted timers (Game.step calls it in those states)
GTP.Combat.fire(ped, weaponId) -> bool         // rate-limited per ped; the player spends ammo; AI shooters aim at ped.aimTarget || player
GTP.Combat.damage(target, n, src, type)
GTP.Combat.onPlayerDeath(p, src, type)         // Player.die -> state 'wasted' (text from Content.radio.failTexts.wasted)
GTP.Combat.onPlayerBusted(p, cop)              // AI bust() -> state 'busted'; respawn after Combat.RESPAWN_DELAY (3 s)
GTP.Combat.respawn('hospital'|'police'), reset()
GTP.Combat.projectileHit(proj, target)         // Projectile.hit: the hottake's 5 m stun blast
GTP.Combat.collectPickup(pickup, p) -> bool    // Pickup.collect; false for 'mission' pickups (Missions handle them via the 'pickup' event)
GTP.Combat.spawnPickup({type, value, weaponId, ammo, x, z, respawn, persistent, label}) -> Pickup
GTP.Combat.pickupMesh(pickup)                  // Render.buildEntityMesh uses it: sponsor bottle (health/armor), crate + gun + relabeled bottle (weapon), cash
GTP.Combat.pickups                             // Map of the world-table pickups (Content.world.spawn.pickups, `after` gated by Missions.state.completed)
GTP.Combat.aim = { active, target, hover, point:{x,y,z}, screen:{sx,sy,visible}, targetScreen, inRange, weapon }  // UI crosshair + reticle hooks
GTP.Combat.hud() -> { weapon:{id,name,ammo,infinite}, aim, death:{kind,t,text}|null, hurtFlash }
GTP.Combat.drawAimOverlay(ctx, w, h)           // default crosshair/reticle drawer (the UI stub calls it; the full HUD may replace it)
GTP.Combat.death                               // {kind:'wasted'|'busted', t, text} while a card shows
GTP.Combat.cycleWeapon(p, dir)                 // Player.cycleWeapon delegates here: ORDER over the owned weapons, the scope zoom toggle while scoped,
                                               // nothing while the wheel is open; a switch cancels a reload
GTP.Combat.wheelStep(game) -> bool             // Game.step calls it first: with the wheel open it runs the slow step (input, menus, wheel, UI, camera)
                                               // on 4 of every 5 steps and returns true (the world holds: 0.2x)
GTP.Combat.scope                               // {active, zoom 2|4, fov 30|15, sway, t, stillT, range, target}: Render.rig reads it (fov, sway, look / zoom)
GTP.Combat.shop                                // {state, items(tab), buy(id), open(landmark), close(), stores(), discount(), discountHook, rangeT}; a store's
                                               // trigger (its green light) stands 3.2 m along the wall from the door so a mission's blue light keeps the door
```

The arsenal's hooks in other modules are real surfaces, not patches: `Render.rig.kick` and the scope read in
`rig.update`, `Render.fx.register('casing', ...)` (Combat registers its shell-casing InstancedMesh on its first
update), `Ped.syncMesh`'s reload pose from `reloadT / reloadTotal`, `Player.cycleWeapon -> Combat.cycleWeapon`
and `Game.step -> Combat.wheelStep`. The muzzle flash light (`Render.muzzleLight`) stays resident at intensity 0
between shots (adding a light recompiles every material).

`player.lockTarget` is the lock-on target (peds, police cars and the helicopter in a 40° cone within range with line
of sight; Tab = `lockOn` cycles; the helicopter is reached at 1.9x the weapon's range, `reachFor`). Without aim, a shot
auto-targets the best ped in a 150° cone in front and turns the player. From a driver's seat `fire` works only with
`aim` held and a gun (`Combat.driveByWeapon(id)`: pistol, smg, shotgun); the muzzle is the driver's window, the trace
never hits the shooter's own car, the chase camera holds where the mouse put it (no camera change). Events:
`weapon {id, name, ammo}` on a switch, `player:wasted`, `player:respawn {at}`.
Combat's randomness runs on `GTP.rng.fork(0xC0B)` (reseeded in `reset()`), so fights never perturb the
city's spawn stream. Cops drop their gun half the time; peds drop cash sometimes.

### GTP.Missions (09_missions.js)

Identical data shape and runtime to the 2D contract (`goto drive_to
enter_vehicle pickup follow escape_wanted survive destroy defeat dialogue
minigame timer_wrap`), with 3D targets `{x, z}` or `{landmark}` (door point).
**Distances in mission data (`radius`, `maxDist`, pickup/defeat/destroy
`radius`) are GDD units: 8 per metre** (`C.MISSIONS.unit = 0.125`), so the
GDD's literal numbers stay in the content file; everything else is metres.
Optional content fields the runtime honours: a vehicle spawn's `wrap` and
`color`, a pickup spawn's `label` (string or array, printed on the crates), a
destroy spawn's `driven: 'traffic'|'hoa'` (targets drive around with a driver).

```js
GTP.Missions.state = { active: id|null, mission, objective (top-level index), objectiveText, hint, progress ({n,total}|{seconds,total}|null),
                       timer: {remaining, total}|null, dialogue: [line, ...] (current first), minigame: {game, params}|null,
                       phase: 'intro'|'play'|'outro'|null, completed: Set, flags: {}, failed: {id: count} }
GTP.Missions.init(); update(dt)              // Game.step calls update in playing / cutscene / minigame
GTP.Missions.available() -> [mission]        // requires complete and not done; both endings stay available after one is finished
GTP.Missions.start(id, {skipIntro}) -> bool; abort(); fail(reason); completeObjective() (debug: forces the current objective, dialogue or minigame through)
GTP.Missions.prep(id, {intro}) -> bool       // the ?mission= jump-in: prerequisites completed with their flags and weapons, player teleported to the giver's door, intro skipped unless intro
GTP.Missions.markers() -> [{id, kind:'mission'|'objective', x, z, y, missionId, title, giver?, landmark?, color}]   // minimap icons
GTP.Missions.objectiveTarget() -> {x, y, z, dist, text, type} | null   // HUD arrow (nearest pickup / target / the tailed ped / the vehicle)
GTP.Missions.hud() -> { active, title, giver, phase, objective, hint, progress, timer, dialogue, minigame, flags }
GTP.Missions.advanceDialogue(); skipDialogue()   // the UI calls advanceDialogue on confirm (or uses the showDialogue callback)
GTP.Missions._resolveMinigame(win)          // the UI minigame (or a test) reports the result
GTP.Missions.registerTest(mission)          // tests: a mission startable by id but never listed
GTP.Missions.current() -> {def, ctx, index, depth} | null   // the running objective (ctx holds its spawned pickups / peds / vehicles / ped)
GTP.Missions.on(ev, fn)                     // sugar for GTP.Events.on('mission:' + ev)
GTP.C.MISSIONS                               // knobs: unit, markerRadius 1.9, startHold 0.5, lineSeconds 2.5, gotoRadius 6, driveRadius 12, followTooClose 6 / followCloseTime 3 / followFarTime 5 / followPace 0.58 (3.2 m/s: the long Lobby Row tails take about three minutes), waveEvery 10, maxHostiles 14, defeatHold 3, giverRange 170 / kipRange 40 (the cast at a marker: six draw calls per ped), minigameFallback 2, weaponAmmo, colors
```

Flow: an available mission's blue light stands at its giver landmark door with
the giver (cast look) and Kip beside it (within `giverRange`); the player stands
in it on foot for 0.5 s (the trigger arms once the player has been outside it,
so a new game spawning inside the first marker does not auto-start) → banner
(`UI.banner`) → state `cutscene` while the intro plays (the camera eases to a
two-shot over the player's shoulder: `Render.rig.target(giver, true)`; the
player's vehicle is braked) → objectives in order, `timer_wrap` pushing a timer
frame (`state.timer` for the HUD; expiry fails with `timer`) → outro dialogue →
reward, `completed`, `onComplete` flags / `unlockWeapon` (ammo from
`C.MISSIONS.weaponAmmo`), `UI.card('passed', ...)`, `UI.credits()` after an
ending. Objectives and timers pause while a dialogue line shows; the world is
paused during a minigame (Game.step). Spawns are persistent, tracked per run
and cleaned up: on complete, surviving goons are released to the AI (they flee),
parked mission cars stay (no longer persistent) and the car the player sits in
stays; on fail / abort everything but the player's car is removed. Objective
types: `goto` on foot within radius of the door; `drive_to` in `'any'` vehicle or
the `'spawned:<tag>'` one; `enter_vehicle` spawns the tagged vehicle in a free
bay (or on the road) near `at`, marker follows it; `pickup` spawns `count`
mission crates around the landmark, collectable on foot or from a vehicle,
progress in the objective text; `follow` spawns the cast ped at `at` walking the
`path` of landmark doors (A* on sidewalks at a brisk 3.2 m/s; a tail that stops
closing on its route point for 2.5 s, e.g. pushing on a car stopped on the
crosswalk, sidesteps, re-routes and every third time is nudged past) and fails
when the player is within 6 m for 3 s (`spotted`) or beyond `maxDist` for 5 s
(`target_escaped`);
`escape_wanted` sets the stars (`AI.wanted.set`) and completes at 0;
`survive` spawns waves of the given roles (totals spread over `seconds/10`
waves, capped at `maxHostiles` live) around the player and completes when the
seconds elapse; `destroy` completes when every tagged vehicle is a wreck;
`defeat` when every spawned ped is dead, fled or down for 3 s (a goon under 35%
hp that gets knocked down gives up and runs); `dialogue` queues lines;
`minigame` hands `{game, params}` to `UI.startMinigame` and fails the mission on
a loss. `failOn`: `player_dead` (the `player:wasted` event; `busted` also fails),
`vehicle_lost:<tag>`, plus the follow / timer / minigame reasons. Mission peds
carry a mission brain (`ped.ai.mission` = `hostile` | `follower` | `giver`; the
AI never ticks them) and goons are `ped.hostile` (no wanted heat for fighting
them). Dialogue: lines are `{who, name, color, text, ticker, voice}`; with no
`UI.showDialogue` a line auto-advances after `lineSeconds` or on confirm/action;
`ticker: true` lines go to `UI.ticker` and never block. With no
`UI.startMinigame` a minigame auto-resolves as a win after `minigameFallback` s.

UI hooks (all optional): `banner(title, sub)`, `card('passed'|'failed', title,
sub)`, `showDialogue(line, next)`, `hideDialogue()`, `ticker(text)`,
`startMinigame(game, params, done)`, `endMinigame()`, `credits(id)`, `toast`.
Events on `GTP.Events`: `mission:start`, `mission:objective`,
`mission:objectiveDone`, `mission:complete`, `mission:fail {reason, text}`,
`mission:abort`, `mission:dialogue`, `mission:ticker`, `mission:minigame`,
`mission:minigameDone`, `mission:wave`, `mission:ending`.

**Expansion (GDD_EXPANSION §3, §5, §6.4, §6.5, §7).** The mission list is
`Missions.allMissions()` = `Content.missions` + `Content.expansion.missions`
(25 story missions), with `Content.expansion.retune` (`{id: [{path, value}]}`)
applied once at init. Targets gain `{landmark, point}` (`landmark.points`),
`{landmark, offset:{x,z}}` (GDD units from the door; `Missions.resolvePoint(t,
{metres:true})` for metres) and `{tag}` (a tagged vehicle's position). New
objective types: `equip {weaponId, ammo}` (instant), `deliver_passenger {spawn:{ped,
at}, to, vehicle, board:{radius, hold}, dropRadius}` (hail → board the stopped
vehicle → ride → step out; `passenger_lost`), `stop_vehicle {spawn:{vehicle, tag,
at, driven, flee}, stopSpeed, hold, maxDist, wreckCounts}` (`state.holdBar {k,
text}` for the STOPPED bar; `target_escaped`, `target_destroyed`), `stunt {ramp,
vehicle, minAir, minSpeed, landing, strict}` (through `Strands.stunts.watch`;
`stunt_failed` only when strict, else the objective waits for another try),
`race {race:'lr_xx' | inline {start, checkpoints, laps, racers}, place}` (`race_lost`,
`dnf`), `collect_any {spawn, need}`, `cutscene {cutscene: id | script}` (skipped on
RETRY) and `shop {landmark, buy}`. Extensions: `defeat` `weapon` (a kill with
another weapon is WRONG TAKE and the ped is re-spawned) and `mustKill`; `destroy`
`weapon` (the wreck's last hit, `v._lastHit`), `driven:'cop'` (rams), `colors[]`,
`flee`; ped spawns `stationary`, `hostile:false`, cast ids and `cutout` (a
role id always rolls from the AI pool, even when a cast portrait shares the id);
`enter_vehicle` reuses a live persistent tagged vehicle (`podvan`, `sponsorvan`:
`v.keep` vehicles outlive the mission); `onComplete` `takeWeapon`, `playCutscene`,
`giveMoney`, `subs`; missions `act`, `replayable`, `cutsceneIntro`. A `failOn`
`vehicle_lost:<tag>` rule only bites while the running objective or a later one
still names the tag (`spawned:<tag>`, a `{tag}` target or spawn anchor): the jet
truck rolling off the beach after its jump, or a car lost during the outro, is no
failure. A wreck's `_lastHit` is credited to whatever wrecked the vehicle whose
blast took it (a rocket into a row of memo vans counts the row, not WRONG TAKE).

Checkpoints: every objective start takes a snapshot (`run.checkpoint`: player,
vehicle, wanted, flags, the cursor into the objective tree with the timers, the
live tagged vehicles as records). `fail` keeps it as `Missions.lastFail()` and emits
`mission:failed {id, reason, text, retry, objective}` beside `mission:fail`;
`Missions.canRetry()`, `retry()` (restores the player and re-spawns the tagged
vehicles from the records, resumes at that objective, timers +15 s capped at the
original, `stats.retries`), `restart(id?)` (from the marker, intro skipped),
`replay(id)` (a completed mission from its door, intro included; `run.replay`
skips rewards / flags / unlocks / autosave, restores the weapons after, writes
`state.bestTimes[id]` only when better; `completedList()`, `bestTime(id)`).
Intros: when `Cutscenes.scriptFor(m.cutsceneIntro || 'cs_intro_' + id)` exists,
`start` plays it (`opts.reuse` hands the marker's giver and Kip in as actors,
`opts.lines` the intro when the script has none) instead of the two-shot; act
cutscenes play 2.6 s after MISSION PASSED from `onComplete.playCutscene`,
`Content.expansion.cutsceneAfter[id]` or the GDD defaults, once per save
(`flags.cs_<id>`), before the credits. `Missions.say(lines, done)` runs lines
through the queue without changing state; `busy()` is true while a run, a
pending act cutscene, a dialogue or a minigame is up.

Subscribers (§5.8): `player.subs` (saved), `Missions.addSubs(n, why)` (`subs`
event, a pink float), `Missions.subscribers() -> {count, tier, name, perk, next,
perks}`, tiers from `Content.expansion.subscriberTiers`; story reward x 5, strands
their listed amounts, chaos capped at 500 / min. Perks: tier 2 sets
`C.WANTED.sprayCostPerStar 50`, tier 3 adds 25% to `Combat.shop.discountHook`
and keeps the weapons through a hospital respawn, tier 4 respawns with 50 armor,
tier 5 tops the pistol's reserve up. `Missions.syncSubs()` re-applies after a load.

### GTP.Strands (09_missions.js)

One strand at a time, never during a story mission (`start` toasts "Finish the
mission first."). Data: `Content.expansion.strands` (`loud_cab`, `hoa_patrol`,
`sponsor_runs`, `rampages[]`, `memos[]`, `races[]`, `stunts[]` and their `*Rules`);
`Strands.DEFAULTS` mirrors the GDD tables as the fallback.

```js
GTP.Strands.init(); update(dt) (Game.step, playing only); afterCamera(dt) (the stunt side view over the rig)
GTP.Strands.start(id, arg) -> bool; end(reason); active() -> id|null; current(); progress(); state(); summary() (the phone's STRANDS tab)
GTP.Strands.hud() -> {active, title, line, timer:{remaining,total}|null, progress, target, holdBar, race:{active, countdown, position, racers, lap, laps, checkpoint, total, time}, stunt}
GTP.Strands.markers() -> [{id, kind:'strand', icon:'rampage'|'race'|'home'|'target'|'violation', x, z, y, title, color}]   // Missions.allMarkers() = missions + these
GTP.Strands.objectiveTarget()          // the active strand's arrow target (the mission arrow wins)
GTP.Strands.rampages(), racesList(), memos() -> {collected, total, byDistrict}, stuntList(), memoPickups()
GTP.Strands.drivers = { take(v, 'flee'|'ram'|'route', opts), release(v), update(dt) }   // the chauffeur: scripted drivers the AI never ticks (v._chauf)
GTP.Strands.stunts  = { ramp(id), list(), watch({ramp, vehicle(v), minAir, minSpeed, landing, onResult}), unwatch(w), air }
GTP.Strands.races   = { def(id), list(), unlocked(d), begin(def, {mission, countdown, onFinish}), end(), active(), hud(), nextCheckpoint(), position() }
GTP.C.STRANDS       // knobs: hail / stop / leave timers, race ring 8 m, rubber band 8%, stunt slow-mo 0.35x after 0.6 s for 2.2 s, launch angle 0.42 rad
```

Rules per strand follow GDD_EXPANSION §5: Loud Cab and HOA Patrol start with
`action` while stopped in a taxi / cop car / HOA SUV and end the same way with
no passenger or target; Sponsor Runs start by entering the `sponsorvan` the
runtime parks at the depot once `m02_read` is done (`ensureVehicles` also parks
THE RATIO after `race_car`, the home cab after `cab_home`, the HOA SUV after
`m10_pellets`); rampage bubbles and race start lines are markers (stand in one
on foot 0.5 s; brake in a car on the line 1 s; the light goes out while its own
rampage or race runs and while a rampage bubble is on cooldown); memos are `memo` pickups (an
envelope mesh, two draw calls, hidden beyond 70 m) collected by the `pickup`
event; stunts are detected on the player's car leaving a `World.stuntRamps`
wedge (the detector adds `speed * sin(launch angle)` of lift, since the vehicle
physics zeroes `vy` off a ledge). Events: `strand:start`, `strand:cycle {id,
level, reward, ...}` (the autosave trigger), `strand:end`, `race:start`,
`race:finish`, `stunt:launch`, `stunt:land`, `memo`. Progress persists through
`GTP.SaveHooks` (`data.strands`, `data.memos`).

### GTP.Cutscenes and GTP.Hints (12_cutscenes.js)

```js
GTP.Cutscenes.play(script | id, onDone, {lines, mission, reuse}) -> bool   // state 'cutscene', Render.freeCam, actors, lines through Missions.say
GTP.Cutscenes.playOnce(id, onDone)     // once per save: flags.cs_<id>
GTP.Cutscenes.skipShot(); skip(); cancel() (no onDone); reset(); update(dt) (Game.step); scriptFor(id); actors(); pose(ped, anim|null)
GTP.Cutscenes.active, letterbox, hud() -> {active, letterbox, skip 0..1, shot, shots, title, t, seconds, skippable}
GTP.C.CUTSCENES   // skipHold 0.6, camDamp 7, lookDamp 9, holdDefault 0.6, pushOut 0.5, hintSeconds 6, hintGap 2
```

The schema is GDD_EXPANSION §4.1 plus the content's extensions (`split`,
`actor.sign`, `face:'away'`, `shot.track:'speaker'`, `shot.vehicles`, `fx.tag`;
`preSpawn` is read by nobody yet). A shot ends when its camera time and its lines
are done plus `hold`; the camera is an eased dolly damped per step, the look-at
re-resolved each step (entities track); the from-point is pushed out of
buildings. Actors are persistent peds (`ai.mission 'cutscene'`, `ped.cutscene`)
frozen through an instance `update`, posed through an instance `syncMesh`
wrapper over the prototype's (idle talk point table wave; the speaker gestures
while their line shows); `roof: true` stands one on `landmark.building`'s top;
`'player'` repositions the real player, whose `controlEnabled` is off until the
end. `back` skips the shot, `confirm` held 0.6 s the script; `AI.alarm` is a
no-op and the wanted level is parked for the duration; `music` 'off' /
'station:<id>' / 'keep'. Events: `cutscene:start`, `cutscene:shot`,
`cutscene:end {id, skipped, completed}`. The UI draws the letterbox from state
`cutscene` and the pill from `hud().skip`; mission markers go dark meanwhile.

Hints: `GTP.Hints.fire(id, force)` queues a §6.6 hint (texts from
`Content.expansion.hints`, fallbacks inline); `update(dt)` shows one at a time
for 6 s with a 2 s gap, only in `playing` with no cutscene, as the `hint {id, text,
keys}` event and `Hints.hud()`; `flags.hint_<id>` makes each once per save (a
queued `h_enter` is dropped unseen once the player is already driving, `h_drive`
once they are out, so the proximity trigger can fire it again when it applies);
`Hints.enabled = false` is the Settings switch; `conditions()` fires the
proximity / state triggers (h_enter, h_drive, h_arrow, h_aim, h_reload, h_wheel,
h_wanted, h_bust, h_shop, h_taxi, h_patrol, h_map); the opening cutscene fires
`h_move` (then `h_look`), the home van `h_save`.

### GTP.Render (10_render.js)

```js
GTP.Render.init(canvasGl); resize(); renderer, scene, camera (PerspectiveCamera 60°), hudCanvas
GTP.Render.rig = { mode, yaw, pitch, dist, fov, target(entity), update(dt, input), shake(amount), kick(pitchDeg, yawDeg, recover) }   // third-person chase rig;
                                      // kick = Combat's recoil (the view jumps and recovers by damp); while Combat.scope.active the update divides the look
                                      // by the zoom, damps the fov to the scope's and rides a breath sway (0.15 deg at 0.5 Hz, halved after 1 s standing still)
GTP.Render.frame(alpha)               // sync entity meshes, update rig, lights, sky, draw scene, then GTP.UI.draw(hudCtx)
GTP.Render.chunks                     // 16x16-tile static chunks (14 x 14 of them): ground mesh (atlas), building mesh (facade materials by style), props InstancedMesh per kind
                                      // (hidden props skipped; sx/sy/sz or scale per instance; lamps, runway edge lights and the red airfield beacons as Points batches,
                                      // beacons blink at 0.5 Hz); built lazily around the camera, frustum culled by three
GTP.Render.prebuild(x, z, radius, onProgress, onDone) -> count   // the loading screen: builds the chunks within radius of a point. With onDone (not headless) a few per
                                      // animation frame (QUALITY.prebuildPerCall, 3) with onProgress(fraction, label) between steps and 'load:progress' {stage:'chunks', frac, bar}
                                      // events; without onDone, or headless, synchronous. Idempotent (built chunks are skipped)
GTP.Render.sky                        // {dome, sun, moon, stars, clouds, cloudMat}: the equirect dome, sun / moon sprites, 700 stars, a drifting cloud plane 240 m up
                                      // (ShaderMaterial: noise thresholded by the weather's cover, lit by the sun colour); fog color follows time of day and weather
GTP.Render.lights                     // {hemi, sun, target, fill, headlight, headlightOwner, sunDir, points[12], spots[6], exposure}: hemisphere + directional sun
                                      // (arc leaning south, intensity by elevation and cloud cover, PCF / PCFSoft shadows sized by the preset in a 120 m box
                                      // following the player), the player car's spot, the pools (QUALITY.pointLights lamps nearest the focus get a point
                                      // light at night, QUALITY.headlights lit cars a spot; unused ones sit at intensity 0 so the shader never recompiles),
                                      // emissive windows / neon / prop glow at night
GTP.Render.env                        // {night, elev, horizonW, lit, overcast, rain, exposure, sunColor, fogColor, skyTop, horizon, duskW, clock} the last updateEnvironment
GTP.Render.envMap                     // the PMREM texture of the sky (scene.environment); refreshed every half hour of the clock and on weather changes (stats.envRefreshes)
GTP.Render.quality                    // {current, auto, list(), set(preset|'auto'), apply(), measure(now), history}: the presets of C.QUALITY_PRESETS applied live
                                      // (shadows, light pools, surface maps, PostFX.setPreset, tone mapping handed to the post pass, a material recompile);
                                      // auto steps down one preset when the frame time stays over QUALITY_AUTO.slowMs for slowSeconds; `quality` event
GTP.Render.weather                    // {state, target, overcast, rain, wet, wind, cycle, set(state, instant), update(dt), states()}: clear / overcast / rain blended over
                                      // C.WEATHER.transition; rain = a Points streak cloud around the camera (QUALITY.rainCount), wet roads (ground roughness
                                      // down, metalness and env reflection up), puddle decals (an InstancedMesh of mirror discs, QUALITY.puddles, re-seeded as the
                                      // player moves), darker sky / sun / fog; the cycle rolls the next state after 3..8 game hours (off with ?weather=);
                                      // GTP.game.debug.setWeather(state, instant) / setQuality(preset) (30_game's debug API) call these; `weather` event
GTP.Render.stats                      // {frameMs, chunkBuilds, triangles, calls, envRefreshes, lodNear, lodFar}; calls covers the shadow pass and the post passes
                                      // (info.autoReset is off; frame() resets it)
// chunk LOD: ensureChunks swaps a chunk's ground / facade / prop materials to the Lambert *Far variants beyond QUALITY.lodDistance (+48 m out, +24 m back)
// building detail (10_render _building): awnings over the painted doors (strip, marina, brownstone, campus, suburbs, mansion), entrance canopies, steps and
// planters (downtown, capitol, hospital, airport...), balconies on alternate floors (brownstone, marina, mansion, suburbs), a ledge every four floors,
// water tanks, antenna masts and helipads on the roofs; all merged into the chunk's facade mesh (no extra draw calls)
GTP.Render.fx.add({type:'puff'|'spark'|'smoke'|'fire'|'explosion'|'ring'|'tracer'|'decal'|'text'|'skid', x,y,z, vx,vy,vz, size, life, color, rot, size2 ...})  // decals/skids are capped (oldest dropped)
GTP.Render.fx.register(type, {add(o), update(dt), sync(), clear()}); extensions   // another module's fx type run beside the list: Combat registers 'casing'
                                      // (the shell casings' InstancedMesh, Render.fx.casings) on its first update
                                      // decals and skids share one InstancedMesh (fx._decalIM, MAX_DECALS 220 slots, per-instance colour and
                                      // alpha, a free slot is scaled to nothing): one draw call for all of them; `rot` is a yaw, the mark lies flat.
                                      // Skid marks come from a slide, a handbrake, or the player's car braking hard (traffic easing for a light leaves none)
GTP.Render.syncVehicle(v)             // called by Vehicle.syncMesh: wheels (InstancedMesh), light material slots, siren, wreck look, the player's headlight SpotLight + beam quad
GTP.Render.worldToScreen(x,y,z) -> {sx, sy, visible}
GTP.Render.freeCam(enabled)           // tests: place camera anywhere via camera.position/lookAt
GTP.Render.markerMesh(color) -> Group // a mission marker: translucent additive cylinder of light + core + ground ring; userData.pulse(k) breathes it
GTP.Render.addMarker(mesh); removeMarker(mesh)   // Missions owns positions and the list (Render.markerGroup)
GTP.Render.rig.target(entity, ease)   // ease = glide to the new target instead of snapping (cutscenes)
GTP.Render.knockProp(prop)            // Vehicle._knockProp: the prop's InstancedMesh matrix tips over its base in the fall direction over 0.45 s
                                      // (prop._inst = {im, k, base pose} is kept per chunk build; a rebuilt chunk places a fallen prop down at once)
```

### GTP.PostFX (10b_postfx.js)

```js
GTP.PostFX.init(renderer); resize(w, h); setPreset(C.QUALITY); render(renderer, scene, camera)   // Render.frame calls render every frame
GTP.PostFX.enabled, supported, hdrType, flags {ssao, bloom, fxaa, grain, samples}, params {bloomThreshold, bloomKnee, bloomStrength, aoRadius, aoBias,
             aoIntensity, aoStrength, vignette, grain, saturation, contrast, split, fogDensity, fogHeight, fogBase, sunGlow}, stats.passes, debugView
```

Core three r152 only (no examples/jsm). When enabled (QUALITY.post, medium and
up) the scene renders into a half-float target with a depth texture, with the
renderer's tone mapping off; then SSAO at half resolution (hemisphere kernel of
QUALITY.ssaoSamples over depth-reconstructed positions and normals, a
depth-aware separable blur), bloom (a soft-knee threshold that follows the
hour, four tent down-samples, additive up-samples), the composite (height fog
from depth tinted toward the sun, AO, bloom, exposure from Render.lights,
the same ACES fit the renderer uses, lift / gamma / gain, a teal-shadow /
warm-highlight split by day and blue / amber by night, saturation, an
S-curve, vignette, grain, sRGB out) and FXAA 3.11 on the display-referred
image. `debugView = 'scene' | 'depth' | 'thresh' | 'bloom' | 'ao' | 'down0..3' | 'up0..2'`
blits a buffer to the screen (NaN shows magenta). When disabled, render() draws
straight to the canvas and the renderer's ACES applies. Any throw disables the
pipeline for the session and falls back to the plain render.

Signs are front-face planes (a double-sided plane reads mirrored from behind);
free-standing signs and billboards get a grey painted-steel backing board with
a frame (`_backMat`), wall signs have the wall.

Camera rig rules (this is where GTA feel lives):
- Chase on foot: distance 4.2 m, height 1.9 m, looks at the player's chest.
  Mouse/touch look orbits yaw/pitch (pitch clamped -20°..60°). When the
  player moves and no look input for 1.2 s, the yaw eases behind the movement
  intent (the stick / keys, not the velocity: a bump from a car or a crowd
  does not swing the camera). Collision: raycast from target to desired camera
  position against buildings; pull in to the hit point minus 0.3 m.
- Chase in vehicle: distance 7.5 m (bus 10), height 3 m, yaw eases toward the
  vehicle's velocity direction (reverse flips after 0.5 s) unless `aim` is held
  (a drive-by keeps the camera where the mouse put it), fov 60 → 75 with
  speed, slight roll on hard turns, shake on impacts.
- `close` halves distances; `first` is at eye height with the body hidden.
- Aim mode on foot: over the right shoulder, 2.0 m back, 0.7 m right, 1.85 m up
  (`CAMERA.aimHeight`), looking at 1.5 m (`aimLookHeight`), fov 50. In a car the
  chase camera stays.
- Smoothing via `damp` per axis; never snap except on respawn or teleport.

### GTP.UI (11_ui.js)

2D overlay on `canvas#hud` (same size as the GL canvas, crisp at
devicePixelRatio; Render sets the transform and passes logical width/height
to `draw`). Everything the 2D contract listed: title screen (attract
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

```js
GTP.UI.init(); update(dt); draw(ctx, w, h); resize(w, h); onState(state, prev)
GTP.UI.handleInput(state) -> bool      // Game._handleGlobalInput calls it first each step; true = the UI consumed the frame's
                                        // menu input (title menu, pause, phone, dialogue advance). update() falls back to it
GTP.UI.drawsBarks = true                // the AI skips its bark sprites; the HUD draws ped.line pills via Render.worldToScreen
GTP.UI.banner(title, sub); card('passed'|'failed', title, sub); toast(text); ticker(text)   // mission hooks
GTP.UI.showDialogue(line, next); hideDialogue(); advanceDialogue()   // typewriter box; confirm / tap / E skip, lines auto-advance after
                                                                      // max(C.MISSIONS.lineSeconds, typing + reading time)
GTP.UI.startMinigame('debate'|'ratio', params, done); endMinigame()  // sets state 'minigame' itself when called outside Missions
GTP.UI.minigames.debate = { start(params, onResult), answer(id, shout), update, draw, state, active, cancel }   // id: 'SOURCE?' 'LOUDER' 'PIVOT' 'DEFINE TERMS' 'WHATABOUT'
GTP.UI.minigames.ratio  = { start(params, onResult), post(), hottake(), zone() -> 'DUNK'|'REPLY'|'CRINGE', update, draw, state, active, cancel }
GTP.UI.credits(id)                      // rolls the cast as ad tickers in state paused (page 'credits') or on the title (page 'credits'); confirm / Esc skips
GTP.UI.openPause('pause'|'phone'|'controls'|'credits'|'settings'|'slots'); closePause(); setMuted(b); isMuted()
GTP.UI.openShop(store, lm); closeShop()  // the shop overlay in state playing (UI.state.shopOpen); Combat.shop.open calls openShop, 'shop:close' closes the page
GTP.UI.openMap(); setWaypoint(x, z) -> {x, z}|null (a second call within 12 m clears); waypoint()   // GTP.game.waypoint (saved)
GTP.UI.drawWeaponWheel(ctx)             // reads Combat.hud().wheel; drawn in state playing while open
GTP.UI.settings                         // the live settings {master, music, sfx (0..100), quality ('low'..'ultra'|'auto'), drawDistance ('near'|'normal'|'far'),
                                        // weather, gamepad, hints (bool), subtitles ('small'|'large')}; applySetting(id); saveSettings(); settingRows
GTP.UI.glyph(action) -> 'TAB' | 'R3' | 'WPN'...; device() -> 'keyboard'|'gamepad'|'touch'   // prompts follow Input.lastDevice
GTP.UI.drawPortrait(ctx, recipe, x, y, size, {color, shirt, voice, id, sign}); castPortrait(ctx, castId, x, y, size); drawWeaponIcon(ctx, id, x, y, size, color)
GTP.UI.landmarkLabel(lm) (Goldplate prefixes per act flag); rozSign() (player.stats recency, else CHEESE / NO CHEESE / PARKING); currentStation()
GTP.UI.touch = { handle(touchEvent), show(bool) }   // Input.onTouch forwards raw events; writes Input.touch.stick / look / buttons (Input.set for presses)
GTP.UI.state                            // the live UI state for tests: toasts, banner, card, retry {sel}, dialogue, ticker {cur, queue}, wanted {last, flashT},
                                        // touch {visible, buttons}, map {bake, zoom, cx, cz, rect, route}, pause {page, tab, rows, slotMode, slotSel}, title {page, items, sel,
                                        // slotMode, slotSel, seed}, settings, confirm, loading {tips, tipI}, shop {tab, sel, msg}, subs {shown, floats}, stunt {k}, memoFloat, attract, credits
```

The expansion's front end (GDD_EXPANSION §6; all in 11_ui.js):

- **Loading screen**: drawn by `draw()` whenever `GTP.game.loading.active`
  (boot, New Game, Load; headless too, so a test can freeze the state and
  screenshot it): black, the logo small top-left, a 60 % pink bar with a gold
  folding-table caret, the stage label from `Content.expansion.loadingStages`,
  the twenty `loadingTips` in `GTP.rng.fork(0x71B5)` order rotating every 4 s.
- **Title** (`UI.state.title.page`: `menu | slots | settings | controls |
  credits`): NEW GAME, CONTINUE (first when a slot exists; its summary line is
  the description), LOAD GAME, SETTINGS, CONTROLS, CREDITS; the selected item's
  description on the right. NEW GAME with no save anywhere starts at once in
  slot 1 on the bare `newGame(seed)` (`FAST_START_OPENING = false`: the
  contract's old title Enter, no opening); with a filled slot it opens the slot
  picker (`slotMode 'new'`), whose START HERE / OVERWRITE (an in-page
  confirmation) run `newGame(seed, {opening: true})` and claim the slot with a
  quiet `saveSlot`. LOAD GAME shows the three cards (`GTP.game.slots()`:
  missions, last mission, play time, money, district and landmark, stars, day
  and clock, timestamp; EMPTY. Respectfully.) with LOAD / DELETE (DELETE SLOT
  n? in-page) or NEW GAME HERE, and the seed field (digits via
  `Input.text`). Every confirmation is `UI.state.confirm` drawn in-page
  (never `window.confirm`).
- **Settings** (shared by the title and the pause menu): master / music / sfx
  sliders (`GTP.Audio.setVolumes({master, music, sfx})` when the audio module
  defines it, else a wrapper scales `Audio.play`'s gain by master x sfx and
  `Audio.volumes` carries the values; master 0 mutes), QUALITY (low / medium /
  high / ultra / auto through `Render.quality.set`, the live preset shown),
  DRAW DISTANCE (160 / 260 / 360 m: `C.QUALITY.drawDistance`, `fogStart`
  0.46 x, the scene fog), WEATHER (`Render.weather.cycle`; OFF also sets
  clear), GAMEPAD (`Input.gamepadEnabled`), HINTS (`Hints.enabled`), SUBTITLES
  (dialogue box x1.25), CONTROLS (the table plus the pad layout when one is
  connected). Saved in `localStorage['gtp.settings.v1']` (try/catch) and
  applied at init, except the quality preset when the URL chose one
  (`?quality= ?low=`, headless).
- **Pause** (`pause.page`): RESUME, SAVE (the slot cards in `slotMode 'save'`;
  "Saving now will abandon the mission / strand" asks first), LOAD GAME
  (`'load'`, "Lose unsaved progress?"), MAP, SETTINGS, CONTROLS, MUTE, RESTART
  and QUIT TO TITLE (both ask). An autosave shows the spinning-table SAVED icon
  bottom-right for 1.2 s (`saved` event with `auto`).
- **Map page** (`pause.page 'phone'`, M; tabs MAP · MISSIONS · STATS ·
  STRANDS · REPLAY, Tab / LB RB cycle; arrows and the stick move the
  selection on the list tabs): the bake at fit-to-screen x zoom 1..4 (wheel,
  + -, pinch, the right stick, the + / - buttons, centred on the cursor),
  pan by drag / WASD / the left stick, district tints and gold names, landmark
  icons by kind (labels from 2x; 3x on a narrow map), mission / objective /
  strand / shop / home markers, the player arrow, the waypoint pin and the
  dashed route, a legend, the location chip; a click or tap (A on a pad)
  sets the waypoint. MISSIONS lists the active mission (ABORT: the button or
  `secondary`), the RETRY offer, the available missions and the completed ones
  with best times and REPLAY (`Missions.replay`); STRANDS shows the
  subscribers tier card (`Missions.subscribers()`), every strand's
  `Strands.summary()` line and the memo count (per district after 25);
  REPLAY lists `Missions.completedList()`.
- **Waypoint**: `GTP.game.waypoint`; the HUD arrow turns white when no mission
  or strand target outranks it; the minimap and the map draw the route from
  `World.findPath(..., {mode: 'car'})` refreshed every 2 s (a straight line
  without a path); arriving within 10 m clears it.
- **Shop** (`UI.state.shopOpen`, `UI.openShop`; Combat's green light beside the
  store door (3.2 m along the wall, so a mission's blue light can hold the door)
  calls it and the `shop:open` event is the fallback): a modal overlay that keeps the
  Game state `playing` (the mission runtime only ticks objectives in
  `playing`, so a `shop` objective completes at the counter): the player's
  `controlEnabled` is off and the UI consumes the input while it is up, the
  world ticks on; it closes on cancel / Esc / M / EXIT, on `shop:close` and on
  any state change (a cutscene keeps its own control lock). Tabs WEAPONS /
  AMMO / GEAR (+ RANGE at the flagship) from `Combat.shop.items(tab)`; the list with prices,
  OWNED and mag | reserve, LOCKED rows naming the unlocking mission's title;
  the card with the icon on a turntable, five stat bars, Merle's pitch and
  portrait; BUY through `Combat.shop.buy` with SOLD / NOT ENOUGH CASH / LOCKED
  feedback and Merle's barks from `Content.expansion.shop.barks`; EXIT /
  cancel closes (`Combat.shop.close`).
- **Combat overlays**: the weapon panel reads `mag | reserve` (pink with
  `flags.rampage_king`, a RELOADING bar); the crosshair's ticks spread with
  `Combat.hud().bloom.k` (4..22 px), flare white on a hit and draw a pink X on
  a kill (`hud().hitmark`), the reload arc fills around it, the hot mic's fuse
  sits under it; the scope (`hud().scope`) is a black vignette with a round
  window, hairline cross with mil ticks, the range and zoom readouts and a
  lock pill on the ped under the cross; the wheel (`hud().wheel`) is twelve
  segments in `Combat.ORDER` with icons and ammo, the hub naming the
  highlighted one.
- **Cards**: CONTEXT STAMPED holds while `Missions.canRetry()` with RETRY /
  RESTART MISSION / QUIT (left / right, confirm, cancel = quit; mouse and
  touch) and is re-offered after a hospital or precinct respawn; the mission
  banner yields to it. Hints draw from `Hints.hud()` with the active device's
  glyphs (`Content.expansion.hints[].glyphs`); the race HUD (position, lap,
  checkpoint, clock) sits above the objective panel; the stunt overlay (bars,
  the ramp's name, the airtime) fades in while `game.timeScale < 1` with
  `Strands.hud().stunt`; the memo counter floats on the `memo` event; the
  cutscene letterbox is `C.CUTSCENES.letterbox` (12 %; 8 % for the old
  two-shot) with the shot counter, the title, "HOLD <confirm> TO SKIP" filling
  with `Cutscenes.hud().skip` and the dialogue box above the bottom bar.
- **Touch**: eight buttons (FIRE, AIM, JUMP, ENTER, WPN with a long press
  for the wheel and a tap to cycle, RLD, MAP, PAUSE; in a car HORN, RADIO,
  BRAKE, EXIT, CAM, AIM) plus the stick and the look area; the map page takes
  one-finger drag / tap and two-finger pinch.

States: the phone, pause menu, controls page and credits all live in Game
state `paused` (`UI.state.pause.page`); the title's attract camera uses
`Render.freeCam(true)` and is released on the first state change. The
minimap bake (1 px per metre, 896 px, landmark footprints lighter, the runway
strip, the Loop on top) is rebuilt when `World._seed` or the map size changes;
it shows the strand icons (rampage bubble, checkered flag, home, HOA star,
target), the shops, the waypoint pin and the route. Layout scale `S =
clamp(min(w/1280, h/720), 0.62, 1.3)` (portrait phones: `clamp(w/560, 0.62,
1)`); with touch controls the minimap moves top-right (landscape) or top-left
under the objective panel (portrait) so the buttons keep the bottom corners.
Every HUD string is outlined or sits on a panel. The objective panel hugs its
text (full width only with a timer bar) and, with no mission, carries the
active strand's line; the mission banner sits above the district chip; bark
pills are drawn only for peds on screen. The lock reticle labels the
helicopter `WEATHER BALLOON`. Cosmetic randomness runs on forks of `GTP.rng`.

### GTP.Content (2x)

- `world`: `layout` (districts with rects and style, grid spacing, water,
  channel, bridges, loop legs and ramps, parks, promenades, plazas), `landmarks`
  (id, name, kind, district, block anchor `{bx, bz}`, footprint `{w, d}` tiles,
  height m, facade, roof, `label`, `points`, `gag`; 34 base + 16 expansion),
  `stuntRamps` (the ten wedges), `spawn` (ped looks and roles per district,
  vehicle types per district, parked cars and fixed fleets per landmark,
  weapon/health pickups with mission gating; the eleven districts), `streets`
  (names for the minimap and the HUD "district / street" chip; `byDistrict`
  for the expansion's thirty names, `lowerHighway` / `lowerHighwayLine`),
  `billboards` (`pairs` with `alley` / `stroll` index lists, `ads`),
  `playerSpawn` landmark id.
- `cast`, `missions`, `radio`: straight from GDD §4, §6, §8-9 (ids verbatim).

### GTP.Game (30_game.js)

As in the 2D contract: `boot({headless, seed, mission, skipTitle, low, mute,
debug})`, states `title playing paused wasted busted cutscene minigame
gameover`, `step()`, `advance(seconds)`, `render()`, `time {t, clock, day}`
(1 game hour = 90 real s; start at 17:30 for a sunset first frame), `player`,
`newGame(seed)`, `save()`, `load()`, `hasSave()`, and
`debug = { teleport(x,z,y?) (moves the vehicle the player sits in too), spawnVehicle(x,z,type,opts?) (opts: color, yaw, wrap:'pod', locked, y), spawnPed(x,z,look?,role?), giveWeapon(id, ammo), setWanted(n), setMoney(n), startMission(id), completeObjective(), completeMission(), godMode(b), listLandmarks(), setClock(h), freeCam(x,y,z,lx,ly,lz), followCam(), snapshot() }`.
`snapshot()` returns a plain-object summary (player pos, state, wanted, mission,
counts, fps) for tests and for `window.claude?.hot?.snapshot`.

URL params: `headless=1 seed=<int> mission=<id> intro=1 skipTitle=1 mute=1 low=1 debug=1 clock=<h>`.
`mission=<id>` boots straight into that mission (`Missions.prep`: prerequisites
complete with their flags and weapons, player at the giver's door, intro
skipped unless `intro=1`). `step()` runs the full simulation in `playing` and
`cutscene`; in `minigame` only `Missions.update` and fx tick (the world is
paused); in `wasted` / `busted` only Combat, the AI respawn fallback and fx.
`_handleGlobalInput` hands each step to `GTP.UI.handleInput(state)` first (menus
consume their keys: title, pause, phone, dialogue); Game's own title / pause
toggles remain as the fallback when the UI does not claim the frame.

Expansion: `step()` first asks `Combat.wheelStep(this)` (the open weapon wheel
runs 4 of every 5 steps as a slow step and returns true), then also ticks
`Cutscenes.update` (when active), `Strands.update`, `Hints.update` and
`Strands.afterCamera` (after the rig), accumulates `playTime` in playing /
cutscene / minigame, and scales wall time by `timeScale` (the stunt
slow-motion) in `_loop`. The debug API also carries the graphics hooks
`setWeather(state, instant)` and `setQuality(preset)`. The opening cutscene plays once (`flags.cs_cs_opening`)
when play begins after `newGame(seed, {opening: true})`, which the title's NEW
GAME slot flow passes (never a Load, never headless); `?opening=1` plays it on
that boot. The bare `newGame(seed)` (the old title Enter, RESTART, tests) does
not, so the existing title tests keep their chase camera on Enter.

Loading (GDD_EXPANSION §6.1): `GTP.game.loading = {active, fraction, label, stage,
reason}`. `World.generate` is synchronous and reports its stages as
`load:progress` events (the bar's 10..70%); the chunk prebuild around the player
(`Render.prebuild(x, z, 100 m)`, the nine chunks, 70..95%) runs over animation
frames on boot, New Game and Load while the loop renders the HUD only and does
not step; the screen holds 0.3 s at 100% (`warmup`) and `load:done` fires.
Headless is synchronous. `frames` counts rendered game frames only.

## 4. Save format

v3 (GDD_EXPANSION §6.3): `localStorage['gtp.save.v3.slot' + n]`, n 1..3 (the
spelling `gtp.slot.<n>.v3` is read as a fallback) = JSON
`{ version:3, slot, seed, savedAt, playTime, money, subs, x, z, y, yaw, hp, armor, weapon, weapons, ammo, completed, flags, stats, failed, bestTimes, clock, day, radioStation, cameraMode, memos, strands, waypoint, vehicle, summary }`.
`summary = {missions, missionsTotal, lastMission, district, landmark, wanted, money, playTime, savedAt, seed, clock, day}`
is what the slot cards show. Modules add fields through `GTP.SaveHooks`
(`[{name, save(data), load(data)}]`: `strands`, `subs`).

```js
GTP.game.saveSlot(n, {auto, reason, quiet}) -> bool; loadSlot(n) -> bool; deleteSlot(n) -> bool; slots() -> [{slot, empty, corrupt, meta}]
GTP.game.save() (the active slot), load(n?) (the latest slot, else the old v2 save), hasSave(), latestSlot(), activeSlot
GTP.game.autosave(reason) -> bool      // 'mission' after mission:complete (once any act cutscene is over), 'strand' after strand:cycle,
                                       // 'home' on entering the pod van within 40 m of pod_garage; never during a mission, a strand, a cutscene,
                                       // a wanted level or the loading screen; a failed autosave toasts once and disables itself
GTP.game.serialize(slot), applyData(data), migrateLegacySave(), upgradeLegacy(v2), homePoint(), atHome(v)
```

Events: `saved {slot, reason, auto, meta}` (the UI's spinning-table icon / toast),
`save:failed`, `save:deleted`, `save:migrated`, `loaded {slot, meta}`. The old
`gtp.save.v2` is migrated into slot 1 once at boot when slot 1 is empty (play
time 0, the summary rebuilt, `summary.migrated`); the old key is left alone.
Load rebuilds the world from `seed`, restores the player, missions, strands and
the vehicle the player sat in, then runs the loading screen around the new
position. All storage access is in try/catch and reported with a toast.

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
- `tests/perf.js`: the headless boot (page load to playing, `World.generateMs`
  under 4 s on the 224-tile map), a 30 s advance with full AI at steps/s
  (over 600), 12 rendered frames with the chase camera at ms/frame on the low
  preset (SwiftShader numbers are only relative; report them, target no
  regressions), then 5 frames each at low / medium / high through
  `Render.quality.set`. Draw calls must stay under
  540 at low (about 490 now, the counter covering the scene only) and under
  1300 at medium / high (the counter then covers the shadow pass and the post
  passes too, about 1130 now).
- `tests/render.js` also boots a second page on the high preset (`?quality=high&weather=overcast`)
  for the graphics track: six screenshots (downtown noon, the marina at sunset,
  downtown at night in the rain, the Loop at dusk, a car-paint close-up, a ped
  close-up) with the player teleported under the camera so the shadow box and
  the light pools apply, the weather / quality / debug hooks, and the preset
  switches.
- `tests/campaign.js` debugging aids: `CAMPAIGN_FROM=<id>` preps the earlier
  missions complete and starts there; `CAMPAIGN_TO=<id>` stops after that
  mission and skips the campaign-wide assertions. Every point of heat is logged
  per mission with its source, so an accidental crime shows up in the output.

## 6. Performance targets

60 fps at 1080p on an integrated GPU: static geometry merged per chunk (one
draw per material per chunk), props instanced, ~70 peds and ~35 cars each one
Group with shared geometries, shadows limited to a 120 m box, draw distance
260 m with fog, no per-frame allocations in hot loops, textures generated once.
