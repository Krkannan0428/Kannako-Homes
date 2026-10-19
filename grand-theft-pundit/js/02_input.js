/* Grand Theft Pundit: 02_input.js
 * GTP.Input: keyboard, mouse buttons + look deltas (pointer lock optional),
 * wheel, gamepad (optional), touch hooks (UI fills them), virtual actions
 * for tests (set / setLook).
 *
 * Actions: forward back left right run jump action shoot aim enter weaponNext
 *          weaponPrev horn radio map pause confirm back cameraMode lockOn
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};

  var ACTIONS = ['forward', 'back', 'left', 'right', 'run', 'jump', 'action', 'shoot', 'aim', 'enter',
    'weaponNext', 'weaponPrev', 'horn', 'radio', 'map', 'pause', 'confirm', 'cameraMode', 'lockOn'];
  // 'back' is both the menu action and the move action; menus read pressed('back') via Escape/Backspace,
  // movement reads down('back') from S/ArrowDown. They never conflict in practice because menus pause movement.

  // key code -> list of actions
  var BINDINGS = {
    KeyW: ['forward'], ArrowUp: ['forward'],
    KeyS: ['back'], ArrowDown: ['back'],
    KeyA: ['left'], ArrowLeft: ['left'],
    KeyD: ['right'], ArrowRight: ['right'],
    ShiftLeft: ['run'], ShiftRight: ['run'],
    Space: ['jump', 'confirm'],
    ControlLeft: ['shoot'], ControlRight: ['shoot'],
    KeyQ: ['aim'],
    KeyE: ['action'],
    KeyF: ['enter'], Enter: ['enter', 'confirm'], NumpadEnter: ['enter', 'confirm'],
    Tab: ['lockOn'],
    BracketRight: ['weaponNext'], BracketLeft: ['weaponPrev'],
    KeyH: ['horn'], KeyR: ['radio'], KeyM: ['map'], KeyV: ['cameraMode'],
    Escape: ['pause', 'back'], KeyP: ['pause'], Backspace: ['back']
  };
  var PREVENT = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Backspace: 1, Tab: 1, ControlLeft: 1, ControlRight: 1 };

  var keyState = {};      // action -> count of physical keys holding it
  var virt = {};          // action -> bool (Input.set)
  var pressedFlags = {};  // action -> true until endFrame
  var canvas = null;
  var inited = false;
  var lookAcc = { dx: 0, dy: 0 };   // raw deltas accumulated between frames
  var pad = { index: -1, lx: 0, ly: 0, rx: 0, ry: 0, buttons: {} };

  var Input = GTP.Input = {
    actions: ACTIONS,
    bindings: BINDINGS,
    mouse: { x: 0, y: 0, down: false, right: false, buttons: 0, moved: false },
    look: { dx: 0, dy: 0 },          // look delta for this frame (pixels)
    move: { x: 0, z: 0 },            // normalized move intent in input space (x right, z forward)
    wheelDelta: 0,
    pointerLocked: false,
    pointerLockWanted: true,         // click on the canvas requests pointer lock (optional, may be refused)
    // touch hooks: the UI module fills these (virtual stick + buttons + look area).
    touch: { active: false, stick: { x: 0, y: 0, active: false }, buttons: {}, look: { dx: 0, dy: 0 } },
    gamepad: pad,
    anyKey: false,
    lastGesture: 0,
    lastLookTime: -1e9,              // game time of the last look input (camera auto-yaw reads it)

    init: function (cv) {
      if (inited) return;
      inited = true;
      canvas = cv;
      for (var i = 0; i < ACTIONS.length; i++) { keyState[ACTIONS[i]] = 0; virt[ACTIONS[i]] = false; }
      if (typeof window === 'undefined') return;
      window.addEventListener('keydown', onKeyDown, { passive: false });
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', Input.releaseAll);
      document.addEventListener('visibilitychange', function () { if (document.hidden) Input.releaseAll(); });
      document.addEventListener('pointerlockchange', function () {
        Input.pointerLocked = !!(document.pointerLockElement && document.pointerLockElement === canvas);
      });
      document.addEventListener('pointerlockerror', function () { Input.pointerLocked = false; });
      window.addEventListener('gamepadconnected', function (e) { pad.index = e.gamepad.index; });
      window.addEventListener('gamepaddisconnected', function () { pad.index = -1; });
      if (cv) {
        cv.addEventListener('mousemove', onMouseMove);
        cv.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup', onMouseUp);
        cv.addEventListener('wheel', onWheel, { passive: false });
        cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        cv.addEventListener('touchstart', onTouch, { passive: false });
        cv.addEventListener('touchmove', onTouch, { passive: false });
        cv.addEventListener('touchend', onTouch, { passive: false });
        cv.addEventListener('touchcancel', onTouch, { passive: false });
        if (!cv.hasAttribute('tabindex')) cv.setAttribute('tabindex', '0');
      }
    },

    down: function (action) {
      return (keyState[action] > 0) || virt[action] === true || !!Input.touch.buttons[action] || !!pad.buttons[action];
    },
    pressed: function (action) { return pressedFlags[action] === true; },
    set: function (action, on) {
      on = !!on;
      if (on && !virt[action] && !(keyState[action] > 0)) pressedFlags[action] = true;
      virt[action] = on;
    },
    // virtual look for tests/touch: accumulates into this frame's delta
    setLook: function (dx, dy) {
      lookAcc.dx += dx || 0; lookAcc.dy += dy || 0;
      if (dx || dy) Input._markLook();
    },
    // Movement intent from keys + stick. Call once per step before reading .move.
    updateMove: function () {
      var x = (Input.down('right') ? 1 : 0) - (Input.down('left') ? 1 : 0);
      var z = (Input.down('forward') ? 1 : 0) - (Input.down('back') ? 1 : 0);
      if (Input.touch.stick.active) { x += Input.touch.stick.x; z -= Input.touch.stick.y; }
      if (pad.index >= 0) { x += pad.lx; z -= pad.ly; }
      var l = Math.sqrt(x * x + z * z);
      if (l > 1) { x /= l; z /= l; }
      Input.move.x = x; Input.move.z = z;
      return Input.move;
    },
    // Called at the start of a step: publishes accumulated look deltas, polls the gamepad.
    beginFrame: function () {
      Input._pollGamepad();
      Input.look.dx = lookAcc.dx + Input.touch.look.dx + pad.rx * 14;
      Input.look.dy = lookAcc.dy + Input.touch.look.dy + pad.ry * 14;
      if (pad.rx || pad.ry) Input._markLook();
      lookAcc.dx = 0; lookAcc.dy = 0;
      Input.touch.look.dx = 0; Input.touch.look.dy = 0;
      Input.updateMove();
    },
    endFrame: function () {
      for (var k in pressedFlags) pressedFlags[k] = false;
      Input.mouse.moved = false;
      Input.wheelDelta = 0;
      Input.look.dx = 0; Input.look.dy = 0;
    },
    releaseAll: function () {
      for (var i = 0; i < ACTIONS.length; i++) keyState[ACTIONS[i]] = 0;
      Input.mouse.down = false; Input.mouse.right = false;
    },
    requestPointerLock: function () {
      if (!canvas || Input.pointerLocked || !Input.pointerLockWanted) return;
      try {
        var p = canvas.requestPointerLock && canvas.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(function () { /* refused: mouse look still works while a button is held */ });
      } catch (e) { /* pointer lock is optional */ }
    },
    releasePointerLock: function () {
      try { if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* optional */ }
    },
    _markLook: function () { Input.lastLookTime = (GTP.game && GTP.game.time) ? GTP.game.time.t : 0; },
    _pollGamepad: function () {
      if (pad.index < 0 || typeof navigator === 'undefined' || !navigator.getGamepads) return;
      var gps = null;
      try { gps = navigator.getGamepads(); } catch (e) { return; }
      var g = gps && gps[pad.index];
      if (!g) return;
      function dz(v) { return Math.abs(v) < 0.18 ? 0 : v; }
      pad.lx = dz(g.axes[0] || 0); pad.ly = dz(g.axes[1] || 0);
      pad.rx = dz(g.axes[2] || 0); pad.ry = dz(g.axes[3] || 0);
      var map = { 0: 'jump', 1: 'action', 2: 'enter', 3: 'weaponNext', 4: 'weaponPrev', 5: 'weaponNext', 6: 'aim', 7: 'shoot', 8: 'map', 9: 'pause', 11: 'cameraMode', 12: 'radio', 10: 'horn' };
      for (var b in map) {
        var was = !!pad.buttons[map[b]], now = !!(g.buttons[b] && g.buttons[b].pressed);
        if (now && !was) pressedFlags[map[b]] = true;
        pad.buttons[map[b]] = now;
      }
    },
    _pointer: function (clientX, clientY) {
      if (!canvas) return;
      var r = canvas.getBoundingClientRect();
      Input.mouse.x = clientX - r.left; Input.mouse.y = clientY - r.top;
      Input.mouse.moved = true;
    },
    _gesture: function () {
      Input.anyKey = true;
      Input.lastGesture = Date.now();
      if (GTP.Audio && GTP.Audio.unlock) { try { GTP.Audio.unlock(); } catch (e) { /* audio is optional */ } }
    },
    _press: function (a) { if (!(keyState[a] > 0) && !virt[a]) pressedFlags[a] = true; keyState[a] = (keyState[a] || 0) + 1; },
    _release: function (a) { keyState[a] = Math.max(0, (keyState[a] || 0) - 1); }
  };

  function onKeyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    var acts = BINDINGS[e.code];
    if (PREVENT[e.code] || acts) e.preventDefault();
    if (!acts) return;
    Input._gesture();
    if (e.repeat) return;
    for (var i = 0; i < acts.length; i++) Input._press(acts[i]);
  }
  function onKeyUp(e) {
    var acts = BINDINGS[e.code];
    if (!acts) return;
    for (var i = 0; i < acts.length; i++) Input._release(acts[i]);
  }
  function onMouseMove(e) {
    Input._pointer(e.clientX, e.clientY);
    // look: with pointer lock always; without it only while a button is held (drag to look)
    if (Input.pointerLocked || Input.mouse.down || Input.mouse.right) {
      var dx = e.movementX || 0, dy = e.movementY || 0;
      lookAcc.dx += dx; lookAcc.dy += dy;
      if (dx || dy) Input._markLook();
    }
  }
  function onMouseDown(e) {
    Input._pointer(e.clientX, e.clientY);
    Input._gesture();
    Input.mouse.buttons = e.buttons;
    if (e.button === 0) { Input.mouse.down = true; Input._press('shoot'); Input.requestPointerLock(); }
    if (e.button === 2) { Input.mouse.right = true; Input._press('aim'); }
    if (canvas && canvas.focus) canvas.focus();
    e.preventDefault();
  }
  function onMouseUp(e) {
    if (e.button === 0 && Input.mouse.down) { Input.mouse.down = false; Input._release('shoot'); }
    if (e.button === 2 && Input.mouse.right) { Input.mouse.right = false; Input._release('aim'); }
    Input.mouse.buttons = e.buttons;
  }
  function onWheel(e) {
    e.preventDefault();
    Input.wheelDelta += e.deltaY;
    if (e.deltaY > 0) pressedFlags.weaponNext = true;
    else if (e.deltaY < 0) pressedFlags.weaponPrev = true;
  }
  // Touch: raw events go to GTP.UI.touch (virtual stick, look area, buttons), which writes Input.touch.
  function onTouch(e) {
    Input._gesture();
    Input.touch.active = true;
    if (GTP.UI && GTP.UI.touch && typeof GTP.UI.touch.handle === 'function') {
      try { GTP.UI.touch.handle(e); } catch (err) { GTP.util.reportError(err, 'touch'); }
    }
    if (e.touches && e.touches.length) Input._pointer(e.touches[0].clientX, e.touches[0].clientY);
    if (e.cancelable) e.preventDefault();
  }
})();
