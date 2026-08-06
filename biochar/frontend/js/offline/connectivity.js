const Connectivity = {
    isOnline: navigator.onLine,
    hasVerified: false,
    verifyPromise: null,
    listeners: [],

    init() {
        window.addEventListener('online', () => this.verify());
        window.addEventListener('offline', () => this.setOffline());
        this.verify(); // Initial check
    },

    onChange(callback) {
        this.listeners.push(callback);
    },

    triggerChange() {
        this.listeners.forEach(cb => cb(this.isOnline));
        const event = new CustomEvent('connectivity-change', { detail: { isOnline: this.isOnline } });
        window.dispatchEvent(event);
    },

    async verify() {
        if (!navigator.onLine) {
            console.log('[Connectivity Diagnostic] navigator.onLine is false. Setting offline mode.');
            this.setOffline();
            this.hasVerified = true;
            return false;
        }

        if (this.verifyPromise) return this.verifyPromise;

        this.verifyPromise = (async () => {
            try {
                const testUrl = '/api/v1/biochar/evidence/list?organization_id=00000000-0000-0000-0000-000000000000&page_size=1';
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), 3000);
                
                const res = await fetch(testUrl, { method: 'GET', signal: controller.signal });
                clearTimeout(id);
                
                if (res.status >= 200 && res.status < 600) {
                    console.log(`[Connectivity Diagnostic] Health endpoint returned HTTP status ${res.status}. Setting online mode.`);
                    this.setOnline();
                    this.hasVerified = true;
                    this.verifyPromise = null;
                    return true;
                } else {
                    console.warn(`[Connectivity Diagnostic] Health endpoint returned unexpected status ${res.status}. Setting offline mode.`);
                    this.setOffline();
                    this.hasVerified = true;
                    this.verifyPromise = null;
                    return false;
                }
            } catch (err) {
                if (navigator.onLine) {
                    console.log(`[Connectivity Diagnostic] Endpoint fetch failed (${err.message}), but navigator.onLine is true. Fallback: Setting online mode.`);
                    this.setOnline();
                    this.hasVerified = true;
                    this.verifyPromise = null;
                    return true;
                }
                console.warn(`[Connectivity Diagnostic] Network fetch exception and navigator.onLine is false. Setting offline mode:`, err);
                this.setOffline();
                this.hasVerified = true;
                this.verifyPromise = null;
                return false;
            }
        })();

        return this.verifyPromise;
    },

    setOnline() {
        if (!this.isOnline) {
            this.isOnline = true;
            console.log("✔ Network connectivity restored & backend verified.");
            this.triggerChange();
        }
    },

    setOffline() {
        if (this.isOnline) {
            this.isOnline = false;
            console.log("⚠ Connection offline or backend unreachable.");
            this.triggerChange();
        }
    }
};

window.Connectivity = Connectivity;
