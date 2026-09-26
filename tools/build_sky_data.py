"""
Bangun ulang SEMUA data langit dari nol.

Dijalankan berurutan karena ada ketergantungan urutan:
  1. process_stars.py          -> src/12-stars-data.js  (bintang)
  2. process_constellations.py -> src/13-constellations-data.js (rasi bintang)

Langkah 2 HARUS setelah langkah 1: garis rasi bintang memakai INDEKS bintang
dari larik yang dihasilkan langkah 1 (STARS_LABELED lalu STARS_OTHER).

Berkas mentah yang dibutuhkan di assets_raw/:
  - hyg_v38.csv.gz                (13 MB, katalog HYG v3.8)
  - constellation_lines_hip.txt   (9 KB, garis 86 rasi bintang)

Kalau berkas mentah belum ada, skrip ini mengunduhnya sendiri.

Jalankan:  python tools/build_sky_data.py
"""
import os
import subprocess
import sys

RAW = "assets_raw"
FILES = {
    "hyg_v38.csv.gz": (
        "https://github.com/astronexus/HYG-Database/raw/main/hyg/v3/hyg_v38.csv.gz",
        "katalog bintang HYG v3.8 (Astronexus, CC BY-SA 4.0)"),
    "constellation_lines_hip.txt": (
        "https://raw.githubusercontent.com/johanley/constellation-lines/master/output/constellation-lines-hip.utf8",
        "garis 86 rasi bintang (johanley/constellation-lines, MIT)"),
}


def unduh():
    os.makedirs(RAW, exist_ok=True)
    for nama, (url, ket) in FILES.items():
        path = os.path.join(RAW, nama)
        if os.path.exists(path) and os.path.getsize(path) > 1000:
            print(f"  ada    {nama}  ({os.path.getsize(path)/1048576:.1f} MB)")
            continue
        print(f"  unduh  {nama}  <- {ket}")
        # curl dipakai supaya progres terlihat dan tahan koneksi lambat
        r = subprocess.run(["curl", "-s", "-L", "-m", "900", "-o", path, url])
        if r.returncode != 0 or not os.path.exists(path):
            print(f"  GAGAL mengunduh {nama}")
            return False
        print(f"  selesai {nama}  ({os.path.getsize(path)/1048576:.1f} MB)")
    return True


def jalankan(skrip):
    print(f"\n--- {skrip} ---")
    r = subprocess.run([sys.executable, os.path.join("tools", skrip)])
    if r.returncode != 0:
        print(f"  GAGAL: {skrip} keluar dengan kode {r.returncode}")
        return False
    return True


def main():
    print("=" * 70)
    print("BANGUN DATA LANGIT DARI NOL")
    print("=" * 70)

    print("\n1. Siapkan berkas mentah")
    if not unduh():
        sys.exit(1)

    print("\n2. Olah data")
    if not jalankan("process_stars.py"):
        sys.exit(1)
    if not jalankan("process_constellations.py"):
        sys.exit(1)

    print("\n3. Hasil")
    for f in ["src/12-stars-data.js", "src/13-constellations-data.js"]:
        if os.path.exists(f):
            print(f"  {f}  {os.path.getsize(f)/1024:.1f} KB")
        else:
            print(f"  {f}  TIDAK ADA")
            sys.exit(1)

    print("\nSelesai. Jalankan 'node build.js' untuk menyusun index.html.")


if __name__ == "__main__":
    main()
