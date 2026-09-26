/* =======================================================================
   UI POV BUMI
   ----------------------------------------------------------------------
   Menghubungkan kontrol HTML dengan logika POV Bumi.
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
    
    this.citySelect.addEventListener('change', () => this.updateInputsFromCity());
    this.latInput.addEventListener('input', () => this.citySelect.value = '');
    this.lonInput.addEventListener('input', () => this.citySelect.value = '');

    this.btnApply.addEventListener('click', () => this.applyAndEnter());
    this.btnExit.addEventListener('click', () => this.exitPOV());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'e' || e.key === 'E') {
        if (EARTH_VIEW.active) this.exitPOV();
        else this.toggleModal();
      }
    });
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

  toggleModal() {
    this.modal.classList.toggle('hidden');
    if (!this.modal.classList.contains('hidden') && EARTH_VIEW.active) {
      this.btnExit.style.display = 'inline-block';
    } else {
      this.btnExit.style.display = 'none';
    }
  },

  hide() {
    this.modal.classList.add('hidden');
  },

  applyAndEnter() {
    const lat = parseFloat(this.latInput.value);
    const lon = parseFloat(this.lonInput.value);
    const elev = parseFloat(this.elevInput.value) || 0;
    
    if (isNaN(lat) || isNaN(lon)) return;

    EARTH_VIEW.enable(lat, lon, this.citySelect.value);
    EARTH_VIEW.elev = elev;
    this.hide();

    /* Reset kamera ke mode pengamat darat */
    if (typeof focusBody === 'function') {
      focusBody(null); // Lepas fokus planet lain
    }
    
    // Tampilkan notifikasi
    const badge = document.getElementById('eventBadge');
    if (badge) {
      badge.innerHTML = `🌍 Mode POV Bumi Aktif (Lat: ${lat.toFixed(2)}°, Lon: ${lon.toFixed(2)}°)`;
      badge.style.display = 'block';
      setTimeout(() => badge.style.display = 'none', 3000);
    }
  },

  exitPOV() {
    EARTH_VIEW.disable();
    this.hide();
    const badge = document.getElementById('eventBadge');
    if (badge) {
      badge.innerHTML = `🚀 Kembali ke orbit tata surya`;
      badge.style.display = 'block';
      setTimeout(() => badge.style.display = 'none', 3000);
    }
  }
};

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => EARTHVIEW_UI.init());
} else if (typeof document !== 'undefined') {
  EARTHVIEW_UI.init();
}