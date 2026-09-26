/* =======================================================================
   POV BUMI — Melihat langit dari permukaan Bumi
   ----------------------------------------------------------------------
   Mode ini menempatkan kamera di permukaan Bumi pada lintang/bujur
   tertentu, dengan orientasi ke zenith. Semua posisi benda langit
   dikonversi dari RA/Dec → Azimuth/Elevasi untuk pengamat.

   Referensi: Meeus "Astronomical Algorithms" bab 12-13 (koordinat
   horizon), IAU SOFA untuk GMST/LST.

   Kota-kota Indonesia:
   - Jakarta: -6.2, 106.8
   - Surabaya: -7.25, 112.75
   - Medan: 3.59, 98.67
   - Makassar: -5.14, 119.42
   - Denpasar: -8.67, 115.21
   - Jayapura: -2.53, 140.72
   ======================================================================= */

const EARTH_VIEW = {
  active: false,
  lat: -6.2,      // derajat (negatif = selatan)
  lon: 106.8,     // derajat (positif = timur)
  elev: 50,       // meter di atas permukaan laut
  city: 'Jakarta',

  cities: {
    'Jakarta': { lat: -6.2, lon: 106.8 },
    'Surabaya': { lat: -7.25, lon: 112.75 },
    'Medan': { lat: 3.59, lon: 98.67 },
    'Makassar': { lat: -5.14, lon: 119.42 },
    'Denpasar': { lat: -8.67, lon: 115.21 },
    'Jayapura': { lat: -2.53, lon: 140.72 },
    'Yogyakarta': { lat: -7.79, lon: 110.36 },
    'Bandung': { lat: -6.91, lon: 107.6 },
  },

  /* Aktifkan mode POV Bumi */
  enable(lat, lon, cityName) {
    if (lat !== undefined) this.lat = lat;
    if (lon !== undefined) this.lon = lon;
    if (cityName) this.city = cityName;
    this.active = true;
  },

  /* Nonaktifkan, kembali ke mode luar angkasa */
  disable() {
    this.active = false;
  },

  /* Hitung LST (Local Sidereal Time) dalam derajat */
  lst(jd) {
    const gmstDeg = ((280.46061837 + 360.98564736629 * (jd - J2000_JD)) % 360 + 360) % 360;
    return (gmstDeg + this.lon + 360) % 360;
  },

  /* Konversi RA (jam) + Dec (derajat) → Azimuth + Elevasi (derajat)
     untuk pengamat di lat/lon saat ini */
  raDecToAltAz(raHours, decDeg, jd) {
    const raDeg = raHours * 15;
    const latRad = this.lat * DEG;
    const decRad = decDeg * DEG;

    // Hour Angle
    let H = this.lst(jd) - raDeg;
    H = ((H + 180) % 360 + 360) % 360 - 180; // normalisasi ke -180..180
    const HRad = H * DEG;

    // Elevasi (altitude)
    const sinAlt = Math.sin(decRad) * Math.sin(latRad) +
                   Math.cos(decRad) * Math.cos(latRad) * Math.cos(HRad);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG;

    // Azimuth (dari utara, ke timur)
    const cosA = (Math.sin(decRad) - Math.sin(latRad) * sinAlt) /
                 (Math.cos(latRad) * Math.cos(alt * DEG));
    let az = Math.acos(Math.max(-1, Math.min(1, cosA))) / DEG;
    if (Math.sin(HRad) > 0) az = 360 - az;

    return { az, alt };
  },

  /* Dapatkan posisi kamera untuk mode POV Bumi (dalam unit scene) */
  getCameraPosition(earthBody) {
    if (!earthBody || !earthBody.absPos) return null;

    // Posisi pengamat di permukaan Bumi dalam frame scene
    // Bumi di absPos, radius 1 unit. Vektor dari pusat Bumi ke pengamat:
    const latRad = this.lat * DEG;
    const lonRad = this.lon * DEG;

    // Gunakan rotasi Bumi: GMST untuk menentukan bujur scene
    const gmst = ((280.46061837 + 360.98564736629 * (app.days)) % 360 + 360) % 360;

    // Bujur pengamat dalam frame scene (ekliptika → scene mapping)
    // Scene: x = ecl.x, y = ecl.z, z = -ecl.y
    // Sederhananya: tempatkan kamera di permukaan mesh Bumi pada arah
    // yang sesuai dengan lat/lon geografis + rotasi GMST

    // Sudut rotasi Bumi saat ini (sama dengan yang dipakai spin mesh)
    const spinAngle = gmst * DEG;

    // Arah pengamat dari pusat Bumi (ekoatorial → scene):
    // lat: sudut dari ekuator; lon: sudut dari meridian utama
    const phi = (90 - this.lat) * DEG;  // colatitude
    const theta = (this.lon + gmst) * DEG; // bujur + rotasi

    // Koordinat ekuatorial Bumi (x=0°, z=kutub) → scene (y=atas)
    const sinPhi = Math.sin(phi);
    const ex = sinPhi * Math.cos(theta);
    const ey = sinPhi * Math.sin(theta);
    const ez = Math.cos(phi);

    // Scene mapping: (x, y, z)_scene = (ex, ez, -ey)
    const r = 1.0 + (this.elev / 6371000); // radius + elevasi
    return {
      x: earthBody.absPos.x + ex * r,
      y: earthBody.absPos.y + ez * r,
      z: earthBody.absPos.z + (-ey) * r,
      // Arah pandang: ke luar dari Bumi (zenith)
      lookDir: { x: ex, y: ez, z: -ey },
    };
  },

  /* Daftar kota untuk dropdown */
  cityList() {
    return Object.keys(this.cities);
  },

  setCity(name) {
    const c = this.cities[name];
    if (c) {
      this.lat = c.lat;
      this.lon = c.lon;
      this.city = name;
      return true;
    }
    return false;
  },
};
