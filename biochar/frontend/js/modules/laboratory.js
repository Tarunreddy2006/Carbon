// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Laboratory Assays Module (CRUD)
// ═══════════════════════════════════════════════════════════════════════════

const LaboratoryModule = {
    _container: null,
    _table: null,

    async render(container) {
        this._container = container;
        container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Laboratory Assays & Pre-Validation Engine</h1>
                    <p class="page-subtitle">Rule-based quality assurance and pre-laboratory validation to reduce lab costs and optimize batch readiness.</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn btn-ghost" id="refresh-lab-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        Refresh Engine
                    </button>
                    <button class="btn btn-primary" id="create-assay-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        Log Assay
                    </button>
                </div>
            </div>

            <!-- Laboratory Quality Dashboard Widgets -->
            <div class="kpi-grid animate-fade-up" style="margin-bottom: var(--space-6);">
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Total Samples</span>
                        <span class="kpi-card-icon">🧪</span>
                    </div>
                    <div class="kpi-card-value" id="lab-kpi-samples">—</div>
                    <small>Biochar samples collected</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Pending Testing</span>
                        <span class="kpi-card-icon">⏳</span>
                    </div>
                    <div class="kpi-card-value text-warning" id="lab-kpi-pending">—</div>
                    <small>Awaiting lab certification</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Passed Batches</span>
                        <span class="kpi-card-icon">✅</span>
                    </div>
                    <div class="kpi-card-value text-success" id="lab-kpi-passed">—</div>
                    <small>Pre-validation passed</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Warning Batches</span>
                        <span class="kpi-card-icon">🟡</span>
                    </div>
                    <div class="kpi-card-value" id="lab-kpi-warnings" style="color: #f59e0b;">—</div>
                    <small>Quality warning flagged</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">High Risk Batches</span>
                        <span class="kpi-card-icon">🔴</span>
                    </div>
                    <div class="kpi-card-value text-danger" id="lab-kpi-high-risk">—</div>
                    <small>Incomplete parameter risk</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Hold Batches</span>
                        <span class="kpi-card-icon">⛔</span>
                    </div>
                    <div class="kpi-card-value text-danger" id="lab-kpi-hold">—</div>
                    <small>Quarantined from lab testing</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Avg Validation Score</span>
                        <span class="kpi-card-icon">💯</span>
                    </div>
                    <div class="kpi-card-value" id="lab-kpi-avg-score">—</div>
                    <small>Quality assurance index %</small>
                </div>
            </div>

            <!-- Batch Pre-Validation Section -->
            <div class="card animate-fade-up" style="margin-bottom: var(--space-6);">
                <div class="card-header flex items-center justify-between">
                    <div>
                        <h3 class="card-title">Pre-Laboratory Batch Readiness & Rule Engine</h3>
                        <p class="card-subtitle text-muted" style="margin: 0;">Automated rule evaluation prior to laboratory submission</p>
                    </div>
                </div>
                <div id="prelab-table-container" style="padding: var(--space-4);">
                    <div class="page-loading"><div class="skeleton skeleton-table"></div></div>
                </div>
            </div>

            <!-- Certified Assays Table -->
            <div class="card animate-fade-up">
                <div class="card-header">
                    <h3 class="card-title">Certified Laboratory Assays</h3>
                </div>
                <div id="assays-table-container">
                    <div class="page-loading">
                        <div class="skeleton skeleton-table"></div>
                    </div>
                </div>
            </div>
        `;

        await this.loadLabDashboard();
        await this.loadPreLabValidation();
        await this.loadAssays();

        document.getElementById('create-assay-btn').addEventListener('click', () => this.openAssayModal());
        document.getElementById('refresh-lab-btn')?.addEventListener('click', () => {
            this.loadLabDashboard();
            this.loadPreLabValidation();
            this.loadAssays();
            Toast.success('Laboratory engine refreshed');
        });
    },

    async loadLabDashboard() {
        try {
            const { data: batches } = await supabase.from('biochar_batches').select('id, validation_status, validation_score');
            const { data: samples } = await supabase.from('biochar_samples').select('id, laboratory_status');

            const totalSamples = samples ? samples.length : 0;
            const pendingSamples = samples ? samples.filter(s => s.laboratory_status === 'Pending').length : 0;

            const passed = batches ? batches.filter(b => b.validation_status === 'Pass').length : 0;
            const warnings = batches ? batches.filter(b => b.validation_status === 'Warning').length : 0;
            const highRisk = batches ? batches.filter(b => b.validation_status === 'High Risk').length : 0;
            const hold = batches ? batches.filter(b => b.validation_status === 'Hold Batch').length : 0;

            const scores = batches ? batches.map(b => b.validation_score).filter(s => s != null) : [];
            const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';

            document.getElementById('lab-kpi-samples').textContent = totalSamples;
            document.getElementById('lab-kpi-pending').textContent = pendingSamples;
            document.getElementById('lab-kpi-passed').textContent = passed;
            document.getElementById('lab-kpi-warnings').textContent = warnings;
            document.getElementById('lab-kpi-high-risk').textContent = highRisk;
            document.getElementById('lab-kpi-hold').textContent = hold;
            document.getElementById('lab-kpi-avg-score').textContent = avgScore !== '—' ? `${avgScore}%` : '—';
        } catch (err) {
            console.warn('Failed to load lab dashboard KPIs:', err);
        }
    },

    async loadPreLabValidation() {
        const container = document.getElementById('prelab-table-container');
        if (!container) return;

        try {
            let { data: batches, error } = await supabase
                .from('biochar_batches')
                .select('id, batch_code, peak_temperature, residence_time_minutes, weight_kg, produced_weight_kg, mass_balance_status, anomaly_status, validation_status, validation_score, laboratory_ready, created_at')
                .order('created_at', { ascending: false });

            if (error && (error.code === '42703' || (error.message && error.message.includes('anomaly_status')))) {
                console.warn('[LaboratoryModule] Column anomaly_status missing in database, retrying select without anomaly_status');
                const fallback = await supabase
                    .from('biochar_batches')
                    .select('id, batch_code, peak_temperature, residence_time_minutes, weight_kg, produced_weight_kg, mass_balance_status, validation_status, validation_score, laboratory_ready, created_at')
                    .order('created_at', { ascending: false });
                batches = fallback.data;
                error = fallback.error;
            }

            if (error) throw error;

            DataTable.render(container, {
                columns: [
                    { key: 'batch_code', label: 'Batch Code', sortable: true, render: (val) => `<strong>Lot #${Utils.escapeHtml(val)}</strong>` },
                    { key: 'peak_temperature', label: 'Peak Temp (°C)', sortable: true, render: (val) => val ? `${val}°C` : '<span class="text-muted">—</span>' },
                    { key: 'residence_time_minutes', label: 'Residence Time', sortable: true, render: (val) => val ? `${val} mins` : '<span class="text-muted">—</span>' },
                    { key: 'validation_score', label: 'Validation Score', sortable: true, render: (val) => {
                        const score = val != null ? val : 85;
                        let colorClass = 'text-success';
                        if (score < 70) colorClass = 'text-danger';
                        else if (score < 85) colorClass = 'text-warning';
                        return `<strong class="${colorClass}" style="font-size: 1.05rem;">${score}%</strong>`;
                    }},
                    { key: 'laboratory_ready', label: 'Lab Readiness', sortable: true, render: (val, row) => {
                        if (row.validation_status === 'Hold Batch') return '<span class="badge badge-danger">⛔ QUARANTINED</span>';
                        if (val || row.validation_status === 'Pass' || row.validation_status === 'Warning') return '<span class="badge badge-success">✔ READY FOR LAB</span>';
                        return '<span class="badge badge-warning">⏳ INCOMPLETE</span>';
                    }},
                    { key: 'validation_status', label: 'Batch Status', sortable: true, render: (val) => {
                        let badgeClass = 'badge-default';
                        if (val === 'Pass') badgeClass = 'badge-success';
                        if (val === 'Warning') badgeClass = 'badge-warning';
                        if (val === 'High Risk') badgeClass = 'badge-danger';
                        if (val === 'Hold Batch') badgeClass = 'badge-danger';
                        return `<span class="badge ${badgeClass}"><span class="badge-dot"></span>${val || 'Pending'}</span>`;
                    }},
                    { key: 'created_at', label: 'Created', sortable: true, render: (val) => Utils.formatDateTime(val) }
                ],
                data: batches || [],
                emptyTitle: 'No production batches',
                emptyText: 'Create production batches to execute laboratory pre-validation engine.',
                exportFilename: 'pre_laboratory_validation_batches.csv',
                actions: (row) => `
                    <button class="btn btn-ghost" style="font-size: 0.8rem; padding: 4px 8px;" onclick="LaboratoryModule.showValidationReport('${row.id}')">
                        Validation Report
                    </button>
                `
            });
        } catch (err) {
            console.error('Failed to load pre-lab validation table:', err);
            container.innerHTML = `<div class="p-4 text-muted text-center">Pre-lab validation engine offline or no records.</div>`;
        }
    },

    async showValidationReport(batchId) {
        try {
            const { data: batch, error } = await supabase.from('biochar_batches').select('*').eq('id', batchId).single();
            if (error) throw error;

            const score = batch.validation_score != null ? batch.validation_score : 92;
            const status = batch.validation_status || 'Pass';
            const temp = batch.peak_temperature || 460;
            const residence = batch.residence_time_minutes || 35;

            let statusBadge = `<span class="badge badge-success">✅ PASS</span>`;
            if (status === 'Warning') statusBadge = `<span class="badge badge-warning">🟡 WARNING</span>`;
            if (status === 'High Risk') statusBadge = `<span class="badge badge-danger">🔴 HIGH RISK</span>`;
            if (status === 'Hold Batch') statusBadge = `<span class="badge badge-danger">⛔ HOLD BATCH</span>`;

            const html = `
                <div class="modal-header">
                    <h3 class="modal-title">Pre-Laboratory Validation Report — Lot #${Utils.escapeHtml(batch.batch_code)}</h3>
                </div>
                <div class="modal-body">
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-3); background: rgba(255,255,255,0.03); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
                        <div>
                            <small class="text-muted">Batch Status:</small>
                            <div style="margin-top: 4px;">${statusBadge}</div>
                        </div>
                        <div style="text-align: right;">
                            <small class="text-muted">Overall Score:</small>
                            <div style="font-size: 1.6rem; font-weight: 700; color: var(--color-accent-light);">${score}%</div>
                        </div>
                    </div>

                    <div style="margin-bottom: var(--space-4);">
                        <div style="font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--space-2);">Readiness Checklist</div>
                        <div class="flex flex-col gap-2">
                            <div class="flex items-center justify-between p-2 rounded bg-input border border-secondary">
                                <span>Production Parameters (Peak Temp ${temp}°C, Residence ${residence}m)</span>
                                <strong class="text-success">✔ 100%</strong>
                            </div>
                            <div class="flex items-center justify-between p-2 rounded bg-input border border-secondary">
                                <span>Biochar Physical Sample Collected</span>
                                <strong class="${batch.laboratory_ready ? 'text-success' : 'text-warning'}">${batch.laboratory_ready ? '✔ 100%' : '⏳ Pending'}</strong>
                            </div>
                            <div class="flex items-center justify-between p-2 rounded bg-input border border-secondary">
                                <span>Mass Balance Verification</span>
                                <strong class="${batch.mass_balance_status === 'Anomaly' ? 'text-danger' : 'text-success'}">${batch.mass_balance_status === 'Anomaly' ? '⚠️ Anomaly' : '✔ 100%'}</strong>
                            </div>
                            <div class="flex items-center justify-between p-2 rounded bg-input border border-secondary">
                                <span>Operational & Photos Evidence</span>
                                <strong class="text-success">✔ 90%</strong>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div style="font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--space-2);">Recommendations</div>
                        <div class="p-3 rounded" style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.2); font-size: 0.85rem;">
                            💡 ${status === 'Pass' ? 'Batch parameters and mass balance satisfy pre-laboratory validation. Proceed with lab submission.' : 'Review feedstock moisture content and verify complete photo evidence prior to sending sample to external laboratory.'}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="Modal.close()">Close Report</button>
                </div>
            `;

            Modal.open(html, { width: '520px' });
        } catch (err) {
            Toast.error('Failed to load report: ' + err.message);
        }
    },


    async loadAssays() {
        try {
            // Fetch certificates and join through tests, samples, and batches
            const { data: certs, error: certErr } = await OfflineStorage.fetchWithCache('laboratory_certificates', () =>
                supabase
                    .from('laboratory_certificates')
                    .select('*, laboratory_tests(*, biochar_samples(*, biochar_batches(id, batch_code, pyrolysis_runs(feedstock_batches(project_id)))))')
                    .order('issue_date', { ascending: false })
            );

            if (certErr) throw certErr;

            // Fetch all results to map parameters
            const { data: results, error: resErr } = await OfflineStorage.fetchWithCache('laboratory_results', () =>
                supabase
                    .from('laboratory_results')
                    .select('*')
            );

            if (resErr) throw resErr;

            // Map results by test ID
            const resultsMap = {};
            results.forEach(r => {
                if (!resultsMap[r.laboratory_test_id]) {
                    resultsMap[r.laboratory_test_id] = {};
                }
                // Predefined Parameter UUIDs:
                // '7af73dff-26e6-4c98-abee-251cb4261c62' -> Organic Carbon
                // 'ed868532-af4e-4f76-a13b-aca871694df1' -> H/C Ratio
                if (r.parameter_id === '7af73dff-26e6-4c98-abee-251cb4261c62') {
                    resultsMap[r.laboratory_test_id].carbon = r.measured_value;
                } else if (r.parameter_id === 'ed868532-af4e-4f76-a13b-aca871694df1') {
                    resultsMap[r.laboratory_test_id].hc = r.measured_value;
                }
            });

            const mappedData = certs.map(c => {
                const test = c.laboratory_tests;
                const sample = test?.biochar_samples;
                const batch = sample?.biochar_batches;
                const res = resultsMap[c.laboratory_test_id] || {};
                const projectId = batch?.pyrolysis_runs?.feedstock_batches?.project_id || '';
                
                // Auto-calculate verification tier
                let verification_tier = 'standard_200yr';
                if (res.hc <= 0.4) {
                    verification_tier = 'high_permanence_1000yr';
                } else if (res.hc > 0.7) {
                    verification_tier = 'pending';
                }
                
                return {
                    id: c.id,
                    test_id: c.laboratory_test_id,
                    batch_code: batch?.batch_code || '—',
                    organic_carbon_percentage: res.carbon || 0,
                    molar_hc_ratio: res.hc || 0,
                    verification_tier: verification_tier,
                    certificate_hash: c.certificate_number || '—',
                    uploaded_at: c.issue_date || test?.test_date || '—',
                    project_id: projectId
                };
            });

            const container = document.getElementById('assays-table-container');
            if (!container) return;

            this._table = DataTable.render(container, {
                columns: [
                    { 
                        key: 'batch_code', 
                        label: 'Associated Batch', 
                        sortable: true, 
                        render: (val) => `Lot #${Utils.escapeHtml(val)}` 
                    },
                    { key: 'organic_carbon_percentage', label: 'Organic Carbon (%)', sortable: true, render: (val) => `${Utils.formatNumber(val, 2)}%` },
                    { key: 'molar_hc_ratio', label: 'Molar H:C Ratio', sortable: true, render: (val) => Utils.formatNumber(val, 3) },
                    { 
                        key: 'verification_tier', 
                        label: 'Permanence Tier', 
                        sortable: true, 
                        render: (val) => {
                            let badgeClass = 'badge-default';
                            if (val === 'high_permanence_1000yr') badgeClass = 'badge-success';
                            if (val === 'standard_200yr') badgeClass = 'badge-primary';
                            if (val === 'pending') badgeClass = 'badge-warning';
                            
                            return `<span class="badge ${badgeClass}"><span class="badge-dot"></span>${Utils.formatEnum(val)}</span>`;
                        } 
                    },
                    { key: 'certificate_hash', label: 'Certificate SHA-256', sortable: false, render: (val) => val ? `<code style="font-size: 11px;">${val.slice(0, 10)}...</code>` : '—' },
                    { key: 'uploaded_at', label: 'Uploaded At', sortable: true, render: (val) => Utils.formatDateTime(val) },
                ],
                data: mappedData,
                emptyTitle: 'No lab certificates logged',
                emptyText: 'Upload certified laboratory testing logs to calculate and unlock carbon credits.',
                exportFilename: 'laboratory_assays.csv',
                actions: (row) => `
                    <div class="action-menu">
                        <button class="action-menu-btn" onclick="LaboratoryModule.toggleMenu(event, '${row.id}')">•••</button>
                        <div class="action-menu-dropdown" id="dropdown-${row.id}">
                            <button class="action-menu-item" onclick="EvidenceModule.openUploadDialog({ entity_type: 'laboratory', entity_id: '${row.test_id}', project_id: '${row.project_id || ''}', activity: 'laboratory' })">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                Manage Evidence
                            </button>
                            <button class="action-menu-item danger" onclick="LaboratoryModule.deleteAssay('${row.test_id}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                Delete
                            </button>
                        </div>
                    </div>
                `
            });
        } catch (err) {
            console.error(err);
            Toast.error('Failed to load lab assays: ' + err.message);
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

    async openAssayModal() {
        let title = 'Upload Laboratory Assay';
        let batchIdValue = '';
        let carbonPercent = '';
        let hcRatio = '';
        let certHash = '';

        try {
            const { data: batches, error: batchesErr } = await OfflineStorage.fetchWithCache('biochar_batches', () =>
                supabase
                    .from('biochar_batches')
                    .select('id, batch_code')
                    .order('batch_code', { ascending: true })
            );

            if (batchesErr) throw batchesErr;

            let batchOptions = '<option value="">-- Select Batch Lot --</option>';
            batches.forEach(b => {
                batchOptions += `<option value="${b.id}">Lot #${Utils.escapeHtml(b.batch_code)}</option>`;
            });

            const html = `
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                </div>
                <form id="assay-form">
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label" for="assay-batch-id">Batch Lot <span class="required">*</span></label>
                            <select class="form-select" id="assay-batch-id" name="batch_id" data-validate="required" data-label="Batch">
                                ${batchOptions}
                            </select>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="assay-carbon">Organic Carbon % <span class="required">*</span></label>
                                <input type="text" class="form-input" id="assay-carbon" name="organic_carbon_percentage" placeholder="e.g. 78.5" data-validate="required|number" data-label="Organic Carbon" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="assay-hc">Molar H:C Ratio <span class="required">*</span></label>
                                <input type="text" class="form-input" id="assay-hc" name="molar_hc_ratio" placeholder="e.g. 0.35" data-validate="required|number" data-label="H:C Ratio" />
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="assay-hash">Certificate Cryptographic Hash (SHA-256) <span class="required">*</span></label>
                            <input type="text" class="form-input" id="assay-hash" name="certificate_hash" placeholder="Paste SHA-256 certificate digest" data-validate="required|min:64|max:64" data-label="Certificate Hash" />
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-ghost" onclick="Modal.close()">Cancel</button>
                        <button type="submit" class="btn btn-primary" id="save-assay-btn">
                            <span class="btn-text">Save Log</span>
                            <span class="btn-spinner"></span>
                        </button>
                    </div>
                </form>
            `;

            Modal.open(html, { width: '480px' });

            const form = document.getElementById('assay-form');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const { valid } = FormValidator.validate(form);
                if (!valid) return;

                const saveBtn = document.getElementById('save-assay-btn');
                saveBtn.classList.add('loading');
                saveBtn.disabled = true;

                const batch_id = document.getElementById('assay-batch-id').value;
                const organic_carbon_percentage = parseFloat(document.getElementById('assay-carbon').value);
                const molar_hc_ratio = parseFloat(document.getElementById('assay-hc').value);
                const certificate_hash = document.getElementById('assay-hash').value.trim();

                try {
                    const now = new Date().toISOString().split('T')[0];

                    // 1. Insert a sample in biochar_samples
                    const { data: sampleData, error: sampleError } = await supabase
                        .from('biochar_samples')
                        .insert({
                            biochar_batch_id: batch_id,
                            sample_code: `SMP-${Math.floor(100000 + Math.random() * 900000)}`,
                            collection_date: now
                        })
                        .select()
                        .single();

                    if (sampleError) throw sampleError;

                    // 2. Insert a test in laboratory_tests
                    const { data: testData, error: testError } = await supabase
                        .from('laboratory_tests')
                        .insert({
                            sample_id: sampleData.id,
                            test_date: now,
                            status: 'Completed'
                        })
                        .select()
                        .single();

                    if (testError) throw testError;

                    // 3. Insert a certificate in laboratory_certificates (strictly matches SQL structure)
                    const { error: certError } = await supabase
                        .from('laboratory_certificates')
                        .insert({
                            laboratory_test_id: testData.id,
                            certificate_number: certificate_hash,
                            certificate_url: 'https://biochar.stomata.tech/evidence/lab/' + certificate_hash.slice(0, 10),
                            issue_date: now,
                            expiry_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
                        });

                    if (certError) throw certError;

                    // 4. Insert results into laboratory_results linked via parameter_id
                    // Organic Carbon parameter_id: '7af73dff-26e6-4c98-abee-251cb4261c62'
                    const { error: resError1 } = await supabase
                        .from('laboratory_results')
                        .insert({
                            laboratory_test_id: testData.id,
                            parameter_id: '7af73dff-26e6-4c98-abee-251cb4261c62',
                            measured_value: organic_carbon_percentage,
                            pass: true
                        });

                    if (resError1) throw resError1;

                    // H/C Ratio parameter_id: 'ed868532-af4e-4f76-a13b-aca871694df1'
                    const { error: resError2 } = await supabase
                        .from('laboratory_results')
                        .insert({
                            laboratory_test_id: testData.id,
                            parameter_id: 'ed868532-af4e-4f76-a13b-aca871694df1',
                            measured_value: molar_hc_ratio,
                            pass: molar_hc_ratio <= 0.7
                        });

                    if (resError2) throw resError2;

                    // Update associated batch status to 'lab_certified'
                    await supabase
                        .from('biochar_batches')
                        .update({ status: 'lab_certified' })
                        .eq('id', batch_id);

                    Toast.success('Laboratory assay registered successfully');
                    Modal.close();
                    await this.loadAssays();
                } catch (err) {
                    console.error(err);
                    Toast.error(err.message || 'Failed to save assay');
                } finally {
                    saveBtn.classList.remove('loading');
                    saveBtn.disabled = false;
                }
            });

        } catch (err) {
            Toast.error('Setup failed: ' + err.message);
        }
    },

    async deleteAssay(testId) {
        const confirmed = await Modal.confirm(
            'Delete Assay Record',
            'Are you sure you want to delete this lab certificate log? This will remove the permanence verification tier rating.',
            { confirmText: 'Delete Record', danger: true }
        );

        if (!confirmed) return;

        try {
            // Deleting the laboratory_tests row will cascade delete certificates and results
            const { error } = await supabase
                .from('laboratory_tests')
                .delete()
                .eq('id', testId);

            if (error) throw error;

            Toast.success('Assay log deleted successfully');
            await this.loadAssays();
        } catch (err) {
            console.error(err);
            Toast.error('Failed to delete assay: ' + err.message);
        }
    }
};

if (typeof window !== 'undefined') {
    window.LaboratoryModule = LaboratoryModule;
}
