#!/usr/bin/env node
/* ======================================================================
   AUDIT PROYEK — mencari kesalahan, halusinasi, kecacatan, ketidak-
   konsistensi, dan duplikasi.

   Dijalankan: node tools/audit_project.js
   ====================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'src');

const read = (p) => fs.readFileSync(p, 'utf8');
const ada = (p) => fs.existsSync(p);

const temuan = [];
const catat = (tingkat, kategori, pesan) =>
  temuan.push({ tingkat, kategori, pesan });

/* ---------------- 1. berkas yang dirujuk tapi tidak ada ---------------- */
console.log('=== 1. RUJUKAN BERKAS ===');
const berkasJS = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
let jumlahRujukan = 0;
for (const f of berkasJS) {
  const isi = read(path.join(SRC, f));
  /* cari pola: assets/hi/xxx.jpg atau assets/lo/xxx.jpg */
  const m = isi.matchAll(/assets\/(hi|lo)\/([A-Za-z0-9_.-]+\.(jpg|png))/g);
  for (const hit of m) {
    jumlahRujukan++;
    const p = path.join(ROOT, 'assets', hit[1], hit[2]);
    if (!ada(p)) {
      catat('ERROR', 'berkas-hilang', `${f} merujuk ${hit[1]}/${hit[2]} yang TIDAK ADA`);
    }
  }
}
console.log(`  ${jumlahRujukan} rujukan berkas diperiksa`);

/* ---------------- 2. berkas aset yang tidak dipakai ---------------- */
console.log('\n=== 2. ASET TIDAK TERPAKAI ===');
const semuaIsi = berkasJS.map(f => read(path.join(SRC, f))).join('\n');
for (const uk of ['hi', 'lo']) {
  const dir = path.join(ROOT, 'assets', uk);
  if (!ada(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!semuaIsi.includes(f)) {
      catat('INFO', 'aset-menganggur', `assets/${uk}/${f} tidak dirujuk kode mana pun`);
    }
  }
}

/* ---------------- 3. fungsi yang didefinisikan dobel ---------------- */
console.log('\n=== 3. DEFINISI FUNGSI DOBEL ===');
const defs = {};
for (const f of berkasJS) {
  const isi = read(path.join(SRC, f));
  const m = isi.matchAll(/^(?:function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function|\())/gm);
  for (const hit of m) {
    const nama = hit[1] || hit[2];
    if (!nama) continue;
    (defs[nama] = defs[nama] || []).push(f);
  }
}
for (const [nama, berkas] of Object.entries(defs)) {
  if (berkas.length > 1) {
    catat('WARN', 'definisi-dobel', `${nama}() didefinisikan di: ${berkas.join(', ')}`);
  }
}
console.log(`  ${Object.keys(defs).length} nama fungsi diperiksa`);

/* ---------------- 4. variabel global yang ditulis tapi tak pernah dibaca ---- */
console.log('\n=== 4. PENANDA FITUR MATI ===');
for (const f of berkasJS) {
  const isi = read(path.join(SRC, f));
  const m = isi.matchAll(/(\w+):\s*(true|false),\s*\/\*\s*(DINONAKTIFKAN|NONAKTIF)/g);
  for (const hit of m) {
    catat('INFO', 'fitur-mati', `${f}: ${hit[1]} = ${hit[2]} (${hit[3]})`);
  }
}

/* ---------------- 5. konstanta yang didefinisikan berulang dengan nilai beda - */
console.log('\n=== 5. KONSTANTA BERNILAI BEDA ===');
const konst = {};
for (const f of berkasJS) {
  const isi = read(path.join(SRC, f));
  const m = isi.matchAll(/^const\s+([A-Z][A-Z0-9_]{2,})\s*=\s*([^;]+);/gm);
  for (const hit of m) {
    const nama = hit[1], nilai = hit[2].trim();
    if (!konst[nama]) konst[nama] = [];
    konst[nama].push({ f, nilai });
  }
}
for (const [nama, daftar] of Object.entries(konst)) {
  if (daftar.length > 1) {
    const nilaiUnik = [...new Set(daftar.map(d => d.nilai))];
    if (nilaiUnik.length > 1) {
      catat('WARN', 'konstanta-beda',
        `${nama} punya ${nilaiUnik.length} nilai berbeda: ` +
        daftar.map(d => `${d.f}=${d.nilai}`).join(' | '));
    }
  }
}

/* ---------------- 6. berkas di src/ yang tidak didaftarkan build.js ------ */
console.log('\n=== 6. BERKAS TIDAK DIDAFTARKAN DI BUILD ===');
const build = read(path.join(ROOT, 'build.js'));
for (const f of fs.readdirSync(SRC)) {
  if (!f.endsWith('.js')) continue;
  if (f.endsWith('-data.js')) continue;   /* data didaftarkan terpisah */
  if (!build.includes(f)) {
    catat('ERROR', 'tidak-dibuild', `src/${f} TIDAK didaftarkan di build.js`);
  }
}

/* ---------------- 7. TODO / FIXME / penanda kecacatan ---------------- */
console.log('\n=== 7. PENANDA KECACATAN ===');
for (const f of berkasJS) {
  const isi = read(path.join(SRC, f));
  isi.split('\n').forEach((baris, i) => {
    if (/\b(TODO|FIXME|XXX|HACK|BUG:)\b/.test(baris)) {
      catat('INFO', 'penanda', `${f}:${i + 1} ${baris.trim().slice(0, 90)}`);
    }
  });
}

/* ---------------- 8. angka ajaib yang mencurigakan ---------------- */
console.log('\n=== 8. ANGKA MENCURIGAKAN ===');
for (const f of berkasJS) {
  const isi = read(path.join(SRC, f));
  const m = isi.matchAll(/(\d{6,})/g);
  const besar = new Set();
  for (const hit of m) besar.add(hit[1]);
  for (const n of besar) {
    const v = Number(n);
    if (v > 1e8) catat('WARN', 'angka-besar', `${f}: ${n} (periksa apakah masuk akal)`);
  }
}

/* ---------------- 9. keseimbangan koma pada data bintang ---------------- */
console.log('\n=== 9. INTEGRITAS DATA BINTANG ===');
try {
  const d = read(path.join(SRC, '12-stars-data.js'));
  const c1 = (d.match(/^const STARS_LABELED/m) || []).length;
  const c2 = (d.match(/^const STARS_OTHER/m) || []).length;
  if (c1 !== 1 || c2 !== 1) catat('ERROR', 'data-bintang', 'larik STARS_LABELED/OTHER tidak tepat satu');
  else console.log('  STARS_LABELED & STARS_OTHER: ada, masing-masing satu');
} catch (e) {
  catat('ERROR', 'data-bintang', 'gagal baca 12-stars-data.js');
}

/* ---------------- 10. integritas data rasi ---------------- */
console.log('\n=== 10. INTEGRITAS DATA RASI ===');
try {
  const d = read(path.join(SRC, '13-constellations-data.js'));
  const n = (d.match(/\{"nama"/g) || []).length;
  console.log(`  ${n} rasi ditemukan di data`);
  if (n < 80) catat('WARN', 'data-rasi', `hanya ${n} rasi (seharusnya >= 86)`);
} catch (e) {
  catat('ERROR', 'data-rasi', 'gagal baca 13-constellations-data.js');
}

/* ---------------- RINGKASAN ---------------- */
console.log('\n' + '='.repeat(68));
console.log('RINGKASAN AUDIT');
console.log('='.repeat(68));
const per = { ERROR: [], WARN: [], INFO: [] };
for (const t of temuan) per[t.tingkat].push(t);

for (const tk of ['ERROR', 'WARN', 'INFO']) {
  console.log(`\n${tk} (${per[tk].length}):`);
  if (!per[tk].length) { console.log('  (tidak ada)'); continue; }
  for (const t of per[tk]) console.log(`  [${t.kategori}] ${t.pesan}`);
}
console.log(`\nTOTAL: ${per.ERROR.length} error, ${per.WARN.length} peringatan, ${per.INFO.length} info`);
process.exit(per.ERROR.length > 0 ? 1 : 0);
