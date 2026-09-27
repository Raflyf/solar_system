#!/usr/bin/env node
/* ======================================================================
   UJI RESPONSIF — SEMUA PERANGKAT
   ----------------------------------------------------------------------
   Memeriksa apakah CSS menangani semua ukuran layar penting tanpa celah,
   dengan membaca media query dari berkas CSS.

   Dijalankan: node tools/test_responsive.js
   ====================================================================== */

const fs = require('fs');
const path = require('path');
const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'src');

const css = ['50-style.css', '55-date.css', '56-stars.css']
  .map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');

/* ambil semua media query */
const media = [];
const re = /@media([^{]+)\{/g;
let m;
while ((m = re.exec(css)) !== null) media.push(m[1].trim());

console.log('='.repeat(70));
console.log('UJI RESPONSIF — SEMUA PERANGKAT');
console.log('='.repeat(70));
console.log(`Total media query: ${media.length}`);
console.log();

/* daftar perangkat penting yang HARUS tertangani */
const perangkat = [
  { nama: 'HP sangat kecil (320px)',      w: 320,  h: 568,  cek: 'max-width: 374px' },
  { nama: 'iPhone SE (375px)',            w: 375,  h: 667,  cek: 'max-width: 640px' },
  { nama: 'iPhone 14 (390px)',            w: 390,  h: 844,  cek: 'max-width: 640px' },
  { nama: 'HP besar (428px)',             w: 428,  h: 926,  cek: 'max-width: 640px' },
  { nama: 'Tablet portrait (768px)',      w: 768,  h: 1024, cek: 'min-width: 641px' },
  { nama: 'Tablet landscape (1024px)',    w: 1024, h: 768,  cek: 'max-width: 1180px' },
  { nama: 'Laptop (1366px)',              w: 1366, h: 768,  cek: '(dasar)' },
  { nama: 'Desktop (1920px)',             w: 1920, h: 1080, cek: '(dasar)' },
  { nama: 'Monitor besar (2560px)',       w: 2560, h: 1440, cek: 'min-width: 1921px' },
  { nama: 'HP landscape (844x390)',       w: 844,  h: 390,  cek: 'max-height: 500px' },
];

console.log('PERANGKAT & MEDIA QUERY YANG MENANGANINYA');
console.log('-'.repeat(70));
let lulus = 0, gagal = 0;
for (const d of perangkat) {
  const ada = d.cek === '(dasar)' || css.includes(d.cek);
  if (ada) lulus++; else gagal++;
  console.log(`  ${ada ? 'OK   ' : 'GAGAL'} ${d.nama.padEnd(26)} -> ${d.cek}`);
}

console.log();
console.log('MEDIA QUERY YANG TERDETEKSI');
console.log('-'.repeat(70));
for (const q of media) console.log(`  @media ${q}`);

/* fitur responsif penting */
console.log();
console.log('FITUR RESPONSIF PENTING');
console.log('-'.repeat(70));
/* CATATAN: pemeriksaan viewport harus mengabaikan KOMENTAR, karena teks
   penjelasan menyebut "user-scalable=no" sebagai riwayat (bukan kode
   aktif). Cara: ambil hanya baris <meta name="viewport" ...>. */
const buildSrc = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
const vpMatch = buildSrc.match(/<meta name="viewport" content="([^"]*)"/);
const vpContent = vpMatch ? vpMatch[1] : '';

const fitur = [
  ['Viewport meta ada', !!vpMatch],
  ['Viewport TIDAK memblokir zoom', vpMatch && !/user-scalable=no/.test(vpContent),
    vpContent],
  ['Safe area (layar berponi)', /safe-area-inset/.test(css)],
  ['Target sentuh diperbesar', /pointer:\s*coarse/.test(css)],
  ['Hormati "kurangi gerak"', /prefers-reduced-motion/.test(css)],
  ['Layar sangat besar', /min-width:\s*1921px/.test(css)],
  ['HP landscape', /max-height:\s*500px/.test(css)],
  ['Tablet portrait', /min-width:\s*641px/.test(css)],
  ['Kanvas tidak di-scroll browser', /touch-action:\s*none/.test(css)],
];
for (const [nama, ok, detail] of fitur) {
  if (ok) lulus++; else gagal++;
  console.log(`  ${ok ? 'OK   ' : 'GAGAL'} ${nama}${detail ? '  [' + detail + ']' : ''}`);
}

console.log();
console.log('='.repeat(70));
console.log(`HASIL: ${lulus} lulus, ${gagal} gagal`);
console.log('='.repeat(70));
process.exit(gagal > 0 ? 1 : 0);
