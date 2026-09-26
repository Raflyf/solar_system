/* =======================================================================
   BADGE AKURASI TEMPORAL
   ----------------------------------------------------------------------
   Menampilkan rentang validitas model untuk tanggal simulasi saat ini.
   Dulu badge ini melayang di kanan atas layar dan MENIMPA panel info
   (keluhan pengguna: "UI bentrok dan tertutup"). Sekarang badge hidup
   DI DALAM panel Tanggal sebagai baris keterangan, jadi tidak mungkin
   bertabrakan dengan elemen lain.

   Rentang validitas (jujur, berdasarkan sumber model):
     • Planet : elemen Keplerian JPL (Standish 1990) — 1800–2050.
                Di luar itu nilainya ekstrapolasi.
     • Bulan  : deret Meeus bab 47 (60 suku) — akurasi terbaik di dekat
                J2000, memburuk ±0,5"/tahun menjauh dari J2000.
     • Bintang: katalog HYG v3.8 (epoch J2000) + proper motion linear.
                Linearitas proper motion tetap baik untuk ±1.000 tahun,
                tetapi presisi posisi terbaik tetap di dekat J2000.
   ======================================================================= */

const TEMPORAL_BADGE = {
  el: null,
  _lastKey: '',

  init() {
    this.el = document.getElementById('temporalBadge');
    /* tidak wajib ada — badge hidup di dalam panel tanggal yang dibuat
       secara dinamis oleh buildDatePanel() */
  },

  /* Warna status: hijau = dalam rentang terbaik, kuning = ekstrapolasi
     dekat, merah = jauh di luar rentang (klaim akurasi tidak lagi valid). */
  statusFor(yrFromJ2000) {
    const a = Math.abs(yrFromJ2000);
    if (yrFromJ2000 >= -200 && yrFromJ2000 <= 50) return 'ok';
    if (a <= 300) return 'warn';
    return 'bad';
  },

  update(appDays) {
    if (!this.el) this.init();
    if (!this.el) return;
    /* hemat: panel tanggal tertutup = elemen tidak terlihat -> jangan
       menyusun ulang DOM setiap frame. Selain itu, hanya tulis ulang
       bila teks benar-benar berubah (berbasis hari). */
    if (this.el.offsetParent === null) return;
    const dayKey = Math.round(appDays);
    if (dayKey === this._lastKey) return;
    this._lastKey = dayKey;

    const yrFromJ2000 = appDays / 365.25;
    const absYr = Math.abs(yrFromJ2000);

    let planetTxt;
    if (yrFromJ2000 >= -200 && yrFromJ2000 <= 50) {
      /* angka dari uji langsung vs JPL Horizons (tools/compare_horizons.js):
         1800-2050 selisih sudut < 0,2° (terburuk Saturnus ~0,15°) */
      planetTxt = 'Planet: akurasi < 0,2° (JPL Keplerian, 1800–2050)';
    } else if (yrFromJ2000 > 50) {
      planetTxt = `Planet: ekstrapolasi ${yrFromJ2000.toFixed(0)} thn setelah 2050`;
    } else {
      planetTxt = `Planet: ekstrapolasi ${absYr.toFixed(0)} thn sebelum 1800`;
    }

    /* error Bulan dari uji langsung vs JPL Horizons (tools/compare_moon.js):
       3–13 detik busur (3–24 km) untuk 2024–2040; membesar menjauh dari
       J2000. Angka konservatif 10" + 0,5"/tahun. */
    const moonErr = 10 + 0.5 * absYr;
    const moonTxt = absYr <= 50
      ? `Bulan: akurasi ≈ ${moonErr.toFixed(0)}" (terverifikasi 3–13" vs JPL)`
      : `Bulan: akurasi ≈ ${moonErr.toFixed(0)}" — makin jauh dari J2000, makin kasar`;

    const starTxt = 'Bintang: HYG v3.8 + proper motion nyata';

    this.el.innerHTML =
      `<div class="tb-line tb-${this.statusFor(yrFromJ2000)}">${planetTxt}</div>` +
      `<div class="tb-line tb-${absYr <= 50 ? 'ok' : absYr <= 300 ? 'warn' : 'bad'}">${moonTxt}</div>` +
      `<div class="tb-line tb-ok">${starTxt}</div>`;
  },
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TEMPORAL_BADGE.init());
  } else {
    TEMPORAL_BADGE.init();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TEMPORAL_BADGE };
}
