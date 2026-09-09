import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Colors } from '../constants/theme';
import { WEB_APP_MAX_WIDTH } from '../constants/webAppMaxWidth';

/** Centers the app in a max-width column on web; no-op on native. */
export function WebAppFrame({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') return children;
  return (
    <View style={styles.gutter}>
      <View style={styles.column}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  gutter: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
    backgroundColor: '#E4E4E7',
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: WEB_APP_MAX_WIDTH,
    backgroundColor: Colors.bg,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 16px 48px rgba(0,0,0,0.08)',
        } as object)
      : null),
  },
});
