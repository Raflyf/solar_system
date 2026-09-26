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

/* Bujur tekstur titik sub-Bumi (pusat sisi DEKAT Bulan yang selalu
   menghadap Bumi).
   ----------------------------------------------------------------------
   NILAI INI PERNAH SALAH (0,406) dan menyebabkan Bulan menampilkan sisi
   yang salah — sebagian sisi jauh yang tanpa maria ikut terlihat.

   Cara mengukur ulang dengan benar: peta Bulan standar (equirectangular)
   menempatkan titik sub-Bumi (bujur 0, lintang 0) di TENGAH gambar.
   Diukur dari citra: centroid kegelapan (maria) = u = 0,5009, yang
   memang sesuai konvensi tengah-gambar.

   Kesalahan lama: 0,406 -> meleset (0,406-0,5) x 360 = -33,8 derajat.
   ---------------------------------------------------------------------- */
const MOON_NEAR_SIDE_U = 0.5009;

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

  /* ======================================================================
     HIERARKI TIGA TINGKAT — supaya poros planet BENAR secara fisika
     ----------------------------------------------------------------------
     BUG YANG DIPERBAIKI:
     Sebelumnya hanya ada dua tingkat: `group` (posisi) dan `spin` (rotasi).
     Kemiringan poros ditulis ke spin.rotation.z, dan rotasi harian ke
     spin.rotation.y pada objek yang SAMA. Akibatnya:
       1. Semua planet miring ke arah sumbu X yang sama, padahal arah
          kutub nyata berbeda-beda (Uranus bahkan Dec NEGATIF, -15,175)
       2. Urutan Euler harus diakali dengan rotation.order = 'ZYX'
          supaya kutub tidak bergeser

     Struktur yang BENAR (tiga tingkat terpisah):
       group      : posisi planet (dipindah oleh floating origin)
       tiltGroup  : orientasi poros TETAP (kuaternion dari RA/Dec kutub)
       spin       : rotasi harian mengelilingi sumbu Y LOKAL

     Dengan pemisahan ini, rotasi harian selalu mengelilingi poros yang
     sudah benar, dan kutub tidak pernah bergeser. Tidak perlu lagi
     mengakali urutan Euler.
     ====================================================================== */
  const group = new THREE.Group();
  const tiltGroup = new THREE.Group();
  const spin = new THREE.Group();
  group.add(tiltGroup);
  tiltGroup.add(spin);
  (parentMoonPlane || scene).add(group);

  /* orientasi poros: pakai arah kutub nyata untuk planet, dan kemiringan
     sederhana untuk satelit (data kutub satelit tidak tersedia lengkap) */
  if (!isMoon && cfg.key) {
    const q = poleQuaternion(cfg.key);
    if (q) tiltGroup.quaternion.copy(q);
  } else if (cfg.axialTilt) {
    /* satelit: miringkan mengikuti poros induknya (bidang orbit satelit
       hampir sejajar ekuator induk untuk sebagian besar kasus) */
    tiltGroup.rotation.z = THREE.MathUtils.degToRad(cfg.axialTilt);
  }

  /* ======================================================================
     BIDANG ORBIT SATELIT
     ----------------------------------------------------------------------
     BUG YANG DIPERBAIKI:
     moonPlane dulu disalin orientasi poros INDUK untuk SEMUA satelit.
     Untuk Bulan Bumi itu SALAH BESAR: orbit Bulan hampir sejajar bidang
     EKLIPTIKA (kemiringan hanya 5,145 derajat), BUKAN bidang ekuator
     Bumi (23,44 derajat). Akibatnya sisi dekat Bulan meleset ~23 derajat
     dari Bumi, sehingga yang terlihat bukan permukaan yang seharusnya.

     ATURAN NYATA:
       - Bulan Bumi     : bidang orbit ~ EKLIPTIKA (miring 5,145 derajat)
       - Satelit Mars   : bidang orbit ~ ekuator Mars (miring 1-2 derajat)
       - Satelit Jupiter: bidang orbit ~ ekuator Jupiter (miring 0-0,5)
       - Satelit Saturnus: bidang orbit ~ ekuator Saturnus (kecuali Iapetus)
       - Satelit Uranus : bidang orbit ~ ekuator Uranus (miring 97,77!)
       - Triton         : bidang orbit MIRING 157 derajat (retrograde)

     Jadi: Bulan Bumi memakai bidang ekliptika, satelit lain memakai
     ekuator induknya. Ini yang membuat penampakan Bulan benar.
     ====================================================================== */
  const moonPlane = new THREE.Group();
  group.add(moonPlane);

  if (isMoon && cfg.name === 'Bulan') {
    /* Bulan Bumi: bidang orbit mengikuti EKLIPTIKA.
       Kemiringan 5,145 derajat terhadap ekliptika diterapkan di
       moonLocalOffset (lewat cfg.incl), jadi di sini moonPlane cukup
       TANPA rotasi poros induk — bidang dasarnya sudah ekliptika
       (bidang XZ scene). */
  } else if (!isMoon && cfg.key) {
    /* planet: bidang orbit satelitnya mengikuti ekuator planet */
    const q = poleQuaternion(cfg.key);
    if (q) moonPlane.quaternion.copy(q);
  } else if (cfg.axialTilt) {
    moonPlane.rotation.z = THREE.MathUtils.degToRad(cfg.axialTilt);
  }

  /* ----- material: tekstur nyata ----- */
  const isEarth = (cfg.key === 'earth');
  let mat;
  if (isEarth) {
    mat = makeEarthMaterial();
  } else if (isMoon) {
    mat = makePlanetMaterial(MOON_TEX_KEY[cfg.name], {
      roughness: 0.96, normalStrength: 1.15,
      /* BULAN TIDAK BOLEH MENYALA DI SISI MALAM.
         Sebelumnya ada emissive 0.035 supaya detail sisi gelap tidak
         hilang total — tapi akibatnya Bulan tampak "terang di kedua sisi"
         tanpa terminator yang jelas, padahal di kenyataan sisi malam Bulan
         benar-benar hitam (kecuali cahaya bumi / earthshine yang sangat
         redup, dan itu bukan bagian dari pencahayaan Matahari).
         emissive: 0 = hanya sisi yang terkena Matahari yang terang. */
      emissive: 0,
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

  /* Rotasi harian diterapkan pada grup `spin`, yang berada DI DALAM
     tiltGroup. Karena tiltGroup sudah memegang orientasi poros yang benar
     (kuaternion dari RA/Dec kutub nyata), rotasi harian di sumbu Y lokal
     otomatis mengelilingi poros yang benar. Tidak perlu mengakali urutan
     Euler lagi — itu sudah tidak dipakai sejak hierarki tiga tingkat. */
  if (cfg.axialTilt) spin.rotation.z = 0;

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

  /* Garis orbit planet.
     ------------------------------------------------------------------
     BUG YANG DIPERBAIKI DI SINI:
     Garis orbit dulu dibangun dengan rumus sendiri:
        x = cos(th)*a - c ,  z = sin(th)*b ,  lalu line.rotation.x = incl
     sedangkan posisi planet dihitung ephemerisPos() dengan konversi
     ekliptika->scene yang BERBEDA:
        x = p.x*k ,  y = p.z*k ,  z = -p.y*k
     Dua sistem koordinat ini tidak pernah bertemu, jadi garis orbit
     TIDAK PERNAH melewati planetnya — pengguna melaporkan "garis orbit
     tidak sinkron".

     Ditambah lagi garis dibangun SEKALI saat scene dibuat, sehingga tidak
     ikut berubah saat tanggal simulasi berubah.

     PERBAIKAN: garis orbit digambar dari EPHEMERIS yang sama dengan yang
     dipakai menghitung posisi planet (lihat rebuildOrbitLines). Dengan
     begitu garis selalu melewati planet, untuk tanggal berapa pun.
     ------------------------------------------------------------------ */
  if (!isMoon) {
    const line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xa8c4e8, transparent: true, opacity: 0.32, depthWrite: false,
      })
    );
    line.frustumCulled = false;
    scene.add(line);
    body.orbitLine = line;
    body.orbitLineIsPlanet = true;
  } else {
    /* Orbit satelit: digambar dari ephemeris yang sama dengan posisinya.
       Lihat rebuildOrbitLines() — dengan begitu garis selalu melewati
       satelitnya, untuk tanggal berapa pun. */
    const line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0x8fb0d8, transparent: true, opacity: 0.34, depthWrite: false,
      })
    );
    line.frustumCulled = false;
    parentMoonPlane.add(line);
    body.orbitLine = line;
    body.orbitLineIsMoon = true;
    body.orbitRadiusUnits = (cfg.aKm / RAD) * MOON_ORBIT_FACTOR;
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
const _invQ = new THREE.Quaternion();
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

    /* ==============================================================
       ROTASI SEMUA BENDA — memakai elemen rotasi IAU
       --------------------------------------------------------------
       BUG YANG DIPERBAIKI DI SINI:
       Kode lama memakai sudut = days/rotationDays * 2pi untuk SEMUA benda,
       yaitu menghitung rotasi dari J2000 TANPA SUDUT AWAL (W0). Akibatnya
       permukaan setiap benda tidak berada di posisi yang benar. Untuk
       Bumi meleset ~280° — itulah kenapa jam lokal tidak sinkron dan
       Indonesia tampak gelap padahal masih jam 4 pagi.

       PERBAIKAN: memakai rumus IAU WGCCRE 2015:
           W(t) = W0 + Wdot x d      (d = hari sejak J2000)
       W0 dan Wdot diambil dari tabel IAU untuk setiap planet, termasuk
       tanda negatif untuk benda retrograde (Venus, Uranus).

       Untuk SATELIT: semuanya terkunci pasang-surut (periode rotasi =
       periode orbit), jadi sudutnya dihitung dari arah satelit terhadap
       induknya — bukan dari W0. Lihat IAU_SATELLITE_ROTATION.
       ============================================================== */
    if (b.isMoon) {
      /* Satelit terkunci pasang-surut: sisi dekat selalu menghadap induk.
         ------------------------------------------------------------------
         Untuk BULAN BUMI, ditambah LIBRASI: goyangan nyata +-8° yang
         membuat pengamat di Bumi bisa melihat sampai 59% permukaan Bulan
         (bukan 50%). Ini fakta terukur, bukan efek kosmetik.
         Lihat moonLibration() di src/15-ephemeris.js.
         ------------------------------------------------------------------ */
      if (b.host && b.host.absPos) {
        const dx = b.absPos.x - b.host.absPos.x;
        const dz = b.absPos.z - b.host.absPos.z;
        const L = Math.hypot(dx, dz) || 1;

        /* --------------------------------------------------------------
           ARAH SISI DEKAT BULAN — KONVENSI UV BOLA THREE.JS
           --------------------------------------------------------------
           BUG YANG DIPERBAIKI: kode sebelumnya memakai
               v0 = ( cos(phi0), sin(phi0) )
           padahal konvensi SphereGeometry Three.js memetakan u ke arah
               ( -cos(phi0), 0, sin(phi0) )
           Tanda X-nya BERLAWANAN, sehingga yang dihitung adalah arah
           sisi JAUH, bukan sisi dekat. Akibatnya Bulan menampilkan
           permukaan tanpa maria (sisi jauh) — persis keluhan pengguna.

           Terverifikasi: u=0.5 -> arah +X pada konvensi Three.js,
           sedangkan rumus lama memberi -X. Selisih 180 derajat.
           -------------------------------------------------------------- */
        const phi0 = MOON_NEAR_SIDE_U * Math.PI * 2;
        const v0x = -Math.cos(phi0);      /* tanda minus: konvensi Three.js */
        const v0z = Math.sin(phi0);

        let sudut = Math.atan2(v0z, v0x) - Math.atan2(-dz / L, -dx / L);

        /* librasi: hanya untuk Bulan Bumi (data Meeus bab 53) */
        if (b.name === 'Bulan') {
          const lib = moonLibration(jd);
          sudut += lib.lonDeg * DEG;   /* librasi bujur */
          b._libLat = lib.latDeg * DEG; /* librasi lintang, dipakai di bawah */
        } else {
          b._libLat = 0;
        }
        b._spinAngle = sudut;
      } else {
        b._spinAngle = 0;
        b._libLat = 0;
      }
    } else if (b.key === 'earth') {
      /* ==============================================================
         ROTASI BUMI — memakai GMST
         --------------------------------------------------------------
         BUG YANG DIPERBAIKI: kode sebelumnya memakai R = GMST - pi,
         MELESET 180 DERAJAT. Akibatnya bujur subsolar (titik di Bumi
         yang tepat di bawah Matahari) berada di sisi yang berlawanan:
         pada 26 Sep 2026 22:15 WIB aplikasi menempatkan titik subsolar
         di 128,75E (Indonesia!) padahal seharusnya -50,93 (Samudra
         Atlantik). Itulah kenapa Indonesia tampak siang padahal malam.

         TURUNAN YANG BENAR:
         - Konvensi tekstur Bumi (diukur dari citra): bujur geografis
           lambda berada di u = 0.5 + lambda/360.
         - Konvensi UV bola Three.js: u memetakan ke arah
           (-cos(phi), 0, sin(phi)) dengan phi = u x 2pi.
         - Jadi bujur lambda berada di arah (cos lambda, 0, -sin lambda):
           pada lambda = 0 (Greenwich) arahnya +X.
         - Kuaternion poros Bumi memutar sumbu Y ke kutub nyata; untuk
           Bumi rotasinya mengelilingi sumbu X, sehingga sumbu X LOKAL
           tetap sama dengan sumbu X scene (arah titik Aries).
         - GMST = 0 berarti meridian Greenwich tepat di titik Aries.
         - Maka rotasi mesh yang benar adalah R = GMST.

         Rotasi.y = R memutar sudut vektor (x,z) sebesar -R, sehingga
         titik dengan bujur lambda berada di sudut (lambda - R), dan
         titik subsolar (yang seharusnya berada di arah Matahari)
         menjadi lambda_sub = R - RA_matahari... yang setelah disubstitusi
         R = GMST menghasilkan lambda_sub = GMST - RA_matahari. Inilah
         rumus baku bujur subsolar. Terverifikasi: pada 15:15 UTC
         26 Sep 2026 memberi -50,93 derajat, sama dengan perhitungan
         independen dari elemen orbit.
         ============================================================== */
      const gmst = 280.46061837 + 360.98564736629 * (jd - J2000_JD);
      const gmstDeg = ((gmst % 360) + 360) % 360;
      b._spinAngle = gmstDeg * DEG;
      b._gmstDeg = gmstDeg;      /* dipakai untuk offset awan */
    } else {
      /* Planet lain: pakai elemen rotasi IAU (W0 + Wdot x d) */
      const rot = planetRotationAngle(b.key, jd);
      /* Konvensi tekstur planet (equirectangular standar): bujur 0 ada di
         u=0.5, sama seperti Bumi. Jadi sudut rotasi = W - pi. */
      b._spinAngle = rot - Math.PI;
    }
    b._theta = 0;
  }
}

/* =======================================================================
   GARIS ORBIT DARI EPHEMERIS
   ----------------------------------------------------------------------
   Menggambar ulang garis orbit planet memakai ephemerisPos() yang SAMA
   dengan yang dipakai menghitung posisi planet. Dengan begitu garis
   selalu melewati planetnya.

   Dipanggil:
     - sekali saat scene siap
     - setiap tanggal simulasi berubah cukup jauh (lihat updateOrbitLines)
   ======================================================================= */

/* Resolusi garis orbit. 240 segmen menyisakan celah ~1.5% keliling antara
   titik sampel, sehingga planet bisa tampak sedikit "di luar" garisnya.
   720 segmen menurunkan celah itu ke ~0.5% — cukup halus untuk semua zoom. */
const ORBIT_LINE_SEGMENTS = 720;
let _orbitLineJd = null;          /* JD saat garis terakhir digambar */

function rebuildOrbitLines(jd) {
  const k = AU_KM / RAD;

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b.orbitLine) continue;

    /* ---- ORBIT SATELIT ----
       Garis orbit satelit digambar dalam kerangka LOKAL grup bulan, jadi
       harus memakai offset yang sama persis dengan yang dipakai
       applyPositions() untuk memindahkan bulan (lihat moonLocalOffset).
       Sebelumnya di sini ada balik-putar axialTilt tambahan, padahal
       applyPositions sudah melakukannya — akibatnya terjadi rotasi ganda
       dan garis orbit meleset sampai 106% radius orbit. */
    if (b.orbitLineIsMoon) {
      const host = b.host;
      if (!host) continue;

      const period = b.periodDays || 27.32;
      const n = (ORBIT_LINE_SEGMENTS + 1);
      const arr = new Float32Array(n * 3);

      for (let s = 0; s <= ORBIT_LINE_SEGMENTS; s++) {
        const jdS = jd + (s / ORBIT_LINE_SEGMENTS) * period;
        const l = moonLocalOffset(b, jdS);
        arr[s * 3] = l.x;
        arr[s * 3 + 1] = l.y;
        arr[s * 3 + 2] = l.z;
      }
      const geo = b.orbitLine.geometry;
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      geo.attributes.position.needsUpdate = true;
      geo.computeBoundingSphere();
      continue;
    }

    /* ---- ORBIT PLANET ---- */
    if (!b.orbitLineIsPlanet) continue;
    const key = EPHEMERIS_KEY[b.key];
    if (!key) continue;

    const periodHari = b.periodDays || 365.25;
    const posArr = new Float32Array((ORBIT_LINE_SEGMENTS + 1) * 3);

    for (let s = 0; s <= ORBIT_LINE_SEGMENTS; s++) {
      const jdSampel = jd + (s / ORBIT_LINE_SEGMENTS) * periodHari;
      const p = planetPositionAU(key, jdSampel);
      if (!p) continue;
      posArr[s * 3] = p.x * k;
      posArr[s * 3 + 1] = p.z * k;        /* z ekliptika -> y scene */
      posArr[s * 3 + 2] = -p.y * k;       /* y ekliptika -> -z scene */
    }

    const geo = b.orbitLine.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingSphere();
  }
  _orbitLineJd = jd;
}

/* =======================================================================
   SATU RUMUS UNTUK SATELIT
   ----------------------------------------------------------------------
   moonLocalOffset() adalah SATU-SATUNYA sumber posisi satelit relatif
   induknya, dalam kerangka LOKAL grup bulan (anak dari moonPlane yang
   sudah dirotasi axialTilt induk).

   Dipakai oleh:
     1. ephemerisPos()      -> posisi absolut (kamera, label, penanda)
     2. applyPositions()    -> posisi render
     3. rebuildOrbitLines() -> garis orbit

   Sebelumnya tiga tempat ini memakai rumus masing-masing dengan rotasi
   berbeda-beda, sehingga satelit dan garis orbitnya tidak pernah bertemu
   (meleset sampai 106% radius orbit). Sekarang mustahil berbeda.
   ======================================================================= */
function moonLocalOffset(b, jd) {
  const k = 1 / RAD;

  if (b.name === 'Bulan') {
    /* Bulan Bumi: teori Meeus bab 47 (presisi ~10") — perlu untuk gerhana.
       Kerangka ekliptika -> scene: x, z(y_scene), -y(z_scene) */
    const mk = moonPositionKm(jd);
    return { x: mk.x * k, y: mk.z * k, z: -mk.y * k };
  }

  /* Satelit lain: orbit Kepler dengan elemen NYATA dari JPL.
     ------------------------------------------------------------------
     M0 (anomali rata-rata pada epoch J2000) diambil dari JPL, sehingga
     fase orbit satelit NYATA — bukan 0 seperti sebelumnya. Tanpa M0,
     satelit berada di titik sembarang pada orbitnya (error sampai
     diameter orbit = 843.600 km untuk Io).

     PRESESI APSIS & SIMPUL juga diterapkan. Orbit satelit tidak tetap:
     titik terdekat (apsis) dan titik simpul bergerak mengelilingi induk.
     JPL memberi periodenya dalam tahun (P_apsis, P_node). Untuk Iapetus,
     periode apsis 3130 tahun; untuk Phobos hanya 2,3 tahun — jadi efek
     ini nyata untuk satelit dekat.
     ------------------------------------------------------------------ */
  const el = SATELLITE_ELEMENTS[b.name];
  const a = (b.aKm / RAD) * MOON_ORBIT_FACTOR;
  const e = b.e || 0;
  const n = (2 * Math.PI) / (b.periodDays * 86400);   /* rad per detik */
  const T = (jd - J2000_JD) * 86400;                  /* detik sejak J2000 */
  /* M0 dari JPL (derajat) -> radian, lalu tambah perjalanan waktu */
  const M0 = el ? (el.M0 * DEG) : (b.theta0 || 0);
  const M = M0 + n * T;

  let E = M;
  for (let i = 0; i < 6; i++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }

  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  /* argumen periapsis dengan PRESESI.
     omega(t) = omega_JPL + (360 / P_apsis) x d
     P_apsis dalam tahun, d dalam hari. */
  let omega = el ? (el.omega * DEG) : 0;
  if (el && el.pApsisYr > 0) {
    const dHari = jd - J2000_JD;
    const lajuApsis = (360 / (el.pApsisYr * 365.25)) * DEG;   /* rad/hari */
    omega += lajuApsis * dHari;
  }
  const co = Math.cos(omega), so = Math.sin(omega);
  const xr = xp * co - yp * so;
  const yr = xp * so + yp * co;

  /* bujur simpul naik dengan PRESESI juga */
  let node = el ? (el.node * DEG) : 0;
  if (el && el.pNodeYr > 0) {
    const dHari = jd - J2000_JD;
    const lajuNode = (360 / (el.pNodeYr * 365.25)) * DEG;     /* rad/hari */
    node += lajuNode * dHari;
  }

  /* bidang orbit dimiringkan oleh inklinasi terhadap ekuator induk,
     lalu diputar oleh bujur simpul */
  const incl = b.incl || 0;
  const ci = Math.cos(incl), si = Math.sin(incl);
  const cn = Math.cos(node), sn = Math.sin(node);
  /* rotasi bidang: miringkan dulu, lalu putar oleh simpul */
  const x1 = xr * cn - yr * ci * sn;
  const y1 = xr * sn + yr * ci * cn;
  const z1 = yr * si;
  return { x: x1, y: y1, z: z1 };
}

/* Offset satelit dalam kerangka SCENE (setelah orientasi bidang orbit).
   Dipakai ephemerisPos() untuk posisi absolut.
   ----------------------------------------------------------------------
   PENTING: Bulan Bumi TIDAK memakai orientasi poros Bumi, karena
   orbitnya sejajar EKLIPTIKA (miring 5,145 derajat), bukan ekuator Bumi
   (23,44 derajat). Satelit lain memakai ekuator induknya.
   ---------------------------------------------------------------------- */
function moonSceneOffset(b, jd) {
  const l = moonLocalOffset(b, jd);
  /* Bulan Bumi: bidang orbit = ekliptika, tidak perlu rotasi tambahan */
  if (b.name === 'Bulan') return l;
  if (!b.host || !b.host.key) return l;
  const q = poleQuaternion(b.host.key);
  if (!q) return l;
  _v1.set(l.x, l.y, l.z).applyQuaternion(q);
  return { x: _v1.x, y: _v1.y, z: _v1.z };
}

/* Offset satelit terhadap induknya, dalam unit scene (tanpa posisi induk).
   Dipertahankan sebagai alias supaya kode lama tetap jalan. */
function moonOffsetUnits(b, jd) {
  return moonSceneOffset(b, jd);
}

/* Perbarui garis orbit bila tanggal simulasi sudah bergeser cukup jauh.
   Elemen orbit planet berubah sangat lambat (orde abad), jadi memperbarui
   tiap ~10 hari sudah lebih dari cukup dan tidak membebani tiap frame. */
function updateOrbitLines(jd) {
  if (_orbitLineJd === null || Math.abs(jd - _orbitLineJd) > 10) {
    rebuildOrbitLines(jd);
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
    /* SATU rumus: moonSceneOffset() — sama dengan yang dipakai
       applyPositions() dan rebuildOrbitLines() */
    const off = moonSceneOffset(b, jd);
    return {
      x: hostPos.x + off.x,
      y: hostPos.y + off.y,
      z: hostPos.z + off.z,
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

        /* Balik-putar oleh orientasi bidang orbit induk untuk mendapat
           offset dalam kerangka LOKAL grup bulan.
           ------------------------------------------------------------------
           PENTING: Bulan Bumi tidak memakai orientasi poros Bumi, karena
           orbitnya sejajar EKLIPTIKA (miring 5,145 derajat), bukan ekuator
           Bumi (23,44 derajat). Kalau dipaksa memakai poros Bumi, sisi
           dekat Bulan meleset ~23 derajat dari Bumi.
           ------------------------------------------------------------------ */
        if (b.name === 'Bulan') {
          b.group.position.set(dx, dy, dz);
        } else {
          const q = poleQuaternion(b.host.key);
          if (q) {
            _v1.set(dx, dy, dz).applyQuaternion(_invQ.copy(q).invert());
            b.group.position.copy(_v1);
          } else {
            const tilt = THREE.MathUtils.degToRad(b.host.axialTiltDeg || 0);
            const ct = Math.cos(tilt), st = Math.sin(tilt);
            b.group.position.set(dx * ct + dy * st, -dx * st + dy * ct, dz);
          }
        }
      }
      if (b._spinAngle !== undefined) b.spin.rotation.y = b._spinAngle;
      /* LIBRASI LINTANG: goyangan naik-turun Bulan (+-6,7°). Diterapkan
         pada sumbu X supaya kutub Bulan tampak bergoyang dari pengamat —
         inilah yang membuat 59% permukaan Bulan bisa terlihat dari Bumi. */
      if (b._libLat) b.spin.rotation.x = b._libLat;
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
      /* Offset awan: awan HARUS ikut berputar bersama Bumi, plus sedikit
         pergeseran karena angin zonal (super-rotasi atmosfer Bumi ~5%).
         Rumus lama ((days / 0.9) % 1) tidak terhubung ke rotasi Bumi sama
         sekali, jadi awan tampak melayang dengan kecepatan yang salah.
         Rumus baru: awan berputar 1,05 putaran per hari — sedikit lebih
         cepat dari permukaan, seperti atmosfer Bumi yang sebenarnya. */
      b.mesh.material.uniforms.uCloudOffset.value =
        ((app.days * 1.05) % 1 + 1) % 1;
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

  /* ======================================================================
     BUG BESAR YANG DIPERBAIKI DI SINI
     ----------------------------------------------------------------------
     `sunLight` (PointLight) TIDAK PERNAH DIPINDAHKAN. Padahal:
       - floating origin membuat kamera SELALU di (0,0,0)
       - Matahari digeser ke (nx,ny,nz) = -rebaseOffset
       - PointLight tetap di (0,0,0) = POSISI KAMERA

     Akibatnya cahaya selalu datang dari ARAH KAMERA, bukan dari Matahari:
       - Sisi benda yang menghadap kamera SELALU terang
       - Terminator muncul di tepi, bukan di posisi nyata
       - Jam lokal TIDAK PERNAH bisa sinkron (Indonesia gelap padahal siang)
       - Bulan tampak "terang di kedua sisi" karena kamera melihat sisi
         terangnya

     Perbaikan: pindahkan PointLight ke posisi Matahari yang sama dengan
     sunMesh. Sekarang cahaya benar-benar datang dari Matahari.
     ====================================================================== */
  if (sunLight) sunLight.position.set(nx, ny, nz);

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
