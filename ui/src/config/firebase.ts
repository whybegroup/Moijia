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
      // Check if auth is already initialized
      const existingAuth = getAuth(app);
      if (existingAuth) {
        console.log('Auth already initialized, using existing instance');
        return existingAuth;
      }
    } catch (e) {
      // Auth not initialized yet, continue
    }
    
    try {
      // Use initializeAuth to explicitly set persistence to IndexedDB
      const newAuth = initializeAuth(app, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      });
      console.log('Auth initialized with IndexedDB persistence');
      console.log('Current user on init:', newAuth.currentUser?.email || 'none');
      return newAuth;
    } catch (error: any) {
      console.error('Error initializing auth:', error);
      // If already initialized, just get the existing instance
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

// Verify auth is working
console.log('Auth instance ready:', !!auth);
console.log('Auth app name:', auth.app.name);

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();

// Configure Google Auth scopes
googleProvider.addScope('profile');
googleProvider.addScope('email');

export { auth, googleProvider, User };

// Auth helper functions
export const signInWithGoogle = async (idToken?: string, accessToken?: string) => {
  try {
    console.log('[Firebase] signInWithGoogle called, platform:', Platform.OS);
    
    // For web, use popup (most reliable in modern browsers)
    if (Platform.OS === 'web') {
      console.log('[Firebase] Starting popup sign-in...');
      const result = await signInWithPopup(auth, googleProvider);
      console.log('[Firebase] Sign-in successful:', result.user.email);
      return result.user;
    }
    
    // For mobile, caller must obtain an ID token (e.g. @react-native-google-signin/google-signin).
    if (!idToken) {
      throw new Error('Missing id token for mobile sign-in');
    }
    const credential = GoogleAuthProvider.credential(idToken, accessToken ?? undefined);
    const result = await signInWithCredential(auth, credential);
    return result.user;
  } catch (error: any) {
    console.error('[Firebase] Error signing in with Google:', error);
    console.error('[Firebase] Error code:', error.code);
    console.error('[Firebase] Error message:', error.message);
    throw error;
  }
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
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const getCurrentUser = () => {
  const user = auth.currentUser;
  console.log('[Firebase] getCurrentUser:', {
    hasUser: !!user,
    email: user?.email,
    uid: user?.uid,
  });
  return user;
};

export const onAuthStateChange = (callback: (user: User | null) => void) => {
  console.log('[Firebase] Setting up onAuthStateChanged listener');
  return onAuthStateChanged(auth, (user) => {
    console.log('[Firebase] onAuthStateChanged fired:', {
      hasUser: !!user,
      email: user?.email,
      uid: user?.uid,
    });
    callback(user);
  });
};
