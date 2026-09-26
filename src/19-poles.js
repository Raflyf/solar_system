/* =======================================================================
   ORIENTASI POROS PLANET — arah kutub nyata (RA, Dec)
   ----------------------------------------------------------------------
   Sumber: IAU Working Group on Cartographic Coordinates and Rotational
   Elements (WGCCRE 2015, Archinal et al. 2018)
   https://doi.org/10.1007/s10569-017-9805-5

   MASALAH YANG DIPERBAIKI:
   Sebelumnya semua planet dimiringkan dengan spin.rotation.z = axialTilt,
   sehingga SEMUA planet miring ke arah sumbu X yang sama. Padahal di
   kenyataan setiap planet punya arah kutub sendiri:

     planet      RA kutub    Dec kutub
     Merkurius   281.010     61.416
     Venus       272.760     67.160
     Bumi          0.000     90.000
     Mars        317.269     54.433
     Jupiter     268.057     64.495
     Saturnus     40.589     83.537
     Uranus      257.311    -15.175
     Neptunus    299.360     43.460

   Perhatikan Uranus: Dec NEGATIF (-15,175) — kutubnya menunjuk ke bawah
   bidang ekliptika. Itulah kenapa Uranus tampak "menggelinding".

   CARA KERJA:
   1. Ubah (RA, Dec) menjadi vektor kutub dalam kerangka ekuator J2000
   2. Putar ke kerangka ekliptika (miring 23,4393 derajat)
   3. Petakan ke kerangka scene (x=x, y=z_ekliptika, z=-y_ekliptika)
   4. Hitung kuaternion yang memutar sumbu Y mesh ke vektor kutub itu
   ======================================================================= */

const EPSILON_OBLIQUITY = 23.4392911 * DEG;   /* kemiringan ekliptika J2000 */

/* arah kutub utara setiap planet: [RA derajat, Dec derajat] */
const PLANET_POLE = {
  mercury: [281.0103, 61.4155],
  venus:   [272.7600, 67.1600],
  earth:   [0.0000, 90.0000],     /* ekuator Bumi = ekuator langit */
  mars:    [317.269202, 54.432516],
  jupiter: [268.056595, 64.495303],
  saturn:  [40.5890, 83.5370],
  uranus:  [257.3110, -15.1750],
  neptune: [299.3600, 43.4600],
  sun:     [286.1300, 63.8700],
};

/* ubah (RA, Dec) menjadi vektor kutub dalam kerangka SCENE */
function poleVectorScene(raDeg, decDeg) {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  /* kerangka ekuator J2000 */
  const xe = Math.cos(dec) * Math.cos(ra);
  const ye = Math.cos(dec) * Math.sin(ra);
  const ze = Math.sin(dec);
  /* putar ke ekliptika: kemiringan EPSILON terhadap sumbu X */
  const yl = ye * Math.cos(EPSILON_OBLIQUITY) + ze * Math.sin(EPSILON_OBLIQUITY);
  const zl = -ye * Math.sin(EPSILON_OBLIQUITY) + ze * Math.cos(EPSILON_OBLIQUITY);
  /* petakan ke scene: x=x, y=z_ekliptika (atas), z=-y_ekliptika */
  return { x: xe, y: zl, z: -yl };
}

/* Sudut kemiringan poros terhadap bidang orbit planet (derajat).
   Untuk planet, ini dihitung dari vektor kutub vs normal orbit.
   Nilai acuan (dari IAU / NASA fact sheet):
     Merkurius 0,034 ; Venus 177,36 ; Bumi 23,44 ; Mars 25,19 ;
     Jupiter 3,13 ; Saturnus 26,73 ; Uranus 97,77 ; Neptunus 28,32  */
const AXIAL_TILT_DEG = {
  mercury: 0.034, venus: 177.36, earth: 23.4392911, mars: 25.19,
  jupiter: 3.13, saturn: 26.73, uranus: 97.77, neptune: 28.32,
  sun: 7.25,
};

/* Hitung kuaternion yang memutar sumbu +Y mesh ke arah kutub nyata.
   Hasilnya dipakai pada grup `spin` supaya planet berputar di sekitar
   poros yang BENAR, bukan poros tegak yang dimiringkan sembarang. */
function poleQuaternion(key) {
  const p = PLANET_POLE[key];
  if (!p) return null;
  const v = poleVectorScene(p[0], p[1]);
  /* vektor kutub dinormalisasi */
  const L = Math.hypot(v.x, v.y, v.z) || 1;
  const kx = v.x / L, ky = v.y / L, kz = v.z / L;

  /* kuaternion yang memutar (0,1,0) ke (kx,ky,kz).
     Rumus sumbu-rotasi: sumbu = (0,1,0) x k, sudut = acos(dot) */
  const dot = ky;   /* (0,1,0) . k = ky */
  const q = new THREE.Quaternion();
  if (dot > 0.999999) {
    /* sudah sejajar, tidak perlu rotasi */
    return q;
  }
  if (dot < -0.999999) {
    /* berlawanan arah: putar 180 derajat pada sumbu X */
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    return q;
  }
  /* sumbu rotasi = (0,1,0) x (kx,ky,kz) = (1*kz - 0*ky, 0*kx - 0*kz, 0*ky - 1*kx) */
  const ax = kz, ay = 0, az = -kx;
  const aL = Math.hypot(ax, ay, az) || 1;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  q.setFromAxisAngle(new THREE.Vector3(ax / aL, ay / aL, az / aL), angle);
  return q;
}

/* Sudut kemiringan poros planet terhadap ekuator langit, dalam derajat.
   Dihitung dari vektor kutub — dipakai untuk verifikasi. */
function poleTiltFromEcliptic(key) {
  const p = PLANET_POLE[key];
  if (!p) return 0;
  const v = poleVectorScene(p[0], p[1]);
  const L = Math.hypot(v.x, v.y, v.z) || 1;
  /* sumbu Y scene = kutub ekliptika */
  return Math.acos(Math.max(-1, Math.min(1, v.y / L))) * 180 / Math.PI;
}
