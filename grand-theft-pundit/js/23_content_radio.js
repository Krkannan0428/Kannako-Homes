/* Grand Theft Pundit: 23_content_radio.js
 * GTP.Content.radio: the four stations (GDD section 8, verbatim), the news
 * ticker, ped and cop barks (GDD section 9), the fail-screen texts, and the
 * street names (GDD section 9) unless 20_content_world.js already defined
 * them. Pure data plus tiny helpers. Loads standalone: it only needs window.
 *
 * Station pattern schema (played by GTP.Audio's radio sequencer):
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
 * four bars, then the host murmurs behind phone-line static for eight).
 *
 * Ads and DJ lines are never spoken: they scroll on the ticker strip. Every
 * station runs its Nap Dynasty ad at minute 20 of the game hour
 * (`napMinute`); `napAd` is the index of that line in each station's `ads`.
 * Every string obeys CONTENT_RULES.md.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.Content = GTP.Content || {};

  var _ = null; // a rest, so the patterns read like a tracker

  GTP.Content.radio = {
    napMinute: 20,
    defaultStation: 'wail_101',

    stations: [
      {
        id: 'wail_101', name: 'WAIL 101 "The Yell"',
        tagline: 'All outrage, all hours.',
        genre: 'brass stingers, march drums, phone-in static',
        bpm: 100, scale: 'minor',
        ads: [
          'Nap Dynasty. Sleep like you\'ve never been wrong. Code TAKES20.',
          'Char & Charter. Steaks sized by donor tier. The salad is Bronze.',
          'Fulcrum Foundation. The numbers you were going to say anyway.',
          'Vaultwright Capital. We short what we love.',
          'Clarity Pellets. Ask your doctor. He won\'t say.',
          'Detail & Evidence. We clean cars and records. Mostly records.'
        ],
        napAd: 0,
        dj: [
          'Caller, you\'re on. You\'re wrong. Go.',
          'Next hour: is the next hour a hoax? We take calls, from one side.',
          'Our weather is also an opinion. Wrong.',
          'That was silence, sponsored by Nap Dynasty.'
        ],
        // A talk-radio bumper: a brass stinger on the downbeat, then the march
        // drums carry the bar while the bass thumps on 1 and 3.
        pattern: {
          steps: 16,
          bass: [0, _, _, _, 4, _, _, _, 0, _, _, _, 4, _, _, _],
          lead: [7, _, 9, _, 11, _, _, _, _, _, _, _, 14, _, 11, _],
          chords: [0, 0, 5, 4],
          drums: {
            kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
            snare: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1],
            hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]
          },
          swing: 0,
          wave: { bass: 'sawtooth', lead: 'square' },
          sustain: 0.35,
          talk: true
        }
      },

      {
        id: 'pennant_fm', name: 'Pennant FM "Ten out of Ten"',
        tagline: 'The President\'s station. Also the President\'s.',
        genre: 'sax synth, elevator chords, a jingle every 40 seconds',
        bpm: 112, scale: 'major',
        ads: [
          'Goldplate Tower, by Goldplate. Floors ten through one hundred now leasing.',
          'Goldplate Links. Par ten. No refunds.',
          'Goldplate Water. Rated a ten by Goldplate.',
          'Goldplate Goldplate Stadium. Both words. Both tens.',
          'Nap Dynasty. Official mattress of Goldplate. Code TENOUTOFTEN.',
          'Goldplate Weather. Tomorrow: a ten.'
        ],
        napAd: 4,
        dj: [
          'That track was a ten.',
          'Coming up: the same song. A ten.',
          'Traffic on Goldplate Avenue is Goldplate.',
          'The President has renamed this station. It\'s still Pennant. He renamed the name.'
        ],
        // Smooth major elevator groove: I vi IV V, soft kick, off-beat hats, a
        // lazy sax phrase that lands on the sixth. Swung.
        pattern: {
          steps: 16,
          bass: [0, _, _, 0, _, _, 4, _, 0, _, _, 0, _, _, 4, _],
          lead: [_, _, 4, _, 5, _, 7, _, _, 9, _, 7, _, 5, _, 4],
          chords: [0, 5, 3, 4],
          drums: {
            kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
            snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
            hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]
          },
          swing: 0.2,
          wave: { bass: 'triangle', lead: 'sawtooth' },
          sustain: 0.8,
          transposeBass: true,
          jingle: { every: 40, notes: [0, 2, 4, 7, 4] }
        }
      },

      {
        id: 'velvetine_888', name: 'Velvetine Lounge 88.8',
        tagline: 'Listening, never dancing.',
        genre: 'deep house with no drop, ice clinks, a spreadsheet read softly',
        bpm: 122, scale: 'minor',
        ads: [
          'Velvetine Listening Pier. A party you\'ll hear about.',
          'Velvetine Records. Nothing released. Still charting.',
          'The Afterparty. A yacht, a dress code, a Baron. It has never sailed.',
          'Fresh Takes Fish Shack. Reheated hourly.',
          'Nap Dynasty. Official mattress of lying awake. Code VELVET20.',
          'Warehouse 42 Mixtapes. Thirty years, one cassette, still sealed.'
        ],
        napAd: 4,
        dj: [
          'To the night. To the brand. To whatever this is.',
          'That was eleven minutes of build.',
          'The drop is coming. It is not.',
          'The Baron thanks you for listening to listening.'
        ],
        // Deep house pulse: four-on-the-floor, clap on 2 and 4, off-beat hats,
        // a rolling sub that never resolves, two ice clinks per bar. No drop.
        pattern: {
          steps: 16,
          bass: [0, _, 0, _, _, 0, _, 0, 0, _, 0, _, _, 0, 7, _],
          lead: [_, _, _, _, _, _, _, 11, _, _, _, _, _, _, 14, _],
          chords: [0, 0, 5, 3],
          drums: {
            kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
            snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
            hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1]
          },
          swing: 0.08,
          wave: { bass: 'triangle', lead: 'sine' },
          sustain: 0.45,
          transposeBass: true
        }
      },

      {
        id: 'quiet_signal', name: 'Quiet Signal',
        tagline: 'You are not listening to this.',
        genre: 'ambient pads, elevator chimes, a dial tone in the key of beige',
        bpm: 60, scale: 'dorian',
        ads: [
          'Weather Balloon Repair. A balloon has been repaired. No further questions have been taken.',
          'A mattress has been recommended. A code has been issued. The code is CLASSIFIED20.',
          'Fulcrum Foundation. A study was funded. Results were concluded.',
          'Perpetual Assembly Plaza gift shop. A cause has been updated. The mugs have not.',
          'Bravadia. A jet has been requested. Tourism has been declared.',
          'This ad slot was purchased. By whom is unimportant.'
        ],
        napAd: 1,
        dj: [
          'This station was tuned. Enjoyment is optional.',
          'A van has been dispatched. Not for you. Probably.',
          'The word of the day is "crisp." It should be used at a gala.',
          'Static will follow. Static is content.'
        ],
        // Slow ambient pads: one bass drone per bar, two chimes, no drums.
        pattern: {
          steps: 16,
          bass: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          lead: [_, _, _, _, 7, _, _, _, _, _, _, _, 9, _, _, _],
          chords: [0, 2, 3, 0],
          drums: {
            kick: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
          },
          swing: 0,
          wave: { bass: 'triangle', lead: 'sine' },
          sustain: 3.0
        }
      }
    ],

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
      'LOCAL PUNDIT NOT A JOURNALIST, JOURNALISTS CONFIRM'
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
    var B = GTP.Content.radio.barks;
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

  // Tiny helpers.
  GTP.Content.radio.station = function (id) {
    var s = GTP.Content.radio.stations;
    for (var i = 0; i < s.length; i++) if (s[i].id === id) return s[i];
    return s[0];
  };
  // Bark pool for a ped: by role when the role has its own lines, else by
  // district, else the full civilian list.
  GTP.Content.radio.barksFor = function (role, districtId) {
    var B = GTP.Content.radio.barks;
    if (role === 'cop') return B.cop;
    if (role && B[role] && role !== 'ped' && B[role].length) return B[role];
    if (districtId && B.byDistrict[districtId]) return B.byDistrict[districtId];
    return B.ped;
  };

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
