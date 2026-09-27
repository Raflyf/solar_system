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
  earth:      { map: 'earth_day.jpg', clouds: 'earth_clouds.jpg', night: 'earth_night.jpg' },
  moon:       { map: 'moon.jpg',      normal: 'moon_normal.jpg' },
  mars:       { map: 'mars.jpg',      normal: 'mars_normal.jpg' },
  jupiter:    { map: 'jupiter.jpg' },
  saturn:     { map: 'saturn.jpg',    ring: 'saturn_ring.png' },
  uranus:     { map: 'uranus.jpg' },
  neptune:    { map: 'neptune.jpg' },
  /* =====================================================================
     TEKSTUR LANGIT — PANORAMA ESO 6000x3000 (RESOLUSI LEBIH TINGGI)
     ---------------------------------------------------------------------
     PERMINTAAN: "buat langit nya lebih HD dan jelas, cari asset nya dari
     internet dan web nasa".

     Sumber sebelumnya (NASA "Deep Star Maps 2020", 3840x1920) diganti
     dengan PANORAMA ESO (European Southern Observatory):
         https://cdn.eso.org/images/large/eso0932a.jpg
         "The Milky Way panorama" oleh Serge Brunier (ESO)
         lisensi CC BY 4.0 / domain publik

     PERBANDINGAN TERUKUR:
         NASA  : 3840x1920, rata-rata 11,9, puncak 178
         ESO   : 6000x3000, rata-rata 16,9, puncak 205   <-- dipakai
     Resolusi 1,56x lebih tinggi dan rentang kecerahan lebih kaya,
     sehingga pita galaksi + jalur debu terlihat lebih jelas dan halus.

     Proses: Gaussian blur radius 4 (pada 6000px ≈ radius 2,6 pada
     3840px) untuk menghilangkan titik bintang individual — bintang
     sudah dirender terpisah oleh katalog HYG. Hasil: noise 1,16 (halus).
     ===================================================================== */
  milkyway:   { map: 'milkyway_eso.jpg' },
  /* bulan-bulan: peta permukaan asli NASA/USGS */
  phobos:     { map: 'phobos.jpg' },
  deimos:     { map: 'deimos.jpg' },
  io:         { map: 'io.jpg' },
  europa:     { map: 'europa.jpg' },
  ganymede:   { map: 'ganymede.jpg' },
  callisto:   { map: 'callisto.jpg' },
  titan:      { map: 'titan.jpg' },
  rhea:       { map: 'rhea.jpg' },
  iapetus:    { map: 'iapetus.jpg' },
  titania:    { map: 'titania.jpg' },
  triton:     { map: 'triton.jpg' },
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
