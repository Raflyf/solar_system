#!/usr/bin/env python3
"""Buang tekstur langit menjadi array abu-abu untuk uji orientasi Node.

Menghasilkan _tex_gray.json: { w, h, data: [0..255, ...] }
Dipakai oleh tools/test_sky_orientation.js (Node tidak punya dekoder JPEG).

Jalankan: python tools/dump_tex_gray.py
"""
import json
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'assets', 'hi', 'milkyway_eso_reproj.jpg')
OUT = os.path.join(ROOT, '_tex_gray.json')

im = Image.open(SRC).convert('L')
# perkecil supaya berkas JSON tidak terlalu besar (tetap cukup untuk uji)
im = im.resize((1024, 512), Image.LANCZOS)
w, h = im.size
data = list(im.getdata())

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump({'w': w, 'h': h, 'data': data}, f)

print(f'ditulis: {OUT}')
print(f'  ukuran: {w}x{h}, {len(data):,} piksel, {os.path.getsize(OUT)//1024} KB')
