/* =======================================================================
   BADGE AKURASI TEMPORAL
   ----------------------------------------------------------------------
   Menampilkan rentang validitas model & akurasi Bulan di panel atas.
   ======================================================================= */

const TEMPORAL_BADGE = {
  el: null,
  init() {
    this.el = document.getElementById('temporalBadge');
    if (!this.el) {
      console.warn('TEMPORAL_BADGE: element #temporalBadge tidak ditemukan');
      return;
    }
    this.el.style.display = 'block';
  },

  update(appDays) {
    if (!this.el) return;
    const jd = 2451545.0 + appDays;
    const yrFromJ2000 = appDays / 365.25;
    const absYr = Math.abs(yrFromJ2000);

    let modelRange = '';
    let moonAccuracy = '';

    // Model planetary: JPL Keplerian approx (Standish) valid 1800-2050
    // J2000 = 2000.0, so 1800 = -200 yr, 2050 = +50 yr
    if (yrFromJ2000 >= -200 && yrFromJ2000 <= 50) {
      modelRange = 'Planet: 1800–2050 (JPL Keplerian)';
    } else if (yrFromJ2000 > 50) {
      modelRange = `Planet: >2050 (ekstrapolasi ${yrFromJ2000.toFixed(0)} thn)`;
    } else {
      modelRange = `Planet: <1800 (ekstrapolasi ${Math.abs(yrFromJ2000).toFixed(0)} thn)`;
    }

    // Moon accuracy: Meeus bab 47 (60 suku) ~10" dekat J2000, degradasi ~0.5"/thn
    // DE441 vs Meeus 60-term error grows ~0.5"/yr from J2000
    const moonErrArcsec = 10 + 0.5 * absYr;
    if (absYr <= 50) {
      moonAccuracy = `Bulan: ~${moonErrArcsec.toFixed(0)}" (Meeus 60 suku)`;
    } else {
      moonAccuracy = `Bulan: ~${moonErrArcsec.toFixed(0)}" (ekstrapolasi, model ringkas)`;
    }

    // Star proper motion: HYG v3.8 + pmRA/pmDec applied realtime
    const starNote = 'Bintang: proper motion HYG v3.8 + aberrasi/nutasi';

    this.el.innerHTML = `
      <div class="tb-line">${modelRange}</div>
      <div class="tb-line">${moonAccuracy}</div>
      <div class="tb-line">${starNote}</div>
    `;
    this.el.title = `JD ${(2451545.0 + appDays).toFixed(2)} | ${new Date(2451545.0 * 86400000 + appDays * 86400000).toISOString().slice(0,19)}Z`;
  },
};

// Auto-init when DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TEMPORAL_BADGE.init());
  } else {
    TEMPORAL_BADGE.init();
  }
}

// Export for module systems (not used in browser build, but kept for consistency)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TEMPORAL_BADGE };
}