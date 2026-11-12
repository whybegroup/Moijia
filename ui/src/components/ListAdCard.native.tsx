import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { IOS_BANNER_AD_UNIT_ID } from '../config/ads';
import { Colors, Fonts, Radius } from '../constants/theme';

const MAX_BANNER_HEIGHT = 72;

function adErrorText(error: unknown): string {
  if (error == null) return 'unknown';
  const record = typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : null;
  const code = record?.code != null && record.code !== '' ? String(record.code) : '';
  const message =
    record?.message != null
      ? String(record.message)
      : error instanceof Error
        ? error.message
        : String(error);
  return code ? `${code}: ${message}` : message || 'unknown';
}

export function ListAdCard() {
  const [width, setWidth] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [size, setSize] = useState(BannerAdSize.INLINE_ADAPTIVE_BANNER);

  return (
    <View
      style={styles.wrap}
      accessibilityLabel="Advertisement"
      onLayout={(e) => {
        const next = Math.floor(e.nativeEvent.layout.width - 28);
        if (next > 0 && next !== width) setWidth(next);
      }}
    >
      <Text style={styles.label}>Ad</Text>
      {width > 0 ? (
        <BannerAd
          key={size}
          unitId={__DEV__ ? TestIds.ADAPTIVE_BANNER : IOS_BANNER_AD_UNIT_ID}
          size={size}
          width={width}
          maxHeight={size === BannerAdSize.INLINE_ADAPTIVE_BANNER ? MAX_BANNER_HEIGHT : undefined}
          onAdLoaded={() => setErrors([])}
          onAdFailedToLoad={(error) => {
            const line = adErrorText(error);
            console.warn(`Ad failed to load (${size}): ${line}`);
            setErrors((prev) => [...prev, line]);
            if (size === BannerAdSize.INLINE_ADAPTIVE_BANNER) {
              setSize(BannerAdSize.BANNER);
            }
          }}
        />
      ) : null}
      {errors.map((line, index) => (
        <Text key={index} style={styles.error} selectable>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
    marginBottom: 14,
    padding: 14,
  },
  label: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  error: {
    alignSelf: 'stretch',
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
});
