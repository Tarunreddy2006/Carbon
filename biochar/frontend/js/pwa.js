/* ═══════════════════════════════════════════════════════════════════════════
 * Stomata Biochar MRV — PWA & Service Worker Registration Manager
 * ═══════════════════════════════════════════════════════════════════════════ */

const PWA = {
    deferredPrompt: null,
    swRegistration: null,
    isStandalone: false,

    init() {
        // Force update service worker cache to pull fresh client files
        const FORCE_SW_VERSION = 'v1.0.6';
        const SW_VERSION_KEY = 'stomata_sw_version_forced';
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && localStorage.getItem(SW_VERSION_KEY) !== FORCE_SW_VERSION) {
            console.log("🔄 Clearing stale PWA service worker cache and registering new version...");
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let reg of registrations) {
                    reg.unregister();
                }
                if (typeof caches !== 'undefined') {
                    caches.keys().then(names => {
                        return Promise.all(names.map(name => caches.delete(name)));
                    }).then(() => {
                        localStorage.setItem(SW_VERSION_KEY, FORCE_SW_VERSION);
                        window.location.reload();
                    });
                } else {
                    localStorage.setItem(SW_VERSION_KEY, FORCE_SW_VERSION);
                    window.location.reload();
                }
            }).catch(() => {
                localStorage.setItem(SW_VERSION_KEY, FORCE_SW_VERSION);
                window.location.reload();
            });
            return;
        }

        this.checkStandalone();
        this.registerServiceWorker();
        this.setupInstallPrompt();
        this.injectUpdateUI();
    },

    checkStandalone() {
        this.isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone ||
            document.referrer.includes('android-app://');
        if (this.isStandalone) {
            console.log("📱 Running in standalone PWA mode.");
            document.documentElement.classList.add('pwa-standalone');
        }
    },

    async registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log("⚠ Service Worker is not supported in this browser environment.");
            return;
        }

        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
            this.swRegistration = registration;
            console.log("✔ Service Worker registered with scope:", registration.scope);

            // Handle updates found
            registration.onupdatefound = () => {
                const installingWorker = registration.installing;
                if (!installingWorker) return;

                installingWorker.onstatechange = () => {
                    if (installingWorker.state === 'installed') {
                        if (navigator.serviceWorker.controller) {
                            console.log("✨ New PWA update available!");
                            this.showUpdateBanner(registration);
                        } else {
                            console.log("✔ PWA contents cached for offline use.");
                        }
                    }
                };
            };

            // Detect controller change (when new worker takes over)
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true;
                    console.log("🔄 Service Worker controller changed. Reloading page...");
                    window.location.reload();
                }
            });

        } catch (error) {
            console.error("❌ Service Worker registration failed:", error);
        }
    },

    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent Chrome 67 and earlier from automatically showing prompt
            e.preventDefault();
            this.deferredPrompt = e;
            console.log("📥 PWA install prompt available.");

            // Notify UI to display Install Button
            this.showInstallButton();
            window.dispatchEvent(new CustomEvent('pwa-installable'));
        });

        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            console.log("🎉 PWA installed successfully.");
            this.hideInstallButton();
            if (typeof Toast !== 'undefined') {
                Toast.show({ message: 'Stomata Biochar App installed successfully!', type: 'success' });
            }
        });
    },

    showInstallButton() {
        if (this.isStandalone) return;

        const installBtn = document.getElementById('pwa-install-btn');
        if (installBtn) {
            installBtn.style.display = 'inline-flex';
            installBtn.onclick = () => this.promptInstall();
        }
    },

    hideInstallButton() {
        const installBtn = document.getElementById('pwa-install-btn');
        if (installBtn) {
            installBtn.style.display = 'none';
        }
    },

    async promptInstall() {
        if (!this.deferredPrompt) {
            console.log("No install prompt available.");
            return;
        }

        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log(`User response to install prompt: ${outcome}`);
        this.deferredPrompt = null;

        if (outcome === 'accepted') {
            this.hideInstallButton();
        }
    },

    injectUpdateUI() {
        const updateBanner = document.createElement('div');
        updateBanner.id = 'pwa-update-banner';
        updateBanner.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 24px;
            background: rgba(15, 23, 42, 0.95);
            border: 1px solid rgba(56, 189, 248, 0.4);
            color: #e2e8f0;
            padding: 12px 18px;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: none;
            align-items: center;
            gap: 12px;
            font-family: 'Inter', sans-serif;
            font-size: 13px;
            backdrop-filter: blur(10px);
        `;
        updateBanner.innerHTML = `
            <span>A new version of Stomata is available.</span>
            <button id="pwa-update-btn" style="
                background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%);
                color: #090d16;
                border: none;
                padding: 6px 12px;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
                font-size: 12px;
            ">Update Now</button>
        `;
        document.body.appendChild(updateBanner);
    },

    showUpdateBanner(registration) {
        const banner = document.getElementById('pwa-update-banner');
        const btn = document.getElementById('pwa-update-btn');

        if (banner && btn) {
            banner.style.display = 'flex';
            btn.onclick = () => {
                if (registration && registration.waiting) {
                    registration.waiting.postMessage({ action: 'skipWaiting' });
                }
            };
        }
    }
};

// Initialize on DOM load
if (typeof window !== 'undefined') {
    window.PWA = PWA;
    document.addEventListener('DOMContentLoaded', () => PWA.init());
}
