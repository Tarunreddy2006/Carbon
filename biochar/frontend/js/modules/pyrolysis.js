// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Pyrolysis Module (SCADA Telemetry)
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
                    <p class="page-subtitle">Monitor SCADA/PLC telemetry including kiln internal temperatures and energy consumption.</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn btn-ghost" id="refresh-telemetry-btn">Refresh</button>
                    <button class="btn btn-primary" id="log-telemetry-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        Log Reading
                    </button>
                </div>
            </div>

            <!-- SCADA Temp Chart -->
            <div class="card animate-fade-up" style="margin-bottom: var(--space-6);">
                <div class="card-header">
                    <h3 class="card-title">SCADA Kiln Temperature Curve (°C)</h3>
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
                .from('pyrolysis_telemetry')
                .select('*, biochar_batches(batch_lot_number)')
                .order('timestamp', { ascending: false });

            if (error) throw error;

            const container = document.getElementById('telemetry-table-container');
            if (!container) return;

            this._table = DataTable.render(container, {
                columns: [
                    { 
                        key: 'biochar_batches', 
                        label: 'Batch Lot', 
                        sortable: true, 
                        render: (val) => val ? `Lot #${Utils.escapeHtml(val.batch_lot_number)}` : '—' 
                    },
                    { key: 'timestamp', label: 'Sensor Time', sortable: true, render: (val) => Utils.formatDateTime(val) },
                    { key: 'kiln_temperature_celsius', label: 'Kiln Temp (°C)', sortable: true, render: (val) => `${Utils.formatNumber(val, 1)} °C` },
                    { key: 'electricity_consumption_kwh', label: 'Electricity (kWh)', sortable: true, render: (val) => `${Utils.formatNumber(val, 2)} kWh` },
                    { key: 'fossil_fuel_consumption_liters', label: 'Fossil Fuel (L)', sortable: true, render: (val) => `${Utils.formatNumber(val, 2)} L` },
                ],
                data: data,
                emptyTitle: 'No telemetry logged',
                emptyText: 'Push telemetry records or log readings manually to build the carbon permanence audit trail.',
                exportFilename: 'kiln_telemetry_export.csv',
                actions: (row) => `
                    <button class="btn btn-ghost btn-sm" onclick="PyrolysisModule.deleteReading('${row.id}')" title="Delete reading">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                `
            });

            // Render telemetry chart curve
            this.renderChart(data);

        } catch (err) {
            console.error(err);
            Toast.error('Failed to load telemetry: ' + err.message);
        }
    },

    renderChart(telemetry) {
        const ctx = document.getElementById('scada-temp-chart').getContext('2d');
        
        // Sort chronologically for the curve
        const sorted = [...telemetry].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).slice(-20); // last 20 ticks

        const labels = sorted.map(t => new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        const temps = sorted.map(t => t.kiln_temperature_celsius);

        if (this._chart) this._chart.destroy();

        const theme = Theme.current();
        const textColors = theme === 'dark' ? '#94a3b8' : '#475569';

        this._chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.length ? labels : ['No readings'],
                datasets: [{
                    label: 'Kiln Temp',
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
            // Load batches
            const { data: batches, error: batchesErr } = await supabase
                .from('biochar_batches')
                .select('id, batch_lot_number')
                .order('batch_lot_number', { ascending: true });

            if (batchesErr) throw batchesErr;

            let batchOptions = '<option value="">-- Select Batch --</option>';
            batches.forEach(b => {
                batchOptions += `<option value="${b.id}">Lot #${Utils.escapeHtml(b.batch_lot_number)}</option>`;
            });

            const html = `
                <div class="modal-header">
                    <h3 class="modal-title">Log Pyrolysis SCADA Metric</h3>
                </div>
                <form id="telemetry-form">
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label" for="telemetry-batch-id">Batch Lot <span class="required">*</span></label>
                            <select class="form-select" id="telemetry-batch-id" name="batch_id" data-validate="required" data-label="Batch">
                                ${batchOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="telemetry-temp">Kiln Temperature (°C) <span class="required">*</span></label>
                            <input type="text" class="form-input" id="telemetry-temp" name="kiln_temperature_celsius" placeholder="e.g. 550" data-validate="required|number|positive" data-label="Kiln Temperature" />
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="telemetry-elec">Electricity Draw (kWh) <span class="required">*</span></label>
                                <input type="text" class="form-input" id="telemetry-elec" name="electricity_consumption_kwh" placeholder="e.g. 4.2" data-validate="required|number" data-label="Electricity Draw" />
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="telemetry-fuel">Fossil Fuel (Liters) <span class="required">*</span></label>
                                <input type="text" class="form-input" id="telemetry-fuel" name="fossil_fuel_consumption_liters" placeholder="e.g. 0" data-validate="required|number" data-label="Fossil Fuel" />
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-ghost" onclick="Modal.close()">Cancel</button>
                        <button type="submit" class="btn btn-primary" id="save-telemetry-btn">
                            <span class="btn-text">Log Reading</span>
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

                const payload = {
                    batch_id: document.getElementById('telemetry-batch-id').value,
                    kiln_temperature_celsius: parseFloat(document.getElementById('telemetry-temp').value),
                    electricity_consumption_kwh: parseFloat(document.getElementById('electricity-elec').value),
                    fossil_fuel_consumption_liters: parseFloat(document.getElementById('telemetry-fuel').value),
                    timestamp: new Date().toISOString()
                };

                try {
                    const { error } = await supabase
                        .from('pyrolysis_telemetry')
                        .insert(payload);

                    if (error) throw error;

                    Toast.success('Telemetry logged successfully');
                    Modal.close();
                    await this.loadTelemetry();
                } catch (err) {
                    console.error(err);
                    Toast.error('Failed to log telemetry: ' + err.message);
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
            'Delete Reading',
            'Are you sure you want to delete this telemetry point? This will alter the recorded manufacturing temperature profile history.',
            { confirmText: 'Delete Reading', danger: true }
        );

        if (!confirmed) return;

        try {
            const { error } = await supabase
                .from('pyrolysis_telemetry')
                .delete()
                .eq('id', id);

            if (error) throw error;

            Toast.success('Telemetry point deleted');
            await this.loadTelemetry();
        } catch (err) {
            console.error(err);
            Toast.error('Failed to delete reading: ' + err.message);
        }
    }
};
