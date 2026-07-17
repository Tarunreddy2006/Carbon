// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Centralized Permission & Role-Based Access Control (RBAC) Service
// ═══════════════════════════════════════════════════════════════════════════

const Permissions = {
    /**
     * Retrieve the current logged-in user's role name.
     * Resolves dynamically from Auth.profile.role.name.
     */
    getRole() {
        if (typeof Auth !== 'undefined' && Auth.profile && Auth.profile.role) {
            return Auth.profile.role.name || 'Viewer';
        }
        return 'Viewer'; // fallback
    },

    /**
     * Case-insensitive check if the user has a specific role.
     */
    hasRole(role) {
        return this.getRole().toLowerCase() === role.toLowerCase();
    },

    /**
     * Check if the current user can view a given module.
     */
    canView(module) {
        const role = this.getRole();
        switch (role) {
            case 'Owner':
            case 'Admin':
                return true;
            case 'Project Manager':
                return ['dashboard', 'projects', 'feedstock', 'batches', 'laboratory', 'settings'].includes(module);
            case 'Operator':
                return ['dashboard', 'feedstock', 'batches', 'pyrolysis'].includes(module);
            case 'Laboratory':
                return ['dashboard', 'projects', 'laboratory'].includes(module);
            case 'MRV Officer':
                return ['dashboard', 'projects', 'feedstock', 'batches', 'pyrolysis', 'laboratory', 'distribution', 'settings'].includes(module);
            case 'Viewer':
                return ['dashboard', 'projects', 'feedstock', 'batches', 'pyrolysis', 'laboratory', 'distribution'].includes(module);
            default:
                return false;
        }
    },

    /**
     * Check if the current user can create records in a given module.
     */
    canCreate(module) {
        const role = this.getRole();
        switch (role) {
            case 'Owner':
            case 'Admin':
                return true;
            case 'Project Manager':
                return ['projects'].includes(module);
            case 'Operator':
                return ['feedstock', 'pyrolysis', 'batches'].includes(module);
            case 'Laboratory':
                return ['laboratory'].includes(module);
            case 'MRV Officer':
            case 'Viewer':
            default:
                return false;
        }
    },

    /**
     * Check if the current user can edit records in a given module.
     */
    canEdit(module) {
        return this.canCreate(module);
    },

    /**
     * Check if the current user can delete records in a given module.
     */
    canDelete(module) {
        const role = this.getRole();
        switch (role) {
            case 'Owner':
                return true;
            case 'Admin':
                // Admin can delete everything except organization
                return module !== 'organization';
            case 'Project Manager':
                return ['projects'].includes(module);
            case 'Operator':
            case 'Laboratory':
            case 'MRV Officer':
            case 'Viewer':
            default:
                return false;
        }
    },

    /**
     * Check for specific feature privileges.
     */
    hasPermission(permission) {
        const role = this.getRole();
        switch (permission) {
            case 'manage_users':
            case 'assign_roles':
                return ['Owner', 'Admin'].includes(role);
            case 'transfer_ownership':
            case 'delete_organization':
                return role === 'Owner';
            case 'change_org_settings':
                return ['Owner', 'Admin'].includes(role);
            case 'generate_registry_package':
                return ['Owner', 'Admin', 'Project Manager', 'MRV Officer'].includes(role);
            case 'verify_records':
            case 'access_reports':
                return ['Owner', 'Admin', 'MRV Officer'].includes(role);
            case 'upload_reports':
                return ['Owner', 'Admin', 'Laboratory'].includes(role);
            case 'export':
                return ['Owner', 'Admin', 'Project Manager', 'MRV Officer'].includes(role);
            default:
                return false;
        }
    },

    /**
     * Sync layout and hide sidebar modules the role cannot access.
     */
    updateSidebar() {
        document.querySelectorAll('.sidebar-link').forEach(link => {
            const route = link.getAttribute('data-route');
            if (route) {
                const moduleName = route.replace('/', '');
                if (!this.canView(moduleName)) {
                    link.style.display = 'none';
                } else {
                    link.style.display = '';
                }
            }
        });

        // Hide sidebar sections if all their links are hidden
        document.querySelectorAll('.sidebar-section').forEach(section => {
            const visibleLinks = Array.from(section.querySelectorAll('.sidebar-link'))
                .filter(link => link.style.display !== 'none');
            if (visibleLinks.length === 0) {
                section.style.display = 'none';
            } else {
                section.style.display = '';
            }
        });
    },

    /**
     * Scans the container and hides elements that are unauthorized.
     */
    enforceUI(container, moduleName) {
        if (!container) return;

        // Custom module-specific override for Dashboard
        if (moduleName === 'dashboard') {
            if (!this.canCreate('batches')) {
                container.querySelectorAll('button, a').forEach(btn => {
                    if (btn.textContent.trim().toLowerCase().includes('new batch')) {
                        btn.style.display = 'none';
                    }
                });
            }
            return;
        }

        // 1. Create/Add buttons
        if (!this.canCreate(moduleName)) {
            container.querySelectorAll('button, a.btn').forEach(btn => {
                const text = btn.textContent.trim().toLowerCase();
                const id = btn.id ? btn.id.toLowerCase() : '';
                if (
                    id.includes('create') || id.includes('add') ||
                    text.includes('create') || text.startsWith('add ') || text === 'add' || text.includes('new ')
                ) {
                    btn.style.display = 'none';
                }
            });
        }

        // 2. Edit buttons
        if (!this.canEdit(moduleName)) {
            container.querySelectorAll('button, a').forEach(btn => {
                const text = btn.textContent.trim().toLowerCase();
                const id = btn.id ? btn.id.toLowerCase() : '';
                if (id.includes('edit') || text.includes('edit')) {
                    btn.style.display = 'none';
                }
            });
        }

        // 3. Delete buttons
        if (!this.canDelete(moduleName)) {
            container.querySelectorAll('button, a').forEach(btn => {
                const text = btn.textContent.trim().toLowerCase();
                const id = btn.id ? btn.id.toLowerCase() : '';
                if (id.includes('delete') || text.includes('delete') || btn.classList.contains('danger')) {
                    if (id !== 'logout-btn' && !text.includes('sign out') && !text.includes('logout')) {
                        btn.style.display = 'none';
                    }
                }
            });
        }

        // Hide action menu dots entirely if both edit & delete are blocked
        if (!this.canEdit(moduleName) && !this.canDelete(moduleName)) {
            container.querySelectorAll('.action-menu, .action-menu-btn').forEach(el => {
                el.style.display = 'none';
            });
        }

        // 4. Import buttons
        if (!this.canCreate(moduleName)) {
            container.querySelectorAll('button, a').forEach(btn => {
                const text = btn.textContent.trim().toLowerCase();
                if (text.includes('import')) {
                    btn.style.display = 'none';
                }
            });
        }

        // 5. Export buttons
        if (!this.hasPermission('export')) {
            container.querySelectorAll('button, a').forEach(btn => {
                const text = btn.textContent.trim().toLowerCase();
                if (text.includes('export')) {
                    btn.style.display = 'none';
                }
            });
        }

        // 6. Registry Package buttons
        if (!this.hasPermission('generate_registry_package')) {
            container.querySelectorAll('button, a').forEach(btn => {
                const text = btn.textContent.trim().toLowerCase();
                if (text.includes('registry') || text.includes('package')) {
                    btn.style.display = 'none';
                }
            });
        }

        // 7. User Management buttons/actions
        if (!this.hasPermission('manage_users')) {
            container.querySelectorAll('button, a').forEach(btn => {
                const text = btn.textContent.trim().toLowerCase();
                if (text.includes('user') || text.includes('member') || text.includes('invite')) {
                    if (!btn.classList.contains('tab') || btn.dataset.tab === 'members') {
                        btn.style.display = 'none';
                    }
                }
            });
        }
    }
};

if (typeof window !== 'undefined') {
    window.Permissions = Permissions;
}
