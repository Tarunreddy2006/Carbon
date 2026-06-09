/**
 * app.js — Carbon Biomass Intelligence Engine
 * GPS-based location → draw polygon → GEE carbon estimation
 *
 * Mapping layer: MapLibre GL JS + @mapbox/mapbox-gl-draw
 * (Migrated from Leaflet + Leaflet.Draw)
 */
'use strict';

// ==========================================
// 1. 3D REVOLVING EARTH BACKGROUND
// ==========================================
// Removed wireframe earth logic. Replaced by initStarryBackground() at the bottom.

// ==========================================
// 2. TABBED LOGIN LOGIC
// ==========================================
// ==========================================
// LOGIN & AUTHENTICATION STATE
// ==========================================
let currentLoginRole = 'farmer'; // 🟢 Default memory state

function switchLoginTab(role) {
  // 1. Save the clicked role to memory
  currentLoginRole = role;

  // 2. Update the visual tabs
  const farmerTab = document.getElementById('login-tab-farmer');
  const instTab = document.getElementById('login-tab-institution');

  if (farmerTab && instTab) {
    farmerTab.classList.remove('active');
    instTab.classList.remove('active');
    document.getElementById(`login-tab-${role}`).classList.add('active');
  }
}

async function performLogin() {
  const user = document.getElementById('login-user').value;
  const pass = document.getElementById('login-pass').value;
  const errorText = document.getElementById('login-error');
  const loginBtn = document.querySelector('.btn--primary');

  // Validate inputs
  if (!user || !pass) {
    errorText.innerText = 'Please enter username and password.';
    errorText.style.display = 'block';
    return;
  }

  // Show loading state
  const originalContent = loginBtn.innerHTML;
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<div class="spinner"></div> Authenticating...';
  errorText.style.display = 'none';

  try {
    const data = await api.login(currentLoginRole, { username: user, password: pass });

    // Save the JWT token
    sessionStorage.setItem(CONFIG.TOKEN_KEY, data.access_token);
    sessionStorage.setItem(CONFIG.ROLE_KEY, currentLoginRole);

    // Transition to main app
    processSuccessfulLogin(data.access_token);

  } catch (error) {
    errorText.innerText = error.message || `Invalid ${currentLoginRole} credentials.`;
    errorText.style.display = 'block';
    loginBtn.disabled = false;
    loginBtn.innerHTML = originalContent;
  }
}

// CONFIG is now loaded from config.js (included via <script> tag before app.js)

/* ── State ─────────────────────────────────────────────────────────────────── */
let map, draw;
let drawnPolygon = null;
let currentResultPopup = null;
let locationMarker = null;
let locationAccuracySource = null;
let _isSat = false;
let _isDrawing = false;
let trendChart = null; // Chart.js instance for trends

/* ── Map initialisation ────────────────────────────────────────────────────── */

function initMap() {
  if (map) {
    window.setTimeout(function () { map.resize(); }, 0);
    return;
  }

  // MapLibre GL map — build a raster style object on the fly from CONFIG tile URLs
  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      name: 'CarbonEngine Satellite',
      sources: {
        'satellite-tiles': {
          type: 'raster',
          tiles: [CONFIG.SAT_URL],
          tileSize: 256,
          attribution: CONFIG.SAT_ATTR,
          maxzoom: 20
        },
        'dark-tiles': {
          type: 'raster',
          tiles: [
            CONFIG.DARK_URL
              .replace('{s}', 'a')
              .replace('{r}', '')
          ],
          tileSize: 256,
          attribution: CONFIG.DARK_ATTR,
          maxzoom: 19
        }
      },
      layers: [
        {
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite-tiles',
          layout: { visibility: 'visible' }
        },
        {
          id: 'dark-layer',
          type: 'raster',
          source: 'dark-tiles',
          layout: { visibility: 'none' }
        }
      ]
    },
    center: [CONFIG.MAP_CENTER[1], CONFIG.MAP_CENTER[0]], // [lng, lat] — CONFIG stores [lat, lng]
    zoom: CONFIG.MAP_ZOOM,
    attributionControl: true
  });

  _isSat = true;

  // Navigation controls
  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  // MapboxDraw — polygon drawing tool
  draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: {},
    defaultMode: 'simple_select',
    styles: [
      // Active polygon fill
      {
        id: 'gl-draw-polygon-fill',
        type: 'fill',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        paint: {
          'fill-color': CONFIG.DRAW_STYLE.fillColor || '#3fb950',
          'fill-opacity': CONFIG.DRAW_STYLE.fillOpacity || 0.12
        }
      },
      // Active polygon outline
      {
        id: 'gl-draw-polygon-stroke-active',
        type: 'line',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        paint: {
          'line-color': CONFIG.DRAW_STYLE.color || '#3fb950',
          'line-width': CONFIG.DRAW_STYLE.weight || 2
        }
      },
      // Vertex points
      {
        id: 'gl-draw-point',
        type: 'circle',
        filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
        paint: {
          'circle-radius': 5,
          'circle-color': '#fff',
          'circle-stroke-color': CONFIG.DRAW_STYLE.color || '#3fb950',
          'circle-stroke-width': 2
        }
      },
      // Midpoint indicators
      {
        id: 'gl-draw-point-midpoint',
        type: 'circle',
        filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
        paint: {
          'circle-radius': 3,
          'circle-color': CONFIG.DRAW_STYLE.color || '#3fb950'
        }
      },
      // Static (committed) polygon fill
      {
        id: 'gl-draw-polygon-fill-static',
        type: 'fill',
        filter: ['all', ['==', '$type', 'Polygon'], ['==', 'mode', 'static']],
        paint: {
          'fill-color': CONFIG.DRAW_STYLE.fillColor || '#3fb950',
          'fill-opacity': CONFIG.DRAW_STYLE.fillOpacity || 0.12
        }
      },
      // Static polygon outline
      {
        id: 'gl-draw-polygon-stroke-static',
        type: 'line',
        filter: ['all', ['==', '$type', 'Polygon'], ['==', 'mode', 'static']],
        paint: {
          'line-color': CONFIG.DRAW_STYLE.color || '#3fb950',
          'line-width': CONFIG.DRAW_STYLE.weight || 2
        }
      },
      // Active line strings
      {
        id: 'gl-draw-line',
        type: 'line',
        filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
        paint: {
          'line-color': CONFIG.DRAW_STYLE.color || '#3fb950',
          'line-width': CONFIG.DRAW_STYLE.weight || 2
        }
      }
    ]
  });

  map.addControl(draw, 'top-left');

  // ── Draw event listeners (replaces Leaflet L.Draw.Event.CREATED) ──────
  map.on('draw.create', function (e) {
    var features = e.features;
    if (!features || features.length === 0) return;

    var feature = features[0];
    if (feature.geometry.type !== 'Polygon') return;

    // MapboxDraw emits GeoJSON in [lng, lat] order — exactly what GEE expects
    var coords = feature.geometry.coordinates[0];

    // 🔒 FIX: Ensure the linear ring is closed (A→B→C→D→A) — PostGIS/GEE require it
    if (coords.length > 0) {
      var first = coords[0];
      var last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push([first[0], first[1]]);
      }
    }

    drawnPolygon = {
      type: 'Polygon',
      coordinates: [coords]
    };

    // Clear any stale pasted coordinates so runEstimation uses the drawn polygon
    window.currentPolygonCoords = null;

    _isDrawing = false;
    _updateDrawBtn(false);
    _onDrawn();
  });

  map.on('draw.update', function (e) {
    var features = e.features;
    if (!features || features.length === 0) return;

    var feature = features[0];
    if (feature.geometry.type !== 'Polygon') return;

    var coords = feature.geometry.coordinates[0];

    // Ensure the ring is closed
    if (coords.length > 0) {
      var first = coords[0];
      var last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push([first[0], first[1]]);
      }
    }

    drawnPolygon = {
      type: 'Polygon',
      coordinates: [coords]
    };

    window.currentPolygonCoords = null;
  });

  map.on('draw.delete', function () {
    drawnPolygon = null;
    window.currentPolygonCoords = null;

    const btnEstimateFarmer = document.getElementById('btn-estimate-farmer');
    const btnEstimateInst = document.getElementById('btn-estimate-inst');
    const btnClear = document.getElementById('btn-clear');
    const btnClearInst = document.getElementById('btn-clear-inst');

    if (btnEstimateFarmer) btnEstimateFarmer.disabled = true;
    if (btnEstimateInst) btnEstimateInst.disabled = true;
    if (btnClear) btnClear.disabled = true;
    if (btnClearInst) btnClearInst.disabled = true;
  });

  // ── Provision result overlay source + layers on map load ──────────────
  map.on('load', function () {
    // GeoJSON runtime source for result parcels
    map.addSource('result-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // Result fill layer
    map.addLayer({
      id: 'result-layer-fill',
      type: 'fill',
      source: 'result-source',
      paint: {
        'fill-color': CONFIG.DONE_STYLE.fillColor || '#3fb950',
        'fill-opacity': CONFIG.DONE_STYLE.fillOpacity || 0.18
      }
    });

    // Result outline layer
    map.addLayer({
      id: 'result-layer-outline',
      type: 'line',
      source: 'result-source',
      paint: {
        'line-color': CONFIG.DONE_STYLE.color || '#ff6b6b',
        'line-width': CONFIG.DONE_STYLE.weight || 2.5,
        'line-opacity': CONFIG.DONE_STYLE.opacity || 0.9,
        'line-dasharray': [5, 4]
      }
    });

    // Location accuracy circle source (for GPS)
    map.addSource('location-accuracy', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'location-accuracy-fill',
      type: 'fill',
      source: 'location-accuracy',
      paint: {
        'fill-color': '#58a6ff',
        'fill-opacity': 0.10
      }
    });

    map.addLayer({
      id: 'location-accuracy-outline',
      type: 'line',
      source: 'location-accuracy',
      paint: {
        'line-color': '#58a6ff',
        'line-width': 1,
        'line-dasharray': [4, 4]
      }
    });
  });
}

/* ── GPS location ──────────────────────────────────────────────────────────── */

/* ── GPS accuracy constants ──────────────────────────────────────────────── */
var GPS_TARGET_ACCURACY = 20;   // metres — stop refining once this is reached
var GPS_MAX_WAIT_MS = 20000; // max time to wait for a good fix
var _watchId = null;

/**
 * Create a GeoJSON circle polygon (approximation) for rendering GPS accuracy.
 * MapLibre GL doesn't have L.circle() — we generate a polygon.
 */
function _createGeoJSONCircle(center, radiusMeters, points) {
  if (!points) points = 64;
  var coords = [];
  var distanceX = radiusMeters / (111320 * Math.cos(center[1] * Math.PI / 180));
  var distanceY = radiusMeters / 110540;

  for (var i = 0; i < points; i++) {
    var theta = (i / points) * (2 * Math.PI);
    var x = distanceX * Math.cos(theta);
    var y = distanceY * Math.sin(theta);
    coords.push([center[0] + x, center[1] + y]);
  }
  coords.push(coords[0]); // close ring

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords]
    },
    properties: {}
  };
}

function goToMyLocation() {
  if (!navigator.geolocation) {
    setStatus('error', 'Geolocation is not supported by your browser', '✖');
    return;
  }

  // Stop any previous watch
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }

  setStatus('loading', '📍  Acquiring GPS signal — move to an open area for best accuracy…');
  document.getElementById('btn-gps').disabled = true;
  if (document.getElementById('btn-gps-inst')) document.getElementById('btn-gps-inst').disabled = true;

  var startTime = Date.now();
  var bestAccuracy = Infinity;
  var hasFlewToLocation = false;

  _watchId = navigator.geolocation.watchPosition(
    function (pos) {
      var lat = pos.coords.latitude;
      var lon = pos.coords.longitude;
      var acc = Math.round(pos.coords.accuracy);

      // Only update if this fix is better than the last
      if (acc >= bestAccuracy && hasFlewToLocation) return;
      bestAccuracy = acc;

      // Remove previous marker
      if (locationMarker) {
        locationMarker.remove();
        locationMarker = null;
      }

      // Draw accuracy circle via GeoJSON source
      if (map.getSource('location-accuracy')) {
        var circleFeature = _createGeoJSONCircle([lon, lat], acc);
        map.getSource('location-accuracy').setData({
          type: 'FeatureCollection',
          features: [circleFeature]
        });
      }

      // Centre dot — use a MapLibre GL Marker
      var markerEl = document.createElement('div');
      markerEl.style.width = '14px';
      markerEl.style.height = '14px';
      markerEl.style.borderRadius = '50%';
      markerEl.style.background = '#58a6ff';
      markerEl.style.border = '2px solid #fff';
      markerEl.style.boxShadow = '0 0 6px rgba(88, 166, 255, 0.5)';

      locationMarker = new maplibregl.Marker({ element: markerEl })
        .setLngLat([lon, lat])
        .setPopup(
          new maplibregl.Popup({ offset: 10 }).setHTML(
            '📍 <b>You are here</b><br>' +
            '<small>' + lat.toFixed(6) + ', ' + lon.toFixed(6) + '</small><br>' +
            '<small>Accuracy: <b>±' + acc + ' m</b></small>' +
            (acc > 100 ? '<br><small style="color:#d29922">⚠ Low accuracy — open a window or use mobile</small>' : '')
          )
        )
        .addTo(map);

      // Fly to location on first fix
      if (!hasFlewToLocation) {
        map.flyTo({ center: [lon, lat], zoom: 17, duration: 1500 });
        hasFlewToLocation = true;
      } else {
        map.panTo([lon, lat], { duration: 500 });
      }

      // Update status with current accuracy
      if (acc <= GPS_TARGET_ACCURACY) {
        // Good enough — stop watching
        navigator.geolocation.clearWatch(_watchId);
        _watchId = null;
        locationMarker.togglePopup();
        clearStatus();
        document.getElementById('btn-gps').disabled = false;
        if (document.getElementById('btn-gps-inst')) document.getElementById('btn-gps-inst').disabled = false;
        _setStep(2);
        var labelEl = document.getElementById('f-label');
        if (labelEl && !labelEl.value.trim()) {
          labelEl.value = 'Farm at ' + lat.toFixed(5) + ', ' + lon.toFixed(5);
        }
      } else {
        setStatus('loading',
          '📍  Refining GPS… accuracy ±' + acc + ' m' +
          (acc > 500 ? ' (device GPS warming up — keep waiting)' : '') +
          ' — target ±' + GPS_TARGET_ACCURACY + ' m'
        );
      }

      // Stop after max wait time regardless of accuracy
      if (Date.now() - startTime > GPS_MAX_WAIT_MS) {
        navigator.geolocation.clearWatch(_watchId);
        _watchId = null;
        locationMarker.togglePopup();
        document.getElementById('btn-gps').disabled = false;
        if (document.getElementById('btn-gps-inst')) document.getElementById('btn-gps-inst').disabled = false;
        _setStep(2);
        if (acc <= 100) {
          clearStatus();
        } else {
          setStatus('loading',
            '⚠  Best accuracy achieved: ±' + acc + ' m. ' +
            (acc > 500
              ? 'Open on mobile for GPS accuracy.'
              : 'Pan the map manually if needed.')
          );
        }
        var labelEl = document.getElementById('f-label');
        if (labelEl && !labelEl.value.trim()) {
          labelEl.value = 'Farm at ' + lat.toFixed(5) + ', ' + lon.toFixed(5);
        }
      }
    },
    function (err) {
      if (_watchId !== null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; }
      var msg = {
        1: 'Location access denied — click the 🔒 icon in the address bar and allow location',
        2: 'Location unavailable — ensure GPS is enabled on your device',
        3: 'GPS timed out — try again in an open area',
      }[err.code] || 'Could not get location: ' + err.message;
      setStatus('error', msg, '✖');
      document.getElementById('btn-gps').disabled = false;
      if (document.getElementById('btn-gps-inst')) document.getElementById('btn-gps-inst').disabled = false;
    },
    { enableHighAccuracy: true, timeout: GPS_MAX_WAIT_MS, maximumAge: 0 }
  );
}

/* ── Drawing ───────────────────────────────────────────────────────────────── */

function startDrawing() {
  if (_isDrawing) {
    // Cancel current drawing — switch back to simple_select
    draw.changeMode('simple_select');
    _isDrawing = false;
    _updateDrawBtn(false);
    clearStatus();
    return;
  }

  // Clear existing drawings
  draw.deleteAll();
  drawnPolygon = null;
  // 🔒 FIX: Clear pasted coordinates to prevent ghost geometry overriding the new drawing
  window.currentPolygonCoords = null;

  // Clear result layers
  _clearResultLayers();

  const btnEstimateFarmer = document.getElementById('btn-estimate-farmer');
  const btnEstimateInst = document.getElementById('btn-estimate-inst');
  const btnClear = document.getElementById('btn-clear');
  const btnClearInst = document.getElementById('btn-clear-inst');

  if (btnEstimateFarmer) btnEstimateFarmer.disabled = true;
  if (btnEstimateInst) btnEstimateInst.disabled = true;
  if (btnClear) btnClear.disabled = true;
  if (btnClearInst) btnClearInst.disabled = true;

  clearResultsPanel();

  _isDrawing = true;
  _updateDrawBtn(true);

  // Activate polygon drawing mode
  draw.changeMode('draw_polygon');

  setStatus('loading', '✏️  Click points around your farm boundary. Double-click to finish.');
}

function clearPolygon() {
  draw.deleteAll();
  drawnPolygon = null;
  window.currentPolygonCoords = null;

  // Clear result layers
  _clearResultLayers();

  const btnEstimateFarmer = document.getElementById('btn-estimate-farmer');
  const btnEstimateInst = document.getElementById('btn-estimate-inst');
  const btnClear = document.getElementById('btn-clear');
  const btnClearInst = document.getElementById('btn-clear-inst');

  if (btnEstimateFarmer) btnEstimateFarmer.disabled = true;
  if (btnEstimateInst) btnEstimateInst.disabled = true;
  if (btnClear) btnClear.disabled = true;
  if (btnClearInst) btnClearInst.disabled = true;

  clearStatus();
  clearResultsPanel();
}

/**
 * Helper to clear result-source data, COG tile overlays, and any open popups.
 */
function _clearResultLayers() {
  if (map && map.getSource('result-source')) {
    map.getSource('result-source').setData({
      type: 'FeatureCollection',
      features: []
    });
  }
  if (currentResultPopup) {
    currentResultPopup.remove();
    currentResultPopup = null;
  }
  // Remove existing COG tile overlay if present
  _removeCogOverlay();
}

/* ── COG Tile Overlay (TiTiler Dynamic Streaming) ──────────────────────── */

var _activeCogLayerId = null;
var _activeCogSourceId = null;

/**
 * Adds a dynamic raster tile overlay from TiTiler onto the MapLibre GL map.
 *
 * @param {string} tilesUrl — The TiTiler XYZ tile URL template with {z}/{x}/{y}
 * @param {object} [bounds] — Optional [sw, ne] bounding box to constrain tiles
 */
function addCogTileOverlay(tilesUrl, bounds) {
  if (!map || !tilesUrl) return;

  // Remove any existing COG overlay first
  _removeCogOverlay();

  // Generate unique IDs to prevent collisions
  var uid = 'cog-' + Date.now();
  _activeCogSourceId = uid + '-source';
  _activeCogLayerId = uid + '-layer';

  // The TiTiler URL uses {z}/{x}/{y} but MapLibre expects the same notation
  // Ensure the URL template is in the correct format
  var tileUrlForMapLibre = tilesUrl
    .replace('{z}', '{z}')
    .replace('{x}', '{x}')
    .replace('{y}', '{y}');

  // Add the raster tile source
  map.addSource(_activeCogSourceId, {
    type: 'raster',
    tiles: [tileUrlForMapLibre],
    tileSize: 256,
    bounds: bounds || undefined,
    attribution: 'NDVI © Sentinel-2 via TiTiler'
  });

  // Insert the raster layer BELOW the result-layer-fill so the vector
  // parcel boundary always renders on top of the heatmap
  var beforeLayerId = 'result-layer-fill';
  if (!map.getLayer(beforeLayerId)) {
    beforeLayerId = undefined;
  }

  map.addLayer({
    id: _activeCogLayerId,
    type: 'raster',
    source: _activeCogSourceId,
    paint: {
      'raster-opacity': 0.75,
      'raster-fade-duration': 300
    }
  }, beforeLayerId);

  console.log('[COG] Dynamic tile overlay added:', _activeCogLayerId);
}

/**
 * Remove the active COG raster overlay from the map.
 */
function _removeCogOverlay() {
  if (!map) return;

  if (_activeCogLayerId && map.getLayer(_activeCogLayerId)) {
    map.removeLayer(_activeCogLayerId);
  }
  if (_activeCogSourceId && map.getSource(_activeCogSourceId)) {
    map.removeSource(_activeCogSourceId);
  }

  _activeCogLayerId = null;
  _activeCogSourceId = null;
}

// ==========================================
// INSTITUTIONAL FEATURE: PASTE COORDINATES
// ==========================================
// ==========================================
// INSTITUTIONAL FEATURE: PASTE COORDINATES
// ==========================================
// ==========================================
// INSTITUTIONAL FEATURE: SMART COORDINATE PARSER
// ==========================================
function loadPastedCoordinates() {
  const text = document.getElementById('f-coords').value.trim();
  if (!text) {
    alert("Please paste coordinates first.");
    return;
  }

  let latlngs = [];
  let geoJsonCoords = [];

  try {
    // ATTEMPT 1: Parse as JSON Array (GeoJSON format: [[lng, lat], ...])
    if (text.startsWith('[')) {
      const parsed = JSON.parse(text);
      latlngs = parsed.map(coord => [coord[1], coord[0]]);
      geoJsonCoords = [...parsed];
    }
    else {
      // ATTEMPT 2: Check for DMS (Degrees, Minutes, Seconds) like 18°19'53" N
      // This regex captures the degrees, minutes, seconds, and direction letter
      const dmsRegex = /(\d+)[°\s]+(\d+)['\s]+([\d.]+)(?:["\s]+)?([NSEW])/gi;
      let match;
      let dmsCoords = [];

      while ((match = dmsRegex.exec(text)) !== null) {
        let deg = parseFloat(match[1]);
        let min = parseFloat(match[2]);
        let sec = parseFloat(match[3]);
        let dir = match[4].toUpperCase();

        // Convert DMS to Decimal Degrees
        let dd = deg + (min / 60) + (sec / 3600);
        if (dir === 'S' || dir === 'W') dd = dd * -1;

        dmsCoords.push(dd);
      }

      // If we found DMS coordinates, pair them up
      if (dmsCoords.length > 0) {
        for (let i = 0; i < dmsCoords.length - 1; i += 2) {
          latlngs.push([dmsCoords[i], dmsCoords[i + 1]]);
          geoJsonCoords.push([dmsCoords[i + 1], dmsCoords[i]]);
        }
      }
      // ATTEMPT 3: Standard Decimal Extraction (Fallback)
      else {
        const numbers = text.match(/-?\d+(\.\d+)?/g);
        if (!numbers || numbers.length < 2) throw new Error("No valid coordinates found.");

        for (let i = 0; i < numbers.length - 1; i += 2) {
          latlngs.push([parseFloat(numbers[i]), parseFloat(numbers[i + 1])]);
          geoJsonCoords.push([parseFloat(numbers[i + 1]), parseFloat(numbers[i])]);
        }
      }
    }

    // ==========================================
    // SCENARIO A: SINGLE CENTER POINT PROVIDED
    // ==========================================
    if (latlngs.length === 1) {
      const center = latlngs[0]; // [lat, lng]

      // Fly to the location at a good zoom level for farms — MapLibre uses [lng, lat]
      map.flyTo({ center: [center[1], center[0]], zoom: 15, duration: 1500 });

      // Drop a temporary marker to guide the user
      new maplibregl.Marker({ color: '#3fb950' })
        .setLngLat([center[1], center[0]])
        .setPopup(
          new maplibregl.Popup({ offset: 10 }).setHTML(
            "<b>Project Center Point</b><br>Please use the Draw tool to outline the boundaries."
          )
        )
        .addTo(map)
        .togglePopup();

      document.getElementById('f-coords').value = "";
      alert("Center point located! We've flown you there. Please draw the exact polygon boundaries around this area to run the estimation.");
      return; // Stop here, don't try to draw a polygon
    }

    // ==========================================
    // SCENARIO B: FULL POLYGON PROVIDED
    // ==========================================
    if (latlngs.length < 3) throw new Error("A polygon requires at least 3 points.");

    // Close the polygon for the backend
    const first = geoJsonCoords[0];
    const last = geoJsonCoords[geoJsonCoords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      geoJsonCoords.push([...first]);
    }

    // Clear existing drawings
    if (typeof clearPolygon === 'function') clearPolygon();
    draw.deleteAll();

    // Draw new polygon using MapboxDraw
    var pastedFeature = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [geoJsonCoords]
      },
      properties: {}
    };

    draw.add(pastedFeature);

    // Fit bounds — compute bounding box from [lng, lat] coords
    var lngs = geoJsonCoords.map(function (c) { return c[0]; });
    var lats = geoJsonCoords.map(function (c) { return c[1]; });
    var sw = [Math.min.apply(null, lngs), Math.min.apply(null, lats)];
    var ne = [Math.max.apply(null, lngs), Math.max.apply(null, lats)];

    map.fitBounds([sw, ne], { padding: 50, duration: 1500 });

    // Save state and unlock UI
    window.currentPolygonCoords = geoJsonCoords;

    const btnEstimateFarmer = document.getElementById('btn-estimate-farmer');
    const btnEstimateInst = document.getElementById('btn-estimate-inst');
    const btnClear = document.getElementById('btn-clear');
    const btnClearInst = document.getElementById('btn-clear-inst');

    if (btnEstimateFarmer) btnEstimateFarmer.disabled = false;
    if (btnEstimateInst) btnEstimateInst.disabled = false;
    if (btnClear) btnClear.disabled = false;
    if (btnClearInst) btnClearInst.disabled = false;

    document.getElementById('f-coords').value = "";

    if (typeof showStatus === 'function') showStatus("Coordinates loaded successfully.", "success");

  } catch (e) {
    console.error(e);
    alert("Could not parse coordinates. Please try again.");
  }
}
function _updateDrawBtn(drawing) {
  var btn = document.getElementById('btn-draw');
  var btnInst = document.getElementById('btn-draw-inst');
  if (btn) {
    btn.textContent = drawing ? '⏹ Cancel Drawing' : '✏️ Draw Polygon';
    btn.classList.toggle('btn--drawing', drawing);
  }
  if (btnInst) {
    btnInst.textContent = drawing ? '⏹ Cancel Drawing' : '✏️ Draw Polygon';
    btnInst.classList.toggle('btn--drawing', drawing);
  }
}

function _onDrawn() {
  const btnEstimateFarmer = document.getElementById('btn-estimate-farmer');
  const btnEstimateInst = document.getElementById('btn-estimate-inst');
  const btnClear = document.getElementById('btn-clear');
  const btnClearInst = document.getElementById('btn-clear-inst');

  if (btnEstimateFarmer) btnEstimateFarmer.disabled = false;
  if (btnEstimateInst) btnEstimateInst.disabled = false;
  if (btnClear) btnClear.disabled = false;
  if (btnClearInst) btnClearInst.disabled = false;

  setStatus('loading', '✅  Polygon drawn — click Run Estimation to analyse');
}

function _setStep(n) {
  ['gps', 'draw', 'run'].forEach(function (id, i) {
    var el = document.getElementById('step-' + id);
    if (el) el.classList.toggle('active', i + 1 === n);
  });
}

/* ── Tile swap ─────────────────────────────────────────────────────────────── */

function _swapToSatellite() {
  if (_isSat) return;
  map.setLayoutProperty('dark-layer', 'visibility', 'none');
  map.setLayoutProperty('satellite-layer', 'visibility', 'visible');
  _isSat = true;
}

function _swapToDark() {
  if (!_isSat) return;
  map.setLayoutProperty('satellite-layer', 'visibility', 'none');
  map.setLayoutProperty('dark-layer', 'visibility', 'visible');
  _isSat = false;
}

/* ── Result rendering ──────────────────────────────────────────────────────── */

function drawResult(geojson, data) {
  // Clear previous results
  _clearResultLayers();
  draw.deleteAll();

  let confStr = data.confidence_score ? data.confidence_score.toFixed(1) + '%' : '-';

  // Push result geometry into the result GeoJSON source
  var resultFeature = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: geojson,
      properties: {}
    }]
  };

  if (map.getSource('result-source')) {
    map.getSource('result-source').setData(resultFeature);
  }

  // Compute center of the parcel bounding box for the popup
  var ring = geojson.coordinates[0];
  var lons = ring.map(function (c) { return c[0]; });
  var lats = ring.map(function (c) { return c[1]; });
  var centerLng = (Math.min.apply(null, lons) + Math.max.apply(null, lons)) / 2;
  var centerLat = (Math.min.apply(null, lats) + Math.max.apply(null, lats)) / 2;

  // Create and bind popup at center
  currentResultPopup = new maplibregl.Popup({ offset: 10, maxWidth: '320px' })
    .setLngLat([centerLng, centerLat])
    .setHTML(
      '<b>🌿 ' + data.parcel_id + '</b><br><br>' +
      '<b>Confidence Score</b> <b style="color:#58a6ff">' + confStr + '</b><br>' +
      '<b>NDVI</b> ' + fmt(data.ndvi_mean, 3) + '&nbsp;&nbsp;' +
      '<b>Canopy</b> ' + fmt(data.canopy_area_hectares) + ' ha<br>' +
      '<b>Biomass</b> ' + fmt(data.biomass_tons, 1) + ' t&nbsp;&nbsp;' +
      '<b>Carbon</b> ' + fmt(data.carbon_tons, 1) + ' t C<br>' +
      '<b>CO₂e</b> <b style="color:#3fb950">' + fmt(data.co2_equivalent_tons, 1) + ' t</b>'
    )
    .addTo(map);

  // Fit bounds with satellite
  var sw = [Math.min.apply(null, lons), Math.min.apply(null, lats)];
  var ne = [Math.max.apply(null, lons), Math.max.apply(null, lats)];

  setTimeout(function () {
    _swapToSatellite();
    map.fitBounds([sw, ne], { padding: 80, duration: 1500 });
  }, 200);

  // ── Stream COG NDVI heatmap via TiTiler if available ─────────────────
  if (data.ndvi_tiles_url) {
    // Wait for the camera transition to complete before adding the raster layer
    // so MapLibre requests tiles at the correct zoom level
    setTimeout(function () {
      addCogTileOverlay(data.ndvi_tiles_url, [sw, ne]);
    }, 2000);
  }
}

function renderResults(data) {
  document.getElementById('results-panel').classList.add('visible');
  document.getElementById('prov-panel').classList.add('visible');
  document.getElementById('res-parcel-id').textContent = data.parcel_id;
  document.getElementById('res-co2').textContent = fmt(data.co2_equivalent_tons, 1);
  document.getElementById('res-ndvi').textContent = fmt(data.ndvi_mean, 3);
  document.getElementById('res-canopy').textContent = fmt(data.canopy_area_hectares, 2);
  document.getElementById('res-biomass').textContent = fmt(data.biomass_tons, 1);
  document.getElementById('res-carbon').textContent = fmt(data.carbon_tons, 1);
  document.getElementById('res-area').textContent = fmt(data.parcel_area_hectares, 2);
  document.getElementById('res-pixels').textContent = fmt(data.vegetation_pixel_count, 0);

  let confStr = data.confidence_score ? `<b style="color:#58a6ff">${data.confidence_score.toFixed(1)}%</b>` : '-';

  var rows = [
    ['Market Confidence', confStr],
    ['Dataset', data.satellite_dataset],
    ['Scenes used', data.image_count + ' images'],
    ['Date range', data.date_range.start + ' → ' + data.date_range.end],
    ['Biomass density', data.biomass_density_tons_per_ha + ' t/ha'],
    ['NDVI min / max', fmt(data.ndvi_min, 3) + ' / ' + fmt(data.ndvi_max, 3)],
  ];
  document.getElementById('prov-rows').innerHTML = rows.map(function (r) {
    return '<div class="prov-row"><span class="prov-row__key">' + r[0] +
      '</span><span class="prov-row__value">' + r[1] + '</span></div>';
  }).join('');

  // Show raster streaming indicator if COG tile URL is available
  if (data.ndvi_tiles_url) {
    var rasterRow = document.createElement('div');
    rasterRow.className = 'prov-row';
    rasterRow.innerHTML = '<span class="prov-row__key">Raster Layer</span>' +
      '<span class="prov-row__value" style="color: var(--accent-green);">🛰️ NDVI COG Streaming</span>';
    document.getElementById('prov-rows').appendChild(rasterRow);
  }

  renderChart(data.historical_trends);
}

function renderChart(historyData) {
  if (!historyData || !historyData.length) return;

  var provPanel = document.getElementById('prov-panel');
  var chartContainer = document.getElementById('history-chart-container');

  // If the chart canvas doesn't exist in the DOM yet, build it dynamically
  if (!chartContainer) {
    chartContainer = document.createElement('div');
    chartContainer.id = 'history-chart-container';
    chartContainer.style.marginTop = '20px';
    chartContainer.innerHTML = `
      <h3 style="margin-bottom: 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">Additionality Trends (5-Year)</h3>
      <div style="position: relative; height: 180px; width: 100%; background: var(--bg-card); border-radius: 6px; padding: 10px; border: 1px solid var(--border);">
        <canvas id="trendChart"></canvas>
      </div>`;
    provPanel.appendChild(chartContainer);

    // Dynamically download Chart.js if it isn't in the HTML
    if (typeof Chart === 'undefined') {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = function () { _initChart(historyData); };
      document.head.appendChild(script);
      return;
    }
  }

  _initChart(historyData);
}

function _initChart(historyData) {
  var ctx = document.getElementById('trendChart').getContext('2d');
  if (trendChart) trendChart.destroy();

  var labels = historyData.map(function (d) { return d.year; });
  var carbonData = historyData.map(function (d) { return d.carbon_tons; });
  var canopyData = historyData.map(function (d) { return d.canopy_area_hectares; });

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Carbon Stock (t)',
          data: carbonData,
          borderColor: '#3fb950',
          backgroundColor: 'rgba(63, 185, 80, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'Canopy (ha)',
          data: canopyData,
          borderColor: '#58a6ff',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#8b949e', font: { size: 10, family: 'JetBrains Mono' } } }
      },
      scales: {
        x: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: 'rgba(139, 148, 158, 0.1)' } },
        y: { type: 'linear', display: true, position: 'left', ticks: { color: '#3fb950', font: { size: 10 } }, grid: { color: 'rgba(139, 148, 158, 0.1)' } },
        y1: { type: 'linear', display: true, position: 'right', ticks: { color: '#58a6ff', font: { size: 10 } }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

/* ── UI helpers ────────────────────────────────────────────────────────────── */

function setStatus(type, message, icon) {
  var el = document.getElementById('status-banner');
  el.className = 'status-banner visible ' + type;
  var iconHtml = icon ? '<span>' + icon + '</span>'
    : (type === 'loading' ? '<div class="spinner"></div>' : '');
  el.innerHTML = iconHtml + ' ' + message;
}

function clearStatus() {
  document.getElementById('status-banner').className = 'status-banner';
}

function fmt(n, dp) {
  dp = (dp === undefined) ? 2 : dp;
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: dp });
}

function clearResultsPanel() {
  document.getElementById('results-panel').classList.remove('visible');
  document.getElementById('prov-panel').classList.remove('visible');
}

function setLoading(on) {
  const btnGps = document.getElementById('btn-gps');
  const btnDraw = document.getElementById('btn-draw');
  const btnClear = document.getElementById('btn-clear');
  const btnGpsInst = document.getElementById('btn-gps-inst');
  const btnDrawInst = document.getElementById('btn-draw-inst');
  const btnClearInst = document.getElementById('btn-clear-inst');
  const btnEstimateFarmer = document.getElementById('btn-estimate-farmer');
  const btnEstimateInst = document.getElementById('btn-estimate-inst');

  if (btnGps) btnGps.disabled = on;
  if (btnDraw) btnDraw.disabled = on;
  if (btnClear) btnClear.disabled = on;
  if (btnGpsInst) btnGpsInst.disabled = on;
  if (btnDrawInst) btnDrawInst.disabled = on;
  if (btnClearInst) btnClearInst.disabled = on;
  if (btnEstimateFarmer) btnEstimateFarmer.disabled = on || !drawnPolygon;
  if (btnEstimateInst) btnEstimateInst.disabled = on || !drawnPolygon;
}

/* ── API ───────────────────────────────────────────────────────────────────── */

async function runDemo() {
  var label = document.getElementById('f-label').value.trim() || 'Demo Farm';
  var polygon = drawnPolygon || {
    type: 'Polygon',
    coordinates: [[[76.655, 12.135], [76.667, 12.135],
    [76.667, 12.145], [76.655, 12.145], [76.655, 12.135]]],
  };

  setLoading(true);
  setStatus('loading', '⚡  Running demo estimation…');
  clearResultsPanel();

  try {
    var data = await api.estimateCarbonDemo({ label: label, polygon: polygon });
    renderResults(data);
    drawResult(data.parcel_polygon, data);
    setStatus('success',
      '⚡ Demo complete — ' + fmt(data.co2_equivalent_tons, 1) + ' t CO₂e estimated', '⚡');
  } catch (err) {
    setStatus('error',
      'Error: ' + err.message + ' — Is the API running at ' + CONFIG.API_BASE_URL + '?', '✖');
  } finally {
    setLoading(false);
  }
}
// ==========================================
// SPA AUTHENTICATION & ROUTING
// ==========================================

// Check if user is already logged in on page load
window.onload = () => {
  const token = sessionStorage.getItem(CONFIG.TOKEN_KEY);
  if (token) {
    processSuccessfulLogin(token);
  }
};

function processSuccessfulLogin(token) {
  // 1. Decode JWT to get Role
  const payloadBase64 = token.split('.')[1];
  const decodedPayload = JSON.parse(atob(payloadBase64));
  const userRole = decodedPayload.role;

  // 2. Hide Login, Show App
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('bg-canvas').style.display = 'none';
  document.getElementById('main-app').style.display = 'block';

  // 3. Setup UI based on Role
  switchRole(userRole);

  // 4. Initialize map after UI is visible
  if (!map) {
    setTimeout(() => {
      initMap();
      // Ensure map renders correctly
      setTimeout(() => {
        if (map) map.resize();
      }, 200);
    }, 100);
  } else {
    // Map already exists, just resize it
    map.resize();
  }
}

function switchRole(role) {
  // Update role memory
  sessionStorage.setItem(CONFIG.ROLE_KEY, role);

  // Update tab styling
  const tabFarmer = document.getElementById('tab-farmer');
  const tabInst = document.getElementById('tab-institution');

  if (tabFarmer) {
    tabFarmer.classList.toggle('active', role === 'farmer');
  }
  if (tabInst) {
    tabInst.classList.toggle('active', role === 'institution');
  }

  // Update view visibility
  const viewFarmer = document.getElementById('view-farmer');
  const viewInst = document.getElementById('view-institution');

  if (viewFarmer) {
    viewFarmer.style.display = role === 'farmer' ? 'block' : 'none';
    viewFarmer.classList.toggle('active', role === 'farmer');
  }
  if (viewInst) {
    viewInst.style.display = role === 'institution' ? 'block' : 'none';
    viewInst.classList.toggle('active', role === 'institution');
  }

  // Hide role selector tab if using role-based view
  if (tabFarmer && tabInst) {
    if (role === 'farmer') {
      tabInst.style.display = 'none';
    } else {
      tabFarmer.style.display = 'none';
    }
  }
}

function logout() {
  sessionStorage.removeItem(CONFIG.TOKEN_KEY);
  location.reload(); // Refresh page to reset state
}

// ==========================================
// HISTORY & RERUN MRV
// ==========================================
let activeParcelId = null;

function toggleSidebar() {
  const sidebar = document.getElementById('history-sidebar');
  if (sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
  } else {
    sidebar.classList.add('open');
    loadAssetHistory();
  }
}

async function loadAssetHistory() {
  const list = document.getElementById('asset-history-list');
  list.innerHTML = '<div class="spinner"></div> Loading...';
  try {
    const token = sessionStorage.getItem(CONFIG.TOKEN_KEY);
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const response = await fetch(`${CONFIG.API_BASE_URL}/estimate-carbon/history`, { headers });

    if (!response.ok) {
      console.error("Server returned status:", response.status);
      document.getElementById('asset-history-list').innerHTML = "Error: Could not load history.";
      return;
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) {
      console.error("Server returned HTML, expected JSON");
      document.getElementById('asset-history-list').innerHTML = "Error: Could not load history.";
      return;
    }

    const data = await response.json();
    list.innerHTML = '';
    if (!data.parcels || data.parcels.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:12px;">No past assets found.</p>';
      return;
    }
    data.parcels.forEach(p => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `
                <div class="history-item__id">${p.farm_id || p.id.split('-')[0]}</div>
                <div class="history-item__date">${p.created_at ? p.created_at.split('T')[0] : 'N/A'} - ${p.calculated_area_ha ? p.calculated_area_ha.toFixed(2) + 'ha' : '0ha'}</div>
            `;
      li.onclick = () => loadHistoricalParcel(p);
      list.appendChild(li);
    });
  } catch (e) {
    list.innerHTML = `<p style="color:#ef4444;font-size:12px;">Error loading history: ${e.message}</p>`;
  }
}

function loadHistoricalParcel(p) {
  if (!p.polygon) {
    alert("Parcel has no polygon geometry available.");
    return;
  }
  activeParcelId = p.id;
  drawnPolygon = p.polygon;

  // Clear existing drawings and result layers
  draw.deleteAll();
  _clearResultLayers();

  // GeoJSON coordinates are already [lng, lat] — add directly to MapboxDraw
  var coords = p.polygon.coordinates[0];

  var pastedFeature = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords]
    },
    properties: {}
  };

  draw.add(pastedFeature);

  // Fit bounds — compute bounding box from [lng, lat] coords
  var lngs = coords.map(function (c) { return c[0]; });
  var lats = coords.map(function (c) { return c[1]; });
  var sw = [Math.min.apply(null, lngs), Math.min.apply(null, lats)];
  var ne = [Math.max.apply(null, lngs), Math.max.apply(null, lats)];

  map.fitBounds([sw, ne], { padding: 50, duration: 1500 });

  window.currentPolygonCoords = p.polygon.coordinates[0];

  const btnEstimateInst = document.getElementById('btn-estimate-inst');
  if (btnEstimateInst) btnEstimateInst.disabled = false;

  const btnRerun = document.getElementById('btn-rerun-estimation');
  if (btnRerun) btnRerun.style.display = 'block';

  document.getElementById('history-sidebar').classList.remove('open');
}

async function runRerunEstimation() {
  const userToken = sessionStorage.getItem(CONFIG.TOKEN_KEY);
  if (!userToken) {
    setStatus('error', 'Session expired. Please log in again.', '✖');
    setTimeout(() => logout(), 2000);
    return;
  }

  if (!activeParcelId) return;

  const btn = document.getElementById('btn-rerun-estimation');
  const originalContent = btn ? btn.innerHTML : '';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Rerunning MRV...';
  }

  setStatus('loading', '🛰️  Dispatching rerun task to background worker…');
  clearResultsPanel();

  try {
    const data = await api.estimateCarbonRerun(activeParcelId);
    const taskId = data.task_id;

    if (!taskId) throw new Error("No task ID returned by backend");

    setStatus('loading', '⏳ Task dispatched. Polling Earth Engine for results...');

    let completed = false;
    while (!completed) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const pollData = await api.checkTaskStatus(taskId);

      if (pollData.status === 'completed') {
        completed = true;
        renderResults(pollData.result);
        drawResult(pollData.result.parcel_polygon, pollData.result);
        setStatus('success', `✔ Analysis complete — ${fmt(pollData.result.co2_equivalent_tons, 1)} t CO₂e estimated`, '✔');
      } else if (pollData.status === 'failed') {
        completed = true;
        let msg = pollData.detail;
        if (typeof msg === 'object' && msg.message) msg = msg.message;
        throw new Error(msg || 'Task failed');
      }
    }
  } catch (error) {
    console.error('[carbon-engine]', error);
    if (error.status === 401) {
      setStatus('error', 'Session expired. Please log in again.', '✖');
      setTimeout(() => logout(), 2000);
      return;
    }
    if (error.status === 403) {
      setStatus('error', '🔒 Your role does not have authorization to mint carbon credits.', '✖');
      return;
    }
    setStatus('error', `Error: ${error.message}`, '✖');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalContent;
    }
  }
}

// ==========================================
// API REQUEST WITH JWT (The Bouncer Check)
// ==========================================
async function runEstimation() {
  const userToken = sessionStorage.getItem(CONFIG.TOKEN_KEY);
  if (!userToken) {
    setStatus('error', 'Session expired. Please log in again.', '✖');
    setTimeout(() => logout(), 2000);
    return;
  }

  const userRole = sessionStorage.getItem(CONFIG.ROLE_KEY) || 'farmer';
  const btnId = userRole === 'farmer' ? 'btn-estimate-farmer' : 'btn-estimate-inst';
  const btn = document.getElementById(btnId);
  const originalContent = btn ? btn.innerHTML : '';

  if (!drawnPolygon && !window.currentPolygonCoords) {
    setStatus('error', 'Please draw or paste coordinates first.', '✖');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Analyzing satellite imagery...';
  }

  setStatus('loading', '🛰️  Dispatching task to background worker…');
  clearResultsPanel();

  const coords = window.currentPolygonCoords || (drawnPolygon ? drawnPolygon.coordinates[0] : null);
  if (!coords || coords.length < 3) {
    setStatus('error', 'Invalid polygon - need at least 3 points.', '✖');
    if (btn) { btn.disabled = false; btn.innerHTML = originalContent; }
    return;
  }

  const labelEl = document.getElementById('f-label') || document.getElementById('f-id');
  const farmId = labelEl ? labelEl.value.trim() : 'Farm-' + Date.now();
  const speciesEl = document.getElementById('f-species');
  const species = speciesEl ? speciesEl.value : '';

  const payload = {
    farm_id: farmId,
    tree_species: species,
    source_type: "MANUAL_DRAW",
    coordinates: coords
  };

  try {
    const data = await api.estimateCarbonDraw(payload);
    const taskId = data.task_id;

    if (!taskId) throw new Error("No task ID returned by backend");

    setStatus('loading', '⏳ Task dispatched. Polling Earth Engine for results...');

    let completed = false;
    while (!completed) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const pollData = await api.checkTaskStatus(taskId);

      if (pollData.status === 'completed') {
        completed = true;
        renderResults(pollData.result);
        drawResult(pollData.result.parcel_polygon, pollData.result);
        setStatus('success', `✔ Analysis complete — ${fmt(pollData.result.co2_equivalent_tons, 1)} t CO₂e estimated`, '✔');
      } else if (pollData.status === 'failed') {
        completed = true;
        let msg = pollData.detail;
        if (typeof msg === 'object' && msg.message) msg = msg.message;
        throw new Error(msg || 'Task failed');
      }
    }
  } catch (error) {
    console.error('[carbon-engine]', error);
    if (error.status === 401) {
      setStatus('error', 'Session expired. Please log in again.', '✖');
      setTimeout(() => logout(), 2000);
      return;
    }
    if (error.status === 403) {
      setStatus('error', '🔒 Your role does not have authorization to mint carbon credits.', '✖');
      return;
    }
    setStatus('error', `Error: ${error.message}`, '✖');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalContent;
    }
  }
}
/* ── Stripe & Certificates ─────────────────────────────────────────────────── */

async function initiateStripeCheckout(creditId) {
  if (!sessionStorage.getItem(CONFIG.TOKEN_KEY)) return alert("Please log in to continue.");

  try {
    const data = await api.createCheckoutSession(creditId);
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
    } else {
      throw new Error("No checkout URL returned.");
    }
  } catch (err) {
    console.error("Stripe Checkout Error:", err);
    alert("Failed to initiate checkout: " + err.message);
  }
}

async function downloadCertificate(creditId) {
  if (!sessionStorage.getItem(CONFIG.TOKEN_KEY)) return alert("Please log in to continue.");

  try {
    const blob = await api.downloadCertificate(creditId);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `Verified_Carbon_Credit_${creditId}.pdf`;
    document.body.appendChild(a);
    a.click();

    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (err) {
    console.error("Certificate Download Error:", err);
    alert("Failed to download certificate: " + err.message);
  }
}

function showRegisterScreen() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('register-screen').style.display = 'block';
}

function showLoginScreen() {
  document.getElementById('register-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'block';
}

async function performRegister() {
  const btn = document.querySelector('#register-screen .btn--primary');
  const originalContent = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner"></div> Registering...`;

  const user = document.getElementById('reg-user').value;
  const pass = document.getElementById('reg-pass').value;
  const company = document.getElementById('reg-company') ? document.getElementById('reg-company').value : user + ' Org';
  const errorText = document.getElementById('reg-error');
  errorText.style.display = 'none';

  try {
    await api.registerInstitution({ username: user, password: pass, company_name: company });

    alert("Registration successful! Switching to login tab...");
    showLoginScreen();

  } catch (error) {
    errorText.innerText = error.message;
    errorText.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalContent;
  }
}

// ==========================================
// 8. BULK PARCEL AUDIT ENGINE
// ==========================================
let bulkPollingInterval = null;

function initBulkDropZone() {
  const dropZone = document.getElementById('bulk-drop-zone');
  const fileInput = document.getElementById('bulk-file-input');
  const progressPanel = document.getElementById('bulk-progress-panel');
  const downloadBtn = document.getElementById('bulk-download-btn');

  if (!dropZone || !fileInput) return;

  // Open file dialog on click
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  // Drag & drop handlers
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleBulkUpload(files[0]);
    }
  });

  // File input change
  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleBulkUpload(files[0]);
    }
  });
}

async function handleBulkUpload(file) {
  const dropZone = document.getElementById('bulk-drop-zone');
  const progressPanel = document.getElementById('bulk-progress-panel');
  const downloadBtn = document.getElementById('bulk-download-btn');

  if (!file.name.toLowerCase().endsWith('.csv', '.xlsx', '.xls', '.kml', '.kmz')) {
    setStatus('error', 'Only CSV/Excel files are accepted.', '✖');
    return;
  }

  // Set loading state on dropzone
  dropZone.classList.add('uploading');
  const originalHtml = dropZone.innerHTML;
  dropZone.innerHTML = `
    <div class="spinner"></div>
    <div class="bulk-zone__text">Uploading <strong>${file.name}</strong>...</div>
  `;

  setStatus('loading', 'Uploading bulk CSV file...');

  try {
    const response = await api.uploadBulkCSV(file);
    setStatus('success', `CSV uploaded successfully. Job ID: ${response.job_id.substring(0, 8)}`, '✔');

    // Show progress panel and start polling
    if (progressPanel) {
      progressPanel.style.display = 'block';
      document.getElementById('bulk-job-filename').textContent = file.name;
      document.getElementById('bulk-job-status').textContent = 'PROCESSING';
      document.getElementById('bulk-job-status').className = 'bulk-progress__status-badge';
      document.getElementById('bulk-progress-bar').style.width = '0%';
      document.getElementById('bulk-progress-text').textContent = `0 / ${response.total_rows} parcels`;
      document.getElementById('bulk-progress-pct').textContent = '0%';
    }

    if (downloadBtn) {
      downloadBtn.style.display = 'none';
    }

    // Start polling
    startBulkPolling(response.job_id);

  } catch (error) {
    console.error('[bulk-audit] Upload failed:', error);
    setStatus('error', 'Upload failed: ' + error.message, '✖');
  } finally {
    dropZone.classList.remove('uploading');
    dropZone.innerHTML = originalHtml;
  }
}

function startBulkPolling(jobId) {
  if (bulkPollingInterval) {
    clearInterval(bulkPollingInterval);
  }

  // Poll immediately, then every 3 seconds
  pollStatus(jobId);
  bulkPollingInterval = setInterval(() => {
    pollStatus(jobId);
  }, 3000);
}

async function pollStatus(jobId) {
  try {
    const data = await api.getBulkStatus(jobId);

    const progressBar = document.getElementById('bulk-progress-bar');
    const progressText = document.getElementById('bulk-progress-text');
    const progressPct = document.getElementById('bulk-progress-pct');
    const statusBadge = document.getElementById('bulk-job-status');

    if (progressBar) progressBar.style.width = `${data.percent_complete}%`;
    if (progressText) progressText.textContent = `${data.processed_rows} / ${data.total_rows} parcels`;
    if (progressPct) progressPct.textContent = `${data.percent_complete}%`;

    if (statusBadge) {
      statusBadge.textContent = data.status;
      statusBadge.className = 'bulk-progress__status-badge';
      if (data.status === 'COMPLETED') {
        statusBadge.classList.add('completed');
      } else if (data.status === 'FAILED') {
        statusBadge.classList.add('failed');
      }
    }

    if (data.status === 'COMPLETED' || data.status === 'FAILED') {
      clearInterval(bulkPollingInterval);
      bulkPollingInterval = null;
      onBulkComplete(jobId, data.status);
    }
  } catch (error) {
    console.error('[bulk-audit] Polling failed:', error);
    if (error.status === 404) {
      clearInterval(bulkPollingInterval);
      bulkPollingInterval = null;
      setStatus('error', 'Bulk job not found on server.', '✖');
    }
  }
}

function onBulkComplete(jobId, status) {
  const downloadBtn = document.getElementById('bulk-download-btn');
  if (downloadBtn) {
    downloadBtn.style.display = 'flex';
    downloadBtn.onclick = () => downloadBulkResults(jobId);
  }

  if (status === 'COMPLETED') {
    setStatus('success', 'Bulk parcel audit job completed successfully.', '✔');
  } else {
    setStatus('error', 'Bulk parcel audit job failed.', '✖');
  }
}

async function downloadBulkResults(jobId) {
  const downloadBtn = document.getElementById('bulk-download-btn');
  const originalContent = downloadBtn.innerHTML;

  downloadBtn.disabled = true;
  downloadBtn.innerHTML = `<div class="spinner"></div> Downloading...`;
  setStatus('loading', 'Generating and downloading results CSV...');

  try {
    const blob = await api.exportBulkCSV(jobId);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `bulk_audit_results_${jobId.substring(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    setStatus('success', 'Results CSV downloaded successfully.', '✔');
  } catch (error) {
    console.error('[bulk-audit] Export failed:', error);
    setStatus('error', 'Failed to download results: ' + error.message, '✖');
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = originalContent;
  }
}


/* ── Exports & wiring ──────────────────────────────────────────────────────── */

window.goToMyLocation = goToMyLocation;
window.startDrawing = startDrawing;
window.clearPolygon = clearPolygon;
window.loadPastedCoordinates = loadPastedCoordinates;
window.switchLoginTab = switchLoginTab;
window.performLogin = performLogin;
window.runEstimation = runEstimation;
window.logout = logout;
window.initiateStripeCheckout = initiateStripeCheckout;
window.downloadCertificate = downloadCertificate;
window.showRegisterScreen = showRegisterScreen;
window.showLoginScreen = showLoginScreen;
window.performRegister = performRegister;
window.toggleSidebar = toggleSidebar;
window.initBulkDropZone = initBulkDropZone;

document.addEventListener('DOMContentLoaded', function () {
  // Check if already logged in
  const token = sessionStorage.getItem(CONFIG.TOKEN_KEY);
  if (!token) {
    // Show login screen
    document.getElementById('login-screen').style.display = 'block';
    document.getElementById('main-app').style.display = 'none';
  } else {
    // Already logged in, go straight to app
    processSuccessfulLogin(token);
  }

  // Check for successful Stripe checkout
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('checkout') === 'success') {
    alert("Payment successful! You can now download your certificate.");
    const downloadBtn = document.getElementById('btn-download-cert');
    if (downloadBtn) {
      downloadBtn.style.display = 'block';
    }
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const rerunBtn = document.getElementById('btn-rerun-estimation');
  if (rerunBtn) {
    rerunBtn.addEventListener('click', runRerunEstimation);
  }

  // Initialize starry background for login screen
  initStarryBackground();

  // Initialize bulk upload drop zone
  initBulkDropZone();

  // Initialize cookie consent
  if (localStorage.getItem('cookie_consent_status') === null) {
    document.getElementById('cookie-banner').style.display = 'block';
  }
});

function initCookieConsent(status) {
  localStorage.setItem('cookie_consent_status', status);
  document.getElementById('cookie-banner').style.display = 'none';
}
// --- UPGRADED 3D STARRY BACKGROUND ---
function initStarryBackground() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020617, 0.001);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 2000);
  camera.position.z = 1000;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x020617, 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Create stars
  const starsGeometry = new THREE.BufferGeometry();
  const starsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.5,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true
  });

  const starsVertices = [];
  for (let i = 0; i < 5000; i++) {
    const x = THREE.MathUtils.randFloatSpread(2000);
    const y = THREE.MathUtils.randFloatSpread(2000);
    const z = THREE.MathUtils.randFloatSpread(2000);
    starsVertices.push(x, y, z);
  }
  starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));

  const starField = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starField);

  function animate() {
    requestAnimationFrame(animate);
    starField.rotation.y += 0.0005;
    starField.rotation.x += 0.0002;
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
