/* Grand Theft Pundit: 10b_postfx.js
 * GTP.PostFX: the post-processing pipeline, written against three r152's core only (no examples/jsm): the scene is
 * drawn into a half-float render target with a depth texture, then
 *   SSAO      hemisphere kernel (QUALITY.ssaoSamples, 8..16) over depth-reconstructed view positions and normals at
 *             half resolution, a depth-aware (bilateral) separable blur, applied subtly in the composite
 *   bloom     a soft-knee threshold that follows the time of day (Render.env), four down / up-sample levels
 *   composite height fog from depth tinted toward the sun, AO, bloom, exposure, ACES filmic, colour grading
 *             (lift / gamma / gain, a warm / teal split by the hour, saturation), vignette, light grain, sRGB out
 *   FXAA      the last pass, on the display-referred image
 * GTP.PostFX.enabled follows the quality preset (Render.quality.apply -> setPreset); when off, render() draws the
 * scene straight to the canvas and the renderer's own ACES tone mapping applies. Render.frame calls
 * GTP.PostFX.render(renderer, scene, camera) every frame.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  var U = GTP.util;

  var QUAD_V = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  var COMMON = [
    'float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }',
    'float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }'
  ].join('\n');

  var SSAO_F = [
    'uniform sampler2D tDepth; uniform vec2 resolution; uniform float cameraNear, cameraFar, radius, bias, intensity; uniform mat4 projection, inverseProjection;',
    'uniform vec3 kernel[16]; uniform int samples;',
    'varying vec2 vUv;',
    COMMON,
    'float linDepth(float d) { float z = d * 2.0 - 1.0; return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear)); }',
    'vec3 viewPos(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 p = inverseProjection * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }',
    'void main() {',
    '  float d = texture2D(tDepth, vUv).x;',
    '  if (d >= 0.9999) { gl_FragColor = vec4(1.0); return; }',
    '  vec3 P = viewPos(vUv);',
    '  vec2 px = 1.0 / resolution;',
    '  vec3 Px = viewPos(vUv + vec2(px.x, 0.0)), Pxn = viewPos(vUv - vec2(px.x, 0.0));',
    '  vec3 Py = viewPos(vUv + vec2(0.0, px.y)), Pyn = viewPos(vUv - vec2(0.0, px.y));',
    '  vec3 dx = (abs(Px.z - P.z) < abs(Pxn.z - P.z)) ? Px - P : P - Pxn;',
    '  vec3 dy = (abs(Py.z - P.z) < abs(Pyn.z - P.z)) ? Py - P : P - Pyn;',
    '  vec3 N = normalize(cross(dx, dy));',
    '  float ang = hash12(gl_FragCoord.xy) * 6.2831853;',
    '  vec3 rnd = vec3(cos(ang), sin(ang), 0.0);',
    '  vec3 T = normalize(rnd - N * dot(rnd, N));',
    '  vec3 B = cross(N, T);',
    '  mat3 TBN = mat3(T, B, N);',
    '  float occ = 0.0; float dist = -P.z; float rad = radius * clamp(1.0 + dist * 0.01, 1.0, 2.5);',
    '  for (int i = 0; i < 16; i++) {',
    '    if (i >= samples) break;',
    '    vec3 S = P + TBN * kernel[i] * rad;',
    '    vec4 o = projection * vec4(S, 1.0); o.xyz /= o.w; vec2 suv = o.xy * 0.5 + 0.5;',
    '    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;',
    '    float sz = viewPos(suv).z;',
    '    float rangeCheck = smoothstep(0.0, 1.0, rad / max(abs(P.z - sz), 1e-4));',
    '    occ += (sz >= S.z + bias ? 1.0 : 0.0) * rangeCheck;',
    '  }',
    '  occ = 1.0 - occ / float(samples);',
    '  float fade = 1.0 - smoothstep(60.0, 160.0, dist);',
    '  gl_FragColor = vec4(vec3(mix(1.0, pow(occ, intensity), fade)), 1.0);',
    '}'].join('\n');

  var BLUR_F = [
    'uniform sampler2D tAO, tDepth; uniform vec2 direction, resolution; uniform float cameraNear, cameraFar;',
    'varying vec2 vUv;',
    'float linDepth(float d) { float z = d * 2.0 - 1.0; return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear)); }',
    'void main() {',
    '  float d0 = linDepth(texture2D(tDepth, vUv).x);',
    '  float sum = 0.0, wsum = 0.0;',
    '  for (int i = -4; i <= 4; i++) {',
    '    vec2 uv = vUv + direction * float(i) / resolution;',
    '    float d = linDepth(texture2D(tDepth, uv).x);',
    '    float w = exp(-float(i * i) * 0.12) * exp(-abs(d - d0) * 0.6);',
    '    sum += texture2D(tAO, uv).x * w; wsum += w;',
    '  }',
    '  gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);',
    '}'].join('\n');

  var THRESH_F = [
    'uniform sampler2D tDiffuse; uniform float threshold, knee; varying vec2 vUv;',
    COMMON,
    'void main() {',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    // a NaN or an overflowed half float in the scene must not seed the whole chain (bilinear up-sampling spreads it)
    '  if (c.r != c.r || c.g != c.g || c.b != c.b) c = vec3(0.0);',
    '  c = min(c, vec3(48.0));',
    '  float l = luma(c);',
    '  float soft = clamp(l - threshold + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);',
    '  float w = max(soft, l - threshold) / max(l, 1e-4);',
    '  gl_FragColor = vec4(c * w, 1.0);',
    '}'].join('\n');

  // a 13-tap tent down-sample and a 9-tap tent up-sample (added to the level above)
  var DOWN_F = [
    'uniform sampler2D tDiffuse; uniform vec2 texel; varying vec2 vUv;',
    'void main() {',
    '  vec3 a = texture2D(tDiffuse, vUv + texel * vec2(-2.0, -2.0)).rgb, b = texture2D(tDiffuse, vUv + texel * vec2(0.0, -2.0)).rgb, c = texture2D(tDiffuse, vUv + texel * vec2(2.0, -2.0)).rgb;',
    '  vec3 d = texture2D(tDiffuse, vUv + texel * vec2(-2.0, 0.0)).rgb, e = texture2D(tDiffuse, vUv).rgb, f = texture2D(tDiffuse, vUv + texel * vec2(2.0, 0.0)).rgb;',
    '  vec3 g = texture2D(tDiffuse, vUv + texel * vec2(-2.0, 2.0)).rgb, h = texture2D(tDiffuse, vUv + texel * vec2(0.0, 2.0)).rgb, i = texture2D(tDiffuse, vUv + texel * vec2(2.0, 2.0)).rgb;',
    '  vec3 j = texture2D(tDiffuse, vUv + texel * vec2(-1.0, -1.0)).rgb, k = texture2D(tDiffuse, vUv + texel * vec2(1.0, -1.0)).rgb, l = texture2D(tDiffuse, vUv + texel * vec2(-1.0, 1.0)).rgb, m = texture2D(tDiffuse, vUv + texel * vec2(1.0, 1.0)).rgb;',
    '  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'].join('\n');
  var UP_F = [
    'uniform sampler2D tDiffuse, tPrev; uniform vec2 texel; uniform float prevWeight; varying vec2 vUv;',
    'void main() {',
    '  vec3 s = texture2D(tDiffuse, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tDiffuse, vUv + texel * vec2(1.0, -1.0)).rgb + texture2D(tDiffuse, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tDiffuse, vUv + texel * vec2(1.0, 1.0)).rgb;',
    '  s += 2.0 * (texture2D(tDiffuse, vUv + texel * vec2(0.0, -1.0)).rgb + texture2D(tDiffuse, vUv + texel * vec2(0.0, 1.0)).rgb + texture2D(tDiffuse, vUv + texel * vec2(-1.0, 0.0)).rgb + texture2D(tDiffuse, vUv + texel * vec2(1.0, 0.0)).rgb);',
    '  s += 4.0 * texture2D(tDiffuse, vUv).rgb;',
    '  gl_FragColor = vec4(s / 16.0 + texture2D(tPrev, vUv).rgb * prevWeight, 1.0);',
    '}'].join('\n');

  var COMPOSITE_F = [
    'uniform sampler2D tDiffuse, tBloom, tAO, tDepth;',
    'uniform float bloomStrength, aoStrength, exposure, vignette, grain, time, saturation, contrast, useAO, useBloom;',
    'uniform vec3 lift, gamma, gain, shadowTint, highlightTint, fogColor, sunColor, fogTint;',
    'uniform float fogDensity, fogHeight, fogBase, sunGlow, split;',
    'uniform float cameraNear, cameraFar; uniform mat4 inverseProjection, cameraWorld; uniform vec3 sunDirView;',
    'varying vec2 vUv;',
    COMMON,
    // the same ACES fit three's ACESFilmicToneMapping uses, so the low / medium (renderer) and high (post) paths match
    'vec3 rrtOdt(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }',
    'vec3 aces(vec3 color) {',
    '  const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));',
    '  const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));',
    '  color = inM * (color / 0.6); color = rrtOdt(color); color = outM * color; return clamp(color, 0.0, 1.0);',
    '}',
    'vec3 viewPos(vec2 uv, float d) { vec4 p = inverseProjection * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }',
    'void main() {',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    '  if (c.r != c.r || c.g != c.g || c.b != c.b) c = vec3(0.0);',
    '  c = min(c, vec3(48.0));',
    '  float d = texture2D(tDepth, vUv).x;',
    '  if (useAO > 0.5) { float ao = texture2D(tAO, vUv).x; c *= mix(1.0, ao, aoStrength); }',
    // height fog from depth: denser low down, tinted toward the sun where the view looks into it
    '  if (d < 0.9999) {',
    '    vec3 vp = viewPos(vUv, d);',
    '    float dist = length(vp);',
    '    vec3 wp = (cameraWorld * vec4(vp, 1.0)).xyz;',
    '    vec3 cam = cameraWorld[3].xyz;',
    '    float hA = exp(-max(cam.y - fogBase, 0.0) / fogHeight), hB = exp(-max(wp.y - fogBase, 0.0) / fogHeight);',
    '    float dy = wp.y - cam.y;',
    '    float heightInt = abs(dy) > 0.5 ? (hA - hB) / (dy / fogHeight) : hA;',
    '    float f = 1.0 - exp(-fogDensity * dist * max(heightInt, 0.0));',
    '    float toSun = max(dot(normalize(vp), sunDirView), 0.0);',
    '    vec3 fc = mix(fogColor, sunColor, pow(toSun, 6.0) * sunGlow) * fogTint;',
    '    c = mix(c, fc, clamp(f, 0.0, 0.85));',
    '  }',
    '  if (useBloom > 0.5) c += texture2D(tBloom, vUv).rgb * bloomStrength;',
    '  c *= exposure;',
    '  c = aces(c);',
    // grading in display space: lift / gamma / gain, a split tone by luminance, saturation, a gentle S-curve
    '  c = pow(max(c * gain + lift * (1.0 - c), 0.0), 1.0 / gamma);',
    '  float l = luma(c);',
    '  c *= mix(shadowTint, highlightTint, smoothstep(0.15, 0.85, l)) * split + vec3(1.0 - split);',
    '  c = mix(vec3(luma(c)), c, saturation);',
    '  c = mix(c, c * c * (3.0 - 2.0 * c), contrast);',
    '  float r = length((vUv - 0.5) * vec2(1.15, 1.0));',
    '  c *= 1.0 - vignette * smoothstep(0.45, 1.05, r);',
    '  c += (hash12(gl_FragCoord.xy + fract(time) * 173.0) - 0.5) * grain * (1.0 - l * 0.6);',
    '  c = clamp(c, 0.0, 1.0);',
    '  vec3 srgb = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));',
    '  gl_FragColor = vec4(srgb, 1.0);',
    '}'].join('\n');

  // FXAA 3.11 (quality preset 12), on the display-referred image, luma from the green channel
  var FXAA_F = [
    'uniform sampler2D tDiffuse; uniform vec2 resolution; varying vec2 vUv;',
    'float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }',
    'void main() {',
    '  vec2 px = 1.0 / resolution;',
    '  vec3 rgbM = texture2D(tDiffuse, vUv).rgb;',
    '  float lM = lum(rgbM);',
    '  float lN = lum(texture2D(tDiffuse, vUv + vec2(0.0, -px.y)).rgb), lS = lum(texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb);',
    '  float lW = lum(texture2D(tDiffuse, vUv + vec2(-px.x, 0.0)).rgb), lE = lum(texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb);',
    '  float lMin = min(lM, min(min(lN, lS), min(lW, lE))), lMax = max(lM, max(max(lN, lS), max(lW, lE)));',
    '  float range = lMax - lMin;',
    '  if (range < max(0.0312, lMax * 0.125)) { gl_FragColor = vec4(rgbM, 1.0); return; }',
    '  float lNW = lum(texture2D(tDiffuse, vUv + vec2(-px.x, -px.y)).rgb), lNE = lum(texture2D(tDiffuse, vUv + vec2(px.x, -px.y)).rgb);',
    '  float lSW = lum(texture2D(tDiffuse, vUv + vec2(-px.x, px.y)).rgb), lSE = lum(texture2D(tDiffuse, vUv + vec2(px.x, px.y)).rgb);',
    '  float lNS = lN + lS, lWE = lW + lE, lNWNE = lNW + lNE, lSWSE = lSW + lSE, lNWSW = lNW + lSW, lNESE = lNE + lSE;',
    '  float edgeH = abs(-2.0 * lW + lNWSW) + abs(-2.0 * lM + lNS) * 2.0 + abs(-2.0 * lE + lNESE);',
    '  float edgeV = abs(-2.0 * lN + lNWNE) + abs(-2.0 * lM + lWE) * 2.0 + abs(-2.0 * lS + lSWSE);',
    '  bool horz = edgeH >= edgeV;',
    '  float l1 = horz ? lN : lW, l2 = horz ? lS : lE;',
    '  float g1 = l1 - lM, g2 = l2 - lM;',
    '  bool pair1 = abs(g1) >= abs(g2);',
    '  float gScaled = 0.25 * max(abs(g1), abs(g2));',
    '  float lengthSign = horz ? px.y : px.x;',
    '  if (pair1) lengthSign = -lengthSign;',
    '  float lAvg = 0.5 * ((pair1 ? l1 : l2) + lM);',
    '  vec2 uvEdge = vUv; if (horz) uvEdge.y += lengthSign * 0.5; else uvEdge.x += lengthSign * 0.5;',
    '  vec2 offStep = horz ? vec2(px.x, 0.0) : vec2(0.0, px.y);',
    '  vec2 uvP = uvEdge + offStep, uvN = uvEdge - offStep;',
    '  float lEndP = lum(texture2D(tDiffuse, uvP).rgb) - lAvg, lEndN = lum(texture2D(tDiffuse, uvN).rgb) - lAvg;',
    '  bool doneP = abs(lEndP) >= gScaled, doneN = abs(lEndN) >= gScaled;',
    '  for (int i = 1; i < 12; i++) {',
    '    float st = i < 5 ? 1.0 : (i < 10 ? 2.0 : 4.0);',
    '    if (!doneP) { uvP += offStep * st; lEndP = lum(texture2D(tDiffuse, uvP).rgb) - lAvg; doneP = abs(lEndP) >= gScaled; }',
    '    if (!doneN) { uvN -= offStep * st; lEndN = lum(texture2D(tDiffuse, uvN).rgb) - lAvg; doneN = abs(lEndN) >= gScaled; }',
    '    if (doneP && doneN) break;',
    '  }',
    '  float dP = horz ? (uvP.x - vUv.x) : (uvP.y - vUv.y), dN = horz ? (vUv.x - uvN.x) : (vUv.y - uvN.y);',
    '  bool dirP = dP < dN; float dMin = min(dP, dN), spanLength = dP + dN;',
    '  bool lMLTZ = (lM - lAvg) < 0.0;',
    '  bool goodSpan = dirP ? ((lEndP < 0.0) != lMLTZ) : ((lEndN < 0.0) != lMLTZ);',
    '  float pixelOffset = -dMin / spanLength + 0.5;',
    '  float sb = clamp(abs(((lNS + lWE) * 2.0 + lNWSW + lNESE) / 12.0 - lM) / range, 0.0, 1.0);',
    '  float sd = (-2.0 * sb + 3.0) * sb * sb;',
    '  float subpix = sd * sd * 0.75;',
    '  float finalOffset = max(goodSpan ? pixelOffset : 0.0, subpix);',
    '  vec2 uvF = vUv; if (horz) uvF.y += finalOffset * lengthSign; else uvF.x += finalOffset * lengthSign;',
    '  gl_FragColor = vec4(texture2D(tDiffuse, uvF).rgb, 1.0);',
    '}'].join('\n');

  function mat(frag, uniforms) {
    return new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: QUAD_V, fragmentShader: frag, depthTest: false, depthWrite: false, toneMapped: false });
  }

  var PostFX = GTP.PostFX = {
    enabled: false, ready: false, supported: false,
    renderer: null, width: 1, height: 1,
    // the per-frame look, driven by Render.env (hour, weather) and the quality preset
    params: { bloomThreshold: 1.0, bloomKnee: 0.4, bloomStrength: 0.5, aoRadius: 2.2, aoBias: 0.025, aoIntensity: 2.2, aoStrength: 0.8, exposure: 1.0, vignette: 0.36, grain: 0.012, saturation: 1.16, contrast: 0.2, split: 0.35, fogDensity: 0.0012, fogHeight: 40, fogBase: -2, sunGlow: 0.8 },
    flags: { ssao: false, bloom: true, fxaa: true, grain: false, samples: 12 },
    stats: { passes: 0 },
    _quad: null, _cam: null, _scene: null, _rt: null, _aoRT: null, _aoRT2: null, _bloomRTs: [], _upRTs: [], _bloomOut: null, _threshRT: null, _ldrRT: null, _mats: {}, _kernel: null,

    init: function (renderer) {
      var F = PostFX;
      F.renderer = renderer;
      var gl = renderer.getContext();
      F.isWebGL2 = !!renderer.capabilities.isWebGL2;
      var depthOk = F.isWebGL2 || !!renderer.extensions.get('WEBGL_depth_texture');
      var halfOk = F.isWebGL2 ? !!(renderer.extensions.get('EXT_color_buffer_float') || renderer.extensions.get('EXT_color_buffer_half_float')) : !!(renderer.extensions.get('OES_texture_half_float') && renderer.extensions.get('EXT_color_buffer_half_float'));
      F.supported = depthOk;
      F.hdrType = halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType;
      F._scene = new THREE.Scene();
      F._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      F._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
      F._quad.frustumCulled = false;
      F._scene.add(F._quad);
      // the SSAO kernel: hemisphere samples, denser near the origin
      var R = GTP.makeRng(0x55A0), kernel = [];
      for (var i = 0; i < 16; i++) {
        var v = new THREE.Vector3(R.random() * 2 - 1, R.random() * 2 - 1, R.random()).normalize();
        var s = i / 16; s = 0.1 + 0.9 * s * s;
        kernel.push(v.multiplyScalar(s * (0.3 + 0.7 * R.random())));
      }
      F._kernel = kernel;
      var M = F._mats;
      M.ssao = mat(SSAO_F, { tDepth: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: 0.3 }, cameraFar: { value: 1500 }, radius: { value: 1.4 }, bias: { value: 0.03 }, intensity: { value: 1.4 }, projection: { value: new THREE.Matrix4() }, inverseProjection: { value: new THREE.Matrix4() }, kernel: { value: kernel }, samples: { value: 12 } });
      M.blur = mat(BLUR_F, { tAO: { value: null }, tDepth: { value: null }, direction: { value: new THREE.Vector2(1, 0) }, resolution: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: 0.3 }, cameraFar: { value: 1500 } });
      M.thresh = mat(THRESH_F, { tDiffuse: { value: null }, threshold: { value: 1.0 }, knee: { value: 0.4 } });
      M.down = mat(DOWN_F, { tDiffuse: { value: null }, texel: { value: new THREE.Vector2(1, 1) } });
      M.up = mat(UP_F, { tDiffuse: { value: null }, tPrev: { value: null }, texel: { value: new THREE.Vector2(1, 1) }, prevWeight: { value: 1.0 } });
      M.composite = mat(COMPOSITE_F, {
        tDiffuse: { value: null }, tBloom: { value: null }, tAO: { value: null }, tDepth: { value: null },
        bloomStrength: { value: 0.55 }, aoStrength: { value: 0.65 }, exposure: { value: 1.0 }, vignette: { value: 0.38 }, grain: { value: 0.0 }, time: { value: 0 }, saturation: { value: 1.08 }, contrast: { value: 0.12 }, useAO: { value: 0 }, useBloom: { value: 1 },
        lift: { value: new THREE.Vector3(0, 0, 0) }, gamma: { value: new THREE.Vector3(1, 1, 1) }, gain: { value: new THREE.Vector3(1, 1, 1) }, shadowTint: { value: new THREE.Vector3(1, 1, 1) }, highlightTint: { value: new THREE.Vector3(1, 1, 1) },
        fogColor: { value: new THREE.Vector3(0.7, 0.8, 0.9) }, sunColor: { value: new THREE.Vector3(1, 0.95, 0.85) }, fogTint: { value: new THREE.Vector3(1, 1, 1) }, fogDensity: { value: 0.0025 }, fogHeight: { value: 42 }, fogBase: { value: -2 }, sunGlow: { value: 0.75 }, split: { value: 0.35 },
        cameraNear: { value: 0.3 }, cameraFar: { value: 1500 }, inverseProjection: { value: new THREE.Matrix4() }, cameraWorld: { value: new THREE.Matrix4() }, sunDirView: { value: new THREE.Vector3(0, 1, 0) }
      });
      M.fxaa = mat(FXAA_F, { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) } });
      // a plain blit with an sRGB curve: the debug views (PostFX.debugView = 'scene' | 'thresh' | 'bloom' | 'ao' | 'depth' | 'down0'..'down3' | 'up0'..'up2')
      M.copy = mat('uniform sampler2D tDiffuse; uniform float gainK; varying vec2 vUv; void main() { vec3 raw = texture2D(tDiffuse, vUv).rgb; if (raw.r != raw.r || raw.g != raw.g || raw.b != raw.b) { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); return; } if (raw.r > 1e5 || raw.g > 1e5 || raw.b > 1e5) { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; } vec3 c = clamp(raw * gainK, 0.0, 1.0); gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0); }', { tDiffuse: { value: null }, gainK: { value: 1 } });
      F.ready = true;
      F.setPreset(GTP.C.QUALITY);
      void gl;
    },
    setPreset: function (Q) {
      var F = PostFX;
      F.flags.ssao = !!Q.ssao; F.flags.bloom = !!Q.bloom; F.flags.fxaa = !!Q.fxaa; F.flags.grain = !!Q.grain; F.flags.samples = Math.max(4, Math.min(16, Q.ssaoSamples | 0 || 12));
      F.enabled = !!(Q.post && F.ready && F.supported);
      if (F._mats.ssao) F._mats.ssao.uniforms.samples.value = F.flags.samples;
      if (!F.enabled) F._dispose();
    },
    resize: function (w, h) {
      var F = PostFX;
      F.width = Math.max(2, w | 0); F.height = Math.max(2, h | 0);
      F._dispose();
    },
    _dispose: function () {
      var F = PostFX;
      [F._rt, F._aoRT, F._aoRT2, F._threshRT, F._ldrRT, F._bloomOut].forEach(function (rt) { if (rt) rt.dispose(); });
      F._bloomRTs.forEach(function (rt) { rt.dispose(); }); (F._upRTs || []).forEach(function (rt) { rt.dispose(); });
      F._rt = F._aoRT = F._aoRT2 = F._threshRT = F._ldrRT = F._bloomOut = null; F._bloomRTs = []; F._upRTs = [];
    },
    _ensure: function () {
      var F = PostFX, w = F.width, h = F.height;
      if (F._rt) return;
      var depth = new THREE.DepthTexture(w, h);
      depth.type = THREE.UnsignedIntType; depth.format = THREE.DepthFormat;
      F._rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: F.hdrType, depthBuffer: true, stencilBuffer: false, depthTexture: depth });
      F._rt.texture.name = 'scene';
      var hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
      F._aoRT = new THREE.WebGLRenderTarget(hw, hh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false });
      F._aoRT2 = new THREE.WebGLRenderTarget(hw, hh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false });
      F._threshRT = new THREE.WebGLRenderTarget(hw, hh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: F.hdrType, depthBuffer: false });
      F._bloomRTs = []; F._upRTs = [];
      var bw = hw, bh = hh;
      for (var i = 0; i < 4; i++) {
        bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
        F._bloomRTs.push(new THREE.WebGLRenderTarget(bw, bh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: F.hdrType, depthBuffer: false }));
        F._upRTs.push(new THREE.WebGLRenderTarget(bw, bh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: F.hdrType, depthBuffer: false }));
      }
      F._bloomOut = new THREE.WebGLRenderTarget(hw, hh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: F.hdrType, depthBuffer: false });
      F._ldrRT = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false });
    },
    _pass: function (material, target) {
      var F = PostFX, r = F.renderer;
      F._quad.material = material;
      r.setRenderTarget(target);
      r.render(F._scene, F._cam);
      F.stats.passes++;
    },
    // the look by hour: Render.env carries night / dusk / overcast; the grade leans teal in the shadows and warm in the
    // highlights by day, blue shadows and amber highlights at night, flatter and cooler in the rain
    _tune: function () {
      var F = PostFX, P = F.params, env = GTP.Render && GTP.Render.env, L = GTP.Render && GTP.Render.lights;
      var night = env ? env.night : 0, dusk = env ? env.duskW : 0, over = env ? env.overcast : 0, rain = env ? env.rain : 0, horizonW = env ? env.horizonW : 0;
      var u = F._mats.composite.uniforms;
      u.exposure.value = (L && L.exposure) || P.exposure;
      u.bloomStrength.value = P.bloomStrength * U.lerp(1.0, 1.35, night) * U.lerp(1, 1.15, rain);
      u.aoStrength.value = P.aoStrength;
      u.vignette.value = P.vignette + 0.08 * night;
      u.grain.value = F.flags.grain ? P.grain * (1 + night * 0.6) : 0;
      u.saturation.value = P.saturation * U.lerp(1, 0.86, over) * U.lerp(1, 1.06, dusk);
      u.contrast.value = P.contrast * U.lerp(1, 0.6, over) * U.lerp(1, 0.8, night);
      u.split.value = P.split;
      // split tone: teal shadows / warm highlights by day, blue / amber by night
      u.shadowTint.value.set(U.lerp(0.94, 0.9, night), U.lerp(1.0, 0.95, night), U.lerp(1.06, 1.1, night));
      u.highlightTint.value.set(U.lerp(1.05, 1.07, night + dusk * 0.5), U.lerp(1.01, 0.98, night), U.lerp(0.95, 0.9, night));
      u.lift.value.set(0.006 + 0.006 * night, 0.006 + 0.006 * night, 0.01 + 0.016 * night);
      u.gamma.value.set(1.0, 1.0, 1.0);
      u.gain.value.set(1.0, 1.0, 1.0);
      // height fog: a touch thicker at dawn / dusk and in the rain; tinted toward the sun when looking into it
      u.fogDensity.value = P.fogDensity * U.lerp(1, 1.6, horizonW) * U.lerp(1, 2.0, rain) * U.lerp(1, 1.3, over) * U.lerp(1, 0.8, night);
      u.fogHeight.value = P.fogHeight; u.fogBase.value = P.fogBase;
      u.sunGlow.value = P.sunGlow * (1 - night) * (1 - over * 0.8);
      if (env && env.fogColor) u.fogColor.value.set(env.fogColor.r, env.fogColor.g, env.fogColor.b);
      if (env && env.sunColor) u.sunColor.value.set(env.sunColor.r, env.sunColor.g, env.sunColor.b);
      u.fogTint.value.set(1, 1, 1);
      // bloom threshold follows the day: sunlit walls stay below it, lit windows and neon rise above it at night
      var t = F._mats.thresh.uniforms;
      t.threshold.value = U.lerp(P.bloomThreshold * 1.3, P.bloomThreshold * 0.55, night);
      t.knee.value = P.bloomKnee;
    },
    render: function (renderer, scene, camera) {
      var F = PostFX;
      if (!F.enabled || !F.ready) { renderer.render(scene, camera); return; }
      try {
        F._ensure();
        var M = F._mats, w = F.width, h = F.height;
        F.stats.passes = 0;
        // 1. the scene, linear HDR, with depth
        renderer.setRenderTarget(F._rt);
        renderer.clear();
        renderer.render(scene, camera);
        var prevAutoClear = renderer.autoClear; renderer.autoClear = true;
        // 2. SSAO at half resolution + bilateral blur
        var aoTex = null;
        if (F.flags.ssao) {
          var su = M.ssao.uniforms;
          su.tDepth.value = F._rt.depthTexture; su.resolution.value.set(F._aoRT.width, F._aoRT.height);
          su.cameraNear.value = camera.near; su.cameraFar.value = camera.far;
          su.projection.value.copy(camera.projectionMatrix); su.inverseProjection.value.copy(camera.projectionMatrixInverse);
          su.radius.value = F.params.aoRadius; su.bias.value = F.params.aoBias; su.intensity.value = F.params.aoIntensity;
          F._pass(M.ssao, F._aoRT);
          var bu = M.blur.uniforms;
          bu.tDepth.value = F._rt.depthTexture; bu.resolution.value.set(F._aoRT.width, F._aoRT.height); bu.cameraNear.value = camera.near; bu.cameraFar.value = camera.far;
          bu.tAO.value = F._aoRT.texture; bu.direction.value.set(1, 0); F._pass(M.blur, F._aoRT2);
          bu.tAO.value = F._aoRT2.texture; bu.direction.value.set(0, 1); F._pass(M.blur, F._aoRT);
          aoTex = F._aoRT.texture;
        }
        // 3. bloom: threshold, four down-samples, then up-samples that add each level's own content back in
        var bloomTex = null;
        F._tune();
        if (F.flags.bloom) {
          M.thresh.uniforms.tDiffuse.value = F._rt.texture;
          F._pass(M.thresh, F._threshRT);
          var src = F._threshRT, i, D = F._bloomRTs, UPS = F._upRTs;
          for (i = 0; i < D.length; i++) { M.down.uniforms.tDiffuse.value = src.texture; M.down.uniforms.texel.value.set(1 / src.width, 1 / src.height); F._pass(M.down, D[i]); src = D[i]; }
          // UPS[i] has the size of D[i]; UPS[i] = up(level below) + D[i]
          var below = D[D.length - 1];
          for (i = D.length - 2; i >= 0; i--) {
            M.up.uniforms.tDiffuse.value = below.texture; M.up.uniforms.tPrev.value = D[i].texture; M.up.uniforms.texel.value.set(1 / below.width, 1 / below.height); M.up.uniforms.prevWeight.value = 1.0;
            F._pass(M.up, UPS[i]); below = UPS[i];
          }
          M.up.uniforms.tDiffuse.value = below.texture; M.up.uniforms.tPrev.value = F._threshRT.texture; M.up.uniforms.texel.value.set(1 / below.width, 1 / below.height); M.up.uniforms.prevWeight.value = 0.3;
          F._pass(M.up, F._bloomOut);
          bloomTex = F._bloomOut.texture;
        }
        // 4. composite: fog, AO, bloom, exposure, ACES, grade, vignette, grain -> sRGB
        var cu = M.composite.uniforms;
        cu.tDiffuse.value = F._rt.texture; cu.tBloom.value = bloomTex; cu.tAO.value = aoTex; cu.tDepth.value = F._rt.depthTexture;
        cu.useAO.value = aoTex ? 1 : 0; cu.useBloom.value = bloomTex ? 1 : 0;
        cu.cameraNear.value = camera.near; cu.cameraFar.value = camera.far;
        cu.inverseProjection.value.copy(camera.projectionMatrixInverse); cu.cameraWorld.value.copy(camera.matrixWorld);
        var sd = GTP.Render && GTP.Render.lights ? GTP.Render.lights.sunDir : null;
        if (sd) { cu.sunDirView.value.copy(sd).transformDirection(camera.matrixWorldInverse); }
        cu.time.value = (GTP.game && GTP.game.time ? GTP.game.time.t : 0) % 1000;
        if (F.debugView) {
          var dv = F.debugView, tex = dv === 'scene' ? F._rt.texture : dv === 'depth' ? F._rt.depthTexture : dv === 'thresh' ? F._threshRT.texture : dv === 'bloom' ? bloomTex : dv === 'ao' ? aoTex : /^down[0-3]$/.test(dv) ? F._bloomRTs[+dv[4]].texture : /^up[0-2]$/.test(dv) ? F._upRTs[+dv[2]].texture : null;
          if (tex) { M.copy.uniforms.tDiffuse.value = tex; M.copy.uniforms.gainK.value = dv === 'depth' ? 1 : 1; F._pass(M.copy, null); renderer.setRenderTarget(null); renderer.autoClear = prevAutoClear; return; }
        }
        if (F.flags.fxaa) {
          F._pass(M.composite, F._ldrRT);
          M.fxaa.uniforms.tDiffuse.value = F._ldrRT.texture; M.fxaa.uniforms.resolution.value.set(w, h);
          F._pass(M.fxaa, null);
        } else F._pass(M.composite, null);
        renderer.setRenderTarget(null);
        renderer.autoClear = prevAutoClear;
      } catch (e) {
        U.reportError(e, 'postfx');
        F.enabled = false;
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      }
    }
  };
})();
