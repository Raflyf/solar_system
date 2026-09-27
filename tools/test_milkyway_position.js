#!/usr/bin/env node
/* ======================================================================
   UJI POSISI BIMA SAKTI TERHADAP RASI BINTANG
   ----------------------------------------------------------------------
   Tujuan: membuktikan apakah pita Bima Sakti di aplikasi berada di
   posisi yang BENAR menurut astronomi, dan menjelaskan kenapa berbeda
   dari Stellarium.

   Metode:
     1. Hitung posisi (altitude/azimut) seluruh bidang galaksi (b=0)
        untuk pengaturan aplikasi: Jakarta, 27 Sep 2026 19:43 WIB.
     2. Cari rasi bintang mana yang DILEWATI pita itu.
     3. Ulangi untuk pengaturan Stellarium (lokasi fallback Paris, karena
        layar Stellarium menunjukkan "UNKNOWN").
     4. Bandingkan — apakah perbedaannya karena BUG atau karena LOKASI.

   Acuan rumus: Meeus, Astronomical Algorithms (GMST rumus 12.4;
   transformasi alt-az bab 13). Matriks galaktik IAU 1958.

   Jalankan: node tools/test_milkyway_position.js
   ====================================================================== */

const DEG = Math.PI / 180;

function jd(y, m, d, jam) {
  let Y = y, M = m;
  if (M <= 2) { Y -= 1; M += 12; }
  const A = Math.floor(Y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1))
    + d + B - 1524.5 + jam / 24;
}
function gmst(jd_) {
  const T = (jd_ - 2451545.0) / 36525.0;
  let g = 280.46061837 + 360.98564736629 * (jd_ - 2451545.0)
    + 0.000387933 * T * T - T * T * T / 38710000.0;
  return ((g % 360) + 360) % 360;
}
function altAz(raDeg, decDeg, latDeg, lonDeg, J) {
  const lst = (gmst(J) + lonDeg + 360) % 360;
  const H = (((lst - raDeg + 540) % 360) - 180) * DEG;
  const d = decDeg * DEG, p = latDeg * DEG;
  const alt = Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H)) / DEG;
  let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(p) - Math.tan(d) * Math.cos(p)) / DEG;
  return { alt, az: (az + 180 + 360) % 360, lst };
}

/* matriks galaktik -> ekuator J2000 (IAU) */
const Mge = [
  [-0.0548755604, 0.4941094279, -0.8676661490],
  [-0.8734370902, -0.4448296300, -0.1980763734],
  [-0.4838350155, 0.7469822445, 0.4559837762],
];
function galKeEkuator(l, b) {
  const lg = l * DEG, bg = b * DEG;
  const xg = Math.cos(bg) * Math.cos(lg), yg = Math.cos(bg) * Math.sin(lg), zg = Math.sin(bg);
  const xe = Mge[0][0] * xg + Mge[0][1] * yg + Mge[0][2] * zg;
  const ye = Mge[1][0] * xg + Mge[1][1] * yg + Mge[1][2] * zg;
  const ze = Mge[2][0] * xg + Mge[2][1] * yg + Mge[2][2] * zg;
  return {
    ra: ((Math.atan2(ye, xe) / DEG) % 360 + 360) % 360,
    dec: Math.asin(Math.max(-1, Math.min(1, ze))) / DEG,
  };
}

/* pusat rasi bintang (RA°, Dec°) — dari katalog IAU */
const rasi = [
  ['Sagittarius', 285, -25], ['Scorpius', 247, -30], ['Ophiuchus', 258, -8],
  ['Aquila', 298, 3], ['Scutum', 280, -10], ['Serpens', 280, 0],
  ['Cygnus', 310, 42], ['Lyra', 285, 36], ['Vulpecula', 302, 24],
  ['Cassiopeia', 15, 60], ['Cepheus', 335, 70], ['Lacerta', 340, 45],
  ['Perseus', 50, 45], ['Auriga', 90, 42], ['Taurus', 65, 17],
  ['Orion', 83, 2], ['Gemini', 105, 22], ['Monoceros', 110, -3],
  ['Canis Major', 105, -22], ['Puppis', 120, -32], ['Vela', 140, -47],
  ['Carina', 150, -62], ['Crux', 187, -60], ['Centaurus', 200, -47],
  ['Musca', 180, -70], ['Chamaeleon', 160, -78], ['Volans', 110, -70],
  ['Dorado', 75, -60], ['Mensa', 80, -78], ['Hydrus', 40, -70],
  ['Tucana', 355, -62], ['Phoenix', 15, -45], ['Grus', 330, -46],
  ['Indus', 315, -55], ['Microscopium', 315, -33], ['Piscis Austrinus', 340, -30],
  ['Aquarius', 335, -10], ['Pisces', 15, 12], ['Pegasus', 340, 20],
  ['Andromeda', 10, 38], ['Aries', 40, 20], ['Cetus', 25, -10],
  ['Fornax', 40, -30], ['Sculptor', 15, -32], ['Octans', 340, -85],
  ['Pavo', 295, -65], ['Apus', 240, -75], ['Ara', 255, -55],
  ['Norma', 245, -50], ['Triangulum Australe', 240, -63],
  ['Circinus', 220, -60], ['Lupus', 230, -43], ['Libra', 230, -15],
  ['Virgo', 190, -2], ['Leo', 160, 15], ['Hydra', 150, -15],
];

/* --- pengaturan yang diuji --- */
const kasus = [
  { nama: 'APLIKASI: Jakarta, 19:43 WIB', lat: -6.2, lon: 106.8, J: jd(2026, 9, 27, 12.72) },
  { nama: 'Stellarium (layar user): Jakarta, 21:29 WIB', lat: -6.2, lon: 106.8, J: jd(2026, 9, 27, 14.48) },
  { nama: 'Stellarium "UNKNOWN" -> fallback PARIS', lat: 48.86, lon: 2.35, J: jd(2026, 9, 27, 19.48) },
];

console.log('='.repeat(78));
console.log('UJI POSISI BIMA SAKTI TERHADAP RASI BINTANG');
console.log('='.repeat(78));

for (const k of kasus) {
  console.log();
  console.log('### ' + k.nama);
  console.log(`    Lintang ${k.lat}°, Bujur ${k.lon}°, JD ${k.J.toFixed(4)}`);
  const uji0 = altAz(266.4, -28.9, k.lat, k.lon, k.J);
  console.log(`    LST = ${uji0.lst.toFixed(2)}°`);
  console.log();
  console.log('    BIDANG GALAKSI (b=0) — posisi di langit:');
  console.log('    l bujur | RA      | Dec     | Altitude | Azimut  | Terlihat');
  console.log('    --------|---------|---------|----------|---------|----------');
  const terlihat = [];
  for (let l = 0; l < 360; l += 30) {
    const eq = galKeEkuator(l, 0);
    const a = altAz(eq.ra, eq.dec, k.lat, k.lon, k.J);
    const ya = a.alt > 5;
    if (ya) terlihat.push({ l, ...eq, ...a });
    console.log(`    ${String(l).padStart(3)}°    | ${eq.ra.toFixed(1).padStart(6)}° | ${eq.dec.toFixed(1).padStart(6)}° | `
      + `${a.alt.toFixed(1).padStart(7)}° | ${a.az.toFixed(1).padStart(6)}° | ${ya ? 'YA' : 'tidak'}`);
  }
  console.log();
  /* rasi mana yang dilewati pita? (dalam 15° dari bidang galaksi, di atas horizon) */
  const dilewati = [];
  for (const [nama, ra, dec] of rasi) {
    /* hitung jarak ke bidang galaksi */
    const xe = Math.cos(dec * DEG) * Math.cos(ra * DEG);
    const ye = Math.cos(dec * DEG) * Math.sin(ra * DEG);
    const ze = Math.sin(dec * DEG);
    const zg = Mge[2][0] * xe + Mge[2][1] * ye + Mge[2][2] * ze;
    const b = Math.asin(Math.max(-1, Math.min(1, zg))) / DEG;
    const a = altAz(ra, dec, k.lat, k.lon, k.J);
    if (Math.abs(b) < 20 && a.alt > 0) {
      dilewati.push(`${nama} (b=${b.toFixed(0)}°, alt=${a.alt.toFixed(0)}°)`);
    }
  }
  console.log('    RASI YANG DILEWATI PITA (|b|<20°, di atas horizon):');
  console.log('      ' + (dilewati.length ? dilewati.join(', ') : '(tidak ada)'));
}

/* --- kesimpulan --- */
console.log();
console.log('='.repeat(78));
console.log('KESIMPULAN');
console.log('='.repeat(78));
const jk = kasus[0], pr = kasus[2];
const gcJk = altAz(266.4, -28.9, jk.lat, jk.lon, jk.J);
const gcPr = altAz(266.4, -28.9, pr.lat, pr.lon, pr.J);
console.log(`Pusat galaksi dari Jakarta   : altitude ${gcJk.alt.toFixed(1)}°, azimut ${gcJk.az.toFixed(1)}°`);
console.log(`Pusat galaksi dari Paris     : altitude ${gcPr.alt.toFixed(1)}°, azimut ${gcPr.az.toFixed(1)}°`);
console.log();
console.log('Bila Stellarium Anda memakai lokasi fallback (bukan Jakarta),');
console.log('seluruh posisi Bima Sakti akan berbeda TOTAL — bukan karena bug,');
console.log('tetapi karena pengamatnya memang berada di tempat berbeda.');
