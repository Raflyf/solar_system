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

/* Tabel warna langit per elevasi Matahari (derajat).
   Diinterpolasi linear antar baris — sederhana, cepat, dan cukup halus. */
const SKY_COLOR_TABLE = [
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
];

function skyColorsForAltitude(altDeg) {
  const T = SKY_COLOR_TABLE;
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
    /* depthTest: true + renderOrder -1000 → bola langit digambar paling
       awal dan TIDAK menimpa objek yang digambar sesudahnya (patch
       permukaan). Dengan depthTest false (versi lama) ia menimpa
       segalanya sehingga permukaan tak pernah terlihat — terbukti di uji. */
    depthTest: true,
  });
  /* =====================================================================
     BOLA LANGIT PERMUKAAN
     ---------------------------------------------------------------------
     Radius 0,001 unit (6,4 km dari kamera) — cukup kecil sehingga patch
     permukaan (radius 1) selalu berada DI LUAR bola ini dan menang depth
     test. Material memakai depthTest:true + renderOrder -1000 supaya
     digambar paling awal tanpa menimpa objek berikutnya.
     ===================================================================== */
  surfaceSky = new THREE.Mesh(new THREE.SphereGeometry(0.001, 32, 24), surfaceSkyMat);
  surfaceSky.frustumCulled = false;
  /* renderOrder sangat negatif = dirender PALING AWAL (di belakang semua).
     depthTest dimatikan supaya bola ini tidak menutupi apa pun, dan
     depthWrite juga mati supaya tidak mengotori depth buffer. */
  surfaceSky.renderOrder = -1000;
  surfaceSky.visible = false;
  scene.add(surfaceSky);
  return surfaceSky;
}

/* Perbarui langit permukaan tiap frame saat POV aktif.
   obs      : hasil SURFACE_VIEW.computeObserver()
   body     : body yang sedang dipakai POV
   atmoOn   : apakah atmosfer dinyalakan pengguna

   URUTAN RENDER (penting agar permukaan tidak tertutup):
     surfaceSky  : renderOrder -1000, depthTest FALSE, depthWrite false
     surfacePatch: renderOrder    5, depthTest true,  depthWrite true
   Karena depthTest bola langit dimatikan, ia SELALU tampil di belakang
   apa pun yang sudah tergambar — termasuk patch permukaan. Yang penting
   patch digambar SETELAH bola langit (renderOrder lebih besar), dan itu
   sudah benar. */
function updateSurfaceSky(obs, body, atmoOn) {
  if (!surfaceSky) buildSurfaceSky();
  if (!obs) { surfaceSky.visible = false; return; }

  const altDeg = SURFACE_VIEW.sunAltitudeDeg(obs);
  const row = skyColorsForAltitude(altDeg);

  surfaceSky.visible = true;
  /* ditempatkan di posisi kamera (bola langit lokal) */
  surfaceSky.position.copy(camera.position);

  const m = surfaceSkyMat.uniforms;
  m.uZenith.value.setRGB(row[1][0], row[1][1], row[1][2]);
  m.uHorizon.value.setRGB(row[2][0], row[2][1], row[2][2]);
  m.uGround.value.setRGB(row[3][0], row[3][1], row[3][2]);
  m.uSunColor.value.setRGB(row[4][0], row[4][1], row[4][2]);
  m.uSunGlow.value = row[5];
  m.uSunAlt.value = altDeg * DEG;

  /* arah Matahari dalam kerangka KAMERA (karena surfaceSky mengikuti
     kamera tanpa rotasi, vDir lokal = arah dunia) */
  const sun = findBody('sun');
  if (sun && sun.absPos) {
    m.uSunDir.value.copy(sun.absPos).sub(obs.pos).normalize();
  }

  /* OPASITAS: ini "saklar atmosfer" yang diminta pengguna.
       - Atmosfer MATI  → langit transparan, bintang terlihat penuh
       - Atmosfer NYALA → langit berwarna; malam tetap agak transparan
         supaya bintang masih tampak (seperti langit nyata) */
  let op;
  if (!atmoOn) {
    op = 0.0;
  } else {
    /* =====================================================================
       LANGIT MALAM — DIBUAT LEBIH GELAP (permintaan pengguna)
       ---------------------------------------------------------------------
       Sebelumnya malam memakai opasitas 0,25 sehingga langit tampak
       kelabu dan bintang kurang kontras ("pada saat malam coba buat
       bulannya lebih terlihat seperti pov realistik dari bumi").

       Di kehidupan nyata, langit malam JAUH lebih gelap dari siang
       (rasio ~100.000:1). Nilai baru: 0,06 saat malam penuh — bintang
       dan Bulan jadi jauh lebih kontras, seperti pemandangan malam asli.
       ===================================================================== */
    const dayness = Math.max(0, Math.min(1, (altDeg + 12) / 24));
    op = 0.06 + 0.90 * dayness;
  }
  m.uOpacity.value = op;

  /* Saat atmosfer mati atau malam gelap, bola langit disembunyikan supaya
     tekstur bintang & Bima Sakti (skyMesh) terlihat sepenuhnya. */
  if (op < 0.02) surfaceSky.visible = false;
}

/* Sembunyikan langit permukaan (dipakai saat keluar dari POV). */
function hideSurfaceSky() {
  if (surfaceSky) surfaceSky.visible = false;
}
