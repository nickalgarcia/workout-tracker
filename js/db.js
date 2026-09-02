// ── db.js ──
// Firebase init, auth, and every Firestore read and write.
// This module owns data. It never touches the DOM and never imports UI —
// callers decide how to report success or failure.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ── Config ──
const firebaseConfig = {
  apiKey: "AIzaSyCyyUoNqY1LVA_hfMCCEgZ0_vFI4ggTwyY",
  authDomain: "workout-tracker-c1205.firebaseapp.com",
  projectId: "workout-tracker-c1205",
  storageBucket: "workout-tracker-c1205.firebasestorage.app",
  messagingSenderId: "306664520085",
  appId: "1:306664520085:web:5c74c95f3c83d74d409e9c",
  measurementId: "G-CY7B796LCW"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── Profile ──
// Single-user app. This replaces the old users/{uid}/meta/profile document
// and the onboarding flow that populated it. Edit by hand when it changes.
export const PROFILE = {
  name: 'Nick',
  startedTraining: '2025-01',
  belt: 'white',          // update by hand when this changes
  style: 'no-gi',
  bodyType: 'smaller and lighter than most training partners',
  goals: 'recreational — fun, fitness, community. Wants to build an offensive guard game.',
  weeklyTargets: { mat: 3, support: 2 }
};

// ── Schema ──
// See docs/SCHEMA.md. Two session types: 'mat' and 'support'.
export const SCHEMA_VERSION = 2;

// Fixed vocabulary for mat positions. Order matters — it is the display
// order, running from bottom/defensive through to top/offensive. This is a
// closed list on purpose: `positions` is a multi-select from exactly these
// strings and never free text, because that is what makes it aggregate.
// Technique nuance goes in `techniques`, which stays free text.
export const POSITIONS = [
  'Pre-guard / seated',
  'Closed guard (bottom)',
  'Half guard (bottom)',
  'Open guard (bottom)',
  'Guard passing (top)',
  'Side control (top)',
  'Side control (bottom)',
  'Mount (top)',
  'Mount (bottom)',
  'Back attacks',
  'Back defense',
  'Standing / takedowns'
];

// ── Current user ──
let _currentUser = null;

/** The signed-in user, or null. */
export function currentUser() {
  return _currentUser;
}

// ── Auth ──
// These throw on failure rather than showing a toast — reporting is the
// caller's job, so this module stays free of the DOM.

export async function signIn() {
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOut() {
  await firebaseSignOut(auth);
}

/** Register a callback fired whenever the auth state changes. */
export function watchAuth(callback) {
  onAuthStateChanged(auth, (user) => {
    _currentUser = user;
    invalidateSessions();
    callback(user);
  });
}

// ── Firestore ──
function sessionsRef() {
  if (!_currentUser) throw new Error('Not signed in — no session collection to reach.');
  return collection(db, 'users', _currentUser.uid, 'sessions');
}

// ── Session cache ──
// Views call getSessions() two or three times per render, and the progress
// view needs the whole collection for its aggregates. Rather than page or
// limit, hold the last result in memory and drop it on any write. It
// survives navigation within a session and never outlives the tab.
let sessionCache = null;

function invalidateSessions() {
  sessionCache = null;
}

/** Save a session. Returns the new document id. */
export async function saveSession(session) {
  session.createdAt = serverTimestamp();
  const docRef = await addDoc(sessionsRef(), session);
  invalidateSessions();
  return docRef.id;
}

/**
 * Every session, newest first.
 *
 * Archived documents (the old yoga and pilates sessions) are excluded here,
 * which is the single place sessions enter the app — so every view gets the
 * filter for free. It is done client-side on purpose: a Firestore
 * `where('archived', '!=', true)` would also drop every document that has
 * no `archived` field at all, which is all of them.
 */
export async function getSessions() {
  // Views are only reachable after sign-in, but a read that races a
  // sign-out should return nothing rather than throw.
  if (!_currentUser) return [];
  if (sessionCache) return sessionCache;
  const snapshot = await getDocs(query(sessionsRef(), orderBy('createdAt', 'desc')));
  sessionCache = snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => !s.archived);
  return sessionCache;
}

/** One session by id. Reads the single document rather than the collection. */
export async function getSession(id) {
  if (!_currentUser) return null;
  const snap = await getDoc(doc(db, 'users', _currentUser.uid, 'sessions', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function deleteSession(id) {
  if (!_currentUser) throw new Error('Not signed in — cannot delete.');
  await deleteDoc(doc(db, 'users', _currentUser.uid, 'sessions', id));
  invalidateSessions();
}

// ── Focus ──
// The active focus lives in one document at users/{uid}/meta/focus.
// Past focuses move to the archive subcollection underneath it, so the
// history is a single collection read and only when that view is opened.
//
//   users/{uid}/meta/focus                 the active focus
//   users/{uid}/meta/focus/archive/{id}    past focuses

function focusRef() {
  if (!_currentUser) throw new Error('Not signed in — no focus to reach.');
  return doc(db, 'users', _currentUser.uid, 'meta', 'focus');
}

function focusArchiveRef() {
  if (!_currentUser) throw new Error('Not signed in — no focus archive to reach.');
  return collection(db, 'users', _currentUser.uid, 'meta', 'focus', 'archive');
}

export function newFocusId() {
  return crypto?.randomUUID?.() ?? `f_${Date.now().toString(36)}`;
}

/** The active focus, or null if none has been set. */
export async function getActiveFocus() {
  if (!_currentUser) return null;
  const snap = await getDoc(focusRef());
  return snap.exists() ? snap.data() : null;
}

/** Create or replace the active focus. */
export async function setActiveFocus(focus) {
  await setDoc(focusRef(), focus);
}

/**
 * Archive the current focus under `endedAt` and make `next` the active one.
 * The archive copy is written first, so a failure part-way through cannot
 * lose the old focus.
 */
export async function replaceFocus(current, endedAt, next) {
  if (current) {
    await setDoc(doc(focusArchiveRef(), current.id), {
      ...current, endedAt, active: false
    });
  }
  await setDoc(focusRef(), next);
}

/** Past focuses, most recently ended first. */
export async function getFocusArchive() {
  if (!_currentUser) return [];
  const snapshot = await getDocs(query(focusArchiveRef(), orderBy('endedAt', 'desc')));
  return snapshot.docs.map(d => d.data());
}
