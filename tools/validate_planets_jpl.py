#!/usr/bin/env python3
"""Validasi oposisi & konjungsi planet vs JPL Horizons (sumber resmi NASA/JPL).

Mengambil vektor heliosentris Bumi & planet dari JPL Horizons API, lalu
menghitung elongasi geosentris dan membandingkannya dengan event yang
dilaporkan aplikasi (_events_dump.json).

Jalankan: python tools/validate_planets_jpl.py
"""
import urllib.request, urllib.parse, json, math, time, os, sys

BASE = "https://ssd.jpl.nasa.gov/api/horizons.api"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# kode JPL Horizons untuk planet (heliosentris, pusat Matahari @10)
JPL_ID = {
    'mercury': '199', 'venus': '299', 'earth': '399', 'mars': '499',
    'jupiter': '599', 'saturn': '699', 'uranus': '799', 'neptune': '899',
}
NAMA = {
    'mercury': 'Merkurius', 'venus': 'Venus', 'mars': 'Mars',
    'jupiter': 'Jupiter', 'saturn': 'Saturnus', 'uranus': 'Uranus',
    'neptune': 'Neptunus',
}

def fetch_helio(cmd, date_str):
    """Vektor heliosentris (pusat Matahari @10) dalam km."""
    params = {
        'format': 'json', 'COMMAND': "'%s'" % cmd,
        'OBJ_DATA': 'NO', 'MAKE_EPHEM': 'YES',
        'EPHEM_TYPE': 'VECTORS', 'CENTER': "'500@10'",
        'START_TIME': "'%s'" % date_str,
        'STOP_TIME': "'%s 00:00:01'" % date_str,
        'STEP_SIZE': "'1 d'", 'VEC_TABLE': '1', 'OUT_UNITS': 'KM-S',
    }
    url = BASE + '?' + urllib.parse.urlencode(params)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                j = json.loads(r.read().decode())
            break
        except Exception as ex:
            if attempt == 2:
                return None
            time.sleep(2)
    txt = j.get('result', '')
    i0 = txt.find('$$SOE'); i1 = txt.find('$$EOE')
    if i0 < 0:
        return None
    # Format JPL Horizons VECTORS:
    #   X = 1.234E+08 Y = 5.678E+07 Z = 2.468E+07
    # (satu baris, nilai dipisah ' = ')
    for ln in txt[i0+5:i1].strip().splitlines():
        if ln.strip().startswith('X ='):
            # ambil semua angka ilmiah dari baris itu
            import re
            nums = re.findall(r'[-+]?\d+\.\d+E[-+]\d+', ln, re.I)
            if len(nums) >= 3:
                v = [float(x) for x in nums[:3]]
                return {'x': v[0], 'y': v[1], 'z': v[2]}
    return None

def elongasi(tgl, planet):
    e = fetch_helio(JPL_ID['earth'], tgl)
    p = fetch_helio(JPL_ID[planet], tgl)
    if not e or not p:
        return None
    v = {'x': p['x']-e['x'], 'y': p['y']-e['y'], 'z': p['z']-e['z']}
    toSun = {'x': -e['x'], 'y': -e['y'], 'z': -e['z']}
    dot = (toSun['x']*v['x'] + toSun['y']*v['y'] + toSun['z']*v['z']) / (
        math.hypot(toSun['x'], toSun['y'], toSun['z']) * math.hypot(v['x'], v['y'], v['z']))
    return math.degrees(math.acos(max(-1, min(1, dot))))

def main():
    with open(os.path.join(ROOT, '_events_dump.json'), encoding='utf-8') as f:
        data = json.load(f)

    print('=' * 78)
    print('VALIDASI OPOSISI vs JPL HORIZONS (sumber resmi NASA/JPL)')
    print('=' * 78)
    print('Elongasi geosentris pada tanggal yang dilaporkan aplikasi.')
    print('Oposisi sejati = elongasi mendekati 180 derajat.')
    print()

    ok = 0; bad = 0
    for o in data['oppositions'][:8]:
        p = o['planet']; tgl = o['tanggal']
        el_jpl = elongasi(tgl, p)
        if el_jpl is None:
            print('  ? %-9s %s  (data JPL gagal diambil)' % (NAMA[p], tgl))
            continue
        el_app = o['elongasi']
        selisih = abs(el_jpl - el_app)
        status = 'OK' if (el_jpl > 170 and selisih < 1.0) else 'PERIKSA'
        if status == 'OK': ok += 1
        else: bad += 1
        print('  %-6s %-9s %s  app %6.2f  JPL %6.2f  selisih %.2f' %
              (status, NAMA[p], tgl, el_app, el_jpl, selisih))
        time.sleep(0.4)

    print()
    print('  Ringkasan oposisi: %d OK, %d perlu diperiksa' % (ok, bad))

    # --- konjungsi: cek pemisahan sudut dua planet ---
    print()
    print('=' * 78)
    print('VALIDASI KONJUNGSI vs JPL HORIZONS')
    print('=' * 78)
    ok2 = 0; bad2 = 0
    for c in data['conjunctions'][:8]:
        pair = c['pair'].split('-')
        tgl = c['tanggal']
        p1, p2 = pair[0], pair[1]
        a = fetch_helio(JPL_ID[p1], tgl)
        b = fetch_helio(JPL_ID[p2], tgl)
        e = fetch_helio(JPL_ID['earth'], tgl)
        if not (a and b and e):
            print('  ? %-22s %s  (data JPL gagal)' % (c['pair'], tgl))
            continue
        v1 = {'x': a['x']-e['x'], 'y': a['y']-e['y'], 'z': a['z']-e['z']}
        v2 = {'x': b['x']-e['x'], 'y': b['y']-e['y'], 'z': b['z']-e['z']}
        dot = (v1['x']*v2['x']+v1['y']*v2['y']+v1['z']*v2['z']) / (
            math.hypot(v1['x'],v1['y'],v1['z']) * math.hypot(v2['x'],v2['y'],v2['z']))
        sep_jpl = math.degrees(math.acos(max(-1, min(1, dot))))
        selisih = abs(sep_jpl - c['sep'])
        status = 'OK' if selisih < 1.0 else 'PERIKSA'
        if status == 'OK': ok2 += 1
        else: bad2 += 1
        print('  %-6s %-22s %s  app %5.2f  JPL %5.2f  selisih %.2f' %
              (status, c['pair'], tgl, c['sep'], sep_jpl, selisih))
        time.sleep(0.4)

    print()
    print('  Ringkasan konjungsi: %d OK, %d perlu diperiksa' % (ok2, bad2))
    print()
    print('Sumber: JPL Horizons API (ssd.jpl.nasa.gov/api/horizons.api)')

if __name__ == '__main__':
    main()
