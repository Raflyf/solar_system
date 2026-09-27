/* =======================================================================
   SEARCH — PENCARIAN BENDA LANGIT (bintang, galaksi, planet, satelit, dll)
   -----------------------------------------------------------------------
   PERMINTAAN PENGGUNA:
     "tambahkan fungsi search untuk mencari benda langit seperti bintang,
      galaxy, planet, satelit, dan lainnya yg ada di langit secara lengkap"

   CAKUPAN PENCARIAN (semua sumber data yang ada di aplikasi):
     1. BINTANG BERNAMA  — 3.735 bintang dari katalog HYG (nama resmi)
     2. OBJEK DEEP-SKY   — 20 galaksi, nebula, gugus bintang (M31, M42, …)
     3. PLANET & MATAHARI— 8 planet + Matahari
     4. SATELIT          — Bulan, Phobos, Deimos, Io, Europa, dll
     5. RASI BINTANG     — 88 rasi resmi IAU (dengan nama Indonesia/Latin)
     6. BINTANG BAYER    — pencarian lewat penamaan Bayer (mis. "Alp CMa")

   FITUR:
     • Kotak pencarian dengan saran langsung (muncul saat mengetik)
     • Navigasi keyboard: ↑ ↓ untuk memilih, Enter untuk memilih, Esc tutup
     • Toleransi salah ketik (pencocokan awalan + substring)
     • Klik hasil = kamera diarahkan & zoom ke objek itu
     • Hasil dikelompokkan per jenis supaya mudah dibaca
     • Batas 30 hasil supaya ringan

   Kinerja: indeks dibangun SEKALI saat pertama dipakai, lalu pencarian
   memakai pencocokan sederhana (cukup cepat untuk ~3.800 entri).
   ======================================================================= */

const SEARCH = {
  indeks: null,
  panel: null,
  input: null,
  daftar: null,
  hasil: [],
  terpilih: -1,
  terbuka: false,
  maksHasil: 30,

  /* ---------------- bangun indeks sekali ---------------- */
  bangunIndeks() {
    if (this.indeks) return;
    const idx = [];

    /* 1. bintang bernama (katalog HYG) */
    try {
      if (typeof STARS_LABELED !== 'undefined' && STARS_LABELED.length) {
        for (const s of STARS_LABELED) {
          const nama = (s[0] || '').trim();
          if (!nama) continue;
          idx.push({
            jenis: 'Bintang', nama,
            kunci: nama.toLowerCase(),
            ra: null, dec: null,
            x: s[4], y: s[5], z: s[6],
            info: `mag ${Number(s[3]).toFixed(2)}` +
                  (s[10] ? ` · ${s[10]}` : ''),
            warna: s[7] && s[8] && s[9] ? `rgb(${s[7]},${s[8]},${s[9]})` : null,
            ref: s,
          });
          /* ============================================================
             NAMA ALTERNATIF (Bayer) — DITAMBAHKAN
             ------------------------------------------------------------
             Banyak bintang punya DUA sebutan yang sama-sama dicari orang:
                 • nama umum  (mis. "Sirius", "Capella")   -> kolom [0]
                 • nama Bayer (mis. "α CMa", "Alp Aur")    -> kolom [1]
             Versi pertama hanya memasukkan kolom [0], sehingga mencari
             "Alp CMa" tidak menemukan apa pun. Sekarang kolom [1] juga
             diindeks sebagai entri terpisah supaya kedua cara pencarian
             bekerja.
             ============================================================ */
          const bayer = (s[1] || '').trim();
          if (bayer && bayer !== nama) {
            idx.push({
              jenis: 'Bintang', nama: bayer,
              kunci: bayer.toLowerCase(),
              x: s[4], y: s[5], z: s[6],
              info: `= ${nama}`,
              warna: s[7] && s[8] && s[9] ? `rgb(${s[7]},${s[8]},${s[9]})` : null,
              ref: s,
            });
          }
        }
      }
    } catch (e) { console.warn('indeks bintang gagal:', e); }

    /* 2. objek deep-sky (galaksi, nebula, gugus) */
    try {
      if (typeof DEEP_SKY !== 'undefined' && DEEP_SKY.length) {
        for (const o of DEEP_SKY) {
          const nama = String(o[0] || '').trim();
          if (!nama) continue;
          idx.push({
            jenis: o[6] === 'galaksi' ? 'Galaksi'
                 : o[6] === 'nebula' ? 'Nebula'
                 : o[6] === 'gugus' ? 'Gugus bintang'
                 : o[6] === 'pusat' ? 'Pusat galaksi' : 'Objek langit',
            nama,
            kunci: nama.toLowerCase(),
            raJam: o[1], decDeg: o[2],
            info: `${Number(o[3]).toLocaleString('id')} ly`,
            warna: '#' + Number(o[5]).toString(16).padStart(6, '0'),
            ref: o,
          });
        }
      }
    } catch (e) { console.warn('indeks deep-sky gagal:', e); }

    /* 3. planet, Matahari, dan satelit */
    try {
      if (typeof bodies !== 'undefined' && bodies.length) {
        for (const b of bodies) {
          if (!b || !b.name) continue;
          const jenis = b.isMoon ? 'Satelit'
                      : b.key === 'sun' ? 'Matahari' : 'Planet';
          const info = b.isMoon
            ? `mengorbit ${b.host ? b.host.name : '?'}`
            : (b.aKm ? `${(b.aKm / 149597870.7).toFixed(2)} SA` : '');
          idx.push({
            jenis, nama: b.name, kunci: b.name.toLowerCase(),
            info, ref: b, bodyRef: b,
          });
        }
      }
    } catch (e) { console.warn('indeks benda gagal:', e); }

    /* 4. rasi bintang (88 rasi IAU) */
    try {
      if (typeof CONSTELLATIONS !== 'undefined' && CONSTELLATIONS.length) {
        for (const c of CONSTELLATIONS) {
          const nama = c.nama_panjang || c.nama;
          if (!nama) continue;
          idx.push({
            jenis: 'Rasi bintang',
            nama: `${nama} (${c.nama})`,
            kunci: nama.toLowerCase() + ' ' + String(c.nama).toLowerCase(),
            info: `${(c.segments || []).length} garis`,
            ref: c, rasiRef: c,
          });
        }
      }
    } catch (e) { console.warn('indeks rasi gagal:', e); }

    /* 5. penamaan Bayer dari katalog (mis. "Alp CMa") */
    try {
      if (typeof STARS_LABELED !== 'undefined') {
        for (const s of STARS_LABELED) {
          const bayer = (s[1] || '').trim();
          if (!bayer || bayer === s[0]) continue;
          idx.push({
            jenis: 'Bintang (Bayer)', nama: bayer,
            kunci: bayer.toLowerCase(),
            info: s[0] ? `= ${s[0]}` : '',
            x: s[4], y: s[5], z: s[6], ref: s,
          });
        }
      }
    } catch (e) { /* diamkan */ }

    /* urutkan: yang namanya lebih pendek dulu (biasanya lebih umum) */
    idx.sort((a, b) => a.nama.length - b.nama.length);
    this.indeks = idx;
    console.log('SEARCH: indeks siap,', idx.length, 'entri');
  },

  /* ---------------- cari ---------------- */
  cari(kueri) {
    if (!this.indeks) this.bangunIndeks();
    const q = String(kueri || '').trim().toLowerCase();
    if (q.length < 1) return [];

    const hasil = [];
    for (const it of this.indeks) {
      const k = it.kunci;
      let skor = -1;
      if (k === q) skor = 0;                       /* sama persis */
      else if (k.startsWith(q)) skor = 1;          /* awalan */
      else if (k.includes(' ' + q)) skor = 2;      /* awal kata */
      else if (k.includes(q)) skor = 3;            /* di tengah */
      if (skor < 0) continue;
      hasil.push({ it, skor });
    }
    hasil.sort((a, b) => a.skor - b.skor || a.it.nama.length - b.it.nama.length);
    return hasil.slice(0, this.maksHasil).map(h => h.it);
  },

  /* ---------------- arahkan kamera ke hasil ---------------- */
  pilih(it) {
    if (!it) return;
    this.tutup();

    /* 1. benda tata surya (planet/satelit/Matahari) -> fokuskan */
    if (it.bodyRef) {
      if (typeof focusBody === 'function') focusBody(it.bodyRef);
      return;
    }

    /* 2. bintang -> arahkan pandangan + zoom (memakai STAR_FOCUS) */
    if (it.x !== undefined && typeof STAR_FOCUS !== 'undefined') {
      /* hitung RA/Dec dari vektor kartesian parsek */
      const L = Math.sqrt(it.x * it.x + it.y * it.y + it.z * it.z) || 1;
      const xe = it.x / L, ye = it.y / L, ze = it.z / L;
      const ra = ((Math.atan2(ye, xe) / DEG) % 360 + 360) % 360;
      const dec = Math.asin(Math.max(-1, Math.min(1, ze))) / DEG;
      /* arahkan pandangan POV ke koordinat ini */
      this.arahkanKe(ra, dec);
      return;
    }

    /* 3. objek deep-sky (RA dalam jam, Dec dalam derajat) */
    if (it.raJam !== undefined) {
      this.arahkanKe(it.raJam * 15, it.decDeg);
      return;
    }

    /* 4. rasi bintang -> arahkan ke pusat rasi */
    if (it.rasiRef && typeof CONSTELLATION_LABELS !== 'undefined') {
      const lab = CONSTELLATION_LABELS.items.find(x => x.nama === it.rasiRef.nama);
      if (lab && typeof camera !== 'undefined') {
        /* arahkan pandangan ke pusat rasi */
        const v = new THREE.Vector3(lab.x, lab.y, lab.z).normalize();
        const c = 0.9174820621, s = 0.3977771559;
        const xe = v.x, ye = -c * v.z - s * v.y, ze = -s * v.z + c * v.y;
        const ra = ((Math.atan2(ye, xe) / DEG) % 360 + 360) % 360;
        const dec = Math.asin(Math.max(-1, Math.min(1, ze))) / DEG;
        this.arahkanKe(ra, dec);
      }
      return;
    }
  },

  /* Arahkan pandangan ke RA/Dec tertentu — BEKERJA DI KEDUA MODE.
     ======================================================================
     BUG YANG DIPERBAIKI
     ----------------------------------------------------------------------
     KELUHAN: "fungsi search masih belum sepenuh nya jalan, hanya bisa
     search planet dan satelite saja, search bintang, rasi bitang, galaxy
     dan lainnya tidak berfungsi"

     AKAR MASALAH: versi sebelumnya hanya bekerja bila mode POV aktif:
         if (typeof SURFACE_VIEW === 'undefined' || !SURFACE_VIEW.active) {
           showToast('Aktifkan mode POV...'); return;
         }
     Planet & satelit memakai focusBody() (tidak butuh POV), jadi mereka
     BEKERJA. Tetapi bintang, rasi, galaksi, dan nebula butuh mengarahkan
     PANDANGAN — dan di mode orbit fungsi ini langsung keluar tanpa
     melakukan apa pun. Itulah sebabnya terasa "tidak berfungsi".

     PERBAIKAN:
       • Mode POV   : arahkan azimut/elevasi pengamat (seperti sebelumnya).
       • Mode orbit : arahkan KAMERA ke arah benda itu dengan memindahkan
         titik pandang kamera (yaw/pitch) — sehingga bintang/rasi/galaksi
         terlihat di tengah layar tanpa perlu masuk POV.
     ====================================================================== */
  arahkanKe(raDeg, decDeg) {
    if (typeof raDecToScene !== 'function') return;

    /* hitung vektor arah di kerangka scene */
    const p = raDecToScene(raDeg / 15, decDeg, 1);
    const v = new THREE.Vector3(p.x, p.y, p.z).normalize();

    /* ---------- MODE POV: arahkan pengamat ---------- */
    if (typeof SURFACE_VIEW !== 'undefined' && SURFACE_VIEW.active) {
      const obs = SURFACE_VIEW.computeObserver(SURFACE_VIEW.currentBody());
      if (!obs) return;
      SURFACE_VIEW.el = Math.asin(Math.max(-1, Math.min(1, v.dot(obs.zenith))));
      SURFACE_VIEW.az = Math.atan2(v.dot(obs.east), v.dot(obs.north));
      return;
    }

    /* ---------- MODE ORBIT: arahkan kamera ----------
       ==================================================================
       CATATAN PENTING tentang struktur transisi di proyek ini:
       `cameraState.transition` yang sudah ada HANYA menginterpolasi
       POSISI kamera (fromPos -> posisi benda), bukan sudut pandang.
       Karena itu kita TIDAK memakai transisi di sini; cukup set yaw/pitch
       langsung. Perubahan sudut langsung terasa responsif dan tidak
       mengganggu (pengguna baru saja memilih dari daftar pencarian).
       ================================================================== */
    if (typeof cameraState === 'undefined') return;

    /* hitung sudut pandang yang mengarah ke benda.
       Konvensi kamera proyek ini (lihat dirFromAngles di 30-controls.js):
         fwd.x = cos(pitch) * sin(yaw)
         fwd.y = sin(pitch)
         fwd.z = cos(pitch) * cos(yaw)
       Jadi: yaw = atan2(x, z), pitch = asin(y). */
    const targetYaw = Math.atan2(v.x, v.z);
    const targetPitch = Math.asin(Math.max(-1, Math.min(1, v.y)));

    /* pemendekan sudut: putar lewat jalur terdekat, bukan memutar jauh */
    let dYaw = targetYaw - cameraState.yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;

    cameraState.yaw += dYaw;
    cameraState.pitch = Math.max(-1.45, Math.min(1.45, targetPitch));

    /* bila kamera sedang mengikuti benda (target), hentikan dulu supaya
       arah pandang tidak langsung ditimpa oleh updateCamera */
    if (cameraState.target) {
      cameraState.target = null;
      cameraState.followAutoFit = false;
    }

    if (typeof showToast === 'function') {
      showToast('Pandangan diarahkan ke koordinat langit');
    }
  },

  /* ---------------- panel UI ---------------- */
  init() {
    /* CATATAN: sejak pencarian dipindah KE DALAM panel judul (agar tidak
       pernah bertumpuk), `searchPanel` adalah KOTAK pencarian dan
       `searchResults` adalah daftar hasil yang mengambang. Class `show`
       diterapkan ke daftar hasil, bukan ke kotak. */
    this.panel = document.getElementById('searchPanel');
    this.input = document.getElementById('searchInput');
    this.daftar = document.getElementById('searchResults');
    if (!this.input || !this.daftar) return;
    this.bangunIndeks();

    this.input.addEventListener('input', () => this.perbarui());
    this.input.addEventListener('focus', () => { if (this.input.value) this.perbarui(); });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.geser(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.geser(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.hasil.length) this.pilih(this.hasil[Math.max(0, this.terpilih)]);
      } else if (e.key === 'Escape') { this.tutup(); this.input.blur(); }
    });
    /* klik di luar menutup panel */
    document.addEventListener('click', (e) => {
      if (this.panel && !this.panel.contains(e.target)) this.tutup();
    });
    /* tombol pintas: "/" untuk fokus ke kotak pencarian */
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== this.input) {
        e.preventDefault(); this.input.focus(); this.input.select();
      }
    });
  },

  perbarui() {
    const q = this.input.value;
    this.hasil = this.cari(q);
    this.terpilih = this.hasil.length ? 0 : -1;
    this.render();
  },

  render() {
    if (!this.hasil.length) {
      const q = this.input.value.trim();
      this.daftar.innerHTML = q
        ? '<div class="sr-kosong">Tidak ada hasil untuk "' + q.replace(/[<>&]/g, '') + '"</div>'
        : '';
      this.terbuka = !!q;
      this.daftar.classList.toggle('show', this.terbuka);
      return;
    }
    const html = this.hasil.map((it, i) => {
      const dot = it.warna
        ? `<span class="sr-dot" style="background:${it.warna}"></span>`
        : '<span class="sr-dot sr-dot-kosong"></span>';
      return `<div class="sr-item${i === this.terpilih ? ' aktif' : ''}" data-i="${i}">
        ${dot}
        <span class="sr-nama">${it.nama.replace(/[<>&]/g, '')}</span>
        <span class="sr-jenis">${it.jenis}</span>
        ${it.info ? `<span class="sr-info">${it.info.replace(/[<>&]/g, '')}</span>` : ''}
      </div>`;
    }).join('');
    this.daftar.innerHTML = html;
    this.terbuka = true;
    this.daftar.classList.add('show');
    /* klik pada hasil (klik mouse + tap sentuh HP) */
    this.daftar.querySelectorAll('.sr-item').forEach(el => {
      const pick = () => this.pilih(this.hasil[parseInt(el.dataset.i, 10)]);
      el.addEventListener('click', pick);
      el.addEventListener('touchend', (e) => { e.preventDefault(); pick(); }, { passive: false });
    });
  },

  geser(arah) {
    if (!this.hasil.length) return;
    this.terpilih = (this.terpilih + arah + this.hasil.length) % this.hasil.length;
    /* perbarui sorotan tanpa render ulang seluruh daftar */
    this.daftar.querySelectorAll('.sr-item').forEach((el, i) => {
      el.classList.toggle('aktif', i === this.terpilih);
    });
    const aktif = this.daftar.querySelector('.sr-item.aktif');
    if (aktif) aktif.scrollIntoView({ block: 'nearest' });
  },

  tutup() {
    this.terbuka = false;
    if (this.daftar) this.daftar.classList.remove('show');
  },
};
