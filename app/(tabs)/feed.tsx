import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Radius, Spacing } from '../../constants/theme';
import { paletteOf } from '../../utils/helpers';
import { ALL_EVENTS, GROUPS, INIT_NOTIFICATIONS, TAGS, MY_NAME, type Event } from '../../data/mock';
import { ListView } from '../../components/ListView';
import { CalendarView } from '../../components/CalendarView';
import { Pill } from '../../components/ui';
import Svg, { Path } from 'react-native-svg';

export default function FeedScreen() {
  const router = useRouter();
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [filterRsvp,  setFilterRsvp]  = useState<string | null>(null);
  const [filterTags,  setFilterTags]  = useState<string[]>([]);
  const [filterNeeds, setFilterNeeds] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [notifs, setNotifs] = useState(INIT_NOTIFICATIONS);
  const [showNotifs, setShowNotifs] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const unread = notifs.filter(n => !n.read).length;

  const filtered = useMemo(() => ALL_EVENTS.filter(ev => {
    if (filterGroup && ev.groupId !== filterGroup) return false;
    if (filterRsvp === 'going'    && !ev.rsvps.find(r => r.name === MY_NAME && r.status === 'going'))    return false;
    if (filterRsvp === 'notGoing' && !ev.rsvps.find(r => r.name === MY_NAME && r.status === 'notGoing')) return false;
    if (filterRsvp === 'none'     &&  ev.rsvps.find(r => r.name === MY_NAME))                            return false;
    if (filterNeeds && !(ev.minAttendees && ev.rsvps.filter(r => r.status === 'going').length < ev.minAttendees)) return false;
    if (filterTags.length > 0 && !filterTags.some(t => ev.tags?.includes(t))) return false;
    return true;
  }), [filterGroup, filterRsvp, filterTags, filterNeeds, ALL_EVENTS.length]);

  const hasFilters = !!(filterRsvp || filterTags.length || filterNeeds);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {/* User */}
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>J</Text>
            </View>
            <View>
              <Text style={styles.userName}>Jenny</Text>
              <Text style={styles.userHandle}>@jenny.ktown.92</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {/* View toggle */}
            <View style={styles.viewToggle}>
              {([['list','☰'],['calendar','📅']] as const).map(([v, icon]) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.viewBtn, viewMode === v && styles.viewBtnActive]}
                  onPress={() => setViewMode(v)}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, color: viewMode === v ? Colors.text : Colors.textMuted }}>{icon}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Filter */}
            <TouchableOpacity
              onPress={() => setShowFilters(p => !p)}
              style={[styles.iconBtn, hasFilters && styles.iconBtnActive]}
            >
              <Text style={{ fontSize: 14 }}>⚙</Text>
            </TouchableOpacity>

            {/* Create */}
            <TouchableOpacity
              onPress={() => router.push('/create-event')}
              style={styles.createBtn}
            >
              <Text style={styles.createBtnText}>+ Event</Text>
            </TouchableOpacity>

            {/* Bell */}
            <TouchableOpacity
              onPress={() => setShowNotifs(p => !p)}
              style={[styles.iconBtn, showNotifs && { borderColor: Colors.borderStrong, backgroundColor: Colors.bg }]}
            >
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <Path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </Svg>
              {unread > 0 && <View style={styles.bellDot} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Group filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow} contentContainerStyle={{ gap: 6, paddingRight: 20 }}>
          <Pill label="All" selected={!filterGroup} onPress={() => setFilterGroup(null)} />
          {GROUPS.map(g => {
            const p = paletteOf(g);
            return (
              <Pill
                key={g.id}
                label={`${g.emoji} ${g.name}`}
                selected={filterGroup === g.id}
                activeColor={p.dot} activeBg={p.row} activeText={p.text}
                onPress={() => setFilterGroup(x => x === g.id ? null : g.id)}
              />
            );
          })}
        </ScrollView>

        {/* Filter panel */}
        {showFilters && (
          <View style={styles.filterPanel}>
            <Text style={styles.filterSectionLabel}>MY RSVP</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
              {([['going','✓ Going'],['notGoing',"✗ Can't go"],['none','No response']] as const).map(([v, l]) => (
                <Pill key={v} label={l} selected={filterRsvp === v} onPress={() => setFilterRsvp(x => x === v ? null : v)} />
              ))}
              <Pill
                label="⚠️ Needs people"
                selected={filterNeeds}
                onPress={() => setFilterNeeds(p => !p)}
                activeColor="#FDE68A" activeBg="#FFFBEB" activeText="#92400E"
              />
            </ScrollView>
            <Text style={styles.filterSectionLabel}>TAGS</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {TAGS.map(t => (
                <Pill key={t} label={`#${t}`} selected={filterTags.includes(t)}
                  onPress={() => setFilterTags(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])} />
              ))}
            </View>
            {hasFilters && (
              <TouchableOpacity onPress={() => { setFilterRsvp(null); setFilterTags([]); setFilterNeeds(false); }} style={{ marginTop: 10 }}>
                <Text style={{ fontSize: 12, color: Colors.textSub, fontFamily: Fonts.medium }}>Clear all ✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Feed */}
      <View style={styles.feedContent}>
        {filtered.length === 0
          ? <View style={styles.empty}><Text style={{ fontSize: 32, marginBottom: 10 }}>📭</Text><Text style={styles.emptyText}>No events</Text></View>
          : viewMode === 'list'
            ? <ListView events={filtered} onSelect={ev => router.push(`/event/${ev.id}`)} />
            : <CalendarView events={filtered} onSelectEvent={ev => router.push(`/event/${ev.id}`)} />
        }
      </View>

      {/* Notif dropdown - Modal ensures it's always on top */}
      <Modal
        visible={showNotifs}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotifs(false)}
      >
        <View style={styles.notifOverlay}>
          <TouchableOpacity
            style={styles.notifBackdrop}
            onPress={() => setShowNotifs(false)}
            activeOpacity={1}
          />
          <View style={styles.notifPanel}>
            <View style={styles.notifHeader}>
              <Text style={styles.notifTitle}>Notifications</Text>
              {unread > 0 && (
                <TouchableOpacity onPress={() => setNotifs(p => p.map(n => ({ ...n, read: true })))}>
                  <Text style={styles.notifMarkAll}>Mark all read</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {notifs.map((n, i) => {
                const group = GROUPS.find(g => g.id === n.groupId);
                const p = paletteOf(group);
                return (
                  <TouchableOpacity
                    key={n.id}
                    onPress={() => {
                      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                      if (!n.navigable) return;
                      setShowNotifs(false);
                      if (n.dest === 'event' && n.eventId) router.push(`/event/${n.eventId}`);
                      else if (n.dest === 'group' && n.groupId) router.push(`/group/${n.groupId}`);
                    }}
                    style={[styles.notifRow, { backgroundColor: n.read ? 'transparent' : p.row }, i < notifs.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}
                    activeOpacity={n.navigable ? 0.7 : 1}
                  >
                    <View style={[styles.notifIcon, { backgroundColor: n.read ? Colors.bg : p.row, borderColor: n.read ? Colors.border : p.cal }]}>
                      <Text style={{ fontSize: 16 }}>{n.icon}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={{ fontSize: 13, fontFamily: n.read ? Fonts.medium : Fonts.bold, color: Colors.text }} numberOfLines={1}>{n.title}</Text>
                        {!n.read && <View style={styles.unreadDot} />}
                      </View>
                      <Text style={{ fontSize: 12, color: Colors.textSub }} numberOfLines={1}>{n.body}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.bg },
  header:      { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  userRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:      { width: 34, height: 34, borderRadius: 17, backgroundColor: '#74A8E0', alignItems: 'center', justifyContent: 'center' },
  avatarText:  { color: '#fff', fontSize: 14, fontFamily: Fonts.bold },
  userName:    { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text },
  userHandle:  { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
  actions:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewToggle:  { flexDirection: 'row', backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 3, gap: 2 },
  viewBtn:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  viewBtnActive: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  iconBtn:     { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  iconBtnActive:{ backgroundColor: Colors.bg, borderColor: Colors.accent },
  createBtn:   { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.accent },
  createBtnText:{ fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  bellDot:     { position: 'absolute', top: 1, right: 1, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.notGoing, borderWidth: 2, borderColor: Colors.surface },
  pillsRow:    { paddingLeft: 20, paddingBottom: 12 },
  feedContent:   { flex: 1, paddingHorizontal: 16, paddingTop: 14, zIndex: 0 },
  filterPanel: { paddingHorizontal: 20, paddingBottom: 14, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  filterSectionLabel:{ fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, letterSpacing: 0.6, marginBottom: 8 },
  notifOverlay:  { flex: 1, opacity: 1 },
  notifBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)', opacity: 1 },
  notifPanel:    { position: 'absolute', top: 110, right: 16, width: 300, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', opacity: 1, elevation: 999, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },
  notifHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  notifTitle:  { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text },
  notifMarkAll:{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSub },
  notifRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  notifIcon:   { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  unreadDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.notGoing },
  empty:       { alignItems: 'center', paddingTop: 80 },
  emptyText:   { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
});
