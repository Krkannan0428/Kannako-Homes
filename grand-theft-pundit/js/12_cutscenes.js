/* 12_cutscenes.js: data-driven cutscene player (letterbox, camera keyframes, actors, dialogue, skip).
   Owned by the cutscenes/strands track. Stub until implemented: plays nothing and completes at once. */
(function () {
  var GTP = window.GTP = window.GTP || {};
  GTP.Cutscenes = GTP.Cutscenes || {
    active: false,
    current: null,
    play: function (script, onDone) { if (typeof onDone === 'function') onDone(); },
    skip: function () {},
    update: function () {}
  };
})();
