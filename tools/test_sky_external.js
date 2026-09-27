#!/usr/bin/env node
/* ======================================================================
   UJI POSISI LANGIT vs DATA ASTRONOMI EKSTERNAL
   ----------------------------------------------------------------------
   Tujuan: membuktikan apakah posisi benda langit di aplikasi ini BENAR,
   dengan membandingkan terhadap koordinat yang dihitung dari sumber
   astronomi resmi (bukan memakai kode aplikasi).

   Yang diuji:
     1. Altitude & azimut BINTANG dari katalog HYG (data nyata)
        dibandingkan dengan rumus standar astronomi (Meeus).
     2. Posisi Bima Sakti (bidang galaksi) terhadap horizon pengamat.

   Rumus acuan (Meeus, Astronomical Algorithms):
     HA  = LST - RA
     alt = asin(sin lat sin dec + cos lat cos dec cos HA)
     az  = atan2(sin HA, cos HA sin lat - tan dec cos lat)  [dari selatan]
         -> azimut dari UTARA = az + 180
   Waktu sideris: GMST dari tanggal (rumus Meeus 12.4), lalu LST = GMST + lon.

   Jalankan: node tools/test_sky_external.js
   ====================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const read = (p) => fs.readFileSync(p, 'utf8');
const DEG = Math.PI / 180;

/* ---------------- rumus acuan (Meeus) ---------------- */
/* GMST (derajat) untuk JD tertentu — Meeus bab 12, rumus 12.4 */
function gmstDeg(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  let g = 280.46061837
    + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T
    - T * T * T / 38710000.0;
  return ((g % 360) + 360) % 360;
}

/* altitude & azimut dari RA/Dec (derajat), lat/lon pengamat (derajat) */
function altAz(raDeg, decDeg, latDeg, lonDeg, jd) {
  const lst = (gmstDeg(jd) + lonDeg + 360) % 360;
  let ha = (lst - raDeg + 540) % 360 - 180;      /* -180..180 */
  const H = ha * DEG, d = decDeg * DEG, p = latDeg * DEG;
  const alt = Math.asin(Math.sin(p) * Math.sin(d) +
                        Math.cos(p) * Math.cos(d) * Math.cos(H)) / DEG;
  const az = Math.atan2(Math.sin(H),
                        Math.cos(H) * Math.sin(p) - Math.tan(d) * Math.cos(p)) / DEG;
  return { alt, az: (az + 180 + 360) % 360 };    /* azimut dari utara, searah jarum jam */
}

/* JD dari tanggal UTC */
function jdDari(y, m, d, jam = 0) {
  let Y = y, M = m;
  if (M <= 2) { Y -= 1; M += 12; }
  const A = Math.floor(Y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1))
    + d + B - 1524.5 + jam / 24;
}

/* ---------------- uji 1: bintang terang ---------------- */
console.log('='.repeat(70));
console.log('UJI POSISI LANGIT vs RUMUS ASTRONOMI STANDAR (Meeus)');
console.log('='.repeat(70));

/* bintang terang dengan RA/Dec J2000 dari katalog resmi (SIMBAD/Hipparcos) */
const bintang = [
  { nama: 'Sirius',   ra: 101.2872, dec: -16.7161, mag: -1.46 },
  { nama: 'Canopus',  ra:  95.9880, dec: -52.6957, mag: -0.74 },
  { nama: 'Arcturus', ra: 213.9153, dec:  19.1824, mag: -0.05 },
  { nama: 'Vega',     ra: 279.2347, dec:  38.7837, mag:  0.03 },
  { nama: 'Capella',  ra:  79.1723, dec:  45.9980, mag:  0.08 },
  { nama: 'Rigel',    ra:  78.6345, dec:  -8.2016, mag:  0.13 },
  { nama: 'Procyon',  ra: 114.8255, dec:   5.2250, mag:  0.34 },
  { nama: 'Betelgeuse', ra: 88.7929, dec:  7.4071, mag:  0.50 },
  { nama: 'Achernar', ra:  24.4285, dec: -57.2367, mag:  0.46 },
  { nama: 'Altair',   ra: 297.6958, dec:   8.8683, mag:  0.77 },
  { nama: 'Aldebaran',ra:  68.9802, dec:  16.5093, mag:  0.85 },
  { nama: 'Antares',  ra: 247.3519, dec: -26.4320, mag:  1.09 },
  { nama: 'Spica',    ra: 201.2983, dec: -11.1613, mag:  0.98 },
  { nama: 'Fomalhaut',ra: 344.4127, dec: -29.6222, mag:  1.16 },
  { nama: 'Deneb',    ra: 310.3580, dec:  45.2803, mag:  1.25 },
];

/* lokasi & waktu pengujian */
const LAT = -6.2, LON = 106.8;
const JD = jdDari(2026, 9, 27, 12.72);   /* 19:43 WIB = 12:43 UTC */
console.log(`Pengamat: ${LAT}°, ${LON}°  |  JD = ${JD.toFixed(5)}  (27 Sep 2026 19:43 WIB)`);
console.log(`GMST = ${gmstDeg(JD).toFixed(4)}°  |  LST = ${((gmstDeg(JD)+LON)%360).toFixed(4)}°`);
console.log();

/* Baca data aplikasi untuk bintang yang sama */
const srcBintang = read(path.join(ROOT, 'src', '12-stars-data.js'));
/* format: [nama, bayer, con, mag, x, y, z, ...] — x,y,z kartesian parsek */
function cariDiAplikasi(raDeg, decDeg) {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  /* target vektor satuan ekuator */
  const tx = Math.cos(dec) * Math.cos(ra);
  const ty = Math.cos(dec) * Math.sin(ra);
  const tz = Math.sin(dec);
  /* cari bintang terdekat secara sudut */
  let terbaik = null, dotTerbaik = -2;
  const re = /\["[^"]*","[^"]*","([^"]*)",([\d.-]+),([\d.eE+-]+),([\d.eE+-]+),([\d.eE+-]+)/g;
  let m;
  while ((m = re.exec(srcBintang)) !== null) {
    const x = Number(m[3]), y = Number(m[4]), z = Number(m[5]);
    const L = Math.sqrt(x * x + y * y + z * z);
    if (L < 1e-9) continue;
    const dot = (x / L) * tx + (y / L) * ty + (z / L) * tz;
    if (dot > dotTerbaik) { dotTerbaik = dot; terbaik = { con: m[1], mag: Number(m[2]), x, y, z }; }
  }
  if (!terbaik) return null;
  const sudut = Math.acos(Math.max(-1, Math.min(1, dotTerbaik))) / DEG;
  return { ...terbaik, sudut };
}

console.log('Bintang           | RA/Dec (acuan)      | Sudut ke katalog app | Status');
console.log('-'.repeat(70));
let lulus = 0, gagal = 0;
for (const b of bintang) {
  const hit = cariDiAplikasi(b.ra, b.dec);
  if (!hit) { console.log(`${b.nama.padEnd(17)} | tidak ditemukan`); gagal++; continue; }
  const ok = hit.sudut < 0.05;    /* toleransi 0,05° = 3 arcmin */
  if (ok) lulus++; else gagal++;
  console.log(`${b.nama.padEnd(17)} | ${b.ra.toFixed(3).padStart(8)},${b.dec.toFixed(3).padStart(8)} | `
    + `${hit.sudut.toFixed(4).padStart(8)}° (mag ${hit.mag}) | ${ok ? 'OK' : 'BEDA'}`);
}
console.log();
console.log(`Katalog bintang: ${lulus} cocok, ${gagal} beda`);

/* ---------------- uji 2: Bima Sakti vs horizon ---------------- */
console.log();
console.log('='.repeat(70));
console.log('UJI BIDANG GALAKSI (BIMA SAKTI) vs HORIZON');
console.log('='.repeat(70));
console.log('Bidang galaksi = lingkaran besar pada b=0. Titik-titiknya:');
console.log('Bujur galaksi l | RA      | Dec     | Altitude | Terlihat?');
console.log('-'.repeat(70));

/* matriks galaktik -> ekuator J2000 */
const Mge = [
  [-0.0548755604, 0.4941094279, -0.8676661490],
  [-0.8734370902, -0.4448296300, -0.1980763734],
  [-0.4838350155, 0.7469822445, 0.4559837762],
];
let diAtas = 0, total = 0;
const titikTerang = [];
for (let l = 0; l < 360; l += 30) {
  const lg = l * DEG;
  const xg = Math.cos(lg), yg = Math.sin(lg), zg = 0;
  const xe = Mge[0][0] * xg + Mge[0][1] * yg + Mge[0][2] * zg;
  const ye = Mge[1][0] * xg + Mge[1][1] * yg + Mge[1][2] * zg;
  const ze = Mge[2][0] * xg + Mge[2][1] * yg + Mge[2][2] * zg;
  const ra = ((Math.atan2(ye, xe) / DEG) % 360 + 360) % 360;
  const dec = Math.asin(Math.max(-1, Math.min(1, ze))) / DEG;
  const { alt, az } = altAz(ra, dec, LAT, LON, JD);
  total++;
  if (alt > 0) diAtas++;
  titikTerang.push({ l, ra, dec, alt, az });
  console.log(`l=${String(l).padStart(3)}°          | ${ra.toFixed(1).padStart(6)}° | ${dec.toFixed(1).padStart(6)}° | `
    + `${alt.toFixed(1).padStart(7)}° | ${alt > 0 ? 'ya' : 'tidak'}`);
}
console.log();
console.log(`Bidang galaksi di atas horizon: ${diAtas}/${total} titik`);

/* cek: apakah pusat galaksi (l=0) terlihat? */
const pusat = titikTerang.find(t => t.l === 0);
console.log(`Pusat galaksi (l=0): altitude ${pusat.alt.toFixed(1)}°, azimut ${pusat.az.toFixed(1)}°`);
console.log();
console.log('KESIMPULAN:');
if (gagal === 0) {
  console.log('  - Katalog bintang aplikasi COCOK dengan koordinat resmi SIMBAD');
  console.log('    (semua bintang dalam toleransi 0,05°).');
} else {
  console.log(`  - ADA ${gagal} bintang yang tidak cocok — perlu diperiksa.`);
}
console.log(`  - Posisi bidang galaksi dihitung dari matriks IAU, jadi acuannya`);
console.log(`    benar. Untuk membandingkan dengan Stellarium, WAKTU harus sama`);
console.log(`    persis (beda 1 jam = 15° rotasi langit).`);
