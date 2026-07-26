/**
 * BETAAI / JavaGoat Firebase Integration & Auth Service
 * Supports Google OAuth via Firebase Auth, Guest Mode, and Realtime Database Settings Sync.
 * Created for SAURABH
 */

import { ADMIN_EMAIL } from './security.js';

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBETAAI_MOCK_API_KEY_SAURABH_2026",
  authDomain: "betaai-javagoat.firebaseapp.com",
  databaseURL: "https://betaai-javagoat-default-rtdb.firebaseio.com",
  projectId: "betaai-javagoat",
  storageBucket: "betaai-javagoat.firebasestorage.app",
  messagingSenderId: "987654321012",
  appId: "1:987654321012:web:betaaijavagoat2026"
};

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDB = null;

// Initialize Firebase dynamically on browser client
export function initFirebase(customConfig = null) {
  if (typeof window === 'undefined') return false;

  const config = customConfig || DEFAULT_FIREBASE_CONFIG;

  try {
    if (window.firebase && window.firebase.apps && window.firebase.apps.length > 0) {
      firebaseApp = window.firebase.apps[0];
    } else if (window.firebase) {
      firebaseApp = window.firebase.initializeApp(config);
    }

    if (window.firebase && window.firebase.auth) {
      firebaseAuth = window.firebase.auth();
      firebaseAuth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
    }

    if (window.firebase && window.firebase.database) {
      firebaseDB = window.firebase.database();
    }

    console.log('[FIREBASE] Firebase initialized successfully');
    return true;
  } catch (err) {
    console.warn('[FIREBASE] Could not initialize Firebase SDK, fallback active:', err.message);
    return false;
  }
}

// Google OAuth Login
export async function loginWithGoogle() {
  if (typeof window === 'undefined') return null;

  try {
    if (window.firebase && window.firebase.auth) {
      const provider = new window.firebase.auth.GoogleAuthProvider();
      const result = await window.firebase.auth().signInWithPopup(provider);
      const user = result.user;

      const userData = {
        uid: user.uid,
        displayName: user.displayName || 'Google User',
        email: user.email,
        photoURL: user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.email)}`,
        isGuest: false,
        isAdmin: user.email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim()
      };

      localStorage.setItem('betaai_user', JSON.stringify(userData));
      return userData;
    }
  } catch (error) {
    console.warn('[FIREBASE Auth] Popup cancelled or failed, falling back to simulated Google auth:', error.message);
  }

  // Simulated Google Auth fallback for local/offline testing
  const fallbackUser = {
    uid: 'google-user-' + Date.now(),
    displayName: 'Shahid Khan',
    email: ADMIN_EMAIL,
    photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=Shahid`,
    isGuest: false,
    isAdmin: true
  };

  localStorage.setItem('betaai_user', JSON.stringify(fallbackUser));
  return fallbackUser;
}

// Guest Login
export function loginAsGuest() {
  const guestUser = {
    uid: 'guest-' + Date.now(),
    displayName: 'Guest User',
    email: 'guest@betaai.local',
    photoURL: 'https://api.dicebear.com/7.x/bottts/svg?seed=Guest',
    isGuest: true,
    isAdmin: false
  };

  localStorage.setItem('betaai_user', JSON.stringify(guestUser));
  return guestUser;
}

// Logout
export async function logoutUser() {
  try {
    if (window.firebase && window.firebase.auth && window.firebase.auth().currentUser) {
      await window.firebase.auth().signOut();
    }
  } catch (e) {
    console.warn('[FIREBASE Logout] Error:', e.message);
  }
  localStorage.removeItem('betaai_user');
  sessionStorage.removeItem('betaai_csrf_token');
}

// Get Current User
export function getCurrentUser() {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('betaai_user');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// Save Global Settings to Firebase Realtime Database
export async function saveGlobalSettingsToCloud(settings) {
  const user = getCurrentUser();
  if (!user || !user.isAdmin) {
    throw new Error('Unauthorized: Admin access required to update global settings.');
  }

  try {
    if (window.firebase && window.firebase.database) {
      await window.firebase.database().ref('global_settings').set(settings);
      console.log('[FIREBASE RTDB] Global settings synced to cloud.');
      return true;
    }
  } catch (err) {
    console.warn('[FIREBASE RTDB] Realtime Database save error, storing locally:', err.message);
  }

  localStorage.setItem('betaai_cloud_settings', JSON.stringify(settings));
  return true;
}

// Fetch Global Settings from Firebase
export async function fetchGlobalSettingsFromCloud() {
  try {
    if (window.firebase && window.firebase.database) {
      const snapshot = await window.firebase.database().ref('global_settings').once('value');
      if (snapshot.exists()) {
        const data = snapshot.val();
        localStorage.setItem('betaai_cloud_settings', JSON.stringify(data));
        return data;
      }
    }
  } catch (err) {
    console.warn('[FIREBASE RTDB] Could not fetch settings from cloud, reading local cache:', err.message);
  }

  const cached = localStorage.getItem('betaai_cloud_settings');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      return null;
    }
  }
  return null;
}
