// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Pyrolysis Module (SCADA Telemetry)
// ═══════════════════════════════════════════════════════════════════════════

const PyrolysisModule = {
    _container: null,
    _table: null,
    _chart: null,

    async render(container) {
        this._container = container;
        container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Pyrolysis Telemetry</h1>
                    <p class="page-subtitle">Monitor SCADA/PLC telemetry including kiln operating temperatures, electricity, and fossil fuel consumption.</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn btn-ghost" id="refresh-telemetry-btn">Refresh</button>
                    <button class="btn btn-primary" id="log-telemetry-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        Log Pyrolysis Run
                    </button>
                </div>
            </div>

            <!-- SCADA Temp Chart -->
            <div class="card animate-fade-up" style="margin-bottom: var(--space-6);">
                <div class="card-header">
                    <h3 class="card-title">SCADA Kiln Run Average Temperature curve (°C)</h3>
                </div>
                <div class="chart-container" style="height: 220px;">
                    <canvas id="scada-temp-chart"></canvas>
                </div>
            </div>

            <!-- Telemetry List -->
            <div class="card animate-fade-up">
                <div id="telemetry-table-container">
                    <div class="page-loading">
                        <div class="skeleton skeleton-table"></div>
                    </div>
                </div>
            </div>
        `;

        await this.loadTelemetry();

        document.getElementById('log-telemetry-btn').addEventListener('click', () => this.openTelemetryModal());
        document.getElementById('refresh-telemetry-btn').addEventListener('click', async (e) => {
            e.currentTarget.classList.add('loading');
            await this.loadTelemetry();
            e.currentTarget.classList.remove('loading');
            Toast.success('Telemetry updated');
        });
    },

    async loadTelemetry() {
        try {
            const { data, error } = await supabase
                .from('pyrolysis_runs')
                .select('*, feedstock_batches(project_id, batch_code)')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const container = document.getElementById('telemetry-table-container');
            if (!container) return;

            this._table = DataTable.render(container, {
                columns: [
                    { key: 'run_number', label: 'Run Number', sortable: true, render: (val) => `<strong>#${Utils.escapeHtml(val)}</strong>` },
                    { 
                        key: 'feedstock_batches', 
                        label: 'Feedstock Lot', 
                        sortable: true, 
                        render: (val) => val ? `Lot #${Utils.escapeHtml(val.batch_code)}` : '—' 
                    },
                    { key: 'average_temperature', label: 'Average Temp (°C)', sortable: true, render: (val) => `${Utils.formatNumber(val, 1)} °C` },
                    { key: 'electricity_kwh', label: 'Electricity (kWh)', sortable: true, render: (val) => `${Utils.formatNumber(val, 2)} kWh` },
                    { key: 'fuel_used_liters', label: 'Fossil Fuel (L)', sortable: true, render: (val) => `${Utils.formatNumber(val, 2)} L` },
                    { key: 'created_at', label: 'Created At', sortable: true, render: (val) => Utils.formatDateTime(val) },
                ],
                data: data,
                emptyTitle: 'No pyrolysis runs logged',
                emptyText: 'Record kiln runs and utility consumption to calculate processing emissions.',
                exportFilename: 'pyrolysis_runs_export.csv',
                actions: (row) => `
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-ghost btn-sm" onclick="EvidenceModule.openUploadDialog({ entity_type: 'pyrolysis', entity_id: '${row.id}', project_id: '${row.feedstock_batches?.project_id || ''}', activity: 'pyrolysis' })" title="Manage Evidence" style="padding: 4px 8px;">
                            📁 Evidence
                        </button>
                        <button class="btn btn-ghost btn-sm text-danger" onclick="PyrolysisModule.deleteReading('${row.id}')" title="Delete run" style="padding: 4px 8px;">
                            Delete
                        </button>
                    </div>
                `
            });

            this.renderChart(data);

        } catch (err) {
            console.error(err);
            Toast.error('Failed to load telemetry: ' + err.message);
        }
    },

    renderChart(runs) {
        const ctx = document.getElementById('scada-temp-chart').getContext('2d');
        
        const sorted = [...runs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).slice(-20);

        const labels = sorted.map(t => t.run_number || 'Run');
        const temps = sorted.map(t => t.average_temperature || 0);

        if (this._chart) this._chart.destroy();

        const theme = Theme.current();
        const textColors = theme === 'dark' ? '#94a3b8' : '#475569';

        this._chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.length ? labels : ['No runs'],
                datasets: [{
                    label: 'Average Temp (°C)',
                    data: temps.length ? temps : [0],
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.05)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: '#38bdf8',
                    pointRadius: 3,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: textColors } },
                    y: { grid: { color: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }, ticks: { color: textColors } }
                }
            }
        });
    },

    async openTelemetryModal() {
        try {
            const { data: feedstocks, error: fsErr } = await supabase
                .from('feedstock_batches')
                .select('id, batch_code')
                .order('batch_code', { ascending: true });

            if (fsErr) throw fsErr;

            let fsOptions = '<option value="">-- Select Feedstock Batch --</option>';
            feedstocks.forEach(fs => {
                fsOptions += `<option value="${fs.id}">${Utils.escapeHtml(fs.batch_code)}</option>`;
            });

            const defaultRunNumber = `RUN-${Math.floor(100000 + Math.random() * 900000)}`;

            const html = `
                <div class="modal-header">
                    <h3 class="modal-title">Log Pyrolysis SCADA Run</h3>
                </div>
                <form id="telemetry-form">
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label" for="run-feedstock-id">Feedstock Batch <span class="required">*</span></label>
                            <select class="form-select" id="run-feedstock-id" name="feedstock_batch_id" data-validate="required" data-label="Feedstock Batch">
                                ${fsOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="run-number">Run Number <span class="required">*</span></label>
                            <input type="text" class="form-input" id="run-number" name="run_number" value="${defaultRunNumber}" data-validate="required" data-label="Run Number" />
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="reactor-name">Reactor Name <span class="required">*</span></label>
                                <input type="text" class="form-input" id="reactor-name" name="reactor_name" value="Reactor-A" data-validate="required" data-label="Reactor Name" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="operator-name">Operator Name <span class="required">*</span></label>
                                <input type="text" class="form-input" id="operator-name" name="operator_name" value="Operator-1" data-validate="required" data-label="Operator Name" />
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="average-temp">Average Temp (°C) <span class="required">*</span></label>
                                <input type="text" class="form-input" id="average-temp" name="average_temperature" placeholder="e.g. 520" data-validate="required|number|positive" data-label="Average Temperature" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="max-temp">Maximum Temp (°C) <span class="required">*</span></label>
                                <input type="text" class="form-input" id="max-temp" name="maximum_temperature" placeholder="e.g. 580" data-validate="required|number|positive" data-label="Maximum Temperature" />
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="telemetry-elec">Electricity Draw (kWh) <span class="required">*</span></label>
                                <input type="text" class="form-input" id="telemetry-elec" name="electricity_kwh" placeholder="e.g. 4.2" data-validate="required|number" data-label="Electricity Draw" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="telemetry-fuel">Fossil Fuel (Liters) <span class="required">*</span></label>
                                <input type="text" class="form-input" id="telemetry-fuel" name="fuel_used_liters" placeholder="e.g. 0.5" data-validate="required|number" data-label="Fossil Fuel" />
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-ghost" onclick="Modal.close()">Cancel</button>
                        <button type="submit" class="btn btn-primary" id="save-telemetry-btn">
                            <span class="btn-text">Log Run</span>
                            <span class="btn-spinner"></span>
                        </button>
                    </div>
                </form>
            `;

            Modal.open(html, { width: '450px' });

            const form = document.getElementById('telemetry-form');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const { valid } = FormValidator.validate(form);
                if (!valid) return;

                const saveBtn = document.getElementById('save-telemetry-btn');
                saveBtn.classList.add('loading');
                saveBtn.disabled = true;

                const feedstock_batch_id = document.getElementById('run-feedstock-id').value;
                const run_number = document.getElementById('run-number').value.trim();
                const reactor_name = document.getElementById('reactor-name').value.trim();
                const operator_name = document.getElementById('operator-name').value.trim();
                const average_temperature = parseFloat(document.getElementById('average-temp').value);
                const maximum_temperature = parseFloat(document.getElementById('max-temp').value);
                const electricity_kwh = parseFloat(document.getElementById('telemetry-elec').value);
                const fuel_used_liters = parseFloat(document.getElementById('telemetry-fuel').value);

                try {
                    const now = new Date().toISOString();
                    // 1. Insert into pyrolysis_runs
                    const { data: runData, error: runError } = await supabase
                        .from('pyrolysis_runs')
                        .insert({
                            feedstock_batch_id,
                            run_number,
                            reactor_name,
                            operator_name,
                            average_temperature,
                            maximum_temperature,
                            electricity_kwh,
                            fuel_used_liters,
                            start_time: now,
                            end_time: now,
                            residence_time_minutes: 60
                        })
                        .select()
                        .single();

                    if (runError) throw runError;

                    // 2. Insert corresponding temperature reading into reactor_sensor_logs for compliance checks
                    const { error: logError } = await supabase
                        .from('reactor_sensor_logs')
                        .insert({
                            pyrolysis_run_id: runData.id,
                            sensor_name: 'kiln_temperature',
                            sensor_value: average_temperature,
                            unit: 'C',
                            recorded_at: now
                        });

                    if (logError) throw logError;

                    Toast.success('Pyrolysis run logged successfully');
                    Modal.close();
                    await this.loadTelemetry();
                } catch (err) {
                    console.error(err);
                    Toast.error('Failed to log pyrolysis run: ' + err.message);
                } finally {
                    saveBtn.classList.remove('loading');
                    saveBtn.disabled = false;
                }
            });

        } catch (err) {
            Toast.error('Setup failed: ' + err.message);
        }
    },

    async deleteReading(id) {
        const confirmed = await Modal.confirm(
            'Delete Run Record',
            'Are you sure you want to delete this pyrolysis run? This will remove all temperature profile logs associated with it.',
            { confirmText: 'Delete Run', danger: true }
        );

        if (!confirmed) return;

        try {
            const { error } = await supabase
                .from('pyrolysis_runs')
                .delete()
                .eq('id', id);

            if (error) throw error;

            Toast.success('Pyrolysis run deleted');
            await this.loadTelemetry();
        } catch (err) {
            console.error(err);
            Toast.error('Failed to delete run: ' + err.message);
        }
    }
};

if (typeof window !== 'undefined') {
    window.PyrolysisModule = PyrolysisModule;
}
