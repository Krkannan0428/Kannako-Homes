#!/usr/bin/env node
/* QA-B-TXT-08: two side activities share a name.
 * The Ratio Rampage rr_02 and the Stunt Jump sj_03 are both "Assembly Required" (both at Perpetual
 * Assembly Plaza), and the rampage rr_08 and the stunt sj_10 are both "Well, Actually" (both at Old Money
 * Common). The names show on the map marker titles, the STRANDS tab and the STUNT PUNDIT card, so two
 * different markers a few metres apart carry the same title.
 * This test fails while any rampage, race or stunt name is used twice across the strands.
 * Run: node tests/regress/qa_b_txt_08.js
 */
'use strict';
const L = require('./_qa_b_load');
const C = L.content();
const S = C.expansion.strands, seen = new Map();
for (const kind of ['rampages', 'races', 'stunts']) for (const d of S[kind] || []) {
  const k = String(d.name || '').toLowerCase();
  if (!seen.has(k)) seen.set(k, []);
  seen.get(k).push(kind + ':' + d.id);
}
const problems = [];
for (const [name, ids] of seen) if (ids.length > 1) problems.push('"' + name + '" names ' + ids.join(' and '));
L.report('QA-B-TXT-08', problems, 'every rampage, race and stunt has its own name');
