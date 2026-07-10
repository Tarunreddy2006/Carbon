/**
 * config.js — Centralized Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for API base URL and application constants.
 * Dynamically resolves the API target based on the browser's current hostname.
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use strict';

const CONFIG = (() => {
  const hostname = window.location.hostname;

  // Dynamic API base URL resolution
  const API_BASE_URL = (hostname === 'stomata.tech')
    ? 'https://stomata.tech'
    : 'http://localhost:8000';

  return Object.freeze({
    // ── API ────────────────────────────────────────────────────────────────
    API_BASE_URL,

    // ── TiTiler Dynamic Tile Server ─────────────────────────────────────
    TITILER_URL: (hostname === 'stomata.tech')
      ? 'https://stomata.tech:8002'
      : 'http://localhost:8002',

    // ── Auth ───────────────────────────────────────────────────────────────
    TOKEN_KEY: 'carbon_jwt_token',
    ROLE_KEY:  'carbon_user_role',

    // ── Map defaults ───────────────────────────────────────────────────────
    MAP_CENTER: [12.295, 76.639],   // Karnataka default
    MAP_ZOOM:   7,

    // ── Tile layers ────────────────────────────────────────────────────────
    SAT_URL:  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    SAT_ATTR: 'Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics',
    DARK_URL:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    DARK_ATTR: '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/">OSM</a>',
    DARK_SUBS: 'abcd',

    // ── Draw styles ────────────────────────────────────────────────────────
    DRAW_STYLE: { color: '#3fb950', weight: 2, opacity: 1, fillColor: '#3fb950', fillOpacity: 0.12 },
    DONE_STYLE: { color: '#ff6b6b', weight: 2.5, opacity: 0.9, fillColor: '#3fb950', fillOpacity: 0.18, dashArray: '5 4' },
  });
})();
