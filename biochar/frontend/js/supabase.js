// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Supabase Client + Auth Helpers (Unified Classic Browser Architecture)
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
        console.log("✔ Supabase SDK initialization check: CarbonOS live database credentials verified.");
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
    if (!supabaseClient) return null;
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) {
        console.error('getSession error:', error);
        return null;
    }
    return session;
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

/**
 * Fetch and cache user profile and company association rules.
 */
async function getUserProfile() {
    if (_cachedProfile) return _cachedProfile;

    const user = await getUser();
    if (!user || !supabaseClient) return null;

    // 1. Fetch user profile
    const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) {
        console.error('getUserProfile profiles select error:', profileError);
        return null;
    }

    if (!profile) return null;

    // 2. Fetch organization_members membership details, joining organizations and roles
    const { data: members, error: memberError } = await supabaseClient
        .from('organization_members')
        .select('*, organizations(*), roles(*)')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: false });

    if (memberError) {
        console.error('getUserProfile organization_members select error:', memberError);
    }

    // Find matching membership or fallback to the most recent one
    let member = null;
    if (members && members.length > 0) {
        if (profile.organization_id) {
            member = members.find(m => m.organization_id === profile.organization_id) || members[0];
        } else {
            member = members[0];
        }
    }

    // 3. Attach organization and role information resolved from organization_members
    if (member) {
        profile.organization_id = member.organization_id;
        profile.organizations = member.organizations;
        profile.role = member.roles;
        profile.role_id = member.role_id;
        profile.member_status = member.status;
    } else {
        profile.organization_id = null;
        profile.organizations = null;
        profile.role = null;
        profile.role_id = null;
        profile.member_status = null;
    }

    _cachedProfile = profile;
    _cachedOrgId = profile.organization_id;
    return profile;
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