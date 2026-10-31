/** Persists the SQLite file as a single blob in IndexedDB. Nothing here touches the network. */
const DB_NAME = "chronicle";
const STORE = "files";
const KEY = "chronicle.sqlite";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const loadFile = () => tx<Uint8Array | undefined>("readonly", (s) => s.get(KEY));
export const saveFile = (bytes: Uint8Array) => tx("readwrite", (s) => s.put(bytes, KEY));
export const clearFile = () => tx("readwrite", (s) => s.delete(KEY));

/** Coalesce bursts of writes into one save. */
export function debounced(fn: () => void, ms = 250) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const call = () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
  call.flush = () => {
    clearTimeout(t);
    fn();
  };
  return call;
}
