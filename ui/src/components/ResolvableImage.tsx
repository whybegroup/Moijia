import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  View,
  type ImageResizeMode,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { Colors } from '../constants/theme';
import { isDirectRenderableImageUrl, resolveImageViewUrls } from '../services/resolveImageViewUrls';

type Props = {
  storedUrl: string;
  style: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  /** Batch map from useResolvedImageUrls; omit to resolve this URL alone. */
  urlMap?: Map<string, string>;
  onError?: () => void;
};

export function ResolvableImage({ storedUrl, style, resizeMode = 'cover', urlMap, onError }: Props) {
  const [singleUri, setSingleUri] = useState<string | null>(() =>
    isDirectRenderableImageUrl(storedUrl) ? storedUrl : null,
  );

  useEffect(() => {
    if (urlMap) return;
    if (isDirectRenderableImageUrl(storedUrl)) {
      setSingleUri(storedUrl);
      return;
    }
    let cancelled = false;
    resolveImageViewUrls([storedUrl]).then((m) => {
      if (!cancelled) setSingleUri(m.get(storedUrl) ?? storedUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [storedUrl, urlMap]);

  if (isDirectRenderableImageUrl(storedUrl)) {
    return <Image source={{ uri: storedUrl }} style={style} resizeMode={resizeMode} onError={onError} />;
  }

  if (urlMap) {
    const uri = urlMap.get(storedUrl);
    if (uri === undefined) {
      return (
        <View style={[style, styles.ph]}>
          <ActivityIndicator size="small" color={Colors.textMuted} />
        </View>
      );
    }
    return <Image source={{ uri }} style={style} resizeMode={resizeMode} onError={onError} />;
  }

  if (!singleUri) {
    return (
      <View style={[style, styles.ph]}>
        <ActivityIndicator size="small" color={Colors.textMuted} />
      </View>
    );
  }
  return <Image source={{ uri: singleUri }} style={style} resizeMode={resizeMode} onError={onError} />;
}

const styles = StyleSheet.create({
  ph: { backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
});
