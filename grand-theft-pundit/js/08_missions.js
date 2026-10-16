/* Grand Theft Pundit: 08_missions.js
 * GTP.Missions stub: the objective interpreter is the missions agent's job.
 * markers() returns [] so Render and the minimap have nothing to draw yet.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};

  var listeners = {};
  var Missions = GTP.Missions = {
    state: { active: null, objectiveIndex: 0, flags: {}, completed: new Set(), failed: {} },
    dialogue: [],
    init: function () {
      Missions.state = { active: null, objectiveIndex: 0, flags: {}, completed: new Set(), failed: {} };
      Missions.dialogue.length = 0;
    },
    update: function (/* dt */) {},
    available: function () {
      var all = (GTP.Content && GTP.Content.missions) || [];
      var st = Missions.state;
      return all.filter(function (m) {
        if (st.completed.has(m.id)) return false;
        return (m.requires || []).every(function (r) { return st.completed.has(r); });
      });
    },
    start: function (/* id */) { return false; },
    abort: function () {},
    completeObjective: function () {},
    fail: function (/* reason */) {},
    markers: function () { return []; },
    on: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit: function (ev, data) {
      var l = listeners[ev] || [];
      for (var i = 0; i < l.length; i++) { try { l[i](data); } catch (e) { GTP.util.reportError(e, 'missions:' + ev); } }
    }
  };
  void Missions;
})();
