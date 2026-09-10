import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  GoogleAuthProvider,
  EmailAuthProvider,
  signInWithCredential,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
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
  const trimmedEmail = email.trim();
  const result = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
  const user = auth.currentUser ?? result.user;

  const displayName = trimmedEmail.split('@')[0] || 'User';
  await updateProfile(user, { displayName });

  auth.useDeviceLanguage();
  try {
    await sendEmailVerification(auth.currentUser ?? user);
  } catch {
    // Verify screen resends if this fails; do not block sign-up.
  }

  return auth.currentUser ?? user;
};

/** Email/password accounts must verify. OAuth (Google/Apple) is already trusted. */
export function needsEmailVerification(user: User | null | undefined): boolean {
  if (!user?.email || user.emailVerified) return false;
  const providers = user.providerData.map((p) => p.providerId);
  const oauthOnly =
    providers.length > 0 &&
    providers.every((id) => id === 'google.com' || id === 'apple.com' || id === 'facebook.com');
  return !oauthOnly;
}

export async function sendVerificationEmail(): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw Object.assign(new Error('Not signed in'), { code: 'auth/no-current-user' });
  }
  auth.useDeviceLanguage();
  await sendEmailVerification(user);
}

export async function reloadCurrentUser(): Promise<User | null> {
  const user = auth.currentUser;
  if (!user) return null;
  await user.reload();
  await user.getIdToken(true);
  return auth.currentUser;
}

export const sendPasswordReset = async (email: string) => {
  auth.useDeviceLanguage();
  await sendPasswordResetEmail(auth, email.trim());
};

export const hasPasswordProvider = (user: User | null | undefined): boolean =>
  !!user?.providerData.some((p) => p.providerId === 'password');

const PROVIDER_LABELS: Record<string, string> = {
  password: 'Email',
  'google.com': 'Google',
  'apple.com': 'Apple',
  'facebook.com': 'Facebook',
};

export const signInProviderLabels = (user: User | null | undefined): string => {
  const labels = [...new Set((user?.providerData ?? []).map((p) => PROVIDER_LABELS[p.providerId] ?? p.providerId))];
  return labels.length ? labels.join(', ') : '—';
};

/** Password is managed by an OAuth provider, not Firebase email/password. */
export const oauthPasswordHint = (user: User | null | undefined): string | null => {
  if (!user || hasPasswordProvider(user)) return null;
  const ids = user.providerData.map((p) => p.providerId);
  if (ids.includes('google.com')) {
    return 'You signed in with Google. Manage your password in your Google account.';
  }
  if (ids.includes('apple.com')) {
    return 'You signed in with Apple. There is no password to change here.';
  }
  if (ids.length) {
    return 'This account uses a sign-in provider, so there is no password to change here.';
  }
  return null;
};

export const changePassword = async (currentPassword: string, newPassword: string) => {
  const user = auth.currentUser;
  if (!user?.email) {
    throw Object.assign(new Error('No signed-in email account'), { code: 'auth/missing-email' });
  }
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
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
