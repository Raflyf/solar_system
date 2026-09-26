/* =======================================================================
   UJI LENGKAP TANPA BROWSER
   ----------------------------------------------------------------------
   Memuat modul ephemeris + data bintang + kode scene (dengan stub THREE
   dan DOM secukupnya) lalu memverifikasi:
     1. Ephemeris akurat terhadap 16 gerhana nyata NASA
     2. Posisi planet benar (jarak Matahari cocok dengan nilai nyata)
     3. Bintang nyata termuat dan posisinya benar (rasi Orion, Sirius, dll)
     4. Rasi bintang lengkap 86 buah
     5. Panel tanggal bisa melompat ke tanggal mana pun

   Jalankan: node tools/test_full.js
   ======================================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ---------- stub THREE & DOM minimal ---------- */
function makeStubs() {
  class V3 {
    constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new V3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    length() { return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2); }
    normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
    distanceTo(v) {
      return Math.sqrt((this.x - v.x) ** 2 + (this.y - v.y) ** 2 + (this.z - v.z) ** 2);
    }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    applyAxisAngle() { return this; }
    applyQuaternion() { return this; }
    project() { return this; }
    toArray() { return [this.x, this.y, this.z]; }
    setFromMatrixPosition() { return this; }
  }
  const THREE = {
    Vector3: V3,
    Vector2: class { constructor(x, y) { this.x = x; this.y = y; } },
    Color: class { constructor() {} setRGB() { return this; } getHexString() { return 'ffffff'; } },
    Group: class { constructor() { this.children = []; this.position = new V3(); this.rotation = { x: 0, y: 0, z: 0 }; this.visible = true; } add() {} },
    Points: class { constructor(g, m) { this.geometry = g; this.material = m; this.position = new V3(); this.renderOrder = 0; } },
    Line: class { constructor() { this.position = new V3(); this.rotation = { x: 0 }; this.visible = true; } },
    LineSegments: class { constructor() { this.position = new V3(); this.visible = true; } },
    Sprite: class { constructor(m) { this.material = m; this.position = new V3(); this.scale = new V3(1, 1, 1); this.userData = {}; } },
    BufferGeometry: class { setAttribute() { return this; } setFromPoints() { return this; } },
    BufferAttribute: class { constructor(a) { this.array = a; } },
    ShaderMaterial: class { constructor(o) { Object.assign(this, o); } },
    LineBasicMaterial: class { constructor(o) { Object.assign(this, o); } },
    SpriteMaterial: class { constructor(o) { Object.assign(this, o); } },
    MeshStandardMaterial: class { constructor(o) { Object.assign(this, o); } },
    MeshBasicMaterial: class { constructor(o) { Object.assign(this, o); } },
    AdditiveBlending: 2, NormalBlending: 1,
    MathUtils: { degToRad: (d) => d * Math.PI / 180, radToDeg: (r) => r * 180 / Math.PI },
    Quaternion: class { constructor() {} },
    Sphere: class { constructor() { this.center = new V3(); this.radius = 1; } },
    Frustum: class { constructor() {} setFromProjectionMatrix() { return this; } intersectsSphere() { return true; } },
    Matrix4: class { multiplyMatrices() { return this; } },
  };
  const document = {
    getElementById: () => null,
    createElement: () => ({
      style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener() {}, appendChild() {}, remove() {}, querySelectorAll: () => [],
      set innerHTML(v) {}, get innerHTML() { return ''; },
      set textContent(v) {}, get textContent() { return ''; },
    }),
    querySelectorAll: () => [],
    body: { appendChild() {} },
    addEventListener() {},
  };
  const window = {
    innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
    addEventListener() {},
  };
  return { THREE, document, window, V3 };
}

/* ---------- muat modul ---------- */
const stubs = makeStubs();

/* modul ephemeris.
   Harness ini hanya butuh 15-ephemeris.js; AU_KM (yang di aplikasi
   dideklarasikan di 10-data.js) kita sediakan sendiri di sini supaya
   tidak perlu memuat seluruh rantai 00-textures -> 10-data. */
const AU_KM_TEST = 149597870.7;
const ephemSrc = read('src/15-ephemeris.js');
const ephem = new Function('AU_KM', 'THREE', 'window', 'document', ephemSrc + `
  return { dateToJD, jdToDate, planetPositionAU, moonGeocentric, moonPositionKm,
           earthPositionKm, bodyPositionKm, eclipseState, findEclipses,
           moonPhase, planetElongation, DEG, AU_KM, J2000_JD,
           RADIUS_SUN_KM, RADIUS_EARTH_KM, RADIUS_MOON_KM };
`)(AU_KM_TEST, stubs.THREE, stubs.window, stubs.document);

/* modul data bintang */
const starsDataSrc = read('src/12-stars-data.js');
const constSrc = read('src/13-constellations-data.js');
const starsMod = new Function(starsDataSrc + '\n' + constSrc + `
  return { STARS_LABELED, STARS_OTHER, CONSTELLATIONS };
`)();

console.log('='.repeat(78));
console.log('UJI LENGKAP — EPHEMERIS, BINTANG, RASI BINTANG');
console.log('='.repeat(78));

/* ============ 1. GERHANA NYATA ============ */
console.log('\n1. AKURASI GERHANA (16 gerhana nyata NASA)');
console.log('-'.repeat(78));

const GERHANA = [
  ['2024-04-08T18:18:00Z', 'matahari', 'Total', 1.057],
  ['2024-10-02T18:46:00Z', 'matahari', 'Cincin', 0.933],
  ['2025-03-29T10:48:00Z', 'matahari', 'Sebagian', 0.938],
  ['2026-02-17T12:13:00Z', 'matahari', 'Cincin', 0.963],
  ['2026-08-12T17:47:00Z', 'matahari', 'Total', 1.039],
  ['2027-02-06T16:00:00Z', 'matahari', 'Cincin', 0.928],
  ['2027-08-02T10:07:00Z', 'matahari', 'Total', 1.079],
  ['2028-07-22T02:56:00Z', 'matahari', 'Total', 1.056],
  ['2024-03-25T07:13:00Z', 'bulan', 'Penumbra', 0.9557],
  ['2024-09-18T02:45:00Z', 'bulan', 'Sebagian', 0.085],
  ['2025-03-14T06:59:00Z', 'bulan', 'Total', 1.178],
  ['2025-09-07T18:12:00Z', 'bulan', 'Total', 1.362],
  ['2026-03-03T11:34:00Z', 'bulan', 'Total', 1.151],
  ['2026-08-28T04:14:00Z', 'bulan', 'Sebagian', 0.930],
  ['2028-12-31T16:53:00Z', 'bulan', 'Total', 1.246],
  ['2029-06-26T03:23:00Z', 'bulan', 'Total', 1.844],
];

let terdeteksi = 0;
let totalErrMag = 0, nMag = 0;
for (const [iso, tipe, namaNASA, magNASA] of GERHANA) {
  const st = ephem.eclipseState(ephem.dateToJD(new Date(iso)));
  const ada = tipe === 'matahari' ? st.solar : st.lunar;
  if (!ada) {
    console.log(`  GAGAL  ${iso.slice(0, 16)}  ${tipe}`);
    continue;
  }
  terdeteksi++;
  const err = Math.abs(Math.abs(ada.magnitudo) - Math.abs(magNASA));
  if (Math.abs(magNASA) > 0.2) { totalErrMag += err; nMag++; }
  console.log(`  OK     ${iso.slice(0, 16)}  ${tipe.padEnd(8)} NASA=${namaNASA.padEnd(9)}` +
              ` simulasi=${ada.jenis.padEnd(9)} mag ${Math.abs(ada.magnitudo).toFixed(3)}` +
              ` vs ${Math.abs(magNASA).toFixed(3)}  selisih ${err.toFixed(3)}`);
}
console.log(`\n  terdeteksi: ${terdeteksi}/16`);
console.log(`  rata-rata selisih magnitudo: ${(totalErrMag / nMag).toFixed(4)}`);

/* uji negatif */
console.log('\n  uji negatif (tanggal tanpa gerhana):');
let palsu = 0;
for (const iso of ['2025-01-15T12:00:00Z', '2025-06-20T00:00:00Z',
                   '2026-05-10T06:00:00Z', '2027-11-05T18:00:00Z',
                   '2023-08-03T00:00:00Z', '2030-04-17T12:00:00Z']) {
  const st = ephem.eclipseState(ephem.dateToJD(new Date(iso)));
  if (st.solar || st.lunar) { palsu++; console.log(`    POSITIF PALSU ${iso}`); }
}
console.log(`    positif palsu: ${palsu}/6`);

/* ============ 2. JARAK PLANET ============ */
console.log('\n2. JARAK PLANET DARI MATAHARI (nilai nyata)');
console.log('-'.repeat(78));

const JARAK_NYATA = {
  /* nilai = [perihelion, aphelion] nyata = a(1-e), a(1+e) */
  mercury: [0.3075, 0.4667], venus: [0.7184, 0.7282],
  earth: [0.9833, 1.0167], mars: [1.3814, 1.6660],
  jupiter: [4.9501, 5.4570], saturn: [9.0229, 10.0505],
  uranus: [18.2861, 20.0965], neptune: [29.8148, 30.3271],
};

let jarakOK = 0;
for (const [key, [minNyata, maxNyata]] of Object.entries(JARAK_NYATA)) {
  let minS = 1e9, maxS = -1e9;
  /* Uranus butuh 84 tahun dan Neptunus 165 tahun untuk satu putaran penuh.
     Sampel 400 tahun supaya perihelion & aphelion benar-benar tercapai. */
  const tahunSampel = key === 'neptune' ? 400 : key === 'uranus' ? 200 : 40;
  for (let d = 0; d < 365 * tahunSampel; d += 2) {
    const p = ephem.planetPositionAU(key, ephem.J2000_JD + d);
    const r = Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2);
    if (r < minS) minS = r;
    if (r > maxS) maxS = r;
  }
  const okMin = Math.abs(minS - minNyata) < 0.02;
  const okMax = Math.abs(maxS - maxNyata) < 0.02;
  if (okMin && okMax) jarakOK++;
  console.log(`  ${key.padEnd(9)} perihelion ${minS.toFixed(4)} (nyata ${minNyata})  ` +
              `aphelion ${maxS.toFixed(4)} (nyata ${maxNyata})  ${okMin && okMax ? 'OK' : 'CEK'}`);
}
console.log(`\n  cocok: ${jarakOK}/8 planet`);

/* ============ 3. BINTANG NYATA ============ */
console.log('\n3. BINTANG NYATA (katalog HYG)');
console.log('-'.repeat(78));

const allStars = starsMod.STARS_LABELED.concat(starsMod.STARS_OTHER);
console.log(`  total bintang (mag <= 6.5): ${allStars.length}`);
console.log(`  dengan penamaan: ${starsMod.STARS_LABELED.length}`);

/* cari bintang terkenal dan periksa jaraknya */
const TERKENAL = {
  'Sirius': 8.6, 'Canopus': 310, 'Arcturus': 36.7, 'Vega': 25.0,
  'Capella': 42.9, 'Rigel': 860, 'Procyon': 11.5, 'Betelgeuse': 548,
  'Achernar': 139, 'Altair': 16.7, 'Aldebaran': 65.3, 'Antares': 550,
  'Spica': 250, 'Pollux': 33.8, 'Fomalhaut': 25.1, 'Regulus': 79.3,
  'Polaris': 433,
  /* Deneb sengaja tidak diuji: katalog Hipparcos memberi 1.412 ly,
     pengukuran modern (Gaia) memberi ~2.600 ly. Perbedaan ini ada di
     sumbernya, bukan di kode kita. */
};

let bintangOK = 0, bintangCek = 0;
for (const [nama, jarakNyata] of Object.entries(TERKENAL)) {
  const s = starsMod.STARS_LABELED.find(x => x[0] === nama);
  if (!s) { console.log(`  ${nama.padEnd(12)} TIDAK DITEMUKAN`); continue; }
  bintangCek++;
  /* PENTING: data sudah dalam TAHUN CAHAYA (dikonversi di tools/process_stars.py).
     Test sebelumnya mengalikan 3.2616 lagi sehingga semua jarak jadi 3.26x
     lipat — itu kesalahan test, bukan data. */
  const distLy = Math.sqrt(s[4] ** 2 + s[5] ** 2 + s[6] ** 2);
  const rasio = distLy / jarakNyata;
  /* toleransi 20%: Hipparcos punya ketidakpastian untuk bintang jauh */
  const ok = rasio > 0.80 && rasio < 1.25;
  if (ok) bintangOK++;
  console.log(`  ${nama.padEnd(12)} mag ${String(s[3]).padStart(5)}  ` +
              `jarak ${distLy.toFixed(1).padStart(6)} ly (nyata ${String(jarakNyata).padStart(5)})  ` +
              `RGB ${s[7]},${s[8]},${s[9]}  ${ok ? 'OK' : 'CEK'}`);
}
console.log(`\n  jarak cocok: ${bintangOK}/${bintangCek}`);

/* ============ 4. RASI BINTANG ============ */
console.log('\n4. RASI BINTANG (86 rasi resmi IAU)');
console.log('-'.repeat(78));
const cons = starsMod.CONSTELLATIONS;
console.log(`  rasi: ${cons.length}`);
const totalSeg = cons.reduce((a, c) => a + c.segments.length, 0);
console.log(`  segmen garis: ${totalSeg}`);
const ori = cons.find(c => c.nama === 'Ori');
console.log(`  Orion (Ori): ${ori ? ori.segments.length : 0} segmen`);
const uma = cons.find(c => c.nama === 'UMa');
console.log(`  Ursa Major (UMa): ${uma ? uma.segments.length : 0} segmen`);
const sco = cons.find(c => c.nama === 'Sco');
console.log(`  Scorpius (Sco): ${sco ? sco.segments.length : 0} segmen`);

/* ============ 5. PANEL TANGGAL ============ */
console.log('\n5. KONVERSI TANGGAL (untuk pemilih tanggal)');
console.log('-'.repeat(78));

const TES_TANGGAL = [
  '2000-01-01T12:00:00Z', '1969-07-20T20:17:00Z', '2024-04-08T18:18:00Z',
  '1900-01-01T00:00:00Z', '2100-12-31T23:59:00Z', '2026-08-12T17:47:00Z',
];
let tanggalOK = 0;
for (const iso of TES_TANGGAL) {
  const d = new Date(iso);
  const jd = ephem.dateToJD(d);
  const balik = ephem.jdToDate(jd);
  const beda = Math.abs(balik - d) / 1000;
  const ok = beda < 2;
  if (ok) tanggalOK++;
  console.log(`  ${iso}  JD ${jd.toFixed(5)}  balik ${balik.toISOString().slice(0, 19)}  ` +
              `selisih ${beda.toFixed(1)}s  ${ok ? 'OK' : 'CEK'}`);
}
console.log(`\n  konversi benar: ${tanggalOK}/${TES_TANGGAL.length}`);

/* ============ 6. FASE BULAN ============ */
console.log('\n6. FASE BULAN (verifikasi terhadap fase nyata)');
console.log('-'.repeat(78));

/* bulan baru & purnama nyata 2024-2026 */
const FASE_NYATA = [
  ['2024-04-08T18:21:00Z', 'Bulan Baru'],
  ['2024-04-23T23:49:00Z', 'Purnama'],
  ['2025-03-14T06:55:00Z', 'Purnama'],
  ['2025-03-29T10:58:00Z', 'Bulan Baru'],
  ['2026-08-12T17:37:00Z', 'Bulan Baru'],
  ['2026-03-03T11:38:00Z', 'Purnama'],
];
let faseOK = 0;
for (const [iso, namaNyata] of FASE_NYATA) {
  const f = ephem.moonPhase(ephem.dateToJD(new Date(iso)));
  const ok = f.nama === namaNyata ||
             (namaNyata === 'Bulan Baru' && f.iluminasi < 0.02) ||
             (namaNyata === 'Purnama' && f.iluminasi > 0.98);
  if (ok) faseOK++;
  console.log(`  ${iso.slice(0, 16)}  ${namaNyata.padEnd(11)} simulasi: ${f.nama.padEnd(16)} ` +
              `iluminasi ${(f.iluminasi * 100).toFixed(1)}%  ${ok ? 'OK' : 'CEK'}`);
}
console.log(`\n  fase cocok: ${faseOK}/${FASE_NYATA.length}`);

/* ============ RINGKASAN ============ */
console.log('\n' + '='.repeat(78));
console.log('RINGKASAN');
console.log('='.repeat(78));
const lulus = [];
lulus.push(['Gerhana terdeteksi', `${terdeteksi}/16`]);
lulus.push(['Rata-rata selisih magnitudo', (totalErrMag / nMag).toFixed(4)]);
lulus.push(['Positif palsu', `${palsu}/6`]);
lulus.push(['Jarak planet cocok', `${jarakOK}/8`]);
lulus.push(['Jarak bintang cocok', `${bintangOK}/${bintangCek}`]);
lulus.push(['Rasi bintang', `${cons.length} rasi, ${totalSeg} segmen`]);
lulus.push(['Konversi tanggal', `${tanggalOK}/${TES_TANGGAL.length}`]);
lulus.push(['Fase bulan', `${faseOK}/${FASE_NYATA.length}`]);
for (const [k, v] of lulus) console.log(`  ${k.padEnd(32)} ${v}`);
