// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Dashboard Module
// ═══════════════════════════════════════════════════════════════════════════

const DashboardModule = {
    async render(container) {
        container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Executive Dashboard</h1>
                    <p class="page-subtitle">Real-time overview of biochar production and carbon removal operations.</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn btn-ghost" id="refresh-dashboard-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        Refresh
                    </button>
                    <button class="btn btn-primary" onclick="Router.navigate('/batches')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        New Batch
                    </button>
                </div>
            </div>

            <!-- KPI Cards -->
            <div class="kpi-grid animate-fade-up">
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Total Wet Biomass</span>
                        <span class="kpi-card-icon">🌾</span>
                    </div>
                    <div class="kpi-card-value" id="kpi-wet-biomass">—</div>
                    <small>Gross wet feedstock delivered</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Total Dry Biomass</span>
                        <span class="kpi-card-icon">☀️</span>
                    </div>
                    <div class="kpi-card-value" id="kpi-dry-biomass">—</div>
                    <small>Dry matter (moisture adjusted)</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Average Moisture</span>
                        <span class="kpi-card-icon">💧</span>
                    </div>
                    <div class="kpi-card-value" id="kpi-avg-moisture">—</div>
                    <small>Biomass moisture content %</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Biochar Produced</span>
                        <span class="kpi-card-icon">🔥</span>
                    </div>
                    <div class="kpi-card-value" id="kpi-biochar-produced">—</div>
                    <small>Certified biochar mass</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Average Yield</span>
                        <span class="kpi-card-icon">⚖️</span>
                    </div>
                    <div class="kpi-card-value" id="kpi-avg-yield">—</div>
                    <small>Production yield % (dry basis)</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Active Anomalies</span>
                        <span class="kpi-card-icon">⚠️</span>
                    </div>
                    <div class="kpi-card-value text-danger" id="kpi-active-anomalies">—</div>
                    <small>Unresolved mass balance alerts</small>
                </div>
            </div>

            <!-- Charts & Alerts Grid -->
            <div class="charts-grid animate-fade-up" style="margin-bottom: var(--space-6);">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Biochar Yield Trend (%)</h3>
                    </div>
                    <div class="chart-container">
                        <canvas id="chart-yield-trend"></canvas>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Production Lifecycle Status</h3>
                    </div>
                    <div class="chart-container">
                        <canvas id="chart-status"></canvas>
                    </div>
                </div>
            </div>

            <!-- Operational Alerts Panel -->
            <div class="card animate-fade-up" style="margin-bottom: var(--space-6);">
                <div class="card-header" style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <h3 class="card-title">Operational Alerts Panel</h3>
                        <p class="card-subtitle text-muted" style="margin: 0;">Active mass balance warnings and threshold flags requiring action</p>
                    </div>
                    <span class="badge badge-warning" id="alerts-badge">0 Alerts</span>
                </div>
                <div id="operational-alerts-container" style="padding: var(--space-4);">
                    <div class="page-loading">
                        <div class="skeleton" style="height: 60px; margin-bottom: var(--space-2);"></div>
                        <div class="skeleton" style="height: 60px;"></div>
                    </div>
                </div>
            </div>

            <!-- Recent Activity -->
            <div class="card animate-fade-up">
                <div class="card-header">
                    <h3 class="card-title">Recent Pipeline Activity</h3>
                </div>
                <div id="recent-activity-container">
                    <div class="page-loading">
                        <div class="skeleton" style="height: 50px; margin-bottom: var(--space-2);"></div>
                        <div class="skeleton" style="height: 50px; margin-bottom: var(--space-2);"></div>
                        <div class="skeleton" style="height: 50px;"></div>
                    </div>
                </div>
            </div>
        `;

        // Setup connectivity auto-refresh listener once
        if (!this._connectivityListenerBound) {
            window.addEventListener('connectivity-change', (e) => {
                if (e.detail?.isOnline && document.getElementById('kpi-projects')) {
                    DashboardModule.loadData();
                }
            });
            this._connectivityListenerBound = true;
        }

        // Load data
        await DashboardModule.loadData();

        // Refresh button
        const refreshBtn = document.getElementById('refresh-dashboard-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.classList.add('loading');
                await DashboardModule.loadData();
                btn.classList.remove('loading');
                if (typeof Toast !== 'undefined') Toast.success('Dashboard data refreshed');
            });
        }
    },

    async loadData() {
        let projects = [];
        let feedstock = [];
        let batches = [];
        let alerts = [];

        // 1. Fetch Feedstock Batches
        try {
            const { data, error } = await OfflineStorage.fetchWithCache('feedstock_batches', () => 
                supabase.from('feedstock_batches').select('id, weight_kg, wet_weight_kg, dry_weight_kg, water_weight_kg, moisture_percent')
            );
            if (!error && data) feedstock = data;
        } catch (e) {
            console.warn('[DashboardModule] Feedstock query warning:', e);
        }

        // 2. Fetch Biochar Batches
        try {
            const { data, error } = await OfflineStorage.fetchWithCache('biochar_batches', () =>
                supabase
                    .from('biochar_batches')
                    .select('id, status, weight_kg, produced_weight_kg, calculated_yield_percent, mass_balance_status, anomaly_status, created_at, batch_code, pyrolysis_runs(feedstock_batches(project_id))')
            );
            if (!error && data) batches = data;
        } catch (e) {
            console.warn('[DashboardModule] Batches query warning:', e);
        }

        // 3. Fetch Operational Alerts / Anomalies
        try {
            const { data, error } = await supabase.from('mass_balance_anomalies').select('*').eq('status', 'Active').order('created_at', { ascending: false });
            if (!error && data) alerts = data;
        } catch (e) {
            console.warn('[DashboardModule] Alerts query warning:', e);
        }

        // 4. Calculate Mass Balance KPIs
        const totalWetKg = feedstock.reduce((acc, row) => acc + (row.wet_weight_kg || row.weight_kg || 0), 0);
        const totalDryKg = feedstock.reduce((acc, row) => {
            const wet = row.wet_weight_kg || row.weight_kg || 0;
            const moist = row.moisture_percent != null ? row.moisture_percent : 0;
            const dry = row.dry_weight_kg != null ? row.dry_weight_kg : wet * (1 - moist / 100);
            return acc + dry;
        }, 0);

        const moistures = feedstock.map(f => f.moisture_percent).filter(m => m != null);
        const avgMoisture = moistures.length ? (moistures.reduce((a, b) => a + b, 0) / moistures.length) : 0;

        const totalProducedKg = batches.reduce((acc, row) => acc + (row.produced_weight_kg || row.weight_kg || 0), 0);
        const yields = batches.map(b => b.calculated_yield_percent).filter(y => y != null);
        const avgYield = yields.length ? (yields.reduce((a, b) => a + b, 0) / yields.length) : 0;

        // Update KPI DOM elements
        const wetEl = document.getElementById('kpi-wet-biomass');
        if (wetEl) wetEl.textContent = Utils.formatTons(totalWetKg / 1000);

        const dryEl = document.getElementById('kpi-dry-biomass');
        if (dryEl) dryEl.textContent = Utils.formatTons(totalDryKg / 1000);

        const moistEl = document.getElementById('kpi-avg-moisture');
        if (moistEl) moistEl.textContent = `${avgMoisture.toFixed(1)}%`;

        const biocharEl = document.getElementById('kpi-biochar-produced');
        if (biocharEl) biocharEl.textContent = Utils.formatTons(totalProducedKg / 1000);

        const yieldEl = document.getElementById('kpi-avg-yield');
        if (yieldEl) yieldEl.textContent = `${avgYield.toFixed(1)}%`;

        const alertsEl = document.getElementById('kpi-active-anomalies');
        if (alertsEl) alertsEl.textContent = alerts.length;

        const badgeEl = document.getElementById('alerts-badge');
        if (badgeEl) badgeEl.textContent = `${alerts.length} Active Alert${alerts.length === 1 ? '' : 's'}`;

        // Render Yield Trend & Production Status Charts
        try {
            DashboardModule.renderCharts(batches);
        } catch (chartErr) {
            console.warn('[DashboardModule] Chart render error:', chartErr);
        }

        // Render Operational Alerts Panel
        try {
            DashboardModule.renderOperationalAlerts(alerts);
        } catch (alertErr) {
            console.warn('[DashboardModule] Alerts render error:', alertErr);
        }

        // Render Recent Activity
        try {
            DashboardModule.renderRecentActivity(batches, projects);
        } catch (activityErr) {
            console.warn('[DashboardModule] Activity render error:', activityErr);
        }
    },

    renderCharts(batches) {
        const theme = Theme.current();
        const textColors = theme === 'dark' ? '#94a3b8' : '#475569';
        const borderColors = theme === 'dark' ? '#0f172a' : '#ffffff';

        // 1. Yield Trend Line Chart
        const yieldCtx = document.getElementById('chart-yield-trend')?.getContext('2d');
        if (yieldCtx) {
            const sortedBatches = [...batches]
                .filter(b => b.created_at)
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                .slice(-15);

            const labels = sortedBatches.map(b => b.batch_code || 'Lot');
            const dataYields = sortedBatches.map(b => b.calculated_yield_percent != null ? b.calculated_yield_percent : 28.5);

            if (window.myYieldChart) window.myYieldChart.destroy();

            window.myYieldChart = new Chart(yieldCtx, {
                type: 'line',
                data: {
                    labels: labels.length ? labels : ['Sample Lot'],
                    datasets: [
                        {
                            label: 'Actual Yield %',
                            data: dataYields.length ? dataYields : [30],
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            fill: true,
                            tension: 0.3,
                            pointRadius: 4,
                        },
                        {
                            label: 'Min Threshold (15%)',
                            data: Array(labels.length || 1).fill(15.0),
                            borderColor: '#ef4444',
                            borderDash: [5, 5],
                            pointRadius: 0,
                            fill: false,
                        },
                        {
                            label: 'Max Threshold (50%)',
                            data: Array(labels.length || 1).fill(50.0),
                            borderColor: '#f59e0b',
                            borderDash: [5, 5],
                            pointRadius: 0,
                            fill: false,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { grid: { display: false }, ticks: { color: textColors } },
                        y: { grid: { color: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }, ticks: { color: textColors }, min: 0, max: 60 }
                    }
                }
            });
        }

        // 2. Production Status Doughnut Chart
        const statusCtx = document.getElementById('chart-status')?.getContext('2d');
        if (statusCtx) {
            const statusCounts = {
                sourcing_purgatory: 0,
                processing_active: 0,
                lab_certified: 0,
                completed: 0,
                ineligible: 0,
            };

            batches.forEach(b => {
                if (statusCounts[b.status] !== undefined) {
                    statusCounts[b.status]++;
                }
            });

            if (window.myStatusChart) window.myStatusChart.destroy();

            window.myStatusChart = new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Sourcing', 'Active Processing', 'Lab Certified', 'Completed', 'Ineligible'],
                    datasets: [{
                        data: [
                            statusCounts.sourcing_purgatory,
                            statusCounts.processing_active,
                            statusCounts.lab_certified,
                            statusCounts.completed,
                            statusCounts.ineligible
                        ],
                        backgroundColor: ['#f59e0b', '#0ea5e9', '#8b5cf6', '#10b981', '#ef4444'],
                        borderColor: borderColors,
                        borderWidth: 2,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { color: textColors, font: { family: 'Inter', size: 12 } }
                        }
                    }
                }
            });
        }

        // 3. Monthly Sequestration Chart (Bar)
        const monthlyCtx = document.getElementById('chart-monthly')?.getContext('2d');
        if (monthlyCtx) {
            const monthlyData = {};

            batches.forEach(b => {
                if (!b.created_at || b.status !== 'completed') return;
                const date = new Date(b.created_at);
                const key = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
                monthlyData[key] = (monthlyData[key] || 0) + (b.net_sequestration_tco2e || 0);
            });

            const sortedMonths = Object.keys(monthlyData).sort((a, b) => new Date(a) - new Date(b)).slice(-6);
            const sortedValues = sortedMonths.map(m => monthlyData[m]);

            if (window.myMonthlyChart) window.myMonthlyChart.destroy();

            window.myMonthlyChart = new Chart(monthlyCtx, {
                type: 'bar',
                data: {
                    labels: sortedMonths.length ? sortedMonths : ['No Data'],
                    datasets: [{
                        label: 'tCO2e Sequestered',
                        data: sortedValues.length ? sortedValues : [0],
                        backgroundColor: 'rgba(56, 189, 248, 0.45)',
                        borderColor: '#38bdf8',
                        borderWidth: 1.5,
                        borderRadius: 4,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: textColors } },
                        y: { grid: { color: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }, ticks: { color: textColors } }
                    }
                }
            });
        }
    },

    renderOperationalAlerts(alerts) {
        const container = document.getElementById('operational-alerts-container');
        if (!container) return;

        if (!alerts || alerts.length === 0) {
            container.innerHTML = `
                <div class="p-4 text-center rounded" style="background: rgba(16, 185, 129, 0.08); border: 1px dashed rgba(16, 185, 129, 0.3);">
                    <div style="font-size: 1.5rem; margin-bottom: 4px;">✅</div>
                    <strong class="text-success">System Mass Balance Operating Normally</strong>
                    <div class="text-muted" style="font-size: 0.85rem;">No active anomalies detected across feedstock deliveries or biochar batches.</div>
                </div>
            `;
            return;
        }

        let html = '<div class="flex flex-col gap-3">';
        alerts.forEach(a => {
            let sevClass = 'badge-warning';
            if (a.severity === 'Critical') sevClass = 'badge-danger';
            if (a.severity === 'High') sevClass = 'badge-danger';

            const timeAgo = Utils.timeAgo(a.created_at);

            html += `
                <div class="p-3 border rounded border-secondary bg-input flex items-center justify-between" id="alert-card-${a.id}">
                    <div class="flex items-start gap-3">
                        <span style="font-size: 1.25rem;">⚠️</span>
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="badge ${sevClass}">${a.severity || 'Anomaly'}</span>
                                <strong style="font-size: 0.9rem;">${Utils.escapeHtml(a.category || 'Mass Balance Alert')}</strong>
                                <small class="text-muted">• ${timeAgo}</small>
                            </div>
                            <div style="font-size: 0.85rem; color: var(--color-text-muted);">${Utils.escapeHtml(a.human_readable_explanation)}</div>
                        </div>
                    </div>
                    <div>
                        <button class="btn btn-ghost" style="font-size: 0.8rem; padding: 4px 10px;" onclick="DashboardModule.resolveAlert('${a.id}')">
                            Resolve
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    },

    async resolveAlert(alertId) {
        try {
            const { error } = await supabase
                .from('mass_balance_anomalies')
                .update({ status: 'Resolved', resolved_at: new Date().toISOString() })
                .eq('id', alertId);

            if (error) throw error;

            Toast.success('Operational alert resolved successfully');
            await DashboardModule.loadData();
        } catch (err) {
            console.error('Failed to resolve alert:', err);
            Toast.error('Failed to resolve alert: ' + err.message);
        }
    },

    renderRecentActivity(batches, projects) {
        const container = document.getElementById('recent-activity-container');
        if (!container) return;

        const sortedActivities = [...batches]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5);

        if (sortedActivities.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 text-muted">
                    No recent activity. Create a batch to see updates here.
                </div>
            `;
            return;
        }

        const projectMap = {};
        projects.forEach(p => { projectMap[p.id] = p.name; });

        let html = '<div class="flex flex-col gap-3">';
        sortedActivities.forEach(act => {
            const dateStr = Utils.timeAgo(act.created_at);
            const projectId = act.pyrolysis_runs?.feedstock_batches?.project_id;
            const projName = projectMap[projectId] || 'Unknown Project';

            let statusBadgeClass = 'badge-default';
            if (act.status === 'completed') statusBadgeClass = 'badge-success';
            if (act.status === 'processing_active') statusBadgeClass = 'badge-primary';
            if (act.status === 'lab_certified') statusBadgeClass = 'badge-primary';
            if (act.status === 'sourcing_purgatory') statusBadgeClass = 'badge-warning';
            if (act.status === 'ineligible') statusBadgeClass = 'badge-danger';

            html += `
                <div class="flex items-center justify-between p-3 border rounded border-secondary bg-input">
                    <div class="flex items-center gap-3">
                        <span style="font-size: 1.2rem;">📦</span>
                        <div>
                            <div class="font-medium text-primary">Batch Lot #${Utils.escapeHtml(act.batch_code)}</div>
                            <small>${Utils.escapeHtml(projName)} • ${dateStr}</small>
                        </div>
                    </div>
                    <div>
                        <span class="badge ${statusBadgeClass}">${Utils.formatEnum(act.status)}</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }
};

if (typeof window !== 'undefined') {
    window.DashboardModule = DashboardModule;
}
