import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  User,
  type Persistence,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

// Enable web browser completion for auth flows
WebBrowser.maybeCompleteAuthSession();

/** Each Firebase registered app has its own appId; native should match GoogleService-Info.plist / google-services.json. */
function resolveFirebaseAppId(): string | undefined {
  switch (Platform.OS) {
    case 'ios':
      return (
        process.env.EXPO_PUBLIC_FIREBASE_APP_ID_IOS ?? process.env.EXPO_PUBLIC_FIREBASE_APP_ID
      );
    case 'android':
      return (
        process.env.EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID ??
        process.env.EXPO_PUBLIC_FIREBASE_APP_ID
      );
    default:
      return process.env.EXPO_PUBLIC_FIREBASE_APP_ID;
  }
}

/** API keys are per Firebase client; match plist / google-services.json for native. */
function resolveFirebaseApiKey(): string | undefined {
  switch (Platform.OS) {
    case 'ios':
      return (
        process.env.EXPO_PUBLIC_FIREBASE_API_KEY_IOS ?? process.env.EXPO_PUBLIC_FIREBASE_API_KEY
      );
    case 'android':
      return (
        process.env.EXPO_PUBLIC_FIREBASE_API_KEY_ANDROID ??
        process.env.EXPO_PUBLIC_FIREBASE_API_KEY
      );
    default:
      return process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  }
}

// Firebase configuration
const firebaseConfig = {
  apiKey: resolveFirebaseApiKey(),
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: resolveFirebaseAppId(),
};

// Initialize Firebase
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Initialize Auth with IndexedDB persistence (doesn't rely on sessionStorage)
const initAuth = () => {
  if (Platform.OS === 'web') {
    try {
      const existingAuth = getAuth(app);
      if (existingAuth) {
        return existingAuth;
      }
    } catch {
      // Auth not initialized yet, continue
    }

    try {
      return initializeAuth(app, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      });
    } catch {
      return getAuth(app);
    }
  }
  // RN-only export (not on firebase/auth types); resolves to @firebase/auth dist/rn via Metro.
  const { getReactNativePersistence } = require('@firebase/auth') as {
    getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
  };
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
};

const auth = initAuth();

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();

// Configure Google Auth scopes
googleProvider.addScope('profile');
googleProvider.addScope('email');

export { auth, googleProvider, User };

// Auth helper functions
export const signInWithGoogle = async (idToken?: string, accessToken?: string) => {
  if (Platform.OS === 'web') {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  }

  if (!idToken) {
    throw new Error('Missing id token for mobile sign-in');
  }
  const credential = GoogleAuthProvider.credential(idToken, accessToken ?? undefined);
  const result = await signInWithCredential(auth, credential);
  return result.user;
};

export const signInWithEmail = async (email: string, password: string) => {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
};

export const signUpWithEmail = async (email: string, password: string) => {
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
};

export const signOut = async () => {
  await firebaseSignOut(auth);
};

export const getCurrentUser = () => auth.currentUser;

export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
};
