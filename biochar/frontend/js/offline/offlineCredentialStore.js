// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Offline Credential Store (Bcrypt-Hashed Local Auth Cache)
// ═══════════════════════════════════════════════════════════════════════════
//
// Stores a SINGLE user's hashed credentials in IndexedDB for offline login.
// When a new user authenticates online, the previous user's credentials are
// erased and replaced. No background sync — credentials never leave the device.
//
// Dependencies: bcryptjs (loaded via CDN), OfflineDB (indexeddb.js)
// ═══════════════════════════════════════════════════════════════════════════

const OfflineCredentialStore = {

    STORE_NAME: 'offline_credentials',
    SINGLETON_KEY: 'singleton',
    BCRYPT_COST: 10,

    /**
     * Store a user's credentials locally after a successful online login/signup.
     * Replaces any previously cached credentials (single-user model).
     *
     * @param {string} email - The user's email address
     * @param {string} plaintextPassword - The user's plaintext password (will be hashed)
     * @param {string} userId - The Supabase user ID
     * @returns {Promise<boolean>} true if stored successfully
     */
    async storeCredentials(email, plaintextPassword, userId) {
        try {
            if (!email || !plaintextPassword || !userId) {
                console.warn('[OfflineCredentialStore] Missing required parameters for storeCredentials.');
                return false;
            }

            if (typeof dcodeIO === 'undefined' && typeof bcrypt === 'undefined') {
                console.warn('[OfflineCredentialStore] bcryptjs library not loaded. Cannot hash credentials.');
                return false;
            }

            const bcryptLib = (typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt) ? dcodeIO.bcrypt : (typeof bcrypt !== 'undefined' ? bcrypt : null);
            if (!bcryptLib) {
                console.warn('[OfflineCredentialStore] bcryptjs library reference not found.');
                return false;
            }

            // Hash the password with bcrypt
            const salt = bcryptLib.genSaltSync(this.BCRYPT_COST);
            const passwordHash = bcryptLib.hashSync(plaintextPassword, salt);

            // Clear existing credentials first, then store new ones
            await this.clearCredentials();

            const record = {
                id: this.SINGLETON_KEY,
                email: email.toLowerCase().trim(),
                password_hash: passwordHash,
                user_id: userId,
                cached_at: new Date().toISOString()
            };

            if (typeof OfflineDB !== 'undefined') {
                await OfflineDB.put(this.STORE_NAME, record);
            } else {
                console.warn('[OfflineCredentialStore] OfflineDB not available. Cannot persist credentials.');
                return false;
            }

            console.log('[OfflineCredentialStore] Credentials cached successfully for offline login.');
            return true;
        } catch (err) {
            console.error('[OfflineCredentialStore] Failed to store credentials:', err);
            return false;
        }
    },

    /**
     * Verify credentials against the locally cached hash for offline login.
     * Only login is allowed offline — no account creation.
     *
     * @param {string} email - The email to verify
     * @param {string} plaintextPassword - The password to verify
     * @returns {Promise<{valid: boolean, userId?: string, error?: string}>}
     */
    async verifyCredentials(email, plaintextPassword) {
        try {
            if (!email || !plaintextPassword) {
                return { valid: false, error: 'Email and password are required.' };
            }

            if (typeof dcodeIO === 'undefined' && typeof bcrypt === 'undefined') {
                return { valid: false, error: 'Offline authentication library not loaded.' };
            }

            const bcryptLib = (typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt) ? dcodeIO.bcrypt : (typeof bcrypt !== 'undefined' ? bcrypt : null);
            if (!bcryptLib) {
                return { valid: false, error: 'Offline authentication library not available.' };
            }

            if (typeof OfflineDB === 'undefined') {
                return { valid: false, error: 'Offline database not available.' };
            }

            const record = await OfflineDB.get(this.STORE_NAME, this.SINGLETON_KEY);

            if (!record) {
                return { valid: false, error: 'No offline credentials found. Please log in online first.' };
            }

            // Check email match (case-insensitive)
            if (record.email !== email.toLowerCase().trim()) {
                return { valid: false, error: 'This account has no offline access on this device. Only the last online user can log in offline.' };
            }

            // Verify password hash
            const isMatch = bcryptLib.compareSync(plaintextPassword, record.password_hash);

            if (isMatch) {
                console.log('[OfflineCredentialStore] Offline credential verification successful.');
                return { valid: true, userId: record.user_id };
            } else {
                return { valid: false, error: 'Invalid password for offline login.' };
            }
        } catch (err) {
            console.error('[OfflineCredentialStore] Credential verification failed:', err);
            return { valid: false, error: 'Offline authentication error. Please try again.' };
        }
    },

    /**
     * Clear all cached credentials from IndexedDB.
     * Called on explicit sign-out to prevent stale offline access.
     *
     * @returns {Promise<void>}
     */
    async clearCredentials() {
        try {
            if (typeof OfflineDB !== 'undefined') {
                await OfflineDB.clear(this.STORE_NAME);
                console.log('[OfflineCredentialStore] Cached credentials cleared.');
            }
        } catch (err) {
            console.warn('[OfflineCredentialStore] Failed to clear credentials:', err);
        }
    },

    /**
     * Check if there are any cached credentials available for offline login.
     *
     * @returns {Promise<boolean>}
     */
    async hasCredentials() {
        try {
            if (typeof OfflineDB === 'undefined') return false;
            const record = await OfflineDB.get(this.STORE_NAME, this.SINGLETON_KEY);
            return !!record;
        } catch (err) {
            return false;
        }
    },

    /**
     * Get the cached user's email (for display purposes on the offline login screen).
     * Never exposes the password hash.
     *
     * @returns {Promise<string|null>}
     */
    async getCachedEmail() {
        try {
            if (typeof OfflineDB === 'undefined') return null;
            const record = await OfflineDB.get(this.STORE_NAME, this.SINGLETON_KEY);
            return record ? record.email : null;
        } catch (err) {
            return null;
        }
    },

    /**
     * Create an offline session in localStorage so app.html recognizes the user.
     * This creates a synthetic session token that the fast auth pre-check can detect.
     *
     * @param {string} userId - The cached user ID
     * @param {string} email - The cached user email
     */
    createOfflineSession(userId, email) {
        const offlineSession = {
            access_token: 'offline-token',
            user: {
                id: userId,
                email: email,
                user_metadata: {}
            }
        };

        localStorage.setItem('stomata_offline_session', JSON.stringify(offlineSession));
        // Also set a Supabase-compatible auth token key so existing session checks work
        localStorage.setItem('sb-offline-auth-token', JSON.stringify(offlineSession));
        console.log('[OfflineCredentialStore] Offline session created in localStorage.');
    },

    /**
     * Clear the offline session from localStorage.
     * Called on sign-out alongside clearCredentials.
     */
    clearOfflineSession() {
        localStorage.removeItem('stomata_offline_session');
        localStorage.removeItem('sb-offline-auth-token');
    }
};

if (typeof window !== 'undefined') {
    window.OfflineCredentialStore = OfflineCredentialStore;
}
