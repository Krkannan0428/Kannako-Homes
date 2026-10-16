/* Grand Theft Pundit: 07_combat.js
 * GTP.Combat stub: weapons table and damage are the combat agent's job.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};

  var Combat = GTP.Combat = {
    WEAPONS: {
      fist: { name: 'Fists', dmg: 8, rate: 2.5, range: 20, melee: true }
    },
    update: function (/* dt */) {},
    fire: function (/* shooter, weaponId, angle */) { return false; },
    damage: function (target, amount /* , source, kind */) {
      if (!target || !target.alive) return;
      target.hp -= amount;
      if (target.hp <= 0) { target.hp = 0; target.alive = false; if (target.onDeath) target.onDeath(); }
    },
    autoAim: function (/* shooter, maxRange, coneRad */) { return null; },
    onPlayerDeath: function () { if (GTP.game) GTP.game.setState('wasted'); },
    onPlayerBusted: function () { if (GTP.game) GTP.game.setState('busted'); }
  };
  void Combat;
})();
