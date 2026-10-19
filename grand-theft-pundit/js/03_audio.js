/* Grand Theft Pundit: 03_audio.js
 * GTP.Audio: safe no-op stub with the contract's surface. The audio agent
 * replaces the internals (WebAudio synth, engine loop, siren, radio sequencer).
 * Everything here is silent, never throws, and never creates an AudioContext
 * before a user gesture (unlock).
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};

  var Audio = GTP.Audio = {
    ctx: null,
    muted: false,
    headless: false,
    unlocked: false,
    station: 0,
    init: function (opts) {
      opts = opts || {};
      Audio.headless = !!opts.headless;
      Audio.muted = !!opts.mute || Audio.headless;
    },
    unlock: function () { Audio.unlocked = true; },   // the real module creates the AudioContext here
    play: function (/* name, opts */) { },
    engine: function (/* level, cls */) { },
    setMuted: function (m) { Audio.muted = !!m; },
    radio: {
      setStation: function (n) { Audio.station = n | 0; },
      next: function () { Audio.station++; },
      current: function () { return null; },
      stop: function () { }
    },
    update: function (/* dt */) { }
  };
})();
