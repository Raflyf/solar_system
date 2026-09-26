/* =======================================================================
   PANEL TANGGAL & PERISTIWA LANGIT
   ----------------------------------------------------------------------
   Memungkinkan pengguna:
   1. Memilih tanggal (masa lalu atau masa depan) — simulasi melompat ke
      posisi nyata benda langit pada tanggal itu (dari ephemeris JPL/Meeus)
   2. Melihat peristiwa langit yang sedang berlangsung saat ini
   3. Mencari gerhana dalam rentang tanggal
   4. Menandai tanggal-tanggal penting yang akan datang

   Semua perhitungan memakai src/15-ephemeris.js
   ======================================================================= */

const datePanelState = {
  open: false,
  events: [],           /* peristiwa yang ditemukan di sekitar tanggal aktif */
  searchResults: [],
  searching: false,
};

/* ---------- format tanggal Indonesia ---------- */
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function formatTanggalLengkap(date) {
  const hari = NAMA_HARI[date.getUTCDay()];
  const d = date.getUTCDate();
  const bl = NAMA_BULAN[date.getUTCMonth()];
  const y = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hari}, ${d} ${bl} ${y} · ${hh}:${mm} UTC`;
}

function formatTanggalPendek(date) {
  const d = date.getUTCDate();
  const bl = NAMA_BULAN[date.getUTCMonth()].slice(0, 3);
  return `${d} ${bl} ${date.getUTCFullYear()}`;
}

/* ---------- daftar peristiwa pada satu waktu ---------- */
/* Menghasilkan peristiwa yang SEDANG berlangsung atau berdekatan dengan
   tanggal yang dipilih. Semua dihitung dari ephemeris nyata. */
function eventsAt(date, windowDays) {
  const jd = dateToJD(date);
  const w = windowDays === undefined ? 3 : windowDays;
  const hasil = [];

  /* 1. fase Bulan */
  const fase = moonPhase(jd);
  hasil.push({
    jenis: 'fase',
    ikon: '🌙',
    judul: fase.nama,
    detail: `Iluminasi ${(fase.iluminasi * 100).toFixed(1)}% · elongasi ${fase.elongasi.toFixed(1)}°`,
    jd,
  });

  /* 2. gerhana yang sedang berlangsung */
  const st = eclipseState(jd);
  if (st.solar) {
    hasil.push({
      jenis: 'gerhana-matahari',
      ikon: '🌑',
      judul: 'GERHANA MATAHARI — ' + st.solar.jenis.toUpperCase(),
      detail: `Magnitudo ${st.solar.magnitudo.toFixed(3)} · gamma ${st.solar.gamma.toFixed(3)}`,
      penting: true, jd,
    });
  }
  if (st.lunar) {
    hasil.push({
      jenis: 'gerhana-bulan',
      ikon: '🔴',
      judul: 'GERHANA BULAN — ' + st.lunar.jenis.toUpperCase(),
      detail: `Magnitudo ${st.lunar.magnitudo.toFixed(3)} · gamma ${st.lunar.gamma.toFixed(3)}`,
      penting: true, jd,
    });
  }

  /* 3. elongasi planet: cari oposisi & konjungsi dalam rentang */
  const planetKeys = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const planetNama = {
    mercury: 'Merkurius', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter',
    saturn: 'Saturnus', uranus: 'Uranus', neptune: 'Neptunus',
  };
  for (const key of planetKeys) {
    const e0 = planetElongation(key, jd - 1);
    const e1 = planetElongation(key, jd);
    if (!e0 || !e1) continue;
    /* deteksi oposisi (elongasi maksimum ~180) */
    const now = planetElongation(key, jd);
    if (now.elongasi > 168) {
      hasil.push({
        jenis: 'oposisi', ikon: '✨',
        judul: `${planetNama[key]} di OPOSISI`,
        detail: `Paling terang & terdekat · elongasi ${now.elongasi.toFixed(1)}°`,
        jd,
      });
    } else if (now.elongasi < 12 && key !== 'mercury' && key !== 'venus') {
      hasil.push({
        jenis: 'konjungsi', ikon: '⊙',
        judul: `${planetNama[key]} di KONJUNGSI`,
        detail: `Berada di balik Matahari · elongasi ${now.elongasi.toFixed(1)}°`,
        jd,
      });
    }
  }

  /* 4. gerhana terdekat dalam ±w hari */
  for (let d = 0.5; d <= w; d += 0.5) {
    for (const sign of [1, -1]) {
      const jdx = jd + sign * d;
      const s = eclipseState(jdx);
      if (s.solar) {
        hasil.push({
          jenis: 'gerhana-matahari-dekat', ikon: '🌒',
          judul: `Gerhana Matahari ${s.solar.jenis} dalam ${d.toFixed(1)} hari`,
          detail: formatTanggalPendek(jdToDate(jdx)), jd: jdx,
        });
        break;
      }
      if (s.lunar) {
        hasil.push({
          jenis: 'gerhana-bulan-dekat', ikon: '🌘',
          judul: `Gerhana Bulan ${s.lunar.jenis} dalam ${d.toFixed(1)} hari`,
          detail: formatTanggalPendek(jdToDate(jdx)), jd: jdx,
        });
        break;
      }
    }
  }

  /* 5. Hujan Meteor Aktif */
  if (typeof METEOR_SHOWERS !== 'undefined') {
    const date = jdToDate(jd);
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const curMD = (m < 10 ? '0' + m : '' + m) + '-' + (d < 10 ? '0' + d : '' + d);

    for (const ms of METEOR_SHOWERS) {
      const start = ms.rentang.mulai;
      const end = ms.rentang.selesai;
      let isActive = false;

      if (start <= end) {
        isActive = (curMD >= start && curMD <= end);
      } else {
        // Melintasi pergantian tahun
        isActive = (curMD >= start || curMD <= end);
      }

      if (isActive) {
        const isPeak = (ms.puncak.bulan === m && Math.abs(ms.puncak.hari - d) <= 1);
        hasil.push({
          jenis: 'meteor',
          ikon: '☄️',
          judul: `Hujan Meteor ${ms.nama} ${isPeak ? '— PUNCAK' : ''}`,
          detail: `ZHR: ~${ms.zhr}/jam · Sumber: ${ms.induk} · Kecepatan: ${ms.v_kms} km/s`,
          penting: isPeak,
          jd,
        });
      }
    }
  }

  /* 6. Konjungsi Planet-Planet (< 2.5° pemisahan sudut) */
  for (let i = 0; i < planetKeys.length; i++) {
    for (let j = i + 1; j < planetKeys.length; j++) {
      const p1 = planetKeys[i];
      const p2 = planetKeys[j];
      const pos1 = bodyPositionKm(p1, jd);
      const pos2 = bodyPositionKm(p2, jd);
      if (!pos1 || !pos2) continue;

      // Posisi geosentris (dari Bumi)
      const e = earthPositionKm(jd);
      const v1 = { x: pos1.x - e.x, y: pos1.y - e.y, z: pos1.z - e.z };
      const v2 = { x: pos2.x - e.x, y: pos2.y - e.y, z: pos2.z - e.z };

      const dot = (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / 
                  (Math.sqrt(v1.x*v1.x + v1.y*v1.y + v1.z*v1.z) * 
                   Math.sqrt(v2.x*v2.x + v2.y*v2.y + v2.z*v2.z));
      const sepDeg = Math.acos(Math.max(-1, Math.min(1, dot))) / DEG;

      if (sepDeg < 2.5) {
        hasil.push({
          jenis: 'konjungsi-planet',
          ikon: '🪐',
          judul: `Konjungsi ${p1.toUpperCase()} - ${p2.toUpperCase()}`,
          detail: `Pemisahan ${sepDeg.toFixed(2)}° — terlihat sangat dekat di langit`,
          jd,
        });
      }
    }
  }

  /* buang duplikat berdasarkan judul */
  const uniq = [];
  const seen = Object.create(null);
  for (const e of hasil) {
    if (seen[e.judul]) continue;
    seen[e.judul] = true;
    uniq.push(e);
  }
  return uniq;
}

/* ---------- pencarian gerhana dalam rentang ---------- */
function searchEclipses(fromDate, toDate) {
  const jd0 = dateToJD(fromDate);
  const jd1 = dateToJD(toDate);
  const hasil = [];

  /* langkah 0.25 hari sudah cukup: gerhana bulan berlangsung berjam-jam,
     dan gerhana matahari selalu terdeteksi karena memakai penumbra */
  for (let jd = jd0; jd <= jd1; jd += 0.25) {
    const st = eclipseState(jd);
    if (st.solar) {
      hasil.push({
        jenis: 'matahari', ikon: '🌑',
        judul: 'Gerhana Matahari ' + st.solar.jenis,
        tanggal: jdToDate(jd),
        magnitudo: st.solar.magnitudo, jd,
      });
    }
    if (st.lunar) {
      hasil.push({
        jenis: 'bulan', ikon: '🔴',
        judul: 'Gerhana Bulan ' + st.lunar.jenis,
        tanggal: jdToDate(jd),
        magnitudo: st.lunar.magnitudo, jd,
      });
    }
  }

  /* gabungkan kejadian berdekatan (satu gerhana terdeteksi di beberapa
     langkah berturut-turut) */
  const gabung = [];
  for (const e of hasil) {
    const last = gabung[gabung.length - 1];
    if (last && last.jenis === e.jenis && (e.jd - last.jd) < 1.2) {
      /* simpan yang magnitudonya terbesar (puncak gerhana) */
      if (Math.abs(e.magnitudo) > Math.abs(last.magnitudo)) {
        last.jd = e.jd; last.magnitudo = e.magnitudo;
        last.tanggal = e.tanggal; last.judul = e.judul;
      }
      continue;
    }
    gabung.push(e);
  }
  return gabung;
}

/* ---------- lompat ke tanggal ---------- */
/* Mengubah app.days supaya simulasi menampilkan posisi nyata pada tanggal itu.
   app.days dihitung dari J2000: days = JD(tanggal) - 2451545.0 */
function jumpToDate(date) {
  const jd = dateToJD(date);
  app.days = jd - J2000_JD;
  computePositions(app.days, performance.now() * 0.001);
  applyPositions();
  updateLabels();
  updateBeacons();
  updateHud();
  datePanelState.events = eventsAt(date, 3);
  renderDatePanel();
}

/* ---------- panel UI ---------- */
function buildDatePanel() {
  const wrap = document.createElement('div');
  wrap.id = 'datePanel';
  wrap.className = 'date-panel hidden';
  wrap.innerHTML = `
    <div class="dp-head">
      <span class="dp-title">📅 Tanggal &amp; Peristiwa Langit</span>
      <button class="dp-close" id="dpClose" title="Tutup">✕</button>
    </div>
    <div class="dp-body">
      <div class="dp-row">
        <label>Tanggal</label>
        <input type="date" id="dpDate" class="dp-input">
      </div>
      <div class="dp-row">
        <label>Jam (UTC)</label>
        <input type="time" id="dpTime" class="dp-input">
      </div>
      <div class="dp-btns">
        <button class="btn small" id="dpGo">↷ Pergi ke Tanggal</button>
        <button class="btn small" id="dpNow">⌂ Sekarang</button>
      </div>
      <div class="dp-quick">
        <button class="dp-chip" data-offset="-365">−1 thn</button>
        <button class="dp-chip" data-offset="-30">−1 bln</button>
        <button class="dp-chip" data-offset="-1">−1 hari</button>
        <button class="dp-chip" data-offset="1">+1 hari</button>
        <button class="dp-chip" data-offset="30">+1 bln</button>
        <button class="dp-chip" data-offset="365">+1 thn</button>
      </div>
      <div class="dp-current" id="dpCurrent">—</div>

      <div class="dp-section">
        <div class="dp-section-title">Peristiwa saat ini</div>
        <div class="dp-events" id="dpEvents"></div>
      </div>

      <div class="dp-section">
        <div class="dp-section-title">Cari gerhana</div>
        <div class="dp-row dp-row-2">
          <input type="date" id="dpFrom" class="dp-input">
          <input type="date" id="dpTo" class="dp-input">
        </div>
        <button class="btn small" id="dpSearch">🔍 Cari Gerhana</button>
        <div class="dp-results" id="dpResults"></div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 16);
  $('dpDate').value = todayStr;
  $('dpTime').value = timeStr;
  $('dpFrom').value = todayStr;
  /* default pencarian: 5 tahun ke depan */
  const future = new Date(now.getTime() + 5 * 365.25 * 86400000);
  $('dpTo').value = future.toISOString().slice(0, 10);

  $('dpClose').addEventListener('click', () => toggleDatePanel(false));
  $('dpGo').addEventListener('click', () => {
    const d = $('dpDate').value;
    const t = $('dpTime').value || '12:00';
    if (!d) return;
    jumpToDate(new Date(d + 'T' + t + ':00Z'));
  });
  $('dpNow').addEventListener('click', () => {
    const n = new Date();
    $('dpDate').value = n.toISOString().slice(0, 10);
    $('dpTime').value = n.toISOString().slice(11, 16);
    jumpToDate(n);
  });
  wrap.querySelectorAll('.dp-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const off = parseInt(btn.dataset.offset, 10);
      const cur = $('dpDate').value
        ? new Date($('dpDate').value + 'T12:00:00Z')
        : new Date();
      cur.setUTCDate(cur.getUTCDate() + off);
      $('dpDate').value = cur.toISOString().slice(0, 10);
      jumpToDate(cur);
    });
  });
  $('dpSearch').addEventListener('click', runEclipseSearch);
}

function toggleDatePanel(open) {
  const p = $('datePanel');
  if (!p) return;
  datePanelState.open = open === undefined ? p.classList.contains('hidden') : open;
  p.classList.toggle('hidden', !datePanelState.open);
  if (datePanelState.open) {
    /* selaraskan dengan waktu simulasi sekarang */
    const cur = jdToDate(J2000_JD + app.days);
    $('dpDate').value = cur.toISOString().slice(0, 10);
    $('dpTime').value = cur.toISOString().slice(11, 16);
    datePanelState.events = eventsAt(cur, 3);
    renderDatePanel();
  }
}

function renderDatePanel() {
  const cur = jdToDate(J2000_JD + app.days);
  $('dpCurrent').textContent = formatTanggalLengkap(cur);

  const box = $('dpEvents');
  if (!box) return;
  if (!datePanelState.events.length) {
    box.innerHTML = '<div class="dp-empty">Tidak ada peristiwa khusus</div>';
    return;
  }
  box.innerHTML = datePanelState.events.map(e => `
    <div class="dp-event${e.penting ? ' penting' : ''}">
      <span class="dp-ev-ikon">${e.ikon}</span>
      <span class="dp-ev-text">
        <b>${e.judul}</b>
        <i>${e.detail || ''}</i>
      </span>
    </div>
  `).join('');
}

function runEclipseSearch() {
  const from = $('dpFrom').value, to = $('dpTo').value;
  if (!from || !to) return;
  const d0 = new Date(from + 'T00:00:00Z');
  const d1 = new Date(to + 'T00:00:00Z');
  if (d1 <= d0) {
    $('dpResults').innerHTML = '<div class="dp-empty">Tanggal akhir harus setelah tanggal awal</div>';
    return;
  }
  /* batasi rentang agar tidak membekukan browser */
  const hariRentang = (d1 - d0) / 86400000;
  if (hariRentang > 366 * 40) {
    $('dpResults').innerHTML = '<div class="dp-empty">Rentang maksimum 40 tahun</div>';
    return;
  }
  $('dpResults').innerHTML = '<div class="dp-empty">Menghitung…</div>';
  /* jalankan setelah UI diperbarui supaya pesan "menghitung" terlihat */
  setTimeout(() => {
    const res = searchEclipses(d0, d1);
    datePanelState.searchResults = res;
    if (!res.length) {
      $('dpResults').innerHTML = '<div class="dp-empty">Tidak ada gerhana di rentang ini</div>';
      return;
    }
    $('dpResults').innerHTML = res.map((e, i) => `
      <div class="dp-result" data-idx="${i}">
        <span class="dp-ev-ikon">${e.ikon}</span>
        <span class="dp-ev-text">
          <b>${e.judul}</b>
          <i>${formatTanggalPendek(e.tanggal)} · mag ${e.magnitudo.toFixed(3)}</i>
        </span>
      </div>
    `).join('');
    $('dpResults').querySelectorAll('.dp-result').forEach(el => {
      el.addEventListener('click', () => {
        const e = res[parseInt(el.dataset.idx, 10)];
        if (!e) return;
        jumpToDate(e.tanggal);
        $('dpDate').value = e.tanggal.toISOString().slice(0, 10);
        $('dpTime').value = e.tanggal.toISOString().slice(11, 16);
      });
    });
  }, 30);
}

/* ---------- indikator peristiwa di HUD ---------- */
/* Menampilkan tanda kecil di HUD bila sedang ada gerhana */
function updateEventBadge() {
  const el = $('eventBadge');
  if (!el) return;
  const jd = J2000_JD + app.days;
  const st = eclipseState(jd);
  if (st.solar) {
    el.textContent = '🌑 Gerhana Matahari ' + st.solar.jenis;
    el.className = 'event-badge aktif';
  } else if (st.lunar) {
    el.textContent = '🔴 Gerhana Bulan ' + st.lunar.jenis;
    el.className = 'event-badge aktif';
  } else {
    const fase = moonPhase(jd);
    el.textContent = '🌙 ' + fase.nama;
    el.className = 'event-badge';
  }
}
