
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
const mod = new Function('THREE','AU_KM', eph + '\nreturn { dateToJD, eclipseState, earthPositionKm, moonPositionKm };')(THREE, 149597870.7);

// 2028-07-22: NASA total solar, mag 1.056, puncak 02:55 UT
console.log('=== 2028-07-22 gerhana MATAHARI total (NASA) ===');
for (let h = 0; h <= 6; h += 0.5) {
  const jd = mod.dateToJD(new Date(Date.UTC(2028,6,22))) + h/24;
  const st = mod.eclipseState(jd);
  const e = mod.earthPositionKm(jd), m = mod.moonPositionKm(jd);
  const toSun = {x:-e.x,y:-e.y,z:-e.z}, toMoon = {x:m.x,y:m.y,z:m.z};
  const sep = Math.acos((toSun.x*toMoon.x+toSun.y*toMoon.y+toSun.z*toMoon.z)/(Math.hypot(toSun.x,toSun.y,toSun.z)*Math.hypot(toMoon.x,toMoon.y,m.z||0)||1));
  const dotSM = (toSun.x*toMoon.x+toSun.y*toMoon.y+toSun.z*toMoon.z)/(Math.hypot(toSun.x,toSun.y,toSun.z)*Math.hypot(toMoon.x,toMoon.y,toMoon.z));
  console.log('h='+h, 'sep='+(sep*180/Math.PI).toFixed(3), 'dotSM='+dotSM.toFixed(3), 'bulanDiDepan='+(dotSM>0), 'solar='+(st.solar?st.solar.jenis+' '+st.solar.magnitudo.toFixed(3):'NULL'));
}
console.log();
console.log('=== 2028-12-31 gerhana BULAN total (NASA) ===');
for (let h = 14; h <= 19; h += 0.5) {
  const jd = mod.dateToJD(new Date(Date.UTC(2028,11,31))) + h/24;
  const st = mod.eclipseState(jd);
  console.log('h='+h, 'lunar='+(st.lunar?st.lunar.jenis+' '+st.lunar.magnitudo.toFixed(3):'NULL'), 'solar='+(st.solar?st.solar.jenis:'-'));
}
