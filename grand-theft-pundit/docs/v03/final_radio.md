# Radio track: final round (v0.3.0)

Branch `v03/radio`. Owns `js/23_content_radio.js`, `tests/radio.js`, `docs/v03/radio.md` (the full design notes), and
this file. No other track's file was edited.

## Review process

1. **Findings.** A multi-agent review covered:
   - the pattern view and song compiler;
   - the news, feeds and wrappers;
   - content;
   - `tests/radio.js`;
   - integration with the merged engine and UI.

   It produced 42 findings, each with a reproduction script and a concrete fix. Its verification stage and the music
   listeners hit the account usage limit, so I verified each finding against the source myself before applying it.
2. **Listening.** Three listener agents then reviewed the six stations through the engine's synthesis code and offline
   renders. Each proposed edits with exact strings and measured peaks. I checked every edit against the chords and the
   test metrics and applied them all:
   - WAIL and Quiet Signal: 13 edits;
   - Loop 174 and Office Hours: 13 edits;
   - Pennant FM and Velvetine: 8 changes, 12 edits plus the optional slow-jam hat tweak.

## What is fixed

**Code (`js/23_content_radio.js`)**

- **Hourly news on WAIL 101.** The bulletin now shows on WAIL 101, the default station.
  - Before: every hour at minute 0, the call-in segment changed. Its new ON AIR line took the UI's only bulletin slot,
    so the bulletin never showed on WAIL.
  - Now: segments rotate at minute 5 (`segmentMinute`). A 30-second real-time test shows the 14:00 bulletin in its
    slot and the next segment after it.
- **cue() on WAIL.** On the talk station, `cue()` now keeps the engine's 12-bar bumper/talk phase.
  - Before: a cue on air played the brass bumper under the murmur, and the talk bed as music.
  - Now: the song starts at the next 12-bar cycle.
- **No fallback to WAIL on a typo.** `timeline`, `songStarts`, `nowPlaying` and `cue` no longer fall back to WAIL 101
  on an unknown station id.
- **Offline renders.** `Audio.render('radio')` no longer moves the live song.
  - A new wrapper snapshots and restores the view state around each render.
  - `lastRender` records which songs a render sequenced.
- **Muted or headless play.** The song keeps advancing by the wall clock while the engine is on air but not
  sequencing (muted, no AudioContext, headless). The ticker no longer freezes on one title.
- **nowPlaying.** The engine's nowPlaying string is now built from the station's own `nowPlaying` feed, so an assigned
  override shows. The feed returns null while the engine is silent (parachute, `radio.stop()`).
- **Reloads.** All three wrappers call whichever radio module is current, so a second load of the file does not freeze
  song titles or the news state.
- **Content-track radio data merged.** `GTP.Content.parity.radio` (46 lines nobody displayed) is merged on first use.
  - Its mission news joins `byMission`.
  - Its ads are appended, so `napAd` stays valid.
  - Ticker and DJ lines that reveal a boss or heist result stay off air until that mission is done.
  - Near-duplicates are skipped and listed in `paritySkipped`: 4 news lines and 1 DJ line.

**News content (now true to the missions)**

- **Order.** `news.order` follows the real story chain: `m01c_both_sides` comes before `m01b_airport`, and
  `m03_ratio` gets its own beat. A test plays `GTP.Content.parity.chain` in order and checks that each mission's beat
  leads its bulletin.
- **Heist.** The heist headlines describe the Hedge Job at Vaultwright Capital, not a Monday Memo print-works raid.
- **b02_velvetine.** The yacht does play music, and the guests like it.
- **b06_panel.** The undercard happens at the stadium.
- **Show name.** The show is "The Goldplate Hour with Goldplate".
- **m05b.** The table goes on loan to the hedge maze.
- **Scooter invoice.** It is for 400 scooters and is signed "Respectfuly".
- **Roof sign.** It counts 2.
- **Timing.** "Pre-viral" now arrives with the van, not before it.
- **m10.** The pellet delivery lands at the HOA Hall.
- **m01c_both_sides.** It gives a free pistol ("bullets are the business model").

**Content rules**

- **Real-person pointers.** Three Pennant FM items pointed at a real politician and were replaced with invented
  self-naming gags (plaques, doormats, a ribbon cutting):
  - a self-named for-profit "university";
  - a "Gold Escalator" song;
  - well-done steak with ketchup.
- **Artist names.** Names close to real acts were renamed to in-world names: "Rumble Strip", "The Atrium Quartet",
  and some generic names that may exist.
- **Lower Loop.** It is now "open", matching GDD_EXPANSION section 1.3.
- **Near-duplicates.** Four near-duplicate lines on the same ticker were replaced.

**Music**

- **WAIL 101.** The hotline, breaking and top-of-the-hour bumpers move into the brass register (E5, not E6 beeps),
  end on real cadences, and have stingers that resolve.
- **Quiet Signal.** Sustain 2 on the two pieces that change chord every bar cuts the pad smear. The balloon piece's
  key change no longer reaches 2.3 kHz.
- **Loop 174.**
  - Square leads move out of the shrill octave.
  - Climaxes shift down instead of up, so the reese keeps its weight.
  - `four_stars` gains a breakdown and build.
  - The `speed_limit` build drops the bass before the drop, and its stabs sit with the bass rhythm.
  - Every song's full render now stays under 1.1. Before, `speed_limit` reached 1.12 and `lower_loop` 1.15.
- **Office Hours.**
  - A keys-only drop-out in "Didn't Do the Reading".
  - Seventh-chord keys in "Lot C Raccoon".
  - No tritone bass leap on F#dim in "Finals Week".
- **Pennant FM.**
  - "Both Tens" now really shuffles: the sax and hats play long-short on the "a" of each beat under a light swing.
    Before, the engine's swing (which only delays odd 16ths) missed every off-beat note.
  - The bossa plays the bossa clave instead of the son clave.
  - The slow jam's four-times-repeated phrase gets an answering phrase (V2), and its hats skip the click positions.
  - The theme's climax moves to the dominant's chords an octave lower, keeping the sax in range. Before, it reached
    1.76 kHz and thinned the bass.
- **Velvetine.**
  - Station sustain goes from 0.45 to 0.9, so the off-beat bass is audible: it was a 60 ms blip under a 0.32 s kick.
  - The spreadsheet breakdown's pads no longer stack all seven notes of the scale.
  - The reading's last note is a chord third, not a tritone.
  - Session No. 9's key lift keeps the bass in octave 2.

**Tests (`tests/radio.js`)**

- **Deterministic renders.** Offline renders run on a fresh headless page. The old version rendered on the live page,
  so the engine's noise RNG made the opening-peak check fail in about 1 run in 7.
- **New checks:**
  - feed shapes, setters and null-restore, on the ticker too;
  - the nowPlaying wrapper and its overrides;
  - wrappers installed once and following a reloaded module;
  - an on-air WAIL cue keeping the talk phase;
  - unknown station ids;
  - the story chain driving the news, and the parity merge and its gates;
  - the minute-5 segment rotation;
  - the Nap Dynasty ad at minute 20 on all six stations' tickers;
  - `station.bulletins` following the live mission state (flags plus the completed Set);
  - the real-time WAIL bulletin;
  - the content audit run on 1,200+ composed ticker lines (on-air titles, WAIL dj and callers per segment, every
    bulletin), not only the atomic strings.

## Still open (outside this track, or by design)

- **`tests/audio.js` (vehicles track).** It fails on `every SFX name makes a voice; failed: phoneRing,gps`. Both cues
  are rate-limited by `MIN_GAP` because the v0.3 wiring section plays them just before. Its radio checks (station
  cycling, the nowPlaying string, the in-car sequencer) pass.
- **Engine hat click (vehicles track, `js/03_audio.js` `hiss()`).** Hats on odd sixteenths produce a one-sample click
  of about 0.9–1.0 in raw renders. The likely cause is that the gain node starts at 1 before the envelope takes over.
  It may click in game. `tests/radio.js` avoids flakiness by rendering on a deterministic page.
- **`tests/ui.js` (ui track).** It hard-codes `nap.length === 4`. All six stations run the Nap Dynasty ad at minute 20,
  and `tests/radio.js` now checks that on the ticker.
- **`js/11_ui.js` (ui track).**
  - `stationColor` ignores `station.color`, so the two new stations get cyan.
  - `tickerNext` asks `Audio.radio.nowPlaying()` before `station.nowPlaying`, so songs show under the ON AIR tag,
    not NOW PLAYING.
  - `tests/ui_v03.js` restores its feed overrides with `delete`, which removes the live getter until reload. It should
    assign `null`.
- **Cutscene music (cutscenes/vehicles tracks).** `station:<id>` cutscene music (`cs_twist`, `cs_ending_a`) is silent
  when the scene is on foot, because the engine only plays the radio in a vehicle.
- **By design.** Key changes are diatonic shifts, and there is one tempo per station, because the engine fixes a root,
  a scale and a bpm per station.

## Test results (final, on `v03/radio` with the latest `origin/game/grand-theft-pundit` merged)

- **`node tests/content_audit.js`**: OK, 239 files scanned, 0 hits.
- **`NODE_PATH=/opt/node-tools/node_modules node tests/radio.js`**: PASS (98 s).
  - **Stations:** WAIL 34/72 distinct bars, Pennant 96/164, Velvetine 87/175, Quiet 50/76, Office 64/124, Loop
    95/196.
  - **Variety:** longest identical run 1 to 3 bars; strong-beat chord tones 87 to 98%.
  - **Rotation length:** 2.9 to 5.9 minutes per station before it repeats.
  - **Rendered peaks:** song openings 0.42 to 0.97 (limit 0.995); full songs 0.48 to 1.05 (limit 1.25, which is 0.63
    after the engine's 0.6 music bus).
  - **WAIL real time:** `13:57 ON AIR … The Hoax Hour`, `14:00 NEWS 14:00: WAIL 101 NEWS…`, then `14:14 ON AIR … HOA
    Hotline`.
- **`NODE_PATH=/opt/node-tools/node_modules node tests/audio.js`**: FAIL on `every SFX name makes a voice; failed:
  phoneRing,gps`. That is the vehicles track's rate-limit issue described above. Its radio assertions before that
  point pass: the radio is logically on in a car, the radio key moves stations, and `nowPlaying` names the station.
- **Full suite.** The last full `tests/all.js` triage of the merged build is in `docs/v03/triage_radio.md`. No
  failure there is caused by the radio data.
