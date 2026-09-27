/* =======================================================================
   NAMA RASI BINTANG — LABEL NAMA RASI DI LANGIT (gaya Stellarium)
   -----------------------------------------------------------------------
   PERMINTAAN PENGGUNA: "mana kontelasi yg lain seperti stellarium knapa
   pada tidak ada?" + "kontelasi dan rasi bintang nya juga jangan ngawur,
   buat se valid dan se realistik mungkin".

   Yang membuat Stellarium terasa lengkap adalah LABEL NAMA RASI
   (PEGASUS, CASSIOPEIA, ORION, ...) di posisi pusat tiap rasi.

   DATA: nama singkatan 3 huruf dari CONSTELLATIONS (86 rasi resmi IAU),
   dipetakan ke nama Indonesia/Latin lengkap. Pusat rasi dihitung sebagai
   rata-rata posisi semua bintang anggotanya (bukan tebakan).

   Kinerja: label berupa elemen DOM (div), diperbarui tiap frame dengan
   proyeksi ke layar. Hanya rasi yang terlihat di layar yang di-render.
   ======================================================================= */

/* Nama lengkap 86 rasi resmi IAU (singkatan -> nama) */
const CONSTELLATION_NAMES = {
  And: 'Andromeda', Ant: 'Antlia', Aps: 'Apus', Aqr: 'Aquarius',
  Aql: 'Aquila', Ara: 'Ara', Ari: 'Aries', Aur: 'Auriga',
  Boo: 'Boötes', Cae: 'Caelum', Cam: 'Camelopardalis', Cnc: 'Cancer',
  CVn: 'Canes Venatici', CMa: 'Canis Major', CMi: 'Canis Minor',
  Cap: 'Capricornus', Car: 'Carina', Cas: 'Cassiopeia', Cen: 'Centaurus',
  Cep: 'Cepheus', Cet: 'Cetus', Cha: 'Chamaeleon', Cir: 'Circinus',
  Col: 'Columba', Com: 'Coma Berenices', CrA: 'Corona Australis',
  CrB: 'Corona Borealis', Crv: 'Corvus', Crt: 'Crater', Cru: 'Crux',
  Cyg: 'Cygnus', Del: 'Delphinus', Dor: 'Dorado', Dra: 'Draco',
  Equ: 'Equuleus', Eri: 'Eridanus', For: 'Fornax', Gem: 'Gemini',
  Gru: 'Grus', Her: 'Hercules', Hor: 'Horologium', Hya: 'Hydra',
  Hyi: 'Hydrus', Ind: 'Indus', Lac: 'Lacerta', Leo: 'Leo',
  LMi: 'Leo Minor', Lep: 'Lepus', Lib: 'Libra', Lup: 'Lupus',
  Lyn: 'Lynx', Lyr: 'Lyra', Men: 'Mensa', Mic: 'Microscopium',
  Mon: 'Monoceros', Mus: 'Musca', Nor: 'Norma', Oct: 'Octans',
  Oph: 'Ophiuchus', Ori: 'Orion', Pav: 'Pavo', Peg: 'Pegasus',
  Per: 'Perseus', Phe: 'Phoenix', Pic: 'Pictor', Psc: 'Pisces',
  PsA: 'Piscis Austrinus', Pup: 'Puppis', Pyx: 'Pyxis', Ret: 'Reticulum',
  Sge: 'Sagitta', Sgr: 'Sagittarius', Sco: 'Scorpius', Scl: 'Sculptor',
  Sct: 'Scutum', Ser: 'Serpens', Sex: 'Sextans', Tau: 'Taurus',
  Tel: 'Telescopium', Tri: 'Triangulum', TrA: 'Triangulum Australe',
  Tuc: 'Tucana', UMa: 'Ursa Major', UMi: 'Ursa Minor', Vel: 'Vela',
  Vir: 'Virgo', Vol: 'Volans', Vul: 'Vulpecula',
};

const CONSTELLATION_LABELS = {
  layer: null,
  items: [],        /* { el, x, y, z (vektor satuan scene) } */
  built: false,

  init() {
    this.layer = document.getElementById('constellationLabels');
    if (!this.layer) {
      /* buat lapisan sendiri bila belum ada di HTML */
      this.layer = document.createElement('div');
      this.layer.id = 'constellationLabels';
      this.layer.className = 'constellation-labels';
      const host = document.getElementById('labelLayer') || document.body;
      host.appendChild(this.layer);
    }
    /* build() dipanggil terlambat (dari render loop) karena butuh
       eqVecToScene & SKY_RADIUS yang didefinisikan di 18-stars.js —
       file ini dimuat SEBELUM-nya. Lihat komentar di build(). */
  },

  /* Hitung pusat setiap rasi = rata-rata arah semua bintang anggotanya.
     Arah (bukan posisi rata-rata) dipakai supaya pusat selalu berada di
     bola langit. */
  build() {
    if (this.built) return;
    if (typeof CONSTELLATIONS === 'undefined' || typeof STARS_LABELED === 'undefined') return;
    /* butuh eqVecToScene & SKY_RADIUS dari 18-stars.js; kalau belum
       tersedia, tunda (dipanggil ulang dari render loop). */
    if (typeof eqVecToScene !== 'function' || typeof SKY_RADIUS === 'undefined') return;
    const all = STARS_LABELED.concat(STARS_OTHER);
    if (!all.length) return;

    /* pastikan lapisan DOM ada — dipanggil di sini (bukan hanya init)
       supaya tetap bekerja walau init() terlewat. */
    if (!this.layer) {
      this.layer = document.getElementById('constellationLabels');
      if (!this.layer) {
        this.layer = document.createElement('div');
        this.layer.id = 'constellationLabels';
        this.layer.className = 'constellation-labels';
        const host = document.getElementById('labelLayer') || document.body;
        host.appendChild(this.layer);
      }
    }
    /* kosongkan dulu supaya build ulang tidak menggandakan label */
    this.items.length = 0;
    this.layer.innerHTML = '';

    for (const c of CONSTELLATIONS) {
      const nama = c.nama;
      const full = CONSTELLATION_NAMES[nama] || nama;
      /* rata-rata arah bintang anggota */
      let sx = 0, sy = 0, sz = 0, n = 0;
      const seen = new Set();
      for (const seg of c.segments) {
        for (const idx of seg) {
          if (seen.has(idx)) continue;
          seen.add(idx);
          const s = all[idx];
          if (!s) continue;
          const d = Math.sqrt(s[4] ** 2 + s[5] ** 2 + s[6] ** 2) || 1;
          sx += s[4] / d; sy += s[5] / d; sz += s[6] / d;
          n++;
        }
      }
      if (n === 0) continue;
      const len = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
      const ux = sx / len, uy = sy / len, uz = sz / len;
      /* ke kerangka scene (sama dengan bintang & planet) */
      const p = eqVecToScene(ux, uy, uz, SKY_RADIUS * 0.98);

      const el = document.createElement('div');
      el.className = 'constellation-label';
      el.textContent = full;
      el.title = nama + ' — ' + full;
      this.layer.appendChild(el);
      this.items.push({ el, x: p.x, y: p.y, z: p.z, nama });
    }
    this.built = true;
  },

  /* Perbarui posisi label di layar.
     Dipanggil dari render loop saat label rasi aktif. */
  update(show) {
    if (!this.built) this.build();
    if (!this.layer) return;
    if (!this.built) return;
    if (!show) {
      if (this.layer.style.display !== 'none') this.layer.style.display = 'none';
      return;
    }
    this.layer.style.display = '';
    const W = window.innerWidth, H = window.innerHeight;
    const v = new THREE.Vector3();
    for (const it of this.items) {
      v.set(it.x, it.y, it.z).project(camera);
      const visible = (v.z > -1 && v.z < 1 &&
                       Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.98);
      if (!visible) {
        if (it.el.style.display !== 'none') it.el.style.display = 'none';
        continue;
      }
      it.el.style.display = '';
      it.el.style.left = ((v.x * 0.5 + 0.5) * W).toFixed(0) + 'px';
      it.el.style.top = ((-v.y * 0.5 + 0.5) * H).toFixed(0) + 'px';
    }
  },
};
