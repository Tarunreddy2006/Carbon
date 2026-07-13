// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Projects Module (CRUD)
// ═══════════════════════════════════════════════════════════════════════════

const ProjectsModule = {
    _container: null,
    _table: null,

    async render(container) {
        this._container = container;
        container.innerHTML = `
            <div class="page-header animate-fade-in">
                <div class="page-header-left">
                    <h1 class="page-title">Projects</h1>
                    <p class="page-subtitle">Manage project sites, locations, and trace feedstock batches.</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn btn-primary" id="create-project-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        Add Project
                    </button>
                </div>
            </div>

            <div class="card animate-fade-up">
                <div id="projects-table-container">
                    <div class="page-loading">
                        <div class="skeleton skeleton-table"></div>
                    </div>
                </div>
            </div>
        `;

        // Load and render table
        await this.loadProjects();

        // Create button handler
        document.getElementById('create-project-btn').addEventListener('click', () => this.openProjectModal());
    },

    async loadProjects() {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('*, biochar_batches(id)')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const container = document.getElementById('projects-table-container');
            if (!container) return;

            // Map batch counts
            const mappedData = data.map(p => ({
                ...p,
                batch_count: p.biochar_batches ? p.biochar_batches.length : 0
            }));

            this._table = DataTable.render(container, {
                columns: [
                    { key: 'name', label: 'Project Name', sortable: true },
                    { key: 'batch_count', label: 'Batches Count', sortable: true, render: (val) => `<span class="badge badge-primary">${val} batch${val !== 1 ? 'es' : ''}</span>` },
                    { key: 'created_at', label: 'Created At', sortable: true, render: (val) => Utils.formatDateTime(val) },
                    { key: 'updated_at', label: 'Updated At', sortable: true, render: (val) => Utils.formatDateTime(val) },
                ],
                data: mappedData,
                emptyTitle: 'No projects registered',
                emptyText: 'Create your first project site to begin pipeline tracking.',
                exportFilename: 'projects_export.csv',
                actions: (row) => `
                    <div class="action-menu">
                        <button class="action-menu-btn" onclick="ProjectsModule.toggleMenu(event, '${row.id}')">•••</button>
                        <div class="action-menu-dropdown" id="dropdown-${row.id}">
                            <button class="action-menu-item" onclick="ProjectsModule.openProjectModal('${row.id}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                Edit Project
                            </button>
                            <button class="action-menu-item danger" onclick="ProjectsModule.deleteProject('${row.id}', '${Utils.escapeHtml(row.name)}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                Delete
                            </button>
                        </div>
                    </div>
                `
            });
        } catch (err) {
            console.error('Failed to load projects:', err);
            Toast.error('Failed to load projects: ' + err.message);
        }
    },

    toggleMenu(e, id) {
        e.stopPropagation();
        const dropdown = document.getElementById(`dropdown-${id}`);
        const wasOpen = dropdown.classList.contains('open');

        // Close all dropdowns
        document.querySelectorAll('.action-menu-dropdown').forEach(d => d.classList.remove('open'));

        if (!wasOpen) {
            dropdown.classList.add('open');
            // Close menu on click elsewhere
            document.addEventListener('click', function closeMenu() {
                dropdown.classList.remove('open');
                document.removeEventListener('click', closeMenu);
            });
        }
    },

    async openProjectModal(projectId = null) {
        let title = 'Add New Project';
        let nameValue = '';
        let orgId = Auth.orgId;

        if (projectId) {
            title = 'Edit Project';
            try {
                const { data, error } = await supabase
                    .from('projects')
                    .select('*')
                    .eq('id', projectId)
                    .single();

                if (error) throw error;
                nameValue = data.name;
            } catch (err) {
                Toast.error('Failed to load project details: ' + err.message);
                return;
            }
        }

        const html = `
            <div class="modal-header">
                <h3 class="modal-title">${title}</h3>
            </div>
            <form id="project-form">
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label" for="project-name">Project Name <span class="required">*</span></label>
                        <input type="text" class="form-input" id="project-name" name="name" value="${Utils.escapeHtml(nameValue)}" data-validate="required" data-label="Project Name" placeholder="e.g. Rice Husk Biochar Facility" />
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-ghost" onclick="Modal.close()">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="save-project-btn">
                        <span class="btn-text">Save Project</span>
                        <span class="btn-spinner"></span>
                    </button>
                </div>
            </form>
        `;

        Modal.open(html, { width: '400px' });

        const form = document.getElementById('project-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const { valid, errors } = FormValidator.validate(form);
            if (!valid) return;

            const saveBtn = document.getElementById('save-project-btn');
            saveBtn.classList.add('loading');
            saveBtn.disabled = true;

            const name = document.getElementById('project-name').value.trim();

            try {
                let error;
                if (projectId) {
                    const { error: err } = await supabase
                        .from('projects')
                        .update({ name, updated_at: new Date().toISOString() })
                        .eq('id', projectId);
                    error = err;
                } else {
                    // Organization ID check
                    const insertPayload = { name };
                    
                    // If the project schema has organization_id, we attach it.
                    // Since it has RLS on org, let's include it.
                    if (orgId) {
                        insertPayload.organization_id = orgId;
                    }

                    const { error: err } = await supabase
                        .from('projects')
                        .insert(insertPayload);
                    error = err;
                }

                if (error) throw error;

                Toast.success(projectId ? 'Project updated successfully' : 'Project added successfully');
                Modal.close();
                await this.loadProjects();
            } catch (err) {
                console.error(err);
                Toast.error('Failed to save project: ' + err.message);
            } finally {
                saveBtn.classList.remove('loading');
                saveBtn.disabled = false;
            }
        });
    },

    async deleteProject(id, name) {
        const confirmed = await Modal.confirm(
            'Delete Project',
            `Are you sure you want to delete "${name}"? This will permanently delete the project and all associated biochar batches. This action cannot be undone.`,
            { confirmText: 'Delete Project', danger: true }
        );

        if (!confirmed) return;

        try {
            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', id);

            if (error) throw error;

            Toast.success(`Project "${name}" deleted successfully`);
            await this.loadProjects();
        } catch (err) {
            console.error(err);
            Toast.error('Failed to delete project: ' + err.message);
        }
    }
};

if (typeof window !== 'undefined') {
    window.ProjectsModule = ProjectsModule;
}
