/* Grand Theft Pundit: 11_ui.js
 * GTP.UI: safe stub. draw/update are no-ops apart from a tiny debug readout
 * when ?debug=1; the UI agent replaces this with the full HUD, minimap,
 * dialogue, title, pause, phone, cards, touch controls and minigames.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var toasts = [];
  GTP.UI = {
    init: function () { },
    update: function (dt) { for (var i = toasts.length - 1; i >= 0; i--) { toasts[i].t -= dt; if (toasts[i].t <= 0) toasts.splice(i, 1); } },
    draw: function (ctx, w, h) {
      if (!ctx) return;
      var g = GTP.game;
      if (g && g.debugMode) {
        var s = g.debug.snapshot();
        ctx.font = '12px ui-monospace, Menlo, monospace'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textBaseline = 'top';
        ctx.fillText(JSON.stringify(s).slice(0, 220), 12, 12);
      }
      // aim mode: crosshair + lock reticle (Combat owns the hooks; the full HUD may draw its own from GTP.Combat.aim)
      if (GTP.Combat && GTP.Combat.drawAimOverlay) { try { GTP.Combat.drawAimOverlay(ctx, w, h); } catch (e) { GTP.util.reportError(e, 'combat.overlay'); } }
      if (toasts.length) {
        ctx.font = 'bold 16px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (var i = 0; i < toasts.length; i++) ctx.fillText(toasts[i].text, w / 2, h - 60 - i * 22);
        ctx.textAlign = 'left';
      }
    },
    onState: function (/* state, prev */) { },
    toast: function (text) { toasts.push({ text: String(text), t: 3 }); },
    touch: { handle: function (/* e */) { } },
    resize: function (/* w, h */) { }
  };
})();
