/* Grand Theft Pundit: 06_ai.js
 * GTP.AI stub: ped brains, traffic, police and the spawner are the AI agent's
 * job. These no-ops keep the engine loop honest until then.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};

  var AI = GTP.AI = {
    update: function (/* dt */) {},
    spawner: {
      warmup: function () {},
      update: function (/* dt */) {}
    },
    wanted: {
      level: 0,
      heat: 0,
      add: function (amount /* , reason */) { this.heat += amount; },
      decay: function (/* dt */) {},
      onCrime: function (/* type, x, y */) {}
    },
    policeResponse: function (/* level */) { return []; },
    driveTo: function (/* vehicle, path */) {},
    followLane: function (/* vehicle */) {},
    avoidAhead: function (/* vehicle */) {}
  };
  void AI;
})();
