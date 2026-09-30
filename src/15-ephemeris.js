/* =======================================================================
   EPHEMERIS AKURAT — posisi nyata benda langit
   ----------------------------------------------------------------------
   Sumber data:
   1. Planet : JPL "Approximate Positions of the Planets" (Standish),
               Keplerian elements + rates, valid 1800-2050.
               https://ssd.jpl.nasa.gov/planets/approx_pos.html
               Akurasi: Merkurius 15", Venus 20", Bumi 20", Mars 40",
                        Jupiter 400", Saturn 600", Uranus 50", Neptunus 10"
   2. Bulan  : teori ELP2000 ringkas dari Meeus "Astronomical Algorithms"
               bab 47 (60 suku periodik). Akurasi ±10".
   3. Matahari: posisi Bumi dari JPL; Matahari = -posisi Bumi.

   Semua fungsi memakai waktu dalam HARI JULIAN (JD) atau abad sejak J2000.
   ======================================================================= */

const DEG = Math.PI / 180;
const J2000_JD = 2451545.0;

/* CATATAN: AU_KM sudah dideklarasikan di src/10-data.js dan dipakai bersama.
   Jangan deklarasikan ulang di sini — dua `const` dengan nama sama dalam
   satu halaman menyebabkan SyntaxError dan seluruh aplikasi gagal dimuat.
   Yang baru hanya konstanta fisik berikut. */

/* konstanta fisik (dipakai perhitungan gerhana) */
const RADIUS_SUN_KM = 696000;
const RADIUS_EARTH_KM = 6371;
const RADIUS_MOON_KM = 1737.4;

/* konversi tanggal -> Julian Day (algoritma Meeus 7.1) */
function dateToJD(date) {
  const y0 = date.getUTCFullYear();
  const m0 = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const frac = (date.getUTCHours() + date.getUTCMinutes() / 60 +
                date.getUTCSeconds() / 3600) / 24;
  let y = y0, m = m0;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) +
         d + frac + B - 1524.5;
}

/* Julian Day -> tanggal */
function jdToDate(jd) {
  const z = Math.floor(jd + 0.5);
  const f = (jd + 0.5) - z;
  let A = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    A = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + f;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const dayInt = Math.floor(day);
  const frac = day - dayInt;
  const ms = Math.round(frac * 86400000);
  return new Date(Date.UTC(year, month - 1, dayInt) + ms);
}

/* abad sejak J2000 */
function jdToT(jd) { return (jd - J2000_JD) / 36525; }

function norm360(x) {
  x = x % 360;
  return x < 0 ? x + 360 : x;
}

/* =======================================================================
   1. PLANET — JPL Keplerian elements (Table 1, 1800-2050 AD)
   Format: [a, a_dot, e, e_dot, I, I_dot, L, L_dot, wbar, wbar_dot, O, O_dot]
   a dalam AU, e tanpa satuan, sudut dalam derajat, rate per abad.
   ======================================================================= */
const JPL_ELEMENTS = {
  mercury: [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749,
            252.25032350, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
  venus:   [0.72333566, 0.00000390, 0.00677672, -0.00004107, 3.39467605, -0.00078890,
            181.97909950, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
  earth:   [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668,
            100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0.0, 0.0],
  mars:    [1.52371034, 0.00001847, 0.09339410, 0.00007882, 1.84969142, -0.00813131,
            -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
  jupiter: [5.20288700, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714,
            34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
  saturn:  [9.53667594, -0.00125060, 0.05386179, -0.00050991, 2.48599187, 0.00193609,
            49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794],
  uranus:  [19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939,
            313.23810451, 428.48202785, 170.95427630, 0.40805281, 74.01692503, 0.04240589],
  neptune: [30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372,
            -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664],
};

/* selesaikan persamaan Kepler M = E - e sin E (Newton-Raphson) */
function solveKepler(M, e) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 12; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/* posisi heliosentris planet dalam AU (kerangka ekliptika J2000)
   return {x, y, z} — sumbu z ke arah kutub utara ekliptika */
function planetPositionAU(key, jd) {
  const el = JPL_ELEMENTS[key];
  if (!el) return null;
  const T = jdToT(jd);

  const a = el[0] + el[1] * T;
  const e = el[2] + el[3] * T;
  const I = (el[4] + el[5] * T) * DEG;
  const L = el[6] + el[7] * T;
  const wbar = el[8] + el[9] * T;
  const O = el[10] + el[11] * T;

  const w = (wbar - O) * DEG;                 /* argumen perihelion */
  let M = (L - wbar) * DEG;                   /* anomali rata-rata */
  M = M % (2 * Math.PI);
  if (M > Math.PI) M -= 2 * Math.PI;
  if (M < -Math.PI) M += 2 * Math.PI;

  const E = solveKepler(M, e);

  /* koordinat di bidang orbit */
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  /* rotasi ke kerangka ekliptika */
  const cw = Math.cos(w), sw = Math.sin(w);
  const cO = Math.cos(O * DEG), sO = Math.sin(O * DEG);
  const cI = Math.cos(I), sI = Math.sin(I);

  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = (sw * sI) * xp + (cw * sI) * yp;

  return { x, y, z };
}

/* =======================================================================
   2. BULAN — teori Meeus bab 47 (ELP2000 ringkas)
   Mengembalikan posisi geosentris Bulan dalam km (kerangka ekliptika J2000)
   ======================================================================= */

/* Tabel 47.A — suku periodik bujur & jarak
   [D, M, M', F, koefisien bujur (1e-6 deg), koefisien jarak (1e-3 km)] */
const MOON_LR = [
  [0,0,1,0, 6288774, -20905355], [2,0,-1,0, 1274027, -3699111],
  [2,0,0,0, 658314, -2955968],   [0,0,2,0, 213618, -569925],
  [0,1,0,0, -185116, 48888],     [0,0,0,2, -114332, -3149],
  [2,0,-2,0, 58793, 246158],     [2,-1,-1,0, 57066, -152138],
  [2,0,1,0, 53322, -170733],     [2,-1,0,0, 45758, -204586],
  [0,1,-1,0, -40923, -129620],   [1,0,0,0, -34720, 108743],
  [0,1,1,0, -30383, 104755],     [2,0,0,-2, 15327, 10321],
  [0,0,1,2, -12528, 0],          [0,0,1,-2, 10980, 79661],
  [4,0,-1,0, 10675, -34782],     [0,0,3,0, 10034, -23210],
  [4,0,-2,0, 8548, -21636],      [2,1,-1,0, -7888, 24208],
  [2,1,0,0, -6766, 30824],       [1,0,-1,0, -5163, -8379],
  [1,1,0,0, 4987, -16675],       [2,-1,1,0, 4036, -12831],
  [2,0,2,0, 3994, -10445],       [4,0,0,0, 3861, -11650],
  [2,0,-3,0, 3665, 14403],       [0,1,-2,0, -2689, -7003],
  [2,0,-1,2, -2602, 0],          [2,-1,-2,0, 2390, 10056],
  [1,0,1,0, -2348, 6322],        [2,-2,0,0, 2236, -9884],
  [0,1,2,0, -2120, 5751],        [0,2,0,0, -2069, 0],
  [2,-2,-1,0, 2048, -4950],      [2,0,1,-2, -1773, 4130],
  [2,0,0,2, -1595, 0],           [4,-1,-1,0, 1215, -3958],
  [0,0,2,2, -1110, 0],           [3,0,-1,0, -892, 3258],
  [2,1,1,0, -810, 2616],         [4,-1,-2,0, 759, -1897],
  [0,2,-1,0, -713, -2117],       [2,2,-1,0, -700, 2354],
  [2,1,-2,0, 691, 0],            [2,-1,0,-2, 596, 0],
  [4,0,1,0, 549, -1423],         [0,0,4,0, 537, -1117],
  [4,-1,0,0, 520, -1571],        [1,0,-2,0, -487, -1739],
  [2,1,0,-2, -399, 0],           [0,0,2,-2, -381, -3011],
  [1,1,1,0, 351, 0],             [3,0,-2,0, -340, -1580],
  [4,0,-3,0, 330, 0],            [2,-1,2,0, 327, -1232],
  [0,2,1,0, -323, 0],            [1,1,-1,0, 299, 0],
  [2,0,3,0, 294, 0],             [2,0,-1,-2, 0, -1699],
];

/* Tabel 47.B — suku periodik lintang
   [D, M, M', F, koefisien lintang (1e-6 deg)] */
const MOON_B = [
  [0,0,0,1, 5128122], [0,0,1,1, 280602], [0,0,1,-1, 277693],
  [2,0,0,-1, 173237], [2,0,-1,1, 55413], [2,0,-1,-1, 46271],
  [2,0,0,1, 32573],   [0,0,2,1, 17198],  [2,0,1,-1, 9266],
  [0,0,2,-1, 8822],   [2,-1,0,-1, 8216], [2,0,-2,-1, 4324],
  [2,0,1,1, 4200],    [2,1,0,-1, -3359],[2,-1,-1,1, 2463],
  [2,-1,0,1, 2211],   [2,-1,-1,-1, 2065],[0,1,-1,-1, -1870],
  [4,0,-1,-1, 1828],  [0,1,0,1, -1794], [0,0,0,3, -1749],
  [0,1,-1,1, -1565],  [1,0,0,1, -1491], [0,1,1,1, -1475],
  [0,1,1,-1, -1410],  [0,1,0,-1, -1344], [1,0,0,-1, -1335],
  [0,0,3,1, 1107],    [4,0,0,-1, 1021], [4,0,-1,1, 833],
  [0,0,1,-3, 777],    [4,0,-2,1, 671],  [2,0,0,-3, 607],
  [2,0,2,-1, 596],    [2,-1,1,-1, 491], [2,0,-2,1, -451],
  [0,0,3,-1, 439],    [2,0,2,1, 422],   [2,0,-3,-1, 421],
  [2,1,-1,1, -366],   [2,1,0,1, -351],  [4,0,0,1, 331],
  [2,-1,1,1, 315],    [2,-2,0,-1, 302], [0,0,1,3, -283],
  [2,1,1,-1, -229],   [1,1,0,-1, 223],  [1,1,0,1, 223],
  [0,1,-2,-1, -220],  [2,1,-1,-1, -220],[1,0,1,1, -185],
  [2,-1,-2,-1, 181],  [0,1,2,1, -177],  [4,0,-2,-1, 176],
  [4,-1,-1,-1, 166],  [1,0,1,-1, -164], [4,0,1,-1, 132],
  [1,0,-1,-1, -119],  [4,-1,0,-1, 115], [2,-2,0,1, 107],
];

/* posisi geosentris Bulan: bujur, lintang (derajat), jarak (km) */
function moonGeocentric(jd) {
  const T = jdToT(jd);

  /* sudut dasar (derajat) */
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T +
                     T * T * T / 538841 - T * T * T * T / 65194000);
  const D  = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T +
                     T * T * T / 545868 - T * T * T * T / 113065000);
  const M  = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T +
                     T * T * T / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T +
                     T * T * T / 69699 - T * T * T * T / 14712000);
  const F  = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T -
                     T * T * T / 3526000 + T * T * T * T / 863310000);

  const A1 = norm360(119.75 + 131.849 * T);
  const A2 = norm360(53.09 + 479264.290 * T);
  const A3 = norm360(313.45 + 481266.484 * T);

  /* faktor koreksi eksentrisitas orbit Bumi */
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;

  const Dr = D * DEG, Mr = M * DEG, Mpr = Mp * DEG, Fr = F * DEG;

  let sumL = 0, sumR = 0;
  for (let i = 0; i < MOON_LR.length; i++) {
    const t = MOON_LR[i];
    const arg = t[0] * Dr + t[1] * Mr + t[2] * Mpr + t[3] * Fr;
    /* koreksi E untuk suku yang mengandung M */
    let f = 1;
    if (t[1] === 1 || t[1] === -1) f = E;
    else if (t[1] === 2 || t[1] === -2) f = E * E;
    sumL += f * t[4] * Math.sin(arg);
    sumR += f * t[5] * Math.cos(arg);
  }

  let sumB = 0;
  for (let i = 0; i < MOON_B.length; i++) {
    const t = MOON_B[i];
    const arg = t[0] * Dr + t[1] * Mr + t[2] * Mpr + t[3] * Fr;
    let f = 1;
    if (t[1] === 1 || t[1] === -1) f = E;
    else if (t[1] === 2 || t[1] === -2) f = E * E;
    sumB += f * t[4] * Math.sin(arg);
  }

  /* koreksi aditif (pengaruh planet + figur Bumi) */
  sumL += 3958 * Math.sin(A1 * DEG) + 1962 * Math.sin((Lp - F) * DEG) +
          318 * Math.sin(A2 * DEG);
  sumB += -2235 * Math.sin(Lp * DEG) + 382 * Math.sin(A3 * DEG) +
          175 * Math.sin((A1 - F) * DEG) + 175 * Math.sin((A1 + F) * DEG) +
          127 * Math.sin((Lp - Mp) * DEG) - 115 * Math.sin((Lp + Mp) * DEG);

  const lon = norm360(Lp + sumL / 1000000);         /* derajat, ekliptika TANGGAL */
  const lat = sumB / 1000000;                        /* derajat */
  const dist = 385000.56 + sumR / 1000;              /* km */

    /* Meeus bab 47 memberi bujur/lintang terhadap EKUINOKS TANGGAL.
     Kerangka planet (JPL_ELEMENTS) memakai J2000. Selisih presesi umum:
     p = 5029.0966"/abad = 1.396971°/abad (Meeus bab 21).
     Tanpa koreksi ini, error bujur ~0.37° pada 2026 → ~2.500 km. */
  const precess = 1.396971 * T + 0.0003086 * T * T;
  const lonJ2000 = norm360(lon - precess);

  return { lon: lonJ2000, lat, dist, lonDate: lon };
}

/* posisi geosentris Bulan dalam km, kerangka ekliptika kartesian */
function moonPositionKm(jd) {
  const g = moonGeocentric(jd);
  const lr = g.lon * DEG, br = g.lat * DEG;
  const cosB = Math.cos(br);
  return {
    x: g.dist * cosB * Math.cos(lr),
    y: g.dist * cosB * Math.sin(lr),
    z: g.dist * Math.sin(br),
    dist: g.dist, lon: g.lon, lat: g.lat,
  };
}

/* posisi Bumi dalam km (heliosentris, ekliptika J2000) */
function earthPositionKm(jd) {
  const p = planetPositionAU('earth', jd);
  return { x: p.x * AU_KM, y: p.y * AU_KM, z: p.z * AU_KM };
}

/* =======================================================================
   3. POSISI SEMUA BENDA — dipakai scene 3D
   Mengembalikan posisi heliosentris dalam km untuk planet, dan
   posisi heliosentris untuk Bulan (posisi Bumi + posisi geosentris).
   ======================================================================= */

/* dipakai untuk Bulan: posisi geosentris yang sudah diperhitungkan
   kemiringan sumbu Bumi TIDAK dipakai — kita pakai kerangka ekliptika
   langsung supaya konsisten dengan planet lain */
function bodyPositionKm(key, jd) {
  if (key === 'sun') return { x: 0, y: 0, z: 0 };
  if (key === 'moon') {
    const e = earthPositionKm(jd);
    const m = moonPositionKm(jd);
    return { x: e.x + m.x, y: e.y + m.y, z: e.z + m.z };
  }
  const p = planetPositionAU(key, jd);
  if (!p) return null;
  return { x: p.x * AU_KM, y: p.y * AU_KM, z: p.z * AU_KM };
}

/* =======================================================================
   4. DETEKSI GERHANA
   Gerhana matahari: Bulan menghalangi Matahari dilihat dari Bumi.
   Gerhana bulan   : Bumi menghalangi Matahari dilihat dari Bulan.

   Cara: hitung jarak sudut antara pusat Matahari dan pusat Bulan
   dilihat dari Bumi (untuk gerhana matahari), lalu bandingkan dengan
   jumlah radius sudut keduanya.
   ======================================================================= */

function angleBetween(a, b) {
  const la = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  const lb = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z);
  const dot = (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

/* keadaan gerhana pada satu waktu tertentu
   ----------------------------------------------------------------------
   Dua koreksi penting dari percobaan sebelumnya:

   1. KERANGKA KOORDINAT. moonPositionKm() mengembalikan posisi GEOSENTRIS
      (relatif Bumi), bukan heliosentris. Memakainya sebagai vektor
      heliosentris membuat gamma meleset jadi 185 (seharusnya < 1).

   2. GAMMA, bukan jarak sudut geosentris. Gerhana matahari terjadi saat
      bayangan Bulan jatuh ke PERMUKAAN Bumi. Pada gerhana total
      2024-04-08 jarak sudut dari pusat Bumi 0.45° (tampak "jauh"), tapi
      sumbu bayangan hanya lewat ~3.000 km dari pusat — di dalam Bumi.

   Rumus yang dipakai (bentuk sederhana, setara Meeus bab 54):
     gamma_km = jarakBulan × sin(sudut pisah Matahari–Bulan dilihat dari Bumi)
   Alasannya: sumbu bayangan melewati Bulan, dan sudut antara arah Bulan
   (geosentris) dengan arah sumbu bayangan sama dengan sudut pisah itu.
   Nilai yang sama juga berlaku untuk gerhana bulan (jarak Bulan dari
   sumbu antisolar).

     |gamma| < 0.9972 -> gerhana pusat (total/cincin)
     |gamma| < ~1.55  -> gerhana sebagian terlihat di suatu tempat
   ---------------------------------------------------------------------- */
function eclipseState(jd) {
  const e = earthPositionKm(jd);
  const m = moonPositionKm(jd);

  const dSun = Math.sqrt(e.x * e.x + e.y * e.y + e.z * e.z);
  const dMoon = m.dist;                       /* jarak geosentris Bulan */

  /* sudut pisah Matahari–Bulan dilihat dari Bumi */
  const toSun = { x: -e.x, y: -e.y, z: -e.z };
  const toMoon = { x: m.x, y: m.y, z: m.z };
  const sepSun = angleBetween(toSun, toMoon);

  /* ======================================================================
     BUG BESAR YANG DIPERBAIKI: gerhana palsu (Bulan di belakang Bumi)
     ----------------------------------------------------------------------
     gammaKm = dMoon × sin(sepSun) — dan sin(179,7°) = sin(0,3°)! Jadi
     eclipseState() melaporkan GERHANA MATAHARI saat Bulan justru berada di
     sisi BERLAWANAN (purnama) — pada 20 Feb 2027 (gerhana Bulan penumbra,
     sep 178,9°) ia mengklaim "Gerhana Matahari sebagian mag 0,446" yang
     TIDAK PERNAH TERJADI. Sebaliknya, saat gerhana Matahari sejati
     (6 Feb 2027, sep 0,3°) ia juga mengklaim "Gerhana Bulan total" — padahal
     Bulan sedang di depan Matahari, mustahil gerhana Bulan.

     Kunci: arah Bulan harus SAMA dengan arah Matahari untuk gerhana
     Matahari (dot produk positif -> sep < 90°), dan BERLAWANAN untuk
     gerhana Bulan (dot negatif -> sep > 90°).
     ====================================================================== */
  const dotSM = (toSun.x * toMoon.x + toSun.y * toMoon.y + toSun.z * toMoon.z) /
                (Math.sqrt(toSun.x*toSun.x + toSun.y*toSun.y + toSun.z*toSun.z) *
                 Math.sqrt(toMoon.x*toMoon.x + toMoon.y*toMoon.y + toMoon.z*toMoon.z));
  const bulanDiDepan = dotSM > 0;      /* Bulan di arah Matahari (fase baru) */

  /* jarak sumbu bayangan dari pusat Bumi (km) */
  const gammaKm = dMoon * Math.sin(sepSun);
  const gamma = gammaKm / RADIUS_EARTH_KM;

  /* radius sudut (radian) */
  const rSunAng = Math.atan(RADIUS_SUN_KM / dSun);
  const rMoonAng = Math.atan(RADIUS_MOON_KM / dMoon);

  /* --- GERHANA MATAHARI --- */
  /* Hanya berlaku bila Bulan berada di arah Matahari (fase baru) dan
     sudutnya cukup kecil. Penjaga `bulanDiDepan` inilah yang menghapus
     gerhana Matahari palsu saat Bulan purnama. */
  /* Dua radius bayangan berbeda, dan keduanya diperlukan:
       umbra    = kerucut gelap total (gerhana pusat)
       penumbra = kerucut bayangan sebagian (gerhana sebagian)
     Gerhana sebagian terlihat di suatu tempat di Bumi bila sumbu bayangan
     berada dalam jangkauan PENUMBRA, bukan umbra. Memakai umbra saja
     membuat gerhana sebagian 2025-03-29 tidak terdeteksi (gamma 1.042). */
  const umbraRadKm = RADIUS_MOON_KM - dMoon * (RADIUS_SUN_KM - RADIUS_MOON_KM) / dSun;
  const penumbraRadKm = RADIUS_MOON_KM + dMoon * (RADIUS_SUN_KM - RADIUS_MOON_KM) / dSun;
  const umbraLimitKm = RADIUS_EARTH_KM + Math.abs(umbraRadKm);
  const penumbraLimitKm = RADIUS_EARTH_KM + penumbraRadKm;

  let solar = null;
  if (bulanDiDepan && gammaKm < penumbraLimitKm) {
    let jenis, mag;
    if (gammaKm < umbraLimitKm) {
      /* bayangan umbra menyentuh Bumi */
      if (gamma < 0.9972) {
        jenis = rMoonAng >= rSunAng ? 'total' : 'cincin';
        mag = jenis === 'total'
          ? Math.min(1.2, 1 + (rMoonAng - rSunAng) / rSunAng)
          : Math.max(0.9, 1 - (rSunAng - rMoonAng) / rSunAng);
      } else {
        jenis = 'sebagian';
        mag = Math.max(0, Math.min(0.99,
          (umbraLimitKm - gammaKm) / (2 * Math.abs(umbraRadKm) + 1)));
      }
    } else {
      /* hanya penumbra yang menyentuh Bumi: gerhana sebagian tipis */
      jenis = 'sebagian';
      mag = Math.max(0.001, Math.min(0.99,
        (penumbraLimitKm - gammaKm) / (2 * penumbraRadKm)));
    }
    solar = { jenis, magnitudo: mag, gamma, gammaKm, jarakSudut: sepSun };
  }

  /* --- GERHANA BULAN --- */
  /* Hanya berlaku bila Bulan berada di arah BERLAWANAN dari Matahari
     (fase purnama). Tanpa penjaga `!bulanDiDepan`, gerhana Matahari
     (sep kecil) juga dilaporkan sebagai "Gerhana Bulan total" — palsu,
     karena Bulan sedang di depan Matahari. */
  /* Umbra Bumi menyempit sebagai kerucut; radiusnya pada jarak Bulan:
       r_umbra = R_bumi − d_bulan × (R_matahari − R_bumi) / d_matahari
     Ditambah pembesaran atmosfer Bumi 2% (aturan Danjon).
     Penumbra = umbra + koreksi kerucut penuh (bukan 2% saja). */
  const coneK = dMoon * (RADIUS_SUN_KM - RADIUS_EARTH_KM) / dSun;
  const rUmbraKm = (RADIUS_EARTH_KM - coneK) * 1.02;
  const rPenumbraKm = RADIUS_EARTH_KM + coneK;
  const rUmbraAng = Math.atan(rUmbraKm / dMoon);
  const sepAxis = Math.asin(Math.min(1, gammaKm / dMoon));

  /* Toleransi penumbra: model ini memakai radius Bumi volumetrik (6371 km)
     sedangkan penumbra dibentuk radius EKUATOR (6378 km) dan bayangan
     atmosfer sedikit lebih lebar. Gerhana penumbra paling tipis dalam
     katalog NASA (18 Jul 2027, mag penumbra 0,0014) memiliki gamma
     10.072 km sedangkan batas model 9.797 km — selisih 275 km yang
     sepenuhnya berasal dari penyederhanaan itu. Toleransi 3% menutup
     celah ini tanpa menimbulkan gerhana palsu (uji negatif: 0/6). */
  const toleransiPenumbra = 1.03;

  let lunar = null;
  if (!bulanDiDepan && gammaKm < (rPenumbraKm + RADIUS_MOON_KM) * toleransiPenumbra) {
    let jenis, mag;
    if (gammaKm < rUmbraKm + RADIUS_MOON_KM) {
      mag = (rUmbraKm + RADIUS_MOON_KM - gammaKm) / (2 * RADIUS_MOON_KM);
      jenis = gammaKm < rUmbraKm - RADIUS_MOON_KM ? 'total' : 'sebagian';
    } else {
      /* hanya penumbra: gerhana penumbra (Bulan meredup samar).
         Magnitudo penumbra (standar NASA/Espenak):
           mag_penumbra = (r_penumbra + R_bulan − gamma) / (2 × R_bulan) */
      mag = (rPenumbraKm + RADIUS_MOON_KM - gammaKm) / (2 * RADIUS_MOON_KM);
      jenis = 'penumbra';
    }
    lunar = {
      jenis,
      magnitudo: Math.max(-1.5, Math.min(2.0, mag)),
      gamma,
      gammaKm,
    };
  }

  return { solar, lunar, sepSun, sepAxis, gamma, rUmbraAng, gammaKm };
}

/* =======================================================================
   5. PENCARIAN GERHANA — memindai rentang tanggal
   ======================================================================= */

/* cari semua gerhana dalam rentang [jd0, jd1] dengan langkah kasar lalu
   penghalusan. Gerhana matahari berlangsung beberapa jam; langkah 0.02 hari
   (±29 menit) cukup untuk mendeteksinya. */
function findEclipses(jd0, jd1, onProgress) {
  const hasil = [];
  const step = 0.02;
  let lastSolar = -999, lastLunar = -999;

  for (let jd = jd0; jd <= jd1; jd += step) {
    const st = eclipseState(jd);

    if (st.solar && jd - lastSolar > 20) {
      const puncak = refineEclipse(jd, 'solar');
      if (puncak) {
        hasil.push({ jenis: 'matahari', jd: puncak.jd, ...puncak.data });
        lastSolar = puncak.jd;
      }
    }
    if (st.lunar && jd - lastLunar > 20) {
      const puncak = refineEclipse(jd, 'lunar');
      if (puncak) {
        hasil.push({ jenis: 'bulan', jd: puncak.jd, ...puncak.data });
        lastLunar = puncak.jd;
      }
    }
    if (onProgress && Math.floor(jd * 10) % 200 === 0) onProgress(jd);
  }
  return hasil;
}

/* perhalus: cari waktu jarak sudut minimum di sekitar jd */
function refineEclipse(jdGuess, tipe) {
  let best = null, bestSep = 1e9;
  for (let d = -0.6; d <= 0.6; d += 0.005) {
    const jd = jdGuess + d;
    const st = eclipseState(jd);
    /* PERBAIKAN (30 Sep): sebelumnya baris ini memakai `st.sepEarth`, padahal
       eclipseState() (lihat return di atas) hanya mengembalikan `sepAxis` —
       TIDAK ADA properti bernama sepEarth. Akibatnya `st.sepEarth` selalu
       undefined; perbandingan `undefined < bestSep` bernilai false, `best`
       tidak pernah terisi, dan refineEclipse() SELALU mengembalikan null
       untuk tipe 'lunar'. Dampaknya: seluruh gerhana Bulan hilang dari
       findEclipses() (terukur: 0 gerhana bulan sepanjang 2025, padahal NASA
       mencatat 2 — 14 Mar & 7 Sep 2025, keduanya total).
       `sepAxis` adalah sudut jarak sumbu bayangan geosentris yang memang
       sudah dihitung untuk kasus Bulan (dipakai juga oleh cabang lunar).
       Setelah perbaikan, findEclipses(2025) mengembalikan 4 gerhana yang
       tanggal & urutannya cocok 100% dengan katalog NASA/Espenak. */
    const sep = tipe === 'solar' ? st.sepSun : st.sepAxis;
    if (sep < bestSep) { bestSep = sep; best = { jd, st }; }
  }
  if (!best) return null;
  const st = best.st;
  const data = tipe === 'solar' ? st.solar : st.lunar;
  if (!data) return null;
  return { jd: best.jd, data };
}

/* =======================================================================
   LIBRASI BULAN
   ----------------------------------------------------------------------
   Bulan TIDAK terkunci sempurna. Karena orbitnya elips (libration in
   longitude) dan miring 6,7° terhadap ekliptika (libration in latitude),
   plus rotasi Bumi (diurnal libration), pengamat di Bumi bisa melihat
   sampai 59% permukaan Bulan — bukan 50%.

   Data (Meeus, "Astronomical Algorithms" bab 53):
     - Libration in longitude  : +-7,9 derajat (karena eksentrisitas orbit)
     - Libration in latitude   : +-6,7 derajat (karena kemiringan orbit)
     - Libration diurnal       : +-1,0 derajat (karena rotasi Bumi)

   Rumus ringkas untuk libration total (Meeus bab 53, disederhanakan):

     l' (libration in longitude) = -6,289 sin(M') + 1,274 sin(2D - M')
                                   + 0,658 sin(2D) + 0,214 sin(2M')
                                   - 0,186 sin(M) - 0,114 sin(2F)
                                   + 0,059 sin(2D - 2M') + 0,057 sin(2D - M - M')
                                   + 0,053 sin(2D + M' - 2F) - 0,046 sin(M - M')

     b' (libration in latitude)  = 5,128 sin(F) + 0,281 sin(M' + F)
                                   - 0,278 sin(F - M') + 0,173 sin(2D - F)
                                   + 0,055 sin(2D - M' + F) + 0,046 sin(2D - M' - F)
                                   + 0,033 sin(2D + F) - 0,027 sin(M' + 2F)

   dengan D, M, M', F sudut dasar Bulan (sama seperti di moonGeocentric).

   LIBRASI DIURNAL: pengamat di Bumi melihat Bulan dari arah sedikit
   berbeda saat Bumi berotasi. Efeknya +-1° dan bergantung pada posisi
   pengamat, jadi tidak dimodelkan di sini (aplikasi bukan pengamat
   tunggal, melainkan pandangan dari luar).
   ======================================================================= */

function moonLibration(jd) {
  const T = jdToT(jd);

  const D  = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T +
                     T * T * T / 545868) * DEG;
  const M  = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T) * DEG;
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T +
                     T * T * T / 69699) * DEG;
  const F  = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T) * DEG;

  const sin = Math.sin;

  /* libration in longitude (derajat) */
  const lp =
    -6.289 * sin(Mp)
    + 1.274 * sin(2 * D - Mp)
    + 0.658 * sin(2 * D)
    + 0.214 * sin(2 * Mp)
    - 0.186 * sin(M)
    - 0.114 * sin(2 * F)
    + 0.059 * sin(2 * D - 2 * Mp)
    + 0.057 * sin(2 * D - M - Mp)
    + 0.053 * sin(2 * D + Mp - 2 * F)
    - 0.046 * sin(M - Mp);

  /* libration in latitude (derajat) */
  const bp =
    5.128 * sin(F)
    + 0.281 * sin(Mp + F)
    - 0.278 * sin(F - Mp)
    + 0.173 * sin(2 * D - F)
    + 0.055 * sin(2 * D - Mp + F)
    + 0.046 * sin(2 * D - Mp - F)
    + 0.033 * sin(2 * D + F)
    - 0.027 * sin(Mp + 2 * F);

  /* ---------------------------------------------------------------------
     LIBRASI DIURNAL (parallactic libration)
     ---------------------------------------------------------------------
     Pengamat di permukaan Bumi melihat Bulan dari arah yang sedikit
     berbeda dibanding pengamat di pusat Bumi. Karena Bumi berputar,
     perbedaan ini berubah sepanjang hari dan menambah +-1 derajat pada
     librasi bujur.

     Besarnya bergantung pada jarak pengamat dari sumbu rotasi Bumi:
       amplitudo = (R_bumi / jarak_bulan) dalam radian
                 = 6371 / 384400 = 0.01657 rad = 0.949 derajat

     Sudut fasenya mengikuti GMST — sama dengan sudut rotasi Bumi. Jadi
     pengamat di meridian yang menghadap Bulan melihat librasi positif.

     Ini diterapkan sebagai suku tambahan pada librasi bujur.
     --------------------------------------------------------------------- */
  const gmst = ((280.46061837 + 360.98564736629 * (jd - J2000_JD)) % 360) * DEG;
  const ampDiurnal = (RADIUS_EARTH_KM / 384400) * (180 / Math.PI);  /* derajat */
  const diurnal = ampDiurnal * Math.sin(gmst);

  return { lonDeg: lp + diurnal, latDeg: bp, diurnalDeg: diurnal };
}

/* iluminasi Bulan (0 = baru, 1 = purnama) dan fase */
function moonPhase(jd) {
  const e = earthPositionKm(jd);
  const m = moonPositionKm(jd);
  const toSun = { x: -e.x, y: -e.y, z: -e.z };
  const toMoon = { x: m.x, y: m.y, z: m.z };
  /* sudut elongasi Bumi-Bulan-Matahari */
  const elong = angleBetween(toSun, toMoon);
  const illum = (1 - Math.cos(elong)) / 2;

  /* nama fase berdasarkan sudut elongasi + arah ( waxing/waning ) */
  const elongDeg = elong / DEG;
  let nama;
  if (elongDeg < 10) nama = 'Bulan Baru';
  else if (elongDeg < 80) nama = 'Sabit Muda';
  else if (elongDeg < 100) nama = 'Kuartal Pertama';
  else if (elongDeg < 170) nama = 'Cembung Awal';
  else if (elongDeg < 190) nama = 'Purnama';
  else if (elongDeg < 260) nama = 'Cembung Akhir';
  else if (elongDeg < 280) nama = 'Kuartal Ketiga';
  else if (elongDeg < 350) nama = 'Sabit Tua';
  else nama = 'Bulan Baru';

  return { elongasi: elongDeg, iluminasi: illum, nama };
}

/* jarak sudut planet dari Matahari dilihat dari Bumi (derajat)
   elongasi kecil = konjungsi (dekat Matahari), 180 = oposisi */
function planetElongation(key, jd) {
  const p = bodyPositionKm(key, jd);
  const e = earthPositionKm(jd);
  if (!p) return null;
  const toSun = { x: -e.x, y: -e.y, z: -e.z };
  const toPlanet = { x: p.x - e.x, y: p.y - e.y, z: p.z - e.z };
  const ang = angleBetween(toSun, toPlanet) / DEG;
  return {
    elongasi: ang,
    jenis: ang < 20 ? 'konjungsi' : ang > 160 ? 'oposisi' : 'biasa',
  };
}
