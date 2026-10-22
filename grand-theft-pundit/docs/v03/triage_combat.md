# v0.3 integration round 1: combat area (shooting + models + interiors)

Branch `v03r1/combat` from `game/grand-theft-pundit` @ 10ba585. Owner files: `js/06_entities.js`, `js/08_combat.js`,
`js/05b_assets_weapons.js`, `js/05d_models.js`, `js/06c_animation.js`, `js/13_interiors.js`, and `tests/combat.js`,
`actors.js`, `cover.js`, `characters.js`, `interiors.js`. Nothing outside these files was edited; what other areas need is
written below as precise proposals.

<!-- sections below are filled in as the work lands -->

## 1. One arsenal (shooting x content)

The shooting track's 25 fallback additions and the content track's 25 parity weapons overlapped: the merged table had 57
entries with two miniguns (`spin` / `minigun`), two "The Filibuster"s (`filibuster` pistol / `lmg`), `battlerifle` and
`battle_rifle`, `autoshotgun` and `auto_shotgun`, and so on. The parity table is the content of record (missions grant its ids),
so:

- `08_combat.js` `LEGACY` maps 11 parity ids to the fallback entry that duplicates them (`selfie_stick: selfie`,
  `heavy_pistol: filibuster`, `machine_pistol: threadpistol`, `pdw: liveblog`, `battle_rifle: battlerifle`,
  `both_barrels: doublebarrel`, `auto_shotgun: autoshotgun`, `heavy_sniper: heavysniper`, `sticky: stickynote`,
  `spin_smoke: smoke`, `minigun: spin`). When the parity table loads, the parity entry takes the fallback's engine-only fields
  as its base and the fallback id leaves the table; a legacy id still in a pocket (`player.weapons`, `ammo`, `weaponMods`) is
  migrated. Without the parity table the fallback table works as before.
- `normalize()` now copies the parity rows' engine fields (it dropped them): `spinUp`, `stun`, `fuse`, `blast`, `ring`,
  `cook`, `splash`, `burn`, `scope`, `scopedSpread`, `headMul`, `mobility`, `zoom` ...; `sticks` -> `stick`, `remote` -> a 3 s
  fuse, `smokeSeconds` -> `smoke`; a `heavy` rifle is a machine gun, a `heavy` special keeps its base class (the minigun stays
  in the Heavy slot); a lobbed thing that only shoves (the merch cannon) knocks over what it lands on instead of exploding.
  `w.mobility` overrides the class mobility.
- Result: 47 weapons, every `GTP.Content.parity.weapons` id present, no duplicates (checked in the browser).
- Stun weapons (`flare_gun`, `flashbang`, `merch_cannon`, hitscan `mute_button`) use their own radius, text and effect (a
  pink flare, a white flash, a puff of shirts) instead of the Hot Take's fire burst.
- `05b_assets_weapons.js`: meshes for the ten parity weapons that had none (`clipboard`, `golf_club`, `mic_stand`, `pocket`,
  `micro_smg`, `flare_gun`, `flashbang`, `grenade_launcher`, `merch_cannon`, `mute_button`); the 11 aliased ids draw the
  fallback's mesh (`ALIAS`, `GTP.Assets.weaponAlias`). Before, an id without a builder got a random builder of its class.
- Vertex colours were authored in sRGB and stored as if linear: every gun rendered washed-out grey (gunmetal `#26272c` showed
  as about `#6b6b6b`). `c()` now converts sRGB to linear like the models and interiors files; the tint matcher compares the
  exact linear values.
- The wheel's slot 2 is "Specials" (megaphone, flare gun, mute button, merch cannon); an unowned slot shows one of the original
  twelve first (the `combat.js` wheel failure: the rifle slot showed `carbine`).
- The shop: the v0.2 expansion rows (`Content.expansion.shop.items`) overwrote the parity weapon rows' unlock, so the pistol
  said "unlocks after m03b" while its ammo said m01c. A parity weapon now keeps its own unlock, name and price.

## 2. The failing tests in my files (combined build, 10ba585)

| Test | Failure | Root cause | Fix |
|---|---|---|---|
| `combat.js` wheel | the unowned rifle segment showed `carbine` | a slot with nothing owned showed its cheapest weapon (a parity addition) | an unowned slot shows its original-twelve weapon first |
| `combat.js` scope (failed before the wheel on the baseline) | a scoped 40 m shot did 0 damage | the world track's map moved the test arena: the 40 m target stood in the bay below a shoreline that really blocks the shot; the sight said "hit" because `trace()` sampled the ground only at the ray's end | the test picks a dry 44 m strip; `trace()` now marches the ground along the ray, so the sight and the bullet agree |
| `combat.js` shop | the pistol locked after m03b | the v0.2 expansion rows overwrote the parity unlock (m01c) | parity rows keep their unlock; the test completes m01c (the v0.3 chain) |
| `combat.js` arsenal (after my stun fx changed the RNG draws) | the SMG missed 5 of 5 hip shots at 8 m | the hip cone around the assist's own target was 3.7 degrees: a 20 % chance to miss all five | hip fire at the assist's target uses a near-aimed cone (the "shooting felt bad" complaint) |
| `characters.js` rifle | `gripY 2.75`, left hand 1.41 m off the barrel | Anim re-parents the gun into `handR`; `Combat.postSync` then wrote a root-space transform into the bone's frame. Every held gun on the new models sat 1-1.6 m off the hand (the floating pistol over the car in `cover_peek.png`, the empty hands in `combat_held_*.png`) | on a models rig Anim is the gun's only writer; Combat reads the hand targets back from the drawn gun; `placeWorld` writes into the real parent's space |
| (follow-up) | the shot left 0.14-0.28 m from the drawn barrel | `gunFrame` was tuned for the v0.2 fists (scale 1.2/1.46) | on a models rig `gunFrame` uses Anim's chest-frame grip at scale 1 |
| (screenshots) | a rifle's stock poked out through the back of the shirt while aiming | Anim held the grip 0.22 m ahead of the spine; the stock reaches 0.32 m behind the grip | the aimed grip sits 0.32 m ahead (Anim and `gunFrame`), the foregrip reach shortened so the left arm still gets there |
| `interiors.js` racks | 52 items, 45 weapons, 12 missing | the armory filled fixed slot counts sized for the v0.2 stock | the whole arsenal once each, grouped by class (east wall long guns by row: rifles, shotguns, snipers, machine guns; the feature wall behind Merle: heavy and specials; the west pegboard: melee; the glass counter: every handgun; the island cases: thrown); anything beyond capacity spills to a spare row and the cases and is reported |
| `interiors.js` browse / counter / clothing / save | the in-world buy prompt, `shop:open`, the outfit fallback and the v3 save key | the UI armory card, the UI wardrobe and save format v4 exist in the combined build; the counter called `UI.openArmory({...})` but the UI's signature is `openArmory(storeId, weaponId)` | the counter calls `UI.openArmory(storeId)` and still emits `shop:open {landmark}`; the tests drive the UI card / wardrobe when present and read the v4 key |
| `actors.js` crash | `crash damage: 0` | the test's `vehicle:impact` listener took a traffic sedan's lamp-post bump 155 m away (see `07_ai.js` in section 5) | the listener takes this car's impact; sparks are counted near the car |
| `bosses.js` (bosses team's file) | Goldplate never past phase 1 | spools take every shot (verified: 45 hits, 15 breaks in 90 s); a hard lock on a spool pulls the rig to the pitch limit and when the last spool broke nothing gave the pitch back, so every shot at Goldplate went into the sky | a hard lock (kind `heli`) that goes down hands over like a fresh aim press; a `heli`-kind hit sphere is the entity's own size. b01 now reaches phase 3; the rest is the bot (section 5) |

## 3. The new-player steps (tests/newplayer.js, story team's file)

The four steps pass on this tree (a diagnosis run, seed 7); the "missing" list came from a run where the page closed during m01c
and the test threw at line 637. They were fragile, and two real defects sat under them:

- **The m01c start light and the armory door race on the same spot.** The door marker (1.4 m) fired at 0.25 s, the mission
  started at 0.48 s mid-fade, the player was teleported into the room, and m01c's first objective ("walk up to the Both Sides
  Arms door", 5 m) could never be reached: no free pistol. `13_interiors.js`: `enter()` refuses while a mission intro is playing
  or while the player stands in a mission's start light; the mission's own `interior` objective walks the player in from the
  doorstep (`mission:objective` listener). Verified by the diagnosis in the page: pistol handed over 1.4 s after the light.
- **The aim camera indoors / at a wall (QA-A-CAM-01)** put the camera 7.4 m in front of the player at floor height (the render
  guard casts from the look-at point 8 m ahead). `08_combat.js` `aimGuard` keeps the aim camera on the shoulder line, pulled in
  to the first wall. Measured: 1.55 m behind in the armory and facing a wall 3 m away.
- `Interiors.range.targets` / `Interiors.range.booth` (world x, z) are exposed for the story's `range` objective (it has no
  target point, so no GPS arrow) and for the test's target lookup.

## 4. Wrappers folded

- `08b_bosses.js` wrapped `Combat.update` (Bosses / Specials tick) and `13_interiors.js` wrapped `Combat.update` and
  `Combat.fire`. Combat now runs `Bosses.update`, `Specials.update` and `Interiors.update` after its own step (same order as the
  wrapper chain, every state) and `Combat.fire` asks `Interiors.canFire` / calls `Interiors.onPlayerShot`. The functions carry
  `_bosses` / `_interiors` marks, so both installers stand down (bosses: `CB.update._bosses`; interiors: `CB.fire._interiors`).
  The bosses team can delete `wrapCombat` in `08b_bosses.js` (it is now a no-op).
- Not folded (the receiving module is not mine), proposals:
  - `14_systems.js` wraps `Player.prototype.control` to freeze the player during golf. Expose `GTP.Systems.golf.active()`
    (a boolean, no allocation) and `06_entities.js` will check it at the top of `control()`; then the wrapper can go.
  - `06b_vehicles_air_sea.js` wraps `GTP.Assets.vehicleGeometry` (05d's override) with stub records for its own types: fine as
    it is; 05d falls back to the v0.2 builder only for unknown car classes.
  - `08_combat.js` wraps `Render.rig.update` (the per-class ADS fov and the shoulder rig, plus the aim guard above) and creates
    `Render.muzzleLight` on its first update; `05d_models.js` wraps `Render.detach` / `attach` (look ref counting). The
    environment team may fold these into `10_render.js` (`rig.update` reading `GTP.Combat.aimRig()`, the muzzle light in scene
    setup, a release hook in `detach`).

## 5. What other areas need (precise proposals; not edited here)

- **`js/07_ai.js` (world)**, traffic swerve survives a lane change: car 254 was blocked mid-turn, `swerve = +3.2` was set for axis
  v / dir +1 (line ~1098), then `adoptLane` (line ~958) moved it to axis h / dir +1 and kept the swerve, steering it 1.2 m past
  the road edge onto the pavement into a lamp. Patch: `ai.swerve = 0; ai.swerveT = 0;` in `adoptLane` and at turn completion
  (~1172); optionally no new swerve while `ai.plan && ai.plan.turning`.
- **`tests/bosses.js` (bosses)**: with the combat hand-over above, b01 reaches phases 1-2-3 but the bot runs out of time:
  line 76 reads `tg.kind`, always undefined (`EP.target()` returns `{x, y, z, entity}`: use `tg.kind || (tg.entity &&
  tg.entity.kind)`); line 46 should take a gunman add within ~26 m first and close to 4 m on brawlers instead of kiting them
  60-80 m out of the arena. With both changes the diagnosis completed b01 in 254 s of 360 (patch:
  `diag_bosses_bot.patch` in this session's scratchpad). Note: the coordinator says the bosses session owns the lock-on and
  weak-point work; the two Combat changes involved are small and self-contained (`aim.hop` in `updateAim`, the `heli`
  hit sphere `e.hitRadius || e.radius + 0.4` in `trace`) and can be adjusted there on request.
- **`js/10_render.js` (environment)**: the aim guard casts from the look-at point (QA-A-CAM-01); cast from the shoulder while
  aiming (`ox = aiming ? t.x : fx`, `oy = aiming ? t.y + 1.5 : fy`, ...; min distance 0.4). `Combat`'s `aimGuard` covers it until
  then and becomes a no-op once the render guard is right.
- **`js/30_game.js` (story)**: `_loop` drops the step backlog after `C.MAX_STEPS` (line ~450), so under SwiftShader at 1-2 fps
  the simulation runs at about 0.1 s per real second. That is what made F look broken in the coordinator's real-keyboard run:
  the press registered (`entering: true`) and the 0.4 s door walk took 4.5 s of wall time. On real GPUs this is fine; a
  "slow-motion" notice or a higher step cap for software GL would make test runs less confusing.
- **`tests/newplayer.js` (story)**: lines 628-637: `const owned = gun.owned || [], vis = gun.vis || { ok: false, why: gun.why }`
  so a page error is a FAIL line instead of a throw that skips armory / pistol / aim / cover; read the range targets from
  `GTP.Interiors.range.targets` (now exposed).
- **`js/09_missions.js` (story)**: the `range` objective has no target point; use `GTP.Interiors.range.booth` when inside, else the
  store's door, so the GPS and the arrow lead to the line.
- **Armory branches from the world's doors (fixed in `13_interiors.js`)**: the AI door passes `branch` = the landmark id
  (`07_ai.js` ~1977), so `buildArmory` looked up `BRANCHES['both_sides_port']`, missed, and the Port and Uptown stores got the
  Strip's decor. `resolveTarget` now maps a landmark-id branch to strip / port / uptown.

## 6. QA bugs pointing at my files (re-verified on this branch)

Status: **fixed** (fixed here, with the guarding test), **already-fixed** (fixed by the v0.3 tracks, guarded), **not-ours**
(re-verified, the cause is in another area's file: proposal given), **wontfix** (with the reason).

### qa_r1_bugs.json (v0.2 round 1)

| id | status | guard |
|---|---|---|
| QA-STR-08 discount counted twice | already-fixed (shooting track) | `tests/combat.js` §20 |
| QA-STR-09 / CMB-02 ammo grants the weapon | already-fixed | `combat.js` §20 (refused `notOwned`); the armory only offers ammo for an owned gun |
| QA-STR-14 megaphone / hot take give too little | already-fixed | `combat.js` §20 |
| QA-STR-15 rampage_king cap (Combat part) | already-fixed | `combat.js` §20 |
| QA-C1-01 AI melee at full rate | already-fixed (wind-up, cooldown, two attackers) | `combat.js` §21 |
| CMB-01 rocket direct hit not a ratio | already-fixed | `combat.js` §21 |
| CMB-03 hot mic ignores its rate | already-fixed | `combat.js` §21 |
| CMB-04 first shot hitch (muzzle light) | already-fixed (created at intensity 0 on the first update) | `combat.js` §21 |
| CMB-05 the lock steals the shot | already-fixed | `combat.js` §21 |
| CMB-08 pickups switch weapon / ignore cap | already-fixed | `combat.js` §21 |
| CMB-11 blast kills give no marker / stat | already-fixed | `combat.js` §21 |
| CMB-12 (Combat half) re-cook in a car | already-fixed; the fuse HUD outside aim is the UI's | `combat.js` §21 |
| CMB-14 head shots / pellet hits | already-fixed | `combat.js` §21 |
| CMB-15 shotgun too weak | already-fixed (the parity table's 66 per volley still floors a 60 hp ped at 4 m) | `combat.js` §21 |
| CMB-16 table leg | already-fixed | `combat.js` §21 |
| CMB-06 / 07 / 09 / 10 / 13 | not-ours (30_game, render, AI heli gunner, missions) | |

### qa_a / qa_b / qa_c / qa_d (v0.3 QA rounds)

| id | status | evidence / fix |
|---|---|---|
| QA-A-DRV-01 exiting on the Loop viaduct drops the player into the sea | **fixed** (`06_entities.js` `Vehicle.exit`: swim only when the surface found is the sea) | `tests/regress/qa_a_drv_01.js` |
| QA-A-DRV-02 exiting at a deck barrier drops to the street | **fixed** (`doorSpot` skips a door point whose surface is over 1 m below the car's: the passenger side) | `qa_a_drv_02.js` |
| QA-A-DRV-08 cars drive up a stunt wedge's 1.3 m face | **fixed** (`_stepWall`: a wheel rising more than 0.5 m in one step is a wall: back, bounce, impact damage; slopes, the Loop ramps and the wedge's low end are unchanged). Left: the bumper sinks ~0.6 m into the face until `04_world.js` `resolveCapsule` knows wedges (world) | `qa_a_drv_08.js` |
| QA-A-ENT-04 skid marks float / bury on ramps | **fixed** (the rear wheel's surface height). Left: the decal is flat, its ends sit ~0.1 m off on a ramp (`10_render.js` `_placeDecal` could tilt it) | `qa_a_ent_04.js` |
| QA-A-ENT-10 first-person headlight stays behind | **fixed** (the hidden first-person car still places its headlight) | `qa_a_ent_10.js` |
| QA-B-TCH-07 Tab in the shop opens an invisible wheel | **fixed** (`updateWheel`: no wheel without control or behind the shop page; an open one closes without equipping) | `qa_b_tch_07.js` |
| QA-A-CAM-01 aiming at a near wall throws the camera into the building | **fixed** (`aimGuard`, section 3) | `qa_a_cam_01.js` passes |
| QA-A-CAM-08 peds / cars culled before the fog | not-ours: `01_config.js` QUALITY `pedDraw` / `vehicleDraw` sit inside the fog's clear zone (fog 120..260 m). Set both to `fogStart + 0.85 * (drawDistance - fogStart)` (~239 m on medium), recompute in `11_ui.js` applySetting, and raise the AI `ACTIVE_RADIUS` (220) to at least that or the despawn becomes the pop. `06_entities.js` `tooFar()` reads the config and needs no change | `qa_a_cam_08.js` fails |
| QA-A-CAM-02 / 03 / 05 / 06 / 07 | not-ours (`10_render.js` rig and chunks): first-person near plane vs walls; `rig.apply` ignores the frame alpha; the pull-in ignores big solid props; a pulled-in boom ends on a bus roof (the regress script's raycaster needs `rc.layers.enableAll()`: vehicles are on layer 1, so it passes falsely); no chunk prebuild after a teleport | scripts fail (CAM-06 by bounding box) |
| QA-A-CAM-04 bike first-person eye too low | not-ours (`05_assets.js` `lightPoints.eye` for the bike: saddle height + the rider's eye) | `qa_a_cam_04.js` fails |
| QA-B-FE-03 / pers-QA-SAVE-03 Enter / Space that confirm also act in the game | not-ours (`11_ui.js`): `Player.control` only reads `pressed('enter')` / `pressed('jump')`; the UI latches `shoot` / `action` after it consumes a confirm, but not `enter` / `jump`. Add `'enter', 'jump'` to the `Input.latch` lists at the dialogue advance (~3107, ~3117) and in `onState` into playing (~3213): verified in a scratch copy (RESUME, LOAD and CONTINUE keep the player in the car, Space no longer jumps). The regress scripts need `GTP.Cutscenes.skip()` after `T_.newGame()` (New Game now plays `cs_opening`) | probe |
| QA-B-FE-04 Backspace / Esc reverse the car | not-ours (`02_input.js` line ~63: drop `'back'` from Escape and Backspace; menus use `cancel`; `12_cutscenes.js` ~432 should skip a shot on `cancel` too): verified in a scratch copy, 0 m moved | probe |
