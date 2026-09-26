"""
Siapkan tekstur Jupiter final dari peta Hubble OPAL 2019 (PIA19643/2019).

Peta ini punya keunggulan: Bintik Merah Besar ASLI (bukan tempelan) pada
posisi ~19,5% / 62%, plus detail turbulen yang kaya.

Masalahnya warna Hubble OPAL agak pucat. Jupiter sebenarnya lebih pekat,
jadi saturasi dinaikkan secukupnya + kontras halus, tanpa mengubah struktur.
"""
import numpy as np
from PIL import Image, ImageEnhance
import os

SRC = "assets_raw/_jup2019.img"
DST = "assets_src/jupiter.jpg"

im = Image.open(SRC).convert("RGB")
W, H = im.size
print(f"sumber: {W}x{H}")

# buang bilah hitam (letterbox) di atas & bawah
arr = np.asarray(im)
rows = np.where(arr.mean(axis=(1, 2)) > 8)[0]
if len(rows) > 10:
    top, bot = rows[0], rows[-1] + 1
    print(f"letterbox dibuang: y {top}..{bot}")
    im = im.crop((0, top, W, bot))
    W, H = im.size
    print(f"setelah potong: {W}x{H}")

# paksa rasio 2:1 untuk pemetaan ekuirektangular yang benar
target_h = W // 2
if H != target_h:
    if H > target_h:
        off = (H - target_h) // 2
        im = im.crop((0, off, W, off + target_h))
    else:
        im = im.resize((W, target_h), Image.LANCZOS)
    print(f"rasio 2:1 -> {im.size}")

# naikkan saturasi & kontras agar menyerupai Jupiter sebenarnya
im = ImageEnhance.Color(im).enhance(1.55)
im = ImageEnhance.Contrast(im).enhance(1.10)
im = ImageEnhance.Brightness(im).enhance(1.04)

# sedikit pertajam detail turbulen
from PIL import ImageFilter
im = im.filter(ImageFilter.UnsharpMask(radius=2.0, percent=95, threshold=3))

im.save(DST, "JPEG", quality=92, optimize=True, progressive=True)
print(f"tersimpan: {DST}  {im.size}  {os.path.getsize(DST)/1048576:.2f} MB")

lo = "assets/lo/jupiter.jpg"
if os.path.exists(lo):
    im.resize((1024, 512), Image.LANCZOS).save(lo, "JPEG", quality=88,
                                              optimize=True, progressive=True)
    print(f"versi lo: {lo}")

# pratinjau area BRS (19.5% , 62%)
cx, cy = int(W * 0.195), int(H * 0.62)
c = im.crop((max(0, cx - W // 8), max(0, cy - H // 6),
             min(W, cx + W // 6), min(H, cy + H // 6)))
c = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
c.save("_grs_check.png")
print("pratinjau BRS: _grs_check.png")
