/* Grand Theft Pundit: 10_ui.js
 * GTP.UI stub. HUD, minimap, dialogue, menus, touch controls and minigames are
 * the UI agent's job. update/draw are no-ops except for a one-line placeholder
 * title prompt so a non-headless boot is not a blank screen.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};

  var UI = GTP.UI = {
    screen: 'none',
    toasts: [],
    init: function () { UI.screen = 'none'; },
    update: function (/* dt */) {},
    draw: function (ctx) {
      var g = GTP.game;
      if (!g || g.state !== 'title') return;
      var C = GTP.C;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, C.VIEW_H / 2 - 70, C.VIEW_W, 140);
      ctx.fillStyle = '#ff3fa4';
      ctx.font = 'bold 44px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('GRAND THEFT PUNDIT', C.VIEW_W / 2, C.VIEW_H / 2 - 10);
      ctx.fillStyle = '#eef1fb';
      ctx.font = '18px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('press Enter to start', C.VIEW_W / 2, C.VIEW_H / 2 + 36);
      ctx.restore();
    },
    showDialogue: function (/* line */) {},
    closeDialogue: function () {},
    banner: function (/* text, sub */) {},
    toast: function (text) { UI.toasts.push({ text: String(text), t: 0 }); if (UI.toasts.length > 8) UI.toasts.shift(); },
    touch: { visible: false, handle: function (/* touchEvent */) {} },
    minigames: {
      debate: function (params, onResult) { if (onResult) onResult(true); },
      ratio: function (params, onResult) { if (onResult) onResult(true); }
    },
    drawPortrait: function (/* ctx, recipe, x, y, size */) {}
  };
  void UI;
})();
