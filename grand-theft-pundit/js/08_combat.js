/* Grand Theft Pundit: 08_combat.js
 * GTP.Combat: safe no-op stub with the weapon table and the contract's surface.
 * Step 2 implements aiming, hitscan, projectiles, damage, death and respawn.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.Combat = {
    WEAPONS: {
      fist: { name: 'Fists', dmg: 8, range: 1.4, rate: 2.5, ammo: Infinity },
      megaphone: { name: 'Megaphone', dmg: 2, range: 6, rate: 1.2, cone: true },
      pistol: { name: 'Pistol', dmg: 18, range: 35, rate: 4 },
      hottake: { name: 'Hot Take', dmg: 12, range: 20, rate: 1, lobbed: true, stun: 5 },
      smg: { name: 'SMG', dmg: 9, range: 30, rate: 11 },
      shotgun: { name: 'Shotgun', dmg: 45, range: 12, rate: 1.1, pellets: 6 }
    },
    update: function (/* dt */) { },
    fire: function (/* ped */) { return false; },
    damage: function (/* target, n, src */) { },
    respawn: function () { },
    reset: function () { }
  };
})();
