/* Periksa index.html yang sudah dibangun:
   1. Setiap blok <script> dapat di-parse (tidak ada syntax error)
   2. Semua fungsi yang dipakai UI benar-benar terdefinisi
   3. Tidak ada referensi ke variabel yang tidak ada

   Jalankan: node tools/check_build.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

console.log('='.repeat(70));
console.log('PERIKSA index.html HASIL BUILD');
console.log('='.repeat(70));
console.log(`ukuran: ${(html.length / 1024).toFixed(0)} KB`);

/* --- 1. ekstrak dan periksa setiap blok script --- */
const scriptRe = /<script>([\s\S]*?)<\/script>/g;
let m, n = 0, gagal = 0;
const blok = [];
while ((m = scriptRe.exec(html)) !== null) {
  n++;
  const isi = m[1];
  blok.push(isi);
  try {
    new vm.Script(isi, { filename: `blok-${n}.js` });
  } catch (e) {
    gagal++;
    console.log(`  GAGAL blok ${n}: ${e.message}`);
  }
}
console.log(`\n1. Sintaks ${n} blok script: ${gagal === 0 ? 'semua OK' : gagal + ' GAGAL'}`);

/* --- 2. periksa fungsi yang dipakai UI terdefinisi --- */
/* gabungkan semua blok kecuali three.js (blok 1) lalu jalankan di sandbox
   dengan stub DOM/WebGL, untuk memastikan tidak ada ReferenceError saat
   pendefinisian fungsi */
const kode = blok.slice(1).join('\n;\n');

const fungsiWajib = [
  'dateToJD', 'jdToDate', 'planetPositionAU', 'moonPositionKm', 'eclipseState',
  'moonPhase', 'planetElongation', 'buildStarField', 'buildMilkyWay',
  'buildDatePanel', 'jumpToDate', 'eventsAt', 'searchEclipses',
  'toggleDatePanel', 'renderDatePanel', 'runEclipseSearch', 'updateEventBadge',
  'buildStarLabels', 'updateStarLabels', 'updateSkyInfo',
  'setStarFieldVisible', 'setConstellationLines', 'setStarNames',
  'buildBeacons', 'updateBeacons', 'computePositions', 'applyPositions',
  'focusBody', 'viewMoonSystem', 'buildStars',
];

const sandbox = {
  console, Math, Date, JSON, parseFloat, parseInt, isFinite, isNaN,
  Float32Array, Uint8Array, Uint16Array, Int32Array, Array, Object, String,
  Number, Boolean, Error, RegExp, Map, Set, Promise, performance: { now: () => 0 },
  requestAnimationFrame: () => 0,
  setTimeout: () => 0, clearTimeout: () => 0,
  navigator: { userAgent: 'node', hardwareConcurrency: 4 },
  location: { search: '', href: '' },
  localStorage: { getItem: () => null, setItem: () => {} },
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.innerWidth = 1920;
sandbox.innerHeight = 1080;
sandbox.devicePixelRatio = 1;
sandbox.document = {
  getElementById: () => null,
  createElement: () => ({
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, appendChild() {}, remove() {},
    querySelectorAll: () => [], getContext: () => null,
    set innerHTML(v) {}, get innerHTML() { return ''; },
    set textContent(v) {}, get textContent() { return ''; },
  }),
  querySelectorAll: () => [],
  body: { appendChild() {} },
  addEventListener() {},
};
sandbox.window = sandbox;

/* stub THREE secukupnya */
sandbox.THREE = new Proxy({}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    /* kelas-kelas THREE: kembalikan konstruktor kosong yang bisa dipanggil */
    const Klass = function () {
      this.position = { x: 0, y: 0, z: 0, set() {}, copy() {}, add() {}, sub() {} };
      this.rotation = { x: 0, y: 0, z: 0 };
      this.scale = { set() {}, x: 1, y: 1 };
      this.userData = {};
      this.children = [];
      this.visible = true;
      this.material = { uniforms: {}, opacity: 1 };
      this.geometry = { setAttribute() {}, setFromPoints() {}, boundingSphere: { radius: 1 } };
      this.uniforms = {};
    };
    Klass.prototype.add = function () {};
    Klass.prototype.remove = function () {};
    Klass.prototype.traverse = function () {};
    Klass.prototype.getWorldPosition = function (v) { return v; };
    Klass.prototype.updateWorldMatrix = function () {};
    Klass.prototype.getWorldQuaternion = function () {};
    Klass.prototype.project = function () { return this; };
    Klass.prototype.copy = function () { return this; };
    Klass.prototype.clone = function () { return this; };
    Klass.prototype.set = function () { return this; };
    Klass.prototype.add = function () { return this; };
    Klass.prototype.multiplyScalar = function () { return this; };
    Klass.prototype.length = function () { return 0; };
    Klass.prototype.distanceTo = function () { return 1; };
    Klass.prototype.dot = function () { return 0; };
    Klass.prototype.normalize = function () { return this; };
    Klass.prototype.applyAxisAngle = function () { return this; };
    Klass.prototype.applyQuaternion = function () { return this; };
    Klass.prototype.setFromMatrixPosition = function () { return this; };
    Klass.prototype.toArray = function () { return [0, 0, 0]; };
    target[prop] = Klass;
    return Klass;
  },
});

let errDefinisi = null;
try {
  vm.createContext(sandbox);
  new vm.Script(kode, { filename: 'gabungan.js' }).runInContext(sandbox, { timeout: 20000 });
} catch (e) {
  errDefinisi = e;
}

if (errDefinisi) {
  console.log(`\n2. Menjalankan kode: GAGAL saat pendefinisian`);
  console.log(`   ${errDefinisi.message}`);
  const stack = (errDefinisi.stack || '').split('\n').slice(0, 4).join('\n   ');
  console.log('   ' + stack);
} else {
  console.log('\n2. Menjalankan kode: OK (semua definisi berhasil)');

  /* periksa fungsi wajib */
  const hilang = [];
  for (const f of fungsiWajib) {
    if (typeof sandbox[f] !== 'function') hilang.push(f);
  }
  console.log(`\n3. Fungsi wajib: ${hilang.length === 0 ? 'semua ada (' + fungsiWajib.length + ')' : 'HILANG: ' + hilang.join(', ')}`);

  /* periksa data — `const` tidak menempel di objek global, jadi dicek
     dengan mengevaluasi ekspresi di dalam konteks yang sama */
  const dataWajib = ['STARS_LABELED', 'STARS_OTHER', 'CONSTELLATIONS', 'DEEP_SKY', 'JPL_ELEMENTS'];
  const dataHilang = [];
  for (const d of dataWajib) {
    try {
      const v = vm.runInContext(d, sandbox);
      if (v === undefined) dataHilang.push(d);
    } catch (e) {
      dataHilang.push(d);
    }
  }
  console.log(`\n4. Data wajib: ${dataHilang.length === 0 ? 'semua ada' : 'HILANG: ' + dataHilang.join(', ')}`);
  const ambil = (nama) => { try { return vm.runInContext(nama, sandbox); } catch (e) { return null; } };
  const SL = ambil('STARS_LABELED'), SO = ambil('STARS_OTHER'), CO = ambil('CONSTELLATIONS'), DS = ambil('DEEP_SKY');
  if (SL) console.log(`   bintang bernama: ${SL.length}`);
  if (SO) console.log(`   bintang lain   : ${SO.length}`);
  if (CO) console.log(`   rasi bintang   : ${CO.length}`);
  if (DS) console.log(`   galaksi/nebula : ${DS.length}`);

  /* uji cepat ephemeris di dalam build */
  if (typeof sandbox.eclipseState === 'function') {
    const jd = sandbox.dateToJD(new Date('2024-04-08T18:18:00Z'));
    const st = sandbox.eclipseState(jd);
    console.log(`\n5. Uji gerhana 2024-04-08 dari build:`);
    console.log(`   ${st.solar ? 'terdeteksi ' + st.solar.jenis + ' mag ' + st.solar.magnitudo.toFixed(3) : 'TIDAK TERDETEKSI'}`);
  }
}

console.log('\n' + '='.repeat(70));
