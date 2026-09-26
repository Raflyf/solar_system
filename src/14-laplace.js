/* =======================================================================
   RESONANSI LAPLACE — Io, Europa, Ganymede
   ----------------------------------------------------------------------
   FENOMENA NYATA: tiga satelit terbesar Jupiter terkunci dalam resonansi
   orbital 1:2:4. Selama Ganymede mengelilingi Jupiter satu kali, Europa
   dua kali, dan Io empat kali.

   Yang istimewa adalah HUBUNGAN SUDUT yang tetap:

     phi = lambda_Io - 3 x lambda_Europa + 2 x lambda_Ganymede  ~  180 derajat

   Hubungan ini tidak pernah berubah, dan akibatnya ketiga satelit TIDAK
   PERNAH segaris pada sisi yang sama. Ditemukan Laplace pada 1770-an.

   =======================================================================
   TEMUAN PENTING — TIDAK PERLU KOREKSI BUATAN
   ----------------------------------------------------------------------
   Awalnya saya berencana "memaksa" resonansi ini dengan menggeser posisi
   ketiga satelit. Ternyata TIDAK PERLU: setelah memakai elemen orbit JPL
   yang benar (a, e, omega, M0, node), resonansi Laplace SUDAH terpenuhi
   dengan sendirinya.

   Diukur dari data JPL yang dipakai aplikasi:
     phi pada J2000        = 180,000 derajat  (tepat target)
     laju phi              = -0,0000005 derajat/hari  (praktis nol)
     phi setelah 100 tahun = 179,982 derajat  (tetap terkunci)

   Ini sekaligus BUKTI bahwa data JPL yang diekstrak benar: kalau ada
   satu saja nilai M0 salah, phi tidak akan 180 derajat.

   Jadi modul ini adalah ALAT VERIFIKASI, bukan alat koreksi. Memaksakan
   koreksi tambahan justru akan merusak ketelitian yang sudah ada.
   ======================================================================= */

const LAPLACE_RESONANCE = {
  /* laju rata-rata gerak (derajat per hari) dari JPL */
  Io: 203.4889538,
  Europa: 101.3747235,
  Ganymede: 50.3176081,
  /* sudut resonansi target (derajat) */
  targetPhi: 180.0,
};

/* Hitung sudut resonansi Laplace pada JD tertentu.
   phi = lambda_Io - 3 lambda_Europa + 2 lambda_Ganymede
   Mengembalikan derajat dalam rentang 0..360. */
function laplaceAngle(jd) {
  const d = jd - J2000_JD;
  const r = LAPLACE_RESONANCE;
  const lambdaIo = (r.Io * d) % 360;
  const lambdaEu = (r.Europa * d) % 360;
  const lambdaGa = (r.Ganymede * d) % 360;
  let phi = lambdaIo - 3 * lambdaEu + 2 * lambdaGa;
  phi = phi % 360;
  if (phi < 0) phi += 360;
  return phi;
}

/* Simpangan sudut resonansi dari 180 derajat.
   Nilai kecil (< ~1 derajat) berarti resonansi terkunci dengan baik. */
function laplaceDeviation(jd) {
  const phi = laplaceAngle(jd);
  let dev = phi - LAPLACE_RESONANCE.targetPhi;
  while (dev > 180) dev -= 360;
  while (dev < -180) dev += 360;
  return dev;
}

/* Sudut resonansi dihitung dari elemen orbit LENGKAP (node + omega + M),
   bukan hanya dari laju rata-rata. Ini cara yang dipakai aplikasi,
   karena posisi satelit dihitung dari elemen itu.
   Dipakai oleh uji verifikasi untuk memastikan resonansi tetap terkunci. */
function laplaceAngleFromElements(jd) {
  const d = jd - J2000_JD;
  const el = (typeof SATELLITE_ELEMENTS !== 'undefined') ? SATELLITE_ELEMENTS : null;
  if (!el || !el.Io || !el.Europa || !el.Ganymede) return null;

  /* lambda = node + omega + M + n x d  (bujur rata-rata) */
  function lambda(nama, laju) {
    const s = el[nama];
    return s.node + s.omega + s.M0 + laju * d;
  }
  let phi = lambda('Io', LAPLACE_RESONANCE.Io)
          - 3 * lambda('Europa', LAPLACE_RESONANCE.Europa)
          + 2 * lambda('Ganymede', LAPLACE_RESONANCE.Ganymede);
  phi = phi % 360;
  if (phi < 0) phi += 360;
  return phi;
}
