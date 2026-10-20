/* Shared loader for the qa-b content regression tests (tests/regress/qa_b_txt_*.js).
 * Loads the content files js/20..24 in a vm sandbox with a fake window, the same way
 * tests/content_audit.js reads files from disk (no browser). Also extracts single named
 * functions from a game file so a test can run them against stubs.
 *
 *   const L = require('./qa_b_lib_load');
 *   const C = L.content();                 // GTP.Content after 20..24 loaded
 *   L.dialogueLines(C)                     // every story dialogue line [{src, who, text, ticker}]
 *   L.fnSource('js/09_missions.js', 'failText')   // the source text of `function failText(...) {...}`
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const CONTENT = ['20_content_world.js', '21_content_cast.js', '22_content_missions.js', '23_content_radio.js', '24_content_expansion.js'];

function content() {
  const win = {};
  win.window = win;
  const sb = vm.createContext({ window: win, console });
  for (const f of CONTENT) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), sb, { filename: f });
  return win.GTP.Content;
}

function dialogueLines(C) {
  const out = [];
  const all = (C.missions || []).concat((C.expansion && C.expansion.missions) || []);
  for (const m of all) {
    (m.intro || []).forEach((l, i) => out.push(Object.assign({ src: m.id + '.intro[' + i + ']' }, l)));
    (m.outro || []).forEach((l, i) => out.push(Object.assign({ src: m.id + '.outro[' + i + ']' }, l)));
    (function walk(os, p) {
      (os || []).forEach((o, j) => {
        if (o.type === 'dialogue') (o.lines || []).forEach((l, i) => out.push(Object.assign({ src: m.id + '.' + p + j + '.lines[' + i + ']' }, l)));
        if (o.objectives) walk(o.objectives, p + j + '.');
      });
    })(m.objectives, 'objectives.');
  }
  const cs = (C.expansion && C.expansion.cutscenes) || {};
  for (const id in cs) {
    if (/^cs_intro_/.test(id)) continue;   // built from the mission intros above
    (cs[id].shots || []).forEach((s, k) => (s.lines || []).forEach((l, i) => out.push(Object.assign({ src: id + '.shots[' + k + '].lines[' + i + ']' }, l))));
  }
  return out;
}

// the full text of `function name(...) { ... }` in a file (brace matching, strings respected)
function fnSource(rel, name) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found in ' + rel);
  let i = src.indexOf('{', start), depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced ' + name);
}

// the source text of `var NAME = ...;` up to the first `;` at depth 0 (object / array literals)
function varSource(rel, name) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const start = src.indexOf('var ' + name + ' =');
  if (start < 0) throw new Error(name + ' not found in ' + rel);
  let i = start, depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { q = c; continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unterminated ' + name);
}

function report(id, problems, okMsg) {
  if (problems.length) {
    console.error('FAIL ' + id + ': ' + problems.length + ' problem(s)');
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
  }
  console.log('PASS ' + id + ': ' + okMsg);
}

module.exports = { ROOT, content, dialogueLines, fnSource, varSource, report };
