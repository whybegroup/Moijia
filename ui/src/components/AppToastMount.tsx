import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { appToastConfig } from '../config/appToastConfig';

const EXTRA_BOTTOM = 20;

/**
 * Mount once in root layout and again inside modal chrome so `Toast.show` uses the
 * topmost ref (see react-native-toast-message) and toasts are not hidden behind stack modals.
 */
export function AppToastMount() {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, 12) + EXTRA_BOTTOM;

  return (
    <Toast
      config={appToastConfig}
      position="bottom"
      bottomOffset={bottomOffset}
    />
  );
}
