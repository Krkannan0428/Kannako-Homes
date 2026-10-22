/* 13_interiors.js: the v0.3 interiors track (PLAN_V03.md "interiors"): walk-in rooms built from primitives far west of the
 * city (x around -4000), entered through shop doors with a fade, with their own floor, walls and ceiling for collision.
 *
 *   GTP.Interiors.enter(id, opts) -> bool   id: a template ('armory' | 'clothing' | 'barber' | 'safehouse'), a landmark id
 *                                           ('both_sides_port'), a landmark kind ('gunshop') or a landmark object.
 *                                           opts: {landmark, store, branch, door:{x, z, y, yaw}, instant}
 *   GTP.Interiors.exit(opts) -> bool        back out to the door the player came in by ({instant})
 *   GTP.Interiors.active / current          bool / {id, kind, store, branch, landmark, room} while inside
 *   GTP.Interiors.update(dt)                ticked from the wrapped GTP.Combat.update (Game.step has no interiors hook yet)
 *   GTP.Interiors.range                     the shooting range state {running, t, score, best, medal, hits, shots}
 *   GTP.Interiors.medalFor(score)           'gold' | 'silver' | 'bronze' | null
 *   GTP.Interiors.autoDoors                 true: walking into the door of a gunshop / clothing / barber / safehouse landmark
 *                                           enters (off by itself when GTP.World.doors / doorMarkers exist: the world track's markers)
 *
 * Events: interior:fade {phase:'out'|'in'}, interior:enter {id, kind, store, branch, landmark}, interior:exit {id, store},
 * armory:inspect {weaponId, itemId, name, price, store}, range:start {store}, range:hit {points, zone, score},
 * range:end {score, medal, hits, shots, best}, clothing:open {store, wardrobe}, barber:open {store}, interior:prompt {text}.
 *
 * Wrappers installed from this file (see docs/v03/interiors.md): GTP.World.heightAt / solidAt / resolveCapsule /
 * raycastBuildings / tileAt (inside a room's bounds only), GTP.Combat.fire (no shooting in the shops; range scoring),
 * GTP.Combat.update (the tick), GTP.Render.updateEnvironment (indoor light while inside). Visual randomness uses its own
 * GTP.makeRng stream so the game's GTP.rng sequence never changes.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var U = GTP.util, GB = GTP.GeoBuilder;
  var FAR_X = -3000, BASE_X = -4000, SLOT_Z = 160, MAX_LIGHTS = 6;
  var vr = GTP.makeRng ? GTP.makeRng(0x13A7E5) : null;           // visuals only
  function rnd() { return vr ? vr.random() : 0.5; }

  function W() { return GTP.World; }
  function Rd() { return GTP.Render; }
  function game() { return GTP.game; }
  function player() { return GTP.game && GTP.game.player; }
  function emit(n, p) { if (GTP.Events) GTP.Events.emit(n, p); }
  function report(e, where) { if (U && U.reportError) U.reportError(e, 'interiors.' + where); }
  function toast(t) { if (GTP.UI && GTP.UI.toast) { try { GTP.UI.toast(t); } catch (e) { /* optional */ } } }
  function In() { return GTP.Input; }
  function pressed(a) { var I = In(); return !!(I && I.pressed && I.pressed(a)); }
  // vertex colours are linear: '#rrggbb' (sRGB) is converted, so a dark counter stays dark under the ACES curve
  function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function col(hex) { var n = parseInt(hex.slice(1), 16); return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)]; }
  function scaleCol(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }

  // ------------------------------------------------------------------ lines --
  // Merle Firmness (GDD_EXPANSION 2.4) and the other rooms' staff; the shop barks in Content.expansion.shop win when present
  var LINES = {
    merleHello: ['Both Sides Arms. Which side?', 'Browse the wall. Everything on it is for sale, including the wall.', 'Look with your eyes. Point with your wallet.'],
    merleMuzzle: ['Muzzle down. This is a store.', 'Not in the store. The range is out back.', 'You shoot in here, you buy the drywall.'],
    merleRange: ['Lane two. Hecklers pop up, you pop them back.', 'The head\'s where the take is.', 'Don\'t shoot the moderator. He bills by the hour.'],
    merleGold: 'Gold. Both sides are impressed.',
    merleNone: 'Cardboard won that one. It happens.',
    clothingHello: ['Lanyard & Co. Dress for the panel you want.', 'Mirrors on the left. They are honest. We are not.'],
    barberHello: ['Clip Joint. Sit down, the chair does the talking.', 'A fresh fade reads as a fresh take.'],
    safeHello: ['Home. The bed saves. The wardrobe judges.']
  };
  function shopBarks(kind) { var X = GTP.Content && GTP.Content.expansion && GTP.Content.expansion.shop; return X && X.barks && X.barks[kind]; }
  function pickLine(list) { return list && list.length ? list[Math.floor(rnd() * list.length)] : ''; }

  // --------------------------------------------------------------- textures --
  var texCache = {};
  function canvasTex(key, w, h, draw, repeat) {
    if (texCache[key]) return texCache[key];
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d'); draw(ctx, w, h);
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.userData = { canvas: cv, ctx: ctx };
    return (texCache[key] = t);
  }
  function speckle(ctx, w, h, n, amt) {
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = (rnd() > 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (amt * rnd()).toFixed(3) + ')';
      ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
    }
  }
  var TX = {
    tiles: function (key, a, b, grout, n) {
      return canvasTex('tiles:' + key, 512, 512, function (c, w) {
        var s = w / n; c.fillStyle = grout; c.fillRect(0, 0, w, w);
        for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
          c.fillStyle = (i + j) % 2 ? a : b; c.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
          var g = c.createLinearGradient(i * s, j * s, i * s + s, j * s + s); g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0.06)');
          c.fillStyle = g; c.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
        }
        speckle(c, w, w, 2600, 0.08);
      }, true);
    },
    concrete: function (key, base) {
      return canvasTex('concrete:' + key, 512, 512, function (c, w) {
        c.fillStyle = base; c.fillRect(0, 0, w, w); speckle(c, w, w, 9000, 0.1);
        for (var i = 0; i < 14; i++) { c.fillStyle = 'rgba(0,0,0,' + (0.03 + rnd() * 0.05).toFixed(3) + ')'; c.beginPath(); c.arc(rnd() * w, rnd() * w, 20 + rnd() * 60, 0, Math.PI * 2); c.fill(); }
        c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2; c.strokeRect(0, 0, w, w);
      }, true);
    },
    plaster: function (key, base) {
      return canvasTex('plaster:' + key, 256, 256, function (c, w) { c.fillStyle = base; c.fillRect(0, 0, w, w); speckle(c, w, w, 3000, 0.05); }, true);
    },
    pegboard: function (key, base, hole) {
      return canvasTex('peg:' + key, 256, 256, function (c, w) {
        c.fillStyle = base; c.fillRect(0, 0, w, w); speckle(c, w, w, 1800, 0.06);
        c.fillStyle = hole; for (var i = 0; i < 16; i++) for (var j = 0; j < 16; j++) { c.beginPath(); c.arc(8 + i * 16, 8 + j * 16, 2.4, 0, Math.PI * 2); c.fill(); }
      }, true);
    },
    wood: function (key, base, dark) {
      return canvasTex('wood:' + key, 256, 256, function (c, w) {
        c.fillStyle = base; c.fillRect(0, 0, w, w);
        for (var p = 0; p < 4; p++) {
          var x0 = p * 64; c.fillStyle = dark; c.fillRect(x0, 0, 2, w);
          for (var k = 0; k < 18; k++) { c.strokeStyle = 'rgba(0,0,0,' + (0.05 + rnd() * 0.1).toFixed(3) + ')'; c.lineWidth = 1 + rnd(); c.beginPath(); var gx = x0 + 4 + rnd() * 56; c.moveTo(gx, 0); c.bezierCurveTo(gx + rnd() * 8 - 4, w * 0.3, gx + rnd() * 8 - 4, w * 0.7, gx + rnd() * 6 - 3, w); c.stroke(); }
        }
      }, true);
    },
    foam: function (key) {
      return canvasTex('foam:' + key, 256, 256, function (c, w) {
        var s = 32; for (var i = 0; i < 8; i++) for (var j = 0; j < 8; j++) {
          var x = i * s, y = j * s, g = c.createLinearGradient(x, y, x + s, y + s); g.addColorStop(0, '#45474d'); g.addColorStop(1, '#1d1e22');
          c.fillStyle = g; c.fillRect(x, y, s, s); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
        }
      }, true);
    },
    ceiling: function (key, base) {
      return canvasTex('ceil:' + key, 256, 256, function (c, w) {
        c.fillStyle = base; c.fillRect(0, 0, w, w); speckle(c, w, w, 2500, 0.07);
        c.strokeStyle = 'rgba(70,70,74,0.55)'; c.lineWidth = 4; c.strokeRect(0, 0, w, w); c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, w); c.moveTo(0, w / 2); c.lineTo(w, w / 2); c.stroke();
      }, true);
    },
    brick: function (key, base) {
      return canvasTex('brick:' + key, 256, 256, function (c, w) {
        c.fillStyle = '#6f6458'; c.fillRect(0, 0, w, w);
        var bh = 16, bw = 48; for (var r = 0; r < w / bh; r++) for (var k = -1; k < w / bw + 1; k++) {
          var x = k * bw + (r % 2 ? bw / 2 : 0); var sh = 0.85 + rnd() * 0.3, nn = parseInt(base.slice(1), 16), cc = [((nn >> 16) & 255) / 255, ((nn >> 8) & 255) / 255, (nn & 255) / 255];
          c.fillStyle = 'rgb(' + Math.round(cc[0] * 255 * sh) + ',' + Math.round(cc[1] * 255 * sh) + ',' + Math.round(cc[2] * 255 * sh) + ')'; c.fillRect(x + 1.5, r * bh + 1.5, bw - 3, bh - 3);
        }
        speckle(c, w, w, 2400, 0.08);
      }, true);
    },
    carpet: function (key, base, line) {
      return canvasTex('carpet:' + key, 256, 256, function (c, w) {
        c.fillStyle = base; c.fillRect(0, 0, w, w); speckle(c, w, w, 12000, 0.1);
        if (line) { c.strokeStyle = line; c.lineWidth = 6; c.strokeRect(12, 12, w - 24, w - 24); }
      }, true);
    }
  };
  // a sign: text on a panel; opts {w, h, bg, fg, font, sub, subColor, neon, border, align}
  function signTex(key, text, o) {
    o = o || {};
    return canvasTex('sign:' + key, o.w || 1024, o.h || 256, function (c, w, h) {
      if (o.bg) { c.fillStyle = o.bg; c.fillRect(0, 0, w, h); } else c.clearRect(0, 0, w, h);
      if (o.border) { c.strokeStyle = o.border; c.lineWidth = Math.max(4, h * 0.04); c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, w - c.lineWidth, h - c.lineWidth); }
      c.textAlign = 'center'; c.textBaseline = 'middle';
      var fs = o.size || Math.round(h * (o.sub ? 0.46 : 0.6));
      c.font = (o.weight || '900') + ' ' + fs + 'px ' + (o.font || '"Arial Black", Impact, Arial, sans-serif');
      if (o.neon) { c.shadowColor = o.fg; c.shadowBlur = h * 0.12; }
      c.fillStyle = o.fg || '#ffffff';
      c.fillText(text, w / 2, o.sub ? h * 0.38 : h / 2, w * 0.94);
      if (o.neon) { c.shadowBlur = h * 0.05; c.fillText(text, w / 2, o.sub ? h * 0.38 : h / 2, w * 0.94); }
      if (o.sub) { c.shadowBlur = 0; c.font = '700 ' + Math.round(h * 0.2) + 'px Arial, sans-serif'; c.fillStyle = o.subColor || o.fg || '#fff'; c.fillText(o.sub, w / 2, h * 0.78, w * 0.94); }
    });
  }
  function posterTex(key, title, line, bg, fg, accent) {
    return canvasTex('poster:' + key, 256, 384, function (c, w, h) {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.fillStyle = accent; c.beginPath(); c.arc(w / 2, h * 0.42, w * 0.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = bg; c.beginPath(); c.arc(w / 2, h * 0.42, w * 0.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = accent; c.beginPath(); c.arc(w / 2, h * 0.42, w * 0.1, 0, Math.PI * 2); c.fill();
      c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '900 34px "Arial Black", Impact, sans-serif'; c.fillText(title, w / 2, h * 0.12, w * 0.9);
      c.font = '700 20px Arial, sans-serif'; var words = line.split(' '), ln = '', y = h * 0.78;
      for (var i = 0; i < words.length; i++) { var t = ln ? ln + ' ' + words[i] : words[i]; if (c.measureText(t).width > w * 0.86) { c.fillText(ln, w / 2, y); ln = words[i]; y += 24; } else ln = t; }
      c.fillText(ln, w / 2, y);
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    });
  }
  function tagTex(name, price) {
    return canvasTex('tag:' + name + ':' + price, 256, 80, function (c, w, h) {
      c.fillStyle = '#f2efe4'; c.fillRect(0, 0, w, h); c.fillStyle = '#d23a2a'; c.fillRect(0, 0, 12, h);
      c.fillStyle = '#1a1a1a'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.font = '700 26px Arial, sans-serif'; c.fillText(String(name).toUpperCase(), 22, 26, w - 30);
      c.font = '900 30px "Arial Black", Arial, sans-serif'; c.fillStyle = '#2f8a4f'; c.fillText(price > 0 ? '$' + price : 'ASK MERLE', 22, 60, w - 30);
    });
  }
  // the cardboard heckler (CONTENT: GDD_EXPANSION 7) and the moderator: silhouettes with alpha for the range
  function targetTex(kind) {
    return canvasTex('target:' + kind, 256, 512, function (c, w, h) {
      c.clearRect(0, 0, w, h);
      var mod = kind === 'moderator', card = mod ? '#c9d2e0' : '#d6c29a', edge = mod ? '#5a6c8c' : '#8a6a3a';
      c.fillStyle = card; c.strokeStyle = edge; c.lineWidth = 8;
      // head (centre y 0.85 of the board from the bottom = 77 px from the top for a 1.9 m board at 512 px)
      c.beginPath(); c.arc(w / 2, 78, 38, 0, Math.PI * 2); c.fill(); c.stroke();
      // shoulders and body
      c.beginPath(); c.moveTo(w / 2 - 34, 116); c.lineTo(w / 2 + 34, 116); c.lineTo(w / 2 + 78, 150); c.lineTo(w / 2 + 70, 300); c.lineTo(w / 2 + 50, 300);
      c.lineTo(w / 2 + 48, 505); c.lineTo(w / 2 - 48, 505); c.lineTo(w / 2 - 50, 300); c.lineTo(w / 2 - 70, 300); c.lineTo(w / 2 - 78, 150); c.closePath(); c.fill(); c.stroke();
      if (!mod) {
        c.strokeStyle = '#b8392b'; c.lineWidth = 6; [52, 34, 16].forEach(function (r) { c.beginPath(); c.arc(w / 2, 205, r, 0, Math.PI * 2); c.stroke(); });
        c.beginPath(); c.arc(w / 2, 78, 18, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#1a1a1a'; c.font = '900 34px "Arial Black", Impact, sans-serif'; c.textAlign = 'center'; c.fillText('WRONG', w / 2, 300);
        c.fillStyle = '#2a2a2a'; c.fillRect(w / 2 - 20, 70, 12, 6); c.fillRect(w / 2 + 8, 70, 12, 6); c.fillRect(w / 2 - 14, 92, 28, 5);
      } else {
        c.fillStyle = '#2b3550'; c.fillRect(w / 2 - 60, 150, 120, 150); c.fillStyle = '#ffffff'; c.fillRect(w / 2 - 10, 150, 20, 40);
        c.fillStyle = '#f4f0e0'; c.fillRect(w / 2 - 90, 330, 180, 70); c.strokeStyle = '#2b3550'; c.lineWidth = 4; c.strokeRect(w / 2 - 90, 330, 180, 70);
        c.fillStyle = '#c0302a'; c.font = '900 26px "Arial Black", Impact, sans-serif'; c.textAlign = 'center'; c.fillText('MODERATOR', w / 2, 358); c.font = '700 18px Arial'; c.fillText('DON\'T SHOOT', w / 2, 384);
        c.fillStyle = '#2a2a2a'; c.fillRect(w / 2 - 20, 70, 12, 6); c.fillRect(w / 2 + 8, 70, 12, 6); c.fillRect(w / 2 - 12, 94, 24, 4);
      }
    });
  }
  function windowTex(key, night) {
    return canvasTex('window:' + key, 512, 256, function (c, w, h) {
      var g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, night ? '#0b1430' : '#6fa6d8'); g.addColorStop(1, night ? '#2a2350' : '#e8c79a');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (var i = 0; i < 26; i++) {
        var bw = 14 + rnd() * 34, bh = 40 + rnd() * 150, x = rnd() * w; c.fillStyle = night ? '#141626' : '#4a5468'; c.fillRect(x, h - bh, bw, bh);
        for (var k = 0; k < 30; k++) if (rnd() < (night ? 0.45 : 0.2)) { c.fillStyle = night ? '#ffd27a' : '#9fc4e8'; c.fillRect(x + 2 + rnd() * (bw - 6), h - bh + 4 + rnd() * (bh - 8), 3, 4); }
      }
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, 0, w, h * 0.5);
    });
  }
  function outsideTex() {
    return canvasTex('outside', 256, 512, function (c, w, h) {
      var g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d9ecff'); g.addColorStop(0.6, '#f6e6c6'); g.addColorStop(1, '#8c8a86');
      c.fillStyle = g; c.fillRect(0, 0, w, h); speckle(c, w, h, 600, 0.05);
    });
  }

  // -------------------------------------------------------------- materials --
  var M = null, texMats = {};
  function mats() {
    if (M) return M;
    M = {
      matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 }),
      gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05 }),
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.85 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xd8f2f8, transparent: true, opacity: 0.16, roughness: 0.03, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true })
    };
    return M;
  }
  function texMat(tex, o) {
    o = o || {};
    var key = tex.uuid + ':' + (o.rough == null ? 0.8 : o.rough) + ':' + (o.metal || 0) + ':' + (o.emissive ? 1 : 0) + ':' + (o.alpha ? 1 : 0) + ':' + (o.basic ? 1 : 0);
    if (texMats[key]) return texMats[key];
    var m;
    if (o.basic) m = new THREE.MeshBasicMaterial({ map: tex, transparent: !!o.alpha, alphaTest: o.alpha ? 0.4 : 0, side: o.double ? THREE.DoubleSide : THREE.FrontSide });
    else m = new THREE.MeshStandardMaterial({ map: tex, roughness: o.rough == null ? 0.8 : o.rough, metalness: o.metal || 0, transparent: !!o.alpha, alphaTest: o.alpha ? 0.45 : 0, side: o.double ? THREE.DoubleSide : THREE.FrontSide });
    if (o.emissive && m.emissive) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = tex; m.emissiveIntensity = o.emissive; }
    return (texMats[key] = m);
  }

  // ------------------------------------------------------------ room builder --
  function Room(id, kind, branch, ox, oz) {
    this.id = id; this.kind = kind; this.branch = branch; this.ox = ox; this.oz = oz;
    this.group = new THREE.Group(); this.group.name = 'interior:' + id + ':' + branch; this.group.position.set(ox, 0, oz);
    this.g = {}; this.solids = []; this.items = []; this.inter = []; this.zones = {}; this.npcs = []; this.lightDefs = [];
    this.bounds = null; this.spawn = { x: 0, z: 0, yaw: 0 }; this.exitDoor = null; this.range = null;
  }
  Room.prototype.b = function (k) { return this.g[k] || (this.g[k] = new GB({ color: true })); };
  // a coloured box in local coordinates (min corner + size); solid: true | 'noray'
  Room.prototype.box = function (k, x, y, z, w, h, d, c, solid) {
    this.b(k).box(x, y, z, w, h, d, GB.UV0, c);
    if (solid) this.solid(x, y, z, w, h, d, solid === 'noray' ? { ray: false } : null);
  };
  Room.prototype.solid = function (x, y, z, w, h, d, o) {
    this.solids.push({ x0: this.ox + x, y0: y, z0: this.oz + z, x1: this.ox + x + w, y1: y + h, z1: this.oz + z + d, ray: !(o && o.ray === false), col: !(o && o.col === false) });
  };
  Room.prototype.cyl = function (k, x, y, z, r0, r1, h, segs, c) { this.b(k).cylinder(x, y, z, r0, r1, h, segs || 10, c); };
  // a textured plane: face = the direction its front looks ('n' -z, 's' +z, 'e' +x, 'w' -x, 'up', 'down'); ts = metres per texture repeat
  Room.prototype.plane = function (mat, x, y, z, w, h, face, ts) {
    var geo = new THREE.PlaneGeometry(w, h);
    if (ts) { var uv = geo.getAttribute('uv'); for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / ts, uv.getY(i) * h / ts); }
    var m = new THREE.Mesh(geo, mat);
    if (face === 'n') m.rotation.y = Math.PI; else if (face === 'e') m.rotation.y = Math.PI / 2; else if (face === 'w') m.rotation.y = -Math.PI / 2;
    else if (face === 'up') m.rotation.x = -Math.PI / 2; else if (face === 'down') m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z); m.receiveShadow = true;
    this.group.add(m);
    return m;
  };
  Room.prototype.add = function (obj, x, y, z) { obj.position.set(x, y, z); this.group.add(obj); return obj; };
  Room.prototype.light = function (x, y, z, color, intensity, dist, panel) {
    this.lightDefs.push({ x: x, y: y, z: z, color: color, intensity: intensity, dist: dist });
    if (panel !== false) { this.box('glow', x - 0.6, y - 0.05, z - 0.3, 1.2, 0.04, 0.6, [1.7, 1.65, 1.5]); this.box('metal', x - 0.66, y - 0.03, z - 0.36, 1.32, 0.04, 0.72, [0.75, 0.76, 0.78]); }
  };
  Room.prototype.interact = function (o) { o.x += this.ox; o.z += this.oz; this.inter.push(o); return o; };
  Room.prototype.zone = function (name, x0, z0, x1, z1) { this.zones[name] = { x0: this.ox + x0, z0: this.oz + z0, x1: this.ox + x1, z1: this.oz + z1 }; };
  // the shell: floor, ceiling and four inward walls over [x0, x1] x [z0, z1], with collision boxes 0.5 m thick outside it.
  // openings: [{side:'n'|'s'|'e'|'w', a0, a1, h}] (a = x on n/s walls, z on e/w walls)
  Room.prototype.shell = function (x0, z0, x1, z1, h, o) {
    var wallM = o.wall, floorM = o.floor, ceilM = o.ceil, ts = o.ts || 2, op = o.openings || [], self = this;
    this.plane(floorM, (x0 + x1) / 2, 0.002, (z0 + z1) / 2, x1 - x0, z1 - z0, 'up', o.floorTs || 2);
    this.plane(ceilM, (x0 + x1) / 2, h, (z0 + z1) / 2, x1 - x0, z1 - z0, 'down', 1.2);
    this.solid(x0 - 0.5, h, z0 - 0.5, x1 - x0 + 1, 0.5, z1 - z0 + 1);
    this.solid(x0 - 0.5, -0.5, z0 - 0.5, x1 - x0 + 1, 0.5, z1 - z0 + 1, { col: false });
    function side(s, lo, hi, fixed, face) {
      var cuts = op.filter(function (q) { return q.side === s; }).sort(function (a, b) { return a.a0 - b.a0; }), a = lo, segs = [];
      cuts.forEach(function (q) { if (q.a0 > a) segs.push([a, q.a0, 0, h]); segs.push([q.a0, q.a1, q.h, h]); a = q.a1; });
      if (a < hi) segs.push([a, hi, 0, h]);
      segs.forEach(function (sg) {
        var len = sg[1] - sg[0], mid = (sg[0] + sg[1]) / 2, hh = sg[3] - sg[2]; if (len <= 0.001 || hh <= 0.001) return;
        var ym = (sg[2] + sg[3]) / 2;
        if (s === 'n' || s === 's') {
          self.plane(wallM, mid, ym, fixed, len, hh, face, ts);
          self.solid(sg[0], sg[2], s === 'n' ? fixed - 0.5 : fixed, len, hh, 0.5);
        } else {
          self.plane(wallM, fixed, ym, mid, len, hh, face, ts);
          self.solid(s === 'w' ? fixed - 0.5 : fixed, sg[2], sg[0], 0.5, hh, len);
        }
      });
    }
    side('n', x0, x1, z0, 's'); side('s', x0, x1, z1, 'n'); side('w', z0, z1, x0, 'e'); side('e', z0, z1, x1, 'w');
    // skirting and a top trim strip
    var sk = o.skirt || [0.12, 0.12, 0.13];
    this.box('gloss', x0, 0, z0, x1 - x0, 0.12, 0.03, sk); this.box('gloss', x0, 0, z1 - 0.03, x1 - x0, 0.12, 0.03, sk);
    this.box('gloss', x0, 0, z0, 0.03, 0.12, z1 - z0, sk); this.box('gloss', x1 - 0.03, 0, z0, 0.03, 0.12, z1 - z0, sk);
  };
  Room.prototype.finish = function () {
    var MM = mats();
    for (var k in this.g) {
      if (!this.g[k].count()) continue;
      var mesh = new THREE.Mesh(this.g[k].build(), MM[k]); mesh.name = 'interior:' + k;
      mesh.receiveShadow = k !== 'glow'; mesh.castShadow = k === 'matte' || k === 'metal';
      if (k === 'glass') mesh.renderOrder = 2;
      this.group.add(mesh);
    }
    this.g = {};
    // the lights: a few point lights over the room plus a soft hemisphere fill (added to the scene only while inside)
    // a handful of lights at most (every light is paid per pixel and per shader): the panels stay, nearby lights merge
    var defs = this.lightDefs.map(function (d) { return Object.assign({}, d); });
    while (defs.length > MAX_LIGHTS) {
      var bi = 0, bj = 1, bd = 1e9;
      for (var a = 0; a < defs.length; a++) for (var c = a + 1; c < defs.length; c++) { var dd = (defs[a].x - defs[c].x) * (defs[a].x - defs[c].x) + (defs[a].z - defs[c].z) * (defs[a].z - defs[c].z); if (dd < bd) { bd = dd; bi = a; bj = c; } }
      var A = defs[bi], Bq = defs[bj], wa = A.intensity || 1, wb = Bq.intensity || 1;
      A.x = (A.x * wa + Bq.x * wb) / (wa + wb); A.z = (A.z * wa + Bq.z * wb) / (wa + wb); A.y = Math.max(A.y, Bq.y);
      A.intensity = (wa + wb) * 0.72; A.dist = Math.max(A.dist || 12, Bq.dist || 12) + Math.sqrt(bd) * 0.6;
      defs.splice(bj, 1);
    }
    this.lightCount = defs.length;
    for (var i = 0; i < defs.length; i++) {
      var L = defs[i], pl = new THREE.PointLight(L.color || 0xfff1dc, L.intensity || 1, L.dist || 14, 1.4);
      pl.position.set(L.x, L.y - 0.15, L.z); pl.name = 'interior:light'; this.group.add(pl);
    }
    var hemi = new THREE.HemisphereLight(0xfff6e8, 0x40362c, this.fill || 0.55); hemi.name = 'interior:fill'; this.group.add(hemi);
    this.group.updateMatrixWorld(true);
    var box = new THREE.Box3();
    for (i = 0; i < this.items.length; i++) {
      var it = this.items[i]; box.setFromObject(it.mesh); box.expandByScalar(0.06);
      it.box = { x0: box.min.x, y0: box.min.y, z0: box.min.z, x1: box.max.x, y1: box.max.y, z1: box.max.z };
      it.x = (box.min.x + box.max.x) / 2; it.y = (box.min.y + box.max.y) / 2; it.z = (box.min.z + box.max.z) / 2;
    }
    var b = this.bounds; this.bounds = { x0: this.ox + b.x0, z0: this.oz + b.z0, x1: this.ox + b.x1, z1: this.oz + b.z1 };
  };
  Room.prototype.worldPoint = function (x, z) { return { x: this.ox + x, z: this.oz + z }; };

  // ---------------------------------------------------------- the weapons --
  var CLASS_MESH = { pistol: 'pistol', handgun: 'pistol', revolver: 'revolver', smg: 'smg', pdw: 'smg', machine_pistol: 'smg', rifle: 'rifle', assault: 'rifle', ar: 'rifle', carbine: 'rifle', lmg: 'rifle', mg: 'rifle',
    shotgun: 'shotgun', sniper: 'sniper', marksman: 'sniper', dmr: 'sniper', heavy: 'ratio', launcher: 'ratio', rocket: 'ratio', melee: 'tableleg', thrown: 'hottake', throwable: 'hottake', explosive: 'hotmic' };
  var LONG = { rifle: 1, shotgun: 1, sniper: 1, ratio: 1, tableleg: 1 };
  function weaponMesh(id, cls) {
    var A = GTP.Assets, m = null;
    if (A && A.weaponMesh) { try { m = A.weaponMesh(id); } catch (e) { m = null; } }
    if (!m && A && A.weaponMesh) { var alt = CLASS_MESH[String(cls || '').toLowerCase()] || 'pistol'; try { m = A.weaponMesh(alt); } catch (e2) { m = null; } }
    if (!m) { m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: 0x2a2b30, roughness: 0.4, metalness: 0.6 })); m.geometry.translate(0.25, 0, 0); }
    return m;
  }
  function fitFor(id, cls) { var A = GTP.Assets; return A && A.weaponFitFor ? A.weaponFitFor(id, cls) : A && A.weaponFit ? A.weaponFit[id] : null; }
  function weaponLen(id, cls) {
    var f = fitFor(id, cls);
    if (f && f.len) return f.len;
    var k = CLASS_MESH[String(cls || '').toLowerCase()];
    return k && LONG[k] ? 0.9 : 0.3;
  }
  function weaponUpright(id) { var f = fitFor(id); return f ? !!f.upright : (id === 'megaphone' || id === 'hottake' || id === 'hotmic'); }
  // the store's stock: Combat.catalog (v0.3 shop API) first, the v0.2 shop list next, the parity table and Combat's
  // WEAPONS last; each entry {itemId, weaponId, name, price, cls, long, upright}
  function stock(storeId) {
    var CB = GTP.Combat, out = [], seen = {}, i;
    function push(o) { if (!o.weaponId || seen[o.weaponId] || o.weaponId === 'fist') return; seen[o.weaponId] = true; out.push(o); }
    if (CB && typeof CB.catalog === 'function') {
      try { var cat = CB.catalog(storeId) || []; for (i = 0; i < cat.length; i++) { var c = cat[i]; if (c && c.kind === 'weapon') push({ itemId: c.id, weaponId: c.weaponId || c.id, name: c.name, price: c.price | 0, cls: c.class || c.cls || null }); } } catch (e) { report(e, 'catalog'); }
    }
    if (CB && CB.shop && CB.shop.items) {
      try { var it = CB.shop.items('weapons') || []; for (i = 0; i < it.length; i++) push({ itemId: it[i].id, weaponId: it[i].weapon || it[i].id, name: it[i].name, price: it[i].listPrice || it[i].price | 0, cls: null }); } catch (e) { report(e, 'shopItems'); }
    }
    var P = GTP.Content && GTP.Content.parity && GTP.Content.parity.weapons;
    if (P && P.length) for (i = 0; i < P.length; i++) if (P[i] && P[i].id) push({ itemId: P[i].id, weaponId: P[i].id, name: P[i].name || P[i].id, price: P[i].price | 0, cls: P[i].class || null });
    if (CB && CB.ORDER && CB.WEAPONS) for (i = 0; i < CB.ORDER.length; i++) { var id = CB.ORDER[i], w = CB.WEAPONS[id]; if (w) push({ itemId: id, weaponId: id, name: w.name || id, price: w.price | 0, cls: null }); }
    for (i = 0; i < out.length; i++) {
      var e = out[i], len = weaponLen(e.weaponId, e.cls);
      e.upright = weaponUpright(e.weaponId); e.long = !e.upright && len >= 0.6; e.len = len;
      if (!e.cls && CB && CB.WEAPONS && CB.WEAPONS[e.weaponId]) { var ww = CB.WEAPONS[e.weaponId]; e.cls = ww.melee ? 'melee' : ww.rocket ? 'heavy' : ww.lobbed ? 'thrown' : null; }
    }
    out.sort(function (a, b) { return (a.price || 0) - (b.price || 0); });
    return out;
  }
  // where a stock entry goes in the armory (see buildArmory): by Combat's class, hold and the mesh's fit
  function rackGroup(e) {
    var W2 = GTP.Combat && GTP.Combat.WEAPONS, w = W2 && W2[e.weaponId], cls = w ? w.cls : String(e.cls || '').toLowerCase();
    var f = GTP.Assets && GTP.Assets.weaponFitFor ? GTP.Assets.weaponFitFor(e.weaponId, cls) : null, hold = w && w.hold ? w.hold : f ? f.hold : 'two';
    if ((w && w.melee) || cls === 'melee') return (e.len || 0) >= 0.6 ? 'meleeLong' : 'meleeShort';
    if (cls === 'thrown' || cls === 'explosive' || cls === 'throwable') return 'thrown';
    if (cls === 'special') return 'special';
    if (cls === 'launcher' || cls === 'heavy') return 'heavy';
    if (cls === 'pistol' || hold === 'one') return 'hand';
    if (cls === 'smg' || cls === 'lmg' || cls === 'mg') return 'mg';
    if (cls === 'shotgun') return 'shotgun';
    if (cls === 'sniper' || cls === 'marksman') return 'sniper';
    if (cls === 'rifle') return 'rifle';
    return e.long ? 'rifle' : 'hand';
  }
  // live status of a rack entry for the prompt: {price, owned, locked, lockReason, ammoItem}
  var statusCache = { key: null, t: -9, st: null };
  function itemStatus(entry) {
    var g = game(), now = g && g.time ? g.time.t : 0, key = (entry.itemId || '') + ':' + (entry.weaponId || '');
    if (statusCache.key === key && now - statusCache.t < 0.25 && now >= statusCache.t) return statusCache.st;
    var st = itemStatusNow(entry); statusCache.key = key; statusCache.t = now; statusCache.st = st;
    return st;
  }
  function itemStatusNow(entry) {
    var CB = GTP.Combat, p = player(), st = { price: entry.price, owned: false, locked: false, lockReason: null, ammoItem: null, ammoPrice: 0, ammoName: null };
    if (!entry.weaponId) {   // gear
      if (CB && CB.shop && CB.shop.items) { try { var gl = CB.shop.items(); for (var g = 0; g < gl.length; g++) if (gl[g].id === entry.itemId) { st.price = gl[g].price; st.locked = !!gl[g].locked; st.lockReason = gl[g].lockedBy; } } catch (e) { report(e, 'gearStatus'); } }
      return st;
    }
    var found = false;
    if (CB && typeof CB.catalog === 'function') {
      try {
        var cat = CB.catalog(S.current && S.current.store) || [];
        for (var i = 0; i < cat.length; i++) {
          var c = cat[i]; if (!c) continue;
          if (c.kind === 'weapon' && (c.weaponId || c.id) === entry.weaponId) { found = true; st.price = c.price; st.owned = !!c.owned; st.locked = !!c.locked; st.lockReason = c.lockReason || null; st.itemId = c.id; }
          if (c.kind === 'ammo' && c.weaponId === entry.weaponId && !st.ammoItem) { st.ammoItem = c.id; st.ammoPrice = c.price; st.ammoName = c.name; }
        }
      } catch (e2) { report(e2, 'catalogStatus'); }
    }
    if (!found && CB && CB.shop && CB.shop.items) {
      try {
        var it = CB.shop.items();
        for (i = 0; i < it.length; i++) {
          var x = it[i];
          if (x.tab === 'weapons' && (x.weapon || x.id) === entry.weaponId) { found = true; st.price = x.price; st.owned = !!x.owned; st.locked = !!x.locked; st.lockReason = x.lockedBy || null; st.itemId = x.id; }
          if (x.tab === 'ammo' && x.weapon === entry.weaponId && !st.ammoItem) { st.ammoItem = x.id; st.ammoPrice = x.price; st.ammoName = x.name; }
        }
      } catch (e3) { report(e3, 'shopStatus'); }
    }
    if (!found) { var w = p && p.weapons ? p.weapons[entry.weaponId] : 0; st.owned = w > 0 || w === Infinity; st.unknown = true; }
    return st;
  }
  // the purchase: GTP.Combat.buy (v0.3), else Combat.shop.buy (v0.2). Ammo never grants the weapon (QA CMB-02): an ammo box
  // is only offered for a weapon the player owns.
  function purchase(itemId) {
    var CB = GTP.Combat; if (!CB || !itemId) return { ok: false, reason: 'unknown' };
    try {
      if (typeof CB.buy === 'function') return CB.buy(itemId, { store: S.current && S.current.store, source: 'armory' }) || { ok: false, reason: 'unknown' };
      if (CB.shop && CB.shop.buy) return CB.shop.buy(itemId) || { ok: false, reason: 'unknown' };
    } catch (e) { report(e, 'buy'); }
    return { ok: false, reason: 'unknown' };
  }

  // ------------------------------------------------------------ templates --
  var BRANCHES = {
    strip: { wall: '#2c3038', accent: '#3fd27f', peg: '#3a3e45', pegHole: '#1c1e22', floorA: '#4a4d52', floorB: '#45484d', grout: '#2b2c30', sign: 'BOTH SIDES ARMS', sub: 'WE ARM BOTH SIDES. THAT\'S BALANCE.', counter: '#1e2024', trim: '#3fd27f' },
    port: { wall: '#3a4652', accent: '#ff8a3a', peg: '#4a525a', pegHole: '#20252a', floorA: '#5a5c5e', floorB: '#55585a', grout: '#34363a', sign: 'BOTH SIDES ARMS', sub: 'HARBOR BRANCH: BULK DISCOUNTS ON ROCKETS', counter: '#2a3036', trim: '#ff8a3a', crates: true },
    uptown: { wall: '#4a3020', accent: '#e8b53a', peg: '#5a3a24', pegHole: '#2a1a10', floorA: '#6a4a30', floorB: '#64452c', grout: '#3a2818', sign: 'BOTH SIDES ARMS', sub: 'THE SAME GUNS, IN WALNUT', counter: '#3a2416', trim: '#e8b53a', wood: true }
  };
  function branchOf(lm) {
    var id = lm ? (lm.id || lm) : '';
    if (/port|harbor/.test(id)) return 'port';
    if (/uptown|heights/.test(id)) return 'uptown';
    return 'strip';
  }
  var TEMPLATE_KIND = { gunshop: 'armory', armory: 'armory', clothing: 'clothing', clothes: 'clothing', barber: 'barber', safehouse: 'safehouse', safe: 'safehouse', home: 'safehouse' };
  function templateFor(lm) {
    if (!lm) return null;
    if (TEMPLATE_KIND[lm.kind]) return TEMPLATE_KIND[lm.kind];
    var id = lm.id || '';
    if (/^both_sides/.test(id)) return 'armory';
    if (/^lanyard|clothing/.test(id)) return 'clothing';
    if (/clip_joint|barber/.test(id)) return 'barber';
    if (/^safe_/.test(id)) return 'safehouse';
    return null;
  }
  var SLOT = { armory: 0, clothing: 1, barber: 2, safehouse: 3 };

  // ---- the armory: Both Sides Arms, a GTA-style gun store with a back-room range ----
  function buildArmory(room, branch) {
    var B = BRANCHES[branch] || BRANCHES.strip, A = col(B.accent);
    var wallTex = B.wood ? TX.wood('arm-' + branch, '#5a3a24', '#2e1c10') : TX.plaster('arm-' + branch, B.wall);
    var floorTex = TX.tiles('arm-' + branch, B.floorA, B.floorB, B.grout, 4);
    var wallM = texMat(wallTex, { rough: B.wood ? 0.55 : 0.9 }), floorM = texMat(floorTex, { rough: 0.35, metal: 0.05 }), ceilM = texMat(TX.ceiling('arm', '#d8d6d0'), { rough: 0.95 });
    room.bounds = { x0: -9, z0: -38, x1: 10.5, z1: 7 };
    room.shell(-9, -7, 9, 7, 4.2, { wall: wallM, floor: floorM, ceil: ceilM, ts: B.wood ? 1.6 : 2.5, openings: [{ side: 'n', a0: 5.4, a1: 7.6, h: 2.5 }], skirt: scaleCol(A, 0.5) });
    room.spawn = { x: 0, z: 4.3, yaw: 0 };
    room.zone('store', -9, -7, 9, 7);
    room.fill = 0.5;
    var dark = col(B.counter), steel = col('#8e939c'), black = col('#141518'), trim = col(B.trim), cream = col('#efe9dc');

    // ceiling light rows and the lights
    for (var lx = -6; lx <= 6; lx += 4) for (var lz = -4.5; lz <= 4.5; lz += 3) room.light(lx, 4.18, lz, 0xfff3e0, lz < -3 ? 0.7 : 0.55, 11);
    // a neon accent strip around the top of the walls
    room.box('glow', -9, 3.55, -6.97, 18, 0.05, 0.03, scaleCol(A, 1.6)); room.box('glow', -8.97, 3.55, -7, 0.03, 0.05, 14, scaleCol(A, 1.6)); room.box('glow', 8.94, 3.55, -7, 0.03, 0.05, 14, scaleCol(A, 1.6));

    // the front: glass door with daylight behind, display windows, posters
    var outM = texMat(outsideTex(), { basic: true });
    room.plane(outM, 0, 1.2, 7.18, 2.0, 2.4, 'n');
    room.box('metal', -1.08, 0, 6.88, 0.08, 2.5, 0.14, steel); room.box('metal', 1.0, 0, 6.88, 0.08, 2.5, 0.14, steel); room.box('metal', -1.08, 2.42, 6.88, 2.16, 0.08, 0.14, steel);
    room.box('metal', -0.03, 0, 6.9, 0.06, 2.42, 0.1, steel); room.box('metal', -0.5, 1.05, 6.86, 0.3, 0.04, 0.04, col('#c9ccd4')); room.box('metal', 0.2, 1.05, 6.86, 0.3, 0.04, 0.04, col('#c9ccd4'));
    room.plane(mats().glass, 0, 1.2, 6.95, 2.0, 2.4, 'n');
    [-5.2, 5.2].forEach(function (wx) {
      room.plane(outM, wx, 1.75, 7.18, 3.6, 1.9, 'n'); room.plane(mats().glass, wx, 1.75, 6.95, 3.6, 1.9, 'n');
      room.box('metal', wx - 1.85, 0.75, 6.85, 3.7, 0.08, 0.18, steel); room.box('metal', wx - 1.85, 2.7, 6.85, 3.7, 0.08, 0.18, steel);
      room.box('matte', wx - 1.8, 0, 6.6, 3.6, 0.75, 0.38, dark, true);
      room.box('metal', wx - 1.85, 0.8, 6.86, 0.08, 1.9, 0.12, steel); room.box('metal', wx + 1.77, 0.8, 6.86, 0.08, 1.9, 0.12, steel);
      // window security bars
      for (var bb = -1.5; bb <= 1.5; bb += 0.5) room.box('metal', wx + bb - 0.015, 0.8, 7.0, 0.03, 1.9, 0.03, col('#55585e'));
    });
    room.plane(texMat(signTex('hours', 'OPEN', { w: 256, h: 96, bg: '#140808', fg: '#ff3a3a', neon: true }), { basic: true }), 5.2, 2.3, 6.84, 0.9, 0.34, 'n');
    room.plane(texMat(signTex('nobothsides', 'NO REFUNDS. EITHER SIDE.', { w: 768, h: 96, bg: '#f2efe4', fg: '#1a1a1a', size: 46 }), { rough: 0.7 }), -5.2, 2.3, 6.84, 2.2, 0.28, 'n');
    room.zone('door', -1.2, 5.6, 1.2, 7);
    room.exitDoor = room.interact({ kind: 'exit', x: 0, z: 6.35, r: 1.1, label: 'Leave', face: Math.PI });

    // the big sign behind the counter
    var signM = texMat(signTex('arm-' + branch, B.sign, { w: 1024, h: 256, bg: '#0d0e10', fg: B.accent, neon: true, sub: B.sub, subColor: '#e8e2d0', border: B.accent }), { basic: true });
    room.plane(signM, -2.7, 3.45, -6.96, 5.6, 1.15, 's');

    // posters on the side walls near the front
    room.plane(texMat(posterTex('p1', 'WE ARM BOTH SIDES', 'This side is winning. So is that one.', '#1d2a1f', '#e8e2d0', B.accent), { rough: 0.6 }), -8.97, 2.0, 6.2, 0.8, 1.2, 'e');
    room.plane(texMat(posterTex('p2', 'LOYALTY CARD', 'Ten stamps, one stamp free. Nobody has qualified.', '#2a1a1a', '#f2efe4', '#e0302a'), { rough: 0.6 }), 8.97, 2.0, 6.2, 0.8, 1.2, 'w');

    // the counter: a long glass display counter across the room, Merle behind it
    function glassCounter(x0, z0, w, d) {
      room.box('matte', x0, 0, z0, w, 0.82, d, dark, true);                                 // the cabinet
      room.box('metal', x0, 0.82, z0, w, 0.03, d, steel);                                  // the deck
      room.box('glow', x0 + 0.05, 0.86, z0 + 0.05, w - 0.1, 0.01, d - 0.1, [0.55, 0.58, 0.6]);   // the felt light under the glass
      room.box('glass', x0, 0.85, z0, w, 0.36, d);                                         // the glass top
      room.solid(x0, 0.85, z0, w, 0.36, d);
      room.box('metal', x0, 1.2, z0, w, 0.025, 0.03, steel); room.box('metal', x0, 1.2, z0 + d - 0.03, w, 0.025, 0.03, steel);
      room.box('metal', x0, 0.85, z0, 0.03, 0.37, d, steel); room.box('metal', x0 + w - 0.03, 0.85, z0, 0.03, 0.37, d, steel);
      room.box('gloss', x0 - 0.02, 0.0, z0 + d - 0.02, w + 0.04, 0.1, 0.04, trim);                // a kick strip
      room.box('glow', x0 + 0.1, 0.12, z0 + d, w - 0.2, 0.02, 0.01, scaleCol(A, 1.4));
    }
    glassCounter(-7, -3.0, 10.4, 0.85);
    room.box('matte', -9, 0, -2.75, 1.95, 1.05, 0.12, dark, true);              // the staff gate at the west end
    room.solid(-9, 1.05, -2.75, 1.95, 1.6, 0.12, { ray: false });            // no jumping it
    room.box('matte', 3.35, 0, -7, 0.2, 1.2, 4.0, dark, true);                   // the half wall to the range corridor
    room.box('glass', 3.35, 1.2, -7, 0.2, 0.9, 4.0); room.solid(3.35, 1.2, -7, 0.2, 0.9, 4.0, { ray: false });
    // the register, a pellet jar display and a bell on the counter
    room.box('matte', -1.2, 1.21, -2.85, 0.45, 0.22, 0.35, black); room.box('glow', -1.15, 1.37, -2.86, 0.32, 0.08, 0.01, [0.3, 1.4, 0.6]);
    for (var j = 0; j < 4; j++) room.cyl('gloss', 1.0 + j * 0.18, 1.21, -2.6, 0.06, 0.06, 0.16, 10, j % 2 ? col('#3fd27f') : col('#f2efe4'));
    room.cyl('metal', 2.4, 1.21, -2.55, 0.07, 0.02, 0.07, 10, col('#e8b53a'));
    room.plane(texMat(signTex('pellets', 'CLARITY PELLETS $150', { w: 512, h: 96, bg: '#f2efe4', fg: '#2f8a4f', size: 44 }), { rough: 0.6 }), 1.3, 1.5, -2.58, 0.9, 0.17, 's');

    // walls of racks: pegboard for handguns on the west wall, long-gun racks on the east wall and behind the counter
    var pegM = texMat(TX.pegboard('arm-' + branch, B.peg, B.pegHole), { rough: 0.85 });
    room.plane(pegM, -8.96, 1.95, 2.1, 7.6, 2.3, 'e', 1.0);
    room.box('gloss', -9, 0.75, -1.85, 0.12, 0.06, 7.9, trim); room.box('gloss', -9, 3.1, -1.85, 0.12, 0.06, 7.9, trim);
    room.plane(pegM, 8.96, 1.95, 2.1, 7.6, 2.3, 'w', 1.0);
    room.box('gloss', 8.88, 0.75, -1.85, 0.12, 0.06, 7.9, trim); room.box('gloss', 8.88, 3.1, -1.85, 0.12, 0.06, 7.9, trim);
    room.plane(pegM, -2.7, 2.0, -6.96, 11.2, 1.9, 's', 1.0);
    // the rack wall can't be walked into
    room.solid(-9, 0, -1.9, 0.35, 3.2, 8.0); room.solid(8.65, 0, -1.9, 0.35, 3.2, 8.0);
    // low cabinets under the racks with ammo boxes on top
    room.box('matte', -9, 0, -1.9, 0.55, 0.75, 8.0, dark, true); room.box('matte', 8.45, 0, -1.9, 0.55, 0.75, 8.0, dark, true);
    room.box('matte', -8.4, 0, -7, 11.4, 0.9, 0.6, dark, true);
    var boxCols = ['#c0392b', '#2f8a4f', '#d9a520', '#2b5aa0', '#7a3fa0', '#d35400'];
    for (var ab = 0; ab < 14; ab++) {
      var bc = col(boxCols[ab % boxCols.length]), bz = -1.6 + ab * 0.55;
      room.box('gloss', -8.85, 0.75, bz, 0.32, 0.16 + (ab % 3) * 0.04, 0.38, bc); room.box('matte', -8.85, 0.75 + 0.17 + (ab % 3) * 0.04, bz, 0.32, 0.01, 0.38, cream);
      room.box('gloss', 8.53, 0.75, bz, 0.32, 0.16 + ((ab + 1) % 3) * 0.04, 0.38, col(boxCols[(ab + 3) % boxCols.length]));
    }
    for (ab = 0; ab < 18; ab++) room.box('gloss', -8.2 + ab * 0.6, 0.9, -6.85, 0.42, 0.2 + (ab % 2) * 0.06, 0.3, col(boxCols[ab % boxCols.length]));

    // display islands in the middle of the floor
    glassCounter(-5.6, 1.6, 2.6, 1.0); glassCounter(2.9, 1.6, 2.6, 1.0);
    // a gear mannequin with the Firmness Vest by the east island
    room.cyl('matte', 6.6, 0, 3.8, 0.25, 0.28, 0.06, 12, black); room.cyl('metal', 6.6, 0.06, 3.8, 0.03, 0.03, 0.9, 8, steel);
    room.box('matte', 6.38, 0.95, 3.66, 0.44, 0.62, 0.28, col('#c9bfae')); room.box('gloss', 6.35, 1.0, 3.62, 0.5, 0.52, 0.36, col('#1e2a44'));
    room.cyl('matte', 6.6, 1.57, 3.8, 0.07, 0.07, 0.1, 8, col('#c9bfae')); room.box('matte', 6.48, 1.67, 3.7, 0.24, 0.26, 0.22, col('#c9bfae'));
    room.solid(6.3, 0, 3.5, 0.6, 1.9, 0.6);
    var vestTag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), texMat(tagTex('Firmness Vest', 500), { rough: 0.6 })); vestTag.position.set(6.6, 0.92, 4.15); room.group.add(vestTag);
    room.items.push({ entry: { itemId: 'firmness_vest', weaponId: null, name: 'Nap Dynasty Firmness Vest', price: 500, gear: true }, mesh: room.group.children[room.group.children.length - 1], face: 's', gear: true });
    // the vest item box is the mannequin: replace the tag with a proxy object covering it
    var proxy = new THREE.Object3D(); proxy.position.set(6.6, 1.25, 3.8); var pm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.45)); pm.visible = false; proxy.add(pm); room.group.add(proxy);
    room.items[room.items.length - 1].mesh = proxy;
    if (B.crates) {
      for (var cr = 0; cr < 3; cr++) { room.box('matte', -8.6 + cr * 0.05, cr * 0.6, 4.8 + cr * 0.1, 1.0, 0.6, 1.0, col(cr % 2 ? '#8a6a3a' : '#7a5a30'), true); room.box('matte', -8.62 + cr * 0.05, cr * 0.6 + 0.25, 4.78 + cr * 0.1, 1.04, 0.06, 1.04, col('#3a2a18')); }
      room.plane(texMat(signTex('rockets', 'ROCKETS: BUY 2, GET A RECEIPT', { w: 768, h: 96, bg: '#ff8a3a', fg: '#1a1a1a', size: 44 }), { rough: 0.6 }), 2.0, 3.0, 6.96, 3.2, 0.4, 'n');
    }
    if (B.wood) {
      room.plane(texMat(TX.carpet('arm-uptown', '#5a1e22', '#c8a040'), { rough: 0.95 }), 0, 0.006, 3.6, 3.2, 6.2, 'up', 3.2);
      for (var ch = -4; ch <= 4; ch += 4) { room.cyl('metal', ch, 3.7, 1.5, 0.02, 0.02, 0.5, 6, col('#e8b53a')); room.cyl('gloss', ch, 3.45, 1.5, 0.35, 0.12, 0.25, 12, col('#e8b53a')); room.cyl('glow', ch, 3.42, 1.5, 0.3, 0.3, 0.04, 12, [1.6, 1.4, 1.0]); }
    }

    // category signs hanging over each wall, Ammu-style, and a security camera in each corner
    function hangSign(key, text, x, z, w, face) {
      var m = texMat(signTex('cat-' + key + '-' + branch, text, { w: 768, h: 128, bg: '#101114', fg: B.accent, border: B.accent, size: 64 }), { basic: true });
      room.plane(m, x, 3.62, z, w, w / 6, face);
      room.box('metal', x - 0.01, 3.62 + w / 12, z - 0.01, 0.02, 4.2 - 3.62 - w / 12, 0.02, steel);
    }
    hangSign('melee', 'MELEE & THROWN', -8.6, 2.1, 3.0, 'e'); hangSign('long', 'LONG GUNS', 8.6, 2.1, 2.6, 'w');
    room.plane(texMat(signTex('cat-ammo-' + branch, 'AMMO', { w: 512, h: 128, bg: '#101114', fg: '#ffd27a', border: '#ffd27a', size: 76 }), { basic: true }), -8.95, 0.98, 5.0, 0.9, 0.22, 'e');
    [[-8.7, 6.7], [8.7, 6.7], [-8.7, -6.7]].forEach(function (q) {
      room.box('matte', q[0] - 0.08, 3.9, q[1] - 0.08, 0.16, 0.3, 0.16, black);
      room.box('gloss', q[0] - 0.1 + (q[0] < 0 ? 0.12 : -0.12), 3.72, q[1] - 0.12 + (q[1] < 0 ? 0.1 : -0.1), 0.2, 0.16, 0.28, col('#e8e2d0'));
      room.box('glow', q[0] + (q[0] < 0 ? 0.12 : -0.12), 3.8, q[1] + (q[1] < 0 ? 0.25 : -0.25), 0.03, 0.03, 0.01, [2.2, 0.2, 0.2]);
    });
    // ---- stock the store: the whole arsenal once each, grouped by class (GTP.Combat.catalog order inside a group) ----
    //   east wall (LONG GUNS): a row each for rifles, shotguns, snipers, machine guns
    //   behind the counter (the feature wall): launchers and heavy weapons on top, the specials below
    //   west pegboard (MELEE & THROWN): long melee, short melee
    //   the main glass counter: every handgun (pistols, one-handed SMGs, the sawed-off) lying under the glass
    //   the two display islands: the thrown things, laid out in the cases
    var list = stock(B.store), groups = { rifle: [], shotgun: [], sniper: [], mg: [], heavy: [], special: [], meleeLong: [], meleeShort: [], hand: [], thrown: [] }, i;
    for (i = 0; i < list.length; i++) groups[rackGroup(list[i])].push(list[i]);
    function hang(entry, x, y, z, face, scale) {
      var m = weaponMesh(entry.weaponId, entry.cls), s = scale || 1.2;
      var len = entry.len || 0.3;
      m.scale.set(s, s, s);
      var holder = new THREE.Group(); holder.add(m);
      // centre the gun on its slot: the mesh's grip is at the origin with the barrel along +x
      m.position.set(entry.upright ? 0 : -len * s / 2, entry.upright ? -0.15 * s : 0.04, 0);
      if (face === 'e') holder.rotation.y = -Math.PI / 2; else if (face === 'w') holder.rotation.y = Math.PI / 2; else if (face === 'n') holder.rotation.y = Math.PI;
      holder.position.set(x, y, z); room.group.add(holder);
      // two pegs and a price tag
      var off = face === 'e' ? [1, 0] : face === 'w' ? [-1, 0] : face === 's' ? [0, 1] : [0, -1];
      var along = face === 'e' || face === 'w' ? [0, 1] : [1, 0], hw = entry.upright ? 0.05 : Math.min(0.35, len * s * 0.3);
      for (var k = -1; k <= 1; k += 2) room.box('metal', x + along[0] * hw * k - 0.015 - off[0] * 0.04, y - 0.06, z + along[1] * hw * k - 0.015 - off[1] * 0.04, 0.03 + Math.abs(off[0]) * 0.08, 0.03, 0.03 + Math.abs(off[1]) * 0.08, steel);
      var tag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), texMat(tagTex(entry.name, entry.price), { rough: 0.6 }));
      tag.position.set(x + off[0] * 0.02, y - 0.24, z + off[1] * 0.02);
      if (face === 'e') tag.rotation.y = Math.PI / 2; else if (face === 'w') tag.rotation.y = -Math.PI / 2; else if (face === 'n') tag.rotation.y = Math.PI;
      room.group.add(tag);
      room.items.push({ entry: entry, mesh: holder, face: face });
    }
    // a gun lying on its side under the glass (the grip toward the customer), centred on (x, z); upright things lie along x
    function lay(entry, x, z, scale) {
      var m = weaponMesh(entry.weaponId, entry.cls), s = scale || 1.1, len = (entry.len || 0.3) * s, holder = new THREE.Group();
      m.scale.set(s, s, s);
      if (entry.upright) { m.rotation.z = -Math.PI / 2; m.position.set(-len / 2, 0.06 * s, 0); }
      else { m.rotation.x = -Math.PI / 2; m.position.set(-len / 2, 0.035, 0); }
      holder.add(m); holder.position.set(x, 0.88, z); room.group.add(holder);
      var tag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.1), texMat(tagTex(entry.name, entry.price), { rough: 0.6 }));
      tag.rotation.x = -Math.PI / 2; tag.position.set(x, 0.885, z + 0.18); room.group.add(tag);
      room.items.push({ entry: entry, mesh: holder, face: 'up' });
    }
    // rows of a wall: each group starts its own row while rows last (a long group runs on into the next row); what does not fit
    // is returned
    function shelve(order, rows, cols) {
      var out = [], cells = [], r = 0, c = 0, need = 0, g;
      for (g = 0; g < order.length; g++) need += Math.max(1, Math.ceil(order[g].length / cols));
      var packed = need > rows;
      for (g = 0; g < order.length; g++) {
        var L = order[g]; if (!L.length) continue;
        if (!packed && c > 0) { r++; c = 0; }
        for (var q = 0; q < L.length; q++) {
          if (c >= cols) { r++; c = 0; }
          if (r >= rows) out.push(L[q]); else cells.push({ e: L[q], r: r, c: c });
          c++;
        }
      }
      return { cells: cells, overflow: out };
    }
    // the east wall: 4 rows x 4 (rifles, shotguns, snipers, machine guns)
    var east = shelve([groups.rifle, groups.shotgun, groups.sniper, groups.mg], 4, 4);
    east.cells.forEach(function (q) { hang(q.e, 8.9, 2.85 - q.r * 0.55, -0.9 + q.c * 2.0, 'w', 1.1); });
    // the feature wall behind Merle: 2 rows x 5 (heavy, then specials)
    var back = shelve([groups.heavy, groups.special], 2, 5);
    back.cells.forEach(function (q) { hang(q.e, -7.3 + q.c * 2.3, 2.55 - q.r * 0.8, -6.9, 's', q.r ? 1.25 : 1.1); });
    // the west pegboard: 3 rows x 5 (long melee, short melee, then anything the other walls could not take)
    var west = shelve([groups.meleeLong, groups.meleeShort], 2, 5), spill = east.overflow.concat(back.overflow, west.overflow);
    west.cells.forEach(function (q) { hang(q.e, -8.9, 2.7 - q.r * 0.7, -1.0 + q.c * 1.65, 'e', q.e.len > 0.6 ? 1.1 : 1.3); });
    for (i = 0; i < Math.min(5, spill.length); i++) hang(spill[i], -8.9, 1.35, -1.0 + i * 1.65, 'e', 1.1);
    spill = spill.slice(5);
    // the main counter: the handguns in one row (the register end stays clear), then the display islands: the thrown things
    var hands = groups.hand.concat(spill.filter(function (e) { return !e.long; })), n = Math.min(hands.length, 9);
    for (i = 0; i < n; i++) lay(hands[i], -6.45 + i * (n > 1 ? 9.0 / (n - 1) : 0), -2.6, 1.15);
    var cases = groups.thrown.concat(hands.slice(9), spill.filter(function (e) { return e.long; }));
    for (i = 0; i < Math.min(cases.length, 12); i++) {
      var isl = i < 6 ? -5.6 : 2.9, k2 = i % 6;
      lay(cases[i], isl + 0.45 + (k2 % 3) * 0.85, 1.82 + Math.floor(k2 / 3) * 0.42, cases[i].long ? 0.6 : 1.15);
    }
    if (cases.length > 12 && U && U.reportError) U.reportError(new Error((cases.length - 12) + ' weapons did not fit the armory'), 'interiors.stock');

    // Merle and the counter interaction
    room.npcs.push({ cast: 'merle', role: 'clerk', name: 'Merle Firmness', x: -1.5, z: -3.9, yaw: Math.PI, color: '#3fd27f', hello: function () { return pickLine(shopBarks('door') || LINES.merleHello); } });
    room.interact({ kind: 'clerk', x: -1.5, z: -1.75, r: 1.5, label: 'Talk to Merle (buy ammo, gear, everything)' });

    // ---- the back room: the shooting range ----
    var rangeM = texMat(TX.foam('range'), { rough: 1 }), concM = texMat(TX.concrete('range', '#6a6a68'), { rough: 0.7 });
    room.shell(1.5, -38, 10.5, -7.5, 3.6, { wall: rangeM, floor: concM, ceil: texMat(TX.ceiling('range', '#4a4a4c'), { rough: 1 }), ts: 1.6, openings: [{ side: 's', a0: 5.4, a1: 7.6, h: 2.5 }], floorTs: 3 });
    // the corridor between the shop's back wall and the range wall
    room.plane(floorM, 6.5, 0.002, -7.25, 2.2, 0.5, 'up', 2); room.plane(wallM, 5.4, 1.25, -7.25, 0.5, 2.5, 'e', 2); room.plane(wallM, 7.6, 1.25, -7.25, 0.5, 2.5, 'w', 2);
    room.plane(ceilM, 6.5, 2.5, -7.25, 2.2, 0.5, 'down', 1.2);
    room.plane(texMat(signTex('rangesign', 'RANGE', { w: 512, h: 128, bg: '#101010', fg: B.accent, neon: true }), { basic: true }), 6.5, 2.85, -6.96, 1.6, 0.4, 's');
    room.zone('range', 1.5, -38, 10.5, -7.4);
    // the shooting line: a counter across the room with three booths
    room.box('matte', 1.5, 0, -11.3, 9.0, 1.05, 0.5, col('#2a2b2e'), true);
    room.box('metal', 1.5, 1.05, -11.3, 9.0, 0.04, 0.5, steel);
    room.solid(1.5, 1.05, -11.3, 9.0, 2.0, 0.5, { ray: false });           // nobody walks downrange
    [4.5, 7.5].forEach(function (bx) { room.box('matte', bx - 0.05, 0, -11.3, 0.1, 2.3, 2.0, col('#3a3c40'), true); room.box('glass', bx - 0.04, 1.2, -11.3, 0.08, 1.0, 1.6); });
    room.box('glow', 5.2, 0.006, -10.9, 2.6, 0.01, 0.06, scaleCol(A, 1.5)); room.box('glow', 5.2, 0.006, -9.3, 2.6, 0.01, 0.06, scaleCol(A, 1.5));
    room.box('glow', 5.2, 0.006, -10.9, 0.06, 0.01, 1.66, scaleCol(A, 1.5)); room.box('glow', 7.74, 0.006, -10.9, 0.06, 0.01, 1.66, scaleCol(A, 1.5));
    // ear defenders hanging in the booths
    room.box('gloss', 5.0, 1.6, -10.4, 0.04, 0.18, 0.2, col('#d23a2a')); room.box('gloss', 8.0, 1.6, -10.4, 0.04, 0.18, 0.2, col('#d23a2a'));
    // the berm and the lane markings downrange
    room.box('matte', 1.5, 0, -38, 9, 1.2, 1.8, col('#3a2e24')); room.box('matte', 1.5, 1.2, -38, 9, 1.2, 0.9, col('#33281f'));
    for (var ln = 0; ln < 4; ln++) room.box('glow', 1.5 + ln * 3 - 0.02, 0.005, -36, 0.04, 0.01, 24.6, [0.9, 0.85, 0.3]);
    for (var dz = -15; dz >= -35; dz -= 5) room.box('matte', 1.5, 0.005, dz, 9, 0.01, 0.08, col('#c8c0a0'));
    // the range lights: bright over the targets, dim over the booths
    room.light(6, 3.58, -9.4, 0xfff0dc, 0.55, 8); room.light(3, 3.58, -20, 0xffffff, 0.75, 14); room.light(9, 3.58, -20, 0xffffff, 0.75, 14);
    room.light(3, 3.58, -30, 0xffffff, 0.8, 14); room.light(9, 3.58, -30, 0xffffff, 0.8, 14); room.light(6, 3.58, -25, 0xffffff, 0.5, 14);
    // the scoreboard hangs over the line
    var sb = scoreboardTex(); room.box('matte', 4.4, 2.82, -12.25, 3.2, 0.76, 0.1, col('#111214'));
    room.plane(texMat(sb, { basic: true }), 6.0, 3.2, -12.14, 2.6, 0.69, 's');
    room.solid(4.4, 2.82, -12.25, 3.2, 0.76, 0.1, { ray: false });
    room.range = rangeTargets(room);
    room.booth = room.interact({ kind: 'range', x: 6.5, z: -10.1, r: 0.9, label: 'Stand on the line to start the range' });
  }

  // ---- Lanyard & Co.: clothing racks, mirrors, a changing booth ----
  function buildClothing(room) {
    var wallM = texMat(TX.plaster('cloth', '#e9e1d4'), { rough: 0.9 }), floorM = texMat(TX.wood('clothfloor', '#a07850', '#6a4a30'), { rough: 0.45 });
    room.bounds = { x0: -8, z0: -6, x1: 8, z1: 6 };
    room.shell(-8, -6, 8, 6, 3.8, { wall: wallM, floor: floorM, ceil: texMat(TX.ceiling('cloth', '#f2efe8'), { rough: 0.95 }), ts: 2.5, floorTs: 1.6, skirt: col('#3a3430') });
    room.spawn = { x: 0, z: 3.7, yaw: 0 };
    room.zone('store', -8, -6, 8, 6);
    room.fill = 0.65;
    for (var lx = -5; lx <= 5; lx += 5) for (var lz = -3; lz <= 3; lz += 3) room.light(lx, 3.78, lz, 0xfff4e6, 0.5, 10);
    var outM = texMat(outsideTex(), { basic: true }), steel = col('#b0b4bb'), dark = col('#2a2624');
    room.plane(outM, 0, 1.2, 6.18, 2, 2.4, 'n'); room.plane(mats().glass, 0, 1.2, 5.95, 2, 2.4, 'n');
    room.box('metal', -1.08, 0, 5.88, 0.08, 2.5, 0.14, steel); room.box('metal', 1.0, 0, 5.88, 0.08, 2.5, 0.14, steel); room.box('metal', -1.08, 2.42, 5.88, 2.16, 0.08, 0.14, steel);
    room.exitDoor = room.interact({ kind: 'exit', x: 0, z: 5.45, r: 0.95, label: 'Leave', face: Math.PI });
    room.plane(texMat(signTex('lanyard', 'LANYARD & CO.', { w: 1024, h: 256, bg: '#1e2a3a', fg: '#f2d48a', sub: 'DRESS FOR THE PANEL YOU WANT', subColor: '#e8e2d0' }), { rough: 0.5 }), 0, 3.0, -5.96, 5, 1.25, 's');
    // racks of shirts and jackets
    var shirts = ['#c0392b', '#2b5aa0', '#f2efe4', '#2f8a4f', '#d9a520', '#7a3fa0', '#1e2a44', '#e07a5f', '#5a6c8c', '#3a3a3a'];
    function rack(x, z, alongX, n) {
      var L = n * 0.22 + 0.3;
      if (alongX) { room.box('metal', x - L / 2, 1.55, z - 0.015, L, 0.03, 0.03, steel); room.box('metal', x - L / 2, 0, z - 0.02, 0.04, 1.58, 0.04, steel); room.box('metal', x + L / 2 - 0.04, 0, z - 0.02, 0.04, 1.58, 0.04, steel); }
      else { room.box('metal', x - 0.015, 1.55, z - L / 2, 0.03, 0.03, L, steel); room.box('metal', x - 0.02, 0, z - L / 2, 0.04, 1.58, 0.04, steel); room.box('metal', x - 0.02, 0, z + L / 2 - 0.04, 0.04, 1.58, 0.04, steel); }
      for (var i = 0; i < n; i++) {
        var c = col(shirts[(i + Math.round(x * 3 + z)) % shirts.length] || '#888888'), a = -L / 2 + 0.25 + i * 0.22;
        if (alongX) { room.box('matte', x + a - 0.02, 0.75, z - 0.25, 0.05, 0.75, 0.5, c); room.box('metal', x + a - 0.005, 1.5, z - 0.01, 0.01, 0.07, 0.02, steel); }
        else { room.box('matte', x - 0.25, 0.75, z + a - 0.02, 0.5, 0.75, 0.05, c); room.box('metal', x - 0.01, 1.5, z + a - 0.005, 0.02, 0.07, 0.01, steel); }
      }
      if (alongX) room.solid(x - L / 2, 0, z - 0.3, L, 1.6, 0.6); else room.solid(x - 0.3, 0, z - L / 2, 0.6, 1.6, L);
    }
    rack(-4, 0.5, true, 10); rack(4, 0.5, true, 10); rack(-7.4, -1, false, 14); rack(-4, -3, true, 8);
    // folded shelves on the east wall
    room.box('matte', 7.4, 0, -4.5, 0.6, 2.4, 6, col('#6a4a30'), true);
    for (var sh = 0; sh < 4; sh++) for (var k = 0; k < 9; k++) room.box('matte', 7.45, 0.3 + sh * 0.55, -4.3 + k * 0.65, 0.45, 0.14 + (k % 2) * 0.05, 0.5, col(shirts[(sh * 3 + k) % shirts.length]));
    // mirrors
    var mirM = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.04, metalness: 1.0 });
    [[-7.91, 'e', 3.2], [-7.91, 'e', -4.6]].forEach(function (m) { room.plane(mirM, m[0], 1.4, m[2], 1.1, 2.1, m[1]); room.box('gloss', -8, 0.32, m[2] - 0.6, 0.06, 2.2, 1.2, col('#c8a040')); });
    // mannequins
    [[2, 3.5, '#1e2a44'], [-2, 3.5, '#c0392b']].forEach(function (q) {
      room.cyl('matte', q[0], 0, q[1], 0.25, 0.28, 0.05, 12, dark); room.cyl('metal', q[0], 0.05, q[1], 0.025, 0.025, 0.85, 8, steel);
      room.box('matte', q[0] - 0.24, 0.9, q[1] - 0.14, 0.48, 0.7, 0.28, col(q[2])); room.box('matte', q[0] - 0.2, 0.5, q[1] - 0.12, 0.4, 0.42, 0.24, col('#2a2f4a'));
      room.cyl('matte', q[0], 1.6, q[1], 0.065, 0.065, 0.1, 8, col('#e8dccb')); room.box('matte', q[0] - 0.11, 1.7, q[1] - 0.1, 0.22, 0.26, 0.2, col('#e8dccb'));
      room.solid(q[0] - 0.3, 0, q[1] - 0.3, 0.6, 1.9, 0.6);
    });
    // the changing booths: frames and curtains along the north wall
    [-6.6, -5.0].forEach(function (bx, i) {
      room.box('matte', bx - 0.7, 0, -6, 0.06, 2.4, 1.5, col('#4a3a2a'), true); room.box('matte', bx + 0.64, 0, -6, 0.06, 2.4, 1.5, col('#4a3a2a'), true);
      room.box('metal', bx - 0.7, 2.3, -4.55, 1.4, 0.03, 0.03, steel);
      for (var f = 0; f < 7; f++) room.box('matte', bx - 0.68 + f * 0.2, 0.25, -4.55 + (f % 2) * 0.05, 0.18, 2.05, 0.04, col(i ? '#7a1f2a' : '#1f4a3a'));
      room.interact({ kind: 'booth', x: bx, z: -4.0, r: 0.8, label: 'Changing booth: try on outfits' });
    });
    // the till
    room.box('matte', 2.5, 0, -4.8, 3.2, 1.0, 0.8, col('#3a2a20'), true); room.box('gloss', 2.45, 1.0, -4.85, 3.3, 0.05, 0.9, col('#e8e2d0'));
    room.box('matte', 3.6, 1.05, -4.6, 0.45, 0.25, 0.35, col('#141414'));
    room.npcs.push({ role: 'clerk', name: 'Lanyard & Co. associate', look: { skin: 3, hair: 'bun', hairColor: '#2a1a10', shirt: '#1e2a3a', pants: '#2a2a2a', glasses: 'round', hat: 'none', extra: 'lanyard', tie: 'none' }, x: 3.2, z: -5.4, yaw: Math.PI, hello: function () { return pickLine(LINES.clothingHello); } });
    room.interact({ kind: 'clothing', x: 3.2, z: -3.5, r: 1.3, label: 'Browse outfits' });
  }

  // ---- the Clip Joint barber ----
  function buildBarber(room) {
    var wallM = texMat(TX.plaster('barber', '#d9e6e2'), { rough: 0.9 });
    var floorM = texMat(TX.tiles('barber', '#f0ece2', '#1c1c1e', '#888', 8), { rough: 0.3 });
    room.bounds = { x0: -6, z0: -5, x1: 6, z1: 5 };
    room.shell(-6, -5, 6, 5, 3.4, { wall: wallM, floor: floorM, ceil: texMat(TX.ceiling('barber', '#f2efe8'), { rough: 0.95 }), ts: 2.5, floorTs: 1.2, skirt: col('#1c1c1e') });
    room.spawn = { x: 0, z: 2.9, yaw: 0 };
    room.zone('store', -6, -5, 6, 5);
    room.fill = 0.65;
    for (var lx = -3; lx <= 3; lx += 3) room.light(lx, 3.38, -1, 0xfff6ea, 0.55, 9);
    room.light(0, 3.38, 3, 0xfff6ea, 0.4, 8);
    var outM = texMat(outsideTex(), { basic: true }), steel = col('#b0b4bb'), red = col('#a0242a'), chrome = col('#d8dce2');
    room.plane(outM, 0, 1.2, 5.18, 2, 2.4, 'n'); room.plane(mats().glass, 0, 1.2, 4.95, 2, 2.4, 'n');
    room.box('metal', -1.08, 0, 4.88, 0.08, 2.5, 0.14, steel); room.box('metal', 1.0, 0, 4.88, 0.08, 2.5, 0.14, steel); room.box('metal', -1.08, 2.42, 4.88, 2.16, 0.08, 0.14, steel);
    room.exitDoor = room.interact({ kind: 'exit', x: 0, z: 4.45, r: 0.95, label: 'Leave', face: Math.PI });
    room.plane(texMat(signTex('clipjoint', 'THE CLIP JOINT', { w: 1024, h: 256, bg: '#14181c', fg: '#e8e2d0', sub: 'A FRESH FADE READS AS A FRESH TAKE', subColor: '#d23a2a' }), { rough: 0.5 }), 0, 2.85, -4.96, 4.2, 1.05, 's');
    // two chairs facing the mirror wall (north), with mirror bulbs and counters
    [-2.4, 2.4].forEach(function (cx, i) {
      room.box('gloss', cx - 1.0, 0, -5, 2.0, 0.95, 0.5, col('#f0ece2'), true); room.box('gloss', cx - 1.02, 0.95, -5.02, 2.04, 0.04, 0.54, col('#1c1c1e'));
      room.plane(new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.03, metalness: 1.0 }), cx, 1.85, -4.97, 1.6, 1.3, 's');
      for (var bl = 0; bl < 5; bl++) { room.cyl('glow', cx - 0.8, 1.25 + bl * 0.3, -4.95, 0.045, 0.045, 0.06, 8, [1.8, 1.6, 1.2]); room.cyl('glow', cx + 0.8, 1.25 + bl * 0.3, -4.95, 0.045, 0.045, 0.06, 8, [1.8, 1.6, 1.2]); }
      // the chair: base, seat, back, arms, footrest
      room.cyl('metal', cx, 0, -3.2, 0.32, 0.12, 0.35, 12, chrome);
      room.box('gloss', cx - 0.32, 0.45, -3.5, 0.64, 0.14, 0.6, red); room.box('gloss', cx - 0.32, 0.55, -2.95, 0.64, 0.75, 0.12, red);
      room.box('metal', cx - 0.38, 0.62, -3.5, 0.06, 0.06, 0.55, chrome); room.box('metal', cx + 0.32, 0.62, -3.5, 0.06, 0.06, 0.55, chrome);
      room.box('metal', cx - 0.25, 0.15, -3.78, 0.5, 0.04, 0.2, chrome);
      room.solid(cx - 0.4, 0, -3.6, 0.8, 1.2, 0.75);
      room.interact({ kind: 'chair', x: cx, z: -2.3, r: 0.9, label: 'Sit for a cut' });
      void i;
    });
    // the barber pole by the door and a waiting bench
    room.cyl('metal', 4.8, 0, 4.4, 0.14, 0.14, 0.1, 12, chrome); room.cyl('gloss', 4.8, 0.1, 4.4, 0.11, 0.11, 1.6, 12, col('#f0ece2')); room.cyl('metal', 4.8, 1.7, 4.4, 0.14, 0.06, 0.15, 12, chrome);
    for (var st = 0; st < 6; st++) room.box('gloss', 4.69, 0.15 + st * 0.26, 4.29, 0.22, 0.1, 0.22, st % 2 ? col('#2b5aa0') : red);
    room.box('matte', -5.6, 0, 0, 0.6, 0.45, 3.2, col('#6a4a30'), true); room.box('gloss', -5.95, 0.45, 0, 0.12, 0.6, 3.2, col('#a0242a'));
    room.plane(texMat(posterTex('styles', 'TODAY\'S STYLES', 'The Pompadour. The Slick. The Mohawk of Dissent. The Bun of Reason.', '#14181c', '#e8e2d0', '#d23a2a'), { rough: 0.6 }), 5.96, 1.8, -1.5, 0.9, 1.3, 'w');
    room.npcs.push({ role: 'barber', name: 'The Barber', look: { skin: 4, hair: 'pompadour', hairColor: '#1a1a1a', shirt: '#f0ece2', pants: '#1c1c1e', glasses: 'none', hat: 'none', extra: 'none', tie: 'black' }, x: 0, z: -3.0, yaw: Math.PI, hello: function () { return pickLine(LINES.barberHello); } });
  }

  // ---- a safehouse: bed to save, wardrobe, sofa, TV, a window on the city ----
  var SAFE_STYLE = {
    safe_brownstone: { wall: 'brick', base: '#8a4a3a', floor: '#7a5230', rug: '#2b5aa0', night: true },
    safe_marina_loft: { wall: 'plaster', base: '#cfe2ea', floor: '#c8b08a', rug: '#e07a5f', night: false },
    safe_suburb: { wall: 'plaster', base: '#e8dcc0', floor: '#9a7a50', rug: '#2f8a4f', night: false },
    safe_penthouse: { wall: 'plaster', base: '#4a4f5c', floor: '#e8e4dc', rug: '#c8a040', night: true },
    def: { wall: 'plaster', base: '#d8cfc0', floor: '#8a6a48', rug: '#7a3fa0', night: true }
  };
  function buildSafehouse(room, branch) {
    var Sx = SAFE_STYLE[branch] || SAFE_STYLE.def;
    var wallM = texMat(Sx.wall === 'brick' ? TX.brick('safe-' + branch, Sx.base) : TX.plaster('safe-' + branch, Sx.base), { rough: 0.9 });
    var floorM = texMat(TX.wood('safefloor-' + branch, Sx.floor, '#3a2818'), { rough: 0.5 });
    room.bounds = { x0: -7, z0: -5.5, x1: 7, z1: 5.5 };
    room.shell(-7, -5.5, 7, 5.5, 3.2, { wall: wallM, floor: floorM, ceil: texMat(TX.ceiling('safe', '#ece8e0'), { rough: 0.95 }), ts: Sx.wall === 'brick' ? 1.6 : 2.5, floorTs: 1.6, skirt: col('#2a2018') });
    room.spawn = { x: -1.7, z: 3.75, yaw: 0 };
    room.zone('home', -7, -5.5, 7, 5.5);
    room.fill = 0.6;
    room.light(-3.5, 3.18, -1.5, 0xffe6c4, 0.55, 9); room.light(3.5, 3.18, -1.5, 0xffe6c4, 0.55, 9); room.light(0, 3.18, 2.5, 0xffe6c4, 0.45, 9);
    var wood = col('#5a3a22'), dark = col('#2a2624'), steel = col('#9aa0a8');
    // the door back out
    room.box('matte', -0.6, 0, 5.4, 1.2, 2.3, 0.08, col('#5a3a22')); room.box('metal', 0.35, 1.0, 5.36, 0.12, 0.04, 0.04, col('#e8b53a'));
    room.exitDoor = room.interact({ kind: 'exit', x: 0, z: 5.0, r: 0.9, label: 'Leave', face: Math.PI });
    // the window on the city (north wall)
    room.plane(texMat(windowTex('safe-' + branch, Sx.night), { basic: true }), 2.5, 1.75, -5.47, 4.0, 1.7, 's');
    room.box('gloss', 0.45, 0.85, -5.5, 4.1, 0.08, 0.15, col('#f2efe4')); room.box('gloss', 0.45, 2.6, -5.5, 4.1, 0.08, 0.1, col('#f2efe4'));
    room.box('gloss', 0.45, 0.85, -5.5, 0.08, 1.8, 0.1, col('#f2efe4')); room.box('gloss', 4.47, 0.85, -5.5, 0.08, 1.8, 0.1, col('#f2efe4')); room.box('gloss', 2.47, 0.85, -5.5, 0.06, 1.8, 0.08, col('#f2efe4'));
    // the bed (west): frame, mattress, pillows, blanket
    room.box('matte', -6.9, 0, -4.6, 2.2, 0.35, 3.0, wood, true); room.box('matte', -6.85, 0.35, -4.55, 2.1, 0.25, 2.9, col('#f2efe4'));
    room.box('matte', -6.85, 0.58, -3.2, 2.1, 0.08, 1.55, col(Sx.rug)); room.box('matte', -6.7, 0.6, -4.45, 0.8, 0.14, 0.5, col('#ffffff')); room.box('matte', -5.8, 0.6, -4.45, 0.8, 0.14, 0.5, col('#ffffff'));
    room.box('matte', -6.95, 0, -4.75, 2.3, 1.1, 0.15, wood, true);
    room.box('matte', -4.5, 0, -4.7, 0.5, 0.55, 0.45, wood, true); room.cyl('gloss', -4.25, 0.55, -4.5, 0.08, 0.1, 0.3, 10, col('#e8e2d0')); room.cyl('glow', -4.25, 0.85, -4.5, 0.16, 0.1, 0.2, 10, [1.8, 1.5, 1.0]);
    room.interact({ kind: 'bed', x: -5.8, z: -1.0, r: 1.2, label: 'Sleep (save the game)' });
    // the wardrobe (east wall)
    room.box('matte', 6.3, 0, -4.8, 0.7, 2.4, 2.2, wood, true); room.box('matte', 6.27, 0.05, -4.75, 0.04, 2.3, 1.05, col('#6a4a30')); room.box('matte', 6.27, 0.05, -3.65, 0.04, 2.3, 1.0, col('#6a4a30'));
    room.box('metal', 6.24, 1.1, -3.8, 0.04, 0.3, 0.04, col('#e8b53a')); room.box('metal', 6.24, 1.1, -3.55, 0.04, 0.3, 0.04, col('#e8b53a'));
    room.interact({ kind: 'wardrobe', x: 5.4, z: -3.7, r: 1.0, label: 'Wardrobe: change outfit' });
    // the living corner: sofa, coffee table, TV, rug, a desk with the podcast mic
    room.plane(texMat(TX.carpet('safe-' + branch, Sx.rug, '#f2efe4'), { rough: 0.95 }), 1.5, 0.006, 1.2, 4.2, 3.0, 'up', 4.2);
    room.box('matte', -0.5, 0, 2.4, 3.6, 0.45, 0.95, dark, true); room.box('matte', -0.5, 0.45, 3.1, 3.6, 0.6, 0.25, dark); room.box('matte', -0.5, 0.45, 2.4, 0.25, 0.3, 0.95, dark); room.box('matte', 2.85, 0.45, 2.4, 0.25, 0.3, 0.95, dark);
    room.box('matte', 0.4, 0, 0.8, 1.6, 0.4, 0.8, wood, true);
    room.box('matte', 0.4, 0, -1.4, 2.4, 0.5, 0.5, dark, true); room.box('gloss', 0.7, 0.55, -1.25, 1.8, 1.05, 0.08, col('#0a0a0c'));
    room.plane(texMat(signTex('tv-' + branch, 'LOUD & CORRECT', { w: 512, h: 256, bg: '#14243a', fg: '#ffd27a', sub: 'ON AIR: YOU, PROBABLY', subColor: '#e8e2d0' }), { basic: true }), 1.6, 1.075, -1.16, 1.7, 0.95, 's');
    room.box('matte', 4.2, 0, 2.6, 1.6, 0.75, 0.8, wood, true); room.cyl('metal', 4.6, 0.75, 2.9, 0.08, 0.08, 0.02, 8, steel); room.cyl('metal', 4.6, 0.77, 2.9, 0.012, 0.012, 0.25, 6, steel); room.cyl('gloss', 4.6, 1.02, 2.9, 0.05, 0.05, 0.12, 8, col('#2a2a2e'));
    room.plane(texMat(posterTex('safe-poster', 'LOUD & CORRECT', 'Season four. Minds changed: still zero.', '#1a1a2a', '#ffd27a', '#c0392b'), { rough: 0.6 }), -1.5, 1.8, -5.46, 0.9, 1.3, 's');
    if (branch === 'safe_penthouse') { room.plane(texMat(signTex('pent', 'PENTHOUSE', { w: 512, h: 128, bg: '#14141a', fg: '#e8b53a', neon: true }), { basic: true }), -3.5, 2.6, 5.45, 1.8, 0.45, 'n'); }
  }

  var BUILDERS = { armory: buildArmory, clothing: buildClothing, barber: buildBarber, safehouse: buildSafehouse };

  // ------------------------------------------------------------- the range --
  var MEDALS = { bronze: 60, silver: 140, gold: 220 };
  var ROUND = 60, COUNTDOWN = 3;
  function medalFor(score) { return score >= MEDALS.gold ? 'gold' : score >= MEDALS.silver ? 'silver' : score >= MEDALS.bronze ? 'bronze' : null; }
  function scoreboardTex() {
    return canvasTex('scoreboard', 512, 136, function (c, w, h) { drawScoreboard(c, w, h, null); });
  }
  function drawScoreboard(c, w, h, R) {
    c.fillStyle = '#060708'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#3fd27f'; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4);
    c.textBaseline = 'middle'; c.shadowColor = '#3fd27f'; c.shadowBlur = 10;
    if (!R || (!R.running && !R.last)) {
      c.fillStyle = '#3fd27f'; c.font = '900 40px "Arial Black", Impact, sans-serif'; c.textAlign = 'center'; c.fillText('THE RANGE', w / 2, 46);
      c.font = '700 22px Arial'; c.fillStyle = '#e8e2d0'; c.shadowBlur = 0;
      c.fillText('STAND ON THE LINE. 60 SECONDS.', w / 2, 88);
      c.fillText('BRONZE ' + MEDALS.bronze + '  SILVER ' + MEDALS.silver + '  GOLD ' + MEDALS.gold + (R && R.best ? '   BEST ' + R.best : ''), w / 2, 116);
      return;
    }
    var left = R.running ? (R.t < COUNTDOWN ? ROUND : Math.max(0, ROUND - (R.t - COUNTDOWN))) : 0;
    c.textAlign = 'left'; c.font = '900 52px "Arial Black", Impact, sans-serif';
    c.fillStyle = left < 10 && R.running ? '#ff5a4a' : '#ffd27a';
    var secs = Math.ceil(left - 0.0001), tt = R.running && R.t < COUNTDOWN ? String(Math.ceil(COUNTDOWN - R.t)) : Math.floor(secs / 60) + ':' + (secs % 60 < 10 ? '0' : '') + (secs % 60);
    c.fillText(tt, 22, 52);
    c.textAlign = 'right'; c.fillStyle = '#3fd27f'; c.fillText(String(R.score), w - 22, 52);
    c.shadowBlur = 0; c.font = '700 20px Arial'; c.fillStyle = '#e8e2d0';
    c.textAlign = 'left'; c.fillText('TIME', 24, 98); c.textAlign = 'right'; c.fillText('SCORE', w - 24, 98);
    c.textAlign = 'center';
    var m = R.running ? medalFor(R.score) : R.last ? R.last.medal : null;
    c.fillStyle = m === 'gold' ? '#ffd24a' : m === 'silver' ? '#d0d6de' : m === 'bronze' ? '#d08a4a' : '#888';
    c.font = '900 24px "Arial Black", Impact, sans-serif';
    c.fillText(R.running ? (m ? m.toUpperCase() : 'NO MEDAL YET') : (m ? m.toUpperCase() + ' MEDAL' : 'NO MEDAL'), w / 2, 98);
    c.font = '700 16px Arial'; c.fillStyle = '#9a9a9a';
    c.fillText('HITS ' + R.hits + ' / SHOTS ' + R.shots + (R.best ? '   BEST ' + R.best : ''), w / 2, 122);
  }
  // nine pop-up targets (three lanes, three depths) and two movers on rails, each a pivot with a cardboard board
  function rangeTargets(room) {
    var list = [], heck = texMat(targetTex('heckler'), { alpha: true, double: true, rough: 0.9 }), mod = texMat(targetTex('moderator'), { alpha: true, double: true, rough: 0.9 });
    var lanes = [3.0, 6.0, 9.0], depths = [-17, -23, -31];
    function make(x, z, mover) {
      var pivot = new THREE.Group(), geo = new THREE.PlaneGeometry(0.8, 1.9); geo.translate(0, 0.95, 0);
      var board = new THREE.Mesh(geo, heck); board.castShadow = true; pivot.add(board);
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.06), mats().metal); post.position.set(0, -0.1, -0.04); pivot.add(post);
      pivot.position.set(x, 0.12, z); pivot.rotation.x = -Math.PI / 2; pivot.visible = false; room.group.add(pivot);
      var t = { pivot: pivot, board: board, mats: { heckler: heck, moderator: mod }, x0: room.ox + x, z: room.oz + z, x: room.ox + x, y: 0.12, state: 'down', t: 0, life: 0, ang: -Math.PI / 2, moderator: false, mover: !!mover, dir: 1, speed: 0 };
      list.push(t);
      return t;
    }
    for (var d = 0; d < depths.length; d++) for (var l = 0; l < lanes.length; l++) make(lanes[l] + (d === 1 ? 0.6 : 0), depths[d] + (l === 1 ? 1.5 : 0));
    // movers: rails across the room
    [-20, -27].forEach(function (z) { room.box('metal', 1.6, 3.0, z - 0.05, 8.8, 0.06, 0.1, col('#55585e')); make(2.2, z, true); });
    return { targets: list, lanes: lanes };
  }

  // ------------------------------------------------------------------ state --
  var S = { active: false, current: null, room: null, rooms: {}, trans: null, ret: null, npcs: [], prompt: null, near: null, browse: null, confirm: null, doors: [], doorSeed: null, doorCount: -1, overlay: null, holdExit: 0, muzzleT: 0, saved: { rangeBest: 0, medals: {} }, envSaved: false };
  var RANGE = { running: false, t: 0, score: 0, hits: 0, shots: 0, best: 0, last: null, spawnT: 0, hold: 0, cool: 0, loan: null, rng: null, bodyHit: 0 };

  function roomFor(kind, branch) {
    var key = kind + ':' + branch;
    if (S.rooms[key]) return S.rooms[key];
    var n = 0; for (var k in S.rooms) if (S.rooms[k].kind === kind) n++;
    var room = new Room(kind, kind, branch, BASE_X - n * 120, (SLOT[kind] || 0) * SLOT_Z);
    try { BUILDERS[kind](room, branch); room.finish(); } catch (e) { report(e, 'build.' + kind); }
    S.rooms[key] = room;
    return room;
  }
  // the room under a point (x west of FAR_X only), or null
  function roomAt(x, z) {
    if (x > FAR_X) return null;
    for (var k in S.rooms) { var r = S.rooms[k], b = r.bounds; if (b && x >= b.x0 - 3 && x <= b.x1 + 3 && z >= b.z0 - 3 && z <= b.z1 + 3) return r; }
    return null;
  }

  // ------------------------------------------------------------ collision --
  var _res = { x: 0, z: 0, hitX: false, hitZ: false, normal: { x: 0, z: 0 }, prop: null };
  function roomResolve(room, x, z, y, r) {
    var hitX = false, hitZ = false, nx = 0, nz = 0, list = room.solids, h = 1.7;
    for (var iter = 0; iter < 3; iter++) {
      var moved = false;
      for (var i = 0; i < list.length; i++) {
        var s = list[i]; if (!s.col) continue;
        if (y + h <= s.y0 || y >= s.y1 - 0.05) continue;
        if (x + r <= s.x0 || x - r >= s.x1 || z + r <= s.z0 || z - r >= s.z1) continue;
        var p = U.aabbCircle(s.x0, s.z0, s.x1 - s.x0, s.z1 - s.z0, x, z, r);
        if (p.hit) { x += p.px; z += p.pz; moved = true; if (Math.abs(p.px) > Math.abs(p.pz)) { hitX = true; nx = p.px > 0 ? 1 : -1; nz = 0; } else { hitZ = true; nz = p.pz > 0 ? 1 : -1; nx = 0; } }
      }
      if (!moved) break;
    }
    var b = room.bounds;   // the outer limit, whatever the walls say
    if (x < b.x0 + r) { x = b.x0 + r; hitX = true; nx = 1; } if (x > b.x1 - r) { x = b.x1 - r; hitX = true; nx = -1; }
    if (z < b.z0 + r) { z = b.z0 + r; hitZ = true; nz = 1; } if (z > b.z1 - r) { z = b.z1 - r; hitZ = true; nz = -1; }
    _res.x = x; _res.z = z; _res.hitX = hitX; _res.hitZ = hitZ; _res.normal.x = nx; _res.normal.z = nz; _res.prop = null;
    return _res;
  }
  function roomSolid(room, x, z, y) {
    var b = room.bounds; if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return true;
    for (var i = 0; i < room.solids.length; i++) { var s = room.solids[i]; if (s.col && x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && y >= s.y0 && y < s.y1) return true; }
    return false;
  }
  var FAKE_B = { x: 0, y: 0, z: 0, w: 1, d: 1, h: 1, style: 'interior', interior: true };
  // the slab test without U.rayAabb's arrays (the camera casts every frame); -1 on a miss
  function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1, maxT) {
    var tmin = 0, tmax = maxT, inv, t1, t2, tt;
    if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return -1; } else { inv = 1 / dx; t1 = (x0 - ox) * inv; t2 = (x1 - ox) * inv; if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
    if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return -1; } else { inv = 1 / dy; t1 = (y0 - oy) * inv; t2 = (y1 - oy) * inv; if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
    if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return -1; } else { inv = 1 / dz; t1 = (z0 - oz) * inv; t2 = (z1 - oz) * inv; if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
    return tmin;
  }
  function roomRay(room, ox, oy, oz, dx, dy, dz, maxDist) {
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= l; dy /= l; dz /= l;
    maxDist = maxDist || 100;
    var best = null, bestT = maxDist, list = room.solids, i, t;
    for (i = 0; i < list.length; i++) {
      var s = list[i]; if (!s.ray) continue;
      t = rayBox(ox, oy, oz, dx, dy, dz, s.x0, s.y0, s.z0, s.x1, s.y1, s.z1, bestT);
      if (t > 0 && t < bestT) { bestT = t; best = s; }
    }
    var tg = room === S.room && RANGE.running && room.range ? room.range.targets : null;
    if (tg) for (i = 0; i < tg.length; i++) {
      var q = tg[i]; if (q.ang < -0.3) continue;
      t = rayBox(ox, oy, oz, dx, dy, dz, q.x - 0.4, q.y, q.z - 0.04, q.x + 0.4, q.y + 1.9, q.z + 0.04, bestT);
      if (t > 0 && t < bestT) { bestT = t; best = { x0: q.x - 0.4, y0: q.y, z0: q.z - 0.04, x1: q.x + 0.4, y1: q.y + 1.9, z1: q.z + 0.04, target: q }; }
    }
    if (!best) return null;
    var px = ox + dx * bestT, py = oy + dy * bestT, pz = oz + dz * bestT, e = 0.02, n = { x: 0, y: 0, z: 0 };
    if (Math.abs(px - best.x0) < e) n.x = -1; else if (Math.abs(px - best.x1) < e) n.x = 1;
    else if (Math.abs(pz - best.z0) < e) n.z = -1; else if (Math.abs(pz - best.z1) < e) n.z = 1;
    else if (Math.abs(py - best.y1) < e) n.y = 1; else n.y = -1;
    FAKE_B.x = best.x0; FAKE_B.y = best.y0; FAKE_B.z = best.z0; FAKE_B.w = best.x1 - best.x0; FAKE_B.h = best.y1 - best.y0; FAKE_B.d = best.z1 - best.z0;
    return { t: bestT, point: { x: px, y: py, z: pz }, normal: n, building: FAKE_B, interior: room.id, target: best.target || null };
  }

  // ------------------------------------------------------------- wrappers --
  var wrapped = { world: false, combat: false, update: false, env: false };
  function wrapWorld() {
    var Wd = W(); if (!Wd || wrapped.world || !Wd.heightAt) return;
    wrapped.world = true;
    var oH = Wd.heightAt, oS = Wd.solidAt, oR = Wd.resolveCapsule, oRay = Wd.raycastBuildings, oT = Wd.tileAt;
    Wd.heightAt = function (x, z, y) { if (x < FAR_X) { var r = roomAt(x, z); if (r) return 0; } return oH.apply(this, arguments); };
    Wd.solidAt = function (x, z, y) { if (x < FAR_X) { var r = roomAt(x, z); if (r) return roomSolid(r, x, z, y == null ? 0 : y); } return oS.apply(this, arguments); };
    Wd.resolveCapsule = function (x, z, y, r) { if (x < FAR_X) { var rm = roomAt(x, z); if (rm) return roomResolve(rm, x, z, y == null ? 0 : y, r || 0.4); } return oR.apply(this, arguments); };
    if (oRay) Wd.raycastBuildings = function (ox, oy, oz, dx, dy, dz, maxDist) { if (ox < FAR_X) { var r = roomAt(ox, oz); if (r) return roomRay(r, ox, oy, oz, dx, dy, dz, maxDist); } return oRay.apply(this, arguments); };
    if (oT && Wd.T) Wd.tileAt = function (x, z) { if (x < FAR_X && roomAt(x, z)) return Wd.T.PLAZA; return oT.apply(this, arguments); };
    // the HUD's district chip: the district of the shop's landmark (the Strip for the Strip's Both Sides Arms)
    var oD = Wd.districtAt;
    if (oD) Wd.districtAt = function (x, z) {
      if (x < FAR_X && roomAt(x, z)) {
        var lm = S.current && S.current.landmark, ds = Wd.districts || [];
        for (var i = 0; lm && i < ds.length; i++) if (ds[i] && (ds[i].id === lm.district || ds[i] === lm.district)) return ds[i];
        if (!S.fakeDistrict) S.fakeDistrict = Object.assign({}, ds[0] || {}, { id: 'interior', name: 'Indoors' });
        return S.fakeDistrict;
      }
      return oD.apply(this, arguments);
    };
    Wd.heightAt._interiors = Wd.solidAt._interiors = Wd.resolveCapsule._interiors = true;
  }
  // Combat.fire asks Interiors.canFire before a player shot and calls Interiors.onPlayerShot after one, and Combat.update runs
  // Interiors.update every step (08_combat.js); this installer only wraps a Combat that predates those hooks
  function wrapCombat() {
    var CB = GTP.Combat; if (!CB || wrapped.combat || !CB.fire) return;
    wrapped.combat = true;
    if (CB.fire._interiors) { wrapped.update = !!(CB.update && CB.update._interiors); return; }
    var oFire = CB.fire;
    CB.fire = function (ped, weaponId) {
      if (ped && ped.kind === 'player' && S.active && !Interiors.canFire(ped)) return false;
      var r = oFire.apply(this, arguments);
      if (r && ped && ped.kind === 'player') Interiors.onPlayerShot(ped);
      return r;
    };
    CB.fire._interiors = true;
    if (CB.update && !CB.update._interiors) {
      var oU = CB.update;
      CB.update = function (dt) { var r = oU.apply(this, arguments); try { Interiors.update(dt); } catch (e) { report(e, 'update'); } return r; };
      wrapped.update = true;
    }
  }
  function wrapRender() {
    var R = Rd(); if (!R || wrapped.env || !R.updateEnvironment) return;
    wrapped.env = true;
    var Wx = R.weather;
    if (Wx && Wx.frame) {
      var oF = Wx.frame;
      Wx.frame = function () { var r = oF.apply(this, arguments); if (S.active) { if (Wx._rain) Wx._rain.visible = false; if (Wx._puddles) Wx._puddles.visible = false; } return r; };
    }
    var oE = R.updateEnvironment;
    R.updateEnvironment = function () { var r = oE.apply(this, arguments); if (S.active) indoorLight(); return r; };
  }
  // indoors the sun and sky stop counting: the room's own lights do the work at any hour
  function indoorEnv() {
    if (S.indoorEnv) return S.indoorEnv;
    var R = Rd(); if (!R || !R.renderer || !THREE.PMREMGenerator) return null;
    var tex = canvasTex('indoorEnv', 256, 128, function (c, w, h) {
      var g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#c8c4bc'); g.addColorStop(0.45, '#8a8780'); g.addColorStop(0.55, '#4a4846'); g.addColorStop(1, '#232325');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fffaf0'; for (var i = 0; i < 8; i++) c.fillRect(8 + i * 32, 10 + (i % 2) * 14, 18, 6);
    });
    tex.mapping = THREE.EquirectangularReflectionMapping;
    try { var pm = new THREE.PMREMGenerator(R.renderer); S.indoorEnv = pm.fromEquirectangular(tex).texture; pm.dispose(); } catch (e) { report(e, 'indoorEnv'); S.indoorEnv = null; }
    return S.indoorEnv;
  }
  function indoorLight() {
    var R = Rd(), L = R && R.lights; if (!L) return;
    if (R.scene) { var env = indoorEnv(); if (env && R.scene.environment !== env) { if (R.scene.environment) S.envMap = R.scene.environment; R.scene.environment = env; } }
    if (L.sun) L.sun.intensity = 0;
    if (L.hemi) { L.hemi.intensity = 0.12; }
    if (L.fill) L.fill.intensity = 0;
    if (R.scene && R.scene.fog) { R.scene.fog.near = 80; R.scene.fog.far = 400; R.scene.fog.color.set(0x15161a); }
    if (R.renderer) { R.renderer.setClearColor(0x15161a, 1); if (R.renderer.toneMapping !== THREE.NoToneMapping) R.renderer.toneMappingExposure = 1.05; }
    L.exposure = 1.05;
    if (R.env) R.env.exposure = 1.05;
  }
  function outdoorEnv(R) { if (R.scene && S.indoorEnv && R.scene.environment === S.indoorEnv) R.scene.environment = S.envMap || null; S.envMap = null; }
  function ensureWrapped() { wrapWorld(); wrapCombat(); wrapRender(); }

  function zoneOf(room, x, z) {
    for (var k in room.zones) { var q = room.zones[k]; if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) return k; }
    return null;
  }
  function canShoot(p) { return !!(S.room && zoneOf(S.room, p.x, p.z) === 'range'); }
  function muzzleLine() {
    var g = game(), t = g && g.time ? g.time.t : 0;
    if (t - S.muzzleT < 5) return;
    S.muzzleT = t;
    var clerk = S.npcs[0];
    var line = S.room && S.room.kind === 'armory' ? pickLine(LINES.merleMuzzle) : 'Not in here.';
    if (clerk && clerk.ped) clerk.ped.speakLine(line);
    emit('interior:line', { who: clerk ? clerk.def.name : null, text: line });
  }

  // ------------------------------------------------------------- the fade --
  function overlay() {
    if (S.overlay || typeof document === 'undefined') return S.overlay;
    var host = document.getElementById('stage') || document.body; if (!host) return null;
    var d = document.createElement('div'); d.id = 'interiorFade';
    d.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;background:#000;opacity:0;pointer-events:none;z-index:5';
    host.appendChild(d); S.overlay = d;
    return d;
  }
  function setFade(a) {
    if (GTP.UI && GTP.UI.interiorFade) return;   // the UI draws its own when it has one
    var d = overlay(); if (d) d.style.opacity = String(U.clamp(a, 0, 1).toFixed(3));
  }

  // ------------------------------------------------------------- the NPCs --
  function spawnNpcs(room) {
    S.npcs = [];
    if (!GTP.Ped || !GTP.Entities) return;
    for (var i = 0; i < room.npcs.length; i++) {
      var d = room.npcs[i], cast = d.cast && GTP.Content && GTP.Content.cast ? GTP.Content.cast[d.cast] : null;
      var look = cast && cast.look ? Object.assign({}, cast.look) : Object.assign({}, d.look || { skin: 2, hair: 'short', shirt: '#2a3a2a', pants: '#3a3a3a' });
      try {
        var x = room.ox + d.x, z = room.oz + d.z;
        var p = new GTP.Ped({ x: x, z: z, look: look, role: d.role || 'clerk', persistent: true, weapon: 'fist' });
        p.y = 0; p.yaw = d.yaw || 0; p.moveYaw = p.yaw; p.aimYaw = p.yaw; if (p.snap) p.snap();
        p.castId = d.cast || null; p.name = cast ? cast.name : d.name; p.interior = room.id;
        p.ai = { phase: 0.5, mode: 'mission', mission: 'interior', ambient: false, mute: true, barkT: 1.2 }; p._barkColor = d.color || null;
        GTP.Entities.add(p);
        S.npcs.push({ ped: p, def: d, x: x, z: z, hello: false });
      } catch (e) { report(e, 'npc'); }
    }
  }
  function removeNpcs() {
    for (var i = 0; i < S.npcs.length; i++) { var p = S.npcs[i].ped; if (p && !p.removed) { try { if (p.destroy) p.destroy(); GTP.Entities.remove(p); } catch (e) { report(e, 'npc.remove'); } } }
    S.npcs = [];
  }
  function npcTick(dt, p) {
    for (var i = 0; i < S.npcs.length; i++) {
      var n = S.npcs[i], q = n.ped; if (!q || q.removed || !q.alive) continue;
      if (Math.abs(q.x - n.x) > 0.6 || Math.abs(q.z - n.z) > 0.6) { q.x = n.x; q.z = n.z; q.vx = q.vz = 0; }
      if (q.intent) { q.intent.x = 0; q.intent.z = 0; }
      var d = U.dist2d(p.x, p.z, q.x, q.z), want = d < 9 ? U.dirToYaw(p.x - q.x, p.z - q.z) : (n.def.yaw || 0);
      q.yaw = U.angleLerp(q.yaw, want, Math.min(1, dt * 5)); q.moveYaw = q.yaw; q.aimYaw = q.yaw;
      if (GTP.AI && GTP.AI.syncBark && q.mesh) { try { GTP.AI.syncBark(q); } catch (e) { /* optional */ } }   // phase 0.5 keeps the AI's ped tick (and its bark sprite) off them
      if (q.ai) { q.ai.barkT -= dt; if (!n.hello && q.ai.barkT <= 0 && d < 12) { n.hello = true; var ln = n.def.hello ? n.def.hello() : ''; if (ln) { q.speakLine(ln); emit('interior:line', { who: n.def.name, text: ln }); } } }
    }
  }
  function clerkSay(kind) {
    var n = S.npcs[0]; if (!n || !n.ped) return;
    var ln = pickLine(shopBarks(kind) || (kind === 'range' ? LINES.merleRange : null) || LINES.merleHello);
    if (ln) { n.ped.speakLine(ln); emit('interior:line', { who: n.def.name, text: ln }); }
  }

  // ----------------------------------------------------------- the prompt --
  // one floating card in the room: the browse label, the buy prompt, the interaction hint
  function promptSprite() {
    if (S.prompt) return S.prompt;
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 176;
    var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    sp.scale.set(1.25, 0.43, 1); sp.renderOrder = 10; sp.visible = false; sp.name = 'interior:prompt';
    S.prompt = { sprite: sp, cv: cv, ctx: cv.getContext('2d'), tex: tex, key: '' };
    return S.prompt;
  }
  function showPrompt(lines, x, y, z, accent) {
    var P = promptSprite(), key = lines.join('|') + accent;
    if (P.sprite.parent !== Rd().scene && Rd().scene) Rd().scene.add(P.sprite);
    P.sprite.visible = true; P.sprite.position.set(x, y, z);
    if (key === P.key) return;
    P.key = key; S.promptText = lines.join(' / ');
    var c = P.ctx, w = 512, h = 176;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(8,9,11,0.86)'; c.fillRect(0, 0, w, h); c.fillStyle = accent || '#3fd27f'; c.fillRect(0, 0, 10, h);
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillStyle = '#ffffff'; c.font = '900 40px "Arial Black", Impact, sans-serif'; c.fillText(String(lines[0] || '').toUpperCase(), 26, 40, w - 40);
    c.font = '700 30px Arial, sans-serif'; c.fillStyle = '#e8e2d0'; c.fillText(lines[1] || '', 26, 92, w - 40);
    c.fillStyle = accent || '#3fd27f'; c.font = '900 30px Arial, sans-serif'; c.fillText(lines[2] || '', 26, 140, w - 40);
    P.tex.needsUpdate = true;
    emit('interior:prompt', { text: S.promptText });
  }
  function hidePrompt() { if (S.prompt) S.prompt.sprite.visible = false; if (S.prompt) S.prompt.key = ''; S.promptText = null; }
  function keyName() { var UI = GTP.UI; if (UI && UI.glyph) { try { var gl = UI.glyph('action'); if (gl) return String(gl); } catch (e) { /* optional */ } } return 'E'; }
  function uiArmory() { var UI = GTP.UI; return !!(UI && (UI.openArmory || UI.armoryCard || UI.armory || UI.handlesArmory)); }

  // ------------------------------------------------------------ browsing --
  var _v = null, _d = null;
  function lookTarget(room, p) {
    var R = Rd(), cam = R && R.camera, best = null, bestT = 1e9, i, it;
    if (cam) {
      if (!_v) { _v = new THREE.Vector3(); _d = new THREE.Vector3(); }
      cam.getWorldPosition(_v); cam.getWorldDirection(_d);
      for (i = 0; i < room.items.length; i++) {
        it = room.items[i]; if (!it.box) continue;
        var bx = U.clamp(p.x, it.box.x0, it.box.x1), bz = U.clamp(p.z, it.box.z0, it.box.z1);
        if ((p.x - bx) * (p.x - bx) + (p.z - bz) * (p.z - bz) > 5.4 * 5.4) continue;   // across the counter to the back wall
        var t = rayBox(_v.x, _v.y, _v.z, _d.x, _d.y, _d.z, it.box.x0, it.box.y0, it.box.z0, it.box.x1, it.box.y1, it.box.z1, 30);
        if (t > 0 && t < bestT) { bestT = t; best = it; }
      }
    }
    if (best) return best;
    // the fallback: the nearest item within 2.4 m in front of the player
    var f = U.yawToDir(p.yaw), bd = 1e9;
    for (i = 0; i < room.items.length; i++) {
      it = room.items[i]; if (!it.box) continue;
      var dx = it.x - p.x, dz = it.z - p.z, d = Math.sqrt(dx * dx + dz * dz); if (d > 2.4 || d < 0.01) continue;
      var dot = (dx * f.x + dz * f.z) / d; if (dot < 0.72) continue;
      var score = d - dot * 0.8 + Math.abs(it.y - (p.y + 1.4)) * 0.6;
      if (score < bd) { bd = score; best = it; }
    }
    return best;
  }
  function labelFor(it, st) {
    var e = it.entry, k = keyName();
    if (S.confirm && S.confirm.item === it) {
      if (S.confirm.msg) return [e.name, S.confirm.msg, ''];
      return [e.name, S.confirm.ammo ? 'Ammo: ' + (st.ammoName || 'a box') + ' $' + st.ammoPrice : 'Buy for $' + st.price + '?', '[' + k + '] CONFIRM'];
    }
    if (st.locked) return [e.name, 'LOCKED' + (st.lockReason ? ': ' + st.lockReason : ''), '[' + k + '] INSPECT'];
    if (st.owned && st.ammoItem) return [e.name, 'OWNED. Ammo $' + st.ammoPrice, '[' + k + '] INSPECT / AMMO'];
    if (st.owned) return [e.name, 'OWNED', '[' + k + '] INSPECT'];
    return [e.name, st.price > 0 ? '$' + st.price : 'Ask Merle', '[' + k + '] INSPECT'];
  }
  function browseTick(dt, room, p) {
    if (S.confirm) { S.confirm.t -= dt; if (S.confirm.t <= 0) S.confirm = null; }
    var it = lookTarget(room, p);
    S.browse = it;
    if (!it) return false;
    var st = itemStatus(it.entry), off = it.face === 'e' ? [0.45, 0] : it.face === 'w' ? [-0.45, 0] : it.face === 's' ? [0, 0.45] : it.face === 'n' ? [0, -0.45] : [0, 0];
    showPrompt(labelFor(it, st), it.x + off[0], it.y + (it.face === 'up' ? 0.75 : 0.5), it.z + off[1], st.locked ? '#d08a4a' : '#3fd27f');
    if (pressed('action')) {
      var e = it.entry;
      if (S.confirm && S.confirm.item === it && !S.confirm.msg) {
        var res = purchase(S.confirm.ammo ? st.ammoItem : (st.itemId || e.itemId)); statusCache.key = null;
        var why = res && res.ok ? 'SOLD' : res && res.reason === 'funds' ? 'Not enough cash' : res && res.reason === 'locked' ? 'Locked' : res && res.reason === 'owned' ? 'Already yours' : res && res.reason === 'full' ? 'Full' : 'No sale';
        S.confirm = { item: it, t: 2.2, msg: why };
        clerkSay(res && res.ok ? 'sale' : res && res.reason === 'locked' ? 'locked' : 'funds');
        emit('armory:buy', { itemId: e.itemId, weaponId: e.weaponId, ok: !!(res && res.ok), reason: res && res.reason });
      } else {
        emit('armory:inspect', { weaponId: e.weaponId, itemId: st.itemId || e.itemId, name: e.name, price: st.price, owned: st.owned, locked: st.locked, store: S.current && S.current.store });
        // no armory card in the UI yet: the in-world prompt takes the purchase (a second press confirms)
        if (!uiArmory() && !st.locked && (!st.owned || st.ammoItem)) S.confirm = { item: it, t: 5, ammo: !!st.owned };
      }
    }
    return true;
  }

  // ------------------------------------------------------- interactions --
  var LABELS = {};
  function interactTick(dt, room, p) {
    var near = null, nd = 1e9;
    for (var i = 0; i < room.inter.length; i++) { var q = room.inter[i], d = U.dist2d(p.x, p.z, q.x, q.z); if (d < q.r && d < nd) { nd = d; near = q; } }
    S.near = near;
    if (!near) { S.holdExit = 0; return false; }
    var k = keyName();
    if (near.kind === 'exit') {
      showPrompt(['Exit', 'Walk out or press ' + k, ''], near.x, 2.2, near.z - 0.4, '#e8e2d0');
      var mv = In() && In().move, moving = mv && (Math.abs(mv.x) + Math.abs(mv.z) > 0.3);
      var facing = Math.cos(U.wrapAngle(p.yaw - (near.face || 0))) > 0.5;
      if (pressed('action') || (moving && facing && nd < 0.75)) { S.holdExit += dt; if (S.holdExit >= 0.1 || pressed('action')) { S.holdExit = 0; Interiors.exit(); } }
      else S.holdExit = 0;
      return true;
    }
    if (near.kind === 'range') return rangeBoothTick(dt, room, p, near);
    var labels = LABELS[k] || (LABELS[k] = { clerk: ['Merle Firmness', 'Ammo, gear and the full list', '[' + k + '] SHOP'], clothing: ['Lanyard & Co.', 'Outfits, hats, glasses', '[' + k + '] BROWSE'], booth: ['Changing booth', 'Try something on', '[' + k + '] CHANGE'],
      chair: ['Barber chair', 'A cut, a shave, a take', '[' + k + '] SIT'], bed: ['Bed', 'Sleep six hours and save', '[' + k + '] SLEEP'], wardrobe: ['Wardrobe', 'Change outfit', '[' + k + '] OPEN'] });
    var lb = labels[near.kind] || [near.label || near.kind, '', '[' + k + ']'];
    showPrompt(lb, near.x, 2.3, near.z, '#3fd27f');
    if (pressed('action')) activate(near, p);
    return true;
  }
  function activate(q, p) {
    var store = S.current && S.current.store, lm = S.current && S.current.landmark;
    if (q.kind === 'clerk') {
      var CB = GTP.Combat;
      // the UI's armory: openArmory(storeId, weaponId); shop:open still goes out so a `shop` objective (and the audio cue) hear it
      var sid = (store && (store.id || store)) || (lm && lm.id) || null, lmo = lm && typeof lm === 'object' ? lm : (sid && W() && W().landmark ? W().landmark(sid) : null);
      if (GTP.UI && GTP.UI.openArmory) { try { GTP.UI.openArmory(sid, null); } catch (e) { report(e, 'ui.openArmory'); } emit('shop:open', { landmark: lmo, store: sid, counter: true }); }
      else if (CB && CB.shop && CB.shop.open) { try { CB.shop.open(lm || store); } catch (e2) { report(e2, 'shop.open'); } }
      clerkSay('door');
      return;
    }
    if (q.kind === 'clothing' || q.kind === 'booth' || q.kind === 'wardrobe') {
      emit('clothing:open', { store: store, wardrobe: q.kind === 'wardrobe', booth: q.kind === 'booth' });
      if (!(GTP.UI && GTP.UI.openClothing) && !(GTP.Systems && GTP.Systems.clothing)) fallbackOutfit(p);
      return;
    }
    if (q.kind === 'chair') {
      emit('barber:open', { store: store });
      if (!(GTP.UI && GTP.UI.openBarber) && !(GTP.Systems && GTP.Systems.barber)) fallbackHair(p);
      return;
    }
    if (q.kind === 'bed') { sleep(p); return; }
  }
  // fallbacks until the systems / ui tracks land: cycle outfits and haircuts on the player and rebuild the mesh
  var OUTFITS = [
    { name: 'The Panelist', shirt: '#1e2a44', pants: '#2a2f4a', tie: 'red' }, { name: 'The Contrarian', shirt: '#c0392b', pants: '#1c1c1e', tie: 'none' },
    { name: 'The Fact Check', shirt: '#f2efe4', pants: '#5a6c8c', tie: 'navy' }, { name: 'The Podcast Hoodie', shirt: '#3a3a3a', pants: '#2a2a2a', tie: 'none' },
    { name: 'The Donor Dinner', shirt: '#2f8a4f', pants: '#1e2a44', tie: 'gold' }, { name: 'The Campus Classic', shirt: '#f4f4f4', pants: '#2a2f4a', tie: 'red' }
  ];
  var HAIRS = ['short', 'slick', 'pompadour', 'bun', 'mohawk', 'afro', 'bob', 'long'];
  function rebuild(p) {
    var R = Rd(); if (!R) return;
    try {
      if (R.rebuildEntityMesh) R.rebuildEntityMesh(p);
      else if (R.detach && R.attach) { R.detach(p); p.mesh = null; R.attach(p); }
    } catch (e) { report(e, 'rebuild'); }
  }
  function fallbackOutfit(p) {
    p.look = p.look || {};
    S.outfit = ((S.outfit == null ? -1 : S.outfit) + 1) % OUTFITS.length;
    var o = OUTFITS[S.outfit]; p.look.shirt = o.shirt; p.look.pants = o.pants; p.look.tie = o.tie;
    rebuild(p); toast('Outfit: ' + o.name + '. The receipt is a vibe.');
  }
  function fallbackHair(p) {
    p.look = p.look || {};
    var i = HAIRS.indexOf(p.look.hair || 'short'); p.look.hair = HAIRS[(i + 1) % HAIRS.length];
    var cost = 25; if (p.money >= cost) { p.money -= cost; }
    rebuild(p); toast('Fresh cut: ' + p.look.hair + '. $' + cost + '. Tip included, apparently.');
  }
  function sleep(p) {
    var g = game(); if (!g) return;
    var Ms = GTP.Missions, busy = Ms && Ms.state && Ms.state.active;
    p.hp = p.maxHp || p.hp;
    if (!busy && g.time) { g.time.clock += 6; if (g.time.clock >= 24) { g.time.clock -= 24; g.time.day = (g.time.day || 0) + 1; } }
    var ok = false;
    try { ok = g.saveSlot ? g.saveSlot(g.activeSlot || 1, { reason: 'safehouse' }) : (g.save ? g.save() : false); } catch (e) { report(e, 'sleep.save'); }
    emit('safehouse:sleep', { store: S.current && S.current.store, saved: !!ok });
    toast(ok ? 'Slept on it. Game saved.' : 'Slept on it. The save didn\'t take.');
  }

  // ------------------------------------------------------------- the range --
  function rangeBoothTick(dt, room, p, q) {
    if (RANGE.running) return false;
    RANGE.cool -= dt;
    var again = RANGE.needLeave && RANGE.last;
    showPrompt(['The Range', again ? 'Last round: ' + RANGE.last.score + (RANGE.last.medal ? ', ' + RANGE.last.medal.toUpperCase() : '') : '60 s. Hecklers pop up. Not the moderator.', RANGE.cool > 0 ? 'RESETTING...' : again ? 'STEP OFF AND BACK ON TO GO AGAIN' : 'HOLD STILL TO START'], q.x, 2.4, q.z - 0.6, '#3fd27f');
    if (RANGE.cool > 0 || RANGE.needLeave) { RANGE.hold = 0; return true; }
    RANGE.hold += dt;
    if (RANGE.hold >= 0.6) { RANGE.hold = 0; startRange(p); }
    return true;
  }
  function copyInv(p) {
    var w = {}, a = {}, k;
    for (k in p.weapons) w[k] = p.weapons[k];
    if (p.ammo) for (k in p.ammo) a[k] = Object.assign({}, p.ammo[k]);
    return { weapons: w, ammo: a, weapon: p.weapon };
  }
  function rangeWeapon(p) {
    var CB = GTP.Combat, W2 = CB && CB.WEAPONS || {};
    function ok(id) { var w = W2[id]; return w && !w.melee && !w.cone && !w.lobbed && !w.rocket && p.weapons && p.weapons[id] > 0; }
    if (ok(p.weapon)) return p.weapon;
    var pref = ['pistol', 'revolver', 'smg', 'rifle', 'shotgun', 'sniper'];
    for (var i = 0; i < pref.length; i++) if (ok(pref[i])) return pref[i];
    return W2.pistol ? 'pistol' : null;
  }
  function startRange(p) {
    var room = S.room; if (!room || !room.range || RANGE.running) return false;
    // range rounds are on the house: the inventory is put back exactly as it was when the round ends
    RANGE.loan = copyInv(p);
    var id = rangeWeapon(p);
    if (id) {
      var CB = GTP.Combat;
      p.weapons[id] = Math.max(p.weapons[id] > 0 ? p.weapons[id] : 0, 400);
      if (CB && CB.ammo) { try { CB.ammo(p, id); } catch (e) { /* optional */ } }
      p.weapon = id;
    }
    RANGE.running = true; RANGE.t = 0; RANGE.score = 0; RANGE.hits = 0; RANGE.shots = 0; RANGE.spawnT = COUNTDOWN + 0.4; RANGE.last = null;
    RANGE.rng = GTP.makeRng ? GTP.makeRng(0x7A46E + (RANGE.rounds = (RANGE.rounds || 0) + 1)) : null;
    room.range.targets.forEach(function (t) { t.state = 'down'; t.t = 0; t.ang = -Math.PI / 2; t.moderator = false; t.board.material = t.mats.heckler; if (t.mover) { t.x = t.x0; t.pivot.position.x = t.x0 - room.ox; } t.pivot.rotation.x = t.ang; t.pivot.visible = false; });
    emit('range:start', { store: S.current && S.current.store, weapon: id, seconds: ROUND });
    clerkSay('range');
    drawBoard();
    return true;
  }
  function rr() { return RANGE.rng ? RANGE.rng.random() : rnd(); }
  function raise(t, life, mod) {
    t.state = 'rising'; t.t = 0; t.life = life; t.moderator = !!mod; t.board.material = mod ? t.mats.moderator : t.mats.heckler;
    if (t.mover) { t.dir = rr() < 0.5 ? 1 : -1; t.speed = 2.0 + rr() * 1.4 + RANGE.t / ROUND; var room = S.room; t.x = room.ox + (t.dir > 0 ? 2.0 : 10.0); t.pivot.position.x = t.x - room.ox; }
  }
  function settleTargets(dt, room) {
    var R = room.range; if (!R) return;
    for (var i = 0; i < R.targets.length; i++) {
      var t = R.targets[i]; if (t.state === 'down') continue;
      t.state = 'falling'; t.ang = Math.max(-Math.PI / 2, t.ang - dt * 7);
      if (t.ang <= -Math.PI / 2) { t.state = 'down'; if (t.mover) { t.x = t.x0; t.pivot.position.x = t.x0 - room.ox; } }
      t.pivot.rotation.x = t.ang; t.pivot.visible = t.ang > -1.45;
    }
  }
  function rangeTick(dt, room, p) {
    if (!RANGE.running) { settleTargets(dt, room); if (RANGE.needLeave && room.booth && U.dist2d(p.x, p.z, room.booth.x, room.booth.z) > room.booth.r + 0.3) RANGE.needLeave = false; return; }
    RANGE.t += dt;
    var R = room.range, i, t, live = 0, el = RANGE.t - COUNTDOWN;
    if (el >= 0) {
      for (i = 0; i < R.targets.length; i++) if (R.targets[i].state !== 'down') live++;
      RANGE.spawnT -= dt;
      if (RANGE.spawnT <= 0 && el < ROUND - 1) {
        var k = el / ROUND, maxLive = k < 0.35 ? 2 : 3;
        if (live < maxLive) {
          var free = R.targets.filter(function (q) { return q.state === 'down'; });
          if (free.length) { var pick = free[Math.floor(rr() * free.length)]; raise(pick, pick.mover ? 9 : U.lerp(2.6, 1.6, k), rr() < 0.14); }
        }
        RANGE.spawnT = U.lerp(1.25, 0.75, k) * (0.8 + rr() * 0.4);
      }
    }
    for (i = 0; i < R.targets.length; i++) {
      t = R.targets[i];
      if (t.state === 'rising') { t.ang = Math.min(0, t.ang + dt * 9); if (t.ang >= 0) { t.state = 'up'; t.t = 0; } }
      else if (t.state === 'up') {
        t.t += dt;
        if (t.mover) { t.x += t.dir * t.speed * dt; t.pivot.position.x = t.x - room.ox; if (t.x < room.ox + 1.9 || t.x > room.ox + 10.1) t.state = 'falling'; }
        if (t.t >= t.life) t.state = 'falling';
      } else if (t.state === 'falling') { t.ang = Math.max(-Math.PI / 2, t.ang - dt * 7); if (t.ang <= -Math.PI / 2) { t.state = 'down'; if (t.mover) { t.x = t.x0; t.pivot.position.x = t.x0 - room.ox; } } }
      t.pivot.rotation.x = t.ang; t.pivot.visible = t.ang > -1.45;
    }
    RANGE.boardT = (RANGE.boardT || 0) - dt; if (RANGE.boardT <= 0) { RANGE.boardT = 0.1; drawBoard(); }
    if (el >= ROUND) endRange(false);
    else if (zoneOf(room, p.x, p.z) !== 'range' || !p.alive) endRange(true);
  }
  function drawBoard() {
    var tex = texCache.scoreboard; if (!tex) return;
    RANGE.best = Math.max(RANGE.best, S.saved.rangeBest || 0);
    drawScoreboard(tex.userData.ctx, 512, 136, RANGE); tex.needsUpdate = true;
  }
  function endRange(aborted) {
    if (!RANGE.running) return;
    var p = player(), medal = aborted ? null : medalFor(RANGE.score);
    RANGE.running = false; RANGE.cool = 2.5; RANGE.needLeave = true;
    if (p && RANGE.loan) {
      var L = RANGE.loan; p.weapons = L.weapons; p.ammo = L.ammo; p.weapon = L.weapon;
      var CB = GTP.Combat; if (CB && CB.ammo) { try { for (var k in p.weapons) if (p.weapons[k] > 0 && p.weapons[k] !== Infinity) CB.ammo(p, k); } catch (e) { /* optional */ } }
    }
    RANGE.loan = null;
    var firstOf = null;
    if (!aborted) {
      S.saved.rangeBest = Math.max(S.saved.rangeBest || 0, RANGE.score);
      if (medal && !S.saved.medals[medal]) { firstOf = medal; S.saved.medals[medal] = true; }
    }
    RANGE.best = S.saved.rangeBest || 0;
    RANGE.last = { score: RANGE.score, medal: medal, aborted: !!aborted };
    var room = S.room;
    if (room && room.range) room.range.targets.forEach(function (t) { if (t.state !== 'down') t.state = 'falling'; });
    // a first medal of each tier pays a little: Merle's "loyalty program"
    var bonus = firstOf ? ({ bronze: 50, silver: 150, gold: 400 })[firstOf] : 0;
    if (bonus && p) p.money = (p.money || 0) + bonus;
    emit('range:end', { score: RANGE.score, medal: medal, hits: RANGE.hits, shots: RANGE.shots, best: RANGE.best, aborted: !!aborted, bonus: bonus });
    var n = S.npcs[0];
    if (n && n.ped && !aborted) { var ln = medal === 'gold' ? LINES.merleGold : medal ? medal.charAt(0).toUpperCase() + medal.slice(1) + '. ' + pickLine(shopBarks('sale') || ['That\'s balance.']) : LINES.merleNone; n.ped.speakLine(ln); emit('interior:line', { who: n.def.name, text: ln }); }
    if (!aborted) toast('RANGE: ' + RANGE.score + ' points' + (medal ? ', ' + medal.toUpperCase() + ' medal' : ', no medal') + (bonus ? '. Loyalty bonus $' + bonus : ''));
    drawBoard();
  }
  var _o = null, _dir = null;
  // the shot's ray: through the crosshair while aiming, else from the chest along the facing with a little assist onto
  // the nearest standing target (the targets are not entities, so Combat's lock-on can't find them)
  function rangeShot(p) {
    var room = S.room, R = room.range, cam = Rd() && Rd().camera;
    if (!_o) { _o = new THREE.Vector3(); _dir = new THREE.Vector3(); }
    RANGE.shots++;
    if (RANGE.t < COUNTDOWN) return;
    if (p.aiming && cam) { cam.getWorldPosition(_o); cam.getWorldDirection(_dir); }
    else {
      _o.set(p.x, p.y + 1.45, p.z);
      var yaw = p.aimYaw != null ? p.aimYaw : p.yaw, f = U.yawToDir(yaw), best = null, bd = 0.13;
      for (var i = 0; i < R.targets.length; i++) {
        var q = R.targets[i]; if (q.ang < -0.3 || q.state === 'down') continue;
        var dx = q.x - p.x, dz = q.z - p.z, d = Math.sqrt(dx * dx + dz * dz), cs = (dx * f.x + dz * f.z) / d, ang = Math.acos(U.clamp(cs, -1, 1));
        if (ang < bd) { bd = ang; best = q; }
      }
      if (best) _dir.set(best.x - _o.x, best.y + 1.25 - _o.y, best.z - _o.z).normalize(); else _dir.set(f.x, 0, f.z);
    }
    var hit = roomRay(room, _o.x, _o.y, _o.z, _dir.x, _dir.y, _dir.z, 80);
    if (!hit || !hit.target) return;
    var t = hit.target, hx = hit.point.x - t.x, hy = hit.point.y - t.y, pts = 0, zone = null;
    var hdx = hx, hdy = hy - 1.62;
    if (hdx * hdx + hdy * hdy < 0.155 * 0.155) { pts = 10; zone = 'head'; }
    else if (Math.abs(hx) < 0.3 && hy > 0.85 && hy < 1.5) { pts = 5; zone = 'body'; }
    else if (Math.abs(hx) < 0.2 && hy > 0.05 && hy <= 0.85) { pts = 2; zone = 'legs'; }
    if (!zone) return;
    if (t.moderator) { pts = -10; zone = 'moderator'; }
    RANGE.score = Math.max(0, RANGE.score + pts); RANGE.hits++;
    t.state = 'falling';
    if (Rd() && Rd().fx && Rd().fx.add) { try { Rd().fx.add({ type: 'puff', x: hit.point.x, y: hit.point.y, z: hit.point.z + 0.05, color: t.moderator ? 0xff5a4a : 0xd6c29a, size: 0.35, life: 0.5, vy: 0.4 }); } catch (e) { /* optional */ } }
    emit('range:hit', { points: pts, zone: zone, score: RANGE.score, moderator: t.moderator });
    drawBoard();
  }

  // ---------------------------------------------------------- the doors --
  function doorsOff() { var Wd = W(); return Interiors.autoDoors === false || !!(Wd && (Wd.doors || Wd.doorMarkers)); }
  function refreshDoors() {
    var Wd = W(); if (!Wd || !Wd.landmarks) return;
    if (S.doorSeed === Wd._seed && S.doorCount === Wd.landmarks.length) return;
    S.doorSeed = Wd._seed; S.doorCount = Wd.landmarks.length;
    S.doors.forEach(function (d) { if (d.sprite && d.sprite.parent) d.sprite.parent.remove(d.sprite); });
    S.doors = [];
    for (var i = 0; i < Wd.landmarks.length; i++) {
      var lm = Wd.landmarks[i], kind = templateFor(lm); if (!kind || !lm.door) continue;
      var b = lm.building, nx = 0, nz = 0;
      if (b) { var cx = b.x + b.w / 2, cz = b.z + b.d / 2, dx = cx - lm.door.x, dz = cz - lm.door.z, l = Math.sqrt(dx * dx + dz * dz) || 1; if (Math.abs(dx) > Math.abs(dz)) { nx = dx > 0 ? 1 : -1; } else { nz = dz > 0 ? 1 : -1; } void l; }
      // the walk-in point is on the facade straight in from the door marker (the marker itself sits out on the sidewalk)
      var fx = b ? U.clamp(lm.door.x, b.x, b.x + b.w) : lm.door.x, fz = b ? U.clamp(lm.door.z, b.z, b.z + b.d) : lm.door.z;
      var d = { lm: lm, kind: kind, x: fx, z: fz, y: lm.door.y || 0, nx: nx, nz: nz, armed: true, hold: 0, sprite: null };
      S.doors.push(d);
      var R = Rd();
      if (R && R.scene && typeof document !== 'undefined') {
        var label = kind === 'armory' ? 'WALK IN' : kind === 'clothing' ? 'WALK IN' : kind === 'barber' ? 'WALK IN' : 'HOME';
        var tex = signTex('door-' + kind, '▼ ' + label, { w: 256, h: 64, fg: kind === 'armory' ? '#3fd27f' : '#ffd27a', neon: true, size: 34 });
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        sp.scale.set(1.4, 0.35, 1); sp.position.set(d.x - nx * 0.5, d.y + 2.7, d.z - nz * 0.5); sp.name = 'interior:door:' + lm.id; sp.visible = false;
        R.scene.add(sp); d.sprite = sp;
      }
    }
  }
  function doorsTick(dt, p) {
    if (doorsOff()) { S.doors.forEach(function (d) { if (d.sprite) d.sprite.visible = false; }); return; }
    refreshDoors();
    var g = game(), playing = g && g.state === 'playing';
    for (var i = 0; i < S.doors.length; i++) {
      var d = S.doors[i], dist = U.dist2d(p.x, p.z, d.x, d.z);
      if (d.sprite) d.sprite.visible = dist < 30 && !p.inVehicle;
      if (dist > 3) { d.armed = true; d.hold = 0; continue; }
      if (!d.armed || !playing || p.inVehicle || !p.alive || p.knockedDown || Math.abs(p.y - d.y) > 2) { d.hold = 0; continue; }
      // walking into the door: close to it, facing the building and pushing that way
      var f = U.yawToDir(p.yaw), mv = In() && In().move, pushing = mv && (Math.abs(mv.x) + Math.abs(mv.z) > 0.3);
      var into = (d.nx || d.nz) ? f.x * d.nx + f.z * d.nz : 1;
      var faceDist = d.lm.building ? distToBox(p.x, p.z, d.lm.building) : dist;
      if (dist < 1.9 && into > 0.55 && pushing && faceDist < 0.8) {
        d.hold += dt;
        if (d.hold >= 0.2) {
          d.hold = 0;
          if ((p.wanted | 0) > 0) { var t = g.time ? g.time.t : 0; if (t - (S.heatToast || -9) > 4) { S.heatToast = t; toast('The door won\'t open with stars on you. Lose the heat first.'); } continue; }
          d.armed = false;
          Interiors.enter(d.kind, { landmark: d.lm, door: { x: d.x - d.nx * 1.2, z: d.z - d.nz * 1.2, y: d.y, yaw: U.dirToYaw(-d.nx || 0.0001, -d.nz) } });
        }
      } else d.hold = 0;
    }
  }
  function distToBox(x, z, b) { var cx = U.clamp(x, b.x, b.x + b.w), cz = U.clamp(z, b.z, b.z + b.d); return Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz)); }

  // ------------------------------------------------------- enter and exit --
  function resolveTarget(id, opts) {
    opts = opts || {};
    var Wd = W(), lm = opts.landmark || null, kind = null;
    if (lm && typeof lm === 'string' && Wd && Wd.landmark) lm = Wd.landmark(lm);
    if (id && typeof id === 'object') { lm = id; id = null; }
    if (typeof id === 'string') {
      if (BUILDERS[id]) kind = id;
      else if (TEMPLATE_KIND[id]) kind = TEMPLATE_KIND[id];
      else if (Wd && Wd.landmark && Wd.landmark(id)) { lm = Wd.landmark(id); }
      else if (/^safe_/.test(id)) { kind = 'safehouse'; opts.branch = opts.branch || id; }
    }
    if (!kind && lm) kind = templateFor(lm);
    if (!kind) return null;
    var store = opts.store || (lm && lm.id) || null;
    var branch = opts.branch || (kind === 'armory' ? branchOf(lm || store) : kind === 'safehouse' ? (lm && lm.id) || store || 'def' : 'main');
    return { kind: kind, lm: lm, store: store, branch: branch };
  }
  function returnPoint(tg, opts, p) {
    if (opts && opts.door) return { x: opts.door.x, z: opts.door.z, y: opts.door.y || 0, yaw: opts.door.yaw != null ? opts.door.yaw : p.yaw };
    var lm = tg.lm;
    if (lm && lm.door) {
      var b = lm.building, nx = 0, nz = 0;
      if (b) { var dx = lm.door.x - (b.x + b.w / 2), dz = lm.door.z - (b.z + b.d / 2); if (Math.abs(dx) > Math.abs(dz)) nx = dx > 0 ? 1 : -1; else nz = dz > 0 ? 1 : -1; }
      var fx = b ? U.clamp(lm.door.x, b.x, b.x + b.w) : lm.door.x, fz = b ? U.clamp(lm.door.z, b.z, b.z + b.d) : lm.door.z;
      if (b && Math.abs(fx - lm.door.x) + Math.abs(fz - lm.door.z) > 1.4) { fx += nx * 1.2; fz += nz * 1.2; } else { fx = lm.door.x + nx * 0.3; fz = lm.door.z + nz * 0.3; }
      return { x: fx, z: fz, y: lm.door.y || 0, yaw: (nx || nz) ? U.dirToYaw(nx, nz) : p.yaw };
    }
    return { x: p.x, z: p.z, y: p.y, yaw: p.yaw };
  }
  function place(p, x, z, y, yaw) {
    var g = game();
    if (g && g.debug && g.debug.teleport) g.debug.teleport(x, z, y);
    else { p.x = x; p.z = z; p.y = y; p.vx = p.vz = p.vy = 0; if (p.snap) p.snap(); }
    p.yaw = yaw; p.moveYaw = yaw; p.aimYaw = yaw;
    var R = Rd(); if (R && R.rig) { R.rig.yaw = yaw; if (R.rig.snap) R.rig.snap(); if (R.updateCamera) { try { R.updateCamera(0); } catch (e) { /* optional */ } } }
  }
  function doEnter(tg, ret) {
    var p = player(); if (!p) return false;
    var room = roomFor(tg.kind, tg.branch); if (!room) return false;
    var R = Rd(); if (R && R.scene && room.group.parent !== R.scene) R.scene.add(room.group);
    room.group.visible = true;
    S.room = room; S.ret = ret; S.active = true; Interiors.active = true;
    S.current = Interiors.current = { id: tg.kind, kind: tg.kind, store: tg.store, branch: tg.branch, landmark: tg.lm || null, room: room };
    S.confirm = null; S.browse = null; S.outfit = null;
    if (p.inVehicle && p.exitVehicle) { try { p.exitVehicle(); } catch (e) { /* optional */ } }
    place(p, room.ox + room.spawn.x, room.oz + room.spawn.z, 0, room.spawn.yaw);
    spawnNpcs(room);
    if (R) { R._envClock = null; indoorLight(); }
    if (texCache.scoreboard) drawBoard();
    emit('interior:enter', { id: tg.kind, kind: tg.kind, store: tg.store, branch: tg.branch, landmark: tg.lm || null });
    return true;
  }
  function doExit() {
    var p = player(), room = S.room, cur = S.current;
    if (RANGE.running) endRange(true);
    removeNpcs(); hidePrompt();
    var shop = GTP.Combat && GTP.Combat.shop; if (shop && shop.state && shop.state.open && shop.close) { try { shop.close(); } catch (e) { /* optional */ } }
    if (room) { room.group.visible = false; if (room.group.parent) room.group.parent.remove(room.group); }
    S.active = false; Interiors.active = false; S.room = null; S.current = Interiors.current = null; S.confirm = null; S.browse = null;
    var ret = S.ret; S.ret = null;
    if (p && ret) place(p, ret.x, ret.z, ret.y, ret.yaw);
    for (var i = 0; i < S.doors.length; i++) if (p && U.dist2d(p.x, p.z, S.doors[i].x, S.doors[i].z) < 3) S.doors[i].armed = false;
    var R = Rd(); if (R) { R._envClock = null; outdoorEnv(R); }   // the next frame recomputes the sky and sun
    emit('interior:exit', { id: cur ? cur.id : null, kind: cur ? cur.kind : null, store: cur ? cur.store : null });
    return true;
  }

  var Interiors = GTP.Interiors = {
    active: false,
    current: null,
    autoDoors: true,
    range: RANGE,
    MEDALS: MEDALS,
    templates: ['armory', 'clothing', 'barber', 'safehouse'],
    medalFor: medalFor,
    enter: function (id, opts) {
      ensureWrapped();
      opts = opts || {};
      var p = player(); if (!p || !p.alive || S.active || S.trans) return false;
      var tg = resolveTarget(id, opts); if (!tg) return false;
      var ret = returnPoint(tg, opts, p);
      if (p.inVehicle && !opts.force) return false;
      emit('interior:fade', { phase: 'out', id: tg.kind });
      if (opts.instant) { var ok = doEnter(tg, ret); emit('interior:fade', { phase: 'in', id: tg.kind }); setFade(0); return ok; }
      S.trans = { dir: 'in', t: 0, tg: tg, ret: ret, done: false, ctl: p.controlEnabled };
      p.controlEnabled = false;
      return true;
    },
    exit: function (opts) {
      ensureWrapped();
      opts = opts || {};
      if (!S.active || S.trans) return false;
      emit('interior:fade', { phase: 'out', id: S.current && S.current.id });
      if (opts.instant) { var id = S.current && S.current.id; doExit(); emit('interior:fade', { phase: 'in', id: id }); setFade(0); return true; }
      var p = player();
      S.trans = { dir: 'out', t: 0, done: false, ctl: p ? p.controlEnabled : true };
      if (p) p.controlEnabled = false;
      return true;
    },
    update: function (dt) {
      ensureWrapped();
      var p = player(); if (!p) return;
      if (S.player !== p) { newPlayer(p); return; }
      if (S.trans) {
        var T = S.trans; T.t += dt;
        if (!p.alive && !T.done) { setFade(0); S.trans = null; return; }   // wasted or busted on the doorstep: no corpse goes shopping
        if (!T.done) { setFade(T.t / 0.3); if (T.t >= 0.3) { T.done = true; if (T.dir === 'in') doEnter(T.tg, T.ret); else doExit(); emit('interior:fade', { phase: 'in', id: T.tg ? T.tg.kind : null }); } }
        else { setFade(1 - (T.t - 0.3) / 0.3); if (T.t >= 0.6) { setFade(0); p.controlEnabled = T.ctl !== false; S.trans = null; } }
        return;
      }
      if (!S.active) { doorsTick(dt, p); return; }
      var room = S.room;
      // left the room some other way (a respawn, a teleport, a loaded save): tidy up without moving the player
      if (!room || roomAt(p.x, p.z) !== room) { S.ret = null; doExitQuiet(); return; }
      npcTick(dt, p);
      rangeTick(dt, room, p);
      var g = game(); if (!g || g.state !== 'playing') { hidePrompt(); return; }
      if (GTP.Combat && GTP.Combat.shop && GTP.Combat.shop.state && GTP.Combat.shop.state.open) { hidePrompt(); return; }
      var shown = interactTick(dt, room, p);
      if (!shown && zoneOf(room, p.x, p.z) === 'store' && room.items.length) shown = browseTick(dt, room, p);
      if (!shown) hidePrompt();
    },
    // tests / tools
    // Combat's hooks: may the player shoot here (no, except on the range; pulling the trigger earns Merle's line), and a shot taken
    canFire: function (p) {
      if (!S.active || canShoot(p)) return true;
      var I0 = In(); if (I0 && I0.down && I0.down('shoot')) muzzleLine();   // E (action) also reaches fire: interacting is not shooting
      return false;
    },
    onPlayerShot: function (p) { if (RANGE.running && S.room && S.room.range) { try { rangeShot(p); } catch (e) { report(e, 'rangeShot'); } } },
    rooms: function () { return S.rooms; },
    room: function () { return S.room; },
    roomAt: roomAt,
    stock: stock,
    state: S,
    debug: {
      build: function (kind, branch) { return roomFor(kind, branch || (kind === 'armory' ? 'strip' : 'main')); },
      items: function () { return S.room ? S.room.items.map(function (it) { return { weaponId: it.entry.weaponId, itemId: it.entry.itemId, name: it.entry.name, x: it.x, y: it.y, z: it.z, face: it.face, box: it.box }; }) : []; },
      targets: function () { return S.room && S.room.range ? S.room.range.targets.map(function (t) { return { x: t.x, z: t.z, y: t.y, state: t.state, ang: t.ang, moderator: t.moderator, mover: t.mover }; }) : []; },
      interactables: function () { return S.room ? S.room.inter.map(function (q) { return { kind: q.kind, x: q.x, z: q.z, r: q.r }; }) : []; },
      prompt: function () { return S.promptText || null; },
      browse: function () { return S.browse ? { weaponId: S.browse.entry.weaponId, name: S.browse.entry.name } : null; },
      startRange: function () { var p = player(); return p ? startRange(p) : false; },
      endRange: function (aborted) { endRange(!!aborted); return RANGE.last; },
      raiseAll: function () { if (!S.room || !S.room.range) return 0; var n = 0; S.room.range.targets.forEach(function (t) { if (!t.mover) { raise(t, 30, false); t.ang = 0; t.state = 'up'; t.pivot.rotation.x = 0; t.pivot.visible = true; n++; } }); return n; },
      doors: function () { refreshDoors(); return S.doors.map(function (d) { return { id: d.lm.id, kind: d.kind, x: d.x, z: d.z, nx: d.nx, nz: d.nz }; }); }
    },
    serialize: function () { return { rangeBest: S.saved.rangeBest | 0, medals: Object.assign({}, S.saved.medals) }; },
    deserialize: function (d) { if (!d) return; S.saved.rangeBest = d.rangeBest | 0; S.saved.medals = Object.assign({}, d.medals || {}); RANGE.best = S.saved.rangeBest; }
  };
  // a New Game or a load swapped the player: drop the range loan unapplied (it belongs to the old player), cancel the
  // fade, leave the room quietly and start the range record over unless a load just restored it
  function newPlayer(p) {
    var had = !!S.player;
    S.player = p;
    if (!had) return;
    RANGE.loan = null; RANGE.running = false; RANGE.needLeave = false;
    if (S.trans) { S.trans = null; setFade(0); }
    if (S.active) { S.ret = null; doExitQuiet(); }
    if (!S.loaded) { S.saved = { rangeBest: 0, medals: {} }; RANGE.best = 0; RANGE.last = null; }
    S.loaded = false;
  }
  function doExitQuiet() {
    if (RANGE.running) endRange(true);
    removeNpcs(); hidePrompt();
    var room = S.room; if (room) { room.group.visible = false; if (room.group.parent) room.group.parent.remove(room.group); }
    var cur = S.current;
    S.active = false; Interiors.active = false; S.room = null; S.current = Interiors.current = null;
    var R = Rd(); if (R) { R._envClock = null; outdoorEnv(R); }
    emit('interior:exit', { id: cur ? cur.id : null, kind: cur ? cur.kind : null, store: cur ? cur.store : null, quiet: true });
  }

  // ------------------------------------------------------------------ saves --
  // a save made inside a room (the safehouse bed) stores the door outside, never the far-west room coordinates
  GTP.SaveHooks = GTP.SaveHooks || [];
  GTP.SaveHooks.push({
    name: 'interiors',
    save: function (data) {
      data.interiors = Interiors.serialize();
      var ret = S.active ? S.ret : null;
      if (S.active && ret) { data.x = ret.x; data.z = ret.z; data.y = ret.y; data.yaw = ret.yaw; }
      // a save in the middle of a range round keeps what the player owned, not the free range rounds
      if (RANGE.loan) {
        var L = RANGE.loan, w = {}, a = {}, k;
        for (k in L.weapons) w[k] = L.weapons[k];
        for (k in L.ammo) a[k] = Object.assign({}, L.ammo[k]);
        data.weapons = w; data.ammo = a; data.weapon = L.weapon;
      }
    },
    load: function (data) {
      RANGE.loan = null; RANGE.running = false; RANGE.needLeave = false;   // the loaded inventory wins over any range loan
      if (data && data.interiors) Interiors.deserialize(data.interiors); else Interiors.deserialize({ rangeBest: 0, medals: {} });
      if (S.active) { S.ret = null; doExitQuiet(); }
      if (S.trans) { S.trans = null; setFade(0); }
      S.loaded = true; S.player = player() || S.player;
    }
  });
  GTP.SaveRegistry = GTP.SaveRegistry || {};
  GTP.SaveRegistry.interiors = { get: function () { return Interiors.serialize(); }, set: function (d) { Interiors.deserialize(d); } };

  ensureWrapped();
})();
