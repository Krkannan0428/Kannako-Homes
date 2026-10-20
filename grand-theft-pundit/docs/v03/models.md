# v0.3 models track: notes

Branch `v03/models`. Files owned: `js/05d_models.js`, `js/06c_animation.js`, `tests/characters.js`, this file.

The player's complaint was that people were blocky and cars boxy. This track replaces both with smooth, proportioned
models and a real procedural animation system, inside the frame budget (LODs, one draw call per ped).

## What was built

### Characters (`js/05d_models.js`, `GTP.Models`)
- `GTP.Assets.pedParts(look)` is overridden (the v0.2 builder stays as `GTP.Assets.pedPartsV02`). It returns a
  `THREE.Group` holding **one `THREE.SkinnedMesh`** (one draw call, one shared material) over a **17-bone skeleton**:
  `hips > spine > chest > neck > head`, `chest > upperArm > lowerArm > hand` (L, R),
  `hips > upperLeg > lowerLeg > foot` (L, R). (The plan says 16; its own list has 17.)
- Bind pose: feet at y 0, facing -z, arms straight down. Every limb rests along -y, so the v0.2 conventions hold:
  `rotation.x > 0` swings a limb forward, elbows bend with `lowerArm.rotation.x > 0`, knees with
  `lowerLeg.rotation.x < 0`, `torso.rotation.x < 0` leans forward.
- **Aliases**: the bones that replace the v0.2 pivots carry the v0.2 names, so `getObjectByName('legL' | 'legR' |
  'armL' | 'armR' | 'torso' | 'head')` still works (`legL` = upperLegL, `armL` = upperArmL, `torso` = spine). The other
  bones are named by id (`hips`, `chest`, `neck`, `lowerArmL`, `handL`, `lowerArmR`, `handR`, `lowerLegL`, `footL`,
  `lowerLegR`, `footR`). `GTP.Models.bones(root)` returns `{boneId and alias: Bone}`.
- Proportions: 1.8 m, head 1/7.5 of the height (chin 1.565, crown 1.80), shoulders 0.38 m. Body build (slim .. broad,
  a belly on some) varies by a stable hash of the look, never by gender or ethnicity.
- Geometry: lathed tubes with superellipse cross-sections (torso, arms, legs, neck), smooth two-bone skin weights at
  every joint, a shaped head ellipsoid (jaw taper, chin, cheekbones, occiput), a 3D nose and ears, mitten hands with a
  thumb, lofted shoes with flat soles.
- **Faces**: a shared 1024 px face atlas (8 x 8 cells). 48 cells (six skin tones x four brow tones x two eye colours)
  are painted once at first use: skin shading, eye sockets, eye whites, irises, pupils, catch lights, lids and crease,
  tapered brows, nose bridge shading and nostrils, lips with a highlight, cheeks. Special faces (`look.mask`,
  `look.beard: 'stubble' | 'beard' | 'mustache'`) take the remaining cells. Skin tone from `look.skin` (1-6 or a hex,
  snapped to the nearest tone for the texture).
- **Hair** per `look.hair` (short, slick, long, bob, bun, pompadour, mohawk, afro, bald): shells over the skull that
  stop at a hairline per azimuth, plus a fall of hair, a bun, a mohawk fin. **Hats** (cap, beanie, cowboy, fedora,
  beret, crown, helmet) and **glasses** (round, aviator, thick, shades) as meshes. Extras: tie / bow tie, lanyard,
  medal, flag pin, badge, earpiece, cigar; held props (mic, phone, the placard with its text) are rigid meshes named
  `prop` on the hand bones and hide while a weapon is out.
- **Clothing** (`GTP.Models.outfitOf(look)`): `look.outfit = {top, bottom, shoes, hat, glasses}` with ids from
  `GTP.Content.parity.clothing` (array, or object of arrays / items; an item's `style | kind | type | id | name` is
  matched to a style vocabulary, `color | colour | tint | colors[0]` gives the colour) or `{style, color}` objects.
  Tops: tee, dress (shirt and collar), suit (jacket, lapels, shirt V), hoodie, polo, jacket (open over a tee), uniform
  (badge, pockets, epaulettes, duty belt), swat (plate carrier, pouches), tank, sweater. Bottoms: pants, jeans,
  shorts, skirt. Shoes: sneakers, dress, boots. Without an outfit the v0.2 look decides: a tie on a dark shirt is a
  suit, a tie on a light shirt a dress shirt, `role: 'cop'` / `badge` a uniform, `uniform: 'swat'` swat, else a
  stable hash of the look; the v0.2 colours are kept.
- **LODs**: `root.userData.lods = [near, mid, far]` (~5.5k / 2.3k / 0.9k triangles), swapped by `GTP.Models.setLod`
  (near < 14 m, mid < 40 m; `GTP.Models.LOD_NEAR / LOD_MID`). Far peds animate at a third of the frame rate and skip
  IK; LOD 2 casts no shadow.
- Colours are authored in sRGB and converted to linear vertex colours; the atlas is an sRGB texture.
- `look.flat` (the cardboard cutout) flattens the body to 14 % depth. `look.scale` scales the root as before.

### Animation (`js/06c_animation.js`, `GTP.Anim`)
`GTP.Ped.prototype.syncMesh` is replaced (the v0.2 function stays as `GTP.Anim.legacySync` and still drives any mesh
that is not a `GTP.Models` rig). Kept from v0.2: interpolated transform, first-person and removed hiding, the
`C.QUALITY.pedDraw` cull, the knockdown / death / swim tilt from `ped.tilt` with the 0.16 m lift, the scooter rider,
`ped._parts` (now with every bone and the alias names) for the cutscene pose wrapper (which still runs after the
prototype and overrides the alias pivots), the damage flash and corpse fade (Combat; they work on the skinned mesh;
the gun and props are named `held` / `prop`).

Layers every frame: idle (breathing, weight shift, glances), walk, run, sprint (speed-driven amplitudes, knee flexion
in the swing phase, foot roll, pelvis twist and counter-rotating chest, bob), crouch (low cover, the counter's duck),
jump tuck and fast-fall flail, getting up as the tilt eases back, swim (crawl with breathing, flutter kick; treading
water when still), knockdown / death sprawl with a ragdoll flail while airborne. Upper body: weapon holds with
**two-bone IK on both arms** (rifle-likes: stock in the shoulder, left hand on the foregrip; pistols: both hands out
when aiming, by the thigh otherwise; megaphone at the mouth; thrown items cocked over the shoulder and whipped through;
bat-like melee weapons on the shoulder and swung), aim (spine, chest and head share `aimPitch`; the chest twists toward
`aimYaw`), fire recoil, reload (the gun tilts, the support hand goes to the magazine, the pouch and back), unarmed
melee (guard; light jab, heavy hook, counter uppercut), cover (crouch, lean out to peek on high cover), drive (seated,
hands on the steering wheel turning with `vehicle.wheelSteer`, a drive-by arm) and ride poses, and a head that looks
at the player within 5 m.

The held gun Combat hangs on `armR` is re-parented to `handR` every frame and placed at the grip; its orientation is
set so the barrel follows the aim. Car occupants are drawn through the glass at their seat (the record's `seats`);
the **player's own body stays hidden in cars** as in v0.2 (`GTP.Anim.showPlayerInCar = true` opts in;
`GTP.Anim.showOccupants = false` hides everyone as v0.2 did).

### Vehicles (`js/05d_models.js`)
`GTP.Assets.vehicleGeometry(cls, wrap, mods)` is overridden for the nine `C.VEHICLES` classes (sedan, sports, suv,
truck, van, cop, taxi, bus, bike/scooter); the v0.2 builder stays as `GTP.Assets.vehicleGeometryV02` and is used for
unknown classes. Bodies are **lofts**: stations along the car through rounded cross-sections whose bottom edge follows
the wheel arches (with flares and dark wheel-well liners), a greenhouse loft with a raked windshield and rear window,
pillars and black window trim, separate glass, chrome trim, lamp pods (chrome reflector and lens) placed on the real
nose / tail surface, grille and intake, number plates, mirrors, door seams and handles, interior silhouettes (seats,
headrests, dash, steering wheel, visible through the glass), exhausts, and class extras (cop light bar on its red /
blue groups, push bar, black-and-white panels and door stripe; the taxi's roof sign and checks; SUV roof rails, side
steps and cladding; the truck's cab, ribbed cargo box, chassis, tank, stack and chrome bumper; the bus's windows,
doors, sign and stripe; the scooter's shield, seat, bars and lamps). Smooth normals throughout. Wheels: a lathed tyre
with tread and sidewall, rim lip, spokes per style, brake disc and caliper, centre cap and lug nuts (symmetric: one
instanced geometry serves both sides).

The record keeps the v0.2 shape (`body` with material groups paint 0, detail 1, glass 2, head 3, tail 4, barRed 5,
barBlue 6, wrap 7, chrome 8; `wheel`, `wheelRadius`, `wheelWidth`, `wheelOffsets`, `lightPoints`, `doorPoints`,
`size`, `wrap`), with the same dimensions, wheel positions and door points, plus `lods[3]`, `wheelLods[3]`,
`seats[{x, y, z}]` (hip points, mesh frame, forward -z), `wheelPoint` (steering wheel centre), `bars` (scooter),
`mods` (normalised), `modsKey`, `finish`, `models: true`, `tris`.

**mods**: `{paint: {primary, secondary, finish}, wheels 0..5, spoiler 0..3, tint 0..3}` (other fields ignored here).
wheels: 0 class default, 1 multi-spoke, 2 mesh, 3 chrome deep dish, 4 turbine, 5 black off-road; spoiler: 1 lip,
2 duck tail, 3 wing (sports carry the wing by default); tint darkens the glass; `paint.secondary` colours the roof,
mirrors and spoiler; `paint.finish` (gloss, metallic, matte, chrome) and `paint.primary` are applied to the live paint
material. Geometry is cached per `cls|wrap|modsKey`.

## Interfaces exposed
- `GTP.Assets.pedParts(look)`, `GTP.Assets.vehicleGeometry(cls, wrap, mods)` (overrides; v0.2 versions as `...V02`).
- `GTP.Models`: `BONES`, `PARENT`, `ALIAS`, `bones(root)`, `outfitOf(look)`, `lookKey(look)`, `buildBody(look, lod)`,
  `pedMaterial()`, `atlas()`, `clothingItem(id)`, `LOD_NEAR`, `LOD_MID`, `lodFor(d)`, `setLod(root, i)`, `stats()`,
  `vehicleGeometry`, `syncVehicle(v, mesh, userData)`, `VLOD_NEAR` (30 m), `VLOD_MID` (80 m), `normMods`, `modsKey`,
  `wheelGeometry`, `vehicleStats()`.
- Ped root `userData`: `models: true`, `bones`, `boneList`, `skin` (the SkinnedMesh), `lods`, `lod`, `rest` (joint
  positions), `look`.
- `GTP.Anim`: `poseOf(ped)` (the normalised pose), `weaponInfo(id)` (`{hold, len, upright, melee, thrown}`),
  `armIK(...)`, `syncMesh`, `legacySync`, `legacyVehicleSync`, `GRIP` (the grip point in the hand frame),
  `showOccupants`, `showPlayerInCar`.
- `ped._anim` (per-ped animation state), `ped._parts` (v0.2 handles plus every bone).

## Interfaces consumed
- **Pose contract** `ped.pose` (shooting track): `aim, aimPitch (rad, + up), aimYaw (world yaw), fire (s since the
  shot), reload (0..1 | null), melee {type, t} | null, cover {side, high, peek, blind} | null, hold, weaponId, drive,
  ride, swim, fall, ragdoll {vx, vy, vz, spin} | null`. Missing fields fall back to the v0.2 fields: `aiming ||
  firePoseT > 0`, the camera pitch for the player (`GTP.Render.rig.pitch`) or the target for AI (`ped._aimPitch`
  overrides), a rise of `firePoseT`, `reloadT / reloadTotal`, `punchT`, the weapon's hold class, `inVehicle`,
  `swimming`, `!onGround`, knocked down while airborne.
- Weapon hold class: `GTP.Content.parity.weapons[].hold`, else `GTP.Combat.WEAPONS[id].hold`, else by id / length.
  Weapon lengths from `GTP.Assets.weaponFit` (the support hand sits at 40 % of the length on rifle-likes).
- `ped._held` (Combat's held weapon mesh) is re-parented to `handR`.
- `GTP.Content.parity.clothing` (content track) for outfit ids; `GTP.Content.looks.skinColors`.
- `vehicle.mods` (vehicles track; read every frame, so no rebuild is needed for mods to show), `vehicle.wheelSteer`,
  the vehicle mesh's `userData.rec / paint / wheels` built by `GTP.Render.buildVehicleMesh` (environment track).

## Wrappers installed on other modules
- `GTP.Ped.prototype.syncMesh` replaced (from `06c`). The plan assigns `Ped.prototype.syncMesh` to this track.
- `GTP.Vehicle.prototype.syncMesh` wrapped (from `06c`): the original runs first; then `GTP.Models.syncVehicle` swaps
  body / wheel LODs by camera distance (with hysteresis), swaps the geometry when `vehicle.mods` changes, applies the
  paint finish / primary, and tones the default paint down (metalness <= 0.28, roughness >= 0.36) so roofs no longer
  mirror the sky like glass. Integration can fold this into `Render.syncVehicle`.
- `GTP.Assets.pedParts` and `GTP.Assets.vehicleGeometry` replaced (from `05d`).

## Decisions
- One skinned mesh per ped instead of rigid parts: 1 draw call (v0.2: 6), smooth joints; the crowd lowered the frame's
  draw calls (~970 -> ~710 in the test scene).
- 17 bones (the plan's list) rather than 16.
- The player stays hidden inside cars (v0.2 behaviour and `tests/actors.js`); NPC occupants show.
- Colours converted to linear so skin and clothes show their designed hex values instead of washed-out ones.

## Tests
`cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/characters.js`
Covers the rig, aliases, proportions, LOD budgets, hair / hat variety, outfits and parity clothing ids, locomotion,
rifle and pistol IK holds (gun in the hand along the aim, the left hand on the foregrip), the pose contract (pitch,
reload), melee, cover, swim, knockdown tilt, first-person hide, LOD and distance cull, the cutscene pose wrapper, the
corpse path, all nine vehicle classes (LODs, groups, seats), mods on records and live meshes, a seated driver, a crowd
budget, and five screenshots (`tests/out/characters_*.png`).

## Known issues
- Clothing is vertex-coloured geometry (no cloth textures); hands are mittens with a thumb (no fingers).
- The skirt is rigid on the hips: legs can poke through it in a full run.
- Car occupants' feet can show a few centimetres below low sills at some angles.
- The bus windshield reads as a tall glass box from some angles.
- IK targets are tuned for the v0.2 weapon meshes (`05b`); new weapons with very different grips may need a hold
  offset (`GTP.Anim.weaponInfo` is the place).
- No QA bug in `docs/v03/qa_r1_bugs.json` points at `05d_models.js` or `06c_animation.js`; none were fixed here.
