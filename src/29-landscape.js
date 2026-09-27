/* =======================================================================
   LANDSCAPE — SILUET DARATAN DI BAWAH HORIZON (gaya Stellarium)
   -----------------------------------------------------------------------
   PERMINTAAN PENGGUNA: "daratan nya juga lebih bagus dan enak di lihat,
   langit nya juga cantik dan indah" (dengan referensi Stellarium).

   ANALISIS REFERENSI STELLARIUM:
     Yang membuat POV Stellarium terasa "membumi" dan indah bukan hanya
     langitnya, tetapi SILUET LANSKAP di bawah horizon:
       • Siluet pepohonan bergerigi + kontur bukit rendah
       • Warna hampir hitam dengan sedikit nuansa hijau/biru gelap
       • Berfungsi sebagai FOREGROUND yang memberi kedalaman & skala
       • Tidak ada detail tekstur (memang gelap karena minim cahaya)

   CARA KERJA (SILINDER TERBUKA — sederhana & andal):
     Siluet panorama digambar prosedural di canvas 4096x512 (4096 px =
     satu putaran 360°), lalu dipetakan ke SILINDER TERBUKA (open-ended
     CylinderGeometry) yang mengelilingi kamera dan menghadap KE DALAM
     (side: BackSide). Karena silinder mengelilingi kamera, panorama
     otomatis benar untuk semua arah pandang tanpa perhitungan azimut —
     ini menghindari bug rumit pada pendekatan bidang datar.

   Ketinggian siluet:
     Sudut elevasi puncak siluet dari mata pengamat diatur oleh angleDeg.
     Nilai 7° dipilih dari pengamatan referensi Stellarium: siluet
     menempati sekitar 1/8 tinggi layar pada fov 60°.

   Kinerja:
     Satu mesh (silinder 64 segmen), satu tekstur 4096x512, tanpa
     pencahayaan (MeshBasicMaterial transparan). Biaya GPU < 0,1 ms.
   ======================================================================= */

const LANDSCAPE = {
  /* ====================================================================
     DINONAKTIFKAN — PERMINTAAN PENGGUNA
     --------------------------------------------------------------------
     Pengguna menilai lanskap siluet yang dibuat justru MERUSAK tampilan:
       "lanskap nya juga apasih ga jelas banget masa rusak gitu, mending
        dihilangkan saja daripada nambah rusak"
     Siluet prosedural (pepohonan/bukit) tidak bisa menyamai lanskap
     panorama sungguhan milik Stellarium, sehingga lebih baik dihilangkan
     daripada menambah artefak.

     Kode tetap disimpan (enabled: false) supaya bisa diaktifkan kembali
     bila nanti ada aset panorama nyata. Saat enabled=false, update()
     hanya menyembunyikan mesh dan tidak melakukan apa pun.
     ==================================================================== */
  mesh: null,
  mat: null,
  tex: null,
  canvas: null,
  angleDeg: 7.0,
  enabled: false,
  built: false,

  init() {
    if (this.built) return;
    this.canvas = this.makeCanvas(4096, 512);
    this.tex = new THREE.CanvasTexture(this.canvas);
    if (THREE.SRGBColorSpace !== undefined) this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.wrapS = THREE.RepeatWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;

    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,     /* dilihat dari DALAM silinder */
      toneMapped: false,
      fog: false,
    });

    /* Silinder terbuka (tanpa tutup atas/bawah), 96 segmen agar siluet
       tidak terlihat bersudut. Tinggi & radius diatur saat update(). */
    const geo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true);
    this.mesh = new THREE.Mesh(geo, this.mat);
    /* ==================================================================
       URUTAN RENDER — SILUET DI ATAS PATCH PERMUKAAN
       ------------------------------------------------------------------
       BUG YANG DIPERBAIKI: patch permukaan (radius 1, thetaLength 92°)
       berada di antara kamera dan siluet, sehingga siluet SELALU tertutup
       (terbukti: dengan patch warna layar = tan (151,143,114); tanpa patch
       baru terlihat langit hitam (7,7,7)).

       PATCH tidak boleh diubah (ukurannya sudah benar agar tepinya tidak
       terlihat). Solusinya: siluet digambar SETELAH patch dan dengan
       depthTest dimatikan, sehingga selalu tampil di atas permukaan.

       renderOrder:
         skyMesh      : -200  (paling belakang)
         patch        :    5  (permukaan planet)
         LANDSCAPE    :   10  (siluet di atas permukaan)  <-- ini
       depthTest: false → tidak diuji terhadap depth buffer patch.
       ================================================================== */
    this.mesh.renderOrder = 10;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.built = true;
  },

  /* Gambar siluet panorama: bukit + pepohonan, satu putaran 360 derajat.
     Deterministik (benih tetap) supaya bentuknya konsisten tiap muat.

     ==================================================================
     KONVENSI VERTIKAL TEKSTUR — PENTING
     ------------------------------------------------------------------
     Silinder membentang dari elevasi +HORIZON_ATAS (mis. +9°) di tepi
     ATAS canvas sampai -HORIZON_BAWAH (-1°) di tepi BAWAH canvas.
     Jadi garis horizon (elevasi 0°) berada pada:
         y_horizon = HORIZON_ATAS / (HORIZON_ATAS + HORIZON_BAWAH)
                   = 9 / 10 = 0,90
     • Pepohonan digambar dari y=0 sampai y_horizon (DI ATAS horizon) —
       inilah yang terlihat menjulang seperti Stellarium.
     • Tanah padat digambar dari y_horizon ke bawah (di bawah horizon,
       sebagian besar akan tertutup patch permukaan — tidak masalah).
     ================================================================== */
  makeCanvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');

    /* benih acak deterministik (LCG) */
    let seed = 20260927;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    /* WARNA SILUET — dari referensi Stellarium: hampir hitam dengan
       sedikit nuansa biru-hijau gelap (bukan hitam murni) supaya terlihat
       sebagai daratan, bukan lubang kosong. */
    const GELAP  = '#0a1210';
    const GELAP2 = '#0b1512';

    /* garis horizon pada canvas (lihat penjelasan konvensi di atas) */
    const Y_HORIZON = 0.90;
    const yH = h * Y_HORIZON;

    ctx.clearRect(0, 0, w, h);

    /* ---------- 1. kontur bukit rendah tepat di atas horizon ---------- */
    /* lapis jauh (lebih terang samar) lalu lapis dekat */
    const lapisBukit = [
      { yBase: 0.80, amp: 0.055, freq: 3.0, warna: GELAP2, alpha: 0.75 },
      { yBase: 0.86, amp: 0.075, freq: 4.3, warna: GELAP,  alpha: 0.88 },
    ];
    for (const L of lapisBukit) {
      ctx.beginPath();
      ctx.moveTo(0, h);
      const baseY = h * L.yBase;
      for (let x = 0; x <= w; x += 4) {
        const t = x / w;
        const y = baseY
          - Math.sin(t * Math.PI * 2 * L.freq) * h * L.amp * 0.5
          - Math.sin(t * Math.PI * 2 * L.freq * 1.7 + 1.3) * h * L.amp * 0.30
          - Math.sin(t * Math.PI * 2 * L.freq * 0.6 + 2.1) * h * L.amp * 0.25;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.globalAlpha = L.alpha;
      ctx.fillStyle = L.warna;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* ---------- 2. pepohonan menjulang dari horizon KE ATAS ---------- */
    ctx.fillStyle = GELAP;
    ctx.globalAlpha = 0.97;

    let x = -20;
    while (x < w + 20) {
      const jarak = 9 + rnd() * 20;              /* jarak antar pohon */
      /* tinggi pohon: 5%..22% tinggi canvas (menjulang ke atas horizon) */
      const tinggiP = h * (0.05 + rnd() * 0.17);
      const lebarTajuk = jarak * (0.85 + rnd() * 0.9);
      const jenis = rnd() < 0.45 ? 1 : 0;        /* 1 = cemara, 0 = bulat */
      const cx = x + lebarTajuk / 2;

      if (jenis === 1) {
        /* --- cemara: beberapa segitiga bertumpuk, tepi bergerigi --- */
        const tingkat = 3 + Math.floor(rnd() * 3);
        for (let k = 0; k < tingkat; k++) {
          const f = k / tingkat;
          /* yTop lebih KECIL (lebih atas) daripada yBot */
          const yTop = yH - tinggiP * (1 - f * 0.30);
          const yBot = yH - tinggiP * (1 - (f + 1 / tingkat) * 0.30);
          const wHalf = lebarTajuk * (0.38 + f * 0.30);
          ctx.beginPath();
          ctx.moveTo(cx, yTop);
          /* sisi kanan bergerigi */
          const gigi = 5;
          for (let g = 1; g <= gigi; g++) {
            const gy = yTop + (yBot - yTop) * (g / gigi);
            const gx = cx + wHalf * (g / gigi) * (g % 2 ? 0.68 : 1.0);
            ctx.lineTo(gx, gy);
          }
          ctx.lineTo(cx + wHalf * 0.55, yBot);
          ctx.lineTo(cx - wHalf * 0.55, yBot);
          /* sisi kiri bergerigi (dari bawah ke atas) */
          for (let g = gigi; g >= 1; g--) {
            const gy = yTop + (yBot - yTop) * (g / gigi);
            const gx = cx - wHalf * (g / gigi) * (g % 2 ? 0.68 : 1.0);
            ctx.lineTo(gx, gy);
          }
          ctx.closePath();
          ctx.fill();
        }
      } else {
        /* --- pohon bulat: lingkaran bertepi bergelombang --- */
        const r0 = lebarTajuk / 2;
        const cy = yH - tinggiP + r0 * 0.55;
        ctx.beginPath();
        const N = 16;
        for (let a = 0; a <= N; a++) {
          const ang = (a / N) * Math.PI * 2;
          const rr = r0 * (0.80 + 0.20 * Math.abs(Math.sin(ang * 4 + rnd() * 0.3)));
          const px = cx + Math.cos(ang) * rr;
          const py = cy + Math.sin(ang) * rr * 0.88;
          if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
      x += jarak;
    }
    ctx.globalAlpha = 1;

    /* ---------- 3. tanah padat dari garis horizon ke bawah ---------- */
    ctx.fillStyle = GELAP;
    ctx.fillRect(0, yH - 2, w, h - yH + 2);

    return cv;
  },

  /* Perbarui posisi & visibilitas lanskap.
     obs = SURFACE_VIEW.computeObserver(); elevM = ketinggian pengamat (m) */
  update(obs, az, elevM) {
    const aktif = (typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.active);
    if (!this.enabled || !aktif || !obs) {
      if (this.mesh) this.mesh.visible = false;
      return;
    }
    if (!this.built) this.init();
    if (!this.mesh) return;

    /* ==================================================================
       UKURAN & POSISI SILINDER — SILUET MENJULANG DI ATAS HORIZON
       ------------------------------------------------------------------
       BUG YANG DIPERBAIKI (dua lapis):
         (a) Versi pertama memakai radius tetap 0,02 unit sehingga sudut
             puncak siluet dari mata = 0° (tidak terlihat). Terbukti dari
             pengukuran: sudutPuncakDeg = 0.
         (b) Versi kedua memusatkan silinder DI KAMERA lalu menggeser
             turun h/2 — akibatnya pepohonan yang digambar di bagian ATAS
             canvas jatuh di BAWAH horizon (tidak terlihat).

       GEOMETRI YANG BENAR:
         Silinder harus membentang dari elevasi −BAWAH sampai +ATAS
         terhadap mata, sehingga garis horizon (elevasi 0°) berada di
         tengah-atas silinder sesuai konvensi canvas (Y_HORIZON = 0,90):
             ATAS  = angleDeg × Y_HORIZON         (bagian di atas horizon)
             BAWAH = angleDeg × (1 − Y_HORIZON)   (bagian di bawah horizon)
             tinggi total = ATAS + BAWAH = angleDeg
         Pusat silinder digeser sehingga:
             • tepi atas  = +ATAS  dari mata
             • tepi bawah = −BAWAH dari mata
         → pusat digeser (ATAS − BAWAH)/2 dari mata MENURUN.

       Radius 0,006 unit (38 km) dipilih: cukup jauh dari near plane
       (0,000002), cukup dekat agar siluet tegas.
       ================================================================== */
    const r = 0.006;
    const Y_HOR = 0.90;                        /* harus sama dengan makeCanvas */
    const sudutAtas  = this.angleDeg * Y_HOR;          /* di atas horizon */
    const sudutBawah = this.angleDeg * (1 - Y_HOR);    /* di bawah horizon */
    /* tinggi linier (perkiraan sudut kecil; 7° masih sangat kecil) */
    const tinggiAtas  = r * Math.tan(sudutAtas * DEG);
    const tinggiBawah = r * Math.tan(sudutBawah * DEG);
    const tinggiTotal = tinggiAtas + tinggiBawah;

    /* skala mesh: geometri asli radius 1, tinggi 1 */
    this.mesh.scale.set(r, tinggiTotal, r);

    /* pusat silinder: dari kamera, digeser turun supaya
       tepi atas = +tinggiAtas dan tepi bawah = −tinggiBawah */
    const geser = (tinggiAtas - tinggiBawah) * 0.5;
    const pusat = camera.position.clone()
      .addScaledVector(obs.zenith, -geser);
    this.mesh.position.copy(pusat);

    /* ==================================================================
       ORIENTASI — SILINDER TERIKAT PADA KERANGKA DUNIA (utara/zenith)
       ------------------------------------------------------------------
       Silinder dipasang pada kerangka ENU pengamat (East, Zenith, North),
       sehingga panorama 360° otomatis benar: kamera yang berputar akan
       melihat bagian siluet yang sesuai arah dunia TANPA perlu menggeser
       tekstur. Jadi TIDAK ada `tex.offset` — versi sebelumnya yang
       menggeser offset justru membuat siluet berputar dua kali.
       ================================================================== */
    const east = obs.east ? obs.east.clone() : new THREE.Vector3().crossVectors(obs.north, obs.zenith).normalize();
    this.mesh.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(east, obs.zenith, obs.north));

    this.mesh.visible = true;
  },

  hide() {
    if (this.mesh) this.mesh.visible = false;
  },
};
