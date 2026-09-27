/* =======================================================================
   SURFACE TILES — KLIEN TILE PERMUKAAN MULTI-SUMBER (RESMI NASA)
   -----------------------------------------------------------------------
   Menyediakan citra resolusi tinggi untuk patch permukaan POV, dari
   layanan RESMI & GRATIS:
     • Bumi   : NASA GIBS  (gibs.earthdata.nasa.gov) — 250 m/px
     • Mars   : NASA Trek  (trek.nasa.gov) — 232 m/px (Viking mosaic)
     • Bulan  : NASA Trek  (trek.nasa.gov) — LRO LOLA shaded relief
     • Io     : NASA Trek  (trek.nasa.gov) — Galileo/Voyager mosaic

   STRUKTUR TILE — DIAMBIL DARI WMTS Capabilities RESMI, BUKAN ASUMSI
   ------------------------------------------------------------------
   Versi pertama mengasumsikan pola pangkat dua (z0=1 tile, z1=2x1, …) dan
   hasilnya z1..z5 SEMUANYA HTTP 400. Struktur sebenarnya:
     GIBS 500m : 2x1, 3x2, 5x3, 10x5, 20x10, 40x20, 80x40, 160x80
     Trek      : 3x2, 5x3, 10x5, 20x10, 40x20, 80x40, 160x80, 320x160
   (Trek diverifikasi: z0..z7 HTTP 200, z8+ HTTP 404 — lihat probe_trek.py.)

   CATATAN JUJUR — kenapa hanya 4 benda langit:
   Layer tile global resmi gratis hanya tersedia untuk Bumi, Mars, Bulan,
   dan Io. Untuk Merkurius, Venus, Jupiter, Saturnus, Uranus, Neptunus,
   dan satelit lain, NASA Trek tidak menyediakan layer bertile pada
   endpoint publik — diuji 19 kandidat layer (tools/probe_trek.py), hanya
   4 yang tersedia. Permukaan mereka tetap bertekstur dari peta global
   yang sudah dimuat (2048x1024 / 4096x2048).

   KINERJA (target 60 fps)
   -----------------------
   • Batas keras maxTiles tile bersamaan; cache LRU.
   • Pemuatan asinkron — render tidak pernah terblokir.
   • Bila gagal (offline), patch tetap memakai tekstur global.
   ======================================================================= */

const SURFACE_TILES = {
  enabled: true,

  /* ---------------- definisi sumber per benda ---------------- */
  sources: {
    earth: {
      kind: 'gibs',
      baseUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best',
      layer: 'BlueMarble_ShadedRelief_Bathymetry',
      tms: '500m',
      ext: 'jpg',
      tileSize: 256,
      matrix: [
        { w: 2, h: 1 }, { w: 3, h: 2 }, { w: 5, h: 3 }, { w: 10, h: 5 },
        { w: 20, h: 10 }, { w: 40, h: 20 }, { w: 80, h: 40 }, { w: 160, h: 80 },
      ],
      maxZoom: 7,
      sourceMPerPx: 250,
    },
    mars: {
      kind: 'trek', body: 'Mars',
      layer: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
      tms: 'default028mm', ext: 'jpg', tileSize: 256,
      /* =====================================================================
         TABEL DIMENSI TILE NASA TREK — DARI UJI EMPIRIS
         ---------------------------------------------------------------------
         WMTS Capabilities resmi hanya mendeklarasikan 2 level (3x2, 5x3),
         tetapi level lebih tinggi tetap dapat diakses. Dimensi sebenarnya
         diuji satu per satu dengan curl (tools/probe_trek.py):

             level 0 :   3 x  2      level 4 :  20 x 10
             level 1 :   5 x  3      level 5 :  40 x 20   ← terverifikasi
             level 2 :  10 x  5      level 6 :  80 x 40
             level 3 :  20 x 10      level 7 : 160 x 80

         PENTING: versi sebelumnya menggeser tabel ini satu langkah
         (matrix[5] = 80x40) sehingga kolom 69 dianggap sah padahal maksimum
         39 → HTTP 404 untuk semua tile. Sekarang tabelnya tepat.
         ===================================================================== */
      matrix: [
        { w: 3, h: 2 }, { w: 5, h: 3 }, { w: 10, h: 5 }, { w: 20, h: 10 },
        { w: 20, h: 10 }, { w: 40, h: 20 }, { w: 80, h: 40 }, { w: 160, h: 80 },
      ],
      maxZoom: 7,
      sourceMPerPx: 232,
      /* level yang dipakai untuk memuat tile (terverifikasi ada) */
      useZoom: 5,
    },
    moon: {
      kind: 'trek', body: 'Moon',
      layer: 'LRO_LOLA_ClrShade_Global_128ppd_v04',
      tms: 'default028mm', ext: 'png', tileSize: 256,
      matrix: [
        { w: 3, h: 2 }, { w: 5, h: 3 }, { w: 10, h: 5 }, { w: 20, h: 10 },
        { w: 40, h: 20 }, { w: 80, h: 40 }, { w: 160, h: 80 }, { w: 320, h: 160 },
      ],
      maxZoom: 7,
      sourceMPerPx: 237,
    },
    io: {
      kind: 'trek', body: 'Io',
      layer: 'Io_GalileoSSI_Voyager_Global_Mosaic_1km',
      tms: 'default028mm', ext: 'png', tileSize: 256,
      matrix: [
        { w: 3, h: 2 }, { w: 5, h: 3 }, { w: 10, h: 5 }, { w: 20, h: 10 },
        { w: 40, h: 20 }, { w: 80, h: 40 }, { w: 160, h: 80 }, { w: 320, h: 160 },
      ],
      maxZoom: 6,
      sourceMPerPx: 1000,
    },
  },

  maxTiles: 20,          /* cukup untuk grid 4x4 + margin (jaga 60 fps) */
  cacheSize: 80,
  _cache: new Map(),
  _loading: 0,
  _stats: { loaded: 0, failed: 0 },

  /* ---------------- utilitas ---------------- */

  /* Kunci sumber untuk sebuah body (Bulan Bumi → 'moon'). */
  sourceKeyFor(body) {
    if (!body) return null;
    if (body.key === 'earth') return 'earth';
    if (body.name === 'Bulan') return 'moon';
    if (body.key === 'mars') return 'mars';
    if (body.name === 'Io') return 'io';
    return null;
  },

  src(key) { return this.sources[key] || null; },

  matrix(key, z) {
    const s = this.src(key);
    if (!s) return null;
    const i = Math.max(0, Math.min(s.maxZoom, z));
    return s.matrix[i] || s.matrix[s.matrix.length - 1];
  },

  maxZoomOf(key) { const s = this.src(key); return s ? s.maxZoom : 0; },

  /* Resolusi efektif (meter/piksel) pada level z. */
  metersPerPixel(key, z) {
    const s = this.src(key);
    const m = this.matrix(key, z);
    if (!s || !m) return Infinity;
    const pxWorld = m.w * s.tileSize;
    return 40075017 / pxWorld;
  },

  /* Level zoom paling dekat dengan resolusi yang diinginkan. */
  bestZoomFor(key, mPerPxWanted) {
    let best = 0, bestErr = Infinity;
    for (let z = 0; z <= this.maxZoomOf(key); z++) {
      const m = this.metersPerPixel(key, z);
      const err = Math.abs(Math.log(m / Math.max(1, mPerPxWanted)));
      if (err < bestErr) { bestErr = err; best = z; }
    }
    return best;
  },

  /* URL satu tile. */
  tileUrl(key, z, row, col) {
    const s = this.src(key);
    if (!s) return null;
    if (s.kind === 'gibs') {
      return s.baseUrl + '/' + s.layer + '/default/' + s.tms + '/' +
             z + '/' + row + '/' + col + '.' + s.ext;
    }
    return 'https://trek.nasa.gov/tiles/' + s.body + '/EQ/' + s.layer +
           '/1.0.0/default/' + s.tms + '/' + z + '/' + row + '/' + col + '.' + s.ext;
  },

  /* Tile mana yang mencakup (lat, lon) pada level z? */
  tileFor(key, lat, lon, z) {
    const m = this.matrix(key, z);
    if (!m) return null;
    /* =====================================================================
       NORMALISASI KOORDINAT — BUG YANG DIPERBAIKI
       ---------------------------------------------------------------------
       Data resmi IAU/USGS sering memakai bujur 0..360 (mis. Olympus Mons
       di 226,2° B ditulis -226,2). Tanpa normalisasi, rumus kolom
       menghasilkan angka negatif → di-clamp ke 0 → tile yang dimuat
       adalah tile di tepi barat dunia, bukan lokasi pengamat.
       Terbukti: 6 tile Mars GAGAL dimuat padahal URL-nya valid.
       ===================================================================== */
    const latN = Math.max(-89.99, Math.min(89.99, lat));
    const lonN = ((lon + 180) % 360 + 360) % 360 - 180;
    const row = Math.floor((90 - latN) / 180 * m.h);
    const col = Math.floor((lonN + 180) / 360 * m.w);
    return {
      row: Math.max(0, Math.min(m.h - 1, row)),
      col: Math.max(0, Math.min(m.w - 1, col)),
      rows: m.h, cols: m.w,
    };
  },

  /* Daftar tile di sekitar (lat, lon) — maksimum maxTiles. */
  tilesAround(key, lat, lon, z, radius) {
    const t = this.tileFor(key, lat, lon, z);
    if (!t) return [];
    const r = radius || 1;
    const out = [];
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        const row = t.row + dr, col = t.col + dc;
        if (row < 0 || row >= t.rows) continue;
        const cc = ((col % t.cols) + t.cols) % t.cols;   /* bujur melingkar */
        out.push({ z, row, col: cc, key: z + '/' + row + '/' + cc });
        if (out.length >= this.maxTiles) return out;
      }
    }
    return out;
  },

  /* Muat satu tile (asinkron, dengan cache). */
  loadTile(key, z, row, col) {
    const ck = key + '|' + z + '/' + row + '/' + col;
    const hit = this._cache.get(ck);
    if (hit) { hit.used = Date.now(); return Promise.resolve(hit.tex); }
    if (this._loading >= this.maxTiles) return Promise.resolve(null);

    const url = this.tileUrl(key, z, row, col);
    if (!url) return Promise.resolve(null);
    this._loading++;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this._loading--;
        const tex = new THREE.Texture(img);
        tex.needsUpdate = true;
        if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        this._put(ck, { tex, used: Date.now() });
        this._stats.loaded++;
        resolve(tex);
      };
      img.onerror = () => { this._loading--; this._stats.failed++; resolve(null); };
      img.src = url;
    });
  },

  _put(k, v) {
    this._cache.set(k, v);
    if (this._cache.size > this.cacheSize) {
      let ok = null, ot = Infinity;
      for (const [kk, vv] of this._cache) if (vv.used < ot) { ot = vv.used; ok = kk; }
      if (ok) {
        const vv = this._cache.get(ok);
        if (vv && vv.tex) vv.tex.dispose();
        this._cache.delete(ok);
      }
    }
  },

  clear() {
    for (const [, v] of this._cache) if (v.tex) v.tex.dispose();
    this._cache.clear();
    this._stats = { loaded: 0, failed: 0 };
  },

  status() {
    return {
      loaded: this._stats.loaded, failed: this._stats.failed,
      cached: this._cache.size, loading: this._loading,
    };
  },

  /* Uji mandiri: daftar URL untuk benda tertentu (untuk verifikasi manual). */
  selfTest(bodyKey, lat, lon) {
    const key = this.sourceKeyFor({ key: bodyKey, name: bodyKey });
    if (!key) return { error: 'tidak ada sumber tile untuk ' + bodyKey };
    const out = [];
    for (let z = 0; z <= this.maxZoomOf(key); z++) {
      const t = this.tileFor(key, lat, lon, z);
      out.push({
        zoom: z,
        mPerPx: Math.round(this.metersPerPixel(key, z)),
        tiles: t.cols + 'x' + t.rows,
        tile: t.row + '/' + t.col,
        url: this.tileUrl(key, z, t.row, t.col),
      });
    }
    return { source: key, levels: out };
  },
};
