/* =======================================================================
   Material planet realistik
   ----------------------------------------------------------------------
   Menggunakan tekstur nyata (NASA/USGS/Solar System Scope) + normal map
   untuk relief, peta malam untuk lampu kota, dan shader khusus untuk
   cincin Saturnus yang punya ketebalan & bayangan.
   ======================================================================= */

/* ---------- Bumi: siang + malam + awan + atmosfer ---------- */
/* Shader ini mencampur peta siang dan peta lampu kota berdasarkan
   arah datang cahaya Matahari, lalu menambahkan awan dan semburat atmosfer. */
const EARTH_VERT = [
  '#include <common>',
  '#include <logdepthbuf_pars_vertex>',
  'varying vec2 vUv;',
  'varying vec3 vNormalW;',
  'varying vec3 vPosW;',
  'void main() {',
  '  vUv = uv;',
  '  vNormalW = normalize(mat3(modelMatrix) * normal);',
  '  vec4 wp = modelMatrix * vec4(position, 1.0);',
  '  vPosW = wp.xyz;',
  '  gl_Position = projectionMatrix * viewMatrix * wp;',
  '  #include <logdepthbuf_vertex>',
  '}',
].join('\n');

const EARTH_FRAG = [
  '#include <common>',
  '#include <logdepthbuf_pars_fragment>',
  'uniform sampler2D uDay;',
  'uniform sampler2D uNight;',
  'uniform sampler2D uClouds;',
  'uniform vec3 uSunDir;',
  'uniform vec3 uAtmoColor;',
  'uniform float uCloudOffset;',
  'uniform float uHasNight;',
  'varying vec2 vUv;',
  'varying vec3 vNormalW;',
  'varying vec3 vPosW;',
  'void main() {',
  '  #include <logdepthbuf_fragment>',
  '  vec3 N = normalize(vNormalW);',
  '  vec3 L = normalize(uSunDir);',
  '  vec3 V = normalize(cameraPosition - vPosW);',
  '',
  '  vec3 day = texture2D(uDay, vUv).rgb;',
  '  float cloudA = texture2D(uClouds, vec2(vUv.x + uCloudOffset, vUv.y)).r;',
  '',
  '  // pencahayaan: lambert penuh + sedikit ambient agar sisi gelap tetap terbaca',
  '  float lambert = max(dot(N, L), 0.0);',
  '  float lit = 0.035 + 0.965 * pow(lambert, 0.85);',
  '',
  '  // sisi siang: permukaan + awan',
  '  vec3 surface = day * lit;',
  '  vec3 cloudLit = vec3(1.0) * lit * 1.05;',
  '  vec3 dayCol = mix(surface, cloudLit, cloudA * 0.88);',
  '',
  '  // sisi malam: lampu kota (peta malam NASA)',
  '  vec3 night = vec3(0.0);',
  '  if (uHasNight > 0.5) {',
  '    vec3 ntex = texture2D(uNight, vUv).rgb;',
  '    float cityGlow = pow(max(ntex.r - 0.015, 0.0) * 2.4, 1.15);',
  '    night = vec3(1.00, 0.85, 0.58) * cityGlow * 1.5;',
  '  }',
  '',
  '  // transisi siang→malam yang halus (terminator)',
  '  float terminator = smoothstep(-0.10, 0.22, dot(N, L));',
  '  vec3 col = mix(night, dayCol, terminator);',
  '',
  '  // semburat atmosfer di tepi: kuat, terutama di sisi terang',
  '  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);',
  '  vec3 atmo = uAtmoColor * rim * (0.15 + 1.25 * lit);',
  '  col += atmo;',
  '',
  '  // pendar biru tipis di seluruh sisi terang (hamburan atmosfer)',
  '  col += uAtmoColor * 0.06 * lit;',
  '',
  '  gl_FragColor = vec4(col, 1.0);',
  '}',
].join('\n');

function makeEarthMaterial() {
  const t = TEX.earth || {};
  return new THREE.ShaderMaterial({
    uniforms: {
      uDay:      { value: t.map || null },
      uNight:    { value: t.night || null },
      uClouds:   { value: t.clouds || null },
      uSunDir:   { value: new THREE.Vector3(1, 0, 0) },
      uAtmoColor:{ value: new THREE.Color(0x3a7bd5) },
      uCloudOffset: { value: 0.0 },
      uHasNight: { value: t.night ? 1.0 : 0.0 },
    },
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG,
  });
}

/* ---------- material planet standar (tekstur + normal map) ---------- */
function makePlanetMaterial(key, opt) {
  opt = opt || {};
  const t = TEX[key] || {};
  const params = {
    map: t.map || null,
    roughness: opt.roughness !== undefined ? opt.roughness : 0.92,
    metalness: 0.0,
  };
  if (t.normal) {
    params.normalMap = t.normal;
    params.normalScale = new THREE.Vector2(
      opt.normalStrength || 1.0, opt.normalStrength || 1.0);
  }
  /* emissive tipis dari peta yang sama: menjaga detail tetap terbaca di
     bagian yang kurang terkena cahaya, tanpa membuat warna pudar.
     Nilai besar (>0.4) justru mencuci warna seperti terlihat pada uji. */
  if (t.map && opt.emissive) {
    params.emissiveMap = t.map;
    params.emissive = new THREE.Color(0xffffff);
    params.emissiveIntensity = opt.emissive;
  }
  return new THREE.MeshStandardMaterial(params);
}

/* ---------- cincin Saturnus: 3D dengan ketebalan & bayangan ---------- */
/* Dibuat dari cakram tipis (bukan bidang datar) supaya punya sisi,
   dan shader-nya menghitung: terang sesuai sudut cahaya, bayangan planet
   yang jatuh ke cincin, serta bagian cincin yang berada di belakang planet. */
const RING_VERT = [
  '#include <common>',
  '#include <logdepthbuf_pars_vertex>',
  'varying vec2 vUv;',
  'varying vec3 vNormalW;',
  'varying vec3 vPosW;',
  'void main() {',
  '  vUv = uv;',
  '  vNormalW = normalize(mat3(modelMatrix) * normal);',
  '  vec4 wp = modelMatrix * vec4(position, 1.0);',
  '  vPosW = wp.xyz;',
  '  gl_Position = projectionMatrix * viewMatrix * wp;',
  '  #include <logdepthbuf_vertex>',
  '}',
].join('\n');

const RING_FRAG = [
  '#include <common>',
  '#include <logdepthbuf_pars_fragment>',
  'uniform sampler2D uMap;',
  'uniform vec3 uSunDir;',
  'uniform vec3 uPlanetCenter;',
  'uniform float uPlanetRadius;',
  'uniform float uRingInner;',
  'uniform float uRingOuter;',
  'varying vec2 vUv;',
  'varying vec3 vNormalW;',
  'varying vec3 vPosW;',
  'void main() {',
  '  #include <logdepthbuf_fragment>',
  '  vec4 tex = texture2D(uMap, vec2(vUv.x, 0.5));',
  '  if (tex.a < 0.02) discard;',
  '',
  '  vec3 L = normalize(uSunDir);',
  '  // cincin = partikel tipis; cahaya datang dari dua sisi',
  '  float ndl = abs(dot(normalize(vNormalW), L));',
  '  float lit = 0.25 + 0.75 * ndl;',
  '',
  '  // bayangan planet pada cincin: titik di cincin yang berada di belakang',
  '  // planet terhadap arah Matahari akan gelap',
  '  vec3 toPlanet = uPlanetCenter - vPosW;',
  '  float distToAxis = length(toPlanet - L * dot(toPlanet, L));',
  '  float behind = step(0.0, dot(toPlanet, L));',
  '  float shadow = 1.0 - behind * (1.0 - smoothstep(uPlanetRadius * 0.92, uPlanetRadius * 1.35, distToAxis));',
  '',
  '  // cincin juga menerima bayangan dari dirinya sendiri di sisi luar',
  '  vec3 col = tex.rgb * lit * shadow;',
  '  gl_FragColor = vec4(col, tex.a * 0.96);',
  '}',
].join('\n');

function makeRingMaterial(ringTex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: ringTex || null },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uPlanetCenter: { value: new THREE.Vector3() },
      uPlanetRadius: { value: 1 },
      uRingInner: { value: 1 },
      uRingOuter: { value: 2 },
    },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/* ---------- Matahari: permukaan menyala + korona ---------- */
const SUNSURF_FRAG = [
  '#include <common>',
  '#include <logdepthbuf_pars_fragment>',
  'uniform sampler2D uMap;',
  'uniform float uTime;',
  'varying vec2 vUv;',
  'void main() {',
  '  #include <logdepthbuf_fragment>',
  '  vec3 base = texture2D(uMap, vUv).rgb;',
  '  // denyut halus meniru granulasi & flare',
  '  float pulse = 0.94 + 0.06 * sin(uTime * 0.7 + vUv.x * 22.0) * sin(uTime * 0.43 + vUv.y * 15.0);',
  '  vec3 col = base * pulse * 1.45;',
  '  gl_FragColor = vec4(col, 1.0);',
  '}',
].join('\n');

const SUNSURF_VERT = [
  '#include <common>',
  '#include <logdepthbuf_pars_vertex>',
  'varying vec2 vUv;',
  'void main() {',
  '  vUv = uv;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '  #include <logdepthbuf_vertex>',
  '}',
].join('\n');
