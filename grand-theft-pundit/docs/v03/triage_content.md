# Content triage of the v0.3 QA findings (integration round 1)

Sources: `docs/v03/qa_a.json`, `qa_b.json`, `qa_c.json`, `qa_d.json`, triaged by the content track against the merged
build `65dc2b7`. The QA passes ran on `3a5252c`, where `js/25_content_parity.js` was still a stub, so no finding
assumes a different `GTP.Content.parity` shape. Every content, tone, text, story-data and economy finding is listed
here. Status: **fixed** (in 25_, with a guard in `tests/content_parity.js` where it is worth one), **owner** (another
track's file; the fix is spelled out), or **note** (no data change needed).

## Fixed in `js/25_content_parity.js`

| id | sev | finding | fix | guard |
|---|---|---|---|---|
| QA-B-TXT-01 | med | The two-line dialogue box drops the start of lines over ~114 chars | Trimmed every 25_ line over 114 chars (h01, m01c, b01, b03, b06, the m03b retune). The real fix is a taller or paged box in 11_ui | every intro, outro, dialogue and call line is 114 chars or less |
| QA-B-TXT-02 | med | Literal `*asterisks*` in Vaultwright's whispers | Removed from every 25_ line (h03 x2, the m05/m05b calls, the m05 retune) | no `*` in any 25_ line |
| QA-B-TXT-03 | med | m01_van's outro counts six subscribers after the retune made it five | `retune.m01_van` outro 0 and 1, from-guarded (24_'s takesworth_archive clip "six numbers" at 22:691 is the 22 owner's) | m01_van outro starts "Five subscribers" |
| QA-B-TXT-10 | low | British and American spellings mixed | meters, contextualized, recognize, color, gray, curb | a walk over every parity string rejects colour/metres/centre/-ise/grey/neighbour/kerb |
| QA-B-TXT-12 | low | Warbanner's lines must end on the jets | the m08 and m08b calls and the b03 dialogue end "And that's why we need the jets." | - |
| QA-B-NP-07 | low | The opening repeats "4B / not carrying / Respectfully, Gus"; the m00 call made it three times | `calls.m00_intro` rewritten ("Follow the blue light. Bring both hands.") | - |
| QA-B-HUD-01/02 | med/low | Text names keyboard keys that pads and touch don't have | the jobs' start lines, loading tips 1-2 and the m01c range lesson name actions (Aim, Fire, Cover), not keys | - |
| QA-B-NP-01 | med | Every timer reads CODE EXPIRES IN | The three h03 timers carry `label: 'SEGMENT ENDS IN'`, used once 09/11 read `timer.label` (owner: 09/11) | - |
| QA-B-TXT-04 | med | Fail card prints raw class ids ("The suv is gone.") | the heist spawns carry `name: 'the news van' / 'the hedge truck' / 'the drill van'`, used once 09's failText reads `spawn.name` (owner: 09) | - |

## Found while playing the new missions on the merged build (not in the QA files)

| finding | fix |
|---|---|
| **m01c deadlock**: the shop locks ammo behind the weapon's unlock mission. With the pistol unlocked by m01c, m01c's last objective (buy pistol rounds) returned `locked` | pistol `unlock: m01_van`. Test: a mission's `buy ammo_X` must be unlocked by an earlier chain mission |
| **The new missions dropped out of the story**: 09's `storyMission()` treats `expansion.missions` entries outside `expansion.chain` as side missions, and `register()` puts them there | `story: true` on all ten (tested live: `Story.order()` has all ten) |
| **Boss fights failed or timed out**: the bosses track spawns each fight at its own arena and fails it after 10 s farther than 150 m away. b01's approach went to Goldplate Tower, b06's to the stadium | every boss approach is `goto GTP.Bosses.arenaTarget(id)` (literal fallback); b01's marker moves to the stadium, b06's to the plaza set (tested live: the target equals the arena centre) |
| **Heist approaches were never read**: 09's `GTP.Heist` reads `parity.heist {missions, approaches:[{id,name,hostiles,payout,wanted,line}], crew:[{id,name,cut,perk}]}` and approach-tagged objectives | `parity.heist` is built from `heists.hedge_job`; h02/h03 carry all three approaches' lists, tagged; h03's reward is the take (09 pays reward x payout x (1 - cuts)) |
| Chapter titles would print "ACT I: Act I: ..." and the interlude would rename act 3 | `chapters` are the three acts with bare titles and `from`; the interlude and finale moved to `interludes` |

## Owner: other tracks (not changed by me)

| id | sev | finding | owner | fix |
|---|---|---|---|---|
| QA-B-TXT-01 | med | m09b intro.2 (177 chars), m12b intro.0 (154) | 11_ui box; 24 text | page or grow the box; or shorten the lines |
| QA-B-TXT-02 | med | asterisks in m05b intro.0 / outro.0 and cs_act2 | 24 | drop the asterisks ("I'm whispering: attributed.") |
| QA-B-TXT-03 | med | the takesworth_archive ratio clip still says "six numbers. (clip)" | 22 (22:691) | "five numbers" |
| QA-B-TXT-05 | med | Merle's table-leg pitch quotes the pistol price | 24 shop.items | "One fifty. For a journalist, one twenty. One fifty." |
| QA-B-TXT-05 | - | 24's shop item has `pistol unlock: 'm03b_range'`; parity says m01_van (Combat takes parity's value at load) | 24 | align or drop the 24 value |
| QA-B-TXT-07 | low | "Goldplate The Yell Network"; uptown landmarks get renamed | 11_ui | strip the leading "The ", skip uptown |
| QA-B-TXT-08 | low | Merle missing from the credits | 21/24 cast | push `merle` into `Content.castIds` |
| QA-B-TXT-09 | low | rr_02/sj_03 and rr_08/sj_10 share names | 24 strands | rename the rampages |
| QA-B-TXT-10 | low | "neighbours" (m03b), "metres" (m12b outro), shop pitches, tips, memos | 24, 09, 11 | American spelling |
| QA-B-TXT-11 | low | "WAIL 101" may be a real call sign | 23 radio | rename the station label; 25_ only uses the id |
| QA-B-TXT-12 | low | m01b outro lacks Kip's closer; m07b outro line is not a toast | 24 | as in the QA hint |
| QA-B-TXT-13 | low | "Here's a hottake" (id as a word) | 22 | already gone from the merged source |
| QA-B-TXT-14 | low | "1 missions"; tip "holds them ... hold it" | 11_ui; 24 tips | pluralize; "A hot mic goes off. Everyone holds it. Don't hold it." |
| QA-B-TXT-15 | low | gaps in the audit's term list | tests (QA) | add the terms and the call-sign rule |
| QA-B-TXT-06 | med | death card says $500; the fine is $800 or capped | 11_ui | print `AI.bustFine(level, money)` |
| QA-B-NP-02 / HUD-06 | high/med | the home and shop icons cover mission markers (pod_garage, both_sides_strip) | 09 marker order / 11 draw order | draw story markers last. h01-h03 (pod_garage) and m01c (both_sides_strip) are affected; the givers stand there, so the markers stay |
| QA-B-NP-04 / NP-06 | med/low | no enter-vehicle key hint at m01; h_arrow describes the HUD wrong | 09/12 hints; 24 hints | as in the QA hints |
| QAC-38 | low | `protesters: N` in an intro shows one ped (actors keyed by castId) | 12_cutscenes | key actors by index; 25_'s b06 intro uses `protesters: 6` |
| QA-A-GEO-04 | med | Goldplate Links props stand in the Clubhouse Drive lanes | 04_world | snap golf props and the 25_ golf tee/pin points to lawn (holes 3, 5, 6 sit near the road tiles) |
| QA-A-GEO-01 | high | memo_press lot is built over a road | 04/20 world | h02's loud variant spawns the hedge truck there; check it once the lot moves |
| QA-A-GEO-06 | low | the ferry pier has no district | 20 world | extend the port rect |

## Notes (runtime findings touching 25_ data, no data change)

- QAC-03 / SAVE-11 (09): abort, fail or save keeps `equip` weapons. m01c's `equip pistol` and the loud h02's
  `equip hotmic` can be farmed until 09 rolls equips back on teardown.
- QAC-14 (09): an abort during `escape_wanted` keeps the stars (b01, b03, b04, h02, h03 use it).
- SAVE-04 (30): autosave runs before the act cutscene; check the chapter cards fire after it once fixed.
- SAVE-17 (30): a migrated save gets 0 subscribers. 25_ rewards feed that formula; h03's reward is now 9,000 (the take).
- QA-STR-16 (economy): the ten new missions add 25,050 in listed rewards (subscribers use the listed reward), so the
  story-only subscriber total is further past tier 3. Tune `subsPerReward` (09) or the tiers (24).
