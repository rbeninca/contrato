import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  query,
  limit,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';


const config = window.FIREBASE_CONFIG || {};
const isConfigValid = Boolean(config.apiKey && config.projectId && config.appId);

if (!isConfigValid) {
  window.AppFirebase = { ready: false, error: 'Firebase config ausente/inválida.' };
} else {
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  window.AppFirebase = {
    ready: true,
    app,
    auth,
    db,
    storage,
    onAuthStateChanged,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    collection,
    query,
    limit,
    where,
    orderBy,
    getDocs,
    getDoc,
    doc,
    setDoc,
    deleteDoc,
    serverTimestamp,
    storageRef,
    uploadBytes,
    getDownloadURL
  };
}
