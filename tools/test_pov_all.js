const { spawn } = require('child_process');
const fs = require('fs');

async function run() {
  const chromeProc = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--window-size=1280,720',
    'http://localhost:8765/index.html?q=lo'
  ]);

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch('http://localhost:9227/json/version');
      if (res.ok) break;
    } catch(e) {}
  }

  const targetsRes = await fetch('http://localhost:9227/json/list');
  const targets = await targetsRes.json();
  const pageTarget = targets.find(t => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let id = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };

  await new Promise(r => ws.onopen = r);

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      pending.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await send('Runtime.enable');
  await send('Page.enable');

  await new Promise(r => setTimeout(r, 3500));

  const bodiesToTest = [
    { key: 'earth', lat: -6.2, lon: 106.8, maxDays: 1, stepDays: 1/48, name: 'earth' },
    { key: 'moon', lat: 8.5, lon: 31.4, maxDays: 30, stepDays: 0.5, name: 'moon' },
    { key: 'mars', lat: -5.4, lon: 137.8, maxDays: 2, stepDays: 1/24, name: 'mars' },
    { key: 'venus', lat: -25.5, lon: 0.4, maxDays: 120, stepDays: 2.0, name: 'venus' },
    { key: 'europa', lat: 9.7, lon: 274.4, maxDays: 4, stepDays: 0.1, name: 'europa' },
    { key: 'titan', lat: 78.0, lon: 0.0, maxDays: 16, stepDays: 0.5, name: 'titan' },
  ];

  for (const bInfo of bodiesToTest) {
    const expr = `
      (() => {
        SURFACE_VIEW.enable('${bInfo.key}', ${bInfo.lat}, ${bInfo.lon});
        const b = SURFACE_VIEW.currentBody();
        if (!b) return { error: 'body not found for ' + '${bInfo.key}' };

        const baseDays = window.__SOLAR__.app.days;
        let bestAlt = -999, bestD = 0;
        const maxD = ${bInfo.maxDays};
        const stepD = ${bInfo.stepDays};

        for (let d = 0; d < maxD; d += stepD) {
          window.__SOLAR__.app.days = baseDays + d;
          computePositions(window.__SOLAR__.app.days, 0);
          const obs = SURFACE_VIEW.computeObserver(b);
          const alt = SURFACE_VIEW.sunAltitudeDeg(obs);
          if (alt > 35 && alt < 65) {
            bestAlt = alt; bestD = d;
            break;
          }
          if (alt > bestAlt) { bestAlt = alt; bestD = d; }
        }

        window.__SOLAR__.app.days = baseDays + bestD;
        computePositions(window.__SOLAR__.app.days, 0);
        SURFACE_VIEW.el = -0.14; // look slightly down toward landscape
        SURFACE_VIEW.az = 0;
        SURFACE_VIEW.fov = 55;

        const obs = SURFACE_VIEW.computeObserver(b);
        updateSurfaceSky(obs, b, SURFACE_VIEW.atmosphereOn);
        updateSurfacePatch(b, SURFACE_VIEW.lat, SURFACE_VIEW.lon);
        updateCamera(0.016);
        applyPositions();
        renderer.render(scene, camera);

        const gl = renderer.getContext();
        const glErr = gl.getError();

        return {
          bodyName: b.name,
          bodyKey: b.key,
          sunAlt: SURFACE_VIEW.sunAltitudeDeg(obs),
          surfaceType: surfacePatch ? surfacePatch.material.userData.surfaceType : null,
          hasPatch: !!surfacePatch,
          patchVis: surfacePatch ? surfacePatch.visible : false,
          hasMacroNormal: surfacePatch ? surfacePatch.material.uniforms.uHasMacroNormal.value : 0,
          glError: glErr,
          elevUnits: surfacePatch ? surfacePatch.geometry.attributes.position.count : 0
        };
      })()
    `;

    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    console.log(`[POV Result] ${bInfo.name}:`, res.result ? res.result.result.value : res);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`tools/pov_${bInfo.name}.png`, Buffer.from(shot.result.data, 'base64'));
    console.log(`[Screenshot Saved] tools/pov_${bInfo.name}.png`);
  }

  ws.close();
  chromeProc.kill();
  console.log('Done testing all POV modes.');
}

run().catch(console.error);
