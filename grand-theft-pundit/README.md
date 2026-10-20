# Grand Theft Pundit

*Steal the Discourse.*

A third-person, 360-degree-movement open-city parody game in the GTA III / Vice
City mold, running entirely in the browser. You are Bryce Takesworth, a
folding-table campus pundit who climbs from Founders' Quad to the cable chair
through sponsor reads, donor galas, ratio wars, airport runs, a container-yard
ferry job and errands for a spook agency that officially repairs weather
balloons. Twenty-five story missions in three acts with cutscenes, two endings,
an 896 m square city of eleven districts with a figure-eight elevated highway,
two bridges, an airport with a drivable runway and a working port, traffic,
pedestrians, a five-star police response, a twelve-weapon arsenal with a shop
chain, seven side strands (taxi fares, HOA patrols, sponsor deliveries, ratio
rampages, fifty hidden memos, Loop races, ten stunt jumps), a subscribers
meta-game, two minigames (a debate and a ratio war), three save slots with
autosave, and four procedural radio stations. Everything is content; everything
is a joke about the pundit-industrial complex.

The whole game is procedural: no image, model, font or audio files. Textures are
drawn on canvases, meshes are built from primitives, sound is WebAudio
synthesis. The only dependency is three.js, vendored.

## Running it

- Open `index.html` straight from disk (`file://` works), or
- serve the folder with any static server, e.g. `npx http-server .` and open
  the printed URL, or
- build the single-file version with `node build-artifact.js` and open
  `dist/artifact.html`.

The title menu has NEW GAME, CONTINUE (once a slot exists), LOAD GAME (three
slot cards), SETTINGS (volumes, quality preset, draw distance, weather, gamepad,
hints, subtitles), CONTROLS and CREDITS. A new game opens on a short cutscene at
the quad. Audio starts after the first key press or click, as browsers require.
The game autosaves after every mission and strand cycle and whenever you park
the pod van at home; the pause menu saves to any slot by hand.

URL parameters for testing and debugging: `?seed=<int>` (city seed),
`?mission=<id>` (boot straight into a mission, `&intro=1` keeps its intro),
`?clock=<hour>`, `?quality=low|medium|high|ultra|auto`, `?low=1` (no shadows,
shorter draw distance), `?weather=clear|overcast|rain`, `?mute=1`, `?debug=1` (a
stats line on the HUD), `?opening=1` (play the opening cutscene on this boot),
`?headless=1&skipTitle=1` (no animation frame loop; tests step the simulation
with `GTP.game.advance(seconds)`).

## Controls

Keyboard and mouse:

| Key | Action |
|---|---|
| WASD / arrows | Move; steer in a vehicle |
| Shift | Run |
| Space | Jump on foot, handbrake in a vehicle |
| Q or right mouse (hold) | Aim with lock-on (the sniper's scope on foot); also a drive-by from the driver's seat |
| E, left mouse or Ctrl | Action / fire (punch, shoot, megaphone, throw); E also starts a taxi shift or an HOA patrol while stopped in the right car |
| F or Enter | Enter / exit a vehicle |
| Tab (tap) | Next lock-on target |
| Tab (hold) | The weapon wheel: twelve segments, point with the mouse (or `[` `]`), release to equip; the world runs at 0.2x meanwhile |
| Mouse wheel or `[` `]` | Cycle weapons; zoom the scope 2x / 4x while scoped |
| R | Reload (an empty magazine reloads by itself) |
| N | Next radio station (in a vehicle) |
| H | Horn (siren in a cruiser) |
| M | The map page: MAP (zoom, pan, click to set a waypoint), MISSIONS (abort, retry, replay), STATS, STRANDS (subscriber tier, strand progress, memo count), REPLAY |
| + / - | Zoom the map; camera zoom |
| V | Camera mode: chase, close, first person |
| Esc or P | Pause: resume, save, load, map, settings, controls, mute, restart, quit |
| Backspace / Esc | Back out of a menu; Backspace on the missions tab abandons a mission |

Gamepad (standard layout, plugged in before or during play; the prompts switch to
pad glyphs):

| Button | On foot | In a car | In menus |
|---|---|---|---|
| Left stick | Move | Steer | Navigate |
| Right stick | Look | Look | Zoom the map |
| A | Jump | Handbrake | Confirm |
| B | Sprint | Horn | Cancel |
| X | Reload | Radio | Secondary (abort, delete) |
| Y | Enter a vehicle | Exit | Next tab |
| LB / RB | Previous / next weapon | Previous / next weapon | Pages |
| LT | Aim | Aim (drive-by) | Zoom out |
| RT | Fire | Fire (drive-by) | Zoom in |
| L3 | Camera mode | Camera mode | |
| R3 (tap / hold) | Lock-on target / weapon wheel | | |
| D-pad | Quick slots: best pistol, rifle, thrown, melee | | Navigate |
| Back | Map | Map | |
| Start | Pause | Pause | Pause |

Debate minigame: W/A/S/D (or arrows) play SOURCE?, LOUDER, PIVOT and DEFINE
TERMS against the opponent's FACT, FEELING, GOTCHA and ANECDOTE cards; E or
Space is WHATABOUT; hold Shift to SHOUT. Ratio war: E or Space posts when the
meter is in the green, Ctrl or click fires the one HOTTAKE.

Touch: a virtual stick on the left, look on the right, buttons for fire, aim,
jump, enter, weapon (tap to cycle, long press for the wheel), reload, map and
pause; in a car horn, radio, brake, exit, camera and aim. The map page takes
one-finger drag, tap and two-finger pinch.

## Playing it

Blue lights at landmark doors are story missions; walk into one. Yellow lights
are the current objective, the HUD arrow points at it and the map's waypoint
draws a route. Green lights beside the three Both Sides Arms shops open the
shop (weapons, ammo, gear and, at the flagship, a target range); a mission
unlocks each weapon for sale. Garages (Gus's Garage on campus, Detail &
Evidence on the Strip) respray a car and clear wanted stars for $100 a star.
Stop in a taxi and press E for a Loud Cab shift, in a cruiser for an HOA
Patrol; the Nap Dynasty van at the depot starts Sponsor Runs; pink bubbles are
Ratio Rampages, chequered flags the Loop Races' start lines, striped wedges the
stunt jumps, envelopes the Monday Memos. Everything pays subscribers; the tiers
(A Voice, Verified-ish, Main Character, Pundit-Industrial, The Memo) unlock
perks from cheaper resprays to plot armor.

WASTED reads RATIO'D (the hospital, minus 10% cash), BUSTED reads DEPLATFORMED
(the precinct, a $500 fine), a failed mission reads CONTEXT STAMPED and offers
RETRY from the last checkpoint.

## Tests

Playwright drives the page in headless Chromium through SwiftShader (WebGL in
software), so every run is slow but real: the tests render frames, take
screenshots into `tests/out/` and assert on the simulation.

```
cd grand-theft-pundit
NODE_PATH=/opt/node-tools/node_modules node tests/all.js          # everything, about fifteen minutes
NODE_PATH=/opt/node-tools/node_modules node tests/<file>.js       # one file
node tests/content_audit.js                                       # the content-rules scan, no browser
```

Test files: `smoke` (boot, walk, pause, save), `world` (the generated city
against the GDD), `render` (free-camera screenshots, the quality presets, the
weather), `actors` (player, camera, vehicles, physics), `ai` (spawner, traffic,
crosswalks, police, bust), `combat` (the twelve weapons, magazines, aim, the
scope, the wheel, pickups, death), `missions` (every objective type, the first
two missions), `cutscenes` (the cutscene player and the hints), `strands` (one
cycle of each side strand), `saves` (the three slots, autosave, migration),
`campaign` (a new game played through the opening, all twenty-five missions
with their cutscenes, both endings, every strand and a shop purchase on real
inputs), `feel` (the Loop at full speed, pay-and-spray, death, bust, save and
Continue), `tune` (heat fairness, knock-over props, drive-by, the shootable
helicopter, the aim camera), `ui` (title, slots, settings, HUD, dialogue, the
map, shop, wheel, scope, both minigames, touch), `audio`, `perf`, `artifact`
(the single-file build boots) and `content_audit`.

## Code map

`index.html` loads `vendor/three.min.js` and then the `js/` files in order; all
game code lives on one global, `window.GTP`. `ARCHITECTURE.md` is the binding
engine contract and documents every module's surface. `GDD.md` is the base
content truth (city, cast, missions, minigames, radio) and `GDD_EXPANSION.md`
the expansion's (the new districts, the arsenal, the eight new missions, the
cutscenes, the strands, the front end). `CONTENT_RULES.md` governs every
string and texture in the project; the content audit enforces its banned-term
list.

## A parody

Grievance City, its two time zones and everyone in it are invented. Every
character is an original parody archetype of a role in the pundit-industrial
complex; no real person, company, show, nation, agency or event is referenced,
and the rules that keep it that way are in `CONTENT_RULES.md`. The protagonist
is the butt of the joke. Minds changed: zero.

## Credits

Built on [three.js](https://threejs.org) r152, MIT licensed; the license text is
in `vendor/THREE_LICENSE`. Everything else in the repository is original and
generated at runtime.
