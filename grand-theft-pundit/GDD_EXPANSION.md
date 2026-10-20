# GRAND THEFT PUNDIT: Expansion Design Document

*Everything is still content. Now there is more of it.*

This is the single source of truth for everything new in the expansion. It extends `GDD.md` (base content truth) and obeys `CONTENT_RULES.md` and the engine contract in `ARCHITECTURE.md`. Every id is lowercase snake_case and is the id engineers use in `js/24_content_expansion.js`, `js/20_content_world.js` (new districts, landmarks, streets) and the runtime modules. Where this document and `GDD.md` disagree about a number for an existing mission, this document wins (§3.4 lists the retunes). Nothing here renames or removes an existing id.

Conventions: tiles are 4 m, `x` east, `z` south, `y` up; mission distances (`radius`, `maxDist`) stay in GDD units (8 per metre); money is dollars; times are seconds; angles in the arsenal table are radians unless marked `°`.

---

## 1. City expansion: Grievance City grows

The map grows from 160 x 160 to **224 x 224 tiles** (896 m square). `GTP.C.MAP_W = MAP_H = 224`. Every existing tile, road, lot, landmark and door keeps its coordinates; the sea around the old map becomes three new landmasses to the east and south, and the bay stays where it was. The minimap bake becomes 896 px; the chunk grid becomes 14 x 14 (built lazily as before).

**Where the new land goes.**

- **Heirloom Heights** (`uptown`) is a tall landmass **east of Pennant Point**, across a new 32 m **east channel** (tiles x 154..162). Old money looks across the water at the President's gold island and does not wave.
- **Goldplate International** (`airport`) is the west half of a new **south landmass across the bay** from the Sponsor Strip and Velvetine Docks (the bay is now 80 m wide, tiles z 130..150, and finally has a far shore). The runway is the south edge of the world: it ends in the sea, rated a ten.
- **Manifest Harbor** (`port`) is the east half of the south landmass, south of Heirloom Heights (the two touch along z = 150, so uptown money can drive straight down to the docks without a bridge) and east of the airport.

```js
// 20_content_world.js layout additions (tiles)
w: 224, h: 224,
land: [rect(6, 6, 112, 124), rect(128, 12, 26, 112),      // unchanged: mainland, the island
       rect(162, 8, 54, 142),                              // uptown: x 162..216, z 8..150
       rect(6, 150, 210, 66)],                             // south landmass: x 6..216, z 150..216 (airport west, port east)
sand: [ ...existing, rect(162, 8, 2, 142), rect(6, 150, 210, 2), rect(6, 196, 12, 20), rect(18, 214, 88, 2) ],   // uptown's west shore, the south shore of the bay, the 48 m beach west of the runway threshold (the sj_07 landing), the beach under the runway
```

### 1.1 The three new districts

| id | name | vibe | style |
|---|---|---|---|
| `uptown` | Heirloom Heights | Brownstones with stoops, a museum that exhibits takes under glass, a private club with a door policy older than the city; nobody here has had a new opinion since the founding and they are very proud of it; donors and old cops | `brownstone` (new) |
| `airport` | Goldplate International | The only airport rated by its owner (a ten, both runways; there is one runway); a drivable runway, hangars, a terminal where the gate changes when you reach it, a control tower that controls nothing; taxis, buses and the Sponsor Span toll | `airport` (new) |
| `port` | Manifest Harbor | Cranes, container stacks that form drivable mazes, a customs shed where everything is declared and nothing is disclosed, a ferry to Elsewhere that has never left; trucks, goons and the Lower Loop's last ramp | `port` (new) |

**New facade / roof styles** (`GTP.C.PAL.facades` and `GTP.Assets.facade`):

- `brownstone`: warm sandstone browns `['#7a4a35', '#8a5a40', '#6e4030', '#9a6a4a', '#5e3a2a']`, tall arched windows with white stone lintels, a stoop of five steps and a railing baked into the ground floor, a cornice line under a `mansard` roof (new roof texture: dark slate with two dormers; falls back to `flat` if the roof budget is tight).
- `airport`: pale panels `['#dfe3e8', '#c9d3dc', '#eef1f4']` with one long glass band per floor, a roof of vents, a red beacon strip and a painted gate number.
- `port`: corrugated metal in shipping colours `['#6f7378', '#8b5a3c', '#3f6f8a', '#8a8a7a']`, loading doors, stencilled numbers, flat roofs with vents.

```js
// 01_config.js C.DISTRICT_STYLES additions
brownstone: { lotW: [2, 4], lotH: [2, 3], gap: 0, alleyChance: 0.4, floors: [3, 5], facade: 'brownstone', roof: 'mansard', remnant: 'plaza', trees: 0.5, lamps: true, signals: true },
airport:    { lotW: [5, 9], lotH: [4, 7], gap: 2, alleyChance: 1,   floors: [1, 2], facade: 'airport',    roof: 'flat',    remnant: 'parking', trees: 0.05, lamps: true, signals: true },
port:       { lotW: [5, 9], lotH: [4, 6], gap: 1, alleyChance: 0.5, floors: [1, 3], facade: 'port',       roof: 'flat',    remnant: 'gravel', trees: 0.02, lamps: true, signals: false }
```

```js
// districts (append to layout.districts)
{ id: 'uptown',  name: 'Heirloom Heights',       x: 162, z: 8,   w: 54,  h: 142, style: 'brownstone' },
{ id: 'airport', name: 'Goldplate International', x: 6,   z: 150, w: 104, h: 66,  style: 'airport' },
{ id: 'port',    name: 'Manifest Harbor',         x: 110, z: 150, w: 106, h: 66,  style: 'port' }
```

### 1.2 Roads and street names

The grid keeps the contract (streets 2 tiles, avenues 4, blocks 8 to 14 tiles, right-hand traffic). Segments below use the `road(axis, at, from, to, name, cls, extra)` helper. Tile numbers are the design intent: the world agent may shift a lot or a segment by a tile or two to keep sidewalks and doors valid, keeping every id, district and name.

```js
// ---- the second bridge and the causeway ----
road('v', 82, 128, 149, 'Sponsor Span', 'avenue', { bridge: true, landmark: 'bridge_south' }),   // Lower Third Street crosses the bay
road('h', 70, 153, 161, 'Goldplate Goldplate Causeway', 'avenue', { bridge: true, landmark: 'causeway_east' }),   // the island to uptown

// ---- uptown (x 162..216, z 8..150) ----
road('v', 170, 10, 147, 'Provenance Place'),
road('v', 182, 10, 214, 'Trust Fund Terrace'),          // runs on through the port to the quay
road('v', 194, 10, 147, 'Heirloom Row'),
road('v', 206, 10, 214, 'Old Money Mile'),              // runs on through the port
road('h', 22, 164, 214, 'Legacy Lane'),
road('h', 34, 164, 214, 'Primary Source Street'),
road('h', 46, 183, 214, 'Endowment End'),               // starts east of the museum's double block
road('h', 58, 164, 214, 'Off The Record Road'),
road('h', 70, 162, 214, 'Inheritance Avenue', 'avenue'),   // the causeway lands here; "the only avenue Goldplate could not buy"
road('h', 82, 164, 214, 'Quiet Part Loud Lane'),
road('h', 94, 164, 214, 'Stoop Speech Street'),
road('h', 106, 164, 181, 'Vetted Vista'), road('h', 106, 195, 214, 'Vetted Vista'),   // gap for Old Money Common
road('h', 118, 164, 214, 'Generational Way'),
road('h', 130, 164, 214, 'Minds Made Up Mews'),
road('h', 142, 164, 214, 'Portfolio Parade'),

// ---- airport (x 6..110, z 150..216) ----
road('v', 82, 150, 196, 'Arrivals Avenue', 'avenue'),   // the Sponsor Span lands here
road('v', 14, 152, 196, 'Windsock Way'),
road('v', 30, 152, 196, 'Baggage Claim Boulevard'),
road('v', 50, 152, 196, 'Layover Lane'),
road('v', 94, 152, 163, 'Gate Ten Street'), road('v', 94, 177, 196, 'Gate Ten Street'),   // the Arrivals Ramp fills 168..176
road('h', 158, 8, 107, 'Departures Drive'),             // x 104..107 sit under the Lower Loop's east leg; the Manifest Ramp fills 108..116
road('h', 182, 8, 109, 'Lost Luggage Lane'),
road('h', 196, 8, 109, 'Final Boarding Boulevard'),     // the runway's north edge

// ---- port (x 110..216, z 150..216) ----
road('h', 158, 117, 214, 'Manifest Road'),
road('h', 182, 110, 214, 'Container Crescent'),
road('h', 196, 110, 214, 'Customs Close'),
road('v', 124, 152, 214, 'Bill of Lading Lane'),
road('v', 148, 152, 214, 'Dockworker Drive')
```

**New street names (30).** Sponsor Span, Goldplate Goldplate Causeway, Provenance Place, Trust Fund Terrace, Heirloom Row, Old Money Mile, Legacy Lane, Primary Source Street, Endowment End, Off The Record Road, Inheritance Avenue, Quiet Part Loud Lane, Stoop Speech Street, Vetted Vista, Generational Way, Minds Made Up Mews, Portfolio Parade, Arrivals Avenue, Windsock Way, Baggage Claim Boulevard, Layover Lane, Gate Ten Street, Departures Drive, Lost Luggage Lane, Final Boarding Boulevard, Manifest Road, Container Crescent, Customs Close, Bill of Lading Lane, Dockworker Drive, plus the ramps Arrivals Ramp and Manifest Ramp and the highway's new half, the Lower Loop ("on the Lower Loop you are legally a layover"). `GTP.Content.streets` gains an entry per name with `district` set (`uptown`, `airport`, `port`); the HUD chip reads them through `World.streetAt` as before.

### 1.3 The Loop extends: the Lower Loop

The Loop becomes a figure eight. A second ring, the **Lower Loop**, hangs off the existing south leg (z = 94) and runs down over the Strip, the Docks, the bay (a viaduct on pylons) and across the airport's north edge. The deck stays 7 m up and 4 tiles wide; the two rings share the z = 94 leg, so a car can lap either ring or the whole eight.

```js
loop: {
  name: 'The Loop', y: 7,
  legs: [
    { axis: 'v', at: 46,  from: 32, to: 95 },  { axis: 'v', at: 106, from: 32, to: 95 },   // unchanged
    { axis: 'h', at: 34,  from: 44, to: 107 }, { axis: 'h', at: 94,  from: 44, to: 107 },  // unchanged
    { axis: 'v', at: 46,  from: 96, to: 167, viaduct: [130, 150] },   // west leg south: over the Printworks edge, the Docks, the bay
    { axis: 'v', at: 106, from: 96, to: 167, viaduct: [130, 150] },   // east leg south: over the Strip garage lot, the Afterparty, the bay
    { axis: 'h', at: 166, from: 44, to: 107 }                          // the south leg: along the airport's north edge
  ],
  ramps: [
    ...the four existing ramps,
    { axis: 'v', at: 94,  start: 176, end: 168, name: 'Arrivals Ramp' },   // Gate Ten Street climbs north to the south leg
    { axis: 'h', at: 158, start: 116, end: 108, name: 'Manifest Ramp' }    // Manifest Road climbs west to the east leg
  ]
}
```

Generation notes for the world agent: the deck layer already lays over any ground tile, so the two viaduct spans (z 130..150) are deck over `WATER` with a `pillar` prop every 4 tiles at `WATER_Y` (the bridge-pylon placement, scaled 1.4), and the ground under them stays water (fall off, swim, `sinking` rules unchanged). Under the legs on land the existing corridor rules apply. The lots of `strip_garage`, `afterparty_yacht`, `memo_press` and `strip_gas` touch the new legs by one tile of parking or gravel; their buildings and pumps are clear. `laneRun` and the rest of the traffic rules need nothing new; traffic on the viaduct is just traffic.

### 1.4 The second bridge, the causeway, new parks

- **`bridge_south`, Sponsor Span** (kind `bridge`, lot `bx 78, bz 128, w 8, d 22`, `doorAt {tx: 84, tz: 140}`). The avenue crosses the bay on a four-lane deck with a toll gantry at each end (`gantry` props over the lanes, text SPONSORED CROSSING: CODE TAKES20). No actual toll is charged; the ticker claims one is. Lamps every 4 tiles, a `billboard` on the south abutment (§8.4).
- **`causeway_east`, Goldplate Goldplate Causeway** (kind `bridge`, lot `bx 153, bz 67, w 9, d 6`, `doorAt {tx: 158, tz: 67}`). A low causeway on pylons from the island to Heirloom Heights; the island end has a gold sign (GOLDPLATE GOLDPLATE CAUSEWAY), the uptown end a smaller brass plaque reading NO.
- **Parks** (`layout.parks` additions, green lots with no buildings): `rect(196, 84, 8, 8)` Inherited Green (uptown), `rect(60, 186, 10, 8)` Plane Spotters' Park (airport, between Lost Luggage Lane and the runway: benches facing south, a sign PLANES: 0 SPOTTED), `rect(134, 186, 8, 8)` Longshore Lawn (port). A second promenade, Shoreline Stroll, `rect(164, 76, 5, 60)` along uptown's west shore facing the island (trees, benches, a railing; the barks here are about the view).

### 1.5 New landmarks (16)

New kinds and their prop sets are defined under the table. Existing kinds (`bridge`, `park`, `warehouse`, `club`, `tower`) keep their behaviour.

| id | name | kind | district | gag | used by |
|---|---|---|---|---|---|
| `airport_terminal` | Goldplate International Terminal | `terminal` (new) | airport | The gate changes when you reach it; the board lists one flight, DELAYED, rated a ten. | m01b, m08b, Loud Cab, Sponsor Runs, cs_act2 |
| `airport_runway` | Runway 10/10 | `runway` (new) | airport | Numbered 10 at both ends because the President rates runways, not compass headings. | m08b, Stunt Jump sj_07, Monday Memos |
| `control_tower` | Goldplate Control | `atc` (new) | airport | Controls nothing; the man in the cab is rating the clouds. | m08b (camera), Monday Memos |
| `hangar_row` | Hangar Row | `hangar` (new) | airport | HANGAR 1 OF 1. The jet inside is a cutout; the cutout is also for sale. | m08b, Ratio Rampage rr_06, Stunt Jump sj_08 |
| `container_yard` | Manifest Container Yard | `yard` (new) | port | Every container is labelled MERCH; one of them is. | m07b, m13b, Ratio Rampage rr_07, Stunt Jump sj_09, HOA Patrol spawns |
| `manifest_quay` | Manifest Quay | `quay` (new) | port | Three cranes, one ship, zero cargo moved since the ship arrived; the ship is a listening session. | m13b, Monday Memos, Loud Cab fares |
| `ferry_terminal` | Ferry to Elsewhere | `ferry` (new) | port | Departs hourly, arrives never; the waiting room has a podium. | m07b, Loud Cab, Sponsor Runs |
| `customs_shed` | Customs & Disclosures | `warehouse` | port | NOTHING TO DECLARE, EVERYTHING TO DISCLOSE; the disclosure is a coupon code. | m09b, m07b (the inspectors' vans spawn here), Monday Memos |
| `both_sides_port` | Both Sides Arms (Harbor) | `gunshop` (new) | port | "We arm both sides. That's balance." Harbor branch: bulk discounts on rockets. | the shop (§2.4), Sponsor Runs |
| `museum_of_takes` | Museum of Takes | `museum` (new) | uptown | A thousand years of saying it louder, under glass; the gift shop sells the glass. | m05b, m12b, cs_act3 (shot 1), Monday Memos |
| `heirloom_club` | The Heirloom Club | `club` | uptown | Members since before opinions; the door policy is "who was your grandfather listening with." | m05b, Loud Cab, Sponsor Runs, Loop Race lr_03 start |
| `old_money_common` | Old Money Common | `park` | uptown | A bandstand that has never hosted a band and a statue of the first person to say "well, actually." | Ratio Rampage rr_08, Monday Memos, Stunt Jump sj_10 |
| `both_sides_uptown` | Both Sides Arms (Heights) | `gunshop` (new) | uptown | The uptown branch sells the same guns in walnut. | the shop (§2.4) |
| `both_sides_strip` | Both Sides Arms | `gunshop` (new) | strip | The flagship: a neon target, a podium, a sign reading ASK ABOUT OUR LOANER. | m03b, the shop (§2.4) |
| `bridge_south` | Sponsor Span | `bridge` | marina | Tolled per opinion; the booth takes coupon codes. | m01b (the on-ramp drive), Loop Races, Stunt Jump sj_06 |
| `causeway_east` | Goldplate Goldplate Causeway | `bridge` | uptown | The island end is gold; the uptown end is a brass plaque that says NO. | m05b, m12b, Loud Cab |

```js
// 20_content_world.js landmark entries (lot tiles, footprint tiles; same lm() helper)
lm('airport_terminal', 'Goldplate International Terminal', 'terminal', 'airport', 56, 168, 23, 12, { footprint: fp(18, 6), floors: 2, height: 9, facade: 'airport', ground: 'parking', door: 'e', sign: 'GOLDPLATE INTERNATIONAL', neon: true, gates: 4 }),
lm('airport_runway', 'Runway 10/10', 'runway', 'airport', 18, 200, 88, 14, { ground: 'runway', door: 'n', sign: 'RUNWAY 10/10', points: { east: { tx: 101, tz: 206 }, west: { tx: 20, tz: 206 } } }),   // x 18..106; the 12 tiles of sand west of the threshold are the sj_07 landing (a truck tops out at 28 m/s and lands 20 to 35 m out, never in the sea)
lm('control_tower', 'Goldplate Control', 'atc', 'airport', 86, 168, 6, 8, { footprint: fp(3, 3), floors: 11, facade: 'airport', ground: 'plaza', door: 'w', sign: 'CONTROL', roofSign: '10' }),
lm('hangar_row', 'Hangar Row', 'hangar', 'airport', 16, 162, 12, 18, { footprint: fp(9, 7), floors: 2, height: 11, facade: 'port', ground: 'parking', door: 'e', sign: 'HANGAR 1 OF 1' }),
lm('container_yard', 'Manifest Container Yard', 'yard', 'port', 126, 160, 20, 20, { ground: 'gravel', door: 'w', sign: 'MANIFEST YARD' }),
lm('manifest_quay', 'Manifest Quay', 'quay', 'port', 152, 198, 24, 18, { ground: 'plaza', door: 'n', sign: 'MANIFEST QUAY', cranes: 3 }),
lm('ferry_terminal', 'Ferry to Elsewhere', 'ferry', 'port', 186, 198, 14, 18, { footprint: fp(6, 3), floors: 1, height: 4.5, facade: 'marina', ground: 'plaza', door: 'n', sign: 'FERRY TO ELSEWHERE', neon: true }),
lm('customs_shed', 'Customs & Disclosures', 'warehouse', 'port', 186, 162, 14, 16, { footprint: fp(9, 6), floors: 2, facade: 'port', ground: 'parking', door: 'w', sign: 'CUSTOMS: NOTHING TO DECLARE' }),
lm('both_sides_port', 'Both Sides Arms (Harbor)', 'gunshop', 'port', 152, 162, 8, 8, { footprint: fp(5, 4), floors: 1, height: 5, facade: 'strip', ground: 'parking', door: 'w', sign: 'BOTH SIDES ARMS', neon: true }),
lm('museum_of_takes', 'Museum of Takes', 'museum', 'uptown', 172, 36, 8, 20, { footprint: fp(6, 12), floors: 3, height: 12, facade: 'capitol', ground: 'plaza', door: 'w', sign: 'MUSEUM OF TAKES' }),
lm('heirloom_club', 'The Heirloom Club', 'club', 'uptown', 196, 60, 8, 7, { footprint: fp(5, 4), floors: 4, facade: 'brownstone', ground: 'plaza', door: 's', sign: 'THE HEIRLOOM CLUB', awning: true }),
lm('old_money_common', 'Old Money Common', 'park', 'uptown', 184, 96, 8, 20, { ground: 'lawn', door: 'w', bandstand: true }),
lm('both_sides_uptown', 'Both Sides Arms (Heights)', 'gunshop', 'uptown', 208, 36, 6, 8, { footprint: fp(4, 4), floors: 2, facade: 'brownstone', ground: 'plaza', door: 'w', sign: 'BOTH SIDES ARMS', neon: true }),
lm('both_sides_strip', 'Both Sides Arms', 'gunshop', 'strip', 72, 97, 7, 7, { footprint: fp(4, 3), fpOffset: { x: 2, z: 1 }, floors: 1, height: 5, facade: 'strip', ground: 'parking', door: 's', sign: 'BOTH SIDES ARMS', neon: true, flagship: true, points: { range: { tx: 73, tz: 99 } } }),
lm('bridge_south', 'Sponsor Span', 'bridge', 'marina', 78, 128, 8, 22, { doorAt: { tx: 84, tz: 140 } }),
lm('causeway_east', 'Goldplate Goldplate Causeway', 'bridge', 'uptown', 153, 67, 9, 6, { doorAt: { tx: 158, tz: 67 }, points: { island: { tx: 154, tz: 67 }, uptown: { tx: 161, tz: 67 } } })
```

**New landmark kinds and prop sets** (`World._landmarkProps` cases; new prop kinds go through `GTP.Assets.prop(kind)` as instanced low-poly geometry):

- `terminal`: the building plus a `canopy` (12 x 7) over the landside curb on the door side, a taxi rank of 6 parked `taxi` (spawn table), four `jetbridge` props (an 8 m glass tube on a leg, solid, r 1.2, h 5) along the airside face, an `arrivals` sign pair (ARRIVALS / DEPARTURES, neon) on the two short faces, a `beacon` (red blinking emissive sprite, 0.5 Hz) on the roof, 6 `luggage` carts (knockable like bins: `_knockProp` list gains `luggage`) scattered on the apron.
- `runway`: no building. Ground `'runway'` maps to `T.PARKING` with a new meta bit `M.RUNWAY`; the atlas gets a `runway` tile (dark asphalt, a dashed white centreline, white threshold bars across the first and last 2 tiles of the strip, a painted "10" at each end) used for the 6-tile strip z 204..209; the rest of the lot is apron (`parking` texture). Props: `edgelight` (small emissive dot, non-solid) every 4 tiles along both strip edges, a `windsock` (orange cone on a pole, 6 m, solid r 0.3) at each end, three parked `plane` props on the north apron at lot x + 12, + 44, + 76 tiles (a 28 m airliner in Goldplate gold with GOLDPLATE AIR on the fuselage: fuselage cylinder, two wings, a tail, solid r 7, h 9; the player's car bounces off like a building), one `jet` prop (an 8 m cartoon fighter on a plinth at the east end, sign THE JET: ARRIVING), the stunt ramp `ramp_prop` (§5.7, sj_07) at the west end of the strip. `roadDir` returns null on runway tiles (free driving, no lanes); traffic never enters a lot.
- `atc`: the slim building plus a `cab` prop on the roof (a wider glass octagon, 6 m across, 3 m tall, emissive at night), a `dish`, the roof sign "10" (the `tower` rule), a `beacon`.
- `hangar`: the building (a `port` facade with one `rolldoor` decal 9 m wide taking the whole front) plus a `windsock`, two `pallet` props, a `plane` prop (scale 0.6, parked diagonally in the lot), a sign on a pole HANGAR 1 OF 1.
- `yard`: no building. Ground gravel. A grid of `container` props (2.4 x 2.6 x 6 m boxes in six colours, MERCH stencilled on each, solid) laid as stacks: columns every 3 tiles across the lot (x = lot.x + 2 + 3k tiles, k 0..5), each column running the lot's depth with a 2-tile gap every 5 tiles so the lanes cross; stack height 1..3 by hash; the 4 m lanes between columns are the drivable maze. Two `crane` props (a gantry crane, 18 m tall, 10 m span, straddling the lot's east lanes, solid legs r 0.8) and a `kiosk` (GATE: ASK INSIDE) at the door.
- `quay`: no building. Ground plaza (concrete). Three `crane` props along the water edge, a `ship` prop (a 60 m container ship moored half a tile offshore at `WATER_Y + 0.4`, solid, carrying 12 `container` props on deck, name on the hull: THE MANIFEST), bollards every 3 tiles, 8 loose containers, a sign.
- `ferry`: the waiting room (the building) plus a 2 x 6 tile pier into the water (the `dock` rule), a `ferryboat` prop (a 20 m flat ferry with a wheelhouse, moored alongside the pier, solid), a `kiosk` (TICKETS: ELSEWHERE $11), benches, a departures board sign reading NEXT FERRY: SOON.
- `gunshop`: the building (strip or brownstone facade) with a neon target sign (`sign` with `target: true`: concentric rings behind the text), a `podium` prop by the door, an `awning`. The flagship (`flagship: true`) sits its building in the lot's east half (`fpOffset`) and adds an 8 x 28 m fenced lane (`fence` props) down the lot's west side, the range, with six `cutout` targets in a column (cardboard hecklers on stands: a ped-shaped plane with a sign reading WRONG, knockable) used by m03b and by the free range (§2.4).
- `museum`: the building (capitol stone, 3 floors, a glass `dome` roof) plus six `column` props across the door face, two `banner` props (THE TAKE: 1,000 YEARS OF SAYING IT LOUDER and NOW SHOWING: YOUR COMMENTS), a `statue` (a folding table on a plinth, bronze) in front, `stanchion` props with rope (knockable), broad steps.
- `club` with `awning: true`: the existing club rule plus an `awning` prop over the door, two `stanchion` props and a `doorman` npc ped (`role 'doorman'`, stands at the door, bark pool `doorman`, §8.2).
- `park` with `bandstand: true`: the existing park rule plus a `gazebo` prop (an octagonal bandstand, 8 m, solid pillars) in the lot's centre, a `fountain` prop (round, water texture, non-solid), the `statue` ("WELL, ACTUALLY", a figure with one finger raised), 12 trees, 8 benches.

New prop kinds this adds to `GTP.World.props` and `GTP.Assets.prop`: `jetbridge beacon luggage edgelight windsock plane jet cab rolldoor pallet container crane ship ferryboat podium cutout fence column banner statue stanchion gazebo fountain gantry ramp_prop`. Knockable (`_knockProp` list): `luggage pallet stanchion cutout`.

### 1.6 Spawn tables for the new districts

```js
rolesByDistrict: { uptown: { civ: 0.6, donor: 0.25, cop: 0.15 }, airport: { civ: 0.7, cop: 0.2, npc: 0.1 }, port: { civ: 0.45, thug: 0.45, cop: 0.1 } },
density: { uptown: 0.8, airport: 0.6, port: 0.5 },
vehicles.byDistrict: { uptown: ['sedan', 'sports', 'suv', 'taxi', 'sedan'], airport: ['taxi', 'taxi', 'bus', 'sedan', 'van', 'suv'], port: ['truck', 'truck', 'van', 'sedan', 'suv'] },
parked.byDistrict: { uptown: ['sports', 'sedan', 'suv'], airport: ['taxi', 'bus', 'van'], port: ['truck', 'van'] },
parked.landmarks: { airport_terminal: { type: 'taxi', count: 6 }, hangar_row: { type: 'van', count: 2, color: '#d9cfa6' }, container_yard: { type: 'truck', count: 4 }, ferry_terminal: { type: 'sedan', count: 4 }, heirloom_club: { type: 'sports', count: 3 } },
pickups (additions): [
  { type: 'health', landmark: 'airport_terminal' }, { type: 'health', landmark: 'ferry_terminal' }, { type: 'health', landmark: 'heirloom_club' },
  { type: 'armor', landmark: 'hoa_hall' }, { type: 'armor', landmark: 'customs_shed', after: 'm09b_hotmic' },
  { type: 'cash', value: 75, landmark: 'museum_of_takes' }, { type: 'cash', value: 40, landmark: 'manifest_quay' },
  { type: 'weapon', weaponId: 'tableleg', ammo: Infinity, landmark: 'campus_quad', after: 'm03b_range' },
  { type: 'weapon', weaponId: 'revolver', ammo: 18, landmark: 'heirloom_club', after: 'm05b_provenance' },
  { type: 'weapon', weaponId: 'rifle', ammo: 60, landmark: 'hangar_row', after: 'm08b_jets' },
  { type: 'weapon', weaponId: 'hotmic', ammo: 3, landmark: 'customs_shed', after: 'm09b_hotmic' },
  { type: 'weapon', weaponId: 'sniper', ammo: 10, landmark: 'control_tower', after: 'm12b_scope' },
  { type: 'weapon', weaponId: 'ratio', ammo: 2, landmark: 'container_yard', after: 'm13b_ratio' }
]
```

The ped look pools (`GTP.Content.looks.byDistrict`) gain `uptown` (tweed, pearls, a `monocle` is not a glasses option so `round` glasses and a `bowtie`), `airport` (lanyards, neck pillows as `extra: 'none'` with a pale shirt, rolling `luggage` is a prop not a look) and `port` (hi-vis shirts `#f0b429`, beanies). The Lot C raccoon's Act II spot moves to `airport_terminal` baggage claim (it has a boarding pass).

---

## 2. Arsenal: twelve weapons

The six existing weapons keep their ids, names and numbers (nothing a green test asserts on changes); they gain magazines, bloom and recoil. Six new weapons join. `GTP.Combat.ORDER` (the cycle order and the weapon wheel order) becomes:

```js
ORDER = ['fist', 'tableleg', 'megaphone', 'pistol', 'revolver', 'smg', 'rifle', 'shotgun', 'sniper', 'hottake', 'hotmic', 'ratio']
```

### 2.1 The table

`dmg` is per hit (shotgun: per volley, split over pellets); `rate` is shots per second; `mag` / `reserve` are rounds (a weapon with no magazine reloads nothing and `ammo` is the reserve); `reload` is seconds; `spread` is the base cone half-angle in radians; `bloom` is `+per shot / max / decay per second`; `recoil` is the camera pitch kick in degrees (and, for autos, per shot); `range` in metres. Prices are the Both Sides Arms list price (weapon with one full magazine plus one spare; ammo prices in §2.4).

| id | name | class | dmg | rate | mag | reserve max | reload | spread | bloom | recoil | range | projectile | special | price | unlock / sold |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `fist` | Fists | melee | 12 | 2.5 | - | - | - | - | - | - | 1.7 | - | lunge 2.4, knock 3.2 (unchanged) | free | start |
| `tableleg` | Folding Table Leg | melee | 28 | 1.6 | - | - | - | - | - | - | 2.1 | - | knock 4.5, lunge 2.6; a second swing landing within 0.6 s is a TABLE FLIP: knockback x2, the victim slides 4 m, text fx "FLIPPED"; hits on vehicles dent them (vehicle dmg 6) | $150 | `m03b_range` unlock; pickup at `campus_quad` after it; sold everywhere |
| `megaphone` | Megaphone | special | 0 | 1.2 | - | 40 charges | - | cone 60° | - | - | 6 | - | push 18, heat 1 (unchanged); now also scatters `cutout` targets and `stanchion` ropes | $300 | `m03_ratio` unlock; sold everywhere |
| `pistol` | Pistol | pistol | 18 | 4 | 12 | 120 | 1.2 | 0.012 | 0.008 / 0.04 / 0.10 | 1.2° | 35 | hitscan | drive-by; knock 1.6; vehicleMul 0.55 (unchanged) | $450 | `m05_peer` unlock; loaner in `m03b_range`; sold everywhere after m03b |
| `revolver` | The Rebuttal | pistol | 40 | 1.6 | 6 | 60 | 2.0 (all six at once, 0.4 s per round animation) | 0.006 | 0.010 / 0.03 / 0.08 | 2.4° | 45 | hitscan | drive-by; head zone x3 (not x2); a body hit knocks the ped down (knock 3.0); vehicleMul 0.7 | $900 | `m05b_provenance` unlock; sold after it |
| `smg` | SMG | smg | 9 | 11 | 30 | 240 | 1.6 | 0.04 | 0.004 / 0.09 / 0.14 | 0.35°/shot | 30 | hitscan | drive-by; knock 0.9; vehicleMul 0.5 (unchanged) | $1,400 | `m11_trustless` unlock; sold after it |
| `rifle` | The Monologue | rifle | 24 | 5.5 | 30 | 180 | 2.0 | 0.018 (aim: 0.009) | 0.006 / 0.055 / 0.12 | 0.5°/shot | 60 | hitscan | full auto (132 dps: above the SMG's 99 at twice the range, below the sniper's 120 per shot, so the later SMG keeps the drive-by and volume niche); aiming halves the spread; the first 3 rounds of a burst from rest are at base spread (the "point"); vehicleMul 0.65; no drive-by | $2,400 | `m08b_jets` unlock; pickup at `hangar_row`; sold after it |
| `shotgun` | Shotgun | shotgun | 45 | 1.1 | 6 | 48 | shell by shell, 0.45 s each, interruptible by `shoot` | 0.085 | - | 3.0° | 12 | hitscan x6 pellets | drive-by; knock 2.5 (unchanged); vehicleMul 0.6 | $1,100 | pickup at `memo_press` after `m11_trustless` (unchanged); sold after m11 |
| `sniper` | The Fact Checker | sniper | 120 | 0.7 | 5 | 30 | 2.6 | 0.0 scoped, 0.08 from the hip | - | 4.0° | 160 | hitscan | scope overlay (§2.3), zoom 2x / 4x, breath sway 0.15° at 0.5 Hz, head zone x3, vehicleMul 1.0 (a car takes 120), the helicopter at full range; no auto-target; no drive-by | $4,500 | `m12b_scope` unlock; pickup at `control_tower`; sold after it |
| `hottake` | Hot Take | thrown | 12 | 1 | - | 12 | - | - | - | - | 20 | lobbed (speed 21) | 5 m stun (unchanged) | $90 for 3 | `m09_balloon` unlock; sold after it |
| `hotmic` | Hot Mic | thrown | 60 blast (180 to vehicles: one mic wrecks a parked van or SUV, two a truck) | 0.8 | - | 8 | - | - | - | - | 24 | lobbed (speed 18, restitution 0.4, two bounces) | 2.5 s fuse; the red ON AIR light on the mic blinks faster toward the bang; blast radius 6 m; 5 m knockdown ring beyond the blast; it was on the whole time | $120 each, $400 for 4 | `m09b_hotmic` unlock; pickup at `customs_shed`; sold after it |
| `ratio` | Ratio Launcher | launcher | 200 blast | 0.5 | 1 | 6 | 3.0 | 0.0 | - | 6.0° | 120 | rocket (40 m/s, straight for 3 s, then drops) | blast radius 8 m (`explodeRadius`), direct vehicle hit = instant wreck; backblast pushes the shooter 1.5 m; lock-on prefers vehicles and the helicopter; a rocket on the ground says RATIO'D in the pink text fx; no drive-by | $7,500; rockets $600 each | `m13b_ratio` unlock or 40 Monday Memos; pickup at `container_yard`; sold after m13_thursday |

Shared rules:

- Every gun's ammo is `{mag, reserve}` on `player.ammo[id]`; `player.weapons[id]` stays the total for save compatibility (`mag + reserve`) and for the HUD (`AMMO 12 | 108`). AI shooters keep the old infinite model.
- A reload starts on the new input action `reload` (bound to R; the radio moves to N, see §6.8) or automatically when `shoot` is pressed on an empty magazine. Reloading cancels on a weapon switch (the rounds are kept), on entering a vehicle, and on a knockdown.
- Hit zones (§2.2) multiply `dmg`: head x2 (revolver and sniper x3), torso x1, lower sphere (legs) x0.7. Knocked-down peds use the single prone sphere at x1.
- `C.MISSIONS.weaponAmmo` gains `tableleg: Infinity, revolver: 24, rifle: 90, sniper: 10, hotmic: 4, ratio: 3`. `Combat.SPONSOR` labels for the relabeled bottle: `tableleg: "FOUNDERS' COLLEGE", revolver: 'VAULTWRIGHT CAPITAL', rifle: 'BRAVADIA', sniper: 'FULCRUM', hotmic: 'THE YELL NETWORK', ratio: 'BOTH SIDES ARMS'`; colours `#8a4a3a #e8b53a #3d6fcf #8a94c8 #c94040 #3fd27f`.
- Weapon meshes (`05b_assets_weapons.js`): low-poly, vertex-coloured, held in the right hand pivot: table leg (a chrome tube with a folding bracket), revolver (a long barrel, a wooden grip), rifle (a boxy body, a straight magazine, a carry handle), sniper (a long barrel, a scope tube, a bipod folded), hot mic (a handheld mic with a red ON AIR cap and a cable tail that trails in flight), launcher (a tube with a pink RATIO stencil and a shoulder rest). Pickup crates show the weapon on a crate with the sponsor bottle beside it, as now.

### 2.2 Shooting feel

- **Reload animation and sound.** `ped.reloadT` (seconds remaining) is set by Combat; `syncMesh` drops the right forearm 35° and brings the left hand to the magazine for the first half, then back with a snap. SFX `reload` (two clicks and a slide, pitch per class: pistol high, shotgun low; the shotgun plays one click per shell) and `reloadDone` (a soft clack). A reload shows a thin arc around the crosshair that fills over the reload time.
- **Bloom.** Each shot adds `bloom.add` to the current cone, capped at `bloom.max`; the cone decays at `bloom.decay` per second while not firing and twice as fast while standing still and aiming. The crosshair's four ticks spread with the cone (4 px at base, 22 px at max). Sustained SMG or rifle fire visibly opens the crosshair; a half-second pause tightens it.
- **Recoil.** A shot kicks the camera rig pitch up by the weapon's recoil and the yaw by a random +-20% of it (Combat's rng), recovered by `damp` over 0.25 s (autos: 0.12 s). In a car the drive-by kick is halved. The crosshair rises with the kick and falls back.
- **Hit zones.** The ped ray test gains a **head sphere** at `y + 1.55 * scale`, radius `0.22 * scale`, tested before the two body spheres; a hit there is `zone 'head'`, the upper body sphere `'torso'`, the lower `'legs'`. Multipliers in §2.1. A head hit on a ped shows the text fx "WRITE THAT DOWN" in white for 0.8 s; a head kill knocks the hat or glasses off as a `spark` burst (cartoon, no gore). AI accuracy never aims for the head (their hit is always torso).
- **Hit markers and the kill confirm.** On any hit, the crosshair's four ticks flare white and push outward 3 px for 0.12 s (SFX `hitmark`, a short tick). On a kill the ticks turn the game's pink `#ff3fa4`, draw an X for 0.4 s and play `confirm` (a two-note chime); the text fx over the victim reads RATIO'D. In aim mode the lock reticle also flashes.
- **Shell casings.** Guns with a magazine eject a `casing` fx (a 2 cm brass box, `vx` to the right of the muzzle 2 m/s, `vy` 2.5, gravity, one bounce with the `land` restitution 0.3, life 0.9 s, max 60 live, oldest dropped); the shotgun ejects a red shell on each pump. The sniper ejects after each shot with a 0.3 s delay.
- **Muzzle flash light.** One pooled `THREE.PointLight` (`Render.muzzleLight`, intensity 2.6, distance 9, colour `0xffd27a`) is placed at the player's muzzle for 0.06 s on each shot (autos: it stays while the trigger is held and flickers 0.5..1.0). Only the player's gun lights the scene (draw-call budget); AI shots keep the sprite flash.
- **Drive-by.** `Combat.driveByWeapon(id)` allows `pistol`, `revolver`, `smg` and `shotgun` from the driver's seat with `aim` held (the contract's rule). The rifle, sniper and launcher refuse with the toast "Not from the driver's seat. Respectfully." Hot mics and hot takes can be thrown from the window without `aim`.
- **Scope overlay.** With the sniper equipped, holding `aim` enters the scope instead of the shoulder camera: the rig moves to eye height (`first` mode rules with the body hidden), fov 30 (2x) or 15 (4x, toggled with `weaponNext` / `weaponPrev` / the wheel while scoped), a full-screen black vignette with a circular window (radius 38% of the short screen edge), hairline cross, a range readout bottom-left ("142 m"), a bob of 0.15° at 0.5 Hz (halved while standing still for more than 1 s), look sensitivity scaled by 1/zoom. Peds inside the circle get a faint lock pill. Leaving `aim` or switching weapons restores the chase rig with an ease.
- **Weapon wheel.** Holding `lockOn` (Tab) for more than 0.18 s while not aiming opens the wheel: twelve segments in `ORDER` around a ring (owned weapons lit with their mesh icon and ammo, unowned dark), the segment under the mouse direction / right stick highlighted, time scale 0.2 (not paused; the world keeps ticking slowly so a wheel in a chase is a choice), release to equip. A tap shorter than 0.18 s keeps the old behaviour (nothing outside aim). Touch: a long press on the Weapon button opens it. The wheel is drawn by `UI.drawWeaponWheel` and reads `Combat.hud().wheel`.

### 2.3 AI and difficulty hooks for the arsenal

Cops and goons use `pistol`, `smg` and `shotgun` as now; SWAT (4 stars) use `rifle` (with `AI_DAMAGE_MUL` 0.4, §6.9) and roadblock officers at 3+ stars may carry `revolver`; the helicopter's gunner uses `smg`. Nobody but the player ever holds the sniper or the launcher (the twist is that nobody is that organised). Cops drop their gun half the time as before; a dropped rifle gives 15 rounds.

### 2.4 Both Sides Arms: the weapon shop chain

**"We arm both sides. That's balance."** Three stores, all open all hours: `both_sides_strip` (the flagship, the Sponsor Strip), `both_sides_port` (Manifest Harbor), `both_sides_uptown` (Heirloom Heights). The clerk at every branch is the same man, **Dale Firmness's cousin, Merle Firmness** (new cast id `merle`: role "Clerk, Both Sides Arms", voice `retail`, tic: quotes the price, then a lower price "for a journalist", then the first price; portrait `skin 1, hair short, hairColor #3a2a1a, glasses aviator, hat cap, extra lanyard, tie none`, colour `#3fd27f`, bio: "Sells the same gun to both sides and a bigger one to whoever comes back. Runs a loyalty program nobody has qualified for."). Merle stands at the door as the giver-style ped; the shop marker is a green light (`kind: 'shop'`, colour `0x3fd27f`) at the door; standing in it on foot for 0.5 s opens the buy menu (Game state `paused`, UI page `shop`; the world pauses).

**Buy menu.** Three tabs: WEAPONS, AMMO, GEAR. Left column the list with prices and what the player owns (OWNED / mag counts), right column a card with the weapon's mesh on a turntable, its stats as five bars (DAMAGE, RATE, RANGE, ACCURACY, VOLUME), Merle's one-line pitch, and the money roll-up. Confirm buys; the sale plays `cash` and Merle's bark. Items locked by story show as a padlock with the mission title that unlocks them (never the id). The flagship has a fourth tab, RANGE: pay $50 to reset the six cutouts in the back lot and a 60 s timer (the free aiming practice; no reward, a best-time).

| tab | item id | item | price | notes |
|---|---|---|---|---|
| WEAPONS | each weapon id | list price in §2.1 | - | locked until the unlock mission (pistol from m03b, the rest as listed); buying gives mag + one spare |
| AMMO | `ammo_pistol` | Pistol rounds (24) | $60 | |
| AMMO | `ammo_revolver` | Rebuttal rounds (12) | $90 | |
| AMMO | `ammo_smg` | SMG rounds (60) | $150 | |
| AMMO | `ammo_rifle` | Monologue rounds (60) | $220 | |
| AMMO | `ammo_shotgun` | Shells (12) | $120 | |
| AMMO | `ammo_sniper` | Fact Checker rounds (5) | $250 | |
| AMMO | `ammo_hottake` | Hot Takes (3) | $90 | |
| AMMO | `ammo_hotmic` | Hot Mics (4) | $400 | |
| AMMO | `ammo_ratio` | Rocket (1) | $600 | |
| AMMO | `ammo_megaphone` | Megaphone charges (20) | $40 | |
| GEAR | `clarity_pellets` | Clarity Pellets | $150 | +50 hp at once (not over max); Merle: "Your doctor won't sell you these. I will." |
| GEAR | `clarity_family` | Clarity Pellets, Family Size | $400 | full heal |
| GEAR | `firmness_vest` | Nap Dynasty Firmness Vest | $500 | armor to 100 (max 100); the vest is a mattress; Merle: "Firmness level nine. Code VEST20 does nothing." |
| GEAR | `range_reset` | Range reset (flagship only) | $50 | resets the cutouts, 60 s timer |

Discounts stack additively, capped at 40%: Monday Memos 30 threshold 15% (§5.5), subscriber Tier 3 25% (§5.8). Prices are tuned so money matters: the whole arsenal at list is $19,190 plus ammo; the base campaign pays about $34,000, the new missions about $13,000 more (§3), strands pay by effort; a death still costs 10% of cash and a bust $500, so a player who shops before a hard mission and dies is poorer and is meant to notice.

---

## 3. Story additions: eight new missions

**Design rules.** The chain stays a DAG and stays a line: each new mission slots between two existing ones and the later one's `requires` is updated to point at it (§3.3 lists every change). The two Act I additions are on-ramps with generous timers that teach driving, aiming and the wanted system before anything is at stake. Every new mission but `m03b` (the Strip's gun shop) uses a new district. Wanted stars across the new missions rise 0, 1, 2, 0, 3, 3, 4, 5. Weapons now unlock in this order: fist (start), megaphone (`m03`), tableleg (`m03b`), pistol (`m05`), revolver (`m05b`), rifle (`m08b`), hottake (`m09`), hotmic (`m09b`), smg (`m11`), shotgun (pickup after `m11`), sniper (`m12b`), ratio (`m13b`, or 40 Monday Memos). The new missions pay $13,050 in total. Every `failOn` includes `player_dead`. New objective types and the target extensions used below (`equip`, `deliver_passenger`, `stop_vehicle`, `stunt`, `point`, `around: {tag}`, `stationary`, `weapon`, `mustKill`, `driven: 'cop'`, `takeWeapon`, `colors`) are defined in §7. Missions live in `GTP.Content.expansion.missions` with the same schema as `22_content_missions.js`; the runtime concatenates them into the mission list.

---

### m01b_airport, "Baggage Claim" (Act I on-ramp: driving, the map, the arrow)
giver `sloane` · marker `pod_garage` · requires `['m01_van']` · reward `$250` · slots between `m01_van` and `m02_read`

**Beats.** The sponsor's demo mattress is landing at Goldplate International, which Bryce did not know existed. Kip is at Arrivals holding a sign. The drive is the longest in Act I on purpose: across the city, over the Sponsor Span, with the HUD arrow and the minimap doing the teaching and a five-minute timer that Sloane counts down wrong. Kip rides back in the passenger seat with the sign.

**Intro.**
- sloane: "The sponsor's demo mattress lands at Goldplate International in five minutes. Four. Kip's at Arrivals with a sign."
- player: "We have an airport?"
- sloane: "It has us. Take the van. Follow the arrow. The Loop is faster and legally a party."
- gus: "The battery's fixed. I say that so you'll drive carefully. It isn't."

**Objectives.**
```js
{ type:'enter_vehicle', spawn:{type:'van', tag:'podvan', at:{landmark:'pod_garage'}, wrap:'pod', color:'#f2f2f2'}, text:'Get in the pod van' },
{ type:'timer_wrap', seconds:300, objectives:[
  { type:'drive_to', target:{landmark:'airport_terminal'}, vehicle:'spawned:podvan', text:'Drive to Goldplate International. Follow the arrow; the Loop and the Sponsor Span are quickest' }
]},
{ type:'deliver_passenger', spawn:{ped:'kip', at:{landmark:'airport_terminal'}}, to:{landmark:'pod_garage'}, vehicle:'spawned:podvan', board:{radius:40, hold:1}, text:'Pick up Kip at Arrivals and bring him back to the garage' },
{ type:'dialogue', lines:[
  { who:'kip', text:'The mattress was on the flight. The flight was a bus. Is this paid?' }
]}
```

**Outro.**
- sloane: "Five minutes. You took eleven. The mattress is fine. The mattress is always fine."
- player: "Respectfully, the airport is across an ocean."
- sloane: "It's a bay. Two minutes. One. Nap Dynasty wants to meet you."
- kip: "I held the sign the whole flight."

failOn `['player_dead','vehicle_lost:podvan']` · onComplete `{ setFlag:'seen_airport' }`

---

### m03b_range, "Aim Small, Yell Big" (Act I on-ramp: aiming, lock-on, head shots, one star)
giver `gus` · marker `both_sides_strip` · requires `['m03_ratio']` · reward `$300` · slots between `m03_ratio` and `m04_hit`

**Beats.** Gus has watched Bryce swing at people who were already leaving and walks him to Both Sides Arms, where Merle Firmness lends a pistol "for a journalist" and six cardboard hecklers wait in the back lot. Hold aim, Tab between targets, the head is where the take is. Then the noise brings one police star, and the lesson is that a star goes away if you stop being seen, or for a hundred dollars at a garage. The pistol goes back on the wall; the table leg, which fell off the table, does not.

**Intro.**
- gus: "You keep swinging at people who are already leaving. Learn to aim. Merle's got a range."
- merle: "Loaner pistol. Four fifty. For a journalist, four hundred. Four fifty. Six hecklers out back. Cardboard. They don't sue."
- player: "I don't need a gun to win an argument."
- merle: "Then you'll be the first. Hold aim, line up the head, squeeze. The head's where the take is."

**Objectives.**
```js
{ type:'equip', weaponId:'pistol', ammo:36, text:'Take the loaner pistol' },
{ type:'goto', target:{landmark:'both_sides_strip', point:'range'}, radius:64, text:'Walk around back to the range' },
{ type:'timer_wrap', seconds:90, objectives:[
  { type:'defeat', spawn:{ped:'cutout', count:6, around:{landmark:'both_sides_strip', point:'range'}, radius:80, stationary:true, hostile:false}, weapon:'pistol', mustKill:true, text:'Drop six cardboard hecklers. Hold Aim, Tab switches targets, head shots count double' }
]},
{ type:'dialogue', lines:[
  { who:'merle', text:'Nice grouping. Six hecklers, six headlines.' },
  { who:'gus', text:'The neighbours called it in. One star. Stay out of sight and it fades, or my garage resprays it for a hundred.' }
]},
{ type:'escape_wanted', setWanted:1, text:'Lose one star: break line of sight and wait, or drive into Gus\'s Garage' }
```

**Outro.**
- merle: "The cops rated the noise a four. Pistol goes back on the wall. For a journalist, I'll keep it on the wall."
- gus: "Keep the table leg. It fell off the table. It's the honest weapon."
- player: "Respectfully, I'm a trained marksman now."
- gus: "You're peaking."
- kip: "I counted. Six hecklers, zero minds changed. Is this paid?"

failOn `['player_dead']` · onComplete `{ takeWeapon:'pistol', unlockWeapon:'tableleg', setFlag:'range_trained' }`

---

### m05b_provenance, "Chain of Custody"
giver `vaultwright` · marker `heirloom_club` · requires `['m05_peer']` · reward `$1,200` · slots between `m05_peer` and `m06_rally`

**Beats.** The Museum of Takes has acquired Bryce's original folding table and labelled it THE FIRST TAKE (ATTRIBUTED); it bought the table from Ptolemy Dunk, who did not own it. Vaultwright, a museum trustee, wants it in his hedge maze "as a loan, to me, from me." Bryce walks into the atrium, the docents object with binders, he takes the table, loads it into the museum's own loan van, loses museum security, and drives it over the causeway to the manor on the island (the Goldplate Goldplate Bridge is the long way round). Vaultwright whispers a revolver: the hedge has a hedge now.

**Intro.**
- vaultwright: "Mr. Takesworth. The museum has your table. They're calling it the first take. I'm whispering *attributed*."
- player: "Dunk sold them my table?"
- vaultwright: "He sold them a table. Bring it to the manor. I'm a trustee. It's a loan. To me. From me."
- footnote: "[citation pending] The provenance is a podcast."

**Objectives.**
```js
{ type:'goto', target:{landmark:'museum_of_takes'}, radius:48, text:'Get to the Museum of Takes' },
{ type:'defeat', spawn:{ped:'thug', count:5, around:{landmark:'museum_of_takes'}, radius:140}, text:'The docents object. Clear the atrium' },
{ type:'pickup', spawn:{pickupType:'mission', count:1, around:{landmark:'museum_of_takes'}, radius:60, label:'THE FIRST TAKE'}, text:'Take the table back' },
{ type:'enter_vehicle', spawn:{type:'van', tag:'loanvan', at:{landmark:'museum_of_takes'}, color:'#efe4cd'}, text:'Get in the museum loan van' },
{ type:'escape_wanted', setWanted:2, text:'Museum security has called it in. Lose them' },
{ type:'drive_to', target:{landmark:'vaultwright_manor'}, vehicle:'spawned:loanvan', text:'Deliver the table to Vaultwright Manor' }
```

**Outro.**
- vaultwright: "The first take, attributed, in my hedge maze. I'm whispering *priceless*, which is a number."
- player: "Respectfully, that's my table."
- vaultwright: "It was. Here's a revolver. The hedge has a hedge now."
- kip: "I rode in the back with the table. We talked. Is this paid?"

failOn `['player_dead','vehicle_lost:loanvan']` · onComplete `{ unlockWeapon:'revolver', setFlag:'table_loaned' }`

---

### m07b_ferry, "Nothing to Declare"
giver `velvetine` · marker `ferry_terminal` · requires `['m07_listen']` · reward `$1,400` · slots between `m07_listen` and `m08_scooters`

**Beats.** The Baron's mixtape, thirty years sealed and still charting, must leave on the Ferry to Elsewhere before Customs & Disclosures opens it, because opening is listening. Four sealed crates are somewhere in the container maze; the truck barely fits the lanes; two customs vans give chase; the ferry does not leave, which the Baron toasts as having left. TYN reports the delay as Bryce's fault.

**Intro.**
- velvetine: "To the ferry! To Elsewhere! To the mixtape, still sealed, thirty years, charting!"
- player: "Where's Elsewhere?"
- velvetine: "Wherever customs isn't. Four crates in the yard. The yard is a maze. To mazes! Don't let the inspectors open anything. Opening is listening."
- kip: "I'll navigate. I have a map of a different yard. Is this paid?"

**Objectives.**
```js
{ type:'enter_vehicle', spawn:{type:'truck', tag:'mixtruck', at:{landmark:'container_yard'}, color:'#8e3a8e'}, text:'Get in the Velvetine truck at the yard gate' },
{ type:'timer_wrap', seconds:150, objectives:[
  { type:'pickup', spawn:{pickupType:'mission', count:4, around:{landmark:'container_yard'}, radius:320, label:'SEALED'}, text:'Collect 4 sealed crates in the container maze' }
]},
{ type:'destroy', spawn:{vehicle:'van', count:2, tag:'inspectors', around:{landmark:'customs_shed'}, radius:200, driven:'cop', color:'#d9cfa6'}, text:'Two customs vans want to open the crates. Wreck them' },
{ type:'drive_to', target:{landmark:'ferry_terminal'}, vehicle:'spawned:mixtruck', text:'Get the crates to the Ferry to Elsewhere' },
{ type:'dialogue', lines:[
  { who:'velvetine', text:'To departure!' },
  { who:'player', text:'It\'s not moving.' },
  { who:'velvetine', text:'The ferry is the leaving. To having left!' }
]}
```

**Outro.**
- velvetine: "Customs opened nothing. The mixtape remains sealed, charting, and on a boat that is also a venue."
- player: "Respectfully, two of their vans are in the water."
- velvetine: "To the water! Nothing to declare!"
- chyron (ticker): "BREAKING. FERRY TO ELSEWHERE DELAYED; PUNDIT SUSPECTED; BARON TOASTS"

failOn `['player_dead','vehicle_lost:mixtruck']` · onComplete `{ setFlag:'ferry_friend' }`

---

### m08b_jets, "The Jets Arrive"
giver `warbanner` · marker `airport_terminal` · requires `['m08_scooters']` · reward `$1,800` · slots between `m08_scooters` and `m09_balloon`

**Beats.** The jets have arrived: one jet, on a truck, a cutout, in profile. PM Warbanner needs footage of it taking off, so Bryce drives the jet truck down Runway 10/10 flat out and off the ramp at the west end while Goldplate rates lift from the tower. The truck lands on the beach. Airport security wants the truck, which is now a jet. Warbanner's souvenir is a rifle, "from the jet"; there is no jet.

**Intro.**
- warbanner: "The jets have arrived, and that's why we need the jets."
- player: "That's one jet. On a truck. It's flat."
- warbanner: "It's in profile. Drive it down the runway. At speed. Off the end. The footage will show lift, and that's why we need the jets."
- goldplate: "I'm in the tower. I rate the runway a ten. Both ends. Don't scratch my ten."
- sloane: "Two minutes. Hit the ramp at the west end flat out. If it floats, it flies."

**Objectives.**
```js
{ type:'enter_vehicle', spawn:{type:'truck', tag:'jettruck', at:{landmark:'airport_terminal'}, wrap:'jet', color:'#3d6fcf'}, text:'Get in the jet truck' },
{ type:'timer_wrap', seconds:120, objectives:[
  { type:'drive_to', target:{landmark:'airport_runway', point:'east'}, vehicle:'spawned:jettruck', radius:80, text:'Line up at the east end of Runway 10/10' },
  { type:'stunt', ramp:'sj_07', vehicle:'spawned:jettruck', minAir:0.8, minSpeed:18, text:'Floor it west down the runway and hit the ramp at the end flat out' }   // a truck tops out at 28 m/s; 18 is two thirds throttle over 350 m of runway
]},
{ type:'dialogue', lines:[
  { who:'goldplate', text:'Lift! I counted lift. Ten.' },
  { who:'warbanner', text:'A triumph, and that\'s why we need the jets.' },
  { who:'sloane', text:'Airport security wants the truck. It\'s a jet now. Run.' }
]},
{ type:'escape_wanted', setWanted:3, text:'Airport security rates your landing a three. Lose them' }
```

**Outro.**
- warbanner: "The footage shows lift. Bravadia will order forty more trucks, and that's why we need the jets."
- player: "Respectfully, it's on the beach."
- warbanner: "A beach is a runway with sand. Souvenir: a rifle. It's from the jet. There is no jet. And that's why we need the jets."
- kip: "I filmed it. I filmed the sky. Is this paid?"

failOn `['player_dead','vehicle_lost:jettruck']` · onComplete `{ unlockWeapon:'rifle', setFlag:'jets_arrived' }`

---

### m09b_hotmic, "Hot Mic"
giver `redacted` · marker `customs_shed` · requires `['m09_balloon']` · reward `$2,000` · slots between `m09_balloon` and `m10_pellets`

**Beats.** OVA now routes the Memo's print proofs through customs. A courier van is leaving the harbor for the Print Works; Redacted wants it stopped (in front of it, staying in front of it, vans respect that), the proofs lifted, and the two beige "weather balloons" behind the shed dealt with using a hot mic, which is a [REDACTED] that was on the whole time. The proofs carry a byline. It is Bryce's. It was always going to be.

**Intro.**
- redacted: "The [REDACTED] leaves the port in a van. Stop the van. Don't [REDACTED] the driver, he's a subscriber."
- player: "Stop it how?"
- redacted: "Get in front of it. Stay in front of it. Vans respect that. Then the proofs. Then this. It's a [REDACTED] that was on the whole time. Throw it. Don't hold it. Everyone holds it."
- kip: "I'm in the shed. I'm not supposed to be in the shed. Is this paid?"

**Objectives.**
```js
{ type:'enter_vehicle', spawn:{type:'suv', tag:'chase', at:{landmark:'customs_shed'}, color:'#4c4c4c'}, text:'Take the OVA SUV' },
{ type:'stop_vehicle', spawn:{vehicle:'van', tag:'proofvan', at:{landmark:'customs_shed'}, color:'#d9cfa6', driven:'traffic', flee:true}, stopSpeed:1, hold:3, maxDist:2400, text:'Stop the courier van before it leaves the harbor: block it, box it in, or bump it to a halt' },
{ type:'pickup', spawn:{pickupType:'mission', count:1, around:{tag:'proofvan'}, radius:40, label:'PROOFS'}, text:'Lift the print proofs from the van' },
{ type:'equip', weaponId:'hotmic', ammo:4, text:'Take the hot mics' },
{ type:'destroy', spawn:{vehicle:'van', count:2, tag:'balloons', around:{landmark:'customs_shed'}, radius:160, color:'#d9cfa6'}, weapon:'hotmic', text:'Two weather balloons are parked behind the shed. One mic each; the mic goes off. Throw it, then step back' },
{ type:'escape_wanted', setWanted:3, text:'The balloons have sirens. Lose them' }
```

**Outro.**
- redacted: "The proofs have a byline. Yours. It was always going to be yours. [REDACTED] is pleased."
- player: "I didn't write it."
- redacted: "You said it. Out loud. Near a [REDACTED]. Keep the mics. Everyone's hot."

failOn `['player_dead','target_escaped']` · onComplete `{ unlockWeapon:'hotmic', setFlag:'byline' }`

---

### m12b_scope, "Citation Needed"
giver `footnote` · marker `museum_of_takes` · requires `['m12_memo']` · reward `$2,600` · slots between `m12_memo` and `m13_thursday`

**Beats.** With the ledger loose, Dr. Footnote has worked out that Fulcrum's forty fellows are the Memo's footnotes: five OVA couriers in balloon-repair coveralls hand off the week's "studies" on Goldplate Links across the east channel every evening, and they carry the agency's pistols, which they empty at anything on the causeway from a hundred metres away, badly, which is the range lesson. She wants them cited from the causeway railing with the Fact Checker, a long rifle she keeps "for peer review": hold aim, breathe, cite, duck. Then cross the causeway, collect the studies, lose the balloons at four stars. Every study has one abstract, and the abstract is the comment section.

**Intro.**
- footnote: "[citation pending] Forty fellows. One opinion. I've found where it comes from. Five couriers on the links across the water, every evening, handing it off."
- player: "You want me to shoot them?"
- footnote: "Cite them. From here. It's peer review at a distance. They'll shoot back; they can't read at this range either. Hold aim, breathe, cite."
- kip: "I'm the sixth courier. I quit this morning. Is this paid?"

**Objectives.**
```js
{ type:'equip', weaponId:'sniper', ammo:10, text:'Take the Fact Checker' },
{ type:'goto', target:{landmark:'causeway_east'}, radius:48, text:'Get to the causeway railing and look across the channel' },
{ type:'defeat', spawn:{ped:'courier', count:5, around:{landmark:'goldplate_links'}, radius:200, stationary:true, hostile:true}, weapon:'sniper', mustKill:true, text:'Cite the five armed couriers on the links before they cite you. Hold Aim to scope; the wheel zooms' },
{ type:'pickup', spawn:{pickupType:'mission', count:5, around:{landmark:'goldplate_links'}, radius:200, label:'STUDY'}, text:'Cross the causeway and collect the five studies' },
{ type:'escape_wanted', setWanted:4, text:'The balloons saw the citations. Lose them' },
{ type:'goto', target:{landmark:'museum_of_takes'}, radius:48, text:'Bring the studies to Dr. Footnote' }
```

**Outro.**
- footnote: "Five studies. One abstract. The abstract is your comment section. [citation pending] The citation is you."
- player: "Respectfully, I'd like a footnote of my own."
- footnote: "You're the whole bibliography. Keep the rifle. It reads at two hundred metres."
- kip: "I was cited once. It said 'intern, unpaid.' Is this paid?"

failOn `['player_dead']` · onComplete `{ unlockWeapon:'sniper', setFlag:'cited' }`

---

### m13b_ratio, "Ratio Launcher"
giver `moonsworth` · marker `container_yard` · requires `['m13_thursday']` · reward `$3,500` · slots between `m13_thursday` and `m14_grift`

**Beats.** Kyler has pivoted: $PUNDIT is a rocket launcher now, trustless, you point it and it ratios. The four factions' goons are driving the Memo's containers out of the yard in four vans for Chyron's panel. Burn the supply: wreck the four vans in the maze with the Ratio Launcher inside two and a half minutes, then lose every balloon, cruiser and HOA kite in the city at five stars. Kyler keeps the warranty. The warranty is the token.

**Intro.**
- moonsworth: "Bryce. Pivot. $PUNDIT is a launcher now. Trustless. You point it, it ratios."
- player: "Why is the coin a rocket launcher?"
- moonsworth: "Utility. Four vans are taking the memo containers to the panel. Burn the supply. Scarcity is bullish. The rockets are tokens."
- gus: "He's peaking. Also the rockets are real. Don't stand behind it."

**Objectives.**
```js
{ type:'equip', weaponId:'ratio', ammo:6, text:'Take the Ratio Launcher' },
{ type:'timer_wrap', seconds:150, objectives:[
  { type:'destroy', spawn:{vehicle:'van', count:4, tag:'memovans', around:{landmark:'container_yard'}, radius:160, driven:'traffic', colors:['#ffd400','#3d6fcf','#8e3a8e','#2c3e7a']}, weapon:'ratio', text:'Ratio the four faction vans before they leave the maze' }
]},
{ type:'escape_wanted', setWanted:5, text:'Every balloon, cruiser and HOA kite is up. Lose them all' },
{ type:'goto', target:{landmark:'pod_garage'}, radius:48, text:'Get back to the garage' }
```

**Outro.**
- moonsworth: "Supply burned. Four vans, zero memos, all-time high. The launcher's yours. The warranty's mine. The warranty is the token."
- player: "Respectfully, I'm now wanted in every district."
- moonsworth: "Reach."
- sloane: "Chyron's panel is tonight. Five guests. One memo. Bring the launcher. Don't bring the launcher."

failOn `['player_dead']` · onComplete `{ unlockWeapon:'ratio', setFlag:'launched' }`

---

### 3.3 The chain after the expansion

Every `requires` change, so the line stays a line (and a DAG): `m02_read.requires = ['m01b_airport']`, `m04_hit.requires = ['m03b_range']`, `m06_rally.requires = ['m05b_provenance']`, `m08_scooters.requires = ['m07b_ferry']`, `m09_balloon.requires = ['m08b_jets']`, `m10_pellets.requires = ['m09b_hotmic']`, `m13_thursday.requires = ['m12b_scope']`, `m14_grift.requires = ['m13b_ratio']`. The full order is: m00_intro, m01_van, m01b_airport, m02_read, m03_ratio, m03b_range, m04_hit, m05_peer, m05b_provenance, m06_rally, m07_listen, m07b_ferry, m08_scooters, m08b_jets, m09_balloon, m09b_hotmic, m10_pellets, m11_trustless, m12_memo, m12b_scope, m13_thursday, m13b_ratio, m14_grift, then m15a_primetime / m15b_liveread (both still `require ['m14_grift']`). Acts: Act I ends after m04_hit (`a_voice`), Act II after m11_trustless (`rugged`), Act III is the rest; the act-transition cutscenes (§4) play on those completions. `Missions.prep` (the `?mission=` jump-in) completes every earlier mission in this order with its flags and weapons, so `tests/campaign.js` runs all 25 on real inputs. The retuned base missions keep their ids; `GTP.Content.expansion.retune` is a map of `{missionId: {path, value}}` patches the runtime applies at init, so `22_content_missions.js` is not edited.

### 3.4 Easier first three missions

| mission | field | was | now |
|---|---|---|---|
| `m00_intro` | debate `params.points` | 4 | 3 |
| `m00_intro` | debate `params.timer` | 6 | 8 |
| `m00_intro` | pickup `radius` (table parts) | 160 | 120 |
| `m01_van` | `timer_wrap.seconds` | 90 | 150 |
| `m01_van` | subscribers `count` | 6 | 5 |
| `m01_van` | subscribers `radius` | 400 | 300 |
| `m01_van` | Gus's intro line | "The battery lasts ninety seconds." | "The battery lasts two and a half minutes. I didn't fix it. I'm sound." |
| `m02_read` | `timer_wrap.seconds` | 120 | 180 |
| `m02_read` | Sloane's hint toast at start | none | "Nap Dynasty's truck is slow and firm. The Loop is quicker than the streets." |

The Act I timers are 150 s for a 300 m job and 180 s for a 500 m job, which a first-time driver crashing twice still makes. `m03_ratio` is unchanged (its ratio war is already `speed 1`).

---

## 4. Cutscenes

### 4.1 Schema (`GTP.Content.expansion.cutscenes[id]`, played by `GTP.Cutscenes.play(script, onDone)`)

```js
{
  id: 'cs_opening', letterbox: true, skippable: true,
  music: 'off' | 'station:<id>' | 'keep',          // optional; default 'off' (ambient stays)
  shots: [
    {
      cam: {
        from: { x, y, z } | { landmark, offset: { x, y, z } } | { entity: 'player' | 'actor:<castId>', offset: { x, y, z } },
        to:   { x, y, z } | { landmark, offset: { x, y, z } } | { entity: 'player' | 'actor:<castId>' },   // the look-at point; an entity is looked at chest height
        seconds: 4, ease: 'linear' | 'in' | 'out' | 'inout',
        move: { to: { ...same forms } }           // optional camera dolly end position over `seconds`
      },
      actors: [ { castId, at: { landmark, offset: { x, z }, roof: true? } | { x, z }, face: '<castId>' | 'player' | <yaw>, anim: 'idle' | 'talk' | 'point' | 'table' | 'wave' } ],   // castId may be a ped role (protester, thug, cop, civ) for extras: a random look from that role's pool, no portrait, no lines; roof: true stands the actor on the landmark building's roof (y = building top), as cs_act2 does on Goldplate Tower
      lines: [ { who, text } ],                   // dialogue lines in the existing shape; the dialogue box shows them, auto-advancing (max(C.MISSIONS.lineSeconds, typing + reading)) or on confirm
      fx: [ { type, ... } ],                      // optional Render.fx entries fired at the shot's start (confetti 'ring', 'text', 'explosion'...)
      hold: 1.0                                   // optional seconds to hold after the last line before the next shot
    }
  ]
}
```

Rules:

- A shot ends when its camera time has elapsed **and** its lines are done (plus `hold`). Camera `offset` values are metres; landmark offsets are from the landmark's door point (the engine's `landmark.door`), entity offsets are in the entity's local frame (x right, z back, y up). Actors are mission-style peds (`ai.mission = 'cutscene'`, the AI never ticks them) spawned at the first shot that names them and kept until the script ends; `'player'` as an actor repositions the real player ped (the player cannot move during a cutscene; the vehicle is braked; input other than skip is ignored). `anim` drives `syncMesh`: `idle` (weight shift), `talk` (head nod, a hand gesture every 1.5 s while that actor's line shows), `point` (right arm raised at `face`), `table` (hands on a table in front, leaning), `wave` (a wave every 2 s).
- Letterbox bars are 12% of the height each, HUD hidden, the dialogue box drawn above the bottom bar with the portrait as usual. Skip: `back` or `pause` once skips the current shot's remaining lines and camera, holding `confirm` for 0.6 s skips the whole script (a "HOLD TO SKIP" pill fills bottom-right); the script's end state is applied either way (`onDone`).
- The game state is `cutscene`; the world keeps simulating but `AI.alarm` is suppressed, heat does not decay or rise, nothing spawns within 30 m of an actor, and the radio is off unless `music` says otherwise. A cutscene that would start while the player is wanted waits at most 2 s, then clears the stars for its duration and restores them after.
- Camera: `Render.freeCam(true)` with per-frame `damp` toward the keyframe; a `to: {entity}` tracks the entity. Never clip into buildings: the from-point is pushed out of any building AABB by 0.5 m before the shot starts.
- Every mission intro: when `cutscenes['cs_intro_' + missionId]` exists, `Missions.start` plays it instead of the over-the-shoulder two-shot, with the intro dialogue as the shots' lines, and continues to the first objective on `onDone`. `?intro=0` and `skipIntro` skip it exactly as before. Each intro is 20 to 40 s (2 shots, 3 to 6 lines).
- Act transitions and the twist play from `onComplete` of the named mission (`cs_act2` after `m04_hit`, `cs_act3` after `m11_trustless`, `cs_twist` after `m12_memo`, `cs_ending_a` after `m15a_primetime` and `cs_ending_b` after `m15b_liveread`, before `UI.credits`); the opening `cs_opening` plays on New Game before `m00_intro`'s marker arms, after the loading screen (New Game only, never Load). All play at most once per save (`flags.cs_<id>`).

### 4.2 Scripts

Positions use landmark door offsets in metres; `player` means the player ped.

**`cs_opening`, "Table Stakes" (32 s).** Bryce and Gus at the folding table on Founders' Quad at sunset.
```js
{ id:'cs_opening', letterbox:true, skippable:true, music:'off', shots:[
  { cam:{ from:{landmark:'campus_quad', offset:{x:-14, y:9, z:18}}, to:{landmark:'campus_quad', offset:{x:0, y:1, z:-6}}, seconds:7, ease:'inout', move:{to:{landmark:'campus_quad', offset:{x:-6, y:3, z:9}}} },
    actors:[ {castId:'player', at:{landmark:'campus_quad', offset:{x:-0.8, z:-6}}, face:Math.PI, anim:'table'}, {castId:'gus', at:{landmark:'campus_quad', offset:{x:2.2, z:-5}}, face:'player', anim:'idle'}, {castId:'kip', at:{landmark:'campus_quad', offset:{x:9, z:-2}}, face:'player', anim:'wave'} ],
    lines:[ {who:'player', text:'Grievance City. Two time zones, one opinion. It\'s always primetime somewhere, and somewhere is here.'},
            {who:'gus', text:'You\'re talking to nobody. The table isn\'t up. You\'re peaking on nobody.'},
            {who:'player', text:'Respectfully, Gus, a journalist warms up.'} ],
    fx:[ {type:'text', text:'LOUD & CORRECT', x:0, y:3, z:0, color:'#ff3fa4', life:3} ] },
  { cam:{ from:{entity:'actor:gus', offset:{x:-0.6, y:1.7, z:-2.2}}, to:{entity:'player'}, seconds:6, ease:'inout' },
    actors:[ {castId:'player', anim:'talk'}, {castId:'gus', anim:'talk'} ],
    lines:[ {who:'gus', text:'Minds changed so far: zero. Sign says ASK ME ANYTHING. Nobody asked.'},
            {who:'player', text:'They will. I\'ll answer something else. That\'s the format.'},
            {who:'gus', text:'The parts are in 4B. Go get the table. I\'m not carrying. I\'m levels.'},
            {who:'kip', text:'Hi. Is this... I\'ll ask later.'} ], hold:1.2 }
]}
```

**`cs_act2`, "Four Clients" (34 s).** Plays after `m04_hit`. Goldplate Tower's roof at night; the four clients are silhouettes around a gold table; Bryce is small in the foreground on the plaza.
```js
{ id:'cs_act2', letterbox:true, skippable:true, music:'station:pennant_fm', shots:[
  { cam:{ from:{landmark:'goldplate_tower', offset:{x:-40, y:70, z:40}}, to:{landmark:'goldplate_tower', offset:{x:0, y:64, z:0}}, seconds:8, ease:'inout', move:{to:{landmark:'goldplate_tower', offset:{x:-12, y:66, z:14}}} },
    actors:[ {castId:'goldplate', at:{landmark:'goldplate_tower', offset:{x:-2, z:-2}, roof:true}, anim:'point'}, {castId:'vaultwright', at:{landmark:'goldplate_tower', offset:{x:2, z:-2}, roof:true}, anim:'talk'}, {castId:'velvetine', at:{landmark:'goldplate_tower', offset:{x:-2, z:2}, roof:true}, anim:'idle'}, {castId:'warbanner', at:{landmark:'goldplate_tower', offset:{x:2, z:2}, roof:true}, anim:'idle'} ],
    lines:[ {who:'vaultwright', text:'Gentlemen. I\'ve found a young face. He\'s loud, he\'s cheap, and he thinks he\'s the protagonist. I\'m whispering *lease*.'},
            {who:'goldplate', text:'I rate him a seven. I rate this roof a ten. Both words.'},
            {who:'velvetine', text:'To the lease! To whatever this is!'},
            {who:'warbanner', text:'He\'ll do the reads. Bravadia will do the rest, and that\'s why we need the jets.'} ] },
  { cam:{ from:{landmark:'goldplate_tower', offset:{x:8, y:2.2, z:12}}, to:{entity:'player'}, seconds:6, ease:'inout' },
    actors:[ {castId:'player', at:{landmark:'goldplate_tower', offset:{x:3, z:8}}, face:0, anim:'idle'}, {castId:'sloane', at:{landmark:'goldplate_tower', offset:{x:5, z:9}}, face:'player', anim:'talk'} ],
    lines:[ {who:'sloane', text:'Four clients. One contract. Yours. Everyone wants the podcast. Two minutes each. One.'},
            {who:'player', text:'Who owns the show?'},
            {who:'sloane', text:'Whoever\'s reading. Act two. Go.'} ],
    fx:[ {type:'text', text:'ACT II: FOUR CLIENTS', x:0, y:4, z:0, color:'#ffd400', life:3.5} ], hold:1.5 }
]}
```

**`cs_act3`, "The Monday Memo" (30 s).** Plays after `m11_trustless`. Rain-free night (the engine has no rain; the sky is `night`) outside Gus's Garage; Gus and Roz with two sheets of paper; the typo.
```js
{ id:'cs_act3', letterbox:true, skippable:true, music:'off', shots:[
  { cam:{ from:{landmark:'pod_garage', offset:{x:9, y:4, z:9}}, to:{landmark:'pod_garage', offset:{x:0, y:1.2, z:2}}, seconds:7, ease:'inout', move:{to:{landmark:'pod_garage', offset:{x:4, y:2, z:5}}} },
    actors:[ {castId:'gus', at:{landmark:'pod_garage', offset:{x:-1, z:2}}, face:'player', anim:'point'}, {castId:'roz', at:{landmark:'pod_garage', offset:{x:1.5, z:2.5}}, face:'player', anim:'talk'}, {castId:'player', at:{landmark:'pod_garage', offset:{x:0, z:5}}, face:Math.PI, anim:'idle'} ],
    lines:[ {who:'gus', text:'Mattress copy. PM\'s invoice. The memo you lifted. Kyler\'s whitepaper. Read the last word of each.'},
            {who:'player', text:'Respectfuly. Respectfuly. Respectfuly. One L.'},
            {who:'roz', text:'WE\'RE NOT HERE TO HELP YOU. Now read the top comment on your last episode.'},
            {who:'player', text:'...Respectfuly.'} ] },
  { cam:{ from:{entity:'player', offset:{x:0.7, y:1.6, z:-1.6}}, to:{entity:'actor:gus'}, seconds:5, ease:'inout' },
    actors:[ {castId:'gus', anim:'talk'}, {castId:'roz', anim:'idle'} ],
    lines:[ {who:'gus', text:'Every script in the city ends with your typo. Somebody is selling your comments to everybody.'},
            {who:'player', text:'Then somebody is in charge.'},
            {who:'gus', text:'Find the floor where they make it. Act three. You\'re peaking.'} ],
    fx:[ {type:'text', text:'ACT III: THE MONDAY MEMO', x:0, y:4, z:0, color:'#ffd400', life:3.5} ], hold:1.5 }
]}
```

**`cs_twist`, "Nobody" (36 s).** Plays after `m12_memo`'s outro, inside the OVA lobby (the door plaza of `ova_hq`); a dashboard on a lectern (a `podium` prop), Redacted with nothing left to say, the subscriber list as text fx rising one name at a time.
```js
{ id:'cs_twist', letterbox:true, skippable:true, music:'station:quiet_signal', shots:[
  { cam:{ from:{landmark:'ova_hq', offset:{x:-7, y:3.5, z:7}}, to:{landmark:'ova_hq', offset:{x:0, y:1.4, z:1}}, seconds:9, ease:'inout', move:{to:{landmark:'ova_hq', offset:{x:-2, y:2, z:4}}} },
    actors:[ {castId:'redacted', at:{landmark:'ova_hq', offset:{x:0, z:1}}, face:'player', anim:'idle'}, {castId:'player', at:{landmark:'ova_hq', offset:{x:0, z:4}}, face:0, anim:'idle'}, {castId:'kip', at:{landmark:'ova_hq', offset:{x:3, z:3}}, face:'player', anim:'idle'} ],
    lines:[ {who:'player', text:'Where\'s the operations floor?'},
            {who:'redacted', text:'[REDACTED].'},
            {who:'player', text:'There\'s no floor. There\'s a lectern and a login.'},
            {who:'redacted', text:'[REDACTED] subscribes. [REDACTED] subscribes. Everyone [REDACTED].'} ],
    fx:[ {type:'text', text:'GOLDPLATE: SUBSCRIBED', x:0, y:3.2, z:0, color:'#ffd400', life:2.2}, {type:'text', text:'WARBANNER: SUBSCRIBED', x:0, y:3.6, z:0, color:'#3d6fcf', life:3.2}, {type:'text', text:'VELVETINE: SUBSCRIBED', x:0, y:4.0, z:0, color:'#8e3a8e', life:4.2}, {type:'text', text:'TYN · FULCRUM · DUNK · THE HOA: SUBSCRIBED', x:0, y:4.4, z:0, color:'#c94040', life:5.2} ] },
  { cam:{ from:{entity:'player', offset:{x:-0.8, y:1.7, z:-1.8}}, to:{entity:'actor:kip'}, seconds:7, ease:'inout' },
    actors:[ {castId:'kip', anim:'talk'}, {castId:'redacted', anim:'idle'} ],
    lines:[ {who:'kip', text:'It\'s a dashboard. It scrapes the comments under your episodes every night and formats them. I know because I formatted it.'},
            {who:'player', text:'So who\'s in charge?'},
            {who:'kip', text:'Nobody. Everyone subscribed. The last line of tonight\'s memo says you\'re ready for primetime. Your audience wrote that.'},
            {who:'player', text:'The conspiracy is my comment section.'},
            {who:'kip', text:'And I formatted it. Is this paid?'} ], hold:2 }
]}
```

**`cs_ending_a`, "Primetime" (38 s).** After `m15a_primetime`. The roof of Goldplate Tower, a gold folding table, the city below, the ticker scrolling his own copy.
```js
{ id:'cs_ending_a', letterbox:true, skippable:true, music:'station:pennant_fm', shots:[
  { cam:{ from:{landmark:'goldplate_tower', offset:{x:-30, y:80, z:30}}, to:{landmark:'goldplate_tower', offset:{x:0, y:64, z:0}}, seconds:10, ease:'inout', move:{to:{landmark:'goldplate_tower', offset:{x:-5, y:66, z:6}}} },
    actors:[ {castId:'player', at:{landmark:'goldplate_tower', offset:{x:0, z:0}, roof:true}, anim:'table'}, {castId:'goldplate', at:{landmark:'goldplate_tower', offset:{x:3, z:1}, roof:true}, face:'player', anim:'point'}, {castId:'chyron', at:{landmark:'goldplate_tower', offset:{x:-3, z:1}, roof:true}, face:'player', anim:'talk'}, {castId:'kip', at:{landmark:'goldplate_tower', offset:{x:0, z:4}, roof:true}, face:'player', anim:'idle'} ],
    lines:[ {who:'goldplate', text:'Gold table. Ten out of ten. The Goldplate Table, by Goldplate, with Takesworth.'},
            {who:'chyron', text:'BREAKING. Him. Forever. The ticker\'s his. The copy\'s his. The chair\'s his.'},
            {who:'player', text:'What do I believe?'} ],
    fx:[ {type:'text', text:'MATTRESS. JETS. PELLETS. RATE IT A TEN. RESPECTFULY.', x:0, y:70, z:0, color:'#ffd400', life:6} ] },
  { cam:{ from:{entity:'player', offset:{x:1.2, y:1.5, z:2.4}}, to:{entity:'player'}, seconds:8, ease:'inout', move:{to:{entity:'player', offset:{x:0.4, y:1.6, z:1.4}}} },
    actors:[ {castId:'player', anim:'table'}, {castId:'chyron', anim:'talk'}, {castId:'kip', anim:'talk'} ],
    lines:[ {who:'chyron', text:'Whatever\'s next. Four minutes. WE\'LL HAVE TO LEAVE IT THERE.'},
            {who:'player', text:'I had a sign once. It asked me anything.'},
            {who:'kip', text:'Credits are rolling. They\'re ads. Is this paid?'},
            {who:'player', text:'...Respectfully, I don\'t remember.'} ], hold:2.5 }
]}
```

**`cs_ending_b`, "Live Read" (38 s).** After `m15b_liveread`. Founders' Quad at dawn (`clock` set to 6.4 for the scene), the new sign, Dunk at the next table, eleven peds.
```js
{ id:'cs_ending_b', letterbox:true, skippable:true, music:'off', shots:[
  { cam:{ from:{landmark:'campus_quad', offset:{x:16, y:7, z:-14}}, to:{landmark:'campus_quad', offset:{x:0, y:1, z:-6}}, seconds:10, ease:'inout', move:{to:{landmark:'campus_quad', offset:{x:6, y:2.5, z:-9}}} },
    actors:[ {castId:'player', at:{landmark:'campus_quad', offset:{x:-1, z:-6}}, face:Math.PI, anim:'table'}, {castId:'dunk', at:{landmark:'campus_quad', offset:{x:6, z:-6}}, face:Math.PI, anim:'table'}, {castId:'gus', at:{landmark:'campus_quad', offset:{x:-4, z:-4}}, face:'player', anim:'idle'}, {castId:'kip', at:{landmark:'campus_quad', offset:{x:2, z:-1}}, face:'player', anim:'wave'}, {castId:'roz', at:{landmark:'campus_quad', offset:{x:9, z:-2}}, anim:'idle'}, {castId:'freshman', at:{landmark:'campus_quad', offset:{x:-2, z:0}}, face:'player', anim:'idle'} ],
    lines:[ {who:'gus', text:'New sign. I DON\'T KNOW. LET\'S TALK. Minds changed so far: unknown. That\'s a first.'},
            {who:'dunk', text:'Same sign. Next table. Didn\'t read yours. Wrote mine anyway.'},
            {who:'player', text:'Respectfully, Ptolemy... no. Just: Ptolemy. Pull up a chair.'},
            {who:'dunk', text:'There are no chairs.'} ],
    fx:[ {type:'text', text:'I DON\'T KNOW. LET\'S TALK.', x:0, y:3, z:-6, color:'#ffffff', life:5} ] },
  { cam:{ from:{landmark:'campus_quad', offset:{x:-3, y:1.8, z:-11}}, to:{entity:'player'}, seconds:8, ease:'inout' },
    actors:[ {castId:'player', anim:'talk'}, {castId:'freshman', anim:'talk'}, {castId:'kip', anim:'talk'} ],
    lines:[ {who:'freshman', text:'I did the reading. Page forty. Would you like to see it?'},
            {who:'player', text:'Yes. I actually would.'},
            {who:'gus', text:'Eleven people. I counted. Ratio: tie. You\'re not peaking.'},
            {who:'kip', text:'Eleven dollars. One each. Is this paid?'},
            {who:'player', text:'Kip. It\'s paid.'} ], hold:2.5 }
]}
```

### 4.3 Mission intro two-shots (25)

Every story mission gets `cs_intro_<id>`: two shots, 20 to 40 s, lines = that mission's intro dialogue (split at the line index given; a line with `ticker: true` is shown on the ticker as before). Shot 1 is the establishing shot from `camA`, dollying to `camB`, with the giver at the marker door (`anim: 'talk'` while their line shows, `idle` otherwise), the player facing the giver 2 m away, Kip at `offset {x: 3, z: 2}` (`wave` for his line), plus the named extras. Shot 2 is the reverse: from the player's shoulder (`entity: 'player', offset {x: 0.7, y: 1.6, z: -1.8}`) looking at the giver (or the named `look`). Offsets are metres from the marker landmark's door; `y` is height.

| mission | camA → camB (shot 1) | split | extras in shot 1 | shot 2 look | note |
|---|---|---|---|---|---|
| m00_intro | `{-10,6,10}` → `{-4,2,5}` | 3 | roz `{6,0,3}` with a `sign` look (CHEESE), `wave` | roz for her lines | 9 folding tables in frame |
| m01_van | `{12,5,8}` → `{5,2,4}` | 2 | the pod van parked in the bay (spawned early, `wrap: 'pod'`) | gus | the wrap fills shot 1's right third |
| m01b_airport | `{-8,4,9}` → `{-3,2,4}` | 2 | gus `{-3,0,2}` | sloane | the HUD arrow is previewed as a `text` fx "FOLLOW THIS" over the van |
| m02_read | `{10,4,-9}` → `{4,2,-4}` | 3 | the demo truck; kip holds a `sign` look (MATTRESS) | firmness | neon sign in frame |
| m03_ratio | `{0,9,14}` → `{0,3,7}` | 2 | dunk at the far billboard `{0,0,-10}` with `point` | dunk | both billboards in frame |
| m03b_range | `{7,4,8}` → `{3,2,4}` | 2 | merle at the door, gus `{-2,0,3}`, six cutouts visible past the fence | merle | neon target sign on |
| m04_hit | `{-9,5,-8}` → `{-3,2,-3}` | 2 | - | chyron | motel neon flickers (`fx` ring on the sign) |
| m05_peer | `{8,4,8}` → `{3,1.8,4}` | 2 | footnote `{-6,0,4}` walking away (`idle`, back turned) | footnote for her line | two doors, one checkbook |
| m05b_provenance | `{-9,5,10}` → `{-3,2,4}` | 2 | footnote `{3,0,3}`, the doorman at the club door | vaultwright | the awning and stanchions |
| m06_rally | `{-26,12,0}` → `{-8,3,2}` from the stadium mast | 2 | 6 protester actors with signs `{-6..6,0,6}` chanting (`talk`) | goldplate | widest shot in the game |
| m07_listen | `{6,4,9}` → `{2,2,4}` | 2 | kip `{3,0,2}` | velvetine | neon on |
| m07b_ferry | `{-10,6,-8}` → `{-3,2,-3}` from the pier end | 2 | the ferryboat prop behind | velvetine | "NEXT FERRY: SOON" board |
| m08_scooters | `{9,5,9}` → `{3,2,4}` | 2 | the scooter (`bike`) spawned early; two embassy flags | warbanner | - |
| m08b_jets | `{-14,6,10}` → `{-4,2,4}` | 3 | the jet truck (wrap `jet`) parked at the rank; goldplate line is shown with his portrait as a radio line (`ticker:false`, voice `boast`) from the tower | warbanner | the tower's cab lit |
| m09_balloon | `{8,3,8}` → `{3,1.7,3}` | 3 | thirteen antennas in frame (camA tilted up) | redacted | - |
| m09b_hotmic | `{-8,4,8}` → `{-3,2,3}` | 2 | two beige vans behind the shed | redacted | kip's line from inside the shed (portrait only) |
| m10_pellets | `{10,5,-8}` → `{4,2,-3}` | 2 | the pellet SUV; the barn's gable | saffron | - |
| m11_trustless | `{-8,5,8}` → `{-3,2,3}` | 2 | gus `{-3,0,3}`; the shed's three antennas | moonsworth | a `text` fx "$PUNDIT: 0.00" over the shed |
| m12_memo | `{9,4,9}` → `{4,2,4}` | 3 | roz `{2,0,3}` with a `sign` look (THE MEMO IS YOU) | roz / gus | - |
| m12b_scope | `{-9,5,10}` → `{-3,2,4}` | 2 | the museum columns and banners; kip `{4,0,3}` | footnote | camB tilts to the channel view |
| m13_thursday | `{-6,3,6}` → `{-2,1.8,3}` inside the dorm door | 3 | sloane `{2,0,2}` | kip | the ON AIR sign |
| m13b_ratio | `{-12,8,10}` → `{-4,2,4}` from above the containers | 2 | gus `{-3,0,3}`; four faction vans idling in the lanes | moonsworth | crane in frame |
| m14_grift | `{0,10,16}` → `{0,3,7}` | 2 | the five panelists in a row `{-4..4,0,-3}` (`table`) | chyron | each panel line shows that member's portrait |
| m15a_primetime | `{10,6,10}` → `{4,2,4}` | 2 | firmness `{3,0,3}` | chyron | "code CHAIR20" |
| m15b_liveread | `{-6,3,6}` → `{-2,1.8,3}` | 2 | sloane `{2,0,2}` | gus | - |

---

## 5. Side strands

Seven repeatable strands, data in `GTP.Content.expansion.strands[id]`, run by a small `GTP.Strands` runtime inside `09_missions.js`'s file family (or `24_` plus a runtime hook: the strand runtime registers through `GTP.Missions.registerStrand`). A strand is never listed as a mission; it shows in the phone's STRANDS tab with progress, and its markers are distinct minimap icons. Only one strand runs at a time, and none can start during a story mission (the marker says "Finish the mission first" as a toast). Strand progress persists in the save (`strands: {id: {level, best, done, ...}}`). Every strand completion event emits `strand:cycle {id, level, reward}` (the autosave hook, §6.3) and adds subscribers (§5.8).

### 5.1 `loud_cab`, Loud Cab

**Start.** Sit in any `taxi` (stolen or the one parked at `airport_terminal`'s rank) and press `action` (E) while stopped. Banner: LOUD CAB · FARE 1. Press `action` again while stopped with no passenger to end the shift.

**Rules.** A passenger (one of the twelve archetypes below, in `GTP.rng` order without repeats until all twelve have ridden) spawns on a sidewalk 60 to 140 m away with a yellow marker and a hail animation (`wave`). Stop within 4 m for 1 s and they board (the `deliver_passenger` rules, §7). Their destination is a landmark door 150 to 450 m away, chosen so a fare never crosses more than one bridge. Timer `distance / 9 + 20` s. Fare `20 + 0.25 per metre`, tip +50% with no crash during the ride, halved if the timer runs out (the ride still completes). Three passengers in one shift without a crash is a HOT STREAK: fares x1.5 for the shift. Wrecking the cab, leaving it for more than 10 s with a passenger aboard, or a wanted level of 3 or more ends the shift (the passenger bails, "Respectfully, I'll walk").

**Passengers (12), one line each, said on boarding (a bark pill); the destination is in the line's spirit, not literal.**

| id | archetype | look | line |
|---|---|---|---|
| `fare_fellow` | a think-tank fellow | lanyard, thick glasses | "Fulcrum, please. Either door. I'll know which when I see the check." |
| `fare_juice` | a cleanse influencer | long hair, phone | "The wellness barn. My doctor won't tell me where it is." |
| `fare_live` | a man who is live | cap, phone held vertical | "Anywhere. I'm live. Say hi. He says hi. Don't wave, it's vertical." |
| `fare_board` | an HOA board member | bun, round glasses | "The HOA Hall, and you're doing nine in an eight. Noted." |
| `fare_nephew` | a donor's nephew | slick hair, gold tie | "The club. Tell them I'm with my uncle. My uncle is a hedge." |
| `fare_freshman` | the freshman | `freshman` cast look | "The library. I know there isn't one. Drive until there is." |
| `fare_agent` | an OVA agent, off duty | beret, shades | "The balloon office. I'm not going there. Take me there." |
| `fare_lobbyist` | a jet lobbyist | aviators, flag pin | "The embassy. We're close on the jets. We've been close for eleven years." |
| `fare_bagholder` | a $PUNDIT holder | cap, shades, phone (checking the chart) | "The mining shed. I'm not selling. I'm checking it's still a shed." |
| `fare_docent` | a museum docent | bob, lanyard | "The Museum of Takes. I curate the gift shop. The gift shop is the museum." |
| `fare_ferry` | a ferry passenger | beanie, luggage look (pale shirt) | "The ferry. I've missed it four times. It hasn't left. I'm consistent." |
| `fare_kip` | Kip | `kip` cast look | "Anywhere with a coupon code. Is this fare paid?" |

**Rewards and unlocks.** Fares as above (about $150 to $400 each). Lifetime fares 10: `cab_livery` (every taxi in the city spawns with the LOUD & CORRECT wrap and the fare is +10%). Lifetime 25: `cab_home` (a taxi is always parked at `pod_garage`). Lifetime 50: `cab_legend` (+15,000 subscribers, the ticker runs LOUD CAB DRIVER DELIVERS FIFTY PASSENGERS, ZERO MINDS). Best shift (fares in one shift, money) is kept.

### 5.2 `hoa_patrol`, HOA Patrol

**Start.** Sit in a `cop` car or an HOA SUV (the suburbs' `suv` with `tag 'hoa'`, cream `#f4ead8`; after `m10_pellets` one is always parked at `hoa_hall`) and press `action` while stopped. Banner: HOA PATROL · LEVEL 1. Press `action` again while stopped with no target to end the patrol.

**Rules.** A random traffic vehicle 120 to 240 m away is flagged (red marker on the minimap and map, a chip over it: VIOLATION: one of MAILBOX ADJACENT, LAWN LENGTH, PARKED WITH INTENT, UNAPPROVED COLOUR, HONKED ON A TUESDAY, TWO OPINIONS ON ONE BUMPER) and its driver flees (`AI.drive(v, 'flee')`: the traffic brain with a goal of maximum distance from the player, cruise at 90% top speed). Stop it under the `stop_vehicle` rules (§7: under 1 m/s with the player's car within 6 m for 2 s, or wreck it). Timer `90 + 30 * level` s. Each stop pays `$150 + 50 * level` and the next level starts after 4 s. Stopping a flagged car earns no heat (the HOA has a liaison); wrecking it earns the normal `destroyVehicle` heat. Failing the timer, leaving the patrol car for more than 10 s, or losing the car ends the patrol at the current level (the level is kept as `best`). Level 12 completes a patrol.

**Rewards and unlocks.** Level 6 reached once: `$2,000` bonus and the HOA SUV at `hoa_hall` gets a Firmness Vest inside (armor pickup, respawns daily). Level 12 reached once: flag `hoa_truce` (HOA patrols are never hostile to the player again, which also retires the `hoa_enemy` behaviour) and the HOA's own star, a cream star icon, shows on the HUD next to the police stars as a joke that never fills. Subscribers +200 per stop.

### 5.3 `sponsor_runs`, Sponsor Runs

**Start.** A Nap Dynasty van (persistent `van`, wrap `nap`: NAP DYNASTY · CODE TAKES20 in the depot blue, tag `sponsorvan`) is parked at `nap_depot`'s loading bay from `m02_read` on. Enter it: banner SPONSOR RUN 1/8.

**Rules.** Eight deliveries in a chain, each to a sponsor landmark in `GTP.rng` order from `['clarity_barn', 'moon_mine', 'strip_gas', 'fish_shack', 'char_charter', 'airport_terminal', 'both_sides_port', 'heirloom_club']`, no repeats in a chain. Timer `max(60, distance / 9 + 20)` s. Pay `$250 + distance / 2` per run minus `$20` per crash (the mattress gets firmer; the chip reads FIRMNESS 7 → 9 → 11), minimum `$100`; the timer running out pays the minimum. The van must not be left for more than 15 s between runs; wrecking it ends the chain. Completing all eight in one chain is a FULL READ: `$1,000` bonus.

**Rewards and unlocks.** First FULL READ: flag `sponsored_van`: the pod van's hp goes 160 → 320 (it is wrapped in mattress) and Sponsor Runs pay x1.5 afterwards. 24 lifetime runs: `+10,000` subscribers and the pod van's wrap gains Bryce's face twice more (wrap `pod3`). Subscribers +150 per run.

### 5.4 `ratio_rampages`, Ratio Rampages

**Start.** Eight pink speech-bubble markers (`kind: 'rampage'`) around the city, each at a landmark door offset. Stand in one on foot: a 3 s countdown card (RATIO RAMPAGE · <weapon> · <n> HECKLERS · <t> s), the weapon is equipped with ammo for the job (restored to what the player had afterwards; leftover rampage ammo is kept), hecklers (`thug` peds with `look.sign` reading one of WRONG, SOURCE?, L, NOTED, DIDN'T READ, cardboard signs in hand) spawn in waves of 4 within 40 m and run at the player; the ones in rr_08 drive. Kills with any weapon other than the given one do not count (the chip says WRONG TAKE). A rampage fails on time out or death; the marker returns after 60 s. Completing one keeps a best time; the marker returns after 10 minutes for replays (no reward the second time, subscribers only).

| id | landmark (offset m) | weapon | hecklers | seconds | reward |
|---|---|---|---|---|---|
| `rr_01` | `impression_alley` (0, 12) | `tableleg` | 12 | 90 | $400 |
| `rr_02` | `protest_plaza` (8, 6) | `pistol` | 10 | 90 | $500 |
| `rr_03` | `stadium` (-20, 0), the parking lots | `shotgun` | 15 | 120 | $700 |
| `rr_04` | `velvetine_pier` (0, 14) | `smg` | 20 | 120 | $800 |
| `rr_05` | `hoa_hall` (10, -8) | `revolver` | 12 | 100 | $700 |
| `rr_06` | `hangar_row` (14, 6), the apron | `rifle` | 25 | 150 | $1,000 |
| `rr_07` | `container_yard` (12, 12), the maze | `hotmic` | 16 (waves of 4 in tight groups) | 120 | $1,000 |
| `rr_08` | `old_money_common` (0, -10) | `ratio` | 6 sedans with two hecklers each (`destroy`-style: wrecks count) | 150 | $1,500 |

**Rewards and unlocks.** All eight once: flag `rampage_king`: every weapon's reserve maximum is x1.5 and the HUD ammo readout turns pink. Subscribers +2,000 per completion.

### 5.5 `monday_memos`, Monday Memos

**Start.** Fifty beige envelopes (`pickup` type `memo`, a bobbing envelope with a red RESPECTFULY stamp, visible from 40 m as a faint pink glow, never on the minimap; the phone's STRANDS tab shows "MEMOS 12/50" and, after 25, a per-district count) hidden around the city from the start of a new game. Collecting one plays `pickup` and a typewriter toast with that memo's one line (below). Memos never respawn; the count is saved.

**Thresholds and unlocks.** 10: `tableleg` if not owned, plus `$500`. 20: a Firmness Vest (armor 100) now and a `firmness_vest` pickup permanently in the pod van (daily respawn). 30: 15% off at Both Sides Arms (flag `memo_discount`). 40: `ratio` unlocked if not owned, plus 10 rockets. 50: `$10,000`, +20,000 subscribers, and the Memo's last page: "Takesworth found all the memos. Is this paid?" (a card, then the ticker). The envelopes are the same prop as the mission crates' sponsor bottle gag: every memo is the same memo.

**The fifty spots.** Offsets are metres from the landmark's door point (x east, z south, `y` only where it is not ground); `{x, z}` points are world metres. Each memo's toast line follows.

| id | where | line |
|---|---|---|
| `mm_01` | `campus_quad` (0, -14), under the ninth table | "Table nine. No chair. Rate it a ten." |
| `mm_02` | `dorm_studio` (-6, 0), by the ON AIR wall | "The mini-fridge is also on air." |
| `mm_03` | `pod_garage` (10, -4), the respray bay's corner | "Respray: $100 a star. Opinions: same price." |
| `mm_04` | `{x: 104, z: 160}`, the centre of Minds Changed Court | "Houses on this court: zero. Minds: same." |
| `mm_05` | `tyn_tower` (0, -12), under the TYN sign | "24 hours. 0 days. Respectfuly." |
| `mm_06` | `green_room` (12, 0), the last motel bay | "Hour four. Bagels sponsored. Still waiting." |
| `mm_07` | `impression_alley` (0, 18), between the losing billboards | "This billboard is losing. It knows." |
| `mm_08` | `goldplate_tower` (-10, 10), under the roof sign's shadow | "Helicopters counted: 2. 'Both.'" |
| `mm_09` | `vault_bank` (8, -6), by the vault that is a hedge | "We short what we love. We love you." |
| `mm_10` | `hospital` (14, 4), the ambulance bay | "Bandage coupon: TAKES20. Wound: a seven." |
| `mm_11` | `{x: 424, z: 328, y: 7}`, on the Loop above the Chyron Ramp | "On the Loop you are legally a party. This is the invitation." |
| `mm_12` | `nap_depot` (-14, -2), behind the showroom podium | "The podium is a mattress. Sleep on it." |
| `mm_13` | `listening_room` (6, -8), the alley by the velvet rope | "Tonight: nothing. Doors at nine." |
| `mm_14` | `strip_gas` (0, -10), between the pumps | "Premium has a stance. Regular has a podcast." |
| `mm_15` | `both_sides_strip` (-10, -24), behind cutout six at the far end of the range lane | "Cutout six did the reading." |
| `mm_16` | `capitol_dome` (0, -16), on the leased steps | "The dome is leased. The steps are a ten." |
| `mm_17` | `fulcrum` (10, 0), outside the second door | "Door two. Same checkbook." |
| `mm_18` | `char_charter` (-8, 6), by the Bronze salad bin | "The salad is Bronze. The bin is Gold." |
| `mm_19` | `ova_hq` (12, -4), under antenna thirteen | "Antenna thirteen is for weather. Thirteen is a lot of weather." |
| `mm_20` | `protest_plaza` (0, 12), the gift shop's back step | "Today's cause: this envelope. Mugs unchanged." |
| `mm_21` | `stadium` (0, 30), where the second name ends | "Goldplate Goldplate. The second one is for emphasis." |
| `mm_22` | `goldplate_links` (-20, 40), in the bunker on hole five | "Par ten. This was a six. Rated a ten." |
| `mm_23` | `vaultwright_manor` (20, 10), the centre of the hedge maze | "You have reached the centre of the hedge. It is also a hedge." |
| `mm_24` | `bridge_main` (0, 6), under the deck, the dead drop | "Dead drop #1. Contents: ad copy. Respectfuly." |
| `mm_25` | `{x: 604, z: 90}`, the ribbon on the sand at the east end of Ribbon Cutting Road | "Ribbon never cut. Rated a ten in advance." |
| `mm_26` | `hoa_hall` (-12, -6), by the violated mailbox | "Mailbox violation: it was adjacent. One star." |
| `mm_27` | `clarity_barn` (14, 0), under the loft door | "Clarity Pellets: now with barn." |
| `mm_28` | `moon_mine` (-8, 8), by the space heater that is thirty GPUs | "$PUNDIT: trustless. Shed: warm." |
| `mm_29` | `culdesac_gas` (10, -8), behind the approved pump | "The HOA approved the pump. Not the price. Not this memo." |
| `mm_30` | `warehouse_42` (-10, 10), crate 42 | "Crate 42 of 42: mystery. Still charting." |
| `mm_31` | `memo_press` (0, 20), the loading dock | "4,000 copies printed. Nobody placed the order. You did." |
| `mm_32` | `balloon_depot` (20, 0), van forty of forty | "Van 40/40. Balloons repaired: 0." |
| `mm_33` | `{x: 40, z: 376}`, the corner of Printworks Parade and Balloon Repair Alley | "Corner of nothing and weather." |
| `mm_34` | `velvetine_pier` (4, 30), the end of the pier | "You can hear the party from here. There is no party." |
| `mm_35` | `afterparty_yacht` (20, 26), the yacht's gangway | "Never sailed. Dress code: a vibe." |
| `mm_36` | `fish_shack` (-8, 4), by the reheating window | "Takes reheated hourly. This one's warm." |
| `mm_37` | `{x: 334, z: 522}`, under the Sponsor Span's north toll gantry | "Toll: one opinion. Keep the change." |
| `mm_38` | `airport_terminal` (0, -20), the baggage carousel | "Baggage claim: your take has arrived. It was on the bus." |
| `mm_39` | `airport_runway` point `west`, on the painted 10 | "Runway 10. Also runway 10. Both tens." |
| `mm_40` | `control_tower` (0, -6), the tower's base | "Tower: clouds rated. Planes: none." |
| `mm_41` | `hangar_row` (-10, 12), under the cutout's wing (inside the lot; +10 would be Baggage Claim Boulevard) | "Hangar 1 of 1. Jet 0 of 1." |
| `mm_42` | `{x: 260, z: 760}`, Plane Spotters' Park bench | "Planes spotted: 0. Memos spotted: 1." |
| `mm_43` | `container_yard` (30, 30), the maze's centre stack | "This container is MERCH. So is that one." |
| `mm_44` | `manifest_quay` (20, 40), the ship's gangway | "The Manifest: cargo moved, 0. Listening, yes." |
| `mm_45` | `ferry_terminal` (0, 90), the end of the ferry pier (the lot is 72 m deep, the pier 24 m beyond it) | "Next ferry: soon. Soon is a vibe." |
| `mm_46` | `customs_shed` (-12, 10), the declared pile | "Declared: everything. Disclosed: code TAKES20." |
| `mm_47` | `museum_of_takes` (2, -20), the statue's plinth on the plaza strip inside the lot (-8 would be Provenance Place) | "THE FIRST TAKE (attributed). Attributed to you." |
| `mm_48` | `heirloom_club` (0, -4), behind the velvet rope at the door (+14 would be Inheritance Avenue) | "Members since before opinions. Opinions since Tuesday." |
| `mm_49` | `old_money_common` (16, 0), on the bandstand (the gazebo sits at the lot's centre, 16 m east of the west door) | "Bandstand. Bands: 0. Stands: 1." |
| `mm_50` | `causeway_east` (12, 0), under the NO plaque at the uptown abutment | "Goldplate Goldplate Causeway. Uptown says NO. Respectfuly." |

### 5.6 `loop_races`, Loop Races

**Start.** A checkered-flag marker at the start line (vehicle marker: drive into it in any car and hold the brake for 1 s; a 3-2-1 card). Three AI racers in `sports` cars (`AI.drive(v, 'racer')`: the traffic brain following the checkpoint list at 95% top speed with rubber-banding of +-8% by their gap to the player, no traffic rules, they avoid walls but hit each other) line up beside the player. Checkpoints are rings (`Render.markerMesh` yellow, radius 8 m, next one highlighted, the HUD arrow points at it); missing one means driving back. Position and lap are on the HUD. Leaving the car for more than 8 s or wrecking it is a DNF.

| id | name | start | route (checkpoints in order) | laps | 1st / 2nd / 3rd |
|---|---|---|---|---|---|
| `lr_01` | The Upper Loop | on the deck above Chyron Ramp (`{x: 424, z: 328, y: 7}`), heading north | the ring's four corners and four midpoints clockwise: NE corner, N mid, NW corner, W mid, SW corner, S mid, SE corner, E mid | 1 | $1,000 / $400 / $200 |
| `lr_02` | The Lower Loop | on the south leg above Arrivals Ramp (`{x: 376, z: 664, y: 7}`), heading west | the lower ring clockwise: SW corner, W mid (over the bay), NW corner (the shared leg), N mid, NE corner, E mid (over the bay), SE corner, S mid | 1 | $2,000 / $800 / $400 |
| `lr_03` | The Figure Eight | outside `heirloom_club` on Inheritance Avenue, heading west | Inheritance Avenue west, the causeway, Goldplate Goldplate Avenue, `bridge_main`, Goldplate Avenue to Chyron Ramp, up onto the Loop, the full figure eight (both rings, crossing at the shared leg), down Arrivals Ramp, Gate Ten Street south to Lost Luggage Lane, east along it onto Container Crescent (Departures Drive and Manifest Road are severed at ground level by the Manifest Ramp, so the z = 182 row is the only ground route from the airport into the port), Trust Fund Terrace north to Inheritance Avenue, east to the finish at the club | 2 | $4,000 / $1,500 / $700 |

`lr_02` opens after any `lr_01` finish; `lr_03` after a `lr_02` win. Best times are kept and shown on the marker chip. Winning all three once: `race_car` flag: a pink `sports` car, THE RATIO (wrap `ratio`, "SLOW IS A TAKE" on the doors), is parked at `pod_garage` forever (respawns on load). Subscribers +5,000 per first-time win, +500 per repeat.

### 5.7 `stunt_jumps`, Stunt Jumps

**Start.** Ten `ramp_prop` wedges (6 m long, 1.3 m high, striped) placed in the world; a jump counts when the player's car leaves one at any speed. Rules: airborne for at least `minAir` seconds (1.0 unless noted) and landing on wheels inside the landing zone (14 m radius around the stated landing point; not wrecked, not in water, not on a roof). When a car leaves a stunt ramp and stays airborne past 0.6 s, time slows to 0.35x for up to 2.2 s and the rig swings to a side view (yaw +70°, dist 9, height 2.5, fov 55) until the wheels touch, then eases back; SFX `jump` and a whoosh. A good landing shows STUNT PUNDIT: <name> with the airtime, pays `$500` the first time, and plays `confirm`; a bad one shows CONTEXT STAMPED small and nothing else.

| id | name | ramp at (landmark offset m, heading) | landing | minAir |
|---|---|---|---|---|
| `sj_01` | The Quad Hop | `campus_quad` (0, 22), heading north over the LOUD & CORRECT sign | the Quad's north path | 1.0 |
| `sj_02` | Lower Third Leap | the downtown promenade `{x: 456, z: 200}`, heading south | the promenade 30 m south | 1.0 |
| `sj_03` | Assembly Required | the Loop's north leg `{x: 352, z: 136, y: 7}` (above Perpetual Assembly Plaza, x 84..93 tiles), heading north off the deck | Perpetual Assembly Plaza, a park with no building to land on (the Fulcrum lot is mostly roof) | 1.6 |
| `sj_04` | Par Ten | Clubhouse Drive `{x: 536, z: 182}`, heading south over the bunker | the fairway of hole 3 | 1.0 |
| `sj_05` | Hedge Fund | `vaultwright_manor`, on the lawn 3 m north of the hedge maze's first hedge and in line with its centre column (the maze is the five `hedge` props east of the house: `mx + 4.8`, `mz - 3` in `_landmarkProps`'s mansion case), heading south along the maze | the south lawn past the maze's far end (the hedges are 1.8 m tall and about 20 m long; a hedge is also a hedge) | 1.2 |
| `sj_06` | Span Skip | the Sponsor Span's south end `{x: 332, z: 598}`, heading south over the toll gantry | Arrivals Avenue | 1.0 |
| `sj_07` | Runway 10/10 | the runway's west threshold (point `west`), heading west | the 48 m beach west of the threshold (sand x 6..18 tiles; landing point `{x: 46, z: 826}`): a truck at 18 to 28 m/s lands 20 to 35 m out, and nothing on wheels reaches the sea | 1.0 |
| `sj_08` | Hangar Hop | `hangar_row` (-8, 14), inside the lot's south end, heading north over the cutout jet | the hangar apron (the lot's north half) | 1.0 |
| `sj_09` | Container Clear | `container_yard` (20, 36), heading north over a single-high row | the next lane | 1.0 |
| `sj_10` | Well, Actually | Stoop Speech Street `{x: 752, z: 372}`, heading south over the Common's fountain | the lawn past the bandstand | 1.2 |

All ten once: `$5,000`, +10,000 subscribers, flag `stunt_pundit` (the ticker: PUNDIT LANDS TEN JUMPS; MINDS STILL AIRBORNE).

### 5.8 Subscribers

A meta counter, `player.subs` (saved), shown under the money as `SUBS 12.4K` with the same roll-up animation; gains float up from the money as `+150`. Sources: a story mission `reward x 5`; strands as listed above (fare +150, HOA stop +200, sponsor run +150, memo +400, rampage +2,000, race first win +5,000, stunt +1,000); chaos: +25 per wanted star gained, +10 per prop knocked over, +40 per vehicle the player wrecks, +5 per ped who barks back at a honk, capped at +500 per minute of chaos. Losses: none (the audience never leaves; it only forgets).

| tier | subscribers | name | perk |
|---|---|---|---|
| 0 | 0 | Pre-Viral | - |
| 1 | 5,000 | A Voice | `group_rate`: taxi fares and Sponsor Runs pay +25% |
| 2 | 25,000 | Verified-ish | `comped_respray`: pay-and-spray costs $50 a star |
| 3 | 75,000 | Main Character | `sponsor_discount`: 25% off at Both Sides Arms; the hospital no longer takes your weapons (the 10% cash loss stays) |
| 4 | 150,000 | Pundit-Industrial | `plot_armor`: respawn with 50 armor; cop hit chance -15% |
| 5 | 300,000 | The Memo | `infinite_sidebar`: the pistol reloads from nothing (no reserve needed) and the Quad's tables turn gold |

A new tier shows a card (NEW TIER: MAIN CHARACTER with the perk line) and a ticker line. The story alone reaches tier 3 by the credits; tier 5 needs most of the strands, which is the point.

---

## 6. Playability: the front end, saves, checkpoints, hints, the map

### 6.1 Loading screen

Shown on boot (before the title), on every New Game and on every Load. Black, the logo small top-left, a 60%-wide progress bar in the game's pink with a gold folding-table caret that slides along it, the stage name under the bar in small caps, and a tip card bottom-centre that rotates every 4 s (fade) through the twenty tips below in `GTP.rng` order. The bar is fed by `GTP.Events.emit('load:progress', {stage, frac})` from `World.generate` and `Render` (the UI reads the last event; headless mode emits them too and the loading page is skipped). Stages and their share of the bar:

| stage id | label | bar |
|---|---|---|
| `textures` | Generating the discourse | 0 → 10% |
| `tiles` | Paving Grievance City | 10 → 25% |
| `roads` | Painting lanes, elevating the Loop | 25 → 35% |
| `landmarks` | Renaming things after the President | 35 → 50% |
| `props` | Setting up folding tables | 50 → 60% |
| `minimap` | Drawing the map from memory | 60 → 70% |
| `chunks` | Building the nine chunks around the spawn | 70 → 95% (one step per chunk) |
| `warmup` | Booking guests | 95 → 100% (the spawner warm-up) |

The screen holds at 100% for 0.3 s and fades; on New Game it fades into `cs_opening`, on Load into `playing`, on boot into the title.

**The twenty loading tips.**
1. Hold Aim and press Tab to switch targets. The head is where the take is.
2. On the Loop you are legally a party. On the Lower Loop you are legally a layover.
3. Gus's Garage resprays stars for $100 each. Opinions are the same price.
4. A star fades if nobody is looking at you. Try an alley. Try a hedge. The hedge is also a hedge.
5. Both Sides Arms sells to both sides. That's balance. Bring money.
6. Clarity Pellets heal 50. Your doctor won't tell you that. Merle will.
7. Every mission objective is a checkpoint. Failing sends you back, not home.
8. The weather balloons have sirens. The sirens have a liaison.
9. Press M for the map. Click anywhere to set a waypoint. The arrow is not a journalist either.
10. The pod van at the garage is home. Sitting in it saves the game. Also it is a van.
11. Hot mics go off. Everyone holds them. Don't hold it.
12. The Fact Checker reads at 200 metres. Hold Aim to scope, roll the wheel to zoom, breathe.
13. Taxis take fares. Press E in one. Passengers tip for not crashing, which is rare here.
14. Fifty Monday Memos are hidden in the city. Every one is the same memo.
15. A Ratio Launcher rocket is a token. The warranty is also a token.
16. The HOA has its own wanted stars. They do not apply to you unless they do.
17. Drive-by: hold Aim in the driver's seat with a pistol, revolver, SMG or shotgun. The window counts as a stance.
18. Stunt ramps are striped. Airtime over one second is a take. Landing is optional.
19. Press Tab with no gun raised to open the weapon wheel. The world slows down. It does not stop.
20. Minds changed so far: zero. The counter is on the stats page. It has never moved.

### 6.2 Main menu

The title screen keeps the attract camera, the logo with the folding-table T and the parody line, and becomes a real menu (keyboard, mouse, touch, gamepad): **NEW GAME**, **CONTINUE** (the most recently saved slot, greyed if none, shows the slot's summary line), **LOAD GAME**, **SETTINGS**, **CREDITS**. The selected item's description shows on the right. Every page is a `UI.state.title.page` (`menu | slots | settings | controls | credits | confirm`).

- **NEW GAME.** Opens the slot picker (three slots): choose an empty slot, or an occupied one with a confirmation screen (OVERWRITE SLOT 2? It has 11 missions and 3h12m in it. [OVERWRITE] [BACK]). A seed field (digits, default a random seed) sits under the slots for people who want the same city as a friend.
- **LOAD GAME.** The three slots as cards: slot number, mission progress (`14 / 25 missions`, the last mission title), play time (`h:mm`), money, location (district name and nearest landmark label), the wanted stars at save time, and the save timestamp. [LOAD] and [DELETE] (DELETE asks: DELETE SLOT 3? [DELETE] [BACK]). Empty slots read `EMPTY. Respectfully.`
- **SETTINGS.** Master / Music / SFX volumes (0-100 sliders, `GTP.Audio.setVolumes({master, music, sfx})`; music is the radio and the title theme, sfx everything else), Quality (LOW / MEDIUM / HIGH: `QUALITY.shadows` off/on/on, `drawDistance` 160/260/360, `pedDraw` 80/110/140, `vehicleDraw` 150/200/260), Controls (the existing controls panel, read-only, plus the gamepad diagram when a pad is connected), Gamepad (ON / OFF; OFF ignores the pad entirely), Hints (ON / OFF), Subtitles size (SMALL / LARGE: the dialogue box scale 1 / 1.25). Settings are saved in `localStorage['gtp.settings.v1']` (try/catch) and apply at once.
- **CREDITS.** The existing credits roll.

### 6.3 Saves: three slots, autosave, manual save, in-game load

**Format v3.** `localStorage['gtp.save.v3.slot' + n]` (n = 1, 2, 3) is JSON:
```js
{ version: 3, slot, seed, savedAt (ms), playTime (s), money, subs, x, z, yaw, hp, armor, weapon,
  weapons: {id: total}, ammo: {id: {mag, reserve}},
  completed: [...], flags: {...}, stats: {...}, clock, day, radioStation, cameraMode,
  memos: [ids], strands: {id: {...}}, bestTimes: {missionId: seconds}, settingsSnapshot: null,
  summary: { missions: 14, missionsTotal: 25, lastMission: 'Hot Mic', district: 'Manifest Harbor', landmark: 'Customs & Disclosures', wanted: 0 } }
```
`localStorage['gtp.save.v2']` (the old single save) is read once at boot and, if present and no slot 1 exists, migrated into slot 1 with `playTime 0` and the summary rebuilt; the old key is then left alone. Load rebuilds the world from `seed` as before.

**Autosave** (a small spinning folding-table icon bottom-right for 1 s, never a toast) into the active slot: after every `mission:complete` (after the outro and any cutscene), after every `strand:cycle`, and whenever the player enters the podcast van while it sits in Gus's Garage bay (the home marker: a faint house icon on the minimap at `pod_garage`; the pod van is persistent and respawns there on load). Never during a mission, a strand, a wanted level or a cutscene. An autosave failure (storage blocked) shows one toast per session and stops trying.

**Manual save**: the pause menu gains SAVE (into the active slot, with a confirmation if a mission or strand is running: "Saving now will abandon the mission. [SAVE] [BACK]"), and LOAD GAME (the slot cards, same as the title; loading from in-game asks "Lose unsaved progress? [LOAD] [BACK]"). Slot management (overwrite and delete with their confirmation screens) lives on the same slot cards everywhere.

### 6.4 Checkpoints and retry

Every top-level objective (and every child of a `timer_wrap`) is a checkpoint. When an objective starts, the runtime takes a **snapshot**: player position, hp, armor, weapon, ammo, money; the player's vehicle (type, position, yaw, hp, tag, wrap, colour); the wanted level and heat; the mission's objective index and the `timer_wrap` remaining time; mission flags and `ctx` spawn definitions (not the entities; they are re-spawned from the definition). On failure, the CONTEXT STAMPED card offers **RETRY** (from the last checkpoint: the world is reset like `Missions.start` does on abort, the snapshot is restored, the objective restarts; a timer restarts at the snapshot's remaining time plus 15 s, never more than the original), **RESTART MISSION** (from the intro, intro skipped) and **QUIT** (abort, back to the marker). Retries are unlimited and free; `stats.retries` counts them. The old behaviour (fail → marker) is RESTART with QUIT. Death during a mission: the RATIO'D flow runs first (hospital, the 10% cash), then the card with RETRY from the checkpoint (the player is teleported back to the snapshot position in the snapshot vehicle, so a retry never starts at the hospital).

### 6.5 Mission replay and best times

The phone's MISSIONS tab lists completed missions with their best time (`bestTimes[id]`, the seconds from the first objective to the outro, timers paused during dialogue). REPLAY starts the mission with `{replay: true}`: the intro cutscene plays, rewards, flags, unlocks and autosave are skipped, the player's weapons are restored afterwards, and only a better time is written. A replay in progress shows REPLAY in the mission banner. The ending missions are replayable too; replaying rolls credits again (that is the alternate ending rule from the GDD, unchanged).

### 6.6 Tutorial hints

A HUD prompt system: a small panel under the objective text with an icon, a line and the key glyphs (keyboard / touch / gamepad per the active input), shown for 6 s or until the action happens, each hint once per save (`flags.hint_<id>`), never during a cutscene or minigame, never two at once (a queue, 2 s apart). Settings → Hints OFF disables them.

| id | when it fires | text |
|---|---|---|
| `h_move` | the opening cutscene ends | "WASD or the left stick moves. Shift runs. Space jumps." |
| `h_look` | 3 s after `h_move` with no look input | "Move the mouse or the right stick to look. Click the game to lock the pointer." |
| `h_enter` | first time within 3 m of a vehicle on foot | "F or Enter gets in. The same key gets out." |
| `h_drive` | first time in the driver's seat | "W goes, S brakes and reverses, Space is the handbrake. Hold it for a slide." |
| `h_arrow` | first `drive_to` objective | "The arrow on the minimap and the top of the screen points at the objective. The Loop is the fast way across town." |
| `h_aim` | first time holding a gun | "Hold the right mouse button (or Q) to aim. Tab switches targets. Head shots count double." |
| `h_reload` | first time the magazine is under a third | "R reloads. An empty magazine reloads itself." |
| `h_wheel` | first time owning three or more weapons | "Hold Tab (no gun raised) for the weapon wheel. The wheel or [ ] cycles." |
| `h_wanted` | first wanted star | "You're wanted. Break line of sight and the star fades. Gus's Garage resprays it for $100." |
| `h_bust` | first time a cop is within 8 m on foot at 1+ stars | "Cops on foot can bust you in a few seconds. Get in a car or run." |
| `h_shop` | first time within 30 m of a Both Sides Arms marker | "Green light: a shop. Stand in it to buy weapons, ammo, Clarity Pellets and the Firmness Vest." |
| `h_taxi` | first time in a taxi | "Press E while stopped to start taking fares." |
| `h_patrol` | first time in a cop car or the HOA SUV after `m10_pellets` | "Press E while stopped to start an HOA patrol." |
| `h_map` | first time the player is more than 250 m from the objective | "M opens the map. Click anywhere to set a waypoint." |
| `h_save` | first time entering the pod van at the garage after `m01_van` | "The pod van is home. Sitting in it here saves the game." |

### 6.7 The full-screen map (M)

M opens the map directly (Game state `paused`, `UI.state.pause.page = 'map'`; the phone's MISSIONS / STATS / STRANDS / REPLAY tabs sit along the top of the same page and Tab cycles them; Esc or M closes). The map is the minimap bake at full size (896 x 896 px for 1 px per metre, zoomed to fit the screen), with district names in the game's gold caps at their centres, landmark icons by kind (a table for `campus`, a dish for `studio`, a cross for `hospital`, a star for `police`, a wrench for `garage`, a pump for `gas`, a plane for `terminal`/`runway`, a crane for `yard`/`quay`, a boat for `dock`/`ferry`, a column for `museum`, a target for `gunshop`, a dot for everything else), landmark labels at zoom 2x and above, mission markers (blue), the objective (yellow), strand markers (pink bubble, cream HOA star, checkered flag, striped ramp), shops (green), the player arrow, the home icon, and the waypoint (a white pin). A legend panel bottom-left lists the icons. Zoom with the wheel, + / -, or pinch (1x to 4x, centred on the cursor); pan by dragging, WASD, or the left stick; the right stick zooms on a pad. **Click (tap, or A on a pad) sets the waypoint**: the HUD arrow points at it when no objective is closer in priority (the objective arrow wins while a mission runs; the waypoint arrow is white), and the minimap draws a white route line from the player to it along `World.findPath(..., {mode: 'car'})` (refreshed every 2 s, straight line if no path). Clicking the waypoint again, or arriving within 10 m, clears it. The waypoint is saved.

### 6.8 Gamepad (standard layout) and keyboard additions

The `GTP.Input` action list gains `reload`, `wheel` (hold), `waypoint`, `zoomIn`, `zoomOut`. New keyboard bindings: `R` reload (the radio moves to `N`; `R` on the title and pause still does nothing), `Tab` held = wheel, `M` map, `N` radio. Standard-layout mapping (`navigator.getGamepads()` indices):

| pad | on foot | in a vehicle | menus / map |
|---|---|---|---|
| left stick | move | steer (x) / throttle & brake (y) | navigate / pan |
| right stick | look | look | zoom (map) |
| A (0) | jump | handbrake | confirm / set waypoint |
| B (1) | sprint (hold) | horn | back |
| X (2) | reload | radio | delete / secondary |
| Y (3) | enter vehicle | exit vehicle | tab |
| LB (4) | previous weapon | previous weapon | previous page |
| RB (5) | next weapon | next weapon | next page |
| LT (6) | aim (hold) | drive-by aim (hold) | zoom out |
| RT (7) | shoot | shoot (drive-by) | zoom in |
| Back (8) | map | map | close map |
| Start (9) | pause | pause | pause / close |
| L3 (10) | camera mode | camera mode | - |
| R3 (11) | lock-on cycle / wheel (hold) | lock-on cycle | - |
| D-pad | weapon wheel segments (4 quick slots: up pistol-class, right rifle-class, down thrown, left melee) | same | navigate |

Dead zone 0.18, look sensitivity 2.4 rad/s at full deflection, the scope divides it by zoom. Rumble, where `vibrationActuator` exists: 80 ms on impacts and shots, scaled by the weapon's recoil.

### 6.9 Quality and difficulty

Quality in the pause menu (same options as Settings, §6.2) applies without a reload: shadows toggle `renderer.shadowMap.enabled` and the sun's `castShadow`; draw distance changes the camera far plane, `fogStart` (0.46 of the distance) and the chunk cull radius; the entity draw ranges follow the preset.

Difficulty tuning (the "friendlier" numbers; constants in `01_config.js` and `C.AI`):

| knob | was | now | where |
|---|---|---|---|
| `WANTED.decayRate` | 1.2 heat/s | 1.6 at 1-2 stars, 1.2 at 3+, 0.9 at 5 | `01_config.js` |
| `WANTED.decayDelay` | 4 s | 3 s | |
| `WANTED.thresholds` | [2, 6, 12, 20, 30] | [2, 7, 14, 24, 36] | the top stars take a little more |
| cop hit chance per shot (`C.AI.copAccuracy`) | 0.65 flat | 0.5 at 1-2 stars, 0.62 at 3-4, 0.7 at 5 (SWAT 0.6) | `07_ai.js` / `08_combat.js` |
| `AI_DAMAGE_MUL` | 0.5 | 0.45 (SWAT rifles 0.4) | `08_combat.js` |
| bust time on foot (`C.AI.bustTime`) | 1.5 s in reach | 2.2 s, and never while the player is sprinting | `07_ai.js` |
| health pickups | 2 (hospital, fish shack), 90 s respawn | 5 (+ terminal, ferry, club), 60 s respawn, +50 hp each | `20_content_world.js` |
| armor | 1 pickup (precinct) | 3 pickups (+ HOA Hall, customs after m09b) and the Firmness Vest at the shop for $500 | |
| `ECONOMY.deathCashLoss` | 0.10 | 0.10 (unchanged; tier 3 keeps weapons) | |
| `ECONOMY.bustedFine` | $500 | $500 up to 2 stars, $800 at 3+, never more than 15% of cash | |
| mission timers | as listed | §3.4 for the first three; new missions as written; every timer gets +15 s on RETRY | |
| respray | $100 / star | $100; tier 2 $50 | |

---

## 7. New objective types and schema extensions

All new types follow the existing interpreter rules: distances in GDD units (8 per metre), `text` for the HUD, `failOn` reasons listed, spawns tracked in `ctx` and cleaned up like every other spawn, a checkpoint taken at the start of each. Targets gain one form and spawns gain a few optional fields (listed last).

| type | params | completion | fails with |
|---|---|---|---|
| `equip` | `weaponId`, `ammo` (reserve rounds; a magazine is filled first) | instant: the weapon is given (`player.weapons[id] += ammo`, `ammo[id]` set), selected, the `weapon` event fires, a toast "Equipped: <name>"; the objective completes the same step | never |
| `deliver_passenger` | `spawn: {ped: castId|role, at: {landmark|x,z}}`, `to: {landmark|x,z}`, `vehicle: 'any'|'spawned:<tag>'`, `board: {radius (units, default 32), hold (s, default 1)}`, `dropRadius` (units, default 96) | the ped is spawned at `at` with a yellow marker and a `wave`; when the player's qualifying vehicle is within `board.radius` of the ped at speed under 1 m/s for `board.hold` s the ped walks to the nearest free door (`enterVehicle`, passenger seat), the marker moves to `to`; completes when the vehicle stops (speed under 1 m/s) within `dropRadius` of `to` with the passenger aboard; the passenger then exits and walks away (`AI` release) | `passenger_lost` (the passenger dies or the vehicle sinks or wrecks), `vehicle_lost:<tag>` as usual |
| `stop_vehicle` | `spawn: {vehicle, tag, at, color?, driven: 'traffic'|'cop', flee: true|false}`, `stopSpeed` (m/s, default 1), `hold` (s, default 2), `maxDist` (units; beyond it for 5 s = escaped), `wreckCounts` (default true) | the target's speed stays under `stopSpeed` while the player's vehicle is within 6 m (or the player on foot within 3 m) for `hold` seconds; a wreck also completes it when `wreckCounts`; the HUD shows a STOPPED hold bar | `target_escaped` (beyond `maxDist` for 5 s), `target_destroyed` when `wreckCounts: false` |
| `stunt` | `ramp: 'sj_xx'` (or `at: {x,z}, heading`), `vehicle: 'any'|'spawned:<tag>'`, `minAir` (s), `minSpeed` (m/s, measured when leaving the ramp; 0 = any), `landing` (optional override of the stunt's landing zone) | the qualifying vehicle leaves the named ramp at or above `minSpeed`, stays airborne for `minAir`, and lands on its wheels inside the landing zone (the `stunt_jumps` rules and slow-motion apply) | a landing in water or on the roof: `stunt_failed` (the objective restarts from the drive-up on RETRY rather than failing the mission, unless `strict: true`) |
| `race` | `race: 'lr_xx'` (a strand race id) or inline `{start, checkpoints: [{landmark|x,z,y}], laps, racers: n}`, `place` (required finishing position, default 1), `vehicle` | the player crosses the last checkpoint of the last lap in a position at or better than `place` | `race_lost` (finished worse than `place`), `dnf` (left the car 8 s, wrecked) |
| `collect_any` | `spawn: {pickupType: 'mission', count, around, radius, label}`, `need` (how many of `count` complete it) | like `pickup`, but completes at `need` of `count` (the rest are removed); progress shows `need` | - |
| `cutscene` | `cutscene: 'cs_xx'` or an inline script | plays the script (§4) in state `cutscene`; completes on `onDone`; checkpoints skip it on RETRY | never (skippable) |
| `shop` | `landmark` (a `gunshop`), `buy: itemId` (optional) | the player opens the shop at that landmark (and, if `buy`, buys that item) | - |

**Extensions to existing types.**

- `defeat`: optional `weapon: id` (only kills with that weapon count; a kill with another shows WRONG TAKE and the ped is re-spawned at the next wave), `mustKill: true` (fled and down-for-3-s peds do not count; only dead).
- `destroy`: optional `weapon: id` (only wrecks caused by that weapon count: a wreck's `lastHitBy` weapon id), `driven: 'cop'` (the targets drive at the player like cruisers and ram), `colors: [...]` (one per spawned vehicle, in order), `flee: true` (the drivers run from the player at 90% top speed).
- Ped spawns: `stationary: true` (the mission brain never moves them; they turn to face the player; a hostile stationary ped shoots from where it stands whenever the player is inside its weapon's range, with the normal AI accuracy, and never charges, so the m12b couriers at a hundred metres are a firefight on paper and a shooting lesson in practice), `hostile: false` (no attacking, no heat; they stagger when hit, which with `mustKill` is the cardboard range), `ped` may be a cast id as well as a role (`courier`, `cutout`: `count` copies spawn with that cast look, the `thug` role brain and the cast `voice`), `ped: 'cutout'` (a new cast entry: a cardboard heckler, 30 hp, `look.sign` WRONG, `look.flat: true` so `pedParts` builds a single plane with a stand, knocked over rather than killed: the death is a topple with a `puff`, no cash drop, counts as a kill for `defeat`).
- Targets: `{landmark, point: 'name'}` resolves `landmark.points[name]` (tile coordinates in the world data, e.g. `airport_runway.points = {east: {tx: 101, tz: 206}, west: {tx: 20, tz: 206}}`, `both_sides_strip.points = {range: {tx: 73, tz: 99}}`, `causeway_east.points = {island: {tx: 154, tz: 67}, uptown: {tx: 161, tz: 67}}`); `{landmark, offset: {x, z}}` adds GDD units to the door point. Both forms go through `resolvePoint`, so a spawn's `around` accepts them too (m03b spawns its cutouts `around: {landmark: 'both_sides_strip', point: 'range'}`); `around: {tag: 'x'}` places a pickup spawn at the tagged vehicle's current position.
- `enter_vehicle` with a `tag` that already names a live persistent vehicle (`podvan` from `m01_van`, the strands' `sponsorvan`) reuses that vehicle instead of spawning a second one, moving it to a free bay at `at` if it is more than 60 m away; `wrap` and `color` on the spawn are applied to it. A missing or wrecked one is spawned as before.
- `onComplete`: `takeWeapon: id` (removes the weapon and its ammo, with the toast "<name> returned"), `playCutscene: 'cs_xx'` (after the outro), `giveMoney: n`, `subs: n`.
- Missions: `replayable: false` to exclude a mission from REPLAY (none use it), `act: 1|2|3` for the phone's grouping, `cutsceneIntro: 'cs_xx'` to override the default `cs_intro_<id>` lookup.
- `vehicle: 'spawned:<tag>'` on `drive_to`, `stunt` and `deliver_passenger` accepts the strand-owned persistent vehicles by tag (`sponsorvan`, `podvan`).

Every new type is exercised in `tests/expansion_missions.js` (one mission per type registered through `Missions.registerTest`), and `tests/campaign.js` runs all 25 story missions in the §3.3 order.

---

## 8. Radio and flavor for the new districts

### 8.1 Ticker (12 new lines, appended to `GTP.Content.radio.ticker`)
1. GOLDPLATE INTERNATIONAL RATED A TEN BY GOLDPLATE; FLIGHT COUNT HOLDS AT ONE
2. RUNWAY NUMBERED 10 AT BOTH ENDS; PILOTS CONFUSED, PRESIDENT CLEAR
3. FERRY TO ELSEWHERE DELAYED; ELSEWHERE UNAVAILABLE FOR COMMENT
4. CONTAINER YARD DECLARES EVERYTHING MERCH; CUSTOMS DISCLOSES COUPON CODE
5. MUSEUM OF TAKES ACQUIRES FOLDING TABLE; PROVENANCE IS A PODCAST
6. HEIRLOOM CLUB ADMITS FIRST NEW MEMBER SINCE FOUNDING; MEMBER IS A HEDGE
7. OLD MONEY SAYS NO TO CAUSEWAY NAME; PRESIDENT ADDS THIRD GOLDPLATE
8. BOTH SIDES ARMS OPENS THIRD BRANCH; BOTH SIDES NOW ARMED, BALANCED
9. LOWER LOOP OPENS; DRIVERS LEGALLY A LAYOVER
10. SPONSOR SPAN TOLL SET AT ONE OPINION; TRAFFIC DOUBLES
11. JET ARRIVES ON TRUCK, IN PROFILE; BRAVADIA DECLARES LIFT
12. CRANES ON MANIFEST QUAY MOVE ZERO CARGO; LISTENING SESSION RATED A TEN

### 8.2 Ped barks (10 new; `barks.byDistrict` gains `airport`, `port`, `uptown`; `doorman` is a role pool)
1. (airport) "My gate changed when I got to it. The new gate is this one. It changed again."
2. (airport) "One flight a day. It's delayed. It's rated a ten."
3. (airport) "I spotted a plane once. It was a truck."
4. (port) "Every container says MERCH. I opened one. Merch."
5. (port) "The ferry hasn't left since I was hired. I was hired to announce it."
6. (port) "Three cranes, one ship, no cargo. Best job in the city."
7. (uptown) "We've had the same opinion since the founding. We had it framed."
8. (uptown) "The museum has a take under glass. I donated the glass."
9. (uptown) "The causeway name is a NO from us. The plaque cost more than the causeway."
10. (doorman, `heirloom_club`) "Members only. Who was your grandfather listening with?"

### 8.3 Ads (6 new; two per station on `pennant_fm`, `velvetine_888`, `quiet_signal`, appended to `ads`; the Nap Dynasty minute is unchanged)
1. (pennant_fm) Goldplate International. One runway, two tens. Now boarding: a ten.
2. (pennant_fm) The Goldplate Goldplate Causeway. Free. Uptown pays in NO.
3. (velvetine_888) The Ferry to Elsewhere. Departs hourly. Arrives when the vibe is right.
4. (velvetine_888) Manifest Quay listening sessions. The ship is the venue. The cargo is you.
5. (quiet_signal) Customs & Disclosures. Everything has been declared. Nothing has been disclosed. A code has been issued.
6. (quiet_signal) Both Sides Arms. A side has been armed. The other side has been armed. Balance has been achieved.

### 8.4 Street names and billboards

Street names for the three districts are in §1.2 (`GTP.Content.streets` entries with `district` set). Four new Impression Alley style billboard pairs (`billboards.pairs`; the second four pairs face each other along the Shoreline Stroll in uptown, and the Sponsor Span's abutment board cycles the single ads):

```js
['OLD MONEY', 'NEW TAKES'],
['DECLARED', 'DISCLOSED'],
['RUNWAY 10', 'RUNWAY 10'],
['WE ARM BOTH SIDES', 'THIS SIDE IS WINNING']
```

New single ads (`billboards.ads`): `'GOLDPLATE INTERNATIONAL: ONE FLIGHT, TWO TENS'`, `'FERRY TO ELSEWHERE: SOON'`, `'BOTH SIDES ARMS: BALANCE'`, `'MANIFEST YARD: EVERYTHING IS MERCH'`, `'THE HEIRLOOM CLUB: NO'`.

---

## 9. Content-rules self-check

- **Rule 1, original archetypes.** Every new name is invented and funny on its own: Merle Firmness, the Heirloom Club, the Museum of Takes, Manifest Harbor, Goldplate International, Both Sides Arms, the Ferry to Elsewhere, Customs & Disclosures, the Rebuttal, the Monologue, the Fact Checker, the Hot Mic, the Ratio Launcher, the twelve Loud Cab archetypes, every street. None is a real person, company, show, product, slogan, catchphrase or a thin edit of one; the weapon names are jokes about punditry, not real firearm brands or models, and no weapon text fetishises hardware (calibres, makes and real-world jargon are absent). Portraits stay parametric; Merle's look is a cousin of an existing invented look.
- **Rule 2, no real events or control tropes.** The expansion adds no assassination, shooting, death, trial, arrest, scandal or lawsuit, direct or coded. The airport, port and old-money district satirise institutions (airports that rate themselves, customs that discloses coupon codes, a club whose only policy is lineage), never a real place, nation or agency. The twist stays the inverse of a control story and `cs_twist` restates it: nobody is in charge, everyone subscribed, the comment section wrote the memo. No group controls anything; the only "both sides" is a gun shop joke about balance.
- **Rule 3, punch at power.** No slurs; no joke's punchline is race, ethnicity, religion, nationality, gender, sexuality, disability or body. The old-money jokes are about inherited money and inherited opinions. No sexual content: the club, the ferry and the yacht remain places where nothing happens. No minors (the freshman is a college student). Bryce remains the butt of the joke in every new mission, every cutscene and both endings.
- **Rule 4, cartoon violence.** Hit zones, kill confirms and the sniper are arcade feedback: pixel puffs, a hat knocked off, "WRITE THAT DOWN", RATIO'D text, cardboard hecklers that topple. No gore, no executions, nothing aimed at a real person or stand-in; AI never aims for the head.
- **Rule 5, tone.** Fast, absurd, PG-13; mild profanity at most; dialogue two to six lines.
- **Audit.** This document avoids every term on the `tests/content_audit.js` lists (the real-name, place, agency, hate, trope and sexual lists), including the bounded words that could occur by accident in English prose; `node tests/content_audit.js` passes with this file in the tree. Every mission uses only the existing twelve objective types plus the eight defined in §7, with literal params; vehicle types are engine classes; `follow` is unused in the new missions; both endings still `require ['m14_grift']`; respawn ids are unchanged.

