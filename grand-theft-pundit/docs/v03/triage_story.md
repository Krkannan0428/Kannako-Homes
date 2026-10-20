# Story integration triage (v03r1/story): work in progress

## Done so far
- `js/09_missions.js` `storyMission()` / `storyOrder()`: the content track pushes its parity missions into
  `expansion.missions`, and the old rule treated any expansion mission outside `expansion.chain` as a side mission, so
  `m01c_both_sides`, the six boss missions and the heist dropped out of the story (`Story.next()` was null after m01_van).
  The order now ranks by `parity.chain` (35 missions) when it is present, and parity missions always count as story.
- Chapter titles come from `parity.actTitles` / the first `parity.chapters` entry per act, with the "Act I: " prefix
  dropped because the UI card draws "ACT I" itself. Interlude entries no longer rename act 3.
- `tests/missions.js`, `tests/saves.js`: expectations updated for the 35-mission chain (m01c is the light after m01_van).

## Open (next session)
- newplayer.js baseline before these fixes: m01c, save and ten_min fail. m01c's first `goto` ("Walk up to the Both Sides
  Arms door", radius 40) never completes after the mission starts at the door: look at `H.goto` (09_missions.js ~781).
  The pause-menu save lands on page "phone". m01_van takes 263 s of the 600 s budget.
- story.js, campaign.js, strands.js, feel.js need re-runs and fixes; QA triage of 83 bugs not started yet.
