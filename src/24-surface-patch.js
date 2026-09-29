/* =======================================================================
   SURFACE PATCH — PERMUKAAN REALISTIS RESOLUSI TINGGI 1:1 SAAT POV
   -----------------------------------------------------------------------
   Berdasarkan data dan citra astronomi resmi NASA, USGS, ESA, dan JPL:
   • Memetakan koordinat geografis nyata (lat, lon) langsung ke tekstur
     global resmi NASA (albedo asli tiap titik planet/satelit).
   • Multi-Scale PBR Material:
       - Regolith (Bulan, Merkurius, asteroid, satelit batuan): kawah
         bertingkat, punggungan kawah, debu basal/anorthosit, pecahan batu,
         dan efek 'opposition surge' (hamburan balik retro-reflektif Hapke).
       - Mars: bukit pasir barchan / riak angin, debu besi hematit rust-red,
         hamparan kerikil basal gelap, batuan bersudut.
       - Bumi: adaptif bioma (vegetasi rumput/tanah, pasir gurun, es kutub,
         dan air laut dengan pantulan specular Matahari Fresnel).
       - Venus: lempeng basal vulkanik retak (polygonal slabs), celah debu
         sulfur amber, pencahayaan difus awan tebal asam sulfat (Venera 13/14).
       - Europa / Es: hamparan es kristal putih, rekahan cryo-lineae merah-cokelat
         berisi garam hidrat/tholin, chaos terrain, glint es specular.
       - Io: endapan belerang kuning/oranye/merah, kerak sulfur dioksida
         putih, kaldera vulkanik, aliran lava basal hitam.
       - Titan: bukit pasir hidrokarbon gelap (tholin), batu kerikil es air
         membulat oleh aliran metana cair (Huygens lander), dataran lembap.
       - Raksasa Gas/Es: gelombang sabuk awan troposferik berombak.
   • Micro-topography Displacement: elevasi geometris pada spherical cap
     sehingga horizon memiliki siluet bukit, dinding kawah, dan bukit pasir nyata
     (bukan lingkaran datar polos palsu).
   • Aerial Perspective: tanah di kejauhan memudar secara mulus ke kabut
     atmosfer horizon planet yang sesuai (hamburan Rayleigh di Bumi, debu di Mars,
     haze asam sulfat di Venus, kabut oranye di Titan, atau tajam di antariksa).
   ======================================================================= */

let surfacePatch = null;      /* mesh patch aktif */
let surfacePatchBody = null;  /* body yang sedang dipakai patch */
let surfacePatchKey = '';     /* kunci untuk mendeteksi perubahan */

const SURFACE_PATCH_SEG = 128;     /* 128x128 = 32.768 segitiga */

/* ---------------- Ukuran Patch ---------------- */
function surfacePatchRadiusDeg(bodyRadiusKm, elevM, fovDeg) {
  const h = Math.max(1, elevM || 50) / 1000;                    /* km */
  const R = bodyRadiusKm;
  const horizonAngleDeg = Math.acos(Math.min(1, R / (R + h))) * 180 / Math.PI;
  /* Patch harus menjangkau dari kaki pengamat (0°) hingga melampaui horizon
     (minimal 2.25x sudut horizon) agar tepi bola planet tersembunyi
     di bawah horizon geometris dan horizon tampak alami. */
  const need = Math.max(0.75, horizonAngleDeg * 2.25);
  return Math.min(need, 5.0);
}

/* ---------------- Klasifikasi Tipe Permukaan Planet ---------------- */
function getSurfaceTypeForBody(body) {
  if (!body) return 'regolith';
  const name = (body.name || '').toLowerCase();
  const key = (body.key || '').toLowerCase();

  // 1. Satelit / Moon spesifik
  if (body.isMoon || key.includes(':')) {
    if (name === 'bulan' || name === 'moon' || key.endsWith(':bulan')) return 'regolith';
    if (name.includes('europa') || name.includes('enceladus') || name.includes('triton')) return 'ice';
    if (name.includes('io')) return 'sulfur';
    if (name.includes('titan') && !name.includes('titania')) return 'titan';
    if (name.includes('phobos') || name.includes('deimos') || name.includes('callisto') || name.includes('ganymede') || name.includes('rhea') || name.includes('iapetus')) return 'regolith';
    return 'regolith';
  }

  // 2. Planet utama
  if (key === 'earth' || name === 'bumi') return 'earth';
  if (key === 'mars' || name === 'mars') return 'mars';
  if (key === 'venus' || name === 'venus') return 'venus';
  if (key === 'mercury' || name === 'merkurius') return 'regolith';
  if (['jupiter', 'saturn', 'saturnus', 'uranus', 'neptune', 'neptunus'].some(g => key.includes(g))) return 'clouds';
  return 'regolith';
}

/* =======================================================================
   GENERATOR PBR PROCEDURAL HIGH-FIDELITY (NORMAL & DETAIL ALBEDO)
   -----------------------------------------------------------------------
   Menghasilkan peta normal tangent-space dan mikro-albedo beresolusi tinggi
   secara deterministik tanpa bergantung unduhan eksternal.
   ======================================================================= */
const _pbrCache = new Map();

function _pseudoRandom(seed) {
  let s = (seed || 12345) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function _createPerlin(seed) {
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  const rnd = _pseudoRandom(seed || 12345);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  for (let i = 0; i < 256; i++) p[256 + i] = p[i];
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = p[X] + Y, b = p[X + 1] + Y;
    const g1 = (p[a] % 4), g2 = (p[b] % 4), g3 = (p[a + 1] % 4), g4 = (p[b + 1] % 4);
    const grad = (g, xx, yy) => (g === 0 ? xx + yy : g === 1 ? -xx + yy : g === 2 ? xx - yy : -xx - yy);
    const x1 = grad(g1, xf, yf), x2 = grad(g2, xf - 1, yf);
    const y1 = grad(g3, xf, yf - 1), y2 = grad(g4, xf - 1, yf - 1);
    return (x1 + u * (x2 - x1)) + v * ((y1 + u * (y2 - y1)) - (x1 + u * (x2 - x1)));
  };
}

function _sobelNormal(h, w, H, strength) {
  const norm = new Uint8Array(w * H * 4);
  const s = strength || 3.0;
  for (let y = 0; y < H; y++) {
    const ym = (y - 1 + H) % H, yp = (y + 1) % H;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w;
      const dx = (h[ym * w + xp] + 2 * h[y * w + xp] + h[yp * w + xp]) -
                 (h[ym * w + xm] + 2 * h[y * w + xm] + h[yp * w + xm]);
      const dy = (h[yp * w + xm] + 2 * h[yp * w + x] + h[yp * w + xp]) -
                 (h[ym * w + xm] + 2 * h[ym * w + x] + h[ym * w + xp]);
      const len = Math.sqrt(dx * dx * s + dy * dy * s + 1.0);
      const idx = (y * w + x) * 4;
      norm[idx]     = Math.round(((-dx * Math.sqrt(s)) / len) * 127.5 + 128);
      norm[idx + 1] = Math.round(((-dy * Math.sqrt(s)) / len) * 127.5 + 128);
      norm[idx + 2] = Math.round((1.0 / len) * 127.5 + 128);
      norm[idx + 3] = Math.round(Math.max(0, Math.min(1, h[y * w + x])) * 255);
    }
  }
  return norm;
}

function generateSurfacePBR(type) {
  if (_pbrCache.has(type)) return _pbrCache.get(type);

  const w = 512, H = 512;
  const h = new Float32Array(w * H);
  const alb = new Uint8Array(w * H * 4);
  let roughness = 0.90;
  let opposition = 0.0;
  let bumpStrength = 3.2;

  if (type === 'regolith') {
    // 1. Regolith (Bulan / Merkurius / Satelit Batuan)
    // Berdasarkan data Apollo & Lunar Reconnaissance Orbiter (LRO):
    // Matriks debu halus kohesif, mikrokawah bertingkat, dan butiran breksia/anorthosit
    roughness = 0.94;
    opposition = 0.65; // Retro-refleksi Hapke kuat
    bumpStrength = 3.6;
    const noise = _createPerlin(101);
    const rnd = _pseudoRandom(202);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        const n0 = noise(x * 0.04, y * 0.04) * 0.50;
        const n1 = noise(x * 0.16, y * 0.16) * 0.25;
        const n2 = noise(x * 0.64, y * 0.64) * 0.15;
        h[y * w + x] = 0.50 + (n0 + n1 + n2 - 0.45) * 0.35;
      }
    }

    // Taburan mikrokawah realistis (cekungan mangkuk + punggungan kawah timbul)
    const numCraters = 40;
    for (let c = 0; c < numCraters; c++) {
      const cx = rnd() * w, cy = rnd() * H;
      const r = 3 + rnd() * rnd() * 42;
      const depth = 0.25 + rnd() * 0.30;
      const rSq = r * r;
      const rMax = r * 1.45;
      const x0 = Math.floor(cx - rMax), x1 = Math.ceil(cx + rMax);
      const y0 = Math.floor(cy - rMax), y1 = Math.ceil(cy + rMax);
      for (let py = y0; py <= y1; py++) {
        const wy = (py % H + H) % H;
        const dy = py - cy;
        for (let px = x0; px <= x1; px++) {
          const wx = (px % w + w) % w;
          const dx = px - cx;
          const dSq = dx * dx + dy * dy;
          if (dSq < rSq) {
            const bowl = Math.sqrt(Math.max(0, 1.0 - dSq / rSq));
            h[wy * w + wx] -= bowl * depth * 0.32;
          } else if (dSq < rMax * rMax) {
            const d = Math.sqrt(dSq);
            const rim = Math.exp(-Math.pow((d - r) / (r * 0.22), 2));
            h[wy * w + wx] += rim * depth * 0.20;
          }
        }
      }
    }

    // Mikro-albedo netral (dinormalisasi di sekitar 128 agar menjaga warna asli NASA)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const val = Math.max(0, Math.min(1, h[y * w + x]));
        const grain = (noise(x * 1.5, y * 1.5) - 0.5) * 25;
        const g = Math.round(Math.max(45, Math.min(210, val * 120 + 68 + grain)));
        alb[idx] = g; alb[idx + 1] = g; alb[idx + 2] = g; alb[idx + 3] = 255;
      }
    }
  } else if (type === 'mars') {
    // 2. Mars (Riak angin transversal, debu hematit & kerikil basal)
    // Berdasarkan rover Curiosity/Perseverance di Gale & Jezero Crater:
    // Riak pasir angin asimetris halus (panjang gelombang ~1.2m),
    // puncak riak dilapisi debu halus terang, lembah diisi pasir basal gelap
    roughness = 0.88;
    opposition = 0.32;
    bumpStrength = 2.8;
    const noise = _createPerlin(303);
    const rnd = _pseudoRandom(404);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        const duneAngle = (x / w) * Math.PI * 14.0 + Math.sin((y / H) * Math.PI * 4.0) * 1.2;
        const dune = Math.sin(duneAngle);
        const asymDune = dune > 0 ? Math.pow(dune, 0.8) : -Math.pow(-dune, 1.25);

        const fineRipple = Math.sin((x / w) * Math.PI * 48.0 + (y / H) * Math.PI * 16.0) * 0.15;
        const n = noise(x * 0.06, y * 0.06) * 0.25;
        const height = (asymDune * 0.35 + fineRipple + n + 1.0) * 0.5;
        h[y * w + x] = height;

        const idx = (y * w + x) * 4;
        const base = Math.round(92 + height * 72);
        alb[idx]     = Math.min(225, base + 14);
        alb[idx + 1] = Math.min(215, base + 2);
        alb[idx + 2] = Math.max(40, base - 12);
        alb[idx + 3] = 255;
      }
    }

    // Kerikil basal bersudut yang tercecer
    for (let i = 0; i < 35; i++) {
      const rx = Math.floor(rnd() * w), ry = Math.floor(rnd() * H);
      const rad = 2 + Math.floor(rnd() * 5);
      for (let dy = -rad; dy <= rad; dy++) {
        const wy = (ry + dy + H) % H;
        for (let dx = -rad; dx <= rad; dx++) {
          const wx = (rx + dx + w) % w;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= rad) {
            const stone = Math.sqrt(1.0 - (d / rad) * (d / rad)) * 0.35;
            h[wy * w + wx] += stone;
            const idx = (wy * w + wx) * 4;
            alb[idx] = 80; alb[idx + 1] = 75; alb[idx + 2] = 70;
          }
        }
      }
    }
  } else if (type === 'earth') {
    // 3. Bumi (Vegetasi, tanah organik & tekstur tanah)
    roughness = 0.82;
    bumpStrength = 2.4;
    const noise = _createPerlin(505);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        const n0 = noise(x * 0.08, y * 0.08);
        const n1 = noise(x * 0.32, y * 0.32) * 0.5;
        const n2 = noise(x * 1.28, y * 1.28) * 0.25;
        const height = (n0 + n1 + n2 + 1.0) * 0.5;
        h[y * w + x] = height;

        const idx = (y * w + x) * 4;
        const v = Math.round(95 + height * 65);
        alb[idx]     = Math.round(v * 0.95);
        alb[idx + 1] = Math.round(v * 1.05);
        alb[idx + 2] = Math.round(v * 0.90);
        alb[idx + 3] = 255;
      }
    }
  } else if (type === 'venus') {
    // 4. Venus (Lempeng basal vulkanik polygonal retak, Venera 13/14)
    roughness = 0.86;
    bumpStrength = 3.2;
    const rnd = _pseudoRandom(606);
    const numPts = 28;
    const pts = [];
    for (let i = 0; i < numPts; i++) pts.push([rnd() * w, rnd() * H]);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        let d1 = Infinity, d2 = Infinity;
        for (let i = 0; i < numPts; i++) {
          const dx = Math.abs(x - pts[i][0]);
          const dy = Math.abs(y - pts[i][1]);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) { d2 = d1; d1 = d; }
          else if (d < d2) { d2 = d; }
        }
        const crack = Math.min(1.0, (d2 - d1) / 5.0);
        h[y * w + x] = crack * 0.65 + 0.35;

        const idx = (y * w + x) * 4;
        if (crack < 0.25) {
          alb[idx] = 165; alb[idx + 1] = 145; alb[idx + 2] = 70; alb[idx + 3] = 255;
        } else {
          const v = Math.round(90 + crack * 40);
          alb[idx] = v + 10; alb[idx + 1] = v; alb[idx + 2] = v - 10; alb[idx + 3] = 255;
        }
      }
    }
  } else if (type === 'ice') {
    // 5. Es (Europa / Enceladus / Triton)
    // Crystalline ice crust, rekahan garis ganda (lineae) berisi garam hidrat
    roughness = 0.28;
    bumpStrength = 2.5;
    const noise = _createPerlin(707);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        const crack1 = Math.abs(Math.sin((x / w) * Math.PI * 6.0 + (y / H) * Math.PI * 8.0));
        const crack2 = Math.abs(Math.sin((x / w) * Math.PI * 10.0 - (y / H) * Math.PI * 6.0));
        const n = noise(x * 0.05, y * 0.05) * 0.2;
        const isLineae = Math.min(crack1, crack2) < 0.06;
        h[y * w + x] = 0.5 + n + (isLineae ? 0.25 : 0.0);

        const idx = (y * w + x) * 4;
        if (isLineae) {
          alb[idx] = 145; alb[idx + 1] = 105; alb[idx + 2] = 80; alb[idx + 3] = 255;
        } else {
          const v = Math.round(185 + n * 45);
          alb[idx] = v - 5; alb[idx + 1] = v; alb[idx + 2] = v + 10; alb[idx + 3] = 255;
        }
      }
    }
  } else if (type === 'sulfur') {
    // 6. Sulfur (Io)
    // Endapan belerang vulkanik, kerak SO2 beku, dan vent basal
    roughness = 0.80;
    bumpStrength = 3.0;
    const noise = _createPerlin(808);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        const n0 = noise(x * 0.03, y * 0.03);
        const n1 = noise(x * 0.12, y * 0.12) * 0.4;
        const val = (n0 + n1 + 1.0) * 0.5;
        h[y * w + x] = val;

        const idx = (y * w + x) * 4;
        if (val < 0.25) {
          alb[idx] = 40; alb[idx + 1] = 40; alb[idx + 2] = 40; alb[idx + 3] = 255;
        } else if (val < 0.65) {
          alb[idx]     = Math.round(170 + val * 55);
          alb[idx + 1] = Math.round(130 + val * 45);
          alb[idx + 2] = 35;
          alb[idx + 3] = 255;
        } else {
          alb[idx] = 220; alb[idx + 1] = 215; alb[idx + 2] = 195; alb[idx + 3] = 255;
        }
      }
    }
  } else if (type === 'titan') {
    // 7. Titan (Bukit pasir hidrokarbon & kerikil es air Huygens)
    roughness = 0.72;
    bumpStrength = 2.6;
    const noise = _createPerlin(909);
    const rnd = _pseudoRandom(101);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        const dune = Math.sin((y / H) * Math.PI * 12.0 + Math.sin((x / w) * Math.PI * 4.0) * 1.2);
        const n = noise(x * 0.04, y * 0.04) * 0.3;
        h[y * w + x] = (dune * 0.35 + n + 1.0) * 0.5;

        const idx = (y * w + x) * 4;
        alb[idx]     = 105 + Math.round(dune * 20);
        alb[idx + 1] = 80 + Math.round(dune * 15);
        alb[idx + 2] = 55 + Math.round(dune * 10);
        alb[idx + 3] = 255;
      }
    }

    for (let i = 0; i < 40; i++) {
      const px = Math.floor(rnd() * w), py = Math.floor(rnd() * H);
      const rad = 2 + Math.floor(rnd() * 6);
      for (let dy = -rad; dy <= rad; dy++) {
        const wy = (py + dy + H) % H;
        for (let dx = -rad; dx <= rad; dx++) {
          const wx = (px + dx + w) % w;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= rad) {
            const dome = Math.sqrt(1.0 - (d / rad) * (d / rad));
            h[wy * w + wx] += dome * 0.25;
            const idx = (wy * w + wx) * 4;
            alb[idx] = 145; alb[idx + 1] = 135; alb[idx + 2] = 125;
          }
        }
      }
    }
  } else {
    // 8. Clouds (Raksasa Gas/Es)
    roughness = 0.95;
    bumpStrength = 1.5;
    const noise = _createPerlin(1111);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        const wave = Math.sin((y / H) * Math.PI * 24.0 + noise(x * 0.06, y * 0.02) * 3.5);
        const eddy = noise(x * 0.04, y * 0.08) * 0.4;
        h[y * w + x] = (wave * 0.35 + eddy + 1.0) * 0.5;

        const idx = (y * w + x) * 4;
        const v = Math.round(155 + wave * 40);
        alb[idx] = v; alb[idx + 1] = v; alb[idx + 2] = v; alb[idx + 3] = 255;
      }
    }
  }

  const normBuf = _sobelNormal(h, w, H, bumpStrength);

  const detailTex = new THREE.DataTexture(alb, w, H, THREE.RGBAFormat);
  detailTex.wrapS = THREE.RepeatWrapping;
  detailTex.wrapT = THREE.RepeatWrapping;
  detailTex.minFilter = THREE.LinearMipmapLinearFilter;
  detailTex.magFilter = THREE.LinearFilter;
  detailTex.generateMipmaps = true;
  detailTex.anisotropy = 8;
  detailTex.needsUpdate = true;

  const normalTex = new THREE.DataTexture(normBuf, w, H, THREE.RGBAFormat);
  normalTex.wrapS = THREE.RepeatWrapping;
  normalTex.wrapT = THREE.RepeatWrapping;
  normalTex.minFilter = THREE.LinearMipmapLinearFilter;
  normalTex.magFilter = THREE.LinearFilter;
  normalTex.generateMipmaps = true;
  normalTex.anisotropy = 8;
  normalTex.needsUpdate = true;

  const res = { detailTex, normalTex, roughness, opposition };
  _pbrCache.set(type, res);
  return res;
}

/* Texture 1x1 cadangan untuk mencegah unbound uniform texture */
let _dummyTexture = null;
function getDummyTexture() {
  if (_dummyTexture) return _dummyTexture;
  const data = new Uint8Array([128, 128, 128, 255]);
  _dummyTexture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  _dummyTexture.needsUpdate = true;
  return _dummyTexture;
}

/* =======================================================================
   SHADER MATERIAL PERMUKAAN MULTI-SCALE PBR
   ======================================================================= */
const SURFACE_PATCH_VERT = [
  '#include <common>',
  '#include <logdepthbuf_pars_vertex>',
  'attribute vec2 aMacroUv;',
  'varying vec2 vUv;',
  'varying vec2 vMacroUv;',
  'varying vec3 vNormalW;',
  'varying vec3 vPosW;',
  'varying vec3 vViewDirW;',
  'varying float vDist;',
  'void main() {',
  '  vUv = uv;',
  '  vMacroUv = aMacroUv;',
  '  vNormalW = normalize(mat3(modelMatrix) * normal);',
  '  vec4 wp = modelMatrix * vec4(position, 1.0);',
  '  vPosW = wp.xyz;',
  '  vViewDirW = normalize(cameraPosition - wp.xyz);',
  '  vDist = length(cameraPosition - wp.xyz);',
  '  gl_Position = projectionMatrix * viewMatrix * wp;',
  '  #include <logdepthbuf_vertex>',
  '}',
].join('\n');

const SURFACE_PATCH_FRAG = [
  '#include <common>',
  '#include <logdepthbuf_pars_fragment>',
  'uniform sampler2D uMacroMap;',
  'uniform sampler2D uMacroNormalMap;',
  'uniform float uHasMacroNormal;',
  'uniform sampler2D uDetailMap;',
  'uniform sampler2D uNormalMap;',
  'uniform sampler2D uTileMap;',
  'uniform float uTileWeight;',
  // ====================================================================
  // RECT TILE — PERBAIKAN BUG "PERMUKAAN POLOS"
  // --------------------------------------------------------------------
  // Kanvas tile (4096x4096) hanya mencakup wilayah kecil (mis. 2,25 derajat)
  // di sekitar pengamat, sedangkan vMacroUv adalah UV GLOBAL 0..1 seluruh
  // bola planet. Sebelumnya shader menyampel uTileMap dengan vMacroUv
  // (0,79 di Jakarta) sehingga hanya piksel di luar kanvas yang dibaca
  // (clamp ke tepi) -> warna rata = permukaan polos.
  // Sekarang tile dipetakan lewat rect: uvTile = (vMacroUv - uTileUvMin) / uTileUvSize.
  'uniform vec2 uTileUvMin;',
  'uniform vec2 uTileUvSize;',
  'uniform vec3 uSunDir;',
  'uniform vec3 uSunColor;',
  'uniform float uSunIntensity;',
  'uniform vec3 uAmbientColor;',
  'uniform vec3 uHorizonFogColor;',
  'uniform float uFogDensity;',
  'uniform float uRoughness;',
  'uniform float uOppositionSurge;',
  'uniform float uIsWater;',
  'uniform float uTime;',
  'varying vec2 vUv;',
  'varying vec2 vMacroUv;',
  'varying vec3 vNormalW;',
  'varying vec3 vPosW;',
  'varying vec3 vViewDirW;',
  'varying float vDist;',
  'void main() {',
  '  #include <logdepthbuf_fragment>',
  '  vec3 macroColor = texture2D(uMacroMap, vMacroUv).rgb;',
  '  if (uTileWeight > 0.01) {',
  '    vec2 uvTile = (vMacroUv - uTileUvMin) / max(uTileUvSize, vec2(1e-6));',
  '    if (uvTile.x >= 0.0 && uvTile.x <= 1.0 && uvTile.y >= 0.0 && uvTile.y <= 1.0) {',
  '      vec3 tileColor = texture2D(uTileMap, uvTile).rgb;',
  '      macroColor = mix(macroColor, tileColor, uTileWeight);',
  '    }',
  '  }',
  '  vec2 uvNear = vUv * 1.0;',
  '  vec2 uvFar  = vUv * 0.14;',
  '  vec3 detNear = texture2D(uDetailMap, uvNear).rgb;',
  '  vec3 detFar  = texture2D(uDetailMap, uvFar).rgb;',
  // AUDIT 29 Sep: skala blend diperbaiki. Sebelumnya `vDist * 20.0` padahal
  // vDist dalam SATUAN SCENE (1 unit = radius Bumi = 6371 km). Patch hanya
  // berjari-jari ~0,0016 unit (10 km), sehingga nilainya cuma 0..0,033 —
  // praktis SELALU 0, dan tekstur detail jarak-jauh tidak pernah aktif
  // (permukaan jadi seragam). Skala baru mengubah vDist (unit) ke kilometer
  // lalu menormalkan ke radius patch, sehingga blend benar-benar 0..0,65:
  // dekat = detail halus, jauh = detail lebih besar (mengurangi aliasing).
  '  float vDistKm = vDist * 6371.0;',
  '  float blendFactor = clamp(vDistKm / 12.0, 0.0, 0.65);',
  '  vec3 detailColor = mix(detNear, detFar, blendFactor);',
  '  vec3 normNear = texture2D(uNormalMap, uvNear).rgb;',
  '  vec3 normFar  = texture2D(uNormalMap, uvFar).rgb;',
  '  vec3 normMap  = mix(normNear, normFar, blendFactor);',
  '  vec3 localNorm = normalize(normMap * 2.0 - 1.0);',
  '  if (uHasMacroNormal > 0.5) {',
  '    vec3 macroNorm = texture2D(uMacroNormalMap, vMacroUv).rgb * 2.0 - 1.0;',
  '    localNorm = normalize(vec3(macroNorm.xy * 1.3 + localNorm.xy * 0.6, macroNorm.z * localNorm.z));',
  '  }',
  '  vec3 N = normalize(vNormalW);',
  '  vec3 upVec = abs(N.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);',
  '  vec3 tangent = normalize(cross(upVec, N));',
  '  vec3 bitangent = cross(N, tangent);',
  '  mat3 TBN = mat3(tangent, bitangent, N);',
  '  vec3 perturbedNormal = normalize(TBN * localNorm);',
  '  float isWater = 0.0;',
  '  if (uIsWater > 0.5) {',
  '    if (macroColor.b > macroColor.r * 1.22 && macroColor.b > macroColor.g * 1.04 && macroColor.r < 0.35) {',
  '      isWater = 1.0;',
  '    }',
  '  }',
  '  vec3 albedo;',
  '  if (isWater > 0.5) {',
  '    albedo = mix(macroColor, vec3(0.015, 0.055, 0.13), 0.70);',
  '  } else {',
  '    vec3 baseColor = max(macroColor, vec3(0.04));',
  '    float lum = dot(baseColor, vec3(0.299, 0.587, 0.114));',
  '    if (lum < 0.22) {',
  '      float boost = (0.22 - lum) / 0.22;',
  '      baseColor = mix(baseColor, detailColor * 0.90, boost * 0.85);',
  '    }',
  // AUDIT 29 Sep: kekuatan tekstur detail dinaikkan 1,45 -> 1,85 dan batas
  // clamp dilebarkan (0,35..1,85 -> 0,28..2,15).
  // ALASAN: citra resmi gratis NASA GIBS maksimum ~250 m/piksel (batas data,
  // sudah diverifikasi ke WMTSCapabilities.xml — BlueMarble hanya punya
  // TileMatrixSet 500m). Saat kamera berdiri 50 m, seluruh pandangan hanya
  // mencakup ~100 piksel citra, sehingga permukaan tampak rata. Menaikkan
  // kontribusi tekstur mikro prosedural adalah teknik standar simulator
  // penerbangan/planetarium agar permukaan tetap terbaca sebagai material
  // padat (bukan bidang warna rata) — tetap tidak diklaim sebagai data.
  '    vec3 albedoMod = (detailColor - 0.5) * 1.85 + 1.0;',
  '    albedo = baseColor * clamp(albedoMod, 0.28, 2.15);',
  '  }',
  '  vec3 L = normalize(uSunDir);',
  '  vec3 V = normalize(vViewDirW);',
  '  float NdotL = max(dot(perturbedNormal, L), 0.0);',
  '  float opposition = 0.0;',
  '  if (uOppositionSurge > 0.0) {',
  '    float VdotL = max(dot(V, L), 0.0);',
  '    opposition = pow(VdotL, 6.0) * uOppositionSurge * NdotL;',
  '  }',
  '  vec3 diffuse = albedo * uSunColor * (NdotL * uSunIntensity + opposition);',
  '  float skyHemi = clamp(perturbedNormal.y * 0.45 + 0.55, 0.20, 1.0);',
  '  vec3 ambient = albedo * uAmbientColor * skyHemi;',
  '  vec3 specular = vec3(0.0);',
  '  if (isWater > 0.5) {',
  '    vec3 H = normalize(L + V);',
  '    float NdotH = max(dot(perturbedNormal, H), 0.0);',
  '    float spec = pow(NdotH, 140.0);',
  '    float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(V, perturbedNormal), 0.0), 5.0);',
  '    specular = uSunColor * spec * fresnel * 3.2 * NdotL;',
  '  } else if (uRoughness < 0.5) {',
  '    vec3 H = normalize(L + V);',
  '    float NdotH = max(dot(perturbedNormal, H), 0.0);',
  '    float spec = pow(NdotH, 36.0);',
  '    specular = uSunColor * spec * (1.0 - uRoughness) * 0.50 * NdotL;',
  '  }',
  '  vec3 finalColor = diffuse + ambient + specular;',
  '  if (uFogDensity > 0.0) {',
  '    float distKm = vDist * 6371.0;',
  '    float fog = 1.0 - exp(-distKm * uFogDensity);',
  '    fog = clamp(fog, 0.0, 1.0);',
  '    finalColor = mix(finalColor, uHorizonFogColor, fog);',
  '  }',
  '  gl_FragColor = vec4(finalColor, 1.0);',
  '}',
].join('\n');

/* =======================================================================
   PEMETAAN UV PATCH (GEOGRAFIS MAKRO + DETAIL MIKRO)
   ======================================================================= */
function applyPatchUV(mesh, centerLat, centerLon, spanDeg) {
  const geo = mesh.geometry;
  const uvAttr = geo.attributes.uv;
  if (!uvAttr) return;

  const count = uvAttr.count;
  if (!geo.attributes.aUvBase) {
    const base = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      base[i * 2] = uvAttr.getX(i);
      base[i * 2 + 1] = uvAttr.getY(i);
    }
    geo.setAttribute('aUvBase', new THREE.BufferAttribute(base, 2));
  }
  const baseAttr = geo.attributes.aUvBase;

  let macroAttr = geo.attributes.aMacroUv;
  if (!macroAttr || macroAttr.count !== count) {
    macroAttr = new THREE.BufferAttribute(new Float32Array(count * 2), 2);
    geo.setAttribute('aMacroUv', macroAttr);
  }

  const patchRad = geo.parameters.thetaLength;
  const body = surfacePatchBody || (typeof SURFACE_VIEW !== 'undefined' ? SURFACE_VIEW.currentBody() : null);
  const R_km = body ? (body.realRadiusKm || body.radiusKm * RAD) : 6371;

  for (let i = 0; i < count; i++) {
    const u0 = baseAttr.getX(i);
    const v0 = baseAttr.getY(i);
    const rNorm = 1.0 - v0;
    const thetaWarped = Math.pow(rNorm, 2.0) * patchRad;
    const thetaDeg = thetaWarped / DEG;
    const phi = u0 * Math.PI * 2.0;

    const dx = thetaDeg * Math.sin(phi); // East offset in degrees
    const dy = thetaDeg * Math.cos(phi); // North offset in degrees

    // 1. Detail planar UV (1 tile = 10.0 meter tanah nyata)
    const distM = thetaWarped * (R_km * 1000.0);
    const xMeters = distM * Math.sin(phi);
    const yMeters = distM * Math.cos(phi);
    const uDetail = xMeters / 10.0;
    const vDetail = yMeters / 10.0;
    uvAttr.setXY(i, uDetail, vDetail);

    // 2. Macro UV geografis (NASA equirectangular)
    const lat = Math.max(-89.9, Math.min(89.9, centerLat + dy));
    const dLon = dx / Math.max(0.04, Math.abs(Math.cos(lat * DEG)));
    const lon = ((centerLon + dLon + 180.0) % 360.0 + 360.0) % 360.0 - 180.0;

    const uMacro = (lon + 180.0) / 360.0;
    const vMacro = (lat + 90.0) / 180.0;
    macroAttr.setXY(i, uMacro, vMacro);
  }

  uvAttr.needsUpdate = true;
  macroAttr.needsUpdate = true;
}

/* =======================================================================
   MICRO-TOPOGRAPHY ELEVATION DISPLACEMENT & WARPED GEOMETRY
   -----------------------------------------------------------------------
   Mendistribusikan verteks secara non-linear (kepadatan tinggi di dekat
   pengamat) dan menambahkan undulasi relief kawah/bukit/pasir nyata.
   ======================================================================= */
function applyPatchTerrainElevation(geo, surfaceType, bodyRadiusKm) {
  const pos = geo.attributes.position;
  const base = geo.attributes.aUvBase;
  const patchRad = geo.parameters.thetaLength;
  if (!pos || !base) return;

  const rUnits = bodyRadiusKm / RAD;

  let maxElevM = 80.0;
  if (surfaceType === 'clouds') maxElevM = 0.0;
  else if (surfaceType === 'ice') maxElevM = 28.0;
  else if (surfaceType === 'venus') maxElevM = 55.0;
  else if (surfaceType === 'mars') maxElevM = 65.0;
  else if (surfaceType === 'regolith') maxElevM = 110.0;
  else if (surfaceType === 'earth') maxElevM = 75.0;

  const maxElevUnits = (maxElevM / 1000.0) / RAD;
  const noise = _createPerlin(777);

  for (let i = 0; i < pos.count; i++) {
    const u0 = base.getX(i);
    const v0 = base.getY(i);
    const rNorm = 1.0 - v0; // 0 di kaki, 1 di rim luar
    const phi = u0 * Math.PI * 2.0;

    // Distribusi non-linear konsentris
    const thetaWarped = Math.pow(rNorm, 2.0) * patchRad;
    const distM = thetaWarped * (bodyRadiusKm * 1000.0);

    const sinT = Math.sin(thetaWarped);
    const cosT = Math.cos(thetaWarped);

    let vx = -rUnits * Math.cos(phi) * sinT;
    let vy =  rUnits * cosT;
    let vz =  rUnits * Math.sin(phi) * sinT;

    if (maxElevM > 0.0 && distM > 12.0) {
      const inFade = Math.min(1.0, (distM - 12.0) / 60.0);
      const outFade = rNorm > 0.85 ? Math.max(0.0, (1.0 - rNorm) / 0.15) : 1.0;
      const fade = inFade * outFade;

      const fx = Math.sin(phi) * distM;
      const fy = Math.cos(phi) * distM;

      let h = noise(fx * 0.0008, fy * 0.0008) * 0.55 +
              noise(fx * 0.003, fy * 0.003) * 0.30 +
              noise(fx * 0.012, fy * 0.012) * 0.15;

      if (surfaceType === 'regolith') {
        const cr1 = Math.sin(fx * 0.004) * Math.cos(fy * 0.004);
        const cr2 = Math.sin(fx * 0.016 + 1.2) * Math.cos(fy * 0.016 + 0.8);
        h += Math.abs(cr1) * 0.35 + Math.abs(cr2) * 0.20;
      } else if (surfaceType === 'mars') {
        const dune = Math.sin(fx * 0.006 + Math.sin(fy * 0.002) * 2.0);
        h += dune * 0.30;
      } else if (surfaceType === 'ice') {
        const line = Math.abs(Math.sin(fx * 0.005 + fy * 0.004));
        h += (line < 0.12 ? 0.35 : 0.0);
      }

      const disp = h * maxElevUnits * fade;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1.0;
      vx += (vx / len) * disp;
      vy += (vy / len) * disp;
      vz += (vz / len) * disp;
    }

    pos.setXYZ(i, vx, vy, vz);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/* =======================================================================
   MATERIAL PATCH PERMUKAAN
   ======================================================================= */
function makeSurfacePatchMaterial(body) {
  let map = null, normalMap = null;
  const mm = body && body.mesh ? body.mesh.material : null;
  if (mm) {
    if (mm.uniforms) {
      const u = mm.uniforms;
      if (u.uDay && u.uDay.value) map = u.uDay.value;
      else if (u.uMap && u.uMap.value) map = u.uMap.value;
    } else {
      if (mm.map) map = mm.map;
    }
  }

  let mapKey = body ? body.key : '';
  if (body && body.isMoon) {
    if (typeof MOON_TEX_KEY !== 'undefined' && MOON_TEX_KEY[body.name]) {
      mapKey = MOON_TEX_KEY[body.name];
    } else {
      mapKey = (body.name || '').toLowerCase();
    }
  } else if (body && (body.key === 'earth' || body.name === 'Bumi')) {
    mapKey = 'earth';
  }

  if (typeof TEX !== 'undefined' && TEX[mapKey]) {
    if (!map && TEX[mapKey].map) map = TEX[mapKey].map;
    if (TEX[mapKey].normal) normalMap = TEX[mapKey].normal;
  }

  if (!map) map = getDummyTexture();

  const surfaceType = getSurfaceTypeForBody(body);
  const pbr = generateSurfacePBR(surfaceType);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMacroMap:        { value: map },
      uMacroNormalMap:  { value: normalMap || getDummyTexture() },
      uHasMacroNormal:  { value: normalMap ? 1.0 : 0.0 },
      uDetailMap:       { value: pbr.detailTex },
      uNormalMap:       { value: pbr.normalTex },
      uTileMap:         { value: getDummyTexture() },
      uTileWeight:      { value: 0.0 },
      // Rect tile (diisi SURFACE_DETAIL saat tekstur HD terpasang)
      uTileUvMin:       { value: new THREE.Vector2(0, 0) },
      uTileUvSize:      { value: new THREE.Vector2(1, 1) },
      uSunDir:          { value: new THREE.Vector3(1, 0, 0) },
      uSunColor:        { value: new THREE.Color(1.0, 0.95, 0.85) },
      uSunIntensity:    { value: 1.25 },
      uAmbientColor:    { value: new THREE.Color(0.20, 0.25, 0.35) },
      uHorizonFogColor: { value: new THREE.Color(0.69, 0.83, 0.98) },
      uFogDensity:      { value: 0.04 },
      uRoughness:       { value: pbr.roughness },
      uOppositionSurge: { value: pbr.opposition },
      uIsWater:         { value: surfaceType === 'earth' ? 1.0 : 0.0 },
      uTime:            { value: 0.0 },
    },
    vertexShader: SURFACE_PATCH_VERT,
    fragmentShader: SURFACE_PATCH_FRAG,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });

  mat.userData = { isPatch: true, surfaceType };
  return mat;
}

/* =======================================================================
   BANGUN PATCH PERMUKAAN
   ======================================================================= */
function buildSurfacePatch(body) {
  if (!body) return null;

  const R = (body.realRadiusKm || body.radiusKm * RAD);
  const rUnits = R / RAD;
  const elevM = (typeof SURFACE_VIEW !== 'undefined') ? (SURFACE_VIEW.elev || 50) : 50;
  const fovDeg = (typeof SURFACE_VIEW !== 'undefined') ? (SURFACE_VIEW.fov || 50) : 50;
  const patchDeg = surfacePatchRadiusDeg(R, elevM, fovDeg);
  const patchRad = patchDeg * DEG;

  const geo = new THREE.SphereGeometry(
    rUnits, SURFACE_PATCH_SEG, SURFACE_PATCH_SEG,
    0, Math.PI * 2,
    0, patchRad
  );

  const surfaceType = getSurfaceTypeForBody(body);
  const mat = makeSurfacePatchMaterial(body);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;

  const lat0 = (typeof SURFACE_VIEW !== 'undefined') ? SURFACE_VIEW.lat : 0;
  const lon0 = (typeof SURFACE_VIEW !== 'undefined') ? SURFACE_VIEW.lon : 0;
  aimSurfacePatchMesh(mesh, lat0, lon0);
  applyPatchUV(mesh, lat0, lon0);
  applyPatchTerrainElevation(geo, surfaceType, R);

  if (body.spin) {
    body.spin.add(mesh);
  } else {
    body.group.add(mesh);
  }

  if (body.mesh) body.mesh.visible = false;

  surfacePatch = mesh;
  surfacePatchBody = body;
  return mesh;
}

function aimSurfacePatchMesh(mesh, lat, lon) {
  const latR = lat * DEG, lonR = lon * DEG;
  const cl = Math.cos(latR);
  const target = new THREE.Vector3(cl * Math.cos(lonR), Math.sin(latR), -cl * Math.sin(lonR)).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(up, target);
}

function aimSurfacePatch(body, lat, lon) {
  if (!surfacePatch || !body) return;
  aimSurfacePatchMesh(surfacePatch, lat, lon);
}

/* =======================================================================
   PERBARUI PATCH PERMUKAAN TIAP FRAME SAAT POV
   -----------------------------------------------------------------------
   AUDIT 29 Sep — PERBAIKAN "PERMUKAAN BERGETAR":
   Signature lama memakai Math.round(fovDeg). Saat pengguna men-zoom, fov
   berubah terus-menerus; setiap kali menembus batas pembulatan (mis. 50,49
   -> 50,50) signature berubah -> removeSurfacePatch() + buildSurfacePatch()
   dijalankan ulang (geometri 32.768 segitiga + regenerasi tekstur PBR
   Perlin/Sobel). Patch lama lenyap satu frame lalu muncul kembali dengan
   posisi/UV baru -> terlihat BERGETAR dan berkedip.

   Sekarang dibedakan tegas:
     - IDENTITAS PATCH (yang benar-benar butuh geometri baru): kunci benda,
       elevasi (dibulatkan 5 m), dan posisi geografis (4 desimal).
     - fov TIDAK masuk identitas: zoom hanya mengubah CAKUPAN patch, dan
       cakupan ditangani surfacePatchRadiusDeg -> sudah diperhitungkan saat
       build. Mengubah fov tidak memerlukan geometri baru; patch lama tetap
       dipakai dan hanya UV/tekstur tile yang menyesuaikan.
   ======================================================================= */
function updateSurfacePatch(body, lat, lon) {
  if (!body) { removeSurfacePatch(); return; }
  const key = body.key || body.name;
  const elevM = (typeof SURFACE_VIEW !== 'undefined') ? (SURFACE_VIEW.elev || 50) : 50;
  const elevQ = Math.round(elevM / 5) * 5;   /* kuantisasi 5 m: redaman zoom halus */

  const sig = key + '|' + elevQ + '|' + lat.toFixed(4) + '|' + lon.toFixed(4);
  if (sig !== surfacePatchKey) {
    removeSurfacePatch();
    buildSurfacePatch(body);
    surfacePatchKey = sig;
  }
  aimSurfacePatch(body, lat, lon);
  if (surfacePatch) surfacePatch.visible = true;

  const obs = (typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.computeObserver)
    ? SURFACE_VIEW.computeObserver(body) : null;
  if (obs) updateSurfacePatchLighting(obs);
}

/* =======================================================================
   PENCAHAYAAN PATCH — FISIKAL SESUAI POSISI MATAHARI & ATMOSFER
   ======================================================================= */
function updateSurfacePatchLighting(obs) {
  if (!surfacePatch || !surfacePatch.material || !surfacePatch.material.uniforms) return;
  const u = surfacePatch.material.uniforms;

  const body = surfacePatchBody || (typeof SURFACE_VIEW !== 'undefined' ? SURFACE_VIEW.currentBody() : null);
  let altDeg = 0;
  if (obs && typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.sunAltitudeDeg) {
    altDeg = SURFACE_VIEW.sunAltitudeDeg(obs);
  }

  // Ambil info atmosfer astronomis dari 23-surface-sky.js
  let atmoInfo = {
    hasAtmosphere: false,
    horizonFogColor: new THREE.Color(0x000000),
    ambientColor: new THREE.Color(0x0a0c10),
    sunColor: new THREE.Color(0xffffff),
    fogDensity: 0.0,
    sunIntensity: 1.25,
  };
  if (typeof getSurfaceAtmosphereInfo === 'function') {
    atmoInfo = getSurfaceAtmosphereInfo(body, altDeg);
  }

  // Arah Matahari dalam koordinat dunia
  const sun = (typeof findBody === 'function') ? findBody('sun') : null;
  if (sun && sun.absPos && obs.pos) {
    u.uSunDir.value.copy(sun.absPos).sub(obs.pos).normalize();
  }

  // Intensitas Matahari berdasarkan tinggi di atas horizon
  const dayness = Math.max(0, Math.min(1, (altDeg + 6) / 18));
  const sunInt = atmoInfo.sunIntensity * dayness;

  u.uSunColor.value.copy(atmoInfo.sunColor);
  u.uSunIntensity.value = sunInt;
  u.uAmbientColor.value.copy(atmoInfo.ambientColor);
  u.uHorizonFogColor.value.copy(atmoInfo.horizonFogColor);
  u.uFogDensity.value = atmoInfo.fogDensity;

  // CATATAN (audit 29 Sep): sebelumnya di sini ada
  //     u.uTime.value = performance.now() * 0.001;
  // padahal `uTime` TIDAK PERNAH dipakai di dalam shader (hanya
  // dideklarasikan). Akibatnya Three.js mengunggah uniform tiap frame tanpa
  // efek visual apa pun — beban sia-sia, dan pada sebagian driver WebGL
  // pembaruan uniform tiap frame dapat memicu revalidasi program shader
  // yang terlihat sebagai kedipan halus. Sudah dihapus.
  // Uniform uTime tetap ada di deklarasi shader agar tidak perlu mengubah
  // daftar uniform (menghindari recompile), tetapi kini nilainya konstan 0.
}

function setPovLighting(on, sunAltDeg) {
  // Kompatibilitas helper
}

function repatchUV(spanDeg) {
  if (!surfacePatch) return;
  const lat0 = (typeof SURFACE_VIEW !== 'undefined') ? SURFACE_VIEW.lat : 0;
  const lon0 = (typeof SURFACE_VIEW !== 'undefined') ? SURFACE_VIEW.lon : 0;
  applyPatchUV(surfacePatch, lat0, lon0, spanDeg || null);
}

function removeSurfacePatch() {
  if (surfacePatch) {
    if (surfacePatch.parent) surfacePatch.parent.remove(surfacePatch);
    if (surfacePatch.geometry) surfacePatch.geometry.dispose();
    if (surfacePatch.material) surfacePatch.material.dispose();
    surfacePatch = null;
  }
  if (surfacePatchBody && surfacePatchBody.mesh) {
    surfacePatchBody.mesh.visible = true;
  }
  surfacePatchBody = null;
  surfacePatchKey = '';
}

function hideSurfacePatch() {
  if (surfacePatch) surfacePatch.visible = false;
}
