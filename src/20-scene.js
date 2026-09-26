/* =======================================================================
   Pembangunan scene 3D — Tata Surya skala nyata
   Struktur hierarki (penting!):
     scene
      ├─ body.group      → posisi orbit planet (tanpa kemiringan)
      │   ├─ body.spin   → kemiringan poros + rotasi harian
      │   │    ├─ mesh planet, awan, atmosfer, cincin
      │   │    └─ moonOrbit[i] → posisi orbit bulan
      │   │          └─ moonSpin → rotasi bulan
      ├─ orbitLine (elips nyata, di scene agar tidak ikut berputar)
      └─ belt, sky, sun
   Bulan mengorbit di bidang ekuator induk (di dalam grup spin), sehingga
   kemiringan poros induk otomatis berlaku untuk bidang orbit bulan.
   ======================================================================= */

let renderer, scene, camera;
const bodies = [];
const pickables = [];
let sunMesh, sunGlow, sunRim, skyMesh, beltPoints, sunLight, starField;
const glowTextures = {};

function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({
    canvas: canvas, antialias: true, powerPreference: 'high-performance',
    logarithmicDepthBuffer: true,          /* penting: rentang dekat–jauh sangat besar */
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
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
/* Catatan: chunk logdepthbuf wajib ada karena renderer memakai
   logarithmicDepthBuffer — tanpa itu kedalaman shader kustom salah. */
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
  'varying vec3 vNormal;',
  'varying vec3 vPos;',
  'void main() {',
  '  #include <logdepthbuf_fragment>',
  '  vec3 viewDir = normalize(-vPos);',
  '  float rim = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), uFresnel);',
  '  float a = clamp(rim * uOpacity, 0.0, 1.0);',
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

/* ---------- matahari ---------- */
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

function buildSun() {
  const r = (SUN.radiusKm / RAD) * SIZE_FACTOR;
  const tex = canvasTexture(buildSurfaceTexture(SUN.texture), true);
  sunMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 64), new THREE.MeshBasicMaterial({ map: tex }));
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
  sunGlow.add(sp1); sunGlow.add(sp2);

  /* halo tambahan berskala besar: menjaga Matahari tetap terlihat terang
     bahkan dari jarak antarplanet */
  const sp3 = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture(glowTextures.halo, true), transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  sp3.scale.set(r * 46, r * 46, 1);
  sunGlow.add(sp3);
  scene.add(sunGlow);

  sunRim = new THREE.Mesh(new THREE.SphereGeometry(r * 1.012, 64, 48), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffc060) }, uIntensity: { value: 1.0 }, uPower: { value: 1.7 } },
    vertexShader: ATMOS_VERT, fragmentShader: SUN_FRAG,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  scene.add(sunRim);

  sunLight = new THREE.PointLight(0xfff4e2, 3.0, 0, 0);
  sunLight.decay = 0;                       /* tanpa peredupan jarak: terang merata */
  sunLight.distance = 0;
  scene.add(sunLight);

  /* cahaya lemah pengisi (ambient) agar sisi malam tidak sepenuhnya hitam —
     tetap sangat gelap sehingga bayangan tetap dramatis */
  const ambient = new THREE.AmbientLight(0x2a3550, 0.35);
  scene.add(ambient);

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
  const radiusUnits = Math.max((cfg.radiusKm / RAD) * SIZE_FACTOR, isMoon ? MIN_MOON_RADIUS_UNITS : 0.05);

  const group = new THREE.Group();      /* posisi orbit (relatif induk) */
  const spin = new THREE.Group();       /* kemiringan poros + rotasi harian */
  group.add(spin);
  (parentMoonPlane || scene).add(group);

  /* bidang orbit bulan: miring mengikuti poros induk, TIDAK ikut rotasi harian */
  const moonPlane = new THREE.Group();
  if (cfg.axialTilt) moonPlane.rotation.z = THREE.MathUtils.degToRad(cfg.axialTilt);
  group.add(moonPlane);

  const tex = canvasTexture(buildSurfaceTexture(cfg.texture), true);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0.0 });
  const mesh = new THREE.Mesh(buildSphere(radiusUnits, cfg.flat || 0, isMoon ? 40 : 72, isMoon ? 28 : 48), mat);
  spin.add(mesh);
  pickables.push(mesh);

  let cloudMesh = null;
  if (cfg.cloudTexture) {
    const cTex = canvasTexture(buildSurfaceTexture(cfg.cloudTexture), true);
    cloudMesh = new THREE.Mesh(buildSphere(radiusUnits * 1.014, 0, 56, 40),
      new THREE.MeshStandardMaterial({
        map: cTex, transparent: true, roughness: 1, metalness: 0,
        depthWrite: false, alphaTest: 0.015,
      }));
    spin.add(cloudMesh);
  }

  let atmoMesh = null;
  if (cfg.atmosphere) {
    atmoMesh = makeAtmosphere(radiusUnits * (cfg.atmosphere.radius || 1.05), cfg.atmosphere);
    spin.add(atmoMesh);
  }

  if (cfg.axialTilt) spin.rotation.z = THREE.MathUtils.degToRad(cfg.axialTilt);

  /* ----- cincin ----- */
  let ringMesh = null;
  if (cfg.ring) {
    const rc = makeRingTexture(cfg.ring.texture.w, cfg.ring.texture.h, cfg.ring.texture.seed, cfg.ring.texture);
    const rTex = canvasTexture(rc, true);
    const innerU = (cfg.ring.inner / RAD) * SIZE_FACTOR;
    const outerU = (cfg.ring.outer / RAD) * SIZE_FACTOR;
    /* phiSegments = jumlah pembagian RADIAL. Harus banyak (64) agar profil
       tekstur cincin tergambar mulus, bukan menjadi beberapa garis saja. */
    const rGeo = new THREE.RingGeometry(innerU, outerU, 256, 64);
    const pos = rGeo.attributes.position;
    const uv = rGeo.attributes.uv;
    const v3 = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v3.fromBufferAttribute(pos, i);
      const t = (v3.length() - innerU) / (outerU - innerU);
      uv.setXY(i, t, 0.5);
    }
    const rMat = new THREE.MeshStandardMaterial({
      map: rTex, transparent: true, side: THREE.DoubleSide,
      roughness: 0.9, metalness: 0.0, depthWrite: false, alphaTest: 0.01,
    });
    ringMesh = new THREE.Mesh(rGeo, rMat);
    ringMesh.rotation.x = Math.PI / 2;
    spin.add(ringMesh);
  }

  const body = {
    id: cfg.key || (isMoon ? (hostBody.key + ':' + cfg.name) : cfg.name),
    key: cfg.key || (isMoon ? (hostBody.key + ':' + cfg.name) : cfg.name),
    name: cfg.name,
    type: isMoon ? 'moon' : 'planet',
    group: group, spin: spin, moonPlane: moonPlane, mesh: mesh, cloudMesh: cloudMesh,
    atmoMesh: atmoMesh, ringMesh: ringMesh,
    radiusKm: radiusUnits, realRadiusKm: cfg.radiusKm,
    host: hostBody || null, isMoon: isMoon,
    aKm: cfg.aKm, e: cfg.e || 0,
    incl: THREE.MathUtils.degToRad(cfg.incl !== undefined ? cfg.incl : (ORBIT_INCLINATION[cfg.name] || 0)),
    rotationDays: (cfg.rotationHours || 24) / 24,
    periodDays: cfg.periodDays !== undefined ? cfg.periodDays : 0,
    tidallyLocked: !!cfg.tidallyLocked,
    orbitRadiusUnits: cfg.aKm / RAD,
    info: cfg.info || null,
    theta0: 0, moonTheta0: 0,
    orbitLine: null,
  };
  group.userData.body = body;
  spin.userData.body = body;
  mesh.userData.bodyId = body.id;
  if (cloudMesh) cloudMesh.userData.bodyId = body.id;
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
      new THREE.LineBasicMaterial({ color: 0xa8c4e8, transparent: true, opacity: 0.42, depthWrite: false })
    );
    line.rotation.x = body.incl;
    scene.add(line);
    body.orbitLine = line;
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

/* ---------- medan bintang (titik tajam, selalu di belakang) ---------- */
function buildStars() {
  const N = 6000;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const rnd = mulberry32(31415);
  const tmp = new THREE.Color();
  for (let i = 0; i < N; i++) {
    /* sebaran merata di bola */
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const R = 400000;
    positions[i * 3] = s * Math.cos(th) * R;
    positions[i * 3 + 1] = u * R;
    positions[i * 3 + 2] = s * Math.sin(th) * R;
    const mag = Math.pow(rnd(), 2.6);
    sizes[i] = 1.1 + mag * 3.4;
    const warm = rnd();
    if (warm < 0.12) tmp.setRGB(1.0, 0.88, 0.74);
    else if (warm < 0.28) tmp.setRGB(0.78, 0.84, 1.0);
    else if (warm < 0.4) tmp.setRGB(1.0, 0.96, 0.9);
    else tmp.setRGB(0.92, 0.95, 1.0);
    const b = 0.55 + mag * 0.45;
    colors[i * 3] = tmp.r * b; colors[i * 3 + 1] = tmp.g * b; colors[i * 3 + 2] = tmp.b * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  /* titik bintang digambar di ruang layar: selalu tajam, tidak pernah buram,
     dan selalu berada di belakang seluruh isi tata surya */
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: canvasTexture(makeStarDotCanvas(32), true) }, uDpr: { value: renderer.getPixelRatio() } },
    vertexShader: [
      'attribute float aSize;',
      'varying vec3 vColor;',
      'uniform float uDpr;',
      'void main() {',
      '  vColor = color;',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = aSize * uDpr;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uMap;',
      'varying vec3 vColor;',
      'void main() {',
      '  vec4 t = texture2D(uMap, gl_PointCoord);',
      '  gl_FragColor = vec4(vColor, t.a);',
      '}',
    ].join('\n'),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -100;
  pts.position.set(0, 0, 0);
  scene.add(pts);
  starField = pts;
}

/* ---------- penanda navigasi (bintang penunjuk) ---------- */
/* Pada skala nyata planet hanya beberapa piksel dari jauh, jadi setiap planet
   mendapat penanda: inti tajam berwarna (normal blending) + halo lembut
   (additive). Ini yang membuat planet bisa ditemukan saat terbang. */
function buildBeacons() {
  if (!glowTextures.dot) glowTextures.dot = makeGlowCanvas(64, [255, 255, 255], [255, 255, 255], 2.0);
  if (!glowTextures.core) glowTextures.core = makeDiscCanvas(64);
  if (!glowTextures.ring) glowTextures.ring = makeRingHaloCanvas(96);
  const dotTex = canvasTexture(glowTextures.ring, true);
  const coreTex = canvasTexture(glowTextures.core, true);

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.isMoon || b.type === 'star') continue;
    const col = bodyColorHex(b);
    const group = new THREE.Group();

    /* inti: titik kecil tajam, warna planet, tidak tembus cahaya.
       toneMapped:false agar warna tetap pekat (tidak pudar karena ACES) */
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: coreTex, color: col, transparent: true,
      blending: THREE.NormalBlending, depthWrite: false, depthTest: false, opacity: 1.0,
      toneMapped: false,
    }));
    group.add(core);

    /* halo: cincin cahaya lembut di sekeliling inti */
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTex, color: col, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0.22,
      toneMapped: false,
    }));
    group.add(halo);

    group.renderOrder = 100;
    scene.add(group);
    b.beacon = { group: group, core: core, halo: halo };
  }
}

const _bp = new THREE.Vector3();
function updateBeacons() {
  const H = window.innerHeight;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b.beacon) continue;
    bodyWorldPos(b, _bp);
    const dist = Math.max(camera.position.distanceTo(_bp), 1e-6);
    const px = (b.radiusKm / dist) * (H * 0.5) / tanHalf;   /* radius planet di layar (piksel) */

    /* penanda tampil selama planet masih kecil di layar */
    let show = px < 5.5;
    if (cameraState.target === b) show = false;
    if (cameraState.target && cameraState.target !== b && dist < b.radiusKm * 25) show = false;

    b.beacon.group.visible = show;
    b.beacon.showLabel = show;
    if (!show) continue;

    /* berapa satuan dunia untuk 1 piksel pada jarak ini */
    const unit = (2 * dist * tanHalf) / H;
    const corePx = 5.4 + Math.min(3.0, Math.max(0, 1 - px / 5.5) * 3.0);
    const haloPx = corePx * 3.2;
    b.beacon.core.scale.set(corePx * unit, corePx * unit, 1);
    b.beacon.halo.scale.set(haloPx * unit, haloPx * unit, 1);
    b.beacon.halo.material.opacity = 0.22 + 0.10 * Math.sin(performance.now() * 0.0022 + i * 1.7);
    b.beacon.group.position.copy(_bp);
  }
}

function bodyColorHex(b) {
  /* warna pekat untuk penanda navigasi */
  const c = {
    sun: 0xffb44d, mercury: 0xb8a894, venus: 0xf5d98a, earth: 0x2f7fe8, mars: 0xe8622a,
    jupiter: 0xe8b06a, saturn: 0xf2e0a8, uranus: 0x6fe0e8, neptune: 0x3f6fe8,
  };
  return c[b.key] !== undefined ? c[b.key] : 0xbbbbbb;
}

/* ---------- langit berbintang ---------- */
function buildSky() {
  const canvas = makeSkyCanvas(2048, 1024, 909);
  const tex = canvasTexture(canvas, true);
  tex.wrapT = THREE.ClampToEdgeWrapping;
  /* sphere langit diberi segmen lebih halus agar tekstur tidak bergaris */
  const geo = new THREE.SphereGeometry(600000, 64, 48);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false });
  skyMesh = new THREE.Mesh(geo, mat);
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);
  if (!glowTextures.dot) glowTextures.dot = makeGlowCanvas(64, [255, 255, 255], [255, 255, 255], 2.0);
}

/* ---------- animasi: posisi orbit & rotasi ---------- */
const _v1 = new THREE.Vector3();

function updateBodies(days) {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.type === 'star') {
      sunMesh.rotation.y = (days / b.rotationDays) * Math.PI * 2 * 0.15;
      continue;
    }
    const dir = b.periodDays < 0 ? -1 : 1;
    if (!b.periodDays) continue;            /* pengaman: jangan pernah bagi dengan nol */
    const th = b.theta0 + dir * (days / Math.abs(b.periodDays)) * Math.PI * 2;
    if (!isFinite(th)) continue;

    if (b.isMoon) {
      /* bulan: orbit nyata × MOON_ORBIT_FACTOR di bidang ekuator induk */
      const a = (b.aKm / RAD) * MOON_ORBIT_FACTOR;
      const e = b.e;
      const bAxis = a * Math.sqrt(1 - e * e);
      const c = a * e;
      _v1.set(Math.cos(th) * a - c, 0, Math.sin(th) * bAxis);
      _v1.applyAxisAngle(new THREE.Vector3(1, 0, 0), b.incl);
      b.group.position.copy(_v1);
      if (b.tidallyLocked) {
        /* permukaan yang sama selalu menghadap induk */
        b.spin.rotation.y = -th - Math.PI / 2;
      } else {
        b.spin.rotation.y = (days / b.rotationDays) * Math.PI * 2;
      }
      continue;
    }

    /* planet: orbit nyata mengelilingi Matahari */
    const a = b.aKm / RAD;
    const e = b.e;
    const bAxis = a * Math.sqrt(1 - e * e);
    const c = a * e;
    _v1.set(Math.cos(th) * a - c, 0, Math.sin(th) * bAxis);
    _v1.applyAxisAngle(new THREE.Vector3(1, 0, 0), b.incl);
    b.group.position.copy(_v1);

    b.spin.rotation.y = (days / b.rotationDays) * Math.PI * 2;
    if (b.cloudMesh) {
      b.cloudMesh.rotation.y = (days / b.rotationDays) * Math.PI * 2 * 1.06 + 0.4;
    }
  }
}

function bodyWorldPos(b, out) {
  out = out || new THREE.Vector3();
  if (b.type === 'star') { out.set(0, 0, 0); return out; }
  b.group.getWorldPosition(out);
  return out;
}

function findBody(key) {
  for (let i = 0; i < bodies.length; i++) if (bodies[i].key === key) return bodies[i];
  return null;
}
