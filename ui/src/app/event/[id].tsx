import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Image, Modal, Linking, Alert, FlatList,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Colors, Fonts, Radius, Shadows } from '../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, fmtTime, fmtDateFull, timeAgo, dDiff } from '../../utils/helpers';
import { Avatar, AvatarStack, Sheet } from '../../components/ui';
import { useEvent, useGroup, useUsers, useCreateOrUpdateRSVP, useCreateComment, useGroupMemberColor } from '../../hooks/api';
import { uid, getNoResponseIds } from '../../utils/api-helpers';
import type { EventDetailed, User, Group, RSVP } from '@boltup/client';
import { RSVPInput } from '@boltup/client';

const ME_ID = 'u1';

// ── Photo Carousel ───────────────────────────────────────────────────────────
function PhotoCarousel({ photos, onPhotoPress }: { photos: string[]; onPhotoPress: (url: string) => void }) {
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
          <Image
            source={{ uri: item }}
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

function CommentPhotoGallery({ photos, onPhotoPress }: { photos: string[]; onPhotoPress: (url: string) => void }) {
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
          <Image
            source={{ uri: photo }}
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

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();

  const eventId = Array.isArray(id) ? id[0] : id;

  const { data: ev, isLoading: eventLoading } = useEvent(eventId || '');
  const { data: group, isLoading: groupLoading } = useGroup(ev?.groupId || '');
  const { data: allUsers = [] } = useUsers();
  const { data: memberColorData } = useGroupMemberColor(ev?.groupId || '', ME_ID);
  const createOrUpdateRSVPMutation = useCreateOrUpdateRSVP(eventId || '');
  const createCommentMutation = useCreateComment(eventId || '');

  const [showAttend,  setShowAttend]  = useState(false);
  const [memoFor,     setMemoFor]     = useState<RSVPInput.status | null>(null);
  const [input,       setInput]       = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [lightbox,    setLightbox]    = useState<{ url: string; name: string; ts: Date } | null>(null);
  const scrollRef = useRef<ScrollView>(null);

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
          ? ['https://placehold.co/400x300/FFF0F6/B5245E/png?text=📸']
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
      handle: '',
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
  const maybe   = rsvps.filter(r => r.status === 'maybe');
  const myRsvp  = rsvps.find(r => r.userId === ME_ID);
  const evStart = typeof ev.start === 'string' ? new Date(ev.start) : ev.start;
  const diff    = dDiff(evStart);
  const isPast  = diff < 0;
  const needsMore = (ev.minAttendees || 0) > 0 && going.length < (ev.minAttendees || 0) && !isPast;
  const hoursLeft = Math.max(0, Math.floor((evStart.getTime() - Date.now()) / 3600000));
  const allPhotos = comments.flatMap(c => {
    const ts = typeof c.createdAt === 'string' ? new Date(c.createdAt) : c.createdAt;
    return (c.photos || []).map(url => ({ url, name: 'Unknown', ts }));
  });
  
  const canEdit = ev.createdBy === ME_ID || 
                  group.superAdminId === ME_ID || 
                  group.adminIds.includes(ME_ID);

  const applyRsvp = async (status: RSVPInput.status, memo?: string) => {
    if (!ev) return;
    try {
      await createOrUpdateRSVPMutation.mutateAsync({
        userId: ME_ID,
        status: status,
        memo: memo ?? '',
      });
    } catch (error) {
      console.error('Failed to update RSVP:', error);
      Alert.alert('Error', 'Failed to update RSVP');
    }
  };

  const pickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ 
      allowsMultipleSelection: true, 
      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
      quality: 0.8,
      base64: true,
    });
    
    if (!result.canceled) {
      const uris = result.assets.map(asset => {
        // On web, convert to base64 data URI for persistence
        if (asset.base64 && asset.uri.startsWith('blob:')) {
          return `data:image/jpeg;base64,${asset.base64}`;
        }
        return asset.uri;
      });
      setPendingPhotos(p => [...p, ...uris]);
    }
  };

  const postComment = async () => {
    if (!input.trim() && !pendingPhotos.length) return;
    try {
      const newComment: any = {
        id: uid(),
        userId: ME_ID,
        photos: [...pendingPhotos],
      };
      
      if (input.trim()) {
        newComment.text = input.trim();
      }
      
      await createCommentMutation.mutateAsync(newComment);
      
      setInput(''); setPendingPhotos([]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (error: any) {
      console.error('Failed to post comment:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      Alert.alert('Error', error?.body?.message || error?.message || 'Failed to post comment');
    }
  };

  const savePhoto = async (url: string) => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status === 'granted') {
      await MediaLibrary.saveToLibraryAsync(url);
      Alert.alert('Saved', 'Photo saved to your library.');
    }
  };

  const attendLabel = [
    going.length > 0     && `${going.length} Going`,
    maybe.length > 0     && `${maybe.length} Maybe`,
    notGoing.length > 0  && `${notGoing.length} Not Attending`,
  ].filter(Boolean).join(' · ');


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
        {canEdit && (
          <TouchableOpacity
            onPress={() => router.push(`/event/edit/${id}`)}
            style={styles.navEditBtn}
          >
            <Text style={styles.navEditText}>Edit</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity 
          style={styles.navGroup}
          onPress={() => router.push(`/group/${ev.groupId}`)}
          activeOpacity={0.7}
        >
          <View style={[styles.groupDot, { backgroundColor: p.dot }]} />
          <Text style={styles.navGroupName}>{group?.name}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

        {/* Event block */}
        <View style={styles.eventBlock}>
          {/* Banners */}
          {!isPast && hoursLeft <= 6 && hoursLeft > 0 ? (
            <View style={[styles.banner, styles.bannerAmber]}>
              <Text style={styles.bannerAmberText}>⏰ Starting in <Text style={{ fontFamily: Fonts.bold }}>{hoursLeft}h</Text></Text>
            </View>
          ) : null}
          {isPast ? <View style={[styles.banner, styles.bannerGray]}><Text style={styles.bannerGrayText}>This event has ended</Text></View> : null}
          {needsMore ? (
            <View style={[styles.banner, styles.bannerAmber]}>
              <Text style={styles.bannerAmberText}>⚠️ Need <Text style={{ fontFamily: Fonts.bold }}>{ev.minAttendees! - going.length} more</Text> to confirm</Text>
            </View>
          ) : null}

          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <Text style={styles.eventTitle}>{ev.title}</Text>
            {ev.subtitle ? <Text style={styles.eventSubtitle}>{ev.subtitle}</Text> : null}
          </View>

          {/* Cover photos */}
          {ev.coverPhotos && ev.coverPhotos.length > 0 && (
            <View style={{ marginTop: ev.subtitle ? 0 : 16 }}>
              <PhotoCarousel 
                photos={ev.coverPhotos} 
                onPhotoPress={(url) => setLightbox({ 
                  url, 
                  name: getUserSafe(ev.createdBy).displayName, 
                  ts: new Date(ev.createdAt) 
                })}
              />
            </View>
          )}

          <View style={{ paddingHorizontal: 20 }}>
            {/* Info rows */}
            <View style={{ gap: 8, marginBottom: 16 }}>
              <InfoRow icon="📅">{fmtDateFull(evStart)} · {fmtTime(evStart)} – {fmtTime(typeof ev.end === 'string' ? new Date(ev.end) : ev.end)}</InfoRow>
              {ev.location && <InfoRow icon="📍">{ev.location}</InfoRow>}
              {(ev.minAttendees || 0) > 0 && <InfoRow icon="👥">Min {ev.minAttendees} needed{ev.deadline ? ` · RSVP by ${fmtTime(typeof ev.deadline === 'string' ? new Date(ev.deadline) : ev.deadline)}` : ''}</InfoRow>}
            </View>

            {/* Description */}
            {ev.description ? (
              <View style={styles.descBox}>
                <Text style={styles.descText}><DescText text={ev.description} /></Text>
              </View>
            )}
          </View>

          <View style={{ paddingHorizontal: 20 }}>
            {/* RSVP buttons */}
            {!isPast && (
              <>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                  <RsvpBtn status="going"    active={myRsvp?.status === 'going'}    onPress={() => applyRsvp(RSVPInput.status.GOING)}    onLongPress={() => setMemoFor(RSVPInput.status.GOING)} />
                  {ev.allowMaybe && <RsvpBtn status="maybe"    active={myRsvp?.status === 'maybe'}    onPress={() => applyRsvp(RSVPInput.status.MAYBE)}    onLongPress={() => setMemoFor(RSVPInput.status.MAYBE)} />}
                  <RsvpBtn status="notGoing" active={myRsvp?.status === 'notGoing'} onPress={() => applyRsvp(RSVPInput.status.NOT_GOING)} onLongPress={() => setMemoFor(RSVPInput.status.NOT_GOING)} />
                </View>
                <Text style={styles.holdHint}>Hold to add a note</Text>
              </>
            )}

            {/* Attendance row */}
            <TouchableOpacity onPress={() => setShowAttend(true)} style={styles.attendRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {going.length > 0 && <AvatarStack names={going.map(r => getUserSafe(r.userId).displayName)} size={24} max={5} />}
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
                  <Image source={{ uri: ph.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Comments */}
        <View style={styles.commentsBlock}>
          {comments.length === 0 && (
            <View style={{ padding: 28, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.regular }}>
                {isPast ? 'Share a photo or memory! 📸' : 'No comments yet — be the first!'}
              </Text>
            </View>
          )}
          {comments.map((c, i) => {
            const commentTs = typeof c.createdAt === 'string' ? new Date(c.createdAt) : c.createdAt;
            return (
            <View key={c.id} style={[styles.commentRow, i < comments.length - 1 && styles.commentBorder]}>
              <Avatar name={getUserSafe(c.userId).displayName} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                  <Text style={[styles.commentName, c.userId === ME_ID && { color: Colors.going }]}>{getUserSafe(c.userId).displayName}</Text>
                  <Text style={styles.commentTime}>{timeAgo(commentTs)}</Text>
                </View>
                {!!c.text && <Text style={styles.commentText}>{c.text}</Text>}
                {c.photos.length > 0 && (
                  <View style={{ marginTop: c.text ? 8 : 0 }}>
                    <CommentPhotoGallery 
                      photos={c.photos}
                      onPhotoPress={(url) => setLightbox({ url, name: getUserSafe(c.userId).displayName, ts: commentTs })}
                    />
                  </View>
                )}
              </View>
            </View>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Comment input */}
      <View style={styles.inputBar}>
        {pendingPhotos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 6 }}>
            {pendingPhotos.map((url, i) => (
              <View key={i} style={{ position: 'relative' }}>
                <Image source={{ uri: url }} style={styles.pendingPhoto} />
                <TouchableOpacity onPress={() => setPendingPhotos(p => p.filter((_, j) => j !== i))} style={styles.pendingPhotoRemove}>
                  <Text style={{ fontSize: 9, color: '#fff' }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={pickPhotos} style={styles.photoBtn}>
            <Text style={{ fontSize: 18 }}>📷</Text>
          </TouchableOpacity>
          <TextInput
            value={input} onChangeText={setInput}
            placeholder={isPast ? 'Add a memory or photo…' : 'Add a comment…'}
            placeholderTextColor={Colors.textMuted}
            style={styles.commentInput}
            onSubmitEditing={postComment}
          />
          <TouchableOpacity onPress={postComment} style={[styles.postBtn, !(input.trim() || pendingPhotos.length) && styles.postBtnDisabled]}>
            <Text style={styles.postBtnText}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>

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
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => savePhoto(lightbox.url)} style={styles.lightboxBtn}>
                  <Text style={styles.lightboxBtnText}>↓ Save</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setLightbox(null)} style={styles.lightboxBtn}>
                  <Text style={styles.lightboxBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Image source={{ uri: lightbox.url }} style={styles.lightboxImg} resizeMode="contain" />
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function InfoRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <Text style={{ fontSize: 15, marginTop: 1 }}>{icon}</Text>
      <Text style={styles.infoText}>{children}</Text>
    </View>
  );
}

function RsvpBtn({ status, active, onPress, onLongPress }: { status: string; active: boolean; onPress: () => void; onLongPress: () => void }) {
  const isGoing = status === 'going';
  const isMaybe = status === 'maybe';
  const bg = active ? (isGoing ? Colors.going : isMaybe ? Colors.maybe : Colors.notGoing) : Colors.surface;
  const border = active ? (isGoing ? Colors.going : isMaybe ? Colors.maybe : Colors.notGoing) : Colors.border;
  const label = isGoing ? (active ? '✓ Going' : 'Going') : isMaybe ? 'Maybe' : (active ? '✗ Can\'t go' : 'Can\'t go');
  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} style={[styles.rsvpBtn, { borderColor: border, backgroundColor: bg }]} activeOpacity={0.8}>
      <Text style={[styles.rsvpBtnText, { color: active ? '#fff' : Colors.textSub }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AttendanceSheet({ ev, group, users, visible, onClose }: { ev: EventDetailed; group: Group; users: Record<string, User>; visible: boolean; onClose: () => void }) {
  const [memoPopup, setMemoPopup] = useState<RSVP | null>(null);
  
  const going    = (ev.rsvps || []).filter(r => r.status === 'going');
  const notGoing = (ev.rsvps || []).filter(r => r.status === 'notGoing');
  const maybe    = (ev.rsvps || []).filter(r => r.status === 'maybe');
  const noResponseIds = getNoResponseIds(ev, group);

  const RsvpRow = ({ r, faded }: { r: RSVP; faded?: boolean }) => {
    const user = users[r.userId] || { id: r.userId, name: 'Loading...', displayName: 'Loading...', handle: '' };
    return (
      <TouchableOpacity 
        onPress={() => r.memo ? setMemoPopup(r) : null} 
        style={styles.attendRsvpRow} 
        activeOpacity={r.memo ? 0.7 : 1}
      >
        <Avatar name={user.displayName} size={38} dot={!!r.memo} onPress={r.memo ? () => setMemoPopup(r) : undefined} />
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
              const user = users[uid] || { id: uid, name: 'Loading...', displayName: 'Loading...', handle: '' };
              return (
                <View key={uid} style={styles.attendRsvpRow}>
                  <Avatar name={user.displayName} size={38} />
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

      {memoPopup && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setMemoPopup(null)}>
          <TouchableOpacity style={styles.memoOverlay} onPress={() => setMemoPopup(null)} activeOpacity={1}>
            <View style={styles.memoPopup}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Avatar name={users[memoPopup.userId]?.displayName || 'Unknown'} size={34} />
                <Text style={{ fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text }}>{users[memoPopup.userId]?.displayName || 'Unknown'}</Text>
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
      )}
    </>
  );
}

function MemoSheet({ status, existing, onConfirm, onClose }: { status: RSVPInput.status; existing: string; onConfirm: (m: string) => void; onClose: () => void }) {
  const [val, setVal] = useState(existing || '');
  const isGoing = status === RSVPInput.status.GOING;
  const isMaybe = status === RSVPInput.status.MAYBE;
  const color = isGoing ? Colors.going : isMaybe ? Colors.maybe : Colors.notGoing;
  const label = isGoing ? 'Going' : isMaybe ? 'Maybe' : "Can't go";

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
  navEditBtn:       { marginRight: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.md, backgroundColor: Colors.accent },
  navEditText:      { fontSize: 14, color: Colors.accentFg, fontFamily: Fonts.semiBold },
  navGroup:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupDot:         { width: 8, height: 8, borderRadius: 4 },
  navGroupName:     { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.medium },
  eventBlock:       { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  banner:           { marginHorizontal: 20, marginTop: 14, padding: 9, borderRadius: Radius.lg, marginBottom: 0 },
  bannerAmber:      { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  bannerAmberText:  { fontSize: 13, color: '#92400E', fontFamily: Fonts.regular },
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
  rsvpBtn:          { flex: 1, paddingVertical: 10, borderRadius: Radius.lg, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rsvpBtnText:      { fontSize: 14, fontFamily: Fonts.semiBold },
  holdHint:         { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginBottom: 14, marginTop: 4 },
  attendRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  attendText:       { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular },
  galleryBlock:     { backgroundColor: Colors.surface, marginTop: 8, padding: 16 },
  galleryTitle:     { fontSize: 13, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 12 },
  galleryGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  galleryThumb:     { width: '31.5%', aspectRatio: 1, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.border },
  commentsBlock:    { backgroundColor: Colors.surface, marginTop: 8 },
  commentRow:       { flexDirection: 'row', gap: 12, padding: 14, paddingHorizontal: 20 },
  commentBorder:    { borderBottomWidth: 1, borderBottomColor: Colors.border },
  commentName:      { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.text },
  commentTime:      { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular },
  commentText:      { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, lineHeight: 20 },
  inputBar:         { backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, padding: 10, paddingHorizontal: 16 },
  photoBtn:         { width: 36, height: 36, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  commentInput:     { flex: 1, padding: 9, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  postBtn:          { paddingHorizontal: 18, paddingVertical: 9, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  postBtnDisabled:  { backgroundColor: Colors.border },
  postBtnText:      { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  pendingPhoto:     { width: 64, height: 64, borderRadius: Radius.lg },
  pendingPhotoRemove:{ position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.text, borderWidth: 2, borderColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  lightbox:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', justifyContent: 'center', alignItems: 'center' },
  lightboxHeader:   { position: 'absolute', top: 60, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  lightboxName:     { fontSize: 13, fontFamily: Fonts.semiBold, color: '#fff' },
  lightboxTime:     { fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: Fonts.regular },
  lightboxBtn:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.lg, backgroundColor: 'rgba(255,255,255,0.14)' },
  lightboxBtnText:  { fontSize: 13, fontFamily: Fonts.semiBold, color: '#fff' },
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
});
