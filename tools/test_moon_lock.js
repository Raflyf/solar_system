/* Verifikasi terkunci pasang-surut Bulan (tidally locked).
   Menghitung sudut antara sisi-dekat Bulan dan arah ke Bumi, untuk
   berbagai posisi orbit. Sudut harus ~0 derajat SELALU.

   Jalankan: node tools/test_moon_lock.js */

const MOON_NEAR_SIDE_U = 0.406;

/* sisi dekat dalam kerangka lokal mesh (konvensi UV bola Three.js) */
const phi0 = MOON_NEAR_SIDE_U * Math.PI * 2;
const v0x = Math.cos(phi0), v0z = Math.sin(phi0);

/* sudut rotasi mesh yang BENAR */
function sudutBenar(dx, dz) {
  const L = Math.hypot(dx, dz) || 1;
  return Math.atan2(v0z, v0x) - Math.atan2(-dz / L, -dx / L);
}

/* sudut rotasi kode LAMA (untuk perbandingan) */
function sudutLama(dx, dz) {
  return Math.atan2(dx, dz) + Math.PI;
}

/* berapa derajat sisi dekat menyimpang dari arah ke Bumi */
function penyimpangan(R, dx, dz) {
  const L = Math.hypot(dx, dz) || 1;
  /* arah sisi dekat setelah rotasi R */
  const rx = v0x * Math.cos(R) + v0z * Math.sin(R);
  const rz = -v0x * Math.sin(R) + v0z * Math.cos(R);
  /* arah ke Bumi */
  const tx = -dx / L, tz = -dz / L;
  const dot = Math.max(-1, Math.min(1, rx * tx + rz * tz));
  return Math.acos(dot) * 180 / Math.PI;
}

console.log('='.repeat(70));
console.log('UJI TERKUNCI PASANG-SURUT BULAN');
console.log('Sisi dekat Bulan harus SELALU menghadap Bumi (penyimpangan ~0 derajat)');
console.log('='.repeat(70));
console.log('');

/* 16 posisi orbit, jarak 384.400 km */
const R_ORBIT = 384400 / 6371;   /* dalam unit scene */
console.log('posisi orbit         sudut LAMA    sudut BENAR   penyimpangan');
console.log('                    (penyimpangan)  (penyimpangan)');
console.log('-'.repeat(70));

let maxLama = 0, maxBaru = 0;
for (let i = 0; i < 16; i++) {
  const th = (i / 16) * Math.PI * 2;
  const dx = Math.cos(th) * R_ORBIT;
  const dz = Math.sin(th) * R_ORBIT;

  const RLama = sudutLama(dx, dz);
  const RBaru = sudutBenar(dx, dz);
  const pLama = penyimpangan(RLama, dx, dz);
  const pBaru = penyimpangan(RBaru, dx, dz);

  if (pLama > maxLama) maxLama = pLama;
  if (pBaru > maxBaru) maxBaru = pBaru;

  const derajat = Math.round(th * 180 / Math.PI);
  console.log(
    `orbit ${String(derajat).padStart(3)} deg`.padEnd(20) +
    `${RLama.toFixed(3).padStart(8)}      ${RBaru.toFixed(3).padStart(8)}` +
    `     ${pLama.toFixed(2).padStart(6)} / ${pBaru.toFixed(2)}`
  );
}

console.log('');
console.log('='.repeat(70));
console.log(`Penyimpangan TERBURUK kode lama : ${maxLama.toFixed(2)} derajat`);
console.log(`Penyimpangan TERBURUK kode baru : ${maxBaru.toFixed(2)} derajat`);
console.log('='.repeat(70));
console.log('');
if (maxBaru < 0.01) {
  console.log('HASIL: BENAR. Sisi dekat Bulan selalu menghadap Bumi.');
  console.log('       Permukaan yang terlihat dari Bumi tidak pernah berubah —');
  console.log('       inilah yang seharusnya terjadi pada Bulan nyata.');
} else {
  console.log('HASIL: MASIH ADA PENYIMPANGAN.');
}
console.log('');
console.log(`Perbaikan: ${maxLama.toFixed(1)} deg -> ${maxBaru.toFixed(1)} deg`);
