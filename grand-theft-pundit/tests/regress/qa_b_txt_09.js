#!/usr/bin/env node
/* QA-B-TXT-09: British and American spellings are mixed in player-visible text.
 * The game is written in American English (ARMOR on the HUD, "neighborhood" in m11_trustless, Manifest
 * Harbor, "color" everywhere in the UI), but some visible lines use British forms: Gus's "The neighbours
 * called it in" (m03b_range), Dr. Footnote's "two hundred metres" (m12b_scope), the HOA chip
 * "UNAPPROVED COLOUR", the memo "the centre of the hedge", the weapon-card flavor and pitch texts
 * ("sixty metres", "two hundred metres"), the loading tip "200 metres" and the map button "CENTRE ON ME".
 * This test scans the visible content fields (dialogue, memo lines, loading tips, hints, weapon flavor,
 * shop pitches, HOA violations, subscriber perks) and js/11_ui.js string literals.
 * Run: node tests/regress/qa_b_txt_09.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./_qa_b_load');
const C = L.content();
const X = C.expansion;
const BRIT = /\b(neighbour\w*|metres?|colours?|centres?|labelled|favour\w*|honour\w*|armour\w*|harbour\w*|travelled|cancelled|programme)\b/i;
const fields = [];
for (const l of L.dialogueLines(C)) fields.push([l.src, l.text]);
(X.strands.memos || []).forEach((m) => fields.push(['memo ' + m.id, m.line]));
(X.loadingTips || []).forEach((t, i) => fields.push(['loadingTips[' + i + ']', t]));
(X.hints || []).forEach((h) => fields.push(['hint ' + h.id, h.text]));
for (const id in X.weapons) fields.push(['weapons.' + id + '.flavor', X.weapons[id].flavor]);
(X.shop.items || []).forEach((it) => fields.push(['shop pitch ' + it.id, it.pitch]));
(X.strands.hoa_patrol.violations || []).forEach((v) => fields.push(['hoa violation', v]));
(X.subscriberTiers || []).forEach((t) => fields.push(['tier ' + t.name, t.perkText]));
const problems = [];
for (const [where, t] of fields) { const m = BRIT.exec(t || ''); if (m) problems.push(where + ': "' + m[0] + '" in "' + t + '"'); }
// UI string literals (not comments, not ids like 'map-centre')
const ui = fs.readFileSync(path.join(L.ROOT, 'js', '11_ui.js'), 'utf8').split('\n');
ui.forEach((line, i) => {
  const code = line.replace(/\/\/.*$/, '');
  const re = /'([^'\\]*(?:\\.[^'\\]*)*)'/g; let m;
  while ((m = re.exec(code))) { const s = m[1]; if (/[a-z]-[a-z]/.test(s) && !/ /.test(s)) continue; const b = BRIT.exec(s); if (b && /[A-Z ]/.test(s)) problems.push('js/11_ui.js:' + (i + 1) + ': "' + s + '"'); }
});
L.report('QA-B-TXT-09', problems, 'player-visible text uses American spelling throughout');
