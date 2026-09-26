/* Bandingkan posisi planet dari perhitungan aplikasi (15-ephemeris.js)
   dengan data JPL Horizons resmi (_horizons_ref.json).
   Jalankan: node tools/compare_horizons.js [tanggal] */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');

const ref = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_horizons_ref.json'), 'utf8'));
const dateStr = ref.date;

/* stub THREE minimal */
const THREE = {
  MathUtils: { degToRad: (d) => d * Math.PI / 180, radToDeg: (r) => r * 180 / Math.PI },
  Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} clone(){return new THREE.Vector3(this.x,this.y,this.z);} copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;} add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;} sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;} negate(){this.x=-this.x;this.y=-this.y;this.z=-this.z;return this;} multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;} length(){return Math.hypot(this.x,this.y,this.z);} normalize(){const L=this.length()||1;return this.multiplyScalar(1/L);} distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);} addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;} dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;} crossVectors(a,b){this.x=a.y*b.z-a.z*b.y;this.y=a.z*b.x-a.x*b.z;this.z=a.x*b.y-a.y*b.x;return this;} setLength(s){return this.normalize().multiplyScalar(s);} applyAxisAngle(){return this;} applyQuaternion(){return this;} },
  Quaternion: class { constructor(){} setFromAxisAngle(){return this;} copy(){return this;} },
  Color: class { constructor(){} },
};

const ephSrc = fs.readFileSync(path.join(SRC, '15-ephemeris.js'), 'utf8');
/* AU_KM direferensikan di dalam 15-ephemeris.js — harus di-pass sebagai
   parameter ke new Function(). Nilai resmi IAU 2012: 149.597.870,7 km */
const AU_KM = 149597870.7;
const mod = new Function('THREE', 'AU_KM', ephSrc + '\nreturn { planetPositionAU, dateToJD };')(THREE, AU_KM);

const jd = mod.dateToJD(new Date(dateStr + 'T00:00:00Z'));
console.log('Tanggal     :', dateStr, '00:00 UTC');
console.log('JD          :', jd.toFixed(5));
console.log('');

const NAMA = { mercury:'Merkurius', venus:'Venus', earth:'Bumi', mars:'Mars', jupiter:'Jupiter', saturn:'Saturnus', uranus:'Uranus', neptune:'Neptunus' };
let worstAng = 0, worstKm = 0, worstName = '';

console.log('planet     |  dX(AU)   dY(AU)   dZ(AU)  |  jarak selisih   | sudut');
console.log('-----------|----------------------------|------------------|-------');
for (const key of Object.keys(ref.pos)) {
  const r = ref.pos[key];                       // referensi JPL (AU, ekliptika J2000)
  const p = mod.planetPositionAU(key, jd);      // hitungan aplikasi (AU, ekliptika J2000)
  const dx = p.x - r[0], dy = p.y - r[1], dz = p.z - r[2];
  const dkm = Math.hypot(dx, dy, dz) * AU_KM;
  const rl = Math.hypot(r[0], r[1], r[2]);
  const pl = Math.hypot(p.x, p.y, p.z);
  const cosang = (r[0]*p.x + r[1]*p.y + r[2]*p.z) / (rl * pl);
  const ang = Math.acos(Math.max(-1, Math.min(1, cosang))) * 180 / Math.PI;
  console.log(`${NAMA[key].padEnd(10)} | ${dx>=0?' ':''}${dx.toFixed(6)} ${dy>=0?' ':''}${dy.toFixed(6)} ${dz>=0?' ':''}${dz.toFixed(6)} | ${dkm.toFixed(0).padStart(9)} km   | ${ang.toFixed(4)}°`);
  if (ang > worstAng) { worstAng = ang; worstName = NAMA[key]; }
  if (dkm > worstKm) worstKm = dkm;
}
console.log('');
console.log(`Selisih terbesar: ${worstName}, sudut ${worstAng.toFixed(4)}° (jarak ${worstKm.toFixed(0)} km)`);
