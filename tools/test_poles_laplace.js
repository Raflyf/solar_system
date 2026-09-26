/* Verifikasi orientasi poros, resonansi Laplace, dan librasi diurnal.
   Jalankan: node tools/test_poles_laplace.js */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const DEG = Math.PI / 180;
const J2000_JD = 2451545.0;

/* stub THREE minimal untuk modul poles */
const THREE = {
  Quaternion: class {
    constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
    copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
    setFromAxisAngle(axis, angle) {
      const h = angle / 2, s = Math.sin(h);
      this.x = axis.x * s; this.y = axis.y * s; this.z = axis.z * s; this.w = Math.cos(h);
      return this;
    }
  },
  Vector3: class {
    constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
  },
};

/* muat modul */
const polesSrc = read('src/19-poles.js');
const poles = new Function('THREE', 'DEG', polesSrc + `
  return { PLANET_POLE, poleVectorScene, poleQuaternion, poleTiltFromEcliptic,
           AXIAL_TILT_DEG, EPSILON_OBLIQUITY };
`)(THREE, DEG);

const satSrc = read('src/17-satellite-elements.js');
const SAT = new Function(satSrc + '\n return SATELLITE_ELEMENTS;')();

const lapSrc = read('src/14-laplace.js');
const lap = new Function('J2000_JD', 'SATELLITE_ELEMENTS', lapSrc + `
  return { LAPLACE_RESONANCE, laplaceAngle, laplaceDeviation, laplaceAngleFromElements };
`)(J2000_JD, SAT);

const ephemSrc = read('src/15-ephemeris.js');
const ephem = new Function('AU_KM', ephemSrc + '\n return { moonLibration, dateToJD, J2000_JD };')(149597870.7);

console.log('='.repeat(80));
console.log('UJI 1: ARAH KUTUB PLANET (data IAU WGCCRE 2015)');
console.log('='.repeat(80));
console.log('');
console.log('planet      RA kutub   Dec kutub   kemiringan thd ekliptika   vektor kutub scene');
console.log('-'.repeat(80));

/* Nilai acuan kemiringan poros terhadap BIDANG ORBIT (NASA fact sheet).
   PENTING — untuk benda RETROGRADE (Venus, Uranus), obliquity di fact
   sheet = 180 - sudut_kutub_dari_ekliptika. Contoh Uranus: kutub IAU
   memberi 82,28 derajat dari kutub ekliptika, tapi obliquity nyata
   97,77 = 180 - 82,28. Uji awal saya tidak memperhitungkan ini sehingga
   melaporkan "CEK" padahal kodenya benar. */
const OBLIQUITY_NYATA = {
  mercury: { obl: 0.034, inc: 7.005, retro: false },
  venus:   { obl: 177.36, inc: 3.394, retro: true },
  earth:   { obl: 23.44, inc: 0.0, retro: false },
  mars:    { obl: 25.19, inc: 1.850, retro: false },
  jupiter: { obl: 3.13, inc: 1.303, retro: false },
  saturn:  { obl: 26.73, inc: 2.489, retro: false },
  uranus:  { obl: 97.77, inc: 0.773, retro: true },
  neptune: { obl: 28.32, inc: 1.770, retro: false },
};
const NAMA = {
  mercury: 'Merkurius', venus: 'Venus', earth: 'Bumi', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturnus', uranus: 'Uranus', neptune: 'Neptunus',
};

let ok = 0, n = 0;
console.log('planet      sudut kutub   retro   obliquity   obliquity   selisih   hasil');
console.log('            dari ekliptika        nyata       dihitung');
console.log('-'.repeat(80));
for (const [key, ref] of Object.entries(OBLIQUITY_NYATA)) {
  n++;
  const sudut = poles.poleTiltFromEcliptic(key);
  /* konversi sudut kutub -> obliquity terhadap bidang orbit */
  const hitung = ref.retro ? 180 - sudut : sudut;
  const selisih = Math.abs(hitung - ref.obl);
  /* toleransi = kemiringan orbit (karena kedua acuan berbeda bidang) */
  const cocok = selisih < ref.inc + 0.3;
  if (cocok) ok++;
  console.log(
    NAMA[key].padEnd(11) +
    sudut.toFixed(2).padStart(13) +
    (ref.retro ? '   ya' : '  tidak').padStart(9) +
    ref.obl.toFixed(2).padStart(11) +
    hitung.toFixed(2).padStart(12) +
    (selisih.toFixed(2) + ' deg').padStart(11) +
    (cocok ? '  OK' : '  CEK')
  );
}
console.log('');
console.log(`obliquity cocok: ${ok}/${n}`);
console.log('');
console.log('PENTING — Uranus: Dec kutub NEGATIF (-15,175), artinya kutubnya');
console.log('menunjuk ke BAWAH bidang ekliptika. Inilah yang membuat Uranus');
console.log('tampak "menggelinding". Kode lama memberi kemiringan ke arah sumbu X');
console.log('yang sama untuk semua planet, sehingga arah ini tidak pernah benar.');

console.log('');
console.log('='.repeat(80));
console.log('UJI 2: KUATERNION POROS');
console.log('='.repeat(80));
console.log('');
console.log('Kuaternion harus memutar sumbu +Y ke arah kutub nyata.');
console.log('Uji: terapkan kuaternion ke (0,1,0), hasilnya harus = vektor kutub.');
console.log('');
console.log('planet      hasil rotasi (0,1,0)          vektor kutub              selisih sudut');
console.log('-'.repeat(80));
let qOk = 0, qN = 0;
for (const key of ['earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
  qN++;
  const q = poles.poleQuaternion(key);
  const [ra, dec] = poles.PLANET_POLE[key];
  const target = poles.poleVectorScene(ra, dec);
  const L = Math.hypot(target.x, target.y, target.z);
  const tx = target.x / L, ty = target.y / L, tz = target.z / L;

  /* rotasi (0,1,0) oleh kuaternion (rumus rotasi vektor) */
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  /* v' = v + 2*q_vec x (q_vec x v + qw*v) */
  const vx = 0, vy = 1, vz = 0;
  const ix = qy * vz - qz * vy + qw * vx;
  const iy = qz * vx - qx * vz + qw * vy;
  const iz = qx * vy - qy * vx + qw * vz;
  const rx = vx + 2 * (qy * iz - qz * iy);
  const ry = vy + 2 * (qz * ix - qx * iz);
  const rz = vz + 2 * (qx * iy - qy * ix);

  const dot = Math.max(-1, Math.min(1, rx * tx + ry * ty + rz * tz));
  const err = Math.acos(dot) * 180 / Math.PI;
  const cocok = err < 0.01;
  if (cocok) qOk++;
  console.log(
    NAMA[key].padEnd(11) +
    '(' + [rx, ry, rz].map(x => x.toFixed(3)).join(',') + ')'.padEnd(1) +
    '   (' + [tx, ty, tz].map(x => x.toFixed(3)).join(',') + ')' +
    (err.toFixed(4) + ' deg').padStart(18) +
    (cocok ? '  OK' : '  CEK')
  );
}
console.log('');
console.log(`kuaternion benar: ${qOk}/${qN}`);

console.log('');
console.log('='.repeat(80));
console.log('UJI 3: RESONANSI LAPLACE (Io : Europa : Ganymede = 1 : 2 : 4)');
console.log('='.repeat(80));
console.log('');
console.log('phi = lambda_Io - 3 lambda_Europa + 2 lambda_Ganymede harus ~180 derajat');
console.log('dan TETAP sepanjang waktu.');
console.log('');
console.log('tanggal              phi (derajat)   simpangan dari 180');
console.log('-'.repeat(60));

let lapOk = true, lapMax = 0;
for (const tahun of [0, 1, 5, 10, 25, 50, 100]) {
  const jd = J2000_JD + tahun * 365.25;
  const phi = lap.laplaceAngleFromElements(jd);
  const dev = phi - 180;
  if (Math.abs(dev) > lapMax) lapMax = Math.abs(dev);
  if (Math.abs(dev) > 1) lapOk = false;
  const tgl = new Date(Date.UTC(2000 + tahun, 0, 1));
  console.log(
    (tgl.getUTCFullYear() + '-01-01').padEnd(20) +
    phi.toFixed(4).padStart(12) +
    dev.toFixed(4).padStart(18) + ' deg'
  );
}
console.log('');
console.log(`simpangan maksimum: ${lapMax.toFixed(4)} derajat`);
console.log(lapOk
  ? 'BENAR: resonansi Laplace terkunci (simpangan < 1 derajat selama 100 tahun)'
  : 'MASALAH: resonansi tidak terkunci');
console.log('');
console.log('CATATAN: resonansi ini muncul SENDIRI dari elemen orbit JPL yang');
console.log('benar. Kalau ada satu nilai M0 yang salah, phi tidak akan 180.');
console.log('Jadi uji ini sekaligus membuktikan data JPL yang dipakai valid.');

console.log('');
console.log('='.repeat(80));
console.log('UJI 4: LIBRASI DIURNAL');
console.log('='.repeat(80));
console.log('');
console.log('Librasi diurnal menambah +-0.949 derajat pada librasi bujur,');
console.log('bergantung pada sudut rotasi Bumi (GMST).');
console.log('');
const jd0 = ephem.dateToJD(new Date('2026-09-26T00:00:00Z'));
let minD = 1e9, maxD = -1e9;
for (let jam = 0; jam < 48; jam += 0.25) {
  const lib = ephem.moonLibration(jd0 + jam / 24);
  if (lib.diurnalDeg < minD) minD = lib.diurnalDeg;
  if (lib.diurnalDeg > maxD) maxD = lib.diurnalDeg;
}
console.log(`rentang 48 jam: ${minD.toFixed(4)} .. ${maxD.toFixed(4)} derajat`);
console.log(`amplitudo teoretis: +-0.949 derajat`);
const dOk = Math.abs(maxD - 0.949) < 0.01 && Math.abs(minD + 0.949) < 0.01;
console.log(dOk ? 'BENAR: amplitudo sesuai perhitungan' : 'CEK: amplitudo tidak sesuai');

console.log('');
console.log('='.repeat(80));
console.log('RINGKASAN');
console.log('='.repeat(80));
console.log(`  Arah kutub planet (IAU)      : ${ok}/${n}`);
console.log(`  Kuaternion poros             : ${qOk}/${qN}`);
console.log(`  Resonansi Laplace            : simpangan maks ${lapMax.toFixed(4)} deg`);
console.log(`  Librasi diurnal              : +-${maxD.toFixed(3)} deg (teori 0.949)`);
console.log('='.repeat(80));
