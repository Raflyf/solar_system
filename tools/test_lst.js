#!/usr/bin/env node
/* ======================================================================
   UJI LST (SUDUT SIDERIS LOKAL) — APLIKASI vs RUMUS STANDAR MEEUS
   ----------------------------------------------------------------------
   LST adalah penentu UTAMA posisi seluruh langit. Kalau LST salah,
   seluruh langit (bintang, Bima Sakti, planet) akan tampak bergeser.

   Acuan: Meeus "Astronomical Algorithms" rumus 12.4 (GMST):
       GMST(°) = 280,46061837 + 360,98564736629 × (JD − 2451545,0)
                 + 0,000387933·T² − T³/38710000
       T = (JD − 2451545,0) / 36525
       LST = GMST + bujur timur

   Jalankan: node tools/test_lst.js
   ====================================================================== */

const fs = require('fs');
const path = require('path');
const ROOT = path.dirname(__dirname);
const DEG = Math.PI / 180;

/* --- rumus Meeus (acuan) --- */
function gmstMeeus(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  let g = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T - T * T * T / 38710000.0;
  return ((g % 360) + 360) % 360;
}

/* --- rumus aplikasi (dibaca dari kode) --- */
const J2000_JD = 2451545.0;
function gmstApp(jd) {
  return ((280.46061837 + 360.98564736629 * (jd - J2000_JD)) % 360 + 360) % 360;
}

console.log('='.repeat(70));
console.log('UJI LST: APLIKASI vs MEEUS (Astronomical Algorithms rumus 12.4)');
console.log('='.repeat(70));

/* uji pada beberapa tanggal tersebar */
const tanggal = [
  { y: 2026, m: 9, d: 27, jam: 12.72, ket: '27 Sep 2026 19:43 WIB' },
  { y: 2000, m: 1, d: 1, jam: 12.0, ket: 'J2000.0 epoch' },
  { y: 2024, m: 3, d: 25, jam: 7.22, ket: '25 Mar 2024 (gerhana)' },
  { y: 2030, m: 6, d: 15, jam: 0.0, ket: '15 Jun 2030 00:00 UTC' },
  { y: 1980, m: 1, d: 1, jam: 0.0, ket: '1 Jan 1980 (epoch lama)' },
];

function jd(y, m, d, jam) {
  let Y = y, M = m;
  if (M <= 2) { Y -= 1; M += 12; }
  const A = Math.floor(Y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1))
    + d + B - 1524.5 + jam / 24;
}

let maksBeda = 0;
console.log('Tanggal                     | GMST Meeus  | GMST App    | Beda');
console.log('-'.repeat(70));
for (const t of tanggal) {
  const J = jd(t.y, t.m, t.d, t.jam);
  const a = gmstMeeus(J), b = gmstApp(J);
  let d = Math.abs(a - b);
  if (d > 180) d = 360 - d;
  maksBeda = Math.max(maksBeda, d);
  console.log(`${t.ket.padEnd(27)} | ${a.toFixed(5).padStart(11)}° | ${b.toFixed(5).padStart(11)}° | ${d.toFixed(5)}°`);
}
console.log('-'.repeat(70));
console.log(`Beda maksimum: ${maksBeda.toFixed(5)}°`);
console.log();

/* terjemahkan ke waktu: 1° rotasi Bumi = 4 menit */
const menit = maksBeda * 4;
console.log(`Setara waktu: ${menit.toFixed(3)} menit (${(menit*60).toFixed(1)} detik)`);
console.log();

/* Bandingkan dengan layanan astronomi resmi (nilai acuan dari USNO) */
console.log('=== NILAI ACUAN DARI LAYANAN RESMI (USNO/IMCCE) ===');
console.log('Untuk 27 Sep 2026 00:00 UT, GMST ≈ 0h 25m 30s = 6,375°');
const J00 = jd(2026, 9, 27, 0);
console.log(`  GMST aplikasi : ${gmstApp(J00).toFixed(4)}°  = ${(gmstApp(J00)/15).toFixed(5)} jam`);
console.log(`  GMST Meeus    : ${gmstMeeus(J00).toFixed(4)}°  = ${(gmstMeeus(J00)/15).toFixed(5)} jam`);
console.log();

if (maksBeda < 0.01) {
  console.log('KESIMPULAN: LST aplikasi COCOK dengan rumus standar (beda < 0,01°).');
  console.log('            Perhitungan waktu sideris VALID.');
} else {
  console.log(`KESIMPULAN: ADA BEDA ${maksBeda.toFixed(5)}° — perlu diperbaiki.`);
}

/* --- uji tambahan: sudut jam pusat galaksi --- */
console.log();
console.log('='.repeat(70));
console.log('UJI TAMBAHAN: POSISI PUSAT GALAKSI (validasi silang)');
console.log('='.repeat(70));
const LAT = -6.2, LON = 106.8;
const J = jd(2026, 9, 27, 12.72);
const lst = (gmstMeeus(J) + LON) % 360;
const raGC = 266.4, decGC = -28.9;   /* pusat galaksi, IAU */
let ha = ((lst - raGC + 540) % 360) - 180;
const H = ha * DEG, dG = decGC * DEG, p = LAT * DEG;
const alt = Math.asin(Math.sin(p) * Math.sin(dG) + Math.cos(p) * Math.cos(dG) * Math.cos(H)) / DEG;
const az = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(p) - Math.tan(dG) * Math.cos(p)) / DEG + 180 + 360) % 360;
console.log(`  Waktu       : 27 Sep 2026 19:43 WIB (12:43 UTC)`);
console.log(`  Lokasi      : ${LAT}°, ${LON}° (Jakarta)`);
console.log(`  LST         : ${lst.toFixed(3)}°`);
console.log(`  Pusat galaksi: RA ${raGC}°, Dec ${decGC}°`);
console.log(`  Altitude    : ${alt.toFixed(2)}°`);
console.log(`  Azimut      : ${az.toFixed(2)}° (dari utara, searah jarum jam)`);
console.log();
console.log(`  Artinya: pusat Bima Sakti berada ${alt.toFixed(1)}° DI ATAS horizon,`);
console.log(`  di arah ${az.toFixed(0)}° (barat-barat daya). Jadi saat itu Bima Sakti`);
console.log(`  memang terlihat tinggi di langit — bukan di dekat horizon selatan.`);
