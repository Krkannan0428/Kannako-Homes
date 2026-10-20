/* qa_b_lib_v03mock.js: a throwaway stand-in for the v0.3 features tests/newplayer.js looks for, so the test's own code paths
 * (the story GPS, the armory, the visible pistol, cover) can be exercised on the v0.2 base before integration.
 * NOT a test and NOT game code: it is injected only when NEWPLAYER_MOCK=1 (page.addInitScript). It fakes, crudely:
 *   GTP.World.route (the road path search), GTP.Story.next + gps:set, the first mission starting by itself, an m01c_both_sides
 *   test mission (goto the Both Sides Arms door, then a free pistol), GTP.Interiors (active within 4 m of a store door),
 *   a pistol mesh tagged userData.weaponId under the player model, and a `cover` input action that emits cover:enter near a wall.
 * A pass with the mock proves only that the test can pass; the real verdict is the run without it. */
'use strict';
module.exports = function v03mock() {
  const ready = () => window.GTP && GTP.game && GTP.Missions && GTP.World && GTP.World.findPath && GTP.Input && GTP.Events;
  const iv = setInterval(() => {
    if (!ready()) return;
    clearInterval(iv);
    const M = GTP.Missions, W = GTP.World, U = GTP.util, E = GTP.Events;
    W.route = (ax, az, bx, bz) => { const p = W.findPath(ax, az, bx, bz, { mode: 'car' }); return p ? p.map((n) => ({ x: n.x, z: n.z })) : [{ x: bx, z: bz }]; };
    const CHAIN = ['m00_intro', 'm01_van', 'm01c_both_sides'];
    const done = () => (M.state && M.state.completed) || (GTP.game.player && GTP.game.player.completed) || {};
    M.registerTest({ id: 'm01c_both_sides', title: 'Both Sides Now (mock)', giver: 'firmness', marker: 'both_sides_strip', requires: ['m01_van'], reward: 50, intro: [], outro: [],
      objectives: [{ type: 'goto', target: { landmark: 'both_sides_strip' }, radius: 10, text: 'Walk into Both Sides Arms' }], failOn: ['player_dead'] });
    M.refreshMarkers && M.refreshMarkers();
    const isDone = (id) => { const c = done(); return c instanceof Set ? c.has(id) : Array.isArray(c) ? c.indexOf(id) >= 0 : !!c[id]; };
    GTP.Story = { chapter: 1, next() {
      const id = CHAIN.find((m) => !isDone(m)); if (!id) return null;
      const mk = M.markers().find((m) => m.kind === 'mission' && m.id === id);
      if (mk) return { missionId: id, giver: mk.giver, landmark: mk.landmark, x: mk.x, z: mk.z };
      const m = M.missionById(id), lm = m && W.landmark(m.marker);
      return lm && lm.door ? { missionId: id, giver: m.giver, landmark: m.marker, x: lm.door.x, z: lm.door.z } : null;
    } };
    E.on('mission:complete', (e) => {
      const id = e && (e.id || e.missionId);
      if (id === 'm01c_both_sides') { const p = GTP.game.player; p.weapons.pistol = 24; }
      if (M.refreshMarkers) M.refreshMarkers();
      const n = GTP.Story.next(); if (n) E.emit('gps:set', { x: n.x, z: n.z, label: n.missionId, kind: 'story' });
    });
    // the first mission starts by itself a second after play begins
    let started = false;
    E.on('mission:start', () => { started = true; });
    const tick = GTP.game.step.bind(GTP.game);
    let t = 0, inside = null, pistolMesh = null;
    GTP.Interiors = { active: false, current: null, enter() {}, exit() {} };
    GTP.Input.actions.push('cover');
    const set = GTP.Input.set.bind(GTP.Input);
    GTP.Input.set = (a, on) => {
      if (a === 'cover' && on) {
        const p = GTP.game.player;
        for (let k = 0; k < 16; k++) { const d = U.yawToDir(k / 16 * Math.PI * 2); if (W.solidAt(p.x + d.x * 1.3, p.z + d.z * 1.3, p.y + 0.5)) { E.emit('cover:enter', {}); p.pose = Object.assign(p.pose || {}, { cover: { side: 'left', high: true } }); break; } }
        return;
      }
      return set(a, on);
    };
    GTP.game.step = function () {
      tick();
      if (this.state !== 'playing' || this.loading.active) return;
      t += GTP.C.STEP;
      const p = this.player;
      if (!started && t > 1 && !isDone('m00_intro') && !(M.state && M.state.active)) { started = true; M.start('m00_intro'); }
      // m01c's light (test missions get no marker of their own): walking onto the door starts it
      const nx = GTP.Story.next();
      if (nx && nx.missionId === 'm01c_both_sides' && !(M.state && M.state.active) && !p.inVehicle && U.dist2d(p.x, p.z, nx.x, nx.z) < 3) M.start('m01c_both_sides');
      // the armory: within 4 m of a Both Sides Arms door
      const st = GTP.Combat.shop && GTP.Combat.shop.stores ? GTP.Combat.shop.stores() : [];
      const near = st.find((s) => U.dist2d(p.x, p.z, s.x, s.z) < 4);
      if (near && !inside) { inside = near; GTP.Interiors.active = true; GTP.Interiors.current = { id: 'armory_' + near.id, kind: 'armory', store: near.id }; E.emit('interior:enter', { id: GTP.Interiors.current.id, kind: 'armory', store: near.id }); }
      // the held gun: a small box under the player's model while a pistol is out
      if (p.mesh && !pistolMesh) { pistolMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.22), new THREE.MeshBasicMaterial({ color: 0x222222 })); pistolMesh.name = 'held_pistol'; pistolMesh.position.set(0.3, 1.1, -0.3); p.mesh.add(pistolMesh); }
      if (pistolMesh) { pistolMesh.userData.weaponId = p.weapon === 'pistol' ? 'pistol' : null; pistolMesh.visible = p.weapon === 'pistol'; }
      if (p.aiming) p.pose = Object.assign(p.pose || {}, { aim: true });
    };
  }, 50);
};
