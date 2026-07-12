// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Modal & Confirm Dialog System
// ═══════════════════════════════════════════════════════════════════════════

const Modal = {
    _backdrop: null,
    _container: null,
    _onClose: null,

    _init() {
        if (this._backdrop) return;

        this._backdrop = document.createElement('div');
        this._backdrop.className = 'modal-backdrop';
        this._backdrop.id = 'modal-backdrop';

        this._container = document.createElement('div');
        this._container.className = 'modal-container';
        this._container.id = 'modal-container';

        this._backdrop.appendChild(this._container);
        document.body.appendChild(this._backdrop);

        // Close on backdrop click
        this._backdrop.addEventListener('click', (e) => {
            if (e.target === this._backdrop) this.close();
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._backdrop.classList.contains('modal-backdrop--visible')) {
                this.close();
            }
        });
    },

    /**
     * Open a modal with custom HTML content.
     * @param {string} html - The inner HTML for the modal.
     * @param {object} options - { width, onClose, className }
     */
    open(html, options = {}) {
        this._init();
        const { width = '500px', onClose, className = '' } = options;
        this._onClose = onClose;

        this._container.innerHTML = `
            <div class="modal ${className}" style="max-width: ${width}">
                <button class="modal-close-btn" aria-label="Close modal">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                ${html}
            </div>
        `;

        this._container.querySelector('.modal-close-btn').addEventListener('click', () => this.close());

        requestAnimationFrame(() => {
            this._backdrop.classList.add('modal-backdrop--visible');
        });

        document.body.style.overflow = 'hidden';
    },

    /**
     * Close the currently open modal.
     */
    close() {
        if (!this._backdrop) return;
        this._backdrop.classList.remove('modal-backdrop--visible');
        document.body.style.overflow = '';

        setTimeout(() => {
            if (this._container) this._container.innerHTML = '';
            if (this._onClose) this._onClose();
            this._onClose = null;
        }, 200);
    },

    /**
     * Show a confirmation dialog.
     * @param {string} title - Dialog title.
     * @param {string} message - Dialog message.
     * @param {object} options - { confirmText, cancelText, danger }
     * @returns {Promise<boolean>} - Resolves true if confirmed, false if cancelled.
     */
    confirm(title, message, options = {}) {
        const {
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            danger = false,
        } = options;

        return new Promise((resolve) => {
            const html = `
                <div class="modal-header">
                    <h3 class="modal-title">${Utils.escapeHtml(title)}</h3>
                </div>
                <div class="modal-body">
                    <p>${Utils.escapeHtml(message)}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost" id="modal-cancel-btn">${Utils.escapeHtml(cancelText)}</button>
                    <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm-btn">${Utils.escapeHtml(confirmText)}</button>
                </div>
            `;

            this.open(html, {
                width: '420px',
                onClose: () => resolve(false),
            });

            this._container.querySelector('#modal-cancel-btn').addEventListener('click', () => {
                this.close();
                resolve(false);
            });

            this._container.querySelector('#modal-confirm-btn').addEventListener('click', () => {
                this.close();
                resolve(true);
            });
        });
    },
};
