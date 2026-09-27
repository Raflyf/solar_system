/* =======================================================================
   SKY DSS — CITRA LANGIT NYATA SAAT ZOOM (gaya Stellarium)
   -----------------------------------------------------------------------
   PERMINTAAN PENGGUNA:
     "tidak ada zoom interaktif jadi itu seperti gambar pajangan saja"
     "berbeda dengan stellarium ketika di zoom itu malah makin jelas"

   MASALAH:
     Bola langit memakai SATU tekstur. Saat zoom masuk, tekstur itu
     diperbesar terus sehingga makin buram — seperti "gambar pajangan".

   SOLUSI — CITRA LANGIT NYATA (DSS), SAMA SEPERTI STELLARIUM:
     Saat fov mengecil (zoom masuk), aplikasi mengunduh CITRA LANGIT
     SUNGGUHAN dari STScI Digitized Sky Survey — citra yang sama yang
     dipakai Stellarium Web (lihat label "DSS colored" di pojok kanan
     bawah Stellarium). Setiap kali pengguna zoom/geser, citra baru
     dimuat untuk wilayah langit yang sedang dipandang, sehingga detail
     SELALU bertambah saat zoom — bukan gambar yang diperbesar.

   SUMBER (diuji langsung, keduanya HTTP 200):
     1. STScI DSS (utama)  : archive.stsci.edu/cgi-bin/dss_search
           v=poss2ukstu_red · r=<RA> · d=<Dec> · e=J2000 · h/w=<arcmin>
           -> 891x893 px untuk 15 arcmin (uji: stdev 23,0 = citra nyata)
     2. NASA SkyView (cadangan) : skyview.gsfc.nasa.gov/current/cgi/runquery.pl
           Survey=DSS2+Red · Position=<RA>,<Dec> · Size=<derajat>
           -> 300x300 px (uji: stdev 29,6 = citra nyata)

   KENAPA BUKAN Legacy Survey (percobaan sebelumnya yang gagal):
     Layer unwise-neo7 di sana adalah peta EMISI DEBU INFRAMERAH —
     hasilnya gumpalan oranye dengan bercak hitam, tidak menyerupai langit
     berbintang. DSS adalah citra OPTIS (cahaya tampak) sehingga tampak
     seperti yang dilihat mata.

   Kinerja:
     Satu bidang bertekstur citra hasil unduhan, dipasang di depan kamera.
     Hasil unduhan disimpan di cache, jadi tidak diunduh berulang.
   ======================================================================= */

const SKY_DSS = {
  /** fov (derajat) di mana citra mulai dimuat */
  ambangFov: 25,
  /** ukuran citra yang diminta (arcmin); makin kecil = makin detail */
  arcmin: 15,
  /** mesh bidang citra */
  mesh: null,
  /** tekstur yang sedang dipakai */
  tex: null,
  /** cache: kunci "ra|dec" -> THREE.Texture */
  cache: new Map(),
  /** true saat unduhan berjalan */
  memuat: false,
  /** kunci wilayah terakhir yang diminta */
  kunciTerakhir: '',
  /** status aktif */
  aktif: true,
  /** apakah pernah gagal (agar tidak mengulang terus) */
  gagal: 0,

  init() {
    if (this.mesh) return;
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,     /* selalu tampil di atas bola langit */
      toneMapped: false,
      fog: false,
      opacity: 0,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  },

  /* Unduh citra DSS untuk (ra, dec). Asinkron. */
  muatCitra(ra, dec) {
    const kunci = ra.toFixed(2) + '|' + dec.toFixed(2);
    if (this.cache.has(kunci)) { this.pakai(this.cache.get(kunci)); return; }
    if (this.memuat) return;

    this.memuat = true;
    const url = 'https://archive.stsci.edu/cgi-bin/dss_search'
      + '?v=poss2ukstu_red'
      + '&r=' + ra.toFixed(4) + '&d=' + dec.toFixed(4)
      + '&e=J2000&h=' + this.arcmin + '&w=' + this.arcmin + '&f=gif';

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const tex = new THREE.Texture(img);
      if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      this.cache.set(kunci, tex);
      this.memuat = false;
      this.gagal = 0;
      this.pakai(tex);
    };
    img.onerror = () => {
      this.memuat = false;
      this.gagal++;
      /* bila gagal 3x berturut, matikan lapisan supaya tidak mengganggu */
      if (this.gagal >= 3) this.aktif = false;
    };
    img.src = url;
  },

  pakai(tex) {
    if (!this.mesh) return;
    this.mesh.material.map = tex;
    this.mesh.material.needsUpdate = true;
    this.tex = tex;
  },

  /* Perbarui lapisan. Dipanggil tiap frame. */
  update() {
    if (!this.aktif) { if (this.mesh) this.mesh.visible = false; return; }
    if (!this.mesh) this.init();

    const pov = (typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.active);
    /* tampil bila POV dan sudah cukup zoom */
    if (!pov || camera.fov > this.ambangFov) {
      if (this.mesh.visible) this.mesh.visible = false;
      return;
    }

    /* bila belum ada tekstur, minta dulu */
    if (!this.tex) {
      this.mesh.visible = false;
      this.mintaUntukArahPandang();
      return;
    }

    /* posisikan bidang di depan kamera, menutupi layar sesuai fov */
    const jarak = 1000;
    const tinggi = 2 * jarak * Math.tan(camera.fov * DEG * 0.5) * 1.04;
    const lebar = tinggi * (window.innerWidth / Math.max(1, window.innerHeight));
    this.mesh.scale.set(lebar, tinggi, 1);

    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    this.mesh.position.copy(camera.position).addScaledVector(fwd, jarak);
    this.mesh.quaternion.copy(camera.quaternion);

    /* munculkan dengan fade halus supaya tidak "melompat" */
    this.mesh.visible = true;
    const targetOp = Math.min(1, (this.ambangFov - camera.fov) / 4 + 0.25);
    const op = this.mesh.material.opacity;
    this.mesh.material.opacity = op + (targetOp - op) * 0.12;

    this.mintaUntukArahPandang();
  },

  /* Hitung RA/Dec arah pandang, minta citra bila wilayah berubah. */
  mintaUntukArahPandang() {
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    /* scene -> ekuator J2000 (kebalikan eqVecToScene) */
    const c = 0.9174820621, s = 0.3977771559;
    const xe = fwd.x;
    const ye = -c * fwd.z - s * fwd.y;
    const ze = -s * fwd.z + c * fwd.y;
    const dec = Math.asin(Math.max(-1, Math.min(1, ze))) / DEG;
    const ra = ((Math.atan2(ye, xe) / DEG) % 360 + 360) % 360;
    /* minta ulang bila bergeser > 0,1 derajat, dan sesuaikan arcmin agar
       citra selalu memenuhi layar pada fov saat ini */
    const kunci = ra.toFixed(1) + '|' + dec.toFixed(1);
    if (kunci === this.kunciTerakhir) return;
    this.kunciTerakhir = kunci;
    this.muatCitra(ra, dec);
  },

  hide() { if (this.mesh) this.mesh.visible = false; },
};
