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
                    // Step A: Call supabase.auth.signUp to generate identity profile inside auth.users
                    const { data: authData, error: authError } = await supabase.auth.signUp({
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

                    if (authError) throw authError;

                    const user = authData?.user;
                    if (!user) {
                        throw new Error('Registration did not return a valid user account token wrapper.');
                    }

                    // Step B: Insert a new multi-tenant organization row into organizations table
                    const { data: orgRow, error: orgError } = await supabase
                        .from('organizations')
                        .insert({
                            name: orgName,
                            email: email,
                            phone: phone,
                            subscription_plan: 'Trial',
                            subscription_status: 'Active'
                        })
                        .select()
                        .single();

                    if (orgError) throw orgError;

                    // Step C: Insert corresponding user record metadata into profiles table
                    const { error: profileError } = await supabase
                        .from('profiles')
                        .insert({
                            id: user.id,
                            first_name: firstName,
                            last_name: lastName,
                            phone: phone,
                            organization_id: orgRow.id
                        });

                    if (profileError) throw profileError;

                    // Step D: Query predefined roles table to filter and extract target ID row where name = 'Owner'
                    const { data: roleRow, error: roleError } = await supabase
                        .from('roles')
                        .select('id')
                        .eq('name', 'Owner')
                        .single();

                    if (roleError) throw roleError;

                    // Step E: Link user context by inserting a row into organization_members
                    const { error: memberError } = await supabase
                        .from('organization_members')
                        .insert({
                            organization_id: orgRow.id,
                            user_id: user.id,
                            role_id: roleRow.id,
                            joined_at: new Date().toISOString()
                        });

                    if (memberError) throw memberError;

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
                    const { data, error } = await supabase.auth.signInWithPassword({
                        email,
                        password
                    });

                    if (error) throw error;

                    const user = data?.user;
                    if (!user) {
                        throw new Error('Verification failed: No valid user token received.');
                    }

                    // Assert profile database context loading boundary lines
                    const { data: profile, error: profileError } = await supabase
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