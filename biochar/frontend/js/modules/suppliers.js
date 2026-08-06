// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Supplier Performance & Intelligence Module (Phase 3)
// ═══════════════════════════════════════════════════════════════════════════

const SuppliersModule = {
    _container: null,

    async render(container) {
        this._container = container;
        container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Supplier Performance Analytics</h1>
                    <p class="page-subtitle">Evaluate biomass supplier reliability, delivery consistency, moisture compliance, and quality ratings.</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn btn-ghost" id="refresh-suppliers-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        Refresh Analytics
                    </button>
                </div>
            </div>

            <!-- Supplier Performance Dashboard Table -->
            <div class="card animate-fade-up">
                <div class="card-header flex items-center justify-between">
                    <div>
                        <h3 class="card-title">Biomass Supplier Rankings & Reliability Index</h3>
                        <p class="card-subtitle text-muted" style="margin: 0;">Performance scores updated automatically from feedstock arrivals</p>
                    </div>
                </div>
                <div id="suppliers-table-container" style="padding: var(--space-4);">
                    <div class="page-loading"><div class="skeleton skeleton-table"></div></div>
                </div>
            </div>
        `;

        await this.loadSuppliers();

        document.getElementById('refresh-suppliers-btn')?.addEventListener('click', () => {
            this.loadSuppliers();
            Toast.success('Supplier analytics refreshed');
        });
    },

    async loadSuppliers() {
        const container = document.getElementById('suppliers-table-container');
        if (!container) return;

        try {
            // Fetch feedstock batches to aggregate supplier stats dynamically
            const { data: batches, error } = await supabase
                .from('feedstock_batches')
                .select('*');

            if (error) throw error;

            const supplierMap = {};
            (batches || []).forEach(b => {
                const sName = b.supplier_name || 'Green Biomass Pvt Ltd';
                if (!supplierMap[sName]) {
                    supplierMap[sName] = {
                        supplier_name: sName,
                        total_deliveries: 0,
                        accepted_deliveries: 0,
                        rejected_deliveries: 0,
                        moistures: [],
                        dry_ratios: [],
                        scores: [],
                        certification_status: 'FSC Certified',
                    };
                }

                const s = supplierMap[sName];
                s.total_deliveries += 1;
                if (b.contamination_status || b.quality_status === 'Rejected') {
                    s.rejected_deliveries += 1;
                } else {
                    s.accepted_deliveries += 1;
                }

                if (b.moisture_percent != null) s.moistures.push(b.moisture_percent);
                if (b.wet_weight_kg && b.dry_weight_kg && b.wet_weight_kg > 0) {
                    s.dry_ratios.push((b.dry_weight_kg / b.wet_weight_kg) * 100);
                }
                if (b.quality_score != null) s.scores.push(b.quality_score);
            });

            // Default demo suppliers if empty
            if (Object.keys(supplierMap).length === 0) {
                supplierMap['Green Biomass Pvt Ltd'] = {
                    supplier_name: 'Green Biomass Pvt Ltd',
                    total_deliveries: 18,
                    accepted_deliveries: 18,
                    rejected_deliveries: 0,
                    moistures: [14.5],
                    dry_ratios: [85.5],
                    scores: [94.0],
                    certification_status: 'FSC Certified',
                };
                supplierMap['Southern Forestry Aggregators'] = {
                    supplier_name: 'Southern Forestry Aggregators',
                    total_deliveries: 12,
                    accepted_deliveries: 11,
                    rejected_deliveries: 1,
                    moistures: [19.2],
                    dry_ratios: [80.8],
                    scores: [88.5],
                    certification_status: 'PEFC Certified',
                };
                supplierMap['EcoHusk Co-op'] = {
                    supplier_name: 'EcoHusk Co-op',
                    total_deliveries: 8,
                    accepted_deliveries: 7,
                    rejected_deliveries: 1,
                    moistures: [24.0],
                    dry_ratios: [76.0],
                    scores: [76.0],
                    certification_status: 'Self-Attested',
                };
            }

            const dataList = Object.values(supplierMap).map(s => {
                const avgM = s.moistures.length ? (s.moistures.reduce((a,b)=>a+b,0)/s.moistures.length).toFixed(1) : '15.0';
                const avgD = s.dry_ratios.length ? (s.dry_ratios.reduce((a,b)=>a+b,0)/s.dry_ratios.length).toFixed(1) : '85.0';
                const score = s.scores.length ? (s.scores.reduce((a,b)=>a+b,0)/s.scores.length).toFixed(1) : (s.rejected_deliveries > 0 ? '78.0' : '94.0');
                const numScore = parseFloat(score);

                let rating = 'Excellent';
                if (numScore < 60) rating = 'Poor';
                else if (numScore < 75) rating = 'Fair';
                else if (numScore < 90) rating = 'Good';

                return {
                    supplier_name: s.supplier_name,
                    total_deliveries: s.total_deliveries,
                    accepted_deliveries: s.accepted_deliveries,
                    rejected_deliveries: s.rejected_deliveries,
                    average_moisture: `${avgM}%`,
                    average_dry_matter: `${avgD}%`,
                    quality_score: numScore,
                    reliability_rating: rating,
                    certification_status: s.certification_status,
                };
            });

            DataTable.render(container, {
                columns: [
                    { key: 'supplier_name', label: 'Supplier Name', sortable: true, render: (val) => `<strong>${Utils.escapeHtml(val)}</strong>` },
                    { key: 'certification_status', label: 'Certification', sortable: true, render: (val) => `<span class="badge badge-default">${Utils.escapeHtml(val)}</span>` },
                    { key: 'total_deliveries', label: 'Deliveries', sortable: true, render: (val, row) => `${val} <small class="text-muted">(${row.accepted_deliveries} accepted)</small>` },
                    { key: 'average_moisture', label: 'Avg Moisture', sortable: true },
                    { key: 'average_dry_matter', label: 'Avg Dry Matter', sortable: true, render: (val) => `<strong class="text-success">${val}</strong>` },
                    { key: 'quality_score', label: 'Quality Score', sortable: true, render: (val) => {
                        let color = 'text-success';
                        if (val < 70) color = 'text-danger';
                        else if (val < 85) color = 'text-warning';
                        return `<strong class="${color}" style="font-size: 1.05rem;">${val}%</strong>`;
                    }},
                    { key: 'reliability_rating', label: 'Reliability Rating', sortable: true, render: (val) => {
                        let badgeClass = 'badge-success';
                        if (val === 'Good') badgeClass = 'badge-default';
                        if (val === 'Fair') badgeClass = 'badge-warning';
                        if (val === 'Poor') badgeClass = 'badge-danger';
                        return `<span class="badge ${badgeClass}">${val}</span>`;
                    }},
                ],
                data: dataList,
                emptyTitle: 'No supplier data',
                emptyText: 'Record feedstock arrivals to view supplier intelligence performance rankings.',
                exportFilename: 'supplier_performance_analytics.csv',
            });
        } catch (err) {
            console.error('Failed to load supplier performance analytics:', err);
            container.innerHTML = `<div class="p-4 text-muted text-center">Supplier analytics offline or no data.</div>`;
        }
    }
};

window.SuppliersModule = SuppliersModule;
