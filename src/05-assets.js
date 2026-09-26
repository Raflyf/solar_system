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
  milkyway:   { map: 'milkyway.jpg' },
  /* bulan-bulan: peta permukaan asli NASA/USGS */
  phobos:     { map: 'phobos.png' },
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

/* muat seluruh aset; onProgress(dimuat, total, namaBerkas) */
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
      const srgb = true;   /* semua peta warna & cincin dalam ruang sRGB */
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
