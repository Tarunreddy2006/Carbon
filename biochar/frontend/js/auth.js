// ═══════════════════════════════════════════════════════════════════════════
// CarbonOS — Developer Sandbox Auth Bypass (ESM & Browser Support)
// ═══════════════════════════════════════════════════════════════════════════

import { supabase, getSession, getUserProfile, clearProfileCache } from './supabase.js';

/**
 * Global Logout Exporter
 * Clears sandbox cache states and returns to the authentication splash wall[cite: 3].
 */
export async function handleLogout() {
    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (e) {
        console.error("Error clearing sandbox local storage:", e);
    }
    window.location.href = "/pages/auth/login.html";
}

if (typeof window !== 'undefined') {
    window.handleLogout = handleLogout;
}

/**
 * Auth Guard & UI Helper (Sandbox Developer Override)
 * Bypasses all Supabase token checks and injects a mock application profile[cite: 3].
 */
export const Auth = {
    // Pre-populated identity context parameters for instant sandbox loading[cite: 3]
    _user: { 
        email: 'sandbox.dev@stomata.tech' 
    },
    _profile: {
        id: '00000000-0000-0000-0000-000000000000',
        first_name: 'Tarun',
        last_name: 'Reddy',
        organization_id: '162bfd3b-f92e-4acf-ab40-7da1a744a087', // Matches seeded project database reference[cite: 3]
        organizations: {
            organization_name: 'Stomata Sandbox Platform'
        }
    },

    async guard() {
        // Unconditional bypass: Grants immediate entry approval[cite: 3]
        console.log("🔒 Auth Guard: Developer bypass active. Sandbox profile loaded safely.");
        return this._profile;
    },

    get user() {
        return this._user;
    },

    get profile() {
        return this._profile;
    },

    get displayName() {
        return "Tarun Reddy";
    },

    get initials() {
        return "TR";
    },

    get orgName() {
        return this._profile.organizations.organization_name;
    },

    get orgId() {
        return this._profile.organization_id;
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
 * Lifecycle Event Interceptors
 * If a user interacts with authentication screens, auto-approve routing to the layout shell[cite: 3].
 */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const signupForm = document.getElementById('signupForm') || document.getElementById('signup-form');
        const loginForm = document.getElementById('loginForm') || document.getElementById('login-form');

        // Instant Signup Bypass
        if (signupForm) {
            signupForm.addEventListener('submit', (e) => {
                e.preventDefault(); // Kill standard URL query string leak parameter loop[cite: 3]
                console.log("🔒 Signup Bypass: Instantly verifying workspace sandbox context...");
                window.location.href = "/app.html"; // Route directly to single-page shell[cite: 3]
            });
        }

        // Instant Login Bypass
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault(); // Kill standard URL query string leak parameter loop[cite: 3]
                console.log("🔒 Login Bypass: Instantly verifying workspace sandbox context...");
                window.location.href = "/app.html"; // Route directly to single-page shell[cite: 3]
            });
        }
    });
}

export default Auth;