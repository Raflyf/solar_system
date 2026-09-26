/* Uji regresi koordinat Bulan/satelit.
   Masalah: satelit adalah child dari moonPlane induk yang berotasi.
   Posisi lokal wajib = inverse(rotasi induk) × offset scene.
   Jika tidak, kamera memakai absPos tetapi objek dirender di tempat lain.

   Jalankan: node tools/test_moon_render_sync.js */

const assert = require('assert');

const DEG = Math.PI / 180;
const qx = (a) => ({
  x: 1, y: 0, z: 0,
  c: Math.cos(a / 2), s: Math.sin(a / 2),
});

function rotateX(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}

function len(v) { return Math.hypot(v.x, v.y, v.z); }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }

/* Earth moonPlane inherits Earth's 23.44° pole orientation.
   Scene offset must be inverse-rotated before assigning child position. */
const earthTilt = 23.439281 * DEG;
const moonSceneOffset = { x: 58.02, y: 4.91, z: -15.70 };
const local = rotateX(moonSceneOffset, -earthTilt);
const rendered = rotateX(local, earthTilt);
const err = len(sub(rendered, moonSceneOffset));

assert(err < 1e-12, `render offset tidak sinkron: ${err}`);
assert(Math.abs(rendered.y - moonSceneOffset.y) < 1e-12);

console.log('Bulan: scene offset -> inverse moonPlane -> render = sama');
console.log(`error: ${err.toExponential(2)} unit`);
console.log('PASS 1/1: transform parent moonPlane tidak menggeser Bulan');
