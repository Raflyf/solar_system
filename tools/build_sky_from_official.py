#!/usr/bin/env python3
"""Bangun data langit dari KATALOG RESMI + DATA STELLARIUM.

Sumber (semua resmi & terbuka):
  1. Katalog HYG v4.1 (astronexus/HYG-Database) — bintang dengan nomor HIP,
     posisi (RA/Dec J2000), magnitudo, warna B-V, proper motion.
     Berisi 119.626 bintang.
  2. Data rasi Stellarium (skycultures/modern/index.json) — 88 rasi resmi
     IAU dengan garis penghubung dalam NOMOR HIP. Ini data yang dipakai
     Stellarium sendiri, jadi garis rasi DIJAMIN benar.
  3. Nama bintang Stellarium (name.fab) — nama Bayer/Flamsteed per HIP.

Keluaran:
  src/12-stars-data.js   — STARS_LABELED + STARS_OTHER (format lama dipertahankan)
  src/13-constellations-data.js — CONSTELLATIONS (format lama: nama + segments
                                  berupa INDEKS ke larik gabungan)

Jalankan: python tools/build_sky_from_official.py
"""

import csv
import gzip
import io
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STELL = os.path.join(ROOT, '_stell')
SRC = os.path.join(ROOT, 'src')

HYG = os.path.join(STELL, 'hygdata_v41.csv')
HYG_GZ = os.path.join(STELL, 'hygdata_v40.csv.gz')
MODERN = os.path.join(STELL, 'modern_index.json')
NAMEFAB = os.path.join(STELL, 'name.fab')

# batas magnitudo: mata telanjang di langit gelap ~6,5
MAG_MAX = 6.5


def buka_hyg():
    if os.path.exists(HYG):
        return open(HYG, encoding='utf-8', errors='ignore')
    if os.path.exists(HYG_GZ):
        return io.TextIOWrapper(gzip.open(HYG_GZ, 'rb'), encoding='utf-8', errors='ignore')
    print('GAGAL: katalog HYG tidak ditemukan di', STELL)
    sys.exit(1)


def muat_nama_stellarium():
    """Baca name.fab: <HIP>|<nama>. Kembalikan dict HIP -> nama."""
    nama = {}
    if not os.path.exists(NAMEFAB):
        return nama
    with open(NAMEFAB, encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '|' not in line:
                continue
            kiri, kanan = line.split('|', 1)
            kiri = kiri.strip()
            if not kiri.isdigit():
                continue
            hip = int(kiri)
            # nama bisa punya beberapa alias dipisah ';' atau ','
            nm = kanan.split(';')[0].split(',')[0].strip()
            if nm and hip not in nama:
                nama[hip] = nm
    return nama


def muat_rasi_stellarium():
    """Baca index.json Stellarium. Kembalikan list {id, lines, common_name}."""
    with open(MODERN, encoding='utf-8') as f:
        d = json.load(f)
    return d.get('constellations', [])


def main():
    print('=' * 66)
    print('MEMBANGUN DATA LANGIT DARI KATALOG RESMI + DATA STELLARIUM')
    print('=' * 66)

    nama_hip = muat_nama_stellarium()
    print(f'Nama bintang Stellarium (name.fab): {len(nama_hip)} entri')

    rasi = muat_rasi_stellarium()
    print(f'Rasi Stellarium (index.json)       : {len(rasi)} rasi')

    # ---------- baca HYG, saring magnitudo ----------
    print(f'\nMembaca katalog HYG (mag <= {MAG_MAX}) ...')
    bintang = []          # dict per bintang
    hip_ke_index = {}     # HIP -> indeks di larik gabungan
    with buka_hyg() as f:
        reader = csv.DictReader(f)
        kol = reader.fieldnames
        print('kolom HYG:', ', '.join(kol[:14]), '...')
        for r in reader:
            try:
                mag = float(r['mag'])
            except (ValueError, KeyError):
                continue
            if mag > MAG_MAX:
                continue
            # hanya bintang (bukan objek lain); HYG: semua baris adalah bintang
            try:
                ra_h = float(r['ra'])          # jam
                dec_d = float(r['dec'])        # derajat
            except (ValueError, KeyError):
                continue
            # jarak: HYG punya 'dist' (parsec); kadang kosong
            try:
                dist_pc = float(r['dist']) if r['dist'] else 100.0
            except ValueError:
                dist_pc = 100.0
            if dist_pc <= 0:
                dist_pc = 100.0
            # warna B-V
            try:
                bv = float(r['ci']) if r['ci'] else 0.65
            except ValueError:
                bv = 0.65
            # proper motion (mas/yr -> rad/yr)
            try:
                pmra = float(r['pmra']) if r['pmra'] else 0.0
                pmdec = float(r['pmdec']) if r['pmdec'] else 0.0
            except ValueError:
                pmra = pmdec = 0.0
            # nomor HIP (bisa kosong)
            hip = 0
            try:
                if r.get('hip'):
                    hip = int(r['hip'])
            except ValueError:
                hip = 0
            # nama dari Stellarium (kalau ada) atau HYG
            nama = ''
            if hip and hip in nama_hip:
                nama = nama_hip[hip]
            if not nama:
                nama = (r.get('proper') or '').strip()

            bintang.append({
                'hip': hip, 'mag': mag, 'ra_h': ra_h, 'dec_d': dec_d,
                'dist_pc': dist_pc, 'bv': bv, 'pmra': pmra, 'pmdec': pmdec,
                'nama': nama,
                'con': (r.get('con') or '').strip(),
                'bayer': (r.get('bf') or '').strip(),
                'spect': (r.get('spect') or '').strip(),
            })

    print(f'Bintang dengan mag <= {MAG_MAX}: {len(bintang):,}')

    # urutkan: bintang bernama dulu (STARS_LABELED), sisanya STARS_OTHER.
    # Dalam masing-masing: paling terang dulu.
    bernama = [b for b in bintang if b['nama']]
    lain = [b for b in bintang if not b['nama']]
    bernama.sort(key=lambda b: b['mag'])
    lain.sort(key=lambda b: b['mag'])
    print(f'  bernama (STARS_LABELED): {len(bernama):,}')
    print(f'  lainnya (STARS_OTHER)   : {len(lain):,}')

    semua = bernama + lain
    for i, b in enumerate(semua):
        if b['hip']:
            hip_ke_index[b['hip']] = i

    # ---------- konversi ke format JS ----------
    def baris_js(b):
        """[nama, bayer, con, mag, x, y, z, r, g, b, spect, pmra, pmdec]
           x,y,z = kartesian ekuatorial J2000 (parsek)."""
        ra = math.radians(b['ra_h'] * 15.0)      # jam -> derajat -> radian
        dec = math.radians(b['dec_d'])
        d = b['dist_pc']
        x = d * math.cos(dec) * math.cos(ra)
        y = d * math.cos(dec) * math.sin(ra)
        z = d * math.sin(dec)
        r, g, bl = warna_dari_bv(b['bv'])
        # proper motion: HYG pmra dalam mas/yr pada arah RA*cos(dec)?
        # HYG v4 pmra sudah dalam mas/yr (arah RA), konversi ke rad/yr
        pmra_rad = b['pmra'] * 4.84813681e-9
        pmdec_rad = b['pmdec'] * 4.84813681e-9
        nama = b['nama'].replace('"', '').replace('\\', '')
        bayer = b['bayer'].replace('"', '').replace('\\', '')
        con = b['con'].replace('"', '').replace('\\', '')
        spect = b['spect'].replace('"', '').replace('\\', '')
        return ('["%s","%s","%s",%.2f,%.4f,%.4f,%.4f,%d,%d,%d,"%s",%.6e,%.6e]'
                % (nama, bayer, con, b['mag'], x, y, z, r, g, bl, spect,
                   pmra_rad, pmdec_rad))

    print('\nMenulis src/12-stars-data.js ...')
    out = []
    out.append('/* Data bintang dari KATALOG HYG v4.1 (astronexus/HYG-Database),')
    out.append('   disaring magnitudo <= %.1f (mata telanjang di langit gelap).' % MAG_MAX)
    out.append('   Format tiap baris:')
    out.append('     [nama, bayer, con, mag, x, y, z, r, g, b, spect, pmra, pmdec]')
    out.append('   x,y,z = kartesian ekuatorial J2000 dalam parsek.')
    out.append('   Nama bintang diambil dari data Stellarium (name.fab) bila ada. */')
    out.append('const STARS_LABELED = [')
    for b in bernama:
        out.append('  ' + baris_js(b) + ',')
    out.append('];')
    out.append('')
    out.append('const STARS_OTHER = [')
    for b in lain:
        out.append('  ' + baris_js(b) + ',')
    out.append('];')
    out.append('')
    with open(os.path.join(SRC, '12-stars-data.js'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))
    print('  selesai: %d + %d = %d bintang' % (len(bernama), len(lain), len(semua)))

    # ---------- konversi rasi Stellarium ke format lama ----------
    print('\nMenulis src/13-constellations-data.js ...')
    out2 = []
    out2.append('/* Garis rasi bintang — DATA RESMI STELLARIUM (skycultures/modern).')
    out2.append('   Sumber: https://github.com/Stellarium/stellarium')
    out2.append('           skycultures/modern/index.json')
    out2.append('   Garis dinyatakan dalam NOMOR HIP, lalu dipetakan ke INDEKS larik')
    out2.append('   gabungan (STARS_LABELED lalu STARS_OTHER) seperti format lama. */')
    out2.append('const CONSTELLATIONS = [')

    dipakai = 0
    hilang = 0
    n_rasi = 0
    for c in rasi:
        cid = c.get('id', '')
        # id contoh: "CON modern Aql" / "CON modern CVn" -> ambil token terakhir
        sing = cid.split()[-1] if cid else ''
        cn = c.get('common_name', {})
        nm = cn.get('native') or cn.get('english') or sing
        lines = c.get('lines', [])
        segs = []
        for seg in lines:
            idxs = []
            for hip in seg:
                idx = hip_ke_index.get(int(hip))
                if idx is None:
                    hilang += 1
                    idxs = None
                    break
                idxs.append(idx)
            if idxs and len(idxs) >= 2:
                segs.append(idxs)
                dipakai += len(idxs)
        if segs:
            n_rasi += 1
            js = json.dumps({'nama': sing, 'nama_panjang': nm, 'segments': segs},
                            ensure_ascii=False, separators=(',', ':'))
            out2.append('  ' + js + ',')
    out2.append('];')
    out2.append('')
    with open(os.path.join(SRC, '13-constellations-data.js'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(out2))

    print(f'  rasi ditulis        : {n_rasi}')
    print(f'  indeks bintang dipakai: {dipakai}')
    print(f'  HIP tidak ditemukan  : {hilang}')
    print('\nSELESAI.')


def warna_dari_bv(bv):
    """Konversi indeks warna B-V ke RGB (aproksimasi baku).
       Nilai acuan: B-V = -0,4 (biru) .. +2,0 (merah)."""
    bv = max(-0.4, min(2.0, bv))
    if bv < 0.0:
        r = 0.62 + 0.38 * (bv + 0.4) / 0.4
        g = 0.70 + 0.30 * (bv + 0.4) / 0.4
        b = 1.00
    elif bv < 0.4:
        r = 1.00
        g = 0.88 + 0.12 * (0.4 - bv) / 0.4
        b = 0.72 + 0.28 * (0.4 - bv) / 0.4
    elif bv < 1.0:
        f = (bv - 0.4) / 0.6
        r = 1.00
        g = 0.88 - 0.20 * f
        b = 0.72 - 0.32 * f
    else:
        f = min(1.0, (bv - 1.0) / 1.0)
        r = 1.00
        g = 0.68 - 0.20 * f
        b = 0.40 - 0.20 * f
    return (int(max(0, min(255, r * 255))),
            int(max(0, min(255, g * 255))),
            int(max(0, min(255, b * 255))))


if __name__ == '__main__':
    main()
