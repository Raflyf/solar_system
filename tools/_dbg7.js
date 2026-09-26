
const fs=require('fs'),path=require('path');
const SRC=path.join(__dirname,'..','src');
const THREE={MathUtils:{degToRad:(d)=>d*Math.PI/180},Vector3:class{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}set(){return this;}clone(){return this;}copy(){return this;}add(){return this;}sub(){return this;}negate(){return this;}multiplyScalar(){return this;}length(){return 0;}normalize(){return this;}distanceTo(){return 0;}addScaledVector(){return this;}dot(){return 0;}crossVectors(){return this;}setLength(){return this;}applyAxisAngle(){return this;}applyQuaternion(){return this;}},Quaternion:class{setFromAxisAngle(){return this;}copy(){return this;}},Color:class{}};
const eph=fs.readFileSync(path.join(SRC,'15-ephemeris.js'),'utf8');
const mod=new Function('THREE','AU_KM',eph+'\nreturn {dateToJD,jdToDate,eclipseState,moonPhase};')(THREE,149597870.7);

// 1) kandidat elongasi di sekitar 18 Jul 2027
console.log('=== kandidat elongasi 14-22 Jul 2027 ===');
let q0=null,q1=null;
for (let jd=mod.dateToJD(new Date(Date.UTC(2027,6,14))); jd<=mod.dateToJD(new Date(Date.UTC(2027,6,22))); jd+=0.5) {
  const f=mod.moonPhase(jd);
  const el=f.elongasi;
  if (q0!==null&&q1!==null) {
    const a=q0.el,b=q1.el,c=el;
    if ((b>a&&b>c&&b>170)||(b<a&&b<c&&b<10)) console.log('kandidat:', mod.jdToDate(q1.jd).toISOString(), 'el='+b.toFixed(1));
  }
  q0=q1;q1={jd,el};
}
// 2) eclipseState di sekitar 18 Jul (NASA puncak 16:03 UT)
console.log();
console.log('=== eclipseState 18 Jul 2027 ===');
let found=false;
for (let h=10; h<=22; h+=0.25) {
  const jd=mod.dateToJD(new Date(Date.UTC(2027,6,18)))+h/24;
  const st=mod.eclipseState(jd);
  if (st.lunar) { found=true; console.log('h='+h, st.lunar.jenis, st.lunar.magnitudo.toFixed(4), 'gamma='+(st.lunar.gammaKm/6371).toFixed(4)); }
}
if (!found) {
  // cek gamma minimum saja
  let best=null;
  for (let jd=mod.dateToJD(new Date(Date.UTC(2027,6,17))); jd<=mod.dateToJD(new Date(Date.UTC(2027,6,19))); jd+=1/24) {
    const st=mod.eclipseState(jd);
    const e=st; 
    // hitung gamma tanpa perlu eclipse terdeteksi
    const m=mod.moonPositionKm?mod.moonPositionKm(jd):null;
  }
  console.log('TIDAK ADA gerhana terdeteksi di 18 Jul 2027');
  // cek jarak sumbu
  for (let h=14; h<=18; h+=0.5) {
    const jd=mod.dateToJD(new Date(Date.UTC(2027,6,18)))+h/24;
    const st=mod.eclipseState(jd);
    console.log('h='+h, 'gammaKm='+Math.round(st.gammaKm), 'lunar='+(st.lunar?'ada':'null'));
  }
}
