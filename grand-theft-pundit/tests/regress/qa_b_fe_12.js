/* QA-B-FE-12 (medium): the dialogue box holds two text lines and keeps the LAST two, so a line that wraps to three
 * loses its opening words (m09b_hotmic intro line 3, "Get in front of it. Stay in front of it. Vans respect that.
 * Then the proofs. Then ..."). drawDialogue: lines.slice(lines.length - maxLines).
 * Checks: every content dialogue line, typed out in the box at 1280x720, draws its first word.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/regress/qa_b_fe_12.js
 */
'use strict';
const { H, bootTitle } = require('./qa_b_lib_fe');

H.run('qa_b_fe_12 dialogue box drops the first line', async (t) => {
  const { page } = await bootTitle(t);
  const r = await page.evaluate(() => {
    T_.newGame(); T_.quietRoad();
    const seen = new Set(), lines = [];
    (function walk(o, path, depth) {
      if (!o || typeof o !== 'object' || depth > 9 || seen.has(o)) return; seen.add(o);
      if (typeof o.text === 'string' && o.who && o.text.length > 120) lines.push({ who: o.who, text: o.text, where: path });
      for (const k in o) { try { walk(o[k], path + '.' + k, depth + 1); } catch (e) { /* skip */ } }
    })(GTP.Content, 'Content', 0);
    const ctx = GTP.Render.hudCtx, orig = ctx.fillText, bad = [];
    for (const l of lines) {
      GTP.UI.showDialogue({ who: l.who, text: l.text }, () => {});
      GTP.UI.state.dialogue.chars = l.text.length; GTP.UI.state.dialogue.done = true; GTP.UI.state.dialogue.t = 0.5;
      const drawn = [];
      ctx.fillText = function (s) { drawn.push(String(s)); return orig.apply(this, arguments); };
      try { GTP.game.render(); } finally { ctx.fillText = orig; }
      const first = l.text.split(/\s+/).slice(0, 3).join(' ');
      if (!drawn.some((s) => s.indexOf(first) === 0)) bad.push(l.where + ': "' + first + '..."');
      GTP.UI.hideDialogue();
    }
    return { checked: lines.length, bad };
  });
  console.log('  long lines checked: ' + r.checked + ', missing their opening: ' + r.bad.length + (r.bad.length ? '\n   ' + r.bad.join('\n   ') : ''));
  t.assert(r.checked > 0, 'found long dialogue lines to check');
  t.assert(!r.bad.length, r.bad.length + ' dialogue line(s) lose their opening words in the box: ' + r.bad.join('; '));
});
