/* =======================================================================
   Aplikasi utama: pemuatan, antarmuka, label, dan gelung render
   ======================================================================= */

const app = {
  days: 0,                 /* hari simulasi sejak 2000-01-01 */
  daysPerSecond: 1 / 86400,   /* default 1 dtk = 1 detik / waktu nyata
                                 (lihat DEFAULT_SPEED_INDEX) */
  paused: false,
  scrubbing: false,        /* true saat slider "Geser waktu" sedang ditarik */
  labelsOn: true,
  orbitsOn: true,
  ready: false,
  fps: 0,
  qualityTier: 'hi',
};

const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);

/* ---------- tingkat kualitas tekstur ---------- */
/* Tekstur 8K RGBA memakai 134 MB VRAM masing-masing; delapan di antaranya
   akan menghabiskan memori GPU. Jadi kita pilih tingkat berdasarkan
   kemampuan perangkat, dan pengguna bisa mengubahnya. */
function detectQualityTier() {
  try {
    const test = document.createElement('canvas');
    const gl = test.getContext('webgl2') || test.getContext('webgl');
    if (!gl) return 'lo';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rend = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    const mem = navigator.deviceMemory || 8;
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
    const lowGPU = /Intel|HD Graphics|UHD Graphics|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Software/i.test(rend);
    if (lowGPU || mem <= 4 || maxTex < 4096) return 'lo';
    return 'hi';
  } catch (e) { return 'lo'; }
}

function pickQualityTier() {
  const url = new URLSearchParams(location.search).get('q');
  if (url === 'hi' || url === 'lo') return url;
  return detectQualityTier();
}

function setQualityTier(tier) {
  app.qualityTier = tier;
  ASSET_BASE = 'assets/' + tier + '/';
  try { localStorage.setItem('solarQuality', tier); } catch (e) {}
}

/* ---------- elemen DOM ---------- */
const $ = (id) => document.getElementById(id);

function setLoading(pct, task) {
  const f = $('loaderFill'), p = $('loaderPct'), t = $('loaderTask');
  if (f) f.style.width = pct + '%';
  if (p) p.textContent = Math.round(pct) + '%';
  if (t && task) t.textContent = task;
}
const nextFrame = () => new Promise((r) => setTimeout(r, 16));

/* =======================================================================
   Pemuatan
   ======================================================================= */
async function boot() {
  const canvas = $('scene');

  /* uji ketersediaan WebGL */
  try {
    const test = document.createElement('canvas');
    const gl = test.getContext('webgl2') || test.getContext('webgl') || test.getContext('experimental-webgl');
    if (!gl) throw new Error('no webgl');
  } catch (err) {
    $('loader').style.display = 'none';
    $('errorBox').style.display = 'flex';
    return;
  }

  setLoading(4, 'Menyiapkan mesin grafis…');
  await nextFrame();

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.0005, 2000000);
  initRenderer(canvas);
  window.addEventListener('resize', onResize);

  /* ---- pilih tingkat kualitas tekstur ---- */
  const tier = pickQualityTier();
  setQualityTier(tier);

  /* ---- muat tekstur asli, dengan bilah kemajuan nyata ---- */
  setLoading(6, 'Memuat tekstur planet asli…');
  await nextFrame();
  await loadAllAssets((done, total, file) => {
    const pct = 6 + (done / total) * 62;
    setLoading(pct, 'Mengunduh tekstur ' + done + '/' + total + ' — ' + file);
  });

  /* ---- pembangunan bertahap ---- */
  const steps = [];
  steps.push(['Menyusun langit Bima Sakti…', () => { buildSky(); }]);
  steps.push(['Menyalakan Matahari…', () => { buildSun(); }]);
  for (let i = 0; i < PLANETS.length; i++) {
    const p = PLANETS[i];
    steps.push(['Menata ' + p.name + '…', () => {
      const body = buildBody(p, null, null);
      bodies.push(body);
      if (p.moons) {
        for (let j = 0; j < p.moons.length; j++) {
          const moon = buildBody(p.moons[j], body.moonPlane, body);
          bodies.push(moon);
        }
      }
    }]);
  }
  steps.push(['Menebar sabuk asteroid…', () => { buildBelt(); }]);
  steps.push(['Menyalakan bintang-bintang…', () => { buildStars(); buildBeacons(); }]);

  const base = 70, span = 20;
  for (let i = 0; i < steps.length; i++) {
    setLoading(base + (i / steps.length) * span, steps[i][0]);
    await nextFrame();
    steps[i][1]();
  }

  setLoading(88, 'Menata orbit…');
  await nextFrame();

  /* sudut awal acak agar konfigurasi langsung tampak hidup */
  const rnd = mulberry32(4242);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.type === 'star') continue;
    b.theta0 = rnd() * Math.PI * 2;
  }

  /* mulai dari "hari ini" */
  app.days = (Date.now() - J2000) / 86400000;
  computePositions(app.days, 0);
  applyPositions();

  setLoading(94, 'Menyusun antarmuka…');
  await nextFrame();
  buildUI();
  initControls(canvas);
  buildLabels();
  buildDatePanel();

  setLoading(100, 'Siap!');
  await nextFrame();

  app.ready = true;
  $('loader').classList.add('done');
  setTimeout(() => { const l = $('loader'); if (l) l.style.display = 'none'; }, 800);

  /* ======================================================================
     BANGUN LABEL BINTANG SETELAH ASET SIAP
     ----------------------------------------------------------------------
     BUG YANG DIPERBAIKI: `buildStarLabels()` hanya dipanggil saat checkbox
     DIUBAH — tidak pernah dipanggil setelah katalog bintang selesai
     dimuat. Akibatnya daftar label kosong dan nama bintang TIDAK MUNCUL
     walau "Nama bintang & galaksi" sudah dicentang. Inilah keluhan
     pengguna: "nama bintang nya tidak muncul".
     Sekarang dipanggil di sini, saat starField.labeled sudah terisi.
     ====================================================================== */
  try {
    if (typeof buildStarLabels === 'function') buildStarLabels();
    if (typeof CONSTELLATION_LABELS !== 'undefined') {
      CONSTELLATION_LABELS.build();
      CONSTELLATION_LABELS.update($('chkConst') ? $('chkConst').checked : false);
    }
  } catch (e) { console.warn('label langit gagal dibangun:', e); }

  let last = performance.now();
  let acc = 0, frames = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt; frames++;
    if (acc > 0.5) { app.fps = frames / acc; acc = 0; frames = 0; }

    if (!app.paused && !app.scrubbing) {
      /* waktu dibekukan selama transisi kamera agar lompatan mulus;
         diperlambat otomatis saat kamera sangat dekat permukaan.
         Saat slider "Geser waktu" ditarik, waktu TIDAK maju sendiri —
         posisinya ditentukan langsung oleh slider. */
      if (!anyTransitionActive()) app.days += dt * app.daysPerSecond * effectiveTimeScale();
    }

    /* --- urutan penting untuk floating origin ---
       1. hitung posisi absolut semua benda
       2. perbarui kamera (menetapkan rebaseOffset untuk frame ini)
       3. geser benda ke posisi render memakai offset yang SAMA
       Dengan urutan ini tidak ada keterlambatan satu frame antara
       benda dan kamera — inilah yang membuat zoom presisi mungkin. */
    computePositions(app.days, now * 0.001);
    /* =====================================================================
       LANGIT PERMUKAAN DINAMIS (siang ↔ malam)
       ---------------------------------------------------------------------
       Dipanggil SEBELUM updateCamera supaya warna langit memakai posisi
       pengamat frame ini. Warna dihitung dari elevasi Matahari di lokasi
       pengamat: biru siang → jingga senja → hitam malam, dan berubah
       otomatis saat waktu simulasi berjalan (itulah "animasi siang
       malam" yang diminta).
       ===================================================================== */
    if (typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.active &&
        typeof updateSurfaceSky === 'function') {
      const svBody = SURFACE_VIEW.currentBody();
      const svObs = SURFACE_VIEW.computeObserver(svBody);
      if (svObs) updateSurfaceSky(svObs, svBody, SURFACE_VIEW.atmosphereOn);
      /* Permukaan lokal resolusi tinggi: mesh planet terlalu kasar
         (segmen ~500 km), sehingga dari 50 m permukaan tak terlihat sama
         sekali. Patch ini memasang potongan bola rapat di sekitar pengamat. */
      if (typeof updateSurfacePatch === 'function') {
        updateSurfacePatch(svBody, SURFACE_VIEW.lat, SURFACE_VIEW.lon);
      }
      /* ==================================================================
         CITRA PERMUKAAN RESOLUSI TINGGI (NASA GIBS / NASA TREK)
         ------------------------------------------------------------------
         PERMINTAAN PENGGUNA: "asset mode pov tiap planet dan satelit ...
         sangat tidak HD, cari asset paling HD dan realistik".

         AKAR MASALAH: SURFACE_DETAIL (kanvas 4096x4096 dari tile NASA
         GIBS 250 m/px untuk Bumi, NASA Trek 232 m/px untuk Mars/Bulan/Io)
         SUDAH ditulis lengkap tetapi TIDAK PERNAH DIPANGGIL dari mana pun
         (dead code) — sehingga patch hanya memakai tekstur global
         (1024x512 di mode Ringan / 4096x2048 di mode Tinggi) yang
         diregangkan, dan hasilnya tampak polos.

         Sekarang dipanggil tiap frame saat POV aktif. Aman dipanggil
         sesering ini: applyToPatch() memakai cache tekstur + kunci
         (srcKey|lat|lon|span|zoom) sehingga tidak membangun ulang selama
         pengamat tidak berpindah, dan pemuatan tile berjalan ASINKRON
         (render tidak pernah terblokir). Bila offline / layer tidak
         tersedia, fungsi ini mengembalikan false tanpa mengubah apa pun —
         patch tetap memakai tekstur global.
         ================================================================== */
      if (typeof SURFACE_DETAIL !== 'undefined' && SURFACE_DETAIL.enabled &&
          SURFACE_DETAIL.applyToPatch) {
        SURFACE_DETAIL.applyToPatch(svBody, SURFACE_VIEW.lat, SURFACE_VIEW.lon);
      }
      /* ==================================================================
         CINCIN PLANET DARI PERMUKAAN (PERBAIKAN 29 Sep)
         ------------------------------------------------------------------
         KELUHAN: "untuk pov saturnus itu kenapa gada posisi yg terlihat
         cincin ikonik saturnus nya".

         AKAR MASALAH (terukur di browser, bukan dugaan):
         - Cincin Saturnus SUDAH ada di scene (mesh radius 11,7-22,0 unit,
           benar menempel pada planet), TAPI dari POV ia TIDAK PERNAH
           muncul di layar. Bukti: menyalakan/mematikan b.ringMesh.visible
           menghasilkan SELISIH 0 PIXEL pada render.
         - Penyebabnya urutan render + depth test:
               cincin : renderOrder 0, transparent, depthWrite false
               patch  : renderOrder 5, depthWrite TRUE
           Patch permukaan (potongan bola rapat di kaki pengamat) dirender
           BELAKANGAN dan menulis depth, sehingga cincin yang berada di
           langit tertutup oleh dinding patch.
         - Selain itu, dari permukaan planet, cincin berada pada sudut
           rendah terhadap horizon (mis. lintang 20: 21-56 derajat), jadi
           ia memang harus terlihat "menempel" di langit.

         PERBAIKAN: saat POV aktif, cincin diberi renderOrder lebih besar
         dari patch (10) dan depthTest dimatikan, sehingga selalu tampil di
         atas permukaan. Saat POV dimatikan, setelannya dikembalikan
         (depthTest true, renderOrder 0) supaya tampilan orbit normal.
         ================================================================== */
      if (typeof bodies !== 'undefined') {
        for (const bb of bodies) {
          if (!bb.ringMesh) continue;
          if (bb.ringMesh.userData.povSaved === undefined) {
            bb.ringMesh.userData.povSaved = {
              renderOrder: bb.ringMesh.renderOrder,
              depthTest: bb.ringMesh.material.depthTest,
            };
          }
          bb.ringMesh.renderOrder = 10;
          bb.ringMesh.material.depthTest = false;
        }
      }
      /* Bintang & rasi diredupkan otomatis saat siang (hamburan Rayleigh:
         langit siang jauh lebih terang sehingga bintang tenggelam). */
      if (typeof applyDaylightStarDimming === 'function' && svObs) {
        applyDaylightStarDimming(SURFACE_VIEW.sunAltitudeDeg(svObs));
      }
      /* KOMPAS arah mata angin (permintaan pengguna: "tambahkan juga arah
         mata angin") — strip di atas layar yang bergeser mengikuti azimut. */
      if (typeof COMPASS !== 'undefined' && svObs) {
        COMPASS.update(SURFACE_VIEW.az * 180 / Math.PI);
      }
    } else {
      if (typeof hideSurfaceSky === 'function') hideSurfaceSky();
      if (typeof removeSurfacePatch === 'function') removeSurfacePatch();
      if (typeof applyDaylightStarDimming === 'function') applyDaylightStarDimming(0);
      if (typeof COMPASS !== 'undefined') COMPASS.update(0);
      if (typeof LANDSCAPE !== 'undefined') LANDSCAPE.hide();
      if (typeof SKY_TILES !== 'undefined') SKY_TILES.hide();
      /* Kembalikan setelan cincin ke mode orbit (lihat blok POV di atas). */
      if (typeof bodies !== 'undefined') {
        for (const bb of bodies) {
          if (!bb.ringMesh || !bb.ringMesh.userData.povSaved) continue;
          bb.ringMesh.renderOrder = bb.ringMesh.userData.povSaved.renderOrder;
          bb.ringMesh.material.depthTest = bb.ringMesh.userData.povSaved.depthTest;
          delete bb.ringMesh.userData.povSaved;
        }
      }
    }
    updateCamera(dt);
    applyPositions();

    /* ==================================================================
       LANDSCAPE SILUET DARATAN — HARUS SETELAH updateCamera
       ------------------------------------------------------------------
       BUG YANG DIPERBAIKI: versi sebelumnya memanggil LANDSCAPE.update()
       SEBELUM updateCamera(), sehingga camera.position masih berisi nilai
       frame sebelumnya (bukan 0,0,0 yang dipakai POV) → silinder siluet
       dipasang di posisi yang salah dan tidak terlihat (terbukti:
       posSilinder = (−0,00044, −0,00016, −0,00057) padahal seharusnya
       tepat di kamera 0,0,0).

       Sekarang dipanggil SETELAH updateCamera + applyPositions, sehingga
       posisi kamera sudah final.
       ================================================================== */
    if (typeof LANDSCAPE !== 'undefined' && typeof SURFACE_VIEW !== 'undefined' &&
        SURFACE_VIEW.active) {
      const lsBody = SURFACE_VIEW.currentBody();
      const lsObs = SURFACE_VIEW.computeObserver(lsBody);
      if (lsObs) LANDSCAPE.update(lsObs, SURFACE_VIEW.az, SURFACE_VIEW.elev || 50);
    }
    /* glow Matahari dijaga tetap terlihat dari jarak berapa pun */
    if (typeof updateSunGlowScale === 'function') updateSunGlowScale();
    updateOrbitLines(J2000_JD + app.days);
    updateTour(dt);
    updateLabels();
    /* label nama rasi bintang — tampil bila "Garis rasi bintang" aktif */
    if (typeof CONSTELLATION_LABELS !== 'undefined') {
      CONSTELLATION_LABELS.update(app.constellationLinesOn !== false && app.labelsOn !== false);
    }
    /* zoom bertahap & panel bintang terfokus */
    if (typeof STAR_FOCUS !== 'undefined') STAR_FOCUS.update(dt);
    /* LOD langit: pilih tekstur sesuai fov (zoom berlapis seperti Stellarium) */
    if (typeof SKY_LOD !== 'undefined') SKY_LOD.update();
    /* citra langit resolusi tinggi saat zoom masuk (Legacy Survey) */
    if (typeof SKY_TILES !== 'undefined') SKY_TILES.update();
    /* citra langit NYATA dari DSS saat zoom masuk — sama seperti Stellarium */
    if (typeof SKY_DSS !== 'undefined') SKY_DSS.update();
    updateOrbitLineVisibility();
    updateBeacons();
    updateHud();
    updateStarLabels();
    /* panel pengamat POV: perbarui tiap frame selama POV aktif supaya LST
       tidak ketinggalan saat waktu simulasi berjalan cepat (1 hari/detik) */
    if (typeof EARTH_VIEW !== 'undefined' && EARTH_VIEW.active &&
        typeof EARTHVIEW_UI !== 'undefined') EARTHVIEW_UI.updateObserverPanel();
    if (datePanelState.open) renderDatePanel();
    if (!window.__skyInfoT || performance.now() - window.__skyInfoT > 900) {
      window.__skyInfoT = performance.now();
      updateSkyInfo();
    }
    updateEventBadge();
    if (typeof TEMPORAL_BADGE !== 'undefined') TEMPORAL_BADGE.update(app.days);

    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}

/* =======================================================================
   Antarmuka
   ======================================================================= */
function buildUI() {
  /* ---- badge validitas waktu ---- */
  try {
    if (typeof TEMPORAL_BADGE !== 'undefined') {
      TEMPORAL_BADGE.init();
      TEMPORAL_BADGE.update(app.days);
    }
  } catch (e) { console.warn('temporal badge gagal:', e); }

  /* ---- kompas arah mata angin (mode POV) ---- */
  try {
    if (typeof COMPASS !== 'undefined') COMPASS.init();
  } catch (e) { console.warn('kompas gagal:', e); }

  /* ---- label nama rasi bintang ---- */
  try {
    if (typeof CONSTELLATION_LABELS !== 'undefined') CONSTELLATION_LABELS.init();
  } catch (e) { console.warn('label rasi gagal:', e); }

  /* ---- fokus bintang (zoom ke bintang seperti Stellarium) ---- */
  try {
    if (typeof STAR_FOCUS !== 'undefined') STAR_FOCUS.init();
  } catch (e) { console.warn('star focus gagal:', e); }

  /* ---- pencarian benda langit ---- */
  try {
    if (typeof SEARCH !== 'undefined') SEARCH.init();
  } catch (e) { console.warn('pencarian gagal:', e); }

  /* =====================================================================
     POV PERMUKAAN: isi ulang dropdown setelah seluruh body siap
     ---------------------------------------------------------------------
     EARTHVIEW_UI.init() sudah berjalan di DOMContentLoaded, tetapi saat itu
     daftar `bodies` MASIH KOSONG — sehingga dropdown benda langit tidak
     terisi (terbukti di uji: 0 opsi). Di sini (setelah semua planet &
     satelit dibangun) kita panggil ulang init supaya dropdown lengkap.
     ===================================================================== */
  try {
    if (typeof EARTHVIEW_UI !== 'undefined' && typeof SURFACE_VIEW !== 'undefined') {
      /* bersihkan listener lama dengan menandai sudah-inisialisasi ulang */
      EARTHVIEW_UI._filled = false;
      EARTHVIEW_UI.refillBodySelect();
    }
  } catch (e) { console.warn('POV dropdown gagal:', e); }
  /* ---- daftar benda di bilah samping ---- */
  const list = $('bodyList');
  list.innerHTML = '';
  list.appendChild(makeGroupLabel('Bintang'));
  list.appendChild(makeItem(findBody('sun'), null, 0));
  list.appendChild(makeGroupLabel('Planet'));
  for (let i = 0; i < PLANETS.length; i++) {
    const p = PLANETS[i];
    const b = findBody(p.key);
    list.appendChild(makeItem(b, (i + 1), 0));
    if (p.moons) {
      for (let j = 0; j < p.moons.length; j++) {
        const m = findBodyByName(p.moons[j].name);
        if (m) list.appendChild(makeItem(m, null, 1));
      }
    }
  }

  /* ---- tombol ---- */
  $('btnTour').addEventListener('click', () => {
    if (tourState.active) { stopTour(); setBtn('btnTour', '▶ Tur Terpandu', false); }
    else { startTour(); setBtn('btnTour', '■ Hentikan Tur', true); }
  });
  $('btnLabels').addEventListener('click', () => toggleLabels());
  $('btnDate').addEventListener('click', () => toggleDatePanel());
  $('chkLabels2').addEventListener('change', (e) => setLabels(e.target.checked));
  $('chkOrbits').addEventListener('change', (e) => setOrbits(e.target.checked));
  /* kontrol langit nyata */
  $('chkStars').addEventListener('change', (e) => setStarFieldVisible(e.target.checked));
  $('chkConst').addEventListener('change', (e) => setConstellationLines(e.target.checked));
  /* Pita Bima Sakti bisa dimatikan — pengguna yang menganggap pita terlalu
     menonjol/gumpalan bisa menyembunyikannya dan tetap melihat bintang. */
  if ($('chkMilkyWay')) {
    $('chkMilkyWay').addEventListener('change', (e) => {
      if (typeof skyMesh !== 'undefined' && skyMesh) skyMesh.visible = e.target.checked;
      if (typeof MILKY_WAY_ON !== 'undefined') window.MILKY_WAY_ON = e.target.checked;
    });
  }
  $('chkStarNames').addEventListener('change', (e) => {
    setStarNames(e.target.checked);
    buildStarLabels();
  });
  /* ======================================================================
     BUG YANG DIPERBAIKI — STATE AWAL TIDAK DIBACA DARI CHECKBOX
     ----------------------------------------------------------------------
     KELUHAN PENGGUNA: "cekbox nya sudah benar tapi tidak sesuai dengan
     hasil nya masih ada garis rasi dan nama bintang nya tidak muncul"

     AKAR MASALAH: handler `change` hanya bekerja saat pengguna MENGUBAH
     checkbox. Saat halaman dimuat, aplikasi memakai nilai default internal:
         constellationLinesOn = undefined -> dianggap ON  (garis rasi muncul)
         starNamesOn           = false     -> nama bintang tidak muncul
     Padahal HTML sudah menyetel:
         chkConst     = TIDAK dicentang  (garis rasi seharusnya MATI)
         chkStarNames = dicentang        (nama bintang seharusnya NYALA)
     Jadi tampilan tidak cocok dengan checkbox — persis keluhan pengguna.

     PERBAIKAN: setelah seluruh handler terpasang, state dibaca DARI
     checkbox (HTML) sebagai sumber kebenaran tunggal, lalu diterapkan.
     ====================================================================== */
  try {
    if ($('chkStars')) setStarFieldVisible($('chkStars').checked);
    if ($('chkConst')) setConstellationLines($('chkConst').checked);
    if ($('chkMilkyWay')) {
      const on = $('chkMilkyWay').checked;
      if (typeof skyMesh !== 'undefined' && skyMesh) skyMesh.visible = on;
      window.MILKY_WAY_ON = on;
    }
    if ($('chkStarNames')) setStarNames($('chkStarNames').checked);
    if ($('chkOrbits')) setOrbits($('chkOrbits').checked);
    if ($('chkLabels2')) setLabels($('chkLabels2').checked);
  } catch (e) { console.warn('inisialisasi checkbox gagal:', e); }

  /* ======================================================================
     BANGUN LABEL BINTANG SETELAH SELURUH DATA SIAP
     ----------------------------------------------------------------------
     KENAPA DIPISAH: `buildStarLabels()` memerlukan `starField.labeled`
     (katalog bintang) dan `starField.deepSkySprites` yang baru terisi
     setelah aset selesai dimuat. Bila dipanggil saat buildUI() (sebelum
     aset siap), daftarnya kosong sehingga TIDAK ADA label yang dibuat —
     itulah sebabnya nama bintang tidak muncul walau checkbox dicentang.

     Solusi: bangun sekarang (bila sudah siap) DAN sekali lagi setelah
     aset selesai dimuat (lihat pemanggilan di onAllAssetsLoaded).
     ====================================================================== */
  if (typeof starField !== 'undefined' && starField.labeled && starField.labeled.length) {
    buildStarLabels();
  }
  if ($('starCount')) {
    $('starCount').textContent = '(' + (STARS_LABELED.length + STARS_OTHER.length) + ')';
  }
  /* ---- backdrop & laci (HP) ---- */
  const backdrop = $('uiBackdrop');
  const syncBackdrop = () => {
    const sb = $('sidebar');
    const dp = $('datePanel');
    const anyOpen = (sb && sb.classList.contains('open')) ||
                    $('helpPanel').classList.contains('show') ||
                    (dp && !dp.classList.contains('hidden')) ||
                    ($('earthviewModal') && !$('earthviewModal').classList.contains('hidden'));
    if (backdrop) backdrop.classList.toggle('show', !!anyOpen);
  };
  window.__syncBackdrop = syncBackdrop;   /* dipakai handler lain */
  if (backdrop) backdrop.addEventListener('click', () => {
    $('sidebar').classList.remove('open');
    $('helpPanel').classList.remove('show');
    if ($('datePanel')) $('datePanel').classList.add('hidden');
    if (typeof datePanelState !== 'undefined') datePanelState.open = false;
    if ($('earthviewModal')) $('earthviewModal').classList.add('hidden');
    if (typeof EARTHVIEW_UI !== 'undefined' && EARTHVIEW_UI.modal) EARTHVIEW_UI.hide();
    syncBackdrop();
  });

  $('btnHelp').addEventListener('click', () => { $('helpPanel').classList.toggle('show'); syncBackdrop(); });
  $('btnHelpClose').addEventListener('click', () => { $('helpPanel').classList.remove('show'); syncBackdrop(); });
  $('btnSidebar').addEventListener('click', () => {
    const sb = $('sidebar');
    if (window.matchMedia('(max-width: 980px)').matches) sb.classList.toggle('open');
    else sb.classList.toggle('hidden');
    syncBackdrop();
  });
  /* Tombol "Daftar" di toolbar: di HP membuka laci, di desktop
     menyembunyikan/menampilkan bilah samping. */
  const drawerBtn = $('btnDrawer');
  if (drawerBtn) drawerBtn.addEventListener('click', () => {
    const sb = $('sidebar');
    if (window.matchMedia('(max-width: 980px)').matches) sb.classList.toggle('open');
    else sb.classList.toggle('hidden');
    syncBackdrop();
  });

  /* tombol lepas fokus (HP: pengganti Esc) */
    const exitFocusBtn = $('btnExitFocus');
    if (exitFocusBtn) { exitFocusBtn.addEventListener('click', () => focusBody(null)); }
  $('btnInfoClose').addEventListener('click', () => { $('infoPanel').classList.remove('show'); });

  $('btnFocus').addEventListener('click', () => {
    if (currentInfoBody) focusBody(currentInfoBody);
  });
  $('btnMoons').addEventListener('click', () => {
    if (currentInfoBody) viewMoonSystem(currentInfoBody);
  });
  $('btnFree').addEventListener('click', () => focusBody(null));

  $('btnPause').addEventListener('click', () => togglePause());
  $('btnNow').addEventListener('click', () => {
    app.days = (Date.now() - J2000) / 86400000;
  });

  /* pemilih zona waktu jam */
  const tzSel = $('tzSelect');
  if (tzSel) {
    /* pilih zona perangkat secara otomatis pada awal */
    const devOffset = -new Date().getTimezoneOffset();
    let cocok = false;
    for (const opt of tzSel.options) {
      if (opt.value === String(devOffset)) { tzSel.value = opt.value; cocok = true; break; }
    }
    if (!cocok) tzSel.value = 'device';
    setTimezone(tzSel.value);
    tzSel.addEventListener('change', (e) => setTimezone(e.target.value));
  }
  const slider = $('speedSlider');
  slider.max = String(TIME_TABLE.length - 1);
  /* ======================================================================
     DEFAULT LAJU WAKTU — 1 DETIK = 1 MENIT
     ----------------------------------------------------------------------
     PERMINTAAN PENGGUNA: "buat default waktu simulasi nya itu 1 detik
     1 menit saja".

     TIME_TABLE[1] = 1/1440 hari per detik = 1 menit per detik.
     Sebelumnya default-nya indeks 5 (1 hari per detik) — terlalu cepat
     untuk pengamatan permukaan (Bumi berputar penuh dalam 1 detik),
     sehingga pengguna harus memperlambat setiap kali membuka aplikasi.
     Laju ini memberi siklus siang-malam ~24 menit — cukup tenang untuk
     mengamati langit sambil tetap terasa berjalan.
     ====================================================================== */
  const DEFAULT_SPEED_INDEX = 0;            /* 1 dtk = 1 detik (waktu nyata) */
  slider.value = String(DEFAULT_SPEED_INDEX);
  const upd = () => {
    const i = parseInt(slider.value, 10);
    app.daysPerSecond = TIME_TABLE[i];
    const pct = (i / (TIME_TABLE.length - 1)) * 100;
    slider.style.setProperty('--fill', pct + '%');
    $('speedLabel').textContent = '1 dtk = ' + TIME_LABELS[i];
  };
  slider.addEventListener('input', upd);
  upd();

  /* ======================================================================
     SLIDER GESER WAKTU (scrub) — maju / mundur bebas dari tampilan utama
     ----------------------------------------------------------------------
     Cara kerja: slider selalu bertengger di tengah (500 dari 0..1000).
     Tarik ke kanan -> waktu maju; ke kiri -> waktu mundur. Begitu dilepas,
     slider kembali ke tengah dan waktu TETAP di posisi barunya, jadi bisa
     ditarik berulang tanpa batas (tidak "mentok" di ujung seperti slider
     absolut).

     Skala mengikuti laju waktu yang sedang aktif (TIME_TABLE), supaya
     terasa konsisten: pada 1 hari/detik, geser penuh = ±30 hari; pada
     1 tahun/detik, geser penuh = ±10 tahun, dst.
     ====================================================================== */
  const scrub = $('timeScrub');
  const scrubLabel = $('scrubLabel');
  if (scrub) {
    let scrubBaseDays = app.days;   /* posisi waktu saat tarikan dimulai */
    let scrubStartVal = 500;
    let scrubPxPerDay = null;       /* mode presisi: piksel per hari (diisi saat drag mulai) */
    let scrubStartX = 0;

    /* ======================================================================
       SKALA GESER WAKTU — DIPERBAIKI (keluhan: "slider maju mundur terlalu
       sensitif, mau geser beberapa menit malah lompat puluhan jam/hari")
       ----------------------------------------------------------------------
       MASALAH versi lama:
         scrubSpanDays() = max(1, sqrt(rate) * 30)
         • Pada laju 1 detik/detik (rate = 1/86400): sqrt = 0,0034 → hasil
           max(1, 0,1) = 1 HARI. Jadi tarikan sekecil apa pun minimal
           menggeser 1 hari penuh — tidak mungkin menyetel beberapa menit.
         • Pada laju 1 hari/detik: span = 30 hari untuk tarikan penuh.
           Satu piksel (dari 500 px) = 30/500 hari = 86 menit → masih jauh
           terlalu kasar untuk menyetel beberapa menit.

       PERBAIKAN: skala dibuat dari LAJU WAKTU YANG AKTIF, dengan rentang
       yang jauh lebih halus dan tanpa batas bawah 1 hari:
           span penuh = rate (dalam hari) × 500 detik-tarik
         Artinya tarikan penuh menggeser waktu sebanyak yang berjalan
         selama 500 detik (8,3 menit) pada laju saat itu:
           • laju 1 detik/detik  → span 5,8 menit  (1 px ≈ 0,7 detik)
           • laju 1 menit/detik  → span 5,8 jam    (1 px ≈ 42 detik)
           • laju 1 hari/detik   → span 8,3 hari   (1 px ≈ 24 menit)
           • laju 1 tahun/detik  → span 8,3 tahun  (1 px ≈ 6 hari)
         Dengan begitu pengguna SELALU bisa menyetel sekitar 1/500 dari
         span — cukup halus untuk beberapa menit pada laju lambat, dan
         tetap praktis pada laju cepat.
       ====================================================================== */
    const scrubSpanDays = () => {
      const rate = Math.max(1e-9, app.daysPerSecond);   /* hari per detik */
      /* tarikan penuh = waktu yang berjalan selama 500 detik pada laju ini */
      return Math.max(1e-5, rate * 500);
    };

    const scrubApply = () => {
      const delta = (parseInt(scrub.value, 10) - scrubStartVal) / 500;  /* -1..1 */
      /* mode presisi: tahan Shift → skala 1/10 supaya bisa menyetel menit */
      const presisi = (typeof window !== 'undefined' && window.__scrubPrecise)
        ? window.__scrubPrecise : 1;
      const days = scrubBaseDays + delta * scrubSpanDays() * presisi;
      app.days = days;
      computePositions(app.days, performance.now() * 0.001);
      applyPositions();
      updateLabels();
      updateHud();
      updateEventBadge();
      if (typeof TEMPORAL_BADGE !== 'undefined') TEMPORAL_BADGE.update(app.days);
      if (datePanelState.open) renderDatePanel();
      /* tampilkan besar pergeseran sebagai umpan balik.
         ==================================================================
         SATUAN DIPERBAIKI: versi lama melompat dari "jam" ke "hari" — nilai
         di bawah 1 hari selalu ditulis dalam jam dengan satu desimal
         (mis. "0,1 jam" = 6 menit), sehingga pergeseran beberapa MENIT
         tampak sebagai angka aneh atau "0,0 jam". Sekarang ditambah satuan
         MENIT dan DETIK supaya pergeseran kecil terbaca jelas.
         ================================================================== */
      if (scrubLabel) {
        const d = days - scrubBaseDays;
        const abs = Math.abs(d);
        let txt;
        if (abs * 86400 < 90) txt = (abs * 86400).toFixed(0) + ' detik';
        else if (abs * 1440 < 90) txt = (abs * 1440).toFixed(1) + ' menit';
        else if (abs < 1) txt = (abs * 24).toFixed(1) + ' jam';
        else if (abs < 60) txt = abs.toFixed(2) + ' hari';
        else if (abs < 730) txt = (abs / 30.44).toFixed(1) + ' bulan';
        else txt = (abs / 365.25).toFixed(1) + ' tahun';
        scrubLabel.textContent = (d >= 0 ? '+' : '−') + txt;
        scrubLabel.classList.add('aktif');
      }
    };

    const scrubBegin = (resetValue) => {
      if (app.scrubbing) return;
      app.scrubbing = true;
      scrubBaseDays = app.days;
      scrubStartVal = 500;
      /* pointer: mulai selalu dari tengah. Keyboard: jangan reset nilainya,
         karena nilai itulah yang baru saja diubah oleh tombol panah. */
      if (resetValue) scrub.value = '500';
    };
    const scrubEnd = () => {
      app.scrubbing = false;
      /* pertahankan waktu di posisi baru; slider kembali ke tengah */
      scrub.value = '500';
      if (scrubLabel) {
        scrubLabel.textContent = 'mundur ⟷ maju';
        scrubLabel.classList.remove('aktif');
      }
    };

    /* ======================================================================
       MODE PRESISI — TAHAN SHIFT ATAU CTRL SAAT MENARIK
       ----------------------------------------------------------------------
       Untuk menyetel waktu beberapa menit pada laju cepat (mis. 1 tahun/
       detik), tarikan biasa masih terlalu kasar: satu piksel = 6 hari.
       Dengan menahan Shift, skala dikali 1/10 sehingga satu piksel = 14 jam;
       dengan Shift+Ctrl dikali 1/100 → 1,4 jam.

       Pelacakan tombol: didengarkan di window supaya status Shift terbaca
       walau fokus berada di slider (bukan di body).
       ====================================================================== */
    let shiftDown = false, ctrlDown = false;
    const updatePrecise = () => {
      const p = (shiftDown && ctrlDown) ? 0.01 : (shiftDown || ctrlDown) ? 0.1 : 1;
      window.__scrubPrecise = p;
      /* perbarui label petunjuk agar pengguna tahu mode presisi aktif */
      if (scrub && !app.scrubbing) {
        const el = $('scrubHint');
        if (el) {
          el.textContent = p === 1 ? 'mundur ⟷ maju'
            : (p === 0.1 ? 'presisi 1/10 (lepas Shift untuk normal)'
                         : 'presisi 1/100 (lepas Shift+Ctrl untuk normal)');
          el.classList.toggle('presisi', p !== 1);
        }
      }
    };
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') { shiftDown = true; updatePrecise(); }
      if (e.key === 'Control') { ctrlDown = true; updatePrecise(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') { shiftDown = false; updatePrecise(); }
      if (e.key === 'Control') { ctrlDown = false; updatePrecise(); }
    });
    window.addEventListener('blur', () => {
      shiftDown = false; ctrlDown = false; updatePrecise();
    });
    window.__scrubPrecise = 1;

    /* pointer events mencakup mouse + sentuh + stylus */
    scrub.addEventListener('pointerdown', () => scrubBegin(true));
    scrub.addEventListener('input', () => { scrubBegin(false); scrubApply(); });
    /* pointerup di WINDOW: kalau pengguna melepas di luar slider, drag tetap
       diakhiri dengan benar (tanpa ini slider "nyangkut" di posisi tengah) */
    window.addEventListener('pointerup', () => { if (app.scrubbing) scrubEnd(); });
    scrub.addEventListener('pointercancel', scrubEnd);

    /* keyboard (panah kiri/kanan): pakai langkah langsung seperti roda mouse.
       Catatan: event `change` tidak dipakai karena di Chrome ia terpicu pada
       SETIAP penekanan panah, sehingga reset-ke-tengah terjadi terlalu cepat
       dan akumulasi pergeseran tidak bekerja. */
    const scrubStep = (stepDays) => {
      app.days += stepDays;
      computePositions(app.days, performance.now() * 0.001);
      applyPositions(); updateLabels(); updateHud(); updateEventBadge();
      if (typeof TEMPORAL_BADGE !== 'undefined') TEMPORAL_BADGE.update(app.days);
      if (datePanelState.open) renderDatePanel();
      if (scrubLabel) {
        const abs = Math.abs(stepDays);
        const txt = abs < 1 ? (stepDays * 24).toFixed(1) + ' jam'
                  : abs < 60 ? stepDays.toFixed(1) + ' hari'
                  : (stepDays / 365.25).toFixed(1) + ' tahun';
        scrubLabel.textContent = (stepDays >= 0 ? '+' : '−') + txt.replace('-', '');
        scrubLabel.classList.add('aktif');
        clearTimeout(scrubLabel._t);
        scrubLabel._t = setTimeout(() => {
          scrubLabel.textContent = 'mundur ⟷ maju';
          scrubLabel.classList.remove('aktif');
        }, 900);
      }
    };
    scrub.addEventListener('keydown', (e) => {
      let step = 0;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') step = +1;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') step = -1;
      else if (e.key === 'PageUp') step = +10;
      else if (e.key === 'PageDown') step = -10;
      if (!step) return;
      e.preventDefault();
      e.stopPropagation();   /* jangan sampai tombol panah juga "menerbangkan" kamera */
      scrubStep(step * scrubSpanDays() * 0.1);
      scrub.value = '500';
    });
    scrub.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = (e.deltaY < 0 ? 1 : -1) * scrubSpanDays() * 0.1;
      app.days += step;
      computePositions(app.days, performance.now() * 0.001);
      applyPositions(); updateLabels(); updateHud(); updateEventBadge();
      if (typeof TEMPORAL_BADGE !== 'undefined') TEMPORAL_BADGE.update(app.days);
      if (datePanelState.open) renderDatePanel();
      if (scrubLabel) {
        const abs = Math.abs(step);
        const txt = abs < 1 ? (step * 24).toFixed(1) + ' jam'
                  : abs < 60 ? step.toFixed(1) + ' hari'
                  : (step / 365.25).toFixed(1) + ' tahun';
        scrubLabel.textContent = (step >= 0 ? '+' : '−') + txt.replace('-', '');
        scrubLabel.classList.add('aktif');
        clearTimeout(scrubLabel._t);
        scrubLabel._t = setTimeout(() => {
          scrubLabel.textContent = 'mundur ⟷ maju';
          scrubLabel.classList.remove('aktif');
        }, 900);
      }
    }, { passive: false });
  }

  /* ======================================================================
     PENGUKURAN PITA OTOMATIS (bukan angka tebakan)
     ----------------------------------------------------------------------
     Tinggi bilah waktu berbeda di tiap perangkat (teks tanggal bisa
     membungkus, safe-area berbeda, ukuran font sistem). Daripada menebak
     nilai tetap — yang berkali-kali menyebabkan tumpang tindih — kita
     UKUR elemennya dan set variabel CSS --band-time.

     PENTING: pengukuran harus terjadi SETELAH layout stabil. Saat
     dipanggil terlalu awal, tinggi yang terbaca masih salah (terbukti:
     gap toolbar vs bilah waktu = -15 px). Karena itu:
       1. ukur ulang setelah frame berikutnya (requestAnimationFrame)
       2. ResizeObserver memantau bilah waktu & toolbar — kalau tingginya
          berubah (teks membungkus, orientasi berubah, font dimuat),
          nilai pita langsung diperbarui.
     ====================================================================== */
  const measureBands = () => {
    const tb = $('timeBar');
    const tools = $('topButtons');
    if (!tb) return;
    const h = Math.ceil(tb.getBoundingClientRect().height);
    if (h > 0) {
      /* +24 px: jarak visual yang lega antara toolbar ikon dan bilah waktu
         (uji 390px: dengan +14 px gap hanya 4 px — terasa menempel) */
      document.documentElement.style.setProperty('--band-time', (h + 24) + 'px');
    }
    if (tools) {
      const th = Math.ceil(tools.getBoundingClientRect().height);
      if (th > 0) document.documentElement.style.setProperty('--band-tools', (th + 10) + 'px');
    }
    /* ======================================================================
       UKUR BAWAH PANEL JUDUL → posisi sidebar
       ----------------------------------------------------------------------
       KELUHAN USER: "ui nya pada bertumpuk".
       Panel judul (top 18 px) tingginya BERUBAH: subjudul bisa membungkus
       dua baris dan badge peristiwa bisa muncul. Dengan sidebar di `top`
       tetap (92 px), keduanya bertumpuk saat panel judul lebih tinggi.
       Solusi: ukur tinggi nyatanya dan tulis --title-bottom; CSS sidebar
       memakai nilai itu sebagai `top` sehingga tumpang tindih mustahil.
       ====================================================================== */
    const tp = $('titlePanel') || document.querySelector('.title-panel');
    if (tp) {
      const r = tp.getBoundingClientRect();
      if (r.height > 0) {
        /* Panel pencarian kini berada DI DALAM panel judul, sehingga tinggi
           panel judul sudah mencakupnya. Cukup pakai r.bottom. */
        document.documentElement.style.setProperty('--title-bottom', Math.ceil(r.bottom + 8) + 'px');
      }
    }
  };
  window.__measureBands = measureBands;
  /* ukur sekarang, lagi setelah frame berikutnya, dan lagi setelah
     font/aset selesai dimuat */
  measureBands();
  requestAnimationFrame(() => { measureBands(); requestAnimationFrame(measureBands); });
  setTimeout(measureBands, 400);
  window.addEventListener('load', () => setTimeout(measureBands, 60));
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => measureBands());
    const tbEl = $('timeBar'), toolsEl = $('topButtons');
    if (tbEl) ro.observe(tbEl);
    if (toolsEl) ro.observe(toolsEl);
  }
  window.addEventListener('resize', () => setTimeout(measureBands, 60));
  window.addEventListener('orientationchange', () => setTimeout(measureBands, 220));

  /* tombol kualitas tekstur */
  $('btnQuality').addEventListener('click', () => {
    const next = app.qualityTier === 'hi' ? 'lo' : 'hi';
    const url = new URL(location.href);
    url.searchParams.set('q', next);
    location.href = url.toString();
  });

  /* =====================================================================
     SEMBUNYIKAN UI — LANGIT BERSIH TANPA PANEL
     ---------------------------------------------------------------------
     PERMINTAAN: maksud "fullscreen" adalah menyembunyikan SEMUA UI supaya
     tidak ada yang menghalangi langit, bukan memaksimalkan jendela
     browser. Tombol ini menambah/menghapus class hide-ui di body; CSS
     menyembunyikan semua panel kecuali satu chip kecil untuk
     mengembalikan. Pintasan: H.
     ===================================================================== */
  const btnHide = $('btnHideUI');
  if (btnHide) {
    const updHide = () => {
      const h = document.body.classList.contains('hide-ui');
      btnHide.classList.toggle('active', h);
      btnHide.title = h ? 'Tampilkan kembali UI (H)' : 'Sembunyikan semua UI agar langit terlihat bersih (H)';
    };
    btnHide.addEventListener('click', () => {
      document.body.classList.toggle('hide-ui');
      setTimeout(measureBands, 60);
      updHide();
    });
    updHide();
  }
  /* chip kecil di luar .ui untuk mengembalikan panel */
  const btnShow = $('btnShowUI');
  if (btnShow) btnShow.addEventListener('click', () => {
    document.body.classList.remove('hide-ui');
    setTimeout(measureBands, 60);
  });
  {
    const lbl = $('btnQuality').querySelector('.bt');
    const txt = 'Kualitas: ' + (app.qualityTier === 'hi' ? 'Tinggi' : 'Ringan');
    if (lbl) lbl.textContent = txt;
    else $('btnQuality').textContent = '◈ ' + txt;
    $('btnQuality').classList.toggle('active', app.qualityTier === 'hi');
  }

  /* ---- pintasan papan tombol ---- */
  window.addEventListener('keydown', (e) => {
    /* Jangan aktifkan pintasan (L/O/H/P/Spasi/angka) saat sedang mengetik
       di kotak teks — lihat guard yang sama di initControls. */
    if (e.target && (
      e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
      e.target.tagName === 'SELECT' || e.target.isContentEditable)) return;
    if (e.code === 'KeyL') toggleLabels();
    else if (e.code === 'KeyO') { $('chkOrbits').checked = !$('chkOrbits').checked; setOrbits($('chkOrbits').checked); }
    else if (e.code === 'KeyH') {
      const b = $('btnHideUI');
      if (b) b.click();
      else $('helpPanel').classList.toggle('show');
    }
    else if (e.code === 'KeyP') togglePause();
    else if (e.code === 'Space') {
      if (cameraState.target) focusBody(null);
      else togglePause();
    } else if (e.code === 'Digit0' || e.code === 'Numpad0') { const b = findBody('sun'); if (b) focusBody(b); }
    else if (e.code === 'KeyM') {
      /* M = tampilkan sistem satelit planet yang sedang difokuskan */
      if (cameraState.target && !cameraState.target.isMoon) viewMoonSystem(cameraState.target);
      else if (currentInfoBody) viewMoonSystem(currentInfoBody);
    }
    else if (e.code === 'KeyT') { toggleDatePanel(); }
    else if (/^Digit[1-8]$/.test(e.code)) {
      const idx = parseInt(e.code.slice(5), 10) - 1;
      const p = PLANETS[idx];
      if (p) { const b = findBody(p.key); if (b) focusBody(b); }
    }
  });

  updateBodyListActive();
}

function moonKeyOf(planetKey, moonName) {
  return planetKey + ':' + moonName;
}


function makeGroupLabel(txt) {
  const d = document.createElement('div');
  d.className = 'grp';
  d.textContent = txt;
  return d;
}

function makeItem(body, num, level) {
  const d = document.createElement('div');
  d.className = 'item' + (level ? ' sub' : '');
  d.dataset.bodyId = body.id;
  const col = new THREE.Color(body.isMoon ? (body.info ? 0x999999 : 0xaaaaaa) : bodyColorOf(body));
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = '#' + col.getHexString();
  dot.style.color = '#' + col.getHexString();
  const nm = document.createElement('span');
  nm.className = 'nm';
  nm.textContent = (num ? num + '. ' : '') + body.name;
  d.appendChild(dot);
  d.appendChild(nm);
  if (level === 0 && body.type === 'planet') {
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = (body.aKm / AU_KM).toFixed(1) + ' SA';
    d.appendChild(meta);
  }
  d.addEventListener('click', () => {
    focusBody(body);
    if (window.matchMedia('(max-width: 980px)').matches) {
      const sb = $('sidebar');
      if (sb) sb.classList.remove('open');
      if (typeof window.__syncBackdrop === 'function') window.__syncBackdrop();
    }
  });
  return d;
}

function bodyColorOf(b) {
  if (b.type === 'star') return 0xffb44d;
  const c = { mercury: 0x9c968c, venus: 0xe8d5a8, earth: 0x3d7fd6, mars: 0xc1603a, jupiter: 0xd8b88a, saturn: 0xe8d8b0, uranus: 0xa8e0e4, neptune: 0x4a7ad8 };
  return c[b.key] || 0xaaaaaa;
}

function updateBodyListActive() {
  const items = document.querySelectorAll('#bodyList .item');
  for (let i = 0; i < items.length; i++) {
    const id = items[i].dataset.bodyId;
    items[i].classList.toggle('active', !!(cameraState.target && cameraState.target.id === id));
  }
}

function setBtn(id, text, active) {
  const b = $(id);
  if (!b) return;
  /* Tombol toolbar punya DUA lapis: .bi (ikon) + .bt (label). Di layar
     kecil .bt disembunyikan (ikon saja). Karena itu jangan menimpa seluruh
     isi tombol — cukup ganti labelnya, kalau tidak ikon ikut terhapus. */
  const lbl = b.querySelector('.bt');
  if (lbl) lbl.textContent = String(text).replace(/^[^A-Za-z0-9]+/, '');
  else b.textContent = text;
  b.classList.toggle('active', !!active);
}

function toggleLabels() { setLabels(!app.labelsOn); }

function setLabels(on) {
  app.labelsOn = on;
  $('chkLabels2').checked = on;
  const b = $('btnLabels');
  b.classList.toggle('active', on);
  if (!on) {
    for (let i = 0; i < labelEls.length; i++) labelEls[i].style.display = 'none';
  }
}

function setOrbits(on) {
  app.orbitsOn = on;
  for (let i = 0; i < bodies.length; i++) {
    const l = bodies[i].orbitLine;
    if (l) l.visible = on;
  }
}

function togglePause() {
  app.paused = !app.paused;
  $('btnPause').textContent = app.paused ? '▶' : '⏸';
  $('btnPause').classList.toggle('active', app.paused);
}

/* =======================================================================
   Panel info
   ======================================================================= */
let currentInfoBody = null;

const TYPE_LABEL = {
  star: 'Bintang — pusat tata surya',
  planet: 'Planet',
  moon: 'Satelit alami',
};

function showInfo(body) {
  currentInfoBody = body;
  $('infoName').textContent = body.name;
  $('infoType').textContent = body.isMoon ? (TYPE_LABEL.moon + ' — ' + body.host.name) : TYPE_LABEL[body.type];
  const exitBtn = $('btnExitFocus');
  // Tombol "✕ Bebas" sudah dihapus dari HTML (menimpa panel pencarian di HP).
  // Guard null supaya tidak crash; lepas fokus tetap lewat Spasi/Esc,
  // ketuk-2x, ketuk-2-jari, atau tombol "🕊 Bebas" di panel info.
  if (exitBtn) exitBtn.classList.toggle('show', !!cameraState.target);
  const t = $('infoTable');
  t.innerHTML = '';

  const rows = [];
  if (body.type === 'planet') {
    rows.push(['Radius nyata', fmt(body.realRadiusKm) + ' km']);
    rows.push(['Jarak dari Matahari', fmt(body.aKm) + ' km (' + (body.aKm / AU_KM).toFixed(2) + ' SA)']);
    rows.push(['Eksentrisitas orbit', body.e.toFixed(4)]);
    rows.push(['Periode orbit', fmtDays(body.periodDays)]);
    rows.push(['Periode rotasi', fmtDays(body.rotationDays)]);
  } else if (body.isMoon) {
    rows.push(['Radius nyata', fmt(body.realRadiusKm) + ' km']);
    rows.push(['Jarak dari ' + body.host.name, fmt(body.aKm) + ' km']);
    rows.push(['Periode orbit', fmtDays(Math.abs(body.periodDays))]);
    rows.push(['Terkunci pasang-surut', body.tidallyLocked ? 'Ya' : 'Tidak']);
  }
  const info = body.info || {};
  for (const k in info) {
    /* hindari baris ganda bila datanya sudah ditampilkan di atas */
    let dup = false;
    for (let i = 0; i < rows.length; i++) if (rows[i][0] === k) dup = true;
    if (!dup) rows.push([k, info[k]]);
  }

  for (let i = 0; i < rows.length; i++) {
    const d = document.createElement('div');
    d.className = 'row';
    const k = document.createElement('span'); k.className = 'k'; k.textContent = rows[i][0];
    const v = document.createElement('span'); v.className = 'v'; v.textContent = rows[i][1];
    d.appendChild(k); d.appendChild(v);
    t.appendChild(d);
  }
  $('infoPanel').classList.add('show');
  updateBodyListActive();
}

function hideInfo() {
  $('infoPanel').classList.remove('show');
  const exitBtn = $('btnExitFocus');
  if (exitBtn) { exitBtn.classList.remove('show'); }
  currentInfoBody = null;
  updateBodyListActive();
}

function fmt(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function fmtDays(d) {
  const a = Math.abs(d);
  const sign = d < 0 ? '(retrograde) ' : '';
  if (a < 1) return sign + (a * 24).toFixed(1) + ' jam';
  if (a < 400) return sign + a.toFixed(2).replace('.', ',') + ' hari';
  return sign + (a / 365.25).toFixed(2).replace('.', ',') + ' tahun';
}

/* =======================================================================
   Label melayang
   ======================================================================= */
const labelEls = [];
const labelBodies = [];

function buildLabels() {
  const layer = $('labelLayer');
  layer.innerHTML = '';
  labelEls.length = 0;
  labelBodies.length = 0;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const d = document.createElement('div');
    d.className = 'flabel' + (b.isMoon ? ' moon' : '');
    d.textContent = b.name;
    d.addEventListener('click', (ev) => { ev.stopPropagation(); focusBody(b); });
    layer.appendChild(d);
    labelEls.push(d);
    labelBodies.push(b);
  }
}

const _proj = new THREE.Vector3();

function updateLabels() {
  if (!app.labelsOn || !app.ready) return;
  const W = window.innerWidth, H = window.innerHeight;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const camPos = camera.position;

  for (let i = 0; i < labelBodies.length; i++) {
    const b = labelBodies[i];
    const el = labelEls[i];
    const wp = bodyScreenPos(b, _tmp);   /* relatif kamera */
    const dist = camPos.distanceTo(wp);

    /* label satelit disembunyikan bila induknya sudah jauh */
    let visible = true;
    if (b.isMoon) {
      const hostPos = bodyScreenPos(b.host, _tmp2);
      const distHost = camPos.distanceTo(hostPos);
      /* batas harus jauh lebih longgar daripada radius induk — lihat
         penjelasan di updateBeacons(): memakai radius induk membuat
         label satelit tidak pernah muncul saat kamera menjauh */
      const batas = Math.max(b.host.radiusKm * 12, 2500);
      if (distHost > batas) visible = false;
    }
    /* label planet disembunyikan bila planet belum cukup besar di layar,
       kecuali benda yang sedang diikuti kamera atau punya penanda aktif.
       MATAHARI DIKECUALIKAN: ia tidak punya beacon (memang sudah terang
       sendiri), jadi tanpa pengecualian ini labelnya hilang saat menjauh —
       padahal glow Matahari sengaja dijaga terlihat (updateSunGlowScale),
       dan labelnya justru paling penting untuk orientasi. */
    if (visible && !b.isMoon && b.type !== 'star') {
      const px = (b.radiusKm / Math.max(dist, 1e-6)) * (H * 0.5) / tanHalf;
      const hasBeacon = !!(b.beacon && b.beacon.group.visible);
      if (px < 2.2 && cameraState.target !== b && !hasBeacon) visible = false;
    }
    /* label satelit ikut penandanya: muncul saat penanda satelit aktif */
    if (visible && b.isMoon) {
      const hasBeacon = !!(b.beacon && b.beacon.group.visible);
      if (!hasBeacon && cameraState.target !== b) visible = false;
    }
    /* label Matahari disembunyikan saat kamera sangat dekat (di dalam corona) */
    if (visible && b.type === 'star' && dist < b.radiusKm * 2.4) visible = false;

    _proj.copy(wp).project(camera);
    if (!isFinite(_proj.x) || !isFinite(_proj.y) || !isFinite(_proj.z)) visible = false;
    else if (_proj.z < -1 || _proj.z > 1 || Math.abs(_proj.x) > 1.25 || Math.abs(_proj.y) > 1.25) visible = false;

    /* sembunyikan label yang berada DI BELAKANG benda besar lain
       (mis. label Jupiter tidak boleh menembus permukaan Bumi) */
    if (visible && !b.isMoon && cameraState.target) {
      const t = cameraState.target;
      if (t !== b && t.radiusKm > 0) {
        const tPos = bodyScreenPos(t, _tmp3);
        const tDist = tPos.length();
        /* vektor dari kamera ke benda ini */
        const d2 = wp.length();
        if (d2 > tDist) {
          /* apakah garis pandang ke benda ini melewati benda target? */
          const dir = wp.clone().normalize();
          const along = tPos.dot(dir);
          if (along > 0) {
            const perp = tPos.clone().sub(dir.multiplyScalar(along)).length();
            if (perp < t.radiusKm * 0.98) visible = false;
          }
        }
      }
    }

    if (!visible) { if (el.style.display !== 'none') el.style.display = 'none'; continue; }
    const x = (_proj.x * 0.5 + 0.5) * W;
    const y = (-_proj.y * 0.5 + 0.5) * H;
    el.style.display = 'block';
    /* geser label agar tidak menutupi benda / penanda yang ditunjuk */
    let offPx = 0;
    if (cameraState.target === b) {
      offPx = (b.radiusKm / Math.max(dist, 1e-6)) * (H * 0.5) / tanHalf + 22;
    } else if (b.beacon && b.beacon.group.visible) {
      offPx = b.isMoon ? 10 : 13;      /* satelit: lebih rapat */
    } else if (b.type === 'star') {
      /* offset label Matahari mengikuti ukuran glow yang sedang tampil,
         supaya label tidak menempel/menutupi cakramnya */
      const glowScale = (sunGlow && sunGlow.children[0]) ? sunGlow.children[0].scale.x : 0;
      const glowPx = (glowScale / Math.max(dist, 1e-6)) * (H * 0.5) / tanHalf;
      offPx = Math.max(14, glowPx * 0.55 + 8);
    }
    el.style.left = x.toFixed(1) + 'px';
    el.style.top = (y + offPx).toFixed(1) + 'px';
    const isTarget = cameraState.target === b;
    el.classList.toggle('small', !isTarget && !b.isMoon);
  }
}

/* =======================================================================
   HUD sudut
   ======================================================================= */
/* ---------- zona waktu tampilan jam ----------
   Simulasi menyimpan waktu sebagai hari sejak J2000 dalam UTC. Jam yang
   ditampilkan bisa dikonversi ke zona waktu mana pun.

   PENTING: nilai ini HANYA mempengaruhi TAMPILAN jam. Rotasi Bumi dan
   posisi Matahari selalu dihitung dari UTC, jadi fisika tidak berubah —
   hanya angka jam yang disesuaikan. */
let tzOffsetMinutes = 420;      /* bawaan: WIB (UTC+7) */

function setTimezone(v) {
  if (v === 'device') {
    tzOffsetMinutes = -new Date().getTimezoneOffset();
  } else {
    tzOffsetMinutes = parseInt(v, 10);
  }
  updateHud();
}

/* nama zona untuk ditampilkan */
function tzLabel() {
  const m = tzOffsetMinutes;
  const sign = m < 0 ? '-' : '+';
  const a = Math.abs(m);
  const h = Math.floor(a / 60), mm = a % 60;
  return 'UTC' + sign + h + (mm ? ':' + String(mm).padStart(2, '0') : '');
}

function updateHud() {
  const hud = $('hudInfo');
  if (!hud || !app.ready) return;

  /* waktu UTC dari simulasi, lalu digeser sesuai zona waktu tampilan */
  const utcMs = J2000 + app.days * 86400000;
  const shifted = new Date(utcMs + tzOffsetMinutes * 60000);

  /* pakai getUTC* supaya tidak terpengaruh zona waktu perangkat */
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const dstr = shifted.getUTCDate() + ' ' + BULAN[shifted.getUTCMonth()] +
               ' ' + shifted.getUTCFullYear();
  const tstr = String(shifted.getUTCHours()).padStart(2, '0') + ':' +
               String(shifted.getUTCMinutes()).padStart(2, '0');
  const lbl = $('dateLabel');
  if (lbl) lbl.textContent = dstr + ' · ' + tstr + ' ' + tzLabel();

  /* Dengan floating origin, camera.position selalu dekat 0.
     Gunakan cameraState.pos yang menyimpan koordinat absolut kamera. */
  const distAU = cameraState.pos.length() / (AU_KM / RAD);
  let follow;
  if (typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.active) {
    const svb = SURFACE_VIEW.currentBody();
    follow = 'POV ' + (svb ? svb.name : 'permukaan') +
             ' — ' + Math.abs(SURFACE_VIEW.lat).toFixed(1) + '°, ' +
             Math.abs(SURFACE_VIEW.lon).toFixed(1) + '°';
  } else {
    follow = cameraState.target ? ('mengikuti ' + cameraState.target.name) : 'terbang bebas';
  }
  const distStr = distAU < 0.01 
    ? (distAU * 149597870.7).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' km'
    : distAU.toFixed(2) + ' SA';
  hud.textContent = follow + ' · ' + distStr + ' dari Matahari · ' + Math.round(app.fps) + ' fps';
}

/* ---------- jalan ---------- */
window.addEventListener('DOMContentLoaded', boot);

/* ---------- label bintang & galaksi ---------- */
/* Menampilkan nama bintang terang yang sedang berada di layar.
   Dibatasi jumlahnya supaya tidak menumpuk. */
let starLabelEls = [];

function buildStarLabels() {
  /* buang label lama */
  for (const el of starLabelEls) el.remove();
  starLabelEls = [];
  if (!starField.showNames) return;

  /* hanya bintang terang (mag < 2.2) dan bernama asli */
  const kandidat = starField.labeled
    .filter(s => s.mag < 2.2 && s.nama)
    .sort((a, b) => a.mag - b.mag)
    .slice(0, 40);

  for (const s of kandidat) {
    const el = document.createElement('div');
    el.className = 'flabel star-label';
    el.textContent = s.nama;
    el.style.display = 'none';
    $('labelLayer').appendChild(el);
    starLabelEls.push(el);
  }

  /* galaksi & nebula: 12 terdekat yang paling terkenal */
  const gal = starField.deepSkySprites.slice(0, 12);
  for (const sp of gal) {
    const el = document.createElement('div');
    el.className = 'flabel galaxy-label';
    el.textContent = sp.userData.nama;
    el.style.display = 'none';
    $('labelLayer').appendChild(el);
    starLabelEls.push(el);
  }
}

const _starTmp = new THREE.Vector3();

function updateStarLabels() {
  if (!starField.showNames || !starLabelEls.length) return;
  const W = window.innerWidth, H = window.innerHeight;
  const kandidat = starField.labeled
    .filter(s => s.mag < 2.2 && s.nama)
    .sort((a, b) => a.mag - b.mag)
    .slice(0, 40);

  let idx = 0;
  for (const s of kandidat) {
    const el = starLabelEls[idx++];
    if (!el) break;
    /* posisi bintang relatif kamera (dunia sudah tergeser floating origin) */
    _starTmp.set(s.x, s.y, s.z).add(starField.group.position);
    const dist = camera.position.distanceTo(_starTmp);
    _starTmp.project(camera);
    if (_starTmp.z < -1 || _starTmp.z > 1 ||
        Math.abs(_starTmp.x) > 1 || Math.abs(_starTmp.y) > 1) {
      el.style.display = 'none';
      continue;
    }
    el.style.display = '';
    el.style.left = Math.round((_starTmp.x * 0.5 + 0.5) * W) + 'px';
    el.style.top = Math.round((-_starTmp.y * 0.5 + 0.5) * H - 10) + 'px';
  }
  for (; idx < starLabelEls.length; idx++) {
    const el = starLabelEls[idx];
    if (!el) continue;
    /* galaksi */
    const gIdx = idx - kandidat.length;
    const sp = starField.deepSkySprites[gIdx];
    if (!sp) { el.style.display = 'none'; continue; }
    _starTmp.copy(sp.position).add(starField.group.position);
    _starTmp.project(camera);
    if (_starTmp.z < -1 || _starTmp.z > 1 ||
        Math.abs(_starTmp.x) > 1 || Math.abs(_starTmp.y) > 1) {
      el.style.display = 'none';
      continue;
    }
    el.style.display = '';
    el.style.left = Math.round((_starTmp.x * 0.5 + 0.5) * W) + 'px';
    el.style.top = Math.round((-_starTmp.y * 0.5 + 0.5) * H - 10) + 'px';
  }
}

/* ---------- keterangan langit ---------- */
function updateSkyInfo() {
  const el = $('skyInfo');
  if (!el) return;
  const jd = J2000_JD + app.days;
  /* fase Bulan + elongasi planet: info cepat di sidebar */
  const fase = moonPhase(jd);
  const lines = [];
  lines.push(`<div class="sky-line"><b>${fase.nama}</b> · ${(fase.iluminasi * 100).toFixed(0)}%</div>`);
  for (const key of ['venus', 'mars', 'jupiter', 'saturn']) {
    const e = planetElongation(key, jd);
    if (!e) continue;
    const nama = { venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturnus' }[key];
    const tag = e.jenis === 'oposisi' ? ' ✦oposisi' : e.jenis === 'konjungsi' ? ' ⊙konjungsi' : '';
    lines.push(`<div class="sky-line">${nama} <span>${e.elongasi.toFixed(0)}°${tag}</span></div>`);
  }
  el.innerHTML = lines.join('');
}

/* kait uji otomatis (tidak mengganggu pengguna) */
window.__SOLAR__ = {
  get ready() { return app.ready; },
  get bodies() { return bodies; },
  get app() { return app; },
  get renderer() { return renderer; },
  get camera() { return camera; },
  focusBody, findBody, findBodyByName, cameraState, tourState,
  startTour, stopTour, viewMoonSystem,
};
