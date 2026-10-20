# Grand Theft Pundit v0.3: the parallel build plan

This file is the contract for the v0.3 build. Eleven cloud sessions build it at the same time, each
on its own branch, each owning a disjoint set of files. Read it in full before you write code.
`ARCHITECTURE.md` (engine contract), `CONTENT_RULES.md` (binding content rules), `GDD.md` and
`GDD_EXPANSION.md` (existing content) still apply.

## Why v0.3 exists

A player tried v0.2 and said: the graphics should be more life-like; they did not see a story or
missions; the shooting felt bad and they did not see a gun; they want to walk into an armory and buy
a big variety of guns; they want basically every feature of GTA in this parody.

**The bar for v0.3:** a first-time player opens the game and within one minute is in the story;
within ten minutes holds a visible gun, has been inside the armory, and knows how to aim, take
cover and save; the city looks clearly better than v0.2; and the game has the GTA staples listed
below. The protagonist stays the fictional campus pundit Bryce Takesworth. No real person is ever
added (CONTENT_RULES.md rule 1).

## Rules for every session

- **Own only your files** (table below). Never edit another track's file, `ARCHITECTURE.md`,
  `README.md`, `index.html`, `tests/all.js` or `tests/_harness.js`. If you need something from
  another track, code against the interface in this plan with feature detection
  (`if (GTP.X && GTP.X.y) ...`) and keep working; if you need a hook into a file you do not own,
  wrap the `GTP.*` function from your own file at load time and list it in your notes.
- **Write your notes** to `docs/v03/<track>.md`: what you built, every interface you expose or
  consume, every wrapper you installed on another module, test commands, known issues. The
  integration step reads these.
- **Fix the v0.2 QA bugs in your files.** `docs/v03/qa_r1_bugs.json` holds 48 reproduced bugs
  (13 high) from the first v0.2 play-test round, each with a repro and a file hint. Fix every bug
  whose hint points at a file you own, at the root cause, with a test where it is worth guarding.
- **Tests:** `cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/<file>.js`.
  Add a test file for what you build (names in the table). Look at every screenshot you take with
  the Read tool and fix what looks wrong. `tests/all.js` must stay green for your own files; red in
  another track's area is expected until integration and is not yours to fix.
- **Commit and push often** to your branch (`git push -u origin <your branch>`), at least after each
  major milestone, so work survives a container restart. Commit messages end with the session's
  attribution lines. Do not open pull requests; integration merges the branches.
- `GTP.rng` for randomness (Math.random is banned in `js/`). Classic scripts only. Never
  `alert`/`confirm`/`prompt`. `node tests/content_audit.js` stays green.
- You may use subagents or workflows inside your own session if they help.

## Tracks and file ownership

| Track | Branch | Owns | New tests |
|---|---|---|---|
| models | `v03/models` | `js/05d_models.js` (new), `js/06c_animation.js` (new) | `tests/characters.js` |
| environment | `v03/environment` | `js/05_assets.js`, `js/10_render.js`, `js/10b_postfx.js`, `js/01_config.js` | `tests/render.js`, `tests/perf.js` |
| shooting | `v03/shooting` | `js/06_entities.js` (except `Ped.prototype.syncMesh`), `js/08_combat.js`, `js/05b_assets_weapons.js` | `tests/combat.js`, `tests/actors.js`, `tests/cover.js` |
| interiors | `v03/interiors` | `js/13_interiors.js` (new) | `tests/interiors.js` |
| vehicles | `v03/vehicles` | `js/06b_vehicles_air_sea.js` (new), `js/03_audio.js` | `tests/vehicles.js`, `tests/audio.js` |
| story | `v03/story` | `js/09_missions.js`, `js/12_cutscenes.js`, `js/30_game.js` | `tests/missions.js`, `tests/cutscenes.js`, `tests/saves.js`, `tests/campaign.js`, `tests/story.js` |
| bosses | `v03/bosses` | `js/08b_bosses.js` (new) | `tests/bosses.js` |
| world | `v03/world` | `js/04_world.js`, `js/20_content_world.js`, `js/07_ai.js` | `tests/world.js`, `tests/ai.js`, `tests/events.js` |
| systems | `v03/systems` | `js/14_systems.js` (new) | `tests/systems.js` |
| content | `v03/content` | `js/25_content_parity.js` (new); in `js/22_content_missions.js` and `js/24_content_expansion.js` only the `requires` arrays (see "Story chain") | `tests/content_parity.js` |
| ui | `v03/ui` | `js/11_ui.js`, `js/02_input.js` | `tests/ui.js` |

`index.html` already loads every new file in this order (stubs exist):
`05_assets, 05b_assets_weapons, 05d_models, 06_entities, 06b_vehicles_air_sea, 06c_animation,
07_ai, 08_combat, 08b_bosses, 09_missions, 10_render, 10b_postfx, 11_ui, 12_cutscenes,
13_interiors, 14_systems, 20..24 content, 25_content_parity, 30_game`.

## What each track builds

### models (characters and vehicles that look real)
- Override `GTP.Assets.pedParts(look)` from `05d_models.js` with smooth humanoids: lathed and capsule
  geometry with correct proportions (head 1/7.5 of height), a 16-bone hierarchy (hips, spine,
  chest, neck, head, upper/lower arm and hand L/R, upper/lower leg and foot L/R), procedural face
  textures (eyes with whites and irises, brows, nose and mouth shading, skin tone from `look.skin`),
  hair meshes per `look.hair`, clothing meshes from `look.outfit` (top, bottom, shoes, hat, glasses;
  ids from `GTP.Content.parity.clothing`, fall back to the existing look colours), 3 LODs. Keep the
  existing named pivots (`legL, legR, armL, armR, torso, head`) as aliases so old code still works.
- Override `GTP.Assets.vehicleGeometry(cls, wrap, mods)` with smooth bodies from extruded side
  profiles with bevels, separate glass, chrome trim, rims with spokes and tyre sidewalls, headlight
  housings with lenses, interior silhouettes, number plates; honour `mods` (below). All nine car
  classes. Air, sea and motorcycle meshes belong to the vehicles track.
- `06c_animation.js` replaces `GTP.Ped.prototype.syncMesh` with a procedural animation system
  (`GTP.Anim`): idle with breathing, walk, run, sprint, crouch-in-cover, aim (upper body follows
  `pose.aimPitch`), fire recoil, reload, melee swings, drive and ride poses, swim, fall, knockdown and
  ragdoll blend, weapon hold (one-handed and two-handed grips). Read the current `syncMesh` first and
  keep every behaviour it has (hit flash, corpse fade, distance cull, knockdown tilt).
- **Pose contract** (set by the shooting track on every `GTP.Ped`, read by you):
  `ped.pose = { aim:bool, aimPitch:rad, aimYaw:rad, fire:secondsSinceShot, reload:0..1|null,
  melee:{type:'light'|'heavy'|'counter', t:0..1}|null, cover:{side:'left'|'right', high:bool,
  peek:bool, blind:bool}|null, hold:'none'|'one'|'two', weaponId, drive:bool, ride:bool,
  swim:bool, fall:bool, ragdoll:{vx,vy,vz,spin}|null }`. Treat missing fields as defaults.

### environment (the city looks modern)
- Buildings: interior-mapped windows (fake rooms in the fragment shader), cornices, ledges, fire
  escapes, AC units, varied storefronts with awnings and signage, rooftop detail; road wear,
  manhole covers, painted kerbs; instanced grass in parks; better tree canopies; an ocean shader with
  waves, foam at shores and Fresnel sky reflection; two shadow cascades; light probes or per-district
  hemisphere tints; better night (light pools, neon reflections on wet roads); TAA or improved
  anti-aliasing; depth of field in cutscenes; optional motion blur at speed. Quality presets keep
  their names; Medium must hold 60 fps on integrated graphics.
- Expose `GTP.Render.rebuildEntityMesh(entity)` (drop and rebuild an entity's mesh, used after a
  vehicle mod or an outfit change) and honour `GTP.Assets.vehicleMeshes[type](vehicle)` when it
  exists (the vehicles track registers meshes for its new types there).

### shooting (GTA V feel, a visible gun, cover)
- Over-the-shoulder aim on hold (right mouse / left trigger) with the gun visible in both hands, a
  dot crosshair that expands with bloom, aim-assist toggle, hip fire, per-gun recoil patterns, ADS
  zoom per class; holstered weapons visible on the body (pistol on the hip, long guns on the back);
  impact decals per surface; hit reactions; melee light/heavy/counter combos; headshot feedback.
- Cover: input action `cover` (Q near a wall, car or low object): snap, peek-and-fire, blind fire,
  move along cover, vault low cover; AI that flanks a player in cover (call `GTP.AI.coverAlert`
  when it exists).
- Arsenal: load weapons from `GTP.Content.parity.weapons` (32+, schema below) merged over the
  existing 12; attachments and tints per weapon in `player.weaponMods[id] = {muzzle, mag, optic,
  grip, light, tint}` applied to stats and meshes; every gun has a mesh in `05b` with correct grip.
- Shop API used by the armory interior and the UI:
  `GTP.Combat.catalog(storeId) -> [{id, kind:'weapon'|'ammo'|'attachment'|'tint'|'gear', weaponId,
  name, price, owned, equipped, locked, lockReason, stats:{damage, rate, range, accuracy, mobility}}]`
  and `GTP.Combat.buy(itemId, opts) -> {ok, reason}`. Fix the v0.2 bug where buying ammo grants the
  weapon.
- Set `ped.pose` (above) for every ped every step.

### interiors (walk into the armory)
- `GTP.Interiors = { enter(id, opts), exit(), active, current }`; emits `interior:fade`
  `{phase:'out'|'in'}`, `interior:enter {id, kind, store}`, `interior:exit {id}`. Rooms are built
  from primitives at a far location (for example x = -4000) and the player is teleported in and back
  out to the door. Wrap `GTP.World.heightAt`, `solidAt` and `resolveCapsule` from your file so
  collision inside an active interior uses the room's own floor and walls.
- Templates: **armory** (Both Sides Arms: gun racks on the walls holding real weapon meshes from
  `GTP.Assets.weaponMesh(id)`, glass counters, Merle behind the counter, a browse mode where looking
  at a rack item and pressing action emits `armory:inspect {weaponId}` for the UI card, and a back
  room **shooting range** with pop-up and moving targets, a 60 s timer and bronze/silver/gold medals,
  emitting `range:start`, `range:hit`, `range:end {score, medal}`); **clothing** (Lanyard & Co.:
  racks, mirrors, a changing booth; emits `clothing:open`); **barber**; **safehouse** (bed to save,
  wardrobe). Same armory template at all three Both Sides Arms branches with branch decor. Entering
  is walking into the shop door marker; the door markers are placed by the world track.

### vehicles (everything that moves)
- New types registered from `06b`: `moto` (lean, wheelies, rider can fall off), `heli` (collective,
  cyclic, yaw, rotor spin-up, crash on contact), `plane` (prop) and `jet` (takeoff from the airport
  runway, flight model, landing), `speedboat` and `jetski` (buoyancy, planing, wake), plus a
  **parachute** when bailing from aircraft above 30 m. Meshes in your file, registered in
  `GTP.Assets.vehicleMeshes[type]`. Each new vehicle exposes `vehicle.hud() -> {speed, alt, pitch,
  roll, heading, throttle, gear}` for the UI. `drive_to` objectives must work with them.
- Mod shop mechanics (Spin Doctor Customs, a drive-in marker): `GTP.Vehicles.mod(vehicle,
  {paint:{primary, secondary, finish:'gloss'|'metallic'|'matte'|'chrome'}, wheels:0..5, spoiler:0..3,
  tint:0..3, engine:0..4, brakes:0..3, armor:0..5, turbo:bool, horn})` sets `vehicle.mods` and
  stats, then calls `GTP.Render.rebuildEntityMesh(vehicle)`. Garage storage for safehouses:
  `GTP.Vehicles.store(propertyId, vehicle)` / `retrieve(propertyId, slot)`; register save state in
  `GTP.SaveRegistry` (below).
- Audio (`03_audio.js`): distinct reports per weapon class and suppressed shots, reloads, cover
  thuds, melee hits, motorcycle, helicopter rotor, prop and jet engines, boat engines, parachute,
  phone ring and call blips, chapter sting, boss stingers, special-attack sounds, shop and mod-shop
  UI sounds, golf swing and putt, achievement chime. Wire them to the events listed in this plan.

### story (you cannot miss it)
- New Game → loading → opening cutscene → **the first mission starts automatically** with its
  objective on screen. `GTP.Story = { next() -> {missionId, giver, landmark, x, z} | null, chapter }`.
  After each story mission: set the GPS to the next story mission (`GTP.Events.emit('gps:set', {x, z,
  label, kind:'story'})`, using `GTP.World.route` when it exists), and the next giver **phones the
  player** (`emit('phone:call', {from, lines})` with lines from `GTP.Content.parity.calls[missionId]`).
  Chapter cards on act changes (`emit('chapter', {act, title})`). Mission markers visible from 200 m.
- `GTP.Missions.registerObjectiveType(name, {start, check, cleanup})` so other tracks add types.
  Add types `interior` (`{interior:'armory'|...}` completes on `interior:enter`), `buy`
  (`{item}` completes on `shop:buy`), `range` (`{medal:'bronze'|...}` completes on `range:end`),
  `heist_board` (completes on `heist:plan`).
- The heist runtime (three missions; the planning board choice from the UI arrives as
  `heist:plan {approach, crew:[castIds]}` and changes spawns and payout).
- `GTP.SaveRegistry` (an object other files fill with `key: {get() -> json, set(json)}`): include
  every entry in saves; save format v4 with migration from v3. Fix the v0.2 story bugs in your files.

### bosses (set pieces and specials)
- `GTP.Bosses.spawn(id, opts)` and six boss encounters against the existing invented villains, each
  with phases, telegraphs and a mechanic beyond damage: `b01_goldplate` (gold helicopter: shoot the
  ribbon spools to ground it), `b02_velvetine` (the silent yacht: wreck the speakers to expose the
  Baron), `b03_warbanner` (dodge the jet flyover, wreck the scooters), `b04_redacted` (pop the giant
  weather balloon phase by phase while vans circle), `b05_dunk` (a table-to-table brawl: counter his
  cards), `b06_panel` (final arena alternating debate rounds and combat waves). Bosses are defeated,
  humiliated and ratio'd, never killed on screen. Register objective type `boss` (`{bossId}`) through
  `GTP.Missions.registerObjectiveType` (feature-detect; fall back to wrapping the missions update).
  Boss dialogue and barks live in your file as data. Emit `boss:phase {id, phase, hp, maxHp, name}`
  and `boss:defeated {id}` for the UI.
- `GTP.Specials`: four specials with meters (`focus` slow-motion aim, `shout` area stun, `chatmob`
  ally call, `boost` vehicle nitro), unlocked by story flags, triggered by input action `special`
  (Focus while aiming, Boost in a vehicle, a hold for Chat Mob, a tap for Shout). Emit
  `special:state {id, meter, active}` every change.

### world (more city, smarter streets)
- New landmarks with door markers: Spin Doctor Customs (2 mod shops, drive-in), Lanyard & Co.
  (clothing, 2), Clip Joint barber (1), four safehouses with garages (`safe_dorm` exists as the
  podcast van; add `safe_brownstone`, `safe_marina_loft`, `safe_suburb`, `safe_penthouse`), helipads
  (airport, Goldplate Tower roof access by ramp is not needed: put helipads at ground level), the
  airport hangar where the plane and jet spawn, marina and port boat slips, the 9 golf holes at
  Goldplate Links (tee and pin points). Door markers of shops call `GTP.Interiors.enter` when it
  exists.
- `GTP.World.route(ax, az, bx, bz) -> [{x, z}]` on roads for the GPS line.
- AI: random street events (8, data from `GTP.Content.parity.events`), traffic with motorcycles,
  peds that cower when aimed at, cops that flank a player in cover (`GTP.AI.coverAlert(x, z)`),
  pause the spawner while `GTP.Interiors.active`. Fix the v0.2 AI and race bugs in your files.

### systems (the rest of GTA)
- `14_systems.js`: properties (buy, income per game day, safehouse save points), the stock market
  (8 invented tickers reacting to mission completions; buy/sell; `GTP.Systems.stocks`), golf at
  Goldplate Links (9 holes, aim, power meter, wind, scoring; the UI draws, you simulate),
  achievements (`GTP.Systems.unlock(id)` emits `achievement {id, name}`, 25 of them), a stats page
  model, cheat codes typed on the keyboard (6 harmless and funny ones, your own keydown listener),
  two job strands (Damage Control, a paramedic parody; Hot Take Brigade, a firefighter parody), the
  clothing and barber purchase logic (applies `player.look.outfit` / `hair`, then
  `GTP.Render.rebuildEntityMesh(player)`), and save entries in `GTP.SaveRegistry`.

### content (every table, original and funny)
- `GTP.Content.parity = { weapons, attachments, tints, missions, calls, chapters, modshop, clothing,
  barber, properties, stocks, golf, events, jobs, achievements, cheats, loadingTips, radio }`.
  Weapon schema: `{id, name, class, dmg, rate, mag, reserve, reload, spread, bloom:{add,max,decay},
  recoil, range, projectile:'hitscan'|'lobbed'|'rocket', hold:'one'|'two', price, unlock:{mission}
  |null, attachments:[slotIds], flavor}`; at least 32 weapons including the existing 12 ids.
- New story missions in the existing mission schema with full dialogue: `m01c_both_sides` (Merle
  gives a free pistol, the range, how buying works: objectives `goto` the armory door, `interior`,
  `range` bronze, `buy` a starter ammo box), the six boss missions (`objectives:[{type:'boss',
  bossId}]` plus approach objectives), the three heist missions (`h01_casing`, `h02_prep`,
  `h03_job`). Phone calls for every story mission, chapter titles.

### ui (every screen)
- Phone calls, GPS line on the minimap and an on-screen route hint, chapter cards, the Story tab in
  pause, long-range marker labels, the armory UI (browse, weapon card on `armory:inspect`, stats,
  attachments, tints, buy through `GTP.Combat.buy`, range HUD and medals), mod shop UI, clothing and
  barber UI with a camera on the player, property purchase, the heist planning board (emits
  `heist:plan`), golf HUD, cover and aim prompts, the new crosshair states, vehicle HUDs from
  `vehicle.hud()`, parachute prompt, boss bar (`boss:phase`), special meters (`special:state`),
  achievement toasts, stock app, stats. New input actions in `02_input.js`: `cover` (Q / B button),
  `special` (Shift+right mouse / L3), aircraft controls (W/S pitch, A/D roll, Q/E yaw with Shift and
  Ctrl for collective or throttle), boat controls reuse car controls. Phone width keeps working.

## Story chain after v0.3 (35 missions)

The content track rewrites only these `requires` arrays:

| New mission | Requires | And this existing mission now requires it |
|---|---|---|
| `m01c_both_sides` | `m01_van` | `m01b_airport` |
| `b01_goldplate` | `m06_rally` | `m07_listen` |
| `b02_velvetine` | `m07b_ferry` | `m08_scooters` |
| `b03_warbanner` | `m08b_jets` | `m09_balloon` |
| `b04_redacted` | `m09b_hotmic` | `m10_pellets` |
| `h01_casing` → `h02_prep` → `h03_job` | `m12b_scope` | `m13_thursday` requires `h03_job` |
| `b05_dunk` | `m13_thursday` | `m13b_ratio` |
| `b06_panel` | `m13b_ratio` | `m14_grift` |

## Events (one table, so nobody guesses)

`gps:set {x, z, label, kind}`, `gps:clear`, `phone:call {from, lines}`, `chapter {act, title}`,
`interior:fade {phase}`, `interior:enter {id, kind, store}`, `interior:exit {id}`,
`armory:inspect {weaponId}`, `range:start`, `range:hit {points}`, `range:end {score, medal}`,
`shop:buy {item, price}` (exists), `clothing:open`, `barber:open`, `modshop:open {vehicle}`,
`property:open {id}`, `heist:board {missionId}`, `heist:plan {approach, crew}`,
`boss:phase {id, phase, hp, maxHp, name}`, `boss:defeated {id}`, `special:state {id, meter, active}`,
`achievement {id, name}`, `golf:start`, `golf:shot {power, angle}`, `golf:end {strokes, par}`,
`vehicle:enter {vehicle}` and `vehicle:exit {vehicle}` (exist or add), `cover:enter`, `cover:exit`,
`hitmarker {kill, zone}` (exists).

## After the tracks

Integration merges the eleven branches into `game/grand-theft-pundit`, folds every wrapper into its
proper module, updates `ARCHITECTURE.md` and `README.md`, runs `tests/all.js`, plays the new-player
flow end to end, and then the play-test loop starts.
