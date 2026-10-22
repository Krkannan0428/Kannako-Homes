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

## Round 2 on game/grand-theft-pundit a94bf77 (the coordinator's merge of every track)

- **artifact.js** ("no alert/confirm/prompt"): not the UI. The only match in `dist/artifact.html` is a comment in
  `js/30_game.js` (line 329 at a94bf77): `// a key the UI took as its confirm (Enter, Space) ...`. The test's regex reads
  `confirm (` as a call. The line came in with the story track's commits 5af7a1d / 03642c9 (it is not at 69478b9, where
  artifact.js passed). The pause-SAVE "overwrite an unreadable slot" question is the in-game `askConfirm` modal (no native
  dialog anywhere in `11_ui.js` / `02_input.js`). Fix: reword that comment (e.g. "its confirm key (Enter, Space)" ->
  "the key it confirmed with"); 30_game.js is not this track's file.
- **radio.js** ("the ticker names the song and artist on music stations"): the ticker now asks the station's
  `nowPlaying` feed first (23_content_radio getters), then an object from `GTP.Audio.radio.nowPlaying()` (its string is
  skipped), and a song line reads `NOW PLAYING: Title  ·  Artist  ·  Station`. `stationColor` already used `station.color`
  (the two new stations get their own colours). `tests/ui.js` already counts the stations (`nap.length === stations`).
  `tests/ui_v03.js` sets the feeds through their setters and restores them with `null`.
- **Bosses**: weak points were already labelled from `entity.label` (`targetLabel`) and skipped by the minimap's
  helicopter blips; `boss:end` clears the bar; the bar greys and shows the shield text. Now also: `shieldText` from the
  `boss:phase` payload, PHASE n / N announced again (08b skips its banner under the UI's bar), and `GTP.UI.drawsBossShield`
  / `handlesBossEnd` set so 08b's caption and bar clearing stand down.

## Test results (current head)

All runs on the merged build (v03/ui with game/grand-theft-pundit 10ba585), Chromium via Playwright, `NODE_PATH=/opt/node-tools/node_modules`.

| Test | Result |
|---|---|
| `tests/content_audit.js` | PASS (239 files, 0 hits) |
| `tests/ui_v03.js` | PASS (every v0.3 screen on the real modules) |
| `tests/ui.js` | PASS (the v0.2 UI suite, incl. the minute-20 mattress ad on all six stations) |
| QA-B regressions (`tests/regress/qa_b_*.js`, mirror with the v0.3 helper fixes, see `triage_ui.md`) | every UI-owned test passes on the current code: FE-01..05, FE-12, HUD-01, HUD-03, HUD-08, HUD-10, NP-01, NP-02, NP-04, NP-05, TCH-01..06, TCH-08, TCH-11, TCH-12, TXT-07 (TCH-04 / TCH-09 / FE-06 through mirrors with the v0.3 tab order / the drawn glyph). Still failing, other tracks': FE-08, NP-03, TCH-07, TXT-01 (content line length), TXT-02/03/05/09/10, TXT-04 (test harness), TXT-08 (content `castIds`). |
| `tests/newplayer.js` | Flaky in this container: across four runs of the same build the bot passes title, story start, GPS, m00, m01_van, armory, cover and save in most runs; m01c fails in every run (its first objective is a walk to the armory door, which auto-enters the interior; `v03r1/story` reports m01c reworked and newplayer 12/12 on its branch). A/B on the same build: this branch 8/12 (m01c not started from its light this time, so no pistol / aim), the integration UI 9/12 (m01c started, then stuck; manual save not reached). Visual check of the flow (screenshots): title (v0.3.0), opening, first objective with the GPS line and arrow, the call, the armory with the INDOORS minimap and no outdoor GPS, aim / cover prompts, the save. |
| `tests/all.js` (at 5a4eb69, before the last round of fixes) | 32 files, 15 pass (ai, artifact, content_audit, content_parity, cover, cutscenes, feel2, perf, radio, render, smoke, tune, ui, ui_v03, world), 17 fail. The failures are other tracks' (no UI file in them; actors, combat and events re-run with the integration branch's `11_ui.js` / `02_input.js` swapped in fail identically): actors (crash damage), audio (the test's own rate-limited phoneRing / gps cue), bosses (b01 not beaten), campaign / feel / saves / story (the m01b / m01c chain), characters (rifle grip), combat (scoped shot), events (two mod-shop opens), interiors (rack meshes), missions (count with the expansion), newplayer (see above), strands (race start), strangers (strand runs), systems (tables), vehicles (jet ski lean). Most also failed in the coordinator's merged run (`docs/v03/merge1_all*.log`); ui and ui_v03 failed there and pass now. |


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
