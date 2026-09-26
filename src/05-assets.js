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

/* --- GENERATOR TEKSTUR PROSEDURAL HD ---
   Jika file gambar < 2048x1024, timpa dengan canvas prosedural HD.
   Fungsi shade tersedia dari 00-textures.js (buildSurfaceTexture). */
async function ensureHDTexture(key, slot, tex) {
  if (!tex || !tex.image) return tex;
  const img = tex.image;
  if (img.width >= 2048 && img.height >= 1024) return tex; // sudah HD

  console.log(`[HD] ${key}.${slot}: ${img.width}x${img.height} -> using fallback`);
  try {
    const shadeMap = {
      mercury: shadeMercury,
      venus: shadeVenus,
      earth: shadeEarth,
      moon: shadeMoon,
      mars: shadeMars,
      jupiter: shadeJupiter,
      saturn: shadeSaturn,
      uranus: shadeUranus,
      neptune: shadeNeptune,
      sun: shadeSun,
      io: shadeMoon,
      europa: shadeMoon,
      ganymede: shadeMoon,
      callisto: shadeMoon,
      titan: shadeMoon,
      rhea: shadeMoon,
      iapetus: shadeMoon,
      titania: shadeMoon,
      triton: shadeMoon,
      phobos: shadeMoon,
      deimos: shadeMoon,
    };
    const shadeFn = shadeMap[key.toLowerCase()] || shadeMoon;
    const canvas = buildSurfaceTexture({
      w: 2048, h: 1024, seed: 42, period: 12, shade: shadeFn
    }, key);
    const hdTex = new THREE.CanvasTexture(canvas);
    hdTex.encoding = THREE.sRGBEncoding;
    hdTex.wrapS = THREE.RepeatWrapping;
    hdTex.wrapT = THREE.ClampToEdgeWrapping;
    hdTex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    hdTex.minFilter = THREE.LinearMipmapLinearFilter;
    hdTex.magFilter = THREE.LinearFilter;
    hdTex.generateMipmaps = true;
    console.log(`[HD] ${key}.${slot}: HD texture generated ${hdTex.image.width}x${hdTex.image.height}`);
    return hdTex;
  } catch (e) {
    console.warn('[HD] gagal generate HD texture', e);
    return tex;
  }
}

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

  /* Tingkatkan ke HD procedural untuk aset yang resolusinya < 2048x1024 */
  console.log('[HD] Starting HD texture upgrade...');
  for (const key in TEX) {
    for (const slot in TEX[key]) {
      if (TEX[key][slot]) {
        TEX[key][slot] = await ensureHDTexture(key, slot, TEX[key][slot]);
      }
    }
  }
  console.log('[HD] HD texture upgrade completed');
  return TEX;
}
