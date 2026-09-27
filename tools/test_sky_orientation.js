#!/usr/bin/env node
/* ======================================================================
   UJI ORIENTASI LANGIT — SIMULASI PENUH PIPELINE SHADER
   ----------------------------------------------------------------------
   Tujuan: membuktikan apakah benda langit muncul di ARAH YANG BENAR,
   dengan mensimulasikan persis apa yang dilakukan shader + tekstur.

   Alur yang disimulasikan (sama seperti GPU):
     1. Arah pandang scene  <- dari RA/Dec objek (lewat eqVecToScene)
     2. Shader hitung uv    <- xe=d.x, ye=-c*d.z-s*d.y, ze=-s*d.z+c*d.y,
                               lon=atan(xe,ye), zen=acos(-ze),
                               uv=(lon/2pi+0.5, zen/pi)
     3. Sampling tekstur    <- menerapkan semantik flipY Three.js:
                                 flipY=true  (default) : baris dibaca dari BAWAH
                                 flipY=false           : baris dibaca dari ATAS
     4. Periksa kecerahan   <- objek terang harus jatuh di piksel terang

   Objek uji dipilih yang posisinya PASTI dan kontras tinggi:
     TERANG: LMC, SMC, pusat galaksi, Nebula Orion, Carina, Lagoon
     GELAP : kutub galaksi utara (b=+90), kutub galaksi selatan (b=-90)

   Jalankan: node tools/test_sky_orientation.js
   ====================================================================== */

const fs = require('fs');
const path = require('path');
const ROOT = path.dirname(__dirname);
const DEG = Math.PI / 180;

/* --- geometri berkas PPM: kita baca JPEG lewat modul gambar sederhana ---
   Node tidak punya dekoder JPEG bawaan, jadi tekstur dibaca lewat berkas
   bantu yang dihasilkan Python (tools/_tex_gray.json). Bila tidak ada,
   uji dilewati dengan pesan jelas. */
const GRAY = path.join(ROOT, '_tex_gray.json');
if (!fs.existsSync(GRAY)) {
  console.log('Berkas _tex_gray.json tidak ada.');
  console.log('Jalankan dulu: python tools/dump_tex_gray.py');
  process.exit(2);
}
const tex = JSON.parse(fs.readFileSync(GRAY, 'utf8'));
const TW = tex.w, TH = tex.h, PX = tex.data;   /* data: array abu-abu 0..255 */

/* ambil kecerahan pada (u, v_file) — v_file sudah dalam koordinat BERKAS
   (0 = baris atas) */
function baca(u, vFile, rad = 12) {
  let uu = u % 1; if (uu < 0) uu += 1;
  let vv = Math.max(0, Math.min(1, vFile));
  const x = Math.round(uu * TW) % TW;
  const y = Math.max(0, Math.min(TH - 1, Math.round(vv * TH)));
  let jum = 0, n = 0;
  for (let dy = -rad; dy <= rad; dy += 4) {
    for (let dx = -rad; dx <= rad; dx += 4) {
      const xx = ((x + dx) % TW + TW) % TW;
      const yy = Math.max(0, Math.min(TH - 1, y + dy));
      jum += PX[yy * TW + xx]; n++;
    }
  }
  return jum / n;
}

/* --- transformasi yang sama dengan shader --- */
const C = Math.cos(23.4392911 * DEG), S = Math.sin(23.4392911 * DEG);

function shaderUV(raDeg, decDeg) {
  /* 1. RA/Dec -> kerangka scene (sama dengan eqVecToScene) */
  const a = raDeg * DEG, d = decDeg * DEG;
  const xe0 = Math.cos(d) * Math.cos(a);
  const ye0 = Math.cos(d) * Math.sin(a);
  const ze0 = Math.sin(d);
  const sx = xe0;
  const sy = -ye0 * S + ze0 * C;      /* yl */
  const sz = -ye0 * C - ze0 * S;      /* -yl */

  /* 2. shader: scene -> ekuator */
  const xe = sx;
  const ye = -C * sz - S * sy;
  const ze = -S * sz + C * sy;

  /* 3. shader: proyeksi Stellarium */
  const lon = Math.atan2(xe, ye);
  const zen = Math.acos(Math.max(-1, Math.min(1, -ze)));
  const u = lon / (2 * Math.PI) + 0.5;
  const v = zen / Math.PI;
  return { u, v };
}

/* --- objek uji --- */
const terang = [
  ['LMC (Awan Magellan Besar)', 80.9, -69.8],
  ['SMC (Awan Magellan Kecil)', 13.2, -72.8],
  ['Pusat galaksi (Sgr A*)', 266.4, -28.9],
  ['Nebula Orion (M42)', 83.8, -5.4],
  ['Nebula Carina', 161.3, -59.7],
  ['Nebula Lagoon (M8)', 270.9, -24.4],
];
const gelap = [
  ['Kutub galaksi utara', 192.86, 27.13],
  ['Kutub galaksi selatan', 12.86, -27.13],
  ['Kutub langit utara (kontrol)', 0, 89.9],
];

console.log('='.repeat(72));
console.log('UJI ORIENTASI LANGIT — SIMULASI PIPELINE SHADER');
console.log('='.repeat(72));
console.log(`Tekstur: ${TW}x${TH}`);
console.log();

for (const flipY of [true, false]) {
  console.log(`### flipY = ${flipY}  ${flipY ? '(default Three.js)' : '(yang dipakai sekarang)'}`);
  console.log();
  console.log('  OBJEK TERANG (harus jatuh di piksel TERANG):');
  let benar = 0;
  for (const [nama, ra, dec] of terang) {
    const { u, v } = shaderUV(ra, dec);
    /* semantik flipY: bila true, baris dibaca dari bawah */
    const vFile = flipY ? (1 - v) : v;
    const lum = baca(u, vFile);
    const ok = lum > 25;
    if (ok) benar++;
    console.log(`    ${nama.padEnd(28)} uv=(${u.toFixed(3)},${v.toFixed(3)}) -> lum ${lum.toFixed(1).padStart(6)}  ${ok ? 'OK' : 'GELAP!'}`);
  }
  console.log();
  console.log('  OBJEK GELAP (harus jatuh di piksel GELAP):');
  let benarGelap = 0;
  for (const [nama, ra, dec] of gelap) {
    const { u, v } = shaderUV(ra, dec);
    const vFile = flipY ? (1 - v) : v;
    const lum = baca(u, vFile);
    const ok = lum < 20;
    if (ok) benarGelap++;
    console.log(`    ${nama.padEnd(28)} uv=(${u.toFixed(3)},${v.toFixed(3)}) -> lum ${lum.toFixed(1).padStart(6)}  ${ok ? 'OK' : 'TERANG!'}`);
  }
  console.log();
  console.log(`  SKOR: ${benar}/${terang.length} terang benar + ${benarGelap}/${gelap.length} gelap benar`
    + ` = ${benar + benarGelap}/${terang.length + gelap.length}`);
  console.log();
}

console.log('='.repeat(72));
console.log('CARA MEMBACA HASIL');
console.log('='.repeat(72));
console.log('Yang benar adalah konfigurasi dengan SKOR TERTINGGI.');
console.log('Objek terang (LMC, SMC, pusat galaksi) HARUS muncul di piksel terang,');
console.log('dan kutub galaksi HARUS di piksel gelap.');
