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
  /* mag 0 -> 7.6px ; mag 6.5 -> 1.5px */
  return Math.max(1.5, 7.6 - mag * 0.94);
}
function starAlpha(mag) {
  return Math.max(0.30, Math.min(1.0, 1.30 - mag * 0.135));
}

/* ---------- konversi RA/Dec -> vektor satuan ----------
   Hasil: kerangka ekuatorial kartesian (x ke RA=0h, z ke kutub langit).
   Lalu dipetakan ke orientasi scene (y scene = atas = kutub langit). */
function raDecToScene(raHours, decDeg, radius) {
  const ra = raHours * 15 * DEG;
  const dec = decDeg * DEG;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  /* x -> x, z(equatorial) -> y(scene, atas), y -> -z */
  return {
    x: x * radius,
    y: z * radius,
    z: -y * radius,
  };
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
       bukan titik-titik terpisah. */
    const center = Math.max(0, 1 - r / (R_GAL * 0.35));
    col[i * 3] = (0.72 + center * 0.28 + rnd() * 0.05) * 0.95;
    col[i * 3 + 1] = (0.70 + center * 0.20 + rnd() * 0.04) * 0.95;
    col[i * 3 + 2] = (0.68 + (1 - center) * 0.24 + rnd() * 0.04) * 0.95;

    /* Ukuran titik: cukup besar supaya titik-titik saling tumpang tindih
       dan membentuk pita kabut yang berkesinambungan */
    sizeArr[i] = 22 + rnd() * 46;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizeArr, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uOpacity: { value: 0.9 },
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
      'void main() {',
      '  vec2 d = gl_PointCoord - vec2(0.5);',
      '  float r2 = dot(d, d);',
      '  if (r2 > 0.25) discard;',
      '  float a = 1.0 - r2 * 4.0;',
      '  a = a * a;',
      '  gl_FragColor = vec4(vCol, a * uOpacity);',
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
    /* s = [nama, bayer, con, mag, x, y, z, r, g, b, spect]
       x,y,z dari HYG adalah kartesian ekuatorial (parsec). Ubah ke RA/Dec
       lalu ke bola langit supaya sudutnya persis. */
    const s = all[i];
    const hx = s[4], hy = s[5], hz = s[6];
    const d = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
    /* arah satuan ekuatorial */
    const ux = hx / d, uy = hy / d, uz = hz / d;
    /* petakan ke orientasi scene: ekuatorial z -> scene y (atas) */
    pos[i * 3] = ux * SKY_RADIUS;
    pos[i * 3 + 1] = uz * SKY_RADIUS;
    pos[i * 3 + 2] = -uy * SKY_RADIUS;

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
      'void main() {',
      '  vec2 d = gl_PointCoord - vec2(0.5);',
      '  float r = length(d) * 2.0;',
      '  if (r > 1.0) discard;',
      /* inti tajam + halo lembut: meniru titik cahaya bintang */
      '  float core = smoothstep(1.0, 0.0, r * 2.4);',
      '  float halo = pow(1.0 - r, 2.6) * 0.42;',
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
    starField.labeled.push({
      nama: nama, bayer: s[1], con: s[2], mag: s[3],
      distLy: s[4] * 0 + Math.sqrt(s[4] * s[4] + s[5] * s[5] + s[6] * s[6]) * 3.261563777,
      spect: s[10],
      x: (hx / d) * SKY_RADIUS,
      y: (hz / d) * SKY_RADIUS,
      z: (-hy / d) * SKY_RADIUS,
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
        const da = Math.sqrt(a[4] ** 2 + a[5] ** 2 + a[6] ** 2) || 1;
        const db = Math.sqrt(b[4] ** 2 + b[5] ** 2 + b[6] ** 2) || 1;
        lpos.push(a[4] / da * SKY_RADIUS, a[6] / da * SKY_RADIUS, -a[5] / da * SKY_RADIUS);
        lpos.push(b[4] / db * SKY_RADIUS, b[6] / db * SKY_RADIUS, -b[5] / db * SKY_RADIUS);
      }
    }
  }
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lpos), 3));
  const lmat = new THREE.LineBasicMaterial({
    color: 0x6a94d4, transparent: true, opacity: 0.30,
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

  /* --- galaksi & nebula jauh --- */
  const gGroup = new THREE.Group();
  const gTex = makeGlowCanvas(128, [255, 255, 255], [255, 240, 210], 2.2);
  for (const obj of DEEP_SKY) {
    const nama = obj[0], ra = obj[1], dec = obj[2], dist = obj[3],
          size = obj[4], warna = obj[5], jenis = obj[6];
    const p = raDecToScene(ra, dec, SKY_RADIUS * 0.995);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: canvasTexture(gTex, true),
      color: warna,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      opacity: jenis === 'pusat' ? 0.42 : 0.32,
      toneMapped: false,
    }));
    /* ukuran tampak: objek besar (galaksi, nebula luas) tampak lebih besar */
    const sc = Math.max(1, Math.log10(size + 1)) * 42000;
    sprite.scale.set(sc, sc, 1);
    sprite.position.set(p.x, p.y, p.z);
    sprite.renderOrder = -8;
    sprite.userData = { nama: nama, jenis: jenis, dist: dist, ra: ra, dec: dec, size: size };
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
  if (starField.group) starField.group.visible = starField.visible;
}
function setConstellationLines(v) {
  starField.showConstellations = !!v;
  if (starField.constellationLines) starField.constellationLines.visible = v;
}
function setStarNames(v) {
  starField.showNames = !!v;
}
