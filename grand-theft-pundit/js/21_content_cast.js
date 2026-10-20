/* Grand Theft Pundit: 21_content_cast.js
 * GTP.Content.cast: every character, straight from GDD.md section 4 (ids
 * verbatim), plus generic entries for mission-only opponents. Pure data plus
 * tiny helpers. Loads standalone: it only needs window.
 *
 * Every character is an original, fictional parody archetype; every portrait
 * is parametric and deliberately unlike any real person's signature look. See
 * CONTENT_RULES.md.
 *
 * Entry shape:
 *   id, name, role, voice, tic, bio, color (dialogue box accent and map dot),
 *   portrait: { skin 1-6, hair, hairColor, glasses, hat, extra, tie }
 *   look:     { skin 1-6, hair, hairColor, shirt, pants, hat, glasses, extra }
 *             the ped-mesh recipe for GTP.Assets.pedParts when this character
 *             walks around (follow targets, cutscene peds, the raccoon)
 * Portrait vocabularies (GDD section 4):
 *   hair    bald|short|long|pompadour|bun|mohawk|slick|afro|bob
 *   glasses none|round|aviator|thick|shades
 *   hat     none|cap|beanie|cowboy|fedora|beret|crown|helmet
 *   extra   none|mic|earpiece|cigar|phone|medal|flag_pin|lanyard
 *   tie     none|red|blue|gold|bowtie
 *
 * Also here: GTP.Content.looks, the per-district ped look pools the AI
 * spawner picks from (plain arrays, weighted by repetition), with a tiny
 * roll(district, role) helper that uses GTP.rng.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.Content = GTP.Content || {};

  function portrait(skin, hair, hairColor, glasses, hat, extra, tie) {
    return { skin: skin, hair: hair, hairColor: hairColor, glasses: glasses, hat: hat, extra: extra, tie: tie };
  }
  // A walking look derived from a portrait plus clothing colors.
  function look(p, shirt, pants) {
    return { skin: p.skin, hair: p.hair, hairColor: p.hairColor, shirt: shirt, pants: pants, hat: p.hat, glasses: p.glasses, extra: p.extra, tie: p.tie };
  }
  function member(id, name, role, voice, tic, p, color, bio, shirt, pants) {
    return { id: id, name: name, role: role, voice: voice, tic: tic, portrait: p, look: look(p, shirt, pants), color: color, bio: bio };
  }

  var P = {};

  // ------------------------------------------------------- the sixteen --
  P.player = portrait(2, 'short', '#3a2a1a', 'none', 'none', 'mic', 'red');
  P.sloane = portrait(4, 'bob', '#1a1a1a', 'thick', 'none', 'earpiece', 'none');
  P.gus = portrait(3, 'short', '#2a1a0a', 'none', 'beanie', 'none', 'none');
  P.kip = portrait(1, 'long', '#b58a3c', 'round', 'none', 'lanyard', 'none');
  P.dunk = portrait(5, 'short', '#111111', 'shades', 'cap', 'mic', 'none');
  P.chyron = portrait(2, 'pompadour', '#2b2b2b', 'none', 'none', 'earpiece', 'red');
  P.vaultwright = portrait(1, 'slick', '#d8d8d8', 'round', 'none', 'cigar', 'gold');
  P.footnote = portrait(6, 'bun', '#9c9c9c', 'thick', 'none', 'lanyard', 'none');
  P.goldplate = portrait(2, 'bald', '#e8b53a', 'round', 'helmet', 'medal', 'bowtie');
  P.warbanner = portrait(3, 'slick', '#1a1a1a', 'aviator', 'none', 'flag_pin', 'blue');
  P.velvetine = portrait(1, 'long', '#8e3a8e', 'shades', 'fedora', 'phone', 'bowtie');
  P.redacted = portrait(4, 'bob', '#2b2b2b', 'shades', 'beret', 'earpiece', 'none');
  P.moonsworth = portrait(2, 'short', '#c0392b', 'shades', 'cap', 'phone', 'none');
  P.saffron = portrait(3, 'long', '#7a5c3a', 'none', 'none', 'medal', 'none');
  P.firmness = portrait(1, 'short', '#3a2a1a', 'none', 'cap', 'lanyard', 'blue');
  P.roz = portrait(6, 'mohawk', '#ff7a00', 'round', 'beanie', 'mic', 'none');

  GTP.Content.cast = {
    player: member('player', 'Bryce Takesworth', 'Campus pundit, host of Loud & Correct', 'smug',
      'Prefaces every insult with "Respectfully," and then is not; calls himself a journalist; he is not.',
      P.player, '#ff3fa4',
      'Left class in week two to table outside it. Believes he is the protagonist, which is the problem.',
      '#f4f4f4', '#2a2f4a'),

    sloane: member('sloane', 'Sloane Vexley', 'Producer', 'clipped',
      'Speaks in segment lengths ("Four minutes. Three. Go.")',
      P.sloane, '#27c9c2',
      'Turned a folding table into a brand and bills hourly for it. Believes nothing, books everything.',
      '#1f2a3a', '#111318'),

    gus: member('gus', 'Gus Pemberton', 'Sound guy, roommate, van mechanic', 'flat',
      'Audio levels only ("You\'re peaking.")',
      P.gus, '#7fbf6a',
      'The only honest person in Grievance City, so nobody books him. Runs Gus\'s Garage out of spite.',
      '#4a5a3a', '#3a3a3a'),

    kip: member('kip', 'Kip Gratis', 'Unpaid intern, age 54', 'hopeful',
      '"Is this paid?" closes every scene he is in.',
      P.kip, '#f0ad4e',
      'The only person in the city who reads email, which is how he ended up formatting the Monday Memo. Present at every location, including inside the dryer.',
      '#e8dcb8', '#6a5a4a'),

    dunk: member('dunk', 'Ptolemy Dunk', 'Rival streamer, Actually, Didn\'t Read', 'lazy',
      '"Didn\'t read. Replied anyway."',
      P.dunk, '#15e0ff',
      'Runs Bryce\'s exact grift from the next table over: opposite signs, same sponsor. Has never finished a thought, only ended one.',
      '#15e0ff', '#1a1a1a'),

    chyron: member('chyron', 'Brock Chyron', 'Anchor, The Yell Network', 'breaking',
      'Headline fragments ("BREAKING. Me. Talking."); ends every conversation with "WE\'LL HAVE TO LEAVE IT THERE."',
      P.chyron, '#c94040',
      'Named after the lower-third; interrupted his own wedding vows with a developing story, which was him. Has not finished a sentence in years; has finished several careers.',
      '#2b2b3a', '#1a1a24'),

    vaultwright: member('vaultwright', 'Prescott Vaultwright III', 'Mega-donor, Vaultwright Capital', 'whisper',
      'Whispers every dollar figure.',
      P.vaultwright, '#e8b53a',
      'Funds both candidates so he never loses, "as a hedge." Owns a manor uphill of the President and a hedge maze that is also a hedge.',
      '#3a3020', '#2a2418'),

    footnote: member('footnote', 'Dr. Imogen Footnote', 'Director, Fulcrum Foundation', 'academic',
      'Says "[citation pending]" aloud.',
      P.footnote, '#8a94c8',
      'Publishes whatever the last check said, footnoted. Forty fellows, one opinion, two doors.',
      '#8a94c8', '#3a3a4a'),

    goldplate: member('goldplate', 'President Lionel Goldplate', 'Real-estate-mogul president', 'boast',
      'Rates everything out of ten; his things are tens; names things after himself that are already named after himself.',
      P.goldplate, '#ffd400',
      'Renamed the bridge, the stadium, the hospital and the weather. Wears a gold hard hat to every ribbon cutting; there is always a ribbon.',
      '#ffd400', '#2a2a2a'),

    warbanner: member('warbanner', 'PM Hollis Warbanner', 'Prime Minister of Bravadia, an invented allied nation', 'podium',
      'Every sentence, including condolences, ends "and that\'s why we need the jets."',
      P.warbanner, '#3d6fcf',
      'Leads a country of eleven million citizens and forty million press releases (motto: Volume Is Policy). Buys ads, sells scooters, wants jets.',
      '#2a3a6a', '#1a2444'),

    velvetine: member('velvetine', 'Baron Velvetine', 'Music mogul, Velvetine Records', 'toast',
      'Every line is a toast ("To whatever this is!").',
      P.velvetine, '#8e3a8e',
      'Runs an empire of "listening sessions" at which nothing is ever played; the DJ reads a spreadsheet aloud. Nothing released, still charting.',
      '#8e3a8e', '#2a1a2a'),

    redacted: member('redacted', 'Agent Pat Redacted', 'Handler, Office of Vibes Assessment (OVA)', 'redacted',
      'Redacts her own nouns ("Meet me at the [REDACTED]"); the redactions grow until her last line is "[REDACTED]."',
      P.redacted, '#4c4c4c',
      'Legally never here. Recruits podcasters as "assets" because they are cheaper than satellites and louder.',
      '#4c4c4c', '#2b2b2b'),

    moonsworth: member('moonsworth', 'Kyler Moonsworth', 'Crypto evangelist, $PUNDIT', 'hype',
      'Says "trustless" for "trust"; all money, including sandwiches, is "liquidity."',
      P.moonsworth, '#ff2d6f',
      'Launching $PUNDIT, a coin backed by takes. Sold his car for the coin, sold the coin for a car wrap advertising the coin.',
      '#ff2d6f', '#1a1a1a'),

    saffron: member('saffron', 'Saffron Vitalis-Hale', 'Wellness grifter, Clarity Pellets', 'serene',
      '"...and your doctor won\'t tell you that."',
      P.saffron, '#2f9e6a',
      'Sells Clarity Pellets, a supplement with a stance, and then the barn they come in. The medal is a crystal, technically.',
      '#cfe8d8', '#e8dcc8'),

    firmness: member('firmness', 'Dale Firmness', 'Regional manager, Nap Dynasty Mattresses', 'retail',
      'Drops coupon codes mid-sentence ("Sorry for your loss, code TAKES20.").',
      P.firmness, '#2c3e7a',
      'Sponsors every show in the city and therefore runs it. Has never raised his voice; has never needed to.',
      '#2c3e7a', '#3a3a3a'),

    roz: member('roz', 'Roz Placard', 'Organizer, CAWTI (Citizens Against Whatever This Is)', 'chant',
      'Chants in rhyme; "We\'re not here to..." and then does exactly that.',
      P.roz, '#ff7a00',
      'Four hundred protests, 399 of them against the previous one. Carries three signs so she can switch sides mid-chant.',
      '#ff7a00', '#2a2a2a')
  };

  // Running-gag data that hangs off a character (GDD section 9).
  GTP.Content.cast.player.signs = {
    table: 'ASK ME ANYTHING, I\'LL ANSWER SOMETHING ELSE',
    ending: 'I DON\'T KNOW. LET\'S TALK.'
  };
  // Roz's sign is the thing the player did most recently (player.stats key),
  // else one of the idle causes.
  GTP.Content.cast.roz.signs = {
    byStat: { ramming: 'STOP RAMMING', honking: 'STOP HONKING', debating: 'STOP DEBATING', rally: 'WHATEVER HE SAID' },
    idle: ['CHEESE', 'NO CHEESE', 'PARKING']
  };

  // --------------------------------------------- mission-only opponents --
  // Invented, generic. These are portraits for the dialogue box and the
  // minigame screens; the AI spawns `thug`, `protester` and `cop` peds from
  // GTP.Content.looks.roles below.
  P.freshman = portrait(5, 'afro', '#111111', 'round', 'none', 'lanyard', 'none');
  P.courier = portrait(3, 'short', '#4a3a2a', 'shades', 'cap', 'earpiece', 'none');
  P.panel = portrait(4, 'slick', '#2b2b2b', 'thick', 'none', 'earpiece', 'red');
  P.thug = portrait(2, 'short', '#1a1a1a', 'shades', 'none', 'lanyard', 'none');
  P.protester = portrait(6, 'bun', '#3a2a1a', 'none', 'beanie', 'none', 'none');
  P.cop = portrait(1, 'short', '#2a1a0a', 'aviator', 'cap', 'earpiece', 'none');
  P.everyone = portrait(3, 'bob', '#6a6a6a', 'none', 'none', 'phone', 'none');

  GTP.Content.cast.freshman = member('freshman', 'Wendell Syllabus', 'Freshman. Did the reading.', 'earnest',
    'Cites page numbers; raises a hand before speaking, even outdoors.',
    P.freshman, '#9ad1ff',
    'Brought a highlighter to a volume contest. Has the book. Nobody has asked to see it.',
    '#7a1f2b', '#2a2f4a');

  GTP.Content.cast.courier = member('courier', 'Courier No. [REDACTED]', 'OVA courier in balloon-repair coveralls', 'mute',
    'Says nothing; the coveralls say WEATHER BALLOON REPAIR.',
    P.courier, '#8c8c8c',
    'Walks the same route every day with a beige envelope. Has never repaired a balloon. Has never seen one.',
    '#c8b89a', '#c8b89a');

  GTP.Content.cast.panel = member('panel', 'The Panel', 'Five guests, one memo', 'memo',
    'Mattress. Jets. Pellets.',
    P.panel, '#c94040',
    'Goldplate, Warbanner, Velvetine, Footnote and Dunk, seated in a row, reading the same page.',
    '#2b2b3a', '#1a1a24');
  GTP.Content.cast.panel.members = ['goldplate', 'warbanner', 'velvetine', 'footnote', 'dunk'];

  GTP.Content.cast.thug = member('thug', 'Faction Goon', 'Hired by whoever read the memo last', 'gruff',
    'Says "it\'s on the calendar" as an apology.',
    P.thug, '#b03030',
    'Same grift, different lanyard. The lanyard changes faction weekly; the goon does not notice.',
    '#2a2a2a', '#1a1a1a');

  GTP.Content.cast.protester = member('protester', 'CAWTI Marcher', 'Citizens Against Whatever This Is', 'chant',
    'Chants whatever Roz is chanting, half a beat late.',
    P.protester, '#ff7a00',
    'Was against this yesterday. Will be against that tomorrow. Owns a mug.',
    '#ff7a00', '#3a3a3a');

  GTP.Content.cast.cop = member('cop', 'Officer Tenpoint', 'Grievance City PD; rates arrests', 'cop',
    'Rates every chase out of ten before it is over.',
    P.cop, '#4a7cff',
    'Keeps the lost-and-found as a suggestion box. Has never recognized "debate" as a permit category.',
    '#1a2a4a', '#101828');

  GTP.Content.cast.takesworth_archive = member('takesworth_archive', 'Takesworth (Archive)', 'Your old clips, now trending', 'smug',
    'Says what you said, two years ago, louder.',
    P.player, '#b0b0b0',
    'Every clip you ever posted, autoplaying in a column. Better than you. Scheduled.',
    '#f4f4f4', '#2a2f4a');
  GTP.Content.cast.takesworth_archive.archive = true;

  GTP.Content.cast.everyone = member('everyone', 'Everyone', 'The comment section', 'crowd',
    'Types "first" under everything, including the memo it wrote.',
    P.everyone, '#ffffff',
    'Eleven of them will stay. The rest are typing.',
    '#9a9a9a', '#3a3a3a');

  // Ordered ids for credits and the phone's contacts page.
  GTP.Content.castIds = ['player', 'sloane', 'gus', 'kip', 'dunk', 'chyron', 'vaultwright', 'footnote', 'goldplate', 'warbanner', 'velvetine', 'redacted', 'moonsworth', 'saffron', 'firmness', 'roz'];
  GTP.Content.opponentIds = ['freshman', 'courier', 'panel', 'thug', 'protester', 'cop', 'takesworth_archive', 'everyone'];

  // Tiny helper: a cast entry or a safe fallback (so a typo never throws in
  // the dialogue box).
  GTP.Content.castMember = function (id) {
    return GTP.Content.cast[id] || GTP.Content.cast.everyone;
  };

  // ============================================================ ped looks ==
  // Plain pools the spawner picks from. Repetition is weight. A look rolled
  // from these has the same fields as cast[].look above, so one
  // GTP.Assets.pedParts(look) builds both. Skin indexes map through
  // `skinColors` (1-6); hair styles and vocabularies match the portrait recipe.
  var HAIR_ALL = ['short', 'short', 'short', 'long', 'bob', 'bun', 'slick', 'afro', 'pompadour', 'bald', 'mohawk'];
  var HAIR_COLORS = ['#1a1a1a', '#111111', '#2a1a0a', '#3a2a1a', '#4a3a2a', '#7a5c3a', '#b58a3c', '#d8c8a0', '#9c9c9c', '#d8d8d8', '#c0392b', '#ff7a00', '#8e3a8e', '#2f9e6a'];
  var JEANS = ['#2a2f4a', '#2b3a55', '#3a4a6a', '#1e2436', '#4a4a4a'];
  var KHAKI = ['#b8a888', '#c8b89a', '#a89878', '#e8dcc8'];
  var DARK = ['#1a1a1a', '#2a2a2a', '#333333', '#101218'];

  GTP.Content.looks = {
    skins: [1, 2, 3, 4, 5, 6],
    // index 1..6 (index 0 unused) so look.skin maps directly
    skinColors: [null, '#f1d3b3', '#e8c39e', '#c68642', '#a46f3c', '#8d5524', '#5c3a1e'],
    hairStyles: HAIR_ALL,
    hairColors: HAIR_COLORS,

    // Per-district pools. Every pool has: hair, hairColor, shirt, pants, hat,
    // glasses, extra, tie (weighted arrays). `describe` is for the minimap chip.
    byDistrict: {
      campus: {
        describe: 'lanyards and hoodies',
        hair: HAIR_ALL, hairColor: HAIR_COLORS,
        shirt: ['#7a1f2b', '#2a3a6a', '#4a4a4a', '#2f6a4a', '#8a94c8', '#f0ad4e', '#5a5a7a', '#c94040'],
        pants: JEANS.concat(KHAKI),
        hat: ['none', 'none', 'none', 'none', 'cap', 'beanie'],
        glasses: ['none', 'none', 'none', 'round', 'thick'],
        extra: ['lanyard', 'lanyard', 'lanyard', 'none', 'phone'],
        tie: ['none']
      },
      downtown: {
        describe: 'lower-thirds in suits',
        hair: ['short', 'short', 'slick', 'bob', 'bun', 'pompadour', 'long', 'bald'], hairColor: HAIR_COLORS,
        shirt: ['#f4f4f4', '#dfe8f4', '#2b2b3a', '#1f2a3a', '#3a3a4a', '#c9d2dc', '#4a5a7a'],
        pants: DARK.concat(['#2a2f4a', '#3a3a4a']),
        hat: ['none', 'none', 'none', 'none', 'none', 'fedora'],
        glasses: ['none', 'none', 'thick', 'round', 'shades'],
        extra: ['none', 'phone', 'phone', 'earpiece', 'lanyard'],
        tie: ['none', 'none', 'red', 'blue', 'none']
      },
      strip: {
        describe: 'neon and shades',
        hair: ['short', 'long', 'mohawk', 'slick', 'afro', 'bob', 'pompadour'], hairColor: HAIR_COLORS,
        shirt: ['#ff3fa4', '#15e0ff', '#ffd400', '#ff2d6f', '#8e3a8e', '#2f9e6a', '#ff7a00', '#f4f4f4'],
        pants: DARK.concat(['#2a2f4a']),
        hat: ['none', 'none', 'cap', 'cap', 'none', 'fedora'],
        glasses: ['shades', 'shades', 'none', 'none', 'round'],
        extra: ['none', 'phone', 'phone', 'none', 'mic'],
        tie: ['none']
      },
      capitol: {
        describe: 'suits and flag pins',
        hair: ['short', 'slick', 'slick', 'bun', 'bob', 'bald', 'pompadour'], hairColor: ['#1a1a1a', '#2a1a0a', '#3a2a1a', '#9c9c9c', '#d8d8d8', '#4a3a2a'],
        shirt: ['#2b2b3a', '#1f2a3a', '#2a3a6a', '#3a3020', '#2a2418', '#3a3a4a', '#1a1a24'],
        pants: ['#2b2b3a', '#1f2a3a', '#2a3a6a', '#3a3020', '#1a1a24'],
        hat: ['none', 'none', 'none', 'none', 'none', 'fedora'],
        glasses: ['none', 'round', 'round', 'thick', 'aviator'],
        extra: ['flag_pin', 'flag_pin', 'phone', 'earpiece', 'lanyard', 'cigar'],
        tie: ['red', 'blue', 'gold', 'red', 'blue', 'none']
      },
      hills: {
        describe: 'golf pastels and gold',
        hair: ['short', 'slick', 'bald', 'pompadour', 'bob', 'bun', 'long'], hairColor: ['#d8d8d8', '#9c9c9c', '#b58a3c', '#1a1a1a', '#3a2a1a', '#e8b53a'],
        shirt: ['#f4f4f4', '#ffd9b3', '#b3e0ff', '#d9f4c7', '#ffe08a', '#f8c8dc', '#ffd400'],
        pants: ['#f4f4f4', '#e8dcc8', '#c8b89a', '#b8a888', '#ffd9b3'],
        hat: ['cap', 'cap', 'none', 'none', 'cowboy', 'helmet'],
        glasses: ['aviator', 'shades', 'none', 'none', 'round'],
        extra: ['none', 'none', 'phone', 'medal', 'cigar'],
        tie: ['none', 'none', 'none', 'gold', 'bowtie']
      },
      suburbs: {
        describe: 'athleisure and HOA polos',
        hair: ['short', 'bun', 'bob', 'long', 'slick', 'bald', 'afro'], hairColor: HAIR_COLORS,
        shirt: ['#cfe8d8', '#d8c8f0', '#f4ead8', '#9fd0c0', '#f0ad4e', '#f4f4f4', '#6a8fcf', '#2f9e6a'],
        pants: ['#4a4a4a', '#3a3a3a', '#6a6a7a', '#2a2f4a', '#e8dcc8'],
        hat: ['none', 'none', 'none', 'beanie', 'cap', 'cap'],
        glasses: ['none', 'none', 'none', 'shades', 'round'],
        extra: ['none', 'phone', 'phone', 'none', 'lanyard', 'medal'],
        tie: ['none']
      },
      industrial: {
        describe: 'hi-vis and helmets',
        hair: ['short', 'short', 'bald', 'long', 'mohawk', 'bun', 'afro'], hairColor: HAIR_COLORS,
        shirt: ['#ffb300', '#ff6a00', '#d8ff00', '#ffb300', '#ff6a00', '#c8b89a', '#4a4a4a'],
        pants: ['#4a4a4a', '#2a2f4a', '#3a3a3a', '#1e2436', '#c8b89a'],
        hat: ['helmet', 'helmet', 'helmet', 'cap', 'beanie', 'none'],
        glasses: ['none', 'none', 'none', 'shades', 'thick'],
        extra: ['none', 'none', 'none', 'earpiece', 'phone'],
        tie: ['none']
      },
      marina: {
        describe: 'pastels, no music',
        hair: ['long', 'slick', 'bob', 'short', 'pompadour', 'bun', 'afro'], hairColor: HAIR_COLORS,
        shirt: ['#b3f0d9', '#ffd9b3', '#d8c8f0', '#b3e0ff', '#f8c8dc', '#fff0b3', '#f4f4f4', '#8e3a8e'],
        pants: ['#f4f4f4', '#e8dcc8', '#fff0b3', '#b3e0ff', '#2a2f4a'],
        hat: ['none', 'none', 'fedora', 'fedora', 'none', 'cap'],
        glasses: ['shades', 'shades', 'none', 'round', 'aviator'],
        extra: ['phone', 'phone', 'none', 'none', 'cigar'],
        tie: ['none', 'none', 'none', 'bowtie']
      },
      // the expansion's districts (GDD_EXPANSION §1.6)
      uptown: {
        describe: 'tweed, pearls and a bow tie',
        hair: ['slick', 'bun', 'bob', 'short', 'pompadour', 'bald', 'long'], hairColor: ['#d8d8d8', '#9c9c9c', '#3a2a1a', '#1a1a1a', '#b58a3c', '#4a3a2a'],
        shirt: ['#6b5a3e', '#8a7452', '#4a3f2e', '#f4f4f4', '#e8dcc8', '#3a2f4a', '#7a2f3a', '#2a3a2a'],
        pants: ['#4a3f2e', '#6b5a3e', '#2b2b3a', '#3a3020', '#e8dcc8'],
        hat: ['none', 'none', 'none', 'fedora', 'fedora', 'cap'],
        glasses: ['round', 'round', 'none', 'none', 'thick'],
        extra: ['none', 'medal', 'phone', 'cigar', 'none', 'earpiece'],
        tie: ['bowtie', 'bowtie', 'gold', 'none', 'red']
      },
      airport: {
        describe: 'lanyards, neck pillows and the wrong terminal',
        hair: HAIR_ALL, hairColor: HAIR_COLORS,
        shirt: ['#f4f4f4', '#dfe8f4', '#c9d2dc', '#8a94c8', '#b3e0ff', '#cfe8d8', '#2b2b3a', '#f0ad4e'],
        pants: JEANS.concat(KHAKI).concat(['#2b2b3a']),
        hat: ['none', 'none', 'none', 'cap', 'beanie'],
        glasses: ['none', 'none', 'shades', 'round', 'thick'],
        extra: ['lanyard', 'lanyard', 'phone', 'phone', 'none', 'earpiece'],
        tie: ['none', 'none', 'none', 'blue']
      },
      port: {
        describe: 'hi-vis and beanies',
        hair: ['short', 'short', 'bald', 'long', 'bun', 'mohawk', 'afro'], hairColor: HAIR_COLORS,
        shirt: ['#f0b429', '#f0b429', '#ff6a00', '#d8ff00', '#4a4a4a', '#2a2f4a', '#c8b89a'],
        pants: ['#4a4a4a', '#2a2f4a', '#3a3a3a', '#1e2436', '#c8b89a'],
        hat: ['beanie', 'beanie', 'helmet', 'cap', 'none'],
        glasses: ['none', 'none', 'none', 'shades'],
        extra: ['none', 'none', 'phone', 'earpiece', 'none'],
        tie: ['none']
      }
    },

    // Role overrides. A role look starts from the district pool and then
    // replaces these fields, so cops look like cops in every district.
    roles: {
      // the hills' and uptown's mega-donors (rolesByDistrict `donor`): gold and a cigar in every district
      donor: {
        describe: 'a donor',
        hair: ['slick', 'bald', 'pompadour', 'bun', 'bob'], hairColor: ['#d8d8d8', '#9c9c9c', '#b58a3c', '#1a1a1a'],
        shirt: ['#f4f4f4', '#ffe08a', '#2b2b3a', '#6b5a3e'], pants: ['#2b2b3a', '#3a3020', '#e8dcc8'],
        hat: ['none', 'none', 'fedora'], glasses: ['round', 'aviator', 'none'], extra: ['cigar', 'medal', 'phone'], tie: ['gold', 'bowtie', 'gold']
      },
      cop: {
        describe: 'Grievance City PD',
        hair: ['short', 'short', 'bald', 'bun', 'slick'], hairColor: ['#1a1a1a', '#2a1a0a', '#3a2a1a', '#9c9c9c', '#b58a3c'],
        shirt: ['#1a2a4a'], pants: ['#101828'],
        hat: ['cap'], glasses: ['aviator', 'none', 'aviator', 'shades'], extra: ['earpiece'], tie: ['none'],
        uniform: 'cop', badge: '#8fb6ff'
      },
      swat: {
        describe: 'balloon unit',
        hair: ['short', 'bald'], hairColor: ['#1a1a1a', '#2a1a0a'],
        shirt: ['#1a1c24'], pants: ['#101218'],
        hat: ['helmet'], glasses: ['shades'], extra: ['earpiece'], tie: ['none'],
        uniform: 'swat', badge: '#8fb6ff'
      },
      hoa: {
        describe: 'HOA patrol',
        hair: ['short', 'bob', 'bun', 'slick'], hairColor: ['#9c9c9c', '#d8d8d8', '#b58a3c', '#3a2a1a'],
        shirt: ['#f0ad4e', '#f4ead8'], pants: ['#e8dcc8', '#c8b89a'],
        hat: ['none', 'cap'], glasses: ['round', 'none', 'shades'], extra: ['lanyard'], tie: ['none'],
        uniform: 'hoa', badge: '#f0ad4e'
      },
      thug: {
        describe: 'faction goons',
        hair: ['short', 'short', 'bald', 'slick', 'mohawk', 'pompadour'], hairColor: ['#1a1a1a', '#111111', '#2a1a0a', '#c0392b'],
        shirt: ['#2a2a2a', '#1a1a1a', '#3a2a2a', '#2b2b3a', '#4a1a1a'], pants: DARK,
        hat: ['none', 'none', 'cap', 'beanie'], glasses: ['shades', 'shades', 'none'], extra: ['lanyard', 'lanyard', 'earpiece', 'none'], tie: ['none']
      },
      protester: {
        describe: 'CAWTI marchers',
        hair: HAIR_ALL, hairColor: HAIR_COLORS,
        shirt: ['#ff7a00', '#ff7a00', '#ffd400', '#2f9e6a', '#ff3fa4', '#f4f4f4'], pants: JEANS.concat(DARK),
        hat: ['beanie', 'beanie', 'none', 'cap'], glasses: ['none', 'round', 'none'], extra: ['none', 'none', 'mic'], tie: ['none'],
        sign: true
      },
      // The Lot C raccoon: a tiny persistent npc (GDD section 9). The lanyard
      // arrives in Act III (flag knows_memo).
      raccoon: {
        describe: 'the Lot C raccoon',
        hair: ['short'], hairColor: ['#4a4a4a'],
        shirt: ['#6a6a6a'], pants: ['#4a4a4a'],
        hat: ['none'], glasses: ['none'], extra: ['none'], tie: ['none'],
        scale: 0.45, mask: '#1a1a1a'
      },
      // the Heirloom Club's doorman (GDD_EXPANSION §1.5): a dark suit, a bow tie, an earpiece and opinions about your grandfather
      doorman: {
        describe: 'the doorman',
        hair: ['slick', 'short', 'bald'], hairColor: ['#9c9c9c', '#1a1a1a', '#d8d8d8', '#3a2a1a'],
        shirt: ['#1b1f2e'], pants: ['#14161f'],
        hat: ['none'], glasses: ['none', 'round'], extra: ['earpiece'], tie: ['bowtie']
      },
      npc: {
        describe: 'someone with a clipboard',
        hair: ['short', 'slick', 'bob', 'bun'], hairColor: HAIR_COLORS,
        shirt: ['#f4f4f4', '#2b2b3a', '#8a94c8'], pants: DARK,
        hat: ['none'], glasses: ['thick', 'round', 'none'], extra: ['lanyard', 'phone', 'earpiece'], tie: ['none', 'blue']
      }
    },

    // Roll a look for a district (id string) and an optional role. Uses
    // GTP.rng; before 00_util.js has loaded it returns the first entry of each
    // pool, which is still a valid look.
    roll: function (districtId, role, rng) {
      var L = GTP.Content.looks;
      var pool = L.byDistrict[districtId] || L.byDistrict.downtown;
      var over = (role && L.roles[role]) || null;
      var R = rng || GTP.rng;   // a caller with its own stream (the AI's landmark residents) passes it, so the city's stream is untouched
      function pick(arr) { return (R && R.pick) ? R.pick(arr) : arr[0]; }
      function field(k) { return pick((over && over[k]) || pool[k]); }
      var skin = (R && R.int) ? R.int(1, 6) : 1;
      var out = {
        skin: skin,
        hair: field('hair'), hairColor: field('hairColor'),
        shirt: field('shirt'), pants: field('pants'),
        hat: field('hat'), glasses: field('glasses'), extra: field('extra'), tie: field('tie'),
        role: role || 'civ', district: districtId || null
      };
      if (over) {
        if (over.uniform) out.uniform = over.uniform;
        if (over.badge) out.badge = over.badge;
        if (over.sign) out.sign = true;
        if (over.scale) out.scale = over.scale;
        if (over.mask) out.mask = over.mask;
      }
      return out;
    },

    // The hex color for a look.skin index (or a hex string passed through).
    skinColor: function (skin) {
      if (typeof skin === 'string') return skin;
      return GTP.Content.looks.skinColors[skin] || GTP.Content.looks.skinColors[2];
    }
  };
})();
