/* Grand Theft Pundit: 05d_models.js (v0.3 models track)
 * Smooth characters and vehicles. Overrides GTP.Assets.pedParts(look) and GTP.Assets.vehicleGeometry(cls, wrap, mods).
 *
 * Characters (GTP.Models):
 *   One THREE.SkinnedMesh per ped (one draw call, one shared material) over a 17-bone skeleton:
 *     hips > spine > chest > neck > head; chest > upperArm > lowerArm > hand (L, R); hips > upperLeg > lowerLeg > foot (L, R).
 *   Bind pose: feet at y 0, facing -z, arms hanging straight down. Every limb's rest direction is -y, so the v0.2
 *   conventions hold: rotation.x > 0 swings a limb forward, an elbow bends with lowerArm.rotation.x > 0, a knee with
 *   lowerLeg.rotation.x < 0. The six v0.2 pivot names stay on the bones that replace them, so getObjectByName finds
 *   them: legL/legR = upperLeg, armL/armR = upperArm, torso = spine, head = head. The other bones are named by their
 *   bone id (hips, chest, neck, lowerArmL, handL, ...). GTP.Models.bones(root) returns {boneId|alias: Bone}.
 *   Geometry: lathed tubes with superellipse sections and smooth skin weights at the joints (head 1/7.5 of the
 *   height), a shaped head with a procedural face (one shared 1024 px face atlas: eye whites, irises, lids, brows,
 *   nose and mouth shading, skin tone from look.skin), hair meshes per look.hair, clothing per look.outfit (top,
 *   bottom, shoes, hat, glasses; ids from GTP.Content.parity.clothing, else derived from the look colours), and three
 *   LODs (root.userData.lods; GTP.Anim swaps them by camera distance). Held props (mic, phone, placard) are rigid
 *   meshes on the hand bones named 'prop'.
 * Vehicles: see the second half of this file.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var A = GTP.Assets = GTP.Assets || {};
  var C = GTP.C, U = GTP.util;
  var TAU = Math.PI * 2;

  // ------------------------------------------------------------------ colour --
  function hex3(h, def) {
    if (Array.isArray(h)) return h;
    if (typeof h !== 'string' || !/^#?[0-9a-fA-F]{3,6}$/.test(h)) h = def || '#888888';
    var r = U.hexToRgb(h); return [r[0] / 255, r[1] / 255, r[2] / 255];
  }
  function shade(c, k) { return k < 0 ? [c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)] : [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function luma(c) { return c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; }
  function css(c) { return 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')'; }
  // colours are authored as display (sRGB) values; the vertex colour attribute is linear
  function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function sgnpow(v, e) { return v < 0 ? -Math.pow(-v, e) : Math.pow(v, e); }
  var SKINS = ['#f1d3b3', '#e8c39e', '#c68642', '#a46f3c', '#8d5524', '#5c3a1e'];
  function skinIndex(skin) {
    if (typeof skin === 'number') return U.clamp((skin | 0) - 1, 0, 5);
    var Lk = GTP.Content && GTP.Content.looks, hex = skin;
    if (typeof skin !== 'string') return 1;
    // a custom hex: the nearest of the six tones (the face atlas is painted per tone)
    var c = hex3(hex), best = 1, bd = 1e9;
    for (var i = 0; i < 6; i++) { var t = hex3((Lk && Lk.skinColors && Lk.skinColors[i + 1]) || SKINS[i]), d = (t[0] - c[0]) * (t[0] - c[0]) + (t[1] - c[1]) * (t[1] - c[1]) + (t[2] - c[2]) * (t[2] - c[2]); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function skinRGB(i) { var Lk = GTP.Content && GTP.Content.looks; return hex3((Lk && Lk.skinColors && Lk.skinColors[i + 1]) || SKINS[i]); }
  // brows and stubble from the hair colour, in four tones (dyed hair keeps natural brows)
  var BROWS = [[0.1, 0.08, 0.07], [0.27, 0.18, 0.12], [0.55, 0.43, 0.26], [0.55, 0.55, 0.53]];
  function browTone(hair) {
    var c = hex3(hair, '#3a2a1a'), L = luma(c), mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), sat = mx - mn;
    if (L < 0.12) return 0;
    if (sat < 0.08 && L > 0.4) return 3;
    if (c[0] > c[2] + 0.12 && c[1] > c[2] + 0.05 && L > 0.4) return 2;
    return 1;
  }

  // ----------------------------------------------------------------- the rig --
  var BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'upperArmL', 'lowerArmL', 'handL', 'upperArmR', 'lowerArmR', 'handR', 'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR'];
  var PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15];
  var ALIAS = { spine: 'torso', upperArmL: 'armL', upperArmR: 'armR', upperLegL: 'legL', upperLegR: 'legR' };
  var HIPS = 0, SPINE = 1, CHEST = 2, NECK = 3, HEAD = 4, UAL = 5, LAL = 6, HL = 7, UAR = 8, LAR = 9, HR = 10, ULL = 11, LLL = 12, FL = 13, ULR = 14, LLR = 15, FR = 16;
  // joint positions (model space) for a body build: bw scales the shoulders, less the hips
  function rigFor(bw) {
    var sx = 0.19 * bw, hx = 0.092 * (0.6 + 0.4 * bw);
    return [[0, 0.96, 0], [0, 1.06, 0], [0, 1.24, 0], [0, 1.5, 0], [0, 1.585, 0],
      [-sx, 1.445, 0], [-sx, 1.155, 0], [-sx, 0.895, 0], [sx, 1.445, 0], [sx, 1.155, 0], [sx, 0.895, 0],
      [-hx, 0.93, 0], [-hx, 0.505, 0], [-hx, 0.085, 0], [hx, 0.93, 0], [hx, 0.505, 0], [hx, 0.085, 0]];
  }

  // ------------------------------------------------------------ skin builder --
  // positions, uvs, colours, two-bone skin weights; normals are computed smooth per part
  function SB() { this.p = []; this.uv = []; this.c = []; this.si = []; this.sw = []; this.ix = []; this.n = 0; }
  SB.prototype.v = function (x, y, z, u, v, col, b0, b1, w) {
    this.p.push(x, y, z); this.uv.push(u, v); this.c.push(lin(col[0]), lin(col[1]), lin(col[2]));
    if (b1 == null || !w) { this.si.push(b0, 0, 0, 0); this.sw.push(1, 0, 0, 0); }
    else if (w >= 1) { this.si.push(b1, 0, 0, 0); this.sw.push(1, 0, 0, 0); }
    else { this.si.push(b0, b1, 0, 0); this.sw.push(1 - w, w, 0, 0); }
    return this.n++;
  };
  // a quad (a b c d around the face) wound so it faces away from the reference point (ox, oy, oz)
  SB.prototype.quadOut = function (a, b, c, d, ox, oy, oz) {
    var P = this.p, a3 = a * 3, b3 = b * 3, c3 = c * 3, d3 = d * 3;
    var ux = P[c3] - P[a3], uy = P[c3 + 1] - P[a3 + 1], uz = P[c3 + 2] - P[a3 + 2];
    var vx = P[d3] - P[b3], vy = P[d3 + 1] - P[b3 + 1], vz = P[d3 + 2] - P[b3 + 2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    var mx = (P[a3] + P[c3]) * 0.5 - ox, my = (P[a3 + 1] + P[c3 + 1]) * 0.5 - oy, mz = (P[a3 + 2] + P[c3 + 2]) * 0.5 - oz;
    if (nx * mx + ny * my + nz * mz >= 0) this.ix.push(a, b, c, a, c, d); else this.ix.push(a, c, b, a, d, c);
  };
  SB.prototype.triOut = function (a, b, c, ox, oy, oz) {
    var P = this.p, a3 = a * 3, b3 = b * 3, c3 = c * 3;
    var ux = P[b3] - P[a3], uy = P[b3 + 1] - P[a3 + 1], uz = P[b3 + 2] - P[a3 + 2];
    var vx = P[c3] - P[a3], vy = P[c3 + 1] - P[a3 + 1], vz = P[c3 + 2] - P[a3 + 2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    var mx = (P[a3] + P[b3] + P[c3]) / 3 - ox, my = (P[a3 + 1] + P[b3 + 1] + P[c3 + 1]) / 3 - oy, mz = (P[a3 + 2] + P[b3 + 2] + P[c3 + 2]) / 3 - oz;
    if (nx * mx + ny * my + nz * mz >= 0) this.ix.push(a, b, c); else this.ix.push(a, c, b);
  };
  SB.prototype.build = function (flatZ) {
    var g = new THREE.BufferGeometry(), pos = new Float32Array(this.p);
    if (flatZ) for (var i = 2; i < pos.length; i += 3) pos[i] *= flatZ;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.ix, 1) : new THREE.Uint16BufferAttribute(this.ix, 1));
    g.computeVertexNormals();
    // the bind-pose sphere grown to cover raised arms and a lunge (SkinnedMesh culls by it)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.45);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-1.2, -0.3, -1.2), new THREE.Vector3(1.2, 2.3, 1.2));
    return g;
  };

  var WUV = [0.0625, 1 - 0.0625];   // the face atlas' white cell: plain vertex colour
  // A lathed tube: rings [{x, y, z, a, b, col, b0, b1, w}] around `axis` ('y': a on x, b on z; 'z': a on x, b on y;
  // 'x': a on y, b on z). opts: segs, p (superellipse exponent), cap0 / cap1 (pole offset along the axis; false: open),
  // colFn(x, y, z, ring), uvFn(x, y, z), deform(pt, ring, angle)
  function tube(sb, rings, o) {
    var segs = o.segs || 12, ax = o.axis || 'y', pe = o.p || 2, base = sb.n, R = rings.length, i, j, pt = [0, 0, 0];
    for (i = 0; i < R; i++) {
      var r = rings[i];
      for (j = 0; j < segs; j++) {
        var t = j / segs * TAU + (o.phase || 0), ct = Math.cos(t), st = Math.sin(t);
        if (pe !== 2) { ct = sgnpow(ct, 2 / pe); st = sgnpow(st, 2 / pe); }
        if (ax === 'y') { pt[0] = r.x + ct * r.a; pt[1] = r.y; pt[2] = r.z + st * r.b; }
        else if (ax === 'z') { pt[0] = r.x + ct * r.a; pt[1] = r.y + st * r.b; pt[2] = r.z; }
        else { pt[0] = r.x; pt[1] = r.y + ct * r.a; pt[2] = r.z + st * r.b; }
        if (o.deform) o.deform(pt, r, t);
        var col = o.colFn ? o.colFn(pt[0], pt[1], pt[2], r) : r.col;
        var uv = o.uvFn ? o.uvFn(pt[0], pt[1], pt[2]) : WUV;
        sb.v(pt[0], pt[1], pt[2], uv[0], uv[1], col, r.b0, r.b1, r.w);
      }
    }
    for (i = 0; i < R - 1; i++) {
      var r0 = rings[i], r1 = rings[i + 1], ox = (r0.x + r1.x) / 2, oy = (r0.y + r1.y) / 2, oz = (r0.z + r1.z) / 2;
      for (j = 0; j < segs; j++) {
        var j1 = (j + 1) % segs;
        sb.quadOut(base + i * segs + j, base + i * segs + j1, base + (i + 1) * segs + j1, base + (i + 1) * segs + j, ox, oy, oz);
      }
    }
    function cap(ri, nb, len) {
      var r = rings[ri], n = rings[nb], dx = r.x - n.x, dy = r.y - n.y, dz = r.z - n.z, dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      var px = r.x + dx / dl * len, py = r.y + dy / dl * len, pz = r.z + dz / dl * len;
      var col = o.colFn ? o.colFn(px, py, pz, r) : r.col, uv = o.uvFn ? o.uvFn(px, py, pz) : WUV;
      var pole = sb.v(px, py, pz, uv[0], uv[1], col, r.b0, r.b1, r.w), b = base + ri * segs;
      for (var k = 0; k < segs; k++) sb.triOut(pole, b + k, b + (k + 1) % segs, n.x, n.y, n.z);
    }
    if (o.cap0 !== false && R > 1) cap(0, 1, o.cap0 || 0);
    if (o.cap1 !== false && R > 1) cap(R - 1, R - 2, o.cap1 || 0);
  }
  // an ellipsoid as a tube of latitude rings; deform(pt, ring) gets model-space points
  function ellipsoid(sb, cx, cy, cz, rx, ry, rz, segs, rings, col, b0, b1, w, extra) {
    var list = [];
    for (var i = 0; i <= rings; i++) {
      var lat = -Math.PI / 2 + i / rings * Math.PI, cl = Math.cos(lat);
      if (i === 0 || i === rings) cl = 0;
      list.push({ x: cx, y: cy + Math.sin(lat) * ry, z: cz, a: rx * cl, b: rz * cl, col: col, b0: b0, b1: b1, w: w, lat: lat });
    }
    var o = { segs: segs, cap0: false, cap1: false };
    if (extra) for (var k in extra) o[k] = extra[k];
    tube(sb, list, o);
  }
  // a ring tube (torus) in the plane given by axis ('z': a ring facing forward, 'y': a horizontal ring)
  function torus(sb, cx, cy, cz, R, rr, segs, tsegs, col, b0, axis, sx, sy) {
    sx = sx || 1; sy = sy || 1;
    var base = sb.n, i, j;
    for (i = 0; i < segs; i++) {
      var a = i / segs * TAU, ca = Math.cos(a) * sx, sa = Math.sin(a) * sy;
      for (j = 0; j < tsegs; j++) {
        var b = j / tsegs * TAU, cb = Math.cos(b), sbb = Math.sin(b), rad = R + rr * cb;
        var x, y, z;
        if (axis === 'y') { x = cx + ca * rad; z = cz + sa * rad; y = cy + sbb * rr; }
        else { x = cx + ca * rad; y = cy + sa * rad; z = cz + sbb * rr; }
        sb.v(x, y, z, WUV[0], WUV[1], col, b0);
      }
    }
    for (i = 0; i < segs; i++) {
      var i1 = (i + 1) % segs, a0 = i / segs * TAU, ocx = cx + Math.cos(a0) * R * sx, ocy = axis === 'y' ? cy : cy + Math.sin(a0) * R * sy, ocz = axis === 'y' ? cz + Math.sin(a0) * R * sy : cz;
      for (j = 0; j < tsegs; j++) {
        var j1 = (j + 1) % tsegs;
        sb.quadOut(base + i * tsegs + j, base + i * tsegs + j1, base + i1 * tsegs + j1, base + i1 * tsegs + j, ocx, ocy, ocz);
      }
    }
  }

  // ---------------------------------------------------------- the face atlas --
  // 1024 px, 8 x 8 cells of 128 px. Cell 0 is white (plain vertex colour). Cells 1..48: six skin tones x four brow
  // tones x two eye colours, painted at first use in one upload; later cells: special faces (masks, beards).
  var ATLAS = { canvas: null, ctx: null, tex: null, cells: {}, next: 1, size: 1024, cell: 128, dirty: false };
  var EYES = [[0.24, 0.15, 0.08], [0.3, 0.42, 0.55]];
  function cellUV(i) { var col = i % 8, row = (i / 8) | 0; return { u0: col / 8, v0: 1 - (row + 1) / 8 }; }
  function paintFace(i, skin, brow, eye, extra) {
    var ctx = ATLAS.ctx, S = ATLAS.cell, ox = (i % 8) * S, oy = ((i / 8) | 0) * S;
    ctx.save(); ctx.translate(ox, oy);
    ctx.beginPath(); ctx.rect(0, 0, S, S); ctx.clip();
    var sk = skin, dk = shade(sk, -0.18), dk2 = shade(sk, -0.3), lt = shade(sk, 0.1);
    ctx.fillStyle = css(sk); ctx.fillRect(0, 0, S, S);
    // soft modelling: darker toward the jaw line and temples, a lighter brow ridge and cheekbones
    var g = ctx.createRadialGradient(64, 60, 18, 64, 66, 64); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.13)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    function blob(x, y, rx, ry, c, a) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = css(c); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    blob(64, 50, 26, 6, lt, 0.35);                                   // brow ridge highlight
    blob(41, 78, 10, 7, mix(sk, [0.85, 0.35, 0.33], 0.5), 0.22); blob(87, 78, 10, 7, mix(sk, [0.85, 0.35, 0.33], 0.5), 0.22);   // cheeks
    blob(64, 104, 16, 8, dk, 0.25);                                   // under the lower lip / chin
    // eye sockets
    blob(47, 61, 11, 6, dk, 0.35); blob(81, 61, 11, 6, dk, 0.35);
    // eyes: white, iris, pupil, a catch light, the upper lid line and a crease
    [-1, 1].forEach(function (s) {
      var ex = 64 + s * 17, ey = 63;
      ctx.fillStyle = 'rgb(236,234,228)'; ctx.beginPath(); ctx.ellipse(ex, ey, 7.5, 3.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = css(eye); ctx.beginPath(); ctx.arc(ex + s * -0.5, ey + 0.2, 3.3, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgb(18,14,12)'; ctx.beginPath(); ctx.arc(ex + s * -0.5, ey + 0.2, 1.5, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(ex + s * -0.5 + 0.6, ey - 1.6, 1.2, 1.2);
      ctx.strokeStyle = css(shade(brow, -0.35)); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(ex, ey + 0.8, 7.8, 4.4, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      ctx.strokeStyle = css(dk2); ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(ex, ey - 1.5, 8, 4.5, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); ctx.globalAlpha = 1;
      // brows: a tapered arc
      ctx.fillStyle = css(brow); ctx.beginPath();
      ctx.moveTo(ex - s * 9, ey - 8); ctx.quadraticCurveTo(ex + s * 1, ey - 14, ex + s * 10, ey - 10);
      ctx.quadraticCurveTo(ex + s * 1, ey - 11.5, ex - s * 9, ey - 5.5); ctx.closePath(); ctx.fill();
    });
    // nose: the bridge shadow on each side, the tip highlight and the nostrils
    ctx.save(); ctx.globalAlpha = 0.3; ctx.strokeStyle = css(dk2); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(59, 64); ctx.quadraticCurveTo(57, 74, 56, 80); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(69, 64); ctx.quadraticCurveTo(71, 74, 72, 80); ctx.stroke(); ctx.restore();
    blob(64, 76, 5, 4, lt, 0.4);
    blob(60, 81.5, 2.4, 1.5, dk2, 0.75); blob(68, 81.5, 2.4, 1.5, dk2, 0.75);
    blob(64, 84, 9, 2, dk, 0.35);
    // mouth: the philtrum, a darker upper lip, a fuller lower lip with a highlight, the parting line
    var lip = mix(dk, [0.62, 0.28, 0.27], 0.35);
    blob(64, 87, 2.5, 2.5, dk, 0.25);
    ctx.fillStyle = css(shade(lip, -0.12)); ctx.beginPath(); ctx.moveTo(53, 92); ctx.quadraticCurveTo(60, 88.5, 64, 90); ctx.quadraticCurveTo(68, 88.5, 75, 92); ctx.quadraticCurveTo(64, 93, 53, 92); ctx.fill();
    ctx.fillStyle = css(lip); ctx.beginPath(); ctx.moveTo(54, 92.3); ctx.quadraticCurveTo(64, 99, 74, 92.3); ctx.quadraticCurveTo(64, 93.5, 54, 92.3); ctx.fill();
    blob(64, 94.8, 4, 1.1, shade(lip, 0.25), 0.5);
    ctx.strokeStyle = css(shade(lip, -0.45)); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(53.5, 92.2); ctx.quadraticCurveTo(64, 93.4, 74.5, 92.2); ctx.stroke();
    if (extra) {
      if (extra.beard === 'stubble' || extra.beard === 'beard') {
        ctx.save(); ctx.globalAlpha = extra.beard === 'beard' ? 0.92 : 0.28; ctx.fillStyle = css(extra.beard === 'beard' ? brow : shade(brow, -0.1));
        ctx.beginPath(); ctx.moveTo(26, 72); ctx.quadraticCurveTo(30, 118, 64, 124); ctx.quadraticCurveTo(98, 118, 102, 72); ctx.lineTo(96, 72);
        ctx.quadraticCurveTo(92, 100, 76, 98); ctx.quadraticCurveTo(64, 90, 52, 98); ctx.quadraticCurveTo(36, 100, 32, 72); ctx.closePath(); ctx.fill();
        ctx.fillRect(50, 84, 28, 5); ctx.restore();
      }
      if (extra.beard === 'mustache') { ctx.fillStyle = css(brow); ctx.beginPath(); ctx.ellipse(64, 87.5, 11, 2.6, 0, 0, TAU); ctx.fill(); }
      if (extra.mask) {
        ctx.fillStyle = css(hex3(extra.mask)); ctx.fillRect(20, 54, 88, 18);
        [-1, 1].forEach(function (s) { ctx.fillStyle = 'rgb(236,234,228)'; ctx.beginPath(); ctx.ellipse(64 + s * 17, 63, 6.5, 3.2, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgb(18,14,12)'; ctx.beginPath(); ctx.arc(64 + s * 17, 63, 1.8, 0, TAU); ctx.fill(); });
      }
    }
    ctx.restore();
  }
  function atlasInit() {
    if (ATLAS.tex) return;
    var cv = document.createElement('canvas'); cv.width = cv.height = ATLAS.size;
    ATLAS.canvas = cv; ATLAS.ctx = cv.getContext('2d');
    ATLAS.ctx.fillStyle = '#ffffff'; ATLAS.ctx.fillRect(0, 0, ATLAS.size, ATLAS.size);
    for (var s = 0; s < 6; s++) for (var b = 0; b < 4; b++) for (var e = 0; e < 2; e++) {
      var i = ATLAS.next++; paintFace(i, skinRGB(s), BROWS[b], EYES[e], null); ATLAS.cells[s + ':' + b + ':' + e] = i;
    }
    // white again over cell 0 (the plain-colour texel)
    ATLAS.ctx.fillStyle = '#ffffff'; ATLAS.ctx.fillRect(0, 0, ATLAS.cell, ATLAS.cell);
    var tex = ATLAS.tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;    // painted in display colours, like the (converted) vertex colours
    tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  function faceCell(skinI, brow, eye, extra) {
    atlasInit();
    var key = skinI + ':' + brow + ':' + eye;
    if (extra && (extra.mask || extra.beard)) key += ':' + (extra.mask || '') + ':' + (extra.beard || '');
    var c = ATLAS.cells[key];
    if (c) return c;
    if (ATLAS.next >= 64) return ATLAS.cells[skinI + ':' + brow + ':' + eye];   // full: the plain face
    c = ATLAS.next++; paintFace(c, skinRGB(skinI), BROWS[brow], EYES[eye], extra); ATLAS.cells[key] = c;
    ATLAS.tex.needsUpdate = true;
    return c;
  }

  // ------------------------------------------------------------ the material --
  var MAT = null;
  function pedMaterial() {
    if (MAT) return MAT;
    atlasInit();
    MAT = new THREE.MeshStandardMaterial({ vertexColors: true, map: ATLAS.tex, roughness: 0.74, metalness: 0, envMapIntensity: 0.4 });
    MAT.name = 'ped';
    return MAT;
  }

  // ---------------------------------------------------------------- outfits --
  // look.outfit = {top, bottom, shoes, hat, glasses}: ids from GTP.Content.parity.clothing (or {style, color} objects);
  // without one, the styles come from the v0.2 look (tie, uniform, role, colours) and a stable hash
  var TOPS = ['tee', 'dress', 'suit', 'hoodie', 'polo', 'jacket', 'uniform', 'swat', 'tank', 'sweater'];
  var BOTTOMS = ['pants', 'jeans', 'shorts', 'skirt'];
  var SHOES = ['sneakers', 'dress', 'boots'];
  function clothingItem(id) {
    var P = GTP.Content && GTP.Content.parity, list = P && P.clothing;
    if (!list || id == null) return null;
    if (!Array.isArray(list)) {
      if (list[id]) return Object.assign({ id: id }, list[id]);
      var all = [];
      Object.keys(list).forEach(function (k) { var v = list[k]; if (Array.isArray(v)) all = all.concat(v); });
      list = all;
    }
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function styleFrom(text, vocab) {
    text = String(text || '').toLowerCase();
    for (var i = 0; i < vocab.length; i++) if (text.indexOf(vocab[i]) >= 0) return vocab[i];
    var syn = { shirt: 'dress', blazer: 'suit', coat: 'jacket', blouse: 'dress', trousers: 'pants', slacks: 'pants', chinos: 'pants', denim: 'jeans', loafer: 'dress', oxford: 'dress', trainer: 'sneakers', kicks: 'sneakers', sneaker: 'sneakers', boot: 'boots', hood: 'hoodie', jersey: 'polo', vest: 'tank', cardigan: 'sweater', jumper: 'sweater', tshirt: 'tee', 't-shirt': 'tee' };
    for (var k in syn) if (text.indexOf(k) >= 0 && vocab.indexOf(syn[k]) >= 0) return syn[k];
    return null;
  }
  function itemColor(it) {
    if (!it) return null;
    var c = it.color || it.colour || it.tint || (it.colors && it.colors[0]) || null;
    return typeof c === 'string' ? c : null;
  }
  function resolveSlot(v, vocab) {
    if (v == null || v === 'none') return null;
    if (typeof v === 'object') return { style: styleFrom(v.style || v.kind || v.type || v.id || v.name, vocab), color: itemColor(v), color2: v.color2 || v.secondary || null };
    var it = clothingItem(v);
    if (it) return { style: styleFrom(it.style || it.kind || it.type || it.mesh || it.id || it.name, vocab) || styleFrom(it.id, vocab), color: itemColor(it), color2: it.color2 || it.secondary || null };
    return { style: styleFrom(v, vocab), color: null };
  }
  function outfitOf(look) {
    look = look || {};
    var h = U.hash(lookKey(look)) >>> 0, shirt = hex3(look.shirt, '#6a8fcf'), pants = hex3(look.pants, '#2a2f4a');
    var tie = look.tie && look.tie !== 'none' ? look.tie : null, role = look.role || '';
    var top = 'tee';
    if (look.uniform === 'swat' || role === 'swat') top = 'swat';
    else if (role === 'cop' || look.badge) top = 'uniform';
    else if (tie) top = luma(shirt) < 0.33 ? 'suit' : 'dress';
    else top = ['tee', 'tee', 'dress', 'hoodie', 'polo', 'jacket', 'tee', 'sweater'][h % 8];
    var bottom = luma(pants) < 0.4 && pants[2] > pants[0] + 0.05 ? 'jeans' : 'pants';
    if ((top === 'tee' || top === 'polo' || top === 'tank') && (h >>> 4) % 7 === 0) bottom = 'shorts';
    var shoes = (top === 'suit' || top === 'dress' || top === 'uniform') ? 'dress' : top === 'swat' ? 'boots' : 'sneakers';
    var o = { top: { style: top, color: shirt }, bottom: { style: bottom, color: pants }, shoes: { style: shoes, color: null }, hat: look.hat && look.hat !== 'none' ? { style: look.hat, color: look.hatColor ? hex3(look.hatColor) : null } : null, glasses: look.glasses && look.glasses !== 'none' ? look.glasses : null, h: h };
    var of = look.outfit;
    if (of && typeof of === 'object') {
      var t = resolveSlot(of.top, TOPS), b = resolveSlot(of.bottom, BOTTOMS), s = resolveSlot(of.shoes, SHOES), ht = resolveSlot(of.hat, ['cap', 'beanie', 'cowboy', 'fedora', 'beret', 'crown', 'helmet']), gl = resolveSlot(of.glasses, ['round', 'aviator', 'thick', 'shades']);
      if (t) { if (t.style) o.top.style = t.style; if (t.color) o.top.color = hex3(t.color); if (t.color2) o.top.color2 = hex3(t.color2); }
      if (b) { if (b.style) o.bottom.style = b.style; if (b.color) o.bottom.color = hex3(b.color); }
      if (s) { if (s.style) o.shoes.style = s.style; if (s.color) o.shoes.color = hex3(s.color); }
      if (of.hat === 'none') o.hat = null; else if (ht && ht.style) o.hat = { style: ht.style, color: ht.color ? hex3(ht.color) : (o.hat && o.hat.color) };
      if (of.glasses === 'none') o.glasses = null; else if (gl && gl.style) o.glasses = gl.style;
    }
    o.top.color2 = o.top.color2 || (o.top.style === 'suit' ? [0.93, 0.93, 0.92] : o.top.style === 'jacket' ? shade(hex3(look.pants, '#2a2f4a'), 0.75) : shade(o.top.color, -0.25));
    if (!o.shoes.color) o.shoes.color = o.shoes.style === 'sneakers' ? [[0.92, 0.92, 0.9], [0.15, 0.15, 0.17], [0.75, 0.2, 0.18], [0.3, 0.4, 0.6]][(h >>> 7) % 4] : o.shoes.style === 'boots' ? [0.12, 0.11, 0.1] : [0.13, 0.09, 0.07];
    return o;
  }
  function lookKey(look) {
    var of = look.outfit ? JSON.stringify(look.outfit) : '';
    return [look.skin, look.hair, look.hairColor, look.shirt, look.pants, look.hat, look.hatColor, look.glasses, look.extra, look.tie, look.uniform, look.badge, look.mask, look.beard, look.build, look.lanyardColor, look.role === 'cop' || look.role === 'swat' ? look.role : '', look.flat ? 'flat' : '', of].join('|');
  }

  // --------------------------------------------------------------- the body --
  function lerpRow(T, y) {
    // T rows [y, a, b, cz] sorted by y: the interpolated row at y
    if (y <= T[0][0]) return T[0].slice();
    for (var i = 0; i < T.length - 1; i++) {
      var r0 = T[i], r1 = T[i + 1];
      if (y <= r1[0]) { var t = (y - r0[0]) / (r1[0] - r0[0]); return [y, r0[1] + (r1[1] - r0[1]) * t, r0[2] + (r1[2] - r0[2]) * t, r0[3] + (r1[3] - r0[3]) * t]; }
    }
    return T[T.length - 1].slice();
  }
  // the table's own rows (every `step`-th) plus a ring pair at every colour boundary, sorted by y
  function ringYs(T, step, bounds) {
    var ys = [];
    for (var i = 0; i < T.length; i += step) ys.push(T[i][0]);
    if (ys[ys.length - 1] !== T[T.length - 1][0]) ys.push(T[T.length - 1][0]);
    (bounds || []).forEach(function (b) { if (b > T[0][0] && b < T[T.length - 1][0]) { ys.push(b - 0.0025); ys.push(b + 0.0025); } });
    ys.sort(function (a, b) { return a - b; });
    return ys;
  }
  function torsoW(y) {
    if (y < 0.99) return [HIPS, null, 0];
    if (y < 1.11) return [HIPS, SPINE, (y - 0.99) / 0.12];
    if (y < 1.2) return [SPINE, null, 0];
    if (y < 1.3) return [SPINE, CHEST, (y - 1.2) / 0.1];
    if (y < 1.48) return [CHEST, null, 0];
    return [CHEST, NECK, Math.min(1, (y - 1.48) / 0.06)];
  }

  // build one LOD of a look's body. q: 0 near, 1 mid, 2 far
  function buildBody(look, q) {
    var sb = new SB(), O = outfitOf(look), h = O.h;
    var bw = look.build === 'broad' ? 1.1 : look.build === 'slim' ? 0.92 : [0.93, 0.97, 1.0, 1.0, 1.03, 1.08][h % 6];
    var belly = look.build === 'broad' ? 0.03 : ((h >>> 3) % 5 === 0 ? 0.022 : 0);
    var rig = rigFor(bw);
    var si = skinIndex(look.skin), skin = skinRGB(si);
    var hairC = hex3(look.hairColor, '#3a2a1a'), brow = browTone(look.hairColor);
    var top = O.top, tc = top.color, tc2 = top.color2, bot = O.bottom, pc = bot.color, shoes = O.shoes;
    var segT = [20, 12, 7][q], segL = [12, 8, 5][q], step = [1, 2, 3][q];
    var detail = q === 0, mid = q <= 1;
    // ---- torso
    var T = [[0.845, 0.07, 0.06, 0.005], [0.875, 0.145, 0.092, 0.008], [0.94, 0.168, 0.108, 0.014], [1.0, 0.162, 0.104, 0.008], [1.07, 0.15, 0.1, 0],
      [1.14, 0.15, 0.103, -0.004], [1.22, 0.16, 0.11, -0.01], [1.3, 0.17, 0.117, -0.013], [1.37, 0.176, 0.114, -0.01], [1.42, 0.178, 0.1, -0.002],
      [1.46, 0.16, 0.085, 0.004], [1.49, 0.115, 0.07, 0.008], [1.515, 0.068, 0.06, 0.008]];
    T = T.map(function (r) {
      var y = r[0], k = y > 1.2 ? bw : y > 1.05 ? 1 + (bw - 1) * (y - 1.05) / 0.15 : 1 + (bw - 1) * 0.4, bb = (y > 0.98 && y < 1.26) ? belly * Math.sin((y - 0.98) / 0.28 * Math.PI) : 0;
      return [y, r[1] * k, r[2] * (0.94 + 0.06 * bw) + bb, r[3] - bb * 0.8];
    });
    var suitLike = top.style === 'suit' || top.style === 'jacket', jacketHem = suitLike ? 0.9 : 0.995;
    var waist = 0.995, beltOn = top.style !== 'swat' && top.style !== 'hoodie' && top.style !== 'sweater' && !suitLike && bot.style !== 'skirt';
    function torsoCol(y) {
      if (suitLike && y > jacketHem) return tc;
      if (y < waist) return pc;
      if (beltOn && y < waist + 0.03) return top.style === 'uniform' ? [0.06, 0.06, 0.07] : [0.14, 0.1, 0.08];
      if (top.style === 'tank' && y > 1.47) return skin;
      return tc;
    }
    var bounds = [waist, jacketHem]; if (beltOn) bounds.push(waist + 0.03);
    var tys = ringYs(T, step, bounds), rings = tys.map(function (y) {
      var r = lerpRow(T, y), w = torsoW(y);
      var flare = suitLike && y < 1.0 && y > jacketHem ? 0.012 : 0;
      return { x: 0, y: y, z: r[3], a: r[1] + flare, b: r[2] + flare, col: torsoCol(y), b0: w[0], b1: w[1], w: w[2] };
    });
    tube(sb, rings, { segs: segT, p: 2.5, cap0: -0.01, cap1: false });
    function torsoFront(x, y, lift, back) {
      var r = lerpRow(T, y), a = r[1], b = r[2], t = Math.min(0.999, Math.abs(x) / a);
      var zz = b * Math.pow(1 - Math.pow(t, 2.5), 1 / 2.5);
      return back ? r[3] + zz + lift : r[3] - zz - lift;
    }
    // a surface patch on the torso front (or back): x from xl(y) to xr(y), y0..y1
    function patch(xl, xr, y0, y1, col, lift, rows, cols, back) {
      rows = rows || 3; cols = cols || 2;
      var base = sb.n, i, j;
      for (i = 0; i <= rows; i++) {
        var y = y0 + (y1 - y0) * i / rows, l = xl(y), r = xr(y), w = torsoW(y);
        for (j = 0; j <= cols; j++) { var x = l + (r - l) * j / cols; sb.v(x, y, torsoFront(x, y, lift, back), WUV[0], WUV[1], col, w[0], w[1], w[2]); }
      }
      for (i = 0; i < rows; i++) for (j = 0; j < cols; j++) {
        var a0 = base + i * (cols + 1) + j, yy = y0 + (y1 - y0) * (i + 0.5) / rows, rr = lerpRow(T, yy);
        sb.quadOut(a0, a0 + 1, a0 + cols + 2, a0 + cols + 1, 0, yy, rr[3]);
      }
    }
    function cst(v) { return function () { return v; }; }
    if (mid) {
      if (top.style === 'suit') {
        // the shirt's V, lapels down to the button, the tie on top
        patch(function (y) { return -0.075 * (y - 1.2) / 0.3 - 0.004; }, function (y) { return 0.075 * (y - 1.2) / 0.3 + 0.004; }, 1.2, 1.5, tc2, 0.002, 3, 2);
        patch(function (y) { return -0.075 * (y - 1.18) / 0.32 - 0.03; }, function (y) { return -0.075 * (y - 1.18) / 0.32 - 0.004; }, 1.18, 1.48, shade(tc, -0.22), 0.004, 3, 1);
        patch(function (y) { return 0.075 * (y - 1.18) / 0.32 + 0.004; }, function (y) { return 0.075 * (y - 1.18) / 0.32 + 0.03; }, 1.18, 1.48, shade(tc, -0.22), 0.004, 3, 1);
        if (detail) { patch(cst(-0.008), cst(0.008), 1.1, 1.118, [0.1, 0.1, 0.1], 0.004, 1, 1); patch(cst(-0.008), cst(0.008), 1.03, 1.048, [0.1, 0.1, 0.1], 0.004, 1, 1); }
      } else if (top.style === 'dress' || top.style === 'uniform' || top.style === 'polo') {
        if (detail) patch(cst(-0.007), cst(0.007), top.style === 'polo' ? 1.36 : 1.03, 1.49, shade(tc, -0.12), 0.0015, 4, 1);   // the placket
        // the collar points
        patch(function (y) { return -0.062 + (1.515 - y) * 0.4; }, function () { return -0.004; }, 1.455, 1.515, shade(tc, -0.06), 0.004, 1, 1);
        patch(function () { return 0.004; }, function (y) { return 0.062 - (1.515 - y) * 0.4; }, 1.455, 1.515, shade(tc, -0.06), 0.004, 1, 1);
        if (top.style === 'uniform') {
          patch(cst(0.07), cst(0.11), 1.34, 1.39, [0.85, 0.68, 0.25], 0.004, 1, 1);                       // the badge
          if (detail) { patch(cst(-0.13), cst(-0.06), 1.28, 1.34, shade(tc, -0.15), 0.003, 1, 1); patch(cst(0.06), cst(0.13), 1.28, 1.33, shade(tc, -0.15), 0.003, 1, 1); }   // pockets
        }
      } else if (top.style === 'hoodie') {
        if (detail) { patch(cst(-0.13), cst(0.13), 1.03, 1.16, shade(tc, -0.1), 0.004, 2, 3); patch(cst(-0.03), cst(-0.024), 1.33, 1.46, [0.92, 0.92, 0.9], 0.005, 2, 1); patch(cst(0.024), cst(0.03), 1.33, 1.46, [0.92, 0.92, 0.9], 0.005, 2, 1); }
      } else if (top.style === 'jacket') {
        patch(function () { return -0.06; }, function () { return 0.06; }, 1.0, 1.5, tc2, 0.003, 4, 2);   // the tee under the open jacket
        patch(cst(-0.075), cst(-0.06), 1.0, 1.49, shade(tc, -0.15), 0.006, 4, 1); patch(cst(0.06), cst(0.075), 1.0, 1.49, shade(tc, -0.15), 0.006, 4, 1);
      } else if (top.style === 'swat') {
        // the plate carrier over the shirt, pouches
        var vest = [0.1, 0.11, 0.13];
        var vr = tys.filter(function (y) { return y > 1.0 && y < 1.46; }).map(function (y) { var r = lerpRow(T, y), w = torsoW(y); return { x: 0, y: y, z: r[3], a: r[1] + 0.022, b: r[2] + 0.03, col: vest, b0: w[0], b1: w[1], w: w[2] }; });
        if (vr.length > 1) tube(sb, vr, { segs: segT, p: 3, cap0: false, cap1: false });
        if (detail) [-0.09, -0.03, 0.03, 0.09].forEach(function (x) { ellipsoid(sb, x, 1.1, torsoFront(x, 1.1, 0.04), 0.026, 0.04, 0.02, 6, 3, [0.16, 0.17, 0.19], SPINE); });
      } else if (top.style === 'sweater' && detail) {
        patch(cst(-0.15), cst(0.15), 1.24, 1.27, shade(tc, 0.18), 0.002, 1, 4);
      }
      var tie = look.tie && look.tie !== 'none' ? look.tie : null;
      if (tie && (top.style === 'suit' || top.style === 'dress' || top.style === 'uniform')) {
        var tcol = tie === 'red' ? [0.79, 0.23, 0.23] : tie === 'blue' ? [0.24, 0.42, 0.8] : tie === 'gold' ? [0.9, 0.7, 0.23] : [0.08, 0.08, 0.1];
        if (tie === 'bowtie') { ellipsoid(sb, -0.022, 1.485, torsoFront(-0.02, 1.485, 0.012), 0.022, 0.014, 0.01, 6, 3, tcol, CHEST); ellipsoid(sb, 0.022, 1.485, torsoFront(0.02, 1.485, 0.012), 0.022, 0.014, 0.01, 6, 3, tcol, CHEST); }
        else {
          patch(function (y) { return -0.013 - (1.47 - y) * 0.06; }, function (y) { return 0.013 + (1.47 - y) * 0.06; }, 1.16, 1.47, tcol, 0.008, 4, 1);
          patch(function (y) { return -0.03 * (y - 1.13) / 0.03; }, function (y) { return 0.03 * (y - 1.13) / 0.03; }, 1.13, 1.16, tcol, 0.008, 1, 1);   // the point
          ellipsoid(sb, 0, 1.478, torsoFront(0, 1.478, 0.012), 0.017, 0.016, 0.012, 6, 3, shade(tcol, -0.15), CHEST);    // the knot
          if (detail) patch(function (y) { return -0.004; }, function (y) { return 0.004; }, 1.3, 1.31, [0.85, 0.75, 0.4], 0.011, 1, 1);   // a tie bar
        }
      }
      if (beltOn && detail) patch(cst(-0.022), cst(0.022), waist + 0.004, waist + 0.026, [0.78, 0.66, 0.3], 0.004, 1, 1);
      if (look.extra === 'lanyard') {
        var lc = hex3(look.lanyardColor, '#c94040');
        patch(function (y) { return -0.055 + (1.5 - y) * 0.2; }, function (y) { return -0.045 + (1.5 - y) * 0.2; }, 1.27, 1.5, lc, 0.007, 3, 1);
        patch(function (y) { return 0.045 - (1.5 - y) * 0.2; }, function (y) { return 0.055 - (1.5 - y) * 0.2; }, 1.27, 1.5, lc, 0.007, 3, 1);
        patch(cst(-0.034), cst(0.034), 1.18, 1.27, [0.96, 0.96, 0.95], 0.009, 1, 1);
        if (detail) patch(cst(-0.026), cst(0.026), 1.235, 1.25, [0.2, 0.25, 0.45], 0.0105, 1, 1);
      }
      if (look.extra === 'medal') { patch(cst(-0.13), cst(-0.09), 1.3, 1.37, [0.8, 0.12, 0.12], 0.006, 1, 1); ellipsoid(sb, -0.11, 1.285, torsoFront(-0.11, 1.285, 0.012), 0.02, 0.02, 0.006, 8, 4, [0.91, 0.71, 0.23], CHEST); }
      if (look.extra === 'flag_pin') { patch(cst(-0.14), cst(-0.11), 1.38, 1.4, [0.2, 0.35, 0.8], 0.012, 1, 1); patch(cst(-0.14), cst(-0.11), 1.4, 1.405, [0.95, 0.95, 0.95], 0.012, 1, 1); }
      if (look.badge && top.style !== 'uniform') patch(cst(0.07), cst(0.11), 1.34, 1.39, hex3(look.badge), 0.006, 1, 1);
    }
    if (top.style === 'hoodie') ellipsoid(sb, 0, 1.47, 0.075, 0.12, 0.06, 0.07, segL, mid ? 5 : 3, shade(tc, -0.06), CHEST);       // the hood, down
    if (top.style === 'uniform' && mid) { ellipsoid(sb, -0.15 * bw, 1.46, 0, 0.05, 0.012, 0.045, 6, 3, shade(tc, -0.2), CHEST); ellipsoid(sb, 0.15 * bw, 1.46, 0, 0.05, 0.012, 0.045, 6, 3, shade(tc, -0.2), CHEST); }
    if (bot.style === 'skirt') {
      var sk = [[1.0, 0.17, 0.112, 0.006], [0.8, 0.205, 0.15, 0.01], [0.6, 0.235, 0.18, 0.012]].reverse();
      tube(sb, sk.map(function (r) { return { x: 0, y: r[0], z: r[3], a: r[1] * (0.95 + 0.05 * bw), b: r[2], col: pc, b0: HIPS }; }), { segs: segT, p: 2.2, cap0: false, cap1: false });
    }
    // ---- neck and head
    var hy = 1.682, hz = -0.008, rx = 0.079 + (h % 3) * 0.002, ry = 0.118, rz = 0.098;
    var neckC = top.style === 'tank' || top.style === 'tee' || top.style === 'polo' ? skin : skin;
    tube(sb, [{ x: 0, y: 1.47, z: 0.008, a: 0.056, b: 0.054, col: neckC, b0: CHEST, b1: NECK, w: 0.3 }, { x: 0, y: 1.53, z: 0.004, a: 0.054, b: 0.052, col: neckC, b0: NECK }, { x: 0, y: 1.6, z: 0, a: 0.05, b: 0.049, col: neckC, b0: NECK, b1: HEAD, w: 0.6 }, { x: 0, y: 1.64, z: 0.004, a: 0.046, b: 0.046, col: neckC, b0: HEAD }], { segs: segL, cap0: false, cap1: false });
    if (top.style === 'dress' || top.style === 'suit' || top.style === 'uniform' || top.style === 'polo') {
      var cc = top.style === 'suit' ? tc2 : shade(tc, -0.04);
      tube(sb, [{ x: 0, y: 1.49, z: 0.008, a: 0.066, b: 0.064, col: cc, b0: CHEST, b1: NECK, w: 0.3 }, { x: 0, y: 1.535, z: 0.006, a: 0.062, b: 0.06, col: cc, b0: NECK }], { segs: segL, cap0: false, cap1: false });
    }
    var eyeI = (si <= 2 && (h >>> 9) % 3 === 0) ? 1 : 0;
    var cell = faceCell(si, brow, eyeI, (look.mask || look.beard) ? { mask: look.mask, beard: look.beard } : null);
    var cu = cellUV(cell), FS = 0.26;
    function faceUV(x, y, z) {
      // the front half takes a planar projection of the face cell; the back maps to plain skin inside the cell
      var u = 0.5 + x / FS, v = 0.5 + (y - hy) / FS;
      if (z - hz > 0) { u = x < 0 ? 0.13 : 0.87; v = U.clamp(v, 0.13, 0.87); }
      u = U.clamp(u, 0.04, 0.96); v = U.clamp(v, 0.04, 0.96);
      return [cu.u0 + u / 8, cu.v0 + v / 8];
    }
    var jaw = 0.25 + ((h >>> 5) % 4) * 0.04;
    function headDeform(p) {
      var nx = p[0] / rx, ny = (p[1] - hy) / ry, nz = (p[2] - hz) / rz;
      if (ny < 0) { p[0] *= 1 - jaw * ny * ny; if (nz > 0) p[2] = hz + (p[2] - hz) * (1 + 0.45 * ny); }
      if (ny < -0.55 && nz < 0) p[2] = hz + (p[2] - hz) * 1.05;
      if (nz < 0 && ny > 0.25) p[2] = hz + (p[2] - hz) * (1 - 0.07 * (ny - 0.25));
      if (nz > 0 && ny > -0.2) p[2] = hz + (p[2] - hz) * 1.07;
      if (nz < -0.3 && Math.abs(ny) < 0.35 && Math.abs(nx) > 0.5) p[0] *= 1.03;   // cheekbones
    }
    ellipsoid(sb, 0, hy, hz, rx, ry, rz, [22, 14, 8][q], [14, 9, 5][q], [1, 1, 1], HEAD, null, 0, { deform: headDeform, uvFn: faceUV });
    if (mid) {
      // the nose (textured with the face cell's shading), the ears
      var nl = 0.019 + ((h >>> 11) % 3) * 0.003;
      ellipsoid(sb, 0, hy - 0.022, hz - rz * 0.94, 0.011, nl, 0.017, detail ? 8 : 6, detail ? 5 : 3, [1, 1, 1], HEAD, null, 0, { uvFn: faceUV, deform: function (p) { var d = (hy - 0.022 - p[1]) / nl; if (p[2] < hz - rz * 0.94) p[2] -= Math.max(0, d) * 0.006; } });
      ellipsoid(sb, -rx * 0.98, hy - 0.004, hz + 0.008, 0.011, 0.027, 0.016, 6, 4, shade(skin, -0.04), HEAD);
      ellipsoid(sb, rx * 0.98, hy - 0.004, hz + 0.008, 0.011, 0.027, 0.016, 6, 4, shade(skin, -0.04), HEAD);
    }
    hairAndHat(sb, look, O, { hy: hy, hz: hz, rx: rx, ry: ry, rz: rz, q: q, hair: hairC, skin: skin });
    if (O.glasses && mid) glasses(sb, O.glasses, { hy: hy, hz: hz, rx: rx, rz: rz, q: q });
    if (look.extra === 'earpiece' && mid) { ellipsoid(sb, rx + 0.006, hy - 0.01, hz + 0.004, 0.009, 0.012, 0.011, 6, 3, [0.78, 0.8, 0.83], HEAD); tube(sb, [{ x: rx + 0.004, y: hy - 0.02, z: hz + 0.012, a: 0.0025, b: 0.0025, col: [0.85, 0.86, 0.88], b0: HEAD }, { x: rx - 0.01, y: 1.52, z: 0.03, a: 0.0025, b: 0.0025, col: [0.85, 0.86, 0.88], b0: NECK }], { segs: 4 }); }
    if (look.extra === 'cigar' && mid) { tube(sb, [{ x: 0.018, y: hy - 0.057, z: hz - rz * 0.86, a: 0.007, b: 0.007, col: [0.36, 0.25, 0.16], b0: HEAD }, { x: 0.03, y: hy - 0.064, z: hz - rz - 0.07, a: 0.0075, b: 0.0075, col: [0.36, 0.25, 0.16], b0: HEAD }], { segs: 6, axis: 'z', cap1: 0.004 }); ellipsoid(sb, 0.031, hy - 0.065, hz - rz - 0.075, 0.007, 0.007, 0.004, 6, 3, [1, 0.45, 0.12], HEAD); }
    // ---- arms
    var sleeve = top.style === 'tee' || top.style === 'polo' ? 1.3 : top.style === 'tank' ? 1.47 : top.style === 'swat' ? 1.2 : 0.935;
    var cuffShirt = top.style === 'suit' ? 0.945 : 0;
    var AT = [[0.9, 0.025, 0.021, 0], [0.93, 0.027, 0.024, 0], [0.99, 0.033, 0.031, 0], [1.06, 0.039, 0.039, -0.002], [1.12, 0.038, 0.04, 0], [1.15, 0.036, 0.038, 0.002],
      [1.175, 0.038, 0.04, 0.002], [1.24, 0.042, 0.045, 0], [1.32, 0.046, 0.05, -0.002], [1.4, 0.052, 0.054, 0], [1.455, 0.056, 0.058, 0], [1.485, 0.042, 0.044, 0.002]];
    AT = AT.map(function (r) { var k = r[0] > 1.15 ? (0.9 + 0.1 * bw) * (1 + belly * 1.5) : 1; return [r[0], r[1] * k, r[2] * k, r[3]]; });
    [-1, 1].forEach(function (s) {
      var bU = s < 0 ? UAL : UAR, bL = s < 0 ? LAL : LAR, bH = s < 0 ? HL : HR, ax = rig[bU][0] + s * 0.004;
      function armCol(y) {
        if (y > sleeve) return y < sleeve + 0.012 && sleeve > 1 ? shade(tc, -0.08) : tc;
        if (cuffShirt && y > sleeve - 0.012) return tc2;
        return skin;
      }
      var ys = ringYs(AT, step, sleeve < 1.46 ? [sleeve, sleeve + 0.012, cuffShirt ? sleeve - 0.012 : 0] : []);
      var rings = ys.map(function (y) {
        var r = lerpRow(AT, y), b0 = bU, b1 = null, w = 0;
        if (y < 1.13) { b0 = bL; if (y < 0.915) { b1 = bH; w = (0.915 - y) / 0.03 * 0.5; } }
        else if (y < 1.18) { b0 = bU; b1 = bL; w = (1.18 - y) / 0.05; }
        var sl = (y > sleeve && y < sleeve + 0.012 && sleeve > 1) ? 0.006 : (y > sleeve ? 0.003 : 0);
        return { x: ax, y: y, z: r[3], a: r[1] + sl, b: r[2] + sl, col: armCol(y), b0: b0, b1: b1, w: w };
      });
      tube(sb, rings, { segs: segL, cap0: false, cap1: 0.012 });
      // the hand: palm, fingers (slightly curled toward the body), the thumb in front
      var hx = ax;
      if (q === 2) ellipsoid(sb, hx, 0.83, -0.004, 0.019, 0.075, 0.036, 5, 3, skin, bH);
      else {
        ellipsoid(sb, hx, 0.845, -0.004, 0.018, 0.05, 0.037, detail ? 10 : 6, detail ? 6 : 4, skin, bH);
        ellipsoid(sb, hx - s * 0.004, 0.778, -0.006, 0.015, 0.042, 0.033, detail ? 10 : 6, detail ? 5 : 3, shade(skin, -0.02), bH, null, 0, { deform: function (p) { var d = (0.8 - p[1]) / 0.04; if (d > 0) p[0] -= s * d * d * 0.008; } });
        ellipsoid(sb, hx - s * 0.008, 0.838, -0.036, 0.011, 0.03, 0.011, 6, 3, skin, bH);
      }
    });
    // ---- legs
    var LT = [[0.1, 0.03, 0.032, 0], [0.16, 0.034, 0.036, 0], [0.25, 0.043, 0.046, 0.006], [0.34, 0.051, 0.058, 0.013], [0.42, 0.05, 0.055, 0.008], [0.48, 0.049, 0.053, -0.002],
      [0.52, 0.05, 0.055, -0.005], [0.58, 0.056, 0.06, -0.005], [0.7, 0.068, 0.072, 0], [0.82, 0.078, 0.082, 0.005], [0.92, 0.084, 0.088, 0.01], [0.99, 0.08, 0.085, 0.008]];
    LT = LT.map(function (r) { var k = (0.94 + 0.06 * bw) * (1 + belly); return [r[0], r[1] * k, r[2] * k, r[3]]; });
    var hem = bot.style === 'shorts' ? 0.56 : bot.style === 'skirt' ? 2 : 0.11;
    [-1, 1].forEach(function (s) {
      var bU = s < 0 ? ULL : ULR, bL = s < 0 ? LLL : LLR, bF = s < 0 ? FL : FR, lx = rig[bU][0];
      var ys = ringYs(LT, step, hem < 1 ? [hem, hem + 0.012] : []);
      var rings = ys.map(function (y) {
        var r = lerpRow(LT, y), b0 = bU, b1 = null, w = 0;
        if (y < 0.48) { b0 = bL; if (y < 0.12) { b1 = bF; w = (0.12 - y) / 0.04 * 0.4; } }
        else if (y < 0.535) { b1 = bL; w = (0.535 - y) / 0.055; }
        var pantsOn = y > hem && hem < 1, fl = pantsOn ? (y < hem + 0.012 ? 0.012 : bot.style === 'shorts' ? 0.01 : (y < 0.5 ? 0.012 * (0.5 - y) / 0.4 + 0.004 : 0.004)) : 0;
        return { x: lx + s * (0.95 - y) * 0.004, y: y, z: r[3], a: r[1] + fl, b: r[2] + fl, col: pantsOn ? (y < hem + 0.012 && bot.style === 'jeans' ? shade(pc, -0.12) : pc) : skin, b0: b0, b1: b1, w: w };
      });
      tube(sb, rings, { segs: segL, cap0: 0, cap1: false });
      // the shoe: lofted along z from the heel to the toe, a flat sole
      var sole = shoes.style === 'sneakers' ? [0.93, 0.93, 0.91] : shoes.style === 'boots' ? [0.08, 0.07, 0.06] : [0.07, 0.05, 0.04];
      var sc = shoes.color, FT = [[0.075, 0.03, 0.033, 0.045], [0.055, 0.04, 0.047, 0.056], [0.0, 0.046, 0.06, 0.066], [-0.06, 0.05, 0.045, 0.05], [-0.12, 0.05, 0.033, 0.038], [-0.17, 0.044, 0.025, 0.028], [-0.2, 0.028, 0.017, 0.022]];
      if (shoes.style === 'boots') FT[2] = [0.0, 0.05, 0.1, 0.1];
      var fr = FT.filter(function (r, i) { return q === 0 || (q === 1 ? i % 2 === 0 : (i === 0 || i === 2 || i === 4)) || i === FT.length - 1; }).map(function (r) { return { x: lx, y: r[3], z: r[0], a: r[1], b: r[2], col: sc, b0: bF }; });
      tube(sb, fr, { segs: segL, axis: 'z', p: 2.6, cap0: 0.008, cap1: 0.01, deform: function (p) { if (p[1] < 0.004) p[1] = 0.004; }, colFn: function (x, y, z) { return y < 0.02 ? sole : (shoes.style === 'sneakers' && z < -0.17 && y < 0.035 ? sole : sc); } });
    });
    var geo = sb.build(look.flat ? 0.14 : 0);
    geo.userData.rig = rig; geo.userData.lod = q; geo.userData.tris = sb.ix.length / 3;
    return geo;
  }

  // ------------------------------------------------------------- hair, hats --
  function hairAndHat(sb, look, O, H) {
    var style = look.hair || 'short', hat = O.hat ? O.hat.style : null, q = H.q;
    var hc = H.hair, segs = [22, 14, 8][q], rows = [10, 6, 3][q];
    // a shell over the skull: rows from the crown down, each column stops at the hairline latitude for its azimuth
    function shell(scaleFn, lineFn, col, b0, opts) {
      opts = opts || {};
      var base = sb.n, i, j, latMin = opts.latMin != null ? opts.latMin : -1.2, S = opts.segs || segs, Rr = opts.rows || rows;
      for (i = 0; i <= Rr; i++) {
        var lat0 = Math.PI / 2 - (Math.PI / 2 - latMin) * i / Rr;
        for (j = 0; j < S; j++) {
          var az = j / S * TAU, la = Math.max(lat0, lineFn(az)), s = scaleFn(la, az), cl = Math.cos(la);
          if (i === 0) cl = 0;
          var x = Math.sin(az) * cl * H.rx * s, y = H.hy + Math.sin(la) * H.ry * s, z = H.hz - Math.cos(az) * cl * H.rz * s;
          if (opts.deform) { var pp = [x, y, z]; opts.deform(pp, la, az); x = pp[0]; y = pp[1]; z = pp[2]; }
          sb.v(x, y, z, WUV[0], WUV[1], typeof col === 'function' ? col(la, az) : col, b0 == null ? HEAD : b0);
        }
      }
      for (i = 0; i < Rr; i++) for (j = 0; j < S; j++) { var j1 = (j + 1) % S; sb.quadOut(base + i * S + j, base + i * S + j1, base + (i + 1) * S + j1, base + (i + 1) * S + j, 0, H.hy, H.hz); }
    }
    function line(front, side, back) { return function (az) { var f = (1 - Math.cos(az)) / 2, sd = Math.sin(az) * Math.sin(az); return front + (back - front) * f + (side - (front + back) / 2) * sd * 0.9; }; }
    var hatCovers = hat === 'beanie' || hat === 'helmet' || hat === 'cap' || hat === 'cowboy' || hat === 'fedora';
    var streak = shade(hc, 0.12);
    if (style !== 'bald') {
      if (style === 'mohawk') {
        shell(function () { return 1.012; }, line(0.6, 0.15, -0.45), mix(H.skin, [0.1, 0.08, 0.07], 0.35), HEAD, { latMin: -0.5 });
        if (!hatCovers) {
          var mr = [];
          for (var k = 0; k <= 6; k++) { var la = 1.1 - k * 0.38, cl = Math.cos(la); mr.push({ x: 0, y: H.hy + Math.sin(la) * H.ry * 1.08, z: H.hz - cl * H.rz * 1.08 * (k < 3 ? 1 : -1) * (k < 3 ? 1 : 1), a: 0.012, b: 0.035, col: hc, b0: HEAD }); }
          // a fin over the top: from the forehead over the crown to the nape
          var fin = [];
          for (var m = 0; m <= 8; m++) { var ang = -0.95 + m / 8 * 2.6, R1 = 1.04; fin.push({ x: 0, y: H.hy + Math.cos(ang) * H.ry * R1, z: H.hz + Math.sin(ang) * H.rz * R1, a: 0.014, b: 0.012, col: hc, b0: HEAD, ang: ang }); }
          var fb = sb.n;
          fin.forEach(function (r, i) {
            var hgt = 0.075 * Math.sin(Math.min(1, (i + 0.5) / 8) * Math.PI) + 0.02, nx2 = 0, ny2 = Math.cos(r.ang), nz2 = Math.sin(r.ang);
            sb.v(-0.013, r.y, r.z, WUV[0], WUV[1], hc, HEAD); sb.v(0.013, r.y, r.z, WUV[0], WUV[1], hc, HEAD); sb.v(0, r.y + ny2 * hgt, r.z + nz2 * hgt, WUV[0], WUV[1], streak, HEAD);
            void nx2;
          });
          for (var f = 0; f < 8; f++) { var a0 = fb + f * 3, a1 = a0 + 3; sb.quadOut(a0, a1, a1 + 2, a0 + 2, -1, H.hy, H.hz); sb.quadOut(a0 + 1, a1 + 1, a1 + 2, a0 + 2, 1, H.hy, H.hz); }
          void mr;
        }
      } else if (style === 'afro') {
        shell(function (la) { return 1.42 - 0.12 * Math.max(0, -la); }, line(0.45, -0.05, -0.55), hc, HEAD, { latMin: -0.6, deform: function (p) { p[1] += 0.035; } });
      } else {
        var lf = 0.6, ls = 0.12, lb = -0.5, sc = 1.06;
        if (style === 'long') { ls = -0.2; lb = -1.2; }
        if (style === 'bob') { lf = 0.42; ls = -0.75; lb = -0.85; sc = 1.1; }
        if (style === 'slick') { sc = 1.04; }
        if (style === 'pompadour') { lb = -0.45; }
        shell(function (la, az) {
          var s = sc;
          if (style === 'pompadour') s += 0.32 * Math.max(0, Math.cos(az)) * Math.max(0, Math.sin(la) - 0.2) * (1 - Math.abs(Math.sin(az)) * 0.4);
          if (style === 'bob' || style === 'long') s += 0.05 * Math.max(0, -Math.sin(la));
          if (style === 'short') s += 0.025 * Math.max(0, Math.sin(la));
          return s;
        }, line(lf, ls, lb), function (la, az) { return (q === 0 && Math.cos(az) < -0.2 && la > 0.6) ? streak : hc; }, HEAD, { latMin: Math.min(lb, ls) - 0.05, deform: style === 'slick' ? function (p) { p[1] -= 0.004; } : null });
        if (style === 'long' && !hatCovers) {
          // the fall of hair behind the neck down to the shoulder blades
          var lr = [[1.69, 0.085, 0.05, 0.06], [1.6, 0.09, 0.045, 0.075], [1.5, 0.11, 0.035, 0.085], [1.4, 0.12, 0.025, 0.1], [1.33, 0.11, 0.02, 0.11]];
          tube(sb, lr.map(function (r, i) { return { x: 0, y: r[0], z: H.hz + r[3], a: r[1], b: r[2], col: hc, b0: i < 2 ? HEAD : i < 3 ? NECK : CHEST, b1: i === 1 ? NECK : null, w: i === 1 ? 0.4 : 0 }; }), { segs: segs > 12 ? 12 : 8, cap0: false, cap1: 0.01 });
        }
        if (style === 'bun' && !hatCovers) ellipsoid(sb, 0, H.hy + 0.065, H.hz + H.rz * 0.95, 0.042, 0.04, 0.038, q ? 6 : 10, q ? 4 : 6, hc, HEAD);
      }
    }
    if (!hat) return;
    var hcol = O.hat.color || hex3({ cap: '#2b2b2b', beanie: '#2f9e6a', cowboy: '#6a4a2a', fedora: '#2b2b2b', beret: '#2b2b2b', crown: '#e8b53a', helmet: '#e8b53a' }[hat]);
    var hs = style === 'afro' ? 1.3 : style === 'pompadour' ? 1.12 : 1;
    if (hat === 'cap') {
      shell(function () { return 1.1 * hs; }, function () { return 0.22; }, hcol, HEAD, { latMin: 0.2 });
      ellipsoid(sb, 0, H.hy + 0.05, H.hz - H.rz * 1.0 - 0.045, 0.09, 0.007, 0.075, segs > 12 ? 12 : 8, 3, shade(hcol, -0.1), HEAD, null, 0, { deform: function (p) { p[1] -= (p[2] - (H.hz - H.rz)) * -0.1; } });
      ellipsoid(sb, 0, H.hy + H.ry * 1.1 * hs, H.hz, 0.01, 0.006, 0.01, 6, 3, shade(hcol, -0.2), HEAD);
    } else if (hat === 'beanie') {
      shell(function (la) { return (1.12 + 0.03 * Math.sin(la)) * hs; }, function () { return 0.12; }, hcol, HEAD, { latMin: 0.1 });
      shell(function () { return 1.16 * hs; }, function () { return 0.1; }, shade(hcol, -0.25), HEAD, { latMin: 0.1, rows: 1, deform: function (p) { var yy = p[1] - H.hy; if (yy > H.ry * 0.3) p[1] = H.hy + H.ry * 0.3; } });
    } else if (hat === 'helmet') {
      shell(function () { return 1.17 * hs; }, function () { return 0.15; }, hcol, HEAD, { latMin: 0.15 });
      ellipsoid(sb, 0, H.hy + 0.025, H.hz, 0.115 * hs, 0.008, 0.135 * hs, segs, 3, shade(hcol, -0.08), HEAD);
      tube(sb, [{ x: 0, y: H.hy + H.ry * 1.05, z: H.hz - 0.08, a: 0.012, b: 0.01, col: shade(hcol, 0.1), b0: HEAD }, { x: 0, y: H.hy + H.ry * 1.22, z: H.hz, a: 0.014, b: 0.012, col: shade(hcol, 0.1), b0: HEAD }, { x: 0, y: H.hy + H.ry * 1.05, z: H.hz + 0.09, a: 0.012, b: 0.01, col: shade(hcol, 0.1), b0: HEAD }], { segs: 6, axis: 'z' });
    } else if (hat === 'fedora' || hat === 'cowboy') {
      var cw = hat === 'cowboy', by = H.hy + H.ry * 0.38, br = (cw ? 0.21 : 0.17) * hs;
      ellipsoid(sb, 0, by, H.hz, br, 0.009, br * 1.06, segs, 3, hcol, HEAD, null, 0, cw ? { deform: function (p) { var t = Math.abs(p[0]) / br; p[1] += t * t * t * 0.07; } } : { deform: function (p) { if (p[2] < H.hz - 0.06) p[1] -= 0.012 * (H.hz - 0.06 - p[2]) / 0.1; } });
      var ct = cw ? 0.17 : 0.14, crown = [[0, 0.098, 0.112], [0.03, 0.097, 0.11], [ct * 0.75, 0.09, 0.103], [ct, 0.075, 0.09]];
      tube(sb, crown.map(function (r, i) { return { x: 0, y: by + r[0], z: H.hz, a: r[1] * hs, b: r[2] * hs, col: i === 1 ? (cw ? shade(hcol, -0.35) : [0.45, 0.16, 0.16]) : hcol, b0: HEAD }; }), { segs: segs, cap0: false, cap1: -0.02, deform: function (p) { if (p[1] > by + ct - 0.01) p[1] -= Math.max(0, 0.02 - Math.abs(p[0]) * 0.25); } });
    } else if (hat === 'beret') {
      ellipsoid(sb, 0.022, H.hy + H.ry * 0.86, H.hz + 0.005, 0.118 * hs, 0.035, 0.122 * hs, segs, rows > 5 ? 6 : 4, hcol, HEAD, null, 0, { deform: function (p) { p[1] -= p[0] * 0.28; } });
      ellipsoid(sb, 0.02, H.hy + H.ry * 0.86 + 0.034, H.hz, 0.006, 0.012, 0.006, 5, 2, shade(hcol, -0.3), HEAD);
    } else if (hat === 'crown') {
      var gold = hex3('#e8b53a'), cy0 = H.hy + H.ry * 0.62;
      tube(sb, [{ x: 0, y: cy0, z: H.hz, a: 0.09 * hs, b: 0.108 * hs, col: gold, b0: HEAD }, { x: 0, y: cy0 + 0.06, z: H.hz, a: 0.095 * hs, b: 0.112 * hs, col: gold, b0: HEAD }], { segs: segs, cap0: false, cap1: false, deform: function (p) { if (p[1] > cy0 + 0.03) { var a = Math.atan2(p[0], p[2]), pk = Math.pow(Math.abs(Math.cos(a * 2.5)), 6); p[1] += pk * 0.05; } } });
      for (var g = 0; g < 5; g++) { var ga = g / 5 * TAU; ellipsoid(sb, Math.sin(ga) * 0.096 * hs, cy0 + 0.028, H.hz - Math.cos(ga) * 0.114 * hs, 0.008, 0.008, 0.008, 6, 3, g % 2 ? [0.8, 0.1, 0.15] : [0.15, 0.3, 0.85], HEAD); }
    }
  }
  function glasses(sb, style, H) {
    var y = H.hy + 0.004, zf = H.hz - H.rz * 0.87 - 0.003, rimC = style === 'round' ? [0.32, 0.25, 0.18] : style === 'aviator' ? [0.85, 0.68, 0.3] : [0.06, 0.06, 0.07];
    var lensC = style === 'shades' || style === 'aviator' ? [0.08, 0.09, 0.1] : [0.72, 0.82, 0.88], q = H.q, n = q ? 8 : 14;
    [-1, 1].forEach(function (s) {
      var x = s * 0.034;
      if (style === 'round') { torus(sb, x, y, zf, 0.017, 0.0022, n, 4, rimC, HEAD, 'z'); ellipsoid(sb, x, y, zf + 0.001, 0.016, 0.016, 0.0015, n, 3, lensC, HEAD); }
      else if (style === 'aviator') { torus(sb, x, y - 0.003, zf, 0.019, 0.0016, n, 4, rimC, HEAD, 'z', 1.05, 0.88); ellipsoid(sb, x, y - 0.003, zf + 0.001, 0.019, 0.016, 0.002, n, 3, lensC, HEAD); }
      else if (style === 'thick') { ellipsoid(sb, x, y, zf + 0.001, 0.021, 0.015, 0.004, n, 3, rimC, HEAD); ellipsoid(sb, x, y, zf - 0.0035, 0.016, 0.0105, 0.0015, n, 3, lensC, HEAD); }
      else ellipsoid(sb, x, y, zf, 0.023, 0.014, 0.004, n, 3, lensC, HEAD, null, 0, { deform: function (p) { if (p[1] > y + 0.008) p[1] = y + 0.008 + (p[1] - y - 0.008) * 0.3; } });
      // the temple arm back to the ear
      tube(sb, [{ x: s * (H.rx + 0.003), y: y + 0.006, z: zf + 0.012, a: 0.0022, b: 0.0022, col: rimC, b0: HEAD }, { x: s * (H.rx + 0.006), y: y + 0.004, z: H.hz + 0.01, a: 0.0022, b: 0.0022, col: rimC, b0: HEAD }], { segs: 4, axis: 'z' });
      tube(sb, [{ x: s * 0.052, y: y + 0.006, z: zf, a: 0.002, b: 0.002, col: rimC, b0: HEAD }, { x: s * (H.rx + 0.003), y: y + 0.006, z: zf + 0.012, a: 0.002, b: 0.002, col: rimC, b0: HEAD }], { segs: 4, axis: 'x' });
    });
    tube(sb, [{ x: -0.017, y: y + 0.006, z: zf, a: 0.0022, b: 0.0022, col: rimC, b0: HEAD }, { x: 0.017, y: y + 0.006, z: zf, a: 0.0022, b: 0.0022, col: rimC, b0: HEAD }], { segs: 4, axis: 'x' });
  }

  // ------------------------------------------------------------- held props --
  var PROP_GEO = {}, SIGN_MAT = {};
  function propGeo(kind) {
    if (PROP_GEO[kind]) return PROP_GEO[kind];
    var g = new GTP.GeoBuilder({ color: true });
    if (kind === 'mic') { g.cylinder(0, -0.06, 0, 0.014, 0.018, 0.17, 8, [0.12, 0.12, 0.14]); g.sphere(0, 0.13, 0, 0.032, 8, 5, [0.55, 0.56, 0.6]); g.cylinder(0, 0.08, 0, 0.022, 0.022, 0.03, 8, [0.85, 0.2, 0.35]); }
    else if (kind === 'phone') { g.box(-0.036, -0.02, -0.006, 0.072, 0.15, 0.012, GTP.GeoBuilder.UV0, [0.1, 0.1, 0.12]); g.box(-0.032, -0.012, -0.0075, 0.064, 0.134, 0.002, GTP.GeoBuilder.UV0, [0.25, 0.4, 0.6]); }
    else if (kind === 'stick') { g.box(-0.012, -0.25, -0.012, 0.024, 1.15, 0.024, GTP.GeoBuilder.UV0, [0.54, 0.42, 0.27]); }
    return (PROP_GEO[kind] = g.build());
  }
  function signMaterial(text) {
    text = String(text || '').toUpperCase().slice(0, 14);
    if (SIGN_MAT[text]) return SIGN_MAT[text];
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 176;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#f2ede2'; ctx.fillRect(0, 0, 256, 176);
    ctx.strokeStyle = '#c8bfa8'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 248, 168);
    ctx.fillStyle = '#ff6a00'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var fs = 64; ctx.font = '900 ' + fs + 'px "Arial Black", Impact, Arial, sans-serif';
    while (fs > 18 && ctx.measureText(text || '!').width > 228) { fs -= 4; ctx.font = '900 ' + fs + 'px "Arial Black", Impact, Arial, sans-serif'; }
    ctx.fillText(text || '!', 128, 92);
    var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    return (SIGN_MAT[text] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  }
  function addProps(look, bones) {
    var pm = A.propMaterial ? A.propMaterial() : new THREE.MeshLambertMaterial({ vertexColors: true });
    if (look.extra === 'mic' || look.extra === 'phone') {
      var m = new THREE.Mesh(propGeo(look.extra), pm); m.name = 'prop'; m.castShadow = true;
      if (look.extra === 'mic') { m.position.set(0, -0.085, -0.03); m.rotation.set(-0.35, 0, 0); }
      else { m.position.set(-0.012, -0.11, -0.02); m.rotation.set(0.2, 0.3, 0); }
      bones[HR].add(m);
    }
    if (look.sign) {
      var st = new THREE.Mesh(propGeo('stick'), pm); st.name = 'prop'; st.castShadow = true; st.position.set(0, -0.08, -0.01);
      var bd = new THREE.Mesh(signBoard(), [pm, signMaterial(look.sign)]); bd.name = 'prop'; bd.castShadow = true; bd.position.set(0, 0.95, 0);
      st.add(bd); bones[HL].add(st); st.userData.sign = true;
    }
  }
  var SIGN_GEO = null;
  function signBoard() {
    if (SIGN_GEO) return SIGN_GEO;
    var g = new THREE.BoxGeometry(0.02, 0.4, 0.58);
    // material 1 (the lettered card) on both broad faces (+x and -x), the edges keep material 0
    var groups = g.groups; for (var i = 0; i < groups.length; i++) groups[i].materialIndex = (i === 0 || i === 1) ? 1 : 0;
    var col = new Float32Array(g.attributes.position.count * 3).fill(0.85); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return (SIGN_GEO = g);
  }

  // ------------------------------------------------------------ the builder --
  // One entry per look key: LODs built on demand (mid and far at spawn, near when a ped first comes close), shared by
  // every ped wearing the look, ref-counted; idle entries wait in a small LRU before their geometry is disposed.
  var GEO = new Map(), IDLE = new Map(), INV = new Map(), stats = { built: 0, peds: 0, disposed: 0 }, IDLE_MAX = 48;
  function entryFor(look) {
    var key = lookKey(look), e = GEO.get(key);
    if (!e) { e = { key: key, look: look, lods: [null, null, null], refs: 0 }; e.lods[2] = buildBody(look, 2); e.rig = e.lods[2].userData.rig; GEO.set(key, e); stats.built++; }
    return e;
  }
  function lodOf(e, i) { if (!e.lods[i]) e.lods[i] = buildBody(e.look, i); return e.lods[i]; }
  function acquire(e) { if (e.refs++ === 0) IDLE.delete(e.key); }
  function release(e) {
    if (!e || e.refs <= 0) return;
    if (--e.refs > 0) return;
    IDLE.set(e.key, e);
    while (IDLE.size > IDLE_MAX) {
      var k = IDLE.keys().next().value, old = IDLE.get(k); IDLE.delete(k); if (GEO.get(k) === old) GEO.delete(k);
      old.lods.forEach(function (g) { if (g) g.dispose(); }); old.lods = [null, null, null]; old.evicted = true; stats.disposed++;
    }
  }
  // Render.detach / attach (environment track): a detach releases a ped's look and frees its bone texture; an attach of
  // the same mesh (09_missions setSign, 12_cutscenes placeActor detach and re-attach) takes the look back, re-registering
  // an entry that was evicted meanwhile. Wrapped the first time a ped is built (Render loads after this file).
  function hookRender() {
    var R = GTP.Render; if (!R || !R.detach || R.detach._models) return;
    var origD = R.detach, origA = R.attach;
    R.detach = function (e) {
      var m = e && e.mesh, ud = m && m.userData, r = origD.apply(this, arguments);
      if (ud && ud.models && ud.entry && !ud.released) { ud.released = true; release(ud.entry); if (ud.skin && ud.skin.skeleton) ud.skin.skeleton.dispose(); }
      return r;
    };
    R.detach._models = true;
    if (origA) R.attach = function (e) {
      var m = e && e.mesh, ud = m && m.userData;
      if (ud && ud.models && ud.entry && ud.released) {
        var en = ud.entry, cur = GEO.get(en.key);
        if (cur && cur !== en) { en = ud.entry = cur; ud.lods = cur.lods; }
        else if (!cur) { GEO.set(en.key, en); en.evicted = false; }
        ud.released = false; acquire(en); ud.lods = en.lods;
        ud.skin.geometry = lodOf(en, ud.lod || 0);
        if (!en.rig) en.rig = ud.rest;
      }
      return origA.apply(this, arguments);
    };
  }
  function inverses(rig) {
    var key = rig.map(function (p) { return p[0].toFixed(4); }).join(',') + rig[11][0].toFixed(4);
    var inv = INV.get(key);
    if (inv) return inv;
    inv = rig.map(function (p) { return new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]); });
    INV.set(key, inv);
    return inv;
  }
  function pedParts(look) {
    look = look || {};
    hookRender();
    var entry = entryFor(look), rig = entry.rig;
    acquire(entry); lodOf(entry, 1);
    var bones = [], i;
    for (i = 0; i < BONES.length; i++) {
      var b = new THREE.Bone(); b.name = ALIAS[BONES[i]] || BONES[i]; b.userData.bone = BONES[i];
      var p = rig[i], pp = PARENT[i] >= 0 ? rig[PARENT[i]] : [0, 0, 0];
      b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      if (PARENT[i] >= 0) bones[PARENT[i]].add(b);
      bones.push(b);
    }
    var mesh = new THREE.SkinnedMesh(entry.lods[1], pedMaterial());
    mesh.name = 'skin'; mesh.castShadow = true; mesh.receiveShadow = false;
    mesh.add(bones[0]);
    mesh.bind(new THREE.Skeleton(bones, inverses(rig)), new THREE.Matrix4());
    var g = new THREE.Group();
    g.add(mesh);
    var dict = {};
    for (i = 0; i < BONES.length; i++) { dict[BONES[i]] = bones[i]; if (ALIAS[BONES[i]]) dict[ALIAS[BONES[i]]] = bones[i]; }
    addProps(look, bones);
    g.scale.setScalar(look.scale || 1);
    g.userData.look = look;
    g.userData.bones = dict; g.userData.boneList = bones; g.userData.skin = mesh; g.userData.lods = entry.lods; g.userData.entry = entry; g.userData.lod = 1;
    g.userData.rest = rig; g.userData.models = true;
    stats.peds++;
    return g;
  }

  GTP.Models = {
    BONES: BONES, PARENT: PARENT, ALIAS: ALIAS,
    bones: function (root) { return root && root.userData && root.userData.bones || null; },
    outfitOf: outfitOf,
    lookKey: lookKey,
    buildBody: buildBody,
    pedMaterial: pedMaterial,
    atlas: function () { atlasInit(); return ATLAS; },
    clothingItem: clothingItem,
    // LOD by camera distance (metres): 0 within 14 m, 1 within 40 m, else 2
    LOD_NEAR: 14, LOD_MID: 40,
    lodFor: function (d) { return d < GTP.Models.LOD_NEAR ? 0 : d < GTP.Models.LOD_MID ? 1 : 2; },
    setLod: function (root, i) {
      var ud = root && root.userData; if (!ud || !ud.lods || ud.lod === i) return;
      ud.lod = i; ud.skin.geometry = ud.entry ? lodOf(ud.entry, i) : ud.lods[i];
      ud.skin.castShadow = i < 2;
      for (var k = 0; k < ud.boneList.length; k++) { var ch = ud.boneList[k].children; for (var j = 0; j < ch.length; j++) if (ch[j].name === 'prop') ch[j].visible = i < 2 && !ch[j].userData.hidden; }
    },
    lodGeometry: function (root, i) { var ud = root && root.userData; return ud && ud.entry ? lodOf(ud.entry, i) : null; },
    release: function (root) { var ud = root && root.userData; if (ud && ud.entry && !ud.released) { ud.released = true; release(ud.entry); if (ud.skin && ud.skin.skeleton) ud.skin.skeleton.dispose(); } },
    stats: function () { return { lookGeometries: stats.built, live: GEO.size - IDLE.size, idle: IDLE.size, disposed: stats.disposed, peds: stats.peds, atlasCells: ATLAS.next }; },
    _helpers: { SB: SB, tube: tube, ellipsoid: ellipsoid, torus: torus, hex3: hex3, shade: shade, mix: mix }
  };
  A.pedPartsV02 = A.pedParts;
  A.pedParts = pedParts;
})();

/* ---------------------------------------------------------------------------------------------------------------------
 * Vehicles (GTP.Models.vehicle*): GTP.Assets.vehicleGeometry(cls, wrap, mods) for the nine C.VEHICLES classes.
 *   Bodies are lofts: stations along the car (front = -z) through rounded cross-sections whose bottom follows the wheel
 *   arches, a greenhouse loft with a raked windshield and rear window, pillars and black window trim, separate glass,
 *   chrome trim, lamp pods (lens + chrome reflector) on the real surface, grille, number plates, mirrors, door seams and
 *   handles, interior silhouettes (seats, headrests, dash, steering wheel), class extras (light bar, taxi sign, roof
 *   rails, cargo box, bus windows, the scooter's shield). Smooth normals throughout.
 *   Same record as v0.2 (body groups paint 0, detail 1, glass 2, head 3, tail 4, barRed 5, barBlue 6, wrap 7, chrome 8;
 *   wheel, wheelRadius, wheelWidth, wheelOffsets, lightPoints, doorPoints, size, wrap) plus:
 *     lods: [body0, body1, body2], wheelLods: [w0, w1, w2], seats: [{x, y, z}] (hip points, mesh frame), wheelPoint
 *     (steering wheel centre), bars (scooter), mods (the normalised mods), finish.
 *   mods: {paint: {primary, secondary, finish}, wheels 0..5, spoiler 0..3, tint 0..3}: wheels picks the rim, spoiler adds
 *   a lip / duck tail / wing, tint darkens the glass, paint.secondary colours the roof, mirrors and spoiler.
 * ------------------------------------------------------------------------------------------------------------------- */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var A = GTP.Assets = GTP.Assets || {};
  var C = GTP.C, U = GTP.util, TAU = Math.PI * 2;
  var ORDER = ['paint', 'detail', 'glass', 'head', 'tail', 'barRed', 'barBlue', 'wrap', 'chrome'];
  function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function hex3(h) { var r = U.hexToRgb(h); return [r[0] / 255, r[1] / 255, r[2] / 255]; }
  function pw(list, t) {
    if (t <= list[0][0]) return list[0][1];
    for (var i = 0; i < list.length - 1; i++) if (t <= list[i + 1][0]) { var a = list[i], b = list[i + 1], k = (t - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * k; }
    return list[list.length - 1][1];
  }
  var WHITE = [1, 1, 1], DARK = [0.07, 0.07, 0.08], TRIM = [0.04, 0.04, 0.05], CHROME = [0.82, 0.84, 0.88], GLASS = [0.55, 0.62, 0.7], SEAT = [0.13, 0.12, 0.13], DASH = [0.08, 0.08, 0.09];
  var PLATE = [0.93, 0.92, 0.86], HEADC = [1, 0.98, 0.9], TAILC = [0.85, 0.06, 0.05], AMBER = [1, 0.62, 0.1], NAVY = [0.12, 0.17, 0.36], RED = [1, 0.12, 0.08], BLUE = [0.2, 0.45, 1], REFL = [0.75, 0.77, 0.8];

  // ---------------------------------------------------------------- builder --
  function VB() { var g = this.g = {}; ORDER.forEach(function (n) { g[n] = { p: [], n: [], c: [], uv: [], ix: [], cnt: 0 }; }); }
  VB.prototype.vert = function (gn, x, y, z, nx, ny, nz, col, u, v) {
    var G = this.g[gn]; G.p.push(x, y, z); G.n.push(nx, ny, nz); G.c.push(lin(col[0]), lin(col[1]), lin(col[2])); G.uv.push(u || 0, v || 0); return G.cnt++;
  };
  VB.prototype.tri = function (gn, a, b, c) { this.g[gn].ix.push(a, b, c); };
  // a flat quad (a b c d counter-clockwise from the front)
  VB.prototype.quad = function (gn, a, b, c, d, col, uvs) {
    var ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-10) return; nx /= l; ny /= l; nz /= l;
    uvs = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    var i0 = this.vert(gn, a[0], a[1], a[2], nx, ny, nz, col, uvs[0][0], uvs[0][1]), i1 = this.vert(gn, b[0], b[1], b[2], nx, ny, nz, col, uvs[1][0], uvs[1][1]);
    var i2 = this.vert(gn, c[0], c[1], c[2], nx, ny, nz, col, uvs[2][0], uvs[2][1]), i3 = this.vert(gn, d[0], d[1], d[2], nx, ny, nz, col, uvs[3][0], uvs[3][1]);
    this.g[gn].ix.push(i0, i1, i2, i0, i2, i3);
  };
  VB.prototype.count = function () { var n = 0; for (var k in this.g) n += this.g[k].ix.length / 3; return n; };
  VB.prototype.build = function () {
    var parts = [], ranges = [], self = this;
    ORDER.forEach(function (name, gi) {
      var G = self.g[name]; if (!G.ix.length) return;
      parts.push(G); ranges.push({ gi: gi, count: G.ix.length });
    });
    var nv = 0, ni = 0; parts.forEach(function (G) { nv += G.cnt; ni += G.ix.length; });
    var P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3), UV = new Float32Array(nv * 2), I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    var vo = 0, io = 0;
    parts.forEach(function (G) {
      P.set(G.p, vo * 3); N.set(G.n, vo * 3); Cc.set(G.c, vo * 3); UV.set(G.uv, vo * 2);
      for (var k = 0; k < G.ix.length; k++) I[io + k] = G.ix[k] + vo;
      vo += G.cnt; io += G.ix.length;
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    geo.setIndex(new THREE.BufferAttribute(I, 1));
    var start = 0; ranges.forEach(function (r) { geo.addGroup(start, r.count, r.gi); start += r.count; });
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    geo.userData.tris = ni / 3;
    return geo;
  };

  // A loft: stations [{z, pts: [[x, y], ...]}] (same count each); closed loops wrap. classify(i, j) -> {g, c} | null.
  // Smooth normals: every grid vertex averages its quads' outward normals (outward = away from ref(i) = [x, y]).
  function loft(vb, st, closed, classify, ref) {
    var S = st.length, M = st[0].pts.length, i, j, Nn = [], segs = closed ? M : M - 1;
    for (i = 0; i < S; i++) { Nn.push([]); for (j = 0; j < M; j++) Nn[i].push([0, 0, 0]); }
    var flip = [];
    function P(i, j) { var p = st[i].pts[j]; return [p[0], p[1], st[i].z]; }
    for (i = 0; i < S - 1; i++) {
      flip.push([]);
      var r0 = ref(i), r1 = ref(i + 1), cx = (r0[0] + r1[0]) / 2, cy = (r0[1] + r1[1]) / 2, cz = (st[i].z + st[i + 1].z) / 2;
      for (j = 0; j < segs; j++) {
        var j1 = (j + 1) % M, a = P(i, j), b = P(i, j1), c = P(i + 1, j1), d = P(i + 1, j);
        var ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (l < 1e-12) { flip[i].push(0); continue; }
        nx /= l; ny /= l; nz /= l;
        var mx = (a[0] + c[0]) / 2 - cx, my = (a[1] + c[1]) / 2 - cy, mz = (a[2] + c[2]) / 2 - cz, f = (nx * mx + ny * my + nz * mz) >= 0 ? 1 : -1;
        flip[i].push(f); nx *= f; ny *= f; nz *= f;
        [[i, j], [i, j1], [i + 1, j1], [i + 1, j]].forEach(function (q) { var n = Nn[q[0]][q[1]]; n[0] += nx; n[1] += ny; n[2] += nz; });
      }
    }
    for (i = 0; i < S; i++) for (j = 0; j < M; j++) { var n = Nn[i][j], l2 = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1; n[0] /= l2; n[1] /= l2; n[2] /= l2; }
    for (i = 0; i < S - 1; i++) for (j = 0; j < segs; j++) {
      var fl = flip[i][j]; if (!fl) continue;
      var cl = classify(i, j); if (!cl) continue;
      var jj = (j + 1) % M, q = [[i, j], [i, jj], [i + 1, jj], [i + 1, j]], ids = [];
      for (var k = 0; k < 4; k++) { var pp = P(q[k][0], q[k][1]), nn = Nn[q[k][0]][q[k][1]]; ids.push(vb.vert(cl.g, pp[0], pp[1], pp[2], nn[0], nn[1], nn[2], cl.c, cl.u ? cl.u[k][0] : 0, cl.u ? cl.u[k][1] : 0)); }
      if (fl > 0) vb.g[cl.g].ix.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
      else vb.g[cl.g].ix.push(ids[0], ids[2], ids[1], ids[0], ids[3], ids[2]);
    }
    return Nn;
  }
  // a flat cap over station i (a fan from its centroid), facing dir (-1: -z, +1: +z)
  function cap(vb, st, i, dir, g, col) {
    var pts = st[i].pts, z = st[i].z, cx = 0, cy = 0, M = pts.length;
    pts.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= M; cy /= M;
    var c0 = vb.vert(g, cx, cy, z, 0, 0, dir, col);
    var ids = pts.map(function (p) { return vb.vert(g, p[0], p[1], z, 0, 0, dir, col); });
    for (var j = 0; j < M; j++) {
      var a = ids[j], b = ids[(j + 1) % M], pa = pts[j], pb = pts[(j + 1) % M];
      var cr = (pa[0] - cx) * (pb[1] - cy) - (pa[1] - cy) * (pb[0] - cx);   // + : counter-clockwise seen from +z
      if ((cr > 0) === (dir > 0)) vb.g[g].ix.push(c0, a, b); else vb.g[g].ix.push(c0, b, a);
    }
  }
  // a superellipsoid (p 2: an ellipsoid; 4+: a rounded box) with analytic normals; opts.deform(p) bends it
  function blob(vb, g, cx, cy, cz, rx, ry, rz, segs, rings, col, p, deform) {
    p = p || 2; if (p > 2 && rings < 4) rings = 4; var e = 2 / p, base = vb.g[g].cnt, i, j;
    function sp(v, k) { return v < 0 ? -Math.pow(-v, k) : Math.pow(v, k); }
    for (i = 0; i <= rings; i++) {
      var v = -Math.PI / 2 + i / rings * Math.PI, cv = Math.cos(v), sv = Math.sin(v);
      for (j = 0; j <= segs; j++) {
        var u = j / segs * TAU, cu = Math.cos(u), su = Math.sin(u);
        var x = rx * sp(cv, e) * sp(cu, e), y = ry * sp(sv, e), z = rz * sp(cv, e) * sp(su, e);
        var nx = sp(cv, 2 - e) * sp(cu, 2 - e) / rx, ny = sp(sv, 2 - e) / ry, nz = sp(cv, 2 - e) * sp(su, 2 - e) / rz, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        var pt = [cx + x, cy + y, cz + z], nn = [nx / l, ny / l, nz / l];
        if (deform) deform(pt, nn);
        vb.vert(g, pt[0], pt[1], pt[2], nn[0], nn[1], nn[2], typeof col === 'function' ? col(x, y, z) : col);
      }
    }
    for (i = 0; i < rings; i++) for (j = 0; j < segs; j++) {
      var a = base + i * (segs + 1) + j, b = a + 1, c = a + segs + 2, d = a + segs + 1;
      vb.g[g].ix.push(a, c, b, a, d, c);
    }
  }
  // a cylinder along an axis ('x' | 'y' | 'z') with smooth sides and flat caps
  function cyl(vb, g, ax, cx, cy, cz, r0, r1, len, segs, col, noCaps) {
    var base = vb.g[g].cnt, i;
    function P(a, r, t) { var c = Math.cos(a) * r, s = Math.sin(a) * r; return ax === 'x' ? [cx + t, cy + c, cz + s] : ax === 'y' ? [cx + c, cy + t, cz + s] : [cx + c, cy + s, cz + t]; }
    function Nr(a) { var c = Math.cos(a), s = Math.sin(a); return ax === 'x' ? [0, c, s] : ax === 'y' ? [c, 0, s] : [c, s, 0]; }
    for (i = 0; i <= segs; i++) { var a = i / segs * TAU, n = Nr(a), p0 = P(a, r0, -len / 2), p1 = P(a, r1, len / 2); vb.vert(g, p0[0], p0[1], p0[2], n[0], n[1], n[2], col); vb.vert(g, p1[0], p1[1], p1[2], n[0], n[1], n[2], col); }
    for (i = 0; i < segs; i++) { var k = base + i * 2; if (ax === 'y') vb.g[g].ix.push(k, k + 1, k + 3, k, k + 3, k + 2); else vb.g[g].ix.push(k, k + 3, k + 1, k, k + 2, k + 3); }
    if (noCaps) return;
    [-1, 1].forEach(function (sg) {
      var r = sg < 0 ? r0 : r1, nn = ax === 'x' ? [sg, 0, 0] : ax === 'y' ? [0, sg, 0] : [0, 0, sg], cc = P(0, 0, sg * len / 2);
      var c0 = vb.vert(g, cc[0], cc[1], cc[2], nn[0], nn[1], nn[2], col), first = vb.g[g].cnt;
      for (var q = 0; q <= segs; q++) { var p = P(q / segs * TAU, r, sg * len / 2); vb.vert(g, p[0], p[1], p[2], nn[0], nn[1], nn[2], col); }
      for (q = 0; q < segs; q++) { var flipC = (ax === 'y') ? sg < 0 : sg > 0; if (flipC) vb.g[g].ix.push(c0, first + q + 1, first + q); else vb.g[g].ix.push(c0, first + q, first + q + 1); }
    });
  }
  // a torus around an axis (the steering wheel, the rim lips)
  function torus(vb, g, ax, cx, cy, cz, R, r, segs, tsegs, col) {
    var base = vb.g[g].cnt, i, j;
    for (i = 0; i <= segs; i++) {
      var a = i / segs * TAU, ca = Math.cos(a), sa = Math.sin(a);
      for (j = 0; j <= tsegs; j++) {
        var b = j / tsegs * TAU, cb = Math.cos(b), sb = Math.sin(b), rr = R + r * cb, x, y, z, nx, ny, nz;
        if (ax === 'x') { x = cx + r * sb; y = cy + ca * rr; z = cz + sa * rr; nx = sb; ny = ca * cb; nz = sa * cb; }
        else if (ax === 'y') { x = cx + ca * rr; y = cy + r * sb; z = cz + sa * rr; nx = ca * cb; ny = sb; nz = sa * cb; }
        else { x = cx + ca * rr; y = cy + sa * rr; z = cz + r * sb; nx = ca * cb; ny = sa * cb; nz = sb; }
        vb.vert(g, x, y, z, nx, ny, nz, col);
      }
    }
    for (i = 0; i < segs; i++) for (j = 0; j < tsegs; j++) {
      var p = base + i * (tsegs + 1) + j, q = p + tsegs + 1;
      if (ax === 'y') vb.g[g].ix.push(p, p + 1, q + 1, p, q + 1, q); else vb.g[g].ix.push(p, q + 1, p + 1, p, q, q + 1);
    }
  }

  // ----------------------------------------------------------- class specs --
  // t runs 0 (front bumper) .. 1 (rear bumper). yt: top of the lower body (hood, beltline, deck); yb: the body's
  // bottom edge (sill) before the arches; hw: plan-view half-width factor; cab: windshield base, roof front, roof back,
  // rear window base (t), roofK: roof half-width / body half-width; hip: the seated hip height; ex: class extras
  var SPECS = {
    sedan: { yt: [[0, 0.6], [0.025, 0.68], [0.07, 0.74], [0.25, 0.8], [0.34, 0.86], [0.7, 0.9], [0.86, 0.91], [0.96, 0.88], [1, 0.76]], yb: [[0, 0.3], [0.035, 0.22], [0.965, 0.24], [1, 0.34]],
      hw: [[0, 0.84], [0.02, 0.93], [0.06, 0.99], [0.12, 1], [0.9, 1], [0.97, 0.97], [1, 0.88]], cab: [0.335, 0.47, 0.73, 0.87], roofK: 0.8, crown: 0.025, hip: 0.56, rows: 2, rb: 0.07, rt: 0.13, bulge: 0.02, tuck: 0.05 },
    sports: { yt: [[0, 0.44], [0.03, 0.5], [0.1, 0.56], [0.36, 0.66], [0.5, 0.7], [0.82, 0.74], [0.95, 0.74], [1, 0.62]], yb: [[0, 0.22], [0.04, 0.14], [0.96, 0.16], [1, 0.26]],
      hw: [[0, 0.82], [0.03, 0.94], [0.1, 1], [0.6, 1.02], [0.85, 1.03], [0.97, 0.98], [1, 0.9]], cab: [0.4, 0.55, 0.66, 0.92], roofK: 0.72, crown: 0.03, hip: 0.34, rows: 1, rb: 0.07, rt: 0.12, bulge: 0.03, tuck: 0.06, wing: true },
    suv: { yt: [[0, 0.8], [0.03, 0.88], [0.08, 0.96], [0.27, 1.02], [0.31, 1.06], [0.9, 1.1], [0.985, 1.08], [1, 0.98]], yb: [[0, 0.44], [0.035, 0.36], [0.965, 0.38], [1, 0.46]],
      hw: [[0, 0.88], [0.025, 0.96], [0.06, 1], [0.94, 1], [0.985, 0.97], [1, 0.9]], cab: [0.3, 0.4, 0.95, 0.995], roofK: 0.86, crown: 0.02, hip: 0.74, rows: 2, rb: 0.08, rt: 0.12, bulge: 0.015, tuck: 0.04, rails: true, clad: true },
    cop: { base: 'sedan', hip: 0.52, ex: 'cop' },
    taxi: { base: 'sedan', hip: 0.52, ex: 'taxi' },
    van: { yt: [[0, 0.78], [0.03, 0.86], [0.08, 0.92], [0.17, 0.98], [0.2, 1.06], [1, 1.08]], yb: [[0, 0.42], [0.035, 0.34], [0.97, 0.36], [1, 0.44]],
      hw: [[0, 0.88], [0.025, 0.96], [0.07, 1], [0.97, 1], [1, 0.97]], cab: [0.19, 0.28, 0.985, 1.0], roofK: 0.95, crown: 0.02, hip: 0.92, rows: 1, rb: 0.08, rt: 0.08, bulge: 0.01, tuck: 0.03, cabWin: 0.42 },
    truck: { cabT: 0.36, yt: [[0, 1.2], [0.02, 1.32], [0.06, 1.4], [0.15, 1.46], [0.18, 1.7], [0.36, 1.74]], yb: [[0, 0.62], [0.02, 0.5], [0.36, 0.5]],
      hw: [[0, 0.88], [0.02, 0.95], [0.05, 0.98], [0.36, 0.98]], cab: [0.175, 0.23, 0.355, 0.36], roofK: 0.92, crown: 0.02, hip: 1.5, rows: 1, rb: 0.08, rt: 0.08, bulge: 0.0, tuck: 0.04, roofH: 2.62 },
    bus: { midF: 0.62, yt: [[0, 1.4], [0.01, 1.5], [1, 1.5]], yb: [[0, 0.42], [0.012, 0.34], [0.988, 0.34], [1, 0.42]],
      hw: [[0, 0.95], [0.012, 0.99], [0.02, 1], [0.98, 1], [0.99, 0.99], [1, 0.95]], cab: [0.0, 0.03, 0.985, 1.0], roofK: 0.94, crown: 0.03, hip: 1.05, rows: 0, rb: 0.1, rt: 0.08, bulge: 0.0, tuck: 0.03, bus: true }
  };
  function specFor(cls) {
    var s = SPECS[cls] || SPECS.sedan;
    if (s.base) { var b = SPECS[s.base], o = {}; for (var k in b) o[k] = b[k]; for (k in s) if (k !== 'base') o[k] = s[k]; return o; }
    return s;
  }

  // the right half of a lower-body section: bottom centre -> bottom corner -> side -> shoulder -> top centre
  function lowerHalf(hw, yb, yt, sp, q, flare) {
    var h = Math.max(0.02, yt - yb), rb = Math.min(sp.rb, h * 0.35), rt = Math.min(sp.rt, h * 0.45), out = [];
    var nb = [3, 2, 1][q], nt = [4, 3, 2][q], tuck = sp.tuck, tumble = sp.tumble || 0.03, crown = sp.crown;
    var sx = hw + (flare || 0);
    out.push([0, yb], [hw * 0.55, yb]);
    for (var i = 0; i <= nb; i++) { var a = -Math.PI / 2 + i / nb * Math.PI / 2; out.push([sx - tuck - rb + Math.cos(a) * (rb + tuck * (i / nb)), yb + rb + Math.sin(a) * rb]); }
    out.push([sx + sp.bulge, yb + rb + (h - rb - rt) * 0.5]);
    for (i = 0; i <= nt; i++) { var b = i / nt * Math.PI / 2; out.push([sx - tumble - rt + Math.cos(b) * (rt + tumble * (1 - i / nt)), yt - rt + Math.sin(b) * rt]); }
    out.push([hw * 0.45, yt + crown * 0.8], [0, yt + crown]);
    return out;
  }
  // the right half of a greenhouse section: belt (side) -> roof corner -> roof centre
  function cabinHalf(hwB, yB, hwR, yR, crown, q, midF) {
    var h = Math.max(0, yR - yB), rc = Math.min(0.07, h * 0.4), out = [], nc = [3, 2, 1][q], f = midF || 0.5;
    var tr = Math.min(0.035, h * 0.15);
    out.push([hwB, yB], [hwB + (hwR + rc - hwB) * tr / Math.max(0.001, h), yB + tr], [hwB + (hwR + rc - hwB) * f, yB + (h - rc) * f], [hwR + rc, yR - rc]);
    for (var i = 1; i <= nc; i++) { var a = i / nc * Math.PI / 2; out.push([hwR + Math.cos(a) * rc, yR - rc + Math.sin(a) * rc]); }
    out.push([hwR * 0.5, yR + crown * 0.8], [0, yR + crown]);
    return out;
  }
  function mirrorLoop(half, closed) {
    var left = [];
    for (var i = half.length - 2; i >= (closed ? 1 : 0); i--) left.push([-half[i][0], half[i][1]]);
    return half.concat(left);
  }
  function pointIn(pts, x, y) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // ------------------------------------------------------------ car bodies --
  function carBody(vb, cls, sp, dims, q, mods, out) {
    var L = dims.L, W = dims.W, H = dims.H, wr = dims.wr, hl = L / 2, hw0 = W / 2, i;
    var tEnd = sp.cabT || 1, zEnd = -hl + L * tEnd;
    var axles = dims.axles, Ra = wr + 0.055;
    function zOf(t) { return -hl + t * L; }
    function archY(z) { var y = -1; axles.forEach(function (az) { var d = Math.abs(z - az); if (d < Ra) y = Math.max(y, wr + Math.sqrt(Ra * Ra - d * d) - 0.02); }); return y; }
    function sectAt(t) {
      var z = zOf(t), hw = hw0 * pw(sp.hw, t), yt = pw(sp.yt, t), yb = pw(sp.yb, t), ay = archY(z), flare = 0;
      if (ay > yb) { flare = 0.018 * Math.min(1, (ay - yb) / 0.2); yb = Math.min(ay, yt - 0.06); }
      return { z: z, pts: lowerHalf(hw, yb, yt, sp, q, flare), yb: yb, yt: yt, hw: hw };
    }
    // stations: a base step, the ends dense (the rounded nose and tail), dense through every arch
    var ts = [], step = [1 / 44, 1 / 24, 1 / 9][q];
    for (var t = 0; t <= tEnd + 1e-6; t += step) ts.push(t);
    (q < 2 ? [0.006, 0.015, 0.03, 0.045] : [0.012, 0.04]).forEach(function (e) { ts.push(e); if (!sp.cabT) ts.push(1 - e); });
    if (q < 2) axles.forEach(function (az) { for (var k = -6; k <= 6; k++) { var tt = (az + Ra * k / 6 - -hl) / L; if (tt > 0 && tt < tEnd) ts.push(tt); } });
    else axles.forEach(function (az) { [-1, -0.5, 0.5, 1].forEach(function (k) { var tt = (az + Ra * k - -hl) / L; if (tt > 0 && tt < tEnd) ts.push(tt); }); });
    var cab = sp.cab; cab.forEach(function (c) { if (c <= tEnd) ts.push(c); });
    ts.push(tEnd);
    ts = ts.filter(function (v) { return v >= 0 && v <= tEnd + 1e-9; }).sort(function (a, b) { return a - b; }).filter(function (v, k, arr) { return k === 0 || v - arr[k - 1] > 0.0015; });
    var st = ts.map(function (tt) { var s = sectAt(tt), lp = mirrorLoop(s.pts, true); return { z: s.z, pts: lp, t: tt, s: s }; });
    var half = st[0].s.pts.length;
    var paintC = WHITE, two = mods.secondary;
    function lowerClass(i, j) {
      var k = j < half - 1 ? j : (2 * half - 3 - j);   // index along the right half
      var t = (st[i].t + st[i + 1].t) / 2, p = st[i].pts[j], yq = p[1];
      if (k < 2) return { g: 'detail', c: DARK };
      if (sp.clad && yq < st[i].s.yb + 0.12) return { g: 'detail', c: [0.12, 0.12, 0.13] };
      if (cls === 'cop' && (t < 0.3 || t > 0.8)) return { g: 'paint', c: [0.07, 0.07, 0.08] };
      return { g: 'paint', c: paintC };
    }
    loft(vb, st, true, lowerClass, function (i) { var s = st[i].s; return [0, (s.yb + s.yt) / 2]; });
    cap(vb, st, 0, -1, 'paint', paintC);
    cap(vb, st, st.length - 1, 1, sp.cabT ? 'detail' : 'paint', sp.cabT ? DARK : paintC);
    out.section = sectAt;
    out.st = st;
    // wheel-well liners: dark half shells inside each arch
    if (q < 2) axles.forEach(function (az) {
      [-1, 1].forEach(function (s) {
        var hw = hw0 * pw(sp.hw, (az + hl) / L), segs = q ? 8 : 12, base = vb.g.detail.cnt;
        for (var k = 0; k <= segs; k++) {
          var a = Math.PI * k / segs, ca = Math.cos(a), sa = Math.sin(a), y = wr + sa * (Ra - 0.01), z = az + ca * (Ra - 0.01);
          vb.vert('detail', s * (hw - 0.02), y, z, 0, -sa, -ca, TRIM); vb.vert('detail', s * (hw - 0.36), y, z, 0, -sa, -ca, TRIM);
        }
        for (k = 0; k < segs; k++) { var b = base + k * 2; if (s > 0) vb.g.detail.ix.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); else vb.g.detail.ix.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      });
    });
    // ---- the greenhouse
    var tA = cab[0], tR0 = cab[1], tR1 = cab[2], tC = cab[3], roofH = sp.roofH || H;
    var cts = [], cstep = [1 / 60, 1 / 30, 1 / 10][q];
    for (t = tA; t <= tC + 1e-6; t += cstep) cts.push(t);
    var pillarB = (tR0 + tR1) / 2 + (sp.rows === 2 ? -0.02 : 0.1), pb = 0.06 / L;
    var pillars = [];
    if (sp.bus) { var nW = 8, wl = (tR1 - tR0) / nW; for (var w = 0; w <= nW; w++) pillars.push([tR0 + w * wl - 0.006, tR0 + w * wl + 0.006]); }
    else if (cls === 'van') pillars.push([sp.cabWin, 2]);
    else if (cls === 'truck') pillars.push([tR1 - 0.012, 2]);
    else if (sp.rows === 2) pillars.push([pillarB - pb, pillarB + pb]);
    [tA, tR0, tR1, tC].forEach(function (v) { cts.push(v); });
    pillars.forEach(function (pp) { if (pp[0] > tA && pp[0] < tC) cts.push(pp[0] - 0.0005, pp[0] + 0.0005); if (pp[1] > tA && pp[1] < tC) cts.push(pp[1] - 0.0005, pp[1] + 0.0005); });
    cts = cts.filter(function (v) { return v >= tA && v <= tC + 1e-9; }).sort(function (a, b) { return a - b; }).filter(function (v, k, arr) { return k === 0 || v - arr[k - 1] > 0.0008; });
    function roofY(t) {
      var yB = pw(sp.yt, t), k;
      if (t < tR0) { k = (t - tA) / Math.max(1e-6, tR0 - tA); return yB + (roofH - yB) * Math.sin(Math.min(1, k) * Math.PI / 2 * 0.98 + 0.02) * Math.min(1, k * 4); }
      if (t > tR1) { k = (tC - t) / Math.max(1e-6, tC - tR1); return yB + (roofH - yB) * Math.min(1, k * (sp.bus || cls === 'van' || cls === 'truck' ? 1 : 1.0)); }
      return roofH;
    }
    var cst = cts.map(function (tt) {
      var s = sectAt(tt), yB = s.yt - 0.01, yR = Math.max(yB, roofY(tt)), hwB = s.hw - (sp.tumble || 0.03) - 0.015, hwR = s.hw * sp.roofK;
      var kk = U.clamp((yR - yB) / Math.max(0.01, roofH - yB), 0, 1); hwR = hwB + (hwR - hwB) * Math.min(1, kk * 1.6);
      return { z: s.z, t: tt, pts: mirrorLoop(cabinHalf(hwB, yB, hwR, yR, sp.crown * kk, q, sp.midF), false), yB: yB, yR: yR };
    });
    var chalf = cabinHalf(1, 0, 0.8, 1, 0, q).length, nCorner = [3, 2, 1][q];
    var glassC = mods.tintC;
    function inPillar(t) { for (var k = 0; k < pillars.length; k++) if (t > pillars[k][0] && t < pillars[k][1]) return true; return false; }
    function cabClass(i, j) {
      var k = j < chalf - 1 ? j : (2 * chalf - 3 - j), t = (cst[i].t + cst[i + 1].t) / 2;
      var side = k <= 2, corner = !side && k < 3 + nCorner, top = !side && !corner;
      var roofZone = t > tR0 && t < tR1, windshield = t <= tR0, rear = t >= tR1;
      var roofCol = two ? two : paintC, roofG = two ? 'detail' : 'paint';
      if (sp.bus && windshield && (top || corner) && cst[i].pts[j][1] > roofH - 0.42) return { g: 'paint', c: paintC };   // the band above the bus windshield
      if (top) return roofZone ? { g: roofG, c: roofCol } : { g: 'glass', c: glassC };
      if (corner) return windshield && (sp.bus) ? { g: 'glass', c: glassC } : { g: roofG, c: roofCol };
      // the sides: trim at the belt, glass in the openings, paint in the pillars and the rear quarter
      if (sp.bus) { if (k !== 1 || inPillar(t) || rear) return { g: 'paint', c: paintC }; return { g: 'glass', c: glassC }; }
      if (k === 0) return { g: 'detail', c: TRIM };
      if (sp.bus) return inPillar(t) || rear ? { g: 'paint', c: paintC } : { g: 'glass', c: glassC };
      if (inPillar(t)) return { g: 'paint', c: paintC };
      if (rear && cls !== 'suv' && cls !== 'sports') return { g: 'paint', c: paintC };
      return { g: 'glass', c: glassC };
    }
    loft(vb, cst, false, cabClass, function (i) { return [0, cst[i].yB]; });
    if (sp.bus || cls === 'van' || cls === 'truck') {
      // the flat back of a box body: a paint cap (the bus: a rear window in it)
      var last = cst.length - 1; cap(vb, cst, last, 1, 'paint', paintC);
    }
    out.cab = { tA: tA, tR0: tR0, tR1: tR1, tC: tC, zA: zOf(tA), zR0: zOf(tR0), zR1: zOf(tR1), zC: zOf(tC), roofH: roofH, pillarB: zOf(pillarB) };
    out.frontZ = function (x, y) { for (var k = 0; k < st.length; k++) if (pointIn(st[k].pts, x, y)) return st[k].z; return -hl; };
    out.rearZ = function (x, y) { for (var k = st.length - 1; k >= 0; k--) if (pointIn(st[k].pts, x, y)) return st[k].z; return hl; };
    out.sideX = function (t, y) {
      var s = sectAt(t).pts, best = 0;
      for (var k = 0; k < s.length - 1; k++) { var a = s[k], b = s[k + 1]; if ((a[1] - y) * (b[1] - y) <= 0 && a[0] > 0.2) { var f = (y - a[1]) / ((b[1] - a[1]) || 1); best = Math.max(best, a[0] + (b[0] - a[0]) * f); } }
      return best || sectAt(t).hw;
    };
    void i;
  }

  // ------------------------------------------------------------- details --
  function details(vb, cls, sp, dims, q, mods, B) {
    var L = dims.L, W = dims.W, H = dims.H, wr = dims.wr, hl = L / 2, hw = W / 2, c = B.cab;
    function zOf(t) { return -hl + t * L; }
    var fz = function (x, y) { return B.frontZ(x, y); }, rz = function (x, y) { return B.rearZ(x, y); };
    var segs = [16, 10, 6][q], small = [10, 6, 4][q];
    // ---- head lamps: a chrome reflector and a lens pod on the nose surface
    var ly = pw(sp.yt, 0.03) - (cls === 'bus' ? 0.6 : cls === 'truck' ? 0.45 : 0.13), lx = hw * (cls === 'bus' ? 0.72 : 0.66), lw = cls === 'sports' ? 0.2 : cls === 'truck' ? 0.16 : 0.17, lh = cls === 'sports' ? 0.055 : 0.075;
    if (cls === 'bus') ly = 0.75; if (cls === 'truck') ly = 0.82; if (cls === 'van') ly = 0.68; if (cls === 'suv') ly = 0.82;
    [-1, 1].forEach(function (s) {
      var z = fz(s * lx, ly);
      if (q < 2) blob(vb, 'chrome', s * lx, ly, z + 0.012, lw + 0.015, lh + 0.015, 0.04, small, 5, REFL, 4);
      blob(vb, 'head', s * lx, ly, z + 0.006, lw, lh, 0.035, small, q ? 3 : 5, HEADC, 4);
      if (q === 0) blob(vb, 'chrome', s * lx * 0.97, ly, z - 0.02, lw * 0.35, lh * 0.55, 0.012, 8, 4, CHROME, 2);
      // tail lamps on the rear surface (the bus and truck: low, square)
      var ty = cls === 'bus' ? 0.85 : cls === 'truck' ? 0.7 : pw(sp.yt, 0.98) - 0.12, tx = hw * (cls === 'sports' ? 0.7 : 0.72), tw = cls === 'sports' ? 0.22 : 0.16;
      var zr = cls === 'truck' ? hl : rz(s * tx, ty);
      blob(vb, 'tail', s * tx, ty, zr - 0.008, tw, cls === 'sports' ? 0.04 : 0.06, 0.03, small, q ? 3 : 4, TAILC, 4);
      if (q === 0) blob(vb, 'detail', s * tx, ty - 0.08, zr - 0.006, tw * 0.6, 0.016, 0.02, 8, 3, [0.9, 0.9, 0.92], 4);   // reverse lamp
    });
    // ---- grille, bumper lip, plates
    var gy = cls === 'sports' ? 0.32 : cls === 'suv' ? 0.66 : cls === 'van' ? 0.55 : cls === 'truck' ? 0.75 : cls === 'bus' ? 0.5 : 0.45;
    var gw = cls === 'truck' ? 0.62 : cls === 'suv' ? 0.42 : cls === 'sports' ? 0.4 : 0.34, gh = cls === 'truck' ? 0.32 : cls === 'suv' ? 0.12 : 0.07;
    if (cls !== 'bus') {
      var gz = fz(0, gy);
      blob(vb, 'detail', 0, gy, gz + 0.01, gw, gh, 0.03, small, 4, TRIM, 5);
      blob(vb, 'chrome', 0, gy, gz + 0.016, gw + 0.02, gh + 0.015, 0.024, small, 4, cls === 'sports' ? [0.2, 0.2, 0.22] : CHROME, 5);
      if (q === 0) for (var k = -2; k <= 2; k++) blob(vb, 'chrome', 0, gy + k * gh * 0.36, gz - 0.008, gw * 0.92, 0.006, 0.01, 6, 2, CHROME, 4);
      // the lower intake
      var iy = (cls === 'sports' ? 0.2 : pw(sp.yb, 0.01) + 0.08);
      if (q < 2) blob(vb, 'detail', 0, iy, fz(0, iy) + 0.012, hw * 0.55, 0.035, 0.025, small, 3, TRIM, 5);
    }
    var py = cls === 'bus' ? 0.55 : cls === 'truck' ? 0.6 : cls === 'sports' ? 0.28 : pw(sp.yb, 0.98) + 0.17;
    function plate(z, dir) {
      blob(vb, 'detail', 0, py, z + dir * 0.006, 0.26, 0.065, 0.008, 8, 2, PLATE, 6);
      if (q === 0) { blob(vb, 'detail', 0, py, z + dir * 0.012, 0.18, 0.02, 0.003, 6, 2, [0.15, 0.2, 0.4], 6); }
    }
    plate(cls === 'truck' ? hl : rz(0, py), 1);
    if (cls !== 'bus') plate(fz(0, Math.max(py - 0.04, 0.3)), -1);
    // ---- mirrors (secondary colour when two-tone)
    var my = pw(sp.yt, c.tA) + 0.08, mz = c.zA + 0.12, mxs = B.sideX(c.tA + 0.02, pw(sp.yt, c.tA) - 0.02);
    if (cls !== 'bus' || q < 2) [-1, 1].forEach(function (s) {
      blob(vb, mods.secondary ? 'detail' : 'paint', s * (mxs + 0.09), my + (cls === 'bus' || cls === 'truck' ? 0.3 : 0), mz, 0.07, 0.05, 0.04, small, 4, mods.secondary || WHITE, 3);
      if (q < 2) blob(vb, 'detail', s * (mxs + 0.035), my - 0.02, mz + 0.01, 0.04, 0.015, 0.02, 6, 3, TRIM, 3);
    });
    // ---- door seams, handles, a chrome belt strip
    if (q === 0 && cls !== 'bus') {
      var doors = sp.rows === 2 ? [c.tA - 0.01, (c.tR0 + c.tR1) / 2 - 0.02, c.tR1 + 0.005] : cls === 'van' ? [c.tA - 0.005, sp.cabWin + 0.005, 0.6, 0.97] : [c.tA - 0.01, c.tR1 + 0.03];
      doors.forEach(function (t, di) {
        var y0 = pw(sp.yb, t) + 0.05 + (sp.clad ? 0.12 : 0), y1 = pw(sp.yt, t) - 0.03;
        [-1, 1].forEach(function (s) {
          var x0 = B.sideX(t, y0), x1 = B.sideX(t, y1), xm = B.sideX(t, (y0 + y1) / 2), z = zOf(t);
          var nv = 3, pts = [];
          for (var k2 = 0; k2 <= nv; k2++) { var yy = y0 + (y1 - y0) * k2 / nv; pts.push([s * (B.sideX(t, yy) + 0.003), yy]); }
          for (k2 = 0; k2 < nv; k2++) { var a = pts[k2], b = pts[k2 + 1]; if (s > 0) vb.quad('detail', [a[0], a[1], z - 0.006], [a[0], a[1], z + 0.006], [b[0], b[1], z + 0.006], [b[0], b[1], z - 0.006], TRIM); else vb.quad('detail', [a[0], a[1], z + 0.006], [a[0], a[1], z - 0.006], [b[0], b[1], z - 0.006], [b[0], b[1], z + 0.006], TRIM); }
          if (di < doors.length - 1 || doors.length === 2) {
            var hzz = di < doors.length - 1 ? zOf(doors[di + 1]) - 0.22 : z + 0.0, hy = y1 - 0.09;
            if (di < doors.length - 1) blob(vb, 'chrome', s * (B.sideX((hzz + hl) / L, hy) + 0.008), hy, hzz, 0.008, 0.012, 0.06, 6, 3, CHROME, 4);
          }
          void x0; void x1; void xm;
        });
      });
    }
    // ---- interior: seats with headrests, the dash, the steering wheel
    var hip = sp.hip, seats = [], seatX = Math.min(0.4, hw * 0.42), hz = c.zR0 + (cls === 'sports' ? 0.32 : cls === 'van' || cls === 'truck' ? 0.38 : 0.24);
    if (cls === 'bus') { hz = -hl + 1.0; seatX = hw * 0.55; }
    seats.push({ x: -seatX, y: hip, z: hz });
    if (cls !== 'bus') seats.push({ x: seatX, y: hip, z: hz });
    if (sp.rows === 2) { seats.push({ x: -seatX, y: hip + 0.02, z: hz + 0.88 }); seats.push({ x: seatX, y: hip + 0.02, z: hz + 0.88 }); }
    if (cls === 'van') seats.push({ x: 0, y: hip, z: hz + 0.2 });
    if (cls === 'bus') for (var r = 0; r < 7; r++) { seats.push({ x: -hw * 0.5, y: hip, z: -hl + 2.2 + r * 1.05 }); seats.push({ x: hw * 0.5, y: hip, z: -hl + 2.2 + r * 1.05 }); }
    B.seats = seats;
    var wheelPoint = { x: -seatX, y: hip + 0.32, z: hz - 0.46 };
    if (cls === 'bus') wheelPoint = { x: -seatX, y: hip + 0.3, z: hz - 0.5 };
    B.wheelPoint = wheelPoint;
    if (q < 2) {
      seats.forEach(function (s0, si) {
        if (cls === 'bus' && si > 0 && q > 0) return;
        blob(vb, 'detail', s0.x, s0.y - 0.13, s0.z - 0.1, 0.22, 0.06, 0.24, small, 3, SEAT, 4);
        blob(vb, 'detail', s0.x, s0.y + 0.2, s0.z + 0.16, 0.21, 0.28, 0.06, small, 3, SEAT, 4, function (p) { p[2] += (p[1] - s0.y - 0.2) * 0.22; });
        if (q === 0) blob(vb, 'detail', s0.x, s0.y + 0.56, s0.z + 0.23, 0.11, 0.07, 0.05, 8, 3, SEAT, 4);
      });
      if (cls !== 'bus') {
        var dz = hz - 0.82, dy = pw(sp.yt, c.tA + 0.03) - 0.05;
        blob(vb, 'detail', 0, dy, dz, hw * 0.86, 0.09, 0.16, small, 3, DASH, 5);
        torus(vb, 'detail', 'z', wheelPoint.x, wheelPoint.y, wheelPoint.z, 0.17, 0.015, q ? 10 : 16, 5, [0.05, 0.05, 0.06]);
        cyl(vb, 'detail', 'z', wheelPoint.x, wheelPoint.y - 0.05, wheelPoint.z - 0.18, 0.025, 0.025, 0.3, 6, DASH);
      }
    }
    // ---- exhaust, under-tray
    if (q < 2 && cls !== 'bus' && cls !== 'truck') { var ez = rz(hw * 0.55, pw(sp.yb, 0.99) + 0.06); cyl(vb, 'chrome', 'z', hw * 0.55, pw(sp.yb, 0.99) + 0.03, ez - 0.02, 0.032, 0.036, 0.12, 8, CHROME); if (cls === 'sports') cyl(vb, 'chrome', 'z', -hw * 0.55, pw(sp.yb, 0.99) + 0.03, ez - 0.02, 0.032, 0.036, 0.12, 8, CHROME); }
    // ---- class extras
    var roof = c.roofH;
    if (cls === 'cop') {
      var bz = (c.zR0 + c.zR1) / 2 - 0.1;
      blob(vb, 'detail', 0, roof + 0.03, bz, 0.62, 0.03, 0.14, small, 3, DARK, 4);
      blob(vb, 'barRed', -0.31, roof + 0.09, bz, 0.29, 0.055, 0.12, small, 4, RED, 4);
      blob(vb, 'barBlue', 0.31, roof + 0.09, bz, 0.29, 0.055, 0.12, small, 4, BLUE, 4);
      if (q < 2) {
        // the push bar and a navy door stripe
        var pz = -hl - 0.12; [-1, 1].forEach(function (s) { cyl(vb, 'detail', 'y', s * 0.36, 0.5, pz, 0.03, 0.03, 0.5, 6, DARK); });
        cyl(vb, 'detail', 'x', 0, 0.68, pz, 0.03, 0.03, 0.78, 6, DARK); cyl(vb, 'detail', 'x', 0, 0.4, pz, 0.03, 0.03, 0.78, 6, DARK);
        stripe(vb, B, sp, dims, c.tA - 0.02, c.tR1 + 0.04, 0.52, 0.6, NAVY);
      }
    }
    if (cls === 'taxi') {
      var tz = (c.zR0 + c.zR1) / 2;
      blob(vb, 'detail', 0, roof + 0.1, tz, 0.3, 0.09, 0.12, small, 4, AMBER, 5);
      if (q < 2) { blob(vb, 'detail', 0, roof + 0.1, tz - 0.123, 0.22, 0.04, 0.004, 6, 2, DARK, 6); blob(vb, 'detail', 0, roof + 0.1, tz + 0.123, 0.22, 0.04, 0.004, 6, 2, DARK, 6); }
      if (q < 2) for (var ck = 0; ck < 12; ck++) { var t0 = c.tA + (c.tR1 + 0.03 - c.tA) * ck / 12, t1 = c.tA + (c.tR1 + 0.03 - c.tA) * (ck + 1) / 12; stripe(vb, B, sp, dims, t0, t1, 0.5, 0.57, ck % 2 ? DARK : [0.96, 0.96, 0.94]); }
    }
    if (cls === 'bus') {
      blob(vb, 'detail', 0, H - 0.32, -hl + 0.06, hw * 0.7, 0.13, 0.03, small, 3, AMBER, 6);                          // the destination sign
      [-hl + 0.8, hl - 3.4].forEach(function (z) { blob(vb, 'glass', hw + 0.004, 1.55, z, 0.012, 1.15, 0.48, small, 3, [0.15, 0.17, 0.2], 8); blob(vb, 'detail', hw + 0.01, 1.55, z, 0.006, 1.15, 0.012, 4, 2, TRIM, 4); });
      stripe(vb, B, sp, dims, 0.03, 0.97, 1.28, 1.42, NAVY);
    }
    if (sp.rails && q < 2) [-1, 1].forEach(function (s) { cyl(vb, 'chrome', 'z', s * hw * sp.roofK * 0.82, roof + 0.05, (c.zR0 + c.zR1) / 2, 0.016, 0.016, (c.zR1 - c.zR0) * 0.9, 6, [0.2, 0.2, 0.22]); [-0.4, 0.4].forEach(function (f) { blob(vb, 'detail', s * hw * sp.roofK * 0.82, roof + 0.025, (c.zR0 + c.zR1) / 2 + f * (c.zR1 - c.zR0), 0.02, 0.03, 0.03, 6, 3, DARK, 4); }); });
    if (sp.clad && q < 2) [-1, 1].forEach(function (s) { cyl(vb, 'detail', 'z', s * (hw - 0.02), 0.34, 0, 0.04, 0.04, L * 0.38, 6, [0.15, 0.15, 0.16]); });   // side steps
    // spoilers: a lip, a duck tail, a wing on struts (sports carry the wing)
    var spo = mods.spoiler != null ? mods.spoiler : (sp.wing ? 3 : 0);
    if (spo && cls !== 'bus' && cls !== 'truck' && cls !== 'van') {
      var sy = pw(sp.yt, 0.97), szz = zOf(0.965), scol = mods.secondary || WHITE, sg = mods.secondary ? 'detail' : 'paint';
      if (spo === 1) blob(vb, sg, 0, sy + 0.015, szz, hw * 0.8, 0.012, 0.05, small, 3, scol, 4);
      else if (spo === 2) blob(vb, sg, 0, sy + 0.03, szz - 0.02, hw * 0.85, 0.03, 0.08, small, 3, scol, 4, function (p) { p[1] += (p[2] - szz) * 0.4; });
      else { [-1, 1].forEach(function (s) { blob(vb, 'detail', s * hw * 0.6, sy + 0.08, szz + 0.02, 0.012, 0.08, 0.03, 6, 3, DARK, 4); }); blob(vb, sg, 0, sy + 0.17, szz + 0.03, hw * 0.92, 0.015, 0.1, small, 3, scol, 4, function (p) { p[1] += (p[2] - szz) * 0.15; }); }
    }
  }
  // a band of colour on both flanks (t0..t1, y0..y1): the cop's stripe, the taxi's checks
  function stripe(vb, B, sp, dims, t0, t1, y0, y1, col) {
    var L = dims.L, hl = L / 2, n = 3;
    [-1, 1].forEach(function (s) {
      for (var i = 0; i < n; i++) {
        var ta = t0 + (t1 - t0) * i / n, tb = t0 + (t1 - t0) * (i + 1) / n, za = -hl + ta * L, zb = -hl + tb * L;
        var a0 = B.sideX(ta, y0) + 0.004, a1 = B.sideX(ta, y1) + 0.004, b0 = B.sideX(tb, y0) + 0.004, b1 = B.sideX(tb, y1) + 0.004;
        if (s > 0) vb.quad('detail', [a0, y0, za], [a1, y1, za], [b1, y1, zb], [b0, y0, zb], col);
        else vb.quad('detail', [-a0, y0, za], [-b0, y0, zb], [-b1, y1, zb], [-a1, y1, za], col);
      }
    });
  }

  // --------------------------------------------------- truck cargo / van wrap --
  function truckBox(vb, dims, q, B) {
    var L = dims.L, W = dims.W, H = dims.H, hl = L / 2, hw = W / 2, z0 = -hl + L * 0.36 + 0.25, z1 = hl, y0 = 0.82, LG = [0.88, 0.88, 0.86];
    var n = [8, 5, 3][q];
    blob(vb, 'detail', 0, (y0 + H) / 2, (z0 + z1) / 2, hw, (H - y0) / 2, (z1 - z0) / 2, [16, 10, 6][q], [6, 4, 2][q], LG, 10);
    if (q < 2) {
      for (var k = 0; k < n; k++) { var y = y0 + 0.25 + k * (H - y0 - 0.4) / (n - 1); [-1, 1].forEach(function (s) { blob(vb, 'detail', s * (hw + 0.004), y, (z0 + z1) / 2, 0.006, 0.02, (z1 - z0) / 2 - 0.12, 4, 2, [0.72, 0.72, 0.7], 4); }); }
      blob(vb, 'detail', 0, (y0 + H) / 2, z1 + 0.004, 0.012, (H - y0) / 2 - 0.12, 0.004, 4, 2, DARK, 4);   // the rear door seam
      [-0.4, 0.4].forEach(function (x) { cyl(vb, 'chrome', 'y', x, (y0 + H) / 2, z1 + 0.02, 0.012, 0.012, H - y0 - 0.4, 6, CHROME); });
    }
    // chassis rails, the fuel tank, the exhaust stack, mud flaps
    blob(vb, 'detail', 0, 0.62, 0.3, hw * 0.55, 0.12, hl - 0.4, 8, 3, DARK, 6);
    if (q < 2) {
      cyl(vb, 'chrome', 'z', -hw + 0.25, 0.62, -hl + L * 0.45, 0.22, 0.22, 0.9, 12, CHROME);
      cyl(vb, 'chrome', 'y', hw - 0.12, 2.1, -hl + L * 0.36 + 0.1, 0.07, 0.07, 2.0, 8, CHROME);
      [-1, 1].forEach(function (s) { blob(vb, 'detail', s * (hw - 0.2), 0.42, hl - 0.25, 0.2, 0.22, 0.01, 6, 2, TRIM, 6); });
    }
    // the big chrome bumper
    blob(vb, 'chrome', 0, 0.55, -hl - 0.03, hw - 0.1, 0.13, 0.08, [14, 8, 4][q], 3, CHROME, 5);
  }
  function wrapPanels(vb, dims, B) {
    var L = dims.L, H = dims.H, hl = L / 2, sp = SPECS.van, e = 0.012;
    var wz0 = -hl + L * sp.cabWin + 0.15, wz1 = hl - 0.08, wy0 = 0.62, wy1 = H - 0.22;
    var n = 6;
    for (var i = 0; i < n; i++) {
      var za = wz0 + (wz1 - wz0) * i / n, zb = wz0 + (wz1 - wz0) * (i + 1) / n, ta = (za + hl) / L, tb = (zb + hl) / L;
      var xa0 = B.sideX(ta, wy0) + e, xb0 = B.sideX(tb, wy0) + e, xa1 = B.sideX(ta, Math.min(wy1, 1.0)) + e, xb1 = B.sideX(tb, Math.min(wy1, 1.0)) + e;
      var xa = Math.max(xa0, xa1), xb = Math.max(xb0, xb1), ua = i / n, ub = (i + 1) / n;
      vb.quad('wrap', [-xa, wy0, za], [-xb, wy0, zb], [-xb, wy1, zb], [-xa, wy1, za], WHITE, [[ua, 0.5], [ub, 0.5], [ub, 1], [ua, 1]]);
      vb.quad('wrap', [xb, wy0, zb], [xa, wy0, za], [xa, wy1, za], [xb, wy1, zb], WHITE, [[1 - ub, 0.5], [1 - ua, 0.5], [1 - ua, 1], [1 - ub, 1]]);
    }
    var hw = dims.W / 2 - 0.12;
    vb.quad('wrap', [-hw, wy0, hl + e], [hw, wy0, hl + e], [hw, wy1, hl + e], [-hw, wy1, hl + e], WHITE, [[0.25, 0], [0.75, 0], [0.75, 0.5], [0.25, 0.5]]);
  }

  // ------------------------------------------------------------- scooter --
  function scooter(vb, q, mods) {
    var s = [12, 8, 5][q], r = [6, 4, 3][q], P = WHITE;
    blob(vb, 'detail', 0, 0.33, -0.12, 0.17, 0.03, 0.42, s, 3, DARK, 6);                                                // floorboard
    blob(vb, 'paint', 0, 0.56, 0.42, 0.21, 0.22, 0.44, s, r, P, 3, function (p) { p[1] += (p[2] - 0.42) * 0.25; if (p[1] < 0.36) p[1] = 0.36; });   // the rear body
    blob(vb, 'detail', 0, 0.82, 0.3, 0.16, 0.05, 0.36, s, r, SEAT, 4);                                                // the seat
    blob(vb, 'paint', 0, 0.68, -0.68, 0.19, 0.34, 0.06, s, r, P, 3, function (p) { p[2] += (p[1] - 0.68) * 0.25; });  // the leg shield
    blob(vb, 'paint', 0, 0.45, -0.8, 0.07, 0.07, 0.16, s, r, P, 3);                                                  // the front fender
    cyl(vb, 'detail', 'y', 0, 0.95, -0.76, 0.025, 0.025, 0.3, 6, DARK);                                                  // the column
    blob(vb, 'paint', 0, 1.03, -0.78, 0.13, 0.06, 0.07, s, 3, P, 4);                                                  // the headset
    cyl(vb, 'chrome', 'x', 0, 1.04, -0.8, 0.012, 0.012, 0.62, 6, CHROME);                                                 // the bars
    [-1, 1].forEach(function (k) { cyl(vb, 'detail', 'x', k * 0.28, 1.04, -0.8, 0.02, 0.02, 0.1, 6, DARK); if (q < 2) { cyl(vb, 'chrome', 'y', k * 0.2, 1.12, -0.78, 0.006, 0.006, 0.16, 4, CHROME); blob(vb, 'detail', k * 0.2, 1.22, -0.78, 0.04, 0.025, 0.012, 6, 3, DARK, 2); } });
    blob(vb, 'head', 0, 1.02, -0.86, 0.06, 0.045, 0.02, 10, 4, HEADC, 2);
    blob(vb, 'tail', 0, 0.68, 0.87, 0.07, 0.03, 0.02, 8, 3, TAILC, 4);
    blob(vb, 'detail', 0, 0.55, 0.9, 0.08, 0.05, 0.006, 6, 2, PLATE, 6);
    cyl(vb, 'detail', 'y', 0, 0.3, -0.72, 0.022, 0.022, 0.3, 6, DARK);                                                   // the fork
    if (q < 2) cyl(vb, 'chrome', 'z', 0.12, 0.28, 0.62, 0.025, 0.03, 0.3, 6, CHROME);                                    // exhaust
    void mods;
  }

  // --------------------------------------------------------------- wheels --
  // around the x axis, symmetric (one geometry serves both sides): a rounded tyre with tread and sidewall, a rim lip,
  // spokes per style, a brake disc and caliper behind them, a centre cap and lug nuts
  function wheelGeo(cls, wr, ww, style, q) {
    var vb = new VB(), g = 'paint';
    var segs = [20, 12, 8][q], rimR = wr * (cls === 'bike' || cls === 'truck' || cls === 'bus' ? 0.62 : style === 5 ? 0.6 : 0.68), hw = ww / 2;
    var tread = [0.05, 0.05, 0.055], side = [0.1, 0.1, 0.11];
    // the tyre: a lathe of a rounded profile [r, x]
    var prof = q < 2 ? [[rimR, hw * 0.92], [rimR + (wr - rimR) * 0.45, hw * 1.02], [wr * 0.985, hw * 0.92], [wr, hw * 0.65], [wr, 0]] : [[rimR, hw * 0.95], [wr * 0.97, hw], [wr, 0]];
    var full = prof.concat(prof.slice(0, -1).reverse().map(function (p) { return [p[0], -p[1]]; }));
    var base = vb.g[g].cnt, n = full.length, i, j;
    for (i = 0; i <= segs; i++) {
      var a = i / segs * TAU, ca = Math.cos(a), sa = Math.sin(a);
      for (j = 0; j < n; j++) {
        var r = full[j][0], x = full[j][1];
        var pj = full[Math.max(0, j - 1)], nj = full[Math.min(n - 1, j + 1)], dr = nj[0] - pj[0], dx = nj[1] - pj[1];
        var nr = -dx, nx = dr, l = Math.sqrt(nr * nr + nx * nx) || 1; nr /= l; nx /= l;
        if (nr < 0) { nr = -nr; nx = -nx; }
        var col = Math.abs(x) < hw * 0.8 && r > wr * 0.95 ? ((q === 0 && (i % 2)) ? [0.035, 0.035, 0.04] : tread) : side;
        vb.vert(g, x, ca * r, sa * r, nx, ca * nr, sa * nr, col);
      }
    }
    for (i = 0; i < segs; i++) for (j = 0; j < n - 1; j++) { var p0 = base + i * n + j, p1 = p0 + n; vb.g[g].ix.push(p0, p1, p1 + 1, p0, p1 + 1, p0 + 1); }
    // the rim face per side: a dark barrel disc, flat spokes (or a pressed steel disc), a centre cap
    var rimC = style === 3 ? [0.92, 0.93, 0.96] : style === 4 ? [0.18, 0.18, 0.2] : style === 5 ? [0.1, 0.1, 0.11] : (cls === 'van' || cls === 'truck' || cls === 'bus' || cls === 'taxi') && !style ? [0.62, 0.63, 0.66] : cls === 'cop' && !style ? [0.12, 0.12, 0.13] : [0.75, 0.76, 0.8];
    var face = hw * 0.8, nsp = cls === 'bike' ? 5 : style === 1 ? 10 : style === 2 ? 14 : style === 3 ? 8 : style === 4 ? 12 : style === 5 ? 6 : (cls === 'sports' ? 10 : cls === 'suv' ? 6 : cls === 'sedan' ? 5 : 0);
    if (q === 2) nsp = Math.min(nsp, 5);
    function facing(a, b, c, d, col, dir) {
      var ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * dir[0] + ny * dir[1] + nz * dir[2] >= 0) vb.quad(g, a, b, c, d, col); else vb.quad(g, a, d, c, b, col);
    }
    [-1, 1].forEach(function (s) {
      var fx = s * face, bx = s * (face - 0.03);
      cyl(vb, g, 'x', s * (face - 0.035), 0, 0, rimR * 0.97, rimR * 0.97, 0.02, segs, [0.05, 0.05, 0.06], false);   // the barrel behind the spokes
      if (q === 0) torus(vb, g, 'x', fx, 0, 0, rimR * 0.97, 0.011, segs, 3, rimC);                                     // the rim lip
      if (q === 0 && (cls === 'sports' || style === 2 || style === 3)) blob(vb, g, s * (face - 0.05), rimR * 0.55, rimR * 0.3, 0.02, 0.05, 0.035, 6, 3, cls === 'sports' ? [0.8, 0.12, 0.1] : [0.85, 0.75, 0.2], 2);   // caliper
      if (nsp) {
        var ri = rimR * 0.22, ro = rimR * 0.94, w0 = style === 2 ? 0.006 : nsp >= 10 ? 0.011 : style === 5 ? 0.04 : 0.024, w1 = style === 2 ? 0.006 : nsp >= 10 ? 0.009 : style === 5 ? 0.05 : 0.016;
        for (var k = 0; k < nsp; k++) {
          var a0 = k / nsp * TAU, twist = style === 4 ? 0.45 : 0, cA = Math.cos(a0), sA = Math.sin(a0), cB = Math.cos(a0 + twist), sB = Math.sin(a0 + twist);
          var dish = 0.012;   // the spoke sits proud at the hub, back at the rim
          var il = [fx + s * dish, cA * ri - sA * w0, sA * ri + cA * w0], ir = [fx + s * dish, cA * ri + sA * w0, sA * ri - cA * w0];
          var ol = [fx, cB * ro - sB * w1, sB * ro + cB * w1], or = [fx, cB * ro + sB * w1, sB * ro - cB * w1];
          facing(il, ir, or, ol, rimC, [s, 0, 0]);
          if (q < 2) {
            var ilb = [bx, il[1], il[2]], olb = [bx, ol[1], ol[2]], irb = [bx, ir[1], ir[2]], orb = [bx, or[1], or[2]], sh = [rimC[0] * 0.6, rimC[1] * 0.6, rimC[2] * 0.6];
            facing(il, ol, olb, ilb, sh, [0, -sA, cA]);
            facing(ir, irb, orb, or, sh, [0, sA, -cA]);
          }
        }
      } else {
        cyl(vb, g, 'x', s * (face - 0.012), 0, 0, rimR * 0.92, rimR * 0.92, 0.012, segs, rimC);
        if (q === 0) for (var hk = 0; hk < 6; hk++) { var ha = hk / 6 * TAU; blob(vb, g, s * (face - 0.004), Math.cos(ha) * rimR * 0.6, Math.sin(ha) * rimR * 0.6, 0.004, 0.032, 0.032, 6, 3, [0.08, 0.08, 0.09], 2); }
      }
      blob(vb, g, s * (face + 0.006), 0, 0, 0.016, rimR * 0.24, rimR * 0.24, q ? 6 : 10, q ? 2 : 3, style === 4 ? [0.8, 0.12, 0.2] : nsp ? [0.3, 0.3, 0.33] : [0.75, 0.76, 0.8], 2);   // the centre cap
    });
    return vb.build();
  }

  // ------------------------------------------------------------- the record --
  var CACHE = {}, stats = { built: 0 };
  function normMods(mods) {
    mods = mods || {};
    var p = mods.paint || {}, tint = U.clamp(mods.tint | 0, 0, 3);
    return { wheels: U.clamp(mods.wheels | 0, 0, 5), spoiler: mods.spoiler == null ? null : U.clamp(mods.spoiler | 0, 0, 3), tint: tint, secondary: p.secondary ? hex3(p.secondary) : null, finish: p.finish || null, primary: p.primary || null,
      tintC: [[0.55, 0.62, 0.7], [0.32, 0.36, 0.42], [0.16, 0.18, 0.22], [0.06, 0.06, 0.08]][tint] };
  }
  // '' for no mods and for all-default mods, so a car with mods {} shares the base record
  function modsKey(m) {
    if (!m) return '';
    var sec = m.paint && m.paint.secondary || '';
    if (!(m.wheels | 0) && m.spoiler == null && !(m.tint | 0) && !sec) return '';
    return [m.wheels | 0, m.spoiler == null ? '-' : m.spoiler, m.tint | 0, sec].join(',');
  }
  // modded records unused for MOD_TTL seconds of game time leave the cache and free their buffers (a car still holding
  // one re-uploads it on its next draw); the nine base records stay
  var MOD_TTL = 120;
  function gameT() { return GTP.game && GTP.game.time ? GTP.game.time.t : 0; }
  function sweepCache() {
    var now = gameT();
    for (var k in CACHE) {
      var r = CACHE[k];
      if (r.modsKey && now - (r.usedT || 0) > MOD_TTL) { r.lods.forEach(function (g) { g.dispose(); }); r.wheelLods.forEach(function (g) { g.dispose(); }); delete CACHE[k]; }
    }
  }
  function vehicleGeometry(cls, wrap, mods) {
    var key = cls + (wrap ? ':' + wrap : '') + '|' + modsKey(mods);
    if (CACHE[key]) { CACHE[key].usedT = gameT(); return CACHE[key]; }
    var spec = C.VEHICLES[cls];
    if (!spec) { if (A.vehicleGeometryV02 && cls !== 'sedan') { var v2 = A.vehicleGeometryV02(cls, wrap); if (v2) return v2; } cls = 'sedan'; spec = C.VEHICLES.sedan; }
    var M = normMods(mods), L = spec.length, Wd = spec.width, H = spec.height, wr = spec.wheelRadius, hl = L / 2, hw = Wd / 2;
    var ww = cls === 'bike' ? 0.1 : (cls === 'truck' || cls === 'bus') ? 0.3 : cls === 'suv' ? 0.26 : cls === 'sports' ? 0.25 : 0.22;
    var wx = cls === 'bike' ? 0 : hw - ww * 0.5 + 0.02, fz = -(hl - L * 0.2), bz = hl - L * 0.2;
    var wheelOffsets;
    if (cls === 'bike') wheelOffsets = [{ x: 0, z: -0.72, steer: true }, { x: 0, z: 0.72, steer: false }];
    else if (cls === 'truck') wheelOffsets = [{ x: -wx, z: -hl + 1.0, steer: true }, { x: wx, z: -hl + 1.0, steer: true }, { x: -wx, z: hl - 1.0, steer: false }, { x: wx, z: hl - 1.0, steer: false }, { x: -wx, z: hl - 2.3, steer: false }, { x: wx, z: hl - 2.3, steer: false }];
    else if (cls === 'bus') wheelOffsets = [{ x: -wx, z: -hl + 1.7, steer: true }, { x: wx, z: -hl + 1.7, steer: true }, { x: -wx, z: hl - 2.4, steer: false }, { x: wx, z: hl - 2.4, steer: false }];
    else wheelOffsets = [{ x: -wx, z: fz, steer: true }, { x: wx, z: fz, steer: true }, { x: -wx, z: bz, steer: false }, { x: wx, z: bz, steer: false }];
    var axles = []; wheelOffsets.forEach(function (o) { if (axles.indexOf(o.z) < 0) axles.push(o.z); });
    var dims = { L: L, W: Wd, H: H, wr: wr, axles: axles };
    var lods = [], info = null;
    for (var q = 0; q < 3; q++) {
      var vb = new VB(), B = {};
      if (cls === 'bike') { scooter(vb, q, M); B.seats = [{ x: 0, y: 0.88, z: 0.25 }]; B.bars = { x: 0, y: 1.04, z: -0.8 }; }
      else {
        var sp = specFor(cls);
        carBody(vb, cls, sp, dims, q, M, B);
        details(vb, cls, sp, dims, q, M, B);
        if (cls === 'truck') truckBox(vb, dims, q, B);
        if (cls === 'van' && wrap) wrapPanels(vb, dims, B);
      }
      var geo = vb.build(); lods.push(geo);
      if (q === 0) info = B;
    }
    var wheelLods = [0, 1, 2].map(function (k) { return wheelGeo(cls, wr, ww, M.wheels, k); });
    var ly = cls === 'bike' ? 0.78 : cls === 'truck' ? 0.82 : cls === 'bus' ? 0.75 : 0.62;
    var eyeZ = info.seats ? info.seats[0].z - 0.1 : -hl * 0.2, eyeY = info.seats ? Math.min(H - 0.12, info.seats[0].y + 0.72) : H * 0.82;
    var rec = CACHE[key] = {
      body: lods[0], groups: A.GROUPS || { paint: 0, detail: 1, glass: 2, head: 3, tail: 4, barRed: 5, barBlue: 6, wrap: 7, chrome: 8 }, wheel: wheelLods[0], wheelRadius: wr, wheelWidth: ww, wheelOffsets: wheelOffsets,
      lightPoints: { headL: { x: -hw + 0.3, y: ly, z: -hl }, headR: { x: hw - 0.3, y: ly, z: -hl }, head: { x: 0, y: ly, z: -hl }, tailL: { x: -hw + 0.3, y: ly, z: hl }, tailR: { x: hw - 0.3, y: ly, z: hl }, roof: { x: 0, y: H + 0.1, z: 0 }, eye: { x: cls === 'bike' ? 0 : (info.seats ? info.seats[0].x : -0.4), y: eyeY, z: eyeZ } },
      doorPoints: [{ x: -(hw + 0.7), z: -hl * 0.15, seat: 0 }, { x: hw + 0.7, z: -hl * 0.15, seat: 1 }],
      size: { length: L, width: Wd, height: H }, wrap: wrap || null,
      lods: lods, wheelLods: wheelLods, seats: info.seats || null, wheelPoint: info.wheelPoint || null, bars: info.bars || null,
      mods: M, modsKey: modsKey(mods), finish: M.finish, models: true, usedT: gameT(), tris: lods.map(function (g) { return g.userData.tris; })
    };
    stats.built++;
    return rec;
  }

  // ---------------------------------------------- live mesh: LOD and mods --
  var FINISH = { gloss: { roughness: 0.22, metalness: 0.35 }, metallic: { roughness: 0.3, metalness: 0.8 }, matte: { roughness: 0.85, metalness: 0.05 }, chrome: { roughness: 0.06, metalness: 1.0 } };
  function applyFinish(mat, f, primary) {
    if (!mat) return;
    var F = FINISH[f]; if (F) { mat.roughness = F.roughness; mat.metalness = F.metalness; if (mat.clearcoat != null) mat.clearcoat = f === 'matte' ? 0 : 1; if (f === 'chrome') mat.color.setRGB(0.85, 0.86, 0.9); }
    if (primary && f !== 'chrome') mat.color.set(primary);
  }
  var sweepN = 0;
  function syncVehicle(v, m, ud) {
    var body = ud._body || (ud._body = m.getObjectByName('body')); if (!body || !ud.rec) return;
    var mk = modsKey(v.mods);
    if (ud.rec.models && ud.rec.modsKey !== mk) {
      var rec = vehicleGeometry(v.type || 'sedan', v.wrap, v.mods);
      if (rec.models) { ud.rec = rec; ud.lodI = -1; }
    }
    if (ud.rec.modsKey) ud.rec.usedT = gameT();
    if (!ud._paint0 && ud.paint) {
      // the default paint, toned down from v0.2's mirror-like metallic; kept to restore when mods.paint goes away
      ud._paint0 = { metalness: Math.min(ud.paint.metalness, 0.28), roughness: Math.max(ud.paint.roughness, 0.36), clearcoat: ud.paint.clearcoat, color: ud.paint.color.getHex() };
      ud.paint.metalness = ud._paint0.metalness; ud.paint.roughness = ud._paint0.roughness;
    }
    var pk = v.mods && v.mods.paint ? (v.mods.paint.finish || '') + '|' + (v.mods.paint.primary || '') : '';
    if (ud.paint && ud._finishKey !== pk) {
      ud._finishKey = pk;
      var P0 = ud._paint0; ud.paint.metalness = P0.metalness; ud.paint.roughness = P0.roughness; if (P0.clearcoat != null) ud.paint.clearcoat = P0.clearcoat; ud.paint.color.setHex(P0.color);
      if (pk) applyFinish(ud.paint, v.mods.paint.finish, v.mods.paint.primary);
    }
    if (++sweepN % 600 === 0) sweepCache();
    var r = ud.rec; if (!r.lods) return;
    var cam = GTP.Render && GTP.Render.camera, d = 0;
    if (cam) { var dx = v.x - cam.position.x, dz = v.z - cam.position.z; d = Math.sqrt(dx * dx + dz * dz); }
    var i = d < GTP.Models.VLOD_NEAR ? 0 : d < GTP.Models.VLOD_MID ? 1 : 2;
    if (ud.lodI === i) return;
    if (ud.lodI != null && ud.lodI >= 0 && Math.abs(i - ud.lodI) === 1) { var lim = ud.lodI < i ? (i === 1 ? GTP.Models.VLOD_NEAR : GTP.Models.VLOD_MID) + 4 : (i === 0 ? GTP.Models.VLOD_NEAR : GTP.Models.VLOD_MID) - 4; if ((ud.lodI < i && d < lim) || (ud.lodI > i && d > lim)) return; }
    ud.lodI = i;
    body.geometry = r.lods[i]; body.castShadow = i < 2;
    if (ud.wheels) { ud.wheels.geometry = r.wheelLods[i]; ud.wheels.castShadow = i < 1; }
  }

  A.vehicleGeometryV02 = A.vehicleGeometry;
  A.vehicleGeometry = vehicleGeometry;
  var Mo = GTP.Models = GTP.Models || {};
  Mo.vehicleGeometry = vehicleGeometry;
  Mo.syncVehicle = syncVehicle;
  Mo.vehicleStats = function () { return { built: stats.built }; };
  Mo.VLOD_NEAR = 22; Mo.VLOD_MID = 55;
  Mo.normMods = normMods; Mo.modsKey = modsKey;
  Mo.wheelGeometry = wheelGeo;
})();
