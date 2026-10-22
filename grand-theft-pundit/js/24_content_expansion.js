/* Grand Theft Pundit: 24_content_expansion.js
 * GTP.Content.expansion: everything new in GDD_EXPANSION.md, as data. Pure data plus tiny
 * helpers. Loads after 20..23 (it reads GTP.Content.missions, cast, looks, radio and world
 * at load time); it needs only window (GTP.Events is used when present).
 *
 *   missions        the eight new story missions (GDD_EXPANSION §3), the schema of
 *                   22_content_missions.js plus `act` and the §7 types / extensions
 *                   (equip, deliver_passenger, stop_vehicle, stunt; weapon, mustKill,
 *                   stationary, hostile:false, driven:'cop', colors, around:{tag}, takeWeapon)
 *   chain           the 25 story ids in §3.3 order; requiresPatches: the §3.3 `requires` edits
 *                   (applied in 22_content_missions.js; kept here for the record and as a
 *                   self-check); retune: the §3.4 numbers (applied in 22_; applyRetune() is a
 *                   no-op on top of it and is called once at load, so a reverted 22_ still gets them)
 *   cutscenes       {id: script} in the §4.1 schema: cs_opening, cs_act2, cs_act3, cs_twist,
 *                   cs_ending_a, cs_ending_b verbatim from §4.2, and cs_intro_<id> for every story
 *                   mission built from the §4.3 table (two shots, lines = the mission intro split
 *                   at `split`; the lines are filled in at load so a script is self-contained).
 *                   Small schema extensions the cutscene player may honour or ignore:
 *                     shot.preSpawn: [tags]      spawn these of the mission's tagged vehicle spawns before the intro (in frame)
 *                     shot.vehicles: [...]       cosmetic parked vehicles for the shot ({type, color, wrap, at:{landmark, offset}, yaw})
 *                     shot.track: 'speaker'      shot 2 looks at whoever is speaking (falls back to cam.to)
 *                     actor.face: 'away'         yaw pointing away from the player (back turned)
 *                     actor.sign: 'TEXT'         look.sign for that actor (Roz's placard, Kip's MATTRESS)
 *                     fx.tag: 'podvan'           an fx anchored above the tagged vehicle instead of a door offset
 *                     fx.x/z (no tag)            metres from the shot's landmark door, as in the §4.2 scripts
 *   strands         loud_cab, hoa_patrol, sponsor_runs (§5.1-5.3) and rampages[8], memos[50],
 *                   races[3], stunts[10] (§5.4-5.7); subscriberTiers (§5.8)
 *   shop            stores [3 landmark ids], items (merged by id into Combat's list), merle's
 *                   sale barks, discount rules and discount(player) (Combat calls it)
 *   hints[15], loadingTips[20] (§6), weapons {id: {name, flavor}} for the UI (§2),
 *   radio {ticker[12], barks[10], ads[6]} (§8), streets[33], billboards[9] (§1.2, §8.4)
 *
 * Hooks this file registers on existing surfaces (all guarded and idempotent; listed in the
 * build report so the integration agent can fold them into the owning files):
 *   GTP.Content.cast.merle / .cutout        the two new cast entries (§2.4, §7)
 *   GTP.Content.looks.byDistrict uptown/airport/port   the §1.6 look pools (only if missing)
 *   GTP.Content.radio.ticker (+12), .barks.byDistrict uptown/airport/port, .barks.doorman,
 *   stations[].ads (+2 each on pennant_fm, velvetine_888, quiet_signal)   §8, appended
 *   GTP.Events 'mission:start'              shows mission.startToast (the §3.4 m02 hint) via UI.toast
 * Every string obeys CONTENT_RULES.md; every character is an invented archetype.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.Content = GTP.Content || {};

  function lmk(id, x, z) { return { landmark: id, offset: { x: x, z: z } }; }
  function lmk3(id, x, y, z) { return { landmark: id, offset: { x: x, y: y, z: z } }; }

  var X = GTP.Content.expansion = {
    version: '1.0',

    // ================================================================ §3 missions ==
    missions: [

      // ------------------------------------------------------------- Act I --
      {
        id: 'm01b_airport', title: 'Baggage Claim', act: 1,
        giver: 'sloane', marker: 'pod_garage', requires: ['m01c_both_sides'], reward: 250,
        intro: [
          { who: 'sloane', text: 'The sponsor\'s demo mattress lands at Goldplate International in five minutes. Four. Kip\'s at Arrivals with a sign.' },
          { who: 'player', text: 'We have an airport?' },
          { who: 'sloane', text: 'It has us. Take the van. Follow the arrow. The Loop is faster and legally a party.' },
          { who: 'gus', text: 'The battery\'s fixed. I say that so you\'ll drive carefully. It isn\'t.' }
        ],
        objectives: [
          { type: 'enter_vehicle', spawn: { type: 'van', tag: 'podvan', at: { landmark: 'pod_garage' }, wrap: 'pod', color: '#f2f2f2' }, text: 'Get in the pod van' },
          { type: 'timer_wrap', seconds: 300, objectives: [
            { type: 'drive_to', target: { landmark: 'airport_terminal' }, vehicle: 'spawned:podvan', text: 'Drive to Goldplate International. Follow the arrow; the Loop and the Sponsor Span are quickest' }
          ] },
          { type: 'deliver_passenger', spawn: { ped: 'kip', at: { landmark: 'airport_terminal' } }, to: { landmark: 'pod_garage' }, vehicle: 'spawned:podvan', board: { radius: 40, hold: 1 }, text: 'Pick up Kip at Arrivals and bring him back to the garage' },
          { type: 'dialogue', lines: [
            { who: 'kip', text: 'The mattress was on the flight. The flight was a bus. Is this paid?' }
          ] }
        ],
        outro: [
          { who: 'sloane', text: 'Five minutes. You took eleven. The mattress is fine. The mattress is always fine.' },
          { who: 'player', text: 'Respectfully, the airport is across an ocean.' },
          { who: 'sloane', text: 'It\'s a bay. Two minutes. One. Nap Dynasty wants to meet you.' },
          { who: 'kip', text: 'I held the sign the whole flight.' }
        ],
        failOn: ['player_dead', 'vehicle_lost:podvan'],
        onComplete: { setFlag: 'seen_airport' }
      },

      {
        id: 'm03b_range', title: 'Aim Small, Yell Big', act: 1,
        giver: 'gus', marker: 'both_sides_strip', requires: ['m03_ratio'], reward: 300,
        intro: [
          { who: 'gus', text: 'You keep swinging at people who are already leaving. Learn to aim. Merle\'s got a range.' },
          { who: 'merle', text: 'Loaner pistol. Four fifty. For a journalist, four hundred. Four fifty. Six hecklers out back. Cardboard. They don\'t sue.' },
          { who: 'player', text: 'I don\'t need a gun to win an argument.' },
          { who: 'merle', text: 'Then you\'ll be the first. Hold aim, line up the head, squeeze. The head\'s where the take is.' }
        ],
        objectives: [
          { type: 'equip', weaponId: 'pistol', ammo: 36, text: 'Take the loaner pistol' },
          { type: 'goto', target: { landmark: 'both_sides_strip', point: 'range' }, radius: 64, text: 'Walk around back to the range' },
          { type: 'timer_wrap', seconds: 90, objectives: [
            { type: 'defeat', spawn: { ped: 'cutout', count: 6, around: { landmark: 'both_sides_strip', point: 'range' }, radius: 80, stationary: true, hostile: false }, weapon: 'pistol', mustKill: true, text: 'Drop six cardboard hecklers. Hold Aim, Tab switches targets, head shots count double' }
          ] },
          { type: 'dialogue', lines: [
            { who: 'merle', text: 'Nice grouping. Six hecklers, six headlines.' },
            { who: 'gus', text: 'The neighbours called it in. One star. Stay out of sight and it fades, or my garage resprays it for a hundred.' }
          ] },
          { type: 'escape_wanted', setWanted: 1, text: 'Lose one star: break line of sight and wait, or drive into Gus\'s Garage' }
        ],
        outro: [
          { who: 'merle', text: 'The cops rated the noise a four. Pistol goes back on the wall. For a journalist, I\'ll keep it on the wall.' },
          { who: 'gus', text: 'Keep the table leg. It fell off the table. It\'s the honest weapon.' },
          { who: 'player', text: 'Respectfully, I\'m a trained marksman now.' },
          { who: 'gus', text: 'You\'re peaking.' },
          { who: 'kip', text: 'I counted. Six hecklers, zero minds changed. Is this paid?' }
        ],
        failOn: ['player_dead'],
        onComplete: { takeWeapon: 'pistol', unlockWeapon: 'tableleg', setFlag: 'range_trained' }
      },

      // ------------------------------------------------------------ Act II --
      {
        id: 'm05b_provenance', title: 'Chain of Custody', act: 2,
        giver: 'vaultwright', marker: 'heirloom_club', requires: ['m05_peer'], reward: 1200,
        intro: [
          { who: 'vaultwright', text: 'Mr. Takesworth. The museum has your table. They\'re calling it the first take. I\'m whispering *attributed*.' },
          { who: 'player', text: 'Dunk sold them my table?' },
          { who: 'vaultwright', text: 'He sold them a table. Bring it to the manor. I\'m a trustee. It\'s a loan. To me. From me.' },
          { who: 'footnote', text: '[citation pending] The provenance is a podcast.' }
        ],
        objectives: [
          { type: 'goto', target: { landmark: 'museum_of_takes' }, radius: 48, text: 'Get to the Museum of Takes' },
          { type: 'defeat', spawn: { ped: 'thug', count: 5, around: { landmark: 'museum_of_takes' }, radius: 140 }, text: 'The docents object. Clear the atrium' },
          { type: 'pickup', spawn: { pickupType: 'mission', count: 1, around: { landmark: 'museum_of_takes' }, radius: 60, label: 'THE FIRST TAKE' }, text: 'Take the table back' },
          { type: 'enter_vehicle', spawn: { type: 'van', tag: 'loanvan', at: { landmark: 'museum_of_takes' }, color: '#efe4cd' }, text: 'Get in the museum loan van' },
          { type: 'escape_wanted', setWanted: 2, text: 'Museum security has called it in. Lose them' },
          { type: 'drive_to', target: { landmark: 'vaultwright_manor' }, vehicle: 'spawned:loanvan', text: 'Deliver the table to Vaultwright Manor' }
        ],
        outro: [
          { who: 'vaultwright', text: 'The first take, attributed, in my hedge maze. I\'m whispering *priceless*, which is a number.' },
          { who: 'player', text: 'Respectfully, that\'s my table.' },
          { who: 'vaultwright', text: 'It was. Here\'s a revolver. The hedge has a hedge now.' },
          { who: 'kip', text: 'I rode in the back with the table. We talked. Is this paid?' }
        ],
        failOn: ['player_dead', 'vehicle_lost:loanvan'],
        onComplete: { unlockWeapon: 'revolver', setFlag: 'table_loaned' }
      },

      {
        id: 'm07b_ferry', title: 'Nothing to Declare', act: 2,
        giver: 'velvetine', marker: 'ferry_terminal', requires: ['m07_listen'], reward: 1400,
        intro: [
          { who: 'velvetine', text: 'To the ferry! To Elsewhere! To the mixtape, still sealed, thirty years, charting!' },
          { who: 'player', text: 'Where\'s Elsewhere?' },
          { who: 'velvetine', text: 'Wherever customs isn\'t. Four crates in the yard. The yard is a maze. To mazes! Don\'t let the inspectors open anything. Opening is listening.' },
          { who: 'kip', text: 'I\'ll navigate. I have a map of a different yard. Is this paid?' }
        ],
        objectives: [
          { type: 'enter_vehicle', spawn: { type: 'truck', tag: 'mixtruck', at: { landmark: 'container_yard' }, color: '#8e3a8e' }, text: 'Get in the Velvetine truck at the yard gate' },
          { type: 'timer_wrap', seconds: 150, objectives: [
            { type: 'pickup', spawn: { pickupType: 'mission', count: 4, around: { landmark: 'container_yard' }, radius: 320, label: 'SEALED' }, text: 'Collect 4 sealed crates in the container maze' }
          ] },
          { type: 'destroy', spawn: { vehicle: 'van', count: 2, tag: 'inspectors', around: { landmark: 'customs_shed' }, radius: 200, driven: 'cop', color: '#d9cfa6' }, text: 'Two customs vans want to open the crates. Wreck them' },
          { type: 'drive_to', target: { landmark: 'ferry_terminal' }, vehicle: 'spawned:mixtruck', text: 'Get the crates to the Ferry to Elsewhere' },
          { type: 'dialogue', lines: [
            { who: 'velvetine', text: 'To departure!' },
            { who: 'player', text: 'It\'s not moving.' },
            { who: 'velvetine', text: 'The ferry is the leaving. To having left!' }
          ] }
        ],
        outro: [
          { who: 'velvetine', text: 'Customs opened nothing. The mixtape remains sealed, charting, and on a boat that is also a venue.' },
          { who: 'player', text: 'Respectfully, two of their vans are in the water.' },
          { who: 'velvetine', text: 'To the water! Nothing to declare!' },
          { who: 'chyron', text: 'BREAKING. FERRY TO ELSEWHERE DELAYED; PUNDIT SUSPECTED; BARON TOASTS', ticker: true }
        ],
        failOn: ['player_dead', 'vehicle_lost:mixtruck'],
        onComplete: { setFlag: 'ferry_friend' }
      },

      {
        id: 'm08b_jets', title: 'The Jets Arrive', act: 2,
        giver: 'warbanner', marker: 'airport_terminal', requires: ['m08_scooters'], reward: 1800,
        intro: [
          { who: 'warbanner', text: 'The jets have arrived, and that\'s why we need the jets.' },
          { who: 'player', text: 'That\'s one jet. On a truck. It\'s flat.' },
          { who: 'warbanner', text: 'It\'s in profile. Drive it down the runway. At speed. Off the end. The footage will show lift, and that\'s why we need the jets.' },
          { who: 'goldplate', text: 'I\'m in the tower. I rate the runway a ten. Both ends. Don\'t scratch my ten.', radio: true },
          { who: 'sloane', text: 'Two minutes. Hit the ramp at the west end flat out. If it floats, it flies.' }
        ],
        objectives: [
          { type: 'enter_vehicle', spawn: { type: 'truck', tag: 'jettruck', at: { landmark: 'airport_terminal' }, wrap: 'jet', color: '#3d6fcf' }, text: 'Get in the jet truck' },
          { type: 'timer_wrap', seconds: 120, objectives: [
            { type: 'drive_to', target: { landmark: 'airport_runway', point: 'east' }, vehicle: 'spawned:jettruck', radius: 80, text: 'Line up at the east end of Runway 10/10' },
            { type: 'stunt', ramp: 'sj_07', vehicle: 'spawned:jettruck', minAir: 0.8, minSpeed: 18, text: 'Floor it west down the runway and hit the ramp at the end flat out' }
          ] },
          { type: 'dialogue', lines: [
            { who: 'goldplate', text: 'Lift! I counted lift. Ten.' },
            { who: 'warbanner', text: 'A triumph, and that\'s why we need the jets.' },
            { who: 'sloane', text: 'Airport security wants the truck. It\'s a jet now. Run.' }
          ] },
          { type: 'escape_wanted', setWanted: 3, text: 'Airport security rates your landing a three. Lose them' }
        ],
        outro: [
          { who: 'warbanner', text: 'The footage shows lift. Bravadia will order forty more trucks, and that\'s why we need the jets.' },
          { who: 'player', text: 'Respectfully, it\'s on the beach.' },
          { who: 'warbanner', text: 'A beach is a runway with sand. Souvenir: a rifle. It\'s from the jet. There is no jet. And that\'s why we need the jets.' },
          { who: 'kip', text: 'I filmed it. I filmed the sky. Is this paid?' }
        ],
        failOn: ['player_dead', 'vehicle_lost:jettruck'],
        onComplete: { unlockWeapon: 'rifle', setFlag: 'jets_arrived' }
      },

      {
        id: 'm09b_hotmic', title: 'Hot Mic', act: 2,
        giver: 'redacted', marker: 'customs_shed', requires: ['m09_balloon'], reward: 2000,
        intro: [
          { who: 'redacted', text: 'The [REDACTED] leaves the port in a van. Stop the van. Don\'t [REDACTED] the driver, he\'s a subscriber.' },
          { who: 'player', text: 'Stop it how?' },
          { who: 'redacted', text: 'Get in front of it. Stay in front of it. Vans respect that. Then the proofs. Then this. It\'s a [REDACTED] that was on the whole time. Throw it. Don\'t hold it. Everyone holds it.' },
          { who: 'kip', text: 'I\'m in the shed. I\'m not supposed to be in the shed. Is this paid?', offscreen: true }
        ],
        objectives: [
          { type: 'enter_vehicle', spawn: { type: 'suv', tag: 'chase', at: { landmark: 'customs_shed' }, color: '#4c4c4c' }, text: 'Take the OVA SUV' },
          { type: 'stop_vehicle', spawn: { vehicle: 'van', tag: 'proofvan', at: { landmark: 'customs_shed' }, color: '#d9cfa6', driven: 'traffic', flee: true }, stopSpeed: 1, hold: 3, maxDist: 2400, text: 'Stop the courier van before it leaves the harbor: block it, box it in, or bump it to a halt' },
          { type: 'pickup', spawn: { pickupType: 'mission', count: 1, around: { tag: 'proofvan' }, radius: 40, label: 'PROOFS' }, text: 'Lift the print proofs from the van' },
          { type: 'equip', weaponId: 'hotmic', ammo: 4, text: 'Take the hot mics' },
          { type: 'destroy', spawn: { vehicle: 'van', count: 2, tag: 'balloons', around: { landmark: 'customs_shed' }, radius: 160, color: '#d9cfa6' }, weapon: 'hotmic', text: 'Two weather balloons are parked behind the shed. One mic each; the mic goes off. Throw it, then step back' },
          { type: 'escape_wanted', setWanted: 3, text: 'The balloons have sirens. Lose them' }
        ],
        outro: [
          { who: 'redacted', text: 'The proofs have a byline. Yours. It was always going to be yours. [REDACTED] is pleased.' },
          { who: 'player', text: 'I didn\'t write it.' },
          { who: 'redacted', text: 'You said it. Out loud. Near a [REDACTED]. Keep the mics. Everyone\'s hot.' }
        ],
        failOn: ['player_dead', 'target_escaped'],
        onComplete: { unlockWeapon: 'hotmic', setFlag: 'byline' }
      },

      // ----------------------------------------------------------- Act III --
      {
        id: 'm12b_scope', title: 'Citation Needed', act: 3,
        giver: 'footnote', marker: 'museum_of_takes', requires: ['m12_memo'], reward: 2600,
        intro: [
          { who: 'footnote', text: '[citation pending] Forty fellows. One opinion. I\'ve found where it comes from. Five couriers on the links across the water, every evening, handing it off.' },
          { who: 'player', text: 'You want me to shoot them?' },
          { who: 'footnote', text: 'Cite them. From here. It\'s peer review at a distance. They\'ll shoot back; they can\'t read at this range either. Hold aim, breathe, cite.' },
          { who: 'kip', text: 'I\'m the sixth courier. I quit this morning. Is this paid?' }
        ],
        objectives: [
          { type: 'equip', weaponId: 'sniper', ammo: 10, text: 'Take the Fact Checker' },
          { type: 'goto', target: { landmark: 'causeway_east' }, radius: 48, text: 'Get to the causeway railing and look across the channel' },
          { type: 'defeat', spawn: { ped: 'courier', count: 5, around: { landmark: 'goldplate_links' }, radius: 200, stationary: true, hostile: true }, weapon: 'sniper', mustKill: true, text: 'Cite the five armed couriers on the links before they cite you. Hold Aim to scope; the wheel zooms' },
          { type: 'pickup', spawn: { pickupType: 'mission', count: 5, around: { landmark: 'goldplate_links' }, radius: 200, label: 'STUDY' }, text: 'Cross the causeway and collect the five studies' },
          { type: 'escape_wanted', setWanted: 4, text: 'The balloons saw the citations. Lose them' },
          { type: 'goto', target: { landmark: 'museum_of_takes' }, radius: 48, text: 'Bring the studies to Dr. Footnote' }
        ],
        outro: [
          { who: 'footnote', text: 'Five studies. One abstract. The abstract is your comment section. [citation pending] The citation is you.' },
          { who: 'player', text: 'Respectfully, I\'d like a footnote of my own.' },
          { who: 'footnote', text: 'You\'re the whole bibliography. Keep the rifle. It reads at two hundred metres.' },
          { who: 'kip', text: 'I was cited once. It said \'intern, unpaid.\' Is this paid?' }
        ],
        failOn: ['player_dead'],
        onComplete: { unlockWeapon: 'sniper', setFlag: 'cited' }
      },

      {
        id: 'm13b_ratio', title: 'Ratio Launcher', act: 3,
        giver: 'moonsworth', marker: 'container_yard', requires: ['b05_dunk'], reward: 3500,
        intro: [
          { who: 'moonsworth', text: 'Bryce. Pivot. $PUNDIT is a launcher now. Trustless. You point it, it ratios.' },
          { who: 'player', text: 'Why is the coin a rocket launcher?' },
          { who: 'moonsworth', text: 'Utility. Four vans are taking the memo containers to the panel. Burn the supply. Scarcity is bullish. The rockets are tokens.' },
          { who: 'gus', text: 'He\'s peaking. Also the rockets are real. Don\'t stand behind it.' }
        ],
        objectives: [
          { type: 'equip', weaponId: 'ratio', ammo: 6, text: 'Take the Ratio Launcher' },
          { type: 'timer_wrap', seconds: 150, objectives: [
            { type: 'destroy', spawn: { vehicle: 'van', count: 4, tag: 'memovans', around: { landmark: 'container_yard' }, radius: 160, driven: 'traffic', colors: ['#ffd400', '#3d6fcf', '#8e3a8e', '#2c3e7a'] }, weapon: 'ratio', text: 'Ratio the four faction vans before they leave the maze' }
          ] },
          { type: 'escape_wanted', setWanted: 5, text: 'Every balloon, cruiser and HOA kite is up. Lose them all' },
          { type: 'goto', target: { landmark: 'pod_garage' }, radius: 48, text: 'Get back to the garage' }
        ],
        outro: [
          { who: 'moonsworth', text: 'Supply burned. Four vans, zero memos, all-time high. The launcher\'s yours. The warranty\'s mine. The warranty is the token.' },
          { who: 'player', text: 'Respectfully, I\'m now wanted in every district.' },
          { who: 'moonsworth', text: 'Reach.' },
          { who: 'sloane', text: 'Chyron\'s panel is tonight. Five guests. One memo. Bring the launcher. Don\'t bring the launcher.' }
        ],
        failOn: ['player_dead'],
        onComplete: { unlockWeapon: 'ratio', setFlag: 'launched' }
      }
    ],

    // §3.3: the story line after the expansion, and the `requires` edits that make it one.
    chain: ['m00_intro', 'm01_van', 'm01b_airport', 'm02_read', 'm03_ratio', 'm03b_range', 'm04_hit', 'm05_peer', 'm05b_provenance', 'm06_rally',
      'm07_listen', 'm07b_ferry', 'm08_scooters', 'm08b_jets', 'm09_balloon', 'm09b_hotmic', 'm10_pellets', 'm11_trustless', 'm12_memo', 'm12b_scope',
      'm13_thursday', 'm13b_ratio', 'm14_grift', 'm15a_primetime', 'm15b_liveread'],
    acts: { 1: ['m00_intro', 'm01_van', 'm01b_airport', 'm02_read', 'm03_ratio', 'm03b_range', 'm04_hit'],
      2: ['m05_peer', 'm05b_provenance', 'm06_rally', 'm07_listen', 'm07b_ferry', 'm08_scooters', 'm08b_jets', 'm09_balloon', 'm09b_hotmic', 'm10_pellets', 'm11_trustless'],
      3: ['m12_memo', 'm12b_scope', 'm13_thursday', 'm13b_ratio', 'm14_grift', 'm15a_primetime', 'm15b_liveread'] },
    requiresPatches: { m02_read: ['m01b_airport'], m04_hit: ['m03b_range'], m06_rally: ['m05b_provenance'], m08_scooters: ['m07b_ferry'],
      m09_balloon: ['m08b_jets'], m10_pellets: ['m09b_hotmic'], m13_thursday: ['m12b_scope'], m14_grift: ['m13b_ratio'] },
    // act transitions and the twist play from these completions (§4.1)
    cutsceneAfter: { m04_hit: 'cs_act2', m11_trustless: 'cs_act3', m12_memo: 'cs_twist', m15a_primetime: 'cs_ending_a', m15b_liveread: 'cs_ending_b' },

    // §3.4: the friendlier first three missions. Already in 22_content_missions.js; applyRetune() below re-applies
    // them idempotently (the m02 toast is a mission-level `startToast` shown by the 'mission:start' hook at the end of this file).
    retune: {
      m00_intro: [
        { path: 'objectives.3.params.points', value: 3 },
        { path: 'objectives.3.params.timer', value: 8 },
        { path: 'objectives.1.spawn.radius', value: 120 }
      ],
      m01_van: [
        { path: 'objectives.1.seconds', value: 150 },
        { path: 'objectives.1.objectives.0.spawn.count', value: 5 },
        { path: 'objectives.1.objectives.0.spawn.radius', value: 300 },
        { path: 'objectives.1.objectives.0.text', value: 'Collect 5 subscribers before the battery dies' },
        { path: 'intro.3.text', value: 'The battery lasts two and a half minutes. I didn\'t fix it. I\'m sound.' }
      ],
      m02_read: [
        { path: 'objectives.1.seconds', value: 180 },
        { path: 'startToast', value: 'Nap Dynasty\'s truck is slow and firm. The Loop is quicker than the streets.' }
      ]
    },

    // =============================================================== §4 cutscenes ==
    cutscenes: {
      cs_opening: { id: 'cs_opening', title: 'Table Stakes', letterbox: true, skippable: true, music: 'off', shots: [
        { cam: { from: lmk3('campus_quad', -14, 9, 18), to: lmk3('campus_quad', 0, 1, -6), seconds: 7, ease: 'inout', move: { to: lmk3('campus_quad', -6, 3, 9) } },
          actors: [{ castId: 'player', at: lmk('campus_quad', -0.8, -6), face: Math.PI, anim: 'table' }, { castId: 'gus', at: lmk('campus_quad', 2.2, -5), face: 'player', anim: 'idle' }, { castId: 'kip', at: lmk('campus_quad', 9, -2), face: 'player', anim: 'wave' }],
          lines: [{ who: 'player', text: 'Grievance City. Two time zones, one opinion. It\'s always primetime somewhere, and somewhere is here.' },
            { who: 'gus', text: 'You\'re talking to nobody. The table isn\'t up. You\'re peaking on nobody.' },
            { who: 'player', text: 'Respectfully, Gus, a journalist warms up.' }],
          fx: [{ type: 'text', text: 'LOUD & CORRECT', x: 0, y: 3, z: 0, color: '#ff3fa4', life: 3 }] },
        { cam: { from: { entity: 'actor:gus', offset: { x: -0.6, y: 1.7, z: -2.2 } }, to: { entity: 'player' }, seconds: 6, ease: 'inout' },
          actors: [{ castId: 'player', anim: 'talk' }, { castId: 'gus', anim: 'talk' }],
          lines: [{ who: 'gus', text: 'Minds changed so far: zero. Sign says ASK ME ANYTHING. Nobody asked.' },
            { who: 'player', text: 'They will. I\'ll answer something else. That\'s the format.' },
            { who: 'gus', text: 'The parts are in 4B. Go get the table. I\'m not carrying. I\'m levels.' },
            { who: 'kip', text: 'Hi. Is this... I\'ll ask later.' }], hold: 1.2 }
      ] },

      cs_act2: { id: 'cs_act2', title: 'Four Clients', letterbox: true, skippable: true, music: 'station:pennant_fm', shots: [
        { cam: { from: lmk3('goldplate_tower', -40, 70, 40), to: lmk3('goldplate_tower', 0, 64, 0), seconds: 8, ease: 'inout', move: { to: lmk3('goldplate_tower', -12, 66, 14) } },
          actors: [{ castId: 'goldplate', at: { landmark: 'goldplate_tower', offset: { x: -2, z: -2 }, roof: true }, anim: 'point' }, { castId: 'vaultwright', at: { landmark: 'goldplate_tower', offset: { x: 2, z: -2 }, roof: true }, anim: 'talk' }, { castId: 'velvetine', at: { landmark: 'goldplate_tower', offset: { x: -2, z: 2 }, roof: true }, anim: 'idle' }, { castId: 'warbanner', at: { landmark: 'goldplate_tower', offset: { x: 2, z: 2 }, roof: true }, anim: 'idle' }],
          lines: [{ who: 'vaultwright', text: 'Gentlemen. I\'ve found a young face. He\'s loud, he\'s cheap, and he thinks he\'s the protagonist. I\'m whispering *lease*.' },
            { who: 'goldplate', text: 'I rate him a seven. I rate this roof a ten. Both words.' },
            { who: 'velvetine', text: 'To the lease! To whatever this is!' },
            { who: 'warbanner', text: 'He\'ll do the reads. I\'ll do the jets, and that\'s why we need the jets.' }] },
        { cam: { from: lmk3('goldplate_tower', 8, 2.2, 12), to: { entity: 'player' }, seconds: 6, ease: 'inout' },
          actors: [{ castId: 'player', at: lmk('goldplate_tower', 3, 8), face: 0, anim: 'idle' }, { castId: 'sloane', at: lmk('goldplate_tower', 5, 9), face: 'player', anim: 'talk' }],
          lines: [{ who: 'sloane', text: 'Four clients. One contract. Yours. Everyone wants the podcast. Two minutes each. One.' },
            { who: 'player', text: 'Who owns the show?' },
            { who: 'sloane', text: 'Whoever\'s reading. Act two. Go.' }],
          fx: [{ type: 'text', text: 'ACT II: FOUR CLIENTS', x: 0, y: 4, z: 0, color: '#ffd400', life: 3.5 }], hold: 1.5 }
      ] },

      cs_act3: { id: 'cs_act3', title: 'The Monday Memo', letterbox: true, skippable: true, music: 'off', shots: [
        { cam: { from: lmk3('pod_garage', 9, 4, 9), to: lmk3('pod_garage', 0, 1.2, 2), seconds: 7, ease: 'inout', move: { to: lmk3('pod_garage', 4, 2, 5) } },
          actors: [{ castId: 'gus', at: lmk('pod_garage', -1, 2), face: 'player', anim: 'point' }, { castId: 'roz', at: lmk('pod_garage', 1.5, 2.5), face: 'player', anim: 'talk' }, { castId: 'player', at: lmk('pod_garage', 0, 5), face: Math.PI, anim: 'idle' }],
          lines: [{ who: 'gus', text: 'Mattress copy. PM\'s invoice. The memo you lifted. Kyler\'s whitepaper. Read the last word of each.' },
            { who: 'player', text: 'Respectfuly. Respectfuly. Respectfuly. One L.' },
            { who: 'roz', text: 'WE\'RE NOT HERE TO HELP YOU. Now read the top comment on your last episode.' },
            { who: 'player', text: '...Respectfuly.' }] },
        { cam: { from: { entity: 'player', offset: { x: 0.7, y: 1.6, z: -1.6 } }, to: { entity: 'actor:gus' }, seconds: 5, ease: 'inout' },
          actors: [{ castId: 'gus', anim: 'talk' }, { castId: 'roz', anim: 'idle' }],
          lines: [{ who: 'gus', text: 'Every script in the city ends with your typo. Somebody is selling your comments to everybody.' },
            { who: 'player', text: 'Then somebody is in charge.' },
            { who: 'gus', text: 'Find the floor where they make it. Act three. You\'re peaking.' }],
          fx: [{ type: 'text', text: 'ACT III: THE MONDAY MEMO', x: 0, y: 4, z: 0, color: '#ffd400', life: 3.5 }], hold: 1.5 }
      ] },

      cs_twist: { id: 'cs_twist', title: 'Nobody', letterbox: true, skippable: true, music: 'station:quiet_signal', shots: [
        { cam: { from: lmk3('ova_hq', -7, 3.5, 7), to: lmk3('ova_hq', 0, 1.4, 1), seconds: 9, ease: 'inout', move: { to: lmk3('ova_hq', -2, 2, 4) } },
          actors: [{ castId: 'redacted', at: lmk('ova_hq', 0, 1), face: 'player', anim: 'idle' }, { castId: 'player', at: lmk('ova_hq', 0, 4), face: 0, anim: 'idle' }, { castId: 'kip', at: lmk('ova_hq', 3, 3), face: 'player', anim: 'idle' }],
          lines: [{ who: 'player', text: 'Where\'s the operations floor?' },
            { who: 'redacted', text: '[REDACTED].' },
            { who: 'player', text: 'There\'s no floor. There\'s a lectern and a login.' },
            { who: 'redacted', text: '[REDACTED] subscribes. [REDACTED] subscribes. Everyone [REDACTED].' }],
          fx: [{ type: 'text', text: 'GOLDPLATE: SUBSCRIBED', x: 0, y: 3.2, z: 0, color: '#ffd400', life: 2.2 }, { type: 'text', text: 'WARBANNER: SUBSCRIBED', x: 0, y: 3.6, z: 0, color: '#3d6fcf', life: 3.2 }, { type: 'text', text: 'VELVETINE: SUBSCRIBED', x: 0, y: 4.0, z: 0, color: '#8e3a8e', life: 4.2 }, { type: 'text', text: 'TYN · FULCRUM · DUNK · THE HOA: SUBSCRIBED', x: 0, y: 4.4, z: 0, color: '#c94040', life: 5.2 }] },
        { cam: { from: { entity: 'player', offset: { x: -0.8, y: 1.7, z: -1.8 } }, to: { entity: 'actor:kip' }, seconds: 7, ease: 'inout' },
          actors: [{ castId: 'kip', anim: 'talk' }, { castId: 'redacted', anim: 'idle' }],
          lines: [{ who: 'kip', text: 'It\'s a dashboard. It scrapes the comments under your episodes every night and formats them. I know because I formatted it.' },
            { who: 'player', text: 'So who\'s in charge?' },
            { who: 'kip', text: 'Nobody. Everyone subscribed. The last line of tonight\'s memo says you\'re ready for primetime. Your audience wrote that.' },
            { who: 'player', text: 'The conspiracy is my comment section.' },
            { who: 'kip', text: 'And I formatted it. Is this paid?' }], hold: 2 }
      ] },

      cs_ending_a: { id: 'cs_ending_a', title: 'Primetime', letterbox: true, skippable: true, music: 'station:pennant_fm', shots: [
        { cam: { from: lmk3('goldplate_tower', -30, 80, 30), to: lmk3('goldplate_tower', 0, 64, 0), seconds: 10, ease: 'inout', move: { to: lmk3('goldplate_tower', -5, 66, 6) } },
          actors: [{ castId: 'player', at: { landmark: 'goldplate_tower', offset: { x: 0, z: 0 }, roof: true }, anim: 'table' }, { castId: 'goldplate', at: { landmark: 'goldplate_tower', offset: { x: 3, z: 1 }, roof: true }, face: 'player', anim: 'point' }, { castId: 'chyron', at: { landmark: 'goldplate_tower', offset: { x: -3, z: 1 }, roof: true }, face: 'player', anim: 'talk' }, { castId: 'kip', at: { landmark: 'goldplate_tower', offset: { x: 0, z: 4 }, roof: true }, face: 'player', anim: 'idle' }],
          lines: [{ who: 'goldplate', text: 'Gold table. Ten out of ten. The Goldplate Table, by Goldplate, with Takesworth.' },
            { who: 'chyron', text: 'BREAKING. Him. Forever. The ticker\'s his. The copy\'s his. The chair\'s his.' },
            { who: 'player', text: 'What do I believe?' }],
          fx: [{ type: 'text', text: 'MATTRESS. JETS. PELLETS. RATE IT A TEN. RESPECTFULY.', x: 0, y: 70, z: 0, color: '#ffd400', life: 6 }] },
        { cam: { from: { entity: 'player', offset: { x: 1.2, y: 1.5, z: 2.4 } }, to: { entity: 'player' }, seconds: 8, ease: 'inout', move: { to: { entity: 'player', offset: { x: 0.4, y: 1.6, z: 1.4 } } } },
          actors: [{ castId: 'player', anim: 'table' }, { castId: 'chyron', anim: 'talk' }, { castId: 'kip', anim: 'talk' }],
          lines: [{ who: 'chyron', text: 'Whatever\'s next. Four minutes. WE\'LL HAVE TO LEAVE IT THERE.' },
            { who: 'player', text: 'I had a sign once. It asked me anything.' },
            { who: 'kip', text: 'Credits are rolling. They\'re ads. Is this paid?' },
            { who: 'player', text: '...Respectfully, I don\'t remember.' }], hold: 2.5 }
      ] },

      cs_ending_b: { id: 'cs_ending_b', title: 'Live Read', letterbox: true, skippable: true, music: 'off', clock: 6.4, shots: [
        { cam: { from: lmk3('campus_quad', 16, 7, -14), to: lmk3('campus_quad', 0, 1, -6), seconds: 10, ease: 'inout', move: { to: lmk3('campus_quad', 6, 2.5, -9) } },
          actors: [{ castId: 'player', at: lmk('campus_quad', -1, -6), face: Math.PI, anim: 'table' }, { castId: 'dunk', at: lmk('campus_quad', 6, -6), face: Math.PI, anim: 'table' }, { castId: 'gus', at: lmk('campus_quad', -4, -4), face: 'player', anim: 'idle' }, { castId: 'kip', at: lmk('campus_quad', 2, -1), face: 'player', anim: 'wave' }, { castId: 'roz', at: lmk('campus_quad', 9, -2), anim: 'idle' }, { castId: 'freshman', at: lmk('campus_quad', -2, 0), face: 'player', anim: 'idle' }],
          lines: [{ who: 'gus', text: 'New sign. I DON\'T KNOW. LET\'S TALK. Minds changed so far: unknown. That\'s a first.' },
            { who: 'dunk', text: 'Same sign. Next table. Didn\'t read yours. Wrote mine anyway.' },
            { who: 'player', text: 'Respectfully, Ptolemy... no. Just: Ptolemy. Pull up a chair.' },
            { who: 'dunk', text: 'There are no chairs.' }],
          fx: [{ type: 'text', text: 'I DON\'T KNOW. LET\'S TALK.', x: 0, y: 3, z: -6, color: '#ffffff', life: 5 }] },
        { cam: { from: lmk3('campus_quad', -3, 1.8, -11), to: { entity: 'player' }, seconds: 8, ease: 'inout' },
          actors: [{ castId: 'player', anim: 'talk' }, { castId: 'freshman', anim: 'talk' }, { castId: 'kip', anim: 'talk' }],
          lines: [{ who: 'freshman', text: 'I did the reading. Page forty. Would you like to see it?' },
            { who: 'player', text: 'Yes. I actually would.' },
            { who: 'gus', text: 'Eleven people. I counted. Ratio: tie. You\'re not peaking.' },
            { who: 'kip', text: 'Eleven dollars. One each. Is this paid?' },
            { who: 'player', text: 'Kip. It\'s paid.' }], hold: 2.5 }
      ] }
      // cs_intro_<missionId> x 25 are built below from INTRO_SHOTS
    },

    // ================================================================= §5 strands ==
    strands: {
      loud_cab: {
        id: 'loud_cab', name: 'Loud Cab', banner: 'LOUD CAB', icon: 'cab',
        start: { vehicles: ['taxi'], action: 'action', stopped: true, parkedAt: 'airport_terminal' },
        end: { action: 'action', stopped: true, noPassenger: true },
        spawnDistance: [60, 140], destDistance: [150, 450], maxBridges: 1, markerColor: '#ffd400',
        board: { radius: 4, hold: 1 },
        timer: { base: 20, perMetre: 1 / 9 },
        fare: { base: 20, perMetre: 0.25, tipNoCrash: 0.5, timeoutMul: 0.5 },
        hotStreak: { fares: 3, mul: 1.5, chip: 'HOT STREAK' },
        endOn: { wreck: true, leftSeconds: 10, wantedLevel: 3 },
        bailLine: 'Respectfully, I\'ll walk.',
        subsPerFare: 150,
        // the twelve archetypes, in GTP.rng order without repeats until all twelve have ridden; `dest` is the
        // preferred landmark (the runtime picks any door 150..450 m away when it is out of range or over two bridges)
        passengers: [
          { id: 'fare_fellow', archetype: 'a think-tank fellow', look: { skin: 4, hair: 'short', hairColor: '#9c9c9c', glasses: 'thick', hat: 'none', extra: 'lanyard', tie: 'none', shirt: '#8a94c8', pants: '#3a3a4a' }, dest: 'fulcrum', line: 'Fulcrum, please. Either door. I\'ll know which when I see the check.' },
          { id: 'fare_juice', archetype: 'a cleanse influencer', look: { skin: 2, hair: 'long', hairColor: '#7a5c3a', glasses: 'none', hat: 'none', extra: 'phone', tie: 'none', shirt: '#cfe8d8', pants: '#e8dcc8' }, dest: 'clarity_barn', line: 'The wellness barn. My doctor won\'t tell me where it is.' },
          { id: 'fare_live', archetype: 'a man who is live', look: { skin: 3, hair: 'short', hairColor: '#1a1a1a', glasses: 'none', hat: 'cap', extra: 'phone', tie: 'none', shirt: '#15e0ff', pants: '#1a1a1a', phoneVertical: true }, dest: 'any', line: 'Anywhere. I\'m live. Say hi. He says hi. Don\'t wave, it\'s vertical.' },
          { id: 'fare_board', archetype: 'an HOA board member', look: { skin: 1, hair: 'bun', hairColor: '#d8d8d8', glasses: 'round', hat: 'none', extra: 'lanyard', tie: 'none', shirt: '#f4ead8', pants: '#c8b89a' }, dest: 'hoa_hall', line: 'The HOA Hall, and you\'re doing nine in an eight. Noted.' },
          { id: 'fare_nephew', archetype: 'a donor\'s nephew', look: { skin: 1, hair: 'slick', hairColor: '#3a2a1a', glasses: 'none', hat: 'none', extra: 'phone', tie: 'gold', shirt: '#2b2b3a', pants: '#1a1a24' }, dest: 'heirloom_club', line: 'The club. Tell them I\'m with my uncle. My uncle is a hedge.' },
          { id: 'fare_freshman', archetype: 'the freshman', cast: 'freshman', dest: 'any', line: 'The library. I know there isn\'t one. Drive until there is.' },
          { id: 'fare_agent', archetype: 'an OVA agent, off duty', look: { skin: 5, hair: 'short', hairColor: '#111111', glasses: 'shades', hat: 'beret', extra: 'earpiece', tie: 'none', shirt: '#4c4c4c', pants: '#2b2b2b' }, dest: 'ova_hq', line: 'The balloon office. I\'m not going there. Take me there.' },
          { id: 'fare_lobbyist', archetype: 'a jet lobbyist', look: { skin: 2, hair: 'slick', hairColor: '#2a1a0a', glasses: 'aviator', hat: 'none', extra: 'flag_pin', tie: 'blue', shirt: '#2a3a6a', pants: '#1a2444' }, dest: 'bravadia_embassy', line: 'The embassy. We\'re close on the jets. We\'ve been close for eleven years.' },
          { id: 'fare_bagholder', archetype: 'a $PUNDIT holder', look: { skin: 3, hair: 'short', hairColor: '#c0392b', glasses: 'shades', hat: 'cap', extra: 'phone', tie: 'none', shirt: '#ff2d6f', pants: '#2a2f4a', checkingChart: true }, dest: 'moon_mine', line: 'The mining shed. I\'m not selling. I\'m checking it\'s still a shed.' },
          { id: 'fare_docent', archetype: 'a museum docent', look: { skin: 6, hair: 'bob', hairColor: '#4a3a2a', glasses: 'none', hat: 'none', extra: 'lanyard', tie: 'none', shirt: '#6e5a44', pants: '#3a3020' }, dest: 'museum_of_takes', line: 'The Museum of Takes. I curate the gift shop. The gift shop is the museum.' },
          { id: 'fare_ferry', archetype: 'a ferry passenger', look: { skin: 4, hair: 'short', hairColor: '#b58a3c', glasses: 'none', hat: 'beanie', extra: 'none', tie: 'none', shirt: '#eef1f4', pants: '#4a4a4a', luggage: true }, dest: 'ferry_terminal', line: 'The ferry. I\'ve missed it four times. It hasn\'t left. I\'m consistent.' },
          { id: 'fare_kip', archetype: 'Kip', cast: 'kip', dest: 'nap_depot', line: 'Anywhere with a coupon code. Is this fare paid?' }
        ],
        unlocks: [
          { fares: 10, flag: 'cab_livery', text: 'Every taxi in the city now wears the LOUD & CORRECT wrap. Fares +10%.', fareMul: 1.1, wrap: 'pod' },
          { fares: 25, flag: 'cab_home', text: 'A taxi is always parked at Gus\'s Garage.', parkedAt: 'pod_garage' },
          { fares: 50, flag: 'cab_legend', text: 'LOUD CAB DRIVER DELIVERS FIFTY PASSENGERS, ZERO MINDS', subs: 15000, ticker: 'LOUD CAB DRIVER DELIVERS FIFTY PASSENGERS, ZERO MINDS' }
        ],
        best: ['shiftFares', 'shiftMoney']
      },

      hoa_patrol: {
        id: 'hoa_patrol', name: 'HOA Patrol', banner: 'HOA PATROL', icon: 'hoa_star',
        start: { vehicles: ['cop', 'suv:hoa'], action: 'action', stopped: true, hoaSuv: { type: 'suv', tag: 'hoa', color: '#f4ead8', parkedAt: 'hoa_hall', after: 'm10_pellets' } },
        end: { action: 'action', stopped: true, noTarget: true },
        targetDistance: [120, 240], markerColor: '#c94040', flee: { brain: 'flee', cruise: 0.9 },
        violations: ['MAILBOX ADJACENT', 'LAWN LENGTH', 'PARKED WITH INTENT', 'UNAPPROVED COLOUR', 'HONKED ON A TUESDAY', 'TWO OPINIONS ON ONE BUMPER'],
        chip: 'VIOLATION: ',
        stop: { stopSpeed: 1, within: 6, hold: 2, wreckCounts: true },
        timer: { base: 90, perLevel: 30 },
        pay: { base: 150, perLevel: 50 }, nextLevelAfter: 4, maxLevel: 12,
        heat: { stop: 0, wreck: 'destroyVehicle' },
        endOn: { timeout: true, leftSeconds: 10, wreck: true },
        subsPerStop: 200,
        unlocks: [
          { level: 6, flag: 'hoa_vest', text: '$2,000 bonus. The HOA SUV at the Hall now carries a Firmness Vest.', money: 2000, pickup: { type: 'armor', in: 'hoa_suv', respawn: 'daily' } },
          { level: 12, flag: 'hoa_truce', text: 'The HOA has stood down. Their star is yours now. It never fills.', hudStar: 'cream', retires: 'hoa_enemy' }
        ],
        best: ['level']
      },

      sponsor_runs: {
        id: 'sponsor_runs', name: 'Sponsor Runs', banner: 'SPONSOR RUN', icon: 'van',
        start: { vehicle: { type: 'van', tag: 'sponsorvan', wrap: 'nap', color: '#2d5f8a', persistent: true, parkedAt: 'nap_depot', after: 'm02_read' }, enter: true },
        wrapText: 'NAP DYNASTY · CODE TAKES20',
        runs: 8, bannerFormat: 'SPONSOR RUN {n}/8',
        stops: ['clarity_barn', 'moon_mine', 'strip_gas', 'fish_shack', 'char_charter', 'airport_terminal', 'both_sides_port', 'heirloom_club'],
        timer: { min: 60, base: 20, perMetre: 1 / 9 },
        pay: { base: 250, perMetre: 0.5, perCrash: -20, min: 100, timeoutPaysMin: true },
        firmnessChip: ['FIRMNESS 7', 'FIRMNESS 9', 'FIRMNESS 11', 'FIRMNESS 13', 'FIRMNESS 15'],
        endOn: { leftSeconds: 15, wreck: true },
        fullRead: { bonus: 1000, chip: 'FULL READ' },
        subsPerRun: 150,
        unlocks: [
          { fullReads: 1, flag: 'sponsored_van', text: 'The pod van is wrapped in mattress: 320 hp. Sponsor Runs pay x1.5.', podvanHp: 320, payMul: 1.5 },
          { runs: 24, flag: 'pod3', text: 'Your face is on the van four times now.', subs: 10000, wrap: 'pod3' }
        ],
        best: ['chainRuns', 'chainMoney']
      },

      // §5.4 pink speech-bubble markers; the weapon is equipped with ammo for the job and restored afterwards
      rampages: [
        { id: 'rr_01', name: 'Alley Oop', at: lmk('impression_alley', 0, 12), weapon: 'tableleg', hecklers: 12, seconds: 90, reward: 400, waveSize: 4, waveRadius: 40 },
        { id: 'rr_02', name: 'Lawn Order', at: lmk('old_money_common', 12, 8), weapon: 'pistol', hecklers: 10, seconds: 90, reward: 500, waveSize: 4, waveRadius: 40 },
        { id: 'rr_03', name: 'Lot Talk', at: lmk('stadium', -20, 0), weapon: 'shotgun', hecklers: 15, seconds: 120, reward: 700, waveSize: 4, waveRadius: 40, note: 'the parking lots' },
        { id: 'rr_04', name: 'Pier Pressure', at: lmk('velvetine_pier', 0, 14), weapon: 'smg', hecklers: 20, seconds: 120, reward: 800, waveSize: 4, waveRadius: 40 },
        { id: 'rr_05', name: 'Board Meeting', at: lmk('hoa_hall', 10, -8), weapon: 'revolver', hecklers: 12, seconds: 100, reward: 700, waveSize: 4, waveRadius: 40 },
        { id: 'rr_06', name: 'Apron Strings', at: lmk('hangar_row', 14, 6), weapon: 'rifle', hecklers: 25, seconds: 150, reward: 1000, waveSize: 4, waveRadius: 40, note: 'the apron' },
        { id: 'rr_07', name: 'Tight Groups', at: lmk('container_yard', 12, 12), weapon: 'hotmic', hecklers: 16, seconds: 120, reward: 1000, waveSize: 4, waveRadius: 28, tight: true, note: 'the maze; waves of 4 in tight groups' },
        { id: 'rr_08', name: 'Well, Actually', at: lmk('old_money_common', 0, -10), weapon: 'ratio', hecklers: 12, seconds: 150, reward: 1500, waveSize: 2, waveRadius: 60, vehicles: { type: 'sedan', count: 6, hecklersEach: 2 }, destroyStyle: true, note: 'six sedans with two hecklers each; wrecks count' }
      ],
      rampageRules: { countdown: 3, card: 'RATIO RAMPAGE · {weapon} · {n} HECKLERS · {t} s', signs: ['WRONG', 'SOURCE?', 'L', 'NOTED', 'DIDN\'T READ'], wrongTakeChip: 'WRONG TAKE', markerReturnFail: 60, markerReturnReplay: 600, subsPerCompletion: 2000,
        allEight: { flag: 'rampage_king', text: 'Every reserve is one and a half times bigger. The ammo readout is pink now.', reserveMul: 1.5 } },

      // §5.5 fifty beige envelopes with a red RESPECTFULY stamp; offsets are metres from the landmark door; {x, z} are world metres
      memos: [
        { id: 'mm_01', at: lmk('campus_quad', 0, -14), where: 'under the ninth table', line: 'Table nine. No chair. Rate it a ten.' },
        { id: 'mm_02', at: lmk('dorm_studio', -6, 0), where: 'by the ON AIR wall', line: 'The mini-fridge is also on air.' },
        { id: 'mm_03', at: lmk('pod_garage', 10, -4), where: 'the respray bay\'s corner', line: 'Respray: $100 a star. Opinions: same price.' },
        { id: 'mm_04', at: { x: 104, z: 160 }, where: 'the centre of Minds Changed Court', line: 'Houses on this court: zero. Minds: same.' },
        { id: 'mm_05', at: lmk('tyn_tower', 0, -12), where: 'under the TYN sign', line: '24 hours. 0 days. Respectfuly.' },
        { id: 'mm_06', at: lmk('green_room', 12, 0), where: 'the last motel bay', line: 'Hour four. Bagels sponsored. Still waiting.' },
        { id: 'mm_07', at: lmk('impression_alley', 0, 18), where: 'between the losing billboards', line: 'This billboard is losing. It knows.' },
        { id: 'mm_08', at: lmk('goldplate_tower', -10, 10), where: 'under the roof sign\'s shadow', line: 'Helicopters counted: 2. \'Both.\'' },
        { id: 'mm_09', at: lmk('vault_bank', 8, -6), where: 'by the vault that is a hedge', line: 'We short what we love. We love you.' },
        { id: 'mm_10', at: lmk('hospital', 14, 4), where: 'the ambulance bay', line: 'Bandage coupon: TAKES20. Wound: a seven.' },
        { id: 'mm_11', at: { x: 424, z: 328, y: 7 }, where: 'on the Loop above the Chyron Ramp', line: 'On the Loop you are legally a party. This is the invitation.' },
        { id: 'mm_12', at: lmk('nap_depot', -14, -2), where: 'behind the showroom podium', line: 'The podium is a mattress. Sleep on it.' },
        { id: 'mm_13', at: lmk('listening_room', 6, -8), where: 'the alley by the velvet rope', line: 'Tonight: nothing. Doors at nine.' },
        { id: 'mm_14', at: lmk('strip_gas', 0, -10), where: 'between the pumps', line: 'Premium has a stance. Regular has a podcast.' },
        { id: 'mm_15', at: lmk('both_sides_strip', -10, -24), where: 'behind cutout six at the far end of the range lane', line: 'Cutout six did the reading.' },
        { id: 'mm_16', at: lmk('capitol_dome', 0, -16), where: 'on the leased steps', line: 'The dome is leased. The steps are a ten.' },
        { id: 'mm_17', at: lmk('fulcrum', 10, 0), where: 'outside the second door', line: 'Door two. Same checkbook.' },
        { id: 'mm_18', at: lmk('char_charter', -8, 6), where: 'by the Bronze salad bin', line: 'The salad is Bronze. The bin is Gold.' },
        { id: 'mm_19', at: lmk('ova_hq', 12, -4), where: 'under antenna thirteen', line: 'Antenna thirteen is for weather. Thirteen is a lot of weather.' },
        { id: 'mm_20', at: lmk('protest_plaza', 0, 12), where: 'the gift shop\'s back step', line: 'Today\'s cause: this envelope. Mugs unchanged.' },
        { id: 'mm_21', at: lmk('stadium', 0, 30), where: 'where the second name ends', line: 'Goldplate Goldplate. The second one is for emphasis.' },
        { id: 'mm_22', at: lmk('goldplate_links', -20, 40), where: 'in the bunker on hole five', line: 'Par ten. This was a six. Rated a ten.' },
        { id: 'mm_23', at: lmk('vaultwright_manor', 20, 10), where: 'the centre of the hedge maze', line: 'You have reached the centre of the hedge. It is also a hedge.' },
        { id: 'mm_24', at: lmk('bridge_main', 0, 6), where: 'under the deck, the dead drop', line: 'Dead drop #1. Contents: ad copy. Respectfuly.' },
        { id: 'mm_25', at: { x: 604, z: 90 }, where: 'the ribbon on the sand at the east end of Ribbon Cutting Road', line: 'Ribbon never cut. Rated a ten in advance.' },
        { id: 'mm_26', at: lmk('hoa_hall', -12, -6), where: 'by the violated mailbox', line: 'Mailbox violation: it was adjacent. One star.' },
        { id: 'mm_27', at: lmk('clarity_barn', 14, 0), where: 'under the loft door', line: 'Clarity Pellets: now with barn.' },
        { id: 'mm_28', at: lmk('moon_mine', -8, 8), where: 'by the space heater that is thirty GPUs', line: '$PUNDIT: trustless. Shed: warm.' },
        { id: 'mm_29', at: lmk('culdesac_gas', 10, -8), where: 'behind the approved pump', line: 'The HOA approved the pump. Not the price. Not this memo.' },
        { id: 'mm_30', at: lmk('warehouse_42', -10, 10), where: 'crate 42', line: 'Crate 42 of 42: mystery. Still charting.' },
        { id: 'mm_31', at: lmk('memo_press', 0, 20), where: 'the loading dock', line: '4,000 copies printed. Nobody placed the order. You did.' },
        { id: 'mm_32', at: lmk('balloon_depot', 20, 0), where: 'van forty of forty', line: 'Van 40/40. Balloons repaired: 0.' },
        { id: 'mm_33', at: { x: 40, z: 376 }, where: 'the corner of Printworks Parade and Balloon Repair Alley', line: 'Corner of nothing and weather.' },
        { id: 'mm_34', at: lmk('velvetine_pier', 4, 30), where: 'the end of the pier', line: 'You can hear the party from here. There is no party.' },
        { id: 'mm_35', at: lmk('afterparty_yacht', 20, 26), where: 'the yacht\'s gangway', line: 'Never sailed. Dress code: a vibe.' },
        { id: 'mm_36', at: lmk('fish_shack', -8, 4), where: 'by the reheating window', line: 'Takes reheated hourly. This one\'s warm.' },
        { id: 'mm_37', at: { x: 334, z: 522 }, where: 'under the Sponsor Span\'s north toll gantry', line: 'Toll: one opinion. Keep the change.' },
        { id: 'mm_38', at: lmk('airport_terminal', 0, -20), where: 'the baggage carousel', line: 'Baggage claim: your take has arrived. It was on the bus.' },
        { id: 'mm_39', at: { landmark: 'airport_runway', point: 'west' }, where: 'on the painted 10', line: 'Runway 10. Also runway 10. Both tens.' },
        { id: 'mm_40', at: lmk('control_tower', 0, -6), where: 'the tower\'s base', line: 'Tower: clouds rated. Planes: none.' },
        { id: 'mm_41', at: lmk('hangar_row', -10, 12), where: 'under the cutout\'s wing', line: 'Hangar 1 of 1. Jet 0 of 1.' },
        { id: 'mm_42', at: { x: 260, z: 760 }, where: 'Plane Spotters\' Park bench', line: 'Planes spotted: 0. Memos spotted: 1.' },
        { id: 'mm_43', at: lmk('container_yard', 30, 30), where: 'the maze\'s centre stack', line: 'This container is MERCH. So is that one.' },
        { id: 'mm_44', at: lmk('manifest_quay', 20, 40), where: 'the ship\'s gangway', line: 'The Manifest: cargo moved, 0. Listening, yes.' },
        { id: 'mm_45', at: lmk('ferry_terminal', 0, 90), where: 'the end of the ferry pier', line: 'Next ferry: soon. Soon is a vibe.' },
        { id: 'mm_46', at: lmk('customs_shed', -12, 10), where: 'the declared pile', line: 'Declared: everything. Disclosed: code TAKES20.' },
        { id: 'mm_47', at: lmk('museum_of_takes', 2, -20), where: 'the statue\'s plinth on the plaza strip', line: 'THE FIRST TAKE (attributed). Attributed to you.' },
        { id: 'mm_48', at: lmk('heirloom_club', 0, -4), where: 'behind the velvet rope at the door', line: 'Members since before opinions. Opinions since Tuesday.' },
        { id: 'mm_49', at: lmk('old_money_common', 16, 0), where: 'on the bandstand', line: 'Bandstand. Bands: 0. Stands: 1.' },
        { id: 'mm_50', at: lmk('causeway_east', 12, 0), where: 'under the NO plaque at the uptown abutment', line: 'Goldplate Goldplate Causeway. Uptown says NO. Respectfuly.' }
      ],
      memoRules: {
        pickupType: 'memo', stamp: 'RESPECTFULY', glowRange: 40, onMinimap: false, subsPerMemo: 400, phoneLabel: 'MEMOS {n}/50', perDistrictAfter: 25,
        thresholds: [
          { count: 10, text: 'Ten memos. A table leg, and $500.', weapon: 'tableleg', money: 500 },
          { count: 20, text: 'Twenty memos. A Firmness Vest, and one in the van every day.', armor: 100, pickup: { id: 'firmness_vest', in: 'podvan', respawn: 'daily' } },
          { count: 30, text: 'Thirty memos. Both Sides Arms knocks 15% off. For a journalist.', flag: 'memo_discount', discount: 0.15 },
          { count: 40, text: 'Forty memos. The Ratio Launcher, and ten rockets.', weapon: 'ratio', ammo: 10, flag: 'memos40' },
          { count: 50, text: '$10,000, twenty thousand subscribers, and the Memo\'s last page.', money: 10000, subs: 20000, card: 'Takesworth found all the memos. Is this paid?', ticker: 'PUNDIT FINDS FIFTY MEMOS; EVERY ONE IS THE SAME MEMO' }
        ]
      },

      // §5.6 three races; checkpoints are 8 m rings, in order; `start` is the line-up point and heading
      races: [
        { id: 'lr_01', name: 'The Upper Loop', laps: 1, racers: 3, prizes: [1000, 400, 200], unlockedBy: null,
          start: { x: 424, z: 328, y: 7, heading: 'n' },
          checkpoints: [{ x: 424, z: 136, y: 7, name: 'NE corner' }, { x: 304, z: 136, y: 7, name: 'N mid' }, { x: 184, z: 136, y: 7, name: 'NW corner' }, { x: 184, z: 256, y: 7, name: 'W mid' },
            { x: 184, z: 376, y: 7, name: 'SW corner' }, { x: 304, z: 376, y: 7, name: 'S mid' }, { x: 424, z: 376, y: 7, name: 'SE corner' }, { x: 424, z: 256, y: 7, name: 'E mid' }] },
        { id: 'lr_02', name: 'The Lower Loop', laps: 1, racers: 3, prizes: [2000, 800, 400], unlockedBy: { race: 'lr_01', finish: true },
          start: { x: 376, z: 664, y: 7, heading: 'w' },
          checkpoints: [{ x: 184, z: 664, y: 7, name: 'SW corner' }, { x: 184, z: 520, y: 7, name: 'W mid (over the bay)' }, { x: 184, z: 376, y: 7, name: 'NW corner (the shared leg)' }, { x: 304, z: 376, y: 7, name: 'N mid' },
            { x: 424, z: 376, y: 7, name: 'NE corner' }, { x: 424, z: 520, y: 7, name: 'E mid (over the bay)' }, { x: 424, z: 664, y: 7, name: 'SE corner' }, { x: 304, z: 664, y: 7, name: 'S mid' }] },
        { id: 'lr_03', name: 'The Figure Eight', laps: 2, racers: 3, prizes: [4000, 1500, 700], unlockedBy: { race: 'lr_02', win: true },
          start: { landmark: 'heirloom_club', offset: { x: 0, z: 10 }, heading: 'w' },
          checkpoints: [
            { x: 736, z: 280, name: 'Inheritance Avenue' }, { x: 672, z: 280, name: 'Provenance Place' },
            { x: 632, z: 280, name: 'Goldplate Goldplate Causeway' }, { x: 560, z: 280, name: 'Goldplate Goldplate Avenue' },
            { x: 492, z: 280, name: 'Goldplate Goldplate Bridge' }, { x: 400, z: 280, name: 'Goldplate Avenue' },
            { x: 376, z: 328, name: 'Ratio Row at Chyron Crossing' }, { x: 396, z: 328, name: 'Chyron Ramp' }, { x: 424, z: 328, y: 7, name: 'onto the Loop' },
            { x: 424, z: 136, y: 7, name: 'upper NE' }, { x: 304, z: 136, y: 7, name: 'upper N' }, { x: 184, z: 136, y: 7, name: 'upper NW' }, { x: 184, z: 256, y: 7, name: 'upper W' },
            { x: 184, z: 376, y: 7, name: 'the shared leg, west end' }, { x: 304, z: 376, y: 7, name: 'the crossing' }, { x: 424, z: 376, y: 7, name: 'the shared leg, east end' },
            { x: 424, z: 520, y: 7, name: 'lower E (over the bay)' }, { x: 424, z: 664, y: 7, name: 'lower SE' }, { x: 304, z: 664, y: 7, name: 'lower S' }, { x: 184, z: 664, y: 7, name: 'lower SW' },
            { x: 184, z: 520, y: 7, name: 'lower W (over the bay)' }, { x: 184, z: 376, y: 7, name: 'the shared leg again' }, { x: 304, z: 376, y: 7, name: 'the crossing again' }, { x: 424, z: 376, y: 7, name: 'east end again' },
            { x: 424, z: 520, y: 7, name: 'south on the east leg' }, { x: 424, z: 664, y: 7, name: 'lower SE again' }, { x: 376, z: 664, y: 7, name: 'above Arrivals Ramp' },
            { x: 376, z: 700, name: 'down Arrivals Ramp' }, { x: 376, z: 728, name: 'Gate Ten Street at Lost Luggage Lane' },
            { x: 480, z: 728, name: 'Container Crescent' }, { x: 600, z: 728, name: 'Container Crescent, the yard' }, { x: 728, z: 728, name: 'Trust Fund Terrace' },
            { x: 728, z: 600, name: 'Trust Fund Terrace north' }, { x: 728, z: 440, name: 'into Heirloom Heights' }, { x: 728, z: 280, name: 'Inheritance Avenue again' },
            { landmark: 'heirloom_club', offset: { x: 0, z: 10 }, name: 'the finish at the club' }
          ],
          note: 'Departures Drive and Manifest Road are severed at ground level by the Manifest Ramp; the z = 182 row is the only ground route from the airport into the port' }
      ],
      raceRules: { checkpointRadius: 8, startHold: 1, countdown: 3, racerCar: 'sports', racerBrain: 'racer', racerSpeed: 0.95, rubberBand: 0.08, dnfLeftSeconds: 8, markerColor: '#ffd400',
        subsFirstWin: 5000, subsRepeat: 500, allThree: { flag: 'race_car', text: 'THE RATIO is parked at the garage. SLOW IS A TAKE.', car: { type: 'sports', wrap: 'ratio', color: '#ff3fa4', doors: 'SLOW IS A TAKE', parkedAt: 'pod_garage' } } },

      // §5.7 ten striped wedges; positions are authoritative in Content.world.stuntRamps / World.stuntRamps (same ids)
      stunts: [
        { id: 'sj_01', name: 'The Quad Hop', ramp: 'sj_01', where: 'Founders\' Quad, heading north over the LOUD & CORRECT sign', landing: 'the Quad\'s north path', minAir: 1.0, reward: 500 },
        { id: 'sj_02', name: 'Lower Third Leap', ramp: 'sj_02', where: 'the downtown promenade, heading south', landing: 'the promenade 30 m south', minAir: 1.0, reward: 500 },
        { id: 'sj_03', name: 'Assembly Required', ramp: 'sj_03', where: 'the Loop\'s north leg above Perpetual Assembly Plaza, heading north off the deck', landing: 'Perpetual Assembly Plaza', minAir: 1.6, reward: 500 },
        { id: 'sj_04', name: 'Par Ten', ramp: 'sj_04', where: 'Clubhouse Drive, heading south over the bunker', landing: 'the fairway of hole 3', minAir: 1.0, reward: 500 },
        { id: 'sj_05', name: 'Hedge Fund', ramp: 'sj_05', where: 'the Vaultwright lawn, heading south along the hedge maze', landing: 'the south lawn past the maze', minAir: 1.2, reward: 500 },
        { id: 'sj_06', name: 'Span Skip', ramp: 'sj_06', where: 'the Sponsor Span\'s south end, heading south over the toll gantry', landing: 'Arrivals Avenue', minAir: 1.0, reward: 500 },
        { id: 'sj_07', name: 'Runway 10/10', ramp: 'sj_07', where: 'the runway\'s west threshold, heading west', landing: 'the beach west of the threshold', minAir: 1.0, reward: 500 },
        { id: 'sj_08', name: 'Hangar Hop', ramp: 'sj_08', where: 'inside Hangar Row\'s lot, over the cutout jet', landing: 'the hangar apron', minAir: 1.0, reward: 500 },
        { id: 'sj_09', name: 'Container Clear', ramp: 'sj_09', where: 'the container maze, heading north over a single-high row', landing: 'the next lane', minAir: 1.0, reward: 500 },
        { id: 'sj_10', name: 'Well, Actually', ramp: 'sj_10', where: 'Stoop Speech Street, heading south over the Common\'s fountain', landing: 'the lawn past the bandstand', minAir: 1.2, reward: 500 }
      ],
      stuntRules: { landingRadius: 14, slowmoAfter: 0.6, slowmoScale: 0.35, slowmoMax: 2.2, sideCam: { yaw: 70, dist: 9, height: 2.5, fov: 55 }, goodCard: 'STUNT PUNDIT: {name}', badCard: 'CONTEXT STAMPED', subsPerStunt: 1000,
        allTen: { money: 5000, subs: 10000, flag: 'stunt_pundit', ticker: 'PUNDIT LANDS TEN JUMPS; MINDS STILL AIRBORNE' } }
    },

    // §5.8 the meta counter and its perks (tier 0 is the base; five earned tiers)
    subscriberTiers: [
      { tier: 0, subs: 0, name: 'Pre-Viral', perk: null, perkText: 'Nobody is listening. Keep talking.' },
      { tier: 1, subs: 5000, name: 'A Voice', perk: 'group_rate', perkText: 'Taxi fares and Sponsor Runs pay +25%.', effects: { fareMul: 1.25, sponsorMul: 1.25 } },
      { tier: 2, subs: 25000, name: 'Verified-ish', perk: 'comped_respray', perkText: 'Pay-and-spray costs $50 a star.', effects: { resprayCost: 50 } },
      { tier: 3, subs: 75000, name: 'Main Character', perk: 'sponsor_discount', perkText: '25% off at Both Sides Arms. The hospital keeps its hands off your weapons.', effects: { shopDiscount: 0.25, keepWeaponsOnDeath: true } },
      { tier: 4, subs: 150000, name: 'Pundit-Industrial', perk: 'plot_armor', perkText: 'Respawn with 50 armor. Cops miss 15% more.', effects: { respawnArmor: 50, copAccuracyDelta: -0.15 } },
      { tier: 5, subs: 300000, name: 'The Memo', perk: 'infinite_sidebar', perkText: 'The pistol reloads from nothing. The Quad\'s tables turn gold.', effects: { pistolInfiniteReserve: true, goldTables: true } }
    ],
    subscriberSources: { missionRewardMul: 5, fare: 150, hoaStop: 200, sponsorRun: 150, memo: 400, rampage: 2000, raceFirstWin: 5000, stunt: 1000,
      chaos: { wantedStar: 25, propKnocked: 10, vehicleWrecked: 40, honkBark: 5, capPerMinute: 500 }, hudLabel: 'SUBS', tierCard: 'NEW TIER: {name}' },

    // ================================================================== §2.4 shop ==
    shop: {
      name: 'Both Sides Arms', slogan: 'We arm both sides. That\'s balance.',
      stores: ['both_sides_strip', 'both_sides_port', 'both_sides_uptown'],
      clerk: 'merle', markerColor: '#3fd27f', openHold: 0.5,
      tabs: ['WEAPONS', 'AMMO', 'GEAR'], flagshipTab: 'RANGE',
      statBars: ['DAMAGE', 'RATE', 'RANGE', 'ACCURACY', 'VOLUME'],
      lockFormat: 'Unlocks after: {mission}',
      discounts: { memo_discount: 0.15, sponsor_discount: 0.25, cap: 0.4 },
      // Combat.shop.discount() adds this to its own hook: Monday Memos (flag memo_discount) and subscriber tier 3 (flag
      // sponsor_discount or the tier itself); Combat clamps the total at 40%
      discount: function (p) {
        var d = 0, f = (GTP.Missions && GTP.Missions.state && GTP.Missions.state.flags) || {};
        if (f.memo_discount) d += 0.15;
        var tier = p && typeof p.subTier === 'number' ? p.subTier : (p && typeof p.subs === 'number' ? X.subscriberTier(p.subs).tier : 0);
        if (f.sponsor_discount || tier >= 3) d += 0.25;
        return Math.min(0.4, d);
      },
      items: [
        // WEAPONS (merged by id into Combat's list: price, unlock mission, Merle's pitch)
        { id: 'tableleg', tab: 'weapons', weapon: 'tableleg', price: 150, name: 'Folding Table Leg', unlock: 'm03b_range', pitch: 'It fell off the table. The honest weapon. Four fifty. For a journalist, one fifty.' },
        { id: 'megaphone', tab: 'weapons', weapon: 'megaphone', price: 300, name: 'Megaphone', unlock: 'm03_ratio', pitch: 'Louder is a position. Three hundred. For a journalist, three hundred.' },
        { id: 'pistol', tab: 'weapons', weapon: 'pistol', price: 450, name: 'Pistol', unlock: 'm03b_range', pitch: 'Four fifty. For a journalist, four hundred. Four fifty.' },
        { id: 'revolver', tab: 'weapons', weapon: 'revolver', price: 900, name: 'The Rebuttal', unlock: 'm05b_provenance', pitch: 'Six rebuttals, then a long pause. The pause is also a rebuttal.' },
        { id: 'smg', tab: 'weapons', weapon: 'smg', price: 1400, name: 'SMG', unlock: 'm11_trustless', pitch: 'Volume. That\'s the pitch. That\'s the whole pitch.' },
        { id: 'rifle', tab: 'weapons', weapon: 'rifle', price: 2400, name: 'The Monologue', unlock: 'm08b_jets', pitch: 'It doesn\'t stop until you do. Neither do you. Twenty-four hundred.' },
        { id: 'shotgun', tab: 'weapons', weapon: 'shotgun', price: 1100, name: 'Shotgun', unlock: 'm11_trustless', pitch: 'Everyone in the front row gets an opinion at once.' },
        { id: 'sniper', tab: 'weapons', weapon: 'sniper', price: 4500, name: 'The Fact Checker', unlock: 'm12b_scope', pitch: 'Reads at two hundred metres. Nobody else here reads at all.' },
        { id: 'hottake', tab: 'weapons', weapon: 'hottake', price: 90, name: 'Hot Take', unlock: 'm09_balloon', pitch: 'Three to a box. Still warm. Don\'t ask what\'s in them.' },
        { id: 'hotmic', tab: 'weapons', weapon: 'hotmic', price: 120, name: 'Hot Mic', unlock: 'm09b_hotmic', pitch: 'It was on the whole time. Throw it. Everyone holds it.' },
        { id: 'ratio', tab: 'weapons', weapon: 'ratio', price: 7500, name: 'Ratio Launcher', unlock: 'm13_thursday', pitch: 'Seventy-five hundred. For a journalist, seventy-five hundred. Ask about our loaner. There is no loaner.' },
        // AMMO
        { id: 'ammo_pistol', tab: 'ammo', weapon: 'pistol', rounds: 24, price: 60, name: 'Pistol rounds (24)', pitch: 'Twenty-four points. Make them.' },
        { id: 'ammo_revolver', tab: 'ammo', weapon: 'revolver', rounds: 12, price: 90, name: 'Rebuttal rounds (12)', pitch: 'A dozen rebuttals. Pace yourself.' },
        { id: 'ammo_smg', tab: 'ammo', weapon: 'smg', rounds: 60, price: 150, name: 'SMG rounds (60)', pitch: 'Sixty. You\'ll be back for sixty more.' },
        { id: 'ammo_rifle', tab: 'ammo', weapon: 'rifle', rounds: 60, price: 220, name: 'Monologue rounds (60)', pitch: 'Sixty words. The Monologue says them fast.' },
        { id: 'ammo_shotgun', tab: 'ammo', weapon: 'shotgun', rounds: 12, price: 120, name: 'Shells (12)', pitch: 'Twelve shells. Each one is a front row.' },
        { id: 'ammo_sniper', tab: 'ammo', weapon: 'sniper', rounds: 5, price: 250, name: 'Fact Checker rounds (5)', pitch: 'Five citations. Cite carefully.' },
        { id: 'ammo_hottake', tab: 'ammo', weapon: 'hottake', rounds: 3, price: 90, name: 'Hot Takes (3)', pitch: 'Three. They don\'t keep.' },
        { id: 'ammo_hotmic', tab: 'ammo', weapon: 'hotmic', rounds: 4, price: 400, name: 'Hot Mics (4)', pitch: 'Four mics. All of them are on.' },
        { id: 'ammo_ratio', tab: 'ammo', weapon: 'ratio', rounds: 1, price: 600, name: 'Rocket (1)', pitch: 'One token. Non-refundable. Trustless.' },
        { id: 'ammo_megaphone', tab: 'ammo', weapon: 'megaphone', rounds: 20, price: 40, name: 'Megaphone charges (20)', pitch: 'Twenty more things to say loudly.' },
        // GEAR
        { id: 'clarity_pellets', tab: 'gear', price: 150, hp: 50, name: 'Clarity Pellets', pitch: 'Your doctor won\'t sell you these. I will.' },
        { id: 'clarity_family', tab: 'gear', price: 400, hp: 'full', name: 'Clarity Pellets, Family Size', pitch: 'The family is you, four times.' },
        { id: 'firmness_vest', tab: 'gear', price: 500, armor: 100, name: 'Nap Dynasty Firmness Vest', pitch: 'Firmness level nine. Code VEST20 does nothing.' },
        { id: 'range_reset', tab: 'range', price: 50, flagship: true, name: 'Range reset', pitch: 'Six hecklers, sixty seconds. They still don\'t sue.' }
      ],
      // Merle after a sale, a refusal, and at the door
      barks: {
        sale: ['Sold. To both sides, eventually.', 'That\'s balance. Receipt\'s on the wall.', 'For a journalist, same price. Enjoy.', 'Loyalty points: one. Nobody\'s qualified yet.', 'Comes with a spare. The spare is also for sale.'],
        funds: ['That\'s the price. For a journalist, that\'s the price.', 'Come back with a sponsor.', 'I take cash and coupon codes. Not that code.'],
        locked: ['Not yet. Story\'s not there yet.', 'That one\'s behind glass until the news catches up.'],
        door: ['Both Sides Arms. Which side?', 'Ask about the loaner. There is no loaner.', 'We arm both sides. That\'s balance.'],
        range: ['Six hecklers out back. Cardboard. They don\'t sue.', 'The head\'s where the take is.']
      }
    },

    // ================================================================= §6.6 hints ==
    hints: [
      { id: 'h_move', when: 'the opening cutscene ends', text: 'WASD or the left stick moves. Shift runs. Space jumps.', glyphs: { keyboard: ['W', 'A', 'S', 'D', 'Shift', 'Space'], gamepad: ['LS', 'B', 'A'], touch: ['Stick', 'Jump'] } },
      { id: 'h_look', when: '3 s after h_move with no look input', text: 'Move the mouse or the right stick to look. Click the game to lock the pointer.', glyphs: { keyboard: ['Mouse'], gamepad: ['RS'], touch: ['Drag'] } },
      { id: 'h_enter', when: 'first time within 3 m of a vehicle on foot', text: 'F or Enter gets in. The same key gets out.', glyphs: { keyboard: ['F', 'Enter'], gamepad: ['Y'], touch: ['Enter'] } },
      { id: 'h_drive', when: 'first time in the driver\'s seat', text: 'W goes, S brakes and reverses, Space is the handbrake. Hold it for a slide.', glyphs: { keyboard: ['W', 'S', 'Space'], gamepad: ['LS', 'A'], touch: ['Stick', 'Jump'] } },
      { id: 'h_arrow', when: 'first drive_to objective', text: 'The arrow on the minimap and the top of the screen points at the objective. The Loop is the fast way across town.', glyphs: { keyboard: [], gamepad: [], touch: [] } },
      { id: 'h_aim', when: 'first time holding a gun', text: 'Hold the right mouse button (or Q) to aim. Tab switches targets. Head shots count double.', glyphs: { keyboard: ['RMB', 'Q', 'Tab'], gamepad: ['LT', 'R3'], touch: ['Aim'] } },
      { id: 'h_reload', when: 'first time the magazine is under a third', text: 'R reloads. An empty magazine reloads itself.', glyphs: { keyboard: ['R'], gamepad: ['X'], touch: ['Weapon'] } },
      { id: 'h_wheel', when: 'first time owning three or more weapons', text: 'Hold Tab (no gun raised) for the weapon wheel. The wheel or [ ] cycles.', glyphs: { keyboard: ['Tab', '[', ']'], gamepad: ['R3', 'LB', 'RB'], touch: ['Weapon (hold)'] } },
      { id: 'h_wanted', when: 'first wanted star', text: 'You\'re wanted. Break line of sight and the star fades. Gus\'s Garage resprays it for $100.', glyphs: { keyboard: [], gamepad: [], touch: [] } },
      { id: 'h_bust', when: 'first time a cop is within 8 m on foot at 1+ stars', text: 'Cops on foot can bust you in a few seconds. Get in a car or run.', glyphs: { keyboard: ['Shift'], gamepad: ['B'], touch: ['Stick'] } },
      { id: 'h_shop', when: 'first time within 30 m of a Both Sides Arms marker', text: 'Green light: a shop. Stand in it to buy weapons, ammo, Clarity Pellets and the Firmness Vest.', glyphs: { keyboard: [], gamepad: [], touch: [] } },
      { id: 'h_taxi', when: 'first time in a taxi', text: 'Press E while stopped to start taking fares.', glyphs: { keyboard: ['E'], gamepad: ['Y'], touch: ['Enter'] } },
      { id: 'h_patrol', when: 'first time in a cop car or the HOA SUV after m10_pellets', text: 'Press E while stopped to start an HOA patrol.', glyphs: { keyboard: ['E'], gamepad: ['Y'], touch: ['Enter'] } },
      { id: 'h_map', when: 'first time the player is more than 250 m from the objective', text: 'M opens the map. Click anywhere to set a waypoint.', glyphs: { keyboard: ['M'], gamepad: ['Back'], touch: ['Map'] } },
      { id: 'h_save', when: 'first time entering the pod van at the garage after m01_van', text: 'The pod van is home. Sitting in it here saves the game.', glyphs: { keyboard: [], gamepad: [], touch: [] } }
    ],
    hintRules: { seconds: 6, gapSeconds: 2, flagPrefix: 'hint_', neverIn: ['cutscene', 'minigame'], setting: 'hints' },

    // ============================================================ §6.1 loading tips ==
    loadingTips: [
      'Hold Aim and press Tab to switch targets. The head is where the take is.',
      'On the Loop you are legally a party. On the Lower Loop you are legally a layover.',
      'Gus\'s Garage resprays stars for $100 each. Opinions are the same price.',
      'A star fades if nobody is looking at you. Try an alley. Try a hedge. The hedge is also a hedge.',
      'Both Sides Arms sells to both sides. That\'s balance. Bring money.',
      'Clarity Pellets heal 50. Your doctor won\'t tell you that. Merle will.',
      'Every mission objective is a checkpoint. Failing sends you back, not home.',
      'The weather balloons have sirens. The sirens have a liaison.',
      'Press M for the map. Click anywhere to set a waypoint. The arrow is not a journalist either.',
      'The pod van at the garage is home. Sitting in it saves the game. Also it is a van.',
      'Hot mics go off. Everyone holds them. Don\'t hold it.',
      'The Fact Checker reads at 200 metres. Hold Aim to scope, roll the wheel to zoom, breathe.',
      'Taxis take fares. Press E in one. Passengers tip for not crashing, which is rare here.',
      'Fifty Monday Memos are hidden in the city. Every one is the same memo.',
      'A Ratio Launcher rocket is a token. The warranty is also a token.',
      'The HOA has its own wanted stars. They do not apply to you unless they do.',
      'Drive-by: hold Aim in the driver\'s seat with a pistol, revolver, SMG or shotgun. The window counts as a stance.',
      'Stunt ramps are striped. Airtime over one second is a take. Landing is optional.',
      'Press Tab with no gun raised to open the weapon wheel. The world slows down. It does not stop.',
      'Minds changed so far: zero. The counter is on the stats page. It has never moved.'
    ],
    loadingStages: [
      { id: 'textures', label: 'Generating the discourse', bar: [0, 0.10] },
      { id: 'tiles', label: 'Paving Grievance City', bar: [0.10, 0.25] },
      { id: 'roads', label: 'Painting lanes, elevating the Loop', bar: [0.25, 0.35] },
      { id: 'landmarks', label: 'Renaming things after the President', bar: [0.35, 0.50] },
      { id: 'props', label: 'Setting up folding tables', bar: [0.50, 0.60] },
      { id: 'minimap', label: 'Drawing the map from memory', bar: [0.60, 0.70] },
      { id: 'chunks', label: 'Building the nine chunks around the spawn', bar: [0.70, 0.95] },
      { id: 'warmup', label: 'Booking guests', bar: [0.95, 1.0] }
    ],

    // ================================================== §2 weapon names and flavor ==
    weapons: {
      fist: { name: 'Fists', flavor: 'Two of them. Both wrong, loudly.' },
      tableleg: { name: 'Folding Table Leg', flavor: 'It fell off the table. The honest weapon. Hit twice fast and the table flips.' },
      megaphone: { name: 'Megaphone', flavor: 'Pushes people. Raises heat. The audience grows either way.' },
      pistol: { name: 'Pistol', flavor: 'For the hedge. Twelve points, then a pause for questions.' },
      revolver: { name: 'The Rebuttal', flavor: 'Six big answers and a long reload. A body hit sits the heckler down.' },
      smg: { name: 'SMG', flavor: 'Volume is policy. Thirty rounds of it, out of a car window if you like.' },
      rifle: { name: 'The Monologue', flavor: 'Full auto at sixty metres. The first three rounds are the point; the rest is the monologue.' },
      shotgun: { name: 'Shotgun', flavor: 'Six pellets, one front row. Reloads shell by shell, like a slow clap.' },
      sniper: { name: 'The Fact Checker', flavor: 'Scoped, two hundred metres, one citation per trigger. Breathe.' },
      hottake: { name: 'Hot Take', flavor: 'Lobbed. Stuns for five metres. Still warm.' },
      hotmic: { name: 'Hot Mic', flavor: 'A two-and-a-half-second fuse. It was on the whole time. Throw it, then step back.' },
      ratio: { name: 'Ratio Launcher', flavor: 'One rocket, eight metres of ratio, a backblast you stand in front of exactly once.' }
    },

    // ================================================================== §8 radio ==
    radio: {
      ticker: [
        'GOLDPLATE INTERNATIONAL RATED A TEN BY GOLDPLATE; FLIGHT COUNT HOLDS AT ONE',
        'RUNWAY NUMBERED 10 AT BOTH ENDS; PILOTS CONFUSED, PRESIDENT CLEAR',
        'FERRY TO ELSEWHERE DELAYED; ELSEWHERE UNAVAILABLE FOR COMMENT',
        'CONTAINER YARD DECLARES EVERYTHING MERCH; CUSTOMS DISCLOSES COUPON CODE',
        'MUSEUM OF TAKES ACQUIRES FOLDING TABLE; PROVENANCE IS A PODCAST',
        'HEIRLOOM CLUB ADMITS FIRST NEW MEMBER SINCE FOUNDING; MEMBER IS A HEDGE',
        'OLD MONEY SAYS NO TO CAUSEWAY NAME; PRESIDENT ADDS THIRD GOLDPLATE',
        'BOTH SIDES ARMS OPENS THIRD BRANCH; BOTH SIDES NOW ARMED, BALANCED',
        'LOWER LOOP OPENS; DRIVERS LEGALLY A LAYOVER',
        'SPONSOR SPAN TOLL SET AT ONE OPINION; TRAFFIC DOUBLES',
        'JET ARRIVES ON TRUCK, IN PROFILE; BRAVADIA DECLARES LIFT',
        'CRANES ON MANIFEST QUAY MOVE ZERO CARGO; LISTENING SESSION RATED A TEN'
      ],
      barks: [
        { district: 'airport', text: 'My gate changed when I got to it. The new gate is this one. It changed again.' },
        { district: 'airport', text: 'One flight a day. It\'s delayed. It\'s rated a ten.' },
        { district: 'airport', text: 'I spotted a plane once. It was a truck.' },
        { district: 'port', text: 'Every container says MERCH. I opened one. Merch.' },
        { district: 'port', text: 'The ferry hasn\'t left since I was hired. I was hired to announce it.' },
        { district: 'port', text: 'Three cranes, one ship, no cargo. Best job in the city.' },
        { district: 'uptown', text: 'We\'ve had the same opinion since the founding. We had it framed.' },
        { district: 'uptown', text: 'The museum has a take under glass. I donated the glass.' },
        { district: 'uptown', text: 'The causeway name is a NO from us. The plaque cost more than the causeway.' },
        { role: 'doorman', landmark: 'heirloom_club', text: 'Members only. Who was your grandfather listening with?' }
      ],
      ads: [
        { station: 'pennant_fm', text: 'Goldplate International. One runway, two tens. Now boarding: a ten.' },
        { station: 'pennant_fm', text: 'The Goldplate Goldplate Causeway. Free. Uptown pays in NO.' },
        { station: 'velvetine_888', text: 'The Ferry to Elsewhere. Departs hourly. Arrives when the vibe is right.' },
        { station: 'velvetine_888', text: 'Manifest Quay listening sessions. The ship is the venue. The playlist is forty minutes of the intro.' },
        { station: 'quiet_signal', text: 'Customs & Disclosures. Everything has been declared. Nothing has been disclosed. A code has been issued.' },
        { station: 'quiet_signal', text: 'Both Sides Arms. A side has been armed. The other side has been armed. Balance has been achieved.' }
      ]
    },

    // ============================================================ §1.2 / §8.4 streets ==
    streets: [
      { id: 'sponsor_span', name: 'Sponsor Span', kind: 'avenue', district: 'marina', note: 'Lower Third Street crosses the bay; tolled per opinion' },
      { id: 'goldplate_goldplate_causeway', name: 'Goldplate Goldplate Causeway', kind: 'avenue', district: 'uptown', note: 'the island end is gold; the uptown end says NO' },
      { id: 'provenance_pl', name: 'Provenance Place', kind: 'street', district: 'uptown' },
      { id: 'trust_fund_terr', name: 'Trust Fund Terrace', kind: 'street', district: 'uptown', note: 'runs on through the port to the quay' },
      { id: 'heirloom_row', name: 'Heirloom Row', kind: 'street', district: 'uptown' },
      { id: 'old_money_mile', name: 'Old Money Mile', kind: 'street', district: 'uptown', note: 'runs on through the port' },
      { id: 'legacy_ln', name: 'Legacy Lane', kind: 'street', district: 'uptown' },
      { id: 'primary_source_st', name: 'Primary Source Street', kind: 'street', district: 'uptown' },
      { id: 'endowment_end', name: 'Endowment End', kind: 'street', district: 'uptown' },
      { id: 'off_the_record_rd', name: 'Off The Record Road', kind: 'street', district: 'uptown' },
      { id: 'inheritance_ave', name: 'Inheritance Avenue', kind: 'avenue', district: 'uptown', note: 'the only avenue Goldplate could not buy' },
      { id: 'quiet_part_loud_ln', name: 'Quiet Part Loud Lane', kind: 'street', district: 'uptown' },
      { id: 'stoop_speech_st', name: 'Stoop Speech Street', kind: 'street', district: 'uptown' },
      { id: 'vetted_vista', name: 'Vetted Vista', kind: 'street', district: 'uptown' },
      { id: 'generational_way', name: 'Generational Way', kind: 'street', district: 'uptown' },
      { id: 'minds_made_up_mews', name: 'Minds Made Up Mews', kind: 'street', district: 'uptown' },
      { id: 'portfolio_parade', name: 'Portfolio Parade', kind: 'street', district: 'uptown' },
      { id: 'arrivals_ave', name: 'Arrivals Avenue', kind: 'avenue', district: 'airport', note: 'the Sponsor Span lands here' },
      { id: 'windsock_way', name: 'Windsock Way', kind: 'street', district: 'airport' },
      { id: 'baggage_claim_blvd', name: 'Baggage Claim Boulevard', kind: 'street', district: 'airport' },
      { id: 'layover_ln', name: 'Layover Lane', kind: 'street', district: 'airport' },
      { id: 'gate_ten_st', name: 'Gate Ten Street', kind: 'street', district: 'airport' },
      { id: 'departures_dr', name: 'Departures Drive', kind: 'street', district: 'airport' },
      { id: 'lost_luggage_ln', name: 'Lost Luggage Lane', kind: 'street', district: 'airport' },
      { id: 'final_boarding_blvd', name: 'Final Boarding Boulevard', kind: 'street', district: 'airport', note: 'the runway\'s north edge' },
      { id: 'manifest_rd', name: 'Manifest Road', kind: 'street', district: 'port' },
      { id: 'container_cres', name: 'Container Crescent', kind: 'street', district: 'port' },
      { id: 'customs_close', name: 'Customs Close', kind: 'street', district: 'port' },
      { id: 'bill_of_lading_ln', name: 'Bill of Lading Lane', kind: 'street', district: 'port' },
      { id: 'dockworker_dr', name: 'Dockworker Drive', kind: 'street', district: 'port' },
      { id: 'arrivals_ramp', name: 'Arrivals Ramp', kind: 'ramp', district: 'airport', note: 'Gate Ten Street climbs north to the Lower Loop' },
      { id: 'manifest_ramp', name: 'Manifest Ramp', kind: 'ramp', district: 'port', note: 'Manifest Road climbs west to the Lower Loop' },
      { id: 'the_lower_loop', name: 'The Lower Loop', kind: 'highway', district: null, note: 'on the Lower Loop you are legally a layover' }
    ],

    // §8.4 four new Impression Alley style pairs (they face each other along the Shoreline Stroll) and five single ads
    // (the Sponsor Span's abutment board cycles the singles); 20_content_world.js already places them, this is the record
    billboards: [
      { kind: 'pair', texts: ['OLD MONEY', 'NEW TAKES'], where: 'stroll' },
      { kind: 'pair', texts: ['DECLARED', 'DISCLOSED'], where: 'stroll' },
      { kind: 'pair', texts: ['RUNWAY 10', 'RUNWAY 10'], where: 'stroll' },
      { kind: 'pair', texts: ['WE ARM BOTH SIDES', 'THIS SIDE IS WINNING'], where: 'stroll' },
      { kind: 'ad', text: 'GOLDPLATE INTERNATIONAL: ONE FLIGHT, TWO TENS', where: 'span' },
      { kind: 'ad', text: 'FERRY TO ELSEWHERE: SOON', where: 'span' },
      { kind: 'ad', text: 'BOTH SIDES ARMS: BALANCE', where: 'span' },
      { kind: 'ad', text: 'MANIFEST YARD: EVERYTHING IS MERCH', where: 'span' },
      { kind: 'ad', text: 'THE HEIRLOOM CLUB: NO', where: 'span' }
    ]
  };

  // ============================================================ mission intro two-shots ==
  // §4.3: camA -> camB (shot 1, metres from the marker door, [x, y, z]), the line index that splits the intro between the
  // shots, the extras in shot 1 ([x, z] door offsets) and what shot 2 looks at. `door` puts someone other than the giver at
  // the marker (m03b: Merle); `track` makes shot 2 follow the speaker; `preSpawn` brings the mission's tagged vehicle
  // spawns forward so they are in frame; `vehicles` are cosmetic parked cars for the shot; `noKip` keeps Kip out of frame
  // (m09b: he is inside the shed). A cast member with a line and no listed spot stands beside the giver.
  var INTRO_SHOTS = {
    m00_intro: { camA: [-10, 6, 10], camB: [-4, 2, 5], split: 3, extras: [{ castId: 'roz', at: [6, 3], anim: 'wave', sign: 'CHEESE' }], look: 'roz', track: 'speaker', note: '9 folding tables in frame' },
    m01_van: { camA: [12, 5, 8], camB: [5, 2, 4], split: 2, preSpawn: ['podvan'], look: 'gus', note: 'the pod wrap fills shot 1\'s right third' },
    m01b_airport: { camA: [-8, 4, 9], camB: [-3, 2, 4], split: 2, extras: [{ castId: 'gus', at: [-3, 2], anim: 'idle' }], preSpawn: ['podvan'], look: 'sloane',
      fx: [{ type: 'text', text: 'FOLLOW THIS', tag: 'podvan', y: 3.4, color: '#ffd400', life: 4 }], note: 'the HUD arrow is previewed over the van' },
    m02_read: { camA: [10, 4, -9], camB: [4, 2, -4], split: 3, preSpawn: ['mattress'], kipSign: 'MATTRESS', look: 'firmness', note: 'neon sign in frame' },
    m03_ratio: { camA: [0, 9, 14], camB: [0, 3, 7], split: 2, extras: [{ castId: 'dunk', at: [0, -10], anim: 'point' }], look: 'dunk', note: 'both billboards in frame' },
    m03b_range: { camA: [7, 4, 8], camB: [3, 2, 4], split: 2, door: 'merle', extras: [{ castId: 'gus', at: [-2, 3], anim: 'idle' }], look: 'merle', note: 'neon target sign on; six cutouts visible past the fence' },
    m04_hit: { camA: [-9, 5, -8], camB: [-3, 2, -3], split: 2, look: 'chyron', fx: [{ type: 'ring', x: 0, y: 5, z: -2, color: '#3fd27f', life: 1.4 }], note: 'the motel neon flickers' },
    m05_peer: { camA: [8, 4, 8], camB: [3, 1.8, 4], split: 2, extras: [{ castId: 'footnote', at: [-6, 4], anim: 'idle', face: 'away' }], look: 'vaultwright', track: 'speaker', note: 'two doors, one checkbook; footnote walking away' },
    m05b_provenance: { camA: [-9, 5, 10], camB: [-3, 2, 4], split: 2, extras: [{ castId: 'footnote', at: [3, 3], anim: 'idle' }], look: 'vaultwright', note: 'the awning and stanchions; the club doorman already stands at the door' },
    m06_rally: { camA: [-26, 12, 0], camB: [-8, 3, 2], split: 2, protesters: 6, look: 'goldplate', note: 'from the stadium mast; the widest shot in the game' },
    m07_listen: { camA: [6, 4, 9], camB: [2, 2, 4], split: 2, look: 'velvetine', note: 'neon on' },
    m07b_ferry: { camA: [-10, 6, -8], camB: [-3, 2, -3], split: 2, look: 'velvetine', note: 'from the pier end; the ferryboat behind; the NEXT FERRY: SOON board' },
    m08_scooters: { camA: [9, 5, 9], camB: [3, 2, 4], split: 2, preSpawn: ['scooter'], look: 'warbanner', note: 'two embassy flags' },
    m08b_jets: { camA: [-14, 6, 10], camB: [-4, 2, 4], split: 3, preSpawn: ['jettruck'], look: 'warbanner', note: 'the jet truck at the rank; Goldplate\'s line is a radio line from the tower (line.radio); the tower\'s cab lit' },
    m09_balloon: { camA: [8, 3, 8], camB: [3, 1.7, 3], split: 3, look: 'redacted', tilt: 'up', note: 'thirteen antennas in frame (camA tilted up)' },
    m09b_hotmic: { camA: [-8, 4, 8], camB: [-3, 2, 3], split: 2, look: 'redacted', noKip: true, note: 'Kip\'s line comes from inside the shed (line.offscreen: portrait only; no Kip actor at the door)',
      vehicles: [{ type: 'van', color: '#d9cfa6', at: lmk('customs_shed', 26, 8), yaw: Math.PI / 2 }, { type: 'van', color: '#d9cfa6', at: lmk('customs_shed', 26, 14), yaw: Math.PI / 2 }] },
    m10_pellets: { camA: [10, 5, -8], camB: [4, 2, -3], split: 2, preSpawn: ['pellets'], look: 'saffron', note: 'the pellet SUV; the barn\'s gable' },
    m11_trustless: { camA: [-8, 5, 8], camB: [-3, 2, 3], split: 2, extras: [{ castId: 'gus', at: [-3, 3], anim: 'idle' }], look: 'moonsworth',
      fx: [{ type: 'text', text: '$PUNDIT: 0.00', x: 6, y: 5, z: -4, color: '#ff2d6f', life: 4 }], note: 'the shed\'s three antennas' },
    m12_memo: { camA: [9, 4, 9], camB: [4, 2, 4], split: 3, extras: [{ castId: 'roz', at: [2, 3], anim: 'talk', sign: 'THE MEMO IS YOU' }], look: 'gus', track: 'speaker' },
    m12b_scope: { camA: [-9, 5, 10], camB: [-3, 2, 4], split: 2, kipAt: [4, 3], look: 'footnote', note: 'the museum columns and banners; camB tilts to the channel view' },
    m13_thursday: { camA: [-6, 3, 6], camB: [-2, 1.8, 3], split: 3, extras: [{ castId: 'sloane', at: [2, 2], anim: 'idle' }], look: 'kip', note: 'inside the dorm door; the ON AIR sign' },
    m13b_ratio: { camA: [-12, 8, 10], camB: [-4, 2, 4], split: 2, extras: [{ castId: 'gus', at: [-3, 3], anim: 'idle' }], look: 'moonsworth', note: 'from above the containers; a crane in frame',
      vehicles: [{ type: 'van', color: '#ffd400', at: lmk('container_yard', 10, 6), yaw: 0 }, { type: 'van', color: '#3d6fcf', at: lmk('container_yard', 10, 12), yaw: 0 }, { type: 'van', color: '#8e3a8e', at: lmk('container_yard', 16, 6), yaw: 0 }, { type: 'van', color: '#2c3e7a', at: lmk('container_yard', 16, 12), yaw: 0 }] },
    m14_grift: { camA: [0, 10, 16], camB: [0, 3, 7], split: 2, panel: ['goldplate', 'warbanner', 'velvetine', 'footnote', 'dunk'], extras: [{ castId: 'chyron', at: [0, -1.2], anim: 'talk' }], look: 'chyron', note: 'the five panelists in a row; each panel line shows that member\'s portrait' },
    m15a_primetime: { camA: [10, 6, 10], camB: [4, 2, 4], split: 2, extras: [{ castId: 'firmness', at: [3, 3], anim: 'idle' }], look: 'chyron', note: 'code CHAIR20' },
    m15b_liveread: { camA: [-6, 3, 6], camB: [-2, 1.8, 3], split: 2, extras: [{ castId: 'sloane', at: [2, 2], anim: 'idle' }], look: 'gus' }
  };
  X.introShots = INTRO_SHOTS;

  // every story mission by id, base first (22_) then the expansion's
  X.missionById = function (id) {
    var base = GTP.Content.missions || [], i;
    for (i = 0; i < base.length; i++) if (base[i].id === id) return base[i];
    for (i = 0; i < X.missions.length; i++) if (X.missions[i].id === id) return X.missions[i];
    return null;
  };
  // the 25 story missions in §3.3 order (an id unknown to either list is skipped; one in neither chain is appended)
  X.allMissions = function () {
    var out = [], seen = {}, i, m;
    for (i = 0; i < X.chain.length; i++) { m = X.missionById(X.chain[i]); if (m && !seen[m.id]) { seen[m.id] = true; out.push(m); } }
    var rest = (GTP.Content.missions || []).concat(X.missions);
    for (i = 0; i < rest.length; i++) if (!seen[rest[i].id]) { seen[rest[i].id] = true; out.push(rest[i]); }
    return out;
  };

  function buildIntro(mid, spec) {
    var m = X.missionById(mid), lm = m ? m.marker : 'campus_quad', giver = m ? m.giver : 'gus';
    var intro = (m && m.intro) ? m.intro.slice() : [], split = Math.min(spec.split, Math.max(1, intro.length - 1));
    var door = spec.door || giver, i;
    var actors = [
      { castId: door, at: lmk(lm, 0.8, 0), face: 'player', anim: 'talk' },
      { castId: 'player', at: lmk(lm, 0.8, 2), face: door, anim: 'idle' }
    ];
    var kipListed = door === 'kip' || giver === 'kip' || (spec.extras || []).some(function (e) { return e.castId === 'kip'; });
    if (!spec.noKip && !kipListed) {
      actors.push({ castId: 'kip', at: lmk(lm, spec.kipAt ? spec.kipAt[0] : 3, spec.kipAt ? spec.kipAt[1] : 2), face: 'player', anim: 'wave' });
      if (spec.kipSign) actors[2].sign = spec.kipSign;
    }
    if (spec.door && spec.door !== giver && !(spec.extras || []).some(function (e) { return e.castId === giver; })) actors.push({ castId: giver, at: lmk(lm, -2, 3), face: 'player', anim: 'idle' });
    var extras = spec.extras || [];
    for (i = 0; i < extras.length; i++) {
      var e = extras[i], a = { castId: e.castId, at: lmk(lm, e.at[0], e.at[1]), face: e.face || 'player', anim: e.anim || 'idle' };
      if (e.sign) a.sign = e.sign;
      actors.push(a);
    }
    if (spec.protesters) for (i = 0; i < spec.protesters; i++) actors.push({ castId: 'protester', at: lmk(lm, -6 + 12 * i / (spec.protesters - 1), 6), face: 'player', anim: 'talk', sign: true });
    if (spec.panel) for (i = 0; i < spec.panel.length; i++) actors.push({ castId: spec.panel[i], at: lmk(lm, -4 + 8 * i / (spec.panel.length - 1), -3), face: 'player', anim: 'table' });
    // anyone with a line who the table does not place stands beside the giver (a radio or offscreen line is portrait only)
    var placed = {}, FALLBACK = [[-2.2, 1.2], [-3.4, 2.6], [2.6, 3.8], [-4.6, 1.0]], fb = 0;
    for (i = 0; i < actors.length; i++) placed[actors[i].castId] = true;
    for (i = 0; i < intro.length; i++) {
      var ln = intro[i];
      if (!ln.who || ln.radio || ln.offscreen || placed[ln.who]) continue;
      var pos = FALLBACK[fb++ % FALLBACK.length];
      actors.push({ castId: ln.who, at: lmk(lm, pos[0], pos[1]), face: 'player', anim: 'idle' });
      placed[ln.who] = true;
    }
    var shot1 = {
      cam: { from: lmk3(lm, spec.camA[0], spec.camA[1], spec.camA[2]), to: { entity: 'actor:' + door }, seconds: 8, ease: 'inout', move: { to: lmk3(lm, spec.camB[0], spec.camB[1], spec.camB[2]) } },
      actors: actors, lines: intro.slice(0, split)
    };
    if (spec.tilt) shot1.cam.tilt = spec.tilt;
    if (spec.preSpawn) shot1.preSpawn = spec.preSpawn.slice();
    if (spec.vehicles) shot1.vehicles = spec.vehicles.slice();
    if (spec.fx) shot1.fx = spec.fx.slice();
    var look = spec.look || door, lines2 = intro.slice(split), talkers = { player: true }, actors2 = [{ castId: 'player', anim: 'talk' }, { castId: look, anim: 'talk' }];
    talkers[look] = true;
    for (i = 0; i < lines2.length; i++) if (lines2[i].who && placed[lines2[i].who] && !talkers[lines2[i].who]) { talkers[lines2[i].who] = true; actors2.push({ castId: lines2[i].who, anim: 'talk' }); }
    var shot2 = { cam: { from: { entity: 'player', offset: { x: 0.7, y: 1.6, z: -1.8 } }, to: { entity: 'actor:' + look }, seconds: 6, ease: 'inout' }, actors: actors2, lines: lines2, hold: 0.8 };
    if (spec.track) shot2.track = spec.track;
    var script = { id: 'cs_intro_' + mid, mission: mid, letterbox: true, skippable: true, music: 'off', split: split, shots: [shot1, shot2] };
    if (spec.note) script.note = spec.note;
    return script;
  }
  for (var mid in INTRO_SHOTS) if (!X.cutscenes['cs_intro_' + mid]) X.cutscenes['cs_intro_' + mid] = buildIntro(mid, INTRO_SHOTS[mid]);

  X.cutscene = function (id) { return X.cutscenes[id] || null; };
  // the intro script for a mission, rebuilt from the live intro text (after a retune) when asked
  X.introScript = function (missionId, rebuild) {
    if (rebuild && INTRO_SHOTS[missionId]) X.cutscenes['cs_intro_' + missionId] = buildIntro(missionId, INTRO_SHOTS[missionId]);
    return X.cutscenes['cs_intro_' + missionId] || null;
  };
  X.subscriberTier = function (subs) {
    var T = X.subscriberTiers, cur = T[0];
    for (var i = 0; i < T.length; i++) if ((subs || 0) >= T[i].subs) cur = T[i];
    return cur;
  };
  X.strand = function (id) { return X.strands[id] || null; };
  X.memo = function (id) { for (var i = 0; i < X.strands.memos.length; i++) if (X.strands.memos[i].id === id) return X.strands.memos[i]; return null; };
  X.race = function (id) { for (var i = 0; i < X.strands.races.length; i++) if (X.strands.races[i].id === id) return X.strands.races[i]; return null; };
  X.rampage = function (id) { for (var i = 0; i < X.strands.rampages.length; i++) if (X.strands.rampages[i].id === id) return X.strands.rampages[i]; return null; };
  X.hint = function (id) { for (var i = 0; i < X.hints.length; i++) if (X.hints[i].id === id) return X.hints[i]; return null; };

  // §3.4 retune: set each {path, value} on the base mission (dotted path; numeric segments index arrays). Idempotent.
  X.applyRetune = function () {
    var n = 0;
    for (var id in X.retune) {
      var m = X.missionById(id); if (!m) continue;
      var patches = X.retune[id];
      for (var i = 0; i < patches.length; i++) {
        var parts = patches[i].path.split('.'), o = m, ok = true;
        for (var k = 0; k < parts.length - 1; k++) { if (o == null || typeof o !== 'object') { ok = false; break; } o = o[parts[k]]; }
        if (!ok || o == null || typeof o !== 'object') continue;
        var key = parts[parts.length - 1];
        if (o[key] !== patches[i].value) { o[key] = patches[i].value; n++; }
      }
    }
    return n;
  };
  X.applyRetune();

  // =============================================== registrations on existing content ==
  // (guarded, idempotent; the owning files may absorb them)

  // §2.4 Merle Firmness and §7 the cardboard heckler
  (function () {
    var cast = GTP.Content.cast; if (!cast) return;
    if (!cast.merle) cast.merle = {
      id: 'merle', name: 'Merle Firmness', role: 'Clerk, Both Sides Arms', voice: 'retail',
      tic: 'Quotes the price, then a lower price "for a journalist", then the first price.',
      portrait: { skin: 1, hair: 'short', hairColor: '#3a2a1a', glasses: 'aviator', hat: 'cap', extra: 'lanyard', tie: 'none' },
      look: { skin: 1, hair: 'short', hairColor: '#3a2a1a', shirt: '#2a3a2a', pants: '#3a3a3a', hat: 'cap', glasses: 'aviator', extra: 'lanyard', tie: 'none' },
      color: '#3fd27f',
      bio: 'Sells the same gun to both sides and a bigger one to whoever comes back. Runs a loyalty program nobody has qualified for. Dale\'s cousin; the firmness runs in the family.'
    };
    if (!cast.cutout) cast.cutout = {
      id: 'cutout', name: 'Cardboard Heckler', role: 'A heckler, in profile', voice: 'mute',
      tic: 'Says WRONG. It is printed on.',
      portrait: { skin: 2, hair: 'short', hairColor: '#8a7a5a', glasses: 'none', hat: 'none', extra: 'none', tie: 'none' },
      look: { skin: 2, hair: 'short', hairColor: '#8a7a5a', shirt: '#c8b89a', pants: '#c8b89a', hat: 'none', glasses: 'none', extra: 'none', tie: 'none', sign: 'WRONG', flat: true },
      color: '#c8b89a', hp: 30, flat: true,
      bio: 'Six of them stand behind Both Sides Arms. They topple, they never sue, and one of them did the reading.'
    };
    if (GTP.Content.opponentIds && GTP.Content.opponentIds.indexOf('merle') < 0) GTP.Content.opponentIds.push('merle', 'cutout');
  })();

  // §1.6 ped look pools for the three new districts (tweed and pearls; lanyards and pale shirts; hi-vis and beanies)
  (function () {
    var L = GTP.Content.looks; if (!L || !L.byDistrict) return;
    var HAIR = L.hairStyles || ['short', 'long', 'bob', 'bun', 'slick'], HC = L.hairColors || ['#1a1a1a', '#3a2a1a', '#9c9c9c'];
    if (!L.byDistrict.uptown) L.byDistrict.uptown = {
      describe: 'tweed and pearls',
      hair: ['slick', 'bun', 'bob', 'short', 'pompadour', 'bald', 'long'], hairColor: ['#d8d8d8', '#9c9c9c', '#3a2a1a', '#1a1a1a', '#b58a3c', '#4a3a2a'],
      shirt: ['#6e5a44', '#8a7a66', '#4a4a5a', '#7a6a5a', '#3a3a4a', '#9a8a78', '#5a4a3a'],
      pants: ['#3a3020', '#2a2a3a', '#4a4a4a', '#5a4a3a', '#2b2b3a'],
      hat: ['none', 'none', 'none', 'fedora', 'none'],
      glasses: ['round', 'round', 'none', 'thick', 'none'],
      extra: ['none', 'cigar', 'medal', 'none', 'phone', 'none'],
      tie: ['bowtie', 'bowtie', 'gold', 'none', 'red', 'none']
    };
    if (!L.byDistrict.airport) L.byDistrict.airport = {
      describe: 'lanyards and neck pillows',
      hair: HAIR, hairColor: HC,
      shirt: ['#eef1f4', '#dfe3e8', '#c9d3dc', '#f4f4f4', '#d8e8f0', '#f0e8d8', '#b3e0ff'],
      pants: ['#2a2f4a', '#4a4a4a', '#3a4a6a', '#c8b89a', '#1e2436'],
      hat: ['none', 'none', 'none', 'cap', 'none'],
      glasses: ['none', 'none', 'shades', 'round', 'none'],
      extra: ['lanyard', 'lanyard', 'none', 'phone', 'none', 'none'],
      tie: ['none', 'none', 'none', 'blue']
    };
    if (!L.byDistrict.port) L.byDistrict.port = {
      describe: 'hi-vis and beanies',
      hair: ['short', 'short', 'bald', 'long', 'bun', 'afro', 'mohawk'], hairColor: HC,
      shirt: ['#f0b429', '#f0b429', '#f0b429', '#ff6a00', '#d8ff00', '#4a4a4a', '#8b5a3c'],
      pants: ['#4a4a4a', '#2a2f4a', '#3a3a3a', '#1e2436', '#3f6f8a'],
      hat: ['beanie', 'beanie', 'helmet', 'cap', 'none'],
      glasses: ['none', 'none', 'shades', 'none'],
      extra: ['none', 'none', 'earpiece', 'phone', 'none'],
      tie: ['none']
    };
  })();

  // §8 radio: the twelve ticker lines, the district and doorman bark pools, the six ads (two per station, appended after
  // each station's existing six so `napAd` indexes stay valid)
  (function () {
    var Rd = GTP.Content.radio; if (!Rd || Rd._expansionInstalled) return;
    Rd._expansionInstalled = true;
    var i, t;
    if (Rd.ticker) for (i = 0; i < X.radio.ticker.length; i++) if (Rd.ticker.indexOf(X.radio.ticker[i]) < 0) Rd.ticker.push(X.radio.ticker[i]);
    var B = Rd.barks;
    if (B) {
      B.byDistrict = B.byDistrict || {};
      var universal = B.ped ? [B.ped[0], B.ped[13], B.ped[18]].filter(Boolean) : [];
      for (i = 0; i < X.radio.barks.length; i++) {
        var bk = X.radio.barks[i];
        if (bk.district) {
          if (!B.byDistrict[bk.district]) B.byDistrict[bk.district] = [];
          if (B.byDistrict[bk.district].indexOf(bk.text) < 0) B.byDistrict[bk.district].push(bk.text);
        } else if (bk.role) {
          if (!B[bk.role]) B[bk.role] = [];
          if (B[bk.role].indexOf(bk.text) < 0) B[bk.role].push(bk.text);
        }
      }
      for (var d in B.byDistrict) if (['uptown', 'airport', 'port'].indexOf(d) >= 0) for (t = 0; t < universal.length; t++) if (B.byDistrict[d].indexOf(universal[t]) < 0) B.byDistrict[d].push(universal[t]);
    }
    if (Rd.stations) for (i = 0; i < X.radio.ads.length; i++) {
      var ad = X.radio.ads[i];
      for (t = 0; t < Rd.stations.length; t++) if (Rd.stations[t].id === ad.station && Rd.stations[t].ads && Rd.stations[t].ads.indexOf(ad.text) < 0) Rd.stations[t].ads.push(ad.text);
    }
  })();

  // §3.4 the m02 hint toast: a mission with `startToast` shows it as the mission starts (UI.toast when there is one)
  (function () {
    var Ev = GTP.Events; if (!Ev || typeof Ev.on !== 'function' || X._toastHooked) return;
    X._toastHooked = true;
    Ev.on('mission:start', function (e) {
      try {
        var m = e && e.mission, text = m && m.startToast;
        if (!text) return;
        if (GTP.UI && typeof GTP.UI.toast === 'function') GTP.UI.toast(text);
        else if (GTP.Missions && GTP.Missions.state) GTP.Missions.state.hint = text;
      } catch (err) { if (GTP.util && GTP.util.reportError) GTP.util.reportError(err, 'expansion.startToast'); }
    });
  })();
})();
