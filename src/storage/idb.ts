// Envoltorio mínimo de IndexedDB (sin dependencias).
const DB_NAME = 'funkade';
const DB_VERSION = 1;
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      if (!db.objectStoreNames.contains('mods')) db.createObjectStore('mods');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function wrap<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export async function idbGet<T = unknown>(store: string, key: string): Promise<T | undefined> {
  const db = await open();
  return wrap(db.transaction(store, 'readonly').objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function idbSet(store: string, key: string, value: unknown): Promise<void> {
  const db = await open();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).put(value, key));
}

export async function idbSetMany(store: string, entries: [string, unknown][]): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const [k, v] of entries) os.put(v, k);
  await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

export async function idbKeys(store: string): Promise<string[]> {
  const db = await open();
  return (await wrap(db.transaction(store, 'readonly').objectStore(store).getAllKeys())) as string[];
}

export async function idbDeletePrefix(store: string, prefix: string): Promise<void> {
  const db = await open();
  const range = IDBKeyRange.bound(prefix, prefix + '￿');
  await wrap(db.transaction(store, 'readwrite').objectStore(store).delete(range));
}

export async function idbDelete(store: string, key: string): Promise<void> {
  const db = await open();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).delete(key));
}
