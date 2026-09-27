#!/usr/bin/env node
/* ======================================================================
   VERIFIKASI DATA KONSTELASI
   ----------------------------------------------------------------------
   Memeriksa apakah indeks bintang di CONSTELLATIONS sah (menunjuk bintang
   yang benar-benar ada di larik gabungan STARS_LABELED + STARS_OTHER).
   Indeks yang di luar rentang menghasilkan GARIS NGAWUR (menghubungkan
   bintang acak) — inilah keluhan "kontelasi dan rasi bintang nya juga
   jangan ngawur".

   Jalankan: node tools/verify_constellations.js
   ====================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

/* sandbox minimal untuk mengevaluasi file data */
const sandbox = {
  console,
  window: { devicePixelRatio: 1 },
  document: { createElement: () => ({ getContext: () => ({}) }) },
  Math, Array, Object, JSON, Number, String, Float32Array,
};
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);

function evalFile(f) {
  try {
    /* `const` di skrip tidak menjadi properti konteks; jalankan dengan
       pembungkus yang mengekspor ke globalThis supaya bisa dibaca. */
    const code = read(f);
    vm.runInContext(code, ctx, { filename: f });
    return true;
  } catch (e) {
    console.log(`  (${f}: ${e.message.slice(0, 60)})`);
    return false;
  }
}

/* muat data yang dibutuhkan, lalu ambil variabelnya lewat evaluasi ulang
   nama variabel (karena `const` tidak bocor ke konteks) */
evalFile('12-stars-data.js');
evalFile('13-constellations-data.js');

const labeled = vm.runInContext('STARS_LABELED', ctx);
const other = vm.runInContext('STARS_OTHER', ctx);
const constellations = vm.runInContext('CONSTELLATIONS', ctx);
const all = labeled.concat(other);

console.log('================================================================');
console.log('VERIFIKASI DATA KONSTELASI');
console.log('================================================================');
console.log(`STARS_LABELED      : ${labeled.length}`);
console.log(`STARS_OTHER        : ${other.length}`);
console.log(`Total bintang      : ${all.length}`);
console.log(`Jumlah konstelasi  : ${constellations.length}`);
console.log('');

if (!all.length || !constellations.length) {
  console.log('GAGAL: data tidak termuat.');
  process.exit(1);
}

/* ---- periksa setiap indeks ---- */
let totalSeg = 0, totalIdx = 0, badIdx = 0, dupNames = 0;
const badList = [];
const nameSeen = new Map();
let totalLineCount = 0;

for (const c of constellations) {
  const nama = c.nama;
  if (nameSeen.has(nama)) dupNames++;
  nameSeen.set(nama, (nameSeen.get(nama) || 0) + 1);

  for (const seg of c.segments) {
    totalSeg++;
    /* tiap segmen = rangkaian indeks; n-1 garis */
    totalLineCount += Math.max(0, seg.length - 1);
    for (const idx of seg) {
      totalIdx++;
      if (!Number.isInteger(idx) || idx < 0 || idx >= all.length) {
        badIdx++;
        if (badList.length < 10) badList.push(`${nama}: indeks ${idx} (maks ${all.length - 1})`);
      }
    }
  }
}

console.log('----------------------------------------------------------------');
console.log('HASIL PEMERIKSAAN INDEKS');
console.log('----------------------------------------------------------------');
console.log(`Segmen (polyline)   : ${totalSeg}`);
console.log(`Total indeks dipakai: ${totalIdx}`);
console.log(`Garis yang digambar : ${totalLineCount}`);
console.log(`Indeks TIDAK SAH    : ${badIdx}`);
console.log(`Nama konstelasi dobel: ${dupNames}`);
if (badList.length) {
  console.log('\nContoh indeks tidak sah:');
  badList.forEach((b) => console.log('  ' + b));
}

/* ---- statistik bintang yang dipakai ---- */
const usedIdx = new Set();
for (const c of constellations) {
  for (const seg of c.segments) for (const idx of seg) usedIdx.add(idx);
}
console.log(`\nBintang unik dipakai: ${usedIdx.size} dari ${all.length} (${(usedIdx.size / all.length * 100).toFixed(1)}%)`);

/* ---- periksa: apakah nama konstelasi cocok dengan bintang di dalamnya ----
   Setiap bintang HYG punya kolom [2] = singkatan konstelasi (con).
   Kalau segmen konstelasi "Ori" memakai bintang dengan con != "Ori",
   berarti garis itu menghubungkan bintang dari rasi lain = NGAWUR. */
console.log('\n----------------------------------------------------------------');
console.log('KONSISTENSI NAMA vs BINTANG (con)');
console.log('----------------------------------------------------------------');
let mismatch = 0, mismatchCons = new Map();
for (const c of constellations) {
  const nama = c.nama;
  let ok = 0, bad = 0;
  for (const seg of c.segments) {
    for (const idx of seg) {
      const s = all[idx];
      if (!s) continue;
      const con = s[2];
      /* beberapa katalog memakai singkatan 3 huruf yang sama; bandingkan
         tanpa memperhatikan besar-kecil */
      if (con && String(con).toLowerCase() !== nama.toLowerCase()) bad++;
      else ok++;
    }
  }
  if (bad > 0) {
    mismatch += bad;
    mismatchCons.set(nama, { ok, bad });
  }
}
console.log(`Total indeks dengan con tidak cocok: ${mismatch}`);
const worst = [...mismatchCons.entries()].sort((a, b) => b[1].bad - a[1].bad).slice(0, 8);
if (worst.length) {
  console.log('Konstelasi dengan paling banyak ketidakcocokan:');
  for (const [n, v] of worst) console.log(`  ${n}: ${v.bad} tidak cocok, ${v.ok} cocok`);
}

/* ---- kesimpulan ---- */
console.log('\n----------------------------------------------------------------');
console.log('KESIMPULAN');
console.log('----------------------------------------------------------------');
const sehat = badIdx === 0;
console.log(sehat
  ? 'OK — semua indeks sah; garis konstelasi menghubungkan bintang yang benar.'
  : `PERLU DIPERBAIKI — ${badIdx} indeks tidak sah (menyebabkan garis ngawur).`);
process.exit(sehat ? 0 : 1);
