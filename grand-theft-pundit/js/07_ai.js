/* Grand Theft Pundit: 07_ai.js
 * GTP.AI: safe no-op stub with the contract's surface (spawner, wanted,
 * update). Step 2 brings the peds, traffic and police.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.AI = {
    wanted: { level: 0, heat: 0, lastSeen: 0, addHeat: function (/* n, src */) { }, clear: function () { GTP.AI.wanted.level = 0; GTP.AI.wanted.heat = 0; } },
    spawner: { warmup: function () { }, update: function (/* dt */) { } },
    update: function (/* dt */) { },
    reset: function () { GTP.AI.wanted.clear(); }
  };
})();
