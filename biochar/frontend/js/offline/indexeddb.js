const OfflineDB = {
    dbName: 'stomata_offline_db',
    dbVersion: 4,
    db: null,

    tables: [
        'projects',
        'feedstock_batches',
        'pyrolysis_runs',
        'biochar_batches',
        'laboratory_tests',
        'biochar_samples',
        'laboratory_certificates',
        'laboratory_results',
        'shipments',
        'biochar_applications',
        'evidence',
        'evidence_files',
        'profiles',
        'organizations',
        'organization_members',
        'roles',
        'invitations'
    ],

    open() {
        return new Promise((resolve, reject) => {
            if (this.db) return resolve(this.db);
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (e) => reject(e.target.error);
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;

                // Create sync queue
                if (!db.objectStoreNames.contains('sync_queue')) {
                    db.createObjectStore('sync_queue', { keyPath: 'local_uuid' });
                }

                // Create pending files
                if (!db.objectStoreNames.contains('pending_files')) {
                    db.createObjectStore('pending_files', { keyPath: 'local_uuid' });
                }

                // Create cache stores
                this.tables.forEach(tableName => {
                    if (!db.objectStoreNames.contains(tableName)) {
                        db.createObjectStore(tableName, { keyPath: 'id' });
                    }
                });

                // Register missing RBAC stores explicitly
                const rbacStores = ['profiles', 'organizations', 'organization_members', 'roles', 'invitations'];
                rbacStores.forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        db.createObjectStore(storeName, { keyPath: 'id' });
                    }
                });
            };
        });
    },

    async getTransaction(storeName, mode = 'readonly') {
        try {
            const db = await this.open();
            if (!db || !db.objectStoreNames.contains(storeName)) {
                console.warn(`[OfflineDB] Store '${storeName}' not found in IndexedDB.`);
                return null;
            }
            return db.transaction(storeName, mode);
        } catch (err) {
            console.warn(`[OfflineDB] Failed to create transaction for '${storeName}':`, err);
            return null;
        }
    },

    async getAll(storeName) {
        try {
            const db = await this.open();
            if (!db || !db.objectStoreNames.contains(storeName)) {
                console.warn(`[OfflineDB] Store '${storeName}' not found in IndexedDB.`);
                return [];
            }
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(storeName, 'readonly');
                    const store = tx.objectStore(storeName);
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                } catch (err) {
                    console.warn(`[OfflineDB] Transaction failed for '${storeName}':`, err);
                    resolve([]);
                }
            });
        } catch (err) {
            console.warn(`[OfflineDB] getAll failed for '${storeName}':`, err);
            return [];
        }
    },

    async get(storeName, key) {
        try {
            const db = await this.open();
            if (!db || !db.objectStoreNames.contains(storeName)) {
                console.warn(`[OfflineDB] Store '${storeName}' not found in IndexedDB.`);
                return null;
            }
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(storeName, 'readonly');
                    const store = tx.objectStore(storeName);
                    const req = store.get(key);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => reject(req.error);
                } catch (err) {
                    console.warn(`[OfflineDB] Transaction failed for '${storeName}':`, err);
                    resolve(null);
                }
            });
        } catch (err) {
            console.warn(`[OfflineDB] get failed for '${storeName}':`, err);
            return null;
        }
    },

    async put(storeName, data) {
        try {
            const db = await this.open();
            if (!db || !db.objectStoreNames.contains(storeName)) {
                console.warn(`[OfflineDB] Store '${storeName}' not found in IndexedDB.`);
                return null;
            }
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    const req = store.put(data);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                } catch (err) {
                    console.warn(`[OfflineDB] Transaction failed for '${storeName}':`, err);
                    resolve(null);
                }
            });
        } catch (err) {
            console.warn(`[OfflineDB] put failed for '${storeName}':`, err);
            return null;
        }
    },

    async delete(storeName, key) {
        try {
            const db = await this.open();
            if (!db || !db.objectStoreNames.contains(storeName)) {
                console.warn(`[OfflineDB] Store '${storeName}' not found in IndexedDB.`);
                return null;
            }
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    const req = store.delete(key);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                } catch (err) {
                    console.warn(`[OfflineDB] Transaction failed for '${storeName}':`, err);
                    resolve();
                }
            });
        } catch (err) {
            console.warn(`[OfflineDB] delete failed for '${storeName}':`, err);
            return null;
        }
    },

    async clear(storeName) {
        try {
            const db = await this.open();
            if (!db || !db.objectStoreNames.contains(storeName)) {
                console.warn(`[OfflineDB] Store '${storeName}' not found in IndexedDB.`);
                return null;
            }
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    const req = store.clear();
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                } catch (err) {
                    console.warn(`[OfflineDB] Transaction failed for '${storeName}':`, err);
                    resolve();
                }
            });
        } catch (err) {
            console.warn(`[OfflineDB] clear failed for '${storeName}':`, err);
            return null;
        }
    }
};

window.OfflineDB = OfflineDB;
