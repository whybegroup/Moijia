import React, { useState, useRef, useMemo, useCallback, type ChangeEvent } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Image, Modal, Linking, Alert, FlatList,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Fonts, Radius, Shadows } from '../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, fmtTime, fmtDateFull, timeAgo, dDiff, getMyWaitlistPosition } from '../../utils/helpers';
import { computeMentionUserIdsForPost, type MentionMemberRow } from '../../utils/mentionUtils';
import { Avatar, Sheet } from '../../components/ui';
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
  useGroupMemberColor,
  useDeleteEvent,
  useSetEventWatch,
} from '../../hooks/api';
import { uid, getNoResponseIds } from '../../utils/api-helpers';
import type { CommentInput, EventDetailed, GroupScoped, RSVP, User } from '@moija/client';
import { RSVPInput } from '@moija/client';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { ResolvableImage } from '../../components/ResolvableImage';
import {
  pickImageFromLibrary,
  uploadPickedImageAsset,
  uploadWebImageFile,
  isCancelled,
  type PickedImageAsset,
} from '../../services/pickAndUploadImage';
import { useResolvedImageUrls } from '../../hooks/useResolvedImageUrls';

type PendingCommentPhoto = {
  id: string;
  uri: string;
  /** Local file/asset to upload, or an https URL to attach without uploading */
  pendingUpload: PickedImageAsset | File | string;
};

/** Must match API soft-delete text when an admin removes someone else's comment */
const COMMENT_DELETED_BY_ADMIN_MSG = 'This message was deleted by admin';

// ── Photo Carousel ───────────────────────────────────────────────────────────
function PhotoCarousel({
  photos,
  urlMap,
  onPhotoPress,
}: {
  photos: string[];
  urlMap: Map<string, string>;
  onPhotoPress: (url: string) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const ITEM_WIDTH = Math.min(windowWidth - 40, 400);

  return (
    <FlatList
      data={photos}
      horizontal
      pagingEnabled={false}
      showsHorizontalScrollIndicator={false}
      snapToInterval={ITEM_WIDTH + 12}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
      style={{ marginBottom: 16 }}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => onPhotoPress(item)}
          activeOpacity={0.9}
          style={{ width: ITEM_WIDTH }}
        >
          <ResolvableImage
            storedUrl={item}
            urlMap={urlMap}
            style={{
              width: ITEM_WIDTH,
              height: 240,
              borderRadius: 12,
              backgroundColor: Colors.bg,
              borderWidth: 1,
              borderColor: Colors.border,
            }}
            resizeMode="cover"
          />
        </TouchableOpacity>
      )}
      keyExtractor={(_, index) => index.toString()}
    />
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
  onPhotoPress: (url: string) => void;
}) {
  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -4 }}
      contentContainerStyle={{ paddingHorizontal: 4, gap: COMMENT_PHOTO_GAP, flexDirection: 'row' }}
    >
      {photos.map((photo, index) => (
        <TouchableOpacity
          key={index}
          onPress={() => onPhotoPress(photo)}
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const { userId: currentUserId } = useCurrentUserContext();

  const eventId = Array.isArray(id) ? id[0] : id;

  const { data: ev, isLoading: eventLoading } = useEvent(eventId || '', currentUserId ?? '');
  const { data: group, isLoading: groupLoading } = useGroup(ev?.groupId || '', currentUserId ?? '');
  const { data: allUsers = [] } = useUsers();
  const { data: memberColorData } = useGroupMemberColor(ev?.groupId || '', currentUserId);
  const createOrUpdateRSVPMutation = useCreateOrUpdateRSVP(eventId || '');
  const deleteRSVPMutation = useDeleteRSVP(eventId || '');
  const createCommentMutation = useCreateComment(eventId || '');
  const updateCommentMutation = useUpdateComment(eventId || '');
  const deleteCommentMutation = useDeleteComment(eventId || '');
  const deleteEventMutation = useDeleteEvent(currentUserId ?? '');
  const setWatchMutation = useSetEventWatch(eventId || '', currentUserId ?? undefined);

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
    const e = ev as EventDetailed | undefined;
    if (!e) return [];
    (e.coverPhotos || []).forEach((u) => s.add(u));
    for (const c of e.comments || []) {
      (c.photos || []).forEach((u) => s.add(u));
    }
    return [...s];
  }, [ev]);

  const resolvedImageMap = useResolvedImageUrls(allSourceUrls);

  const [showAttend,  setShowAttend]  = useState(false);
  const [memoFor,     setMemoFor]     = useState<RSVPInput.status | null>(null);
  const [input,       setInput]       = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<PendingCommentPhoto[]>([]);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [showCommentPhotoModal, setShowCommentPhotoModal] = useState(false);
  const [commentPhotoUrl, setCommentPhotoUrl] = useState('');
  const [pendingPreviewLightbox, setPendingPreviewLightbox] = useState<string | null>(null);
  const commentPhotoFileInputRef = useRef<{ click: () => void } | null>(null);
  const [lightbox,    setLightbox]    = useState<{ url: string; name: string; ts: Date } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [commentPostBusy, setCommentPostBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const commentSwipeRefs = useRef<Map<string, React.ElementRef<typeof Swipeable>>>(new Map());

  const closeCommentSwipe = (commentId: string) => {
    const s = commentSwipeRefs.current.get(commentId);
    if (s) {
      requestAnimationFrame(() => s.close());
    }
  };

  const removePendingPhoto = useCallback((p: PendingCommentPhoto) => {
    if (p.uri.startsWith('blob:')) {
      URL.revokeObjectURL(p.uri);
    }
    setPendingPhotos((rows) => rows.filter((x) => x.id !== p.id));
    setPendingPreviewLightbox((open) => (open === p.uri ? null : open));
  }, []);

  const addPendingCommentPhoto = useCallback((previewUri: string, pendingUpload: PickedImageAsset | File) => {
    setPendingPhotos((rows) => [...rows, { id: uid(), uri: previewUri, pendingUpload }]);
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

  const onCommentPhotoButtonPress = useCallback(() => {
    if (!currentUserId) {
      Alert.alert('Sign in', 'You must be signed in to add photos.');
      return;
    }
    if (Platform.OS === 'web') {
      commentPhotoFileInputRef.current?.click();
    } else {
      void pickCommentPhotoNative();
    }
  }, [currentUserId, pickCommentPhotoNative]);

  if (!eventId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Event not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const loading = eventLoading || groupLoading;
  const eventDetailed = ev as EventDetailed | undefined;
  
  const comments = (eventDetailed?.comments || [])
    .map((c, i) => {
      const evStart = new Date(eventDetailed?.start || Date.now());
      return {
        ...c,
        createdAt: new Date(c.createdAt),
        photos: dDiff(evStart) < 0 && i < 2 && (!c.photos || c.photos.length === 0)
          ? ['https://placehold.co/400x300/FFF0F6/B5245E/png?text=Photo']
          : c.photos || [],
      };
    })
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  
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
    return null;
  }

  const userColorHex = memberColorData?.colorHex || getDefaultGroupThemeFromName(group.name);
  const p       = getGroupColor(userColorHex);
  const rsvps   = ev.rsvps || [];
  const going   = rsvps.filter(r => r.status === 'going');
  const notGoing= rsvps.filter(r => r.status === 'notGoing');
  const usersWithMemos = new Set(rsvps.filter(r => r.memo && r.memo.trim()).map(r => r.userId));
  const maybe   = rsvps.filter(r => r.status === 'maybe');
  const waitlist= rsvps.filter(r => r.status === 'waitlist');
  const myRsvp  = rsvps.find(r => r.userId === currentUserId);
  const evStart = typeof ev.start === 'string' ? new Date(ev.start) : ev.start;
  const evEnd = typeof ev.end === 'string' ? new Date(ev.end) : ev.end;
  const isMultiDay = evStart.toDateString() !== evEnd.toDateString();
  const diff    = dDiff(evStart);
  const isPast  = diff < 0;
  const minN = ev.minAttendees || 0;
  const maxN = ev.maxAttendees || 0;
  const needsMore = minN > 0 && going.length < minN && !isPast;
  const spotsLeft = maxN > 0 ? Math.max(0, maxN - going.length) : 0;
  const showLowSpots = maxN > 0 && !isPast && spotsLeft > 0 && spotsLeft <= 5;
  const imWaitlisted = myRsvp?.status === 'waitlist' && !isPast;
  const myWaitlistPos = imWaitlisted ? getMyWaitlistPosition(rsvps, currentUserId) : null;
  const hoursLeft = Math.max(0, Math.floor((evStart.getTime() - Date.now()) / 3600000));
  const allPhotos = comments.flatMap(c => {
    const ts = typeof c.createdAt === 'string' ? new Date(c.createdAt) : c.createdAt;
    return (c.photos || []).map(url => ({ url, name: 'Unknown', ts }));
  });
  
  const canEdit = ev.createdBy === currentUserId || 
                  group.superAdminId === currentUserId || 
                  (group.adminIds ?? []).includes(currentUserId);
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
  
  const maxCapacity = ev.maxAttendees || 0;
  const isAtCapacity = maxCapacity > 0 && going.length >= maxCapacity;
  const canGoGoing = !isAtCapacity || myRsvp?.status === 'going';
  const hasWaitlist = ev.enableWaitlist && maxCapacity > 0;

  const handleDeleteEvent = async () => {
    setShowDeleteConfirm(false);
    try {
      await deleteEventMutation.mutateAsync(eventId || '');
      router.push('/(tabs)/feed');
    } catch {
      Alert.alert('Error', 'Failed to delete event');
    }
  };

  const applyRsvp = async (status: RSVPInput.status, memo?: string) => {
    if (!ev) return;
    
    // Check if trying to RSVP "going" when at capacity - join waitlist instead
    if (status === RSVPInput.status.GOING && !canGoGoing && hasWaitlist) {
      status = RSVPInput.status.WAITLIST;
    }
    
    // If at capacity and no waitlist, don't allow going
    if (status === RSVPInput.status.GOING && !canGoGoing && !hasWaitlist) {
      Alert.alert('Event Full', 'This event has reached maximum capacity.');
      return;
    }
    
    try {
      // If clicking the same status and no memo, toggle it off (delete RSVP)
      // If memo is provided, only update the memo without toggling
      if (myRsvp?.status === status && memo === undefined) {
        await deleteRSVPMutation.mutateAsync(currentUserId);
      } else {
        await createOrUpdateRSVPMutation.mutateAsync({
          userId: currentUserId,
          status: status,
          memo: memo ?? '',
        });
      }
    } catch {
      Alert.alert('Error', 'Failed to update RSVP');
    }
  };

  const handleAddCommentPhoto = () => {
    const url = commentPhotoUrl.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Alert.alert('Invalid URL', 'Please enter a valid image URL (e.g. https://example.com/image.jpg)');
      return;
    }
    setPendingPhotos((p) => [...p, { id: uid(), uri: url, pendingUpload: url }]);
    setCommentPhotoUrl('');
    setShowCommentPhotoModal(false);
  };

  const beginEditComment = (commentId: string, text?: string | null) => {
    const next = (text || '').trim();
    if (!next || next === COMMENT_DELETED_BY_ADMIN_MSG) {
      return;
    }
    closeCommentSwipe(commentId);
    setEditingCommentId(commentId);
    setInput(next);
    setPendingPhotos([]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const handleDeleteComment = (commentId: string) => {
    if (!currentUserId) return;
    closeCommentSwipe(commentId);
    Alert.alert('Delete comment', 'Are you sure you want to delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCommentMutation.mutateAsync({
              commentId,
              input: { actorId: currentUserId },
            });
            if (editingCommentId === commentId) {
              setEditingCommentId(null);
              setInput('');
            }
          } catch (error: any) {
            Alert.alert('Error', error?.body?.message || error?.message || 'Failed to delete comment');
          }
        },
      },
    ]);
  };

  const postComment = async () => {
    if (!input.trim() && !pendingPhotos.length) return;
    if (!currentUserId) {
      Alert.alert('Sign in', 'You must be signed in to comment.');
      return;
    }
    setCommentPostBusy(true);
    try {
      if (editingCommentId) {
        const nextText = input.trim();
        if (!nextText) {
          Alert.alert('Error', 'Comment text cannot be empty');
          return;
        }
        const cid = editingCommentId;
        await updateCommentMutation.mutateAsync({
          commentId: cid,
          input: { actorId: currentUserId, text: nextText },
        });
        closeCommentSwipe(cid);
        setEditingCommentId(null);
        setInput('');
        setPendingPhotos([]);
        return;
      }

      const photoUrls = await Promise.all(
        pendingPhotos.map(async (p) => {
          const src = p.pendingUpload;
          if (typeof src === 'string' && (src.startsWith('http://') || src.startsWith('https://'))) {
            return src;
          }
          if (typeof File !== 'undefined' && src instanceof File) {
            return uploadWebImageFile(currentUserId, src);
          }
          return uploadPickedImageAsset(currentUserId, src as PickedImageAsset);
        }),
      );

      const newComment: CommentInput = {
        id: uid(),
        userId: currentUserId,
        photos: photoUrls,
      };
      if (input.trim()) {
        const trimmed = input.trim();
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

      for (const p of pendingPhotos) {
        if (p.uri.startsWith('blob:')) URL.revokeObjectURL(p.uri);
      }
      setInput('');
      setPendingPhotos([]);
      setEditingCommentId(null);
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
    <SafeAreaView style={styles.safe}>
      {/* Nav */}
      <View style={styles.nav}>
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/feed')}
          style={styles.navBack}
        >
          <Text style={styles.navBackText}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {currentUserId ? (
          <TouchableOpacity
            onPress={toggleEventWatch}
            disabled={setWatchMutation.isPending}
            style={styles.navIconBtn}
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
        {canEdit && (
          <>
            <TouchableOpacity
              onPress={() => router.push(`/event/edit/${id}`)}
              style={styles.navIconBtn}
            >
              <Ionicons name="settings-outline" size={20} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowDeleteConfirm(true)}
              style={styles.navIconBtn}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.text} />
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity 
          style={styles.navGroup}
          onPress={() => router.push(`/groups/${ev.groupId}`)}
          activeOpacity={0.7}
        >
          <View style={[styles.groupDot, { backgroundColor: p.dot }]} />
          <Text style={styles.navGroupName}>{group?.name}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

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

          <View style={{ paddingHorizontal: 20, paddingTop: hasBanners ? 12 : 20 }}>
            <Text style={styles.eventTitle}>{ev.title}</Text>
            {ev.subtitle ? <Text style={styles.eventSubtitle}>{ev.subtitle}</Text> : null}
          </View>

          {/* Cover photos */}
          {ev.coverPhotos && ev.coverPhotos.length > 0 && (
            <View style={{ marginTop: ev.subtitle ? 0 : 16 }}>
              <PhotoCarousel
                photos={ev.coverPhotos}
                urlMap={resolvedImageMap}
                onPhotoPress={(url) =>
                  setLightbox({
                    url,
                    name: getUserSafe(ev.createdBy).displayName,
                    ts: new Date(ev.createdAt),
                  })
                }
              />
            </View>
          )}

          <View style={{ paddingHorizontal: 20 }}>
            {/* Info rows */}
            <View style={{ gap: 8, marginBottom: 16 }}>
              {isMultiDay ? (
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <Ionicons name="calendar-outline" size={20} color={Colors.textSub} style={{ width: 22, marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoText}>
                        {fmtDateFull(evStart)}{ev.isAllDay ? '' : ` · ${fmtTime(evStart)}`}
                      </Text>
                      <Text style={[styles.infoText, { marginTop: 4 }]}>
                        {fmtDateFull(evEnd)}{ev.isAllDay ? '' : ` · ${fmtTime(evEnd)}`}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <InfoRow ionicon="calendar-outline">
                  {fmtDateFull(evStart)}
                  {ev.isAllDay ? ' · All day' : ` · ${fmtTime(evStart)} – ${fmtTime(evEnd)}`}
                </InfoRow>
              )}
              {ev.location && <InfoRow ionicon="location-outline">{ev.location}</InfoRow>}
              {((ev.minAttendees || 0) > 0 || (ev.maxAttendees || 0) > 0) && (
                <InfoRow ionicon="people-outline">
                  {(ev.minAttendees || 0) > 0 && `Min ${ev.minAttendees}`}
                  {(ev.minAttendees || 0) > 0 && (ev.maxAttendees || 0) > 0 && ' · '}
                  {(ev.maxAttendees || 0) > 0 && `Max ${ev.maxAttendees}`}
                  {(ev.maxAttendees || 0) > 0 && ev.enableWaitlist && ' · Waitlist enabled'}
                </InfoRow>
              )}
              <InfoRow ionicon="person-outline">Created by {getUserSafe(ev.createdBy).displayName}</InfoRow>
            </View>

            {/* Description */}
            {ev.description ? (
              <View style={styles.descBox}>
                <Text style={styles.descText}><DescText text={ev.description} /></Text>
              </View>
            ) : null}
          </View>

          <View style={{ paddingHorizontal: 20 }}>
            {/* RSVP buttons */}
            {!isPast && (
              <>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                  <RsvpBtn 
                    status={myRsvp?.status === 'waitlist' ? 'waitlist' : 'going'}
                    active={myRsvp?.status === 'going' || myRsvp?.status === 'waitlist'} 
                    disabled={isAtCapacity && !canGoGoing && !hasWaitlist}
                    isWaitlist={isAtCapacity && !canGoGoing && hasWaitlist}
                    onPress={() => applyRsvp(RSVPInput.status.GOING)} 
                    onLongPress={() => setMemoFor(isAtCapacity && !canGoGoing && hasWaitlist ? RSVPInput.status.WAITLIST : RSVPInput.status.GOING)} 
                  />
                  {ev.allowMaybe && <RsvpBtn status="maybe"    active={myRsvp?.status === 'maybe'}    onPress={() => applyRsvp(RSVPInput.status.MAYBE)}    onLongPress={() => setMemoFor(RSVPInput.status.MAYBE)} />}
                  <RsvpBtn status="notGoing" active={myRsvp?.status === 'notGoing'} onPress={() => applyRsvp(RSVPInput.status.NOT_GOING)} onLongPress={() => setMemoFor(RSVPInput.status.NOT_GOING)} />
                </View>
                {isAtCapacity && !canGoGoing && !hasWaitlist && (
                  <Text style={styles.capacityHint}>Event has reached maximum capacity</Text>
                )}
                <Text style={styles.holdHint}>Hold to add a note</Text>
              </>
            )}

            {/* Attendance row */}
            <TouchableOpacity onPress={() => setShowAttend(true)} style={styles.attendRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {going.length > 0 && (
                  <UserAvatarStack
                    userIds={going.map(r => r.userId)}
                    getUser={getUserSafe}
                    size={24}
                    max={5}
                    dotUserIds={Array.from(usersWithMemos)}
                  />
                )}
                <Text style={styles.attendText}>{attendLabel || 'No responses yet'}</Text>
              </View>
              <Text style={{ color: Colors.textMuted, fontSize: 16 }}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Photo gallery (past events) */}
        {isPast && allPhotos.length > 0 && (
          <View style={styles.galleryBlock}>
            <Text style={styles.galleryTitle}>Photos · {allPhotos.length}</Text>
            <View style={styles.galleryGrid}>
              {allPhotos.map((ph, i) => (
                <TouchableOpacity key={i} onPress={() => setLightbox(ph)} style={styles.galleryThumb}>
                  <ResolvableImage
                    storedUrl={ph.url}
                    urlMap={resolvedImageMap}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Comments */}
        <View style={styles.commentsBlock}>
          {comments.length === 0 && (
            <View style={{ padding: 28, alignItems: 'center', gap: 8 }}>
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
          )}
          {comments.map((c, i) => {
            const commentTs = typeof c.createdAt === 'string' ? new Date(c.createdAt) : c.createdAt;
            const isMine = c.userId === currentUserId;
            const isAdminRemovedOnly = c.text === COMMENT_DELETED_BY_ADMIN_MSG;
            const canDelete = isMine || canModerateComments;
            const canEditOwn = isMine && !!c.text && !isAdminRemovedOnly;
            const hasActions = canDelete || canEditOwn;
            return (
            <Swipeable
              key={c.id}
              ref={(ref) => {
                if (ref) commentSwipeRefs.current.set(c.id, ref);
                else commentSwipeRefs.current.delete(c.id);
              }}
              enabled={hasActions}
              overshootRight={false}
              renderRightActions={() => (
                <View style={styles.commentActions}>
                  {canEditOwn ? (
                    <TouchableOpacity
                      style={[styles.commentActionBtn, styles.commentActionEdit]}
                      onPress={() => beginEditComment(c.id, c.text)}
                    >
                      <Ionicons name="pencil-outline" size={16} color="#fff" />
                      <Text style={styles.commentActionText}>Edit</Text>
                    </TouchableOpacity>
                  ) : null}
                  {canDelete ? (
                    <TouchableOpacity
                      style={[styles.commentActionBtn, styles.commentActionDelete]}
                      onPress={() => handleDeleteComment(c.id)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#fff" />
                      <Text style={styles.commentActionText}>Delete</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            >
              {isAdminRemovedOnly ? (
                <View style={[styles.commentAdminRemovedRow, i < comments.length - 1 && styles.commentBorder]}>
                  <Text style={styles.commentAdminRemovedOnly}>{COMMENT_DELETED_BY_ADMIN_MSG}</Text>
                </View>
              ) : (
                <View style={[styles.commentRow, i < comments.length - 1 && styles.commentBorder]}>
                  <Avatar name={getUserSafe(c.userId).displayName} size={34} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                      <Text style={[styles.commentName, c.userId === currentUserId && { color: Colors.going }]}>{getUserSafe(c.userId).displayName}</Text>
                      <Text style={styles.commentTime}>{timeAgo(commentTs)}</Text>
                    </View>
                    {!!c.text && <CommentMentionText text={c.text} style={styles.commentText} />}
                    {c.photos.length > 0 && (
                      <View style={{ marginTop: c.text ? 8 : 0 }}>
                        <CommentPhotoGallery
                          photos={c.photos}
                          urlMap={resolvedImageMap}
                          onPhotoPress={(url) =>
                            setLightbox({ url, name: getUserSafe(c.userId).displayName, ts: commentTs })
                          }
                        />
                      </View>
                    )}
                  </View>
                </View>
              )}
            </Swipeable>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Comment input */}
      <View style={styles.inputBar}>
        {editingCommentId ? (
          <View style={styles.editingBar}>
            <Text style={styles.editingBarText}>Editing comment</Text>
            <TouchableOpacity
              onPress={() => {
                if (editingCommentId) closeCommentSwipe(editingCommentId);
                setEditingCommentId(null);
                setInput('');
              }}
            >
              <Text style={styles.editingBarCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {pendingPhotos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 6 }}>
            {pendingPhotos.map((p) => (
              <View key={p.id} style={{ position: 'relative' }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setPendingPreviewLightbox(p.uri)}
                  style={styles.pendingPhotoHit}
                >
                  <ResolvableImage storedUrl={p.uri} style={styles.pendingPhoto} resizeMode="cover" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removePendingPhoto(p)} style={styles.pendingPhotoRemove}>
                  <Ionicons name="close" size={11} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
          <TouchableOpacity
            onPress={onCommentPhotoButtonPress}
            onLongPress={() => setShowCommentPhotoModal(true)}
            delayLongPress={350}
            style={styles.photoBtn}
          >
            <Ionicons name="camera-outline" size={20} color={Colors.textSub} />
          </TouchableOpacity>
          <CommentMentionInput
            value={input}
            onChangeText={setInput}
            members={mentionMembersForInput}
            currentUserId={currentUserId}
            placeholder={isPast ? 'Add a memory or photo… (@ to mention)' : 'Add a comment… (@ to mention)'}
            placeholderTextColor={Colors.textMuted}
            style={[styles.commentInput, { flex: 1, minWidth: 120 }]}
            onSubmitEditing={postComment}
          />
          <TouchableOpacity
            onPress={postComment}
            disabled={commentPostBusy || createCommentMutation.isPending}
            style={[
              styles.postBtn,
              (!(input.trim() || pendingPhotos.length) || commentPostBusy || createCommentMutation.isPending) &&
                styles.postBtnDisabled,
            ]}
          >
            <Text style={styles.postBtnText}>{editingCommentId ? 'Save' : 'Post'}</Text>
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
            <ResolvableImage
              storedUrl={pendingPreviewLightbox}
              style={styles.lightboxImg}
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}

      {/* Attendance sheet */}
      <AttendanceSheet ev={ev} group={group} users={users} visible={showAttend} onClose={() => setShowAttend(false)} />

      {/* Memo sheet */}
      {memoFor && (
        <MemoSheet
          status={memoFor}
          existing={myRsvp?.status === memoFor ? myRsvp.memo : ''}
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
                  <Text style={styles.lightboxTime}>{timeAgo(lightbox.ts)}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setLightbox(null)} style={styles.lightboxBtn}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <ResolvableImage
              storedUrl={lightbox.url}
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
              style={[styles.commentInput, { marginTop: 12 }]}
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

      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteBox}>
            <Text style={styles.deleteTitle}>Delete Event</Text>
            <Text style={styles.deleteMessage}>Are you sure you want to delete this event? This action cannot be undone.</Text>
            <View style={styles.deleteActions}>
              <TouchableOpacity onPress={() => setShowDeleteConfirm(false)} style={styles.deleteCancelBtn}>
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteEvent} style={styles.deleteConfirmBtn}>
                <Text style={styles.deleteConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function InfoRow({ ionicon, children }: { ionicon: React.ComponentProps<typeof Ionicons>['name']; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <Ionicons name={ionicon} size={20} color={Colors.textSub} style={{ width: 22, marginTop: 1 }} />
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
        style={styles.attendRsvpRow} 
        activeOpacity={r.memo ? 0.7 : 1}
      >
        <UserAvatar seed={user.displayName || user.name} backgroundColor={[user.avatarSeed]} thumbnail={user.thumbnail} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.attendName, faded && { color: Colors.textMuted }]}>{user.displayName}</Text>
          {r.memo ? <Text style={styles.attendMemo} numberOfLines={1}>"{r.memo}"</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Sheet visible={visible} onClose={onClose}>
        <Text style={styles.sheetTitle}>Attendance</Text>
        {going.length > 0 && (
          <>
            <Text style={styles.attendSection}>GOING · {going.length}</Text>
            {going.map(r => <RsvpRow key={r.userId} r={r} />)}
          </>
        )}
        {waitlist.length > 0 && (
          <>
            <Text style={[styles.attendSection, { color: '#F59E0B' }]}>WAITLIST · {waitlist.length}</Text>
            {waitlist.map(r => <RsvpRow key={r.userId} r={r} />)}
          </>
        )}
        {maybe.length > 0 && (
          <>
            <Text style={styles.attendSection}>MAYBE · {maybe.length}</Text>
            {maybe.map(r => <RsvpRow key={r.userId} r={r} />)}
          </>
        )}
        {notGoing.length > 0 && (
          <>
            <Text style={styles.attendSection}>NOT ATTENDING · {notGoing.length}</Text>
            {notGoing.map(r => <RsvpRow key={r.userId} r={r} faded />)}
          </>
        )}
        {noResponseIds.length > 0 && (
            <>
            <Text style={styles.attendSection}>NO RESPONSE · {noResponseIds.length}</Text>
            {noResponseIds.map(uid => {
              const user = users[uid] || { id: uid, name: 'Loading...', displayName: 'Loading...', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
              return (
                <View key={uid} style={styles.attendRsvpRow}>
                  <UserAvatar seed={user.displayName || user.name} backgroundColor={[user.avatarSeed]} thumbnail={user.thumbnail} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.attendName, { color: Colors.textMuted }]}>{user.displayName}</Text>
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
  const [val, setVal] = useState(existing || '');
  const isGoing = status === RSVPInput.status.GOING;
  const isMaybe = status === RSVPInput.status.MAYBE;
  const isWaitlist = status === RSVPInput.status.WAITLIST;
  const waitlistColor = '#F59E0B';
  const color = isGoing ? Colors.going : isMaybe ? Colors.maybe : isWaitlist ? waitlistColor : Colors.notGoing;
  const label = isGoing ? 'Going' : isMaybe ? 'Maybe' : isWaitlist ? 'Waitlist' : "Can't go";

  return (
    <Sheet visible onClose={onClose}>
      <Text style={styles.sheetTitle}>{label}</Text>
      <Text style={{ fontSize: 13, color: Colors.textMuted, marginBottom: 14, fontFamily: Fonts.regular }}>Add a note (optional)</Text>
      <TextInput
        autoFocus value={val} onChangeText={setVal}
        placeholder={isGoing ? 'e.g. might be a little late!' : "e.g. out of town this weekend"}
        placeholderTextColor={Colors.textMuted}
        maxLength={60}
        style={[styles.commentInput, { marginBottom: 12 }]}
      />
      <TouchableOpacity onPress={() => onConfirm(val.trim())} style={[styles.rsvpBtn, { flex: 0, backgroundColor: color, borderColor: color, paddingVertical: 13, marginBottom: 8 }]}>
        <Text style={[styles.rsvpBtnText, { color: '#fff', fontFamily: Fonts.bold, fontSize: 15 }]}>Confirm — {label}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} style={[styles.rsvpBtn, { flex: 0, borderColor: Colors.border, paddingVertical: 10 }]}>
        <Text style={[styles.rsvpBtnText, { color: Colors.textSub }]}>Cancel</Text>
      </TouchableOpacity>
      <View style={{ height: 20 }} />
    </Sheet>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.bg },
  errorContainer:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:        { fontSize: 16, fontFamily: Fonts.medium, color: Colors.textMuted },
  safe:             { flex: 1, backgroundColor: Colors.bg },
  nav:              { flexDirection: 'row', alignItems: 'center', padding: 13, paddingHorizontal: 20, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  navBack:          { marginRight: 12 },
  navBackText:      { fontSize: 14, color: Colors.textSub, fontFamily: Fonts.medium },
  navIconBtn:       { marginRight: 8, padding: 6 },
  navGroup:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupDot:         { width: 8, height: 8, borderRadius: 4 },
  navGroupName:     { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.medium },
  eventBlock:       { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
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
  eventSubtitle:    { fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 16 },
  infoText:         { fontSize: 14, color: Colors.textSub, fontFamily: Fonts.regular, lineHeight: 20, flex: 1 },
  descBox:          { backgroundColor: Colors.bg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 16 },
  descText:         { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, lineHeight: 22 },
  link:             { color: Colors.going, textDecorationLine: 'underline' },
  mentionInComment: { color: Colors.accent, fontFamily: Fonts.semiBold },
  rsvpBtn:          { flex: 1, paddingVertical: 10, borderRadius: Radius.lg, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rsvpBtnText:      { fontSize: 14, fontFamily: Fonts.semiBold },
  holdHint:         { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginBottom: 14, marginTop: 4 },
  capacityHint:     { fontSize: 12, color: '#EF4444', textAlign: 'center', marginBottom: 8, fontFamily: Fonts.medium },
  attendRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  attendText:       { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular },
  galleryBlock:     { backgroundColor: Colors.surface, marginTop: 8, padding: 16 },
  galleryTitle:     { fontSize: 13, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 12 },
  galleryGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  galleryThumb:     { width: '31.5%', aspectRatio: 1, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.border },
  commentsBlock:    { backgroundColor: Colors.surface, marginTop: 8 },
  commentRow:       { flexDirection: 'row', gap: 12, padding: 14, paddingHorizontal: 20 },
  commentAdminRemovedRow: {
    paddingVertical: 12,
    paddingHorizontal: 20,
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
  commentActionDelete:{ backgroundColor: '#DC2626' },
  commentActionText:{ color: '#fff', fontSize: 12, fontFamily: Fonts.semiBold },
  commentName:      { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.text },
  commentTime:      { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular },
  commentText:      { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, lineHeight: 20 },
  inputBar:         { backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, padding: 10, paddingHorizontal: 16 },
  editingBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: 8, borderRadius: Radius.md, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FCD34D' },
  editingBarText:   { fontSize: 12, color: '#92400E', fontFamily: Fonts.semiBold },
  editingBarCancel: { fontSize: 12, color: '#92400E', fontFamily: Fonts.bold, textDecorationLine: 'underline' },
  photoBtn:         { width: 36, height: 36, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  commentInput:     { flex: 1, padding: 9, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
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
  sheetTitle:       { fontSize: 17, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 14 },
  attendSection:    { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  attendRsvpRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  attendName:       { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
  attendMemo:       { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
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
});
