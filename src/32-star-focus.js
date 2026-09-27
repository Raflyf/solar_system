/* =======================================================================
   STAR FOCUS — PILIH & ZOOM KE BINTANG / OBJEK LANGIT
   -----------------------------------------------------------------------
   PERMINTAAN PENGGUNA:
     "untuk mode zoom itu coba tiru zoom stellarium yg bisa zoom semua
      planet, bintang, dan objek langit lainnya, yang semakin di zoom itu
      semakin jelas dan HD, sedangkan proyek kita itu semakin di zoom malah
      makin jelek resolusinya"

   Sebelumnya hanya PLANET/BULAN yang bisa diklik (lewat `pickables`).
   Bintang hanya titik yang tidak bisa dipilih, sehingga tidak bisa
   di-zoom seperti di Stellarium.

   CARA KERJA:
     1. Klik di langit → cari bintang terdekat dari arah klik memakai
        pencarian sudut (bukan raycast, karena bintang adalah point sprite
        tanpa volume). Ambil bintang paling dekat dalam radius toleransi.
     2. Bila dapat, kamera diarahkan ke bintang itu dan zoom (fov) dibuat
        mengecil bertahap — persis perilaku Stellarium.
     3. Label bintang ditampilkan (nama, Bayer, magnitudo, jarak, spektrum)
        di panel kecil, seperti panel objek Stellarium.
     4. Tombol Esc / klik kosong = lepas fokus.

   KENAPA PAKAI PENCARIAN SUDUT, BUKAN RAYCAST:
     Bintang dirender sebagai THREE.Points (satu geometri berisi ratusan
     ribu titik). Raycaster Three.js pada Points memang bisa, tetapi
     lambat untuk 100 ribu titik dan toleransinya bergantung ukuran piksel.
     Pencarian sudut (dot product) jauh lebih cepat: kita hanya perlu
     mengubah arah klik menjadi vektor, lalu memilih bintang dengan sudut
     terkecil. O(n) sederhana, ~1 ms untuk 100 ribu bintang.
   ======================================================================= */

const STAR_FOCUS = {
  /** bintang yang sedang difokus, atau null */
  current: null,
  /** fov sasaran saat zoom (derajat) */
  targetFov: 12,
  /** toleransi sudut klik (derajat) */
  /* ======================================================================
     TOLERANSI KLIK — MENYESUAIKAN ZOOM (fov)
     ----------------------------------------------------------------------
     KELUHAN PENGGUNA: "info benda langit saat di klik itu tidak akurat
     klik an nya tidak pas pada benda nya jadi susah buat di klik, harus
     coba spam klik di sekitar nya baru ketemu, tidak pas dan akurat di
     titik nya"

     MASALAH: toleransi sudut dahulu TETAP 2,2 derajat. Karena toleransi
     sudut diterjemahkan ke piksel lewat fov, ukuran klik di layar
     BERUBAH-UBAH drastis:
         fov 70 (pandangan luas) -> toleransi 2,2 derajat = 18 px radius
         fov 25                  -> 50 px
         fov  5                  -> 250 px
     Pada pandangan luas, radius 18 px terlalu KECIL untuk bintang yang
     tampak 9-14 px (mata pengguna harus tepat di pusat bintang), sehingga
     pengguna merasa harus "spam klik di sekitarnya".
     Pada zoom dalam, radius 250 px terlalu BESAR (bintang lain ikut
     terpilih).

     SOLUSI: toleransi dihitung dari fov supaya UKURANNYA DI LAYAR tetap
     konstan ~34 px radius (2x ukuran bintang terang terbesar 14 px +
     margin). Ini membuat klik terasa "pas" di semua tingkat zoom.
     ====================================================================== */
  tolDeg: 2.2,          /* cadangan bila fov tidak tersedia */

  /* Toleransi sudut yang menyesuaikan fov (derajat). */
  toleransiSudut() {
    const fov = (typeof camera !== 'undefined' && camera.fov) ? camera.fov : 50;
    /* target radius klik di layar: 34 px (ukuran tinggi layar acuan 640) */
    const PX_TARGET = 34;
    const tinggiLayar = (typeof window !== 'undefined' && window.innerHeight)
      ? window.innerHeight : 640;
    const derajatPerPiksel = fov / tinggiLayar;
    const tol = PX_TARGET * derajatPerPiksel;
    /* batasi agar tetap masuk akal di rentang fov ekstrem */
    return Math.max(0.02, Math.min(6.0, tol));
  },
  /** elemen panel info */
  panel: null,

  init() {
    this.panel = document.getElementById('starFocusPanel');
  },

  /* Cari bintang terdekat dari sebuah arah pandang.
     dirScene = THREE.Vector3 arah pandang (sudah ternormalisasi)
     Kembalikan { idx, nama, mag, sudutDeg, pos } atau null. */
  cariBintang(dirScene) {
    if (typeof starField === 'undefined' || !starField.labeled) return null;
    const daftar = starField.labeled;      /* hanya bintang bernama */
    let terbaik = null;
    const tolRad = this.toleransiSudut() * DEG;
    for (let i = 0; i < daftar.length; i++) {
      const s = daftar[i];
      /* arah bintang (sudah di kerangka scene) */
      const len = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z) || 1;
      const dx = s.x / len, dy = s.y / len, dz = s.z / len;
      const dot = dirScene.x * dx + dirScene.y * dy + dirScene.z * dz;
      /* sudut = acos(dot); makin besar dot makin dekat */
      if (dot > 0.9999) continue;          /* hindari pembulatan */
      const sudut = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (sudut > tolRad) continue;
      if (!terbaik || sudut < terbaik.sudut) {
        terbaik = { sudut, s, idx: i };
      }
    }
    if (!terbaik) return null;
    return {
      idx: terbaik.idx,
      nama: terbaik.s.nama || (terbaik.s.bayer ? terbaik.s.bayer + ' ' + terbaik.s.con : 'Bintang'),
      mag: terbaik.s.mag,
      spektrum: terbaik.s.spect,
      jarakLy: terbaik.s.distLy,
      sudutDeg: terbaik.sudut / DEG,
      pos: new THREE.Vector3(terbaik.s.x, terbaik.s.y, terbaik.s.z),
      rgb: terbaik.s.rgb,
    };
  },

  /* Fokuskan kamera ke sebuah bintang. */
  fokus(bintang) {
    if (!bintang) return false;
    this.current = bintang;

    /* arahkan kamera ke bintang: hitung azimut/elevasi dari pengamat bila
       POV aktif, atau set arah kamera orbit bila tidak */
    if (typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.active &&
        typeof SURFACE_VIEW.computeObserver === 'function') {
      const obs = SURFACE_VIEW.computeObserver(SURFACE_VIEW.currentBody());
      if (obs) {
        const v = bintang.pos.clone().normalize();
        SURFACE_VIEW.el = Math.asin(Math.max(-1, Math.min(1, v.dot(obs.zenith))));
        SURFACE_VIEW.az = Math.atan2(v.dot(obs.east), v.dot(obs.north));
        /* zoom: perkecil fov bertahap (dilakukan di update) */
        this.targetFov = 8;
      }
    } else {
      /* mode orbit: arahkan kameraState ke arah bintang */
      if (typeof cameraState !== 'undefined') {
        cameraState.freeLookDir = bintang.pos.clone().normalize();
        cameraState.freeLook = true;
      }
    }
    this.tampilkanPanel(bintang);
    return true;
  },

  /* Lepas fokus. */
  lepas() {
    this.current = null;
    if (typeof cameraState !== 'undefined') cameraState.freeLook = false;
    this.sembunyikanPanel();
  },

  /* Perbarui zoom bertahap + panel. Dipanggil tiap frame. */
  update(dt) {
    if (!this.current) return;
    /* zoom halus menuju targetFov (seperti Stellarium: makin dekat makin
       tajam karena bintang tetap titik, tetapi latar ikut membesar) */
    if (typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.active) {
      const f = SURFACE_VIEW.fov;
      if (f > this.targetFov) {
        SURFACE_VIEW.fov = Math.max(this.targetFov, f - (f - this.targetFov) * Math.min(1, dt * 3.5));
      }
    }
    /* perbarui posisi panel agar mengikuti bintang di layar */
    this.perbaruiPanel();
  },

  /* ---------- panel info bintang (mirip panel objek Stellarium) ---------- */
  tampilkanPanel(b) {
    if (!this.panel) this.panel = document.getElementById('starFocusPanel');
    if (!this.panel) return;
    const warna = b.rgb ? 'rgb(' + b.rgb[0] + ',' + b.rgb[1] + ',' + b.rgb[2] + ')' : '#fff';
    const spek = b.spektrum ? b.spektrum : '—';
    this.panel.innerHTML =
      '<div class="sf-head"><span class="sf-dot" style="background:' + warna + '"></span>' +
      '<b>' + b.nama + '</b><button class="mini" id="sfClose" title="Lepas fokus">✕</button></div>' +
      '<div class="sf-row"><span>Magnitudo</span><b>' + b.mag.toFixed(2) + '</b></div>' +
      '<div class="sf-row"><span>Jarak</span><b>' + (b.jarakLy ? b.jarakLy.toFixed(1) + ' ly' : '—') + '</b></div>' +
      '<div class="sf-row"><span>Spektrum</span><b>' + spek + '</b></div>';
    this.panel.classList.add('show');
    const tombol = document.getElementById('sfClose');
    if (tombol) tombol.addEventListener('click', () => this.lepas());
  },

  perbaruiPanel() {
    if (!this.panel || !this.current) return;
    const v = this.current.pos.clone().project(camera);
    if (v.z < -1 || v.z > 1) { this.panel.style.opacity = '0'; return; }
    this.panel.style.opacity = '1';
    const W = window.innerWidth, H = window.innerHeight;
    this.panel.style.left = ((v.x * 0.5 + 0.5) * W).toFixed(0) + 'px';
    this.panel.style.top = ((-v.y * 0.5 + 0.5) * H + 26).toFixed(0) + 'px';
  },

  sembunyikanPanel() {
    if (this.panel) this.panel.classList.remove('show');
  },
};
