#!/usr/bin/env node
/* QA-B-TXT-07: the credits roll leaves out Merle Firmness, who speaks in m03b_range and runs every shop.
 * js/11_ui.js credits() lists GTP.Content.castIds (the sixteen from 21_content_cast.js) plus the panel and
 * Wendell Syllabus; 24_content_expansion.js adds cast.merle but only to opponentIds, so the clerk with
 * five lines in "Aim Small, Yell Big" and a pitch on every weapon card is not credited.
 * This test fails while any character who speaks a story line is missing from the credited ids.
 * Run: node tests/regress/qa_b_txt_07.js
 */
'use strict';
const L = require('./_qa_b_load');
const C = L.content();
const credited = new Set((C.castIds || []).concat(['panel', 'freshman']));   // credits() names the panel and the freshman explicitly
const missing = new Map();
for (const l of L.dialogueLines(C)) {
  if (!l.who || l.ticker || credited.has(l.who)) continue;
  if (!missing.has(l.who)) missing.set(l.who, []);
  missing.get(l.who).push(l.src);
}
const problems = [];
for (const [who, srcs] of missing) problems.push(who + ' (' + ((C.cast[who] || {}).name || '?') + ') speaks in ' + srcs.length + ' line(s), e.g. ' + srcs.slice(0, 3).join(', ') + ', but is not in the credits');
L.report('QA-B-TXT-07', problems, 'every speaking character is in the credits');
