/* Grand Theft Pundit: 02_input.js
 * GTP.Input: keyboard, mouse buttons + look deltas (pointer lock optional),
 * wheel, gamepad (standard layout, optional), touch hooks (UI fills them),
 * virtual actions for tests (set / setLook), a text queue for the seed field.
 *
 * Actions: forward back left right run jump action shoot aim enter weaponNext
 *          weaponPrev horn radio map pause confirm back cameraMode lockOn
 *          reload wheel waypoint zoomIn zoomOut secondary tabNext
 *          quickUp quickRight quickDown quickLeft   (gamepad d-pad quick slots)
 *          cover special                            (v0.3: Q / tap B; Shift+right mouse, X / L3)
 *          pitchUp pitchDown rollLeft rollRight yawLeft yawRight throttleUp throttleDown   (aircraft)
 *
 * v0.3 (PLAN_V03 ui): `cover` is Q on the keyboard and a tap of B on the pad (B held is still sprint; a press shorter
 * than 0.22 s also counts as cover). `special` is Shift + right mouse (it aims too, so Focus works while aiming), X on
 * the keyboard, L3 on the pad (camera mode leaves the pad on foot; V keeps it). Aircraft: W / S pitch (W noses down),
 * A / D roll, Q / E yaw, Shift / Ctrl throttle or collective up / down; on the pad the left stick pitches and rolls, LB / RB
 * yaw, RT / LT throttle (pad context 'air'). Boats reuse the car controls. `Input.flight = {pitch, roll, yaw, throttle}`
 * (-1..1 each, pitch +1 = nose up) is computed every step from all devices for the vehicles track.
 * `Input.latch(actions)` holds the listed actions released until every physical source lets go: the UI latches
 * shoot / action when a click or E closes a dialogue, so the same press never fires the gun (QA CMB-06).
 *
 * Gamepad (GDD_EXPANSION 6.8): sticks move / look (menus: navigate / zoom), A jump
 * or handbrake (menus: confirm), B sprint or horn (back), X reload or radio
 * (secondary / delete), Y enter / exit (tab), LB / RB weapon prev / next (pages),
 * LT aim (zoom out), RT shoot (zoom in), Back map, Start pause, L3 camera, R3
 * lock-on / wheel (hold), d-pad quick slots (menus: navigate). Dead zone 0.18,
 * look 2.4 rad/s at full deflection (the rig reads look.dx in pixels: 14 px per
 * unit per step). `Input.lastDevice` ('keyboard' | 'gamepad' | 'touch') tells the
 * UI which glyphs to print; `Input.gamepadEnabled = false` ignores the pad.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};

  var ACTIONS = ['forward', 'back', 'left', 'right', 'run', 'jump', 'action', 'shoot', 'aim', 'enter',
    'weaponNext', 'weaponPrev', 'horn', 'radio', 'map', 'pause', 'confirm', 'cameraMode', 'lockOn',
    'reload', 'wheel', 'waypoint', 'zoomIn', 'zoomOut', 'secondary', 'tabNext', 'cancel',
    'quickUp', 'quickRight', 'quickDown', 'quickLeft',
    'cover', 'special', 'pitchUp', 'pitchDown', 'rollLeft', 'rollRight', 'yawLeft', 'yawRight', 'throttleUp', 'throttleDown'];
  var AIR_TYPES = { heli: 1, plane: 1, jet: 1, helicopter: 1, aircraft: 1 };
  // 'back' is the move action (S / ArrowDown); menus step down with it. 'cancel' (Escape, Backspace, pad B) is the
  // menu back-out. Escape / Backspace no longer carry 'back', so holding them never walks or reverses (QA-B-FE-04);
  // the UI skips a cutscene shot on 'cancel' itself.

  // key code -> list of actions
  var BINDINGS = {
    KeyW: ['forward', 'pitchDown'], ArrowUp: ['forward', 'pitchDown'],
    KeyS: ['back', 'pitchUp'], ArrowDown: ['back', 'pitchUp'],
    KeyA: ['left', 'rollLeft'], ArrowLeft: ['left', 'rollLeft'],
    KeyD: ['right', 'rollRight'], ArrowRight: ['right', 'rollRight'],
    ShiftLeft: ['run', 'throttleUp'], ShiftRight: ['run', 'throttleUp'],
    Space: ['jump', 'confirm'],
    ControlLeft: ['shoot', 'throttleDown'], ControlRight: ['shoot', 'throttleDown'],
    KeyQ: ['cover', 'yawLeft'],
    KeyE: ['action', 'yawRight'],
    KeyX: ['special'],
    KeyF: ['enter'], Enter: ['enter', 'confirm'], NumpadEnter: ['enter', 'confirm'],
    Tab: ['lockOn', 'wheel'],
    BracketRight: ['weaponNext'], BracketLeft: ['weaponPrev'],
    KeyH: ['horn'], KeyN: ['radio'], KeyR: ['reload'], KeyM: ['map'], KeyV: ['cameraMode'],
    Equal: ['zoomIn'], NumpadAdd: ['zoomIn'], Minus: ['zoomOut'], NumpadSubtract: ['zoomOut'],
    Delete: ['secondary'],
    Escape: ['pause', 'cancel'], KeyP: ['pause'], Backspace: ['cancel']
  };
  var PREVENT = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Backspace: 1, Tab: 1, ControlLeft: 1, ControlRight: 1 };

  // standard-layout button index -> action, per context
  var PAD_FOOT = { 0: 'jump', 1: 'run', 2: 'reload', 3: 'enter', 4: 'weaponPrev', 5: 'weaponNext', 6: 'aim', 7: 'shoot', 8: 'map', 9: 'pause', 10: 'special', 11: 'lockOn', 12: 'quickUp', 13: 'quickDown', 14: 'quickLeft', 15: 'quickRight' };
  // in a vehicle the d-pad up is 'action' (start a cab or HOA shift; QA-B-HUD-01), the quick slots keep right / down / left
  var PAD_CAR = { 0: 'jump', 1: 'horn', 2: 'radio', 3: 'enter', 4: 'weaponPrev', 5: 'weaponNext', 6: 'aim', 7: 'shoot', 8: 'map', 9: 'pause', 10: 'special', 11: 'cameraMode', 12: 'action', 13: 'quickDown', 14: 'quickLeft', 15: 'quickRight' };
  var PAD_AIR = { 0: 'jump', 1: 'horn', 2: 'radio', 3: 'enter', 4: 'yawLeft', 5: 'yawRight', 6: 'throttleDown', 7: 'throttleUp', 8: 'map', 9: 'pause', 10: 'special', 11: 'cameraMode', 12: 'quickUp', 13: 'quickDown', 14: 'quickLeft', 15: 'quickRight' };
  var COVER_TAP_MS = 220;   // a B press shorter than this is a cover tap (B held stays sprint)
  var PAD_MENU = { 0: 'confirm', 1: 'cancel', 2: 'secondary', 3: 'tabNext', 4: 'weaponPrev', 5: 'weaponNext', 6: 'zoomOut', 7: 'zoomIn', 8: 'map', 9: 'pause', 12: 'forward', 13: 'back', 14: 'left', 15: 'right' };
  // the debate / ratio war: the menu map, but LT holds SHOUT ('run', as Shift on the keyboard) and X is the HOTTAKE (QA-B-TCH-06)
  var PAD_MINI = Object.assign({}, PAD_MENU, { 6: 'run' });
  var DEAD_ZONE = 0.18, LOOK_PX = 14;   // 14 px per unit deflection per step ~ 2.4 rad/s through the rig's sensitivity

  var keyState = {};      // action -> count of physical keys holding it
  var virt = {};          // action -> bool (Input.set)
  var pressedFlags = {};  // action -> true until endFrame
  var latched = {};       // action -> true while held released after Input.latch (until every source lets go)
  var canvas = null;
  var inited = false;
  var lookAcc = { dx: 0, dy: 0 };   // raw deltas accumulated between frames
  var pad = { index: -1, connected: false, id: '', lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {}, context: 'foot', _stick: { x: 0, y: 0, tx: 0, ty: 0 }, _raw: null };

  var Input = GTP.Input = {
    actions: ACTIONS,
    bindings: BINDINGS,
    padMaps: { foot: PAD_FOOT, car: PAD_CAR, air: PAD_AIR, menu: PAD_MENU, mini: PAD_MINI },
    mouse: { x: 0, y: 0, down: false, right: false, buttons: 0, moved: false, special: false },
    flight: { pitch: 0, roll: 0, yaw: 0, throttle: 0 },   // aircraft axes, -1..1 (pitch +1 nose up, roll +1 right, yaw +1 right)
    look: { dx: 0, dy: 0 },          // look delta for this frame (pixels)
    move: { x: 0, z: 0 },            // normalized move intent in input space (x right, z forward)
    wheelDelta: 0,
    pointerLocked: false,
    pointerLockWanted: true,         // click on the canvas requests pointer lock (optional, may be refused)
    // touch hooks: the UI module fills these (virtual stick + buttons + look area).
    touch: { active: false, stick: { x: 0, y: 0, active: false }, buttons: {}, look: { dx: 0, dy: 0 } },
    gamepad: pad,
    gamepadEnabled: true,            // Settings: OFF ignores the pad entirely
    lastDevice: 'keyboard',          // 'keyboard' | 'gamepad' | 'touch': the UI prints that device's glyphs
    lastDeviceTime: 0,
    // text capture for the seed field: while `capture` is on, printable keys and Backspace / Enter / Escape queue here
    text: { capture: false, queue: [] },
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
      window.addEventListener('gamepadconnected', function (e) { pad.index = e.gamepad.index; pad.connected = true; pad.id = String(e.gamepad.id || ''); });
      window.addEventListener('gamepaddisconnected', function (e) { if (!e.gamepad || e.gamepad.index === pad.index) { pad.index = -1; pad.connected = false; Input._releasePad(); } });
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
      if (latched[action]) return false;
      return rawDown(action);
    },
    pressed: function (action) { return pressedFlags[action] === true && !latched[action]; },
    // hold these actions released until every source (key, button, pad, touch, virtual) lets go of them
    latch: function (actions) {
      if (typeof actions === 'string') actions = [actions];
      for (var i = 0; i < (actions || []).length; i++) { var a = actions[i]; if (rawDown(a)) latched[a] = true; pressedFlags[a] = false; }
    },
    latched: function (action) { return !!latched[action]; },
    // use up this step's presses (a menu or dialogue took the key): Enter / Space / A never also act in play
    consume: function (actions) {
      if (typeof actions === 'string') actions = [actions];
      for (var i = 0; i < (actions || []).length; i++) pressedFlags[actions[i]] = false;
    },
    // the vehicle the player drives is an aircraft (the vehicles track's heli / plane / jet, or vehicle.air)
    inAircraft: function () {
      var g = GTP.game, p = g && g.player, v = p && p.inVehicle;
      return !!(v && (v.air || v.isAircraft || AIR_TYPES[v.type] || AIR_TYPES[v.kind]));
    },
    set: function (action, on) {
      on = !!on;
      if (on && !virt[action] && !(keyState[action] > 0)) pressedFlags[action] = true;
      virt[action] = on;
    },
    // a one-step press (tests and the touch buttons' taps)
    press: function (action) { pressedFlags[action] = true; },
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
      if (pad.index >= 0 && Input.gamepadEnabled) { x += pad.lx; z -= pad.ly; }
      var l = Math.sqrt(x * x + z * z);
      if (l > 1) { x /= l; z /= l; }
      Input.move.x = x; Input.move.z = z;
      Input.updateFlight();
      return Input.move;
    },
    // aircraft axes from keys, the pad (air context: left stick pitch / roll, LB RB yaw, RT LT throttle) and the touch stick
    updateFlight: function () {
      var f = Input.flight;
      var pitch = (Input.down('pitchUp') ? 1 : 0) - (Input.down('pitchDown') ? 1 : 0);
      var roll = (Input.down('rollRight') ? 1 : 0) - (Input.down('rollLeft') ? 1 : 0);
      var yaw = (Input.down('yawRight') ? 1 : 0) - (Input.down('yawLeft') ? 1 : 0);
      var thr = (Input.down('throttleUp') ? 1 : 0) - (Input.down('throttleDown') ? 1 : 0);
      if (Input.touch.stick.active) { roll += Input.touch.stick.x; pitch += Input.touch.stick.y; }   // stick down = pull back = nose up
      if (pad.index >= 0 && Input.gamepadEnabled && pad.context === 'air') {
        roll += pad.lx; pitch += pad.ly;
        thr += (pad.rt || 0) - (pad.lt || 0);
        if (pad.buttons.throttleUp || pad.buttons.throttleDown) thr = U_clamp(thr, -1, 1);
      }
      f.pitch = U_clamp(pitch, -1, 1); f.roll = U_clamp(roll, -1, 1); f.yaw = U_clamp(yaw, -1, 1); f.throttle = U_clamp(thr, -1, 1);
      return f;
    },
    // Called at the start of a step: publishes accumulated look deltas, polls the gamepad.
    beginFrame: function () {
      for (var la in latched) if (latched[la] && !rawDown(la)) latched[la] = false;
      Input._pollGamepad();
      var padLook = pad.index >= 0 && Input.gamepadEnabled;
      Input.look.dx = lookAcc.dx + Input.touch.look.dx + (padLook ? pad.rx * LOOK_PX : 0);
      Input.look.dy = lookAcc.dy + Input.touch.look.dy + (padLook ? pad.ry * LOOK_PX : 0);
      if (padLook && (pad.rx || pad.ry)) Input._markLook();
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
      Input.mouse.down = false; Input.mouse.right = false; Input.mouse.special = false;
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
    padConnected: function () { return pad.index >= 0 && Input.gamepadEnabled; },
    // 80 ms on impacts and shots, scaled by the weapon's recoil; silent where vibrationActuator is missing
    rumble: function (ms, strength) {
      if (pad.index < 0 || !Input.gamepadEnabled || typeof navigator === 'undefined' || !navigator.getGamepads) return false;
      try {
        var g = navigator.getGamepads()[pad.index], act = g && (g.vibrationActuator || (g.hapticActuators && g.hapticActuators[0]));
        if (!act) return false;
        var s = Math.max(0, Math.min(1, strength == null ? 0.6 : strength));
        if (act.playEffect) { var pr = act.playEffect('dual-rumble', { duration: ms || 80, strongMagnitude: s, weakMagnitude: s * 0.7 }); if (pr && pr.catch) pr.catch(function () { /* optional */ }); return true; }
        if (act.pulse) { var pr2 = act.pulse(s, ms || 80); if (pr2 && pr2.catch) pr2.catch(function () { /* optional */ }); return true; }
      } catch (e) { /* haptics are optional */ }
      return false;
    },
    _markLook: function () { Input.lastLookTime = (GTP.game && GTP.game.time) ? GTP.game.time.t : 0; },
    _device: function (d) { Input.lastDevice = d; Input.lastDeviceTime = Date.now(); },
    _releasePad: function () {
      for (var a in pad.buttons) pad.buttons[a] = false;
      pad.lx = pad.ly = pad.rx = pad.ry = pad.lt = pad.rt = 0;
    },
    // which button map applies: menus (title, pause, minigame, cards), the driver's seat, or on foot
    _padContext: function () {
      var g = GTP.game;
      // cutscenes and the CONTEXT STAMPED card use the menu map: A confirms / holds to skip, B skips a shot or quits (QA-B-FE-05)
      if (g && g.state === 'minigame') return 'mini';
      if (!g || g.state !== 'playing') return 'menu';
      var us = GTP.UI && GTP.UI.state;
      if (us && (us.shopOpen || us.modal)) return 'menu';
      if (GTP.UI && typeof GTP.UI.wantsMenuPad === 'function' && GTP.UI.wantsMenuPad()) return 'menu';
      var p = g.player;
      if (p && p.inVehicle) return Input.inAircraft() ? 'air' : 'car';
      return 'foot';
    },
    _pollGamepad: function () {
      if (!Input.gamepadEnabled || typeof navigator === 'undefined' || !navigator.getGamepads) { if (pad.index >= 0 && !Input.gamepadEnabled) Input._releasePad(); return; }
      var gps = null;
      try { gps = navigator.getGamepads(); } catch (e) { return; }
      if (!gps) return;
      var g = pad.index >= 0 ? gps[pad.index] : null;
      if (!g) {   // some browsers list a pad before any gamepadconnected event: take the first live one
        for (var k = 0; k < gps.length; k++) if (gps[k] && gps[k].connected) { g = gps[k]; pad.index = g.index; pad.connected = true; pad.id = String(g.id || ''); break; }
        if (!g) { if (pad.index >= 0) { pad.index = -1; pad.connected = false; Input._releasePad(); } return; }
      }
      pad._raw = g;
      function dz(v) { return Math.abs(v) < DEAD_ZONE ? 0 : v; }
      var ax = g.axes || [];
      pad.lx = dz(ax[0] || 0); pad.ly = dz(ax[1] || 0);
      pad.rx = dz(ax[2] || 0); pad.ry = dz(ax[3] || 0);
      var ctx = Input._padContext(), map = ctx === 'menu' ? PAD_MENU : ctx === 'mini' ? PAD_MINI : ctx === 'car' ? PAD_CAR : ctx === 'air' ? PAD_AIR : PAD_FOOT;
      // a button still held across a context switch (A held to skip a cutscene, A on RETRY) is not a new press in the new
      // map until it is let go (QA-B-FE-05: the held A jumped on the first step back on foot)
      if (ctx !== pad._ctxPrev) {
        pad._stale = {};
        if (pad._ctxPrev) for (var bi = 0; bi < (g.buttons || []).length; bi++) { var bb = g.buttons[bi]; if (bb && (bb.pressed || (typeof bb === 'number' ? bb > 0.5 : bb.value > 0.5))) pad._stale[bi] = true; }
        pad._ctxPrev = ctx;
      }
      pad.context = ctx;
      var nb = {}, b, now, was, used = false;
      for (b in map) {
        var btn = g.buttons[b], on = !!(btn && (btn.pressed || (typeof btn === 'number' ? btn > 0.5 : btn.value > 0.5)));
        if (pad._stale && pad._stale[b]) { if (on) continue; delete pad._stale[b]; }
        if (on) nb[map[b]] = true;
      }
      // triggers on pads that report them as axes
      if (ax.length >= 6) { if (ax[4] > 0.3) nb[map[6]] = true; if (ax[5] > 0.3) nb[map[7]] = true; }
      pad.lt = g.buttons[6] ? (g.buttons[6].value || (g.buttons[6].pressed ? 1 : 0)) : 0;
      pad.rt = g.buttons[7] ? (g.buttons[7].value || (g.buttons[7].pressed ? 1 : 0)) : 0;
      // menus: the left stick steps the selection like the d-pad (one press per crossing, a repeat every 0.25 s while held)
      if (ctx === 'menu' || ctx === 'mini') {
        var st = pad._stick, t = Date.now();
        var sx = pad.lx > 0.5 ? 1 : pad.lx < -0.5 ? -1 : 0, sy = pad.ly > 0.5 ? 1 : pad.ly < -0.5 ? -1 : 0;
        if (sx !== st.x || t - st.tx > 250) { if (sx === 1) pressedFlags.right = true; else if (sx === -1) pressedFlags.left = true; st.tx = t; }
        if (sy !== st.y || t - st.ty > 250) { if (sy === 1) pressedFlags.back = true; else if (sy === -1) pressedFlags.forward = true; st.ty = t; }
        if (sx === 0) st.tx = 0; if (sy === 0) st.ty = 0;
        st.x = sx; st.y = sy;
        if (sx || sy) used = true;
      } else { pad._stick.x = pad._stick.y = 0; }
      for (now in nb) { was = !!pad.buttons[now]; if (!was) { pressedFlags[now] = true; if (now === 'run' && ctx === 'foot') pad._bDown = Date.now(); } pad.buttons[now] = true; used = true; }
      for (was in pad.buttons) if (pad.buttons[was] && !nb[was]) {
        pad.buttons[was] = false;   // a context change releases the old action
        if (was === 'run' && ctx === 'foot' && pad._bDown && Date.now() - pad._bDown < COVER_TAP_MS) pressedFlags.cover = true;   // a tap of B: cover
      }
      if (used || pad.lx || pad.ly || pad.rx || pad.ry) { Input._device('gamepad'); Input.anyKey = true; Input.lastGesture = Date.now(); }
      if (used && !pad._unlocked && GTP.Audio && GTP.Audio.unlock) { try { GTP.Audio.unlock(); pad._unlocked = !!(GTP.Audio.ctx && GTP.Audio.ctx.state === 'running'); } catch (e) { /* audio is optional */ } }   // a pad-only player hears the game (QA-D D-07)
    },
    _pointer: function (clientX, clientY) {
      if (!canvas) return;
      var r = canvas.getBoundingClientRect(), Rd = GTP.Render;
      var kx = r.width && Rd && Rd.width ? Rd.width / r.width : 1, ky = r.height && Rd && Rd.height ? Rd.height / r.height : 1;   // logical HUD pixels on a stage smaller than the logical size (QAC-55)
      Input.mouse.x = (clientX - r.left) * kx; Input.mouse.y = (clientY - r.top) * ky;
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

  function rawDown(action) {
    return (keyState[action] > 0) || virt[action] === true || !!Input.touch.buttons[action] || !!pad.buttons[action];
  }
  function U_clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function onKeyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    var acts = BINDINGS[e.code];
    if (Input.text.capture) {
      // the seed field: digits and letters queue as text; Backspace / Enter / Escape are control keys (Enter / Escape stay bound)
      var key = e.key || '';
      if (key.length === 1 || key === 'Backspace' || key === 'Enter' || key === 'Escape') { if (Input.text.queue.length < 64) Input.text.queue.push(key); e.preventDefault(); }
      Input._gesture(); Input._device('keyboard');
      if (key.length === 1 || key === 'Backspace') return;   // typed into the field, never an action
    }
    if (PREVENT[e.code] || acts) e.preventDefault();
    if (!acts) return;
    Input._gesture(); Input._device('keyboard');
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
    if (Input.lastDevice === 'gamepad' && (e.movementX || e.movementY)) Input._device('keyboard');
  }
  function onMouseDown(e) {
    Input._pointer(e.clientX, e.clientY);
    Input._gesture(); Input._device('keyboard');
    Input.mouse.buttons = e.buttons;
    if (e.button === 0) { Input.mouse.down = true; Input._press('shoot'); Input.requestPointerLock(); }
    if (e.button === 2) {
      Input.mouse.right = true; Input._press('aim');
      if (keyState.run > 0) { Input.mouse.special = true; Input._press('special'); }   // Shift + right mouse: the special
    }
    if (canvas && canvas.focus) canvas.focus();
    e.preventDefault();
  }
  function onMouseUp(e) {
    if (e.button === 0 && Input.mouse.down) { Input.mouse.down = false; Input._release('shoot'); }
    if (e.button === 2 && Input.mouse.right) { Input.mouse.right = false; Input._release('aim'); if (Input.mouse.special) { Input.mouse.special = false; Input._release('special'); } }
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
    Input._gesture(); Input._device('touch');
    Input.touch.active = true;
    if (GTP.UI && GTP.UI.touch && typeof GTP.UI.touch.handle === 'function') {
      try { GTP.UI.touch.handle(e); } catch (err) { GTP.util.reportError(err, 'touch'); }
    }
    if (e.touches && e.touches.length) Input._pointer(e.touches[0].clientX, e.touches[0].clientY);
    if (e.cancelable) e.preventDefault();
  }
})();
