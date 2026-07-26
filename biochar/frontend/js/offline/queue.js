const SyncQueue = {
    async push(operationType, entityType, entityId, payload) {
        const localUuid = (typeof Utils !== 'undefined' && Utils.uuid) ? Utils.uuid() : crypto.randomUUID();
        const item = {
            local_uuid: localUuid,
            operation_type: operationType, // 'CREATE' | 'UPDATE' | 'DELETE' | 'FILE_UPLOAD'
            entity_type: entityType,       // table name or special file upload
            entity_id: entityId,
            payload: payload,
            created_at: new Date().toISOString(),
            retry_count: 0,
            sync_status: 'pending'
        };
        await OfflineDB.put('sync_queue', item);
        
        // Trigger UI and engine sync checks
        window.dispatchEvent(new CustomEvent('queue-updated'));
        return item;
    },

    async getPending() {
        const all = await OfflineDB.getAll('sync_queue');
        return all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    },

    async updateStatus(localUuid, updates) {
        const item = await OfflineDB.get('sync_queue', localUuid);
        if (item) {
            Object.assign(item, updates);
            await OfflineDB.put('sync_queue', item);
            window.dispatchEvent(new CustomEvent('queue-updated'));
        }
    },

    async remove(localUuid) {
        await OfflineDB.delete('sync_queue', localUuid);
        window.dispatchEvent(new CustomEvent('queue-updated'));
    }
};

window.SyncQueue = SyncQueue;
