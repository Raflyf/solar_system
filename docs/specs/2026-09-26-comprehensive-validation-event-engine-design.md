# Design Document: Comprehensive Astronomical Validation & Event Engine

**Date:** 2026-09-26  
**Scope:** Full temporal validation + complete event engine (eclipse, conjunction, opposition, meteor shower, Milky Way, Earth-view mode)  
**Sources:** NASA/JPL DE440/DE441, IAU SOFA/2006, IMO meteor calendar, HYG/Hipparcos

---

## 1. Temporal Validation (Backward/Forward Accuracy)

### Current State Analysis
| Component | Source | Valid Range | Current Error |
|-----------|--------|-------------|---------------|
| 8 Planets | JPL Keplerian approx (Standish) | 1800-2050 | 15-600" |
| Moon | Meeus Ch.47 (ELP2000 60 terms) | ~1900-2100 | ~22' (1340") vs DE441 |
| Moon libration | Meeus Ch.53 | 1800-2050 | <1° |
| 11 Satellites | JPL mean elements (JUP365 etc) | ~1600-2200 | <1° |
| Stars | HYG v3.8 + proper motion | J2000 + proper motion | <5" |
| Precession | IAU 1976 (Meeus) | -500 to +2000 | ~0.3° at 26 yr |

### Required Fixes
1. **Moon position**: Current Meeus 60-term → integrate JPL DE441 via SPK kernel or use JPL Horizons API fallback. Acceptable: keep Meeus but document ±22' error, label UI "akurasi ~22' (model ringkas)".
2. **Planetary precession**: Already using IAU 1976/2006 model. Verify with SOFA iau_P06E.
3. **Star positions**: Proper motion applied ✓. Add annual aberration + nutation (IAU 2000A/2006) - already partially implemented.
4. **Temporal range label**: Add UI badge "Model akurat 1800-2050" with tooltip detail.

---

## 2. Event Engine (Complete Celestial Event Calendar)

### 2.1 Eclipses (✅ Already Working)
- Solar & lunar eclipse detection ✅ (16/16 NASA verified)
- Search in date range ✅
- Type classification (total/partial/penumbral/annular) ✅

### 2.2 Planetary Events (Needs Enhancement)

| Event Type | Current | Required |
|------------|---------|----------|
| Conjunction (planet-planet) | ❌ | ✅ |
| Opposition (planet-Sun) | ✅ (elong >168°) | ✅ + exact date |
| Greatest elongation (Mercury/Venus) | ❌ | ✅ |
| Stationary points (retrograde start/end) | ❌ | ✅ |
| Close approaches (<5°) | ❌ | ✅ |

**Implementation**: Scan daily elongation derivatives in `eventsAt()` / `searchEvents()`. Use `planetElongation()` derivative sign change.

### 2.3 Lunar Events (Needs Enhancement)

| Event Type | Current | Required |
|------------|---------|----------|
| Perigee/Apogee | ❌ | ✅ |
| Moon phase exact times | ❌ | ✅ |
| Lunar libration extremes | ❌ | ✅ |
| Occultations (planets/stars by Moon) | ❌ | ❌ (too complex for browser) |

### 2.4 Meteor Showers (New)

| Shower | Peak (typical) | ZHR | Source |
|--------|----------------|-----|--------|
| Quadrantids | Jan 3-4 | 120 | IMO |
| Lyrids | Apr 22-23 | 18 | IMO |
| Eta Aquariids | May 5-6 | 50 | IMO |
| Perseids | Aug 12-13 | 100 | IMO |
| Orionids | Oct 21-22 | 20 | IMO |
| Leonids | Nov 17-18 | 15 | IMO |
| Geminids | Dec 13-14 | 150 | IMO |
| Ursids | Dec 22-23 | 10 | IMO |

**Data source**: IMO calendar (static JSON, updated annually). Compute radiant position from known RA/Dec, show peak ±3 days.

### 2.4 Satellite Events (New)
- Galilean moon transits/eclipses (shadow transits on Jupiter)
- Titan transit on Saturn
- Mutual events (Io-Europa-Ganymede) — use Laplace resonance φ

---

## 3. Milky Way & Deep Sky (Enhancement)

### Current
- 24k procedural particles ❌ (fake, causes lag)
- 20 static deep sky objects ✅ (Andromeda, Magellanic Clouds, etc.)
- 86 constellations ✅ (86 IAU, 239 segments)

### Required
1. **Real Milky Way**: Use `assets/hi/milkyway.jpg` (already exists, 249KB) as spherical panorama. Disable procedural 24k points.
2. **Deep sky catalog**: Expand from 20 → 110 Messier + Caldwell + NGC bright objects. Source: SEDS/NASA Extragalactic Database static JSON.
3. **Labels**: Toggle names for M31, M33, LMC, SMC, Omega Cen, 47 Tuc, etc.

---

## 5. Earth-View Mode (Google Earth Style)

### Requirements
- **Observer on Earth surface**: Latitude/Longitude picker (manual + GPS)
- **Horizon line**: Compute altitude/azimuth of all bodies for observer location
- **Visible hemisphere**: Only bodies above horizon (alt > 0°)
- **Sky dome**: Stars/planets/Milky Way from observer perspective
- **Ground texture**: Earth texture with day/night terminator matching simulation time
- **Time control**: Lock to real-time or manual

### Technical Approach
1. **New camera mode**: `earthView` with `lat`, `lon`, `alt` (default 0m)
2. **Coordinate transform**: ICRS → Alt/Az for observer using IAU SOFA `iau_Atio13` + `iau_Atoiq`
3. **Horizon shader**: Clip geometry below horizon
3. **Ground sphere**: Earth radius + atmosphere shell, textured with day/night maps
4. **UI**: "Mode Bumi" button → opens location picker (search + GPS) + altitude slider

---

## 6. UI/UX Changes

### New UI Components
| Component | Location | Purpose |
|-----------|----------|---------|
| Temporal accuracy badge | Top bar | "Model: 1800-2050 (±22' Bulan)" |
| Event timeline sidebar | Right panel | Filterable event list with dates |
| Meteor shower calendar | New panel | Monthly view with peak ZHR |
| Earth-view toggle | Top bar | Switch to ground observer mode |
| Location picker | Modal | Search city / GPS / manual lat/lon |
| Horizon compass | Bottom | Azimuth markers N/E/S/W |

### Date Panel Enhancements
- Add "Lompat ke event terdekat" buttons
- Show event count badge on date picker
- Export events to .ics (calendar) ✅

---

## 7. Data Sources & Updates

| Data | Source | Update Frequency | Size |
|------|--------|------------------|------|
| DE440/DE441 SPK | JPL NAIF | ~10 years | 114 MB |
| JPL satellite kernels | JPL NAIF | ~5 years | 2 GB total |
| IMO meteor calendar | IMO | Annual | 5 KB |
| Messier/NGC catalog | SEDS/NASA | Static | 50 KB |
| HYG v3.8 stars | Astronexus | ~5 years | 13 MB |
| IAU SOFA library | IAU | ~2 years | 2 MB |

**Strategy**: Ship with baked data (current accuracy). Add "Check for updates" button that fetches latest JSON from GitHub releases. Large SPK kernels NOT bundled — use JPL Horizons API for on-demand high-precision queries (requires internet).

---

## 8. Architecture & Performance

### New Modules
```
src/
├── 15-ephemeris.js       (enhanced: SOFA nutation/aberration)
├── 16-events.js          (NEW: unified event engine)
├── 17-earthview.js       (NEW: ground observer mode)
├── 18-stars.js           (enhanced: aberration/nutation)
├── 19-deepsky.js         (NEW: Messier/NGC catalog)
├── 20-meteor.js          (NEW: meteor shower engine)
└── 21-earthview-ui.js    (NEW: location picker UI)
```

### Performance Targets
- Event scan: <50ms for 1 year range (5000 evaluations)
- Earth-view render: 60 fps on mid GPU (GTX 1060)
- Milky Way texture: single 4K sphere, no particles
- Event sidebar: virtualized list (only render visible)

---

## 9. Acceptance Criteria

### Must Have (MVP)
- [ ] Temporal accuracy badge showing model limits
- [ ] Event engine: eclipse + conjunction + opposition + meteor showers
- [ ] Meteor shower calendar with ZHR peaks
- [ ] Milky Way texture (real image, no particles)
- [ ] Earth-view mode with lat/lon picker
- [ ] All existing tests pass (16/16 eclipse, etc.)

### Should Have
- [ ] Exact conjunction/opposition dates (to hour)
- [ ] Planetary stationary points
- [ ] Perigee/apogee moon
- [ ] Deep sky catalog (Messier 110)
- [ ] Export events to .ics

### Nice to Have
- [ ] Satellite mutual events (Galilean)
- [ ] Occultation predictions (Moon-planet)
- [ ] Comet positions (JPL small body DB)
- [ ] Offline SPK kernel download option

---

## 10. Open Questions for User

1. **Temporal range priority**: How far back/forward must be "accurate"? (Current JPL approx: 1800-2050. DE441: -13200 to +17191 but 176 MB kernel)
2. **Internet dependency**: Allow Horizons API calls for on-demand high-precision? (Requires user consent for network)
3. **Mobile support**: Earth-view mode needs touch-friendly location picker. Priority?
4. **Data update mechanism**: Auto-fetch from GitHub releases vs manual "Check updates" button?

---

## 11. Implementation Order (Writing-Plans)

1. **Phase 1**: Temporal validation badges + documentation of accuracy limits
2. **Phase 2**: Event engine core (`16-events.js`) — conjunction/opposition/meteor
3. **Phase 3**: Milky Way texture + deep sky catalog
4. **Phase 4**: Earth-view mode (`17-earthview.js` + `21-earthview-ui.js`)
5. **Phase 5**: UI integration + testing + push

---

**Ready for writing-plans?** Please confirm or request changes to specific sections.