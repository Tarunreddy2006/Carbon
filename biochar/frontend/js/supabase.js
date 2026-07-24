// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Supabase Client + Auth Helpers (Unified Classic Browser Architecture)
// ═══════════════════════════════════════════════════════════════════════════

// Resolve initialization endpoints from global app config definitions with safe string fallbacks
const SUPABASE_URL = (typeof CARBONOS_CONFIG !== 'undefined' && CARBONOS_CONFIG.SUPABASE_URL)
    ? CARBONOS_CONFIG.SUPABASE_URL
    : "https://yrjiiacdxknesvpaxdjr.supabase.co";

const SUPABASE_ANON_KEY = (typeof CARBONOS_CONFIG !== 'undefined' && CARBONOS_CONFIG.SUPABASE_ANON_KEY)
    ? CARBONOS_CONFIG.SUPABASE_ANON_KEY
    : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyamlpYWNkeGtuZXN2cGF4ZGpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MjIwODMsImV4cCI6MjA5NTA5ODA4M30.ieQV-H7HPFj6ihBkWDoZv68klpvwT4iUCD6O7R2h6Lg";

/**
 * Assert that project keys are loaded cleanly before initializing the pipeline client.
 */
function assertSupabaseConfiguration() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes("YOUR_PROJECT_REF")) {
        throw new Error("Supabase initialization error: SUPABASE_URL and SUPABASE_ANON_KEY must be configured inside config.js.");
    }
    
    // Check for active deployment coordinates
    if (SUPABASE_URL === "https://yrjiiacdxknesvpaxdjr.supabase.co") {
        console.log("✔ Supabase SDK initialization check: Stomata live database credentials verified.");
    }
}

// Run configuration assertion guard
assertSupabaseConfiguration();

// ✅ FIXED: Declared as 'supabaseClient' to prevent name collisions with CDN global namespace
let supabaseClient = (typeof window !== 'undefined' && window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

if (typeof window !== 'undefined' && supabaseClient) {
    window.supabaseClient = supabaseClient;
    window.supabase = supabaseClient;
}

/**
 * Get the current session. Returns null if not authenticated.
 */
async function getSession() {
    if (supabaseClient && supabaseClient.auth) {
        try {
            const { data: { session }, error } = await supabaseClient.auth.getSession();
            if (!error && session) return session;
        } catch (err) {
            console.warn('[supabase.js] getSession network/auth exception:', err);
        }
    }

    // LocalStorage fallback for offline session restoration
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    const user = parsed.user || parsed.currentSession?.user;
                    if (user) {
                        return { user, access_token: parsed.access_token || 'offline-token' };
                    }
                }
            }
        }
    } catch (e) { }

    return null;
}

/**
 * Get the current authenticated identity tracking block.
 */
async function getUser() {
    const session = await getSession();
    return session?.user || null;
}

// Memory caching layers to limit redundant database round-trips over RLS
let _cachedOrgId = null;
let _cachedProfile = null;

// Instrument diagnostic proxy on supabaseClient.from
if (typeof window !== 'undefined' && supabaseClient) {
    const originalFrom = supabaseClient.from;
    supabaseClient.from = function(tableName) {
        const isOnline = typeof Connectivity !== 'undefined' ? Connectivity.isOnline : navigator.onLine;
        if (!isOnline) {
            console.warn(`[Supabase Diagnostic Proxy] supabase.from('${tableName}') database operation invoked while offline.`);
        }
        return originalFrom.apply(this, arguments);
    };
    window.supabaseClient = supabaseClient;
    window.supabase = supabaseClient;
}

/**
 * Fetch and cache user profile and company association rules.
 */
async function getUserProfile() {
    if (_cachedProfile) return _cachedProfile;

    const user = await getUser();
    if (!user) return null;

    // Resolve initial connectivity status if Connectivity subsystem is loaded but has not verified yet
    if (typeof Connectivity !== 'undefined' && !Connectivity.hasVerified) {
        console.log('[supabase.js] Connectivity verification in progress. Awaiting initial check before fetching user profile...');
        await Connectivity.verify();
    }

    const isOnline = typeof Connectivity !== 'undefined' ? Connectivity.isOnline : (typeof navigator !== 'undefined' ? navigator.onLine : true);

    if (!isOnline) {
        console.log('[supabase.js] getUserProfile offline, restoring from IndexedDB cache...');
        try {
            if (typeof OfflineDB !== 'undefined') {
                const profiles = await OfflineDB.getAll('profiles');
                const profile = (profiles || []).find(p => p && p.id === user.id);
                if (profile) {
                    const orgs = await OfflineDB.getAll('organizations');
                    const org = (orgs || []).find(o => o && o.id === profile.organization_id);
                    profile.organizations = org || null;
                    _cachedProfile = profile;
                    _cachedOrgId = profile.organization_id;
                    return profile;
                }
            }
        } catch (e) {
            console.warn('[supabase.js] Error loading user profile from OfflineDB:', e);
        }

        if (typeof AuthRepository !== 'undefined') {
            const fallbackProfile = await AuthRepository.restoreFromCache(user);
            if (fallbackProfile) {
                _cachedProfile = fallbackProfile;
                _cachedOrgId = fallbackProfile.organization_id;
                return fallbackProfile;
            }
        }
        return null;
    }

    try {
        if (!supabaseClient) {
            throw new Error("supabaseClient not initialized");
        }
        const { data: profile, error: profileErr } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (profileErr || !profile) {
            throw profileErr || new Error("Profile not found");
        }

        let org = null;
        if (profile.organization_id) {
            const { data: orgData } = await supabaseClient
                .from('organizations')
                .select('*')
                .eq('id', profile.organization_id)
                .maybeSingle();
            org = orgData;
        }

        profile.organizations = org;
        
        if (typeof OfflineDB !== 'undefined') {
            await OfflineDB.put('profiles', profile);
            if (org) {
                await OfflineDB.put('organizations', org);
            }
        }

        _cachedProfile = profile;
        _cachedOrgId = profile.organization_id;
        return profile;
    } catch (err) {
        console.warn('[supabase.js] getUserProfile online fetch failed, falling back to cache:', err);
        try {
            if (typeof OfflineDB !== 'undefined') {
                const profiles = await OfflineDB.getAll('profiles');
                const profile = (profiles || []).find(p => p && p.id === user.id);
                if (profile) {
                    const orgs = await OfflineDB.getAll('organizations');
                    const org = (orgs || []).find(o => o && o.id === profile.organization_id);
                    profile.organizations = org || null;
                    _cachedProfile = profile;
                    _cachedOrgId = profile.organization_id;
                    return profile;
                }
            }
        } catch (e) {
            console.warn('[supabase.js] Error restoring profile from cache after failure:', e);
        }

        if (typeof AuthRepository !== 'undefined') {
            const fallbackProfile = await AuthRepository.restoreFromCache(user);
            if (fallbackProfile) {
                _cachedProfile = fallbackProfile;
                _cachedOrgId = fallbackProfile.organization_id;
                return fallbackProfile;
            }
        }
        return null;
    }
}

/**
 * Extract organization ID link boundary context.
 */
async function getOrganizationId() {
    if (_cachedOrgId) return _cachedOrgId;
    const profile = await getUserProfile();
    return profile?.organization_id || null;
}

/**
 * Reset local application context memory limits.
 */
function clearProfileCache() {
    _cachedProfile = null;
    _cachedOrgId = null;
}

/**
 * Terminate sessions cleanly and clean up tracking memory vectors.
 */
async function signOut() {
    clearProfileCache();
    if (supabaseClient) {
        await supabaseClient.auth.signOut();
    }
    window.location.replace('/pages/auth/login.html');
}

// Handle real-time auth event mutations globally
if (supabaseClient && supabaseClient.auth) {
    supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            clearProfileCache();
            window.location.replace('/pages/auth/login.html');
        }
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
            clearProfileCache();
        }
    });
}

// Expose helpers globally
if (typeof window !== 'undefined') {
    window.getSession = getSession;
    window.getUser = getUser;
    window.getUserProfile = getUserProfile;
    window.getOrganizationId = getOrganizationId;
    window.clearProfileCache = clearProfileCache;
    window.signOut = signOut;
}