import { type ReactNode, useMemo } from 'react';
import { View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadows } from '../constants/theme';

const POPOVER_MAX_W = 560;

type Props = { children: ReactNode; onClose: () => void };

/**
 * Dimmed scrim + centered card. Layout does not depend on viewport width.
 * Used with Stack `presentation: 'transparentModal'`.
 */
export function EventFormPopoverChrome({ children, onClose }: Props) {
  const { height } = useWindowDimensions();

  const sheetStyle = useMemo(
    () => [
      styles.sheet,
      {
        maxWidth: POPOVER_MAX_W,
        width: '100%' as const,
        flex: 1,
        maxHeight: height * 0.92,
        borderRadius: Radius['2xl'],
        overflow: 'hidden' as const,
        alignSelf: 'center' as const,
        ...(Shadows.lg ?? {}),
      },
    ],
    [height]
  );

  return (
    <View style={styles.root}>
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
