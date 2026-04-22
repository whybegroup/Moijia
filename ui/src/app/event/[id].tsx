import {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  type ChangeEvent,
  type ComponentProps,
  type ElementRef,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Linking,
  Alert,
  Animated,
  Easing,
  type StyleProp,
  type TextStyle,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  Platform,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { EventFormPopoverChrome } from '../../components/EventFormPopoverChrome';
import { modalTopBarStyles } from '../../components/modalTopBarStyles';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter, usePathname, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Fonts, Radius, Shadows } from '../../constants/theme';
import { COMMENT_REACTION_EMOJIS } from '../../constants/commentReactionEmojis';
import { DEFAULT_COMMENT_QUICK_REACTIONS_LIST } from '../../utils/commentQuickReactionsPrefs';
import {
  getGroupColor,
  getDefaultGroupThemeFromName,
  fmtTime,
  fmtDateFull,
  timeAgo,
  getMyWaitlistPosition,
  formatLocalDateInput,
  formatLocalDateYmdSlashes,
} from '../../utils/helpers';
import { computeMentionUserIdsForPost, type MentionMemberRow } from '../../utils/mentionUtils';
import { Avatar, Sheet, Toggle, formSectionTitleStyle } from '../../components/ui';
import { CommentMentionInput } from '../../components/CommentMentionInput';
import { UserAvatar } from '../../components/UserAvatar';
import { UserAvatarStack } from '../../components/UserAvatarStack';
import {
  useEvent,
  useGroup,
  useUsers,
  useCreateOrUpdateRSVP,
  useDeleteRSVP,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
  useCommentReaction,
  useGroupMemberColor,
  useDeleteEvent,
  useDeleteRecurrenceSeries,
  useTruncateRecurrenceSeries,
  useSetEventWatch,
  useUpdateEvent,
  useAddActivityOption,
  useDeleteActivityOption,
  useSetActivityVote,
  useCreateTimeSuggestion,
  useAcceptTimeSuggestion,
  useRejectTimeSuggestion,
} from '../../hooks/api';
import { useCommentQuickReactions } from '../../hooks/useCommentQuickReactions';
import { uid, getNoResponseIds } from '../../utils/api-helpers';
import type { CommentInput, EventDetailed, GroupScoped, RSVP, User } from '@moijia/client';
import { RSVPInput, MembershipStatus, EventUpdate } from '@moijia/client';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { ResolvableImage } from '../../components/ResolvableImage';
import { ReactionEmojiGlyph } from '../../components/ReactionEmojiGlyph';
import {
  pickImageFromLibrary,
  uploadPickedImageAsset,
  uploadWebImageFile,
  isCancelled,
  pickAndUploadCoverPhoto,
  type PickedImageAsset,
} from '../../services/pickAndUploadImage';
import { useResolvedImageUrls } from '../../hooks/useResolvedImageUrls';
import { firstSearchParam, parseReturnToParam, withReturnTo } from '../../utils/navigationReturn';
import Toast from 'react-native-toast-message';
import {
  formatWallDateFromUtcIso,
  formatWallTimeHmFromUtcIso,
  localWallDateTimeToUtcIso,
  localWallDateStartOfDayToUtcIso,
  localWallDateEndOfDayToUtcIso,
  isValidEventFormTimeRange,
} from '../../utils/datetimeUtc';
import { SERIES_SCOPE_OPTIONS, type SeriesUpdateScope } from '../../utils/seriesUpdateScopeOptions';

type PendingCommentPhoto = {
  id: string;
  uri: string;
  /** Local file/asset to upload, or an https URL to attach without uploading */
  pendingUpload: PickedImageAsset | File | string;
};

const COMPOSER_INPUT_MIN_H = 38;
const COMPOSER_INPUT_MAX_H = 140;
const IMAGE_URL_RE = /https?:\/\/[^\s)]+?\.(?:png|jpe?g|gif|webp|bmp|heic|heif|avif|svg)(?:\?[^\s)]*)?(?=$|\s)/gi;

function extractImageUrlsFromText(text: string): { cleanedText: string; imageUrls: string[] } {
  const imageUrls: string[] = [];
  const cleanedText = text
    .replace(IMAGE_URL_RE, (url) => {
      imageUrls.push(url);
      return ' ';
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ');
  return { cleanedText, imageUrls };
}

/** Must match API soft-delete text when an admin removes someone else's comment */
const COMMENT_DELETED_BY_ADMIN_MSG = 'This message was deleted by admin';

function rsvpSavedToastTitle(status: RSVPInput.status): string {
  switch (status) {
    case RSVPInput.status.GOING:
      return "You're going";
    case RSVPInput.status.NOT_GOING:
      return "Can't go — saved";
    case RSVPInput.status.MAYBE:
      return 'Maybe — saved';
    case RSVPInput.status.WAITLIST:
      return "You're on the waitlist";
    default:
      return 'RSVP updated';
  }
}

function reactionEmojiShortcode(emoji: string): string {
  const map: Record<string, string> = {
    '👍': ':+1:',
    '🙏': ':pray:',
    '😮': ':open_mouth:',
    '✍️': ':writing_hand:',
    '😂': ':joy:',
    '😋': ':yum:',
    '❤️': ':heart:',
    '🔥': ':fire:',
    '👀': ':eyes:',
  };
  return map[emoji] ?? '';
}

function webDetailTimeInputStyle(errored: boolean): Record<string, string | number> {
  return {
    padding: '6px 10px',
    borderRadius: 8,
    border: errored ? '1.5px solid #EF4444' : '1.5px solid #E5E5E5',
    backgroundColor: '#FAFAFA',
    fontSize: 13,
    color: '#1A1A1A',
    fontFamily: 'DMSans_400Regular',
    boxSizing: 'border-box',
    outline: 'none',
    minWidth: 0,
    width: '100%',
  };
}

const EVENT_COVER_THUMB = 80;
const EVENT_COVER_THUMB_GAP = 4;

// ── Photo Carousel ───────────────────────────────────────────────────────────
function PhotoCarousel({
  photos,
  urlMap,
  onPhotoPress,
  canRemove,
  onRemoveAt,
}: {
  photos: string[];
  urlMap: Map<string, string>;
  onPhotoPress: (url: string, index: number) => void;
  canRemove?: boolean;
  onRemoveAt?: (index: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginBottom: 10 }}
      contentContainerStyle={{
        gap: EVENT_COVER_THUMB_GAP,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      {photos.map((item, index) => (
        <View key={`${item}-${index}`} style={{ width: EVENT_COVER_THUMB, position: 'relative' }}>
          <TouchableOpacity onPress={() => onPhotoPress(item, index)} activeOpacity={0.9}>
            <ResolvableImage
              storedUrl={item}
              urlMap={urlMap}
              style={{
                width: EVENT_COVER_THUMB,
                height: EVENT_COVER_THUMB,
                borderRadius: Radius.lg,
                backgroundColor: Colors.bg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: Colors.border,
              }}
              resizeMode="cover"
            />
          </TouchableOpacity>
          {canRemove && onRemoveAt ? (
            <TouchableOpacity
              onPress={() => onRemoveAt(index)}
              style={styles.carouselRemoveThumb}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={11} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

// ── Comment Photo Gallery (inline version) ───────────────────────────────────
const COMMENT_PHOTO_SIZE = 80;
const COMMENT_PHOTO_GAP = 4;

function CommentPhotoGallery({
  photos,
  urlMap,
  onPhotoPress,
}: {
  photos: string[];
  urlMap: Map<string, string>;
  onPhotoPress: (url: string, index: number) => void;
}) {
  const resolved = photos.filter((p) => typeof p === 'string' && p.trim().length > 0);
  if (resolved.length === 0) return null;

  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -4 }}
      contentContainerStyle={{ paddingHorizontal: 4, gap: COMMENT_PHOTO_GAP, flexDirection: 'row' }}
    >
      {resolved.map((photo, index) => (
        <TouchableOpacity
          key={`${photo}\0${index}`}
          onPress={() => onPhotoPress(photo, index)}
          activeOpacity={0.8}
        >
          <ResolvableImage
            storedUrl={photo}
            urlMap={urlMap}
            style={{
              width: COMMENT_PHOTO_SIZE,
              height: COMMENT_PHOTO_SIZE,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: Colors.border,
              backgroundColor: Colors.bg,
            }}
            resizeMode="cover"
          />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ── Description with clickable links ─────────────────────────────────────────
function DescText({ text }: { text: string }) {
  const URL_RE = /https?:\/\/[^\s]+/g;
  return (
    <Text>
      {text.split('\n').map((line, i) => {
        const parts: React.ReactNode[] = [];
        let last = 0, m: RegExpExecArray | null;
        URL_RE.lastIndex = 0;
        while ((m = URL_RE.exec(line)) !== null) {
          if (m.index > last) parts.push(<Text key={`t${i}-${last}`}>{line.slice(last, m.index)}</Text>);
          const url = m[0];
          parts.push(
            <Text key={`u${i}-${m.index}`} style={styles.link} onPress={() => Linking.openURL(url)}>{url}</Text>
          );
          last = m.index + m[0].length;
        }
        if (last < line.length) parts.push(<Text key={`te${i}`}>{line.slice(last)}</Text>);
        return <Text key={i}>{parts}{'\n'}</Text>;
      })}
    </Text>
  );
}

/** Highlight @mentions in comment bodies */
function CommentMentionText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const MENTION_RE = /(?:^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]+)/g;
  const URL_RE = /https?:\/\/[^\s]+/g;

  const renderLine = (line: string, lineKey: number) => {
    type Raw = { start: number; end: number; kind: 'url' | 'mention' };
    const raw: Raw[] = [];
    let m: RegExpExecArray | null;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(line)) !== null) {
      raw.push({ start: m.index, end: m.index + m[0].length, kind: 'url' });
    }
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(line)) !== null) {
      raw.push({ start: m.index, end: m.index + m[0].length, kind: 'mention' });
    }
    raw.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged: Raw[] = [];
    for (const r of raw) {
      if (merged.some((x) => !(r.end <= x.start || r.start >= x.end))) continue;
      merged.push(r);
    }
    merged.sort((a, b) => a.start - b.start);

    const parts: React.ReactNode[] = [];
    let pos = 0;
    for (const r of merged) {
      if (r.start > pos) parts.push(<Text key={`p${pos}`}>{line.slice(pos, r.start)}</Text>);
      const slice = line.slice(r.start, r.end);
      if (r.kind === 'url') {
        parts.push(
          <Text key={`u${r.start}`} style={styles.link} onPress={() => Linking.openURL(slice)}>
            {slice}
          </Text>
        );
      } else {
        const at = slice.lastIndexOf('@');
        parts.push(
          <Text key={`m${r.start}`}>
            {slice.slice(0, at)}
            <Text style={styles.mentionInComment}>{slice.slice(at)}</Text>
          </Text>
        );
      }
      pos = r.end;
    }
    if (pos < line.length) parts.push(<Text key={`e${pos}`}>{line.slice(pos)}</Text>);
    return (
      <Text key={lineKey}>
        {parts}
        {'\n'}
      </Text>
    );
  };

  return (
    <Text style={style}>
      {text.split('\n').map((line, i) => renderLine(line, i))}
    </Text>
  );
}

export default function EventDetailScreen() {
  const params = useLocalSearchParams<{ id: string; returnTo?: string | string[] }>();
  const router = useRouter();
  const pathname = usePathname();
  const returnToHref = useMemo(
    () => parseReturnToParam(firstSearchParam(params.returnTo)),
    [params.returnTo]
  );
  const dismiss = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (returnToHref) {
      router.replace(returnToHref as Href);
      return;
    }
    router.replace('/(tabs)/events');
  }, [router, returnToHref]);
  const { userId: currentUserId } = useCurrentUserContext();

  const id = params.id;
  const eventId = Array.isArray(id) ? id[0] : id;

  const { data: ev, refetch: refetchEvent } = useEvent(
    eventId || '',
    currentUserId ?? ''
  );
  const { data: group, refetch: refetchGroup } = useGroup(
    ev?.groupId || '',
    currentUserId ?? ''
  );

  useFocusEffect(
    useCallback(() => {
      void refetchEvent();
      void refetchGroup();
    }, [refetchEvent, refetchGroup])
  );
  const { data: allUsers = [] } = useUsers();
  const { data: memberColorData } = useGroupMemberColor(ev?.groupId || '', currentUserId);
  const createOrUpdateRSVPMutation = useCreateOrUpdateRSVP(eventId || '');
  const deleteRSVPMutation = useDeleteRSVP(eventId || '');
  const createCommentMutation = useCreateComment(eventId || '', currentUserId);
  const updateCommentMutation = useUpdateComment(eventId || '', currentUserId);
  const deleteCommentMutation = useDeleteComment(eventId || '', currentUserId);
  const commentReactionMutation = useCommentReaction(eventId || '', currentUserId);
  const { data: commentQuickReactions = [...DEFAULT_COMMENT_QUICK_REACTIONS_LIST] } =
    useCommentQuickReactions(currentUserId);
  const deleteEventMutation = useDeleteEvent(currentUserId ?? '');
  const deleteRecurrenceSeriesMutation = useDeleteRecurrenceSeries(currentUserId ?? '');
  const truncateSeriesMutation = useTruncateRecurrenceSeries(currentUserId ?? '');

  const viewEv = ev;

  const displayTiming = useMemo(() => {
    const v = viewEv;
    if (!v?.start || !v?.end) {
      const t = new Date();
      return {
        displayStart: t,
        displayEnd: t,
        seriesStart: t,
        isRecurring: false,
        occurrenceIso: '',
      };
    }
    const displayStart = new Date(v.start as string);
    const displayEnd = new Date(v.end as string);
    const seriesStart = displayStart;
    const inSeries = !!(ev as EventDetailed | undefined)?.recurrenceSeriesId?.trim();
    const seriesCount = (ev as EventDetailed | undefined)?.recurrenceSeriesMemberCount ?? 1;
    const isRecurring = inSeries && seriesCount > 1;
    return {
      displayStart,
      displayEnd,
      seriesStart,
      isRecurring,
      occurrenceIso: displayStart.toISOString(),
    };
  }, [ev, viewEv]);
  const setWatchMutation = useSetEventWatch(eventId || '', currentUserId ?? undefined);
  const updateEventMutation = useUpdateEvent(eventId || '', currentUserId ?? '');
  const addActivityOptionMutation = useAddActivityOption(eventId || '', currentUserId ?? '');
  const deleteActivityOptionMutation = useDeleteActivityOption(eventId || '', currentUserId ?? '');
  const setActivityVoteMutation = useSetActivityVote(eventId || '', currentUserId ?? '');
  const createTimeSuggestionMutation = useCreateTimeSuggestion(eventId || '', currentUserId ?? '');
  const acceptTimeSuggestionMutation = useAcceptTimeSuggestion(eventId || '', currentUserId ?? '');
  const rejectTimeSuggestionMutation = useRejectTimeSuggestion(eventId || '', currentUserId ?? '');

  const [localCoverPhotos, setLocalCoverPhotos] = useState<string[]>([]);
  const [coverPhotoBusy, setCoverPhotoBusy] = useState(false);
  /** Server snapshot key; when the API returns new cover URLs, sync local state (same event id stays mounted across edit → back). */
  const lastServerCoverPhotosKeyRef = useRef<string>('');

  useEffect(() => {
    const e = viewEv as EventDetailed | undefined;
    if (!e?.id) return;
    const key = JSON.stringify(e.coverPhotos ?? []);
    if (key === lastServerCoverPhotosKeyRef.current) return;
    lastServerCoverPhotosKeyRef.current = key;
    setLocalCoverPhotos(e.coverPhotos ?? []);
  }, [viewEv]);

  /** Group roster for @mentions (server validates the same set). */
  const mentionMemberRows: MentionMemberRow[] = useMemo(() => {
    const g = group as GroupScoped | undefined;
    const ids = g?.memberIds;
    if (!ids?.length) return [];
    const byId = new Map(allUsers.map((u) => [u.id, u]));
    return ids.map((uid) => {
      const u = byId.get(uid);
      return {
        userId: uid,
        displayName: u?.displayName || u?.name || 'Member',
        name: u?.name || '',
      };
    });
  }, [group, allUsers]);

  const mentionMembersForInput = useMemo(
    () => mentionMemberRows.map((m) => ({ id: m.userId, displayName: m.displayName, name: m.name })),
    [mentionMemberRows]
  );

  const allSourceUrls = useMemo(() => {
    const s = new Set<string>();
    const e = (viewEv ?? ev) as EventDetailed | undefined;
    if (!e) return [];
    (e.coverPhotos || []).forEach((u) => s.add(u));
    localCoverPhotos.forEach((u) => s.add(u));
    for (const c of e.comments || []) {
      (c.photos || []).forEach((u) => s.add(u));
    }
    return [...s];
  }, [ev, viewEv, localCoverPhotos]);

  const resolvedImageMap = useResolvedImageUrls(allSourceUrls);

  const [showAttend,  setShowAttend]  = useState(false);
  const [memoFor,     setMemoFor]     = useState<RSVPInput.status | null>(null);
  const [composerInput, setComposerInput] = useState('');
  const [composerFieldHeight, setComposerFieldHeight] = useState(COMPOSER_INPUT_MIN_H);
  const [composerPendingPhotos, setComposerPendingPhotos] = useState<PendingCommentPhoto[]>([]);
  const composerPendingPhotosRef = useRef<PendingCommentPhoto[]>([]);
  composerPendingPhotosRef.current = composerPendingPhotos;
  /** Inline edit drafts keyed by comment id (multiple edits allowed). */
  const [commentEditDrafts, setCommentEditDrafts] = useState<
    Record<string, { text: string; photos: PendingCommentPhoto[] }>
  >({});
  const commentEditDraftsRef = useRef(commentEditDrafts);
  commentEditDraftsRef.current = commentEditDrafts;
  /** Where the next picked / URL-added photo should go: composer or a comment being edited. */
  const commentPhotoTargetRef = useRef<'composer' | string>('composer');
  const [showCommentPhotoModal, setShowCommentPhotoModal] = useState(false);
  const [commentPhotoUrl, setCommentPhotoUrl] = useState('');
  const [pendingPreviewLightbox, setPendingPreviewLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const commentPhotoFileInputRef = useRef<{ click: () => void } | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number; name: string; ts: Date } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [commentPostBusy, setCommentPostBusy] = useState(false);
  const [composerReplyTo, setComposerReplyTo] = useState<{
    id: string;
    label: string;
    preview: string;
  } | null>(null);
  const [reactionDetailModal, setReactionDetailModal] = useState<{
    emoji: string;
    userIds: string[];
  } | null>(null);
  const [reactionDetailSheetVisible, setReactionDetailSheetVisible] = useState(false);
  const [commentActionMenu, setCommentActionMenu] = useState<{ commentId: string } | null>(null);
  /** Full emoji grid opened from the smiley+ button (same comment id). */
  const [commentReactionFullPickerFor, setCommentReactionFullPickerFor] = useState<string | null>(null);
  const [newActivityLabel, setNewActivityLabel] = useState('');
  const [showTimeSuggestModal, setShowTimeSuggestModal] = useState(false);
  const [suggestStartDate, setSuggestStartDate] = useState('');
  const [suggestStartTime, setSuggestStartTime] = useState('19:00');
  const [suggestEndDate, setSuggestEndDate] = useState('');
  const [suggestEndTime, setSuggestEndTime] = useState('21:00');
  const [showSuggestStartDatePicker, setShowSuggestStartDatePicker] = useState(false);
  const [showSuggestEndDatePicker, setShowSuggestEndDatePicker] = useState(false);
  const [showSuggestStartTimePicker, setShowSuggestStartTimePicker] = useState(false);
  const [showSuggestEndTimePicker, setShowSuggestEndTimePicker] = useState(false);
  const scrollRef = useRef<ElementRef<typeof GestureScrollView>>(null);
  const scrollOffsetYRef = useRef(0);
  const commentsThreadSectionYRef = useRef(0);
  const commentsThreadCardYRef = useRef(0);
  const commentRowTopInCardRef = useRef<Record<string, number>>({});
  const replyScrollRestoreYRef = useRef<number | null>(null);
  /** When jumping from a reply row’s quote, we shake this id after tapping “Back to Reply Message”. */
  const replyScrollRestoreShakeIdRef = useRef<string | null>(null);
  /** Skip chip `onPress` when the same chip just fired `onLongPress` (both can run on release). */
  const reactionChipLastLongPressRef = useRef<{ key: string; at: number } | null>(null);
  const [replyScrollBackVisible, setReplyScrollBackVisible] = useState(false);
  const [inputBarHeight, setInputBarHeight] = useState(96);
  const [shakeCommentId, setShakeCommentId] = useState<string | null>(null);
  const shakeX = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const runCommentShake = useCallback(
    (commentId: string) => {
      setShakeCommentId(commentId);
      shakeX.setValue(0);
      if (Platform.OS !== 'web') {
        void Haptics.selectionAsync();
      }
      Animated.sequence([
        Animated.timing(shakeX, {
          toValue: -6,
          duration: 42,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shakeX, {
          toValue: 6,
          duration: 48,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shakeX, {
          toValue: -5,
          duration: 40,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shakeX, {
          toValue: 5,
          duration: 40,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shakeX, {
          toValue: -3,
          duration: 36,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shakeX, {
          toValue: 0,
          duration: 44,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShakeCommentId(null);
        shakeX.setValue(0);
      });
    },
    [shakeX]
  );

  const scrollToCommentById = useCallback((commentId: string) => {
    const row = commentRowTopInCardRef.current[commentId];
    if (row === undefined) return;
    const y =
      commentsThreadSectionYRef.current + commentsThreadCardYRef.current + row - 18;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
  }, []);

  const jumpToCommentWithRestore = useCallback(
    (targetCommentId: string, scrollBackShakeSourceId?: string) => {
      replyScrollRestoreYRef.current = scrollOffsetYRef.current;
      replyScrollRestoreShakeIdRef.current = scrollBackShakeSourceId ?? null;
      setReplyScrollBackVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToCommentById(targetCommentId);
          setTimeout(() => runCommentShake(targetCommentId), 400);
        });
      });
    },
    [scrollToCommentById, runCommentShake]
  );

  const restoreReplyScrollPosition = useCallback(() => {
    const y = replyScrollRestoreYRef.current;
    const shakeAfterId = replyScrollRestoreShakeIdRef.current;
    replyScrollRestoreYRef.current = null;
    replyScrollRestoreShakeIdRef.current = null;
    setReplyScrollBackVisible(false);
    if (y != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
      if (shakeAfterId) {
        setTimeout(() => runCommentShake(shakeAfterId), 400);
      }
    }
  }, [runCommentShake]);

  const openReactionDetailSheet = useCallback((payload: { emoji: string; userIds: string[] }) => {
    setReactionDetailModal(payload);
    setReactionDetailSheetVisible(true);
  }, []);

  const closeReactionDetailSheet = useCallback(() => {
    setReactionDetailSheetVisible(false);
  }, []);

  useEffect(() => {
    if (!reactionDetailSheetVisible && reactionDetailModal !== null) {
      const t = setTimeout(() => setReactionDetailModal(null), 320);
      return () => clearTimeout(t);
    }
  }, [reactionDetailSheetVisible, reactionDetailModal]);

  /** Close long-press comment sheet only (keep full emoji picker open). */
  const closeCommentActionSheet = useCallback(() => {
    setCommentActionMenu(null);
  }, []);

  const dismissCommentActionMenu = useCallback(() => {
    setCommentActionMenu(null);
    setCommentReactionFullPickerFor(null);
  }, []);

  const applyCommentReactionAndDismiss = useCallback(
    async (commentId: string, emoji: string) => {
      try {
        await commentReactionMutation.mutateAsync({ commentId, emoji });
        dismissCommentActionMenu();
      } catch {
        /* react-query / global handlers surface errors */
      }
    },
    [commentReactionMutation, dismissCommentActionMenu],
  );
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftLocation, setDraftLocation] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<
    { id: string; label: string }[]
  >([]);
  const [locationSuggesting, setLocationSuggesting] = useState(false);
  const [draftMinAttendees, setDraftMinAttendees] = useState('');
  const [draftMaxAttendees, setDraftMaxAttendees] = useState('');
  const [draftAllowMaybe, setDraftAllowMaybe] = useState(false);
  const [draftActivityIdeasEnabled, setDraftActivityIdeasEnabled] = useState(false);
  const [draftActivityVotesAnonymous, setDraftActivityVotesAnonymous] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState('');
  const [draftStartTime, setDraftStartTime] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');
  const [draftEndTime, setDraftEndTime] = useState('');
  const [draftAllDay, setDraftAllDay] = useState(false);
  const [showDetailStartDatePicker, setShowDetailStartDatePicker] = useState(false);
  const [showDetailStartTimePicker, setShowDetailStartTimePicker] = useState(false);
  const [showDetailEndDatePicker, setShowDetailEndDatePicker] = useState(false);
  const [showDetailEndTimePicker, setShowDetailEndTimePicker] = useState(false);
  const [draftRsvpDeadlineEnabled, setDraftRsvpDeadlineEnabled] = useState(false);
  const [draftRsvpDeadlineDate, setDraftRsvpDeadlineDate] = useState('');
  const [draftRsvpDeadlineTime, setDraftRsvpDeadlineTime] = useState('12:00');
  const [showDetailRsvpDeadlineDatePicker, setShowDetailRsvpDeadlineDatePicker] = useState(false);
  const [showDetailRsvpDeadlineTimePicker, setShowDetailRsvpDeadlineTimePicker] = useState(false);
  const [showDetailSaveScopeModal, setShowDetailSaveScopeModal] = useState(false);
  const [detailSeriesUpdateScope, setDetailSeriesUpdateScope] = useState<SeriesUpdateScope>(
    EventUpdate.seriesUpdateScope.THIS_OCCURRENCE
  );

  const openLocationInMaps = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) return;
    const encoded = encodeURIComponent(query);
    const appleUrl = `http://maps.apple.com/?q=${encoded}`;
    const googleWebUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    const googleSchemeUrl = `comgooglemaps://?q=${encoded}`;

    const openApple = async () => {
      try {
        await Linking.openURL(appleUrl);
      } catch {
        await Linking.openURL(googleWebUrl);
      }
    };
    const openGoogle = async () => {
      try {
        const canOpenGoogleScheme = await Linking.canOpenURL(googleSchemeUrl);
        if (canOpenGoogleScheme) {
          await Linking.openURL(googleSchemeUrl);
        } else {
          await Linking.openURL(googleWebUrl);
        }
      } catch {
        await Linking.openURL(googleWebUrl);
      }
    };

    if (Platform.OS === 'web') {
      await Linking.openURL(googleWebUrl);
      return;
    }

    Alert.alert('Open location in maps', query, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Apple Maps', onPress: () => void openApple() },
      { text: 'Google Maps', onPress: () => void openGoogle() },
    ]);
  }, []);

  useEffect(() => {
    const query = draftLocation.trim();
    if (query.length < 3) {
      setLocationSuggestions([]);
      setLocationSuggesting(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setLocationSuggesting(true);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
            headers: { 'Accept-Language': 'en' },
          }
        );
        if (!res.ok) throw new Error(`Location lookup failed (${res.status})`);
        const rows = (await res.json()) as Array<{ place_id?: number; display_name?: string }>;
        const next = rows
          .map((r, i) => ({
            id: String(r.place_id ?? `${query}-${i}`),
            label: (r.display_name ?? '').trim(),
          }))
          .filter((r) => !!r.label);
        setLocationSuggestions(next);
      } catch {
        if (!controller.signal.aborted) {
          setLocationSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLocationSuggesting(false);
        }
      }
    }, 260);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [draftLocation]);

  const removePendingPhoto = useCallback((target: 'composer' | string, p: PendingCommentPhoto) => {
    if (p.uri.startsWith('blob:')) {
      URL.revokeObjectURL(p.uri);
    }
    if (target === 'composer') {
      setComposerPendingPhotos((rows) => rows.filter((x) => x.id !== p.id));
    } else {
      setCommentEditDrafts((prev) => {
        const d = prev[target];
        if (!d) return prev;
        return { ...prev, [target]: { ...d, photos: d.photos.filter((x) => x.id !== p.id) } };
      });
    }
    setPendingPreviewLightbox((prev) => {
      if (!prev) return null;
      const removedIdx = prev.urls.indexOf(p.uri);
      if (removedIdx < 0) return prev;
      const urls = prev.urls.filter((u) => u !== p.uri);
      if (urls.length === 0) return null;
      let index = prev.index;
      if (removedIdx < index) index -= 1;
      else if (removedIdx === index) index = Math.min(index, urls.length - 1);
      return { urls, index };
    });
  }, []);

  const addPendingCommentPhoto = useCallback((previewUri: string, pendingUpload: PickedImageAsset | File) => {
    const t = commentPhotoTargetRef.current;
    const row: PendingCommentPhoto = { id: uid(), uri: previewUri, pendingUpload };
    if (t === 'composer') {
      setComposerPendingPhotos((rows) => [...rows, row]);
    } else {
      setCommentEditDrafts((prev) => {
        const d = prev[t];
        if (!d) return prev;
        return { ...prev, [t]: { ...d, photos: [...d.photos, row] } };
      });
    }
  }, []);

  const pickCommentPhotoNative = useCallback(async () => {
    if (!currentUserId) {
      Alert.alert('Sign in', 'You must be signed in to add photos.');
      return;
    }
    try {
      const asset = await pickImageFromLibrary();
      addPendingCommentPhoto(asset.uri, asset);
    } catch (e) {
      if (!isCancelled(e)) {
        Alert.alert('Photo', e instanceof Error ? e.message : 'Could not pick image');
      }
    }
  }, [addPendingCommentPhoto, currentUserId]);

  const onCommentWebPhotoChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        Alert.alert('Upload', 'Please choose an image file.');
        return;
      }
      const previewUri = URL.createObjectURL(file);
      addPendingCommentPhoto(previewUri, file);
    },
    [addPendingCommentPhoto],
  );

  const onCommentPhotoButtonPress = useCallback((forCommentEditId?: string) => {
    if (!currentUserId) {
      Alert.alert('Sign in', 'You must be signed in to add photos.');
      return;
    }
    commentPhotoTargetRef.current = forCommentEditId ?? 'composer';
    if (Platform.OS === 'web') {
      commentPhotoFileInputRef.current?.click();
    } else {
      void pickCommentPhotoNative();
    }
  }, [currentUserId, pickCommentPhotoNative]);

  const absorbImageUrlsFromCommentText = useCallback(
    (target: 'composer' | string, text: string): string => {
      const { cleanedText, imageUrls } = extractImageUrlsFromText(text);
      if (imageUrls.length === 0) return text;

      if (target === 'composer') {
        setComposerPendingPhotos((rows) => {
          const existing = new Set(rows.map((r) => r.uri));
          const added = imageUrls
            .filter((url) => !existing.has(url))
            .map((url) => ({ id: uid(), uri: url, pendingUpload: url as string }));
          return added.length > 0 ? [...rows, ...added] : rows;
        });
      } else {
        setCommentEditDrafts((prev) => {
          const d = prev[target];
          if (!d) return prev;
          const existing = new Set(d.photos.map((p) => p.uri));
          const added = imageUrls
            .filter((url) => !existing.has(url))
            .map((url) => ({ id: uid(), uri: url, pendingUpload: url as string }));
          if (added.length === 0) return prev;
          return { ...prev, [target]: { ...d, photos: [...d.photos, ...added] } };
        });
      }
      return cleanedText;
    },
    []
  );

  const openCommentPhotoUrlModal = useCallback((target: 'composer' | string) => {
    commentPhotoTargetRef.current = target;
    setShowCommentPhotoModal(true);
  }, []);

  useEffect(() => {
    if (composerInput.length === 0) setComposerFieldHeight(COMPOSER_INPUT_MIN_H);
  }, [composerInput]);

  const onComposerInputContentSizeChange = useCallback(
    (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const contentH = e.nativeEvent.contentSize.height;
      const padded = Math.ceil(contentH) + (Platform.OS === 'web' ? 20 : 18);
      const next = Math.min(COMPOSER_INPUT_MAX_H, Math.max(COMPOSER_INPUT_MIN_H, padded));
      setComposerFieldHeight((prev) => (prev === next ? prev : next));
    },
    [],
  );

  useEffect(() => {
    if (!showTimeSuggestModal || !ev?.start || !ev?.end) return;
    const s = displayTiming.displayStart;
    const e = displayTiming.displayEnd;
    const pad = (n: number) => String(n).padStart(2, '0');
    setSuggestStartDate(formatLocalDateInput(s));
    setSuggestEndDate(formatLocalDateInput(e));
    setSuggestStartTime(`${pad(s.getHours())}:${pad(s.getMinutes())}`);
    setSuggestEndTime(`${pad(e.getHours())}:${pad(e.getMinutes())}`);
  }, [showTimeSuggestModal, ev?.id, ev?.start, ev?.end, displayTiming.displayStart, displayTiming.displayEnd]);

  useEffect(() => {
    if (!ev?.id || !ev.start || !ev.end) return;
    setDraftTitle(ev.title ?? '');
    setDraftDesc(ev.description ?? '');
    setDraftLocation(ev.location ?? '');
    setDraftStartDate(formatWallDateFromUtcIso(ev.start as string));
    setDraftStartTime(formatWallTimeHmFromUtcIso(ev.start as string));
    setDraftEndDate(formatWallDateFromUtcIso(ev.end as string));
    setDraftEndTime(formatWallTimeHmFromUtcIso(ev.end as string));
    setDraftAllDay(!!ev.isAllDay);
    setDraftMinAttendees(ev.minAttendees != null && ev.minAttendees > 0 ? String(ev.minAttendees) : '');
    setDraftMaxAttendees(ev.maxAttendees != null && ev.maxAttendees > 0 ? String(ev.maxAttendees) : '');
    setDraftAllowMaybe(!!ev.allowMaybe);
    setDraftActivityIdeasEnabled(ev.activityIdeasEnabled ?? false);
    setDraftActivityVotesAnonymous(ev.activityVotesAnonymous ?? false);
    setDraftRsvpDeadlineEnabled(!!ev.rsvpDeadline);
    if (ev.rsvpDeadline) {
      setDraftRsvpDeadlineDate(formatWallDateFromUtcIso(ev.rsvpDeadline as string));
      setDraftRsvpDeadlineTime(
        ev.isAllDay ? '12:00' : formatWallTimeHmFromUtcIso(ev.rsvpDeadline as string)
      );
    } else if (ev.start) {
      setDraftRsvpDeadlineDate(formatWallDateFromUtcIso(ev.start as string));
      setDraftRsvpDeadlineTime('12:00');
    }
  }, [
    ev?.id,
    ev?.title,
    ev?.description,
    ev?.location,
    ev?.start,
    ev?.end,
    ev?.isAllDay,
    ev?.minAttendees,
    ev?.maxAttendees,
    ev?.allowMaybe,
    ev?.activityIdeasEnabled,
    ev?.activityVotesAnonymous,
    ev?.rsvpDeadline,
  ]);

  const timeFieldsDirty = useMemo(() => {
    if (!ev?.start || !ev?.end) return false;
    return (
      draftStartDate !== formatWallDateFromUtcIso(ev.start as string) ||
      draftStartTime !== formatWallTimeHmFromUtcIso(ev.start as string) ||
      draftEndDate !== formatWallDateFromUtcIso(ev.end as string) ||
      draftEndTime !== formatWallTimeHmFromUtcIso(ev.end as string) ||
      draftAllDay !== !!ev.isAllDay
    );
  }, [ev, draftStartDate, draftStartTime, draftEndDate, draftEndTime, draftAllDay]);

  const rsvpDeadlineDirty = useMemo(() => {
    if (!ev) return false;
    const savedHas = !!ev.rsvpDeadline;
    if (draftRsvpDeadlineEnabled !== savedHas) return true;
    if (!savedHas) return false;
    const draftIso = draftAllDay
      ? localWallDateEndOfDayToUtcIso(draftRsvpDeadlineDate)
      : localWallDateTimeToUtcIso(draftRsvpDeadlineDate, draftRsvpDeadlineTime);
    return draftIso !== String(ev.rsvpDeadline);
  }, [
    ev,
    draftRsvpDeadlineEnabled,
    draftRsvpDeadlineDate,
    draftRsvpDeadlineTime,
    draftAllDay,
  ]);

  const detailTimeRangeValid = useMemo(
    () =>
      isValidEventFormTimeRange({
        allDay: draftAllDay,
        startDate: draftStartDate,
        endDate: draftEndDate,
        startTime: draftStartTime,
        endTime: draftEndTime,
      }),
    [draftAllDay, draftStartDate, draftEndDate, draftStartTime, draftEndTime]
  );

  const detailsDirty = useMemo(() => {
    if (!ev || !currentUserId || !group) return false;
    if (ev.createdBy !== currentUserId) return false;
    const t = (ev.title ?? '').trim();
    const d = (ev.description ?? '').trim();
    const l = (ev.location ?? '').trim();
    const minB = ev.minAttendees != null && ev.minAttendees > 0 ? String(ev.minAttendees) : '';
    const maxB = ev.maxAttendees != null && ev.maxAttendees > 0 ? String(ev.maxAttendees) : '';
    return (
      draftTitle.trim() !== t ||
      draftDesc.trim() !== d ||
      draftLocation.trim() !== l ||
      draftMinAttendees.trim() !== minB ||
      draftMaxAttendees.trim() !== maxB ||
      draftAllowMaybe !== !!ev.allowMaybe ||
      draftActivityIdeasEnabled !== (ev.activityIdeasEnabled ?? false) ||
      draftActivityVotesAnonymous !== (ev.activityVotesAnonymous ?? false) ||
      timeFieldsDirty ||
      rsvpDeadlineDirty
    );
  }, [
    ev,
    group,
    currentUserId,
    draftTitle,
    draftDesc,
    draftLocation,
    draftMinAttendees,
    draftMaxAttendees,
    draftAllowMaybe,
    draftActivityIdeasEnabled,
    draftActivityVotesAnonymous,
    timeFieldsDirty,
    rsvpDeadlineDirty,
  ]);

  const detailGetTimeDate = useCallback((timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours || 0);
    date.setMinutes(minutes || 0);
    return date;
  }, []);

  const handleDetailStartDateChange = useCallback((_e: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDetailStartDatePicker(false);
    if (selectedDate) setDraftStartDate(formatLocalDateInput(selectedDate));
  }, []);

  const handleDetailEndDateChange = useCallback((_e: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDetailEndDatePicker(false);
    if (selectedDate) setDraftEndDate(formatLocalDateInput(selectedDate));
  }, []);

  const handleDetailStartTimeChange = useCallback((_e: unknown, selectedTime?: Date) => {
    if (Platform.OS === 'android') setShowDetailStartTimePicker(false);
    if (selectedTime) {
      const hours = String(selectedTime.getHours()).padStart(2, '0');
      const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
      setDraftStartTime(`${hours}:${minutes}`);
    }
  }, []);

  const handleDetailEndTimeChange = useCallback((_e: unknown, selectedTime?: Date) => {
    if (Platform.OS === 'android') setShowDetailEndTimePicker(false);
    if (selectedTime) {
      const hours = String(selectedTime.getHours()).padStart(2, '0');
      const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
      setDraftEndTime(`${hours}:${minutes}`);
    }
  }, []);

  const handleDetailRsvpDeadlineDateChange = useCallback((_e: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDetailRsvpDeadlineDatePicker(false);
    if (selectedDate) setDraftRsvpDeadlineDate(formatLocalDateInput(selectedDate));
  }, []);

  const handleDetailRsvpDeadlineTimeChange = useCallback((_e: unknown, selectedTime?: Date) => {
    if (Platform.OS === 'android') setShowDetailRsvpDeadlineTimePicker(false);
    if (selectedTime) {
      const hours = String(selectedTime.getHours()).padStart(2, '0');
      const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
      setDraftRsvpDeadlineTime(`${hours}:${minutes}`);
    }
  }, []);

  const getDetailMinimumStartTime = useCallback(() => {
    const selectedDate = new Date(draftStartDate);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    if (selectedDate.getTime() === todayDate.getTime()) {
      return new Date();
    }
    return undefined;
  }, [draftStartDate]);

  const getDetailMinimumEndTime = useCallback(() => {
    if (draftStartDate !== draftEndDate) return undefined;
    if (!draftStartTime) return undefined;
    const [h, m] = draftStartTime.split(':').map(Number);
    const minTime = new Date();
    minTime.setHours(h, m + 1, 0, 0);
    return minTime;
  }, [draftStartDate, draftEndDate, draftStartTime]);

  const persistActivityIdeasSettings = useCallback(
    async (nextIdeasEnabled: boolean, nextVotesAnonymous: boolean) => {
      if (!currentUserId || !eventId) return;
      const inSeries = !!(ev as EventDetailed | undefined)?.recurrenceSeriesId?.trim();
      try {
        await updateEventMutation.mutateAsync({
          activityIdeasEnabled: nextIdeasEnabled,
          activityVotesAnonymous: nextVotesAnonymous,
          updatedBy: currentUserId,
          viewerTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(inSeries ? { seriesUpdateScope: EventUpdate.seriesUpdateScope.ALL_OCCURRENCES } : {}),
        });
      } catch (e: any) {
        const msg =
          e?.body?.error ?? e?.response?.data?.error ?? e?.message ?? 'Failed to update activity settings';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Error', msg);
        setDraftActivityIdeasEnabled(ev?.activityIdeasEnabled ?? false);
        setDraftActivityVotesAnonymous(ev?.activityVotesAnonymous ?? false);
      }
    },
    [currentUserId, eventId, ev, updateEventMutation],
  );

  if (!eventId) {
    return (
      <EventFormPopoverChrome onClose={requestClose}>
        <View style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Event not found</Text>
          </View>
        </View>
      </EventFormPopoverChrome>
    );
  }

  const eventDetailed = ev as EventDetailed | undefined;
  
  const comments = (eventDetailed?.comments || [])
    .map((c) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      photos: (c.photos || []).filter((u) => typeof u === 'string' && u.trim().length > 0),
      reactions: c.reactions ?? [],
      viewerReactionEmojis: c.viewerReactionEmojis ?? [],
      replyTo: c.replyTo ?? null,
    }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const commentMenuTarget = commentActionMenu
    ? comments.find((x) => x.id === commentActionMenu.commentId) ?? null
    : null;

  const users: Record<string, User> = {};
  allUsers.forEach(u => {
    users[u.id] = u;
  });

  const getUserSafe = (userId: string): User => {
    return users[userId] || { 
      id: userId, 
      name: 'Loading...', 
      displayName: 'Loading...', 
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  if (!ev || !group) {
    return (
      <EventFormPopoverChrome onClose={requestClose}>
        <View style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </EventFormPopoverChrome>
    );
  }

  const displayEv = viewEv!;
  const userColorHex = memberColorData?.colorHex || getDefaultGroupThemeFromName(group.name);
  const p       = getGroupColor(userColorHex);
  const rsvps   = ev.rsvps || [];
  const going   = rsvps.filter(r => r.status === 'going');
  const notGoing= rsvps.filter(r => r.status === 'notGoing');
  const usersWithMemos = new Set(rsvps.filter(r => r.memo && r.memo.trim()).map(r => r.userId));
  const maybe   = rsvps.filter(r => r.status === 'maybe');
  const waitlist= rsvps.filter(r => r.status === 'waitlist');
  const myRsvp  = rsvps.find(r => r.userId === currentUserId);
  const evStart = displayTiming.displayStart;
  const evEnd = displayTiming.displayEnd;
  const isMultiDay = evStart.toDateString() !== evEnd.toDateString();
  /** Event is considered ended only after its configured end instant has passed. */
  const isPast  = Date.now() > evEnd.getTime();
  const minN = displayEv.minAttendees || 0;
  const maxN = displayEv.maxAttendees || 0;
  const needsMore = minN > 0 && going.length < minN && !isPast;
  const spotsLeft = maxN > 0 ? Math.max(0, maxN - going.length) : 0;
  const showLowSpots = maxN > 0 && !isPast && spotsLeft > 0 && spotsLeft <= 5;
  const imWaitlisted = myRsvp?.status === 'waitlist' && !isPast;
  const myWaitlistPos = imWaitlisted ? getMyWaitlistPosition(rsvps, currentUserId) : null;
  const hoursLeft = Math.max(0, Math.floor((evStart.getTime() - Date.now()) / 3600000));
  const canEdit = ev.createdBy === currentUserId;
  const canEditLive = canEdit && !isPast;
  function requestClose() {
    const hasUnsavedDetailChanges = canEditLive && detailsDirty;
    if (!hasUnsavedDetailChanges) {
      dismiss();
      return;
    }
    const message = 'Discard your changes?';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) dismiss();
      return;
    }
    Alert.alert('Discard changes?', message, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: dismiss },
    ]);
  }
  const canDeleteEvent =
    ev.createdBy === currentUserId ||
    group.superAdminId === currentUserId ||
    (group.adminIds ?? []).includes(currentUserId);
  const canDeleteEventLive = canDeleteEvent && !isPast;
  const gScoped = group as GroupScoped;
  const canCollaborateActivities =
    !!currentUserId &&
    (gScoped.membershipStatus === MembershipStatus.MEMBER ||
      gScoped.membershipStatus === MembershipStatus.ADMIN);
  const activityIdeasOn = ev.activityIdeasEnabled ?? false;
  const activityIdeasEffective = canEditLive ? draftActivityIdeasEnabled : activityIdeasOn;
  /** RSVP row follows saved event flag, not the Settings draft (organizers were losing Maybe while editing). */
  const showMaybeRsvp = !!displayEv.allowMaybe;
  const rsvpDeadlineRaw = displayEv.rsvpDeadline as string | null | undefined;
  const rsvpDeadlineDt = rsvpDeadlineRaw ? new Date(rsvpDeadlineRaw) : null;
  const rsvpDeadlineValid =
    rsvpDeadlineDt != null && Number.isFinite(rsvpDeadlineDt.getTime());
  const rsvpDeadlinePassed = rsvpDeadlineValid && Date.now() > rsvpDeadlineDt.getTime();
  const rsvpHeaderYmdSlashed = !canEditLive
    ? rsvpDeadlineValid && rsvpDeadlineRaw
      ? formatLocalDateYmdSlashes(rsvpDeadlineDt as Date)
      : null
    : draftRsvpDeadlineEnabled
      ? draftRsvpDeadlineDate.trim()
        ? draftRsvpDeadlineDate.trim().replace(/-/g, '/')
        : null
      : rsvpDeadlineDirty
        ? null
        : ev.rsvpDeadline
          ? formatLocalDateYmdSlashes(new Date(ev.rsvpDeadline as string))
          : null;
  const rsvpHeaderTimed =
    !canEditLive
      ? rsvpDeadlineValid && !displayEv.isAllDay
      : draftRsvpDeadlineEnabled
        ? !draftAllDay
        : !rsvpDeadlineDirty && !!ev.rsvpDeadline
          ? !displayEv.isAllDay
          : false;
  let rsvpHeaderTimeLabel: string | null = null;
  if (rsvpHeaderYmdSlashed && rsvpHeaderTimed) {
    if (!canEditLive && rsvpDeadlineDt) {
      rsvpHeaderTimeLabel = fmtTime(rsvpDeadlineDt);
    } else if (canEditLive && draftRsvpDeadlineEnabled && !draftAllDay && draftRsvpDeadlineDate.trim()) {
      const d = new Date(`${draftRsvpDeadlineDate.trim()}T${draftRsvpDeadlineTime}:00`);
      if (Number.isFinite(d.getTime())) rsvpHeaderTimeLabel = fmtTime(d);
    } else if (canEditLive && !draftRsvpDeadlineEnabled && !rsvpDeadlineDirty && ev.rsvpDeadline) {
      const d = new Date(ev.rsvpDeadline as string);
      if (Number.isFinite(d.getTime())) rsvpHeaderTimeLabel = fmtTime(d);
    }
  }
  const rsvpSectionLabel = rsvpHeaderYmdSlashed
    ? `RSVP by ${rsvpHeaderYmdSlashed}${rsvpHeaderTimeLabel ? ` · ${rsvpHeaderTimeLabel}` : ''}`
    : 'RSVP';
  const activityOptions = ev.activityOptions ?? [];
  const activityVotesAnonymous = displayEv.activityVotesAnonymous ?? false;
  const timeSuggestions = ev.timeSuggestions ?? [];
  const myActivityVoteOptionIds = ev.myActivityVoteOptionIds ?? [];
  const canResolveTimeSuggestions =
    ev.createdBy === currentUserId ||
    group.superAdminId === currentUserId ||
    (group.adminIds ?? []).includes(currentUserId);
  const pendingTimeSuggestions = timeSuggestions.filter((s) => s.status === 'pending');

  const resetDetailsDrafts = () => {
    setDraftTitle(ev.title ?? '');
    setDraftDesc(ev.description ?? '');
    setDraftLocation(ev.location ?? '');
    if (ev.start && ev.end) {
      setDraftStartDate(formatWallDateFromUtcIso(ev.start as string));
      setDraftStartTime(formatWallTimeHmFromUtcIso(ev.start as string));
      setDraftEndDate(formatWallDateFromUtcIso(ev.end as string));
      setDraftEndTime(formatWallTimeHmFromUtcIso(ev.end as string));
      setDraftAllDay(!!ev.isAllDay);
      setDraftMinAttendees(ev.minAttendees != null && ev.minAttendees > 0 ? String(ev.minAttendees) : '');
      setDraftMaxAttendees(ev.maxAttendees != null && ev.maxAttendees > 0 ? String(ev.maxAttendees) : '');
      setDraftAllowMaybe(!!ev.allowMaybe);
      setDraftActivityIdeasEnabled(ev.activityIdeasEnabled ?? false);
      setDraftRsvpDeadlineEnabled(!!ev.rsvpDeadline);
      if (ev.rsvpDeadline) {
        setDraftRsvpDeadlineDate(formatWallDateFromUtcIso(ev.rsvpDeadline as string));
        setDraftRsvpDeadlineTime(
          ev.isAllDay ? '12:00' : formatWallTimeHmFromUtcIso(ev.rsvpDeadline as string)
        );
      } else if (ev.start) {
        setDraftRsvpDeadlineDate(formatWallDateFromUtcIso(ev.start as string));
        setDraftRsvpDeadlineTime('12:00');
      }
    }
  };

  const executeDetailSave = async (seriesScope?: SeriesUpdateScope) => {
    const title = draftTitle.trim();
    if (!title) {
      if (Platform.OS === 'web') window.alert('Event title is required');
      else Alert.alert('Error', 'Event title is required');
      return;
    }
    if (!detailTimeRangeValid) {
      if (Platform.OS === 'web') window.alert('End must be after start');
      else Alert.alert('Error', 'End must be after start');
      return;
    }
    if (!currentUserId || !ev.start || !ev.end) return;
    const inSeries = !!(ev as EventDetailed).recurrenceSeriesId?.trim();
    const minTrim = draftMinAttendees.trim();
    const maxTrim = draftMaxAttendees.trim();
    let minAttendees: number | null;
    let maxAttendees: number | null;
    if (minTrim === '') {
      minAttendees = null;
    } else {
      const n = parseInt(minTrim, 10);
      if (Number.isNaN(n) || n < 0) {
        if (Platform.OS === 'web') window.alert('Min attendees must be a non-negative number');
        else Alert.alert('Error', 'Min attendees must be a non-negative number');
        return;
      }
      minAttendees = n;
    }
    if (maxTrim === '') {
      maxAttendees = null;
    } else {
      const n = parseInt(maxTrim, 10);
      if (Number.isNaN(n) || n < 0) {
        if (Platform.OS === 'web') window.alert('Max attendees must be a non-negative number');
        else Alert.alert('Error', 'Max attendees must be a non-negative number');
        return;
      }
      maxAttendees = n;
    }
    if (minAttendees != null && maxAttendees != null && maxAttendees < minAttendees) {
      if (Platform.OS === 'web') window.alert('Max attendees must be at least the minimum');
      else Alert.alert('Error', 'Max attendees must be at least the minimum');
      return;
    }
    try {
      const startIso = draftAllDay
        ? localWallDateStartOfDayToUtcIso(draftStartDate)
        : localWallDateTimeToUtcIso(draftStartDate, draftStartTime);
      const endIso = draftAllDay
        ? localWallDateEndOfDayToUtcIso(draftEndDate)
        : localWallDateTimeToUtcIso(draftEndDate, draftEndTime);
      const isAllDaySingle = draftAllDay && draftStartDate === draftEndDate;
      const hasMaxCap = maxAttendees != null && maxAttendees > 0;
      let rsvpDeadlineOut: string | null = null;
      if (draftRsvpDeadlineEnabled) {
        if (!draftRsvpDeadlineDate.trim()) {
          if (Platform.OS === 'web') window.alert('Choose a date for the RSVP deadline');
          else Alert.alert('Error', 'Choose a date for the RSVP deadline');
          return;
        }
        rsvpDeadlineOut = draftAllDay
          ? localWallDateEndOfDayToUtcIso(draftRsvpDeadlineDate)
          : localWallDateTimeToUtcIso(draftRsvpDeadlineDate, draftRsvpDeadlineTime);
        if (new Date(rsvpDeadlineOut).getTime() > new Date(endIso).getTime()) {
          if (Platform.OS === 'web') window.alert('RSVP deadline must be on or before the event end');
          else Alert.alert('Error', 'RSVP deadline must be on or before the event end');
          return;
        }
      }
      await updateEventMutation.mutateAsync({
        title,
        description: draftDesc.trim(),
        location: draftLocation.trim(),
        start: startIso,
        end: endIso,
        isAllDay: isAllDaySingle || undefined,
        minAttendees,
        maxAttendees,
        enableWaitlist: hasMaxCap ? !!displayEv.enableWaitlist : false,
        allowMaybe: draftAllowMaybe,
        activityIdeasEnabled: draftActivityIdeasEnabled,
        activityVotesAnonymous: draftActivityVotesAnonymous,
        rsvpDeadline: rsvpDeadlineOut,
        updatedBy: currentUserId,
        viewerTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(inSeries && (timeFieldsDirty || rsvpDeadlineDirty) && seriesScope
          ? { seriesUpdateScope: seriesScope }
          : {}),
      });
      setShowDetailSaveScopeModal(false);
    } catch (e: any) {
      const msg = e?.body?.error ?? e?.response?.data?.error ?? e?.message ?? 'Failed to save changes';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const onDetailSavePress = () => {
    if (!draftTitle.trim()) {
      if (Platform.OS === 'web') window.alert('Event title is required');
      else Alert.alert('Error', 'Event title is required');
      return;
    }
    if (!detailTimeRangeValid) {
      if (Platform.OS === 'web') window.alert('End must be after start');
      else Alert.alert('Error', 'End must be after start');
      return;
    }
    if (!currentUserId) return;
    const inSeries = !!(ev as EventDetailed).recurrenceSeriesId?.trim();
    if (inSeries && (timeFieldsDirty || rsvpDeadlineDirty)) {
      setDetailSeriesUpdateScope(EventUpdate.seriesUpdateScope.THIS_OCCURRENCE);
      setShowDetailSaveScopeModal(true);
      return;
    }
    void executeDetailSave();
  };

  const detailTimeFieldsComplete =
    !!draftStartDate?.trim() &&
    !!draftEndDate?.trim() &&
    (draftAllDay || (!!draftStartTime?.trim() && !!draftEndTime?.trim()));
  const detailTimeRangeErrored = detailTimeFieldsComplete && !detailTimeRangeValid;

  const submitNewActivityOption = async () => {
    const label = newActivityLabel.trim();
    if (!label || !currentUserId) return;
    try {
      await addActivityOptionMutation.mutateAsync({
        id: uid(),
        userId: currentUserId,
        label,
      });
      setNewActivityLabel('');
    } catch {
      Alert.alert('Error', 'Could not add activity option');
    }
  };

  const onPressActivityOption = async (optionId: string) => {
    if (!currentUserId || !canCollaborateActivities) return;
    try {
      await setActivityVoteMutation.mutateAsync({ userId: currentUserId, optionId });
    } catch {
      Alert.alert('Error', 'Could not update vote');
    }
  };

  const removeActivityOption = (optionId: string) => {
    Alert.alert('Remove option', 'Remove this activity?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteActivityOptionMutation.mutateAsync(optionId);
          } catch {
            Alert.alert('Error', 'Could not remove option');
          }
        },
      },
    ]);
  };

  const submitTimeSuggestion = async () => {
    if (!currentUserId || !suggestStartDate || !suggestEndDate) return;
    const [sh, sm] = suggestStartTime.split(':').map(Number);
    const [eh, em] = suggestEndTime.split(':').map(Number);
    const start = new Date(
      suggestStartDate +
        'T' +
        String(sh).padStart(2, '0') +
        ':' +
        String(sm || 0).padStart(2, '0') +
        ':00',
    );
    const end = new Date(
      suggestEndDate +
        'T' +
        String(eh).padStart(2, '0') +
        ':' +
        String(em || 0).padStart(2, '0') +
        ':00',
    );
    if (!(start.getTime() < end.getTime())) {
      Alert.alert('Check times', 'End must be after start.');
      return;
    }
    try {
      await createTimeSuggestionMutation.mutateAsync({
        id: uid(),
        userId: currentUserId,
        start: start.toISOString(),
        end: end.toISOString(),
      });
      setShowTimeSuggestModal(false);
    } catch {
      Alert.alert('Error', 'Could not submit time suggestion');
    }
  };

  const coverPhotosForDisplay = canEditLive ? localCoverPhotos : (displayEv.coverPhotos ?? []);
  const showEventPhotosSection = coverPhotosForDisplay.length > 0 || canEditLive;

  const persistCoverPhotos = async (next: string[]) => {
    if (!currentUserId) return;
    await updateEventMutation.mutateAsync({
      updatedBy: currentUserId,
      coverPhotos: next,
    });
  };

  const removeCoverPhotoAt = async (index: number) => {
    if (!currentUserId || !canEditLive) return;
    const prev = localCoverPhotos;
    const next = prev.filter((_, j) => j !== index);
    setLocalCoverPhotos(next);
    try {
      await persistCoverPhotos(next);
    } catch {
      setLocalCoverPhotos(prev);
      Alert.alert('Error', 'Failed to remove photo');
    }
  };

  const addCoverPhotoFromPicker = async () => {
    if (!currentUserId || !canEditLive || coverPhotoBusy) return;
    setCoverPhotoBusy(true);
    try {
      const url = await pickAndUploadCoverPhoto(currentUserId);
      if (!url) return;
      const prev = localCoverPhotos;
      const next = [...prev, url];
      setLocalCoverPhotos(next);
      try {
        await persistCoverPhotos(next);
      } catch {
        setLocalCoverPhotos(prev);
        Alert.alert('Error', 'Failed to add photo');
      }
    } finally {
      setCoverPhotoBusy(false);
    }
  };

  const canModerateComments =
    group.superAdminId === currentUserId || (group.adminIds ?? []).includes(currentUserId ?? '');

  const evWithWatch = ev as EventDetailed & {
    viewerWatching?: boolean;
    viewerWatchDefault?: boolean;
  };
  const watchDefaultForViewer =
    evWithWatch.viewerWatchDefault !== undefined
      ? evWithWatch.viewerWatchDefault
      : ev.createdBy === currentUserId ||
        myRsvp?.status === 'going' ||
        myRsvp?.status === 'maybe';
  const effectiveWatching =
    evWithWatch.viewerWatching !== undefined ? evWithWatch.viewerWatching : watchDefaultForViewer;

  const toggleEventWatch = async () => {
    if (!currentUserId) return;
    try {
      await setWatchMutation.mutateAsync({ watching: !effectiveWatching });
    } catch (e: any) {
      Alert.alert('Error', e?.body?.message || e?.message || 'Could not update notifications for this event');
    }
  };
  
  const maxCapacity = displayEv.maxAttendees || 0;
  const isAtCapacity = maxCapacity > 0 && going.length >= maxCapacity;
  const canGoGoing = !isAtCapacity || myRsvp?.status === 'going';
  const hasWaitlist = !!displayEv.enableWaitlist && maxCapacity > 0;

  const handleDeleteEntireSeries = async () => {
    setShowDeleteConfirm(false);
    try {
      const seriesId = (ev as EventDetailed | undefined)?.recurrenceSeriesId?.trim();
      if (seriesId) {
        await deleteRecurrenceSeriesMutation.mutateAsync(seriesId);
      } else {
        await deleteEventMutation.mutateAsync(eventId || '');
      }
      if (returnToHref) router.replace(returnToHref as Href);
      else router.replace('/(tabs)/events');
    } catch {
      Alert.alert('Error', 'Failed to delete event');
    }
  };

  const handleDeleteThisOccurrenceOnly = async () => {
    setShowDeleteConfirm(false);
    if (!eventId) return;
    try {
      await deleteEventMutation.mutateAsync(eventId);
      if (returnToHref) router.replace(returnToHref as Href);
      else router.replace('/(tabs)/events');
    } catch {
      Alert.alert('Error', 'Failed to remove this occurrence');
    }
  };

  const handleTruncateSeriesFromHere = async () => {
    setShowDeleteConfirm(false);
    if (!eventId || !displayTiming.occurrenceIso) return;
    try {
      await truncateSeriesMutation.mutateAsync({
        eventId,
        occurrenceStart: displayTiming.occurrenceIso,
        viewerTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (returnToHref) router.replace(returnToHref as Href);
      else router.replace('/(tabs)/events');
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'body' in e && (e as { body?: { message?: string } }).body?.message;
      Alert.alert('Error', msg || 'Could not shorten the series');
    }
  };

  const applyRsvp = async (status: RSVPInput.status, memo?: string) => {
    if (!ev) return;

    if (status === RSVPInput.status.GOING && !canGoGoing && hasWaitlist) {
      status = RSVPInput.status.WAITLIST;
    }

    if (status === RSVPInput.status.GOING && !canGoGoing && !hasWaitlist) {
      Toast.show({
        type: 'info',
        text1: 'Event is full',
        text2: 'This event has reached maximum capacity.',
        visibilityTime: 3200,
        position: 'top',
      });
      return;
    }

    /** Explicit memo from MemoSheet; when absent, keep existing note when changing Going ↔ Can't go (etc.). */
    const resolvedMemo =
      memo !== undefined ? (memo ?? '') : String(myRsvp?.memo ?? '');
    const noteSaved = !!(memo && memo.trim());

    try {
      if (myRsvp?.status === status && memo === undefined) {
        await deleteRSVPMutation.mutateAsync(currentUserId);
        Toast.show({
          type: 'success',
          text1: 'Response cleared',
          visibilityTime: 2200,
          position: 'top',
        });
      } else {
        await createOrUpdateRSVPMutation.mutateAsync({
          userId: currentUserId,
          status,
          memo: resolvedMemo,
        });
        Toast.show({
          type: 'success',
          text1: rsvpSavedToastTitle(status),
          ...(noteSaved ? { text2: 'Note saved' } : {}),
          visibilityTime: noteSaved ? 2800 : 2200,
          position: 'top',
        });
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Could not update RSVP',
        text2: 'Please try again.',
        visibilityTime: 3200,
        position: 'top',
      });
    }
  };

  const handleAddCommentPhoto = () => {
    const url = commentPhotoUrl.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Alert.alert('Invalid URL', 'Please enter a valid image URL (e.g. https://example.com/image.jpg)');
      return;
    }
    const t = commentPhotoTargetRef.current;
    const row: PendingCommentPhoto = { id: uid(), uri: url, pendingUpload: url };
    if (t === 'composer') {
      setComposerPendingPhotos((p) => [...p, row]);
    } else {
      setCommentEditDrafts((prev) => {
        const d = prev[t];
        if (!d) return prev;
        return { ...prev, [t]: { ...d, photos: [...d.photos, row] } };
      });
    }
    setCommentPhotoUrl('');
    setShowCommentPhotoModal(false);
  };

  const beginEditComment = (commentId: string, text?: string | null, photos?: string[]) => {
    const trimmed = (text || '').trim();
    if (trimmed === COMMENT_DELETED_BY_ADMIN_MSG) return;
    if (!trimmed && !(photos && photos.length)) return;
    dismissCommentActionMenu();
    setCommentEditDrafts((prev) => {
      const old = prev[commentId];
      if (old) {
        for (const p of old.photos) {
          if (p.uri.startsWith('blob:')) URL.revokeObjectURL(p.uri);
        }
      }
      return {
        ...prev,
        [commentId]: {
          text: trimmed,
          photos: (photos || []).map((u) => ({ id: uid(), uri: u, pendingUpload: u })),
        },
      };
    });
  };

  const cancelEditComment = (commentId: string) => {
    dismissCommentActionMenu();
    setCommentEditDrafts((prev) => {
      const d = prev[commentId];
      if (!d) return prev;
      for (const p of d.photos) {
        if (p.uri.startsWith('blob:')) URL.revokeObjectURL(p.uri);
      }
      const { [commentId]: _, ...rest } = prev;
      return rest;
    });
  };

  const updateEditDraftText = (commentId: string, text: string) => {
    const nextText = absorbImageUrlsFromCommentText(commentId, text);
    setCommentEditDrafts((prev) => {
      const d = prev[commentId];
      if (!d) return prev;
      return { ...prev, [commentId]: { ...d, text: nextText } };
    });
  };

  const handleDeleteComment = (commentId: string) => {
    if (!currentUserId) return;
    dismissCommentActionMenu();
    Alert.alert('Delete comment', 'Are you sure you want to delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCommentMutation.mutateAsync({
              commentId,
              actorId: currentUserId,
            });
            setCommentEditDrafts((prev) => {
              const d = prev[commentId];
              if (!d) return prev;
              for (const p of d.photos) {
                if (p.uri.startsWith('blob:')) URL.revokeObjectURL(p.uri);
              }
              const { [commentId]: _, ...rest } = prev;
              return rest;
            });
          } catch (error: any) {
            Alert.alert('Error', error?.body?.message || error?.message || 'Failed to delete comment');
          }
        },
      },
    ]);
  };

  const uploadPendingPhotos = async (photosToUpload: PendingCommentPhoto[]) => {
    return Promise.all(
      photosToUpload.map(async (p) => {
        const src = p.pendingUpload;
        if (typeof src === 'string' && (src.startsWith('http://') || src.startsWith('https://'))) {
          return src;
        }
        if (typeof File !== 'undefined' && src instanceof File) {
          return uploadWebImageFile(currentUserId!, src);
        }
        return uploadPickedImageAsset(currentUserId!, src as PickedImageAsset);
      }),
    );
  };

  const saveCommentEdit = async (commentId: string) => {
    if (!currentUserId) return;
    const draft = commentEditDraftsRef.current[commentId];
    if (!draft) return;
    const photosToUpload = draft.photos;
    const nextText = draft.text.trim();
    if (!nextText && photosToUpload.length === 0) {
      Alert.alert('Error', 'Comment cannot be empty');
      return;
    }
    try {
      const photoUrls = await uploadPendingPhotos(photosToUpload);
      if (!nextText && photoUrls.length === 0) {
        Alert.alert('Error', 'Comment cannot be empty');
        return;
      }
      await updateCommentMutation.mutateAsync({
        commentId,
        input: { actorId: currentUserId, text: nextText, photos: photoUrls },
      });
      for (const p of photosToUpload) {
        if (p.uri.startsWith('blob:')) URL.revokeObjectURL(p.uri);
      }
      dismissCommentActionMenu();
      setCommentEditDrafts((prev) => {
        const { [commentId]: _, ...rest } = prev;
        return rest;
      });
    } catch (error: unknown) {
      const err = error as { body?: { message?: string }; message?: string };
      Alert.alert('Error', err?.body?.message || err?.message || 'Failed to save comment');
    }
  };

  const postComment = async () => {
    const photosToUpload = composerPendingPhotosRef.current;
    if (!composerInput.trim() && !photosToUpload.length) return;
    if (!currentUserId) {
      Alert.alert('Sign in', 'You must be signed in to comment.');
      return;
    }
    setCommentPostBusy(true);
    try {
      const photoUrls = await uploadPendingPhotos(photosToUpload);

      const newComment: CommentInput = {
        id: uid(),
        userId: currentUserId,
      };
      if (composerReplyTo) {
        newComment.replyToCommentId = composerReplyTo.id;
      }
      if (photoUrls.length > 0) {
        newComment.photos = photoUrls;
      }
      if (composerInput.trim()) {
        const trimmed = composerInput.trim();
        newComment.text = trimmed;
        const mids = computeMentionUserIdsForPost(trimmed, mentionMemberRows, currentUserId);
        if (mids.length > 0) {
          newComment.mentionedUserIds = mids;
        }
      }

      try {
        await createCommentMutation.mutateAsync(newComment);
      } catch (firstErr: any) {
        const st = firstErr?.status ?? firstErr?.response?.status;
        const is400 = st === 400;
        if (is400 && Array.isArray(newComment.mentionedUserIds)) {
          const { mentionedUserIds: _m, ...rest } = newComment;
          await createCommentMutation.mutateAsync(rest as CommentInput);
        } else {
          throw firstErr;
        }
      }

      for (const p of photosToUpload) {
        if (p.uri.startsWith('blob:')) URL.revokeObjectURL(p.uri);
      }
      setComposerInput('');
      setComposerPendingPhotos([]);
      setComposerReplyTo(null);
      setReplyScrollBackVisible(false);
      replyScrollRestoreYRef.current = null;
      replyScrollRestoreShakeIdRef.current = null;
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (error: unknown) {
      const err = error as { body?: { message?: string }; message?: string };
      Alert.alert('Error', err?.body?.message || err?.message || 'Failed to post comment');
    } finally {
      setCommentPostBusy(false);
    }
  };

  const attendLabel = [
    going.length > 0     && `${going.length}${maxCapacity > 0 ? `/${maxCapacity}` : ''} Going`,
    waitlist.length > 0  && `${waitlist.length} Waitlist`,
    maybe.length > 0     && `${maybe.length} Maybe`,
    notGoing.length > 0  && `${notGoing.length} Not Attending`,
  ].filter(Boolean).join(' · ');

  const showHoursBanner = !isPast && hoursLeft <= 6 && hoursLeft > 0;
  const hasBanners = showHoursBanner || isPast || needsMore || showLowSpots || imWaitlisted;

  return (
    <EventFormPopoverChrome onClose={requestClose}>
    <View style={styles.safe}>
      {Platform.OS === 'web' && (
        <input
          ref={(el) => {
            commentPhotoFileInputRef.current = el;
          }}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onCommentWebPhotoChange}
        />
      )}
      {/* Nav */}
      <View style={modalTopBarStyles.bar}>
        <TouchableOpacity
          onPress={requestClose}
          style={modalTopBarStyles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={26} color={Colors.textSub} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {currentUserId ? (
          <TouchableOpacity
            onPress={toggleEventWatch}
            disabled={setWatchMutation.isPending}
            style={[modalTopBarStyles.trailingIconTap, { marginRight: 8 }]}
            accessibilityRole="button"
            accessibilityLabel={
              effectiveWatching
                ? 'Watching this event — tap to stop default notifications'
                : 'Not watching — tap to get default event notifications'
            }
          >
            <Ionicons
              name={effectiveWatching ? 'eye' : 'eye-off-outline'}
              size={22}
              color={effectiveWatching ? Colors.accent : Colors.textSub}
            />
          </TouchableOpacity>
        ) : null}
        {canDeleteEventLive ? (
          <TouchableOpacity
            onPress={() => setShowDeleteConfirm(true)}
            style={[modalTopBarStyles.trailingIconTap, { marginRight: 8 }]}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.text} />
          </TouchableOpacity>
        ) : null}
        {canEditLive && detailsDirty ? (
          <View style={styles.navEditActions}>
            <TouchableOpacity
              onPress={resetDetailsDrafts}
              disabled={updateEventMutation.isPending}
              style={[styles.draftBarBtnSecondary, updateEventMutation.isPending && { opacity: 0.45 }]}
              activeOpacity={0.8}
            >
              <Text style={styles.draftBarBtnSecondaryText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onDetailSavePress}
              disabled={!draftTitle.trim() || !detailTimeRangeValid || updateEventMutation.isPending}
              style={[
                styles.draftBarBtnPrimary,
                (!draftTitle.trim() || !detailTimeRangeValid || updateEventMutation.isPending) &&
                  styles.draftBarBtnPrimaryDisabled,
              ]}
              activeOpacity={0.8}
            >
              {updateEventMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.accentFg} />
              ) : (
                <Text style={styles.draftBarBtnPrimaryText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <GestureScrollView
        ref={scrollRef}
        style={styles.eventScrollView}
        contentContainerStyle={styles.eventScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          scrollOffsetYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={32}
      >

        {/* Event block */}
        <View style={styles.eventBlock}>
          {hasBanners ? (
            <View style={styles.bannerStack}>
              {showHoursBanner ? (
                <View style={[styles.bannerInner, styles.bannerAmber, styles.bannerAmberRow]}>
                  <Ionicons name="time-outline" size={16} color="#92400E" />
                  <Text style={styles.bannerAmberText}>
                    Starting in <Text style={{ fontFamily: Fonts.bold }}>{hoursLeft}h</Text>
                  </Text>
                </View>
              ) : null}
              {isPast ? (
                <View style={[styles.bannerInner, styles.bannerGray]}>
                  <Text style={styles.bannerGrayText}>This event has ended</Text>
                </View>
              ) : null}
              {needsMore ? (
                <View style={[styles.bannerInner, styles.bannerAmber, styles.bannerAmberRow]}>
                  <Ionicons name="warning-outline" size={16} color="#92400E" />
                  <Text style={styles.bannerAmberText}>
                    <Text style={{ fontFamily: Fonts.bold }}>{minN - going.length} more needed</Text>
                  </Text>
                </View>
              ) : null}
              {showLowSpots ? (
                <View style={[styles.bannerInner, styles.bannerAmber, styles.bannerAmberRow]}>
                  <Ionicons name="warning-outline" size={16} color="#92400E" />
                  <Text style={styles.bannerAmberText}>
                    <Text style={{ fontFamily: Fonts.bold }}>{spotsLeft}</Text> spot{spotsLeft === 1 ? '' : 's'} left
                  </Text>
                </View>
              ) : null}
              {imWaitlisted ? (
                <View style={[styles.bannerInner, styles.bannerAmber, styles.bannerAmberRow]}>
                  <Ionicons name="warning-outline" size={16} color="#92400E" />
                  <Text style={styles.bannerAmberText}>
                    Waitlisted
                    {myWaitlistPos != null ? (
                      <>
                        {' · '}
                        <Text style={{ fontFamily: Fonts.bold }}>#{myWaitlistPos} in queue</Text>
                      </>
                    ) : null}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.eventMainCardWrap}>
            <View style={styles.eventMainCard}>
          <View style={{ paddingHorizontal: 16, paddingTop: hasBanners ? 16 : 18 }}>
            <TouchableOpacity
              style={styles.groupChipAboveTitle}
              onPress={() => router.push(withReturnTo(`/groups/${ev.groupId}`, pathname))}
              activeOpacity={0.7}
            >
              <View style={[styles.groupDot, { backgroundColor: p.dot }]} />
              <Text style={styles.navGroupName} numberOfLines={1}>
                {group.name}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginTop: 1 }} />
            </TouchableOpacity>
            {canEditLive ? (
              <TextInput
                value={draftTitle}
                onChangeText={setDraftTitle}
                placeholder="Event title"
                placeholderTextColor={Colors.textMuted}
                style={styles.eventTitleInput}
                autoCapitalize="sentences"
                autoCorrect
              />
            ) : (
              <Text style={styles.eventTitle}>{displayEv.title}</Text>
            )}
            {canEditLive ? (
              <View style={[styles.descBox, { marginTop: 10 }]}>
                <TextInput
                  value={draftDesc}
                  onChangeText={setDraftDesc}
                  placeholder="Description"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.eventDescInput}
                  multiline
                />
              </View>
            ) : displayEv.description?.trim() ? (
              <View style={[styles.descBox, { marginTop: 10 }]}>
                <Text style={styles.descText}>
                  <DescText text={displayEv.description} />
                </Text>
              </View>
            ) : null}
          </View>

          {/* Photos */}
          {showEventPhotosSection ? (
            <View
              style={{
                marginTop:
                  canEditLive || displayEv.description?.trim() ? 4 : 10,
              }}
            >
              <View style={{ paddingHorizontal: 16 }}>
                <Text style={formSectionTitleStyle}>
                  Photos{coverPhotosForDisplay.length > 0 ? ` · ${coverPhotosForDisplay.length}` : ''}
                </Text>
              </View>
              {coverPhotosForDisplay.length > 0 ? (
                <PhotoCarousel
                  photos={coverPhotosForDisplay}
                  urlMap={resolvedImageMap}
                  canRemove={canEditLive}
                  onRemoveAt={(i) => void removeCoverPhotoAt(i)}
                  onPhotoPress={(url, index) =>
                    setLightbox({
                      urls: coverPhotosForDisplay,
                      index,
                      name: getUserSafe(ev.createdBy).displayName,
                      ts: new Date(ev.createdAt),
                    })
                  }
                />
              ) : null}
              {canEditLive ? (
                <View
                  style={{
                    paddingHorizontal: 16,
                    marginTop: coverPhotosForDisplay.length > 0 ? 4 : 0,
                    marginBottom: 16,
                  }}
                >
                  <View style={[styles.eventPhotosAddCard, styles.eventPhotosAddCardNested]}>
                    <TouchableOpacity
                      onPress={() => void addCoverPhotoFromPicker()}
                      style={styles.eventPhotosAddBtn}
                      disabled={coverPhotoBusy}
                      activeOpacity={0.85}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        {coverPhotoBusy ? (
                          <ActivityIndicator size="small" color={Colors.textSub} />
                        ) : (
                          <Ionicons name="camera-outline" size={16} color={Colors.textSub} />
                        )}
                        <Text style={{ fontSize: 12, color: Colors.textSub, fontFamily: Fonts.medium }}>Add photo</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={{ paddingHorizontal: 16 }}>
            {/* Info rows */}
            <View style={{ gap: 8, marginBottom: 16 }}>
              {canEditLive ? (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <Ionicons name="calendar-outline" size={20} color={Colors.textSub} style={{ width: 22, marginTop: 1 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.detailTimeSectionHeader}>
                        <Text style={[formSectionTitleStyle, styles.detailTimeHeading]}>When</Text>
                        <TouchableOpacity
                          onPress={() => setDraftAllDay((v) => !v)}
                          style={styles.detailAllDayChip}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.detailAllDayChipText, draftAllDay && styles.detailAllDayChipTextActive]}>
                            All-day
                          </Text>
                          <View style={[styles.detailAllDayCheckbox, draftAllDay && styles.detailAllDayCheckboxActive]}>
                            {draftAllDay ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
                          </View>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.detailEventTimeStack}>
                        <View style={styles.detailEventTimeLine}>
                          <Text style={styles.detailEventTimeLineLabel}>From</Text>
                          <View style={styles.detailEventTimeRow}>
                            {Platform.OS === 'web' ? (
                              <View style={[styles.detailEventTimeCell, styles.detailEventTimeFieldDate]}>
                                <input
                                  type="date"
                                  value={draftStartDate}
                                  min={formatLocalDateInput(new Date())}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setDraftStartDate(e.target.value)
                                  }
                                  style={webDetailTimeInputStyle(false)}
                                />
                              </View>
                            ) : (
                              <View style={[styles.detailEventTimeCell, styles.detailEventTimeFieldDate]}>
                                <TouchableOpacity
                                  onPress={() => setShowDetailStartDatePicker(true)}
                                  activeOpacity={0.85}
                                  style={styles.detailEventTimeSegment}
                                >
                                  <Text style={styles.detailEventTimeSegmentText} numberOfLines={1}>
                                    {draftStartDate}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            )}
                            {!draftAllDay &&
                              (Platform.OS === 'web' ? (
                                <View style={[styles.detailEventTimeCell, styles.detailEventTimeFieldTime]}>
                                  <input
                                    type="time"
                                    value={draftStartTime}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                      setDraftStartTime(e.target.value)
                                    }
                                    style={webDetailTimeInputStyle(false)}
                                  />
                                </View>
                              ) : (
                                <View style={[styles.detailEventTimeCell, styles.detailEventTimeFieldTime]}>
                                  <TouchableOpacity
                                    onPress={() => setShowDetailStartTimePicker(true)}
                                    activeOpacity={0.85}
                                    style={styles.detailEventTimeSegment}
                                  >
                                    <Text style={styles.detailEventTimeSegmentText} numberOfLines={1}>
                                      {draftStartTime}
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              ))}
                          </View>
                        </View>
                        <View style={styles.detailEventTimeLine}>
                          <Text style={styles.detailEventTimeLineLabel}>To</Text>
                          <View style={styles.detailEventTimeRow}>
                            {Platform.OS === 'web' ? (
                              <View style={[styles.detailEventTimeCell, styles.detailEventTimeFieldDate]}>
                                <input
                                  type="date"
                                  value={draftEndDate}
                                  min={draftStartDate}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setDraftEndDate(e.target.value)
                                  }
                                  style={webDetailTimeInputStyle(detailTimeRangeErrored)}
                                />
                              </View>
                            ) : (
                              <View style={[styles.detailEventTimeCell, styles.detailEventTimeFieldDate]}>
                                <TouchableOpacity
                                  onPress={() => setShowDetailEndDatePicker(true)}
                                  activeOpacity={0.85}
                                  style={[
                                    styles.detailEventTimeSegment,
                                    detailTimeRangeErrored && styles.detailEventTimeSegmentError,
                                  ]}
                                >
                                  <Text style={styles.detailEventTimeSegmentText} numberOfLines={1}>
                                    {draftEndDate}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            )}
                            {!draftAllDay &&
                              (Platform.OS === 'web' ? (
                                <View style={[styles.detailEventTimeCell, styles.detailEventTimeFieldTime]}>
                                  <input
                                    type="time"
                                    value={draftEndTime}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                      setDraftEndTime(e.target.value)
                                    }
                                    style={webDetailTimeInputStyle(detailTimeRangeErrored)}
                                  />
                                </View>
                              ) : (
                                <View style={[styles.detailEventTimeCell, styles.detailEventTimeFieldTime]}>
                                  <TouchableOpacity
                                    onPress={() => setShowDetailEndTimePicker(true)}
                                    activeOpacity={0.85}
                                    style={[
                                      styles.detailEventTimeSegment,
                                      detailTimeRangeErrored && styles.detailEventTimeSegmentError,
                                    ]}
                                  >
                                    <Text style={styles.detailEventTimeSegmentText} numberOfLines={1}>
                                      {draftEndTime}
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              ))}
                          </View>
                        </View>
                      </View>
                      {detailTimeRangeErrored ? (
                        <Text style={styles.detailTimeError}>End must be after start</Text>
                      ) : null}
                    </View>
                  </View>
                  {canCollaborateActivities && !isPast && ev.createdBy !== currentUserId ? (
                    <TouchableOpacity
                      onPress={() => setShowTimeSuggestModal(true)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 32 }}
                    >
                      <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
                      <Text style={{ fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.semiBold }}>
                        Suggest a different time
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : isMultiDay ? (
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="calendar-outline" size={20} color={Colors.textSub} style={{ width: 22 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoText}>
                        {fmtDateFull(evStart)}{displayEv.isAllDay ? '' : ` · ${fmtTime(evStart)}`}
                      </Text>
                      <Text style={[styles.infoText, { marginTop: 4 }]}>
                        {fmtDateFull(evEnd)}{displayEv.isAllDay ? '' : ` · ${fmtTime(evEnd)}`}
                      </Text>
                    </View>
                  </View>
                  {canCollaborateActivities && !isPast && ev.createdBy !== currentUserId ? (
                    <TouchableOpacity
                      onPress={() => setShowTimeSuggestModal(true)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginLeft: 32 }}
                    >
                      <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
                      <Text style={{ fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.semiBold }}>
                        Suggest a different time
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                <View style={{ gap: 6 }}>
                  <InfoRow ionicon="calendar-outline">
                    {fmtDateFull(evStart)}
                    {displayEv.isAllDay ? ' · All day' : ` · ${fmtTime(evStart)} – ${fmtTime(evEnd)}`}
                  </InfoRow>
                  {canCollaborateActivities && !isPast && ev.createdBy !== currentUserId ? (
                    <TouchableOpacity
                      onPress={() => setShowTimeSuggestModal(true)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 32 }}
                    >
                      <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
                      <Text style={{ fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.semiBold }}>
                        Suggest a different time
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
              {canEditLive ? (
                <InfoRowSlot
                  ionicon="location-outline"
                  onIconPress={() => void openLocationInMaps(draftLocation)}
                  iconAccessibilityLabel="Search location in maps"
                >
                  <View>
                    <TextInput
                      value={draftLocation}
                      onChangeText={setDraftLocation}
                      placeholder="Location"
                      placeholderTextColor={Colors.textMuted}
                      style={styles.eventLocationInput}
                      autoCapitalize="words"
                    />
                    {locationSuggesting ? (
                      <Text style={styles.locationSuggestionHint}>Searching locations…</Text>
                    ) : null}
                    {locationSuggestions.length > 0 ? (
                      <View style={styles.locationSuggestionCard}>
                        {locationSuggestions.map((s, idx) => (
                          <TouchableOpacity
                            key={s.id}
                            onPress={() => {
                              setDraftLocation(s.label);
                              setLocationSuggestions([]);
                            }}
                            style={[
                              styles.locationSuggestionRow,
                              idx < locationSuggestions.length - 1 && styles.locationSuggestionRowBorder,
                            ]}
                            activeOpacity={0.75}
                          >
                            <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                            <Text style={styles.locationSuggestionText} numberOfLines={2}>
                              {s.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </InfoRowSlot>
              ) : (
                <InfoRowSlot
                  ionicon="location-outline"
                  onIconPress={
                    displayEv.location?.trim()
                      ? () => void openLocationInMaps(displayEv.location!.trim())
                      : undefined
                  }
                  iconAccessibilityLabel="Open location in maps"
                >
                  {displayEv.location?.trim() ? (
                    <TouchableOpacity
                      onPress={() => void openLocationInMaps(displayEv.location!.trim())}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.locationLinkText}>{displayEv.location.trim()}</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ color: Colors.textMuted }}>None</Text>
                  )}
                </InfoRowSlot>
              )}
              {canEditLive ? (
                <InfoRowSlot ionicon="people-outline">
                  <View>
                    <View style={styles.detailCapacityRow}>
                      <View style={styles.detailCapacityField}>
                        <Text style={styles.detailCapacityLabel}>Min</Text>
                        <TextInput
                          value={draftMinAttendees}
                          onChangeText={(t) => setDraftMinAttendees(t.replace(/[^0-9]/g, ''))}
                          placeholder="None"
                          placeholderTextColor={Colors.textMuted}
                          style={styles.detailCapacityInput}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={styles.detailCapacityField}>
                        <Text style={styles.detailCapacityLabel}>Max</Text>
                        <TextInput
                          value={draftMaxAttendees}
                          onChangeText={(t) => setDraftMaxAttendees(t.replace(/[^0-9]/g, ''))}
                          placeholder="None"
                          placeholderTextColor={Colors.textMuted}
                          style={styles.detailCapacityInput}
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>
                    {draftMaxAttendees.trim() && displayEv.enableWaitlist ? (
                      <Text style={styles.detailCapacityWaitlistHint}>Waitlist enabled</Text>
                    ) : null}
                  </View>
                </InfoRowSlot>
              ) : (displayEv.minAttendees || 0) > 0 || (displayEv.maxAttendees || 0) > 0 ? (
                <InfoRow ionicon="people-outline">
                  {(displayEv.minAttendees || 0) > 0 && `Min ${displayEv.minAttendees}`}
                  {(displayEv.minAttendees || 0) > 0 && (displayEv.maxAttendees || 0) > 0 && ' · '}
                  {(displayEv.maxAttendees || 0) > 0 && `Max ${displayEv.maxAttendees}`}
                  {(displayEv.maxAttendees || 0) > 0 && displayEv.enableWaitlist && ' · Waitlist enabled'}
                </InfoRow>
              ) : null}
              <InfoRow ionicon="person-outline">Created by {getUserSafe(ev.createdBy).displayName}</InfoRow>
            </View>

            {pendingTimeSuggestions.length > 0 ? (
              <View style={{ marginBottom: 16, gap: 10 }}>
                <Text style={formSectionTitleStyle}>Pending time changes</Text>
                {pendingTimeSuggestions.map((sug) => {
                  const ss = new Date(sug.start as string);
                  const se = new Date(sug.end as string);
                  return (
                    <View
                      key={sug.id}
                      style={{
                        borderWidth: 1,
                        borderColor: Colors.border,
                        borderRadius: Radius.md,
                        padding: 12,
                        backgroundColor: Colors.bg,
                      }}
                    >
                      <Text style={{ fontSize: 13, color: Colors.textMuted, marginBottom: 4 }}>
                        {getUserSafe(sug.suggestedBy).displayName} suggests
                      </Text>
                      <Text style={{ fontSize: 14, fontFamily: Fonts.medium, color: Colors.text }}>
                        {fmtDateFull(ss)}
                        {displayEv.isAllDay ? '' : ` · ${fmtTime(ss)}`} – {fmtDateFull(se)}
                        {displayEv.isAllDay ? '' : ` · ${fmtTime(se)}`}
                      </Text>
                      {canResolveTimeSuggestions ? (
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                          <TouchableOpacity
                            onPress={async () => {
                              try {
                                await acceptTimeSuggestionMutation.mutateAsync(sug.id);
                              } catch {
                                Alert.alert('Error', 'Could not accept suggestion');
                              }
                            }}
                            style={[styles.smallActionBtn, { backgroundColor: p.dot }]}
                          >
                            <Text style={styles.smallActionBtnText}>Accept</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={async () => {
                              try {
                                await rejectTimeSuggestionMutation.mutateAsync(sug.id);
                              } catch {
                                Alert.alert('Error', 'Could not reject suggestion');
                              }
                            }}
                            style={[styles.smallActionBtn, { borderWidth: 1, borderColor: Colors.border }]}
                          >
                            <Text style={[styles.smallActionBtnText, { color: Colors.text }]}>Decline</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
            {activityIdeasEffective ? (
              <View style={styles.activitiesSection}>
                <Text style={formSectionTitleStyle}>Activities</Text>
                {canCollaborateActivities ? (
                  <Text style={{ fontSize: 13, color: Colors.textMuted, marginBottom: 10, fontFamily: Fonts.regular }}>
                    Tap to vote for any options you like. Tap again on an option to remove your vote.
                    {activityVotesAnonymous ? ' Votes are anonymous — only totals are shown.' : ''}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 13, color: Colors.textMuted, marginBottom: 10, fontFamily: Fonts.regular }}>
                    What the group might do (voting is for members).
                    {activityVotesAnonymous ? ' Votes are anonymous — only totals are shown.' : ''}
                  </Text>
                )}
                {activityOptions.map((opt) => {
                  const selected = myActivityVoteOptionIds.includes(opt.id);
                  const canRemoveOpt = opt.createdBy === currentUserId || ev.createdBy === currentUserId;
                  const voterIds = !activityVotesAnonymous ? opt.voterUserIds ?? [] : [];
                  const votersLine =
                    voterIds.length > 0
                      ? voterIds.map((uid) => getUserSafe(uid).displayName).join(', ')
                      : '';
                  return (
                    <View
                      key={opt.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: Radius.md,
                        borderWidth: 1,
                        borderColor: selected ? p.dot : Colors.border,
                        backgroundColor: selected ? p.row : Colors.bg,
                        marginBottom: 8,
                        gap: 8,
                      }}
                    >
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => void onPressActivityOption(opt.id)}
                        disabled={!canCollaborateActivities || isPast}
                        activeOpacity={0.75}
                      >
                        <Text style={{ fontSize: 15, fontFamily: Fonts.medium, color: Colors.text }}>{opt.label}</Text>
                        <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2, fontFamily: Fonts.regular }}>
                          {opt.voteCount} vote{opt.voteCount === 1 ? '' : 's'} · suggested by{' '}
                          {getUserSafe(opt.createdBy).displayName}
                        </Text>
                        {votersLine ? (
                          <Text
                            style={{ fontSize: 12, color: Colors.textSub, marginTop: 4, fontFamily: Fonts.regular }}
                            numberOfLines={4}
                          >
                            Voted by: {votersLine}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                      {selected ? <Ionicons name="checkmark-circle" size={22} color={p.dot} /> : null}
                      {canRemoveOpt && !isPast ? (
                        <TouchableOpacity
                          onPress={() => removeActivityOption(opt.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })}
                {canCollaborateActivities && !isPast ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' }}>
                    <TextInput
                      value={newActivityLabel}
                      onChangeText={setNewActivityLabel}
                      placeholder="Add an activity idea"
                      placeholderTextColor={Colors.textMuted}
                      style={[styles.commentInputField, styles.commentInput]}
                      onSubmitEditing={() => void submitNewActivityOption()}
                    />
                    <TouchableOpacity
                      onPress={() => void submitNewActivityOption()}
                      style={[styles.postBtn, !newActivityLabel.trim() && styles.postBtnDisabled]}
                      disabled={!newActivityLabel.trim()}
                    >
                      <Text style={styles.postBtnText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
            </View>
          </View>
        </View>

        {canEditLive ? (
          <View style={[styles.eventScrollInset, styles.eventSectionGap]}>
            <Text style={styles.eventSectionLabel}>Settings</Text>
            <View style={styles.eventMainCard}>
              <Toggle
                value={draftAllowMaybe}
                onChange={setDraftAllowMaybe}
                label={"Allow 'Maybe' responses"}
                style={styles.eventTogglePad}
              />
              <Toggle
                value={draftRsvpDeadlineEnabled}
                onChange={(v) => {
                  if (v) {
                    setDraftRsvpDeadlineEnabled(true);
                    setDraftRsvpDeadlineDate((d) => (d.trim() ? d : draftEndDate));
                    setDraftRsvpDeadlineTime('12:00');
                  } else {
                    setDraftRsvpDeadlineEnabled(false);
                  }
                }}
                label="RSVP deadline"
                style={[
                  styles.eventTogglePad,
                  draftRsvpDeadlineEnabled && { borderBottomWidth: 0 },
                ]}
              />
              {draftRsvpDeadlineEnabled ? (
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingTop: 4,
                    paddingBottom: 14,
                  }}
                >
                  <View style={styles.detailEventTimeRow}>
                    {Platform.OS === 'web' ? (
                      <>
                        <View style={[styles.detailEventTimeCell, styles.detailEventTimeFieldDate]}>
                          <input
                            type="date"
                            value={draftRsvpDeadlineDate}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setDraftRsvpDeadlineDate(e.target.value)
                            }
                            style={webDetailTimeInputStyle(false)}
                          />
                        </View>
                        {!draftAllDay ? (
                          <View style={[styles.detailEventTimeCell, styles.detailEventTimeFieldTime]}>
                            <input
                              type="time"
                              value={draftRsvpDeadlineTime}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                setDraftRsvpDeadlineTime(e.target.value)
                              }
                              style={webDetailTimeInputStyle(false)}
                            />
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <View style={[styles.detailEventTimeCell, styles.detailEventTimeFieldDate]}>
                          <TouchableOpacity
                            onPress={() => setShowDetailRsvpDeadlineDatePicker(true)}
                            activeOpacity={0.85}
                            style={styles.detailEventTimeSegment}
                          >
                            <Text style={styles.detailEventTimeSegmentText} numberOfLines={1}>
                              {draftRsvpDeadlineDate}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        {!draftAllDay ? (
                          <View style={[styles.detailEventTimeCell, styles.detailEventTimeFieldTime]}>
                            <TouchableOpacity
                              onPress={() => setShowDetailRsvpDeadlineTimePicker(true)}
                              activeOpacity={0.85}
                              style={styles.detailEventTimeSegment}
                            >
                              <Text style={styles.detailEventTimeSegmentText} numberOfLines={1}>
                                {draftRsvpDeadlineTime}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </>
                    )}
                  </View>
                  {draftAllDay ? (
                    <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 6 }}>
                      End of that calendar day
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* RSVP + attendance summary */}
        <View style={[styles.eventScrollInset, styles.eventSectionGap]}>
          <Text style={styles.eventSectionLabel}>{rsvpSectionLabel}</Text>
          <View style={styles.eventMainCard}>
            <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                <RsvpBtn
                  status={myRsvp?.status === 'waitlist' ? 'waitlist' : 'going'}
                  active={myRsvp?.status === 'going' || myRsvp?.status === 'waitlist'}
                  disabled={
                    isPast || rsvpDeadlinePassed || (isAtCapacity && !canGoGoing && !hasWaitlist)
                  }
                  isWaitlist={isAtCapacity && !canGoGoing && hasWaitlist}
                  onPress={() => applyRsvp(RSVPInput.status.GOING)}
                  onLongPress={() =>
                    setMemoFor(
                      isAtCapacity && !canGoGoing && hasWaitlist
                        ? RSVPInput.status.WAITLIST
                        : RSVPInput.status.GOING
                    )
                  }
                />
                {showMaybeRsvp ? (
                  <RsvpBtn
                    status="maybe"
                    active={myRsvp?.status === 'maybe'}
                    disabled={isPast || rsvpDeadlinePassed}
                    onPress={() => applyRsvp(RSVPInput.status.MAYBE)}
                    onLongPress={() => setMemoFor(RSVPInput.status.MAYBE)}
                  />
                ) : null}
                <RsvpBtn
                  status="notGoing"
                  active={myRsvp?.status === 'notGoing'}
                  disabled={isPast || rsvpDeadlinePassed}
                  onPress={() => applyRsvp(RSVPInput.status.NOT_GOING)}
                  onLongPress={() => setMemoFor(RSVPInput.status.NOT_GOING)}
                />
              </View>
              {rsvpDeadlinePassed ? (
                <Text style={[styles.holdHint, { marginBottom: 6 }]}>
                  RSVP deadline has passed — responses are closed
                </Text>
              ) : null}
              {isAtCapacity && !canGoGoing && !hasWaitlist ? (
                <Text style={styles.capacityHint}>Event has reached maximum capacity</Text>
              ) : null}
              {!rsvpDeadlinePassed ? (
                <Text style={styles.holdHint}>Hold to add a note</Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => setShowAttend(true)}
              style={[styles.attendRow, styles.attendRowBorderTop]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {going.length > 0 ? (
                  <UserAvatarStack
                    userIds={going.map((r) => r.userId)}
                    getUser={getUserSafe}
                    size={24}
                    max={5}
                    dotUserIds={Array.from(usersWithMemos)}
                  />
                ) : null}
                <Text style={styles.attendText}>{attendLabel || 'No responses yet'}</Text>
              </View>
              <Text style={{ color: Colors.textMuted, fontSize: 16 }}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Comments */}
        <View
          style={[styles.eventScrollInset, styles.eventSectionGap]}
          onLayout={(e) => {
            commentsThreadSectionYRef.current = e.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.eventSectionLabel}>
            Comments{comments.length > 0 ? ` · ${comments.length}` : ''}
          </Text>
          <View
            style={styles.eventMainCard}
            onLayout={(e) => {
              commentsThreadCardYRef.current = e.nativeEvent.layout.y;
            }}
          >
            {comments.length === 0 ? (
              <View style={styles.commentsEmptyInsideCard}>
                {isPast ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="camera-outline" size={18} color={Colors.textMuted} />
                    <Text style={{ fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.regular }}>
                      Share a photo or memory!
                    </Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.regular }}>
                    No comments yet — be the first!
                  </Text>
                )}
              </View>
            ) : null}
          {comments.map((c, i) => {
            const commentTs = typeof c.createdAt === 'string' ? new Date(c.createdAt) : c.createdAt;
            const isMine = c.userId === currentUserId;
            const isAdminRemovedOnly = c.text === COMMENT_DELETED_BY_ADMIN_MSG;
            const canReply = canCollaborateActivities && !isAdminRemovedOnly;
            const canDelete = isMine || canModerateComments;
            const canEditOwn =
              isMine && !isAdminRemovedOnly && (!!((c.text || '').trim()) || c.photos.length > 0);
            const hasActions = canDelete || canEditOwn || canReply;
            const editDraft = commentEditDrafts[c.id];
            const isEditingThis = editDraft !== undefined;
            const borderBelow = i < comments.length - 1 && styles.commentBorder;
            const savingThisComment =
              updateCommentMutation.isPending && updateCommentMutation.variables?.commentId === c.id;
            const shakeRowStyle =
              shakeCommentId === c.id ? { transform: [{ translateX: shakeX }] } : undefined;
            const openCommentActionMenu = () => {
              if (!hasActions) return;
              if (Platform.OS !== 'web') {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
              setCommentActionMenu({ commentId: c.id });
            };
            return (
            <View
              key={c.id}
              onLayout={(e) => {
                commentRowTopInCardRef.current[c.id] = e.nativeEvent.layout.y;
              }}
            >
              {isAdminRemovedOnly ? (
                <Animated.View style={shakeRowStyle}>
                  <View style={[styles.commentAdminRemovedRow, borderBelow]}>
                    <Text style={styles.commentAdminRemovedOnly}>{COMMENT_DELETED_BY_ADMIN_MSG}</Text>
                  </View>
                </Animated.View>
              ) : isEditingThis && editDraft ? (
                <Animated.View style={shakeRowStyle}>
                <View style={[styles.commentRow, borderBelow]}>
                  <Avatar name={getUserSafe(c.userId).displayName} size={34} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                      <Text style={[styles.commentName, c.userId === currentUserId && { color: Colors.going }]}>
                        {getUserSafe(c.userId).displayName}
                      </Text>
                      <Text style={styles.commentTime}>{timeAgo(commentTs)}</Text>
                    </View>
                    {editDraft.photos.length > 0 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.commentInlineEditPhotoStrip}
                        contentContainerStyle={styles.commentInlineEditPhotoStripContent}
                        nestedScrollEnabled
                      >
                        {editDraft.photos.map((p, pi) => (
                          <View key={p.id} style={styles.commentInlineEditPhotoWrap}>
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() =>
                                setPendingPreviewLightbox({
                                  urls: editDraft.photos.map((x) => x.uri),
                                  index: pi,
                                })
                              }
                              style={styles.pendingPhotoHit}
                            >
                              <ResolvableImage storedUrl={p.uri} style={styles.pendingPhoto} resizeMode="cover" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => removePendingPhoto(c.id, p)}
                              style={styles.pendingPhotoRemove}
                            >
                              <Ionicons name="close" size={11} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </ScrollView>
                    ) : null}
                    <View style={styles.commentInlineEditBlock}>
                      <CommentMentionInput
                        stacked
                        value={editDraft.text}
                        onChangeText={(t) => updateEditDraftText(c.id, t)}
                        members={mentionMembersForInput}
                        currentUserId={currentUserId}
                        placeholder={isPast ? 'Memory… (@ to mention)' : 'Comment… (@ to mention)'}
                        placeholderTextColor={Colors.textMuted}
                        style={[styles.commentInputField, styles.commentInlineEditInput]}
                        onSubmitEditing={() => void saveCommentEdit(c.id)}
                        multiline
                        scrollEnabled
                        autoFocus
                        textAlignVertical="top"
                      />
                      <View style={styles.commentInlineEditToolbar}>
                        <TouchableOpacity
                          onPress={() => onCommentPhotoButtonPress(c.id)}
                          style={styles.photoBtn}
                        >
                          <Ionicons name="camera-outline" size={20} color={Colors.textSub} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => cancelEditComment(c.id)}
                          style={styles.commentInlineEditCancel}
                        >
                          <Text style={styles.commentInlineEditCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => void saveCommentEdit(c.id)}
                          disabled={
                            savingThisComment || !(editDraft.text.trim() || editDraft.photos.length)
                          }
                          style={[
                            styles.postBtn,
                            (savingThisComment || !(editDraft.text.trim() || editDraft.photos.length)) &&
                              styles.postBtnDisabled,
                          ]}
                        >
                          <Text style={styles.postBtnText}>Save</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
                </Animated.View>
              ) : (
                <Pressable
                  delayLongPress={400}
                  style={styles.commentPressable}
                  onLongPress={openCommentActionMenu}
                  accessibilityHint={hasActions ? 'Long press for reactions and actions' : undefined}
                >
                  <Animated.View style={shakeRowStyle}>
                  <View style={[styles.commentRow, borderBelow]}>
                  <Avatar name={getUserSafe(c.userId).displayName} size={34} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                      <Text style={[styles.commentName, c.userId === currentUserId && { color: Colors.going }]}>{getUserSafe(c.userId).displayName}</Text>
                      <Text style={styles.commentTime}>{timeAgo(commentTs)}</Text>
                    </View>
                    {c.replyTo ? (
                      <Pressable
                        onPress={() => jumpToCommentWithRestore(c.replyTo!.id, c.id)}
                        delayLongPress={400}
                        onLongPress={openCommentActionMenu}
                        style={({ pressed }) => [
                          styles.replyQuoteStrip,
                          styles.replyQuotePressable,
                          pressed && { opacity: 0.88 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Jump to previous comment in thread"
                      >
                        <Ionicons name="return-down-forward" size={14} color={Colors.textMuted} style={{ marginTop: 2 }} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.replyQuoteAuthor} numberOfLines={1}>
                            {c.replyTo.user.displayName ?? c.replyTo.user.name ?? 'Member'}
                          </Text>
                          <Text style={styles.replyQuotePreview} numberOfLines={2}>
                            {c.replyTo.preview}
                          </Text>
                        </View>
                      </Pressable>
                    ) : null}
                    {c.photos.length > 0 && (
                      <CommentPhotoGallery
                        photos={c.photos}
                        urlMap={resolvedImageMap}
                        onPhotoPress={(url, photoIndex) =>
                          setLightbox({
                            urls: c.photos,
                            index: photoIndex,
                            name: getUserSafe(c.userId).displayName,
                            ts: commentTs,
                          })
                        }
                      />
                    )}
                    {!!(c.text || '').trim() && (
                      <CommentMentionText
                        text={c.text}
                        style={[
                          styles.commentText,
                          (c.photos.length > 0 || c.replyTo) && { marginTop: 8 },
                        ]}
                      />
                    )}
                    {(c.reactions || []).some((r) => r.count > 0) ? (
                      <View style={styles.reactionChipsRow}>
                        {(c.reactions || [])
                          .filter((r) => r.count > 0)
                          .map((r) => (
                            <Pressable
                              key={r.emoji}
                              delayLongPress={420}
                              onPress={() => {
                                if (!currentUserId) return;
                                const key = `${c.id}:${r.emoji}`;
                                const hit = reactionChipLastLongPressRef.current;
                                if (hit && hit.key === key && Date.now() - hit.at < 500) {
                                  reactionChipLastLongPressRef.current = null;
                                  return;
                                }
                                void commentReactionMutation.mutateAsync({ commentId: c.id, emoji: r.emoji });
                              }}
                              onLongPress={() => {
                                reactionChipLastLongPressRef.current = {
                                  key: `${c.id}:${r.emoji}`,
                                  at: Date.now(),
                                };
                                if (Platform.OS !== 'web') {
                                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                }
                                openReactionDetailSheet({ emoji: r.emoji, userIds: r.userIds });
                              }}
                              style={({ pressed }) => [styles.reactionChip, pressed && { opacity: 0.92 }]}
                              accessibilityRole="button"
                              accessibilityLabel={`${r.count} ${r.emoji} reactions`}
                              accessibilityHint="Tap to react or remove your reaction. Long press to see who reacted."
                            >
                              <View style={styles.reactionChipInner}>
                                <ReactionEmojiGlyph emoji={r.emoji} size={17} />
                                <Text style={styles.reactionChipCount}>{r.count}</Text>
                              </View>
                            </Pressable>
                          ))}
                      </View>
                    ) : null}
                  </View>
                  </View>
                  </Animated.View>
                </Pressable>
              )}
            </View>
            );
          })}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </GestureScrollView>

      {replyScrollBackVisible ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.replyScrollFloatingWrap,
            { bottom: inputBarHeight + Math.max(insets.bottom, 0) + 8 },
          ]}
        >
          <TouchableOpacity
            onPress={restoreReplyScrollPosition}
            style={styles.replyScrollFloatingPill}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Back to reply message"
          >
            <Text style={styles.replyScrollFloatingPillText}>Back to Reply Message</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View
        style={styles.inputBar}
        onLayout={(e) => setInputBarHeight(e.nativeEvent.layout.height)}
      >
        {composerReplyTo ? (
          <View style={styles.composerReplyBanner}>
            <Ionicons name="arrow-undo-outline" size={18} color={Colors.accent} />
            <Pressable
              onPress={() => jumpToCommentWithRestore(composerReplyTo.id)}
              style={({ pressed }) => [
                styles.composerReplyBannerTap,
                pressed && { opacity: 0.88 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Scroll to comment you are replying to"
            >
              <Text style={styles.composerReplyBannerLabel} numberOfLines={1}>
                Replying to {composerReplyTo.label}
              </Text>
              <Text style={styles.composerReplyBannerPreview} numberOfLines={2}>
                {composerReplyTo.preview}
              </Text>
            </Pressable>
            <TouchableOpacity
              onPress={() => {
                setReplyScrollBackVisible(false);
                replyScrollRestoreYRef.current = null;
                replyScrollRestoreShakeIdRef.current = null;
                setComposerReplyTo(null);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Cancel reply"
            >
              <Ionicons name="close-circle" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : null}
        {composerPendingPhotos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 8 }}
            contentContainerStyle={{ gap: 6 }}
          >
            {composerPendingPhotos.map((p, pi) => (
              <View key={p.id} style={{ position: 'relative' }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() =>
                    setPendingPreviewLightbox({
                      urls: composerPendingPhotos.map((x) => x.uri),
                      index: pi,
                    })
                  }
                  style={styles.pendingPhotoHit}
                >
                  <ResolvableImage storedUrl={p.uri} style={styles.pendingPhoto} resizeMode="cover" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removePendingPhoto('composer', p)}
                  style={styles.pendingPhotoRemove}
                >
                  <Ionicons name="close" size={11} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <TouchableOpacity
            onPress={() => onCommentPhotoButtonPress()}
            style={styles.photoBtn}
          >
            <Ionicons name="camera-outline" size={20} color={Colors.textSub} />
          </TouchableOpacity>
          <CommentMentionInput
            value={composerInput}
            onChangeText={(t) => setComposerInput(absorbImageUrlsFromCommentText('composer', t))}
            members={mentionMembersForInput}
            currentUserId={currentUserId}
            placeholder={isPast ? 'Add a memory or photo… (@ to mention)' : 'Add a comment… (@ to mention)'}
            placeholderTextColor={Colors.textMuted}
            style={[
              styles.commentInputField,
              styles.commentInput,
              styles.commentComposerInput,
              { height: composerFieldHeight },
            ]}
            onSubmitEditing={postComment}
            multiline
            scrollEnabled={composerFieldHeight >= COMPOSER_INPUT_MAX_H - 2}
            onContentSizeChange={onComposerInputContentSizeChange}
            textAlignVertical="top"
            {...(Platform.OS === 'web'
              ? ({ rows: 1 } as { rows: number })
              : { numberOfLines: 1 })}
          />
          <TouchableOpacity
            onPress={postComment}
            disabled={commentPostBusy || createCommentMutation.isPending}
            style={[
              styles.postBtn,
              (!(composerInput.trim() || composerPendingPhotos.length) ||
                commentPostBusy ||
                createCommentMutation.isPending) &&
                styles.postBtnDisabled,
            ]}
          >
            <Text style={styles.postBtnText}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>

      {pendingPreviewLightbox !== null && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setPendingPreviewLightbox(null)}
        >
          <View style={styles.lightbox}>
            <TouchableOpacity
              onPress={() => setPendingPreviewLightbox(null)}
              style={[styles.lightboxBtn, styles.pendingPreviewClose]}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
            {pendingPreviewLightbox.urls.length > 1 ? (
              <>
                <TouchableOpacity
                  accessibilityLabel="Previous photo"
                  onPress={() =>
                    setPendingPreviewLightbox((prev) =>
                      prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev
                    )
                  }
                  disabled={pendingPreviewLightbox.index <= 0}
                  style={[
                    styles.lightboxNavBtn,
                    styles.lightboxNavPrev,
                    pendingPreviewLightbox.index <= 0 && styles.lightboxNavBtnDisabled,
                  ]}
                >
                  <Ionicons name="chevron-back" size={28} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel="Next photo"
                  onPress={() =>
                    setPendingPreviewLightbox((prev) =>
                      prev && prev.index < prev.urls.length - 1
                        ? { ...prev, index: prev.index + 1 }
                        : prev
                    )
                  }
                  disabled={pendingPreviewLightbox.index >= pendingPreviewLightbox.urls.length - 1}
                  style={[
                    styles.lightboxNavBtn,
                    styles.lightboxNavNext,
                    pendingPreviewLightbox.index >= pendingPreviewLightbox.urls.length - 1 &&
                      styles.lightboxNavBtnDisabled,
                  ]}
                >
                  <Ionicons name="chevron-forward" size={28} color="#fff" />
                </TouchableOpacity>
              </>
            ) : null}
            <ResolvableImage
              storedUrl={pendingPreviewLightbox.urls[pendingPreviewLightbox.index] ?? ''}
              style={styles.lightboxImg}
              resizeMode="contain"
            />
            {pendingPreviewLightbox.urls.length > 1 ? (
              <Text style={styles.lightboxCounter}>
                {pendingPreviewLightbox.index + 1} / {pendingPreviewLightbox.urls.length}
              </Text>
            ) : null}
          </View>
        </Modal>
      )}

      <Modal
        visible={reactionDetailSheetVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeReactionDetailSheet}
      >
        {reactionDetailModal ? (
          <View style={styles.reactionSheetRoot}>
            <Pressable
              style={styles.reactionSheetBackdrop}
              onPress={closeReactionDetailSheet}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            />
            <View
              style={[
                styles.reactionSheetPanel,
                {
                  maxHeight: Dimensions.get('window').height * 0.74,
                  paddingBottom: Math.max(insets.bottom, 14),
                },
              ]}
            >
              <View style={styles.reactionSheetGrabber} />
              <View style={styles.reactionSheetTitleRow}>
                {(() => {
                  const n = reactionDetailModal.userIds.length;
                  const sc = reactionEmojiShortcode(reactionDetailModal.emoji);
                  const head = `${n} ${n === 1 ? 'person' : 'people'} reacted with `;
                  return (
                    <>
                      <Text style={styles.reactionSheetTitleText} numberOfLines={3}>
                        {head}
                      </Text>
                      <ReactionEmojiGlyph
                        emoji={reactionDetailModal.emoji}
                        size={20}
                        containerStyle={styles.reactionSheetTitleEmoji}
                      />
                      {sc ? (
                        <Text style={styles.reactionSheetTitleText} numberOfLines={1}>
                          {` ${sc}`}
                        </Text>
                      ) : null}
                    </>
                  );
                })()}
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={styles.reactionSheetList}
                contentContainerStyle={styles.reactionSheetListContent}
                showsVerticalScrollIndicator={false}
              >
                {reactionDetailModal.userIds.map((uid, ri) => {
                  const u = getUserSafe(uid);
                  return (
                    <View
                      key={uid}
                      style={[styles.reactionSheetRow, ri === 0 && styles.reactionSheetRowFirst]}
                    >
                      <UserAvatar
                        seed={u.displayName || u.name}
                        backgroundColor={[u.avatarSeed]}
                        thumbnail={u.thumbnail}
                        size={42}
                      />
                      <Text style={styles.reactionSheetName} numberOfLines={1}>
                        {u.displayName}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        ) : (
          <View style={styles.reactionSheetRoot} />
        )}
      </Modal>

      {commentActionMenu && commentMenuTarget ? (
        <Modal
          visible
          transparent
          animationType="fade"
          presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
          onRequestClose={dismissCommentActionMenu}
          statusBarTranslucent
        >
          <View style={styles.commentActionModalRoot}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.overlay }]} />
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={dismissCommentActionMenu}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            />
            <View
              pointerEvents="box-none"
              style={[
                StyleSheet.absoluteFill,
                styles.commentActionModalCenter,
                { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 16) },
              ]}
            >
              <View style={styles.commentActionSheet} pointerEvents="auto">
                {(() => {
                  const mc = commentMenuTarget;
                  const menuRemoved = mc.text === COMMENT_DELETED_BY_ADMIN_MSG;
                  const menuCanReply = canCollaborateActivities && !menuRemoved;
                  /** Writer, group admin, or super admin — others only get reply + reactions in this menu. */
                  const menuCanSeeEditDeleteCopy =
                    !!currentUserId &&
                    (mc.userId === currentUserId || canModerateComments);
                  const menuCanEdit =
                    menuCanSeeEditDeleteCopy &&
                    mc.userId === currentUserId &&
                    !menuRemoved &&
                    (!!((mc.text || '').trim()) || mc.photos.length > 0);
                  const menuCanDelete = menuCanSeeEditDeleteCopy;
                  const menuTs =
                    typeof mc.createdAt === 'string' ? new Date(mc.createdAt) : mc.createdAt;
                  const previewText = (mc.text || '').trim();
                  const isMinePreview = mc.userId === currentUserId;

                  type MenuRowSpec = {
                    key: string;
                    label: string;
                    icon: ComponentProps<typeof Ionicons>['name'];
                    danger?: boolean;
                    onPress: () => void;
                  };
                  const menuRows: MenuRowSpec[] = [];
                  if (menuCanEdit) {
                    menuRows.push({
                      key: 'edit',
                      label: 'Edit',
                      icon: 'pencil-outline',
                      onPress: () => {
                        dismissCommentActionMenu();
                        beginEditComment(mc.id, mc.text, mc.photos);
                      },
                    });
                  }
                  if (menuCanReply) {
                    menuRows.push({
                      key: 'reply',
                      label: 'Reply in thread',
                      icon: 'chatbubbles-outline',
                      onPress: () => {
                        const line =
                          (mc.text || '').trim().split('\n')[0]?.slice(0, 100) ?? '';
                        dismissCommentActionMenu();
                        setComposerReplyTo({
                          id: mc.id,
                          label: getUserSafe(mc.userId).displayName,
                          preview: line || (mc.photos.length ? 'Photo' : 'Message'),
                        });
                      },
                    });
                  }
                  if (previewText && menuCanSeeEditDeleteCopy) {
                    menuRows.push({
                      key: 'copy',
                      label: 'Copy text',
                      icon: 'copy-outline',
                      onPress: async () => {
                        await Clipboard.setStringAsync(previewText);
                        dismissCommentActionMenu();
                        if (Platform.OS !== 'web') {
                          Alert.alert('Copied', 'Comment text copied to clipboard.');
                        }
                      },
                    });
                  }
                  if (menuCanDelete) {
                    menuRows.push({
                      key: 'delete',
                      label: 'Delete',
                      icon: 'trash-outline',
                      danger: true,
                      onPress: () => {
                        dismissCommentActionMenu();
                        handleDeleteComment(mc.id);
                      },
                    });
                  }

                  return (
                    <>
                      {currentUserId && menuCanReply ? (
                        <View style={styles.commentActionEmojiBarRow}>
                          <View style={styles.commentActionEmojiQuickPill}>
                            <View style={styles.commentActionEmojiQuickInner}>
                              {commentQuickReactions.map((emoji) => {
                                const active = (mc.viewerReactionEmojis || []).includes(emoji);
                                return (
                                  <TouchableOpacity
                                    key={emoji}
                                    onPress={() => void applyCommentReactionAndDismiss(mc.id, emoji)}
                                    disabled={commentReactionMutation.isPending}
                                    style={[
                                      styles.commentActionEmojiQuickHit,
                                      active && styles.commentActionEmojiHitActive,
                                    ]}
                                    accessibilityLabel={`React with ${emoji}`}
                                  >
                                    <ReactionEmojiGlyph emoji={emoji} size={24} />
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                          <TouchableOpacity
                            style={styles.commentActionEmojiMoreBtn}
                            onPress={() => {
                              setCommentReactionFullPickerFor(mc.id);
                              closeCommentActionSheet();
                            }}
                            disabled={commentReactionMutation.isPending}
                            accessibilityLabel="More emojis"
                            activeOpacity={0.75}
                          >
                            <View style={styles.commentActionEmojiMoreInner}>
                              <Ionicons name="happy-outline" size={22} color={Colors.textSub} />
                              <View style={styles.commentActionEmojiMorePlus} pointerEvents="none">
                                <Ionicons name="add" size={11} color={Colors.textSub} />
                              </View>
                            </View>
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      <View
                        style={[
                          styles.commentActionPreviewAlign,
                          isMinePreview && styles.commentActionPreviewAlignMine,
                        ]}
                      >
                        <View
                          style={[
                            styles.commentActionPreviewBubble,
                            isMinePreview && styles.commentActionPreviewBubbleMine,
                          ]}
                        >
                          <Text style={styles.commentActionPreviewMetaLine} numberOfLines={1}>
                            <Text style={styles.commentActionPreviewAuthor}>
                              {getUserSafe(mc.userId).displayName}
                            </Text>
                            <Text style={styles.commentActionPreviewMetaMuted}>
                              {' · '}
                              {timeAgo(menuTs)}
                            </Text>
                          </Text>
                          {previewText ? (
                            <Text style={styles.commentActionPreviewBody} numberOfLines={8}>
                              {previewText}
                            </Text>
                          ) : mc.photos.length > 0 ? (
                            <View style={styles.commentActionPreviewPhotoRow}>
                              <ReactionEmojiGlyph emoji="📷" size={18} />
                              <Text style={styles.commentActionPreviewBody}> Photo</Text>
                            </View>
                          ) : (
                            <Text style={[styles.commentActionPreviewBody, { opacity: 0.7 }]}>
                              (no text)
                            </Text>
                          )}
                        </View>
                      </View>

                      <View style={styles.commentActionMenuCard}>
                        {menuRows.map((row, i) => (
                          <TouchableOpacity
                            key={row.key}
                            style={[
                              styles.commentActionMenuRow,
                              i === 0 && styles.commentActionMenuRowFirst,
                              i === menuRows.length - 1 && styles.commentActionMenuRowLast,
                            ]}
                            onPress={row.onPress}
                            activeOpacity={0.65}
                          >
                            <Text
                              style={
                                row.danger
                                  ? styles.commentActionMenuLabelDanger
                                  : styles.commentActionMenuLabel
                              }
                            >
                              {row.label}
                            </Text>
                            <Ionicons
                              name={row.icon}
                              size={22}
                              color={row.danger ? Colors.todayRed : Colors.textSub}
                            />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  );
                })()}
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {commentReactionFullPickerFor && currentUserId ? (
        <Modal
          visible
          transparent
          animationType="fade"
          presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
          onRequestClose={() => setCommentReactionFullPickerFor(null)}
          statusBarTranslucent
        >
          <View style={styles.commentReactionPickerRoot}>
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: Colors.overlay }]}
              onPress={() => setCommentReactionFullPickerFor(null)}
              accessibilityRole="button"
              accessibilityLabel="Close emoji picker"
            />
            <View style={styles.commentReactionPickerCenter} pointerEvents="box-none">
              <View style={styles.commentReactionPickerCard} pointerEvents="auto">
                <Text style={styles.commentReactionPickerTitle}>Choose a reaction</Text>
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={styles.commentReactionPickerScroll}
                  contentContainerStyle={styles.commentReactionPickerGrid}
                >
                  {COMMENT_REACTION_EMOJIS.map((emoji, emojiIdx) => (
                    <TouchableOpacity
                      key={`${emoji}-${emojiIdx}`}
                      onPress={() =>
                        void applyCommentReactionAndDismiss(commentReactionFullPickerFor, emoji)
                      }
                      disabled={commentReactionMutation.isPending}
                      style={styles.commentActionEmojiHit}
                      accessibilityLabel={`React with ${emoji}`}
                    >
                      <ReactionEmojiGlyph emoji={emoji} size={22} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {/* Attendance sheet */}
      <AttendanceSheet ev={ev} group={group} users={users} visible={showAttend} onClose={() => setShowAttend(false)} />

      {/* Memo sheet */}
      {memoFor && (
        <MemoSheet
          key={memoFor}
          status={memoFor}
          existing={myRsvp?.memo ?? ''}
          onConfirm={memo => { applyRsvp(memoFor!, memo); setMemoFor(null); }}
          onClose={() => setMemoFor(null)}
        />
      )}

      {/* Lightbox */}
      {lightbox && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
          <View style={styles.lightbox}>
            <View style={styles.lightboxHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar name={lightbox.name} size={28} />
                <View>
                  <Text style={styles.lightboxName}>{lightbox.name}</Text>
                  <Text style={styles.lightboxTime}>
                    {lightbox.urls.length > 1
                      ? `${lightbox.index + 1} of ${lightbox.urls.length} · ${timeAgo(lightbox.ts)}`
                      : timeAgo(lightbox.ts)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setLightbox(null)} style={styles.lightboxBtn}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            {lightbox.urls.length > 1 ? (
              <>
                <TouchableOpacity
                  accessibilityLabel="Previous photo"
                  onPress={() =>
                    setLightbox((prev) =>
                      prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev
                    )
                  }
                  disabled={lightbox.index <= 0}
                  style={[
                    styles.lightboxNavBtn,
                    styles.lightboxNavPrev,
                    lightbox.index <= 0 && styles.lightboxNavBtnDisabled,
                  ]}
                >
                  <Ionicons name="chevron-back" size={28} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel="Next photo"
                  onPress={() =>
                    setLightbox((prev) =>
                      prev && prev.index < prev.urls.length - 1
                        ? { ...prev, index: prev.index + 1 }
                        : prev
                    )
                  }
                  disabled={lightbox.index >= lightbox.urls.length - 1}
                  style={[
                    styles.lightboxNavBtn,
                    styles.lightboxNavNext,
                    lightbox.index >= lightbox.urls.length - 1 && styles.lightboxNavBtnDisabled,
                  ]}
                >
                  <Ionicons name="chevron-forward" size={28} color="#fff" />
                </TouchableOpacity>
              </>
            ) : null}
            <ResolvableImage
              storedUrl={lightbox.urls[lightbox.index] ?? ''}
              urlMap={resolvedImageMap}
              style={styles.lightboxImg}
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}

      <Modal
        visible={showCommentPhotoModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowCommentPhotoModal(false);
          setCommentPhotoUrl('');
        }}
      >
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteBox}>
            <Text style={styles.deleteTitle}>Image from URL</Text>
            <Text style={styles.deleteMessage}>
              Paste a direct link to an image (https). Long-press the camera button to open this again.
            </Text>
            <TextInput
              value={commentPhotoUrl}
              onChangeText={setCommentPhotoUrl}
              placeholder="https://…"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.commentInputField, { marginTop: 12 }]}
            />
            <View style={styles.deleteActions}>
              <TouchableOpacity
                onPress={() => {
                  setShowCommentPhotoModal(false);
                  setCommentPhotoUrl('');
                }}
                style={styles.deleteCancelBtn}
              >
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddCommentPhoto} style={styles.deleteConfirmBtn}>
                <Text style={styles.deleteConfirmText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {Platform.OS !== 'web' && showDetailStartDatePicker ? (
        <DateTimePicker
          value={draftStartDate ? new Date(draftStartDate) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDetailStartDateChange}
          minimumDate={new Date()}
        />
      ) : null}
      {Platform.OS === 'ios' && showDetailStartDatePicker ? (
        <View style={styles.detailDatePickerActions}>
          <TouchableOpacity onPress={() => setShowDetailStartDatePicker(false)} style={styles.detailDatePickerBtn}>
            <Text style={styles.detailDatePickerBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {Platform.OS !== 'web' && showDetailEndDatePicker ? (
        <DateTimePicker
          value={draftEndDate ? new Date(draftEndDate) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDetailEndDateChange}
          minimumDate={draftStartDate ? new Date(draftStartDate) : new Date()}
        />
      ) : null}
      {Platform.OS === 'ios' && showDetailEndDatePicker ? (
        <View style={styles.detailDatePickerActions}>
          <TouchableOpacity onPress={() => setShowDetailEndDatePicker(false)} style={styles.detailDatePickerBtn}>
            <Text style={styles.detailDatePickerBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {Platform.OS !== 'web' && showDetailStartTimePicker ? (
        <DateTimePicker
          value={detailGetTimeDate(draftStartTime)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDetailStartTimeChange}
          minimumDate={getDetailMinimumStartTime()}
        />
      ) : null}
      {Platform.OS === 'ios' && showDetailStartTimePicker ? (
        <View style={styles.detailDatePickerActions}>
          <TouchableOpacity onPress={() => setShowDetailStartTimePicker(false)} style={styles.detailDatePickerBtn}>
            <Text style={styles.detailDatePickerBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {Platform.OS !== 'web' && showDetailEndTimePicker ? (
        <DateTimePicker
          value={detailGetTimeDate(draftEndTime)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDetailEndTimeChange}
          minimumDate={getDetailMinimumEndTime()}
        />
      ) : null}
      {Platform.OS === 'ios' && showDetailEndTimePicker ? (
        <View style={styles.detailDatePickerActions}>
          <TouchableOpacity onPress={() => setShowDetailEndTimePicker(false)} style={styles.detailDatePickerBtn}>
            <Text style={styles.detailDatePickerBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {Platform.OS !== 'web' && showDetailRsvpDeadlineDatePicker ? (
        <DateTimePicker
          value={draftRsvpDeadlineDate ? new Date(draftRsvpDeadlineDate) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDetailRsvpDeadlineDateChange}
        />
      ) : null}
      {Platform.OS === 'ios' && showDetailRsvpDeadlineDatePicker ? (
        <View style={styles.detailDatePickerActions}>
          <TouchableOpacity
            onPress={() => setShowDetailRsvpDeadlineDatePicker(false)}
            style={styles.detailDatePickerBtn}
          >
            <Text style={styles.detailDatePickerBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {Platform.OS !== 'web' && showDetailRsvpDeadlineTimePicker ? (
        <DateTimePicker
          value={detailGetTimeDate(draftRsvpDeadlineTime)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDetailRsvpDeadlineTimeChange}
        />
      ) : null}
      {Platform.OS === 'ios' && showDetailRsvpDeadlineTimePicker ? (
        <View style={styles.detailDatePickerActions}>
          <TouchableOpacity
            onPress={() => setShowDetailRsvpDeadlineTimePicker(false)}
            style={styles.detailDatePickerBtn}
          >
            <Text style={styles.detailDatePickerBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal
        visible={showDetailSaveScopeModal}
        transparent
        animationType="fade"
        onRequestClose={() => !updateEventMutation.isPending && setShowDetailSaveScopeModal(false)}
      >
        <View style={styles.deleteOverlay}>
          <View style={[styles.deleteBox, styles.detailSaveScopeModalBox]}>
            <Text style={styles.deleteTitle}>Save changes</Text>
            <Text style={[styles.deleteMessage, { marginBottom: 12 }]}>
              Choose how to apply your edits to this repeating event.
            </Text>
            <View style={styles.detailScopeSettingsCard}>
              {SERIES_SCOPE_OPTIONS.map((opt, i) => {
                const sel = detailSeriesUpdateScope === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => !updateEventMutation.isPending && setDetailSeriesUpdateScope(opt.key)}
                    style={[
                      styles.detailScopeRow,
                      i > 0 && styles.detailScopeRowBorderTop,
                      sel && styles.detailScopeRowSelected,
                    ]}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                  >
                    <View style={[styles.detailScopeRadioOuter, sel && styles.detailScopeRadioOuterOn]}>
                      {sel ? <View style={styles.detailScopeRadioInner} /> : null}
                    </View>
                    <View style={styles.detailScopeTextCol}>
                      <Text style={styles.detailScopeTitle}>{opt.title}</Text>
                      <Text style={styles.detailScopeSub}>{opt.sub}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={[styles.detailSaveScopeModalActions, { marginTop: 18 }]}>
              <TouchableOpacity
                onPress={() => setShowDetailSaveScopeModal(false)}
                style={[styles.deleteCancelBtn, { flex: 1 }]}
                disabled={updateEventMutation.isPending}
              >
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void executeDetailSave(detailSeriesUpdateScope)}
                style={[
                  styles.draftBarBtnPrimary,
                  { flex: 1, paddingVertical: 12 },
                  updateEventMutation.isPending && styles.draftBarBtnPrimaryDisabled,
                ]}
                disabled={updateEventMutation.isPending}
              >
                {updateEventMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.accentFg} />
                ) : (
                  <Text style={styles.draftBarBtnPrimaryText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={styles.deleteOverlay}>
          <View style={[styles.deleteBox, displayTiming.isRecurring && { maxWidth: 360 }]}>
            <Text style={styles.deleteTitle}>
              Delete event
            </Text>
            {displayTiming.isRecurring ? (
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  onPress={handleDeleteThisOccurrenceOnly}
                  style={[
                    styles.deleteConfirmBtn,
                    {
                      flex: undefined,
                      width: '100%',
                      backgroundColor: 'transparent',
                      borderWidth: 1,
                      borderColor: '#EF4444',
                    },
                  ]}
                  disabled={
                    truncateSeriesMutation.isPending ||
                    deleteEventMutation.isPending ||
                    deleteRecurrenceSeriesMutation.isPending
                  }
                >
                  <Text style={[styles.deleteConfirmText, { color: '#EF4444' }]}>
                    {deleteEventMutation.isPending ? 'Removing…' : 'Only this event'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleTruncateSeriesFromHere}
                  style={[styles.deleteConfirmBtn, { flex: undefined, width: '100%', backgroundColor: '#EA580C' }]}
                  disabled={
                    truncateSeriesMutation.isPending ||
                    deleteEventMutation.isPending ||
                    deleteRecurrenceSeriesMutation.isPending
                  }
                >
                  <Text style={styles.deleteConfirmText}>
                    {truncateSeriesMutation.isPending ? 'Updating…' : 'This and following events in the series'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeleteEntireSeries}
                  style={[styles.deleteConfirmBtn, { flex: undefined, width: '100%' }]}
                  disabled={
                    truncateSeriesMutation.isPending ||
                    deleteEventMutation.isPending ||
                    deleteRecurrenceSeriesMutation.isPending
                  }
                >
                  <Text style={styles.deleteConfirmText}>
                    {deleteRecurrenceSeriesMutation.isPending || deleteEventMutation.isPending
                      ? 'Deleting…'
                      : 'All events in the series'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowDeleteConfirm(false)}
                  style={[styles.deleteCancelBtn, { flex: undefined, width: '100%' }]}
                >
                  <Text style={styles.deleteCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.deleteActions}>
                <TouchableOpacity onPress={() => setShowDeleteConfirm(false)} style={styles.deleteCancelBtn}>
                  <Text style={styles.deleteCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDeleteEntireSeries} style={styles.deleteConfirmBtn}>
                  <Text style={styles.deleteConfirmText}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showTimeSuggestModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimeSuggestModal(false)}
      >
        <View style={styles.deleteOverlay}>
          <View style={[styles.deleteBox, { maxWidth: 400 }]}>
            <Text style={styles.deleteTitle}>Suggest a time</Text>
            <Text style={[styles.deleteMessage, { marginBottom: 12 }]}>
              Propose new start and end. The host can accept to update the event.
            </Text>
            {Platform.OS === 'web' ? (
              <View style={{ gap: 10, marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted }}>Start</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <input
                    type="date"
                    value={suggestStartDate}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSuggestStartDate(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${Colors.border}`,
                      fontSize: 14,
                      fontFamily: 'DMSans_400Regular',
                    }}
                  />
                  <input
                    type="time"
                    value={suggestStartTime}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSuggestStartTime(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${Colors.border}`,
                      fontSize: 14,
                      fontFamily: 'DMSans_400Regular',
                    }}
                  />
                </View>
                <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted }}>End</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <input
                    type="date"
                    value={suggestEndDate}
                    min={suggestStartDate}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSuggestEndDate(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${Colors.border}`,
                      fontSize: 14,
                      fontFamily: 'DMSans_400Regular',
                    }}
                  />
                  <input
                    type="time"
                    value={suggestEndTime}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSuggestEndTime(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${Colors.border}`,
                      fontSize: 14,
                      fontFamily: 'DMSans_400Regular',
                    }}
                  />
                </View>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 320, marginBottom: 12 }} keyboardShouldPersistTaps="handled">
                <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted, marginBottom: 6 }}>Start date</Text>
                <TouchableOpacity onPress={() => setShowSuggestStartDatePicker(true)} style={{ marginBottom: 12 }}>
                  <TextInput
                    value={suggestStartDate}
                    editable={false}
                    style={styles.commentInputField}
                    placeholder="Date"
                  />
                </TouchableOpacity>
                <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted, marginBottom: 6 }}>Start time</Text>
                <TouchableOpacity onPress={() => setShowSuggestStartTimePicker(true)} style={{ marginBottom: 12 }}>
                  <TextInput value={suggestStartTime} editable={false} style={styles.commentInputField} />
                </TouchableOpacity>
                <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted, marginBottom: 6 }}>End date</Text>
                <TouchableOpacity onPress={() => setShowSuggestEndDatePicker(true)} style={{ marginBottom: 12 }}>
                  <TextInput value={suggestEndDate} editable={false} style={styles.commentInputField} />
                </TouchableOpacity>
                <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted, marginBottom: 6 }}>End time</Text>
                <TouchableOpacity onPress={() => setShowSuggestEndTimePicker(true)} style={{ marginBottom: 8 }}>
                  <TextInput value={suggestEndTime} editable={false} style={styles.commentInputField} />
                </TouchableOpacity>
                {showSuggestStartDatePicker ? (
                  <DateTimePicker
                    value={suggestStartDate ? new Date(suggestStartDate) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => {
                      if (Platform.OS === 'android') setShowSuggestStartDatePicker(false);
                      if (d) setSuggestStartDate(formatLocalDateInput(d));
                    }}
                  />
                ) : null}
                {showSuggestEndDatePicker ? (
                  <DateTimePicker
                    value={suggestEndDate ? new Date(suggestEndDate) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={suggestStartDate ? new Date(suggestStartDate) : undefined}
                    onChange={(_, d) => {
                      if (Platform.OS === 'android') setShowSuggestEndDatePicker(false);
                      if (d) setSuggestEndDate(formatLocalDateInput(d));
                    }}
                  />
                ) : null}
                {showSuggestStartTimePicker ? (
                  <DateTimePicker
                    value={(() => {
                      const [h, m] = suggestStartTime.split(':').map(Number);
                      const x = new Date();
                      x.setHours(h || 0, m || 0, 0, 0);
                      return x;
                    })()}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => {
                      if (Platform.OS === 'android') setShowSuggestStartTimePicker(false);
                      if (d) {
                        const pad = (n: number) => String(n).padStart(2, '0');
                        setSuggestStartTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
                      }
                    }}
                  />
                ) : null}
                {showSuggestEndTimePicker ? (
                  <DateTimePicker
                    value={(() => {
                      const [h, m] = suggestEndTime.split(':').map(Number);
                      const x = new Date();
                      x.setHours(h || 0, m || 0, 0, 0);
                      return x;
                    })()}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => {
                      if (Platform.OS === 'android') setShowSuggestEndTimePicker(false);
                      if (d) {
                        const pad = (n: number) => String(n).padStart(2, '0');
                        setSuggestEndTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
                      }
                    }}
                  />
                ) : null}
              </ScrollView>
            )}
            <View style={styles.deleteActions}>
              <TouchableOpacity
                onPress={() => setShowTimeSuggestModal(false)}
                style={styles.deleteCancelBtn}
              >
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void submitTimeSuggestion()} style={styles.deleteConfirmBtn}>
                <Text style={styles.deleteConfirmText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
    </EventFormPopoverChrome>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function InfoRowSlot({
  ionicon,
  children,
  onIconPress,
  iconAccessibilityLabel,
}: {
  ionicon: React.ComponentProps<typeof Ionicons>['name'];
  children: React.ReactNode;
  onIconPress?: () => void;
  iconAccessibilityLabel?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {onIconPress ? (
        <TouchableOpacity
          onPress={onIconPress}
          style={styles.infoIconHit}
          accessibilityRole="button"
          accessibilityLabel={iconAccessibilityLabel ?? 'Open in maps'}
          activeOpacity={0.75}
        >
          <Ionicons name={ionicon} size={20} color={Colors.textSub} style={{ width: 22 }} />
        </TouchableOpacity>
      ) : (
        <Ionicons name={ionicon} size={20} color={Colors.textSub} style={{ width: 22 }} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

function InfoRow({ ionicon, children }: { ionicon: React.ComponentProps<typeof Ionicons>['name']; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name={ionicon} size={20} color={Colors.textSub} style={{ width: 22 }} />
      <Text style={styles.infoText}>{children}</Text>
    </View>
  );
}

function RsvpBtn({ status, active, disabled, isWaitlist, onPress, onLongPress }: { status: string; active: boolean; disabled?: boolean; isWaitlist?: boolean; onPress: () => void; onLongPress: () => void }) {
  const isGoing = status === 'going';
  const isMaybe = status === 'maybe';
  const isWaitlistStatus = status === 'waitlist';
  const waitlistColor = '#F59E0B';
  
  let bg = Colors.surface;
  let border = Colors.border;
  let label = '';
  let leadIcon: React.ComponentProps<typeof Ionicons>['name'] | null = null;
  
  if (isWaitlistStatus) {
    bg = active ? waitlistColor : Colors.surface;
    border = active ? waitlistColor : waitlistColor;
    label = active ? 'Waitlisted' : 'Join Waitlist';
    if (active) leadIcon = 'hourglass-outline';
  } else if (isGoing) {
    bg = active ? Colors.going : Colors.surface;
    border = active ? Colors.going : Colors.border;
    label = active ? 'Going' : 'Going';
    if (active) leadIcon = 'checkmark';
    if (isWaitlist && !active) {
      label = 'Join Waitlist';
      border = waitlistColor;
      leadIcon = null;
    }
  } else if (isMaybe) {
    bg = active ? Colors.maybe : Colors.surface;
    border = active ? Colors.maybe : Colors.border;
    label = 'Maybe';
  } else {
    bg = active ? Colors.notGoing : Colors.surface;
    border = active ? Colors.notGoing : Colors.border;
    label = active ? 'Can\'t go' : 'Can\'t go';
    if (active) leadIcon = 'close';
  }
  
  const textColor = disabled ? Colors.textMuted : active ? '#fff' : Colors.textSub;
  return (
    <TouchableOpacity 
      onPress={onPress} 
      onLongPress={onLongPress} 
      style={[styles.rsvpBtn, { borderColor: border, backgroundColor: bg, opacity: disabled ? 0.5 : 1 }]} 
      activeOpacity={0.8}
      disabled={disabled}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        {leadIcon ? <Ionicons name={leadIcon} size={16} color={textColor} /> : null}
        <Text style={[styles.rsvpBtnText, { color: textColor }]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

function AttendanceSheet({ ev, group, users, visible, onClose }: { ev: EventDetailed; group: GroupScoped; users: Record<string, User>; visible: boolean; onClose: () => void }) {
  const [memoPopup, setMemoPopup] = useState<RSVP | null>(null);
  
  const going    = (ev.rsvps || []).filter(r => r.status === 'going');
  const notGoing = (ev.rsvps || []).filter(r => r.status === 'notGoing');
  const maybe    = (ev.rsvps || []).filter(r => r.status === 'maybe');
  const waitlist = (ev.rsvps || []).filter(r => r.status === 'waitlist');
  const noResponseIds = getNoResponseIds(ev, group);

  const RsvpRow = ({ r, faded }: { r: RSVP; faded?: boolean }) => {
    const user = users[r.userId] || { id: r.userId, name: 'Loading...', displayName: 'Loading...', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    return (
      <TouchableOpacity 
        onPress={() => r.memo ? setMemoPopup(r) : null} 
        style={styles.attendDarkRsvpRow} 
        activeOpacity={r.memo ? 0.7 : 1}
      >
        <UserAvatar seed={user.displayName || user.name} backgroundColor={[user.avatarSeed]} thumbnail={user.thumbnail} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.attendDarkName, faded && styles.attendDarkNameFaded]}>{user.displayName}</Text>
          {r.memo ? <Text style={styles.attendDarkMemo} numberOfLines={1}>"{r.memo}"</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Sheet visible={visible} onClose={onClose} variant="dark">
        <Text style={styles.reactionSheetTitle}>Attendance</Text>
        {going.length > 0 && (
          <>
            <Text style={styles.attendDarkSection}>GOING · {going.length}</Text>
            {going.map(r => <RsvpRow key={r.userId} r={r} />)}
          </>
        )}
        {waitlist.length > 0 && (
          <>
            <Text style={[styles.attendDarkSection, { color: '#FBBF24' }]}>WAITLIST · {waitlist.length}</Text>
            {waitlist.map(r => <RsvpRow key={r.userId} r={r} />)}
          </>
        )}
        {maybe.length > 0 && (
          <>
            <Text style={styles.attendDarkSection}>MAYBE · {maybe.length}</Text>
            {maybe.map(r => <RsvpRow key={r.userId} r={r} />)}
          </>
        )}
        {notGoing.length > 0 && (
          <>
            <Text style={styles.attendDarkSection}>NOT ATTENDING · {notGoing.length}</Text>
            {notGoing.map(r => <RsvpRow key={r.userId} r={r} faded />)}
          </>
        )}
        {noResponseIds.length > 0 && (
            <>
            <Text style={styles.attendDarkSection}>NO RESPONSE · {noResponseIds.length}</Text>
            {noResponseIds.map(uid => {
              const user = users[uid] || { id: uid, name: 'Loading...', displayName: 'Loading...', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
              return (
                <View key={uid} style={styles.attendDarkRsvpRow}>
                  <UserAvatar seed={user.displayName || user.name} backgroundColor={[user.avatarSeed]} thumbnail={user.thumbnail} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attendDarkNameMuted}>{user.displayName}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}
        <View style={{ height: 20 }} />
      </Sheet>

      {memoPopup && (() => {
        const memoUser = users[memoPopup.userId];
        return (
          <Modal visible transparent animationType="fade" onRequestClose={() => setMemoPopup(null)}>
            <TouchableOpacity style={styles.memoOverlay} onPress={() => setMemoPopup(null)} activeOpacity={1}>
              <View style={styles.memoPopup}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <UserAvatar
                    seed={memoUser ? memoUser.displayName || memoUser.name : 'Unknown'}
                    backgroundColor={[memoUser?.avatarSeed]}
                    thumbnail={memoUser?.thumbnail}
                    size={34}
                  />
                  <Text style={{ fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text }}>{memoUser?.displayName || 'Unknown'}</Text>
                </View>
                <View style={styles.memoTextBox}>
                  <Text style={styles.memoText}>"{memoPopup.memo}"</Text>
                </View>
                <TouchableOpacity onPress={() => setMemoPopup(null)} style={[styles.rsvpBtn, { marginTop: 14, borderColor: Colors.border }]}>
                  <Text style={[styles.rsvpBtnText, { color: Colors.textSub }]}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        );
      })()}
    </>
  );
}

function MemoSheet({ status, existing, onConfirm, onClose }: { status: RSVPInput.status; existing: string; onConfirm: (m: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [val, setVal] = useState(existing || '');
  useEffect(() => {
    setVal(existing || '');
  }, [existing]);
  const isGoing = status === RSVPInput.status.GOING;
  const isMaybe = status === RSVPInput.status.MAYBE;
  const isWaitlist = status === RSVPInput.status.WAITLIST;
  const label = isGoing ? 'Going' : isMaybe ? 'Maybe' : isWaitlist ? 'Waitlist' : "Can't go";

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.rsvpMemoModalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <Pressable
          style={styles.rsvpMemoModalBackdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View
          style={[
            styles.rsvpMemoModalCenter,
            { paddingBottom: Math.max(insets.bottom, 20) },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.rsvpMemoModalCard}>
            <Text style={styles.rsvpMemoModalTitle}>{label}</Text>
            <Text style={styles.rsvpMemoModalHint}>Optional note</Text>
            <TextInput
              autoFocus
              value={val}
              onChangeText={setVal}
              placeholder={isGoing ? 'e.g. might be a little late' : 'e.g. out of town'}
              placeholderTextColor={Colors.textMuted}
              maxLength={60}
              style={styles.rsvpMemoModalInput}
            />
            <View style={styles.rsvpMemoModalBtnRow}>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.rsvpMemoModalBtn, styles.rsvpMemoModalBtnGhost]}
                activeOpacity={0.7}
              >
                <Text style={styles.rsvpMemoModalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onConfirm(val.trim())}
                style={[styles.rsvpMemoModalBtn, styles.rsvpMemoModalBtnDone]}
                activeOpacity={0.7}
                accessibilityLabel={`Done, save as ${label}`}
              >
                <Text style={styles.rsvpMemoModalBtnDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.bg },
  errorContainer:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:        { fontSize: 16, fontFamily: Fonts.medium, color: Colors.textMuted },
  safe:             { flex: 1, backgroundColor: Colors.bg },
  groupChipAboveTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginBottom: 10,
    paddingVertical: 4,
    paddingRight: 4,
  },
  groupDot:         { width: 8, height: 8, borderRadius: 4 },
  navGroupName:     { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.medium, flexShrink: 1 },
  navEditActions:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  draftBarBtnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  draftBarBtnSecondaryText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  draftBarBtnPrimary: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftBarBtnPrimaryDisabled: { opacity: 0.45 },
  draftBarBtnPrimaryText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  detailTimeSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    width: '100%',
  },
  detailTimeHeading: { marginBottom: 0 },
  detailAllDayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailAllDayChipText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSub },
  detailAllDayChipTextActive: { color: Colors.text },
  detailAllDayCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailAllDayCheckboxActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  detailEventTimeStack: { width: '100%', gap: 14, marginTop: 4 },
  detailEventTimeLine: { width: '100%' },
  detailEventTimeLineLabel: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  detailEventTimeRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    gap: 6,
  },
  detailEventTimeCell: { minWidth: 0, justifyContent: 'center' },
  detailEventTimeFieldDate: { flexGrow: 3, flexShrink: 1, flexBasis: 0, alignSelf: 'stretch' },
  detailEventTimeFieldTime: { flexGrow: 2, flexShrink: 1, flexBasis: 0, alignSelf: 'stretch' },
  detailEventTimeSegment: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    minHeight: 40,
  },
  detailEventTimeSegmentError: { borderColor: '#EF4444' },
  detailEventTimeSegmentText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  detailTimeError: {
    fontSize: 12,
    color: '#EF4444',
    fontFamily: Fonts.regular,
    marginTop: 6,
  },
  detailDatePickerActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 8 },
  detailDatePickerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
  },
  detailDatePickerBtnText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  detailSaveScopeModalBox: { maxWidth: 400 },
  detailSaveScopeModalActions: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  detailScopeSettingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  detailScopeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  detailScopeRowBorderTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  detailScopeRowSelected: { backgroundColor: Colors.bg },
  detailScopeRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailScopeRadioOuterOn: { borderColor: Colors.accent },
  detailScopeRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },
  detailScopeTextCol: { flex: 1, minWidth: 0 },
  detailScopeTitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  detailScopeSub: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  eventScrollView:  { flex: 1, backgroundColor: Colors.bg },
  eventScrollContent: { flexGrow: 1, backgroundColor: Colors.bg, paddingBottom: 8 },
  eventBlock:       { backgroundColor: 'transparent' },
  eventMainCardWrap:{ marginHorizontal: 20, marginTop: 10, marginBottom: 4 },
  eventMainCard:    { backgroundColor: Colors.surface, borderRadius: Radius['2xl'], overflow: 'hidden' },
  eventScrollInset: { marginHorizontal: 20, marginBottom: 4 },
  eventSectionGap:  { marginTop: 14 },
  eventSectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  eventTogglePad:   { paddingHorizontal: 16 },
  commentsEmptyInsideCard: { paddingVertical: 28, paddingHorizontal: 16, alignItems: 'center', gap: 8 },
  bannerStack:      { paddingHorizontal: 20, paddingTop: 10, gap: 5 },
  bannerInner:      { paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.md },
  bannerAmber:      { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  bannerAmberRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerAmberText:  { flex: 1, fontSize: 13, color: '#92400E', fontFamily: Fonts.regular },
  bannerGray:       { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  bannerGrayText:   { fontSize: 13, color: Colors.textMuted, fontFamily: Fonts.regular },
  photoGallery:     { marginBottom: 0 },
  photoGalleryContent: { paddingHorizontal: 20, position: 'relative' },
  photoGridRow:     { flexDirection: 'row', flexWrap: 'wrap' },
  photoModalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.95)', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  photoModalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoModalCloseText: {
    fontSize: 24,
    color: '#fff',
    fontFamily: Fonts.regular,
  },
  photoModalImage: {
    width: '90%',
    height: '80%',
  },
  eventTitle:       { fontSize: 21, fontFamily: Fonts.extraBold, color: Colors.text, lineHeight: 28, marginBottom: 4 },
  eventTitleInput:  {
    width: '100%',
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    paddingHorizontal: 0,
    margin: 0,
    marginBottom: 4,
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontSize: 21,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    lineHeight: 28,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  eventDescInput:   {
    width: '100%',
    minHeight: 88,
    padding: 0,
    margin: 0,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.text,
    lineHeight: 22,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  eventLocationInput: {
    width: '100%',
    paddingVertical: Platform.OS === 'ios' ? 2 : 0,
    paddingHorizontal: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontSize: 14,
    color: Colors.textSub,
    fontFamily: Fonts.regular,
    lineHeight: 20,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  infoIconHit: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationLinkText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: '#2563EB',
    textDecorationLine: 'underline',
    lineHeight: 20,
  },
  locationSuggestionHint: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
  },
  locationSuggestionCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.bg,
  },
  locationSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  locationSuggestionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  locationSuggestionText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSub,
    fontFamily: Fonts.regular,
    lineHeight: 18,
  },
  detailCapacityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  detailCapacityField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 120,
  },
  detailCapacityLabel: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
    minWidth: 28,
  },
  detailCapacityInput: {
    flex: 1,
    minWidth: 48,
    maxWidth: 120,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    fontSize: 14,
    color: Colors.textSub,
    fontFamily: Fonts.regular,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  detailCapacityWaitlistHint: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    marginTop: 6,
  },
  carouselRemoveThumb: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.text,
    borderWidth: 2,
    borderColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventPhotosAddCard: {
    backgroundColor: Colors.bg,
    borderRadius: 16,
    overflow: 'hidden',
  },
  eventPhotosAddCardNested: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  eventPhotosAddBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
  },
  infoText:         {
    fontSize: 14,
    color: Colors.textSub,
    fontFamily: Fonts.regular,
    lineHeight: 20,
    flex: 1,
    ...(Platform.OS === 'android' ? ({ includeFontPadding: false } as const) : null),
  },
  descBox:          { backgroundColor: Colors.bg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 16 },
  descText:         { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, lineHeight: 22 },
  link:             { color: Colors.going, textDecorationLine: 'underline' },
  mentionInComment: { color: Colors.accent, fontFamily: Fonts.semiBold },
  rsvpBtn:          { flex: 1, paddingVertical: 10, borderRadius: Radius.lg, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rsvpBtnText:      { fontSize: 14, fontFamily: Fonts.semiBold },
  holdHint:         { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginBottom: 4, marginTop: 4 },
  capacityHint:     { fontSize: 12, color: '#EF4444', textAlign: 'center', marginBottom: 8, fontFamily: Fonts.medium },
  attendRow:        {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  attendRowBorderTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  attendText:       { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular },
  commentRow:       { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  commentPressable: {
    borderWidth: 0,
    borderRadius: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  commentAdminRemovedRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAdminRemovedOnly: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    fontStyle: 'italic',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  commentBorder:    { borderBottomWidth: 1, borderBottomColor: Colors.border },
  commentActions:   { flexDirection: 'row', alignItems: 'stretch', marginRight: 12, marginVertical: 8, gap: 8 },
  commentActionBtn: { minWidth: 84, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10 },
  commentActionEdit:{ backgroundColor: '#64748B' },
  commentActionReply: { backgroundColor: '#0D9488' },
  commentActionDelete:{ backgroundColor: '#DC2626' },
  replyQuoteStrip: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    marginBottom: 2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg,
  },
  replyQuotePressable: {
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  replyQuoteAuthor: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  replyQuotePreview: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    lineHeight: 18,
  },
  reactionQuickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  reactionQuickBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reactionQuickBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: `${Colors.accent}18`,
  },
  reactionQuickEmoji: { fontSize: 17 },
  reactionChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  reactionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  /** Row wrapper so emoji uses system font (DMSans has no color glyphs → tofu on iOS). */
  reactionChipInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reactionChipCount: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.text },
  commentActionModalRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  commentActionModalCenter: {
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  commentActionSheet: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  commentActionEmojiBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    alignSelf: 'stretch',
  },
  commentActionEmojiQuickPill: {
    flex: 1,
    minWidth: 0,
    borderRadius: 999,
    backgroundColor: Colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
    ...Shadows.sm,
  },
  commentActionEmojiQuickInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentActionEmojiQuickHit: {
    flex: 1,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    borderRadius: 10,
  },
  commentActionEmojiMoreBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  commentActionEmojiMoreInner: {
    position: 'relative',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentActionEmojiMorePlus: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  commentActionEmojiHit: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentActionEmojiHitActive: {
    backgroundColor: Colors.surface,
  },
  commentReactionPickerRoot: {
    flex: 1,
  },
  commentReactionPickerCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  commentReactionPickerCard: {
    width: '100%',
    maxWidth: 340,
    maxHeight: Dimensions.get('window').height * 0.62,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 10,
    ...Shadows.md,
  },
  commentReactionPickerTitle: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  commentReactionPickerScroll: {
    maxHeight: Dimensions.get('window').height * 0.48,
  },
  commentReactionPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 4,
    paddingBottom: 8,
  },
  commentActionPreviewAlign: {
    alignSelf: 'stretch',
    marginBottom: 10,
  },
  commentActionPreviewAlignMine: {
    alignItems: 'flex-end',
  },
  commentActionPreviewBubble: {
    alignSelf: 'stretch',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  commentActionPreviewBubbleMine: {
    maxWidth: '92%',
    alignSelf: 'flex-end',
    backgroundColor: Colors.goingBg,
    borderColor: Colors.goingBorder,
  },
  commentActionPreviewMetaLine: {
    marginBottom: 6,
  },
  commentActionPreviewAuthor: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.going,
  },
  commentActionPreviewMetaMuted: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  commentActionPreviewPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commentActionPreviewBody: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text,
    ...Platform.select({
      web: { fontFamily: Fonts.regular },
      default: {},
    }),
  },
  commentActionMenuCard: {
    alignSelf: 'stretch',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    ...Shadows.md,
  },
  commentActionMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  commentActionMenuRowFirst: {},
  commentActionMenuRowLast: {
    borderBottomWidth: 0,
  },
  commentActionMenuLabel: {
    fontSize: 15,
    letterSpacing: -0.15,
    color: Colors.text,
    ...Platform.select({
      web: { fontFamily: Fonts.regular },
      default: {},
    }),
  },
  commentActionMenuLabelDanger: {
    fontSize: 15,
    letterSpacing: -0.15,
    color: Colors.todayRed,
    ...Platform.select({
      web: { fontFamily: Fonts.semiBold },
      default: { fontWeight: '600' as const },
    }),
  },
  composerReplyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  composerReplyBannerTap: { flex: 1, minWidth: 0 },
  replyScrollFloatingWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 40,
    elevation: 12,
  },
  replyScrollFloatingPill: {
    maxWidth: '92%',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(120, 120, 128, 0.88)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  replyScrollFloatingPillText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: '#fafafa',
    textAlign: 'center',
  },
  composerReplyBannerLabel: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted },
  composerReplyBannerPreview: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.text, marginTop: 2 },
  reactionSheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  reactionSheetBackdrop: {
    flex: 1,
  },
  reactionSheetPanel: {
    backgroundColor: '#2c2c2e',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  reactionSheetGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginBottom: 14,
  },
  reactionSheetTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 16,
    gap: 4,
  },
  reactionSheetTitleText: {
    fontSize: 17,
    fontFamily: Fonts.semiBold,
    color: '#f5f5f7',
    lineHeight: 24,
  },
  reactionSheetTitleEmoji: {
    marginTop: -2,
  },
  reactionSheetTitle: {
    fontSize: 17,
    fontFamily: Fonts.semiBold,
    color: '#f5f5f7',
    marginBottom: 16,
    lineHeight: 24,
  },
  reactionSheetList: { flexGrow: 0 },
  reactionSheetListContent: { paddingBottom: 8 },
  reactionSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  reactionSheetRowFirst: { borderTopWidth: 0 },
  reactionSheetName: {
    flex: 1,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: '#f5f5f7',
  },
  commentActionText:{ color: '#fff', fontSize: 12, fontFamily: Fonts.semiBold },
  commentName:      { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.text },
  commentTime:      { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular },
  commentText:      { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, lineHeight: 20 },
  inputBar:         { backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, padding: 10, paddingHorizontal: 16 },
  photoBtn:         { width: 36, height: 36, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  /** Shared field chrome; use with `flex:1` (composer) or sizing on multiline inline edit. */
  commentInputField: {
    padding: 9,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
  },
  commentInput: { flex: 1 },
  commentInlineEditPhotoStrip: {
    flexGrow: 0,
    marginBottom: 6,
    paddingTop: 2,
    maxHeight: 72,
  },
  commentInlineEditPhotoStripContent: {
    gap: 6,
    flexDirection: 'row',
    paddingRight: 4,
    alignItems: 'center',
  },
  commentInlineEditPhotoWrap: { position: 'relative' },
  /** Column: bordered field, then toolbar (never overlap web textarea). */
  commentInlineEditBlock: {
    flexDirection: 'column',
    alignSelf: 'stretch',
    width: '100%',
  },
  commentInlineEditInput: {
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 72,
    maxHeight: 160,
    paddingTop: 10,
    marginTop: 0,
  },
  /** Width only; height comes from composerFieldHeight + onContentSizeChange. */
  commentComposerInput: { flex: 1, minWidth: 120, maxHeight: COMPOSER_INPUT_MAX_H },
  commentInlineEditToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
    alignSelf: 'stretch',
  },
  commentInlineEditCancel: { paddingVertical: 9, paddingHorizontal: 4 },
  commentInlineEditCancelText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.textSub },
  postBtn:          { paddingHorizontal: 18, paddingVertical: 9, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  postBtnDisabled:  { backgroundColor: Colors.border },
  postBtnText:      { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  pendingPhotoHit:  { borderRadius: Radius.lg, overflow: 'hidden' },
  pendingPhoto:     { width: 64, height: 64, borderRadius: Radius.lg },
  pendingPhotoRemove:{ position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.text, borderWidth: 2, borderColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  pendingPreviewClose: { position: 'absolute', top: 56, right: 16, zIndex: 2 },
  lightbox:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', justifyContent: 'center', alignItems: 'center' },
  lightboxHeader:   { position: 'absolute', top: 60, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  lightboxName:     { fontSize: 13, fontFamily: Fonts.semiBold, color: '#fff' },
  lightboxTime:     { fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: Fonts.regular },
  lightboxBtn:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.lg, backgroundColor: 'rgba(255,255,255,0.14)' },
  lightboxImg:      { width: '100%', height: '70%' },
  lightboxNavBtn: {
    position: 'absolute',
    top: '42%',
    zIndex: 2,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxNavBtnDisabled: { opacity: 0.28 },
  lightboxNavPrev: { left: 10 },
  lightboxNavNext: { right: 10 },
  lightboxCounter: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: 'rgba(255,255,255,0.75)',
  },
  sheetTitle:       { fontSize: 17, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 14 },
  attendSection:    { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  attendRsvpRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  attendName:       { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
  attendMemo:       { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
  attendDarkSection: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: 'rgba(255,255,255,0.48)',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 6,
  },
  attendDarkRsvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  attendDarkName: { fontSize: 14, fontFamily: Fonts.medium, color: '#f5f5f7' },
  attendDarkNameFaded: { color: 'rgba(245,245,247,0.45)' },
  attendDarkNameMuted: { fontSize: 14, fontFamily: Fonts.medium, color: 'rgba(245,245,247,0.42)' },
  attendDarkMemo: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: Fonts.regular },
  rsvpMemoModalTitle: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  rsvpMemoModalHint: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 10,
  },
  rsvpMemoModalInput: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text,
    fontFamily: Fonts.regular,
    marginBottom: 12,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  rsvpMemoModalBtnRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  rsvpMemoModalBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  rsvpMemoModalBtnGhost: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  rsvpMemoModalBtnGhostText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.textSub,
  },
  rsvpMemoModalBtnDone: {
    backgroundColor: Colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderStrong,
  },
  rsvpMemoModalBtnDoneText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
  rsvpMemoModalRoot: { flex: 1 },
  rsvpMemoModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  rsvpMemoModalCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  rsvpMemoModalCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: Radius.xl,
    padding: 16,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    ...Shadows.md,
  },
  memoOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  memoPopup:        { backgroundColor: Colors.surface, borderRadius: Radius['2xl'], padding: 20, width: '100%', maxWidth: 300, ...Shadows.lg },
  memoTextBox:      { backgroundColor: Colors.bg, borderRadius: Radius.lg, padding: 12 },
  memoText:         { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, lineHeight: 22 },
  deleteOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  deleteBox:        { backgroundColor: Colors.surface, borderRadius: Radius['2xl'], padding: 24, width: '100%', maxWidth: 320, ...Shadows.lg },
  deleteTitle:      { fontSize: 18, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 8 },
  deleteMessage:    { fontSize: 14, color: Colors.textSub, fontFamily: Fonts.regular, lineHeight: 20, marginBottom: 20 },
  deleteActions:    { flexDirection: 'row', gap: 12 },
  deleteCancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  deleteCancelText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  deleteConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: '#EF4444', alignItems: 'center' },
  deleteConfirmText:{ fontSize: 14, fontFamily: Fonts.semiBold, color: '#fff' },
  smallActionBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  smallActionBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: '#fff' },
  activitiesSection: {
    marginTop: 22,
    paddingTop: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginBottom: 4,
  },
});
