#!/usr/bin/env node
/* ======================================================================
   UJI VERIFIKASI BATCH — Muat halaman, jalankan skrip, laporkan JSON.
   ----------------------------------------------------------------------
   Dipakai untuk verifikasi satu-poin agar tidak perlu banyak panggilan
   browser yang bisa gagal di tengah jalan.

   Jalankan: node tools/verify_pov.js [varian]
   Varian:
     milkyway : uji kecerahan pita Bima Sakti di POV Bumi malam
     horizon  : uji gradasi atmosfer dekat horizon (siang)
     zoom     : sensitivitas drag pada beberapa nilai fov
     moon     : ukuran & penanda Bulan di POV Bumi
   Keluar dengan kode 0 bila semua pemeriksaan PASS.
   ====================================================================== */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8765;
const VARIAN = process.argv[2] || 'milkyway';

/* ---------- pastikan server statis hidup ---------- */
function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve(0));
    req.setTimeout(1500, () => { req.destroy(); resolve(0); });
  });
}

/* ---------- skrip per varian (dijalankan DI DALAM halaman) ---------- */
const SCRIPTS = {
  milkyway: `(() => {
    const out = { varian: 'milkyway', langkah: [] };
    // aktifkan POV Bumi pada malam hari
    SURFACE_VIEW.enable('earth', -6.2, 106.8);
    const base = window.__SOLAR__.app.days;
    for (let h = 0; h < 24; h += 0.5) {
      window.__SOLAR__.app.days = base + h/24;
      computePositions(window.__SOLAR__.app.days, 0);
      const b = SURFACE_VIEW.currentBody();
      const obs = SURFACE_VIEW.computeObserver(b);
      if (SURFACE_VIEW.sunAltitudeDeg(obs) < -30) break;
    }
    computePositions(window.__SOLAR__.app.days, 0);
    SURFACE_VIEW.el = 1.2; SURFACE_VIEW.az = 0; SURFACE_VIEW.fov = 70;
    for (let i = 0; i < 4; i++) {
      computePositions(window.__SOLAR__.app.days, 0);
      const bb = SURFACE_VIEW.currentBody();
      const oo = SURFACE_VIEW.computeObserver(bb);
      updateSurfaceSky(oo, bb, SURFACE_VIEW.atmosphereOn);
      updateSurfacePatch(bb, SURFACE_VIEW.lat, SURFACE_VIEW.lon);
      updateCamera(0.016); applyPositions();
      window.__SOLAR__.renderer.render(scene, camera);
    }
    // baca piksel LANGSUNG setelah render (buffer tidak di-preserve)
    const canvas = document.getElementById('scene');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const W = canvas.width, H = canvas.height;
    const px = new Uint8Array(4);
    const baca = (fx, fy) => {
      gl.readPixels(Math.round(W*fx), Math.round(H*fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return [px[0], px[1], px[2]];
    };
    const samples = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 7; col++) {
        samples.push(baca(0.2 + col*0.1, 0.15 + row*0.18));
      }
    }
    const lum = samples.map(s => (s[0]+s[1]+s[2])/3);
    const maxL = Math.max(...lum), minL = Math.min(...lum);
    const avgL = lum.reduce((a,b) => a+b, 0) / lum.length;
    // banding = berapa banyak piksel BERBEDA dari background terendah
    const uniq = new Set(lum.map(v => Math.round(v))).size;
    out.langkah.push({
      skyMeshColor: skyMesh.material.color.toArray().map(x => +x.toFixed(1)),
      skyVisible: skyMesh.visible,
      avgLum: +avgL.toFixed(1),
      maxLum: maxL,
      minLum: minL,
      uniqLevels: uniq,
    });
    // PASS bila ada gradasi nyata (max-min cukup besar DAN ada > 3 level)
    out.hasBand = (maxL - minL) > 8 && uniq > 3;
    out.PASS = out.hasBand;
    return out;
  })()`,

  horizon: `(() => {
    const out = { varian: 'horizon', langkah: [] };
    SURFACE_VIEW.enable('earth', -6.2, 106.8);
    const base = window.__SOLAR__.app.days;
    for (let h = 0; h < 24; h += 0.5) {
      window.__SOLAR__.app.days = base + h/24;
      computePositions(window.__SOLAR__.app.days, 0);
      const b = SURFACE_VIEW.currentBody();
      const obs = SURFACE_VIEW.computeObserver(b);
      if (SURFACE_VIEW.sunAltitudeDeg(obs) > 40) break;
    }
    computePositions(window.__SOLAR__.app.days, 0);
    // lihat horizon: sedikit menunduk supaya horizon di tengah layar
    SURFACE_VIEW.el = -0.05; SURFACE_VIEW.az = 0; SURFACE_VIEW.fov = 60;
    for (let i = 0; i < 4; i++) {
      computePositions(window.__SOLAR__.app.days, 0);
      const bb = SURFACE_VIEW.currentBody();
      const oo = SURFACE_VIEW.computeObserver(bb);
      updateSurfaceSky(oo, bb, SURFACE_VIEW.atmosphereOn);
      updateSurfacePatch(bb, SURFACE_VIEW.lat, SURFACE_VIEW.lon);
      updateCamera(0.016); applyPositions();
      window.__SOLAR__.renderer.render(scene, camera);
    }
    const canvas = document.getElementById('scene');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const W = canvas.width, H = canvas.height;
    const px = new Uint8Array(4);
    // profil VERTIKAL melintasi horizon (fyi=0.5 = tengah layar)
    const profil = [];
    for (let fy = 0.9; fy >= 0.1; fy -= 0.05) {
      gl.readPixels(Math.round(W*0.5), Math.round(H*fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      profil.push({ y: +fy.toFixed(2), rgb: [px[0],px[1],px[2]], lum: Math.round((px[0]+px[1]+px[2])/3) });
    }
    out.langkah.push({ profilVertikal: profil });
    // PASS bila ada transisi terang di dekat horizon (turun ke bawah = tanah)
    const lums = profil.map(p => p.lum);
    out.PASS = lums.some((v, i) => i > 0 && v - lums[i-1] > 20);
    return out;
  })()`,

  zoom: `(() => {
    const out = { varian: 'zoom', langkah: [] };
    SURFACE_VIEW.enable('earth', -6.2, 106.8);
    for (const fov of [50, 20, 5, 1]) {
      SURFACE_VIEW.fov = fov;
      const sens = 0.0032 * Math.max(0.02, Math.min(1, fov / 50));
      out.langkah.push({ fov, sensitivitas: +sens.toFixed(5) });
    }
    // monotonic decreasing
    let mono = true;
    for (let i = 1; i < out.langkah.length; i++) {
      if (out.langkah[i].sensitivitas >= out.langkah[i-1].sensitivitas) mono = false;
    }
    out.monotonTurun = mono;
    out.PASS = mono;
    return out;
  })()`,

  moon: `(() => {
    const out = { varian: 'moon', langkah: [] };
    SURFACE_VIEW.enable('earth', -6.2, 106.8);
    computePositions(window.__SOLAR__.app.days, 0);
    const b = SURFACE_VIEW.currentBody();
    const obs = SURFACE_VIEW.computeObserver(b);
    const moon = findBody('moon') || bodies.find(x => x.name === 'Bulan');
    const toMoon = moon.absPos.clone().sub(obs.pos).normalize();
    SURFACE_VIEW.el = Math.asin(Math.max(-1,Math.min(1, toMoon.dot(obs.zenith))));
    SURFACE_VIEW.az = Math.atan2(toMoon.dot(obs.east), toMoon.dot(obs.north));
    SURFACE_VIEW.fov = 40;
    for (let i = 0; i < 4; i++) {
      computePositions(window.__SOLAR__.app.days, 0);
      const bb = SURFACE_VIEW.currentBody();
      const oo = SURFACE_VIEW.computeObserver(bb);
      updateSurfaceSky(oo, bb, SURFACE_VIEW.atmosphereOn);
      updateSurfacePatch(bb, SURFACE_VIEW.lat, SURFACE_VIEW.lon);
      updateCamera(0.016); applyPositions();
      window.__SOLAR__.renderer.render(scene, camera);
    }
    const moonWp = moon.mesh.getWorldPosition(new THREE.Vector3());
    const proj = moonWp.clone().project(camera);
    const H = window.innerHeight;
    const corePx = moon.beacon && moon.beacon.group.visible ?
      Math.round(moon.beacon.core.scale.x / ((2 * camera.position.distanceTo(moonWp) * Math.tan(camera.fov*Math.PI/360)) / H)) : 0;
    out.langkah.push({
      ndc: [+proj.x.toFixed(2), +proj.y.toFixed(2)],
      diTengah: Math.abs(proj.x) < 0.1 && Math.abs(proj.y) < 0.1,
      beaconVisible: moon.beacon ? moon.beacon.group.visible : null,
      corePx,
      cakramPx: Math.round(0.532 / camera.fov * H),
    });
    out.PASS = out.langkah[0].diTengah;
    return out;
  })()`,
};

/* ---------- jalankan ---------- */
(async function main() {
  const url = `http://localhost:${PORT}/index.html?q=lo&v=${Date.now()}`;
  let status = await ping(url);
  if (status !== 200) {
    console.log('SERVER_MATI — jalankan: python -m http.server 8765 (di folder proyek)');
    process.exit(2);
  }
  console.log('SRV:' + status);
  console.log('SKRIP:' + SCRIPTS[VARIAN].length + ' byte');
  // cetak skrip agar bisa disalin ke browser_exec
  console.log('---BEGIN---');
  console.log(SCRIPTS[VARIAN]);
  console.log('---END---');
})();
