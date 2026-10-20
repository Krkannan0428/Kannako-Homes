# Grand Theft Pundit

*Steal the Discourse.*

A third-person, 360-degree-movement open-city parody game in the GTA III / Vice
City mold, running entirely in the browser. You are Bryce Takesworth, a
folding-table campus pundit who climbs from Founders' Quad to the cable chair
through sponsor reads, donor galas, ratio wars and errands for a spook agency
that officially repairs weather balloons. Seventeen missions, two endings, a
640 m square city with an elevated highway, traffic, pedestrians, a five-star
police response, two minigames (a debate and a ratio war) and four procedural
radio stations. Everything is content; everything is a joke about the
pundit-industrial complex.

The whole game is procedural: no image, model, font or audio files. Textures are
drawn on canvases, meshes are built from primitives, sound is WebAudio
synthesis. The only dependency is three.js, vendored.

## Running it

- Open `index.html` straight from disk (`file://` works), or
- serve the folder with any static server, e.g. `npx http-server .` and open
  the printed URL, or
- build the single-file version with `node build-artifact.js` and open
  `dist/artifact.html`.

Press Enter (or tap) on the title screen. `CONTINUE` appears once a save exists
(the pause menu's phone, `M`, has the map, missions and stats; the game saves
through `GTP.game.save()` and the title's Continue). Audio starts after the first
key press or click, as browsers require.

URL parameters for testing and debugging: `?seed=<int>` (city seed),
`?mission=<id>` (boot straight into a mission, `&intro=1` keeps its intro),
`?clock=<hour>`, `?low=1` (no shadows, shorter draw distance), `?mute=1`,
`?debug=1` (a stats line on the HUD), `?headless=1&skipTitle=1` (no animation
frame loop; tests step the simulation with `GTP.game.advance(seconds)`).

## Controls

| Key | Action |
|---|---|
| WASD / arrows | Move; steer in a vehicle |
| Shift | Run |
| Space | Jump on foot, handbrake in a vehicle |
| Q or right mouse (hold) | Aim with lock-on; also a drive-by from the driver's seat |
| E, left mouse or Ctrl | Action / fire (punch, shoot, megaphone, hot take) |
| F or Enter | Enter / exit a vehicle |
| Tab | Next lock-on target |
| Mouse wheel or `[` `]` | Cycle weapons |
| H | Horn (siren in a cruiser) |
| R | Next radio station (in a vehicle) |
| M | Phone: map, missions, stats, controls; Backspace on the missions tab abandons a mission |
| V | Camera mode: chase, close, first person |
| Esc or P | Pause |

Debate minigame: W/A/S/D (or arrows) play SOURCE?, LOUDER, PIVOT and DEFINE
TERMS against the opponent's FACT, FEELING, GOTCHA and ANECDOTE cards; E or
Space is WHATABOUT; hold Shift to SHOUT. Ratio war: E or Space posts when the
meter is in the green, Ctrl or click fires the one HOTTAKE.

Touch: a virtual stick on the left, look on the right, buttons for fire, aim,
jump, enter, weapon, map and pause. Gamepads are read when connected.

Blue lights at landmark doors are missions; walk into one. Yellow lights are the
current objective. Garages (Gus's Garage on campus, Detail & Evidence on the
Strip) respray a car and clear wanted stars for $100 a star. WASTED reads
RATIO'D (the hospital, minus 10% cash), BUSTED reads DEPLATFORMED (the precinct,
a $500 fine), a failed mission reads CONTEXT STAMPED.

## Tests

Playwright drives the page in headless Chromium through SwiftShader (WebGL in
software), so every run is slow but real: the tests render frames, take
screenshots into `tests/out/` and assert on the simulation.

```
cd grand-theft-pundit
NODE_PATH=/opt/node-tools/node_modules node tests/all.js          # everything, about eight minutes
NODE_PATH=/opt/node-tools/node_modules node tests/<file>.js       # one file
node tests/content_audit.js                                       # the content-rules scan, no browser
```

Test files: `smoke` (boot, walk, pause, save), `world` (the generated city
against the GDD), `render` (free-camera screenshots), `actors` (player,
camera, vehicles, physics), `ai` (spawner, traffic, crosswalks, police, bust),
`combat` (weapons, aim, pickups, death), `missions` (every objective type, the
first two missions), `campaign` (a new game played through all seventeen
missions and both endings on real inputs), `feel` (the Loop at full speed,
pay-and-spray, death, bust, save and Continue), `tune` (heat fairness,
knock-over props, drive-by, the shootable helicopter, the aim camera), `ui`
(title, HUD, dialogue, phone, both minigames, touch), `audio`, `perf`,
`artifact` (the single-file build boots) and `content_audit`.

## Code map

`index.html` loads `vendor/three.min.js` and then the `js/` files in order; all
game code lives on one global, `window.GTP`. `ARCHITECTURE.md` is the binding
engine contract and documents every module's surface. `GDD.md` is the single
source of content truth (city, cast, missions, minigames, radio).
`CONTENT_RULES.md` governs every string and texture in the project; the content
audit enforces its banned-term list.

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
