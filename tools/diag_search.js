#!/usr/bin/env node
/* ======================================================================
   DIAGNOSTIK PENCARIAN — MENIRU URUTAN SCRIPT build.js PERSIS
   ----------------------------------------------------------------------
   KELUHAN PENGGUNA: "fungsi search masih belum sepenuh nya jalan, hanya
   bisa search planet dan satelite saja, search bintang, rasi bitang,
   galaxy dan lainnya tidak berfungsi"

   Uji tools/test_search.js LULUS (28/28), tetapi itu memuat berkas dengan
   urutan BERBEDA dari build.js. Jadi kemungkinan masalahnya ada di URUTAN
   atau CAKUPAN VARIABEL.

   Berkas ini meniru urutan build.js persis:
       starsData -> constData -> ... -> search -> ... -> stars
   lalu memanggil SEARCH.init() seperti aplikasi, dan melaporkan isi
   indeks per jenis.

   Jalankan: node tools/diag_search.js
   ====================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

/* konteks tiruan browser */
const ctx = {
  console,
  document: {
    getElementById: () => null,
    addEventListener: () => {},
    createElement: () => ({
      style: {}, classList: { add() {}, remove() {}, toggle() {} },
      appendChild() {}, addEventListener() {}, querySelectorAll: () => [],
    }),
  },
  window: { innerWidth: 1280, innerHeight: 720, addEventListener: () => {} },
  THREE: {
    Vector3: function () { this.x = 0; this.y = 0; this.z = 0; return this; },
    MathUtils: { degToRad: (d) => d * Math.PI / 180 },
    RepeatWrapping: 1, ClampToEdgeWrapping: 2, LinearFilter: 3,
    SRGBColorSpace: 'srgb',
    Texture: function () {}, Mesh: function () {}, Points: function () {},
    Sprite: function () {}, Group: function () {}, BufferGeometry: function () {},
    BufferAttribute: function () {}, ShaderMaterial: function () {},
    SphereGeometry: function () {}, PlaneGeometry: function () {},
    Raycaster: function () {}, Vector2: function () {},
  },
  DEG: Math.PI / 180,
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => {},
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);

/* --- URUTAN PERSIS SEPERTI build.js --- */
const urutan = [
  '12-stars-data.js',       /* STARS_LABELED, STARS_OTHER */
  '13-constellations-data.js', /* CONSTELLATIONS */
  '36-search.js',           /* SEARCH (dimuat SEBELUM 18-stars.js!) */
  '18-stars.js',            /* DEEP_SKY, starField, SKY_RADIUS */
];

console.log('='.repeat(70));
console.log('DIAGNOSTIK PENCARIAN — MENIRU URUTAN build.js');
console.log('='.repeat(70));
console.log();
console.log('URUTAN PEMUATAN (sama seperti build.js):');
for (const f of urutan) console.log(`  ${f}`);
console.log();

for (const f of urutan) {
  try {
    vm.runInContext(read(f), ctx, { filename: f });
    /* laporkan variabel penting yang muncul */
    const cek = {
      '12-stars-data.js': ['STARS_LABELED', 'STARS_OTHER'],
      '13-constellations-data.js': ['CONSTELLATIONS'],
      '36-search.js': ['SEARCH'],
      '18-stars.js': ['DEEP_SKY', 'starField'],
    }[f] || [];
    const hasil = cek.map(n => {
      try {
        const v = vm.runInContext(`typeof ${n} !== 'undefined' ? (${n}.length !== undefined ? ${n}.length : 'ada') : 'TIDAK ADA'`, ctx);
        return `${n}=${v}`;
      } catch (e) { return `${n}=ERROR(${e.message.slice(0, 30)})`; }
    });
    console.log(`  OK   ${f.padEnd(28)} ${hasil.join('  ')}`);
  } catch (e) {
    console.log(`  GAGAL ${f.padEnd(28)} ${e.message.slice(0, 60)}`);
  }
}

/* --- bodies tiruan (dibuat aplikasi di 20-scene.js) --- */
ctx.bodies = [
  { name: 'Matahari', key: 'sun', isMoon: false },
  { name: 'Merkurius', key: 'mercury', isMoon: false, aKm: 57900000 },
  { name: 'Venus', key: 'venus', isMoon: false, aKm: 108200000 },
  { name: 'Bumi', key: 'earth', isMoon: false, aKm: 149600000 },
  { name: 'Mars', key: 'mars', isMoon: false, aKm: 227900000 },
  { name: 'Jupiter', key: 'jupiter', isMoon: false, aKm: 778600000 },
  { name: 'Bulan', key: 'moon', isMoon: true, host: { name: 'Bumi' } },
  { name: 'Io', key: 'io', isMoon: true, host: { name: 'Jupiter' } },
];

/* --- bangun indeks seperti aplikasi --- */
console.log();
console.log('MEMBANGUN INDEKS (seperti SEARCH.init() di aplikasi)');
console.log('-'.repeat(70));
let S;
try {
  S = vm.runInContext('SEARCH', ctx);
  S.bangunIndeks();
  const idx = S.indeks || [];
  console.log(`  Total entri: ${idx.length}`);
  console.log();
  const per = {};
  for (const it of idx) per[it.jenis] = (per[it.jenis] || 0) + 1;
  console.log('  Rincian per jenis:');
  for (const [j, n] of Object.entries(per).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${j.padEnd(22)} ${n.toLocaleString('id')}`);
  }
} catch (e) {
  console.log('  GAGAL membangun indeks:', e.message);
  process.exit(1);
}

/* --- uji pencarian nyata --- */
console.log();
console.log('UJI PENCARIAN NYATA');
console.log('-'.repeat(70));
const uji = [
  ['sirius', 'Bintang'], ['vega', 'Bintang'], ['betelgeuse', 'Bintang'],
  ['capella', 'Bintang'], ['canopus', 'Bintang'],
  ['orion', 'Rasi'], ['sagittarius', 'Rasi'], ['cassiopeia', 'Rasi'],
  ['andromeda', 'Galaksi'], ['m31', 'Galaksi'], ['m42', 'Nebula'],
  ['pleiades', 'Gugus'], ['magellan', 'Galaksi'],
  ['jupiter', 'Planet'], ['bulan', 'Satelit'], ['matahari', 'Matahari'],
];
let lulus = 0, gagal = 0;
for (const [q, jenis] of uji) {
  let hasil = [];
  try { hasil = S.cari(q); } catch (e) { hasil = []; }
  const ok = hasil.length > 0;
  if (ok) lulus++; else gagal++;
  const atas = hasil.length ? `${hasil[0].nama} [${hasil[0].jenis}]` : 'TIDAK ADA';
  console.log(`  ${ok ? 'OK   ' : 'GAGAL'} "${q.padEnd(12)}" -> ${atas}`);
}

console.log();
console.log('='.repeat(70));
console.log(`HASIL: ${lulus} lulus, ${gagal} gagal`);
console.log('='.repeat(70));
if (gagal > 0) {
  console.log();
  console.log('PETUNJUK: bila hanya jenis tertentu yang gagal, periksa apakah');
  console.log('variabel sumbernya (STARS_LABELED / CONSTELLATIONS / DEEP_SKY)');
  console.log('terlihat pada urutan pemuatan di atas.');
}
process.exit(gagal > 0 ? 1 : 0);
