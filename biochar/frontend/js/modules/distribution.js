// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Distribution Module (Attestation)
// ═══════════════════════════════════════════════════════════════════════════

const DistributionModule = {
    _container: null,
    _table: null,

    async render(container) {
        this._container = container;
        container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Distribution Sinks</h1>
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
            const { data, error } = await supabase
                .from('distribution_sinks')
                .select('*, biochar_batches(batch_lot_number)')
                .order('attestation_timestamp', { ascending: false });

            if (error) throw error;

            const container = document.getElementById('distribution-table-container');
            if (!container) return;

            this._table = DataTable.render(container, {
                columns: [
                    { key: 'delivery_ticket_id', label: 'Ticket ID', sortable: true, render: (val) => `<strong>#${Utils.escapeHtml(val)}</strong>` },
                    { 
                        key: 'biochar_batches', 
                        label: 'Associated Batch', 
                        sortable: true, 
                        render: (val) => val ? `Lot #${Utils.escapeHtml(val.batch_lot_number)}` : '—' 
                    },
                    { key: 'farmer_id', label: 'Farmer / End User ID', sortable: true },
                    { key: 'shipped_mass_tons', label: 'Shipped Mass (t)', sortable: true, render: (val) => Utils.formatTons(val) },
                    { 
                        key: 'sink_latitude', 
                        label: 'Sink Location', 
                        sortable: false, 
                        render: (val, row) => row.sink_latitude 
                            ? `<a href="https://maps.google.com/?q=${row.sink_latitude},${row.sink_longitude}" target="_blank" class="text-accent">${Number(row.sink_latitude).toFixed(5)}, ${Number(row.sink_longitude).toFixed(5)} ↗</a>` 
                            : '<span class="text-muted">Ungeotagged</span>'
                    },
                    { 
                        key: 'attestation_timestamp', 
                        label: 'Attestation Time', 
                        sortable: true, 
                        render: (val) => val ? Utils.formatDateTime(val) : '<span class="badge badge-warning">Pending Sign-off</span>' 
                    },
                ],
                data: data,
                emptyTitle: 'No distribution tickets logged',
                emptyText: 'Record farmer shipments to lock coordinates, collect photos, and attest final biochar application.',
                exportFilename: 'distribution_delivery_tickets.csv',
                actions: (row) => `
                    <div class="action-menu">
                        <button class="action-menu-btn" onclick="DistributionModule.toggleMenu(event, '${row.id}')">•••</button>
                        <div class="action-menu-dropdown" id="dropdown-${row.id}">
                            <button class="action-menu-item" onclick="DistributionModule.openDeliveryModal('${row.id}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                Edit Ticket
                            </button>
                            <button class="action-menu-item danger" onclick="DistributionModule.deleteDelivery('${row.id}', '${Utils.escapeHtml(row.delivery_ticket_id)}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                Delete
                            </button>
                        </div>
                    </div>
                `
            });
        } catch (err) {
            console.error(err);
            Toast.error('Failed to load delivery logs: ' + err.message);
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

    async openDeliveryModal(deliveryId = null) {
        let title = 'Log Distribution Ticket';
        let batchIdValue = '';
        let ticketId = '';
        let farmerId = '';
        let mass = '';
        let lat = '';
        let lng = '';

        try {
            // Load batches
            const { data: batches, error: batchesErr } = await supabase
                .from('biochar_batches')
                .select('id, batch_lot_number')
                .order('batch_lot_number', { ascending: true });

            if (batchesErr) throw batchesErr;

            if (deliveryId) {
                title = 'Edit Distribution Ticket';
                const { data, error } = await supabase
                    .from('distribution_sinks')
                    .select('*')
                    .eq('id', deliveryId)
                    .single();

                if (error) throw error;

                batchIdValue = data.batch_id;
                ticketId = data.delivery_ticket_id;
                farmerId = data.farmer_id;
                mass = data.shipped_mass_tons;
                lat = data.sink_latitude || '';
                lng = data.sink_longitude || '';
            } else {
                // Generate a ticket ID BC-TKT-XXXXXX
                ticketId = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
            }

            let batchOptions = '<option value="">-- Select Batch --</option>';
            batches.forEach(b => {
                const selected = b.id === batchIdValue ? 'selected' : '';
                batchOptions += `<option value="${b.id}" ${selected}>Lot #${Utils.escapeHtml(b.batch_lot_number)}</option>`;
            });

            const html = `
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                </div>
                <form id="delivery-form">
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label" for="delivery-batch-id">Batch Lot <span class="required">*</span></label>
                            <select class="form-select" id="delivery-batch-id" name="batch_id" data-validate="required" data-label="Associated Batch">
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
                                <input type="text" class="form-input" id="delivery-lat" name="sink_latitude" value="${lat}" placeholder="e.g. 13.0827" data-validate="number" data-label="Latitude" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="delivery-lng">Sink GPS Longitude</label>
                                <input type="text" class="form-input" id="delivery-lng" name="sink_longitude" value="${lng}" placeholder="e.g. 80.2707" data-validate="number" data-label="Longitude" />
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

                const batch_id = document.getElementById('delivery-batch-id').value;
                const delivery_ticket_id = document.getElementById('delivery-ticket').value.trim();
                const farmer_id = document.getElementById('delivery-farmer').value.trim();
                const shipped_mass_tons = parseFloat(document.getElementById('delivery-mass').value);
                const rawLat = document.getElementById('delivery-lat').value;
                const rawLng = document.getElementById('delivery-lng').value;

                const payload = {
                    batch_id,
                    delivery_ticket_id,
                    farmer_id,
                    shipped_mass_tons,
                    sink_latitude: rawLat ? parseFloat(rawLat) : null,
                    sink_longitude: rawLng ? parseFloat(rawLng) : null,
                    attestation_timestamp: new Date().toISOString()
                };

                try {
                    let error;
                    if (deliveryId) {
                        const { error: err } = await supabase
                            .from('distribution_sinks')
                            .update(payload)
                            .eq('id', deliveryId);
                        error = err;
                    } else {
                        const { error: err } = await supabase
                            .from('distribution_sinks')
                            .insert(payload);
                        error = err;
                    }

                    if (error) throw error;

                    // Automatically update batch status to 'completed' since biochar is applied to sink (sequestered)
                    await supabase
                        .from('biochar_batches')
                        .update({ status: 'completed' })
                        .eq('id', batch_id);

                    Toast.success('Distribution delivery ticket logged successfully');
                    Modal.close();
                    await this.loadDeliveries();
                } catch (err) {
                    console.error(err);
                    Toast.error('Failed to log distribution ticket: ' + err.message);
                } finally {
                    saveBtn.classList.remove('loading');
                    saveBtn.disabled = false;
                }
            });

        } catch (err) {
            Toast.error('Setup failed: ' + err.message);
        }
    },

    async deleteDelivery(id, ticketId) {
        const confirmed = await Modal.confirm(
            'Delete Distribution Ticket',
            `Are you sure you want to delete delivery ticket #${ticketId}? This will remove the recorded sink application coordinate trails.`,
            { confirmText: 'Delete Ticket', danger: true }
        );

        if (!confirmed) return;

        try {
            const { error } = await supabase
                .from('distribution_sinks')
                .delete()
                .eq('id', id);

            if (error) throw error;

            Toast.success('Distribution ticket deleted successfully');
            await this.loadDeliveries();
        } catch (err) {
            console.error(err);
            Toast.error('Failed to delete ticket: ' + err.message);
        }
    }
};
