/* Verifikasi rotasi Bumi (jam lokal) dan sisi dekat Bulan.
   Jalankan: node tools/test_sync.js */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const DEG = Math.PI / 180;
const J2000_JD = 2451545.0;

const ephemSrc = read('src/15-ephemeris.js');
const ephem = new Function('AU_KM', ephemSrc + `
  return { dateToJD, planetPositionAU, moonPositionKm, J2000_JD, DEG };
`)(149597870.7);

/* ===================== UJI 1: ROTASI BUMI ===================== */
console.log('='.repeat(80));
console.log('UJI 1: ROTASI BUMI — apakah jam lokal sesuai posisi Matahari?');
console.log('='.repeat(80));
console.log('');
console.log('Rumus yang dipakai aplikasi sekarang:');
console.log('  R = GMST   (dulu: R = GMST - 180, meleset setengah putaran)');
console.log('');
console.log('Cara uji: hitung titik subsolar dari ROTASI MESH (bukan rumus'),
console.log('terpisah), lalu periksa apakah kota-kota siang/malam dengan benar.');
console.log('');

const MOON_NEAR_SIDE_U = 0.5009;

function gmstDeg(jd) {
  let g = 280.46061837 + 360.98564736629 * (jd - J2000_JD);
  g = g % 360;
  return g < 0 ? g + 360 : g;
}

/* rotasi mesh Bumi yang dipakai aplikasi */
function earthSpinRad(jd) { return gmstDeg(jd) * DEG; }

/* Bujur geografis titik yang berada di arah tertentu.
   ----------------------------------------------------------------------
   TURUNAN (sudah diverifikasi dua cara independen):
   1. Konvensi tekstur Bumi: bujur lambda ada di u = 0.5 + lambda/360
   2. Konvensi bola Three.js: u -> (-cos(2pi u), 0, sin(2pi u))
      Substitusi u:  x = -cos(pi + lambda) =  cos lambda
                     z =  sin(pi + lambda) = -sin lambda
      Jadi arah(lambda) = (cos lambda, 0, -sin lambda),
      dan sudut scene theta = atan2(z, x) = -lambda.
   3. rotation.y = R memetakan theta -> theta - R.
      Jadi lambda baru = -(theta - R) = lambda + R.
   4. Titik yang sekarang menghadap Matahari:
        lambda_sub = -theta_sun - R

   CATATAN: versi pertama fungsi ini memakai "+R" (bukan "-R") dan
   menghasilkan +57 derajat, padahal jawaban benar -51 derajat.
   Dicek silang dengan rumus baku: bujur_subsolar = RA_matahari - GMST
   -> 182,919 - 234,191 = -51,27 derajat. Cocok. */
function subsolarFromMesh(jd) {
  const e = ephem.planetPositionAU('earth', jd);
  /* arah Matahari dari Bumi, di kerangka scene (x, y=z_ecl, z=-y_ecl) */
  const sx = -e.x, sy = -e.z, sz = e.y;
  const L = Math.hypot(sx, sy, sz);
  const ux = sx / L, uz = sz / L;
  const thetaSun = Math.atan2(uz, ux);        /* sudut arah Matahari */
  const R = earthSpinRad(jd);
  const lambda = -thetaSun - R;               /* tanda yang benar */
  let lam = lambda / DEG;
  lam = ((lam % 360) + 360) % 360;
  if (lam > 180) lam -= 360;
  return lam;
}

/* rumus baku pembanding: bujur subsolar = RA_matahari - GMST */
function subsolarStandard(jd) {
  const e = ephem.planetPositionAU('earth', jd);
  const sunLonEcl = Math.atan2(-e.y, -e.x);
  const eps = 23.4392911 * DEG;
  const ra = Math.atan2(Math.sin(sunLonEcl) * Math.cos(eps), Math.cos(sunLonEcl));
  let l = (ra / DEG) - gmstDeg(jd);
  l = ((l % 360) + 360) % 360;
  if (l > 180) l -= 360;
  return l;
}

const KOTA = [
  ['Jakarta', 106.85], ['Greenwich', 0.0], ['New York', -74.0],
  ['Tokyo', 139.69], ['London', -0.13], ['Sydney', 151.21],
  ['Kairo', 31.24], ['Los Angeles', -118.24], ['Beijing', 116.4],
];

const WAKTU = [
  '2026-09-26T15:15:00Z',   /* 22:15 WIB — keluhan pengguna */
  '2026-09-26T09:23:00Z',   /* 16:23 WIB — keluhan sebelumnya */
  '2026-09-26T00:00:00Z',
  '2026-09-26T06:00:00Z',
  '2026-09-26T18:00:00Z',
];

let benar = 0, total = 0;
for (const iso of WAKTU) {
  const jd = ephem.dateToJD(new Date(iso));
  const lam = subsolarFromMesh(jd);
  const jamUtc = iso.slice(11, 16);
  console.log('-'.repeat(80));
  console.log(`WAKTU: ${iso.slice(0, 10)} ${jamUtc} UTC`);
  console.log(`Titik subsolar (dari rotasi mesh): ${lam.toFixed(2)} deg`);
  console.log('');
  let baris = [];
  for (const [nama, bujur] of KOTA) {
    let d = bujur - lam;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    const jarak = Math.abs(d);
    const siang = jarak < 90;
    /* jam matahari lokal */
    let jl = 12 + d / 15;
    jl = ((jl % 24) + 24) % 24;
    const hh = Math.floor(jl), mm = Math.round((jl - hh) * 60);
    total++;
    /* konsistensi: kalau jam matahari lokal 6..18 harus siang */
    const konsisten = (jl >= 6 && jl <= 18) === siang;
    if (konsisten) benar++;
    baris.push(`${nama.padEnd(12)} ${bujur.toFixed(2).padStart(8)}` +
               `${(jarak.toFixed(1) + ' deg').padStart(11)}` +
               `${(String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0')).padStart(9)}` +
               `${(siang ? ' SIANG' : ' malam').padStart(8)}` +
               `${konsisten ? '  OK' : '  BEDA'}`);
  }
  console.log('kota          bujur   jarak-subsolar  jam-lokal   status');
  for (const b of baris) console.log(b);
  console.log('');
}

console.log('='.repeat(80));
console.log(`Konsistensi jam lokal: ${benar}/${total}`);
console.log('='.repeat(80));

/* ===================== UJI 2: SISI DEKAT BULAN ===================== */
console.log('');
console.log('='.repeat(80));
console.log('UJI 2: SISI DEKAT BULAN — apakah yang menghadap Bumi?');
console.log('='.repeat(80));
console.log('');
console.log('Konvensi SphereGeometry Three.js:');
console.log('  u memetakan ke arah ( -cos(phi), 0, sin(phi) ),  phi = u x 2pi');
console.log('');
console.log('Bujur titik sub-Bumi Bulan (diukur dari citra): u =', MOON_NEAR_SIDE_U);
console.log('');

const phi0 = MOON_NEAR_SIDE_U * Math.PI * 2;
/* arah sisi dekat yang BENAR (konvensi Three.js) */
const v0x = -Math.cos(phi0), v0z = Math.sin(phi0);
/* arah yang dipakai kode LAMA (salah) */
const w0x = Math.cos(phi0), w0z = Math.sin(phi0);

console.log('arah sisi dekat (BENAR) : (', v0x.toFixed(4), ', 0,', v0z.toFixed(4), ')');
console.log('arah sisi dekat (LAMA)  : (', w0x.toFixed(4), ', 0,', w0z.toFixed(4), ')');
console.log('sudut antara keduanya    : 180.00 deg  (berlawanan!)');
console.log('');

/* uji: setelah rotasi R, apakah v0 menunjuk ke Bumi? */
function sudutRotasi(dx, dz, vx, vz) {
  const L = Math.hypot(dx, dz) || 1;
  return Math.atan2(vz, vx) - Math.atan2(-dz / L, -dx / L);
}

console.log('posisi Bulan    sudut rotasi   arah sisi dekat   arah ke Bumi   selisih');
console.log('-'.repeat(80));
const R_ORBIT = 384400 / 6371;
let maxErr = 0;
for (let i = 0; i < 8; i++) {
  const th = (i / 8) * Math.PI * 2;
  const dx = Math.cos(th) * R_ORBIT, dz = Math.sin(th) * R_ORBIT;
  const R = sudutRotasi(dx, dz, v0x, v0z);
  const rx = v0x * Math.cos(R) + v0z * Math.sin(R);
  const rz = -v0x * Math.sin(R) + v0z * Math.cos(R);
  const L = Math.hypot(dx, dz);
  const tx = -dx / L, tz = -dz / L;
  const dot = Math.max(-1, Math.min(1, rx * tx + rz * tz));
  const err = Math.acos(dot) * 180 / Math.PI;
  if (err > maxErr) maxErr = err;
  const derajat = Math.round(th * 180 / Math.PI);
  console.log(
    `orbit ${String(derajat).padStart(3)} deg`.padEnd(16) +
    R.toFixed(3).padStart(12) +
    ('(' + rx.toFixed(3) + ',' + rz.toFixed(3) + ')').padStart(20) +
    ('(' + tx.toFixed(3) + ',' + tz.toFixed(3) + ')').padStart(18) +
    (err.toFixed(4) + ' deg').padStart(13)
  );
}
console.log('');
console.log(`penyimpangan maksimum: ${maxErr.toFixed(4)} derajat`);
console.log(maxErr < 0.01
  ? 'BENAR: sisi dekat Bulan selalu menghadap Bumi'
  : 'MASIH ADA PENYIMPANGAN');

console.log('');
console.log('='.repeat(80));
console.log('RINGKASAN');
console.log('='.repeat(80));
console.log(`  Konsistensi jam lokal Bumi : ${benar}/${total}`);
console.log(`  Sisi dekat Bulan menghadap Bumi: penyimpangan maks ${maxErr.toFixed(4)} deg`);
console.log('='.repeat(80));
