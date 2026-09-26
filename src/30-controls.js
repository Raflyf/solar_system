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
      cameraState.followDist = clampf(cameraState.followDist * k, rU * 1.30 + 0.2, rU * 900);
    } else {
      cameraState.baseSpeed = clampf(cameraState.baseSpeed * k, 2.0, 3000000);
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
  cs.followDist = Math.max(rU * 4.2, rU + 0.6);
  cs.followYaw = 0.7;
  cs.followPitch = 0.30;
  /* hitung posisi tujuan sekarang (benda "dibekukan" selama transisi) */
  const bp = bodyWorldPos(body, new THREE.Vector3());
  const off = dirFromAngles(cs.followYaw, cs.followPitch).multiplyScalar(cs.followDist);
  startTransition(_tmp3.copy(bp).add(off), cs.followYaw, cs.followPitch, 1.6);
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
function updateCamera(dt) {
  const cs = cameraState;

  if (cs.target) {
    const body = cs.target;
    const bp = bodyWorldPos(body, _tmp2);
    const off = dirFromAngles(cs.followYaw, cs.followPitch).multiplyScalar(cs.followDist);
    const desired = _tmp3.copy(bp).add(off);

    if (cs.transition) {
      cs.transition.t += dt;
      const k = clampf(cs.transition.t / cs.transition.dur, 0, 1);
      const s = k * k * (3 - 2 * k);
      cs.pos.lerpVectors(cs.transition.fromPos, desired, s);
      if (k >= 1) cs.transition = null;
    } else {
      cs.pos.lerp(desired, Math.min(1, dt * 5.5));
    }
    camera.position.copy(cs.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(bp);
    cs.yaw = Math.atan2(cs.pos.x - bp.x, cs.pos.z - bp.z);
    cs.pitch = Math.asin(clampf((cs.pos.y - bp.y) / Math.max(cs.pos.distanceTo(bp), 1e-6), -1, 1));
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
    camera.position.copy(cs.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(_tmp2.copy(cs.pos).add(dirFromAngles(cs.yaw, cs.pitch)));
    return;
  }

  const fwd = dirFromAngles(cs.yaw, cs.pitch);
  _right.crossVectors(fwd, _up).normalize();
  const upLocal = _tmp.crossVectors(_right, fwd).normalize().clone();

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

  camera.position.copy(cs.pos);
  camera.up.copy(upLocal);
  camera.lookAt(_tmp2.copy(cs.pos).add(fwd));
}

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

function updateTour(dt) {
  if (!tourState.active) return;
  tourState.timer += dt;
  if (tourState.timer > tourState.dwell) nextTourStop();
}
