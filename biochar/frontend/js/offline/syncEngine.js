const SyncEngine = {
    isSyncing: false,

    init() {
        window.addEventListener('connectivity-change', async (e) => {
            if (e.detail.isOnline) {
                console.log("SyncEngine: Online triggered. Auto-starting synchronization.");
                await this.sync();
            }
        });
        
        window.addEventListener('queue-updated', () => {
            this.updateStats();
        });
        
        setInterval(() => {
            if (!this.isSyncing) {
                Connectivity.verify().then(online => {
                    if (online) this.sync();
                });
            }
        }, 30000);
        
        setTimeout(() => {
            Connectivity.verify().then(online => {
                if (online) this.sync();
            });
        }, 1000);
    },

    async sync() {
        if (this.isSyncing) return;
        
        const online = await Connectivity.verify();
        if (!online) {
            console.log("SyncEngine: Cannot sync, offline.");
            return;
        }

        const queue = await SyncQueue.getPending();
        if (queue.length === 0) {
            this.isSyncing = false;
            this.updateStats();
            return;
        }

        this.isSyncing = true;
        this.updateStats();
        
        console.log(`SyncEngine: Starting synchronization of ${queue.length} items...`);
        
        const originalSupabase = window.originalSupabase;
        if (!originalSupabase) {
            this.isSyncing = false;
            this.updateStats();
            return;
        }
        
        for (const item of queue) {
            if (!Connectivity.isOnline) {
                console.warn("SyncEngine: Lost connection during sync. Pausing.");
                break;
            }

            try {
                await SyncQueue.updateStatus(item.local_uuid, { sync_status: 'syncing' });
                
                if (item.operation_type === 'CREATE') {
                    // Check if it already exists remotely
                    const { data: existing } = await originalSupabase
                        .from(item.entity_type)
                        .select('id')
                        .eq('id', item.entity_id)
                        .maybeSingle();

                    if (!existing) {
                        const { error } = await originalSupabase
                            .from(item.entity_type)
                            .insert(item.payload);
                        if (error) throw error;
                    }
                } 
                else if (item.operation_type === 'UPDATE') {
                    const hasConflict = await ConflictResolver.detectConflict(
                        originalSupabase,
                        item.entity_type,
                        item.entity_id,
                        item.payload.updated_at
                    );
                    
                    if (hasConflict) {
                        const decision = await ConflictResolver.resolveConflict(item);
                        if (decision === 'discard') {
                            const { data: fresh } = await originalSupabase
                                .from(item.entity_type)
                                .select('*')
                                .eq('id', item.entity_id)
                                .single();
                            if (fresh) {
                                await OfflineDB.put(item.entity_type, fresh);
                            }
                            await SyncQueue.remove(item.local_uuid);
                            continue;
                        }
                    }

                    const { error } = await originalSupabase
                        .from(item.entity_type)
                        .update(item.payload)
                        .eq('id', item.entity_id);
                    if (error) throw error;
                } 
                else if (item.operation_type === 'DELETE') {
                    const { error } = await originalSupabase
                        .from(item.entity_type)
                        .delete()
                        .eq('id', item.entity_id);
                    if (error) throw error;
                }
                else if (item.operation_type === 'FILE_UPLOAD') {
                    await UploadQueue.processFileUpload(item);
                }

                await SyncQueue.remove(item.local_uuid);
            } 
            catch (err) {
                console.error(`SyncEngine: Failed to sync queue item ${item.local_uuid}:`, err);
                const nextRetry = item.retry_count + 1;
                const nextStatus = nextRetry >= 5 ? 'failed' : 'pending';
                await SyncQueue.updateStatus(item.local_uuid, {
                    retry_count: nextRetry,
                    sync_status: nextStatus
                });
                
                if (nextStatus === 'failed') {
                    console.error("SyncEngine: Max retries exceeded. Halting sync queue to preserve order.");
                    break; 
                }
            }
        }
        
        if (Connectivity.isOnline) {
            await this.refreshCacheFromServer();
        }

        this.isSyncing = false;
        this.updateStats();
        console.log("SyncEngine: Synchronization loop complete.");
    },

    async refreshCacheFromServer() {
        const originalSupabase = window.originalSupabase;
        if (!originalSupabase) return;

        // Try getting active organization context
        let orgId = null;
        if (window.Auth && window.Auth.orgId) {
            orgId = window.Auth.orgId;
        }

        console.log("SyncEngine: Refreshing local cache from server...");
        for (const table of OfflineDB.tables) {
            try {
                let query = originalSupabase.from(table).select('*');
                
                // If valid org context available, filter relevant tables
                const isValidOrgId = orgId && (typeof Utils !== 'undefined' && Utils.isValidUuid ? Utils.isValidUuid(orgId) : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) && orgId !== '00000000-0000-0000-0000-000000000000';
                if (isValidOrgId && ['projects', 'feedstock_batches', 'pyrolysis_runs', 'biochar_batches', 'laboratory_tests', 'shipments', 'evidence'].includes(table)) {
                    if (table === 'projects') {
                        query = query.eq('organization_id', orgId);
                    } else if (table === 'evidence') {
                        query = query.eq('organization_id', orgId);
                    }
                    // For feedstock_batches, pyrolysis_runs, biochar_batches, laboratory_tests, shipments:
                    // They reference projects or organizations, let's limit or query standard set.
                }

                const { data, error } = await query.limit(200);
                if (data && !error) {
                    await OfflineDB.clear(table);
                    for (const row of data) {
                        await OfflineDB.put(table, row);
                    }
                }
            } catch (err) {
                console.warn(`SyncEngine: Could not refresh cache for ${table}:`, err);
            }
        }
    },

    updateStats() {
        window.dispatchEvent(new CustomEvent('sync-status-change'));
    }
};

window.SyncEngine = SyncEngine;
