#!/usr/bin/env python3
"""Ambil posisi Bulan (geosentris, ekuator J2000, km) dari JPL Horizons.
Simpan ke _moon_ref.json untuk dibandingkan tools/compare_moon.js."""
import urllib.request, urllib.parse, json

DATES = ['2025-01-15', '2026-09-27', '2027-03-10']

def fetch(cmd, date_str):
    params = {
        'format': 'json', 'COMMAND': f"'{cmd}'", 'OBJ_DATA': "'NO'",
        'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'VECTORS'",
        'CENTER': "'500@399'", 'START_TIME': f"'{date_str}'",
        'STOP_TIME': f"'{date_str} 23:59'", 'STEP_SIZE': "'1d'",
        'VEC_TABLE': "'2'", 'REF_PLANE': "'FRAME'", 'OUT_UNITS': "'KM-S'",
    }
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=90) as r:
        data = json.loads(r.read().decode())
    res = data.get('result', '')
    for line in res.split('\n'):
        ls = line.strip()
        if ls.startswith('X =') and 'Y =' in ls and 'Z =' in ls:
            p = ls.replace('X =','').replace('Y =','').replace('Z =','').split()
            return [float(p[0]), float(p[1]), float(p[2])]
    raise ValueError(res[:300])

items = []
for d in DATES:
    try:
        xyz = fetch('301', d)
        items.append({'date': d, 'xyz': xyz})
        print(f"{d}: X={xyz[0]:+.2f} Y={xyz[1]:+.2f} Z={xyz[2]:+.2f} km")
    except Exception as e:
        print(f"{d} GAGAL: {str(e)[:150]}")

json.dump({'frame': 'equatorial J2000, geocentric, km', 'items': items},
          open('_moon_ref.json', 'w'), indent=1)
print(f"Tersimpan {len(items)} tanggal -> _moon_ref.json")
