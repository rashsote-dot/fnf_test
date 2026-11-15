// Caché persistente de recursos (Cache Storage + Service Worker).
const CACHE = 'funkade-mods-v1';

export function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker no registrado', e));
}

/** Descarga todos los archivos de un mod en la caché para jugarlo sin conexión. */
export async function cacheModOffline(baseUrl: string, files: string[], onProgress?: (p: number) => void): Promise<number> {
  if (!('caches' in window)) throw new Error('Cache Storage no disponible en este navegador');
  const c = await caches.open(CACHE);
  const all = ['manifest.json', ...files.filter((f) => f !== 'manifest.json')];
  let done = 0;
  const queue = [...all];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift()!;
      const url = baseUrl + f.split('/').map(encodeURIComponent).join('/');
      if (!(await c.match(url))) {
        const r = await fetch(url);
        if (r.ok) await c.put(url, r);
      }
      onProgress?.(++done / all.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return done;
}

export async function clearModCache() {
  if ('caches' in window) await caches.delete(CACHE);
}

export async function storageInfo(): Promise<string> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est) return 'Información de almacenamiento no disponible.';
    const mb = (b = 0) => (b / 1048576).toFixed(1) + ' MB';
    return `Usado: ${mb(est.usage)} de ${mb(est.quota)} disponibles (caché de mods + mods importados).`;
  } catch {
    return 'Información de almacenamiento no disponible.';
  }
}
