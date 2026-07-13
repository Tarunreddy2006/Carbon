// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Feedstock Module (CRUD)
// ═══════════════════════════════════════════════════════════════════════════

const FeedstockModule = {
    _container: null,
    _table: null,

    async render(container) {
        this._container = container;
        container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Feedstock Management</h1>
                    <p class="page-subtitle">Track biomass feedstock deliveries, GPS origin coordinates, and check project site associations.</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn btn-primary" id="create-feedstock-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        Log Feedstock Batch
                    </button>
                </div>
            </div>

            <div class="card animate-fade-up">
                <div id="feedstock-table-container">
                    <div class="page-loading">
                        <div class="skeleton skeleton-table"></div>
                    </div>
                </div>
            </div>
        `;

        await this.loadFeedstock();

        document.getElementById('create-feedstock-btn').addEventListener('click', () => this.openFeedstockModal());
    },

    async loadFeedstock() {
        try {
            const { data, error } = await supabase
                .from('feedstock_batches')
                .select('*, projects(name)')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const container = document.getElementById('feedstock-table-container');
            if (!container) return;

            this._table = DataTable.render(container, {
                columns: [
                    { key: 'batch_code', label: 'Feedstock Batch Code', sortable: true },
                    { key: 'feedstock_type', label: 'Biomass Category', sortable: true, render: (val) => `<span class="badge badge-default">${Utils.formatEnum(val)}</span>` },
                    { key: 'weight_kg', label: 'Wet Mass (t)', sortable: true, render: (val) => Utils.formatTons((val || 0) / 1000) },
                    { 
                        key: 'origin_location', 
                        label: 'Origin Coordinates', 
                        sortable: false, 
                        render: (val) => {
                            if (!val) return '<span class="text-muted">—</span>';
                            const parts = val.split(',');
                            if (parts.length === 2) {
                                const lat = Number(parts[0]).toFixed(5);
                                const lng = Number(parts[1]).toFixed(5);
                                return `<a href="https://maps.google.com/?q=${parts[0]},${parts[1]}" target="_blank" class="text-accent">${lat}, ${lng} ↗</a>`;
                            }
                            return Utils.escapeHtml(val);
                        }
                    },
                    { 
                        key: 'projects', 
                        label: 'Project Site', 
                        sortable: true, 
                        render: (val) => val ? Utils.escapeHtml(val.name) : '—' 
                    },
                    { key: 'created_at', label: 'Timestamp', sortable: true, render: (val) => Utils.formatDateTime(val) },
                ],
                data: data,
                emptyTitle: 'No feedstock logs',
                emptyText: 'Record biomass arrivals to start matching against production batches.',
                exportFilename: 'feedstock_batches_export.csv',
                actions: (row) => `
                    <div class="action-menu">
                        <button class="action-menu-btn" onclick="FeedstockModule.toggleMenu(event, '${row.id}')">•••</button>
                        <div class="action-menu-dropdown" id="dropdown-${row.id}">
                            <button class="action-menu-item" onclick="FeedstockModule.openFeedstockModal('${row.id}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                Edit Record
                            </button>
                            <button class="action-menu-item danger" onclick="FeedstockModule.deleteFeedstock('${row.id}', '${row.feedstock_type}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                Delete
                            </button>
                        </div>
                    </div>
                `
            });
        } catch (err) {
            console.error('Failed to load feedstock:', err);
            Toast.error('Failed to load feedstock: ' + err.message);
        }
    },

    toggleMenu(e, id) {
        e.stopPropagation();
        const dropdown = document.getElementById(`dropdown-${id}`);
        const wasOpen = dropdown.classList.contains('open');

        document.querySelectorAll('.action-menu-dropdown').forEach(d => d.classList.remove('open'));

        if (!wasOpen) {
            dropdown.classList.add('open');
            document.addEventListener('click', function closeMenu() {
                dropdown.classList.remove('open');
                document.removeEventListener('click', closeMenu);
            });
        }
    },

    async openFeedstockModal(feedstockId = null) {
        let title = 'Log Feedstock Delivery';
        let projectIdValue = '';
        let batchCodeValue = '';
        let typeValue = 'rice_husk';
        let latValue = '';
        let lngValue = '';
        let massValue = '';

        try {
            // Get active projects for select options
            const { data: projects, error: projectsErr } = await supabase
                .from('projects')
                .select('id, name')
                .order('name', { ascending: true });

            if (projectsErr) throw projectsErr;

            if (feedstockId) {
                title = 'Edit Feedstock Ingest';
                const { data, error } = await supabase
                    .from('feedstock_batches')
                    .select('*')
                    .eq('id', feedstockId)
                    .single();

                if (error) throw error;

                projectIdValue = data.project_id;
                batchCodeValue = data.batch_code;
                typeValue = data.feedstock_type;
                massValue = (data.weight_kg || 0) / 1000;
                
                if (data.origin_location) {
                    const parts = data.origin_location.split(',');
                    if (parts.length === 2) {
                        latValue = parts[0];
                        lngValue = parts[1];
                    }
                }
            } else {
                batchCodeValue = `FS-${Math.floor(100000 + Math.random() * 900000)}`;
            }

            let projectOptions = '<option value="">-- Select Project Site --</option>';
            projects.forEach(p => {
                const selected = p.id === projectIdValue ? 'selected' : '';
                projectOptions += `<option value="${p.id}" ${selected}>${Utils.escapeHtml(p.name)}</option>`;
            });

            const html = `
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                </div>
                <form id="feedstock-form">
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label" for="feedstock-project-id">Project Site <span class="required">*</span></label>
                            <select class="form-select" id="feedstock-project-id" name="project_id" data-validate="required" data-label="Project Site">
                                ${projectOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="feedstock-batch-code">Feedstock Batch Code <span class="required">*</span></label>
                            <input type="text" class="form-input" id="feedstock-batch-code" name="batch_code" value="${Utils.escapeHtml(batchCodeValue)}" data-validate="required" data-label="Batch Code" placeholder="e.g. FS-12345" />
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="feedstock-type">Biomass Feedstock Category <span class="required">*</span></label>
                            <select class="form-select" id="feedstock-type" name="feedstock_type" data-validate="required" data-label="Feedstock Category">
                                <option value="rice_husk" ${typeValue === 'rice_husk' ? 'selected' : ''}>Rice Husk</option>
                                <option value="wood_residue" ${typeValue === 'wood_residue' ? 'selected' : ''}>Wood Residue</option>
                                <option value="coffee_hulls" ${typeValue === 'coffee_hulls' ? 'selected' : ''}>Coffee Hulls</option>
                            </select>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="feedstock-lat">GPS Latitude <span class="required">*</span></label>
                                <input type="text" class="form-input" id="feedstock-lat" name="source_latitude" value="${latValue}" data-validate="required|number" data-label="Latitude" placeholder="e.g. 12.9716" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="feedstock-lng">GPS Longitude <span class="required">*</span></label>
                                <input type="text" class="form-input" id="feedstock-lng" name="source_longitude" value="${lngValue}" data-validate="required|number" data-label="Longitude" placeholder="e.g. 77.5946" />
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="feedstock-mass">Gross Wet Mass (Metric Tonnes) <span class="required">*</span></label>
                            <input type="text" class="form-input" id="feedstock-mass" name="wet_mass_tons" value="${massValue}" data-validate="required|number|positive" data-label="Wet Mass" placeholder="e.g. 12.5" />
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-ghost" onclick="Modal.close()">Cancel</button>
                        <button type="submit" class="btn btn-primary" id="save-feedstock-btn">
                            <span class="btn-text">Save Log</span>
                            <span class="btn-spinner"></span>
                        </button>
                    </div>
                </form>
            `;

            Modal.open(html, { width: '480px' });

            const form = document.getElementById('feedstock-form');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const { valid, errors } = FormValidator.validate(form);
                if (!valid) return;

                const saveBtn = document.getElementById('save-feedstock-btn');
                saveBtn.classList.add('loading');
                saveBtn.disabled = true;

                const lat = document.getElementById('feedstock-lat').value.trim();
                const lng = document.getElementById('feedstock-lng').value.trim();
                const massTons = parseFloat(document.getElementById('feedstock-mass').value);

                const payload = {
                    project_id: document.getElementById('feedstock-project-id').value,
                    batch_code: document.getElementById('feedstock-batch-code').value.trim(),
                    feedstock_type: document.getElementById('feedstock-type').value,
                    origin_location: `${lat},${lng}`,
                    weight_kg: massTons * 1000,
                    received_date: new Date().toISOString().split('T')[0]
                };

                try {
                    let error;
                    if (feedstockId) {
                        const { error: err } = await supabase
                            .from('feedstock_batches')
                            .update(payload)
                            .eq('id', feedstockId);
                        error = err;
                    } else {
                        const { error: err } = await supabase
                            .from('feedstock_batches')
                            .insert(payload);
                        error = err;
                    }

                    if (error) throw error;

                    Toast.success(feedstockId ? 'Feedstock record updated' : 'Feedstock delivery logged successfully');
                    Modal.close();
                    await this.loadFeedstock();
                } catch (err) {
                    console.error(err);
                    Toast.error('Failed to log feedstock: ' + err.message);
                } finally {
                    saveBtn.classList.remove('loading');
                    saveBtn.disabled = false;
                }
            });

        } catch (err) {
            Toast.error('Initialization failed: ' + err.message);
        }
    },

    async deleteFeedstock(id, type) {
        const confirmed = await Modal.confirm(
            'Delete Feedstock Record',
            `Are you sure you want to delete this feedstock batch log for "${Utils.capitalize(type.replace(/_/g, ' '))}"? This operation is permanent.`,
            { confirmText: 'Delete Record', danger: true }
        );

        if (!confirmed) return;

        try {
            const { error } = await supabase
                .from('feedstock_batches')
                .delete()
                .eq('id', id);

            if (error) throw error;

            Toast.success('Feedstock log deleted successfully');
            await this.loadFeedstock();
        } catch (err) {
            console.error(err);
            Toast.error('Failed to delete record: ' + err.message);
        }
    }
};

if (typeof window !== 'undefined') {
    window.FeedstockModule = FeedstockModule;
}
