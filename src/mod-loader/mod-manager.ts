// Administración de mods: catálogo remoto, mods importados por el usuario y apertura de mods.
import { getAdapter, type FormatAdapter } from '../adapters/index';
import type { CatalogEntry, ModManifest } from '../core/types';
import { detectMod } from './mod-manager-detect';
export { detectMod };
import { idbDelete, idbDeletePrefix, idbGet, idbKeys, idbSet, idbSetMany } from '../storage/idb';
import { readZip } from '../storage/zip';
import { getJson, ListedSource, LocalSource, PatchedSource, RemoteSource, type ModSource } from './source';

export const BASE_URL = new URL('./', document.baseURI).href;

export interface ModRuntime {
  entry: CatalogEntry;
  manifest: ModManifest;
  source: ModSource;
  adapter: FormatAdapter;
}

export async function loadCatalog(): Promise<CatalogEntry[]> {
  const out: CatalogEntry[] = [];
  try {
    const r = await fetch(new URL('mods/catalog.json', BASE_URL));
    if (r.ok) {
      const j = await r.json();
      for (const m of j.mods ?? []) out.push(m);
    }
  } catch (e) {
    console.warn('No se pudo cargar el catálogo remoto', e);
  }
  try {
    for (const k of await idbKeys('mods')) {
      const m = await idbGet<ModManifest>('mods', k);
      if (m) out.push(manifestToEntry(m, 'local:' + m.id, true));
    }
  } catch { /* IndexedDB no disponible (p. ej. navegación privada en algunos navegadores) */ }
  return out;
}

export function manifestToEntry(m: ModManifest, path: string, local = false): CatalogEntry {
  return {
    id: m.id, name: m.name, author: m.author ?? '', description: m.description ?? '', category: m.category ?? 'Mods', cover: m.cover ?? '',
    popularity: m.popularity ?? 0, sizeBytes: m.sizeBytes ?? 0, songCount: m.songs.length, format: m.format,
    compatibility: m.compatibility ?? 'partial', path, local,
  };
}

export async function openMod(entry: CatalogEntry): Promise<ModRuntime> {
  const source: ModSource = entry.local ? new LocalSource(entry.id) : new RemoteSource(entry.id, new URL(entry.path, BASE_URL).href);
  const manifest: ModManifest = entry.local ? (await idbGet<ModManifest>('mods', entry.id))! : await getJson(source, 'manifest.json');
  if (!manifest) throw new Error('Manifiesto del mod no encontrado');
  const listed = manifest.files?.length ? new ListedSource(source, manifest.files) : source;
  // Los parches del panel DEV se superponen en memoria; el contenido original permanece intacto.
  const patched = new PatchedSource(listed);
  return { entry, manifest, source: patched, adapter: getAdapter(manifest.format) };
}

export function coverUrl(e: CatalogEntry): string {
  if (!e.cover || e.local) return '';
  return new URL(e.path.replace(/\/?$/, '/') + e.cover, BASE_URL).href;
}

// ------------------------------------------------------------ Importación de mods del usuario
export async function importZip(file: File, onProgress?: (p: number) => void): Promise<ModManifest> {
  const entries = readZip(await file.arrayBuffer());
  // quitamos la carpeta raíz común (p. ej. "MiMod/" o "mods/MiMod/")
  const names = entries.map((e) => e.name);
  let prefix = '';
  const rootMarker = names.find((n) => /(^|\/)manifest\.json$/i.test(n)) ?? names.find((n) => /(^|\/)data\//i.test(n));
  if (rootMarker) {
    const m = /^(.*?)(manifest\.json|data\/.*)$/i.exec(rootMarker);
    prefix = m ? m[1] : '';
  }
  const id = (file.name.replace(/\.zip$/i, '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'mod') + '-local';
  await idbDeletePrefix('files', id + '/');
  const rel: string[] = [];
  let total = 0;
  let batch: [string, unknown][] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (prefix && !e.name.startsWith(prefix)) continue;
    const p = e.name.slice(prefix.length).toLowerCase();
    if (!p) continue;
    const data = await e.read();
    total += data.byteLength;
    rel.push(p);
    batch.push([`${id}/${p}`, new Blob([data as BlobPart])]);
    if (batch.length >= 25) { await idbSetMany('files', batch); batch = []; }
    onProgress?.((i + 1) / entries.length);
  }
  if (batch.length) await idbSetMany('files', batch);
  let manifest: ModManifest;
  if (rel.includes('manifest.json')) {
    manifest = await getJson(new LocalSource(id), 'manifest.json');
    manifest.id = id;
  } else manifest = detectMod(rel, id);
  manifest.sizeBytes = total;
  manifest.files = rel;
  await idbSet('mods', id, manifest);
  return manifest;
}

export async function deleteLocalMod(id: string) {
  await idbDeletePrefix('files', id + '/');
  await idbDelete('mods', id);
}

/** Lista de mods con sus canciones (para logros y progreso). Se cachea durante la sesión. */
let infoCache: Promise<{ id: string; name: string; cover: string; songs: { id: string; name: string }[] }[]> | null = null;
export function modInfos(catalog: CatalogEntry[]) {
  if (!infoCache) {
    infoCache = Promise.all(catalog.map(async (e) => {
      try { const m = (await openMod(e)).manifest; return { id: m.id, name: m.name, cover: coverUrl(e), songs: m.songs.map((s) => ({ id: s.id, name: s.name })) }; }
      catch { return { id: e.id, name: e.name, cover: coverUrl(e), songs: [] }; }
    }));
    infoCache.catch(() => (infoCache = null));
  }
  return infoCache;
}
export function resetModInfos() { infoCache = null; }
