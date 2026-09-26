# Tata Surya 3D — Jelajah Interaktif

Satu berkas HTML mandiri berisi tata surya 3D skala nyata yang bisa diterbangi dan di-zoom.

## Cara pakai

Buka `index.html` dengan klik dua kali (Chrome / Edge / Firefox terbaru).
Tidak perlu server, tidak perlu internet — three.js dan semua tekstur planet
sudah disematkan / dibuat secara prosedural di dalam berkas.

## Kontrol

| Tombol | Fungsi |
|---|---|
| `W` `A` `S` `D` | Terbang maju / kiri / mundur / kanan |
| `Q` `E` | Turun / naik |
| `Shift` | Turbo (6× lebih cepat) |
| Seret mouse | Putar pandangan |
| Roda mouse | Zoom — atau atur kecepatan terbang saat tidak mengikuti benda |
| Klik benda | Fokus & ikuti benda itu |
| `Spasi` | Lepas fokus (terbang bebas) |
| `1`–`8` | Lompat ke planet ke-1 s/d ke-8 |
| `0` | Lompat ke Matahari |
| `L` `O` `H` `P` | Label / garis orbit / bantuan / jeda |

## Isi

- **Matahari** + **8 planet** + **10 satelit alami** (Bulan, Phobos, Deimos,
  Io, Europa, Ganymede, Callisto, Titan, Rhea, Iapetus, Titania, Triton)
- **Cincin Saturnus** (dengan Divisi Cassini), cincin tipis Uranus & Neptunus
- **Sabuk asteroid** 2.400 batuan antara Mars dan Jupiter
- **Tur terpandu** otomatis keliling tata surya
- Panel data nyata untuk setiap benda (radius, jarak, periode, suhu, dll.)

## Skala

Seluruh model memakai **satu skema skala yang konsisten**:

- Jarak antar planet: **nyata** (1 unit = 1 jari-jari Bumi = 6.371 km)
- Radius semua benda: nyata **× 4**
- Jarak planet–bulan: nyata **× 4**

Jadi proporsi sistem tetap nyata, hanya ukuran benda yang diperbesar 4× agar
terlihat jelas saat diterbangi. Tanpa pembesaran itu, Bumi hanya 0,00004 piksel
pada jarak antarplanet.

## Struktur proyek

```
solarsistem/
├── index.html          ← hasil akhir (berkas tunggal, inilah yang dibuka)
├── build.js            ← penggabung: node build.js
└── src/
    ├── 00-textures.js  ← mesin tekstur prosedural (noise, fbm, palet, kawah)
    ├── 10-data.js      ← data astronomi (radius, orbit, rotasi, info)
    ├── 20-scene.js     ← pembangunan scene three.js
    ├── 30-controls.js  ← kamera, penerbangan, tur
    ├── 40-ui.html      ← struktur antarmuka
    ├── 50-style.css    ← gaya tampilan
    ├── 60-main.js      ← pemuatan, UI, gelung render
    └── vendor/three.min.js
```

Untuk mengubah apa pun: sunting berkas di `src/`, lalu jalankan `node build.js`
untuk menyusun ulang `index.html`.

## Catatan teknis

- three.js r149 (MIT) disematkan agar berjalan offline.
- `logarithmicDepthBuffer` aktif — wajib, karena rentang pandang membentang dari
  permukaan bulan (± 0,3 unit) hingga Neptunus (700.000 unit).
- Tekstur planet dibuat saat runtime di canvas: noise nilai periodik + fbm,
  termasuk benua & tudung es Bumi, pita awan Jupiter/Saturnus, kawah Merkurius
  dan Bulan, serta Bintik Merah Besar.
- Penanda navigasi (titik berwarna) membuat planet tetap bisa ditemukan pada
  skala nyata, dan otomatis menghilang saat kamera sudah dekat.
