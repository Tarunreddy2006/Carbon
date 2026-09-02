// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Offline Credential Store (Bcrypt-Hashed Local Auth Cache)
// ═══════════════════════════════════════════════════════════════════════════
//
// Stores a SINGLE user's hashed credentials locally for offline login.
// Dual storage engine: IndexedDB (offline_credentials) + LocalStorage vault.
// When a new user authenticates online, the previous user's credentials are
// erased and replaced. Credentials are preserved across signouts for offline re-login.
//
// Dependencies: /js/offline/bcrypt.js, /js/offline/indexeddb.js
// ═══════════════════════════════════════════════════════════════════════════

const OfflineCredentialStore = {

    STORE_NAME: 'offline_credentials',
    SINGLETON_KEY: 'singleton',
    VAULT_STORAGE_KEY: 'stomata_offline_cred_vault',
    BCRYPT_COST: 10,

    /**
     * Resolve the Bcrypt library reference safely.
     */
    _getBcrypt() {
        if (typeof window !== 'undefined') {
            if (window.bcrypt && typeof window.bcrypt.hashSync === 'function') {
                return window.bcrypt;
            }
            if (window.dcodeIO && window.dcodeIO.bcrypt && typeof window.dcodeIO.bcrypt.hashSync === 'function') {
                return window.dcodeIO.bcrypt;
            }
        }
        if (typeof bcrypt !== 'undefined' && typeof bcrypt.hashSync === 'function') {
            return bcrypt;
        }
        if (typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt && typeof dcodeIO.bcrypt.hashSync === 'function') {
            return dcodeIO.bcrypt;
        }
        return null;
    },

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

            const bcryptLib = this._getBcrypt();
            if (!bcryptLib) {
                console.error('[OfflineCredentialStore] Bcrypt library not loaded. Cannot hash credentials.');
                return false;
            }

            const normalizedEmail = email.toLowerCase().trim();

            // Hash the password with bcrypt (cost factor 10)
            const passwordHash = bcryptLib.hashSync(plaintextPassword, this.BCRYPT_COST);

            const record = {
                id: this.SINGLETON_KEY,
                email: normalizedEmail,
                password_hash: passwordHash,
                user_id: userId,
                cached_at: new Date().toISOString()
            };

            // 1. Persist to LocalStorage vault (synchronous instant backup)
            try {
                localStorage.setItem(this.VAULT_STORAGE_KEY, JSON.stringify(record));
            } catch (lsErr) {
                console.warn('[OfflineCredentialStore] LocalStorage vault write warning:', lsErr);
            }

            // 2. Persist to IndexedDB
            try {
                if (typeof OfflineDB !== 'undefined') {
                    if (!OfflineDB.db) {
                        await OfflineDB.open();
                    }
                    await OfflineDB.put(this.STORE_NAME, record);
                }
            } catch (idbErr) {
                console.warn('[OfflineCredentialStore] IndexedDB write warning (vault fallback active):', idbErr);
            }

            console.log('[OfflineCredentialStore] Credentials cached successfully for offline login (User:', normalizedEmail, ')');
            return true;
        } catch (err) {
            console.error('[OfflineCredentialStore] Failed to store credentials:', err);
            return false;
        }
    },

    /**
     * Read the cached credential record from IndexedDB or fallback to LocalStorage vault.
     * @returns {Promise<{id: string, email: string, password_hash: string, user_id: string}|null>}
     */
    async getCachedRecord() {
        // 1. Try IndexedDB first
        try {
            if (typeof OfflineDB !== 'undefined') {
                if (!OfflineDB.db) {
                    await OfflineDB.open();
                }
                const record = await OfflineDB.get(this.STORE_NAME, this.SINGLETON_KEY);
                if (record && record.email && record.password_hash) {
                    return record;
                }
            }
        } catch (idbErr) {
            console.warn('[OfflineCredentialStore] IndexedDB read error, falling back to vault:', idbErr);
        }

        // 2. Fallback to LocalStorage vault
        try {
            const rawVault = localStorage.getItem(this.VAULT_STORAGE_KEY);
            if (rawVault) {
                const parsed = JSON.parse(rawVault);
                if (parsed && parsed.email && parsed.password_hash) {
                    return parsed;
                }
            }
        } catch (lsErr) {
            console.warn('[OfflineCredentialStore] LocalStorage vault read error:', lsErr);
        }

        return null;
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

            const bcryptLib = this._getBcrypt();
            if (!bcryptLib) {
                return { valid: false, error: 'Offline authentication engine not ready.' };
            }

            const record = await this.getCachedRecord();

            if (!record) {
                return {
                    valid: false,
                    error: 'No offline credentials cached on this device. Please connect to the internet and log in once.'
                };
            }

            const normalizedInputEmail = email.toLowerCase().trim();
            const storedEmail = (record.email || '').toLowerCase().trim();

            // Check email match
            if (storedEmail !== normalizedInputEmail) {
                return {
                    valid: false,
                    error: `This account (${email}) has no offline access on this device. Only the last online user (${storedEmail}) can sign in offline.`
                };
            }

            // Verify password against bcrypt hash
            const isMatch = bcryptLib.compareSync(plaintextPassword, record.password_hash);

            if (isMatch) {
                console.log('[OfflineCredentialStore] Offline credential verification successful for:', storedEmail);
                return { valid: true, userId: record.user_id };
            } else {
                return { valid: false, error: 'Invalid password for offline login.' };
            }
        } catch (err) {
            console.error('[OfflineCredentialStore] Credential verification exception:', err);
            return { valid: false, error: 'Offline authentication error: ' + (err.message || 'Please try again.') };
        }
    },

    /**
     * Clear all cached credentials from IndexedDB and LocalStorage vault.
     * (Only called if user explicitly requests wiping all offline credentials).
     */
    async clearCredentials() {
        try {
            localStorage.removeItem(this.VAULT_STORAGE_KEY);
            if (typeof OfflineDB !== 'undefined') {
                await OfflineDB.clear(this.STORE_NAME);
            }
            console.log('[OfflineCredentialStore] Cached credentials purged.');
        } catch (err) {
            console.warn('[OfflineCredentialStore] Failed to clear credentials:', err);
        }
    },

    /**
     * Check if there are any cached credentials available for offline login.
     * @returns {Promise<boolean>}
     */
    async hasCredentials() {
        try {
            const record = await this.getCachedRecord();
            return !!record;
        } catch (err) {
            return false;
        }
    },

    /**
     * Get the cached user's email (for display/pre-fill purposes on the offline login screen).
     * Never exposes the password hash.
     * @returns {Promise<string|null>}
     */
    async getCachedEmail() {
        try {
            const record = await this.getCachedRecord();
            return record ? record.email : null;
        } catch (err) {
            return null;
        }
    },

    /**
     * Create an offline session in localStorage so app.html recognizes the authenticated user.
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
        localStorage.setItem('sb-offline-auth-token', JSON.stringify(offlineSession));
        console.log('[OfflineCredentialStore] Offline session active in localStorage.');
    },

    /**
     * Clear the active offline session from localStorage.
     * (Does NOT erase the cached credentials in vault/IndexedDB).
     */
    clearOfflineSession() {
        localStorage.removeItem('stomata_offline_session');
        localStorage.removeItem('sb-offline-auth-token');
    }
};

if (typeof window !== 'undefined') {
    window.OfflineCredentialStore = OfflineCredentialStore;
}
