/* eslint-disable */
/*! coi-serviceworker v0.1.7 — MIT — github.com/gzuidhof/coi-serviceworker
 * Vendored verbatim. Injects COOP/COEP response headers so SharedArrayBuffer
 * (and therefore Pyodide / whisper.cpp WASM with threading) works on GitHub
 * Pages, which cannot set custom headers. See docs/adr/0006.
 */
let coepCredentialless = false;
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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

    const request = coepCredentialless && r.mode === 'no-cors'
      ? new Request(r, { credentials: 'omit', cache: r.cache === 'only-if-cached' ? 'default' : r.cache })
      : r;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) return response;
          const newHeaders = new Headers(response.headers);
          newHeaders.set('Cross-Origin-Embedder-Policy', coepCredentialless ? 'credentialless' : 'require-corp');
          if (!coepCredentialless) newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error(e))
    );
  });
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
      // First-load reload after the SW activates.
      setTimeout(() => {
        if (!window.crossOriginIsolated) {
          window.sessionStorage.setItem('coiReloadedBySelf', 'coepdegrade');
        }
      }, 0);
    }
  })();
}
