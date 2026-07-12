// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Biochar Batches Module (CRUD)
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
            const { data, error } = await supabase
                .from('biochar_batches')
                .select('*, projects(name)')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const container = document.getElementById('batches-table-container');
            if (!container) return;

            this._table = DataTable.render(container, {
                columns: [
                    { key: 'batch_lot_number', label: 'Lot Number', sortable: true, render: (val) => `<strong>Lot #${Utils.escapeHtml(val)}</strong>` },
                    { key: 'projects', label: 'Project Site', sortable: true, render: (val) => val ? Utils.escapeHtml(val.name) : '—' },
                    { 
                        key: 'status', 
                        label: 'Lifecycle Status', 
                        sortable: true, 
                        render: (val) => {
                            let badgeClass = 'badge-default';
                            if (val === 'completed') badgeClass = 'badge-success';
                            if (val === 'processing_active') badgeClass = 'badge-primary';
                            if (val === 'lab_certified') badgeClass = 'badge-primary'; // purple equivalent
                            if (val === 'sourcing_purgatory') badgeClass = 'badge-warning';
                            if (val === 'ineligible') badgeClass = 'badge-danger';
                            
                            return `<span class="badge ${badgeClass}"><span class="badge-dot"></span>${Utils.formatEnum(val)}</span>`;
                        } 
                    },
                    { key: 'net_sequestration_tco2e', label: 'Carbon Removal (tCO2e)', sortable: true, render: (val) => Utils.formatCO2(val) },
                    { key: 'created_at', label: 'Created At', sortable: true, render: (val) => Utils.formatDateTime(val) },
                ],
                data: data,
                emptyTitle: 'No production batches',
                emptyText: 'Start a new biochar carbon-removal batch to log pyrolysis runs and quality assays.',
                exportFilename: 'biochar_production_batches.csv',
                actions: (row) => `
                    <div class="action-menu">
                        <button class="action-menu-btn" onclick="BatchesModule.toggleMenu(event, '${row.id}')">•••</button>
                        <div class="action-menu-dropdown" id="dropdown-${row.id}">
                            <button class="action-menu-item" onclick="BatchesModule.openBatchModal('${row.id}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                Edit Batch
                            </button>
                            <button class="action-menu-item danger" onclick="BatchesModule.deleteBatch('${row.id}', '${Utils.escapeHtml(row.batch_lot_number)}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                Delete
                            </button>
                        </div>
                    </div>
                `
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
        let lotValue = '';
        let projectIdValue = '';
        let statusValue = 'sourcing_purgatory';
        let carbonValue = '0.0';

        try {
            // Load projects dropdown
            const { data: projects, error: projErr } = await supabase
                .from('projects')
                .select('id, name')
                .order('name', { ascending: true });

            if (projErr) throw projErr;

            if (batchId) {
                title = 'Edit Production Batch';
                const { data, error } = await supabase
                    .from('biochar_batches')
                    .select('*')
                    .eq('id', batchId)
                    .single();

                if (error) throw error;

                lotValue = data.batch_lot_number;
                projectIdValue = data.project_id;
                statusValue = data.status;
                carbonValue = data.net_sequestration_tco2e;
            } else {
                // Pre-generate standard lot number (e.g. BC-YYYYMMDD-XXXX)
                const now = new Date();
                const d = now.toISOString().slice(0,10).replace(/-/g,'');
                const rand = Math.floor(1000 + Math.random() * 9000);
                lotValue = `BC-${d}-${rand}`;
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
                <form id="batch-form">
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label" for="batch-lot">Batch Lot Number <span class="required">*</span></label>
                            <input type="text" class="form-input" id="batch-lot" name="batch_lot_number" value="${Utils.escapeHtml(lotValue)}" data-validate="required" data-label="Lot Number" placeholder="e.g. BC-20260712-001" />
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="batch-project-id">Project Site <span class="required">*</span></label>
                            <select class="form-select" id="batch-project-id" name="project_id" data-validate="required" data-label="Project Site">
                                ${projectOptions}
                            </select>
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
                        <div class="form-group">
                            <label class="form-label" for="batch-carbon">Calculated Sequestration (tCO2e)</label>
                            <input type="text" class="form-input" id="batch-carbon" name="net_sequestration_tco2e" value="${carbonValue}" data-validate="number" data-label="Net Sequestration" placeholder="e.g. 0.0" />
                            <small class="form-hint">Updates automatically as telemetry is validated, but can be adjusted manually.</small>
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
                const { valid, errors } = FormValidator.validate(form);
                if (!valid) return;

                const saveBtn = document.getElementById('save-batch-btn');
                saveBtn.classList.add('loading');
                saveBtn.disabled = true;

                const payload = {
                    batch_lot_number: document.getElementById('batch-lot').value.trim(),
                    project_id: document.getElementById('batch-project-id').value,
                    status: document.getElementById('batch-status').value,
                    net_sequestration_tco2e: parseFloat(document.getElementById('batch-carbon').value || 0),
                    updated_at: new Date().toISOString()
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
