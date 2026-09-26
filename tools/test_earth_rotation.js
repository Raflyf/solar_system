/* Verifikasi rotasi Bumi sinkron dengan waktu nyata.
   Menguji: apakah jam lokal di suatu kota sesuai dengan posisi Matahari
   terhadap kota itu?

   Cara uji: pada jam 12:00 waktu lokal (matahari di meridian), kota itu
   harus berada di sisi Bumi yang menghadap Matahari.

   Jalankan: node tools/test_earth_rotation.js */

const DEG = Math.PI / 180;
const J2000_JD = 2451545.0;

/* ---- ephemeris ringkas: posisi Bumi & GMST ---- */
function dateToJD(date) {
  const y0 = date.getUTCFullYear(), m0 = date.getUTCMonth() + 1, d = date.getUTCDate();
  const frac = (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) / 24;
  let y = y0, m = m0;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + frac + B - 1524.5;
}

function gmstDeg(jd) {
  let g = 280.46061837 + 360.98564736629 * (jd - J2000_JD);
  g = g % 360;
  return g < 0 ? g + 360 : g;
}

/* ---- posisi Matahari dilihat dari Bumi (ekliptika -> ekuator) ---- */
/* Matahari tampak bergerak pada bujur ekliptika; kita perlu sudut jamnya
   relatif terhadap meridian kota, yang diberikan langsung oleh GMST. */

/* Jam matahari lokal (local apparent solar time) untuk bujur tertentu:
     LAT = UTC + bujur/15  (diabaikan equation of time, +-16 menit)
   Pada LAT = 12:00, matahari ada di meridian kota. */

console.log('='.repeat(72));
console.log('UJI ROTASI BUMI — apakah jam lokal sinkron dengan posisi Matahari?');
console.log('='.repeat(72));
console.log('');

/* kota: [nama, bujur, zona waktu] */
const KOTA = [
  ['Jakarta', 106.85, 7],
  ['Greenwich', 0.0, 0],
  ['New York', -74.0, -5],
  ['Tokyo', 139.69, 9],
  ['London', -0.13, 0],
];

/* Uji: pada jam tertentu UTC, hitung jam matahari lokal.
   Lalu periksa apakah kota itu ada di sisi siang Bumi. */
console.log('Uji 1: apakah jam matahari lokal dihitung dengan benar?');
console.log('-'.repeat(72));
console.log('waktu UTC            kota        bujur    jam matahari lokal');
console.log('');

const ujiWaktu = ['2026-09-26T21:00:00Z', '2026-09-26T04:00:00Z',
                  '2026-09-26T12:00:00Z', '2026-09-26T00:00:00Z'];
for (const iso of ujiWaktu) {
  const d = new Date(iso);
  const jd = dateToJD(d);
  const g = gmstDeg(jd);
  for (const [nama, bujur, tz] of KOTA.slice(0, 3)) {
    /* jam matahari lokal = GMST + bujur (derajat) -> jam */
    let lat = ((g + bujur) % 360 + 360) % 360 / 15;
    const jam = Math.floor(lat);
    const mnt = Math.floor((lat - jam) * 60);
    console.log(`${iso.slice(11, 16)} UTC`.padEnd(20) + nama.padEnd(12) +
                `${bujur.toFixed(2).padStart(7)}    ${String(jam).padStart(2, '0')}:${String(mnt).padStart(2, '0')}`);
  }
}

console.log('');
console.log('Uji 2: konsistensi GMST dengan waktu UTC');
console.log('-'.repeat(72));
console.log('GMST harus bertambah ~15.0411 derajat per jam (bukan 15.0)');
console.log('karena satu hari sideris lebih pendek dari satu hari Matahari.');
console.log('');

const t0 = new Date('2026-09-26T00:00:00Z');
const g0 = gmstDeg(dateToJD(t0));
console.log('GMST pada 00:00 UTC  : ' + g0.toFixed(4) + ' derajat');
for (const jam of [1, 2, 6, 12, 24]) {
  const t = new Date(t0.getTime() + jam * 3600000);
  const g = gmstDeg(dateToJD(t));
  let delta = g - g0;
  if (delta < 0) delta += 360;
  const perJam = delta / jam;
  console.log(`setelah ${String(jam).padStart(2)} jam: GMST = ${g.toFixed(4)}` +
              `  delta = ${delta.toFixed(4)} derajat  (${perJam.toFixed(4)} derajat/jam)`);
}
console.log('');
console.log('Acuan: laju GMST yang benar = 15.041067 derajat/jam');
console.log('       (= 360.98564736629 / 24)');

console.log('');
console.log('Uji 3: apakah siang/malam sesuai jam lokal?');
console.log('-'.repeat(72));
console.log('Pada jam matahari lokal 12:00, kota harus di titik terdekat ke Matahari.');
console.log('Pada jam matahari lokal 00:00, kota harus di titik terjauh.');
console.log('');

/* sudut antara arah kota dan arah Matahari.
   Arah kota dalam kerangka scene: phi = (GMST + bujur) derajat, diukur
   dari meridian Greenwich. Matahari berada pada arah yang ditentukan oleh
   GMST juga: pada jam matahari lokal 12, kota tepat menghadap Matahari. */
function ujiKota(nama, bujur, jamLokalDiinginkan) {
  /* cari waktu UTC saat jam matahari lokal = jamLokalDiinginkan */
  const bujurKoreksi = bujur / 15;
  const utcJam = jamLokalDiinginkan - bujurKoreksi;
  const base = new Date('2026-09-26T00:00:00Z');
  const t = new Date(base.getTime() + utcJam * 3600000);
  const g = gmstDeg(dateToJD(t));
  /* sudut jam matahari lokal (0 = tengah hari) */
  let hourAngle = ((g + bujur) % 360 + 360) % 360;
  if (hourAngle > 180) hourAngle -= 360;
  return { utc: t.toISOString().slice(11, 16), hourAngle };
}

for (const [nama, bujur, tz] of KOTA) {
  const siang = ujiKota(nama, bujur, 12);
  const tengah = ujiKota(nama, bujur, 0);
  console.log(`${nama.padEnd(12)} jam 12:00 lokal -> UTC ${siang.utc}  sudut jam = ` +
              `${siang.hourAngle.toFixed(2).padStart(7)} derajat  (0 = tengah hari)`);
  console.log(`${''.padEnd(12)} jam 00:00 lokal -> UTC ${tengah.utc}  sudut jam = ` +
              `${tengah.hourAngle.toFixed(2).padStart(7)} derajat  (+-180 = tengah malam)`);
}

console.log('');
console.log('='.repeat(72));
console.log('CATATAN: sudut jam 0 = kota tepat di bawah Matahari (tengah hari),');
console.log('         +-180 = kota di sisi terjauh (tengah malam).');
console.log('         Uji ini memverifikasi GMST memberi jam lokal yang benar.');
console.log('='.repeat(72));
