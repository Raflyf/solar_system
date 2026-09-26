/* =======================================================================
   build.js — menggabungkan semua sumber menjadi SATU berkas HTML mandiri
   Jalankan:  node build.js
   ======================================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'index.html');

function read(p) { return fs.readFileSync(p, 'utf8'); }

const three = read(path.join(SRC, 'vendor', 'three.min.js'));
const textures = read(path.join(SRC, '00-textures.js'));
const data = read(path.join(SRC, '10-data.js'));
const sceneSrc = read(path.join(SRC, '20-scene.js'));
const controls = read(path.join(SRC, '30-controls.js'));
const main = read(path.join(SRC, '60-main.js'));
const uiHtml = read(path.join(SRC, '40-ui.html'));
const css = read(path.join(SRC, '50-style.css'));

/* pengaman: jangan sampai skrip JS mengandung penutup <script> */
function safe(js) {
  return js.replace(/<\/script>/gi, '<\\/script>');
}

const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="theme-color" content="#05070d">
<title>Tata Surya 3D — Jelajah Interaktif</title>
<meta name="description" content="Tata Surya 3D skala nyata dalam satu berkas HTML. Terbang bebas, zoom, dan jelajahi planet-planet.">
<style>
${css}
</style>
</head>
<body>
${uiHtml}

<!-- =====================================================================
     Mesin 3D: three.js r149 (MIT License, © 2010-2023 three.js authors)
     Disematkan agar berkas ini berjalan 100% offline tanpa internet.
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
${safe(data)}
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
console.log('Ukuran berkas: ' + kb + ' KB');
