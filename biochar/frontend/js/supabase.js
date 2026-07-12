// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Supabase Client + Auth Helpers (ESM & Browser Support)
// ═══════════════════════════════════════════════════════════════════════════

export const SUPABASE_URL = (typeof CARBONOS_CONFIG !== 'undefined' && CARBONOS_CONFIG.SUPABASE_URL)
    ? CARBONOS_CONFIG.SUPABASE_URL
    : "https://your-project-id.supabase.co";

export const SUPABASE_ANON_KEY = (typeof CARBONOS_CONFIG !== 'undefined' && CARBONOS_CONFIG.SUPABASE_ANON_KEY)
    ? CARBONOS_CONFIG.SUPABASE_ANON_KEY
    : "your-public-anon-key";

// Runtime check asserting initialization variables have been populated
function assertSupabaseConfiguration() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error("Supabase initialization error: SUPABASE_URL and SUPABASE_ANON_KEY must be defined.");
    }
    if (SUPABASE_URL === "https://yrjiiacdxknesvpaxdjr.supabase.co" || SUPABASE_ANON_KEY === "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyamlpYWNkeGtuZXN2cGF4ZGpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MjIwODMsImV4cCI6MjA5NTA5ODA4M30.ieQV-H7HPFj6ihBkWDoZv68klpvwT4iUCD6O7R2h6Lg") {
        console.warn("Supabase SDK initialization check: Using placeholder credentials boundary.");
    }
}

assertSupabaseConfiguration();

export const supabase = (typeof window !== 'undefined' && window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

if (typeof window !== 'undefined' && supabase) {
    window.supabaseClient = supabase;
}

/**
 * Get the current session. Returns null if not authenticated.
 */
export async function getSession() {
    if (!supabase) return null;
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
export async function getUser() {
    const session = await getSession();
    return session?.user || null;
}

let _cachedOrgId = null;
let _cachedProfile = null;

export async function getUserProfile() {
    if (_cachedProfile) return _cachedProfile;

    const user = await getUser();
    if (!user || !supabase) return null;

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

export async function getOrganizationId() {
    if (_cachedOrgId) return _cachedOrgId;
    const profile = await getUserProfile();
    return profile?.organization_id || null;
}

export function clearProfileCache() {
    _cachedProfile = null;
    _cachedOrgId = null;
}

export async function signOut() {
    clearProfileCache();
    if (supabase) {
        await supabase.auth.signOut();
    }
    window.location.replace('/pages/auth/login.html');
}

if (supabase && supabase.auth) {
    supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            clearProfileCache();
            window.location.replace('/pages/auth/login.html');
        }
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
            clearProfileCache();
        }
    });
}

export default supabase;
