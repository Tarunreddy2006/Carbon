// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Multi-Tenant Auth Lifecycle & Guard (ESM & Browser Support)
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

/**
 * DOMContentLoaded Lifecycle Listeners for Signup & Login
 */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        // Intercept Form Submissions: #signupForm and #loginForm
        const signupForm = document.getElementById('signupForm') || document.getElementById('signup-form');
        const loginForm = document.getElementById('loginForm') || document.getElementById('login-form');

        // ─── Sequential User Signup Transaction ───────────────────────────
        if (signupForm) {
            signupForm.addEventListener('submit', async (e) => {
                e.preventDefault(); // Terminate URL query parameter leak

                const firstNameInput = document.getElementById('firstName') || document.getElementById('first-name');
                const lastNameInput = document.getElementById('lastName') || document.getElementById('last-name');
                const orgNameInput = document.getElementById('orgName') || document.getElementById('org-name');
                const emailInput = document.getElementById('email');
                const phoneInput = document.getElementById('phone');
                const passwordInput = document.getElementById('password');
                const confirmPasswordInput = document.getElementById('confirmPassword') || document.getElementById('confirm-password');

                const firstName = firstNameInput?.value?.trim() || '';
                const lastName = lastNameInput?.value?.trim() || '';
                const orgName = orgNameInput?.value?.trim() || '';
                const email = emailInput?.value?.trim() || '';
                const phone = phoneInput?.value?.trim() || '';
                const password = passwordInput?.value || '';
                const confirmPassword = confirmPasswordInput?.value || '';

                if (password !== confirmPassword) {
                    alert('Password does not match Confirm Password.');
                    if (confirmPasswordInput) confirmPasswordInput.focus();
                    return;
                }

                try {
                    // Step A: Call supabaseClient.auth.signUp to generate identity profile inside auth.users
                    console.log("Attempting sign up with email:", email);
                    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
                        email,
                        password,
                        options: {
                            data: {
                                first_name: firstName,
                                last_name: lastName,
                                org_name: orgName,
                                phone: phone
                            }
                        }
                    });

                    console.log("signUp data result:", authData);
                    if (authError) {
                        console.error("signUp error result:", authError);
                        throw authError;
                    }

                    const user = authData?.user;
                    if (!user) {
                        throw new Error('Registration did not return a valid user account token wrapper.');
                    }

                    // Step A.1: Verify if an authenticated session exists before attempting onboarding
                    console.log("Checking if active session exists after signup...");
                    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
                    console.log("getSession data result:", session);
                    if (sessionError) {
                        console.error("getSession error result:", sessionError);
                    }

                    if (!session) {
                        // Email confirmation flow: Do NOT execute onboarding yet
                        console.log("No active session found (email verification required). Stopping onboarding and showing message.");
                        alert('Account created! Please check your email for a verification link to activate your account.');
                        window.location.href = "/pages/auth/login.html";
                        return;
                    }

                    // Step B: Insert a new multi-tenant organization row into organizations table
                    const orgId = (typeof Utils !== 'undefined' && Utils.uuid) ? Utils.uuid() : 
                        ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                            const r = Math.random() * 16 | 0;
                            const v = c === 'x' ? r : (r & 0x3 | 0x8);
                            return v.toString(16);
                        }));

                    console.log("Inserting organization:", orgName, email, phone);
                    const { error: orgError } = await supabaseClient
                        .from('organizations')
                        .insert({
                            id: orgId,
                            name: orgName,
                            email: email,
                            phone: phone,
                            subscription_plan: 'Trial',
                            subscription_status: 'Active'
                        });

                    if (orgError) {
                        console.error("organizations insert error result:", orgError);
                        throw orgError;
                    }

                    // Step C: Insert corresponding user record metadata into profiles table
                    console.log("Inserting profile:", user.id, firstName, lastName, phone, orgId);
                    const { data: profileData, error: profileError } = await supabaseClient
                        .from('profiles')
                        .insert({
                            id: user.id,
                            first_name: firstName,
                            last_name: lastName,
                            phone: phone,
                            organization_id: orgId
                        })
                        .select();

                    console.log("profiles insert data result:", profileData);
                    if (profileError) {
                        console.error("profiles insert error result:", profileError);
                        throw profileError;
                    }

                    // Step D: Query predefined roles table to filter and extract target ID row where name = 'Owner'
                    console.log("Looking up 'Owner' role");
                    const { data: roleRow, error: roleError } = await supabaseClient
                        .from('roles')
                        .select('id')
                        .eq('name', 'Owner')
                        .single();

                    console.log("roles select data result:", roleRow);
                    if (roleError) {
                        console.error("roles select error result:", roleError);
                        throw roleError;
                    }

                    // Step E: Link user context by inserting a row into organization_members
                    console.log("Inserting organization member:", orgId, user.id, roleRow.id);
                    const { data: memberData, error: memberError } = await supabaseClient
                        .from('organization_members')
                        .insert({
                            organization_id: orgId,
                            user_id: user.id,
                            role_id: roleRow.id,
                            joined_at: new Date().toISOString()
                        })
                        .select();

                    console.log("organization_members insert data result:", memberData);
                    if (memberError) {
                        console.error("organization_members insert error result:", memberError);
                        throw memberError;
                    }

                    console.log("🎉 Onboarding transaction completed successfully.");
                    // Transaction Success Handoff
                    window.location.href = "/index.html";
                } catch (error) {
                    console.error('Multi-tenant signup transaction error:', error);
                    alert('Signup failed: ' + (error.message || error));
                }
            });
        }

        // ─── User Login Pipeline ──────────────────────────────────────────
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault(); // Terminate URL query parameter leak

                const emailInput = document.getElementById('email');
                const passwordInput = document.getElementById('password');

                const email = emailInput?.value?.trim() || '';
                const password = passwordInput?.value || '';

                try {
                    const { data, error } = await supabaseClient.auth.signInWithPassword({
                        email,
                        password
                    });

                    if (error) throw error;

                    const user = data?.user;
                    if (!user) {
                        throw new Error('Verification failed: No valid user token received.');
                    }

                    // Assert profile database context loading boundary lines
                    const { data: profile, error: profileError } = await supabaseClient
                        .from('profiles')
                        .select('*')
                        .eq('id', user.id)
                        .single();

                    if (profileError) {
                        console.warn('Profile boundary loading warning:', profileError);
                    }

                    window.location.href = "/index.html";
                } catch (error) {
                    console.error('Login error:', error);
                    alert('Login verification failed: ' + (error.message || error));
                }
            });
        }
    });
}

// Expose Auth globally
if (typeof window !== 'undefined') {
    window.Auth = Auth;
}