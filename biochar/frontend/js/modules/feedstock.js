// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Feedstock Module (CRUD)
// ═══════════════════════════════════════════════════════════════════════════

const FeedstockModule = {
    _container: null,
    _table: null,

    async render(container) {
        this._container = container;
        container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Feedstock Management & Intelligence Engine</h1>
                    <p class="page-subtitle">Biomass quality analytics, moisture trends, storage degradation metrics, and decision-support recommendations.</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn btn-primary" id="create-feedstock-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        Log Feedstock Batch
                    </button>
                </div>
            </div>

            <!-- Feedstock Intelligence Dashboard Widgets -->
            <div class="kpi-grid animate-fade-up" style="margin-bottom: var(--space-6);">
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Total Feedstock Lots</span>
                        <span class="kpi-card-icon">🪵</span>
                    </div>
                    <div class="kpi-card-value" id="fs-kpi-lots">—</div>
                    <small>Biomass inventory lots</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Average Moisture</span>
                        <span class="kpi-card-icon">💧</span>
                    </div>
                    <div class="kpi-card-value" id="fs-kpi-moisture">—</div>
                    <small>Target: ≤25.0%</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Average Dry Matter</span>
                        <span class="kpi-card-icon">🌾</span>
                    </div>
                    <div class="kpi-card-value text-success" id="fs-kpi-dry-matter">—</div>
                    <small>Usable biomass ratio</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Top Supplier</span>
                        <span class="kpi-card-icon">⭐</span>
                    </div>
                    <div class="kpi-card-value text-accent" id="fs-kpi-top-supplier" style="font-size: 1.1rem; line-height: 1.8rem;">—</div>
                    <small>Highest quality ranking</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Active Alerts</span>
                        <span class="kpi-card-icon">🚨</span>
                    </div>
                    <div class="kpi-card-value text-danger" id="fs-kpi-alerts">—</div>
                    <small>High moisture/contamination</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Avg Quality Score</span>
                        <span class="kpi-card-icon">💯</span>
                    </div>
                    <div class="kpi-card-value text-success" id="fs-kpi-quality-score">—</div>
                    <small>Feedstock reliability %</small>
                </div>
            </div>

            <!-- Decision-Support Recommendation Panel -->
            <div class="card animate-fade-up" style="margin-bottom: var(--space-6); background: rgba(56, 189, 248, 0.04); border: 1px solid rgba(56, 189, 248, 0.15);">
                <div class="card-header flex items-center justify-between" style="padding-bottom: 0;">
                    <div>
                        <h3 class="card-title flex items-center gap-2">
                            <span>💡 Feedstock Intelligence Recommendations</span>
                        </h3>
                        <p class="card-subtitle text-muted" style="margin: 0;">Automated insights to optimize biomass purchasing & reduce processing loss</p>
                    </div>
                </div>
                <div id="fs-recommendations-container" class="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div class="p-3 rounded bg-input border border-secondary">
                        <div class="font-semibold text-accent" style="font-size: 0.9rem;">⭐ Supplier Optimization</div>
                        <div style="font-size: 0.85rem; margin-top: 4px;">Green Biomass Pvt Ltd consistently provides higher quality biomass (94% score, 15% avg moisture).</div>
                    </div>
                    <div class="p-3 rounded bg-input border border-secondary">
                        <div class="font-semibold text-warning" style="font-size: 0.9rem;">💧 Moisture Management</div>
                        <div style="font-size: 0.85rem; margin-top: 4px;">Average moisture increased 4.2% in recent deliveries. Ensure covered storage in Yard B.</div>
                    </div>
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

        await this.loadFeedstockDashboard();
        await this.loadFeedstock();

        document.getElementById('create-feedstock-btn').addEventListener('click', () => this.openFeedstockModal());
    },

    async loadFeedstockDashboard() {
        try {
            const { data } = await supabase.from('feedstock_batches').select('*');

            const totalLots = data ? data.length : 0;
            const moistures = data ? data.map(b => b.moisture_percent).filter(m => m != null) : [];
            const avgMoisture = moistures.length ? (moistures.reduce((a, b) => a + b, 0) / moistures.length).toFixed(1) : '—';
            const avgDryMatter = avgMoisture !== '—' ? (100.0 - parseFloat(avgMoisture)).toFixed(1) : '—';

            const scores = data ? data.map(b => b.quality_score).filter(s => s != null) : [];
            const avgQuality = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';

            const alerts = data ? data.filter(b => b.contamination_status || (b.moisture_percent && b.moisture_percent > 25)) : [];

            // Calculate top supplier dynamically from recorded lots
            let topSupplier = '—';
            if (data && data.length > 0) {
                const supplierCounts = {};
                data.forEach(b => {
                    const s = b.supplier_name || 'Green Biomass Pvt Ltd';
                    supplierCounts[s] = (supplierCounts[s] || 0) + 1;
                });
                let maxCount = 0;
                Object.entries(supplierCounts).forEach(([sName, count]) => {
                    if (count > maxCount) {
                        maxCount = count;
                        topSupplier = sName;
                    }
                });
            }

            document.getElementById('fs-kpi-lots').textContent = totalLots;
            document.getElementById('fs-kpi-moisture').textContent = avgMoisture !== '—' ? `${avgMoisture}%` : '—';
            document.getElementById('fs-kpi-dry-matter').textContent = avgDryMatter !== '—' ? `${avgDryMatter}%` : '—';
            document.getElementById('fs-kpi-top-supplier').textContent = topSupplier;
            document.getElementById('fs-kpi-alerts').textContent = alerts.length;
            document.getElementById('fs-kpi-quality-score').textContent = avgQuality !== '—' ? `${avgQuality}%` : '—';

            // Dynamic recommendations panel
            const recContainer = document.getElementById('fs-recommendations-container');
            if (recContainer) {
                if (totalLots === 0) {
                    recContainer.innerHTML = `
                        <div class="p-3 rounded bg-input border border-secondary" style="grid-column: span 2;">
                            <div class="font-semibold text-accent" style="font-size: 0.9rem;">🪵 Feedstock Sourcing Intelligence</div>
                            <div style="font-size: 0.85rem; margin-top: 4px;" class="text-muted">No feedstock lots logged yet. Click <strong>+ Log Feedstock Batch</strong> above to register biomass deliveries, supplier names, species, and moisture readings for automated quality decision support.</div>
                        </div>
                    `;
                } else {
                    let alertHtml = '';
                    if (alerts.length > 0) {
                        alertHtml = `<div class="p-3 rounded bg-input border border-danger">
                            <div class="font-semibold text-danger" style="font-size: 0.9rem;">🚨 Quality Warning (${alerts.length} lot${alerts.length > 1 ? 's' : ''})</div>
                            <div style="font-size: 0.85rem; margin-top: 4px;">High moisture or contamination detected in recent deliveries. Perform physical screening before pyrolysis intake.</div>
                        </div>`;
                    }
                    recContainer.innerHTML = `
                        <div class="p-3 rounded bg-input border border-secondary">
                            <div class="font-semibold text-accent" style="font-size: 0.9rem;">⭐ Supplier Ranking</div>
                            <div style="font-size: 0.85rem; margin-top: 4px;">Top active supplier: <strong>${Utils.escapeHtml(topSupplier)}</strong> based on ${totalLots} total delivery lot${totalLots > 1 ? 's' : ''}.</div>
                        </div>
                        <div class="p-3 rounded bg-input border border-secondary">
                            <div class="font-semibold text-warning" style="font-size: 0.9rem;">💧 Biomass Moisture Average</div>
                            <div style="font-size: 0.85rem; margin-top: 4px;">Average moisture content across facility: <strong>${avgMoisture}%</strong> (Usable Dry Matter: <strong>${avgDryMatter}%</strong>).</div>
                        </div>
                        ${alertHtml}
                    `;
                }
            }
        } catch (err) {
            console.warn('Failed to load feedstock dashboard KPIs:', err);
        }
    },


    async loadFeedstock() {
        try {
            const { data, error } = await OfflineStorage.fetchWithCache('feedstock_batches', () =>
                supabase
                    .from('feedstock_batches')
                    .select('*, projects(name)')
                    .order('created_at', { ascending: false })
            );

            if (error) throw error;

            const container = document.getElementById('feedstock-table-container');
            if (!container) return;

            this._table = DataTable.render(container, {
                columns: [
                    { key: 'feedstock_lot_number', label: 'Lot Number', sortable: true, render: (val, row) => `<strong>${Utils.escapeHtml(val || row.batch_code)}</strong>` },
                    { key: 'supplier_name', label: 'Supplier Name', sortable: true, render: (val) => `<span class="badge badge-default">${Utils.escapeHtml(val || 'Green Biomass Pvt Ltd')}</span>` },
                    { key: 'biomass_species', label: 'Species', sortable: true, render: (val, row) => Utils.escapeHtml(val || Utils.formatEnum(row.feedstock_type)) },
                    { key: 'weight_kg', label: 'Wet Mass (t)', sortable: true, render: (val, row) => Utils.formatTons(((row.wet_weight_kg || val) || 0) / 1000) },
                    { key: 'moisture_percent', label: 'Moisture (%)', sortable: true, render: (val, row) => val != null ? `${Number(val).toFixed(1)}% <small class="text-muted">(${row.moisture_measurement_method || 'Oven Drying'})</small>` : '—' },
                    { key: 'quality_score', label: 'Quality Score', sortable: true, render: (val, row) => {
                        const score = val != null ? val : 94.0;
                        let color = 'text-success';
                        if (score < 70) color = 'text-danger';
                        else if (score < 85) color = 'text-warning';
                        return `<strong class="${color}">${score}%</strong>`;
                    }},
                    { key: 'quality_status', label: 'Status', sortable: true, render: (val, row) => {
                        const st = val || (row.contamination_status ? 'High Risk' : 'Optimal');
                        let bClass = 'badge-success';
                        if (st === 'Warning') bClass = 'badge-warning';
                        if (st === 'High Risk' || st === 'Rejected') bClass = 'badge-danger';
                        return `<span class="badge ${bClass}">${st}</span>`;
                    }},
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
                            <button class="action-menu-item" onclick="EvidenceModule.openUploadDialog({ entity_type: 'feedstock', entity_id: '${row.id}', project_id: '${row.project_id || ''}', activity: 'feedstock' })">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                Manage Evidence
                            </button>
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
        let moistureValue = '15.0';
        let methodValue = 'Oven Drying (ASTM E1755)';

        try {
            // Get active projects for select options
            const { data: projects, error: projectsErr } = await OfflineStorage.fetchWithCache('projects', () =>
                supabase
                    .from('projects')
                    .select('id, name')
                    .order('name', { ascending: true })
            );

            if (projectsErr) throw projectsErr;

            if (feedstockId) {
                title = 'Edit Feedstock Ingest';
                const { data, error } = await OfflineStorage.fetchWithCache('feedstock_batches', () =>
                    supabase
                        .from('feedstock_batches')
                        .select('*')
                        .eq('id', feedstockId)
                        .single()
                , { isSingle: true, id: feedstockId });

                if (error) throw error;

                projectIdValue = data.project_id;
                batchCodeValue = data.batch_code;
                typeValue = data.feedstock_type;
                massValue = (data.wet_weight_kg || data.weight_kg || 0) / 1000;
                moistureValue = data.moisture_percent != null ? data.moisture_percent : '15.0';
                methodValue = data.moisture_measurement_method || 'Oven Drying (ASTM E1755)';
                
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
                                <option value="corn_cob" ${typeValue === 'corn_cob' ? 'selected' : ''}>Corn Cob</option>
                                <option value="bamboo_scrap" ${typeValue === 'bamboo_scrap' ? 'selected' : ''}>Bamboo Scrap</option>
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
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="feedstock-mass">Gross Wet Mass (Metric Tonnes) <span class="required">*</span></label>
                                <input type="text" class="form-input" id="feedstock-mass" name="wet_mass_tons" value="${massValue}" data-validate="required|number|positive" data-label="Wet Mass" placeholder="e.g. 12.5" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="feedstock-moisture">Moisture Content (%) <span class="required">*</span></label>
                                <input type="text" class="form-input" id="feedstock-moisture" name="moisture_percent" value="${moistureValue}" data-validate="required|number" data-label="Moisture %" placeholder="e.g. 15.0" />
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="feedstock-method">Moisture Measurement Method <span class="required">*</span></label>
                            <select class="form-select" id="feedstock-method" name="moisture_measurement_method">
                                <option value="Oven Drying (ASTM E1755)" ${methodValue.includes('Oven') ? 'selected' : ''}>Oven Drying (ASTM E1755)</option>
                                <option value="Digital Moisture Meter" ${methodValue.includes('Meter') ? 'selected' : ''}>Digital Moisture Meter</option>
                                <option value="NIR Spectroscopy Analyzer" ${methodValue.includes('NIR') ? 'selected' : ''}>NIR Spectroscopy Analyzer</option>
                                <option value="Certified Lab Moisture Analysis" ${methodValue.includes('Certified') ? 'selected' : ''}>Certified Lab Moisture Analysis</option>
                            </select>
                        </div>

                        <!-- Biomass Sourcing & Supplier Metadata -->
                        <div style="font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-accent-light); margin-top: var(--space-3); margin-bottom: var(--space-2);">
                            Biomass Sourcing & Supplier Metadata
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="feedstock-supplier">Biomass Supplier Name <span class="required">*</span></label>
                                <input type="text" class="form-input" id="feedstock-supplier" name="supplier_name" value="Green Biomass Pvt Ltd" data-validate="required" data-label="Supplier Name" placeholder="e.g. Green Biomass Pvt Ltd" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="feedstock-source-type">Biomass Source Type</label>
                                <select class="form-select" id="feedstock-source-type" name="biomass_source_type">
                                    <option value="Aggregator">Biomass Aggregator</option>
                                    <option value="Farm Direct">Farm Direct</option>
                                    <option value="Sawmill">Sawmill / Forestry Scrap</option>
                                    <option value="Food Processor">Food Processing Residue</option>
                                </select>
                            </div>
                        </div>

                        <!-- Phase 3 Feedstock Intelligence Parameters -->
                        <div style="font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-accent-light); margin-top: var(--space-3); margin-bottom: var(--space-2);">
                            Feedstock Intelligence & Reliability Metadata
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="feedstock-lot-num">Feedstock Lot Number</label>
                                <input type="text" class="form-input" id="feedstock-lot-num" name="feedstock_lot_number" value="LOT-${batchCodeValue}" placeholder="e.g. LOT-2026-0801" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="feedstock-species">Biomass Species</label>
                                <input type="text" class="form-input" id="feedstock-species" name="biomass_species" value="Oryza sativa (Rice Husk)" placeholder="e.g. Rice Husk / Coconut Shell" />
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="feedstock-storage-days">Storage Duration (Days)</label>
                                <input type="text" class="form-input" id="feedstock-storage-days" name="storage_days" value="14" data-validate="number" placeholder="e.g. 14" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="feedstock-contam">Contamination Status</label>
                                <select class="form-select" id="feedstock-contam" name="contamination_status">
                                    <option value="false">Clean / No Contamination</option>
                                    <option value="true">Flagged / Contaminated</option>
                                </select>
                            </div>
                        </div>

                        <!-- Phase 1 Live Mass Balance Calculator Display -->
                        <div style="margin-top: var(--space-3); padding: var(--space-3); background: rgba(56, 189, 248, 0.06); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: var(--radius-md);">
                            <div style="font-size: 0.8rem; font-weight: 600; text-transform: uppercase; color: var(--color-accent-light); margin-bottom: 4px;">Mass Balance Auto-Calculation</div>
                            <div class="grid grid-cols-2 gap-2" style="font-size: 0.85rem;">
                                <div>Calculated Dry Mass: <strong id="calc-dry-mass" class="text-success">— t</strong></div>
                                <div>Moisture Water Weight: <strong id="calc-water-mass" class="text-muted">— t</strong></div>
                            </div>
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

            Modal.open(html, { width: '560px' });

            // Setup real-time mass balance calculation listener
            const wetInput = document.getElementById('feedstock-mass');
            const moistureInput = document.getElementById('feedstock-moisture');
            const updateCalcs = () => {
                const wetTons = parseFloat(wetInput.value) || 0;
                const moist = parseFloat(moistureInput.value) || 0;
                const dryTons = wetTons * (1 - moist / 100);
                const waterTons = wetTons * (moist / 100);

                const dryEl = document.getElementById('calc-dry-mass');
                const waterEl = document.getElementById('calc-water-mass');
                if (dryEl) dryEl.innerText = `${dryTons.toFixed(3)} t (${(dryTons * 1000).toFixed(0)} kg)`;
                if (waterEl) waterEl.innerText = `${waterTons.toFixed(3)} t (${(waterTons * 1000).toFixed(0)} kg)`;
            };
            wetInput.addEventListener('input', updateCalcs);
            moistureInput.addEventListener('input', updateCalcs);
            updateCalcs();

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
                const wetKg = massTons * 1000;
                const moisture = parseFloat(document.getElementById('feedstock-moisture').value);
                const dryKg = wetKg * (1 - moisture / 100);
                const waterKg = wetKg * (moisture / 100);
                const method = document.getElementById('feedstock-method').value;

                // Sourcing & Intelligence inputs
                const supplierName = document.getElementById('feedstock-supplier').value.trim() || 'Green Biomass Pvt Ltd';
                const sourceType = document.getElementById('feedstock-source-type').value;
                const lotNum = document.getElementById('feedstock-lot-num').value.trim() || `LOT-${batchCodeValue}`;
                const species = document.getElementById('feedstock-species').value.trim() || 'Oryza sativa (Rice Husk)';
                const storageDays = parseInt(document.getElementById('feedstock-storage-days').value, 10) || 0;
                const contamStatus = document.getElementById('feedstock-contam').value === 'true';

                // Quality score calculation
                let mScore = moisture <= 15 ? 35 : (moisture <= 25 ? 25 : 10);
                let cScore = contamStatus ? 0 : 35;
                let sScore = storageDays <= 30 ? 15 : (storageDays <= 60 ? 10 : 5);
                let dScore = Math.min(15, (dryKg / Math.max(wetKg, 1)) * 15);
                let qScore = parseFloat((mScore + cScore + sScore + dScore).toFixed(1));

                let qStatus = 'Optimal';
                if (contamStatus) qStatus = 'High Risk';
                else if (qScore < 75 || moisture > 25) qStatus = 'Warning';
                else if (qScore < 90) qStatus = 'Acceptable';

                const payload = {
                    project_id: document.getElementById('feedstock-project-id').value || null,
                    batch_code: document.getElementById('feedstock-batch-code').value.trim(),
                    feedstock_type: document.getElementById('feedstock-type').value,
                    origin_location: `${lat},${lng}`,
                    weight_kg: wetKg,
                    wet_weight_kg: wetKg,
                    moisture_percent: moisture,
                    dry_weight_kg: dryKg,
                    water_weight_kg: waterKg,
                    moisture_measurement_method: method,
                    received_date: new Date().toISOString().split('T')[0],
                    supplier_name: supplierName,
                    biomass_source_type: sourceType,
                    feedstock_lot_number: lotNum,
                    biomass_species: species,
                    storage_days: storageDays,
                    contamination_status: contamStatus,
                    quality_score: qScore,
                    quality_status: qStatus,
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
                    await this.loadFeedstockDashboard();
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
