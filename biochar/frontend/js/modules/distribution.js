// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Distribution Module (Attestation)
// ═══════════════════════════════════════════════════════════════════════════

const DistributionModule = {
    _container: null,
    _table: null,

    async render(container) {
        this._container = container;
        container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Distribution & Shipments</h1>
                    <p class="page-subtitle">Manage deliveries of certified biochar to end-users (farmers) to verify carbon application and sequestration.</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn btn-primary" id="create-distribution-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        Log Delivery
                    </button>
                </div>
            </div>

            <div class="card animate-fade-up">
                <div id="distribution-table-container">
                    <div class="page-loading">
                        <div class="skeleton skeleton-table"></div>
                    </div>
                </div>
            </div>
        `;

        await this.loadDeliveries();

        document.getElementById('create-distribution-btn').addEventListener('click', () => this.openDeliveryModal());
    },

    async loadDeliveries() {
        try {
            // Query shipments
            const { data: shipments, error: shipErr } = await supabase
                .from('shipments')
                .select('*, biochar_batches(batch_code, pyrolysis_runs(feedstock_batches(project_id)))')
                .order('shipment_number', { ascending: false });

            if (shipErr) throw shipErr;

            // Query applications to map coordinates
            const { data: apps, error: appErr } = await supabase
                .from('biochar_applications')
                .select('*');

            if (appErr) throw appErr;

            const appMap = {};
            apps.forEach(a => {
                if (a.biochar_batch_id) {
                    appMap[a.biochar_batch_id] = a;
                }
            });

            const mappedData = shipments.map(s => {
                const app = appMap[s.biochar_batch_id] || {};
                const projectId = s.biochar_batches?.pyrolysis_runs?.feedstock_batches?.project_id || '';
                return {
                    id: s.id,
                    shipment_number: s.shipment_number || '—',
                    batch_code: s.biochar_batches?.batch_code || '—',
                    destination: s.destination || '—',
                    shipped_weight_kg: s.shipped_weight_kg || 0,
                    latitude: app.latitude,
                    longitude: app.longitude,
                    status: s.status || 'pending',
                    biochar_batch_id: s.biochar_batch_id,
                    project_id: projectId
                };
            });

            const container = document.getElementById('distribution-table-container');
            if (!container) return;

            this._table = DataTable.render(container, {
                columns: [
                    { key: 'shipment_number', label: 'Shipment ID', sortable: true, render: (val) => `<strong>#${Utils.escapeHtml(val)}</strong>` },
                    { 
                        key: 'batch_code', 
                        label: 'Associated Batch', 
                        sortable: true, 
                        render: (val) => `Lot #${Utils.escapeHtml(val)}` 
                    },
                    { key: 'destination', label: 'Farmer / Destination', sortable: true },
                    { key: 'shipped_weight_kg', label: 'Shipped Mass (t)', sortable: true, render: (val) => Utils.formatTons((val || 0) / 1000.0) },
                    { 
                        key: 'latitude', 
                        label: 'GPS Location', 
                        sortable: false, 
                        render: (val, row) => row.latitude 
                            ? `<a href="https://maps.google.com/?q=${row.latitude},${row.longitude}" target="_blank" class="text-accent">${Number(row.latitude).toFixed(5)}, ${Number(row.longitude).toFixed(5)} ↗</a>` 
                            : '<span class="text-muted">Ungeotagged</span>'
                    },
                    { 
                        key: 'status', 
                        label: 'Status', 
                        sortable: true, 
                        render: (val) => {
                            let badgeClass = 'badge-warning';
                            if (val === 'delivered') badgeClass = 'badge-success';
                            if (val === 'shipped') badgeClass = 'badge-primary';
                            return `<span class="badge ${badgeClass}"><span class="badge-dot"></span>${Utils.capitalize(val)}</span>`;
                        }
                    },
                ],
                data: mappedData,
                emptyTitle: 'No shipments logged',
                emptyText: 'Record farmer shipments to lock coordinates, collect photos, and attest final biochar application.',
                exportFilename: 'shipments_export.csv',
                actions: (row) => `
                    <div class="action-menu">
                        <button class="action-menu-btn" onclick="DistributionModule.toggleMenu(event, '${row.id}')">•••</button>
                        <div class="action-menu-dropdown" id="dropdown-${row.id}">
                            <button class="action-menu-item" onclick="EvidenceModule.openUploadDialog({ entity_type: 'distribution', entity_id: '${row.id}', project_id: '${row.project_id || ''}', activity: 'distribution' })">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                Delivery Evidence
                            </button>
                            <button class="action-menu-item" onclick="EvidenceModule.openUploadDialog({ entity_type: 'distribution', entity_id: '${row.id}', project_id: '${row.project_id || ''}', activity: 'farmer_application' })">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                Application Evidence
                            </button>
                            <button class="action-menu-item danger" onclick="DistributionModule.deleteDelivery('${row.id}', '${row.biochar_batch_id}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                Delete
                            </button>
                        </div>
                    </div>
                `
            });
        } catch (err) {
            console.error(err);
            Toast.error('Failed to load shipments: ' + err.message);
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

    async openDeliveryModal() {
        let title = 'Log Distribution Ticket';
        let batchIdValue = '';
        let ticketId = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
        let farmerId = '';
        let mass = '';
        let lat = '';
        let lng = '';

        try {
            const { data: batches, error: batchesErr } = await supabase
                .from('biochar_batches')
                .select('id, batch_code')
                .order('batch_code', { ascending: true });

            if (batchesErr) throw batchesErr;

            let batchOptions = '<option value="">-- Select Batch --</option>';
            batches.forEach(b => {
                const selected = b.id === batchIdValue ? 'selected' : '';
                batchOptions += `<option value="${b.id}" ${selected}>Lot #${Utils.escapeHtml(b.batch_code)}</option>`;
            });

            const html = `
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                </div>
                <form id="delivery-form">
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label" for="delivery-batch-id">Batch Lot <span class="required">*</span></label>
                            <select class="form-select" id="delivery-batch-id" name="biochar_batch_id" data-validate="required" data-label="Associated Batch">
                                ${batchOptions}
                            </select>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="delivery-ticket">Delivery Ticket ID <span class="required">*</span></label>
                                <input type="text" class="form-input" id="delivery-ticket" name="delivery_ticket_id" value="${Utils.escapeHtml(ticketId)}" data-validate="required" data-label="Ticket ID" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="delivery-farmer">Farmer / End User ID <span class="required">*</span></label>
                                <input type="text" class="form-input" id="delivery-farmer" name="farmer_id" value="${Utils.escapeHtml(farmerId)}" data-validate="required" data-label="Farmer ID" placeholder="e.g. FARM-55" />
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="delivery-mass">Shipped Mass (Metric Tonnes) <span class="required">*</span></label>
                            <input type="text" class="form-input" id="delivery-mass" name="shipped_mass_tons" value="${mass}" placeholder="e.g. 5.75" data-validate="required|number|positive" data-label="Shipped Mass" />
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="delivery-lat">Sink GPS Latitude</label>
                                <input type="text" class="form-input" id="delivery-lat" name="latitude" value="${lat}" placeholder="e.g. 13.0827" data-validate="number" data-label="Latitude" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="delivery-lng">Sink GPS Longitude</label>
                                <input type="text" class="form-input" id="delivery-lng" name="longitude" value="${lng}" placeholder="e.g. 80.2707" data-validate="number" data-label="Longitude" />
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-ghost" onclick="Modal.close()">Cancel</button>
                        <button type="submit" class="btn btn-primary" id="save-delivery-btn">
                            <span class="btn-text">Save Ticket</span>
                            <span class="btn-spinner"></span>
                        </button>
                    </div>
                </form>
            `;

            Modal.open(html, { width: '480px' });

            const form = document.getElementById('delivery-form');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const { valid } = FormValidator.validate(form);
                if (!valid) return;

                const saveBtn = document.getElementById('save-delivery-btn');
                saveBtn.classList.add('loading');
                saveBtn.disabled = true;

                const biochar_batch_id = document.getElementById('delivery-batch-id').value;
                const delivery_ticket_id = document.getElementById('delivery-ticket').value.trim();
                const farmer_id = document.getElementById('delivery-farmer').value.trim();
                const shipped_mass_tons = parseFloat(document.getElementById('delivery-mass').value);
                const rawLat = document.getElementById('delivery-lat').value;
                const rawLng = document.getElementById('delivery-lng').value;

                try {
                    // 1. Insert into shipments table mapping shipment_number, shipped_weight_kg, status
                    const { error: shipError } = await supabase
                        .from('shipments')
                        .insert({
                            biochar_batch_id,
                            shipment_number: delivery_ticket_id,
                            shipped_weight_kg: shipped_mass_tons * 1000.0,
                            destination: farmer_id,
                            status: 'delivered',
                            shipped_date: new Date().toISOString().split('T')[0]
                        });

                    if (shipError) throw shipError;

                    // 2. Insert into biochar_applications table with application_site, latitude, longitude
                    const { error: appError } = await supabase
                        .from('biochar_applications')
                        .insert({
                            biochar_batch_id,
                            application_site: delivery_ticket_id,
                            latitude: rawLat ? parseFloat(rawLat) : null,
                            longitude: rawLng ? parseFloat(rawLng) : null,
                            application_rate_kg_ha: 1500,
                            area_hectares: 2.0,
                            application_date: new Date().toISOString().split('T')[0],
                            applied_by: farmer_id
                        });

                    if (appError) throw appError;

                    // Automatically update batch status to completed
                    await supabase
                        .from('biochar_batches')
                        .update({ status: 'completed' })
                        .eq('id', biochar_batch_id);

                    Toast.success('Shipment and attestation logged successfully');
                    Modal.close();
                    await this.loadDeliveries();
                } catch (err) {
                    console.error(err);
                    Toast.error('Failed to log shipment: ' + err.message);
                } finally {
                    saveBtn.classList.remove('loading');
                    saveBtn.disabled = false;
                }
            });

        } catch (err) {
            Toast.error('Setup failed: ' + err.message);
        }
    },

    async deleteDelivery(shipmentId, batchId) {
        const confirmed = await Modal.confirm(
            'Delete Shipment Record',
            'Are you sure you want to delete this shipment? This will remove the attestation coordinates and delivery details.',
            { confirmText: 'Delete Shipment', danger: true }
        );

        if (!confirmed) return;

        try {
            // Delete shipment from shipments
            const { error: shipErr } = await supabase
                .from('shipments')
                .delete()
                .eq('id', shipmentId);

            if (shipErr) throw shipErr;

            // Delete associated application for the batch
            if (batchId) {
                await supabase
                    .from('biochar_applications')
                    .delete()
                    .eq('biochar_batch_id', batchId);
            }

            Toast.success('Shipment deleted successfully');
            await this.loadDeliveries();
        } catch (err) {
            console.error(err);
            Toast.error('Failed to delete shipment: ' + err.message);
        }
    }
};

if (typeof window !== 'undefined') {
    window.DistributionModule = DistributionModule;
}
