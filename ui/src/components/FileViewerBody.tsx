import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts, Radius } from '../constants/theme';
import {
  isDirectRenderableImageUrl,
  resolveImageViewUrls,
  toRenderableImageUrl,
} from '../services/resolveImageViewUrls';
import { displayFileName, fileViewerKind } from '../utils/fileKind';
import { isDeletedFileHref, isDeletedImageSrc } from '../utils/deletedMedia';
import { FileExtensionPreview } from './FileExtensionPreview';
import { DeletedImagePlaceholder } from './DeletedPostMedia';
import { FileViewerPdf } from './FileViewerPdf';
import { FileViewerHtml } from './FileViewerHtml';
import { FileViewerDocument } from './FileViewerDocument';

const TEXT_LIMIT = 200_000;

type Props = {
  storedUrl: string;
  fileName?: string;
  urlMap?: Map<string, string>;
  active: boolean;
};

function mapGet(urlMap: Map<string, string> | undefined, storedUrl: string): string | undefined {
  return urlMap?.get(storedUrl);
}

function useResolvedViewUrl(storedUrl: string, urlMap?: Map<string, string>): string | null {
  const mapped = mapGet(urlMap, storedUrl);
  const [resolved, setResolved] = useState<string | null>(() => {
    if (!storedUrl?.trim()) return null;
    if (mapped?.trim()) return mapped.trim();
    if (isDirectRenderableImageUrl(storedUrl)) return toRenderableImageUrl(storedUrl);
    return null;
  });

  useEffect(() => {
    const source = storedUrl?.trim();
    if (!source) {
      setResolved(null);
      return;
    }
    if (mapped?.trim()) {
      setResolved(mapped.trim());
      return;
    }
    if (isDirectRenderableImageUrl(source)) {
      setResolved(toRenderableImageUrl(source));
      return;
    }
    let cancelled = false;
    void resolveImageViewUrls([source]).then((m) => {
      if (!cancelled) setResolved((m.get(source) ?? source).trim());
    });
    return () => {
      cancelled = true;
    };
  }, [storedUrl, mapped]);

  return resolved;
}

async function openExternally(uri: string) {
  if (Platform.OS === 'web') {
    window.open(uri, '_blank', 'noopener,noreferrer');
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(uri);
  } catch {
    await Linking.openURL(uri);
  }
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

async function enableLoudPlayback() {
  if (Platform.OS === 'web') return;
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
    allowsRecording: false,
    interruptionMode: 'doNotMix',
  });
}

function AudioViewer({
  uri,
  fileName,
  active,
}: {
  uri: string;
  fileName?: string;
  active: boolean;
}) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [trackW, setTrackW] = useState(1);
  const name = displayFileName(uri, fileName);
  const duration = status.duration || 0;
  const current = status.currentTime || 0;
  const pct = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0;

  useEffect(() => {
    if (!active) {
      player.pause();
      return;
    }
    void enableLoudPlayback();
  }, [active, player]);

  const toggle = useCallback(() => {
    if (status.playing) {
      player.pause();
      return;
    }
    void enableLoudPlayback().then(() => player.play());
  }, [player, status.playing]);

  const seekAt = useCallback(
    (x: number) => {
      if (duration <= 0) return;
      const t = Math.max(0, Math.min(1, x / Math.max(trackW, 1))) * duration;
      player.seekTo(t);
    },
    [duration, player, trackW]
  );

  return (
    <View style={styles.audioWrap}>
      <View style={styles.audioIcon}>
        <Ionicons name="musical-notes" size={36} color="#fff" />
      </View>
      <Text style={styles.audioName} numberOfLines={2} ellipsizeMode="middle">
        {name}
      </Text>
      <TouchableOpacity
        onPress={toggle}
        style={styles.playBtn}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause' : 'Play'}
      >
        <Ionicons name={status.playing ? 'pause' : 'play'} size={28} color="#111" />
      </TouchableOpacity>
      <Pressable
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        onPress={(e) => seekAt(e.nativeEvent.locationX)}
        style={styles.trackHit}
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
      >
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${pct * 100}%` }]} />
        </View>
      </Pressable>
      <Text style={styles.audioTime}>
        {formatClock(current)} / {formatClock(duration)}
      </Text>
    </View>
  );
}

function VideoViewer({ uri, active }: { uri: string; active: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);

  return (
    <View style={styles.video}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
      />
    </View>
  );
}

function TextViewer({ uri, fileName }: { uri: string; fileName?: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setFailed(false);
    void (async () => {
      try {
        const res = await fetch(uri);
        if (!res.ok) throw new Error('fetch failed');
        const raw = await res.text();
        if (!cancelled) {
          setText(raw.length > TEXT_LIMIT ? `${raw.slice(0, TEXT_LIMIT)}\n\n…` : raw);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (failed) {
    return <GenericViewer uri={uri} fileName={fileName} />;
  }
  if (text == null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent}>
      <Text style={styles.textBody}>{text}</Text>
    </ScrollView>
  );
}

function GenericViewer({ uri, fileName }: { uri: string; fileName?: string }) {
  return (
    <View style={styles.genericWrap}>
      <FileExtensionPreview url={uri} fileName={fileName} variant="viewer" />
      <TouchableOpacity
        onPress={() => void openExternally(uri)}
        style={styles.openBtn}
        accessibilityRole="button"
        accessibilityLabel="Open file"
      >
        <Text style={styles.openBtnText}>Open</Text>
      </TouchableOpacity>
    </View>
  );
}

function FileViewerBodyInner({ storedUrl, fileName, urlMap, active }: Props) {
  const kind = fileViewerKind(storedUrl, fileName);
  const viewUrl = useResolvedViewUrl(storedUrl, urlMap);

  if (isDeletedImageSrc(storedUrl)) {
    return (
      <View style={styles.center}>
        <DeletedImagePlaceholder style={styles.deletedImage} />
      </View>
    );
  }
  if (isDeletedFileHref(storedUrl)) {
    return <FileExtensionPreview url={storedUrl} fileName={fileName} variant="viewer" />;
  }
  if (!viewUrl) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (kind === 'audio') {
    return <AudioViewer key={viewUrl} uri={viewUrl} fileName={fileName} active={active} />;
  }
  if (kind === 'video') {
    return <VideoViewer key={viewUrl} uri={viewUrl} active={active} />;
  }
  if (kind === 'pdf') {
    return <FileViewerPdf uri={viewUrl} fileName={fileName} />;
  }
  if (kind === 'html') {
    return <FileViewerHtml uri={viewUrl} fileName={fileName} />;
  }
  if (kind === 'document') {
    return <FileViewerDocument uri={viewUrl} fileName={fileName} />;
  }
  if (kind === 'text') {
    return <TextViewer uri={viewUrl} fileName={fileName} />;
  }
  return <GenericViewer uri={viewUrl} fileName={fileName} />;
}

const PAGE_INDEX_GAP = 40;

export function FileViewerBody({ storedUrl, fileName, urlMap, active }: Props) {
  const insets = useSafeAreaInsets();
  if (!storedUrl?.trim()) return null;
  return (
    <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 12) + PAGE_INDEX_GAP }]}>
      <FileViewerBodyInner
        storedUrl={storedUrl}
        fileName={fileName}
        urlMap={urlMap}
        active={active}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, width: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  deletedImage: { width: 160, height: 160 },
  audioWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  audioIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioName: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.semiBold,
    textAlign: 'center',
    width: '100%',
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  trackHit: { width: '100%', paddingVertical: 10 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  audioTime: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontFamily: Fonts.medium,
  },
  video: { width: '100%', height: '100%' },
  textScroll: { flex: 1, width: '100%' },
  textContent: { paddingHorizontal: 20, paddingVertical: 12, paddingBottom: 32 },
  textBody: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  genericWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  openBtn: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: Radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  openBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.semiBold },
});
