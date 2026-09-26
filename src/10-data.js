/* =======================================================================
   Data Tata Surya — SEMUA dalam skala nyata & satuan yang konsisten
   ----------------------------------------------------------------------
   Satuan dasar : 1 unit tampilan = 1.000 km  (RAD = 6371 km = jari-jari Bumi)
   Sudut        : derajat
   Waktu        : hari Bumi (periode sideris)
   ----------------------------------------------------------------------
   Jarak          : sumbu semi-mayor nyata (km)          [sumber: NASA fact sheet]
   Radius planet  : radius khatulistiwa rata-rata (km)
   Radius matahari: 696.000 km
   ======================================================================= */

const RAD = 6371;                       /* 1 unit tampilan = 1.000 km */
const AU_KM = 149597870.7;

/* ----------------------------------------------------------------------
   SKALA 1 : 1 (sebenarnya)
   • Jarak antar planet : NYATA (aKm / RAD)
   • Radius semua benda : NYATA — tanpa pembesaran sama sekali
   • Jarak planet–bulan : NYATA
   Satu-satunya hal yang tidak bisa 1:1 adalah jarak kamera saat melihat
   seluruh tata surya; itu urusan zoom, bukan skala model.
   ---------------------------------------------------------------------- */
const SIZE_FACTOR = 1.0;
const MOON_ORBIT_FACTOR = 1.0;

/* radius terkecil yang masih boleh ada di scene (unit) — mencegah
   benda mikroskopis seperti Deimos (0,001 unit) hilang karena presisi float */
const MIN_RENDER_RADIUS_UNITS = 0.0;   /* benar-benar 1:1, tanpa pembesaran */

/* Kemiringan bidang orbit terhadap ekliptika (derajat) */
const ORBIT_INCLINATION = {
  Mercury: 7.0, Venus: 3.39, Earth: 0.0, Mars: 1.85,
  Jupiter: 1.31, Saturn: 2.49, Uranus: 0.77, Neptune: 1.77,
};

const PLANETS = [
  {
    name: 'Merkurius', key: 'mercury',
    aKm: 57909050, aScale: 1,          /* orbit nyata */
    e: 0.2056,
    radiusKm: 2440, flat: 0,
    rotationHours: 1407.6,             /* 58,6 hari  */
    periodDays: 87.969,
    axialTilt: 0.034,
    color: 0x9c968c,
    texture: { w: 2048, h: 1024, seed: 11, period: 14, shade: shadeMercury,
               decorate: (ctx, w, h, seed) => drawCraters(ctx, w, h, 900, seed + 3, 3, 46, 1.0) },
    cloudTexture: null,
    info: {
      'Diameter': '4.880 km',
      'Jarak dari Matahari': '57,9 juta km (0,39 SA)',
      'Periode orbit': '88 hari Bumi',
      'Rotasi': '58,6 hari Bumi',
      'Suhu permukaan': '-173 °C hingga 427 °C',
      'Satelit': 'Tidak ada',
    },
  },
  {
    name: 'Venus', key: 'venus',
    aKm: 108208000, aScale: 1,
    e: 0.0068,
    radiusKm: 6052, flat: 0,
    rotationHours: -5832.5,            /* retrograde */
    periodDays: 224.701,
    axialTilt: 177.36,
    color: 0xe8d5a8,
    texture: { w: 2048, h: 1024, seed: 23, period: 10, shade: shadeVenus, decorate: null },
    cloudTexture: null,
    atmosphere: { color: 0xf0dcae, opacity: 0.30, radius: 1.07, fresnel: 3.4, power: 1.35 },
    info: {
      'Diameter': '12.104 km',
      'Jarak dari Matahari': '108,2 juta km (0,72 SA)',
      'Periode orbit': '224,7 hari Bumi',
      'Rotasi': '243 hari Bumi (arah retrograde)',
      'Suhu permukaan': '± 464 °C (terpanas)',
      'Satelit': 'Tidak ada',
    },
  },
  {
    name: 'Bumi', key: 'earth',
    aKm: 149598023, aScale: 1,
    e: 0.0167,
    radiusKm: 6371, flat: 0,
    rotationHours: 23.9345,
    periodDays: 365.256,
    axialTilt: 23.44,
    color: 0x2a5a9e,
    texture: { w: 2048, h: 1024, seed: 37, period: 12, shade: shadeEarth, decorate: null },
    cloudTexture: { w: 2048, h: 1024, seed: 61, period: 12, shade: shadeEarthCloud, decorate: null, transparent: true },
    atmosphere: { color: 0x6fa8ff, opacity: 0.38, radius: 1.055, fresnel: 3.2, power: 1.3 },
    info: {
      'Diameter': '12.742 km',
      'Jarak dari Matahari': '149,6 juta km (1 SA)',
      'Periode orbit': '365,25 hari',
      'Rotasi': '23 jam 56 menit',
      'Suhu permukaan': '-89 °C hingga 58 °C',
      'Satelit': '1 — Bulan',
    },
    moons: [
      {
        name: 'Bulan', radiusKm: 1737.4,
        aKm: 384400, aScale: 1,        /* jarak nyata */
        periodDays: 27.32, e: 0.055, incl: 5.145,
        tidallyLocked: true,
        color: 0xb0aca6,
        texture: { w: 1024, h: 512, seed: 71, period: 12, shade: shadeMoon,
                   decorate: (ctx, w, h, seed) => drawCraters(ctx, w, h, 420, seed + 8, 2.5, 40, 1.0) },
      },
    ],
  },
  {
    name: 'Mars', key: 'mars',
    aKm: 227939366, aScale: 1,
    e: 0.0934,
    radiusKm: 3390, flat: 0.0059,
    rotationHours: 24.6229,
    periodDays: 686.980,
    axialTilt: 25.19,
    color: 0xc1603a,
    texture: { w: 2048, h: 1024, seed: 43, period: 12, shade: shadeMars,
               decorate: (ctx, w, h, seed) => drawCraters(ctx, w, h, 220, seed + 6, 3, 30, 0.7) },
    cloudTexture: null,
    atmosphere: { color: 0xd98a5e, opacity: 0.16, radius: 1.045, fresnel: 3.8, power: 1.4 },
    info: {
      'Diameter': '6.779 km',
      'Jarak dari Matahari': '227,9 juta km (1,52 SA)',
      'Periode orbit': '687 hari Bumi',
      'Rotasi': '24 jam 37 menit',
      'Suhu permukaan': '-153 °C hingga 20 °C',
      'Satelit': '2 — Phobos & Deimos',
    },
    moons: [
      {
        name: 'Phobos', radiusKm: 11.3,
        aKm: 9375, aScale: 1,
        periodDays: 0.31870, e: 0.015000, incl: 1.08,
        color: 0x8a8078, tidallyLocked: true, lumpy: 0.16,
        texture: { w: 512, h: 256, seed: 79, period: 10, shade: shadeMoon,
                   decorate: (ctx, w, h, seed) => drawCraters(ctx, w, h, 90, seed + 2, 4, 30, 1.2) },
      },
      {
        name: 'Deimos', radiusKm: 6.2,
        aKm: 23457, aScale: 1,
        periodDays: 1.26250, e: 0.000000, incl: 1.79,
        color: 0x9a9088, tidallyLocked: true, lumpy: 0.14,
        texture: { w: 512, h: 256, seed: 83, period: 10, shade: shadeMoon,
                   decorate: (ctx, w, h, seed) => drawCraters(ctx, w, h, 60, seed + 5, 3, 24, 1.1) },
      },
    ],
  },
  {
    name: 'Jupiter', key: 'jupiter',
    aKm: 778570000, aScale: 1,
    e: 0.0484,
    radiusKm: 71492, flat: 0.0649,
    rotationHours: 9.925,
    periodDays: 4332.589,
    axialTilt: 3.13,
    color: 0xd8b88a,
    texture: { w: 2048, h: 1024, seed: 53, period: 12, shade: shadeJupiter,
               decorate: (ctx, w, h, seed) => {
                 /* Bintik Merah Besar — dibuat lebih tegas agar jelas terlihat */
                 const gx = w * 0.24, gy = h * 0.615;
                 drawBlob(ctx, w, h, gx, gy, w * 0.058, h * 0.050, '170,58,36', 1.0, seed + 1);
                 drawBlob(ctx, w, h, gx, gy, w * 0.042, h * 0.036, '206,96,60', 1.0, seed + 2);
                 drawBlob(ctx, w, h, gx, gy, w * 0.026, h * 0.022, '232,138,92', 0.95, seed + 3);
                 drawBlob(ctx, w, h, gx, gy, w * 0.012, h * 0.010, '244,176,132', 0.9, seed + 4);
                 /* badai putih kecil */
                 const rnd = mulberry32(seed + 9);
                 for (let i = 0; i < 14; i++) {
                   const x = rnd() * w;
                   const y = h * (0.12 + rnd() * 0.76);
                   drawBlob(ctx, w, h, x, y, w * (0.006 + rnd() * 0.02), h * (0.005 + rnd() * 0.014),
                            '246,238,220', 0.35 + rnd() * 0.35, seed + 10 + i);
                 }
               } },
    cloudTexture: null,
    atmosphere: { color: 0xe8d3a8, opacity: 0.18, radius: 1.03, fresnel: 3.6, power: 1.4 },
    info: {
      'Diameter': '139.820 km',
      'Jarak dari Matahari': '778,6 juta km (5,2 SA)',
      'Periode orbit': '11,86 tahun Bumi',
      'Rotasi': '9 jam 56 menit (tercepat)',
      'Suhu awan': '± -145 °C',
      'Satelit': '95 yang terkonfirmasi',
    },
    moons: [
      {
        name: 'Io', radiusKm: 1821.6,
        aKm: 421800, aScale: 1,
        periodDays: 1.76273, e: 0.004000, incl: 0.05,
        color: 0xe8d36a, tidallyLocked: true,
        texture: { w: 512, h: 256, seed: 91, period: 10,
                   shade: (nx, ny, lat, u, v, P, seed) => {
                     const n = fbm(nx * 3.2, ny * 3.2, P, seed, 4);
                     const sp = fbm(nx * 9, ny * 9, P, seed + 4, 3);
                     const pal = [0, 196, 148, 44, 0.5, 236, 200, 74, 0.75, 244, 226, 120, 1, 250, 242, 190];
                     let t = clamp01(0.2 + n * 0.7 + (sp - 0.5) * 0.3);
                     palInto(pal, t, OUT);
                     if (sp > 0.74) { const k = (sp - 0.74) * 2.5; OUT[0] = lerp(OUT[0], 60, k); OUT[1] = lerp(OUT[1], 52, k); OUT[2] = lerp(OUT[2], 48, k); }
                     return OUT;
                   }, decorate: null },
      },
      {
        name: 'Europa', radiusKm: 1560.8,
        aKm: 671100, aScale: 1,
        periodDays: 3.52546, e: 0.009000, incl: 0.47,
        color: 0xd8cbb4, tidallyLocked: true,
        texture: { w: 512, h: 256, seed: 97, period: 10,
                   shade: (nx, ny, lat, u, v, P, seed) => {
                     const n = fbm(nx * 2.6, ny * 2.6, P, seed, 4);
                     const crack = Math.abs(fbm(nx * 5.5, ny * 5.5, P, seed + 8, 4) - 0.5) * 2;
                     const pal = [0, 186, 168, 142, 0.55, 226, 212, 186, 1, 246, 240, 224];
                     let t = clamp01(0.3 + n * 0.6);
                     palInto(pal, t, OUT);
                     if (crack < 0.08) { const k = 1 - crack / 0.08; OUT[0] = lerp(OUT[0], 172, k * 0.6); OUT[1] = lerp(OUT[1], 128, k * 0.6); OUT[2] = lerp(OUT[2], 92, k * 0.6); }
                     return OUT;
                   }, decorate: null },
      },
      {
        name: 'Ganymede', radiusKm: 2634.1,
        aKm: 1070400, aScale: 1,
        periodDays: 7.15559, e: 0.001000, incl: 0.20,
        color: 0x9a9086, tidallyLocked: true,
        texture: { w: 1024, h: 512, seed: 101, period: 12, shade: shadeMoon,
                   decorate: (ctx, w, h, seed) => drawCraters(ctx, w, h, 260, seed + 4, 3, 34, 0.9) },
      },
      {
        name: 'Callisto', radiusKm: 2410.3,
        aKm: 1882700, aScale: 1,
        periodDays: 16.69044, e: 0.007000, incl: 0.19,
        color: 0x847a70, tidallyLocked: true,
        texture: { w: 1024, h: 512, seed: 103, period: 12, shade: shadeMoon,
                   decorate: (ctx, w, h, seed) => drawCraters(ctx, w, h, 420, seed + 7, 2.5, 40, 1.0) },
      },
    ],
  },
  {
    name: 'Saturnus', key: 'saturn',
    aKm: 1433530000, aScale: 1,
    e: 0.0542,
    radiusKm: 60268, flat: 0.098,
    rotationHours: 10.656,
    periodDays: 10759.22,
    axialTilt: 26.73,
    color: 0xe8d8b0,
    texture: { w: 2048, h: 1024, seed: 59, period: 12, shade: shadeSaturn, decorate: null },
    cloudTexture: null,
    atmosphere: { color: 0xf0e2bc, opacity: 0.15, radius: 1.028, fresnel: 3.6, power: 1.4 },
    ring: {
      inner: 74500, outer: 140220,       /* radius cincin nyata (km) */
      texture: { w: 2048, h: 8, seed: 131, color: [232, 220, 190], darkColor: [168, 146, 112], cassini: 0.652 },
    },
    info: {
      'Diameter': '116.460 km',
      'Jarak dari Matahari': '1,43 miliar km (9,6 SA)',
      'Periode orbit': '29,45 tahun Bumi',
      'Rotasi': '10 jam 39 menit',
      'Suhu awan': '± -178 °C',
      'Satelit': '146 yang terkonfirmasi',
    },
    moons: [
      {
        name: 'Titan', radiusKm: 2574.7,
        aKm: 1221900, aScale: 1,
        periodDays: 15.94545, e: 0.029000, incl: 0.35,
        color: 0xd89a4a, tidallyLocked: true,
        texture: { w: 1024, h: 512, seed: 107, period: 10,
                   shade: (nx, ny, lat, u, v, P, seed) => {
                     const n = fbm(nx * 2.4, ny * 2.4, P, seed, 4);
                     const hz = fbm(nx * 6, ny * 6, P, seed + 5, 3);
                     const pal = [0, 168, 96, 30, 0.5, 216, 150, 62, 0.8, 236, 186, 96, 1, 246, 216, 148];
                     let t = clamp01(0.25 + n * 0.65 + (hz - 0.5) * 0.24);
                     palInto(pal, t, OUT);
                     return OUT;
                   }, decorate: null },
      },
      {
        name: 'Rhea', radiusKm: 763.8,
        aKm: 527200, aScale: 1,
        periodDays: 4.51750, e: 0.001000, incl: 0.34,
        color: 0xc8c4bc, tidallyLocked: true,
        texture: { w: 512, h: 256, seed: 109, period: 10, shade: shadeMoon,
                   decorate: (ctx, w, h, seed) => drawCraters(ctx, w, h, 200, seed + 3, 2.5, 26, 1.0) },
      },
      {
        name: 'Iapetus', radiusKm: 734.5,
        aKm: 3561700, aScale: 1,
        periodDays: 79.33100, e: 0.028000, incl: 15.47,
        color: 0xa89c88, tidallyLocked: true,
        texture: { w: 512, h: 256, seed: 113, period: 10, shade: shadeMoon,
                   decorate: (ctx, w, h, seed) => {
                     drawCraters(ctx, w, h, 160, seed + 4, 2.5, 28, 1.0);
                     /* belahan gelap khas Iapetus */
                     const g = ctx.createLinearGradient(0, 0, w, 0);
                     g.addColorStop(0, 'rgba(30,26,22,0)');
                     g.addColorStop(0.45, 'rgba(30,26,22,0.55)');
                     g.addColorStop(0.62, 'rgba(30,26,22,0.72)');
                     g.addColorStop(1, 'rgba(30,26,22,0.1)');
                     ctx.fillStyle = g;
                     ctx.fillRect(0, 0, w, h);
                   } },
      },
    ],
  },
  {
      name: 'Uranus', key: 'uranus',
      aKm: 2872460000, aScale: 1,
      e: 0.0472,
      radiusKm: 25559, flat: 0.0229,
      rotationHours: -17.24,             /* retrograde */
      periodDays: 30685.4,
      axialTilt: 97.77,                  /* "menggelinding" */
      color: 0xa8e0e4,
      texture: null,  /* pakai procedural HD */
      cloudTexture: null,
      atmosphere: { color: 0xbcecf0, opacity: 0.32, radius: 1.06, fresnel: 3.2, power: 1.3 },
      ring: {
        inner: 41800, outer: 51150,
        texture: { w: 1024, h: 8, seed: 137, color: [180, 200, 208], darkColor: [120, 140, 150], cassini: 0.5, faint: true, innerFade: 0.02, outerFade: 0.02 },
      },
      info: {
        'Diameter': '50.724 km',
        'Jarak dari Matahari': '2,87 miliar km (19,2 SA)',
        'Periode orbit': '84 tahun Bumi',
        'Rotasi': '17 jam 14 menit (menggelinding)',
        'Kemiringan poros': '97,8° — nyaris rebah',
        'Satelit': '28 yang diketahui',
      },
      moons: [
        {
          name: 'Titania', radiusKm: 788.9,
          aKm: 436298, aScale: 1,
          periodDays: 8.70587, e: 0.002000, incl: 0.34,
          color: 0xb8b0a8, tidallyLocked: true,
          texture: null,  /* pakai procedural HD */
        },
        { name: 'Oberon', radiusKm: 761.4, aKm: 583520, aScale: 1, periodDays: 13.4632, e: 0.0010, incl: 0.10, color: 0xa8a098, tidallyLocked: true },
        { name: 'Umbriel', radiusKm: 584.7, aKm: 265970, aScale: 1, periodDays: 4.1442, e: 0.0040, incl: 0.36, color: 0x989088, tidallyLocked: true },
        { name: 'Ariel', radiusKm: 578.9, aKm: 190930, aScale: 1, periodDays: 2.5204, e: 0.0030, incl: 0.31, color: 0xb0a8a0, tidallyLocked: true },
        { name: 'Miranda', radiusKm: 235.8, aKm: 129390, aScale: 1, periodDays: 1.4135, e: 0.0027, incl: 4.34, color: 0xc8c0b8, tidallyLocked: true },
      ],
    },
  {
    name: 'Neptunus', key: 'neptune',
    aKm: 4495060000, aScale: 1,
    e: 0.0086,
    radiusKm: 24764, flat: 0.0171,
    rotationHours: 16.11,
    periodDays: 60189.0,
    axialTilt: 28.32,
    color: 0x4a7ad8,
    texture: { w: 1024, h: 512, seed: 73, period: 12, shade: shadeNeptune, decorate: null },
    cloudTexture: null,
    atmosphere: { color: 0x7fa8ff, opacity: 0.34, radius: 1.055, fresnel: 3.2, power: 1.3 },
    ring: {
          inner: 40900, outer: 62930,
          texture: { w: 1024, h: 8, seed: 139, color: [150, 165, 200], darkColor: [96, 110, 150], cassini: 0.5, faint: true, innerFade: 0.03, outerFade: 0.03 },
        },
        info: {
          'Diameter': '49.244 km',
          'Jarak dari Matahari': '4,50 miliar km (30,1 SA)',
          'Periode orbit': '164,8 tahun Bumi',
          'Rotasi': '16 jam 7 menit',
          'Kemiringan poros': '28,3°',
          'Satelit': '16 yang diketahui',
        },
        moons: [
          {
            name: 'Triton', radiusKm: 1353.4,
            aKm: 354800, aScale: 1,
            periodDays: -5.87699, e: 0.000000, incl: 156.90,
            color: 0xc8ccc8, tidallyLocked: true,
            texture: null,  /* pakai procedural HD */
          },
          { name: 'Nereid', radiusKm: 170, aKm: 5513400, aScale: 1, periodDays: 360.13, e: 0.75, incl: 7.23, color: 0xa8a098, tidallyLocked: false },
        ],
      },
];

/* Asteroid sabuk utama (jarak nyata, 2,1–3,3 SA) */
const BELT = {
  count: 2400,
  minAU: 2.12, maxAU: 3.30,
  inclMax: 14,
  sizeMinKm: 28, sizeMaxKm: 210,
  color: 0x9a8f82,
};

const SUN = {
  radiusKm: 696000,
  rotationHours: 609.12,             /* ± 25,4 hari */
  texture: { w: 2048, h: 1024, seed: 5, period: 14, shade: shadeSun, decorate: null },
  info: {
    'Diameter': '1.392.700 km',
    'Massa': '99,86% massa Tata Surya',
    'Suhu inti': '± 15 juta °C',
    'Suhu permukaan': '± 5.500 °C',
    'Rotasi': '± 25 hari (ekuator)',
    'Usia': '± 4,6 miliar tahun',
  },
};

/* Tabel waktu simulasi: nilai = berapa HARI berlalu per 1 detik nyata.
   Mencakup mode lambat (mengamati rotasi) sampai sangat cepat (abad). */
const TIME_TABLE = [
  1 / 86400,        /* 1 dtk = 1 detik */
  1 / 1440,         /* 1 dtk = 1 menit */
  1 / 96,           /* 1 dtk = 15 menit */
  1 / 24,           /* 1 dtk = 1 jam */
  0.25,             /* 1 dtk = 6 jam */
  1,                /* 1 dtk = 1 hari */
  7,                /* 1 dtk = 1 minggu */
  30.44,            /* 1 dtk = 1 bulan */
  91.31,            /* 1 dtk = 1 musim (3 bulan) */
  365.25,           /* 1 dtk = 1 tahun */
  3652.5,           /* 1 dtk = 10 tahun */
  36525,            /* 1 dtk = 1 abad */
];

/* label untuk tiap entri tabel waktu */
const TIME_LABELS = [
  '1 detik', '1 menit', '15 menit', '1 jam', '6 jam', '1 hari',
  '1 minggu', '1 bulan', '3 bulan', '1 tahun', '10 tahun', '1 abad',
];

/* Daftar tur terpandu */
const TOUR = ['sun', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'mercury', 'venus', 'belt', 'system'];