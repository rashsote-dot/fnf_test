// Origen de archivos de un mod: carpeta remota (servidor estático) o mod importado (IndexedDB).
import { Diag } from '../core/diagnostics';
import { idbGet } from '../storage/idb';

export class LoadError extends Error {
  constructor(public path: string, public status: number | string) {
    super(`No se pudo cargar "${path}" (${status})`);
  }
}

export interface ModSource {
  readonly id: string;
  blob(path: string): Promise<Blob>;
  exists(path: string): Promise<boolean>;
}

export class RemoteSource implements ModSource {
  constructor(public readonly id: string, private base: string) {
    if (!this.base.endsWith('/')) this.base += '/';
  }
  url(path: string) { return this.base + path.split('/').map(encodeURIComponent).join('/'); }
  async blob(path: string): Promise<Blob> {
    const t0 = performance.now();
    const r = await fetch(this.url(path));
    if (!r.ok) throw new LoadError(path, r.status);
    const b = await r.blob();
    Diag.recordLoad(path, performance.now() - t0, b.size);
    return b;
  }
  async exists(path: string) {
    try { const r = await fetch(this.url(path), { method: 'HEAD' }); return r.ok; } catch { return false; }
  }
}

/** Mod importado por el usuario desde su disco: los archivos viven en IndexedDB, nunca salen del navegador. */
export class LocalSource implements ModSource {
  constructor(public readonly id: string) {}
  key(path: string) { return `${this.id}/${path.toLowerCase()}`; }
  async blob(path: string): Promise<Blob> {
    const t0 = performance.now();
    const b = await idbGet<Blob>('files', this.key(path));
    if (!b) throw new LoadError(path, 'no existe en el mod importado');
    Diag.recordLoad(path, performance.now() - t0, b.size);
    return b;
  }
  async exists(path: string) { return !!(await idbGet('files', this.key(path))); }
}

export async function getJson(src: ModSource, path: string): Promise<any> {
  const b = await src.blob(path);
  const text = await b.text();
  try {
    // algunos charts antiguos traen basura después del JSON; recortamos al último '}'
    return JSON.parse(text);
  } catch {
    const end = text.lastIndexOf('}');
    try { return JSON.parse(text.slice(0, end + 1)); } catch { throw new LoadError(path, 'JSON inválido'); }
  }
}

export async function tryJson(src: ModSource, path: string): Promise<any | null> {
  try { return await getJson(src, path); } catch (e) { if (e instanceof LoadError) return null; throw e; }
}

/** Envoltorio que conoce la lista de archivos del mod (manifest.files): los que no existen fallan al instante,
 *  sin pedirlos al servidor (evita cientos de 404 al probar archivos opcionales). */
export class ListedSource implements ModSource {
  private map: Map<string, string>;
  constructor(private inner: ModSource, files: string[]) { this.map = new Map(files.map((f) => [f.toLowerCase(), f])); }
  get id() { return this.inner.id; }
  async exists(path: string) { return this.has(path); }
  has(path: string) { return this.map.has(path.replace(/^\.?\//, '').toLowerCase()); }
  /** el servidor (GitHub Pages) distingue mayúsculas: se pide el archivo con el nombre exacto que tiene */
  async blob(path: string): Promise<Blob> {
    if (path === 'manifest.json') return this.inner.blob(path);
    const real = this.map.get(path.replace(/^\.?\//, '').toLowerCase());
    if (!real) throw new LoadError(path, 404);
    return this.inner.blob(real);
  }
}
