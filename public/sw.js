// Service Worker de Funkade.
// - Recursos de mods (imágenes, audio): primero caché → carga instantánea en la segunda visita.
// - JSON (catálogo, manifiestos, charts) y archivos de la app: primero red, caché como respaldo sin conexión.
const VERSION = '__BUILD_VERSION__';
const APP_CACHE = 'funkade-app-' + VERSION;
// subir este número cuando se reimporten mods con las mismas rutas de archivo
const MOD_CACHE = 'funkade-mods-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(['./', 'index.html', 'css/app.css', 'js/main.js', 'js/chart-worker.js', 'sandbox.html', 'favicon.svg']).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if ((k.startsWith('funkade-app-') && k !== APP_CACHE) || (k.startsWith('funkade-mods-') && k !== MOD_CACHE)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isAsset = /\/(mods|shared)\//.test(url.pathname) && !url.pathname.endsWith('.json');
  if (isAsset) {
    e.respondWith((async () => {
      const c = await caches.open(MOD_CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok && r.status === 200) c.put(req, r.clone()).catch(() => {});
      return r;
    })());
  } else {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok && r.status === 200) {
          const c = await caches.open(/\/(mods|shared)\//.test(url.pathname) ? MOD_CACHE : APP_CACHE);
          c.put(req, r.clone()).catch(() => {});
        }
        return r;
      } catch (err) {
        const hit = await caches.match(req);
        if (hit) return hit;
        throw err;
      }
    })());
  }
});
