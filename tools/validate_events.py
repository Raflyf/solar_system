#!/usr/bin/env python3
"""Validasi event aplikasi vs katalog resmi NASA.

Referensi gerhana: NASA Five Millennium Canon (Espenak & Meeus)
  https://eclipse.gsfc.nasa.gov/OH/OH2026.html dst.
Referensi hujan meteor: IMO (International Meteor Organization).
Referensi oposisi: NASA/JPL (posisi heliosentris).

Jalankan: python tools/validate_events.py
"""
import json, sys, os
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ======================================================================
# KATALOG GERHANA NASA (Five Millennium Canon of Eclipses, Espenak & Meeus)
# Sumber: eclipse.gsfc.nasa.gov/OH/OH<TAHUN>.html
# Format: (tanggal, tipe, magnitudo, waktu_puncak_UT)
#   - Gerhana Matahari: "Eclipse Magnitude" (0.xx = sebagian/cincin, 1.xx = total)
#   - Gerhana Bulan: "Umbral Magnitude" (negatif = hanya penumbra)
# ======================================================================
NASA_ECLIPSES = [
    # --- 2026 ---
    ('2026-02-17', 'matahari', 'cincin',   0.96299, '12:12'),
    ('2026-03-03', 'bulan',    'total',    1.1507,  '11:34'),
    ('2026-08-12', 'matahari', 'total',    1.03863, '17:46'),
    ('2026-08-28', 'bulan',    'sebagian', 0.9299,  '04:13'),
    # --- 2027 ---
    ('2027-02-06', 'matahari', 'cincin',   0.92811, '16:00'),
    ('2027-02-20', 'bulan',    'penumbra', 0.9266,  '23:13'),   # penumbral mag
    ('2027-07-18', 'bulan',    'penumbra', 0.0014,  '16:03'),   # penumbral mag
    ('2027-08-02', 'matahari', 'total',    1.07903, '10:07'),
    ('2027-08-17', 'bulan',    'penumbra', 0.5456,  '07:14'),   # penumbral mag
    # --- 2028 ---
    ('2028-01-12', 'bulan',    'sebagian', 0.0662,  '04:13'),
    ('2028-01-26', 'matahari', 'cincin',   0.92079, '15:08'),
    ('2028-07-06', 'bulan',    'sebagian', 0.3892,  '18:20'),
    ('2028-07-22', 'matahari', 'total',    1.05602, '02:55'),
    ('2028-12-31', 'bulan',    'total',    1.2463,  '16:52'),
]

# magnitudo penumbra NASA (dipakai untuk gerhana penumbra — app memakai penumbral mag)
NASA_PENUMBRAL = {
    ('2027-02-20', 'bulan'): 0.9266,
    ('2027-07-18', 'bulan'): 0.0014,
    ('2027-08-17', 'bulan'): 0.5456,
}

def main():
    with open(os.path.join(ROOT, '_events_dump.json'), encoding='utf-8') as f:
        data = json.load(f)

    print('=' * 78)
    print('VALIDASI EVENT APLIKASI vs KATALOG RESMI NASA')
    print('=' * 78)
    print(f"Rentang: {data['range'][0]}–{data['range'][1]}")
    print()

    # ---------- 1. GERHANA ----------
    print('1. GERHANA — vs NASA Five Millennium Canon (Espenak & Meeus)')
    print('-' * 78)
    app = data['eclipses']
    used = set()
    ok = 0
    fail = 0

    for (tgl, tipe, jenis, mag_nasa, waktu) in NASA_ECLIPSES:
        # cari gerhana app pada tanggal yang sama (±1 hari) dan tipe sama
        cand = None
        for i, e in enumerate(app):
            if i in used: continue
            if e['tipe'] != tipe: continue
            d_app = datetime.strptime(e['tanggal'][:10], '%Y-%m-%d')
            d_nasa = datetime.strptime(tgl, '%Y-%m-%d')
            if abs((d_app - d_nasa).days) <= 1:
                cand = (i, e)
                break
        if not cand:
            print(f"  ✗ TIDAK DITEMUKAN  {tgl}  {tipe} {jenis} (NASA mag {mag_nasa})")
            fail += 1
            continue
        i, e = cand
        used.add(i)
        # bandingkan magnitudo
        # untuk gerhana penumbra, NASA memakai penumbral magnitude
        mag_ref = NASA_PENUMBRAL.get((tgl, tipe), mag_nasa)
        d_mag = abs(e['mag'] - mag_ref)
        jenis_ok = e['jenis'] == jenis
        mag_ok = d_mag < 0.15
        mark = 'OK' if (jenis_ok and mag_ok) else ('~' if jenis_ok else '✗')
        if jenis_ok and mag_ok: ok += 1
        else: fail += 1
        print(f"  {mark} {tgl}  {tipe:8s} NASA={jenis:9s} app={e['jenis']:9s} "
              f"mag {e['mag']:.3f} vs {mag_ref:.3f}  selisih {d_mag:.3f}")

    # gerhana app yang TIDAK ada di NASA = positif palsu
    extra = [e for i, e in enumerate(app) if i not in used]
    if extra:
        print()
        print(f"  POSITIF PALSU (app melaporkan, NASA tidak): {len(extra)}")
        for e in extra:
            print(f"    ✗ {e['tanggal'][:10]}  {e['tipe']} {e['jenis']} mag {e['mag']}")
    else:
        print()
        print('  Positif palsu: 0 (semua gerhana app ada di katalog NASA)')

    print(f"\n  Ringkasan: {ok} cocok, {fail} bermasalah, {len(extra)} palsu")

    # ---------- 2. HUJAN METEOR ----------
    print()
    print('2. HUJAN METEOR — cek tanggal puncak (data IMO)')
    print('-' * 78)
    # puncak resmi IMO (bulan-hari)
    IMO_PEAKS = {
        'Quadrantids': (1, 3), 'Lyrids': (4, 22), 'Eta Aquariids': (5, 6),
        'Perseids': (8, 12), 'Orionids': (10, 21), 'Leonids': (11, 17),
        'Geminids': (12, 14), 'Ursids': (12, 22),
    }
    m_ok = 0
    for m in data['meteor']:
        nama = m['nama']
        if nama in IMO_PEAKS:
            mm, dd = IMO_PEAKS[nama]
            t = datetime.strptime(m['tanggal'], '%Y-%m-%d')
            if t.month == mm and abs(t.day - dd) <= 1:
                m_ok += 1
            else:
                print(f"  ✗ {nama}: app {t.month}/{t.day} vs IMO {mm}/{dd}")
    print(f"  {m_ok}/{len(data['meteor'])} puncak hujan meteor cocok dengan IMO")
    print(f"  (nama yang dikenal: {sorted(set(m['nama'] for m in data['meteor']))})")

    # ---------- 3. FASE BULAN ----------
    print()
    print('3. FASE BULAN — cek jumlah per tahun (harus ~12-13 baru & purnama/tahun)')
    print('-' * 78)
    from collections import Counter
    per_year = Counter()
    for p in data['phases']:
        per_year[p['tanggal'][:4]] += 1
    for y in sorted(per_year):
        n = per_year[y]
        # 12-13 bulan baru + 12-13 purnama = 24-26 per tahun
        status = 'OK' if 22 <= n <= 27 else '✗'
        print(f"  {status} {y}: {n} fase (harapan 24-26: 12-13 baru + 12-13 purnama)")

    # ---------- 4. OPOSISI ----------
    print()
    print('4. OPOSISI PLANET — cek jumlah (planet luar ~1 oposisi/periode sinodis)')
    print('-' * 78)
    per_planet = Counter(o['planet'] for o in data['oppositions'])
    # periode sinodis (hari): mars 780, jupiter 399, saturnus 378, uranus 370, neptunus 367
    sinodis = {'mars': 780, 'jupiter': 399, 'saturn': 378, 'uranus': 370, 'neptune': 367}
    rentang_hari = (datetime.strptime(f"{data['range'][1]}-12-31", '%Y-%m-%d') -
                    datetime.strptime(f"{data['range'][0]}-01-01", '%Y-%m-%d')).days
    for p in ['mars', 'jupiter', 'saturn', 'uranus', 'neptune']:
        n_app = per_planet.get(p, 0)
        n_harap = rentang_hari / sinodis[p]
        status = 'OK' if abs(n_app - n_harap) < 1.5 else '~'
        print(f"  {status} {p:8s}: {n_app} oposisi (harapan ~{n_harap:.1f} dalam {rentang_hari/365.25:.1f} tahun)")

    # ---------- 5. KONJUNGSI ----------
    print()
    print('5. KONJUNGSI PLANET — cek pasangan yang wajar')
    print('-' * 78)
    pairs = Counter(c['pair'] for c in data['conjunctions'])
    print(f"  Total: {len(data['conjunctions'])} konjungsi, {len(pairs)} pasangan berbeda")
    for pair, n in pairs.most_common(8):
        print(f"    {pair}: {n}")
    # cek tidak ada planet redup berpasangan
    redup = [p for p in pairs if 'neptune' in p or 'uranus' in p]
    if redup:
        print(f"  ⚠ pasangan melibatkan planet redup (mag>6, sulit dilihat): {redup}")

    print()
    print('=' * 78)
    print('Sumber: NASA Five Millennium Canon (gerhana), IMO (meteor),')
    print('        JPL (posisi planet), Meeus (fase Bulan)')
    print('=' * 78)

if __name__ == '__main__':
    main()
