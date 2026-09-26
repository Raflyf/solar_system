/* Verifikasi rotasi SEMUA planet & satelit terhadap data IAU.
   Menguji: apakah sudut rotasi dan periode yang dipakai sesuai kenyataan?

   Jalankan: node tools/test_rotation.js */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* muat modul rotasi + konstanta */
const src = read('src/16-rotation.js');
const mod = new Function('J2000_JD', 'DEG', src + `
  return { IAU_ROTATION, IAU_SATELLITE_ROTATION, planetRotationAngle,
           planetAxialTilt, isTidallyLocked };
`)(2451545.0, Math.PI / 180);

console.log('='.repeat(78));
console.log('UJI ROTASI SEMUA PLANET (data IAU WGCCRE 2015)');
console.log('='.repeat(78));
console.log('');

/* periode rotasi nyata (jam) dari sumber yang sama */
const PERIODE_NYATA = {
  sun: 609.12, mercury: 1407.6, venus: -5832.5, earth: 23.9345,
  mars: 24.6229, jupiter: 9.925, saturn: 10.656, uranus: -17.24,
  neptune: 16.11,
};
const NAMA = {
  sun: 'Matahari', mercury: 'Merkurius', venus: 'Venus', earth: 'Bumi',
  mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturnus', uranus: 'Uranus',
  neptune: 'Neptunus',
};

console.log('planet      W0         Wdot        periode hitung   nyata    selisih');
console.log('-'.repeat(78));

let ok = 0, total = 0;
for (const [key, r] of Object.entries(mod.IAU_ROTATION)) {
  if (key === 'moon') continue;
  total++;
  /* periode = 360 / |Wdot| hari -> jam */
  const periodeJam = 360 / Math.abs(r.wdot) * 24;
  const nyata = PERIODE_NYATA[key];
  const selisih = Math.abs(periodeJam - Math.abs(nyata)) / Math.abs(nyata) * 100;
  const cocok = selisih < 1.0;
  if (cocok) ok++;

  console.log(
    NAMA[key].padEnd(11) +
    r.w0.toFixed(3).padStart(10) +
    r.wdot.toFixed(4).padStart(13) +
    (periodeJam.toFixed(3) + ' jam').padStart(16) +
    (nyata + ' jam').padStart(11) +
    (selisih.toFixed(2) + '%').padStart(10) +
    (cocok ? '  OK' : '  CEK')
  );
}
console.log('');
console.log(`periode cocok: ${ok}/${total}`);

console.log('');
console.log('UJI ARAH ROTASI (prograde/retrograde)');
console.log('-'.repeat(78));
const RETRO = ['venus', 'uranus'];
let arahOK = 0;
for (const [key, r] of Object.entries(mod.IAU_ROTATION)) {
  if (key === 'moon') continue;
  const retro = r.wdot < 0;
  const seharusnya = RETRO.includes(key);
  const cocok = retro === seharusnya;
  if (cocok) arahOK++;
  console.log(`  ${NAMA[key].padEnd(11)} Wdot ${r.wdot > 0 ? 'positif (prograde)' : 'negatif (retrograde)'}` +
              `   ${cocok ? 'OK' : 'SALAH'}`);
}
console.log('');
console.log(`arah rotasi cocok: ${arahOK}/${total}`);
console.log('  (Venus dan Uranus memang retrograde di kenyataan)');

console.log('');
console.log('UJI KEMIRINGAN POROS');
console.log('-'.repeat(78));
const TILT_NYATA = {
  mercury: 0.034, venus: 177.36, earth: 23.44, mars: 25.19,
  jupiter: 3.13, saturn: 26.73, uranus: 97.77, neptune: 28.32,
};
let tiltOK = 0, tiltN = 0;
for (const [key, nyata] of Object.entries(TILT_NYATA)) {
  tiltN++;
  const dipakai = mod.planetAxialTilt(key);
  const selisih = Math.abs(dipakai - nyata);
  const cocok = selisih < 0.5;
  if (cocok) tiltOK++;
  console.log(`  ${NAMA[key].padEnd(11)} ${dipakai.toFixed(2).padStart(7)} derajat  (nyata ${nyata})  ${cocok ? 'OK' : 'CEK'}`);
}
console.log('');
console.log(`kemiringan poros cocok: ${tiltOK}/${tiltN}`);

console.log('');
console.log('UJI SATELIT TERKUNCI PASANG-SURUT');
console.log('-'.repeat(78));
/* Semua satelit besar terkunci: Wdot harus sama dengan 360/periode orbit */
const PERIODE_ORBIT = {
  'Bulan': 27.321661, 'Phobos': 0.318910, 'Deimos': 1.26244,
  'Io': 1.769138, 'Europa': 3.551181, 'Ganymede': 7.154553,
  'Callisto': 16.689018, 'Titan': 15.945421, 'Rhea': 4.518212,
  'Iapetus': 79.3215, 'Titania': 8.705872, 'Triton': 5.876854,
};
let lockOK = 0, lockN = 0;
for (const [nama, periodeHari] of Object.entries(PERIODE_ORBIT)) {
  lockN++;
  const s = mod.IAU_SATELLITE_ROTATION[nama];
  if (!s) { console.log(`  ${nama.padEnd(11)} TIDAK ADA DATA`); continue; }
  const wdotHarusnya = 360 / periodeHari;
  const selisih = Math.abs(Math.abs(s.wdot) - wdotHarusnya) / wdotHarusnya * 100;
  const cocok = selisih < 0.5 && s.tidallyLocked;
  if (cocok) lockOK++;
  console.log(`  ${nama.padEnd(11)} Wdot ${s.wdot.toFixed(4).padStart(12)}` +
              `  harusnya ${wdotHarusnya.toFixed(4).padStart(12)}` +
              `  selisih ${selisih.toFixed(2).padStart(5)}%  ${cocok ? 'OK' : 'CEK'}`);
}
console.log('');
console.log(`satelit terkunci benar: ${lockOK}/${lockN}`);
console.log('  (Wdot = 360/periode orbit berarti sisi dekat selalu menghadap induk)');

console.log('');
console.log('='.repeat(78));
console.log('RINGKASAN');
console.log('='.repeat(78));
console.log(`  Periode rotasi planet     : ${ok}/${total}`);
console.log(`  Arah rotasi (retrograde)  : ${arahOK}/${total}`);
console.log(`  Kemiringan poros          : ${tiltOK}/${tiltN}`);
console.log(`  Satelit terkunci          : ${lockOK}/${lockN}`);
console.log('='.repeat(78));
