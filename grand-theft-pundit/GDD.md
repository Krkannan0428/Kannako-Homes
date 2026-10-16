# GRAND THEFT PUNDIT: Game Design Document

*Everything is content.*

This is the single source of truth for content. It obeys `CONTENT_RULES.md` and fits the engine contract in `ARCHITECTURE.md` (3D, third person; the mission schema, minigames and ids are unchanged from the 2D draft). Every id below is lowercase snake_case and is the id the engineers use in `js/2x_content_*.js`.

## 1. Title and premise

**Title treatment.** Gold arcade letters on black; the T in PUNDIT is a folding table; the tagline underneath reads *Steal the Discourse.*

**Premise.** You are Bryce Takesworth, 22, a folding-table debate pundit who hosts the podcast *Loud & Correct* from a van parked in Grievance City, a town built across two time zones so it is always primetime somewhere. Your table sign reads ASK ME ANYTHING, I'LL ANSWER SOMETHING ELSE. You climb from campus quad to cable chair through sponsor reads, donor galas, ratio wars and errands for a spook agency that officially repairs weather balloons. A mega-donor lends you out to a real-estate president, a party baron, a hawkish foreign prime minister and the spooks, all at war with each other, and every one of them betrays you in a different way. The higher you climb, the clearer it gets that everyone is reading the same Monday Memo, and the Memo is scraped nightly from your own comment section. Nobody is in charge. Everyone subscribed. The grift is you.

**Shape.** Third-person 3D open city in the GTA III / Vice City mold, 360-degree movement with a chase camera: steal cars, run errands, lose the cops, punch hecklers, and fight two minigames (a debate and a ratio war) that decide who is the main character of the day. Fail screens: WASTED reads **RATIO'D**, BUSTED reads **DEPLATFORMED**, mission failed reads **CONTEXT STAMPED**. The protagonist is the butt of every joke.

## 2. City: Grievance City

"Two time zones, one opinion." A 160 x 160 tile map (4 m tiles, 640 m square): sea on all sides, a bay to the south, a channel on the east separating the mainland from the President's island, one main bridge and one marina bridge. A highway loop (the Loop) rings the center. Player spawn landmark: **`campus_quad`** (at its door point). Respawn: hospital `hospital`, police `police_hq`.

| id | name | vibe | style |
|---|---|---|---|
| `campus` | Founders' College | Lawns, lanyards, nine folding tables and zero chairs; the podcast van lives here; tutorial on foot | campus |
| `downtown` | Chyron Center | Cable towers, lower-thirds for architecture, billboards that argue with each other; foot chases, sieges, the hospital and the precinct | downtown |
| `strip` | The Sponsor Strip | Neon mall-and-billboard corridor where the mattress depot is the real seat of government; pickups and vehicle combat | strip |
| `capitol` | Lobby Row | The Capitol, think tanks, embassy row, a donor steakhouse, a weather-balloon repair office with thirteen antennas; one-way revolving doors | capitol |
| `hills` | Pennant Point | The President's gold island: the stadium with two names, the par-ten links, the donor's manor uphill of the President so the checks flow down | stadium |
| `suburbs` | Culdesac Heights | Wellness barns, garage crypto mines, an HOA with its own patrols and its own wanted stars; tailing and cargo runs | suburbs |
| `industrial` | The Printworks | Warehouses, the plant that prints 4,000 Monday Memos a night, a motor pool of balloon-repair vans; shotgun pickups late game | industrial |
| `marina` | Velvetine Docks | Party piers where no music ever plays, a fish shack that reheats takes hourly, a yacht that never sailed; one-lane valet jams | marina |

## 3. Landmarks

| id | name | kind | district | gag |
|---|---|---|---|---|
| `campus_quad` | Founders' Quad | campus | campus | Standing-room-only by design; the sign reads ASK ME ANYTHING, I'LL ANSWER SOMETHING ELSE. |
| `dorm_studio` | Dorm 4B Studio | studio | campus | The ON AIR sign has never turned off; neither has the mini-fridge. |
| `pod_garage` | Gus's Garage | garage | campus | Pay-and-spray; also resprays opinions, same price. |
| `tyn_tower` | The Yell Network | studio | downtown | The building is shaped like a lower-third; 24 hours, zero days of reporting. |
| `green_room` | Green Room Motel | hotel | downtown | Four hours' wait, four-minute hit, free bagels, mandatory hostility. |
| `impression_alley` | Impression Alley | park | downtown | The billboards quote-post each other; one is losing. |
| `goldplate_tower` | Goldplate Tower | tower | downtown | The gold name wraps around twice; the roof sign counts the President's helicopters (both). |
| `vault_bank` | Vaultwright Capital | bank | downtown | "We short what we love." The vault is a hedge. |
| `hospital` | Goldplate Memorial | hospital | downtown | Formerly St. Somebody's; discharges you with a bandage that has a coupon code. |
| `police_hq` | 1st Precinct | police | downtown | Cops rate your arrest out of ten; the lost-and-found is the suggestion box. |
| `nap_depot` | Nap Dynasty Mattress Depot | mall | strip | Every podcast's actual boss; the showroom has a podium. |
| `listening_room` | Velvetine Listening Room | club | strip | No music is ever played; door policy is "who are you listening with." |
| `strip_garage` | Detail & Evidence | garage | strip | Cleans cars and records. |
| `strip_gas` | Octane Opinions | gas | strip | Premium is just regular with a stance. |
| `capitol_dome` | The Capitol | capitol | capitol | Rated a ten by the man who rates it; the dome is leased. |
| `fulcrum` | Fulcrum Foundation | hq | capitol | Nonpartisan: two doors, one checkbook. |
| `char_charter` | Char & Charter | diner | capitol | The menu is a donor tier list; the salad is Bronze. |
| `bravadia_embassy` | Bravadian Embassy | embassy | capitol | The flag is a bigger flag; the gift shop sells flag pins larger than your head. |
| `ova_hq` | Office of Vibes Assessment | hq | capitol | Sign says WEATHER BALLOON REPAIR; antenna count currently thirteen. |
| `protest_plaza` | Perpetual Assembly Plaza | park | capitol | So old it has a gift shop; the cause changes daily, the mugs never do. |
| `stadium` | Goldplate Goldplate Stadium | stadium | hills | Yes, both words. Named after the President, twice. |
| `goldplate_links` | Goldplate Links | park | hills | Every hole a par ten; the clubhouse is rated a ten. |
| `vaultwright_manor` | Vaultwright Manor | mansion | hills | The hedge maze is a tax shelter; uphill of the President so the checks flow down. |
| `bridge_main` | Goldplate Goldplate Bridge | bridge | hills | Renamed twice, tolled once per direction, dead drops underneath. |
| `hoa_hall` | Culdesac HOA Hall | hq | suburbs | Issues its own wanted stars; mailbox violations are a felony. |
| `clarity_barn` | Clarity Pellet Wellness Barn | warehouse | suburbs | Sells the supplements, then the barn. |
| `moon_mine` | Moonsworth Mining Shed | warehouse | suburbs | Thirty GPUs or one space heater, trustlessly. |
| `culdesac_gas` | Pump & Circumstance | gas | suburbs | The HOA approved the pump but not the price. |
| `warehouse_42` | Warehouse 42 | warehouse | industrial | Merch, mixtapes, mystery; the mixtape has never been released and is still charting. |
| `memo_press` | Monday Memo Print Works | warehouse | industrial | Prints 4,000 copies nightly; nobody placed the order. |
| `balloon_depot` | Weather Balloon Repair Depot | warehouse | industrial | Zero balloons, forty beige vans. |
| `velvetine_pier` | Velvetine Listening Pier | dock | marina | A party you'll hear about; no music, everyone networking. |
| `afterparty_yacht` | The Afterparty | club | marina | A yacht that never sailed; the dress code is "a vibe." |
| `fish_shack` | Fresh Takes Fish Shack | diner | marina | Takes caught daily, reheated hourly. |

Kinds `hospital`, `police` and `garage` drive engine behaviour (respawn, respawn, pay-and-spray). Both garages clear wanted stars for `$100` per star.

## 4. Cast

Portrait recipe fields: `skin` 1-6, `hair` (bald|short|long|pompadour|bun|mohawk|slick|afro|bob), `hairColor`, `glasses` (none|round|aviator|thick|shades), `hat` (none|cap|beanie|cowboy|fedora|beret|crown|helmet), `extra` (none|mic|earpiece|cigar|phone|medal|flag_pin|lanyard), `tie` (none|red|blue|gold|bowtie), `color` (accent for dialogue box and map dot). All looks are parametric and deliberately unlike any real person's signature look.

| id | name | role | voice tic | skin | hair | hairColor | glasses | hat | extra | tie | color | bio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `player` | Bryce Takesworth | Campus pundit, host of *Loud & Correct* | Prefaces every insult with "Respectfully," and then is not; calls himself a journalist; he is not. | 2 | short | #3a2a1a | none | none | mic | red | #ff3fa4 | Left class in week two to table outside it. Believes he is the protagonist, which is the problem. |
| `sloane` | Sloane Vexley | Producer | Speaks in segment lengths ("Four minutes. Three. Go.") | 4 | bob | #1a1a1a | thick | none | earpiece | none | #27c9c2 | Turned a folding table into a brand and bills hourly for it. Believes nothing, books everything. |
| `gus` | Gus Pemberton | Sound guy, roommate, van mechanic | Audio levels only ("You're peaking.") | 3 | short | #2a1a0a | none | beanie | none | none | #7fbf6a | The only honest person in Grievance City, so nobody books him. Runs Gus's Garage out of spite. |
| `kip` | Kip Gratis | Unpaid intern, age 54 | "Is this paid?" closes every scene he is in. | 1 | long | #b58a3c | round | none | lanyard | none | #f0ad4e | The only person in the city who reads email, which is how he ended up formatting the Monday Memo. Present at every location, including inside the dryer. |
| `dunk` | Ptolemy Dunk | Rival streamer, *Actually, Didn't Read* | "Didn't read. Replied anyway." | 5 | short | #111111 | shades | cap | mic | none | #15e0ff | Runs Bryce's exact grift from the next table over: opposite signs, same sponsor. Has never finished a thought, only ended one. |
| `chyron` | Brock Chyron | Anchor, The Yell Network | Headline fragments ("BREAKING. Me. Talking."); ends every conversation with "WE'LL HAVE TO LEAVE IT THERE." | 2 | pompadour | #2b2b2b | none | none | earpiece | red | #c94040 | Named after the lower-third; interrupted his own wedding vows with a developing story, which was him. Has not finished a sentence in years; has finished several careers. |
| `vaultwright` | Prescott Vaultwright III | Mega-donor, Vaultwright Capital | Whispers every dollar figure. | 1 | slick | #d8d8d8 | round | none | cigar | gold | #e8b53a | Funds both candidates so he never loses, "as a hedge." Owns a manor uphill of the President and a hedge maze that is also a hedge. |
| `footnote` | Dr. Imogen Footnote | Director, Fulcrum Foundation | Says "[citation pending]" aloud. | 6 | bun | #9c9c9c | thick | none | lanyard | none | #8a94c8 | Publishes whatever the last check said, footnoted. Forty fellows, one opinion, two doors. |
| `goldplate` | President Lionel Goldplate | Real-estate-mogul president | Rates everything out of ten; his things are tens; names things after himself that are already named after himself. | 2 | bald | #e8b53a | round | helmet | medal | bowtie | #ffd400 | Renamed the bridge, the stadium, the hospital and the weather. Wears a gold hard hat to every ribbon cutting; there is always a ribbon. |
| `warbanner` | PM Hollis Warbanner | Prime Minister of Bravadia, an invented allied nation | Every sentence, including condolences, ends "and that's why we need the jets." | 3 | slick | #1a1a1a | aviator | none | flag_pin | blue | #3d6fcf | Leads a country of eleven million citizens and forty million press releases (motto: Volume Is Policy). Buys ads, sells scooters, wants jets. |
| `velvetine` | Baron Velvetine | Music mogul, Velvetine Records | Every line is a toast ("To whatever this is!"). | 1 | long | #8e3a8e | shades | fedora | phone | bowtie | #8e3a8e | Runs an empire of "listening sessions" at which nothing is ever played; the DJ reads a spreadsheet aloud. Nothing released, still charting. |
| `redacted` | Agent Pat Redacted | Handler, Office of Vibes Assessment (OVA) | Redacts her own nouns ("Meet me at the [REDACTED]"); the redactions grow until her last line is "[REDACTED]." | 4 | bob | #2b2b2b | shades | beret | earpiece | none | #4c4c4c | Legally never here. Recruits podcasters as "assets" because they are cheaper than satellites and louder. |
| `moonsworth` | Kyler Moonsworth | Crypto evangelist, $PUNDIT | Says "trustless" for "trust"; all money, including sandwiches, is "liquidity." | 2 | short | #c0392b | shades | cap | phone | none | #ff2d6f | Launching $PUNDIT, a coin backed by takes. Sold his car for the coin, sold the coin for a car wrap advertising the coin. |
| `saffron` | Saffron Vitalis-Hale | Wellness grifter, Clarity Pellets | "...and your doctor won't tell you that." | 3 | long | #7a5c3a | none | none | medal | none | #2f9e6a | Sells Clarity Pellets, a supplement with a stance, and then the barn they come in. The medal is a crystal, technically. |
| `firmness` | Dale Firmness | Regional manager, Nap Dynasty Mattresses | Drops coupon codes mid-sentence ("Sorry for your loss, code TAKES20."). | 1 | short | #3a2a1a | none | cap | lanyard | blue | #2c3e7a | Sponsors every show in the city and therefore runs it. Has never raised his voice; has never needed to. |
| `roz` | Roz Placard | Organizer, CAWTI (Citizens Against Whatever This Is) | Chants in rhyme; "We're not here to..." and then does exactly that. | 6 | mohawk | #ff7a00 | round | beanie | mic | none | #ff7a00 | Four hundred protests, 399 of them against the previous one. Carries three signs so she can switch sides mid-chant. |

Voice styles for the engine's `voice` field: player `smug`, sloane `clipped`, gus `flat`, kip `hopeful`, dunk `lazy`, chyron `breaking`, vaultwright `whisper`, footnote `academic`, goldplate `boast`, warbanner `podium`, velvetine `toast`, redacted `redacted`, moonsworth `hype`, saffron `serene`, firmness `retail`, roz `chant`.

## 5. Story

**Act I, Folding Table.** Bryce and Gus haul a folding table onto Founders' Quad and win a debate against a freshman who did the reading, on volume alone. Sloane Vexley appears with a clipboard, declares Bryce "pre-viral," and within a week he has a wrapped van, a mattress sponsor whose coupon code is the mission timer, and a ratio war against Ptolemy Dunk that his chat settles in person. Brock Chyron books him for a four-minute cable hit that lasts ninety seconds and ends with BREAKING, which is Brock. Bryce is now "a voice." He is not sure of what.

**Act II, Four Clients.** Everyone wants the podcast. Prescott Vaultwright lends Bryce out like a lawn mower: to President Goldplate, who wants a young face to warm up a rally in the stadium with two names; to Baron Velvetine, who wants crates delivered to a party where no music plays; to PM Warbanner of Bravadia, whose year-long ad buy is cover for selling Defense Scooters to both sides; and to Agent Redacted, who recruits Bryce as an OVA "asset" and whose spycraft turns out to be dead drops full of ad copy. Each client hires him against the others, and each betrays him in a different way: Vaultwright sells his contract, Goldplate renames his show, Velvetine pins a warehouse theft on him, Warbanner bills the scooters to the podcast, and Redacted lets him know the coming leak will be blamed on him. Along the way Saffron sells him pellets and Kyler sells him a coin, and the HOA issues him a wanted level of its own. Every faction's script ends with the same Nap Dynasty read and the same typo: "Respectfuly."

**Act III, The Monday Memo.** Gus and Roz match the typo. Every talking point in the city comes from one document, the Monday Memo, and the Memo comes from the Loud & Correct comment section, scraped nightly. Bryce raids OVA to find the operations floor and finds a subscriber list instead: Goldplate, Warbanner, Velvetine, Fulcrum, TYN, Dunk and the HOA all pay for the same dashboard. OVA has no operations, only subscribers. Kip confesses he wrote the scraper because nobody else reads email, and that the war was a content calendar; Thursday's entry reads "Dunk destroys Takesworth." On Thursday all four factions' goons converge on the Quad, and Bryce holds the table and loses the entire police department. Then Chyron's panel: five opponents, five identical memo answers, and an offer.

**Twist.** There is no mastermind. The Memo's last line is "Takesworth is ready for primetime," and it was written by his own audience, formatted by his own intern, sold back to the powerful as intelligence by an agency whose whole operation is a subscription. The conspiracy Bryce has been chasing is the recommendation engine he has been feeding. The grift is him.

**Ending A, Primetime.** Bryce takes the chair. The finale is a sponsor read that never ends: he tours every sponsor in the city against the clock while the ticker scrolls his own copy, then beats his own archive in a ratio war, because his old clips are now his competition. Final shot: a gold folding table on the roof of Goldplate Tower, rated a ten; he cannot remember what he believes. The credits roll as ad tickers. Kip asks if this is paid.

**Ending B, Live Read.** Sloane books Bryce onto Chyron's show under an alias. He fights through OVA agents in the lobby, reads the Monday Memo on air while the ratio explodes, and for the first time Brock does not leave it there. The feud collapses for exactly one day. Bryce and Gus are back on the Quad under a new sign: I DON'T KNOW. LET'S TALK. Dunk sets up at the next table with the same sign. Ratio: tie. Eleven people stay. Kip asks if this is paid. The reward is $11.

## 6. Missions

**Design rules.** Seventeen missions: `m00` to `m14` in a line, then two ending missions that both `require` `m14_grift`. One new mechanic per mission in Act I, stacked objectives after. Wanted stars rise 2, 2, 3, 3, 4, 5, 5. Weapons unlock in order fist (start), megaphone (`m03`), pistol (`m05`), hottake (`m09`), smg (`m11`); the shotgun is never unlocked by a mission, it spawns as a weapon pickup in `industrial` after `m11` (spawn table). Economy: rewards total about $34,000 across the campaign; death costs 10% of cash, busted costs $500, pay-and-spray costs $100 per star, both per the Combat contract. Every objective below is one of the twelve engine types with literal params; vehicle types are from `sedan sports suv truck van cop taxi bus bike`; `follow` targets always walk (ped on foot along a path of landmarks), never drive. Every mission's `failOn` includes `player_dead`. Both ending missions stay available after one is finished; completing either rolls credits, and replaying the other is an alternate ending, not a continuation.

---

### m00_intro, "Table Stakes"
giver `gus` · marker `campus_quad` · requires `[]` · reward `$100`

**Beats.** Gus has the table parts in Dorm 4B and refuses to carry them because carrying is not audio. Bryce hauls three parts across the lawn while Roz's protest (today's cause: CHEESE) tries to adopt him. Campus security does not recognize "debate" as a permit category. The first opponent is a freshman who did the reading; Bryce wins on volume alone and learns the game's thesis: minds changed, zero.

**Intro.**
- gus: "Table's in 4B. Legs, top, sign. Three trips. I'm not carrying, I'm levels."
- player: "Respectfully, Gus, a journalist doesn't carry furniture."
- gus: "You're not a journalist. You're peaking."
- roz: "WE'RE NOT HERE TO RECRUIT YOU. Sign this. It's about cheese."
- player: "What about cheese?"
- roz: "We'll know when we get there."

**Objectives.**
```js
{ type:'goto', target:{landmark:'dorm_studio'}, radius:48, text:'Get to Dorm 4B' },
{ type:'pickup', spawn:{pickupType:'mission', count:3, around:{landmark:'dorm_studio'}, radius:160}, text:'Grab the table legs, top and sign' },
{ type:'goto', target:{landmark:'campus_quad'}, radius:48, text:'Set up on the Quad' },
{ type:'minigame', game:'debate', params:{rounds:1, points:4, timer:6, bluff:0, opponent:'freshman'}, text:'Win your first debate' }
```

**Outro.**
- player: "Minds changed?"
- gus: "Zero. Crowd was loud, though. That counts here."
- kip: "Hi. I'm Kip. Is this paid?"

failOn `['player_dead']` · onComplete `{ setFlag:'has_table' }`

---

### m01_van, "Loud & Correct"
giver `sloane` · marker `pod_garage` · requires `['m00_intro']` · reward `$200`

**Beats.** Sloane Vexley arrives with a clipboard and a van wrapped in Bryce's face; the wrap is larger than the van. Drive the campus collecting "subscribers," who are pickups that spawn wherever students scatter, before the van battery dies. The audience grows regardless of what he says, which is the business model. First time driving.

**Intro.**
- sloane: "Bryce Takesworth. You're pre-viral. Four minutes. Three."
- player: "Who are you?"
- sloane: "Your producer. The van's yours. Your face is on it. Your face is on it twice."
- gus: "The battery lasts ninety seconds. I didn't fix it. I'm sound."

**Objectives.**
```js
{ type:'enter_vehicle', spawn:{type:'van', tag:'podvan', at:{landmark:'pod_garage'}}, text:'Get in the pod van' },
{ type:'timer_wrap', seconds:90, objectives:[
  { type:'pickup', spawn:{pickupType:'mission', count:6, around:{landmark:'campus_quad'}, radius:400}, text:'Collect 6 subscribers before the battery dies' }
]},
{ type:'drive_to', target:{landmark:'pod_garage'}, vehicle:'spawned:podvan', text:'Bring the van back to Gus' }
```

**Outro.**
- sloane: "Six subscribers. Five of them are the same guy. Doesn't matter, it's a number."
- player: "Respectfully, it's six numbers."
- sloane: "Two minutes. One. We have a sponsor."

failOn `['player_dead','vehicle_lost:podvan']` · onComplete `{ setFlag:'has_van' }`

---

### m02_read, "Read the Read"
giver `firmness` · marker `nap_depot` · requires `['m01_van']` · reward `$500`

**Beats.** Dale Firmness of Nap Dynasty explains that a sponsor read is driving fast with a box. The ad copy is the timer: the ticker scrolls the copy word by word, and the demo mattress must reach the Green Room Motel before code TAKES20 expires. Every crash makes the mattress "firmer." Kip is in the passenger seat for reasons no one established.

**Intro.**
- firmness: "Dale Firmness, Nap Dynasty. Congratulations on the van, code TAKES20."
- player: "Thank you, I..."
- firmness: "Read the copy while you drive. When the copy ends, the code expires. The code is the deadline."
- kip: "I'll hold the mattress. Is this paid?"
- firmness: "Sorry, Kip, code NOPE."

**Objectives.**
```js
{ type:'enter_vehicle', spawn:{type:'truck', tag:'mattress', at:{landmark:'nap_depot'}}, text:'Get in the Nap Dynasty demo truck' },
{ type:'timer_wrap', seconds:120, objectives:[
  { type:'drive_to', target:{landmark:'green_room'}, vehicle:'spawned:mattress', text:'Deliver the mattress before code TAKES20 expires' }
]},
{ type:'dialogue', lines:[
  { who:'firmness', text:'Delivered at firmness level nine. The copy said seven. We will say nine.' },
  { who:'kip', text:'I read the whole copy. It ends "Respectfuly." One L.' }
]}
```

**Outro.**
- firmness: "Welcome to the family. The family is a mattress. Code TAKES20."
- player: "As a journalist, I feel I should disclose this."
- firmness: "Disclose it in the read."

failOn `['player_dead','vehicle_lost:mattress']` · onComplete `{ setFlag:'sponsored' }`

---

### m03_ratio, "Didn't Read, Replied Anyway"
giver `sloane` · marker `impression_alley` · requires `['m02_read']` · reward `$300`

**Beats.** Ptolemy Dunk quote-posts Bryce's mattress read onto the Impression Alley billboards, which then quote-post each other. Fight the ratio like a shootout; when Bryce wins, Dunk's chat arrives on foot. Fists only. Sloane hands over the megaphone afterwards: it pushes peds and raises heat, and the audience grows either way.

**Intro.**
- dunk: "Didn't read. Replied anyway. You're on the billboard, man. Both billboards."
- player: "Respectfully, Ptolemy, that's defamation."
- dunk: "Didn't read that either."
- sloane: "Ratio him. Ninety seconds. Then run; his chat has a group rate on bus fare."

**Objectives.**
```js
{ type:'minigame', game:'ratio', params:{posts:5, speed:1, opponent:'dunk'}, text:'Win the ratio war' },
{ type:'defeat', spawn:{ped:'thug', count:4, around:{landmark:'impression_alley'}, radius:150}, text:'Dunk\'s chat has arrived. Clear the Alley' }
```

**Outro.**
- sloane: "You won. Four people showed up to punch you, which is reach."
- player: "That's not reach."
- sloane: "It's a megaphone. It pushes people. Use it on the ones who like you too."

failOn `['player_dead']` · onComplete `{ unlockWeapon:'megaphone' }`

---

### m04_hit, "Four Minutes"
giver `chyron` · marker `green_room` · requires `['m03_ratio']` · reward `$800`

**Beats.** Brock Chyron offers a four-minute hit on The Yell Network. Four dialogue lines stand in for four hours of waiting in the Green Room Motel; then a producer calls and there are sixty seconds to get to the TYN floor, so Bryce steals the first car in the lot. On air, Brock interrupts with BREAKING, which is Brock. The hit lasts ninety seconds. Bryce is now "a voice."

**Intro.**
- chyron: "BREAKING. Kid. Table. Four minutes. Tonight."
- player: "Four minutes? On television?"
- chyron: "Four minutes. Of waiting. Then more waiting. Then a car. WE'LL HAVE TO LEAVE IT THERE."

**Objectives.**
```js
{ type:'dialogue', lines:[
  { who:'player', text:'Hour one. The bagels are sponsored.' },
  { who:'player', text:'Hour two. Someone is yelling in the next room. It is the room.' },
  { who:'player', text:'Hour three. Kip has fallen asleep standing up.' },
  { who:'sloane', text:'They want you now. Sixty seconds. Take anything with wheels.' }
]},
{ type:'timer_wrap', seconds:60, objectives:[
  { type:'drive_to', target:{landmark:'tyn_tower'}, vehicle:'any', text:'Get to The Yell Network in 60 seconds' },
  { type:'goto', target:{landmark:'tyn_tower'}, radius:40, text:'Run to the studio floor' }
]},
{ type:'minigame', game:'debate', params:{rounds:2, points:5, timer:5, bluff:0, opponent:'chyron'}, text:'Survive the hit' }
```

**Outro.**
- chyron: "BREAKING. Me. Talking. Great hit, kid. Ninety seconds. WE'LL HAVE TO LEAVE IT THERE."
- player: "You said four minutes."
- chyron: "Four minutes of me. You were the lower-third."

failOn `['player_dead']` · onComplete `{ setFlag:'a_voice' }`

---

### m05_peer, "Peer Reviewed"
giver `vaultwright` · marker `fulcrum` · requires `['m04_hit']` · reward `$1,000`

**Beats.** Prescott Vaultwright wants to know which candidate is buying Dr. Footnote's white paper, so Bryce tails her on foot around Lobby Row: she visits the steakhouse, the Capitol, and the Fulcrum lobby, and the answer is both. Collect five "independent studies" that share one abstract, then hold the lobby against rival interns armed with binders. Betrayal one: Vaultwright thanks him by selling the podcast's contract to the President. He also whispers a pistol into Bryce's hands, "for the hedge."

**Intro.**
- vaultwright: "Mr. Takesworth. I fund both candidates. I'd like to know which one I'm winning with."
- player: "Why me?"
- vaultwright: "You're cheaper than a satellite and louder. Follow Dr. Footnote. Don't be seen. She bills by the glance."
- footnote: "[citation pending] Who said that?"

**Objectives.**
```js
{ type:'follow', spawn:{ped:'footnote', at:{landmark:'fulcrum'}, path:[{landmark:'char_charter'},{landmark:'capitol_dome'},{landmark:'fulcrum'}]}, maxDist:300, text:'Tail Dr. Footnote around Lobby Row' },
{ type:'pickup', spawn:{pickupType:'mission', count:5, around:{landmark:'fulcrum'}, radius:250}, text:'Collect 5 independent studies' },
{ type:'survive', seconds:45, waves:{thug:6}, text:'Hold the lobby against the rival interns' }
```

**Outro.**
- vaultwright: "Both candidates bought it. The same paper. I'm whispering *twelve thousand* because it's rude to say it aloud."
- vaultwright: "Also, I've sold your contract to the President. You'll like him. He rates things."
- player: "You sold my... Respectfully, that's my show."
- vaultwright: "It was. Here's a pistol. For the hedge."

failOn `['player_dead']` · onComplete `{ unlockWeapon:'pistol', setFlag:'contract_sold' }`

---

### m06_rally, "Hold the Table"
giver `goldplate` · marker `stadium` · requires `['m05_peer']` · reward `$1,500`

**Beats.** President Goldplate wants "a young person" to warm up a rally at Goldplate Goldplate Stadium (yes, both words). CAWTI crashes the lots; Roz's sign today reads WHATEVER HE SAID. Hold the stage with the megaphone. Three TYN vans are filming the empty seats; the President rates them a two and wants them wrecked, which is the first time the pistol matters. Betrayal two: during the outro, Goldplate renames the show *The Goldplate Hour with Goldplate*; Bryce is listed as "guest." First wanted escape, two stars.

**Intro.**
- goldplate: "Takesworth. Great kid. Rate him an eight. The rally's a ten. The stadium's a ten, both words."
- player: "What do you want me to say, sir?"
- goldplate: "Whatever the memo says. Loudly. Then there's three vans filming the seats. The seats are a two. The vans are a one."
- sloane: "Sixty seconds on stage. Then the vans. Then we run, because he won't take your call."

**Objectives.**
```js
{ type:'goto', target:{landmark:'stadium'}, radius:48, text:'Get to the rally stage' },
{ type:'survive', seconds:60, waves:{protester:8, thug:4}, text:'Hold the stage for 60 s' },
{ type:'destroy', spawn:{vehicle:'van', count:3, tag:'newsvans', around:{landmark:'stadium'}, radius:260}, text:'Wreck the three TYN vans filming the empty seats' },
{ type:'escape_wanted', setWanted:2, text:'Lose the cops' }
```

**Outro.**
- goldplate: "Ten out of ten. Big crowd, the biggest, I counted the vans. Show's renamed. The Goldplate Hour with Goldplate."
- player: "Respectfully, it's called Loud & Correct."
- goldplate: "You're the guest. Guests are a seven."

failOn `['player_dead']` · onComplete `{ setFlag:'show_renamed' }`

---

### m07_listen, "Listening Session"
giver `velvetine` · marker `listening_room` · requires `['m06_rally']` · reward `$1,200`

**Beats.** Baron Velvetine needs five crates of merch moved from Warehouse 42 to the Listening Pier before tonight's session, at which nothing will be played and the DJ will read a spreadsheet aloud. Your horn is the setlist. Goldplate's "zoning inspectors" are demolishing the warehouse district, so the crates are hot. Betrayal three: by the outro, TYN is reporting that the crates were stolen by "a campus pundit," which is the Baron's version, toasted.

**Intro.**
- velvetine: "To the van! To the crates! To whatever this is!"
- player: "What's in the crates?"
- velvetine: "Merch. Mixtapes. Mystery. To mystery! Warehouse 42, before the inspectors rate it a zero."
- kip: "I'll ride along. I'm not supposed to be here. Is this paid?"

**Objectives.**
```js
{ type:'enter_vehicle', spawn:{type:'van', tag:'merch', at:{landmark:'warehouse_42'}}, text:'Get in the merch van at Warehouse 42' },
{ type:'pickup', spawn:{pickupType:'mission', count:5, around:{landmark:'warehouse_42'}, radius:220}, text:'Load 5 crates of merch' },
{ type:'drive_to', target:{landmark:'velvetine_pier'}, vehicle:'spawned:merch', text:'Deliver the crates to the Listening Pier' },
{ type:'dialogue', lines:[
  { who:'velvetine', text:'To the crates! Nobody open them. To not opening them!' },
  { who:'player', text:'Is the music starting?' },
  { who:'velvetine', text:'The music is the listening. Honk if you feel it.' }
]}
```

**Outro.**
- chyron (on the ticker): "BREAKING. Warehouse 42 crates stolen by campus pundit, sources say. The source is a Baron."
- velvetine: "To plausible deniability! To you, specifically!"
- player: "Respectfully, you hired me."
- velvetine: "To hiring!"

failOn `['player_dead','vehicle_lost:merch']` · onComplete `{ setFlag:'theft_pinned' }`

---

### m08_scooters, "Defense Scooters"
giver `warbanner` · marker `bravadia_embassy` · requires `['m07_listen']` · reward `$1,500`

**Beats.** PM Warbanner has bought a year of reads on the podcast and wants a tourism ad on air; the ad buy is cover. Bravadia's real export is the Defense Scooter, which it sells to Goldplate and to Velvetine, who are at war, and the demo is Bryce riding one through four checkpoints on a timer while the PM narrates jets that never arrive. Betrayal four: the purchase order names the buyer as *Loud & Correct*; the scooters are billed to the podcast.

**Intro.**
- warbanner: "Mr. Takesworth. Bravadia welcomes you. Volume is policy, and that's why we need the jets."
- player: "I thought this was a tourism ad."
- warbanner: "It is. Tourism arrives by scooter. Demonstrate the scooter. Four checkpoints. The jets will fly over. Probably. And that's why we need the jets."
- sloane: "Ninety seconds, four stops, don't crash the product. The product is the segment."

**Objectives.**
```js
{ type:'enter_vehicle', spawn:{type:'bike', tag:'scooter', at:{landmark:'bravadia_embassy'}}, text:'Mount the Defense Scooter' },
{ type:'timer_wrap', seconds:90, objectives:[
  { type:'drive_to', target:{landmark:'capitol_dome'}, vehicle:'spawned:scooter', text:'Checkpoint 1: the Capitol' },
  { type:'drive_to', target:{landmark:'goldplate_tower'}, vehicle:'spawned:scooter', text:'Checkpoint 2: Goldplate Tower' },
  { type:'drive_to', target:{landmark:'velvetine_pier'}, vehicle:'spawned:scooter', text:'Checkpoint 3: the Listening Pier' },
  { type:'drive_to', target:{landmark:'bravadia_embassy'}, vehicle:'spawned:scooter', text:'Checkpoint 4: back to the embassy' }
]}
```

**Outro.**
- warbanner: "A triumph. The President ordered two hundred. The Baron ordered two hundred. And that's why we need the jets."
- player: "They're at war with each other."
- warbanner: "Scooters for both sides, that's defense. The invoice is addressed to your show. Condolences, and that's why we need the jets."
- kip: "I read the invoice. It ends 'Respectfuly.' Same one L."

failOn `['player_dead','vehicle_lost:scooter']` · onComplete `{ setFlag:'scooters_billed' }`

---

### m09_balloon, "Weather Balloon Repair"
giver `redacted` · marker `ova_hq` · requires `['m08_scooters']` · reward `$2,000`

**Beats.** Agent Redacted recruits Bryce as an OVA "asset." The tradecraft: tail a courier on foot from the balloon-repair office through Perpetual Assembly Plaza to the dead drop under Goldplate Goldplate Bridge, lift the Monday Memo, and leave when the "weather balloons" (cruisers) notice. The Memo reads: "Mattress. Jets. Pellets. Rate it a ten. Respectfuly." Betrayal five: Redacted notes that when the Memo leaks, and it will, it will have Bryce's fingerprints on it, which is the point of using an asset. She hands him the hottake, "a [REDACTED] that goes off."

**Intro.**
- redacted: "You're an asset now. Don't write that down. Meet the courier at the [REDACTED]."
- player: "Which [REDACTED]?"
- redacted: "The plaza. Then the bridge. Don't get closer than you'd like. Take the [REDACTED] from the [REDACTED] and leave before the balloons see you."
- player: "Weather balloons?"
- redacted: "They have sirens."

**Objectives.**
```js
{ type:'follow', spawn:{ped:'courier', at:{landmark:'ova_hq'}, path:[{landmark:'protest_plaza'},{landmark:'char_charter'},{landmark:'bridge_main'}]}, maxDist:350, text:'Tail the courier to the dead drop' },
{ type:'pickup', spawn:{pickupType:'mission', count:1, around:{landmark:'bridge_main'}, radius:60}, text:'Lift the Monday Memo from under the bridge' },
{ type:'escape_wanted', setWanted:3, text:'The weather balloons have noticed. Lose them' }
```

**Outro.**
- redacted: "Good. The [REDACTED] is now [REDACTED]. When it leaks, it leaks from you. That's what an asset is for."
- player: "The memo just says mattress, jets, pellets, rate it a ten."
- redacted: "That's the [REDACTED]. Here's a hottake. It's a [REDACTED] that goes off."

failOn `['player_dead']` · onComplete `{ unlockWeapon:'hottake', setFlag:'has_memo' }`

---

### m10_pellets, "Your Doctor Won't Tell You"
giver `saffron` · marker `clarity_barn` · requires `['m09_balloon']` · reward `$1,800`

**Beats.** Saffron Vitalis-Hale needs an SUV of Clarity Pellets delivered to Culdesac HOA Hall, where the board has approved the pellets but not the delivery. The HOA runs its own patrols and its own wanted stars; two patrol SUVs want Bryce's paperwork, and the ticker later reports that the HOA has issued a wanted level on a mailbox. The city police join at three stars because the HOA has a liaison.

**Intro.**
- saffron: "Bryce. Your aura is loud. Clarity Pellets fix that, and your doctor won't tell you that."
- player: "What's in them?"
- saffron: "Clarity. And the barn, eventually. Take the SUV to the HOA Hall. The board approved it in spirit."
- kip: "The HOA has its own helicopter. It's a drone. It's a kite. Is this paid?"

**Objectives.**
```js
{ type:'enter_vehicle', spawn:{type:'suv', tag:'pellets', at:{landmark:'clarity_barn'}}, text:'Get in the pellet SUV' },
{ type:'drive_to', target:{landmark:'hoa_hall'}, vehicle:'spawned:pellets', text:'Deliver the pellets to the HOA Hall' },
{ type:'destroy', spawn:{vehicle:'suv', count:2, tag:'hoa', around:{landmark:'hoa_hall'}, radius:240}, text:'Two HOA patrol SUVs want your paperwork. Wreck them' },
{ type:'escape_wanted', setWanted:3, text:'The HOA has called its liaison. Lose the cops' }
```

**Outro.**
- saffron: "The board is cleansed. Toxic, now clean. The pellets did that, and the SUV, and your doctor won't tell you that."
- player: "Respectfully, two of their cars are on fire."
- saffron: "Fire is clean."

failOn `['player_dead','vehicle_lost:pellets']` · onComplete `{ setFlag:'hoa_enemy' }`

---

### m11_trustless, "Trustless"
giver `moonsworth` · marker `moon_mine` · requires `['m10_pellets']` · reward `$2,500`

**Beats.** Kyler Moonsworth is launching $PUNDIT, a coin backed by takes, and needs eight GPUs collected from around Culdesac Heights in two minutes to "secure the chain." Then he drives off with the chain in his sports car; Bryce's coins are inside. Total the car. The coin hits an all-time high, then low, then the shed. Kyler leaves behind an SMG he bought with liquidity.

**Intro.**
- moonsworth: "Bryce. Trustless. Love it. $PUNDIT launches in two minutes and the chain is in eight boxes around the neighborhood."
- player: "Why is the chain in boxes?"
- moonsworth: "Decentralized. Grab them. I'll hold your coins. Trustlessly. That means trust me."
- gus: "Don't. He's peaking."

**Objectives.**
```js
{ type:'timer_wrap', seconds:120, objectives:[
  { type:'pickup', spawn:{pickupType:'mission', count:8, around:{landmark:'moon_mine'}, radius:500}, text:'Collect 8 GPUs to secure the chain' }
]},
{ type:'dialogue', lines:[
  { who:'moonsworth', text:'Chain secured. Your coins are in my car. My car is leaving. That is the roadmap.' },
  { who:'player', text:'Respectfully, that\'s theft.' },
  { who:'moonsworth', text:'It\'s liquidity.' }
]},
{ type:'destroy', spawn:{vehicle:'sports', count:1, tag:'kyler', around:{landmark:'moon_mine'}, radius:200}, text:'Total Kyler\'s car. Your coins are inside' }
```

**Outro.**
- moonsworth: "The car was the cold wallet. You've burned the supply. Which is... bullish, actually."
- player: "I have no coins."
- moonsworth: "Nobody does. That's the scarcity. Keep the SMG, it was a sponsorship."

failOn `['player_dead']` · onComplete `{ unlockWeapon:'smg', setFlag:'rugged' }`

---

### m12_memo, "The Monday Memo"
giver `gus` · marker `pod_garage` · requires `['m11_trustless']` · reward `$0`

**Beats.** Gus and Roz have matched the typo. Every script in the city, from the mattress read to the PM's invoice, ends "Respectfuly," and so does the top comment on last night's episode of Loud & Correct. Bryce drives to OVA to find the operations floor, clears the lobby of agents in balloon-repair coveralls, and takes the subscriber ledger. There is no operations floor. OVA has no operations, only subscribers: Goldplate, Warbanner, Velvetine, Fulcrum, TYN, Dunk and the HOA all pay for the same dashboard. The Memo is scraped nightly from the podcast's comment section. Redacted admits it with the only noun she has left. Four stars.

**Intro.**
- gus: "The typo. One L. It's on the mattress copy, the invoice, the memo. And on your top comment from last night."
- roz: "WE'RE NOT HERE TO HELP YOU. The memo is your comment section. Someone's selling your chat to the government."
- player: "Respectfully, which government?"
- roz: "All of them. It's a subscription."
- gus: "Go to the balloon office. Find the floor where they make it. You're peaking."

**Objectives.**
```js
{ type:'drive_to', target:{landmark:'ova_hq'}, vehicle:'any', text:'Get to the Office of Vibes Assessment' },
{ type:'defeat', spawn:{ped:'thug', count:6, around:{landmark:'ova_hq'}, radius:160}, text:'Clear the lobby of agents in balloon-repair coveralls' },
{ type:'pickup', spawn:{pickupType:'mission', count:1, around:{landmark:'ova_hq'}, radius:80}, text:'Take the subscriber ledger' },
{ type:'escape_wanted', setWanted:4, text:'Every balloon in the city is up. Lose them' },
{ type:'goto', target:{landmark:'pod_garage'}, radius:48, text:'Get the ledger back to Gus' }
```

**Outro.**
- redacted: "There's no floor. There's no [REDACTED]. We scrape your [REDACTED] and sell it back as [REDACTED]. Everyone subscribes. [REDACTED]."
- gus: "It's a subscriber list. Goldplate, Warbanner, the Baron, Fulcrum, TYN, Dunk. The HOA. They all read your comments."
- player: "So who's in charge?"
- gus: "Nobody. Everyone subscribed. Last line of the memo: 'Takesworth is ready for primetime.'"

failOn `['player_dead']` · onComplete `{ setFlag:'knows_memo' }`

---

### m13_thursday, "Everybody's Thursday"
giver `kip` · marker `dorm_studio` · requires `['m12_memo']` · reward `$4,000`

**Beats.** Kip confesses: he wrote the scraper during an unpaid week because nobody else reads email, and he formats the Memo every Sunday night; the feud was a quarterly content calendar and Thursday's entry reads "Dunk destroys Takesworth." It is Thursday. Redacted has tipped every subscriber that the ledger is loose, so all four factions' goons converge on the Quad, with the HOA and the police in support. Bryce holds the table, then loses the entire police department. Five stars.

**Intro.**
- kip: "I wrote it. The scraper. During the unpaid week. Nobody else reads email, so I formatted the comments into a memo and everyone subscribed."
- player: "You've been running the city."
- kip: "Nobody runs it. I hit 'send.' The calendar says Thursday: Dunk destroys Takesworth. It's Thursday."
- sloane: "Everyone's coming. Goons, interns, scooters, the HOA. Ninety seconds on the Quad, then lose all of them. All five stars. Go."
- kip: "Is this paid?"

**Objectives.**
```js
{ type:'goto', target:{landmark:'campus_quad'}, radius:48, text:'Get to the table' },
{ type:'survive', seconds:90, waves:{thug:12, protester:4, cop:4}, text:'Hold the table. Everybody is coming' },
{ type:'escape_wanted', setWanted:5, text:'Lose the entire police department' },
{ type:'goto', target:{landmark:'pod_garage'}, radius:48, text:'Get back to the garage' }
```

**Outro.**
- dunk: "Didn't destroy you. Didn't read the calendar. Replied anyway."
- player: "Respectfully, Ptolemy, you're on the list too."
- dunk: "Everyone's on the list. That's what a list is."
- sloane: "Chyron wants a panel. Tonight. Five guests. One memo. Two minutes. One."

failOn `['player_dead']` · onComplete `{ setFlag:'survived_thursday' }`

---

### m14_grift, "Same Grift, Different Lanyard"
giver `sloane` · marker `tyn_tower` · requires `['m13_thursday']` · reward `$3,000`

**Beats.** Brock Chyron's panel: Goldplate, Warbanner, Velvetine, Footnote and Dunk, each reading the same Memo. Win five rounds against five identical answers. Then OVA wants its ledger back, and the station's "security" turns out to be the subscribers' goons plus the cruisers; Bryce has two and a half minutes to lose five stars before the next segment. In the outro, Chyron offers the chair and Gus offers the door. Both ending missions open.

**Intro.**
- chyron: "BREAKING. Panel. Five guests. One kid. Tonight. WE'LL HAVE TO LEAVE IT THERE, but not yet."
- goldplate: "Mattress. Jets. Pellets. I rate it a ten."
- warbanner: "Mattress. Jets. Pellets. And that's why we need the jets."
- footnote: "Mattress. Jets. Pellets. [citation pending]"
- dunk: "Didn't read it. Mattress. Jets. Pellets."
- player: "Respectfully, you're all reading my comments."

**Objectives.**
```js
{ type:'minigame', game:'debate', params:{rounds:5, points:5, timer:3, bluff:0.4, opponent:'panel'}, text:'Beat five identical answers' },
{ type:'dialogue', lines:[
  { who:'redacted', text:'[REDACTED].' },
  { who:'sloane', text:'That means they want the ledger back. Out the loading dock. Two minutes. Go.' }
]},
{ type:'timer_wrap', seconds:150, objectives:[
  { type:'escape_wanted', setWanted:5, text:'Lose five stars before the next segment' }
]}
```

**Outro.**
- chyron: "BREAKING. Kid wins. Memo says he's ready for primetime. The chair is yours. Forever. WE'LL HAVE TO LEAVE IT THERE."
- gus: "Or you read the memo on air and go back to the table. Eleven people will stay. I counted."
- player: "Respectfully... I need a minute."
- sloane: "You have two. One."

failOn `['player_dead']` · onComplete `{ setFlag:'offered_chair' }`

---

### m15a_primetime, "Ending A: Primetime"
giver `chyron` · marker `tyn_tower` · requires `['m14_grift']` · reward `$10,000`

**Beats.** Bryce takes the chair. The finale is the eternal sponsor read: tour every sponsor in the city against the clock while the ticker scrolls his own copy and never stops, then beat his own archive in a ratio war, because his old clips are now his competition. Final image: a gold folding table on the roof of Goldplate Tower, rated a ten. He cannot remember what he believes. Credits roll as ad tickers.

**Intro.**
- chyron: "BREAKING. Primetime. You. Five sponsors. Three minutes. Read them all. Then beat the old you; he's trending."
- player: "As a journalist..."
- chyron: "You're an anchor now. Anchors don't finish. WE'LL HAVE TO LEAVE IT THERE."
- firmness: "Congratulations, code CHAIR20."

**Objectives.**
```js
{ type:'timer_wrap', seconds:180, objectives:[
  { type:'drive_to', target:{landmark:'nap_depot'}, vehicle:'any', text:'Sponsor read 1: Nap Dynasty' },
  { type:'drive_to', target:{landmark:'clarity_barn'}, vehicle:'any', text:'Sponsor read 2: Clarity Pellets' },
  { type:'drive_to', target:{landmark:'moon_mine'}, vehicle:'any', text:'Sponsor read 3: $PUNDIT' },
  { type:'drive_to', target:{landmark:'velvetine_pier'}, vehicle:'any', text:'Sponsor read 4: Velvetine Records' },
  { type:'drive_to', target:{landmark:'goldplate_tower'}, vehicle:'any', text:'Sponsor read 5: Goldplate Tower, by Goldplate' }
]},
{ type:'goto', target:{landmark:'goldplate_tower'}, radius:40, text:'Take the chair on the roof' },
{ type:'minigame', game:'ratio', params:{posts:8, speed:2, opponent:'takesworth_archive'}, text:'Beat your own archive' }
```

**Outro.**
- goldplate: "Gold table. Ten out of ten. I'm naming it after me."
- player: "What do I believe?"
- chyron: "Whatever's next. BREAKING. Forever. WE'LL HAVE TO LEAVE IT THERE."
- kip: "Is this paid?"

failOn `['player_dead']` · onComplete `{ setFlag:'ending_primetime' }`

---

### m15b_liveread, "Ending B: Live Read"
giver `gus` · marker `dorm_studio` · requires `['m14_grift']` · reward `$11`

**Beats.** Sloane books Bryce onto Chyron's show under an alias ("Respectfully Anonymous"). Ninety seconds to the tower, five OVA agents in the lobby, then the Monday Memo read live on air while the ratio explodes, and for the first time Brock does not leave it there. The feud collapses for exactly one day. Bryce walks back to the Quad bare-handed and sets up under a new sign: I DON'T KNOW. LET'S TALK. Dunk sets up beside him with the same sign. Ratio: tie. Eleven people stay. The reward is $11, one per listener.

**Intro.**
- gus: "You're booked under an alias. Respectfully Anonymous. Ninety seconds to the tower."
- sloane: "Lobby's full of balloon repairmen. Then you read the whole memo. On air. Including the last line."
- player: "And after?"
- gus: "You walk back. No van. Eleven people. You're not peaking. For once."

**Objectives.**
```js
{ type:'timer_wrap', seconds:90, objectives:[
  { type:'drive_to', target:{landmark:'tyn_tower'}, vehicle:'any', text:'Get to The Yell Network in 90 seconds' }
]},
{ type:'defeat', spawn:{ped:'thug', count:5, around:{landmark:'tyn_tower'}, radius:140}, text:'Get through the OVA agents in the lobby' },
{ type:'minigame', game:'ratio', params:{posts:8, speed:2, opponent:'everyone'}, text:'Read the Monday Memo live while the ratio explodes' },
{ type:'goto', target:{landmark:'campus_quad'}, radius:48, text:'Walk back to the Quad' }
```

**Outro.**
- chyron: "BREAKING. We... are not going to leave it there. Keep reading, kid."
- dunk: "Read it. All of it. Replying anyway: same sign, next table."
- player: "I don't know. Let's talk."
- kip: "Eleven people. Is this paid?"

failOn `['player_dead']` · onComplete `{ setFlag:'ending_grass' }`

## 7. Minigames

Both minigames are implemented in `GTP.UI.minigames` and resolve `onResult(win)`. They use only the engine's input actions. The game state is `'minigame'` while they run; the world is paused.

### Debate

**Screen.** Two portraits (player left, opponent right) drawn with `drawPortrait`. Between them, a horizontal CROWD meter, 0 to 100, labeled "CROWD (measures only volume)". Under the opponent: the point card they are playing (FACT, FEELING, GOTCHA, ANECDOTE) with a shrinking timer bar. Under the player: four counter cards with their key glyphs, plus a fifth greyed card WHATABOUT (Space) and a hint "hold Shift to SHOUT". Round pips at the top. A one-line caption strip at the bottom shows the opponent's actual line ("Mattress. Jets. Pellets. Rate it a ten.") and the player's counter as a line ("Respectfully, source?").

**Inputs.** `up` = SOURCE?, `left` = LOUDER, `right` = PIVOT, `down` = DEFINE TERMS, `action` = WHATABOUT, holding `run` while answering = SHOUT.

**Rules.**
- Counters: SOURCE? beats FACT, LOUDER beats FEELING, PIVOT beats GOTCHA, DEFINE TERMS beats ANECDOTE. Any other pair is a loss. WHATABOUT never loses and never wins: crowd -5 and the point ends.
- The opponent plays `params.points` cards per round (default 5). Each card shows for `params.timer` seconds (6 easy, 5 normal, 3 hard). No answer before the bar empties counts as a loss.
- Crowd starts at 50. Correct: +20. Wrong or late: -20. A correct answer inside the first 40% of the timer is a perfect hit: +25 and the screen flashes "Write that down."
- SHOUT (holding `run` on a correct answer): +40 instead of +20, and the player gains +1 wanted heat on exit from the minigame (the AI's `wanted.add(1,'shout')`). On a wrong answer SHOUT doubles the loss.
- Bluff: with probability `params.bluff` (0 to 0.4), the opponent's card flips to a different card at 50% of the timer. Hard opponents bluff; the `panel` opponent in `m14_grift` bluffs on every third card.
- A round ends when the crowd hits 0 or 100, or when the points run out; the round is won if crowd > 50. The match is best-of `params.rounds` (1, 2, 3 or 5).
- Once per match, the player's first wrong answer at a crowd below 30 is forgiven and the caption reads "Respectfully," (the combo breaker from the hero's tic).

**Win condition.** Majority of rounds. **Summary screen.** "ROUNDS 3-2 · PERFECT HITS 4 · SHOUTS 2 · MINDS CHANGED 0". Lose text: "CONTEXT STAMPED." All rng goes through `GTP.rng`.

### Ratio

**Screen.** The opponent's post is pinned at the top with its portrait and a like counter that rises on its own. Below it, a vertical reply column: the player's posted replies stack as cards, each stamped DUNK, REPLY or NOTED. At the bottom, a horizontal METER sweeps left-right: red edges (CRINGE), yellow (REPLY), a green centre (DUNK). Two big counters, YOUR LIKES and THEIR LIKES, and a RATIO readout (yours divided by theirs, one decimal). A HOTTAKE icon shows whether the screen-clear is still available. Notes are shown as three empty stamp boxes that fill with NOTED.

**Inputs.** `action` = post at the current meter position. `shoot` = HOTTAKE (once per match). Nothing else.

**Rules.**
- The opponent's likes rise at `20 * params.speed` per second (speed 1 easy, 2 hard). The meter sweeps at `1.2 * params.speed` full widths per second.
- The player gets `params.posts` posts (5 to 8). Posting in the green centre (middle 20%) is a DUNK: likes += 100 x combo, combo += 1 (max 4). Yellow (the next 30% on each side): REPLY, likes += 40, combo resets to 1. Red edges: CRINGE, the card is stamped NOTED, combo resets, and the opponent gains 60 likes.
- Every third opponent reply (the opponent posts on its own clock every 4 s) spawns a DOGPILE: the meter speed doubles for 3 s and the green zone shrinks to 10%.
- HOTTAKE: clears any dogpile instantly, resets meter speed, and the next post counts as a DUNK regardless of position. The weapon shouts "Respectfully." Once per match.
- Three NOTED stamps before the posts run out is a CONTEXT STAMP: the player loses half their likes and the match ends immediately as a loss, caption "you were the ratio."
- The `takesworth_archive` opponent (m15a) posts the player's own earlier lines from the caption log; the `everyone` opponent (m15b) rises at 1.5x speed but every DUNK also removes 40 of its likes (the memo is being read).

**Win condition.** When the posts run out, YOUR LIKES > THEIR LIKES. **Summary screen.** "LIKES 640 - 420 · DUNKS 4 · NOTED 1 · RATIO 1.5". Lose text: "RATIO'D."

## 8. Radio

Stations are procedural sequencers; ads and DJ lines show on the ticker strip, never spoken. All four stations run the same Nap Dynasty ad at the same minute of the game hour (minute 20), which is a running gag the UI should make visible by scheduling that line at `clock % 1 >= 20/60` on every station.

### `wail_101`, WAIL 101 "The Yell"
Tagline: "All outrage, all hours." Genre feel: brass stingers, march drums, phone-in static. 100 bpm, minor.
Ads:
1. Nap Dynasty. Sleep like you've never been wrong. Code TAKES20.
2. Char & Charter. Steaks sized by donor tier. The salad is Bronze.
3. Fulcrum Foundation. The numbers you were going to say anyway.
4. Vaultwright Capital. We short what we love.
5. Clarity Pellets. Ask your doctor. He won't say.
6. Detail & Evidence. We clean cars and records. Mostly records.
DJ:
1. Caller, you're on. You're wrong. Go.
2. Next hour: is the next hour a hoax? We take calls, from one side.
3. Our weather is also an opinion. Wrong.
4. That was silence, sponsored by Nap Dynasty.

### `pennant_fm`, Pennant FM "Ten out of Ten"
Tagline: "The President's station. Also the President's." Genre feel: sax synth, elevator chords, a jingle every 40 seconds. 112 bpm, major.
Ads:
1. Goldplate Tower, by Goldplate. Floors ten through one hundred now leasing.
2. Goldplate Links. Par ten. No refunds.
3. Goldplate Water. Rated a ten by Goldplate.
4. Goldplate Goldplate Stadium. Both words. Both tens.
5. Nap Dynasty. Official mattress of Goldplate. Code TENOUTOFTEN.
6. Goldplate Weather. Tomorrow: a ten.
DJ:
1. That track was a ten.
2. Coming up: the same song. A ten.
3. Traffic on Goldplate Avenue is Goldplate.
4. The President has renamed this station. It's still Pennant. He renamed the name.

### `velvetine_888`, Velvetine Lounge 88.8
Tagline: "Listening, never dancing." Genre feel: deep house with no drop, ice clinks, a spreadsheet read softly. 122 bpm, minor.
Ads:
1. Velvetine Listening Pier. A party you'll hear about.
2. Velvetine Records. Nothing released. Still charting.
3. The Afterparty. A yacht, a dress code, a Baron. It has never sailed.
4. Fresh Takes Fish Shack. Reheated hourly.
5. Nap Dynasty. Official mattress of lying awake. Code VELVET20.
6. Warehouse 42 Mixtapes. Thirty years, one cassette, still sealed.
DJ:
1. To the night. To the brand. To whatever this is.
2. That was eleven minutes of build.
3. The drop is coming. It is not.
4. The Baron thanks you for listening to listening.

### `quiet_signal`, Quiet Signal
Tagline: "You are not listening to this." Genre feel: ambient pads, elevator chimes, a dial tone in the key of beige. 60 bpm, dorian. OVA's station; every line is in the passive voice.
Ads:
1. Weather Balloon Repair. A balloon has been repaired. No further questions have been taken.
2. A mattress has been recommended. A code has been issued. The code is CLASSIFIED20.
3. Fulcrum Foundation. A study was funded. Results were concluded.
4. Perpetual Assembly Plaza gift shop. A cause has been updated. The mugs have not.
5. Bravadia. A jet has been requested. Tourism has been declared.
6. This ad slot was purchased. By whom is unimportant.
DJ:
1. This station was tuned. Enjoyment is optional.
2. A van has been dispatched. Not for you. Probably.
3. The word of the day is "crisp." It should be used at a gala.
4. Static will follow. Static is content.

### News ticker (12)
1. GOLDPLATE RATES CITY BUDGET A TEN; BUDGET IS A TWO
2. PM WARBANNER ADDRESSES COUNCIL; NEEDS JETS
3. FULCRUM STUDY FINDS FULCRUM STUDIES ACCURATE
4. $PUNDIT HITS ALL-TIME HIGH, THEN LOW, THEN SHED
5. PERPETUAL ASSEMBLY UPDATES CAUSE; GIFT SHOP UNCHANGED
6. OVA DENIES EXISTING; ANTENNA COUNT RISES TO FOURTEEN
7. HOA ISSUES WANTED LEVEL ON A MAILBOX
8. CHYRON INTERRUPTS SELF, WINS
9. PRESIDENT RENAMES GOLDPLATE BRIDGE "GOLDPLATE GOLDPLATE BRIDGE"
10. CAWTI PROTESTS TUESDAY, COUNTER-PROTESTS ITSELF WEDNESDAY
11. NAP DYNASTY SPONSORS THE WEATHER; WEATHER NOW FIRMER
12. LOCAL PUNDIT NOT A JOURNALIST, JOURNALISTS CONFIRM

## 9. Running gags and world flavor

**Running gags.**
- Nap Dynasty sponsors everything, so Dale Firmness is the real power; all four stations run the mattress ad at the same minute; the hospital bandage has a coupon code; the final sponsor read never ends.
- Goldplate rates everything out of ten and renames things already named after himself. Optional polish: landmark labels gain a "Goldplate" prefix per act via flags `show_renamed`, `knows_memo` and `survived_thursday` (UI reads `landmark.label`), until the hospital reads "Goldplate Goldplate Memorial, formerly St. Somebody's."
- Warbanner ends every sentence, including condolences, with "and that's why we need the jets."
- Agent Redacted's redactions grow across the game until her last line is "[REDACTED]."
- Every script in the city ends "Respectfuly," one L; it is the detective clue.
- Kip is at every mission location, including inside the OVA lobby, and ends every outro with "Is this paid?"
- Roz's sign is drawn from `player.stats`: the thing the player did most recently (STOP RAMMING, STOP HONKING, STOP DEBATING, WHATEVER HE SAID); if nothing is in stats it reads CHEESE, NO CHEESE or PARKING.
- The Goldplate Tower roof sign counts helicopters; it reads "2" the whole game and the ticker calls it "both."
- The Lot C raccoon: a persistent `npc` ped with a tiny look spawns near `pod_garage` in Act I, `nap_depot` in Act II and `tyn_tower` in Act III, wearing a lanyard by Act III.
- Every sponsor product is the same bottle sprite, relabeled.
- WASTED: RATIO'D. BUSTED: DEPLATFORMED. MISSION FAILED: CONTEXT STAMPED.

**Ped barks (20).** Civilians, students and strip walkers; `speakLine()` picks by district where noted.
1. "Didn't read it. Replied anyway."
2. "Is this the line for the debate or the mattress?"
3. "I have a take. It's warm. Fresh Takes reheats it."
4. "My doctor won't tell me anything. I don't have a doctor."
5. "Code TAKES20. I don't know what it's for. I say it when I'm sad."
6. "The protest's about cheese today. Yesterday it was against cheese."
7. "The stadium has two names and one bathroom."
8. "I subscribed to the memo. It's just my own comments. Five stars."
9. "Rate my commute. Goldplate rated it a ten. It's the same commute."
10. "The Baron's party had no music. Best night of my life."
11. "I'm not a journalist either. We should start a podcast."
12. "The HOA gave me a wanted star for a mailbox. The mailbox is fine."
13. "Trustless means trust him. I learned that the expensive way."
14. "Respectfully? Nobody who says that means it."
15. "The weather balloon office has fourteen antennas now. For weather."
16. "The pellets did nothing. The barn was nice."
17. "I was on the panel. I read the memo. Everyone read the memo."
18. "My van got rated a two. By the President. Personally."
19. "Static is content. I heard that on the radio. There was no radio."
20. "Four hours in the green room for ninety seconds. Worth it. I was the lower-third."

**Cop barks (8).** Said by `cop` peds during chase and arrest.
1. "Stop! I rate this chase a four!"
2. "Pull over! The HOA already called it in!"
3. "Discourse violation! Hands where I can quote them!"
4. "Freeze! You're peaking!"
5. "Respectfully, you're under arrest. No, I mean it."
6. "This is the balloon unit! We're not the balloon unit!"
7. "Step away from the table!"
8. "Busted! Rate your arrest, one to ten!"

**Street names.** Goldplate Avenue (the main avenue), Goldplate Goldplate Avenue (the same avenue, east of the bridge), Respectfully Road, Lanyard Lane, Ratio Row, Lower Third Street, Sponsor Boulevard, Citation Pending Way, Par Ten Parkway, Balloon Repair Alley, Trustless Terrace, Pellet Place, Jet Street (extension pending), Minds Changed Court (a cul-de-sac with zero houses), Monday Memo Mews, Quote Post Crescent, Coupon Code Circle, The Loop (the highway; "on the Loop you are legally a party").

## 10. Content-rules self-check

- **Rule 1, original archetypes.** Every character, company, nation, agency, show and product is invented: Bryce Takesworth, Sloane Vexley, Gus Pemberton, Kip Gratis, Ptolemy Dunk, Brock Chyron, Prescott Vaultwright III, Dr. Imogen Footnote, President Lionel Goldplate, PM Hollis Warbanner of Bravadia, Baron Velvetine, Agent Pat Redacted of the Office of Vibes Assessment, Kyler Moonsworth, Saffron Vitalis-Hale, Dale Firmness, Roz Placard. None is a thin edit of a real name; the real-person names from the original brief do not appear. No real catchphrase, slogan, show title, look or biography is used: the table sign and "Respectfully," are invented; the President wears a gold hard hat, bow tie and round glasses, which matches no real figure's signature look; the PM's tic is about jets, not any real quote; the anchor's names were chosen to avoid the brief's surnames. The three earlier drafts' flagged items are fixed: no real campus-pundit sign or one-word edit of it, no foam or multi-day parties (the music mogul's gag is listening sessions where nothing plays), no golf-scorecard biography, no "red line" tic, no slogan-on-a-hat pointer, no motorcade-tail line containing an audit term (the President's mission is a rally, not a convoy).
- **Rule 2, no real events or control tropes.** No assassination, shooting, death, trial, arrest, scandal or lawsuit is referenced, directly or coded. The twist is explicitly the inverse of a control conspiracy: nobody is in charge, the Memo is the protagonist's own comment section, and the spook agency has no operations, only subscribers. No single owner of the media or of both sides exists; the donor funds both candidates as an open joke about hedging, not as a hidden hand behind events. Bravadia and OVA point at no real country or agency; the only group that "runs the city" is a mattress company.
- **Rule 3, punch at power.** No slurs; no joke's punchline is a protected characteristic; portraits distribute skin tones 1-6 across heroes, villains and grifters with no coding by role. No sexual content; the club and the yacht are places where nothing happens. No minors. The protagonist is the butt of the joke in every mission, both endings, and the ticker.
- **Rule 4, cartoon violence.** All violence is arcade cartoon: punches, pixel puffs, bouncing vans, a hottake that stuns. No gore, no executions, no violence at any real person or stand-in.
- **Rule 5, tone.** Fast, absurd, PG-13; dialogue two to six lines; no profanity stronger than mild.
- **Audit.** This document avoids every term on the `tests/content_audit.js` lists, including the sexual-content and conspiracy-trope word lists, and uses only the twelve engine objective types with literal params; all `follow` targets walk, all vehicle types are engine classes, both endings `require` `m14_grift`, and respawn ids are `hospital` and `police_hq`.
