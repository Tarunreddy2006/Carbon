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
                
                if (res.status === 200 || res.status === 401 || res.status === 403 || res.status === 400 || res.status === 500) {
                    this.setOnline();
                    this.hasVerified = true;
                    this.verifyPromise = null;
                    return true;
                } else {
                    this.setOffline();
                    this.hasVerified = true;
                    this.verifyPromise = null;
                    return false;
                }
            } catch (err) {
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
