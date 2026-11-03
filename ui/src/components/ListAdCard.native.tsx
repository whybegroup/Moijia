import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { IOS_BANNER_AD_UNIT_ID } from '../config/ads';
import { Colors, Fonts } from '../constants/theme';

const MAX_BANNER_HEIGHT = 72;

export function ListAdCard({ docked = false }: { docked?: boolean }) {
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState(BannerAdSize.INLINE_ADAPTIVE_BANNER);
  if (failed) return null;

  return (
    <View
      style={[styles.wrap, docked && styles.docked]}
      accessibilityLabel="Advertisement"
      onLayout={(e) => {
        const next = Math.floor(e.nativeEvent.layout.width - 16);
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
          onAdFailedToLoad={() => {
            if (size === BannerAdSize.INLINE_ADAPTIVE_BANNER) {
              setSize(BannerAdSize.BANNER);
              return;
            }
            setFailed(true);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    width: '100%',
    marginTop: 10,
    marginBottom: 10,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.bg,
    alignItems: 'center',
  },
  docked: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 8,
    width: undefined,
    marginTop: 0,
    marginBottom: 0,
    zIndex: 2,
  },
  label: {
    alignSelf: 'flex-start',
    marginLeft: 4,
    marginBottom: 4,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
  },
});
