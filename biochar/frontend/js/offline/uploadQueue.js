const UploadQueue = {
    async queueFileUpload(file, metadata) {
        // 1. Create a sync queue item of type 'FILE_UPLOAD'
        const queueItem = await SyncQueue.push('FILE_UPLOAD', 'evidence', metadata.evidence_id, {
            filename: file.name,
            mime_type: file.type || 'application/octet-stream',
            file_size: file.size,
            organization_id: metadata.organization_id,
            project_id: metadata.project_id,
            entity_type: metadata.entity_type,
            entity_id: metadata.entity_id,
            activity: metadata.activity,
            uploaded_by: metadata.uploaded_by,
            uploaded_by_role: metadata.uploaded_by_role,
            token: metadata.token || null,
            latitude: metadata.latitude || null,
            longitude: metadata.longitude || null
        });

        // 2. Save file blob locally
        await OfflineDB.put('pending_files', {
            local_uuid: queueItem.local_uuid,
            file_blob: file,
            filename: file.name,
            mime_type: file.type,
            file_size: file.size
        });
        
        return queueItem;
    },

    async processFileUpload(queueItem) {
        const fileData = await OfflineDB.get('pending_files', queueItem.local_uuid);
        if (!fileData) {
            console.warn(`File data missing for item: ${queueItem.local_uuid}. Skipping.`);
            return;
        }

        const payload = queueItem.payload;
        const file = fileData.file_blob;
        
        async function calculateSHA256(blob) {
            const arrayBuffer = await blob.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        }
        
        const sha256_hash = await calculateSHA256(file);

        let evidence_id = queueItem.entity_id;
        let upload_url, headers, object_key;

        // 1. Get presigned R2 upload URL
        if (payload.token) {
            const res = await fetch('/api/v1/biochar/public/attest/upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: payload.token,
                    filename: payload.filename,
                    mime_type: payload.mime_type,
                    file_size: payload.file_size
                })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed to generate public attestation R2 URL');
            }
            const data = await res.json();
            evidence_id = data.evidence_id;
            upload_url = data.upload_url;
            headers = data.headers;
            object_key = data.object_key;
        } else {
            const res = await fetch('/api/v1/biochar/evidence/upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed to generate R2 URL');
            }
            const data = await res.json();
            evidence_id = data.evidence_id;
            upload_url = data.upload_url;
            headers = data.headers;
        }

        // 2. Upload file directly to Cloudflare R2
        const r2Res = await fetch(upload_url, {
            method: 'PUT',
            headers: headers || {},
            body: file
        });
        if (!r2Res.ok) {
            throw new Error(`R2 storage PUT failed with status ${r2Res.status}`);
        }

        // 3. Confirm upload metadata with backend
        if (payload.token) {
            const formData = new FormData();
            formData.append("token", payload.token);
            formData.append("latitude", payload.latitude ? String(payload.latitude) : "0");
            formData.append("longitude", payload.longitude ? String(payload.longitude) : "0");
            formData.append("object_key", object_key);
            formData.append("filename", payload.filename);
            formData.append("mime_type", payload.mime_type);
            formData.append("file_size", String(payload.file_size));
            formData.append("sha256_hash", sha256_hash);

            const res = await fetch('/api/v1/biochar/public/attest', {
                method: 'POST',
                body: formData
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed to confirm public attestation with backend');
            }
        } else {
            const res = await fetch('/api/v1/biochar/evidence/confirm-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    evidence_id: evidence_id,
                    sha256_hash: sha256_hash
                })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed to confirm R2 upload with backend');
            }
        }

        // Clean up local binary
        await OfflineDB.delete('pending_files', queueItem.local_uuid);
    }
};

window.UploadQueue = UploadQueue;
