/**
 * app.js — Carbon Biomass Intelligence Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * All client-side logic for the Leaflet map dashboard.
 * No inline scripts or event handlers exist in index.html; everything
 * is wired up here via addEventListener or explicit function exports on
 * the window object (required for the onclick= attributes in HTML).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

/* ── Configuration ────────────────────────────────────────────────────────── */

const CONFIG = {
  API_BASE:        'http://localhost:8000',
  MAP_CENTER:      [12.295, 76.639],   // Karnataka / Mysuru region
  MAP_ZOOM:        10,
  TILE_URL:        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  TILE_ATTRIBUTION: '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/">OSM</a>',
  TILE_SUBDOMAINS: 'abcd',
  TILE_MAX_ZOOM:   19,

  /** Leaflet vector style for the drawn parcel polygon */
  PARCEL_STYLE: {
    color:       '#ff6b6b',
    weight:      2.5,
    opacity:     0.9,
    fillColor:   '#3fb950',
    fillOpacity: 0.18,
    dashArray:   '5 4',
  },

  // ── Satellite imagery layer (Esri World Imagery) ──────────────────────────
  // Displayed once the cinematic zoom lands on the parcel.
  SATELLITE_TILE: {
    URL: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ATTRIBUTION: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; ' +
                 'Source: Esri, Maxar, Earthstar Geographics',
    MAX_ZOOM: 19,
  },

  // ── Cinematic zoom animation ───────────────────────────────────────────────
  ZOOM_ANIM: {
    FLY_DURATION:          2.0,   // seconds per Leaflet flyTo stage
    FLY_DURATION_FINAL:    2.5,   // seconds for the final parcel flyToBounds
    EASE_LINEARITY:        0.2,   // lower = more ease-in/out, more cinematic
    PAUSE_BETWEEN_STAGES:  350,   // ms pause at each waypoint
    PAUSE_BEFORE_SATELLITE: 500,  // ms pause before tile-layer swap
  },

  // ── Fixed geographic waypoints for the zoom sequence ─────────────────────
  // District / village are derived from the parcel centroid returned by the API.
  ZOOM_STAGES: {
    INDIA:     { center: [20.5937, 78.9629], zoom: 4 },
    KARNATAKA: { center: [15.3173, 75.7139], zoom: 7 },
    DISTRICT_ZOOM: 10,   // zoom level used for the "district" stage
    VILLAGE_ZOOM:  14,   // zoom level used for the "village" stage
  },
};


/* ── Module state ─────────────────────────────────────────────────────────── */

let map              = null;   // Leaflet map instance
let parcelLayer      = null;   // Currently drawn GeoJSON layer
let parcelData       = null;   // Last API response payload

// Tile layer references kept so we can hot-swap base ↔ satellite
let _baseTileLayer      = null;   // Dark CARTO layer
let _satelliteTileLayer = null;   // ESRI World Imagery (lazy-created on first use)
let _isSatelliteActive  = false;  // Which tile layer is currently showing

// Cinematic zoom abort token.
// Each call to animateZoomSequence() mints a fresh Symbol and stores it here.
// Mid-animation sleep/await steps check against this value; a mismatch means
// a newer animation has started and the current one should abort silently.
let _currentZoomToken = null;


/* ── K-GIS cascade dropdowns ──────────────────────────────────────────────── */
/*
 * Each select (district → taluk → hobli → village → survey) is populated
 * by calling the corresponding backend proxy endpoint.  Only names travel in
 * the POST /estimate-carbon payload; numeric K-GIS codes are used exclusively
 * for the cascade GET calls and stored as each <option>'s value attribute.
 *
 * Response shape expected from every cascade endpoint:
 *   GET /districts                  →  [{ code, name }, …]
 *   GET /taluks/{district_code}     →  [{ code, name }, …]
 *   GET /hoblis/{taluk_code}        →  [{ code, name }, …]
 *   GET /villages/{hobli_code}      →  [{ code, name }, …]
 *   GET /surveynumbers/{village_code} → [{ code, name }, …]
 *                                        (name = the survey number string)
 *
 * _normaliseItems() handles minor schema variations so the cascade logic
 * stays clean regardless of which key names the backend actually returns.
 */

/**
 * Normalise a raw API array into a consistent [{ code, name }] shape.
 * Tries the most common key names returned by K-GIS proxy endpoints.
 *
 * @param {Array<Object>} items  Raw JSON array from the API
 * @returns {Array<{code: string, name: string}>}
 */
function _normaliseItems(items) {
  return items.map(item => ({
    code: String(
      item.code      ?? item.distcode  ?? item.talukcode ??
      item.hoblicode ?? item.vcode     ?? item.surveycode ?? item.number ?? ''
    ),
    name: String(
      item.name      ?? item.distname  ?? item.talukname ??
      item.hobliname ?? item.vname     ?? item.villagename ?? item.surveynumber ?? item.code ?? ''
    ),
  })).filter(i => i.code && i.name);
}

/**
 * Populate a <select> element with items from the API.
 * Sets value=code on each <option> so cascade calls can use getSelectCode().
 *
 * @param {string}  selectId   DOM id of the <select>
 * @param {Array}   items      Normalised [{ code, name }] array
 * @param {string}  placeholder Text for the leading disabled option
 */
function _populateSelect(selectId, items, placeholder) {
  const el = document.getElementById(selectId);
  el.innerHTML = '';
  el.className = el.className.replace(/\bselect--error\b/g, '').trim();

  const blank = new Option(placeholder, '', true, true);
  blank.disabled = true;
  el.add(blank);

  items.forEach(({ code, name }) => el.add(new Option(name, code)));

  el.disabled = false;
}

/**
 * Reset a <select> to a "waiting for parent" state (disabled, single option).
 *
 * @param {string} selectId
 * @param {string} [message]
 */
function _resetSelect(selectId, message) {
  const el = document.getElementById(selectId);
  el.innerHTML = `<option value="" disabled selected>${message}</option>`;
  el.disabled = true;
  el.className = el.className.replace(/\bselect--error\b/g, '').trim();
}

/**
 * Put a <select> into a loading state (disabled, spinner text).
 *
 * @param {string} selectId
 */
function _setSelectLoading(selectId) {
  const el = document.getElementById(selectId);
  el.innerHTML = '<option value="" disabled selected>Loading…</option>';
  el.disabled = true;
  el.className = el.className.replace(/\bselect--error\b/g, '').trim();
}

/**
 * Put a <select> into an error state (enabled, red border, retry message).
 * The select stays enabled so the user can re-trigger by re-selecting the
 * parent — the parent's change listener will attempt a fresh fetch.
 *
 * @param {string} selectId
 * @param {string} [message]
 */
function _setSelectError(selectId, message = 'Failed to load — change selection to retry') {
  const el = document.getElementById(selectId);
  el.innerHTML = `<option value="" disabled selected>⚠ ${message}</option>`;
  el.disabled = false;
  el.classList.add('select--error');
}

/**
 * Read the numeric K-GIS code from a cascade <select> (the option value).
 *
 * @param {string} selectId
 * @returns {string}  Empty string if nothing valid is selected
 */
function _getSelectCode(selectId) {
  const el = document.getElementById(selectId);
  const opt = el.selectedOptions[0];
  return (opt && !opt.disabled && opt.value) ? opt.value : '';
}

/**
 * Read the display name from a cascade <select> (the option text).
 * This is what goes into the POST /estimate-carbon payload.
 *
 * @param {string} selectId
 * @returns {string}
 */
function _getSelectName(selectId) {
  const el = document.getElementById(selectId);
  const opt = el.selectedOptions[0];
  return (opt && !opt.disabled && opt.value) ? opt.textContent.trim() : '';
}

/* ── Cascade fetch functions ──────────────────────────────────────────────── */

/**
 * Load all Karnataka districts.  Called once on DOMContentLoaded.
 */
async function loadDistricts() {
  _setSelectLoading('f-district');
  ['f-taluk', 'f-hobli', 'f-village', 'f-survey'].forEach(id =>
    _resetSelect(id, '— Select district first —')
  );

  try {
    const resp = await fetch(`${CONFIG.API_BASE}/districts`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw  = await resp.json();
    const items = _normaliseItems(Array.isArray(raw) ? raw : raw.data ?? []);

    if (!items.length) throw new Error('Empty district list returned');
    _populateSelect('f-district', items, '— Select District —');

  } catch (err) {
    _setSelectError('f-district', 'Failed to load districts');
    console.error('[cascade] loadDistricts:', err);
  }
}

/**
 * Load taluks for the currently selected district.
 */
async function _loadTaluks() {
  const districtCode = _getSelectCode('f-district');
  ['f-taluk', 'f-hobli', 'f-village', 'f-survey'].forEach(id =>
    _resetSelect(id, '— Select district first —')
  );
  if (!districtCode) return;

  _setSelectLoading('f-taluk');
  ['f-hobli', 'f-village', 'f-survey'].forEach(id =>
    _resetSelect(id, '— Select taluk first —')
  );

  try {
    const resp = await fetch(`${CONFIG.API_BASE}/taluks/${districtCode}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw   = await resp.json();
    const items = _normaliseItems(Array.isArray(raw) ? raw : raw.data ?? []);

    if (!items.length) throw new Error('Empty taluk list returned');
    _populateSelect('f-taluk', items, '— Select Taluk —');

  } catch (err) {
    _setSelectError('f-taluk', 'Failed to load taluks');
    console.error('[cascade] _loadTaluks:', err);
  }
}

/**
 * Load hoblis for the currently selected taluk.
 */
async function _loadHoblis() {
  const talukCode = _getSelectCode('f-taluk');
  ['f-hobli', 'f-village', 'f-survey'].forEach(id =>
    _resetSelect(id, '— Select taluk first —')
  );
  if (!talukCode) return;

  _setSelectLoading('f-hobli');
  ['f-village', 'f-survey'].forEach(id =>
    _resetSelect(id, '— Select hobli first —')
  );

  try {
    const resp = await fetch(`${CONFIG.API_BASE}/hoblis/${talukCode}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw   = await resp.json();
    const items = _normaliseItems(Array.isArray(raw) ? raw : raw.data ?? []);

    if (!items.length) throw new Error('Empty hobli list returned');
    _populateSelect('f-hobli', items, '— Select Hobli —');

  } catch (err) {
    _setSelectError('f-hobli', 'Failed to load hoblis');
    console.error('[cascade] _loadHoblis:', err);
  }
}

/**
 * Load villages for the currently selected hobli.
 */
async function _loadVillages() {
  const hobliCode = _getSelectCode('f-hobli');
  ['f-village', 'f-survey'].forEach(id =>
    _resetSelect(id, '— Select hobli first —')
  );
  if (!hobliCode) return;

  _setSelectLoading('f-village');
  _resetSelect('f-survey', '— Select village first —');

  try {
    const resp = await fetch(`${CONFIG.API_BASE}/villages/${hobliCode}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw   = await resp.json();
    const items = _normaliseItems(Array.isArray(raw) ? raw : raw.data ?? []);

    if (!items.length) throw new Error('Empty village list returned');
    _populateSelect('f-village', items, '— Select Village —');

  } catch (err) {
    _setSelectError('f-village', 'Failed to load villages');
    console.error('[cascade] _loadVillages:', err);
  }
}

/**
 * Load survey numbers for the currently selected village.
 */
async function _loadSurveyNumbers() {
  const villageCode = _getSelectCode('f-village');
  _resetSelect('f-survey', '— Select village first —');
  if (!villageCode) return;

  _setSelectLoading('f-survey');

  try {
    const resp = await fetch(`${CONFIG.API_BASE}/surveynumbers/${villageCode}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw   = await resp.json();

    // Survey numbers: value and label are both the survey number string
    const rawItems = Array.isArray(raw) ? raw : raw.data ?? [];
    const items = rawItems.map(item => {
      const num = String(
        item.number ?? item.surveynumber ?? item.surveyno ??
        item.name   ?? item.code ?? item
      );
      return { code: num, name: num };
    }).filter(i => i.code);

    if (!items.length) throw new Error('No survey numbers returned');
    _populateSelect('f-survey', items, '— Select Survey No. —');

  } catch (err) {
    _setSelectError('f-survey', 'Failed to load survey numbers');
    console.error('[cascade] _loadSurveyNumbers:', err);
  }
}


/* ── Map initialisation ───────────────────────────────────────────────────── */

/**
 * Bootstrap the Leaflet map.  Called once on DOMContentLoaded.
 * Stores a reference to the base tile layer so the cinematic zoom can swap
 * it out for the satellite layer and back again without rebuilding the map.
 */
function initMap() {
  map = L.map('map', {
    center:      CONFIG.MAP_CENTER,
    zoom:        CONFIG.MAP_ZOOM,
    zoomControl: true,
  });

  // Keep a module-level reference so _swapToSatellite / _swapToBase can act on it
  _baseTileLayer = L.tileLayer(CONFIG.TILE_URL, {
    attribution: CONFIG.TILE_ATTRIBUTION,
    subdomains:  CONFIG.TILE_SUBDOMAINS,
    maxZoom:     CONFIG.TILE_MAX_ZOOM,
  }).addTo(map);
}


/* ── UI helpers ───────────────────────────────────────────────────────────── */

/**
 * Show a coloured status banner in the sidebar.
 *
 * @param {'loading'|'success'|'error'} type
 * @param {string} message
 * @param {string} [icon]  Emoji / text prepended to the message
 */
function setStatus(type, message, icon = '') {
  const el = document.getElementById('status-banner');
  el.className = `status-banner visible ${type}`;

  const iconHtml = icon
    ? `<span>${icon}</span>`
    : (type === 'loading' ? '<div class="spinner"></div>' : '');

  el.innerHTML = `${iconHtml} ${message}`;
}

/**
 * Hide the status banner entirely.
 */
function clearStatus() {
  document.getElementById('status-banner').className = 'status-banner';
}

/**
 * Enable or disable both action buttons while a request is in flight.
 *
 * @param {boolean} loading
 */
function setLoading(loading) {
  ['btn-estimate', 'btn-demo'].forEach(id => {
    document.getElementById(id).disabled = loading;
  });
}

/**
 * Format a number for display using the Indian locale.
 *
 * @param {number|null|undefined} n
 * @param {number} [dp=2]  Decimal places
 * @returns {string}
 */
function fmt(n, dp = 2) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: dp });
}

/**
 * Hide the results and provenance panels (called before each new request).
 */
function clearResultsPanel() {
  document.getElementById('results-panel').classList.remove('visible');
  document.getElementById('prov-panel').classList.remove('visible');
}


/* ── Result rendering ─────────────────────────────────────────────────────── */

/**
 * Populate the sidebar results section from a successful API response.
 *
 * @param {Object} data  CarbonEstimateResponse payload
 */
function renderResults(data) {
  document.getElementById('results-panel').classList.add('visible');
  document.getElementById('prov-panel').classList.add('visible');

  /* Parcel identity */
  document.getElementById('res-parcel-id').textContent = data.parcel_id;

  /* Metric values */
  document.getElementById('res-co2').textContent     = fmt(data.co2_equivalent_tons, 1);
  document.getElementById('res-ndvi').textContent    = fmt(data.ndvi_mean, 3);
  document.getElementById('res-canopy').textContent  = fmt(data.canopy_area_hectares, 2);
  document.getElementById('res-biomass').textContent = fmt(data.biomass_tons, 1);
  document.getElementById('res-carbon').textContent  = fmt(data.carbon_tons, 1);
  document.getElementById('res-area').textContent    = fmt(data.parcel_area_hectares, 2);
  document.getElementById('res-pixels').textContent  = fmt(data.vegetation_pixel_count, 0);

  /* Provenance rows */
  const rows = [
    ['Dataset',          data.satellite_dataset],
    ['Scenes used',      `${data.image_count} images`],
    ['Date range',       `${data.date_range.start} → ${data.date_range.end}`],
    ['Biomass density',  `${data.biomass_density_tons_per_ha} t/ha`],
    ['NDVI min / max',   `${fmt(data.ndvi_min, 3)} / ${fmt(data.ndvi_max, 3)}`],
  ];

  document.getElementById('prov-rows').innerHTML = rows
    .map(([key, val]) => `
      <div class="prov-row">
        <span class="prov-row__key">${key}</span>
        <span class="prov-row__value">${val}</span>
      </div>`)
    .join('');
}


/* ── Map helpers ──────────────────────────────────────────────────────────── */

/**
 * Draw the parcel boundary polygon on the map and open a summary popup.
 * The map is only auto-fitted when skipFit is false (default).
 * During the cinematic animation, skipFit=true because flyToBounds owns
 * the final position.
 *
 * @param {Object}  geojsonGeom  GeoJSON Polygon geometry dict
 * @param {Object}  data         CarbonEstimateResponse payload
 * @param {boolean} [skipFit]    When true, skip fitBounds (animation handles it)
 */
function drawParcel(geojsonGeom, data, skipFit = false) {
  /* Remove any previously drawn layer */
  if (parcelLayer) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
  }

  const feature = {
    type:       'Feature',
    geometry:   geojsonGeom,
    properties: {},
  };

  parcelLayer = L.geoJSON(feature, { style: CONFIG.PARCEL_STYLE }).addTo(map);

  /* Fit the map viewport to the parcel — skipped when animation owns the move */
  if (!skipFit) {
    map.fitBounds(parcelLayer.getBounds(), { padding: [60, 60] });
  }

  /* Summary popup shown at the polygon centroid */
  parcelLayer.bindPopup(`
    <b>🌿 ${data.parcel_id}</b><br/><br/>
    <b>NDVI</b> ${fmt(data.ndvi_mean, 3)}&nbsp;&nbsp;
    <b>Canopy</b> ${fmt(data.canopy_area_hectares)} ha<br/>
    <b>Biomass</b> ${fmt(data.biomass_tons, 1)} t&nbsp;&nbsp;
    <b>Carbon</b> ${fmt(data.carbon_tons, 1)} t C<br/>
    <b>CO₂e</b> ${fmt(data.co2_equivalent_tons, 1)} t CO₂e
  `).openPopup();
}


/* ── Cinematic zoom animation ─────────────────────────────────────────────── */
/*
 * The zoom sequence plays immediately after the backend returns data:
 *
 *   🌏 India (z4) ──flyTo──▶ Karnataka (z7) ──flyTo──▶
 *   District centroid (z10) ──flyTo──▶ Village centroid (z14) ──▶
 *   🛰️  [satellite layer swap] ──flyToBounds──▶ Parcel polygon
 *
 * Architecture notes
 * ──────────────────
 * • Each flyTo stage awaits a Leaflet `moveend` event so the next stage only
 *   starts when Leaflet has finished the previous animation.
 * • A Symbol token stored in _currentZoomToken allows a second run-estimation
 *   click to abort an in-progress animation without try/catch pollution at
 *   the call site — stale async chains just silently return.
 * • The parcel polygon is drawn with skipFit=true just before the final
 *   flyToBounds so it is visible from the moment the satellite tiles load.
 */

/**
 * Pause execution for a given number of milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Resolve when Leaflet fires its next `moveend` event on the map,
 * or after a safety timeout (guards against Leaflet not firing moveend when
 * a flyTo is called while already at the destination).
 *
 * @param {number} [timeoutMs=6000]
 * @returns {Promise<void>}
 */
function _waitForMoveEnd(timeoutMs = 6000) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs);   // safety net
    map.once('moveend', () => { clearTimeout(timer); resolve(); });
  });
}

/**
 * Compute the [lat, lng] centroid of a GeoJSON Polygon's outer ring.
 * Used to derive the "district" and "village" waypoints from the parcel
 * location returned by the API.
 *
 * @param {Object} geojsonGeom  GeoJSON Polygon geometry
 * @returns {[number, number]}  Leaflet [lat, lng] pair
 */
function _parcelCentroid(geojsonGeom) {
  const ring = geojsonGeom.coordinates[0];
  const lon  = ring.reduce((s, c) => s + c[0], 0) / ring.length;
  const lat  = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  return [lat, lon];
}

/**
 * Swap the active tile layer to ESRI satellite imagery.
 * Creates the satellite layer lazily on the first call.
 */
function _swapToSatellite() {
  if (_isSatelliteActive) return;

  if (_baseTileLayer) map.removeLayer(_baseTileLayer);

  if (!_satelliteTileLayer) {
    _satelliteTileLayer = L.tileLayer(CONFIG.SATELLITE_TILE.URL, {
      attribution: CONFIG.SATELLITE_TILE.ATTRIBUTION,
      maxZoom:     CONFIG.SATELLITE_TILE.MAX_ZOOM,
    });
  }
  _satelliteTileLayer.addTo(map);
  _isSatelliteActive = true;
}

/**
 * Swap the active tile layer back to the dark CARTO base map.
 * Called at the start of each new estimation to reset state.
 */
function _swapToBase() {
  if (!_isSatelliteActive) return;

  if (_satelliteTileLayer) map.removeLayer(_satelliteTileLayer);
  if (_baseTileLayer)      _baseTileLayer.addTo(map);
  _isSatelliteActive = false;
}

/**
 * Run the full cinematic space-to-parcel zoom sequence.
 *
 * Stages
 * ──────
 *  1. Jump to India overview (instant setView to avoid disorienting long fly)
 *  2. Fly to Karnataka region
 *  3. Fly to district level (derived from parcel centroid)
 *  4. Fly to village level  (derived from parcel centroid)
 *  5. Swap to satellite imagery
 *  6. Draw parcel polygon (skipFit=true)
 *  7. flyToBounds to the actual parcel — final landing frame
 *
 * @param {Object} geojsonGeom  GeoJSON Polygon geometry from the API response
 * @param {Object} data         Full CarbonEstimateResponse payload
 * @returns {Promise<void>}
 */
async function animateZoomSequence(geojsonGeom, data) {
  // Mint a new abort token.  Any previously-running animation that checks
  // _currentZoomToken will find a mismatch and return early.
  const token       = Symbol('zoom');
  _currentZoomToken = token;

  const centroid = _parcelCentroid(geojsonGeom);
  const {
    FLY_DURATION, FLY_DURATION_FINAL, EASE_LINEARITY,
    PAUSE_BETWEEN_STAGES, PAUSE_BEFORE_SATELLITE,
  } = CONFIG.ZOOM_ANIM;
  const { INDIA, KARNATAKA, DISTRICT_ZOOM, VILLAGE_ZOOM } = CONFIG.ZOOM_STAGES;

  /**
   * Helper: fly to a position and wait for Leaflet to finish.
   * Returns false if this animation has been superseded.
   */
  const flyStep = async (latlng, zoom, durationOverride) => {
    const dur = durationOverride ?? FLY_DURATION;
    map.flyTo(latlng, zoom, { duration: dur, easeLinearity: EASE_LINEARITY });
    await _waitForMoveEnd(dur * 1000 + 1500);
    if (_currentZoomToken !== token) return false;  // aborted
    await sleep(PAUSE_BETWEEN_STAGES);
    return _currentZoomToken === token;              // still active?
  };

  // ── Reset to base tile layer so the animation starts on the dark map ──────
  _swapToBase();

  // ── Stage 1: Snap to India overview (no fly — avoids a disorienting ───────
  //    very-long-distance zoom-out animation)
  setStatus('loading', '🛰️  Acquiring satellite view…');
  map.setView(INDIA.center, INDIA.zoom, { animate: false });
  await sleep(400);
  if (_currentZoomToken !== token) return;

  // ── Stage 2: Fly to Karnataka ─────────────────────────────────────────────
  setStatus('loading', '🌏 Zooming to Karnataka…');
  if (!await flyStep(KARNATAKA.center, KARNATAKA.zoom)) return;

  // ── Stage 3: Fly to district level ────────────────────────────────────────
  const districtName = _getSelectName('f-district') || 'district';
  setStatus('loading', `🗺️  Locating ${districtName}…`);
  if (!await flyStep(centroid, DISTRICT_ZOOM)) return;

  // ── Stage 4: Fly to village level ─────────────────────────────────────────
  const villageName = _getSelectName('f-village') || 'village';
  setStatus('loading', `🏘️  Finding ${villageName}…`);
  if (!await flyStep(centroid, VILLAGE_ZOOM)) return;

  // ── Stage 5: Satellite layer swap ─────────────────────────────────────────
  setStatus('loading', '🌿 Switching to satellite imagery…');
  await sleep(PAUSE_BEFORE_SATELLITE);
  if (_currentZoomToken !== token) return;

  _swapToSatellite();
  await sleep(300);   // brief pause so the tile grid starts rendering
  if (_currentZoomToken !== token) return;

  // ── Stage 6: Draw the parcel polygon (skipFit — animation owns the view) ──
  drawParcel(geojsonGeom, data, /* skipFit */ true);

  // ── Stage 7: Final flyToBounds onto the parcel ────────────────────────────
  setStatus('loading', '📍 Landing on parcel…');
  map.flyToBounds(parcelLayer.getBounds(), {
    padding:       [60, 60],
    duration:      FLY_DURATION_FINAL,
    easeLinearity: EASE_LINEARITY,
  });
  await _waitForMoveEnd(FLY_DURATION_FINAL * 1000 + 1500);
  if (_currentZoomToken !== token) return;

  // Open the popup after landing so it doesn't drift during the fly
  if (parcelLayer) parcelLayer.openPopup();
}

/**
 * Public wrapper: called by callEstimateEndpoint after a successful response.
 * Runs the cinematic sequence and falls back gracefully if anything breaks.
 *
 * @param {Object} geojsonGeom  GeoJSON Polygon geometry
 * @param {Object} data         CarbonEstimateResponse payload
 * @returns {Promise<void>}
 */
async function zoomToParcel(geojsonGeom, data) {
  try {
    await animateZoomSequence(geojsonGeom, data);
  } catch (err) {
    // If the animation throws for any non-abort reason, fall back to the
    // original instant draw so the user always gets a result on the map.
    console.warn('[carbon-engine] zoom animation error — falling back to fitBounds:', err);
    drawParcel(geojsonGeom, data, /* skipFit */ false);
  }
}


/* ── UI helpers ───────────────────────────────────────────────────────────── */

/**
 * Read the form fields and build the JSON payload for POST /estimate-carbon.
 *
 * district / taluk / hobli / village are now <select> elements.
 * The POST endpoint expects human-readable *names*, not K-GIS codes, so we
 * read the selected option's textContent via _getSelectName().
 * survey_no is also a <select>; its option value and text are both the
 * survey number string so either accessor works.
 *
 * @returns {Object}
 */
function buildPayload() {
  return {
    state:     document.getElementById('f-state').value.trim(),
    district:  _getSelectName('f-district'),
    taluk:     _getSelectName('f-taluk'),
    hobli:     _getSelectName('f-hobli') || null,
    village:   _getSelectName('f-village'),
    survey_no: _getSelectCode('f-survey'),          // survey value = survey name
    hissa:     document.getElementById('f-hissa').value.trim() || null,
  };
}

/**
 * Call a carbon estimation endpoint and handle the response lifecycle.
 *
 * @param {string} endpoint   Relative path, e.g. '/estimate-carbon'
 * @param {string} loadingMsg Status message shown while the request is running
 * @param {string} successMsg Status message shown on success (${co2} is templated in)
 * @param {string} successIcon Emoji for the success banner
 */
async function callEstimateEndpoint(endpoint, loadingMsg, successMsg, successIcon) {
  setLoading(true);
  setStatus('loading', loadingMsg);
  clearResultsPanel();

  try {
    const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(buildPayload()),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorBody.detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    parcelData = data;

    // Render the results panel immediately (doesn't depend on animation)
    renderResults(data);

    // Run the cinematic India → Karnataka → District → Village → Parcel
    // sequence.  zoomToParcel awaits every flyTo stage before resolving,
    // so the success status is only shown once the camera has landed.
    await zoomToParcel(data.parcel_polygon, data);

    const co2Formatted = fmt(data.co2_equivalent_tons, 1);
    setStatus('success', successMsg.replace('${co2}', co2Formatted), successIcon);

  } catch (err) {
    const hint = endpoint.includes('demo')
      ? ` — Is the API running at ${CONFIG.API_BASE}?`
      : '';
    setStatus('error', `Error: ${err.message}${hint}`, '✖');
    console.error('[carbon-engine]', err);
  } finally {
    setLoading(false);
  }
}


/* ── Public action handlers (called from onclick attributes in HTML) ───────── */

/**
 * Run the full GEE-backed estimation pipeline.
 */
async function runEstimate() {
  await callEstimateEndpoint(
    '/estimate-carbon',
    'Connecting to GEE and analysing imagery…',
    'Analysis complete — ${co2} t CO₂e estimated',
    '✔',
  );
}

/**
 * Run the demo endpoint (no GEE call, hardcoded values).
 */
async function runDemo() {
  await callEstimateEndpoint(
    '/estimate-carbon/demo',
    'Running demo estimation (no GEE call)…',
    'Demo complete — ${co2} t CO₂e estimated',
    '⚡',
  );
}

/* Expose action handlers so HTML onclick= attributes can reach them */
window.runEstimate = runEstimate;
window.runDemo     = runDemo;


/* ── Wiring ───────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  initMap();

  // ── Populate districts immediately on page load ─────────────────────────
  loadDistricts();

  // ── Cascade change listeners ─────────────────────────────────────────────
  // Each listener fires only when the user actually picks an option (not when
  // the select is reset programmatically, because disabled selects don't emit
  // change events).
  document.getElementById('f-district').addEventListener('change', _loadTaluks);
  document.getElementById('f-taluk').addEventListener('change',    _loadHoblis);
  document.getElementById('f-hobli').addEventListener('change',    _loadVillages);
  document.getElementById('f-village').addEventListener('change',  _loadSurveyNumbers);

  // ── Allow pressing Enter inside any form field to trigger estimation ─────
  document.getElementById('parcel-form').addEventListener('keydown', event => {
    if (event.key === 'Enter') runEstimate();
  });
});