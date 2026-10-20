#!/usr/bin/env node
/* QA-B-TXT-01: a story dialogue line too long for the dialogue box loses its first line.
 * The dialogue box (js/11_ui.js drawDialogue) shows at most two wrapped lines and keeps the LAST two,
 * so a line that wraps to three (at 1280x720: 640 px of 17 px text, about 75 characters a line) has its
 * opening words scrolled away once it is typed. m09b_hotmic's intro line 3 (177 characters) shows as
 * "this. It's a [REDACTED] that was on the whole time...". Measured in Chromium, 154 characters still
 * fit in two lines and 177 do not, so this test caps a line at 150 characters (a little headroom for
 * wider fallback fonts). Ticker lines are exempt (they scroll on the ticker strip).
 * Run: node tests/regress/qa_b_txt_01.js
 */
'use strict';
const L = require('./_qa_b_load');
const MAX = 150;
const C = L.content();
const problems = [];
for (const l of L.dialogueLines(C)) {
  if (l.ticker) continue;
  const t = String(l.text || '');
  if (t.length > MAX) problems.push(l.src + ' (' + l.who + ', ' + t.length + ' chars > ' + MAX + '): "' + t + '"');
}
L.report('QA-B-TXT-01', problems, 'every story dialogue line fits the two-line dialogue box (<= ' + MAX + ' chars)');
