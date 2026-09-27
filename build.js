/* =======================================================================
   build.js — menyusun index.html dari berkas-berkas di src/
   Jalankan:  node build.js
   ----------------------------------------------------------------------
   Sejak memakai tekstur asli NASA/USGS, proyek TIDAK LAGI satu berkas:
   tekstur (28 berkas) dimuat dari folder assets/ saat runtime.
   index.html tetap satu berkas berisi seluruh kode + three.js.
   ======================================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'index.html');

const read = (p) => fs.readFileSync(p, 'utf8');
const safe = (js) => js.replace(/<\/script>/gi, '<\\/script>');

const three = read(path.join(SRC, 'vendor', 'three.min.js'));
const textures = read(path.join(SRC, '00-textures.js'));
const assets = read(path.join(SRC, '05-assets.js'));
const data = read(path.join(SRC, '10-data.js'));
const laplace = read(path.join(SRC, '14-laplace.js'));
const ephemeris = read(path.join(SRC, '15-ephemeris.js'));
const meteorData = read(path.join(SRC, '16-meteor-data.js'));
const eventsMod = read(path.join(SRC, '16-events.js'));
const rotation = read(path.join(SRC, '16-rotation.js'));
const satElements = read(path.join(SRC, '17-satellite-elements.js'));
const earthView = read(path.join(SRC, '17-earthview.js'));
const earthViewUi = read(path.join(SRC, '21-earthview-ui.js'));
const poles = read(path.join(SRC, '19-poles.js'));
const surfaceSky = read(path.join(SRC, '23-surface-sky.js'));
const surfacePatch = read(path.join(SRC, '24-surface-patch.js'));
const surfaceTiles = read(path.join(SRC, '26-surface-tiles.js'));
const surfaceDetail = read(path.join(SRC, '27-surface-detail.js'));
const compass = read(path.join(SRC, '28-compass.js'));
const landscape = read(path.join(SRC, '29-landscape.js'));
const constLabels = read(path.join(SRC, '31-constellation-labels.js'));
const starFocus = read(path.join(SRC, '32-star-focus.js'));
const skyLod = read(path.join(SRC, '33-sky-lod.js'));
const skyTiles = read(path.join(SRC, '34-sky-tiles.js'));
const skyDss = read(path.join(SRC, '35-sky-dss.js'));
const temporalBadge = read(path.join(SRC, '22-temporal-badge.js'));
const starsData = read(path.join(SRC, '12-stars-data.js'));
const constData = read(path.join(SRC, '13-constellations-data.js'));
const stars = read(path.join(SRC, '18-stars.js'));
const materials = read(path.join(SRC, '25-materials.js'));
const sceneSrc = read(path.join(SRC, '20-scene.js'));
const controls = read(path.join(SRC, '30-controls.js'));
const main = read(path.join(SRC, '60-main.js'));
const events = read(path.join(SRC, '70-events.js'));
const uiHtml = read(path.join(SRC, '40-ui.html'));
const css = read(path.join(SRC, '50-style.css'));
const dateCss = read(path.join(SRC, '55-date.css'));
const starsCss = read(path.join(SRC, '56-stars.css'));
const evCss = read(path.join(SRC, '58-earthview.css'));

const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#05070d">
<title>Tata Surya 3D — Skala 1:1 dengan Tekstur Asli NASA</title>
<meta name="description" content="Tata surya 3D skala 1:1 dengan tekstur permukaan asli NASA/USGS. Zoom sampai permukaan planet, simulasi waktu dari detik hingga abad.">
<style>
${css}
${dateCss}
${starsCss}
${evCss}
</style>
</head>
<body>
${uiHtml}

<!-- =====================================================================
     three.js r149 (MIT License, (c) 2010-2023 three.js authors)
     Disematkan agar tidak bergantung pada CDN.
     ===================================================================== -->
<script>
${safe(three)}
</script>

<script>
"use strict";
${safe(textures)}
</script>

<script>
"use strict";
${safe(assets)}
</script>

<script>
"use strict";
${safe(data)}
</script>

<script>
"use strict";
${safe(laplace)}
</script>

<script>
"use strict";
${safe(ephemeris)}
</script>

<script>
"use strict";
${safe(meteorData)}
</script>

<script>
"use strict";
${safe(eventsMod)}
</script>

<script>
"use strict";
${safe(rotation)}
</script>

<script>
"use strict";
${safe(satElements)}
</script>

<script>
"use strict";
${safe(earthView)}
</script>

<script>
"use strict";
${safe(earthViewUi)}
</script>

<script>
"use strict";
${safe(poles)}
</script>

<script>
"use strict";
${safe(surfaceSky)}
</script>

<script>
"use strict";
${safe(surfacePatch)}
</script>

<script>
"use strict";
${safe(surfaceTiles)}
</script>

<script>
"use strict";
${safe(surfaceDetail)}
</script>

<script>
"use strict";
${safe(compass)}
</script>

<script>
"use strict";
${safe(landscape)}
</script>

<script>
"use strict";
${safe(starsData)}
</script>

<script>
"use strict";
${safe(constData)}
</script>

<script>
"use strict";
${safe(constLabels)}
</script>

<script>
"use strict";
${safe(starFocus)}
</script>

<script>
"use strict";
${safe(skyLod)}
</script>

<script>
"use strict";
${safe(skyTiles)}
</script>

<script>
"use strict";
${safe(skyDss)}
</script>

<script>
"use strict";
${safe(stars)}
</script>

<script>
"use strict";
${safe(materials)}
</script>

<script>
"use strict";
${safe(sceneSrc)}
</script>

<script>
"use strict";
${safe(controls)}
</script>

<script>
"use strict";
${safe(main)}
</script>

<script>
"use strict";
${safe(temporalBadge)}
</script>

<script>
"use strict";
${safe(events)}
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('OK  ->  ' + OUT);
console.log('index.html: ' + kb + ' KB');
console.log('Tekstur   : dimuat dari assets/hi/ atau assets/lo/ saat runtime');
