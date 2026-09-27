/* =======================================================================
   UI POV BUMI
   ----------------------------------------------------------------------
   Menghubungkan kontrol HTML dengan logika POV Bumi (17-earthview.js).

   Catatan penting tentang tombol keluar:
     • Tombol keyboard "E" TIDAK dipakai untuk keluar, karena E adalah
       tombol "naik" saat terbang bebas (lihat help panel). Dulu ada
       pendengar yang membajak tombol E dan membuat terbang bebas aneh.
     • Keluar dari POV lewat: tombol ✕ di panel pengamat, tombol
       "Keluar POV" di modal, atau Escape.
   ======================================================================= */

const EARTHVIEW_UI = {
  init() {
    this.modal = document.getElementById('earthviewModal');
    if (!this.modal) return;

    this.bodySelect = document.getElementById('evmBody');
    this.citySelect = document.getElementById('evmCity');
    this.latInput = document.getElementById('evmLat');
    this.lonInput = document.getElementById('evmLon');
    this.elevInput = document.getElementById('evmElev');
    this.atmoChk = document.getElementById('evmAtmo');
    this.btnApply = document.getElementById('evmApply');
    this.btnExit = document.getElementById('evmExit');
    this.obsPanel = document.getElementById('observerPanel');
    this.obsText = document.getElementById('observerText');
    this.hint = this.modal.querySelector('.evm-hint');

    /* ---- isi dropdown BENDA LANGIT (semua planet + satelit + Matahari) ---- */
    this.refillBodySelect();

    /* ---- isi dropdown LOKASI (preset per benda) ---- */
    this.refreshPresets();

    /* Event listeners */
    document.getElementById('btnEarthView').addEventListener('click', () => this.toggleModal());
    document.getElementById('evmClose').addEventListener('click', () => this.hide());
    const btnObsExit = document.getElementById('btnObsExit');
    if (btnObsExit) btnObsExit.addEventListener('click', () => this.exitPOV());

    /* Ganti benda langit → ganti daftar preset-nya */
    if (this.bodySelect) {
      this.bodySelect.addEventListener('change', () => {
        this.refreshPresets();
      });
    }

    if (this.citySelect) {
      this.citySelect.addEventListener('change', () => this.updateInputsFromCity());
    }
    if (this.latInput) this.latInput.addEventListener('input', () => { if (this.citySelect) this.citySelect.value = ''; });
    if (this.lonInput) this.lonInput.addEventListener('input', () => { if (this.citySelect) this.citySelect.value = ''; });

    /* Saklar atmosfer: bisa diubah kapan saja, bahkan saat POV aktif */
    if (this.atmoChk) {
      this.atmoChk.addEventListener('change', () => {
        if (typeof SURFACE_VIEW !== 'undefined') {
          SURFACE_VIEW.atmosphereOn = this.atmoChk.checked;
        }
      });
    }

    this.btnApply.addEventListener('click', () => this.applyAndEnter());
    this.btnExit.addEventListener('click', () => this.exitPOV());

    /* Escape = keluar POV (hanya saat POV aktif). Tidak memakai tombol E
       supaya tidak bentrok dengan kontrol terbang bebas. */
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.active) {
        this.exitPOV();
      }
    });

    this.syncButtons();
  },

  /* Isi dropdown benda langit. Dipanggil ulang oleh buildUI() setelah
     seluruh body selesai dibangun (saat init() pertama, `bodies` masih
     kosong sehingga dropdown tidak terisi). */
  refillBodySelect() {
    if (!this.bodySelect || typeof SURFACE_VIEW === 'undefined') return;
    const list = SURFACE_VIEW.availableBodies();
    if (!list.length) return;   /* scene belum siap — jangan kosongkan */

    const groups = [
      { label: 'Matahari', items: list.filter(b => b.type === 'star') },
      { label: 'Planet', items: list.filter(b => b.type === 'planet') },
      { label: 'Satelit', items: list.filter(b => b.type === 'moon') },
    ];
    const prev = this.bodySelect.value;
    this.bodySelect.innerHTML = '';
    for (const g of groups) {
      if (!g.items.length) continue;
      const og = document.createElement('optgroup');
      og.label = g.label;
      for (const b of g.items) {
        const opt = document.createElement('option');
        opt.value = b.key;
        opt.textContent = b.type === 'moon' ? b.name + ' (' + b.hostName + ')' : b.name;
        og.appendChild(opt);
      }
      this.bodySelect.appendChild(og);
    }
    /* pertahankan pilihan sebelumnya bila masih ada */
    this.bodySelect.value = (prev && [...this.bodySelect.options].some(o => o.value === prev))
      ? prev : 'earth';
    this.refreshPresets();
  },

  /* Perbarui daftar lokasi sesuai benda langit yang dipilih. */
  refreshPresets() {
    if (!this.citySelect || typeof SURFACE_VIEW === 'undefined') return;
    const key = this.bodySelect ? this.bodySelect.value : 'earth';
    /* cari body untuk mendapat preset-nya */
    let presets = [];
    if (typeof findBody === 'function') {
      const b = findBody(key) ||
        (typeof findBodyByName === 'function' ? findBodyByName(key) : null);
      if (b) presets = SURFACE_VIEW.presets[SURFACE_VIEW.presetKey(b)] || [];
    }
    this.citySelect.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = presets.length ? '— pilih lokasi menarik —' : '— koordinat manual —';
    this.citySelect.appendChild(opt0);
    for (const p of presets) {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      this.citySelect.appendChild(opt);
    }
    /* isi otomatis dengan preset pertama */
    if (presets.length) {
      this.citySelect.value = presets[0].name;
      this.updateInputsFromCity();
    }
  },

  updateInputsFromCity() {
    const name = this.citySelect ? this.citySelect.value : '';
    if (!name || typeof SURFACE_VIEW === 'undefined') return;
    const key = this.bodySelect ? this.bodySelect.value : 'earth';
    let b = null;
    if (typeof findBody === 'function') {
      b = findBody(key) || (typeof findBodyByName === 'function' ? findBodyByName(key) : null);
    }
    if (!b) return;
    const list = SURFACE_VIEW.presets[SURFACE_VIEW.presetKey(b)] || [];
    for (const p of list) {
      if (p.name === name) {
        this.latInput.value = p.lat;
        this.lonInput.value = p.lon;
        this.elevInput.value = 50;
        return;
      }
    }
  },

  /* Sinkronkan tampilan tombol & panel pengamat dengan status POV. */
  syncButtons() {
    const active = typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.active;
    if (this.btnExit) this.btnExit.style.display = active ? 'inline-block' : 'none';
    if (this.obsPanel) this.obsPanel.classList.toggle('show', active);
    const btn = document.getElementById('btnEarthView');
    if (btn) btn.classList.toggle('active', active);
    if (this.atmoChk && typeof SURFACE_VIEW !== 'undefined') {
      this.atmoChk.checked = SURFACE_VIEW.atmosphereOn;
    }
    if (this.hint) {
      this.hint.textContent = active
        ? 'Seret = lihat sekeliling · Roda/pinch = zoom · ✕ atau Esc = keluar POV.'
        : 'Seret = lihat sekeliling · Roda/pinch = zoom lensa. Langit mengikuti waktu simulasi.';
    }
  },

  toggleModal() {
    this.modal.classList.toggle('hidden');
    this.syncButtons();
    if (window.__syncBackdrop) window.__syncBackdrop();
  },

  hide() {
    this.modal.classList.add('hidden');
    if (window.__syncBackdrop) window.__syncBackdrop();
  },

  applyAndEnter() {
    let lat = parseFloat(this.latInput.value);
    let lon = parseFloat(this.lonInput.value);
    const elev = parseFloat(this.elevInput.value) || 0;
    const bodyKey = this.bodySelect ? this.bodySelect.value : 'earth';

    if (isNaN(lat) || isNaN(lon)) {
      if (this.hint) this.hint.textContent = '⚠ Lintang & bujur harus berupa angka.';
      return;
    }
    /* Lintang: jepit ke −89,9…89,9 (kutub tepat membuat arah utara ambigu).
       Bujur: NORMALISASI ke −180…180, bukan ditolak — data resmi sering
       memakai rentang 0…360 (mis. Olympus Mons di 226,2° B = −133,8°),
       jadi menolaknya akan memblokir lokasi yang sah (temuan uji). */
    if (lat < -90 || lat > 90) {
      if (this.hint) this.hint.textContent = '⚠ Lintang harus −90…90.';
      return;
    }
    lat = Math.max(-89.9, Math.min(89.9, lat));
    lon = ((lon + 180) % 360 + 360) % 360 - 180;

    /* Lepas fokus benda lain supaya kamera benar-benar milik pengamat */
    if (typeof focusBody === 'function') focusBody(null);

    /* Saklar atmosfer dibaca saat masuk */
    if (typeof SURFACE_VIEW !== 'undefined' && this.atmoChk) {
      SURFACE_VIEW.atmosphereOn = this.atmoChk.checked;
    }

    const ok = SURFACE_VIEW.enable(bodyKey, lat, lon, elev);
    if (!ok) {
      if (this.hint) this.hint.textContent = '⚠ Benda langit tidak ditemukan.';
      return;
    }
    this.hide();
    this.syncButtons();
    this.updateObserverPanel();
  },

  exitPOV() {
    SURFACE_VIEW.disable();
    /* tampilkan kembali selubung atmosfer semua benda */
    if (typeof bodies !== 'undefined') {
      for (const b of bodies) if (b.atmoMesh) b.atmoMesh.visible = true;
    }
    /* sembunyikan bola langit permukaan & lepas patch permukaan */
    if (typeof hideSurfaceSky === 'function') hideSurfaceSky();
    if (typeof removeSurfacePatch === 'function') removeSurfacePatch();
    /* Kembalikan fov & near plane kamera normal */
    if (typeof camera !== 'undefined' && camera) {
      camera.fov = 50;
      camera.near = 0.0005;
      camera.updateProjectionMatrix();
    }
    this.hide();
    this.syncButtons();
  },

  /* Teks panel pengamat: benda, lokasi, koordinat, elevasi Matahari. */
  updateObserverPanel() {
    if (!this.obsText || typeof SURFACE_VIEW === 'undefined' || !SURFACE_VIEW.active) return;
    const lat = SURFACE_VIEW.lat, lon = SURFACE_VIEW.lon;
    const ns = lat >= 0 ? 'LU' : 'LS', ew = lon >= 0 ? 'BT' : 'BB';
    const b = SURFACE_VIEW.currentBody();
    const bodyName = b ? b.name : '—';

    /* elevasi Matahari di lokasi pengamat → status siang/malam */
    let status = '';
    if (b && typeof SURFACE_VIEW.computeObserver === 'function') {
      const obs = SURFACE_VIEW.computeObserver(b);
      if (obs) {
        const alt = SURFACE_VIEW.sunAltitudeDeg(obs);
        if (alt > 6) status = '☀ siang';
        else if (alt > -0.8) status = '🌅 terbit/terbenam';
        else if (alt > -6) status = '🌆 senja';
        else if (alt > -18) status = '🌃 senja astronomi';
        else status = '🌙 malam';
      }
    }

    this.obsText.textContent =
      bodyName + ' · ' + Math.abs(lat).toFixed(1) + '° ' + ns + ', ' +
      Math.abs(lon).toFixed(1) + '° ' + ew +
      (status ? ' · ' + status : '');
  },
};

/* Perbarui panel pengamat tiap ~1 detik (hemat: hanya saat POV aktif).
   Interval 1 detik supaya status siang/malam ikut berubah cepat saat
   pengguna mempercepat waktu simulasi. */
setInterval(() => {
  if (typeof EARTHVIEW_UI !== 'undefined' && typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.active) {
    EARTHVIEW_UI.updateObserverPanel();
  }
}, 1000);

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => EARTHVIEW_UI.init());
} else if (typeof document !== 'undefined') {
  EARTHVIEW_UI.init();
}
