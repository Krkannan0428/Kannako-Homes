#!/usr/bin/env node
/* QA-B-TXT-07: the Goldplate renaming gag produces "Goldplate The Yell Network" and renames the club
 * whose whole joke is refusing Goldplate.
 * js/11_ui.js landmarkLabel() prefixes "Goldplate " (act 2: "Goldplate Goldplate ") to every landmark
 * once show_renamed is set, so the HUD district chip, the map labels and the phone's MISSIONS list read
 * "Goldplate The Yell Network", "Goldplate The Capitol", "Goldplate The Afterparty",
 * "Goldplate The Heirloom Club"; the Heirloom Club and the causeway's uptown end are the places that
 * say NO to Goldplate (GDD_EXPANSION §1.4, §8.1 "OLD MONEY SAYS NO TO CAUSEWAY NAME").
 * This test runs the real landmarkLabel source over every landmark with each act flag combination and
 * fails on a "Goldplate The ..." label or a renamed uptown landmark.
 * Run: node tests/regress/qa_b_txt_07.js
 */
'use strict';
const vm = require('vm');
const L = require('./qa_b_lib_load');
const C = L.content();
const src = L.fnSource('js/11_ui.js', 'landmarkLabel') + '\nthis.landmarkLabel = landmarkLabel;';
const problems = [];
const ACTS = [{ show_renamed: true }, { show_renamed: true, knows_memo: true }, { show_renamed: true, knows_memo: true, survived_thursday: true }];
for (const flags of ACTS) {
  const sb = { GTP: { Missions: { state: { flags } } } };
  vm.createContext(sb); vm.runInContext(src, sb);
  for (const lm of C.world.landmarks) {
    const out = sb.landmarkLabel(lm);
    if (/^(Goldplate )+The /.test(out)) problems.push(lm.id + ' with ' + Object.keys(flags).join('+') + ': "' + out + '"');
    else if (lm.district === 'uptown' && out !== (lm.label || lm.name) && !/^Goldplate/.test(lm.label || lm.name)) problems.push(lm.id + ' (uptown says NO) with ' + Object.keys(flags).join('+') + ': "' + out + '"');
  }
}
L.report('QA-B-TXT-07', problems, 'no "Goldplate The ..." labels and uptown keeps its names');
