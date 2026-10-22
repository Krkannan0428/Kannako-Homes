# Interiors track: integration round 1 triage

Build: `v03/interiors` = `game/grand-theft-pundit` at `65dc2b7` (fast-forward; the earlier interiors work was
already merged) plus the interiors fixes on top. Only `js/13_interiors.js`, `tests/interiors.js`,
`docs/v03/interiors.md` and this file were edited.

## QA bugs pointing at the interiors files

I searched `qa_r1_bugs.json`, `qa_a.json`, `qa_b.json`, `qa_c.json` and `qa_d.json` (253 entries) for
`13_interiors`, `interiors.js` or `Interiors.` in hint / file / fix / evidence / repro. **None point at the
interiors files.** I also read the entries whose title mentions the armory, the range, Merle, a shop or a
door; they belong to other tracks:

| Id | Status for interiors | Owner and reason |
|---|---|---|
| QA-B-TCH-07 (Tab in the shop opens an invisible weapon wheel) | not mine | `08_combat.js` updateWheel. Inside the armory the v0.3 UI owns Tab (full catalog). |
| QA-B-TCH-10 (portrait shop RANGE tab under EXIT) | not mine | `11_ui.js` v0.2 shop page layout. |
| QA-B-TCH-13 (buying a full item says only "No sale.") | not mine; the in-world prompt is already fixed | `11_ui.js` shopBuy. The in-world prompt (no-UI builds) already names `full` as "Full". |
| QA-B-TXT-05 / QA-B-TXT-08 (Merle's pitch price, credits) | not mine | Content and UI. |
| QA-B-HUD-06 (Both Sides Arms drawn twice on the map) | not mine | `11_ui.js` map labels. |
| QA-STR-08, CMB-15 (shop discounts, shotgun numbers) | not mine | `08_combat.js` / `09_missions.js`. |

## Failures in my files on the merged build: fixed

1. **`tests/interiors.js`: "racks stocked with every weapon ... missing megaphone, flare_gun, ..."** (the merged
   arsenal is 57 weapons; the walls held 45 slots). **Fixed at the root:** the armory now hangs the whole
   catalog once each, grouped by class: east wall rifles / LMGs / shotguns; the back feature wall snipers /
   launchers / specials; the west pegboard SMGs / melee; pistols in the main glass counter; throwables in the
   islands. Guns are sized from their own mesh bounds, overflow spills into the next suitable area, and price
   tags use one atlas. The test asserts every catalog weapon present, no repeats, and at least 90% in their
   class's area. Screenshots re-checked: `int_armory_counter`, `int_armory_east_rack`, `int_armory_west_rack`,
   `int_armory_back_wall`, `int_armory_player`, `int_armory_port`, `int_armory_uptown`.
2. **The counter called `UI.openArmory({store, ...})`**, but the merged UI's signature is
   `openArmory(storeId, weaponId)`. Fixed.
3. **Double fallbacks with the merged UI**: the outfit and haircut fallbacks ran on top of the UI's wardrobe
   screen, and the DOM fade ran on top of the UI's fade. Both are now detected (`UI.openWardrobe`,
   `UI.openArmory`) and skipped.
4. **The safehouse bed** now goes through `GTP.Systems.properties.sleep(id)` (the systems track asked for this).
   An unowned safehouse emits `property:open`.
5. **The range for the UI and bots**: `range:start` carries `medals`, `GTP.Interiors.range.hud()` feeds the
   UI's range HUD, and `GTP.Interiors.range.targets` exposes the targets with a chest-height anchor and
   `up`/`down` flags (tests/newplayer.js reads them).
6. **New-player path: no HUD arrow inside the armory.** The story's `range` and `buy` objectives have no point,
   so the arrow and the bot had nowhere to go. A `Missions.objectiveTarget` wrapper now points at the range
   line or at Merle while inside, and at the exit door for an objective out in the city.
7. **New-player path: the green Both Sides Arms light opened the v0.2 page instead of the armory.** Fixed with a
   `Combat.shop.open` wrapper that applies only to Combat's own light trigger (the player standing in that
   store's light). Direct calls still open the page, which keeps `campaign.js`'s shop purchase working.
   Evidence: `tests/newplayer.js` step 7 `armory` now **passes** on this branch ("inside ...") and fails
   with the interiors stub.

`tests/interiors.js` section 9 drives `m01c_both_sides` on the merged build: walk in through the door, the
free pistol in hand, the arrow to the range line, bronze (69 points) by aiming at the hecklers, the arrow to
Merle, E opens the armory card. It passes.

## Cross-track bug found while verifying the new-player path (not in my files)

**`m01c_both_sides` cannot be completed: its last objective is impossible.** The objective is
`{type:'buy', item:'ammo_pistol'}`, but `Combat.catalog()` reports `ammo_pistol` as `locked: true`,
`lockReason: "Unlocked by Free Sample"`, so `Combat.buy('ammo_pistol')` returns
`{ok:false, reason:'locked'}`. The ammo is locked until the very mission that asks the player to buy it.

- Evidence: `tests/interiors.js` section 9 prints the NOTE line with the lock reason. The scratch run returned
  `{"ok":false,"reason":"locked","item":{"unlock":"m01c_both_sides","id":"ammo_pistol",...,"lockedBy":"Free Sample"}}`.
- Root cause: ammo inherits the weapon's unlock mission (`pistol` → `m01c_both_sides` in
  `js/25_content_parity.js`), and `js/08_combat.js` locks ammo for a weapon the player already owns.
- Suggested fix (shooting track): an ammo box is never locked when the player owns the weapon. Alternatively
  (content track), the pistol's unlock moves to `m01_van`.
- Impact: the tutorial stalls at "Buy a starter box of pistol rounds", so the story chain after `m01c` never
  opens.

## Full `tests/all.js` on the merged build (this branch)

31 files: 16 ok (actors, ai, artifact, audio, content_audit, content_parity, cover, cutscenes, feel2,
**interiors**, perf, radio, render, smoke, tune, world) and 15 failing. To check that none of the 15 is
caused by the interiors module, I reran all 15 in a copy of this branch with `js/13_interiors.js` replaced
by the original stub. **All 15 fail with the same assertion and the same values without the interiors
code**, so they belong to the tracks below. (`audio.js` failed once with `phoneRing,gps` and passed on the
rerun: flaky.)

| Test | Assertion (identical with the stub) | Likely owner |
|---|---|---|
| bosses | b01_goldplate not beaten in 360 s (`hits: 0` on the spools, `dmg pistol:goldplate 436`) | bosses |
| campaign | "m01b_airport started by walking into its light": no marker, because `m01c_both_sides` now sits between `m01_van` and `m01b_airport` | story / content (the test predates the chain change) |
| characters | aimed rifle: `gripY 2.75`, `leftAhead -0.1` | models |
| combat | an unowned wheel segment `[` does not step off (`index 6 carbine` → `5 smg`) | shooting |
| feel | "saved with m00..m02 done (m03 lit)": markers now include `m01c_both_sides` | story (chain change) |
| missions | "17 base missions (25 with the expansion), got 17 / 61" | story / content (count after parity) |
| newplayer | missing gps_first (no `World.route` until round 2), m01_van not completed in 442 s, then everything after it; with the stub `armory` is missing as well | world (route), story (m01_van) |
| saves | the next light after load: `m01c_both_sides` | story (chain change) |
| story | m01_van: no GPS / call to the next story mission (`next: null`) | story |
| strands | the race does not start (`inCar: false`) | world / missions (strands) |
| strangers | "strand run problems" | strangers |
| systems | the tables check (golf course `points: {}`: no tee / pin points until the world track) | systems / world |
| ui | the mattress ad at minute 20 on every station | ui / radio |
| ui_v03 | the mod shop paint BUY did not pay (`money1 20000`, `applied: null`) | ui / vehicles |
| vehicles | the jet ski lean (`r -0.42`) | vehicles |

## Expected change for the UI track

`tests/ui.js` section 9 stands in the green Both Sides Arms light and expects the v0.2 shop page. On this
branch that light walks the player into the armory, as the plan describes and as `08_combat.js`'s own comment
expects ("the interiors track's armory replaces the green light with the door itself"). On this run `ui.js`
failed earlier, at the mattress ad, so it never reached that section. When it does, the expectation should
become "standing in the light enters the armory; Merle's counter or `armory:inspect` opens the armory card".
Setting `GTP.Interiors.shopLightEnters = false` restores the old behaviour if integration prefers it.
