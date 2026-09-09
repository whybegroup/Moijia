import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts, Radius } from '../constants/theme';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { useUser, useUsers } from '../hooks/api';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { FileExtensionPreview } from './FileExtensionPreview';
import { PostMediaImage } from './DeletedPostMedia';
import { UserAvatar } from './UserAvatar';
import { isDeletedFileHref, isDeletedImageSrc } from '../utils/deletedMedia';
import { shareImage } from '../services/downloadImage';
import { displayFileName, isImageFileUrl, isVideoFileUrl } from '../utils/fileKind';
import { confirmDestructive } from '../utils/confirmDestructive';
import { managedUploadOwnerUserId } from '../utils/canDeleteManagedMedia';
import { FileViewerBody } from './FileViewerBody';

function isLocalDraftMediaUrl(url: string): boolean {
  const u = (url || '').trim().toLowerCase();
  return (
    u.startsWith('file:') ||
    u.startsWith('content:') ||
    u.startsWith('blob:') ||
    u.startsWith('ph://') ||
    u.startsWith('assets-library:') ||
    u.startsWith('data:')
  );
}

function userDisplayName(user: { displayName?: string | null; name?: string | null } | null | undefined): string | undefined {
  const n = (user?.displayName || user?.name || '').trim();
  return n || undefined;
}

type ImageLightboxModalProps = {
  visible: boolean;
  urls: string[];
  /** Parallel to `urls` — original file names for non-image items. */
  names?: Array<string | undefined>;
  index: number;
  onChangeIndex: (nextIndex: number) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  headerAvatar?: ReactNode;
  showCounter?: boolean;
  urlMap?: Map<string, string> | Record<string, string>;
  onDelete?: (url: string) => void;
  deleting?: boolean;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_EPS = 1.01;
const DOUBLE_TAP_SCALE = 2.5;
const SLIDE = { duration: 220, easing: Easing.out(Easing.cubic) };
const DISMISS = { duration: 180, easing: Easing.in(Easing.cubic) };
const FADE = { duration: 120, easing: Easing.out(Easing.cubic) };
const HEADER_ROW = 40;
const HEADER_PAD_BOTTOM = 12;
const DISMISS_DISTANCE = 72;
const DISMISS_VELOCITY = 650;

function clampZoomPan(tx: number, ty: number, s: number, w: number, h: number): { x: number; y: number } {
  'worklet';
  const maxX = Math.max(0, (w * (s - 1)) / 2);
  const maxY = Math.max(0, (h * (s - 1)) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, tx)),
    y: Math.min(maxY, Math.max(-maxY, ty)),
  };
}

export function ImageLightboxModal({
  visible,
  urls,
  names,
  index,
  onChangeIndex,
  onClose,
  title,
  subtitle,
  headerAvatar,
  showCounter = false,
  urlMap,
  onDelete,
  deleting = false,
}: ImageLightboxModalProps) {
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useCurrentUserContext();
  const { data: allUsers = [] } = useUsers();
  const { width: winW, height: winH } = useWindowDimensions();
  const headerPadTop = Math.max(insets.top, 12) + 8;
  const headerH = headerPadTop + HEADER_ROW + HEADER_PAD_BOTTOM;
  const bottomPad = Math.max(insets.bottom, 12);
  const [stageSize, setStageSize] = useState({ w: winW, h: Math.max(280, winH) });
  const [sharing, setSharing] = useState(false);
  const gestureClosingRef = useRef(false);

  const stageW = stageSize.w > 1 ? stageSize.w : winW;
  const stageH = stageSize.h > 1 ? stageSize.h : Math.max(280, winH);

  const hasMany = urls.length > 1;
  const safeIndex = Math.max(0, Math.min(index, Math.max(urls.length - 1, 0)));
  const currentUrl = urls[safeIndex] ?? '';
  const currentName = names?.[safeIndex];
  const currentIsImage = isImageFileUrl(currentUrl, currentName);
  const fallbackTitle = currentIsImage ? 'Photo' : displayFileName(currentUrl, currentName);
  const resolvedOwnerId =
    managedUploadOwnerUserId(currentUrl) ||
    (isLocalDraftMediaUrl(currentUrl) ? currentUser?.id ?? null : null);
  const fromUserList = resolvedOwnerId ? allUsers.find((u) => u.id === resolvedOwnerId) : undefined;
  const { data: fetchedUser } = useUser(
    visible && resolvedOwnerId && !fromUserList && resolvedOwnerId !== currentUser?.id
      ? resolvedOwnerId
      : ''
  );
  const uploader =
    (resolvedOwnerId && currentUser?.id === resolvedOwnerId ? currentUser : undefined) ||
    fromUserList ||
    (fetchedUser?.id === resolvedOwnerId ? fetchedUser : undefined);
  const uploaderName = userDisplayName(uploader);
  const resolvedTitle = uploaderName || title;
  const resolvedAvatar =
    uploaderName && uploader ? (
      <UserAvatar
        seed={uploaderName}
        backgroundColor={[uploader.avatarSeed ?? '']}
        thumbnail={uploader.thumbnail ?? null}
        size={28}
      />
    ) : (
      headerAvatar
    );
  const hasHeader = !!resolvedTitle || !!subtitle || !!resolvedAvatar;
  const normalizedUrlMap = useMemo(
    () => (urlMap instanceof Map ? urlMap : urlMap ? new Map(Object.entries(urlMap)) : undefined),
    [urlMap]
  );

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const pageOffset = useSharedValue(0);
  const dismissY = useSharedValue(0);
  const panAxis = useSharedValue(0);
  const pageIndexSv = useSharedValue(safeIndex);
  const pageCountSv = useSharedValue(Math.max(urls.length, 1));
  const widthSv = useSharedValue(winW);
  const heightSv = useSharedValue(stageH);
  const dragOrigin = useSharedValue(0);
  const isPaging = useSharedValue(0);
  const closingSv = useSharedValue(0);
  const overlayOpacity = useSharedValue(visible ? 1 : 0);

  const goToIndex = useCallback(
    (nextIndex: number) => {
      onChangeIndex(nextIndex);
    },
    [onChangeIndex]
  );

  const beginClosing = useCallback(() => {
    gestureClosingRef.current = true;
  }, []);

  const closeViewer = useCallback(() => {
    gestureClosingRef.current = true;
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (gestureClosingRef.current) return;
    gestureClosingRef.current = true;
    closingSv.value = 1;
    overlayOpacity.value = withTiming(0, FADE, () => {
      runOnJS(onClose)();
    });
  }, [onClose, overlayOpacity, closingSv]);

  const jumpToIndex = useCallback(
    (nextIndex: number) => {
      const target = Math.max(0, Math.min(urls.length - 1, nextIndex));
      pageIndexSv.value = target;
      pageOffset.value = withTiming(-target * stageW, SLIDE);
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      onChangeIndex(target);
    },
    [
      urls.length,
      stageW,
      onChangeIndex,
      pageIndexSv,
      pageOffset,
      scale,
      savedScale,
      translateX,
      translateY,
      savedTranslateX,
      savedTranslateY,
    ]
  );

  const resetZoom = useCallback(() => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const urlsKey = urls.join('\0');

  useEffect(() => {
    pageCountSv.value = Math.max(urls.length, 1);
    widthSv.value = stageW;
    heightSv.value = stageH;
  }, [urls.length, stageW, stageH, pageCountSv, widthSv, heightSv]);

  useEffect(() => {
    if (!visible) return;
    if (urls.length === 0) {
      onClose();
      return;
    }
    if (index !== safeIndex) onChangeIndex(safeIndex);
  }, [visible, urls.length, index, safeIndex, onChangeIndex, onClose]);

  useLayoutEffect(() => {
    if (!visible) {
      overlayOpacity.value = 0;
      closingSv.value = 0;
      gestureClosingRef.current = false;
      return;
    }
    if (gestureClosingRef.current || closingSv.value) return;
    overlayOpacity.value = 1;
    pageCountSv.value = Math.max(urls.length, 1);
    pageIndexSv.value = safeIndex;
    pageOffset.value = -safeIndex * stageW;
    dismissY.value = 0;
    panAxis.value = 0;
    isPaging.value = 0;
    closingSv.value = 0;
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [visible, stageW, urlsKey]);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((e) => {
          if (closingSv.value || isPaging.value) return;
          const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
          scale.value = next;
          const clamped = clampZoomPan(translateX.value, translateY.value, next, widthSv.value, heightSv.value);
          translateX.value = clamped.x;
          translateY.value = clamped.y;
        })
        .onEnd(() => {
          if (closingSv.value) return;
          if (isPaging.value) {
            scale.value = 1;
            savedScale.value = 1;
            return;
          }
          const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value));
          if (nextScale <= ZOOM_EPS) {
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
            scale.value = withTiming(1);
            savedScale.value = 1;
            return;
          }
          const clamped = clampZoomPan(translateX.value, translateY.value, nextScale, widthSv.value, heightSv.value);
          scale.value = withTiming(nextScale);
          savedScale.value = nextScale;
          translateX.value = withTiming(clamped.x);
          translateY.value = withTiming(clamped.y);
          savedTranslateX.value = clamped.x;
          savedTranslateY.value = clamped.y;
        }),
    [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY, isPaging, closingSv, widthSv, heightSv]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .onStart(() => {
          if (closingSv.value) return;
          cancelAnimation(pageOffset);
          cancelAnimation(dismissY);
          dragOrigin.value = pageOffset.value;
          const zoomed = scale.value > ZOOM_EPS || savedScale.value > ZOOM_EPS;
          isPaging.value = zoomed ? 0 : 1;
          if (isPaging.value) {
            scale.value = 1;
            savedScale.value = 1;
            translateX.value = 0;
            translateY.value = 0;
          }
        })
        .onUpdate((e) => {
          if (closingSv.value) return;
          const zoomed = scale.value > ZOOM_EPS || savedScale.value > ZOOM_EPS;
          if (zoomed) {
            isPaging.value = 0;
            const next = clampZoomPan(
              savedTranslateX.value + e.translationX,
              savedTranslateY.value + e.translationY,
              scale.value,
              widthSv.value,
              heightSv.value
            );
            translateX.value = next.x;
            translateY.value = next.y;
            return;
          }
          if (panAxis.value === 0) {
            const ax = Math.abs(e.translationX);
            const ay = Math.abs(e.translationY);
            if (ay > 8 && ay >= ax) panAxis.value = 2;
            else if (ax > 8) panAxis.value = 1;
          }
          if (panAxis.value === 2) {
            dismissY.value = Math.max(0, e.translationY);
            return;
          }
          const count = pageCountSv.value;
          if (count <= 1) return;
          const w = widthSv.value;
          const minOffset = -(count - 1) * w;
          let next = dragOrigin.value + e.translationX;
          if (next > 0) next *= 0.28;
          else if (next < minOffset) next = minOffset + (next - minOffset) * 0.28;
          pageOffset.value = next;
        })
        .onEnd((e) => {
          if (closingSv.value) return;
          const zoomed = scale.value > ZOOM_EPS || savedScale.value > ZOOM_EPS;
          if (zoomed) {
            const next = clampZoomPan(
              translateX.value,
              translateY.value,
              scale.value,
              widthSv.value,
              heightSv.value
            );
            translateX.value = next.x;
            translateY.value = next.y;
            savedTranslateX.value = next.x;
            savedTranslateY.value = next.y;
            isPaging.value = 0;
            panAxis.value = 0;
            return;
          }
          const wasDismiss = panAxis.value === 2 || dismissY.value > 8;
          panAxis.value = 0;
          isPaging.value = 0;
          const w = widthSv.value;
          const count = pageCountSv.value;
          if (wasDismiss) {
            const shouldClose =
              dismissY.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
            if (shouldClose) {
              closingSv.value = 1;
              runOnJS(beginClosing)();
              const fly = Math.max(heightSv.value, winH);
              dismissY.value = withTiming(fly, DISMISS, () => {
                runOnJS(closeViewer)();
              });
            } else {
              dismissY.value = withTiming(0, SLIDE);
            }
            return;
          }
          dismissY.value = withTiming(0, SLIDE);
          if (count <= 1) {
            pageOffset.value = withTiming(0, SLIDE);
            return;
          }
          const velocityBias = Math.abs(e.velocityX) > 600 ? Math.sign(-e.velocityX) * 0.35 : 0;
          let target = Math.round(-pageOffset.value / Math.max(w, 1) + velocityBias);
          if (target < 0) target = 0;
          if (target > count - 1) target = count - 1;
          pageIndexSv.value = target;
          pageOffset.value = withTiming(-target * w, SLIDE, (finished) => {
            if (finished) runOnJS(goToIndex)(target);
          });
        })
        .onFinalize((e) => {
          if (closingSv.value) return;
          isPaging.value = 0;
          panAxis.value = 0;
          if (dismissY.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
            closingSv.value = 1;
            runOnJS(beginClosing)();
            const fly = Math.max(heightSv.value, winH);
            dismissY.value = withTiming(fly, DISMISS, () => {
              runOnJS(closeViewer)();
            });
            return;
          }
          if (dismissY.value > 0.5) {
            dismissY.value = withTiming(0, SLIDE);
          }
        }),
    [
      scale,
      savedScale,
      translateX,
      translateY,
      savedTranslateX,
      savedTranslateY,
      pageOffset,
      dismissY,
      panAxis,
      pageIndexSv,
      pageCountSv,
      widthSv,
      heightSv,
      dragOrigin,
      isPaging,
      closingSv,
      winH,
      goToIndex,
      beginClosing,
      closeViewer,
    ]
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDistance(16)
        .onEnd(() => {
          if (closingSv.value || isPaging.value || panAxis.value !== 0) return;
          if (savedScale.value > ZOOM_EPS || scale.value > ZOOM_EPS) {
            resetZoom();
          } else {
            scale.value = withTiming(DOUBLE_TAP_SCALE);
            savedScale.value = DOUBLE_TAP_SCALE;
          }
        }),
    [resetZoom, scale, savedScale, isPaging, panAxis, closingSv]
  );

  const composed = useMemo(
    () => (currentIsImage ? Gesture.Simultaneous(pinch, pan, doubleTap) : pan),
    [currentIsImage, pinch, pan, doubleTap]
  );

  const slideStyle = useAnimatedStyle(() => {
    const shrink = interpolate(dismissY.value, [0, winH * 0.5], [1, 0.92], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: pageOffset.value },
        { translateY: dismissY.value },
        { scale: shrink },
      ] as const,
    };
  });

  const zoomStyle = useAnimatedStyle(() => {
    const zoomed = scale.value > ZOOM_EPS;
    return {
      transform: [
        { translateX: zoomed ? translateX.value : 0 },
        { translateY: zoomed ? translateY.value : 0 },
        { scale: zoomed ? scale.value : 1 },
      ] as const,
    };
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value * interpolate(dismissY.value, [0, winH * 0.42], [1, 0.12], Extrapolation.CLAMP),
  }));

  const chromeStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value * interpolate(dismissY.value, [0, 140], [1, 0], Extrapolation.CLAMP),
  }));

  const contentFadeStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const requestDelete = useCallback(() => {
    if (!onDelete || !currentUrl.trim() || deleting) return;
    const kind = isVideoFileUrl(currentUrl, currentName)
      ? 'video'
      : currentIsImage
        ? 'photo'
        : 'file';
    confirmDestructive(
      `Delete ${kind}?`,
      `This ${kind} will be permanently deleted.`,
      () => onDelete(currentUrl)
    );
  }, [onDelete, currentUrl, currentName, currentIsImage, deleting]);

  const onShare = useCallback(async () => {
    if (!currentUrl.trim() || sharing) return;
    setSharing(true);
    try {
      await shareImage(currentUrl, normalizedUrlMap);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not share file';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setSharing(false);
    }
  }, [currentUrl, sharing, normalizedUrlMap]);

  const onStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width < 2 || height < 2) return;
    setStageSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);

  return (
    <Modal
      {...edgeToEdgeModalProps}
      visible={visible}
      transparent
      animationType="none"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={requestClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.root}>
          <Animated.View style={[styles.backdrop, backdropStyle]} />
          <Animated.View style={[styles.header, { paddingTop: headerPadTop }, chromeStyle]} pointerEvents="box-none">
            <View style={styles.headerLeft}>
              {resolvedAvatar}
              {hasHeader ? (
                <View style={styles.headerTextCol}>
                  {resolvedTitle ? (
                    <Text style={styles.headerTitle} numberOfLines={1}>
                      {resolvedTitle}
                    </Text>
                  ) : null}
                  {subtitle ? (
                    <Text style={styles.headerSub} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {fallbackTitle}
                </Text>
              )}
            </View>
            <View style={styles.headerActions}>
              {onDelete ? (
                <TouchableOpacity
                  onPress={requestDelete}
                  style={styles.iconBtn}
                  accessibilityLabel="Delete"
                  disabled={deleting || !currentUrl.trim()}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="trash-outline" size={22} color="#fff" />
                  )}
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => void onShare()}
                style={styles.iconBtn}
                accessibilityLabel="Share"
                disabled={sharing || !currentUrl.trim()}
              >
                {sharing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="share-outline" size={22} color="#fff" />
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={requestClose} style={styles.iconBtn} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </Animated.View>

          <Animated.View style={[styles.stage, contentFadeStyle]} onLayout={onStageLayout}>
            <View style={[{ width: stageW, height: stageH }, styles.clip]}>
              <GestureDetector gesture={composed}>
                <Animated.View
                  style={[
                    {
                      height: stageH,
                      width: Math.max(urls.length, 1) * stageW,
                      flexDirection: 'row',
                    },
                    slideStyle,
                  ]}
                >
                  {urls.map((url, i) => (
                    <Animated.View
                      key={`${i}-${url}`}
                      style={[
                        styles.page,
                        { width: stageW, height: stageH },
                        i === safeIndex ? zoomStyle : null,
                      ]}
                    >
                      {isDeletedImageSrc(url) || isImageFileUrl(url, names?.[i]) ? (
                        <View style={[styles.imageSlot, { paddingBottom: bottomPad }]}>
                          <PostMediaImage
                            storedUrl={url}
                            style={styles.image}
                            resizeMode="contain"
                          />
                        </View>
                      ) : isDeletedFileHref(url) ? (
                        <View style={[styles.filePage, { paddingTop: headerH }]}>
                          <FileExtensionPreview url={url} fileName={names?.[i]} variant="viewer" />
                        </View>
                      ) : Math.abs(i - safeIndex) <= 1 ? (
                        <View style={[styles.filePage, { paddingTop: headerH }]}>
                          <FileViewerBody
                            storedUrl={url}
                            fileName={names?.[i]}
                            urlMap={normalizedUrlMap}
                            active={visible && i === safeIndex}
                          />
                        </View>
                      ) : (
                        <View style={styles.image} />
                      )}
                    </Animated.View>
                  ))}
                </Animated.View>
              </GestureDetector>
            </View>

            {hasMany ? (
              <>
                <Animated.View style={[styles.navWrap, styles.navPrev, chromeStyle]}>
                  <TouchableOpacity
                    onPress={() => jumpToIndex(safeIndex - 1)}
                    disabled={safeIndex <= 0}
                    style={[styles.iconBtn, safeIndex <= 0 && styles.navDisabled]}
                    accessibilityLabel="Previous file"
                  >
                    <Ionicons name="chevron-back" size={22} color="#fff" />
                  </TouchableOpacity>
                </Animated.View>
                <Animated.View style={[styles.navWrap, styles.navNext, chromeStyle]}>
                  <TouchableOpacity
                    onPress={() => jumpToIndex(safeIndex + 1)}
                    disabled={safeIndex >= urls.length - 1}
                    style={[styles.iconBtn, safeIndex >= urls.length - 1 && styles.navDisabled]}
                    accessibilityLabel="Next file"
                  >
                    <Ionicons name="chevron-forward" size={22} color="#fff" />
                  </TouchableOpacity>
                </Animated.View>
              </>
            ) : null}

            {showCounter && hasMany ? (
              <Animated.View
                style={[styles.counterWrap, { bottom: bottomPad }, chromeStyle]}
              >
                <Text style={styles.counter}>
                  {safeIndex + 1} / {urls.length}
                </Text>
              </Animated.View>
            ) : null}
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.93)',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: HEADER_PAD_BOTTOM,
    zIndex: 8,
    minHeight: HEADER_ROW + HEADER_PAD_BOTTOM,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  headerTextCol: { flexShrink: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: '#fff',
  },
  headerSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: Fonts.regular,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  navWrap: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    zIndex: 8,
  },
  navPrev: { left: 10 },
  navNext: { right: 10 },
  navDisabled: { opacity: 0.28 },
  stage: {
    flex: 1,
    width: '100%',
  },
  clip: {
    overflow: 'hidden',
  },
  page: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageSlot: {
    flex: 1,
    width: '100%',
  },
  filePage: {
    flex: 1,
    width: '100%',
  },
  imagePlaceholder: {
    backgroundColor: 'transparent',
  },
  counterWrap: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  counter: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    letterSpacing: 0.2,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
});
