// An uncapped IndexedDB outbox keeps every snapshot until Firestore confirms it.
const memory = new Map();
let database;

function openQueue() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
      const request = indexedDB.open('my-nprint-results', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('pending', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Results storage is blocked'));
    }).catch(() => null);
  }
  return database;
}

async function transaction(mode, operation) {
  const db = await openQueue();
  if (!db) throw new Error('Persistent storage unavailable');
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending', mode);
    const request = operation(tx.objectStore('pending'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Results storage aborted'));
  });
}

export async function enqueue(record) {
  memory.set(record.id, record);
  try { await transaction('readwrite', (store) => store.put(record)); return true; }
  catch { return false; }
}

export async function pendingRecords() {
  let stored = [];
  try { stored = await transaction('readonly', (store) => store.getAll()); } catch { /* memory fallback */ }
  return [...new Map([...stored, ...memory.values()].map((record) => [record.id, record])).values()];
}

export async function acknowledge(id) {
  // Repeat uploads after an interrupted acknowledgement use the same ID.
  try { await transaction('readwrite', (store) => store.delete(id)); } catch { /* retry on next visit */ }
  memory.delete(id);
}

export function newId() {
  if (window.crypto.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function anonymousId(storageName, key) {
  try {
    const storage = window[storageName];
    let id = storage.getItem(key);
    if (!id) { id = newId(); storage.setItem(key, id); }
    return id;
  } catch { return newId(); }
}

let identity;
export function visitorIdentity() {
  if (!identity) identity = {
    visitorId: anonymousId('localStorage', 'my-nprint-visitor'),
    sessionId: anonymousId('sessionStorage', 'my-nprint-session'),
  };
  return identity;
}
