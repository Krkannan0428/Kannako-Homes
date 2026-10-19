/* Grand Theft Pundit: 09_missions.js
 * GTP.Missions: safe no-op stub with the contract's surface and state shape.
 * The missions agent replaces the objective interpreter.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var Missions = GTP.Missions = {
    state: { active: null, objective: 0, completed: new Set(), flags: {}, dialogue: [], timer: null },
    init: function () { Missions.state = { active: null, objective: 0, completed: new Set(), flags: {}, dialogue: [], timer: null }; },
    update: function (/* dt */) { },
    markers: function () { return []; },
    start: function (/* id */) { return false; },
    completeObjective: function () { return false; },
    fail: function () { },
    available: function () { return []; },
    _resolveMinigame: function (/* win */) { }
  };
})();
