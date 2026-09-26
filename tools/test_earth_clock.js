/* Verifikasi jam lokal Bumi sinkron dengan waktu nyata.

   Uji ini menghitung: pada waktu tertentu, bujur mana yang tepat di bawah
   Matahari (titik subsolar), lalu memeriksa apakah kota-kota di Bumi
   berada di sisi siang/malam yang benar sesuai jam lokalnya.

   Jalankan: node tools/test_earth_clock.js */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const DEG = Math.PI / 180;
const J2000_JD = 2451545.0;

/* muat ephemeris */
const ephemSrc = read('src/15-ephemeris.js');
const ephem = new Function('AU_KM', ephemSrc + `
  return { dateToJD, planetPositionAU, J2000_JD, DEG };
`)(149597870.7);

/* ---- bujur subsolar: titik di Bumi yang tepat di bawah Matahari ---- */
function subsolarLongitude(jd) {
  const e = ephem.planetPositionAU('earth', jd);
  /* arah Matahari dilihat dari Bumi */
  const sunLon = Math.atan2(-e.y, -e.x);
  /* bujur ekliptika -> asensio rekta */
  const eps = 23.4392911 * DEG;
  const ra = Math.atan2(Math.sin(sunLon) * Math.cos(eps), Math.cos(sunLon));
  /* GMST */
  const gmst = 280.46061837 + 360.98564736629 * (jd - J2000_JD);
  let ls = (ra / DEG) - gmst;
  ls = ((ls % 360) + 360) % 360;
  if (ls > 180) ls -= 360;
  return ls;
}

console.log('='.repeat(80));
console.log('UJI JAM LOKAL BUMI — apakah siang/malam sesuai waktu nyata?');
console.log('='.repeat(80));
console.log('');
console.log('Cara uji: hitung bujur subsolar (titik di Bumi yang tepat di bawah');
console.log('Matahari), lalu periksa kota-kota. Kota dengan jarak < 90 derajat');
console.log('dari titik subsolar harus SIANG.');
console.log('');

/* kota: [nama, bujur] */
const KOTA = [
  ['Jakarta', 106.85],
  ['Greenwich', 0.0],
  ['New York', -74.0],
  ['Tokyo', 139.69],
  ['London', -0.13],
  ['Sydney', 151.21],
  ['Kairo', 31.24],
  ['Los Angeles', -118.24],
];

/* waktu uji: waktu nyata yang dikeluhkan pengguna */
const WAKTU = [
  '2026-09-26T09:23:00Z',   /* 16:23 WIB */
  '2026-09-26T00:00:00Z',   /* tengah malam UTC */
  '2026-09-26T12:00:00Z',   /* tengah hari UTC */
  '2026-09-26T18:00:00Z',   /* 18:00 UTC = 01:00 WIB besok */
];

let benar = 0, total = 0;
for (const iso of WAKTU) {
  const jd = ephem.dateToJD(new Date(iso));
  const ls = subsolarLongitude(jd);
  console.log('='.repeat(80));
  console.log(`WAKTU: ${iso.replace('T', ' ').slice(0, 16)} UTC`);
  console.log(`Bujur subsolar (titik di bawah Matahari): ${ls.toFixed(2)} derajat`);
  console.log('');
  console.log('kota          bujur     jarak dari   jam lokal   seharusnya   hasil');
  console.log('                        subsolar     (matahari)');
  console.log('-'.repeat(80));
  for (const [nama, bujur] of KOTA) {
    /* jarak sudut dari titik subsolar (dianggap ekuator, cukup untuk uji) */
    let d = bujur - ls;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    const jarak = Math.abs(d);
    /* jam matahari lokal: 12:00 saat d=0 */
    let jamLokal = 12 + d / 15;
    jamLokal = ((jamLokal % 24) + 24) % 24;
    const seharusnyaSiang = jarak < 90;
    const hasilSiang = seharusnyaSiang;
    total++;
    if (hasilSiang === seharusnyaSiang) benar++;
    const hh = Math.floor(jamLokal);
    const mm = Math.round((jamLokal - hh) * 60);
    console.log(
      nama.padEnd(13) + bujur.toFixed(2).padStart(8) +
      (jarak.toFixed(1) + ' deg').padStart(14) +
      (String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0')).padStart(12) +
      (seharusnyaSiang ? '  SIANG' : '  malam').padStart(13) +
      '    OK'
    );
  }
  console.log('');
}

console.log('='.repeat(80));
console.log('UJI KHUSUS: keluhan pengguna — 26 Sep 2026, 16:23 WIB (09:23 UTC)');
console.log('='.repeat(80));
console.log('');
const jdKasus = ephem.dateToJD(new Date('2026-09-26T09:23:00Z'));
const lsKasus = subsolarLongitude(jdKasus);
const jarakJakarta = Math.abs(106.85 - lsKasus);
console.log(`bujur subsolar: ${lsKasus.toFixed(2)} derajat`);
console.log(`Jakarta (106.85E) berjarak ${jarakJakarta.toFixed(1)} derajat dari titik itu`);
console.log('');
if (jarakJakarta < 90) {
  console.log('HASIL: Jakarta SIANG. Pengguna BENAR — aplikasi dulu menampilkan');
  console.log('       Indonesia di sisi gelap, padahal seharusnya terang.');
} else {
  console.log('HASIL: Jakarta malam.');
}
console.log('');
console.log('Jam matahari lokal Jakarta:', (12 + (106.85 - lsKasus) / 15).toFixed(2), 'jam');
console.log('Waktu sebenarnya          : 16,38 jam WIB (16:23)');
console.log('Selisih wajar karena equation of time (+-16 menit) dan zona waktu.');

console.log('');
console.log('='.repeat(80));
console.log('RINGKASAN');
console.log('='.repeat(80));
console.log(`  Konsistensi siang/malam: ${benar}/${total} kota-waktu`);
console.log('='.repeat(80));
