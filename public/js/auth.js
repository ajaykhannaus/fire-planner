// Optional Firebase auth + Firestore handle. The whole module is guest-safe:
// if firebase-config.js is blank or the SDK fails to load, `firebaseReady` stays
// false and the app silently runs in localStorage-only (guest) mode.
//
// The Firebase v10 modular SDK is loaded from the gstatic CDN ESM builds. The
// version is pinned in the URL PATH (not a ?query) so the deploy-time `?v=DEV`
// → commit-SHA sed never rewrites these CDN URLs.
import { firebaseConfig } from './firebase-config.js?v=DEV';

const FB = '10.12.2';
const BASE = `https://www.gstatic.com/firebasejs/${FB}`;

// re-exported auth primitives (populated on successful init)
export let auth = null;
export let db = null;
export let GoogleAuthProvider = null;
export let signInWithPopup = null;
export let createUserWithEmailAndPassword = null;
export let signInWithEmailAndPassword = null;
export let sendPasswordResetEmail = null;
export let signOut = null;

let _onAuthStateChanged = null;
let _currentUser = null;

export let firebaseReady = false;

function hasConfig() {
  return !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
}

async function init() {
  if (!hasConfig()) return false;   // blank config → guest-only, no network
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${BASE}/firebase-app.js`),
      import(`${BASE}/firebase-auth.js`),
      import(`${BASE}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    auth = authMod.getAuth(app);
    db = fsMod.getFirestore(app);

    GoogleAuthProvider = authMod.GoogleAuthProvider;
    signInWithPopup = (provider) => authMod.signInWithPopup(auth, provider);
    createUserWithEmailAndPassword = (email, pw) => authMod.createUserWithEmailAndPassword(auth, email, pw);
    signInWithEmailAndPassword = (email, pw) => authMod.signInWithEmailAndPassword(auth, email, pw);
    sendPasswordResetEmail = (email) => authMod.sendPasswordResetEmail(auth, email);
    signOut = () => authMod.signOut(auth);
    _onAuthStateChanged = authMod.onAuthStateChanged;

    // expose Firestore helpers for store.js without it importing the SDK directly
    fb.collection = fsMod.collection;
    fb.doc = fsMod.doc;
    fb.setDoc = fsMod.setDoc;
    fb.deleteDoc = fsMod.deleteDoc;
    fb.onSnapshot = fsMod.onSnapshot;

    firebaseReady = true;
    return true;
  } catch (err) {
    console.warn('[auth] Firebase failed to load — staying in guest mode.', err);
    firebaseReady = false;
    return false;
  }
}

// Firestore helper handles, filled in by init(); store.js reads these.
export const fb = {
  collection: null, doc: null, setDoc: null, deleteDoc: null, onSnapshot: null,
};

// Resolves once Firebase has finished initializing (or failed → guest mode).
export const ready = init();

// Subscribe to auth-state changes. The callback fires once immediately after
// Firebase resolves (with the current user or null). In guest mode it fires once
// with null so the app boots into localStorage.
export function onUser(cb) {
  ready.then(() => {
    if (firebaseReady && _onAuthStateChanged) {
      _onAuthStateChanged(auth, (user) => { _currentUser = user; cb(user); });
    } else {
      cb(null);   // guest mode
    }
  });
}

export function getUser() { return _currentUser; }
