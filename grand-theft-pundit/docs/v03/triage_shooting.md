# Shooting track: QA triage, integration round 1

The QA bugs whose hint names `js/06_entities.js`, `js/08_combat.js` or `js/05b_assets_weapons.js`, from
`qa_r1_bugs.json`, `qa_a.json`, `qa_b.json`, `qa_c.json` and `qa_d.json`. Each was checked again on the merged build
(`origin/game/grand-theft-pundit` at `10ba585` merged into `v03/shooting`).

Status: **fixed** (in this round), **already-fixed** (fixed before this round, its regression test still passes on the
merged build), **not-mine** (the hint names one of my files, but the root cause is in another track's file), or
**wontfix** (with the reason).

## Round 1 (`qa_r1_bugs.json`)

All of these were fixed in the first shooting round. Their regressions are `tests/combat.js` sections 20 (shop) and 21
(combat), and both pass on the merged build.

| id | status | note |
|---|---|---|
| QA-STR-08 double shop discount | already-fixed | the content rule or the hook, never both |
| QA-STR-09 / CMB-02 ammo gives the weapon | already-fixed | `notOwned` refusal |
| QA-STR-14 megaphone / hot take start packs | already-fixed | |
| QA-STR-15 rampage_king reserve x1.5 | already-fixed | `ammoCap` |
| QA-C1-01 melee goons with no cooldown | already-fixed | wind-up, cooldown, two attackers at a time |
| CMB-01 rocket direct hit = WRONG TAKE | already-fixed | the wreck goes through `applyDamage` |
| CMB-03 hot mic ignores its rate | already-fixed | |
| CMB-04 first shot recompiles materials | already-fixed | the muzzle light exists from the first update |
| CMB-05 lock-on hijacks the shot | already-fixed | the shot goes where the crosshair rests. This round adds a parallax allowance close in (see below) |
| CMB-08 pickups switch the gun, ignore the cap | already-fixed | `collectPickup` returns `'skip'` |
| CMB-11 explosive kills give no marker | already-fixed | `blastCredit` |
| CMB-12 cooking: no fuse, blows up in the car | already-fixed | the Combat half. The fuse HUD is the UI's |
| CMB-14 head shots / pellet hits stats | already-fixed | |
| CMB-15 the shotgun is the slowest killer | already-fixed | shotgun 70 dmg |
| CMB-16 table-leg flip throws out of reach | already-fixed | |

## Round A/B/C/D

| id | status | where / what |
|---|---|---|
| QA-A-DRV-01 exit on the viaduct drops you into the sea | **fixed** | `Vehicle.exit` and `Ped._down` test whether the surface under the ped is the sea, not the ground tile. `_down` also fixes a line-order bug: a downed ped never fell off a ledge. Player now ends at y 7 on the deck (was -0.9, swimming) |
| QA-A-DRV-02 exit at the deck barrier lands on the street | **fixed** | `Vehicle.doorSpot` skips spots whose surface is more than 1 m below the car (3/3 cases on the deck) |
| QA-A-DRV-08 cars climb the 1.3 m wedge face | **fixed** | `Vehicle._wallStep` / `_keepWheels`: a wheel that rises more than 0.5 m in one step is a wall impact (unless it was over the sea or an edge). Wedge ramp faces, Loop ramps and kerbs are unchanged |
| QA-A-CAM-08 peds and cars pop in clear air | **fixed for cars**, not-mine for peds | `GTP.Entities.drawLimit(base)`: never cull before fog near + 85% of the band (cap 320 m); cars are drawn to about 240 m. **Models / vehicles ask:** `06c_animation.js` and `06b` replace `Ped.syncMesh` with their own 110 m cull. Have both call `GTP.Entities.drawLimit(C.QUALITY.pedDraw)` |
| QA-A-ENT-04 skid marks float or bury on slopes | **fixed** | `_surfaceFx` takes each mark's height from the ground under it (0 m off the ramp, was up to ±0.3 m). The decal is still flat (Render) |
| QA-A-ENT-09 swimmers lie on the water | not-mine | the swim body pose is drawn by the models track (`06c_animation.js` / `Ped.syncMesh`). The physics height is unchanged |
| QA-A-ENT-10 first-person headlights stay behind | **fixed** | `Vehicle.syncMesh` runs `Render.syncVehicle` for the player's hidden car. The body stays hidden; the spot sits 2 m ahead (was 42 m behind) |
| QA-A-ENT-02 | not-mine | `Ped.syncMesh` (models track) |
| QA-A-CAM-03 | not-mine | render |
| QA-B-FE-03 / QA-D SAVE-03 Enter that closes a menu also exits the car | not-mine | the root is that Enter is bound to both `enter` and `confirm` (`02_input.js`), and `30_game.js` runs `player.control` in the same step as the UI's confirm. The fix belongs in Input/Game (consume the confirm's paired actions), not in `Player.control` |
| QA-B-FE-04 | not-mine | input binding |
| QA-B-TCH-07 Tab in the shop opens an invisible wheel | **fixed** | `updateWheel` will not open (and closes) while `UI.state.shopOpen`, a UI modal, `Combat.shop.state.open` or `controlEnabled === false` |
| QA-B-TXT-06 the DEPLATFORMED card's fine differs from the charged fine | **fixed** (Combat half) | the fine is computed once at the bust into `Combat.death.fine`, and the respawn charges that number. **UI ask:** print `Combat.death.fine` on the card (`11_ui.js:1352`) |
| QA-B-TCH-13 `'full'` buys say "No sale." | not-mine | Combat already returns `reason: 'full'`. The message is `11_ui.js` `shopBuy` |
| QAC-07 hot mic / ratio meshes leak | already-fixed | cached cap and stencil geometry and material (round 1) |
| QAC-08 / QA-D-08 a GPU sphere leaks per throw | **fixed** (Combat half) | `skinProjectile` disposes the per-entity sphere it replaces, and `HotMic.destroy` frees the per-mic cap material. **Render ask:** the hot take keeps Render's own sphere (`10_render.js:1958 new SphereGeometry` per projectile). Cache it there |
| QAC-09 pickup label planes and materials leak | **fixed** | label materials per label, plane geometries per size and glow sprite materials per colour are shared (`userData.shared`) |
| QAC-11 dying in a cutscene | **fixed** (Combat half) | `onPlayerDeath` / `onPlayerBusted` call `Cutscenes.cancel()` first, so no `onDone`, letterbox or frozen camera after WASTED. **Cutscenes ask:** skip the wanted restore in `finish()` when the player is dead |
| QAC-17 | not-mine | render camera interpolation |
| QAC-22 | not-mine | world props |
| QAC-34 | not-mine | missions / strands |
| QAC-48 physics allocations | **fixed** | the hot loops use scratch objects and `_pushCircleInto`. Per step: `occupants()` 65 → 0, `pushCircle` 31 → 0, `yawToDir` 194 → 11 (the rest is other modules). Public `pushCircle` / `worldToLocal` / `occupants` keep returning fresh objects |

## Integration items from the coordinator

| item | status | note |
|---|---|---|
| `combat.js` wheel assertion with the merged arsenal | **fixed** (test) | the rifle slot shows its first weapon by price (`carbine` now). The test checks the slot and its first weapon |
| boss weak points get `hits:0` | **fixed** | The diagnosis showed the spools were being cut. The real fault: when the last spool (a hard, kind `'heli'` lock) fell, the camera stayed pitched at the sky and a held aim never re-locked, so Goldplate on the ground was never hit (`dmg`/`hits` in that log are damage *taken* by the bot). Now the end of a helicopter-kind lock sets `aim.relock`: the next target in the 20° cone is taken like a fresh press, and the pitch eases back to rest meanwhile. b01 and b02 complete |
| b03 still times out sometimes | partly mine | Close locks missed because of the 0.78 m shoulder camera (at 5 m the crosshair sits about 8° off a lock; the lock dropped past 10°, and the shot magnet was 3°). Both limits now widen by the parallax (`atan((side + 0.3) / distance)`: about 11° at 5 m, 3° at 20 m). The rest is the test bot backing away from melee adds into the sea, and jet-strip damage (bosses track, `tests/bosses.js:76`, `08b_bosses.js:1196`). In 3 isolated runs: 2 completed in about 190 s, 1 did not |
| `Combat.WEAPONS` must hold every parity id | **fixed** | all 37, with fitting behaviour: flashbang, flare gun, mute button, merch cannon, remote sticky, smoke, golf club launch, heavy slots, zoom, mobility |
| aimed rifle grip off (`leftToBarrel` 1.411) | **fixed** | `postSync` no longer re-places a held gun that the models track has parented to the `handR` bone. It only reads the hand positions for `handTargets`. `characters.js`: `leftToBarrel` 0.01, `leftAhead` 0.23 |
| actors `crash damage: 0` | **fixed** (test) | the test took the first `vehicle:impact` in the city (another car's) and lifted the throttle. It now filters to its own car |
| combat scope shot `dmg: 0` | **fixed** (test) | the merged world has water 40 m east of the arena, so the target was swimming. The test picks dry ground |
| combat shop `pistol rounds` | **fixed** | rounds (and attachments) for a gun the player owns are never mission-locked. The content tables give the pistol two different unlock missions (`parity` m01c, `expansion.shop` m03b) |

## Other tracks' failures in the merged full run (`tests/all.js`)

Evidence: the merged run log (copied in the final report). None are in my files:
- `audio`: "every SFX name makes a voice; failed: phoneRing" (vehicles/audio).
- `campaign`: "no marker for m01b_airport: m01c_both_sides" (story/content chain).
- `events`: the mod shop opens twice, as `spin_doctor_strip` and `spin_strip` (systems / vehicles).
- `feel`: the save lists `m01b_airport` as completed, which the test does not expect (story). It fails the same way with the original `06_entities.js`.
- `interiors`: "without an armory UI the prompt asks to confirm the purchase" (interiors).
- `missions`: "17 base missions (25 with the expansion), got 17 / 61" (content/story).
- `newplayer`: the m00/m01 chain and the armory entry are missed by the bot (story / interiors). The `pistol` / `aim` steps follow from those.
- `perf`: 347 steps/s (target 600). A profile shows `World.resolveCapsule` (1.2 s per 1800 steps) and vehicle world collision dominating. Combat's share is 0.3 s, `fillPose` 0.36 s. The QAC-48 allocation fix helps on the margin.
- `vehicles`: "the jet ski leans into the turn with the rider on it" (vehicles; it fails the same way with the original `06_entities.js`).
- `bosses` b03: see above (test bot / balance).
- `saves`: "missions, flags, best times and the next light come back: m01c_both_sides" (story/saves).
- `story`: "m01_van: the GPS and the call go to the next story mission" with `next: null` (story chain).
- `strands`: "braking on the start line for a second starts the race" with `inCar: false` and no racers (strands).
- `strangers`: "strand run problems" (strangers).
- `systems`: the `tables` assertion on the golf course and tickers (systems).
- `ui`: "the mattress ad runs at minute 20 on every station" (ui / radio).
- `ui_v03`: "a paint previews through Vehicles.mod, BUY pays and emits shop:buy" with `money1` unchanged (ui / vehicles mod shop).

That run was the merged build before this round's fixes: 13 of 32 files passed, 19 failed. `actors` and `combat`, which
were mine, pass now. `bosses` b01 and b02 pass now.
