// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Projects Module (CRUD)
// ═══════════════════════════════════════════════════════════════════════════

const ProjectsModule = {
    _container: null,
    _table: null,

    _isDemoMode() {
        return typeof localStorage !== 'undefined' && localStorage.getItem('stomata_demo_mode') === 'true';
    },

    _getDemoProjects() {
        try {
            const raw = localStorage.getItem('stomata_demo_projects');
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    },

    _saveDemoProjects(projects) {
        localStorage.setItem('stomata_demo_projects', JSON.stringify(projects));
    },

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
            let projectsData = [];

            if (this._isDemoMode()) {
                // Demo mode: load from localStorage
                projectsData = this._getDemoProjects();
            } else {
                // Direct query with fallback for responsive rendering
                const { data: remoteProjects, error: projectsError } = await supabase
                    .from('projects')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (!projectsError && remoteProjects) {
                    projectsData = remoteProjects;
                } else {
                    const { data: cachedProjects } = await OfflineStorage.fetchWithCache('projects', () =>
                        supabase.from('projects').select('*').order('created_at', { ascending: false })
                    );
                    projectsData = cachedProjects || [];
                }
            }

            // Fetch batches to resolve project counts (skip in demo mode)
            const projectBatchCounts = {};
            if (!this._isDemoMode()) {
                const { data: batchesData } = await supabase
                    .from('biochar_batches')
                    .select('id, pyrolysis_runs(feedstock_batches(project_id))');

                if (batchesData) {
                    batchesData.forEach(batch => {
                        const projectId = batch.pyrolysis_runs?.feedstock_batches?.project_id;
                        if (projectId) {
                            projectBatchCounts[projectId] = (projectBatchCounts[projectId] || 0) + 1;
                        }
                    });
                }
            }

            const container = document.getElementById('projects-table-container');
            if (!container) return;

            // Map batch counts
            const mappedData = projectsData.map(p => ({
                ...p,
                batch_count: projectBatchCounts[p.id] || 0
            }));

            this._table = DataTable.render(container, {
                columns: [
                    { key: 'name', label: 'Project Name', sortable: true, render: (val) => `<strong>${Utils.escapeHtml(val || 'Unnamed Project')}</strong>` },
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
        // Demo mode: enforce 1-project-per-device limit for new projects
        if (this._isDemoMode() && !projectId) {
            const existingProjects = this._getDemoProjects();
            if (existingProjects.length >= 1) {
                Toast.error('Demo mode limit: Only 1 project per device is allowed. Delete the existing project to create a new one.');
                return;
            }
        }

        let title = 'Add New Project';
        let nameValue = '';

        if (projectId) {
            title = 'Edit Project';
            if (this._isDemoMode()) {
                const projects = this._getDemoProjects();
                const project = projects.find(p => p.id === projectId);
                if (project) {
                    nameValue = project.name;
                } else {
                    Toast.error('Project not found.');
                    return;
                }
            } else {
                try {
                    const { data, error } = await OfflineStorage.fetchWithCache('projects', () =>
                        supabase
                            .from('projects')
                            .select('*')
                            .eq('id', projectId)
                            .single()
                    , { isSingle: true, id: projectId });

                    if (error) throw error;
                    nameValue = data.name;
                } catch (err) {
                    Toast.error('Failed to load project details: ' + err.message);
                    return;
                }
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
                if (this._isDemoMode()) {
                    // Demo mode: save to localStorage
                    const projects = this._getDemoProjects();

                    if (projectId) {
                        // Edit existing
                        const idx = projects.findIndex(p => p.id === projectId);
                        if (idx !== -1) {
                            projects[idx].name = name;
                            projects[idx].updated_at = new Date().toISOString();
                        }
                    } else {
                        // Create new (already validated limit above)
                        const newProject = {
                            id: crypto.randomUUID(),
                            name: name,
                            organization_id: localStorage.getItem('stomata_active_org_id') || 'demo-org',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        };
                        projects.push(newProject);
                    }

                    this._saveDemoProjects(projects);
                    Toast.success(projectId ? 'Project updated successfully' : 'Project added successfully');
                    Modal.close();
                    await this.loadProjects();
                } else {
                    // Real mode: save to Supabase
                    let error;
                    if (projectId) {
                        const { error: err } = await supabase
                            .from('projects')
                            .update({ name, updated_at: new Date().toISOString() })
                            .eq('id', projectId);
                        error = err;
                    } else {
                        // Resolve organization_id fresh — fully self-contained, no outer-scope dependencies
                        let activeOrgId = null;

                        // Source 1: Auth.orgId (cached profile)
                        if (typeof Auth !== 'undefined' && Auth.orgId) {
                            activeOrgId = Auth.orgId;
                        }

                        // Source 2: Auth.getOrFetchOrgId() (queries DB if needed)
                        if (!activeOrgId && typeof Auth !== 'undefined' && typeof Auth.getOrFetchOrgId === 'function') {
                            try { activeOrgId = await Auth.getOrFetchOrgId(); } catch (e) { console.warn('[ProjectsModule] Auth.getOrFetchOrgId failed:', e); }
                        }

                        // Source 3: getOrganizationId() global helper
                        if (!activeOrgId && typeof getOrganizationId === 'function') {
                            try { activeOrgId = await getOrganizationId(); } catch (e) { console.warn('[ProjectsModule] getOrganizationId failed:', e); }
                        }

                        // Source 4: localStorage
                        if (!activeOrgId && typeof localStorage !== 'undefined') {
                            activeOrgId = localStorage.getItem('stomata_active_org_id');
                        }

                        // Source 5: Direct DB query for any organization
                        if (!activeOrgId) {
                            try {
                                const client = window.originalSupabase || window.supabaseClient || window.supabase;
                                if (client) {
                                    const { data: orgs } = await client
                                        .from('organizations')
                                        .select('id')
                                        .order('created_at', { ascending: false })
                                        .limit(1);
                                    if (orgs && orgs.length > 0 && orgs[0].id) {
                                        activeOrgId = orgs[0].id;
                                    }
                                }
                            } catch (orgErr) {
                                console.warn('[ProjectsModule] Failed to resolve org from DB:', orgErr);
                            }
                        }

                        // Validate UUID format
                        const isValidOrgId = activeOrgId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activeOrgId);

                        if (!isValidOrgId) {
                            throw new Error('No active Organization found. Please go to Settings → Organization to create or select your organization first.');
                        }

                        // Persist resolved org ID
                        if (typeof localStorage !== 'undefined') {
                            localStorage.setItem('stomata_active_org_id', activeOrgId);
                        }
                        if (typeof Auth !== 'undefined' && Auth._profile) {
                            Auth._profile.organization_id = activeOrgId;
                        }

                        const { error: err } = await supabase
                            .from('projects')
                            .insert({ name, organization_id: activeOrgId });
                        error = err;
                    }

                    if (error) throw error;

                    Toast.success(projectId ? 'Project updated successfully' : 'Project added successfully');
                    Modal.close();
                    await this.loadProjects();
                }
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
            if (this._isDemoMode()) {
                // Demo mode: delete from localStorage
                const projects = this._getDemoProjects().filter(p => p.id !== id);
                this._saveDemoProjects(projects);
            } else {
                const { error } = await supabase
                    .from('projects')
                    .delete()
                    .eq('id', id);

                if (error) throw error;
            }

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
