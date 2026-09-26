
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const THREE = {
  MathUtils: { degToRad: (d) => d*Math.PI/180, radToDeg: (r) => r*180/Math.PI },
  Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} clone(){return new THREE.Vector3(this.x,this.y,this.z);} copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;} add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;} sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;} negate(){this.x=-this.x;this.y=-this.y;this.z=-this.z;return this;} multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;} length(){return Math.hypot(this.x,this.y,this.z);} normalize(){const L=this.length()||1;return this.multiplyScalar(1/L);} distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);} addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;} dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;} crossVectors(a,b){this.x=a.y*b.z-a.z*b.y;this.y=a.z*b.x-a.x*b.z;this.z=a.x*b.y-a.y*b.x;return this;} setLength(s){return this.normalize().multiplyScalar(s);} applyAxisAngle(){return this;} applyQuaternion(){return this;} },
  Quaternion: class { constructor(){} setFromAxisAngle(){return this;} copy(){return this;} },
  Color: class { constructor(){} },
};
const eph = fs.readFileSync(path.join(SRC, '15-ephemeris.js'), 'utf8');
const mod = new Function('THREE','AU_KM', eph + '\nreturn { dateToJD, eclipseState };')(THREE, 149597870.7);

// scan Jul-Des 2028 tiap 6 jam
console.log('=== scan Jul-Des 2028 (tiap 6 jam) ===');
for (let jd = mod.dateToJD(new Date(Date.UTC(2028,6,1))); jd <= mod.dateToJD(new Date(Date.UTC(2028,11,31))); jd += 0.25) {
  const st = mod.eclipseState(jd);
  if (st.solar || st.lunar) {
    const d = new Date((jd - 2440587.5) * 86400000);
    console.log(d.toISOString().slice(0,16), 'solar:', st.solar ? st.solar.jenis+' '+st.solar.magnitudo.toFixed(3) : '-', 'lunar:', st.lunar ? st.lunar.jenis+' '+st.lunar.magnitudo.toFixed(3) : '-');
  }
}
console.log();
console.log('=== scan 2027-07-18 (gerhana penumbra tipis) ===');
for (let jd = mod.dateToJD(new Date(Date.UTC(2027,6,17))); jd <= mod.dateToJD(new Date(Date.UTC(2027,6,19))); jd += 0.05) {
  const st = mod.eclipseState(jd);
  if (st.lunar) {
    const d = new Date((jd - 2440587.5) * 86400000);
    console.log(d.toISOString().slice(0,16), st.lunar.jenis, st.lunar.magnitudo.toFixed(4));
  }
}
