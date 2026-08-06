// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Multi-Tenant Auth Lifecycle & Guard (ESM & Browser Support)
// ═══════════════════════════════════════════════════════════════════════════

// supabase, getSession, getUserProfile, and clearProfileCache are resolved from global scope (supabase.js)

/**
 * Global Logout Exporter
 */
async function handleLogout() {
    try {
        if (typeof supabase !== 'undefined' && supabase && supabase.auth) {
            await supabase.auth.signOut();
        }
    } catch (e) {
        console.error("Error signing out of Supabase:", e);
    }

    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (e) {
        console.error("Error clearing local session storage:", e);
    }

    window.location.href = "/pages/auth/login.html";
}

if (typeof window !== 'undefined') {
    window.handleLogout = handleLogout;
}

/**
 * Auth Guard & UI Helper
 */
const Auth = {
    _user: null,
    _profile: null,

    async guard() {
        try {
            const session = await getSession();
            if (!session) {
                window.location.replace('/pages/auth/login.html');
                return null;
            }

            this._user = session.user;
            if (typeof AuthRepository !== 'undefined') {
                this._profile = await AuthRepository.getProfileAndPermissions(this._user);
            } else {
                this._profile = await getUserProfile();
            }
            return this._profile;
        } catch (err) {
            console.warn('[Auth] Auth.guard caught exception during bootstrap:', err);
            if (this._user && typeof AuthRepository !== 'undefined') {
                this._profile = await AuthRepository.restoreFromCache(this._user);
                return this._profile;
            }
            return null;
        }
    },

    get user() {
        return this._user;
    },

    get profile() {
        return this._profile;
    },

    get displayName() {
        if (!this._profile) return 'User';
        const first = this._profile.first_name || '';
        const last = this._profile.last_name || '';
        return (first + ' ' + last).trim() || this._user?.email || 'User';
    },

    get initials() {
        if (!this._profile) return '?';
        const f = (this._profile.first_name || 'U')[0].toUpperCase();
        const l = (this._profile.last_name || '')[0]?.toUpperCase() || '';
        return f + l;
    },

    get orgName() {
        return this._profile?.organizations?.name || 'My Organization';
    },

    get orgId() {
        const raw = this._profile?.organization_id || this._profile?.organization_members?.[0]?.organization_id || null;
        if (!raw || raw === 'offline-org') return null;
        const isValid = typeof Utils !== 'undefined' && Utils.isValidUuid
            ? Utils.isValidUuid(raw)
            : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
        return isValid ? raw : null;
    },

    getUserRole() {
        const profile = this._profile;
        if (!profile) {
            console.log('[Role Audit]', { rawRole: 'viewer', normalizedRole: 'viewer', permissions: typeof Permissions !== 'undefined' ? Permissions.ROLE_PERMISSIONS['viewer'] : undefined });
            return 'viewer';
        }

        let roleVal = null;
        if (profile.role) {
            roleVal = profile.role;
        } else if (profile.roles?.name) {
            roleVal = profile.roles.name;
        } else if (profile.organization_members?.[0]?.roles?.name) {
            roleVal = profile.organization_members[0].roles.name;
        } else if (profile.organization_members?.[0]?.role) {
            roleVal = profile.organization_members[0].role;
        }

        let rawRole = roleVal;
        if (roleVal && typeof roleVal === 'object') {
            rawRole = roleVal.name || roleVal.role || JSON.stringify(roleVal);
        }
        if (!rawRole) {
            rawRole = 'viewer';
        }

        let normalizedRole = 'viewer';
        if (typeof Permissions !== 'undefined') {
            normalizedRole = Permissions.normalizeRole(roleVal);
        } else {
            const lower = rawRole.toString().toLowerCase().trim();
            if (
                lower.includes('owner') || 
                lower.includes('org_owner') || 
                lower.includes('organization_owner') || 
                lower.includes('admin') || 
                lower.includes('administrator')
            ) {
                normalizedRole = 'owner';
            } else {
                normalizedRole = lower || 'viewer';
            }
        }

        console.log('[Role Audit]', { rawRole, normalizedRole, permissions: typeof Permissions !== 'undefined' ? Permissions.ROLE_PERMISSIONS[normalizedRole] : undefined });
        return normalizedRole;
    },

    populateUI() {
        const avatarEl = document.getElementById('topbar-avatar');
        const nameEl = document.getElementById('topbar-user-name');
        const roleBadgeEl = document.getElementById('topbar-user-role');
        const dropdownRoleEl = document.getElementById('dropdown-user-role');
        const orgNameEl = document.getElementById('sidebar-org-name');

        const roleName = (this.getUserRole() || 'viewer').toUpperCase();

        if (avatarEl) avatarEl.textContent = this.initials;
        if (nameEl) nameEl.textContent = this.displayName;
        if (roleBadgeEl) roleBadgeEl.textContent = roleName;
        if (dropdownRoleEl) dropdownRoleEl.textContent = `Role: ${roleName}`;
        if (orgNameEl) orgNameEl.textContent = this.orgName;
    },
};

if (typeof window !== 'undefined') {
    window.Auth = Auth;
}