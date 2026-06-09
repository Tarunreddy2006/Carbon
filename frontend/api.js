/**
 * api.js — Centralized API Client
 * ─────────────────────────────────────────────────────────────────────────────
 * Single entry point for all network requests to the Carbon Engine backend.
 *
 * Features:
 *   • Auto-prepends API_BASE_URL from config.js
 *   • Auto-attaches JWT Bearer token from localStorage (if present)
 *   • Standardized error handling — safely parses JSON or text error bodies
 *   • Clean endpoint map so UI code never constructs URLs manually
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use strict';

/**
 * Core fetch wrapper. All API calls flow through this function.
 *
 * @param {string} endpoint — path relative to API_BASE_URL (e.g. '/health')
 * @param {RequestInit} [options={}] — standard fetch options (method, body, etc.)
 * @returns {Promise<Response>} — the raw Response if response.ok
 * @throws {Error} — standardized error with parsed detail message
 */
async function apiClient(endpoint, options = {}) {
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;

  // ── Build headers ──────────────────────────────────────────────────────
  const headers = new Headers(options.headers || {});

  // Auto-attach JSON content-type for requests with a body (unless overridden)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Auto-attach JWT auth token if available
  const token = sessionStorage.getItem(CONFIG.TOKEN_KEY);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // ── Execute request ────────────────────────────────────────────────────
  const response = await fetch(url, { ...options, headers });

  // ── Global error handling ──────────────────────────────────────────────
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;

    try {
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const errorData = await response.json();
        // FastAPI returns errors as { "detail": "..." } or { "detail": { "message": "..." } }
        if (errorData.detail) {
          errorMessage = (typeof errorData.detail === 'object' && errorData.detail.message)
            ? errorData.detail.message
            : (typeof errorData.detail === 'string')
              ? errorData.detail
              : JSON.stringify(errorData.detail);
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } else {
        const text = await response.text();
        if (text) errorMessage = text;
      }
    } catch (_parseError) {
      // Swallow parse failures — we already have the HTTP status as fallback
    }

    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  return response;
}


// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT MAP — clean, callable methods for every backend route
// ═══════════════════════════════════════════════════════════════════════════

const api = Object.freeze({

  // ── Authentication ─────────────────────────────────────────────────────

  /**
   * Log in as farmer or institution.
   * @param {'farmer'|'institution'} role
   * @param {{ username: string, password: string }} credentials
   */
  login(role, credentials) {
    return apiClient(`/login/${role}`, {
      method: 'POST',
      body: JSON.stringify(credentials),
    }).then(r => r.json());
  },

  /**
   * Register a new institution account.
   * @param {{ username: string, password: string, company_name: string }} data
   */
  registerInstitution(data) {
    return apiClient('/register/institution', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(r => r.json());
  },

  /**
   * Register a new farmer account.
   * @param {{ username: string, password: string }} data
   */
  registerFarmer(data) {
    return apiClient('/register/farmer', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(r => r.json());
  },

  // ── Estimation Engine ──────────────────────────────────────────────────

  /**
   * Submit a polygon for carbon estimation (async Celery task).
   * Returns { task_id, status: 'processing' }.
   */
  estimateCarbonDraw(payload) {
    return apiClient('/estimate-carbon/draw', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(r => r.json());
  },

  /**
   * Poll the status of a background estimation task.
   * @param {string} taskId
   */
  checkTaskStatus(taskId) {
    return apiClient(`/estimate-carbon/status/${taskId}`, {
      method: 'GET',
    }).then(r => r.json());
  },

  /**
   * Run a demo estimation (no auth required).
   * NOTE: Backend route may not exist yet — wired for future use.
   */
  estimateCarbonDemo(payload) {
    return apiClient('/estimate-carbon/demo', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(r => r.json());
  },

  fetchUserParcels() {
    return apiClient('/user/parcels', { method: 'GET' }).then(r => r.json());
  },
  
  estimateCarbonRerun(parcelId) {
    return apiClient(`/estimate-carbon/rerun/${parcelId}`, { method: 'POST' }).then(r => r.json());
  },

  // ── Billing & Certificates ────────────────────────────────────────────

  /**
   * Create a Stripe Checkout session for a carbon credit.
   * @param {string} creditId
   */
  createCheckoutSession(creditId) {
    return apiClient(`/billing/create-checkout-session/${creditId}`, {
      method: 'POST',
    }).then(r => r.json());
  },

  /**
   * Download a verified carbon credit certificate as a PDF blob.
   * @param {string} creditId
   * @returns {Promise<Blob>}
   */
  downloadCertificate(creditId) {
    return apiClient(`/certificate/${creditId}/download`, {
      method: 'GET',
    }).then(r => r.blob());
  },

  // ── Utility ────────────────────────────────────────────────────────────

  /**
   * Health check endpoint.
   */
  healthCheck() {
    return apiClient('/health', { method: 'GET' }).then(r => r.json());
  },

  /**
   * Verify a certificate by its public ID.
   * @param {string} certificateId
   */
  verifyCertificate(certificateId) {
    return apiClient(`/verify-certificate/${certificateId}`, {
      method: 'GET',
    }).then(r => r.json());
  },

  // ── Bulk Audit ──────────────────────────────────────────────────────

  /**
   * Upload a CSV file for bulk parcel auditing.
   * @param {File} file — The .csv File object
   * @returns {Promise<{job_id, filename, total_rows, status, parse_warnings}>}
   */
  uploadBulkCSV(file) {
    const formData = new FormData();
    formData.append('file', file);

    // Note: We pass a custom header map WITHOUT Content-Type so the browser
    // sets the correct multipart/form-data boundary automatically.
    return apiClient('/api/v1/audit/bulk', {
      method: 'POST',
      body: formData,
      headers: {}  // Override default JSON content-type
    }).then(r => r.json());
  },

  /**
   * Poll the progress of a bulk audit job.
   * @param {string} jobId
   * @returns {Promise<{job_id, status, total_rows, processed_rows, percent_complete, ...}>}
   */
  getBulkStatus(jobId) {
    return apiClient(`/api/v1/audit/status/${jobId}`, {
      method: 'GET',
    }).then(r => r.json());
  },

  /**
   * Export bulk audit results as a downloadable CSV blob.
   * @param {string} jobId
   * @returns {Promise<Blob>}
   */
  exportBulkCSV(jobId) {
    return apiClient(`/api/v1/audit/export/${jobId}`, {
      method: 'GET',
    }).then(r => r.blob());
  },
});
