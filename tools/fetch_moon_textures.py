"""
Unduh peta permukaan asli untuk bulan-bulan (NASA/USGS via Wikimedia Commons),
lalu jadikan tekstur ekuirektangular 2:1 siap pakai.
"""
import os, json, urllib.parse, subprocess, io
from PIL import Image

UA = "Mozilla/5.0 (compatible; solar-system-asset-fetch/1.0; +https://github.com/Raflyf/solar_system)"
RAW = "assets_raw"
OUT = "assets_src"
os.makedirs(RAW, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

# nama berkas di Commons -> nama keluaran
MOON_FILES = {
    "File:Io from Galileo and Voyager missions.jpg":            "io.jpg",
    "File:Map of Ganymede by Björn Jónsson.jpg":                "ganymede.jpg",
    "File:Callisto USGS map.jpg":                               "callisto.jpg",
    "File:2009 Map of Titan cylindrical projection.jpg":        "titan.jpg",
    "File:Color map of Rhea PIA18438 Nov. 2014.jpg":            "rhea.jpg",
    "File:Titania map JPL USGS.jpg":                            "titania.jpg",
    "File:Triton map no grid.jpg":                              "triton.jpg",
    "File:USGS-Phobos-MarsMoon-Map.png":                        "phobos.png",
    "File:Iapetus May 2008 PIA11116 moon only.jpg":             "iapetus.jpg",
}

def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    out = subprocess.run(["curl", "-s", "-A", UA, "-m", "40", url],
                         capture_output=True, text=True).stdout
    return json.loads(out)

def get_info(title):
    d = api({"action": "query", "titles": title, "prop": "imageinfo",
             "iiprop": "url|size|mime", "format": "json"})
    for pid, pg in d["query"]["pages"].items():
        if "imageinfo" in pg:
            return pg["imageinfo"][0]
    return None

def download(url, path):
    subprocess.run(["curl", "-s", "-A", UA, "-m", "300", "-L", "-o", path, url], check=True)
    return os.path.getsize(path)

def to_equirect(src, dst, width=2048):
    """Potong jadi 2:1 (buang baris kosong), lalu skala."""
    im = Image.open(src).convert("RGB")
    w, h = im.size
    # banyak peta USGS punya batas/garis; ambil bagian tengah yang 2:1
    target_h = w // 2
    if h > target_h:
        top = (h - target_h) // 2
        im = im.crop((0, top, w, top + target_h))
    # skala ke lebar maksimum
    if w > width:
        im = im.resize((width, width // 2), Image.LANCZOS)
    im.save(dst, "JPEG", quality=90, optimize=True, progressive=True)
    return im.size

print("=" * 64)
print("MENGUNDUH PETA PERMUKAAN BULAN (NASA/USGS)")
print("=" * 64)
ok, fail = [], []
for title, outname in MOON_FILES.items():
    info = get_info(title)
    if not info:
        print(f"  GAGAL  {title}")
        fail.append(title); continue
    ext = os.path.splitext(info["url"])[1]
    raw = os.path.join(RAW, "_moon_" + outname.replace(".jpg", "").replace(".png", "") + ext)
    try:
        sz = download(info["url"], raw)
        dst = os.path.join(OUT, outname)
        dim = to_equirect(raw, dst)
        print(f"  OK  {outname:14s} {info['width']}x{info['height']} -> {dim[0]}x{dim[1]}  {os.path.getsize(dst)/1048576:.2f} MB")
        ok.append(outname)
    except Exception as e:
        print(f"  GAGAL  {title}: {e}")
        fail.append(title)

print()
print(f"berhasil: {len(ok)}  gagal: {len(fail)}")
if fail:
    for f in fail: print("   -", f)
