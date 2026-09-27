/* =======================================================================
   SURFACE PATCH — PERMUKAAN LOKAL RESOLUSI TINGGI SAAT POV
   -----------------------------------------------------------------------
   MASALAH YANG DIPERBAIKI (keluhan: "itu hanya sekedar nempel saja, tidak
   ada environment bumi 3d realistic nya, jadi jelek banget hanya datar"):
     Mesh planet memakai 80x56 segmen. Untuk Bumi (radius 6371 km) itu
     berarti satu segitiga ~500 km. Kamera POV berdiri 50 m di atas
     permukaan — jauh DI DALAM segitiga mesh yang datar. Akibatnya yang
     terlihat hanya langit: tidak ada tanah, tidak ada horizon, tidak ada
     relief. Persis seperti keluhan.

   SOLUSI:
     Saat POV aktif, pasang "patch permukaan": potongan bola (spherical cap)
     beresolusi tinggi yang HANYA mencakup wilayah sekitar pengamat, dengan
     tekstur di-zoom ke bagian yang tepat. Karena hanya sebagian kecil bola
     yang dibuat, jumlah segitiga tetap kecil (hemat) tetapi detailnya
     tinggi — inilah cara kerja LOD di Google Earth.

   Parameter:
     radius patch   : 200 km (mencakup horizon untuk pengamat 50-5000 m)
     segmen         : 128x128 = 16.384 segitiga (ringan untuk GPU modern)
     resolusi efektif: 200 km / 128 = 1,6 km per segitiga (dari 500 km)

   PENTING — HORIZON:
     Horizon nyata muncul bila patch cukup lebar. Untuk pengamat setinggi h
     di planet beradius R, jarak horizon = sqrt(2*R*h). Contoh di Bumi
     dengan h = 100 m: sqrt(2*6371000*100) = 35,7 km. Patch 200 km lebih
     dari cukup. Di luar patch, permukaan mesh asli melanjutkan (kasar tapi
     cukup karena sudah jauh).

   Referensi: konsep LOD / clipmap terrain (Losasso & Hoppe 2004),
   jarak horizon: geometri bola standar.
   ======================================================================= */

let surfacePatch = null;      /* mesh patch aktif */
let surfacePatchBody = null;  /* body yang sedang dipakai patch */
let surfacePatchKey = '';     /* kunci untuk mendeteksi perubahan */

const SURFACE_PATCH_SEG = 128;     /* 128x128 = 32.768 segitiga (masih ringan) */

/* =======================================================================
   UKURAN PATCH — HARUS MENCAKUP SAMPAI HORIZON
   -----------------------------------------------------------------------
   BUG YANG DIPERBAIKI (tiga kali, dicatat supaya tidak diulang):
     1. Patch 300 km (2,7°)  → hanya bercak kecil di bawah.
     2. Patch dari jarak horizon saja (1,35° utk h=50 m) → masih terlalu
        kecil; kamera bisa melihat 17°+ ke atas.
     3. Patch 70°            → permukaan terlihat TAPI tepi patch muncul
        sebagai garis tajam 20° di atas horizon (terbukti di uji: piksel
        melompat dari langit biru ke tanah dalam 1 piksel).

   YANG BENAR: horizon bagi pengamat di ketinggian h berada pada sudut
     90° − acos(R/(R+h))  dari zenith (untuk h kecil ≈ 90°).
   Patch harus mencapai SEDIKIT DI ATAS horizon itu, sehingga tepinya
   tidak terlihat. Dipakai minimal 92° (2° di atas horizon) dan
   diperbesar bila pengamat tinggi (gunung/ISS).

     patchDeg = clamp(max(92°, 90° + sudutHorizon), 92°, 120°)
   ======================================================================= */
function surfacePatchRadiusDeg(bodyRadiusKm, elevM, fovDeg) {
  const h = Math.max(1, elevM) / 1000;                    /* km */
  const R = bodyRadiusKm;
  /* sudut dari pusat planet ke titik horizon yang terlihat pengamat */
  const horizonAngleDeg = Math.acos(Math.min(1, R / (R + h))) * 180 / Math.PI;
  /* horizon berada pada 90° − horizonAngle dari zenith; patch harus
     melewatinya supaya tepinya tidak muncul di layar */
  const need = Math.max(92, 90 + horizonAngleDeg * 1.2);
  return Math.min(need, 120);
}

/* =======================================================================
   UV PATCH — MENGAMBIL BAGIAN TEKSTUR YANG BENAR (RELATIF TERHADAP PATCH)
   -----------------------------------------------------------------------
   MASALAH: SphereGeometry membuat UV 0..1 untuk seluruh potongan bola,
   padahal potongan itu hanya sebagian kecil permukaan planet.

   BUG YANG DIPERBAIKI: versi pertama menghitung UV dari arah verteks
   dalam ruang MESH (setelah quaternion patch). Itu salah karena
   quaternion patch mengubah arah pusat patch ke lokasi pengamat — sehingga
   UV pusat patch selalu menjadi (0,5, 0,5) = Greenwich, bukan lokasi
   sebenarnya (terbukti di uji: UV pusat = 0,5/0,5 padahal Jakarta
   seharusnya 0,797/0,466).

   YANG BENAR: hitung UV dari arah verteks dalam ruang LOKAL patch
   (sebelum quaternion), lalu tambahkan offset lokasi pengamat. Dengan
   begitu pusat patch (kutub +Y lokal) mendapat UV lokasi yang tepat,
   dan tepi-tepinya meluas secara proporsional.

   Konvensi (sama dengan computeObserver, terverifikasi vs earth_day.jpg):
     x = cos φ cos λ ,  y = sin φ ,  z = −cos φ sin λ
     u = 0,5 + λ/360 ,  v = 0,5 + φ/180
   ======================================================================= */
function applyPatchUV(mesh, centerLat, centerLon) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  if (!pos || !uv) return;

  const lat0 = centerLat * DEG, lon0 = centerLon * DEG;
  const cosLat0 = Math.cos(lat0), sinLat0 = Math.sin(lat0);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    /* arah verteks di ruang LOKAL patch */
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    /* ubah kerangka lokal patch → kerangka mesh planet dengan memutar
       sehingga kutub +Y lokal menjadi arah lokasi pengamat */
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(cosLat0 * Math.cos(lon0), sinLat0, -cosLat0 * Math.sin(lon0)).normalize()
    );
    v.applyQuaternion(q);
    /* sekarang v adalah arah di kerangka mesh planet → (lat, lon) → UV */
    const lat = Math.asin(Math.max(-1, Math.min(1, v.y)));
    const lon = Math.atan2(-v.z, v.x);
    let u = 0.5 + lon / (2 * Math.PI);
    const vv = 0.5 + lat / Math.PI;
    uv.setXY(i, u - Math.floor(u), vv);
  }
  uv.needsUpdate = true;
}

/* =======================================================================
   MATERIAL PATCH — MEMAKAI TEKSTUR YANG SAMA DENGAN MESH PLANET
   -----------------------------------------------------------------------
   PENTING — NAMA UNIFORM BERBEDA PER BODY:
     • Bumi  memakai ShaderMaterial dengan uDay / uNight / uClouds
     • Planet lain memakai MeshStandardMaterial dengan .map / .normalMap
   Versi pertama fungsi ini hanya membaca uMap/normalMap sehingga tekstur
   Bumi TIDAK PERNAH tersalin (terbukti di uji: hasMap=false) dan permukaan
   tampak sebagai bidang kosong. Sekarang semua nama dibaca.
   ======================================================================= */
function makeSurfacePatchMaterial(body) {
  let map = null, normalMap = null, clouds = null, night = null;
  const mm = body && body.mesh ? body.mesh.material : null;
  if (mm) {
    if (mm.uniforms) {
      const u = mm.uniforms;
      if (u.uDay && u.uDay.value) map = u.uDay.value;
      else if (u.uMap && u.uMap.value) map = u.uMap.value;
      if (u.uNormalMap && u.uNormalMap.value) normalMap = u.uNormalMap.value;
      if (u.uClouds && u.uClouds.value) clouds = u.uClouds.value;
      if (u.uNight && u.uNight.value) night = u.uNight.value;
    } else {
      if (mm.map) map = mm.map;
      if (mm.normalMap) normalMap = mm.normalMap;
    }
  }
  /* cadangan: ambil langsung dari tabel tekstur bila material belum siap */
  if (!map && typeof TEX !== 'undefined') {
    const key = body && body.key;
    if (key && TEX[key] && TEX[key].map) map = TEX[key].map;
    else if (body && body.name === 'Bulan' && TEX.moon && TEX.moon.map) map = TEX.moon.map;
  }

  const mat = new THREE.MeshStandardMaterial({
    map: map || null,
    normalMap: normalMap || null,
    normalScale: new THREE.Vector2(1.6, 1.6),
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
    /* polygonOffset: tarik patch sedikit ke arah kamera di ruang depth
       supaya selalu menang atas mesh planet yang beradius sama
       (mengatasi z-fighting tanpa mengubah geometri). */
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  if (!map && body && body.color) mat.color = new THREE.Color(body.color);

  /* =====================================================================
     EMISSIVE TIPIS DARI TEKSTUR YANG SAMA
     ---------------------------------------------------------------------
     MASALAH: saat Matahari rendah (mis. elevasi 3°), permukaan nyaris
     tidak terkena cahaya (cos 87° = 0,05) sehingga layar tampak hitam —
     terbukti di uji: piksel (3,7,27) padahal permukaan ada di sana.
     Padahal di kehidupan nyata, permukaan tetap terlihat karena langit
     (hamburan atmosfer) menerangi segalanya.

     SOLUSI: emissive tipis dari peta tekstur yang sama, intensitasnya
     mengikuti tinggi Matahari (dihitung di updateSurfacePatchLighting()).
     Saat malam, nilai ini juga memberi "cahaya kota" yang lembut.
     ===================================================================== */
  if (map) {
    mat.emissiveMap = map;
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = 0.25;   /* diperbarui tiap frame */
  }
  mat.userData = { clouds: clouds, night: night, isPatch: true };
  return mat;
}

/* =======================================================================
   PENCAHAYAAN KHUSUS POV PERMUKAAN
   -----------------------------------------------------------------------
   MASALAH (terukur, bukan dugaan):
     Saat POV aktif, cahaya yang sampai ke permukaan terlalu lemah:
       • sunLight PointLight: intensitas 1,25 × cos(sudut) — saat Matahari
         60° dari zenith, hanya ~0,6
       • AmbientLight: 0,35
     Hasil terukur: piksel permukaan (18,35,81) — lebih GELAP daripada
     langit biru (76,130,233), sehingga permukaan tidak terlihat sama
     sekali meski geometrinya benar (uji material merah membuktikan patch
     ADA di layar).

   FISIKA vs KENYAMANAN MATA:
     Secara fisika ini benar (matahari rendah = tanah gelap). Tetapi mata
     manusia BERADAPTASI: saat berdiri di permukaan, kita tetap melihat
     tanah dengan jelas karena pupil melebar dan otak mengompensasi.
     Simulator perlu meniru adaptasi itu, bukan angka fotometri mentah.

   SOLUSI: saat POV aktif, tambahkan cahaya ambient khusus permukaan
   (intensitas mengikuti tinggi Matahari) dan kembalikan saat keluar POV.
   Ini TIDAK mengubah pencahayaan mode orbit — hanya mode POV.
   ======================================================================= */
let povAmbient = null;

function setPovLighting(on, sunAltDeg) {
  if (on) {
    if (!povAmbient) {
      povAmbient = new THREE.AmbientLight(0xffffff, 0.0);
      povAmbient.name = 'povAmbient';
      scene.add(povAmbient);
    }
    /* Adaptasi mata: siang penuh 1,15 ; malam 0,22 (tetap terlihat bentuk) */
    const dayness = Math.max(0, Math.min(1, (sunAltDeg + 12) / 32));
    povAmbient.intensity = 0.22 + 0.93 * dayness;
    povAmbient.visible = true;
  } else if (povAmbient) {
    povAmbient.visible = false;
  }
}

/* Bangun patch untuk body tertentu.
   Patch berupa potongan bola yang "ditempel" mengikuti orientasi body:
   ia anak dari grup `spin` body sehingga otomatis ikut rotasi harian —
   tidak ada perhitungan rotasi tambahan yang bisa salah. */
function buildSurfacePatch(body) {
  if (!body) return null;

  const R = (body.realRadiusKm || body.radiusKm * RAD);   /* radius km */
  /* =====================================================================
     RADIUS PATCH — SAMA DENGAN MESH, Z-FIGHTING DIPECAHKAN polygonOffset
     ---------------------------------------------------------------------
     PERCOBAAN YANG GAGAL (dicatat supaya tidak diulang):
       • Patch radius = mesh radius  → z-fighting, mesh planet menang
         (terbukti: patch ter-render 1 draw call tapi warnanya tak muncul).
       • Patch radius +0,02%         → patch justru berada DI ATAS kamera,
         karena pengamat hanya 50 m (7,8e-6 unit) di atas permukaan.
         Kamera jadi berada di bawah patch dan tidak melihatnya.

     SOLUSI YANG BENAR: radius patch SAMA dengan mesh, dan z-fighting
     diatasi dengan polygonOffset (fitur resmi WebGL/Three.js untuk kasus
     ini). polygonOffsetFactor negatif menarik patch sedikit ke arah kamera
     di ruang depth, tanpa mengubah geometri — sehingga kamera tetap di
     atas permukaan dan patch selalu menang depth test.
     ===================================================================== */
  const rUnits = R / RAD;
  /* Luas patch harus mencakup seluruh bidang pandang kamera (lihat
     surfacePatchRadiusDeg). */
  const elevM = (typeof SURFACE_VIEW !== 'undefined') ? (SURFACE_VIEW.elev || 50) : 50;
  const fovDeg = (typeof SURFACE_VIEW !== 'undefined') ? (SURFACE_VIEW.fov || 50) : 50;
  const patchDeg = surfacePatchRadiusDeg(R, elevM, fovDeg);
  const patchRad = patchDeg * DEG;                         /* sudut patch (radian) */

  /* Geometri: potongan bola (spherical cap) berpusat di kutub +Y lokal,
     karena grup `spin` memutar di sumbu Y dan titik pengamat dihitung dari
     konvensi yang sama. */
  const geo = new THREE.SphereGeometry(
    rUnits, SURFACE_PATCH_SEG, SURFACE_PATCH_SEG,
    0, Math.PI * 2,                        /* phi: penuh */
    0, patchRad                            /* theta: hanya dari kutub */
  );

  const mat = makeSurfacePatchMaterial(body);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;

  /* UV dihitung dari lokasi patch saat ini (pusat patch = titik pengamat).
     Karena UV bergantung pada lat/lon, patch dibangun ulang setiap kali
     lokasi berubah — lihat signature di updateSurfacePatch(). */
  const lat0 = (typeof SURFACE_VIEW !== 'undefined') ? SURFACE_VIEW.lat : 0;
  const lon0 = (typeof SURFACE_VIEW !== 'undefined') ? SURFACE_VIEW.lon : 0;
  aimSurfacePatchMesh(mesh, lat0, lon0);
  applyPatchUV(mesh, lat0, lon0);

  /* Patch harus berada DI DALAM hierarki body supaya ikut rotasi.
     Kita tempelkan ke `spin` (anak tiltGroup) sehingga poros & rotasi
     harian otomatis benar. */
  if (body.spin) {
    body.spin.add(mesh);
  } else {
    body.group.add(mesh);
  }

  /* =====================================================================
     MESH BOLA BODY DIMATIKAN SELAMA POV
     ---------------------------------------------------------------------
     MASALAH: mesh planet dan patch beradius SAMA PERSIS, jadi keduanya
     berebut piksel (z-fighting). polygonOffset TIDAK menolong di sini
     karena renderer memakai logarithmicDepthBuffer (depth-nya non-linear,
     polygonOffset diabaikan) — terbukti: patch ter-render (1 draw call,
     material merah terang) tapi warnanya tak pernah muncul di layar.

     Menaikkan radius patch juga salah: pengamat hanya 50 m di atas
     permukaan, jadi patch +0,02% (1,3 km) membuat kamera berada DI BAWAH
     patch.

     SOLUSI: selama POV, mesh bola body disembunyikan dan patch yang
     menggantikannya. Mesh dikembalikan saat keluar POV (lihat
     removeSurfacePatch + EARTHVIEW_UI.exitPOV). Bagian permukaan di luar
     patch (jauh, dekat horizon) tetap ditutup oleh warna dasar langit
     permukaan, jadi tidak ada lubang.
     ===================================================================== */
  if (body.mesh) body.mesh.visible = false;

  surfacePatch = mesh;
  surfacePatchBody = body;
  return mesh;
}

/* Arahkan sebuah mesh potongan bola ke (lat, lon) tertentu.
   Dipakai oleh aimSurfacePatch() (patch aktif) dan saat membangun UV. */
function aimSurfacePatchMesh(mesh, lat, lon) {
  const latR = lat * DEG, lonR = lon * DEG;
  const cl = Math.cos(latR);
  const target = new THREE.Vector3(cl * Math.cos(lonR), Math.sin(latR), -cl * Math.sin(lonR)).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(up, target);
}

/* Arahkan patch ke lokasi pengamat (lat/lon) dengan memutar potongan bola
   sehingga pusatnya (kutub +Y lokal) jatuh tepat di titik itu. */
function aimSurfacePatch(body, lat, lon) {
  if (!surfacePatch || !body) return;
  aimSurfacePatchMesh(surfacePatch, lat, lon);
}

/* Pasang / perbarui patch untuk body & koordinat tertentu.
   Dipanggil tiap frame saat POV aktif.

   PENTING: patch dibangun ulang bila ELEVASI atau FOV berubah, karena
   luasnya bergantung pada keduanya (lihat surfacePatchRadiusDeg). Tanpa
   ini, patch tetap memakai ukuran lama — terbukti di uji: thetaLength
   tetap 1,3° padahal FOV sudah 50°. */
function updateSurfacePatch(body, lat, lon) {
  if (!body) { removeSurfacePatch(); return; }
  const key = body.key || body.name;
  const elevM = (typeof SURFACE_VIEW !== 'undefined') ? (SURFACE_VIEW.elev || 50) : 50;
  const fovDeg = (typeof SURFACE_VIEW !== 'undefined') ? (SURFACE_VIEW.fov || 50) : 50;
  /* UV patch bergantung pada lat/lon, jadi keduanya masuk signature —
     tanpa ini, berpindah lokasi akan memakai tekstur lokasi lama. */
  const sig = key + '|' + Math.round(elevM) + '|' + Math.round(fovDeg) +
              '|' + lat.toFixed(3) + '|' + lon.toFixed(3);
  if (sig !== surfacePatchKey) {
    removeSurfacePatch();
    buildSurfacePatch(body);
    surfacePatchKey = sig;
  }
  aimSurfacePatch(body, lat, lon);
  if (surfacePatch) surfacePatch.visible = true;
  /* pencahayaan mengikuti tinggi Matahari (agar permukaan tetap terlihat
     saat Matahari rendah — lihat penjelasan di setPovLighting) */
  if (typeof updateSurfacePatchLighting === 'function') {
    const obs = (typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.computeObserver)
      ? SURFACE_VIEW.computeObserver(body) : null;
    if (obs) updateSurfacePatchLighting(obs);
  } else if (typeof setPovLighting === 'function') {
    setPovLighting(true, 30);
  }
}

/* Lepas patch (saat keluar POV atau ganti body). */
function removeSurfacePatch() {
  if (surfacePatch) {
    if (surfacePatch.parent) surfacePatch.parent.remove(surfacePatch);
    if (surfacePatch.geometry) surfacePatch.geometry.dispose();
    if (surfacePatch.material) surfacePatch.material.dispose();
    surfacePatch = null;
  }
  /* kembalikan mesh bola body yang disembunyikan selama POV */
  if (surfacePatchBody && surfacePatchBody.mesh) {
    surfacePatchBody.mesh.visible = true;
  }
  /* matikan cahaya tambahan khusus POV */
  if (typeof setPovLighting === 'function') setPovLighting(false);
  surfacePatchBody = null;
  surfacePatchKey = '';
}

/* Sembunyikan patch tanpa menghancurkannya (mis. saat pengguna mematikan
   permukaan detail). */
function hideSurfacePatch() {
  if (surfacePatch) surfacePatch.visible = false;
}
