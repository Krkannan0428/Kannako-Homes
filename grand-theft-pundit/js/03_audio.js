/* Grand Theft Pundit: 03_audio.js
 * GTP.Audio stub: safe no-ops so the engine boots. The audio agent replaces
 * this with the WebAudio SFX + procedural radio implementation.
 * Contract: init(), unlock(), play(name, opts), engine(level),
 *           radio.setStation(i)/next()/current()/stop(), setMuted(bool), muted
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};

  var Audio = GTP.Audio = {
    muted: false,
    headless: false,
    unlocked: false,
    station: 0,
    init: function (opts) {
      opts = opts || {};
      Audio.headless = !!opts.headless;
      if (opts.mute) Audio.muted = true;
    },
    unlock: function () { if (!Audio.headless) Audio.unlocked = true; },
    play: function (/* name, opts */) {},
    engine: function (/* level */) {},
    setMuted: function (m) { Audio.muted = !!m; },
    radio: {
      setStation: function (i) { Audio.station = i | 0; },
      next: function () {
        var st = (GTP.Content && GTP.Content.radio && GTP.Content.radio.stations) || [];
        Audio.station = st.length ? (Audio.station + 1) % st.length : 0;
        return Audio.radio.current();
      },
      current: function () {
        var st = (GTP.Content && GTP.Content.radio && GTP.Content.radio.stations) || [];
        return st[Audio.station] || null;
      },
      stop: function () {}
    }
  };
})();
