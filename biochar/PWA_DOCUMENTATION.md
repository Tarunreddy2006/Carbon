# Stomata Biochar MRV — Progressive Web App (PWA) & Offline Architecture

This document provides a technical overview of the Progressive Web App (PWA) implementation, offline caching strategies, Service Worker lifecycle, and integration with the existing IndexedDB and `SyncEngine` subsystems in the Stomata Biochar application.

---

## 1. Overview & Architecture

The Stomata Biochar application is built as an offline-first, production-grade Progressive Web App (PWA). Once loaded online for the first time, all required application shell assets (HTML, CSS, JavaScript, icons, CDN dependencies, and fonts) are cached locally. Users can continue operating the application without an active internet connection.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BROWSER USER AGENT                            │
└─────────────────────────────────────────────────────────────────────────┘
        │                                                     │
   [HTTP Request]                                     [DB / API Mutations]
        ▼                                                     ▼
┌─────────────────────────┐                           ┌───────────────────┐
│     SERVICE WORKER      │                           │  OFFLINE STORAGE  │
│  (service-worker.js)    │                           │ (OfflineStorage)  │
└─────────────────────────┘                           └───────────────────┘
   ├── Pre-cache App Shell                                  ├── Intercepts DB
   ├── Stale-While-Revalidate Static                            ├── Caches Profiles
   ├── Network-First HTML Navigation                            └── Queues Mutations
   └── Excludes API/Auth Tokens                                     │
        │                                                       ▼
        ▼                                             ┌───────────────────┐
┌─────────────────────────┐                           │    INDEXEDDB      │
│  CACHE STORAGE (HTTP)   │                           │   (OfflineDB)     │
└─────────────────────────┘                           └───────────────────┘
                                                                │
                                                        [Connectivity]
                                                                ▼
                                                      ┌───────────────────┐
                                                      │    SYNC ENGINE    │
                                                      │   (SyncEngine)    │
                                                      └───────────────────┘
```

---

## 2. Service Worker & Caching Strategy (`service-worker.js`)

### Cache Versioning
Cache versioning is strictly enforced using version constants:
- Static Cache: `stomata-biochar-v1.0.0`
- Runtime Cache: `stomata-runtime-v1.0.0`

When a new Service Worker is deployed, old caches are automatically deleted during the `activate` phase.

### Caching Rules by Resource Type

| Resource Category | Request Target | Caching Strategy | Offline Behavior |
| :--- | :--- | :--- | :--- |
| **HTML Navigation** | `/`, `/app.html`, `/index.html`, `/pages/auth/login.html` | **Network First**, fallback to Cache | Loads cached App Shell HTML; zero browser dinosaur page |
| **Static Assets** | CSS (`/css/*`), JS (`/js/*`), Logos, Icons | **Cache First** (Stale-While-Revalidate) | Instant load from cache; updates in background |
| **External CDN** | Chart.js, Supabase JS, Google Fonts | **Cache First** | Pre-cached during SW installation |
| **API & Auth** | `/api/*`, `supabase.co`, Requests with Auth Headers | **Network Only** (Explicit SW Exclusion) | Bypasses SW HTTP cache; handled by IndexedDB & SyncEngine |

---

## 3. Security Isolation & Token Protection

To ensure compliance with enterprise security requirements:
- **No Sensitive Tokens in SW HTTP Cache**: Authorization headers, JWT tokens, user passwords, and raw API responses are **never** written to SW HTTP Cache Storage.
- **Session Tokens**: Managed securely by Supabase JS SDK inside `localStorage`.
- **Database Records**: Cached safely in client-side `IndexedDB` (`stomata_offline_db`).

---

## 4. Authentication Support Offline

1. **Active Local Session**: If a valid auth token (`sb-*-auth-token`) exists in `localStorage`, the user is granted access to `/app.html` offline. `getUserProfile()` retrieves cached profile and organization metadata from IndexedDB (`OfflineDB`).
2. **First-time Login**: Requiring initial authentication credentials requires an online connection to verify identity against Supabase Auth.
3. **Session Guards**: Navigating to protected routes without a valid session token triggers an immediate redirect to `/pages/auth/login.html`.

---

## 5. Offline Data Synchronization Integration

The PWA seamlessly integrates with the existing offline storage architecture:

1. **`OfflineDB` (`/js/offline/indexeddb.js`)**:
   - Manages client-side IndexedDB stores for projects, feedstock, pyrolysis runs, biochar batches, laboratory certificates, evidence, profiles, organizations, and roles.
2. **`OfflineStorage` (`/js/offline/storage.js`)**:
   - Intercepts `supabase.from()` calls. When offline, queries write directly to `OfflineDB` and append mutations (`CREATE`, `UPDATE`, `DELETE`) to `sync_queue`.
3. **`SyncEngine` (`/js/offline/syncEngine.js`)**:
   - Listens for connectivity restoration via `Connectivity`. Automatically processes `sync_queue` items in batch mode when internet returns.

---

## 6. Connectivity Indicators & User Experience

The application tracks connection states in real time:
- **Online Indicator**: Quiet operational state.
- **Offline Banner**: Appears at top of window (`Offline Mode — Changes will sync automatically.`).
- **Sync Indicator Widget**: Displays live counts of queued items, pending file uploads, and active status (`Synced`, `Syncing`, `Pending`, `Failed`).

---

## 7. Web App Manifest & App Installation (`manifest.json` & `pwa.js`)

### Manifest Features
- **App Name**: Stomata Biochar MRV
- **Display**: Standalone (hides browser address bar)
- **Theme Color**: `#0a0e17`
- **Icons**: 192x192 PNG, 512x512 PNG, and SVG maskable icon formats
- **Shortcuts**: One-click quick launchers for Dashboard, Batches, Feedstock, and Evidence

### Install Prompt Handling (`pwa.js`)
- Captures `beforeinstallprompt` event.
- Displays an **"Install App"** button in the main topbar action bar.
- Suppresses prompt if the app is already installed or running in `display-mode: standalone`.

---

## 8. Service Worker Update Flow

When a new version of `service-worker.js` is pushed:
1. Browser detects new SW and installs it in background.
2. PWA manager displays an update banner: `"A new version of Stomata is available. [Update Now]"`.
3. Clicking **Update Now** sends `{ action: 'skipWaiting' }` to the waiting worker.
4. Worker activates, purges old caches, and reloads active clients seamlessly.

---

## 9. Verification & Audit

### Chrome DevTools Audit Steps
1. Open **DevTools -> Application -> Service Workers**:
   - Status should show active and running with scope `/`.
2. Open **DevTools -> Application -> Manifest**:
   - Verify identity, theme color, icons (192px and 512px), and standalone display mode.
3. Test **Offline Mode**:
   - Check **Offline** box in DevTools Network tab.
   - Refresh page; verify app loads fully without error.
   - Perform CRUD operations; confirm queue counter increases in Sync Indicator Widget.
   - Uncheck **Offline** box; confirm background synchronization executes.
