#!/usr/bin/env node
/* QA-B-TXT-02: Markdown emphasis asterisks show up literally in dialogue.
 * The dialogue box draws text verbatim (js/11_ui.js drawDialogue has no markup), so GDD-style
 * *emphasis* reaches the player as "I'm whispering *attributed*." (m05b_provenance intro and outro,
 * cs_act2). m05_peer already drops the asterisks from the same gag ("I'm whispering twelve thousand").
 * This test fails while any story dialogue line, memo line, loading tip, hint or shop pitch contains '*'.
 * Run: node tests/regress/qa_b_txt_02.js
 */
'use strict';
const L = require('./qa_b_lib_load');
const C = L.content();
const X = C.expansion || {};
const problems = [];
for (const l of L.dialogueLines(C)) if (/\*/.test(l.text || '')) problems.push(l.src + ' (' + l.who + '): "' + l.text + '"');
const extra = [];
((X.strands && X.strands.memos) || []).forEach((m) => extra.push(['memo ' + m.id, m.line]));
(X.loadingTips || []).forEach((t, i) => extra.push(['loadingTips[' + i + ']', t]));
(X.hints || []).forEach((h) => extra.push(['hint ' + h.id, h.text]));
((X.shop && X.shop.items) || []).forEach((it) => extra.push(['shop pitch ' + it.id, it.pitch]));
for (const [where, t] of extra) if (/\*/.test(t || '')) problems.push(where + ': "' + t + '"');
L.report('QA-B-TXT-02', problems, 'no literal markdown asterisks in player-visible lines');
