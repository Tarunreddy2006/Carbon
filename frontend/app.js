/**
 * app.js — Carbon Biomass Intelligence Engine
 * GPS-based location → draw polygon → GEE carbon estimation
 */
'use strict';

const CONFIG = {
  API_BASE:   window.location.origin,
  MAP_CENTER: [12.295, 76.639],   // Karnataka default
  MAP_ZOOM:   7,
  SAT_URL:    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  SAT_ATTR:   'Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics',
  DARK_URL:   'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  DARK_ATTR:  '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/">OSM</a>',
  DARK_SUBS:  'abcd',
  DRAW_STYLE: { color:'#3fb950', weight:2, opacity:1, fillColor:'#3fb950', fillOpacity:0.12 },
  DONE_STYLE: { color:'#ff6b6b', weight:2.5, opacity:0.9, fillColor:'#3fb950', fillOpacity:0.18, dashArray:'5 4' },
};

/* ── State ─────────────────────────────────────────────────────────────────── */
let map, drawnItems;
let drawnPolygon = null;
let resultLayer  = null;
let locationMarker = null;
let _satTile = null, _darkTile = null, _isSat = false;
let _isDrawing = false;
let trendChart = null; // Chart.js instance for trends

/* ── Map initialisation ────────────────────────────────────────────────────── */

function initMap() {
  map = L.map('map', { center: CONFIG.MAP_CENTER, zoom: CONFIG.MAP_ZOOM });

  // Start on satellite so farm fields are visible
  _satTile = L.tileLayer(CONFIG.SAT_URL, { attribution: CONFIG.SAT_ATTR, maxZoom: 20 }).addTo(map);
  _darkTile = L.tileLayer(CONFIG.DARK_URL, { attribution: CONFIG.DARK_ATTR, subdomains: CONFIG.DARK_SUBS, maxZoom: 19 });
  _isSat = true;

  drawnItems = new L.FeatureGroup().addTo(map);

  // Polygon completed
  map.on(L.Draw.Event.CREATED, function(e) {
    drawnItems.clearLayers();
    if (resultLayer) { map.removeLayer(resultLayer); resultLayer = null; }
    drawnItems.addLayer(e.layer);
    drawnPolygon = e.layer.toGeoJSON().geometry;
    _isDrawing = false;
    _updateDrawBtn(false);
    _onDrawn();
  });

  map.on(L.Draw.Event.DRAWSTOP, function() {
    _isDrawing = false;
    _updateDrawBtn(false);
  });
}

/* ── GPS location ──────────────────────────────────────────────────────────── */

/* ── GPS accuracy constants ──────────────────────────────────────────────── */
var GPS_TARGET_ACCURACY = 20;   // metres — stop refining once this is reached
var GPS_MAX_WAIT_MS     = 20000; // max time to wait for a good fix
var _watchId = null;
var _accuracyCircle = null;

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

  var startTime = Date.now();
  var bestAccuracy = Infinity;
  var hasFlewToLocation = false;

  _watchId = navigator.geolocation.watchPosition(
    function(pos) {
      var lat = pos.coords.latitude;
      var lon = pos.coords.longitude;
      var acc = Math.round(pos.coords.accuracy);

      // Only update if this fix is better than the last
      if (acc >= bestAccuracy && hasFlewToLocation) return;
      bestAccuracy = acc;

      // Remove previous markers/circles
      if (locationMarker)  { map.removeLayer(locationMarker);  locationMarker  = null; }
      if (_accuracyCircle) { map.removeLayer(_accuracyCircle); _accuracyCircle = null; }

      // Draw accuracy circle (same as Google Maps blue halo)
      _accuracyCircle = L.circle([lat, lon], {
        radius: acc,
        color: '#58a6ff', fillColor: '#58a6ff',
        fillOpacity: 0.10, weight: 1, dashArray: '4 4',
      }).addTo(map);

      // Centre dot
      locationMarker = L.circleMarker([lat, lon], {
        radius: 7, color: '#fff', fillColor: '#58a6ff',
        fillOpacity: 1, weight: 2,
      }).addTo(map)
        .bindPopup(
          '📍 <b>You are here</b><br>' +
          '<small>' + lat.toFixed(6) + ', ' + lon.toFixed(6) + '</small><br>' +
          '<small>Accuracy: <b>±' + acc + ' m</b></small>' +
          (acc > 100 ? '<br><small style="color:#d29922">⚠ Low accuracy — open a window or use mobile</small>' : '')
        );

      // Fly to location on first fix
      if (!hasFlewToLocation) {
        map.flyTo([lat, lon], 17, { animate: true, duration: 1.5 });
        hasFlewToLocation = true;
      } else {
        map.panTo([lat, lon], { animate: true, duration: 0.5 });
      }

      // Update status with current accuracy
      if (acc <= GPS_TARGET_ACCURACY) {
        // Good enough — stop watching
        navigator.geolocation.clearWatch(_watchId);
        _watchId = null;
        locationMarker.openPopup();
        clearStatus();
        document.getElementById('btn-gps').disabled = false;
        _setStep(2);
        var labelEl = document.getElementById('f-label');
        if (!labelEl.value.trim()) {
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
        locationMarker.openPopup();
        document.getElementById('btn-gps').disabled = false;
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
        if (!labelEl.value.trim()) {
          labelEl.value = 'Farm at ' + lat.toFixed(5) + ', ' + lon.toFixed(5);
        }
      }
    },
    function(err) {
      if (_watchId !== null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; }
      var msg = {
        1: 'Location access denied — click the 🔒 icon in the address bar and allow location',
        2: 'Location unavailable — ensure GPS is enabled on your device',
        3: 'GPS timed out — try again in an open area',
      }[err.code] || 'Could not get location: ' + err.message;
      setStatus('error', msg, '✖');
      document.getElementById('btn-gps').disabled = false;
    },
    { enableHighAccuracy: true, timeout: GPS_MAX_WAIT_MS, maximumAge: 0 }
  );
}

/* ── Drawing ───────────────────────────────────────────────────────────────── */

function startDrawing() {
  if (_isDrawing) {
    map.fire('draw:drawstop');
    return;
  }

  drawnItems.clearLayers();
  drawnPolygon = null;
  if (resultLayer) { map.removeLayer(resultLayer); resultLayer = null; }
  document.getElementById('btn-estimate').disabled = true;
  document.getElementById('btn-clear').disabled = true;
  clearResultsPanel();

  _isDrawing = true;
  _updateDrawBtn(true);

  new L.Draw.Polygon(map, {
    shapeOptions: CONFIG.DRAW_STYLE,
    allowIntersection: false,
    showArea: true,
  }).enable();

  setStatus('loading', '✏️  Click points around your farm boundary. Double-click to finish.');
  _setStep(2);
}

function clearPolygon() {
  drawnItems.clearLayers();
  drawnPolygon = null;
  if (resultLayer) { map.removeLayer(resultLayer); resultLayer = null; }
  document.getElementById('btn-estimate').disabled = true;
  document.getElementById('btn-clear').disabled = true;
  clearStatus();
  clearResultsPanel();
  _setStep(locationMarker ? 2 : 1);
}

function _updateDrawBtn(drawing) {
  var btn = document.getElementById('btn-draw');
  btn.textContent = drawing ? '⏹ Cancel Drawing' : '✏️ Draw Polygon';
  btn.classList.toggle('btn--drawing', drawing);
}

function _onDrawn() {
  document.getElementById('btn-estimate').disabled = false;
  document.getElementById('btn-clear').disabled = false;
  setStatus('loading', '✅  Polygon drawn — click Run Estimation to analyse');
  _setStep(3);
}

function _setStep(n) {
  ['gps', 'draw', 'run'].forEach(function(id, i) {
    var el = document.getElementById('step-' + id);
    if (el) el.classList.toggle('active', i + 1 === n);
  });
}

/* ── Tile swap ─────────────────────────────────────────────────────────────── */

function _swapToSatellite() {
  if (_isSat) return;
  if (_darkTile) _darkTile.remove();
  _satTile.addTo(map);
  _isSat = true;
}

function _swapToDark() {
  if (!_isSat) return;
  if (_satTile) _satTile.remove();
  _darkTile.addTo(map);
  _isSat = false;
}

/* ── Result rendering ──────────────────────────────────────────────────────── */

function drawResult(geojson, data) {
  if (resultLayer) { map.removeLayer(resultLayer); resultLayer = null; }
  drawnItems.clearLayers();

  let confStr = data.confidence_score ? data.confidence_score.toFixed(1) + '%' : '-';

  resultLayer = L.geoJSON(
    { type: 'Feature', geometry: geojson, properties: {} },
    { style: CONFIG.DONE_STYLE }
  ).addTo(map);

  resultLayer.bindPopup(
    '<b>🌿 ' + data.parcel_id + '</b><br><br>' +
    '<b>Confidence Score</b> <b style="color:#58a6ff">' + confStr + '</b><br>' +
    '<b>NDVI</b> ' + fmt(data.ndvi_mean, 3) + '&nbsp;&nbsp;' +
    '<b>Canopy</b> ' + fmt(data.canopy_area_hectares) + ' ha<br>' +
    '<b>Biomass</b> ' + fmt(data.biomass_tons, 1) + ' t&nbsp;&nbsp;' +
    '<b>Carbon</b> ' + fmt(data.carbon_tons, 1) + ' t C<br>' +
    '<b>CO₂e</b> <b style="color:#3fb950">' + fmt(data.co2_equivalent_tons, 1) + ' t</b>'
  ).openPopup();

  // Fit bounds with satellite
  var ring = geojson.coordinates[0];
  var lons = ring.map(function(c) { return c[0]; });
  var lats = ring.map(function(c) { return c[1]; });
  var bounds = [
    [Math.min.apply(null, lats), Math.min.apply(null, lons)],
    [Math.max.apply(null, lats), Math.max.apply(null, lons)],
  ];
  setTimeout(function() {
    _swapToSatellite();
    map.fitBounds(bounds, { padding: [80, 80], animate: true, duration: 1.5 });
  }, 200);
}

function renderResults(data) {
  document.getElementById('results-panel').classList.add('visible');
  document.getElementById('prov-panel').classList.add('visible');
  document.getElementById('res-parcel-id').textContent = data.parcel_id;
  document.getElementById('res-co2').textContent        = fmt(data.co2_equivalent_tons, 1);
  document.getElementById('res-ndvi').textContent       = fmt(data.ndvi_mean, 3);
  document.getElementById('res-canopy').textContent     = fmt(data.canopy_area_hectares, 2);
  document.getElementById('res-biomass').textContent    = fmt(data.biomass_tons, 1);
  document.getElementById('res-carbon').textContent     = fmt(data.carbon_tons, 1);
  document.getElementById('res-area').textContent       = fmt(data.parcel_area_hectares, 2);
  document.getElementById('res-pixels').textContent     = fmt(data.vegetation_pixel_count, 0);

  let confStr = data.confidence_score ? `<b style="color:#58a6ff">${data.confidence_score.toFixed(1)}%</b>` : '-';

  var rows = [
    ['Market Confidence', confStr],
    ['Dataset',         data.satellite_dataset],
    ['Scenes used',     data.image_count + ' images'],
    ['Date range',      data.date_range.start + ' → ' + data.date_range.end],
    ['Biomass density', data.biomass_density_tons_per_ha + ' t/ha'],
    ['NDVI min / max',  fmt(data.ndvi_min, 3) + ' / ' + fmt(data.ndvi_max, 3)],
  ];
  document.getElementById('prov-rows').innerHTML = rows.map(function(r) {
    return '<div class="prov-row"><span class="prov-row__key">' + r[0] +
           '</span><span class="prov-row__value">' + r[1] + '</span></div>';
  }).join('');
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
      script.onload = function() { _initChart(historyData); };
      document.head.appendChild(script);
      return; 
    }
  }

  _initChart(historyData);
}

function _initChart(historyData) {
  var ctx = document.getElementById('trendChart').getContext('2d');
  if (trendChart) trendChart.destroy();

  var labels = historyData.map(function(d) { return d.year; });
  var carbonData = historyData.map(function(d) { return d.carbon_tons; });
  var canopyData = historyData.map(function(d) { return d.canopy_area_hectares; });

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
  document.getElementById('btn-gps').disabled      = on;
  document.getElementById('btn-draw').disabled     = on;
  document.getElementById('btn-clear').disabled    = on;
  document.getElementById('btn-demo').disabled     = on;
  document.getElementById('btn-estimate').disabled = on || !drawnPolygon;
}

/* ── API ───────────────────────────────────────────────────────────────────── */

async function runEstimate() {
  if (!drawnPolygon) {
    setStatus('error', 'Draw a polygon on the map first', '✖');
    return;
  }
  var label = document.getElementById('f-label').value.trim() || 'GPS Farm';

  setLoading(true);
  setStatus('loading', '🛰️  Connecting to GEE — analysing Sentinel-2 imagery…');
  clearResultsPanel();

  // 🟢 THE FIX: Format the data exactly as the backend's DynamicParcelRequest expects
  // drawnPolygon.coordinates[0] extracts just the [[lng, lat], ...] array from the GeoJSON
  var payload = {
    farm_id: label,
    source_type: "MANUAL_DRAW",
    coordinates: drawnPolygon.coordinates[0]
  };

  try {
    var resp = await fetch('/estimate-carbon/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), // Send the newly formatted payload
    });
    if (!resp.ok) {
      var err = await resp.json().catch(function() { return { detail: resp.statusText }; });
      throw new Error(err.detail || 'HTTP ' + resp.status);
    }
    var data = await resp.json();
    renderResults(data);
    drawResult(data.parcel_polygon, data);
    setStatus('success',
      '✔ Analysis complete — ' + fmt(data.co2_equivalent_tons, 1) + ' t CO₂e estimated', '✔');
  } catch(err) {
    setStatus('error', 'Error: ' + err.message, '✖');
    console.error('[carbon-engine]', err);
  } finally {
    setLoading(false);
  }
}

async function runDemo() {
  var label   = document.getElementById('f-label').value.trim() || 'Demo Farm';
  var polygon = drawnPolygon || {
    type: 'Polygon',
    coordinates: [[[76.655,12.135],[76.667,12.135],
                   [76.667,12.145],[76.655,12.145],[76.655,12.135]]],
  };

  setLoading(true);
  setStatus('loading', '⚡  Running demo estimation…');
  clearResultsPanel();

  var payload= {
    farm_id: label,
    source_type: "DEMO_DATA",
    coordinates: polygon.coordinates[0]
  };

  try {
    var resp = await fetch(CONFIG.API_BASE + '/estimate-carbon/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label, polygon: polygon }),
    });
    if (!resp.ok) {
      var err = await resp.json().catch(function() { return { detail: resp.statusText }; });
      throw new Error(err.detail || 'HTTP ' + resp.status);
    }
    var data = await resp.json();
    renderResults(data);
    drawResult(data.parcel_polygon, data);
    setStatus('success',
      '⚡ Demo complete — ' + fmt(data.co2_equivalent_tons, 1) + ' t CO₂e estimated', '⚡');
  } catch(err) {
    setStatus('error',
      'Error: ' + err.message + ' — Is the API running at ' + CONFIG.API_BASE + '?', '✖');
  } finally {
    setLoading(false);
  }
}

/* ── Exports & wiring ──────────────────────────────────────────────────────── */

window.goToMyLocation = goToMyLocation;
window.startDrawing   = startDrawing;
window.clearPolygon   = clearPolygon;
window.runEstimate    = runEstimate;
window.runDemo        = runDemo;

document.addEventListener('DOMContentLoaded', function() {
  initMap();
  _setStep(1);
});