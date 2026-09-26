/* Verifikasi logika tanpa browser.
   Meniru perhitungan yang dipakai aplikasi untuk menentukan apakah
   satelit terlihat di layar setelah perbaikan. */

const RAD = 6371, MOON_ORBIT_FACTOR = 1.0;
const FOV = 50, H = 568;                 // layar uji
const tanHalf = Math.tan((FOV / 2) * Math.PI / 180);

/* data nyata dari src/10-data.js */
const PLANETS = [
  { nama: 'Bumi',      radiusKm: 6371,   aKm: 149598023, bulan: [{ n:'Bulan',    r:1737.4, a:384400 }] },
  { nama: 'Mars',      radiusKm: 3390,   aKm: 227939366, bulan: [{ n:'Phobos',   r:11.3,   a:9376 },
                                                                 { n:'Deimos',   r:6.2,    a:23463 }] },
  { nama: 'Jupiter',   radiusKm: 71492,  aKm: 778570000, bulan: [{ n:'Io',       r:1821.6, a:421800 },
                                                                 { n:'Europa',   r:1560.8, a:671100 },
                                                                 { n:'Ganymede', r:2634.1, a:1070400 },
                                                                 { n:'Callisto', r:2410.3, a:1882700 }] },
  { nama: 'Saturnus',  radiusKm: 60268,  aKm: 1433530000, bulan: [{ n:'Titan',   r:2574.7, a:1221870 },
                                                                  { n:'Rhea',    r:763.8,  a:527040 },
                                                                  { n:'Iapetus', r:734.5,  a:3560820 }] },
  { nama: 'Uranus',    radiusKm: 25559,  aKm: 2872460000, bulan: [{ n:'Titania', r:788.9,  a:435910 }] },
  { nama: 'Neptunus',  radiusKm: 24764,  aKm: 4495060000, bulan: [{ n:'Triton',  r:1353.4, a:354759 }] },
];

function jarakFokusAwal(p) {
  const rU = p.radiusKm / RAD;
  let initial = rU * 3.2;
  let farthest = 0;
  for (const m of (p.bulan || [])) {
    const d = (m.a / RAD) * MOON_ORBIT_FACTOR;
    if (d > farthest) farthest = d;
  }
  if (farthest > 0) initial = Math.max(initial, farthest * 1.45);
  return { rU, initial, farthest };
}

console.log('Verifikasi: apakah satelit masuk layar saat planet difokuskan?\n');
console.log('planet     fokusDist  satelit      jarakOrbit  posisiLayar  masuk?');
console.log('-'.repeat(78));

let semuaMasuk = true;
for (const p of PLANETS) {
  const { rU, initial } = jarakFokusAwal(p);
  // setengah lebar pandangan pada jarak fokus (FOV vertikal 50 deg, layar 16:9)
  const setengahTinggi = initial * tanHalf;
  const setengahLebar = setengahTinggi * (1262 / H);
  for (const m of p.bulan) {
    const d = (m.a / RAD) * MOON_ORBIT_FACTOR;
    const px = (m.r / RAD) / initial * (H * 0.5) / tanHalf;
    const masuk = d <= setengahLebar;
    if (!masuk) semuaMasuk = false;
    console.log(
      `${p.nama.padEnd(10)} ${initial.toFixed(0).padStart(8)}  ${m.n.padEnd(10)} ` +
      `${d.toFixed(0).padStart(10)}  ${(d / setengahLebar * 100).toFixed(0).padStart(9)}%  ` +
      `${masuk ? 'ya' : 'TIDAK'}   (bodi ${px.toFixed(2)}px)`
    );
  }
}

console.log('\n' + '='.repeat(78));
console.log(semuaMasuk
  ? 'HASIL: SEMUA satelit masuk layar saat induknya difokuskan.'
  : 'HASIL: masih ada satelit di luar layar.');

/* perbandingan sebelum vs sesudah perbaikan (Jupiter) */
const jup = PLANETS[2];
const lama = (jup.radiusKm / RAD) * 3.2;
const { initial: baru } = jarakFokusAwal(jup);
const lebarLama = lama * tanHalf * (1262 / H);
const lebarBaru = baru * tanHalf * (1262 / H);
console.log('\nPerbandingan Jupiter:');
console.log(`  sebelum: fokus ${lama.toFixed(1)} unit, tepi layar ${lebarLama.toFixed(1)} unit` +
  ` -> Callisto (${(1882700 / RAD).toFixed(0)}) ${(1882700 / RAD) <= lebarLama ? 'masuk' : 'DI LUAR LAYAR'}`);
console.log(`  sesudah: fokus ${baru.toFixed(1)} unit, tepi layar ${lebarBaru.toFixed(1)} unit` +
  ` -> Callisto ${(1882700 / RAD) <= lebarBaru ? 'MASUK' : 'di luar'}`);
