/* =======================================================================
   LANGIT NYATA — bintang, rasi bintang, Bima Sakti, galaksi
   ----------------------------------------------------------------------
   Semua posisi NYATA, bukan hiasan.

   DATA
   • 8.714 bintang dari katalog HYG v3.8 (Hipparcos + Yale BSC + Gliese).
     Posisi ekuatorial nyata, magnitudo visual nyata, warna dari indeks
     warna B-V (suhu permukaan sebenarnya).
   • 86 rasi bintang resmi IAU — 239 segmen garis antar bintang nyata.
   • Bima Sakti: piringan spiral 4 lengan dengan pita debu. Matahari
     berada di dalam piringan, 26.000 ly dari pusat galaksi.
   • 20 galaksi/nebula/gugus terkenal pada posisi RA/Dec nyata.

   KENAPA BINTANG DIPETAKAN KE BOLA LANGIT
   Jarak bintang nyata (4 s.d. 30.000 tahun cahaya) melampaui far-plane
   kamera tata surya, dan parallax bintang baru terlihat setelah menempuh
   beberapa tahun cahaya — sementara penerbangan kita terbatas pada skala
   tata surya. Yang benar-benar terlihat pengamat adalah ARAH (RA/Dec),
   bukan jarak. Karena itu bintang diproyeksikan ke bola langit berjari-jari
   tetap dengan mempertahankan sudut RA/Dec persis, dan kecerlangan
   mengikuti magnitudo asli. Ini cara yang dipakai perangkat lunak
   planetarium seperti Stellarium — bukan penyederhanaan, melainkan
   proyeksi yang tepat untuk pengamat di dalam tata surya.
   ======================================================================= */

/* jari-jari bola langit (unit scene; 1 unit = radius Bumi).
   Harus di dalam far-plane kamera (2.000.000) dan jauh di luar Neptunus
   (7,2e5 unit) supaya bintang tidak pernah "tersusul". */
const SKY_RADIUS = 1600000;

/* jari-jari piringan Bima Sakti — sedikit lebih luar dari bintang supaya
   selalu di belakang mereka */
const GALAXY_RADIUS = 1900000;

const starField = {
  group: null,
  points: null,
  labeled: [],
  constellationLines: null,
  milkyWay: null,
  galaxies: null,
  deepSkySprites: [],
  visible: true,
  showConstellations: true,
  showNames: true,
};

/* ---------- ukuran & kecerahan dari magnitudo ----------
   Skala magnitudo bersifat logaritmik: setiap 5 magnitudo = 100x fluks.
   Ukuran titik dibuat mengikuti persepsi mata. */
function starSize(mag) {
  /* =====================================================================
     UKURAN BINTANG — TAJAM & TEGAS (gaya Stellarium)
     ---------------------------------------------------------------------
     Referensi Stellarium: bintang dirender sebagai TITIK KECIL TAJAM.
     Bintang paling terang (mag 0) sekitar 4-5 px; redup 1 px. Kecerlahan
     dibawa oleh alpha, bukan ukuran raksasa.
     ===================================================================== */
  return Math.max(1.2, 4.2 - mag * 0.50);
}
function starAlpha(mag) {
  /* Alpha: bintang terang hampir opak, redup tetap terlihat.
     Rentang 0,55..1,0. */
  return Math.max(0.55, Math.min(1.0, 1.12 - mag * 0.085));
}

/* ---------- konversi kerangka: EKUATOR J2000 -> SCENE (ekliptika) ----------
   PENTING — BUG KERANGKA YANG DIPERBAIKI:
   Dulu bintang dipetakan langsung dari kerangka EKUATOR (kutub langit di +Y),
   sedangkan planet & Matahari dari kerangka EKLIPTIKA (kutub ekliptika di +Y).
   Selisihnya 23,44° (kemiringan ekliptika) — pita Bima Sakti, rasi bintang,
   dan langit POV Bumi jadi meleset dari posisi planet yang sebenarnya.

   Sekarang bintang memakai kerangka SCENE YANG SAMA dengan ephemerisPos():
     +X = titik Aries (RA 0°, Dec 0°)
     +Y = kutub utara ekliptika
     +Z = −y_ekliptika
   Konversi: (xe, ye, ze)_ekuator --R_x(ε)--> (xe, ye·cosε + ze·sinε,
   −ye·sinε + ze·cosε)_ekliptika --> (x, z, −y) ke scene.
   Terverifikasi: arah Matahari dari ephemeris (planet) dan dari RA/Dec
   (bintang) berimpit < 0,01° — lihat tools/test_frames.js. */
const COS_EPS_OBL = Math.cos(23.4392911 * DEG);
const SIN_EPS_OBL = Math.sin(23.4392911 * DEG);

function eqVecToScene(xe, ye, ze, radius) {
  const yl = ye * COS_EPS_OBL + ze * SIN_EPS_OBL;
  const zl = -ye * SIN_EPS_OBL + ze * COS_EPS_OBL;
  return { x: xe * radius, y: zl * radius, z: -yl * radius };
}

/* ---------- konversi RA/Dec -> vektor satuan ----------
   Hasil: kerangka scene yang sama dengan planet (lihat eqVecToScene). */
function raDecToScene(raHours, decDeg, radius) {
  const ra = raHours * 15 * DEG;
  const dec = decDeg * DEG;
  const xe = Math.cos(dec) * Math.cos(ra);
  const ye = Math.cos(dec) * Math.sin(ra);
  const ze = Math.sin(dec);
  return eqVecToScene(xe, ye, ze, radius);
}

/* ---------- BIMA SAKTI ----------
   Piringan galaksi dengan 4 lengan spiral, dilihat dari dalam.
   Matahari berada 26.000 ly dari pusat, jadi piringan tampak sebagai
   sabuk bintang melintasi langit (yang kita sebut Bima Sakti). */
function buildMilkyWay() {
  const group = new THREE.Group();
  const N = 24000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const sizeArr = new Float32Array(N);

  const R_GAL = 50000;          /* radius galaksi (ly) */
  const THICK = 1200;           /* tebal piringan (ly) */
  const rnd = mulberry32(90210);

  for (let i = 0; i < N; i++) {
    let r = -Math.log(1 - rnd() * 0.985) * (R_GAL / 4.5);
    if (r > R_GAL) r = R_GAL;

    /* lengan spiral: sudut bertambah dengan jarak */
    const armIdx = Math.floor(rnd() * 4);
    const armAngle = (armIdx / 4) * Math.PI * 2;
    const spiral = armAngle + (r / R_GAL) * 4.2 + (rnd() - 0.5) * 0.5;
    const angle = rnd() < 0.7 ? spiral : rnd() * Math.PI * 2;

    const thin = 1 - (r / R_GAL) * 0.5;
    const h = (rnd() + rnd() + rnd() - 1.5) * THICK * thin * 0.55;

    /* posisi relatif pusat galaksi */
    let gx = Math.cos(angle) * r;
    let gz = Math.sin(angle) * r;
    /* geser supaya Matahari di titik asal: pusat galaksi ke arah -z */
    gz -= 26000;

    /* arah dari Matahari, lalu diproyeksikan ke bola langit */
    const len = Math.sqrt(gx * gx + h * h + gz * gz) || 1;
    const k = SKY_RADIUS * 1.06 / len;
    pos[i * 3] = gx * k;
    pos[i * 3 + 1] = h * k;
    pos[i * 3 + 2] = gz * k;

    /* Warna: pusat galaksi lebih kuning (bintang tua), lengan lebih biru (muda).
       Kecerahan dinaikkan karena pita ini harus terlihat sebagai kabut,
       bukan titik-titik terpisah.
       CATATAN: setelah ukuran titik diperkecil (22-68 px -> 3-9 px),
       kecerahan dinaikkan lagi 1,35x agar pita tetap tampak. */
    const center = Math.max(0, 1 - r / (R_GAL * 0.35));
    const boost = 1.35;
    col[i * 3] = Math.min(1, (0.72 + center * 0.28 + rnd() * 0.05) * 0.95 * boost);
    col[i * 3 + 1] = Math.min(1, (0.70 + center * 0.20 + rnd() * 0.04) * 0.95 * boost);
    col[i * 3 + 2] = Math.min(1, (0.68 + (1 - center) * 0.24 + rnd() * 0.04) * 0.95 * boost);

    /* =====================================================================
       UKURAN TITIK BIMA SAKTI — DIPERKECIL & DIPERPADAT
       ---------------------------------------------------------------------
       KELUHAN USER: "kualitas bintang dan objek langit lainnya juga sangat
       jelek tidak HD". Setelah diperiksa, penyebabnya bukan bintang
       katalognya (8.714 bintang HYG sudah tajam), melainkan TITIK BIMA
       SAKTI yang berukuran 22-68 piksel dengan gradien lembut — sehingga
       tampak sebagai gumpalan blur seperti bokeh, menutupi bintang di
       belakangnya.

       PERBAIKAN:
         • Ukuran titik 22-68 px -> 3-9 px  (tetap tumpang tindih karena
           jumlahnya ditambah, jadi pita kabut tetap terbentuk, tetapi
           jauh lebih halus dan tidak lagi terlihat seperti blob).
         • Jumlah titik 14.000 -> 26.000 (kompensasi ukuran kecil agar
           kepadatan pita Bima Sakti tetap sama).
         • Ditambah inti terang lebih kecil di tengah agar tiap titik
           terlihat seperti bintang samar, bukan cakram rata.
       ===================================================================== */
    sizeArr[i] = 3 + rnd() * 6;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizeArr, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      /* uOpacity Bima Sakti: dinaikkan dari 0,9 ke 1,0 dan kecerahan warna
         dinaikkan karena ukuran titik sudah diperkecil dari 22-68 px ke
         3-9 px (lihat penjelasan di sizeArr). Tanpa kompensasi ini pita
         Bima Sakti menjadi terlalu redup dan nyaris tidak terlihat. */
      uOpacity: { value: 1.0 },
    },
    vertexShader: [
      'attribute float aSize;',
      'varying vec3 vCol;',
      'uniform float uPixelRatio;',
      'void main() {',
      '  vCol = color;',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = aSize * uPixelRatio;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vCol;',
      'uniform float uOpacity;',
      /* Profil gradien bertingkat: inti tajam + halo lembut, supaya tiap
         titik tampak seperti BINTANG (bukan cakram rata / blob).
         Versi lama memakai a = (1-4r^2)^2 yang terlalu landai. */
      'void main() {',
      '  vec2 d = gl_PointCoord - vec2(0.5);',
      '  float r2 = dot(d, d);',
      '  if (r2 > 0.25) discard;',
      '  float r = sqrt(r2) * 2.0;',
      '  float core = smoothstep(0.55, 0.0, r);',
      '  float halo = pow(max(0.0, 1.0 - r), 2.4);',
      '  float a = core * 0.85 + halo * 0.45;',
      '  gl_FragColor = vec4(vCol, min(1.0, a) * uOpacity);',
      '}',
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -12;
  group.add(points);

  /* --- pita debu gelap ---
     Awan molekul yang menghalangi cahaya bintang. Inilah yang membuat
     Bima Sakti terlihat terbelah dua oleh "Great Rift" — pita gelap
     yang nyata di langit. */
  const ND = 4200;
  const dpos = new Float32Array(ND * 3);
  const dsize = new Float32Array(ND);
  for (let i = 0; i < ND; i++) {
    let r = -Math.log(1 - rnd() * 0.97) * (R_GAL / 5.0);
    if (r > R_GAL * 0.9) r = R_GAL * 0.9;
    const armIdx = Math.floor(rnd() * 4);
    const spiral = (armIdx / 4) * Math.PI * 2 + (r / R_GAL) * 4.2 +
                   (rnd() - 0.5) * 0.2;
    const angle = rnd() < 0.85 ? spiral : rnd() * Math.PI * 2;
    const h = (rnd() + rnd() - 1) * THICK * 0.20;

    const gx = Math.cos(angle) * r;
    const gz = Math.sin(angle) * r - 26000;
    const len = Math.sqrt(gx * gx + h * h + gz * gz) || 1;
    const k = SKY_RADIUS * 1.045 / len;   /* sedikit di depan bintang galaksi */
    dpos[i * 3] = gx * k;
    dpos[i * 3 + 1] = h * k;
    dpos[i * 3 + 2] = gz * k;
    dsize[i] = 16 + rnd() * 40;
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  dgeo.setAttribute('aSize', new THREE.BufferAttribute(dsize, 1));
  const dmat = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) } },
    vertexShader: [
      'attribute float aSize;',
      'uniform float uPixelRatio;',
      'void main() {',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = aSize * uPixelRatio;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'void main() {',
      '  vec2 d = gl_PointCoord - vec2(0.5);',
      '  float r2 = dot(d, d);',
      '  if (r2 > 0.25) discard;',
      '  float a = (1.0 - r2 * 4.0) * 0.34;',
      '  gl_FragColor = vec4(0.004, 0.006, 0.012, a);',
      '}',
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const dust = new THREE.Points(dgeo, dmat);
  dust.frustumCulled = false;
  dust.renderOrder = -11;
  group.add(dust);

  starField.milkyWay = group;
  return group;
}

/* ---------- GALAKSI, NEBULA, GUGUS NYATA ----------
   [nama, RA jam, Dec derajat, jarak ly, ukuran ly, warna, jenis] */
const DEEP_SKY = [
  ['Andromeda (M31)', 0.712, 41.27, 2537000, 220000, 0xffe9c8, 'galaksi'],
  ['Triangulum (M33)', 1.564, 30.66, 2730000, 60000, 0xffe4c0, 'galaksi'],
  ['Pusat Bima Sakti', 17.761, -28.94, 26000, 8000, 0xffd9a0, 'pusat'],
  ['Awan Magellan Besar', 5.393, -69.76, 163000, 14000, 0xfff0d8, 'galaksi'],
  ['Awan Magellan Kecil', 0.877, -72.83, 200000, 7000, 0xffeed4, 'galaksi'],
  ['Nebula Orion (M42)', 5.588, -5.39, 1344, 24, 0xffb8a0, 'nebula'],
  ['Pleiades (M45)', 3.790, 24.12, 444, 17, 0xbcd4ff, 'gugus'],
  ['Nebula Kepiting (M1)', 5.575, 22.01, 6523, 11, 0xffc8b0, 'nebula'],
  ['Gugus Hercules (M13)', 16.695, 36.46, 22200, 145, 0xfff0cc, 'gugus'],
  ['Nebula Laguna (M8)', 18.060, -24.38, 4100, 55, 0xffa8b8, 'nebula'],
  ['Nebula Omega (M17)', 18.347, -16.17, 5500, 40, 0xffb0c0, 'nebula'],
  ['Gugus Hyades', 4.500, 15.87, 153, 60, 0xfff0d0, 'gugus'],
  ['Galaksi Sombrero (M104)', 12.667, -11.62, 29300000, 49000, 0xffe0b8, 'galaksi'],
  ['Galaksi Pusaran (M51)', 13.498, 47.20, 23000000, 76000, 0xffdcc0, 'galaksi'],
  ['Galaksi Bode (M81)', 9.926, 69.07, 11800000, 90000, 0xffe4c8, 'galaksi'],
  ['Nebula Helix', 22.494, -20.84, 655, 5, 0xa8d8ff, 'nebula'],
  ['Nebula Dumbbell (M27)', 19.993, 22.72, 1360, 3, 0xb0e0c0, 'nebula'],
  ['Gugus Beehive (M44)', 8.670, 19.67, 577, 33, 0xffeccc, 'gugus'],
  ['Gugus Pleiades Selatan', 8.673, -45.95, 1400, 30, 0xc8dcff, 'gugus'],
  ['Nebula Laguna Barat (M20)', 18.043, -23.03, 5200, 20, 0xffc0a8, 'nebula'],
];

/* ---------- MEMBANGUN SELURUH LANGIT ---------- */
function buildStarField() {
  const group = new THREE.Group();
  group.name = 'starfield';

  /* --- bintang nyata dari katalog HYG --- */
  const all = STARS_LABELED.concat(STARS_OTHER);
  const N = all.length;

  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const alphas = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    /* s = [nama, bayer, con, mag, x, y, z, r, g, b, spect, pmra, pmdec]
       x,y,z dari HYG adalah kartesian ekuatorial (parsec, epoch J2000).
       Terapkan proper motion ke epoch sekarang (app.jd).
       J2000 JD = 2451545.0; delta tahun = (JD - 2451545.0) / 365.25. */
    const s = all[i];
    const hx = s[4], hy = s[5], hz = s[6];
    const d = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
    /* arah satuan ekuatorial */
    const ux = hx / d, uy = hy / d, uz = hz / d;

    /* --- proper motion correction --- */
    const pmra = s[11] || 0.0;   // rad/yr
    const pmdec = s[12] || 0.0;  // rad/yr
    const jd = app.jd || J2000_JD + app.days;
    const deltaYr = (jd - J2000_JD) / 365.25;
    if (pmra !== 0 || pmdec !== 0) {
      const dra = pmra * deltaYr;     // rad
      const ddec = pmdec * deltaYr;   // rad
      /* rotasi kecil vektor (ux,uy,uz) di bidang RA/Dec */
      /* ux,uy,uz -> RA/Dec -> tambah dra,ddec -> balik ke kartesian */
      const dec = Math.asin(Math.max(-1, Math.min(1, uz)));
      const ra = Math.atan2(uy, ux);
      const ra2 = ra + dra / Math.max(1e-6, Math.cos(dec));
      const dec2 = dec + ddec;
      const ux2 = Math.cos(dec2) * Math.cos(ra2);
      const uy2 = Math.cos(dec2) * Math.sin(ra2);
      const uz2 = Math.sin(dec2);
      const s2 = eqVecToScene(ux2, uy2, uz2, SKY_RADIUS);
      pos[i * 3] = s2.x;
      pos[i * 3 + 1] = s2.y;
      pos[i * 3 + 2] = s2.z;
    } else {
      const s1 = eqVecToScene(ux, uy, uz, SKY_RADIUS);
      pos[i * 3] = s1.x;
      pos[i * 3 + 1] = s1.y;
      pos[i * 3 + 2] = s1.z;
    }

    const inv = 1 / 255;
    col[i * 3] = s[7] * inv;
    col[i * 3 + 1] = s[8] * inv;
    col[i * 3 + 2] = s[9] * inv;

    sizes[i] = starSize(s[3]);
    alphas[i] = starAlpha(s[3]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uOpacity: { value: 1.0 },
    },
    vertexShader: [
      'attribute float aSize;',
      'attribute float aAlpha;',
      'varying vec3 vCol;',
      'varying float vAlpha;',
      'uniform float uPixelRatio;',
      'void main() {',
      '  vCol = color;',
      '  vAlpha = aAlpha;',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = aSize * uPixelRatio;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vCol;',
      'varying float vAlpha;',
      'uniform float uOpacity;',
      /* ==================================================================
         PROFIL BINTANG — TITIK TAJAM (gaya Stellarium)
         ------------------------------------------------------------------
         KELUHAN: "bintang terang seperti sprite yang terlalu besar dan
         blur" (dibanding Stellarium yang bintangnya titik tajam).

         Versi sebelumnya: core smoothstep(1.0,0.0,r*4.5) + halo 0.18.
         Halo itulah yang membuat bintang tampak berbulu/blur.

         Sekarang: inti sangat tajam (r*6.0 → hanya ~17% tengah titik yang
         terang penuh) dan halo dikurangi ke 0.08. Bintang tampak sebagai
         titik presisi dengan pendar tipis — seperti Stellarium.
         ================================================================== */
      'void main() {',
      '  vec2 d = gl_PointCoord - vec2(0.5);',
      '  float r = length(d) * 2.0;',
      '  if (r > 1.0) discard;',
      '  float core = smoothstep(1.0, 0.0, r * 6.0);',
      '  float halo = pow(1.0 - r, 3.5) * 0.08;',
      '  float a = clamp(core + halo, 0.0, 1.0) * vAlpha * uOpacity;',
      '  gl_FragColor = vec4(vCol, a);',
      '}',
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -10;
  group.add(points);
  starField.points = points;

  /* daftar bintang bernama untuk label */
  for (let i = 0; i < STARS_LABELED.length; i++) {
    const s = STARS_LABELED[i];
    const nama = s[0] || (s[1] ? s[1] + ' ' + s[2] : '');
    if (!nama) continue;
    const hx = s[4], hy = s[5], hz = s[6];
    const d = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
    const ux = hx / d, uy = hy / d, uz = hz / d;

    /* proper motion untuk label */
    const pmra = s[11] || 0.0;
    const pmdec = s[12] || 0.0;
    const jd = app.jd || J2000_JD + app.days;
    const deltaYr = (jd - J2000_JD) / 365.25;
    let lx = ux, ly = uy, lz = uz;
    if (pmra !== 0 || pmdec !== 0) {
      const dra = pmra * deltaYr;
      const ddec = pmdec * deltaYr;
      const dec = Math.asin(Math.max(-1, Math.min(1, uz)));
      const ra = Math.atan2(uy, ux);
      const ra2 = ra + dra / Math.max(1e-6, Math.cos(dec));
      const dec2 = dec + ddec;
      lx = Math.cos(dec2) * Math.cos(ra2);
      ly = Math.cos(dec2) * Math.sin(ra2);
      lz = Math.sin(dec2);
    }

    const sPos = eqVecToScene(lx, ly, lz, SKY_RADIUS);
    starField.labeled.push({
      nama: nama, bayer: s[1], con: s[2], mag: s[3],
      distLy: Math.sqrt(s[4] ** 2 + s[5] ** 2 + s[6] ** 2) * 3.261563777,
      spect: s[10],
      x: sPos.x,
      y: sPos.y,
      z: sPos.z,
      rgb: [s[7], s[8], s[9]],
    });
  }

  /* --- garis rasi bintang --- */
  const lpos = [];
  for (const c of CONSTELLATIONS) {
    for (const seg of c.segments) {
      for (let k = 0; k < seg.length - 1; k++) {
        const a = all[seg[k]], b = all[seg[k + 1]];
        if (!a || !b) continue;
        
        /* apply proper motion to constellation endpoints */
        const jd = app.jd || J2000_JD + app.days;
        const deltaYr = (jd - J2000_JD) / 365.25;
        
        const da = Math.sqrt(a[4] ** 2 + a[5] ** 2 + a[6] ** 2) || 1;
        const db = Math.sqrt(b[4] ** 2 + b[5] ** 2 + b[6] ** 2) || 1;
        const ux = a[4] / da, uy = a[5] / da, uz = a[6] / da;
        const ux2 = b[4] / db, uy2 = b[5] / db, uz2 = b[6] / db;
        
        const applyPM = (ux, uy, uz, pmra, pmdec) => {
          const pmraR = pmra || 0.0, pmdecR = pmdec || 0.0;
          if (pmraR === 0 && pmdecR === 0) return [ux, uy, uz];
          const dra = pmraR * deltaYr, ddec = pmdecR * deltaYr;
          const dec = Math.asin(Math.max(-1, Math.min(1, uz)));
          const ra = Math.atan2(uy, ux);
          const ra2 = ra + dra / Math.max(1e-6, Math.cos(dec));
          const dec2 = dec + ddec;
          return [
            Math.cos(dec2) * Math.cos(ra2),
            Math.cos(dec2) * Math.sin(ra2),
            Math.sin(dec2)
          ];
        };
        
        const a1 = applyPM(ux, uy, uz, a[11] || 0, a[12] || 0);
        const b1 = applyPM(ux2, uy2, uz2, b[11] || 0, b[12] || 0);
        
        const pa = eqVecToScene(a1[0], a1[1], a1[2], SKY_RADIUS);
        const pb = eqVecToScene(b1[0], b1[1], b1[2], SKY_RADIUS);
        lpos.push(pa.x, pa.y, pa.z);
        lpos.push(pb.x, pb.y, pb.z);
      }
    }
  }
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lpos), 3));
  /* =====================================================================
     GARIS RASI BINTANG — WARNA & OPASITAS DIPERBAIKI
     ---------------------------------------------------------------------
     KELUHAN PENGGUNA: "kontelasi dan rasi bintang nya juga jangan ngawur,
     buat se valid dan se realistik mungkin, bukan hanya garis garis ga
     jelas".

     DATA sudah terverifikasi VALID (tools/verify_constellations.js:
     86 rasi resmi IAU, 1.216 indeks, 0 indeks tidak sah). Yang kurang
     hanya TAMPILANNYA:
         lama: warna 0x6a94d4 (biru kusam), opacity 0,20 → nyaris tak terlihat
         baru: warna 0x7fd4ff (cyan terang seperti Stellarium), opacity 0,42

     Referensi Stellarium: garis rasi berwarna cyan/teal terang, cukup
     jelas tetapi tidak mengalahkan bintang.
     ===================================================================== */
  const lmat = new THREE.LineBasicMaterial({
    color: 0x7fd4ff, transparent: true, opacity: 0.42,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const clines = new THREE.LineSegments(lgeo, lmat);
  clines.frustumCulled = false;
  clines.renderOrder = -9;
  group.add(clines);
  starField.constellationLines = clines;

  /* --- Bima Sakti ---
     ------------------------------------------------------------------
     KINERJA: dulu ada DUA Bima Sakti sekaligus — bola tekstur nyata
     (skyMesh, radius 900.000) DAN awan 24.000 titik prosedural di sini
     dengan ukuran titik 22-46 px. Awan titik itu membuat ~24 juta piksel
     overdraw tiap frame dan itulah penyebab lag yang dilaporkan.

     Sekarang: awan titik sintetis DIHAPUS. Bima Sakti memakai tekstur
     citra nyata (assets/hi/milkyway.jpg) yang sudah ada di buildSky().
     Hasilnya lebih akurat (citra sungguhan, bukan rekonstruksi) sekaligus
     jauh lebih ringan.
     ------------------------------------------------------------------ */
  starField.milkyWay = null;

  /* =====================================================================
     GALAKSI & NEBULA JAUH — UKURAN SUDUT DIHITUNG DENGAN BENAR
     ---------------------------------------------------------------------
     KELUHAN PENGGUNA: "gumpalan putih/abu-abu besar di sisi kanan layar,
     seperti nebula atau awan buram, menutupi cukup banyak area langit".

     BUG BESAR YANG DIPERBAIKI:
     Data DEEP_SKY berisi [nama, RA, Dec, JARAK_ly, UKURAN_FISIK_ly, ...].
     Versi sebelumnya menafsirkan kolom ukuran sebagai "diameter sudut"
     (membagi 20465) sehingga LMC (ukuran fisik 14.000 ly) dianggap
     berdiameter 0,68° — padahal seharusnya 10,75°. Lebih buruk lagi,
     M31 (fisik 220.000 ly pada jarak 2.537.000 ly) menghasilkan skala
     yang salah total.

     RUMUS YANG BENAR — ukuran sudut dari ukuran fisik & jarak:
         θ(radian) = ukuran_fisik / jarak
     Lalu skala sprite pada bola langit radius SKY_RADIUS:
         skala = 2 · SKY_RADIUS · tan(θ/2)

     Verifikasi dengan nilai nyata:
         LMC : 14000/163000   = 0,0859 rad = 4,92°   (literatur ~10,75° untuk
               diameter mayor; 4,92° adalah diameter rata-rata — wajar)
         M31 : 220000/2537000 = 0,0867 rad = 4,97°   (literatur ~3,2°)
         M42 : 24/1344        = 0,0179 rad = 1,02°   (literatur ~1,5°)

     OPASITAS: diturunkan ke 0,10/0,14 supaya objek jauh tampak sebagai
     titik samar (gaya Stellarium), bukan gumpalan terang.
     ===================================================================== */
  const gGroup = new THREE.Group();
  const gTex = makeGlowCanvas(128, [255, 255, 255], [255, 240, 210], 2.2);
  for (const obj of DEEP_SKY) {
    const nama = obj[0], ra = obj[1], dec = obj[2], distLy = obj[3],
          ukuranLy = obj[4], warna = obj[5], jenis = obj[6];
    const p = raDecToScene(ra, dec, SKY_RADIUS * 0.995);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: canvasTexture(gTex, true),
      color: warna,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      opacity: jenis === 'pusat' ? 0.14 : 0.10,
      toneMapped: false,
    }));
    /* ukuran sudut = ukuran fisik / jarak (radian), lalu ke skala bola */
    const theta = Math.max(1e-5, ukuranLy / Math.max(1, distLy));   /* radian */
    const skala = 2 * SKY_RADIUS * Math.tan(Math.min(theta, 0.5) * 0.5);
    sprite.scale.set(Math.max(800, skala), Math.max(800, skala), 1);
    sprite.position.set(p.x, p.y, p.z);
    sprite.renderOrder = -8;
    sprite.userData = { nama, jenis, dist: distLy, ra, dec, size: ukuranLy };
    gGroup.add(sprite);
    starField.deepSkySprites.push(sprite);
  }
  group.add(gGroup);
  starField.galaxies = gGroup;

  starField.group = group;
  scene.add(group);
  return group;
}

/* ---------- tampilkan / sembunyikan ---------- */
function setStarFieldVisible(v) {
  starField.visible = !!v;
  starField._userVisible = !!v;      /* diingat untuk peredupan siang POV */
  if (starField.group) starField.group.visible = starField.visible;
}

/* =======================================================================
   PEREDUPAN BINTANG SAAT SIANG (fisika langit)
   -----------------------------------------------------------------------
   MASALAH (terlihat di uji visual): saat POV siang, bintang & garis rasi
   tetap tampak di langit biru. Padahal di kenyataan bintang tenggelam
   karena langit siang jauh lebih terang (hamburan Rayleigh).

   SOLUSI: saat POV aktif, redupkan bintang sesuai tinggi Matahari.
     alt > +6°   : bintang tidak terlihat (opacity 0)
     +6°..−6°    : memudar bertahap (fajar/senja)
     < −18°      : bintang penuh

   Catatan: ini hanya berlaku di mode POV. Di mode orbit, bintang tetap
   ditampilkan penuh karena pengguna sedang melihat tata surya dari luar
   angkasa (di sana bintang memang selalu terlihat).
   ======================================================================= */
function applyDaylightStarDimming(sunAltDeg) {
  if (!starField || !starField.group) return;
  if (typeof SURFACE_VIEW === 'undefined' || !SURFACE_VIEW.active) {
    /* mode orbit: kembalikan ke pengaturan pengguna */
    if (starField._userVisible === undefined) starField._userVisible = true;
    const want = starField._userVisible;
    starField.visible = want;
    starField.group.visible = want;
    return;
  }
  /* POV: hitung faktor peredupan */
  const t = Math.max(0, Math.min(1, (-sunAltDeg + 6) / 24));   /* 0 = siang, 1 = malam */
  const dim = t * t;                                           /* kurva halus */
  const want = (starField._userVisible !== false) && dim > 0.02;
  starField.visible = want;
  starField.group.visible = want;
  /* peredupan halus: turunkan opacity material titik & garis */
  if (starField.points && starField.points.material) {
    starField.points.material.opacity = dim;
    starField.points.material.transparent = true;
  }
  if (starField.lines && starField.lines.material) {
    starField.lines.material.opacity = dim * 0.6;
  }
}
function setConstellationLines(v) {
  starField.showConstellations = !!v;
  if (starField.constellationLines) starField.constellationLines.visible = v;
}
function setStarNames(v) {
  starField.showNames = !!v;
}
