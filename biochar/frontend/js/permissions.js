// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Centralized Permission & Role-Based Access Control (RBAC) Service
// ═══════════════════════════════════════════════════════════════════════════

const ROLE_PERMISSIONS = {
    'owner': ['*'],
    'org_owner': ['*'],
    'organization_owner': ['*'],
    'admin': ['*'],
    'manager': ['dashboard:*', 'projects:*', 'feedstock:*', 'batches:*', 'pyrolysis:*', 'laboratory:*', 'distribution:*', 'evidence:*'],
    'operator': ['dashboard:read', 'feedstock:create', 'pyrolysis:create', 'batches:create'],
    'viewer': ['*:read'],
    'project manager': ['dashboard', 'projects', 'feedstock', 'batches', 'laboratory', 'settings', 'evidence', 'dashboard:*', 'projects:*', 'feedstock:*', 'batches:*', 'pyrolysis:*', 'laboratory:*', 'distribution:*', 'settings:*', 'evidence:*'],
    'laboratory': ['dashboard', 'projects', 'laboratory', 'evidence', 'dashboard:*', 'projects:*', 'laboratory:*', 'evidence:*'],
    'mrv officer': ['dashboard', 'projects', 'feedstock', 'batches', 'pyrolysis', 'laboratory', 'distribution', 'settings', 'evidence', 'dashboard:*', 'projects:*', 'feedstock:*', 'batches:*', 'pyrolysis:*', 'laboratory:*', 'distribution:*', 'settings:*', 'evidence:*']
};

const Permissions = {
    ROLE_PERMISSIONS: ROLE_PERMISSIONS,

    /**
     * Normalize role strings mapping variations to normalized lowercase representations.
     */
    normalizeRole(role) {
        if (!role) return 'viewer';
        
        let roleStr = '';
        if (typeof role === 'object') {
            roleStr = role.name || role.role || '';
            if (typeof roleStr === 'object') {
                roleStr = roleStr.name || roleStr.role || '';
            }
        } else {
            roleStr = role;
        }
        
        if (!roleStr) return 'viewer';
        
        const lower = roleStr.toString().toLowerCase().trim();
        
        // Explicitly map any role string containing 'owner', 'org_owner', 'organization_owner', 'admin', or 'administrator' to 'owner'
        if (
            lower.includes('owner') || 
            lower.includes('org_owner') || 
            lower.includes('organization_owner') || 
            lower.includes('admin') || 
            lower.includes('administrator')
        ) {
            return 'owner';
        }
        
        return lower;
    },

    /**
     * Retrieve the current logged-in user's role name.
     * Resolves dynamically from Auth.getUserRole() or fallback.
     */
    getRole() {
        let rawRole = 'Viewer';
        if (typeof Auth !== 'undefined' && typeof Auth.getUserRole === 'function') {
            rawRole = Auth.getUserRole();
        } else if (typeof Auth !== 'undefined' && Auth.profile && Auth.profile.role) {
            rawRole = Auth.profile.role.name || 'Viewer';
        }
        
        const normalizedRole = this.normalizeRole(rawRole);
        console.log('[Role Audit]', { 
            rawRole, 
            normalizedRole, 
            permissions: this.ROLE_PERMISSIONS[normalizedRole] 
        });
        return rawRole;
    },

    /**
     * Case-insensitive check if the user has a specific role.
     */
    hasRole(role) {
        return this.normalizeRole(this.getRole()) === this.normalizeRole(role);
    },

    /**
     * Check if the current user can access a given module.
     */
    canAccessModule(module) {
        const role = this.normalizeRole(this.getRole());
        if (role === 'owner' || role === 'admin') {
            return true;
        }
        const allowedModules = this.ROLE_PERMISSIONS[role] || [];
        if (allowedModules.includes('*')) {
            return true;
        }
        
        const cleanModule = module ? module.toString().toLowerCase().trim() : '';
        if (allowedModules.includes(cleanModule)) {
            return true;
        }
        
        // Handle wildcards like 'dashboard:*' or '*:read'
        for (const allowed of allowedModules) {
            if (allowed === '*') return true;
            if (allowed.endsWith(':*')) {
                const prefix = allowed.slice(0, -2);
                if (cleanModule === prefix || cleanModule.startsWith(prefix + ':')) {
                    return true;
                }
            }
            if (allowed.startsWith('*:')) {
                const suffix = allowed.slice(2);
                if (cleanModule.endsWith(':' + suffix) || cleanModule === suffix) {
                    return true;
                }
            }
        }
        return false;
    },

    /**
     * Check if the current user can view a given module.
     */
    canView(module) {
        return this.canAccessModule(module) || this.canAccessModule(`${module}:read`);
    },

    /**
     * Check if the current user can create records in a given module.
     */
    canCreate(module) {
        const role = this.normalizeRole(this.getRole());
        if (role === 'owner' || role === 'admin') {
            return true;
        }
        const allowedModules = this.ROLE_PERMISSIONS[role] || [];
        if (allowedModules.includes('*')) {
            return true;
        }
        if (allowedModules.includes(`${module}:*`) || allowedModules.includes(`${module}:create`) || allowedModules.includes(`${module}:write`)) {
            return true;
        }
        switch (role) {
            case 'project manager':
                return ['projects'].includes(module);
            case 'operator':
                return ['feedstock', 'pyrolysis', 'batches'].includes(module);
            case 'laboratory':
                return ['laboratory'].includes(module);
            case 'mrv officer':
            case 'viewer':
            default:
                return false;
        }
    },

    /**
     * Check if the current user can edit records in a given module.
     */
    canEdit(module) {
        const role = this.normalizeRole(this.getRole());
        if (role === 'owner' || role === 'admin') {
            return true;
        }
        const allowedModules = this.ROLE_PERMISSIONS[role] || [];
        if (allowedModules.includes('*')) {
            return true;
        }
        if (allowedModules.includes(`${module}:*`) || allowedModules.includes(`${module}:edit`) || allowedModules.includes(`${module}:write`)) {
            return true;
        }
        return this.canCreate(module);
    },

    /**
     * Check if the current user can delete records in a given module.
     */
    canDelete(module) {
        const role = this.normalizeRole(this.getRole());
        if (role === 'owner' || role === 'admin') {
            return true;
        }
        const allowedModules = this.ROLE_PERMISSIONS[role] || [];
        if (allowedModules.includes('*')) {
            return true;
        }
        if (allowedModules.includes(`${module}:*`) || allowedModules.includes(`${module}:delete`) || allowedModules.includes(`${module}:write`)) {
            return true;
        }
        if (role === 'admin') {
            // Admin can delete everything except organization
            return module !== 'organization';
        }
        switch (role) {
            case 'project manager':
                return ['projects'].includes(module);
            case 'operator':
            case 'laboratory':
            case 'mrv officer':
            case 'viewer':
            default:
                return false;
        }
    },

    /**
     * Check for specific feature privileges.
     */
    hasPermission(permission) {
        const role = this.normalizeRole(this.getRole());
        if (role === 'owner' || role === 'admin') {
            return true;
        }
        const allowedModules = this.ROLE_PERMISSIONS[role] || [];
        if (allowedModules.includes('*')) {
            return true;
        }
        switch (permission) {
            case 'manage_users':
            case 'assign_roles':
                return ['owner', 'admin'].includes(role);
            case 'transfer_ownership':
            case 'delete_organization':
                return role === 'owner';
            case 'change_org_settings':
                return ['owner', 'admin'].includes(role);
            case 'generate_registry_package':
                return ['owner', 'admin', 'project manager', 'mrv officer'].includes(role);
            case 'verify_records':
            case 'access_reports':
                return ['owner', 'admin', 'mrv officer'].includes(role);
            case 'upload_reports':
                return ['owner', 'admin', 'laboratory'].includes(role);
            case 'export':
                return ['owner', 'admin', 'project manager', 'mrv officer'].includes(role);
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
