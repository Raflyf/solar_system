"""
Olah elemen orbit satelit dari JPL menjadi data untuk aplikasi.

Sumber: JPL Solar System Dynamics — Planetary Satellite Mean Elements
  https://ssd.jpl.nasa.gov/sats/elem/
  Referensi: JPL, "Planetary Satellite Mean Orbital Parameters"
  Ephemeris: JUP365 (Jupiter), SAT441 (Saturnus), URA115 (Uranus),
             NEP097 (Neptunus), MAR099 (Mars)

Kolom yang tersedia:
  a       = sumbu semi-mayor (km)
  e       = eksentrisitas
  omega   = argumen periapsis (derajat)
  M       = anomali rata-rata pada epoch (derajat)  <- INI YANG KITA BUTUH
  i       = inklinasi terhadap bidang Laplace (derajat)
  node    = bujur simpul naik (derajat)
  P       = periode orbit (hari)
  R.A.    = asensio rekta kutub Laplace (derajat)
  Dec.    = deklinasi kutub Laplace (derajat)
  Tilt    = kemiringan bidang Laplace terhadap bidang ekuator induk

Anomali rata-rata M pada epoch J2000 inilah yang menggantikan theta0 = 0
di aplikasi, sehingga fase orbit setiap satelit menjadi NYATA.
"""
import re, json, os, html

SRC = "assets_raw/jpl_sats_elem.html"
OUT = "src/17-satellite-elements.js"

# satelit yang dipakai aplikasi -> nama di tabel JPL
TARGET = {
    'Bulan':    None,          # Bulan Bumi sudah pakai teori Meeus presisi
    'Phobos':   'Phobos',
    'Deimos':   'Deimos',
    'Io':       'Io',
    'Europa':   'Europa',
    'Ganymede': 'Ganymede',
    'Callisto': 'Callisto',
    'Titan':    'Titan',
    'Rhea':     'Rhea',
    'Iapetus':  'Iapetus',
    'Titania':  'Titania',
    'Triton':   'Triton',
}

# --- baca tabel HTML ---
raw = open(SRC, encoding='utf-8', errors='replace').read()

# ambil semua baris <tr>...</tr> (tanpa atribut, karena baris data polos)
baris = re.findall(r'<tr>(.*?)</tr>', raw, re.S | re.I)
print(f"baris tabel: {len(baris)}")

data = {}
for b in baris:
    sel = re.findall(r'<td[^>]*>(.*?)</td>', b, re.S | re.I)
    if len(sel) < 16:
        continue
    def bersih(x):
        x = re.sub(r'<[^>]+>', '', x)
        return html.unescape(x).strip()
    s = [bersih(x) for x in sel]

    # KOLOM TABEL JPL (diverifikasi dari header HTML):
    #   0=ID  1=Planet  2=Satellite  3=Code  4=Ephemeris  5=Frame  6=Epoch
    #   7=a(km)  8=e  9=omega  10=M  11=i  12=node  13=P(days)
    #   14=P_apsis(yr)  15=P_node(yr)  16=R.A.  17=Dec.  18=Tilt  19=Ref
    #
    # KESALAHAN YANG PERNAH TERJADI: kolom 14 dan 15 (P_apsis, P_node)
    # sempat terlewat, sehingga R.A. terbaca sebagai Tilt dan P_apsis
    # terbaca sebagai R.A. Parser sekarang memakai indeks yang benar.
    nama = s[2]
    if nama not in TARGET.values():
        continue
    try:
        def f(x):
            """ambil float, kosong -> 0"""
            x = x.strip()
            return float(x) if x else 0.0
        data[nama] = {
            'planet': s[1],
            'aKm': f(s[7]),
            'e': f(s[8]),
            'omega': f(s[9]),
            'M0': f(s[10]),
            'inclLaplace': f(s[11]),
            'node': f(s[12]),
            'periodDays': f(s[13]),
            'pApsisYr': f(s[14]),
            'pNodeYr': f(s[15]),
            'poleRA': f(s[16]),
            'poleDec': f(s[17]),
            'tilt': f(s[18]),
            'ephemeris': s[4],
            'epoch': s[6],
        }
    except (ValueError, IndexError) as ex:
        print(f"  lewati {nama}: {ex}  (sel={s[7:20]})")

print(f"satelit terbaca: {len(data)}")
print()

# --- tampilkan dan bandingkan dengan data aplikasi ---
print(f"{'satelit':10s} {'a (km)':>10s} {'e':>8s} {'M0':>8s} {'iLap':>7s} {'Tilt':>7s} {'P (hari)':>10s}  sumber")
print('-' * 72)
for nama in TARGET:
    if nama not in data:
        continue
    d = data[nama]
    print(f"{nama:10s} {d['aKm']:10.0f} {d['e']:8.4f} {d['M0']:8.2f} {d['inclLaplace']:7.2f} {d['tilt']:7.2f} "
          f"{d['periodDays']:10.5f}  {d['ephemeris']}")

# --- tulis ke JS ---
with open(OUT, 'w', encoding='utf-8') as f:
    f.write("/* Elemen orbit satelit dari JPL Solar System Dynamics.\n")
    f.write("   Sumber: https://ssd.jpl.nasa.gov/sats/elem/\n")
    f.write("   Setiap satelit punya anomali rata-rata (M0) pada epoch J2000,\n")
    f.write("   sehingga fase orbitnya NYATA — bukan 0 seperti sebelumnya.\n")
    f.write("   Kolom: aKm, e, omega, M0, incl, node, periodDays, poleRA, poleDec, tilt\n")
    f.write("   Satelit Bumi (Bulan) tidak disertakan karena sudah memakai\n")
    f.write("   teori Meeus bab 47 yang jauh lebih presisi. */\n")
    f.write("const SATELLITE_ELEMENTS = ")
    json.dump(data, f, indent=1, sort_keys=True)
    f.write(";\n")
print()
print(f"tersimpan: {OUT}  {os.path.getsize(OUT)/1024:.1f} KB")
