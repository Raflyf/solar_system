#!/usr/bin/env python3
"""Dump semua event dari aplikasi untuk divalidasi ke sumber resmi NASA.
Menjalankan mesin pencarian aplikasi via Node, menyimpan hasil ke JSON.

Jalankan: python tools/dump_events.py [tahun_awal] [tahun_akhir]
"""
import subprocess, json, sys, os

START = sys.argv[1] if len(sys.argv) > 1 else '2026'
END = sys.argv[2] if len(sys.argv) > 2 else '2031'

JS = f"""
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const THREE = {{
  MathUtils: {{ degToRad: (d) => d * Math.PI / 180, radToDeg: (r) => r * 180 / Math.PI }},
  Vector3: class {{ constructor(x=0,y=0,z=0){{this.x=x;this.y=y;this.z=z;}} set(x,y,z){{this.x=x;this.y=y;this.z=z;return this;}} clone(){{return new THREE.Vector3(this.x,this.y,this.z);}} copy(v){{this.x=v.x;this.y=v.y;this.z=v.z;return this;}} add(v){{this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}} sub(v){{this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}} negate(){{this.x=-this.x;this.y=-this.y;this.z=-this.z;return this;}} multiplyScalar(s){{this.x*=s;this.y*=s;this.z*=s;return this;}} length(){{return Math.hypot(this.x,this.y,this.z);}} normalize(){{const L=this.length()||1;return this.multiplyScalar(1/L);}} distanceTo(v){{return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}} addScaledVector(v,s){{this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}} dot(v){{return this.x*v.x+this.y*v.y+this.z*v.z;}} crossVectors(a,b){{this.x=a.y*b.z-a.z*b.y;this.y=a.z*b.x-a.x*b.z;this.z=a.x*b.y-a.y*b.x;return this;}} setLength(s){{return this.normalize().multiplyScalar(s);}} applyAxisAngle(){{return this;}} applyQuaternion(){{return this;}} }},
  Quaternion: class {{ constructor(){{}} setFromAxisAngle(){{return this;}} copy(){{return this;}} }},
  Color: class {{ constructor(){{}} }},
}};

const eph = fs.readFileSync(path.join(SRC, '15-ephemeris.js'), 'utf8');
const meteor = fs.readFileSync(path.join(SRC, '16-meteor-data.js'), 'utf8');

const mod = new Function('THREE', 'AU_KM',
  eph + '\\n' + meteor + `
  return {{
    dateToJD, jdToDate, eclipseState, moonPhase, planetElongation,
    planetPositionAU, earthPositionKm, moonPositionKm, bodyPositionKm,
    METEOR_SHOWERS, angleBetween, DEG,
  }};`
)(THREE, 149597870.7);

const {{
  dateToJD, eclipseState, moonPhase, planetElongation,
  earthPositionKm, bodyPositionKm, METEOR_SHOWERS,
}} = mod;

const d0 = new Date(Date.UTC({START}, 0, 1));
const d1 = new Date(Date.UTC({END}, 11, 31, 23, 59, 59));
const jd0 = dateToJD(d0), jd1 = dateToJD(d1);
const out = {{ range: [{START}, {END}], eclipses: [], oppositions: [], conjunctions: [], meteor: [], phases: [] }};

// --- gerhana ---
// Pendekatan berbasis fase: cari kandidat (bulan baru/purnama), lalu pindai
// halus di sekitarnya. Cara lama (memindai seluruh rentang dengan langkah
// 6 jam) MELEWATKAN gerhana pendek — terbukti: gerhana total 22 Jul 2028
// tidak terdeteksi sama sekali.
const kandidat = [];
{{
  let q0 = null, q1 = null;
  for (let jd = jd0 - 2; jd <= jd1 + 2; jd += 0.5) {{
    const f = moonPhase(jd);
    const el = f.elongasi;
    if (q0 !== null && q1 !== null) {{
      const a = q0.el, b = q1.el, c = el;
      if ((b > a && b > c && b > 170) || (b < a && b < c && b < 10)) kandidat.push(q1.jd);
    }}
    q0 = q1; q1 = {{ jd, el }};
  }}
}}
const raw = [];
for (const t of kandidat) {{
  for (let jd = t - 1.1; jd <= t + 1.1; jd += 5/1440) {{
    if (jd < jd0 || jd > jd1) continue;
    const st = eclipseState(jd);
    if (st.solar) raw.push({{ tipe: 'matahari', jenis: st.solar.jenis, jd,
                              mag: +Math.abs(st.solar.magnitudo).toFixed(4),
                              gam: Math.abs(st.solar.gammaKm) }});
    if (st.lunar) raw.push({{ tipe: 'bulan', jenis: st.lunar.jenis, jd,
                              mag: +Math.abs(st.lunar.magnitudo).toFixed(4),
                              gam: Math.abs(st.lunar.gammaKm) }});
  }}
}}
// kelompokkan per tipe; puncak = gamma terkecil
const groups = [];
for (const tipe of ['matahari', 'bulan']) {{
  const list = raw.filter(e => e.tipe === tipe);
  let cur = null;
  for (const k of list) {{
    if (cur && (k.jd - cur.akhir) < 0.4) {{
      cur.akhir = k.jd;
      if (k.gam < cur.gam) {{ cur.gam = k.gam; cur.puncak = k.jd; cur.jenis = k.jenis; cur.mag = k.mag; }}
    }} else {{
      if (cur) groups.push(cur);
      cur = {{ tipe, jenis: k.jenis, awal: k.jd, akhir: k.jd, puncak: k.jd, mag: k.mag, gam: k.gam }};
    }}
  }}
  if (cur) groups.push(cur);
}}
groups.sort((a, b) => a.puncak - b.puncak);
out.eclipses = groups.map(g => ({{
  tipe: g.tipe, jenis: g.jenis,
  tanggal: mod.jdToDate(g.puncak).toISOString().slice(0,16),
  mag: +g.mag.toFixed(3),
}}));

// --- oposisi & konjungsi Matahari ---
const planets = ['mercury','venus','mars','jupiter','saturn','uranus','neptune'];
const prevEl = {{}}, rising = {{}};
for (let jd = jd0 - 1; jd <= jd1 + 1; jd += 0.5) {{
  for (const p of planets) {{
    const e = planetElongation(p, jd);
    if (!e) continue;
    const el = e.elongasi;
    if (prevEl[p] !== undefined) {{
      const up = el > prevEl[p];
      if (rising[p] === true && !up) {{
        if (el > 150) out.oppositions.push({{ planet: p, tanggal: mod.jdToDate(jd).toISOString().slice(0,10), elongasi: +el.toFixed(1) }});
      }}
      rising[p] = up;
    }}
    prevEl[p] = el;
  }}
}}

// --- konjungsi planet-planet (mag<6) ---
const MAG = {{ mercury:-1.9, venus:-4.6, mars:-2.9, jupiter:-2.9, saturn:0.0, uranus:5.7, neptune:7.8 }};
const prevSep = {{}}, risingSep = {{}};
for (let jd = jd0 - 1; jd <= jd1 + 1; jd += 0.5) {{
  const e = earthPositionKm(jd);
  for (let i = 0; i < planets.length; i++) for (let j = i+1; j < planets.length; j++) {{
    const p1 = planets[i], p2 = planets[j];
    if (MAG[p1] > 6 || MAG[p2] > 6) continue;
    const a = bodyPositionKm(p1, jd), b = bodyPositionKm(p2, jd);
    if (!a || !b) continue;
    const v1 = {{x:a.x-e.x, y:a.y-e.y, z:a.z-e.z}}, v2 = {{x:b.x-e.x, y:b.y-e.y, z:b.z-e.z}};
    const l1 = Math.hypot(v1.x,v1.y,v1.z), l2 = Math.hypot(v2.x,v2.y,v2.z);
    const dot = (v1.x*v2.x+v1.y*v2.y+v1.z*v2.z)/(l1*l2);
    const sep = Math.acos(Math.max(-1,Math.min(1,dot))) / mod.DEG;
    const kk = p1+'|'+p2, ps = prevSep[kk];
    if (ps !== undefined) {{
      const turun = sep < ps;
      /* puncak konjungsi = minimum: sebelumnya menurun lalu mulai naik */
      if (risingSep[kk] === false && !turun && ps < 5)
        out.conjunctions.push({{ pair: p1+'-'+p2, tanggal: mod.jdToDate(jd).toISOString().slice(0,10), sep: +ps.toFixed(2) }});
      risingSep[kk] = !turun;
    }} else risingSep[kk] = false;
    prevSep[kk] = sep;
  }}
}}

// --- hujan meteor (puncak) ---
for (const ms of METEOR_SHOWERS) {{
  for (let y = {START}; y <= {END}; y++) {{
    const t = new Date(Date.UTC(y, ms.puncak.bulan - 1, ms.puncak.hari, 12));
    out.meteor.push({{ nama: ms.nama, tanggal: t.toISOString().slice(0,10), zhr: ms.zhr, induk: ms.induk }});
  }}
}}

// --- fase: bulan baru & purnama ---
// PENTING: puncak elongasi dicari dengan MEMBANDINGKAN TETANGGA (a > b && b < c
// untuk minimum, a < b && b > c untuk maksimum). Versi lama hanya memeriksa
// "naik lalu turun" pada langkah 0,25 hari, sehingga satu purnama terdeteksi
// puluhan kali (85 per tahun, seharusnya 12-13).
let p0 = null, p1 = null;
for (let jd = jd0 - 1; jd <= jd1 + 1; jd += 0.25) {{
  const f = moonPhase(jd);
  const el = f.elongasi;
  if (p0 !== null && p1 !== null) {{
    const a = p0.el, b = p1.el, c = el;
    if (b > a && b > c && b > 170)
      out.phases.push({{ fase: 'purnama', tanggal: mod.jdToDate(p1.jd).toISOString().slice(0,10) }});
    else if (b < a && b < c && b < 10)
      out.phases.push({{ fase: 'baru', tanggal: mod.jdToDate(p1.jd).toISOString().slice(0,10) }});
  }}
  p0 = p1; p1 = {{ jd, el }};
}}

console.log(JSON.stringify(out));
"""

with open('tools/_dump_events.js', 'w', encoding='utf-8') as f:
    f.write(JS)

r = subprocess.run(['node', 'tools/_dump_events.js'], capture_output=True, text=True,
                   cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if r.returncode != 0:
    print('GAGAL:', r.stderr[:2000])
    sys.exit(1)

data = json.loads(r.stdout)
with open('_events_dump.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=1)

print(f"Rentang: {data['range'][0]}–{data['range'][1]}")
print(f"  Gerhana      : {len(data['eclipses'])}")
print(f"  Oposisi      : {len(data['oppositions'])}")
print(f"  Konjungsi    : {len(data['conjunctions'])}")
print(f"  Hujan meteor : {len(data['meteor'])}")
print(f"  Fase (baru/purnama): {len(data['phases'])}")
print("-> _events_dump.json")
