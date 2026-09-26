# Comprehensive Astronomical Validation & Event Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build comprehensive astronomical validation (temporal accuracy, all historical/future events) + complete event engine (eclipses, conjunctions, oppositions, meteor showers, Milky Way, Earth-view mode) for the Solar System 3D simulator.

**Architecture:** Modular enhancement of existing vanilla JS Three.js simulator. New modules for events, Earth-view, deep sky, meteor showers. All data from NASA/JPL/IAU/IMO sources. Zero external runtime dependencies.

**Tech Stack:** Vanilla ES6 JavaScript, Three.js r149, Node.js build script, Python data processing, GitHub Pages deployment.

---

## Global Constraints

- **Zero external runtime deps** — all computation in-browser, vanilla JS
- **Data sources** — NASA JPL DE440/DE441, IAU SOFA/2006, IMO meteor calendar, HYG v3.8, SEDS Messier
- **Accuracy targets** — Planet 15-600", Moon ~22' (Meeus limit), Stars <5" (proper motion + aberration)
- **Temporal range** — 1800-2050 (JPL approx), DE441 extends -13200 to +17191 (not bundled)
- **Performance** — 60fps on GTX 1060, event scan <50ms/year, Earth-view 60fps mid-GPU
- **Deployment** — `index.html` single file deployable to GitHub Pages, `assets/` textures
- **Language** — Indonesian UI, English code/comments
- **Testing** — Node.js unit tests (`tools/test_*.js`), browser visual verification
- **Zero new runtime deps** — no npm packages, no WebAssembly, no Web Workers

---

## File Structure Map

```
src/
├── 15-ephemeris.js         (MODIFY: Moon position fix, nutation/aberration)
├── 16-events.js            (CREATE: unified event engine)
├── 17-earthview.js         (CREATE: Earth observer mode)
├── 18-stars.js             (MODIFY: aberration/nutation + Milky Way)
├── 19-deepsky.js           (CREATE: Messier/NGC catalog)
├── 20-meteor.js            (CREATE: meteor shower engine)
├── 21-earthview-ui.js      (CREATE: location picker UI)
├── 22-temporal-badge.js    (CREATE: accuracy badge UI)
├── 23-event-sidebar.js     (CREATE: event timeline UI)
├── 00-textures.js          (MODIFY: Milky Way texture loading)
├── 20-scene.js             (MODIFY: Earth-view camera, Milky Way sphere)
├── 30-controls.js          (MODIFY: Earth-view camera mode)
├── 60-main.js              (MODIFY: integrate new modules)
├── 40-ui.html              (MODIFY: new UI panels)
├── 56-stars.css            (MODIFY: new UI styles)
├── 57-events.css           (CREATE: event UI styles)
├── 58-earthview.css        (CREATE: Earth-view styles)
├── 10-data.js              (MODIFY: add meteor shower data)
├── 14-laplace.js           (no change)
├── 17-satellite-elements.js (no change)
├── 19-poles.js             (no change)
tools/
├── build.js                (MODIFY: include new modules)
├── process_stars.py        (MODIFY: add meteor shower data if needed)
├── process_meteor.py       (CREATE: process IMO calendar)
├── process_deepsky.py      (CREATE: process Messier/NGC)
├── test_full.js            (MODIFY: add new tests)
├── test_events.js          (CREATE: event engine tests)
├── test_earthview.js       (CREATE: Earth-view tests)
├── test_meteor.js          (CREATE: meteor shower tests)
assets/
├── hi/
│   ├── milkyway.jpg        (EXISTS: 249KB, use for Milky Way sphere)
│   └── ... (planet textures)
├── meteor/
│   └── showers.json        (CREATE: IMO calendar data)
├── deepsky/
│   └── messier.json        (CREATE: Messier 110 catalog)
docs/
├── specs/2026-09-26-...design.md (EXISTS)
```

---

## Phase 1: Temporal Validation & Moon Fix (Days 1-2)

### Task 1.1: Fix Moon Position (Presesi Correction Already Done)

**Files:**
- Modify: `src/15-ephemeris.js:276` — presesi koreksi already restored ✓
- Test: `tools/test_full.js` — gerhana 16/16 must pass

- [ ] **Step 1: Verify Moon presesi fix works**
```bash
node tools/test_full.js 2>&1 | grep -E "Gerhana|Fase bulan"
```
Expected: `Gerhana terdeteksi 16/16`, `Fase bulan 6/6`

- [ ] **Step 2: Commit Moon fix**
```bash
git add src/15-ephemeris.js
git commit -m "fix: Moon presesi koreksi J2000 (sudah di-commit a460245)"
```

### Task 1.2: Temporal Accuracy Badge UI

**Files:**
- Create: `src/22-temporal-badge.js`
- Modify: `src/60-main.js` (integrate badge), `src/40-ui.html` (badge container), `src/56-stars.css` (badge styles)

**Interfaces:**
- Consumes: `app.days`, `J2000_JD`
- Produces: `TemporalBadge.update(app.days)` → renders badge with model range + Moon accuracy note

- [ ] **Step 1: Create `src/22-temporal-badge.js`**
```javascript
/* Badge akurasi temporal — menampilkan rentang validitas model */
const TEMPORAL_BADGE = {
  init() { /* create DOM element */ },
  update(days) { /* compute JD, show range + Moon accuracy */ },
  getMoonAccuracyNote() { 
    const yr = (days / 365.25);
    if (Math.abs(yr) > 50) return 'Bulan: ~22\' (model Meeus 60 suku)';
    return 'Bulan: ~10\' (Meeus bab 47)';
  }
};
```

- [ ] **Step 2: Add badge to `src/40-ui.html`**
```html
<div class="temporal-badge" id="temporalBadge"></div>
```

- [ ] **Step 3: Add styles to `src/56-stars.css`**
```css
.temporal-badge {
  position: fixed; top: 10px; right: 10px; z-index: 100;
  background: rgba(0,0,0,0.8); color: #fff; padding: 4px 8px;
  border-radius: 4px; font-size: 11px; font-family: monospace;
  border: 1px solid rgba(255,255,255,0.2);
}
.temporal-badge:hover { background: rgba(0,0,0,0.95); }
```

- [ ] **Step 4: Initialize in `src/60-main.js`**
```javascript
import { TEMPORAL_BADGE } from './22-temporal-badge.js';
// in init():
TEMPORAL_BADGE.init();
TEMPORAL_BADGE.update(app.days);
// in loop after computePositions:
TEMPORAL_BADGE.update(app.days);
```

- [ ] **Step 5: Add to build.js**
```javascript
const temporalBadge = read(path.join(SRC, '22-temporal-badge.js'));
// add script tag in HTML
```

- [ ] **Step 6: Build & test**
```bash
node build.js && node tools/test_full.js
```

- [ ] **Step 7: Commit**
```bash
git add src/22-temporal-badge.js src/40-ui.html src/56-stars.css src/60-main.js build.js
git commit -m "feat: temporal accuracy badge with Moon model limits"
```

---

## Phase 2: Event Engine Core (Days 3-5)

### Task 2.1: Create `src/16-events.js` (Unified Event Engine)

**Files:**
- Create: `src/16-events.js`
- Modify: `src/build.js` (include), `src/60-main.js` (init), `tools/test_events.js` (CREATE tests)

**Interfaces:**
- Consumes: `app.days`, `jplElements`, `SATELLITE_ELEMENTS`, `planetPositionAU`, `moonPositionKm`, `planetElongation`, `eclipseState`
- Produces: `EventsEngine.scan(rangeStartJD, rangeEndJD)` → array of Event objects

**Event Types:**
```javascript
// All events normalized to:
{
  type: 'eclipse' | 'conjunction' | 'opposition' | 'elongation' | 'meteor' | 'stationary' | 'perigee' | 'apogee',
  subtype: 'solar-total' | 'lunar-penumbral' | 'planet-planet' | 'planet-star' | 'quadrantids' | etc,
  jd: 2461309.5,           // peak JD
  jdStart: 2461309.0,      // optional
  jdEnd: 2461310.0,        // optional
  title: 'Konjungsi Venus-Jupiter',
  description: '0.5° terpisah, terlihat senja',
  magnitude: -3.9,          // for meteor ZHR, planet mag
  bodies: ['venus', 'jupiter'], // involved bodies
  visible: true,            // above horizon for default observer
  ra: 12.5, dec: -5.2,     // sky position (deg)
}
```

- [ ] **Step 1: Create `src/16-events.js` skeleton**
```javascript
/* Event Engine — deteksi semua peristiwa astronomi */
const EVENTS_ENGINE = {
  // Scan range JD -> array of events
  scan(jdStart, jdEnd, stepDays = 0.1) { ... },
  
  // Individual detectors
  _detectEclipses(jd) { ... },
  _detectConjunctions(jd, step) { ... },
  _detectOppositions(jd) { ... },
  _detectMeteorShowers(jd) { ... },
  _detectStationary(jd) { ... },
  _detectPerigeeApogee(jd) { ... },
  _detectGreatestElongation(jd) { ... },
  
  // Helpers
  _deduplicate(events) { ... },
  _sortByTime(events) { ... },
};
```

- [ ] **Step 2: Implement eclipse detector (reuse `eclipseState`)**

- [ ] **Step 3: Implement conjunction/opposition detector**
```javascript
// Scan planet pairs daily, detect elongation derivative sign change
for (const [i, a] of planetKeys.entries()) {
  for (const b of planetKeys.slice(i+1)) {
    // elongation(a,b) over time, detect min (conjunction) / max (opposition)
  }
}
```

- [ ] **Step 4: Implement meteor shower engine** (static data from `assets/meteor/showers.json`)

- [ ] **Step 5: Implement stationary points (retrograde start/end)**
```javascript
// elongation derivative sign change for outer planets
```

- [ ] **Step 6: Implement Moon perigee/apogee**
```javascript
// moonPositionKm().dist derivative
```

- [ ] **Step 7: Create `tools/test_events.js`**
```javascript
// Test: 2024-04-08 solar eclipse detected
// Test: 2024-08-14 Perseids peak ±1 day
// Test: Jupiter-Saturn great conjunction 2020 detected
// Test: Moon perigee/apogee within 1 day accuracy
```

- [ ] **Step 6: Add to `build.js` and `src/60-main.js`**

- [ ] **Step 7: Run tests**
```bash
node build.js && node tools/test_events.js
```

- [ ] **Step 7: Commit**

### Task 2.2: Meteor Shower Data (`assets/meteor/showers.json`)

**Files:**
- Create: `assets/meteor/showers.json`
- Create: `tools/process_meteor.py`

- [ ] **Step 1: Create `tools/process_meteor.py`**
```python
# IMO 2024-2026 calendar (static, update annually)
SHOWERS = [
  {"name":"Quadrantids","peak":"01-03","zhr":120,"radiant":{"ra":230,"dec":49},"active":"12-28..01-12"},
  {"name":"Lyrids","peak":"04-22","zhr":18,"radiant":{"ra":271,"dec":34},"active":"04-14..04-30"},
  {"name":"Eta Aquariids","peak":"05-05","zhr":50,"radiant":{"ra":338,"dec":-1},"active":"04-19..05-28"},
  {"name":"Perseids","peak":"08-12","zhr":100,"radiant":{"ra":48,"dec":58},"active":"07-17..08-24"},
  {"name":"Orionids","peak":"10-21","zhr":20,"radiant":{"ra":95,"dec":16},"active":"10-02..11-07"},
  {"name":"Leonids","peak":"11-17","zhr":15,"radiant":{"ra":152,"dec":22},"active":"11-06..11-30"},
  {"name":"Geminids","peak":"12-14","zhr":150,"radiant":{"ra":112,"dec":33},"active":"12-04..12-20"},
  {"name":"Ursids","peak":"12-22","zhr":10,"radiant":{"ra":217,"dec":76},"active":"12-17..12-26"},
  # ... add all major IMO showers
]
# Output assets/meteor/showers.json
```

- [ ] **Step 2: Run & verify**
```bash
python tools/process_meteor.py && cat assets/meteor/showers.json | head -20
```

- [ ] **Step 3: Commit**

---

## Phase 3: Milky Way & Deep Sky (Days 3-4)

### Task 3.1: Replace Procedural Milky Way with Real Texture

**Files:**
- Modify: `src/18-stars.js` (disable `buildMilkyWay()`, add `buildMilkyWayTexture()`)
- Modify: `src/00-textures.js` (load `assets/hi/milkyway.jpg`)
- Modify: `src/20-scene.js` (use texture sphere instead of 24k particles)

- [ ] **Step 1: Disable procedural in `src/18-stars.js`**
```javascript
// In buildStarField():
// starField.milkyWay = null;  // already null after previous commit
// Remove buildMilkyWay() call
```

- [ ] **Step 2: Add `buildMilkyWayTexture()` in `src/18-stars.js`**
```javascript
function buildMilkyWayTexture() {
  const tex = new THREE.TextureLoader().load('assets/hi/milkyway.jpg');
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const geo = new THREE.SphereGeometry(SKY_RADIUS * 0.95, 64, 32);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, side: THREE.BackSide, transparent: true, opacity: 0.7,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -15;
  return mesh;
}
```

- [ ] **Step 3: Call in `buildStarField()` and add to scene**

- [ ] **Step 3: Build & verify no 24k particles, Milky Way visible**
```bash
node build.js && # browser check
```

- [ ] **Step 4: Commit**

### Task 3.2: Deep Sky Catalog (Messier 110)

**Files:**
- Create: `assets/deepsky/messier.json`
- Create: `tools/process_deepsky.py`
- Create: `src/19-deepsky.js`
- Modify: `src/18-stars.js` (load deep sky), `src/build.js`

- [ ] **Step 1: Create `tools/process_deepsky.py`** (static Messier 110 catalog with RA, Dec, mag, type, size)

- [ ] **Step 2: Create `src/19-deepsky.js`** (load JSON, create sprites/labels)

- [ ] **Step 4: Integrate in `src/18-stars.js::buildStarField()`**

- [ ] **Step 5: Commit**

---

## Phase 4: Earth-View Mode (Days 5-7)

### Task 4.1: Earth Observer Camera (`src/17-earthview.js`)

**Files:**
- Create: `src/17-earthview.js`
- Modify: `src/20-scene.js` (Earth ground sphere), `src/30-controls.js` (camera mode), `src/60-main.js` (init), `src/build.js`

**Interfaces:**
- Consumes: `app.days`, observer `lat`, `lon`, `alt`
- Produces: `EarthView.update(lat, lon, alt, jd)` → sets camera position/orientation, horizon clip

**Camera Logic:**
- Position: Earth center + (R + alt) * lat/lon vector
- Orientation: Look at zenith (up = local normal), forward = North
- Horizon plane: Clip geometry below horizon (alt < 0°)
- Star/planet positions: Transform ICRS → Alt/Az using SOFA-style `iau_Atio13` + `iau_Atoiq`

- [ ] **Step 1: Create `src/17-earthview.js`**
```javascript
const EARTH_VIEW = {
  lat: -6.2, lon: 106.8, alt: 0,  // default Jakarta
  enabled: false,
  groundSphere: null,
  horizonPlane: null,
  
  enable(lat, lon, alt) { ... },
  disable() { ... },
  update(jd) {
    // 1. Compute GMST + nutation for jd
    // 2. Observer position in ECEF
    // 3. Camera position = Earth center + (R+alt) * up
    // 4. Camera orientation: look at zenith, North up
    // 4. Compute Alt/Az for all bodies (for horizon culling)
    // 5. Update horizon plane position
  },
  _icrsToAltAz(ra, dec, jd) { ... }, // SOFA-style transform
  _buildGroundSphere() { ... },      // Earth + atmosphere
};
```

- [ ] **Step 2: Add ground sphere in `src/20-scene.js`**
```javascript
// In buildSun(): create Earth ground sphere (radius = 1.0 units) 
// with day/night texture, used ONLY in earthView mode
```

- [ ] **Step 3: Integrate in `src/30-controls.js`** (camera mode toggle)

- [ ] **Step 6: Commit**

### Task 4.2: Earth-View UI (`src/21-earthview-ui.js`)

**Files:**
- Create: `src/21-earthview-ui.js`
- Modify: `src/40-ui.html` (location picker modal), `src/58-earthview.css` (CREATE)

- [ ] **Step 1: Create `src/21-earthview-ui.js`**
```javascript
const EARTHVIEW_UI = {
  init() { /* create modal, geocoder, GPS button */ },
  show() { /* show modal */ },
  hide() { /* hide modal */ },
  onLocationSelected(lat, lon, alt, name) {
    EARTH_VIEW.enable(lat, lon, alt);
    // update UI label
  },
  useGPS() { /* navigator.geolocation.getCurrentPosition */ },
  searchCity(query) { /* Nominatim API or static city list */ },
};
```

- [ ] **Step 2: Add modal HTML to `src/40-ui.html`**

- [ ] **Step 3: Create `src/58-earthview.css`**

- [ ] **Step 4: Commit**

---

## Phase 5: UI Integration & Testing (Days 8-9)

### Task 5.1: Event Sidebar UI (`src/23-event-sidebar.js`)

**Files:**
- Create: `src/23-event-sidebar.js`
- Create: `src/57-events.css`
- Modify: `src/40-ui.html`, `src/60-main.js`, `src/build.js`

- [ ] **Step 1: Create sidebar with filters** (type, date range, bodies)

- [ ] **Step 2: Add "Lompat ke event" buttons**

- [ ] **Step 3: Export .ics calendar**

- [ ] **Step 4: Commit**

### Task 5.2: Full Test Suite & Regression

- [ ] **Step 1: Run all tests**
```bash
node tools/test_full.js
node tools/test_events.js
node tools/test_earthview.js (CREATE)
node tools/test_meteor.js (CREATE)
node tools/test_moon_render_sync.js
node tools/test_poles_laplace.js
node tools/test_rotation.js
node tools/test_satellites.js
node tools/test_sync.js
```

- [ ] **Step 2: Browser visual check** (all modes, mobile responsive)

- [ ] **Step 3: Build & deploy test**
```bash
node build.js
python -m http.server 8899 --bind 127.0.0.1
# browser test all modes
```

### Task 5.3: Final Commit & Push

- [ ] **Step 1: Final git commit**
```bash
git add -A
git commit -m "feat: comprehensive validation + event engine + Earth view + Milky Way + meteor showers"
git push
```

---

## Test Checklist (Definition of Done)

| Test | Command | Expected |
|------|---------|----------|
| Full regression | `node tools/test_full.js` | 16/16 eclipse, 8/8 planet, 17/17 stars |
| Events engine | `node tools/test_events.js` | Conjunctions, oppositions, meteor peaks |
| Earth view | `node tools/test_earthview.js` | Camera at lat/lon, horizon culling |
| Meteor showers | `node tools/test_meteor.js` | Peak dates ±1 day, ZHR correct |
| Moon render sync | `node tools/test_moon_render_sync.js` | Error < 1e-6 units |
| Poles/Laplace | `node tools/test_poles_laplace.js` | 8/8 poles, 6/6 quat, Laplace 0.018° |
| Rotation | `node tools/test_rotation.js` | 9/9 periods, 9/9 directions |
| Sync | `node tools/test_sync.js` | 45/45 local times |
| Build | `node build.js` | Exit 0, index.html generated |
| Browser | Manual | All modes work, 60fps, mobile responsive |

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-26-comprehensive-validation-event-engine-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration  
**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**