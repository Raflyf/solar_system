#!/usr/bin/env python3
"""Ambil posisi 8 planet dari JPL Horizons (API resmi NASA/JPL) untuk
dibandingkan dengan perhitungan aplikasi. Simpan ke _horizons_ref.json."""
import urllib.request, urllib.parse, json, sys

PLANETS = {
    'mercury': '199', 'venus': '299', 'earth': '399', 'mars': '499',
    'jupiter': '599', 'saturn': '699', 'uranus': '799', 'neptune': '899',
}

def fetch(cmd, date_str):
    params = {
        'format': 'json', 'COMMAND': f"'{cmd}'", 'OBJ_DATA': "'NO'",
        'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'VECTORS'",
        'CENTER': "'500@10'", 'START_TIME': f"'{date_str}'",
        'STOP_TIME': f"'{date_str} 23:59'",
        'STEP_SIZE': "'1d'", 'VEC_TABLE': "'2'", 'REF_PLANE': "'ECLIPTIC'",
        'OUT_UNITS': "'AU-D'",
    }
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=90) as r:
        data = json.loads(r.read().decode())
    res = data.get('result', '')
    for line in res.split('\n'):
        ls = line.strip()
        if ls.startswith('X =') and 'Y =' in ls and 'Z =' in ls:
            parts = ls.replace('X =', '').replace('Y =', '').replace('Z =', '').split()
            return [float(parts[0]), float(parts[1]), float(parts[2])]
    raise ValueError('pola vektor tidak ditemukan: ' + res[:200])

def main():
    date_str = sys.argv[1] if len(sys.argv) > 1 else '2026-09-27'
    out = {}
    for name, cmd in PLANETS.items():
        try:
            xyz = fetch(cmd, date_str)
            out[name] = xyz
            print(f"{name:9s} X={xyz[0]:+.7f} Y={xyz[1]:+.7f} Z={xyz[2]:+.7f} AU")
        except Exception as e:
            print(f"{name:9s} GAGAL: {e}")
    with open('_horizons_ref.json', 'w') as f:
        json.dump({'date': date_str, 'pos': out}, f, indent=1)
    print(f"\nTersimpan {len(out)}/8 planet untuk {date_str} -> _horizons_ref.json")

if __name__ == '__main__':
    main()
