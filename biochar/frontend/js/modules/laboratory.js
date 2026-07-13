// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Laboratory Assays Module (CRUD)
// ═══════════════════════════════════════════════════════════════════════════

const LaboratoryModule = {
    _container: null,
    _table: null,

    async render(container) {
        this._container = container;
        container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Laboratory Assays</h1>
                    <p class="page-subtitle">Record and verify chemical assays including organic carbon percentages, molar H:C ratios, and permanence verification tiers.</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn btn-primary" id="create-assay-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        Log Assay
                    </button>
                </div>
            </div>

            <div class="card animate-fade-up">
                <div id="assays-table-container">
                    <div class="page-loading">
                        <div class="skeleton skeleton-table"></div>
                    </div>
                </div>
            </div>
        `;

        await this.loadAssays();

        document.getElementById('create-assay-btn').addEventListener('click', () => this.openAssayModal());
    },

    async loadAssays() {
        try {
            // Fetch certificates and join through tests, samples, and batches
            const { data: certs, error: certErr } = await supabase
                .from('laboratory_certificates')
                .select('*, laboratory_tests(*, biochar_samples(*, biochar_batches(id, batch_code)))')
                .order('issue_date', { ascending: false });

            if (certErr) throw certErr;

            // Fetch all results to map parameters
            const { data: results, error: resErr } = await supabase
                .from('laboratory_results')
                .select('*');

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
            const { data: batches, error: batchesErr } = await supabase
                .from('biochar_batches')
                .select('id, batch_code')
                .order('batch_code', { ascending: true });

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
                            sampling_date: now
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
