# Tata Surya 3D — Simulasi Skala 1:1 dengan Tekstur Asli NASA

Simulasi tata surya 3D dengan **skala 1:1 sebenarnya** dan **tekstur permukaan
asli** dari NASA / USGS / Hubble. Bisa diterbangi, dan setiap planet dapat
di-zoom sampai permukaan seperti Google Earth.

**Demo:** `index.html` (butuh server — lihat Cara pakai di bawah)

---

## Cara pakai

### Lokal

Tekstur dimuat sebagai berkas terpisah, jadi halaman harus disajikan lewat
HTTP (bukan dibuka langsung dari `file://`). Cara termudah:

```bash
cd solarsistem
python -m http.server 8000
# lalu buka http://localhost:8000
```

Atau pakai ekstensi "Live Server" di VS Code.

### Online

Lihat bagian **Deploy** di bawah.

---

## Kontrol

| Tombol | Fungsi |
|---|---|
| `W` `A` `S` `D` | Terbang maju / kiri / mundur / kanan |
| `Q` `E` | Turun / naik |
| `Shift` | Turbo (6× lebih cepat) |
| Seret mouse | Putar pandangan |
| **Roda mouse** | **Zoom sampai menyentuh permukaan planet** |
| Klik benda | Fokus & ikuti benda itu |
| **`M`** | **Tampilkan seluruh sistem satelit** planet itu |
| `Spasi` | Lepas fokus (terbang bebas) |
| `1`–`8` | Lompat ke planet ke-1 s/d ke-8 |
| `0` | Lompat ke Matahari |
| `L` `O` `H` `P` | Label / garis orbit / bantuan / jeda |

### Cara melihat satelit

Pada skala 1:1 satelit **selalu** sub-piksel saat zoom normal — Bulan cuma
0,01 px, Io 0,000 px. Jadi ada tiga cara menemukannya:

1. **Klik benda di daftar "Jelajahi"** (panel kiri) — mis. Bulan di bawah Bumi
2. **Tekan `M`** — kamera menarik ke jarak yang memuat seluruh orbit satelit
3. **Klik tombol "🛰 Satelit"** di panel info

Saat kamera menjauh untuk memuat orbit, kamera **menyesuaikan sendiri**
(auto-fit) sehingga satelit yang terus bergerak tidak keluar layar.
Setiap satelit punya penanda berwarna + label + cincin orbit.

---

## Skala 1 : 1

Ini yang membedakan proyek ini: **tidak ada pembesaran sama sekali.**

| | Nilai |
|---|---|
| Jarak antar planet | Nyata (1 unit = 1 jari-jari Bumi = 6.371 km) |
| Radius semua benda | Nyata, **tanpa faktor pembesaran** |
| Jarak planet–bulan | Nyata |

Verifikasi terukur di aplikasi:

| Benda | Radius di aplikasi | Radius nyata | Cocok? |
|---|---|---|---|
| Bumi | 1,0000 | 1,0000 | ✓ |
| Bulan | 0,2727 | 0,2727 | ✓ |
| Phobos | 0,00177 | 0,00177 | ✓ |

Konsekuensinya: dari jauh planet memang **tampak seperti titik kecil** — itu
memang keadaan sebenarnya di alam. Karena itulah ada **penanda navigasi**
(titik berwarna) agar planet tetap bisa ditemukan, dan penanda itu otomatis
menghilang saat kamera sudah dekat.

**Kalau ingin planet terlihat lebih besar dari kenyataan**, ubah satu baris di
`src/10-data.js`:

```js
const SIZE_FACTOR = 4.0;        // planet diperbesar 4× (jarak tetap nyata)
```

---

## Isi

- **Matahari** + **8 planet** + **12 satelit alami**
- **Cincin Saturnus** dengan Divisi Cassini (shader khusus: ketebalan,
  pencahayaan, dan bayangan planet pada cincin)
- **Sabuk asteroid** 2.400 batuan
- **Bima Sakti** nyata sebagai latar (peta 8K, dikalibrasi galaktik —
  lihat catatan di bawah)
- **Tur terpandu** otomatis keliling tata surya
- Panel data nyata per benda (radius, jarak, periode, suhu, jumlah satelit)

> **Catatan kalibrasi Bima Sakti.** Tekstur `assets/hi/milkyway.jpg`
> (Solar System Scope) adalah peta **galaktik** dengan konvensi
> `u = 0,5 − l/360` dan `v = 0,5 + b/180` (kutub selatan galaksi di tepi
> atas citra). Kuaternion skybox dihitung dari tiga vektor basis nyata:
> pusat galaksi (l=0°, b=0°) → sumbu +X bola, kutub galaksi selatan
> (b=−90°) → sumbu +Y bola. Arah `u` diverifikasi empiris: LMC (l=280,5°),
> Carina, M8, M42, dan Antares hanya jatuh di gumpalan terang citra pada
> konvensi ini, sementara titik kontrol langit kosong tetap gelap.
> Konvensi `+l` akan mencerminkan langit timur-barat — jangan diubah tanpa
> menjalankan ulang uji yang sama.

### Fitur realisme

| Fitur | Keterangan |
|---|---|
| **Zoom ke permukaan** | Sampai ~50 km di atas permukaan Bumi |
| **Siang/malam Bumi** | Shader khusus: peta hari + **lampu kota** dari peta malam NASA |
| **Awan Bumi** | Lapisan awan 8K terpisah, bergerak relatif terhadap permukaan |
| **Kilau atmosfer** | Semburat biru di tepi, mengikuti arah Matahari |
| **Relief batuan** | Normal map untuk Merkurius, Bulan, dan Mars (kawah terlihat) |
| **Bintik Merah Besar** | Ada di tekstur Jupiter (dari peta Hubble) |
| **Terminator** | Garis siang/malam nyata di semua planet |

---

## Simulasi waktu

Slider waktu punya **12 tingkat**, dari sangat lambat sampai sangat cepat:

| Tingkat | Keterangan |
|---|---|
| 1 dtk = 1 detik | mengamati rotasi secara nyata |
| 1 dtk = 1 menit | |
| 1 dtk = 15 menit | |
| 1 dtk = 1 jam | |
| 1 dtk = 6 jam | |
| **1 dtk = 1 hari** | *default* |
| 1 dtk = 1 minggu | |
| 1 dtk = 1 bulan | |
| 1 dtk = 3 bulan | |
| 1 dtk = 1 tahun | |
| 1 dtk = 10 tahun | |
| 1 dtk = 1 abad | melihat revolusi planet luar |

Waktu juga **diperlambat otomatis** saat kamera sangat dekat permukaan
(0,4% kecepatan normal), supaya permukaan tidak berputar terlalu cepat
untuk diamati.

---

## Sumber aset

Semua tekstur permukaan berasal dari citra nyata:

| Sumber | Dipakai untuk |
|---|---|
| [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0) | Matahari, Merkurius, Venus, Bumi (hari/awan/malam), Bulan, Mars, Jupiter, Saturnus, Uranus, Neptunus, cincin, Bima Sakti |
| [NASA / Hubble OPAL](https://commons.wikimedia.org/wiki/Category:Maps_of_Jupiter) | Peta Jupiter dengan Bintik Merah Besar |
| [NASA / USGS](https://astrogeology.usgs.gov/) via Wikimedia Commons | Io, Europa, Ganymede, Callisto, Titan, Rhea, Iapetus, Titania, Triton, Phobos, Deimos |

Aset mentah disimpan di `assets_raw/`, hasil olahan di `assets/hi/` dan
`assets/lo/`.

### Tingkat kualitas

Tersedia dua tingkat, dipilih otomatis berdasarkan kemampuan GPU
(deteksi lewat `WEBGL_debug_renderer_info`):

| Tingkat | Ukuran | Untuk |
|---|---|---|
| `assets/hi/` | 12 MB | GPU diskrit / perangkat kuat |
| `assets/lo/` | 3 MB | GPU terintegrasi / seluler |

Paksa manual dengan URL: `index.html?q=hi` atau `index.html?q=lo`.
Tombol **◈ Kualitas** di UI juga bisa mengalihkan.

> **Kenapa dua tingkat?** Tekstur 8K RGBA memakai 134 MB VRAM masing-masing.
> Delapan di antaranya akan memakai >1 GB dan membuat GPU kelas menengah
> kehabisan memori. Karena itu resolusi diturunkan sekali saat build.

---

## Struktur proyek

```
solarsistem/
├── index.html            ← hasil akhir (buka ini)
├── build.js              ← penggabung: node build.js
├── assets/
│   ├── hi/               ← tekstur resolusi tinggi
│   └── lo/               ← tekstur ringan
├── assets_raw/           ← sumber mentah (tidak dipakai saat runtime)
├── tools/                ← skrip olah aset (Python)
│   ├── process_assets.py       ← normal map + kompresi
│   ├── fetch_moon_textures.py  ← unduh peta bulan dari Commons
│   ├── make_tiers.py           ← hasilkan hi/ dan lo/
│   ├── make_jupiter.py         ← Jupiter dari peta Hubble
│   └── enhance_grs.py          ← perkuat Bintik Merah Besar
└── src/
    ├── 00-textures.js    ← tekstur prosedural (cadangan bila aset gagal)
    ├── 05-assets.js      ← pemuat aset + bilah kemajuan
    ├── 10-data.js        ← data astronomi & skala
    ├── 20-scene.js       ← pembangunan scene + floating origin
    ├── 25-materials.js   ← shader Bumi, cincin, Matahari
    ├── 30-controls.js    ← kamera, penerbangan, tur
    ├── 40-ui.html        ← struktur antarmuka
    ├── 50-style.css      ← gaya tampilan
    ├── 60-main.js        ← pemuatan, UI, gelung render
    └── vendor/three.min.js
```

Untuk mengubah apa pun: sunting berkas di `src/`, lalu `node build.js`.

---

## Catatan teknis

### Floating origin (titik asal mengambang)

Ini bagian tersulit dari skala 1:1. Saat kamera menempel di permukaan Bumi,
koordinat dunia mencapai 23.000 unit sementara jarak kamera hanya 0,02 unit.
Rasio ~1.000.000 : 1 melampaui presisi `float32`, sehingga geometri hancur dan
planet tidak terlihat.

Solusinya: **kamera selalu berada di titik asal (0,0,0)**, dan seluruh tata
surya digeser relatif terhadap kamera. Semua koordinat yang dirender bernilai
kecil, jadi presisi float selalu penuh.

Urutan di gelung render (penting, tidak boleh ditukar):

```
1. computePositions()   → hitung posisi ABSOLUT semua benda
2. updateCamera()       → tetapkan rebaseOffset untuk frame ini
3. applyPositions()     → geser benda memakai offset yang SAMA
4. render
```

Kalau urutannya salah, benda dan kamera memakai offset berbeda frame dan
planet akan tampak melompat.

### Pencahayaan

`PointLight` Matahari memakai `decay = 0` dengan intensity **1,25**. Nilai ini
berperan sebagai pengali langsung albedo. Sempat dipakai 3,2 — akibatnya
seluruh permukaan planet terbakar menjadi putih dan Bintik Merah Besar hilang.
Emissive dipertahankan sangat kecil (0,035–0,10) hanya agar detail sisi gelap
tidak hilang total.

### `logarithmicDepthBuffer`

Wajib aktif: rentang pandang membentang dari 50 km di atas permukaan Bumi
hingga Neptunus (700.000 unit). Semua shader kustom menyertakan chunk
`logdepthbuf_pars_vertex/fragment`, kalau tidak kedalamannya salah dan benda
tidak muncul.

---

## Deploy

Situs statis murni — tidak ada build step saat deploy, `index.html` sudah jadi.

### Vercel

1. <https://vercel.com/new> → **Import Git Repository** → pilih `solar_system`
2. Framework Preset: **Other**
3. Build Command: **kosongkan** · Output Directory: **kosongkan**
4. **Deploy**

Atau lewat CLI:

```bash
npm i -g vercel
vercel login
vercel --prod
```

Hasilnya: `https://solar-system-<hash>.vercel.app`. Setiap `git push` ke `main`
akan otomatis deploy ulang.

### Alternatif

- **GitHub Pages:** Settings → Pages → Source: `main` / root → jadi di
  `https://raflyf.github.io/solar_system/`
- **Netlify / Cloudflare Pages:** drag-and-drop folder ini, atau hubungkan repo
  (build command kosong, publish directory: `.`)

### Catatan deploy

- `vercel.json` hanya mengatur `cleanUrls` dan header cache. Boleh dihapus —
  tanpa itu pun deploy tetap berhasil.
- `index.html` 717 KB, ditambah tekstur 12 MB (hi) atau 3 MB (lo).
- WebGL wajib aktif. Di peramban tanpa WebGL, aplikasi menampilkan pesan galat
  yang jelas alih-alih layar kosong.
- Tidak ada permintaan ke pihak ketiga — semua aset dari domain sendiri.

---

## Lisensi aset

- **three.js** — MIT (header lisensi dipertahankan di `index.html`)
- **Tekstur Solar System Scope** — CC BY 4.0 (atribusi: solarsystemscope.com)
- **Peta NASA / USGS / Hubble** — domain publik
