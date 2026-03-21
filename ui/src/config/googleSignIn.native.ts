import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { googleIosClientId } from './googleAuth';

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
  const res = await gs.signIn();
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
