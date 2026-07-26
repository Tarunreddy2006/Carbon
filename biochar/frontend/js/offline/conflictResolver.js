const ConflictResolver = {
    async detectConflict(originalSupabase, entityType, entityId, localUpdatedAt) {
        if (!localUpdatedAt) return false;
        
        try {
            const { data, error } = await originalSupabase
                .from(entityType)
                .select('updated_at')
                .eq('id', entityId)
                .maybeSingle();
                
            if (error || !data) return false;
            
            const remoteTime = new Date(data.updated_at).getTime();
            const localTime = new Date(localUpdatedAt).getTime();
            
            // remote is newer
            if (remoteTime > localTime) {
                console.warn(`Conflict detected for ${entityType} ID ${entityId}. Server: ${data.updated_at}, Local: ${localUpdatedAt}`);
                return true;
            }
        } catch (e) {
            console.error("Error detecting conflict:", e);
        }
        return false;
    },

    async resolveConflict(queueItem) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'conflict-modal-overlay';
            modal.style = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                font-family: 'Inter', sans-serif;
            `;
            
            modal.innerHTML = `
                <div class="conflict-modal-content" style="
                    background: var(--bg-card, #1e1e2d);
                    border: 1px solid var(--border-color, #2d2d3f);
                    padding: 24px;
                    border-radius: 12px;
                    max-width: 500px;
                    width: 90%;
                    color: var(--text-color, #e1e1e6);
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
                ">
                    <h3 style="margin-top: 0; color: #ffb86c; display: flex; align-items: center; gap: 8px;">
                        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        Sync Conflict Detected
                    </h3>
                    <p style="font-size: 14px; line-height: 1.5; opacity: 0.9;">
                        The record in table <strong>${queueItem.entity_type}</strong> (ID: ${queueItem.entity_id.substring(0, 8)}...) has been modified on the server since your last offline edit.
                    </p>
                    <div style="margin: 20px 0; display: flex; flex-direction: column; gap: 12px;">
                        <button id="resolve-overwrite" class="btn" style="background: #ef5350; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; text-align: left; font-size: 13px;">
                            <strong>Overwrite Server:</strong> Keep my local changes and force update the server.
                        </button>
                        <button id="resolve-discard" class="btn" style="background: #4ecdc4; color: #1e1e2d; border: none; padding: 10px; border-radius: 6px; cursor: pointer; text-align: left; font-size: 13px;">
                            <strong>Discard Local:</strong> Throw away my local offline edits and pull the server version.
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            modal.querySelector('#resolve-overwrite').onclick = () => {
                document.body.removeChild(modal);
                resolve('overwrite');
            };
            
            modal.querySelector('#resolve-discard').onclick = () => {
                document.body.removeChild(modal);
                resolve('discard');
            };
        });
    }
};

window.ConflictResolver = ConflictResolver;
