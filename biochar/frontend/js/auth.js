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
        const session = await getSession();
        if (!session) {
            window.location.replace('/pages/auth/login.html');
            return null;
        }

        this._user = session.user;
        this._profile = await getUserProfile();
        return this._profile;
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
        return this._profile?.organization_id || null;
    },

    populateUI() {
        const avatarEl = document.getElementById('topbar-avatar');
        const nameEl = document.getElementById('topbar-user-name');
        const orgNameEl = document.getElementById('sidebar-org-name');

        if (avatarEl) avatarEl.textContent = this.initials;
        if (nameEl) nameEl.textContent = this.displayName;
        if (orgNameEl) orgNameEl.textContent = this.orgName;
    },
};

if (typeof window !== 'undefined') {
    window.Auth = Auth;
}