import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { OpenAPI } from '@boltup/client';

const DEFAULT_BASE = 'http://localhost:3000/api';
const DEV_API_PORT = 3000;

function normalizeBase(url: string): string {
  return url.trim().replace(/\/$/, '');
}

/**
 * Android cannot reach a dev API at localhost — that is the phone/emulator itself.
 * - Emulator: host loopback is 10.0.2.2
 * - Expo Go: expoConfig.hostUri usually has the machine LAN IP (works for emulator + device)
 */
function resolveBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return normalizeBase(fromEnv);

  if (!__DEV__) return DEFAULT_BASE;

  if (Platform.OS === 'android') {
    const hostUri = Constants.expoConfig?.hostUri;
    const host = hostUri?.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:${DEV_API_PORT}/api`;
    }
    return `http://10.0.2.2:${DEV_API_PORT}/api`;
  }

  return DEFAULT_BASE;
}

OpenAPI.BASE = resolveBase();
