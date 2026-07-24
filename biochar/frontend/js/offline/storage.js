class SupabaseQueryBuilder {
    constructor(tableName) {
        this.tableName = tableName;
        this.filters = [];
        this.mutationType = null;
        this.payload = null;
        this.selectColumns = '*';
        this.isSingle = false;
    }

    select(columns) {
        this.mutationType = 'SELECT';
        this.selectColumns = columns || '*';
        return this;
    }

    insert(payload) {
        this.mutationType = 'INSERT';
        this.payload = payload;
        return this;
    }

    update(payload) {
        this.mutationType = 'UPDATE';
        this.payload = payload;
        return this;
    }

    delete() {
        this.mutationType = 'DELETE';
        return this;
    }

    eq(column, value) {
        this.filters.push({ type: 'eq', column, value });
        return this;
    }

    filter(column, operator, value) {
        this.filters.push({ type: 'filter', column, operator, value });
        return this;
    }

    order(column, options) {
        this.filters.push({ type: 'order', column, options });
        return this;
    }

    limit(count) {
        this.filters.push({ type: 'limit', count });
        return this;
    }

    maybeSingle() {
        this.isSingle = true;
        return this;
    }

    single() {
        this.isSingle = true;
        return this;
    }

    async then(onfulfilled, onrejected) {
        try {
            const res = await this.execute();
            return onfulfilled(res);
        } catch (err) {
            if (onrejected) return onrejected(err);
            throw err;
        }
    }

    async execute() {
        const isOnline = typeof Connectivity !== 'undefined' ? Connectivity.isOnline : navigator.onLine;
        
        if (isOnline && window.originalSupabase) {
            try {
                let query = window.originalSupabase.from(this.tableName);
                
                if (this.mutationType === 'SELECT') {
                    query = query.select(this.selectColumns || '*');
                } else if (this.mutationType === 'INSERT') {
                    query = query.insert(this.payload);
                } else if (this.mutationType === 'UPDATE') {
                    query = query.update(this.payload);
                } else if (this.mutationType === 'DELETE') {
                    query = query.delete();
                }

                this.filters.forEach(f => {
                    if (f.type === 'eq') query = query.eq(f.column, f.value);
                    else if (f.type === 'filter') query = query.filter(f.column, f.operator, f.value);
                    else if (f.type === 'order') query = query.order(f.column, f.options);
                    else if (f.type === 'limit') query = query.limit(f.count);
                });

                if (this.isSingle) {
                    query = query.maybeSingle();
                }

                const res = await query;

                if (res && res.error && res.error.message && res.error.message.includes('Failed to fetch')) {
                    console.warn(`[SupabaseQueryBuilder] Network fetch failed for ${this.tableName}, switching to offline cache.`);
                    if (typeof Connectivity !== 'undefined') Connectivity.setOffline();
                    return await this.executeOffline();
                }
                
                if (this.mutationType === 'SELECT' && res && res.data && !res.error) {
                    try {
                        const dataArray = Array.isArray(res.data) ? res.data : [res.data];
                        for (const item of dataArray) {
                            if (item && item.id) {
                                await OfflineDB.put(this.tableName, item);
                            }
                        }
                    } catch (cacheErr) {
                        console.warn(`[OfflineStorage] Local caching skipped for ${this.tableName}:`, cacheErr);
                    }
                }
                
                return res;
            } catch (netErr) {
                console.warn(`[SupabaseQueryBuilder] Network exception for ${this.tableName}, executing offline fallback:`, netErr.message || netErr);
                if (typeof Connectivity !== 'undefined') Connectivity.setOffline();
                return await this.executeOffline();
            }
        } else {
            return await this.executeOffline();
        }
    }

    async executeOffline() {
        console.log(`SupabaseQueryBuilder (OFFLINE): ${this.mutationType} on ${this.tableName}`);
        
        if (this.mutationType === 'SELECT') {
            const all = (await OfflineDB.getAll(this.tableName)) || [];
            let filtered = [...all];
            
            this.filters.forEach(f => {
                if (f.type === 'eq') {
                    filtered = filtered.filter(item => item && item[f.column] === f.value);
                }
            });
            
            if (this.isSingle) {
                return { data: filtered[0] || null, error: null };
            }
            return { data: filtered, error: null };
        }
        
        else if (this.mutationType === 'INSERT') {
            const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
            const insertedData = [];
            
            for (const singlePayload of payloads) {
                if (!singlePayload.id) {
                    singlePayload.id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now();
                }
                if (!singlePayload.created_at) {
                    singlePayload.created_at = new Date().toISOString();
                }
                
                try {
                    await OfflineDB.put(this.tableName, singlePayload);
                } catch (e) { }
                if (typeof SyncQueue !== 'undefined') {
                    await SyncQueue.push('CREATE', this.tableName, singlePayload.id, singlePayload);
                }
                insertedData.push(singlePayload);
            }
            
            return { data: Array.isArray(this.payload) ? insertedData : insertedData[0], error: null };
        }
        
        else if (this.mutationType === 'UPDATE') {
            const idFilter = this.filters.find(f => f.type === 'eq' && f.column === 'id');
            if (!idFilter) {
                return { data: null, error: { message: "Offline updates require an ID filter." } };
            }
            
            const targetId = idFilter.value;
            const existing = await OfflineDB.get(this.tableName, targetId);
            
            if (!existing) {
                return { data: null, error: { message: "Record not found in local cache." } };
            }
            
            const updated = { ...existing, ...this.payload, updated_at: new Date().toISOString() };
            try {
                await OfflineDB.put(this.tableName, updated);
            } catch (e) { }
            if (typeof SyncQueue !== 'undefined') {
                await SyncQueue.push('UPDATE', this.tableName, targetId, updated);
            }
            
            return { data: updated, error: null };
        }
        
        else if (this.mutationType === 'DELETE') {
            const idFilter = this.filters.find(f => f.type === 'eq' && f.column === 'id');
            if (!idFilter) {
                return { data: null, error: { message: "Offline deletes require an ID filter." } };
            }
            
            const targetId = idFilter.value;
            try {
                await OfflineDB.delete(this.tableName, targetId);
            } catch (e) { }
            if (typeof SyncQueue !== 'undefined') {
                await SyncQueue.push('DELETE', this.tableName, targetId, null);
            }
            
            return { data: null, error: null };
        }
        
        return { data: null, error: { message: "Unsupported offline query type." } };
    }
}

const OfflineStorage = {
    init() {
        if (!window.originalSupabase) {
            window.originalSupabase = window.supabase || window.supabaseClient;
        }

        const offlineSupabase = {
            from(tableName) {
                if (OfflineDB.tables.includes(tableName)) {
                    return new SupabaseQueryBuilder(tableName);
                }
                return window.originalSupabase.from(tableName);
            },
            
            get auth() {
                return window.originalSupabase.auth;
            }
        };

        window.supabase = offlineSupabase;
        window.supabaseClient = offlineSupabase;
        console.log("✔ Supabase client intercepted by OfflineStorage wrapper.");
    },

    async get(tableName, key) {
        try {
            return await OfflineDB.get(tableName, key);
        } catch (err) {
            console.warn(`[OfflineStorage] get failed for table '${tableName}':`, err);
            return null;
        }
    },

    async getAll(tableName) {
        try {
            return await OfflineDB.getAll(tableName);
        } catch (err) {
            console.warn(`[OfflineStorage] getAll failed for table '${tableName}':`, err);
            return [];
        }
    },

    async put(tableName, data) {
        try {
            return await OfflineDB.put(tableName, data);
        } catch (err) {
            console.warn(`[OfflineStorage] put failed for table '${tableName}':`, err);
            return null;
        }
    },

    async delete(tableName, key) {
        try {
            return await OfflineDB.delete(tableName, key);
        } catch (err) {
            console.warn(`[OfflineStorage] delete failed for table '${tableName}':`, err);
        }
    },

    async clear(tableName) {
        try {
            return await OfflineDB.clear(tableName);
        } catch (err) {
            console.warn(`[OfflineStorage] clear failed for table '${tableName}':`, err);
        }
    }
};

window.OfflineStorage = OfflineStorage;
