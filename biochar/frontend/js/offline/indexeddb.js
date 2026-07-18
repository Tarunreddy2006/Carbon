const OfflineDB = {
    dbName: 'stomata_offline_db',
    dbVersion: 1,
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
        'evidence_files'
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
            };
        });
    },

    async getAll(storeName) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async get(storeName, key) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async put(storeName, data) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async delete(storeName, key) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },

    async clear(storeName) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }
};

window.OfflineDB = OfflineDB;
