/* =======================================================================
   SKY LOD — ZOOM BERLAPIS LANGIT (gaya Stellarium)
   -----------------------------------------------------------------------
   PERMINTAAN PENGGUNA:
     "buat agar bisa terus di zoom berlayer layer kaya stellarium"
     "milkyway ada yg full hd atau yg lebih bagus ga? kalo bisa 2k atau 4k,
      yg sekarang itu jelek dan blur low res"

   MASALAH YANG DIPERBAIKI:
     Bola langit memakai SATU tekstur tetap (2048x1024). Saat pengguna zoom
     masuk (fov mengecil), tekstur itu diperbesar berkali-kali sehingga
     terlihat BLUR — persis keluhan pengguna.

   SOLUSI — LOD (Level of Detail) BERTINGKAT:
     Bola langit memuat DUA tekstur sekaligus dan memilih yang tepat
     berdasarkan fov:
       • fov >= 25°  : tekstur 2048 (ringan, untuk pandangan luas)
       • fov <  25°  : tekstur 8192 (detail, untuk zoom masuk)
     Pergantian dilakukan halus (cross-fade opasitas) supaya tidak ada
     "kedipan" saat berpindah lapisan.

   KENAPA DUA MESH, BUKAN SATU:
     Satu mesh hanya bisa memakai satu tekstur pada satu waktu. Dengan dua
     mesh yang bertumpuk (radius sedikit berbeda), kita bisa menyilangkan
     opasitasnya sehingga transisi halus — inilah "berlapis" yang diminta.

   Kinerja: dua mesh, dua draw call. Tekstur besar hanya dimuat saat
   benar-benar diperlukan (dimuat di latar belakang).
   ======================================================================= */

const SKY_LOD = {
  /* ====================================================================
     DINONAKTIFKAN — PERMINTAAN PENGGUNA
     --------------------------------------------------------------------
     KELUHAN: "malah jadi ada milkyway yg berbeda saat di zoom itu aneh dan
     ga jelas buram dan beda posisi, jadi sangat noise saat di zoom langit
     nya bukannya indah malah jelek, ga jadi aja deh yg berlayer nya malah
     merusak"

     Penyebab: dua lapisan (2048 Stellarium + 6000 ESO) berasal dari
     CITRA BERBEDA, sehingga saat cross-fade posisi & warna pita Bima Sakti
     tidak persis sama -> terlihat "bergeser" dan seperti dua galaksi.
     Ditambah lagi tekstur ESO punya titik bintang yang menimbulkan noise.

     KEPUTUSAN: dinonaktifkan total. Bola langit kembali memakai SATU
     tekstur Stellarium 2048 yang sudah disetujui pengguna.
     Kode disimpan (bukan dihapus) bila nanti ada sumber pita yang benar-
     benar konsisten untuk semua tingkat zoom.
     ==================================================================== */
  aktif: false,
  meshHi: null,        /* bola langit tekstur resolusi tinggi */
  meshLo: null,        /* bola langit tekstur resolusi rendah */
  texHi: null,
  texLo: null,
  ambangFov: 25,
  pitaFade: 8,
  siap: false,

  /* Bangun lapisan langit. Dipanggil setelah tekstur tersedia. */
  init() {
    if (!this.aktif) return;          /* dinonaktifkan */
    if (this.siap) return;
    if (typeof TEX === 'undefined' || !TEX.milkyway || !TEX.milkyway.map) return;
    this.texLo = TEX.milkyway.map;

    /* Tekstur hi-res dimuat terpisah (opsional). Bila belum ada, LOD
       hanya memakai satu lapisan — tidak error. */
    this.texHi = TEX.milkywayHi ? TEX.milkywayHi.map : null;

    /* mesh Lo: bola langit yang sudah ada dipakai sebagai lapisan bawah */
    this.meshLo = skyMesh;
    if (!this.texHi) { this.siap = true; return; }

    /* mesh Hi: bola langit kedua, radius sedikit lebih kecil supaya selalu
       berada DI DALAM mesh Lo (tidak z-fight). Material meniru mesh Lo. */
    const matHi = skyMesh.material.clone();
    if (matHi.uniforms && matHi.uniforms.uMap) {
      matHi.uniforms.uMap.value = this.texHi;
      matHi.uniforms.uBright.value = skyMesh.material.uniforms.uBright.value;
    }
    this.meshHi = new THREE.Mesh(
      new THREE.SphereGeometry(899990, 160, 120), matHi);
    this.meshHi.frustumCulled = false;
    this.meshHi.renderOrder = -199;      /* setelah Lo, sebelum objek lain */
    this.meshHi.visible = false;
    this.meshHi.material.transparent = true;
    this.meshHi.material.opacity = 0;
    scene.add(this.meshHi);
    this.siap = true;
  },

  /* Pilih lapisan berdasarkan fov. Dipanggil tiap frame. */
  update() {
    /* DINONAKTIFKAN (lihat penjelasan di atas) */
    if (!this.aktif) {
      if (this.meshHi && this.meshHi.visible) this.meshHi.visible = false;
      if (this.meshLo) this.meshLo.visible = true;
      return;
    }
    if (!this.siap) { this.init(); if (!this.siap) return; }
    if (!this.meshHi) return;            /* hanya satu lapisan tersedia */

    const fov = camera.fov;
    /* alpha 0 = pakai tekstur Lo, 1 = pakai tekstur Hi.
       Cross-fade terjadi pada pita [ambangFov, ambangFov - pitaFade]:
         fov >= 25      -> alpha 0  (Lo penuh)
         fov <= 17      -> alpha 1  (Hi penuh)
         25 > fov > 17  -> transisi halus
       Versi pertama memakai (ambangFov - fov)/pitaFade sehingga pada
       fov = 25 alpha = 0 (belum mulai) — itu benar, tetapi membuat
       lapisan Hi baru muncul di bawah 25. Pita dipusatkan di ambang
       supaya peralihan terasa lebih awal saat pengguna mulai zoom. */
    let a = (this.ambangFov - fov) / this.pitaFade + 0.5;
    a = Math.max(0, Math.min(1, a));

    this.meshHi.material.opacity = a;
    this.meshHi.visible = a > 0.01;
    /* mesh Lo tetap terlihat sebagai alas; saat Hi penuh, Lo tidak perlu
       digambar lagi (hemat) */
    if (this.meshLo) this.meshLo.visible = a < 0.99;
  },
};
