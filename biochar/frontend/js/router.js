// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Hash-Based SPA Router
// ═══════════════════════════════════════════════════════════════════════════

const Router = {
    _routes: {},
    _currentRoute: null,
    _contentEl: null,

    /**
     * Register a route.
     * @param {string} path - Route path (e.g., '/dashboard')
     * @param {object} handler - { title, icon, render: async function(contentEl) }
     */
    register(path, handler) {
        this._routes[path] = handler;
    },

    /**
     * Initialize the router.
     */
    init(contentElId = 'content') {
        this._contentEl = document.getElementById(contentElId);

        // Listen for hash changes
        window.addEventListener('hashchange', () => this._onRouteChange());

        // Handle initial route
        if (!window.location.hash) {
            window.location.hash = '#/dashboard';
        } else {
            this._onRouteChange();
        }
    },

    /**
     * Navigate to a route.
     */
    navigate(path) {
        window.location.hash = '#' + path;
    },

    /**
     * Get the current route path.
     */
    currentPath() {
        return window.location.hash.slice(1) || '/dashboard';
    },

    /**
     * Internal: Handle route changes.
     */
    async _onRouteChange() {
        const path = this.currentPath();
        const handler = this._routes[path];

        if (!handler) {
            this._render404(path);
            return;
        }

        this._currentRoute = path;

        // Update sidebar active state
        this._updateSidebarActive(path);

        // Update topbar breadcrumb
        this._updateBreadcrumb(handler.title);

        // Show loading state
        this._showLoading();

        // Render the module
        try {
            await handler.render(this._contentEl);
        } catch (err) {
            console.error(`Route render error [${path}]:`, err);
            this._renderError(err);
        }
    },

    /**
     * Show a loading skeleton in the content area.
     */
    _showLoading() {
        this._contentEl.innerHTML = `
            <div class="page-loading animate-fade-in">
                <div class="skeleton skeleton-header"></div>
                <div class="skeleton-grid">
                    <div class="skeleton skeleton-card"></div>
                    <div class="skeleton skeleton-card"></div>
                    <div class="skeleton skeleton-card"></div>
                    <div class="skeleton skeleton-card"></div>
                </div>
                <div class="skeleton skeleton-table"></div>
            </div>
        `;
    },

    /**
     * Update sidebar active link.
     */
    _updateSidebarActive(path) {
        document.querySelectorAll('.sidebar-link').forEach(link => {
            const href = link.getAttribute('data-route');
            if (href === path) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    },

    /**
     * Update topbar breadcrumb.
     */
    _updateBreadcrumb(title) {
        const breadcrumb = document.getElementById('topbar-breadcrumb');
        if (breadcrumb) {
            breadcrumb.innerHTML = `
                <span>CarbonOS</span>
                <span class="topbar-breadcrumb-separator">/</span>
                <span class="topbar-breadcrumb-current">${Utils.escapeHtml(title || 'Dashboard')}</span>
            `;
        }
    },

    /**
     * Render 404 page.
     */
    _render404(path) {
        this._contentEl.innerHTML = `
            <div class="empty-state animate-fade-up">
                <div class="empty-state-icon">🔍</div>
                <h3 class="empty-state-title">Page Not Found</h3>
                <p class="empty-state-text">The page "${Utils.escapeHtml(path)}" doesn't exist.</p>
                <button class="btn btn-primary" onclick="Router.navigate('/dashboard')">Go to Dashboard</button>
            </div>
        `;
    },

    /**
     * Render error page.
     */
    _renderError(err) {
        this._contentEl.innerHTML = `
            <div class="empty-state animate-fade-up">
                <div class="empty-state-icon">⚠️</div>
                <h3 class="empty-state-title">Something went wrong</h3>
                <p class="empty-state-text">${Utils.escapeHtml(err.message)}</p>
                <button class="btn btn-primary" onclick="Router.navigate('/dashboard')">Go to Dashboard</button>
            </div>
        `;
    },
};
