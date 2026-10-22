# Triage: QA findings that touch the systems track

Sources read: `docs/v03/qa_r1_bugs.json` (48), `qa_a.json`, `qa_b.json`, `qa_c.json`, `qa_d.json` and their `.md` summaries,
searched for `14_systems`, `GTP.Systems`, golf, stocks, properties, achievements, cheats, the two jobs, clothing and barber.

**Result: no QA finding points at `js/14_systems.js`.** It was a stub when round 1 ran, and the later QA sessions did
not test it. The keyword search returned three false positives:

| Finding | Why it is not mine |
|---|---|
| QA-B-TXT-15 (low) | The content audit's banned-term list (`tests/content_audit.js`, owner: the audit maintainer). |
| QAC-50 (low) | WebGL context loss in `Render.init` (environment track). |
| pers-QA-SAVE-09 (low) | `30_game.js` loadSlot validation (story track). The systems save entries ignore anything that is not an object, so a bad slot cannot break `GTP.Systems`. |

Found while integrating (fixed in my file, see docs/v03/systems.md "Integration round 1"):
- With the real parity data, golf tee and pin points were read as absolute coordinates instead of metres from the course door.
- Parity hazards are names, not circles.
- Several holes put a pin on a street tile, which would make the hole unplayable.
- Cheat effects, job schema, achievement `trigger`s, clothing `style`/`color`, and the stock fee as a fraction did not match.
- The UI's reason name `funds` and call names (`hud`, `get`, `owns`, `buyClothing`, `buyHaircut`, `stats().sections`) were missing.
- Unowned safehouse interiors could be entered (and slept in to save).
- After a shot the camera glided for seconds from the old spot to the golfer.

For other tracks (evidence in docs/v03/systems.md "Seen in other tracks"):
- `js/11_ui.js` `wardrobeCats('barber')` turns every array in `parity.barber` into a category: `stores` and `barks` appear next to
  `styles` and `colors`. Picking a store or a bark sets `look.hair` to that string.
- `applyItemToLook` reads `it.style`, but parity barber styles carry `it.hair`. After a haircut the UI therefore overwrites
  the look my `barber.buy` applied (`hair: 'mohawk'`) with the item id (`hair: 'cut_mohawk'`), which `pedParts` does not know.
  Fix in the UI: `it.hair || it.style`, and only `styles` / `colors` as barber categories.
- Typing a cheat code that contains P pauses the game (P is the pause key). The code still registers, because the listener
  runs in `paused` too.
