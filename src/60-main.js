/* =======================================================================
   Aplikasi utama: pemuatan, antarmuka, label, dan gelung render
   ======================================================================= */

const app = {
  days: 0,                 /* hari simulasi sejak 2000-01-01 */
  daysPerSecond: 1,
  paused: false,
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

  let last = performance.now();
  let acc = 0, frames = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt; frames++;
    if (acc > 0.5) { app.fps = frames / acc; acc = 0; frames = 0; }

    if (!app.paused) {
      /* waktu dibekukan selama transisi kamera agar lompatan mulus;
         diperlambat otomatis saat kamera sangat dekat permukaan */
      if (!anyTransitionActive()) app.days += dt * app.daysPerSecond * effectiveTimeScale();
    }

    /* --- urutan penting untuk floating origin ---
       1. hitung posisi absolut semua benda
       2. perbarui kamera (menetapkan rebaseOffset untuk frame ini)
       3. geser benda ke posisi render memakai offset yang SAMA
       Dengan urutan ini tidak ada keterlambatan satu frame antara
       benda dan kamera — inilah yang membuat zoom presisi mungkin. */
    computePositions(app.days, now * 0.001);
    updateCamera(dt);
    applyPositions();
    updateOrbitLines(J2000_JD + app.days);
    updateTour(dt);
    updateLabels();
    updateOrbitLineVisibility();
    updateBeacons();
    updateHud();
    updateStarLabels();
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
  $('chkStarNames').addEventListener('change', (e) => {
    setStarNames(e.target.checked);
    buildStarLabels();
  });
  if ($('starCount')) {
    $('starCount').textContent = '(' + (STARS_LABELED.length + STARS_OTHER.length) + ')';
  }
  $('btnHelp').addEventListener('click', () => $('helpPanel').classList.toggle('show'));
  $('btnHelpClose').addEventListener('click', () => $('helpPanel').classList.remove('show'));
  $('btnSidebar').addEventListener('click', () => $('sidebar').classList.toggle('hidden'));
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
  slider.value = '5';                       /* default: 1 hari per detik */
  const upd = () => {
    const i = parseInt(slider.value, 10);
    app.daysPerSecond = TIME_TABLE[i];
    const pct = (i / (TIME_TABLE.length - 1)) * 100;
    slider.style.setProperty('--fill', pct + '%');
    $('speedLabel').textContent = '1 dtk = ' + TIME_LABELS[i];
  };
  slider.addEventListener('input', upd);
  upd();

  /* tombol kualitas tekstur */
  $('btnQuality').addEventListener('click', () => {
    const next = app.qualityTier === 'hi' ? 'lo' : 'hi';
    const url = new URL(location.href);
    url.searchParams.set('q', next);
    location.href = url.toString();
  });
  $('btnQuality').textContent = '◈ Kualitas: ' + (app.qualityTier === 'hi' ? 'Tinggi' : 'Ringan');
  $('btnQuality').classList.toggle('active', app.qualityTier === 'hi');

  /* ---- pintasan papan tombol ---- */
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyL') toggleLabels();
    else if (e.code === 'KeyO') { $('chkOrbits').checked = !$('chkOrbits').checked; setOrbits($('chkOrbits').checked); }
    else if (e.code === 'KeyH') $('helpPanel').classList.toggle('show');
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
  d.addEventListener('click', () => { focusBody(body); });
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
  b.textContent = text;
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
       kecuali benda yang sedang diikuti kamera atau punya penanda aktif */
    if (visible && !b.isMoon) {
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
      offPx = (b.radiusKm / Math.max(dist, 1e-6)) * (H * 0.5) / tanHalf + 14;
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

  const distAU = camera.position.length() / (AU_KM / RAD);
  const follow = cameraState.target ? ('mengikuti ' + cameraState.target.name) : 'terbang bebas';
  hud.textContent = follow + ' · ' + (distAU < 0.01 ? (distAU * 1000).toFixed(1) + ' rb SA' : distAU.toFixed(2) + ' SA') + ' dari Matahari · ' + Math.round(app.fps) + ' fps';
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
