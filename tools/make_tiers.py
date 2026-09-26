"""
Hasilkan dua tingkat kualitas aset dari sumber resolusi tinggi.

Alasan: tekstur 8K RGBA memakai 134 MB VRAM masing-masing. Delapan di antaranya
= >1 GB dan akan membuat GPU kelas menengah kehabisan memori. Jadi:

  assets/hi/  -> untuk GPU kuat   (Bumi 4K, planet 2K, bulan 1K)
  assets/lo/  -> untuk GPU lemah  (Bumi 2K, planet 1K, bulan 512)

Semua diturunkan dari sumber asli yang sudah diunduh, jadi tidak ada
penurunan mutu berantai.
"""
import os
from PIL import Image, ImageFilter
import numpy as np

Image.MAX_IMAGE_PIXELS = None
RAW = "assets_raw"
SRC = "assets_src"     # hasil proses tahap 1 (resolusi penuh)

# nama -> (lebar hi, lebar lo)
TIERS = {
    # planet utama
    "earth_day.jpg":     (4096, 2048),
    "earth_clouds.jpg":  (4096, 2048),
    "earth_night.jpg":   (2048, 1024),
    "moon.jpg":          (4096, 2048),
    "mercury.jpg":       (2048, 1024),
    "venus.jpg":         (2048, 1024),
    "mars.jpg":          (2048, 1024),
    "jupiter.jpg":       (2048, 1024),
    "saturn.jpg":        (2048, 1024),
    "uranus.jpg":        (1024,  512),
    "neptune.jpg":       (1024,  512),
    "sun.jpg":           (2048, 1024),
    "milkyway.jpg":      (2048, 1024),
    # bulan-bulan
    "io.jpg":            (1024,  512),
    "europa.jpg":        (1024,  512),
    "ganymede.jpg":      (1024,  512),
    "callisto.jpg":      (1024,  512),
    "titan.jpg":         (1024,  512),
    "rhea.jpg":          (1024,  512),
    "iapetus.jpg":       (1024,  512),
    "titania.jpg":       (1024,  512),
    "triton.jpg":        (1024,  512),
    "phobos.png":        (1024,  512),
    "deimos.jpg":        (1024,  512),
}

# cincin: profil radial panjang, jangan diperkecil drastis
RING_SRC = "saturn_ring.png"
RING_W = (4096, 2048)

def emit(src_path, dst_path, width, quality=90):
    im = Image.open(src_path)
    w, h = im.size
    if w != width:
        im = im.resize((width, max(1, int(h * width / w))), Image.LANCZOS)
    if dst_path.endswith(".png"):
        im.save(dst_path, "PNG", optimize=True)
    else:
        im.convert("RGB").save(dst_path, "JPEG", quality=quality, optimize=True, progressive=True)
    return im.size, os.path.getsize(dst_path)

for tier, idx in (("hi", 0), ("lo", 1)):
    out = os.path.join("assets", tier)
    os.makedirs(out, exist_ok=True)
    print("=" * 66)
    print(f"TINGKAT: {tier.upper()}  ->  {out}/")
    print("=" * 66)
    total = 0
    for name, widths in TIERS.items():
        sp = os.path.join(SRC, name)
        if not os.path.exists(sp):
            print(f"  LEWAT {name}")
            continue
        w = widths[idx]
        dp = os.path.join(out, name)
        dim, sz = emit(sp, dp, w)
        total += sz
        print(f"  {name:20s} {dim[0]:5d}x{dim[1]:5d}  {sz/1048576:6.2f} MB")

    # cincin
    rp = os.path.join(SRC, RING_SRC)
    if os.path.exists(rp):
        dp = os.path.join(out, RING_SRC)
        dim, sz = emit(rp, dp, RING_W[idx])
        total += sz
        print(f"  {RING_SRC:20s} {dim[0]:5d}x{dim[1]:5d}  {sz/1048576:6.2f} MB")

    # normal map (relief) — ukuran mengikuti tier
    for name in ("mercury", "moon", "mars"):
        sp = os.path.join(SRC, f"{name}_normal.jpg")
        if not os.path.exists(sp):
            continue
        dp = os.path.join(out, f"{name}_normal.jpg")
        dim, sz = emit(sp, dp, 1024 if tier == "hi" else 512, quality=80)
        total += sz
        print(f"  {name}_normal.jpg      {dim[0]:5d}x{dim[1]:5d}  {sz/1048576:6.2f} MB")

    print(f"\n  TOTAL {tier.upper()}: {total/1048576:.1f} MB\n")
