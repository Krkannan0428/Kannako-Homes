#!/usr/bin/env node
/* QA-B-TXT-04: the CONTEXT STAMPED card prints raw vehicle class ids and tags ("The suv is gone.").
 * js/09_missions.js failText('vehicle_lost:<tag>') builds 'The ' + v.type + ' is gone.' from the engine
 * class id, so m10_pellets fails with "The suv is gone.", m08_scooters with "The bike is gone." (the
 * Defense Scooter), and when the tagged vehicle is no longer in run.tagged it prints the tag itself
 * (a fallback; the fail rule normally finds the vehicle). Confirmed on screen: ?mission=m10_pellets, then
 * GTP.Missions.fail('vehicle_lost:pellets') shows the card "CONTEXT STAMPED / The suv is gone.".
 * (QA-C1-15 is the same class-id leak in the drive hints; this is the fail card.)
 * This test runs the real failText source against stubs for every vehicle_lost:<tag> in the story's
 * failOn lists, with the tagged vehicle in run.tagged (the reachable path), and fails on a raw class id in the result.
 * Run: node tests/regress/qa_b_txt_04.js
 */
'use strict';
const vm = require('vm');
const L = require('./_qa_b_load');
const C = L.content();
const src = L.varSource('js/09_missions.js', 'FAIL_TEXT') + '\n' + L.fnSource('js/09_missions.js', 'failText') + '\nthis.failText = failText;';
const RAW = /\b(suv|sports|bike|sedan|cop)\b/;   // engine class ids that are not the copy (van, truck, taxi, bus read as English)
const problems = [];
const all = C.missions.concat(C.expansion.missions);
// the tag -> spawned class, from each mission's spawns
function classOf(m, tag) {
  let found = null;
  (function walk(os) { (os || []).forEach((o) => { const s = o.spawn; if (s && s.tag === tag) found = s.type || s.vehicle; if (o.objectives) walk(o.objectives); }); })(m.objectives);
  return found;
}
for (const m of all) {
  for (const r of m.failOn || []) {
    if (r.indexOf('vehicle_lost:') !== 0) continue;
    const tag = r.slice(13), cls = classOf(m, tag) || 'van';
    const sb = { run: { tagged: { [tag]: { type: cls } } } };
    vm.createContext(sb); vm.runInContext(src, sb);
    const out = sb.failText(r);
    if (RAW.test(out)) problems.push(m.id + ' ' + r + ' (a ' + cls + '): "' + out + '"');
  }
}
L.report('QA-B-TXT-04', problems, 'vehicle_lost fail texts use display names, never class ids or tags');
