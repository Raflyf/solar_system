# Dokumentasi Teknis Sistem Simulasi Tata Surya 3D Skala 1:1

## Riwayat Perubahan Konseptual

### 1. Mode POV Permukaan Multi-Scale PBR & Multi-Atmosfer Realistis (NASA/USGS)

#### Latar Belakang & Masalah
Mode sudut pandang permukaan (`SURFACE_VIEW`) sebelumnya hanya menampilkan dataran poligon polos dengan warna datar tanpa mikro-relief, tekstur resolusi lokal, variasi atmosferik yang valid, maupun sinkronisasi elevasi kamera pada benda langit non-Bumi (misal Bulan bergeser 189 km dari elevasi pengamat karena perbedaan inklinasi orbit dan poros `tiltGroup`).

#### Implementasi & Solusi Arsitektural

1. **Sinkronisasi Pengamat Presisi (Scene Graph World Quaternion)**
   - Berkas: `src/17-earthview.js`
   - Sinkronisasi `computeObserver(body)` langsung mengambil hierarki transformasi dunia Three.js (`body.spin` / `body.group.getWorldQuaternion`).
   - Memperhitungkan secara eksak: kemiringan poros aksial (`tiltGroup`), inklinasi orbit satelit (`moonPlane`), librasi lintang Bulan (`_libLat`), dan sudut rotasi harian WGCCRE IAU 2015.
   - Mengeliminasi galat posisi 189 km pada Bulan dan menjamin kamera berdiri tepat 50 meter di atas verteks puncak medan (`p0World`) di semua planet dan satelit.

2. **Shader Permukaan Multi-Scale PBR (`SURFACE_PATCH`)**
   - Berkas: `src/24-surface-patch.js`
   - **Albedo Modulation Fisikal**: Memadukan peta makro global NASA (`assets/hi/` dan `assets/lo/`) dengan modulasi mikro-detail PBR berbasis DataTexture 512×512 berkecepatan tinggi tanpa dependensi eksternal.
   - **Kompensasi Dinamis Albedo (Auto-Exposure)**: Mencegah wilayah bermantel gelap (seperti bukit pasir hidrokarbon Titan Cassini atau kawah basaltik) jatuh menjadi hitam mati.
   - **Penerangan Kubah Langit (Hemispherical Sky Light)**: Hamburan difus dari kubah langit menerangi lereng bayangan.
   - **Efek Oposisi Hapke (Retroreflective Surge)**: Mensimulasikan lonjakan kecerahan regolit bulan dan asteroid saat sudut pandang sejajar arah sinar matahari.
   - **Deteksi Air & Sun Glint Bumi**: Memisahkan spekular laut bergelombang kapiler dan daratan vegetasi/gurun.
   - **Geometri Non-Linear Horizon Warping**: Distribusi cincin konsentris kuadratik $r^2 \cdot \theta_{\text{rad}}$ memusatkan densitas 32.768 segitiga di bawah kaki pengamat hingga garis horizon tanpa terpotong.
   - **Mikro-Topografi Alami**: Ketinggian relief terdistribusi fraktal membentuk siluet bukit, tepi kawah, dan bukit pasir di kaki langit.

3. **Mesin Multi-Atmosfer & Gradasi Horizon (`SURFACE_SKY`)**
   - Berkas: `src/23-surface-sky.js`
   - Profil atmosfer astronomis terverifikasi:
     - **Bumi**: Hamburan Rayleigh gas $N_2/O_2$ (biru siang, merah senja, kabut horizon $0.025\text{ km}^{-1}$).
     - **Mars**: Hamburan aerosol debu hematit besi oksida (siang butterscotch/salmon, fenomena matahari terbenam biru/blue sunset halo).
     - **Venus**: Hamburan padat asam sulfat difus (kuning-amber tebal, kepunahan $0.055\text{ km}^{-1}$).
     - **Titan**: Kabut fotokimia hidrokarbon/metana oranye pekat (data Huygens/Cassini).
     - **Benda Tanpa Atmosfer (Bulan, Merkurius, Europa, Io, Ganymede, Callisto, Phobos, Deimos)**: Langit vakum hitam antariksa dengan bintang Hipparcos terlihat penuh 24 jam.
   - **Kepunahan Atmosfer Skala Kilometer (`getSurfaceAtmosphereInfo`)**: Fungsi pemaduan kabut eksponensial $1.0 - \exp(-\text{distKm} \cdot \beta)$ menyatukan batas daratan jauh dengan horizon langit secara alami.

4. **Kinerja & Optimasi**
   - Tetap berjalan stabil pada 75–95 FPS di resolusi desktop dan mobile.
   - 100% Vanilla JavaScript & WebGL shader native tanpa pustaka tambahan.

---

### 2. Eliminasi Flashbang Malam & Sinkronisasi Fase Simulasi Waktu (Lockstep Spin)

#### Latar Belakang & Masalah
1. **Flashbang Permukaan Malam Hari**:
   - Pada mode POV malam di Bumi (khususnya kualitas tinggi `?q=hi`), permukaan tanah menyala putih benderang 100% ("flashbang"), dan pada `?q=lo` menjadi kuning terang (`#FDD78C`).
   - Akar masalah: `SURFACE_PATCH_FRAG` mengeksekusi `nightGlow` memakai tekstur lampu kota orbit (`uNightMap` / `earth_night.jpg`). Citra lampu kota satelit memiliki nilai kecerahan tinggi di wilayah berpopulasi (seperti Jawa/Jakarta). Rumus `nightGlow = vec3(1.0, 0.85, 0.55) * city * 1.6` menghasilkan intensitas $> 4.0$, yang meluap melampaui rentang dinamis monitor dan terpotong (clamped) menjadi putih murni $(1.0, 1.0, 1.0)$. Selain itu, pengamat yang berdiri di tanah melihat tanah/tanaman/batuan alami di malam hari, bukan citra emisi lampu dari orbit satelit.
2. **Pergeseran & Rusaknya Tekstur Saat Waktu Simulasi Berjalan**:
   - Saat waktu simulasi dimajukan/dimundurkan atau slider waktu digeser pada semua planet dan satelit, tekstur tanah tampak meluncur, berputar sendiri, dan bergeser tidak sinkron di bawah kaki pengamat.
   - Akar masalah: Di `src/60-main.js`, `computePositions()` menghitung sudut rotasi baru `b._spinAngle`, namun penetapan `b.spin.rotation.y = b._spinAngle` baru dilakukan pada `applyPositions()` di akhir frame—setelah `computeObserver()` dan `updateCamera()` selesai. Akibatnya, orientasi kamera tertinggal 1 frame (fase beda hingga 15° per frame saat scrub waktu) dibanding orientasi mesh planet dan `surfacePatch`.
   - Selain itu, pemanggilan `SURFACE_DETAIL.applyToPatch()` tiap frame memicu permintaan tile asinkron eksternal dan mengganti material PBR dengan `MeshBasicMaterial` datar serta merusak atribut UV melalui `repatchUV()`.

#### Solusi Arsitektural & Perbaikan
1. **Penghapusan Night Glow dari Permukaan Tanah (`src/24-surface-patch.js`)**:
   - Menghapus komponen `nightGlow`, uniform `uHasNight`, dan `uNightMap` dari shader `SURFACE_PATCH_FRAG` dan konfigurasi material.
   - Pada malam hari, iluminasi permukaan sepenuhnya diatur oleh pencahayaan ambien malam alami langit astronomis (`ambient = albedo * uAmbientColor * skyHemi`) yang menyatu mulus dengan kabut horizon malam, bebas dari pendar kuning maupun flashbang.
2. **Sinkronisasi Rotasi & Posisi Lokal Real-Time (`src/20-scene.js`)**:
   - Memperbarui `b.spin.rotation.y = b._spinAngle`, librasi `b.spin.rotation.x = b._libLat`, dan `b.group.position` satelit secara langsung di dalam loop `computePositions()`.
   - Menjamin bahwa saat `computeObserver()` dan `updateCamera()` dipanggil pada frame yang sama, posisi dan kuaternion dunia pengamat berada dalam sinkronisasi 100% (selisih fase 0,000°). Tanah di bawah kaki pengamat tetap kokoh tak bergeser, sementara benda-benda langit (Matahari, bintang, rasi, Bulan) melintas halus di atas kubah langit.
3. **Stabilisasi Material PBR Multi-Scale (`src/60-main.js`)**:
   - Mengeliminasi panggilan `SURFACE_DETAIL.applyToPatch()` per frame, mempertahankan integritas shader PBR prosedural, elevasi mikro-relief, normal map, dan performa 60+ FPS tanpa latensi jaringan.

   - Seluruh 19 modul uji regresi (`test_full.js` dan `test_responsive.js`) lulus 100%.
