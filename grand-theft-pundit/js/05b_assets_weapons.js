/* Grand Theft Pundit: 05b_assets_weapons.js
 * The twelve-weapon arsenal's meshes (GDD_EXPANSION.md §2): low-poly, vertex-coloured,
 * built once per id with GTP.GeoBuilder and shared between every hand and crate.
 *
 *   GTP.Assets.weaponMeshes[id]       builder fn(g) -> fills a GeoBuilder (barrel along +x, grip at the origin going -y;
 *                                     thrown things stand along +y, the way the base megaphone / hottake did)
 *   GTP.Assets.weaponGeometry(id)     cached BufferGeometry (null for fists)
 *   GTP.Assets.weaponMesh(id)         a fresh THREE.Object3D holding the weapon (overrides the base builder for every id);
 *                                     the hot mic carries a child named 'cap' with its own red material (Combat blinks it),
 *                                     the launcher carries two RATIO stencil planes
 *   GTP.Assets.weaponFit[id]          {len, pickupScale, upright} hints Combat uses to place the weapon in a hand or on a crate
 *
 * Every child mesh is named 'held' so Combat's damage flash (which skips 'held') leaves the gun alone.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var A = GTP.Assets = GTP.Assets || {};
  var GB = GTP.GeoBuilder, UV = GB.UV0, TAU = Math.PI * 2;

  function c(hex) { var n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  var GUN = c('#26272c'), GUN2 = c('#3a3c44'), STEEL = c('#8e939c'), CHROME = c('#c9ccd4'), WOOD = c('#5a3a22'), WOOD2 = c('#7a5230');
  var RUBBER = c('#17181b'), PINK = c('#ff3fa4'), RED = c('#e0302a'), ORANGE = c('#ff5a1a'), CREAM = c('#f4ecd8'), GREY = c('#5c6068');
  var TAPE = c('#2c2e33'), GREEN = c('#3fd27f'), BLUE = c('#8a94c8'), GOLD = c('#e8b53a');

  // a prism tube along +x from x0 to x1 (radius r0 at x0, r1 at x1), with end caps
  function tube(g, x0, x1, r0, r1, col, segs, cy, cz) {
    segs = segs || 8; cy = cy || 0; cz = cz || 0;
    var i, a0, a1, p, q;
    for (i = 0; i < segs; i++) {
      a0 = i / segs * TAU; a1 = (i + 1) / segs * TAU;
      p = [Math.cos(a0), Math.sin(a0)]; q = [Math.cos(a1), Math.sin(a1)];
      g.quad([x0, cy + p[0] * r0, cz + p[1] * r0], [x0, cy + q[0] * r0, cz + q[1] * r0], [x1, cy + q[0] * r1, cz + q[1] * r1], [x1, cy + p[0] * r1, cz + p[1] * r1], UV, col);
    }
    cap(g, x1, r1, col, segs, 1, cy, cz); cap(g, x0, r0, col, segs, -1, cy, cz);
  }
  function cap(g, x, r, col, segs, nx, cy, cz) {
    if (r < 0.002) return;
    for (var i = 0; i < segs; i++) {
      var a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU;
      var i0 = g.vertex(x, cy, cz, nx, 0, 0, 0, 0, col);
      var i1 = g.vertex(x, cy + Math.cos(a0) * r, cz + Math.sin(a0) * r, nx, 0, 0, 1, 0, col);
      var i2 = g.vertex(x, cy + Math.cos(a1) * r, cz + Math.sin(a1) * r, nx, 0, 0, 1, 1, col);
      if (nx > 0) g.idx.push(i0, i1, i2); else g.idx.push(i0, i2, i1);
    }
  }
  function box(g, x, y, z, w, h, d, col) { g.box(x, y, z, w, h, d, UV, col); }

  var BUILD = {
    fist: null,
    // the folding table leg: a chrome tube, a tape grip, a rubber foot and the folding bracket it came off with
    tableleg: function (g) {
      tube(g, 0, 0.66, 0.022, 0.022, CHROME, 7);
      tube(g, 0.05, 0.22, 0.027, 0.027, TAPE, 7);
      tube(g, -0.03, 0.0, 0.026, 0.022, RUBBER, 7);
      box(g, 0.58, -0.055, -0.045, 0.08, 0.012, 0.09, GREY);     // the bracket plate
      box(g, 0.58, 0.043, -0.045, 0.08, 0.012, 0.09, GREY);
      box(g, 0.6, -0.045, -0.05, 0.04, 0.09, 0.012, GREY);        // the hinge cheek
      tube(g, 0.57, 0.67, 0.01, 0.01, STEEL, 5, 0, 0.045);        // the hinge pin
    },
    megaphone: function (g) { g.cylinder(0, 0, 0, 0.05, 0.14, 0.3, 8, c('#e64d33')); g.cylinder(0, 0.3, 0, 0.14, 0.145, 0.015, 8, CREAM); box(g, -0.03, -0.12, -0.03, 0.06, 0.14, 0.06, GUN); box(g, -0.015, 0.02, -0.07, 0.03, 0.05, 0.05, RUBBER); },
    pistol: function (g) {
      box(g, 0, -0.03, -0.02, 0.24, 0.05, 0.04, GUN);             // the frame
      box(g, 0.02, 0.02, -0.018, 0.22, 0.035, 0.036, GUN2);       // the slide
      tube(g, 0.22, 0.26, 0.012, 0.012, STEEL, 6, 0.0, 0);        // the muzzle
      box(g, 0.02, -0.15, -0.015, 0.055, 0.12, 0.03, c('#4a3524'));   // the grip
      box(g, 0.085, -0.075, -0.012, 0.05, 0.045, 0.024, GUN);     // the trigger guard
      box(g, 0.225, 0.055, -0.004, 0.012, 0.012, 0.008, STEEL);   // the front sight
    },
    // The Rebuttal: a long barrel, a fat cylinder, a wooden grip
    revolver: function (g) {
      box(g, 0, -0.035, -0.02, 0.15, 0.07, 0.04, GUN2);            // the frame
      tube(g, 0.1, 0.44, 0.016, 0.016, GUN, 7, 0.012, 0);          // the long barrel
      box(g, 0.1, 0.02, -0.01, 0.34, 0.016, 0.02, GUN2);           // the top rib
      tube(g, 0.06, 0.14, 0.036, 0.036, STEEL, 6, 0.0, 0);         // the cylinder
      box(g, 0.0, -0.17, -0.016, 0.06, 0.135, 0.032, WOOD);        // the grip
      box(g, 0.0, -0.17, -0.017, 0.06, 0.03, 0.034, GOLD);         // the gold cap at the butt
      box(g, 0.07, -0.085, -0.012, 0.05, 0.05, 0.024, GUN);        // the trigger guard
      box(g, -0.03, 0.02, -0.006, 0.035, 0.03, 0.012, STEEL);      // the hammer
      box(g, 0.425, 0.03, -0.004, 0.012, 0.016, 0.008, STEEL);     // the front sight
    },
    smg: function (g) {
      box(g, 0, -0.04, -0.025, 0.42, 0.08, 0.05, GUN);             // the body
      box(g, 0.14, -0.2, -0.016, 0.06, 0.16, 0.032, GUN2);         // the magazine
      box(g, 0.03, -0.13, -0.016, 0.05, 0.09, 0.032, c('#4a3524'));   // the grip
      box(g, 0.26, -0.09, -0.016, 0.05, 0.05, 0.032, GUN2);        // the foregrip
      box(g, -0.2, -0.01, -0.012, 0.2, 0.035, 0.024, STEEL);       // the folded stock
      tube(g, 0.42, 0.56, 0.014, 0.014, STEEL, 6, 0.01, 0);        // the barrel
      box(g, 0.1, 0.04, -0.012, 0.14, 0.02, 0.024, GUN2);          // the top cover
    },
    // The Monologue: a boxy body, a straight magazine, a carry handle
    rifle: function (g) {
      box(g, 0, -0.045, -0.03, 0.5, 0.09, 0.06, GUN);              // the body
      box(g, 0.18, -0.24, -0.018, 0.08, 0.2, 0.036, GUN2);         // the straight magazine
      box(g, 0.04, -0.15, -0.016, 0.055, 0.11, 0.032, c('#4a3524'));  // the grip
      box(g, 0.12, 0.045, -0.012, 0.03, 0.045, 0.024, GUN2);       // the handle posts
      box(g, 0.3, 0.045, -0.012, 0.03, 0.045, 0.024, GUN2);
      box(g, 0.1, 0.085, -0.014, 0.25, 0.022, 0.028, GUN2);        // the carry handle
      box(g, -0.24, -0.04, -0.025, 0.24, 0.08, 0.05, GUN2);        // the stock
      tube(g, 0.5, 0.74, 0.015, 0.015, STEEL, 6, 0.0, 0);          // the barrel
      box(g, 0.56, -0.05, -0.02, 0.14, 0.05, 0.04, GUN);           // the handguard
      box(g, 0.71, 0.02, -0.004, 0.012, 0.03, 0.008, STEEL);       // the front sight
    },
    shotgun: function (g) {
      box(g, 0, -0.04, -0.022, 0.3, 0.08, 0.044, GUN2);            // the receiver
      tube(g, 0.3, 0.82, 0.016, 0.016, GUN, 6, 0.01, 0);           // the barrel
      tube(g, 0.3, 0.72, 0.012, 0.012, STEEL, 6, -0.032, 0);       // the tube magazine
      box(g, 0.42, -0.055, -0.024, 0.13, 0.05, 0.048, WOOD2);      // the pump
      box(g, -0.28, -0.07, -0.022, 0.28, 0.1, 0.044, WOOD);        // the stock
      box(g, 0.04, -0.13, -0.014, 0.05, 0.09, 0.028, WOOD2);       // the grip
      box(g, 0.8, 0.03, -0.004, 0.012, 0.012, 0.008, CREAM);       // the bead
    },
    // The Fact Checker: a long barrel, a scope tube, a bipod folded under the barrel
    sniper: function (g) {
      box(g, 0, -0.04, -0.025, 0.38, 0.08, 0.05, c('#2f3340'));    // the body
      tube(g, 0.38, 0.98, 0.014, 0.012, GUN, 6, 0.0, 0);           // the long barrel
      tube(g, 0.9, 1.0, 0.02, 0.02, GUN2, 6, 0.0, 0);              // the muzzle brake
      box(g, 0.1, 0.045, -0.012, 0.03, 0.04, 0.024, GUN2);         // the scope mounts
      box(g, 0.28, 0.045, -0.012, 0.03, 0.04, 0.024, GUN2);
      tube(g, 0.04, 0.36, 0.027, 0.027, GUN, 7, 0.105, 0);         // the scope tube
      tube(g, 0.0, 0.05, 0.034, 0.03, BLUE, 7, 0.105, 0);          // the eyepiece
      tube(g, 0.35, 0.4, 0.03, 0.034, BLUE, 7, 0.105, 0);          // the objective
      box(g, 0.12, -0.11, -0.016, 0.07, 0.07, 0.032, GUN2);        // the magazine
      box(g, 0.03, -0.14, -0.014, 0.05, 0.1, 0.028, GUN);          // the grip
      box(g, -0.3, -0.06, -0.025, 0.3, 0.09, 0.05, c('#2f3340'));  // the stock
      box(g, -0.22, 0.03, -0.02, 0.18, 0.025, 0.04, GUN2);         // the cheek riser
      box(g, 0.55, -0.045, -0.03, 0.2, 0.02, 0.012, STEEL);        // the folded bipod legs
      box(g, 0.55, -0.045, 0.018, 0.2, 0.02, 0.012, STEEL);
    },
    hottake: function (g) { g.cylinder(0, 0, 0, 0.06, 0.06, 0.18, 8, ORANGE); g.cylinder(0, 0.18, 0, 0.06, 0.04, 0.03, 8, c('#ff9a40')); box(g, -0.04, 0.2, -0.04, 0.08, 0.04, 0.08, c('#ffd27a')); },
    // the Hot Mic: a handheld mic with a red ON AIR cap (a separate child, Combat blinks it) and a cable tail
    hotmic: function (g) {
      g.cylinder(0, 0, 0, 0.024, 0.028, 0.2, 7, GUN);              // the handle
      g.cylinder(0, 0.2, 0, 0.03, 0.038, 0.06, 7, GUN2);           // the body
      g.sphere(0, 0.32, 0, 0.058, 8, 4, STEEL);                   // the grille
      g.cylinder(0, 0.26, 0, 0.04, 0.04, 0.012, 7, CREAM);         // the collar
      box(g, -0.008, -0.11, -0.008, 0.016, 0.11, 0.016, RUBBER);   // the cable tail
      box(g, -0.03, -0.13, -0.008, 0.04, 0.02, 0.016, RUBBER);
    },
    // the Ratio Launcher: a tube with a pink RATIO stencil and a shoulder rest
    ratio: function (g) {
      tube(g, -0.25, 0.75, 0.065, 0.065, c('#4a5a4c'), 8);         // the tube
      tube(g, 0.3, 0.52, 0.068, 0.068, PINK, 8);                   // the stencil band
      tube(g, 0.75, 0.86, 0.066, 0.095, GUN2, 8);                  // the bell
      tube(g, -0.3, -0.25, 0.07, 0.065, GUN2, 8);                  // the back ring
      box(g, 0.02, -0.15, -0.03, 0.22, 0.08, 0.06, GUN);           // the shoulder rest
      box(g, 0.3, -0.18, -0.016, 0.05, 0.12, 0.032, c('#4a3524')); // the grip
      box(g, 0.46, -0.12, -0.016, 0.05, 0.06, 0.032, GUN2);        // the foregrip
      box(g, 0.1, 0.065, -0.01, 0.1, 0.05, 0.02, GUN2);            // the sight post
      box(g, 0.08, 0.11, -0.025, 0.14, 0.02, 0.05, GUN);           // the sight frame
      box(g, 0.2, 0.06, -0.012, 0.3, 0.03, 0.024, GUN2);           // the rail
    }
  };
  var FIT = {
    tableleg: { len: 0.66, pickupScale: 0.85 }, megaphone: { len: 0.3, upright: true }, pistol: { len: 0.26 }, revolver: { len: 0.44 }, smg: { len: 0.56 }, rifle: { len: 0.74, pickupScale: 0.8 },
    shotgun: { len: 0.82, pickupScale: 0.75 }, sniper: { len: 1.0, pickupScale: 0.6 }, hottake: { len: 0.24, upright: true }, hotmic: { len: 0.38, upright: true }, ratio: { len: 1.1, pickupScale: 0.55 }
  };

  var geoCache = {}, stencilTex = null;
  function stencil() {
    if (stencilTex) return stencilTex;
    var cv = document.createElement('canvas'); cv.width = 128; cv.height = 48;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ff3fa4'; ctx.fillRect(0, 0, 128, 48);
    ctx.fillStyle = '#1a0a12'; ctx.font = 'bold 34px "Arial Black", Impact, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('RATIO', 64, 26, 120);
    stencilTex = new THREE.CanvasTexture(cv); stencilTex.colorSpace = THREE.SRGBColorSpace; stencilTex.minFilter = THREE.LinearFilter; stencilTex.generateMipmaps = false;
    return stencilTex;
  }
  var capMatProto = null;

  A.weaponMeshes = BUILD;
  A.weaponFit = FIT;
  A.weaponGeometry = function (id) {
    if (!id || !BUILD[id]) return null;
    if (geoCache[id]) return geoCache[id];
    var g = new GB({ color: true });
    BUILD[id](g);
    return (geoCache[id] = g.build());
  };
  A.weaponMesh = function (id) {
    var geo = A.weaponGeometry(id);
    if (!geo) return null;
    var mat = A.propMaterial ? A.propMaterial() : new THREE.MeshLambertMaterial({ vertexColors: true });
    var m = new THREE.Mesh(geo, mat); m.castShadow = true; m.name = 'held';
    if (id === 'hotmic') {
      // the ON AIR cap: its own material so Combat can blink it toward the bang
      if (!capMatProto) capMatProto = new THREE.MeshBasicMaterial({ color: 0xe0302a });
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.022, 8), capMatProto.clone());
      cap.position.y = 0.225; cap.name = 'cap'; cap.userData.cap = true;
      m.add(cap);
    } else if (id === 'ratio') {
      var sm = new THREE.MeshBasicMaterial({ map: stencil() });
      var a = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.07), sm); a.position.set(0.41, 0.0, 0.069); a.name = 'held'; m.add(a);
      var b = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.07), sm); b.position.set(0.41, 0.0, -0.069); b.rotation.y = Math.PI; b.name = 'held'; m.add(b);
    }
    return m;
  };
})();
