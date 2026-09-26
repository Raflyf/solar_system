/* =======================================================================
   POV BUMI — Melihat langit dari permukaan Bumi (benar-benar diterapkan)
   ----------------------------------------------------------------------
   Cara kerja:
     1. Titik pengamat dihitung dari lat/lon + rotasi Bumi yang SAMA dengan
        yang dipakai mesh Bumi (GMST), jadi titik itu menempel pada tempat
        yang benar di permukaan — bukan sekadar "di dekat Bumi".
     2. Kerangka lokal pengamat (ENU — East/North/Up):
          zenith = radial keluar dari pusat Bumi (Up)
          north  = proyeksi kutub utara Bumi ke bidang horizontal lokal
          east   = north × zenith (aturan tangan kanan ENU)
        Kamera menghadap azimut `az` (0 = utara, + = timur) dan elevasi
        `el` (0 = horizon, + = ke atas), dengan camera.up = zenith supaya
        horizon selalu mendatar.
     3. Kamera (floating origin) ditempatkan di titik itu; seluruh tata
        surya + bola langit digeser relatif terhadapnya — sama seperti mode
        lain, sehingga tidak ada masalah presisi float32.

   KONVENSI TEKSTUR BUMI (terverifikasi dari citra earth_day.jpg):
     U = 0,5  → bujur 0° (Greenwich)      [bukan 180°]
     U = 0    → 180° B ; U = 1 → 180° T
   Three.js SphereGeometry: titik lokal (sebelum rotasi harian) untuk
   lintang φ dan bujur λ adalah
     x = cos φ · cos λ ,  y = sin φ ,  z = −cos φ · sin λ
   Rotasi harian mesh = R_y(GMST) sehingga bujur yang menghadap +X berubah
   mengikuti waktu — inilah yang membuat pengamat "terbawa" rotasi Bumi.

   Referensi: Meeus bab 12–13 (koordinat horizon), IAU SOFA (GMST),
   IAU WGCCRE 2015 (orientasi poros Bumi).
   ======================================================================= */

const EARTH_VIEW = {
  active: false,
  lat: -6.2,      /* derajat (negatif = selatan) */
  lon: 106.8,     /* derajat (positif = timur) */
  elev: 50,       /* meter di atas permukaan laut */
  city: 'Jakarta',
  az: 0,          /* azimut pandang (radian, 0 = utara, + = timur) */
  el: 0.30,       /* elevasi pandang (radian, dari horizon) */
  fov: 50,        /* zoom lensa khusus POV (derajat) */

  cities: {
    'Jakarta':    { lat: -6.20, lon: 106.80 },
    'Surabaya':   { lat: -7.25, lon: 112.75 },
    'Medan':      { lat:  3.59, lon:  98.67 },
    'Makassar':   { lat: -5.14, lon: 119.42 },
    'Denpasar':   { lat: -8.67, lon: 115.21 },
    'Jayapura':   { lat: -2.53, lon: 140.72 },
    'Yogyakarta': { lat: -7.79, lon: 110.36 },
    'Bandung':    { lat: -6.91, lon: 107.60 },
    'Pontianak':  { lat: -0.02, lon: 109.34 },
    'Balikpapan': { lat: -1.27, lon: 116.83 },
  },

  /* Sudut rotasi Bumi (GMST) dalam RADIAN pada JD tertentu.
     Harus identik dengan b._spinAngle yang dipakai mesh Bumi. */
  gmstRad(jd) {
    const gmstDeg = ((280.46061837 + 360.98564736629 * (jd - J2000_JD)) % 360 + 360) % 360;
    return gmstDeg * DEG;
  },

  /* Vektor kutub utara Bumi dalam kerangka scene (dari tabel IAU). */
  poleVec(out) {
    out = out || new THREE.Vector3();
    const p = poleVectorScene(0, 90);   /* Bumi: RA 0°, Dec +90° */
    out.set(p.x, p.y, p.z).normalize();
    return out;
  },

  /* Titik pengamat pada permukaan Bumi.
     days   : hari simulasi sejak J2000
     earth  : body Bumi (butuh absPos)
     hasil  : { pos, zenith, north, east, up }  (Vector3, koordinat ABSOLUT) */
  computeObserver(days, earth) {
    if (!earth || !earth.absPos) return null;
    const jd = J2000_JD + days;
    const W = this.gmstRad(jd);
    const latR = this.lat * DEG;
    const lonR = this.lon * DEG;
    const cl = Math.cos(latR);

    /* titik di permukaan, kerangka lokal mesh (sebelum rotasi harian) */
    const r = 1.0 + (this.elev || 0) / 6371000;   /* 1 unit = radius Bumi */
    const local = new THREE.Vector3(cl * Math.cos(lonR), Math.sin(latR), -cl * Math.sin(lonR))
      .multiplyScalar(r);

    /* rotasi harian (R_y(W)) lalu orientasi poros planet, lalu posisi Bumi.
       Urutan ini mengikuti hierarki grup: group > tiltGroup > spin > mesh. */
    local.applyAxisAngle(AXIS_Y_TEST, W);
    const q = poleQuaternion('earth');
    if (q) local.applyQuaternion(q);
    const pos = local.clone().add(earth.absPos);

    /* zenith = arah radial keluar dari pusat Bumi */
    const zenith = local.clone().normalize();

    /* north = komponen kutub utara yang tegak lurus zenith */
    const pole = this.poleVec();
    const north = pole.clone().addScaledVector(zenith, -pole.dot(zenith));
    if (north.lengthSq() < 1e-12) {
      /* tepat di kutub: tidak ada arah utara yang unik */
      north.set(0, 1, 0).addScaledVector(zenith, -zenith.y);
      if (north.lengthSq() < 1e-12) north.set(1, 0, 0);
    }
    north.normalize();

    /* east = north × zenith (kerangka ENU tangan kanan) */
    const east = new THREE.Vector3().crossVectors(north, zenith).normalize();

    return { pos: pos, zenith: zenith, north: north, east: east, gmstRad: W };
  },

  /* Arah pandang dari azimut/elevasi dalam kerangka pengamat.
     az: 0 = utara, +π/2 = timur ; el: 0 = horizon, +π/2 = zenith. */
  viewDir(obs, out) {
    out = out || new THREE.Vector3();
    const ca = Math.cos(this.az), sa = Math.sin(this.az);
    const ce = Math.cos(this.el), se = Math.sin(this.el);
    out.set(0, 0, 0);
    out.addScaledVector(obs.north, ce * ca);
    out.addScaledVector(obs.east,  ce * sa);
    out.addScaledVector(obs.zenith, se);
    return out.normalize();
  },

  /* Masuk mode POV (kamera di permukaan). */
  enable(lat, lon, cityName, elev) {
    if (lat !== undefined && isFinite(lat)) this.lat = Math.max(-89.9, Math.min(89.9, lat));
    if (lon !== undefined && isFinite(lon)) this.lon = ((lon + 180) % 360 + 360) % 360 - 180;
    if (cityName) this.city = cityName;
    if (elev !== undefined && isFinite(elev)) this.elev = Math.max(0, elev);
    this.active = true;
    this.az = 0;           /* mulai menghadap utara */
    this.el = 0.30;        /* sedikit ke atas */
    this.fov = 50;
    const earth = findBody('earth');
    const obs = this.computeObserver(app.days, earth);
    if (obs) {
      cameraState.vel.set(0, 0, 0);
      cameraState.target = null;
      cameraState.transition = null;
    }
  },

  disable() {
    this.active = false;
    cameraState.vel.set(0, 0, 0);
  },

  /* LST (Local Sidereal Time) dalam derajat — untuk panel pengamat. */
  lstDeg(days) {
    const gmstDeg = this.gmstRad(J2000_JD + days) / DEG;
    return ((gmstDeg + this.lon) % 360 + 360) % 360;
  },

  cityList() { return Object.keys(this.cities); },

  setCity(name) {
    const c = this.cities[name];
    if (c) { this.lat = c.lat; this.lon = c.lon; this.city = name; return true; }
    return false;
  },
};

/* sumbu Y lokal untuk rotasi harian (konstanta terpisah agar modul ini
   tidak bergantung pada urutan pemuatan file lain) */
const AXIS_Y_TEST = new THREE.Vector3(0, 1, 0);
