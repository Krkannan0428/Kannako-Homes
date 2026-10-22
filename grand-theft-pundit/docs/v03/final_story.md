# Story, saves and the new-player flow: final state for v0.3.0 (v03r1/story)

Details, the per-bug table and the patches other tracks still need: `docs/v03/triage_story.md`. API and wrapper notes:
`docs/v03/story.md`.

## Fixed
- **The v0.3 bar (`tests/newplayer.js`) passes, all twelve steps: 332 s of the 600 s budget on this branch at the latest base
  (9f7c65c). That base ran 665 s at first.** The pod van now spawns facing the road in an open bay, and the bot steers round
  the kerb tree and the parked bike on the GPS line out of the pod garage. A New Game from the title starts
  m00 by itself, the GPS line leads to the first objective, and m00, m01_van and m01c (the armory: Merle's free pistol, bronze on
  the range, rounds bought at the counter) are played from what the screen shows. Then the player holds a visible pistol in the
  armory, aims, takes cover and saves from the pause menu.
- The story is the 35-mission v0.3 chain: m01c, the six boss missions and the heist had dropped out of `GTP.Story.order()`.
- m01c could not be started or finished: its light now stands clear of a kerb lamp, the shop's door ring and the old store
  light. A goto counts a player who walked straight in. The range and the counter point the arrow at themselves. The ammo it asks
  for is for sale during the mission (`GTP.Missions.isUnlocked`).
- m01_van: subscribers on the roads, the pod van backed into a bay with a clear way out. The story GPS waits for the street after
  a mission that ends indoors.
- `tests/campaign.js` on 9f7c65c:
  - "m11_trustless paid 2500: money 28719 expected 29219": the $500 was a bust fine. m11's blast leaves one star, and a cop
    arrested the player while the driver stood waiting for the act cutscene. The driver now steps away from cops in those
    waits, and a bust after a mission's objectives fails by name.
  - The strands after the story: the driver skips the sponsor van that m13 now wrecks at the depot, and clears a stranger
    mission a teleport walked into. 09 lets a replaced strand wreck despawn.
- Hold Enter (or Space) skips a cutscene at any frame rate. The hold is timed from the key events in wall-clock time, and
  `tests/cutscenes.js` drives the real keys.
- 83 QA bugs with a hint in my files were re-verified: 50 fixed in this round, 25 already fixed, 8 partly or wholly another
  track's.
- Wrappers folded: 14's on `Missions.update`/`init`, 07's on `Strands.drivers.take`, 26's duplicate-giver cleanup, 09's `Events.on`/`off` listener count, and
  30's `Input` swap (replaced by `Input.latch`). There are opt-in hooks in 30 for the `Combat.update` wrappers and hook/registry
  double loads.

## Still open
- **World:** the pedestrian GPS line runs over the ramp by Dorm 4B (it costs a new player 90 s in m00). The car route from the pod
  garage runs through the car park and 0.7 m past a kerb tree at (81.3, 318).
- **Combat:** `unlocked()` should call `GTP.Missions.isUnlocked`; then 09's bridge goes.
- **UI:**
  - guard `meta` on unreadable slots;
  - the label overlaps on the HUD;
  - a faster typewriter for the opening;
  - the pad and touch cutscene skip;
  - pause in a minigame.
- **Audio:** `radio.force` for cutscene stations.
- **Content:** timer labels, hint text and glyphs, one cutscene camera.
- **Tests:**
  - `tests/world.js`: stop the car and heal between stunt jumps. It goes red on this branch only because a softer landing moves an
    existing death into sj_10's boarding.
  - `tests/audio.js`: flaky against the game's own phone and GPS cues.

## Test results (this branch at game/grand-theft-pundit 9f7c65c)
- 9f7c65c already contained this branch, so v03r1/story fast-forwarded to it and was pushed before the fixes above.
- My files: `missions`, `cutscenes`, `saves`, `campaign`, `story`, `strands`, `feel`, `smoke` and `newplayer` (332 s) all pass
  on it, as do `content_audit` (0 hits) and `artifact`.
- The rest of this section is from the a94bf77 round:
- The coordinator's four findings on a94bf77 (campaign's m05 unlock, newplayer, story's payout check, strands' race start) are
  fixed in the tests and pass on the merged build; strands.js now closes a property screen a for-sale marker can open under the
  player (the systems track's `disarmNear()` on `strand:end` is the game-side fix).
- Other tracks' failing files fail the same way on a clean base worktree, with two exceptions noted in triage_story.md:
  `audio.js` is flaky, and `world.js` is the stunt-test fragility above.
