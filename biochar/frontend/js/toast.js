// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Toast Notification System
// ═══════════════════════════════════════════════════════════════════════════

const Toast = {
    _container: null,

    _getContainer() {
        if (!this._container) {
            this._container = document.createElement('div');
            this._container.className = 'toast-container';
            this._container.id = 'toast-container';
            document.body.appendChild(this._container);
        }
        return this._container;
    },

    /**
     * Show a toast notification.
     * @param {string} message - The message to display.
     * @param {'success'|'error'|'warning'|'info'} type - Toast type.
     * @param {number} duration - Auto-dismiss in ms (0 = no auto-dismiss).
     */
    show(message, type = 'info', duration = CARBONOS_CONFIG.TOAST_DURATION) {
        const container = this._getContainer();

        const icons = {
            success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
            error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
            warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
            info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
        };

        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${Utils.escapeHtml(message)}</span>
            <button class="toast-close" aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this._dismiss(toast));

        container.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => toast.classList.add('toast--visible'));

        // Auto-dismiss
        if (duration > 0) {
            setTimeout(() => this._dismiss(toast), duration);
        }

        return toast;
    },

    _dismiss(toast) {
        toast.classList.remove('toast--visible');
        toast.classList.add('toast--exit');
        setTimeout(() => toast.remove(), 300);
    },

    success(msg, duration) { return this.show(msg, 'success', duration); },
    error(msg, duration) { return this.show(msg, 'error', duration || 6000); },
    warning(msg, duration) { return this.show(msg, 'warning', duration); },
    info(msg, duration) { return this.show(msg, 'info', duration); },
};

if (typeof window !== 'undefined') {
    window.Toast = Toast;
}
