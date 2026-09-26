"""Olah garis rasi bintang (86 rasi resmi IAU) menjadi data JS."""
import gzip, csv, json, math, os

SRC = "assets_raw/hyg_v38.csv.gz"
LINES = "assets_raw/constellation_lines_hip.txt"
MAG_LIMIT = 6.5

# baca katalog dan simpan nomor HIP -> indeks
rows = []
with gzip.open(SRC, "rt", encoding="utf-8", errors="replace") as f:
    for r in csv.DictReader(f):
        try:
            mag = float(r["mag"])
            x = float(r["x"]); y = float(r["y"]); z = float(r["z"])
            dist = float(r["dist"])
        except (ValueError, TypeError):
            continue
        if mag > MAG_LIMIT:
            continue
        if not (math.isfinite(x) and math.isfinite(y) and math.isfinite(z)):
            continue
        if dist > 30600 or dist <= 0:
            continue
        rows.append(r)

print(f"bintang: {len(rows)}")

# urutan HARUS sama dengan tools/process_stars.py:
# yang bernama dulu, lalu yang tidak
bernama = [r for r in rows if (r["proper"] or "").strip() or (r["bayer"] or "").strip()]
lain = [r for r in rows if not ((r["proper"] or "").strip() or (r["bayer"] or "").strip())]
print(f"  bernama: {len(bernama)}   lain: {len(lain)}")

# peta HIP -> indeks global (labeled dulu, lalu other)
hip_index = {}
for i, r in enumerate(bernama):
    if r["hip"]:
        hip_index[str(r["hip"])] = i
offset = len(bernama)
for i, r in enumerate(lain):
    if r["hip"]:
        hip_index[str(r["hip"])] = offset + i

# baca garis rasi
constellations = []
with open(LINES, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or "=" not in line:
            continue
        nama, rest = line.split("=", 1)
        nama = nama.strip()
        segs = []
        for seg in rest.split(";"):
            seg = seg.strip().strip("[]")
            if not seg:
                continue
            try:
                hips = [int(x.strip()) for x in seg.split(",") if x.strip()]
            except ValueError:
                continue
            idxs = [hip_index.get(str(h)) for h in hips]
            idxs = [i for i in idxs if i is not None]
            if len(idxs) >= 2:
                segs.append(idxs)
        if segs:
            constellations.append({"nama": nama, "segments": segs})

print(f"rasi bintang: {len(constellations)}")
tot = sum(len(c["segments"]) for c in constellations)
print(f"  total segmen garis: {tot}")

# daftar nama rasi untuk label
nama_rasi = sorted(c["nama"] for c in constellations)
print(f"  contoh: {', '.join(nama_rasi[:12])}")

with open("src/13-constellations-data.js", "w", encoding="utf-8") as f:
    f.write("/* Garis rasi bintang — 86 rasi resmi IAU.\n")
    f.write("   Sumber: https://github.com/johanley/constellation-lines (MIT)\n")
    f.write("   Indeks mengacu ke larik gabungan: STARS_LABELED lalu STARS_OTHER. */\n")
    f.write("const CONSTELLATIONS = ")
    json.dump(constellations, f, separators=(",", ":"))
    f.write(";\n")
print(f"\ntersimpan: src/13-constellations-data.js  {os.path.getsize('src/13-constellations-data.js')/1024:.1f} KB")
