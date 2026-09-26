"""
Proses aset planet:
1. Pindahkan ke struktur folder akhir (assets/)
2. Buat normal map dari luminance (relief permukaan batuan)
3. Kompres ulang agar ukuran web wajar tanpa kehilangan ketajaman
"""
import os, glob
from PIL import Image, ImageFilter
import numpy as np

RAW = "assets_raw"
OUT = "assets_src"
os.makedirs(OUT, exist_ok=True)

# ---- pemetaan: nama sumber -> nama tujuan ----
PLAN = {
    "8k_mercury.jpg":        ("mercury.jpg",        True),
    "8k_venus_surface.jpg":  ("venus.jpg",          False),
    "8k_earth_daymap.jpg":   ("earth_day.jpg",      False),
    "8k_earth_clouds.jpg":   ("earth_clouds.jpg",   False),
    "8k_earth_nightmap.jpg": ("earth_night.jpg",    False),
    "8k_moon.jpg":           ("moon.jpg",           True),
    "8k_mars.jpg":           ("mars.jpg",           True),
    "8k_jupiter.jpg":        ("jupiter.jpg",        False),
    "8k_saturn.jpg":         ("saturn.jpg",         False),
    "2k_uranus.jpg":         ("uranus.jpg",         False),
    "2k_neptune.jpg":        ("neptune.jpg",        False),
    "8k_sun.jpg":            ("sun.jpg",            False),
    "8k_saturn_ring_alpha.png": ("saturn_ring.png", False),
    "8k_stars_milky_way.jpg":   ("milkyway.jpg",    False),
}

# unduh yang belum ada
missing = [s for s in PLAN if not os.path.exists(os.path.join(RAW, s))]
if missing:
    print("BELUM ADA:", missing)

def sobel_normal(src_path, dst_path, strength=2.6, blur=0.6):
    """Buat normal map dari kecerahan gambar (relief batuan)."""
    img = Image.open(src_path).convert("L")
    # perkecil dulu agar komputasi wajar, lalu simpan di ukuran itu
    w, h = img.size
    tw = min(w, 2048)
    th = int(h * tw / w)
    img = img.resize((tw, th), Image.LANCZOS)
    if blur > 0:
        img = img.filter(ImageFilter.GaussianBlur(blur))

    a = np.asarray(img, dtype=np.float32) / 255.0
    # gradien Sobel
    gx = np.zeros_like(a)
    gy = np.zeros_like(a)
    gx[:, 1:-1] = (a[:, 2:] - a[:, :-2]) * 0.5
    gy[1:-1, :] = (a[2:, :] - a[:-2, :]) * 0.5
    # bungkus horizontal (tekstur ekuirektangular nyambung di U)
    gx[:, 0]  = (a[:, 1] - a[:, -1]) * 0.5
    gx[:, -1] = (a[:, 0] - a[:, -2]) * 0.5

    nx = -gx * strength
    ny =  gy * strength
    nz = np.ones_like(a)
    ln = np.sqrt(nx*nx + ny*ny + nz*nz)
    nx, ny, nz = nx/ln, ny/ln, nz/ln

    rgb = np.stack([
        ((nx * 0.5 + 0.5) * 255),
        ((ny * 0.5 + 0.5) * 255),
        ((nz * 0.5 + 0.5) * 255),
    ], axis=-1).astype(np.uint8)
    Image.fromarray(rgb, "RGB").save(dst_path, "JPEG", quality=82, optimize=True)
    return Image.open(dst_path).size

print("=" * 62)
print("MEMPROSES ASET")
print("=" * 62)

report = []
for src, (dst, want_normal) in PLAN.items():
    sp = os.path.join(RAW, src)
    if not os.path.exists(sp):
        print(f"  LEWAT  {src} (tidak ada)")
        continue
    im = Image.open(sp)
    size = im.size
    # salin dengan kompresi wajar
    dp = os.path.join(OUT, dst)
    if dst.endswith(".png"):
        im.save(dp, "PNG", optimize=True)
    else:
        # pertahankan resolusi tinggi; kualitas 88 cukup untuk mata
        im.convert("RGB").save(dp, "JPEG", quality=88, optimize=True, progressive=True)
    out_mb = os.path.getsize(dp) / 1048576
    line = f"  OK  {dst:22s} {size[0]}x{size[1]}  {out_mb:5.1f} MB"
    if want_normal:
        nd = os.path.join(OUT, dst.replace(".jpg", "_normal.jpg"))
        nsz = sobel_normal(sp, nd)
        nmb = os.path.getsize(nd) / 1048576
        line += f"  + normal {nsz[0]}x{nsz[1]} {nmb:.1f} MB"
    print(line)
    report.append((dst, size))

print()
total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(f"TOTAL FOLDER assets/: {total/1048576:.1f} MB, {len(os.listdir(OUT))} berkas")
