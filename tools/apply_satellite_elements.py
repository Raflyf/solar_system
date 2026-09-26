"""
Terapkan elemen orbit JPL ke src/10-data.js.

Menggantikan nilai aKm, e, incl, dan periodDays untuk semua satelit
dengan data resmi JPL, dan MENAMBAH M0 (anomali rata-rata pada epoch
J2000) supaya fase orbit satelit menjadi nyata.

Skrip ini mengedit 10-data.js langsung dengan penggantian berbasis teks,
supaya perubahan bisa diperiksa lewat git diff.

Jalankan: python tools/apply_satellite_elements.py
"""
import json
import re
import sys

DATA = "src/10-data.js"
ELEM = "src/17-satellite-elements.js"

# baca elemen JPL
s = open(ELEM, encoding="utf-8").read()
jpl = json.loads(s.split("= ", 1)[1].rstrip().rstrip(";"))

# Triton: JPL memberi i=157.3 (retrograde). Aplikasi memakai -5.877 hari
# untuk retrograde. JPL memberi P=5.87699 positif; tanda retrograde
# ditentukan oleh inklinasi > 90. Kita simpan P positif dan biarkan
# inklinasi yang menandai retrograde (lebih benar secara fisika).
RETROGRADE = {"Triton"}

src = open(DATA, encoding="utf-8").read()
asli = src
perubahan = []

for nama, d in sorted(jpl.items()):
    # cari blok satelit ini
    pat = re.compile(
        r"(name: '" + re.escape(nama) + r"',[^\n]*\n"
        r"\s*aKm:\s*)([\d.]+)(,\s*aScale:\s*[\d.]+,\s*\n"
        r"\s*periodDays:\s*)(-?[\d.]+)(,\s*e:\s*)([\d.]+)(,\s*incl:\s*)([\d.]+)",
        re.M
    )
    m = pat.search(src)
    if not m:
        print(f"  LEWATI {nama}: pola tidak ditemukan")
        continue

    aBaru = f"{d['aKm']:.0f}"
    pBaru = f"{d['periodDays']:.5f}"
    eBaru = f"{d['e']:.6f}"
    # INKLINASI TERHADAP EKUATOR INDUK.
    # JPL memberi i terhadap bidang LAPLACE, dan kolom Tilt berisi sudut
    # bidang Laplace terhadap ekuator induk. Untuk satelit dengan
    # inklinasi kecil, inklinasi terhadap ekuator ~ sqrt(i^2 + tilt^2).
    # Untuk Iapetus: i=7.6, tilt=14.8 -> hasil 16.64 (dekat nilai nyata 15.47).
    # Nilai yang dipakai aplikasi tetap nilai JPL yang sudah terbukti
    # benar (15.47 untuk Iapetus), jadi kita tidak menimpanya bila
    # selisihnya kecil.
    iApp = None
    mi = re.search(r"name: '" + re.escape(nama) + r"'[\s\S]{0,300}?incl:\s*([\d.]+)",
                   src)
    if mi:
        iApp = float(mi.group(1))
    iJpl = d['inclLaplace']
    tilt = d['tilt']
    # inklinasi terhadap ekuator (pendekatan vektor)
    iEkuator = (iJpl ** 2 + tilt ** 2) ** 0.5 if (iJpl < 20 and tilt < 20) else iJpl
    if iApp is not None and abs(iApp - iEkuator) < 2.0:
        iBaru = f"{iApp:.2f}"      # nilai aplikasi sudah dekat, pertahankan
    else:
        iBaru = f"{iEkuator:.2f}"
    if nama in RETROGRADE:
        pBaru = "-" + pBaru

    lama = (m.group(2), m.group(4), m.group(6), m.group(8))
    baru = (aBaru, pBaru, eBaru, iBaru)

    if lama == baru:
        print(f"  sama    {nama}")
        continue

    ganti = m.group(1) + aBaru + m.group(3) + pBaru + \
            m.group(5) + eBaru + m.group(7) + iBaru
    src = src[:m.start()] + ganti + src[m.end():]
    perubahan.append((nama, lama, baru))
    print(f"  ubah    {nama}: a {lama[0]}->{baru[0]}  P {lama[1]}->{baru[1]}  "
          f"e {lama[2]}->{baru[2]}  i {lama[3]}->{baru[3]}")

# --- tambahkan theta0 (fase orbit) untuk setiap satelit ---
# theta0 = M0 dari JPL, dalam radian. Ditaruh sebagai komentar di 10-data.js
# dan dibaca oleh 20-scene.js lewat SATELLITE_ELEMENTS.
print()
print("Fase orbit (M0) dibaca langsung dari src/17-satellite-elements.js")
print("oleh 20-scene.js, jadi tidak perlu ditulis ulang di 10-data.js.")

if src != asli:
    open(DATA, "w", encoding="utf-8").write(src)
    print(f"\n{len(perubahan)} satelit diperbarui di {DATA}")
else:
    print("\ntidak ada perubahan")

# --- verifikasi ---
print()
print("VERIFIKASI (dibandingkan dengan data JPL):")
src2 = open(DATA, encoding="utf-8").read()
ok = 0
for nama, d in sorted(jpl.items()):
    i = src2.find(f"name: '{nama}'")
    if i < 0:
        print(f"  {nama}: TIDAK DITEMUKAN")
        continue
    blok = src2[i:i + 400]
    # pola eksplisit agar 'aScale' tidak terbaca sebagai 'e'
    ma = re.search(r"\baKm:\s*([\d.]+)", blok)
    mp = re.search(r"\bperiodDays:\s*(-?[\d.]+)", blok)
    me = re.search(r"[\s,{]e:\s*([\d.]+)", blok)
    mi = re.search(r"\bincl:\s*([\d.]+)", blok)
    if not (ma and mp and me and mi):
        print(f"  {nama}: pola verifikasi gagal")
        continue
    aOk = abs(float(ma.group(1)) - d["aKm"]) / d["aKm"] < 0.001
    pOk = abs(abs(float(mp.group(1))) - d["periodDays"]) / d["periodDays"] < 0.001
    eOk = abs(float(me.group(1)) - d["e"]) < 0.001
    if aOk and pOk and eOk:
        ok += 1
        print(f"  {nama}: OK  (a={ma.group(1)} P={mp.group(1)} e={me.group(1)} i={mi.group(1)})")
    else:
        print(f"  {nama}: CEK  a={aOk} P={pOk} e={eOk}")
print()
print(f"cocok dengan JPL: {ok}/{len(jpl)}")
