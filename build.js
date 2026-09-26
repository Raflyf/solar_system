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
const materials = read(path.join(SRC, '25-materials.js'));
const sceneSrc = read(path.join(SRC, '20-scene.js'));
const controls = read(path.join(SRC, '30-controls.js'));
const main = read(path.join(SRC, '60-main.js'));
const uiHtml = read(path.join(SRC, '40-ui.html'));
const css = read(path.join(SRC, '50-style.css'));

const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="theme-color" content="#05070d">
<title>Tata Surya 3D — Skala 1:1 dengan Tekstur Asli NASA</title>
<meta name="description" content="Tata surya 3D skala 1:1 dengan tekstur permukaan asli NASA/USGS. Zoom sampai permukaan planet, simulasi waktu dari detik hingga abad.">
<style>
${css}
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
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('OK  ->  ' + OUT);
console.log('index.html: ' + kb + ' KB');
console.log('Tekstur   : dimuat dari assets/hi/ atau assets/lo/ saat runtime');
