/* =======================================================================
   COMPASS — STRIP ARAH MATA ANGIN (mode POV permukaan)
   -----------------------------------------------------------------------
   PERMINTAAN PENGGUNA: "tambahkan juga arah mata angin".

   Cara kerja (meniru Stellarium):
     • Strip horizontal di bagian atas layar.
     • Berisi huruf arah setiap 45 derajat (U, TL, T, TG, S, BD, B, BL)
       ditambah tanda kecil setiap 15 derajat.
     • Strip BERGESER mengikuti azimut kamera; huruf yang berada tepat di
       penanda tengah adalah arah yang sedang dipandang.
     • Sudut azimut ditampilkan dalam derajat (0-360) di bawah penanda.

   Rumus posisi:
       Untuk mata angin pada azimuth A (derajat) dan kamera pada azimuth C:
           offset_px = (A - C) dibungkus ke (-180, 180]
           x = tengah + offset_px * (pxPerDeg)
       Nilai dibungkus supaya mata angin selalu berada di jalur yang benar
       (tidak "melompat" saat melewati 0/360).

   PENTING — konvensi azimut:
       SURFACE_VIEW.az = 0 -> menghadap UTARA; positif -> ke TIMUR
       (lihat viewDir(): north*cos(az) + east*sin(az)).
   ======================================================================= */

const COMPASS = {
  strip: null,
  track: null,
  degEl: null,
  pxPerDeg: 3.2,       /* jarak antar derajat di layar */
  built: false,

  /* 8 arah mata angin utama + singkatan Indonesia */
  CARDINALS: [
    { deg: 0,   label: 'U',  full: 'Utara' },
    { deg: 45,  label: 'TL', full: 'Timur Laut' },
    { deg: 90,  label: 'T',  full: 'Timur' },
    { deg: 135, label: 'TG', full: 'Tenggara' },
    { deg: 180, label: 'S',  full: 'Selatan' },
    { deg: 225, label: 'BD', full: 'Barat Daya' },
    { deg: 270, label: 'B',  full: 'Barat' },
    { deg: 315, label: 'BL', full: 'Barat Laut' },
  ],

  init() {
    this.strip = document.getElementById('compassStrip');
    this.track = document.getElementById('compassTrack');
    this.degEl = document.getElementById('compassDeg');
    if (!this.strip || !this.track) return;
    this.build();
  },

  /* Bangun semua penanda sekali saja (satu putaran 360 derajat).
     Saat dipakai, track digeser sehingga hanya bagian yang relevan terlihat. */
  build() {
    if (this.built || !this.track) return;
    const frag = document.createDocumentFragment();

    /* penanda utama setiap 45 derajat */
    for (const c of this.CARDINALS) {
      const el = document.createElement('div');
      el.className = 'compass-tick cardinal';
      el.dataset.deg = String(c.deg);
      el.innerHTML = '<span class="tick-line"></span><span>' + c.label + '</span>';
      el.title = c.full;
      frag.appendChild(el);
    }
    /* penanda kecil setiap 15 derajat (kecuali yang sudah utama) */
    for (let d = 0; d < 360; d += 15) {
      if (d % 45 === 0) continue;
      const el = document.createElement('div');
      el.className = 'compass-tick minor';
      el.dataset.deg = String(d);
      el.innerHTML = '<span class="tick-line"></span><span>·</span>';
      frag.appendChild(el);
    }
    this.track.appendChild(frag);
    this.built = true;

    /* hitung lebar strip untuk menentukan pxPerDeg yang pas:
       satu putaran penuh harus lebih lebar dari strip supaya tidak ada
       celah kosong di tepi. */
    const w = this.strip.getBoundingClientRect().width || 520;
    /* tampilkan ~110 derajat di layar; sisanya di luar pandangan */
    this.pxPerDeg = w / 110;
  },

  /* Perbarui posisi strip. azDeg = azimut kamera (0..360, 0 = Utara). */
  update(azDeg) {
    if (!this.strip || !this.track) return;
    const visible = (typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.active);
    this.strip.classList.toggle('show', !!visible);
    if (!visible) return;

    if (!this.built) { this.init(); if (!this.built) return; }

    const w = this.strip.getBoundingClientRect().width || 520;
    const center = w / 2;
    const az = ((azDeg % 360) + 360) % 360;

    /* geser seluruh track: mata angin dengan azimuth az harus berada di tengah.
       Karena track berisi 0..360, kita hitung pergeseran dasar lalu
       gambarkan setiap penanda di posisi yang dibungkus ke (-180,180]. */
    const ticks = this.track.children;
    for (let i = 0; i < ticks.length; i++) {
      const el = ticks[i];
      const d = parseFloat(el.dataset.deg);
      let off = d - az;
      /* bungkus ke (-180, 180] supaya penanda tidak "melompat" */
      while (off > 180) off -= 360;
      while (off <= -180) off += 360;
      const x = center + off * this.pxPerDeg;
      el.style.left = x.toFixed(1) + 'px';
      /* sembunyikan yang jauh di luar layar (hemat) */
      el.style.display = (x < -60 || x > w + 60) ? 'none' : '';
    }

    if (this.degEl) {
      /* arah mata angin terdekat untuk ditampilkan bersama derajat */
      const near = this.CARDINALS.reduce((best, c) => {
        let d = Math.abs(((c.deg - az + 540) % 360) - 180);
        return (d < best.d) ? { d, c } : best;
      }, { d: 999, c: this.CARDINALS[0] });
      this.degEl.textContent = Math.round(az) + '° ' + near.c.label;
    }
  },
};
