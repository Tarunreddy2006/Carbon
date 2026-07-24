/* ═══════════════════════════════════════════════════════════════════════════
 * Stomata Biochar MRV — Production Service Worker
 * Version: 1.0.0
 * ═══════════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'stomata-biochar-v1.0.1';
const RUNTIME_CACHE = 'stomata-runtime-v1.0.1';

// Core Application Shell Assets to Pre-cache
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/app.html',
    '/pages/auth/login.html',
    '/pages/auth/signup.html',

    // CSS Design System
    '/css/variables.css',
    '/css/base.css',
    '/css/components.css',
    '/css/layout.css',
    '/css/theme.css',

    // Core Scripts
    '/js/config.js',
    '/js/utils.js',
    '/js/supabase.js',
    '/js/theme.js',
    '/js/toast.js',
    '/js/modal.js',
    '/js/form.js',
    '/js/table.js',
    '/js/permissions.js',
    '/js/auth.js',
    '/js/router.js',
    '/js/pwa.js',

    // Modules
    '/js/modules/dashboard.js',
    '/js/modules/projects.js',
    '/js/modules/feedstock.js',
    '/js/modules/batches.js',
    '/js/modules/pyrolysis.js',
    '/js/modules/laboratory.js',
    '/js/modules/distribution.js',
    '/js/modules/settings.js',
    '/js/modules/evidence.js',

    // Offline Subsystem
    '/js/offline/indexeddb.js',
    '/js/offline/connectivity.js',
    '/js/offline/queue.js',
    '/js/offline/uploadQueue.js',
    '/js/offline/conflictResolver.js',
    '/js/offline/syncEngine.js',
    '/js/offline/storage.js',
    '/js/offline/offlineUI.js',

    // Assets & Icons
    '/assets/stomata_logo.jpeg',
    '/assets/icons/icon-192x192.png',
    '/assets/icons/icon-512x512.png',
    '/assets/icons/icon-maskable-192x192.png',
    '/assets/icons/icon-maskable-512x512.png',
    '/assets/icons/icon.svg',
    '/manifest.json',

    // External CDN Dependencies (Pre-cached for offline resilience)
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdn.jsdelivr.net/npm/chart.js@4',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

/* ── Install Event: Cache Application Shell ──────────────────────────────── */
self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Installing version:', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Pre-caching Application Shell');
            return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                console.warn('[ServiceWorker] Some non-critical pre-cache items failed:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

/* ── Activate Event: Clean Old Cache Storage ─────────────────────────────── */
self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activating version:', CACHE_NAME);
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
                        console.log('[ServiceWorker] Removing obsolete cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

/* ── Fetch Event: Intelligent Caching Strategies ─────────────────────────── */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Security Isolation: Exclude non-GET requests, API routes, and Supabase backend queries
    // API responses, secrets, and auth tokens MUST NOT be stored in HTTP ServiceWorker cache.
    // Database and queue data are safely handled by IndexedDB (OfflineDB).
    if (
        request.method !== 'GET' ||
        url.pathname.startsWith('/api/') ||
        url.hostname.includes('supabase.co') ||
        request.headers.has('Authorization')
    ) {
        return; // Pass through to network natively
    }

    // 2. HTML Navigation Requests -> Network First, Fallback to Cache / App Shell
    if (request.mode === 'navigate' || request.headers.get('Accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    console.log('[ServiceWorker] Offline navigation request:', url.pathname);
                    const cachedResponse = await caches.match(request);
                    if (cachedResponse) return cachedResponse;

                    // Fallback to app shell
                    if (url.pathname.startsWith('/pages/auth/')) {
                        return caches.match('/pages/auth/login.html');
                    }
                    return caches.match('/app.html') || caches.match('/index.html');
                })
        );
        return;
    }

    // 3. Static Assets (CSS, JS, Images, Fonts) -> Cache First with Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseClone = networkResponse.clone();
                        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch(() => cachedResponse); // Silent fail on offline background revalidation

            return cachedResponse || fetchPromise;
        })
    );
});

/* ── Message Listener: Handle Skip Waiting & Dynamic Messages ────────────── */
self.addEventListener('message', (event) => {
    if (event.data && (event.data.action === 'skipWaiting' || event.data.type === 'SKIP_WAITING')) {
        console.log('[ServiceWorker] Skip waiting requested. Activating new worker...');
        self.skipWaiting();
    }
});
