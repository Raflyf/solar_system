"""
Olah katalog bintang HYG v3 (119.614 bintang nyata) menjadi data untuk aplikasi.

Sumber: HYG Database v3.8 (Astronexus) — gabungan Hipparcos, Yale BSC, Gliese.
  https://github.com/astronexus/HYG-Database
Kolom: id,hip,hd,hr,gl,bf,proper,ra,dec,dist,pmra,pmdec,rv,mag,absmag,spect,
       ci,x,y,z,vx,vy,vz,rarad,decrad,pmrarad,pmdecrad,bayer,flam,con,comp,
       comp_primary,base,lum,var,var_min,var_max

Yang diambil:
  - Bintang terang (mag < 6.5) — yang bisa dilihat mata telanjang
  - Bintang bernama (proper name) — untuk label
  - Posisi 3D nyata (x, y, z dalam parsec) dari kolom x,y,z
  - Warna nyata dari indeks warna B-V (ci)
  - Luminositas untuk ukuran tampilan
"""
import gzip, csv, json, math, os

SRC = "assets_raw/hyg_v38.csv.gz"
OUT_JSON = "assets/stars.json"
OUT_JS = "src/12-stars-data.js"

# batas magnitudo: 6.5 = batas mata telanjang di langit gelap
MAG_LIMIT = 6.5

rows = []
with gzip.open(SRC, "rt", encoding="utf-8", errors="replace") as f:
    reader = csv.DictReader(f)
    for r in reader:
        try:
            mag = float(r["mag"])
        except (ValueError, TypeError):
            continue
        if mag > MAG_LIMIT:
            continue
        try:
            x = float(r["x"]); y = float(r["y"]); z = float(r["z"])
            dist = float(r["dist"])
        except (ValueError, TypeError):
            continue
        if not (math.isfinite(x) and math.isfinite(y) and math.isfinite(z)):
            continue
        # buang bintang dengan jarak tidak masuk akal (>100.000 ly)
        if dist > 30600 or dist <= 0:
            continue
        try:
            ci = float(r["ci"]) if r["ci"] else None
        except ValueError:
            ci = None
# Proper motion: pmra = mas/yr (sudah dikali cos(dec) di HYG),
        # pmdec = mas/yr. Konversi ke rad/tahun untuk aplikasi runtime.
        try:
            pmra = float(r["pmra"]) if r["pmra"] else 0.0
            pmdec = float(r["pmdec"]) if r["pmdec"] else 0.0
        except ValueError:
            pmra = pmdec = 0.0
        # mas/yr -> rad/yr: 1 mas = 4.848136811e-9 rad
        MAS_TO_RAD = 4.848136811e-9
        pmra_rad = pmra * MAS_TO_RAD
        pmdec_rad = pmdec * MAS_TO_RAD

        rows.append({
            "hip": r["hip"] or "",
            "nama": (r["proper"] or "").strip(),
            "bayer": (r["bayer"] or "").strip(),
            "con": (r["con"] or "").strip(),
            "ra": float(r["ra"]), "dec": float(r["dec"]),
            "dist": dist,
            "mag": mag,
            "ci": ci,
            "x": x, "y": y, "z": z,
            "spect": (r["spect"] or "").strip(),
            "lum": float(r["lum"]) if r["lum"] else None,
            "pmra": round(pmra_rad, 15),
            "pmdec": round(pmdec_rad, 15),
        })

print(f"bintang terang (mag <= {MAG_LIMIT}): {len(rows)}")

# --- statistik ---
bernama = [r for r in rows if r["nama"]]
print(f"  dengan nama resmi: {len(bernama)}")
print(f"  contoh: {', '.join(r['nama'] for r in bernama[:10])}")

# --- konversi B-V ke warna RGB (aproksimasi ala Mitchell Charity / B-V tabel) ---
def bv_to_rgb(bv):
    if bv is None:
        return (255, 255, 255)
    bv = max(-0.4, min(2.0, bv))
    # tabel titik acuan (B-V -> suhu -> RGB)
    stops = [
        (-0.40, (155, 176, 255)),
        (0.00, (170, 191, 255)),
        (0.40, (202, 215, 255)),
        (0.65, (248, 247, 255)),
        (0.85, (255, 244, 234)),
        (1.05, (255, 235, 205)),
        (1.30, (255, 215, 176)),
        (1.60, (255, 190, 140)),
        (2.00, (255, 165, 110)),
    ]
    for i in range(len(stops) - 1):
        b0, c0 = stops[i]
        b1, c1 = stops[i + 1]
        if bv <= b1:
            t = (bv - b0) / (b1 - b0) if b1 > b0 else 0
            t = max(0.0, min(1.0, t))
            return tuple(int(round(c0[k] + (c1[k] - c0[k]) * t)) for k in range(3))
    return stops[-1][1]

# --- siapkan data keluaran ---
# Simpan dalam parsek (satuan astronomi HYG). 1 pc = 206264.806 AU.
# Aplikasi memakai 1 unit = radius Bumi = 6371 km. Untuk bintang, jarak
# sangat besar sehingga diringkas: simpan sebagai satuan khusus
# (1 satuan bintang = 1 tahun cahaya) supaya presisi float tetap baik.
LY_PER_PC = 3.261563777
AU_KM = 149597870.7
RAD_KM = 6371.0
KM_PER_LY = 9.4607304725808e12

stars = []
for r in rows:
    # posisi dari parsek -> tahun cahaya
    xl = r["x"] * LY_PER_PC
    yl = r["y"] * LY_PER_PC
    zl = r["z"] * LY_PER_PC
    rgb = bv_to_rgb(r["ci"])
    # perkuat saturasi: warna B-V asli cukup halus, tapi pada layar kecil
    # warna perlu sedikit didorong supaya perbedaan biru/merah terlihat
    avg = (rgb[0] + rgb[1] + rgb[2]) / 3.0
    rgb = tuple(max(0, min(255, int(round(avg + (c - avg) * 1.45)))) for c in rgb)
    stars.append({
        "n": r["nama"] or None,
        "b": r["bayer"] or None,
        "c": r["con"] or None,
        "m": round(r["mag"], 2),
        "x": round(xl, 3), "y": round(yl, 3), "z": round(zl, 3),
        "rgb": rgb,
        "s": r["spect"][:12] or None,
        "pmra": r["pmra"],
        "pmdec": r["pmdec"],
    })

# --- susun untuk JS ---
# Format ringkas agar berkas tidak terlalu besar:
#   nama|bayer|con|mag|x|y|z|r,g,b|spect
# Bintang tanpa nama/bayer/con tetap disertakan (tanpa label).
print(f"\nmenyusun {len(stars)} bintang…")

# pisahkan: yang bernama (dapat label) vs yang tidak
bernama_out = []
lain_out = []
for s in stars:
    if s["n"] or s["b"]:
        bernama_out.append(s)
    else:
        lain_out.append(s)

print(f"  dengan label: {len(bernama_out)}")
print(f"  tanpa label : {len(lain_out)}")

# Data bintang untuk JS (dipadatkan)
def pack(s):
    rgb = s["rgb"]
    # Format: [nama, bayer, con, mag, x, y, z, r, g, b, spect, pmra, pmdec]
    # pmRA/pmDec dalam rad/tahun, dibulatkan ke 12 digit
    return [
        s["n"] or "", s["b"] or "", s["c"] or "",
        s["m"], s["x"], s["y"], s["z"],
        rgb[0], rgb[1], rgb[2],
        s["s"] or "",
        round(s.get("pmra", 0.0), 12),
        round(s.get("pmdec", 0.0), 12),
    ]

data = {
    "lyPerUnit": 1.0,          # 1 satuan bintang = 1 tahun cahaya
    "count": len(stars),
    "labeled": [pack(s) for s in bernama_out],
    "other": [pack(s) for s in lain_out],
}

os.makedirs("assets", exist_ok=True)
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(data, f, separators=(",", ":"))
print(f"\ntersimpan: {OUT_JSON}  {os.path.getsize(OUT_JSON)/1048576:.2f} MB")

# JS versi (untuk dibundel ke index.html) — hanya yang bernama + sekumpulan
# bintang terang, supaya index.html tidak membengkak
with open(OUT_JS, "w", encoding="utf-8") as f:
    f.write("/* Data bintang nyata dari katalog HYG v3.8 (Hipparcos/Yale/Gliese).\n")
    f.write(f"   {len(stars)} bintang dengan magnitudo <= {MAG_LIMIT} (mata telanjang).\n")
    f.write("   Posisi nyata dalam tahun cahaya, warna dari indeks B-V.\n")
    f.write("   Sumber: https://github.com/astronexus/HYG-Database (CC BY-SA 4.0) */\n")
    f.write("const STARS_LABELED = ")
    json.dump([pack(s) for s in bernama_out], f, separators=(",", ":"))
    f.write(";\n\n")
    f.write("const STARS_OTHER = ")
    json.dump([pack(s) for s in lain_out], f, separators=(",", ":"))
    f.write(";\n")
print(f"tersimpan: {OUT_JS}  {os.path.getsize(OUT_JS)/1048576:.2f} MB")

# --- garis rasi bintang ---
# DIOLAH OLEH SKRIP TERPISAH: tools/process_constellations.py
#
# Dulu kode rasi bintang ada di sini juga, tapi selalu gagal dengan
# KeyError: 'hip' — karena variabel `stars` di skrip ini berisi dict
# dengan key "n"/"b"/"c" (sudah dipadatkan untuk keluaran JS), bukan
# baris CSV mentah yang punya kolom "hip". Akibatnya skrip ini selalu
# berakhir dengan traceback walau data bintangnya sendiri sudah tersimpan.
#
# Perbaikan: kode rasi bintang dipindah sepenuhnya ke
# tools/process_constellations.py, yang membaca CSV langsung sehingga
# nomor HIP masih tersedia.
print("\nLANGKAH BERIKUTNYA: jalankan  python tools/process_constellations.py")
print("  (mengolah 86 garis rasi bintang — perlu nomor HIP dari CSV mentah)")

