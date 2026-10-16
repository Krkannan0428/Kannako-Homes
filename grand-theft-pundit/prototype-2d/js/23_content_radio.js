/* Grand Theft Pundit: 23_content_radio.js
 * GTP.Content.radio stub: one placeholder station so Audio.radio.current()
 * has something to return. The content agent writes the real stations.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.Content = GTP.Content || {};
  GTP.Content.radio = {
    stations: [
      { id: 'static', name: 'Static FM', tagline: 'all static, all the time', bpm: 100, scale: 'minor', pattern: {}, adLines: [], djLines: [] }
    ],
    ticker: []
  };
})();
