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
  API_BASE:         'http://127.0.0.1:8000',
  MAP_CENTER:       [12.295, 76.639],
  MAP_ZOOM:         10,
  TILE_URL:         'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  TILE_ATTRIBUTION: '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/">OSM</a>',
  TILE_SUBDOMAINS:  'abcd',
  TILE_MAX_ZOOM:    19,

  PARCEL_STYLE: {
    color:       '#ff6b6b',
    weight:      2.5,
    opacity:     0.9,
    fillColor:   '#3fb950',
    fillOpacity: 0.18,
    dashArray:   '5 4',
  },

  SATELLITE_TILE: {
    URL: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ATTRIBUTION: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics',
    MAX_ZOOM: 19,
  },

  ZOOM_ANIM: {
    FLY_DURATION:           2.0,
    FLY_DURATION_FINAL:     2.5,
    EASE_LINEARITY:         0.2,
    PAUSE_BETWEEN_STAGES:   350,
    PAUSE_BEFORE_SATELLITE: 500,
  },

  ZOOM_STAGES: {
    INDIA:         { center: [20.5937, 78.9629], zoom: 4 },
    KARNATAKA:     { center: [15.3173, 75.7139], zoom: 7 },
    DISTRICT_ZOOM: 10,
    VILLAGE_ZOOM:  14,
  },
};

/* ── Module state ─────────────────────────────────────────────────────────── */

let map              = null;
let parcelLayer      = null;
let parcelData       = null;

let _baseTileLayer      = null;
let _satelliteTileLayer = null;
let _isSatelliteActive  = false;
let _currentZoomToken   = null;

/* ── K-GIS cascade helpers ────────────────────────────────────────────────── */

function _normaliseItems(items) {
  return items.map(item => ({
    code: String(item.code ?? item.distcode ?? item.talukcode ?? item.hoblicode ?? item.vcode ?? item.surveycode ?? item.number ?? ''),
    name: String(item.name ?? item.distname ?? item.talukname ?? item.hobliname ?? item.vname ?? item.villagename ?? item.surveynumber ?? item.code ?? ''),
  })).filter(i => i.code && i.name);
}

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

function _resetSelect(selectId, message) {
  const el = document.getElementById(selectId);
  el.innerHTML = `<option value="" disabled selected>${message}</option>`;
  el.disabled  = true;
  el.className = el.className.replace(/\bselect--error\b/g, '').trim();
}

function _setSelectLoading(selectId) {
  const el = document.getElementById(selectId);
  el.innerHTML = '<option value="" disabled selected>Loading\u2026</option>';
  el.disabled  = true;
  el.className = el.className.replace(/\bselect--error\b/g, '').trim();
}

function _setSelectError(selectId, message) {
  message = message || 'Failed to load — change selection to retry';
  const el = document.getElementById(selectId);
  el.innerHTML = `<option value="" disabled selected>\u26a0 ${message}</option>`;
  el.disabled  = false;
  el.classList.add('select--error');
}

function _getSelectCode(selectId) {
  const el  = document.getElementById(selectId);
  const opt = el.selectedOptions[0];
  return (opt && !opt.disabled && opt.value) ? opt.value : '';
}

function _getSelectName(selectId) {
  const el  = document.getElementById(selectId);
  const opt = el.selectedOptions[0];
  return (opt && !opt.disabled && opt.value) ? opt.textContent.trim() : '';
}

/* ── Cascade fetch functions ──────────────────────────────────────────────── */

async function loadDistricts() {
  _setSelectLoading('f-district');
  ['f-taluk', 'f-hobli', 'f-village', 'f-survey'].forEach(id => _resetSelect(id, '— Select district first —'));
  try {
    const resp  = await fetch(`${CONFIG.API_BASE}/districts`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw   = await resp.json();
    const items = _normaliseItems(Array.isArray(raw) ? raw : (raw.data || []));
    if (!items.length) throw new Error('Empty district list returned');
    _populateSelect('f-district', items, '— Select District —');
  } catch (err) {
    _setSelectError('f-district', 'Failed to load districts');
    console.error('[cascade] loadDistricts:', err);
  }
}

async function _loadTaluks() {
  const districtCode = _getSelectCode('f-district');
  ['f-taluk', 'f-hobli', 'f-village', 'f-survey'].forEach(id => _resetSelect(id, '— Select district first —'));
  if (!districtCode) return;
  _setSelectLoading('f-taluk');
  ['f-hobli', 'f-village', 'f-survey'].forEach(id => _resetSelect(id, '— Select taluk first —'));
  try {
    const resp  = await fetch(`${CONFIG.API_BASE}/taluks/${districtCode}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw   = await resp.json();
    const items = _normaliseItems(Array.isArray(raw) ? raw : (raw.data || []));
    if (!items.length) throw new Error('Empty taluk list returned');
    _populateSelect('f-taluk', items, '— Select Taluk —');
  } catch (err) {
    _setSelectError('f-taluk', 'Failed to load taluks');
    console.error('[cascade] _loadTaluks:', err);
  }
}

async function _loadHoblis() {
  const talukCode = _getSelectCode('f-taluk');
  ['f-hobli', 'f-village', 'f-survey'].forEach(id => _resetSelect(id, '— Select taluk first —'));
  if (!talukCode) return;
  _setSelectLoading('f-hobli');
  ['f-village', 'f-survey'].forEach(id => _resetSelect(id, '— Select hobli first —'));
  try {
    const resp  = await fetch(`${CONFIG.API_BASE}/hoblis/${talukCode}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw   = await resp.json();
    const items = _normaliseItems(Array.isArray(raw) ? raw : (raw.data || []));
    if (!items.length) throw new Error('Empty hobli list returned');
    _populateSelect('f-hobli', items, '— Select Hobli —');
  } catch (err) {
    _setSelectError('f-hobli', 'Failed to load hoblis');
    console.error('[cascade] _loadHoblis:', err);
  }
}

async function _loadVillages() {
  const hobliCode = _getSelectCode('f-hobli');
  ['f-village', 'f-survey'].forEach(id => _resetSelect(id, '— Select hobli first —'));
  if (!hobliCode) return;
  _setSelectLoading('f-village');
  _resetSelect('f-survey', '— Select village first —');
  try {
    const resp  = await fetch(`${CONFIG.API_BASE}/villages/${hobliCode}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw   = await resp.json();
    const items = _normaliseItems(Array.isArray(raw) ? raw : (raw.data || []));
    if (!items.length) throw new Error('Empty village list returned');
    _populateSelect('f-village', items, '— Select Village —');
  } catch (err) {
    _setSelectError('f-village', 'Failed to load villages');
    console.error('[cascade] _loadVillages:', err);
  }
}

async function _loadSurveyNumbers() {
  const villageCode = _getSelectCode('f-village');
  _resetSelect('f-survey', '— Select village first —');
  if (!villageCode) return;
  _setSelectLoading('f-survey');
  try {
    const resp     = await fetch(`${CONFIG.API_BASE}/surveynumbers/${villageCode}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw      = await resp.json();
    const rawItems = Array.isArray(raw) ? raw : (raw.data || []);
    const items    = rawItems.map(item => {
      const num = String(item.number ?? item.surveynumber ?? item.surveyno ?? item.name ?? item.code ?? item);
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

function initMap() {
  map = L.map('map', { center: CONFIG.MAP_CENTER, zoom: CONFIG.MAP_ZOOM, zoomControl: true });
  _baseTileLayer = L.tileLayer(CONFIG.TILE_URL, {
    attribution: CONFIG.TILE_ATTRIBUTION,
    subdomains:  CONFIG.TILE_SUBDOMAINS,
    maxZoom:     CONFIG.TILE_MAX_ZOOM,
  }).addTo(map);
}

/* ── UI helpers ───────────────────────────────────────────────────────────── */

function setStatus(type, message, icon) {
  icon = icon || '';
  const el = document.getElementById('status-banner');
  el.className = `status-banner visible ${type}`;
  const iconHtml = icon ? `<span>${icon}</span>` : (type === 'loading' ? '<div class="spinner"></div>' : '');
  el.innerHTML = `${iconHtml} ${message}`;
}

function clearStatus() {
  document.getElementById('status-banner').className = 'status-banner';
}

function setLoading(loading) {
  ['btn-estimate', 'btn-demo'].forEach(id => { document.getElementById(id).disabled = loading; });
}

function fmt(n, dp) {
  dp = dp === undefined ? 2 : dp;
  if (n === null || n === undefined) return '\u2014';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: dp });
}

function clearResultsPanel() {
  document.getElementById('results-panel').classList.remove('visible');
  document.getElementById('prov-panel').classList.remove('visible');
}

/* ── Result rendering ─────────────────────────────────────────────────────── */

function renderResults(data) {
  document.getElementById('results-panel').classList.add('visible');
  document.getElementById('prov-panel').classList.add('visible');

  document.getElementById('res-parcel-id').textContent = data.parcel_id;
  document.getElementById('res-co2').textContent       = fmt(data.co2_equivalent_tons, 1);
  document.getElementById('res-ndvi').textContent      = fmt(data.ndvi_mean, 3);
  document.getElementById('res-canopy').textContent    = fmt(data.canopy_area_hectares, 2);
  document.getElementById('res-biomass').textContent   = fmt(data.biomass_tons, 1);
  document.getElementById('res-carbon').textContent    = fmt(data.carbon_tons, 1);
  document.getElementById('res-area').textContent      = fmt(data.parcel_area_hectares, 2);
  document.getElementById('res-pixels').textContent    = fmt(data.vegetation_pixel_count, 0);

  const rows = [
    ['Dataset',         data.satellite_dataset],
    ['Scenes used',     `${data.image_count} images`],
    ['Date range',      `${data.date_range.start} \u2192 ${data.date_range.end}`],
    ['Biomass density', `${data.biomass_density_tons_per_ha} t/ha`],
    ['NDVI min / max',  `${fmt(data.ndvi_min, 3)} / ${fmt(data.ndvi_max, 3)}`],
  ];

  document.getElementById('prov-rows').innerHTML = rows
    .map(([key, val]) => `<div class="prov-row"><span class="prov-row__key">${key}</span><span class="prov-row__value">${val}</span></div>`)
    .join('');
}

/* ── Map helpers ──────────────────────────────────────────────────────────── */

/**
 * Draw the parcel boundary polygon on the map and open a summary popup.
 * skipFit=true suppresses fitBounds when the cinematic animation owns the view.
 */
function drawParcel(geojsonGeom, data, skipFit) {
  skipFit = skipFit || false;
  if (parcelLayer) { map.removeLayer(parcelLayer); parcelLayer = null; }

  parcelLayer = L.geoJSON(
    { type: 'Feature', geometry: geojsonGeom, properties: {} },
    { style: CONFIG.PARCEL_STYLE }
  ).addTo(map);

  if (!skipFit) { map.fitBounds(parcelLayer.getBounds(), { padding: [60, 60] }); }

  parcelLayer.bindPopup(
    `<b>\uD83C\uDF3F ${data.parcel_id}</b><br/><br/>` +
    `<b>NDVI</b> ${fmt(data.ndvi_mean, 3)}&nbsp;&nbsp;` +
    `<b>Canopy</b> ${fmt(data.canopy_area_hectares)} ha<br/>` +
    `<b>Biomass</b> ${fmt(data.biomass_tons, 1)} t&nbsp;&nbsp;` +
    `<b>Carbon</b> ${fmt(data.carbon_tons, 1)} t C<br/>` +
    `<b>CO\u2082e</b> ${fmt(data.co2_equivalent_tons, 1)} t CO\u2082e`
  ).openPopup();
}

/* ── Cinematic zoom animation ─────────────────────────────────────────────── */
/*
 * Instagram-style space → parcel zoom sequence.
 *
 * Stage sequence:
 *   1  snap   India overview      z=4   (instant setView — no disorienting long-haul fly)
 *   2  fly    Karnataka           z=7   (dark basemap, establish state context)
 *   3  fly    District centroid   z=10  (uses DISTRICT_CENTRES table for accurate waypoint)
 *   4  fly    Parcel centroid     z=14  (arrive at the farm neighbourhood)
 *   5  swap   → Esri satellite          (replace dark tiles with aerial imagery)
 *   6  fly    Parcel bounds       fit   (cinematic landing on the exact plot)
 *   7  draw   Parcel polygon             (materialise the red boundary + popup)
 *
 * Cancellation: each run mints a Symbol token stored in _currentZoomToken.
 * Every await checkpoint calls stale(); a mismatch means a newer run started
 * and this one returns silently without throwing or leaving map artifacts.
 */

/** Karnataka district → [lat, lon] centroids for stage-3 waypoints. */
const DISTRICT_CENTRES = {
  'Mysuru':           [12.2958,  76.6394],
  'Bengaluru':        [12.9716,  77.5946],
  'Mandya':           [12.5218,  76.8950],
  'Hassan':           [13.0033,  76.1000],
  'Kodagu':           [12.4244,  75.7480],
  'Tumakuru':         [13.3379,  77.1010],
  'Shivamogga':       [13.9299,  75.5681],
  'Dharwad':          [15.4589,  75.0078],
  'Belagavi':         [15.8497,  74.4977],
  'Kalaburagi':       [17.3297,  76.8240],
  'Davanagere':       [14.4663,  75.9238],
  'Chitradurga':      [14.2251,  76.3998],
  'Ballari':          [15.1394,  76.9214],
  'Vijayapura':       [16.8302,  75.7195],
  'Raichur':          [16.2120,  77.3566],
  'Udupi':            [13.3409,  74.7421],
  'Dakshina Kannada': [12.8438,  75.0000],
  'Uttara Kannada':   [14.7937,  74.7902],
  'Chikkamagaluru':   [13.3161,  75.7720],
  'Chamarajanagar':   [11.9230,  77.0000],
  'Ramanagara':       [12.7157,  77.2780],
};

/**
 * Bounding-box midpoint of a GeoJSON Polygon.
 * More stable than ring-average for non-convex parcels.
 */
function _polygonCentroid(geojson) {
  const ring = geojson.coordinates[0];
  const lons = ring.map(function(c) { return c[0]; });
  const lats = ring.map(function(c) { return c[1]; });
  return [
    (Math.min.apply(null, lats) + Math.max.apply(null, lats)) / 2,
    (Math.min.apply(null, lons) + Math.max.apply(null, lons)) / 2,
  ];
}

/**
 * Leaflet-compatible LatLngBounds from a GeoJSON Polygon.
 * Returns [[minLat, minLon], [maxLat, maxLon]].
 */
function _polygonBounds(geojson) {
  const ring = geojson.coordinates[0];
  const lons = ring.map(function(c) { return c[0]; });
  const lats = ring.map(function(c) { return c[1]; });
  return [
    [Math.min.apply(null, lats), Math.min.apply(null, lons)],
    [Math.max.apply(null, lats), Math.max.apply(null, lons)],
  ];
}

/**
 * Best [lat, lon] waypoint for the district stage.
 * Looks up the current f-district selection in DISTRICT_CENTRES;
 * falls back to the parcel centroid when the district is not in the table.
 */
function _districtCentre(fallback) {
  const raw    = _getSelectName('f-district');
  const titled = raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase();
  return DISTRICT_CENTRES[titled] || fallback;
}

/** Pause for ms milliseconds. */
function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

/**
 * Resolve on Leaflet's next 'moveend' event.
 * Safety timeout prevents hanging on zero-distance flyTo calls.
 */
function _waitForMoveEnd(timeoutMs) {
  timeoutMs = timeoutMs || 6000;
  return new Promise(function(resolve) {
    var timer = setTimeout(resolve, timeoutMs);
    map.once('moveend', function() { clearTimeout(timer); resolve(); });
  });
}

/**
 * flyTo a waypoint and wait for the animation to finish, then dwell briefly
 * so the user can absorb the view before the next stage begins.
 */
async function _flyAndWait(centre, zoom, durSec) {
  var dur = durSec !== undefined ? durSec : CONFIG.ZOOM_ANIM.FLY_DURATION;
  map.flyTo(centre, zoom, { animate: true, duration: dur, easeLinearity: CONFIG.ZOOM_ANIM.EASE_LINEARITY });
  await _waitForMoveEnd(dur * 1000 + 2000);
  await sleep(CONFIG.ZOOM_ANIM.PAUSE_BETWEEN_STAGES);
}

/** Replace the dark CARTO basemap with Esri satellite imagery (lazy, idempotent). */
function _swapToSatellite() {
  if (_isSatelliteActive) return;
  if (_baseTileLayer) _baseTileLayer.remove();
  if (!_satelliteTileLayer) {
    _satelliteTileLayer = L.tileLayer(CONFIG.SATELLITE_TILE.URL, {
      attribution: CONFIG.SATELLITE_TILE.ATTRIBUTION,
      maxZoom:     CONFIG.SATELLITE_TILE.MAX_ZOOM,
    });
  }
  _satelliteTileLayer.addTo(map);
  _isSatelliteActive = true;
}

/** Restore the dark CARTO basemap (idempotent). */
function _swapToBase() {
  if (!_isSatelliteActive) return;
  if (_satelliteTileLayer) _satelliteTileLayer.remove();
  if (_baseTileLayer)      _baseTileLayer.addTo(map);
  _isSatelliteActive = false;
}

/**
 * Run the full cinematic space → parcel zoom sequence.
 * renderResults() is called before this by callEstimateEndpoint() so
 * the sidebar populates while the camera is still in flight.
 */
async function animateZoomSequence(geojsonGeom, data) {
  var token       = Symbol('zoom');
  _currentZoomToken = token;
  var stale       = function() { return _currentZoomToken !== token; };

  var centroid   = _polygonCentroid(geojsonGeom);
  var distCentre = _districtCentre(centroid);

  // Stage 0: clean slate — remove previous overlay, restore dark basemap
  if (parcelLayer) { map.removeLayer(parcelLayer); parcelLayer = null; }
  _swapToBase();

  // Stage 1: India overview — instant snap, no long-haul fly-out
  setStatus('loading', '\uD83D\uDEF0\uFE0F  Acquiring satellite lock\u2026');
  map.setView(CONFIG.ZOOM_STAGES.INDIA.center, CONFIG.ZOOM_STAGES.INDIA.zoom, { animate: false });
  await sleep(400);
  if (stale()) return;

  // Stage 2: Karnataka
  setStatus('loading', '\uD83D\uDDFA\uFE0F  Zooming to Karnataka\u2026');
  await _flyAndWait(CONFIG.ZOOM_STAGES.KARNATAKA.center, CONFIG.ZOOM_STAGES.KARNATAKA.zoom);
  if (stale()) return;

  // Stage 3: District centroid
  var districtName = _getSelectName('f-district') || 'district';
  setStatus('loading', '\uD83D\uDCCD Closing in on ' + districtName + '\u2026');
  await _flyAndWait(distCentre, CONFIG.ZOOM_STAGES.DISTRICT_ZOOM);
  if (stale()) return;

  // Stage 4: Village / parcel neighbourhood
  var villageName = _getSelectName('f-village') || 'village';
  setStatus('loading', '\uD83C\uDFD8\uFE0F  Locating ' + villageName + '\u2026');
  await _flyAndWait(centroid, CONFIG.ZOOM_STAGES.VILLAGE_ZOOM);
  if (stale()) return;

  // Stage 5: Swap to satellite imagery
  setStatus('loading', '\uD83D\uDEF0\uFE0F  Switching to satellite view\u2026');
  _swapToSatellite();
  await sleep(CONFIG.ZOOM_ANIM.PAUSE_BEFORE_SATELLITE);
  if (stale()) return;

  // Stage 6: Final flyToBounds onto the exact parcel
  setStatus('loading', '\uD83C\uDF3F Zooming to parcel\u2026');
  map.flyToBounds(_polygonBounds(geojsonGeom), {
    padding:       [80, 80],
    animate:       true,
    duration:      CONFIG.ZOOM_ANIM.FLY_DURATION_FINAL,
    easeLinearity: CONFIG.ZOOM_ANIM.EASE_LINEARITY,
  });
  await _waitForMoveEnd(CONFIG.ZOOM_ANIM.FLY_DURATION_FINAL * 1000 + 2000);
  if (stale()) return;

  // Stage 7: Draw polygon (skipFit — animation already positioned the viewport)
  await sleep(250);   // dramatic beat before the boundary materialises
  if (stale()) return;
  drawParcel(geojsonGeom, data, true);
  if (parcelLayer) parcelLayer.openPopup();
}

/**
 * Public entry point — wraps animateZoomSequence with a graceful fallback.
 * If the animation throws, falls back to an instant fitBounds draw.
 */
async function zoomToParcel(geojsonGeom, data) {
  try {
    await animateZoomSequence(geojsonGeom, data);
  } catch (err) {
    console.warn('[carbon-engine] zoom animation error — falling back to fitBounds:', err);
    drawParcel(geojsonGeom, data, false);
  }
}

/* ── API layer ────────────────────────────────────────────────────────────── */

function buildPayload() {
  return {
    state:     document.getElementById('f-state').value.trim(),
    district:  _getSelectName('f-district'),
    taluk:     _getSelectName('f-taluk'),
    hobli:     _getSelectName('f-hobli') || null,
    village:   _getSelectName('f-village'),
    survey_no: _getSelectCode('f-survey'),
    hissa:     document.getElementById('f-hissa').value.trim() || null,
  };
}

async function callEstimateEndpoint(endpoint, loadingMsg, successMsg, successIcon) {
  setLoading(true);
  setStatus('loading', loadingMsg);
  clearResultsPanel();

  try {
    var response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(buildPayload()),
    });

    if (!response.ok) {
      var errorBody = await response.json().catch(function() { return { detail: response.statusText }; });
      throw new Error(errorBody.detail || `HTTP ${response.status}`);
    }

    var data = await response.json();
    parcelData = data;

    // Populate sidebar immediately — visible while camera is still flying
    renderResults(data);

    // Run cinematic sequence; success banner shown only after animation resolves
    await zoomToParcel(data.parcel_polygon, data);

    var co2Formatted = fmt(data.co2_equivalent_tons, 1);
    setStatus('success', successMsg.replace('${co2}', co2Formatted), successIcon);

  } catch (err) {
    var hint = endpoint.includes('demo') ? ` — Is the API running at ${CONFIG.API_BASE}?` : '';
    setStatus('error', `Error: ${err.message}${hint}`, '\u2716');
    console.error('[carbon-engine]', err);
  } finally {
    setLoading(false);
  }
}

/* ── Public action handlers ───────────────────────────────────────────────── */

async function runEstimate() {
  await callEstimateEndpoint(
    '/estimate-carbon',
    'Connecting to GEE and analysing imagery\u2026',
    'Analysis complete \u2014 ${co2} t CO\u2082e estimated',
    '\u2714'
  );
}

async function runDemo() {
  await callEstimateEndpoint(
    '/estimate-carbon/demo',
    'Running demo estimation (no GEE call)\u2026',
    'Demo complete \u2014 ${co2} t CO\u2082e estimated',
    '\u26a1'
  );
}

window.runEstimate = runEstimate;
window.runDemo     = runDemo;

/* ── Wiring ───────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function() {
  initMap();
  loadDistricts();

  document.getElementById('f-district').addEventListener('change', _loadTaluks);
  document.getElementById('f-taluk').addEventListener('change',    _loadHoblis);
  document.getElementById('f-hobli').addEventListener('change',    _loadVillages);
  document.getElementById('f-village').addEventListener('change',  _loadSurveyNumbers);

  document.getElementById('parcel-form').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') runEstimate();
  });
});
