/* Grand Theft Pundit: 02_input.js
 * GTP.Input: keyboard, mouse, wheel, virtual actions (tests + touch).
 * Actions: up down left right run action shoot enter weaponNext weaponPrev
 *          horn radio map pause confirm back
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};

  var ACTIONS = ['up', 'down', 'left', 'right', 'run', 'action', 'shoot', 'enter',
    'weaponNext', 'weaponPrev', 'horn', 'radio', 'map', 'pause', 'confirm', 'back'];

  // key code -> list of actions
  var BINDINGS = {
    KeyW: ['up'], ArrowUp: ['up'],
    KeyS: ['down'], ArrowDown: ['down'],
    KeyA: ['left'], ArrowLeft: ['left'],
    KeyD: ['right'], ArrowRight: ['right'],
    ShiftLeft: ['run'], ShiftRight: ['run'],
    Space: ['action', 'shoot', 'confirm'],
    KeyF: ['enter'], Enter: ['enter', 'confirm'], NumpadEnter: ['enter', 'confirm'],
    KeyQ: ['weaponPrev'], KeyE: ['weaponNext'],
    KeyH: ['horn'], KeyR: ['radio'], KeyM: ['map'],
    Escape: ['pause', 'back'], KeyP: ['pause'], Backspace: ['back']
  };
  var PREVENT = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Backspace: 1, Tab: 1 };

  var keyState = {};      // action -> count of physical keys holding it
  var virt = {};          // action -> bool (Input.set)
  var pressedFlags = {};  // action -> true until endFrame
  var wasDown = {};
  var canvas = null;
  var inited = false;

  var Input = GTP.Input = {
    actions: ACTIONS,
    bindings: BINDINGS,
    mouse: { x: 0, y: 0, sx: 0, sy: 0, worldX: 0, worldY: 0, down: false, moved: false, buttons: 0 },
    wheelDelta: 0,
    // touch hooks: the UI module fills these (virtual stick + buttons).
    touch: { active: false, stick: { x: 0, y: 0, active: false }, buttons: {} },
    anyKey: false,          // true once the user has pressed any key/pointer (audio unlock)
    lastGesture: 0,

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
        cv.setAttribute('tabindex', '0');
      }
    },

    down: function (action) {
      return (keyState[action] > 0) || virt[action] === true || !!Input.touch.buttons[action];
    },
    pressed: function (action) { return pressedFlags[action] === true; },
    set: function (action, on) {
      on = !!on;
      if (on && !virt[action] && !(keyState[action] > 0)) pressedFlags[action] = true;
      virt[action] = on;
    },
    // Axis helper: -1..1 for horizontal/vertical intent (keys + stick).
    axis: function () {
      var x = (Input.down('right') ? 1 : 0) - (Input.down('left') ? 1 : 0);
      var y = (Input.down('down') ? 1 : 0) - (Input.down('up') ? 1 : 0);
      if (Input.touch.stick.active) { x += Input.touch.stick.x; y += Input.touch.stick.y; }
      var l = Math.sqrt(x * x + y * y);
      if (l > 1) { x /= l; y /= l; }
      return { x: x, y: y };
    },
    endFrame: function () {
      for (var k in pressedFlags) pressedFlags[k] = false;
      Input.mouse.moved = false;
      Input.wheelDelta = 0;
    },
    releaseAll: function () {
      for (var i = 0; i < ACTIONS.length; i++) keyState[ACTIONS[i]] = 0;
      Input.mouse.down = false;
    },
    // Convert a client-space pointer position to logical viewport + world coords.
    _pointer: function (clientX, clientY) {
      if (!canvas) return;
      var r = canvas.getBoundingClientRect();
      var px = clientX - r.left, py = clientY - r.top;
      Input.mouse.sx = px; Input.mouse.sy = py;
      var R = GTP.Render;
      if (R && R.clientToLogical) {
        var l = R.clientToLogical(px, py);
        Input.mouse.x = l.x; Input.mouse.y = l.y;
        if (R.screenToWorld) { var w = R.screenToWorld(l.x, l.y); Input.mouse.worldX = w.x; Input.mouse.worldY = w.y; }
      } else { Input.mouse.x = px; Input.mouse.y = py; }
      Input.mouse.moved = true;
    },
    _gesture: function () {
      Input.anyKey = true;
      Input.lastGesture = Date.now();
      if (GTP.Audio && GTP.Audio.unlock) { try { GTP.Audio.unlock(); } catch (e) { /* audio is optional */ } }
    }
  };

  function onKeyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    var acts = BINDINGS[e.code];
    if (PREVENT[e.code] || acts) e.preventDefault();
    if (!acts) return;
    Input._gesture();
    if (e.repeat) return;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (!(keyState[a] > 0) && !virt[a]) pressedFlags[a] = true;
      keyState[a] = (keyState[a] || 0) + 1;
    }
  }
  function onKeyUp(e) {
    var acts = BINDINGS[e.code];
    if (!acts) return;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      keyState[a] = Math.max(0, (keyState[a] || 0) - 1);
    }
  }
  function onMouseMove(e) { Input._pointer(e.clientX, e.clientY); }
  function onMouseDown(e) {
    Input._pointer(e.clientX, e.clientY);
    Input._gesture();
    Input.mouse.buttons = e.buttons;
    if (e.button === 0) { Input.mouse.down = true; if (!virt.shoot && !(keyState.shoot > 0)) pressedFlags.shoot = true; keyState.shoot = (keyState.shoot || 0) + 1; }
    if (canvas && canvas.focus) canvas.focus();
    e.preventDefault();
  }
  function onMouseUp(e) {
    if (e.button === 0 && Input.mouse.down) { Input.mouse.down = false; keyState.shoot = Math.max(0, (keyState.shoot || 0) - 1); }
    Input.mouse.buttons = e.buttons;
  }
  function onWheel(e) {
    e.preventDefault();
    Input.wheelDelta += e.deltaY;
    if (e.deltaY > 0) pressedFlags.weaponNext = true;
    else if (e.deltaY < 0) pressedFlags.weaponPrev = true;
  }
  // Touch: raw events are forwarded to GTP.UI.touch when it exists; the UI
  // module owns the virtual stick/buttons and writes into Input.touch.
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
