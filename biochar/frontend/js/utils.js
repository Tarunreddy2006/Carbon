// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

const Utils = {
    /**
     * Format a date string or Date object.
     */
    formatDate(dateStr, options = {}) {
        if (!dateStr) return '—';
        const date = new Date(dateStr);
        if (isNaN(date)) return '—';
        const defaults = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', { ...defaults, ...options });
    },

    /**
     * Format date with time.
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '—';
        const date = new Date(dateStr);
        if (isNaN(date)) return '—';
        return date.toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    },

    /**
     * Relative time (e.g., "3 hours ago").
     */
    timeAgo(dateStr) {
        if (!dateStr) return '—';
        const date = new Date(dateStr);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        const intervals = [
            { label: 'year', seconds: 31536000 },
            { label: 'month', seconds: 2592000 },
            { label: 'week', seconds: 604800 },
            { label: 'day', seconds: 86400 },
            { label: 'hour', seconds: 3600 },
            { label: 'minute', seconds: 60 },
        ];

        for (const interval of intervals) {
            const count = Math.floor(seconds / interval.seconds);
            if (count >= 1) {
                return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
            }
        }
        return 'just now';
    },

    /**
     * Format a number with commas and optional decimals.
     */
    formatNumber(num, decimals = 0) {
        if (num === null || num === undefined) return '—';
        return Number(num).toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
    },

    /**
     * Format metric tons.
     */
    formatTons(num) {
        if (num === null || num === undefined) return '—';
        return `${Utils.formatNumber(num, 2)} t`;
    },

    /**
     * Format tCO₂e.
     */
    formatCO2(num) {
        if (num === null || num === undefined) return '—';
        return `${Utils.formatNumber(num, 2)} tCO₂e`;
    },

    /**
     * Debounce function.
     */
    debounce(fn, ms = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    },

    /**
     * Generate a v4-ish UUID.
     */
    uuid() {
        return crypto.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    },

    /**
     * Validate if a string is a valid UUID format (8-4-4-4-12 hex chars).
     */
    isValidUuid(str) {
        if (!str || typeof str !== 'string') return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    },

    /**
     * Safely get a DOM element.
     */
    $(selector, parent = document) {
        return parent.querySelector(selector);
    },

    /**
     * Safely get all matching DOM elements.
     */
    $$(selector, parent = document) {
        return Array.from(parent.querySelectorAll(selector));
    },

    /**
     * Create DOM element with attributes and children.
     */
    createElement(tag, attrs = {}, ...children) {
        const el = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs)) {
            if (key === 'className') el.className = value;
            else if (key === 'innerHTML') el.innerHTML = value;
            else if (key === 'textContent') el.textContent = value;
            else if (key.startsWith('on') && typeof value === 'function') {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else {
                el.setAttribute(key, value);
            }
        }
        for (const child of children) {
            if (typeof child === 'string') el.appendChild(document.createTextNode(child));
            else if (child instanceof Node) el.appendChild(child);
        }
        return el;
    },

    /**
     * Escape HTML special characters.
     */
    escapeHtml(str) {
        if (!str) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return String(str).replace(/[&<>"']/g, m => map[m]);
    },

    /**
     * Get user initials from name.
     */
    getInitials(firstName, lastName) {
        const f = firstName?.[0]?.toUpperCase() || '';
        const l = lastName?.[0]?.toUpperCase() || '';
        return f + l || '?';
    },

    /**
     * Capitalize first letter.
     */
    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    /**
     * Format enum-style strings (snake_case → Title Case).
     */
    formatEnum(str) {
        if (!str) return '—';
        return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },

    /**
     * Download data as CSV.
     */
    downloadCSV(data, filename = 'export.csv') {
        if (!data.length) return;
        const headers = Object.keys(data[0]);
        const csv = [
            headers.join(','),
            ...data.map(row => headers.map(h => {
                const val = row[h] ?? '';
                return `"${String(val).replace(/"/g, '""')}"`;
            }).join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    },

    /**
     * Simple deep clone.
     */
    clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },
};
