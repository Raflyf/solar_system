"""
Great Red Spot dengan pendekatan domain-warp.

Kenapa: menempel bentuk baru selalu terlihat seperti stiker, karena detail
awan di dalamnya lebih halus daripada pita di sekitarnya. Cara yang benar
adalah MEMUTARBALIKKAN (swirl) tekstur yang sudah ada, sehingga BRS mewarisi
seluruh detail awan asli, lalu diberi warna merah bata secara halus.
"""
import numpy as np
from PIL import Image, ImageFilter
import os

SRC = "assets_src/jupiter.jpg"
im = Image.open(SRC).convert("RGB")
arr = np.asarray(im, dtype=np.float32)
H, W = arr.shape[:2]
print(f"tekstur Jupiter: {W}x{H}")

# BRS pada ~22°LS
cx, cy = W * 0.30, H * 0.622
rx, ry = W * 0.048, H * 0.042

# ---------- 1. Domain warp: putaran (swirl) ----------
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
dx = (xx - cx) / rx
dy = (yy - cy) / ry
r = np.sqrt(dx * dx + dy * dy)
theta = np.arctan2(dy, dx)

# kekuatan putaran: maksimum di tepi, nol di pusat (seperti vorteks nyata)
falloff = np.exp(-((r - 0.62) ** 2) / (2 * 0.34 ** 2))
swirl_angle = 2.9 * falloff

# juga sedikit kompresi radial agar terlihat seperti pusaran
radial = 1.0 + 0.16 * falloff * np.sin(theta * 3.0)

sr = r * radial
sa = theta + swirl_angle
sx = cx + np.cos(sa) * sr * rx
sy = cy + np.sin(sa) * sr * ry

# batasi supaya hanya area BRS yang terpengaruh
region = np.clip(1.0 - (r - 1.0) * 1.6, 0, 1)[..., None]
sx = sx * region[..., 0] + xx * (1 - region[..., 0])
sy = sy * region[..., 0] + yy * (1 - region[..., 0])

# ---------- 2. Sampling bilinear ----------
x0 = np.clip(np.floor(sx).astype(np.int32), 0, W - 1)
y0 = np.clip(np.floor(sy).astype(np.int32), 0, H - 1)
x1 = np.clip(x0 + 1, 0, W - 1)
y1 = np.clip(y0 + 1, 0, H - 1)
fx = np.clip(sx - x0, 0, 1)[..., None]
fy = np.clip(sy - y0, 0, 1)[..., None]

a00 = arr[y0, x0]; a10 = arr[y0, x1]
a01 = arr[y1, x0]; a11 = arr[y1, x1]
top = a00 * (1 - fx) + a10 * fx
bot = a01 * (1 - fx) + a11 * fx
warped = top * (1 - fy) + bot * fy

# campur hasil warp dengan aslinya memakai mask berbentuk tidak beraturan
rnd = np.random.default_rng(7)
noise = rnd.random((H, W)).astype(np.float32)
noise = np.asarray(Image.fromarray((noise * 255).astype(np.uint8))
                   .filter(ImageFilter.GaussianBlur(W // 260)), dtype=np.float32) / 255.0

mask = np.clip(1.0 - (r - 0.88) * 1.9, 0, 1)
mask = np.clip(mask + (noise - 0.5) * 0.55, 0, 1)          # tepi bergerigi
mask = np.asarray(Image.fromarray((mask * 255).astype(np.uint8))
                  .filter(ImageFilter.GaussianBlur(W // 420)), dtype=np.float32) / 255.0
mask = mask[..., None]

out = arr * (1 - mask) + warped * mask

# ---------- 3. Warna BRS: tint merah bata dengan gradasi radial ----------
inner = np.clip(1.0 - r * 0.92, 0, 1) ** 0.85          # makin ke pusat makin kuat
inner = inner * mask[..., 0]
inner = np.asarray(Image.fromarray((inner * 255).astype(np.uint8))
                   .filter(ImageFilter.GaussianBlur(W // 500)), dtype=np.float32) / 255.0
inner = inner[..., None]

# warna inti pucat, tepi lebih gelap-merah
tint_core = np.array([214, 122, 84], dtype=np.float32)
tint_edge = np.array([140, 58, 38], dtype=np.float32)
r_norm = np.clip(r / 1.25, 0, 1)[..., None]
tint = tint_edge * r_norm + tint_core * (1 - r_norm)

# 'soft light' sederhana: pertahankan detail tekstur, ubah warnanya
lum = out.mean(axis=2, keepdims=True) / 255.0
colored = tint * (0.55 + 0.85 * lum)
colored = np.clip(colored, 0, 255)

out = out * (1 - inner) + colored * inner

# ---------- 4. Ekor turbulen di belakang BRS ----------
tail = np.zeros((H, W), dtype=np.float32)
for i in range(30):
    t = i / 30.0
    ex = cx + rx * (1.05 + t * 3.8)
    ey = cy + np.sin(t * 5.2) * ry * 0.5
    er_x = rx * (0.30 - t * 0.19)
    er_y = ry * (0.22 - t * 0.14)
    if er_x < 0.02: break
    d2 = ((xx - ex) / max(er_x * rx, 1)) ** 2 + ((yy - ey) / max(er_y * ry, 1)) ** 2
    tail += np.exp(-d2 * 1.7) * (1 - t) * 0.55

tail = np.asarray(Image.fromarray(np.clip(tail * 255, 0, 255).astype(np.uint8))
                  .filter(ImageFilter.GaussianBlur(W // 380)), dtype=np.float32) / 255.0
tail = tail[..., None] * 0.55
tail_col = np.array([196, 128, 96], dtype=np.float32)
out = out * (1 - tail) + tail_col * tail

out = np.clip(out, 0, 255).astype(np.uint8)
Image.fromarray(out).save(SRC, "JPEG", quality=92, optimize=True, progressive=True)
print(f"BRS (domain-warp) di ({cx:.0f},{cy:.0f}) r=({rx:.0f},{ry:.0f})")
print(f"tersimpan: {SRC}  {os.path.getsize(SRC)/1048576:.2f} MB")

lo = "assets/lo/jupiter.jpg"
if os.path.exists(lo):
    Image.fromarray(out).resize((1024, 512), Image.LANCZOS).save(
        lo, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"versi lo diperbarui: {lo}")

c = Image.fromarray(out).crop((int(cx - rx * 2.2), int(cy - ry * 2.2),
                               int(cx + rx * 3.2), int(cy + ry * 2.2)))
c = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
c.save("_grs_check.png")
print("pratinjau: _grs_check.png")
