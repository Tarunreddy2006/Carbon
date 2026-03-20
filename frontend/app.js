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
  API_BASE:         'http://localhost:8000',
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

/**
 * True when K-GIS district/taluk data is unavailable and ALL fields
 * have been replaced with plain text inputs.
 */
let _manualMode = false;

/**
 * True when district+taluk dropdowns work (static data) but
 * hobli/village/survey fields have no K-GIS data and use free-text inputs.
 * This is the normal operating mode without K-GIS credentials.
 */
let _partialManualMode = false;

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

/**
 * Read the display name from a field that may be a <select> or a plain
 * <input> (manual-mode replacement).
 *
 * In select mode: returns the text of the selected option (not its value),
 *   which is the human-readable name (district / taluk / village name).
 * In manual mode: the <select> has been replaced with an <input id="...">
 *   so we just return input.value.trim().
 */
function _getSelectName(selectId) {
  const el = document.getElementById(selectId);
  if (!el) return '';
  if (el.tagName === 'INPUT') return el.value.trim();   // manual mode
  const opt = el.selectedOptions[0];
  return (opt && !opt.disabled && opt.value) ? opt.textContent.trim() : '';
}

/**
 * Read the code/value from a field that may be a <select> or a plain <input>.
 *
 * In select mode: returns option.value (the numeric K-GIS code).
 * In manual mode: returns input.value.trim() — the user types the value directly.
 */
function _getSelectCode(selectId) {
  const el = document.getElementById(selectId);
  if (!el) return '';
  if (el.tagName === 'INPUT') return el.value.trim();   // manual mode
  const opt = el.selectedOptions[0];
  return (opt && !opt.disabled && opt.value) ? opt.value : '';
}

/* ── Manual input fallback ────────────────────────────────────────────────── */

/**
 * Called when K-GIS hierarchy returns an empty list for /districts.
 *
 * Replaces all five cascade <select> elements with plain <input type="text">
 * elements that share the same IDs.  Because .form-group input already has
 * the same visual rules as .form-group select, no CSS changes are needed.
 *
 * After this runs:
 *  • _manualMode is true — all cascade load functions early-return
 *  • _getSelectName / _getSelectCode handle INPUT elements transparently
 *  • buildPayload() is unchanged — it still calls _getSelectName / _getSelectCode
 *  • The zoom animation's _districtCentre() still works via _getSelectName
 */
/**
 * Switch ALL five fields to plain text inputs.
 * Only triggered when even the static district/taluk data fails to load.
 */
function _switchToManualMode() {
  if (_manualMode) return;
  _manualMode = true;
  _partialManualMode = true;

  const fields = [
    { id: 'f-district', placeholder: 'e.g. Mysuru' },
    { id: 'f-taluk',    placeholder: 'e.g. Nanjangud' },
    { id: 'f-hobli',    placeholder: 'e.g. Nanjangud (optional)' },
    { id: 'f-village',  placeholder: 'e.g. Somanahalli' },
    { id: 'f-survey',   placeholder: 'e.g. 45' },
  ];

  fields.forEach(function({ id, placeholder }) {
    const select = document.getElementById(id);
    if (!select || select.tagName !== 'SELECT') return;
    const input = document.createElement('input');
    input.type        = 'text';
    input.id          = id;
    input.placeholder = placeholder;
    input.className   = select.className.replace(/\bselect--error\b/g, '').trim();
    select.parentNode.replaceChild(input, select);
  });

  setStatus('loading', '\u26a0\uFE0F  K-GIS unavailable — type all fields directly');
  console.info('[cascade] fully switched to manual text-entry mode');
}

/**
 * Switch ONLY hobli / village / survey to plain text inputs.
 * District and taluk keep their working dropdowns (static data).
 * This is the normal mode when K-GIS credentials are not available.
 */
function _switchToPartialManualMode() {
  if (_partialManualMode) return;
  _partialManualMode = true;

  const fields = [
    { id: 'f-hobli',   placeholder: 'e.g. Nanjangud (optional)' },
    { id: 'f-village', placeholder: 'e.g. Somanahalli' },
    { id: 'f-survey',  placeholder: 'e.g. 45' },
  ];

  fields.forEach(function({ id, placeholder }) {
    const select = document.getElementById(id);
    if (!select || select.tagName !== 'SELECT') return;
    const input = document.createElement('input');
    input.type        = 'text';
    input.id          = id;
    input.placeholder = placeholder;
    input.className   = select.className.replace(/\bselect--error\b/g, '').trim();
    select.parentNode.replaceChild(input, select);
  });

  // Clear the loading status — district/taluk dropdowns are working fine
  clearStatus();
  console.info('[cascade] hobli/village/survey switched to text inputs (K-GIS credentials needed for these levels)');
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

    if (!items.length) {
      // K-GIS returned [] (null response, SSL failure, or service down).
      // Switch to manual entry so the form remains usable.
      _switchToManualMode();
      return;
    }

    _populateSelect('f-district', items, '— Select District —');
  } catch (err) {
    // Network error or non-200 — also switch to manual mode rather than
    // leaving the dropdown permanently broken.
    _switchToManualMode();
    console.warn('[cascade] loadDistricts network error — switching to manual mode:', err);
  }
}

async function _loadTaluks() {
  // In manual mode the user types directly — cascade loads are not needed.
  if (_manualMode) return;

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
  if (_manualMode) return;

  const talukCode = _getSelectCode('f-taluk');
  if (!_partialManualMode) {
    ['f-hobli', 'f-village', 'f-survey'].forEach(id => _resetSelect(id, '— Select taluk first —'));
  }
  if (!talukCode) return;

  // If already in partial manual mode, hobli/village/survey are text inputs
  if (_partialManualMode) return;

  _setSelectLoading('f-hobli');
  ['f-village', 'f-survey'].forEach(id => _resetSelect(id, '— Select hobli first —'));
  try {
    const resp  = await fetch(`${CONFIG.API_BASE}/hoblis/${talukCode}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw   = await resp.json();
    const items = _normaliseItems(Array.isArray(raw) ? raw : (raw.data || []));
    if (!items.length) {
      // No hobli data available — switch hobli/village/survey to text inputs
      _switchToPartialManualMode();
      return;
    }
    _populateSelect('f-hobli', items, '— Select Hobli —');
  } catch (err) {
    _switchToPartialManualMode();
    console.warn('[cascade] _loadHoblis: no data, switched to partial manual mode:', err);
  }
}

async function _loadVillages() {
  if (_manualMode) return;

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
  if (_manualMode) return;

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

function _polygonCentroid(geojson) {
  const ring = geojson.coordinates[0];
  const lons = ring.map(function(c) { return c[0]; });
  const lats = ring.map(function(c) { return c[1]; });
  return [
    (Math.min.apply(null, lats) + Math.max.apply(null, lats)) / 2,
    (Math.min.apply(null, lons) + Math.max.apply(null, lons)) / 2,
  ];
}

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
 * Works in both select mode (reads selected option text) and manual mode
 * (reads input.value) because _getSelectName handles both element types.
 */
function _districtCentre(fallback) {
  const raw    = _getSelectName('f-district');
  const titled = raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase();
  return DISTRICT_CENTRES[titled] || fallback;
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function _waitForMoveEnd(timeoutMs) {
  timeoutMs = timeoutMs || 6000;
  return new Promise(function(resolve) {
    var timer = setTimeout(resolve, timeoutMs);
    map.once('moveend', function() { clearTimeout(timer); resolve(); });
  });
}

async function _flyAndWait(centre, zoom, durSec) {
  var dur = durSec !== undefined ? durSec : CONFIG.ZOOM_ANIM.FLY_DURATION;
  map.flyTo(centre, zoom, { animate: true, duration: dur, easeLinearity: CONFIG.ZOOM_ANIM.EASE_LINEARITY });
  await _waitForMoveEnd(dur * 1000 + 2000);
  await sleep(CONFIG.ZOOM_ANIM.PAUSE_BETWEEN_STAGES);
}

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

function _swapToBase() {
  if (!_isSatelliteActive) return;
  if (_satelliteTileLayer) _satelliteTileLayer.remove();
  if (_baseTileLayer)      _baseTileLayer.addTo(map);
  _isSatelliteActive = false;
}

async function animateZoomSequence(geojsonGeom, data) {
  var token       = Symbol('zoom');
  _currentZoomToken = token;
  var stale       = function() { return _currentZoomToken !== token; };

  var centroid   = _polygonCentroid(geojsonGeom);
  var distCentre = _districtCentre(centroid);

  if (parcelLayer) { map.removeLayer(parcelLayer); parcelLayer = null; }
  _swapToBase();

  setStatus('loading', '\uD83D\uDEF0\uFE0F  Acquiring satellite lock\u2026');
  map.setView(CONFIG.ZOOM_STAGES.INDIA.center, CONFIG.ZOOM_STAGES.INDIA.zoom, { animate: false });
  await sleep(400);
  if (stale()) return;

  setStatus('loading', '\uD83D\uDDFA\uFE0F  Zooming to Karnataka\u2026');
  await _flyAndWait(CONFIG.ZOOM_STAGES.KARNATAKA.center, CONFIG.ZOOM_STAGES.KARNATAKA.zoom);
  if (stale()) return;

  var districtName = _getSelectName('f-district') || 'district';
  setStatus('loading', '\uD83D\uDCCD Closing in on ' + districtName + '\u2026');
  await _flyAndWait(distCentre, CONFIG.ZOOM_STAGES.DISTRICT_ZOOM);
  if (stale()) return;

  var villageName = _getSelectName('f-village') || 'village';
  setStatus('loading', '\uD83C\uDFD8\uFE0F  Locating ' + villageName + '\u2026');
  await _flyAndWait(centroid, CONFIG.ZOOM_STAGES.VILLAGE_ZOOM);
  if (stale()) return;

  setStatus('loading', '\uD83D\uDEF0\uFE0F  Switching to satellite view\u2026');
  _swapToSatellite();
  await sleep(CONFIG.ZOOM_ANIM.PAUSE_BEFORE_SATELLITE);
  if (stale()) return;

  setStatus('loading', '\uD83C\uDF3F Zooming to parcel\u2026');
  map.flyToBounds(_polygonBounds(geojsonGeom), {
    padding:       [80, 80],
    animate:       true,
    duration:      CONFIG.ZOOM_ANIM.FLY_DURATION_FINAL,
    easeLinearity: CONFIG.ZOOM_ANIM.EASE_LINEARITY,
  });
  await _waitForMoveEnd(CONFIG.ZOOM_ANIM.FLY_DURATION_FINAL * 1000 + 2000);
  if (stale()) return;

  await sleep(250);
  if (stale()) return;
  drawParcel(geojsonGeom, data, true);
  if (parcelLayer) parcelLayer.openPopup();
}

async function zoomToParcel(geojsonGeom, data) {
  try {
    await animateZoomSequence(geojsonGeom, data);
  } catch (err) {
    console.warn('[carbon-engine] zoom animation error — falling back to fitBounds:', err);
    drawParcel(geojsonGeom, data, false);
  }
}

/* ── API layer ────────────────────────────────────────────────────────────── */

/**
 * Build the POST body from current form state.
 *
 * Works identically in both dropdown mode and manual text-entry mode because
 * _getSelectName / _getSelectCode detect the element type (SELECT vs INPUT)
 * and return the appropriate value in each case.  No branching needed here.
 */
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

    renderResults(data);
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