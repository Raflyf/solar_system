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
            # POLA PARSING — DIPERBAIKI LAGI (nama bernomor dua kata)
            # ------------------------------------------------------------
            # Versi sebelumnya memakai line.split()[0] sehingga nama yang
            # terdiri dari DUA KATA terpotong:
            #     "Rigil Kentaurus"   -> "Rigil"      (SALAH)
            #     "Barnard's Star"    -> "Barnard's"  (SALAH)
            #     "Alula Australis"   -> "Alula"      (SALAH)
            # Ada 40 nama seperti itu di katalog IAU.
            #
            # FORMAT KOLOM IAU-CSN: dua kolom pertama adalah nama yang sama
            # (ASCII dan berdiakritik). Jadi nama diambil sebagai teks
            # sebelum kolom nama KEDUA yang identik — atau, lebih andal,
            # sebagai segalanya sebelum penanda designasi (HR/HD/V* atau
            # kode rasi 3 huruf).
            #
            # CARA YANG DIPAKAI: potong baris pada posisi kolom ke-2 yang
            # sama dengan kolom ke-1. Bila tidak ketemu (nama ASCII berbeda
            # dari berdiakritik, mis. "Belenos Bélénos"), pakai aturan:
            # nama = semua kata sebelum kode rasi 3 huruf pertama.
            # ============================================================
            m = re.search(r'([\d.]+)\s+(-?[\d.]+)\s+\d{4}-\d{2}-\d{2}', line)
            if not m:
                continue

            nama = ambil_nama(line)
            if not nama:
                continue
            try:
                ra_f, dec_f = float(m.group(1)), float(m.group(2))
            except ValueError:
                continue
            if not (0 <= ra_f <= 360 and -90 <= dec_f <= 90):
                continue
            hasil.append({'nama': nama, 'hip': '', 'ra': ra_f, 'dec': dec_f})
    return hasil


# kode rasi 3 huruf resmi IAU (dipakai sebagai penanda batas nama)
KODE_RASI = {
    'And', 'Ant', 'Aps', 'Aqr', 'Aql', 'Ara', 'Ari', 'Aur', 'Boo', 'Cae',
    'Cam', 'Cnc', 'CVn', 'CMa', 'CMi', 'Cap', 'Car', 'Cas', 'Cen', 'Cep',
    'Cet', 'Cha', 'Cir', 'Col', 'Com', 'CrA', 'CrB', 'Crv', 'Crt', 'Cru',
    'Cyg', 'Del', 'Dor', 'Dra', 'Equ', 'Eri', 'For', 'Gem', 'Gru', 'Her',
    'Hor', 'Hya', 'Hyi', 'Ind', 'Lac', 'Leo', 'LMi', 'Lep', 'Lib', 'Lup',
    'Lyn', 'Lyr', 'Men', 'Mic', 'Mon', 'Mus', 'Nor', 'Oct', 'Oph', 'Ori',
    'Pav', 'Peg', 'Per', 'Phe', 'Pic', 'Psc', 'PsA', 'Pup', 'Pyx', 'Ret',
    'Sge', 'Sgr', 'Sco', 'Scl', 'Sct', 'Ser', 'Sex', 'Tau', 'Tel', 'Tri',
    'TrA', 'Tuc', 'UMa', 'UMi', 'Vel', 'Vir', 'Vol', 'Vul',
}


def ambil_nama(line):
    """Ambil nama bintang (bisa dua kata) dari satu baris IAU-CSN.

    Strategi:
      1. Bila kolom 1 dan kolom 2 identik (nama ASCII = nama berdiakritik),
         nama = teks sampai sebelum kolom 2.
      2. Selain itu, cari kode rasi 3 huruf pertama; nama = kata-kata
         sebelum kata yang mendahuluinya (designasi Bayer/HR).
    """
    kata = line.split()
    if len(kata) < 3:
        return kata[0] if kata else ''

    # --- strategi 1: dua kolom nama identik ---
    if kata[0] == kata[1]:
        return kata[0]
    # cari posisi kata yang sama dengan kata[0] (kolom 2)
    for i in range(1, min(4, len(kata))):
        if kata[i] == kata[0]:
            return ' '.join(kata[:i])

    # --- strategi 2: potong sebelum penanda designasi ---
    # penanda: 'HR', 'HD', 'HIP', 'XO-', 'V*', 'Gl', 'KIC', 'TOI', atau kode rasi
    for i, w in enumerate(kata[1:], start=1):
        if w in KODE_RASI:
            # kode rasi ditemukan; nama = kata sebelum designasi Bayer/HR
            # mundur melewati penanda HR/angka/huruf Yunani
            j = i - 1
            while j > 0:
                wj = kata[j]
                if (re.match(r'^(HR|HD|HIP|Gl|KIC|TOI|XO-|V\*|WASP|HAT|Kepler)', wj)
                        or re.match(r'^[\d.]+$', wj)
                        or re.match(r'^[a-z]{2,3}\d*$', wj)     # alf, bet, tet01
                        or re.match(r'^[α-ωΑ-Ω]', wj)            # huruf Yunani
                        or wj in ('A', 'B', 'C', 'Aa', 'Ab', '_')):
                    j -= 1
                else:
                    break
            if j >= 1:
                return ' '.join(kata[:j + 1])
    # fallback: satu kata pertama
    return kata[0]


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
