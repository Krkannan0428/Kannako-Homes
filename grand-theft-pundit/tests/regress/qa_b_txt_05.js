#!/usr/bin/env node
/* QA-B-TXT-05: Merle's shop pitch for the Folding Table Leg quotes the pistol's price.
 * Merle's tic (GDD_EXPANSION §2.4): he quotes the price, then a lower price "for a journalist", then the
 * first price. The table leg is $150, but its pitch (js/24_content_expansion.js shop.items, shown on the
 * Both Sides Arms weapon card) reads "It fell off the table. The honest weapon. Four fifty. For a
 * journalist, one fifty." : $450 is the pistol, and the "journalist discount" is the real price.
 * This test parses every "<price>. For a journalist, <price>." pitch and fails when the first quoted
 * price is not the item's list price, or when the journalist price is above it.
 * Run: node tests/regress/qa_b_txt_05.js
 */
'use strict';
const L = require('./_qa_b_load');
const C = L.content();
const N = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
function small(ws) { let n = 0; for (const w of ws) { if (!(w in N)) return null; n += N[w]; } return n; }
function words(phrase) {
  const ws = phrase.toLowerCase().replace(/-/g, ' ').trim().split(/\s+/);
  const h = ws.indexOf('hundred');
  if (h >= 0) { const a = small(ws.slice(0, h)), b = ws.length > h + 1 ? small(ws.slice(h + 1)) : 0; return a == null || b == null ? null : a * 100 + b; }
  if (ws.length === 2 && small([ws[0]]) != null && small([ws[1]]) != null && N[ws[1]] >= 10) return N[ws[0]] * 100 + N[ws[1]];   // "four fifty"
  return small(ws);
}
const problems = [];
const items = (C.expansion.shop && C.expansion.shop.items) || [];
for (const it of items) {
  const m = /([A-Za-z][A-Za-z -]*)\.\s+For a journalist, ([A-Za-z -]+)\./.exec(it.pitch || '');
  if (!m) continue;
  const first = words(m[1].split('.').pop()), jour = words(m[2]);
  if (first == null || jour == null) { problems.push(it.id + ': could not read the prices in "' + it.pitch + '"'); continue; }
  if (first !== it.price) problems.push(it.id + ' ($' + it.price + '): the pitch quotes $' + first + ' first: "' + it.pitch + '"');
  if (jour > it.price) problems.push(it.id + ' ($' + it.price + '): the journalist price $' + jour + ' is above the list price: "' + it.pitch + '"');
}
L.report('QA-B-TXT-05', problems, 'every Merle pitch quotes the item\'s own list price first');
