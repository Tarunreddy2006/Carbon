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
            // Query specific columns of biochar_batches to explicitly exclude net_sequestration_tco2e
            const { data, error } = await OfflineStorage.fetchWithCache('biochar_batches', () =>
                supabase
                    .from('biochar_batches')
                    .select('id, pyrolysis_run_id, batch_code, weight_kg, storage_location, status, created_at, pyrolysis_runs(run_number, feedstock_batches(project_id, projects(id, name)))')
                    .order('created_at', { ascending: false })
            );

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
                        key: 'pyrolysis_runs', 
                        label: 'Pyrolysis Run', 
                        sortable: false, 
                        render: (val) => val ? Utils.escapeHtml(val.run_number) : '—'
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
                                <button class="action-menu-item" onclick="EvidenceModule.openUploadDialog({ entity_type: 'batch', entity_id: '${row.id}', project_id: '${projectId}', activity: 'batches' })">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                    Batch Evidence
                                </button>
                                <button class="action-menu-item" onclick="EvidenceModule.openUploadDialog({ entity_type: 'batch', entity_id: '${row.id}', project_id: '${projectId}', activity: 'storage' })">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                                    Storage Evidence
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
                weightValue = data.weight_kg;
                storageValue = data.storage_location || 'Warehouse-1';
                statusValue = data.status;
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
                                <label class="form-label" for="batch-weight">Weight (kg)</label>
                                <input type="text" class="form-input" id="batch-weight" name="weight_kg" value="${weightValue}" data-validate="required|number|positive" data-label="Weight" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="batch-storage">Storage Location</label>
                                <input type="text" class="form-input" id="batch-storage" name="storage_location" value="${Utils.escapeHtml(storageValue)}" data-validate="required" data-label="Storage Location" />
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

            Modal.open(html, { width: '450px' });

            const form = document.getElementById('batch-form');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const { valid } = FormValidator.validate(form);
                if (!valid) return;

                const saveBtn = document.getElementById('save-batch-btn');
                saveBtn.classList.add('loading');
                saveBtn.disabled = true;

                const payload = {
                    batch_code: document.getElementById('batch-code').value.trim(),
                    pyrolysis_run_id: document.getElementById('batch-run-id').value,
                    weight_kg: parseFloat(document.getElementById('batch-weight').value || 0),
                    storage_location: document.getElementById('batch-storage').value.trim(),
                    status: document.getElementById('batch-status').value
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
