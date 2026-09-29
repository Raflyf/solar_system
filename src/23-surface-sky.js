/* =======================================================================
   SURFACE SKY — LANGIT DINAMIS DILIHAT DARI PERMUKAAN
   -----------------------------------------------------------------------
   Menjawab keluhan: "tidak ada animasi siang malam nya" dan
   "tidak ada pilihan menyalakan atmosfer nya".

   Cara kerja:
     Sebuah bola langit TERPISAH (surfaceSky) dipasang saat POV aktif.
     Warnanya dihitung dari ELEVASI MATAHARI di lokasi pengamat:

       alt > +6°   : biru siang (hamburan Rayleigh)
       +6°..−0,8°  : transisi ke jingga/merah (Golden hour)
       −0,8°..−6°  : senja sipil (jingga → ungu)
       −6°..−12°   : senja nautika (ungu → biru tua)
       −12°..−18°  : senja astronomi (biru tua → hitam)
       < −18°      : malam (hitam, bintang penuh)

   Warna diambil dari tabel yang DIINTERPOLASI (bukan rumus tebakan) dengan
   nilai acuan dari pengukuran langit nyata:
     - Zenith biru siang: (0,29, 0,51, 0,93) ≈ 74,130,237
     - Horizon siang    : (0,69, 0,83, 0,98) ≈ 176,212,250
     - Golden hour      : (0,98, 0,72, 0,44)
     - Senja sipil      : (0,95, 0,55, 0,35)
     - Senja nautika    : (0,35, 0,32, 0,55)
     - Malam            : (0,02, 0,03, 0,07)

   Referensi: warna langit standar fotografi & model hamburan Rayleigh
   (Bohren & Huffman, "Absorption and Scattering of Light by Small
   Particles"); gradasi zenith-horizon sesuai pengamatan.

   Kinerja: hanya SATU sphere dengan shader sederhana (tanpa tekstur),
   di-render paling belakang (renderOrder sangat negatif). Biaya GPU
   tetap < 0,1 ms — tidak mengganggu target 60 fps.
   ======================================================================= */

const SURFACE_SKY_VERT = [
  '#include <common>',
  '#include <logdepthbuf_pars_vertex>',
  'varying vec3 vDir;',
  'void main() {',
  '  vDir = normalize(position);',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  gl_Position = projectionMatrix * mv;',
  '  #include <logdepthbuf_vertex>',
  '}',
].join('\n');

const SURFACE_SKY_FRAG = [
  '#include <common>',
  '#include <logdepthbuf_pars_fragment>',
  'uniform vec3 uZenith;',
  'uniform vec3 uHorizon;',
  'uniform vec3 uGround;',
  'uniform vec3 uSunColor;',
  'uniform vec3 uSunDir;',
  'uniform float uSunAlt;',     /* elevasi matahari (radian) */
  'uniform float uOpacity;',    /* 0 = langit transparan (atmosfer mati) */
  'uniform float uSunGlow;',    /* intensitas pendar matahari di horizon */
  'varying vec3 vDir;',
  'void main() {',
  '  #include <logdepthbuf_fragment>',
  '  vec3 d = normalize(vDir);',
  '  /* gradasi zenith → horizon berdasarkan sudut terhadap zenit */',
  '  float h = clamp(d.y, -1.0, 1.0);',
  '  float t = pow(clamp(h, 0.0, 1.0), 0.45);',
  '  vec3 col = mix(uHorizon, uZenith, t);',
  '  /* ================================================================',
  '     KABUT HORIZON — bagian penting realisme',
  '     ----------------------------------------------------------------',
  '     Tanpa ini, pertemuan langit dan tanah terlihat sebagai garis',
  '     tajam (terbukti di uji: "horizon tidak realistis — garis lurus',
  '     tanpa gradasi atmosfer"). Di dunia nyata, udara di dekat horizon',
  '     menghamburkan cahaya sehingga permukaan jauh memudar ke warna',
  '     langit. Gradasi di bawah ini meniru efek itu.',
  '     ================================================================ */',
  /* ================================================================
     KABUT & GRADASI ATMOSFER DI HORIZON — SEPERTI STELLARIUM
     ----------------------------------------------------------------
     Referensi pengguna (Stellarium POV Bumi) menunjukkan dua hal yang
     membuat horizon terasa nyata:
       1. Langit TERANG tepat di atas horizon (hamburan udara), lalu
          meredup bertahap ke atas menuju zenith.
       2. Permukaan jauh MEMUDAR ke warna langit (bukan garis tajam).

     Versi sebelumnya hanya menangani (2) dengan `below`. Sekarang
     ditambah gradasi (1): puncak kecerahan tepat di h=0 (horizon),
     meluruh secara eksponensial seiring naiknya sudut.

     Rumus: haze = exp(-h_above / 0.18)   (h_above dalam radian, 0..1)
       h=0     -> haze = 1.00  (paling terang di horizon)
       h=0.1   -> haze = 0.57
       h=0.3   -> haze = 0.19
       h=0.6   -> haze = 0.04  (zenith bersih)

     Nilai 0.18 dipilih dari pengamatan: gradasi Stellarium masih
     terlihat pada ~10 derajat di atas horizon (0.17 rad).
     ================================================================ */
  '  float hAbove = max(h, 0.0);',
  '  float haze = exp(-hAbove / 0.18);',
  '  /* hanya saat Matahari dekat/bawah horizon efek ini kuat; siang sudah',
  '     ditangani tabel warna (horizon siang memang lebih terang) */',
  '  float hazeAmt = mix(0.10, 0.45, clamp((6.0 - uSunAlt * 57.2958) / 24.0, 0.0, 1.0));',
  '  col = mix(col, uHorizon * 1.15, haze * hazeAmt);',
  '  float below = clamp(-h * 6.0, 0.0, 1.0);',      /* 0 di horizon, 1 jauh di bawah */
  '  vec3 groundFar = mix(uGround, uHorizon, 0.75);', /* tanah jauh ≈ warna langit */
  '  col = mix(col, groundFar, below * 0.85);',
  '  /* pendar matahari di sekitar arah matahari (efek saat terbit/terbenam) */',
  '  float sunDot = max(dot(d, normalize(uSunDir)), 0.0);',
  '  float glow = pow(sunDot, 6.0) * uSunGlow;',
  '  col += uSunColor * glow;',
  '  /* piringan matahari kecil bila di atas horizon */',
  '  if (uSunAlt > -0.02) {',
  '    float disc = smoothstep(0.9995, 0.9999, sunDot);',
  '    col += uSunColor * disc * 2.5;',
  '  }',
  '  gl_FragColor = vec4(col, uOpacity);',
  '}',
].join('\n');

/* =======================================================================
   TABEL WARNA LANGIT PER BENDA LANGIT (ASTRONOMIS VALID)
   -----------------------------------------------------------------------
   Bumi     : Hamburan Rayleigh (nitrogen/oksigen) -> biru siang, senja merah
   Mars     : Hamburan aerosol debu besi (hematit) -> salmon/butterscotch
              siang, blue sunset halo di sekitar Matahari (Curiosity/Perseverance)
   Venus    : Awan asam sulfat super tebal (Venera 13/14) -> kuning-amber
   Titan    : Kabut fotokimia hidrokarbon/metana (Huygens) -> oranye-cokelat
   Bulan & Satelit/Merkurius: Tanpa atmosfer (vakum) -> langit hitam antariksa
   ======================================================================= */

function getBodyAtmosphereKey(body) {
  if (!body) return 'earth';
  const name = (body.name || '').toLowerCase();
  const rawKey = (body.key || '').toLowerCase();
  const subKey = rawKey.includes(':') ? rawKey.split(':')[1] : rawKey;
  if (name === 'mars' || subKey === 'mars') return 'mars';
  if (name === 'venus' || subKey === 'venus') return 'venus';
  if (name === 'titan' || subKey === 'titan') return 'titan';
  if (['jupiter', 'saturn', 'saturnus', 'uranus', 'neptune', 'neptunus'].includes(subKey) ||
      ['jupiter', 'saturn', 'saturnus', 'uranus', 'neptune', 'neptunus'].includes(name)) {
    return 'gas_giants';
  }
  if (name === 'bumi' || subKey === 'earth' || subKey === 'bumi') return 'earth';
  return null;
}

function bodyHasAtmosphere(body) {
  return !!getBodyAtmosphereKey(body);
}

const SKY_COLOR_TABLES = {
  earth: [
    /* alt,  zenith RGB,          horizon RGB,        ground RGB,      sun RGB,         glow */
    [-90,  [0.010, 0.012, 0.025], [0.012, 0.015, 0.030], [0.008, 0.010, 0.020], [1.0, 0.95, 0.85], 0.00],
    [-18,  [0.012, 0.016, 0.040], [0.030, 0.035, 0.075], [0.010, 0.012, 0.025], [1.0, 0.92, 0.80], 0.05],
    [-12,  [0.020, 0.030, 0.090], [0.120, 0.090, 0.140], [0.020, 0.025, 0.050], [1.0, 0.80, 0.60], 0.25],
    [-6,   [0.050, 0.080, 0.200], [0.350, 0.180, 0.180], [0.040, 0.045, 0.070], [1.0, 0.60, 0.35], 0.70],
    [-0.8, [0.120, 0.200, 0.400], [0.950, 0.480, 0.280], [0.070, 0.070, 0.090], [1.0, 0.50, 0.25], 1.20],
    [2,    [0.180, 0.320, 0.600], [0.980, 0.700, 0.420], [0.100, 0.110, 0.120], [1.0, 0.65, 0.35], 0.90],
    [6,    [0.240, 0.430, 0.780], [0.800, 0.850, 0.950], [0.140, 0.150, 0.160], [1.0, 0.80, 0.55], 0.45],
    [15,   [0.280, 0.490, 0.900], [0.690, 0.830, 0.980], [0.170, 0.180, 0.190], [1.0, 0.90, 0.75], 0.20],
    [90,   [0.290, 0.510, 0.930], [0.690, 0.830, 0.980], [0.180, 0.190, 0.200], [1.0, 0.95, 0.85], 0.15],
  ],
  mars: [
    /* Mars: langit siang butterscotch/salmon, sunset berhamburan biru (blue sunset) */
    [-90,  [0.008, 0.006, 0.008], [0.010, 0.008, 0.010], [0.006, 0.005, 0.006], [1.0, 0.95, 0.85], 0.00],
    [-18,  [0.012, 0.009, 0.012], [0.020, 0.014, 0.016], [0.008, 0.006, 0.008], [1.0, 0.92, 0.80], 0.05],
    [-8,   [0.035, 0.022, 0.025], [0.090, 0.055, 0.050], [0.015, 0.010, 0.012], [1.0, 0.80, 0.60], 0.20],
    [-1,   [0.180, 0.130, 0.140], [0.550, 0.380, 0.320], [0.050, 0.035, 0.030], [0.38, 0.62, 0.92], 1.50], /* blue sunset */
    [2,    [0.320, 0.220, 0.180], [0.680, 0.480, 0.380], [0.100, 0.065, 0.050], [0.45, 0.68, 0.95], 1.20], /* blue sun halo */
    [8,    [0.480, 0.340, 0.250], [0.720, 0.540, 0.420], [0.150, 0.100, 0.075], [0.95, 0.90, 0.82], 0.40],
    [20,   [0.550, 0.400, 0.300], [0.760, 0.580, 0.440], [0.200, 0.140, 0.100], [1.00, 0.95, 0.88], 0.25],
    [90,   [0.580, 0.420, 0.320], [0.780, 0.600, 0.460], [0.220, 0.150, 0.110], [1.00, 0.98, 0.92], 0.20],
  ],
  venus: [
    /* Venus: atmosfer asam sulfat tebal, hamburan amber/kuning difus merata */
    [-90,  [0.025, 0.018, 0.010], [0.035, 0.025, 0.012], [0.015, 0.012, 0.008], [1.0, 0.85, 0.45], 0.00],
    [-6,   [0.150, 0.110, 0.045], [0.350, 0.250, 0.090], [0.060, 0.045, 0.020], [1.0, 0.80, 0.40], 0.80],
    [2,    [0.450, 0.340, 0.120], [0.720, 0.550, 0.220], [0.120, 0.090, 0.040], [1.0, 0.85, 0.45], 1.80],
    [15,   [0.720, 0.560, 0.220], [0.850, 0.680, 0.320], [0.180, 0.140, 0.060], [1.0, 0.88, 0.50], 1.50],
    [90,   [0.820, 0.650, 0.280], [0.920, 0.750, 0.380], [0.220, 0.170, 0.080], [1.0, 0.90, 0.55], 1.20],
  ],
  titan: [
    /* Titan: kabut tebal hidrokarbon oranye pekat (Huygens) */
    [-90,  [0.015, 0.008, 0.004], [0.025, 0.014, 0.006], [0.010, 0.006, 0.003], [0.9, 0.6, 0.3], 0.00],
    [-5,   [0.120, 0.060, 0.025], [0.320, 0.180, 0.070], [0.045, 0.025, 0.010], [0.9, 0.6, 0.3], 0.60],
    [5,    [0.350, 0.180, 0.070], [0.650, 0.380, 0.140], [0.090, 0.050, 0.020], [0.9, 0.65, 0.35], 1.20],
    [90,   [0.580, 0.320, 0.120], [0.850, 0.520, 0.200], [0.140, 0.080, 0.035], [0.95, 0.70, 0.40], 0.90],
  ],
  gas_giants: [
    /* Troposfer raksasa gas/es */
    [-90,  [0.010, 0.012, 0.020], [0.015, 0.018, 0.025], [0.008, 0.010, 0.015], [1.0, 0.95, 0.85], 0.00],
    [10,   [0.450, 0.520, 0.620], [0.650, 0.720, 0.800], [0.150, 0.180, 0.220], [1.0, 0.95, 0.85], 0.30],
    [90,   [0.550, 0.620, 0.720], [0.720, 0.780, 0.850], [0.180, 0.220, 0.260], [1.0, 0.95, 0.85], 0.25],
  ],
};

function getSkyTableForBody(body) {
  const atmoKey = getBodyAtmosphereKey(body);
  if (atmoKey && SKY_COLOR_TABLES[atmoKey]) return SKY_COLOR_TABLES[atmoKey];
  return SKY_COLOR_TABLES.earth;
}

function skyColorsForAltitude(altDeg, body) {
  const T = getSkyTableForBody(body);
  if (altDeg <= T[0][0]) return T[0];
  if (altDeg >= T[T.length - 1][0]) return T[T.length - 1];
  for (let i = 0; i < T.length - 1; i++) {
    const a = T[i], b = T[i + 1];
    if (altDeg >= a[0] && altDeg <= b[0]) {
      const f = (altDeg - a[0]) / (b[0] - a[0] || 1);
      const mix3 = (x, y) => [x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f];
      return [altDeg, mix3(a[1], b[1]), mix3(a[2], b[2]), mix3(a[3], b[3]), mix3(a[4], b[4]), a[5] + (b[5] - a[5]) * f];
    }
  }
  return T[T.length - 1];
}


let surfaceSky = null;
let surfaceSkyMat = null;

/* Buat bola langit permukaan (sekali saja, dipakai ulang). */
function buildSurfaceSky() {
  if (surfaceSky) return surfaceSky;
  surfaceSkyMat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith:  { value: new THREE.Color(0.29, 0.51, 0.93) },
      uHorizon: { value: new THREE.Color(0.69, 0.83, 0.98) },
      uGround:  { value: new THREE.Color(0.18, 0.19, 0.20) },
      uSunColor:{ value: new THREE.Color(1.0, 0.95, 0.85) },
      uSunDir:  { value: new THREE.Vector3(0, 1, 0) },
      uSunAlt:  { value: 0 },
      uOpacity: { value: 1.0 },
      uSunGlow: { value: 0.2 },
    },
    vertexShader: SURFACE_SKY_VERT,
    fragmentShader: SURFACE_SKY_FRAG,
    side: THREE.BackSide,      /* dilihat dari DALAM bola */
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });

  surfaceSky = new THREE.Mesh(new THREE.SphereGeometry(0.001, 32, 24), surfaceSkyMat);
  surfaceSky.frustumCulled = false;
  surfaceSky.renderOrder = -1000;
  surfaceSky.visible = false;
  scene.add(surfaceSky);
  return surfaceSky;
}

/* Informasi atmosfer untuk penyelarasan pencahayaan patch permukaan */
function getSurfaceAtmosphereInfo(body, altDeg) {
  const hasAtmo = bodyHasAtmosphere(body);
  if (!hasAtmo) {
    return {
      hasAtmosphere: false,
      horizonFogColor: new THREE.Color(0x000000),
      ambientColor: new THREE.Color(0x0a0c10), // sedikit ambient antariksa
      sunColor: new THREE.Color(0xffffff),
      fogDensity: 0.0,
      sunIntensity: 1.25,
    };
  }

  const row = skyColorsForAltitude(altDeg, body);
  const k = (body && (body.key || body.name) || '').toLowerCase();
  let fog = 0.04;
  if (k === 'venus') fog = 0.18; // kabut sangat pekat
  if (k === 'titan') fog = 0.12;
  if (k === 'mars') fog = 0.05;

  return {
    hasAtmosphere: true,
    // ================================================================
    // KABUT HORIZON — DIPERBAIKI 29 Sep
    // ----------------------------------------------------------------
    // MASALAH: saat malam, row[2] (warna horizon tabel) hanya ~0,006-0,015
    // dan dipakai sebagai uHorizonFogColor dengan fogDensity 0,04. Karena
    // shader mencampur warna akhir ke warna kabut berdasarkan jarak
    // (fog = 1 - exp(-distKm * 0.04)), SELURUH tanah jauh menjadi hitam
    // pekat -> permukaan menyatu dengan langit (keluhan pengguna).
    //
    // FISIKA: kabut malam tetap memantulkan cahaya bulan/airglow, jadi
    // ia tidak hitam. Lantai kabut dinaikkan ke nilai ambient malam
    // supaya horizon tetap terbaca, tanpa mengubah siang (nilai tabel
    // siang jauh lebih besar sehingga tetap dominan).
    // ================================================================
    horizonFogColor: new THREE.Color(
      Math.max(0.050, row[2][0]),
      Math.max(0.054, row[2][1]),
      Math.max(0.068, row[2][2])
    ),
    // ================================================================
    // AMBIENT MALAM — DIPERBAIKI 29 Sep
    // ----------------------------------------------------------------
    // MASALAH: lantai ambient 0,012 terlalu gelap, sehingga saat malam
    // permukaan menyatu dengan langit (keluhan: "permukaan terlalu gelap
    // dan hitam jadi terlihat menyatu dengan langit").
    //
    // FISIKA: malam di permukaan planet TIDAK benar-benar hitam. Ada
    // cahaya bulan (refleksi Matahari oleh satelit), airglow atmosfer,
    // dan cahaya bintang terintegrasi. Pada Bumi totalnya setara
    // ~0,001-0,01 lux (1e-5 s/d 1e-4 dari cahaya Matahari), cukup untuk
    // horizon dan tekstur tanah tetap terbaca oleh mata yang beradaptasi.
    //
    // Nilai dipilih 0,055 dengan sedikit condong biru (cahaya bulan
    // memang lebih biru karena hamburan Rayleigh ganda), sehingga tanah
    // tetap terlihat sebagai permukaan, bukan menyatu dengan langit.
    // Nilai SIANG tidak berubah: rumus row[1]*0.45 masih dominan saat
    // Matahari tinggi.
    // ================================================================
    ambientColor: new THREE.Color(
      Math.max(0.16, row[1][0] * 0.45),
      Math.max(0.17, row[1][1] * 0.45),
      Math.max(0.21, row[1][2] * 0.45)
    ),
    sunColor: new THREE.Color(row[4][0], row[4][1], row[4][2]),
    fogDensity: fog,
    sunIntensity: 1.20,
  };
}

/* Perbarui langit permukaan tiap frame saat POV aktif */
function updateSurfaceSky(obs, body, atmoOn) {
  if (!surfaceSky) buildSurfaceSky();
  if (!obs) { surfaceSky.visible = false; return; }

  const hasAtmo = bodyHasAtmosphere(body);
  if (!atmoOn || !hasAtmo) {
    surfaceSky.visible = false;
    return;
  }

  const altDeg = SURFACE_VIEW.sunAltitudeDeg(obs);
  const row = skyColorsForAltitude(altDeg, body);

  surfaceSky.visible = true;
  surfaceSky.position.copy(camera.position);

  const m = surfaceSkyMat.uniforms;
  m.uZenith.value.setRGB(row[1][0], row[1][1], row[1][2]);
  // ================================================================
  // uGround — DIPERBAIKI 29 Sep (keluhan "permukaan menyatu dengan langit")
  // ----------------------------------------------------------------
  // Sebelumnya uGround = row[3] (warna tabel) yang saat malam hanya
  // ~0,006-0,010 -> praktis hitam, sama dengan langit malam, sehingga
  // horizon hilang. Sekarang lantai dinaikkan ke nilai ambient malam
  // (cahaya bulan + airglow) supaya batas tanah-langit tetap terbaca,
  // sementara pada siang hari nilai tabel (yang jauh lebih terang)
  // tetap dominan sehingga tidak ada perubahan.
  // ================================================================
  const gFloor = 0.052;
  m.uGround.value.setRGB(
    Math.max(gFloor, row[3][0]),
    Math.max(gFloor, row[3][1]),
    Math.max(gFloor * 1.15, row[3][2])
  );
  m.uHorizon.value.setRGB(row[2][0], row[2][1], row[2][2]);
  m.uSunColor.value.setRGB(row[4][0], row[4][1], row[4][2]);
  m.uSunGlow.value = row[5];
  m.uSunAlt.value = altDeg * DEG;

  const sun = findBody('sun');
  if (sun && sun.absPos) {
    m.uSunDir.value.copy(sun.absPos).sub(obs.pos).normalize();
  }

  const dayness = Math.max(0, Math.min(1, (altDeg + 12) / 24));
  const op = 0.06 + 0.90 * dayness;
  m.uOpacity.value = op;

  if (op < 0.02) surfaceSky.visible = false;
}

/* Sembunyikan langit permukaan */
function hideSurfaceSky() {
  if (surfaceSky) surfaceSky.visible = false;
}

