# v0.3 interiors track (`js/13_interiors.js`)

Branch `v03/interiors`. Owns `js/13_interiors.js` and `tests/interiors.js`. No other file was edited.

## What was built

Walk-in rooms built from primitives at x ≈ -4000 (far west of the 896 m map), one slot per template
(`armory` z 0, `clothing` z 160, `barber` z 320, `safehouse` z 480; each branch of a template gets its own
copy 120 m further west). The player is teleported in behind a fade and back out to the door. Rooms are
built lazily on first entry and kept; the room group is in the scene only while the player is inside.

- **Armory: Both Sides Arms** (same template at all three branches, branch decor by landmark id):
  - `both_sides_strip`: dark slate walls, green neon, tiled floor. `both_sides_port`: blue-grey walls, orange
    accents, rocket crates, "ROCKETS: BUY 2, GET A RECEIPT". `both_sides_uptown`: walnut panelling, a red
    carpet runner, brass pendant lamps, "THE SAME GUNS, IN WALNUT".
  - Three walls of racks holding real weapon meshes (`GTP.Assets.weaponMesh(id)`, scaled 1.2 to 1.35, on pegs
    with price tags): a pegboard of handguns, SMGs and throwables on the west wall (21 slots), rifles and
    shotguns on the east wall (12), the priciest long guns behind the counter (12), and handguns lying in two
    glass display islands. Every slot is filled: a stock smaller than the walls repeats down the rows; a
    larger one (the parity table's 32+ weapons) hangs once each and the overflow goes into the islands.
    Category signs (HANDGUNS, RIFLES & SHOTGUNS, AMMO), ammo boxes on the cabinets, the Firmness Vest on a
    mannequin (browsable gear), Clarity Pellets on the counter, posters, security cameras, the shop sign.
  - A long glass display counter with lit felt; **Merle Firmness** (`GTP.Content.cast.merle`) stands behind it
    as a persistent `GTP.Ped` (mission-mode AI so the AI tick leaves him alone), turns to face the player,
    greets with the shop's door barks and reacts to sales, refusals and range results.
  - **Browse mode**: the item under the camera's centre ray (within 4.6 m of the player; fallback: the nearest
    item within 2.4 m in front of the player) gets a floating card: name, price / OWNED / LOCKED: mission,
    `[E] INSPECT`. Pressing action emits `armory:inspect`. When the UI has no armory card yet (see
    "Consumed"), the card turns into the **in-world buy prompt**: a second press within 5 s buys
    (`GTP.Combat.buy` when it exists, else `GTP.Combat.shop.buy`). An owned weapon offers its ammo box
    instead; ammo is never offered for a weapon the player does not own (QA CMB-02's trap).
  - **Counter**: action at the counter opens the full shop (`GTP.UI.openArmory` when the UI track adds it, else
    the v0.2 page through `GTP.Combat.shop.open(landmark)`, which emits `shop:open`, so the existing `shop`
    objective and tests keep working).
  - No shooting in the store: player shots are refused outside the range (Merle: "Muzzle down. This is a store.").
- **Shooting range** (back room through the RANGE door): a shooting line with three booths, acoustic foam,
  lane lines and distance marks, a berm, bright lights downrange, a scoreboard hung over the line (time, score,
  medal so far, hits / shots, best). Nine pop-up cardboard hecklers (three lanes, three depths) and two movers
  on rails; 14% of pop-ups are the MODERATOR (don't shoot: -10). Stand on the green box for 0.6 s: 3 s
  countdown, then 60 s; targets rise faster and live shorter as the round goes on. Head 10, body 5, legs 2.
  Medals: bronze 60, silver 140, gold 220; the first medal of each tier pays a loyalty bonus ($50 / $150 /
  $400). Leaving the range room ends the round (aborted, no medal); another round needs stepping off the line
  and back on. Range rounds are free: the inventory is
  snapshotted at the start (the current gun, else the best owned hitscan gun, else a loaner pistol, topped up
  to 400 rounds) and restored exactly at the end. A save made mid-round stores the owned inventory, never the
  free rounds; a load or New Game mid-round drops the snapshot unapplied, so the loaded inventory wins. Hits are scored by a ray through the crosshair while aiming
  (`Render.camera`), else from the chest along the facing with a 7° assist onto standing targets (the targets
  are not entities, so Combat's lock-on cannot find them). Targets also block bullets and the camera through
  the `raycastBuildings` wrapper, so Combat's own impact puffs land on them.
- **Lanyard & Co.** (clothing): racks of shirts on rails, folded shelves, two mannequins, mirrors, two changing
  booths with curtains, a till and an associate. Booth / till: `clothing:open`.
- **The Clip Joint** (barber): checker floor, two red chairs facing mirrors with bulbs, a barber pole, a bench,
  a style poster, the barber. Chair: `barber:open`.
- **Safehouse** (decor per id: `safe_brownstone` brick, `safe_marina_loft`, `safe_suburb`, `safe_penthouse`,
  anything else a default): bed (sleep: +6 h when no mission is running, full health, save), wardrobe
  (`clothing:open {wardrobe:true}`), sofa, TV showing LOUD & CORRECT, rug, desk with the podcast mic, a window
  on a day or night skyline.
- **Fallbacks while the systems / UI tracks are missing**: the booth and wardrobe cycle six invented outfits
  (shirt / pants / tie), the barber chair cycles the eight hair styles `pedParts` knows ($25), and the player
  mesh is rebuilt (`GTP.Render.rebuildEntityMesh` when it exists, else `Render.detach` + `attach`).
- **Indoor lighting**: each room has emissive ceiling light panels, at most six point lights (nearby lights
  merge) and a hemisphere fill; while
  inside, the sun, sky hemisphere and moonlight fill are switched off, the fog pushed out, and the scene
  environment map swapped for a small indoor one, rain and puddles hidden, so rooms look the same at noon and at midnight. Vertex
  colours are converted sRGB → linear so dark counters stay dark.
- **Doors** (until the world track's markers land): every landmark whose kind is `gunshop` / `clothing` /
  `barber` / `safehouse` (or id `both_sides_*`, `lanyard*`, `*barber*` / `clip_joint*`, `safe_*`) gets a walk-in
  point on its facade straight in from `landmark.door` (the door marker itself is out on the sidewalk) with a
  small "▼ WALK IN" sprite. Walking into the facade there (within 1.9 m, facing it, pushing) for 0.2 s enters;
  refused with a toast while wanted. Inside, walking into the entrance door (or action at it) leaves; the
  player comes back out 1.2 m in front of the facade facing the street. The green v0.2 shop light beside the
  door still opens the shop page directly (other tracks' tests rely on it).

## Interfaces exposed

```js
GTP.Interiors.enter(id, opts) -> bool   // id: 'armory' | 'clothing' | 'barber' | 'safehouse', a landmark id ('both_sides_port',
                                        // 'safe_penthouse'), a landmark kind ('gunshop', 'clothing', 'barber', 'safehouse') or a
                                        // landmark object. opts: {landmark (id or object), store, branch, door:{x, z, y, yaw}
                                        // (where exit() puts the player), instant (no fade, for tests), force (enter from a car)}
                                        // false when already inside / mid-fade, the player is dead or in a vehicle, or id is unknown
GTP.Interiors.exit(opts) -> bool        // back to the door; {instant}
GTP.Interiors.active                    // true while inside (false during the fade out)
GTP.Interiors.current                   // {id, kind, store, branch, landmark, room} | null; id = kind = the template
GTP.Interiors.autoDoors                 // set false to stop this file's own door triggers (also off when GTP.World.doors or
                                        // GTP.World.doorMarkers exists: the world track's markers then call enter())
GTP.Interiors.range                     // {running, t, score, hits, shots, best, last:{score, medal, aborted}}
GTP.Interiors.MEDALS, medalFor(score)   // {bronze:60, silver:140, gold:220}
GTP.Interiors.update(dt)                // the tick (called from the wrapped Combat.update)
GTP.Interiors.serialize() / deserialize(d)   // {rangeBest, medals:{bronze, silver, gold}}
GTP.Interiors.roomAt(x, z), room(), rooms(), stock(storeId), state, templates
GTP.Interiors.debug = { build, items, targets, interactables, prompt, browse, startRange, endRange, raiseAll, doors }
```

Events emitted (payloads):

| Event | Payload |
|---|---|
| `interior:fade` | `{phase:'out'\|'in', id}` |
| `interior:enter` | `{id, kind, store, branch, landmark}` (`id === kind === 'armory'` etc., `store` = landmark id or null) |
| `interior:exit` | `{id, kind, store, quiet?}` (`quiet` when the player left another way: respawn, load, teleport) |
| `armory:inspect` | `{weaponId, itemId, name, price, owned, locked, store}` (gear: `weaponId: null`, `itemId: 'firmness_vest'`) |
| `armory:buy` | `{itemId, weaponId, ok, reason}` (the in-world prompt's purchase; Combat emits `shop:buy` itself) |
| `range:start` | `{store, weapon, seconds:60}` |
| `range:hit` | `{points, zone:'head'\|'body'\|'legs'\|'moderator', score, moderator}` |
| `range:end` | `{score, medal:'gold'\|'silver'\|'bronze'\|null, hits, shots, best, aborted, bonus}` |
| `clothing:open` | `{store, wardrobe, booth}` |
| `barber:open` | `{store}` |
| `safehouse:sleep` | `{store, saved}` |
| `interior:prompt` | `{text}` (the floating card's text, for a HUD that wants to mirror it) |
| `interior:line` | `{who, text}` (Merle and the staff speaking; also shown as their bark bubble) |

Save: `GTP.SaveRegistry.interiors = {get, set}` (created with `||` if the story track has not made the
registry yet) and a `GTP.SaveHooks` entry `interiors` (writes `data.interiors`; when a save is made inside a
room, `data.x/z/y/yaw` are replaced by the door outside so a load never lands in the far-west room).

## Interfaces consumed (all feature-detected)

- `GTP.Combat.catalog(storeId)` and `GTP.Combat.buy(itemId, {store, source:'armory'})` (shooting track); else
  `GTP.Combat.shop.items(tab)` / `shop.buy(id)` / `shop.open(landmark)` (v0.2). Stock order: catalog weapons,
  v0.2 shop weapons, `GTP.Content.parity.weapons`, then `Combat.ORDER`; sorted by price.
- `GTP.Assets.weaponMesh(id)` and `GTP.Assets.weaponFit[id]` (length, upright); an id without a mesh borrows
  the mesh of its parity `class` (pistol, smg, rifle, shotgun, sniper, heavy, melee, thrown...).
- UI: `GTP.UI.openArmory({store, landmark, counter})`, or any of `GTP.UI.armoryCard / armory / handlesArmory`
  (presence turns the in-world buy prompt off: the UI card handles `armory:inspect`), `GTP.UI.openClothing`,
  `GTP.UI.openBarber` (presence turns the outfit / haircut fallbacks off), `GTP.UI.interiorFade` (presence turns
  this file's DOM fade off; the UI then draws the fade from `interior:fade`), `GTP.UI.toast`, `GTP.UI.glyph`.
- `GTP.Systems.clothing` / `GTP.Systems.barber` (presence turns the fallbacks off).
- `GTP.Render.rebuildEntityMesh(entity)` (environment track), `GTP.Render.rig`, `camera`, `scene`, `fx.add`.
- `GTP.game.saveSlot / save`, `GTP.game.debug.teleport`, `GTP.Missions.state.active` (sleep skips the clock
  jump during a mission), `GTP.Content.cast.merle`, `GTP.Content.expansion.shop.barks`.

## Wrappers installed on other modules (at load time, idempotent)

| Wrapped | Why | Behaviour outside rooms |
|---|---|---|
| `GTP.World.heightAt` | floor at y 0 inside a room | unchanged (one `x < -3000` test) |
| `GTP.World.solidAt` | the room's walls, counters, racks; outside the room's bounds is solid | unchanged |
| `GTP.World.resolveCapsule` | push-out against the room's boxes, clamp to its bounds | unchanged |
| `GTP.World.raycastBuildings` | camera pull-in and bullets stop at walls, ceiling and standing range targets; returns `{t, point, normal, building, interior, target}` | unchanged |
| `GTP.World.tileAt` | `T.PLAZA` inside a room (never water / void, so peds don't swim and lobbed things don't pop) | unchanged |
| `GTP.World.districtAt` | the shop landmark's district for the HUD chip (else a copy of the first district named "Indoors") | unchanged |
| `GTP.Combat.fire` | refuse player shots in a room outside the range; score range shots | unchanged |
| `GTP.Combat.update` | runs `GTP.Interiors.update(dt)` after Combat each sim step (Game.step has no interiors hook) | unchanged |
| `GTP.Render.updateEnvironment` | re-applies the indoor light after every environment update while inside | unchanged |
| `GTP.Render.weather.frame` | hides the rain streaks and puddles while inside | unchanged |

Integration: fold the `Combat.update` hook into `Game.step` (after Combat), and the collision wrappers into
`04_world.js` if preferred (a `World.interior` hook checked first in each function).

## Decisions

- Rooms live at x ≈ -4000 so no city chunk, prop or AI tile is anywhere near; the AI spawner finds no tiles
  there and ambient peds and traffic despawn around the player while inside (the world track pauses the
  spawner as well per the plan). A car left at the door may despawn, as in GTA.
- Entering needs the player on foot, alive and not wanted. Missions keep running (the `interior` objective
  completes on `interior:enter`).
- The weapon is not holstered in the store; firing is refused instead.
- Range targets are this file's own meshes, not entities: no AI, no lock-on, no ped bookkeeping; the
  plan's `range:*` events carry everything the UI and the story's `range` objective need.
- Visual randomness (textures) uses its own `GTP.makeRng` stream; `GTP.rng` is never touched, so the game's
  deterministic sequence is unchanged by entering a room.

## QA round-1 bugs

No entry in `docs/v03/qa_r1_bugs.json` has a hint pointing at `js/13_interiors.js` (the file was a stub).
The armory's purchase path avoids CMB-02 (buying ammo grants the weapon): the in-world prompt only offers an
ammo box for a weapon the player already owns; the root cause in `08_combat.js` belongs to the shooting track.

## Tests

```
cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/interiors.js
```

Covers the API and wrappers, entering the Strip armory with the fade and events, room collision (walls,
floor, counter stops the player), the stocked racks (every Combat weapon present as a real mesh), Merle,
the HUD district, browse → `armory:inspect` → in-world purchase → ammo offer, no shooting in the store, the
range (start, a scoring hit, `range:end` with a medal field after 60 s, the inventory restored, best kept),
the counter opening the shop page, leaving through the door, walking into the Strip door from the street,
the port and uptown branches, clothing, barber, the safehouse bed save (stores the door, not the room), and
the armory lit at night. Screenshots in `tests/out/int_*.png` (armory player view, counter, both rack walls,
back wall, front, browse card, range from the line and downrange, the street after leaving, port, uptown,
night, clothing, barber, two safehouses).

## Review pass

An adversarial review of the module found 17 issues, all fixed with tests where worth guarding: the range
loan versus save / load / New Game, free rounds lost on the first shot when the gun was already owned, the
fade surviving a load or a death on the doorstep, E (which Player.control also sends to `Combat.fire`)
setting off Merle's "no shooting" line, the staff gate being jumpable, the back-wall racks out of browse
reach, allocations in the room collision and ray paths, the light count, rain falling indoors, targets frozen
after a round, the range restarting by itself, the range's third lane clipped by the room bounds, the range
record leaking into a New Game, and a forced entry from a car bringing the car inside.

## Known issues

- The minimap shows nothing inside a room (it draws the city around the player); the UI may want to draw an
  "INDOORS" panel while `GTP.Interiors.active`.
- Entering or leaving a room changes the scene's light count, so materials recompile once behind the fade
  (a short hitch while the screen is black).
- The camera is the normal chase rig; in the narrow range booths it pulls in close behind the player.
- Rack items are static copies: attachments / tints from `player.weaponMods` are not shown on the wall.
- The door triggers are this file's stand-in for the world track's markers; with both present, set
  `GTP.Interiors.autoDoors = false` (automatic when `World.doors` / `World.doorMarkers` exists).
- Clothing / barber fallbacks are free try-ons with a fixed list; the real catalogue and prices come with the
  systems and UI tracks.
