#!/usr/bin/env python3
"""Cari layer tile NASA Trek (trek.nasa.gov) yang tersedia untuk tiap planet.

NASA Trek adalah layanan peta resmi NASA (bagian dari Solar System Treks).
Sumber: https://trek.nasa.gov/ — domain publik.

Jalankan: python tools/probe_trek.py
"""
import urllib.request, urllib.error, re, sys

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')

# Kandidat layer per planet (nama dari katalog NASA Trek)
CANDIDATES = {
    'Mars': [
        'Mars_Viking_MDIM21_ClrMosaic_global_232m',
        'Mars_MGS_MOLA_ClrShade_merge_global_463m',
        'Mars_MGS_MOLA_DEM_mosaic_global_463m',
        'Mars_HRSC_MOLA_BlendDEM_Global_200mp',
    ],
    'Moon': [
        'LRO_WAC_Mosaic_global_303ppd_v02',
        'LRO_WAC_Mosaic_global_100m_v01',
        'LRO_LOLA_ClrShade_Global_128ppd_v04',
        'LRO_NAC_Mosaic_global_100cm',
    ],
    'Mercury': [
        'MESSENGER_MDIS_Basemap_LOI_Avg_8ppd',
        'MESSENGER_MDIS_Basemap_LOI_Avg_32ppd',
        'MESSENGER_MDIS_Basemap_LOI_Avg_64ppd',
    ],
    'Venus': [
        'Magellan_Global_Mosaic_4641m',
        'Magellan_Global_Mosaic_75m',
    ],
    'Vesta': ['Vesta_Dawn_Clr_Global_256ppd'],
    'Ceres': ['Ceres_Dawn_Clr_Global_256ppd'],
    'Io':    ['Io_GalileoSSI_Voyager_Global_Mosaic_1km'],
    'Europa':['Europa_Voyager_GalileoSSI_global_625m'],
    'Ganymede': ['Ganymede_Voyager_GalileoSSI_global_1km'],
    'Callisto': ['Callisto_Voyager_GalileoSSI_global_1km'],
    'Titan': ['Titan_ISS_Global_Mosaic_4km'],
    'Pluto': ['Pluto_NewHorizons_Global_Mosaic_300m_Jul2017'],
}


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b''
    except Exception:
        return None, b''


def main():
    print('=' * 74)
    print('PROBE LAYER TILE NASA TREK (trek.nasa.gov)')
    print('=' * 74)
    found = {}
    for body, layers in CANDIDATES.items():
        for layer in layers:
            caps = f'https://trek.nasa.gov/tiles/{body}/EQ/{layer}/1.0.0/WMTSCapabilities.xml'
            st, data = fetch(caps)
            if st == 200 and data:
                txt = data.decode('utf-8', 'ignore')
                tm = re.findall(
                    r'<TileMatrix>\s*<ows:Identifier>([^<]+)</ows:Identifier>'
                    r'.*?<MatrixWidth>(\d+)</MatrixWidth>\s*'
                    r'<MatrixHeight>(\d+)</MatrixHeight>', txt, re.S)
                fmt = re.findall(r'<Format>([^<]+)</Format>', txt)
                tms = re.findall(r'<TileMatrixSet>([^<]+)</TileMatrixSet>', txt)
                print(f'\n✓ {body} / {layer}')
                print(f'    TileMatrixSet: {sorted(set(tms))}')
                print(f'    Format       : {sorted(set(fmt))}')
                print(f'    Level        : {len(tm)}  (pertama: {tm[:3]})')
                found.setdefault(body, []).append({
                    'layer': layer, 'tms': sorted(set(tms))[0] if tms else None,
                    'fmt': sorted(set(fmt))[0] if fmt else None,
                    'levels': tm,
                })
            else:
                print(f'✗ {body} / {layer}  (HTTP {st})')
    print('\n' + '=' * 74)
    print('RINGKASAN:')
    for b, ls in found.items():
        for l in ls:
            print(f'  {b:10s} {l["layer"]:52s} {len(l["levels"])} level')
    return 0


if __name__ == '__main__':
    sys.exit(main())
