/* =======================================================================
   Pembangunan scene 3D — memakai tekstur NYATA (NASA / USGS / SSS)
   ----------------------------------------------------------------------
   Hierarki:
     scene
      ├─ body.group      → posisi orbit planet
      │   ├─ body.spin   → kemiringan poros + rotasi harian
      │   │    ├─ mesh planet (material nyata)
      │   │    ├─ atmosfer (cangkang fresnel, ikut arah Matahari)
      │   │    └─ moonPlane[i] → orbit bulan → spin → mesh bulan
      ├─ orbitLine (elips nyata, fokus di Matahari)
      └─ sabuk asteroid, bintang, langit Bima Sakti
   ======================================================================= */

let renderer, scene, camera;
const bodies = [];
const pickables = [];
let sunMesh, sunGlow, sunRim, skyMesh, beltPoints, sunLight, starField_legacy;
const glowTextures = {};

/* pemetaan nama bulan -> kunci tekstur di TEX */
const MOON_TEX_KEY = {
  'Bulan': 'moon', 'Phobos': 'phobos', 'Deimos': 'deimos',
  'Io': 'io', 'Europa': 'europa', 'Ganymede': 'ganymede', 'Callisto': 'callisto',
  'Titan': 'titan', 'Rhea': 'rhea', 'Iapetus': 'iapetus',
  'Titania': 'titania', 'Triton': 'triton',
};

function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({
    canvas: canvas, antialias: true, powerPreference: 'high-performance',
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
}

function onResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
}

function canvasTexture(canvas, srgb) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb !== false) tex.encoding = THREE.sRGBEncoding;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function buildSphere(radiusUnits, flat, wSeg, hSeg) {
  const geo = new THREE.SphereGeometry(radiusUnits, wSeg || 64, hSeg || 48);
  if (flat && flat > 0.001) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) * (1 - flat));
    }
    geo.computeVertexNormals();
  }
  return geo;
}

/* ---------- atmosfer: cangkang fresnel ---------- */
/* Chunk logdepthbuf wajib karena renderer memakai logarithmicDepthBuffer. */
const ATMOS_VERT = [
  '#include <common>',
  '#include <logdepthbuf_pars_vertex>',
  'varying vec3 vNormal;',
  'varying vec3 vPos;',
  'void main() {',
  '  vNormal = normalize(normalMatrix * normal);',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  vPos = mv.xyz;',
  '  gl_Position = projectionMatrix * mv;',
  '  #include <logdepthbuf_vertex>',
  '}',
].join('\n');

const ATMOS_FRAG = [
  '#include <common>',
  '#include <logdepthbuf_pars_fragment>',
  'uniform vec3 uColor;',
  'uniform float uOpacity;',
  'uniform float uFresnel;',
  'uniform float uPower;',
  'uniform vec3 uSunDirLocal;',
  'varying vec3 vNormal;',
  'varying vec3 vPos;',
  'void main() {',
  '  #include <logdepthbuf_fragment>',
  '  vec3 viewDir = normalize(-vPos);',
  '  vec3 N = normalize(vNormal);',
  '  float rim = pow(1.0 - abs(dot(N, viewDir)), uFresnel);',
  '  /* atmosfer hanya bersinar di sisi yang kena Matahari */',
  '  float sunSide = 0.12 + 0.88 * max(dot(N, normalize(uSunDirLocal)), 0.0);',
  '  float a = clamp(rim * uOpacity * sunSide, 0.0, 1.0);',
  '  gl_FragColor = vec4(uColor, pow(a, uPower));',
  '}',
].join('\n');

function makeAtmosphere(radiusUnits, cfg) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(cfg.color) },
      uOpacity: { value: cfg.opacity },
      uFresnel: { value: cfg.fresnel },
      uPower: { value: cfg.power || 1.3 },
      uSunDirLocal: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: ATMOS_VERT,
    fragmentShader: ATMOS_FRAG,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radiusUnits, 48, 32), mat);
}

/* ---------- kilau tepi Matahari ---------- */
const SUN_FRAG = [
  '#include <common>',
  '#include <logdepthbuf_pars_fragment>',
  'uniform vec3 uColor;',
  'uniform float uIntensity;',
  'uniform float uPower;',
  'varying vec3 vNormal;',
  'varying vec3 vPos;',
  'void main() {',
  '  #include <logdepthbuf_fragment>',
  '  vec3 viewDir = normalize(-vPos);',
  '  float rim = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), uPower);',
  '  gl_FragColor = vec4(uColor, rim * uIntensity);',
  '}',
].join('\n');

/* ---------- Matahari ---------- */
function buildSun() {
  const r = (SUN.radiusKm / RAD) * SIZE_FACTOR;
  const t = TEX.sun || {};
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: t.map || null },
      uTime: { value: 0 },
    },
    vertexShader: SUNSURF_VERT,
    fragmentShader: SUNSURF_FRAG,
  });
  sunMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 64), mat);
  scene.add(sunMesh);

  if (!glowTextures.sun) glowTextures.sun = makeGlowCanvas(512, [255, 246, 220], [255, 140, 30], 2.4);
  if (!glowTextures.halo) glowTextures.halo = makeGlowCanvas(512, [255, 200, 120], [255, 110, 20], 3.8);
  sunGlow = new THREE.Group();
  const sp1 = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture(glowTextures.sun, true), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp1.scale.set(r * 4.2, r * 4.2, 1);
  const sp2 = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture(glowTextures.halo, true), transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  sp2.scale.set(r * 12, r * 12, 1);
  const sp3 = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture(glowTextures.halo, true), transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  sp3.scale.set(r * 46, r * 46, 1);
  sunGlow.add(sp1); sunGlow.add(sp2); sunGlow.add(sp3);
  scene.add(sunGlow);

  sunRim = new THREE.Mesh(new THREE.SphereGeometry(r * 1.012, 64, 48), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffc060) }, uIntensity: { value: 1.0 }, uPower: { value: 1.7 } },
    vertexShader: ATMOS_VERT, fragmentShader: SUN_FRAG,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  scene.add(sunRim);

  sunLight = new THREE.PointLight(0xfff4e2, 1.25, 0, 0);
  /* intensity ~1.25 penting: dengan decay=0 nilai ini berperan sebagai
     pengali langsung albedo. Nilai 3.2 membuat seluruh permukaan planet
     terbakar menjadi putih (Bintik Merah Besar hilang). */
  sunLight.decay = 0;
  sunLight.distance = 0;
  scene.add(sunLight);
  /* cahaya pengisi sangat lemah agar sisi malam tidak hitam total */
  scene.add(new THREE.AmbientLight(0x1a2338, 0.35));

  const body = {
    id: 'sun', key: 'sun', name: 'Matahari', type: 'star',
    mesh: sunMesh, spin: sunMesh, radiusKm: r, realRadiusKm: SUN.radiusKm,
    info: SUN.info, rotationDays: SUN.rotationHours / 24, isMoon: false,
  };
  bodies.push(body);
  pickables.push(sunMesh);
  sunMesh.userData.bodyId = 'sun';
}

/* ---------- planet & bulan ---------- */
function buildBody(cfg, parentMoonPlane, hostBody) {
  const isMoon = !!hostBody;
  const radiusUnits = Math.max((cfg.radiusKm / RAD) * SIZE_FACTOR, MIN_RENDER_RADIUS_UNITS);

  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  (parentMoonPlane || scene).add(group);

  /* bidang orbit bulan: miring mengikuti poros induk, tidak ikut rotasi harian */
  const moonPlane = new THREE.Group();
  if (cfg.axialTilt) moonPlane.rotation.z = THREE.MathUtils.degToRad(cfg.axialTilt);
  group.add(moonPlane);

  /* ----- material: tekstur nyata ----- */
  const isEarth = (cfg.key === 'earth');
  let mat;
  if (isEarth) {
    mat = makeEarthMaterial();
  } else if (isMoon) {
    mat = makePlanetMaterial(MOON_TEX_KEY[cfg.name], {
      roughness: 0.96, normalStrength: 1.15,
      /* bulan berbatu: emissive sangat kecil — hanya supaya kawah di sisi
         gelap tidak hilang total, tanpa menghapus bayangan terminator */
      emissive: 0.035,
    });
  } else {
    const gasGiants = { jupiter: 1, saturn: 1, uranus: 1, neptune: 1 };
    mat = makePlanetMaterial(cfg.key, {
      roughness: gasGiants[cfg.key] ? 0.80 : 0.94,
      normalStrength: 1.0,
      /* gas raksasa: awan tebal memantulkan cahaya kuat, jadi sedikit lebih
         terang; planet batuan tetap gelap di sisi malam */
      emissive: gasGiants[cfg.key] ? 0.10 : 0.035,
    });
  }

  const mesh = new THREE.Mesh(
    buildSphere(radiusUnits, cfg.flat || 0, isMoon ? 48 : 80, isMoon ? 32 : 56), mat);
  spin.add(mesh);
  pickables.push(mesh);

  let atmoMesh = null;
  if (cfg.atmosphere) {
    atmoMesh = makeAtmosphere(radiusUnits * (cfg.atmosphere.radius || 1.05), cfg.atmosphere);
    spin.add(atmoMesh);
  }

  if (cfg.axialTilt) spin.rotation.z = THREE.MathUtils.degToRad(cfg.axialTilt);

  /* ----- cincin Saturnus (shader: ketebalan + bayangan planet) ----- */
  let ringMesh = null;
  if (cfg.ring && TEX.saturn && TEX.saturn.ring) {
    const innerU = (cfg.ring.inner / RAD) * SIZE_FACTOR;
    const outerU = (cfg.ring.outer / RAD) * SIZE_FACTOR;
    const rGeo = new THREE.RingGeometry(innerU, outerU, 512, 1);
    const pos = rGeo.attributes.position;
    const uv = rGeo.attributes.uv;
    const v3 = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v3.fromBufferAttribute(pos, i);
      const t = (v3.length() - innerU) / (outerU - innerU);
      uv.setXY(i, t, 0.5);
    }
    const rMat = makeRingMaterial();
    rMat.uniforms.uRingInner.value = innerU;
    rMat.uniforms.uRingOuter.value = outerU;
    ringMesh = new THREE.Mesh(rGeo, rMat);
    ringMesh.rotation.x = Math.PI / 2;
    spin.add(ringMesh);
  }

  const body = {
    id: cfg.key || (isMoon ? (hostBody.key + ':' + cfg.name) : cfg.name),
    key: cfg.key || (isMoon ? (hostBody.key + ':' + cfg.name) : cfg.name),
    name: cfg.name,
    type: isMoon ? 'moon' : 'planet',
    group: group, spin: spin, moonPlane: moonPlane, mesh: mesh,
    atmoMesh: atmoMesh, ringMesh: ringMesh,
    isEarth: isEarth,
    radiusKm: radiusUnits, realRadiusKm: cfg.radiusKm,
    host: hostBody || null, isMoon: isMoon,
    aKm: cfg.aKm, e: cfg.e || 0,
    incl: THREE.MathUtils.degToRad(cfg.incl !== undefined ? cfg.incl : (ORBIT_INCLINATION[cfg.name] || 0)),
    axialTiltDeg: cfg.axialTilt || 0,
    rotationDays: (cfg.rotationHours || 24) / 24,
    periodDays: cfg.periodDays !== undefined ? cfg.periodDays : 0,
    tidallyLocked: !!cfg.tidallyLocked,
    orbitRadiusUnits: cfg.aKm / RAD,
    info: cfg.info || null,
    theta0: 0, orbitLine: null,
  };
  group.userData.body = body;
  spin.userData.body = body;
  mesh.userData.bodyId = body.id;
  if (ringMesh) ringMesh.userData.bodyId = body.id;

  /* garis orbit planet: elips nyata (fokus = Matahari) */
  if (!isMoon) {
    const a = cfg.aKm / RAD;
    const b = a * Math.sqrt(1 - body.e * body.e);
    const c = a * body.e;
    const pts = [];
    for (let i = 0; i <= 512; i++) {
      const th = (i / 512) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(th) * a - c, 0, Math.sin(th) * b));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xa8c4e8, transparent: true, opacity: 0.30, depthWrite: false })
    );
    line.rotation.x = body.incl;
    scene.add(line);
    body.orbitLine = line;
  } else {
    /* Orbit satelit: lingkaran di sekitar induknya.
       ------------------------------------------------------------------
       Garis ini dulu digambar dengan radius penuh orbit (Bulan: 60 unit =
       384.400 km). Dari dekat planet, lingkaran sebesar itu melewati layar
       sebagai GARIS LURUS PANJANG yang terlihat aneh — pengguna melaporkan
       "garis putih panjang".

       Perbaikan: garis orbit satelit hanya digambar bila kamera cukup jauh
       untuk melihatnya sebagai lingkaran (lihat updateOrbitLineVisibility).
       Opacity juga diturunkan supaya tidak mendominasi.
       ------------------------------------------------------------------ */
    const a = (cfg.aKm / RAD) * MOON_ORBIT_FACTOR;
    const pts = [];
    for (let i = 0; i <= 256; i++) {
      const th = (i / 256) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(th) * a, 0, Math.sin(th) * a));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: 0x8fb0d8, transparent: true, opacity: 0.34, depthWrite: false,
      })
    );
    line.rotation.x = body.incl;
    parentMoonPlane.add(line);
    body.orbitLine = line;
    body.orbitLineIsMoon = true;
    body.orbitRadiusUnits = a;      /* dipakai untuk uji visibilitas */
  }
  return body;
}

/* ---------- sabuk asteroid ---------- */
function buildBelt() {
  const n = BELT.count;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const rnd = mulberry32(2024);
  const c = new THREE.Color(BELT.color);
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const au = BELT.minAU + rnd() * (BELT.maxAU - BELT.minAU);
    const r = (au * AU_KM) / RAD;
    const th = rnd() * Math.PI * 2;
    const incl = THREE.MathUtils.degToRad((rnd() - 0.5) * 2 * BELT.inclMax);
    const y = Math.sin(incl) * r;
    const rk = r * (1 + (rnd() - 0.5) * 0.02);
    positions[i * 3] = Math.cos(th) * rk;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(th) * rk;
    tmp.copy(c).multiplyScalar(0.55 + rnd() * 0.85);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 3.0, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.9, depthWrite: false,
  });
  beltPoints = new THREE.Points(geo, mat);
  beltPoints.frustumCulled = false;
  scene.add(beltPoints);
}

/* ---------- medan bintang ----------
   Sebelumnya: 8.000 titik acak (bukan bintang nyata).
   Sekarang: 8.714 bintang dari katalog HYG dengan posisi RA/Dec nyata,
   magnitudo nyata, dan warna dari indeks B-V — plus 86 rasi bintang,
   Bima Sakti, dan 20 galaksi/nebula. Lihat src/18-stars.js */
function buildStars() {
  buildStarField();
  starField_legacy = starField.points;   /* dipakai applyPositions untuk geser */
}

/* ---------- penanda navigasi ---------- */
/* Pada skala 1:1 planet hanya beberapa piksel dari jauh, dan satelit bisa
   jauh lebih kecil lagi (Phobos 0.0018 unit = sub-piksel). Tanpa penanda,
   satelit mustahil ditemukan. Karena itu SETIAP benda (planet DAN satelit)
   mendapat penanda: inti tajam berwarna + halo lembut. */
function buildBeacons() {
  if (!glowTextures.dot) glowTextures.dot = makeGlowCanvas(64, [255, 255, 255], [255, 255, 255], 2.0);
  if (!glowTextures.core) glowTextures.core = makeDiscCanvas(64);
  if (!glowTextures.ring) glowTextures.ring = makeRingHaloCanvas(96);
  const dotTex = canvasTexture(glowTextures.ring, true);
  const coreTex = canvasTexture(glowTextures.core, true);

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.type === 'star') continue;      /* Matahari sudah terang sendiri */
    const col = b.isMoon ? moonColorHex(b) : bodyColorHex(b);
    const group = new THREE.Group();
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: coreTex, color: col, transparent: true,
      blending: THREE.NormalBlending, depthWrite: false, depthTest: false,
      opacity: 1.0, toneMapped: false,
    }));
    group.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTex, color: col, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      opacity: 0.22, toneMapped: false,
    }));
    group.add(halo);
    group.renderOrder = 100;
    scene.add(group);
    b.beacon = { group: group, core: core, halo: halo };
  }
}

/* warna penanda satelit */
function moonColorHex(b) {
  const c = {
    'Bulan': 0xd8d4cc, 'Phobos': 0xa89888, 'Deimos': 0xb8a898,
    'Io': 0xf0d84a, 'Europa': 0xe8e0d0, 'Ganymede': 0xb0a898, 'Callisto': 0x9a9088,
    'Titan': 0xe8a850, 'Rhea': 0xd0ccc4, 'Iapetus': 0xb0a490,
    'Titania': 0xc0b8b0, 'Triton': 0xd0d4d0,
  };
  return c[b.name] !== undefined ? c[b.name] : 0xcccccc;
}

const _bp = new THREE.Vector3();
const _hostP = new THREE.Vector3();

/* Garis orbit satelit hanya ditampilkan bila kamera cukup jauh untuk
   melihatnya sebagai lingkaran. Kalau kamera berada DI DALAM lingkaran
   orbit (jarak < radius orbit), garis itu melewati layar sebagai garis
   lurus panjang yang terlihat aneh — ini yang dilaporkan pengguna.
   Ambang: tampilkan hanya bila radius orbit minimal 25% dari jarak kamera,
   supaya lingkaran terlihat utuh di dalam bidang pandang. */
function updateOrbitLineVisibility() {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b.orbitLine) continue;
    if (b.orbitLineIsMoon) {
      const host = b.host;
      if (!host || !host.absPos) { b.orbitLine.visible = false; continue; }
      bodyScreenPos(host, _hostP);
      const distHost = camera.position.distanceTo(_hostP);
      const rOrbit = b.orbitRadiusUnits || 0;
      /* sembunyikan bila kamera terlalu dekat (garis akan tampak lurus)
         atau terlalu jauh (garis tidak terlihat berguna) */
      b.orbitLine.visible = rOrbit > 0 &&
                            distHost > rOrbit * 2.2 &&
                            distHost < rOrbit * 900;
    }
  }
}

function updateBeacons() {
  const H = window.innerHeight;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const now = performance.now();

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b.beacon) continue;
    bodyScreenPos(b, _bp);   /* relatif kamera: dunia sudah tergeser */
    const dist = Math.max(camera.position.distanceTo(_bp), 1e-6);
    const px = (b.radiusKm / dist) * (H * 0.5) / tanHalf;   /* radius di layar (piksel) */

    /* --- kapan penanda ditampilkan --- */
    let show;
    if (b.isMoon) {
      /* Satelit: tampil bila ia sendiri masih kecil di layar, DAN induknya
         masih dalam pandangan.
         PENTING: batas "induk terlihat" harus dibandingkan dengan JARAK
         KAMERA, bukan radius induk. Memakai radius induk × 140 membuat
         penanda mustahil muncul saat kamera menjauh untuk memuat orbit
         (jarak kamera 143 unit vs batas 140 unit) — inilah bug yang
         membuat semua satelit tampak "tidak ada". */
      bodyScreenPos(b.host, _hostP);
      const distHost = camera.position.distanceTo(_hostP);
      const batas = Math.max(b.host.radiusKm * 12, 2500);
      const hostVisible = distHost < batas;
      show = hostVisible && px < 8.0;
    } else {
      show = px < 5.5;
    }

    /* sembunyikan penanda benda yang sedang diikuti kamera */
    if (cameraState.target === b) show = false;
    /* sembunyikan penanda yang sudah sangat dekat dengan kamera — kita sudah
       berada di dekatnya, jadi tidak perlu penunjuk.
       Ambang memakai ukuran di layar (px), bukan jarak absolut: satelit
       kecil seperti Phobos tetap butuh penanda walau jaraknya dekat. */
    if (show && px > 60) show = false;

    b.beacon.group.visible = show;
    if (!show) continue;

    /* ukuran tetap di layar: hitung berapa satuan dunia untuk 1 piksel */
    const unit = (2 * dist * tanHalf) / H;
    /* satelit dapat inti sedikit lebih kecil agar tidak menutupi induknya,
       tapi tidak boleh terlalu kecil — pada skala 1:1 satelit nyaris tak
       terlihat, jadi penanda harus tegas */
    const basePx = b.isMoon ? 5.6 : 6.0;
    const corePx = basePx + Math.min(3.5, Math.max(0, 1 - px / 6.0) * 3.5);
    const haloPx = corePx * (b.isMoon ? 3.0 : 3.4);
    b.beacon.core.scale.set(corePx * unit, corePx * unit, 1);
    b.beacon.halo.scale.set(haloPx * unit, haloPx * unit, 1);
    b.beacon.halo.material.opacity = 0.26 + 0.12 * Math.sin(now * 0.0022 + i * 1.7);
    b.beacon.group.position.copy(_bp);
  }
}

function bodyColorHex(b) {
  const c = {
    sun: 0xffb44d, mercury: 0xb8a894, venus: 0xf5d98a, earth: 0x2f7fe8, mars: 0xe8622a,
    jupiter: 0xe8b06a, saturn: 0xf2e0a8, uranus: 0x6fe0e8, neptune: 0x3f6fe8,
  };
  return c[b.key] !== undefined ? c[b.key] : 0xbbbbbb;
}

/* ---------- langit: Bima Sakti nyata ---------- */
function buildSky() {
  let mat;
  const t = TEX.milkyway || {};
  if (t.map) {
    t.map.mapping = THREE.EquirectangularReflectionMapping;
    mat = new THREE.MeshBasicMaterial({ map: t.map, side: THREE.BackSide, depthWrite: false, fog: false });
  } else {
    const canvas = makeSkyCanvas(2048, 1024, 909);
    mat = new THREE.MeshBasicMaterial({ map: canvasTexture(canvas, true), side: THREE.BackSide, depthWrite: false, fog: false });
  }
  skyMesh = new THREE.Mesh(new THREE.SphereGeometry(900000, 64, 48), mat);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -200;
  scene.add(skyMesh);
  if (!glowTextures.dot) glowTextures.dot = makeGlowCanvas(64, [255, 255, 255], [255, 255, 255], 2.0);
}

/* =======================================================================
   FLOATING ORIGIN (titik asal mengambang)
   ----------------------------------------------------------------------
   Masalah nyata pada skala 1:1: saat kamera menempel di permukaan Bumi,
   koordinat dunia mencapai 23.000 unit sementara jarak kamera 0,02 unit.
   Rasio ~1.000.000 : 1 melampaui presisi float32 → geometri hancur dan
   planet tidak terlihat (inilah bug "Bumi hilang" yang ditemukan lewat uji).

   Solusi standar industri: kamera SELALU di titik asal (0,0,0), dan
   seluruh tata surya digeser relatif terhadap kamera. Presisi float
   selalu penuh karena semua koordinat yang dirender bernilai kecil.
   ======================================================================= */
let rebaseOffset = new THREE.Vector3();
const _absPos = new THREE.Vector3();

/* geser benda-benda tunggal (Matahari, sabuk, bintang, langit) */
function applyRebaseToStatics() {
  const nx = -rebaseOffset.x, ny = -rebaseOffset.y, nz = -rebaseOffset.z;
  if (sunMesh) sunMesh.position.set(nx, ny, nz);
  if (sunRim) sunRim.position.set(nx, ny, nz);
  if (sunGlow) sunGlow.position.set(nx, ny, nz);
  if (beltPoints) beltPoints.position.set(nx, ny, nz);
  if (typeof starField !== 'undefined' && starField.group) {
    starField.group.position.set(nx, ny, nz);
  }
  if (skyMesh) skyMesh.position.set(nx, ny, nz);
}

/* ---------- animasi: orbit, rotasi, arah cahaya ---------- */
const _v1 = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _bodyPos = new THREE.Vector3();
const _inv = new THREE.Matrix4();

/* =======================================================================
   Animasi dibagi DUA TAHAP supaya konsisten dengan floating origin:
     1. computePositions(days)  → hitung posisi ABSOLUT semua benda
     2. applyPositions()        → geser ke posisi render memakai rebaseOffset
   Urutan di gelung render: computePositions → updateCamera (menetapkan
   rebaseOffset) → applyPositions → render. Dengan begitu benda dan kamera
   selalu memakai offset yang SAMA (tidak ada keterlambatan satu frame).
   ======================================================================= */

function computePositions(days, elapsed) {
  /* waktu absolut: J2000 + jumlah hari simulasi.
     Posisi benda dihitung dari EPHEMERIS NYATA (JPL + Meeus), bukan lagi
     orbit lingkaran dengan sudut acak. Ini yang membuat gerhana akurat. */
  const jd = J2000_JD + days;

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.type === 'star') {
      if (sunMesh.material.uniforms && sunMesh.material.uniforms.uTime) {
        sunMesh.material.uniforms.uTime.value = elapsed || 0;
      }
      b.rotationDays = b.rotationDays || 25.38;
      b.spinAngle = (days / b.rotationDays) * Math.PI * 2 * 0.15;
      b.absPos = b.absPos || new THREE.Vector3();
      b.absPos.set(0, 0, 0);
      continue;
    }

    /* --- posisi NYATA dari ephemeris --- */
    const pos = ephemerisPos(b, jd);
    if (!pos) continue;

    b.absPos = b.absPos || new THREE.Vector3();
    b.absPos.set(pos.x, pos.y, pos.z);

    /* spin benda: pakai rotasi sideris nyata, dan Bulan terkunci pasang-surut */
    if (b.isMoon) {
      /* Bulan selalu menghadap Bumi. Arahnya dihitung dari vektor
         Bumi→Bulan supaya tetap benar walau orbitnya miring. */
      if (b.host && b.host.absPos) {
        const dx = b.absPos.x - b.host.absPos.x;
        const dz = b.absPos.z - b.host.absPos.z;
        b._spinAngle = Math.atan2(dx, dz) + Math.PI;
      } else {
        b._spinAngle = (days / b.rotationDays) * Math.PI * 2;
      }
    } else {
      b._spinAngle = (days / b.rotationDays) * Math.PI * 2;
    }
    b._theta = 0;
  }
}

/* posisi ephemeris untuk sebuah benda, dalam unit scene (RAD).
   ----------------------------------------------------------------------
   BUG YANG DIPERBAIKI DI SINI:
   Sebelumnya SEMUA satelit memakai moonPositionKm(jd) — yaitu posisi
   Bulan BUMI dari teori Meeus. Akibatnya:
     - Io ditempatkan 402.446 km dari Jupiter (seharusnya 421.800 km,
       dan pada bidang orbit Jupiter, bukan bidang orbit Bulan)
     - posisinya memakai inklinasi 5,145° milik Bulan, bukan 0,05° milik Io
   Jadi satelit tidak pernah berada di tempat yang ditunjuk kamera.

   Sekarang:
     - Bulan (Bumi)  -> moonPositionKm() presisi tinggi (perlu untuk gerhana)
     - satelit lain  -> orbit Kepler sederhana mengelilingi induknya,
                        memakai aKm/e/incl NYATA milik satelit itu
   ---------------------------------------------------------------------- */
function ephemerisPos(b, jd) {
  if (b.isMoon) {
    if (!b.host) return null;
    const hostPos = b.host.absPos;
    if (!hostPos) return null;
    const k = 1 / RAD;

    if (b.name === 'Bulan') {
      /* Bulan Bumi: teori Meeus bab 47, presisi ~10" — dipakai untuk gerhana */
      const mk = moonPositionKm(jd);
      return {
        x: hostPos.x + mk.x * k,
        y: hostPos.y + mk.z * k,      /* z ekliptika -> y scene (atas) */
        z: hostPos.z - mk.y * k,      /* y ekliptika -> -z scene */
      };
    }

    /* satelit lain: orbit Kepler mengelilingi induk, memakai elemen NYATA */
    const a = (b.aKm / RAD) * MOON_ORBIT_FACTOR;
    const e = b.e || 0;
    const n = (2 * Math.PI) / (b.periodDays * 86400);   /* rad per detik */
    const T = (jd - J2000_JD) * 86400;                  /* detik sejak J2000 */
    const M = (b.theta0 || 0) + n * T;

    /* selesaikan persamaan Kepler */
    let E = M;
    for (let i = 0; i < 6; i++) {
      E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    }

    /* posisi di bidang orbit (fokus di induk) */
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

    /* miringkan bidang orbit, lalu putar oleh kemiringan poros induk
       supaya bidang orbit satelit mengikuti ekuator induknya
       (seperti Bulan yang mengorbit di bidang ekliptika, dan
        satelit Jupiter yang mengorbit di bidang ekuator Jupiter) */
    const incl = b.incl || 0;
    const tilt = THREE.MathUtils.degToRad(b.host.axialTiltDeg || 0);
    const ci = Math.cos(incl), si = Math.sin(incl);
    let ox = xp;
    let oy = yp * si;
    let oz = yp * ci;
    if (tilt) {
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const ny = oy * ct - ox * st;
      const nx2 = oy * st + ox * ct;
      oy = ny; ox = nx2;
    }

    return {
      x: hostPos.x + ox * k,
      y: hostPos.y + oy * k,
      z: hostPos.z + oz * k,
    };
  }
  const key = EPHEMERIS_KEY[b.key];
  if (!key) return null;
  const p = planetPositionAU(key, jd);
  if (!p) return null;
  const k = AU_KM / RAD;
  return {
    x: p.x * k,
    y: p.z * k,                     /* z ekliptika -> y scene (atas) */
    z: -p.y * k,                    /* y ekliptika -> -z scene */
  };
}

/* pemetaan key benda -> key elemen JPL */
const EPHEMERIS_KEY = {
  mercury: 'mercury', venus: 'venus', earth: 'earth', mars: 'mars',
  jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus', neptune: 'neptune',
};

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

function applyPositions() {
  const nx = -rebaseOffset.x, ny = -rebaseOffset.y, nz = -rebaseOffset.z;

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.type === 'star') {
      if (b.spinAngle !== undefined) sunMesh.rotation.y = b.spinAngle;
      continue;
    }
    if (b.isMoon) {
      /* ------------------------------------------------------------------
         BUG YANG DIPERBAIKI DI SINI:
         Sebelumnya baris ini memakai `b._local` — sisa kode dari masa
         sebelum ephemeris. Sejak computePositions() diubah memakai
         ephemerisPos(), `_local` tidak pernah diisi lagi, jadi Bulan
         TIDAK PERNAH dipindahkan ke posisi nyatanya: ia tetap di titik
         asal relatif induknya. Akibatnya kamera (yang memakai absPos yang
         benar) terlihat "tidak mengikuti Bulan" — selisihnya persis satu
         radius orbit (60 unit untuk Bulan).

         Grup bulan adalah anak dari moonPlane induknya, yang dirotasi oleh
         axialTilt induk. Jadi offset lokal harus dibalik-putar dulu supaya
         posisi RENDER-nya sama dengan absPos yang dipakai kamera.
         ------------------------------------------------------------------ */
      if (b.absPos && b.host && b.host.absPos) {
        /* offset bulan terhadap induk, dalam kerangka scene */
        const dx = b.absPos.x - b.host.absPos.x;
        const dy = b.absPos.y - b.host.absPos.y;
        const dz = b.absPos.z - b.host.absPos.z;

        /* balik-putar oleh kemiringan poros induk (moonPlane.rotation.z) */
        const tilt = THREE.MathUtils.degToRad(b.host.axialTiltDeg || 0);
        const ct = Math.cos(tilt), st = Math.sin(tilt);
        const lx = dx * ct + dy * st;
        const ly = -dx * st + dy * ct;

        b.group.position.set(lx, ly, dz);
      }
      if (b._spinAngle !== undefined) b.spin.rotation.y = b._spinAngle;
      continue;
    }
    if (!b.absPos) continue;
    /* posisi render = posisi absolut − offset kamera */
    b.group.position.set(b.absPos.x + nx, b.absPos.y + ny, b.absPos.z + nz);
    if (b._spinAngle !== undefined) b.spin.rotation.y = b._spinAngle;

    /* arah cahaya Matahari (Matahari di titik asal absolut) */
    _sunDir.copy(b.absPos).negate().normalize();

    if (b.isEarth && b.mesh.material.uniforms) {
      b.mesh.material.uniforms.uSunDir.value.copy(_sunDir);
      b.mesh.material.uniforms.uCloudOffset.value = ((app.days || 0) / 0.9 % 1 + 1) % 1;
    }
    if (b.atmoMesh) {
      b.mesh.updateWorldMatrix(true, false);
      _inv.copy(b.mesh.matrixWorld).invert();
      b.atmoMesh.material.uniforms.uSunDirLocal.value
        .copy(_sunDir).transformDirection(_inv);
    }
    if (b.ringMesh) {
      const u = b.ringMesh.material.uniforms;
      u.uSunDir.value.copy(_sunDir);
      u.uPlanetCenter.value.set(0, 0, 0);
      u.uPlanetRadius.value = b.radiusKm;
    }
  }

  /* elemen tunggal ikut tergeser */
  if (sunMesh) sunMesh.position.set(nx, ny, nz);
  if (sunRim) sunRim.position.set(nx, ny, nz);
  if (sunGlow) sunGlow.position.set(nx, ny, nz);
  if (beltPoints) beltPoints.position.set(nx, ny, nz);
  if (typeof starField !== 'undefined' && starField.group) {
    starField.group.position.set(nx, ny, nz);
  }
  if (skyMesh) skyMesh.position.set(nx, ny, nz);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    /* garis orbit PLANET berada di scene (perlu digeser).
       Garis orbit SATELIT adalah anak dari grup induknya, jadi sudah ikut
       bergerak bersama induk — kalau digeser lagi posisinya akan salah. */
    if (b.orbitLine && !b.orbitLineIsMoon) b.orbitLine.position.set(nx, ny, nz);
  }
}

/* Posisi ABSOLUT benda (Matahari di titik asal, tanpa pengaruh floating
   origin). Dipakai untuk fisika, kamera, label, dan penanda. */
function bodyWorldPos(b, out) {
  out = out || new THREE.Vector3();
  if (b.type === 'star') { out.set(0, 0, 0); return out; }
  if (b.absPos) { out.copy(b.absPos); return out; }
  /* bulan: posisi absolut = posisi induk + posisi lokal */
  b.group.getWorldPosition(out);
  return out;
}

/* Posisi RELATIF terhadap kamera — inilah yang dipakai untuk merender
   label & penanda, karena dunia sudah tergeser oleh floating origin. */
function bodyScreenPos(b, out) {
  out = out || new THREE.Vector3();
  bodyWorldPos(b, out);
  out.sub(rebaseOffset);
  return out;
}

function findBody(key) {
  for (let i = 0; i < bodies.length; i++) if (bodies[i].key === key) return bodies[i];
  return null;
}

/* cari benda berdasarkan nama (bulan punya key gabungan seperti 'mars:Phobos',
   jadi pencarian lewat nama lebih andal untuk dipakai UI/uji) */
function findBodyByName(name) {
  for (let i = 0; i < bodies.length; i++) if (bodies[i].name === name) return bodies[i];
  return null;
}
