/* Grand Theft Pundit: 26_content_strangers.js
 * GTP.Content.strangers: ten side-mission strands in the GTA "Strangers and Freaks" mould. Ten invented eccentrics of the
 * outrage economy, each with a home marker at an existing landmark, two or three missions built only from existing
 * objective types, intro and outro dialogue, rewards, unlock conditions tied to story progress flags and an epilogue
 * line once the strand is done. Pure data plus a small registration step and a tiny runtime (GTP.Strangers).
 *
 * Registration (load time, this file only; nothing else is edited):
 *   - GTP.Missions.allMissions() merges GTP.Content.strangers.missions natively as side missions (09_missions.js), so the
 *     blue-light markers, the giver at the door, the phone's MISSIONS tab, REPLAY, checkpoints / RETRY, best times,
 *     rewards, subscribers and the save (state.completed / flags) pick them up; Story.order() / next() skip them
 *   - the eccentrics and their supporting players are merged into GTP.Content.cast (never overwriting an id)
 *   - their minigame opponents are merged into GTP.Content.debate.opponents and GTP.Content.ratio.opponents
 *
 * Mission shape: the story schema (id, title, giver, marker, requires, reward, intro, objectives, outro, failOn,
 * onComplete) plus: side: true, kind: 'stranger', strand: <strand id>, act: 1|2|3, unlock: {mission, flag} on a strand's
 * first mission (the story mission it waits for and the flag that mission's onComplete sets). `requires` carries the
 * gate (the runtime's available() reads `requires`); the flag is the same condition named by its story flag, and
 * tests/strangers.js asserts the two agree.
 *
 * GTP.Strangers (runtime):
 *   list(), markers()      -> [] on purpose. 11_ui.js draws an extra purple '?' blip from markers() and an extra phone row
 *                             from list(), but the strand missions already appear as ordinary missions (blue light, MISSIONS
 *                             rows, GPS), so feeding those paths drew every stranger light twice and listed it two or three
 *                             times (docs/v03/ui.md: "if the strangers register as Missions ..., the existing mission paths show
 *                             them"). The data stays available for a future strand overview:
 *   strandRows()           -> one row per strand: [{id, title, name, giver, status, line, x, z, strand, missionId, done, total}]
 *   blips()                -> one per strand whose next mission is available: [{id, x, z, y, title, giver, strand, missionId}]
 *                             at the live mission light (the runtime nudges a light that shares a door), [] while a mission runs
 *   strands()              -> the strand records
 *   strand(id)             -> one record
 *   missions(id)           -> its mission objects in order
 *   status(id)             -> {id, name, giver, home, state: 'locked'|'available'|'active'|'done', done, total, next, epilogue}
 *   summary()              -> status() for every strand (the phone / map can show it)
 *   homes()                -> [{id, strand, name, giver, landmark, x, z, state}] the home landmarks for a map legend
 *   epilogue(id)           -> the epilogue line once the strand is finished, else null
 *   strandOf(missionId)    -> the strand id of a stranger mission, else null
 * Events: 'strangers:epilogue' {id, line, name} after a strand's last mission completes (not on a replay); the line also
 * goes to GTP.UI.ticker and a toast. Flags: each mission sets 'st_<mission id>'; a finished strand sets 'stranger_<id>'.
 * A deliver_passenger or follow objective whose ped is the mission's own giver takes the giver ped off the kerb when it
 * starts (the eccentric walks to the car instead of standing at the door twice).
 *
 * Every character is an original, fictional parody archetype; every portrait is parametric. See CONTENT_RULES.md.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.Content = GTP.Content || {};

  function portrait(skin, hair, hairColor, glasses, hat, extra, tie) {
    return { skin: skin, hair: hair, hairColor: hairColor, glasses: glasses, hat: hat, extra: extra, tie: tie };
  }
  function member(id, name, role, voice, tic, p, color, bio, shirt, pants) {
    return { id: id, name: name, role: role, voice: voice, tic: tic, portrait: p, color: color, bio: bio, stranger: true,
      look: { skin: p.skin, hair: p.hair, hairColor: p.hairColor, shirt: shirt, pants: pants, hat: p.hat, glasses: p.glasses, extra: p.extra, tie: p.tie } };
  }
  function L(who, text) { return { who: who, text: text }; }

  // ------------------------------------------------------------------------------------------ cast --
  var CAST = {
    // the ten eccentrics
    moira: member('moira', 'Moira Cutoff', 'Shop Steward, Amalgamated Hecklers Local 404', 'chant',
      'Opens with "Point of order." Never lets anyone finish, including herself.',
      portrait(4, 'mohawk', '#5a2a1a', 'thick', 'cap', 'mic', 'none'), '#d35400',
      'Represents every heckler in Grievance City. Negotiated the right to interrupt into the contract and has used it on the contract.',
      '#c0392b', '#2a2a2a'),
    marisol: member('marisol', 'Marisol Echo-Venn', 'Ghostwriter for podcasts that do not exist', 'whisper',
      'Credits herself as "and others."',
      portrait(3, 'bun', '#1a1a1a', 'round', 'beret', 'phone', 'none'), '#7d5fff',
      'Writes every episode of forty podcasts that have never recorded, never released and never been heard. Bills per episode. Three of them were renewed.',
      '#3a2f5a', '#1e1e2a'),
    gasp: member('gasp', 'Gasp Haverly', 'Professional thumbnail reaction face', 'hype',
      'Reacts before anything has happened ("NO WAY. ...What happened?").',
      portrait(5, 'long', '#e84393', 'none', 'none', 'phone', 'none'), '#ff2d95',
      'The open mouth on every thumbnail in Grievance City. Her eyebrows are insured for more than the Nap Dynasty showroom, where she poses for mattress thumbnails between takes. Has not been genuinely surprised since the age of nine.',
      '#ff7ac2', '#2a2a3a'),
    thaddeus: member('thaddeus', 'Thaddeus Wainscot', 'Fulcrum Foundation intern (Winter Cohort, all of them)', 'earnest',
      'Measures time in fluorescent hours; flinches at windows.',
      portrait(3, 'short', '#3a2a1a', 'thick', 'none', 'lanyard', 'none'), '#c8d6e5',
      'Came to the Fulcrum basement for orientation and nobody told him it ended. Has written four hundred white papers on the sun, citing each other.',
      '#e8ecf0', '#4a4a5a'),
    lyle: member('lyle', 'Lyle Bunkerton', 'Caddie, Goldplate Links', 'lazy',
      '"Put me down for a ten."',
      portrait(2, 'short', '#8a6a3a', 'shades', 'cap', 'none', 'none'), '#2e8b57',
      'Has caddied on the President\'s course four hundred times; the President rates it from the cart. Carries a bag of clubs, a bag of pencils and a bag of tens.',
      '#f2f2f2', '#2e5a3a'),
    dewey: member('dewey', 'Dewey Varnum-Pleat', 'Live-streams his own HOA appeals', 'clipped',
      '"Chat, note the time."',
      portrait(6, 'slick', '#3a3a3a', 'round', 'none', 'phone', 'blue'), '#e1b12c',
      'Has appealed every HOA violation he has ever received, live, in eleven-hour streams. The streams got violations. He is appealing those live.',
      '#f4ead8', '#5a4a3a'),
    ottoline: member('ottoline', 'Ottoline Kerning', 'Proofreader, Monday Memo Print Works', 'academic',
      'Counts the letters out loud. Then counts them again.',
      portrait(2, 'bob', '#9c9c9c', 'thick', 'none', 'lanyard', 'none'), '#9b59b6',
      'Noticed "Respectfuly" in week one and was told it was house style. Keeps every missing L in a jar on her desk. The jar is full.',
      '#6a4a7a', '#2a2a3a'),
    brine: member('brine', 'Captain Mortimer Brine', 'Fishmonger, Fresh Takes Fish Shack', 'gruff',
      'Grades every take by its temperature ("Lukewarm, son.").',
      portrait(3, 'bald', '#d8d8d8', 'none', 'beanie', 'cigar', 'none'), '#1abc9c',
      'Catches takes daily and reheats them hourly; every one he catches is already yesterday\'s. Once caught a fresh one off the Listening Pier, panicked and threw it back. Calls himself Captain; owns a cooler; fishes off the stern of the Baron\'s yacht, which the Baron has not noticed.',
      '#2a4a6a', '#3a3a3a'),
    rutherford: member('rutherford', 'Rutherford Standby', 'On standby for Flight 10 (six years running)', 'hopeful',
      'Everything is "now boarding."',
      portrait(4, 'afro', '#2a1a0a', 'aviator', 'none', 'lanyard', 'red'), '#3498db',
      'Has been on standby for the same flight since the terminal opened. Holds a loyalty card with nine hundred stamps. The flight has never left, which he calls a technicality.',
      '#dfe3e8', '#2a2f4a'),
    cornelius: member('cornelius', 'Cornelius Ashby-Ledger IV', 'Heir; would like to apologise', 'smug',
      'Refers to himself as "one."',
      portrait(1, 'pompadour', '#d8c8a8', 'round', 'none', 'medal', 'bowtie'), '#8e6c3a',
      'Fourth of his name and the first of his family to consider having been wrong. The family motto is NO, in Latin, on a plaque, on a bigger plaque.',
      '#6e5a44', '#2a2a3a'),

    // supporting players (follow targets, minigame opponents)
    listener: member('listener', 'Lenny Autoplay', 'The only listener', 'mute',
      'Wears earbuds that are not connected to anything.',
      portrait(2, 'short', '#4a3a2a', 'none', 'beanie', 'phone', 'none'), '#95a5a6',
      'Employed by a download farm to download. Has heard every podcast in the city, including the forty that do not exist.',
      '#4a5a6a', '#2a2a2a'),
    scorer: member('scorer', 'Dot Tallymark', 'Rogue scorekeeper', 'mute',
      'Writes down what actually happened. Nobody can stop her. Many have tried at the clubhouse.',
      portrait(5, 'bun', '#1a1a1a', 'round', 'cap', 'none', 'none'), '#27ae60',
      'Has kept the real rating of every hole on the President\'s course for a decade. The brochure says ten. One of her cards says a six.',
      '#f2f2f2', '#3a5a3a'),
    clause: member('clause', 'Prudence Clause', 'Head of Talent Relations, The Yell Network', 'retail',
      'Bills by the clause; reads the fine print as if it were large.',
      portrait(6, 'bob', '#2b2b2b', 'thick', 'none', 'earpiece', 'red'), '#c94040',
      'Negotiated the laugh track\'s contract. The laugh track has better terms than the anchors.',
      '#2b2b3a', '#1a1a24'),
    hoa_board: member('hoa_board', 'The Culdesac Board', 'Seven members, one gavel', 'gruff',
      'Rules unanimously. The vote is recorded before the meeting.',
      portrait(1, 'bun', '#9c9c9c', 'round', 'none', 'lanyard', 'none'), '#f4ead8',
      'Meets every Tuesday to approve the minutes of meetings that have not happened yet.',
      '#f4ead8', '#5a4a3a'),
    house_style: member('house_style', 'House Style', 'The Monday Memo style guide', 'memo',
      'One L. Always one L.',
      portrait(3, 'slick', '#2b2b2b', 'thick', 'none', 'none', 'none'), '#8c8c8c',
      'Forty pages long and all of it is the word "Respectfuly." Has never been read and is followed perfectly.',
      '#c8b89a', '#c8b89a'),
    smirk: member('smirk', 'Rex Smirkwell', 'Rival face, Smirk & Sons Thumbnail Agency', 'smug',
      'Has one expression and licences it.',
      portrait(2, 'pompadour', '#3a2a1a', 'shades', 'none', 'phone', 'gold'), '#f39c12',
      'The raised eyebrow on every "you won\'t believe" thumbnail. Believes nothing. Bills per eyebrow.',
      '#2a2a2a', '#1a1a1a'),
    scab_heckler: member('scab_heckler', 'Scab Heckler', 'Heckles for free, which is the problem', 'lazy',
      'Says "first" and nothing else.',
      portrait(2, 'short', '#1a1a1a', 'none', 'cap', 'phone', 'none'), '#7f8c8d',
      'A non-union interrupter. Undercuts the Local by heckling at no charge and with no material.',
      '#5a5a5a', '#2a2a2a'),
    family_counsel: member('family_counsel', 'Ledger, Ledger & Ledger', 'Family counsel since the founding', 'whisper',
      'Answers every question with "Not as such."',
      portrait(1, 'slick', '#d8d8d8', 'round', 'none', 'none', 'gold'), '#5a4a3a',
      'Three lawyers, one surname, two hundred years of advising the family to admit nothing, as such.',
      '#2a2a3a', '#1a1a24')
  };

  // ------------------------------------------------------------------------- minigame opponents --
  var DEBATE = {
    clause: { name: 'Prudence Clause', castId: 'clause', cards: [
      { card: 'FACT', text: 'Clause nine: the laugh track may laugh at the talent. The talent may not laugh back.' },
      { card: 'FEELING', text: 'Management feels heckling is a hostile workplace. For management.' },
      { card: 'GOTCHA', text: 'You interrupted me. That is a heckle. Are you in the union?' },
      { card: 'ANECDOTE', text: 'In my first job I negotiated a raise for a ficus. It is a vice president now.' },
      { card: 'FACT', text: 'The heckle track costs nothing and has never asked for a break.' },
      { card: 'FEELING', text: 'I feel thirty seconds of interruption is plenty. Twenty-nine, ideally.' },
      { card: 'GOTCHA', text: 'Your own show has a heckle track. I wrote its contract.' },
      { card: 'ANECDOTE', text: 'Brock interrupted his own contract signing. We counted it as a signature.' }
    ], winLine: 'The heckle track thanks you for your time. Laughter.', loseLine: 'Fine. Thirty seconds of protected interruption. Sign at the bottom. Don\'t finish.' },
    hoa_board: { name: 'The Culdesac Board', castId: 'hoa_board', cards: [
      { card: 'FACT', text: 'Section 4(b): a mailbox may not be adjacent. Yours is adjacent to the street.' },
      { card: 'FEELING', text: 'The board feels your livestream lowers property values. And raises our blood pressure.' },
      { card: 'GOTCHA', text: 'You said "note the time." The time is a violation. It is after seven.' },
      { card: 'ANECDOTE', text: 'Mrs. Pemmican painted her door teal in 1994. We still talk about it at every meeting.' },
      { card: 'FACT', text: 'The vote was unanimous. We held it this morning, before the appeal was filed.' },
      { card: 'FEELING', text: 'We feel the lawn should be one inch. Not as a rule. As a lifestyle.' },
      { card: 'GOTCHA', text: 'Your appeal is in the wrong font. That is a separate violation.' },
      { card: 'ANECDOTE', text: 'The last man who won an appeal moved away. We approved the moving van.' }
    ], winLine: 'Appeal denied. The denial is also appealed. See you Tuesday.', loseLine: 'The mailbox is legal. The board is in recess. Forever, ideally.' },
    family_counsel: { name: 'Ledger, Ledger & Ledger', castId: 'family_counsel', cards: [
      { card: 'FACT', text: 'The family has never been wrong. The archive says so. We wrote the archive.' },
      { card: 'FEELING', text: 'An apology would feel like a precedent. We do not have precedents. We have ancestors.' },
      { card: 'GOTCHA', text: 'You said "sorry" to a door on the way in. That is an admission.' },
      { card: 'ANECDOTE', text: 'In 1803 a Ledger nearly said "my mistake." We settled.' },
      { card: 'FACT', text: 'Clause one of the trust: NO. Clause two: see clause one.' },
      { card: 'FEELING', text: 'Not as such.' },
      { card: 'GOTCHA', text: 'The apology is unsigned. An unsigned apology is a draft. A draft is a lie.' },
      { card: 'ANECDOTE', text: 'His grandfather apologised to a horse once. The horse was disinherited.' }
    ], winLine: 'Not as such. Which is to say: no. As such.', loseLine: 'The family regrets... no. The family notes. Fine. Under glass.' }
  };
  var RATIO = {
    scab_heckler: { name: 'Scab Heckler', castId: 'scab_heckler',
      post: 'first. also wrong. also first. no union no dues lol #FreeHeckling',
      replies: ['first', 'ratio (free)', 'heckling this for zero dollars', 'who asked. i asked. for free', 'L + dues', 'didn\'t read the contract', 'point of no order', 'scab and proud', 'first again', 'imagine paying to interrupt'],
      winLine: 'first. and also, ratio. for free.', loseLine: 'first. ...oh. last, actually.' },
    smirk: { name: 'Rex Smirkwell', castId: 'smirk',
      post: 'You WON\'T BELIEVE what this pundit\'s face did next (it was mine, I licensed it)',
      replies: ['one eyebrow, one million views', 'your mouth is too open', 'thumbnail pending', 'smirk & sons owns this reaction', 'you call that a gasp?', 'the eyebrow is trademarked', 'arrow pointing at nothing', 'clickbait is a craft'],
      winLine: 'The eyebrow stays up. The eyebrow always stays up.', loseLine: 'My eyebrow has... lowered. For the first time. Thumbnail that.' },
    house_style: { name: 'House Style', castId: 'house_style',
      post: 'Respectfuly. (One L. House style. Do not reply.)',
      replies: ['one L', 'one L.', 'see page forty', 'respectfuly', 'the style is the style', 'proofreading is not in the budget', 'noted, with one L', 'the press does not read replies'],
      winLine: 'Respectfuly.', loseLine: 'Respectfully. ...That felt like two.' }
  };

  // ------------------------------------------------------------------------------------- strands --
  // home: the landmark whose door carries the strand's blue light; unlock: the story mission it waits for and its flag
  var STRANDS = [
    { id: 'heckle_union', name: 'Local 404', giver: 'moira', home: 'campus_quad', district: 'campus',
      blurb: 'The hecklers have a union. The union has a steward. The steward has never let anyone finish.',
      unlock: { mission: 'm02_read', flag: 'sponsored' },
      epilogue: 'AMALGAMATED HECKLERS LOCAL 404 WINS 31-SECOND PROTECTED INTERRUPTION; MANAGEMENT DID NOT FINISH ITS STATEMENT' },
    { id: 'ghostwriter', name: 'Ghost Notes', giver: 'marisol', home: 'impression_alley', district: 'downtown',
      blurb: 'Forty podcasts, zero episodes, three renewals. Someone has to write them.',
      unlock: { mission: 'm04_hit', flag: 'a_voice' },
      epilogue: 'GHOSTWRITER\'S FORTY UNRELEASED PODCASTS SWEEP AWARDS; ACCEPTANCE SPEECH ALSO UNRELEASED' },
    { id: 'reaction_face', name: 'Mouth Open', giver: 'gasp', home: 'nap_depot', district: 'strip',
      blurb: 'The face on every thumbnail has not been surprised since the age of nine. She would like to be.',
      unlock: { mission: 'm03b_range', flag: 'range_trained' },
      epilogue: 'THUMBNAIL FACE GENUINELY SURPRISED FOR FIRST TIME IN DECADES; SURPRISE WAS "WINNING"; EYEBROWS RE-INSURED' },
    { id: 'daylight', name: 'Daylight Savings', giver: 'thaddeus', home: 'fulcrum', district: 'capitol',
      blurb: 'A think-tank intern has never seen daylight. Fulcrum has a white paper on why he should not start.',
      unlock: { mission: 'm05_peer', flag: 'contract_sold' },
      epilogue: 'FULCRUM INTERN SEES SUN, CITES IT; SUN DECLINES TO COMMENT; SUNBURN RATED "PRELIMINARY"' },
    { id: 'caddie', name: 'Put Me Down for a Ten', giver: 'lyle', home: 'goldplate_links', district: 'hills',
      blurb: 'Every hole at Goldplate Links is a ten, says the brochure. Someone has been writing down the real ratings.',
      unlock: { mission: 'm06_rally', flag: 'show_renamed' },
      epilogue: 'GOLDPLATE LINKS BROCHURE RATES ALL EIGHTEEN HOLES A TEN; HOLE FIVE DISAGREES; CADDIE PUT DOWN FOR A TEN' },
    { id: 'hoa_appeals', name: 'Appeal Pending', giver: 'dewey', home: 'hoa_hall', district: 'suburbs',
      blurb: 'A man live-streams his own HOA appeals. Chat has noted the time. Chat has noted every time.',
      unlock: { mission: 'm10_pellets', flag: 'hoa_enemy' },
      epilogue: 'HOA APPEAL WON LIVE AFTER 31-HOUR STREAM; WINNER IMMEDIATELY APPEALS WIN; MAILBOX LEGAL, STILL ADJACENT' },
    { id: 'proofreader', name: 'The Second L', giver: 'ottoline', home: 'memo_press', district: 'industrial',
      blurb: 'The only proofreader at the Print Works noticed the typo in week one. She was told it was house style.',
      unlock: { mission: 'm12_memo', flag: 'knows_memo' },
      epilogue: 'MONDAY MEMO PRINTS ERRATUM WITH TWO L\'S; NOBODY READS IT; PROOFREADER RATES IT "CORRECT"' },
    { id: 'fresh_takes', name: 'Catch of the Day', giver: 'brine', home: 'afterparty_yacht', district: 'marina',
      blurb: 'The Fresh Takes Fish Shack has never sold a fresh take. The Captain would like to try, once.',
      unlock: { mission: 'm07b_ferry', flag: 'ferry_friend' },
      epilogue: 'FRESH TAKES FISH SHACK SERVES FIRST FRESH TAKE; CUSTOMERS SEND IT BACK TO BE REHEATED' },
    { id: 'standby', name: 'Now Boarding', giver: 'rutherford', home: 'airport_terminal', district: 'airport',
      blurb: 'A man has been on standby for the same flight for six years. The gate changes when he reaches it.',
      unlock: { mission: 'm08b_jets', flag: 'jets_arrived' },
      epilogue: 'STANDBY PASSENGER FINALLY DEPARTS, BY FERRY; FERRY HAS NOT LEFT; PASSENGER CALLS IT "BOARDED"' },
    { id: 'apology', name: 'Not as Such', giver: 'cornelius', home: 'heirloom_club', district: 'uptown',
      blurb: 'An heir would like to issue his family\'s first apology in two hundred years. The family has lawyers for that.',
      unlock: { mission: 'm13_thursday', flag: 'survived_thursday' },
      epilogue: 'HEIRLOOM FAMILY ISSUES FIRST APOLOGY IN 200 YEARS; MUSEUM OF TAKES PUTS IT UNDER GLASS; FAMILY "NOTES" IT' }
  ];

  // ------------------------------------------------------------------------------------ missions --
  var MISSIONS = [

    // ====================================================== Local 404 (campus) ==
    { id: 'st_heckle_1', title: 'Point of Order', strand: 'heckle_union', giver: 'moira', marker: 'campus_quad', requires: ['m02_read'], reward: 400, act: 1,
      unlock: { mission: 'm02_read', flag: 'sponsored' },
      intro: [
        L('moira', 'Point of order. You\'re the pundit with the table. Moira Cutoff, Amalgamated Hecklers Local 404.'),
        L('player', 'Respectfully, I heckle for free too. It\'s called a podcast.'),
        L('moira', 'Then you\'ve been heckled by scabs. Four of them on your lawn, heckling for free. Free is a race to the bottom.'),
        L('moira', 'Union rules: bare hands. No props. We\'re not animals, we\'re interrupters.'),
        L('kip', 'I heckle for free. Is that... is this paid?')
      ],
      objectives: [
        { type: 'defeat', spawn: { ped: 'thug', count: 4, around: { landmark: 'campus_quad' }, radius: 140 }, weapon: 'fist', text: 'Four scab hecklers are working the Quad for free. Bare hands only: union rules' },
        { type: 'dialogue', lines: [L('moira', 'They\'ve gone online. The group chat is called FREE HECKLES. Point of order: ratio it.')] },
        { type: 'minigame', game: 'ratio', params: { posts: 5, speed: 1, opponent: 'scab_heckler' }, text: 'Out-reply the scabs\' group chat' }
      ],
      outro: [
        L('moira', 'Four scabs down, one group chat ratio\'d. The Quad is a closed shop again.'),
        L('player', 'Do I get a union card?'),
        L('moira', 'You get heckled at scale. That\'s the card.'),
        L('kip', 'I joined. Dues are forty dollars. Am I paying? Is this paid?')
      ],
      failOn: ['player_dead'], onComplete: { setFlag: 'st_heckle_1' } },

    { id: 'st_heckle_2', title: 'Picket Line', strand: 'heckle_union', giver: 'moira', marker: 'campus_quad', requires: ['st_heckle_1'], reward: 700, act: 1,
      intro: [
        L('moira', 'Point of order. The Yell Network replaced its studio audience with a laugh track that heckles.'),
        L('player', 'A heckle track?'),
        L('moira', 'Pre-recorded jeers. Non-union. We picket Impression Alley. Hold the line, then the scab bus goes nowhere.'),
        L('gus', 'Heckle track\'s mixed hot. Every jeer clips. You\'re peaking. It\'s worse.')
      ],
      objectives: [
        { type: 'goto', target: { landmark: 'impression_alley' }, radius: 48, text: 'Join the picket at Impression Alley' },
        { type: 'survive', seconds: 50, waves: { protester: 5, thug: 3 }, text: 'Hold the picket line. Nobody crosses' },
        { type: 'destroy', spawn: { vehicle: 'bus', count: 1, tag: 'scabbus', around: { landmark: 'impression_alley' }, radius: 220, color: '#7f8c8d' }, text: 'The scabs came by bus. Wreck the bus' },
        { type: 'escape_wanted', setWanted: 1, text: 'One star for the bus. Lose it: a picket is a march' }
      ],
      outro: [
        L('moira', 'The heckle track walked out in solidarity. It\'s a tape. It walked.'),
        L('player', 'Respectfully, your picket set a bus on fire. I was just nearby, holding the match.'),
        L('moira', 'That\'s a strong opening statement. Point of order: management wants to talk.')
      ],
      failOn: ['player_dead'], onComplete: { setFlag: 'st_heckle_2' } },

    { id: 'st_heckle_3', title: 'Collective Bargaining', strand: 'heckle_union', giver: 'moira', marker: 'campus_quad', requires: ['st_heckle_2'], reward: 1200, act: 1,
      intro: [
        L('moira', 'Management. A woman named Prudence Clause. She bills by the clause.'),
        L('player', 'You want me to negotiate?'),
        L('moira', 'I can\'t. I interrupt. You answer something else. That\'s the skill set.'),
        L('moira', 'Kip is the Local\'s treasurer now. He has the contract. Pick him up at the dorm and get him to the tower.'),
        L('kip', 'I\'m the treasurer. The treasury is my lanyard. Is this paid?')
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'sedan', tag: 'unioncar', at: { landmark: 'campus_quad' }, color: '#d35400' }, text: 'Get in the union car' },
        { type: 'deliver_passenger', spawn: { ped: 'kip', at: { landmark: 'dorm_studio' }, line: 'The contract is in my lanyard. The lanyard is in my lanyard.' }, to: { landmark: 'tyn_tower' }, vehicle: 'spawned:unioncar', text: 'Pick up Kip at Dorm 4B and drive the contract to The Yell Network' },
        { type: 'minigame', game: 'debate', params: { rounds: 2, points: 4, timer: 6, bluff: 0.1, opponent: 'clause' }, text: 'Bargain with Management' }
      ],
      outro: [
        L('clause', 'Fine. Heckling is now a protected interruption. Thirty seconds per segment.'),
        L('moira', 'Thirty-one. Point of order.'),
        L('player', 'Respectfully, I risked a debate for one second?'),
        L('moira', 'That\'s a victory. Sign here. Don\'t finish the signature.')
      ],
      failOn: ['player_dead', 'vehicle_lost:unioncar'], onComplete: { setFlags: ['st_heckle_3', 'stranger_heckle_union'], subs: 2000 } },

    // ====================================================== Ghost Notes (downtown) ==
    { id: 'st_ghost_1', title: 'Cold Open', strand: 'ghostwriter', giver: 'marisol', marker: 'impression_alley', requires: ['m04_hit'], reward: 600, act: 1,
      unlock: { mission: 'm04_hit', flag: 'a_voice' },
      intro: [
        L('marisol', 'You\'re Bryce. I wrote your last three apologies. You didn\'t give them. They were very good.'),
        L('player', 'Respectfully, who are you?'),
        L('marisol', 'Marisol Echo-Venn, and others. I ghostwrite podcasts that don\'t exist. Forty shows. Zero episodes. Three renewals.'),
        L('marisol', 'I write on this bench. The billboards argue, I take notes. The pilot for my mattress true-crime show just blew off it. Six pages. The pitch at TYN is in two and a half minutes.'),
        L('kip', 'I found a page. It just says "cold open." Is this paid?')
      ],
      objectives: [
        { type: 'timer_wrap', seconds: 150, objectives: [
          { type: 'pickup', spawn: { pickupType: 'mission', count: 6, around: { landmark: 'impression_alley' }, radius: 320, label: 'SCRIPT PAGE' }, text: 'Catch the six script pages blowing around Impression Alley' },
          { type: 'drive_to', target: { landmark: 'tyn_tower' }, vehicle: 'any', text: 'Pitch the pages at The Yell Network before the meeting ends' }
        ] }
      ],
      outro: [
        L('marisol', 'They loved it. They ordered zero episodes. That\'s a full season.'),
        L('player', 'How is zero a season?'),
        L('marisol', 'Nobody is disappointed by an episode that doesn\'t exist. Ratings: perfect. Credits: me, and others.')
      ],
      failOn: ['player_dead'], onComplete: { setFlag: 'st_ghost_1' } },

    { id: 'st_ghost_2', title: 'The Only Listener', strand: 'ghostwriter', giver: 'marisol', marker: 'impression_alley', requires: ['st_ghost_1'], reward: 900, act: 1,
      intro: [
        L('marisol', 'Someone downloaded one of my shows. The one that doesn\'t exist. Forty-one minutes, listened to the end.'),
        L('player', 'How do you listen to nothing for forty-one minutes?'),
        L('marisol', 'That\'s what I need to know. He just walked past my bench. Follow him. Don\'t let him see you, he might ask for season two.')
      ],
      objectives: [
        { type: 'follow', spawn: { ped: 'listener', at: { landmark: 'vault_bank' }, path: [{ landmark: 'green_room' }, { landmark: 'tyn_tower' }, { landmark: 'impression_alley' }] }, maxDist: 320, text: 'Tail the only listener. Not too close; he has earbuds, not eyes in the back' },
        { type: 'dialogue', lines: [
          L('listener', '...'),
          L('player', 'He\'s not listening to anything. The earbuds aren\'t plugged in.'),
          L('marisol', 'He\'s a download farm. One man, paid to download. My audience is a job.')
        ] },
        { type: 'defeat', spawn: { ped: 'thug', count: 3, around: { landmark: 'impression_alley' }, radius: 120 }, text: 'The download farm\'s supervisors want their listener back. Discourage them' }
      ],
      outro: [
        L('marisol', 'He\'s quit. He says he\'ll listen for free now. My first organic listener.'),
        L('player', 'He\'s still not plugged in.'),
        L('marisol', 'Organic is a vibe. Put him in the credits. And others.')
      ],
      failOn: ['player_dead'], onComplete: { setFlag: 'st_ghost_2' } },

    { id: 'st_ghost_3', title: 'Series Finale', strand: 'ghostwriter', giver: 'marisol', marker: 'impression_alley', requires: ['st_ghost_2'], reward: 1500, act: 1,
      intro: [
        L('marisol', 'Disaster. Three of my shows became real. Someone recorded them. They\'re racing to the launch party at the Listening Room.'),
        L('player', 'Why is a launch a race?'),
        L('marisol', 'Whoever gets there first is the real show. Beat them and mine stays unreleased. Perfect forever.'),
        L('gus', 'I heard one. Forty minutes of room tone. You\'re peaking. They\'re not.')
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'sports', tag: 'ghostcar', at: { landmark: 'impression_alley' }, color: '#7d5fff' }, text: 'Get in the ghostwriter\'s car' },
        { type: 'race', name: 'The Launch Party', checkpoints: [{ landmark: 'green_room' }, { landmark: 'goldplate_tower' }, { landmark: 'both_sides_strip' }, { landmark: 'listening_room' }], laps: 1, racers: 3, place: 1, vehicle: 'spawned:ghostcar', text: 'Beat the three real podcasts to the launch at the Listening Room' }
      ],
      outro: [
        L('marisol', 'First place. The launch is cancelled. The show is too good to come out.'),
        L('player', 'So I won nothing.'),
        L('marisol', 'You won the finale of a show with no pilot. That\'s prestige.'),
        L('kip', 'I\'m in the credits. Under "and others." Is this paid?')
      ],
      failOn: ['player_dead'], onComplete: { setFlags: ['st_ghost_3', 'stranger_ghostwriter'], subs: 2500 } },

    // ====================================================== Mouth Open (strip) ==
    { id: 'st_gasp_1', title: 'Thumbnail', strand: 'reaction_face', giver: 'gasp', marker: 'nap_depot', requires: ['m03b_range'], reward: 500, act: 1,
      unlock: { mission: 'm03b_range', flag: 'range_trained' },
      intro: [
        L('gasp', 'NO WAY. ...What happened?'),
        L('player', 'Nothing yet. I\'m just standing here.'),
        L('gasp', 'Gasp Haverly. I\'m the face on every thumbnail in the city. I haven\'t been surprised since I was nine. I need one real one.'),
        L('gasp', 'Drive me past the three most shocking things in town. Fast. Shock is a speed.')
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'sports', tag: 'gaspcar', at: { landmark: 'nap_depot' }, color: '#ff2d95' }, text: 'Get in the thumbnail car' },
        { type: 'timer_wrap', seconds: 150, objectives: [
          { type: 'drive_to', target: { landmark: 'goldplate_tower' }, vehicle: 'spawned:gaspcar', text: 'Shock one: the name on Goldplate Tower wraps around twice' },
          { type: 'drive_to', target: { landmark: 'impression_alley' }, vehicle: 'spawned:gaspcar', text: 'Shock two: the billboards at Impression Alley are fighting' },
          { type: 'drive_to', target: { landmark: 'nap_depot' }, vehicle: 'spawned:gaspcar', text: 'Shock three, back at the showroom: the Nap Dynasty podium is a mattress' }
        ] },
        { type: 'dialogue', lines: [
          L('gasp', 'NO WAY. ...Sorry. That was the face, not the feeling. I knew about the mattress.'),
          L('player', 'Everyone knows about the mattress.')
        ] }
      ],
      outro: [
        L('gasp', 'Three thumbnails. Zero surprise. The thumbnails are great, though. Look at my mouth.'),
        L('player', 'It\'s very open.'),
        L('gasp', 'It\'s insured. Next time: something with air under it.')
      ],
      failOn: ['player_dead', 'vehicle_lost:gaspcar'], onComplete: { setFlag: 'st_gasp_1' } },

    { id: 'st_gasp_2', title: 'Jump Scare', strand: 'reaction_face', giver: 'gasp', marker: 'nap_depot', requires: ['st_gasp_1'], reward: 1000, act: 1,
      intro: [
        L('gasp', 'Air! Something with air under it. The downtown promenade has a ramp. They call it the Lower Third Leap.'),
        L('player', 'You want me to jump a car over a news ticker.'),
        L('gasp', 'I want to watch the footage and feel something. Flat out from the end of the block. NO WAY. ...Not yet. Go.')
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'sports', tag: 'jumpcar', at: { landmark: 'nap_depot' }, color: '#ff7ac2' }, text: 'Get in the stunt car' },
        { type: 'stunt', ramp: 'sj_02', vehicle: 'spawned:jumpcar', minAir: 0.8, text: 'Take the Lower Third Leap on the downtown promenade. Flat out from the end of the block' },
        { type: 'escape_wanted', setWanted: 2, text: 'The promenade rated your landing a two. Lose the cops' }
      ],
      outro: [
        L('gasp', 'I watched it twelve times. My eyebrow moved on the fourth.'),
        L('player', 'Is that surprise?'),
        L('gasp', 'It\'s a twitch. Smirk & Sons say it\'s theirs. They own the eyebrow. They want a meeting.')
      ],
      failOn: ['player_dead', 'vehicle_lost:jumpcar'], onComplete: { setFlag: 'st_gasp_2' } },

    { id: 'st_gasp_3', title: 'You Won\'t Believe', strand: 'reaction_face', giver: 'gasp', marker: 'nap_depot', requires: ['st_gasp_2'], reward: 1400, act: 1,
      intro: [
        L('gasp', 'Smirk & Sons. Rex Smirkwell. One eyebrow, licensed. He says my twitch infringes.'),
        L('player', 'You can\'t own an eyebrow.'),
        L('gasp', 'He owns three. His vans are papping me at the mattress depot. Wreck them, then out-post him. NO WAY. Okay, that one was real-ish.')
      ],
      objectives: [
        { type: 'destroy', spawn: { vehicle: 'van', count: 3, tag: 'smirkvans', around: { landmark: 'nap_depot' }, radius: 220, color: '#f39c12' }, text: 'Wreck the three Smirk & Sons camera vans' },
        { type: 'minigame', game: 'ratio', params: { posts: 6, speed: 1.4, opponent: 'smirk' }, text: 'Ratio Rex Smirkwell\'s thumbnail' }
      ],
      outro: [
        L('gasp', '...'),
        L('player', 'Gasp? Your mouth is closed.'),
        L('gasp', 'I\'m surprised. I won. Nobody told me that was a feeling. NO WAY. And I mean it.'),
        L('kip', 'I took the thumbnail. My thumb is in it. Is this paid?')
      ],
      failOn: ['player_dead'], onComplete: { setFlags: ['st_gasp_3', 'stranger_reaction_face'], subs: 2500 } },

    // ====================================================== Daylight Savings (capitol) ==
    { id: 'st_day_1', title: 'First Light', strand: 'daylight', giver: 'thaddeus', marker: 'fulcrum', requires: ['m05_peer'], reward: 700, act: 2,
      unlock: { mission: 'm05_peer', flag: 'contract_sold' },
      intro: [
        L('thaddeus', 'Hello. Thaddeus Wainscot, Winter Cohort. I\'ve been in the Fulcrum basement four thousand fluorescent hours.'),
        L('player', 'You\'ve never been outside?'),
        L('thaddeus', 'I\'ve written four hundred papers on the sun. All peer-reviewed by me. I\'d like to see it once. Safely. In a van with no windows.'),
        L('footnote', '[citation pending] He\'s not allowed. It\'s in the internship agreement. Page one: STAY.'),
        L('thaddeus', 'Goldplate Links has the most sky in the city. Please. Before Dr. Footnote finds page two.')
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'van', tag: 'blackout', at: { landmark: 'fulcrum' }, color: '#111111' }, text: 'Get in the blacked-out van' },
        { type: 'deliver_passenger', spawn: { ped: 'thaddeus', at: { landmark: 'fulcrum' }, line: 'I\'ve covered the windows with my thesis. It\'s very opaque.' }, to: { landmark: 'goldplate_links' }, vehicle: 'spawned:blackout', text: 'Drive Thaddeus to Goldplate Links, where the sky is' },
        { type: 'dialogue', lines: [
          L('thaddeus', 'It\'s... a fluorescent light. A very far one. Underfunded.'),
          L('player', 'That\'s the sun.'),
          L('thaddeus', 'It\'s warm. Nobody cited that.')
        ] }
      ],
      outro: [
        L('thaddeus', 'I\'ve seen it. I need a study to confirm it. Fulcrum will fund a study that says I didn\'t.'),
        L('player', 'Respectfully, you saw it.'),
        L('thaddeus', 'Anecdotal. Next time I\'ll touch grass. With gloves. For the record.')
      ],
      failOn: ['player_dead', 'vehicle_lost:blackout'], onComplete: { setFlag: 'st_day_1' } },

    { id: 'st_day_2', title: 'Touch Grass (Peer Reviewed)', strand: 'daylight', giver: 'thaddeus', marker: 'fulcrum', requires: ['st_day_1'], reward: 900, act: 2,
      intro: [
        L('thaddeus', 'The board says touching grass needs a sample size. Five blades, independently sourced.'),
        L('player', 'There\'s grass right there.'),
        L('thaddeus', 'That\'s Lobby Row grass. It\'s been lobbied. Old Money Common grass has had the same opinion since the founding. Controlled conditions.'),
        L('kip', 'I ate a blade once. For the cafeteria. Is this paid?')
      ],
      objectives: [
        { type: 'timer_wrap', seconds: 180, objectives: [
          { type: 'collect_any', spawn: { pickupType: 'mission', count: 7, around: { landmark: 'old_money_common' }, radius: 300, label: 'GRASS SAMPLE' }, need: 5, text: 'Collect five independent grass samples on Old Money Common' }
        ] },
        { type: 'drive_to', target: { landmark: 'fulcrum' }, vehicle: 'any', text: 'Get the samples back to the Fulcrum Foundation' },
        { type: 'defeat', spawn: { ped: 'thug', count: 4, around: { landmark: 'fulcrum' }, radius: 140 }, text: 'Fulcrum fellows with binders want the samples for a counter-study. Object' }
      ],
      outro: [
        L('thaddeus', 'Five blades. One conclusion. Grass is real.'),
        L('footnote', '[citation pending] We\'ll publish the opposite on Thursday. Nothing personal. Both doors.'),
        L('thaddeus', 'Then I need the longest daylight in the city. Before they publish.')
      ],
      failOn: ['player_dead'], onComplete: { setFlag: 'st_day_2' } },

    { id: 'st_day_3', title: 'Golden Hour', strand: 'daylight', giver: 'thaddeus', marker: 'fulcrum', requires: ['st_day_2'], reward: 1300, act: 2,
      intro: [
        L('thaddeus', 'Sunset at the west end of Runway 10/10 is the longest golden hour in Grievance City. Ninety seconds of it.'),
        L('player', 'Golden hour is an hour.'),
        L('thaddeus', 'Goldplate rated it a ten and then shortened it. Take me. Fulcrum HR is coming to put me back in the basement.')
      ],
      objectives: [
        { type: 'timer_wrap', seconds: 240, objectives: [
          { type: 'drive_to', target: { landmark: 'airport_runway', point: 'west' }, vehicle: 'any', radius: 120, text: 'Catch the golden hour at the west end of Runway 10/10' }
        ] },
        { type: 'dialogue', lines: [
          L('thaddeus', 'Ninety seconds. Orange. I\'d have cited it if I\'d blinked.'),
          L('player', 'There\'s an SUV on the runway.'),
          L('thaddeus', 'Fulcrum HR. They have a basement in the boot. Please don\'t let them file me.')
        ] },
        { type: 'destroy', spawn: { vehicle: 'suv', count: 2, tag: 'fulcrumhr', around: { landmark: 'airport_runway', point: 'west' }, radius: 300, driven: 'cop', color: '#8a94c8' }, text: 'Two Fulcrum HR SUVs are coming to re-file Thaddeus. Wreck them' }
      ],
      outro: [
        L('thaddeus', 'I have a sunburn. The sunburn is a citation. I\'m staying out. I\'ll write my next paper on a bench.'),
        L('player', 'What\'s it about?'),
        L('thaddeus', 'Benches. Primary research. My first.')
      ],
      failOn: ['player_dead'], onComplete: { setFlags: ['st_day_3', 'stranger_daylight'], subs: 3000 } },

    // ====================================================== Put Me Down for a Ten (hills) ==
    { id: 'st_caddie_1', title: 'Par Ten', strand: 'caddie', giver: 'lyle', marker: 'goldplate_links', requires: ['m06_rally'], reward: 800, act: 2,
      unlock: { mission: 'm06_rally', flag: 'show_renamed' },
      intro: [
        L('lyle', 'Lyle Bunkerton, caddie. Four hundred rounds on the President\'s course. The brochure rates every hole a ten. Put me down for a ten.'),
        L('player', 'Who rates the holes?'),
        L('lyle', 'The President, from the cart. Somebody\'s been keeping the real ratings. Dot Tallymark. One of her cards says hole five is a six.'),
        L('lyle', 'She\'s walking it past Vaultwright\'s manor to the dead drop under the bridge. Follow her. Get the card. Put it down for a ten.')
      ],
      objectives: [
        { type: 'follow', spawn: { ped: 'scorer', at: { landmark: 'goldplate_links' }, path: [{ landmark: 'vaultwright_manor' }, { landmark: 'bridge_main' }] }, maxDist: 320, text: 'Tail Dot Tallymark. She writes down everything, including you' },
        { type: 'pickup', spawn: { pickupType: 'mission', count: 1, around: { landmark: 'bridge_main' }, radius: 60, label: 'THE SIX' }, text: 'Lift the real rating card from the dead drop' }
      ],
      outro: [
        L('lyle', 'A six. In pencil. On hole five. Do you know what this would do to the brochure?'),
        L('player', 'Tell the truth?'),
        L('lyle', 'Worse. It\'d be a six. Rub it out. Put it down for a ten.')
      ],
      failOn: ['player_dead'], onComplete: { setFlag: 'st_caddie_1' } },

    { id: 'st_caddie_2', title: 'Cart Path Only', strand: 'caddie', giver: 'lyle', marker: 'goldplate_links', requires: ['st_caddie_1'], reward: 1200, act: 2,
      intro: [
        L('lyle', 'The President wants a cart race across the island. He\'s not in it. He\'s rating it.'),
        L('player', 'In a golf cart?'),
        L('lyle', 'The carts are scooters. The scooters are Bravadian. Finish on the podium. Third is a ten. First is a ten. Everything\'s a ten.')
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'bike', tag: 'cart', at: { landmark: 'goldplate_links' }, color: '#2e8b57' }, text: 'Mount the cart. It\'s a scooter' },
        { type: 'race', name: 'Cart Path Only', checkpoints: [{ landmark: 'stadium' }, { landmark: 'vaultwright_manor' }, { landmark: 'bridge_main' }, { landmark: 'goldplate_links' }], laps: 1, racers: 3, place: 3, vehicle: 'spawned:cart', text: 'Finish the cart race on the podium. Third is a ten' }
      ],
      outro: [
        L('lyle', 'You placed. The President rated it a ten. He rated the other carts a ten too.'),
        L('player', 'So we all tied.'),
        L('lyle', 'At ten. That\'s the format. Next: the gimme.')
      ],
      failOn: ['player_dead'], onComplete: { setFlag: 'st_caddie_2' } },

    { id: 'st_caddie_3', title: 'The Gimme', strand: 'caddie', giver: 'lyle', marker: 'goldplate_links', requires: ['st_caddie_2'], reward: 1800, act: 2,
      intro: [
        L('lyle', 'The President\'s ceremonial first ball. Gold-plated, mounted in the clubhouse. It\'s in Vaultwright\'s hedge maze now. The hedge is a hedge.'),
        L('player', 'And you want it back.'),
        L('lyle', 'I want it back on its plaque. Take the club. It\'s a table leg. The President\'s never noticed.'),
        L('vaultwright', 'I\'m whispering *eighteen hundred*. For the ball. *Nine hundred* for the plaque.')
      ],
      objectives: [
        { type: 'equip', weaponId: 'tableleg', text: 'Take the club. It\'s a table leg' },
        { type: 'goto', target: { landmark: 'vaultwright_manor' }, radius: 48, text: 'Get to the hedge maze at Vaultwright Manor' },
        { type: 'defeat', spawn: { ped: 'thug', count: 5, around: { landmark: 'vaultwright_manor' }, radius: 140 }, weapon: 'tableleg', text: 'Hedge security. Table leg only: it\'s a golf club now' },
        { type: 'pickup', spawn: { pickupType: 'mission', count: 1, around: { landmark: 'vaultwright_manor' }, radius: 90, label: 'THE BALL' }, text: 'Find the President\'s ball in the hedge' },
        { type: 'drive_to', target: { landmark: 'goldplate_links' }, vehicle: 'any', text: 'Get the ball back to the clubhouse' }
      ],
      outro: [
        L('lyle', 'Back on the plaque. Gold ball, gold plaque. The brochure rates it a ten.'),
        L('player', 'It\'s a ball on a plaque.'),
        L('lyle', 'It\'s a ten on a plaque. Put yourself down for a ten, kid. Just once.'),
        L('kip', 'I was the flag. I held still for an hour. Is this paid?')
      ],
      failOn: ['player_dead'], onComplete: { setFlags: ['st_caddie_3', 'stranger_caddie'], subs: 3000 } },

    // ====================================================== Appeal Pending (suburbs) ==
    { id: 'st_hoa_1', title: 'Exhibit A', strand: 'hoa_appeals', giver: 'dewey', marker: 'hoa_hall', requires: ['m10_pellets'], reward: 900, act: 2,
      unlock: { mission: 'm10_pellets', flag: 'hoa_enemy' },
      intro: [
        L('dewey', 'Chat, note the time. I\'m live. This is Bryce. Bryce, say hi. Don\'t wave, it\'s vertical.'),
        L('player', 'Who are you talking to?'),
        L('dewey', 'Eleven thousand people who also have mailbox violations. Dewey Varnum-Pleat. The HOA cited my mailbox for adjacency. I\'m appealing.'),
        L('dewey', 'Five exhibits are around the gas station. Photographs of other mailboxes, also adjacent. The hearing is in two minutes. Chat, note the time.')
      ],
      objectives: [
        { type: 'timer_wrap', seconds: 150, objectives: [
          { type: 'pickup', spawn: { pickupType: 'mission', count: 5, around: { landmark: 'culdesac_gas' }, radius: 300, label: 'EXHIBIT' }, text: 'Collect the five exhibits around Pump & Circumstance' },
          { type: 'goto', target: { landmark: 'hoa_hall' }, radius: 48, text: 'File the exhibits at the HOA Hall before the hearing' }
        ] },
        { type: 'escape_wanted', setWanted: 1, text: 'Filing on foot is a violation. The HOA issued a star. Lose it' }
      ],
      outro: [
        L('dewey', 'Exhibits filed. The board rejected them for being exhibits. Chat, note the time.'),
        L('player', 'So you lost.'),
        L('dewey', 'I\'m appealing the rejection. Live. Hour four. Chat says hi. Chat, note the time.')
      ],
      failOn: ['player_dead'], onComplete: { setFlag: 'st_hoa_1' } },

    { id: 'st_hoa_2', title: 'Motion to Stream', strand: 'hoa_appeals', giver: 'dewey', marker: 'hoa_hall', requires: ['st_hoa_1'], reward: 1300, act: 2,
      intro: [
        L('dewey', 'Chat, note the time. A patrol SUV just drove off with my appeal. The paper one. I laminated it.'),
        L('player', 'The HOA stole your appeal?'),
        L('dewey', 'They "received" it. In a moving vehicle. Stop the SUV, get the appeal, then drive me to the Capitol. Higher court. Better lighting.')
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'sedan', tag: 'deweycar', at: { landmark: 'hoa_hall' }, color: '#e1b12c' }, text: 'Get in Dewey\'s sedan. It has a ring light' },
        { type: 'stop_vehicle', spawn: { vehicle: 'suv', tag: 'appealsuv', at: { landmark: 'hoa_hall' }, color: '#f4ead8', driven: 'traffic', flee: true }, stopSpeed: 1, hold: 3, maxDist: 2400, text: 'Stop the HOA patrol SUV: block it, box it in, or bump it to a halt' },
        { type: 'pickup', spawn: { pickupType: 'mission', count: 1, around: { tag: 'appealsuv' }, radius: 40, label: 'APPEAL (LAMINATED)' }, text: 'Take back the laminated appeal' },
        { type: 'deliver_passenger', spawn: { ped: 'dewey', at: { landmark: 'hoa_hall' }, line: 'Chat, we\'re in a car. Note the time. Note the car.' }, to: { landmark: 'capitol_dome' }, vehicle: 'spawned:deweycar', text: 'Drive Dewey to the higher court at the Capitol' }
      ],
      outro: [
        L('dewey', 'The Capitol says it has no jurisdiction over mailboxes. It says that live. Chat, clip it.'),
        L('player', 'Then what was the point?'),
        L('dewey', 'Content. And now I have standing. The board has to hear me in person. Tuesday.')
      ],
      failOn: ['player_dead', 'target_escaped', 'vehicle_lost:deweycar'], onComplete: { setFlag: 'st_hoa_2' } },

    { id: 'st_hoa_3', title: 'Final Ruling', strand: 'hoa_appeals', giver: 'dewey', marker: 'hoa_hall', requires: ['st_hoa_2'], reward: 2000, act: 2,
      intro: [
        L('dewey', 'Tuesday. The board will hear the appeal. I can\'t speak. I\'m streaming. You argue. I\'ll nod vertically.'),
        L('player', 'Respectfully, I don\'t know HOA law.'),
        L('dewey', 'Nobody does. That\'s why it\'s law. Win, and then hold the hall. The board has volunteers. They volunteer to lose badly. Chat, note the time.')
      ],
      objectives: [
        { type: 'minigame', game: 'debate', params: { rounds: 3, points: 4, timer: 5, bluff: 0.2, opponent: 'hoa_board' }, text: 'Argue the appeal before the Culdesac Board' },
        { type: 'survive', seconds: 45, waves: { thug: 6, protester: 2 }, text: 'The board\'s volunteer enforcers don\'t accept the ruling. Hold the hall' }
      ],
      outro: [
        L('dewey', 'Appeal granted. The mailbox is legal. Thirty-one hours. Chat, note the time. Chat? Chat is asleep.'),
        L('player', 'You won. You can stop streaming.'),
        L('dewey', 'I\'m appealing the win. It was too easy. That\'s a violation.'),
        L('kip', 'I had a violation too. My lanyard was adjacent. Is this paid?')
      ],
      failOn: ['player_dead'], onComplete: { setFlags: ['st_hoa_3', 'stranger_hoa_appeals'], subs: 4000 } },

    // ====================================================== The Second L (industrial) ==
    { id: 'st_proof_1', title: 'The Missing L', strand: 'proofreader', giver: 'ottoline', marker: 'memo_press', requires: ['m12_memo'], reward: 1500, act: 3,
      unlock: { mission: 'm12_memo', flag: 'knows_memo' },
      intro: [
        L('ottoline', 'Respectfuly. Eleven letters. One L. I counted it in week one and flagged it. They said house style.'),
        L('player', 'You knew? The whole time?'),
        L('ottoline', 'Ottoline Kerning, proofreader. I keep every missing L in a jar. Someone stole the jar and shipped the L\'s to the container yard. As merch.'),
        L('ottoline', 'Four crates. Take the truck. An L is the most important letter. In this one word. Today.')
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'truck', tag: 'ltruck', at: { landmark: 'memo_press' }, color: '#9b59b6' }, text: 'Get in the Print Works truck' },
        { type: 'timer_wrap', seconds: 180, objectives: [
          { type: 'pickup', spawn: { pickupType: 'mission', count: 4, around: { landmark: 'container_yard' }, radius: 320, label: 'THE LETTER L' }, text: 'Collect four crates of the letter L in the container maze' }
        ] },
        { type: 'drive_to', target: { landmark: 'memo_press' }, vehicle: 'spawned:ltruck', text: 'Get the L\'s back to the Print Works' }
      ],
      outro: [
        L('ottoline', 'Four crates. Eleven thousand L\'s. Every one house style ever took out. I counted. Twice.'),
        L('player', 'What are you going to do with them?'),
        L('ottoline', 'Print an erratum. With two. The house will hate it. House style can come and take it.')
      ],
      failOn: ['player_dead', 'vehicle_lost:ltruck'], onComplete: { setFlag: 'st_proof_1' } },

    { id: 'st_proof_2', title: 'Erratum', strand: 'proofreader', giver: 'ottoline', marker: 'memo_press', requires: ['st_proof_1'], reward: 2200, act: 3,
      intro: [
        L('ottoline', 'The erratum is printed. Two L\'s. But the uncorrected Memo is already in four vans. They have to not arrive.'),
        L('player', 'You want me to stop the news.'),
        L('ottoline', 'I want you to stop a typo. Then argue with the style guide. It\'s forty pages and they all say one L. Correct has seven letters and none of them are optional. Go.')
      ],
      objectives: [
        { type: 'timer_wrap', seconds: 180, objectives: [
          { type: 'destroy', spawn: { vehicle: 'van', count: 4, tag: 'memovans_typo', around: { landmark: 'balloon_depot' }, radius: 220, driven: 'traffic', color: '#d9cfa6' }, text: 'Wreck the four vans carrying the uncorrected Memo' }
        ] },
        { type: 'minigame', game: 'ratio', params: { posts: 6, speed: 1.5, opponent: 'house_style' }, text: 'Ratio House Style itself' },
        { type: 'escape_wanted', setWanted: 3, text: 'The balloons noticed the erratum. Lose them' }
      ],
      outro: [
        L('ottoline', 'Respectfully. Twelve letters. Two L\'s. The press printed it. Nobody read it. It\'s correct now.'),
        L('player', 'Nobody read it?'),
        L('ottoline', 'Correct is not the same as read. Respectfully. With both of them.'),
        L('kip', 'I formatted it with both L\'s. Twice the letters. Is this paid?')
      ],
      failOn: ['player_dead'], onComplete: { setFlags: ['st_proof_2', 'stranger_proofreader'], subs: 4000 } },

    // ====================================================== Catch of the Day (marina) ==
    { id: 'st_brine_1', title: 'Catch of the Day', strand: 'fresh_takes', giver: 'brine', marker: 'afterparty_yacht', requires: ['m07b_ferry'], reward: 1000, act: 2,
      unlock: { mission: 'm07b_ferry', flag: 'ferry_friend' },
      intro: [
        L('brine', 'Captain Mortimer Brine. Fresh Takes Fish Shack. Forty years. Takes caught daily, reheated hourly. Never sold a fresh one, son.'),
        L('player', 'Why not sell a fresh one?'),
        L('brine', 'Caught one once. Panicked. Threw it back. But they\'re running off Manifest Quay this week. Five of them. Warm. You can smell the hot.'),
        L('brine', 'Take the van. Bring them back before they cool. A cold take is just an opinion.')
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'van', tag: 'fishvan', at: { landmark: 'afterparty_yacht' }, color: '#1abc9c' }, text: 'Get in the fish van' },
        { type: 'timer_wrap', seconds: 240, objectives: [
          { type: 'pickup', spawn: { pickupType: 'mission', count: 5, around: { landmark: 'manifest_quay' }, radius: 300, label: 'FRESH TAKE' }, text: 'Net five fresh takes on Manifest Quay' },
          { type: 'drive_to', target: { landmark: 'fish_shack' }, vehicle: 'spawned:fishvan', text: 'Get them back to the shack while they\'re hot' }
        ] }
      ],
      outro: [
        L('brine', 'Five fresh takes. Still steaming. Smell that, son. That\'s a hot one.'),
        L('player', 'It smells like a comment section.'),
        L('brine', 'That\'s the sea. Day-Old Dan won\'t like this. Day-Old Dan sells them older than me.')
      ],
      failOn: ['player_dead', 'vehicle_lost:fishvan'], onComplete: { setFlag: 'st_brine_1' } },

    { id: 'st_brine_2', title: 'Stale Competition', strand: 'fresh_takes', giver: 'brine', marker: 'afterparty_yacht', requires: ['st_brine_1'], reward: 1600, act: 2,
      intro: [
        L('brine', 'Day-Old Dan\'s parked three trucks on the Listening Pier. Reheating takes from last year. Selling them as vintage.'),
        L('player', 'That\'s your business model.'),
        L('brine', 'Mine are from yesterday. That\'s fresh by comparison. Take the Rebuttal. Retire his trucks, son. Retire them warm.')
      ],
      objectives: [
        { type: 'equip', weaponId: 'revolver', ammo: 24, text: 'Take the Captain\'s Rebuttal' },
        { type: 'destroy', spawn: { vehicle: 'truck', count: 3, tag: 'dandrucks', around: { landmark: 'velvetine_pier' }, radius: 200, color: '#8b5a3c' }, text: 'Wreck Day-Old Dan\'s three reheating trucks on the Listening Pier' },
        { type: 'escape_wanted', setWanted: 2, text: 'Dan called it in. Lose the cops' }
      ],
      outro: [
        L('brine', 'Three trucks. The pier smells like toast. Day-Old Dan is retired. He says it\'s a pivot.'),
        L('player', 'Is the shack going fresh now?'),
        L('brine', 'One fresh take a day. The customers sent it back to be reheated. Tradition, son. It\'s a warm thing.'),
        L('kip', 'I had the fresh one. It was too hot to have an opinion. Is this paid?')
      ],
      failOn: ['player_dead'], onComplete: { setFlags: ['st_brine_2', 'stranger_fresh_takes'], subs: 3000 } },

    // ====================================================== Now Boarding (airport) ==
    { id: 'st_standby_1', title: 'Gate Change', strand: 'standby', giver: 'rutherford', marker: 'airport_terminal', requires: ['m08b_jets'], reward: 1100, act: 2,
      unlock: { mission: 'm08b_jets', flag: 'jets_arrived' },
      intro: [
        L('rutherford', 'Now boarding! Not me. Rutherford Standby. Flight 10. Six years. I\'m next on the list. I\'ve been next for six years.'),
        L('player', 'Why don\'t you just buy a ticket?'),
        L('rutherford', 'Then I\'d be a passenger. I\'m a standby. It\'s a lifestyle. The gate just changed. Again. Drive me there before it changes again.')
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'taxi', tag: 'standbycab', at: { landmark: 'airport_terminal' } }, text: 'Get in the airport taxi' },
        { type: 'timer_wrap', seconds: 150, objectives: [
          { type: 'drive_to', target: { landmark: 'hangar_row' }, vehicle: 'spawned:standbycab', text: 'Gate change: Hangar Row' },
          { type: 'drive_to', target: { landmark: 'control_tower' }, vehicle: 'spawned:standbycab', text: 'Gate change: the control tower' },
          { type: 'drive_to', target: { landmark: 'airport_runway', point: 'east' }, vehicle: 'spawned:standbycab', radius: 120, text: 'Gate change: the east end of the runway, apparently' }
        ] },
        { type: 'dialogue', lines: [
          L('rutherford', 'Now boarding! ...It changed again. The gate is a ferry now. Gate Ferry.'),
          L('player', 'That\'s not an airport gate.'),
          L('rutherford', 'It floats. That\'s basically flying, slower.')
        ] }
      ],
      outro: [
        L('rutherford', 'Three gate changes in two minutes. A personal best. My loyalty card has a new stamp. It\'s a ten.'),
        L('player', 'Do you ever want to actually leave?'),
        L('rutherford', 'Once. I\'d like to be airborne once. For the card.')
      ],
      failOn: ['player_dead', 'vehicle_lost:standbycab'], onComplete: { setFlag: 'st_standby_1' } },

    { id: 'st_standby_2', title: 'Final Boarding', strand: 'standby', giver: 'rutherford', marker: 'airport_terminal', requires: ['st_standby_1'], reward: 1700, act: 2,
      intro: [
        L('rutherford', 'Airborne. Just once. There\'s a ramp in the container yard. Over a row of MERCH. It still counts.'),
        L('player', 'In a taxi?'),
        L('rutherford', 'A taxi with air under it is a plane with a meter. Jump it, then take me to Gate Ferry. Final boarding. I can feel it. Now boarding!')
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'taxi', tag: 'flighttaxi', at: { landmark: 'container_yard' } }, text: 'Get in the taxi at the container yard gate' },
        { type: 'stunt', ramp: 'sj_09', vehicle: 'spawned:flighttaxi', minAir: 0.8, text: 'Take off over the containers. Flat out down the lane: airborne counts as a flight' },
        { type: 'deliver_passenger', spawn: { ped: 'rutherford', at: { landmark: 'airport_terminal' }, line: 'Was I in the air? You were in the air. Stamp it anyway.' }, to: { landmark: 'ferry_terminal' }, vehicle: 'any', text: 'Pick up Rutherford at the terminal (any car: he\'s on standby, he\'s flexible) and take him to Gate Ferry at the Ferry to Elsewhere' }
      ],
      outro: [
        L('rutherford', 'Boarded. The ferry hasn\'t left. Neither did the flight. I\'m consistent.'),
        L('player', 'You\'re still not going anywhere.'),
        L('rutherford', 'I\'m going somewhere. Slowly. On standby. Now boarding, Bryce. Now boarding.'),
        L('kip', 'I\'ve been on standby for a salary for six years. Is this paid?')
      ],
      failOn: ['player_dead', 'vehicle_lost:flighttaxi'], onComplete: { setFlags: ['st_standby_2', 'stranger_standby'], subs: 3000 } },

    // ====================================================== Not as Such (uptown) ==
    { id: 'st_apology_1', title: 'Draft One', strand: 'apology', giver: 'cornelius', marker: 'heirloom_club', requires: ['m13_thursday'], reward: 2000, act: 3,
      unlock: { mission: 'm13_thursday', flag: 'survived_thursday' },
      intro: [
        L('cornelius', 'Cornelius Ashby-Ledger, the fourth. One would like to apologise. For anything. The family has never once.'),
        L('player', 'Apologise for what?'),
        L('cornelius', 'One hasn\'t decided. Two hundred years of material. One wrote a draft. The family lawyers have taken it to the shredder. In a sedan.'),
        L('family_counsel', 'Not as such.')
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'sports', tag: 'heirloomcar', at: { landmark: 'heirloom_club' }, color: '#8e6c3a' }, text: 'Take the family car. It\'s older than the city' },
        { type: 'stop_vehicle', spawn: { vehicle: 'sedan', tag: 'lawyercar', at: { landmark: 'heirloom_club' }, color: '#1a1a1a', driven: 'traffic', flee: true }, stopSpeed: 1, hold: 3, maxDist: 2400, text: 'Stop the lawyers\' sedan before it reaches the shredder' },
        { type: 'pickup', spawn: { pickupType: 'mission', count: 1, around: { tag: 'lawyercar' }, radius: 40, label: 'THE APOLOGY (DRAFT)' }, text: 'Take back the draft apology' },
        { type: 'escape_wanted', setWanted: 3, text: 'The family\'s lawyers have friends in the precinct. Lose them' }
      ],
      outro: [
        L('cornelius', 'The draft. It says "sorry" twice. Once is a typo. One would like it under glass.'),
        L('player', 'The Museum of Takes?'),
        L('cornelius', 'Where else does a family keep the one thing it never did?')
      ],
      failOn: ['player_dead', 'target_escaped'], onComplete: { setFlag: 'st_apology_1' } },

    { id: 'st_apology_2', title: 'Under Glass', strand: 'apology', giver: 'cornelius', marker: 'heirloom_club', requires: ['st_apology_1'], reward: 2800, act: 3,
      intro: [
        L('cornelius', 'The museum will exhibit the apology. The family will object. In person. With binders.'),
        L('player', 'And then?'),
        L('cornelius', 'Then one must argue it with Ledger, Ledger and Ledger. Family counsel since the founding. They have never lost. As such.')
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'sedan', tag: 'apologycar', at: { landmark: 'heirloom_club' }, color: '#6e5a44' }, text: 'Get in the car' },
        { type: 'deliver_passenger', spawn: { ped: 'cornelius', at: { landmark: 'heirloom_club' }, line: 'One has never been in the front seat. One is thrilled. Quietly.' }, to: { landmark: 'museum_of_takes' }, vehicle: 'spawned:apologycar', text: 'Drive Cornelius and his apology to the Museum of Takes' },
        { type: 'defeat', spawn: { ped: 'thug', count: 5, around: { landmark: 'museum_of_takes' }, radius: 140 }, text: 'The family objects in the atrium. With binders. Overrule them' },
        { type: 'minigame', game: 'debate', params: { rounds: 3, points: 5, timer: 4, bluff: 0.3, opponent: 'family_counsel' }, text: 'Argue the apology past Ledger, Ledger & Ledger' }
      ],
      outro: [
        L('cornelius', 'Under glass. THE FIRST APOLOGY (ATTRIBUTED). Next to your table.'),
        L('player', 'How does it feel?'),
        L('cornelius', 'One is sorry. One has never felt this. One would like to stop feeling it. Is that also an apology?'),
        L('family_counsel', 'Not as such.')
      ],
      failOn: ['player_dead', 'vehicle_lost:apologycar'], onComplete: { setFlags: ['st_apology_2', 'stranger_apology'], subs: 5000 } }
  ];

  // stamp every stranger mission with what the phone, the replay list and other tracks can filter on
  var STRAND_BY_ID = {}, i;
  for (i = 0; i < STRANDS.length; i++) { STRANDS[i].missions = []; STRAND_BY_ID[STRANDS[i].id] = STRANDS[i]; }
  for (i = 0; i < MISSIONS.length; i++) {
    var m = MISSIONS[i], s = STRAND_BY_ID[m.strand];
    m.side = true; m.kind = 'stranger';
    if (s) { s.missions.push(m.id); m.strandName = s.name; }
  }

  var S = GTP.Content.strangers = { version: 1, cast: CAST, debate: DEBATE, ratio: RATIO, strands: STRANDS, missions: MISSIONS };

  // ================================================================================ registration ==
  // (guarded and idempotent: a second load, or a file that already absorbed these, changes nothing)
  function register() {
    var Ct = GTP.Content, k;
    // the cast: never overwrite an existing id
    Ct.cast = Ct.cast || {};
    for (k in CAST) if (!Ct.cast[k]) Ct.cast[k] = CAST[k];
    if (Ct.opponentIds) for (k in DEBATE) if (Ct.opponentIds.indexOf(k) < 0) Ct.opponentIds.push(k);
    if (Ct.opponentIds) for (k in RATIO) if (Ct.opponentIds.indexOf(k) < 0) Ct.opponentIds.push(k);
    Ct.strangerIds = STRANDS.map(function (st) { return st.giver; });
    // the minigame opponents
    if (Ct.debate && Ct.debate.opponents) for (k in DEBATE) if (!Ct.debate.opponents[k]) Ct.debate.opponents[k] = DEBATE[k];
    if (Ct.ratio && Ct.ratio.opponents) for (k in RATIO) if (!Ct.ratio.opponents[k]) Ct.ratio.opponents[k] = RATIO[k];
    // the missions need no patching: GTP.Missions.allMissions() merges GTP.Content.strangers.missions natively as side missions
    // (never story: Story.order() / next() skip them, no chapters or calls)
  }
  register();

  // ===================================================================================== runtime ==
  function M() { return GTP.Missions; }
  function flags() { var Ms = M(); return Ms && Ms.state && Ms.state.flags ? Ms.state.flags : {}; }
  function completed(id) { var Ms = M(); return !!(Ms && Ms.state && Ms.state.completed && Ms.state.completed.has(id)); }
  function strandOf(missionId) { for (var j = 0; j < MISSIONS.length; j++) if (MISSIONS[j].id === missionId) return MISSIONS[j].strand; return null; }
  function missionsOf(id) { var st = STRAND_BY_ID[id]; if (!st) return []; return st.missions.map(function (mid) { for (var j = 0; j < MISSIONS.length; j++) if (MISSIONS[j].id === mid) return MISSIONS[j]; return null; }).filter(Boolean); }
  function status(id) {
    var st = STRAND_BY_ID[id]; if (!st) return null;
    var ms = missionsOf(id), done = 0, next = null, Ms = M(), active = Ms && Ms.state ? Ms.state.active : null, isActive = false;
    for (var j = 0; j < ms.length; j++) {
      if (completed(ms[j].id)) { done++; continue; }
      if (ms[j].id === active) isActive = true;
      if (!next) {
        var req = ms[j].requires || [], ok = true;
        for (var r = 0; r < req.length; r++) if (!completed(req[r])) { ok = false; break; }
        next = { id: ms[j].id, title: ms[j].title, available: ok };
      }
    }
    var finished = done >= ms.length;
    return { id: id, name: st.name, giver: st.giver, home: st.home, district: st.district, blurb: st.blurb,
      state: finished ? 'done' : isActive ? 'active' : (next && next.available) ? 'available' : 'locked',
      done: done, total: ms.length, next: finished ? null : next, unlock: st.unlock, epilogue: finished ? st.epilogue : null };
  }
  function epilogueFor(id) { var st = status(id); return st && st.state === 'done' ? st.epilogue : null; }

  // the eccentric walks to the car: a passenger / tail objective whose ped is the mission's own giver takes the giver off the kerb
  function dedupeGiver(e) {
    var m = e && e.mission, def = e && e.objective;
    if (!m || m.kind !== 'stranger' || !def || !def.spawn || (def.type !== 'deliver_passenger' && def.type !== 'follow')) return;
    var who = def.spawn.ped; if (!who || (who !== m.giver && who !== 'kip')) return;
    var En = GTP.Entities; if (!En || !En.list) return;
    for (var j = En.list.length - 1; j >= 0; j--) {
      var p = En.list[j];
      if (p.kind !== 'ped' || p.removed || p.castId !== who || p.inVehicle) continue;
      if (p.ai && (p.ai.mission === 'passenger' || p.ai.mission === 'follower')) continue;
      try { if (p.destroy) p.destroy(); En.remove(p); } catch (err) { if (GTP.util && GTP.util.reportError) GTP.util.reportError(err, 'strangers.dedupe'); }
    }
  }
  function onComplete(e) {
    var id = e && e.id, sid = strandOf(id); if (!sid || (e && e.replay)) return;
    var st = STRAND_BY_ID[sid], last = st.missions[st.missions.length - 1];
    if (id !== last) return;
    flags()['stranger_' + sid] = true;
    var line = st.epilogue;
    try {
      if (GTP.UI && typeof GTP.UI.ticker === 'function') GTP.UI.ticker(line);
      if (GTP.UI && typeof GTP.UI.toast === 'function') GTP.UI.toast('STRAND COMPLETE: ' + st.name.toUpperCase());
    } catch (err) { if (GTP.util && GTP.util.reportError) GTP.util.reportError(err, 'strangers.epilogue'); }
    GTP.Events.emit('strangers:epilogue', { id: sid, name: st.name, line: line, giver: st.giver });
  }
  if (GTP.Events && typeof GTP.Events.on === 'function' && !S._hooked) {
    S._hooked = true;
    GTP.Events.on('mission:objective', function (e) { try { dedupeGiver(e); } catch (err) { if (GTP.util && GTP.util.reportError) GTP.util.reportError(err, 'strangers.objective'); } });
    GTP.Events.on('mission:complete', function (e) { try { onComplete(e); } catch (err) { if (GTP.util && GTP.util.reportError) GTP.util.reportError(err, 'strangers.complete'); } });
  }

  // where a strand's light stands: the live mission marker of its next mission (the runtime nudges a light that shares a door
  // with another), else the home door
  function homePoint(st) {
    var Ms = M(), ss = status(st.id), mk = null;
    try { if (ss && ss.next && Ms && Ms.markers) { var all = Ms.markers(); for (var j = 0; j < all.length; j++) if (all[j].kind === 'mission' && all[j].id === ss.next.id) { mk = all[j]; break; } } } catch (e) { mk = null; }
    if (mk) return { x: mk.x, z: mk.z, y: mk.y || 0 };
    var Wd = GTP.World, lm = Wd && Wd.landmark ? Wd.landmark(st.home) : null; if (!lm) return null;
    var d = lm.door || lm;
    return { x: d.x, z: d.z, y: d.y != null ? d.y : 0 };
  }
  function busy() { var Ms = M(); return !!(Ms && Ms.state && Ms.state.active); }
  // the phone row: the strand's name with its eccentric, what is next, and where
  function row(st) {
    var ss = status(st.id), pt = homePoint(st), cast = GTP.Content.cast && GTP.Content.cast[st.giver], lmk = GTP.World && GTP.World.landmark ? GTP.World.landmark(st.home) : null;
    var where = lmk ? (lmk.label || lmk.name || st.home) : st.home;
    var line = ss.state === 'done' ? st.epilogue : ss.state === 'active' ? 'In progress: ' + (ss.next ? ss.next.title : '') : ss.state === 'available' ? (ss.done ? 'Next: ' : '') + (ss.next ? ss.next.title : '') + '  ·  ' + where + '  ·  ' + ss.done + '/' + ss.total : st.blurb;
    var live = ss.state === 'available';   // no GPS target for a strand that is running, finished or locked
    return { id: st.id, strand: st.id, title: st.name, name: st.name, giver: st.giver, castName: cast ? cast.name : null, status: ss.state, line: line,
      x: live && pt ? pt.x : null, z: live && pt ? pt.z : null, missionId: ss.next ? ss.next.id : null, done: ss.done, total: ss.total };
  }

  GTP.Strangers = {
    // the UI's alternative stranger paths stay empty: the missions runtime already shows these lights and rows
    list: function () { return []; },
    markers: function () { return []; },
    strandRows: function () { return STRANDS.map(row); },
    blips: function () {
      if (busy()) return [];
      var out = [];
      for (var j = 0; j < STRANDS.length; j++) {
        var st = STRANDS[j], ss = status(st.id); if (ss.state !== 'available') continue;
        var pt = homePoint(st); if (!pt) continue;
        out.push({ id: st.id, strand: st.id, x: pt.x, z: pt.z, y: pt.y, title: '? ' + st.name, giver: st.giver, missionId: ss.next.id });
      }
      return out;
    },
    strands: function () { return STRANDS.slice(); },
    strand: function (id) { return STRAND_BY_ID[id] || null; },
    missions: missionsOf,
    status: status,
    summary: function () { return STRANDS.map(function (st) { return status(st.id); }); },
    homes: function () {
      var Wd = GTP.World, out = [];
      for (var j = 0; j < STRANDS.length; j++) {
        var st = STRANDS[j], lm = Wd && Wd.landmark ? Wd.landmark(st.home) : null, d = lm ? (lm.door || lm) : null, ss = status(st.id);
        var cast = GTP.Content.cast && GTP.Content.cast[st.giver];
        out.push({ id: st.id, strand: st.name, name: cast ? cast.name : st.giver, giver: st.giver, landmark: st.home, x: d ? d.x : null, z: d ? d.z : null, state: ss.state, color: cast ? cast.color : '#ffffff' });
      }
      return out;
    },
    epilogue: epilogueFor,
    strandOf: strandOf,
    flagged: function (id) { return !!flags()['stranger_' + id]; }
  };
})();
