/**
 * Firebase / Firestore initialisation.
 *
 * The Firebase compat SDK is loaded via <script> tags in public/index.html,
 * so `window.firebase` is available globally. This module initialises the app
 * once and exports a Firestore reference for use throughout the codebase.
 *
 * SETUP REQUIRED (one-time, in the Firebase console):
 *  1. Go to https://console.firebase.google.com/project/my-nprint/firestore
 *     and click "Create database" (choose production mode, any region).
 *  2. In Firestore → Rules, set:
 *       rules_version = '2';
 *       service cloud.firestore {
 *         match /databases/{database}/documents {
 *           match /calculations/{doc} {
 *             allow create: if true;   // anyone can log a calculation
 *             allow read, update, delete: if false;
 *           }
 *         }
 *       }
 *  3. If the existing Google API key doesn't work for Firestore,
 *     copy the "Web API Key" from Project Settings → General and
 *     set REACT_APP_FIREBASE_API_KEY in .env.
 */

/* global firebase */

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY
    || process.env.REACT_APP_GOOGLE_API_KEY,
  authDomain: 'my-nprint.firebaseapp.com',
  projectId: 'my-nprint',
  storageBucket: 'my-nprint.firebasestorage.app',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '',   // optional for Firestore writes
};

let db = null;

/**
 * Returns a Firestore instance, lazily initialising Firebase on first call.
 * Returns `null` if the SDK isn't loaded (e.g. ad-blocker, offline).
 */
export function getDb() {
  if (db) return db;
  try {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      console.warn('[firebase] SDK not loaded — calculation logging disabled.');
      return null;
    }
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    return db;
  } catch (err) {
    console.warn('[firebase] Init failed — calculation logging disabled.', err);
    return null;
  }
}

/**
 * Save a completed footprint calculation to the "calculations" collection.
 * Fire-and-forget: failures are logged but never block the UI.
 */
export async function logCalculation(data) {
  const store = getDb();
  if (!store) return;

  const doc = {
    country: data.country || '',
    foodFootprint: round2(data.foodFootprint),
    energyFootprint: round2(data.energyFootprint),
    totalFootprint: round2(data.totalFootprint),
    dailyCalories: Math.round(data.dailyCalories || 0),
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    appVersion: data.appVersion || '',
  };

  try {
    await store.collection('calculations').add(doc);
  } catch (err) {
    // Silently swallow — never break the user's result view
    console.warn('[firebase] Failed to log calculation:', err.message);
  }
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
