/* =======================================================================
   SURFACE VIEW — POV PERMUKAAN UNTUK SEMUA PLANET & SATELIT
   -----------------------------------------------------------------------
   Menggantikan EARTH_VIEW yang hanya untuk Bumi. Prinsipnya identik, tetapi
   digeneralisasi memakai infrastruktur yang SUDAH ADA dan tervalidasi:

     • poleQuaternion(key)  — orientasi poros nyata (IAU WGCCRE 2015)
     • b._spinAngle         — sudut rotasi harian body (GMST/IAU W)
     • b.radiusKm           — radius body

   Rumus titik pengamat pada body b (lintang φ, bujur λ, ketinggian h):

     r     = 1 + h/R
     local = (cos φ cos λ, sin φ, −cos φ sin λ) · r     [konvensi mesh]
     local = R_y(spinAngle) · local                     [rotasi harian]
     local = Q_pole · local                             [poros nyata]
     pos   = local + b.absPos                           [posisi absolut]

   Ini SAMA PERSIS dengan jalur mesh (group → tiltGroup → spin), sehingga
   pengamat benar-benar menempel di tempat yang tepat pada permukaan.

   Kerangka lokal pengamat (ENU — East/North/Up):
     zenith = local ternormalisasi (radial keluar)
     north  = komponen kutub body yang tegak lurus zenith
     east   = north × zenith

   Referensi:
     - Meeus, Astronomical Algorithms bab 12–13 (koordinat horizon)
     - IAU WGCCRE 2015 (Archinal et al. 2018) untuk orientasi poros
     - IAU SOFA (GMST)
   ======================================================================= */

const SURFACE_VIEW = {
  active: false,

  /* body yang sedang dipakai POV (diisi saat enable) */
  bodyKey: null,
  bodyName: '',

  /* koordinat pengamat */
  lat: -6.2,
  lon: 106.8,
  elev: 50,          /* meter di atas permukaan (dipakai Bumi) */

  /* orientasi pandang */
  az: 0,             /* azimut (radian, 0 = utara, + = timur) */
  el: 0.30,          /* elevasi (radian dari horizon) */
  fov: 50,           /* lensa khusus POV */

  /* tampilan */
  atmosphereOn: true,     /* pilihan pengguna: nyalakan atmosfer */
  nightLightsOn: true,    /* lampu kota di sisi malam (Bumi) */
  cloudsOn: true,        /* lapisan awan (Bumi) */

  /* ---------------- preset lokasi menarik per body ---------------- */
  /* Koordinat dari data resmi: IAU/USGS Gazetteer of Planetary
     Nomenclature (planetarynames.wr.usgs.gov) & NASA fact sheet. */
  presets: {
    earth: [
      { name: 'Jakarta',       lat: -6.20,  lon: 106.80 },
      { name: 'Surabaya',      lat: -7.25,  lon: 112.75 },
      { name: 'Medan',         lat:  3.59,  lon:  98.67 },
      { name: 'Makassar',      lat: -5.14,  lon: 119.42 },
      { name: 'Jayapura',      lat: -2.53,  lon: 140.72 },
      { name: 'Yogyakarta',    lat: -7.79,  lon: 110.36 },
      { name: 'Bandung',       lat: -6.91,  lon: 107.60 },
      { name: 'Pontianak',     lat: -0.02,  lon: 109.34 },
      { name: 'Balikpapan',    lat: -1.27,  lon: 116.83 },
      { name: 'Denpasar',      lat: -8.67,  lon: 115.21 },
      { name: 'Kutub Utara',   lat: 89.9,   lon: 0 },
      { name: 'Everest',       lat: 27.988, lon: 86.925 },
      { name: 'Grand Canyon',  lat: 36.107, lon: -112.113 },
      { name: 'Sahara',        lat: 23.417, lon: 25.0 },
    ],
    mars: [
      { name: 'Olympus Mons',  lat: 18.65,  lon: -226.2 },   /* IAU/USGS */
      { name: 'Valles Marineris', lat: -14.0, lon: -301.4 },
      { name: 'Gale Crater',   lat: -5.4,   lon: 137.8 },
      { name: 'Jezero Crater', lat: 18.38,  lon: 77.58 },
      { name: 'Kutub Utara',   lat: 89.9,   lon: 0 },
    ],
    moon: [
      { name: 'Tycho',         lat: -43.31, lon: -11.36 },   /* IAU */
      { name: 'Mare Tranquillitatis', lat: 8.5, lon: 31.4 },
      { name: 'Apollo 11',     lat: 0.674,  lon: 23.473 },
      { name: 'Kutub Selatan', lat: -89.9,  lon: 0 },
    ],
    venus: [
      { name: 'Maxwell Montes', lat: 65.2,  lon: 3.3 },
      { name: 'Alpha Regio',    lat: -25.5, lon: 0.4 },
    ],
    mercury: [
      { name: 'Caloris Basin',  lat: 30.5,  lon: 162.0 },
      { name: 'Kutub Utara',    lat: 89.9,  lon: 0 },
    ],
    jupiter: [
      { name: 'Great Red Spot', lat: -22.0, lon: 0 },
    ],
    saturn: [
      { name: 'Hexagon (kutub)', lat: 78.0, lon: 0 },
    ],
    io:    [ { name: 'Pele Volcano', lat: -18.7, lon: 255.5 } ],
    europa: [ { name: 'Conamara Chaos', lat: 9.7, lon: 274.4 } ],
    titan: [ { name: 'Kutub Utara (danau)', lat: 78.0, lon: 0 } ],
  },

  /* Daftar body yang bisa dipakai POV (planet + satelit + Matahari) */
  availableBodies() {
    const out = [];
    if (typeof bodies === 'undefined') return out;
    for (const b of bodies) {
      out.push({
        key: b.key,
        name: b.name,
        type: b.isMoon ? 'moon' : (b.type === 'star' ? 'star' : 'planet'),
        hostName: b.host ? b.host.name : null,
        radiusKm: b.realRadiusKm || b.radiusKm,
        hasPresets: !!this.presets[this.presetKey(b)],
      });
    }
    return out;
  },

  /* kunci preset untuk sebuah body (Bulan dipetakan ke 'moon') */
  presetKey(b) {
    if (!b) return null;
    if (b.key === 'earth') return 'earth';
    if (b.name === 'Bulan') return 'moon';
    if (b.key) return b.key;
    return (b.name || '').toLowerCase();
  },

  /* Dapatkan body aktif (mencari dengan kunci gabungan yang benar) */
  currentBody() {
    if (this.bodyKey === null) return null;
    if (typeof findBody === 'function') {
      const b = findBody(this.bodyKey);
      if (b) return b;
    }
    if (typeof findBodyByName === 'function' && this.bodyName) {
      return findBodyByName(this.bodyName);
    }
    return null;
  },

  /* ---------------- matematika inti ---------------- */

  /* Sudut rotasi harian body (radian). Memakai _spinAngle yang dihitung
     updateSpinAngles() — SATU SUMBER, sehingga POV dan mesh selalu
     sinkron (tidak ada duplikasi rumus). */
  spinAngleOf(b) {
    if (!b) return 0;
    if (b._spinAngle !== undefined) return b._spinAngle;
    if (b.key === 'earth') {
      const jd = J2000_JD + app.days;
      const gmst = 280.46061837 + 360.98564736629 * (jd - J2000_JD);
      return (((gmst % 360) + 360) % 360) * DEG;
    }
    return 0;
  },

  /* Kuaternion poros body. Untuk satelit yang tidak punya entri PLANET_POLE,
     pakai poros induknya (bidang orbit satelit ≈ ekuator induk) — konsisten
     dengan cara moonPlane dibuat di buildBody(). */
  poleQ(b) {
    if (!b) return null;
    if (typeof poleQuaternion !== 'function') return null;
    if (!b.isMoon && b.key) return poleQuaternion(b.key);
    if (b.host && b.host.key) {
      /* Bulan Bumi: bidang orbit = ekliptika (sama seperti moonPlane),
         jadi porosnya memakai Bumi; satelit lain memakai poros induk. */
      return poleQuaternion(b.name === 'Bulan' ? 'earth' : b.host.key);
    }
    return null;
  },

  /* Titik pengamat pada permukaan body.
     Mengembalikan { pos, zenith, north, east, spinAngle } (koordinat absolut). */
  computeObserver(body) {
    if (!body || !body.absPos) return null;
    const latR = this.lat * DEG;
    const lonR = this.lon * DEG;
    const cl = Math.cos(latR);

    /* 1 unit scene = radius Bumi (RAD km). Ketinggian di atas permukaan
       dikonversi ke unit: h_unit = h_km / RAD. Untuk planet lain, kita
       memakai ketinggian meter di atas permukaannya juga. */
    const rKm = (body.realRadiusKm || body.radiusKm * RAD) + (this.elev || 0) / 1000;
    const r = rKm / RAD;

    /* posisi lokal di mesh (konvensi Three.js SphereGeometry yang sudah
       diverifikasi untuk tekstur Bumi: u=0,5 → bujur 0°) */
    const local = new THREE.Vector3(cl * Math.cos(lonR), Math.sin(latR), -cl * Math.sin(lonR))
      .multiplyScalar(r);

    /* rotasi harian → orientasi poros → posisi absolut.
       Urutan ini mengikuti hierarki grup: group > tiltGroup > spin. */
    local.applyAxisAngle(SV_AXIS_Y, this.spinAngleOf(body));
    const q = this.poleQ(body);
    if (q) local.applyQuaternion(q);
    const pos = local.clone().add(body.absPos);

    /* zenith = radial keluar dari pusat body */
    const zenith = local.clone().normalize();

    /* north = komponen kutub body yang tegak lurus zenith */
    const poleV = new THREE.Vector3();
    if (typeof poleVectorScene === 'function' && !body.isMoon && PLANET_POLE[body.key]) {
      const p = PLANET_POLE[body.key];
      const pv = poleVectorScene(p[0], p[1]);
      poleV.set(pv.x, pv.y, pv.z).normalize();
    } else {
      /* satelit: pakai sumbu Y body setelah kuaternion poros induk */
      poleV.set(0, 1, 0);
      const qq = this.poleQ(body);
      if (qq) poleV.applyQuaternion(qq);
    }
    const north = poleV.clone().addScaledVector(zenith, -poleV.dot(zenith));
    if (north.lengthSq() < 1e-12) {
      north.set(0, 1, 0).addScaledVector(zenith, -zenith.y);
      if (north.lengthSq() < 1e-12) north.set(1, 0, 0);
    }
    north.normalize();

    const east = new THREE.Vector3().crossVectors(north, zenith).normalize();

    return { pos, zenith, north, east, spinAngle: this.spinAngleOf(body) };
  },

  /* Arah pandang dari azimut/elevasi dalam kerangka pengamat ENU */
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

  /* Sudut Matahari terhadap horizon pengamat (derajat).
     Negatif = Matahari di bawah horizon (malam). */
  sunAltitudeDeg(obs) {
    if (!obs || typeof findBody !== 'function') return 0;
    const sun = findBody('sun');
    if (!sun || !sun.absPos) return 0;
    const toSun = sun.absPos.clone().sub(obs.pos).normalize();
    const sinAlt = toSun.dot(obs.zenith);
    return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG;
  },

  /* Apakah pengamat sedang siang? */
  isDaytime(obs) {
    return this.sunAltitudeDeg(obs) > 0;
  },

  /* ---------------- kontrol masuk/keluar ---------------- */

  /* Masuk mode POV untuk body tertentu.
     bodyKey bisa berupa: kunci planet ('earth'), nama satelit ('Bulan'),
     atau kunci gabungan ('earth:Bulan'). */
  enable(bodyKey, lat, lon, elev) {
    let b = null;
    if (typeof findBody === 'function') b = findBody(bodyKey);
    if (!b && typeof findBodyByName === 'function') b = findBodyByName(bodyKey);
    if (!b && typeof bodies !== 'undefined') {
      /* pencarian longgar: cocokkan nama tanpa peduli huruf besar/kecil */
      const q = String(bodyKey).toLowerCase();
      for (const x of bodies) {
        if ((x.key && x.key.toLowerCase() === q) ||
            (x.name && x.name.toLowerCase() === q) ||
            (x.key && x.key.toLowerCase().endsWith(':' + q))) { b = x; break; }
      }
    }
    if (!b) return false;

    this.bodyKey = b.key;          /* SELALU simpan kunci gabungan yang benar */
    this.bodyName = b.name;

    if (lat !== undefined && isFinite(lat)) this.lat = Math.max(-89.9, Math.min(89.9, lat));
    if (lon !== undefined && isFinite(lon)) this.lon = ((lon + 180) % 360 + 360) % 360 - 180;
    if (elev !== undefined && isFinite(elev)) this.elev = Math.max(0, elev);

    /* Kalau ada preset untuk body ini dan pengguna belum memilih koordinat,
       pakai preset pertama sebagai titik awal yang menarik. */
    const pk = this.presetKey(b);
    if (lat === undefined && this.presets[pk] && this.presets[pk].length) {
      const p0 = this.presets[pk][0];
      this.lat = p0.lat; this.lon = p0.lon;
    }

    this.active = true;
    this.az = 0;
    this.el = 0.30;
    this.fov = 50;

    cameraState.vel.set(0, 0, 0);
    cameraState.target = null;
    cameraState.transition = null;
    return true;
  },

  disable() {
    this.active = false;
    this.bodyKey = null;
    cameraState.vel.set(0, 0, 0);
  },

  /* Preset untuk body aktif */
  presetList() {
    const b = this.currentBody();
    if (!b) return [];
    const pk = this.presetKey(b);
    return this.presets[pk] || [];
  },

  applyPreset(name) {
    const list = this.presetList();
    for (const p of list) {
      if (p.name === name) { this.lat = p.lat; this.lon = p.lon; return true; }
    }
    return false;
  },
};

/* sumbu Y lokal untuk rotasi harian */
const SV_AXIS_Y = new THREE.Vector3(0, 1, 0);

/* =======================================================================
   KOMPATIBILITAS: EARTH_VIEW lama tetap ada sebagai alias SURFACE_VIEW
   -----------------------------------------------------------------------
   Banyak berkas lain (30-controls, 21-earthview-ui, 60-main) masih
   menyebut EARTH_VIEW. Alih-alih menyunting puluhan tempat sekaligus
   (rawan bug), kita sediakan jembatan: EARTH_VIEW = SURFACE_VIEW, plus
   properti `city` yang lama untuk kompatibilitas UI.
   ======================================================================= */
const EARTH_VIEW = {
  get active() { return SURFACE_VIEW.active; },
  set active(v) { SURFACE_VIEW.active = v; },
  get lat() { return SURFACE_VIEW.lat; },
  set lat(v) { SURFACE_VIEW.lat = v; },
  get lon() { return SURFACE_VIEW.lon; },
  set lon(v) { SURFACE_VIEW.lon = v; },
  get elev() { return SURFACE_VIEW.elev; },
  set elev(v) { SURFACE_VIEW.elev = v; },
  get az() { return SURFACE_VIEW.az; },
  set az(v) { SURFACE_VIEW.az = v; },
  get el() { return SURFACE_VIEW.el; },
  set el(v) { SURFACE_VIEW.el = v; },
  get fov() { return SURFACE_VIEW.fov; },
  set fov(v) { SURFACE_VIEW.fov = v; },
  get city() { return SURFACE_VIEW.city; },
  set city(v) { SURFACE_VIEW.city = v; },
  get atmosphereOn() { return SURFACE_VIEW.atmosphereOn; },
  set atmosphereOn(v) { SURFACE_VIEW.atmosphereOn = v; },

  gmstRad(jd) {
    const gmstDeg = ((280.46061837 + 360.98564736629 * (jd - J2000_JD)) % 360 + 360) % 360;
    return gmstDeg * DEG;
  },
  poleVec(out) {
    out = out || new THREE.Vector3();
    const p = poleVectorScene(0, 90);
    out.set(p.x, p.y, p.z).normalize();
    return out;
  },
  computeObserver(days, earth) { return SURFACE_VIEW.computeObserver(earth); },
  viewDir(obs, out) { return SURFACE_VIEW.viewDir(obs, out); },
  enable(lat, lon, cityName, elev) {
    /* API lama: enable(lat, lon, city, elev) untuk Bumi */
    if (cityName) SURFACE_VIEW.city = cityName;
    return SURFACE_VIEW.enable('earth', lat, lon, elev);
  },
  disable() { return SURFACE_VIEW.disable(); },
  lstDeg(days) {
    const gmstDeg = this.gmstRad(J2000_JD + days) / DEG;
    return ((gmstDeg + this.lon) % 360 + 360) % 360;
  },
  cityList() { return (SURFACE_VIEW.presets.earth || []).map(p => p.name); },
  setCity(name) {
    const list = SURFACE_VIEW.presets.earth || [];
    for (const p of list) {
      if (p.name === name) {
        SURFACE_VIEW.lat = p.lat; SURFACE_VIEW.lon = p.lon;
        SURFACE_VIEW.city = name;
        return true;
      }
    }
    return false;
  },
};
