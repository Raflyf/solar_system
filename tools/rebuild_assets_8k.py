"""
Bangun ulang assets/hi/ dari sumber 8K (assets_src/ dan assets_raw/).
Tujuan: permintaan pengguna "asset mode pov sangat tidak HD, cari asset
paling HD dan realistik".

TEMUAN: assets_src/ dan assets_raw/ SUDAH berisi citra 8192x4096 (8K) untuk
Bumi, Bulan, Merkurius, Venus, Mars, Jupiter, Saturnus, Matahari — tetapi
assets/hi/ yang benar-benar dimuat aplikasi masih 4096x2048 (4K). Aset 8K
tersebut belum pernah diproses masuk. Skrip ini memprosesnya.

Aturan:
  - Sumber diambil dari assets_src/ bila ada (sudah dipotong/diperbaiki),
    else assets_raw/.
  - assets/hi/  = resolusi PENUH 8K (8192x4096), JPEG q92.
  - assets/lo/  = 2048x1024 (naik dari 1024x512), JPEG q85.
  - Normal map: dibuat dari luminance, 2048x1024 untuk hi, 1024x512 untuk lo.
    Ditambahkan untuk Bumi (sebelumnya TIDAK ADA -> permukaan rata) dan
    planet/satelit batuan yang belum punya.
  - Verifikasi ukuran akhir dicetak; tidak ada klaim tanpa bukti.
"""
import os, sys
from PIL import Image, ImageFilter
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_A = os.path.join(ROOT, 'assets_src')     # sumber sudah dipotong
SRC_B = os.path.join(ROOT, 'assets_raw')     # sumber mentah
HI = os.path.join(ROOT, 'assets', 'hi')
LO = os.path.join(ROOT, 'assets', 'lo')
os.makedirs(HI, exist_ok=True)
os.makedirs(LO, exist_ok=True)

# nama tujuan -> kandidat sumber (urut prioritas), buat normal map?
PLAN = [
    ('earth_day.jpg',    ['earth_day.jpg', '8k_earth_daymap.jpg'],   True),
    ('earth_clouds.jpg', ['earth_clouds.jpg', '8k_earth_clouds.jpg'], False),
    ('earth_night.jpg',  ['earth_night.jpg', '8k_earth_nightmap.jpg'], False),
    ('moon.jpg',         ['moon.jpg', '8k_moon.jpg'],                True),
    ('mars.jpg',         ['mars.jpg', '8k_mars.jpg'],                True),
    ('mercury.jpg',      ['mercury.jpg', '8k_mercury.jpg'],          True),
    ('venus.jpg',        ['venus.jpg', '8k_venus_surface.jpg'],      False),
    ('jupiter.jpg',      ['jupiter.jpg', '8k_jupiter.jpg'],          False),
    ('saturn.jpg',       ['saturn.jpg', '8k_saturn.jpg'],            False),
    ('sun.jpg',          ['sun.jpg', '8k_sun.jpg'],                  False),
    ('uranus.jpg',       ['uranus.jpg', '2k_uranus.jpg'],            False),
    ('neptune.jpg',      ['neptune.jpg', '2k_neptune.jpg'],          False),
    ('io.jpg',           ['io.jpg', '_moon_io.org&utm_campaign=imageinfo&utm_content=original'], True),
    ('europa.jpg',       ['europa.jpg', '_europa_big.jpg'],          True),
    ('ganymede.jpg',     ['ganymede.jpg', '_moon_ganymede.org&utm_campaign=imageinfo&utm_content=original'], True),
    ('callisto.jpg',     ['callisto.jpg', '_moon_callisto.org&utm_campaign=imageinfo&utm_content=original'], True),
    ('titan.jpg',        ['titan.jpg', '_moon_titan.org&utm_campaign=imageinfo&utm_content=original'], False),
    ('rhea.jpg',         ['rhea.jpg', '_moon_rhea.org&utm_campaign=imageinfo&utm_content=original'], True),
    ('iapetus.jpg',      ['iapetus.jpg', '_moon_iapetus.org&utm_campaign=imageinfo&utm_content=original'], True),
    ('triton.jpg',       ['triton.jpg', '_moon_triton.org&utm_campaign=imageinfo&utm_content=original'], True),
    ('titania.jpg',      ['titania.jpg', '_moon_titania.org&utm_campaign=imageinfo&utm_content=original'], True),
    ('phobos.jpg',       ['phobos.png', '_moon_phobos.org&utm_campaign=imageinfo&utm_content=original'], True),
    ('deimos.jpg',       ['deimos.jpg', '_deimos.jpg'],              True),
]

HI_MAX = 8192
LO_MAX = 2048
NORMAL_HI = 2048
NORMAL_LO = 1024


def find_src(names):
    for n in names:
        for d in (SRC_A, SRC_B):
            p = os.path.join(d, n)
            if os.path.exists(p):
                return p
    return None


def sobel_normal(src_path, dst_path, size, strength=2.6, blur=0.6):
    img = Image.open(src_path).convert('L')
    w, h = img.size
    tw = min(w, size)
    th = max(1, int(round(h * tw / w)))
    img = img.resize((tw, th), Image.LANCZOS)
    if blur > 0:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(img, dtype=np.float32) / 255.0
    gx = np.zeros_like(a); gy = np.zeros_like(a)
    gx[:, 1:-1] = (a[:, 2:] - a[:, :-2]) * 0.5
    gy[1:-1, :] = (a[2:, :] - a[:-2, :]) * 0.5
    gx[:, 0]  = (a[:, 1] - a[:, -1]) * 0.5
    gx[:, -1] = (a[:, 0] - a[:, -2]) * 0.5
    nx = -gx * strength; ny = gy * strength; nz = np.ones_like(a)
    ln = np.sqrt(nx*nx + ny*ny + nz*nz)
    nx, ny, nz = nx/ln, ny/ln, nz/ln
    rgb = np.stack([((nx*0.5+0.5)*255), ((ny*0.5+0.5)*255), ((nz*0.5+0.5)*255)], axis=-1).astype(np.uint8)
    Image.fromarray(rgb, 'RGB').save(dst_path, 'JPEG', quality=85, optimize=True)
    return Image.open(dst_path).size


def resize_to(im, maxw):
    w, h = im.size
    if w <= maxw:
        return im
    tw = maxw
    th = max(1, int(round(h * tw / w)))
    return im.resize((tw, th), Image.LANCZOS)


print('=' * 74)
print('MEMBANGUN ULANG ASET DARI SUMBER 8K')
print('=' * 74)

report = []
for dst, cands, want_normal in PLAN:
    sp = find_src(cands)
    if not sp:
        print(f'  LEWAT  {dst:20s} (sumber tidak ada)')
        continue
    im = Image.open(sp)
    if im.mode not in ('RGB', 'L'):
        im = im.convert('RGB')
    src_size = im.size

    # ---- HI: resolusi penuh (maks 8192) ----
    hi_im = resize_to(im, HI_MAX)
    hi_path = os.path.join(HI, dst)
    if dst.endswith('.png'):
        hi_im.save(hi_path, 'PNG', optimize=True)
    else:
        hi_im.convert('RGB').save(hi_path, 'JPEG', quality=92, optimize=True, progressive=True)

    # ---- LO: 2048 (naik dari 1024) ----
    lo_im = resize_to(im, LO_MAX)
    lo_path = os.path.join(LO, dst)
    if dst.endswith('.png'):
        lo_im.save(lo_path, 'PNG', optimize=True)
    else:
        lo_im.convert('RGB').save(lo_path, 'JPEG', quality=85, optimize=True, progressive=True)

    line = f'  OK  {dst:20s} src {src_size[0]}x{src_size[1]} -> hi {hi_im.size[0]}x{hi_im.size[1]}  lo {lo_im.size[0]}x{lo_im.size[1]}'

    if want_normal:
        nd_hi = os.path.join(HI, dst.replace('.jpg', '_normal.jpg').replace('.png', '_normal.jpg'))
        s1 = sobel_normal(sp, nd_hi, NORMAL_HI)
        nd_lo = os.path.join(LO, dst.replace('.jpg', '_normal.jpg').replace('.png', '_normal.jpg'))
        s2 = sobel_normal(sp, nd_lo, NORMAL_LO)
        line += f'  + normal {s1[0]}x{s1[1]}'
    print(line)
    report.append(dst)

print()
print('Ringkasan:')
print(f'  Berkas diproses : {len(report)}')
print(f'  HI  (8192)      : {len([f for f in os.listdir(HI)])} berkas, '
      f'{sum(os.path.getsize(os.path.join(HI, f)) for f in os.listdir(HI))/1048576:.1f} MB')
print(f'  LO  (2048)      : {len([f for f in os.listdir(LO)])} berkas, '
      f'{sum(os.path.getsize(os.path.join(LO, f)) for f in os.listdir(LO))/1048576:.1f} MB')
