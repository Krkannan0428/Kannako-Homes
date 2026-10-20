#!/usr/bin/env node
/* QA-B-TXT-03: m01_van "Loud & Correct" outro counts six subscribers after the player collected five.
 * GDD_EXPANSION §3.4 retuned the subscriber pickups from 6 to 5 (the HUD reads "Collect 5 subscribers
 * before the battery dies"), but the outro still says "Six subscribers. Five of them are the same guy."
 * and Bryce answers "Respectfully, it's six numbers." This test reads the pickup count from the mission
 * data and fails while any m01_van outro line names a different count (and checks the Archive
 * opponent's replay of the clip, which quotes the same line).
 * Run: node tests/regress/qa_b_txt_03.js
 */
'use strict';
const L = require('./qa_b_lib_load');
const C = L.content();
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const m = C.missions.find((x) => x.id === 'm01_van');
const tw = m.objectives.find((o) => o.type === 'timer_wrap');
const count = tw.objectives[0].spawn.count;
const want = WORDS[count];
const problems = [];
const lines = m.outro.map((l, i) => ['m01_van.outro[' + i + ']', l.text]);
const arch = C.ratio && C.ratio.opponents && C.ratio.opponents.takesworth_archive;
if (arch) arch.replies.forEach((r, i) => { if (/numbers/.test(r)) lines.push(['ratio.takesworth_archive.replies[' + i + ']', r]); });
for (const [src, t] of lines) {
  const re = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(subscribers|numbers)\b/ig;
  let mm;
  while ((mm = re.exec(t))) if (mm[1].toLowerCase() !== want) problems.push(src + ': says "' + mm[0] + '" but the mission collects ' + count + ' (' + want + '): "' + t + '"');
}
L.report('QA-B-TXT-03', problems, 'the m01_van outro counts ' + count + ' subscribers, matching the pickups');
