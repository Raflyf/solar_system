# Rencana: POV Realistis Semua Planet + Google Earth Mode

## Permintaan user (verbatim)
1. "pov dari bumi nya masih kurang realistis bumi nya, itu hanya sekedar nempel
   saja, tidak ada environment bumi 3d realistic nya, jadi jelek banget hanya
   datar tidak ada animasi siang malam nya"
2. "tidak ada pilihan menyalakan atmosfer nya"
3. "untuk pov gitu buat semua planet bisa pov dan juga satelite nya, jangan
   hanya bumi saja"
4. "untuk bumi itu tambahkan lagi agar bisa masuk ke dalam seperti google earth
   dan google map"
5. "pokonya improve lagi tapi tetaap pertahankan performa agar tidak lag,
   minimal 60fps"
6. "semua hal seperti asset, data, perhitungan, koordinat, dan lainnya kamu
   akses saja semua dari internet seperti web nasa, starlink dan lainnya"

## Aset yang sudah diunduh (NASA resmi)
- `_dl2/bmng_jul_21600.jpg` — Blue Marble Next Generation 21600×10800
  (500 m/piksel, topografi + batimetri, NASA Visible Earth)
  URL: assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/

## Arsitektur saat ini
- `src/17-earthview.js` — EARTH_VIEW: POV Bumi (lat/lon + GMST → titik permukaan,
  kerangka ENU: zenith/north/east)
- `src/21-earthview-ui.js` — UI modal POV Bumi
- `src/30-controls.js` — updateCamera() membaca EARTH_VIEW.active
- `src/20-scene.js` — atmosfer cangkang fresnel (ATMOS_VERT/FRAG), makeAtmosphere()
- `src/19-poles.js` — poleQuaternion(bodyKey) sudah ada untuk SEMUA body

## Rencana implementasi

### FASE 1 — Generalisasi POV ke semua planet & satelit
File baru: `src/17-surface-view.js` (menggantikan EARTH_VIEW, tetap kompatibel)

Konsep: POV di planet apa pun = sama seperti Bumi, tetapi memakai:
- `poleQuaternion(key)` → orientasi poros planet itu (SUDAH ADA)
- `b.spinAngle` → rotasi harian planet itu (SUDAH ADA)
- `b.radiusKm` → radius (SUDAH ADA)

Titik pengamat pada body `b` dengan lat/lon:
```
local = (cos φ cos λ, sin φ, −cos φ sin λ) × (1 + elev/R)
local.applyAxisAngle(Y, spinAngle)      // rotasi harian body
local.applyQuaternion(poleQuaternion(b.key))  // poros body
pos = local + b.absPos
```
zenith = local.normalize()
north = komponen kutub body ⊥ zenith
east = north × zenith

Untuk satelit yang tidally-locked (Bulan), porosnya menghadap Bumi —
poleQuaternion sudah menangani ini lewat 19-poles.js.

UI: dropdown "Pilih benda langit" (semua planet + satelit), input lat/lon.
Preset kota hanya untuk Bumi; planet lain pakai lat/lon manual + preset menarik
(mis. Olympus Mons di Mars, Tycho di Bulan).

### FASE 2 — Environment 3D realistis (bukan "nempel")
Masalah saat ini: permukaan terlihat datar karena
  (a) tidak ada relief/normal map saat dekat
  (b) horizon tidak terlihat (kamera terlalu rendah? FOV?)
  (c) tidak ada atmosfer yang bisa dinyalakan

Perbaikan:
1. **Relief permukaan**: normal map per planet (sudah ada beberapa: mars_normal,
   mercury_normal, moon_normal). Tambah prosedural untuk yang belum ada.
   Saat dekat, aktifkan normalScale lebih besar.
2. **Horizon**: verifikasi matematis bahwa horizon terlihat saat el>0.
   Horizon muncul bila ada lengkungan permukaan + objek di kejauhan.
   Tambahkan grid/penanda atau pastikan camera.near/far benar.
3. **Toggle atmosfer**: checkbox di panel POV — nyalakan/matikan selubung
   atmosfer (saat ini dimatikan paksa di POV; harus jadi pilihan).
   Saat dinyalakan di POV, atmosfer harus dirender dari DALAM (FrontSide),
   bukan BackSide — sehingga terlihat sebagai kabut horizon, bukan menutupi.
4. **Animasi siang-malam**: otomatis dari rotasi planet + posisi Matahari.
   Verifikasi: saat matahari terbit, langit berubah warna (gradasi).
   Tambahkan warna langit dinamis berdasarkan elevasi Matahari:
     - Matahari > 0°: biru siang
     - −6°..0°: jingga senja
     - < −18°: hitam malam + bintang
5. **Pencahayaan permukaan**: pastikan terminator terlihat (sisi malam gelap).

### FASE 3 — Google Earth mode untuk Bumi (zoom sampai darat)
Pendekatan: **tile system dari NASA GIBS (WMTS resmi, gratis)**
  Base: https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/
  Layer: BlueMarble_ShadedRelief_Bathymetry, VIIRS_CityLights_2012, dll.

Alternatif lebih ringan (tanpa tile server): 
  - Gunakan Blue Marble 21600×10800 yang sudah diunduh
  - Pecah jadi tile 2048×2048 di 3 level zoom (LOD)
  - Load hanya tile yang terlihat kamera
  - Total: level 0 (1 tile global 4096×2048), level 1 (4×2 tile), level 2 (8×4)

Rencana konkret (LOD lokal, tanpa dependensi eksternal saat runtime):
  - Level 0: 4096×2048 (selalu dimuat) — 900 KB
  - Level 1: potongan 21600×10800 → 6 tile 5400×5400 (dimuat saat zoom sedang)
  - Level 2: potongan lebih detail untuk region (butuh data lebih tinggi)
  
CATATAN PENTING: Google Earth bisa zoom sampai bangunan karena punya citra
resolusi cm dari Google. NASA Blue Marble hanya 500 m/piksel. Untuk "zoom
sampai darat" yang realistis, opsi:
  a. NASA GIBS tile (250 m/px untuk beberapa layer) — resmi & gratis
  b. Sentinel-2 cloudless (10 m/px) — EOX, CC BY
  c. NASA Worldview snapshots

Implementasi bertahap: mulai dari (a) NASA GIBS sebagai tile source.

### FASE 4 — Verifikasi performa (60 fps)
- Ukur fps dengan rAF di browser
- Pastikan tile loading tidak memblokir
- Pastikan tekstur besar di-decode async (createImageBitmap)
- Target: tetap 60 fps saat diam, tidak drop di bawah 30 saat loading

## Urutan pengerjaan
1. FASE 1 (generalisasi POV) — fondasi
2. FASE 2 (environment) — kepuasan visual
3. FASE 3 (Google Earth) — fitur besar
4. FASE 4 (verifikasi) — jaminan kualitas

## Catatan sumber data resmi
- Blue Marble NG: assets.science.nasa.gov (NASA Visible Earth)
- NASA GIBS: gibs.earthdata.nasa.gov (WMTS, gratis, resmi)
- Elevation: SRTM (NASA/USGS) via GIBS atau OpenTopography
- Bintang: HYG v3.8 (sudah dipakai)
- Koordinat planet: IAU WGCCRE 2015 (sudah dipakai)
