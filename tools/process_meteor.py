"""
Generator Data Hujan Meteor Resmi (IMO - International Meteor Organization)
Menyimpan data radiant RA/Dec, ZHR (Zenithal Hourly Rate), dan kecepatan (km/s)
untuk visualisasi hujan meteor nyata dari permukaan Bumi.
"""

import json
import os

METEORS = [
    {
        "id": "qua",
        "nama": "Quadrantids",
        "induk": "Asteroid 2003 EH1",
        "puncak": {"bulan": 1, "hari": 3, "jam": 21},
        "rentang": {"mulai": "12-28", "selesai": "01-12"},
        "radiant": {"ra": 230.1, "dec": 48.5}, # Boötes
        "zhr": 120,
        "v_kms": 41,
        "warna": [180, 220, 255]
    },
    {
        "id": "lyr",
        "nama": "Lyrids",
        "induk": "Komet C/1861 G1 (Thatcher)",
        "puncak": {"bulan": 4, "hari": 22, "jam": 13},
        "rentang": {"mulai": "04-14", "selesai": "04-30"},
        "radiant": {"ra": 271.4, "dec": 33.6}, # Lyra
        "zhr": 18,
        "v_kms": 49,
        "warna": [255, 255, 255]
    },
    {
        "id": "eta",
        "nama": "Eta Aquariids",
        "induk": "Komet 1P/Halley",
        "puncak": {"bulan": 5, "hari": 5, "jam": 21},
        "rentang": {"mulai": "04-19", "selesai": "05-28"},
        "radiant": {"ra": 338.0, "dec": -1.0}, # Aquarius
        "zhr": 50,
        "v_kms": 66,
        "warna": [255, 240, 200]
    },
    {
        "id": "per",
        "nama": "Perseids",
        "induk": "Komet 109P/Swift-Tuttle",
        "puncak": {"bulan": 8, "hari": 12, "jam": 19},
        "rentang": {"mulai": "07-17", "selesai": "08-24"},
        "radiant": {"ra": 48.2, "dec": 58.1}, # Perseus
        "zhr": 100,
        "v_kms": 59,
        "warna": [200, 240, 255]
    },
    {
        "id": "ori",
        "nama": "Orionids",
        "induk": "Komet 1P/Halley",
        "puncak": {"bulan": 10, "hari": 21, "jam": 18},
        "rentang": {"mulai": "10-02", "selesai": "11-07"},
        "radiant": {"ra": 94.5, "dec": 15.8}, # Orion
        "zhr": 20,
        "v_kms": 66,
        "warna": [255, 220, 180]
    },
    {
        "id": "leo",
        "nama": "Leonids",
        "induk": "Komet 55P/Tempel-Tuttle",
        "puncak": {"bulan": 11, "hari": 17, "jam": 17},
        "rentang": {"mulai": "11-06", "selesai": "11-30"},
        "radiant": {"ra": 152.0, "dec": 22.0}, # Leo
        "zhr": 15,
        "v_kms": 71,
        "warna": [180, 255, 220]
    },
    {
        "id": "gem",
        "nama": "Geminids",
        "induk": "Asteroid 3200 Phaethon",
        "puncak": {"bulan": 12, "hari": 14, "jam": 7},
        "rentang": {"mulai": "12-04", "selesai": "12-20"},
        "radiant": {"ra": 112.3, "dec": 32.5}, # Gemini
        "zhr": 150,
        "v_kms": 35,
        "warna": [255, 255, 230]
    },
    {
        "id": "urs",
        "nama": "Ursids",
        "induk": "Komet 8P/Tuttle",
        "puncak": {"bulan": 12, "hari": 22, "jam": 22},
        "rentang": {"mulai": "12-17", "selesai": "12-26"},
        "radiant": {"ra": 217.0, "dec": 76.0}, # Ursa Minor
        "zhr": 10,
        "v_kms": 33,
        "warna": [255, 200, 200]
    }
]

os.makedirs("src", exist_ok=True)
with open("src/16-meteor-data.js", "w", encoding="utf-8") as f:
    f.write("/* Data Hujan Meteor Utama (IMO - International Meteor Organization) */\n")
    f.write("const METEOR_SHOWERS = ")
    json.dump(METEORS, f, indent=2)
    f.write(";\n")

print("Berhasil membuat src/16-meteor-data.js")