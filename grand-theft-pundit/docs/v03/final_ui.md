# UI track (`js/11_ui.js`, `js/02_input.js`): final state for v0.3.0

Branch `v03/ui`, merged with `game/grand-theft-pundit` 10ba585 (the latest integration head; `git merge` reports it up to
date). Details: `docs/v03/ui.md` (screens, the real APIs each one reads, decisions) and `docs/v03/triage_ui.md` (all 73
QA findings that point at this track).

## Done in the final round

- **Integration with the real modules** (no sample payloads left on the main path): the heist board from the `heist:board`
  payload (ids `Heist.setPlan` knows, up to four crew), interiors (store names, `openArmory({store})`, the range countdown
  / medals / moderator penalty, `UI.interiorFade` so the DOM fade stands down), combat (`Combat.buy(id, {store})`,
  attachment toggling, tint colours, cover / counter / vault / peek prompts from `Combat.hud()`, boss weak-point labels,
  boss hp on the lock-on bar), vehicles (family, heading in degrees, lean / wheelie, parachute states, the real mod catalog
  and `buyMod`), systems (property card with SLEEP & SAVE, stocks, golf drawn from `Systems.golf.state()` with no swing of
  its own, the stats page, hidden achievements, wardrobe / barber through `Systems.wardrobe` / `Systems.barber`, systems'
  map markers), bosses (`drawsBossBar` / `drawsSpecials`, shield and hint text, `boss:start` / `boss:end`), radio (the
  string `nowPlaying` ignored), strangers (purple `?` markers and phone rows from the real strand data).
- **Indoors** the HUD stops navigating the city (INDOORS minimap card, no GPS chip / objective arrow / long-range labels);
  in golf the bottom belongs to the swing meter.
- **Coordinator's items**: the mattress ad runs at minute 20 on every station (`tests/ui.js` passes with six stations);
  mod shop BUY through `Vehicles.buyMod` (`tests/ui_v03.js` passes); the title shows v0.3.0 (`GTP.VERSION` in
  `00_util.js` is still 0.2.0); tutorial hints clear once acted on (h_aim on aim or fire), at once in a vehicle for the
  on-foot ones and after 4.5 s at most; the AIM / FIRE tutor retires on the first aim or shot and never shares the row
  with GET IN / TAKE COVER; no new-game toast over the opening.
- **QA triage**: 63 fixed, 8 already fixed, 2 wontfix (root cause in other tracks), 0 open — see `triage_ui.md`.
  This round's fixes beyond round 1 include: hover / keyboard selection (FE-02), pad A on dialogue and held buttons across
  a context switch (FE-05), key-first hints on pad / touch (HUD-02), map zoom on the player (HUD-07), readable labels
  (HUD-13), touch close / skip / scroll (TCH-01, TCH-02, TCH-09), pad SHOUT / HOTTAKE (TCH-06), shop messages (TCH-13),
  route back-off (QAC-25), unreadable slots on pause SAVE (SAVE-05), slot decoding (SAVE-18), the pending-cutscene save
  gap (SAVE-06), minigame pause (SAVE-14), credits (TXT-08), and a GET IN prompt for NP-04.

## Test results (current head)

RESULTS_PLACEHOLDER

## Still open (outside this track's files; evidence in `ui.md` / `triage_ui.md`)

- `14_systems.js`: `table('clothing')` lists `parity.clothing`'s keys as items (the UI filters them out and sells the
  content list); the barber stores `st.style || st.id` while parity styles carry `hair`.
- `09_missions.js` reads `parity.heist` (two approaches) while the content defines `parity.heists.hedge_job` (three).
- `00_util.js` `GTP.VERSION` = 0.2.0; `24_content_expansion.js` `h_taxi` gamepad glyph Y (exits the car) and `castIds`
  without the v0.3 cast.
- QA's regression helpers need v0.3 updates (`qa_b_lib_fe.js` pause index and the first-launch opening; tab indexes in
  `qa_b_tch_04` / `qa_b_tch_09`); listed in `triage_ui.md`.
- QA-A-CAM-08 (ped / car pop-in before the fog): the cull ranges in `01_config.js` and the hard toggle in
  `06_entities.js` / `06c_animation.js` (a distance fade there is the fix).
