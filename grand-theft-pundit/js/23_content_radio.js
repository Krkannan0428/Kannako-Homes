/* Grand Theft Pundit: 23_content_radio.js
 * GTP.Content.radio: six stations (GDD section 8 plus two v0.3 stations), their
 * songs, ads and DJ lines, WAIL 101's call-in show, the hourly news bulletins
 * that follow story progress, the news ticker, ped and cop barks (GDD section
 * 9), the fail-screen texts, and the street names (GDD section 9) unless
 * 20_content_world.js already defined them. Data plus small helpers; loads
 * standalone (only needs window). Decisions: docs/v03/radio.md.
 *
 * Station pattern schema (played by GTP.Audio's radio sequencer, unchanged):
 *   pattern = {
 *     steps: 16,                  // sixteenth notes; one pattern is one bar
 *     bass:  [16 x degree|null],  // scale degree 0-7 (7 = octave) or rest
 *     lead:  [16 x degree|null],  // degree 0-14 (8-14 = the octave above)
 *     chords:[4 x root degree],   // one chord root per bar of a 4-bar phrase
 *     drums: { kick:[16 x 0|1], snare:[16 x 0|1], hat:[16 x 0|1] },
 *     swing: 0..0.3,              // delay of the off-16ths as a fraction of a step
 *     wave:  { bass:'square'|'sawtooth'|'triangle', lead:'sine'|'square'|'sawtooth'|'triangle' }
 *   }
 * Degrees index the station's `scale` (minor = natural minor, major, dorian).
 * Bass and lead degrees are absolute in the scale; `chords[bar]` is the pad
 * root for that bar. Optional hints the engine may ignore: `sustain` (note
 * length as a fraction of a step, >1 means overlapping pads), `jingle`
 * ({every seconds, notes[]}, Pennant FM only), `transposeBass` (shift bass by
 * chords[bar]), `talk` (a talk station: the pattern is its bumper, played for
 * four bars, then the host murmurs behind phone-line static for eight), `kit`
 * (the drum kit the genre wants: 'march'|'soft'|'house'|'break').
 *
 * v0.3 songs. Each station also has `songs`: [{id, title, artist, bars, form,
 * sections}], where a section is {bars, chords:[root per bar], bass, lead,
 * drums:{kick, snare, hat}, swing, sustain, wave} and every lane holds one
 * 16-step array per bar (already expanded, absolute degrees). `form` lists
 * section names in play order; 'X^n' plays X shifted n scale degrees (a key
 * change inside the station's scale) and 'X!' puts the song's fill on X's last
 * bar. GTP.Content.radio.timeline(id) is the flat list of bars in station
 * order, every bar shaped exactly like `pattern`. An engine that knows songs
 * reads the timeline; today's engine reads `pattern`, which is a live view:
 * each property is a getter that returns the bar now playing, found from
 * GTP.Audio.radio.state().talkBar (the engine's bar counter). A retune starts
 * the next song. All of this is plain data plus getters: no audio code here.
 *
 * Ads and DJ lines are never spoken: they scroll on the ticker strip. Every
 * station runs its Nap Dynasty ad at minute 20 of the game hour
 * (`napMinute`); `napAd` is the index of that line in each station's `ads`.
 * For the UI ticker every station exposes getters: `nowPlaying` ({kind:'song',
 * title, artist} or WAIL's {kind:'show', title, text}), `bulletins` ([{text}]:
 * this hour's story-reactive bulletin) and, on WAIL 101, `callers` ([{caller,
 * text}] of the call-in segment on air) with `dj` holding the host's lines for
 * that segment (segments rotate every game hour; `djAll` lists every line).
 * GTP.Audio.radio.nowPlaying() is wrapped to put the song or show title in
 * front of the engine's station text (still a plain string). News data: `news`;
 * GTP.Content.radio.bulletin() builds a bulletin and 'radio:news' fires at
 * the top of each game hour in a car. `ticker` stays a plain array. Every
 * string obeys CONTENT_RULES.md.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.Content = GTP.Content || {};

  var _ = null; // a rest, so the patterns read like a tracker

  // ------------------------------------------------------------ notation --
  // Lanes are written like a tracker: '0 . . 4 . . 7 .' (16 tokens: a degree or
  // '.' for a rest) and drums as 'x...x...x...x...' (16 chars). A lane is one
  // string (every bar) or a list of strings (one per bar, cycled).
  var R0 = '. . . . . . . . . . . . . . . .';
  var D0 = '................';

  // ------------------------------------------------------------ stations --
  var STATIONS = [
    // ================================================================ WAIL 101
    {
      id: 'wail_101', name: 'WAIL 101 "The Yell"',
      tagline: 'All outrage, all hours.',
      genre: 'brass stingers, march drums, phone-in static',
      bpm: 100, scale: 'minor', color: '#e04848', kit: 'march',
      swing: 0, sustain: 0.35, wave: { bass: 'sawtooth', lead: 'square' }, talk: true,
      ads: [
        'Nap Dynasty. Sleep like you\'ve never been wrong. Code TAKES20.',
        'Char & Charter. Steaks sized by donor tier. The salad is Bronze.',
        'Fulcrum Foundation. The numbers you were going to say anyway.',
        'Vaultwright Capital. We short what we love.',
        'Clarity Pellets. Ask your doctor. He won\'t say.',
        'Detail & Evidence. We clean cars and records. Mostly records.',
        'Char & Charter Brunch. Bottomless outrage, mimosas by donor tier. The fruit cup is Bronze.',
        'Fulcrum Foundation Summer Fellowship. Forty fellows. One opinion. Bring your own conclusion.',
        'Vaultwright Capital Retirement. Retire early. On somebody else\'s position.',
        'Clarity Pellets Extra Strength. Twice the stance. Your doctor won\'t tell you. He isn\'t allowed in the barn.',
        'Green Room Motel. Four hours of waiting, ninety seconds of fame, unlimited bagels. Hostility mandatory.',
        'Gus\'s Garage. We respray cars and opinions. Same price. Same color.',
        '$PUNDIT. The coin backed by takes. Trustless. Please trust us.',
        'Octane Opinions. Premium is regular with a stance. Fill up angry.',
        'Detail & Evidence. Spring special: three records cleaned for the price of two cars.',
        'Perpetual Assembly Plaza Gift Shop. The cause changed. The mugs didn\'t. Collect all one.'
      ],
      napAd: 0,
      djBase: [
        'Caller, you\'re on. You\'re wrong. Go.',
        'Next hour: is the next hour a hoax? We take calls, from one side.',
        'Our weather is also an opinion. Wrong.',
        'That was silence, sponsored by Nap Dynasty.',
        'That caller has been ratioed. Next caller, also ratioed. Pre-emptively.',
        'Coming up: five people agreeing loudly. Stay tuned for the disagreement. There isn\'t one.',
        'If you\'re just tuning in: you\'re late, and you\'re wrong.',
        'We\'ll take your calls after this brass sting. And this one. And this one.',
        'Reminder: this station has never been fact-checked. Fulcrum confirms. [citation pending]',
        'Traffic on the Loop: everyone is legally a party. Plan accordingly.',
        'Our screener asks one question: are you mad? Good. You\'re on.',
        'Next hour: what are they hiding? We don\'t know. That\'s what makes it a segment.'
      ],
      jingle: null,
      // Six bumpers, twelve bars each: four bars of brass and march drums, then
      // eight bars of talk (the engine murmurs; the talk section's lead gives the
      // stinger note on bars 4 and 8, and is a quiet bed on engines without talk).
      songs: [
        {
          id: 'yell_theme', title: 'The Yell (Main Theme)', artist: 'The WAIL Brass Desk',
          sections: {
            bump: {
              c: [0, 0, 5, 4], rb: true,
              b: ['0 . . . 0 . 0 . 0 . . . 4 . 0 .', '0 . . . 0 . 0 . 0 . . . 4 . 2 .', '0 . . . 0 . 0 . 0 . . . 4 . 0 .', '0 . 0 . 0 . . . 4 . 4 . 2 . 1 .'],
              l: ['7 . . 7 9 . . . 11 . . . 9 . 7 .', '7 . . 7 9 . . . 11 . 12 . 11 . 9 .', '12 . . 12 11 . . . 9 . . . 7 . . .', '11 . 11 . 11 . . . 8 . . . 11 . . .'],
              k: ['x.....x.x.......', 'x.....x.x.......', 'x.....x.x.......', 'x...............'], s: ['..x.......x..xxx', '..x.......x..xxx', '..x.......x..xxx', '..x.x.x.xxxxxxxx'], h: 'x.x.x.x.x.x.x.x.'
            },
            talk: 'TALK:7:11'
          },
          form: 'bump talk'
        },
        {
          id: 'hotline', title: 'Caller Hotline', artist: 'The WAIL Brass Desk',
          sections: {
            bump: {
              c: [0, -1, -2, -1], rb: true,
              b: ['0 . 0 0 . . 0 . 0 . 0 0 . . 4 .', '0 . 0 0 . . 0 . 0 . 0 0 . . 4 .', '0 . 0 0 . . 0 . 0 . 0 0 . . 4 .', '0 . 0 0 . . 0 . 0 . 0 . 4 . 4 .'],
              l: ['4 4 . 4 4 . . . 4 4 . 4 4 . . .', '3 3 . 3 3 . . . 6 . . . 3 . . .', '2 2 . 2 2 . . . 5 . . . 2 . . .', '1 . 3 . 6 . . . 6 . 7 . . . . .'],
              k: ['x.......x.......', 'x.......x.......', 'x.......x.......', 'x...............'], s: ['....x.......x...', '....x.......x...', '....x.......x...', '..x.x.x.x.x.xxxx'], h: ['x.xxx.xxx.xxx.xx', 'x.xxx.xxx.xxx.xx', 'x.xxx.xxx.xxx.xx', 'x.x.x.x.x.x.....']
            },
            talk: 'TALK:7:4'
          },
          form: 'bump talk'
        },
        {
          id: 'breaking', title: 'Breaking Outrage', artist: 'The WAIL Brass Desk',
          sections: {
            bump: {
              c: [0, -2, -4, -3], rb: true,
              b: ['0 . . . 0 . . . 0 . . . 0 . . .', '0 . . . 0 . . . 0 . . . 0 . . .', '0 . . . 0 . . . 0 . . . 0 . . .', '0 . . . 0 . . . 0 . 0 . 0 . 0 .'],
              l: ['7 7 7 . 5 . . . 4 4 4 . 2 . . .', '5 5 5 . 4 . . . 2 2 2 . 0 . . .', '3 3 3 . 2 . . . 0 0 0 . -2 . . .', '1 1 1 . 1 . . . 4 . . . . . . .'],
              k: ['x.......x.......', 'x.......x.......', 'x.......x.......', 'x.......x.......'],
              s: ['....x.......x...', '....x.......x...', '....x.......x...', '....x....xxxxxxx'],
              h: ['x...x...x...x...', 'x...x...x...x...', 'x...x...x...x...', 'x.x.x.x.x.x.x.x.']
            },
            talk: 'TALK:0:7'
          },
          form: 'bump talk'
        },
        {
          id: 'top_of_hour', title: 'Top of the Hour', artist: 'The WAIL Brass Desk',
          sections: {
            bump: {
              c: [0, 0, 3, 4], rb: true,
              b: ['0 . . . . . . . . . . . . . . .', '0 . . . . . . . . . . . . . . .', '0 . . . . . . . . . . . . . . .', '0 . . . 0 . . . 0 . . . . . . .'],
              l: ['7 . . . . . . . 7 . . . . . . .', '7 . . . . . . . 7 . . . . . . .', '10 . . . . . . . 10 . . . . . . .', '4 . . . 6 . . . 8 . . . . . . .'],
              k: 'x.......x.......', s: ['....x.......x...', '....x.......x...', '....x.......x...', '....x.......xxxx'], h: 'x.x.x.x.x.x.x.x.'
            },
            talk: 'TALK:7:0'
          },
          form: 'bump talk'
        },
        {
          id: 'weather', title: 'The Weather Is an Opinion', artist: 'The WAIL Brass Desk',
          sections: {
            bump: {
              c: [0, 3, 6, 2], rb: true,
              b: '0 . . 0 . . 0 . 0 . . 0 . . 0 .',
              l: ['4 . 5 . 7 . . . 4 . . . 2 . . .', '5 . 7 . 8 . . . 5 . . . 3 . . .', '6 . 8 . 10 . . . 8 . . . 6 . . .', '7 . . . 9 . . . 11 . . . 14 . . .'],
              k: 'x.....x...x.....', s: ['....x.......x...', '....x.......x...', '....x.......x...', '....x.......x.xx'], h: 'x.x.x.x.x.x.x.x.'
            },
            talk: 'TALK:9:4'
          },
          form: 'bump talk'
        },
        {
          id: 'one_side', title: 'From One Side (March)', artist: 'The WAIL Brass Desk',
          sections: {
            bump: {
              c: [0, 4, 0, 4], rb: true,
              b: '0 . . . 4 . . . 0 . . . 4 . . .',
              l: ['7 . 7 . 8 . 9 . 11 . 9 . 8 . 7 .', '8 . . . 11 . . . 8 . . . 4 . . .', '7 . 7 . 8 . 9 . 11 . 12 . 14 . 11 .', '11 . 10 . 8 . . . 11 . . . . . . .'],
              k: ['x...x...x...x...', 'x...x...x...x...', 'x...x...x...x...', 'x...............'], s: ['..x...x...x...xx', '..x...x...x...xx', '..x...x...x...xx', '..x.x.x.xxxxxxxx'], h: 'x.x.x.x.x.x.x.x.'
            },
            talk: 'TALK:11:7'
          },
          form: 'bump talk'
        }
      ]
    },

    // ============================================================== PENNANT FM
    {
      id: 'pennant_fm', name: 'Pennant FM "Ten out of Ten"',
      tagline: 'The President\'s station. Also the President\'s.',
      genre: 'sax synth, elevator chords, a jingle every 40 seconds',
      bpm: 112, scale: 'major', color: '#ffd400', kit: 'soft',
      swing: 0.2, sustain: 0.8, wave: { bass: 'triangle', lead: 'sawtooth' },
      ads: [
        'Goldplate Tower, by Goldplate. Floors ten through one hundred now leasing.',
        'Goldplate Links. Par ten. No refunds.',
        'Goldplate Water. Rated a ten by Goldplate.',
        'Goldplate Goldplate Stadium. Both words. Both tens.',
        'Nap Dynasty. Official mattress of Goldplate. Code TENOUTOFTEN.',
        'Goldplate Weather. Tomorrow: a ten.',
        'Goldplate Doormats. Your name, crossed out. His name, in gold. Wipe your feet on a ten.',
        'Goldplate Plaques. Every plaque says Goldplate. Some say it twice. All plaques a ten.',
        'Goldplate Cologne. Smells like a ten. Notes of hard hat and fresh ribbon.',
        'Goldplate Goldplate Memorial. Formerly St. Somebody\'s. Now a ten. Bandage coupon included.',
        'Goldplate Ribbon Co. There is always a ribbon. Every ribbon a ten.',
        'Goldplate Helicopters. A fleet of both. Each one a ten. Together a twenty, which is a ten.',
        'Goldplate Bottled Air. Breathe in a ten. Breathe out a nine. Breathe out less.',
        'Goldplate Hard Hats. As worn at every ribbon cutting. Rated a ten by the head inside.',
        'Goldplate Gate Ten. Every gate is Gate Ten. Your gate has changed. It is still Gate Ten.',
        'Goldplate Calendar. Every month renamed Goldplate. Twelve tens. Leap years get a bonus ten.'
      ],
      napAd: 4,
      dj: [
        'That track was a ten.',
        'Coming up: the same song. A ten.',
        'Traffic on Goldplate Avenue is Goldplate.',
        'The President has renamed this station. It\'s still Pennant. He renamed the name.',
        'That was the President\'s favorite song. He named it after himself. It was already named after him.',
        'Time check: ten o\'clock. It is always ten o\'clock on Pennant FM.',
        'Goldplate Weather: sunny, a ten. Rain is in the forecast, a nine, under protest.',
        'The President rates that sax solo a ten. The saxophone has been renamed Goldplate.',
        'Pennant FM: now on 101, 102 and 10. Mostly 10.',
        'Listener mail: "Is anything not a ten?" Yes. Your letter. A four.',
        'Goldplate Goldplate Stadium traffic: both words are backed up.',
        'That jingle was a ten. You\'ll hear it again in forty seconds. Also a ten.',
        'The helicopter count on the Tower holds at two. Analysts call it "both."',
        'Pennant FM has been renamed Pennant FM. Please update your presets. They are the same.'
      ],
      jingle: { every: 40, notes: [0, 2, 4, 7, 4] },
      songs: [
        {
          // smooth sax over I vi IV V verses and a IV V vi I chorus; the last two
          // choruses move to the dominant's chords (shift -3: V vi I ii, same pitch
          // classes as a fifth up, an octave lower so the sax stays in its range)
          id: 'ten_theme', title: 'Ten Out of Ten (Theme)', artist: 'The Goldplate Pops Orchestra',
          fill: { k: 'x.....x.x.......', s: '....x.......x.xx', h: 'x.x.x.x.x.x.....' },
          sections: {
            I: { c: [0, 4], rb: true, b: '0 . . . . . . . 0 . . . . . . .', l: [R0, '. . . . . . . . . . . . 2 . 4 .'], k: 'x.......x.......', h: '..x...x...x...x.' },
            A: {
              c: [0, 5, 3, 4], rb: true,
              b: ['0 . . 0 . . 4 . 0 . . 0 . . 4 .', '0 . . 0 . . 4 . 0 . . 0 . . 2 .', '0 . . 0 . . 4 . 0 . . 0 . . 4 .', '0 . . 0 . . 4 . 0 . 4 . 2 . 1 .'],
              l: ['. . 4 . 5 . 7 . . 9 . 7 . 5 . 4', '5 . . . . . 4 . 2 . . . 4 . . .', '. . 3 . 4 . 5 . . 7 . 5 . 3 . 2', '4 . . . . . . . 1 . 2 . 4 . . .'],
              k: 'x.....x.x.......', s: '....x.......x...', h: '..x...x...x...x.'
            },
            A2: {
              c: [0, 5, 3, 4], rb: true,
              b: ['0 . . 0 . . 4 . 0 . . 0 . . 4 .', '0 . . 0 . . 4 . 0 . . 0 . . 2 .', '0 . . 0 . . 4 . 0 . . 0 . . 4 .', '0 . . 0 . . 4 . 0 . 4 . 2 . 1 .'],
              l: ['. . 4 . 5 . 7 . . 9 . 7 . 5 . 4', '5 . . . 7 . 5 . 4 . . . 2 . . .', '. . 3 . 4 . 5 . . 7 . 9 . 10 . 9', '7 . . . . . 6 . 4 . . . . . . .'],
              k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x...x.x.x...x.'
            },
            B: {
              c: [3, 4, 5, 0], rb: true,
              b: ['0 . . 0 . . 0 . . 0 . 0 . . 4 .', '0 . . 0 . . 0 . . 0 . 0 . . 4 .', '0 . . 0 . . 0 . . 0 . 0 . . 4 .', '0 . . 0 . . 4 . 0 . 4 . 2 . 1 .'],
              l: ['7 . . 7 . . 9 . 10 . . . 9 . 7 .', '8 . . 8 . . 6 . 4 . . . 6 . 8 .', '9 . . . 12 . 9 . 7 . . . 5 . 7 .', '7 . . . . . . . 4 . . . 2 . . .'],
              k: 'x.....x.x.....x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.'
            },
            Br: {
              c: [1, 4, 0, 5], rb: true, sus: 0.65,
              b: '0 . . . 4 . . . 0 . . 0 . . 4 .',
              l: ['1 . 3 . 5 . 8 . . 7 . 5 . 3 . .', '4 . 6 . 8 . 11 . 10 . 8 . 6 . 4 .', '7 . . . 9 . 11 . 14 . . . 11 . 9 .', '9 . 7 . 5 . 2 . . . . . . . . .'],
              k: 'x.......x.......', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx'
            },
            O: {
              c: [0, 3, 0, 0], rb: true, b: '0 . . . . . . . 0 . . . . . . .',
              l: ['7 . . . 4 . . . 2 . . . 0 . . .', '. . 3 . 5 . 7 . . . . . . . . .', '9 . . . . . 7 . . . . . . . . .', '7 . . . . . . . . . . . . . . .'],
              k: ['x.....x.x.......', 'x.....x.x.......', 'x.......x.......', 'x...............'], s: ['....x.......x...', '....x.......x...', D0, D0], h: '..x...x...x...x.'
            }
          },
          form: 'I A A2 B A A2! B Br! B^-3 B^-3! O'
        },
        {
          // bossa: a 3-2 clave on the rim, root-fifth bass, a stepwise melody; the
          // last verse lifts a step (shift 1)
          id: 'ribbon_cutting', title: 'Ribbon Cutting (Bossa)', artist: 'The Gold Hard Hat Quartet',
          swing: 0.08, sustain: 0.7,
          fill: { k: 'x..x....x..x....', s: 'x..x..x...x.xxxx', h: 'x.x.x.x.x.x.x.x.' },
          sections: {
            I: { c: [0, 0], rb: true, b: '0 . . 4 4 . . . 0 . . 4 4 . . .', k: 'x..x....x..x....', s: 'x..x..x...x..x..', h: 'x.x...x.x.x...x.' },
            A: {
              c: [0, 1, 2, 1], rb: true, b: '0 . . 4 4 . . . 0 . . 4 4 . . .',
              l: ['4 . . 4 . . 2 . . . . . 4 . . .', '5 . . 5 . . 3 . . . . . 1 . . .', '6 . . 6 . . 4 . . . . . 2 . . .', '5 . . . 3 . . . 1 . . . . . . .'],
              k: 'x..x....x..x....', s: 'x..x..x...x..x..', h: 'x.x...x.x.x...x.'
            },
            A2: {
              c: [0, 1, 2, 1], rb: true, b: '0 . . 4 4 . . . 0 . . 4 4 . . .',
              l: ['4 . . 4 . . 2 . . . . . 4 . 5 .', '7 . . . 5 . . . 3 . . . . . . .', '6 . . 6 . . 4 . 2 . . . 4 . . .', '1 . . . . . . . . . . . . . . .'],
              k: 'x..x....x..x....', s: 'x..x..x...x..x..', h: 'x.x...x.x.x...x.'
            },
            B: {
              c: [3, 3, 4, 4], rb: true, b: '0 . . 4 4 . . . 0 . . 4 4 . . .',
              l: ['10 . . . 9 . 7 . . . 5 . . . . .', '7 . . 9 . . 10 . . . . . . . . .', '11 . . . 10 . 8 . . . 6 . . . . .', '8 . . 10 . . 11 . . . 13 . 11 . . .'],
              k: 'x..x....x..x....', s: '..x..x....x..x..', h: 'xxx.xxx.xxx.xxx.'
            },
            B2: {
              c: [5, 1, 4, 0], rb: true, b: '0 . . 4 4 . . . 0 . . 4 4 . . .',
              l: ['9 . . . 7 . 5 . . . . . . . . .', '8 . . . 5 . 3 . . . . . . . . .', '6 . . 8 . . 10 . 11 . . . . . . .', '7 . . . . . . . . . . . . . . .'],
              k: 'x..x....x..x....', s: '..x..x....x..x..', h: 'xxx.xxx.xxx.xxx.'
            },
            O: { c: [0, 0], rb: true, b: '0 . . 4 4 . . . 0 . . . . . . .', l: ['7 . . . 4 . . . 0 . . . . . . .', R0], s: ['x..x..x...x..x..', D0], h: 'x.x.x.x.x.x.....' }
          },
          form: 'I A A2 B B2! A A2 B B2! A^1 A2^1! O'
        },
        {
          // a half-time slow jam: long sax tones, kick and snare an octave apart in time
          id: 'rated_slow', title: 'Rated a Ten (Slow Jam)', artist: 'Ten Karat Sax',
          swing: 0.15, sustain: 1.2,
          fill: { k: 'x.........x.....', s: '........x...x.xx', h: 'x.x.x.x.x.x.x.x.' },
          sections: {
            I: { c: [0, 3], rb: true, b: '0 . . . . . . . . . . . . . . .', h: 'x.x...x.x.x...x.' },
            V: {
              c: [0, 2, 3, 4], rb: true, b: ['0 . . . . . . 0 . . 4 . . . . .', '0 . . . . . . 0 . . 4 . . . 2 .'],
              l: ['7 . . . . . . . 6 . . . 4 . . .', '6 . . . . . . . 4 . . . 2 . . .', '5 . . . . . . . 3 . . . 1 . . .', '4 . . . . . 2 . 1 . . . . . . .'],
              k: ['x.........x.....', 'x......x..x.....'], s: '........x.......', h: 'x.x...x.x.x...x.'
            },
            V2: {
              c: [0, 2, 3, 4], rb: true, b: ['0 . . . . . . 0 . . 4 . . . . .', '0 . . . . . . 0 . . 4 . . . 2 .'],
              l: ['. . . . . . 4 5 7 . . . 9 . 7 .', '9 . . . . . . . 8 . 6 . 4 . . .', '. . . . 7 . 8 . 10 . . . 7 . . .', '8 . . . 6 . . . 4 . . . 6 . 8 .'],
              k: ['x.........x.....', 'x......x..x.....'], s: '........x.......', h: 'x.x...x.x.x...x.'
            },
            C: {
              c: [3, 4, 2, 5], rb: true, b: '0 . . . . . . 0 . . 4 . 0 . . .',
              l: ['10 . . . 9 . . . 7 . . . 5 . . .', '8 . . . . . 6 . 4 . . . . . . .', '9 . . . . . 11 . 9 . . . 6 . . .', '5 . . . . . . . . . . . . . . .'],
              k: 'x......x..x.....', s: '........x.......', h: 'xxx.xxx.xxx.xxx.'
            },
            O: { c: [0, 0], rb: true, b: '0 . . . . . . . . . . . . . . .', l: ['7 . . . . . . . . . . . 4 . . .', '7 . . . . . . . . . . . . . . .'], h: 'x...x...x...x...' }
          },
          form: 'I V V2! C V V2! C C! O'
        },
        {
          // a shuffle: the sax and hats play long-short (off-beats on the 'a' of each beat, a
          // light swing on top), a boogie walking bass; the last chorus goes up a step
          id: 'both_tens', title: 'Both Tens (Shuffle)', artist: 'The Ribbon Cutting Committee',
          swing: 0.1, sustain: 0.6,
          fill: { k: 'x.......x.......', s: '....x.......xxxx', h: 'x.xxx.xxx.......' },
          sections: {
            A: {
              c: [0, 3, 0, 4], rb: true, b: ['0 . . . 2 . . . 4 . . . 5 . . .', '7 . . . 5 . . . 4 . . . 2 . . .'],
              l: ['7 . . 7 9 . . 7 4 . . . 5 . . 4', '10 . . 10 12 . . 10 7 . . . 8 . . 7', '7 . . 7 9 . . 7 4 . . . 2 . . 4', '8 . . . 6 . . . 4 . . . . . . .'],
              k: 'x.......x.......', s: '....x.......x...', h: 'x..x...xx..x...x'
            },
            B: {
              c: [3, 3, 0, 0], rb: true, b: ['0 . . . 2 . . . 4 . . . 5 . . .', '7 . . . 5 . . . 4 . . . 2 . . .'],
              l: ['10 . . 10 . . 12 . 14 . . . 12 . 10 .', '9 . . . 7 . . . 5 . . . 3 . . .', '7 . . 7 . . 9 . 11 . . . 9 . 7 .', '4 . . . 2 . . . 0 . . . . . . .'],
              k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.'
            },
            T: {
              c: [4, 3, 0, 4], rb: true, b: '0 . . . 2 . . . 4 . . . 5 . . .',
              l: ['11 . . . 8 . . . 6 . . . 4 . . .', '10 . . . 7 . . . 5 . . . 3 . . .', '7 . . 9 11 . . 14 . . . . . . . .', '8 . . 9 10 . . 11 . . . . . . . .'],
              k: 'x.......x.......', s: '....x.......x...', h: 'x..x...xx..x...x'
            },
            O: { c: [0, 0], rb: true, b: '0 . . . . . . . 0 . . . . . . .', l: ['7 . . . . . . . 4 . . . 7 . . .', '0 . . . . . . . . . . . . . . .'], k: ['x.......x.......', 'x...............'], s: ['....x.......x...', D0], h: 'x.xxx.xxx.......' }
          },
          form: 'A A B T! A A B T! A^1 B^1 T^1! O'
        }
      ]
    },

    // =========================================================== VELVETINE 888
    {
      id: 'velvetine_888', name: 'Velvetine Lounge 88.8',
      tagline: 'Listening, never dancing.',
      genre: 'deep house with no drop, ice clinks, a spreadsheet read softly',
      bpm: 122, scale: 'minor', color: '#b56bff', kit: 'house',
      swing: 0.08, sustain: 0.9, wave: { bass: 'triangle', lead: 'sine' },
      ads: [
        'Velvetine Listening Pier. A party you\'ll hear about.',
        'Velvetine Records. Nothing released. Still charting.',
        'The Afterparty. A yacht, a dress code, a Baron. It has never sailed.',
        'Fresh Takes Fish Shack. Reheated hourly.',
        'Nap Dynasty. Official mattress of lying awake. Code VELVET20.',
        'Warehouse 42 Mixtapes. Thirty years, one cassette, still sealed.',
        'Velvetine Headphones. Noise cancelling. Music cancelling. Just the cancelling.',
        'The Baron\'s Greatest Hits. Zero tracks. Two discs. Charting since forever.',
        'Velvetine Ice. Hand-clinked. The only sound at the party.',
        'Listening Room Bottle Service. A bottle, a sparkler, total silence. To whatever this is.',
        'Velvetine Records Unreleased Box Set. Nothing inside. Still sealed. Already a classic.',
        'Fresh Takes Fish Shack. Catch of the day: last Tuesday\'s take. Reheated with love.',
        'Afterparty Yacht Club. Membership includes the dock. The yacht stays exactly where it is.',
        'Velvetine Spreadsheet Sessions. Quarterly numbers, read softly, over a beat that never drops.',
        'Velvetine Valet. We park it. We network next to it. One lane, four hours.',
        'Warehouse 42 Merch. A shirt for the mixtape. The mixtape is coming. The shirt is here.'
      ],
      napAd: 4,
      dj: [
        'To the night. To the brand. To whatever this is.',
        'That was eleven minutes of build.',
        'The drop is coming. It is not.',
        'The Baron thanks you for listening to listening.',
        'To the night! To the ice! To the silence between the ice!',
        'That was a nine-minute intro. The rest of the song is coming. It is not.',
        'Shout out to everyone on the Listening Pier. You\'re networking beautifully.',
        'Tonight\'s set: page four of the spreadsheet. Column C. Softly.',
        'The Baron would like to thank the bass for never arriving.',
        'The request line is open. Requests are listened to. Never played.',
        'Afterparty dress code tonight: "a vibe." Shoes optional. Sailing impossible.',
        'If you can hear this, the party is too loud. Please remain impressed.',
        'Velvetine Records has a new single out. It is a press release about the single.',
        'To whatever this is! The glass clinks. That\'s the hook.'
      ],
      // Deep house: intro, groove, chord stabs, a breakdown, a build, and then the
      // drop does not come (one empty bar and the groove carries on). That is the joke.
      songs: [
        {
          id: 'eleven_minutes', title: 'Eleven Minutes of Build', artist: 'DJ Column C',
          fill: { k: 'x...x...x...x...', s: '....x.......x.xx', h: '..x...x...xxxxxx' },
          sections: {
            In: { c: [0, 0, 3, 3], l: [R0, '. . . . . . . . . . . . . . 14 .', R0, '. . . . . . . 11 . . . . . . 14 .'], k: 'x...x...x...x...', h: ['..x...x...x...x.', '..x...x...x...x.', '..x...x...x...x.', '..x...x...x...xx'] },
            G: {
              c: [0, 0, 3, 3], rb: true, b: ['. . 0 . . . 0 . . . 0 . . 0 . 7', '. . 0 . . . 0 . . . 0 . . . 3 .'],
              l: ['. . . . . . . 11 . . . . . . 14 .', R0, '. . . . . . . 12 . . . . . . 14 .', R0],
              k: 'x...x...x...x...', s: '....x.......x...', h: ['..x...x...x...x.', '..x...x...x...xx']
            },
            S: {
              c: [0, 0, 3, 3], rb: true, sus: 1.2, b: ['. . 0 . . . 0 . . . 0 . . 0 . 7', '. . 0 . . . 0 . . . 0 . . . 3 .'],
              l: ['. . 9 . . 11 . . . . 13 . . 11 . .', '. . 9 . . 11 . . . . 13 . 14 . . .', '. . 10 . . 12 . . . . 14 . . 12 . .', '. . 10 . . 12 . . . . 16 . 14 . . .'],
              k: 'x...x...x...x...', s: '....x.......x...', h: '..x.x.x...x.x.xx'
            },
            B: {
              c: [0, 0, 3, 3], sus: 2.5, l: ['14 . . . 13 . . . 11 . . . 9 . . .', '11 . . . . . . . . . . . . . . .', '12 . . . 14 . . . 15 . . . 14 . . .', '12 . . . . . . . . . . . . . . .'],
              h: '........x.......'
            },
            U: {
              c: [0, 0, 3, 3], l: ['7 . . . 7 . . . 7 . . . 7 . . .', '9 . 9 . 9 . 9 . 9 . 9 . 9 . 9 .', '12 12 12 12 12 12 12 12 12 12 12 12 12 12 12 12', '14 14 14 14 14 14 14 14 . . . . . . . .'],
              k: 'x...x...x...x...', s: ['x...x...x...x...', 'x.x.x.x.x.x.x.x.', 'xxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxx'], h: 'xxxxxxxxxxxxxxxx'
            },
            N: { c: [0], l: '. . . . . . . . . . . . . . . 14' }
          },
          form: 'In G G S S! B U N G G S S! In'
        },
        {
          id: 'session_nine', title: 'Listening Session No. 9', artist: 'The Velvetine House Band',
          fill: { k: 'x...x...x...x...', s: '....x...x.x.x.xx', h: '..x...x...x...xx' },
          sections: {
            In: { c: [0, 5, 2, 6], rb: true, b: [R0, R0, '0 . . 0 . . 0 . . . 0 . . 0 . .', '0 . . 0 . . 0 . . . 0 . . 0 . .'], k: 'x...x...x...x...', h: '..x...x...x...x.' },
            A: {
              c: [0, 5, 2, 6], rb: true, b: ['0 . . 0 . . 0 . . . 0 . . 0 . .', '0 . . 0 . . 0 . . . 7 . . 0 . .'],
              l: ['. . . . . . . 11 . . . . . . 14 .', '. . . . . . . 12 . . . . . . . .', '. . . . . . . 11 . . . . . . 13 .', '. . . . . . . 10 . . . . . . . .'],
              k: 'x...x...x...x...', s: '....x.......x...', h: ['..x...x...x...x.', '..x.x.x...x...xx']
            },
            C: {
              c: [0, 5, 2, 6], rb: true, sus: 1.0, b: ['0 . . 0 . . 0 . . . 0 . . 0 . .', '0 . . 0 . . 0 . . . 7 . . 0 . .'],
              l: ['7 . . 9 . . 11 . . . 9 . . 7 . .', '7 . . 9 . . 12 . . . 9 . . 7 . .', '6 . . 9 . . 11 . . . 9 . . 6 . .', '5 . . 8 . . 10 . . . 8 . . 5 . .'],
              k: 'x...x...x...x...', s: '....x.......x...', h: '..xx..xx..xx..xx'
            },
            B: { c: [0, 5, 2, 6], sus: 2.5, l: ['11 . . . . . . . 9 . . . . . . .', '12 . . . . . . . . . . . 11 . . .', '9 . . . . . . . 11 . . . . . . .', '10 . . . . . . . . . . . . . . .'], h: '....x.......x...' },
            U: {
              c: [0, 5, 2, 6], rb: true, b: '0 . . . 0 . . . 0 . . . 0 . . .', l: [R0, R0, '7 . 7 . 9 . 9 . 11 . 11 . 12 . 12 .', '14 . 14 . 14 . 14 . 14 14 14 14 . . . .'],
              k: 'x...x...x...x...', s: ['x...x...x...x...', 'x.x.x.x.x.x.x.x.', 'xxxxxxxxxxxxxxxx', 'xxxxxxxxxxxx....'], h: 'xxxxxxxxxxxxxxxx'
            },
            K: {
              c: [0, -2, 2, -1], rb: true, sus: 1.0, b: ['0 . . 0 . . 0 . . . 0 . . 0 . .', '0 . . 0 . . 0 . . . 7 . . 0 . .'],
              l: ['7 . . 9 . . 11 . . . 9 . . 7 . .', '7 . . 9 . . 12 . . . 9 . . 7 . .', '6 . . 9 . . 11 . . . 9 . . 6 . .', '5 . . 8 . . 10 . . . 8 . . 5 . .'],
              k: 'x...x...x...x...', s: '....x.......x...', h: '..xx..xx..xx..xx'
            },
            N: { c: [0], l: '14 . . . . . . . . . . . . . . .' }
          },
          form: 'In A A C C! B U N A K^4 K^4! In'
        },
        {
          id: 'drop_is_coming', title: 'The Drop Is Coming (It Is Not)', artist: 'Afterparty Allstars',
          fill: { k: 'x...x...x...x...', s: '....x.......xxxx', h: '..x...x...x...xx' },
          sections: {
            In: { c: [5, 6, 0, 0], k: 'x...x...x...x...', h: ['................', '..x...x...x...x.'], l: [R0, R0, R0, '. . . . . . . . . . . . . . 14 .'] },
            A: {
              c: [5, 6, 0, 0], rb: true, b: '0 . 0 . . 0 . 0 0 . 0 . . 0 7 .',
              l: ['. . . . . . . 12 . . . . . . . .', '. . . . . . . 13 . . . . . . . .', '. . . . . . . 11 . . . . . . 14 .', R0],
              k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.'
            },
            P: {
              c: [5, 6, 0, 0], rb: true, sus: 1.4, b: '0 . 0 . . 0 . 0 0 . 0 . . 0 7 .',
              l: ['. . 12 . . 14 . . . 12 . . 9 . . .', '. . 13 . . 15 . . . 13 . . 10 . . .', '. . 11 . . 14 . . . 11 . . 9 . . .', '. . 11 . . 14 . . 16 . . . 14 . . .'],
              k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.'
            },
            U: {
              c: [5, 6, 0, 0], rb: true, b: '0 . . . 0 . . . 0 . . . 0 . . .', l: ['9 . . . . . . . 9 . . . . . . .', '10 . . . 10 . . . 10 . . . 10 . . .', '11 . 11 . 11 . 11 . 11 . 11 . 11 . 11 .', '14 14 14 14 14 14 14 14 14 14 14 14 14 14 14 14'],
              k: 'x...x...x...x...', s: ['x.......x.......', 'x...x...x...x...', 'x.x.x.x.x.x.x.x.', 'xxxxxxxxxxxxxxxx'], h: ['..x...x...x...x.', '..x...x...x...x.', 'xxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxx']
            },
            N: { c: [0], l: R0 }
          },
          form: 'In A A P P! U U N A P In'
        },
        {
          // the Baron's DJ reads a spreadsheet: a monotone "spoken" lead in speech
          // rhythm over a dub groove; the second reading moves up a third (shift 2)
          id: 'spreadsheet_dub', title: 'Spreadsheet Reading (Dub)', artist: 'The Quarterly Earnings',
          fill: { k: 'x...x...x...x...', s: '....x.......x.x.', h: 'x.x.x.x.x.xxxxxx' },
          sections: {
            In: { c: [0, 3, 5, 4], k: 'x...x...x...x...', h: 'x.x.x.x.x.x.x.x.' },
            G: {
              c: [0, 3, 5, 4], rb: true, b: ['0 . . . . . 0 . . 0 . . 4 . . .', '0 . . . . . 0 . . 0 . . 7 . 4 .'],
              k: 'x...x...x...x...', s: '............x...', h: 'x.x.x.x.x.x.x.x.'
            },
            R: {
              c: [0, 3, 5, 4], rb: true, b: ['0 . . . . . 0 . . 0 . . 4 . . .', '0 . . . . . 0 . . 0 . . 7 . 4 .'],
              l: ['7 7 . 7 . 7 7 . . 7 . 7 7 7 . .', '7 . 7 7 . . 7 . 7 7 . . 5 . . .', '7 7 . 7 . 7 7 . . 7 . 7 9 . . .', '8 . 8 8 . . 8 . . . 7 . . . . .'],
              k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.'
            },
            B: { c: [0, 5, 3, 5], sus: 3, l: ['14 . . . . . . . . . . . . . . .', '12 . . . . . . . . . . . . . . .', '12 . . . . . . . 14 . . . . . . .', '11 . . . . . . . . . . . . . . .'], h: '....x.......x...' }
          },
          form: 'In G G R R! B G R^2 R^2! In'
        }
      ]
    },

    // ============================================================ QUIET SIGNAL
    {
      id: 'quiet_signal', name: 'Quiet Signal',
      tagline: 'You are not listening to this.',
      genre: 'ambient pads, elevator chimes, a dial tone in the key of beige',
      bpm: 60, scale: 'dorian', color: '#9fb3c8', kit: 'none',
      swing: 0, sustain: 3.0, wave: { bass: 'triangle', lead: 'sine' },
      ads: [
        'Weather Balloon Repair. A balloon has been repaired. No further questions have been taken.',
        'A mattress has been recommended. A code has been issued. The code is CLASSIFIED20.',
        'Fulcrum Foundation. A study was funded. Results were concluded.',
        'Perpetual Assembly Plaza gift shop. A cause has been updated. The mugs have not.',
        'Bravadia. A jet has been requested. Tourism has been declared.',
        'This ad slot was purchased. By whom is unimportant.',
        'Beige vans are being offered for lease. Questions are not being taken. Mileage has been redacted.',
        'Antennas have been installed. Fourteen have been counted. The weather has been listened to.',
        'Clarity Pellets have been evaluated. Nothing was found. A barn has been acquired.',
        'Your podcast has been subscribed to. Your comments have been formatted. Gratitude is not required.',
        'A dashboard is being offered. Every faction has been subscribed. Your tier has been preselected.',
        'Bridge tolls have been paid. A drop has been left underneath. It has been found to be ad copy.',
        'Nap Dynasty has been endorsed. Firmness has been assessed. Sleep has been permitted.',
        'Weather Balloon Repair Depot. Forty vans have been parked. Zero balloons have been seen.',
        'Sunglasses have been issued. Indoors they will be worn. Visibility has been reduced to policy.',
        'This ad has been read. By you. That has been noted.'
      ],
      napAd: 1,
      dj: [
        'This station was tuned. Enjoyment is optional.',
        'A van has been dispatched. Not for you. Probably.',
        'The word of the day is "crisp." It should be used at a gala.',
        'Static will follow. Static is content.',
        'This frequency has been assigned. Your preference was not consulted.',
        'A podcast has been listened to. Notes have been taken. You will be thanked eventually.',
        'The weather is being repaired. Overcast skies should be maintained.',
        'Fourteen antennas have been pointed. The direction is not being confirmed.',
        'A memo has been printed. Monday has been chosen. Reasons have not been given.',
        'Your car radio has been noticed. Appreciation has been logged.',
        'A song was considered for broadcast. It was deemed too specific.',
        'The time has been estimated. Now has been approximated.',
        'Questions may be submitted. They will be stored. Answers have been pre-written.',
        'An intern has been asked if this is paid. It is not.'
      ],
      // Ambient pieces at 60 bpm, one bar = four seconds. No drums except a clock
      // tick; the chimes ring long enough to overlap into chords.
      songs: [
        {
          id: 'hold_music', title: 'Hold Music for a Call That Was Not Placed', artist: 'Unattributed',
          sustain: 2.0,
          sections: {
            A: {
              c: [0, 0, 3, 3], rb: true, b: '0 . . . . . . . . . . . . . . .',
              l: ['. . . . 11 . . . 9 . . . . . . .', R0, '. . . . 10 . . . 8 . . . . . . .', R0], h: 'x.......x.......'
            },
            B: {
              c: [2, 6, 3, 0], rb: true, b: '0 . . . . . . . . . . . . . . .',
              l: ['9 . . . . . . . 7 . . . . . . .', '10 . . . . . . . 8 . . . . . . .', '10 . . . 12 . . . 14 . . . . . . .', '11 . . . . . . . 9 . . . . . . .'], h: 'x.......x.......'
            },
            C: {
              c: [6, 2, 3, 0], rb: true, b: '0 . . . . . . . . . . . . . . .',
              l: ['8 . . . 10 . . . 13 . . . . . . .', '9 . . . . . . . 11 . . . . . . .', '10 . . . 12 . . . 14 . . . . . . .', '11 . . . 9 . . . 7 . . . . . . .'], h: ['x.......x.......', 'x.......x.......', 'x.......x.......', D0]
            }
          },
          form: 'A A B A C'
        },
        {
          id: 'beige', title: 'Beige (Dial Tone Suite)', artist: 'Unattributed',
          sustain: 2.0,
          sections: {
            A: { c: [0, 6, 2, 3], rb: true, b: '0 . . . . . . . 0 . . . . . . .', l: '4 . . . 4 . . . 4 . . . 4 . . .' },
            B: { c: [3, 0, 6, 0], rb: true, b: '0 . . . . . . . 0 . . . . . . .', l: ['3 . . . 3 . . . 3 . . . 3 . . .', '4 . . . 4 . . . 4 . . . 4 . . .', '3 . . . 3 . . . 3 . . . 3 . . .', '4 . . . 4 . . . 4 . . . . . . .'] },
            C: { c: [0, 0, 0, 0], rb: true, b: '0 . . . . . . . . . . . . . . .', l: ['4 . . . 4 . . . 4 . . . 4 . . .', '4 . . . 4 . . . 4 . . . 4 . . .', '4 . . . . . . . 11 . . . . . . .', R0] }
          },
          form: 'A B A^4 C'
        },
        {
          id: 'balloon_repaired', title: 'Balloon, Repaired', artist: 'Unattributed',
          sections: {
            A: {
              c: [0, 0, 3, 3], rb: true, b: '0 . . . . . . . . . . . . . . .',
              l: ['7 . . . 9 . . . 11 . . . 14 . . .', '13 . . . 11 . . . 9 . . . 7 . . .', '10 . . . 12 . . . 14 . . . 17 . . .', '16 . . . 14 . . . 12 . . . 10 . . .']
            },
            B: {
              c: [6, 6, 2, 2], rb: true, b: '0 . . . . . . . 0 . . . . . . .',
              l: ['8 . . . . . . . 10 . . . . . . .', '13 . . . . . . . 12 . . . . . . .', '9 . . . . . . . 11 . . . . . . .', '14 . . . . . . . . . . . . . . .']
            },
            C: {
              c: [3, 6, 0, 0], rb: true, b: '0 . . . . . . . . . . . . . . .',
              l: ['10 . . . . . . . 12 . . . . . . .', '13 . . . . . . . 8 . . . . . . .', '7 . . . . . . . . . . . . . . .', R0]
            }
          },
          form: 'A A^1 B A C'
        },
        {
          id: 'briefing', title: 'A Briefing Has Been Given', artist: 'Unattributed',
          sustain: 2.0,
          sections: {
            A: {
              c: [0, 3, 0, 6], rb: true, b: '0 . . . . . . . 0 . . . . . . .',
              l: ['11 . 11 . . . 11 11 11 . . . . . . .', R0, '12 . 12 . . . 11 . 9 . . . . . . .', R0], h: 'x...x...x...x...'
            },
            B: {
              c: [2, 3, 2, 3], rb: true, b: '0 . . . . . . . 0 . . . . . . .',
              l: ['9 . . . . . . . . . . . 9 . 11 .', '12 . . . . . . . 10 . . . . . . .', '9 . . . . . . . . . . . 9 . 11 .', '14 . . . . . . . . . . . . . . .'], h: 'x...x...x...x...'
            },
            C: {
              c: [6, 3, 0, 0], rb: true, b: '0 . . . . . . . . . . . . . . .',
              l: ['13 . . . 10 . . . 8 . . . . . . .', '12 . . . 10 . . . . . . . . . . .', '11 . . . . . . . 7 . . . . . . .', R0], h: ['x...x...x...x...', 'x...x...x...x...', 'x...x...x...x...', D0]
            }
          },
          form: 'A B A B C'
        }
      ]
    },

    // ============================================================ OFFICE HOURS
    {
      id: 'office_hours', name: 'Office Hours 90.1 "Beats to Not Read To"',
      tagline: 'Lo-fi beats to not do the reading to.',
      genre: 'lo-fi study beats: swung dusty drums, electric piano, a raccoon on the cover',
      bpm: 102, scale: 'dorian', color: '#7fbf6a', kit: 'soft', district: 'campus',
      swing: 0.22, sustain: 1.4, wave: { bass: 'triangle', lead: 'sine' },
      ads: [
        'Nap Dynasty Dorm Twin XL. Sleep through your 8 a.m. like you meant it. Code SKIPCLASS20.',
        'Lanyard & Co. Lanyards for every occasion, including none. Now in dorm key and VIP.',
        'Clip Joint Barber. Fades, trims, and a free hot take with every cut. Walk-ins debated.',
        'Dorm 4B Studio. The ON AIR sign never turns off. Neither does the mini-fridge. Book by the hour.',
        'Founders\' College. Nine folding tables. Zero chairs. Now accepting applications and arguments.',
        'Fresh Takes Late Night. Student discount: half a take, reheated twice.',
        'Octane Opinions Student Fill-Up. Premium with a stance, regular with a meal plan.',
        'The Loud & Correct Podcast Van. Wrapped, parked, rated a two. Available for tailgates and apologies.',
        'Campus Bookstore. Textbooks you won\'t open at prices you won\'t believe. Rent the summary instead.',
        'Gus\'s Garage. Student respray: one coat, one opinion, cash only. "You\'re peaking." - Gus',
        'Founders\' College Debate Club. Thursdays on the Quad. No reading required. No chairs provided.',
        'Lot C Parking Permits. Forty dollars a semester. Raccoon has priority boarding.'
      ],
      napAd: 0,
      dj: [
        'DJ Skimmed Abstract here on Office Hours 90.1. Beats to not do the reading to.',
        'If you\'re just waking up, so am I. It\'s 4 p.m. We did it.',
        'Next: forty minutes of rain sounds and one guilty piano. Your essay is due in nine hours.',
        'Office hours are open. Nobody has come. Nobody ever comes. That\'s the station.',
        'Shout out to the raccoon of Lot C. Still parks better than the podcast van.',
        'Finals tip: the textbook is mostly a vibe. The professor is less of one.',
        'This beat was made in Dorm 4B. The mini-fridge did backing vocals.',
        'If anyone did the reading, please call in. We have questions. Mostly "why."',
        'Reminder: the Quad tables are not study spaces. They are debate spaces. There are no chairs.',
        'Study playlist, hour six. If you\'re still on page one, that\'s growth.',
        'The raccoon of Lot C was seen in a lanyard. Congratulations on the internship, buddy.',
        'New study: students who skip class have more takes. Fulcrum funded it. [citation pending]',
        'Midterms are coming. No, wait. They were last week. Hope you\'re okay.',
        'Kip in the Dorm 4B lobby asks if this is paid. It\'s campus radio, Kip. Nothing is paid.'
      ],
      // Lo-fi: swung boom-bap on the soft kit, an electric piano (the sine lead)
      // arpeggiating seventh chords, a round triangle bass, vamps of i7 IV7 and
      // descending sequences, a keys-only drop-out, and a key lift in three songs.
      songs: [
        {
          id: 'didnt_read', title: 'Didn\'t Do the Reading', artist: 'syllabus (unread)',
          fill: { k: 'x......x........', s: '....x.......x..x', h: 'x.x.x.x.x.x.....' },
          sections: {
            In: { c: [0, 3], l: ['0 . 2 . 4 . 6 . . . . . . . . .', '3 . 5 . 7 . 9 . . . . . . . . .'], h: 'x...x...x...x...' },
            A: {
              c: [0, 0, 3, 3], rb: true, b: ['0 . . . . . . 0 . . 4 . . . . .', '0 . . . . . . . . . 2 . 4 . . .'],
              l: ['. . 2 . 4 . 6 . . . . . 7 . 6 .', '. . 2 . 4 . 6 . . . 9 . 8 . 6 .', '. . 3 . 5 . 7 . . . . . 9 . 7 .', '. . 3 . 5 . 7 . 9 . . . 10 . . .'],
              k: 'x......x..x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.'
            },
            B: {
              c: [2, 1, 0, 6], rb: true, b: '0 . . . . . . 0 . . 4 . . . . .',
              l: ['9 . . . 8 . 6 . . . 4 . . . . .', '8 . . . 7 . 5 . . . 3 . . . . .', '7 . . . 6 . 4 . . . 2 . . . . .', '6 . . . 5 . 3 . . . 8 . . . . .'],
              k: 'x.....x...x..x..', s: '....x.......x...', h: 'x.x.x.xxx.x.x.x.'
            },
            Out: { c: [0, 0], l: ['0 . . . . . . . . . . . . . . .', R0], h: ['x.x.x.x.x.x.x.x.', 'x...x...........'] }
          },
          form: 'In A A B A In! B B^1 A Out'
        },
        {
          id: 'raccoon', title: 'Lot C Raccoon', artist: 'the raccoon of lot c',
          fill: { k: 'x.....x.........', s: '....x.......x.xx', h: 'x.x.x.x.x.x.x...' },
          sections: {
            In: { c: [0, 6], rb: true, b: [R0, '. . . . . . . . . . . . . . 4 .'], l: ['. . 4 . . 2 . . 0 . . . . . . .', '. . 3 . . 1 . . 6 . . . . . . .'] },
            A: {
              c: [0, 6, 2, 3], rb: true, b: '0 . . . . . 0 . . . 2 . . . 4 .',
              l: ['. . 6 . . 4 . . 2 . . . . . . .', '. . 5 . . 3 . . 1 . . . . . . .', '. . 8 . . 6 . . 4 . . . . . . .', '. . 5 . . 3 . . 7 . . . 9 . . .'],
              k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.'
            },
            B: {
              c: [3, 3, 0, 0], rb: true, b: ['0 . . . . . 0 . . . 2 . . . 4 .', '0 . . . . . . . 0 . . . 4 . . .'],
              l: ['10 . . 9 . . 7 . . . 5 . . . . .', '7 . . . . . . . . . . . . . . .', '9 . . 7 . . 6 . . . 4 . . . . .', '2 . . . . . . . . . . . . . . .'],
              k: 'x.....x...x.....', s: '....x.......x...', h: 'x.xxx.x.x.xxx.x.'
            },
            Out: { c: [0, 6], l: ['. . 4 . . 2 . . 0 . . . . . . .', '. . 3 . . 1 . . 6 . . . . . . .'], h: 'x...x...x...x...' }
          },
          form: 'In A A! B A A! B B Out'
        },
        {
          // half-time: kick and snare at half the rate, a ii v i turnaround
          id: 'nobody_came', title: 'Office Hours (Nobody Came)', artist: 'lanyard.wav',
          sustain: 1.5,
          fill: { k: 'x.........x.....', s: '........x.....xx', h: 'x.x.x.x.x.x.x.x.' },
          sections: {
            In: { c: [1, 4], l: ['3 . . . 5 . . . 7 . . . . . . .', '4 . . . 6 . . . 8 . . . 10 . . .'], h: 'x.x.x.x.x.x.x.x.' },
            A: {
              c: [1, 4, 0, 0], rb: true, b: ['0 . . . . . . . . . 4 . . . . .', '0 . . . . . . . 4 . . . 2 . . .'],
              l: ['3 . . . 5 . . . 7 . . . . . . .', '4 . . . 6 . . . 8 . . . 10 . . .', '7 . . . 6 . . . 4 . . . 2 . . .', '0 . . . . . . . . . . . . . . .'],
              k: 'x.........x.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.'
            },
            B: {
              c: [3, 6, 2, 4], rb: true, b: '0 . . . . . . . 0 . . . . . . .',
              l: ['5 . 7 . 9 . . . . . . . . . . .', '6 . 8 . 10 . . . . . . . . . . .', '4 . 6 . 8 . . . . . . . . . . .', '4 . 6 . 8 . 10 . . . . . . . . .'],
              k: 'x.........x..x..', s: '........x.......', h: 'xxx.xxx.xxx.xxx.'
            },
            Out: { c: [0, 0], l: ['7 . . . . . . . . . . . . . . .', R0], h: ['x.x.x.x.x.x.x.x.', D0] }
          },
          form: 'In A A B! B A A^3 Out'
        },
        {
          id: 'finals_week', title: 'Finals Week in Dorm 4B', artist: '4B beats',
          fill: { k: 'x......x..x.....', s: '....x...x...x.xx', h: 'x.x.x.x.x.x.x.x.' },
          sections: {
            In: { c: [3, 2], rb: true, b: [R0, '. . . . . . . . 0 . 4 . . . . .'], h: 'x.x.x.x.x.x.x.x.' },
            A: {
              c: [3, 2, 1, 0], rb: true, b: ['0 . . 0 . . . . 0 . 4 . . . . .', '0 . . 0 . . . . 0 . 4 . . . . .', '0 . . 0 . . . . 0 . 2 . . . . .', '0 . . 0 . . . . 0 . 4 . . . . .'],
              l: ['7 . . 9 . 10 . . . 9 . 7 . . . .', '6 . . 8 . 9 . . . 8 . 6 . . . .', '5 . . 7 . 8 . . . 7 . 5 . . . .', '4 . . 6 . 7 . . . 6 . 4 . . . .'],
              k: 'x......x..x.....', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx'
            },
            C: {
              c: [0, 3, 0, 3], rb: true, b: ['0 . . . . . . 0 . . 4 . . . . .', '0 . . . . . . . 0 . . . 2 . . .'],
              l: ['7 . 9 . . 7 . 4 . . 6 . 7 . . .', '9 . 10 . . 9 . 7 . . 5 . 3 . . .', '7 . 9 . . 7 . 4 . . 6 . 7 . 9 .', '10 . . . 9 . . . 7 . . . 5 . . .'],
              k: 'x.....x...x..x..', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.'
            },
            Out: { c: [3, 2, 1, 0], l: ['7 . . . . . . . . . . . . . . .', '6 . . . . . . . . . . . . . . .', '5 . . . . . . . . . . . . . . .', '4 . . . . . . . . . . . . . . .'], h: ['x.x.x.x.x.x.x.x.', 'x...x...x...x...', 'x...x...x...x...', D0] }
          },
          form: 'In A A C C! A A^4 Out'
        }
      ]
    },

    // ================================================================ LOOP 174
    {
      id: 'loop_174', name: 'Loop 174 "Legally a Party"',
      tagline: 'On the Loop you are legally a party.',
      genre: 'drum and bass and breakbeats, a rolling bass, an MC who only knows the speed limit',
      bpm: 174, scale: 'minor', color: '#ff7a00', kit: 'break', district: 'loop',
      swing: 0, sustain: 2.5, wave: { bass: 'sawtooth', lead: 'square' },
      ads: [
        'Nap Dynasty Car Mattress. Rest at every red light. The Loop has none. Code LOOP174.',
        'Spin Doctor Customs. Body kits, neon and a stance. We spin your car and your coverage.',
        'Octane Opinions. Premium is regular with a stance. Diesel is regular with a grudge.',
        'Detail & Evidence. Wash, wax and a clean record. Tire shine is extra. Records are not.',
        'Pump & Circumstance. The HOA approved the pump. Not the price. Not you.',
        'Spin Doctor Customs Spoilers. Zero downforce. Forty percent more attitude.',
        'Octane Opinions Car Wash. We wash your car, then argue it was never dirty.',
        'Sponsor Span. Tolled per opinion. Coupon codes accepted. Takes over ten words pay double.',
        'Gus\'s Garage. Pay-and-spray. Wanted stars out, new color in. A hundred bucks a star.',
        'Loud Cab. A ride with a podcast you can\'t turn off. Fare includes three hot takes.',
        'Spin Doctor Customs Horns. Forty tones. Every one of them says "Respectfully."',
        'The Lower Loop. Now open. Drivers legally a layover. Passengers legally a carpool.'
      ],
      napAd: 0,
      dj: [
        'MC POSTED LIMIT ON LOOP 174! THE SPEED LIMIT IS FIFTY-FIVE! I AM SAYING IT VERY FAST!',
        'ON THE LOOP YOU ARE LEGALLY A PARTY! PARTIES MUST SIGNAL! SIGNAL, PARTY!',
        'FIFTY-FIVE! THAT\'S NOT THE BPM, THAT\'S THE LAW! THE BPM IS ONE SEVENTY-FOUR!',
        'MERGE! MERGE LIKE YOU MEAN IT! MERGE LIKE A COMMENT SECTION!',
        'IF YOU CAN READ THIS TICKER, YOU ARE LOOKING AT THE DASHBOARD! EYES UP!',
        'THE LOOP HAS NO EXITS! THE LOOP HAS NO ENTRANCES! YOU HAVE ALWAYS BEEN ON THE LOOP!',
        'SHOUT OUT TO THE PODCAST VAN! RATED A TWO! STILL ON THE LOOP!',
        'BREAK! BEAT! BRAKE! SAFELY! AT A REASONABLE FOLLOWING DISTANCE!',
        'UNLIKE VELVETINE, WE HAVE A DROP! HERE IT COMES! AT FIFTY-FIVE!',
        'HOA PATROL ON THE ON-RAMP! THEY CAN\'T FOLLOW YOU! THE LOOP IS NOT A CUL-DE-SAC!',
        'BUCKLE UP! THE PARTY IS LEGALLY BINDING!',
        'FOUR-MINUTE TRACK, ONE LAP! THAT\'S OVER THE LIMIT! PULL OVER EMOTIONALLY!',
        'SPONSORED BY SPIN DOCTOR CUSTOMS! THEY SPIN IT! I SHOUT IT! FIFTY-FIVE!',
        'LOWER LOOP IS OPEN! STILL FIFTY-FIVE DOWN THERE! GRAVITY DOES NOT COUNT!'
      ],
      // Drum and bass: an atmospheric intro, a snare-roll build, a two-step drop
      // with a rolling bass and square stabs, a breakdown with bell melodies, a
      // second build, an amen-style drop that ends a third up (shift 2), an outro.
      // The other climaxes shift down (heavier, lower), never into shrill stabs.
      songs: [
        {
          id: 'legally_a_party', title: 'Legally a Party', artist: 'Painted Median',
          fill: { k: 'x...............', s: 'x.xxx.x.xxxxxxxx', h: 'x.x.x.x.........' },
          sections: {
            In: {
              c: [0, 0, 5, 4], rb: true, sus: 3, wave: { bass: 'sawtooth', lead: 'sine' }, b: '0 . . . . . . . . . . . . . . .',
              l: ['. . . . . . . . 11 . . . . . . .', R0, '. . . . . . . . 12 . . . 11 . . .', R0], h: ['x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.x.xx']
            },
            U: {
              c: [0, 0, 5, 4], rb: true, b: '0 . . . 0 . . . 0 . . . 0 . . .', l: ['7 . . . . . . . 7 . . . . . . .', '7 . . . 7 . . . 7 . . . 7 . . .', '9 . . . 9 . . . 9 . . . 9 . . .', '11 . 11 . 11 . 11 . 11 11 11 11 . . . .'],
              k: [D0, D0, 'x...x...x...x...', 'x.......x.......'], s: ['....x.......x...', 'x...x...x...x...', 'x.x.x.x.x.x.x.x.', 'x.x.x.x.xxxx....'], h: 'xxxxxxxxxxxxxxxx'
            },
            D: {
              c: [0, 0, 5, 4], rb: true,
              b: ['0 . . . . . 0 . . . 0 . . . . .', '0 . . . . . 0 . . . 0 . . 4 . .', '0 . . . . . 0 . . . 0 . . . . .', '0 . . . 0 . . . 0 . 0 . 0 . 0 .'],
              l: ['. . 7 . . 7 . . 11 . . . 10 . . .', '. . 7 . . 7 . . 11 . . . 13 . 11 .', '. . 9 . . 9 . . 12 . . . 11 . . .', '. . 8 . . 8 . . 11 . . . . . . .'],
              k: 'x.........x.....', s: '....x.......x...', h: 'x.xxx.x.x.xxx.x.'
            },
            Br: {
              c: [0, 6, 5, 4], rb: true, sus: 3, wave: { bass: 'triangle', lead: 'sine' }, b: '0 . . . . . . . 0 . . . . . . .',
              l: ['14 . . . . . . . 13 . . . 11 . . .', '13 . . . . . . . 11 . . . 10 . . .', '12 . . . . . . . 11 . . . 9 . . .', '11 . . . . . . . . . . . . . . .'], h: '....x.......x...'
            },
            D2: {
              c: [0, 0, 5, 4], rb: true,
              b: ['0 . . 0 . . 0 . . . 0 . . . 6 .', '0 . . 0 . . 0 . . . 0 . 4 . 2 .', '0 . . 0 . . 0 . . . 0 . . . 4 .', '0 . 0 . 0 . 0 . 4 . 4 . 2 . 1 .'],
              l: ['7 . . . 6 . . . 4 . . . . . . .', '. . 3 . . 4 . . 6 . . . 4 . . .', '5 . . . 4 . . . 2 . . . . . . .', '. . 1 . . 4 . . 8 . . . 7 . . .'],
              k: ['x.x.......xx....', 'x.x.......xx....', 'x.x.......xx....', 'x.x.......x.....'], s: ['....x..x.x..x..x', '....x..x.x..x..x', '....x..x.x..x..x', '....x..x.x....x.'], h: 'x.x.x.x.x.x.x.x.'
            },
            Out: { c: [0, 0, 5, 4], rb: true, sus: 3, wave: { bass: 'sawtooth', lead: 'sine' }, b: '0 . . . . . . . . . . . . . . .', l: ['11 . . . . . . . . . . . . . . .', R0, R0, R0], k: ['x.........x.....', 'x.........x.....', D0, D0], h: 'x.x.x.x.x.x.x.x.' }
          },
          form: 'In In U D D D D! Br Br U D2 D2 D2^2 D2^2! Out'
        },
        {
          id: 'speed_limit', title: 'Speed Limit (Suggested)', artist: 'The Zipper Merge Society',
          fill: { k: 'x.........x.....', s: '....x..xx.xxxxxx', h: 'x.x.x.x.x.x.....' },
          sections: {
            In: { c: [0, 5, 2, 6], sus: 3, wave: { bass: 'sawtooth', lead: 'triangle' }, h: 'x.x.x.x.x.x.x.x.', l: ['. . . . . . . . . . . . 7 . . .', R0, '. . . . . . . . . . . . 9 . . .', '. . . . . . . . 10 . . . . . . .'] },
            U: {
              c: [0, 5, 2, 6], rb: true, b: ['0 . . . . . . . 0 . . . . . . .', '0 . . . . . . . 0 . . . . . . .', R0, R0], l: [R0, R0, '11 . . . 11 . . . 11 . . . 11 . . .', '13 . 13 . 13 . 13 . 13 . 13 . 13 13 13 13'],
              k: [D0, 'x.......x.......', 'x...x...x...x...', 'x...x...x...x...'], s: ['................', '....x.......x...', 'x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.xxxx'], h: 'xxxxxxxxxxxxxxxx'
            },
            D: {
              // the reese: a sawtooth retriggered in a tresillo, under hoover stabs on the one
              c: [0, 5, 2, 6], rb: true, sus: 3,
              b: ['0 . . 0 . . 0 . . . 0 . . 0 . .', '0 . . 0 . . 0 . . . 2 . . 2 . .', '0 . . 0 . . 0 . . . 0 . . 0 . .', '0 . . 0 . . . . 2 . . . 4 . . .'],
              l: ['7 . . . . . . . . . . . . . . .', '. . . 9 . . . . . . . . 7 . . .', '9 . . . . . . . . . . . . . . .', '. . . 10 . . . . 8 . . . 6 . . .'],
              k: ['x.........x.....', 'x.........x.x...'], s: ['....x.......x...', '....x..x....x...'], h: '..xxx.x.x.xxx.x.'
            },
            Br: {
              c: [0, 5, 2, 6], sus: 3, wave: { bass: 'triangle', lead: 'sine' }, b: '0 . . . . . . . . . . . . . . .', rb: true,
              l: ['11 . . . 12 . . . 14 . . . . . . .', '12 . . . 11 . . . 9 . . . . . . .', '11 . . . 9 . . . 7 . . . . . . .', '10 . . . . . . . 8 . . . . . . .'], h: 'x...x...x...x...'
            },
            Out: { c: [0, 5, 2, 6], sus: 3, wave: { bass: 'sawtooth', lead: 'triangle' }, rb: true, b: '0 . . . . . . . . . . . . . . .', k: ['x.........x.....', D0], h: 'x.x.x.x.x.x.x.x.' }
          },
          form: 'In U D D D D! Br U D D^-3 D^-3! Out'
        },
        {
          // liquid: bells throughout, half-time drums under the first drop, then the roller
          id: 'lower_loop', title: 'Lower Loop Layover', artist: 'The Shoulder Lane Social Club',
          wave: { bass: 'sawtooth', lead: 'sine' }, sustain: 2,
          fill: { k: 'x...............', s: '....x.xxx.xxxxxx', h: 'x.x.x.x.x.x.x.x.' },
          sections: {
            In: { c: [0, 6, 5, 4], rb: true, sus: 3, b: [R0, '0 . . . . . . . . . . . . . . .'], l: ['7 . . . . . 11 . . . . . 13 . . .', '6 . . . . . 10 . . . . . 12 . . .', '5 . . . . . 9 . . . . . 11 . . .', '4 . . . . . 8 . . . . . 10 . . .'], h: 'x.x.x.x.x.x.x.x.' },
            H: {
              c: [0, 6, 5, 4], rb: true, b: '0 . . . . . . . 0 . . . 4 . . .',
              l: ['7 . 11 . 14 . . . 11 . . . 7 . . .', '6 . 10 . 13 . . . 10 . . . 6 . . .', '5 . 9 . 12 . . . 9 . . . 5 . . .', '4 . 8 . 11 . . . 8 . . . 11 . . .'],
              k: 'x.........x.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.'
            },
            D: {
              c: [0, 6, 5, 4], rb: true, b: ['0 . . . . . 0 . . . 0 . . . . .', '0 . . . . . 0 . . . 0 . . 4 . .'],
              l: ['7 . 11 . 14 . . . 11 . . . 7 . . .', '6 . 10 . 13 . . . 10 . . . 6 . . .', '5 . 9 . 12 . . . 9 . . . 5 . . .', '4 . 8 . 11 . . . 8 . . . 11 . . .'],
              k: ['x.........x.....', 'x.........x..x..'], s: '....x.......x...', h: 'x.xxx.x.x.xxx.x.'
            },
            Out: { c: [0, 6, 5, 4], rb: true, sus: 3, b: '0 . . . . . . . . . . . . . . .', l: ['14 . . . . . . . . . . . . . . .', R0, R0, R0], h: ['x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.x.x.', 'x...x...x...x...', D0] }
          },
          form: 'In H H D D D! In D^-2 D^-2! Out'
        },
        {
          // amen-heavy breakbeat; the lead is a two-tone siren
          id: 'four_stars', title: 'Four Stars From the Chase Cop', artist: 'The Painted Median Soundsystem',
          fill: { k: 'x.x.............', s: 'x.x.xxx.xxx.xxxx', h: 'x.x.x.x.x.x.....' },
          sections: {
            In: { c: [0, 0, 6, 6], l: ['11 . . . . . . . 9 . . . . . . .', '11 . . . . . . . 9 . . . . . . .', '10 . . . . . . . 8 . . . . . . .', '10 . . . . . . . 8 . . . . . . .'], sus: 3, h: 'x.x.x.x.x.x.x.x.' },
            A: {
              c: [0, 0, 6, 6], rb: true, b: ['0 . . 0 . . . . 0 . 0 . . . . .', '0 . . 0 . . . . 0 . 0 . 4 . 6 .'],
              l: ['11 . . . . . . . 9 . . . . . . .', '11 . . . . . . . 9 . . . . . . .', '10 . . . . . . . 8 . . . . . . .', '10 . . . . . . . 8 . . . 13 . . .'], sus: 3,
              k: ['x.x.......xx....', 'x.x.......x.....'], s: ['....x..x.x..x..x', '....x..x.x....x.'], h: 'x.x.x.x.x.x.x.x.'
            },
            B: {
              c: [5, 5, 4, 4], rb: true, b: '0 . . . . . 0 . . . 0 . . . . .',
              l: ['. . 5 . . 5 . . 7 . . . 5 . . .', '. . 5 . . 5 . . 9 . . . 7 . . .', '. . 4 . . 4 . . 6 . . . 4 . . .', '. . 4 . . 4 . . 8 . . . 7 . . .'],
              k: 'x.........x.....', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx'
            },
            Out: { c: [0, 0, 6, 6], sus: 3, l: ['11 . . . . . . . . . . . . . . .', R0, R0, R0], k: ['x.x.......xx....', D0, D0, D0], s: ['....x..x.x..x..x', D0, D0, D0], h: 'x.x.x.x.x.x.x.x.' }
          },
          form: 'In In A A! B B In! A^-3 A^-3! B A! Out'
        }
      ]
    }
  ];

  // The four GDD DJ lines of WAIL 101 stay first in djBase; `dj` is the current
  // call-in segment (installed below).

  // ------------------------------------------------------------ call-in --
  var CALLIN = {
    station: 'wail_101',
    show: 'Uproar at Large',
    host: 'Thad Uproar',
    segments: [
      {
        id: 'open_lines', title: 'Open Lines (One Side)',
        intro: 'Lines are open. One side of them. The other side was disconnected for your comfort.',
        exchanges: [
          'CALLER, Doreen in Culdesac Heights: "I agree with you, Thad." THAD: "Bold. Brave. Dangerous. Next."',
          'CALLER, Marty at the Printworks: "I have a question." THAD: "We don\'t do those here. Rephrase it as a grievance."',
          'CALLER, Bev on the Sponsor Strip: "I\'m calling from the other side." THAD: "Screener! How did she get a dial tone?"',
          'CALLER, Lenny on Lobby Row: "Long-time listener, first-time yeller." THAD: "Welcome. Yell in the key of the bumper music."',
          'CALLER, Priya in Chyron Center: "I think we both make good points." THAD: "Ma\'am, this is a radio station."'
        ],
        outro: 'That\'s open lines. The lines are now closed. They were never fully open.'
      },
      {
        id: 'ask_fulcrum', title: 'Ask a Fulcrum Fellow',
        intro: 'In studio, a Fulcrum Foundation fellow. Forty of them, one opinion, he drew the short straw.',
        exchanges: [
          'CALLER, Gordon at Founders\' College: "Is the study peer-reviewed?" THAD: "His peers reviewed it. All forty. In one room."',
          'CALLER, Tanya in Pennant Point: "What does the data say?" THAD: "Whatever the last check said. Footnoted. [citation pending]."',
          'CALLER, Ed at the port: "Who funds Fulcrum?" THAD: "Nonpartisan. Two doors, one checkbook. Next question, dumber please."',
          'CALLER, Wanda uptown: "Can he cite that?" THAD: "He can. It\'s pending. It\'s been pending since the founding."',
          'CALLER, Raul on the Sponsor Strip: "Does the fellow have a personal opinion?" THAD: "He did. It was acquired in a merger."'
        ],
        outro: 'Thanks to our fellow. He has to go publish whatever we just said.'
      },
      {
        id: 'hoax_hour', title: 'The Hoax Hour',
        intro: 'It\'s the Hoax Hour. Is the hour itself a hoax? We take calls, from one side.',
        exchanges: [
          'CALLER, Phil at the airport: "The airport only has one runway." THAD: "Hoax. Its owner rated it two tens. That\'s two runways."',
          'CALLER, June in Culdesac Heights: "Is the balloon office really about weather?" THAD: "Fourteen antennas. For clouds. Next."',
          'CALLER, Sid at Velvetine Docks: "That yacht has never sailed." THAD: "Hoax. It sails emotionally. Every night."',
          'CALLER, Nora at the Printworks: "Who orders the Monday Memo?" THAD: "Nobody, Nora. That\'s what makes it efficient."',
          'CALLER, Hank in Chyron Center: "Is this segment a hoax?" THAD: "Screener, cut him. He\'s too good at this."'
        ],
        outro: 'The Hoax Hour is over. Or is it. It is. We have ads.'
      },
      {
        id: 'hoa_hotline', title: 'HOA Hotline',
        intro: 'HOA Hotline. Report your neighbor, your mailbox, and your own lawn before it reports you.',
        exchanges: [
          'CALLER, Margery in Culdesac Heights: "My neighbor\'s mailbox is two inches too tall." THAD: "Two stars. Maybe three. Lock your doors."',
          'CALLER, Doug on Trustless Terrace: "The HOA gave me a wanted level for a hose." THAD: "Was it coiled? No? Then you know what you did."',
          'CALLER, Patrice in Culdesac Heights: "Can the HOA arrest me?" THAD: "Legally, no. Spiritually, they already have."',
          'CALLER, Al on Pellet Place: "The gas price went up again." THAD: "Blame the pump, Al. The HOA approved it. They will not approve you."',
          'CALLER, Gail in Culdesac Heights: "I\'d like to report myself." THAD: "Finally, a responsible citizen. Four stars, in your own driveway."'
        ],
        outro: 'HOA Hotline is closed. Your lawn was measured during the call.'
      },
      {
        id: 'sponsor_confessional', title: 'Sponsor Confessional',
        intro: 'Sponsor Confessional, where sponsors call in and we thank them. Mostly we thank them.',
        exchanges: [
          'CALLER, Dale Firmness at the Mattress Depot: "Just saying hi." THAD: "Dale! Sir! The whole show runs on you. Code TAKES20, folks."',
          'CALLER, Dale Firmness, again: "I heard you mention a pillow, Thad." THAD: "Never happened, Dale. I said nap. Nap Dynasty."',
          'CALLER, Marla at Octane Opinions: "Is premium worth it?" THAD: "Marla, you own the pump. You know it\'s regular with a stance."',
          'CALLER, Ray at Detail & Evidence: "We\'d like to sponsor this segment." THAD: "Sold. Your records are clean. Ours are cleaner."',
          'CALLER, Dale Firmness: "I\'ve never actually sat on a mattress." THAD: "And that, folks, is sponsored silence."'
        ],
        outro: 'That\'s Sponsor Confessional. Absolution was provided by Nap Dynasty. Code TAKES20.'
      },
      {
        id: 'weather_opinion', title: 'The Weather Is an Opinion',
        intro: 'Time for the weather. Remember: our weather is an opinion, and yours is wrong.',
        exchanges: [
          'CALLER, Lou in Pennant Point: "It\'s raining here." THAD: "The President rated it sunny. You\'re just wet with a stance."',
          'CALLER, Kendra at the port: "Is it going to snow?" THAD: "Snow is a Fulcrum talking point. The other door."',
          'CALLER, Otis on the Sponsor Strip: "The forecast says partly cloudy." THAD: "Partly? Pick a side, Otis."',
          'CALLER, Mo on Lobby Row: "There\'s a weather balloon over my house." THAD: "That\'s not a balloon, Mo. That\'s a subscription."',
          'CALLER, Ines at Velvetine Docks: "What\'s tomorrow\'s high?" THAD: "Nap Dynasty presents a firm seventy-two. Code TAKES20."'
        ],
        outro: 'That was the weather. Disagree? Call in. You\'ll still be wrong, but on the radio.'
      },
      {
        id: 'pundit_desk', title: 'The $PUNDIT Trading Desk',
        intro: 'The $PUNDIT Trading Desk. A coin backed by takes, and takes backed by nothing. Trustless.',
        exchanges: [
          'CALLER, Brent in Culdesac Heights: "Should I buy $PUNDIT?" THAD: "It\'s trustless, Brent. That means trust me. You shouldn\'t."',
          'CALLER, Gina at Founders\' College: "I put my tuition in $PUNDIT." THAD: "Bold. You now have liquidity. And no tuition."',
          'CALLER, Hal uptown: "My grandfather never bought coins." THAD: "He bought opinions, Hal. Same chart, slower."',
          'CALLER, Terry at the airport: "It went up, down, then shed." THAD: "That\'s the shed phase. Moonsworth calls it a roadmap."',
          'CALLER, Ana on Lobby Row: "Can I buy a sandwich with it?" THAD: "Everything is liquidity, Ana. The sandwich declined."'
        ],
        outro: '$PUNDIT closes the hour at a number. That\'s all we can legally say.'
      }
    ]
  };

  // --------------------------------------------------------------- news --
  // Top-of-the-hour bulletins. `order` is story order: the latest key the
  // player has reached leads the bulletin. Keys are story flags
  // (GTP.Missions.state.flags) or 'mission:<id>' (GTP.Missions.state.completed).
  var NEWS = {
    every: 'hour',
    jingle: { notes: [7, 4, 7, 11] },   // a hint for an engine that plays a news sting
    intros: {
      wail_101: 'WAIL 101 NEWS. EVERYTHING IS BREAKING. HERE IS WHAT BROKE:',
      pennant_fm: 'PENNANT FM NEWS, RATED A TEN. TODAY\'S TOP TENS:',
      velvetine_888: 'VELVETINE NEWS, READ SOFTLY. TO WHATEVER THIS IS:',
      quiet_signal: 'A BULLETIN HAS BEEN ISSUED. THE FOLLOWING HAS BEEN REPORTED:',
      office_hours: 'OFFICE HOURS NEWS BREAK. WE SKIMMED THE HEADLINES FOR YOU:',
      loop_174: 'LOOP 174 NEWS AT FIFTY-FIVE! HEADLINES AT THE LEGAL LIMIT:'
    },
    start: [
      'LOCAL STUDENT HAULS FOLDING TABLE ONTO QUAD; NO CHAIRS SIGHTED',
      'NAP DYNASTY EXTENDS CODE TAKES20 INDEFINITELY; NOBODY KNOWS WHAT IT IS FOR',
      'FOUNDERS\' COLLEGE REPORTS RECORD TABLE ATTENDANCE; CLASSROOMS EMPTY',
      'GOLDPLATE RATES THIS MORNING A TEN; MORNING DISPUTES IT',
      'FULCRUM ANNOUNCES STUDY OF UPCOMING STUDY; RESULTS ALREADY KNOWN',
      'RACCOON SPOTTED IN LOT C; DECLINES COMMENT, UNLIKE EVERYONE ELSE'
    ],
    byFlag: {
      has_table: [
        'TAKESWORTH WINS FIRST QUAD DEBATE ON VOLUME; OPPONENT HAD DONE THE READING',
        'FRESHMAN WHO READ THE BOOK DEFEATED; BOOK UNAVAILABLE FOR COMMENT',
        'QUAD DEBATE ENDS WITH ZERO MINDS CHANGED; CROWD WAS LOUD, WHICH COUNTS HERE'
      ],
      has_van: [
        'LOUD & CORRECT VAN WRAPPED; PRESIDENT RATES IT A TWO, PERSONALLY',
        'PODCAST VAN SPOTTED ON THE LOOP; LEGALLY A PARTY OF ONE',
        'TAKESWORTH NOW OWNS A VAN; NEIGHBORS LOCK UP THEIR MICROPHONES',
        'LOCAL PUNDIT DECLARED "PRE-VIRAL"; DOCTORS UNSURE IF CONTAGIOUS'
      ],
      seen_airport: [
        'TAKESWORTH VISITS GOLDPLATE INTERNATIONAL; GATE CHANGES WHEN HE REACHES IT',
        'ONE FLIGHT DEPARTS GOLDPLATE INTERNATIONAL; FLIGHT IS A TRUCK'
      ],
      sponsored: [
        'NAP DYNASTY SIGNS LOCAL PUNDIT; COUPON CODE NOW TALLER THAN HIM',
        'TAKESWORTH READS FIRST AD, CALLS IT JOURNALISM; JOURNALISTS SIGH',
        'DALE FIRMNESS ADDS ANOTHER SHOW TO PORTFOLIO; PORTFOLIO IS THE CITY'
      ],
      range_trained: [
        'LOCAL PUNDIT COMPLETES RANGE LESSON AT BOTH SIDES ARMS; BOTH SIDES APPLAUD',
        'MERLE FIRMNESS GRADES PUNDIT\'S AIM "LOUD"; CARDBOARD CUTOUTS UNMOVED'
      ],
      a_voice: [
        'FOUR-MINUTE CABLE HIT LASTS NINETY SECONDS; TAKESWORTH NOW "A VOICE"',
        'CHYRON INTERRUPTS GUEST WITH BREAKING NEWS; NEWS IS CHYRON',
        'LOCAL PUNDIT APPEARS IN LOWER-THIRD; LOWER-THIRD MISSPELLS HIM TWICE'
      ],
      contract_sold: [
        'VAULTWRIGHT SELLS TAKESWORTH CONTRACT; WHISPERS PRICE, NOBODY HEARS IT',
        'LOCAL PUNDIT LENT OUT LIKE A LAWN MOWER; LAWN MOWERS OFFENDED',
        'VAULTWRIGHT CALLS THE SALE "A HEDGE"; HEDGE MAZE DECLINES COMMENT'
      ],
      table_loaned: [
        'MUSEUM OF TAKES LOSES ITS FIRST TAKE; TABLE NOW ON LOAN TO A HEDGE MAZE',
        'HEIRLOOM CLUB ADMIRES FOLDING TABLE; ASKS WHO ITS GRANDFATHER LISTENED WITH'
      ],
      show_renamed: [
        'GOLDPLATE RENAMES LOUD & CORRECT "THE GOLDPLATE HOUR WITH GOLDPLATE"; RATES IT A TEN',
        'TAKESWORTH SHOW HAS A NEW NAME; HOST LAST TO KNOW',
        'PRESIDENT RENAMES PODCAST TWICE; SECOND NAME IS THE FIRST NAME AGAIN'
      ],
      theft_pinned: [
        'WAREHOUSE 42 THEFT PINNED ON LOCAL PUNDIT; BARON TOASTS THE INVESTIGATION',
        'STOLEN CRATES FOUND TO CONTAIN NOTHING; NOTHING STILL CHARTING',
        'VELVETINE CALLS TAKESWORTH "A PERSON OF INTEREST"; FIRST TIME ANYONE HAS'
      ],
      ferry_friend: [
        'TAKESWORTH BOARDS FERRY TO ELSEWHERE; FERRY REMAINS HERE',
        'FERRY ANNOUNCER MAKES A NEW FRIEND; DEPARTURE STILL "SOON"'
      ],
      scooters_billed: [
        'DEFENSE SCOOTERS BILLED TO PODCAST; WARBANNER SAYS THAT\'S WHY WE NEED THE JETS',
        'LOUD & CORRECT BILLED FOR FOUR HUNDRED SCOOTERS; SCOOTERS SOLD TO BOTH SIDES',
        'TAKESWORTH OPENS SCOOTER INVOICE; INVOICE SIGNED "RESPECTFULY," ONE L'
      ],
      jets_arrived: [
        'BRAVADIA\'S JETS ARRIVE ON A TRUCK; WARBANNER DECLARES LIFT',
        'JETS DELIVERED IN PROFILE; WARBANNER: "AND THAT\'S WHY WE NEED MORE JETS"',
        'RUNWAY 10/10 WELCOMES FIRST JET; JET HAS NOT LEFT THE TRAILER'
      ],
      has_memo: [
        'DEAD DROP UNDER BRIDGE CONTAINS AD COPY; SPYCRAFT RATED A FOUR',
        'OVA DENIES RECRUITING PODCASTER; ANTENNA COUNT RISES TO FIFTEEN',
        'LOCAL PUNDIT NAMED AN "ASSET"; ASSET VALUED AT ONE BAGEL'
      ],
      byline: [
        'HOT MIC AT CUSTOMS CATCHES LOCAL PUNDIT; QUOTE DECLARED, NOT DISCLOSED',
        'TAKESWORTH EARNS FIRST BYLINE; BYLINE IS A LEAK'
      ],
      hoa_enemy: [
        'HOA ISSUES WANTED LEVEL ON LOCAL PUNDIT; ALSO ON HIS MAILBOX, PRE-EMPTIVELY',
        'PELLET DELIVERY REACHES HOA HALL; TWO PATROL SUVS DECLARED "CLEANSED"',
        'TAKESWORTH NOW WANTED IN CULDESAC HEIGHTS; LAWN SIGNS SHARPENED'
      ],
      rugged: [
        '$PUNDIT RUG-PULLED; MOONSWORTH CALLS IT A TRUSTLESS EXIT',
        'MOONSWORTH\'S CAR WRAP NOW WORTH MORE THAN THE COIN IT ADVERTISES',
        'LOCAL PUNDIT LOSES ALL LIQUIDITY; LIQUIDITY WAS A SANDWICH'
      ],
      knows_memo: [
        'EVERY TALKING POINT TRACED TO ONE MONDAY MEMO; MEMO TRACED TO A COMMENT SECTION',
        '"RESPECTFULY" TYPO FOUND IN EVERY SCRIPT IN THE CITY; ONE L, ALL FACTIONS',
        'OVA HAS NO OPERATIONS FLOOR, ONLY SUBSCRIBERS; SUBSCRIBERS DEMAND REFUND'
      ],
      cited: [
        'FULCRUM CITATION FINALLY FOUND AT MUSEUM; CITATION CITES FULCRUM',
        'LOCAL PUNDIT CHASES FOOTNOTE ACROSS HEIRLOOM HEIGHTS; FOOTNOTE STILL PENDING'
      ],
      survived_thursday: [
        'ALL FACTIONS CONVERGE ON THE QUAD THURSDAY; TABLE HOLDS',
        '"DUNK DESTROYS TAKESWORTH" WAS ON THE CALENDAR; CALENDAR WRONG FOR ONCE',
        'LOCAL PUNDIT OUTLASTS ENTIRE POLICE DEPARTMENT; DEPARTMENT RATES IT A SIX'
      ],
      launched: [
        'RATIO LAUNCHER FIRED AT CONTAINER YARD; EVERY CONTAINER STILL MERCH',
        'LOCAL PUNDIT RATIOS A CRANE; CRANE MOVES ZERO CARGO IN PROTEST'
      ],
      offered_chair: [
        'CHYRON PANEL OFFERS TAKESWORTH THE ANCHOR CHAIR; CHAIR IS ALSO A MATTRESS',
        'FIVE PANELISTS GIVE FIVE IDENTICAL ANSWERS; ALL FIVE SIGNED "RESPECTFULY"',
        'ANCHOR CHAIR COMES WITH PRIMETIME SLOT; PRIMETIME COMES WITH DALE FIRMNESS'
      ],
      ending_primetime: [
        'TAKESWORTH TAKES THE CHAIR; SPONSOR READ ENTERS DAY FOUR',
        'GOLD FOLDING TABLE INSTALLED ON GOLDPLATE TOWER ROOF; RATED A TEN',
        'PRIMETIME HOST LOSES RATIO WAR TO OWN ARCHIVE; ARCHIVE CLAIMS MANDATE'
      ],
      ending_grass: [
        'LOCAL PUNDIT READS MONDAY MEMO LIVE ON AIR; CHYRON DOES NOT LEAVE IT THERE',
        'NEW SIGN ON QUAD READS "I DON\'T KNOW. LET\'S TALK."; ELEVEN PEOPLE STAY',
        'DUNK SETS UP SAME SIGN AT NEXT TABLE; RATIO DECLARED A TIE'
      ]
    },
    byMission: {
      m01c_both_sides: [
        'MERLE FIRMNESS GIVES LOCAL PUNDIT A FREE PISTOL; BULLETS ARE THE BUSINESS MODEL',
        'BOTH SIDES ARMS ENROLLS LOCAL PUNDIT IN LOYALTY PROGRAM; NOBODY HAS EVER QUALIFIED'
      ],
      m03_ratio: [
        'TAKESWORTH WINS RATIO WAR ON BOTH BILLBOARDS; PTOLEMY DUNK REPLIES WITHOUT READING',
        'DUNK\'S CHAT VISITS IMPRESSION ALLEY; FOUR ATTENDEES COUNTED AS REACH',
        'LOCAL PUNDIT ACQUIRES MEGAPHONE; NEIGHBORS ACQUIRE EARPLUGS'
      ],
      b01_goldplate: [
        'GOLD HELICOPTER GROUNDED BY RIBBON SPOOLS; ROOF SIGN STILL COUNTS 2, TICKER STILL SAYS BOTH',
        'PRESIDENT\'S HELICOPTER TANGLED IN OWN RIBBON; RIBBON RATED A TEN',
        'GOLDPLATE SAYS HELICOPTER IS "RESTING"; RENAMES THE GROUND "GOLDPLATE GROUND"'
      ],
      b02_velvetine: [
        'SILENT YACHT\'S SPEAKERS SWITCHED ON; SIX BLOW, GUESTS ENJOY IT ANYWAY',
        'AFTERPARTY PLAYS MUSIC FOR THE FIRST TIME; BARON TOASTS "TO LIKING IT, I SUPPOSE"',
        'VELVETINE YACHT STILL HAS NOT SAILED; HAS NOW, BRIEFLY, PLAYED'
      ],
      b03_warbanner: [
        'JET FLYOVER MISSES LOCAL PUNDIT; WARBANNER SAYS THAT\'S WHY WE NEED BETTER JETS',
        'DEFENSE SCOOTER FLEET WRECKED; BOTH SIDES DEMAND REFUNDS FROM EACH OTHER',
        'BRAVADIA ISSUES 400 PRESS RELEASES ON SCOOTERS; VOLUME IS POLICY'
      ],
      b04_redacted: [
        'GIANT WEATHER BALLOON POPPED OVER PRINTWORKS; OVA DENIES BALLOON, BALLOON DENIES OVA',
        'AGENT REDACTED COMMENTS ON BALLOON: "[REDACTED]"',
        'WEATHER BALLOON REPAIR DEPOT FINALLY HAS A BALLOON TO REPAIR'
      ],
      h01_casing: [
        'VAULTWRIGHT CAPITAL VISITED BY "TOURISTS" PHOTOGRAPHING ONLY THE VAULT DOOR; VAULT DOOR IS A HEDGE',
        'BANK GUARDS REVEALED TO BE UNPAID INTERNS; LOCAL INTERN, 54, CALLS IT A UNION'
      ],
      h02_prep: [
        'GUS\'S GARAGE TAKES IN A VEHICLE NOBODY WILL ADMIT TO; GUS CALLS IT "PREP"',
        'LOCAL INTERN, 54, LAMINATES A PLAN; ASKS IF LAMINATING IS PAID'
      ],
      h03_job: [
        'VAULTWRIGHT CAPITAL REPORTS A "RETRIEVAL"; HEDGE CASH DOWN, HEDGE MAZE UNMOVED',
        'TAKESWORTH RECOVERS OWN CONTRACT; BACK PAGE IS A MEMO SUBSCRIPTION SIGNED "RESPECTFULY"',
        'VAULTWRIGHT WHISPERS THE LOSS; NOBODY HEARS THE FIGURE, EVERYONE HEARS THE ALARM'
      ],
      b05_dunk: [
        'TABLE-TO-TABLE BRAWL ON THE QUAD; PTOLEMY DUNK DIDN\'T READ THE RULES',
        'DUNK RATIOED BY TAKESWORTH; DUNK REPLIES ANYWAY',
        'FOLDING TABLE INDUSTRY REPORTS RECORD QUARTER AFTER QUAD BRAWL'
      ],
      b06_panel: [
        'STADIUM UNDERCARD: DEBATE ROUNDS, GOON WAVES, ONE FOLDING TABLE STILL STANDING',
        'PRESIDENT LOSES UNDERCARD HE WAS ON; RATES LOSING A TEN',
        'UNDERCARD CROWD TURNS OUT TO BE EVERYONE\'S GOONS; STADIUM SELLS OUT BOTH WORDS'
      ]
    },
    // story order (v0.3 chain); the two endings share the last slot
    order: [
      'has_table', 'has_van', 'mission:m01c_both_sides', 'seen_airport', 'sponsored', 'mission:m03_ratio', 'range_trained', 'a_voice',
      'contract_sold', 'table_loaned', 'show_renamed', 'mission:b01_goldplate', 'theft_pinned', 'ferry_friend',
      'mission:b02_velvetine', 'scooters_billed', 'jets_arrived', 'mission:b03_warbanner', 'has_memo', 'byline',
      'mission:b04_redacted', 'hoa_enemy', 'rugged', 'knows_memo', 'cited', 'mission:h01_casing', 'mission:h02_prep',
      'mission:h03_job', 'survived_thursday', 'mission:b05_dunk', 'launched', 'mission:b06_panel', 'offered_chair',
      'ending_primetime', 'ending_grass'
    ]
  };

  // ------------------------------------------------------------- module --
  var RADIO = GTP.Content.radio = {
    napMinute: 20,
    defaultStation: 'wail_101',
    stations: STATIONS,
    callin: CALLIN,
    news: NEWS,
    errors: [],   // authoring problems found while compiling the songs (tests assert none)

    // ---------------------------------------------------------- ticker --
    ticker: [
      'GOLDPLATE RATES CITY BUDGET A TEN; BUDGET IS A TWO',
      'PM WARBANNER ADDRESSES COUNCIL; NEEDS JETS',
      'FULCRUM STUDY FINDS FULCRUM STUDIES ACCURATE',
      '$PUNDIT HITS ALL-TIME HIGH, THEN LOW, THEN SHED',
      'PERPETUAL ASSEMBLY UPDATES CAUSE; GIFT SHOP UNCHANGED',
      'OVA DENIES EXISTING; ANTENNA COUNT RISES TO FOURTEEN',
      'HOA ISSUES WANTED LEVEL ON A MAILBOX',
      'CHYRON INTERRUPTS SELF, WINS',
      'PRESIDENT RENAMES GOLDPLATE BRIDGE "GOLDPLATE GOLDPLATE BRIDGE"',
      'CAWTI PROTESTS TUESDAY, COUNTER-PROTESTS ITSELF WEDNESDAY',
      'NAP DYNASTY SPONSORS THE WEATHER; WEATHER NOW FIRMER',
      'LOCAL PUNDIT NOT A JOURNALIST, JOURNALISTS CONFIRM',
      'NAP DYNASTY SHOWROOM PODIUM HOSTS THIRD BRIEFING THIS WEEK; MATTRESS TAKES NO QUESTIONS',
      'GOLDPLATE RATES THE MOON A NINE; MOON TO BE RENAMED',
      'WARBANNER OFFERS CONDOLENCES; ALSO NEEDS JETS',
      'CLARITY PELLETS NOW IN GUMMY FORM; YOUR DOCTOR STILL WON\'T SAY',
      'CAWTI PROTESTS THE PROTEST SCHEDULE; SCHEDULE PROTESTS BACK',
      'THINK TANK FINDS THINKING OVERRATED; TANK RATED A TEN',
      'GREEN ROOM BAGEL SUPPLY HITS RECORD LOW; HOSTILITY HOLDS STEADY',
      'CHYRON FINISHES A SENTENCE; NETWORK OPENS INQUIRY',
      '$PUNDIT DECLARED TRUSTLESS BY EVERYONE WHO TRUSTED IT',
      'LOOP DRIVERS REMINDED THEY ARE LEGALLY A PARTY; PARTY ASKED TO SIGNAL',
      'BARON VELVETINE ANNOUNCES TOUR; ELEVEN CITIES, ZERO SONGS',
      'INTERN, 54, ASKS IF THIS HEADLINE IS PAID; IT IS NOT'
    ],

    // ----------------------------------------------------------- barks --
    // `ped` is the GDD's list of twenty, in order. `byDistrict` groups the
    // same strings by where they land best (speakLine picks by district);
    // every district also gets the universal lines. Role lists follow.
    barks: {
      ped: [
        'Didn\'t read it. Replied anyway.',
        'Is this the line for the debate or the mattress?',
        'I have a take. It\'s warm. Fresh Takes reheats it.',
        'My doctor won\'t tell me anything. I don\'t have a doctor.',
        'Code TAKES20. I don\'t know what it\'s for. I say it when I\'m sad.',
        'The protest\'s about cheese today. Yesterday it was against cheese.',
        'The stadium has two names and one bathroom.',
        'I subscribed to the memo. It\'s just my own comments. Five stars.',
        'Rate my commute. Goldplate rated it a ten. It\'s the same commute.',
        'The Baron\'s party had no music. Best night of my life.',
        'I\'m not a journalist either. We should start a podcast.',
        'The HOA gave me a wanted star for a mailbox. The mailbox is fine.',
        'Trustless means trust him. I learned that the expensive way.',
        'Respectfully? Nobody who says that means it.',
        'The weather balloon office has fourteen antennas now. For weather.',
        'The pellets did nothing. The barn was nice.',
        'I was on the panel. I read the memo. Everyone read the memo.',
        'My van got rated a two. By the President. Personally.',
        'Static is content. I heard that on the radio. There was no radio.',
        'Four hours in the green room for ninety seconds. Worth it. I was the lower-third.'
      ],
      byDistrict: {}, // filled below from `ped` by 1-based line number
      cop: [
        'Stop! I rate this chase a four!',
        'Pull over! The HOA already called it in!',
        'Discourse violation! Hands where I can quote them!',
        'Freeze! You\'re peaking!',
        'Respectfully, you\'re under arrest. No, I mean it.',
        'This is the balloon unit! We\'re not the balloon unit!',
        'Step away from the table!',
        'Busted! Rate your arrest, one to ten!'
      ],
      copIdle: [
        'Move along. Rate it a five.',
        'Nothing to see here. Rate it anyway.',
        'Lost and found is the suggestion box.',
        '"Debate" is not a permit category.'
      ],
      protester: [
        'WHOSE CHEESE? OUR CHEESE!',
        'We\'re not here to recruit you! Sign here!',
        'Hey hey, ho ho, whatever this is has got to go!',
        'We were against this yesterday! Keep up!',
        'Three signs, one chant, pick a side!',
        'No cheese! Some cheese! We\'ll know when we get there!',
        'Honk if you\'re confused! We are!',
        'Stop ramming! Stop honking! Stop debating!'
      ],
      thug: [
        'Memo says you\'re done, kid.',
        'Nothing personal. It\'s on the calendar.',
        'Same grift, different lanyard. Mine\'s nicer.',
        'Thursday, pal. Read the memo.',
        'Respectfully? Nah.',
        'The boss subscribed. So I\'m here.'
      ],
      npc: [
        'Per the memo, no comment.',
        'My people will pod with your people.',
        'Fulcrum\'s calling. Both lines.',
        'Bronze salad, again.',
        'Let\'s circle back after the jets.',
        'I don\'t read it. I subscribe.'
      ],
      panic: [
        'Not the table!',
        'Someone post this!',
        'He\'s peaking!',
        'Ratio incoming!',
        'My lanyard!',
        'Respectfully, run!'
      ],
      honk: ['HONK!', 'BEEP.', 'HOOONK', 'Honk if you feel it.']
    },

    // ------------------------------------------------------ fail texts --
    failTexts: {
      wasted: 'RATIO\'D',
      busted: 'DEPLATFORMED',
      missionFailed: 'CONTEXT STAMPED'
    }
  };

  // Group the twenty ped barks by district (1-based line numbers from the
  // GDD list). Lines 1, 14 and 19 are universal.
  (function () {
    var B = RADIO.barks;
    var universal = [1, 14, 19];
    var map = {
      campus: [2, 6, 11, 17],
      downtown: [5, 8, 9, 11, 17, 20],
      strip: [2, 5, 20],
      capitol: [6, 8, 15],
      hills: [7, 9, 18],
      suburbs: [4, 12, 13, 16],
      industrial: [15, 18, 19],
      marina: [3, 10]
    };
    for (var d in map) {
      var nums = map[d].concat(universal), lines = [];
      for (var i = 0; i < nums.length; i++) if (lines.indexOf(B.ped[nums[i] - 1]) < 0) lines.push(B.ped[nums[i] - 1]);
      B.byDistrict[d] = lines;
    }
  })();

  // ------------------------------------------------------- song compiler --
  // Expands every song into absolute 16-step arrays per bar (relative bass
  // added to the chord root, key shifts applied, fills placed) and builds the
  // station timeline. Problems go to RADIO.errors instead of throwing.
  var cache = {};
  function err(msg) { RADIO.errors.push(msg); }
  function notes(str, where) {
    var key = 'n' + str; if (cache[key]) return cache[key];
    var tok = String(str).trim().split(/\s+/), out = [];
    if (tok.length !== 16) err(where + ': ' + tok.length + ' note tokens, want 16');
    for (var i = 0; i < 16; i++) {
      var t = tok[i];
      if (t == null || t === '.') { out.push(_); continue; }
      var v = parseInt(t, 10);
      if (!isFinite(v) || String(v) !== t) { err(where + ': bad token "' + t + '"'); out.push(_); } else out.push(v);
    }
    return (cache[key] = out);
  }
  function hits(str, where) {
    var key = 'd' + str; if (cache[key]) return cache[key];
    var s = String(str).replace(/\s+/g, ''), out = [];
    if (s.length !== 16) err(where + ': ' + s.length + ' drum steps, want 16');
    for (var i = 0; i < 16; i++) out.push(s.charAt(i) === 'x' ? 1 : 0);
    return (cache[key] = out);
  }
  function pick(lane, bar) { return lane == null ? null : (typeof lane === 'string' ? lane : lane[bar % lane.length]); }
  function shifted(arr, by) {
    if (!by) return arr;
    var out = new Array(16);
    for (var i = 0; i < 16; i++) out[i] = arr[i] == null ? _ : arr[i] + by;
    return out;
  }
  // 'TALK:a:b' is the talk station's eight-bar section: stinger a on bar 0,
  // stinger b on bar 4, a quiet bed for engines without a talk mode.
  function talkSection(spec) {
    var p = spec.split(':'), a = p[1], b = p[2], L = [];
    for (var i = 0; i < 8; i++) L.push(i === 0 ? a + ' . . . . . . . . . . . . . . .' : i === 4 ? b + ' . . . . . . . . . . . . . . .' : R0);
    return { c: [0, 0, 0, 0, 5, 5, 4, 4], rb: true, b: '0 . . . . . . . . . . . . . . .', l: L, h: '........x.......' };
  }

  function compileStation(st, si) {
    var bars = [], starts = [], songsOut = [];
    var songs = st.songs || [];
    for (var k = 0; k < songs.length; k++) {
      var song = songs[k], where = st.id + '/' + song.id;
      var secs = {}, name;
      for (name in song.sections) {
        var raw = song.sections[name];
        if (typeof raw === 'string' && raw.indexOf('TALK') === 0) raw = talkSection(raw);
        var c = raw.c || [0], n = c.length, S = { bars: n, chords: c.slice(), bass: [], lead: [], drums: { kick: [], snare: [], hat: [] }, relBass: !!raw.rb };
        if (raw.sus != null) S.sustain = raw.sus;
        if (raw.sw != null) S.swing = raw.sw;
        if (raw.wave) S.wave = raw.wave;
        for (var b = 0; b < n; b++) {
          var w = where + '.' + name + '[' + b + ']';
          var bs = pick(raw.b, b), ls = pick(raw.l, b);
          var ba = bs ? notes(bs, w + '.bass') : notes(R0, w);
          if (raw.rb) ba = shifted(ba, c[b]);
          S.bass.push(ba);
          S.lead.push(ls ? notes(ls, w + '.lead') : notes(R0, w));
          S.drums.kick.push(hits(pick(raw.k, b) || D0, w + '.kick'));
          S.drums.snare.push(hits(pick(raw.s, b) || D0, w + '.snare'));
          S.drums.hat.push(hits(pick(raw.h, b) || D0, w + '.hat'));
        }
        secs[name] = S;
      }
      var fill = song.fill ? { kick: hits(song.fill.k || D0, where + '.fill'), snare: hits(song.fill.s || D0, where + '.fill'), hat: hits(song.fill.h || D0, where + '.fill') } : null;
      var form = String(song.form).trim().split(/\s+/), start = bars.length;
      starts.push(start);
      for (var f = 0; f < form.length; f++) {
        var m = /^([A-Za-z0-9_]+)(\^(-?\d+))?(!)?$/.exec(form[f]);
        var sec = m && secs[m[1]];
        if (!sec) { err(where + ': unknown form token "' + form[f] + '"'); continue; }
        var by = m[3] ? parseInt(m[3], 10) : 0, fillIt = !!m[4];
        if (fillIt && !fill) err(where + ': "' + form[f] + '" asks for a fill but the song has none');
        for (var bb = 0; bb < sec.bars; bb++) {
          var chord = sec.chords[bb] + by, last = bb === sec.bars - 1;
          var drums = (fillIt && last && fill) ? fill : { kick: sec.drums.kick[bb], snare: sec.drums.snare[bb], hat: sec.drums.hat[bb] };
          bars.push({
            steps: 16,
            bass: shifted(sec.bass[bb], by),
            lead: shifted(sec.lead[bb], by),
            chords: [chord, chord, chord, chord],
            drums: drums,
            swing: sec.swing != null ? sec.swing : (song.swing != null ? song.swing : st.swing || 0),
            sustain: sec.sustain != null ? sec.sustain : (song.sustain != null ? song.sustain : (st.sustain == null ? 0.5 : st.sustain)),
            wave: sec.wave || song.wave || st.wave,
            song: k, section: m[1], shift: by, fill: fillIt && last, bar: bb
          });
        }
      }
      songsOut.push({ id: song.id, title: song.title, artist: song.artist, bars: bars.length - start, form: form, sections: secs });
      if (st.talk && (bars.length - start) % 12 !== 0) err(where + ': a talk-station song must be a multiple of 12 bars, has ' + (bars.length - start));
    }
    st.songs = songsOut;
    return { bars: bars, starts: starts };
  }

  // ----------------------------------------------------- live pattern view --
  // `station.pattern` keeps the v0.2 schema; each lane is a getter for the bar
  // now playing. The bar comes from the engine's own bar counter
  // (GTP.Audio.radio.state().talkBar, which restarts at a retune). While the
  // engine is not sequencing (muted, no or suspended AudioContext, headless) a
  // wall-clock bar count carries the song on, so the ticker does not freeze on
  // one title. Loaded with no engine at all (node, tools) the wall clock stands
  // in; it is not phase-locked to an engine's step grid. A retune moves on to
  // the next song.
  var LIVE = {}, rendering = 0;
  function songOf(T, pos) { var s = 0; for (var i = 0; i < T.starts.length; i++) if (T.starts[i] <= pos) s = i; return s; }
  function wallBar(st) { return Math.floor(Date.now() / 1000 / (240 / (st.bpm || 120))); }
  function engineBar(st) {
    var A = GTP.Audio, rs = null, L = LIVE[st.id];
    try { rs = A && A.radio && typeof A.radio.state === 'function' ? A.radio.state() : null; } catch (e) { rs = null; }
    if (rs && rs.id != null && rs.id !== st.id) return { off: true };
    if (rs && typeof rs.talkBar === 'number' && isFinite(rs.talkBar)) {
      if (!rendering && rs.playing === true && rs.live === false) {   // on air but not sequencing: keep time by the clock
        var w = wallBar(st);
        if (L.wall0 == null) L.wall0 = w - Math.max(0, L.last);
        return { bar: w - L.wall0, clock: true };
      }
      L.wall0 = null;
      return { bar: rs.talkBar };
    }
    return { bar: wallBar(st), clock: true };
  }
  function current(st) {
    var L = LIVE[st.id], T = L.T;
    if (!T.bars.length) return null;
    var e = engineBar(st);
    if (e.off) return T.bars[L.pos];
    var cb = e.bar;
    if (cb !== L.last) {
      if (cb < L.last && !e.clock) {   // the engine retuned: the next song (or the cued one) starts
        var next = L.cued != null ? L.cued : (songOf(T, L.pos) + 1) % T.starts.length;
        L.offset = T.starts[next];
      }
      L.cued = null;
      L.last = cb;
      L.pos = (((L.offset + Math.max(0, cb)) % T.bars.length) + T.bars.length) % T.bars.length;
    }
    if (rendering) { var seen = RADIO.lastRender[st.id] || (RADIO.lastRender[st.id] = []); if (seen.indexOf(T.bars[L.pos].song) < 0) seen.push(T.bars[L.pos].song); }
    return T.bars[L.pos];
  }
  function makeView(st, T) {
    LIVE[st.id] = { T: T, last: -2, offset: 0, pos: 0, cued: null, wall0: null };
    var view = { steps: 16, transposeBass: false, kit: st.kit || null };
    if (st.talk) view.talk = true;
    if (st.jingle) view.jingle = st.jingle;
    ['bass', 'lead', 'chords', 'drums', 'swing', 'sustain', 'wave'].forEach(function (k) {
      Object.defineProperty(view, k, { enumerable: true, configurable: true, get: function () { var b = current(st); return b ? b[k] : null; } });
    });
    return view;
  }

  for (var si = 0; si < STATIONS.length; si++) {
    var st = STATIONS[si];
    var T = compileStation(st, si);
    Object.defineProperty(st, 'pattern', { value: makeView(st, T), enumerable: true, configurable: true, writable: true });
    delete st.swing; delete st.sustain; delete st.wave; delete st.talk;
    if (!st.jingle) delete st.jingle;
  }

  // ---------------------------------------------------------- helpers --
  function station(id) {
    var s = RADIO.stations;
    for (var i = 0; i < s.length; i++) if (s[i].id === id) return s[i];
    return s[0];
  }
  // the exact station or null (the song helpers must not fall back to WAIL 101 on a typo)
  function exact(id) {
    var s = RADIO.stations;
    for (var i = 0; i < s.length; i++) if (s[i].id === id) return s[i];
    return null;
  }
  RADIO.station = station;
  // Bark pool for a ped: by role when the role has its own lines, else by
  // district, else the full civilian list.
  RADIO.barksFor = function (role, districtId) {
    var B = RADIO.barks;
    if (role === 'cop') return B.cop;
    if (role && B[role] && role !== 'ped' && B[role].length) return B[role];
    if (districtId && B.byDistrict[districtId]) return B.byDistrict[districtId];
    return B.ped;
  };
  function hourKey() { var g = GTP.game, t = g && g.time; return t ? (t.day | 0) * 24 + Math.floor(t.clock || 0) : 0; }
  // Call-in segments change at minute 5 of the game hour, after the top-of-the-hour
  // bulletin: the UI shows station.bulletins in minutes 0-3 but puts a changed
  // on-air line first, so a segment change at minute 0 would take the bulletin's slot.
  var SEGMENT_MINUTE = 5;
  function segmentKey() { var g = GTP.game, t = g && g.time; return t ? Math.floor((t.day | 0) * 24 + (t.clock || 0) - SEGMENT_MINUTE / 60) : 0; }
  RADIO.segmentMinute = SEGMENT_MINUTE;
  RADIO.segmentIndex = function (k) { var n = CALLIN.segments.length; k = k == null ? segmentKey() : k; return ((k % n) + n) % n; };
  RADIO.segment = function (k) { return CALLIN.segments[RADIO.segmentIndex(k)]; };
  // the flat bar list of a station (every bar shaped like `pattern`), and its song starts
  RADIO.timeline = function (id) { var st = exact(id), L = st && LIVE[st.id]; return L ? L.T.bars : []; };
  RADIO.songStarts = function (id) { var st = exact(id), L = st && LIVE[st.id]; return L ? L.T.starts.slice() : []; };
  // what a station is playing (or would play): song, artist, section, bar
  RADIO.nowPlaying = function (id) {
    var st = exact(id), L = st && LIVE[st.id]; if (!L || !L.T.bars.length) return null;
    current(st);   // a read advances a station the engine is not sequencing (muted, headless)
    var b = L.T.bars[L.pos], s = st.songs[b.song];
    return { station: st.id, song: s.id, title: s.title, artist: s.artist, section: b.section, shift: b.shift, bar: L.pos - L.T.starts[b.song], bars: s.bars, pos: L.pos };
  };
  // Start song k now, or at the next retune when the station is off air. On air,
  // a talk station keeps the engine's 12-bar bumper/talk phase (cycleBar % 12):
  // song k then starts at the next cycle and the current song plays on until it.
  RADIO.cue = function (id, k) {
    var st = exact(id), L = st && LIVE[st.id]; if (!L) return false;
    var n = L.T.starts.length, len = L.T.bars.length; k = ((k | 0) % n + n) % n;
    var cb = Math.max(0, L.last), lead = 0;
    if (st.pattern && st.pattern.talk && L.last >= 0 && !engineBar(st).off && cb % 12) lead = 12 - cb % 12;
    L.cued = k; L.offset = L.T.starts[k] - cb - lead;
    L.pos = (((L.offset + cb) % len) + len) % len;
    return true;
  };

  // a segment intro without a repeat of the segment title ("HOA Hotline. Report..." -> "Report...")
  function introText(seg) { var t = seg.title + '. '; return seg.intro.indexOf(t) === 0 ? seg.intro.slice(t.length) : seg.intro; }

  // Story progress for the news: flags and completed missions.
  function progress() {
    var M = GTP.Missions && GTP.Missions.state, flags = (M && M.flags) || {}, done = M && M.completed;
    return { flags: flags, done: function (id) { return !!done && (typeof done.has === 'function' ? done.has(id) : (Array.isArray(done) ? done.indexOf(id) >= 0 : !!done[id])); } };
  }

  // ------------------------------------------------- parity radio merge --
  // js/25_content_parity.js (content track) loads after this file and carries
  // GTP.Content.parity.radio {ticker, ads, dj, news}. It is merged once, on first
  // use: news[missionId] joins NEWS.byMission; ads are appended (napAd stays
  // valid); ticker and DJ lines that tell a boss or heist outcome stay off air
  // until that mission is done, the rest join the rotation; near-duplicates of
  // lines already on a station are skipped.
  var PARITY_GATES = [
    [/helicopter|bunker/i, 'b01_goldplate'], [/yacht/i, 'b02_velvetine'], [/flyover|second jet/i, 'b03_warbanner'],
    [/balloon/i, 'b04_redacted'], [/nine tables|brawl/i, 'b05_dunk'], [/undercard/i, 'b06_panel'],
    [/bank was visited|retrieval|vault/i, 'h03_job']
  ];
  var parityDj = {};   // station id -> [{text, gate}]
  var STOP = ' that this with from have been they your what will were when then there their them than into just only also about after again over same both each very ';
  function words(x) {
    var out = [];
    String(x).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).forEach(function (w) { if (w.length > 3 && STOP.indexOf(' ' + w + ' ') < 0 && out.indexOf(w) < 0) out.push(w); });
    return out;
  }
  // two lines tell the same joke: most of the shorter line's content words recur in the other
  function similar(a, b) {
    var A = words(a), B = words(b), hit = 0; if (A.length < 3 || B.length < 3) return false;
    for (var i = 0; i < A.length; i++) if (B.indexOf(A[i]) >= 0) hit++;
    return hit / Math.min(A.length, B.length) >= 0.7;
  }
  function nearDup(line, lists) {
    for (var i = 0; i < lists.length; i++) for (var j = 0; j < lists[i].length; j++) if (lists[i][j] === line || similar(lists[i][j], line)) return true;
    return false;
  }
  function gateOf(line) { for (var i = 0; i < PARITY_GATES.length; i++) if (PARITY_GATES[i][0].test(line)) return PARITY_GATES[i][1]; return null; }
  function mergeParity() {
    if (RADIO._parityMerged) return;
    var P = GTP.Content.parity && GTP.Content.parity.radio;
    if (!P) return;
    RADIO._parityMerged = true;
    var newsLines = [], m, id, skipped = RADIO.paritySkipped = [];
    for (m in (P.news || {})) {
      var line = P.news[m]; if (typeof line !== 'string') continue;
      newsLines.push(line);
      var list = NEWS.byMission[m] || (NEWS.byMission[m] = []);
      if (nearDup(line, [list])) skipped.push(line); else list.push(line);
    }
    (P.ticker || []).forEach(function (t) {
      if (typeof t !== 'string' || newsLines.indexOf(t) >= 0 || gateOf(t)) return;   // outcome lines air as news after their mission
      if (nearDup(t, [RADIO.ticker])) { skipped.push(t); return; }
      RADIO.ticker.push(t);
    });
    for (id in (P.ads || {})) {
      var st = exact(id); if (!st) continue;
      (P.ads[id] || []).forEach(function (a) { if (typeof a !== 'string') return; if (nearDup(a, [st.ads])) skipped.push(a); else st.ads.push(a); });
    }
    for (id in (P.dj || {})) {
      var st2 = exact(id); if (!st2) continue;
      var have = [st2.djBase || [], st2.djAll || [], st2.djList || []];
      parityDj[id] = (P.dj[id] || []).filter(function (d) { if (typeof d !== 'string') return false; if (nearDup(d, have)) { skipped.push(d); return false; } return true; }).map(function (d) { return { text: d, gate: gateOf(d) }; });
    }
  }
  RADIO.mergeParity = mergeParity;
  // the parity DJ lines a station may air now (outcome lines once their mission is done)
  function parityDjFor(id) {
    mergeParity();
    var list = parityDj[id]; if (!list || !list.length) return [];
    var p = progress(), out = [];
    for (var i = 0; i < list.length; i++) if (!list[i].gate || p.done(list[i].gate)) out.push(list[i].text);
    return out;
  }
  // `dj` of the music stations: the authored lines plus any parity lines on air
  STATIONS.forEach(function (st) {
    if (st.id === CALLIN.station) return;
    var base = st.dj, cache = { key: null, list: base };
    st.djList = base;
    Object.defineProperty(st, 'dj', {
      enumerable: true, configurable: true,
      get: function () { var extra = parityDjFor(st.id), key = extra.join('|'); if (key !== cache.key) { cache.key = key; cache.list = extra.length ? base.concat(extra) : base; } return cache.list; },
      set: function (v) { if (Array.isArray(v)) base = v; cache.key = null; }
    });
  });

  // WAIL 101's `dj`: the host's lines for the call-in segment on air, framed by
  // the GDD lines; the calls go out as `callers`. `djAll` holds every line.
  (function () {
    var wail = exact('wail_101');
    if (!wail) return;
    var segLists = CALLIN.segments.map(function (seg, i) {
      var base = wail.djBase, list = [CALLIN.show.toUpperCase() + ': ' + seg.title.toUpperCase() + '. ' + introText(seg)];
      for (var e = 0; e < 4; e++) list.push(base[(i * 4 + e) % base.length]);
      list.push(seg.outro);
      return list;
    });
    var all = wail.djBase.slice();
    CALLIN.segments.forEach(function (seg) { all.push(seg.intro); all = all.concat(seg.exchanges); all.push(seg.outro); });
    wail.djAll = all;
    var cache = {};
    Object.defineProperty(wail, 'dj', {
      enumerable: true, configurable: true,
      get: function () {
        var k = RADIO.segmentIndex(), extra = parityDjFor('wail_101'), key = k + '|' + extra.join('|');
        if (cache.key !== key) { cache.key = key; cache.list = extra.length ? segLists[k].concat(extra) : segLists[k]; }
        return cache.list;
      }
    });
  })();

  function reached(key, p) { return key.indexOf('mission:') === 0 ? p.done(key.slice(8)) : !!p.flags[key]; }
  function linesFor(key) { return key.indexOf('mission:') === 0 ? NEWS.byMission[key.slice(8)] : NEWS.byFlag[key]; }
  // The top-of-the-hour bulletin: two headlines from the latest story beat the
  // player has reached, one from an earlier beat (or the start pool, then the
  // general ticker). `prog` may be {flags:{...}, completed:[ids]} for tests.
  RADIO.bulletin = function (stationId, hk, prog) {
    mergeParity();
    hk = hk == null ? hourKey() : hk;
    var p = prog ? { flags: prog.flags || {}, done: function (id) { return (prog.completed || []).indexOf(id) >= 0; } } : progress();
    var got = [];
    for (var i = 0; i < NEWS.order.length; i++) if (reached(NEWS.order[i], p) && linesFor(NEWS.order[i])) got.push(NEWS.order[i]);
    var latest = got.length ? got[got.length - 1] : null;
    var lead = latest ? linesFor(latest) : NEWS.start, n = Math.abs(hk | 0), heads = [];
    heads.push(lead[n % lead.length]);
    if (lead.length > 1) heads.push(lead[(n + 1) % lead.length]);
    var older = got.length > 1 ? linesFor(got[n % (got.length - 1)]) : (latest ? NEWS.start : RADIO.ticker);
    var third = older[(n * 7 + 3) % older.length];
    if (heads.indexOf(third) < 0) heads.push(third);
    var intro = NEWS.intros[stationId] || NEWS.intros.wail_101;
    return { station: stationId || null, hour: hk, stage: latest, headlines: heads, intro: intro, text: intro + ' ' + heads.join(' · ') };
  };

  // ------------------------------------------------------- news runner --
  // Emits 'radio:news' (the bulletin) when a game hour turns over while the
  // player listens in a vehicle. The v0.3 UI shows `station.bulletins` itself
  // (tag NEWS hh:00); only a UI without that support (GTP.UI.radioNews ===
  // false) gets the bulletin pushed through GTP.UI.ticker. Rides on
  // GTP.Audio.update (wrapped here, listed in docs/v03/radio.md).
  var newsState = { lastHour: null, shown: 0 };
  RADIO._newsState = newsState;
  function newsTick() {
    mergeParity();
    var g = GTP.game; if (!g || !g.time || g.state !== 'playing') return;
    var hk = hourKey();
    if (newsState.lastHour == null) { newsState.lastHour = hk; return; }
    if (hk === newsState.lastHour) return;
    newsState.lastHour = hk;
    if (((g.time.clock || 0) % 1) * 60 > 6) return;   // a jump (load, setClock), not the top of the hour
    var p = g.player, A = GTP.Audio;
    if (!p || !p.inVehicle || !A || !A.radio || (A.radio.isPlaying && !A.radio.isPlaying())) return;
    var cur = A.radio.current ? A.radio.current() : null;
    var b = RADIO.bulletin(cur && cur.id, hk);
    newsState.shown++;
    if (GTP.UI && GTP.UI.radioNews === false && typeof GTP.UI.ticker === 'function') GTP.UI.ticker(b.text);
    if (GTP.Events && GTP.Events.emit) GTP.Events.emit('radio:news', b);
  }
  RADIO._newsTick = newsTick;
  // the wrappers call into whichever radio module is current, so a second load of
  // this file (a dev reload, a test) does not leave them bound to the first one
  function liveRadio() { var M = GTP.Content && GTP.Content.radio; return M && M._newsTick ? M : RADIO; }
  if (GTP.Audio && typeof GTP.Audio.update === 'function' && !GTP.Audio._radioNewsWrapped) {
    var audioUpdate = GTP.Audio.update;
    GTP.Audio.update = function () {
      var r = audioUpdate.apply(this, arguments);
      try { liveRadio()._newsTick(); } catch (e) { if (GTP.util && GTP.util.reportError) GTP.util.reportError(e, 'radio.news'); }
      return r;
    };
    GTP.Audio._radioNewsWrapped = true;
  }
  // Audio.render('radio') tunes and sequences a station offline; the getters see
  // its bar counter restart and would move the live song. The wrapper keeps the
  // live song state as it was (scheduling inside render is synchronous).
  RADIO.lastRender = {};   // station id -> song indices the last radio render sequenced (tests)
  RADIO._renderBegin = function () {
    var snap = {}; rendering++; RADIO.lastRender = {};
    for (var id in LIVE) snap[id] = { last: LIVE[id].last, offset: LIVE[id].offset, pos: LIVE[id].pos, cued: LIVE[id].cued, wall0: LIVE[id].wall0 };
    return snap;
  };
  RADIO._renderEnd = function (snap) {
    rendering = Math.max(0, rendering - 1);
    for (var id in snap) { var Lr = LIVE[id], sv = snap[id]; if (!Lr) continue; Lr.last = sv.last; Lr.offset = sv.offset; Lr.pos = sv.pos; Lr.cued = sv.cued; Lr.wall0 = sv.wall0; }
  };
  if (GTP.Audio && typeof GTP.Audio.render === 'function' && !GTP.Audio._radioRenderWrapped) {
    var engineRender = GTP.Audio.render;
    GTP.Audio.render = function (kind) {
      if (kind !== 'radio') return engineRender.apply(this, arguments);
      var M = liveRadio(), snap = M._renderBegin ? M._renderBegin() : null;
      try { return engineRender.apply(this, arguments); } finally { if (snap && M._renderEnd) M._renderEnd(snap); }
    };
    GTP.Audio._radioRenderWrapped = true;
  }

  // ------------------------------------------------------ UI ticker feed --
  // The shapes docs/v03/ui.md reads: station.nowPlaying, station.bulletins,
  // station.callers. All are getters, computed when the ticker asks.
  function callerOf(line) {
    var mm = /^CALLER, ([^:]+): (.*)$/.exec(line);
    return mm ? { caller: mm[1], text: mm[2] } : { caller: 'A caller', text: line };
  }
  var callerLists = CALLIN.segments.map(function (seg) { return seg.exchanges.map(callerOf); });
  RADIO.callers = function (k) { return callerLists[RADIO.segmentIndex(k)]; };
  // what the ticker should call "on air" for a station
  RADIO.onAir = function (id) {
    var st = station(id); if (!st) return null;
    if (st.id === CALLIN.station) {
      var seg = RADIO.segment();
      return { kind: 'show', id: seg.id, station: st.id, title: CALLIN.show + ': ' + seg.title, text: introText(seg), host: CALLIN.host };
    }
    var np = RADIO.nowPlaying(st.id); if (!np) return null;
    return { kind: 'song', id: np.song, station: st.id, title: np.title, artist: np.artist, section: np.section };
  };
  // Each feed is a getter; assigning a value overrides it (a mission or a test
  // can put its own lines on air) and assigning null or undefined hands it back.
  // Restore a feed by assigning null: `delete` removes the live getter itself.
  function feed(st, name, compute) {
    var over;
    Object.defineProperty(st, name, {
      enumerable: false, configurable: true,
      get: function () { return over != null ? over : compute(); },
      set: function (v) { over = v; }
    });
  }
  function onAirNow() { var AR = GTP.Audio && GTP.Audio.radio; return !(AR && typeof AR.isPlaying === 'function' && !AR.isPlaying()); }
  var bulletinCache = {};
  STATIONS.forEach(function (st) {
    // nothing is "now playing" while the engine is silent (parachute, radio stopped, on foot)
    feed(st, 'nowPlaying', function () { return onAirNow() ? RADIO.onAir(st.id) : null; });
    feed(st, 'bulletins', function () {
      var b = RADIO.bulletin(st.id), key = st.id + '|' + b.text, c = bulletinCache[st.id];
      if (!c || c.key !== key) c = bulletinCache[st.id] = { key: key, list: [{ text: b.text, headline: b.headlines[0], stage: b.stage, hour: b.hour }] };
      return c.list;
    });
    if (st.id === CALLIN.station) feed(st, 'callers', function () { return RADIO.callers(); });
  });
  // The UI asks GTP.Audio.radio.nowPlaying() first; the engine returns only a
  // station string. Wrapped: while a station plays it returns a string that
  // names what is on air (the station's nowPlaying feed, so an assigned override
  // shows) ahead of the engine's station text. It stays a plain string.
  if (GTP.Audio && GTP.Audio.radio && typeof GTP.Audio.radio.nowPlaying === 'function' && !GTP.Audio.radio._radioWrapped) {
    var engineNowPlaying = GTP.Audio.radio.nowPlaying;
    GTP.Audio.radio.nowPlaying = function () {
      var text = engineNowPlaying.apply(this, arguments);
      if (!text) return text;
      var cur = null;
      try { cur = GTP.Audio.radio.current ? GTP.Audio.radio.current() : null; } catch (e) { cur = null; }
      var o = cur && cur.nowPlaying;
      if (!o) return text;
      if (typeof o === 'string') return o + '  ·  ' + text;
      var head = o.title || o.text || '';
      return head ? head + (o.artist ? '  ·  ' + o.artist : '') + '  ·  ' + text : text;
    };
    GTP.Audio.radio._radioWrapped = true;
  }

  // ---------------------------------------------------------- streets --
  // GDD section 9. 20_content_world.js owns the grid; if it already named the
  // streets (as GTP.Content.streets or GTP.Content.world.streets) keep its
  // list, otherwise define it here. `kind` is a hint for which grid line gets
  // the name: avenue, street, highway, culdesac.
  var worldStreets = GTP.Content.world && GTP.Content.world.streets;
  if (!GTP.Content.streets && worldStreets) GTP.Content.streets = worldStreets;
  if (!GTP.Content.streets) {
    GTP.Content.streets = [
      { id: 'goldplate_ave', name: 'Goldplate Avenue', kind: 'avenue', note: 'the main avenue' },
      { id: 'goldplate_goldplate_ave', name: 'Goldplate Goldplate Avenue', kind: 'avenue', district: 'hills', note: 'the same avenue, east of the bridge' },
      { id: 'respectfully_rd', name: 'Respectfully Road', kind: 'street', district: 'campus' },
      { id: 'lanyard_ln', name: 'Lanyard Lane', kind: 'street', district: 'campus' },
      { id: 'ratio_row', name: 'Ratio Row', kind: 'street', district: 'downtown' },
      { id: 'lower_third_st', name: 'Lower Third Street', kind: 'street', district: 'downtown' },
      { id: 'sponsor_blvd', name: 'Sponsor Boulevard', kind: 'avenue', district: 'strip' },
      { id: 'citation_pending_way', name: 'Citation Pending Way', kind: 'street', district: 'capitol' },
      { id: 'par_ten_pkwy', name: 'Par Ten Parkway', kind: 'street', district: 'hills' },
      { id: 'balloon_repair_alley', name: 'Balloon Repair Alley', kind: 'street', district: 'industrial' },
      { id: 'trustless_terr', name: 'Trustless Terrace', kind: 'street', district: 'suburbs' },
      { id: 'pellet_pl', name: 'Pellet Place', kind: 'street', district: 'suburbs' },
      { id: 'jet_st', name: 'Jet Street', kind: 'street', district: 'capitol', note: 'extension pending' },
      { id: 'minds_changed_ct', name: 'Minds Changed Court', kind: 'culdesac', district: 'suburbs', note: 'a cul-de-sac with zero houses' },
      { id: 'monday_memo_mews', name: 'Monday Memo Mews', kind: 'street', district: 'industrial' },
      { id: 'quote_post_cres', name: 'Quote Post Crescent', kind: 'street', district: 'marina' },
      { id: 'coupon_code_cir', name: 'Coupon Code Circle', kind: 'street', district: 'strip' },
      { id: 'the_loop', name: 'The Loop', kind: 'highway', note: 'on the Loop you are legally a party' }
    ];
  }
})();
