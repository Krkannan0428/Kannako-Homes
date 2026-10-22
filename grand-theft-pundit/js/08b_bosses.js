/* Grand Theft Pundit: 08b_bosses.js (the v0.3 bosses track)
 * GTP.Bosses: six set-piece boss encounters against the invented villains of GDD.md, each with phases, readable telegraphs
 * (a ground decal that flashes before it strikes), adds and a mechanic beyond raw damage:
 *   b01_goldplate  the gold helicopter: shoot the ribbon spools under it to ground it, then wreck his gold teleprompter
 *   b02_velvetine  the silent yacht party: wreck the speakers (their silent drops are rings to jump) to expose the Baron
 *   b03_warbanner  the runway: wreck the Defense Scooters, dodge the jet flyover strips (they wreck scooters too)
 *   b04_redacted   the weather balloon: pop the [REDACTED] patch phase by phase while OVA vans circle and drop agents
 *   b05_dunk       table to table: read the card over Dunk's head and counter it (jump, step aside, hold fire, clear replies)
 *   b06_panel      the final panel: debate rounds (the UI debate minigame) alternating with combat waves under memo rain
 * Bosses are defeated, humiliated and ratio'd, never killed: a boss ped's damage goes into the encounter's own pool, the ped
 * never dies, and the defeat is a slump, a RATIO'D sign and a walk-off.
 * Dialogue and barks live below as data (DEFS[id].lines / .barks). Events: boss:phase {id, phase, hp, maxHp, name, phases,
 * shield, state}, boss:defeated {id, name}, boss:bark {id, who, text}, boss:start, boss:end {id, reason}.
 * The `boss` objective type ({type:'boss', bossId, at?}) goes through GTP.Missions.registerObjectiveType when it exists;
 * otherwise a fallback rewrites boss objectives to an inert type at Missions.start and swaps this file's handler in on the
 * `mission:objective` event (Missions.debug.run()). Each phase start refreshes the mission checkpoint, so RETRY resumes there.
 *
 * GTP.Specials: four specials with meters 0..1 (focus slow-motion aim, shout area stun, chatmob ally call, boost vehicle nitro),
 * unlocked by story missions or `flags.special_<id>`, triggered by the input action `special` (Focus while aiming, Boost in a
 * vehicle, a hold for Chat Mob, a tap for Shout; 02_input.js binds it to X, Shift + right mouse and L3). Emits
 * special:state {id, meter, active, unlocked} on every visible change of an unlocked special (1% meter steps, toggles,
 * unlocks; a locked one stays silent, so the HUD shows no ring for it).
 *
 * Wrappers this file installs on other modules (folded in at integration; see docs/v03/bosses.md):
 *   GTP.Combat.update  ticks the bosses and specials in state 'playing' (Combat loads before this file)
 *   GTP.Missions.start / registerTest   the boss objective fallback (only without registerObjectiveType)
 *   GTP.AI.wanted.crime / addHeat   drop every crime and all heat while a fight is in intro, fight or break (parts are kind
 *                         'heli' so Combat's hitscan, lock-on and blasts reach them; a shot at one is otherwise 'attackCop')
 *   GTP.UI.draw        a fallback boss bar and special meters when the UI has none of its own (UI.state.boss /
 *                      UI.state.specials, or drawsBossBar / drawsSpecials); with the UI's bar, only the shield line
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var C = GTP.C, U = GTP.util, TAU = Math.PI * 2;

  var K = C.BOSSES = Object.assign({
    hitCap: 0.08,          // one hit takes at most this share of a boss's max hp (a rocket is a big hit, not a phase)
    leash: 150,            // metres from the arena centre; beyond it for leashTime the encounter fails (a mission) or ends
    leashTime: 10,
    arrive: 70,            // a mission's fight waits (state 'approach': the set is up, the arrow points at it) until the player
                           // is this close to the arena centre; the intro lines and the leash start on arrival
    breakTime: 1.4,        // the beat between phases (attacks cleared) before the next phase's lines
    supplyHp: 40,          // a health crate at every phase start beside the arena
    supplyAmmo: 36,
    teleY: 0.09,           // telegraph decals float this far above the ground
    defeatWalk: 6,         // seconds after the defeat lines before the humiliated boss walks off
    allyLife: 20
  }, C.BOSSES || {});

  // ------------------------------------------------------------- helpers --
  function game() { return GTP.game; }
  function player() { return GTP.game ? GTP.game.player : null; }
  function simT() { return (GTP.game && GTP.game.time) ? GTP.game.time.t : 0; }
  function W() { return GTP.World; }
  function E() { return GTP.Entities; }
  function fx(o) { if (GTP.Render && GTP.Render.fx) { try { GTP.Render.fx.add(o); } catch (e) { /* fx optional */ } } }
  function sfx(name, x, z, gain) { if (GTP.Audio && GTP.Audio.play) { try { GTP.Audio.play(name, { x: x, z: z, gain: gain }); } catch (e) { /* audio optional */ } } }
  function textFx(text, x, y, z, color, life) { fx({ type: 'text', text: text, x: x, y: y, z: z, color: color || '#ffd45a', life: life || 1.3 }); }
  function toast(t) { if (GTP.UI && GTP.UI.toast) { try { GTP.UI.toast(t); } catch (e) { /* ui optional */ } } }
  function emit(name, payload) { GTP.Events.emit(name, payload || {}); }
  function shake(k) { var Rd = GTP.Render; if (Rd && Rd.rig && Rd.rig.shake) { try { Rd.rig.shake(k); } catch (e) { /* optional */ } } }
  function groundY(x, z, hint) { return W().heightAt(x, z, hint == null ? 0 : hint); }
  function castOf(id) { var Ct = GTP.Content; return (Ct && Ct.cast && Ct.cast[id]) || null; }
  function castName(id) { var c = castOf(id); return c ? c.name : id; }
  function castColor(id) { var c = castOf(id); return c ? c.color : '#ffffff'; }
  function flags() { var M = GTP.Missions; return M && M.state ? M.state.flags : null; }
  function completed(id) { var M = GTP.Missions; return !!(M && M.state && M.state.completed && M.state.completed.has(id)); }
  function airborne(p) { return !p.onGround && !p.inVehicle && p.y > groundY(p.x, p.z, p.y) + 0.22; }
  function fromPlayer(src) { var p = player(); return !src || src === p || src.ally || (p && src.driver === p) || (p && src.owner === p); }
  var pedOut = function (p) { return !p || p.removed || !p.alive || p.fled; };

  // a walkable spot rMin..rMax from (cx, cz) (sidewalk, plaza, grass, sand, parking; roads when allowed)
  function spotNear(rng, cx, cz, rMin, rMax, roads) {
    var Wd = W(), T = Wd.T, TILE = C.TILE;
    for (var tries = 0; tries < 40; tries++) {
      var a = rng.random() * TAU, r = rMin + (rMax - rMin) * Math.sqrt(rng.random());
      var x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
      if (!Wd.inBounds(tx, tz)) continue;
      var t = Wd.tiles[tz * Wd.w + tx];
      if (!(t === T.SIDEWALK || t === T.PLAZA || t === T.GRASS || t === T.SAND || t === T.PARKING || (roads && t === T.ROAD))) continue;
      if (Wd.solidAt(x, z, 0.5)) continue;
      var res = Wd.resolveCapsule(x, z, 0.5, 0.7);
      if (Wd.solidAt(res.x, res.z, 0.5)) continue;
      return { x: res.x, z: res.z, y: groundY(res.x, res.z, 0) };
    }
    return { x: cx + rMin, z: cz, y: groundY(cx + rMin, cz, 0) };
  }

  // ----------------------------------------------------------- materials --
  var MATS = {};
  function mat(hex, o) {
    o = o || {};
    var key = hex + '|' + (o.metal || 0) + '|' + (o.rough == null ? 0.5 : o.rough) + '|' + (o.glow || 0) + '|' + (o.basic ? 1 : 0) + '|' + (o.opacity || 1) + '|' + (o.side || 0);
    if (MATS[key]) return MATS[key];
    var m;
    if (o.basic) m = new THREE.MeshBasicMaterial({ color: hex, transparent: o.opacity != null && o.opacity < 1, opacity: o.opacity == null ? 1 : o.opacity, depthWrite: !(o.opacity < 1), side: o.side || THREE.FrontSide });
    else m = new THREE.MeshStandardMaterial({ color: hex, metalness: o.metal || 0, roughness: o.rough == null ? 0.5 : o.rough, emissive: o.glow ? hex : 0x000000, emissiveIntensity: o.glow || 0, side: o.side || THREE.FrontSide });
    m.name = 'boss:' + key;
    MATS[key] = m;
    return m;
  }
  var GEO = {}, UP = new THREE.Vector3(0, 1, 0), TMPV = new THREE.Vector3(), SCRATCH = [];
  function geo(name) {
    if (GEO[name]) return GEO[name];
    var g;
    switch (name) {
      case 'circle': g = new THREE.CircleGeometry(1, 40); break;
      case 'ring': g = new THREE.RingGeometry(0.9, 1, 56); break;
      case 'plane': g = new THREE.PlaneGeometry(1, 1); break;
      case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
      case 'cyl': g = new THREE.CylinderGeometry(1, 1, 1, 14); break;
      case 'sphere': g = new THREE.SphereGeometry(1, 22, 14); break;
      default: g = new THREE.BoxGeometry(1, 1, 1);
    }
    GEO[name] = g;
    return g;
  }
  function part(g, m, x, y, z, sx, sy, sz) {
    var o = new THREE.Mesh(geo(g), m);
    o.position.set(x || 0, y || 0, z || 0); o.scale.set(sx || 1, sy || 1, sz || 1); o.castShadow = true;
    return o;
  }
  // a canvas label (cards, signs, the redacted patch); cached per text + colours
  var TEX = {};
  function labelTexture(text, bg, fg, w, h, size) {
    var key = text + '|' + bg + '|' + fg + '|' + (w || 256) + '|' + (h || 128);
    if (TEX[key]) return TEX[key];
    var cv = document.createElement('canvas'); cv.width = w || 256; cv.height = h || 128;
    var c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = fg; c.lineWidth = Math.max(4, cv.height * 0.05); c.strokeRect(c.lineWidth, c.lineWidth, cv.width - c.lineWidth * 2, cv.height - c.lineWidth * 2);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    var lines = String(text).split('\n'), fs = size || Math.floor(cv.height * (lines.length > 1 ? 0.3 : 0.42));
    c.font = '900 ' + fs + 'px Impact, "Arial Black", sans-serif';
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i], s = fs;
      while (s > 10 && c.measureText(ln).width > cv.width * 0.88) { s -= 2; c.font = '900 ' + s + 'px Impact, "Arial Black", sans-serif'; }
      c.fillText(ln, cv.width / 2, cv.height / 2 + (i - (lines.length - 1) / 2) * fs * 1.1);
      c.font = '900 ' + fs + 'px Impact, "Arial Black", sans-serif';
    }
    var tex = new THREE.CanvasTexture(cv);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    TEX[key] = tex;
    return tex;
  }
  function sprite(text, bg, fg, sx, sy) {
    var sm = new THREE.SpriteMaterial({ map: labelTexture(text, bg, fg), transparent: true, depthWrite: false, depthTest: true, fog: false });
    var s = new THREE.Sprite(sm); s.scale.set(sx || 2.4, sy || 1.2, 1); s.renderOrder = 8;
    return s;
  }
  // a material made for one mesh (a label plate): disposed with it (the shared ones from mat() never are)
  function own(m) { m.userData.own = true; return m; }
  function sceneAdd(o) { var Rd = GTP.Render; if (Rd && Rd.scene && o) Rd.scene.add(o); return o; }
  function sceneRemove(o) {
    if (!o) return;
    if (o.parent) o.parent.remove(o);
    if (o.isSprite && o.material) o.material.dispose();
  }

  // ------------------------------------------------------- mesh builders --
  var G3 = function (r, g, b) { return [r, g, b]; };
  var GOLD = G3(0.86, 0.64, 0.16), GOLD_D = G3(0.55, 0.38, 0.08), WHITE = G3(0.93, 0.93, 0.92), GLASS = G3(0.42, 0.58, 0.72), DARK = G3(0.08, 0.08, 0.1);
  function builtMesh(build, m) {
    var GB = GTP.GeoBuilder, g = new GB({ color: true });
    if (m) m.vertexColors = true;
    build(g, GB);
    var mesh = new THREE.Mesh(g.build(), m || (GTP.Assets && GTP.Assets.propMaterial ? GTP.Assets.propMaterial() : mat(0xffffff)));
    mesh.castShadow = true; mesh.userData.ownGeo = true;
    return mesh;
  }
  var Meshes = {
    goldHeli: function () {
      var grp = new THREE.Group(), body = new THREE.Group();
      var hull = builtMesh(function (g, GB) {
        g.box(-1.1, -0.3, -2.4, 2.2, 1.8, 4.6, GB.UV0, GOLD);            // cabin, forward = -z
        g.box(-0.95, 0.25, -2.9, 1.9, 1.0, 1.0, GB.UV0, GLASS);           // canopy
        g.box(-1.12, 0.45, -0.9, 2.24, 0.32, 1.9, GB.UV0, WHITE);         // white stripe
        g.box(-0.26, 0.0, 2.2, 0.52, 0.55, 4.0, GB.UV0, GOLD);            // tail boom
        g.box(-0.08, 0.4, 5.6, 0.16, 1.5, 0.9, GB.UV0, GOLD_D);           // fin
        g.box(-0.35, 1.5, -0.35, 0.7, 0.4, 0.7, GB.UV0, DARK);            // mast
        g.box(-1.25, -1.1, -2.0, 0.14, 0.14, 4.0, GB.UV0, GOLD_D); g.box(1.11, -1.1, -2.0, 0.14, 0.14, 4.0, GB.UV0, GOLD_D);
        g.box(-1.2, -1.0, -1.2, 0.1, 0.75, 0.1, GB.UV0, GOLD_D); g.box(1.1, -1.0, -1.2, 0.1, 0.75, 0.1, GB.UV0, GOLD_D);
        g.box(-1.2, -1.0, 1.0, 0.1, 0.75, 0.1, GB.UV0, GOLD_D); g.box(1.1, -1.0, 1.0, 0.1, 0.75, 0.1, GB.UV0, GOLD_D);
        g.box(-0.5, 0.2, -1.9, 1.0, 0.7, 0.5, GB.UV0, G3(0.95, 0.85, 0.5));  // the passenger (a gold silhouette)
      });
      hull.material = mat(0xffffff, { metal: 0.75, rough: 0.28 });
      hull.material.vertexColors = true;
      var rotor = builtMesh(function (g, GB) { g.box(-5.4, 0, -0.16, 10.8, 0.08, 0.32, GB.UV0, DARK); g.box(-0.16, 0, -5.4, 0.32, 0.08, 10.8, GB.UV0, DARK); });
      rotor.position.set(0, 1.92, 0);
      var tail = builtMesh(function (g, GB) { g.box(-0.05, -0.8, -0.1, 0.1, 1.6, 0.2, GB.UV0, DARK); });
      tail.position.set(0.2, 0.95, 5.95);
      var sign = sprite('RATED 10/10', '#1a1406', '#ffd45a', 3.2, 0.9); sign.position.set(0, 3.1, 0);
      body.add(hull); body.add(rotor); body.add(tail); grp.add(body); grp.add(sign);
      grp.userData = { body: body, rotor: rotor, tail: tail, sign: sign };
      return grp;
    },
    spool: function () {
      var grp = new THREE.Group();
      var drum = builtMesh(function (g) {
        g.cylinder(0, -0.55, 0, 0.62, 0.62, 0.12, 12, GOLD); g.cylinder(0, -0.43, 0, 0.38, 0.38, 0.86, 12, G3(0.86, 0.12, 0.16)); g.cylinder(0, 0.43, 0, 0.62, 0.62, 0.12, 12, GOLD);
      });
      var ribbon = new THREE.Mesh(geo('box'), mat(0xd81f2a, { rough: 0.6 }));
      ribbon.scale.set(0.14, 1, 0.04);
      grp.add(drum); grp.add(ribbon);
      grp.userData = { drum: drum, ribbon: ribbon, up: new THREE.Vector3(0, 1, 0), dir: new THREE.Vector3() };
      return grp;
    },
    speaker: function () {
      var grp = new THREE.Group();
      grp.add(part('box', mat(0x141418, { rough: 0.8 }), 0, 1.5, 0, 1.6, 3.0, 1.2));
      var cone1 = part('cyl', mat(0x2c2c34, { rough: 0.4 }), 0, 2.2, -0.62, 0.5, 0.08, 0.5); cone1.rotation.x = Math.PI / 2;
      var cone2 = part('cyl', mat(0x2c2c34, { rough: 0.4 }), 0, 0.95, -0.62, 0.62, 0.08, 0.62); cone2.rotation.x = Math.PI / 2;
      var glow = part('box', mat(0xb04ad8, { glow: 0.2, rough: 0.3 }), 0, 2.95, -0.61, 1.5, 0.12, 0.04);
      grp.add(cone1); grp.add(cone2); grp.add(glow);
      grp.userData = { glow: glow };
      return grp;
    },
    dais: function () {
      var grp = new THREE.Group();
      grp.add(part('cyl', mat(0x5a1f5e, { rough: 0.7 }), 0, 0.12, 0, 3.4, 0.24, 3.4));
      for (var i = 0; i < 10; i++) {
        var a = i / 10 * TAU;
        grp.add(part('cyl', mat(0xc9a14a, { metal: 0.8, rough: 0.3 }), Math.cos(a) * 3.6, 0.5, Math.sin(a) * 3.6, 0.07, 1.0, 0.07));
      }
      var rope = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.07, 6, 40), mat(0x8e1a3a, { rough: 0.8 })); rope.rotation.x = Math.PI / 2; rope.position.y = 0.88; rope.userData.ownGeo = true;
      grp.add(rope);
      var sign = sprite('LISTENING SESSION\n(NOTHING PLAYS)', '#2a0a2e', '#e9b8ff', 3.6, 1.4); sign.position.set(0, 4.2, 0); grp.add(sign);
      return grp;
    },
    jet: function () {
      return builtMesh(function (g, GB) {
        var B = G3(0.24, 0.43, 0.81), Wt = G3(0.9, 0.92, 0.95);
        g.box(-0.9, -0.6, -7, 1.8, 1.4, 14, GB.UV0, B);          // fuselage
        g.box(-0.6, -0.2, -8.2, 1.2, 0.9, 1.4, GB.UV0, GLASS);   // nose
        g.box(-7, -0.15, -1, 14, 0.25, 4.2, GB.UV0, Wt);         // wings
        g.box(-2.8, 0.0, 5.2, 5.6, 0.2, 1.8, GB.UV0, Wt);        // tailplane
        g.box(-0.12, 0.6, 5, 0.24, 2.6, 2.0, GB.UV0, B);         // fin
      }, mat(0xffffff, { metal: 0.5, rough: 0.35 }));
    },
    podium: function (text, bg, fg) {
      var grp = new THREE.Group();
      grp.add(part('box', mat(0x2b2f3d, { rough: 0.6 }), 0, 0.6, 0, 1.2, 1.2, 0.7));
      var plate = new THREE.Mesh(geo('plane'), own(new THREE.MeshBasicMaterial({ map: labelTexture(text, bg || '#1a2a5a', fg || '#ffffff', 256, 128) })));
      plate.position.set(0, 0.7, -0.36); plate.rotation.y = Math.PI; plate.scale.set(1.1, 0.55, 1);
      grp.add(plate);
      grp.userData = { plate: plate };
      return grp;
    },
    flag: function () {
      var grp = new THREE.Group();
      grp.add(part('cyl', mat(0xcfd3da, { metal: 0.8, rough: 0.3 }), 0, 2.2, 0, 0.05, 4.4, 0.05));
      var f = new THREE.Mesh(geo('plane'), own(new THREE.MeshBasicMaterial({ map: labelTexture('BRAVADIA\nVOLUME IS POLICY', '#3d6fcf', '#ffffff', 256, 160), side: THREE.DoubleSide })));
      f.position.set(0.75, 3.8, 0); f.scale.set(1.5, 0.95, 1);
      grp.add(f);
      return grp;
    },
    balloon: function () {
      var grp = new THREE.Group(), env = new THREE.Group();
      var skin = part('sphere', mat(0xe6e8ea, { rough: 0.55 }), 0, 0, 0, 7, 7.6, 7);
      var band = part('cyl', mat(0x4c4c4c, { rough: 0.6 }), 0, 0, 0, 7.06, 1.4, 7.06);
      var logo = sprite('OVA\nWEATHER BALLOON\n(OFFICIALLY)', '#2b2b2b', '#e6e8ea', 5, 2.6); logo.position.set(0, 3.2, 0);
      env.add(skin); env.add(band); env.add(logo);
      var basket = part('box', mat(0x7a5a32, { rough: 0.9 }), 0, -10.4, 0, 2.2, 1.2, 2.2);
      var agent = part('box', mat(0x2b2b2b, { rough: 0.6 }), 0, -9.3, 0, 0.6, 1.2, 0.5);
      var rigging = new THREE.Group();
      for (var i = 0; i < 4; i++) {
        var a = i / 4 * TAU + Math.PI / 4, rr = part('box', mat(0x3a3a3a), Math.cos(a) * 1.6, -7.2, Math.sin(a) * 1.6, 0.05, 6.0, 0.05);
        rr.rotation.z = Math.cos(a) * 0.22; rr.rotation.x = -Math.sin(a) * 0.22; rigging.add(rr);
      }
      grp.add(env); grp.add(basket); grp.add(agent); grp.add(rigging);
      grp.userData = { env: env, basket: basket, agent: agent };
      return grp;
    },
    // b01's gold teleprompter on a stand: the glass faces the President, the back is a gold plate with his rating on it
    prompter: function () {
      var grp = new THREE.Group(), gold = mat(0xdba428, { metal: 0.7, rough: 0.3 });
      grp.add(part('cyl', gold, 0, 0.7, 0, 0.05, 1.4, 0.05)); grp.add(part('cyl', gold, 0, 0.03, 0, 0.32, 0.06, 0.32));
      var head = new THREE.Group(); head.position.set(0, 1.45, 0); head.rotation.x = -0.5;
      head.add(part('box', gold, 0, 0, 0, 0.95, 0.66, 0.06));
      var glass = new THREE.Mesh(geo('plane'), own(new THREE.MeshBasicMaterial({ map: labelTexture('YOU ARE\nA TEN', '#0d1a26', '#7fd8ff', 256, 160) })));
      glass.scale.set(0.85, 0.56, 1); glass.position.z = -0.035; glass.rotation.y = Math.PI; head.add(glass);
      var back = new THREE.Mesh(geo('plane'), own(new THREE.MeshBasicMaterial({ map: labelTexture('10/10', '#dba428', '#2b1d05', 256, 160) })));
      back.scale.set(0.85, 0.56, 1); back.position.z = 0.035; head.add(back);
      grp.add(head);
      grp.userData = { head: head };
      return grp;
    },
    tether: function () { return part('box', mat(0x25272b, { rough: 0.7 }), 0, 0, 0, 0.08, 1, 0.08); },
    patch: function () {
      var grp = new THREE.Group();
      var p = new THREE.Mesh(geo('plane'), own(new THREE.MeshBasicMaterial({ map: labelTexture('[REDACTED]', '#050505', '#ffffff', 256, 128), side: THREE.DoubleSide })));
      p.scale.set(3.0, 1.5, 1);
      var halo = new THREE.Mesh(geo('plane'), mat(0xff3b30, { basic: true, opacity: 0.35, side: THREE.DoubleSide })); halo.scale.set(3.6, 2.0, 1); halo.position.z = -0.02;
      grp.add(halo); grp.add(p);
      grp.userData = { plate: p, halo: halo };
      return grp;
    },
    table: function (text) {
      var grp = new THREE.Group();
      grp.add(part('box', mat(0xe9e6dc, { rough: 0.5 }), 0, 0.74, 0, 1.9, 0.07, 0.8));
      var leg = mat(0x6d7078, { metal: 0.6, rough: 0.4 });
      grp.add(part('box', leg, -0.8, 0.37, 0, 0.05, 0.74, 0.6)); grp.add(part('box', leg, 0.8, 0.37, 0, 0.05, 0.74, 0.6));
      if (text) {
        var s = new THREE.Mesh(geo('plane'), own(new THREE.MeshBasicMaterial({ map: labelTexture(text, '#111111', '#15e0ff', 256, 96), side: THREE.DoubleSide })));
        s.position.set(0, 0.45, -0.41); s.scale.set(1.7, 0.6, 1); grp.add(s);
      }
      return grp;
    },
    desk: function () {
      var grp = new THREE.Group();
      grp.add(part('box', mat(0x0f1d3a, { rough: 0.4, metal: 0.3 }), 0, 0.55, 0, 3.2, 1.1, 1.0));
      var s = new THREE.Mesh(geo('plane'), own(new THREE.MeshBasicMaterial({ map: labelTexture('BREAKING', '#c8102e', '#ffffff', 256, 96) })));
      s.position.set(0, 0.6, -0.51); s.rotation.y = Math.PI; s.scale.set(2.8, 0.7, 1); grp.add(s);
      return grp;
    },
    memoCard: function (text) {
      var grp = new THREE.Group();
      var p = new THREE.Mesh(geo('plane'), own(new THREE.MeshBasicMaterial({ map: labelTexture(text, '#fffbe8', '#c8102e', 256, 128), side: THREE.DoubleSide })));
      p.scale.set(1.8, 0.9, 1); grp.add(p);
      return grp;
    }
  };

  // ---------------------------------------------------------- telegraphs --
  // A telegraph is a ground decal that warns (flashing, `warn` seconds) and then strikes the player inside it.
  // shape 'circle' {r}, 'strip' {len, w, yaw}, 'ring' (an expanding band from r0 at `speed` up to maxR: jump it).
  // {dmg, knock, jumpable, hitsVehicles, color, label, onStrike(tele, hit), onDodge(tele), onPass(tele)}
  function Telegraph(enc, o) {
    Object.assign(this, { shape: 'circle', r: 3, len: 20, w: 4, yaw: 0, warn: 1.4, dmg: 12, knock: 6, jumpable: false, color: 0xff3b30, t: 0, done: false, struck: false, hit: false, dodged: false, linger: 0.35, speed: 8, band: 1.4, maxR: 14, r0: 0.8 }, o);
    this.enc = enc;
    this.y = groundY(this.x, this.z, o.yHint) + K.teleY;
    var m = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, fog: true });
    var mesh = new THREE.Mesh(geo(this.shape === 'ring' ? 'ring' : this.shape === 'strip' ? 'plane' : 'circle'), m);
    mesh.rotation.order = 'YXZ'; mesh.rotation.set(-Math.PI / 2, this.yaw || 0, 0); mesh.renderOrder = 4;
    mesh.position.set(this.x, this.y, this.z);
    if (this.shape === 'strip') mesh.scale.set(this.w, this.len, 1);
    else if (this.shape === 'ring') { this.rr = this.r0; mesh.scale.set(this.rr, this.rr, 1); }
    else mesh.scale.set(this.r, this.r, 1);
    // the outline of the full area (the ring's reach) stays faint the whole time
    if (this.shape !== 'ring') {
      var edge = new THREE.Mesh(geo(this.shape === 'strip' ? 'plane' : 'ring'), new THREE.MeshBasicMaterial({ color: this.edgeColor != null ? this.edgeColor : this.color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, wireframe: this.shape === 'strip' }));
      edge.position.z = 0.01; mesh.add(edge); this.edge = edge;
    } else {
      var reach = new THREE.Mesh(geo('ring'), new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
      reach.scale.set(this.maxR / this.r0, this.maxR / this.r0, 1); reach.position.z = -0.01; mesh.add(reach); this.edge = reach;
    }
    this.mesh = sceneAdd(mesh);
    if (this.label) textFx(this.label, this.x, this.y + 2.2, this.z, '#' + ('000000' + this.color.toString(16)).slice(-6), Math.min(2.2, this.warn + 0.5));
  }
  Telegraph.prototype.inside = function (px, pz) {
    var dx = px - this.x, dz = pz - this.z;
    if (this.shape === 'circle') return dx * dx + dz * dz <= (this.r + 0.35) * (this.r + 0.35);
    if (this.shape === 'strip') {
      var f = U.yawToDir(this.yaw), along = dx * f.x + dz * f.z, across = dx * -f.z + dz * f.x;
      return Math.abs(along) <= this.len / 2 && Math.abs(across) <= this.w / 2 + 0.35;
    }
    var d = Math.sqrt(dx * dx + dz * dz);
    return Math.abs(d - this.rr) <= this.band / 2 + 0.35;
  };
  Telegraph.prototype.strikePlayer = function () {
    var p = player(); if (!p || !p.alive || !(this.dmg > 0)) return false;   // a warning line (a charge's path) strikes nobody itself
    var v = p.inVehicle;
    if (Math.abs((v ? v.y : p.y) - this.y) > 4) return false;
    if (!this.inside(v ? v.x : p.x, v ? v.z : p.z)) return false;
    if (this.jumpable && airborne(p)) { this.dodged = true; if (this.onDodge) this.onDodge(this); textFx('DODGED', p.x, p.y + 2.1, p.z, '#9dff3c', 0.8); return false; }
    // a player a telegraph floored gets up before the next one counts (getUp plus a beat): stacked bars, rain and charges
    // chained knockdowns into a death on the combined build
    var enc = this.enc, now = simT();
    if (!v && (p.knockedDown || (enc && now < (enc._graceUntil || 0)))) return false;
    var src = enc && enc.ped && !enc.ped.removed ? enc.ped : null;
    if (v) v.applyDamage(this.dmg * 1.6, src, 'boss');
    else if (this.knock > 0) {
      var nx, nz;
      if (this.shape === 'strip') {
        // thrown out sideways, toward the nearer edge
        var f = U.yawToDir(this.yaw), rx = -f.z, rz = f.x, side = ((p.x - this.x) * rx + (p.z - this.z) * rz) >= 0 ? 1 : -1;
        nx = rx * side; nz = rz * side;
      } else { nx = p.x - this.x; nz = p.z - this.z; var l = Math.sqrt(nx * nx + nz * nz) || 1; nx /= l; nz /= l; }
      p.knockDown(nx * this.knock, nz * this.knock, this.dmg, src, 'boss');
      if (enc) enc._graceUntil = now + ((C.PED && C.PED.getUp) || 2.5) + 0.8;
    } else p.applyDamage(this.dmg, src, 'boss');
    this.hit = true;
    emit('boss:hit', { id: this.enc ? this.enc.id : null, dmg: this.dmg, shape: this.shape });
    shake(0.25);
    return true;
  };
  Telegraph.prototype.strikeVehicles = function () {
    var list = E().hash.query(this.x, this.z, Math.max(this.len || 0, this.r || 0, this.maxR || 0) + 4, []);
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.kind !== 'vehicle' || e.wreck || e.removed || e.hasPlayer()) continue;
      if (this.inside(e.x, e.z)) e.applyDamage(this.vehicleDmg || 60, player(), 'boss');
    }
  };
  Telegraph.prototype.update = function (dt) {
    if (this.done) return;
    this.t += dt;
    var m = this.mesh && this.mesh.material;
    if (this.follow && this.t < this.warn) this.follow(this, dt);
    if (this.mesh) this.mesh.position.set(this.x, this.y, this.z);
    if (this.shape === 'ring') {
      if (this.t < this.warn) { if (m) m.opacity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.t * 18)); return; }
      if (!this.struck) { this.struck = true; if (this.onStrike) this.onStrike(this, false); }
      this.rr += this.speed * dt;
      if (this.mesh) { this.mesh.scale.set(this.rr, this.rr, 1); if (this.edge) this.edge.scale.set(this.maxR / this.rr, this.maxR / this.rr, 1); }
      if (m) m.opacity = 0.75;
      if (!this.hit && !this.dodged) this.strikePlayer();
      if (this.rr >= this.maxR) { this.done = true; if (this.onPass) this.onPass(this); }
      return;
    }
    if (this.t < this.warn) {
      var k = this.t / this.warn, rate = 6 + 14 * k;
      if (m) m.opacity = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(this.t * rate)) + 0.2 * k;
      return;
    }
    if (!this.struck) {
      this.struck = true;
      var hit = this.strikePlayer();
      if (this.hitsVehicles) this.strikeVehicles();
      if (this.onStrike) this.onStrike(this, hit);
      if (m) { m.color.setHex(0xffffff); m.opacity = 0.85; }
    }
    if (m) m.opacity = Math.max(0, m.opacity - dt * 2.4);
    if (this.t >= this.warn + this.linger) this.done = true;
  };
  Telegraph.prototype.dispose = function () {
    if (!this.mesh) return;
    sceneRemove(this.mesh);
    this.mesh.material.dispose();
    if (this.edge) this.edge.material.dispose();
    this.mesh = null;
  };

  // --------------------------------------------------------------- parts --
  // A boss weak point (a ribbon spool, a speaker, the redacted patch, a talking point): kind 'heli' so the existing hitscan,
  // the lock-on and the blasts reach it (Combat's trace takes a 3.4 m sphere around it). Not a vehicle, never a crime.
  class BossPart extends GTP.Entity {
    constructor(enc, o) {
      super({ kind: 'heli', x: o.x, y: o.y, z: o.z, radius: o.radius || 1.2, height: o.height || 1.6, hp: o.hp || 50, persistent: true });
      this.boss = enc; this.bossPart = o.kind || 'part'; this.label = o.label || 'WEAK POINT';
      // the lock-on ranks hostiles first (Combat's hostileRole reads `hostile`): a weak point competes with the goons around it
      this.hostile = true;
      this.down = false; this.leaving = false; this.invuln = false; this.invulnText = o.invulnText || 'NO EFFECT';
      this.onBreak = o.onBreak || null; this.onHit = o.onHit || null; this.follow = o.follow || null; this.data = o.data || {};
      this.flashT = 0; this.noteT = 0;
      this.mesh = o.mesh || null;
    }
    applyDamage(n, src, type) {
      if (this.down || this.removed || !(n > 0)) return 0;
      if (!fromPlayer(src)) return 0;
      if (this.invuln || !this.boss || this.boss.state !== 'fight') {
        if (simT() - this.noteT > 0.5) { this.noteT = simT(); textFx(this.invulnText, this.x, this.y + 1.6, this.z, '#bfbfbf', 0.7); }
        return 0;
      }
      this.hp -= n; this.flashT = 0.12; this.lastHitBy = src || null;
      if (this.onHit) { try { this.onHit(this, n, src, type); } catch (e) { U.reportError(e, 'bosses.part.hit'); } }
      if (this.hp <= 0) this.breakPart(src);
      return n;
    }
    breakPart(src) {
      if (this.down) return;
      this.hp = 0; this.down = true;
      fx({ type: 'explosion', x: this.x, y: this.y, z: this.z, size: 2.6, life: 0.35, color: 0xffd45a });
      for (var i = 0; i < 8; i++) fx({ type: 'spark', x: this.x, y: this.y, z: this.z, vx: (i % 4 - 1.5) * 3, vy: 3 + (i % 3), vz: ((i * 7) % 5 - 2) * 2.5, size: 0.35, life: 0.6, color: 0xffd45a });
      sfx('explode', this.x, this.z, 0.5);
      if (this.boss) this.boss.partBroken(this);
      if (this.onBreak) { try { this.onBreak(this, src); } catch (e) { U.reportError(e, 'bosses.part.break'); } }
      E().remove(this); disposeOwn(this.mesh);
    }
    update(dt) {
      this.age += dt;
      if (this.flashT > 0) this.flashT -= dt;
      if (this.follow) { try { this.follow(this, dt); } catch (e) { U.reportError(e, 'bosses.part.follow'); } }
    }
    syncMesh(alpha) {
      var m = this.mesh; if (!m) return;
      var a = alpha == null ? 1 : alpha;
      m.position.set(this._px + (this.x - this._px) * a, this._py + (this.y - this._py) * a, this._pz + (this.z - this._pz) * a);
      m.rotation.y = this.yaw;
      var s = this.flashT > 0 ? 1.18 : 1; m.scale.set(s, s, s);
      if (this.sync) this.sync(this, m);
      m.visible = !this.removed;
    }
  }
  // scenery that moves with the fight (the helicopter, the jet, the balloon, tables, podiums): never hit, never solid
  class BossRig extends GTP.Entity {
    constructor(o) {
      super({ kind: 'bossrig', x: o.x, y: o.y, z: o.z, persistent: true });
      this.mesh = o.mesh; this.tick = o.tick || null; this.sync = o.sync || null; this.data = o.data || {};
      this.yaw = o.yaw || 0; this.snap();
    }
    update(dt) { this.age += dt; if (this.tick) { try { this.tick(this, dt); } catch (e) { U.reportError(e, 'bosses.rig'); } } }
    syncMesh(alpha) {
      GTP.Entity.prototype.syncMesh.call(this, alpha);
      if (this.sync && this.mesh) this.sync(this, this.mesh, alpha);
    }
  }

  // ------------------------------------------------------------- brains --
  function hostileBrain(role) {
    return { phase: 0.5, mode: 'mission', mission: 'hostile', ambient: false, barkT: 3 + (role.length % 4), shotT: 1.4, stuckT: 0, sideT: 0, side: 1, repathT: 0, path: null, pi: 0, pauseT: 0, stucks: 0, role: role, ctx: null, stationary: false, passive: false };
  }
  function rollLook(role, x, z, extra) {
    var CW = GTP.Content && GTP.Content.world, dd = W().districtAt(x, z), look = null;
    try { look = CW && CW.spawn && CW.spawn.peds && CW.spawn.peds.rollLook ? CW.spawn.peds.rollLook(dd ? dd.id : 'downtown', role) : null; } catch (e) { look = null; }
    look = look || { skin: 2, hair: 'short', shirt: '#6a8fcf', pants: '#2a2f4a' };
    if (extra) Object.assign(look, extra);
    return look;
  }
  function newPed(o) {
    var p = new GTP.Ped({ x: o.x, z: o.z, look: o.look, role: o.role || 'npc', persistent: true, weapon: o.weapon || 'fist' });
    p.y = groundY(o.x, o.z, o.yHint || 0); p.yaw = o.yaw || 0; p.snap();
    if (o.weapon && p.weapons) { p.weapons[o.weapon] = Infinity; }
    p.weapon = o.weapon || 'fist';
    if (o.hp) { p.maxHp = o.hp; p.hp = o.hp; }
    if (o.castId) { p.castId = o.castId; p.name = castName(o.castId); }
    p.ai = o.ai || { phase: 0.5, mode: 'mission', mission: 'boss', ambient: false };
    E().add(p);
    return p;
  }
  // drive a vehicle toward (tx, tz) at up to `top` m/s (the driver must sit in it: controls only count with a living driver)
  function steerTo(v, tx, tz, top) {
    if (!v || v.wreck || v.removed || !v.driver) return 0;
    var want = U.dirToYaw(tx - v.x, tz - v.z), err = U.wrapAngle(want - v.yaw), d = U.dist2d(v.x, v.z, tx, tz);
    var steer = U.clamp(-err * 2.2, -1, 1), sp = v.speed;
    var throttle = sp < top ? 1 : 0, brake = (sp > top + 2 || (Math.abs(err) > 1.3 && sp > 8)) ? 0.6 : 0;
    if (Math.abs(err) > 2.4 && sp < 3) { throttle = -0.6; steer = -steer; }
    v.setControls(throttle, steer, false, brake);
    return d;
  }

  // ------------------------------------------------------------ encounter --
  var active = [];      // live encounters
  var resume = null;    // {missionId, bossId, phase, hp}: the phase checkpoint for RETRY
  var pendingResume = null;

  function Encounter(def, opts) {
    opts = opts || {};
    this.id = def.id; this.def = def; this.name = def.name; this.castId = def.cast; this.color = castColor(def.cast);
    this.opts = opts; this.mission = !!opts.mission;
    this.rng = GTP.rng.fork(0xB055 + U.hash(def.id));
    this.maxHp = def.maxHp; this.hp = def.maxHp; this.phases = def.thresholds.length; this.phase = 0;
    this.state = 'intro'; this.t = 0; this.phaseT = 0; this.stateT = 0; this.shield = false; this.shieldText = def.shieldText || 'NO EFFECT';
    this.vuln = 1; this.ped = null; this.parts = []; this.adds = []; this.vehicles = []; this.tele = []; this.rigs = []; this.objs = []; this.pickups = []; this.peds = [];
    this.timers = {}; this.data = {}; this.lastEmit = -9; this.leashT = 0; this.failReason = null; this.hint = ''; this.log = [];
    this.shieldNoteT = -9; this.windowDmg = 0;
    this.playerRef = player();
    var c = opts.at ? { x: opts.at.x, z: opts.at.z } : resolveArena(def);
    this.center = { x: c.x, z: c.z, y: groundY(c.x, c.z, 0) };
  }
  function resolveArena(def) {
    var Wd = W(), a = def.arena || {}, lm = a.landmark ? Wd.landmark(a.landmark) : null;
    var base = lm ? (a.point && lm.points && lm.points[a.point] ? lm.points[a.point] : (lm.door || { x: lm.x, z: lm.z })) : (player() || { x: 0, z: 0 });
    var x = base.x + ((a.offset && a.offset.x) || 0), z = base.z + ((a.offset && a.offset.z) || 0);
    if (Wd.solidAt(x, z, 0.5)) { var sp = Wd.nearestSidewalkPoint(x, z); if (sp) { x = sp.x; z = sp.z; } }
    return { x: x, z: z };
  }
  var EP = Encounter.prototype;
  EP.at = function (dx, dz) { return { x: this.center.x + dx, z: this.center.z + dz, y: groundY(this.center.x + dx, this.center.z + dz, this.center.y) }; };
  EP.every = function (key, interval, dt, fn) {
    var t = this.timers[key] == null ? interval * 0.5 : this.timers[key];
    t -= dt;
    if (t <= 0) { t += interval; try { fn.call(this); } catch (e) { U.reportError(e, 'bosses.' + this.id + '.' + key); } }
    this.timers[key] = t;
  };
  EP.addTele = function (o) { var t = new Telegraph(this, o); this.tele.push(t); return t; };
  EP.clearTele = function () { for (var i = 0; i < this.tele.length; i++) this.tele[i].dispose(); this.tele.length = 0; };
  EP.addRig = function (o) { var r = new BossRig(o); E().add(r); this.rigs.push(r); return r; };
  EP.addObj = function (o) { sceneAdd(o); this.objs.push(o); return o; };
  EP.addPart = function (o) { var p = new BossPart(this, o); p.snap(); E().add(p); this.parts.push(p); return p; };
  EP.liveParts = function (kind) { var n = 0; for (var i = 0; i < this.parts.length; i++) { var p = this.parts[i]; if (!p.down && !p.removed && (!kind || p.bossPart === kind)) n++; } return n; };
  EP.partBroken = function (pt) { this.log.push({ t: this.t, ev: 'break', kind: pt.bossPart }); if (this.def.partBroken) this.def.partBroken(this, pt); };
  EP.spawnAdd = function (role, x, z, o) {
    o = o || {};
    var look = o.look ? Object.assign(rollLook(o.lookRole || role, x, z), o.look) : (o.castId && castOf(o.castId) ? Object.assign({}, castOf(o.castId).look) : rollLook(o.lookRole || role, x, z));
    var weapon = o.weapon || (role === 'cop' ? 'pistol' : 'fist'), WP = GTP.Combat && GTP.Combat.WEAPONS, melee = !WP || !WP[weapon] || !!WP[weapon].melee;
    // ranged goons use the missions' hostile brain; brawlers get this file's (a wind-up before every swing, a breather after)
    var brain = melee ? this.brawlerBrain(role) : hostileBrain(role);
    var p = newPed({ x: x, z: z, look: look, role: role, weapon: weapon, hp: o.hp, ai: brain, castId: o.castId, yaw: U.dirToYaw(this.center.x - x, this.center.z - z) });
    p.hostile = true; p.aimTarget = player(); p.bossAdd = this.id; if (o.name) p.name = o.name;
    this.adds.push(p);
    fx({ type: 'puff', x: x, y: p.y + 0.6, z: z, size: 1.4, life: 0.5, color: 0xe0e0e0 });
    return p;
  };
  EP.brawlerBrain = function (role) { return { phase: 0.5, mode: 'mission', mission: 'bossadd', ambient: false, role: role, swingT: 0, cool: this.rng.range(0.5, 1.5), barkT: this.rng.range(3, 8), stuckT: 0, side: 1, sideT: 0 }; };
  EP.spawnAdds = function (role, n, rMin, rMax, o) {
    var out = [];
    for (var i = 0; i < n; i++) { var s = spotNear(this.rng, this.center.x, this.center.z, rMin || 12, rMax || 22); out.push(this.spawnAdd(role, s.x, s.z, o)); }
    return out;
  };
  EP.tickAdds = function (dt) {
    for (var i = 0; i < this.adds.length; i++) { var a = this.adds[i]; if (a.ai && a.ai.mission === 'bossadd' && !a.removed) brawlerTick(this, a, a.ai, dt); }
  };
  EP.liveAdds = function () {
    var n = 0;
    for (var i = 0; i < this.adds.length; i++) {
      var p = this.adds[i];
      if (pedOut(p)) continue;
      // a goon on the ropes gives up and runs (Missions' defeat rule)
      if (p.knockedDown && p.hp < p.maxHp * 0.35) { releasePed(p, true); p.fled = true; continue; }
      n++;
    }
    return n;
  };
  EP.addPed = function (castId, x, z, o) {
    o = o || {};
    var cast = castOf(castId), look = cast && cast.look ? Object.assign({}, cast.look) : rollLook('npc', x, z);
    if (o.look) Object.assign(look, o.look);
    var p = newPed({ x: x, z: z, look: look, role: o.role || 'boss', weapon: o.weapon || 'fist', castId: castId, yaw: o.yaw || 0 });
    if (o.boss) this.bindBoss(p); else { p.godMode = true; p.bossCast = this.id; }
    this.peds.push(p);
    return p;
  };
  // the boss ped: its damage goes into the encounter's pool; the ped itself never dies
  EP.bindBoss = function (p) {
    var enc = this;
    p.maxHp = p.hp = 100000; p.hostile = true; p.boss = enc; p.bossId = enc.id;
    p.applyDamage = function (n, src, type) {
      if (!this.alive || !(n > 0)) return 0;
      // a boss the fight never hits directly (def.pedProof): the hit is a note pointing at what does take damage
      if (enc.def.pedProof) { if (enc.state === 'fight' && simT() - enc.shieldNoteT > 0.8) { enc.shieldNoteT = simT(); textFx(enc.def.pedProof, this.x, this.y + 2.3, this.z, '#d0d0d0', 0.9); } return 0; }
      this.lastHitBy = src || null; this.lastHitType = type || null; this.hurtT = 0.25;
      var d = enc.damageBoss(n, src, type, this);
      GTP.Events.emit('damage', { target: this, amount: d, src: src || null, type: type || null, boss: enc.id });
      return d;
    };
    this.ped = p;
    return p;
  };
  EP.damageBoss = function (n, src, type) {
    if (this.state !== 'fight' || !(n > 0)) return 0;
    var pl = player();
    if (src && src !== pl && !src.ally && !(pl && (src.driver === pl || src.owner === pl))) return 0;
    if (this.shield) {
      if (simT() - this.shieldNoteT > 0.6 && this.ped) { this.shieldNoteT = simT(); textFx(this.shieldText, this.ped.x, this.ped.y + 2.3, this.ped.z, '#d0d0d0', 0.9); }
      if (this.def.onShieldHit) this.def.onShieldHit(this, n, src, type);
      return 0;
    }
    var d = n * (this.def.dmgScale || 1) * this.vuln;
    d = Math.min(d, this.maxHp * K.hitCap);
    if (this.def.windowCap && (!this.def.capPhases || this.def.capPhases.indexOf(this.phase) >= 0) && this.windowDmg + d > this.def.windowCap) d = Math.max(0, this.def.windowCap - this.windowDmg);
    if (d <= 0) return 0;
    this.windowDmg += d;
    return this.hurt(d);
  };
  // the encounter's hp drops; a threshold crossed ends the phase
  EP.hurt = function (d) {
    if (this.state !== 'fight') return 0;
    var floor = this.def.thresholds[this.phase - 1];
    this.hp = Math.max(floor, this.hp - d);
    this.emitPhase(false);
    if (this.hp <= floor + 1e-6) this.endPhase();
    return d;
  };
  EP.emitPhase = function (force) {
    var now = simT();
    if (!force && now - this.lastEmit < 0.1) { this._pendingEmit = true; return; }
    this.lastEmit = now; this._pendingEmit = false;
    emit('boss:phase', { id: this.id, phase: this.phase, phases: this.phases, hp: Math.round(this.hp), maxHp: this.maxHp, name: this.name, shield: this.shield, shieldText: this.shield ? this.shieldText : null, state: this.state, hint: this.hint });
  };
  EP.bark = function (text, who) {
    who = who || this.castId;
    var sp = this.ped && !this.ped.removed && this.ped.castId === who ? this.ped : null;
    for (var i = 0; !sp && i < this.peds.length; i++) if (this.peds[i].castId === who && !this.peds[i].removed) sp = this.peds[i];
    if (sp && GTP.AI && GTP.AI.say) GTP.AI.say(sp, text, castColor(who));
    else { var at = this.barkAt ? this.barkAt() : this.center; textFx(text, at.x, (at.y || this.center.y) + 3, at.z, castColor(who), 2.4); }
    emit('boss:bark', { id: this.id, who: who, text: text });
  };
  EP.randomBark = function (key) {
    var pool = this.def.barks && this.def.barks[key || 'fight']; if (!pool || !pool.length) return;
    this.bark(pool[this.rng.int(0, pool.length - 1)]);
  };
  // phase lines through the mission dialogue queue (the fight pauses while they show); barks when the queue is not there
  EP.say = function (lines, done) {
    var M = GTP.Missions, self = this;
    if (this.state === 'ended') return;
    if (!lines || !lines.length) { if (done) done(); return; }
    if (M && M.say && !(M.dialogue && M.dialogue.active)) {
      this.talking = true;
      M.say(lines, function () { self.talking = false; if (done) done(); });
      if (!(M.dialogue && M.dialogue.active)) { this.talking = false; }
      return;
    }
    for (var i = 0; i < lines.length; i++) if (!lines[i].ticker) this.bark(lines[i].text, lines[i].who);
    if (done) done();
  };
  EP.supplies = function () {
    var CB = GTP.Combat, p = player(); if (!CB || !CB.spawnPickup || !p) return;
    for (var i = 0; i < this.pickups.length; i++) if (!this.pickups[i].removed) E().remove(this.pickups[i]);
    this.pickups.length = 0;
    var s = spotNear(this.rng, this.center.x, this.center.z, 6, 12), w = 'pistol';
    var WP = CB.WEAPONS || {};
    if (p.weapon && WP[p.weapon] && !WP[p.weapon].melee && WP[p.weapon].mag) w = p.weapon;
    try {
      this.pickups.push(CB.spawnPickup({ type: 'health', value: K.supplyHp, x: s.x, z: s.z, persistent: true }));
      var s2 = spotNear(this.rng, this.center.x, this.center.z, 6, 12);
      if (!this.def.noGuns) this.pickups.push(CB.spawnPickup({ type: 'weapon', weaponId: w, ammo: K.supplyAmmo, x: s2.x, z: s2.z, persistent: true, label: 'BOSS FIGHT' }));
      if (this.phase >= 2) { var s3 = spotNear(this.rng, this.center.x, this.center.z, 6, 12); this.pickups.push(CB.spawnPickup({ type: 'armor', value: 50, x: s3.x, z: s3.z, persistent: true })); }
    } catch (e) { U.reportError(e, 'bosses.supplies'); }
  };
  EP.start = function () {
    var self = this, from = 1;
    this.data = {};
    if (pendingResume && pendingResume.bossId === this.id) { from = Math.max(1, Math.min(this.phases, pendingResume.phase)); this.hp = from > 1 ? this.def.thresholds[from - 2] : this.maxHp; this.resumed = from; }
    pendingResume = null;
    // a set piece starts clean: stars and the heat under the first star (a stray round from the last fight's defeat beat)
    var wd = GTP.AI && GTP.AI.wanted; if (wd && wd.clear && (wd.level > 0 || wd.heat > 0)) { try { wd.clear(); } catch (e) { U.reportError(e, 'bosses.wanted'); } }
    try { if (this.def.setup) this.def.setup(this); } catch (e) { U.reportError(e, 'bosses.setup ' + this.id); }
    emit('boss:start', { id: this.id, name: this.name, phases: this.phases, resumed: this.resumed || 0 });
    sfx('mission', this.center.x, this.center.z, 0.8);
    var intro = from > 1 ? (this.def.lines['p' + from] || []) : (this.def.lines.intro || []);
    this._intro = function () { self.state = 'intro'; self.stateT = 0; self.hint = ''; self.say(intro, function () { self.beginPhase(from); }); };
    var p = player();
    // a mission can hand over the fight before the player is there (an approach objective that ends at a door, or none):
    // the set waits for them instead of failing the leash on the way in
    if (this.mission && p && U.dist2d(p.x, p.z, this.center.x, this.center.z) > K.arrive) {
      this.state = 'approach'; this.stateT = 0;
      this.hint = 'Get to ' + (this.def.place || 'the fight') + ': ' + this.name + ' is waiting';
    } else { var f = this._intro; this._intro = null; f(); }
  };
  EP.beginPhase = function (n) {
    if (this.state === 'ended' || this.state === 'defeated' || this.state === 'done') return;
    this.phase = n; this.phaseT = 0; this.state = 'fight'; this.timers = {}; this.windowDmg = 0; this.vuln = 1;
    this.hint = (this.def.hints && this.def.hints[n - 1]) || '';
    try { if (this.def.phase) this.def.phase(this, n); } catch (e) { U.reportError(e, 'bosses.phase ' + this.id); }
    this.supplies();
    this.checkpoint();
    this.emitPhase(true);
    sfx('debate', this.center.x, this.center.z, 0.6);
    // the ui's own bar announces a new phase (PHASE n, from boss:phase); without it, a banner
    var Rd = GTP.UI; if (Rd && Rd.banner && n > 1 && !uiDrawsBar()) { try { Rd.banner(this.name.toUpperCase(), 'PHASE ' + n + ' / ' + this.phases); } catch (e) { /* ui optional */ } }
  };
  // RETRY resumes at this phase: the mission checkpoint is refreshed with the player as they are now (topped up a little)
  EP.checkpoint = function () {
    if (!this.mission) return;
    var M = GTP.Missions, run = M && M.debug && M.debug.run ? M.debug.run() : null;
    resume = { missionId: run ? run.id : null, bossId: this.id, phase: this.phase, hp: this.hp };
    if (M && typeof M.checkpoint === 'function') { try { M.checkpoint({ bossId: this.id, phase: this.phase }); } catch (e) { U.reportError(e, 'bosses.checkpoint'); } }
    var p = player(), cp = run && run.checkpoint;
    if (!cp || !cp.player || !p || this.phase <= 1) return;
    cp.player.x = p.x; cp.player.z = p.z; cp.player.y = p.y; cp.player.yaw = p.yaw;
    cp.player.hp = Math.max(p.hp, p.maxHp * 0.75); cp.player.armor = p.armor || 0; cp.player.weapon = p.weapon;
    cp.player.weapons = Object.assign({}, p.weapons);
    if (p.ammo) { var a = {}; for (var k in p.ammo) a[k] = { mag: p.ammo[k].mag, reserve: p.ammo[k].reserve, total: p.ammo[k].total }; cp.player.ammo = a; }
    cp.vehicle = null; cp.bossPhase = this.phase;
  };
  // nobody steers between phases or after the fight: every boss vehicle brakes where it is
  EP.parkVehicles = function () {
    for (var i = 0; i < this.vehicles.length; i++) { var v = this.vehicles[i]; if (!v.removed && !v.wreck && !v.hasPlayer()) v.setControls(0, 0, false, 1); }
  };
  EP.endPhase = function () {
    if (this.state !== 'fight') return;
    var self = this;
    this.clearTele(); this.parkVehicles();
    if (this.def.phaseEnd) { try { this.def.phaseEnd(this, this.phase); } catch (e) { U.reportError(e, 'bosses.phaseEnd'); } }
    if (this.phase >= this.phases) { this.defeat(); return; }
    this.state = 'break'; this.stateT = 0;
    this.emitPhase(true);
    textFx('PHASE ' + this.phase + ' CLEAR', this.center.x, this.center.y + 3, this.center.z, '#9dff3c', 1.6);
    this._next = function () { self.say(self.def.lines['p' + (self.phase + 1)] || [], function () { self.beginPhase(self.phase + 1); }); };
  };
  EP.defeat = function () {
    var self = this;
    this.state = 'defeated'; this.stateT = 0; this.hp = 0; this.shield = false;
    this.clearTele();
    for (var i = 0; i < this.parts.length; i++) if (!this.parts[i].removed) { E().remove(this.parts[i]); disposeOwn(this.parts[i].mesh); }
    for (i = 0; i < this.adds.length; i++) if (!pedOut(this.adds[i])) releasePed(this.adds[i], true);
    this.parkVehicles();
    try { if (this.def.defeat) this.def.defeat(this); } catch (e) { U.reportError(e, 'bosses.defeat ' + this.id); }
    if (this.ped && !this.ped.removed) humiliate(this, this.ped);
    this.emitPhase(true);
    emit('boss:defeated', { id: this.id, name: this.name });
    var p = player(); if (p && p.stats) p.stats.bossesDefeated = (p.stats.bossesDefeated || 0) + 1;
    var fl = flags(); if (fl) fl['boss_' + this.id] = true;
    sfx('mission', this.center.x, this.center.z, 1);
    if (GTP.game && GTP.game.timeScale === 1 && !GTP.game.headless) { GTP.game.timeScale = 0.45; this._slowmo = 1.2; }
    var at = this.ped && !this.ped.removed ? this.ped : this.center;
    textFx('RATIO\'D', at.x, (at.y || 0) + 3.2, at.z, '#ff3fa4', 3);
    if (GTP.UI && GTP.UI.ticker && this.def.ticker) { try { GTP.UI.ticker(this.def.ticker); } catch (e) { /* ui optional */ } }
    this._next = null;
    // the lines start once the defeat slow motion is over (they pause the world, which would hold it at 0.45x)
    this._defeatLines = function () { self.say(self.def.lines.defeat || [], function () { self.state = 'done'; self.stateT = 0; }); };
  };
  EP.target = function () {
    var p = player(); if (!p) return null;
    if (this.state === 'approach') return { x: this.center.x, y: this.center.y, z: this.center.z, entity: null };
    var t = this.def.target ? this.def.target(this) : null;
    if (!t && this.ped && !this.ped.removed) t = this.ped;
    if (!t) return null;
    return { x: t.x, y: t.y || 0, z: t.z, entity: t.kind ? t : null };
  };
  EP.update = function (dt) {
    this.t += dt; this.stateT += dt;
    if (this._slowmo > 0) { this._slowmo -= dt; if (this._slowmo <= 0 && GTP.game && GTP.game.timeScale < 1) GTP.game.timeScale = 1; }
    if (this._pendingEmit && simT() - this.lastEmit >= 0.1) this.emitPhase(true);
    // a strike can end the fight under this loop (the player down, the mission failed): walk a copy, stop once ended
    var tl, list = this.tele.slice(), i;
    for (i = 0; i < list.length && this.state !== 'ended'; i++) { tl = list[i]; tl.update(dt); if (tl.done) { tl.dispose(); var k = this.tele.indexOf(tl); if (k >= 0) this.tele.splice(k, 1); } }
    if (this.state === 'ended') return;
    for (i = this.parts.length - 1; i >= 0; i--) if (this.parts[i].removed) this.parts.splice(i, 1);
    var p = player();
    if (this.def.noGuns && p && (this.state === 'intro' || this.state === 'fight' || this.state === 'break')) holster(this, p);
    if (this.state === 'fight' || this.state === 'break') this.tickAdds(dt);
    if (this.state === 'fight') {
      this.phaseT += dt;
      try { if (this.def.update) this.def.update(this, dt); } catch (e) { U.reportError(e, 'bosses.update ' + this.id); }
      if (this.state === 'ended') return;
      // the leash: walking away from a boss fight ends it
      if (p && U.dist2d(p.x, p.z, this.center.x, this.center.z) > (this.def.leash || K.leash)) {
        this.leashT += dt;
        if (this.leashT > 2 && Math.floor(this.leashT) !== Math.floor(this.leashT - dt)) toast('Get back to the fight');
        if (this.leashT >= K.leashTime) { this.failReason = this.def.escapeText || 'You left the fight. The fight posted about it.'; this.state = 'failed'; }
      } else this.leashT = 0;
    } else if (this.state === 'approach') {
      if (p && U.dist2d(p.x, p.z, this.center.x, this.center.z) <= K.arrive && this._intro) { var go = this._intro; this._intro = null; go(); }
    } else if (this.state === 'break') {
      if (this.stateT >= K.breakTime && this._next) { var nx = this._next; this._next = null; nx(); }
    } else if (this.state === 'defeated' || this.state === 'done') {
      if (this._defeatLines && !(this._slowmo > 0)) { var dl = this._defeatLines; this._defeatLines = null; dl(); }
      if (this.def.after) { try { this.def.after(this, dt); } catch (e) { U.reportError(e, 'bosses.after'); } }
      if (this.ped && !this.ped.removed && this.state === 'done') walkOff(this, this.ped, dt);
    }
    if (!this.mission && p && !p.alive && this.state !== 'ended') this.end('player_dead');
  };
  EP.end = function (reason) {
    if (this.state === 'ended') return;
    var keep = reason === 'complete';
    this.clearTele();
    var i, peds = this.peds.slice();
    if (this.ped && peds.indexOf(this.ped) < 0) peds.push(this.ped);
    for (i = 0; i < this.parts.length; i++) if (!this.parts[i].removed) { E().remove(this.parts[i]); disposeOwn(this.parts[i].mesh); }
    for (i = 0; i < this.adds.length; i++) { var a = this.adds[i]; if (!a.removed) { if (keep && a.alive) releasePed(a, true); else removeEntity(a); } }
    for (i = 0; i < this.vehicles.length; i++) {
      var v = this.vehicles[i]; if (v.removed) continue;
      if (v.hasPlayer() || (keep && (v.wreck || v.burning))) { v.persistent = false; v.tag = null; }   // the player's ride (a carjacked scooter) and the won fight's wrecks become ordinary city vehicles
      else removeEntity(v);
    }
    for (i = 0; i < this.pickups.length; i++) if (!this.pickups[i].removed) E().remove(this.pickups[i]);
    // a won fight leaves the set and the humiliated cast standing for the outro (they walk off or clear later)
    if (keep) leftovers.push({ enc: this, t: 0, rigs: this.rigs, objs: this.objs, peds: peds });
    else clearLeftover({ enc: this, rigs: this.rigs, objs: this.objs, peds: peds });
    try { if (this.def.cleanup) this.def.cleanup(this); } catch (e) { U.reportError(e, 'bosses.cleanup'); }
    if (this._slowmo > 0 && GTP.game && GTP.game.timeScale < 1) GTP.game.timeScale = 1;
    this.parts = []; this.rigs = []; this.objs = []; this.adds = []; this.vehicles = []; this.peds = []; this.pickups = [];
    this.state = 'ended'; this.endReason = reason || 'end';
    var k = active.indexOf(this); if (k >= 0) active.splice(k, 1);
    Bosses.active = active[0] || null;
    emit('boss:end', { id: this.id, reason: reason || 'end' });
    uiDropBar(this.id);
  };
  EP.hud = function () {
    return { id: this.id, name: this.name, castId: this.castId, color: this.color, phase: this.phase, phases: this.phases, hp: this.hp, maxHp: this.maxHp, shield: this.shield, shieldText: this.shieldText, state: this.state, hint: this.hint, card: this.data.card || null, telegraphs: this.tele.length };
  };
  var leftovers = [];
  function clearLeftover(l) {
    var i;
    for (i = 0; i < l.rigs.length; i++) if (!l.rigs[i].removed) { disposeOwn(l.rigs[i].mesh); E().remove(l.rigs[i]); }
    for (i = 0; i < l.objs.length; i++) { sceneRemove(l.objs[i]); disposeOwn(l.objs[i]); }
    for (i = 0; i < l.peds.length; i++) removeEntity(l.peds[i]);
    if (l.enc && l.enc.data && l.enc.data.sign) { sceneRemove(l.enc.data.sign); l.enc.data.sign = null; }
  }
  function tickLeftovers(dt) {
    var p = player();
    for (var i = leftovers.length - 1; i >= 0; i--) {
      var l = leftovers[i]; l.t += dt;
      var ped = l.enc.ped;
      if (ped && !ped.removed && ped.humiliated) walkOff(l.enc, ped, dt);
      for (var k = 0; k < l.peds.length; k++) { var q = l.peds[k]; if (q !== ped && !q.removed) standFacing(q, dt); }
      if (l.t > 40 || (p && U.dist2d(p.x, p.z, l.enc.center.x, l.enc.center.z) > 180)) { clearLeftover(l); leftovers.splice(i, 1); }
    }
  }
  function disposeOwn(o) {
    if (!o) return;
    o.traverse(function (n) {
      if (n.userData && n.userData.ownGeo && n.geometry) n.geometry.dispose();
      if (n.material && (n.isSprite || (n.material.userData && n.material.userData.own))) n.material.dispose();
    });
  }
  function removeEntity(e) {
    if (!e || e.removed) return;
    if (e.kind === 'vehicle') { var occ = e.occupants(); for (var i = 0; i < occ.length; i++) { if (occ[i].kind === 'player') e.exit(occ[i]); else { occ[i].inVehicle = null; occ[i].removed = true; E().remove(occ[i]); } } }
    else if (e.kind === 'ped' && e.inVehicle) e.inVehicle.exit(e);
    if (e.destroy) e.destroy();
    E().remove(e);
  }
  function releasePed(p, flee) {
    if (!p || p.removed) return;
    p.persistent = false; p.aimTarget = null; p.aiming = false; p.ai = null;
    if (flee && p.alive) { var pl = player(); p.fleeFrom = pl ? { x: pl.x, z: pl.z } : { x: p.x + 1, z: p.z }; p.fleeTimer = 8; p.state = 'flee'; }
  }
  // the defeat: the boss slumps (head down, arms limp), a RATIO'D sign over the head, the chat's verdict in the air. Nobody dies.
  function humiliate(enc, p) {
    if (p.inVehicle) p.inVehicle.exit(p);
    p.stop(); p.aiming = false; p.knockedDown = false; p.downT = 0; p.godMode = true; p.hostile = false; p.humiliated = true;
    p.ai = { phase: 0.5, mode: 'mission', mission: 'boss', ambient: false };
    var sign = sprite('RATIO\'D', '#ff3fa4', '#ffffff', 2.2, 1.0); enc.addObj(sign); enc.data.sign = sign;
    var proto = Object.getPrototypeOf(p).syncMesh;
    p.syncMesh = function (alpha) {
      proto.call(this, alpha);
      var m = this.mesh; if (!m) return;
      var head = m.getObjectByName('head'), aL = m.getObjectByName('armL'), aR = m.getObjectByName('armR'), torso = m.getObjectByName('torso');
      if (head) head.rotation.x = 0.55;
      if (torso) torso.rotation.x = 0.28;
      if (aL) { aL.rotation.x = 0.1; aL.rotation.z = 0.12; }
      if (aR) { aR.rotation.x = 0.1; aR.rotation.z = -0.12; }
      sign.position.set(m.position.x, m.position.y + 2.6 + Math.sin(simT() * 2) * 0.08, m.position.z);
    };
    for (var i = 0; i < 14; i++) fx({ type: 'spark', x: p.x, y: p.y + 2, z: p.z, vx: Math.cos(i) * 3, vy: 3 + (i % 4), vz: Math.sin(i) * 3, size: 0.3, life: 0.9, color: i % 2 ? 0xff3fa4 : 0x15e0ff });
  }
  function walkOff(enc, p, dt) {
    var d = enc.data;
    d.walkT = (d.walkT || 0) + dt;
    if (d.walkT < K.defeatWalk) { p.stop(); var pl = player(); if (pl) p.yaw = U.angleDamp(p.yaw, U.dirToYaw(pl.x - p.x, pl.z - p.z), 3, dt); return; }
    if (!d.exitPt) d.exitPt = spotNear(enc.rng, enc.center.x, enc.center.z, 30, 40);
    p.moveTo(d.exitPt.x, d.exitPt.z, false);
    if (d.walkT > K.defeatWalk + 9 || U.dist2d(p.x, p.z, d.exitPt.x, d.exitPt.z) < 1.5) {
      fx({ type: 'puff', x: p.x, y: p.y + 0.8, z: p.z, size: 1.6, life: 0.6, color: 0xe0e0e0 }); textFx('LOGGED OFF', p.x, p.y + 2.2, p.z, '#bfbfbf', 1.2);
      removeEntity(p);
      if (d.sign) { sceneRemove(d.sign); d.sign = null; }
    }
  }
  // a brawler add: close in, wind up (the swing reads before it lands), one punch, a breather
  function brawlerTick(enc, a, ai, dt) {
    var p = player(), CB = GTP.Combat;
    if (!p || !a.alive || a.knockedDown || a.inVehicle) { if (ai.swingT > 0) ai.swingT = 0; return; }
    var d = U.dist2d(a.x, a.z, p.x, p.z), face = U.dirToYaw(p.x - a.x, p.z - a.z);
    a.aimTarget = p;
    if (ai.swingT > 0) {
      ai.swingT -= dt; a.stop(); a.yaw = U.angleDamp(a.yaw, face, 10, dt); a.aimYaw = a.yaw;
      if (ai.swingT <= 0) { if (d < 2.1 && p.alive && !p.inVehicle && CB && CB.fire) { try { CB.fire(a, a.weapon || 'fist'); } catch (e) { U.reportError(e, 'bosses.brawler'); } } ai.cool = enc.rng.range(1.2, 1.9); }
      return;
    }
    if (ai.cool > 0) ai.cool -= dt;
    if (d > 1.5) {
      a.moveTo(p.x, p.z, d > 3);
      if (ai.sideT > 0) { ai.sideT -= dt; var f = U.yawToDir(a.yaw); a.intent.x = -f.z * ai.side; a.intent.z = f.x * ai.side; }
      if (a.speed < 0.3) { ai.stuckT += dt; if (ai.stuckT > 0.8) { ai.stuckT = 0; ai.side = -ai.side; ai.sideT = 0.5; } } else ai.stuckT = 0;
    } else {
      a.stop(); a.yaw = U.angleDamp(a.yaw, face, 8, dt);
      // nobody swings at a player on the floor (a knockdown is a beat to get up, not a pile-on)
      if (ai.cool <= 0 && !p.inVehicle && !p.knockedDown) { ai.swingT = 0.45; a.punchT = 0.45; a.aimYaw = face; }
    }
    ai.barkT -= dt;
    if (ai.barkT <= 0) {
      ai.barkT = enc.rng.range(7, 13);
      var Rd = GTP.Content && GTP.Content.radio, pool = Rd && Rd.barks && Rd.barks[ai.role];
      if (pool && pool.length && d < 30 && GTP.AI && GTP.AI.say) GTP.AI.say(a, pool[enc.rng.int(0, pool.length - 1)], '#ff7a7a');
    }
  }
  // face the player and stand (non-hostile cast at the fight: Chyron, the panelists between rounds)
  function standFacing(p, dt) { if (!p || p.removed || p.knockedDown) return; p.stop(); var pl = player(); if (pl) p.yaw = U.angleDamp(p.yaw, U.dirToYaw(pl.x - p.x, pl.z - p.z), 4, dt); }
  // a boss ped circling a point at radius r (the vulnerable windows); returns the distance to the player
  function circleAround(enc, p, cx, cz, r, speed, dt, run) {
    var d = enc.data; d.circA = (d.circA == null ? U.dirToYaw(p.x - cx, p.z - cz) : d.circA) + (speed || 0.35) * dt;
    var tx = cx + Math.cos(d.circA) * r, tz = cz + Math.sin(d.circA) * r;
    if (!p.knockedDown) p.moveTo(tx, tz, !!run);
    var pl = player(); return pl ? U.dist2d(p.x, p.z, pl.x, pl.z) : 99;
  }
  // a fists-only fight (def.noGuns): a gun in hand goes back in the holster, with a note now and then
  function holster(enc, p) {
    var WP = GTP.Combat && GTP.Combat.WEAPONS, w = WP && WP[p.weapon];
    if (!w || w.melee || p.weapon === 'fist') return;
    p.weapon = 'fist'; p.aiming = false;
    if (simT() - (enc._holsterT || -9) > 4) { enc._holsterT = simT(); toast(typeof enc.def.noGuns === 'string' ? enc.def.noGuns : 'Fists only'); }
  }
  // the ui track's boss bar (11_ui.js keeps it in UI.state.boss, fed by boss:phase); it has no boss:end handler, so an
  // encounter that ends without a defeat clears it here (see docs/v03/triage_bosses.md)
  function uiDrawsBar() { var UI = GTP.UI; return !!UI && (!!UI.drawsBossBar || !!(UI.state && Object.prototype.hasOwnProperty.call(UI.state, 'boss'))); }
  function uiDropBar(id) { var UI = GTP.UI, st = UI && UI.state; if (st && st.boss && st.boss.id === id && !UI.handlesBossEnd) st.boss = null; }
  function bossShoot(enc, p, weapon, every, dt, maxRange) {
    var pl = player(), CB = GTP.Combat; if (!pl || !pl.alive || !p || p.knockedDown || p.inVehicle || !CB || !CB.fire) return;
    var d = U.dist2d(p.x, p.z, pl.x, pl.z); if (d > (maxRange || 26)) { p.aiming = false; return; }
    p.aimTarget = pl; p.aiming = true; p.aimYaw = U.dirToYaw(pl.x - p.x, pl.z - p.z);
    enc.data.shotT = (enc.data.shotT == null ? every : enc.data.shotT) - dt;
    if (enc.data.shotT <= 0) { enc.data.shotT = every; try { CB.fire(p, weapon); } catch (e) { U.reportError(e, 'bosses.fire'); } }
  }

  // ======================================================================== the six bosses ==
  var DEFS = {};

  // ------------------------------------------------------------------ b01 ---
  // The gold helicopter circles the stadium lot trailing gold ribbon spools: cut them all and the ribbon fouls the rotor,
  // the helicopter sets down and the President steps out to rate the damage. Rating runs (strips) and gold rain (circles).
  DEFS.b01_goldplate = {
    id: 'b01_goldplate', name: 'President Lionel Goldplate', cast: 'goldplate', title: 'Ribbon Cutting',
    // the park and crossing east of the stadium, off Goldplate Links (14_systems.js's golf course, x 516..556): a President
    // fight on his own golf course reads as a real event (CONTENT_RULES 2); the helicopter's 16 m orbit stays off the lawns
    arena: { landmark: 'stadium', offset: { x: 20, z: 60 } },
    maxHp: 300, thresholds: [200, 100, 0], dmgScale: 0.45, windowCap: 56, shieldText: 'IN THE HELICOPTER (TEN OUT OF TEN)',
    spools: [3, 4, 5], orbit: [0.22, 0.28, 0.34], attackEvery: [4.6, 3.8, 3.0], window: 14,
    hints: ['Aim (right mouse) at the gold ribbon spools under the helicopter and shoot them', 'Cut the spools again; his interns are on the field', 'Last ribbon. The helicopter is a ten. Make it a two'],
    // the President is never the target: on the ground he reads his ratings off a gold teleprompter, and the prompter takes the
    // hits (CONTENT_RULES 2 and 4: no shots at a head-of-state stand-in)
    pedProof: 'NOT THE SUIT. THE TELEPROMPTER.', place: 'the park east of the stadium',
    ticker: 'BREAKING: PRESIDENT RATES OWN HELICOPTER LANDING A TEN; HELICOPTER DISAGREES',
    lines: {
      intro: [
        { who: 'goldplate', text: 'Takesworth! Big fan. I rate you a seven. Today I rate you a zero, which is new.' },
        { who: 'goldplate', text: 'This helicopter is gold. The ribbon is gold. I am cutting the ribbon on you.' },
        { who: 'player', text: 'He is trailing ribbon spools. If those go, the ribbon goes in the rotor.' }
      ],
      p2: [{ who: 'goldplate', text: 'That was a rehearsal landing. A ten. Interns! Film the empty seats!' }],
      p3: [{ who: 'goldplate', text: 'Fresh ribbon. Five spools. The ribbon people called me personally. Crying.' }],
      defeat: [
        { who: 'goldplate', text: 'I rate this... a two. Nobody rates a two. I am the first.' },
        { who: 'player', text: 'Ratio, sir. The helicopter got more likes than the speech.' },
        { who: 'chyron', text: 'BREAKING. President grounded by own ribbon. WE\'LL HAVE TO LEAVE IT THERE.', ticker: true }
      ]
    },
    barks: {
      fight: ['Rating run! Everything under me is a ten!', 'Gold rain. Very expensive rain.', 'This ribbon is the best ribbon.', 'I named the sky after myself. Twice.'],
      ground: ['My teleprompter! It had my best adjectives!', 'Interns! Get my good side!', 'That landing was a ten. The ground was a six.'],
      takeoff: ['Back to the sky. The sky is a ten.']
    },
    setup: function (enc) {
      var c = enc.center, d = enc.data;
      d.heliY = c.y + 15; d.ang = 0; d.mode = 'air'; d.spoolList = [];
      enc.heli = enc.addRig({ x: c.x + 16, y: d.heliY, z: c.z, mesh: Meshes.goldHeli(), sync: function (r, m) {
        var ud = m.userData; ud.rotor.rotation.y = r.data.rotor || 0; ud.tail.rotation.x = (r.data.rotor || 0) * 1.7; ud.body.rotation.z = r.data.bank || 0;
      }, tick: function (r, dt) {
        // the rotor voice (03_audio.js forgets it 1.6 s after the last call): kept up from where the helicopter is, softer on
        // the ground, coasting down after the last ribbon
        r.data.audT = (r.data.audT || 0) - dt; if (r.data.audT > 0 || !GTP.Audio || !GTP.Audio.heli) return;
        r.data.audT = 0.5;
        var md = enc.data.mode, lvl = enc.state === 'approach' ? 0.7 : md === 'ground' ? 0.45 : md === 'landing' ? 0.85 : md === 'dead' || enc.state === 'defeated' || enc.state === 'done' ? Math.max(0, 0.45 - enc.stateT * 0.15) : 1;
        try { GTP.Audio.heli(lvl, r.x, r.z); } catch (e) { /* optional */ }
      } });
      enc.barkAt = function () { return enc.heli; };
    },
    phase: function (enc, n) {
      var d = enc.data, def = enc.def;
      d.window = 0;
      if (enc.ped && !enc.ped.removed) { removeEntity(enc.ped); enc.ped = null; }
      DEFS.b01_goldplate._dropPrompter(enc);
      if (d.mode !== 'air') { d.mode = 'takeoff'; enc.bark(def.barks.takeoff[0]); }
      DEFS.b01_goldplate._spools(enc, def.spools[n - 1]);
      enc.shield = true;
      if (n >= 2) enc.spawnAdds('thug', n === 2 ? 3 : 2, 12, 22, { look: { shirt: '#ffd45a', sign: 'TYN' }, name: 'Intern' });
      if (n >= 3) enc.spawnAdds('cop', 1, 14, 24, { weapon: 'pistol', name: 'Gold Detail' });
    },
    _spools: function (enc, n) {
      var d = enc.data;
      for (var i = 0; i < n; i++) {
        (function (k) {
          var off = { a: k / n * TAU, r: n > 3 ? 2.6 : 2.2, drop: 6 + (k % 2) * 1.2 };
          var pt = enc.addPart({ kind: 'spool', label: 'RIBBON SPOOL', x: enc.heli.x, y: enc.heli.y - off.drop, z: enc.heli.z, hp: 45, mesh: Meshes.spool(), invulnText: 'GOLD-PLATED',
            follow: function (self, dt) {
              var h = enc.heli, sw = Math.sin(self.age * 1.7 + k) * 0.6, a = off.a + h.yaw;
              self.x = h.x + Math.cos(a) * off.r + sw; self.z = h.z + Math.sin(a) * off.r; self.y = h.y - off.drop + Math.cos(self.age * 1.3 + k) * 0.3;
              self.yaw += dt * 0.8;
            } });
          pt.sync = function (self, m) {
            var ud = m.userData, h = enc.heli, dx = h.x - self.x, dy = (h.y - 1.0) - self.y, dz = h.z - self.z, l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
            // the ribbon runs from the spool up to the belly (group space: undo the spool's yaw)
            var cy = Math.cos(-self.yaw), sy = Math.sin(-self.yaw), lx = dx * cy - dz * sy, lz = dx * sy + dz * cy;
            ud.ribbon.position.set(lx * 0.5, dy * 0.5, lz * 0.5); ud.ribbon.scale.set(0.14, l, 0.04);
            ud.ribbon.quaternion.setFromUnitVectors(ud.up, ud.dir.set(lx / l, dy / l, lz / l));
          };
          d.spoolList.push(pt);
        })(i);
      }
    },
    // the stand goes up beside the helicopter's door, facing the arena centre; its hits go into the boss pool (the window cap
    // and the damage scale apply as they did to the man himself)
    _prompter: function (enc) {
      var d = enc.data, h = enc.heli, c = enc.center;
      DEFS.b01_goldplate._dropPrompter(enc);
      var yaw = U.dirToYaw(c.x - (h.x + 4), c.z - h.z), at = { x: h.x + 4, z: h.z + 1.5 };
      var pr = enc.addPart({ kind: 'prompter', label: 'GOLD TELEPROMPTER', x: at.x, y: groundY(at.x, at.z, c.y) + 1.4, z: at.z, hp: 1e6, mesh: Meshes.prompter(),
        onHit: function (self, n, src, type) {
          self.hp = 1e6;
          var dd = enc.damageBoss(n, src, type);
          if (dd > 0 && simT() - (self.data.noteT || -9) > 1.3) { self.data.noteT = simT(); var w = ['LOST HIS PLACE', 'AD-LIB!', 'UHHH... TREMENDOUS', 'SKIPPED A PAGE'][Math.floor(simT() * 7) % 4]; textFx(w, self.x, self.y + 1.5, self.z, '#ffd45a', 1); }
          if (dd <= 0 && enc.windowDmg >= (enc.def.windowCap || 1e9) - 1e-6 && simT() - (self.data.capT || -9) > 1.5) { self.data.capT = simT(); textFx('HE MEMORISED THE REST', self.x, self.y + 1.5, self.z, '#d0d0d0', 1); }
        } });
      pr.yaw = yaw; pr.data.x = at.x; pr.data.z = at.z; pr.data.yaw = yaw;
      pr.sync = function (self, m) { m.rotation.y = self.data.yaw; m.position.y = self.y - 1.4; var hd = m.userData.head; hd.rotation.z = self.flashT > 0 ? 0.12 : 0; };
      d.prompter = pr;
    },
    _dropPrompter: function (enc) {
      var pr = enc.data.prompter; enc.data.prompter = null;
      if (pr && !pr.removed) { fx({ type: 'spark', x: pr.x, y: pr.y + 0.5, z: pr.z, vx: 0, vy: 3, vz: 0, size: 0.4, life: 0.5, color: 0xffd45a }); E().remove(pr); disposeOwn(pr.mesh); }
    },
    partBroken: function (enc) {
      textFx('SNIP', enc.heli.x, enc.heli.y - 3, enc.heli.z, '#ffd45a', 1);
      if (enc.liveParts('spool') === 0 && (enc.data.mode === 'air' || enc.data.mode === 'takeoff')) {
        enc.data.mode = 'landing'; enc.clearTele();
        textFx('RIBBON IN THE ROTOR!', enc.heli.x, enc.heli.y + 2, enc.heli.z, '#ff3b30', 2);
        enc.bark('My ribbon! The ribbon is in the thing!');
      }
    },
    update: function (enc, dt) {
      var d = enc.data, h = enc.heli, c = enc.center, def = enc.def, n = enc.phase, p = player();
      d.rotor = (d.rotor || 0);
      if (d.mode === 'air' || d.mode === 'takeoff') {
        d.ang += def.orbit[n - 1] * dt;
        var tx = c.x + Math.cos(d.ang) * 16, tz = c.z + Math.sin(d.ang) * 16, ty = d.heliY;
        h.x = U.damp(h.x, tx, 1.4, dt); h.z = U.damp(h.z, tz, 1.4, dt); h.y = U.damp(h.y, ty, d.mode === 'takeoff' ? 1.2 : 2, dt);
        if (d.mode === 'takeoff' && Math.abs(h.y - ty) < 1) { d.mode = 'air'; if (enc.liveParts('spool') === 0) DEFS.b01_goldplate._spools(enc, def.spools[n - 1]); }
        h.yaw = U.angleDamp(h.yaw, d.ang + Math.PI, 2, dt); h.data.bank = Math.sin(enc.t * 0.7) * 0.08 - 0.12;
        h.data.rotor = (h.data.rotor || 0) + dt * 34;
        if (d.mode === 'air' && p) enc.every('attack', def.attackEvery[n - 1], dt, function () {
          d.atk = (d.atk || 0) + 1;
          if (d.atk % 2) {
            // the rating run: a strip along the helicopter's heading through the player
            var f = U.yawToDir(h.yaw);
            enc.addTele({ shape: 'strip', x: p.x, z: p.z, yaw: h.yaw, len: 34, w: 4.2, warn: 1.7, dmg: 16, knock: 6, color: 0xffb020, label: 'RATING RUN', hitsVehicles: true, vehicleDmg: 30,
              onStrike: function (t) { for (var i = -3; i <= 3; i++) textFx('10/10', t.x + f.x * i * 5, t.y + 0.8, t.z + f.z * i * 5, '#ffd45a', 0.9); } });
            enc.randomBark('fight');
          } else {
            var k = n, lead = 0.5;
            for (var j = 0; j < k; j++) {
              var ox = j === 0 ? (p.vx || 0) * lead : enc.rng.range(-5, 5), oz = j === 0 ? (p.vz || 0) * lead : enc.rng.range(-5, 5);
              enc.addTele({ shape: 'circle', x: p.x + ox, z: p.z + oz, r: 2.6, warn: 1.45, dmg: 12, knock: 4, color: 0xffd45a, label: j === 0 ? 'GOLD RAIN' : null,
                onStrike: function (t) { for (var q = 0; q < 6; q++) fx({ type: 'spark', x: t.x + Math.cos(q) * 1.2, y: t.y + 3, z: t.z + Math.sin(q) * 1.2, vx: 0, vy: -6, vz: 0, size: 0.4, life: 0.5, color: 0xffd45a }); sfx('cash', t.x, t.z, 0.5); } });
            }
          }
        });
      } else if (d.mode === 'landing') {
        var lx = c.x, lz = c.z - 2, ly = groundY(lx, lz, c.y) + 1.25;
        h.x = U.damp(h.x, lx, 1.6, dt); h.z = U.damp(h.z, lz, 1.6, dt); h.y = U.damp(h.y, ly, 1.3, dt); h.data.bank = Math.sin(enc.t * 9) * 0.12;
        h.data.rotor += dt * 16; h.yaw += dt * 0.6;
        if (enc.t % 0.2 < dt) fx({ type: 'smoke', x: h.x, y: h.y + 1.5, z: h.z, size: 1.8, life: 1.0, color: 0x3a3a3a, vy: 1.2 });
        if (Math.abs(h.y - ly) < 0.25) {
          d.mode = 'ground'; d.window = def.window; h.data.bank = 0; shake(0.5); sfx('crash', h.x, h.z, 0.7);
          var door = { x: h.x + 2.6, z: h.z };
          var gp = enc.addPed('goldplate', door.x, door.z, { boss: true });
          enc.peds.splice(enc.peds.indexOf(gp), 1); enc.ped = gp;
          DEFS.b01_goldplate._prompter(enc);
          enc.shield = false; enc.windowDmg = 0; enc.emitPhase(true);
          enc.hint = 'Goldplate is out of the helicopter reading his ratings: wreck the gold teleprompter before it takes off';
          enc.randomBark('ground');
        }
      } else if (d.mode === 'ground') {
        d.window -= dt; h.data.rotor += dt * 4;
        var gpd = enc.ped, pr = d.prompter;
        if (gpd && !gpd.removed && pr && !pr.removed) {
          // he walks to the stand and reads to the cameras; the gold keeps raining on whoever is near
          var sx = pr.data.x - Math.sin(pr.data.yaw) * 1.3, sz = pr.data.z - Math.cos(pr.data.yaw) * 1.3;
          if (!gpd.knockedDown) { if (U.dist2d(gpd.x, gpd.z, sx, sz) > 0.5) gpd.moveTo(sx, sz, false); else { gpd.stop(); gpd.yaw = pr.data.yaw; } }
          enc.every('gbark', 6, dt, function () { enc.randomBark('ground'); });
          if (p) enc.every('grain', 3.2, dt, function () {
            enc.addTele({ shape: 'circle', x: p.x + (p.vx || 0) * 0.5, z: p.z + (p.vz || 0) * 0.5, r: 2.6, warn: 1.45, dmg: 12, knock: 4, color: 0xffd45a, label: 'GOLD RAIN',
              onStrike: function (t) { for (var q = 0; q < 6; q++) fx({ type: 'spark', x: t.x + Math.cos(q) * 1.2, y: t.y + 3, z: t.z + Math.sin(q) * 1.2, vx: 0, vy: -6, vz: 0, size: 0.4, life: 0.5, color: 0xffd45a }); sfx('cash', t.x, t.z, 0.5); } });
          });
        }
        if (d.window <= 3 && d.window + dt > 3) { textFx('ROTOR SPINNING UP', h.x, h.y + 3, h.z, '#ff3b30', 1.6); enc.bark('Back in the helicopter! Helicopter time!'); }
        if (d.window <= 0) {
          // the window closed before the phase did: back up with fresh ribbon
          if (enc.ped) { removeEntity(enc.ped); enc.ped = null; }
          DEFS.b01_goldplate._dropPrompter(enc);
          d.mode = 'takeoff'; enc.shield = true; enc.hint = def.hints[n - 1]; enc.emitPhase(true);
          DEFS.b01_goldplate._spools(enc, def.spools[n - 1]);
        }
      }
    },
    phaseEnd: function (enc, n) {
      if (n >= enc.phases) DEFS.b01_goldplate._dropPrompter(enc);
      if (n < enc.phases) return;
      // the last ribbon: the helicopter stays down, its rotor coasting to a stop
      enc.data.mode = 'dead';
    },
    after: function (enc, dt) { var h = enc.heli; if (h && h.data) { h.data.rotor += dt * Math.max(0, 6 - enc.stateT * 2); } },
    defeat: function (enc) { if (GTP.Audio && GTP.Audio.heli) { try { GTP.Audio.heli(false, enc.center.x, enc.center.z); } catch (e) { /* optional */ } } },
    target: function (enc) {
      var d = enc.data, p = player(), best = null, bd = 1e9;
      if (d.mode === 'ground' && d.prompter && !d.prompter.removed) return d.prompter;
      if (d.mode === 'ground' && enc.ped && !enc.ped.removed) return enc.ped;
      for (var i = 0; i < enc.parts.length; i++) { var s = enc.parts[i]; if (s.down || s.removed) continue; var dd = U.dist2d(p.x, p.z, s.x, s.z); if (dd < bd) { bd = dd; best = s; } }
      return best || enc.heli;
    },
    cleanup: function (enc) { if (GTP.Audio && GTP.Audio.heli) { try { GTP.Audio.heli(false, enc.center.x, enc.center.z); } catch (e) { /* optional */ } } }
  };

  // ------------------------------------------------------------------ b02 ---
  // The Afterparty, where nothing plays: four speaker stacks around a velvet-rope dais. While one stands the Baron is "listening"
  // (no damage lands). Each stack pulses a silent drop: an expanding ring on the ground; jump it. Wreck them all and he is
  // exposed, toasting champagne (circles) at you, until the roadies rebuild.
  DEFS.b02_velvetine = {
    id: 'b02_velvetine', name: 'Baron Velvetine', cast: 'velvetine', title: 'The Silent Yacht',
    arena: { landmark: 'afterparty_yacht', offset: { x: -10, z: 10 } }, place: 'the Afterparty pier',
    maxHp: 300, thresholds: [200, 100, 0], dmgScale: 0.42, windowCap: 60, shieldText: 'SHHH. THE BARON IS LISTENING',
    speakers: [4, 4, 3], pulse: [6.2, 5.2, 4.4], window: 16, toastEvery: [2.8, 2.4, 2.0],
    hints: ['Wreck the speaker stacks (aim and shoot). Jump over the silent drops', 'The roadies rebuilt it. Speakers first, then the Baron', 'The speakers are on carts now. Jump the drops, wreck the stacks'],
    ticker: 'BREAKING: BARON VELVETINE\'S LISTENING SESSION ENDS; NOTHING WAS PLAYED, EVERYONE AGREES IT SLAPPED',
    lines: {
      intro: [
        { who: 'velvetine', text: 'Takesworth! To you! To the crates you definitely stole! To whatever this is!' },
        { who: 'velvetine', text: 'The speakers play my new album: silence. Feel the drop.' },
        { who: 'player', text: 'Silent drop. On the floor. I should not be standing on the floor when it comes.' }
      ],
      p2: [{ who: 'velvetine', text: 'To the roadies! To rebuilding! Bouncers, check his listening credentials.' }],
      p3: [{ who: 'velvetine', text: 'Speakers on wheels! To mobility! To the remix of nothing!' }],
      defeat: [
        { who: 'velvetine', text: 'To... losing. To whatever this was. Nobody play anything.' },
        { who: 'player', text: 'Best session yet. Nothing played and the Baron went quiet.' },
        { who: 'chyron', text: 'BREAKING. Velvetine Records announces silence, reviewers call it his most honest work.', ticker: true }
      ]
    },
    barks: {
      fight: ['To the drop!', 'Hear that? Exactly.', 'To my bass player, who is a spreadsheet!', 'Shh. That\'s the hook.'],
      exposed: ['To exposure! Not like this!', 'Champagne! To your face!', 'A toast, at velocity!'],
      rebuild: ['Roadies! To rebuilding!']
    },
    setup: function (enc) {
      var c = enc.center;
      enc.addRig({ x: c.x, y: c.y, z: c.z, mesh: Meshes.dais() });
      var b = enc.addPed('velvetine', c.x, c.z + 1.2, { boss: true, weapon: 'fist' });
      enc.peds.splice(enc.peds.indexOf(b), 1);
      enc.data.ang = 0;
    },
    _speakers: function (enc, n, moving) {
      var c = enc.center, d = enc.data;
      d.spk = [];
      for (var i = 0; i < n; i++) {
        (function (k) {
          var a0 = k / n * TAU + Math.PI / n, r = 9.5, pos = enc.at(Math.cos(a0) * r, Math.sin(a0) * r);
          var pt = enc.addPart({ kind: 'speaker', label: 'SPEAKER', x: pos.x, y: pos.y + 1.4, z: pos.z, hp: 95, mesh: Meshes.speaker(), invulnText: 'MUFFLED',
            follow: function (self, dt) {
              if (moving) { var a = a0 + enc.data.ang; self.x = c.x + Math.cos(a) * r; self.z = c.z + Math.sin(a) * r; self.y = groundY(self.x, self.z, c.y) + 1.4; }
              self.yaw = U.dirToYaw(self.x - c.x, self.z - c.z) + Math.PI;
              self.data.pulseT = (self.data.pulseT == null ? 1.5 + k * (enc.def.pulse[enc.phase - 1] / n) : self.data.pulseT) - dt;
              var glow = self.data.pulseT < 1.0 && self.data.pulseT > 0;
              if (glow !== self.data.glowOn && self.mesh && self.mesh.userData.glow) { self.data.glowOn = glow; self.mesh.userData.glow.material = mat(glow ? 0xff66ff : 0xb04ad8, { glow: glow ? 1.6 : 0.2, rough: 0.3 }); }
              if (self.data.pulseT <= 1.0 && !self.data.warned) { self.data.warned = true; textFx('( silence )', self.x, self.y + 2.2, self.z, '#e9b8ff', 1); }
              if (self.data.pulseT <= 0 && enc.state === 'fight') {
                self.data.pulseT = enc.def.pulse[enc.phase - 1]; self.data.warned = false;
                enc.addTele({ shape: 'ring', x: self.x, z: self.z, r0: 1, speed: 7, maxR: 15, band: 1.4, warn: 0.05, dmg: 10, knock: 5, jumpable: true, color: 0xc65cff });
                sfx('static', self.x, self.z, 0.3);
              }
            } });
          pt.mesh.position.y = 0;
          pt.sync = function (self, m) { m.position.y = self.y - 1.4; };
          d.spk.push(pt);
        })(i);
      }
      enc.shield = true;
    },
    phase: function (enc, n) {
      var d = enc.data, def = enc.def;
      d.window = 0; d.exposed = false;
      DEFS.b02_velvetine._speakers(enc, def.speakers[n - 1], n === 3);
      enc.spawnAdds('thug', n === 1 ? 2 : 3, 10, 18, { look: { shirt: '#111111', pants: '#111111', glasses: 'shades' }, name: 'Bouncer' });
    },
    partBroken: function (enc) {
      if (enc.liveParts('speaker') === 0 && !enc.data.exposed) {
        enc.data.exposed = true; enc.data.window = enc.def.window; enc.shield = false; enc.windowDmg = 0;
        enc.hint = 'The Baron is exposed: hit him before the roadies rebuild';
        textFx('THE BARON IS EXPOSED', enc.center.x, enc.center.y + 3.4, enc.center.z, '#ff3fa4', 2);
        enc.randomBark('exposed'); enc.emitPhase(true);
      }
    },
    update: function (enc, dt) {
      var d = enc.data, def = enc.def, n = enc.phase, b = enc.ped, c = enc.center, p = player();
      d.ang += dt * 0.22;
      if (!b || b.removed) return;
      // champagne toasts: slow while he listens behind the speakers, fast once he is exposed
      if (p) enc.every('toast', d.exposed ? def.toastEvery[n - 1] : def.toastEvery[n - 1] * 1.9, dt, function () {
        var lead = 0.6;
        enc.addTele({ shape: 'circle', x: p.x + (p.vx || 0) * lead, z: p.z + (p.vz || 0) * lead, r: 2.3, warn: 1.3, dmg: 12, knock: 4, color: 0xff66cc, label: 'TOAST!',
          onStrike: function (t) { fx({ type: 'explosion', x: t.x, y: t.y + 0.3, z: t.z, size: 2.2, life: 0.3, color: 0xfff0b0 }); for (var q = 0; q < 6; q++) fx({ type: 'spark', x: t.x, y: t.y + 0.4, z: t.z, vx: Math.cos(q) * 4, vy: 4, vz: Math.sin(q) * 4, size: 0.3, life: 0.5, color: 0xfff6c8 }); } });
        if (d.exposed && enc.rng.chance(0.4)) enc.randomBark('exposed');
      });
      if (!d.exposed) { if (!b.knockedDown) { b.moveTo(c.x + Math.cos(enc.t * 0.4) * 1.2, c.z + Math.sin(enc.t * 0.4) * 1.2, false); } enc.every('bark', 7, dt, function () { enc.randomBark('fight'); }); return; }
      d.window -= dt;
      circleAround(enc, b, c.x, c.z, 3.0, 0.45, dt, true);
      if (d.window <= 0) {
        d.exposed = false; enc.shield = true; enc.hint = def.hints[n - 1];
        enc.bark(def.barks.rebuild[0]);
        DEFS.b02_velvetine._speakers(enc, def.speakers[n - 1], n === 3);
        enc.emitPhase(true);
      }
    },
    target: function (enc) {
      var p = player(), best = null, bd = 1e9;
      if (enc.data.exposed && enc.ped) return enc.ped;
      for (var i = 0; i < enc.parts.length; i++) { var s = enc.parts[i]; if (s.down || s.removed) continue; var dd = U.dist2d(p.x, p.z, s.x, s.z); if (dd < bd) { bd = dd; best = s; } }
      return best;
    }
  };

  // ------------------------------------------------------------------ b03 ---
  // The runway: Bravadian guards on Defense Scooters circle and charge (their line flashes first). While a scooter runs the PM
  // narrates from the podium behind a PRESS PASS. The jets arrive (probably): a long strip flashes, the jet streaks over and
  // the press release lands on everything in the strip, scooters included. Lure them in.
  DEFS.b03_warbanner = {
    id: 'b03_warbanner', name: 'PM Hollis Warbanner', cast: 'warbanner', title: 'The Jets Arrive (Probably)',
    arena: { landmark: 'airport_runway', offset: { x: 0, z: 26 } }, place: 'the runway',
    maxHp: 300, thresholds: [200, 100, 0], dmgScale: 0.42, windowCap: 50, capPhases: [2], shieldText: 'PRESS PASS (WRECK THE SCOOTERS)', leash: 170,
    scooters: [3, 2, 0], jetEvery: [9, 7.5, 5.5], window: 12,
    hints: ['Wreck the Defense Scooters (shoot them, or lure them under the jets). Stay out of the flashing strips', 'He is on a scooter now: wreck his ride, then hit him while he is down', 'On foot at the podium. Dodge the crossing jets and hit him'],
    ticker: 'BREAKING: BRAVADIA\'S JETS ARRIVE, PAPER OWN PRIME MINISTER IN PRESS RELEASES; BRAVADIA CALLS IT A SUCCESS',
    lines: {
      intro: [
        { who: 'warbanner', text: 'Mr. Takesworth. You billed my scooters to your show. I billed them back. And that\'s why we need the jets.' },
        { who: 'warbanner', text: 'Guards! Defense Scooters! Demonstrate defense!' },
        { who: 'player', text: 'If the jets actually show up, anything under them gets a press release to the face. Including scooters.' }
      ],
      p2: [{ who: 'warbanner', text: 'I will defend myself personally. On a scooter. And that\'s why we need the jets.' }],
      p3: [{ who: 'warbanner', text: 'Podium! Volume is policy! All jets, all of them, now. Probably.' }],
      defeat: [
        { who: 'warbanner', text: 'And that\'s why we need... a moment. Condolences. To me.' },
        { who: 'player', text: 'The jets came. They just did not read the memo about whose side they were on.' },
        { who: 'chyron', text: 'BREAKING. Bravadia\'s air force buries own PM in press releases. Bravadia: "a triumph."', ticker: true }
      ]
    },
    barks: {
      fight: ['And that\'s why we need the jets.', 'Volume is policy!', 'Scooters, defend! Bill it to the podcast!', 'Jets inbound. Probably. Eventually.'],
      jets: ['INCOMING: THE JETS (PROBABLY)', 'Here they come! They exist!', 'Air superiority, at last!'],
      down: ['My scooter! Bill it to someone!', 'A tactical sit-down.']
    },
    setup: function (enc) {
      var c = enc.center, pod = enc.at(0, -12);
      enc.addRig({ x: pod.x, y: pod.y, z: pod.z, yaw: Math.PI, mesh: Meshes.podium('BRAVADIA', '#3d6fcf', '#ffffff') });
      var fl = enc.at(1.6, -12.4); enc.addRig({ x: fl.x, y: fl.y, z: fl.z, mesh: Meshes.flag() });
      var w = enc.addPed('warbanner', pod.x, pod.z - 1.0, { boss: true, weapon: 'pistol' });
      enc.peds.splice(enc.peds.indexOf(w), 1);
      enc.data.podium = pod;
      enc.jet = enc.addRig({ x: c.x, y: c.y - 200, z: c.z, mesh: Meshes.jet() });
      enc.jet.mesh.visible = false;
    },
    _scooter: function (enc, driverCast, hp) {
      var s = spotNear(enc.rng, enc.center.x, enc.center.z, 14, 22, true);
      var v = new GTP.Vehicle({ x: s.x, z: s.z, type: 'bike', color: '#3d6fcf', persistent: true, tag: 'defense_scooter' });
      v.y = s.y; v.yaw = U.dirToYaw(enc.center.x - s.x, enc.center.z - s.z); v.snap();
      v.maxHp = v.hp = hp || 60; v.bossScooter = enc.id;
      E().add(v); enc.vehicles.push(v);
      var dvr;
      if (driverCast) { dvr = enc.ped; }
      else { dvr = newPed({ x: s.x, z: s.z, look: rollLook('swat', s.x, s.z, { shirt: '#3d6fcf', pants: '#1a2a5a', hat: 'helmet' }), role: 'swat', ai: { phase: 0.5, mode: 'mission', mission: 'driver', ambient: false } }); dvr.hostile = true; dvr.name = 'Bravadian Guard'; enc.adds.push(dvr); }
      v.enter(dvr, 0);
      v.data = { mode: 'circle', t: enc.rng.range(0, 3), ang: enc.rng.range(0, TAU), charge: null };
      // the lock-on only takes cruisers among cars: a weak point rides the scooter so the aim assist finds it
      v.weak = enc.addPart({ kind: 'scooter', label: 'DEFENSE SCOOTER', x: v.x, y: v.y + 0.7, z: v.z, hp: 1e6, mesh: null, invulnText: 'BULLETPROOF PRESS PASS',
        follow: function (self) { if (v.removed || v.wreck || v.burning) { if (!self.removed) E().remove(self); return; } self.x = v.x; self.y = v.y + 0.7; self.z = v.z; },
        onHit: function (self, n, src, type) { self.hp = 1e6; if (!v.wreck) v.applyDamage(n * 0.6, src, type); } });
      return v;
    },
    phase: function (enc, n) {
      var d = enc.data, def = enc.def;
      d.window = 0; d.thrown = false;
      for (var i = 0; i < def.scooters[n - 1]; i++) DEFS.b03_warbanner._scooter(enc, null, 90);
      if (n === 1) { enc.shield = true; enc.shieldText = 'PRESS PASS (WRECK THE SCOOTERS)'; }
      if (n === 2) { enc.shield = true; enc.shieldText = 'ON A SCOOTER (WRECK IT)'; DEFS.b03_warbanner._mount(enc); }
      if (n === 3) {
        enc.shield = false; var w = enc.ped; if (w && w.inVehicle) w.inVehicle.exit(w);
        if (w) { w.x = d.podium.x; w.z = d.podium.z - 1; w.snap(); }
        enc.spawnAdds('swat', 1, 12, 20, { weapon: 'pistol', look: { shirt: '#3d6fcf', pants: '#1a2a5a' }, lookRole: 'swat', name: 'Bravadian Guard' });
        enc.spawnAdds('thug', 2, 12, 20, { look: { shirt: '#3d6fcf', pants: '#1a2a5a' }, name: 'Bravadian Guard' });
      }
    },
    _mount: function (enc) {
      var w = enc.ped; if (!w || w.removed) return;
      if (w.knockedDown) { w.knockedDown = false; w.downT = 0; }
      var v = DEFS.b03_warbanner._scooter(enc, 'warbanner', 150);
      v.pmRide = true; enc.data.ride = v; enc.shield = true; enc.data.thrown = false;
      fx({ type: 'puff', x: v.x, y: v.y + 0.8, z: v.z, size: 2, life: 0.5, color: 0xe0e0e0 });
      textFx('THE PM MOUNTS UP', v.x, v.y + 2.5, v.z, '#3d6fcf', 1.6);
    },
    _jets: function (enc, cross) {
      var p = player(), c = enc.center; if (!p) return;
      var yaw = enc.rng.range(0, TAU), len = 150, speed = 85, warn = 2.6;
      var mk = function (yw, px, pz) {
        var t = enc.addTele({ shape: 'strip', x: px, z: pz, yaw: yw, len: len, w: 7, warn: warn, dmg: 22, knock: 7, color: 0xff2a2a, label: 'INCOMING: THE JETS (PROBABLY)', hitsVehicles: true, vehicleDmg: 80,
          onStrike: function (tl) { var f = U.yawToDir(tl.yaw); for (var i = -6; i <= 6; i++) { fx({ type: 'explosion', x: tl.x + f.x * i * 11, y: tl.y + 0.8, z: tl.z + f.z * i * 11, size: 3.5, life: 0.4, color: 0xffe0a0 }); if (i % 3 === 0) textFx('PRESS RELEASE', tl.x + f.x * i * 11, tl.y + 2, tl.z + f.z * i * 11, '#ffffff', 1); } sfx('explode', tl.x, tl.z, 0.8); shake(0.4); } });
        // the jet: over the strip's middle at the strike
        var jf = U.yawToDir(yw), j = enc.jet;
        j.data.fly = { t: -warn + (len / 2) / speed, sx: px - jf.x * len / 2, sz: pz - jf.z * len / 2, f: jf, speed: speed, yaw: yw, y: groundY(px, pz, c.y) + 22, len: len };
        return t;
      };
      mk(yaw, p.x, p.z);
      if (cross) mk(yaw + Math.PI / 2, p.x + enc.rng.range(-4, 4), p.z + enc.rng.range(-4, 4));
      enc.bark(enc.def.barks.jets[enc.rng.int(0, enc.def.barks.jets.length - 1)]);
    },
    update: function (enc, dt) {
      var d = enc.data, def = enc.def, n = enc.phase, p = player(), c = enc.center, w = enc.ped, i;
      // the jet's pass
      var j = enc.jet, fl = j && j.data.fly;
      if (fl) {
        fl.t += dt;
        if (fl.t >= 0) {
          var s = fl.t * fl.speed; j.mesh.visible = true;
          j.x = fl.sx + fl.f.x * s; j.z = fl.sz + fl.f.z * s; j.y = fl.y; j.yaw = fl.yaw;
          if (s > fl.len + 40) { j.data.fly = null; j.mesh.visible = false; j.y = c.y - 200; }
          else if (enc.t % 0.1 < dt) sfx('crash', j.x, j.z, 0.25);
        }
      }
      enc.every('jets', def.jetEvery[n - 1], dt, function () { DEFS.b03_warbanner._jets(enc, n === 3); });
      enc.every('bark', 8, dt, function () { enc.randomBark('fight'); });
      // the scooters: circle, then a telegraphed charge along a flashing line
      var liveScooters = 0;
      for (i = enc.vehicles.length - 1; i >= 0; i--) {
        var v = enc.vehicles[i];
        if (v.removed || v._bossCounted) continue;
        if (v.wreck || v.burning || !v.driver || !v.driver.alive) { DEFS.b03_warbanner._wrecked(enc, v); continue; }
        liveScooters++;
        if (!p) continue;
        var vd = v.data; vd.t += dt;
        if (vd.mode === 'circle') {
          vd.ang += dt * 0.32;
          var rr = 13, tx = p.x + Math.cos(vd.ang) * rr, tz = p.z + Math.sin(vd.ang) * rr;
          steerTo(v, tx, tz, v.pmRide ? 13 : 12);
          if (vd.t > (v.pmRide ? 5 : 6.5) && U.dist2d(v.x, v.z, p.x, p.z) < 26) {
            vd.mode = 'aim'; vd.t = 0;
            var yaw = U.dirToYaw(p.x - v.x, p.z - v.z), f = U.yawToDir(yaw);
            vd.charge = { x: p.x, z: p.z, yaw: yaw };
            enc.addTele({ shape: 'strip', x: (v.x + p.x) / 2 + f.x * 4, z: (v.z + p.z) / 2 + f.z * 4, yaw: yaw, len: U.dist2d(v.x, v.z, p.x, p.z) + 10, w: 2.6, warn: 1.25, dmg: 0, knock: 0, color: 0x3d6fcf, label: 'SCOOTER CHARGE' });
          }
        } else if (vd.mode === 'aim') {
          v.setControls(0, 0, false, 1);
          if (vd.t > 1.25) { vd.mode = 'charge'; vd.t = 0; }
        } else if (vd.mode === 'charge') {
          var cf = U.yawToDir(vd.charge.yaw);
          steerTo(v, vd.charge.x + cf.x * 12, vd.charge.z + cf.z * 12, 15);
          if (vd.t > 2.2) { vd.mode = 'circle'; vd.t = 0; }
        }
      }
      if (n === 1) {
        if (w && !w.removed) standFacing(w, dt);
        if (liveScooters === 0 && enc.hp > def.thresholds[0]) enc.hurt(enc.hp - def.thresholds[0]);
      } else if (n === 2) {
        if (d.thrown) {
          d.window -= dt;
          if (w && !w.knockedDown) { circleAround(enc, w, d.podium.x, d.podium.z + 6, 5, 0.4, dt, true); bossShoot(enc, w, 'pistol', 2.4, dt, 20); }
          if (d.window <= 0) { enc.bark('Fresh scooter! Bill it to the podcast!'); DEFS.b03_warbanner._mount(enc); enc.hint = def.hints[1]; enc.emitPhase(true); }
        }
      } else if (n === 3) {
        if (w && !w.removed && !w.knockedDown) { circleAround(enc, w, d.podium.x, d.podium.z + 3, 3.2, 0.35, dt, false); bossShoot(enc, w, 'pistol', 2.8, dt, 24); }
      }
    },
    _wrecked: function (enc, v) {
      if (v._bossCounted) return;
      v._bossCounted = true;   // it stays in enc.vehicles so the end of the fight clears it
      textFx('SCOOTER WRECKED', v.x, v.y + 2.2, v.z, '#9dff3c', 1.4);
      var dvr = v.driver;
      if (v.pmRide) {
        var w = enc.ped;
        if (w && w.inVehicle === v) { v.exit(w); }
        if (w) { w.knockDown(2, 2, 0, null, 'bail'); }
        enc.data.thrown = true; enc.data.window = enc.def.window; enc.shield = false; enc.windowDmg = 0; enc.data.ride = null;
        enc.hint = 'The PM is off his scooter: hit him before he finds another';
        enc.randomBark('down');
        enc.hurt(15);
        enc.emitPhase(true);
      } else if (dvr && dvr.alive) {
        v.exit(dvr); dvr.knockDown(1.5, 1.5, 0, null, 'bail');
        // a rider on foot brawls (the missions' swat brain holds 12 m off and never lands a fist)
        dvr.ai = enc.brawlerBrain('swat'); dvr.weapon = 'fist';
        if (enc.phase === 1) enc.hurt((enc.maxHp - enc.def.thresholds[0]) / enc.def.scooters[0]);
      } else if (enc.phase === 1) enc.hurt((enc.maxHp - enc.def.thresholds[0]) / enc.def.scooters[0]);
      if (v.burning && !v.wreck) { v._bossBurn = true; }
    },
    target: function (enc) {
      var p = player(), best = null, bd = 1e9, n = enc.phase;
      if (n === 2 && enc.data.thrown && enc.ped) return enc.ped;
      if (n === 3 && enc.ped) return enc.ped;
      for (var i = 0; i < enc.vehicles.length; i++) { var v = enc.vehicles[i]; if (v.wreck || v.removed || v._bossCounted) continue; if (n === 2 && !v.pmRide) continue; var dd = U.dist2d(p.x, p.z, v.x, v.z); if (dd < bd) { bd = dd; best = v; } }
      return best || enc.ped;
    }
  };

  // ------------------------------------------------------------------ b04 ---
  // The weather balloon over the depot lot: only the [REDACTED] patch takes damage, it orbits the envelope and goes
  // [CLASSIFIED] (grey, no damage) on a beat it flashes before. Each pop deflates a stage. OVA vans circle the lot and drop
  // agents; Redacted drops redaction bars (rectangles) on you.
  DEFS.b04_redacted = {
    id: 'b04_redacted', name: 'Agent Pat Redacted', cast: 'redacted', title: 'Weather Balloon',
    arena: { landmark: 'balloon_depot', offset: { x: 50, z: 10 } }, place: 'the balloon depot lot',
    maxHp: 300, thresholds: [200, 100, 0], dmgScale: 1, shieldText: '[REDACTED]',
    patches: [3, 4, 4], vans: [1, 2, 2], agentCap: [4, 5, 5], dropEvery: 10, barEvery: [4.8, 4.2, 3.8], patchHp: [110, 100, 90], bars: [1, 2, 2], orbit: [0.32, 0.42, 0.52],
    hints: ['Shoot the black [REDACTED] patch on the balloon. Grey means classified: wait', 'More patches. The vans drop agents; wreck a van to stop it', 'Last stage. Pop it before the leak is blamed on you'],
    ticker: 'BREAKING: OVA WEATHER BALLOON POPS OVER DEPOT; OVA CONFIRMS IT WAS NEVER THERE',
    lines: {
      intro: [
        { who: 'redacted', text: 'Asset. You took the [REDACTED]. The [REDACTED] wants it back. I am the [REDACTED].' },
        { who: 'redacted', text: 'This is a weather balloon. Officially. It has weather in it.' },
        { who: 'player', text: 'Only the black patch reads as a target. Everything else on that thing is classified.' }
      ],
      p2: [{ who: 'redacted', text: 'Vans. More [REDACTED]. Fewer nouns.' }],
      p3: [{ who: 'redacted', text: 'Last [REDACTED]. Then the [REDACTED] is [REDACTED].' }],
      defeat: [
        { who: 'redacted', text: '[REDACTED].' },
        { who: 'player', text: 'She is out of nouns. And balloon.' },
        { who: 'chyron', text: 'BREAKING. Weather balloon pops; OVA says there was no balloon, no weather and no OVA.', ticker: true }
      ]
    },
    barks: {
      fight: ['Meet me at the [REDACTED].', 'This conversation is [REDACTED].', 'Asset, stand still for the [REDACTED].', 'Your file is [REDACTED]. Thick, though.'],
      pop: ['That patch was [REDACTED]. Expensive [REDACTED].', 'Losing [REDACTED]. Altitude, I mean.']
    },
    setup: function (enc) {
      var c = enc.center, d = enc.data;
      d.stage = 1; d.balloonY = c.y + 21; d.ang = 0;
      enc.balloon = enc.addRig({ x: c.x, y: d.balloonY, z: c.z, mesh: Meshes.balloon(), sync: function (r, m) { var s = r.data.scale || 1; m.userData.env.scale.set(s, s * (r.data.squash || 1), s); } });
      enc.balloon.data.scale = 1;
      enc.barkAt = function () { return { x: enc.balloon.x, y: enc.balloon.y - 12, z: enc.balloon.z }; };
      // three tethers from the basket to posts on the lot
      d.tethers = [];
      for (var i = 0; i < 3; i++) {
        var a = i / 3 * TAU, gp = enc.at(Math.cos(a) * 7, Math.sin(a) * 7), t = Meshes.tether();
        enc.addObj(t); d.tethers.push({ mesh: t, x: gp.x, y: gp.y, z: gp.z });
        enc.addObj(part('box', mat(0x8a8a8a, { metal: 0.6 }), gp.x, gp.y + 0.4, gp.z, 0.4, 0.8, 0.4));
      }
    },
    _patch: function (enc) {
      var c = enc.center, d = enc.data, b = enc.balloon;
      var a0 = enc.rng.range(0, TAU);
      var pt = enc.addPart({ kind: 'patch', label: '[REDACTED] PATCH', x: b.x, y: b.y, z: b.z, hp: enc.def.patchHp[Math.max(0, enc.phase - 1)] || 110, mesh: Meshes.patch(), invulnText: '[CLASSIFIED]',
        follow: function (self, dt) {
          var s = b.data.scale || 1, R = 7.1 * s, a = a0 + (self.age * enc.def.orbit[enc.phase - 1]);
          self.x = b.x + Math.cos(a) * R; self.z = b.z + Math.sin(a) * R; self.y = b.y + Math.sin(self.age * 0.9) * 1.6 * s;
          self.yaw = U.dirToYaw(Math.cos(a), Math.sin(a));
          // the classified beat: 4.5 s open, a 0.7 s flash, 2.5 s grey
          var cyc = self.age % 7.7; self.invuln = cyc > 5.2;
          var flash = cyc > 4.5 && cyc <= 5.2 && Math.floor(cyc * 10) % 2 === 0;
          var ud = self.mesh && self.mesh.userData;
          var look = self.invuln ? 2 : flash ? 1 : 0;
          if (ud && look !== self.data.look) { self.data.look = look; ud.plate.material.color.setHex(self.invuln ? 0x777777 : 0xffffff); ud.halo.material = mat(look === 2 ? 0x9a9a9a : look === 1 ? 0xffffff : 0xff3b30, { basic: true, opacity: 0.35, side: THREE.DoubleSide }); }
        } });
      pt.mesh.rotation.order = 'YXZ';
      d.patch = pt;
    },
    _van: function (enc, k) {
      var c = enc.center, a = k * Math.PI + enc.rng.range(-0.3, 0.3), r = DEFS.b04_redacted._lap(enc, a);
      var s = spotNear(enc.rng, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, 0, 6, true);
      var v = new GTP.Vehicle({ x: s.x, z: s.z, type: 'van', color: '#4c4c4c', persistent: true, tag: 'ova_van' });
      v.y = s.y; v.yaw = a; v.snap(); v.bossVan = enc.id; E().add(v); enc.vehicles.push(v);
      var dvr = newPed({ x: s.x, z: s.z, look: rollLook('thug', s.x, s.z, { shirt: '#d9cfa6', pants: '#d9cfa6', hat: 'cap', glasses: 'shades' }), role: 'thug', ai: { phase: 0.5, mode: 'mission', mission: 'driver', ambient: false } });
      dvr.hostile = true; enc.adds.push(dvr); v.enter(dvr, 0);
      v.data = { ang: a, dropT: 6 + k * 4, stopT: 0 };
      return v;
    },
    phase: function (enc, n) {
      var d = enc.data, def = enc.def;
      d.need = def.patches[n - 1]; d.popped = 0; d.patchT = 0;
      // one patch at a time: a patch still up from the last stage carries over
      if (!d.patch || d.patch.removed || d.patch.down) DEFS.b04_redacted._patch(enc);
      var vans = 0; for (var i = 0; i < enc.vehicles.length; i++) { var vv = enc.vehicles[i]; if (!vv.wreck && !vv.removed && !vv._bossCounted && vv.driver) vans++; }
      for (i = vans; i < def.vans[n - 1]; i++) DEFS.b04_redacted._van(enc, i);
    },
    partBroken: function (enc, pt) {
      var d = enc.data, b = enc.balloon, def = enc.def;
      if (pt.bossPart !== 'patch') return;
      d.popped++; if (d.patch === pt) d.patch = null;
      fx({ type: 'puff', x: pt.x, y: pt.y, z: pt.z, size: 4, life: 0.8, color: 0xf0f0f0 });
      textFx('PSSSHT', pt.x, pt.y + 1, pt.z, '#ffffff', 1.4);
      b.data.scale = Math.max(0.45, (b.data.scale || 1) - 0.065);
      enc.randomBark('pop');
      var share = (enc.maxHp / enc.phases) / d.need;
      enc.hurt(share + 0.01);
      if (enc.state === 'fight' && d.popped < d.need && !d.patch) d.patchT = 3;
    },
    // the vans' lap: 22 m out, pulled in wherever the lot ends (the depot sits on the waterfront: a van never laps into the
    // harbour or a wall); one radius per 15 degrees, from the tiles
    _lap: function (enc, ang) {
      var d = enc.data, c = enc.center, n = 24, i;
      if (!d.lap) {
        var Wd = W(), T = Wd.T;
        var ok = function (x, z) { var t = Wd.tileAt(x, z); return (t === T.ROAD || t === T.PARKING || t === T.PLAZA || t === T.SIDEWALK || t === T.GRASS || t === T.SAND) && !Wd.solidAt(x, z, 0.5); };
        d.lap = [];
        for (i = 0; i < n; i++) {
          var a = i / n * TAU, ca = Math.cos(a), sa = Math.sin(a), r = 22;
          for (; r > 9; r -= 1.5) {
            var good = true;
            for (var q = -4; q <= 4 && good; q += 2) good = ok(c.x + ca * (r + q), c.z + sa * (r + q)) && ok(c.x + ca * r - sa * q, c.z + sa * r + ca * q);
            if (good) break;
          }
          d.lap.push(r);
        }
      }
      var k = ((ang / TAU) % 1 + 1) % 1 * n, i0 = Math.floor(k) % n, f = k - Math.floor(k);
      return d.lap[i0] * (1 - f) + d.lap[(i0 + 1) % n] * f;
    },
    update: function (enc, dt) {
      var d = enc.data, def = enc.def, n = enc.phase, p = player(), c = enc.center, b = enc.balloon, i;
      // the balloon bobs and sinks a little with every stage
      var targetY = c.y + 21 - (1 - (b.data.scale || 1)) * 14;
      b.y = U.damp(b.y, targetY + Math.sin(enc.t * 0.6) * 0.6, 1.2, dt); b.x = c.x + Math.sin(enc.t * 0.23) * 1.5; b.z = c.z + Math.cos(enc.t * 0.19) * 1.5; b.yaw += dt * 0.05;
      for (i = 0; i < d.tethers.length; i++) {
        var tt = d.tethers[i], bx = b.x, by = b.y - 10.4, bz = b.z, dx = bx - tt.x, dy = by - tt.y, dz = bz - tt.z, l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        tt.mesh.position.set((bx + tt.x) / 2, (by + tt.y) / 2, (bz + tt.z) / 2); tt.mesh.scale.set(0.08, l, 0.08);
        tt.mesh.quaternion.setFromUnitVectors(UP, TMPV.set(dx / l, dy / l, dz / l));
      }
      if (d.patchT > 0) { d.patchT -= dt; if (d.patchT <= 0 && !d.patch) DEFS.b04_redacted._patch(enc); }
      if (p) enc.every('bars', def.barEvery[n - 1], dt, function () {
        for (var k = 0; k < def.bars[n - 1]; k++) {
          var yaw = enc.rng.range(0, TAU), off = k === 0 ? 0 : enc.rng.range(-6, 6);
          enc.addTele({ shape: 'strip', x: p.x + off, z: p.z + enc.rng.range(-3, 3), yaw: yaw, len: 10, w: 3.4, warn: 1.5, dmg: 14, knock: 5, color: 0x111111, edgeColor: 0xffffff, label: k === 0 ? '[REDACTED]' : null,
            onStrike: function (t) { textFx('[REDACTED]', t.x, t.y + 1, t.z, '#ffffff', 1); fx({ type: 'smoke', x: t.x, y: t.y + 0.5, z: t.z, size: 3, life: 0.8, color: 0x111111, vy: 0.5 }); } });
        }
        if (enc.rng.chance(0.35)) enc.randomBark('fight');
      });
      // the vans: lap the lot; a stop drops two agents in balloon-repair coveralls
      var liveVans = 0;
      for (i = enc.vehicles.length - 1; i >= 0; i--) {
        var v = enc.vehicles[i];
        if (v.removed) { enc.vehicles.splice(i, 1); continue; }
        if (v.wreck || v.burning || !v.driver) { if (!v._bossCounted) { v._bossCounted = true; textFx('VAN DOWN', v.x, v.y + 2.6, v.z, '#9dff3c', 1.4); if (v.driver && v.driver.alive) { var dv = v.driver; v.exit(dv); dv.ai = enc.brawlerBrain('thug'); } d.vanRespawn = 25; } continue; }
        liveVans++;
        var vd = v.data;
        vd.dropT -= dt;
        if (vd.stopT > 0) {
          vd.stopT -= dt; v.setControls(0, 0, false, 1);
          if (vd.stopT <= 0.6 && !vd.dropped) {
            vd.dropped = true;
            if (enc.liveAdds() < def.agentCap[n - 1]) {
              // the last stage brings a sidearm, one at a time: the merged lock-on lets goons steal the lock from the patch, so
              // two of the missions' gunmen on top of the bars was a wall (tests/bosses.js died four times in phase 3)
              var gun = n >= 3; for (var g2 = 0; g2 < enc.adds.length && gun; g2++) if (!pedOut(enc.adds[g2]) && enc.adds[g2].weapon === 'pistol') gun = false;
              var back = U.yawToDir(v.yaw + Math.PI);
              for (var q = 0; q < 2; q++) enc.spawnAdd('thug', v.x + back.x * 4 + (q - 0.5) * 1.6, v.z + back.z * 4, { weapon: gun && q === 0 ? 'pistol' : 'fist', look: { shirt: '#d9cfa6', pants: '#d9cfa6', hat: 'cap' }, name: 'OVA Agent' });
            }
            textFx('AGENTS DEPLOYED', v.x, v.y + 2.8, v.z, '#d9cfa6', 1.4);
          }
          continue;
        }
        if (vd.dropT <= 0) { vd.dropT = def.dropEvery; vd.stopT = 2.4; vd.dropped = false; continue; }
        vd.ang += dt * 0.3;
        var lr = DEFS.b04_redacted._lap(enc, vd.ang + 0.35);
        steerTo(v, c.x + Math.cos(vd.ang + 0.35) * lr, c.z + Math.sin(vd.ang + 0.35) * lr, 11);
      }
      if (d.vanRespawn > 0) { d.vanRespawn -= dt; if (d.vanRespawn <= 0 && liveVans < def.vans[n - 1]) DEFS.b04_redacted._van(enc, liveVans); }
    },
    defeat: function (enc) {
      var b = enc.balloon, c = enc.center;
      fx({ type: 'explosion', x: b.x, y: b.y, z: b.z, size: 14, life: 0.6, color: 0xffffff });
      for (var i = 0; i < 12; i++) fx({ type: 'puff', x: b.x + Math.cos(i) * 5, y: b.y + Math.sin(i * 1.3) * 4, z: b.z + Math.sin(i) * 5, size: 4, life: 1.4, color: 0xeeeeee });
      textFx('POP', b.x, b.y + 4, b.z, '#ffffff', 2.4); sfx('explode', b.x, b.z, 1); shake(0.6);
      b.mesh.userData.env.visible = false; enc.data.falling = true;
      for (i = 0; i < enc.vehicles.length; i++) { var v = enc.vehicles[i]; if (v.driver && !v.wreck) { var dv = v.driver; v.exit(dv); releasePed(dv, true); } }
      // she floats down in the basket, then stands up out of it
      enc.data.landAt = enc.at(0, 3);
      void c;
    },
    after: function (enc, dt) {
      var b = enc.balloon, d = enc.data; if (!b || !d.falling) return;
      var ly = groundY(d.landAt.x, d.landAt.z, enc.center.y) + 10.4 + 0.6;
      b.x = U.damp(b.x, d.landAt.x, 1, dt); b.z = U.damp(b.z, d.landAt.z, 1, dt); b.y = Math.max(ly, b.y - dt * 4.5);
      if (b.y <= ly + 0.01 && !d.landed) {
        d.landed = true; b.mesh.userData.agent.visible = false;
        var r = enc.addPed('redacted', d.landAt.x + 1.6, d.landAt.z, { boss: true });
        enc.peds.splice(enc.peds.indexOf(r), 1); enc.ped = r; humiliate(enc, r);
      }
    },
    target: function (enc) { return enc.data.patch && !enc.data.patch.removed ? enc.data.patch : enc.balloon; }
  };

  // ------------------------------------------------------------------ b05 ---
  // Five folding tables. Dunk runs to one and plays a card over his head; every card has a counter:
  //   DIDN'T READ  a charge down a flashing strip: step out (or jump) and he trips over the table: STUNNED
  //   RATIO        a ring from his table: jump it as it passes: LEFT ON READ, stunned
  //   QUOTE POST   two reply guys: drop them both inside 10 s and he is NO REPLIES, stunned (else he heals)
  //   BLOCKED      guard up: hitting him bounces you; hold off until it drops and he is OVERCOMMITTED, stunned
  // Hits outside a stun do a quarter; a stun takes full damage (capped per window, so it is two counters a phase at least).
  var CARDS = {
    didntread: { text: 'DIDN\'T READ', bg: '#c8102e', fg: '#ffffff', hint: 'DIDN\'T READ: step out of the flashing line (or jump)' },
    ratio: { text: 'RATIO', bg: '#8e3a8e', fg: '#ffffff', hint: 'RATIO: jump (Space) as the ring reaches you' },
    quote: { text: 'QUOTE POST', bg: '#15a0c8', fg: '#ffffff', hint: 'QUOTE POST: knock both reply guys down fast' },
    blocked: { text: 'BLOCKED', bg: '#5c5c5c', fg: '#ffffff', hint: 'BLOCKED: do not hit him until the guard drops' }
  };
  DEFS.b05_dunk = {
    id: 'b05_dunk', name: 'Ptolemy Dunk', cast: 'dunk', title: 'Table to Table',
    arena: { landmark: 'campus_quad', offset: { x: 0, z: -20 } }, place: 'the quad',
    maxHp: 240, thresholds: [160, 80, 0], dmgScale: 1, shieldText: 'BLOCKED', windowCap: 55,
    deck: [['didntread', 'ratio', 'blocked'], ['didntread', 'ratio', 'blocked', 'quote'], ['didntread', 'ratio', 'blocked', 'quote']],
    // fists and counters only: a gun at a campus folding-table debate reads as a real event (CONTENT_RULES 2); guns stay
    // holstered from the intro to the walk-off and no weapon crate drops
    tell: [1.45, 1.2, 1.0], stun: [3.2, 2.9, 2.6], chain: [1, 1, 2], noGuns: 'No guns at the debate tables. Fists and counters.',
    hints: ['Read the card over Dunk\'s head and counter it. Hit him while he is STUNNED', 'He quote-posts now. Clear the replies, then hit him', 'Two cards in a row. Read both'],
    ticker: 'BREAKING: DUNK DESTROYS TAKESWORTH, ACCORDING TO THE CALENDAR; FOOTAGE DISAGREES',
    lines: {
      intro: [
        { who: 'dunk', text: 'Calendar says Thursday: Dunk destroys Takesworth. Didn\'t read the rest.' },
        { who: 'dunk', text: 'Table to table, man. Every table\'s mine. I play cards. You read them. I don\'t.' },
        { who: 'player', text: 'He telegraphs every card over his head. He never reads them. I can.' }
      ],
      p2: [{ who: 'dunk', text: 'Quote-posting you to my replies. They also didn\'t read.' }],
      p3: [{ who: 'dunk', text: 'Combo. Two cards. I\'ve never finished a thought, but I\'ve ended two.' }],
      defeat: [
        { who: 'dunk', text: 'Didn\'t lose. Didn\'t read the score. Logging off. Replying later.' },
        { who: 'player', text: 'Ratio\'d at his own table. The calendar is going to need an edit.' },
        { who: 'chyron', text: 'BREAKING. Dunk says the fight "didn\'t count," posts eleven times about it.', ticker: true }
      ]
    },
    barks: {
      fight: ['Didn\'t read. Replied anyway.', 'Next table, man.', 'You\'re on the billboard. Both billboards.', 'Ratio incoming.'],
      stunned: ['Wait, did I read that?', 'That one counted? Didn\'t read the rules.', 'Ow. Muting this.'],
      blocked: ['Blocked. Read that.', 'Can\'t hit what you\'re blocked from.']
    },
    setup: function (enc) {
      var d = enc.data; d.tables = [];
      for (var i = 0; i < 5; i++) {
        var a = i / 5 * TAU - Math.PI / 2, pt = enc.at(Math.cos(a) * 8, Math.sin(a) * 8);
        enc.addRig({ x: pt.x, y: pt.y, z: pt.z, yaw: U.dirToYaw(enc.center.x - pt.x, enc.center.z - pt.z) + Math.PI, mesh: Meshes.table(i % 2 ? 'ACTUALLY,\nDIDN\'T READ' : 'SAME SPONSOR') });
        d.tables.push(pt);
      }
      var dk = enc.addPed('dunk', d.tables[0].x, d.tables[0].z + 1, { boss: true, weapon: 'fist' });
      enc.peds.splice(enc.peds.indexOf(dk), 1);
      d.cardSprite = null; d.mode = 'move'; d.tableI = 0; d.queue = [];
    },
    phase: function (enc, n) {
      var d = enc.data;
      d.mode = 'move'; d.t = 0; d.queue = []; enc.vuln = 0.25; enc.shield = false;
      DEFS.b05_dunk._card(enc, null);
      d.tableI = (d.tableI + 2) % 5;
      if (n === 3) enc.spawnAdds('thug', 2, 9, 16, { look: { shirt: '#111111', sign: 'FIRST' }, name: 'Reply Guy' });
    },
    _card: function (enc, id) {
      var d = enc.data;
      if (d.cardSprite) { sceneRemove(d.cardSprite); var k = enc.objs.indexOf(d.cardSprite); if (k >= 0) enc.objs.splice(k, 1); d.cardSprite = null; }
      d.card = id; enc.data.card = id;
      if (!id) { enc.hint = enc.def.hints[enc.phase - 1]; return; }
      var cd = CARDS[id], dk = enc.ped;
      d.cardSprite = enc.addObj(sprite(cd.text, cd.bg, cd.fg, 2.6, 1.3));
      if (dk && dk.mesh) { dk.mesh.add(d.cardSprite); d.cardSprite.position.set(0, 2.9, 0); }
      enc.hint = cd.hint;
      enc.emitPhase(true);
    },
    _stun: function (enc, why) {
      var d = enc.data, dk = enc.ped;
      d.mode = 'stunned'; d.t = 0; enc.vuln = 1; enc.shield = false; enc.windowDmg = 0;
      DEFS.b05_dunk._card(enc, null);
      enc.hint = why + ': Dunk is stunned. Hit him!';
      textFx(why, dk.x, dk.y + 2.6, dk.z, '#9dff3c', 1.8);
      enc.randomBark('stunned');
      enc.emitPhase(true);
      enc.log.push({ t: enc.t, ev: 'counter', why: why });
      emit('boss:counter', { id: enc.id, why: why });
    },
    onShieldHit: function (enc, n, src) {
      var p = player(), d = enc.data;
      if (d.card !== 'blocked' || !p) return;
      d.blockHits = (d.blockHits || 0) + 1;
      if (src === p && simT() - (d.bounceT || -9) > 0.7) {
        d.bounceT = simT();
        var dk = enc.ped, nx = p.x - dk.x, nz = p.z - dk.z, l = Math.sqrt(nx * nx + nz * nz) || 1;
        if (U.dist2d(p.x, p.z, dk.x, dk.z) < 3.5) p.knockDown(nx / l * 6, nz / l * 6, 5, dk, 'boss');
        textFx('BLOCKED', dk.x, dk.y + 2.4, dk.z, '#bfbfbf', 0.9);
        if (enc.rng.chance(0.5)) enc.randomBark('blocked');
      }
    },
    onShout: function (enc) { var d = enc.data; if (d.card === 'blocked' || d.mode === 'move') DEFS.b05_dunk._stun(enc, 'SHOUTED DOWN'); },
    update: function (enc, dt) {
      var d = enc.data, def = enc.def, n = enc.phase, dk = enc.ped, p = player();
      if (!dk || dk.removed || !p) return;
      d.t = (d.t || 0) + dt;
      if (d.cardSprite) { if (d.cardSprite.parent === dk.mesh) d.cardSprite.position.set(0, 2.9 + Math.sin(enc.t * 5) * 0.06, 0); else d.cardSprite.position.set(dk.x, dk.y + 2.9, dk.z); }
      if (dk.knockedDown && d.mode !== 'stunned') return;
      var tb = d.tables[d.tableI];
      switch (d.mode) {
        case 'move': {
          var dist = dk.moveTo(tb.x, tb.z + 0.9, true);
          if (dist < 0.8 || d.t > 4) {
            dk.stop(); d.mode = 'tell'; d.t = 0;
            if (!d.queue.length) { var deck = def.deck[n - 1]; for (var c = 0; c < def.chain[n - 1]; c++) d.queue.push(deck[enc.rng.int(0, deck.length - 1)]); }
            d.cur = d.queue.shift(); DEFS.b05_dunk._card(enc, d.cur);
            if (d.cur === 'didntread') {
              var yaw = U.dirToYaw(p.x - dk.x, p.z - dk.z), f = U.yawToDir(yaw), len = U.dist2d(p.x, p.z, dk.x, dk.z) + 7;
              d.charge = { yaw: yaw, sx: dk.x, sz: dk.z, len: len, hit: false };
              d.chargeTele = enc.addTele({ shape: 'strip', x: dk.x + f.x * len / 2, z: dk.z + f.z * len / 2, yaw: yaw, len: len, w: 2.6, warn: def.tell[n - 1], dmg: 0, knock: 0, color: 0xc8102e, label: null });
            } else if (d.cur === 'blocked') { enc.shield = true; enc.shieldText = 'BLOCKED'; d.blockHits = 0; }
          }
          break;
        }
        case 'tell': {
          standFacing(dk, dt);
          if (d.cur === 'didntread' && d.charge) dk.yaw = d.charge.yaw;
          if (d.t >= def.tell[n - 1]) {
            d.t = 0;
            if (d.cur === 'didntread') { d.mode = 'charge'; }
            else if (d.cur === 'ratio') {
              d.mode = 'ratio'; d.ringDodged = false;
              enc.addTele({ shape: 'ring', x: dk.x, z: dk.z, r0: 1, speed: 8.5, maxR: 13, band: 1.5, warn: 0.05, dmg: 12, knock: 6, jumpable: true, color: 0x8e3a8e,
                onDodge: function () { d.ringDodged = true; }, onPass: function () { d.ringDone = true; } });
              d.ringDone = false; sfx('dunk', dk.x, dk.z, 0.8);
            } else if (d.cur === 'quote') {
              d.mode = 'quote'; d.replies = enc.spawnAdds('thug', 2, 3, 6, { look: { shirt: '#15e0ff', sign: 'RATIO' }, name: 'Reply Guy' });
              textFx('QUOTE POSTED', dk.x, dk.y + 2.6, dk.z, '#15e0ff', 1.4);
            } else if (d.cur === 'blocked') { d.mode = 'block'; }
          }
          break;
        }
        case 'charge': {
          var cf = U.yawToDir(d.charge.yaw), sp = 13 * dt;
          var r = W().resolveCapsule(dk.x + cf.x * sp, dk.z + cf.z * sp, dk.y, dk.radius); dk.x = r.x; dk.z = r.z; dk.y = groundY(dk.x, dk.z, dk.y); dk.yaw = d.charge.yaw;
          dk.intent.x = cf.x; dk.intent.z = cf.z; dk.intent.run = true;
          if (!d.charge.hit && U.dist2d(dk.x, dk.z, p.x, p.z) < 1.4 && !airborne(p) && !p.inVehicle) {
            d.charge.hit = true; var l = 1; p.knockDown(cf.x * 7 / l, cf.z * 7 / l, 14, dk, 'boss'); textFx('DIDN\'T READ', p.x, p.y + 2, p.z, '#c8102e', 1);
          }
          var trav = U.dist2d(dk.x, dk.z, d.charge.sx, d.charge.sz);
          if (trav >= d.charge.len || d.t > 2.2 || (r.hitX || r.hitZ)) {
            dk.stop();
            if (d.charge.hit) { enc.bark('Didn\'t read. Still won.'); DEFS.b05_dunk._next(enc); }
            else { dk.knockDown(cf.x * 3, cf.z * 3, 0, null, 'trip'); DEFS.b05_dunk._stun(enc, 'TRIPPED OVER A TABLE'); }
          }
          break;
        }
        case 'ratio':
          standFacing(dk, dt);
          if (d.ringDodged) { DEFS.b05_dunk._stun(enc, 'LEFT ON READ'); break; }
          if (d.ringDone) DEFS.b05_dunk._next(enc);
          break;
        case 'quote': {
          standFacing(dk, dt);
          var live = 0; for (var i = 0; i < d.replies.length; i++) if (!pedOut(d.replies[i]) && !d.replies[i].knockedDown) live++;
          if (live === 0) { DEFS.b05_dunk._stun(enc, 'NO REPLIES'); break; }
          if (d.t > 10) { enc.hp = Math.min(enc.hp + 15, enc.phase > 1 ? def.thresholds[enc.phase - 2] : enc.maxHp); enc.bark('Engagement! Healing on engagement.'); enc.emitPhase(true); DEFS.b05_dunk._next(enc); }
          break;
        }
        case 'block':
          standFacing(dk, dt);
          if (d.t > 2.6) {
            enc.shield = false;
            if ((d.blockHits || 0) === 0) DEFS.b05_dunk._stun(enc, 'OVERCOMMITTED');
            else { textFx('YOU TOOK THE BAIT', dk.x, dk.y + 2.4, dk.z, '#bfbfbf', 1.2); DEFS.b05_dunk._next(enc); }
          }
          break;
        case 'stunned':
          dk.stop();
          if (d.t > def.stun[n - 1]) { enc.vuln = 0.25; DEFS.b05_dunk._next(enc); }
          break;
        case 'recover':
          if (d.t > 0.6) { d.mode = 'move'; d.t = 0; }
          break;
      }
    },
    _next: function (enc) {
      var d = enc.data;
      enc.shield = false; enc.vuln = 0.25; DEFS.b05_dunk._card(enc, null);
      if (d.queue.length) { d.mode = 'move'; d.t = 0; return; }
      var nt = d.tableI; while (nt === d.tableI) nt = enc.rng.int(0, 4);
      d.tableI = nt; d.mode = 'recover'; d.t = 0;
      if (enc.rng.chance(0.4)) enc.randomBark('fight');
      enc.emitPhase(true);
    },
    target: function (enc) {
      var d = enc.data;
      if (d.mode === 'quote' && d.replies) for (var i = 0; i < d.replies.length; i++) if (!pedOut(d.replies[i]) && !d.replies[i].knockedDown) return d.replies[i];
      return enc.ped;
    }
  };

  // ------------------------------------------------------------------ b06 ---
  // The panel at TYN: five podiums, five identical answers. Debate rounds (the UI's debate minigame: a loss costs health and
  // the round restarts) alternate with combat waves of the subscribers' security under a rain of Monday Memo pages. Each won
  // round ratios two panelists; the last is ONE MEMO against all five.
  DEFS.b06_panel = {
    id: 'b06_panel', name: 'The Panel', cast: 'chyron', title: 'Five Guests, One Memo',
    arena: { landmark: 'protest_plaza', offset: { x: 100, z: 40 } }, place: 'the outdoor set west of the stadium',
    maxHp: 500, thresholds: [400, 300, 200, 100, 0], dmgScale: 1, shieldText: 'WAIT FOR YOUR SEGMENT',
    kinds: ['debate', 'wave', 'debate', 'wave', 'debate'],
    rounds: [{ vs: ['goldplate', 'warbanner'], params: { rounds: 2, points: 3, timer: 4, bluff: 0.3, opponent: 'panel' } }, null,
      { vs: ['velvetine', 'footnote'], params: { rounds: 2, points: 3, timer: 3.5, bluff: 0.35, opponent: 'panel' } }, null,
      { vs: ['dunk', 'goldplate', 'warbanner', 'velvetine', 'footnote'], params: { rounds: 3, points: 3, timer: 3, bluff: 0.4, opponent: 'panel' } }],
    waves: [null, { thug: 6, swat: 1 }, null, { thug: 8, swat: 2 }, null],
    hints: ['Debate round: beat Goldplate and Warbanner', 'Security! Clear the studio floor; dodge the memo pages', 'Debate round: beat Velvetine and Footnote', 'More security. Clear them out', 'ONE MEMO: beat the whole panel'],
    ticker: 'BREAKING: PANEL OF FIVE LOSES TO ONE KID WITH NO MEMO; WE\'LL HAVE TO LEAVE IT THERE',
    lines: {
      intro: [
        { who: 'chyron', text: 'BREAKING. Panel. Five guests. One kid. One memo. Two minutes. One.' },
        { who: 'goldplate', text: 'Mattress. Jets. Pellets. I rate it a ten.' },
        { who: 'warbanner', text: 'Mattress. Jets. Pellets. And that\'s why we need the jets.' },
        { who: 'player', text: 'Same answer five times. Beat the answer, not the guest.' }
      ],
      p2: [{ who: 'chyron', text: 'BREAKING. Security has questions. Physical ones.' }],
      p3: [{ who: 'velvetine', text: 'To the memo! Mattress, jets, pellets!' }, { who: 'footnote', text: 'Citation: the memo. Peer review: the memo.' }],
      p4: [{ who: 'chyron', text: 'We\'ll be right back after this: more security.' }],
      p5: [{ who: 'dunk', text: 'Didn\'t read it. Mattress. Jets. Pellets.' }, { who: 'chyron', text: 'Final segment. ONE MEMO. All five, one kid.' }],
      defeat: [
        { who: 'chyron', text: 'BREAKING. The panel has been ratio\'d. By a folding table.' },
        { who: 'dunk', text: 'Didn\'t read the result. Same sign, next table.' },
        { who: 'chyron', text: 'WE\'LL HAVE TO LEAVE IT THERE.' }
      ],
      lost: [{ who: 'chyron', text: 'The panel talks over you. Again. Take two.' }]
    },
    barks: {
      fight: ['Mattress. Jets. Pellets.', 'Respectfully.', 'Per the memo.', 'Rate it a ten.'],
      wave: ['Security to the floor!', 'Cut to commercial! Physically!']
    },
    setup: function (enc) {
      var d = enc.data, ids = ['goldplate', 'warbanner', 'velvetine', 'footnote', 'dunk'], cols = ['#e8b53a', '#3d6fcf', '#8e3a8e', '#2f9e6a', '#111111'];
      d.panel = {};
      for (var i = 0; i < ids.length; i++) {
        var a = Math.PI + (i - 2) * 0.42, pt = enc.at(Math.sin(a) * 11, Math.cos(a) * 11), face = U.dirToYaw(enc.center.x - pt.x, enc.center.z - pt.z);
        enc.addRig({ x: pt.x, y: pt.y, z: pt.z, yaw: face, mesh: Meshes.podium(castName(ids[i]).split(' ').pop().toUpperCase(), cols[i], '#ffffff') });
        var back = U.yawToDir(face + Math.PI), pp = enc.addPed(ids[i], pt.x + back.x * 0.9, pt.z + back.z * 0.9, { yaw: face });
        d.panel[ids[i]] = pp;
      }
      var dpt = enc.at(0, 9); enc.addRig({ x: dpt.x, y: dpt.y, z: dpt.z, mesh: Meshes.desk() });
      d.chyron = enc.addPed('chyron', dpt.x, dpt.z + 1.1, { yaw: Math.PI });
      enc.ped = null;
      enc.barkAt = function () { return d.chyron || enc.center; };
    },
    phase: function (enc, n) {
      var d = enc.data, def = enc.def, kind = def.kinds[n - 1];
      d.kind = kind; d.result = null; d.waveI = 0; d.waveAdds = [];
      enc.shield = kind === 'debate';
      if (kind === 'debate') DEFS.b06_panel._debate(enc, n);
      else { d.waveT = 0.5; d.waveLeft = 2; }
    },
    _debate: function (enc, n) {
      var d = enc.data, def = enc.def, round = def.rounds[n - 1], UI = GTP.UI;
      d.result = null; d.debating = true;
      var done = function (win) { d.result = win ? 'win' : 'lose'; d.debating = false; d.cb = null; };
      d.cb = done;
      if (UI && typeof UI.startMinigame === 'function' && !K.noMinigame) {
        d.mode = 'minigame';
        try { UI.startMinigame('debate', Object.assign({ boss: enc.id, vs: round.vs }, round.params), done); } catch (e) { U.reportError(e, 'bosses.debate'); DEFS.b06_panel._takeDuel(enc, n); }
      } else DEFS.b06_panel._takeDuel(enc, n);
    },
    // the in-world fallback: the panel's talking points orbit the studio floor; break four of five before the segment ends
    _takeDuel: function (enc, n) {
      var d = enc.data, words = ['MATTRESS', 'JETS', 'PELLETS', 'RATE IT A TEN', 'RESPECTFULY'];
      d.mode = 'duel'; d.duelT = 30; d.duelNeed = 4; d.duelBroken = 0; enc.shield = true;
      for (var i = 0; i < words.length; i++) {
        (function (k) {
          enc.addPart({ kind: 'talkingpoint', label: words[k], x: enc.center.x, y: enc.center.y + 2.2, z: enc.center.z, hp: 26, mesh: Meshes.memoCard(words[k]),
            follow: function (self) { var a = k / words.length * TAU + self.age * 0.5; self.x = enc.center.x + Math.cos(a) * 6; self.z = enc.center.z + Math.sin(a) * 6; self.y = enc.center.y + 2.2 + Math.sin(self.age * 2 + k) * 0.4; self.yaw = -a; },
            onBreak: function () { d.duelBroken++; } });
        })(i);
      }
      enc.hint = 'Debate (no minigame): break four talking points before the segment ends';
      void n;
    },
    update: function (enc, dt) {
      var d = enc.data, def = enc.def, n = enc.phase, p = player(), id;
      for (id in d.panel) { var pp = d.panel[id]; if (pp && !pp.removed && !pp.humiliated) standFacing(pp, dt); }
      if (d.chyron && !d.chyron.removed) standFacing(d.chyron, dt);
      if (d.kind === 'debate') {
        if (d.mode === 'duel') {
          d.duelT -= dt;
          if (d.duelBroken >= d.duelNeed) d.result = 'win';
          else if (d.duelT <= 0) d.result = 'lose';
          if (d.result) { for (var i = 0; i < enc.parts.length; i++) if (!enc.parts[i].removed) E().remove(enc.parts[i]); }
        }
        if (d.result === 'win') {
          d.result = null; enc.shield = false;
          var vs = def.rounds[n - 1].vs;
          for (var k = 0; k < vs.length; k++) { var ped = d.panel[vs[k]]; if (ped && !ped.removed && !ped.humiliated) humiliate(enc, ped); }
          textFx('ROUND WON', enc.center.x, enc.center.y + 3, enc.center.z, '#9dff3c', 1.8);
          enc.hurt(enc.hp - def.thresholds[n - 1]);
        } else if (d.result === 'lose') {
          d.result = null;
          if (p && p.alive) p.applyDamage(18, null, 'boss');
          if (enc.state === 'ended' || !p || !p.alive) return;   // the round's loss was the last straw: the fight is over
          textFx('TALKED OVER', p.x, p.y + 2.2, p.z, '#ff3b30', 1.6);
          d.retryT = 3.5; d.mode = 'wait';
          enc.say(def.lines.lost);
        } else if (d.mode === 'wait') {
          d.retryT -= dt;
          if (d.retryT <= 0) DEFS.b06_panel._debate(enc, n);
        }
        return;
      }
      // a wave: two pushes of the subscribers' security, memo pages raining on the floor
      if (d.waveLeft > 0) {
        d.waveT -= dt;
        if (d.waveT <= 0) {
          d.waveLeft--; d.waveT = 12;
          var w = def.waves[n - 1];
          for (var role in w) {
            var cnt = Math.ceil(w[role] / 2);
            var got = enc.spawnAdds(role, cnt, 10, 18, { weapon: role === 'swat' ? 'pistol' : 'fist', name: 'Security', look: role === 'thug' ? { shirt: '#c8102e', sign: 'TYN' } : null });
            d.waveAdds = d.waveAdds.concat(got);
          }
          enc.randomBark('wave');
        }
      }
      if (p) enc.every('memo', 3.4, dt, function () {
        for (var q = 0; q < 2; q++) enc.addTele({ shape: 'circle', x: p.x + (q ? enc.rng.range(-5, 5) : (p.vx || 0) * 0.5), z: p.z + (q ? enc.rng.range(-5, 5) : (p.vz || 0) * 0.5), r: 2.2, warn: 1.4, dmg: 10, knock: 3, color: 0xfff4c0, label: q ? null : 'MONDAY MEMO',
          onStrike: function (t) { textFx('RESPECTFULY', t.x, t.y + 1, t.z, '#c8102e', 0.9); fx({ type: 'puff', x: t.x, y: t.y + 0.4, z: t.z, size: 2, life: 0.5, color: 0xfffbe8 }); } });
      });
      var live = 0; for (var j = 0; j < d.waveAdds.length; j++) { var a = d.waveAdds[j]; if (pedOut(a)) continue; if (a.knockedDown && a.hp < a.maxHp * 0.35) { releasePed(a, true); a.fled = true; continue; } live++; }
      var total = 0; for (role in def.waves[n - 1]) total += def.waves[n - 1][role];
      var outN = d.waveAdds.length - live;
      // the bar follows the floor being cleared
      var share = (enc.maxHp / enc.phases), target = (n > 1 ? def.thresholds[n - 2] : enc.maxHp) - share * Math.min(1, outN / Math.max(1, total)) * 0.98;
      if (enc.hp > target + 0.5) { enc.hp = target; enc.emitPhase(false); }
      if (d.waveLeft === 0 && live === 0 && d.waveAdds.length >= total) enc.hurt(enc.hp - def.thresholds[n - 1]);
    },
    target: function (enc) {
      var d = enc.data, p = player(), best = null, bd = 1e9;
      if (d.kind === 'wave') { for (var i = 0; i < d.waveAdds.length; i++) { var a = d.waveAdds[i]; if (pedOut(a)) continue; var dd = U.dist2d(p.x, p.z, a.x, a.z); if (dd < bd) { bd = dd; best = a; } } return best; }
      if (d.mode === 'duel') { for (i = 0; i < enc.parts.length; i++) { var s = enc.parts[i]; if (s.removed) continue; dd = U.dist2d(p.x, p.z, s.x, s.z); if (dd < bd) { bd = dd; best = s; } } return best; }
      return d.chyron;
    },
    cleanup: function (enc) {
      var d = enc.data;
      if (d.debating && d.mode === 'minigame' && GTP.UI && GTP.UI.endMinigame) { try { GTP.UI.endMinigame(); } catch (e) { /* ui optional */ } var g = game(); if (g && g.state === 'minigame') g.setState('playing'); }
    }
  };

  // =================================================================== GTP.Bosses ==
  var Bosses = GTP.Bosses = {
    K: K,
    defs: DEFS,
    ids: Object.keys(DEFS),
    active: null,
    // id -> the encounter (or null). opts: {at:{x,z}, mission:bool, phase:n (start at that phase)}
    spawn: function (id, opts) {
      opts = opts || {};
      var def = DEFS[id]; if (!def) { U.reportError(new Error('unknown boss ' + id), 'bosses.spawn'); return null; }
      installLate();
      for (var i = active.length - 1; i >= 0; i--) if (active[i].id === id) active[i].end('respawn');
      if (opts.phase > 1) pendingResume = { bossId: id, phase: opts.phase };
      var enc = new Encounter(def, opts);
      active.push(enc); Bosses.active = enc;
      try { enc.start(); } catch (e) { U.reportError(e, 'bosses.start ' + id); }
      return enc;
    },
    get: function (id) { for (var i = 0; i < active.length; i++) if (!id || active[i].id === id) return active[i]; return null; },
    list: function () { return active.slice(); },
    end: function (id, reason) { var e = Bosses.get(id); if (e) e.end(reason || 'end'); Bosses.active = active[0] || null; return !!e; },
    endAll: function (reason) { while (active.length) active[0].end(reason || 'end'); Bosses.active = null; if (reason !== 'complete') { while (leftovers.length) clearLeftover(leftovers.pop()); } },
    update: function (dt) {
      var g = game(); if (!g || g.state !== 'playing') return;
      for (var i = active.length - 1; i >= 0; i--) {
        var e = active[i];
        if (e.playerRef && e.playerRef !== player()) { e.end('newgame'); continue; }   // a new game replaced the world under the fight
        try { e.update(dt); } catch (err) { U.reportError(err, 'bosses.update'); }
        if (e.state === 'done' && !e.mission && e.stateT > 1) e.end('complete');
        else if (e.state === 'failed' && !e.mission) e.end('escaped');
      }
      try { tickLeftovers(dt); } catch (err2) { U.reportError(err2, 'bosses.leftovers'); }
      Bosses.active = active[0] || null;
    },
    hud: function () { var e = Bosses.active; return e && e.state !== 'ended' ? e.hud() : null; },
    target: function () { var e = Bosses.active; return e ? e.target() : null; },
    resumeInfo: function () { return resume; },
    // the arena as a mission target (an approach objective: {type:'goto', target: GTP.Bosses.arenaTarget('b01_goldplate'), radius: 160})
    arenaTarget: function (id) { var a = DEFS[id] && DEFS[id].arena; return a ? { landmark: a.landmark, offset: { x: (a.offset && a.offset.x) || 0, z: (a.offset && a.offset.z) || 0 }, metres: true } : null; },
    arena: function (id) { var d = DEFS[id]; if (!d) return null; var c = resolveArena(d); return { x: c.x, z: c.z, y: groundY(c.x, c.z, 0), landmark: d.arena.landmark }; },
    cards: CARDS,
    Telegraph: Telegraph, BossPart: BossPart, BossRig: BossRig, meshes: Meshes,
    debug: {
      encounter: function () { return Bosses.active; },
      // force the current phase's threshold (tests: walk every phase)
      skipPhase: function () { var e = Bosses.active; if (!e || e.state !== 'fight') return false; e.hurt(e.hp - e.def.thresholds[e.phase - 1]); return true; },
      breakParts: function (kind) { var e = Bosses.active, n = 0; if (!e) return 0; var ps = e.parts.slice(); for (var i = 0; i < ps.length; i++) if (!ps[i].down && !ps[i].removed && (!kind || ps[i].bossPart === kind)) { ps[i].invuln = false; ps[i].applyDamage(9999, player(), 'debug'); n++; } return n; },
      resolveDebate: function (win) { var e = Bosses.get('b06_panel'); if (!e || !e.data.cb) return false; var cb = e.data.cb; if (GTP.UI && GTP.UI.endMinigame) { try { GTP.UI.endMinigame(); } catch (er) { /* ui optional */ } } var g = game(); if (g && g.state === 'minigame') g.setState('playing'); cb(!!win); return true; },
      telegraphs: function () { var e = Bosses.active; return e ? e.tele.map(function (t) { return { shape: t.shape, x: t.x, z: t.z, r: t.shape === 'ring' ? t.rr : t.r, len: t.len, w: t.w, yaw: t.yaw, t: t.t, warn: t.warn, struck: t.struck, jumpable: t.jumpable, dmg: t.dmg, maxR: t.maxR, band: t.band }; }) : []; },
      clearResume: function () { resume = null; pendingResume = null; }
    }
  };

  // ------------------------------------------------------------------ the boss objective --
  // {type:'boss', bossId, at?:{x,z}|{landmark}, text}: done when the boss is defeated and the defeat lines are over
  var BOSS_OBJECTIVE = {
    start: function (o, c) {
      c.bossId = o.bossId || o.boss; c.failReason = null;
      var at = null, M = GTP.Missions;
      if (o.at && M && M.resolvePoint) { var rp = M.resolvePoint(o.at, { metres: true }); if (rp) at = { x: rp.x, z: rp.z }; }
      c.enc = Bosses.spawn(c.bossId, { mission: true, at: at });
    },
    update: function () { /* the encounter ticks from Bosses.update (Combat.update wrapper) */ },
    check: function (o, c) {
      var e = c.enc;
      if (!e) return 'done';
      if (e.state === 'failed') { c.failReason = e.failReason || 'boss_escaped'; return 'fail'; }
      if (e.state === 'done' && e.stateT > 0.5) return 'done';
      if (e.state === 'ended') { if (e.endReason === 'complete') return 'done'; c.failReason = 'The fight ended before the boss did.'; return 'fail'; }
      return null;
    },
    progress: function () { return null; },
    hint: function (o, c) { return c.enc ? c.enc.hint || null : null; },
    target: function (o, c) { return c.enc ? c.enc.target() : null; },
    cleanup: function (o, c) { if (c.enc) { c.enc.end(c.enc.state === 'done' ? 'complete' : 'cleanup'); Bosses.active = active[0] || null; } }
  };
  Bosses.objective = BOSS_OBJECTIVE;

  // ------------------------------------------------------------------ GTP.Specials --
  var SPECIAL_IDS = ['focus', 'shout', 'chatmob', 'boost'];
  var SK = C.SPECIALS = Object.assign({
    focus: { name: 'Focus', unlock: 'm03b_range', drain: 1 / 6, recharge: 1 / 40, minStart: 0.2, scale: 0.4 },
    shout: { name: 'Shout', unlock: 'm03_ratio', cost: 1, recharge: 1 / 22, radius: 9, push: 7, dmg: 8 },
    chatmob: { name: 'Chat Mob', unlock: 'b01_goldplate', cost: 1, recharge: 1 / 45, count: 3, hold: 0.6 },
    boost: { name: 'Boost', unlock: 'm08_scooters', drain: 1 / 3, recharge: 1 / 12, minStart: 0.15, accel: 16, top: 1.35 },
    tap: 0.35, hitGain: 0.012
  }, C.SPECIALS || {});
  var sp = { meters: { focus: 1, shout: 1, chatmob: 1, boost: 1 }, active: { focus: false, shout: false, chatmob: false, boost: false }, last: {}, holdT: -1, allies: [], boostV: null, shoutT: 0, mobT: 0 };
  function spUnlocked(id) {
    var f = flags(), d = SK[id];
    return !!((f && f['special_' + id]) || (d && d.unlock && completed(d.unlock)));
  }
  function spEmit(id, force) {
    var m = Math.round(sp.meters[id] * 100) / 100, a = !!sp.active[id], u = spUnlocked(id), l = sp.last[id];
    if (!force && l && l.m === m && l.a === a && l.u === u) return;
    sp.last[id] = { m: m, a: a, u: u };
    // the ui draws a ring for every id that reports a state: a locked special stays off the HUD until it unlocks
    if (!u && !(l && l.u)) return;
    emit('special:state', { id: id, meter: m, active: a, unlocked: u, name: SK[id].name });
  }
  function fireSpecial(id, quiet) {
    var p = player(); if (!p || !p.alive) return false;
    if (!spUnlocked(id)) { if (!quiet && simT() - (sp.lockToastT || -9) > 4) { sp.lockToastT = simT(); toast(SK[id].name + ' is locked'); } return false; }
    var d = SK[id];
    if (id === 'focus') {
      if (sp.active.focus) { stopFocus(); return true; }
      if (sp.meters.focus < d.minStart) { toast('Focus: meter empty'); return false; }
      sp.active.focus = true; sp.focusOwn = false;
      var g = game(); if (g && g.timeScale === 1) { g.timeScale = d.scale; sp.focusOwn = true; }
      textFx('FOCUS', p.x, p.y + 2.2, p.z, '#15e0ff', 0.8); sfx('ui', p.x, p.z, 0.6);
      emit('special:focus', { on: true });
    } else if (id === 'shout') {
      if (sp.meters.shout < d.cost - 1e-6) { toast('Shout: recharging'); return false; }
      sp.meters.shout -= d.cost; sp.active.shout = true; sp.shoutT = 0.6;
      var list = E().hash.query(p.x, p.z, d.radius + 1, []), n = 0, civ = 0;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e.kind !== 'ped' || e === p || !e.alive || e.inVehicle || e.ally || e.godMode && !e.boss) continue;
        var dx = e.x - p.x, dz = e.z - p.z, dd = Math.sqrt(dx * dx + dz * dz); if (dd > d.radius) continue;
        var k = 1 - 0.5 * dd / d.radius;
        e.knockDown(dx / (dd || 1) * d.push * k, dz / (dd || 1) * d.push * k, e.hostile ? d.dmg : 0, p, 'shout'); n++;
        if (!e.hostile && !e.boss) civ++;
      }
      fx({ type: 'ring', x: p.x, y: p.y + 0.3, z: p.z, size: d.radius, life: 0.5 });
      textFx('WELL, ACTUALLY!', p.x, p.y + 2.4, p.z, '#ffffff', 1.1); sfx('debate', p.x, p.z, 1); shake(0.3);
      if (civ && GTP.AI && GTP.AI.wanted && GTP.AI.wanted.addHeat) { try { GTP.AI.wanted.addHeat(1, 'shout'); } catch (er) { /* ai optional */ } }
      for (i = 0; i < active.length; i++) { var enc = active[i]; if (enc.def.onShout && enc.state === 'fight' && enc.ped && U.dist2d(enc.ped.x, enc.ped.z, p.x, p.z) <= d.radius + 1) { try { enc.def.onShout(enc); } catch (er2) { U.reportError(er2, 'bosses.onShout'); } } }
      emit('special:shout', { n: n });
    } else if (id === 'chatmob') {
      if (sp.meters.chatmob < d.cost - 1e-6) { toast('Chat Mob: recharging'); return false; }
      sp.meters.chatmob -= d.cost; sp.active.chatmob = true; sp.mobT = K.allyLife;
      var signs = ['FIRST', 'W TAKE', 'RATIO', 'L + RATIO', 'CLIP IT'], rng = GTP.rng.fork(0xC4A7 + (p.stats.chatmobs || 0));
      p.stats.chatmobs = (p.stats.chatmobs || 0) + 1;
      for (var j = 0; j < d.count; j++) {
        var s = spotNear(rng, p.x, p.z, 2, 5);
        var a = newPed({ x: s.x, z: s.z, look: rollLook('protester', s.x, s.z, { sign: signs[j % signs.length], shirt: ['#ff3fa4', '#15e0ff', '#9dff3c'][j % 3] }), role: 'protester', ai: { phase: 0.5, mode: 'mission', mission: 'ally', ambient: false } });
        a.ally = true; a.godMode = true; a.name = 'Chat'; sp.allies.push(a);
        fx({ type: 'puff', x: s.x, y: s.y + 0.6, z: s.z, size: 1.4, life: 0.5, color: 0xff3fa4 });
      }
      textFx('CHAT, GET IN HERE', p.x, p.y + 2.4, p.z, '#ff3fa4', 1.4); sfx('mission', p.x, p.z, 0.5);
      emit('special:chatmob', { allies: d.count });
    } else if (id === 'boost') {
      var v = p.inVehicle; if (!v || v.driver !== p) return false;
      if (sp.meters.boost < d.minStart) { toast('Boost: meter empty'); return false; }
      sp.active.boost = true; sp.boostV = v;
      sfx('skid', v.x, v.z, 0.7); emit('special:boost', { on: true });
    }
    spEmit(id, true);
    return true;
  }
  function stopFocus() {
    if (!sp.active.focus) return;
    sp.active.focus = false;
    var g = game(); if (g && sp.focusOwn && g.timeScale < 1) g.timeScale = 1;
    sp.focusOwn = false; emit('special:focus', { on: false }); spEmit('focus', true);
  }
  function stopBoost() { if (!sp.active.boost) return; sp.active.boost = false; sp.boostV = null; emit('special:boost', { on: false }); spEmit('boost', true); }
  function allyTick(a, dt) {
    var p = player(); if (!p || a.removed || !a.alive) return;
    if (a.knockedDown) return;
    var best = null, bd = 30, list = E().hash.query(a.x, a.z, 30, SCRATCH);
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.kind !== 'ped' || !e.alive || e.removed || e.inVehicle || e.knockedDown || e.humiliated || !(e.hostile || e.boss)) continue;
      if (e.boss && (e.boss.shield || e.boss.def.pedProof)) continue;
      var d = U.dist2d(a.x, a.z, e.x, e.z); if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      a.aimTarget = best;
      if (bd > 1.5) a.moveTo(best.x, best.z, true);
      else { a.stop(); a.yaw = U.dirToYaw(best.x - a.x, best.z - a.z); a.aimYaw = a.yaw; if (GTP.Combat && GTP.Combat.fire) { try { GTP.Combat.fire(a, 'fist'); } catch (e2) { U.reportError(e2, 'specials.ally'); } } }
    } else {
      var dp = U.dist2d(a.x, a.z, p.x, p.z);
      if (dp > 4) a.moveTo(p.x, p.z, dp > 9); else a.stop();
    }
    a._barkT = (a._barkT == null ? 2 + a.id % 3 : a._barkT) - dt;
    if (a._barkT <= 0) { a._barkT = 5 + (a.id % 4); var lines = ['W', 'FIRST!', 'Clip it!', 'Ratio!', 'He said what he said!', 'Chat is here!']; if (GTP.AI && GTP.AI.say) GTP.AI.say(a, lines[(a.id + Math.floor(simT())) % lines.length], '#ff3fa4'); }
  }
  var Specials = GTP.Specials = {
    K: SK,
    ids: SPECIAL_IDS,
    meters: sp.meters,
    state: function () {
      var out = {};
      for (var i = 0; i < SPECIAL_IDS.length; i++) { var id = SPECIAL_IDS[i]; out[id] = { id: id, name: SK[id].name, meter: sp.meters[id], active: !!sp.active[id], unlocked: spUnlocked(id) }; }
      return out;
    },
    unlocked: spUnlocked,
    unlock: function (id) { var f = flags(); if (!f || !SK[id]) return false; f['special_' + id] = true; spEmit(id, true); toast('Special unlocked: ' + SK[id].name); return true; },
    trigger: function (id) { return fireSpecial(id); },
    stop: function (id) { if (id === 'focus') stopFocus(); else if (id === 'boost') stopBoost(); },
    allies: function () { return sp.allies.slice(); },
    // drop whatever is running (a load, a new game) and keep the meters (the save restores them)
    clear: function () {
      stopFocus(); stopBoost();
      for (var i = 0; i < sp.allies.length; i++) removeEntity(sp.allies[i]);
      sp.allies.length = 0; sp.holdT = -1;
      for (var k = 0; k < SPECIAL_IDS.length; k++) sp.active[SPECIAL_IDS[k]] = false;
    },
    reset: function () { Specials.clear(); for (var k = 0; k < SPECIAL_IDS.length; k++) sp.meters[SPECIAL_IDS[k]] = 1; },
    // Game.step (through the Combat.update wrapper) in state playing
    update: function (dt) {
      var g = game(), p = player(), In = GTP.Input, i, id;
      if (!g || !p) return;
      if (g.state !== 'playing') { if (sp.active.focus && g.state !== 'paused') stopFocus(); return; }
      // input: the `special` action (02_input.js: X, Shift + right mouse, L3)
      var down = In && In.down('special'), pressed = In && In.pressed('special');
      if (p.alive && p.controlEnabled !== false && !p.knockedDown) {
        if (pressed) {
          if (p.inVehicle) fireSpecial('boost');
          else if (p.aiming || sp.active.focus) fireSpecial('focus');
          else sp.holdT = 0;
        }
        if (sp.holdT >= 0) {
          if (down) { sp.holdT += dt; if (sp.holdT >= SK.chatmob.hold) { sp.holdT = -1; fireSpecial('chatmob'); } }
          else { if (sp.holdT < SK.tap) fireSpecial('shout'); sp.holdT = -1; }
        }
        if (sp.active.boost && (!down || !p.inVehicle)) stopBoost();
      } else { sp.holdT = -1; stopBoost(); }
      // meters
      var rdt = dt;
      if (sp.active.focus) { sp.meters.focus -= SK.focus.drain * dt / ((g.timeScale > 0 && g.timeScale < 1) ? g.timeScale : 1); if (sp.meters.focus <= 0 || !p.alive || p.inVehicle) { sp.meters.focus = Math.max(0, sp.meters.focus); stopFocus(); } }
      else sp.meters.focus = Math.min(1, sp.meters.focus + SK.focus.recharge * rdt);
      sp.meters.shout = Math.min(1, sp.meters.shout + SK.shout.recharge * rdt);
      if (sp.shoutT > 0) { sp.shoutT -= dt; if (sp.shoutT <= 0) sp.active.shout = false; }
      if (!sp.active.chatmob) sp.meters.chatmob = Math.min(1, sp.meters.chatmob + SK.chatmob.recharge * rdt);
      if (sp.active.boost) {
        var v = sp.boostV;
        sp.meters.boost -= SK.boost.drain * dt;
        if (!v || v.wreck || v.removed || sp.meters.boost <= 0) { sp.meters.boost = Math.max(0, sp.meters.boost); stopBoost(); }
        else {
          var f = U.yawToDir(v.yaw), top = v.cls.maxSpeed * SK.boost.top;
          if (v.speed < top && v.onGround) { v.vx += f.x * SK.boost.accel * dt; v.vz += f.z * SK.boost.accel * dt; }
          if (simT() % 0.06 < dt) { var b = v.localToWorld(0, -v.hl - 0.2); fx({ type: 'fire', x: b.x, y: v.y + 0.5, z: b.z, vx: -f.x * 6, vy: 0.5, vz: -f.z * 6, size: 0.9, life: 0.22 }); }
        }
      } else sp.meters.boost = Math.min(1, sp.meters.boost + SK.boost.recharge * rdt);
      // the chat mob
      if (sp.active.chatmob) {
        sp.mobT -= dt;
        for (i = sp.allies.length - 1; i >= 0; i--) { var a = sp.allies[i]; if (a.removed) { sp.allies.splice(i, 1); continue; } try { allyTick(a, dt); } catch (e) { U.reportError(e, 'specials.ally'); } }
        if (sp.mobT <= 0 || !p.alive) {
          for (i = 0; i < sp.allies.length; i++) { var al = sp.allies[i]; fx({ type: 'puff', x: al.x, y: al.y + 0.8, z: al.z, size: 1.4, life: 0.5, color: 0xff3fa4 }); textFx('LOGGED OFF', al.x, al.y + 2, al.z, '#ff3fa4', 0.9); removeEntity(al); }
          sp.allies.length = 0; sp.active.chatmob = false;
        }
      }
      for (i = 0; i < SPECIAL_IDS.length; i++) { id = SPECIAL_IDS[i]; spEmit(id, false); }
    }
  };
  // landing hits charges the meters a little (the shout and the mob come back faster in a fight)
  GTP.Events.on('hitmarker', function (e) {
    var p = player(); if (!e || !p || e.shooter !== p) return;
    for (var i = 0; i < SPECIAL_IDS.length; i++) { var id = SPECIAL_IDS[i]; if (!sp.active[id]) sp.meters[id] = Math.min(1, sp.meters[id] + SK.hitGain * (e.kill ? 3 : 1)); }
  });
  GTP.Events.on('player:respawn', function () { stopFocus(); stopBoost(); });

  // ------------------------------------------------------------------ installers / wrappers --
  // Combat loads before this file: its update is the per-step hook (Game.step runs it in playing and the respawn states)
  (function wrapCombat() {
    var CB = GTP.Combat;
    if (!CB || typeof CB.update !== 'function' || CB.update._bosses) return;
    var orig = CB.update;
    CB.update = function (dt) {
      var r = orig.apply(this, arguments);
      // once Game.step ticks them itself (it sets game.ticksBosses; docs/v03/triage_bosses.md), this only installs
      var g = GTP.game;
      try { installLate(); if (!(g && g.ticksBosses)) { Bosses.update(dt); Specials.update(dt); } } catch (e) { U.reportError(e, 'bosses.tick'); }
      return r;
    };
    CB.update._bosses = true;
  })();

  var installed = { objective: false, crime: false, ui: false, save: false };
  function patchMission(m) {
    if (!m || m._bossPatched) return m;
    m._bossPatched = true;
    (function walk(list) {
      if (!list) return;
      for (var i = 0; i < list.length; i++) {
        var o = list[i]; if (!o) continue;
        if (o.type === 'boss') { o._boss = o.bossId || o.boss; o.type = 'dialogue'; o.lines = []; }
        if (o.type === 'timer_wrap') walk(o.objectives);
      }
    })(m.objectives);
    return m;
  }
  // the boss objective: registerObjectiveType (the story track) or the start-time rewrite plus a handler swap
  function installObjective() {
    var M = GTP.Missions; if (!M || installed.objective) return;
    installed.objective = true;
    if (typeof M.registerObjectiveType === 'function') {
      try { M.registerObjectiveType('boss', BOSS_OBJECTIVE); Bosses.objectiveMode = 'registered'; } catch (e) { U.reportError(e, 'bosses.register'); }
    } else {
      Bosses.objectiveMode = 'fallback';
      var start = M.start, reg = M.registerTest;
      M.start = function (id) { try { patchMission(M.missionById ? M.missionById(id) : null); } catch (e) { U.reportError(e, 'bosses.patch'); } return start.apply(this, arguments); };
      if (typeof reg === 'function') M.registerTest = function (m) { patchMission(m); return reg.apply(this, arguments); };
      GTP.Events.on('mission:objective', function (e) {
        var def = e && e.objective; if (!def || !def._boss) return;
        var run = M.debug && M.debug.run ? M.debug.run() : null;
        if (!run || !run.obj || run.obj.def !== def) return;
        def.bossId = def._boss;
        run.obj.h = BOSS_OBJECTIVE;
        try { BOSS_OBJECTIVE.start(def, run.obj.c, player()); } catch (err) { U.reportError(err, 'bosses.objective'); }
      });
    }
    // phase checkpoints: a mission start clears the resume point, RETRY of the same mission uses it
    GTP.Events.on('mission:start', function () { resume = null; pendingResume = null; });
    GTP.Events.on('mission:retry', function (e) { if (resume && e && e.id === resume.missionId) pendingResume = { bossId: resume.bossId, phase: resume.phase }; });
    GTP.Events.on('mission:abort', function () { resume = null; pendingResume = null; Bosses.endAll('abort'); });
  }
  // a boss fight is a set: the police stay out of it (no heat while one runs; a stray round into the crowd is not a crime
  // during a set piece), and shots at a boss part are never shots at the police helicopter
  function fighting() { for (var i = 0; i < active.length; i++) { var s = active[i].state; if (s === 'intro' || s === 'fight' || s === 'break' || s === 'defeated') return true; } return false; }
  function installCrime() {
    var wd = GTP.AI && GTP.AI.wanted; if (!wd || installed.crime || typeof wd.crime !== 'function') return;
    installed.crime = true;
    var crime = wd.crime, addHeat = wd.addHeat;
    wd.crime = function () { if (fighting()) return 0; return crime.apply(this, arguments); };
    if (typeof addHeat === 'function') wd.addHeat = function () { if (fighting()) return 0; return addHeat.apply(this, arguments); };
  }
  function installSave() {
    if (installed.save) return;
    var reg = GTP.SaveRegistry;
    var entry = { get: function () { return { meters: Object.assign({}, sp.meters) }; }, set: function (j) { if (j && j.meters) for (var k in j.meters) if (sp.meters[k] != null) sp.meters[k] = U.clamp(+j.meters[k] || 0, 0, 1); } };
    if (reg && typeof reg === 'object') { reg.specials = entry; installed.save = true; return; }
    if (Array.isArray(GTP.SaveHooks)) { GTP.SaveHooks.push({ name: 'specials', save: function (d) { d.specials = entry.get(); }, load: function (d) { entry.set(d.specials); } }); installed.save = true; }
  }
  function installUI() {
    var UI = GTP.UI; if (!UI || installed.ui || typeof UI.draw !== 'function') return;
    installed.ui = true;
    var draw = UI.draw;
    UI.draw = function (ctx, w, h) {
      var r = draw.apply(this, arguments);
      try { drawHud(ctx, w, h); } catch (e) { U.reportError(e, 'bosses.hud'); }
      return r;
    };
  }
  function installLate() { installObjective(); installCrime(); installSave(); installUI(); }
  GTP.Events.on('load:progress', installLate);
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('load', function () { try { installLate(); } catch (e) { U.reportError(e, 'bosses.install'); } });
  // a new game / load drops every fight and resets the specials
  GTP.Events.on('loaded', function () { Bosses.endAll('load'); Specials.clear(); });
  GTP.Events.on('load:begin', function () { Bosses.endAll('load'); Specials.clear(); });
  // the slow motion never outlives play: a minigame, a menu or the title runs at full speed
  GTP.Events.on('state', function (e) {
    var s = e && e.state;
    // back in play: a `special` press made in a menu or the pause screen is not a shout (Input.latch drops the pending press)
    if (s === 'playing') { var In = GTP.Input; if (In && In.latch) { try { In.latch(['special']); } catch (er) { /* input optional */ } } }
    if (s === 'playing' || s === 'paused') return;
    stopFocus();
    if (s === 'cutscene') return;   // the boss's defeat slow motion holds through a line or two
    var g = game(); if (g && g.timeScale < 1) { for (var i = 0; i < active.length; i++) if (active[i]._slowmo > 0) { active[i]._slowmo = 0; g.timeScale = 1; } }
  });
  // a fight outside a mission ends with the player (a mission's fight ends through the mission's failure)
  GTP.Events.on('player:wasted', function () { for (var i = active.length - 1; i >= 0; i--) if (!active[i].mission) active[i].end('player_dead'); });

  // ------------------------------------------------------------------ fallback HUD --
  // The ui track draws the boss bar (boss:phase) and the special meters (special:state); until it says so (UI.drawsBossBar,
  // UI.drawsSpecials) this draws a plain version so the fights read in every build.
  function readable(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#ffffff';
    var n = parseInt(m[1], 16), l = 0.3 * (n >> 16 & 255) + 0.59 * (n >> 8 & 255) + 0.11 * (n & 255);
    return l < 90 ? '#e6e6e6' : '#' + m[1];
  }
  function drawHud(ctx, w, h) {
    var g = game(); if (!g || (g.state !== 'playing' && g.state !== 'cutscene') || (g.loading && g.loading.active)) return;
    var S = U.clamp(Math.min(w / 1280, h / 720), 0.62, 1.3), UI = GTP.UI;
    var b = Bosses.hud(), M = GTP.Missions, talking = g.state === 'cutscene' || (M && M.dialogue && M.dialogue.active);
    // the ui track's own bar and rings (11_ui.js keeps them in UI.state.boss / UI.state.specials, fed by boss:phase / special:state)
    var uiBar = uiDrawsBar();
    var uiSpecials = !!UI.drawsSpecials || !!(UI.state && UI.state.specials && typeof UI.state.specials === 'object');
    if (b && uiBar && b.shield && b.state === 'fight' && !talking && !UI.drawsBossShield) {
      // its bar has no shield state: the reason the boss takes no damage, a line above the bar's name
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = '700 ' + Math.round(12 * S) + 'px sans-serif';
      ctx.lineWidth = 3 * S; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(b.shieldText, w / 2, h - 74 * S);
      ctx.fillStyle = '#d0d0d0'; ctx.fillText(b.shieldText, w / 2, h - 74 * S);
      ctx.restore();
    }
    if (b && !uiBar && b.state !== 'done' && !talking) {
      // bottom centre, above the ticker: the objective panel and the hints own the top of the screen
      var bw = Math.min(w * 0.5, 520 * S), bx = (w - bw) / 2, by = h - 96 * S, bh = 12 * S;
      ctx.save();
      ctx.fillStyle = 'rgba(8,8,12,0.72)'; ctx.fillRect(bx - 10 * S, by - 30 * S, bw + 20 * S, bh + 58 * S);
      ctx.font = '900 ' + Math.round(17 * S) + 'px Impact, "Arial Black", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = readable(b.color); ctx.fillText(String(b.name).toUpperCase(), bx, by - 10 * S);
      ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.font = '700 ' + Math.round(12 * S) + 'px sans-serif';
      ctx.fillText(b.state === 'defeated' ? 'RATIO\'D' : 'PHASE ' + Math.max(1, b.phase) + ' / ' + b.phases, bx + bw, by - 10 * S);
      ctx.fillStyle = '#2a2a2e'; ctx.fillRect(bx, by, bw, bh);
      var k = b.maxHp > 0 ? b.hp / b.maxHp : 0;
      ctx.fillStyle = b.shield ? '#8a8f99' : '#ff3fa4'; ctx.fillRect(bx, by, bw * k, bh);
      ctx.fillStyle = '#0b0b0f';
      var th = DEFS[b.id] ? DEFS[b.id].thresholds : [];
      for (var i = 0; i < th.length - 1; i++) ctx.fillRect(bx + bw * th[i] / b.maxHp - 1, by, 2 * S, bh);
      ctx.textAlign = 'center'; ctx.font = '700 ' + Math.round(12 * S) + 'px sans-serif';
      ctx.fillStyle = b.shield ? '#d0d0d0' : '#9dff3c';
      ctx.fillText(b.shield ? b.shieldText : (b.hint || ''), w / 2, by + bh + 17 * S);
      if (b.shield && b.hint) { ctx.fillStyle = '#ffd45a'; ctx.fillText(b.hint, w / 2, by + bh + 32 * S); }
      ctx.restore();
    }
    if (!uiSpecials) {
      var st = Specials.state(), any = false, id;
      for (id in st) if (st[id].unlocked) any = true;
      if (!any) return;
      ctx.save();
      var x0 = 18 * S, y0 = h - 150 * S, cw = 26 * S;
      ctx.font = '700 ' + Math.round(9 * S) + 'px sans-serif'; ctx.textAlign = 'center';
      var cols = { focus: '#15e0ff', shout: '#ffffff', chatmob: '#ff3fa4', boost: '#ff7a00' }, n = 0;
      for (id in st) {
        var s = st[id]; if (!s.unlocked) continue;
        var x = x0 + n * (cw + 8 * S); n++;
        ctx.fillStyle = 'rgba(8,8,12,0.7)'; ctx.fillRect(x, y0, cw, 44 * S);
        ctx.fillStyle = s.active ? '#ffffff' : cols[id]; ctx.fillRect(x + 4 * S, y0 + 4 * S + (1 - s.meter) * 26 * S, cw - 8 * S, s.meter * 26 * S);
        ctx.fillStyle = '#ffffff'; ctx.fillText(id === 'chatmob' ? 'MOB' : id.toUpperCase().slice(0, 5), x + cw / 2, y0 + 40 * S);
      }
      ctx.restore();
    }
  }
})();
