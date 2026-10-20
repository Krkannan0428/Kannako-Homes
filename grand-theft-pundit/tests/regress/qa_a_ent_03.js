// QA-A-ENT-03: a lamp post the player's car knocks over stops glowing.
// Render._buildProps puts every lamp (fallen or not) into the chunk's night glow: a glow sprite at the head (5.9 m up)
// and a 11 m light pool on the road. After the knock the lamp lies on the pavement while its glow keeps floating in
// the air and the pool stays lit, also after the chunk is rebuilt.
'use strict';
const H = require('../_harness');
H.run('qa_a_ent_03 a knocked-over lamp has no glow sprite or light pool', async (t) => {
  const ctx = await t.boot({ seed: 7, clock: 22 });
  const r = await ctx.page.evaluate(() => {
    const W = GTP.World, U = GTP.util, R = GTP.Render, g = GTP.game, p = g.player;
    GTP.C.CARS_TARGET = 0; GTP.C.PEDS_TARGET = 0;
    for (const e of GTP.Entities.list.slice()) if ((e.kind === 'vehicle' && !e.hasPlayer()) || e.kind === 'ped') e.destroy();
    g.debug.godMode(true);
    const lp = W.props.find((q) => q.kind === 'lamp' && Math.abs(q.x - 319.35) < 0.1 && Math.abs(q.z - 310) < 0.1);
    if (!lp) return { err: 'lamp not found' };
    // glow sprites (above 4 m) and light-pool quads centred within 3 m of the lamp's base, whichever side of the pole
    // the head is drawn on (see QA-A-NGT-01)
    function glowAt() {
      let sprites = 0, pool = 0;
      R.chunks.forEach((ch) => {
        if (!ch.group) return;
        ch.group.traverse((o) => {
          if (o.isPoints && o.name !== 'edgelights' && o.name !== 'beacons') {
            const a = o.geometry.attributes.position.array;
            for (let i = 0; i < a.length; i += 3) if (Math.hypot(a[i] - lp.x, a[i + 2] - lp.z) < 3 && a[i + 1] > 4) sprites++;
          }
          if (o.isMesh && o.name === 'glow') {
            const a = o.geometry.attributes.position.array;
            for (let i = 0; i + 11 < a.length; i += 12) { const cx = (a[i] + a[i + 3] + a[i + 6] + a[i + 9]) / 4, cz = (a[i + 2] + a[i + 5] + a[i + 8] + a[i + 11]) / 4; if (Math.hypot(cx - lp.x, cz - lp.z) < 3) pool++; }
          }
        });
      });
      return { sprites, pool };
    }
    g.debug.teleport(lp.x + 20, lp.z); g.advance(0.5); g.render();
    const before = glowAt();
    const sx = lp.x + 14, sz = lp.z;
    const v = g.debug.spawnVehicle(sx, sz, 'sedan', { yaw: U.dirToYaw(-1, 0) }); v.persistent = true;
    g.debug.teleport(sx, sz); v.enter(p, 0); g.advance(0.3);
    GTP.Input.set('forward', true); for (let i = 0; i < 120 && !lp.fallen; i++) g.advance(1 / 30); GTP.Input.set('forward', false);
    g.advance(1); g.render();
    const after = glowAt();
    // rebuild the chunk: far away and back
    g.debug.teleport(lp.x + 450, lp.z); g.advance(1); g.render();
    g.debug.teleport(lp.x + 20, lp.z); g.advance(1); g.render();
    const rebuilt = glowAt();
    return { fallen: !!lp.fallen, before, after, rebuilt };
  });
  console.log(JSON.stringify(r));
  t.assert(!r.err, r.err);
  t.assert(r.before.sprites > 0 && r.before.pool > 0, 'the standing lamp should glow (test setup)');
  t.assert(r.fallen, 'the car did not knock the lamp over');
  t.assert(r.after.sprites === 0 && r.after.pool === 0, 'knocked lamp still glows: ' + JSON.stringify(r.after));
  t.assert(r.rebuilt.sprites === 0 && r.rebuilt.pool === 0, 'knocked lamp glows again after a chunk rebuild: ' + JSON.stringify(r.rebuilt));
});
