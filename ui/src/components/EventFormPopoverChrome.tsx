import { type ReactNode, useMemo } from 'react';
import { View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadows } from '../constants/theme';

const POPOVER_MAX_W = 560;

type Props = { children: ReactNode; onClose: () => void };

/**
 * Dimmed scrim + centered card. Layout does not depend on viewport width.
 * Used with Stack `presentation: 'transparentModal'`.
 */
export function EventFormPopoverChrome({ children, onClose }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const rootStyle = useMemo(
    () => [
      styles.root,
      {
        paddingTop: Math.max(insets.top, 10) + 6,
        paddingBottom: Math.max(insets.bottom, 10) + 2,
      },
    ],
    [insets.bottom, insets.top]
  );

  const sheetStyle = useMemo(
    () => [
      styles.sheet,
      {
        maxWidth: POPOVER_MAX_W,
        width: '100%' as const,
        flex: 1,
        // Keep modal below status area / dynamic island on iPhone.
        maxHeight: Math.max(320, height - (Math.max(insets.top, 10) + Math.max(insets.bottom, 10) + 24)),
        borderRadius: Radius['2xl'],
        overflow: 'hidden' as const,
        alignSelf: 'center' as const,
        ...(Shadows.lg ?? {}),
      },
    ],
    [height, insets.bottom, insets.top]
  );

  return (
    <View style={rootStyle}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={sheetStyle}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.overlay,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  scrim: StyleSheet.absoluteFillObject,
  sheet: {
    backgroundColor: Colors.surface,
  },
});
