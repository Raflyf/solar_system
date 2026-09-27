#!/usr/bin/env python3
"""Unduh aset Blue Marble Next Generation dari NASA Visible Earth.

Aset ini adalah sumber untuk pembuatan tekstur permukaan resolusi tinggi
(patch permukaan POV). Ukurannya besar (21,8 MB untuk versi 21600x10800),
jadi TIDAK diikutkan ke repositori — jalankan skrip ini bila diperlukan.

Sumber RESMI (NASA Visible Earth, domain publik):
  https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/

Dua varian yang tersedia per bulan:
  world.topo.<YYYYMM>.3x21600x10800.jpg        (topografi, tanpa batimetri)
  world.topo.bathy.<YYYYMM>.3x21600x10800.jpg  (topografi + batimetri)

Jalankan: python tools/fetch_bmng.py [bulan]
  bulan: 1-12 (default 7 = Juli, warna vegetasi paling merata)
"""
import os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BULAN = {
    1: ('january', '200401'), 2: ('february', '200402'), 3: ('march', '200403'),
    4: ('april', '200404'), 5: ('may', '200405'), 6: ('june', '200406'),
    7: ('july', '200407'), 8: ('august', '200408'), 9: ('september', '200409'),
    10: ('october', '200410'), 11: ('november', '200411'), 12: ('december', '200412'),
}

def main():
    b = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    if b not in BULAN:
        print('Bulan harus 1-12'); return 1
    nama, kode = BULAN[b]
    outdir = os.path.join(ROOT, '_dl2')
    os.makedirs(outdir, exist_ok=True)

    base = 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography'
    urls = [
        ('%s/%s/world.topo.%s.3x21600x10800.jpg' % (base, nama, kode),
         os.path.join(outdir, 'bmng_%s_21600.jpg' % kode[:6])),
        ('%s/%s/world.topo.bathy.%s.3x21600x10800.jpg' % (base, nama, kode),
         os.path.join(outdir, 'bmng_bathy_%s_21600.jpg' % kode[:6])),
    ]

    UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')
    for url, dest in urls:
        if os.path.exists(dest):
            print('sudah ada:', os.path.basename(dest))
            continue
        print('mengunduh:', os.path.basename(dest), '...')
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=300) as r, open(dest, 'wb') as f:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
            print('  -> %d MB' % (os.path.getsize(dest) // 1048576))
        except Exception as e:
            print('  GAGAL:', e)
    print('Selesai. Aset di', outdir)
    return 0

if __name__ == '__main__':
    sys.exit(main())
