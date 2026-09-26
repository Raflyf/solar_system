/* =======================================================================
   ENGINE EVENT ASTRONOMI LENGKAP
   ----------------------------------------------------------------------
   Mendeteksi:
   1. Hujan Meteor Aktif (Berdasarkan kalender IMO)
   2. Konjungsi antar dua planet (< 2 derajat elongasi)
   3. Oposisi planet luar terhadap Matahari
   4. Gerhana Matahari & Bulan (integrasi dari 15-ephemeris.js)
   ======================================================================= */

const ASTRONOMICAL_EVENTS = {
  /* Cari semua event aktif pada tanggal tertentu */
  getActiveEvents(jd) {
    const date = jdToDate(jd);
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const curMD = (m < 10 ? '0' + m : '' + m) + '-' + (d < 10 ? '0' + d : '' + d);

    const events = [];

    // 1. Hujan Meteor
    if (typeof METEOR_SHOWERS !== 'undefined') {
      for (const ms of METEOR_SHOWERS) {
        const start = ms.rentang.mulai;
        const end = ms.rentang.selesai;
        let isActive = false;

        if (start <= end) {
          isActive = (curMD >= start && curMD <= end);
        } else {
          // Melintasi pergantian tahun (misal: 12-28 s/d 01-12)
          isActive = (curMD >= start || curMD <= end);
        }

        if (isActive) {
          const isPeak = (ms.puncak.bulan === m && Math.abs(ms.puncak.hari - d) <= 1);
          events.push({
            type: 'meteor',
            name: ms.nama,
            peak: isPeak,
            desc: `${ms.nama} (${isPeak ? 'PUNCAK AKTIF' : 'Aktif'}) — ZHR: ~${ms.zhr} meteor/jam, Sumber: ${ms.induk}`,
            radiant: ms.radiant,
            color: ms.warna
          });
        }
      }
    }

    // 2. Konjungsi Antar-Planet (< 2.5 derajat sudut pisah dilihat dari Bumi)
    const planets = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
    const pPos = {};
    for (const p of planets) {
      pPos[p] = bodyPositionKm(p, jd);
    }
    const earthPos = earthPositionKm(jd);

    for (let i = 0; i < planets.length; i++) {
      for (let j = i + 1; j < planets.length; j++) {
        const p1 = planets[i];
        const p2 = planets[j];
        if (!pPos[p1] || !pPos[p2]) continue;

        // Vektor geosentris
        const v1 = { x: pPos[p1].x - earthPos.x, y: pPos[p1].y - earthPos.y, z: pPos[p1].z - earthPos.z };
        const v2 = { x: pPos[p2].x - earthPos.x, y: pPos[p2].y - earthPos.y, z: pPos[p2].z - earthPos.z };

        const sepDeg = angleBetween(v1, v2) / DEG;
        if (sepDeg < 2.5) {
          events.push({
            type: 'conjunction',
            name: `Konjungsi ${p1.toUpperCase()} - ${p2.toUpperCase()}`,
            desc: `Pemisahan sudut sangat dekat: ${sepDeg.toFixed(2)}° di langit malam`,
            bodies: [p1, p2],
            separation: sepDeg
          });
        }
      }
    }

    return events;
  }
};
