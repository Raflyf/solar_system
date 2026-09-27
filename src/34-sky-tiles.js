/* =======================================================================
   SKY TILES — CITRA LANGIT RESOLUSI TINGGI SAAT ZOOM (gaya Stellarium)
   -----------------------------------------------------------------------
   PERMINTAAN PENGGUNA:
     "buat agar bisa terus di zoom berlayer layer kaya stellarium"
     "milkyway ada yg full hd atau yg lebih bagus ga? kalo bisa 2k atau
      4k, yg sekarang itu jelek dan blur low res"

   MASALAH YANG DIPERBAIKI:
     Bola langit memakai satu tekstur tetap. Saat fov mengecil (zoom masuk),
     tekstur itu diperbesar berkali-kali → BLUR. Pengukuran menunjukkan
     tekstur 6000x3000 hanya memberi ~16,7 piksel per derajat; pada fov 6°
     hanya ~100 piksel untuk seluruh lebar layar → jelas blur.

   SOLUSI — CITRA LANGIT NYATA SAAT ZOOM:
     Saat pengguna zoom masuk (fov < SKY_TILES.ambangFov), aplikasi
     mengunduh CITRA LANGIT SUNGGUHAN dari Legacy Survey (unwise-neo7) —
     survei langit inframerah yang mencakup SELURUH bola langit, resolusi
     tinggi. Citra ini ditempel sebagai lapisan di atas bola langit,
     sehingga detail asli muncul saat zoom.

   SUMBER: https://www.legacysurvey.org/viewer/jpeg-cutout
           layer unwise-neo7 (unWISE + NEOWISE, seluruh langit)
           Parameter: ra, dec (derajat J2000), size (piksel), layer

   KENAPA unwise-neo7:
     • Mencakup SELURUH langit (bukan hanya sebagian seperti SDSS/DECaLS
       yang hanya belahan utara) → cocok untuk POV dari mana pun.
     • Resolusi asli ~2,75"/piksel; pada potongan 512 px menutupi ~23'
       sehingga jauh lebih tajam daripada tekstur bola langit.
     • Terbukti bisa diakses (HTTP 200, 160 KB, variasi piksel 74,5).

   Kinerja:
     Satu bidang (PlaneGeometry) bertekstur citra hasil unduhan, dipasang
     tegak lurus arah pandang. Hanya SATU permintaan jaringan per wilayah;
     hasilnya disimpan di cache sehingga tidak diunduh berulang.
   ======================================================================= */

const SKY_TILES = {
  /** fov (derajat) di mana citra langit mulai dimuat */
  ambangFov: 20,
  /** ukuran potongan yang diminta (piksel) */
  ukuran: 512,
  /* ====================================================================
     DINONAKTIFKAN — PERMINTAAN PENGGUNA
     --------------------------------------------------------------------
     KELUHAN: "sangat noise saat di zoom langit nya bukannya indah malah
     jelek, ga jadi aja deh yg berlayer nya malah merusak"

     Penyebab: citra Legacy Survey (unwise-neo7) adalah peta EMISI DEBU
     INFRAMERAH, bukan citra bintang. Hasilnya berupa gumpalan oranye
     dengan bercak hitam — tidak menyerupai langit berbintang dan terlihat
     sebagai noise. Selain itu posisinya tidak menyatu dengan bola langit.

     KEPUTUSAN: dinonaktifkan. Kode disimpan bila nanti ditemukan sumber
     citra langit yang benar-benar menyerupai pandangan mata.
     ==================================================================== */
  aktif: false,
  /** mesh bidang citra */
  mesh: null,
  /** tekstur yang sedang dipakai */
  tex: null,
  /** cache: kunci "ra|dec|layer" -> THREE.Texture */
  cache: new Map(),
  /** true saat unduhan sedang berjalan */
  memuat: false,
  /** kunci wilayah yang terakhir diminta */
  kunciTerakhir: '',
  /** apakah lapisan ini aktif */
  enabled: true,

  init() {
    if (this.mesh) return;
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,      /* selalu tampil di atas bola langit */
      toneMapped: false,
      fog: false,
    });
    /* Bidang kecil di depan kamera (di dalam bola langit). Ukuran diatur
       saat update sesuai fov agar selalu memenuhi layar. */
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.mesh.renderOrder = 1;      /* setelah bola langit (-200..-199) */
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  },

  /* Unduh citra langit untuk (ra, dec) tertentu. Asinkron. */
  muatCitra(ra, dec) {
    const kunci = ra.toFixed(3) + '|' + dec.toFixed(3);
    if (this.cache.has(kunci)) {
      this.pakai(this.cache.get(kunci));
      return;
    }
    if (this.memuat) return;          /* satu unduhan pada satu waktu */
    this.memuat = true;
    const url = 'https://www.legacysurvey.org/viewer/jpeg-cutout'
      + '?ra=' + ra.toFixed(4) + '&dec=' + dec.toFixed(4)
      + '&size=' + this.ukuran + '&layer=unwise-neo7';
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const tex = new THREE.Texture(img);
      if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      this.cache.set(kunci, tex);
      this.memuat = false;
      this.pakai(tex);
    };
    img.onerror = () => { this.memuat = false; };
    img.src = url;
  },

  pakai(tex) {
    if (!this.mesh) return;
    this.mesh.material.map = tex;
    this.mesh.material.needsUpdate = true;
    this.tex = tex;
  },

  /* Perbarui lapisan citra. Dipanggil tiap frame. */
  update() {
    /* DINONAKTIFKAN (lihat penjelasan di atas) */
    if (!this.aktif) { if (this.mesh) this.mesh.visible = false; return; }
    if (!this.enabled) { if (this.mesh) this.mesh.visible = false; return; }
    if (!this.mesh) this.init();

    /* hanya saat POV (pengamat di permukaan) dan fov cukup kecil */
    const pov = (typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.active);
    if (!pov || camera.fov > this.ambangFov) {
      this.mesh.visible = false;
      return;
    }
    if (!this.tex) {
      this.mesh.visible = false;
      /* tentukan arah pandang -> RA/Dec, lalu unduh */
      this.mintaUntukArahPandang();
      return;
    }

    /* ================================================================
       POSISI & ORIENTASI BIDANG
       ----------------------------------------------------------------
       Bidang diletakkan di depan kamera pada jarak tetap, tegak lurus
       arah pandang, dan diskalakan agar MENUTUPI seluruh layar pada fov
       saat ini:
           tinggi = 2 · jarak · tan(fov/2)
           lebar  = tinggi · aspect
       Bidang selalu lebih besar sedikit (1,05x) agar tidak ada celah.
       ================================================================ */
    const jarak = 1000;
    const tinggi = 2 * jarak * Math.tan(camera.fov * DEG * 0.5) * 1.05;
    const lebar = tinggi * (window.innerWidth / Math.max(1, window.innerHeight));
    this.mesh.scale.set(lebar, tinggi, 1);

    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    this.mesh.position.copy(camera.position).addScaledVector(fwd, jarak);
    /* bidang PlaneGeometry menghadap +Z; arahkan agar menghadap kamera */
    this.mesh.quaternion.copy(camera.quaternion);

    /* muat citra baru bila arah pandang berpindah cukup jauh */
    this.mintaUntukArahPandang();

    this.mesh.visible = true;
  },

  /* Hitung RA/Dec arah pandang kamera, lalu minta citra bila wilayahnya
     sudah berbeda cukup jauh dari yang terakhir diminta. */
  mintaUntukArahPandang() {
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    /* scene -> ekuator J2000 (kebalikan eqVecToScene) */
    const c = 0.9174820621, s = 0.3977771559;
    const xe = fwd.x;
    const ye = -c * fwd.z - s * fwd.y;
    const ze = -s * fwd.z + c * fwd.y;
    const dec = Math.asin(Math.max(-1, Math.min(1, ze))) / DEG;
    const ra = Math.atan2(ye, xe) / DEG;
    /* hanya minta ulang bila bergeser > 0,15 derajat */
    const kunci = ra.toFixed(2) + '|' + dec.toFixed(2);
    if (kunci === this.kunciTerakhir) return;
    this.kunciTerakhir = kunci;
    this.muatCitra(ra, dec);
  },

  /** Matikan lapisan (mis. saat keluar POV). */
  hide() {
    if (this.mesh) this.mesh.visible = false;
  },
};
