// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Auth Guard
// ═══════════════════════════════════════════════════════════════════════════

const Auth = {
    _user: null,
    _profile: null,

    /**
     * Check authentication and load user profile.
     * Redirects to login if no session.
     * @returns {object|null} - User profile if authenticated.
     */
    async guard() {
        const session = await getSession();
        if (!session) {
            window.location.replace('/pages/auth/login.html');
            return null;
        }

        this._user = session.user;
        this._profile = await getUserProfile();

        // Safety net: if user is authenticated but doesn't have a profile yet (e.g. signed up via email verification,
        // or OAuth first login), provision organization, profile, and owner role on the fly.
        if (!this._profile) {
            try {
                const meta = this._user.user_metadata || {};
                const orgName = meta.org_name || 'My Organization';
                const firstName = meta.first_name || '';
                const lastName = meta.last_name || '';
                const phone = meta.phone || '';

                console.log('Provisioning new organization and profile for user...');

                // 1. Create Org
                const { data: org, error: orgErr } = await supabase
                    .from('organizations')
                    .insert({ name: orgName })
                    .select()
                    .single();

                if (orgErr) throw orgErr;

                // 2. Create Profile
                const { error: profErr } = await supabase
                    .from('profiles')
                    .upsert({
                        id: this._user.id,
                        first_name: firstName,
                        last_name: lastName,
                        phone: phone,
                        organization_id: org.id
                    });

                if (profErr) throw profErr;

                // 3. Create Org Member with Owner Role (ID 1)
                const { error: memErr } = await supabase
                    .from('organization_members')
                    .insert({
                        organization_id: org.id,
                        user_id: this._user.id,
                        role_id: 1 // Owner
                    });

                if (memErr) throw memErr;

                // Clear cache and retrieve again
                clearProfileCache();
                this._profile = await getUserProfile();
            } catch (err) {
                console.error('Failed to auto-provision profile:', err);
                // If it fails (e.g. permission or network), we logout to prevent infinite loading/broken UI
                await signOut();
                return null;
            }
        }

        return this._profile;
    },

    /**
     * Get cached user.
     */
    get user() {
        return this._user;
    },

    /**
     * Get cached profile.
     */
    get profile() {
        return this._profile;
    },

    /**
     * Get display name.
     */
    get displayName() {
        if (!this._profile) return 'User';
        const first = this._profile.first_name || '';
        const last = this._profile.last_name || '';
        return (first + ' ' + last).trim() || this._user?.email || 'User';
    },

    /**
     * Get user initials.
     */
    get initials() {
        if (!this._profile) return '?';
        return Utils.getInitials(this._profile.first_name, this._profile.last_name);
    },

    /**
     * Get organization name.
     */
    get orgName() {
        return this._profile?.organizations?.name || 'My Organization';
    },

    /**
     * Get organization ID.
     */
    get orgId() {
        return this._profile?.organization_id || null;
    },

    /**
     * Populate the topbar user section after auth.
     */
    populateUI() {
        const avatarEl = document.getElementById('topbar-avatar');
        const nameEl = document.getElementById('topbar-user-name');
        const orgNameEl = document.getElementById('sidebar-org-name');

        if (avatarEl) avatarEl.textContent = this.initials;
        if (nameEl) nameEl.textContent = this.displayName;
        if (orgNameEl) orgNameEl.textContent = this.orgName;
    },
};
