
const fs=require('fs'),path=require('path');
const SRC=path.join(__dirname,'..','src');
const THREE={MathUtils:{degToRad:(d)=>d*Math.PI/180},Vector3:class{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}set(){return this;}clone(){return this;}copy(){return this;}add(){return this;}sub(){return this;}negate(){return this;}multiplyScalar(){return this;}length(){return 0;}normalize(){return this;}distanceTo(){return 0;}addScaledVector(){return this;}dot(){return 0;}crossVectors(){return this;}setLength(){return this;}applyAxisAngle(){return this;}applyQuaternion(){return this;}},Quaternion:class{setFromAxisAngle(){return this;}copy(){return this;}},Color:class{}};
const eph=fs.readFileSync(path.join(SRC,'15-ephemeris.js'),'utf8');
const mod=new Function('THREE','AU_KM',eph+'\nreturn {dateToJD,jdToDate,eclipseState};')(THREE,149597870.7);
// pindai lebar di sekitar 31 Des 2028
console.log('=== pindai 29 Des - 2 Jan (tiap 1 jam) ===');
let best=null;
for (let jd=mod.dateToJD(new Date(Date.UTC(2028,11,29))); jd<=mod.dateToJD(new Date(Date.UTC(2029,0,2))); jd+=1/24) {
  const st=mod.eclipseState(jd);
  if (st.lunar) {
    const gam=Math.abs(st.lunar.gammaKm);
    if (!best||gam<best.gam) best={gam,jd,jenis:st.lunar.jenis,mag:Math.abs(st.lunar.magnitudo)};
  }
}
console.log('gamma minimum:', JSON.stringify({...best, jd: mod.jdToDate(best.jd).toISOString(), gam: Math.round(best.gam), mag: +best.mag.toFixed(3)}));
