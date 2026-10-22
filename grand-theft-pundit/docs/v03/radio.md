# v0.3 radio track

Branch `v03/radio`. Owns `js/23_content_radio.js` and `tests/radio.js`. No other file is edited.

## What was built

- **Six stations.** The four GDD stations keep their ids, order, names, taglines, bpm, scales, GDD ads and DJ lines
  (each now has 16 ads and 14 DJ lines or more), plus two new ones:
  - `office_hours`, **Office Hours 90.1 "Beats to Not Read To"**. Lo-fi study beats for the campus. 102 bpm, dorian,
    soft kit, heavy swing (0.22), a sine "electric piano" playing seventh-chord arpeggios, a round triangle bass.
    DJ Skimmed Abstract.
  - `loop_174`, **Loop 174 "Legally a Party"**. Drum and bass and breakbeats for the Loop. 174 bpm, minor, straight,
    two-step and amen-style breaks, a rolling sawtooth bass, square stabs, bell breakdowns. MC Posted Limit.
- **Songs instead of one loop.** Every station has a rotation (`station.songs`). WAIL has 6 bumpers, the others have
  4 songs each. Each song has 3 to 6 sections (intro, verse, chorus, bridge, breakdown, build, outro) arranged by a
  `form` string, with fills before section changes and key shifts. A station runs 2.5 to 6 minutes before it repeats.

  | station | songs | bars | minutes | key shifts | what it does |
  |---|---|---|---|---|---|
  | wail_101 | 6 | 72 | 2.9 | 0 | brass bumpers (four bars) + eight bars of talk, a different stinger note per bumper |
  | pennant_fm | 4 | 164 | 5.9 | 7 | smooth sax theme, a bossa with a 3-2 clave, a half-time slow jam, a swung shuffle |
  | velvetine_888 | 4 | 175 | 5.7 | 4 | deep house: groove, stabs, breakdown, a build, then the drop does not come |
  | quiet_signal | 4 | 76 | 5.1 | 2 | ambient: hold-music chimes, a dial tone over moving chords, arpeggios, a clock tick |
  | office_hours | 4 | 124 | 4.9 | 3 | boom-bap vamps (i7 to IV7), descending sequences, a half-time ii v i, a drop-out |
  | loop_174 | 4 | 196 | 4.5 | 8 | intro, snare-roll build, drop, bell breakdown, second build, a heavier second drop |

- **Talk radio.** WAIL 101 carries the call-in show *Uproar at Large* with host Thad Uproar: seven segments (Open
  Lines (One Side), Ask a Fulcrum Fellow, The Hoax Hour, HOA Hotline, Sponsor Confessional, The Weather Is an
  Opinion, The $PUNDIT Trading Desk), each with an intro, five calls and an outro. `GTP.Content.radio.callin` has the
  structured data. WAIL's `dj` is a getter that returns the host's lines for the segment on air, framed by the GDD DJ
  lines, and `callers` carries the calls. Segments rotate at minute 5 of every game hour, after the top-of-the-hour
  bulletin (a change at minute 0 took the bulletin's only ticker slot). `djAll` lists every line.
- **Hourly news.** Bulletins follow story progress. `news.byFlag` has 24 story flags and `news.byMission` has 11
  missions (bosses, heist, `m01c_both_sides`, `m03_ratio`), placed by `news.order` in the order of the real story
  chain (`GTP.Content.parity.chain`; `tests/radio.js` plays the chain and checks every beat leads its bulletin).
  `news.start` covers the time before any progress, and `news.intros` gives one opener per station voice.
  `GTP.Content.radio.bulletin(stationId, hourKey?, progress?)` returns `{station, hour, stage, headlines[3], intro,
  text}`: two headlines from the latest beat reached and one from an earlier beat, rotating by hour. The plain
  `ticker` array still works (36 lines after the expansion appends its 12, 45 after the parity merge).
- **Parity radio merged.** `js/25_content_parity.js` (content track) loads after this file and carries
  `parity.radio {ticker, ads, dj, news}`, which nothing displayed. `mergeParity()` runs once on first use (news,
  ticker, the Audio.update wrapper): `news[missionId]` joins `byMission`, ads are appended (`napAd` stays valid),
  ticker and DJ lines that tell a boss or heist outcome stay off air until that mission is done (regex gates), the rest
  join the rotation, and near-duplicates of lines already on a station are skipped (`paritySkipped` lists them: four
  news lines that repeat a radio headline and one Pennant DJ line).
- **More copy.** About 90 new ads and 80 new DJ lines across the six stations, 12 more ticker lines, 61 news
  headlines and 35 calls.

## Interfaces

Exposed on `GTP.Content.radio` (all existing fields are kept: `napMinute`, `defaultStation`, `stations`, `ticker`,
`barks`, `failTexts`, `station(id)`, `barksFor(role, district)`, streets):

- `stations[i].pattern`: the v0.2 schema, unchanged (`steps, bass, lead, chords, drums, swing, wave, sustain`, plus
  `talk` on WAIL and `jingle` on Pennant). It is a **live view**: each lane is a getter that returns the bar now playing.
  New hints: `kit` ('march' | 'soft' | 'house' | 'break' | 'none') and `transposeBass: false` (every bar is absolute).
- `stations[i].songs`: `[{id, title, artist, bars, form, sections}]`. A section is `{bars, chords[], bass[][16],
  lead[][16], drums:{kick[][16], snare[][16], hat[][16]}, relBass, swing?, sustain?, wave?}`. In `form`, `X^n` plays
  X shifted n scale degrees and `X!` puts the song fill on the last bar.
- `timeline(id)`: the flat bar list in rotation order. Each bar is shaped like `pattern`, plus `song`, `section`,
  `shift`, `fill`, `bar`. `songStarts(id)` gives the index of each song's first bar.
- `nowPlaying(id)` returns `{station, song, title, artist, section, shift, bar, bars, pos}`. An unknown id returns
  null (the song helpers no longer fall back to WAIL 101; `station(id)` keeps its fallback for barks and the ticker).
- `cue(id, k)` starts song k now (on WAIL 101 at the start of the next 12-bar bumper/talk cycle, so the engine's talk
  phase stays on the song's talk section), or at the next retune if the station is off air.
- `segment(key?)` / `segmentIndex(key?)` give the call-in segment on air (`segmentMinute` = 5). `callin` holds the
  show data; `callers(key?)` the parsed calls.
- `mergeParity()`, `paritySkipped`, `lastRender` (station id → song indices the last radio render sequenced).
- `news`, `bulletin(...)`, and the `radio:news` event (payload = the bulletin).
- `errors`: authoring problems found while compiling the songs. It is always empty, and the tests assert that.
- Stations carry `color` (the UI may use it instead of its own id → colour map) and `district` (campus / loop) as hints.
- **UI ticker feed (integration round 1, the shapes `docs/v03/ui.md` reads).** All are non-enumerable getters on
  each station. Assigning a value overrides a feed (a mission or a test can put its own lines on air), and assigning
  `null` restores the live one. Do not `delete` a feed: that removes the live getter itself until reload.
  - `station.nowPlaying`: `{kind:'song', id, title, artist, section}` on music stations, `{kind:'show', id, title:
    'Uproar at Large: <segment>', text, host}` on WAIL 101 (`RADIO.onAir(id)`), and null while the engine is silent
    (parachute, `radio.stop()`).
  - `station.bulletins`: `[{text, headline, stage, hour}]`, the story-reactive bulletin for this game hour in the
    station's voice. The UI shows it as `NEWS hh:00` in the first 3 minutes of the hour.
  - `station.callers` (WAIL 101 only): `[{caller, text}]` from the segment on air (`RADIO.callers(hourKey?)`). WAIL's
    `dj` now carries only the host's lines for the segment, because the calls arrive as CALLER lines.
  - The Nap Dynasty ad is on all six stations (`napAd`, minute `napMinute` = 20).

Consumed:

- `GTP.Audio.radio.state()` `{id, talkBar, playing, live}`: today's engine bar counter, read by the pattern view.
  While the engine is on air but not sequencing (`playing && !live`: muted, no or suspended AudioContext, headless)
  the song carries on by the wall clock, so the ticker does not freeze on one title. Loaded with no engine (node,
  tools) the wall clock stands in; it is not phase-locked to an engine's step grid.
- `GTP.Audio.radio.isPlaying()` and `current()`, `GTP.game.time`, `GTP.game.player.inVehicle`, and
  `GTP.Missions.state.flags` / `.completed`, used by the news.
- `GTP.UI.ticker(text)` is called only when the UI declares it has no bulletin support (`GTP.UI.radioNews === false`).
  The v0.3 UI reads `station.bulletins` itself.

## Wrappers installed on another module

- **`GTP.Audio.update`** is wrapped at load time, guarded by `GTP.Audio._radioNewsWrapped`. After the original runs,
  `newsTick()` checks for a game-hour turnover. When the hour turns while the player is in a vehicle with the radio on,
  it emits `radio:news` (the bulletin) once, for an engine news sting. Clock jumps (loads, `setClock` to mid-hour) are
  ignored. Since integration round 1 the UI shows the bulletin from `station.bulletins`, so the wrapper no longer pushes
  ticker lines (unless `GTP.UI.radioNews === false`).
- **`GTP.Audio.radio.nowPlaying`** is wrapped, guarded by `GTP.Audio.radio._radioWrapped`. The UI asks it before
  `station.nowPlaying`, and the engine returns only a station string. While a station plays, the wrapper returns a
  plain string built from the station's `nowPlaying` feed (so an assigned override shows): `Title  ·  Artist  ·
  <engine text>`, or `Uproar at Large: <segment>  ·  <engine text>` on WAIL.
  The UI shows it as an ON AIR line that changes with every song and segment. When nothing plays, it returns `''`.
  - **Why it returns a string:** an earlier version returned the `onAir` object with a custom `toString()`. That broke
    `tests/audio.js`, because Playwright serializes the object without the function, so its `/Pennant/.test()`
    threw.
  - **For integration:** to get the UI's NOW PLAYING tag with the structured object, the UI should prefer
    `station.nowPlaying` over `Audio.radio.nowPlaying()`. Alternatively, `03_audio.js` could return
    `GTP.Content.radio.onAir(id)` and update its test. Then this wrapper can go.

- **`GTP.Audio.render`** is wrapped, guarded by `GTP.Audio._radioRenderWrapped`. `render('radio')` tunes and
  sequences a station offline, so the getters saw its bar counter restart and moved the live song. The wrapper
  snapshots the view state and restores it afterwards (scheduling inside render is synchronous), and records which
  songs the render sequenced in `lastRender`. Other render kinds pass straight through.
- All three wrappers call into whichever radio module is in `GTP.Content.radio` now, so a second load of the file
  (a dev reload, a test) does not leave them bound to the first one.

## Decisions

- **Keep the engine schema byte for byte; get structure through getters.** I don't own `03_audio.js`, and its
  sequencer reads `radio.pat = station.pattern` once per tune, then reads `P.bass[s]`, `P.chords[bar % len]`,
  `P.drums`, `P.swing`, `P.sustain` and `P.wave` on every step. So `pattern` is an object of getters keyed off the
  engine's own bar counter (`state().talkBar`, which counts bars since the tune and restarts at a retune). Each getter
  returns the current timeline bar, and `chords` is returned as `[c,c,c,c]` so the engine's step-phase bar index can't
  disagree with ours. Today's engine plays full songs with no change. An engine that knows songs should read
  `timeline(id)` / `songs` and ignore `pattern`.
- **A retune starts the next song**, as if the station had played on while you were away. On a first tune it starts
  at song 0. No randomness, so nothing touches `GTP.rng`.
- **Key changes are diatonic shifts.** The engine fixes a root (`ROOTS[index % 4]`) and a scale per station, so a
  semitone modulation can't be expressed in data. `X^n` moves bass, lead and chords n scale degrees. Each shift was
  chosen so the shifted progression avoids the diminished triad (major: degree 6; minor: degree 1; dorian: degree 5).
  Examples: Pennant's chorus IV V vi I goes up a fifth to V vi I ii, the bossa verse lifts a step, Loop 174's second
  drop lifts a third. An engine that wants true semitone modulation could add a `semitones` hint later.
- **Tempo and kit.** Today's engine picks the kit from bpm (>= 118 house, > 100 soft, else march). Lo-fi sits at
  102 bpm so it gets the soft, dark kit, not the bright march snare. That is chillhop tempo, laid back by 0.22 swing
  and a half-time song. Loop 174 at 174 bpm gets the house kit (long kick, clap), which works for breakbeats. Each
  station also carries a `kit` hint for an engine that wants to choose.
- **Velvetine has no drop, on purpose** (GDD: "deep house with no drop"). Every song builds with snare rolls, then
  plays one near-empty bar (section `N`) and carries on. "The Drop Is Coming (It Is Not)" builds twice.
- **WAIL bumpers are exactly 12 bars** (4 music + 8 talk), so the engine's `cycleBar % 12` talk cycle and the song
  boundaries line up. The talk section's lead carries the stinger notes at bars 4 and 8, and doubles as a quiet bed for
  engines without a talk mode. `tests/audio.js`' bumper-vs-talk loudness check still passes.
- **Quiet Signal stays ambient**: no kick or snare, only a clock-tick hat in two pieces, long overlapping chimes, and
  a dial tone held over moving chords ("in the key of beige").
- **Story-reactive news is data plus a pure function.** Headline sets are keyed by flag (or `mission:<id>`). The
  latest beat reached in `news.order` leads. v0.3 missions that may not set a flag are keyed by completion.
- **Call-in exchanges are single self-contained lines**, because the UI ticker indexes `dj` non-sequentially
  (`dj[floor(n / 7 + slot) % len]`). A two-line exchange would be split.
- **Copy was drafted by a subagent against GDD sections 4, 8 and 9 and CONTENT_RULES.md, then reviewed.** I swapped
  out a gun-range ad on the campus station, and rewrote two Quiet Signal lines that were not passive voice. Invented
  names: Thad Uproar, DJ Skimmed Abstract, MC Posted Limit, The Gold Hard Hat Quartet, Ten Karat Sax, The Ribbon
  Cutting Committee, DJ Column C, The Quarterly Earnings, Painted Median, The Zipper Merge Society, The Shoulder Lane
  Social Club, syllabus (unread), lanyard.wav, 4B beats.
- **Final-round content review.** Three Pennant FM items pointed at a real politician (a self-named for-profit
  university, a gold escalator in a tower atrium, well-done steak with ketchup) and were replaced with invented
  self-naming gags (plaques, doormats, a ribbon cutting). Artist names that sat close to real acts ('Rumble Strip',
  'The Atrium Quartet') and generic ones that may exist were renamed to in-world names. Headlines now match their
  missions: the heist is the Hedge Job at Vaultwright Capital, the yacht does play music, the undercard is at the
  stadium, the show is renamed "The Goldplate Hour with Goldplate", the invoice is signed "Respectfuly", the roof sign
  counts 2. The Lower Loop is open (GDD_EXPANSION 1.3).

## Listening notes (how the patterns were checked)

`tests/radio.js` measures each station. Current values:

- **distinct bars**: wail 34/72, pennant 96/164, velvetine 87/175, quiet 50/76, office 64/124, loop 95/196.
- **longest run of identical bars**: 1 to 3.
- **drum-pattern variety**: 12 to 25 distinct drum bars (quiet: 3).
- **strong-beat melody notes on chord tones**: 87 to 98% per station. The rest are passing tones, sus4 resolutions and 6ths/9ths
  on smooth jazz and ambient.

Every song renders through the engine audible and with a varying envelope, and no two songs on a station render
alike.

**Headroom.** `Audio.render` sums voices raw, before the engine's music bus (gain 0.6 at full level) and its
compressor.
- **Raw peaks**: 0.48 to 0.98 for most songs. Loop 174's `speed_limit` drop reaches about 1.05 (house kick plus
  clap, sawtooth bass and square stabs together). The engine's `hiss()` also leaks a one-sample click on some hat
  steps (vehicles track, see `final_radio.md`).
- **In game**: at most about 0.63 into the compressor, so nothing clips.
- **What the test asserts**: every song's opening, which is the window `tests/audio.js` renders (6 s, or 14 s on
  WAIL), stays under 0.995; the whole render stays under 1.25.

I removed kick/snare coincidences from the WAIL bumpers, which use the loudest kit, and from the roll bars. I also
trimmed the 16th-note clap rolls in the Loop 174 builds and the pad overlap in two half-time songs. The final round's
listening pass (three listener agents, every edit checked against the chords and the test metrics) moved shrill leads
out of the 1.2 kHz+ octave on WAIL, Pennant and Loop 174, made the shuffle and bossa idiomatic, gave Velvetine an
audible bass, and cleared pad smear on Quiet Signal and the Velvetine breakdown. `final_radio.md` lists every change. While writing, I fixed every line that clashed with its chord: a siren riff a whole step off, a reese
stab over the wrong chord, hold-music dings landing on the wrong bar.

## Tests

```
cd grand-theft-pundit
node tests/content_audit.js
NODE_PATH=/opt/node-tools/node_modules node tests/radio.js
NODE_PATH=/opt/node-tools/node_modules node tests/audio.js   # the engine's own test; its radio checks pass (it stops on the vehicles track's phoneRing/gps rate-limit check)
```

`tests/radio.js` has four parts:

1. Data, in node with no browser: schema, songs, monotony metrics, the live view against a simulated engine counter
   (including an on-air cue on WAIL keeping the 12-bar talk phase), the wrappers (installed once, following a reloaded
   module, overrides reaching the nowPlaying string, silence while the engine is silent), news stages, the real story
   chain played in order with every content file loaded, the parity merge and its gates, the feeds' shapes and the
   minute-5 segment rotation, and every runtime string plus every composed ticker line (on-air titles, WAIL dj and
   callers per segment, every bulletin) run through `tests/content_audit.js` (its own patterns, on a virtual file).
2. A headless game boot. The radio key (N, pad X) cycles through all six stations. At the top of the hour in a car,
   `radio:news` fires once, and never on foot. The real UI ticker shows `ON AIR: title  ·  artist  ·  station`,
   `NEWS 14:00: <station voice>…` and, on WAIL, `ON AIR: Uproar at Large: …` plus `CALLER: … on the line: …`. Feed
   overrides reach the ticker and null restores them; the Nap Dynasty ad runs at minute 20 on every station;
   `station.bulletins` follows the live mission state; and a 30-second real-time run on WAIL shows the 14:00 bulletin
   in its slot and the next segment after minute 5.
3. A live page (`headless=0`, a click unlocks audio): each station plays in a car for 6 to 10 real seconds through
   the current engine.
4. Offline renders of all 26 songs on a fresh headless page (no AudioContext, so the engine's noise RNG is not
   disturbed between renders and the peaks repeat run to run); a render leaves the live song where it was, and each
   render sequenced only the cued song.

## Known issues / for integration

- **`tests/ui.js` asserts `nap.length === 4`** (its Nap Dynasty minute check loops over every station). With six
  stations it needs `>= 4` or `=== stations.length`. Both new stations' `napAd` lines match `/Nap Dynasty|mattress/i`,
  so only the count fails. That file belongs to the ui track.
- **`11_ui.js` `stationColor`** maps only the four GDD ids, so the new stations fall back to cyan. Stations now
  carry `color`.
- **Engine owner (vehicles track):** keep `Audio.radio.state().talkBar`, `.id`, `.playing` and `.live` (required),
  or read `timeline(id)` natively. Without `talkBar` the view falls back to a `Date.now()` bar count that is not
  phase-locked to the engine's step grid: bars change at an arbitrary sixteenth inside the engine's bar, a retune no
  longer starts the next song, and WAIL 101's bumper/talk sections drift out of the engine's `cycleBar % 12` cycle.
- **No real semitone key changes and no per-song tempo** in today's engine: one bpm per station. Songs vary feel
  through half-time drums, shuffle and bossa instead.
- **Three wrappers to fold in at integration:** `GTP.Audio.update` (the `radio:news` event and the parity merge),
  `GTP.Audio.radio.nowPlaying` (a plain string: song or show, then the station) and `GTP.Audio.render` (keeps the live
  song through offline renders). See "Wrappers" above.
- **For the ui track:** prefer `station.nowPlaying` over `Audio.radio.nowPlaying()` in `tickerNext` to get the NOW
  PLAYING tag; let `stationColor` fall back to `station.color`; restore test overrides with `= null`, not `delete`
  (`tests/ui_v03.js`).
- **For the cutscene/vehicles tracks:** `station:<id>` cutscene music is silent when the scene is on foot, because the
  engine only plays the radio in a vehicle (`cs_twist`, `cs_ending_a`).
- **Integration rounds** (merged `game/grand-theft-pundit` at 65dc2b7, then 10ba585): every station plays on the
  merged engine in `tests/radio.js` parts 3 and 4, and the radio checks of `tests/audio.js` pass. The full-suite triage
  is in `docs/v03/triage_radio.md`; the final round is in `docs/v03/final_radio.md`.
