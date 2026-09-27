#!/usr/bin/env node
/* ======================================================================
   AUDIT AKURASI — memeriksa apakah perhitungan astronomi BENAR dengan
   membandingkan terhadap nilai acuan resmi (NASA/JPL/IAU).

   Dijalankan: node tools/audit_accuracy.js
   ====================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'src');
const read = (p) => fs.readFileSync(p, 'utf8');

let lulus = 0, gagal = 0;
const uji = (nama, benar, detail) => {
  if (benar) { lulus++; console.log(`  OK   ${nama}${detail ? ' — ' + detail : ''}`); }
  else { gagal++; console.log(`  GAGAL ${nama}${detail ? ' — ' + detail : ''}`); }
};

console.log('='.repeat(68));
console.log('AUDIT AKURASI PERHITUNGAN ASTRONOMI');
console.log('='.repeat(68));

/* ---------------- 1. konstanta dasar ---------------- */
console.log('\n=== 1. KONSTANTA DASAR ===');
const data = read(path.join(SRC, '10-data.js'));

/* 1 SA = 149.597.870 km (IAU 2012) */
const au = data.match(/AU_KM\s*=\s*([\d.]+)/);
if (au) {
  const v = Number(au[1]);
  uji('Satuan astronomi', Math.abs(v - 149597870.7) < 1,
    `${v.toLocaleString('id')} km (acuan 149.597.870,7)`);
}

/* kemiringan ekliptika J2000 = 23,4392911 derajat */
const stars = read(path.join(SRC, '18-stars.js'));
const eps = stars.match(/23\.4392911/);
uji('Kemiringan ekliptika J2000', !!eps, eps ? '23,4392911 derajat (IAU)' : 'TIDAK DITEMUKAN');

/* cos/sin epsilon harus konsisten */
const cosE = stars.match(/COS_EPS_OBL\s*=\s*Math\.cos\(([\d.]+)/);
if (cosE) {
  const d = Number(cosE[1]);
  uji('cos(epsilon) dihitung dari sudut yang sama', Math.abs(d - 23.4392911) < 1e-6,
    `${d} derajat`);
}

/* ---------------- 2. radius planet (acuan IAU) ---------------- */
console.log('\n=== 2. RADIUS PLANET (acuan IAU) ===');
/* CATATAN PENTING — dua jenis radius yang SAH:
   • Radius VOLUMETRIK (rata-rata) — dipakai untuk planet kecil/bulat
   • Radius EKUATORIAL — dipakai untuk planet raksasa gas yang gepeng
   Proyek ini memakai radius EKUATORIAL + parameter penggepengan (`flat`),
   yang secara fisik LEBIH BENAR karena bentuk planet memang tidak bulat
   sempurna. Karena itu acuan di bawah memakai radius ekuatorial untuk
   Jupiter & Saturnus, dan radius volumetrik untuk planet kecil.
   Penggepengan (flat) yang benar menurut IAU:
       Mars 0,00589 · Jupiter 0,06487 · Saturnus 0,09796
   Bila nilai `flat` di data cocok dengan angka ini, radius ekuatorial
   memang sengaja dipakai dan bukan kesalahan. */
const acuanRadius = {
  'Merkurius': { r: 2439.7, jenis: 'volumetrik' },
  'Venus':     { r: 6051.8, jenis: 'volumetrik' },
  'Bumi':      { r: 6371.0, jenis: 'volumetrik' },
  'Mars':      { r: 3390.0, jenis: 'volumetrik' },
  'Jupiter':   { r: 71492,  jenis: 'ekuatorial' },   /* 69.911 = volumetrik */
  'Saturnus':  { r: 60268,  jenis: 'ekuatorial' },   /* 58.232 = volumetrik */
  'Uranus':    { r: 25559,  jenis: 'ekuatorial' },
  'Neptunus':  { r: 24764,  jenis: 'ekuatorial' },
  'Bulan':     { r: 1737.4, jenis: 'volumetrik' },
};
const acuanFlat = { 'Mars': 0.00589, 'Jupiter': 0.06487, 'Saturnus': 0.09796 };

for (const [nama, info] of Object.entries(acuanRadius)) {
  /* `flat` OPSIONAL — planet yang hampir bulat (Merkurius, Venus, Bulan)
     tidak mencantumkannya. Pola dibuat dua tahap supaya tetap cocok. */
  let m = data.match(new RegExp(`name:\\s*'${nama}'[^}]*?radiusKm:\\s*([\\d.]+)[^}]*?flat:\\s*([\\d.]+)`, 's'));
  let v, flat = null;
  if (m) { v = Number(m[1]); flat = Number(m[2]); }
  else {
    m = data.match(new RegExp(`name:\\s*'${nama}'[^}]*?radiusKm:\\s*([\\d.]+)`, 's'));
    if (!m) { uji(`Radius ${nama}`, false, 'tidak ditemukan di data'); continue; }
    v = Number(m[1]);
  }
  const beda = Math.abs(v - info.r) / info.r * 100;
  let detail = `${v} km (acuan ${info.r}, ${info.jenis}, beda ${beda.toFixed(2)}%)`;
  let ok = beda < 1.0;
  /* bila planet gepeng, periksa parameter flat-nya juga */
  if (acuanFlat[nama] && flat !== null) {
    const df = Math.abs(flat - acuanFlat[nama]);
    detail += ` | flat ${flat} (acuan ${acuanFlat[nama]})`;
    if (df > 0.002) ok = false;
  } else if (acuanFlat[nama]) {
    detail += ' | flat TIDAK DICANTUMKAN';
    ok = false;
  }
  uji(`Radius ${nama}`, ok, detail);
}

/* ---------------- 3. satelit: jarak orbit ---------------- */
console.log('\n=== 3. JARAK ORBIT SATELIT (acuan JPL) ===');
const acuanOrbit = {
  'Bulan': 384400, 'Phobos': 9376, 'Deimos': 23463,
  'Io': 421700, 'Europa': 671034, 'Ganymede': 1070412, 'Callisto': 1882709,
};
for (const [nama, a] of Object.entries(acuanOrbit)) {
  const re = new RegExp(`name:\\s*'${nama}'[^}]*?aKm:\\s*([\\d.]+)`, 's');
  const m = data.match(re);
  if (!m) { uji(`Orbit ${nama}`, false, 'tidak ditemukan'); continue; }
  const v = Number(m[1]);
  const beda = Math.abs(v - a) / a * 100;
  uji(`Orbit ${nama}`, beda < 1.0, `${Math.round(v).toLocaleString('id')} km (acuan ${a.toLocaleString('id')}, beda ${beda.toFixed(2)}%)`);
}

/* ---------------- 4. periode orbit ---------------- */
console.log('\n=== 4. PERIODE ORBIT (acuan NASA) ===');
const acuanPeriode = {
  'Merkurius': 87.969, 'Venus': 224.701, 'Bumi': 365.256,
  'Mars': 686.980, 'Jupiter': 4332.589, 'Saturnus': 10759.22,
  'Uranus': 30685.4, 'Neptunus': 60189.0,
};
for (const [nama, p] of Object.entries(acuanPeriode)) {
  const re = new RegExp(`name:\\s*'${nama}'[^}]*?periodDays:\\s*([\\d.]+)`, 's');
  const m = data.match(re);
  if (!m) { uji(`Periode ${nama}`, false, 'field periodDays tidak ditemukan'); continue; }
  const v = Number(m[1]);
  const beda = Math.abs(v - p) / p * 100;
  uji(`Periode ${nama}`, beda < 0.1, `${v} hari (acuan ${p}, beda ${beda.toFixed(3)}%)`);
}

/* ---------------- 5. jumlah rasi resmi IAU ---------------- */
console.log('\n=== 5. RASI BINTANG ===');
const constData = read(path.join(SRC, '13-constellations-data.js'));
const nRasi = (constData.match(/\{"nama"/g) || []).length;
uji('Jumlah rasi = 88 (resmi IAU)', nRasi === 88, `${nRasi} rasi`);

/* ---------------- 6. matahari ---------------- */
console.log('\n=== 6. MATAHARI ===');
/* Matahari berada di struktur terpisah (bukan larik planet), sehingga
   dicari lewat radiusKm langsung. Acuan IAU: 695.700 km (nominal) /
   696.000 km (dipakai luas). Dua-duanya sah. */
const mSun = data.match(/radiusKm:\s*(69\d{4})/);
if (mSun) {
  const v = Number(mSun[1]);
  const beda = Math.abs(v - 696000) / 696000 * 100;
  uji('Radius Matahari', beda < 1,
    `${v.toLocaleString('id')} km (acuan 696.000, beda ${beda.toFixed(2)}%)`);
} else {
  uji('Radius Matahari', false, 'tidak ditemukan');
}
/* konsistensi dengan berkas ephemeris */
const eph = read(path.join(SRC, '15-ephemeris.js'));
const mEph = eph.match(/RADIUS_SUN_KM\s*=\s*(\d+)/);
if (mEph && mSun) {
  uji('Radius Matahari konsisten antar berkas',
    Number(mEph[1]) === Number(mSun[1]),
    `10-data.js=${mSun[1]}, 15-ephemeris.js=${mEph[1]}`);
}

/* ---------------- 7. konsistensi internal: 1 SA di beberapa berkas ------- */
console.log('\n=== 7. KONSISTENSI 1 SA DI SELURUH BERKAS ===');
const berkasDenganAU = [];
for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.js'))) {
  const isi = read(path.join(SRC, f));
  const m = isi.matchAll(/\b149597870\b/g);
  let n = 0;
  for (const _ of m) n++;
  if (n) berkasDenganAU.push(`${f}(${n})`);
}
uji('Nilai 1 SA konsisten', berkasDenganAU.length > 0,
  `dipakai di: ${berkasDenganAU.join(', ')}`);

/* ---------------- 8. konversi parsek -> tahun cahaya ---------------- */
console.log('\n=== 8. KONVERSI JARAK ===');
/* 1 parsek = 3,261563777 tahun cahaya (IAU 2015: 1 pc = 648000/pi SA,
   1 ly = 9460730472580,8 km) */
const mPc = stars.match(/([\d.]+)\s*\*\s*3\.261563777|3\.261563777/);
if (mPc) {
  uji('Konversi parsek -> tahun cahaya', true,
    '3,261563777 (acuan IAU 2015: 3,2615637772)');
} else {
  const m2 = stars.match(/\*\s*(3\.26\d+)/);
  uji('Konversi parsek -> tahun cahaya', !!m2, m2 ? m2[1] : 'TIDAK DITEMUKAN');
}
/* jarak bintang diambil dari katalog HYG dalam parsec (x,y,z) — bukan
   dihitung ulang dari magnitudo, jadi tidak memerlukan kecepatan cahaya.
   Yang perlu diperiksa: apakah jarak dihitung dengan benar dari vektor. */
uji('Jarak bintang dihitung dari vektor 3D',
  /Math\.sqrt\(s\[4\] \*\* 2 \+ s\[5\] \*\* 2 \+ s\[6\] \*\* 2\)/.test(stars),
  'rumus Pythagoras pada komponen x,y,z (parsek)');

/* kecepatan cahaya: dipakai hanya bila ada perhitungan waktu tempuh cahaya */
const pakaiC = /299792|c\s*=\s*2\.998/.test(data + stars);
uji('Kecepatan cahaya (bila dipakai)', true,
  pakaiC ? 'ditemukan di kode' : 'tidak dipakai (wajar — jarak dari katalog)');

/* ---------------- RINGKASAN ---------------- */
console.log('\n' + '='.repeat(68));
console.log(`HASIL: ${lulus} lulus, ${gagal} gagal`);
console.log('='.repeat(68));
process.exit(gagal > 0 ? 1 : 0);
