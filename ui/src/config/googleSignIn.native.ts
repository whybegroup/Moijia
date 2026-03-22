import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { googleIosClientId } from './googleAuth';

const SIGN_IN_TIMEOUT_MS = 120_000;

function signInRejectedAfterTimeout(): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const err = new Error('GOOGLE_SIGN_IN_TIMEOUT') as Error & { code: string };
      err.code = 'GOOGLE_SIGN_IN_TIMEOUT';
      reject(err);
    }, SIGN_IN_TIMEOUT_MS);
  });
}

/** Treat as user abandoning sign-in (SDK sometimes omits proper cancel code). */
function isLikelySignInDismissal(err: unknown): boolean {
  if (!isErrorWithCode(err)) return false;
  const c = String(err.code);
  if (c === statusCodes.SIGN_IN_CANCELLED || c === '-5') return true;
  const msg = 'message' in err && typeof (err as { message: unknown }).message === 'string'
    ? (err as { message: string }).message
    : '';
  return /canceled|cancelled|user canceled|user cancelled|dismiss|the user canceled|access_denied/i.test(
    msg,
  );
}

function isGoogleSignInLinked(): boolean {
  return (
    TurboModuleRegistry.get?.('RNGoogleSignin') != null ||
    NativeModules.RNGoogleSignin != null
  );
}

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin').GoogleSignin;

let GoogleSignin: GoogleSigninModule | null = null;

function getGoogleSignin(): GoogleSigninModule {
  if (!isGoogleSignInLinked()) {
    throw new Error(
      'Google Sign-In is not in this app. Build a dev client from ui: npx expo run:android (or ios). Expo Go does not include this native module.',
    );
  }
  if (!GoogleSignin) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
  }
  return GoogleSignin;
}

let configured = false;

function configure(gs: GoogleSigninModule, webClientId: string) {
  if (configured) return;
  if (Platform.OS === 'ios' && !googleIosClientId) {
    throw new Error(
      'Missing EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID. On iOS, add it to .env or include GoogleService-Info.plist in the Xcode project.',
    );
  }
  gs.configure({
    webClientId,
    ...(Platform.OS === 'ios' ? { iosClientId: googleIosClientId } : {}),
    offlineAccess: false,
  });
  configured = true;
}

/**
 * Native Google Sign-In (no https redirect_uri; uses platform OAuth + Web client ID for Firebase id token).
 */
export async function signInWithGoogleIdTokenNative(
  webClientId: string,
): Promise<{ idToken: string; accessToken: string } | null> {
  if (!webClientId) throw new Error('Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
  const gs = getGoogleSignin();
  configure(gs, webClientId);
  await gs.hasPlayServices({ showPlayServicesUpdateDialog: true });

  let res: Awaited<ReturnType<typeof gs.signIn>>;
  try {
    res = await Promise.race([gs.signIn(), signInRejectedAfterTimeout()]);
  } catch (e) {
    if (isErrorWithCode(e) && e.code === 'GOOGLE_SIGN_IN_TIMEOUT') throw e;
    if (isLikelySignInDismissal(e)) return null;
    throw e;
  }

  if (res.type === 'cancelled') return null;
  if (res.type !== 'success') return null;

  let idToken = res.data.idToken;
  let accessToken: string | null | undefined;

  try {
    const tokens = await gs.getTokens();
    idToken = idToken || tokens.idToken;
    accessToken = tokens.accessToken;
  } catch {
    // accessToken is optional for Firebase; idToken from sign-in may still be enough
  }

  if (!idToken) {
    throw new Error(
      'Google did not return an ID token. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to the Web client ID from Firebase, and add the SHA-1 of android/app/debug.keystore (this app’s debug signing key) for package com.whybe.moija.',
    );
  }

  return { idToken, accessToken: accessToken ?? '' };
}
