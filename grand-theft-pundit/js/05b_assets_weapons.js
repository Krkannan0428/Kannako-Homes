/* Grand Theft Pundit: 05b_assets_weapons.js
 * The v0.3 arsenal's meshes: low-poly, vertex-coloured, built once per (id, tint) with GTP.GeoBuilder and shared between
 * every hand, holster, rack and crate. 36 built weapons (fists have no mesh) plus a class fallback, so a weapon id that only
 * exists in GTP.Content.parity.weapons still gets a believable gun of its class.
 *
 * Weapon-space convention (every gun): the trigger hand's palm sits at the origin, the barrel runs along +x, up is +y, the
 * grip goes down -y. Melee weapons put the handle at the origin and the head along +x. Thrown things and the megaphone stand
 * upright along +y (fit.upright).
 *
 *   GTP.Assets.weaponMeshes[id]          builder fn(g) -> fills a GeoBuilder
 *   GTP.Assets.weaponFit[id]             {len, hold:'one'|'two', holster:'hip'|'back'|'none', upright, knuckle, pickupScale,
 *                                         muzzle:[x,y,z], support:[x,y,z]|null (the off hand), rail:[x,y,z] (top), under:[x,y,z]
 *                                         (below the barrel), mag:[x,y,z] (the magazine's bottom), slots:[...]}
 *   GTP.Assets.weaponFitFor(id, cls)     the fit of a built weapon, or of the class fallback for an unknown id
 *   GTP.Assets.weaponGeometry(id, tint)  cached BufferGeometry (null for fists); tint recolours the dark metal and polymer
 *   GTP.Assets.weaponMesh(id, mods)      a fresh THREE.Object3D: the weapon plus its attachments (mods = player.weaponMods[id]:
 *                                         {muzzle, mag, optic, grip, light, tint}); every child is named 'held' (the damage
 *                                         flash skips it); the hot mic carries a 'cap' child, the launcher two RATIO stencils,
 *                                         the minigun a 'spin' barrel cluster, a flashlight a 'lens'
 *   GTP.Assets.weaponMuzzle(id, mods)    the muzzle point in weapon space with the muzzle attachment's length added
 *   GTP.Assets.weaponTints               [{id, name, main, second, price}] (index 0 'stock')
 *   GTP.Assets.weaponAttachments         {slot: [{id, name, price}]} the fallback attachment variants (Combat merges the parity table)
 *   GTP.Assets.weaponClassOf(id)         the class a built weapon was drawn as (for the fallback)
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var A = GTP.Assets = GTP.Assets || {};
  var GB = GTP.GeoBuilder, UV = GB.UV0, TAU = Math.PI * 2;

  function c(hex) { var n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  // the tintable colours come first: a tint swaps exactly these two (and POLY) for its own pair
  var GUN = c('#26272c'), GUN2 = c('#3a3c44'), POLY = c('#2d2f34');
  var STEEL = c('#8e939c'), CHROME = c('#c9ccd4'), WOOD = c('#5a3a22'), WOOD2 = c('#7a5230'), BROWN = c('#4a3524');
  var RUBBER = c('#17181b'), PINK = c('#ff3fa4'), RED = c('#e0302a'), ORANGE = c('#ff5a1a'), CREAM = c('#f4ecd8'), GREY = c('#5c6068');
  var TAPE = c('#2c2e33'), GREEN = c('#3fd27f'), BLUE = c('#8a94c8'), GOLD = c('#e8b53a'), BRASS = c('#c9a23a'), TAN = c('#a8916a');
  var OLIVE = c('#4a5a4c'), YELLOW = c('#ffd84a'), CYAN = c('#2ee6ff'), WHITE = c('#eef1fb'), LENS = c('#3a5a8a');
  var TINTABLE = [GUN, GUN2, POLY];

  // ------------------------------------------------------------ primitives --
  // a prism tube along +x from x0 to x1 (radius r0 at x0, r1 at x1), centred at (cy, cz), with end caps
  function tube(g, x0, x1, r0, r1, col, segs, cy, cz) {
    segs = segs || 8; cy = cy || 0; cz = cz || 0;
    for (var i = 0; i < segs; i++) {
      var a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU, p = [Math.cos(a0), Math.sin(a0)], q = [Math.cos(a1), Math.sin(a1)];
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
  // a tube along +z (cross pieces: a gavel head, the side-by-side barrels' hinge pin)
  function tubeZ(g, x, y, z0, z1, r, col, segs) {
    segs = segs || 8;
    for (var i = 0; i < segs; i++) {
      var a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU, p = [Math.cos(a0), Math.sin(a0)], q = [Math.cos(a1), Math.sin(a1)];
      g.quad([x + q[0] * r, y + q[1] * r, z0], [x + p[0] * r, y + p[1] * r, z0], [x + p[0] * r, y + p[1] * r, z1], [x + q[0] * r, y + q[1] * r, z1], UV, col);
    }
    for (var k = 0; k < 2; k++) {
      var zz = k ? z1 : z0, nz = k ? 1 : -1;
      for (i = 0; i < segs; i++) {
        var b0 = i / segs * TAU, b1 = (i + 1) / segs * TAU;
        var j0 = g.vertex(x, y, zz, 0, 0, nz, 0, 0, col), j1 = g.vertex(x + Math.cos(b0) * r, y + Math.sin(b0) * r, zz, 0, 0, nz, 1, 0, col), j2 = g.vertex(x + Math.cos(b1) * r, y + Math.sin(b1) * r, zz, 0, 0, nz, 1, 1, col);
        if (nz > 0) g.idx.push(j0, j1, j2); else g.idx.push(j0, j2, j1);
      }
    }
  }
  function box(g, x, y, z, w, h, d, col) { g.box(x, y, z, w, h, d, UV, col); }
  // a box centred on z (most gun parts are symmetric about the bore plane)
  function bx(g, x0, x1, y0, y1, w, col) { g.box(Math.min(x0, x1), Math.min(y0, y1), -w / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), w, UV, col); }
  // a convex profile in the x-y plane extruded across z (stocks, grips, receivers with a slope)
  function prism(g, pts, w, col, zc) {
    zc = zc || 0;
    var z0 = zc - w / 2, z1 = zc + w / 2, n = pts.length, area = 0, i;
    for (i = 0; i < n; i++) { var a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area < 0) pts = pts.slice().reverse();
    for (i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      g.quad([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1], UV, col);
    }
    var b0 = g.n;
    for (i = 0; i < n; i++) g.vertex(pts[i][0], pts[i][1], z1, 0, 0, 1, 0, 0, col);
    for (i = 1; i < n - 1; i++) g.idx.push(b0, b0 + i, b0 + i + 1);
    var b1 = g.n;
    for (i = 0; i < n; i++) g.vertex(pts[i][0], pts[i][1], z0, 0, 0, -1, 0, 0, col);
    for (i = 1; i < n - 1; i++) g.idx.push(b1, b1 + i + 1, b1 + i);
  }

  // ------------------------------------------------------------ gun parts --
  // the pistol grip under the origin: raked back, the palm at the top
  function pistolGrip(g, col, len, w, rake) {
    len = len || 0.1; w = w || 0.03; rake = rake == null ? 0.028 : rake;
    prism(g, [[-0.034, 0.012], [0.026, 0.012], [0.02 - rake, -len], [-0.04 - rake, -len + 0.006]], w, col);
  }
  function triggerGuard(g, x0, x1, col) { bx(g, x0, x1, -0.03, -0.022, 0.012, col); bx(g, x1 - 0.008, x1, -0.03, 0.005, 0.012, col); bx(g, x0 + 0.012, x0 + 0.016, -0.018, 0.004, 0.004, STEEL); }
  function frontSight(g, x, y, col) { bx(g, x - 0.012, x, y, y + 0.014, 0.008, col || STEEL); }
  function rearSight(g, x, y, col) { bx(g, x, x + 0.012, y, y + 0.012, 0.02, col || GUN); bx(g, x, x + 0.012, y + 0.012, y + 0.018, 0.006, col || GUN); }
  // a magazine hanging from (x, y) down `len`, raked forward by `rake` (a curved one in two pieces)
  function magazine(g, x, y, len, wid, thick, col, rake, curved) {
    rake = rake || 0;
    if (curved) {
      var h = len * 0.55, r1 = rake * 0.4;
      prism(g, [[x - wid / 2, y], [x + wid / 2, y], [x + wid / 2 + r1, y - h], [x - wid / 2 + r1, y - h]], thick, col);
      prism(g, [[x - wid / 2 + r1, y - h + 0.002], [x + wid / 2 + r1, y - h + 0.002], [x + wid / 2 + rake, y - len], [x - wid / 2 + rake + 0.004, y - len + 0.004]], thick, col);
    } else prism(g, [[x - wid / 2, y], [x + wid / 2, y], [x + wid / 2 + rake, y - len], [x - wid / 2 + rake, y - len]], thick, col);
  }
  function rail(g, x0, x1, y, col) { bx(g, x0, x1, y, y + 0.01, 0.022, col || GUN2); for (var x = x0 + 0.01; x < x1 - 0.005; x += 0.022) bx(g, x, x + 0.009, y + 0.01, y + 0.016, 0.022, col || GUN2); }
  function scopeTube(g, x0, x1, y, r, col) { tube(g, x0 + 0.04, x1 - 0.04, r, r, col || GUN, 8, y, 0); tube(g, x0, x0 + 0.05, r * 1.25, r, col || GUN, 8, y, 0); tube(g, x1 - 0.06, x1, r, r * 1.35, col || GUN, 8, y, 0); tube(g, x1 - 0.004, x1, r * 1.2, r * 1.2, LENS, 8, y, 0); bx(g, x0 + 0.06, x0 + 0.08, y - r - 0.02, y - r + 0.004, 0.016, GUN2); bx(g, x1 - 0.1, x1 - 0.08, y - r - 0.02, y - r + 0.004, 0.016, GUN2); }

  // the handgun family: a frame, a slide, the grip at the origin
  function pistolKit(g, o) {
    var len = o.len || 0.2, x0 = -0.04, x1 = x0 + len, sh = o.slideH || 0.034, fw = o.w || 0.028;
    bx(g, x0 + 0.01, x1 - 0.015, 0.0, 0.03, fw, o.frame || POLY);                       // the frame
    bx(g, x0, x1, 0.03, 0.03 + sh, fw * 0.95, o.slide || GUN2);                          // the slide
    for (var s = 0; s < 4; s++) bx(g, x0 + 0.006 + s * 0.008, x0 + 0.01 + s * 0.008, 0.035, 0.03 + sh - 0.004, fw * 0.98, GUN);   // serrations
    tube(g, x1 - 0.004, x1 + (o.barrel || 0.008), 0.01, 0.01, STEEL, 7, 0.047, 0);       // the muzzle
    pistolGrip(g, o.grip || BROWN, o.gripLen || 0.1, fw + 0.004);
    triggerGuard(g, 0.018, 0.06, o.frame || POLY);
    frontSight(g, x1 - 0.004, 0.03 + sh); rearSight(g, x0 + 0.004, 0.03 + sh);
    if (o.hammer) bx(g, x0 - 0.012, x0 + 0.004, 0.035, 0.055, 0.01, STEEL);
    return { muzzle: [x1 + (o.barrel || 0.008), 0.047, 0], rail: [x0 + len * 0.45, 0.03 + sh, 0], under: [x1 - 0.05, 0.0, 0], mag: [-0.03 - 0.028, -(o.gripLen || 0.1), 0], support: [-0.012, -0.05, 0.03], len: len + 0.02 };
  }
  // the long-gun family: receiver, pistol grip at the origin, magazine, handguard, barrel, stock
  function rifleKit(g, o) {
    var rx0 = o.rx0 != null ? o.rx0 : -0.07, rx1 = o.rx1 != null ? o.rx1 : 0.26, rh = o.rh || 0.085, rw = o.rw || 0.046, bore = o.bore || 0.058;
    var body = o.body || GUN, accent = o.accent || GUN2;
    // receiver: lower and upper, a little slope on the back
    prism(g, [[rx0, 0.0], [rx1, 0.0], [rx1, rh], [rx0 + 0.02, rh], [rx0, rh - 0.02]], rw, body);
    bx(g, rx0 + 0.04, rx1 - 0.02, rh * 0.45, rh * 0.55, rw + 0.004, accent);   // the ejection-port line
    pistolGrip(g, o.grip || POLY, o.gripLen || 0.1, rw - 0.008, o.rake);
    triggerGuard(g, 0.02, 0.07, body);
    // the magazine
    var mx = o.magX != null ? o.magX : 0.13;
    if (o.mag === 'curved') magazine(g, mx, 0.004, o.magLen || 0.17, o.magW || 0.05, rw - 0.016, o.magCol || accent, 0.06, true);
    else if (o.mag === 'straight') magazine(g, mx, 0.004, o.magLen || 0.15, o.magW || 0.05, rw - 0.016, o.magCol || accent, 0.012);
    else if (o.mag === 'drum') { bx(g, mx - 0.03, mx + 0.03, -0.03, 0.004, rw - 0.016, accent); tubeZ(g, mx, -0.075, -0.035, 0.035, 0.06, o.magCol || accent, 12); }
    else if (o.mag === 'box') { bx(g, mx - 0.06, mx + 0.06, -0.12, 0.004, rw + 0.04, o.magCol || OLIVE); bx(g, mx - 0.05, mx + 0.05, -0.002, 0.02, rw + 0.044, GREY); }
    // handguard and barrel
    var hx0 = rx1, hx1 = rx1 + (o.hg || 0.2), bEnd = hx1 + (o.barrel || 0.12), br = o.br || 0.012;
    if (o.hgShape === 'round') tube(g, hx0, hx1, o.hgR || 0.03, o.hgR || 0.03, o.hgCol || accent, 8, bore, 0);
    else if (o.hgShape === 'wood') prism(g, [[hx0, bore - 0.04], [hx1 - 0.02, bore - 0.034], [hx1, bore - 0.02], [hx1, bore + 0.012], [hx0, bore + 0.016]], rw + 0.004, o.hgCol || WOOD2);
    else { bx(g, hx0, hx1, bore - 0.034, bore + 0.03, rw - 0.002, o.hgCol || accent); for (var vx = hx0 + 0.03; vx < hx1 - 0.02; vx += 0.045) bx(g, vx, vx + 0.02, bore - 0.012, bore + 0.008, rw + 0.002, GUN); }
    tube(g, hx1, bEnd, br, br, STEEL, 7, bore, 0);
    if (o.brake) tube(g, bEnd - 0.05, bEnd, br * 2, br * 2, GUN, 7, bore, 0);
    else bx(g, bEnd - 0.03, bEnd - 0.012, bore + br, bore + br + 0.03, 0.01, GUN);   // the front sight post
    // the top
    if (o.carry) { bx(g, rx0 + 0.06, rx0 + 0.08, rh, rh + 0.045, 0.02, accent); bx(g, rx1 - 0.06, rx1 - 0.04, rh, rh + 0.045, 0.02, accent); bx(g, rx0 + 0.05, rx1 - 0.03, rh + 0.04, rh + 0.062, 0.024, accent); }
    else if (o.topRail !== false) { rail(g, rx0 + 0.03, rx1 - 0.01, rh); rearSight(g, rx0 + 0.03, rh + 0.016); }
    // the stock
    var sl = o.stockLen || 0.24;
    if (o.stock === 'solid') prism(g, [[rx0 + 0.005, rh - 0.005], [rx0 + 0.005, 0.0], [rx0 - sl, -0.06], [rx0 - sl - 0.01, -0.06], [rx0 - sl - 0.01, rh - 0.01]], rw - 0.006, o.stockCol || body);
    else if (o.stock === 'wood') prism(g, [[rx0 + 0.005, rh - 0.01], [rx0 + 0.005, 0.005], [rx0 - sl, -0.075], [rx0 - sl - 0.012, -0.072], [rx0 - sl - 0.012, rh - 0.02]], rw - 0.004, o.stockCol || WOOD);
    else if (o.stock === 'skeleton') { bx(g, rx0 - sl, rx0, rh - 0.03, rh - 0.012, 0.016, accent); bx(g, rx0 - sl, rx0, 0.0, 0.016, 0.016, accent); bx(g, rx0 - sl - 0.012, rx0 - sl, -0.012, rh - 0.01, rw - 0.008, RUBBER); }
    else if (o.stock === 'folded') { bx(g, rx0 - 0.004, rx1 - 0.08, -0.012, 0.004, 0.012, STEEL); bx(g, rx0 - 0.016, rx0 - 0.004, -0.04, 0.02, 0.03, STEEL); }
    else if (o.stock === 'tube') { tube(g, rx0 - sl, rx0, 0.016, 0.016, accent, 7, rh * 0.55, 0); bx(g, rx0 - sl - 0.02, rx0 - sl + 0.03, -0.03, rh - 0.005, rw - 0.008, accent); }
    if (o.bipod) { bx(g, hx1 - 0.06, hx1 - 0.0, bore - 0.05, bore - 0.034, 0.012, STEEL); bx(g, hx1 - 0.2, hx1 - 0.04, bore - 0.056, bore - 0.046, 0.008, STEEL); }
    return { muzzle: [bEnd, bore, 0], rail: [rx0 + (rx1 - rx0) * 0.4, rh + 0.012, 0], under: [hx0 + (hx1 - hx0) * 0.55, bore - 0.034, 0], mag: [mx + (o.mag === 'curved' ? 0.06 : 0.01), -(o.magLen || 0.15), 0], support: [hx0 + (hx1 - hx0) * 0.45, bore - 0.04, 0], len: bEnd - (rx0 - (o.stock && o.stock !== 'folded' && o.stock !== 'none' ? sl : 0)) };
  }

  // ------------------------------------------------------------- builders --
  var FIT = {};
  var BUILD = {
    fist: null,
    // ---- melee ----
    // the folding table leg: a chrome tube, a tape grip, a rubber foot and the folding bracket it came off with
    tableleg: function (g) {
      tube(g, 0, 0.66, 0.022, 0.022, CHROME, 7); tube(g, 0.0, 0.17, 0.027, 0.027, TAPE, 7); tube(g, -0.06, -0.0, 0.026, 0.022, RUBBER, 7);
      box(g, 0.58, -0.055, -0.045, 0.08, 0.012, 0.09, GREY); box(g, 0.58, 0.043, -0.045, 0.08, 0.012, 0.09, GREY);
      box(g, 0.6, -0.045, -0.05, 0.04, 0.09, 0.012, GREY); tube(g, 0.57, 0.67, 0.01, 0.01, STEEL, 5, 0, 0.045);
      return { len: 0.72, holster: 'back', hold: 'one', melee: true };
    },
    // The Gavel of Order: a turned handle and a fat head
    gavel: function (g) {
      tube(g, -0.05, 0.3, 0.017, 0.022, WOOD2, 8); tube(g, -0.06, -0.05, 0.022, 0.022, GOLD, 8); tube(g, 0.24, 0.26, 0.026, 0.026, GOLD, 8);
      tubeZ(g, 0.33, 0, -0.07, 0.07, 0.04, WOOD, 10); tubeZ(g, 0.33, 0, -0.075, -0.062, 0.043, GOLD, 10); tubeZ(g, 0.33, 0, 0.062, 0.075, 0.043, GOLD, 10);
      return { len: 0.42, holster: 'hip', hold: 'one', melee: true };
    },
    // The Closing Argument: a bat with a tape grip and a knob
    bat: function (g) {
      tube(g, -0.06, 0.25, 0.018, 0.02, TAPE, 8); tube(g, 0.25, 0.55, 0.02, 0.033, WOOD2, 8); tube(g, 0.55, 0.86, 0.033, 0.036, WOOD2, 8);
      tube(g, -0.08, -0.06, 0.028, 0.02, WOOD, 8); tube(g, 0.86, 0.87, 0.036, 0.03, WOOD, 8);
      return { len: 0.95, holster: 'back', hold: 'two', melee: true };
    },
    // the Selfie Stick: a telescoping pole, a phone on the end (screen on, it is filming)
    selfie: function (g) {
      tube(g, -0.06, 0.12, 0.016, 0.016, RUBBER, 7); tube(g, 0.12, 0.42, 0.011, 0.011, CHROME, 6); tube(g, 0.42, 0.72, 0.008, 0.008, CHROME, 6);
      box(g, 0.7, -0.02, -0.03, 0.03, 0.04, 0.06, GUN); box(g, 0.725, -0.075, -0.04, 0.012, 0.15, 0.08, GUN); box(g, 0.737, -0.068, -0.035, 0.002, 0.136, 0.07, CYAN);
      return { len: 0.8, holster: 'back', hold: 'one', melee: true };
    },
    // Brass Talking Points: knuckles over the fingers
    knuckles: function (g) {
      for (var i = 0; i < 4; i++) { var z = -0.033 + i * 0.022; tubeZ(g, 0.02, 0.0, z - 0.009, z + 0.009, 0.013, BRASS, 7); }
      bx(g, -0.005, 0.01, -0.03, 0.01, 0.09, BRASS);
      return { len: 0.06, knuckle: true, holster: 'none', hold: 'one', melee: true };
    },
    // ---- special ----
    megaphone: function (g) { g.cylinder(0, 0, 0, 0.05, 0.14, 0.3, 8, c('#e64d33')); g.cylinder(0, 0.3, 0, 0.14, 0.145, 0.015, 8, CREAM); box(g, -0.03, -0.12, -0.03, 0.06, 0.14, 0.06, GUN); box(g, -0.015, 0.02, -0.07, 0.03, 0.05, 0.05, RUBBER); return { len: 0.3, upright: true, holster: 'none', hold: 'one' }; },
    // ---- pistols ----
    pistol: function (g) { return pistolKit(g, { len: 0.19 }); },
    oped: function (g) { return pistolKit(g, { len: 0.16, slide: CHROME, grip: POLY, gripLen: 0.085, w: 0.025 }); },
    filibuster: function (g) { var f = pistolKit(g, { len: 0.26, slideH: 0.04, w: 0.034, grip: WOOD, gripLen: 0.115, hammer: true }); bx(g, 0.05, 0.12, 0.071, 0.077, 0.02, GOLD); return f; },
    // The Rebuttal: a long barrel, a fat cylinder, a wooden grip
    revolver: function (g) {
      bx(g, -0.05, 0.1, 0.0, 0.06, 0.036, GUN2);
      tube(g, 0.1, 0.38, 0.016, 0.016, GUN, 8, 0.045, 0); bx(g, 0.1, 0.38, 0.057, 0.07, 0.02, GUN2);
      tube(g, 0.0, 0.085, 0.036, 0.036, STEEL, 6, 0.032, 0);
      pistolGrip(g, WOOD, 0.115, 0.032, 0.04); bx(g, -0.075, -0.035, -0.115, -0.1, 0.034, GOLD);
      triggerGuard(g, 0.0, 0.05, GUN);
      bx(g, -0.065, -0.04, 0.05, 0.075, 0.012, STEEL); frontSight(g, 0.375, 0.07);
      return { muzzle: [0.38, 0.045, 0], rail: [0.04, 0.062, 0], under: [0.25, 0.028, 0], mag: [-0.03, -0.1, 0], support: [-0.012, -0.05, 0.03], len: 0.45 };
    },
    // ---- smgs and machine guns ----
    smg: function (g) { return rifleKit(g, { rx0: -0.06, rx1: 0.22, rh: 0.075, rw: 0.042, bore: 0.05, mag: 'straight', magX: 0.11, magLen: 0.15, magW: 0.036, hg: 0.08, barrel: 0.08, stock: 'folded', grip: BROWN }); },
    threadpistol: function (g) { var f = pistolKit(g, { len: 0.21, w: 0.03, slide: GUN, gripLen: 0.1 }); magazine(g, -0.028 - 0.035, -0.095, 0.11, 0.032, 0.024, GUN2, -0.02); bx(g, 0.1, 0.12, -0.06, 0.0, 0.018, POLY); f.mag = [-0.085, -0.2, 0]; f.support = [0.11, -0.05, 0]; return f; },
    liveblog: function (g) { var f = rifleKit(g, { rx0: -0.06, rx1: 0.24, rh: 0.08, rw: 0.044, bore: 0.052, mag: 'curved', magX: 0.12, magLen: 0.15, magW: 0.04, hg: 0.12, hgShape: 'round', hgR: 0.026, barrel: 0.03, stock: 'skeleton', stockLen: 0.2, accent: GUN2 }); bx(g, 0.0, 0.2, 0.07, 0.074, 0.046, PINK); return f; },
    pocketsmg: function (g) { var f = pistolKit(g, { len: 0.17, slideH: 0.04, w: 0.034, slide: GUN, frame: GUN2, gripLen: 0.09 }); magazine(g, -0.03 - 0.032, -0.085, 0.1, 0.03, 0.026, GUN2, -0.02); bx(g, 0.07, 0.09, -0.05, 0.0, 0.02, POLY); f.mag = [-0.08, -0.185, 0]; f.support = [0.08, -0.04, 0]; f.len = 0.2; return f; },
    lmg: function (g) { var f = rifleKit(g, { rx0: -0.09, rx1: 0.34, rh: 0.11, rw: 0.06, bore: 0.075, mag: 'box', magX: 0.16, hg: 0.26, hgShape: 'round', hgR: 0.034, barrel: 0.22, br: 0.016, stock: 'solid', stockLen: 0.26, bipod: true, carry: true }); bx(g, 0.0, 0.3, 0.111, 0.118, 0.05, GUN2); return f; },
    combatmg: function (g) { return rifleKit(g, { rx0: -0.08, rx1: 0.3, rh: 0.1, rw: 0.056, bore: 0.07, mag: 'drum', magX: 0.15, hg: 0.24, barrel: 0.2, br: 0.015, stock: 'solid', stockLen: 0.25, bipod: true, accent: OLIVE, hgCol: OLIVE }); },
    // ---- rifles ----
    // The Monologue: a boxy body, a straight magazine, a carry handle
    rifle: function (g) { return rifleKit(g, { rx0: -0.07, rx1: 0.3, rh: 0.09, rw: 0.05, mag: 'straight', magX: 0.15, magLen: 0.18, hg: 0.2, barrel: 0.14, stock: 'solid', carry: true, grip: BROWN }); },
    carbine: function (g) { return rifleKit(g, { rx0: -0.06, rx1: 0.26, rh: 0.085, rw: 0.046, mag: 'curved', magX: 0.13, magLen: 0.17, hg: 0.24, barrel: 0.1, stock: 'skeleton', stockLen: 0.22 }); },
    battlerifle: function (g) { return rifleKit(g, { rx0: -0.07, rx1: 0.3, rh: 0.09, rw: 0.05, mag: 'straight', magX: 0.15, magLen: 0.12, magW: 0.06, hg: 0.26, hgShape: 'wood', barrel: 0.2, stock: 'wood', stockLen: 0.27, brake: true, topRail: false, body: GUN2 }); },
    // Bullet Points: a bullpup, the magazine behind the grip
    bullpup: function (g) {
      prism(g, [[-0.32, -0.02], [0.2, -0.02], [0.24, 0.02], [0.24, 0.09], [-0.32, 0.09]], 0.054, POLY);
      bx(g, -0.33, -0.31, -0.06, 0.09, 0.05, RUBBER);
      pistolGrip(g, GUN, 0.1, 0.034); triggerGuard(g, 0.02, 0.07, POLY);
      magazine(g, -0.14, -0.018, 0.15, 0.05, 0.034, GUN2, 0.05, true);
      tube(g, 0.24, 0.42, 0.012, 0.012, STEEL, 7, 0.058, 0); tube(g, 0.4, 0.43, 0.02, 0.02, GUN, 7, 0.058, 0);
      rail(g, -0.1, 0.22, 0.09); bx(g, 0.14, 0.24, -0.04, -0.02, 0.05, POLY);
      return { muzzle: [0.43, 0.058, 0], rail: [0.04, 0.1, 0], under: [0.18, -0.03, 0], mag: [-0.08, -0.17, 0], support: [0.17, -0.04, 0], len: 0.76 };
    },
    // ---- shotguns ----
    shotgun: function (g) {
      bx(g, -0.08, 0.22, -0.005, 0.07, 0.044, GUN2);
      tube(g, 0.22, 0.72, 0.016, 0.016, GUN, 7, 0.05, 0); tube(g, 0.22, 0.64, 0.013, 0.013, STEEL, 7, 0.018, 0);
      bx(g, 0.34, 0.48, -0.004, 0.04, 0.05, WOOD2); for (var r = 0; r < 4; r++) bx(g, 0.35 + r * 0.03, 0.36 + r * 0.03, -0.006, 0.042, 0.052, WOOD);
      prism(g, [[-0.075, 0.065], [-0.075, -0.0], [-0.34, -0.085], [-0.355, -0.08], [-0.355, 0.045]], 0.042, WOOD);
      pistolGrip(g, WOOD2, 0.085, 0.03, 0.04); triggerGuard(g, 0.0, 0.05, GUN);
      bx(g, 0.705, 0.715, 0.066, 0.076, 0.008, CREAM);
      return { muzzle: [0.72, 0.05, 0], rail: [0.08, 0.07, 0], under: [0.41, -0.005, 0], mag: [0.4, -0.0, 0], support: [0.41, -0.005, 0], len: 1.08 };
    },
    // The Both-Sider: two barrels side by side, one for each side
    doublebarrel: function (g) {
      bx(g, -0.07, 0.1, -0.01, 0.06, 0.05, STEEL);
      tube(g, 0.1, 0.72, 0.015, 0.015, GUN, 8, 0.04, -0.0155); tube(g, 0.1, 0.72, 0.015, 0.015, GUN, 8, 0.04, 0.0155);
      bx(g, 0.1, 0.72, 0.054, 0.058, 0.01, GUN2); prism(g, [[0.12, 0.024], [0.4, 0.024], [0.4, -0.012], [0.14, -0.02]], 0.05, WOOD2);
      prism(g, [[-0.065, 0.055], [-0.065, -0.005], [-0.36, -0.09], [-0.37, -0.085], [-0.37, 0.035]], 0.042, WOOD);
      pistolGrip(g, WOOD, 0.08, 0.03, 0.04); triggerGuard(g, -0.0, 0.05, GUN); bx(g, -0.05, -0.02, 0.06, 0.075, 0.012, STEEL);
      return { muzzle: [0.72, 0.04, 0], rail: [0.0, 0.06, 0], under: [0.3, -0.02, 0], mag: [0.0, -0.0, 0], support: [0.3, -0.03, 0], len: 1.09 };
    },
    autoshotgun: function (g) { return rifleKit(g, { rx0: -0.08, rx1: 0.24, rh: 0.1, rw: 0.06, bore: 0.07, mag: 'drum', magX: 0.12, hg: 0.18, barrel: 0.12, br: 0.018, stock: 'solid', stockLen: 0.22, accent: GUN2 }); },
    sawnoff: function (g) {
      bx(g, -0.06, 0.08, -0.008, 0.058, 0.05, STEEL);
      tube(g, 0.08, 0.36, 0.016, 0.016, GUN, 8, 0.04, -0.016); tube(g, 0.08, 0.36, 0.016, 0.016, GUN, 8, 0.04, 0.016);
      prism(g, [[0.09, 0.022], [0.24, 0.022], [0.24, -0.014], [0.1, -0.02]], 0.05, WOOD2);
      pistolGrip(g, WOOD, 0.1, 0.034, 0.045); triggerGuard(g, -0.0, 0.05, GUN);
      return { muzzle: [0.36, 0.04, 0], rail: [0.0, 0.058, 0], under: [0.18, -0.02, 0], mag: [0.0, 0.0, 0], support: [0.17, -0.03, 0], len: 0.48 };
    },
    // ---- snipers ----
    // The Fact Checker: a long barrel, a scope, a bipod folded under the barrel
    sniper: function (g) { var f = rifleKit(g, { rx0: -0.07, rx1: 0.32, rh: 0.08, rw: 0.05, mag: 'straight', magX: 0.12, magLen: 0.07, hg: 0.2, barrel: 0.42, br: 0.013, stock: 'solid', stockLen: 0.3, brake: true, topRail: false, body: c('#2f3340'), bipod: true }); scopeTube(g, -0.05, 0.3, 0.13, 0.026, GUN); return f; },
    marksman: function (g) { var f = rifleKit(g, { rx0: -0.07, rx1: 0.3, rh: 0.088, rw: 0.05, mag: 'straight', magX: 0.14, magLen: 0.11, hg: 0.26, barrel: 0.2, stock: 'solid', stockLen: 0.27, body: TAN, accent: c('#8a7652'), stockCol: TAN, hgCol: c('#8a7652') }); scopeTube(g, -0.04, 0.26, 0.135, 0.022, GUN); return f; },
    heavysniper: function (g) { var f = rifleKit(g, { rx0: -0.08, rx1: 0.34, rh: 0.1, rw: 0.06, bore: 0.07, mag: 'straight', magX: 0.14, magLen: 0.1, magW: 0.07, hg: 0.2, hgShape: 'round', hgR: 0.03, barrel: 0.6, br: 0.017, stock: 'skeleton', stockLen: 0.3, brake: true, topRail: false, bipod: true }); scopeTube(g, -0.06, 0.32, 0.16, 0.03, GUN); return f; },
    // ---- heavy ----
    // the Ratio Launcher: a tube with a pink RATIO stencil and a shoulder rest
    ratio: function (g) {
      tube(g, -0.55, 0.45, 0.065, 0.065, OLIVE, 10, 0.1, 0); tube(g, 0.0, 0.22, 0.068, 0.068, PINK, 10, 0.1, 0);
      tube(g, 0.45, 0.56, 0.066, 0.095, GUN2, 10, 0.1, 0); tube(g, -0.6, -0.55, 0.07, 0.065, GUN2, 10, 0.1, 0);
      bx(g, -0.28, -0.06, 0.02, 0.05, 0.06, GUN); pistolGrip(g, BROWN, 0.11, 0.032);
      bx(g, 0.16, 0.2, -0.06, 0.04, 0.032, GUN2); bx(g, -0.2, -0.1, 0.165, 0.215, 0.02, GUN2); bx(g, -0.22, -0.08, 0.21, 0.23, 0.05, GUN);
      return { muzzle: [0.56, 0.1, 0], rail: [-0.15, 0.17, 0], under: [0.18, 0.03, 0], mag: [-0.55, 0.1, 0], support: [0.18, -0.04, 0], len: 1.16, holster: 'back', hold: 'two', shoulder: true };
    },
    // the Confetti Cannon: a six-shot revolving launcher, the chambers full of glitter
    confetti: function (g) {
      tubeZ(g, 0.1, 0.06, -0.04, 0.04, 0.075, GUN2, 6); for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; tubeZ(g, 0.1 + Math.cos(a) * 0.045, 0.06 + Math.sin(a) * 0.045, 0.039, 0.043, 0.015, [PINK, YELLOW, CYAN, GREEN, ORANGE, WHITE][i], 6); }
      tube(g, 0.1, 0.42, 0.035, 0.035, GUN, 10, 0.06, 0); tube(g, 0.4, 0.44, 0.042, 0.042, PINK, 10, 0.06, 0);
      bx(g, -0.06, 0.04, -0.005, 0.07, 0.04, GUN); pistolGrip(g, POLY, 0.1, 0.032); triggerGuard(g, 0.0, 0.045, GUN);
      bx(g, -0.3, -0.06, 0.02, 0.04, 0.03, STEEL); bx(g, -0.32, -0.29, -0.04, 0.07, 0.05, RUBBER); bx(g, 0.24, 0.28, -0.06, 0.03, 0.03, POLY);
      return { muzzle: [0.44, 0.06, 0], rail: [0.2, 0.1, 0], under: [0.26, 0.02, 0], mag: [0.1, -0.02, 0], support: [0.26, -0.05, 0], len: 0.78, holster: 'back', hold: 'two' };
    },
    // The Spin Machine: six barrels on a spindle (a child named 'spin' turns while it fires), a carry handle, a belt box
    spin: function (g) {
      bx(g, -0.2, 0.12, -0.06, 0.1, 0.12, GUN); bx(g, -0.24, -0.2, -0.04, 0.08, 0.1, GUN2);
      bx(g, -0.06, 0.08, 0.1, 0.12, 0.02, STEEL); bx(g, -0.06, -0.04, 0.06, 0.12, 0.02, STEEL); bx(g, 0.06, 0.08, 0.06, 0.12, 0.02, STEEL);
      pistolGrip(g, RUBBER, 0.1, 0.034); bx(g, -0.16, -0.02, -0.2, -0.06, 0.1, OLIVE); bx(g, -0.15, -0.03, -0.205, -0.19, 0.105, GREY);
      return { muzzle: [0.72, 0.02, 0], rail: [0.0, 0.12, 0], under: [0.3, -0.04, 0], mag: [-0.09, -0.2, 0], support: [0.02, 0.12, -0.02], len: 0.96, holster: 'back', hold: 'two', spinBarrels: true };
    },
    // Viral Loop: a firework launcher, stars on the tube
    firework: function (g) {
      tube(g, -0.25, 0.62, 0.05, 0.05, c('#3d6fcf'), 10, 0.09, 0); for (var i = 0; i < 4; i++) tube(g, -0.1 + i * 0.18, -0.06 + i * 0.18, 0.052, 0.052, YELLOW, 10, 0.09, 0);
      tube(g, 0.62, 0.68, 0.05, 0.065, GOLD, 10, 0.09, 0);
      prism(g, [[-0.05, 0.05], [-0.05, 0.0], [-0.38, -0.07], [-0.39, 0.03]], 0.04, WOOD); pistolGrip(g, WOOD2, 0.1, 0.03); bx(g, 0.2, 0.24, -0.06, 0.05, 0.03, WOOD2);
      return { muzzle: [0.68, 0.09, 0], rail: [0.1, 0.14, 0], under: [0.22, 0.04, 0], mag: [-0.25, 0.09, 0], support: [0.22, -0.04, 0], len: 1.07, holster: 'back', hold: 'two', shoulder: true };
    },
    // ---- thrown (upright) ----
    hottake: function (g) { g.cylinder(0, 0, 0, 0.06, 0.06, 0.18, 8, ORANGE); g.cylinder(0, 0.18, 0, 0.06, 0.04, 0.03, 8, c('#ff9a40')); box(g, -0.04, 0.2, -0.04, 0.08, 0.04, 0.08, c('#ffd27a')); return { len: 0.24, upright: true, holster: 'none', hold: 'one' }; },
    // the Hot Mic: a handheld mic with a red ON AIR cap (a separate child, Combat blinks it) and a cable tail
    hotmic: function (g) {
      g.cylinder(0, 0, 0, 0.024, 0.028, 0.2, 7, GUN); g.cylinder(0, 0.2, 0, 0.03, 0.038, 0.06, 7, GUN2); g.sphere(0, 0.32, 0, 0.058, 8, 4, STEEL);
      g.cylinder(0, 0.26, 0, 0.04, 0.04, 0.012, 7, CREAM); box(g, -0.008, -0.11, -0.008, 0.016, 0.11, 0.016, RUBBER); box(g, -0.03, -0.13, -0.008, 0.04, 0.02, 0.016, RUBBER);
      return { len: 0.38, upright: true, holster: 'none', hold: 'one' };
    },
    // Smoke & Mirrors: a canister with a mirrored band and a pin
    smoke: function (g) { g.cylinder(0, 0, 0, 0.035, 0.035, 0.14, 8, GREY); g.cylinder(0, 0.06, 0, 0.037, 0.037, 0.03, 8, CHROME); g.cylinder(0, 0.14, 0, 0.02, 0.02, 0.025, 6, GUN); box(g, 0.015, 0.11, -0.005, 0.012, 0.06, 0.01, STEEL); tubeZ(g, -0.03, 0.17, -0.003, 0.003, 0.014, STEEL, 6); return { len: 0.18, upright: true, holster: 'none', hold: 'one' }; },
    // the Sticky Note: a yellow pad with a blinking light and a timer strip
    stickynote: function (g) { box(g, -0.045, 0.0, -0.045, 0.09, 0.03, 0.09, YELLOW); box(g, -0.04, 0.03, -0.04, 0.08, 0.004, 0.08, c('#ffe98a')); box(g, -0.01, 0.034, -0.01, 0.02, 0.012, 0.02, RED); box(g, -0.035, 0.034, 0.02, 0.07, 0.004, 0.012, GUN); return { len: 0.09, upright: true, holster: 'none', hold: 'one' }; },
    // the Scalding Latte: a paper cup, a sleeve, a lid
    coffee: function (g) { g.cylinder(0, 0, 0, 0.034, 0.045, 0.14, 9, WHITE); g.cylinder(0, 0.04, 0, 0.038, 0.042, 0.05, 9, c('#a0683a')); g.cylinder(0, 0.14, 0, 0.048, 0.046, 0.018, 9, WHITE); g.cylinder(0, 0.158, 0, 0.04, 0.03, 0.012, 9, WHITE); return { len: 0.17, upright: true, holster: 'none', hold: 'one' }; }
  };
  // the class each built weapon is drawn as (the fallback picks a builder of the same class for unknown ids)
  var CLASS_OF = {
    tableleg: 'melee', gavel: 'melee', bat: 'melee', selfie: 'melee', knuckles: 'melee', megaphone: 'special',
    pistol: 'pistol', oped: 'pistol', filibuster: 'pistol', revolver: 'pistol', smg: 'smg', threadpistol: 'smg', liveblog: 'smg', pocketsmg: 'smg',
    lmg: 'lmg', combatmg: 'lmg', rifle: 'rifle', carbine: 'rifle', battlerifle: 'rifle', bullpup: 'rifle', shotgun: 'shotgun', doublebarrel: 'shotgun',
    autoshotgun: 'shotgun', sawnoff: 'shotgun', sniper: 'sniper', marksman: 'sniper', heavysniper: 'sniper', ratio: 'launcher', confetti: 'launcher',
    spin: 'launcher', firework: 'launcher', hottake: 'thrown', hotmic: 'thrown', smoke: 'thrown', stickynote: 'thrown', coffee: 'thrown'
  };
  // attachment slots by class (a weapon's own list from the parity table wins in Combat)
  var SLOTS = { pistol: ['muzzle', 'mag', 'optic', 'light'], smg: ['muzzle', 'mag', 'optic', 'grip', 'light'], rifle: ['muzzle', 'mag', 'optic', 'grip', 'light'],
    lmg: ['muzzle', 'optic', 'grip'], shotgun: ['muzzle', 'mag', 'optic', 'grip', 'light'], sniper: ['muzzle', 'mag', 'optic'] };
  var NO_MAG = { doublebarrel: 1, sawnoff: 1, revolver: 1 };
  // per weapon fit overrides (hold, holster, pickup scale)
  var FIT_X = {
    pistol: { hold: 'one', holster: 'hip' }, oped: { hold: 'one', holster: 'hip' }, filibuster: { hold: 'one', holster: 'hip' }, revolver: { hold: 'one', holster: 'hip' },
    threadpistol: { hold: 'one', holster: 'hip' }, pocketsmg: { hold: 'one', holster: 'hip' }, sawnoff: { hold: 'one', holster: 'hip' },
    tableleg: { pickupScale: 0.85 }, bat: { pickupScale: 0.7 }, selfie: { pickupScale: 0.75 }, rifle: { pickupScale: 0.8 }, carbine: { pickupScale: 0.8 }, battlerifle: { pickupScale: 0.7 },
    lmg: { pickupScale: 0.65 }, combatmg: { pickupScale: 0.65 }, shotgun: { pickupScale: 0.7 }, doublebarrel: { pickupScale: 0.7 }, autoshotgun: { pickupScale: 0.75 },
    sniper: { pickupScale: 0.55 }, marksman: { pickupScale: 0.6 }, heavysniper: { pickupScale: 0.5 }, ratio: { pickupScale: 0.55 }, firework: { pickupScale: 0.6 }, spin: { pickupScale: 0.6 }
  };

  // ---------------------------------------------------- tints and attachments --
  var TINTS = [
    { id: 'stock', name: 'Factory Finish', main: null, second: null, price: 0 },
    { id: 'gold', name: 'Goldplate Finish', main: '#c9992a', second: '#e8c25a', price: 2500 },
    { id: 'pink', name: 'Ratio Pink', main: '#d6337f', second: '#ff6fb8', price: 800 },
    { id: 'green', name: 'Touch Grass Green', main: '#3b6b36', second: '#4f8a48', price: 500 },
    { id: 'blue', name: 'Blue Check Blue', main: '#24508f', second: '#3a6fbf', price: 500 },
    { id: 'olive', name: 'Op-Ed Olive', main: '#55522f', second: '#6a6640', price: 400 },
    { id: 'platinum', name: 'Platinum Take', main: '#9ea3ad', second: '#c7cbd3', price: 1500 },
    { id: 'orange', name: 'Hot Take Orange', main: '#d0561a', second: '#ff7a33', price: 600 }
  ];
  var ATTACH = {
    muzzle: [{ id: 'suppressor', name: 'The Quiet Part', price: 900 }, { id: 'compensator', name: 'Spin Compensator', price: 450 }],
    mag: [{ id: 'extended', name: 'Extended Remarks', price: 600 }],
    optic: [{ id: 'reddot', name: 'Talking Point Dot', price: 350 }, { id: 'scope', name: 'Long Lens', price: 800 }],
    grip: [{ id: 'grip', name: 'Firm Handshake Grip', price: 300 }],
    light: [{ id: 'flashlight', name: 'Spotlight Segment', price: 250 }]
  };
  // the muzzle attachment's length along +x (Combat moves the flash and the shot origin out by it)
  var MUZZLE_LEN = { suppressor: 0.16, compensator: 0.05 };

  // ---------------------------------------------------------------- cache --
  var geoCache = {}, fitCache = {}, stencilTex = null, capMatProto = null, lensMat = null, attachGeo = {};
  function hashId(id) { var h = 2166136261; for (var i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // the builder for an id: its own, else a built weapon of its class (picked by a hash of the id, so it is stable)
  function builderFor(id, cls) {
    if (BUILD[id]) return id;
    if (!id || id === 'fist') return null;
    cls = cls || clsHint(id);
    var pool = []; for (var k in CLASS_OF) if (CLASS_OF[k] === cls) pool.push(k);
    if (!pool.length) for (k in CLASS_OF) if (CLASS_OF[k] === 'pistol') pool.push(k);
    return pool[hashId(id) % pool.length];
  }
  function clsHint(id) {
    var W = GTP.Combat && GTP.Combat.WEAPONS, w = W && W[id];
    return w && w.cls ? w.cls : 'pistol';
  }
  function finishFit(id, base, f) {
    f = f || {};
    var out = {
      len: f.len || 0.3, hold: f.hold || 'two', holster: f.holster || 'back', upright: !!f.upright, knuckle: !!f.knuckle, melee: !!f.melee, shoulder: !!f.shoulder,
      spinBarrels: !!f.spinBarrels, pickupScale: 1, muzzle: f.muzzle || [f.len || 0.3, 0.04, 0], support: f.support || null, rail: f.rail || [0.05, 0.08, 0],
      under: f.under || [0.15, 0.0, 0], mag: f.mag || [0.1, -0.1, 0], slots: [], cls: CLASS_OF[base] || 'pistol', base: base
    };
    var x = FIT_X[base]; if (x) for (var k in x) out[k] = x[k];
    out.slots = (SLOTS[out.cls] || []).filter(function (s) { return !(s === 'mag' && NO_MAG[base]); });
    if (out.melee || out.upright) out.support = null;
    return out;
  }
  function geometryFor(base, tint) {
    var key = base + '|' + (tint || 'stock');
    if (geoCache[key]) return geoCache[key];
    if (!geoCache[base + '|stock']) {
      var g = new GB({ color: true }), f = BUILD[base](g);
      fitCache[base] = finishFit(base, base, f);
      geoCache[base + '|stock'] = g.build();
    }
    if (!tint || tint === 'stock') return geoCache[key];
    var t = null; for (var i = 0; i < TINTS.length; i++) if (TINTS[i].id === tint) t = TINTS[i];
    if (!t || !t.main) return geoCache[base + '|stock'];
    return (geoCache[key] = recolor(geoCache[base + '|stock'], c(t.main), c(t.second)));
  }
  // a tint: the dark metal and the polymer take the tint's pair; wood, steel, brass and the accents keep their colours
  function recolor(src, main, second) {
    var g = src.clone(), col = g.getAttribute('color'), a = col.array;
    for (var i = 0; i < a.length; i += 3) {
      for (var k = 0; k < TINTABLE.length; k++) {
        var t = TINTABLE[k];
        if (Math.abs(a[i] - t[0]) < 0.004 && Math.abs(a[i + 1] - t[1]) < 0.004 && Math.abs(a[i + 2] - t[2]) < 0.004) {
          var to = k === 1 ? second : main; a[i] = to[0]; a[i + 1] = to[1]; a[i + 2] = to[2]; break;
        }
      }
    }
    col.needsUpdate = true;
    return g;
  }
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
  // ------------------------------------------------------- attachment meshes --
  function attachmentGeometry(slot, variant, f) {
    var key = slot + ':' + variant + ':' + f.base;
    if (attachGeo[key]) return attachGeo[key];
    var g = new GB({ color: true }), m = f.muzzle, r = f.rail, u = f.under, mg = f.mag, big = f.cls === 'rifle' || f.cls === 'lmg' || f.cls === 'sniper' || f.cls === 'shotgun' || f.cls === 'smg';
    if (slot === 'muzzle' && variant === 'suppressor') { var sr = big ? 0.026 : 0.02; tube(g, m[0] - 0.01, m[0] + MUZZLE_LEN.suppressor, sr, sr, GUN, 10, m[1], 0); tube(g, m[0] + MUZZLE_LEN.suppressor - 0.006, m[0] + MUZZLE_LEN.suppressor, sr * 0.6, sr * 0.6, RUBBER, 8, m[1], 0); }
    else if (slot === 'muzzle') { tube(g, m[0] - 0.005, m[0] + MUZZLE_LEN.compensator, 0.02, 0.02, GUN2, 8, m[1], 0); for (var k = 0; k < 3; k++) bx(g, m[0] + 0.008 + k * 0.014, m[0] + 0.014 + k * 0.014, m[1] + 0.012, m[1] + 0.024, 0.044, GUN); }
    else if (slot === 'optic' && variant === 'reddot') { bx(g, r[0] - 0.025, r[0] + 0.025, r[1], r[1] + 0.012, 0.024, GUN); prism(g, [[r[0] - 0.02, r[1] + 0.012], [r[0] + 0.022, r[1] + 0.012], [r[0] + 0.022, r[1] + 0.05], [r[0] - 0.012, r[1] + 0.05]], 0.03, GUN2); bx(g, r[0] + 0.019, r[0] + 0.023, r[1] + 0.016, r[1] + 0.046, 0.022, c('#ff2d4a')); }
    else if (slot === 'optic') { scopeTube(g, r[0] - 0.13, r[0] + 0.13, r[1] + 0.04, big ? 0.024 : 0.018, GUN); }
    else if (slot === 'mag') { bx(g, mg[0] - 0.024, mg[0] + 0.024, mg[1] - 0.07, mg[1] + 0.01, 0.03, GUN2); bx(g, mg[0] - 0.026, mg[0] + 0.026, mg[1] - 0.078, mg[1] - 0.068, 0.034, RUBBER); }
    else if (slot === 'grip') { prism(g, [[u[0] - 0.018, u[1] + 0.004], [u[0] + 0.018, u[1] + 0.004], [u[0] + 0.014, u[1] - 0.085], [u[0] - 0.016, u[1] - 0.085]], 0.026, POLY); }
    else if (slot === 'light') { tube(g, u[0] - 0.05, u[0] + 0.05, 0.016, 0.016, GUN, 8, u[1] - 0.012, 0.03); bx(g, u[0] - 0.03, u[0] + 0.02, u[1] - 0.008, u[1] + 0.004, 0.03, GUN2); }
    return (attachGeo[key] = g.build());
  }

  A.weaponMeshes = BUILD;
  A.weaponFit = FIT;
  A.weaponTints = TINTS;
  A.weaponAttachments = ATTACH;
  A.weaponClassOf = function (id) { return CLASS_OF[id] || null; };
  // the fit for an id (built weapons by name; others by the class fallback); also kept in weaponFit[id]
  A.weaponFitFor = function (id, cls) {
    if (!id || id === 'fist') return null;
    if (FIT[id]) return FIT[id];
    var base = builderFor(id, cls); if (!base) return null;
    geometryFor(base, null);
    var f = Object.assign({}, fitCache[base]); f.id = id;
    var W = GTP.Combat && GTP.Combat.WEAPONS, w = W && W[id];
    if (w && w.hold) f.hold = w.hold;
    if (w && w.holster) f.holster = w.holster;
    return (FIT[id] = f);
  };
  A.weaponGeometry = function (id, tint) {
    var base = builderFor(id); if (!base) return null;
    return geometryFor(base, tint);
  };
  A.weaponMuzzle = function (id, mods) {
    var f = A.weaponFitFor(id); if (!f) return [0.3, 0.04, 0];
    var m = f.muzzle.slice(); if (mods && mods.muzzle && MUZZLE_LEN[mods.muzzle]) m[0] += MUZZLE_LEN[mods.muzzle];
    return m;
  };
  A.weaponMesh = function (id, mods) {
    var base = builderFor(id); if (!base) return null;
    var f = A.weaponFitFor(id), geo = geometryFor(base, mods && mods.tint);
    var mat = A.propMaterial ? A.propMaterial() : new THREE.MeshLambertMaterial({ vertexColors: true });
    var m = new THREE.Mesh(geo, mat); m.castShadow = true; m.name = 'held'; m.userData.weaponId = id; m.userData.fit = f;
    if (base === 'hotmic') {
      // the ON AIR cap: its own material so Combat can blink it toward the bang
      if (!capMatProto) capMatProto = new THREE.MeshBasicMaterial({ color: 0xe0302a });
      var capM = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.022, 8), capMatProto.clone());
      capM.position.y = 0.225; capM.name = 'cap'; capM.userData.cap = true;
      m.add(capM);
    } else if (base === 'ratio') {
      var sm = new THREE.MeshBasicMaterial({ map: stencil() });
      var sa = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.07), sm); sa.position.set(0.11, 0.1, 0.069); sa.name = 'held'; m.add(sa);
      var sb = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.07), sm); sb.position.set(0.11, 0.1, -0.069); sb.rotation.y = Math.PI; sb.name = 'held'; m.add(sb);
    } else if (base === 'spin') {
      var key = 'spin:' + ((mods && mods.tint) || 'stock'), sg = attachGeo[key];
      if (!sg) {
        var g = new GB({ color: true });
        for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; tube(g, 0.0, 0.6, 0.012, 0.012, i % 2 ? GUN : GUN2, 6, Math.cos(a) * 0.035, Math.sin(a) * 0.035); }
        tubeZ(g, 0.08, 0, -0.05, 0.05, 0.0, GUN, 4); tube(g, 0.06, 0.1, 0.055, 0.055, GUN2, 10, 0, 0); tube(g, 0.5, 0.53, 0.052, 0.052, GUN2, 10, 0, 0);
        sg = attachGeo[key] = g.build();
        if (mods && mods.tint && mods.tint !== 'stock') { var t = null; for (var ti = 0; ti < TINTS.length; ti++) if (TINTS[ti].id === mods.tint) t = TINTS[ti]; if (t && t.main) sg = attachGeo[key] = recolor(sg, c(t.main), c(t.second)); }
      }
      var spinM = new THREE.Mesh(sg, mat); spinM.position.set(0.12, 0.02, 0); spinM.name = 'spin'; spinM.castShadow = true; m.add(spinM);
    }
    if (mods) {
      var slots = ['muzzle', 'mag', 'optic', 'grip', 'light'];
      for (var s = 0; s < slots.length; s++) {
        var v = mods[slots[s]]; if (!v || f.slots.indexOf(slots[s]) < 0) continue;
        var am = new THREE.Mesh(attachmentGeometry(slots[s], v, f), mat); am.name = 'held'; am.castShadow = true; am.userData.attachment = slots[s] + ':' + v; m.add(am);
        if (slots[s] === 'light') {
          if (!lensMat) lensMat = new THREE.MeshBasicMaterial({ color: 0xfff4c8 });
          var lens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 8), lensMat); lens.rotation.y = Math.PI / 2; lens.position.set(f.under[0] + 0.051, f.under[1] - 0.012, 0.03); lens.name = 'lens'; m.add(lens);
        }
      }
    }
    return m;
  };
  // every built id gets its fit up front (Combat, the armory racks and tests read A.weaponFit directly)
  A.weaponIds = function () { return Object.keys(CLASS_OF); };
  A._prefitWeapons = function () { for (var id in CLASS_OF) A.weaponFitFor(id); };
})();
