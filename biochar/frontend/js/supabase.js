// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Supabase Client + Auth Helpers
// ═══════════════════════════════════════════════════════════════════════════

const supabase = window.supabase.createClient(
    CARBONOS_CONFIG.SUPABASE_URL,
    CARBONOS_CONFIG.SUPABASE_ANON_KEY
);

/**
 * Get the current session. Returns null if not authenticated.
 */
async function getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error('getSession error:', error);
        return null;
    }
    return session;
}

/**
 * Get the current authenticated user.
 */
async function getUser() {
    const session = await getSession();
    return session?.user || null;
}

/**
 * Get the current user's organization_id from their profile.
 * Caches the result for the session duration.
 */
let _cachedOrgId = null;
let _cachedProfile = null;

async function getUserProfile() {
    if (_cachedProfile) return _cachedProfile;

    const user = await getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('profiles')
        .select('*, organizations(*)')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error('getUserProfile error:', error);
        return null;
    }

    _cachedProfile = data;
    _cachedOrgId = data?.organization_id;
    return data;
}

async function getOrganizationId() {
    if (_cachedOrgId) return _cachedOrgId;
    const profile = await getUserProfile();
    return profile?.organization_id || null;
}

/**
 * Clear cached profile data (call on auth state change).
 */
function clearProfileCache() {
    _cachedProfile = null;
    _cachedOrgId = null;
}

/**
 * Sign out and redirect to login.
 */
async function signOut() {
    clearProfileCache();
    await supabase.auth.signOut();
    window.location.replace('/pages/auth/login.html');
}

/**
 * Listen for auth state changes.
 */
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        clearProfileCache();
        window.location.replace('/pages/auth/login.html');
    }
    if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        clearProfileCache(); // Refresh cache on next access
    }
});
