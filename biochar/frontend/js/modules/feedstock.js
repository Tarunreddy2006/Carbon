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
                    <p class="page-subtitle">Track biomass feedstock deliveries, GPS origin coordinates, and satellite deforestation screenings.</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn btn-primary" id="create-feedstock-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        Log Delivery
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
            // Join biochar_batches to show lot numbers
            const { data, error } = await supabase
                .from('feedstock_ingests')
                .select('*, biochar_batches(batch_lot_number)')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const container = document.getElementById('feedstock-table-container');
            if (!container) return;

            this._table = DataTable.render(container, {
                columns: [
                    { key: 'feedstock_type', label: 'Biomass Category', sortable: true, render: (val) => `<span class="badge badge-default">${Utils.formatEnum(val)}</span>` },
                    { key: 'wet_mass_tons', label: 'Wet Mass (t)', sortable: true, render: (val) => Utils.formatTons(val) },
                    { 
                        key: 'source_latitude', 
                        label: 'Origin Coordinates', 
                        sortable: false, 
                        render: (val, row) => `<a href="https://maps.google.com/?q=${row.source_latitude},${row.source_longitude}" target="_blank" class="text-accent">${Number(row.source_latitude).toFixed(5)}, ${Number(row.source_longitude).toFixed(5)} ↗</a>` 
                    },
                    { 
                        key: 'satellite_clearance_status', 
                        label: 'Satellite Screening', 
                        sortable: true, 
                        render: (val) => val 
                            ? `<span class="badge badge-success"><span class="badge-dot"></span>Passed</span>` 
                            : `<span class="badge badge-danger"><span class="badge-dot"></span>Failed / Pending</span>` 
                    },
                    { 
                        key: 'biochar_batches', 
                        label: 'Associated Batch', 
                        sortable: true, 
                        render: (val) => val ? `Lot #${Utils.escapeHtml(val.batch_lot_number)}` : '—' 
                    },
                    { key: 'created_at', label: 'Timestamp', sortable: true, render: (val) => Utils.formatDateTime(val) },
                ],
                data: data,
                emptyTitle: 'No feedstock logs',
                emptyText: 'Record biomass arrivals to start matching against production batches.',
                exportFilename: 'feedstock_deliveries_export.csv',
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
        let batchIdValue = '';
        let typeValue = 'rice_husk';
        let latValue = '';
        let lngValue = '';
        let massValue = '';
        let clearanceValue = false;

        try {
            // Get active batches for select options
            const { data: batches, error: batchesErr } = await supabase
                .from('biochar_batches')
                .select('id, batch_lot_number')
                .order('batch_lot_number', { ascending: true });

            if (batchesErr) throw batchesErr;

            if (feedstockId) {
                title = 'Edit Feedstock Ingest';
                const { data, error } = await supabase
                    .from('feedstock_ingests')
                    .select('*')
                    .eq('id', feedstockId)
                    .single();

                if (error) throw error;

                batchIdValue = data.batch_id;
                typeValue = data.feedstock_type;
                latValue = data.source_latitude;
                lngValue = data.source_longitude;
                massValue = data.wet_mass_tons;
                clearanceValue = data.satellite_clearance_status;
            }

            let batchOptions = '<option value="">-- Select Batch Lot --</option>';
            batches.forEach(b => {
                const selected = b.id === batchIdValue ? 'selected' : '';
                batchOptions += `<option value="${b.id}" ${selected}>Lot #${Utils.escapeHtml(b.batch_lot_number)}</option>`;
            });

            const html = `
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                </div>
                <form id="feedstock-form">
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label" for="feedstock-batch-id">Production Batch <span class="required">*</span></label>
                            <select class="form-select" id="feedstock-batch-id" name="batch_id" data-validate="required" data-label="Production Batch">
                                ${batchOptions}
                            </select>
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
                        <div class="form-group flex items-center gap-2 mt-3">
                            <input type="checkbox" id="feedstock-clearance" name="satellite_clearance_status" ${clearanceValue ? 'checked' : ''} style="cursor:pointer;" />
                            <label class="form-label mb-0" for="feedstock-clearance" style="cursor:pointer;">Satellite clearance verification passed</label>
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

                const payload = {
                    batch_id: document.getElementById('feedstock-batch-id').value,
                    feedstock_type: document.getElementById('feedstock-type').value,
                    source_latitude: parseFloat(document.getElementById('feedstock-lat').value),
                    source_longitude: parseFloat(document.getElementById('feedstock-lng').value),
                    wet_mass_tons: parseFloat(document.getElementById('feedstock-mass').value),
                    satellite_clearance_status: document.getElementById('feedstock-clearance').checked
                };

                try {
                    let error;
                    if (feedstockId) {
                        const { error: err } = await supabase
                            .from('feedstock_ingests')
                            .update(payload)
                            .eq('id', feedstockId);
                        error = err;
                    } else {
                        const { error: err } = await supabase
                            .from('feedstock_ingests')
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
            'Delete Feedstock Ingest Record',
            `Are you sure you want to delete this feedstock ingest log for "${Utils.capitalize(type.replace(/_/g, ' '))}"? This operation is permanent.`,
            { confirmText: 'Delete Record', danger: true }
        );

        if (!confirmed) return;

        try {
            const { error } = await supabase
                .from('feedstock_ingests')
                .delete()
                .eq('id', id);

            if (error) throw error;

            Toast.success('Feedstock ingest log deleted successfully');
            await this.loadFeedstock();
        } catch (err) {
            console.error(err);
            Toast.error('Failed to delete record: ' + err.message);
        }
    }
};
