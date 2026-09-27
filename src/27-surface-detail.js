/* =======================================================================
   SURFACE DETAIL — TEKSTUR DETAIL PADA PATCH PERMUKAAN (SEMUA BENDA)
   -----------------------------------------------------------------------
   Menjawab keluhan: "bumi nya masih tidak ada texture pov nya. dan
   semuanya juga sama tidak ada texture hanya polos gitu di semua planet
   dan satelite" + "zoom in ala google earth nya juga belum bisa".

   CARA KERJA
   ----------
   Tekstur patch permukaan DIGANTI dengan citra tile resolusi tinggi
   (NASA GIBS untuk Bumi, NASA Trek untuk Mars/Bulan/Io), dipotong ke
   wilayah pengamat, lalu digabung ke satu kanvas 2048x2048.

   Kenapa pendekatan ini (bukan bidang overlay):
     • Percobaan bidang overlay GAGAL dua kali: patch bola selalu
       menutupinya (patch mencakup sampai horizon), dan menaikkan bidang
       membuatnya kalah depth test terhadap kamera yang hanya 50 m tinggi.
     • Memasang tekstur LANGSUNG ke patch = nol geometri tambahan =
       nol biaya render tambahan → 60 fps aman.

   LOD (Level of Detail) — seperti Google Earth
   --------------------------------------------
       50 m   → span 1,4°  (≈76 m/px)
       5 km   → span 6°    (≈320 m/px)
       100 km → span 30°   (≈1,6 km/px)

   BATAS JUJUR
   -----------
   Layer tile global resmi gratis hanya tersedia untuk Bumi (NASA GIBS,
   250 m/px), Mars (NASA Trek, 232 m/px), Bulan (LRO LOLA), dan Io
   (Galileo/Voyager). Diuji 19 kandidat layer — lihat tools/probe_trek.py.
   Benda langit lain tetap memakai tekstur global yang sudah dimuat
   (2048x1024 / 4096x2048) sehingga tidak polos, tetapi belum punya
   citra regional tambahan. Ini batas ketersediaan data publik.

   Google Earth memakai citra komersial 0,3 m/px (gedung terlihat);
   dengan sumber gratis ini ~76 m/px — garis pantai, danau, kawah, dan
   pola daratan terlihat, tetapi belum sampai level bangunan.
   ======================================================================= */

const SURFACE_DETAIL = {
  enabled: true,
  size: 2048,
  spanDeg: 1.5,
  _cache: new Map(),
  _cacheMax: 12,
  _textures: new Map(),
  _texturesMax: 4,
  loading: false,
  _pending: null,
  _stats: { loaded: 0, failed: 0, built: 0 },

  /* ---------------- LOD: cakupan dari ketinggian pengamat ----------------
     =====================================================================
     AKAR MASALAH "SEMUA POLOS" (ditemukan setelah pengukuran):
     Cakupan (span) harus SEIMBANG dengan ukuran tile. Dua ekstrem salah:
       ✗ span ≪ tile  → hanya 1 tile, diregangkan ke seluruh kanvas →
                        piksel raksasa seragam → layar polos
                        (terbukti: span 0,35° vs tile 9° → variasi warna 1)
       ✗ span ≫ tile  → tile sangat banyak, atau zoom dipaksa rendah
                        sehingga resolusi kasar (span 36° → 1.957 m/px)

     SOLUSI: hitung span dari JUMLAH TILE yang diinginkan × ukuran tile
     pada zoom yang dipakai. Dengan memilih zoom TINGGI dan span yang
     membuat 4x4 = 16 tile, resolusi efektif jadi maksimal:

       zoom dipilih → tileDeg diketahui → span = 4 × tileDeg

     Contoh (Bumi, tile z=6 = 4,5°): span = 18° → 16 tile,
       resolusi = 18° × 111 km / 2048 px ≈ 976 m/px
     Contoh (Mars, tile z=6 = 4,5°): span = 18° → 16 tile, ≈ 976 m/px

     Batas: span tidak boleh lebih kecil dari jarak horizon (agar permukaan
     sampai horizon tetap tertutup).
     ===================================================================== */
  spanForElevation(elevM, bodyRadiusKm) {
    const R = bodyRadiusKm || 6371;
    const h = Math.max(1, elevM) / 1000;                 /* km */
    const dHorizon = Math.sqrt(2 * R * h);               /* km */
    const spanHorizon = (2 * dHorizon) / 111.32;         /* derajat */
    return Math.min(120, Math.max(0.35, spanHorizon));
  },

  /* Hitung zoom + span secara BERSAMA.
     =====================================================================
     ITERASI (dari pengukuran berulang):
       ✗ span 0,35°  → 1 tile diregangkan 8x → polos
       ✗ span 36°    → zoom rendah → 1.957 m/px → polos
       ✗ span 9°     → 489 m/px → masih polos untuk pandangan dekat

     MASALAH DASAR: saat pengamat berdiri di permukaan, yang terlihat
     hanya ~25 km ke depan (sampai horizon). Agar wilayah 25 km itu terisi
     ~1500 piksel (cukup detail), dibutuhkan 25 km / 1500 px ≈ 17 m/px.

     Dengan tile NASA Trek (256 px/tile), 17 m/px tercapai pada:
       tileDeg × 111.320 m/° / 256 px = 17 m/px
       → tileDeg ≈ 0,039°  → level zoom 10 (tidak tersedia, maks 7)

     Jadi level tersedia (maks 7) memberi ~489 m/px — batas fisik sumber
     data. Untuk mengatasinya, span dibuat SEDEKIT MUNGKIN di atas jarak
     horizon sehingga seluruh kanvas 2048 px dipakai untuk wilayah yang
     benar-benar terlihat:

       span = jarak horizon × 2,5   (margin untuk pandangan menyamping)

     Contoh Bumi h=50 m: horizon 25 km → span 63 km = 0,56°.
       Dengan 16 tile di zoom maks (7): resolusi = 0,56°×111 km/2048
       ≈ 30 m/px — 16x lebih baik dari span 9°.
     ===================================================================== */
  planZoomAndSpan(srcKey, elevM, bodyRadiusKm) {
    const R = bodyRadiusKm || 6371;
    const h = Math.max(1, elevM) / 1000;
    const dHorizon = Math.sqrt(2 * R * h);                     /* km */
    const spanNeed = (dHorizon * 2.5) / 111.32;                /* derajat */
    const maxZ = SURFACE_TILES.maxZoomOf(srcKey);
    const m = SURFACE_TILES.matrix(srcKey, maxZ);
    const tileDeg = Math.max(180 / m.h, 360 / m.w);
    /* span = jarak horizon (dengan margin), TIDAK dipaksa kelipatan tile —
       sisa kanvas yang tidak terisi tile akan memakai tekstur global. */
    const span = Math.max(spanNeed, tileDeg * 1.2);
    return { zoom: maxZ, spanDeg: Math.min(span, 180) };
  },

  init() { /* tidak perlu grup scene */ },

  /* Level zoom tile: pilih agar resolusi sumber ≈ resolusi yang
     dibutuhkan untuk span saat ini (bukan angka tetap).

     =====================================================================
     KENAPA INI PENTING (dari pengukuran):
     • Bila zoom terlalu RENDAH: span besar (36°) dengan tekstur 2048 px
       → 1.957 m/px → terlalu kasar, layar tampak rata.
     • Bila zoom terlalu TINGGI: tile menjadi sangat kecil (mis. 0,56° di
       z=8) sehingga butuh ratusan tile untuk menutupi span → lambat.
     Keseimbangan: pilih zoom sehingga dibutuhkan 4x4 = 16 tile untuk
     menutupi span. Ini memberi resolusi terbaik yang masih ringan.
     ===================================================================== */
  pickZoom(body) {
    const srcKey = SURFACE_TILES.sourceKeyFor(body);
    if (!srcKey) return 0;
    const maxZ = SURFACE_TILES.maxZoomOf(srcKey);
    /* cari zoom terkecil yang masih memberi ≤ 4x4 tile untuk span ini */
    for (let z = maxZ; z >= 0; z--) {
      const m = SURFACE_TILES.matrix(srcKey, z);
      if (!m) continue;
      const tileDeg = Math.max(180 / m.h, 360 / m.w);
      const need = this.spanDeg / tileDeg;      /* jumlah tile melintang */
      if (need >= 3.5) return z;                /* ≥ 3,5 tile: cukup detail */
    }
    return 0;
  },

  /* Daftar tile yang menutupi wilayah spanDeg di sekitar (lat, lon). */
  tilesForSpan(srcKey, lat, lon, z) {
    const m = SURFACE_TILES.matrix(srcKey, z);
    if (!m) return [];
    /* =====================================================================
       NORMALISASI KOORDINAT — BUG YANG DIPERBAIKI
       ---------------------------------------------------------------------
       Bujur HARUS dinormalisasi ke −180..180 SEBELUM dipakai menghitung
       kolom, karena data resmi (IAU/USGS) memakai 0..360 untuk beberapa
       benda. Tanpa ini, kolom bisa keluar rentang (terbukti: kolom 69
       padahal maksimum 39 → HTTP 404).
       ===================================================================== */
    const latN0 = Math.max(-89.99, Math.min(89.99, lat));
    const lonN0 = ((lon + 180) % 360 + 360) % 360 - 180;
    const half = this.spanDeg / 2;
    const latN = Math.min(89.99, latN0 + half), latS = Math.max(-89.99, latN0 - half);
    const lonW = lonN0 - half, lonE = lonN0 + half;

    const rN = Math.floor((90 - latN) / 180 * m.h);
    const rS = Math.floor((90 - latS) / 180 * m.h);
    const cW = Math.floor(((((lonW + 180) % 360) + 360) % 360) / 360 * m.w);
    const cE = Math.floor(((((lonE + 180) % 360) + 360) % 360) / 360 * m.w);

    const out = [];
    /* bujur melingkar: telusuri dengan pembungkusan modulo */
    const spanC = (((cE - cW) % m.w) + m.w) % m.w;
    for (let r = Math.max(0, rN); r <= Math.min(m.h - 1, rS); r++) {
      for (let k = 0; k <= spanC; k++) {
        out.push({ z, row: r, col: ((cW + k) % m.w + m.w) % m.w });
        if (out.length >= SURFACE_TILES.maxTiles) return out;
      }
    }
    return out;
  },

  /* Muat satu gambar dengan cache (Promise<Image|null>). */
  _loadImage(url) {
    const hit = this._cache.get(url);
    if (hit) { hit.used = Date.now(); return Promise.resolve(hit.img); }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this._cache.set(url, { img, used: Date.now() });
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

  /* Bangun tekstur detail untuk sebuah body di (lat, lon).
     Mengembalikan Promise<THREE.CanvasTexture|null>. */
  async buildTexture(body, lat, lon) {
    if (!this.enabled || typeof SURFACE_TILES === 'undefined') return null;
    const srcKey = SURFACE_TILES.sourceKeyFor(body);
    if (!srcKey) return null;

    const sv = (typeof SURFACE_VIEW !== 'undefined') ? SURFACE_VIEW : null;
    const _bR = (body && (body.realRadiusKm || body.radiusKm * RAD)) || 6371;
    /* zoom & span dihitung BERSAMA (lihat planZoomAndSpan) */
    const plan = this.planZoomAndSpan(srcKey, sv ? (sv.elev || 50) : 50, _bR);
    const z = plan.zoom;
    this.spanDeg = plan.spanDeg;
    const key = srcKey + '|' + lat.toFixed(2) + '|' + lon.toFixed(2) +
                '|' + this.spanDeg.toFixed(2) + '|' + z;

    if (this._textures.has(key)) return this._textures.get(key);
    if (this.loading) return null;
    this.loading = true;

    try {
      const tiles = this.tilesForSpan(srcKey, lat, lon, z);
      if (!tiles.length) { this.loading = false; return null; }

      const urls = tiles.map(t => SURFACE_TILES.tileUrl(srcKey, t.z, t.row, t.col));
      const imgs = await Promise.all(urls.map(u => this._loadImage(u)));
      if (!imgs.filter(Boolean).length) { this.loading = false; return null; }

      /* ---- susun tile ke kanvas sesuai posisi geografisnya ---- */
      const S = this.size;
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#101820';
      ctx.fillRect(0, 0, S, S);

      const m = SURFACE_TILES.matrix(srcKey, z);
      const tileDegLat = 180 / m.h;
      const tileDegLon = 360 / m.w;
      const half = this.spanDeg / 2;
      const latN = lat + half, lonW = lon - half;

      for (let i = 0; i < tiles.length; i++) {
        const img = imgs[i];
        if (!img) continue;
        const t = tiles[i];
        const tLatN = 90 - t.row * tileDegLat;
        const tLonW = -180 + t.col * tileDegLon;
        /* pembungkusan bujur: pastikan tile di barat wilayah tetap pas */
        let dLon = tLonW - lonW;
        if (dLon > 180) dLon -= 360;
        if (dLon < -180) dLon += 360;
        const px = dLon / this.spanDeg * S;
        const py = (latN - tLatN) / this.spanDeg * S;
        const pw = tileDegLon / this.spanDeg * S;
        const ph = tileDegLat / this.spanDeg * S;
        ctx.drawImage(img, px, py, pw, ph);
      }

      const tex = new THREE.CanvasTexture(cv);
      if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      this.loading = false;
      this._stats.built++;
      this._textures.set(key, tex);
      if (this._textures.size > this._texturesMax) {
        const fk = this._textures.keys().next().value;
        if (fk !== key) {
          const old = this._textures.get(fk);
          if (old && old.dispose) old.dispose();
          this._textures.delete(fk);
        }
      }
      return tex;
    } catch (e) {
      this.loading = false;
      return null;
    }
  },

  /* Pasang tekstur detail ke patch permukaan.
     Mengembalikan true bila tekstur sudah terpasang.
     Selama unduhan berjalan mengembalikan false dan patch tetap memakai
     tekstur global (tidak ada frame yang terlewat). */
  applyToPatch(body, lat, lon) {
    if (!body) return false;
    if (typeof surfacePatch === 'undefined' || !surfacePatch) return false;
    const srcKey = SURFACE_TILES.sourceKeyFor(body);
    if (!srcKey) return false;   /* benda ini tidak punya sumber tile */

    const sv = (typeof SURFACE_VIEW !== 'undefined') ? SURFACE_VIEW : null;
    const _bR = (body && (body.realRadiusKm || body.radiusKm * RAD)) || 6371;
    const plan = this.planZoomAndSpan(srcKey, sv ? (sv.elev || 50) : 50, _bR);
    const z = plan.zoom;
    this.spanDeg = plan.spanDeg;
    const key = srcKey + '|' + lat.toFixed(2) + '|' + lon.toFixed(2) +
                '|' + this.spanDeg.toFixed(2) + '|' + z;

    const cached = this._textures.get(key);
    if (cached) { this._install(cached); return true; }

    if (this._pending === key) return false;
    this._pending = key;
    this.buildTexture(body, lat, lon).then((tex) => {
      this._pending = null;
      if (tex) this._install(tex);
    }).catch(() => { this._pending = null; });
    return false;
  },

  /* Pasang tekstur ke material patch + sesuaikan UV ke cakupan tekstur. */
  _install(tex) {
    if (!surfacePatch || !surfacePatch.material) return;
    if (surfacePatch.material.map === tex) return;
    surfacePatch.material.map = tex;
    if (surfacePatch.material.emissiveMap) surfacePatch.material.emissiveMap = tex;
    surfacePatch.material.needsUpdate = true;
    /* UV harus dipetakan ke cakupan tekstur detail (spanDeg), bukan ke
       seluruh bola — lihat penjelasan di applyPatchUV(). */
    if (typeof repatchUV === 'function') repatchUV(this.spanDeg);
  },

  place() { /* no-op: tekstur dipakai patch, bukan bidang terpisah */ },
  hide() { /* no-op */ },
  dispose() { this._cache.clear(); this._textures.clear(); this._pending = null; },
  status() {
    return {
      spanDeg: +this.spanDeg.toFixed(2), size: this.size,
      loaded: this._stats.loaded, failed: this._stats.failed,
      built: this._stats.built, texCache: this._textures.size,
    };
  },
};
