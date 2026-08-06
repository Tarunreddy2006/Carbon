// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Evidence Management System (EMS) Module
// ═══════════════════════════════════════════════════════════════════════════

const EvidenceModule = {
    _container: null,
    _currentView: 'gallery', // 'gallery', 'list', 'timeline'
    _filters: {
        project_id: '',
        activity: '',
        verification_status: '',
        search: ''
    },
    _page: 1,
    _pageSize: 24,
    _projects: [],

    async render(container) {
        this._container = container;
        this._page = 1;
        
        // Load initial projects list for filter dropdown
        await this.loadProjects();

        this.renderLayout();
        await this.loadEvidence();
    },

    async loadProjects() {
        try {
            const { data, error } = await OfflineStorage.fetchWithCache('projects', () =>
                supabase
                    .from('projects')
                    .select('id, name')
                    .order('name')
            );
            if (error) throw error;
            this._projects = data || [];
        } catch (err) {
            console.error('Failed to load projects for EMS:', err);
        }
    },

    renderLayout() {
        const isReviewer = ['Owner', 'Admin', 'Project Manager', 'MRV Officer'].includes(Permissions.getRole());
        
        this._container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Evidence Management</h1>
                    <p class="page-subtitle">Centralized vault for collecting, reviewing, and verifying biochar project evidence.</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn btn-primary" id="ems-upload-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                        Upload Evidence
                    </button>
                </div>
            </div>

            <!-- Dashboard Filters -->
            <div class="card animate-fade-up" style="margin-bottom: 20px;">
                <div class="filters-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; align-items: end;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="form-label" for="filter-project">Filter by Project</label>
                        <select class="form-input" id="filter-project">
                            <option value="">All Projects</option>
                            ${this._projects.map(p => `<option value="${p.id}">${Utils.escapeHtml(p.name)}</option>`).join('')}
                        </select>
                    </div>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="form-label" for="filter-activity">Filter by Activity</label>
                        <select class="form-input" id="filter-activity">
                            <option value="">All Activities</option>
                            <option value="feedstock">Feedstock Logging</option>
                            <option value="pyrolysis">Pyrolysis Ingestion</option>
                            <option value="batches">Biochar Batch Production</option>
                            <option value="storage">Storage & Warehousing</option>
                            <option value="laboratory">Laboratory Assay</option>
                            <option value="distribution">Distribution & Logistics</option>
                            <option value="farmer_application">Farmer Attestation</option>
                            <option value="monitoring">Monitoring Visits</option>
                        </select>
                    </div>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="form-label" for="filter-status">Filter by Status</label>
                        <select class="form-input" id="filter-status">
                            <option value="">All Statuses</option>
                            <option value="Draft">Draft</option>
                            <option value="Uploaded">Uploaded</option>
                            <option value="Pending Review">Pending Review</option>
                            <option value="Approved">Approved</option>
                            <option value="Rejected">Rejected</option>
                            <option value="Locked">Locked (Immutable)</option>
                        </select>
                    </div>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="form-label" for="filter-search">Search filename/details</label>
                        <input type="text" class="form-input" id="filter-search" placeholder="Type to search..." value="${Utils.escapeHtml(this._filters.search)}" />
                    </div>

                    <div style="display: flex; gap: 8px; justify-content: flex-end;">
                        <button class="btn btn-ghost" id="view-mode-gallery" title="Gallery View" style="padding: 10px;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
                        </button>
                        <button class="btn btn-ghost" id="view-mode-timeline" title="Timeline View" style="padding: 10px;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><circle cx="12" cy="5" r="3"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="19" r="3"/></svg>
                        </button>
                        <button class="btn btn-ghost" id="view-mode-list" title="Table List View" style="padding: 10px;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Content Area -->
            <div id="ems-content-container" class="animate-fade-up">
                <div class="page-loading">
                    <div class="skeleton skeleton-grid"></div>
                </div>
            </div>
        `;

        // Bind events
        document.getElementById('ems-upload-btn').addEventListener('click', () => this.openUploadDialog());
        
        document.getElementById('filter-project').addEventListener('change', (e) => {
            this._filters.project_id = e.target.value;
            this._page = 1;
            this.loadEvidence();
        });
        document.getElementById('filter-activity').addEventListener('change', (e) => {
            this._filters.activity = e.target.value;
            this._page = 1;
            this.loadEvidence();
        });
        document.getElementById('filter-status').addEventListener('change', (e) => {
            this._filters.verification_status = e.target.value;
            this._page = 1;
            this.loadEvidence();
        });
        document.getElementById('filter-search').addEventListener('input', Utils.debounce((e) => {
            this._filters.search = e.target.value;
            this._page = 1;
            this.loadEvidence();
        }, 300));

        const modeGallery = document.getElementById('view-mode-gallery');
        const modeTimeline = document.getElementById('view-mode-timeline');
        const modeList = document.getElementById('view-mode-list');

        const updateActiveModeBtn = () => {
            modeGallery.classList.toggle('active', this._currentView === 'gallery');
            modeTimeline.classList.toggle('active', this._currentView === 'timeline');
            modeList.classList.toggle('active', this._currentView === 'list');
        };

        modeGallery.addEventListener('click', () => {
            this._currentView = 'gallery';
            updateActiveModeBtn();
            this.renderEvidenceData();
        });
        modeTimeline.addEventListener('click', () => {
            this._currentView = 'timeline';
            updateActiveModeBtn();
            this.renderEvidenceData();
        });
        modeList.addEventListener('click', () => {
            this._currentView = 'list';
            updateActiveModeBtn();
            this.renderEvidenceData();
        });

        updateActiveModeBtn();
    },

    _cachedData: [],
    _totalRecords: 0,

    async loadEvidence() {
        try {
            if (typeof Connectivity !== 'undefined' && !Connectivity.isOnline) {
                const cached = await OfflineDB.getAll('evidence');
                this._cachedData = cached || [];
                this._totalRecords = cached.length;
                this.renderEvidenceData();
                return;
            }

            const orgId = Auth.orgId;
            let url = `/api/v1/biochar/evidence/list?page=${this._page}&page_size=${this._pageSize}`;
            if (orgId && orgId !== 'null' && orgId !== 'undefined') {
                url += `&organization_id=${encodeURIComponent(orgId)}`;
            }
            if (this._filters.project_id) url += `&project_id=${this._filters.project_id}`;
            if (this._filters.activity) url += `&activity=${this._filters.activity}`;
            if (this._filters.verification_status) url += `&verification_status=${this._filters.verification_status}`;
            if (this._filters.search) url += `&search=${encodeURIComponent(this._filters.search)}`;

            const response = await fetch(url);
            const result = await response.json();

            if (result.status === 'success') {
                this._cachedData = result.data || [];
                this._totalRecords = result.total || 0;
                
                // Keep local cache synced with fresh online list
                if (typeof OfflineDB !== 'undefined') {
                    for (const item of this._cachedData) {
                        await OfflineDB.put('evidence', item);
                    }
                }
                
                this.renderEvidenceData();
            } else {
                throw new Error(result.detail || 'Failed to load evidence');
            }
        } catch (err) {
            console.error('Failed to query evidence REST API:', err);
            document.getElementById('ems-content-container').innerHTML = `
                <div class="empty-state">
                    <h3>Error loading evidence</h3>
                    <p>${err.message}</p>
                </div>
            `;
        }
    },

    renderEvidenceData() {
        const container = document.getElementById('ems-content-container');
        if (!container) return;

        if (this._cachedData.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No evidence records found</h3>
                    <p>Upload files or adjust filters to view attestation evidence.</p>
                </div>
            `;
            return;
        }

        if (this._currentView === 'gallery') {
            this.renderGallery(container);
        } else if (this._currentView === 'timeline') {
            this.renderTimeline(container);
        } else {
            this.renderTableList(container);
        }
    },

    renderGallery(container) {
        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
                ${this._cachedData.map(item => {
                    const thumbFile = item.files.find(f => f.file_role === 'thumbnail');
                    const thumbUrl = thumbFile ? thumbFile.storage_path : (item.media_type === 'image' ? item.storage_path : '/assets/pdf-placeholder.png');
                    const badgeClass = this.getStatusBadgeClass(item.verification_status);
                    
                    return `
                        <div class="card hover-scale" style="padding: 0; overflow: hidden; cursor: pointer; display: flex; flex-direction: column;" onclick="EvidenceModule.openDetailsDialog('${item.id}')">
                            <div style="position: relative; height: 180px; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; overflow: hidden;">
                                <img src="${thumbUrl}" alt="${Utils.escapeHtml(item.filename)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='/assets/file-placeholder.png'" />
                                <span class="badge ${badgeClass}" style="position: absolute; top: 12px; right: 12px;">${item.verification_status}</span>
                                <span class="badge badge-default" style="position: absolute; bottom: 12px; left: 12px; font-size: 11px;">${Utils.capitalize(item.activity)}</span>
                            </div>
                            <div style="padding: 16px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between;">
                                <div>
                                    <h4 style="margin: 0 0 6px 0; font-size: 14px; word-break: break-all;" class="text-truncate">${Utils.escapeHtml(item.filename)}</h4>
                                    <p style="margin: 0; font-size: 12px; color: var(--text-muted);">
                                        Uploaded ${Utils.formatDateTime(item.upload_timestamp)}
                                    </p>
                                </div>
                                <div style="margin-top: 12px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 8px;">
                                    <span>By ${Utils.escapeHtml(item.uploaded_by_role || 'Operator')}</span>
                                    <span>${Utils.formatBytes(item.file_size)}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            ${this.renderPagination()}
        `;
    },

    renderTimeline(container) {
        container.innerHTML = `
            <div style="position: relative; padding: 20px 0 20px 30px; margin-left: 20px; border-left: 2px solid var(--border);">
                ${this._cachedData.map(item => {
                    const badgeClass = this.getStatusBadgeClass(item.verification_status);
                    const isImg = item.media_type === 'image';
                    const iconSvg = isImg 
                        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`
                        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`;

                    return `
                        <div style="position: relative; margin-bottom: 30px;">
                            <!-- Timeline Dot -->
                            <div style="position: absolute; left: -41px; top: 0; width: 20px; height: 20px; border-radius: 50%; background: var(--bg-card); border: 2px solid var(--accent); display: flex; align-items: center; justify-content: center; color: var(--accent);">
                                ${iconSvg}
                            </div>
                            
                            <div class="card hover-scale" style="margin-bottom: 0; cursor: pointer;" onclick="EvidenceModule.openDetailsDialog('${item.id}')">
                                <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                                    ${isImg ? `
                                        <div style="width: 100px; height: 75px; border-radius: 6px; overflow: hidden; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                            <img src="${item.storage_path}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='/assets/file-placeholder.png'" />
                                        </div>
                                    ` : `
                                        <div style="width: 100px; height: 75px; border-radius: 6px; background: var(--bg-hover); display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; color: var(--text-muted);">
                                            ${iconSvg}
                                            <span style="font-size: 10px; margin-top: 4px;">PDF / Doc</span>
                                        </div>
                                    `}
                                    
                                    <div style="flex-grow: 1;">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                                            <h4 style="margin: 0; font-size: 15px; font-weight: 600;">${Utils.escapeHtml(item.filename)}</h4>
                                            <div style="display: flex; gap: 8px;">
                                                <span class="badge badge-default">${Utils.capitalize(item.activity)}</span>
                                                <span class="badge ${badgeClass}">${item.verification_status}</span>
                                            </div>
                                        </div>
                                        <p style="margin: 6px 0; font-size: 13px; color: var(--text-muted);">
                                            Uploaded by <strong>${Utils.escapeHtml(item.uploaded_by_role || 'Operator')}</strong> on ${Utils.formatDateTime(item.upload_timestamp)}
                                        </p>
                                        ${item.latitude ? `
                                            <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-accent);">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                                                <span>Location: ${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}</span>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            ${this.renderPagination()}
        `;
    },

    renderTableList(container) {
        container.innerHTML = `
            <div class="card" style="padding: 0; overflow: hidden;">
                <div id="ems-table-container"></div>
            </div>
        `;
        
        const tableContainer = document.getElementById('ems-table-container');
        DataTable.render(tableContainer, {
            columns: [
                { key: 'filename', label: 'Filename', sortable: true },
                { key: 'activity', label: 'Activity', sortable: true, render: (val) => `<span class="badge badge-default">${Utils.capitalize(val)}</span>` },
                { key: 'media_type', label: 'Type', sortable: true, render: (val) => val === 'image' ? '📸 Image' : '📄 Document' },
                { key: 'file_size', label: 'File Size', sortable: true, render: (val) => Utils.formatBytes(val) },
                { key: 'uploaded_by_role', label: 'Uploader Role', sortable: true },
                { key: 'upload_timestamp', label: 'Uploaded At', sortable: true, render: (val) => Utils.formatDateTime(val) },
                { 
                    key: 'verification_status', 
                    label: 'Status', 
                    sortable: true, 
                    render: (val) => {
                        const badgeClass = this.getStatusBadgeClass(val);
                        return `<span class="badge ${badgeClass}"><span class="badge-dot"></span>${val}</span>`;
                    } 
                },
            ],
            data: this._cachedData,
            emptyTitle: 'No evidence',
            emptyText: 'Upload evidence files to display here.',
            actions: (row) => `
                <button class="btn btn-ghost" style="padding: 4px 8px; font-size: 12px;" onclick="EvidenceModule.openDetailsDialog('${row.id}')">
                    Inspect
                </button>
            `
        });
    },

    renderPagination() {
        const totalPages = Math.ceil(this._totalRecords / this._pageSize);
        if (totalPages <= 1) return '';

        return `
            <div style="display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 30px;">
                <button class="btn btn-ghost" ${this._page === 1 ? 'disabled' : ''} onclick="EvidenceModule.setPage(${this._page - 1})">
                    &larr; Previous
                </button>
                <span style="font-size: 13px; color: var(--text-muted);">Page ${this._page} of ${totalPages}</span>
                <button class="btn btn-ghost" ${this._page === totalPages ? 'disabled' : ''} onclick="EvidenceModule.setPage(${this._page + 1})">
                    Next &rarr;
                </button>
            </div>
        `;
    },

    setPage(p) {
        this._page = p;
        this.loadEvidence();
    },

    getStatusBadgeClass(status) {
        switch (status) {
            case 'Locked': return 'badge-success';
            case 'Approved': return 'badge-success';
            case 'Rejected': return 'badge-danger';
            case 'Pending Review': return 'badge-warning';
            case 'Uploaded': return 'badge-primary';
            case 'Draft':
            default:
                return 'badge-default';
        }
    },

    // ─── Open Upload Dialog Component ───────────────────────────────────────
    openUploadDialog(context = null) {
        // Context contains pre-filled entity: { entity_type, entity_id, project_id, activity }
        let projectOptionsHtml = '';
        if (context && context.project_id) {
            projectOptionsHtml = `<option value="${context.project_id}" selected>Pre-selected Project</option>`;
        } else {
            projectOptionsHtml = `
                <option value="">Choose Project...</option>
                ${this._projects.map(p => `<option value="${p.id}">${Utils.escapeHtml(p.name)}</option>`).join('')}
            `;
        }

        const currentRole = Permissions.getRole();
        const defaultActivity = context?.activity || '';

        const html = `
            <div class="modal-header">
                <h3 class="modal-title">Upload Evidence Record</h3>
                <button class="modal-close-btn" onclick="Modal.close()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="ems-upload-form" class="form" style="display: flex; flex-direction: column; gap: 15px;">
                    <div class="form-group">
                        <label class="form-label" for="ems-project">Project <span class="required">*</span></label>
                        <select class="form-input" id="ems-project" name="project_id" data-validate="required" ${context?.project_id ? 'disabled' : ''}>
                            ${projectOptionsHtml}
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="ems-activity">Operational Activity <span class="required">*</span></label>
                        <select class="form-input" id="ems-activity" name="activity" data-validate="required" ${defaultActivity ? 'disabled' : ''}>
                            <option value="" ${!defaultActivity ? 'selected' : ''}>Choose Activity...</option>
                            <option value="feedstock" ${defaultActivity === 'feedstock' ? 'selected' : ''}>Feedstock Ingestion</option>
                            <option value="pyrolysis" ${defaultActivity === 'pyrolysis' ? 'selected' : ''}>Pyrolysis Telemetry</option>
                            <option value="batches" ${defaultActivity === 'batches' ? 'selected' : ''}>Biochar Production</option>
                            <option value="storage" ${defaultActivity === 'storage' ? 'selected' : ''}>Storage & Warehousing</option>
                            <option value="laboratory" ${defaultActivity === 'laboratory' ? 'selected' : ''}>Laboratory Assay</option>
                            <option value="distribution" ${defaultActivity === 'distribution' ? 'selected' : ''}>Delivery & Shipments</option>
                            <option value="farmer_application" ${defaultActivity === 'farmer_application' ? 'selected' : ''}>Farmer Application</option>
                            <option value="monitoring" ${defaultActivity === 'monitoring' ? 'selected' : ''}>Monitoring Observation</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="ems-file">Select File <span class="required">*</span></label>
                        <input type="file" class="form-input" id="ems-file" name="file" data-validate="required" accept="image/*,application/pdf,video/*" />
                        <span class="form-hint">Supported formats: JPG, PNG, PDF, MP4</span>
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="ems-remarks">Add remarks / comments (Optional)</label>
                        <textarea class="form-input" id="ems-remarks" name="remarks" placeholder="Type context about the evidence..."></textarea>
                    </div>

                    <div id="gps-status" style="font-size: 12px; color: var(--text-accent); display: flex; align-items: center; gap: 6px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                        <span id="gps-status-text">Acquiring GPS coordinates...</span>
                    </div>

                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 15px;">
                        <button type="button" class="btn btn-ghost" onclick="Modal.close()">Cancel</button>
                        <button type="submit" class="btn btn-primary" id="ems-submit-btn">Upload & Save</button>
                    </div>
                </form>
            </div>
        `;

        Modal.open(html, { width: '450px' });

        // Grab Geolocation if supported
        let lat = null, lng = null, alt = null;
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    lat = pos.coords.latitude;
                    lng = pos.coords.longitude;
                    alt = pos.coords.altitude;
                    const statusText = document.getElementById('gps-status-text');
                    if (statusText) statusText.textContent = `GPS tag locked: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                },
                (err) => {
                    const statusText = document.getElementById('gps-status-text');
                    if (statusText) statusText.textContent = "GPS authorization denied. Uploading without geo-metadata.";
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        } else {
            const statusText = document.getElementById('gps-status-text');
            if (statusText) statusText.textContent = "Geotagging not supported by browser.";
        }

        // Handle upload submit
        const form = document.getElementById('ems-upload-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fileInput = document.getElementById('ems-file');
            if (!fileInput.files || fileInput.files.length === 0) {
                Toast.error("Please select a file to upload");
                return;
            }

            const btn = document.getElementById('ems-submit-btn');
            btn.classList.add('loading');
            btn.disabled = true;

            // Helper function to calculate SHA-256 hash of a file client-side
            async function calculateSHA256(file) {
                const arrayBuffer = await file.arrayBuffer();
                const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                return hashHex;
            }

            try {
                const file = fileInput.files[0];

                if (typeof Connectivity !== 'undefined' && !Connectivity.isOnline) {
                    const projIdVal = context?.project_id || document.getElementById('ems-project').value || null;
                    const entityTypeVal = context?.entity_type || 'unlinked';
                    const entityIdVal = context?.entity_id || null;
                    const activityVal = context?.activity || document.getElementById('ems-activity').value;

                    await UploadQueue.queueFileUpload(file, {
                        evidence_id: crypto.randomUUID(),
                        organization_id: Auth.orgId,
                        project_id: projIdVal,
                        entity_type: entityTypeVal,
                        entity_id: entityIdVal,
                        activity: activityVal,
                        uploaded_by: Auth.user.id,
                        uploaded_by_role: currentRole
                    });

                    Toast.success("Offline: Upload queued locally! It will sync automatically.");
                    Modal.close();
                    await this.loadEvidence();
                    return;
                }

                // Calculate SHA-256 client side
                const sha256_hash = await calculateSHA256(file);

                const projIdVal = context?.project_id || document.getElementById('ems-project').value || null;
                const entityTypeVal = context?.entity_type || 'unlinked';
                const entityIdVal = context?.entity_id || null;
                const activityVal = context?.activity || document.getElementById('ems-activity').value;

                // 1. Request presigned upload URL from backend
                const uploadUrlResponse = await fetch('/api/v1/biochar/evidence/upload-url', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        filename: file.name,
                        mime_type: file.type || 'application/octet-stream',
                        file_size: file.size,
                        organization_id: Auth.orgId,
                        project_id: projIdVal,
                        entity_type: entityTypeVal,
                        entity_id: entityIdVal,
                        activity: activityVal,
                        uploaded_by: Auth.user.id,
                        uploaded_by_role: currentRole
                    })
                });

                if (!uploadUrlResponse.ok) {
                    const errData = await uploadUrlResponse.json();
                    throw new Error(errData.detail || 'Failed to request upload URL');
                }

                const uploadUrlData = await uploadUrlResponse.json();
                const { evidence_id, upload_url, headers } = uploadUrlData;

                // 2. Upload file directly to Cloudflare R2 using the presigned URL
                const r2Headers = { ...headers };
                const r2Response = await fetch(upload_url, {
                    method: 'PUT',
                    headers: r2Headers,
                    body: file
                });

                if (!r2Response.ok) {
                    throw new Error(`Direct upload to storage failed with status ${r2Response.status}`);
                }

                // 3. Confirm the upload with the backend
                const confirmResponse = await fetch('/api/v1/biochar/evidence/confirm-upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        evidence_id: evidence_id,
                        sha256_hash: sha256_hash
                    })
                });

                if (!confirmResponse.ok) {
                    const errData = await confirmResponse.json();
                    throw new Error(errData.detail || 'Failed to confirm upload with backend');
                }

                const confirmResult = await confirmResponse.json();

                if (confirmResult.status === 'success') {
                    Toast.success("Evidence uploaded successfully!");
                    Modal.close();
                    // Reload if EMS Dashboard is showing
                    if (this._container && document.getElementById('ems-content-container')) {
                        await this.loadEvidence();
                    }
                } else {
                    throw new Error(confirmResult.detail || 'Upload failed');
                }
            } catch (err) {
                console.error(err);
                Toast.error("Failed to upload: " + err.message);
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        });
    },

    // ─── Open Details & Review Dialog Component ─────────────────────────────
    async openDetailsDialog(evidenceId) {
        Modal.close();
        
        try {
            const response = await fetch(`/api/v1/biochar/evidence/${evidenceId}`);
            const result = await response.json();

            if (result.status !== 'success') {
                throw new Error(result.detail || 'Failed to retrieve evidence details');
            }

            const item = result.data;
            const isReviewer = ['Owner', 'Admin', 'Project Manager', 'MRV Officer'].includes(Permissions.getRole());
            const badgeClass = this.getStatusBadgeClass(item.verification_status);
            const isImg = item.media_type === 'image';
            const currentRole = Permissions.getRole();

            // Find specific file paths
            const origFile = item.files.find(f => f.file_role === 'original') || {};
            const compFile = item.files.find(f => f.file_role === 'compressed');
            const thumbFile = item.files.find(f => f.file_role === 'thumbnail');

            const viewUrl = compFile ? compFile.storage_path : item.storage_path;

            const html = `
                <div class="modal-header">
                    <h3 class="modal-title">Inspect Evidence: ${Utils.escapeHtml(item.filename)}</h3>
                    <button class="modal-close-btn" onclick="Modal.close()">&times;</button>
                </div>
                <div class="modal-body" style="padding: 0; display: flex; flex-direction: column; max-height: 80vh; overflow-y: auto;">
                    <div style="display: grid; grid-template-columns: 1fr 320px; border-bottom: 1px solid var(--border); min-height: 400px; flex-wrap: wrap;">
                        <!-- Left: Visual Viewer -->
                        <div style="background: #111827; display: flex; align-items: center; justify-content: center; padding: 20px; overflow: hidden; position: relative;">
                            ${isImg ? `
                                <img src="${viewUrl}" style="max-width: 100%; max-height: 420px; object-fit: contain; border-radius: 6px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);" />
                            ` : `
                                <div style="display: flex; flex-direction: column; align-items: center; color: var(--text-muted);">
                                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                                    <h4 style="margin: 15px 0 10px 0;">PDF Document</h4>
                                    <a href="/api/v1/biochar/evidence/${item.id}/download/original" target="_blank" class="btn btn-ghost">Open PDF in Tab</a>
                                </div>
                            `}
                        </div>

                        <!-- Right: Metadata & Information Panel -->
                        <div style="padding: 20px; border-left: 1px solid var(--border); display: flex; flex-direction: column; justify-content: space-between; background: var(--bg-card); overflow-y: auto;">
                            <div>
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                    <span class="badge ${badgeClass}">${item.verification_status}</span>
                                    <span class="badge badge-default" style="font-size: 11px;">${Utils.capitalize(item.activity)}</span>
                                </div>

                                <div style="display: flex; flex-direction: column; gap: 10px; font-size: 13px;">
                                    <div><strong>Uploader:</strong> ${Utils.escapeHtml(item.uploaded_by_role || 'Operator')}</div>
                                    <div><strong>Uploaded:</strong> ${Utils.formatDateTime(item.upload_timestamp)}</div>
                                    <div><strong>File Size:</strong> ${Utils.formatBytes(item.file_size)}</div>
                                    <div><strong>Mime Type:</strong> ${item.mime_type}</div>
                                    <div><strong>SHA-256 Hash:</strong> <code style="font-size: 11px; word-break: break-all;">${item.sha256_hash ? item.sha256_hash.slice(0, 32) + '...' : '—'}</code></div>
                                    
                                    ${item.latitude ? `
                                        <div>
                                            <strong>Coordinates:</strong> 
                                            <a href="https://maps.google.com/?q=${item.latitude},${item.longitude}" target="_blank" class="text-accent">
                                                ${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)} ↗
                                            </a>
                                        </div>
                                    ` : ''}

                                    ${item.device_information ? `
                                        <div style="border-top: 1px solid var(--border); padding-top: 8px; margin-top: 5px;">
                                            <strong>Remarks / Notes:</strong>
                                            <p style="margin: 4px 0 0 0; color: var(--text-muted); font-style: italic;">
                                                ${Utils.escapeHtml(item.device_information.remarks || 'No remarks provided')}
                                            </p>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>

                            <!-- Download buttons -->
                            <div style="border-top: 1px solid var(--border); padding-top: 15px; margin-top: 15px; display: flex; flex-direction: column; gap: 8px;">
                                <a href="/api/v1/biochar/evidence/${item.id}/download/original?user_id=${Auth.user.id}" class="btn btn-ghost" style="text-align: center;">
                                    Download Original (${Utils.formatBytes(item.file_size)})
                                </a>
                                ${compFile ? `
                                    <a href="/api/v1/biochar/evidence/${item.id}/download/compressed?user_id=${Auth.user.id}" class="btn btn-ghost" style="text-align: center;">
                                        Download Compressed Image
                                    </a>
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Bottom: Reviews History & Review Actions -->
                    <div style="padding: 20px; background: var(--bg-hover); display: flex; flex-direction: column; gap: 15px;">
                        <!-- Review History -->
                        <div>
                            <h4 style="margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Review Logs</h4>
                            ${item.reviews && item.reviews.length > 0 ? `
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${item.reviews.map(rev => `
                                        <div style="font-size: 13px; background: var(--bg-card); padding: 10px; border-radius: 6px; border-left: 3px solid ${this.getStatusBorderColor(rev.action)};">
                                            <div style="display: flex; justify-content: space-between; font-weight: 600;">
                                                <span>Action: ${rev.action}</span>
                                                <span style="font-size: 11px; color: var(--text-muted);">${Utils.formatDateTime(rev.review_time)}</span>
                                            </div>
                                            <p style="margin: 4px 0 0 0; color: var(--text-muted); font-style: italic;">
                                                Comments: "${Utils.escapeHtml(rev.comments || 'No comments')}"
                                            </p>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : `
                                <p style="margin: 0; font-size: 13px; color: var(--text-muted); font-style: italic;">No reviews performed yet.</p>
                            `}
                        </div>

                        <!-- Review Action Form (Only for authorized roles) -->
                        ${isReviewer && item.verification_status !== 'Locked' ? `
                            <div style="border-top: 1px solid var(--border); padding-top: 15px; margin-top: 5px;">
                                <h4 style="margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Execute Review</h4>
                                <form id="ems-review-form" style="display: grid; grid-template-columns: 1fr auto; gap: 15px; align-items: end;">
                                    <div class="form-group" style="margin-bottom: 0;">
                                        <label class="form-label" for="review-comments">Review Comments</label>
                                        <input type="text" class="form-input" id="review-comments" placeholder="Comments..." required />
                                    </div>
                                    <div style="display: flex; gap: 8px;">
                                        <button type="button" class="btn btn-warning" onclick="EvidenceModule.submitReview('${item.id}', 'Reject')">Reject</button>
                                        <button type="button" class="btn btn-success" onclick="EvidenceModule.submitReview('${item.id}', 'Approve')">Approve</button>
                                        <button type="button" class="btn btn-primary" onclick="EvidenceModule.submitReview('${item.id}', 'Lock')" style="background: #ef4444; border-color: #ef4444;">Lock</button>
                                    </div>
                                </form>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;

            Modal.open(html, { width: '850px' });
        } catch (err) {
            console.error(err);
            Toast.error("Failed to load details: " + err.message);
        }
    },

    getStatusBorderColor(action) {
        if (action === 'Approve') return '#10b981';
        if (action === 'Reject') return '#ef4444';
        if (action === 'Lock') return '#ef4444';
        return 'var(--border)';
    },

    async submitReview(evidenceId, action) {
        const commentsInput = document.getElementById('review-comments');
        if (!commentsInput || !commentsInput.value.trim()) {
            Toast.error("Please add review comments");
            return;
        }

        const comments = commentsInput.value.trim();

        try {
            const formData = new FormData();
            formData.append('reviewer_id', Auth.user.id);
            formData.append('action', action);
            formData.append('comments', comments);

            const response = await fetch(`/api/v1/biochar/evidence/${evidenceId}/review`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (result.status === 'success') {
                Toast.success(`Evidence marked as ${result.new_status}`);
                Modal.close();
                // Reload EMS Dashboard if displayed
                if (this._container && document.getElementById('ems-content-container')) {
                    await this.loadEvidence();
                }
            } else {
                throw new Error(result.detail || 'Review submission failed');
            }
        } catch (err) {
            console.error(err);
            Toast.error("Review submission failed: " + err.message);
        }
    }
};

if (typeof window !== 'undefined') {
    window.EvidenceModule = EvidenceModule;
}
