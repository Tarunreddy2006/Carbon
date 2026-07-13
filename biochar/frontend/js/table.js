// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Reusable Data Table Engine
// ═══════════════════════════════════════════════════════════════════════════

const DataTable = {
    /**
     * Render a data table into a container.
     *
     * @param {HTMLElement} container - DOM element to render into.
     * @param {object} config - Table configuration:
     *   {
     *     columns: [{ key, label, sortable, render, width }],
     *     data: [],
     *     pageSize: 20,
     *     searchable: true,
     *     searchPlaceholder: 'Search...',
     *     exportable: true,
     *     exportFilename: 'export.csv',
     *     onRowClick: (row) => {},
     *     actions: (row) => html_string,
     *     emptyTitle: 'No data found',
     *     emptyText: 'Create your first record to get started.',
     *     emptyIcon: '📋',
     *   }
     */
    render(container, config) {
        const state = {
            data: config.data || [],
            filtered: config.data || [],
            page: 1,
            pageSize: config.pageSize || CARBONOS_CONFIG.DEFAULT_PAGE_SIZE,
            sortKey: null,
            sortDir: 'asc',
            search: '',
        };

        const renderTable = () => {
            // Apply search filter
            if (state.search) {
                const q = state.search.toLowerCase();
                state.filtered = state.data.filter(row =>
                    config.columns.some(col => {
                        const val = row[col.key];
                        return val && String(val).toLowerCase().includes(q);
                    })
                );
            } else {
                state.filtered = [...state.data];
            }

            // Apply sort
            if (state.sortKey) {
                state.filtered.sort((a, b) => {
                    let va = a[state.sortKey] ?? '';
                    let vb = b[state.sortKey] ?? '';
                    if (typeof va === 'string') va = va.toLowerCase();
                    if (typeof vb === 'string') vb = vb.toLowerCase();
                    if (va < vb) return state.sortDir === 'asc' ? -1 : 1;
                    if (va > vb) return state.sortDir === 'asc' ? 1 : -1;
                    return 0;
                });
            }

            // Paginate
            const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
            if (state.page > totalPages) state.page = totalPages;
            const start = (state.page - 1) * state.pageSize;
            const pageData = state.filtered.slice(start, start + state.pageSize);

            // Build HTML
            let html = `<div class="data-table-wrapper">`;

            // Toolbar
            html += `<div class="data-table-toolbar">`;
            if (config.searchable !== false) {
                html += `
                    <div class="data-table-search">
                        <svg class="data-table-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input type="text" class="data-table-search-input" placeholder="${config.searchPlaceholder || 'Search...'}" value="${Utils.escapeHtml(state.search)}" />
                    </div>
                `;
            }
            html += `<div class="data-table-toolbar-right">`;
            html += `<span class="data-table-count">${state.filtered.length} record${state.filtered.length !== 1 ? 's' : ''}</span>`;
            if (config.exportable !== false && state.data.length > 0) {
                html += `<button class="btn btn-ghost btn-sm data-table-export-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export
                </button>`;
            }
            html += `</div></div>`;

            // Table
            if (pageData.length === 0) {
                html += `
                    <div class="empty-state">
                        <div class="empty-state-icon">${config.emptyIcon || '📋'}</div>
                        <h3 class="empty-state-title">${config.emptyTitle || 'No data found'}</h3>
                        <p class="empty-state-text">${config.emptyText || (state.search ? 'Try a different search term.' : 'Create your first record to get started.')}</p>
                    </div>
                `;
            } else {
                html += `<div class="data-table-scroll"><table class="data-table">`;

                // Header
                html += `<thead><tr>`;
                for (const col of config.columns) {
                    const sortable = col.sortable !== false;
                    const isActive = state.sortKey === col.key;
                    const sortIcon = isActive
                        ? (state.sortDir === 'asc' ? '↑' : '↓')
                        : '';
                    html += `<th class="${sortable ? 'sortable' : ''} ${isActive ? 'sorted' : ''}" data-key="${col.key}" ${col.width ? `style="width:${col.width}"` : ''}>
                        <span>${Utils.escapeHtml(col.label)}</span>
                        ${sortable ? `<span class="sort-indicator">${sortIcon}</span>` : ''}
                    </th>`;
                }
                if (config.actions) {
                    html += `<th style="width:50px"></th>`;
                }
                html += `</tr></thead>`;

                // Body
                html += `<tbody>`;
                for (const row of pageData) {
                    const clickable = config.onRowClick ? 'data-table-row-clickable' : '';
                    html += `<tr class="${clickable}">`;
                    for (const col of config.columns) {
                        const val = col.render ? col.render(row[col.key], row) : Utils.escapeHtml(row[col.key] ?? '—');
                        html += `<td>${val}</td>`;
                    }
                    if (config.actions) {
                        html += `<td class="data-table-actions-cell">${config.actions(row)}</td>`;
                    }
                    html += `</tr>`;
                }
                html += `</tbody></table></div>`;
            }

            // Pagination
            if (totalPages > 1) {
                html += `<div class="data-table-pagination">`;
                html += `<span class="data-table-pagination-info">Page ${state.page} of ${totalPages}</span>`;
                html += `<div class="data-table-pagination-btns">`;
                html += `<button class="btn btn-ghost btn-sm pagination-prev" ${state.page <= 1 ? 'disabled' : ''}>← Prev</button>`;
                html += `<button class="btn btn-ghost btn-sm pagination-next" ${state.page >= totalPages ? 'disabled' : ''}>Next →</button>`;
                html += `</div></div>`;
            }

            html += `</div>`;
            container.innerHTML = html;

            // Event listeners
            const searchInput = container.querySelector('.data-table-search-input');
            if (searchInput) {
                searchInput.addEventListener('input', Utils.debounce((e) => {
                    state.search = e.target.value;
                    state.page = 1;
                    renderTable();
                }, 250));
                // Preserve focus
                searchInput.focus();
                searchInput.selectionStart = searchInput.value.length;
            }

            // Sort
            container.querySelectorAll('th.sortable').forEach(th => {
                th.addEventListener('click', () => {
                    const key = th.dataset.key;
                    if (state.sortKey === key) {
                        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
                    } else {
                        state.sortKey = key;
                        state.sortDir = 'asc';
                    }
                    renderTable();
                });
            });

            // Pagination
            const prevBtn = container.querySelector('.pagination-prev');
            const nextBtn = container.querySelector('.pagination-next');
            if (prevBtn) prevBtn.addEventListener('click', () => { state.page--; renderTable(); });
            if (nextBtn) nextBtn.addEventListener('click', () => { state.page++; renderTable(); });

            // Export
            const exportBtn = container.querySelector('.data-table-export-btn');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    const exportData = state.filtered.map(row => {
                        const obj = {};
                        config.columns.forEach(col => { obj[col.label] = row[col.key] ?? ''; });
                        return obj;
                    });
                    Utils.downloadCSV(exportData, config.exportFilename || 'export.csv');
                    Toast.success('CSV exported successfully');
                });
            }

            // Row click
            if (config.onRowClick) {
                container.querySelectorAll('.data-table-row-clickable').forEach((tr, i) => {
                    tr.addEventListener('click', (e) => {
                        if (e.target.closest('.data-table-actions-cell') || e.target.closest('button')) return;
                        config.onRowClick(pageData[i]);
                    });
                });
            }
        };

        renderTable();

        // Return API for external updates
        return {
            refresh(newData) {
                state.data = newData;
                state.page = 1;
                renderTable();
            },
        };
    },
};

if (typeof window !== 'undefined') {
    window.Table = Table;
}
