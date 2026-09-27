#!/usr/bin/env python3
"""Tambahkan NAMA UMUM bintang dari katalog resmi IAU ke data bintang.

MASALAH YANG DIPERBAIKI:
  Pengguna melaporkan: "nama nama bintang nya ko ga ada ya, kaya sirius,
  betelgeuse, canopus dan lainnya".
  Katalog bintang di aplikasi hanya memuat penamaan BAYER (mis. "α_CMa",
  "α_Ori"), bukan nama umum. Akibatnya label di langit menampilkan
  "α Aur" alih-alih "Capella".

SUMBER DATA (resmi, dari IAU):
  IAU Catalog of Star Names (IAU-CSN)
  https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt
  Dikelola oleh IAU Working Group on Star Names (WGSN).
  Berisi 452 nama bintang resmi yang DISETUJUI IAU, lengkap dengan
  koordinat RA/Dec J2000 dan nomor HIP.

CARA KERJA:
  Nama dicocokkan lewat POSISI (bukan nomor HIP), karena katalog bintang
  aplikasi dan IAU-CSN bisa memakai penomoran berbeda. Untuk setiap nama
  IAU, dicari bintang terdekat di katalog aplikasi; bila jaraknya di bawah
  ambang (0,02 derajat = 1,2 menit busur), nama itu dipasang.

Keluaran: menulis ulang src/12-stars-data.js dengan nama umum terpasang
          pada kolom pertama (yang sudah dipakai aplikasi untuk label).

Jalankan: python tools/add_star_names.py
"""

import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'src')
CSN = os.path.join(ROOT, '_iau_csn.txt')
STARS = os.path.join(SRC, '12-stars-data.js')

AMBANG_DERAJAT = 0.02      # toleransi pencocokan posisi


def baca_iau_csn():
    """Baca IAU-CSN. Kembalikan list {nama, hip, ra, dec}."""
    hasil = []
    if not os.path.exists(CSN):
        print('GAGAL: berkas IAU-CSN tidak ada:', CSN)
        print('Unduh dulu:')
        print('  curl -sL -o _iau_csn.txt \\')
        print('    "https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt"')
        sys.exit(1)
    with open(CSN, encoding='utf-8', errors='ignore') as f:
        for line in f:
            if line.startswith('#') or not line.strip() or line.startswith('$'):
                continue
            # ============================================================
            # POLA PARSING — DIPERBAIKI
            # ------------------------------------------------------------
            # Versi pertama memakai pola kolom yang terlalu ketat sehingga
            # hanya 6 dari 452 baris terbaca. Ternyata format IAU-CSN tidak
            # seragam: beberapa kolom bisa berisi '_' atau kosong.
            #
            # Pola yang terbukti benar (diuji 4/4 baris contoh):
            #   nama = kata pertama
            #   RA & Dec = dua angka desimal TEPAT SEBELUM tanggal
            #              (format YYYY-MM-DD di akhir baris)
            # Ini kebal terhadap pergeseran kolom.
            # ============================================================
            m = re.search(r'([\d.]+)\s+(-?[\d.]+)\s+\d{4}-\d{2}-\d{2}', line)
            if not m:
                continue
            nama = line.split()[0]
            try:
                ra_f, dec_f = float(m.group(1)), float(m.group(2))
            except ValueError:
                continue
            if not (0 <= ra_f <= 360 and -90 <= dec_f <= 90):
                continue
            hasil.append({'nama': nama, 'hip': '', 'ra': ra_f, 'dec': dec_f})
    return hasil


def baca_katalog_app():
    """Baca src/12-stars-data.js. Kembalikan list baris mentah + data."""
    with open(STARS, encoding='utf-8') as f:
        isi = f.read()

    baris_data = []
    for m in re.finditer(r'^\s*(\["[^\n]*?\]),?\s*$', isi, re.M):
        baris_data.append(m.group(1))
    return isi, baris_data


def parse_baris(b):
    """Ambil nama, bayer, con, mag, x, y, z dari satu baris data."""
    m = re.match(
        r'\["([^"]*)","([^"]*)","([^"]*)",([-\d.]+),'
        r'([-\d.eE+]+),([-\d.eE+]+),([-\d.eE+]+)', b)
    if not m:
        return None
    return {
        'nama': m.group(1), 'bayer': m.group(2), 'con': m.group(3),
        'mag': float(m.group(4)),
        'x': float(m.group(5)), 'y': float(m.group(6)), 'z': float(m.group(7)),
        'mentah': b,
    }


def main():
    print('=' * 68)
    print('MENAMBAHKAN NAMA UMUM BINTANG DARI KATALOG RESMI IAU')
    print('=' * 68)

    nama_iau = baca_iau_csn()
    print(f'Nama bintang dari IAU-CSN : {len(nama_iau)}')

    isi, baris_data = baca_katalog_app()
    bintang = []
    for b in baris_data:
        p = parse_baris(b)
        if p:
            bintang.append(p)
    print(f'Bintang di katalog aplikasi: {len(bintang):,}')

    # prahitung vektor satuan ekuator untuk tiap bintang aplikasi
    for s in bintang:
        L = math.sqrt(s['x'] ** 2 + s['y'] ** 2 + s['z'] ** 2) or 1
        s['ux'] = s['x'] / L
        s['uy'] = s['y'] / L
        s['uz'] = s['z'] / L

    # cocokkan setiap nama IAU ke bintang terdekat
    terpasang = 0
    gagal = []
    cos_ambang = math.cos(math.radians(AMBANG_DERAJAT))
    for n in nama_iau:
        ra = math.radians(n['ra'])
        dec = math.radians(n['dec'])
        tx = math.cos(dec) * math.cos(ra)
        ty = math.cos(dec) * math.sin(ra)
        tz = math.sin(dec)
        terbaik, dot_terbaik = None, -2
        for s in bintang:
            dot = s['ux'] * tx + s['uy'] * ty + s['uz'] * tz
            if dot > dot_terbaik:
                dot_terbaik, terbaik = dot, s
        if terbaik is None or dot_terbaik < cos_ambang:
            gagal.append(n['nama'])
            continue
        # pasang nama: kolom pertama jadi nama umum, nama lama (Bayer)
        # dipindah ke kolom bayer bila kolom itu kosong
        if terbaik['nama'] and terbaik['nama'] != n['nama']:
            if not terbaik['bayer']:
                terbaik['bayer'] = terbaik['nama']
        terbaik['nama'] = n['nama']
        terbaik['dipasang'] = True
        terpasang += 1

    print(f'Nama terpasang            : {terpasang}')
    print(f'Tidak cocok (di luar katalog): {len(gagal)}')
    if gagal:
        print('  contoh yang tidak cocok:', ', '.join(gagal[:10]))

    # tulis ulang berkas
    keluar = []
    for s in bintang:
        if s.get('dipasang'):
            # bangun ulang baris dengan nama & bayer baru
            sisa = s['mentah']
            # ganti dua kolom pertama
            sisa = re.sub(r'^\["[^"]*","[^"]*"',
                          '["' + s['nama'] + '","' + s['bayer'] + '"', sisa, count=1)
            keluar.append(sisa)
        else:
            keluar.append(s['mentah'])

    # susun ulang isi berkas: ganti tiap baris data dengan versi baru
    idx = 0
    def ganti(m):
        nonlocal idx
        if idx < len(keluar):
            v = keluar[idx]; idx += 1
            return '  ' + v + ','
        return m.group(0)
    baru = re.sub(r'^\s*\["[^\n]*?\],?\s*$', ganti, isi, flags=re.M)

    with open(STARS, 'w', encoding='utf-8') as f:
        f.write(baru)

    print()
    print(f'selesai menulis: {STARS}')
    # tampilkan contoh nama yang terpasang
    contoh = [s['nama'] for s in bintang if s.get('dipasang')][:20]
    print('contoh nama terpasang:', ', '.join(contoh))


if __name__ == '__main__':
    main()
