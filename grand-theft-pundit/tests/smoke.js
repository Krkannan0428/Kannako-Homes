/* smoke.js: boots headless, checks the contract surface, walks the player, runs the loop, screenshots the chase view. */
'use strict';
const H = require('./_harness');

H.run('smoke', async (t) => {
  const ctx = await t.boot({ seed: 7 });
  const { page } = ctx;
  const info = await page.evaluate(() => {
    const out = {};
    out.three = !!window.THREE && THREE.REVISION;
    out.modules = ['util', 'rng', 'C', 'Input', 'Audio', 'World', 'Assets', 'Entities', 'AI', 'Combat', 'Missions', 'Render', 'UI', 'Content', 'Game'].filter((m) => !GTP[m]);
    out.state = GTP.game.state;
    out.clock = GTP.game.time.clock;
    out.snapshot = GTP.game.debug.snapshot();
    out.spawnDistrict = out.snapshot.district;
    out.assetsMs = GTP.Assets.initMs;
    out.chunks = GTP.Render.chunks.size;
    out.landmarks = GTP.World.landmarks.length;
    out.markers = GTP.Missions.markers();
    out.headless = GTP.game.headless;
    return out;
  });
  t.assert(info.three === '152', 'three r152 loaded: ' + info.three);
  t.assert(info.modules.length === 0, 'missing modules: ' + info.modules.join(','));
  t.assert(info.state === 'playing' && info.headless, 'headless playing');
  t.assert(Math.abs(info.clock - 17.5) < 0.01, 'clock starts at 17:30, got ' + info.clock);
  t.assert(info.spawnDistrict === 'campus', 'spawn in campus, got ' + info.spawnDistrict);
  t.assert(info.chunks > 0, 'chunks built near the camera');
  t.assert(info.landmarks >= 34, 'landmarks');
  t.assert(Array.isArray(info.markers), 'markers() returns an array');
  console.log('  boot snapshot: ' + JSON.stringify(info.snapshot));

  // walk: forward for 3 s moves the player, run is faster, the camera follows, and nothing gets stuck
  const walk = await page.evaluate(() => {
    const p = GTP.game.player, W = GTP.World;
    const start = { x: p.x, z: p.z, y: p.y };
    GTP.Input.set('forward', true);
    GTP.game.advance(3);
    const walked = Math.hypot(p.x - start.x, p.z - start.z);
    GTP.Input.set('run', true);
    const mid = { x: p.x, z: p.z };
    GTP.game.advance(2);
    const ran = Math.hypot(p.x - mid.x, p.z - mid.z);
    GTP.Input.set('forward', false); GTP.Input.set('run', false);
    GTP.game.advance(0.5);
    const cam = GTP.Render.camera.position;
    const camDist = Math.hypot(cam.x - p.x, cam.z - p.z);
    // look around with the virtual look, then the camera yaw changes
    const yaw0 = GTP.Render.rig.yaw;
    GTP.Input.setLook(300, 0); GTP.game.advance(0.1);
    const yaw1 = GTP.Render.rig.yaw;
    // jump
    GTP.Input.set('jump', true); GTP.game.advance(0.25); GTP.Input.set('jump', false);
    const airY = p.y; const groundY = W.heightAt(p.x, p.z, 0);
    GTP.game.advance(1.5);
    return { walked, ran, camDist, yawDelta: Math.abs(yaw1 - yaw0), airY, groundY, landedY: p.y, onGround: p.onGround, solid: W.solidAt(p.x, p.z, p.y + 0.5), steps: GTP.game.steps };
  });
  console.log('  walk: ' + JSON.stringify(walk));
  t.assert(walk.walked > 5 && walk.walked < 9.5, 'walk 3 s at 2.6 m/s moved ' + walk.walked);
  t.assert(walk.ran > walk.walked * 1.3, 'run is faster: ' + walk.ran);
  t.assert(walk.camDist > 2.5 && walk.camDist < 6, 'chase camera distance ' + walk.camDist);
  t.assert(walk.yawDelta > 0.3, 'mouse look turns the camera: ' + walk.yawDelta);
  t.assert(walk.airY > walk.groundY + 0.3, 'jump leaves the ground: ' + walk.airY + ' vs ' + walk.groundY);
  t.assert(Math.abs(walk.landedY - walk.groundY) < 0.05 && walk.onGround, 'landed');
  t.assert(!walk.solid, 'player never inside a solid');
  t.assert(walk.steps >= 400, 'steps counted');

  // pause / resume, camera modes, state machine
  const states = await page.evaluate(() => {
    const out = [];
    GTP.Input.set('pause', true); GTP.game.advance(0.05); out.push(GTP.game.state); GTP.Input.set('pause', false);
    GTP.game.advance(0.05);
    GTP.Input.set('pause', true); GTP.game.advance(0.05); out.push(GTP.game.state); GTP.Input.set('pause', false);
    GTP.Input.set('cameraMode', true); GTP.game.advance(0.05); GTP.Input.set('cameraMode', false); out.push(GTP.game.player.cameraMode);
    GTP.game.player.cameraMode = 'chase';
    // clock advances: 1 game hour = 90 s
    const c0 = GTP.game.time.clock; GTP.game.advance(9); out.push(+(GTP.game.time.clock - c0).toFixed(3));
    // teleport + save/load skeleton
    GTP.game.debug.teleport(300, 300); out.push(Math.round(GTP.game.player.x));
    out.push(GTP.game.save()); out.push(GTP.game.hasSave()); out.push(GTP.game.load());
    out.push(Math.round(GTP.game.player.x));
    return out;
  });
  console.log('  states: ' + JSON.stringify(states));
  t.assert(states[0] === 'paused' && states[1] === 'playing', 'pause toggles');
  t.assert(states[2] === 'close', 'camera mode cycles');
  t.assert(Math.abs(states[3] - 0.1) < 0.002, 'clock rate: ' + states[3]);
  t.assert(states[4] === 300 && states[8] === 300, 'teleport and load restore position');
  t.assert(states[5] === true && states[6] === true && states[7] === true, 'save / hasSave / load work in a file:// context');

  // a chase-camera screenshot with the player in frame
  await page.evaluate(() => { GTP.game.debug.teleport(GTP.World.landmark('campus_quad').door.x, GTP.World.landmark('campus_quad').door.z); GTP.Render.rig.yaw = 0; GTP.Render.rig.snap(); GTP.game.advance(0.5); });
  const file = await t.shot(page, 'smoke_chase');
  const stats = await t.pixelStats(page);
  console.log('  chase shot: ' + file + ' ' + JSON.stringify(stats));
  t.assert(stats.colors > 300, 'chase view is not monochrome: ' + stats.colors + ' colours');

  const errs = await t.errors(ctx);
  t.assert(errs.length === 0, 'errors:\n' + errs.join('\n'));
});
