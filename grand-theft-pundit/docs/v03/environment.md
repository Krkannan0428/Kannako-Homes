# v0.3 environment track: the city looks modern

Branch `v03/environment`. Files owned and changed: `js/05_assets.js`, `js/10_render.js`, `js/10b_postfx.js`,
`js/01_config.js`. Tests: `tests/render.js` (extended), `tests/perf.js` (rewritten). No other file was edited.

## What was built

### Buildings
- **Interior-mapped glass** (`Assets._glassShader`, every near facade material). Each facade style gets a glass mask
  painted by running its night painter a third time in a mask mode (`Assets._facadeMask`: R = glass, G = the window
  is lit at night, B = a cool LED light instead of a warm lamp; same random sequence as the night texture, so the
  near and far LOD agree on which windows are lit). In the fragment shader a ray from the eye is cut against a room box
  behind each window cell (rooms are lined up between the painted windows, `ROOMS` per style): back wall with art or a
  door, side walls, floor, ceiling, a furniture card part way in, blinds at the pane; ground floors are deeper shops
  with shelves of goods and a counter. The glass itself is dark and glossy, so three's own Fresnel reflects the sky and
  the sun in it, and the room is added as emissive light behind it: daylight by day, the room's lamp at night when the
  mask says it is lit (`Assets.setInteriorLight(day, night)`, driven by `Render.updateEnvironment`). The environment
  map's diffuse share on walls and ground is trimmed (`IBL_DIFFUSE`) so shadows are not sky-blue twice over.
- **Architecture** merged into each chunk's facade mesh (no extra draw calls; `Render._architecture`):
  vertical fins on the glass towers (downtown every 2 m on the mullion lines, Goldplate and the airport every 4 m),
  stepped three-course cornices with brackets on the street walls (campus, capitol, police, strip, marina,
  hospital), black steel fire escapes with landings under two windows per floor, stair flights and a drop ladder
  (brownstone, strip, industrial; on a wall facing a street), window AC units under some sills (`DETAIL.acUnits`),
  rooftop HVAC units with fan discs and ducts. Window positions come from `Assets.windowLayout(style)`.
- **Storefront signs**: 32 invented shop names (`SHOP_NAMES`, content-audited) on one atlas
  (`Assets.shopSigns()`, `shopSignUV(i)`), a fascia board over every shop door on the strip and the marina
  (one extra mesh per chunk, `chunk.signs`); backlit at night through `litMaterials()`.

### Streets
- **Atlas wear**: aggregate grit, polished tyre tracks, oil drips, crisp patches, sealed crack lines; new cells
  `road_half_mh/_dr`, `ave_outer_mh/_dr`, `ave_inner_mh`, `asphalt_mh` (manhole covers, kerb-side storm drains),
  `sidewalk_edge_red/_yel`, `curbface_red/_yel` (painted kerbs: red next to every intersection, yellow loading zones).
  `Render._classify` picks them by tile hash; `Render._kerbPaint(tx, tz)`.
- **Ground shader** (`Assets._groundShader`): a world-space macro variation from two octaves of noise (the atlas no
  longer reads as tiled); in the rain everything darkens and turns glossy with `Render.weather.wet`, and puddles fill
  a noise field on flat ground (mirror-smooth, flat normal, rain rings while it rains). Uniforms:
  `Assets.groundUniforms {tGtpNoise, uGtpWet, uGtpRain, uGtpTime}`.

### Water, trees, grass
- **Ocean** (`Assets._oceanShader`): four directional swells (analytic slopes) plus two scrolling ripple layers for
  the normal, three's Fresnel for the sky reflection and the sun glitter, a colour running from shallow teal by the
  shore to deep blue-green, and foam that breathes against every seawall, beach and pier. The shore distance comes
  from `Render._buildShore()` (a BFS from the land, one texel per tile, rebuilt per world seed). Chop follows the
  weather. Boats and the yacht are lofted hulls now (`hullLoft`).
- **Trees** (`TREES.tree`, `TREES.palm`): smooth-normal trunks and boughs, a dark inner canopy and ~84 alpha-tested
  leaf cards cut from a leaf-cluster canvas (`Assets.leafTexture()`), vertex normals leaning out from the canopy
  centre; palms with ringed trunks and drooping two-segment fronds. Their own material (`Assets.treeMaterial()`,
  `treeMaterialFar()` for the LOD, wired through `rec.materialFar`) sways in the wind (`Assets.treeUniforms`); the
  shadow map cuts the same leaf holes (three's alpha-test depth material). Each instance turns by a hash of its spot.
- **Grass** (`Render.grass`): instanced clumps of 18 blades on grass tiles within `QUALITY.grassRadius` of the focus,
  `QUALITY.grass` clumps per tile, scaled down toward the edge, re-seeded as the focus moves; one draw call; swaying.

### Light
- **Two shadow cascades**: the sun is the near cascade (`QUALITY.shadowNear` m box, `shadowMap`), a black
  shadow-only twin `Render.lights.sunFar` the far one (`shadowFar` m, `shadowMapFar`). three r152 keeps one shadow
  per directional light, so `THREE.ShaderChunk.lights_fragment_begin` / `shadowmap_pars_fragment` are patched once at
  init (`Render._patchShadowChunks`): with exactly two directional shadows, light 0 reads `gtpCascadeShadow()` (near
  map inside its box, fading to the far map at the edge) and light 1 is skipped; anything else runs the stock code.
  three r152 filters shadow casters by the *view* camera's layers, so the renderer's `shadowMap.render` is wrapped
  (`Render._wrapShadowMap`) and called per cascade with a stand-in camera: the far cascade sees layer 0 only
  (buildings, ground, trees, big props), props and entities live on layer 1 (the main camera enables it). The far map
  is redrawn every `QUALITY.farEvery` frames or when the view moved a fifth of its box. Both boxes snap to their
  texel grid (no shimmer). Shadow draw calls at medium fell from ~560 to ~240.
- **District light** (`C.DISTRICT_LIGHT`, `Render._applyDistrictTint`): the hemisphere's sky and ground colours and the
  night fill lean toward the district under the focus over a couple of seconds (grass bounce in the parks, brick in
  Heirloom Heights, sodium on the docks, neon magenta on the strip, cool LED downtown and at the airport).
- **Night**: medium now has 4 real lamp lights (high 8, ultra 12); windows light rooms, not flat panes; the wet ground
  and SSR reflect lamps and neon.
- **Day**: the sun is stronger and warmer, the hemisphere weaker and greyer, the ground's IBL diffuse trimmed.

### Post (`js/10b_postfx.js`)
- **TAA** (high, ultra): Halton(2, 3) sub-pixel jitter through `camera.setViewOffset`, the HDR frame blended into a
  ping-pong history reprojected through the depth buffer from the unjittered pixel centre, the history clipped to the
  3 x 3 neighbourhood's variance box in YCoCg, Karis-weighted. A camera cut (6 m or 20 degrees in a frame, a fov snap)
  or a preset change resets it (`PostFX.resetHistory()`). FXAA stays on medium.
- **SSR on wet roads and the sea** (high, ultra; streets only while `weather.wet` > 0.02, the sea always, so the harbour reflects the city at night): half resolution, the reflected ray marched
  through the depth buffer with a binary refinement, only on flat ground, only things standing above the street
  reflect, strength by Fresnel x wetness x the ground shader's own puddle field, smeared into vertical streaks.
- **Depth of field** (medium and up, only in cutscenes): a half-resolution golden-angle gather, mixed in the composite
  by a circle of confusion around `Render.dofFocus` (the distance to what the cutscene camera looks at, from
  `GTP.Cutscenes.current.look`; auto-focus on the screen centre otherwise).
- **Motion blur at speed** (high, ultra): the camera's motion reprojected from depth, 8 taps along the screen velocity,
  scaled by `Render.motionBlur` (the player's vehicle above 16 m/s).
- Night bloom and the rain haze were turned down (they read as a blur).

### Quality presets (names kept)
| key | low | medium | high | ultra |
|---|---|---|---|---|
| shadows / cascades | off | 1024 near 44 m + 1024 far 220 m (every 3rd frame) | 2048 + 2048 far 250 m (every 2nd) | 4096 + 2048 far 300 m |
| post | off | bloom, FXAA, DoF in cutscenes | + SSAO 12, TAA, SSR, motion blur, grain | + SSAO 16 |
| lamp lights / headlight spots | 0 / 0 | 4 / 1 | 8 / 4 | 12 / 6 |
| interiors, ocean, trees, ground shader | on | on | on | on |
| grass (clumps per tile, radius) | off | 6, 38 m | 10, 46 m | 14, 56 m |
| pixel ratio cap (`maxDpr`) | 1 | 1 | 1.5 | 2 |

## Interfaces exposed
- `GTP.Render.rebuildEntityMesh(entity) -> mesh`: drops and rebuilds an entity's mesh (same parent and pose; layers,
  wheels and light slots re-synced; emits `entity:mesh {entity}`). Vehicles honour `vehicle.mods`:
  `paint.primary` (colour), `paint.finish` (`gloss | metallic | matte | chrome`, `Assets.paintMaterial(hex, finish)`),
  `tint` 0..3 (`Assets.glassMaterial(tint)`). `paint.secondary`, wheels, spoilers are the models track's geometry
  (`Assets.vehicleGeometry(cls, wrap, mods)` is called with `mods`).
- `GTP.Assets.vehicleMeshes[type] = function (vehicle) -> Object3D`: when present, `Render.buildEntityMesh` uses it
  for vehicles of that type (the vehicles track registers moto / heli / plane / jet / speedboat / jetski). A custom
  mesh without `userData.rec` is left alone by `Render.syncVehicle`.
- `GTP.Render.muzzleLight`: a PointLight resident from boot at intensity 0 (Combat's `muzzleLight()` reuses it).
- `GTP.Render.focusPoint()`, `Render.lights.sunFar`, `Render.grass`, `Render.districtTint`, `Render.dofActive /
  dofFocus / dofAperture / motionBlur`, `Render.stats.{grass, farShadow}`.
- `GTP.Assets.{windowLayout(style), shopSigns(), shopSignUV(i), masks, setInteriorLight(day, night), interiorLight,
  groundUniforms, waterUniforms, treeUniforms, leafTexture(), treeMaterial(), treeMaterialFar(), vehicleMeshes}`.
- `GTP.PostFX.resetHistory()`, `PostFX.flags.{taa, ssr, dof, motionBlur}`, `PostFX.stats.{taa, ssr, dof, motionBlur,
  historyResets}`.
- Config: `C.QUALITY` keys `interiors, grass, grassRadius, cascades, shadowNear, shadowFar, shadowMapFar, farEvery,
  taa, ssr, dof, motionBlur, maxDpr`; `C.CAMERA.pitchMinAim`; `C.DISTRICT_LIGHT`; `C.MISSIONS.weaponAmmo`.

## Interfaces consumed (feature-detected)
`GTP.World` (tiles, meta, districtAt, buildings, props, heightAt, groundY), `GTP.Cutscenes.active / current.look`
(DoF focus), `GTP.game.player.inVehicle / vehicle` (motion blur), `GTP.Combat.scope` (rig), `GTP.Entities`.

## Wrappers installed on other modules
None on another track's module. Inside three.js: `THREE.ShaderChunk.lights_fragment_begin` and
`shadowmap_pars_fragment` are patched once (only active with exactly two directional shadows), and the renderer's
`shadowMap.render` is wrapped (cascade pass split). Both are in `js/10_render.js`.

## QA bugs fixed (hints in my files)
- **CMB-04** muzzle light: `Render.muzzleLight` is created with the scene at intensity 0; Combat's `if (!L)` branch
  never runs, so the first shot no longer recompiles every material.
- **CMB-07** look-up: `C.CAMERA.pitchMinAim` (-75 degrees) while aiming, scoped or in first person (chase -28),
  eased back on leaving; the first-person and aim focus use a real yaw / pitch direction. Aiming reaches 60+ degrees
  of elevation (the helicopter orbits at 49).
- **CMB-13** recoil drift: `rig.kick` records only the pitch the clamp let through, so the recovery returns the view.
- **QA-C1-13** unlock ammo: `C.MISSIONS.weaponAmmo` gives rifle 90 and ratio launcher 3 (09_missions merges it).

## Tests
```
cd grand-theft-pundit
NODE_PATH=/opt/node-tools/node_modules node tests/render.js
NODE_PATH=/opt/node-tools/node_modules node tests/perf.js
NODE_PATH=/opt/node-tools/node_modules node tests/content_audit.js
```

## Performance
(filled in below from `tests/perf.js`)

## Known issues
(filled in below)
