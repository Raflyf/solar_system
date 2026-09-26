/* =======================================================================
   Kontrol kamera: terbang bebas, zoom, fokus mengorbit, tur terpandu
   ======================================================================= */

const cameraState = {
  pos: new THREE.Vector3(0, 5200, 13500),
  vel: new THREE.Vector3(),
  yaw: Math.PI,             /* menghadap ke pusat tata surya */
  pitch: -0.34,
  baseSpeed: 3000,
  boosting: false,
  transition: null,         /* { t, dur, fromPos } */
  target: null,             /* body yang diikuti */
  followDist: 0,
  followYaw: 0.7,
  followPitch: 0.32,
};

const keys = {};
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _tmp3 = new THREE.Vector3();
const _look = new THREE.Vector3();
const AXIS_Y = new THREE.Vector3(0, 1, 0);

function clampf(v, a, b) { return v < a ? a : v > b ? b : v; }

function initControls(canvas) {
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') cameraState.boosting = true;
    /* Esc menutup panel / melepas fokus; saat POV Bumi aktif, EARTHVIEW_UI
       yang menangani Esc supaya tidak bentrok. */
    if (e.code === 'Escape' && !(typeof EARTH_VIEW !== 'undefined' && EARTH_VIEW.active)) focusBody(null);
    const handled = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    if (handled.indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') cameraState.boosting = false;
  });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; cameraState.boosting = false; });

  let dragging = false, lastX = 0, lastY = 0, moved = 0;

  canvas.addEventListener('mousedown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; moved = 0;
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    /* POV Bumi: putar pandangan dalam kerangka pengamat (azimut/elevasi),
       bukan kerangka dunia — supaya horizon tetap mendatar. */
    if (typeof EARTH_VIEW !== 'undefined' && EARTH_VIEW.active) {
      EARTH_VIEW.az -= dx * 0.0032;
      /* "pegang langit": seret ke bawah = pandangan naik */
      EARTH_VIEW.el = clampf(EARTH_VIEW.el + dy * 0.0032, -1.40, 1.5533);
    } else if (cameraState.target) {
      cameraState.followYaw -= dx * 0.0040;
      cameraState.followPitch = clampf(cameraState.followPitch + dy * 0.0040, -1.45, 1.45);
    } else {
      cameraState.yaw -= dx * 0.0030;
      cameraState.pitch = clampf(cameraState.pitch - dy * 0.0030, -1.45, 1.45);
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = Math.exp(-e.deltaY * 0.0013);
    /* POV Bumi: roda = zoom lensa (ubah fov), bukan ubah kecepatan */
    if (typeof EARTH_VIEW !== 'undefined' && EARTH_VIEW.active) {
      EARTH_VIEW.fov = clampf(EARTH_VIEW.fov / k, 4, 100);
      return;
    }
    if (cameraState.target) {
      /* zoom manual mematikan auto-fit supaya pengguna punya kendali penuh */
      cameraState.followAutoFit = false;
      const body = cameraState.target;
      const rU = body.radiusKm;
      /* bisa zoom sampai nyaris menyentuh permukaan (mode Google Earth),
         dan menjauh sampai sistem satelitnya ikut terlihat */
      const minD = rU * 1.008;
      let maxD = Math.max(rU * 4000, body.orbitRadiusUnits * 1.5);
      /* pastikan bisa menjangkau orbit satelit terjauh */
      let farthest = 0;
      for (let i = 0; i < bodies.length; i++) {
        const m = bodies[i];
        if (m.isMoon && m.host === body) {
          const d = (m.aKm / RAD) * MOON_ORBIT_FACTOR;
          if (d > farthest) farthest = d;
        }
      }
      if (farthest > 0) maxD = Math.max(maxD, farthest * 3.0);
      cameraState.followDist = clampf(cameraState.followDist * k, minD, maxD);
    } else {
      cameraState.baseSpeed = clampf(cameraState.baseSpeed * k, 0.05, 3000000);
    }
  }, { passive: false });

  /* klik = pilih benda (hanya jika tidak menyeret) */
  canvas.addEventListener('click', (e) => {
    if (moved > 6) return;
    /* di mode POV Bumi, klik tidak memfokuskan benda lain */
    if (typeof EARTH_VIEW !== 'undefined' && EARTH_VIEW.active) return;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickables, false);
    if (hits.length > 0) {
      const id = hits[0].object.userData.bodyId;
      const b = findBody(id);
      if (b) { focusBody(b); return; }
    }
  });

  /* sentuh
     ------------------------------------------------------------------
     BUG YANG DIPERBAIKI DI SINI (keluhan "pinch malah jadi inverse /
     bolak-balik"):
       1. Pinch TIDAK mematikan followAutoFit. Padahal updateCamera()
          otomatis menarik kamera menjauh begitu ada satelit di luar layar
          — jadi cubitan pengguna langsung "dilawan" dan jarak melompat
          bolak-balik. Sekarang pinch mematikan auto-fit (seperti roda
          mouse di desktop).
       2. Setelah cubit, `moved` masih 0 -> touchend menganggapnya KETUKAN
          lalu memfokuskan benda acak. Sekarang gestur multi-jari menandai
          `multiGesture` dan menekan tap.
       3. Saat jari berkurang 2 -> 1, lastX/lastY lama (dari jari pertama)
          membuat lompatan. Sekarang disinkronkan ulang.
     Tambahan: ketuk-2x dan ketuk-2-jari = lepas fokus (pengganti Esc di HP).
     ------------------------------------------------------------------ */
  let touchDist = 0;
  let touchMode = null;        /* null | 'drag' | 'pinch' */
  let multiGesture = false;    /* gestur 2 jari terjadi -> jangan dianggap tap */
  let lastTapT = 0, lastTapX = 0, lastTapY = 0;

  const touchFocusAt = (cx, cy) => {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((cx - rect.left) / rect.width) * 2 - 1,
      -((cy - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickables, false);
    if (hits.length > 0) {
      const b = findBody(hits[0].object.userData.bodyId);
      if (b) { focusBody(b); return true; }
    }
    return false;
  };

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      dragging = true; moved = 0;
      touchMode = 'drag';
      multiGesture = false;
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      /* jari kedua turun: beralih ke mode cubit, hentikan drag 1 jari */
      touchMode = 'pinch';
      multiGesture = true;
      dragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchDist = Math.sqrt(dx * dx + dy * dy) || 1;
      /* pengguna mengambil alih zoom: matikan auto-fit supaya kamera tidak
         menarik balik (penyebab utama gerakan bolak-balik) */
      if (cameraState.target) cameraState.followAutoFit = false;
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && touchMode === 'drag' && dragging) {
      const dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (typeof EARTH_VIEW !== 'undefined' && EARTH_VIEW.active) {
        /* POV Bumi: satu jari = lihat sekeliling (pegang langit) */
        EARTH_VIEW.az -= dx * 0.0035;
        EARTH_VIEW.el = clampf(EARTH_VIEW.el + dy * 0.0035, -1.40, 1.5533);
      } else if (cameraState.target) {
        cameraState.followYaw -= dx * 0.006;
        cameraState.followPitch = clampf(cameraState.followPitch + dy * 0.006, -1.45, 1.45);
      } else {
        cameraState.yaw -= dx * 0.005;
        cameraState.pitch = clampf(cameraState.pitch - dy * 0.005, -1.45, 1.45);
      }
      e.preventDefault();
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (touchMode !== 'pinch') {
        /* dua jari turun tanpa touchstart 2-jari (mis. jari kedua cepat) */
        touchMode = 'pinch';
        multiGesture = true;
        dragging = false;
        touchDist = d;
        if (cameraState.target) cameraState.followAutoFit = false;
      }
      if (touchDist > 0) {
        const k = touchDist / d;
        if (typeof EARTH_VIEW !== 'undefined' && EARTH_VIEW.active) {
          /* POV Bumi: cubit melebar = zoom lensa masuk */
          EARTH_VIEW.fov = clampf(EARTH_VIEW.fov * k, 4, 100);
        } else if (cameraState.target) {
          /* mode ikuti: cubit = zoom jarak ke benda */
          const body = cameraState.target;
          const minD = body.radiusKm * 1.008;
          let maxD = Math.max(body.radiusKm * 4000, body.orbitRadiusUnits * 1.5);
          let farthest = 0;
          for (let i = 0; i < bodies.length; i++) {
            const m = bodies[i];
            if (m.isMoon && m.host === body) {
              const dd = (m.aKm / RAD) * MOON_ORBIT_FACTOR;
              if (dd > farthest) farthest = dd;
            }
          }
          if (farthest > 0) maxD = Math.max(maxD, farthest * 3.0);
          cameraState.followDist = clampf(cameraState.followDist * k, minD, maxD);
        } else {
          /* mode bebas: cubit = gerak maju/mundur (dolly) — inilah yang
             diharapkan pengguna HP. (Sebelumnya mengubah baseSpeed yang
             tidak terlihat efeknya di layar, jadi terasa "tidak berfungsi".) */
          const deltaPx = (d - touchDist);
          const step = deltaPx * Math.max(autoSpeedFor(cameraState.pos), 0.05) * 0.05;
          const fwd = dirFromAngles(cameraState.yaw, cameraState.pitch);
          cameraState.pos.addScaledVector(fwd, step);
          cameraState.vel.set(0, 0, 0);
        }
      }
      touchDist = d;
      e.preventDefault();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    /* jari berkurang 2 -> 1: sinkronkan ulang titik acuan supaya tidak
       melompat; lanjutkan sebagai drag 1 jari */
    if (e.touches.length === 1) {
      touchMode = 'drag';
      dragging = true;
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      moved += 100;              /* pasti bukan tap */
      touchDist = 0;
      return;
    }
    if (e.touches.length === 0) {
      const wasMulti = multiGesture;
      const wasTap = (moved < 8) && !wasMulti && e.changedTouches.length === 1;
      if (wasTap) {
        const t = e.changedTouches[0];
        const now = performance.now();
        const isDouble = (now - lastTapT < 320) &&
                         Math.abs(t.clientX - lastTapX) < 40 &&
                         Math.abs(t.clientY - lastTapY) < 40;
        if (isDouble) {
          /* ketuk 2x = lepas fokus (pengganti Esc) */
          if (cameraState.target) focusBody(null);
          lastTapT = 0;
        } else {
          lastTapT = now; lastTapX = t.clientX; lastTapY = t.clientY;
          /* ketuk 1x: fokuskan benda yang tersentuh (jika ada) */
          if (!touchFocusAt(t.clientX, t.clientY)) {
            /* ketukan di langit kosong: jangan apa-apa (biar tidak salah) */
          }
        }
      } else if (wasMulti && touchDist === 0) {
        /* ketuk 2 jari tanpa gerak = lepas fokus */
        if (cameraState.target) focusBody(null);
      }
      dragging = false;
      touchMode = null;
      multiGesture = false;
      touchDist = 0;
    }
  }, { passive: true });

  canvas.addEventListener('touchcancel', () => {
    dragging = false;
    touchMode = null;
    multiGesture = false;
    touchDist = 0;
  }, { passive: true });
}

/* ---------- fokus / lepas fokus ---------- */
function startTransition(targetPos, targetYaw, targetPitch, dur) {
  const cs = cameraState;
  cs.transition = {
    t: 0, dur: dur || 1.6,
    fromPos: cs.pos.clone(),
    fromYaw: cs.yaw, fromPitch: cs.pitch,
    toPos: targetPos.clone(),
    toYaw: targetYaw, toPitch: targetPitch,
  };
}

/* selama transisi kamera, waktu dibekukan (tanpa gerak / tabrakan) */
function anyTransitionActive() {
  return !!(cameraState.transition || tourState.transition);
}

function focusBody(body) {
  const cs = cameraState;
  /* Memilih benda lain saat POV Bumi aktif = keluar dari POV dulu */
  if (typeof EARTH_VIEW !== 'undefined' && EARTH_VIEW.active &&
      typeof EARTHVIEW_UI !== 'undefined') {
    EARTHVIEW_UI.exitPOV();
  }
  if (!body) {
    cs.target = null;
    cs.followAutoFit = false;
    if (cs.vel.length() < 1) {
      cs.vel.copy(dirFromAngles(cs.yaw, cs.pitch)).multiplyScalar(cs.baseSpeed * 0.4);
    }
    hideInfo();
    return;
  }
  cs.target = body;
  const rU = body.radiusKm;
  /* Jarak awal saat fokus.
     Untuk planet yang punya satelit, jarak harus cukup memuat orbit
     terjauhnya — kalau tidak, satelitnya berada di luar layar dan
     seolah-olah "tidak ada" (Io saja sudah 5,9× radius Jupiter).
     Pengguna tetap bisa zoom masuk sampai permukaan setelahnya. */
  let initial = rU * 3.2;
  if (!body.isMoon) {
    let farthest = 0;
    for (let i = 0; i < bodies.length; i++) {
      const m = bodies[i];
      if (m.isMoon && m.host === body) {
        const d = (m.aKm / RAD) * MOON_ORBIT_FACTOR;
        if (d > farthest) farthest = d;
      }
    }
    if (farthest > 0) initial = Math.max(initial, farthest * 1.45);
  }
  cs.followDist = initial;
  cs.followYaw = 0.7;
  cs.followPitch = 0.28;
  /* auto-fit aktif bila planet ini punya satelit, supaya satelitnya tidak
     keluar layar saat terus bergerak; mati bila tidak ada satelit */
  cs.followAutoFit = !body.isMoon && hasMoons(body);
  const bp = bodyWorldPos(body, new THREE.Vector3());
  const off = dirFromAngles(cs.followYaw, cs.followPitch).multiplyScalar(cs.followDist);
  startTransition(_tmp3.copy(bp).add(off), cs.followYaw, cs.followPitch, 1.6);
  showInfo(body);
}

/* apakah benda ini punya satelit? */
function hasMoons(body) {
  for (let i = 0; i < bodies.length; i++) {
    const m = bodies[i];
    if (m.isMoon && m.host === body) return true;
  }
  return false;
}
/* perbesar kecepatan terbang otomatis sesuai jarak dari Matahari supaya
   penerbangan tetap nyaman baik di dekat Bumi maupun di luar Neptunus */
function autoSpeedFor(pos) {
  const r = pos.length();
  if (r < 200) return 0.6;          /* dekat permukaan planet */
  if (r < 2000) return 6;
  if (r < 20000) return 120;
  if (r < 200000) return 1500;
  return 12000;                     /* antarplanet */
}

/* Tampilkan SELURUH sistem satelit sebuah planet: kamera ditarik ke jarak
   yang memuat orbit terjauh, jadi semua satelit terlihat sekaligus.
   Ini menjawab masalah "satelit tidak muncul" — pada skala 1:1 orbit
   satelit jauh lebih besar daripada planetnya (Io saja 5,9× radius Jupiter),
   jadi pada zoom dekat satelit memang berada di luar layar. */
function viewMoonSystem(body) {
  if (!body || body.isMoon) return;
  const cs = cameraState;
  cs.target = body;

  /* Hitung jarak terjauh yang perlu terlihat dengan MENGHITUNG POSISI
     SEBENARNYA tiap satelit, bukan memakai rumus perkiraan.
     Alasan: kemiringan poros planet ikut memiringkan bidang orbit satelit
     (Uranus 97,8° — orbit satelitnya nyaris tegak lurus ekliptika), jadi
     perkiraan sederhana menghasilkan jarak yang salah. */
  let farthest = 0;
  for (let i = 0; i < bodies.length; i++) {
    const m = bodies[i];
    if (!m.isMoon || m.host !== body) continue;
    const a = (m.aKm / RAD) * MOON_ORBIT_FACTOR;
    /* ambil beberapa titik pada orbit, terapkan kemiringan bidang induk,
       lalu ukur jarak terbesar dari planet */
    const tilt = THREE.MathUtils.degToRad(body.axialTiltDeg || 0);
    for (let k = 0; k < 24; k++) {
      const th = (k / 24) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(th) * a, 0, Math.sin(th) * a);
      v.applyAxisAngle(new THREE.Vector3(1, 0, 0), m.incl);   /* inklinasi orbit */
      if (tilt) v.applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);  /* poros induk */
      const d = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
      if (d > farthest) farthest = d;
    }
  }

  /* Batas 90× radius planet: cukup untuk Iapetus sekaligus planetnya masih
     terlihat sebagai bola kecil, bukan titik.
     Margin 1.9 (bukan 1.75) memberi ruang untuk orbit yang tegak —
     Uranus berporos 97,8° sehingga satelitnya naik-turun jauh dari
     bidang pandang, dan tanpa margin lebih mereka terpotong di tepi layar. */
  const minUseful = Math.max(body.radiusKm * 6, body.radiusKm + 0.5);
  const maxUseful = body.radiusKm * 90;
  cs.followDist = farthest > 0
    ? clampf(farthest * 1.9, minUseful, maxUseful)
    : Math.max(body.radiusKm * 4.5, body.radiusKm + 0.5);
  cs.followYaw = 0.55;
  cs.followPitch = 0.42;            /* agak dari atas agar orbit terlihat bidang */
  cs.followAutoFit = true;          /* kamera menjaga satelit tetap di layar */

  const bp = bodyWorldPos(body, new THREE.Vector3());
  const off = dirFromAngles(cs.followYaw, cs.followPitch).multiplyScalar(cs.followDist);
  startTransition(_tmp3.copy(bp).add(off), cs.followYaw, cs.followPitch, 1.8);
  showInfo(body);
}

function dirFromAngles(yaw, pitch) {
  return new THREE.Vector3(
    Math.cos(pitch) * Math.sin(yaw),
    Math.sin(pitch),
    Math.cos(pitch) * Math.cos(yaw)
  );
}

/* ---------- update kamera ---------- */
/* Kamera SELALU berada di titik asal (floating origin). Yang bergerak
   adalah rebaseOffset, yaitu seberapa jauh tata surya digeser. Semua
   posisi kamera yang dipakai untuk perhitungan disimpan di cameraState.pos
   dalam koordinat ABSOLUT, lalu dikonversi ke relatif saat dipakai. */
function updateCamera(dt) {
  const cs = cameraState;

  /* =====================================================================
     POV BUMI — kamera berdiri di permukaan Bumi
     ---------------------------------------------------------------------
     BUG YANG DIPERBAIKI: sebelumnya EARTH_VIEW.enable() hanya menyalakan
     bendera, tetapi TIDAK ADA satu baris pun di updateCamera() yang
     membacanya — jadi menekan "Terapkan & Masuk POV" tidak menggerakkan
     apa pun (keluhan: "pov bumi tidak berfungsi").

     Sekarang: posisi kamera = titik pengamat nyata di permukaan (dihitung
     dari lat/lon + GMST, sama seperti mesh Bumi), dan orientasi memakai
     utara Bumi sebagai camera.up supaya langit tidak miring.
     ===================================================================== */
  if (typeof EARTH_VIEW !== 'undefined' && EARTH_VIEW.active) {
    const earth = findBody('earth');
    const obs = EARTH_VIEW.computeObserver(app.days, earth);
    if (obs) {
      cs.target = null;
      cs.transition = null;
      cs.pos.copy(obs.pos);
      cs.vel.set(0, 0, 0);

      /* Selubung atmosfer Bumi memakai BackSide — dilihat dari dalam
         (kamera di permukaan) ia akan menutupi SELURUH langit. Matikan
         selama POV; dinyalakan kembali saat keluar. */
      if (earth && earth.atmoMesh) earth.atmoMesh.visible = false;

      rebaseOffset.copy(cs.pos);
      camera.position.set(0, 0, 0);

      /* arah pandang dari azimut/elevasi dalam kerangka pengamat ENU */
      const fwd = EARTH_VIEW.viewDir(obs, _tmp);
      camera.up.copy(obs.zenith);
      camera.lookAt(fwd);

    /* Pesawat dekat (near plane) harus sangat kecil di POV: kamera berdiri
       50 m di atas permukaan, sedangkan near bawaan 0,0005 unit = 3,2 km —
       permukaan dalam radius itu akan terpotong dan tampak "bolong".
       Dengan logarithmicDepthBuffer, rasio near/far 1e-6 : 2e6 tetap presisi. */
      const nearPov = 0.000002;
      if (camera.near !== nearPov) { camera.near = nearPov; camera.updateProjectionMatrix(); }

      /* zoom lensa khusus POV (roda mouse / pinch mengubah EARTH_VIEW.fov) */
      if (Math.abs(camera.fov - EARTH_VIEW.fov) > 0.01) {
        camera.fov = EARTH_VIEW.fov;
        camera.updateProjectionMatrix();
      }
      return;
    }
  }

  if (cs.target) {
    const body = cs.target;
    const bp = bodyWorldPos(body, _tmp2);

    /* Jaga agar satelit tetap dalam pandangan.
       Satelit bergerak mengelilingi induknya, jadi jarak yang pas saat
       kamera berhenti bisa jadi tidak pas beberapa detik kemudian.
       Karena itu jarak minimum disesuaikan terus-menerus: kalau ada satelit
       yang berada di luar 92% tepi layar, kamera menjauh sedikit. */
    if (cs.followAutoFit && !body.isMoon && cs.followDist > body.radiusKm * 1.2) {
      let need = 0;
      const tanHalfF = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
      const aspectF = window.innerWidth / Math.max(1, window.innerHeight);
      for (let i = 0; i < bodies.length; i++) {
        const m = bodies[i];
        if (!m.isMoon || m.host !== body) continue;
        const mp = bodyWorldPos(m, _tmp3);
        const rel = mp.sub(bp);
        const distAlong = rel.length();
        /* sudut maksimum yang dibutuhkan agar satelit ini masuk layar */
        const needV = distAlong / (tanHalfF * 0.92);
        const needH = distAlong / (tanHalfF * aspectF * 0.92);
        const n = Math.max(needV, needH);
        if (n > need) need = n;
      }
      if (need > cs.followDist) {
        /* mundur perlahan, jangan melompat */
        cs.followDist += (need - cs.followDist) * Math.min(1, dt * 1.2);
      }
    }

    const off = dirFromAngles(cs.followYaw, cs.followPitch).multiplyScalar(cs.followDist);
    const desiredAbs = _tmp3.copy(bp).add(off);

    if (cs.transition) {
      cs.transition.t += dt;
      const k = clampf(cs.transition.t / cs.transition.dur, 0, 1);
      const s = k * k * (3 - 2 * k);
      cs.pos.lerpVectors(cs.transition.fromPos, desiredAbs, s);
      if (k >= 1) cs.transition = null;
    } else {
      /* kamera menempel persis: benda bergerak cepat (Bumi ~400 unit/detik),
         kalau hanya di-lerp kamera akan selalu tertinggal */
      cs.pos.copy(desiredAbs);
    }

    /* floating origin: kamera selalu di (0,0,0), dunia yang bergeser */
    rebaseOffset.copy(cs.pos);
    camera.position.set(0, 0, 0);

    /* Benda berada di posisi relatif `-off` dari kamera. Arahkan pandangan
       TEPAT ke titik itu supaya benda selalu di tengah layar. */
    _look.copy(off).negate();
    camera.up.set(0, 1, 0);
    camera.lookAt(_look);

    cs.yaw = Math.atan2(off.x, off.z);
    cs.pitch = -Math.asin(clampf(off.y / Math.max(off.length(), 1e-6), -1, 1));
    return;
  }

  /* ---- terbang bebas ---- */
  if (cs.transition) {
    cs.transition.t += dt;
    const k = clampf(cs.transition.t / cs.transition.dur, 0, 1);
    const s = k * k * (3 - 2 * k);
    cs.pos.lerpVectors(cs.transition.fromPos, cs.transition.toPos, s);
    if (k >= 1) {
      cs.yaw = cs.transition.toYaw;
      cs.pitch = cs.transition.toPitch;
      cs.transition = null;
    }
  } else {
    const fwd = dirFromAngles(cs.yaw, cs.pitch);
    _right.crossVectors(fwd, _up).normalize();
    const upLocal = _tmp.crossVectors(_right, fwd).normalize().clone();

    /* kecepatan menyesuaikan jarak: lambat saat menjelajah permukaan,
       cepat saat menyeberangi tata surya */
    const auto = autoSpeedFor(cs.pos);
    if (cs.baseSpeed < auto * 0.5 || cs.baseSpeed > auto * 2) {
      cs.baseSpeed += (auto - cs.baseSpeed) * Math.min(1, dt * 0.7);
    }
    const speed = cs.baseSpeed * (cs.boosting ? 6 : 1);
    let ax = 0, ay = 0, az = 0;
    if (keys['KeyW'] || keys['ArrowUp']) az += 1;
    if (keys['KeyS'] || keys['ArrowDown']) az -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) ax += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) ax -= 1;
    if (keys['KeyE']) ay += 1;
    if (keys['KeyQ']) ay -= 1;

    const accel = new THREE.Vector3();
    accel.addScaledVector(fwd, az);
    accel.addScaledVector(_right, ax);
    accel.addScaledVector(upLocal, ay);
    if (accel.lengthSq() > 0) accel.normalize().multiplyScalar(speed * 8.0);

    cs.vel.addScaledVector(accel, dt);
    
    // Perbaikan licin: tambahkan friksi/damping lebih kuat
    // Jika tidak ada input arah gerak (accel = 0), rem lebih keras
    const damping = accel.lengthSq() > 0 ? 5.0 : 12.0;
    cs.vel.multiplyScalar(Math.exp(-dt * damping));
    
    const vmax = speed * 10;
    if (cs.vel.length() > vmax) cs.vel.setLength(vmax);
    cs.pos.addScaledVector(cs.vel, dt);
  }

  /* floating origin */
  rebaseOffset.copy(cs.pos);
  camera.position.set(0, 0, 0);
  const fwd2 = dirFromAngles(cs.yaw, cs.pitch);
  camera.up.set(0, 1, 0);
  camera.lookAt(fwd2);
}

const ZERO3 = new THREE.Vector3(0, 0, 0);

/* ---------- tur terpandu ---------- */
const tourState = { active: false, index: -1, timer: 0, dwell: 10.0 };

function startTour() {
  tourState.active = true;
  tourState.index = -1;
  tourState.timer = 0;
  nextTourStop();
}

function stopTour() {
  tourState.active = false;
}

function nextTourStop() {
  tourState.index = (tourState.index + 1) % TOUR.length;
  tourState.timer = 0;
  const key = TOUR[tourState.index];
  if (key === 'system') {
    focusBody(null);
    startTransition(new THREE.Vector3(0, 5200, 13500), Math.PI, -0.34, 2.6);
    cameraState.baseSpeed = 3000;
    return;
  }
  if (key === 'belt') {
    focusBody(null);
    const au = (BELT.minAU + BELT.maxAU) / 2;
    const r = (au * AU_KM) / RAD;
    startTransition(new THREE.Vector3(r * 1.35, r * 0.22, r * 0.55), Math.PI * 1.25, -0.12, 2.6);
    cameraState.baseSpeed = 900;
    return;
  }
  const b = findBody(key);
  if (b) {
    focusBody(b);
    if (b.type === 'star') {
      cameraState.followDist = b.radiusKm * 5.5;
      cameraState.followPitch = 0.18;
      const bp = bodyWorldPos(b, new THREE.Vector3());
      const off = dirFromAngles(cameraState.followYaw, cameraState.followPitch).multiplyScalar(cameraState.followDist);
      startTransition(bp.add(off), cameraState.followYaw, cameraState.followPitch, 1.6);
    }
  }
}

/* saat kamera sangat dekat permukaan, waktu diperlambat otomatis agar
   permukaan tidak berputar terlalu cepat untuk diamati */
function effectiveTimeScale() {
  const cs = cameraState;
  if (!cs.target) return 1;
  const b = cs.target;
  const alt = cs.followDist - b.radiusKm;
  if (alt < b.radiusKm * 0.35) return 0.004;
  if (alt < b.radiusKm * 1.5) return 0.05;
  return 1;
}

function updateTour(dt) {
  if (!tourState.active) return;
  tourState.timer += dt;
  if (tourState.timer > tourState.dwell) nextTourStop();
}
