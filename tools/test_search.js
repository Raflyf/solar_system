#!/usr/bin/env node
/* ======================================================================
   UJI LOGIKA PENCARIAN BENDA LANGIT
   ----------------------------------------------------------------------
   Menguji SEARCH.cari() tanpa browser: membaca data yang sama dari
   berkas sumber, membangun indeks, lalu menguji beberapa kueri.

   Jalankan: node tools/test_search.js
   ====================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'src');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

let lulus = 0, gagal = 0;
const uji = (nama, benar, detail) => {
  if (benar) { lulus++; console.log(`  OK   ${nama}${detail ? ' — ' + detail : ''}`); }
  else { gagal++; console.log(`  GAGAL ${nama}${detail ? ' — ' + detail : ''}`); }
};

console.log('='.repeat(70));
console.log('UJI LOGIKA PENCARIAN BENDA LANGIT');
console.log('='.repeat(70));

/* --- siapkan konteks: muat data + modul pencarian --- */
const ctx = {
  console,
  document: { getElementById: () => null, addEventListener: () => {},
              createElement: () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){} },
                                      appendChild(){}, addEventListener(){} }) },
  window: {},
  THREE: { Vector3: function () { this.x=0; this.y=0; this.z=0; return this; } },
  DEG: Math.PI / 180,
};
ctx.window = ctx;
vm.createContext(ctx);

/* muat data yang dibutuhkan SEARCH.
   CATATAN: 10-data.js tidak dimuat karena bergantung pada fungsi dari
   berkas lain (shadeMercury dll). Untuk uji ini kita cukup memuat katalog
   bintang & rasi, lalu menambahkan benda tata surya tiruan supaya jenis
   "Planet"/"Satelit"/"Matahari" juga teruji. */
for (const f of ['12-stars-data.js', '13-constellations-data.js']) {
  try { vm.runInContext(read(f), ctx, { filename: f }); }
  catch (e) { console.log(`  (catatan: ${f}: ${e.message.slice(0, 70)})`); }
}

/* benda tata surya tiruan (mewakili `bodies` yang dibuat 20-scene.js) */
ctx.bodies = [
  { name: 'Matahari', key: 'sun', isMoon: false },
  { name: 'Merkurius', key: 'mercury', isMoon: false, aKm: 57900000 },
  { name: 'Venus', key: 'venus', isMoon: false, aKm: 108200000 },
  { name: 'Bumi', key: 'earth', isMoon: false, aKm: 149600000 },
  { name: 'Mars', key: 'mars', isMoon: false, aKm: 227900000 },
  { name: 'Jupiter', key: 'jupiter', isMoon: false, aKm: 778600000 },
  { name: 'Saturnus', key: 'saturn', isMoon: false, aKm: 1433500000 },
  { name: 'Uranus', key: 'uranus', isMoon: false, aKm: 2872500000 },
  { name: 'Neptunus', key: 'neptune', isMoon: false, aKm: 4495100000 },
  { name: 'Bulan', key: 'moon', isMoon: true, host: { name: 'Bumi' } },
  { name: 'Phobos', key: 'phobos', isMoon: true, host: { name: 'Mars' } },
  { name: 'Deimos', key: 'deimos', isMoon: true, host: { name: 'Mars' } },
  { name: 'Io', key: 'io', isMoon: true, host: { name: 'Jupiter' } },
];

/* DEEP_SKY diambil dari 18-stars.js (berkasnya besar & butuh THREE, jadi
   hanya blok DEEP_SKY yang diambil lewat regex). */
try {
  const stars = read('18-stars.js');
  const m = stars.match(/const DEEP_SKY = (\[[\s\S]*?\n\];)/);
  if (m) {
    vm.runInContext('const DEEP_SKY = ' + m[1].replace(/;\s*$/, '') + ';'
      + '\n;globalThis.DEEP_SKY = DEEP_SKY;', ctx, { filename: 'DEEP_SKY' });
  }
} catch (e) { console.log('  (catatan: DEEP_SKY:', e.message.slice(0, 60), ')'); }
/* muat modul pencarian.
   CATATAN: `const SEARCH = {...}` di dalam vm TIDAK menjadi properti
   konteks (perilaku sama seperti `const` pada umumnya). Karena itu berkas
   dimuat lalu diakhiri dengan pernyataan yang mengekspornya ke globalThis. */
try {
  vm.runInContext(read('36-search.js') + '\n;globalThis.SEARCH = SEARCH;', ctx,
    { filename: '36-search.js' });
} catch (e) { console.log('GAGAL memuat 36-search.js:', e.message); process.exit(1); }

const S = ctx.SEARCH;
if (!S) { console.log('SEARCH tidak terdefinisi'); process.exit(1); }

console.log();
console.log('=== 1. INDEKS ===');
S.bangunIndeks();
const idx = S.indeks || [];
uji('Indeks terbangun', idx.length > 3000, `${idx.length.toLocaleString('id')} entri`);

const perJenis = {};
for (const it of idx) perJenis[it.jenis] = (perJenis[it.jenis] || 0) + 1;
console.log('  Rincian per jenis:');
for (const [j, n] of Object.entries(perJenis).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${j.padEnd(22)} ${n.toLocaleString('id')}`);
}

console.log();
console.log('=== 2. KELENGKAPAN JENIS ===');
uji('Ada bintang', (perJenis['Bintang'] || 0) > 3000, `${perJenis['Bintang'] || 0} bintang`);
uji('Ada planet', (perJenis['Planet'] || 0) >= 7, `${perJenis['Planet'] || 0} planet`);
uji('Ada satelit', (perJenis['Satelit'] || 0) >= 1, `${perJenis['Satelit'] || 0} satelit`);
uji('Ada Matahari', (perJenis['Matahari'] || 0) === 1);
uji('Ada galaksi/nebula/gugus',
  ((perJenis['Galaksi'] || 0) + (perJenis['Nebula'] || 0) + (perJenis['Gugus bintang'] || 0)) >= 10,
  `${(perJenis['Galaksi'] || 0)} galaksi, ${perJenis['Nebula'] || 0} nebula, ${perJenis['Gugus bintang'] || 0} gugus`);
uji('Ada rasi bintang', (perJenis['Rasi bintang'] || 0) >= 80, `${perJenis['Rasi bintang'] || 0} rasi`);

console.log();
console.log('=== 3. UJI PENCARIAN NYATA ===');
const kueri = [
  ['sirius', 'Sirius', 'bintang terang'],
  ['vega', 'Vega', 'bintang terang'],
  ['betel', 'Betelgeuse', 'awalan nama'],
  ['jupiter', 'Jupiter', 'planet'],
  ['mars', 'Mars', 'planet'],
  ['bulan', 'Bulan', 'satelit'],
  ['matahari', 'Matahari', 'bintang pusat'],
  ['andromeda', 'Andromeda', 'galaksi + rasi'],
  ['orion', 'Orion', 'nebula + rasi'],
  ['m42', 'M42', 'nomor Messier'],
  ['pleiades', 'Pleiades', 'gugus'],
  ['sagittarius', 'Sagittarius', 'rasi'],
  ['cassiopeia', 'Cassiopeia', 'rasi'],
  ['magellan', 'Magellan', 'galaksi satelit'],
];
for (const [q, harap, ket] of kueri) {
  const hasil = S.cari(q);
  const ada = hasil.some(h => h.nama.toLowerCase().includes(harap.toLowerCase()));
  uji(`cari "${q}" (${ket})`, ada,
    hasil.length ? `${hasil.length} hasil, teratas: ${hasil[0].nama} [${hasil[0].jenis}]` : 'TIDAK ADA HASIL');
}

console.log();
console.log('=== 4. UJI TOLERANSI ===');
const toleransi = [
  ['siriu', 'Sirius', 'kurang 1 huruf'],
  ['jupit', 'Jupiter', 'kurang 1 huruf'],
  ['orion', 'Orion', 'huruf kecil'],
  ['M42', 'M42', 'huruf besar'],
];
for (const [q, harap, ket] of toleransi) {
  const hasil = S.cari(q);
  const ada = hasil.some(h => h.nama.toLowerCase().includes(harap.toLowerCase()));
  uji(`"${q}" (${ket})`, ada, hasil.length ? `teratas: ${hasil[0].nama}` : 'kosong');
}

console.log();
console.log('=== 5. UJI BATAS ===');
uji('Kueri kosong -> tidak ada hasil', S.cari('').length === 0);
uji('Kueri ngawur -> tidak ada hasil', S.cari('xyzqqqq').length === 0);
uji('Hasil dibatasi maksHasil', S.cari('a').length <= S.maksHasil,
  `${S.cari('a').length} hasil (batas ${S.maksHasil})`);

console.log();
console.log('='.repeat(70));
console.log(`HASIL: ${lulus} lulus, ${gagal} gagal`);
console.log('='.repeat(70));
process.exit(gagal > 0 ? 1 : 0);
