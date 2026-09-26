/* =======================================================================
   ROTASI NYATA SEMUA PLANET & SATELIT
   ----------------------------------------------------------------------
   Sumber: IAU Working Group on Cartographic Coordinates and Rotational
   Elements (WGCCRE 2015, Archinal et al.), tabel 1 & 2.
   https://doi.org/10.1007/s10569-017-9805-5

   Setiap benda punya:
     W0     = bujur meridian utama pada epoch J2000 (derajat)
     Wdot   = laju rotasi (derajat per hari), NEGATIF = retrograde
     axialTilt = kemiringan poros terhadap bidang orbit (derajat)
     northPoleTilt = kemiringan tambahan agar kutub menunjuk arah nyata

   Rumus IAU:
     W(t) = W0 + Wdot × d        (d = hari sejak J2000)

   W adalah sudut meridian utama benda, diukur dari titik simpul
   ekuatornya. Untuk keperluan tampilan 3D, W menentukan berapa derajat
   permukaan benda sudah berputar — inilah yang membuat jam lokal dan
   posisi benua sesuai kenyataan.

   KENAPA PENTING: tanpa W0, rotasi dihitung dari nol (sembarang), jadi
   permukaan benda tidak berada di posisi yang benar. Contoh Bumi: W0
   memberi koreksi ~280°, tanpa itu Indonesia tampak gelap padahal masih
   pagi.
   ======================================================================= */

const IAU_ROTATION = {
  /* --- MATAHARI --- */
  sun: {
    w0: 84.176, wdot: 14.1844000,
    tilt: 7.25,               /* terhadap ekliptika */
    nama: 'Matahari',
  },

  /* --- MERKURIUS --- */
  /* Rotasi 3:2 dengan orbit — 58,646 hari sekali putar */
  mercury: {
    w0: 329.5988, wdot: 6.1385108,
    tilt: 0.034,
    nama: 'Merkurius',
  },

  /* --- VENUS: RETROGRADE --- */
  /* Wdot negatif = berputar terbalik. Periode 243,025 hari */
  venus: {
    w0: 160.20, wdot: -1.4813688,
    tilt: 177.36,             /* hampir terbalik total */
    nama: 'Venus',
  },

  /* --- BUMI --- */
  /* W0 & Wdot dari IAU. GMST lebih presisi untuk Bumi, jadi kode memakai
     GMST — tapi nilai IAU ini disertakan agar konsisten. */
  earth: {
    w0: 190.147, wdot: 360.9856235,
    tilt: 23.4392911,
    nama: 'Bumi',
  },

  /* --- BULAN --- */
  /* Terkunci pasang-surut: Wdot = 13,17635815°/hari = 360/27,3216 hari,
     persis sama dengan periode orbit siderisnya. Inilah bukti matematis
     bahwa Bulan selalu menghadap Bumi. */
  moon: {
    w0: 38.3213, wdot: 13.17635815,
    tilt: 6.68,               /* terhadap ekliptika */
    nama: 'Bulan',
  },

  /* --- MARS --- */
  mars: {
    w0: 176.049863, wdot: 350.891982443297,
    tilt: 25.19,
    nama: 'Mars',
  },

  /* --- JUPITER --- */
  /* Rotasi tercepat: 9 jam 55 menit */
  jupiter: {
    w0: 284.95, wdot: 870.5360000,
    tilt: 3.13,
    nama: 'Jupiter',
  },

  /* --- SATURNUS --- */
  saturn: {
    w0: 38.90, wdot: 810.7939024,
    tilt: 26.73,
    nama: 'Saturnus',
  },

  /* --- URANUS: RETROGRADE (poros 97,8°) --- */
  /* Uranus "berputar miring" — porosnya hampir sejajar bidang orbit */
  uranus: {
    w0: 203.81, wdot: -501.1600928,
    tilt: 97.77,
    nama: 'Uranus',
  },

  /* --- NEPTUNUS --- */
  neptune: {
    w0: 249.978, wdot: 541.1397757,
    tilt: 28.32,
    nama: 'Neptunus',
  },
};

/* =======================================================================
   SATELIT — semuanya TERKUNCI PASANG-SURUT
   ----------------------------------------------------------------------
   Sesuai hukum fisika pasang-surut, SEMUA satelit besar di tata surya
   terkunci: periode rotasinya sama dengan periode orbitnya. Jadi sisi
   yang menghadap induknya selalu sama — persis seperti Bulan terhadap Bumi.

   Konsekuensinya: untuk satelit, sudut rotasi TIDAK dihitung dari W0,
   melainkan dari arah satelit terhadap induknya (lihat spinAngle di
   computePositions). Wdot yang tercatat di sini hanyalah konfirmasi
   bahwa laju rotasi = laju orbit.
   ======================================================================= */

const IAU_SATELLITE_ROTATION = {
  /* satelit Bumi */
  'Bulan':     { wdot: 13.17635815,  tidallyLocked: true },
  /* satelit Mars */
  'Phobos':    { wdot: 1128.84475928, tidallyLocked: true },
  'Deimos':    { wdot: 285.1618970,  tidallyLocked: true },
  /* satelit Jupiter (Galilean) */
  'Io':        { wdot: 203.4889538,  tidallyLocked: true },
  'Europa':    { wdot: 101.3747235,  tidallyLocked: true },
  'Ganymede':  { wdot: 50.3176081,   tidallyLocked: true },
  'Callisto':  { wdot: 21.5710715,   tidallyLocked: true },
  /* satelit Saturnus */
  'Titan':     { wdot: 22.5769786,   tidallyLocked: true },
  'Rhea':      { wdot: 79.6900373,   tidallyLocked: true },
  'Iapetus':   { wdot: 4.5379572,    tidallyLocked: true },
  /* satelit Uranus */
  'Titania':   { wdot: 41.3514301,   tidallyLocked: true },
  /* satelit Neptunus (Triton retrograde, tetap terkunci) */
  'Triton':    { wdot: -61.2572637,  tidallyLocked: true },
};

/* Hitung sudut rotasi (W) sebuah planet pada JD tertentu.
   Mengembalikan sudut dalam RADIAN. */
function planetRotationAngle(key, jd) {
  const r = IAU_ROTATION[key];
  if (!r) return 0;
  const d = jd - J2000_JD;
  let w = r.w0 + r.wdot * d;
  w = w % 360;
  if (w < 0) w += 360;
  return w * DEG;
}

/* Kemiringan poros planet (derajat) */
function planetAxialTilt(key) {
  const r = IAU_ROTATION[key];
  return r ? r.tilt : 0;
}

/* Apakah satelit ini terkunci pasang-surut? */
function isTidallyLocked(name) {
  const s = IAU_SATELLITE_ROTATION[name];
  return s ? s.tidallyLocked : false;
}
