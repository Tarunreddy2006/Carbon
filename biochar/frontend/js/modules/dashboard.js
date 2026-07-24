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
                        <span class="kpi-card-label">Active Projects</span>
                        <span class="kpi-card-icon">📁</span>
                    </div>
                    <div class="kpi-card-value" id="kpi-projects">—</div>
                    <small>Total tracked project sites</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Feedstock Processed</span>
                        <span class="kpi-card-icon">🌾</span>
                    </div>
                    <div class="kpi-card-value" id="kpi-feedstock">—</div>
                    <small>Wet mass biomass feedstock</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Biochar Produced</span>
                        <span class="kpi-card-icon">🔥</span>
                    </div>
                    <div class="kpi-card-value" id="kpi-biochar">—</div>
                    <small>Total certified biochar volume</small>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card-header">
                        <span class="kpi-card-label">Carbon Sequestration</span>
                        <span class="kpi-card-icon">🌿</span>
                    </div>
                    <div class="kpi-card-value" id="kpi-carbon">—</div>
                    <small>Net carbon dioxide removal</small>
                </div>
            </div>

            <!-- Charts & Lists -->
            <div class="charts-grid animate-fade-up" style="margin-bottom: var(--space-6);">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Production Status</h3>
                    </div>
                    <div class="chart-container">
                        <canvas id="chart-status"></canvas>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Monthly Carbon Sequestration</h3>
                    </div>
                    <div class="chart-container">
                        <canvas id="chart-monthly"></canvas>
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

        // 1. Query Projects
        try {
            const { data, error } = await supabase.from('projects').select('id, name');
            if (!error && data) projects = data;
        } catch (e) {
            console.warn('[DashboardModule] Projects query warning:', e);
        }

        const kpiProjectsEl = document.getElementById('kpi-projects');
        if (kpiProjectsEl) kpiProjectsEl.textContent = projects.length;

        // 2. Query Feedstock Batches
        try {
            const { data, error } = await supabase.from('feedstock_batches').select('weight_kg');
            if (!error && data) feedstock = data;
        } catch (e) {
            console.warn('[DashboardModule] Feedstock query warning:', e);
        }

        const totalFeedstock = feedstock.reduce((acc, row) => acc + ((row.weight_kg || 0) / 1000.0), 0);
        const kpiFeedstockEl = document.getElementById('kpi-feedstock');
        if (kpiFeedstockEl) kpiFeedstockEl.textContent = Utils.formatTons(totalFeedstock);

        // 3. Query Biochar Batches
        try {
            const { data, error } = await supabase
                .from('biochar_batches')
                .select('id, status, net_sequestration_tco2e, created_at, batch_code, pyrolysis_runs(feedstock_batches(project_id))');
            if (!error && data) batches = data;
        } catch (e) {
            console.warn('[DashboardModule] Batches query warning:', e);
        }

        const totalBiochar = batches.filter(b => b && (b.status === 'completed' || b.status === 'lab_certified')).length;
        const totalCarbon = batches.reduce((acc, row) => acc + ((row && row.net_sequestration_tco2e) || 0), 0);

        const kpiBiocharEl = document.getElementById('kpi-biochar');
        if (kpiBiocharEl) kpiBiocharEl.textContent = `${totalBiochar} batches`;

        const kpiCarbonEl = document.getElementById('kpi-carbon');
        if (kpiCarbonEl) kpiCarbonEl.textContent = Utils.formatCO2(totalCarbon);

        // Render Charts & Activity
        try {
            DashboardModule.renderCharts(batches);
        } catch (chartErr) {
            console.warn('[DashboardModule] Chart render error:', chartErr);
        }

        try {
            DashboardModule.renderRecentActivity(batches, projects);
        } catch (activityErr) {
            console.warn('[DashboardModule] Activity render error:', activityErr);
        }
    },

    renderCharts(batches) {
        // Status Chart (Doughnut)
        const statusCtx = document.getElementById('chart-status').getContext('2d');
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

        const theme = Theme.current();
        const textColors = theme === 'dark' ? '#94a3b8' : '#475569';
        const borderColors = theme === 'dark' ? '#0f172a' : '#ffffff';

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

        // Monthly Sequestration Chart (Bar)
        const monthlyCtx = document.getElementById('chart-monthly').getContext('2d');
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
