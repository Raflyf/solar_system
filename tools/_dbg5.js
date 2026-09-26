
const fs=require('fs'),path=require('path');
const SRC=path.join(__dirname,'..','src');
const THREE={MathUtils:{degToRad:(d)=>d*Math.PI/180},Vector3:class{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}set(){return this;}clone(){return this;}copy(){return this;}add(){return this;}sub(){return this;}negate(){return this;}multiplyScalar(){return this;}length(){return 0;}normalize(){return this;}distanceTo(){return 0;}addScaledVector(){return this;}dot(){return 0;}crossVectors(){return this;}setLength(){return this;}applyAxisAngle(){return this;}applyQuaternion(){return this;}},Quaternion:class{setFromAxisAngle(){return this;}copy(){return this;}},Color:class{}};
const eph=fs.readFileSync(path.join(SRC,'15-ephemeris.js'),'utf8');
const mod=new Function('THREE','AU_KM',eph+'\nreturn {dateToJD,jdToDate,eclipseState,moonPhase};')(THREE,149597870.7);

// 1) cari kandidat di sekitar 2028-12-31
console.log('=== elongasi Bulan 25 Des 2028 - 5 Jan 2029 ===');
let q0=null,q1=null;
for (let jd=mod.dateToJD(new Date(Date.UTC(2028,11,25))); jd<=mod.dateToJD(new Date(Date.UTC(2029,0,5))); jd+=0.5) {
  const f=mod.moonPhase(jd);
  const el=f.elongasi;
  if (q0!==null&&q1!==null) {
    const a=q0.el,b=q1.el,c=el;
    if ((b>a&&b>c&&b>170)||(b<a&&b<c&&b<10)) {
      console.log('kandidat di', mod.jdToDate(q1.jd).toISOString(), 'el='+b.toFixed(1));
    }
  }
  q0=q1;q1={jd,el};
}
// 2) apakah eclipseState mendeteksi gerhana bulan di sekitar itu?
console.log();
console.log('=== eclipseState 30 Des 2028 - 1 Jan 2029 ===');
for (let h=0; h<=48; h+=2) {
  const jd=mod.dateToJD(new Date(Date.UTC(2028,11,30)))+h/24;
  const st=mod.eclipseState(jd);
  if (st.lunar||st.solar) {
    console.log(mod.jdToDate(jd).toISOString().slice(0,16), 'lunar:', st.lunar?st.lunar.jenis+' '+st.lunar.magnitudo.toFixed(3):'-');
  }
}
