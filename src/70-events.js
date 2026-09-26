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

/* ---------- pencarian GERHANA dalam rentang (dipertahankan) ---------- */
function searchEclipses(fromDate, toDate) {
  return searchEvents(fromDate, toDate, ['gerhana']);
}

/* =======================================================================
   PENCARIAN PERISTIWA LANGIT UNIVERSAL
   -----------------------------------------------------------------------
   Dulu hanya bisa mencari gerhana. Sekarang mencari SEMUA jenis peristiwa
   yang bisa dihitung aplikasi, dalam rentang tanggal bebas:

     • Gerhana Matahari & Bulan (total / cincin / sebagian / penumbra)
     • Oposisi planet      — paling terang & terdekat dari Bumi
     • Konjungsi planet    — berpasangan (mis. Venus–Jupiter < 3°)
     • Konjungsi Matahari  — planet di balik Matahari (superior)
     • Hujan meteor        — puncak (ZHR maksimum), data IMO
     • Bulan baru & purnama (fase ekstrem)
     • Perigee/Apogee Bulan (bulan super/mini) — opsional

   Setiap hasil punya: jenis, ikon, judul, detail, tanggal, jd, dan
   `skor` untuk pengurutan kepentingan.
   ======================================================================= */
const EVENT_KINDS = {
  gerhana:  { label: 'Gerhana (Matahari & Bulan)', ikon: '🌑', skor: 100 },
  oposisi:  { label: 'Oposisi planet',             ikon: '✨', skor: 70 },
  konjungsi:{ label: 'Konjungsi planet',           ikon: '🪐', skor: 55 },
  matahari: { label: 'Konjungsi Matahari',         ikon: '⊙',  skor: 45 },
  meteor:   { label: 'Puncak hujan meteor',        ikon: '☄️', skor: 60 },
  fase:     { label: 'Bulan baru & purnama',       ikon: '🌙', skor: 35 },
};

function searchEvents(fromDate, toDate, kinds) {
  const jd0 = dateToJD(fromDate);
  const jd1 = dateToJD(toDate);
  const aktif = kinds && kinds.length ? kinds : Object.keys(EVENT_KINDS);
  const on = (k) => aktif.indexOf(k) >= 0;
  const hasil = [];

  /* ---- 1. GERHANA ----
     PENDEKATAN BARU (deteksi berbasis fase):
     Gerhana hanya mungkin terjadi di dekat Bulan baru (Matahari) atau
     purnama (Bulan). Versi lama memindai SELURUH rentang dengan langkah
     0,25 hari — cara itu (a) lambat untuk rentang panjang, dan (b) tetap
     MELEWATKAN gerhana pendek (terbukti: gerhana total 22 Jul 2028 hilang,
     dan gerhana penumbra tipis 18 Jul 2027 tidak tertangkap).

     Sekarang: cari dulu waktu Bulan baru & purnama (murah), lalu pindai
     halus (5-30 menit) hanya di sekitar waktu-waktu itu. Lebih cepat DAN
     lebih lengkap. */
  if (on('gerhana')) {
    /* -- 1a. kandidat: ekstrem elongasi Bulan -- */
    const kandidat = [];
    {
      const step = 0.5;
      let q0 = null, q1 = null;
      for (let jd = jd0 - 2; jd <= jd1 + 2; jd += step) {
        const f = moonPhase(jd);
        const el = f.elongasi;
        if (q0 !== null && q1 !== null) {
          const a = q0.el, b = q1.el, c = el;
          /* purnama (maksimum > 170) atau bulan baru (minimum < 10) */
          if ((b > a && b > c && b > 170) || (b < a && b < c && b < 10)) {
            kandidat.push(q1.jd);
          }
        }
        q0 = q1; q1 = { jd, el };
      }
    }
    /* -- 1b. pindai halus di sekitar tiap kandidat --
       Jendela ±1,1 hari (bukan ±0,65): puncak gerhana bisa terjadi hingga
       ~1 hari dari ekstrem elongasi — terbukti: gerhana Bulan total
       31 Des 2028 (puncak 16:59 UT) berada di luar jendela ±0,65 hari,
       sehingga terlewat seluruhnya.
       Langkah menyesuaikan rentang: rentang panjang tidak perlu resolusi
       super halus (dan tetap cepat). */
    const tahunRentang = (jd1 - jd0) / 365.25;
    const menitLangkah = tahunRentang <= 5 ? 5 : (tahunRentang <= 15 ? 12 : 30);
    const stepH = menitLangkah / 1440;
    const kontak = [];
    for (const t of kandidat) {
      for (let jd = t - 1.1; jd <= t + 1.1; jd += stepH) {
        if (jd < jd0 || jd > jd1) continue;
        const st = eclipseState(jd);
        if (st.solar) {
          kontak.push({ tipe: 'matahari', jenis: st.solar.jenis, jd,
                        mag: Math.abs(st.solar.magnitudo),
                        gam: Math.abs(st.solar.gammaKm) });
        }
        if (st.lunar) {
          kontak.push({ tipe: 'bulan', jenis: st.lunar.jenis, jd,
                        mag: Math.abs(st.lunar.magnitudo),
                        gam: Math.abs(st.lunar.gammaKm) });
        }
      }
    }
    /* -- 1c. kelompokkan per tipe (satu gerhana = satu rangkaian) -- */
    const grup = [];
    for (const tipe of ['matahari', 'bulan']) {
      const list = kontak.filter(k => k.tipe === tipe);
      let cur = null;
      for (const k of list) {
        if (cur && (k.jd - cur.akhir) < 0.4) {
          cur.akhir = k.jd;
          if (k.gam < cur.gam) {
            cur.gam = k.gam; cur.puncak = k.jd; cur.jenis = k.jenis; cur.mag = k.mag;
          }
        } else {
          if (cur) grup.push(cur);
          cur = { tipe, jenis: k.jenis, awal: k.jd, akhir: k.jd,
                  puncak: k.jd, mag: k.mag, gam: k.gam };
        }
      }
      if (cur) grup.push(cur);
    }
    for (const g of grup) {
      const ikon = g.tipe === 'matahari' ? '🌑' : '🔴';
      hasil.push({
        jenis: 'gerhana', ikon,
        judul: 'Gerhana ' + (g.tipe === 'matahari' ? 'Matahari ' : 'Bulan ') + g.jenis,
        detail: 'magnitudo puncak ' + g.mag.toFixed(3),
        tanggal: jdToDate(g.puncak), magnitudo: g.mag, jd: g.puncak,
        skor: 100,
      });
    }
  }

  /* ---- 2. OPOSISI & KONJUNGSI MATAHARI ---- */
  const planetKeys = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const planetNama = {
    mercury: 'Merkurius', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter',
    saturn: 'Saturnus', uranus: 'Uranus', neptune: 'Neptunus',
  };
  if (on('oposisi') || on('matahari')) {
    /* elongasi dihitung tiap 0.5 hari, lalu puncak dicari (naik->turun).
       Tanpa pencarian puncak, satu oposisi bisa muncul puluhan kali. */
    const step = 0.5;
    const prev = {};      /* elongasi sebelumnya per planet */
    const rising = {};    /* apakah sedang menanjak */
    for (let jd = jd0 - step; jd <= jd1 + step; jd += step) {
      for (const key of planetKeys) {
        const e = planetElongation(key, jd);
        if (!e) continue;
        const el = e.elongasi;
        const p = prev[key];
        if (p !== undefined) {
          const up = el > p;
          if (rising[key] === true && !up) {
            /* puncak elongasi = oposisi (bila besar) atau konjungsi atas
               (bila elongasi kecil — planet di balik Matahari) */
            if (el > 150 && on('oposisi') && jd >= jd0 && jd <= jd1) {
              hasil.push({
                jenis: 'oposisi', ikon: '✨',
                judul: planetNama[key] + ' di Oposisi',
                detail: 'paling terang & terdekat · elongasi ' + el.toFixed(1) + '°',
                tanggal: jdToDate(jd), jd, skor: 70 + el / 100,
              });
            } else if (el < 20 && key !== 'mercury' && key !== 'venus' &&
                       on('matahari') && jd >= jd0 && jd <= jd1) {
              hasil.push({
                jenis: 'matahari', ikon: '⊙',
                judul: planetNama[key] + ' di Konjungsi Matahari',
                detail: 'berada di balik Matahari · elongasi ' + el.toFixed(1) + '°',
                tanggal: jdToDate(jd), jd, skor: 45 + (20 - el) / 10,
              });
            }
          }
          rising[key] = up;
        }
        prev[key] = el;
      }
    }
  }

  /* ---- 3. KONJUNGSI PLANET-PLANET ----
     Hanya pasangan yang BENAR-BENAR TERLIHAT yang dicari: keduanya harus
     cukup terang (mag < 6, batas mata telanjang). Tanpa saringan ini,
     hasilnya didominasi pasangan tak menarik seperti Merkurius–Uranus
     (38 kali dalam 3 tahun) yang tak bisa dilihat mata tanpa alat. */
  if (on('konjungsi')) {
    /* magnitudo perkiraan terbaik tiap planet (oposisi) */
    const MAG = { mercury: -1.9, venus: -4.6, mars: -2.9, jupiter: -2.9,
                  saturn: 0.0, uranus: 5.7, neptune: 7.8 };
    const step = 0.5;
    const prevSep = {};
    const risingSep = {};
    for (let jd = jd0 - step; jd <= jd1 + step; jd += step) {
      const e = earthPositionKm(jd);
      for (let i = 0; i < planetKeys.length; i++) {
        for (let j = i + 1; j < planetKeys.length; j++) {
          const p1 = planetKeys[i], p2 = planetKeys[j];
          /* saringan keterlihatan: keduanya harus terang */
          if (MAG[p1] > 6 || MAG[p2] > 6) continue;
          const a = bodyPositionKm(p1, jd), b = bodyPositionKm(p2, jd);
          if (!a || !b) continue;
          const v1 = { x: a.x - e.x, y: a.y - e.y, z: a.z - e.z };
          const v2 = { x: b.x - e.x, y: b.y - e.y, z: b.z - e.z };
          const l1 = Math.hypot(v1.x, v1.y, v1.z), l2 = Math.hypot(v2.x, v2.y, v2.z);
          const dot = (v1.x*v2.x + v1.y*v2.y + v1.z*v2.z) / (l1 * l2);
          const sep = Math.acos(Math.max(-1, Math.min(1, dot))) / DEG;
          const kk = p1 + '|' + p2;
          const ps = prevSep[kk];
          if (ps !== undefined) {
            const turun = sep < ps;
            /* Puncak konjungsi = pemisahan MINIMUM: sebelumnya menurun
               (risingSep === false) dan sekarang mulai naik (!turun).
               BUG LAMA: syaratnya `risingSep === false && turun` = "sedang
               menurun DAN masih menurun" — bukan puncak, melainkan setiap
               langkah selama penurunan. Akibatnya satu konjungsi tercatat
               puluhan kali (uji validasi: 511 konjungsi dalam 3 tahun). */
            if (risingSep[kk] === false && !turun && ps < 5 &&
                jd >= jd0 && jd <= jd1) {
              hasil.push({
                jenis: 'konjungsi', ikon: '🪐',
                judul: 'Konjungsi ' + planetNama[p1] + '–' + planetNama[p2],
                detail: 'pemisahan ' + ps.toFixed(2) + '° — tampak berdekatan di langit',
                tanggal: jdToDate(jd), jd, skor: 55 + (5 - ps),
              });
            }
            risingSep[kk] = turun ? false : true;
          } else {
            risingSep[kk] = false;
          }
          prevSep[kk] = sep;
        }
      }
    }
  }

  /* ---- 4. HUJAN METEOR (puncak) ---- */
  if (on('meteor') && typeof METEOR_SHOWERS !== 'undefined') {
    const y0 = fromDate.getUTCFullYear(), y1 = toDate.getUTCFullYear();
    for (const ms of METEOR_SHOWERS) {
      for (let y = y0; y <= y1; y++) {
        const t = new Date(Date.UTC(y, ms.puncak.bulan - 1, ms.puncak.hari, 12, 0, 0));
        const jd = dateToJD(t);
        if (jd < jd0 || jd > jd1) continue;
        hasil.push({
          jenis: 'meteor', ikon: '☄️',
          judul: 'Puncak Hujan Meteor ' + ms.nama,
          detail: 'ZHR ~' + ms.zhr + '/jam · ' + ms.induk + ' · ' + ms.v_kms + ' km/s',
          tanggal: t, jd, skor: 60,
        });
      }
    }
  }

  /* ---- 5. BULAN BARU & PURNAMA ----
     PENTING: puncak elongasi harus dicari dengan MEMBANDINGKAN TETANGGA
     (a < b > c untuk purnama, a > b < c untuk bulan baru). Versi lama
     hanya memeriksa "naik lalu turun" pada langkah 0,25 hari sehingga satu
     purnama terdeteksi puluhan kali — uji validasi menemukan 85 "fase" per
     tahun, padahal seharusnya 12-13 purnama + 12-13 bulan baru. */
  if (on('fase')) {
    const step = 0.25;
    let p0 = null, p1 = null;
    for (let jd = jd0 - step; jd <= jd1 + step; jd += step) {
      const f = moonPhase(jd);
      const el = f.elongasi;
      if (p0 !== null && p1 !== null) {
        const a = p0.el, b = p1.el, c = el;
        if (b > a && b > c && b > 170 && p1.jd >= jd0 && p1.jd <= jd1) {
          hasil.push({
            jenis: 'fase', ikon: '🌕',
            judul: 'Purnama',
            detail: 'iluminasi ' + (f.iluminasi * 100).toFixed(0) + '%',
            tanggal: jdToDate(p1.jd), jd: p1.jd, skor: 35,
          });
        } else if (b < a && b < c && b < 10 && p1.jd >= jd0 && p1.jd <= jd1) {
          hasil.push({
            jenis: 'fase', ikon: '🌑',
            judul: 'Bulan Baru',
            detail: 'iluminasi ' + (f.iluminasi * 100).toFixed(0) + '%',
            tanggal: jdToDate(p1.jd), jd: p1.jd, skor: 35,
          });
        }
      }
      p0 = p1; p1 = { jd, el };
    }
  }

  /* ---- gabungkan kejadian berdekatan (satu peristiwa = satu baris) ---- */
  const gabung = [];
  for (const e of hasil) {
    const last = gabung[gabung.length - 1];
    if (last && last.jenis === e.jenis && last.judul === e.judul &&
        Math.abs(e.jd - last.jd) < 1.5) {
      if ((e.skor || 0) > (last.skor || 0)) {
        last.jd = e.jd; last.tanggal = e.tanggal;
        last.skor = e.skor; last.magnitudo = e.magnitudo;
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
        <div class="dp-section-title">Validitas model pada tanggal ini</div>
        <div class="temporal-badge" id="temporalBadge"></div>
      </div>

      <div class="dp-section">
        <div class="dp-section-title">Peristiwa saat ini</div>
        <div class="dp-events" id="dpEvents"></div>
      </div>

      <div class="dp-section">
        <div class="dp-section-title">Cari peristiwa langit</div>
        <div class="dp-chips" id="dpKinds"></div>
        <div class="dp-row dp-row-2">
          <input type="date" id="dpFrom" class="dp-input">
          <input type="date" id="dpTo" class="dp-input">
        </div>
        <button class="btn small" id="dpSearch">🔍 Cari Peristiwa</button>
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

  /* ---- chip pemilih jenis peristiwa ---- */
  {
    const box = $('dpKinds');
    box.innerHTML = Object.keys(EVENT_KINDS).map(k => {
      const it = EVENT_KINDS[k];
      return `<button class="dp-chip on" data-kind="${k}" title="${it.label}">` +
             `${it.ikon} ${it.label}</button>`;
    }).join('');
    box.querySelectorAll('.dp-chip').forEach(ch => {
      ch.addEventListener('click', () => {
        ch.classList.toggle('on');
        /* jangan biarkan semua mati — minimal satu harus aktif */
        if (!box.querySelector('.dp-chip.on')) ch.classList.add('on');
      });
    });
  }
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
  /* backdrop ikut muncul supaya di HP panel tidak "tenggelam" di antara
     kanvas, dan bisa ditutup dengan satu ketukan di luar panel */
  if (window.__syncBackdrop) window.__syncBackdrop();
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
  /* batasi rentang agar tidak membekukan browser. Rentang besar berarti
     ribuan titik perhitungan (0,5 hari/langkah × 7 planet × pasangan). */
  const hariRentang = (d1 - d0) / 86400000;
  if (hariRentang > 366 * 40) {
    $('dpResults').innerHTML = '<div class="dp-empty">Rentang maksimum 40 tahun</div>';
    return;
  }
  /* jenis yang dipilih pengguna (chip) */
  const kinds = [...$('dpKinds').querySelectorAll('.dp-chip.on')].map(c => c.dataset.kind);
  if (!kinds.length) {
    $('dpResults').innerHTML = '<div class="dp-empty">Pilih minimal satu jenis peristiwa</div>';
    return;
  }
  $('dpResults').innerHTML = '<div class="dp-empty">Menghitung… (rentang ' +
    (hariRentang / 365.25).toFixed(1) + ' tahun)</div>';
  /* jalankan setelah UI diperbarui supaya pesan "menghitung" terlihat */
  setTimeout(() => {
    const t0 = performance.now();
    const res = searchEvents(d0, d1, kinds);
    /* urutkan kronologis */
    res.sort((a, b) => a.jd - b.jd);
    datePanelState.searchResults = res;
    const ms = Math.round(performance.now() - t0);
    if (!res.length) {
      $('dpResults').innerHTML = '<div class="dp-empty">Tidak ada peristiwa di rentang ini</div>';
      return;
    }
    const MAX = 200;
    const shown = res.slice(0, MAX);
    const lebih = res.length - shown.length;
    $('dpResults').innerHTML =
      '<div class="dp-result-count">' + res.length + ' peristiwa ditemukan' +
      (lebih > 0 ? ' (menampilkan ' + MAX + ' terdekat)' : '') +
      ' · ' + ms + ' ms</div>' +
      shown.map((e, i) => `
      <div class="dp-result" data-idx="${i}">
        <span class="dp-ev-ikon">${e.ikon}</span>
        <span class="dp-ev-text">
          <b>${e.judul}</b>
          <i>${formatTanggalPendek(e.tanggal)}${e.detail ? ' · ' + e.detail : ''}</i>
        </span>
      </div>
    `).join('');
    $('dpResults').querySelectorAll('.dp-result').forEach(el => {
      el.addEventListener('click', () => {
        const e = shown[parseInt(el.dataset.idx, 10)];
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
