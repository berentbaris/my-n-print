import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc } from 'firebase/firestore';
import { acknowledge, enqueue, newId, pendingRecords, visitorIdentity } from './results/queue';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || process.env.REACT_APP_GOOGLE_API_KEY,
  authDomain: 'my-nprint.firebaseapp.com',
  projectId: 'my-nprint',
  storageBucket: 'my-nprint.firebasestorage.app',
  ...(process.env.REACT_APP_FIREBASE_APP_ID ? { appId: process.env.REACT_APP_FIREBASE_APP_ID } : {}),
};

let db;
export function getDb() {
  if (!firebaseConfig.apiKey) throw new Error('Firebase API key is missing');
  if (!db) {
    db = getFirestore(getApps()[0] || initializeApp(firebaseConfig));
    if (process.env.REACT_APP_FIRESTORE_EMULATOR_HOST) {
      const [host, port] = process.env.REACT_APP_FIRESTORE_EMULATOR_HOST.split(':');
      connectFirestoreEmulator(db, host, Number(port));
    }
  }
  return db;
}

const listeners = new Set();
const inFlight = new Map();
const failed = new Set();
const volatile = new Set();
let status = { state: 'idle', pending: 0 };

function publish(next) {
  status = next;
  listeners.forEach((listener) => listener(status));
}

export function subscribeToStorage(listener) {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

async function refreshStatus() {
  const records = await pendingRecords();
  const pending = records.length;
  const delayed = [...inFlight.values()].some((startedAt) => Date.now() - startedAt > 15000);
  publish({ state: !pending ? 'saved' : volatile.size ? 'temporary' : failed.size ? 'error' : navigator.onLine === false ? 'offline' : delayed ? 'pending' : 'saving', pending });
}

export async function retryPendingCalculations() {
  const records = await pendingRecords();
  if (!records.length) return;
  if (navigator.onLine === false) { await refreshStatus(); return; }
  let store;
  try { store = getDb(); } catch (err) {
    publish({ state: volatile.size ? 'temporary' : 'error', pending: records.length });
    console.warn('[results] Storage unavailable:', err.message);
    return;
  }
  for (const record of records) {
    if (inFlight.has(record.id)) continue;
    inFlight.set(record.id, Date.now());
    failed.delete(record.id);
    // A slow/offline write must not block later results. Fixed IDs and fixed
    // timestamps make identical retries safe even after a page reload.
    setDoc(doc(store, 'calculations', record.id), record)
      .then(async () => { await acknowledge(record.id); volatile.delete(record.id); })
      .catch((err) => {
        failed.add(record.id);
        console.warn('[results] Save failed; snapshot retained for retry:', err.code);
      })
      .finally(() => { inFlight.delete(record.id); refreshStatus(); });
  }
  await refreshStatus();
}

export function startCalculationStorage() {
  const online = () => retryPendingCalculations();
  const offline = () => refreshStatus();
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  const retryTimer = window.setInterval(online, 30000);
  online();
  return () => {
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
    window.clearInterval(retryTimer);
  };
}

/** Capture every result without rounding; never overwrite a previous result. */
export async function logCalculation(snapshot, eventType = 'calculate') {
  const record = {
    ...snapshot, ...visitorIdentity(), id: newId(), eventType,
    // Moment the result was displayed, even if it is uploaded days later.
    timestamp: new Date().toISOString(),
  };
  const durable = await enqueue(record);
  if (!durable) volatile.add(record.id);
  publish({ state: durable ? navigator.onLine === false ? 'offline' : 'saving' : 'temporary', pending: (await pendingRecords()).length });
  retryPendingCalculations();
  return record.id;
}
