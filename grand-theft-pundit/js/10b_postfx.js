/* Grand Theft Pundit: 10b_postfx.js
 * GTP.PostFX: the post-processing pipeline, written against three r152's core only (no examples/jsm): the scene is
 * drawn into a half-float render target with a depth texture, then
 *   SSAO      hemisphere kernel (QUALITY.ssaoSamples, 8..16) over depth-reconstructed view positions and normals at
 *             half resolution, a depth-aware (bilateral) separable blur, applied subtly in the composite
 *   bloom     a soft-knee threshold that follows the time of day (Render.env), four down / up-sample levels
 *   composite height fog from depth tinted toward the sun, AO, bloom, exposure, ACES filmic, colour grading
 *             (lift / gamma / gain, a warm / teal split by the hour, saturation), vignette, light grain, sRGB out
 *   FXAA      the last pass, on the display-referred image (medium; high and ultra resolve with TAA instead)
 * v0.3 (environment track):
 *   TAA       the camera jitters by a Halton(2, 3) sub-pixel offset each frame; the HDR scene is blended with the history
 *             reprojected through the depth buffer (camera motion), the history clamped to the 3 x 3 neighbourhood in
 *             YCoCg so moving cars do not smear; reset on a camera cut
 *   SSR       wet roads: on rain-wet flat ground (the same puddle noise the ground shader uses) the reflected view ray is
 *             marched through the depth buffer at half resolution; hits add the scene colour by Fresnel and wetness
 *   DoF       cutscenes: a half-resolution golden-angle gather, mixed by a circle of confusion from depth around the
 *             focus distance (Render.dofFocus, or auto-focus on the screen centre)
 *   motion    blur at speed: the camera's own motion (reprojected depth) smears the frame along its screen velocity,
 *             scaled by Render.motionBlur (the player's vehicle speed)
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

  // ---- v0.3: TAA, SSR, DoF, motion blur ----
  var REPROJ = [
    'vec3 gtpWorld( vec2 uv, float d ) { vec4 p = invViewProj * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 ); return p.xyz / p.w; }',
    'vec2 gtpPrevUv( vec3 w ) { vec4 c = prevViewProj * vec4( w, 1.0 ); return c.xy / c.w * 0.5 + 0.5; }'
  ].join('\n');
  var TAA_F = [
    'uniform sampler2D tCur, tHist, tDepth; uniform mat4 invViewProj, prevViewProj; uniform vec2 resolution; uniform float blend;',
    'varying vec2 vUv;',
    REPROJ,
    'vec3 toY( vec3 c ) { return vec3( 0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b ); }',
    'vec3 fromY( vec3 y ) { return vec3( y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z ); }',
    'vec3 tm( vec3 c ) { return c / ( 1.0 + max( max( c.r, c.g ), c.b ) ); }',
    'vec3 itm( vec3 c ) { return c / max( 1.0 - max( max( c.r, c.g ), c.b ), 1e-3 ); }',
    'vec3 fetch( vec2 uv ) { vec3 c = texture2D( tCur, uv ).rgb; if ( c.r != c.r || c.g != c.g || c.b != c.b ) c = vec3( 0.0 ); return tm( min( c, vec3( 48.0 ) ) ); }',
    'void main() {',
    '  vec2 px = 1.0 / resolution;',
    '  vec3 c = fetch( vUv );',
    '  vec3 yc = toY( c ), mn = yc, mx = yc, m1 = yc, m2 = yc * yc;',
    '  for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) {',
    '    if ( i == 0 && j == 0 ) continue;',
    '    vec3 s = toY( fetch( vUv + vec2( float( i ), float( j ) ) * px ) );',
    '    mn = min( mn, s ); mx = max( mx, s ); m1 += s; m2 += s * s;',
    '  }',
    // variance clipping tightens the box on noisy edges
    '  m1 /= 9.0; m2 /= 9.0; vec3 sd = sqrt( max( m2 - m1 * m1, 0.0 ) ); mn = max( mn, m1 - 1.25 * sd ); mx = min( mx, m1 + 1.25 * sd );',
    '  float d = texture2D( tDepth, vUv ).x;',
    '  vec2 puv = gtpPrevUv( gtpWorld( vUv, d ) );',
    '  float k = blend;',
    '  if ( puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0 ) k = 1.0;',
    '  vec3 h = toY( tm( texture2D( tHist, puv ).rgb ) );',
    '  h = clamp( h, mn, mx );',
    '  vec3 o = mix( fromY( h ), c, k );',
    '  gl_FragColor = vec4( itm( o ), 1.0 );',
    '}'].join('\n');
  var MBLUR_F = [
    'uniform sampler2D tDiffuse, tDepth; uniform mat4 invViewProj, prevViewProj; uniform float amount;',
    'varying vec2 vUv;',
    REPROJ,
    'void main() {',
    '  float d = texture2D( tDepth, vUv ).x;',
    '  vec2 v = ( vUv - gtpPrevUv( gtpWorld( vUv, d ) ) ) * amount;',
    '  float l = length( v ); if ( l > 0.06 ) v *= 0.06 / l;',
    '  vec3 acc = vec3( 0.0 );',
    '  for ( int i = 0; i < 8; i ++ ) { float t = float( i ) / 7.0 - 0.5; acc += texture2D( tDiffuse, vUv + v * t ).rgb; }',
    '  gl_FragColor = vec4( acc / 8.0, 1.0 );',
    '}'].join('\n');
  var SSR_F = [
    'uniform sampler2D tColor, tDepth, tNoise; uniform vec2 resolution; uniform mat4 projection, inverseProjection, cameraWorld; uniform float wet, cameraNear, cameraFar;',
    'varying vec2 vUv;',
    'vec3 viewPos( vec2 uv ) { float d = texture2D( tDepth, uv ).x; vec4 p = inverseProjection * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 ); return p.xyz / p.w; }',
    'void main() {',
    '  float d = texture2D( tDepth, vUv ).x;',
    '  if ( d >= 0.9999 ) { gl_FragColor = vec4( 0.0 ); return; }',
    '  vec3 P = viewPos( vUv );',
    '  vec2 px = 1.0 / resolution;',
    '  vec3 Px = viewPos( vUv + vec2( px.x, 0.0 ) ), Py = viewPos( vUv + vec2( 0.0, px.y ) );',
    '  vec3 N = normalize( cross( Px - P, Py - P ) );',
    '  vec3 Nw = ( cameraWorld * vec4( N, 0.0 ) ).xyz;',
    '  if ( Nw.y < 0.0 ) { N = -N; Nw = -Nw; }',
    '  if ( Nw.y < 0.96 || -P.z > 140.0 ) { gl_FragColor = vec4( 0.0 ); return; }',
    '  vec3 W = ( cameraWorld * vec4( P, 1.0 ) ).xyz;',
    // the sea reflects the city always (harbour lights at night); a street only when it is wet
    '  float sea = step( W.y, -0.9 );',
    '  if ( sea < 0.5 && wet < 0.02 ) { gl_FragColor = vec4( 0.0 ); return; }',
    // the ground shader's puddle field (same noise, same scales)
    '  float n2 = texture2D( tNoise, W.xz / 23.0 + 0.37 ).r;',
    '  float pn = texture2D( tNoise, W.xz / 15.0 + 0.71 ).r * 0.65 + n2 * 0.35;',
    '  float puddle = smoothstep( 0.68 - 0.05 * wet, 0.71 - 0.05 * wet, pn ) * smoothstep( 0.12, 0.55, wet );',
    '  vec3 V = normalize( P ), R = normalize( reflect( V, N ) );',
    '  if ( sea > 0.5 ) { vec2 wn = texture2D( tNoise, W.xz / 6.0 ).rg - 0.5; R = normalize( R + vec3( wn.x, 0.0, wn.y ) * 0.06 ); }',
    '  if ( R.z > 0.2 ) { gl_FragColor = vec4( 0.0 ); return; }',
    '  float t = 0.4, tPrev = 0.0; vec3 hit = vec3( -1.0 );',
    '  for ( int i = 0; i < 28; i ++ ) {',
    '    vec3 Q = P + R * t;',
    '    vec4 c = projection * vec4( Q, 1.0 ); vec2 uv = c.xy / c.w * 0.5 + 0.5;',
    '    if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) break;',
    '    float sz = viewPos( uv ).z;',
    '    if ( Q.z < sz - 0.02 && Q.z > sz - 0.8 - t * 0.08 ) {',
    // refine between the last miss and this hit (binary search)
    '      float a = tPrev, b = t;',
    '      for ( int k = 0; k < 5; k ++ ) { float m = ( a + b ) * 0.5; vec3 Qm = P + R * m; vec4 cm = projection * vec4( Qm, 1.0 ); vec2 um = cm.xy / cm.w * 0.5 + 0.5; if ( Qm.z < viewPos( um ).z - 0.02 ) b = m; else a = m; }',
    '      vec3 Qh = P + R * b; vec4 ch = projection * vec4( Qh, 1.0 ); hit = vec3( ch.xy / ch.w * 0.5 + 0.5, b ); break;',
    '    }',
    '    tPrev = t; t *= 1.16;',
    '  }',
    '  if ( hit.x < 0.0 ) { gl_FragColor = vec4( 0.0 ); return; }',
    // only what stands above the street reflects (lamps, signs, walls, cars): another bit of road is not worth a reflection
    '  float hy = ( cameraWorld * vec4( viewPos( hit.xy ), 1.0 ) ).y;',
    '  if ( hy < W.y + 0.3 && sea < 0.5 ) { gl_FragColor = vec4( 0.0 ); return; }',
    '  vec2 e = smoothstep( 0.0, 0.12, hit.xy ) * ( 1.0 - smoothstep( 0.88, 1.0, hit.xy ) );',
    '  float cosT = clamp( -dot( V, N ), 0.0, 1.0 ), F = 0.02 + 0.98 * pow( 1.0 - cosT, 5.0 );',
    '  float k = e.x * e.y * ( 1.0 - smoothstep( 40.0, 140.0, -P.z ) ) * mix( wet * mix( 0.18, 0.75, puddle ), 0.8, sea ) * mix( 0.35, 1.0, F );',
    // wet asphalt smears a reflection into vertical streaks (more on bare wet road than in a puddle)
    '  float sp = mix( mix( 0.035, 0.008, puddle ), 0.02, sea );',
    '  vec3 col = vec3( 0.0 );',
    '  for ( int s = -3; s <= 3; s ++ ) col += min( texture2D( tColor, hit.xy + vec2( 0.0, float( s ) * sp / 3.0 ) ).rgb, vec3( 24.0 ) ) * ( 1.0 - abs( float( s ) ) * 0.2 );',
    '  col /= 4.6;',
    '  gl_FragColor = vec4( col * k, k );',
    '}'].join('\n');
  // the circle of confusion (0..1 of DOF_RADIUS half-resolution texels), shared by the gather and the composite mix.
  // Thin lens: blur ~ |z - f| / z, so the background tends to a fixed size and the foreground grows fast. A crisp band
  // of +-12 % around the focus distance stays exactly sharp (the speakers), the aperture shrinks for far focus (a wide
  // establishing shot keeps its street readable, a two-shot at 4 m softens what is behind) and the near field is capped.
  // Before (coordinator play-through): |z - f| / z * 1.6 hit full blur at 1.4 x the focus distance and the gather spread
  // 18 full-resolution pixels, so the whole frame smeared.
  var DOF_COC = [
    'uniform float dofBand, dofNearMax;',
    'float gtpCoc( float z, float f, float ap ) {',
    '  float r = max( abs( z - f ) / max( z, 0.1 ) - dofBand, 0.0 ) * ap * clamp( 6.0 / max( f, 0.5 ), 0.3, 1.0 );',
    '  return z < f ? min( r, dofNearMax ) : min( r, 1.0 );',
    '}'].join('\n');
  var DOF_RADIUS = '6.0';
  var DOF_F = [
    'uniform sampler2D tDiffuse, tDepth; uniform vec2 texel; uniform float focus, aperture, cameraNear, cameraFar;',
    'varying vec2 vUv;',
    DOF_COC,
    'float linDepth( float d ) { float z = d * 2.0 - 1.0; return ( 2.0 * cameraNear * cameraFar ) / ( cameraFar + cameraNear - z * ( cameraFar - cameraNear ) ); }',
    'void main() {',
    '  float f = focus;',
    '  if ( f <= 0.0 ) f = linDepth( texture2D( tDepth, vec2( 0.5 ) ).x );',
    '  float z0 = linDepth( texture2D( tDepth, vUv ).x );',
    '  float c0 = gtpCoc( z0, f, aperture );',
    '  vec3 acc = texture2D( tDiffuse, vUv ).rgb; float w = 1.0;',
    '  if ( c0 > 0.02 ) {',
    '    for ( int i = 0; i < 20; i ++ ) {',
    '      float r = sqrt( ( float( i ) + 0.5 ) / 20.0 ), a = float( i ) * 2.39996;',
    '      vec2 uv = vUv + vec2( cos( a ), sin( a ) ) * r * ' + DOF_RADIUS + ' * c0 * texel;',
    '      float zs = linDepth( texture2D( tDepth, uv ).x ), cs = gtpCoc( zs, f, aperture );',
    // a sharper sample in front of this pixel (the in-focus speaker before a soft wall) must not bleed a halo into it
    '      float ww = ( zs < z0 && cs < c0 * 0.5 ) ? 0.0 : 1.0;',
    '      acc += texture2D( tDiffuse, uv ).rgb * ww; w += ww;',
    '    }',
    '  }',
    '  gl_FragColor = vec4( acc / w, c0 );',
    '}'].join('\n');

  var COMPOSITE_F = [
    'uniform sampler2D tDiffuse, tBloom, tAO, tDepth, tSSR, tDof;',
    'uniform float useSSR, useDof, dofFocus, dofAperture;',
    DOF_COC,
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
    'float linDepthC( float d ) { float z = d * 2.0 - 1.0; return ( 2.0 * cameraNear * cameraFar ) / ( cameraFar + cameraNear - z * ( cameraFar - cameraNear ) ); }',
    'void main() {',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    '  if (c.r != c.r || c.g != c.g || c.b != c.b) c = vec3(0.0);',
    '  c = min(c, vec3(48.0));',
    '  float d = texture2D(tDepth, vUv).x;',
    '  if (useSSR > 0.5) { vec4 r = texture2D(tSSR, vUv); c = c * (1.0 - r.a * 0.45) + r.rgb; }',
    '  if (useDof > 0.5) {',
    '    float f = dofFocus > 0.0 ? dofFocus : linDepthC( texture2D( tDepth, vec2( 0.5 ) ).x );',
    // the full-resolution frame where the blur is under ~1.5 px (the focal plane stays crisp), the half-resolution gather above
    '    float k = gtpCoc( linDepthC( d ), f, dofAperture );',
    '    c = mix( c, texture2D( tDof, vUv ).rgb, smoothstep( 0.04, 0.25, k ) );',
    '  }',
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
    flags: { ssao: false, bloom: true, fxaa: true, grain: false, samples: 12, taa: false, ssr: false, dof: false, motionBlur: false },
    stats: { passes: 0, taa: false, ssr: false, dof: false, motionBlur: false, historyResets: 0 },
    _frame: 0, _histValid: false, _prevVP: null, _curVP: null, _invVP: null, _lastCam: null, _histA: null, _histB: null, _tmpRT: null, _ssrRT: null, _dofRT: null,
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
        tDiffuse: { value: null }, tBloom: { value: null }, tAO: { value: null }, tDepth: { value: null }, tSSR: { value: null }, tDof: { value: null }, useSSR: { value: 0 }, useDof: { value: 0 }, dofFocus: { value: 0 }, dofAperture: { value: 0.6 }, dofBand: { value: 0.12 }, dofNearMax: { value: 0.45 },
        bloomStrength: { value: 0.55 }, aoStrength: { value: 0.65 }, exposure: { value: 1.0 }, vignette: { value: 0.38 }, grain: { value: 0.0 }, time: { value: 0 }, saturation: { value: 1.08 }, contrast: { value: 0.12 }, useAO: { value: 0 }, useBloom: { value: 1 },
        lift: { value: new THREE.Vector3(0, 0, 0) }, gamma: { value: new THREE.Vector3(1, 1, 1) }, gain: { value: new THREE.Vector3(1, 1, 1) }, shadowTint: { value: new THREE.Vector3(1, 1, 1) }, highlightTint: { value: new THREE.Vector3(1, 1, 1) },
        fogColor: { value: new THREE.Vector3(0.7, 0.8, 0.9) }, sunColor: { value: new THREE.Vector3(1, 0.95, 0.85) }, fogTint: { value: new THREE.Vector3(1, 1, 1) }, fogDensity: { value: 0.0025 }, fogHeight: { value: 42 }, fogBase: { value: -2 }, sunGlow: { value: 0.75 }, split: { value: 0.35 },
        cameraNear: { value: 0.3 }, cameraFar: { value: 1500 }, inverseProjection: { value: new THREE.Matrix4() }, cameraWorld: { value: new THREE.Matrix4() }, sunDirView: { value: new THREE.Vector3(0, 1, 0) }
      });
      M.fxaa = mat(FXAA_F, { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) } });
      M.taa = mat(TAA_F, { tCur: { value: null }, tHist: { value: null }, tDepth: { value: null }, invViewProj: { value: new THREE.Matrix4() }, prevViewProj: { value: new THREE.Matrix4() }, resolution: { value: new THREE.Vector2(1, 1) }, blend: { value: 0.1 } });
      M.mblur = mat(MBLUR_F, { tDiffuse: { value: null }, tDepth: { value: null }, invViewProj: { value: new THREE.Matrix4() }, prevViewProj: { value: new THREE.Matrix4() }, amount: { value: 0 } });
      M.ssr = mat(SSR_F, { tColor: { value: null }, tDepth: { value: null }, tNoise: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, projection: { value: new THREE.Matrix4() }, inverseProjection: { value: new THREE.Matrix4() }, cameraWorld: { value: new THREE.Matrix4() }, wet: { value: 0 }, cameraNear: { value: 0.3 }, cameraFar: { value: 1500 } });
      M.dof = mat(DOF_F, { tDiffuse: { value: null }, tDepth: { value: null }, texel: { value: new THREE.Vector2(1, 1) }, focus: { value: 0 }, aperture: { value: 0.6 }, dofBand: { value: 0.12 }, dofNearMax: { value: 0.45 }, cameraNear: { value: 0.3 }, cameraFar: { value: 1500 } });
      F._prevVP = new THREE.Matrix4(); F._curVP = new THREE.Matrix4(); F._invVP = new THREE.Matrix4(); F._lastCam = { p: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 0 };
      // a plain blit with an sRGB curve: the debug views (PostFX.debugView = 'scene' | 'thresh' | 'bloom' | 'ao' | 'depth' | 'down0'..'down3' | 'up0'..'up2')
      M.copy = mat('uniform sampler2D tDiffuse; uniform float gainK; varying vec2 vUv; void main() { vec3 raw = texture2D(tDiffuse, vUv).rgb; if (raw.r != raw.r || raw.g != raw.g || raw.b != raw.b) { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); return; } if (raw.r > 1e5 || raw.g > 1e5 || raw.b > 1e5) { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; } vec3 c = clamp(raw * gainK, 0.0, 1.0); gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0); }', { tDiffuse: { value: null }, gainK: { value: 1 } });
      F.ready = true;
      F.setPreset(GTP.C.QUALITY);
      void gl;
    },
    setPreset: function (Q) {
      var F = PostFX;
      F.flags.ssao = !!Q.ssao; F.flags.bloom = !!Q.bloom; F.flags.fxaa = !!Q.fxaa; F.flags.grain = !!Q.grain; F.flags.samples = Math.max(4, Math.min(16, Q.ssaoSamples | 0 || 12));
      F.flags.taa = !!Q.taa; F.flags.ssr = !!Q.ssr; F.flags.dof = !!Q.dof; F.flags.motionBlur = !!Q.motionBlur;
      F._histValid = false;
      F.enabled = !!(Q.post && F.ready && F.supported);
      if (F._mats.ssao) F._mats.ssao.uniforms.samples.value = F.flags.samples;
      if (!F.enabled) F._dispose();
    },
    // the targets follow the real drawing buffer (the browser clamps a huge canvas) and stay within the GPU's texture /
    // renderbuffer limits, aspect kept: past them every target was incomplete and the frame black with no error (QAC-26)
    resize: function (w, h) {
      var F = PostFX, r = F.renderer;
      if (r) {
        var gl = r.getContext();
        if (gl.drawingBufferWidth > 1 && gl.drawingBufferHeight > 1) { w = Math.min(w, gl.drawingBufferWidth); h = Math.min(h, gl.drawingBufferHeight); }
        var cap = Math.min(r.capabilities.maxTextureSize || 4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096);
        var k = Math.min(1, cap / Math.max(w, h, 1)); w = Math.floor(w * k); h = Math.floor(h * k);
      }
      F.width = Math.max(2, w | 0); F.height = Math.max(2, h | 0);
      F._dispose();
    },
    _dispose: function () {
      var F = PostFX;
      [F._rt, F._aoRT, F._aoRT2, F._threshRT, F._ldrRT, F._bloomOut, F._histA, F._histB, F._tmpRT, F._ssrRT, F._dofRT].forEach(function (rt) { if (rt) rt.dispose(); });
      F._bloomRTs.forEach(function (rt) { rt.dispose(); }); (F._upRTs || []).forEach(function (rt) { rt.dispose(); });
      F._rt = F._aoRT = F._aoRT2 = F._threshRT = F._ldrRT = F._bloomOut = F._histA = F._histB = F._tmpRT = F._ssrRT = F._dofRT = null; F._bloomRTs = []; F._upRTs = [];
      F._histValid = false; F._fbOk = false;
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
      var hdr = function (ww, hh) { return new THREE.WebGLRenderTarget(ww, hh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: F.hdrType, depthBuffer: false }); };
      F._histA = hdr(w, h); F._histB = hdr(w, h); F._tmpRT = hdr(w, h); F._ssrRT = hdr(hw, hh); F._dofRT = hdr(hw, hh);
      F._histValid = false;
    },
    // a camera cut (teleport, respawn, a new cutscene shot) drops the TAA history so the old view does not ghost in
    resetHistory: function () { PostFX._histValid = false; PostFX.stats.historyResets++; },
    _halton: function (i, b) { var f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; },
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
      u.bloomStrength.value = P.bloomStrength * U.lerp(1.0, 1.1, night);
      u.aoStrength.value = P.aoStrength;
      u.vignette.value = P.vignette + 0.08 * night;
      u.grain.value = F.flags.grain ? P.grain * (1 - night * 0.35) : 0;
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
      u.fogDensity.value = P.fogDensity * U.lerp(1, 1.6, horizonW) * U.lerp(1, 1.35, rain) * U.lerp(1, 1.2, over) * U.lerp(1, 0.6, night);
      u.fogHeight.value = P.fogHeight; u.fogBase.value = P.fogBase;
      u.sunGlow.value = P.sunGlow * (1 - night) * (1 - over * 0.8);
      if (env && env.fogColor) u.fogColor.value.set(env.fogColor.r, env.fogColor.g, env.fogColor.b);
      if (env && env.sunColor) u.sunColor.value.set(env.sunColor.r, env.sunColor.g, env.sunColor.b);
      u.fogTint.value.set(1, 1, 1);
      // bloom threshold follows the day: sunlit walls stay below it, lit windows and neon rise above it at night
      var t = F._mats.thresh.uniforms;
      t.threshold.value = U.lerp(P.bloomThreshold * 1.3, P.bloomThreshold * 0.8, night);
      t.knee.value = P.bloomKnee;
    },
    render: function (renderer, scene, camera) {
      var F = PostFX;
      if (!F.enabled || !F.ready) { renderer.render(scene, camera); return; }
      try {
        F._ensure();
        var M = F._mats, w = F.width, h = F.height, Rd = GTP.Render || {};
        F.stats.passes = 0;
        // camera cuts reset the TAA history (a jump of 6 m or 20 degrees between frames, or a fov snap)
        var lc = F._lastCam, cut = !F._histValid || lc.p.distanceTo(camera.position) > 6 || lc.q.angleTo(camera.quaternion) > 0.35 || Math.abs(lc.fov - camera.fov) > 4;
        if (cut && F._histValid) F.stats.historyResets++;
        if (cut) F._histValid = false;
        lc.p.copy(camera.position); lc.q.copy(camera.quaternion); lc.fov = camera.fov;
        // 1. the scene, linear HDR, with depth (with TAA: through a sub-pixel jittered projection)
        var taa = F.flags.taa;
        if (taa) { F._aspect = camera.aspect; var hi = (F._frame++ % 8) + 1; camera.setViewOffset(w, h, F._halton(hi, 2) - 0.5, F._halton(hi, 3) - 0.5, w, h); }
        renderer.setRenderTarget(F._rt);
        // once per allocation: an incomplete scene target (a GPU limit, a lost context) falls back to the plain path below
        if (!F._fbOk) { var glc = renderer.getContext(); if (glc.checkFramebufferStatus(glc.FRAMEBUFFER) !== glc.FRAMEBUFFER_COMPLETE && !glc.isContextLost()) throw new Error('postfx: incomplete framebuffer ' + w + 'x' + h); F._fbOk = true; }
        renderer.clear();
        renderer.render(scene, camera);
        // the matrices TAA and the motion blur reproject with: this frame's (jittered) inverse, the last frame's view-projection
        if (taa) { camera.clearViewOffset(); camera.aspect = F._aspect; camera.updateProjectionMatrix(); }
        // reprojection runs from the unjittered pixel centre: a still camera maps every pixel onto itself (no resampling blur)
        F._curVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        F._invVP.copy(F._curVP).invert();
        if (!F._histValid) F._prevVP.copy(F._curVP);
        var prevAutoClear = renderer.autoClear; renderer.autoClear = true;
        var hdr = F._rt.texture;
        F.stats.taa = false; F.stats.ssr = false; F.stats.dof = false; F.stats.motionBlur = false;
        // 1b. TAA: blend into the history (ping-pong), the result is the frame's HDR colour from here on
        if (taa) {
          var tu = M.taa.uniforms, wr = F._histB, rd = F._histA;
          tu.tCur.value = hdr; tu.tHist.value = rd.texture; tu.tDepth.value = F._rt.depthTexture; tu.resolution.value.set(w, h);
          tu.invViewProj.value.copy(F._invVP); tu.prevViewProj.value.copy(F._prevVP); tu.blend.value = F._histValid ? 0.1 : 1.0;
          F._pass(M.taa, wr);
          F._histA = wr; F._histB = rd; hdr = wr.texture; F._histValid = true; F.stats.taa = true;
        }
        // 1c. motion blur at speed (the camera's own motion, from depth)
        var mbAmt = F.flags.motionBlur ? (Rd.motionBlur || 0) : 0;
        if (mbAmt > 0.02 && F._histValid) {
          var mu = M.mblur.uniforms;
          mu.tDiffuse.value = hdr; mu.tDepth.value = F._rt.depthTexture; mu.invViewProj.value.copy(F._invVP); mu.prevViewProj.value.copy(F._prevVP); mu.amount.value = mbAmt;
          F._pass(M.mblur, F._tmpRT); hdr = F._tmpRT.texture; F.stats.motionBlur = true;
        }
        F._prevVP.copy(F._curVP); if (!taa) F._histValid = true;
        // 1d. wet-road reflections (half resolution) and the cutscene depth of field (half resolution)
        var wet = Rd.weather ? Rd.weather.wet : 0, ssrTex = null, dofTex = null;
        if (F.flags.ssr) {
          var su2 = M.ssr.uniforms;
          su2.tColor.value = hdr; su2.tDepth.value = F._rt.depthTexture; su2.tNoise.value = GTP.Assets ? GTP.Assets.clouds : null; su2.resolution.value.set(F._ssrRT.width, F._ssrRT.height);
          su2.projection.value.copy(camera.projectionMatrix); su2.inverseProjection.value.copy(camera.projectionMatrixInverse); su2.cameraWorld.value.copy(camera.matrixWorld);
          su2.wet.value = wet; su2.cameraNear.value = camera.near; su2.cameraFar.value = camera.far;
          F._pass(M.ssr, F._ssrRT); ssrTex = F._ssrRT.texture; F.stats.ssr = true;
        }
        if (F.flags.dof && Rd.dofActive) {
          var du = M.dof.uniforms;
          du.tDiffuse.value = hdr; du.tDepth.value = F._rt.depthTexture; du.texel.value.set(1 / F._dofRT.width, 1 / F._dofRT.height);
          du.focus.value = Rd.dofFocus || 0; du.aperture.value = Rd.dofAperture != null ? Rd.dofAperture : 0.6; du.dofBand.value = Rd.dofBand != null ? Rd.dofBand : 0.12; du.dofNearMax.value = Rd.dofNearMax != null ? Rd.dofNearMax : 0.45; du.cameraNear.value = camera.near; du.cameraFar.value = camera.far;
          F._pass(M.dof, F._dofRT); dofTex = F._dofRT.texture; F.stats.dof = true;
        }
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
          M.thresh.uniforms.tDiffuse.value = hdr;
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
        cu.tDiffuse.value = hdr; cu.tBloom.value = bloomTex; cu.tAO.value = aoTex; cu.tDepth.value = F._rt.depthTexture;
        cu.tSSR.value = ssrTex; cu.useSSR.value = ssrTex ? 1 : 0; cu.tDof.value = dofTex; cu.useDof.value = dofTex ? 1 : 0;
        cu.dofFocus.value = M.dof.uniforms.focus.value; cu.dofAperture.value = M.dof.uniforms.aperture.value; cu.dofBand.value = M.dof.uniforms.dofBand.value; cu.dofNearMax.value = M.dof.uniforms.dofNearMax.value;
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
        if (F.flags.fxaa && !taa) {
          F._pass(M.composite, F._ldrRT);
          M.fxaa.uniforms.tDiffuse.value = F._ldrRT.texture; M.fxaa.uniforms.resolution.value.set(w, h);
          F._pass(M.fxaa, null);
        } else F._pass(M.composite, null);
        renderer.setRenderTarget(null);
        renderer.autoClear = prevAutoClear;
      } catch (e) {
        U.reportError(e, 'postfx');
        F.enabled = false;
        if (camera.view && camera.view.enabled) { camera.clearViewOffset(); if (F._aspect) { camera.aspect = F._aspect; camera.updateProjectionMatrix(); } }
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      }
    }
  };
})();
