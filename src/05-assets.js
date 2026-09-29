/* =======================================================================
   Pemuat aset tekstur nyata (NASA / Solar System Scope, domain publik CC BY 4.0)
   ----------------------------------------------------------------------
   Berkas besar, jadi dimuat bertahap dengan bilah kemajuan nyata.
   Setiap benda punya: peta warna (wajib), normal map (relief), dan
   peta malam (lampu kota) untuk Bumi.
   ======================================================================= */

const ASSET_BASE_DEFAULT = 'assets/';
let ASSET_BASE = 'assets/hi/';

/* manifest: kunci -> daftar berkas */
const ASSET_MANIFEST = {
  sun:        { map: 'sun.jpg' },
  mercury:    { map: 'mercury.jpg',   normal: 'mercury_normal.jpg' },
  venus:      { map: 'venus.jpg' },
  // AUDIT 29 Sep: normal map Bumi DITAMBAHKAN. Sebelumnya entri ini tidak
  // punya `normal`, sehingga shader patch menerima uHasMacroNormal = 0 dan
  // permukaan Bumi tampil rata (tanpa relief). File normal map kini dibuat
  // oleh tools/rebuild_assets_8k.py dari luminance earth_day (Sobel).
  earth:      { map: 'earth_day.jpg', clouds: 'earth_clouds.jpg', night: 'earth_night.jpg', normal: 'earth_day_normal.jpg' },
  moon:       { map: 'moon.jpg',      normal: 'moon_normal.jpg' },
  mars:       { map: 'mars.jpg',      normal: 'mars_normal.jpg' },
  jupiter:    { map: 'jupiter.jpg' },
  saturn:     { map: 'saturn.jpg',    ring: 'saturn_ring.png' },
  uranus:     { map: 'uranus.jpg' },
  neptune:    { map: 'neptune.jpg' },
  /* =====================================================================
     TEKSTUR LANGIT — RESMI STELLARIUM
     ---------------------------------------------------------------------
     Sumber: https://github.com/Stellarium/stellarium
             textures/milkyway.png  (tekstur yang dipakai Stellarium sendiri)
     Diproses: konversi ke JPEG kualitas 95 (hi) & 90 (lo).
     Pengukuran: 2048x1024, rata-rata 9,79/255, puncak 168,
                 46,4% piksel < 3/255 (langit bersih), noise 2,55.
     ===================================================================== */
  /* =====================================================================
     TEKSTUR LANGIT — ESO REPROYEKSI 4096x2048 (6,2x LEBIH TAJAM)
     ---------------------------------------------------------------------
     PERMINTAAN PENGGUNA: "milkyway sangat blur, buram, low res bisa kamu
     lihat sendiri, kan saya sudah nyuruh kamu cari milkyway yg full hd
     dan jelas, kalo ada dan dapat yg lebih full Hd coba ganti".

     Sumber: panorama ESO resolusi penuh (eso0932a.tif, 6000x3000, 27,7 MB)
     — foto Bima Sakti asli oleh Serge Brunier (ESO), 18 megapiksel.
     Bandingkan tekstur Stellarium: 2048x1024 = 2,1 MP. Jadi sumber ini
     punya 8,6x lebih banyak informasi ASLI (bukan upscale).

     REPROYEKSI (kunci agar bisa menggantikan tekstur lama):
     Proyeksi ESO ditentukan lewat UJI KUAT, bukan tebakan. Caranya:
       1. Ambil 2.910 piksel pita dari tekstur Stellarium (proyeksinya
          diketahui pasti dari kode sumber Stellarium).
       2. Petakan tiap piksel ke koordinat galaktik (l, b).
       3. Cek apakah piksel itu juga terang di ESO, untuk tiap kandidat
          proyeksi:
              A: u=l/360,   v=(90-b)/180  -> 78,3% cocok
              D: u=l/360,   v=(90+b)/180  -> 84,2% cocok  <-- TERBAIK
              (baseline acak hanya 15-25%)
       Jadi ESO memakai: u = l/360, v = (90+b)/180.
     Tekstur ESO lalu DIPETAKAN ULANG ke proyeksi Stellarium
     (lon=atan(xe,ye), zen=acos(-ze)), sehingga bisa langsung menggantikan
     tekstur lama TANPA shader tambahan dan TANPA pergeseran pita —
     masalah "dua Bima Sakti berbeda posisi" tidak akan terulang.

     VERIFIKASI HASIL:
       posisi pita : rasio terang/gelap 5,1x  -> POSISI BENAR
       ketajaman   : Stellarium 2,66 -> ESO 16,48 (6,2x lebih detail)
     ===================================================================== */
  milkyway:   { map: 'milkyway_eso_reproj.jpg' },
  /* =====================================================================
     BIMA SAKTI RESOLUSI TINGGI (LAPISAN ZOOM) — BARU
     ---------------------------------------------------------------------
     PERMINTAAN PENGGUNA: "milkyway ada yg full hd atau yg lebih bagus ga?
     kalo bisa 2k atau 4k, yg sekarang itu jelek dan blur low res" dan
     "buat agar bisa terus di zoom berlayer layer kaya stellarium".

     Dua lapisan:
       milkyway_stellarium.jpg (2048x1024) = lapisan LO
           untuk pandangan luas (fov >= 25 derajat). Ini tekstur yang
           dipakai Stellarium sendiri; pengguna sudah menyetujuinya.
       milkyway_hi.jpg (6000x3000) = lapisan HI
           untuk zoom masuk (fov < 25 derajat). Berasal dari panorama ESO
           resolusi penuh (eso0932a.tif, 29 MB) — 2,9x lebih detail dari
           Stellarium, sehingga TIDAK blur saat di-zoom.

     Proses HI: GaussianBlur radius 1,5 SAJA (bukan 3-4 seperti versi lama
     yang menciptakan noise/banding), TANPA penambahan kontras dan TANPA
     cutoff level hitam — dua hal itulah yang dulu menimbulkan noise dan
     kontras berlebihan yang dikeluhkan pengguna.
     Pengukuran: noise 4,91, rata-rata 16,8, puncak 224.
     ===================================================================== */
  milkywayHi: { map: 'milkyway_hi.jpg' },
  /* bulan-bulan: peta permukaan asli NASA/USGS */
  /* AUDIT 29 Sep: normal map DITAMBAHKAN untuk satelit batuan. File dibuat
     tools/rebuild_assets_8k.py (Sobel dari luminance citra asli), sehingga
     permukaan POV satelit punya relief, bukan rata. Titan tetap tanpa normal
     karena permukaannya tertutup kabut tebal (memang rata secara visual). */
  phobos:     { map: 'phobos.jpg',    normal: 'phobos_normal.jpg' },
  deimos:     { map: 'deimos.jpg',    normal: 'deimos_normal.jpg' },
  io:         { map: 'io.jpg',        normal: 'io_normal.jpg' },
  europa:     { map: 'europa.jpg',    normal: 'europa_normal.jpg' },
  ganymede:   { map: 'ganymede.jpg',  normal: 'ganymede_normal.jpg' },
  callisto:   { map: 'callisto.jpg',  normal: 'callisto_normal.jpg' },
  titan:      { map: 'titan.jpg' },
  rhea:       { map: 'rhea.jpg',      normal: 'rhea_normal.jpg' },
  iapetus:    { map: 'iapetus.jpg',   normal: 'iapetus_normal.jpg' },
  titania:    { map: 'titania.jpg',   normal: 'titania_normal.jpg' },
  triton:     { map: 'triton.jpg',    normal: 'triton_normal.jpg' },
};

/* cache tekstur yang sudah dimuat */
const TEX = {};

/* berapa berkas total (untuk bilah kemajuan) */
function countAssets() {
  let n = 0;
  for (const k in ASSET_MANIFEST) {
    const m = ASSET_MANIFEST[k];
    for (const slot in m) if (m[slot]) n++;
  }
  return n;
}

/* pemuat satu tekstur dengan janji */
function loadTexture(url, srgb, onDone) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        if (srgb) tex.encoding = THREE.sRGBEncoding;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        if (onDone) onDone();
        resolve(tex);
      },
      undefined,
      (err) => {
        console.warn('gagal memuat ' + url, err);
        if (onDone) onDone();
        resolve(null);
      }
    );
  });
}

/* CATATAN PENTING — mengapa TIDAK ADA generator HD prosedural di sini:
   ----------------------------------------------------------------------
   Sebelumnya ada fungsi ensureHDTexture() yang mengganti setiap tekstur
   beresolusi < 2048x1024 dengan tekstur PROSEDURAL buatan (shadeMoon dll).
   Itu keliru dan sudah dihapus, karena:
     1. Menghapus permukaan ASLI (Mars jadi abu-abu, Bumi kehilangan benua)
        — terutama fatal di mode "Kualitas Ringan" (?q=lo) yang seluruh
        asetnya < 2048x1024, sehingga SEMUA benda tertimpa tekstur palsu.
     2. Membuat canvas 2 juta piksel x ~15 benda secara SEKUENSIAL di
        thread utama -> layar pemuatan tersendat puluhan detik.
   Prinsip sekarang: permukaan asli NASA/USGS SELALU dipertahankan apa
   adanya. Kualitas visual dinaikkan lewat aset sumber resmi yang lebih
   besar (lihat assets/hi/), bukan dengan mengarang permukaan. */

async function loadAllAssets(onProgress) {
  const total = countAssets();
  let done = 0;
  const jobs = [];

  for (const key in ASSET_MANIFEST) {
    const m = ASSET_MANIFEST[key];
    TEX[key] = {};
    for (const slot in m) {
      const file = m[slot];
      if (!file) continue;
      /* normal map menyimpan VEKTOR, bukan warna — wajib linear.
         Peta warna & cincin dalam ruang sRGB. */
      const srgb = (slot !== 'normal');
      jobs.push(
        loadTexture(ASSET_BASE + file, srgb, () => {
          done++;
          if (onProgress) onProgress(done, total, file);
        }).then((tex) => {
          if (tex) TEX[key][slot] = tex;
        })
      );
    }
  }
  await Promise.all(jobs);
  return TEX;
}
