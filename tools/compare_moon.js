/* Bandingkan posisi Bulan dari aplikasi (moonPositionKm) dengan JPL Horizons.
   Referensi: _moon_ref.json (dibuat oleh tools/fetch_moon.py, ekuator J2000 km).
   Aplikasi memakai ekliptika J2000 — konversi dengan rotasi ε = 23,4392911°.
   Jalankan: node tools/compare_moon.js */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');

const THREE = {
  MathUtils: { degToRad: (d) => d * Math.PI / 180, radToDeg: (r) => r * 180 / Math.PI },
  Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} clone(){return new THREE.Vector3(this.x,this.y,this.z);} copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;} add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;} sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;} negate(){this.x=-this.x;this.y=-this.y;this.z=-this.z;return this;} multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;} length(){return Math.hypot(this.x,this.y,this.z);} normalize(){const L=this.length()||1;return this.multiplyScalar(1/L);} distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);} addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;} dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;} crossVectors(a,b){this.x=a.y*b.z-a.z*b.y;this.y=a.z*b.x-a.x*b.z;this.z=a.x*b.y-a.y*b.x;return this;} setLength(s){return this.normalize().multiplyScalar(s);} applyAxisAngle(){return this;} applyQuaternion(){return this;} },
  Quaternion: class { constructor(){} setFromAxisAngle(){return this;} copy(){return this;} },
  Color: class { constructor(){} },
};

const ephSrc = fs.readFileSync(path.join(SRC, '15-ephemeris.js'), 'utf8');
const mod = new Function('THREE', 'AU_KM', ephSrc + '\nreturn { moonPositionKm, dateToJD };')(THREE, 149597870.7);

const ref = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_moon_ref.json'), 'utf8'));
const EPS = 23.4392911 * Math.PI / 180;
const cE = Math.cos(EPS), sE = Math.sin(EPS);

console.log('Bulan: aplikasi (Meeus ELP2000 ringkas) vs JPL Horizons');
console.log('-----------------------------------------------------------------');
let worstAng = 0, worstKm = 0, worstDate = '';
for (const item of ref.items) {
  const jd = mod.dateToJD(new Date(item.date + 'T00:00:00Z'));
  const m = mod.moonPositionKm(jd);              // ekliptika J2000, km
  // konversi aplikasi -> ekuator J2000 untuk dibandingkan dengan referensi
  const xe = m.x;
  const ye = m.y * cE - m.z * sE;
  const ze = m.y * sE + m.z * cE;
  const r = item.xyz;                             // ekuator J2000 km dari JPL
  const d = Math.hypot(xe - r[0], ye - r[1], ze - r[2]);
  const rl = Math.hypot(r[0], r[1], r[2]);
  const pl = Math.hypot(xe, ye, ze);
  const cosang = (r[0]*xe + r[1]*ye + r[2]*ze) / (rl * pl);
  const ang = Math.acos(Math.max(-1, Math.min(1, cosang))) * 180 / Math.PI;
  const arcsec = ang * 3600;
  console.log(`${item.date}: selisih ${d.toFixed(0).padStart(6)} km | sudut ${ang.toFixed(4)}° = ${arcsec.toFixed(0)}" | jarak app ${pl.toFixed(0)} km vs JPL ${rl.toFixed(0)} km`);
  if (ang > worstAng) { worstAng = ang; worstDate = item.date; }
  if (d > worstKm) worstKm = d;
}
console.log('-----------------------------------------------------------------');
console.log(`Terbesar: ${worstDate}, sudut ${worstAng.toFixed(4)}° = ${(worstAng*3600).toFixed(0)}", jarak ${worstKm.toFixed(0)} km`);
