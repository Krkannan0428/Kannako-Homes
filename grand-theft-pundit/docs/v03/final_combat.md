# v0.3.0 final round: combat (shooting + models + interiors)

Branch `v03r1/combat`. Detail, root causes and every proposal for other areas: `docs/v03/triage_combat.md`.

## Fixed

- **A visible gun in the hands.** On the new character models every held weapon sat 1-1.6 m off the hand: GTP.Anim moved
  the gun into the `handR` bone and Combat then wrote a root-space transform into the bone's frame (the empty hands in
  `combat_held_*.png`, the pistol floating over the car in `cover_peek.png`). Anim is now the gun's only writer on a models rig,
  Combat reads the hand targets back from the drawn gun, and the shot / tracer leaves the barrel the player sees (Combat's frame
  uses Anim's grip at scale 1). The rifle's stock no longer pokes out through the back while aiming. Guns render in their real
  dark gunmetal (the weapon kit's colours were not converted from sRGB).
- **Rifle grip** (`characters.js`): grip at chest height in `handR`, the left hand on the foregrip.
- **One arsenal**: the shooting and content tracks had invented overlapping weapons (two miniguns, two "Filibuster"s ...). On
  a94bf77 the content table uses the shooting ids: 36 weapons plus fists, every parity id present, no duplicates. Combat also
  maps the other generation of ids (11 aliases, saves migrate), copies the parity rows' engine fields (spin-up, stun, fuse,
  sticky, smoke, mobility), and has meshes for the ten weapons of the other table.
- **Weapon wheel**: an unowned slot shows its original weapon; slot 2 is "Specials".
- **Armory racks**: the whole arsenal once each, grouped by class (long guns on the east wall by row, heavy and specials on the
  feature wall behind Merle, melee on the west pegboard, handguns in the glass counter, thrown in the island cases); the counter
  and browse open the UI's armory card; the Port and Uptown stores keep their decor when entered through the world's doors.
- **The armory / m01c race**: the m01c start light and the armory door sat on the same spot; the door could teleport the player
  inside mid-intro, so m01c never handed out the free pistol. The door yields to a start light and the mission's "step inside"
  objective walks the player in.
- **Aiming indoors / at a wall** (QA-A-CAM-01): the aim camera no longer jumps in front of the player.
- **Enter a car with the real F key**: works (tap and hold); `tests/actors.js` section 11 drives the real key. The coordinator's
  "F does nothing" was the software-GL slow motion (the press registered; the door walk took 4.5 s of wall time).
- **Boss weak points**: spools always took hits; after the last spool the camera stayed pointed at the sky. A downed hard lock
  now hands over like a fresh aim press (b01 reaches phase 3; the rest is the bosses test's bot).
- **Scope shot, hip fire, shop unlocks, crash test**: see the triage file.
- **Wrappers folded**: the bosses' and interiors' hooks on `Combat.update` / `Combat.fire` are native now.
- **Back of the head**: the scalp no longer pokes through short hair.

## Also fixed from the QA lists (details in the triage file, section 6)

QA-A-DRV-01 / 02 / 08 (getting out on the Loop viaduct and at deck barriers, cars climbing stunt-wedge faces), QA-A-ENT-01
(the car dash through the hood), QA-A-ENT-04 (skid marks on ramps), QA-A-ENT-09 (swimmers on top of the water), QA-A-ENT-10
(the first-person headlight), QA-B-TCH-07 (the invisible weapon wheel in the shop), QA-A-CAM-01 (aim camera into walls),
QAC-07 / 08 (our part) / 09 / 48 and stab-QA-D-01 / 08 (our part) (geometry, material and allocation leaks). Already fixed and
guarded: the 15 round-1 combat / shop bugs, QA-A-ENT-02, QA-B-TCH-13.

## Still open

In my area:
- The Ratio Launcher and the minigun are held at chest height like a rifle (GTP.Anim has no shoulder-carry pose for launchers).
- The left hand reaches the foregrip only at 40 % of a long gun's length (the new rig's arm cannot reach further when the
  stock sits in the shoulder); it reads as a magazine-well grip on the longest rifles.
- On a stunt wedge's face the bumper still sinks about 0.6 m before the step-wall stops the car (needs wedge collision in
  `04_world.js` `resolveCapsule`); skid decals stay flat on ramps (`10_render.js` `_placeDecal` could tilt them).
- `tests/regress/qa_c_pedgeo.js` and `qa_a_ent_01.js` / `qa_a_ent_02.js` measure things the new rig no longer has (no release,
  sRGB colour matching, a static skinned bounding box); the bugs were judged with probes. The QA owners may want to rewrite them.

For other areas (precise patches in `triage_combat.md` section 5 and the QA table):
- **vehicles / world**: the Spin Doctor mod shop never opens on a94bf77 (`tests/vehicles.js` fails there): `07_ai.js`'s door
  marker hands the drive-in to the vehicles module (`result: 'vehicles'`), and `06b_vehicles_air_sea.js` `modshopTick` skips
  every shop that has a world door (`worldDoorShop`), so nobody emits `modshop:open`. One side has to own it.
- **environment** (`10_render.js`): the hot take's projectile sphere is built per throw and never freed (`qa_c_gpuleaks.js`
  still fails on it); QA-A-CAM-02 / 03 / 05 / 06 / 07; the aim guard's cast origin (Combat's `aimGuard` covers it meanwhile).
  `01_config.js`: QA-A-CAM-08 cull distances. `05_assets.js`: QA-A-CAM-04 bike eye.
- **UI** (`11_ui.js`, `02_input.js`): QA-B-FE-03 / pers-QA-SAVE-03 (latch `enter` and `jump` after a consumed confirm) and
  QA-B-FE-04 (drop `back` from Escape / Backspace), both verified in a scratch copy.
- **story** (`30_game.js`): the step cap makes software-GL runs crawl at ~0.1x (what made F look broken); `tests/newplayer.js`
  should not throw at line 637 when the page errors, and can read `GTP.Interiors.range.targets`; the `range` objective can use
  `GTP.Interiors.range.booth` as its GPS point.
- **world** (`07_ai.js`): the traffic swerve survives a lane change (cars mount the pavement).
- **bosses**: `tests/bosses.js` bot (`tg.kind`, kiting adds); the two small Combat changes for weak points (the hard-lock
  hand-over, the `heli` hit sphere) are in `08_combat.js` and can be adjusted on request.
- **systems** (`14_systems.js`): expose `Systems.golf.active()` so the `Player.control` golf wrapper can be folded.

## Test results (on a94bf77 + this branch, 9719942)

| Test | Result |
|---|---|
| `tests/combat.js` | PASS (142 s) |
| `tests/interiors.js` | PASS (74 s) |
| `tests/characters.js` | PASS (39 s) |
| `tests/actors.js` | PASS (62 s), including the real F key (tap and hold) |
| `tests/cover.js` | PASS (27 s) |
| `tests/content_audit.js` | OK, 256 files, 0 hits |
| `tests/systems.js` (other area, touches the wardrobe / safehouse paths) | PASS |
| `tests/regress/qa_a_drv_01, 02, 08, qa_a_ent_04, 09, 10, qa_b_tch_07, qa_a_cam_01` | PASS (all re-run on the final head) |
| `tests/regress/qa_c_gpuleaks.js` | FAIL on the render-built hot-take sphere only (environment) |
| `tests/vehicles.js` (vehicles track) | FAIL at the Spin Doctor door (the 07_ai / 06b hand-off above), identical with and without this branch's QA patches |
