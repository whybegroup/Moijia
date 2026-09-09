import { memo, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  View,
  type ImageResizeMode,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { isVideoFileUrl } from '../utils/fileKind';
import { isDirectRenderableImageUrl, resolveImageViewUrls, toRenderableImageUrl } from '../services/resolveImageViewUrls';
import {
  ensureCachedImageFileUri,
  peekCachedImageFileUri,
} from '../services/imageDiskCache';

type Props = {
  storedUrl: string;
  style: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  /** Batch map from useResolvedImageUrls; omit to resolve this URL alone. */
  urlMap?: Map<string, string>;
  onError?: () => void;
  placeholderStyle?: StyleProp<ViewStyle>;
  /** Treat as video even when the URL has no file extension (local blob/file previews). */
  treatAsVideo?: boolean;
};

export function VideoMediaPlaceholder({
  style,
}: {
  style?: StyleProp<ImageStyle | ViewStyle>;
}) {
  return (
    <View style={[style, styles.videoPh]} accessibilityLabel="Video">
      <Ionicons name="play" size={22} color="#fff" />
    </View>
  );
}

/** Avoid `source={{ uri }}` identity churn on parent re-renders (e.g. typing in a nearby TextInput), which can reload images. */
const StableUriImage = memo(function StableUriImage({
  uri,
  style,
  resizeMode,
  onError,
}: {
  uri: string;
  style: StyleProp<ImageStyle>;
  resizeMode: ImageResizeMode;
  onError?: () => void;
}) {
  const source = useMemo(
    () => ({
      uri,
      // Prefer HTTP cache when still using remote URLs (iOS).
      ...(Platform.OS === 'ios' && !uri.startsWith('file:')
        ? ({ cache: 'force-cache' } as const)
        : null),
    }),
    [uri]
  );
  return <Image source={source} style={style} resizeMode={resizeMode} onError={onError} fadeDuration={0} />;
});

function useDisplayUri(
  storedUrl: string,
  remoteViewUrl: string | null
): string | null {
  const [displayUri, setDisplayUri] = useState<string | null>(() => {
    const source = storedUrl?.trim();
    if (!source) return null;
    const peek = peekCachedImageFileUri(source);
    if (peek) return peek;
    if (remoteViewUrl?.trim()) return toRenderableImageUrl(remoteViewUrl);
    if (isDirectRenderableImageUrl(source)) return toRenderableImageUrl(source);
    return null;
  });

  useEffect(() => {
    const source = storedUrl?.trim();
    if (!source) {
      setDisplayUri(null);
      return;
    }
    const peek = peekCachedImageFileUri(source);
    if (peek) {
      setDisplayUri(peek);
      return;
    }
    const remote = remoteViewUrl?.trim()
      ? toRenderableImageUrl(remoteViewUrl)
      : isDirectRenderableImageUrl(source)
        ? toRenderableImageUrl(source)
        : null;
    if (remote) {
      setDisplayUri(remote);
      void ensureCachedImageFileUri(source, remote);
      return;
    }
    setDisplayUri(null);
  }, [storedUrl, remoteViewUrl]);

  return displayUri;
}

export function ResolvableImage({
  storedUrl,
  style,
  resizeMode = 'cover',
  urlMap,
  onError,
  placeholderStyle,
  treatAsVideo = false,
}: Props) {
  const asVideo = treatAsVideo || isVideoFileUrl(storedUrl);
  const mapped = storedUrl?.trim() && urlMap ? urlMap.get(storedUrl) : undefined;
  const [singleRemote, setSingleRemote] = useState<string | null>(() => {
    if (!storedUrl?.trim()) return null;
    if (mapped?.trim()) return mapped.trim();
    if (isDirectRenderableImageUrl(storedUrl)) return toRenderableImageUrl(storedUrl);
    return peekCachedImageFileUri(storedUrl);
  });

  useEffect(() => {
    if (!storedUrl?.trim()) {
      setSingleRemote(null);
      return;
    }
    if (mapped?.trim()) {
      setSingleRemote(mapped.trim());
      return;
    }
    if (isDirectRenderableImageUrl(storedUrl)) {
      setSingleRemote(toRenderableImageUrl(storedUrl));
      return;
    }
    const peek = peekCachedImageFileUri(storedUrl);
    if (peek) {
      setSingleRemote(peek);
      return;
    }
    let cancelled = false;
    resolveImageViewUrls([storedUrl]).then((m) => {
      if (!cancelled) setSingleRemote(m.get(storedUrl) ?? storedUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [storedUrl, mapped]);

  const remoteViewUrl = mapped?.trim() ? mapped.trim() : singleRemote;
  const displayUri = useDisplayUri(storedUrl, remoteViewUrl);

  if (!storedUrl?.trim()) {
    return null;
  }

  if (asVideo) {
    return <VideoMediaPlaceholder style={style} />;
  }

  if (!displayUri?.trim()) {
    return (
      <View style={[style, styles.ph, placeholderStyle]}>
        <ActivityIndicator size="small" color={Colors.textMuted} />
      </View>
    );
  }

  return (
    <StableUriImage uri={displayUri} style={style} resizeMode={resizeMode} onError={onError} />
  );
}

const styles = StyleSheet.create({
  ph: { backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  videoPh: {
    backgroundColor: '#171717',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
