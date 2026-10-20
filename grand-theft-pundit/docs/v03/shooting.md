# v0.3 shooting track (`v03/shooting`)

Owner files: `js/08_combat.js`, `js/05b_assets_weapons.js`, `js/06_entities.js` (everything except `Ped.prototype.syncMesh`).
Tests: `tests/combat.js`, `tests/cover.js`, `tests/actors.js` (unchanged, still green).

The player's complaint was "the shooting felt bad and I did not see a gun". This track answers it with a gun that is
always visible in the hands (two-handed for long guns and for aimed pistols), a GTA V style shoulder camera while aiming,
an aim assist that snaps but never steals a shot, recoil patterns, hit markers, holstered weapons on the body, a cover
system, melee combos and a 37-weapon arsenal with attachments and tints.

## What was built

### Arsenal (`08_combat.js`, `05b_assets_weapons.js`)
- **37 weapons**: the twelve of GDD_EXPANSION §2 (ids, names and numbers kept, except the QA retunes below) and 25
  parody additions: `knuckles` Brass Talking Points, `selfie` Selfie Stick, `gavel` The Gavel of Order, `bat` The Closing
  Argument, `oped` Op-Ed Compact, `filibuster` The Filibuster, `pocketsmg` Pocket Pundit, `threadpistol` Thread Pistol,
  `liveblog` The Live Blogger, `combatmg` Comment Section, `lmg` The Endless Segment, `carbine` The Panel, `bullpup` Bullet
  Points, `battlerifle` The Long Read, `sawnoff` Sawed-Off Soundbite, `doublebarrel` The Both-Sider, `autoshotgun` Town Hall,
  `marksman` The Peer Reviewer, `heavysniper` The Long Form, `smoke` Smoke & Mirrors, `coffee` Scalding Latte,
  `stickynote` Sticky Note, `confetti` Confetti Cannon, `firework` Viral Loop, `spin` The Spin Machine (minigun with spin-up).
  Each has an unlock mission from the existing chain, a price and one of Merle's lines.
- **Parity merge**: `syncArsenal()` (run every `Combat.update`, cheap when unchanged) merges `GTP.Content.parity.weapons`
  (array or id-keyed object) over the table by id. Known ids keep their engine-only fields (cook, rocket, cone, pellets,
  drive-by...) and take the content numbers; new ids are normalised (class aliases `handgun heavy_pistol machinepistol mg
  assault marksman heavy explosive grenade ...`, `projectile: hitscan|lobbed|rocket`, `unlock.mission`, `flavor` -> pitch,
  `attachments` -> the allowed slots). ORDER is rebuilt grouped by wheel slot and price.
- **Meshes** (`05b`): a parametric gun kit (pistol kit, long-gun kit: receiver, grip, magazine curved/straight/drum/box,
  handguard, barrel, brake, rail, carry handle, stocks solid/wood/skeleton/folded) and 36 builders. Any id without a builder
  (a content-track weapon) gets a builder of its class picked by a hash of the id, so it always has a believable mesh.
  Each weapon has fit points: grip (the origin), `support` (the off hand), `muzzle`, `rail`, `under`, `mag`, plus `hold`,
  `holster` and the allowed attachment `slots`.
- **Attachments** (muzzle: suppressor / compensator; mag: extended; optic: red dot / long scope; grip; light) change the numbers
  (`Combat.eff(p, id)`: range, damage, quiet, recoil, magazine size, aim spread, ADS zoom, bloom) and the mesh
  (`Assets.weaponMesh(id, mods)` adds the parts at the fit points; a flashlight has a lit `lens`). **Tints** (8, from
  Factory to Goldplate) recolour the dark metal and polymer of a cached geometry per (id, tint).

### Aiming and firing (`08_combat.js`)
- **Shoulder camera**: while aiming, a wrapper on `Render.rig.update` puts `CAMERA.aimDist/aimSide/aimHeight/aimLookHeight`
  at `Combat.AIM_CAM` (1.55 m back, 0.78 m right, 1.72 m up) and `aimFov` at the per-class ADS fov (rifles 0.84x, LMG 0.88x,
  launchers 0.86x, a red dot -3°, a long scope -14°), restoring the config after each call.
- **The gun in the hands**: `gunFrame()` places the weapon from the body and pose alone (no mesh needed, so a headless shot
  leaves from the same muzzle the render shows): rifles in the shoulder pocket at cheek height, pistols in a two-handed stance,
  launchers on the shoulder, the minigun at the hip; low-ready across the chest for long guns, in the hand at the side for
  one-handers. Handguns are drawn 1.22x larger so they read in the fallback rig's big fists.
- **Aim assist** (`Combat.settings.aimAssist`, default on): pressing aim snaps the camera onto the best *hostile* in a 20° cone
  (0.3 s), then a light stickiness; holding aim re-acquires a target the crosshair passes over (6°); Tab cycles. Bystanders
  are only locked when aimed at on purpose (within 5°). **The shot always goes where the crosshair rests** (a 3° magnet onto
  the lock, 8° in a car), so a lock never hijacks a shot onto something else (QA CMB-05). Aimed shots travel the camera's line
  from level with the muzzle (no parallax between the eye and the gun); the tracer still leaves the barrel. The helicopter is a
  hard lock (the rig cannot look up at it).
- **Hip fire**: guns fire along the camera's yaw, level at the rig's resting pitch and tilting with the look (the chase camera
  looks down at the player, so its screen centre would be the pavement); the assist takes the best hostile within 30°. Melee
  swings at the nearest body in front. Thrown things land where the screen centre meets the ground, on a ballistic arc solved
  for the hand's real height.
- **Feel**: per-weapon recoil patterns (a climb over the burst and a seeded sideways wander), bloom, hit markers, head-shot
  text and stat, kill confirms for blasts too, impact fx per surface (wall dust + a bullet-hole decal on the wall, ground dust
  + decal, a water splash, sparks off cars and cover), hit reactions (`pose.hit`), a muzzle light that lives in the scene.

### Visible gun, holsters, hands (`08_combat.js` + `06_entities.js`)
- `Entities.sync` calls `Combat.postSync(ped)` after each ped's `syncMesh`: the held weapon is a child of the ped's root
  group, placed in world space from `gunFrame` (raised) or the right hand (low-ready one-handers, melee, thrown), so it works
  with any skeleton. The meshes also exist without a render (`ensureHeld` runs from the update).
- **Holsters**: the best owned hip weapon on the right hip (barrel down) and the best owned back weapon diagonal across the
  back; AI peds show their own weapon holstered until they draw (in a fight, aiming, a mission goon, a cop while wanted).
- **Hands**: without `GTP.Anim` the fallback arms are pointed at the grip and the support point (slightly stretched when
  short), melee swings get fallback arm poses, and low cover crouches the fallback rig. `Combat.handTargets(ped)` gives the
  world hand targets to the models track.

### Pose contract (`06_entities.js` -> `Combat.fillPose`)
`Ped.update` now runs the step (`_step`) and then fills `ped.pose` for every ped, every step:
`{aim, aimPitch (rad, + up), aimYaw, fire (s since the last shot), reload (0..1|null), melee ({type:'light'|'heavy'|'counter',
t, combo, windup}|null; an AI swing reads as 'light' with windup true until it lands), cover ({side, high, peek, blind, edge}|null),
hold ('none'|'one'|'two'), weaponId, drive, ride, swim, fall, ragdoll ({vx, vy, vz, spin}|null)}` plus extras the models track
may use: `hit` ({zone, t, dx, dz}|null, a flinch), `vault` (0..1|null), `crouch` (low cover, not peeking), `spin` (minigun
barrel angle). Objects are reused per ped (no allocation per step).

### Cover (`08_combat.js`, input in `Player.control`)
- Input action `cover` (the UI track binds Q / B; until then a fallback `C` keydown sets it when no binding exists).
- Snap to a wall, a car or a solid prop within 2.4 m (probing with `World.resolveCapsule`, so interior walls wrapped by the
  interiors track count; vehicles by their push-out); high cover at 1.55 m and up (a sedan is low, an SUV high); thin props
  (r < 0.35: lamps, signals, hydrants, bollards) are not cover.
- Move along the cover (the camera's left/right on the face), hold at its ends (`edge`), follow curved faces; back away or
  press cover to leave; **peek** with aim (low cover: stand up; high cover: lean out at an edge; mid-wall high cover is a
  blind-fire spot); **blind fire** (fire without aim: wide spread, stays covered); **vault** low cover with jump; **cover to
  cover** (press cover while looking away from the cover: run to the next one in view, up to 12 m).
- Shots from the far side of the cover (within 75° of straight through) hit the cover instead of the player; flanks and peeks
  get through. `cover:enter {player, x, z, nx, nz, high, kind}`, `cover:exit {player, reason}`; `GTP.AI.coverAlert(x, z,
  {nx, nz, high, player})` on entering and every 4 s while in cover (feature-detected).

### Melee
Light (tap: jab, cross, a hook that floors), heavy (hold the trigger 0.35 s, or aim + fire), counter (jump while an attacker's
swing is coming: no damage taken, the attacker floored, "COUNTERPOINT"). AI swings have a telegraphed wind-up (a white flash
at the fist, `pose.melee.windup`), damage x0.45, a 0.9..1.5 s cooldown and at most two attackers winding up on one target
(QA-C1-01). `melee {type, ped, target, hit, phase}` events.

### Shop (`Combat.catalog` / `Combat.buy`)
- `catalog(storeId)` -> `[{id, kind:'weapon'|'ammo'|'attachment'|'tint'|'gear', weaponId, name, price, listPrice, owned, equipped,
  locked, lockReason, stats:{damage, rate, range, accuracy, mobility}, tab, slot, variant, rounds, pitch, cls}]`. Item ids: the
  weapon id; `ammo_<weapon>`; `att_<weapon>_<slot>_<variant>`; `tint_<weapon>_<tint>`; gear ids (`clarity_pellets`,
  `clarity_family`, `firmness_vest`, `range_reset` at the flagship only). Every weapon with rounds has an ammo box.
- `buy(itemId, {equip, store})` -> `{ok, reason, item, price, equipped?}`; reasons `unknown locked funds owned notOwned full
  flagship`. Attachments and tints need the weapon, buy once, equip on purchase; an owned one toggles for free
  (`equip:false` takes it off). Emits `shop:buy {item, price}`.
- The legacy `shop.items(tab)` / `shop.buy(id)` (the v0.2 UI) work on top of it; the shop lists the original twelve first.
- Save: `GTP.SaveRegistry.combat = {get, set}` holds `player.weaponMods`, `player.weaponModsOwned` and the aim-assist /
  holster settings. Combat creates `GTP.SaveRegistry = GTP.SaveRegistry || {}` at load and registers the entry then (and again
  on its first update if the object was replaced): **the story track should add to the existing registry, not replace it**. A
  `set()` before the player exists is held and applied on the first update.

## QA round 1 bugs fixed (all with a test in `tests/combat.js` section 20 or 21 unless noted)
| id | fix |
|---|---|
| STR-08 | `shop.discount()` uses the content rule (`Content.expansion.shop.discount`) when present, else the missions hook, never both |
| STR-09 / CMB-02 | ammo for an unowned weapon is refused (`notOwned`, "Buy the weapon first", the row is locked) and gives nothing |
| STR-14 | a weapon purchase gives a magazine and a spare, a thrown thing or the megaphone its box (megaphone 20, hot take 3, hot mic 1) |
| STR-15 | the ammo cap is mag + reserve x1.5 with `flags.rampage_king` (the Combat part; the other rewards are other tracks') |
| QA-C1-01 | AI melee: wind-up, cooldown, two attackers at a time, x0.45 damage (four goons: a passive player keeps 84 hp after 5 s) |
| CMB-01 | a direct rocket hit wrecks the car through `applyDamage(..., 'ratio')`, so `vehicle:damage` carries the weapon |
| CMB-03 | the cadence is checked before the hot mic's cook; one cook per trigger press |
| CMB-04 | `Render.muzzleLight` is created at intensity 0 on the first `Combat.update` (before any shot) |
| CMB-05 | the lock never steals the shot; bystanders are not auto-acquired |
| CMB-08 | a weapon pickup adds rounds up to the cap and switches only to a new gun (or from fists); a full crate stays |
| CMB-11 | hottake / hot mic / rocket / confetti / sticky / latte victims give the hit marker, the confirm and the kill stat |
| CMB-12 | Combat side: holding fire in a car never cooks a second mic (the fuse HUD outside aim is the UI track's) |
| CMB-14 | `stats.headshots` counts; a shotgun volley is one hit |
| CMB-15 | shotgun 70 per volley: one volley at 4 m drops a 60 hp ped |
| CMB-16 | table leg 32; no flip slide when the swing finishes or nearly finishes the victim: two swings, 0.8 s |

Not mine (hint points at other files): CMB-06 (30_game), CMB-07 / CMB-13 (render: pitch limit, recoil at the clamp),
CMB-09 (AI heli gunner), CMB-10 (missions), the UI half of CMB-12.

## Interfaces exposed
```js
GTP.Combat.WEAPONS[id], ORDER, SLOTS (12 wheel slots), UNLOCK, PITCH, SPONSOR, AIM_CAM, HOLD_SCALE, COVER, MELEE, settings {aimAssist, holsters}
GTP.Combat.catalog(storeId), buy(itemId, opts), weaponStats(id, player), eff(player, id), holdOf(id), slotOf(id), syncArsenal()
GTP.Combat.fire(ped, id), reload(ped), ammo(ped, id), ammoCap(ped, id), giveAmmo(p, id, n, cap)
GTP.Combat.fillPose(ped, dt), postSync(ped), handTargets(ped) -> {right, left|null, raised, weaponId, gun}, gunFrame(ped, raised), muzzle(ped, id)
GTP.Combat.coverToggle(p), coverControl(p, dt), coverFind(p), coverEnter(p, cand), coverExit(p, why), coverShield(p, shooter), vaultStep(p, dt)
GTP.Combat.counter(p), counterReady(p), moveScale(p), inSmoke(x, z), smokes, setAimAssist(on)
GTP.Combat.hud() -> adds crosshair {mode:'aim'|'hip'|'scope'|'none', k, spreadPx, screen, hostile, target, inRange, assist, locked},
                    cover {active, high, side, edge, peek, kind, canVault, blind | near, nearHigh}, melee {type, t, combo},
                    prompt ('counter'|'cover'|'vault'|'peek'|null), weapon.slot / hold / mods / spin
GTP.Combat.wheel / hud().wheel: twelve SLOTS; a segment is a slot showing its picked weapon {slot, slotName, id, name, owned, count, ids, ...};
                    R cycles the hovered slot's weapons while the wheel is open
GTP.Assets.weaponMesh(id, mods), weaponFitFor(id, cls), weaponFit, weaponGeometry(id, tint), weaponMuzzle(id, mods), weaponTints,
           weaponAttachments, weaponClassOf(id), weaponIds()
ped.pose (contract above), ped.cover, player.weaponMods, player.weaponModsOwned
Events: cover:enter, cover:exit, melee, aim:assist {target}, plus the existing weapon / hitmarker / reload / scope / wheel / shop:*
Pickup.collect: Combat.collectPickup may return 'skip' (the crate stays)
```

## Interfaces consumed (all feature-detected)
- `GTP.Content.parity.weapons` / `.attachments` / `.tints` (content track): merged when present; the game works without them.
- `GTP.Anim` (models track): when present, the fallback arm reach, melee arm poses and crouch are skipped; the gun is still placed
  by Combat. Bones named `handR` / `handL` are used for the hand frame when they exist, else `armR` / `armL` 0.61 m down.
- `GTP.AI.coverAlert(x, z, info)` (world track).
- `GTP.SaveRegistry` (story track): `combat` entry.
- `GTP.Interiors.active` (interiors track): the green shop light does not open while inside an interior.
- Input action `cover` (ui track; virtual actions already work through `Input.set`).
- `Content.expansion.shop.discount` / `Combat.shop.discountHook` (STR-08).

## Wrappers installed on other modules
- `GTP.Render.rig.update` (wrapped once on the first `Combat.update`): sets `C.CAMERA.aimFov` (per-class ADS) and the four aim
  rig values to `Combat.AIM_CAM` for the duration of the call, restores them after. Integration may fold this into the rig.
- `GTP.Render.fx.register('casing', ...)` (existing) and `register('hole', ...)` (bullet holes on walls: an InstancedMesh of
  90 dark discs, 25 s).
- `GTP.Render.muzzleLight` is created by Combat on its first update (CMB-04; integration may move it into Render's scene setup).
- A `document` keydown/keyup listener for `C` -> `Input.set('cover')` only while no binding for `cover` exists.

## Notes for the integration
- **models**: read `ped.pose`; `pose.hold` is the weapon's class hold (`'one'` for pistols even though aimed pistols are held
  in both hands: use `Combat.handTargets(ped).left`). Put the hands on `handTargets(ped).right/left` (world space, valid after
  the ped's last render). Keep the `armR/armL/torso/legL/legR` aliases; a `handR` bone improves the low-ready placement.
- **ui**: draw the crosshair from `hud().crosshair` (a hip dot exists now), the prompts from `hud().prompt` / `hud().cover`,
  the wheel's twelve slots (segment `slotName`, `count`), the armory from `catalog()` / `buy()`; the hot mic fuse is in `hud().cook`.
- **interiors**: rack meshes with `GTP.Assets.weaponMesh(id)` (`weaponFitFor(id).len` to space them); `armory:inspect` cards can
  use `Combat.catalog()` rows for stats.
- **content**: the parity schema is consumed as specified; `class` aliases listed above; `attachments` limits the slots;
  `projectile: 'lobbed'` on a `heavy`/launcher class becomes an impact grenade launcher, on a thrown class a fused grenade.
- **world/AI**: cops/goons in a fight draw their weapon from the holster; AI shots at a player in cover hit the cover from the
  front, so flanking (coverAlert) is how the AI gets through. `Combat.inSmoke(x, z)` can blind the AI's sight.

## Decisions
- One shared aim model for keyboard/mouse and pad: the assist snaps on aim press (GTA V "assisted aim"), shots go to the
  crosshair. `settings.aimAssist = false` is free aim (Tab still locks).
- Hip fire goes level, not to the chase camera's screen centre (which looks at the pavement in front of the player).
- A sedan is low cover (vaultable); 1.55 m is the high-cover line.
- The cadence after a weapon switch is the faster of the two weapons' (a switch does not inherit a slow weapon's wait).
- AI melee is deliberately gentle (Act I is an on-ramp): about 3 hp/s from four goons on a passive player.
- The shop keeps the original twelve first in its list; the wheel and the cycle order group weapons by slot.

## Adversarial review (a subagent read the whole diff)
Fixed from its report: a teleport (retry, restart, load) while in cover snapped the player back (now leaves cover); a knockdown
did not cancel a vault; the save entry could miss a load from the title; `Combat.gunFrame()` threw; parity weapons with `mag`
on thrown items or a missing `reload` could soft-lock or never run out (normalised now; a shell-by-shell reload takes the
table's magazine time per shell); the blind-fire gun sat 0.42 m low in the fallback crouch; the cover-to-cover run survived
cutscenes and interiors; `pose.aimYaw` ignored a yaw of exactly 0; per-frame allocations in `postSync`/`holsterIds`/`syncArsenal`;
the hot mic cap and launcher stencil leaked geometry and materials on weapon swaps.

## Tests
```
cd grand-theft-pundit
NODE_PATH=/opt/node-tools/node_modules node tests/combat.js   # arsenal (37 weapons fire, hurt, spend, sit in the hand), aim, reload,
                                                              # bloom, zones, hot mic, rocket, scope, drive-by, wheel, shop, QA regressions,
                                                              # parity merge, mods, pose contract, holsters, melee combos (~2 min)
NODE_PATH=/opt/node-tools/node_modules node tests/cover.js    # cover, teleport out of cover, vault cancel (~1 min)
NODE_PATH=/opt/node-tools/node_modules node tests/actors.js   # the player controller and vehicles (unchanged)
```
Screenshots to look at: `tests/out/combat_aim.png`, `combat_firefight.png`, `combat_holsters.png`, `combat_held_*.png`,
`cover_low.png`, `cover_peek.png`, `cover_wall.png`.

Full run on this branch: `node tests/all.js` -> all 20 test files passed (actors, ai, artifact, audio, campaign, combat,
content_audit, cover, cutscenes, feel, feel2, missions, perf, render, saves, smoke, strands, tune, ui, world).

## Known issues
- The fallback rig has no elbows: arms are straight and slightly stretched to reach the gun; the models track's IK should
  replace this using `handTargets`.
- The fallback crouch rotates the thighs forward (a kneel); it reads as crouched but not as a GTA crouch.
- Wall bullet holes are flat discs on building faces; props and cars get sparks only.
- The cover probe's height for buildings is a ray test at 1.55 m; an awning or a low annex can read as high cover.
- The hip crosshair dot (`hud().crosshair` mode `'hip'`) is only drawn by `Combat.drawAimOverlay`; the UI track's HUD draws
  the aim crosshair only while aiming until it adopts the new states.
