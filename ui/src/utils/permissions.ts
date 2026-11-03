import { Alert, Linking, Platform } from 'react-native';
import type { PermissionResponse } from 'expo-modules-core';

/** iOS will not present a permission alert or picker while a modal is dismissing. */
const MODAL_SETTLE_MS = 350;

export function settlePresentingModal(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, MODAL_SETTLE_MS));
}

const settingsPrompts = new Map<string, Promise<void>>();

function openSettingsPrompt(title: string, message: string): Promise<void> {
  const existing = settingsPrompts.get(title);
  if (existing) return existing;
  const pending = new Promise<void>((resolve) => {
    Alert.alert(title, message, [
      {
        text: 'Not now',
        style: 'cancel',
        onPress: () => resolve(),
      },
      {
        text: 'Open Settings',
        onPress: () => {
          void Linking.openSettings();
          resolve();
        },
      },
    ]);
  }).finally(() => {
    settingsPrompts.delete(title);
  });
  settingsPrompts.set(title, pending);
  return pending;
}

/**
 * Shows the system permission dialog when the OS will still ask.
 * When it will not (already denied), shows a prompt that opens Settings.
 */
export async function requestPermissionPrompt(
  get: () => Promise<PermissionResponse>,
  request: () => Promise<PermissionResponse>,
  copy: { title: string; message: string },
): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const current = await get();
  if (current.granted) return true;
  if (!current.canAskAgain) {
    await openSettingsPrompt(copy.title, copy.message);
    return false;
  }
  const next = await request();
  return next.granted;
}
