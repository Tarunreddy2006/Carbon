const OfflineUI = {
    banner: null,
    indicator: null,

    init() {
        this.injectCSS();
        this.createUIElements();
        this.updateUI();

        window.addEventListener('sync-status-change', () => this.updateUI());
        window.addEventListener('queue-updated', () => this.updateUI());
        window.addEventListener('connectivity-change', () => this.updateUI());
    },

    injectCSS() {
        const style = document.createElement('style');
        style.innerHTML = `
            .offline-banner {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                background: linear-gradient(135deg, #ffb86c 0%, #ff79c6 100%);
                color: #1e1e2d;
                text-align: center;
                padding: 10px;
                font-weight: 600;
                font-size: 13px;
                z-index: 9999;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                font-family: 'Inter', sans-serif;
                transition: transform 0.3s ease;
                transform: translateY(-100%);
            }
            .offline-banner.visible {
                transform: translateY(0);
            }
            body.offline-active {
                margin-top: 38px;
            }
            .sync-indicator-widget {
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: rgba(30, 30, 45, 0.92);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.12);
                color: #e1e1e6;
                padding: 12px 16px;
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                z-index: 9999;
                font-family: 'Inter', sans-serif;
                display: flex;
                flex-direction: column;
                gap: 8px;
                min-width: 220px;
                font-size: 12px;
                transition: opacity 0.3s ease, box-shadow 0.2s ease;
                cursor: grab;
                user-select: none;
            }
            .sync-indicator-widget:active {
                cursor: grabbing;
                box-shadow: 0 14px 40px rgba(0, 0, 0, 0.7);
            }
            .sync-drag-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                cursor: grab;
                padding-bottom: 4px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
            .sync-status-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-weight: 600;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .status-synced { color: #50fa7b; }
            .status-syncing { color: #8be9fd; }
            .status-pending { color: #ffb86c; }
            .status-failed { color: #ff5555; }
            
            .btn-sync-now {
                background: linear-gradient(135deg, #6272a4 0%, #44475a 100%);
                border: none;
                color: white;
                padding: 6px 12px;
                border-radius: 6px;
                font-weight: 500;
                cursor: pointer;
                font-size: 11px;
                text-align: center;
                transition: filter 0.2s;
            }
            .btn-sync-now:hover {
                filter: brightness(1.1);
            }
            .dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                display: inline-block;
                background-color: currentColor;
            }
            .dot-syncing {
                animation: pulse 1.2s infinite ease-in-out;
            }
            @keyframes pulse {
                0% { opacity: 0.3; transform: scale(0.8); }
                50% { opacity: 1; transform: scale(1.2); }
                100% { opacity: 0.3; transform: scale(0.8); }
            }
        `;
        document.head.appendChild(style);
    },

    createUIElements() {
        this.banner = document.createElement('div');
        this.banner.className = 'offline-banner';
        this.updateBannerText();
        document.body.appendChild(this.banner);

        this.indicator = document.createElement('div');
        this.indicator.className = 'sync-indicator-widget';
        document.body.appendChild(this.indicator);
        this.makeDraggable(this.indicator);
    },

    makeDraggable(el) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        try {
            const saved = localStorage.getItem('sync_widget_pos');
            if (saved) {
                const pos = JSON.parse(saved);
                if (pos.left !== undefined && pos.top !== undefined) {
                    el.style.left = pos.left + 'px';
                    el.style.top = pos.top + 'px';
                    el.style.bottom = 'auto';
                    el.style.right = 'auto';
                }
            }
        } catch (e) {}

        const onDragStart = (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;

            isDragging = true;
            el.style.cursor = 'grabbing';
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const rect = el.getBoundingClientRect();
            startX = clientX;
            startY = clientY;
            initialLeft = rect.left;
            initialTop = rect.top;

            document.addEventListener('mousemove', onDragMove);
            document.addEventListener('mouseup', onDragEnd);
            document.addEventListener('touchmove', onDragMove, { passive: false });
            document.addEventListener('touchend', onDragEnd);
        };

        const onDragMove = (e) => {
            if (!isDragging) return;
            if (e.cancelable) e.preventDefault();

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const deltaX = clientX - startX;
            const deltaY = clientY - startY;

            let newLeft = initialLeft + deltaX;
            let newTop = initialTop + deltaY;

            const maxLeft = window.innerWidth - el.offsetWidth - 10;
            const maxTop = window.innerHeight - el.offsetHeight - 10;
            newLeft = Math.max(10, Math.min(newLeft, maxLeft));
            newTop = Math.max(10, Math.min(newTop, maxTop));

            el.style.left = newLeft + 'px';
            el.style.top = newTop + 'px';
            el.style.bottom = 'auto';
            el.style.right = 'auto';
        };

        const onDragEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            el.style.cursor = 'grab';

            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            document.removeEventListener('touchmove', onDragMove);
            document.removeEventListener('touchend', onDragEnd);

            const rect = el.getBoundingClientRect();
            try {
                localStorage.setItem('sync_widget_pos', JSON.stringify({
                    left: rect.left,
                    top: rect.top
                }));
            } catch (e) {}
        };

        el.addEventListener('mousedown', onDragStart);
        el.addEventListener('touchstart', onDragStart, { passive: true });
    },

    updateBannerText() {
        if (!this.banner) return;
        const lastSync = (typeof AuthRepository !== 'undefined' && AuthRepository.getLastSyncTimestamp)
            ? AuthRepository.getLastSyncTimestamp()
            : 'Recently';
        this.banner.innerHTML = `
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            Working Offline • Using locally cached organization data. Last synchronized: ${lastSync}
        `;
    },

    async updateUI() {
        const isOnline = Connectivity.isOnline;
        const queue = await SyncQueue.getPending();
        const pendingCount = queue.length;
        const uploadingCount = queue.filter(q => q.operation_type === 'FILE_UPLOAD').length;
        
        if (!isOnline) {
            this.updateBannerText();
            this.banner.classList.add('visible');
            document.body.classList.add('offline-active');
        } else {
            this.banner.classList.remove('visible');
            document.body.classList.remove('offline-active');
        }

        let statusText = 'Synced';
        let statusClass = 'status-synced';
        let showDotSyncing = false;

        if (SyncEngine.isSyncing) {
            statusText = 'Syncing';
            statusClass = 'status-syncing';
            showDotSyncing = true;
        } else if (pendingCount > 0) {
            const hasFailed = queue.some(q => q.sync_status === 'failed');
            if (hasFailed) {
                statusText = 'Failed';
                statusClass = 'status-failed';
            } else {
                statusText = 'Pending';
                statusClass = 'status-pending';
            }
        }

        this.indicator.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                <span style="font-weight: 600; opacity: 0.7;">Sync Status</span>
                <span class="sync-status-badge ${statusClass}">
                    <span class="dot ${showDotSyncing ? 'dot-syncing' : ''}"></span>
                    ${statusText}
                </span>
            </div>
            <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 4px;">
                <div>Queue items: <strong>${pendingCount}</strong></div>
                <div>Pending uploads: <strong>${uploadingCount}</strong></div>
            </div>
            ${isOnline && pendingCount > 0 ? `
                <button id="btn-manual-sync" class="btn-sync-now" style="margin-top: 8px;">Sync Now</button>
            ` : ''}
        `;

        const btnManual = this.indicator.querySelector('#btn-manual-sync');
        if (btnManual) {
            btnManual.onclick = () => {
                SyncEngine.sync();
            };
        }
    }
};

window.OfflineUI = OfflineUI;
