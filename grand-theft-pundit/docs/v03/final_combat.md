# v0.3.0 final round: combat (shooting + models + interiors)

Branch `v03r1/combat`. Detail, root causes and every proposal for other areas: `docs/v03/triage_combat.md`.

## Fixed

- **A visible gun in the hands.** On the new character models every held weapon sat 1-1.6 m off the hand: GTP.Anim moved
  the gun into the `handR` bone and Combat then wrote a root-space transform into the bone's frame (the empty hands in
  `combat_held_*.png`, the pistol floating over the car in `cover_peek.png`). Anim is now the gun's only writer on a models rig,
  Combat reads the hand targets back from the drawn gun, and the shot / tracer leaves the barrel the player sees (Combat's frame
  uses Anim's grip at scale 1). The rifle's stock no longer pokes out through the back while aiming. Guns render in their real
  dark gunmetal (the weapon kit's colours were not converted from sRGB).
- **Rifle grip** (`characters.js`): grip at chest height in `handR`, the left hand on the foregrip.
- **One arsenal**: the shooting and content tracks had invented overlapping weapons (two miniguns, two "Filibuster"s ...). On
  a94bf77 the content table uses the shooting ids: 36 weapons plus fists, every parity id present, no duplicates. Combat also
  maps the other generation of ids (11 aliases, saves migrate), copies the parity rows' engine fields (spin-up, stun, fuse,
  sticky, smoke, mobility), and has meshes for the ten weapons of the other table.
- **Weapon wheel**: an unowned slot shows its original weapon; slot 2 is "Specials".
- **Armory racks**: the whole arsenal once each, grouped by class (long guns on the east wall by row, heavy and specials on the
  feature wall behind Merle, melee on the west pegboard, handguns in the glass counter, thrown in the island cases); the counter
  and browse open the UI's armory card; the Port and Uptown stores keep their decor when entered through the world's doors.
- **The armory / m01c race**: the m01c start light and the armory door sat on the same spot; the door could teleport the player
  inside mid-intro, so m01c never handed out the free pistol. The door yields to a start light and the mission's "step inside"
  objective walks the player in.
- **Aiming indoors / at a wall** (QA-A-CAM-01): the aim camera no longer jumps in front of the player.
- **Enter a car with the real F key**: works (tap and hold); `tests/actors.js` section 11 drives the real key. The coordinator's
  "F does nothing" was the software-GL slow motion (the press registered; the door walk took 4.5 s of wall time).
- **Boss weak points**: spools always took hits; after the last spool the camera stayed pointed at the sky. A downed hard lock
  now hands over like a fresh aim press (b01 reaches phase 3; the rest is the bosses test's bot).
- **Scope shot, hip fire, shop unlocks, crash test**: see the triage file.
- **Wrappers folded**: the bosses' and interiors' hooks on `Combat.update` / `Combat.fire` are native now.
- **Back of the head**: the scalp no longer pokes through short hair.

## Still open

(filled in below)

## Test results

(filled in below)
