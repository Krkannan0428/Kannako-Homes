# Grand Theft Pundit

*Steal the Discourse.*

A third-person, 360-degree-movement open-city parody game in the GTA mold,
running in the browser and as a desktop app for macOS, Windows and Linux. You are
Bryce Takesworth, a folding-table campus pundit who climbs from Founders' Quad to
the cable chair through sponsor reads, donor galas, ratio wars, airport runs, a
container-yard ferry job, a three-part heist and errands for a spook agency that
officially repairs weather balloons.

What is in v0.3:

- **A story you play from the first minute:** 35 story missions in three acts
  (the 25 campaign missions, the armory tutorial, six boss fights and a
  three-part heist with a planning board), cutscenes with a hold-Enter skip,
  chapter cards and two endings. The GPS always points at the next story beat.
- **Ten "Strangers and Freaks" side strands:** 26 more missions with their own
  eccentrics. On top of those come the taxi, HOA patrol, sponsor runs, ratio
  rampages, 50 hidden memos, Loop races and ten stunt jumps.
- **Six boss fights with special attacks:** the gold helicopter, the silent
  yacht, the runway jets, the weather balloon, the folding-table brawl and the
  five-podium panel. Each has its own phases, weak points and telegraphed
  attacks. You get four specials (Focus, Shout, Chat Mob, Boost).
- **Shooting you can see:** the gun is in the character's hand, the shot leaves
  the barrel, and there is cover with peeking, a scope, attachments and a weapon
  wheel. The Both Sides Arms stores are walk-in armories: racks of the whole
  arsenal (over forty weapons), a counter, and a shooting range out back.
- **Everything with an engine:** cars, bikes, helicopters, a plane, a jet,
  boats, a jet ski and a parachute. Spin Doctor mod shops, owned garages and
  pay-and-spray complete the set.
- **The rest of the open world:**
  - eleven properties with daily income and safehouses
  - a stock market of eight tickers
  - nine holes of golf
  - two side jobs
  - clothing and barber shops
  - 26 achievements and 8 cheats
  - six radio stations with talk, ads and news that follows the story
- **Life-like graphics:** physically based materials, real-time shadows,
  bloom, ambient occlusion, reflections, weather and a day/night cycle. Four
  quality presets plus auto.
- **Saves:** three slots with autosave after every mission, and a CONTINUE on
  the title screen.

Grievance City is 896 m square, with eleven districts, a figure-eight elevated
highway, two bridges, an airport with a drivable runway and a working port. It
has traffic, pedestrians and a five-star police response. The whole game is
procedural: there are no image, model, font or audio files. Textures are drawn
on canvases, meshes are built from primitives, and sound is WebAudio synthesis.
The only dependency is three.js, vendored.

## Download and play

The desktop builds are on the repository's GitHub Releases page:

- the `.dmg` for a Mac, with Apple Silicon (`arm64`) and Intel (`x64`) builds
- the `-setup.exe` or the `-portable.exe` for Windows
- the `.AppImage` for Linux

`desktop/README.md` covers installing them, the first launch of an unsigned
build, where saves and the mods folder live, and how to build the installers
yourself.

## Editing the code

Everything is plain JavaScript with no build step. Edit a file in `js/`, then
reload `index.html` in a browser, or run the desktop app from source:

```
cd grand-theft-pundit/desktop
npm install
npm start        # copies the game into desktop/app and opens it in Electron
npm run dist:mac # builds the Mac .dmg files locally (dist:win, dist:linux too)
```

`ARCHITECTURE.md` documents every module, and `CONTENT_RULES.md` is binding for
every string. The tests below are the safety net. A push to the
`game/grand-theft-pundit` branch builds every platform on GitHub Actions. A
commit message with `[release]` also publishes the version in
`desktop/package.json` as a GitHub Release.

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
| Left stick | Move | Steer (x), throttle and brake (y) | Navigate, pan the map |
| Right stick | Look | Look | Zoom the map |
| A | Jump | Handbrake | Confirm; set a waypoint on the map |
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
draws a route. Green lights beside the three Both Sides Arms shops (Merle
Firmness minds the door of every one) open the shop (weapons, ammo, gear and,
at the flagship, a target range); a mission unlocks each weapon for sale. Garages (Gus's Garage on campus, Detail &
Evidence on the Strip) respray a car and clear wanted stars for $100 a star.
Stop in a taxi and press E for a Loud Cab shift, in a cruiser for an HOA
Patrol; the Nap Dynasty van at the depot starts Sponsor Runs; pink bubbles are
Ratio Rampages, chequered flags the Loop Races' start lines, striped wedges the
stunt jumps, envelopes the Monday Memos. Everything pays subscribers; the tiers
(A Voice, Verified-ish, Main Character, Pundit-Industrial, The Memo) unlock
perks from cheaper resprays to plot armor.

WASTED reads RATIO'D (the hospital, minus 10% cash), BUSTED reads DEPLATFORMED
(the precinct; a $500 fine, $800 at three stars and up, never more than 15% of
your cash; a cop needs two seconds at arm's reach and never catches you
mid-sprint), a failed mission reads CONTEXT STAMPED and offers RETRY from the
last checkpoint.

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
Continue), `feel2` (the expansion's feel pass: the opening cutscene, the runway
at speed, the port maze, uptown at night, a race, a rampage, the scope, a
rocket, the map with a waypoint), `tune` (heat fairness, knock-over props,
drive-by, the shootable helicopter, the aim camera), `ui` (title, slots,
settings, HUD, dialogue, the map, shop, wheel, scope, both minigames, touch),
`audio`, `perf` (the boot profile, simulation steps per second, draw calls per
quality preset), `artifact` (the single-file build boots) and `content_audit`.

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
