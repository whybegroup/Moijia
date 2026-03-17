import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Image, Modal, Pressable, Linking, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Colors, Fonts, Radius, Shadows } from '../../constants/theme';
import { paletteOf, fmtTime, fmtDateFull, timeAgo, dDiff } from '../../utils/helpers';
import { ALL_EVENTS, GROUPS, MY_NAME, type Event, type Rsvp, uid } from '../../data/mock';
import { Avatar, AvatarStack, Sheet } from '../../components/ui';

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

  const initEv = ALL_EVENTS.find(e => e.id === id)!;
  const [ev, setEv] = useState<Event>({ ...initEv });

  // Seed past events with placeholder photos on comments
  const [comments, setComments] = useState(initEv.comments.map((c, i) => ({
    ...c,
    photos: dDiff(initEv.start) < 0 && i < 2
      ? ['https://via.placeholder.com/400x300/FFF0F6/B5245E?text=📸']
      : [] as string[],
  })));

  const [showAttend,  setShowAttend]  = useState(false);
  const [memoFor,     setMemoFor]     = useState<'going' | 'maybe' | 'notGoing' | null>(null);
  const [input,       setInput]       = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [lightbox,    setLightbox]    = useState<{ url: string; name: string; ts: Date } | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const group   = GROUPS.find(g => g.id === ev.groupId);
  const p       = paletteOf(group);
  const going   = ev.rsvps.filter(r => r.status === 'going');
  const notGoing= ev.rsvps.filter(r => r.status === 'notGoing');
  const maybe   = ev.rsvps.filter(r => r.status === 'maybe');
  const myRsvp  = ev.rsvps.find(r => r.name === MY_NAME);
  const diff    = dDiff(ev.start);
  const isPast  = diff < 0;
  const needsMore = ev.minAttendees && going.length < ev.minAttendees && !isPast;
  const hoursLeft = Math.max(0, Math.floor((ev.start.getTime() - Date.now()) / 3600000));
  const allPhotos = comments.flatMap(c => c.photos.map(url => ({ url, name: c.name, ts: c.ts })));

  const applyRsvp = (status: 'going' | 'maybe' | 'notGoing', memo?: string) => {
    setEv(e => {
      const existing = e.rsvps.find(r => r.name === MY_NAME);
      const rest     = e.rsvps.filter(r => r.name !== MY_NAME);
      if (memo === undefined && existing?.status === status) {
        return { ...e, rsvps: rest, noResponse: [...e.noResponse, MY_NAME] };
      }
      return { ...e, rsvps: [...rest, { name: MY_NAME, status, memo: memo ?? '' }], noResponse: e.noResponse.filter(x => x !== MY_NAME) };
    });
  };

  const pickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled) setPendingPhotos(p => [...p, ...result.assets.map(a => a.uri)]);
  };

  const postComment = () => {
    if (!input.trim() && !pendingPhotos.length) return;
    setComments(p => [...p, { id: uid(), name: MY_NAME, text: input.trim(), photos: [...pendingPhotos], ts: new Date() }]);
    setInput(''); setPendingPhotos([]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const savePhoto = async (url: string) => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status === 'granted') {
      await MediaLibrary.saveToLibraryAsync(url);
      Alert.alert('Saved', 'Photo saved to your library.');
    }
  };

  const attendLabel = [
    going.length > 0    && `${going.length} Going`,
    notGoing.length > 0 && `${notGoing.length} Not Attending`,
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
        <View style={styles.navGroup}>
          <View style={[styles.groupDot, { backgroundColor: p.dot }]} />
          <Text style={styles.navGroupName}>{group?.name}</Text>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

        {/* Event block */}
        <View style={styles.eventBlock}>
          {/* Banners */}
          {!isPast && hoursLeft <= 6 && hoursLeft > 0 && (
            <View style={[styles.banner, styles.bannerAmber]}>
              <Text style={styles.bannerAmberText}>⏰ Starting in <Text style={{ fontFamily: Fonts.bold }}>{hoursLeft}h</Text></Text>
            </View>
          )}
          {isPast && <View style={[styles.banner, styles.bannerGray]}><Text style={styles.bannerGrayText}>This event has ended</Text></View>}
          {needsMore && (
            <View style={[styles.banner, styles.bannerAmber]}>
              <Text style={styles.bannerAmberText}>⚠️ Need <Text style={{ fontFamily: Fonts.bold }}>{ev.minAttendees! - going.length} more</Text> to confirm</Text>
            </View>
          )}

          {/* Cover photos */}
          {ev.coverPhotos && ev.coverPhotos.length > 0 && (
            <View style={styles.coverPhotos}>
              {ev.coverPhotos.length === 1
                ? <Image source={{ uri: ev.coverPhotos[0] }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
                : <View style={{ flexDirection: 'row', gap: 2 }}>
                    {ev.coverPhotos.map((url, i) => <Image key={i} source={{ uri: url }} style={{ flex: 1, height: 130 }} resizeMode="cover" />)}
                  </View>
              }
            </View>
          )}

          <View style={{ padding: 20, paddingTop: ev.coverPhotos?.length ? 14 : 20 }}>
            <Text style={styles.eventTitle}>{ev.title}</Text>
            {ev.subtitle && <Text style={styles.eventSubtitle}>{ev.subtitle}</Text>}

            {/* Info rows */}
            <View style={{ gap: 8, marginBottom: 16 }}>
              <InfoRow icon="📅">{fmtDateFull(ev.start)} · {fmtTime(ev.start)} – {fmtTime(ev.end)}</InfoRow>
              {ev.location && <InfoRow icon="📍">{ev.location}</InfoRow>}
              {ev.minAttendees && <InfoRow icon="👥">Min {ev.minAttendees} needed{ev.deadline ? ` · RSVP by ${fmtTime(ev.deadline)}` : ''}</InfoRow>}
              {ev.tags && ev.tags.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                  {ev.tags.map(t => <View key={t} style={[styles.tag, { backgroundColor: p.row, borderColor: p.cal }]}><Text style={[styles.tagText, { color: p.text }]}>#{t}</Text></View>)}
                </View>
              )}
            </View>

            {/* Description */}
            {ev.description && (
              <View style={styles.descBox}>
                <Text style={styles.descText}><DescText text={ev.description} /></Text>
              </View>
            )}

            {/* RSVP buttons */}
            {!isPast && (
              <>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                  <RsvpBtn status="going"    active={myRsvp?.status === 'going'}    onPress={() => applyRsvp('going')}    onLongPress={() => setMemoFor('going')} />
                  {ev.allowMaybe && <RsvpBtn status="maybe"    active={myRsvp?.status === 'maybe'}    onPress={() => applyRsvp('maybe')}    onLongPress={() => setMemoFor('maybe')} />}
                  <RsvpBtn status="notGoing" active={myRsvp?.status === 'notGoing'} onPress={() => applyRsvp('notGoing')} onLongPress={() => setMemoFor('notGoing')} />
                </View>
                <Text style={styles.holdHint}>Hold to add a note</Text>
              </>
            )}

            {/* Attendance row */}
            <TouchableOpacity onPress={() => setShowAttend(true)} style={styles.attendRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {going.length > 0 && <AvatarStack names={going.map(r => r.name)} size={24} max={5} />}
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
          {comments.map((c, i) => (
            <View key={c.id} style={[styles.commentRow, i < comments.length - 1 && styles.commentBorder]}>
              <Avatar name={c.name} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                  <Text style={[styles.commentName, c.name === MY_NAME && { color: Colors.going }]}>{c.name}</Text>
                  <Text style={styles.commentTime}>{timeAgo(c.ts)}</Text>
                </View>
                {!!c.text && <Text style={styles.commentText}>{c.text}</Text>}
                {c.photos.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: c.text ? 8 : 0 }}>
                    {c.photos.map((url, pi) => (
                      <TouchableOpacity key={pi} onPress={() => setLightbox({ url, name: c.name, ts: c.ts })}
                        style={[styles.commentPhoto, { width: c.photos.length === 1 ? 180 : 96, height: c.photos.length === 1 ? 120 : 96 }]}>
                        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ))}
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
      <AttendanceSheet ev={ev} visible={showAttend} onClose={() => setShowAttend(false)} />

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

function AttendanceSheet({ ev, visible, onClose }: { ev: Event; visible: boolean; onClose: () => void }) {
  const [memoPopup, setMemoPopup] = useState<Rsvp | null>(null);
  const going    = ev.rsvps.filter(r => r.status === 'going');
  const notGoing = ev.rsvps.filter(r => r.status === 'notGoing');
  const maybe    = ev.rsvps.filter(r => r.status === 'maybe');

  const RsvpRow = ({ r, faded }: { r: Rsvp; faded?: boolean }) => (
    <TouchableOpacity onPress={() => r.memo ? setMemoPopup(r) : null} style={styles.attendRsvpRow} activeOpacity={r.memo ? 0.7 : 1}>
      <Avatar name={r.name} size={38} dot={!!r.memo} onPress={r.memo ? () => setMemoPopup(r) : undefined} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.attendName, faded && { color: Colors.textMuted }]}>{r.name}</Text>
        {r.memo && <Text style={styles.attendMemo} numberOfLines={1}>"{r.memo}"</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <>
      <Sheet visible={visible} onClose={onClose}>
        <Text style={styles.sheetTitle}>Attendance</Text>
        {going.length > 0 && (
          <>
            <Text style={styles.attendSection}>GOING · {going.length}</Text>
            {going.map(r => <RsvpRow key={r.name} r={r} />)}
          </>
        )}
        {maybe.length > 0 && (
          <>
            <Text style={styles.attendSection}>MAYBE · {maybe.length}</Text>
            {maybe.map(r => <RsvpRow key={r.name} r={r} />)}
          </>
        )}
        {notGoing.length > 0 && (
          <>
            <Text style={styles.attendSection}>NOT ATTENDING · {notGoing.length}</Text>
            {notGoing.map(r => <RsvpRow key={r.name} r={r} faded />)}
          </>
        )}
        {ev.noResponse.length > 0 && (
          <>
            <Text style={styles.attendSection}>NO RESPONSE · {ev.noResponse.length}</Text>
            {ev.noResponse.map(n => (
              <View key={n} style={styles.attendRsvpRow}>
                <Avatar name={n} size={38} />
                <Text style={[styles.attendName, { color: Colors.textMuted }]}>{n}</Text>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 20 }} />
      </Sheet>

      {memoPopup && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setMemoPopup(null)}>
          <TouchableOpacity style={styles.memoOverlay} onPress={() => setMemoPopup(null)} activeOpacity={1}>
            <View style={styles.memoPopup}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Avatar name={memoPopup.name} size={34} />
                <Text style={{ fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text }}>{memoPopup.name}</Text>
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

function MemoSheet({ status, existing, onConfirm, onClose }: { status: string; existing: string; onConfirm: (m: string) => void; onClose: () => void }) {
  const [val, setVal] = useState(existing || '');
  const isGoing = status === 'going';
  const isMaybe = status === 'maybe';
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
  safe:             { flex: 1, backgroundColor: Colors.bg },
  nav:              { flexDirection: 'row', alignItems: 'center', padding: 13, paddingHorizontal: 20, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  navBack:          { marginRight: 12 },
  navBackText:      { fontSize: 14, color: Colors.textSub, fontFamily: Fonts.medium },
  navGroup:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupDot:         { width: 8, height: 8, borderRadius: 4 },
  navGroupName:     { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.medium },
  eventBlock:       { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  banner:           { marginHorizontal: 20, marginTop: 14, padding: 9, borderRadius: Radius.lg, marginBottom: 0 },
  bannerAmber:      { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  bannerAmberText:  { fontSize: 13, color: '#92400E', fontFamily: Fonts.regular },
  bannerGray:       { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  bannerGrayText:   { fontSize: 13, color: Colors.textMuted, fontFamily: Fonts.regular },
  coverPhotos:      { overflow: 'hidden' },
  eventTitle:       { fontSize: 21, fontFamily: Fonts.extraBold, color: Colors.text, lineHeight: 28, marginBottom: 4 },
  eventSubtitle:    { fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 16 },
  infoText:         { fontSize: 14, color: Colors.textSub, fontFamily: Fonts.regular, lineHeight: 20, flex: 1 },
  tag:              { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  tagText:          { fontSize: 12, fontFamily: Fonts.medium },
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
  commentPhoto:     { borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.border },
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
