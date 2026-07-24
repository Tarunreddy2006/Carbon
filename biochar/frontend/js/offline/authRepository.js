// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Offline-First Auth & Identity Repository
// ═══════════════════════════════════════════════════════════════════════════

const AuthRepository = {
    /**
     * Retrieve complete user profile, membership, organization, and role details.
     * Online: fetches fresh records from Supabase, updates IndexedDB cache.
     * Offline: restores context seamlessly from IndexedDB without network calls.
     */
    async getProfileAndPermissions(user) {
        if (!user || !user.id) return null;

        const isOnline = typeof Connectivity !== 'undefined' ? Connectivity.isOnline : navigator.onLine;

        // When offline, restore directly from IndexedDB without contacting Supabase
        if (!isOnline) {
            console.log('[AuthRepository] Device is offline. Requesting profiles, orgs, and roles from IndexedDB cache.');
            return await this.restoreFromCache(user);
        }

        // When online, use intercepted window.supabase (with SupabaseQueryBuilder fallback)
        try {
            const client = window.supabase || window.supabaseClient;
            if (!client) return await this.restoreFromCache(user);

            // 1. Fetch user profile
            const { data: profile, error: profileErr } = await client
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();

            if (profileErr || !profile) {
                console.warn('[AuthRepository] Profile fetch returned error or empty profile, restoring from cache:', profileErr);
                return await this.restoreFromCache(user);
            }

            // 2. Fetch membership, org, and roles
            const { data: members, error: memberErr } = await client
                .from('organization_members')
                .select('*, organizations(*), roles(*)')
                .eq('user_id', user.id);

            profile.organization_members = members || [];

            let member = null;
            if (members && members.length > 0) {
                if (profile.organization_id) {
                    member = members.find(m => m.organization_id === profile.organization_id) || members[0];
                } else {
                    member = members[0];
                }
            }

            // Attach organization & role
            if (member) {
                profile.organization_id = member.organization_id || profile.organization_id;
                profile.organizations = member.organizations || profile.organizations || null;
                profile.role = member.roles || profile.role || null;
                profile.role_id = member.role_id || profile.role_id || null;
                profile.member_status = member.status || 'Active';
            }

            if (!profile.organizations && profile.organization_id) {
                const { data: orgData } = await client
                    .from('organizations')
                    .select('*')
                    .eq('id', profile.organization_id)
                    .maybeSingle();
                if (orgData) profile.organizations = orgData;
            }

            // Cache full auth context into IndexedDB
            await this.cacheAuthContext(profile, profile.organizations, member, profile.role);
            return profile;

        } catch (err) {
            console.warn('[AuthRepository] Network auth fetch exception, falling back to IndexedDB:', err.message || err);
            if (typeof Connectivity !== 'undefined') {
                Connectivity.setOffline();
            }
            return await this.restoreFromCache(user);
        }
    },

    /**
     * Restore user profile, organization, and roles directly from IndexedDB cache.
     */
    async restoreFromCache(user) {
        console.log('[AuthRepository] Restoring authentication context from IndexedDB cache...');
        try {
            if (typeof OfflineDB === 'undefined') {
                return this.createFallbackProfile(user);
            }

            // 1. Load profile from IndexedDB
            let profile = await OfflineDB.get('profiles', user.id);
            if (!profile) {
                const allProfiles = await OfflineDB.getAll('profiles');
                profile = (allProfiles || []).find(p => p && (p.id === user.id || p.email === user.email));
            }

            // 2. Load members from IndexedDB
            const allMembers = await OfflineDB.getAll('organization_members');
            const members = (allMembers || []).filter(m => m && m.user_id === user.id);
            const member = members.find(m => m.organization_id === (profile?.organization_id)) || members[0];

            const targetOrgId = profile?.organization_id || member?.organization_id;

            // 3. Load organization from IndexedDB
            let org = null;
            if (targetOrgId) {
                org = await OfflineDB.get('organizations', targetOrgId);
                if (!org) {
                    const allOrgs = await OfflineDB.getAll('organizations');
                    org = (allOrgs || []).find(o => o && o.id === targetOrgId);
                }
            }

            // 4. Load role from IndexedDB
            let role = null;
            const targetRoleId = member?.role_id || profile?.role_id;
            if (targetRoleId) {
                role = await OfflineDB.get('roles', targetRoleId);
                if (!role) {
                    const allRoles = await OfflineDB.getAll('roles');
                    role = (allRoles || []).find(r => r && r.id == targetRoleId);
                }
            }

            if (!profile) {
                profile = this.createFallbackProfile(user, targetOrgId);
            }

            profile.organization_members = members || [];
            if (org) profile.organizations = org;
            if (role) profile.role = role;
            if (member) {
                profile.role_id = member.role_id || profile.role_id;
                profile.member_status = member.status;
                if (!profile.organization_id) profile.organization_id = member.organization_id;
            }

            return profile;
        } catch (err) {
            console.error('[AuthRepository] Failed to restore auth context from IndexedDB:', err);
            return this.createFallbackProfile(user);
        }
    },

    /**
     * Create safe fallback profile structure for offline mode if local cache is completely empty.
     */
    createFallbackProfile(user, orgId = null) {
        const meta = user.user_metadata || {};
        return {
            id: user.id,
            first_name: meta.first_name || 'Offline',
            last_name: meta.last_name || 'User',
            phone: meta.phone || '',
            email: user.email || '',
            organization_id: orgId || meta.org_id || 'offline-org',
            organizations: {
                id: orgId || 'offline-org',
                name: meta.org_name || 'Stomata Biochar'
            },
            role: {
                id: 1,
                name: 'Owner'
            },
            role_id: 1,
            member_status: 'Active'
        };
    },

    /**
     * Update IndexedDB cache with current authentication context.
     */
    async cacheAuthContext(profile, org, member, role) {
        if (typeof OfflineDB === 'undefined') return;

        try {
            if (profile && profile.id) {
                await OfflineDB.put('profiles', profile);
            }
            if (org && org.id) {
                await OfflineDB.put('organizations', org);
            }
            if (member && member.id) {
                await OfflineDB.put('organization_members', member);
            }
            if (role && role.id) {
                await OfflineDB.put('roles', role);
            }

            localStorage.setItem('stomata_last_auth_sync', new Date().toISOString());
        } catch (err) {
            console.warn('[AuthRepository] Failed to update auth context cache:', err);
        }
    },

    /**
     * Get human-readable last sync timestamp.
     */
    getLastSyncTimestamp() {
        const lastSync = localStorage.getItem('stomata_last_auth_sync');
        if (!lastSync) return 'Never';
        try {
            const date = new Date(lastSync);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + date.toLocaleDateString() + ')';
        } catch (e) {
            return 'Recently';
        }
    }
};

if (typeof window !== 'undefined') {
    window.AuthRepository = AuthRepository;
}
