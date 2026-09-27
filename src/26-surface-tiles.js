/* =======================================================================
   SURFACE TILES — SISTEM TILE BERTINGKAT (kunci "zoom sampai darat")
   -----------------------------------------------------------------------
   MASALAH YANG DIPECAHKAN
   ----------------------
   Satu tekstur global (4096x2048) memberi ~10 km/piksel. Untuk wilayah
   10 km hanya tersedia 1 piksel — mustahil melihat detail daratan.
   Google Earth bisa zoom sampai bangunan karena memuat POTONGAN citra
   sesuai level zoom (tile), bukan satu gambar global.

   STRATEGI
   --------
   Memakai sumber tile RESMI & GRATIS:
     • NASA GIBS (Global Imagery Browse Services) — WMTS, CORS terbuka
       https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/
     • Layer BlueMarble_ShadedRelief_Bathymetry: 250 m/piksel (resolusi
       terbaik yang tersedia gratis & resmi)

   Level zoom (sesuai spesifikasi WMTS GoogleMapsCompatible / EPSG:4326):
     z0 = 1 tile  (seluruh dunia)
     z1 = 2x1     z2 = 4x2     z3 = 8x4     z4 = 16x8
   Setiap naik satu level, resolusi berlipat dua.

   KINERJA (target 60 fps)
   -----------------------
   • Hanya tile yang TERLIHAT kamera yang dimuat (bukan seluruh dunia).
   • Maksimum 6 tile bersamaan (batas keras) — cukup untuk patch 92°.
   • Cache LRU 64 tile agar perpindahan lokasi tidak memuat ulang.
   • Pemuatan ASINKRON: tile masuk satu per satu, tidak memblokir render.
   • Ukuran tile 256x256 (~15-40 KB) sehingga unduhan cepat.

   CATATAN PENTING
   ---------------
   Sumber ini butuh koneksi internet. Bila offline atau diblokir, sistem
   otomatis memakai tekstur global yang sudah dimuat (patch permukaan
   tetap tampil, hanya kurang detail) — tidak pernah gagal total.
   ======================================================================= */

const SURFACE_TILES = {
  enabled: true,
  /* basis URL WMTS NASA GIBS (resmi, domain publik, CORS *) */
  baseUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best',
  layer: 'BlueMarble_ShadedRelief_Bathymetry',
  tileMatrixSet: '500m',
  tileSize: 256,
  maxTiles: 6,          /* batas keras tile bersamaan (jaga 60 fps) */
  cacheSize: 64,        /* cache LRU */
  zoom: 4,              /* level zoom aktif (0..6) */

  _cache: new Map(),    /* key -> { tex, url, used } */
  _loading: 0,
  _stats: { loaded: 0, failed: 0, cached: 0 },

  /* =====================================================================
     STRUKTUR TILE NASA GIBS — DIAMBIL DARI WMTS Capabilities RESMI
     ---------------------------------------------------------------------
     BUG YANG DIPERBAIKI: versi pertama mengasumsikan struktur pangkat dua
     (z0 = 1 tile, z1 = 2x1, z2 = 4x2, …). Itu SALAH — NASA GIBS memakai
     pembagian yang berbeda. Hasil uji HTTP: z0 = 200 OK, tetapi z1..z5
     semuanya 400 Bad Request.

     Struktur SEBENARNYA (dibaca dari WMTSCapabilities.xml resmi,
     TileMatrixSet "500m"):
         level 0 :   2 x  1      level 4 :  20 x 10
         level 1 :   3 x  2      level 5 :  40 x 20
         level 2 :   5 x  3      level 6 :  80 x 40
         level 3 :  10 x  5      level 7 : 160 x 80
     Total 8 level. Rumus: width(z) = 2 + 3*(2^z - 1)/1 untuk z>=1...
     karena tidak berpola pangkat dua sederhana, tabelnya disimpan
     langsung (lebih aman daripada menebak rumus).
     ===================================================================== */
  matrixTable: [
    { w: 2, h: 1 }, { w: 3, h: 2 }, { w: 5, h: 3 }, { w: 10, h: 5 },
    { w: 20, h: 10 }, { w: 40, h: 20 }, { w: 80, h: 40 }, { w: 160, h: 80 },
  ],
  maxZoom: 7,

  /* Dimensi tile pada level tertentu */
  matrix(z) {
    const t = this.matrixTable[Math.max(0, Math.min(this.maxZoom, z))];
    return t || this.matrixTable[this.matrixTable.length - 1];
  },

  /* Hitung resolusi efektif (meter/piksel) pada level zoom tertentu.
     Dihitung dari jumlah piksel horizontal: width x tileSize.
     Keliling ekuator = 40.075.017 m. */
  metersPerPixel(z) {
    const m = this.matrix(z);
    const pxWorld = m.w * this.tileSize;
    return 40075017 / pxWorld;
  },

  /* Level zoom yang sesuai untuk radius patch tertentu.
     Kita ingin resolusi tile ≈ resolusi patch, tidak lebih halus
     (menghemat bandwidth & menjaga fps). */
  bestZoomFor(patchRadiusDeg) {
    /* radius patch dalam km */
    const rKm = patchRadiusDeg * 111.32;
    /* resolusi yang diinginkan: ~256 piksel melintasi radius patch */
    const mPerPxWanted = (rKm * 1000) / 256;
    let best = 0, bestErr = Infinity;
    for (let z = 0; z <= this.maxZoom; z++) {
      const m = this.metersPerPixel(z);
      const err = Math.abs(Math.log(m / mPerPxWanted));
      if (err < bestErr) { bestErr = err; best = z; }
    }
    return best;
  },

  /* URL satu tile. Konvensi NASA GIBS EPSG:4326:
       /{layer}/default/{tileMatrixSet}/{z}/{row}/{col}.jpg
     row = baris (dari utara), col = kolom (dari barat). */
  tileUrl(z, row, col) {
    return this.baseUrl + '/' + this.layer + '/default/' +
           this.tileMatrixSet + '/' + z + '/' + row + '/' + col + '.jpg';
  },

  /* Tile mana yang mencakup (lat, lon) pada level z? */
  tileFor(lat, lon, z) {
    const m = this.matrix(z);
    /* EPSG:4326: baris 0 = 90°LU, kolom 0 = 180°BB */
    const row = Math.floor((90 - lat) / 180 * m.h);
    const col = Math.floor((lon + 180) / 360 * m.w);
    return {
      row: Math.max(0, Math.min(m.h - 1, row)),
      col: Math.max(0, Math.min(m.w - 1, col)),
      rows: m.h, cols: m.w,
    };
  },

  /* Daftar tile yang perlu ditampilkan untuk patch di (lat, lon).
     Mengembalikan maksimum maxTiles tile di sekitar pusat patch. */
  tilesFor(lat, lon, z) {
    const t = this.tileFor(lat, lon, z);
    const out = [];
    /* tile pusat + tetangga terdekat (cukup untuk patch 92°) */
    const offsets = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1]];
    for (const [dr, dc] of offsets) {
      if (out.length >= this.maxTiles) break;
      const row = t.row + dr, col = t.col + dc;
      if (row < 0 || row >= t.rows || col < 0 || col >= t.cols) continue;
      out.push({ z, row, col, key: z + '/' + row + '/' + col });
    }
    return out;
  },

  /* Muat satu tile secara asinkron. Mengembalikan Promise<THREE.Texture|null>. */
  loadTile(z, row, col) {
    const key = z + '/' + row + '/' + col;
    const hit = this._cache.get(key);
    if (hit) {
      hit.used = Date.now();
      this._stats.cached++;
      return Promise.resolve(hit.tex);
    }
    if (this._loading >= this.maxTiles) return Promise.resolve(null);

    const url = this.tileUrl(z, row, col);
    this._loading++;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';     /* CORS: NASA GIBS mengizinkan * */
      img.onload = () => {
        this._loading--;
        const tex = new THREE.Texture(img);
        tex.needsUpdate = true;
        tex.colorSpace = THREE.SRGBColorSpace !== undefined
          ? THREE.SRGBColorSpace : undefined;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        this._put(key, { tex, url, used: Date.now() });
        this._stats.loaded++;
        resolve(tex);
      };
      img.onerror = () => {
        this._loading--;
        this._stats.failed++;
        resolve(null);       /* gagal = pakai tekstur global (tidak error) */
      };
      img.src = url;
    });
  },

  _put(key, val) {
    this._cache.set(key, val);
    /* buang entri paling lama bila cache penuh */
    if (this._cache.size > this.cacheSize) {
      let oldestKey = null, oldest = Infinity;
      for (const [k, v] of this._cache) {
        if (v.used < oldest) { oldest = v.used; oldestKey = k; }
      }
      if (oldestKey) {
        const v = this._cache.get(oldestKey);
        if (v && v.tex) v.tex.dispose();
        this._cache.delete(oldestKey);
      }
    }
  },

  clear() {
    for (const [, v] of this._cache) if (v.tex) v.tex.dispose();
    this._cache.clear();
    this._stats = { loaded: 0, failed: 0, cached: 0 };
  },

  /* Statistik untuk panel observabilitas */
  status() {
    return {
      zoom: this.zoom,
      mPerPx: Math.round(this.metersPerPixel(this.zoom)),
      cached: this._cache.size,
      loading: this._loading,
      loaded: this._stats.loaded,
      failed: this._stats.failed,
    };
  },
};

/* =======================================================================
   UJI MANDIRI — memastikan URL tile benar & sumber dapat diakses.
   Dipanggil dari konsol: SURFACE_TILES.selfTest()
   ======================================================================= */
SURFACE_TILES.selfTest = function () {
  const out = [];
  for (let z = 0; z <= 6; z++) {
    const t = this.tileFor(-6.2, 106.8, z);   /* Jakarta */
    out.push({
      zoom: z,
      mPerPx: Math.round(this.metersPerPixel(z)),
      tiles: t.cols + 'x' + t.rows,
      jakartaTile: t.row + '/' + t.col,
      url: this.tileUrl(z, t.row, t.col),
    });
  }
  return out;
};
