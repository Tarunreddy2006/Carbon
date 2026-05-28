/**
 * app.js — Carbon Biomass Intelligence Engine
 * GPS-based location → draw polygon → GEE carbon estimation
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
    
    if(farmerTab && instTab) {
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
        localStorage.setItem(CONFIG.TOKEN_KEY, data.access_token);
        localStorage.setItem(CONFIG.ROLE_KEY, currentLoginRole);

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
let map, drawnItems;
let drawnPolygon = null;
let currentResultLayer = null;
let resultLayer  = null;
let locationMarker = null;
let _satTile = null, _darkTile = null, _isSat = false;
let _isDrawing = false;
let trendChart = null; // Chart.js instance for trends

/* ── Map initialisation ────────────────────────────────────────────────────── */

function initMap() {
  if (map) {
    window.setTimeout(function() { map.invalidateSize(); }, 0);
    return;
  }

  map = L.map('map', { center: CONFIG.MAP_CENTER, zoom: CONFIG.MAP_ZOOM });

  // Start on satellite so farm fields are visible
  _satTile = L.tileLayer(CONFIG.SAT_URL, { attribution: CONFIG.SAT_ATTR, maxZoom: 20 }).addTo(map);
  _darkTile = L.tileLayer(CONFIG.DARK_URL, { attribution: CONFIG.DARK_ATTR, subdomains: CONFIG.DARK_SUBS, maxZoom: 19 });
  _isSat = true;

  drawnItems = new L.FeatureGroup().addTo(map);

  // Polygon completed
  map.on(L.Draw.Event.CREATED, function(e) {
    drawnItems.clearLayers();
    if (currentResultLayer) { map.removeLayer(currentResultLayer); currentResultLayer = null; }
    if (resultLayer) { map.removeLayer(resultLayer); resultLayer = null; }
    drawnItems.addLayer(e.layer);
    
    // Explicitly ensure [Longitude, Latitude] mapping for GEE compatibility
    const latLngs = e.layer.getLatLngs()[0];
    drawnPolygon = {
      type: 'Polygon',
      coordinates: [latLngs.map(ll => [ll.lng, ll.lat])]
    };
    
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
  if (document.getElementById('btn-gps-inst')) document.getElementById('btn-gps-inst').disabled = true;

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
        if (document.getElementById('btn-gps-inst')) document.getElementById('btn-gps-inst').disabled = false;
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
      if (document.getElementById('btn-gps-inst')) document.getElementById('btn-gps-inst').disabled = false;
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
  if (currentResultLayer) { map.removeLayer(currentResultLayer); currentResultLayer = null; }
  if (resultLayer) { map.removeLayer(resultLayer); resultLayer = null; }
  
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

  new L.Draw.Polygon(map, {
    shapeOptions: CONFIG.DRAW_STYLE,
    allowIntersection: false,
    showArea: true,
  }).enable();

  setStatus('loading', '✏️  Click points around your farm boundary. Double-click to finish.');
}

function clearPolygon() {
  drawnItems.clearLayers();
  drawnPolygon = null;
  window.currentPolygonCoords = null;
  if (currentResultLayer) { map.removeLayer(currentResultLayer); currentResultLayer = null; }
  if (resultLayer) { map.removeLayer(resultLayer); resultLayer = null; }
  
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
                    latlngs.push([dmsCoords[i], dmsCoords[i+1]]);
                    geoJsonCoords.push([dmsCoords[i+1], dmsCoords[i]]);
                }
            } 
            // ATTEMPT 3: Standard Decimal Extraction (Fallback)
            else {
                const numbers = text.match(/-?\d+(\.\d+)?/g);
                if (!numbers || numbers.length < 2) throw new Error("No valid coordinates found.");
                
                for (let i = 0; i < numbers.length - 1; i += 2) {
                    latlngs.push([parseFloat(numbers[i]), parseFloat(numbers[i+1])]);
                    geoJsonCoords.push([parseFloat(numbers[i+1]), parseFloat(numbers[i])]);
                }
            }
        }

        // ==========================================
        // SCENARIO A: SINGLE CENTER POINT PROVIDED
        // ==========================================
        if (latlngs.length === 1) {
            const center = latlngs[0];
            
            // Fly to the location at a good zoom level for farms
            map.flyTo(center, 15, { duration: 1.5 }); 
            
            // Drop a temporary marker to guide the user
            L.marker(center).addTo(map)
             .bindPopup("<b>Project Center Point</b><br>Please use the Draw tool to outline the boundaries.")
             .openPopup();
             
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
        if (typeof drawnItems !== 'undefined') drawnItems.clearLayers();

        // Draw new polygon
        const poly = L.polygon(latlngs, {
            color: '#3fb950', 
            weight: 3,
            fillColor: '#3fb950',
            fillOpacity: 0.2
        });
        
        drawnItems.addLayer(poly);
        map.flyToBounds(poly.getBounds(), { padding: [50, 50], duration: 1.5 });

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
  if (currentResultLayer) { map.removeLayer(currentResultLayer); currentResultLayer = null; }
  if (resultLayer) { map.removeLayer(resultLayer); resultLayer = null; }
  drawnItems.clearLayers();

  let confStr = data.confidence_score ? data.confidence_score.toFixed(1) + '%' : '-';

  currentResultLayer = L.geoJSON(
    { type: 'Feature', geometry: geojson, properties: {} },
    { style: CONFIG.DONE_STYLE }
  ).addTo(map);

  currentResultLayer.bindPopup(
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
  var label   = document.getElementById('f-label').value.trim() || 'Demo Farm';
  var polygon = drawnPolygon || {
    type: 'Polygon',
    coordinates: [[[76.655,12.135],[76.667,12.135],
                   [76.667,12.145],[76.655,12.145],[76.655,12.135]]],
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
  } catch(err) {
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
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
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
                if (map) map.invalidateSize();
            }, 200);
        }, 100);
    } else {
        // Map already exists, just resize it
        map.invalidateSize();
    }
}

function switchRole(role) {
    // Update role memory
    localStorage.setItem(CONFIG.ROLE_KEY, role);

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
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    location.reload(); // Refresh page to reset state
}

// ==========================================
// API REQUEST WITH JWT (The Bouncer Check)
// ==========================================
async function runEstimation() {
    const userToken = localStorage.getItem(CONFIG.TOKEN_KEY);
    if (!userToken) {
        setStatus('error', 'Session expired. Please log in again.', '✖');
        setTimeout(() => logout(), 2000);
        return;
    }

    const userRole = localStorage.getItem(CONFIG.ROLE_KEY) || 'farmer';
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
    if (!localStorage.getItem(CONFIG.TOKEN_KEY)) return alert("Please log in to continue.");

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
    if (!localStorage.getItem(CONFIG.TOKEN_KEY)) return alert("Please log in to continue.");

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

document.addEventListener('DOMContentLoaded', function() {
    // Check if already logged in
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
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

    // Initialize starry background for login screen
    initStarryBackground();
});
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
