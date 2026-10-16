/* Grand Theft Pundit: 07_combat.js
 * GTP.Combat stub: weapons table, fire and autoAim are the combat agent's job.
 * The death / busted flow is implemented here so the loop honours its
 * contract already: onPlayerDeath -> 'wasted', respawn at the hospital after
 * 3 s (lose weapons, keep money minus 10%); onPlayerBusted -> 'busted',
 * respawn at the police station after 3 s (lose weapons, $500 fine).
 * Game.step calls Combat.update(dt) in the 'wasted' and 'busted' states so
 * the respawn timer runs there.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var RESPAWN_SECONDS = 3, BUST_FINE = 500, DEATH_MONEY_KEEP = 0.9;

  function toast(t) { var UI = GTP.UI; if (UI && UI.toast) { try { UI.toast(t); } catch (e) { /* ui is optional */ } } }

  var Combat = GTP.Combat = {
    WEAPONS: {
      fist: { name: 'Fists', dmg: 8, rate: 2.5, range: 20, melee: true }
    },
    respawn: null,   // {state, t} while a respawn is pending
    update: function (dt) {
      var r = Combat.respawn; if (!r) return;
      r.t -= dt;
      if (r.t <= 0) { Combat.respawn = null; Combat.doRespawn(r.state); }
    },
    fire: function (/* shooter, weaponId, angle */) { return false; },
    damage: function (target, amount /* , source, kind */) {
      if (!target || !target.alive) return;
      target.hp -= amount;
      if (target.hp <= 0) { target.hp = 0; target.alive = false; if (target.onDeath) target.onDeath(); }
    },
    autoAim: function (/* shooter, maxRange, coneRad */) { return null; },
    onPlayerDeath: function () {
      if (!GTP.game || GTP.game.state === 'wasted') return;
      GTP.game.setState('wasted');
      Combat.respawn = { state: 'wasted', t: RESPAWN_SECONDS };
    },
    onPlayerBusted: function () {
      if (!GTP.game || GTP.game.state === 'busted') return;
      GTP.game.setState('busted');
      Combat.respawn = { state: 'busted', t: RESPAWN_SECONDS };
    },
    // where the player comes back: outside the landmark's building, on open ground
    respawnPoint: function (state) {
      var W = GTP.World, C = GTP.C, CW = (GTP.Content && GTP.Content.world) || {}, rs = CW.respawn || {};
      var id = state === 'busted' ? (rs.police || 'police_hq') : (rs.hospital || 'hospital');
      var lm = W.landmark(id), p = GTP.game.player;
      var x = lm ? lm.x : p.x, y = lm ? lm.y : p.y;
      if (lm && lm.building) { x = lm.building.x + lm.building.w / 2; y = lm.building.y + lm.building.h + 28; }
      var open = W.nearestTileOf(x, y, function (t) { return !W.isSolidTile(t) && t !== W.T.ROAD; }, 10);
      if (open) { x = (open.tx + 0.5) * C.TILE; y = (open.ty + 0.5) * C.TILE; }
      return { x: x, y: y, landmark: id };
    },
    doRespawn: function (state) {
      var g = GTP.game, p = g && g.player; if (!p) return;
      try {
        var at = Combat.respawnPoint(state);
        if (p.inVehicle) p.inVehicle.exit(p);
        p.x = at.x; p.y = at.y; p.vx = p.vy = 0;
        p.alive = true; p.hp = p.maxHp; p.armor = 0; p.state = 'idle'; p.z = 0; p.deadTimer = 0; p.knockTimer = 0;
        p.intent.x = p.intent.y = 0;
        p.weapons = { fist: Infinity }; p.weapon = 'fist';
        if (state === 'busted') p.money = Math.max(0, p.money - BUST_FINE);
        else p.money = Math.max(0, Math.round(p.money * DEATH_MONEY_KEEP));
        p.snap();
        GTP.Entities.hash.update(p);
        if (GTP.AI && GTP.AI.onRespawn) GTP.AI.onRespawn(state);
        if (GTP.Render && GTP.Render.snapCamera) GTP.Render.snapCamera();
        toast(state === 'busted' ? 'Released. Weapons confiscated, fined ' + GTP.util.fmtMoney(BUST_FINE) : 'Patched up at the hospital');
      } catch (e) { GTP.util.reportError(e, 'combat.respawn'); }
      g.setState('playing');
    }
  };
  void Combat;
})();
