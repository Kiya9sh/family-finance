/*
 * IndexedDB storage. Everything the family records sits in one local database
 * on the iPhone; nothing is ever sent anywhere unless the user exports it.
 *
 * One object store per record type, all keyed by `id`. Settings live in the
 * same shape (one record with id 'app') so backup/restore stays uniform.
 */

export const DB_NAME = 'family-finance';
export const DB_VERSION = 2;

export const STORES = [
  'profiles',
  'categories',
  'payees',
  'transactions',
  'expected',
  'loans',
  'lendings',
  'accounts',
  'tombstones',
  'settings',
];

let dbPromise = null;

/*
 * A database opened by a newer build (a version higher than DB_VERSION) makes
 * `indexedDB.open(name, DB_VERSION)` fail outright, which would leave this
 * build unable to start on that phone. Read the version that is actually
 * stored, then always open at least that, so the app runs on a database an
 * earlier or later release left behind. Missing stores are added on upgrade;
 * stores this build does not know about are simply left alone.
 */
function probeVersion() {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = () => {
        const db = request.result;
        const version = db.version;
        db.close();
        done(version);
      };
      request.onerror = () => done(0);
      request.onblocked = () => done(0);
      setTimeout(() => done(0), 3000);
    } catch (err) {
      done(0);
    }
  });
}

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const existing = await probeVersion();
    const version = Math.max(existing || 0, DB_VERSION);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, version);
      request.onupgradeneeded = () => {
        const db = request.result;
        STORES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB unavailable'));
      request.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
    });
  })().catch((err) => {
    /* Let a later attempt try again rather than caching the failure. */
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(store, mode, fn) {
  const db = await open();
  const tx = db.transaction(store, mode);
  const objectStore = tx.objectStore(store);
  const result = await fn(objectStore);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  });
  return result;
}

export async function getAll(store) {
  return withStore(store, 'readonly', (os) => wrap(os.getAll()));
}

export async function put(store, record) {
  await withStore(store, 'readwrite', (os) => wrap(os.put(record)));
  return record;
}

export async function putMany(store, records) {
  if (!records || !records.length) return;
  await withStore(store, 'readwrite', (os) => {
    records.forEach((record) => os.put(record));
    return Promise.resolve();
  });
}

export async function remove(store, id) {
  await withStore(store, 'readwrite', (os) => wrap(os.delete(id)));
}

export async function removeMany(store, ids) {
  if (!ids || !ids.length) return;
  await withStore(store, 'readwrite', (os) => {
    ids.forEach((id) => os.delete(id));
    return Promise.resolve();
  });
}

export async function clearStore(store) {
  await withStore(store, 'readwrite', (os) => wrap(os.clear()));
}

export async function loadAll() {
  const out = {};
  await Promise.all(
    STORES.map(async (name) => {
      out[name] = await getAll(name);
    }),
  );
  return out;
}

/* Wipe everything and write a full data set in one transaction. */
export async function replaceAll(data) {
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  STORES.forEach((name) => {
    const os = tx.objectStore(name);
    os.clear();
    (data[name] || []).forEach((record) => os.put(record));
  });
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('restore aborted'));
  });
}

export async function wipeAll() {
  await replaceAll({});
}

/* Ask iOS to keep this data out of automatic eviction (best effort). */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const granted = await navigator.storage.persisted();
      if (granted) return true;
      return await navigator.storage.persist();
    }
  } catch (err) {
    /* not supported — storage pressure is then the user's discipline: back up */
  }
  return false;
}

export async function storageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage: usage || 0, quota: quota || 0 };
    }
  } catch (err) {
    /* ignore */
  }
  return null;
}
