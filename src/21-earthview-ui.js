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

    this.citySelect = document.getElementById('evmCity');
    this.latInput = document.getElementById('evmLat');
    this.lonInput = document.getElementById('evmLon');
    this.elevInput = document.getElementById('evmElev');
    this.btnApply = document.getElementById('evmApply');
    this.btnExit = document.getElementById('evmExit');
    this.obsPanel = document.getElementById('observerPanel');
    this.obsText = document.getElementById('observerText');
    this.hint = this.modal.querySelector('.evm-hint');

    /* Isi dropdown kota */
    if (typeof EARTH_VIEW !== 'undefined') {
      const cities = EARTH_VIEW.cityList();
      for (const c of cities) {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        this.citySelect.appendChild(opt);
      }
      this.citySelect.value = EARTH_VIEW.city;
      this.updateInputsFromCity();
    }

    /* Event listeners */
    document.getElementById('btnEarthView').addEventListener('click', () => this.toggleModal());
    document.getElementById('evmClose').addEventListener('click', () => this.hide());
    const btnObsExit = document.getElementById('btnObsExit');
    if (btnObsExit) btnObsExit.addEventListener('click', () => this.exitPOV());

    this.citySelect.addEventListener('change', () => this.updateInputsFromCity());
    this.latInput.addEventListener('input', () => this.citySelect.value = '');
    this.lonInput.addEventListener('input', () => this.citySelect.value = '');

    this.btnApply.addEventListener('click', () => this.applyAndEnter());
    this.btnExit.addEventListener('click', () => this.exitPOV());

    /* Escape = keluar POV (hanya saat POV aktif). Tidak memakai tombol E
       supaya tidak bentrok dengan kontrol terbang bebas. */
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && typeof EARTH_VIEW !== 'undefined' && EARTH_VIEW.active) {
        this.exitPOV();
      }
    });

    this.syncButtons();
  },

  updateInputsFromCity() {
    const cityName = this.citySelect.value;
    if (cityName && typeof EARTH_VIEW !== 'undefined') {
      const c = EARTH_VIEW.cities[cityName];
      if (c) {
        this.latInput.value = c.lat;
        this.lonInput.value = c.lon;
        this.elevInput.value = 50;
      }
    }
  },

  /* Sinkronkan tampilan tombol & panel pengamat dengan status POV. */
  syncButtons() {
    const active = typeof EARTH_VIEW !== 'undefined' && EARTH_VIEW.active;
    if (this.btnExit) this.btnExit.style.display = active ? 'inline-block' : 'none';
    if (this.obsPanel) this.obsPanel.classList.toggle('show', active);
    const btn = document.getElementById('btnEarthView');
    if (btn) btn.classList.toggle('active', active);
    if (this.hint) {
      this.hint.textContent = active
        ? 'Seret = lihat sekeliling · Roda/pinch = zoom · ✕ atau Esc = keluar POV.'
        : 'Seret = lihat sekeliling · Roda/pinch = zoom lensa.';
    }
  },

  toggleModal() {
    this.modal.classList.toggle('hidden');
    this.syncButtons();
  },

  hide() {
    this.modal.classList.add('hidden');
  },

  applyAndEnter() {
    const lat = parseFloat(this.latInput.value);
    const lon = parseFloat(this.lonInput.value);
    const elev = parseFloat(this.elevInput.value) || 0;

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      if (this.hint) this.hint.textContent = '⚠ Lintang harus −90…90 dan bujur −180…180.';
      return;
    }

    /* Lepas fokus benda lain supaya kamera benar-benar milik pengamat */
    if (typeof focusBody === 'function') focusBody(null);

    EARTH_VIEW.enable(lat, lon, this.citySelect.value, elev);
    this.hide();
    this.syncButtons();
    this.updateObserverPanel();
  },

  exitPOV() {
    EARTH_VIEW.disable();
    /* tampilkan kembali selubung atmosfer Bumi */
    if (typeof findBody === 'function') {
      const e = findBody('earth');
      if (e && e.atmoMesh) e.atmoMesh.visible = true;
    }
    /* Kembalikan fov & near plane kamera normal */
    if (typeof camera !== 'undefined' && camera) {
      camera.fov = 50;
      camera.near = 0.0005;
      camera.updateProjectionMatrix();
    }
    this.hide();
    this.syncButtons();
  },

  /* Teks panel pengamat: kota, koordinat, jam sidereal lokal (LST). */
  updateObserverPanel() {
    if (!this.obsText || typeof EARTH_VIEW === 'undefined' || !EARTH_VIEW.active) return;
    const lat = EARTH_VIEW.lat, lon = EARTH_VIEW.lon;
    const lst = EARTH_VIEW.lstDeg(typeof app !== 'undefined' ? app.days : 0);
    const h = Math.floor(lst / 15), m = Math.floor((lst / 15 - h) * 60);
    const ns = lat >= 0 ? 'LU' : 'LS', ew = lon >= 0 ? 'BT' : 'BB';
    this.obsText.textContent =
      'Pengamat: ' + EARTH_VIEW.city +
      ' (' + Math.abs(lat).toFixed(1) + '° ' + ns + ', ' +
      Math.abs(lon).toFixed(1) + '° ' + ew + ')' +
      ' · LST ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  },
};

/* Perbarui panel pengamat tiap ~2 detik (hemat: hanya saat POV aktif). */
setInterval(() => {
  if (typeof EARTHVIEW_UI !== 'undefined' && typeof EARTH_VIEW !== 'undefined' && EARTH_VIEW.active) {
    EARTHVIEW_UI.updateObserverPanel();
  }
}, 2000);

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => EARTHVIEW_UI.init());
} else if (typeof document !== 'undefined') {
  EARTHVIEW_UI.init();
}
