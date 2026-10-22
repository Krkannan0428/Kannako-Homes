# Systems track: final report (v0.3.0)

Branch `v03/systems`. Files: `js/14_systems.js`, `tests/systems.js`. Notes: `docs/v03/systems.md` (interfaces, decisions,
wrappers). Triage: `docs/v03/triage_systems.md`.

## What ships

Properties with daily income and safehouse saves; the stock market; golf at Goldplate Links; achievements; the stats
page model; cheats; two jobs (Damage Control and Hot Take Brigade); clothing, outfit and barber purchases; save v4 entries.

All of it reads the real `GTP.Content.parity` tables (no duplicate fallback data) and the real APIs of the UI,
interiors, world doors and saves:
- **Golf:** the world track's `tee1..9` / `pin1..9` points, the parity green fee and score names, and `golf.hud()` for the UI panel.
- **Property cards:** they open on `property:open`.
- **Ownership:** `Systems.owns(id)` answers the world's safehouse and garage doors.
- **Saves:** the `sys_*` entries ride in the v4 save `registry`.

## Fixed in the final rounds

- **Integration round 1:**
  - The "tables" assertion failure: the module and test now follow parity's counts (26 achievements, 8 cheats, 11 properties).
  - Golf points relative to the course door, then the world's tee and pin points.
  - Parity hazard names.
  - The cheat effects, the job schema, achievement triggers, clothing style and colour, and the stockApp fee.
  - The UI's call names and the `funds` reason.
  - Safehouse interiors gated on ownership.
  - `wanted:cleared` emitted, since nobody else emits it.
  - The camera snaps behind the golfer.
- **Second adversarial review:**
  - `wanted:cleared` false positives (after a retry, an abort, or a load).
  - The spawn cheat with no road in reach.
  - A job counting only in its own vehicle.
  - Wrecked job vehicles.
  - The golf panel closing on reset or load.
  - No window throws from a job vehicle.
  - Wind relative to the aim.
  - The fireproof damage types.
  - Outfit unlocks.
  - The maxed-car stat.
  - A cheaper `properties.get`.
  - A removed patient.
- **Last fix:** a parked job truck 140 m away changed the AI spawner's random draws and made `tests/events.js`'s scheduler check fail. Job vehicles now exist only within 100 m of their spot, and every spawn restores `GTP.rng`.

## Test results

- **On the integrated build** (`origin/game/grand-theft-pundit` at `10ba585`, merged into this branch):
  - `tests/systems.js`: **PASS** (10 sections, no `GTP.errors`).
  - `tests/content_audit.js`: **OK** (0 hits).
- **Full `tests/all.js`:** 14 of 32 files pass. To check the failures, I ran the same failing files on the integration
  branch without my latest commits (a separate worktree whose only difference is my four files). **All 17 other
  failing files fail there too, with the same first assertion:**
  - actors / crash damage, flaky: it passed when re-run on my branch.
  - audio / phoneRing.
  - bosses / b01.
  - campaign / m01b marker.
  - characters / rifle grip.
  - combat / scoped shot.
  - feel / save markers.
  - interiors / rack meshes.
  - missions / 17 of 61.
  - newplayer.
  - saves / next light.
  - story / GPS after m01.
  - strangers.
  - ui / mattress ad.
  - ui_v03 / mod-shop paint.
  - vehicles / jet ski lean.
  - events / duplicate `modshop:open`.

  None of them are in my file.
- **`tests/perf.js`** sits just under its floor on this machine either way: the base measured 562 steps/s run alone and my
  branch 549 to 597 against the 600 floor. My module's update costs 0.009 ms a step (0.4% of step time).

## Still open (other tracks' files, evidence in docs/v03/systems.md)

- **UI wardrobe (`11_ui.js`):**
  - After a buy, the UI rebuilds `player.look` from parity: the shoe colour is lost, `look.hair` becomes the barber item id (`cut_mohawk`), and "Natural" hair colour reverts.
  - `stores` and `barks` show up as barber categories.
  - The outfits and the none hat or glasses never appear.
- **UI elsewhere:**
  - The end-of-round golf banner names the round total as if it were one hole.
  - Hidden achievements are checked as `secret` instead of `hidden`.
  - No job HUD reads `jobs.state()`.
  - `Systems.markers()` is not appended to the minimap.
- **Interiors:** the safehouse bed has no sleep cooldown, so it can farm property income.
- **Input:** no gamepad `action` binding, so jobs cannot start on a pad. Typing a cheat that contains P pauses the game.
- **Content and world:** the parity clothing store `lanyard_strip` differs from the world's `lanyard_downtown`.
- **Golf balance:** the parity holes are short (27 to 73 m on the world's points), so a precise player finishes well
  under par. The prize is capped at $500 a round.
