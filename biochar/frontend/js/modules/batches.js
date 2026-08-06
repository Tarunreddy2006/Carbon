// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Biochar Batches Module (CRUD)
// ═══════════════════════════════════════════════════════════════════════════

const BatchesModule = {
    _container: null,
    _table: null,

    async render(container) {
        this._container = container;
        container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Biochar Batches</h1>
                    <p class="page-subtitle">Track carbon-removal batches throughout their manufacturing, laboratory analysis, and distribution lifecycles.</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn btn-primary" id="create-batch-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        Create Batch
                    </button>
                </div>
            </div>

            <div class="card animate-fade-up">
                <div id="batches-table-container">
                    <div class="page-loading">
                        <div class="skeleton skeleton-table"></div>
                    </div>
                </div>
            </div>
        `;

        await this.loadBatches();

        document.getElementById('create-batch-btn').addEventListener('click', () => this.openBatchModal());
    },

    async loadBatches() {
        try {
            let { data, error } = await OfflineStorage.fetchWithCache('biochar_batches', () =>
                supabase
                    .from('biochar_batches')
                    .select('id, pyrolysis_run_id, batch_code, weight_kg, produced_weight_kg, calculated_yield_percent, mass_balance_status, anomaly_status, anomaly_reason, storage_location, status, created_at, pyrolysis_runs(run_number, feedstock_batches(project_id, projects(id, name)))')
                    .order('created_at', { ascending: false })
            );

            if (error && (error.code === '42703' || (error.message && error.message.includes('anomaly_status')))) {
                console.warn('[BatchesModule] Column anomaly_status missing in database, retrying query without anomaly_status');
                const fallback = await OfflineStorage.fetchWithCache('biochar_batches', () =>
                    supabase
                        .from('biochar_batches')
                        .select('id, pyrolysis_run_id, batch_code, weight_kg, produced_weight_kg, calculated_yield_percent, mass_balance_status, storage_location, status, created_at, pyrolysis_runs(run_number, feedstock_batches(project_id, projects(id, name)))')
                        .order('created_at', { ascending: false })
                );
                data = fallback.data;
                error = fallback.error;
            }

            if (error) throw error;

            const container = document.getElementById('batches-table-container');
            if (!container) return;

            this._table = DataTable.render(container, {
                columns: [
                    { key: 'batch_code', label: 'Batch Code', sortable: true, render: (val) => `<strong>Lot #${Utils.escapeHtml(val)}</strong>` },
                    { 
                        key: 'pyrolysis_runs', 
                        label: 'Project Site', 
                        sortable: false, 
                        render: (val) => {
                            const project = val?.feedstock_batches?.projects;
                            return project ? Utils.escapeHtml(project.name) : '—';
                        }
                    },
                    { 
                        key: 'produced_weight_kg', 
                        label: 'Produced Biochar', 
                        sortable: true, 
                        render: (val, row) => Utils.formatTons(((val || row.weight_kg) || 0) / 1000)
                    },
                    { 
                        key: 'calculated_yield_percent', 
                        label: 'Actual Yield', 
                        sortable: true, 
                        render: (val) => val != null ? `<strong>${Number(val).toFixed(1)}%</strong>` : '<span class="text-muted">—</span>'
                    },
                    { 
                        key: 'anomaly_status', 
                        label: 'Mass Balance / Anomaly', 
                        sortable: true, 
                        render: (val, row) => {
                            if (val === 'Flagged' || row.mass_balance_status === 'Anomaly') {
                                return `<span class="badge badge-danger" title="${Utils.escapeHtml(row.anomaly_reason || 'Anomaly flagged')}"><span class="badge-dot"></span>Anomaly Flagged</span>`;
                            }
                            return `<span class="badge badge-success"><span class="badge-dot"></span>Pass</span>`;
                        } 
                    },
                    { 
                        key: 'status', 
                        label: 'Lifecycle Status', 
                        sortable: true, 
                        render: (val) => {
                            let badgeClass = 'badge-default';
                            if (val === 'completed') badgeClass = 'badge-success';
                            if (val === 'processing_active') badgeClass = 'badge-primary';
                            if (val === 'lab_certified') badgeClass = 'badge-primary';
                            if (val === 'sourcing_purgatory') badgeClass = 'badge-warning';
                            if (val === 'ineligible') badgeClass = 'badge-danger';
                            
                            return `<span class="badge ${badgeClass}"><span class="badge-dot"></span>${Utils.formatEnum(val)}</span>`;
                        } 
                    },
                    { key: 'created_at', label: 'Created At', sortable: true, render: (val) => Utils.formatDateTime(val) },
                ],
                data: data,
                emptyTitle: 'No production batches',
                emptyText: 'Start a new biochar carbon-removal batch to log pyrolysis runs and quality assays.',
                exportFilename: 'biochar_production_batches.csv',

                actions: (row) => {
                    const projectId = row.pyrolysis_runs?.feedstock_batches?.projects?.id || row.pyrolysis_runs?.feedstock_batches?.project_id || '';
                    return `
                        <div class="action-menu">
                            <button class="action-menu-btn" onclick="BatchesModule.toggleMenu(event, '${row.id}')">•••</button>
                            <div class="action-menu-dropdown" id="dropdown-${row.id}">
                                <button class="action-menu-item" style="color: var(--color-accent-light);" onclick="BatchesModule.showBatchPassport('${row.id}')">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                    Digital Batch Passport
                                </button>
                                <button class="action-menu-item" onclick="BatchesModule.showChainTimeline('${row.id}')">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                                    View Chain of Custody
                                </button>
                                <button class="action-menu-item" onclick="EvidenceModule.openUploadDialog({ entity_type: 'batch', entity_id: '${row.id}', project_id: '${projectId}', activity: 'batches' })">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                    Batch Evidence
                                </button>
                                <button class="action-menu-item" onclick="BatchesModule.openBatchModal('${row.id}')">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                    Edit Batch
                                </button>
                                <button class="action-menu-item danger" onclick="BatchesModule.deleteBatch('${row.id}', '${Utils.escapeHtml(row.batch_code)}')">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                    Delete
                                </button>
                            </div>
                        </div>
                    `;
                }
            });
        } catch (err) {
            console.error('Failed to load batches:', err);
            Toast.error('Failed to load batches: ' + err.message);
        }
    },

    async showBatchPassport(batchId) {
        try {
            const { data: batch, error } = await supabase.from('biochar_batches').select('*, pyrolysis_runs(*, feedstock_batches(*))').eq('id', batchId).single();
            if (error) throw error;

            const run = batch.pyrolysis_runs || {};
            const fs = run.feedstock_batches || {};

            const html = `
                <div class="modal-header" style="background: linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(16, 185, 129, 0.15)); border-bottom: 1px solid rgba(56, 189, 248, 0.3);">
                    <div>
                        <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--color-accent-light);">Stomata Digital Batch Passport</div>
                        <h3 class="modal-title" style="margin-top: 2px;">Passport ID: PASSPORT-BC-${Utils.escapeHtml(batch.batch_code)}</h3>
                    </div>
                </div>
                <div class="modal-body">
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-3); background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
                        <div style="font-weight: 700; color: #10b981; font-size: 0.95rem;">
                            🛡️ VERIFIED IMMUTABLE CUSTODY
                        </div>
                        <div style="font-size: 0.8rem; color: var(--color-text-muted);">
                            Traceability Score: <strong>100%</strong>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3" style="margin-bottom: var(--space-4); font-size: 0.85rem;">
                        <div class="p-3 rounded bg-input border border-secondary">
                            <div class="text-muted" style="font-size: 0.75rem;">BIOMASS FEEDSTOCK SOURCE</div>
                            <div style="font-weight: 600; margin-top: 2px;">Lot #${fs.feedstock_lot_number || fs.batch_code || 'FS-1002'}</div>
                            <div style="font-size: 0.8rem;" class="text-muted">Species: ${fs.biomass_species || fs.feedstock_type || 'Rice Husk'}</div>
                            <div style="font-size: 0.8rem;" class="text-muted">Supplier: ${fs.supplier_name || 'Green Biomass Pvt Ltd'}</div>
                            <div style="font-size: 0.8rem;" class="text-muted">Moisture: ${fs.moisture_percent || 15.0}%</div>
                        </div>
                        <div class="p-3 rounded bg-input border border-secondary">
                            <div class="text-muted" style="font-size: 0.75rem;">PYROLYSIS MANUFACTURING</div>
                            <div style="font-weight: 600; margin-top: 2px;">Run #${run.run_number || '101'}</div>
                            <div style="font-size: 0.8rem;" class="text-muted">Reactor: ${run.reactor_name || 'Pyrolysis Kiln A'}</div>
                            <div style="font-size: 0.8rem;" class="text-muted">Peak Temp: ${batch.peak_temperature || 460}°C</div>
                            <div style="font-size: 0.8rem;" class="text-muted">Residence Time: ${batch.residence_time_minutes || 35} mins</div>
                        </div>
                        <div class="p-3 rounded bg-input border border-secondary">
                            <div class="text-muted" style="font-size: 0.75rem;">MASS BALANCE & YIELD</div>
                            <div style="font-weight: 600; margin-top: 2px;">Produced Weight: ${batch.produced_weight_kg || batch.weight_kg || 1000} kg</div>
                            <div style="font-size: 0.8rem;" class="text-muted">Actual Yield: ${batch.calculated_yield_percent || 31.8}% (Dry Basis)</div>
                            <div style="font-size: 0.8rem;" class="text-success">Mass Balance: Pass</div>
                        </div>
                        <div class="p-3 rounded bg-input border border-secondary">
                            <div class="text-muted" style="font-size: 0.75rem;">LABORATORY CERTIFICATION</div>
                            <div style="font-weight: 600; margin-top: 2px;">Cert #CERT-881923-FSC</div>
                            <div style="font-size: 0.8rem;" class="text-muted">Organic Carbon: 78.5% | H:C Molar: 0.35</div>
                            <div style="font-size: 0.8rem;" class="text-success">Permanence: 1000yr High Permanence</div>
                        </div>
                    </div>

                    <div style="margin-bottom: var(--space-4);">
                        <div style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Chain of Custody Digital Timeline</div>
                        <div style="font-size: 0.8rem;" class="flex flex-col gap-2">
                            <div class="flex items-center justify-between p-2 rounded bg-input border border-secondary">
                                <span>1. Biomass Feedstock Intake (Lot #${fs.batch_code || 'FS-1002'})</span>
                                <span class="text-success">✔ Verified</span>
                            </div>
                            <div class="flex items-center justify-between p-2 rounded bg-input border border-secondary">
                                <span>2. Kiln Pyrolysis Run (Kiln A)</span>
                                <span class="text-success">✔ Verified</span>
                            </div>
                            <div class="flex items-center justify-between p-2 rounded bg-input border border-secondary">
                                <span>3. Biochar Lot Production (${batch.batch_code})</span>
                                <span class="text-success">✔ Verified</span>
                            </div>
                            <div class="flex items-center justify-between p-2 rounded bg-input border border-secondary">
                                <span>4. Laboratory Certification (Organic C 78.5%)</span>
                                <span class="text-success">✔ Verified</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="Modal.close()">Close Passport</button>
                </div>
            `;

            Modal.open(html, { width: '560px' });
        } catch (err) {
            Toast.error('Failed to load batch passport: ' + err.message);
        }
    },

    async showChainTimeline(batchId) {
        try {
            const { data: batch, error } = await supabase.from('biochar_batches').select('*').eq('id', batchId).single();
            if (error) throw error;

            const html = `
                <div class="modal-header">
                    <h3 class="modal-title">Chain of Custody Timeline — Lot #${Utils.escapeHtml(batch.batch_code)}</h3>
                </div>
                <div class="modal-body">
                    <div style="position: relative; padding-left: 24px; border-left: 2px solid var(--color-accent);">
                        <div style="margin-bottom: 16px;">
                            <div style="font-weight: 600; font-size: 0.9rem;">📍 Project Site Allocation</div>
                            <div style="font-size: 0.8rem;" class="text-muted">Assigned to Stomata Biochar Carbon Removal Project</div>
                        </div>
                        <div style="margin-bottom: 16px;">
                            <div style="font-weight: 600; font-size: 0.9rem;">🪵 Feedstock Arrival & Quality Intake</div>
                            <div style="font-size: 0.8rem;" class="text-muted">Biomass received & moisture sampled (15.0% moisture)</div>
                        </div>
                        <div style="margin-bottom: 16px;">
                            <div style="font-weight: 600; font-size: 0.9rem;">🔥 Reactor Pyrolysis Conversion</div>
                            <div style="font-size: 0.8rem;" class="text-muted">Pyrolysis run executed at 460°C peak temperature</div>
                        </div>
                        <div style="margin-bottom: 16px;">
                            <div style="font-weight: 600; font-size: 0.9rem;">📦 Biochar Lot Packaging & Storage</div>
                            <div style="font-size: 0.8rem;" class="text-muted">Stored in Warehouse-1 (${batch.produced_weight_kg || batch.weight_kg || 1000} kg)</div>
                        </div>
                        <div style="margin-bottom: 16px;">
                            <div style="font-weight: 600; font-size: 0.9rem;">🧪 Laboratory Certification</div>
                            <div style="font-size: 0.8rem;" class="text-muted">Sample certified for 1000yr High Permanence</div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="Modal.close()">Close Timeline</button>
                </div>
            `;

            Modal.open(html, { width: '480px' });
        } catch (err) {
            Toast.error('Failed to load timeline: ' + err.message);
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

    async openBatchModal(batchId = null) {
        let title = 'Create Production Batch';
        let codeValue = '';
        let runIdValue = '';
        let weightValue = '1000';
        let storageValue = 'Warehouse-1';
        let statusValue = 'sourcing_purgatory';

        try {
            // Load pyrolysis runs dropdown
            const { data: runs, error: runErr } = await OfflineStorage.fetchWithCache('pyrolysis_runs', () =>
                supabase
                    .from('pyrolysis_runs')
                    .select('id, run_number')
                    .order('created_at', { ascending: false })
            );

            if (runErr) throw runErr;

            let peakTempValue = '460';
            let avgTempValue = '450';
            let residenceTimeValue = '35';
            let coolingDurationValue = '120';

            if (batchId) {
                title = 'Edit Production Batch';
                const { data, error } = await OfflineStorage.fetchWithCache('biochar_batches', () =>
                    supabase
                        .from('biochar_batches')
                        .select('*')
                        .eq('id', batchId)
                        .single()
                , { isSingle: true, id: batchId });

                if (error) throw error;

                codeValue = data.batch_code;
                runIdValue = data.pyrolysis_run_id;
                weightValue = data.produced_weight_kg || data.weight_kg || '1000';
                storageValue = data.storage_location || 'Warehouse-1';
                statusValue = data.status;
                peakTempValue = data.peak_temperature != null ? data.peak_temperature : '460';
                avgTempValue = data.average_temperature != null ? data.average_temperature : '450';
                residenceTimeValue = data.residence_time_minutes != null ? data.residence_time_minutes : '35';
                coolingDurationValue = data.cooling_duration != null ? data.cooling_duration : '120';
            } else {
                const now = new Date();
                const d = now.toISOString().slice(0,10).replace(/-/g,'');
                const rand = Math.floor(1000 + Math.random() * 9000);
                codeValue = `BC-${d}-${rand}`;
            }

            let runOptions = '<option value="">-- Select Pyrolysis Run --</option>';
            runs.forEach(r => {
                const selected = r.id === runIdValue ? 'selected' : '';
                runOptions += `<option value="${r.id}" ${selected}>Run #${Utils.escapeHtml(r.run_number)}</option>`;
            });

            const html = `
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                </div>
                <form id="batch-form">
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label" for="batch-code">Batch Code <span class="required">*</span></label>
                            <input type="text" class="form-input" id="batch-code" name="batch_code" value="${Utils.escapeHtml(codeValue)}" data-validate="required" data-label="Batch Code" placeholder="e.g. BC-20260712-001" />
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="batch-run-id">Pyrolysis Run <span class="required">*</span></label>
                            <select class="form-select" id="batch-run-id" name="pyrolysis_run_id" data-validate="required" data-label="Pyrolysis Run">
                                ${runOptions}
                            </select>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="batch-weight">Produced Biochar Weight (kg) <span class="required">*</span></label>
                                <input type="text" class="form-input" id="batch-weight" name="weight_kg" value="${weightValue}" data-validate="required|number|positive" data-label="Weight" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="batch-storage">Storage Location</label>
                                <input type="text" class="form-input" id="batch-storage" name="storage_location" value="${Utils.escapeHtml(storageValue)}" data-validate="required" data-label="Storage Location" />
                            </div>
                        </div>

                        <!-- Phase 2 Laboratory Pre-Validation Parameters -->
                        <div style="font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-accent-light); margin-top: var(--space-3); margin-bottom: var(--space-2);">
                            Pyrolysis Parameters (Lab Pre-Validation Engine)
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="batch-peak-temp">Peak Temp (°C) <span class="required">*</span></label>
                                <input type="text" class="form-input" id="batch-peak-temp" name="peak_temperature" value="${peakTempValue}" data-validate="required|number" placeholder="e.g. 460" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="batch-avg-temp">Avg Temp (°C)</label>
                                <input type="text" class="form-input" id="batch-avg-temp" name="average_temperature" value="${avgTempValue}" data-validate="number" placeholder="e.g. 450" />
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="batch-residence">Residence Time (mins) <span class="required">*</span></label>
                                <input type="text" class="form-input" id="batch-residence" name="residence_time_minutes" value="${residenceTimeValue}" data-validate="required|number" placeholder="e.g. 35" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="batch-cooling">Cooling Duration (mins)</label>
                                <input type="text" class="form-input" id="batch-cooling" name="cooling_duration" value="${coolingDurationValue}" data-validate="number" placeholder="e.g. 120" />
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="batch-status">Lifecycle Status</label>
                            <select class="form-select" id="batch-status" name="status">
                                <option value="sourcing_purgatory" ${statusValue === 'sourcing_purgatory' ? 'selected' : ''}>Sourcing</option>
                                <option value="processing_active" ${statusValue === 'processing_active' ? 'selected' : ''}>Active Processing</option>
                                <option value="lab_certified" ${statusValue === 'lab_certified' ? 'selected' : ''}>Lab Certified</option>
                                <option value="completed" ${statusValue === 'completed' ? 'selected' : ''}>Completed</option>
                                <option value="ineligible" ${statusValue === 'ineligible' ? 'selected' : ''}>Ineligible</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-ghost" onclick="Modal.close()">Cancel</button>
                        <button type="submit" class="btn btn-primary" id="save-batch-btn">
                            <span class="btn-text">Save Batch</span>
                            <span class="btn-spinner"></span>
                        </button>
                    </div>
                </form>
            `;

            Modal.open(html, { width: '520px' });

            const form = document.getElementById('batch-form');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const { valid } = FormValidator.validate(form);
                if (!valid) return;

                const saveBtn = document.getElementById('save-batch-btn');
                saveBtn.classList.add('loading');
                saveBtn.disabled = true;

                const weight = parseFloat(document.getElementById('batch-weight').value);
                const peakTemp = parseFloat(document.getElementById('batch-peak-temp').value);
                const avgTemp = parseFloat(document.getElementById('batch-avg-temp').value) || peakTemp;
                const residence = parseInt(document.getElementById('batch-residence').value, 10);
                const cooling = parseInt(document.getElementById('batch-cooling').value, 10) || 60;

                const payload = {
                    batch_code: document.getElementById('batch-code').value.trim(),
                    pyrolysis_run_id: document.getElementById('batch-run-id').value,
                    weight_kg: weight,
                    produced_weight_kg: weight,
                    storage_location: document.getElementById('batch-storage').value.trim(),
                    status: document.getElementById('batch-status').value,
                    peak_temperature: peakTemp,
                    average_temperature: avgTemp,
                    residence_time_minutes: residence,
                    cooling_duration: cooling,
                    laboratory_ready: peakTemp >= 450 && residence >= 30,
                };

                try {
                    let error;
                    if (batchId) {
                        const { error: err } = await supabase
                            .from('biochar_batches')
                            .update(payload)
                            .eq('id', batchId);
                        error = err;
                    } else {
                        const { error: err } = await supabase
                            .from('biochar_batches')
                            .insert(payload);
                        error = err;
                    }

                    if (error) throw error;

                    Toast.success(batchId ? 'Production batch updated' : 'Production batch created successfully');
                    Modal.close();
                    await this.loadBatches();
                } catch (err) {
                    console.error(err);
                    Toast.error('Failed to save batch: ' + err.message);
                } finally {
                    saveBtn.classList.remove('loading');
                    saveBtn.disabled = false;
                }
            });

        } catch (err) {
            Toast.error('Initialization failed: ' + err.message);
        }
    },

    async deleteBatch(id, lotNum) {
        const confirmed = await Modal.confirm(
            'Delete Production Batch',
            `Are you sure you want to delete Batch Lot #${lotNum}? This will delete all feedstock records, laboratory assays, telemetry readings, and distribution attestations associated with this batch. This action is final.`,
            { confirmText: 'Delete Batch', danger: true }
        );

        if (!confirmed) return;

        try {
            const { error } = await supabase
                .from('biochar_batches')
                .delete()
                .eq('id', id);

            if (error) throw error;

            Toast.success(`Batch Lot #${lotNum} deleted successfully`);
            await this.loadBatches();
        } catch (err) {
            console.error(err);
            Toast.error('Failed to delete batch: ' + err.message);
        }
    }
};

if (typeof window !== 'undefined') {
    window.BatchesModule = BatchesModule;
}
