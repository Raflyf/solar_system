/* Uji modul ephemeris terhadap tanggal gerhana NYATA dari NASA.
   Kalau simulasi menunjukkan gerhana di tanggal yang sama dengan NASA,
   berarti ephemerisnya benar. */

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', '15-ephemeris.js'), 'utf8');
/* jalankan modul di scope global supaya const/function-nya bisa dipakai
   (eval biasa tidak mengekspos deklarasi const ke pemanggil) */
const modul = new Function(src + `
  return { dateToJD, jdToDate, planetPositionAU, moonGeocentric, moonPositionKm,
           earthPositionKm, bodyPositionKm, eclipseState, findEclipses,
           moonPhase, planetElongation, DEG, AU_KM };
`)();
const { dateToJD, eclipseState, moonGeocentric, planetPositionAU, DEG } = modul;

/* tanggal gerhana nyata dari NASA (eclipse.gsfc.nasa.gov) */
const GERHANA_NYATA = [
  // [tanggal UTC, jenis, tipe]
  ['2024-04-08T18:18:00Z', 'matahari', 'Total'],
  ['2024-10-02T18:46:00Z', 'matahari', 'Cincin'],
  ['2025-03-29T10:48:00Z', 'matahari', 'Sebagian'],
  ['2026-02-17T12:13:00Z', 'matahari', 'Cincin'],
  ['2026-08-12T17:47:00Z', 'matahari', 'Total'],
  ['2027-02-06T16:00:00Z', 'matahari', 'Cincin'],
  ['2027-08-02T10:07:00Z', 'matahari', 'Total'],
  ['2028-07-22T02:56:00Z', 'matahari', 'Total'],
  ['2024-03-25T07:13:00Z', 'bulan', 'Penumbra'],
  ['2024-09-18T02:45:00Z', 'bulan', 'Sebagian'],
  ['2025-03-14T06:59:00Z', 'bulan', 'Total'],
  ['2025-09-07T18:12:00Z', 'bulan', 'Total'],
  ['2026-03-03T11:34:00Z', 'bulan', 'Total'],
  ['2026-08-28T04:14:00Z', 'bulan', 'Sebagian'],
  ['2028-12-31T16:53:00Z', 'bulan', 'Total'],
  ['2029-06-26T03:23:00Z', 'bulan', 'Total'],
];

console.log('='.repeat(76));
console.log('UJI EPHEMERIS TERHADAP GERHANA NYATA (sumber: NASA)');
console.log('='.repeat(76));
console.log('');

let benar = 0, salah = 0;
for (const [iso, tipe, namaNASA] of GERHANA_NYATA) {
  const jd = dateToJD(new Date(iso));
  const st = eclipseState(jd);
  const ada = tipe === 'matahari' ? st.solar : st.lunar;

  if (ada) {
    benar++;
    const sepDeg = st.gamma;
    console.log(`  OK    ${iso.slice(0, 16)}  ${tipe.padEnd(8)} NASA=${namaNASA.padEnd(9)} ` +
                `simulasi=${ada.jenis.padEnd(9)} mag=${ada.magnitudo.toFixed(3)} gamma=${sepDeg.toFixed(3)}`);
  } else {
    salah++;
    const sepDeg = st.gamma;
    console.log(`  GAGAL ${iso.slice(0, 16)}  ${tipe.padEnd(8)} NASA=${namaNASA.padEnd(9)} ` +
                `tidak terdeteksi (gamma=${sepDeg.toFixed(3)})`);
  }
}

console.log('');
console.log(`TERDETEKSI: ${benar}/${GERHANA_NYATA.length}`);
console.log('');

/* ---- uji: pastikan TIDAK ada gerhana di tanggal acak ---- */
console.log('='.repeat(76));
console.log('UJI NEGATIF: tanggal tanpa gerhana seharusnya bersih');
console.log('='.repeat(76));
const TANPA_GERHANA = ['2025-01-15T12:00:00Z', '2025-06-20T00:00:00Z',
                       '2026-05-10T06:00:00Z', '2027-11-05T18:00:00Z'];
let falsePos = 0;
for (const iso of TANPA_GERHANA) {
  const st = eclipseState(dateToJD(new Date(iso)));
  const adaS = st.solar, adaL = st.lunar;
  if (adaS || adaL) {
    falsePos++;
    console.log(`  POSITIF PALSU ${iso.slice(0,10)}: solar=${!!adaS} lunar=${!!adaL}`);
  } else {
    console.log(`  bersih ${iso.slice(0,10)}  (gamma=${st.gamma.toFixed(3)})`);
  }
}
console.log('');
console.log(`positif palsu: ${falsePos}/${TANPA_GERHANA.length}`);
