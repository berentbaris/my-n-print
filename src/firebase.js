<<<<<<< Updated upstream
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
=======
/**
 * Calculation logging to Cloud Firestore (REST API, no Firebase SDK).
 *
 * Project:  my-nprint
 * Database: my-n-print-db   (named database, not "(default)")
 * Collection: calculations  (create-only; see firestore.rules)
 *
 * The Web API key comes from REACT_APP_FIREBASE_API_KEY or REACT_APP_GOOGLE_API_KEY
 * (.env locally, GitHub Actions secret for deploys). Firebase web keys are not secret;
 * access is controlled by the Firestore security rules and the key's website restrictions.
 *
 * Rules must be published on the my-n-print-db database
 * (Firebase console → Firestore → my-n-print-db → Rules), see firestore.rules.
 */

const PROJECT_ID = 'my-nprint';
const DATABASE_ID = 'my-n-print-db';
const COLLECTION = 'calculations';
const API_KEY = process.env.REACT_APP_FIREBASE_API_KEY || process.env.REACT_APP_GOOGLE_API_KEY || '';

const DB_PATH = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const COMMIT_URL = `https://firestore.googleapis.com/v1/${DB_PATH}:commit?key=${API_KEY}`;

function autoId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(20);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function toValue(v) {
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v ?? '') };
}

/**
 * Save a completed footprint calculation. Fire-and-forget: failures are logged
 * to the console but never block or break the user's result view.
 */
export async function logCalculation(data) {
  if (!API_KEY) {
    console.warn('[firestore] No API key set — calculation logging disabled.');
    return;
  }

  const doc = {
    country: data.country || '',
    iso: data.iso || '',
    foodFootprint: round2(data.foodFootprint),
    energyFootprint: round2(data.energyFootprint),
    totalFootprint: round2(data.totalFootprint),
    dailyCalories: Math.round(data.dailyCalories || 0),
    usedDefaults: !!data.usedDefaults,
    wasteLevel: data.wasteLevel || '',
    carType: data.carType || '',
    renewable: !!data.renewable,
    otherFuels: data.otherFuels || '',
    spending: data.spending || '',
    appVersion: data.appVersion || '',
  };
  const fields = {};
  Object.entries(doc).forEach(([k, v]) => { fields[k] = toValue(v); });

  const body = {
    writes: [{
      update: { name: `${DB_PATH}/${COLLECTION}/${autoId()}`, fields },
      updateTransforms: [{ fieldPath: 'timestamp', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    }],
  };

  try {
    const res = await fetch(COMMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[firestore] Failed to log calculation:', res.status, err.error && err.error.message);
    }
  } catch (err) {
    console.warn('[firestore] Failed to log calculation:', err.message);
  }
>>>>>>> Stashed changes
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
