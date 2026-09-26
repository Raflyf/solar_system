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
    if (e.code === 'Escape') focusBody(null);
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
    if (cameraState.target) {
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
    if (cameraState.target) {
      const body = cameraState.target;
      const rU = body.radiusKm;
      /* bisa zoom sampai nyaris menyentuh permukaan (mode Google Earth),
         dan menjauh sampai seluruh orbit terlihat */
      const minD = rU * 1.008;
      const maxD = Math.max(rU * 4000, body.orbitRadiusUnits * 1.5);
      cameraState.followDist = clampf(cameraState.followDist * k, minD, maxD);
    } else {
      cameraState.baseSpeed = clampf(cameraState.baseSpeed * k, 0.05, 3000000);
    }
  }, { passive: false });

  /* klik = pilih benda (hanya jika tidak menyeret) */
  canvas.addEventListener('click', (e) => {
    if (moved > 6) return;
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

  /* sentuh */
  let touchDist = 0;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      dragging = true; moved = 0;
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && dragging) {
      const dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (cameraState.target) {
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
      if (touchDist > 0) {
        const k = touchDist / d;
        if (cameraState.target) {
          cameraState.followDist = clampf(cameraState.followDist * k, 0.5, 1e7);
        } else {
          cameraState.baseSpeed = clampf(cameraState.baseSpeed / k, 2.0, 3000000);
        }
      }
      touchDist = d;
      e.preventDefault();
    }
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      if (moved < 8 && e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((t.clientX - rect.left) / rect.width) * 2 - 1,
          -((t.clientY - rect.top) / rect.height) * 2 + 1
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, camera);
        const hits = ray.intersectObjects(pickables, false);
        if (hits.length > 0) {
          const b = findBody(hits[0].object.userData.bodyId);
          if (b) focusBody(b);
        }
      }
      dragging = false;
    }
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
  if (!body) {
    cs.target = null;
    if (cs.vel.length() < 1) {
      cs.vel.copy(dirFromAngles(cs.yaw, cs.pitch)).multiplyScalar(cs.baseSpeed * 0.4);
    }
    hideInfo();
    return;
  }
  cs.target = body;
  const rU = body.radiusKm;
  /* mulai dari jarak yang enak dilihat, lalu pengguna bisa zoom masuk
     sampai permukaan atau keluar sampai orbit penuh */
  cs.followDist = Math.max(rU * 3.2, rU * 1.35);
  cs.followYaw = 0.7;
  cs.followPitch = 0.28;
  const bp = bodyWorldPos(body, new THREE.Vector3());
  const off = dirFromAngles(cs.followYaw, cs.followPitch).multiplyScalar(cs.followDist);
  startTransition(_tmp3.copy(bp).add(off), cs.followYaw, cs.followPitch, 1.6);
  showInfo(body);
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

  if (cs.target) {
    const body = cs.target;
    /* posisi absolut benda (bukan world, karena world sudah tergeser) */
    const bp = _tmp2.copy(body.type === 'star' ? ZERO3 : (body.absPos || ZERO3));
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
    if (accel.lengthSq() > 0) accel.normalize().multiplyScalar(speed * 5.0);

    cs.vel.addScaledVector(accel, dt);
    cs.vel.multiplyScalar(Math.exp(-dt * 3.0));
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
