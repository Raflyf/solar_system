
const fs = require('fs'); const path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const THREE = { MathUtils:{degToRad:(d)=>d*Math.PI/180}, Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(){return this;} clone(){return this;} copy(){return this;} add(){return this;} sub(){return this;} negate(){return this;} multiplyScalar(){return this;} length(){return 0;} normalize(){return this;} distanceTo(){return 0;} addScaledVector(){return this;} dot(){return 0;} crossVectors(){return this;} setLength(){return this;} applyAxisAngle(){return this;} applyQuaternion(){return this;} }, Quaternion: class { setFromAxisAngle(){return this;} copy(){return this;} }, Color: class {} };
const eph = fs.readFileSync(path.join(SRC,'15-ephemeris.js'),'utf8');
const mod = new Function('THREE','AU_KM', eph + '\nreturn { dateToJD, eclipseState };')(THREE, 149597870.7);
const jd0 = mod.dateToJD(new Date(Date.UTC(2028,6,22)));
let n=0, first=null;
for (let jd = jd0; jd < jd0+1; jd += 0.25) {
  const st = mod.eclipseState(jd);
  if (st.solar) { n++; if(!first) first = new Date((jd-2440587.5)*86400000).toISOString(); }
}
console.log('2028-07-22 terdeteksi:', n, 'kali, pertama:', first);
const jd1 = mod.dateToJD(new Date(Date.UTC(2028,11,31)));
let m=0, f2=null;
for (let jd = jd1; jd < jd1+1; jd += 0.25) {
  const st = mod.eclipseState(jd);
  if (st.lunar) { m++; if(!f2) f2 = new Date((jd-2440587.5)*86400000).toISOString(); }
}
console.log('2028-12-31 terdeteksi:', m, 'kali, pertama:', f2);
