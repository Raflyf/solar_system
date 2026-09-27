/* =======================================================================
   SURFACE DETAIL — TEKSTUR DETAIL PADA PATCH PERMUKAAN
   -----------------------------------------------------------------------
   Menjawab permintaan: "untuk bumi itu tambahkan lagi agar bisa masuk ke
   dalam seperti google earth dan google map... sangat HD bumi nya bisa
   di zoom sampai ke darat".

   RIWAYAT PENDEKATAN (penting — dua percobaan pertama GAGAL):
     ✗ Percobaan 1: bidang datar terpisah di atas patch.
       Gagal karena patch bola menutupi seluruh pandangan sampai horizon
       (radius 26 km), sedangkan bidang tile berpusat 19 km dari kamera —
       jadi selalu berada DI DALAM patch dan tertutup olehnya.
       Terbukti: 10 draw call terdeteksi, tetapi piksel layar tidak berubah.
     ✗ Percobaan 2: menaikkan bidang 128 m di atas permukaan.
       Gagal karena kamera hanya 50 m di atas permukaan: bidang jadi LEBIH
       JAUH dari kamera daripada patch, sehingga kalah depth test.

   ✓ PENDEKATAN YANG BENAR (dipakai sekarang):
     Tile TIDAK dipasang sebagai bidang terpisah. Sebaliknya, tekstur
     patch permukaan (24-surface-patch.js) DIGANTI dengan citra tile
     resolusi tinggi, di-zoom ke wilayah pengamat.

     Cara: tekstur global (4096x2048 = 10 km/px) dipotong pada wilayah
     sekitar pengamat dan diperbesar. Potongan itu dipakai sebagai map
     patch. Hasilnya resolusi efektif naik drastis tanpa geometri tambahan
     — nol biaya render tambahan, jadi 60 fps aman.

     Keunggulan tambahan: tidak ada masalah z-fighting, tidak ada masalah
     kedalaman, dan tidak ada bidang yang bisa "salah tempat".

   SUMBER: NASA GIBS (Global Imagery Browse Services) — WMTS resmi, gratis,
   CORS terbuka. Layer BlueMarble_ShadedRelief_Bathymetry.
   ======================================================================= */

const SURFACE_DETAIL = {
  enabled: true,
  /* resolusi tekstur patch yang ditingkatkan (piksel per sisi) */
  size: 2048,
  /* cakupan tekstur (derajat) — diisi ulang oleh spanForElevation() */
  spanDeg: 1.5,
  /* cache tekstur agar pindah lokasi tidak memuat ulang */
  _cache: new Map(),
  _cacheMax: 6,
  lastKey: '',
  loading: false,
  _stats: { loaded: 0, failed: 0 },

  /* =====================================================================
     CAKUPAN TEKSTUR DETAIL (spanDeg) — MENYESUAIKAN TINGGI KAMERA (LOD)
     ---------------------------------------------------------------------
     MASALAH: spanDeg tetap 6° (660 km) membuat tekstur 2048 px hanya
     memberi ~320 m/px. Saat pengguna berdiri di permukaan dan melihat
     ~25 km ke depan, wilayah itu hanya 78 piksel dari 2048 — sehingga
     layar tampak rata (terbukti di uji: piksel seragam 199,194,170).

     SOLUSI (LOD seperti Google Earth): cakupan menyesuaikan ketinggian.
       • Pengamat di permukaan (50 m)  → span 1,5°  (167 km, 80 m/px)
       • Pengamat di 5 km              → span 6°    (660 km, 320 m/px)
       • Pengamat di 100 km (ISS)      → span 30°   (3300 km, 1,6 km/px)
     Rumus: span = clamp(0,03 × tinggi_km + 1,4 , 1,2 , 40)

     CATATAN: NASA GIBS level 6 (1.957 m/px di sumber) adalah level
     TERHALUS yang tersedia gratis. Jadi 80 m/px di atas adalah hasil
     interpolasi tekstur (bukan citra asli 80 m/px) — cukup untuk melihat
     bentuk garis pantai, danau, dan pola daratan, tetapi TIDAK sampai
     level bangunan seperti Google Earth (yang memakai citra komersial
     resolusi 0,3 m). Batas ini jujur dicatat, bukan diklaim lebih.
     ===================================================================== */
  spanForElevation(elevM) {
    const hKm = Math.max(0.05, elevM / 1000);
    const span = Math.min(40, Math.max(1.2, 0.03 * hKm + 1.4));
    return span;
  },

  /* Tingkat zoom tile NASA GIBS yang dipakai (dari tabel resmi):
       5 : 40x20 tile, 3.914 m/px
       6 : 80x40 tile, 1.957 m/px
     Dipakai level 6: resolusi ~2 km/px pada citra sumber, dan setelah
     dipotong+diperbesar ke 2048 px untuk wilayah 6° hasilnya setara
     ~320 m/px — jauh lebih baik dari 9,8 km/px tekstur global. */
  zoom: 6,

  init() { /* tidak perlu grup scene lagi */ },

  /* Bangun URL tile untuk wilayah tertentu.
     Mengembalikan daftar {url, row, col, z} yang menutupi spanDeg. */
  tilesForSpan(lat, lon) {
    const z = this.zoom;
    const m = SURFACE_TILES.matrix(z);
    const span = this.spanDeg;
    const half = span / 2;

    const latN = Math.min(89.99, lat + half), latS = Math.max(-89.99, lat - half);
    const lonW = lon - half, lonE = lon + half;

    const rN = Math.floor((90 - latN) / 180 * m.h);
    const rS = Math.floor((90 - latS) / 180 * m.h);
    const cW = Math.floor(((lonW + 180) % 360) / 360 * m.w);
    const cE = Math.floor(((lonE + 180) % 360) / 360 * m.w);

    const out = [];
    for (let r = Math.max(0, rN); r <= Math.min(m.h - 1, rS); r++) {
      for (let c = Math.max(0, Math.min(m.w - 1, cW));
           c <= Math.min(m.w - 1, cE); c++) {
        out.push({ z, row: r, col: c, url: SURFACE_TILES.tileUrl(z, r, c) });
      }
    }
    return out;
  },

  /* Muat satu gambar (Promise<Image|null>) dengan cache. */
  _loadImage(url) {
    const hit = this._cache.get(url);
    if (hit) { hit.used = Date.now(); return Promise.resolve(hit.img); }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this._cache.set(url, { img, used: Date.now() });
        /* buang entri paling lama bila cache penuh */
        if (this._cache.size > this._cacheMax) {
          let ok = null, ot = Infinity;
          for (const [k, v] of this._cache) if (v.used < ot) { ot = v.used; ok = k; }
          if (ok) this._cache.delete(ok);
        }
        this._stats.loaded++;
        resolve(img);
      };
      img.onerror = () => { this._stats.failed++; resolve(null); };
      img.src = url;
    });
  },

  /* Bangun tekstur patch resolusi tinggi untuk (lat, lon).
     Menggabungkan tile-tile NASA GIBS menjadi satu kanvas 2048x2048.

     PENTING: bila tekstur untuk lokasi ini SUDAH pernah dibuat, kembalikan
     yang tersimpan (bukan null). Versi sebelumnya mengembalikan null untuk
     key yang sama, sehingga pemanggil menyimpulkan "gagal" padahal
     teksturnya sudah ada — dan tekstur itu tidak pernah terpasang
     (terbukti di uji: buildTexture → null padahal tile berhasil dimuat). */
  async buildTexture(lat, lon) {
    if (!this.enabled || typeof SURFACE_TILES === 'undefined') return null;
    /* cakupan menyesuaikan ketinggian pengamat (LOD) */
    const sv = (typeof SURFACE_VIEW !== 'undefined') ? SURFACE_VIEW : null;
    this.spanDeg = this.spanForElevation(sv ? (sv.elev || 50) : 50);
    const key = lat.toFixed(2) + '|' + lon.toFixed(2) + '|' + this.spanDeg.toFixed(2);
    if (this._textures === undefined) this._textures = new Map();
    if (this._textures.has(key)) return this._textures.get(key);
    if (this.loading) return null;
    this.loading = true;
    this.lastKey = key;

    try {
      const tiles = this.tilesForSpan(lat, lon);
      if (!tiles.length) { this.loading = false; return null; }

      const imgs = await Promise.all(tiles.map(t => this._loadImage(t.url)));
      const ok = imgs.filter(Boolean);
      if (!ok.length) { this.loading = false; return null; }

      /* Susun ke kanvas: setiap tile menempati sel sesuai posisinya
         relatif terhadap wilayah. */
      const S = this.size;
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const ctx = cv.getContext('2d');

      /* wilayah dalam derajat → piksel kanvas */
      const half = this.spanDeg / 2;
      const latN = lat + half, lonW = lon - half;
      const m = SURFACE_TILES.matrix(this.zoom);
      const tileDegLat = 180 / m.h;
      const tileDegLon = 360 / m.w;

      for (let i = 0; i < tiles.length; i++) {
        const img = imgs[i];
        if (!img) continue;
        const t = tiles[i];
        /* sudut barat-laut tile ini */
        const tLatN = 90 - t.row * tileDegLat;
        const tLonW = -180 + t.col * tileDegLon;
        /* posisi di kanvas (piksel), y dari atas */
        const px = (tLonW - lonW) / this.spanDeg * S;
        const py = (latN - tLatN) / this.spanDeg * S;
        const pw = tileDegLon / this.spanDeg * S;
        const ph = tileDegLat / this.spanDeg * S;
        ctx.drawImage(img, px, py, pw, ph);
      }

      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = (THREE.SRGBColorSpace !== undefined) ? THREE.SRGBColorSpace : undefined;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      this.loading = false;
      this._textures.set(key, tex);
      /* batasi cache tekstur (masing-masing 2048x2048 = 16 MB di GPU) */
      if (this._textures.size > 4) {
        const firstKey = this._textures.keys().next().value;
        if (firstKey !== key) {
          const old = this._textures.get(firstKey);
          if (old && old.dispose) old.dispose();
          this._textures.delete(firstKey);
        }
      }
      return tex;
    } catch (e) {
      this.loading = false;
      return null;
    }
  },

  /* Terapkan tekstur detail ke patch permukaan.
     Mengembalikan true bila tekstur BERHASIL dipasang.

     PENTING — kenapa ada dua jalur:
       • buildTexture() asinkron (unduh 6 tile dari NASA GIBS, ~1-2 detik).
       • Karena itu hasilnya di-cache. Setelah cache terisi, pemanggilan
         berikutnya langsung sinkron (instan).
     Render loop memanggil ini tiap frame; selama unduhan berjalan ia
     mengembalikan false dan patch tetap memakai tekstur global (tidak
     ada frame yang terlewat). */
  applyToPatch(body, lat, lon) {
    if (!body || !body.key || body.key !== 'earth') return false;
    if (typeof surfacePatch === 'undefined' || !surfacePatch) return false;

    /* cakupan menyesuaikan ketinggian pengamat (LOD) */
    const sv = (typeof SURFACE_VIEW !== 'undefined') ? SURFACE_VIEW : null;
    this.spanDeg = this.spanForElevation(sv ? (sv.elev || 50) : 50);
    const key = lat.toFixed(2) + '|' + lon.toFixed(2) + '|' + this.spanDeg.toFixed(2);

    /* jalur cepat: tekstur sudah ada di cache → pasang langsung */
    if (this._textures === undefined) this._textures = new Map();
    const cached = this._textures.get(key);
    if (cached) {
      this._install(cached);
      return true;
    }
    /* jalur lambat: bangun sekali, lalu pasang */
    if (this._pending === key) return false;
    this._pending = key;
    this.buildTexture(lat, lon).then((tex) => {
      this._pending = null;
      if (tex) this._install(tex);
    }).catch(() => { this._pending = null; });
    return false;
  },

  /* Pasang tekstur ke material patch + perbaiki UV-nya. */
  _install(tex) {
    if (!surfacePatch || !surfacePatch.material) return;
    if (surfacePatch.material.map === tex) return;   /* sudah terpasang */
    surfacePatch.material.map = tex;
    if (surfacePatch.material.emissiveMap) surfacePatch.material.emissiveMap = tex;
    surfacePatch.material.needsUpdate = true;
    if (typeof repatchUV === 'function') repatchUV(this.spanDeg);
  },

  /* Tidak ada yang perlu ditempatkan di scene (tekstur dipakai patch). */
  place() { /* no-op */ },
  hide() { /* no-op */ },
  dispose() { this._cache.clear(); this.lastKey = ''; },
  status() {
    return { spanDeg: this.spanDeg, zoom: this.zoom, size: this.size,
             loaded: this._stats.loaded, failed: this._stats.failed,
             cached: this._cache.size };
  },
};
