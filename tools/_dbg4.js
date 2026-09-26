
const fs=require('fs'),path=require('path');
const SRC=path.join(__dirname,'..','src');
const THREE={MathUtils:{degToRad:(d)=>d*Math.PI/180},Vector3:class{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}set(){return this;}clone(){return this;}copy(){return this;}add(){return this;}sub(){return this;}negate(){return this;}multiplyScalar(){return this;}length(){return 0;}normalize(){return this;}distanceTo(){return 0;}addScaledVector(){return this;}dot(){return 0;}crossVectors(){return this;}setLength(){return this;}applyAxisAngle(){return this;}applyQuaternion(){return this;}},Quaternion:class{setFromAxisAngle(){return this;}copy(){return this;}},Color:class{}};
const eph=fs.readFileSync(path.join(SRC,'15-ephemeris.js'),'utf8');
const mod=new Function('THREE','AU_KM',eph+'\nreturn {dateToJD,eclipseState};')(THREE,149597870.7);

// gerhana Bulan 2026-08-28: NASA puncak 04:13 UT, umbral mag 0.9299
console.log('=== 2026-08-28 (NASA: sebagian, umbral 0.9299, puncak 04:13 UT) ===');
let best=null;
for (let h=2; h<=7; h+=0.1) {
  const jd=mod.dateToJD(new Date(Date.UTC(2026,7,28)))+h/24;
  const st=mod.eclipseState(jd);
  if (st.lunar) {
    const mag=Math.abs(st.lunar.magnitudo);
    if (!best||mag>best.mag) best={mag,h,jenis:st.lunar.jenis};
  }
}
console.log('puncak terdeteksi:', JSON.stringify(best));

// 2028-12-31: NASA total 1.2463, puncak 16:52 UT
console.log();
console.log('=== 2028-12-31 (NASA: total 1.2463, puncak 16:52 UT) ===');
best=null;
for (let h=14; h<=20; h+=0.1) {
  const jd=mod.dateToJD(new Date(Date.UTC(2028,11,31)))+h/24;
  const st=mod.eclipseState(jd);
  if (st.lunar) {
    const mag=Math.abs(st.lunar.magnitudo);
    if (!best||mag>best.mag) best={mag,h,jenis:st.lunar.jenis};
  }
}
console.log('puncak terdeteksi:', JSON.stringify(best));

// 2027-08-17: NASA penumbra 0.5456 puncak 07:14 UT
console.log();
console.log('=== 2027-08-17 (NASA: penumbra 0.5456, puncak 07:14 UT) ===');
best=null;
for (let h=5; h<=9; h+=0.1) {
  const jd=mod.dateToJD(new Date(Date.UTC(2027,7,17)))+h/24;
  const st=mod.eclipseState(jd);
  if (st.lunar) {
    const mag=Math.abs(st.lunar.magnitudo);
    if (!best||mag>best.mag) best={mag,h,jenis:st.lunar.jenis};
  }
}
console.log('puncak terdeteksi:', JSON.stringify(best));
