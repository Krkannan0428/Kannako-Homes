/* Grand Theft Pundit: 22_content_missions.js
 * GTP.Content.missions: the seventeen missions of the campaign, transcribed from
 * GDD.md section 6 into the mission schema of ARCHITECTURE.md section 3
 * (GTP.Missions). Pure data plus tiny helpers. Loads standalone: it only needs
 * window.
 *
 * Schema (one entry):
 *   id, title, giver (cast id), marker (landmark id), requires [mission ids],
 *   reward (number, dollars), intro [{who, text}], objectives [...], outro
 *   [{who, text, ticker?}], failOn [...], onComplete {...}
 * Objective types are the twelve engine types: goto drive_to enter_vehicle
 * pickup follow escape_wanted survive destroy defeat dialogue minigame
 * timer_wrap. Targets are {landmark} door points. A `ticker:true` dialogue
 * line is shown on the news ticker instead of the dialogue box.
 *
 * Also here: GTP.Content.debate (opponents and their point cards),
 * GTP.Content.debateCounters (the player's counter lines), GTP.Content.ratio
 * (ratio-war opponents) and GTP.Content.ratioPlayerPosts, all consumed by
 * GTP.UI.minigames per GDD section 7. Every character is an invented parody
 * archetype; see CONTENT_RULES.md.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.Content = GTP.Content || {};

  GTP.Content.missions = [

    // ------------------------------------------------------------ Act I --
    {
      id: 'm00_intro', title: 'Table Stakes',
      giver: 'gus', marker: 'campus_quad', requires: [], reward: 100,
      intro: [
        { who: 'gus', text: 'Table\'s in 4B. Legs, top, sign. Three trips. I\'m not carrying, I\'m levels.' },
        { who: 'player', text: 'Respectfully, Gus, a journalist doesn\'t carry furniture.' },
        { who: 'gus', text: 'You\'re not a journalist. You\'re peaking.' },
        { who: 'roz', text: 'WE\'RE NOT HERE TO RECRUIT YOU. Sign this. It\'s about cheese.' },
        { who: 'player', text: 'What about cheese?' },
        { who: 'roz', text: 'We\'ll know when we get there.' }
      ],
      objectives: [
        { type: 'goto', target: { landmark: 'dorm_studio' }, radius: 48, text: 'Get to Dorm 4B' },
        { type: 'pickup', spawn: { pickupType: 'mission', count: 3, around: { landmark: 'dorm_studio' }, radius: 160 }, text: 'Grab the table legs, top and sign' },
        { type: 'goto', target: { landmark: 'campus_quad' }, radius: 48, text: 'Set up on the Quad' },
        { type: 'minigame', game: 'debate', params: { rounds: 1, points: 4, timer: 6, bluff: 0, opponent: 'freshman' }, text: 'Win your first debate' }
      ],
      outro: [
        { who: 'player', text: 'Minds changed?' },
        { who: 'gus', text: 'Zero. Crowd was loud, though. That counts here.' },
        { who: 'kip', text: 'Hi. I\'m Kip. Is this paid?' }
      ],
      failOn: ['player_dead'],
      onComplete: { setFlag: 'has_table' }
    },

    {
      id: 'm01_van', title: 'Loud & Correct',
      giver: 'sloane', marker: 'pod_garage', requires: ['m00_intro'], reward: 200,
      intro: [
        { who: 'sloane', text: 'Bryce Takesworth. You\'re pre-viral. Four minutes. Three.' },
        { who: 'player', text: 'Who are you?' },
        { who: 'sloane', text: 'Your producer. The van\'s yours. Your face is on it. Your face is on it twice.' },
        { who: 'gus', text: 'The battery lasts ninety seconds. I didn\'t fix it. I\'m sound.' }
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'van', tag: 'podvan', at: { landmark: 'pod_garage' } }, text: 'Get in the pod van' },
        { type: 'timer_wrap', seconds: 90, objectives: [
          { type: 'pickup', spawn: { pickupType: 'mission', count: 6, around: { landmark: 'campus_quad' }, radius: 400 }, text: 'Collect 6 subscribers before the battery dies' }
        ] },
        { type: 'drive_to', target: { landmark: 'pod_garage' }, vehicle: 'spawned:podvan', text: 'Bring the van back to Gus' }
      ],
      outro: [
        { who: 'sloane', text: 'Six subscribers. Five of them are the same guy. Doesn\'t matter, it\'s a number.' },
        { who: 'player', text: 'Respectfully, it\'s six numbers.' },
        { who: 'sloane', text: 'Two minutes. One. We have a sponsor.' }
      ],
      failOn: ['player_dead', 'vehicle_lost:podvan'],
      onComplete: { setFlag: 'has_van' }
    },

    {
      id: 'm02_read', title: 'Read the Read',
      giver: 'firmness', marker: 'nap_depot', requires: ['m01_van'], reward: 500,
      intro: [
        { who: 'firmness', text: 'Dale Firmness, Nap Dynasty. Congratulations on the van, code TAKES20.' },
        { who: 'player', text: 'Thank you, I...' },
        { who: 'firmness', text: 'Read the copy while you drive. When the copy ends, the code expires. The code is the deadline.' },
        { who: 'kip', text: 'I\'ll hold the mattress. Is this paid?' },
        { who: 'firmness', text: 'Sorry, Kip, code NOPE.' }
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'truck', tag: 'mattress', at: { landmark: 'nap_depot' } }, text: 'Get in the Nap Dynasty demo truck' },
        { type: 'timer_wrap', seconds: 120, objectives: [
          { type: 'drive_to', target: { landmark: 'green_room' }, vehicle: 'spawned:mattress', text: 'Deliver the mattress before code TAKES20 expires' }
        ] },
        { type: 'dialogue', lines: [
          { who: 'firmness', text: 'Delivered at firmness level nine. The copy said seven. We will say nine.' },
          { who: 'kip', text: 'I read the whole copy. It ends "Respectfuly." One L.' }
        ] }
      ],
      outro: [
        { who: 'firmness', text: 'Welcome to the family. The family is a mattress. Code TAKES20.' },
        { who: 'player', text: 'As a journalist, I feel I should disclose this.' },
        { who: 'firmness', text: 'Disclose it in the read.' }
      ],
      failOn: ['player_dead', 'vehicle_lost:mattress'],
      onComplete: { setFlag: 'sponsored' }
    },

    {
      id: 'm03_ratio', title: 'Didn\'t Read, Replied Anyway',
      giver: 'sloane', marker: 'impression_alley', requires: ['m02_read'], reward: 300,
      intro: [
        { who: 'dunk', text: 'Didn\'t read. Replied anyway. You\'re on the billboard, man. Both billboards.' },
        { who: 'player', text: 'Respectfully, Ptolemy, that\'s defamation.' },
        { who: 'dunk', text: 'Didn\'t read that either.' },
        { who: 'sloane', text: 'Ratio him. Ninety seconds. Then run; his chat has a group rate on bus fare.' }
      ],
      objectives: [
        { type: 'minigame', game: 'ratio', params: { posts: 5, speed: 1, opponent: 'dunk' }, text: 'Win the ratio war' },
        { type: 'defeat', spawn: { ped: 'thug', count: 4, around: { landmark: 'impression_alley' }, radius: 150 }, text: 'Dunk\'s chat has arrived. Clear the Alley' }
      ],
      outro: [
        { who: 'sloane', text: 'You won. Four people showed up to punch you, which is reach.' },
        { who: 'player', text: 'That\'s not reach.' },
        { who: 'sloane', text: 'It\'s a megaphone. It pushes people. Use it on the ones who like you too.' }
      ],
      failOn: ['player_dead'],
      onComplete: { unlockWeapon: 'megaphone' }
    },

    {
      id: 'm04_hit', title: 'Four Minutes',
      giver: 'chyron', marker: 'green_room', requires: ['m03_ratio'], reward: 800,
      intro: [
        { who: 'chyron', text: 'BREAKING. Kid. Table. Four minutes. Tonight.' },
        { who: 'player', text: 'Four minutes? On television?' },
        { who: 'chyron', text: 'Four minutes. Of waiting. Then more waiting. Then a car. WE\'LL HAVE TO LEAVE IT THERE.' }
      ],
      objectives: [
        { type: 'dialogue', lines: [
          { who: 'player', text: 'Hour one. The bagels are sponsored.' },
          { who: 'player', text: 'Hour two. Someone is yelling in the next room. It is the room.' },
          { who: 'player', text: 'Hour three. Kip has fallen asleep standing up.' },
          { who: 'sloane', text: 'They want you now. Sixty seconds. Take anything with wheels.' }
        ] },
        { type: 'timer_wrap', seconds: 60, objectives: [
          { type: 'drive_to', target: { landmark: 'tyn_tower' }, vehicle: 'any', text: 'Get to The Yell Network in 60 seconds' },
          { type: 'goto', target: { landmark: 'tyn_tower' }, radius: 40, text: 'Run to the studio floor' }
        ] },
        { type: 'minigame', game: 'debate', params: { rounds: 2, points: 5, timer: 5, bluff: 0, opponent: 'chyron' }, text: 'Survive the hit' }
      ],
      outro: [
        { who: 'chyron', text: 'BREAKING. Me. Talking. Great hit, kid. Ninety seconds. WE\'LL HAVE TO LEAVE IT THERE.' },
        { who: 'player', text: 'You said four minutes.' },
        { who: 'chyron', text: 'Four minutes of me. You were the lower-third.' }
      ],
      failOn: ['player_dead'],
      onComplete: { setFlag: 'a_voice' }
    },

    // ----------------------------------------------------------- Act II --
    {
      id: 'm05_peer', title: 'Peer Reviewed',
      giver: 'vaultwright', marker: 'fulcrum', requires: ['m04_hit'], reward: 1000,
      intro: [
        { who: 'vaultwright', text: 'Mr. Takesworth. I fund both candidates. I\'d like to know which one I\'m winning with.' },
        { who: 'player', text: 'Why me?' },
        { who: 'vaultwright', text: 'You\'re cheaper than a satellite and louder. Follow Dr. Footnote. Don\'t be seen. She bills by the glance.' },
        { who: 'footnote', text: '[citation pending] Who said that?' }
      ],
      objectives: [
        { type: 'follow', spawn: { ped: 'footnote', at: { landmark: 'fulcrum' }, path: [{ landmark: 'char_charter' }, { landmark: 'capitol_dome' }, { landmark: 'fulcrum' }] }, maxDist: 300, text: 'Tail Dr. Footnote around Lobby Row' },
        { type: 'pickup', spawn: { pickupType: 'mission', count: 5, around: { landmark: 'fulcrum' }, radius: 250 }, text: 'Collect 5 independent studies' },
        { type: 'survive', seconds: 45, waves: { thug: 6 }, text: 'Hold the lobby against the rival interns' }
      ],
      outro: [
        { who: 'vaultwright', text: 'Both candidates bought it. The same paper. I\'m whispering twelve thousand because it\'s rude to say it aloud.' },
        { who: 'vaultwright', text: 'Also, I\'ve sold your contract to the President. You\'ll like him. He rates things.' },
        { who: 'player', text: 'You sold my... Respectfully, that\'s my show.' },
        { who: 'vaultwright', text: 'It was. Here\'s a pistol. For the hedge.' }
      ],
      failOn: ['player_dead'],
      onComplete: { unlockWeapon: 'pistol', setFlag: 'contract_sold' }
    },

    {
      id: 'm06_rally', title: 'Hold the Table',
      giver: 'goldplate', marker: 'stadium', requires: ['m05_peer'], reward: 1500,
      intro: [
        { who: 'goldplate', text: 'Takesworth. Great kid. Rate him an eight. The rally\'s a ten. The stadium\'s a ten, both words.' },
        { who: 'player', text: 'What do you want me to say, sir?' },
        { who: 'goldplate', text: 'Whatever the memo says. Loudly. Then there\'s three vans filming the seats. The seats are a two. The vans are a one.' },
        { who: 'sloane', text: 'Sixty seconds on stage. Then the vans. Then we run, because he won\'t take your call.' }
      ],
      objectives: [
        { type: 'goto', target: { landmark: 'stadium' }, radius: 48, text: 'Get to the rally stage' },
        { type: 'survive', seconds: 60, waves: { protester: 8, thug: 4 }, text: 'Hold the stage for 60 s' },
        { type: 'destroy', spawn: { vehicle: 'van', count: 3, tag: 'newsvans', around: { landmark: 'stadium' }, radius: 260 }, text: 'Wreck the three TYN vans filming the empty seats' },
        { type: 'escape_wanted', setWanted: 2, text: 'Lose the cops' }
      ],
      outro: [
        { who: 'goldplate', text: 'Ten out of ten. Big crowd, the biggest, I counted the vans. Show\'s renamed. The Goldplate Hour with Goldplate.' },
        { who: 'player', text: 'Respectfully, it\'s called Loud & Correct.' },
        { who: 'goldplate', text: 'You\'re the guest. Guests are a seven.' }
      ],
      failOn: ['player_dead'],
      onComplete: { setFlag: 'show_renamed' }
    },

    {
      id: 'm07_listen', title: 'Listening Session',
      giver: 'velvetine', marker: 'listening_room', requires: ['m06_rally'], reward: 1200,
      intro: [
        { who: 'velvetine', text: 'To the van! To the crates! To whatever this is!' },
        { who: 'player', text: 'What\'s in the crates?' },
        { who: 'velvetine', text: 'Merch. Mixtapes. Mystery. To mystery! Warehouse 42, before the inspectors rate it a zero.' },
        { who: 'kip', text: 'I\'ll ride along. I\'m not supposed to be here. Is this paid?' }
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'van', tag: 'merch', at: { landmark: 'warehouse_42' } }, text: 'Get in the merch van at Warehouse 42' },
        { type: 'pickup', spawn: { pickupType: 'mission', count: 5, around: { landmark: 'warehouse_42' }, radius: 220 }, text: 'Load 5 crates of merch' },
        { type: 'drive_to', target: { landmark: 'velvetine_pier' }, vehicle: 'spawned:merch', text: 'Deliver the crates to the Listening Pier' },
        { type: 'dialogue', lines: [
          { who: 'velvetine', text: 'To the crates! Nobody open them. To not opening them!' },
          { who: 'player', text: 'Is the music starting?' },
          { who: 'velvetine', text: 'The music is the listening. Honk if you feel it.' }
        ] }
      ],
      outro: [
        { who: 'chyron', text: 'BREAKING. Warehouse 42 crates stolen by campus pundit, sources say. The source is a Baron.', ticker: true },
        { who: 'velvetine', text: 'To plausible deniability! To you, specifically!' },
        { who: 'player', text: 'Respectfully, you hired me.' },
        { who: 'velvetine', text: 'To hiring!' }
      ],
      failOn: ['player_dead', 'vehicle_lost:merch'],
      onComplete: { setFlag: 'theft_pinned' }
    },

    {
      id: 'm08_scooters', title: 'Defense Scooters',
      giver: 'warbanner', marker: 'bravadia_embassy', requires: ['m07_listen'], reward: 1500,
      intro: [
        { who: 'warbanner', text: 'Mr. Takesworth. Bravadia welcomes you. Volume is policy, and that\'s why we need the jets.' },
        { who: 'player', text: 'I thought this was a tourism ad.' },
        { who: 'warbanner', text: 'It is. Tourism arrives by scooter. Demonstrate the scooter. Four checkpoints. The jets will fly over. Probably. And that\'s why we need the jets.' },
        { who: 'sloane', text: 'Ninety seconds, four stops, don\'t crash the product. The product is the segment.' }
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'bike', tag: 'scooter', at: { landmark: 'bravadia_embassy' } }, text: 'Mount the Defense Scooter' },
        { type: 'timer_wrap', seconds: 90, objectives: [
          { type: 'drive_to', target: { landmark: 'capitol_dome' }, vehicle: 'spawned:scooter', text: 'Checkpoint 1: the Capitol' },
          { type: 'drive_to', target: { landmark: 'goldplate_tower' }, vehicle: 'spawned:scooter', text: 'Checkpoint 2: Goldplate Tower' },
          { type: 'drive_to', target: { landmark: 'velvetine_pier' }, vehicle: 'spawned:scooter', text: 'Checkpoint 3: the Listening Pier' },
          { type: 'drive_to', target: { landmark: 'bravadia_embassy' }, vehicle: 'spawned:scooter', text: 'Checkpoint 4: back to the embassy' }
        ] }
      ],
      outro: [
        { who: 'warbanner', text: 'A triumph. The President ordered two hundred. The Baron ordered two hundred. And that\'s why we need the jets.' },
        { who: 'player', text: 'They\'re at war with each other.' },
        { who: 'warbanner', text: 'Scooters for both sides, that\'s defense. The invoice is addressed to your show. Condolences, and that\'s why we need the jets.' },
        { who: 'kip', text: 'I read the invoice. It ends \'Respectfuly.\' Same one L.' }
      ],
      failOn: ['player_dead', 'vehicle_lost:scooter'],
      onComplete: { setFlag: 'scooters_billed' }
    },

    {
      id: 'm09_balloon', title: 'Weather Balloon Repair',
      giver: 'redacted', marker: 'ova_hq', requires: ['m08_scooters'], reward: 2000,
      intro: [
        { who: 'redacted', text: 'You\'re an asset now. Don\'t write that down. Meet the courier at the [REDACTED].' },
        { who: 'player', text: 'Which [REDACTED]?' },
        { who: 'redacted', text: 'The plaza. Then the bridge. Don\'t get closer than you\'d like. Take the [REDACTED] from the [REDACTED] and leave before the balloons see you.' },
        { who: 'player', text: 'Weather balloons?' },
        { who: 'redacted', text: 'They have sirens.' }
      ],
      objectives: [
        { type: 'follow', spawn: { ped: 'courier', at: { landmark: 'ova_hq' }, path: [{ landmark: 'protest_plaza' }, { landmark: 'char_charter' }, { landmark: 'bridge_main' }] }, maxDist: 350, text: 'Tail the courier to the dead drop' },
        { type: 'pickup', spawn: { pickupType: 'mission', count: 1, around: { landmark: 'bridge_main' }, radius: 60 }, text: 'Lift the Monday Memo from under the bridge' },
        { type: 'escape_wanted', setWanted: 3, text: 'The weather balloons have noticed. Lose them' }
      ],
      outro: [
        { who: 'redacted', text: 'Good. The [REDACTED] is now [REDACTED]. When it leaks, it leaks from you. That\'s what an asset is for.' },
        { who: 'player', text: 'The memo just says mattress, jets, pellets, rate it a ten.' },
        { who: 'redacted', text: 'That\'s the [REDACTED]. Here\'s a hottake. It\'s a [REDACTED] that goes off.' }
      ],
      failOn: ['player_dead'],
      onComplete: { unlockWeapon: 'hottake', setFlag: 'has_memo' }
    },

    {
      id: 'm10_pellets', title: 'Your Doctor Won\'t Tell You',
      giver: 'saffron', marker: 'clarity_barn', requires: ['m09_balloon'], reward: 1800,
      intro: [
        { who: 'saffron', text: 'Bryce. Your aura is loud. Clarity Pellets fix that, and your doctor won\'t tell you that.' },
        { who: 'player', text: 'What\'s in them?' },
        { who: 'saffron', text: 'Clarity. And the barn, eventually. Take the SUV to the HOA Hall. The board approved it in spirit.' },
        { who: 'kip', text: 'The HOA has its own helicopter. It\'s a drone. It\'s a kite. Is this paid?' }
      ],
      objectives: [
        { type: 'enter_vehicle', spawn: { type: 'suv', tag: 'pellets', at: { landmark: 'clarity_barn' } }, text: 'Get in the pellet SUV' },
        { type: 'drive_to', target: { landmark: 'hoa_hall' }, vehicle: 'spawned:pellets', text: 'Deliver the pellets to the HOA Hall' },
        { type: 'destroy', spawn: { vehicle: 'suv', count: 2, tag: 'hoa', around: { landmark: 'hoa_hall' }, radius: 240 }, text: 'Two HOA patrol SUVs want your paperwork. Wreck them' },
        { type: 'escape_wanted', setWanted: 3, text: 'The HOA has called its liaison. Lose the cops' }
      ],
      outro: [
        { who: 'saffron', text: 'The board is cleansed. Toxic, now clean. The pellets did that, and the SUV, and your doctor won\'t tell you that.' },
        { who: 'player', text: 'Respectfully, two of their cars are on fire.' },
        { who: 'saffron', text: 'Fire is clean.' }
      ],
      failOn: ['player_dead', 'vehicle_lost:pellets'],
      onComplete: { setFlag: 'hoa_enemy' }
    },

    {
      id: 'm11_trustless', title: 'Trustless',
      giver: 'moonsworth', marker: 'moon_mine', requires: ['m10_pellets'], reward: 2500,
      intro: [
        { who: 'moonsworth', text: 'Bryce. Trustless. Love it. $PUNDIT launches in two minutes and the chain is in eight boxes around the neighborhood.' },
        { who: 'player', text: 'Why is the chain in boxes?' },
        { who: 'moonsworth', text: 'Decentralized. Grab them. I\'ll hold your coins. Trustlessly. That means trust me.' },
        { who: 'gus', text: 'Don\'t. He\'s peaking.' }
      ],
      objectives: [
        { type: 'timer_wrap', seconds: 120, objectives: [
          { type: 'pickup', spawn: { pickupType: 'mission', count: 8, around: { landmark: 'moon_mine' }, radius: 500 }, text: 'Collect 8 GPUs to secure the chain' }
        ] },
        { type: 'dialogue', lines: [
          { who: 'moonsworth', text: 'Chain secured. Your coins are in my car. My car is leaving. That is the roadmap.' },
          { who: 'player', text: 'Respectfully, that\'s theft.' },
          { who: 'moonsworth', text: 'It\'s liquidity.' }
        ] },
        { type: 'destroy', spawn: { vehicle: 'sports', count: 1, tag: 'kyler', around: { landmark: 'moon_mine' }, radius: 200 }, text: 'Total Kyler\'s car. Your coins are inside' }
      ],
      outro: [
        { who: 'moonsworth', text: 'The car was the cold wallet. You\'ve burned the supply. Which is... bullish, actually.' },
        { who: 'player', text: 'I have no coins.' },
        { who: 'moonsworth', text: 'Nobody does. That\'s the scarcity. Keep the SMG, it was a sponsorship.' }
      ],
      failOn: ['player_dead'],
      onComplete: { unlockWeapon: 'smg', setFlag: 'rugged' }
    },

    // ---------------------------------------------------------- Act III --
    {
      id: 'm12_memo', title: 'The Monday Memo',
      giver: 'gus', marker: 'pod_garage', requires: ['m11_trustless'], reward: 0,
      intro: [
        { who: 'gus', text: 'The typo. One L. It\'s on the mattress copy, the invoice, the memo. And on your top comment from last night.' },
        { who: 'roz', text: 'WE\'RE NOT HERE TO HELP YOU. The memo is your comment section. Someone\'s selling your chat to the government.' },
        { who: 'player', text: 'Respectfully, which government?' },
        { who: 'roz', text: 'All of them. It\'s a subscription.' },
        { who: 'gus', text: 'Go to the balloon office. Find the floor where they make it. You\'re peaking.' }
      ],
      objectives: [
        { type: 'drive_to', target: { landmark: 'ova_hq' }, vehicle: 'any', text: 'Get to the Office of Vibes Assessment' },
        { type: 'defeat', spawn: { ped: 'thug', count: 6, around: { landmark: 'ova_hq' }, radius: 160 }, text: 'Clear the lobby of agents in balloon-repair coveralls' },
        { type: 'pickup', spawn: { pickupType: 'mission', count: 1, around: { landmark: 'ova_hq' }, radius: 80 }, text: 'Take the subscriber ledger' },
        { type: 'escape_wanted', setWanted: 4, text: 'Every balloon in the city is up. Lose them' },
        { type: 'goto', target: { landmark: 'pod_garage' }, radius: 48, text: 'Get the ledger back to Gus' }
      ],
      outro: [
        { who: 'redacted', text: 'There\'s no floor. There\'s no [REDACTED]. We scrape your [REDACTED] and sell it back as [REDACTED]. Everyone subscribes. [REDACTED].' },
        { who: 'gus', text: 'It\'s a subscriber list. Goldplate, Warbanner, the Baron, Fulcrum, TYN, Dunk. The HOA. They all read your comments.' },
        { who: 'player', text: 'So who\'s in charge?' },
        { who: 'gus', text: 'Nobody. Everyone subscribed. Last line of the memo: \'Takesworth is ready for primetime.\'' }
      ],
      failOn: ['player_dead'],
      onComplete: { setFlag: 'knows_memo' }
    },

    {
      id: 'm13_thursday', title: 'Everybody\'s Thursday',
      giver: 'kip', marker: 'dorm_studio', requires: ['m12_memo'], reward: 4000,
      intro: [
        { who: 'kip', text: 'I wrote it. The scraper. During the unpaid week. Nobody else reads email, so I formatted the comments into a memo and everyone subscribed.' },
        { who: 'player', text: 'You\'ve been running the city.' },
        { who: 'kip', text: 'Nobody runs it. I hit \'send.\' The calendar says Thursday: Dunk destroys Takesworth. It\'s Thursday.' },
        { who: 'sloane', text: 'Everyone\'s coming. Goons, interns, scooters, the HOA. Ninety seconds on the Quad, then lose all of them. All five stars. Go.' },
        { who: 'kip', text: 'Is this paid?' }
      ],
      objectives: [
        { type: 'goto', target: { landmark: 'campus_quad' }, radius: 48, text: 'Get to the table' },
        { type: 'survive', seconds: 90, waves: { thug: 12, protester: 4, cop: 4 }, text: 'Hold the table. Everybody is coming' },
        { type: 'escape_wanted', setWanted: 5, text: 'Lose the entire police department' },
        { type: 'goto', target: { landmark: 'pod_garage' }, radius: 48, text: 'Get back to the garage' }
      ],
      outro: [
        { who: 'dunk', text: 'Didn\'t destroy you. Didn\'t read the calendar. Replied anyway.' },
        { who: 'player', text: 'Respectfully, Ptolemy, you\'re on the list too.' },
        { who: 'dunk', text: 'Everyone\'s on the list. That\'s what a list is.' },
        { who: 'sloane', text: 'Chyron wants a panel. Tonight. Five guests. One memo. Two minutes. One.' }
      ],
      failOn: ['player_dead'],
      onComplete: { setFlag: 'survived_thursday' }
    },

    {
      id: 'm14_grift', title: 'Same Grift, Different Lanyard',
      giver: 'sloane', marker: 'tyn_tower', requires: ['m13_thursday'], reward: 3000,
      intro: [
        { who: 'chyron', text: 'BREAKING. Panel. Five guests. One kid. Tonight. WE\'LL HAVE TO LEAVE IT THERE, but not yet.' },
        { who: 'goldplate', text: 'Mattress. Jets. Pellets. I rate it a ten.' },
        { who: 'warbanner', text: 'Mattress. Jets. Pellets. And that\'s why we need the jets.' },
        { who: 'footnote', text: 'Mattress. Jets. Pellets. [citation pending]' },
        { who: 'dunk', text: 'Didn\'t read it. Mattress. Jets. Pellets.' },
        { who: 'player', text: 'Respectfully, you\'re all reading my comments.' }
      ],
      objectives: [
        { type: 'minigame', game: 'debate', params: { rounds: 5, points: 5, timer: 3, bluff: 0.4, opponent: 'panel' }, text: 'Beat five identical answers' },
        { type: 'dialogue', lines: [
          { who: 'redacted', text: '[REDACTED].' },
          { who: 'sloane', text: 'That means they want the ledger back. Out the loading dock. Two minutes. Go.' }
        ] },
        { type: 'timer_wrap', seconds: 150, objectives: [
          { type: 'escape_wanted', setWanted: 5, text: 'Lose five stars before the next segment' }
        ] }
      ],
      outro: [
        { who: 'chyron', text: 'BREAKING. Kid wins. Memo says he\'s ready for primetime. The chair is yours. Forever. WE\'LL HAVE TO LEAVE IT THERE.' },
        { who: 'gus', text: 'Or you read the memo on air and go back to the table. Eleven people will stay. I counted.' },
        { who: 'player', text: 'Respectfully... I need a minute.' },
        { who: 'sloane', text: 'You have two. One.' }
      ],
      failOn: ['player_dead'],
      onComplete: { setFlag: 'offered_chair' }
    },

    // ---------------------------------------------------------- Endings --
    {
      id: 'm15a_primetime', title: 'Ending A: Primetime',
      giver: 'chyron', marker: 'tyn_tower', requires: ['m14_grift'], reward: 10000,
      intro: [
        { who: 'chyron', text: 'BREAKING. Primetime. You. Five sponsors. Three minutes. Read them all. Then beat the old you; he\'s trending.' },
        { who: 'player', text: 'As a journalist...' },
        { who: 'chyron', text: 'You\'re an anchor now. Anchors don\'t finish. WE\'LL HAVE TO LEAVE IT THERE.' },
        { who: 'firmness', text: 'Congratulations, code CHAIR20.' }
      ],
      objectives: [
        { type: 'timer_wrap', seconds: 180, objectives: [
          { type: 'drive_to', target: { landmark: 'nap_depot' }, vehicle: 'any', text: 'Sponsor read 1: Nap Dynasty' },
          { type: 'drive_to', target: { landmark: 'clarity_barn' }, vehicle: 'any', text: 'Sponsor read 2: Clarity Pellets' },
          { type: 'drive_to', target: { landmark: 'moon_mine' }, vehicle: 'any', text: 'Sponsor read 3: $PUNDIT' },
          { type: 'drive_to', target: { landmark: 'velvetine_pier' }, vehicle: 'any', text: 'Sponsor read 4: Velvetine Records' },
          { type: 'drive_to', target: { landmark: 'goldplate_tower' }, vehicle: 'any', text: 'Sponsor read 5: Goldplate Tower, by Goldplate' }
        ] },
        { type: 'goto', target: { landmark: 'goldplate_tower' }, radius: 40, text: 'Take the chair on the roof' },
        { type: 'minigame', game: 'ratio', params: { posts: 8, speed: 2, opponent: 'takesworth_archive' }, text: 'Beat your own archive' }
      ],
      outro: [
        { who: 'goldplate', text: 'Gold table. Ten out of ten. I\'m naming it after me.' },
        { who: 'player', text: 'What do I believe?' },
        { who: 'chyron', text: 'Whatever\'s next. BREAKING. Forever. WE\'LL HAVE TO LEAVE IT THERE.' },
        { who: 'kip', text: 'Is this paid?' }
      ],
      failOn: ['player_dead'],
      onComplete: { setFlag: 'ending_primetime' }
    },

    {
      id: 'm15b_liveread', title: 'Ending B: Live Read',
      giver: 'gus', marker: 'dorm_studio', requires: ['m14_grift'], reward: 11,
      intro: [
        { who: 'gus', text: 'You\'re booked under an alias. Respectfully Anonymous. Ninety seconds to the tower.' },
        { who: 'sloane', text: 'Lobby\'s full of balloon repairmen. Then you read the whole memo. On air. Including the last line.' },
        { who: 'player', text: 'And after?' },
        { who: 'gus', text: 'You walk back. No van. Eleven people. You\'re not peaking. For once.' }
      ],
      objectives: [
        { type: 'timer_wrap', seconds: 90, objectives: [
          { type: 'drive_to', target: { landmark: 'tyn_tower' }, vehicle: 'any', text: 'Get to The Yell Network in 90 seconds' }
        ] },
        { type: 'defeat', spawn: { ped: 'thug', count: 5, around: { landmark: 'tyn_tower' }, radius: 140 }, text: 'Get through the OVA agents in the lobby' },
        { type: 'minigame', game: 'ratio', params: { posts: 8, speed: 2, opponent: 'everyone' }, text: 'Read the Monday Memo live while the ratio explodes' },
        { type: 'goto', target: { landmark: 'campus_quad' }, radius: 48, text: 'Walk back to the Quad' }
      ],
      outro: [
        { who: 'chyron', text: 'BREAKING. We... are not going to leave it there. Keep reading, kid.' },
        { who: 'dunk', text: 'Read it. All of it. Replying anyway: same sign, next table.' },
        { who: 'player', text: 'I don\'t know. Let\'s talk.' },
        { who: 'kip', text: 'Eleven people. Is this paid?' }
      ],
      failOn: ['player_dead'],
      onComplete: { setFlag: 'ending_grass' }
    }
  ];

  // Tiny helper: id -> mission. Rebuilt here so it is correct even if the
  // array is edited at runtime by a debug tool.
  GTP.Content.missionById = function (id) {
    var list = GTP.Content.missions;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  // Mission ids whose completion rolls the credits (either ending).
  GTP.Content.endingMissions = ['m15a_primetime', 'm15b_liveread'];

  // ======================================================= Debate minigame ==
  // Opponent cards: the opponent plays one card at a time (FACT, FEELING,
  // GOTCHA, ANECDOTE); the player counters (SOURCE? beats FACT, LOUDER beats
  // FEELING, PIVOT beats GOTCHA, DEFINE TERMS beats ANECDOTE). `text` is the
  // caption shown on the strip at the bottom of the screen. `who` (panel only)
  // is the cast id of the panelist currently reading the memo, for the UI.
  // `winLine` is said when the opponent wins the match, `loseLine` when the
  // player does. All picks go through GTP.rng in the UI.
  GTP.Content.debate = {
    opponents: {

      freshman: {
        name: 'Wendell Syllabus', castId: 'freshman',
        cards: [
          { card: 'FACT', text: 'Page forty-one says the opposite of what you just said.' },
          { card: 'FEELING', text: 'I just feel like we should read the thing before we yell about it.' },
          { card: 'GOTCHA', text: 'You cited chapter three. The book has two chapters.' },
          { card: 'ANECDOTE', text: 'My roommate did the reading too. We both cried.' },
          { card: 'FACT', text: 'The syllabus is public. I checked. Twice.' },
          { card: 'FEELING', text: 'This is making me feel like the reading didn\'t matter.' },
          { card: 'GOTCHA', text: 'You said "as a journalist." You\'re in my seminar.' },
          { card: 'ANECDOTE', text: 'One time I raised my hand and the professor said "yes." Best day.' },
          { card: 'FACT', text: 'There are forty footnotes. I read the footnotes.' },
          { card: 'FEELING', text: 'I feel seen. Not by you. By the book.' },
          { card: 'GOTCHA', text: 'Your sign says you\'ll answer something else. You just did.' },
          { card: 'ANECDOTE', text: 'I brought a highlighter to a volume contest. Lesson learned.' }
        ],
        winLine: 'I did the reading. It helped. I\'m as surprised as you.',
        loseLine: 'I did the reading. It didn\'t help. Minds changed: zero.'
      },

      chyron: {
        name: 'Brock Chyron', castId: 'chyron',
        cards: [
          { card: 'FACT', text: 'BREAKING. Numbers. Mine.' },
          { card: 'FEELING', text: 'The mood in this studio is that I\'m right. BREAKING.' },
          { card: 'GOTCHA', text: 'So you admit it. BREAKING.' },
          { card: 'ANECDOTE', text: 'I interrupted my own vows for a developing story. It was me.' },
          { card: 'FACT', text: 'Sources confirm. The source is me. Talking.' },
          { card: 'FEELING', text: 'My gut says lower-third. My gut is the anchor.' },
          { card: 'GOTCHA', text: 'You said "four minutes." We\'re at ninety seconds. Gotcha.' },
          { card: 'ANECDOTE', text: 'Back in my day the chyron was a man. That man was my father. BREAKING.' },
          { card: 'FACT', text: 'Ratings are up. Mine. Developing.' },
          { card: 'GOTCHA', text: 'Didn\'t you say you were a journalist? We\'ll have to leave it there.' },
          { card: 'FEELING', text: 'I feel a segment coming on. It\'s me.' },
          { card: 'ANECDOTE', text: 'A kid once finished a sentence on this show. We cut to weather.' }
        ],
        winLine: 'BREAKING. Me. Winning. WE\'LL HAVE TO LEAVE IT THERE.',
        loseLine: 'BREAKING. Kid wins. We\'ll... have to leave it there. Developing.'
      },

      panel: {
        name: 'The Panel', castId: 'panel',
        members: ['goldplate', 'warbanner', 'velvetine', 'footnote', 'dunk'],
        cards: [
          { card: 'FACT', who: 'goldplate', text: 'Mattress. Jets. Pellets. Rate it a ten. That\'s a fact.' },
          { card: 'FACT', who: 'footnote', text: 'Mattress. Jets. Pellets. [citation pending]' },
          { card: 'FEELING', who: 'velvetine', text: 'To mattresses! To jets! To pellets! To feelings!' },
          { card: 'FEELING', who: 'goldplate', text: 'I feel a ten about the mattress. The jets, a ten. Pellets.' },
          { card: 'GOTCHA', who: 'dunk', text: 'Didn\'t read it. Mattress. Jets. Pellets. Gotcha.' },
          { card: 'GOTCHA', who: 'warbanner', text: 'You have no jets. Mattress. Pellets. And that\'s why we need the jets.' },
          { card: 'ANECDOTE', who: 'warbanner', text: 'When I was a boy in Bravadia we had one mattress, no jets, many pellets.' },
          { card: 'ANECDOTE', who: 'footnote', text: 'A fellow once slept on a mattress near a jet. Pellets were involved. [citation pending]' },
          { card: 'FACT', who: 'dunk', text: 'Didn\'t read the memo. Mattress. Jets. Pellets. Facts, probably.' },
          { card: 'FEELING', who: 'footnote', text: 'Forty fellows feel: mattress, jets, pellets.' },
          { card: 'GOTCHA', who: 'goldplate', text: 'Your show is named after me. Mattress. Jets. Pellets. Gotcha, a ten.' },
          { card: 'ANECDOTE', who: 'velvetine', text: 'At my last listening session nobody played Mattress, Jets or Pellets. To silence!' },
          { card: 'FACT', who: 'warbanner', text: 'Mattress. Jets. Pellets. Eleven million citizens agree, by press release.' },
          { card: 'GOTCHA', who: 'velvetine', text: 'Mattress. Jets. Pellets. You honked. To honking!' }
        ],
        winLine: 'Mattress. Jets. Pellets. WE\'LL HAVE TO LEAVE IT THERE.',
        loseLine: 'Mattress... jets... pellets? [citation pending]'
      },

      // Not used by a GDD mission; available for free-play debates on the Quad.
      dunk: {
        name: 'Ptolemy Dunk', castId: 'dunk',
        cards: [
          { card: 'FACT', text: 'Didn\'t read it. It\'s a fact though. Replying anyway.' },
          { card: 'FEELING', text: 'Feels wrong. Didn\'t read it. Feels wrong anyway.' },
          { card: 'GOTCHA', text: 'You read it. Gotcha. Who reads it?' },
          { card: 'ANECDOTE', text: 'One time I finished a thought. Didn\'t like it. Ended it.' },
          { card: 'FACT', text: 'Same sponsor, opposite sign. That\'s the whole fact.' },
          { card: 'FEELING', text: 'My chat feels this. My chat is on a bus.' },
          { card: 'GOTCHA', text: 'Respectfully? Gotcha. Nobody who says that means it.' },
          { card: 'ANECDOTE', text: 'I set up at the next table over. Didn\'t read the sign. Replied to it.' },
          { card: 'FACT', text: 'The billboard quote-posted the billboard. Facts.' },
          { card: 'GOTCHA', text: 'You looked at the crowd meter. It measures volume. Gotcha.' }
        ],
        winLine: 'Didn\'t read your points. Won anyway.',
        loseLine: 'Didn\'t read the result. Replying anyway: good game.'
      }
    }
  };

  // The player's counter lines, one picked per counter card played. The
  // caption strip shows the chosen line.
  GTP.Content.debateCounters = {
    'SOURCE?': [
      'Respectfully, source?',
      'Source? And not a billboard.',
      'Citation pending, forever?',
      'Who told you that, the mattress?',
      'Respectfully, that\'s a vibe, not a number.',
      'Link it. I\'ll wait. I won\'t read it.',
      'Was that peer reviewed or just reviewed?',
      'Source: trust me? Respectfully, no.'
    ],
    'LOUDER': [
      'RESPECTFULLY, NO.',
      'I\'M NOT YELLING. I\'M PROJECTING.',
      'THE CROWD MEASURES VOLUME. LISTEN.',
      'SAY THAT AGAIN BUT QUIETER. I\'M LOUDER.',
      'AS A JOURNALIST: WRONG.',
      'WRITE THAT DOWN. IN CAPS.',
      'MINDS CHANGED: ZERO. EARS: RINGING.'
    ],
    'PIVOT': [
      'Respectfully, let\'s talk about the mattress.',
      'Interesting. Anyway, jets.',
      'That\'s a great question for someone else.',
      'Let me answer something else.',
      'Moving on, which I\'m allowed to do.',
      'Sure. But consider: the stadium has two names.',
      'Respectfully, this is about the Loop now. Legally a party.'
    ],
    'DEFINE TERMS': [
      'Define "reading."',
      'Respectfully, define "respectfully."',
      'What do you mean by "facts"? Be specific.',
      'Define "a ten."',
      'What is a "take," really?',
      'Before I answer: what is "before"?',
      'Define "journalist." No, not like that.'
    ],
    'WHATABOUT': [
      'What about the HOA?',
      'What about Dunk\'s billboard?',
      'What about the fourteen antennas?',
      'Whatabout the pellets, though?',
      'What about the time you did the reading?',
      'Okay, but what about the mattress?',
      'What about the Loop? You\'re legally at a party.'
    ]
  };

  // ======================================================== Ratio minigame ==
  // `post` is pinned at the top with the opponent's portrait; `replies` are
  // the opponent's incoming replies (one every 4 s; every third one spawns a
  // DOGPILE). takesworth_archive prefers the player's own earlier captions from
  // the caption log and falls back to `replies`. everyone rises at 1.5x speed
  // and loses 40 likes per DUNK, per GDD section 7.
  GTP.Content.ratio = {
    opponents: {

      dunk: {
        name: 'Ptolemy Dunk', castId: 'dunk',
        post: 'Didn\'t read the mattress read. Replied anyway. Ratio. #Billboard',
        replies: [
          'didn\'t read',
          'replied anyway',
          'who is this guy',
          'the billboard said it better',
          'L + didn\'t read + mattress',
          'respectfully is not a personality',
          'my chat is on a bus. group rate.',
          'he\'s peaking lol',
          'imagine reading',
          'ratio pending. not reading the result.',
          'code TAKES20 didn\'t work',
          'quote-posting this with no comment',
          'both billboards are mine now',
          'minds changed: zero. likes: mine.'
        ],
        winLine: 'Didn\'t read your replies. Won anyway.',
        loseLine: 'Didn\'t read the ratio. It read me.'
      },

      takesworth_archive: {
        name: 'Takesworth (Archive)', castId: 'takesworth_archive',
        post: 'Respectfully, past me had a point. Code TAKES20. (clip, 2 yrs ago)',
        replies: [
          'Respectfully, I\'m the journalist here. (2 yrs ago)',
          'Minds changed? Zero. Crowd was loud. (clip)',
          'As a journalist, I feel I should disclose this. (clip)',
          'Respectfully, it\'s six numbers. (clip)',
          'Four hours for ninety seconds. Worth it. (clip)',
          'Respectfully, that\'s my show. (clip)',
          'I have no coins. (clip, trending)',
          'What about cheese? (clip, 1.2M views)',
          'Respectfully, which government? (clip)',
          'I don\'t carry furniture. (clip)',
          'Write that down. (clip, looped)',
          'Respectfully... I need a minute. (clip, still running)',
          'The old me is beating the new me. Both are me.'
        ],
        winLine: 'The archive wins. You were better before you were on.',
        loseLine: 'You beat your own clips. They\'ll be back. They\'re scheduled.'
      },

      everyone: {
        name: 'Everyone', castId: 'everyone',
        post: 'Mattress. Jets. Pellets. Rate it a ten. Respectfuly.',
        replies: [
          'first',
          'respectfuly',
          'this is my comment. he\'s reading my comment.',
          'is this paid',
          'ratio',
          'the memo is us',
          'I subscribed to myself. five stars.',
          'mattress jets pellets (sent from the HOA)',
          'didn\'t read, replied anyway, formatted by Kip',
          'rate it a ten. rate it a ten. rate it a ten.',
          'and that\'s why we need the jets',
          '[citation pending]',
          'to whatever this is!',
          'eleven of us are staying. the rest are typing.',
          'one L. on purpose. finally.'
        ],
        winLine: 'Everyone wins. Everyone subscribed.',
        loseLine: 'Eleven people stayed. Everyone else left a comment.'
      }
    }
  };

  // Short replies the player posts, stamped DUNK, REPLY or NOTED by the meter.
  GTP.Content.ratioPlayerPosts = [
    'Respectfully, source?',
    'Respectfully, no.',
    'Read it. Replying anyway.',
    'Code TAKES20.',
    'As a journalist, no.',
    'Minds changed: zero. Likes: up.',
    'That\'s defamation (respectfully).',
    'Write that down.',
    'I did the reading. I think.',
    'Mattress. Jets. Pellets. Nice try.',
    'Respectfully, who asked?',
    'The crowd measures volume.',
    'Ratio pending.',
    'Respectfuly. One L. On purpose.',
    'Same grift, different lanyard.',
    'Rate this reply a ten.'
  ];
})();
