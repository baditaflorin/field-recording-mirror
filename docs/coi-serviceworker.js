/* eslint-disable */
/*! Combined service worker:
 *  - injects COOP/COEP response headers so SharedArrayBuffer works on Pages
 *    (based on coi-serviceworker v0.1.7 by gzuidhof, MIT)
 *  - caches the app shell on first visit so the instrument loads offline
 *
 * On install we precache the few small files we know are stable. On every
 * fetch we add COOP/COEP headers, and for same-origin GETs we serve from the
 * cache first with a network fallback that refreshes the entry.
 */

const SHELL_CACHE = 'frm-shell-v1';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon.svg', './worklets/capture-processor.js'];

let coepCredentialless = false;

if (typeof window === 'undefined') {
  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches
        .open(SHELL_CACHE)
        .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
        .then(() => self.skipWaiting())
    );
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((k) => k.startsWith('frm-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)))
        )
        .then(() => self.clients.claim())
    );
  });

  self.addEventListener('message', (ev) => {
    if (!ev.data) return;
    if (ev.data.type === 'deregister') {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => clients.forEach((c) => c.navigate(c.url)));
    } else if (ev.data.type === 'coepCredentialless') {
      coepCredentialless = ev.data.value;
    }
  });

  self.addEventListener('fetch', (event) => {
    const r = event.request;
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;

    const request =
      coepCredentialless && r.mode === 'no-cors'
        ? new Request(r, {
            credentials: 'omit',
            cache: r.cache === 'only-if-cached' ? 'default' : r.cache,
          })
        : r;

    const isSameOriginGet =
      request.method === 'GET' && new URL(request.url).origin === self.location.origin;

    event.respondWith(
      (async () => {
        // Same-origin GETs: try cache first, fall back to network and refresh.
        if (isSameOriginGet) {
          const cache = await caches.open(SHELL_CACHE);
          const cached = await cache.match(request, { ignoreSearch: true });
          if (cached) {
            // Refresh in background — never blocks the response.
            fetch(request)
              .then((res) => {
                if (res.ok) cache.put(request, withCoiHeaders(res.clone()));
              })
              .catch(() => {});
            return withCoiHeaders(cached.clone());
          }
        }

        try {
          const response = await fetch(request);
          if (isSameOriginGet && response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, withCoiHeaders(response.clone())).catch(() => {});
          }
          return withCoiHeaders(response);
        } catch (e) {
          // Offline + nothing cached — return a minimal text response so the
          // page can show a sensible message instead of throwing.
          return new Response('offline and not cached', {
            status: 503,
            statusText: 'offline',
          });
        }
      })()
    );
  });

  function withCoiHeaders(response) {
    if (response.status === 0) return response;
    const headers = new Headers(response.headers);
    headers.set(
      'Cross-Origin-Embedder-Policy',
      coepCredentialless ? 'credentialless' : 'require-corp'
    );
    if (!coepCredentialless) headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
} else {
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem('coiReloadedBySelf');
    window.sessionStorage.removeItem('coiReloadedBySelf');
    const coepDegrading = reloadedBySelf == 'coepdegrade';

    if (window.crossOriginIsolated !== false) return;
    if (!window.isSecureContext) {
      console.warn('COOP/COEP Service Worker not registered: insecure context.');
      return;
    }

    navigator.serviceWorker
      .register(window.document.currentScript.src)
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          console.info('Reloading page to update COI worker.');
          window.sessionStorage.setItem('coiReloadedBySelf', 'updatefound');
          window.location.reload();
        });

        if (registration.active && !navigator.serviceWorker.controller) {
          window.sessionStorage.setItem('coiReloadedBySelf', 'notcontrolling');
          window.location.reload();
        }
      })
      .catch((err) => {
        console.error('COOP/COEP Service Worker failed to register:', err);
      });

    if (!coepDegrading && !window.crossOriginIsolated) {
      setTimeout(() => {
        if (!window.crossOriginIsolated) {
          window.sessionStorage.setItem('coiReloadedBySelf', 'coepdegrade');
        }
      }, 0);
    }
  })();
}
