"""
Perkuat Bintik Merah Besar pada tekstur Jupiter.

Temuan dari uji piksel: BRS ada di tekstur (u=0.203, v=0.656, 2.558 piksel
paling merah), tetapi ketika dirender warnanya nyaris sama dengan pita
oranye di sekitarnya sehingga tidak terbaca sebagai badai tersendiri.

Penyebab: peta Hubble OPAL yang dipakai adalah komposit multi-waktu yang
BRS-nya sudah memudar. Solusi: naikkan kemerahan khusus di area BRS dan
sekitar collar-nya, tanpa mengubah pita lain.
"""
import numpy as np
from PIL import Image, ImageFilter
import os

SRC = "assets_src/jupiter.jpg"
arr = np.asarray(Image.open(SRC).convert("RGB"), dtype=np.float32)
H, W = arr.shape[:2]
print(f"tekstur: {W}x{H}")

# pusat BRS dari analisis piksel sebelumnya
cx, cy = 0.203 * W, 0.656 * H
rx, ry = 0.030 * W, 0.026 * H
print(f"pusat BRS: ({cx:.0f},{cy:.0f}) radius ({rx:.0f},{ry:.0f})")

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)

# mask BRS: inti kuat, tepi lembut
core = np.clip(1.0 - d, 0, 1) ** 0.55
collar = np.clip(1.0 - np.abs(d - 1.15) / 0.55, 0, 1) ** 1.6
mask = np.clip(core + collar * 0.45, 0, 1)
mask = np.asarray(Image.fromarray((mask * 255).astype(np.uint8))
                  .filter(ImageFilter.GaussianBlur(W // 500)), dtype=np.float32) / 255.0

r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

# 1. Naikkan kemerahan: dorong R, tekan B
r2 = r * (1 + 0.42 * mask)
b2 = b * (1 - 0.40 * mask)

# 2. Tahan G sedikit agar tidak jadi oranye pucat
g2 = g * (1 - 0.14 * mask)

# 3. Inti BRS lebih terang (pusat badai naik lebih tinggi)
lum = (r + g + b) / 3.0
r2 = np.where(mask > 0.55, r2 * 1.06 + 6, r2)
g2 = np.where(mask > 0.55, g2 * 1.02 + 2, g2)

out = np.stack([r2, g2, b2], axis=2)
out = np.clip(out, 0, 255).astype(np.uint8)

Image.fromarray(out).save(SRC, "JPEG", quality=93, optimize=True, progressive=True)
print(f"BRS diperkuat: {SRC}  {os.path.getsize(SRC)/1024:.0f} KB")

# turunkan ke tier lo
Image.fromarray(out).resize((1024, 512), Image.LANCZOS).save(
    "assets/lo/jupiter.jpg", "JPEG", quality=88, optimize=True, progressive=True)
print("versi lo diperbarui")

# periksa hasil
arr2 = np.asarray(Image.open(SRC).convert("RGB"), dtype=np.int16)
redness = arr2[:, :, 0].astype(float) - (arr2[:, :, 1].astype(float) + arr2[:, :, 2].astype(float)) / 2
print(f"redness maksimum: {redness.max():.0f}  (sebelumnya 214)")
# redness di pusat BRS
py, px = int(cy), int(cx)
print(f"redness di pusat BRS: {redness[py, px]:.0f}")
band = redness[int(cy - ry * 2):int(cy + ry * 2), int(cx - rx * 2):int(cx + rx * 2)]
print(f"redness rata-rata area BRS: {band.mean():.0f}")

c = Image.fromarray(out).crop((int(cx - rx * 2.4), int(cy - ry * 2.4),
                               int(cx + rx * 2.4), int(cy + ry * 2.4)))
c = c.resize((c.width * 3, c.height * 3), Image.LANCZOS)
c.save("_grs_check.png")
print("pratinjau: _grs_check.png")
