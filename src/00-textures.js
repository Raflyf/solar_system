/* =======================================================================
   Tata Surya 3D — Mesin tekstur prosedural HD (tanpa file eksternal)
   Semua tekstur planet dibuat langsung di canvas saat runtime.
   Resolusi: 2048x1024 untuk planet/satelit besar, 4096x2048 untuk Bumi/Matahari
   ======================================================================= */

/* ---------- util matematika ---------- */
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smoothstep(a, b, x) { const t = clamp01((x - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- value noise periodik (mulus di arah U / horizontal) ---------- */
function hash2i(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, y, period, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const p = period > 0 ? period : 1;
  const x0 = ((ix % p) + p) % p;
  const x1 = (((ix + 1) % p) + p) % p;
  const a = hash2i(x0, iy, seed), b = hash2i(x1, iy, seed);
  const c = hash2i(x0, iy + 1, seed), d = hash2i(x1, iy + 1, seed);
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

function fbm(x, y, period, seed, oct) {
  oct = oct || 5;
  let amp = 0.5, sum = 0, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, period * f, seed + i * 131);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/* ---------- palet warna (format: pos, r, g, b, ...) ---------- */
function palInto(p, t, out) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 0; i <= p.length - 8; i += 4) {
    if (t >= p[i] && t <= p[i + 4]) {
      const k = (t - p[i]) / (p[i + 4] - p[i] || 1e-6);
      out[0] = p[i + 1] + (p[i + 5] - p[i + 1]) * k;
      out[1] = p[i + 2] + (p[i + 6] - p[i + 2]) * k;
      out[2] = p[i + 3] + (p[i + 7] - p[i + 3]) * k;
      out[3] = 255;                     /* selalu legap: kanal alfa tidak boleh bocor */
      return out;
    }
  }
  const n = p.length - 4;
  out[0] = p[n + 1]; out[1] = p[n + 2]; out[2] = p[n + 3];
  out[3] = 255;
  return out;
}

/* ---------- pembuat canvas ---------- */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const OUT = [0, 0, 0, 255];

function buildSurfaceTexture(cfg, bodyName) {
  /* Tingkatkan resolusi procedural HD untuk planet besar/luar */
  let w = cfg.w || 2048;
  let h = cfg.h || 1024;
  if (['uranus', 'neptune', 'triton', 'titania'].includes(bodyName?.toLowerCase())) {
    w = 2048; h = 1024;
  }
  if (['earth', 'sun', 'jupiter', 'saturn', 'mars', 'venus', 'mercury'].includes(bodyName?.toLowerCase())) {
    w = 4096; h = 2048;
  }
  const seed = cfg.seed;
  const P = cfg.period || 12;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const shade = cfg.shade;
  const local = [0, 0, 0, 255];      /* penampung per-titik: tidak boleh global,
                                        agar kanal alfa tidak tertimpa fungsi lain */
  for (let j = 0; j < h; j++) {
    const v = h > 1 ? j / (h - 1) : 0;
    const lat = (0.5 - v) * Math.PI;   /* +pi/2 = kutub utara (baris atas) */
    const ny = v * P * 0.5;
    for (let i = 0; i < w; i++) {
      const u = i / w;
      const nx = u * P;
      const out = shade(nx, ny, lat, u, v, P, seed);
      const k = (j * w + i) * 4;
      data[k] = out[0];
      data[k + 1] = out[1];
      data[k + 2] = out[2];
      /* tekstur permukaan selalu legap; hanya tekstur awan yang boleh transparan */
      data[k + 3] = cfg.transparent && out.length > 3 ? out[3] : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (cfg.decorate) cfg.decorate(ctx, w, h, seed);
  return canvas;
}

/* ---------- kawah (dipakai Merkurius, Bulan, Mars) ---------- */
function drawCraters(ctx, w, h, count, seed, min, max, strength) {
  const rnd = mulberry32(seed);
  const s = (w / 1024) * (strength || 1);
  for (let n = 0; n < count; n++) {
    const cx = rnd() * w;
    const cy = h * (0.07 + rnd() * 0.86);
    const r = (min + Math.pow(rnd(), 2.3) * (max - min)) * s;
    if (r < 0.6) continue;
    for (let dx = -1; dx <= 1; dx++) {           /* gambar salinan agar mulus di sambungan U */
      const x = cx + dx * w;
      if (x < -r * 1.5 || x > w + r * 1.5) continue;
      const g = ctx.createRadialGradient(x, cy, r * 0.05, x, cy, r);
      g.addColorStop(0.0, 'rgba(0,0,0,0.34)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.13)');
      g.addColorStop(0.76, 'rgba(255,255,255,0.26)');
      g.addColorStop(1.0, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBlob(ctx, w, h, cx, cy, rx, ry, color, alpha, seed) {
  const rnd = mulberry32(seed);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, 'rgba(' + color + ',' + alpha + ')');
  g.addColorStop(0.55, 'rgba(' + color + ',' + (alpha * 0.55).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(' + color + ',0)');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / Math.max(rx, ry));
  ctx.translate(-cx, -cy);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return rnd;
}

/* =======================================================================
   Fungsi shade per benda langit
   ======================================================================= */

const PAL_MERCURY = [0, 92, 88, 84, 0.45, 138, 132, 124, 0.75, 172, 166, 156, 1, 205, 199, 190];
const PAL_MOON = [0, 58, 58, 60, 0.4, 112, 110, 108, 0.7, 158, 156, 152, 1, 196, 194, 190];
const PAL_VENUS = [0, 168, 122, 62, 0.35, 206, 166, 96, 0.62, 232, 205, 142, 0.85, 246, 228, 178, 1, 252, 244, 214];
const PAL_MARS = [0, 96, 46, 26, 0.3, 138, 68, 38, 0.58, 176, 96, 56, 0.82, 202, 126, 82, 1, 226, 164, 122];
const PAL_JUPITER = [0, 122, 84, 60, 0.18, 168, 124, 86, 0.36, 214, 182, 138, 0.52, 240, 224, 196, 0.68, 250, 242, 226, 0.84, 208, 176, 132, 1, 150, 108, 76];
const PAL_SATURN = [0, 150, 122, 80, 0.22, 186, 158, 108, 0.45, 214, 190, 142, 0.68, 232, 214, 172, 0.86, 242, 230, 196, 1, 250, 242, 218];
const PAL_URANUS = [0, 132, 194, 200, 0.45, 158, 214, 220, 0.72, 176, 226, 230, 1, 196, 238, 240];
const PAL_NEPTUNE = [0, 30, 62, 148, 0.4, 46, 88, 186, 0.7, 66, 116, 210, 1, 108, 158, 232];
const PAL_SUN = [0, 226, 108, 18, 0.35, 250, 168, 44, 0.62, 255, 214, 96, 0.85, 255, 240, 178, 1, 255, 252, 232];

function shadeMercury(nx, ny, lat, u, v, P, seed) {
  const n = fbm(nx * 1.5, ny * 1.5, P, seed, 5);
  const m = fbm(nx * 6.0, ny * 6.0, P, seed + 91, 3);
  palInto(PAL_MERCURY, 0.22 + n * 0.62 + (m - 0.5) * 0.22, OUT);
  return OUT;
}

function shadeMoon(nx, ny, lat, u, v, P, seed) {
  const n = fbm(nx * 1.3, ny * 1.3, P, seed, 5);
  const maria = fbm(nx * 2.2, ny * 2.2, P, seed + 55, 3);
  let t = 0.28 + n * 0.6;
  if (maria > 0.56) t -= (maria - 0.56) * 1.5;   /* mare gelap */
  palInto(PAL_MOON, t, OUT);
  return OUT;
}

function shadeVenus(nx, ny, lat, u, v, P, seed) {
  const n = fbm(nx * 3.4, ny * 1.05, P, seed, 5);
  const m = fbm(nx * 9.0, ny * 3.2, P, seed + 41, 3);
  let t = 0.3 + n * 0.5 + (m - 0.5) * 0.22;
  t += smoothstep(0.6, 1.0, Math.abs(lat) / (Math.PI * 0.5)) * 0.2;
  palInto(PAL_VENUS, t, OUT);
  return OUT;
}

function shadeEarth(nx, ny, lat, u, v, P, seed) {
  /* benua: fbm dengan pelengkungan domain (warp) agar bentuknya organik */
  const warp = (fbm(nx * 0.9, ny * 1.6, P * 2, seed + 7, 3) - 0.5) * 2.4;
  const e = fbm(nx + warp, ny + warp * 0.55, P, seed, 5);
  const detail = fbm(nx * 4.5, ny * 4.5, P, seed + 23, 3);
  const absLat = Math.abs(lat) / (Math.PI * 0.5);

  if (e < 0.505) {
    /* laut */
    const depth = smoothstep(0.505, 0.2, e);
    OUT[0] = lerp(24, 6, depth) + detail * 10;
    OUT[1] = lerp(96, 30, depth) + detail * 16;
    OUT[2] = lerp(158, 74, depth) + detail * 22;
  } else {
    const hgt = smoothstep(0.505, 0.78, e);
    let r, g, b;
    if (hgt < 0.06) { r = 198; g = 178; b = 126; }
    else if (hgt < 0.34) { r = lerp(52, 74, hgt * 3); g = lerp(112, 122, hgt * 3); b = lerp(54, 62, hgt * 3); }
    else if (hgt < 0.62) { r = lerp(96, 132, (hgt - 0.34) * 3.6); g = lerp(112, 108, (hgt - 0.34) * 3.6); b = lerp(66, 78, (hgt - 0.34) * 3.6); }
    else { r = 186; g = 186; b = 190; }
    const dryness = smoothstep(0.42, 0.72, fbm(nx * 2.4, ny * 2.4, P, seed + 71, 3)) *
                    (1 - smoothstep(0.5, 0.75, absLat));
    r = lerp(r, 196, dryness * 0.7); g = lerp(g, 158, dryness * 0.7); b = lerp(b, 96, dryness * 0.7);
    r += (detail - 0.5) * 22; g += (detail - 0.5) * 22; b += (detail - 0.5) * 18;
    OUT[0] = r; OUT[1] = g; OUT[2] = b;
  }
  /* tudung es kutub */
  const ice = smoothstep(0.80, 0.93, absLat + (detail - 0.5) * 0.12);
  if (ice > 0) {
    OUT[0] = lerp(OUT[0], 246, ice); OUT[1] = lerp(OUT[1], 250, ice); OUT[2] = lerp(OUT[2], 255, ice);
  }
  return OUT;
}

function shadeMars(nx, ny, lat, u, v, P, seed) {
  const n = fbm(nx * 2.1, ny * 2.1, P, seed, 5);
  const dark = fbm(nx * 3.6, ny * 3.6, P, seed + 17, 4);
  const fine = fbm(nx * 12, ny * 12, P, seed + 5, 2);
  let t = 0.24 + n * 0.6 + (fine - 0.5) * 0.14;
  if (dark > 0.57) t -= (dark - 0.57) * 1.25;
  palInto(PAL_MARS, t, OUT);
  const absLat = Math.abs(lat) / (Math.PI * 0.5);
  const cap = smoothstep(0.88, 0.97, absLat + (dark - 0.5) * 0.06);
  if (cap > 0) { OUT[0] = lerp(OUT[0], 250, cap); OUT[1] = lerp(OUT[1], 252, cap); OUT[2] = lerp(OUT[2], 255, cap); }
  return OUT;
}

function shadeJupiter(nx, ny, lat, u, v, P, seed) {
  const turb = fbm(nx * 1.1, ny * 3.2, P, seed + 3, 5);
  const swirl = fbm(nx * 4.5, ny * 6.5, P, seed + 61, 3);
  const band = Math.sin(lat * 9.0 + (turb - 0.5) * 3.4) * 0.5 + 0.5;
  const band2 = Math.sin(lat * 24.0 + (swirl - 0.5) * 2.2) * 0.5 + 0.5;
  let t = band * 0.6 + band2 * 0.4;
  t = clamp01(0.12 + t * 0.86 + (turb - 0.5) * 0.16);
  palInto(PAL_JUPITER, t, OUT);
  return OUT;
}

function shadeSaturn(nx, ny, lat, u, v, P, seed) {
  const turb = fbm(nx * 0.9, ny * 2.6, P, seed + 9, 4);
  const turb2 = fbm(nx * 2.4, ny * 5.0, P, seed + 31, 3);
  /* pita utama + pita halus; amplitudo dinaikkan agar jelas terlihat */
  const band = Math.sin(lat * 11.0 + (turb - 0.5) * 2.2) * 0.5 + 0.5;
  const band2 = Math.sin(lat * 27.0 + (turb2 - 0.5) * 1.6) * 0.5 + 0.5;
  let t = clamp01(0.22 + band * 0.52 + band2 * 0.20 + (turb - 0.5) * 0.18);
  palInto(PAL_SATURN, t, OUT);
  return OUT;
}

function shadeUranus(nx, ny, lat, u, v, P, seed) {
  const turb = fbm(nx * 1.4, ny * 2.0, P, seed + 13, 3);
  const band = Math.sin(lat * 7.0 + (turb - 0.5) * 0.8) * 0.5 + 0.5;
  let t = clamp01(0.42 + band * 0.34 + (turb - 0.5) * 0.14);
  palInto(PAL_URANUS, t, OUT);
  return OUT;
}

function shadeNeptune(nx, ny, lat, u, v, P, seed) {
  const turb = fbm(nx * 1.3, ny * 2.4, P, seed + 29, 4);
  const band = Math.sin(lat * 8.0 + (turb - 0.5) * 2.0) * 0.5 + 0.5;
  const streak = fbm(nx * 5.0, ny * 8.0, P, seed + 77, 3);
  let t = clamp01(0.34 + band * 0.46 + (turb - 0.5) * 0.18);
  palInto(PAL_NEPTUNE, t, OUT);
  if (streak > 0.68) { const k = (streak - 0.68) * 2.4; OUT[0] = lerp(OUT[0], 226, k); OUT[1] = lerp(OUT[1], 236, k); OUT[2] = lerp(OUT[2], 250, k); }
  return OUT;
}

function shadeSun(nx, ny, lat, u, v, P, seed) {
  const gran = fbm(nx * 7.0, ny * 7.0, P, seed + 4, 4);
  const big = fbm(nx * 2.0, ny * 2.0, P, seed + 88, 3);
  let t = clamp01(0.3 + gran * 0.5 + (big - 0.5) * 0.4);
  palInto(PAL_SUN, t, OUT);
  return OUT;
}

/* ---------- awan Bumi (RGBA, hanya kanal alpha yang penting) ---------- */
function shadeEarthCloud(nx, ny, lat, u, v, P, seed) {
  const warp = (fbm(nx * 1.1, ny * 2.0, P * 2, seed + 5, 3) - 0.5) * 1.8;
  const c = fbm(nx * 1.6 + warp, ny * 2.6 + warp * 0.6, P, seed, 5);
  const band = 0.55 + 0.18 * Math.cos(lat * 6.0);       /* lebih banyak awan di ekuator & lintang sedang */
  const a = smoothstep(band, band + 0.22, c);
  OUT[0] = 255; OUT[1] = 255; OUT[2] = 255;
  OUT[3] = Math.round(clamp01(a * 0.95) * 255);
  return OUT;
}

/* ---------- tekstur cincin (profil radial) ---------- */
function makeRingTexture(w, h, seed, opt) {
  opt = opt || {};
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const gauss = (x, mu, sg) => Math.exp(-((x - mu) * (x - mu)) / (2 * sg * sg));
  const innerFade = opt.innerFade === undefined ? 0.035 : opt.innerFade;
  const outerFade = opt.outerFade === undefined ? 0.05 : opt.outerFade;
  const baseCol = opt.color || [236, 224, 196];
  const darkCol = opt.darkColor || [176, 152, 116];
  for (let i = 0; i < w; i++) {
    const t = i / (w - 1);
    const n1 = vnoise(t * 150, 0.5, 4096, seed);
    const n2 = vnoise(t * 460, 3.5, 4096, seed + 3);
    const n3 = vnoise(t * 30, 7.5, 4096, seed + 9);
    /* kepadatan dasar tinggi: cincin harus terlihat padat, bukan garis tipis */
    let alpha = 0.82 + 0.18 * n3;
    alpha *= (1 - 0.93 * gauss(t, opt.cassini === undefined ? 0.655 : opt.cassini, 0.020));
    alpha *= (1 - 0.66 * gauss(t, 0.874, 0.006));
    alpha *= (1 - 0.45 * gauss(t, 0.30, 0.028));
    alpha *= smoothstep(0, innerFade, t) * (1 - smoothstep(1 - outerFade, 1, t));
    alpha *= 0.88 + 0.12 * n1;
    if (opt.faint) alpha *= 0.5;
    /* kecerahan warna: terang di bagian luar, lebih gelap di celah */
    const b = 0.86 + 0.14 * n2;
    const mixk = clamp01(0.18 + n1 * 0.7);
    const r = lerp(baseCol[0], darkCol[0], mixk) * b;
    const g = lerp(baseCol[1], darkCol[1], mixk) * b;
    const bl = lerp(baseCol[2], darkCol[2], mixk) * b;
    const a8 = Math.round(clamp01(alpha) * 255);
    for (let j = 0; j < h; j++) {
      const k = (j * w + i) * 4;
      d[k] = r; d[k + 1] = g; d[k + 2] = bl; d[k + 3] = a8;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/* ---------- latar langit: nebula + pita Bima Sakti (tanpa bintang) ---------- */
function makeSkyCanvas(w, h, seed) {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const P = 24;
  for (let j = 0; j < h; j++) {
    const v = j / (h - 1);
    for (let i = 0; i < w; i++) {
      const u = i / w;
      const nx = u * P, ny = v * P * 0.5;
      /* pita galaksi organik: pusat & lebar bergelombang, tidak berupa garis lurus.
         Nyquist: jumlah gelombang harus < setengah resolusi tekstur (v beresolusi
         rendah karena bola 2048x1024) agar tidak muncul garis-garis (aliasing). */
      const bandC = 0.52
        + 0.055 * Math.sin(u * Math.PI * 2 * 1.0 + 0.7)
        + 0.020 * Math.sin(u * Math.PI * 2 * 1.7 + 2.1);
      const dist = Math.abs(v - bandC);
      const wob = fbm(nx * 1.6, ny * 0.5, P, seed + 12, 4);
      const bandW = 0.060 + 0.055 * wob;
      const band = Math.exp(-(dist * dist) / (2 * bandW * bandW));
      const neb = fbm(nx * 1.2, ny * 0.6, P, seed, 5);
      const dust = fbm(nx * 2.4, ny * 1.2, P, seed + 40, 4);
      const glow = band * (0.35 + 0.95 * neb) * (0.55 + 0.7 * (1 - Math.abs(dist) * 3.0));
      /* jauh lebih redup: langit tidak boleh lebih terang dari cincin planet */
      const r = 2.5 + glow * 26 + neb * 4 + (1 - dust) * band * 11;
      const g = 3.5 + glow * 25 + neb * 4.5 + band * 8;
      const b = 7 + glow * 38 + neb * 9 + band * 17;
      const k = (j * w + i) * 4;
      d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/* ---------- titik bintang kecil (untuk THREE.Points) ---------- */
function makeDiscCanvas(size) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const c0 = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c0 + 0.5) / c0, dy = (y - c0 + 0.5) / c0;
      const r = Math.sqrt(dx * dx + dy * dy);
      /* piringan padat di tengah, tepi lembut tipis */
      const a = clamp01((1 - r) * 9.0);
      const k = (y * size + x) * 4;
      d[k] = 255; d[k + 1] = 255; d[k + 2] = 255;
      d[k + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ---------- cincin cahaya (halo penanda): kosong di tengah agar warna
   inti penanda tidak tenggelam menjadi putih ---------- */
function makeRingHaloCanvas(size) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const c0 = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c0 + 0.5) / c0, dy = (y - c0 + 0.5) / c0;
      const r = Math.sqrt(dx * dx + dy * dy);
      /* puncak pada r = 0,62; nol di tengah dan di tepi */
      const t = (r - 0.62) / 0.30;
      const a = Math.exp(-t * t * 1.9) * (1 - clamp01((r - 0.92) * 8)) * clamp01(r * 4.5);
      const k = (y * size + x) * 4;
      d[k] = 255; d[k + 1] = 255; d[k + 2] = 255;
      d[k + 3] = Math.round(clamp01(a) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function makeStarDotCanvas(size) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const c0 = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c0 + 0.5) / c0, dy = (y - c0 + 0.5) / c0;
      const r = Math.sqrt(dx * dx + dy * dy);
      const a = Math.pow(clamp01(1 - r), 2.0);
      const k = (y * size + x) * 4;
      d[k] = 255; d[k + 1] = 255; d[k + 2] = 255;
      d[k + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ---------- sprite cahaya (matahari / halo) ---------- */
function makeGlowCanvas(size, inner, outer, power) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const c0 = size / 2;
  const ic = inner || [255, 244, 214];
  const oc = outer || [255, 150, 40];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c0) / c0, dy = (y - c0) / c0;
      const r = Math.sqrt(dx * dx + dy * dy);
      let a = Math.pow(clamp01(1 - r), power || 2.2);
      const mixk = clamp01(r * 1.15);
      const k = (y * size + x) * 4;
      d[k] = lerp(ic[0], oc[0], mixk);
      d[k + 1] = lerp(ic[1], oc[1], mixk);
      d[k + 2] = lerp(ic[2], oc[2], mixk);
      d[k + 3] = Math.round(clamp01(a) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
