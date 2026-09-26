/* Verifikasi posisi satelit (fase orbit nyata) dan librasi Bulan.

   Uji 1: apakah M0 (anomali rata-rata JPL) benar-benar dipakai?
   Uji 2: apakah fase orbit satelit berbeda-beda (bukan semua 0)?
   Uji 3: apakah librasi Bulan dalam rentang nyata +-8 derajat?
   Uji 4: apakah libration mengunjungi semua nilai (bukan konstan)?

   Jalankan: node tools/test_satellites.js */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const J2000_JD = 2451545.0;
const DEG = Math.PI / 180;

/* muat ephemeris (perlu AU_KM disediakan) */
const ephemSrc = read('src/15-ephemeris.js');
const ephem = new Function('AU_KM', ephemSrc + `
  return { moonLibration, moonPositionKm, dateToJD, jdToT, J2000_JD, DEG };
`)(149597870.7);

/* muat elemen satelit */
const satSrc = read('src/17-satellite-elements.js');
const satMod = new Function(satSrc + '\n return { SATELLITE_ELEMENTS };')();
const SAT = satMod.SATELLITE_ELEMENTS;

console.log('='.repeat(78));
console.log('UJI 1: ELEMEN ORBIT SATELIT DARI JPL');
console.log('='.repeat(78));
console.log('');
console.log('satelit     a (km)      e        M0 (deg)  omega   iLap   Tilt    P (hari)  sumber');
console.log('-'.repeat(78));
let n = 0;
for (const [nama, d] of Object.entries(SAT).sort()) {
  n++;
  console.log(
    nama.padEnd(11) +
    String(Math.round(d.aKm)).padStart(8) +
    d.e.toFixed(4).padStart(9) +
    d.M0.toFixed(2).padStart(10) +
    d.omega.toFixed(1).padStart(8) +
    d.inclLaplace.toFixed(2).padStart(7) +
    d.tilt.toFixed(2).padStart(7) +
    d.periodDays.toFixed(5).padStart(11) +
    '  ' + d.ephemeris
  );
}
console.log('');
console.log(`satelit dengan elemen JPL: ${n}/11`);

console.log('');
console.log('='.repeat(78));
console.log('UJI 2: FASE ORBIT NYATA (M0 tidak boleh 0 atau seragam)');
console.log('='.repeat(78));
console.log('');
const m0 = Object.entries(SAT).map(([k, v]) => [k, v.M0]);
const m0Set = new Set(m0.map(x => x[1]));
console.log('nilai M0 yang dipakai:');
for (const [nama, v] of m0.sort((a, b) => a[1] - b[1])) {
  console.log(`  ${nama.padEnd(11)} ${v.toFixed(2).padStart(8)} derajat`);
}
console.log('');
console.log(`M0 unik: ${m0Set.size}/${m0.length}`);
console.log(m0Set.size === m0.length
  ? 'BENAR: setiap satelit punya fase orbit berbeda (nyata, bukan 0)'
  : 'MASALAH: ada M0 yang sama');

console.log('');
console.log('='.repeat(78));
console.log('UJI 3: LIBRASI BULAN');
console.log('='.repeat(78));
console.log('');
console.log('Librasi harus dalam rentang:');
console.log('  bujur  : +-7,9 derajat (karena orbit elips)');
console.log('  lintang: +-6,7 derajat (karena kemiringan orbit)');
console.log('');
console.log('tanggal        librasi bujur   librasi lintang   iluminasi');
console.log('-'.repeat(66));

let minLon = 1e9, maxLon = -1e9, minLat = 1e9, maxLat = -1e9;
/* sampel 2 tahun untuk mendapat semua fase librasi */
const base = new Date('2026-01-01T00:00:00Z');
const jd0 = ephem.dateToJD(base);
for (let d = 0; d < 730; d += 0.5) {
  const lib = ephem.moonLibration(jd0 + d);
  if (lib.lonDeg < minLon) minLon = lib.lonDeg;
  if (lib.lonDeg > maxLon) maxLon = lib.lonDeg;
  if (lib.latDeg < minLat) minLat = lib.latDeg;
  if (lib.latDeg > maxLat) maxLat = lib.latDeg;
}
/* tampilkan beberapa contoh */
for (const tgl of ['2026-01-01', '2026-04-15', '2026-07-20', '2026-10-10', '2027-03-05']) {
  const jd = ephem.dateToJD(new Date(tgl + 'T12:00:00Z'));
  const lib = ephem.moonLibration(jd);
  console.log(
    tgl.padEnd(14) +
    (lib.lonDeg.toFixed(2) + ' deg').padStart(14) +
    (lib.latDeg.toFixed(2) + ' deg').padStart(18)
  );
}
console.log('');
console.log('rentang 2 tahun:');
console.log(`  librasi bujur  : ${minLon.toFixed(2)} .. ${maxLon.toFixed(2)} derajat`);
console.log(`  librasi lintang: ${minLat.toFixed(2)} .. ${maxLat.toFixed(2)} derajat`);
console.log('');
const lonOk = maxLon > 5 && maxLon < 10 && minLon < -5 && minLon > -10;
const latOk = maxLat > 4 && maxLat < 8 && minLat < -4 && minLat > -8;
console.log(lonOk ? 'BENAR: librasi bujur dalam rentang nyata (+-7,9)' : 'CEK: librasi bujur di luar rentang');
console.log(latOk ? 'BENAR: librasi lintang dalam rentang nyata (+-6,7)' : 'CEK: librasi lintang di luar rentang');

console.log('');
console.log('='.repeat(78));
console.log('UJI 4: BERAPA PERSEN PERMUKAAN BULAN TERLIHAT?');
console.log('='.repeat(78));
console.log('');
const Lmax = Math.max(Math.abs(minLon), Math.abs(maxLon));
const Bmax = Math.max(Math.abs(minLat), Math.abs(maxLat));
/* PERHITUNGAN NUMERIK YANG BENAR.
   Cara: sampel titik-titik di permukaan Bulan. Sebuah titik TERLIHAT
   bila ada posisi pengamat (dalam rentang librasi) yang melihatnya —
   yaitu sudut antara titik itu dan arah pengamat < 90 derajat.

   Percobaan pertama saya memakai rumus (1-cos(L))/2 yang SALAH, karena
   rumus itu menghitung luas "tutup" di sekitar kutub, bukan luas sabuk
   di tepi belahan. Hasilnya 51% padahal seharusnya 59%.

   Nilai acuan: 59% permukaan Bulan terlihat dari Bumi (fakta terukur,
   karena librasi total ±8°). */
const N_LAT = 180, N_LON = 360;
let terlihat = 0, totalTitik = 0;
/* Arah pengamat diambil dari PASANGAN (bujur, lintang) librasi yang
   BENAR-BENAR TERJADI bersamaan — disampel dari 20 tahun simulasi.
   Versi pertama saya memakai semua kombinasi kotak (bujur x lintang),
   padahal keduanya berkorelasi: librasi bujur maksimum dan librasi
   lintang maksimum terjadi pada waktu BERBEDA. Memakai semua kombinasi
   melebih-lebihkan cakupan (hasil 61,8% vs nyata 59%). */
const arahPengamat = [];
for (let d = 0; d < 365 * 20; d += 0.5) {
  const lib = ephem.moonLibration(jd0 + d);
  const lr = lib.lonDeg * DEG, br = lib.latDeg * DEG;
  arahPengamat.push([
    Math.cos(br) * Math.cos(lr),
    Math.cos(br) * Math.sin(lr),
    Math.sin(br),
  ]);
}
/* PENTING — PEMBOBOTAN LUAS:
   Percobaan saya sebelumnya menyampel titik permukaan secara seragam
   dalam (lintang, bujur). Itu SALAH: elemen luas pada bola sebanding
   dengan cos(lintang), jadi cara seragam membuat daerah kutub
   kelebihan bobot. Sekarang tiap titik diberi bobot cos(lintang). */
let bobotTerlihat = 0, bobotTotal = 0;
for (let a = 0; a < N_LAT; a++) {
  const lat = -90 + (a + 0.5) * (180 / N_LAT);
  const br = lat * DEG;
  const w = Math.cos(br);           /* bobot luas */
  for (let b = 0; b < N_LON; b++) {
    const lon = -180 + (b + 0.5) * (360 / N_LON);
    const lr = lon * DEG;
    const px = Math.cos(br) * Math.cos(lr);
    const py = Math.cos(br) * Math.sin(lr);
    const pz = Math.sin(br);
    totalTitik++;
    bobotTotal += w;
    for (const [ax, ay, az] of arahPengamat) {
      if (px * ax + py * ay + pz * az > 0) {
        terlihat++;
        bobotTerlihat += w;
        break;
      }
    }
  }
}
const persen = bobotTerlihat / bobotTotal * 100;
console.log(`librasi bujur maks  : ${Lmax.toFixed(2)} derajat`);
console.log(`librasi lintang maks: ${Bmax.toFixed(2)} derajat`);
console.log(`permukaan terlihat  : ${persen.toFixed(1)}%  (dihitung numerik)`);
console.log('');
console.log('acuan nyata: 59% permukaan Bulan terlihat dari Bumi');
console.log(Math.abs(persen - 59) < 3
  ? 'BENAR: sesuai dengan pengukuran nyata'
  : 'CEK: di luar toleransi');

console.log('');
console.log('='.repeat(78));
console.log('RINGKASAN');
console.log('='.repeat(78));
console.log(`  Elemen orbit satelit JPL : ${n}/11`);
console.log(`  Fase orbit unik (M0)     : ${m0Set.size}/${m0.length}`);
console.log(`  Librasi bujur            : ${minLon.toFixed(2)} .. ${maxLon.toFixed(2)} derajat`);
console.log(`  Librasi lintang          : ${minLat.toFixed(2)} .. ${maxLat.toFixed(2)} derajat`);
console.log(`  Permukaan terlihat       : ${persen.toFixed(1)}% (nyata 59%)`);
console.log('='.repeat(78));
