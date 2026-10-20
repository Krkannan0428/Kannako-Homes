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
  | office_hours | 4 | 122 | 4.8 | 3 | boom-bap vamps (i7 to IV7), descending sequences, a half-time ii v i, drop-outs |
  | loop_174 | 4 | 192 | 4.4 | 8 | intro, snare-roll build, drop, bell breakdown, second build, a lifted second drop |

- **Talk radio.** WAIL 101 carries the call-in show *Uproar at Large* with host Thad Uproar: seven segments (Open
  Lines (One Side), Ask a Fulcrum Fellow, The Hoax Hour, HOA Hotline, Sponsor Confessional, The Weather Is an
  Opinion, The $PUNDIT Trading Desk), each with an intro, five calls and an outro. `GTP.Content.radio.callin` has the
  structured data. WAIL's `dj` is a getter that returns the current segment's lines, framed by the GDD DJ lines. It
  rotates every game hour, so the existing ticker shows the show with no UI change. `djAll` lists every line.
- **Hourly news.** Bulletins follow story progress. `news.byFlag` has 24 story flags and `news.byMission` has 10 v0.3
  missions (bosses, heist, `m01c_both_sides`), placed in story order by `news.order`. `news.start` covers the time
  before any progress, and `news.intros` gives one opener per station voice.
  `GTP.Content.radio.bulletin(stationId, hourKey?, progress?)` returns `{station, hour, stage, headlines[3], intro,
  text}`: two headlines from the latest beat reached and one from an earlier beat, rotating by hour. The plain
  `ticker` array still works (36 lines after the expansion appends its 12).
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
- `nowPlaying(id)` returns `{station, song, title, artist, section, shift, bar, bars, pos}`, for a future
  "now playing: Title by Artist" line.
- `cue(id, k)` starts song k now, or at the next retune if the station is off air.
- `segment(hourKey?)` / `segmentIndex(hourKey?)` give the call-in segment on air. `callin` holds the show data.
- `news`, `bulletin(...)`, and the `radio:news` event (payload = the bulletin).
- `errors`: authoring problems found while compiling the songs. It is always empty, and the tests assert that.
- Stations carry `color` (the UI may use it instead of its own id → colour map) and `district` (campus / loop) as hints.
- **UI ticker feed (integration round 1, the shapes `docs/v03/ui.md` reads).** All are non-enumerable getters on
  each station:
  - `station.nowPlaying`: `{kind:'song', id, title, artist, section}` on music stations, `{kind:'show', id, title:
    'Uproar at Large: <segment>', text, host}` on WAIL 101 (`RADIO.onAir(id)`).
  - `station.bulletins`: `[{text, headline, stage, hour}]`, the story-reactive bulletin for this game hour in the
    station's voice. The UI shows it as `NEWS hh:00` in the first 3 minutes of the hour.
  - `station.callers` (WAIL 101 only): `[{caller, text}]` from the segment on air (`RADIO.callers(hourKey?)`). WAIL's
    `dj` now carries only the host's lines for the segment, because the calls arrive as CALLER lines.
  - The Nap Dynasty ad is on all six stations (`napAd`, minute `napMinute` = 20).

Consumed:

- `GTP.Audio.radio.state()` `{id, talkBar}`: today's engine bar counter, read by the pattern view. If it is missing,
  a wall-clock bar count stands in.
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
  `station.nowPlaying`, and the engine returns only a station string. While a station plays, the wrapper returns
  `RADIO.onAir(id)` with `toString()` set to the engine's text, so string users (`tests/audio.js`' `/Pennant/` check,
  concatenation) keep working. When nothing plays, it returns `''` as before. Integration can move this into
  `03_audio.js` (return `GTP.Content.radio.onAir(st.id)`) and drop the wrapper.

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
  names: Thad Uproar, DJ Skimmed Abstract, MC Posted Limit, The Atrium Quartet, Ten Karat Sax, The Ribbon Cutters,
  DJ Spreadsheet, The Quarterly Earnings, Rumble Strip, Merge Left, Hazard Lights, syllabus (unread), lanyard.wav, 4B
  beats.

## Listening notes (how the patterns were checked)

`tests/radio.js` measures each station. Current values:

- **distinct bars**: wail 36/72, pennant 93/164, velvetine 87/175, quiet 50/76, office 64/122, loop 95/192.
- **longest run of identical bars**: 1 to 3.
- **drum-pattern variety**: 13 to 24 distinct drum bars (quiet: 3).
- **strong-beat melody notes on chord tones**: 87 to 98% per station. The rest are passing tones, sus4 resolutions and 6ths/9ths
  on smooth jazz and ambient.

Every song renders through the engine audible and with a varying envelope, and no two songs on a station render
alike.

**Headroom.** `Audio.render` sums voices raw, before the engine's music bus (gain 0.6 at full level) and its
compressor.
- **Raw peaks**: 0.5 to 0.97 for most songs. Loop 174's drops reach about 1.05 (house kick plus clap, sawtooth bass
  and square stabs together).
- **In game**: at most about 0.63 into the compressor, so nothing clips.
- **What the test asserts**: every song's opening, which is the window `tests/audio.js` renders (6 s, or 14 s on
  WAIL), stays under 0.995; the whole render stays under 1.25.

I removed kick/snare coincidences from the WAIL bumpers, which use the loudest kit, and from the roll bars. I also
trimmed the 16th-note clap rolls in the Loop 174 builds and the pad overlap in two half-time songs. While writing, I fixed every line that clashed with its chord: a siren riff a whole step off, a reese
stab over the wrong chord, hold-music dings landing on the wrong bar.

## Tests

```
cd grand-theft-pundit
node tests/content_audit.js
NODE_PATH=/opt/node-tools/node_modules node tests/radio.js
NODE_PATH=/opt/node-tools/node_modules node tests/audio.js   # the engine's own test, still green with this data
```

`tests/radio.js` has four parts:

1. Data, in node with no browser: schema, songs, monotony metrics, the live view against a simulated engine counter,
   news stages, call-in rotation, and every runtime string run through `tests/content_audit.js` (its own patterns,
   on a virtual file).
2. A headless game boot. R cycles through all six stations. At the top of the hour in a car, `radio:news` fires
   once, and never on foot. The real UI ticker then shows `NOW PLAYING: title  ·  artist`, `NEWS 14:00: <station
   voice>…` and, on WAIL, `ON AIR: Uproar at Large: …` plus `CALLER: … on the line: …`.
   `Audio.radio.nowPlaying()` returns the song object, and `String()` of it is still the station text.
3. A live page (`headless=0`, a click unlocks audio): each station plays in a car for 6 to 10 real seconds through
   the current engine.
4. Offline renders of all 26 songs.

## Known issues / for integration

- **`tests/ui.js` asserts `nap.length === 4`** (its Nap Dynasty minute check loops over every station). With six
  stations it needs `>= 4` or `=== stations.length`. Both new stations' `napAd` lines match `/Nap Dynasty|mattress/i`,
  so only the count fails. That file belongs to the ui track.
- **`11_ui.js` `stationColor`** maps only the four GDD ids, so the new stations fall back to cyan. Stations now
  carry `color`.
- **Engine owner (vehicles track):** keep `Audio.radio.state().talkBar` and `.id`, or read `timeline(id)` natively.
  If `talkBar` disappears, the view falls back to a wall clock, which can be up to a lookahead (0.18 s) off at a
  section boundary.
- **No real semitone key changes and no per-song tempo** in today's engine: one bpm per station. Songs vary feel
  through half-time drums, shuffle and bossa instead.
- **Two wrappers to fold in at integration:** `GTP.Audio.update` (the `radio:news` event) and
  `GTP.Audio.radio.nowPlaying` (the song or show object). See "Wrappers" above.
- **Integration round 1** (merged `game/grand-theft-pundit` at 65dc2b7): every station plays on the merged engine in
  `tests/radio.js` parts 3 and 4, and `tests/audio.js` passes. The full-suite triage is in `docs/v03/triage_radio.md`.
