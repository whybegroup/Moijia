import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Switch,
  Alert,
  Platform,
  TextInput,
  ActivityIndicator,
  type TextStyle,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../../utils/helpers';
import {
  useGroups,
  useEvents,
  useAllGroupMemberColors,
  useNotifications,
  useUpdateNotification,
  useMarkAllNotificationsRead,
  useRecoverGroup,
  useJoinGroup,
  useJoinByInviteCode,
  useLeaveGroup,
  usePublicGroupsInfinite,
} from '../../hooks/api';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import Svg, { Path } from 'react-native-svg';
import { GroupAvatar } from '../../components/GroupAvatar';
import { GroupsPeopleGlyph } from '../../components/TabScreenIcons';

/** Web: remove default focus outline on the search field */
const searchInputWebNoFocusRing = {
  outlineWidth: 0,
  outlineStyle: 'none',
} as unknown as TextStyle;

export default function GroupsScreen() {
  const router = useRouter();
  const { userId: currentUserId } = useCurrentUserContext();
  const [query, setQuery] = useState('');
  const [code, setCode] = useState('');
  const [showJoined, setShowJoined] = useState(true);
  const [showNotifs, setShowNotifs] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!searchExpanded) return;
    const id = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [searchExpanded]);

  const {
    data: publicPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending: publicListPending,
  } = usePublicGroupsInfinite(currentUserId ?? undefined, debouncedSearch, showJoined);
  const publicResults = publicPages?.pages.flatMap((p) => p.items) ?? [];

  const { data: allGroups = [] } = useGroups(currentUserId ?? '', true);
  const recoverGroup = useRecoverGroup(currentUserId ?? '');
  const joinGroup = useJoinGroup();
  const joinByCode = useJoinByInviteCode();
  const leaveGroup = useLeaveGroup({
    onError: (e: any) => {
      const msg = e?.body?.error ?? e?.message ?? 'Failed to leave group';
      Toast.show({ type: 'error', text1: msg });
    },
  });
  const { data: events = [] } = useEvents({ userId: currentUserId ?? '', groupId: undefined });
  const { data: groupColors = {} } = useAllGroupMemberColors(currentUserId || '');
  const { data: notifs = [] } = useNotifications(currentUserId || '');
  const updateNotification = useUpdateNotification();
  const markAllAsRead = useMarkAllNotificationsRead();

  const groups = allGroups.filter(
    (g) =>
      g.membershipStatus === 'member' || g.membershipStatus === 'admin' || g.membershipStatus === 'pending'
  );

  const activeGroups = groups.filter((g) => !g.deletedAt);
  const deletedGroups = groups.filter((g) => g.deletedAt);

  const handleRecover = async (groupId: string) => {
    try {
      await recoverGroup.mutateAsync(groupId);
    } catch (e: any) {
      const msg = e?.body?.error ?? e?.response?.data?.error ?? e?.message ?? 'Failed to recover group';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const unread = notifs.filter((n) => !n.read).length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleRow}>
            <GroupsPeopleGlyph size={22} color={Colors.text} />
            <Text style={styles.title} numberOfLines={1}>
              Groups
            </Text>
          </View>
          {searchExpanded ? (
            <View style={styles.searchMid}>
              <TextInput
                ref={searchInputRef}
                value={query}
                onChangeText={setQuery}
                placeholder="Search…"
                placeholderTextColor={Colors.textMuted}
                style={[styles.searchInputExpand, Platform.OS === 'web' && searchInputWebNoFocusRing]}
                returnKeyType="search"
                underlineColorAndroid="transparent"
              />
              <TouchableOpacity
                onPress={() => {
                  setQuery('');
                  setDebouncedSearch('');
                  setSearchExpanded(false);
                  searchInputRef.current?.blur();
                }}
                style={styles.searchCloseBtn}
                accessibilityLabel="Close search"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.textMuted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M18 6L6 18M6 6l12 12" />
                </Svg>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.headerMidSpacer} />
          )}
          <View style={styles.headerActions}>
            {!searchExpanded && (
              <TouchableOpacity
                onPress={() => setSearchExpanded(true)}
                style={styles.iconBtn}
                accessibilityLabel="Search public groups"
              >
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={Colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
                </Svg>
                {query.trim().length > 0 && <View style={styles.searchFilterDot} />}
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.push('/create-group')} style={styles.createBtn}>
              <Text style={styles.createBtnText}>+ Group</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowNotifs((p) => !p)}
              style={[styles.iconBtn, showNotifs && { borderColor: Colors.borderStrong, backgroundColor: Colors.bg }]}
            >
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </Svg>
              {unread > 0 && <View style={styles.bellDot} />}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Public: invite + list */}
        <View style={styles.codeCard}>
          <Text style={styles.codeTitle}>Join with invite code</Text>
          <Text style={styles.codeDesc}>Got an invite link or code? Enter it here.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Enter invite code"
              placeholderTextColor={Colors.textMuted}
              style={[styles.codeInput, { flex: 1 }]}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              onPress={() => {
                if (!currentUserId?.trim() || !code.trim()) return;
                joinByCode.mutate(
                  { inviteCode: code.trim(), userId: currentUserId },
                  {
                    onSuccess: (data: { groupName?: string; status?: string }) => {
                      setCode('');
                      const msg =
                        data?.status === 'joined'
                          ? `Joined ${data.groupName || 'the group'}`
                          : `Submitted request to join ${data.groupName || 'the group'}`;
                      Toast.show({ type: 'success', text1: msg });
                    },
                    onError: (e: any) => {
                      const msg = e?.body?.error ?? e?.message ?? 'Invalid invite code';
                      Toast.show({ type: 'error', text1: msg });
                    },
                  }
                );
              }}
              style={[styles.codeJoinBtn, { opacity: code.trim() && currentUserId ? 1 : 0.4 }]}
              disabled={!code.trim() || !currentUserId || joinByCode.isPending}
            >
              <Text style={styles.codeJoinBtnText}>{joinByCode.isPending ? 'Joining…' : 'Join'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.sectionRow, { marginBottom: 10 }]}>
          <Text style={styles.publicSectionLabel}>{debouncedSearch ? `Results for "${debouncedSearch}"` : 'Public groups'}</Text>
          <View style={styles.showJoinedRow}>
            <Text style={styles.showJoinedLabel}>Show joined</Text>
            <Switch value={showJoined} onValueChange={setShowJoined} trackColor={{ false: Colors.border, true: Colors.border }} thumbColor="#E5E5E5" />
          </View>
        </View>
        <View style={styles.card}>
          {publicListPending && publicResults.length === 0 ? (
            <View style={styles.publicLoading}>
              <ActivityIndicator color={Colors.textMuted} />
            </View>
          ) : (
            <>
              {publicResults.map((g, i) => {
                const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
                const p = getGroupColor(userColorHex);
                const isJoined = g.membershipStatus === 'member' || g.membershipStatus === 'admin' || g.membershipStatus === 'pending';
                return (
                  <View key={g.id} style={[styles.publicRow, i < publicResults.length - 1 && styles.rowBorder]}>
                    <View style={[styles.publicGroupIcon, { backgroundColor: p.row, borderColor: p.cal }]}>
                      <GroupAvatar seed={g.avatarSeed} thumbnail={g.thumbnail} name={g.name} size={44} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.groupName}>{g.name}</Text>
                      <Text style={styles.groupDesc} numberOfLines={1}>
                        {g.desc}
                      </Text>
                      <Text style={styles.groupMetaSmall}>{g.memberCount} members</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        if (!currentUserId?.trim()) return;
                        if (isJoined) {
                          leaveGroup.mutate({ groupId: g.id, userId: currentUserId });
                        } else {
                          joinGroup.mutate({ groupId: g.id, userId: currentUserId });
                        }
                      }}
                      disabled={!currentUserId || joinGroup.isPending || leaveGroup.isPending}
                      style={[styles.joinGroupBtn, isJoined && styles.joinGroupBtnJoined]}
                    >
                      <Text style={[styles.joinGroupBtnText, isJoined && styles.joinGroupBtnTextJoined]}>
                        {isJoined
                          ? leaveGroup.isPending && leaveGroup.variables?.groupId === g.id
                            ? 'Leaving…'
                            : 'Joined ✓'
                          : joinGroup.isPending && joinGroup.variables?.groupId === g.id
                            ? 'Joining…'
                            : 'Join'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {publicResults.length === 0 && (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.regular }}>No groups found</Text>
                </View>
              )}
            </>
          )}
        </View>
        {hasNextPage && (
          <TouchableOpacity
            style={[styles.showMoreBtn, isFetchingNextPage && styles.showMoreBtnDisabled]}
            onPress={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            activeOpacity={0.7}
          >
            {isFetchingNextPage ? (
              <ActivityIndicator color={Colors.accent} />
            ) : (
              <Text style={styles.showMoreBtnText}>Show more</Text>
            )}
          </TouchableOpacity>
        )}

        {/* My groups */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>My groups</Text>
        {groups.length === 0 ? (
          <View style={styles.myEmpty}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptyDesc}>Create a group or join a public group above.</Text>
            <TouchableOpacity onPress={() => router.push('/create-group')} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>Create group</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {activeGroups.length > 0 && (
              <View style={styles.card}>
                {activeGroups.map((g, i) => {
                  const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
                  const p = getGroupColor(userColorHex);
                  const evCount = events.filter((e) => {
                    const start = new Date(e.start);
                    return e.groupId === g.id && start >= new Date();
                  }).length;
                  const hasMore = i < activeGroups.length - 1;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => router.push(`/group/${g.id}`)}
                      style={[styles.row, hasMore && styles.rowBorder]}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.groupIconOuter, { backgroundColor: p.cal }]}>
                        <View style={styles.groupIconInner}>
                          <GroupAvatar seed={g.avatarSeed} thumbnail={g.thumbnail} name={g.name} size={44} />
                        </View>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.groupName}>{g.name}</Text>
                        <Text style={styles.groupMeta}>
                          {g.memberCount} members
                          {evCount > 0 ? ` · ${evCount} upcoming events` : ''}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {g.membershipStatus === 'pending' && (
                          <View style={[styles.adminBadge, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                            <Text style={[styles.adminBadgeText, { color: '#B45309' }]}>Pending</Text>
                          </View>
                        )}
                        {g.superAdminId === currentUserId && (
                          <View style={[styles.adminBadge, { backgroundColor: '#FEF9C3', borderColor: '#EAB308' }]}>
                            <Text style={[styles.adminBadgeText, { color: '#854D0E' }]}>Super Admin</Text>
                          </View>
                        )}
                        {g.membershipStatus === 'admin' && g.superAdminId !== currentUserId && (
                          <View style={styles.adminBadge}>
                            <Text style={styles.adminBadgeText}>Admin</Text>
                          </View>
                        )}
                        <Text style={{ color: Colors.textMuted, fontSize: 18 }}>›</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {deletedGroups.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Deactivated</Text>
                <View style={styles.card}>
                  {deletedGroups.map((g, i) => {
                    const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
                    const p = getGroupColor(userColorHex);
                    return (
                      <TouchableOpacity
                        key={g.id}
                        onPress={() => router.push(`/group/${g.id}`)}
                        style={[styles.row, styles.deletedRow, i < deletedGroups.length - 1 && styles.rowBorder]}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.groupIconOuter, { backgroundColor: p.cal, opacity: 0.7 }]}>
                          <View style={styles.groupIconInner}>
                            <GroupAvatar seed={g.avatarSeed} thumbnail={g.thumbnail} name={g.name} size={44} />
                          </View>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.groupName, { color: Colors.textMuted }]}>{g.name}</Text>
                          <Text style={styles.groupMeta}>Deactivated</Text>
                        </View>
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            handleRecover(g.id);
                          }}
                          style={styles.recoverBtn}
                          disabled={recoverGroup.isPending}
                        >
                          <Text style={styles.recoverBtnText}>Recover</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={showNotifs} transparent animationType="fade" onRequestClose={() => setShowNotifs(false)}>
        <View style={styles.notifOverlay}>
          <TouchableOpacity style={styles.notifBackdrop} onPress={() => setShowNotifs(false)} activeOpacity={1} />
          <View style={styles.notifPanel}>
            <View style={styles.notifHeader}>
              <Text style={styles.notifTitle}>Notifications</Text>
              {unread > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    markAllAsRead.mutate(currentUserId);
                  }}
                >
                  <Text style={styles.notifMarkAll}>Mark all read</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {notifs.map((n, i) => {
                const group = allGroups.find((g) => g.id === n.groupId);
                const userColorHex = group ? groupColors[group.id] || getDefaultGroupThemeFromName(group.name) : '#EC4899';
                const p = getGroupColor(userColorHex);
                return (
                  <TouchableOpacity
                    key={n.id}
                    onPress={() => {
                      if (!n.read) {
                        updateNotification.mutate({ id: n.id, read: true });
                      }

                      if (!n.navigable) return;
                      setShowNotifs(false);
                      if (n.dest === 'event' && n.eventId) router.push(`/event/${n.eventId}`);
                      else if (n.dest === 'group' && n.groupId) router.push(`/group/${n.groupId}`);
                    }}
                    style={[
                      styles.notifRow,
                      { backgroundColor: n.read ? 'transparent' : p.row },
                      i < notifs.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border },
                    ]}
                    activeOpacity={n.navigable ? 0.7 : 1}
                  >
                    <View style={[styles.notifIcon, { backgroundColor: n.read ? Colors.bg : p.row, borderColor: n.read ? Colors.border : p.cal }]}>
                      <Text style={{ fontSize: 16 }}>{n.icon}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={{ fontSize: 13, fontFamily: n.read ? Fonts.medium : Fonts.bold, color: Colors.text }} numberOfLines={1}>
                          {n.title}
                        </Text>
                        {!n.read && <View style={styles.unreadDot} />}
                      </View>
                      <Text style={{ fontSize: 12, color: Colors.textSub }} numberOfLines={1}>
                        {n.body}
                      </Text>
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
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  title: { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text, flexShrink: 1 },
  headerMidSpacer: { flex: 1, minWidth: 0 },
  searchMid: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 },
  createBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  createBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchFilterDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  bellDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.notGoing,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  searchInputExpand: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginHorizontal: 2,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    borderRadius: 0,
    backgroundColor: 'transparent',
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
  },
  searchCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  codeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 20,
  },
  codeTitle: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 4 },
  codeDesc: { fontSize: 13, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 12 },
  codeInput: {
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
  codeJoinBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  codeJoinBtnText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  publicSectionLabel: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  showJoinedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  showJoinedLabel: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSub },
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  publicLoading: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  showMoreBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  showMoreBtnDisabled: { opacity: 0.65 },
  showMoreBtnText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  publicRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  publicGroupIcon: {
    width: 44,
    height: 44,
    borderRadius: groupAvatarBorderRadius(44),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupIconOuter: {
    width: 46,
    height: 46,
    borderRadius: groupAvatarBorderRadius(44) + 1,
    padding: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupIconInner: {
    width: 44,
    height: 44,
    borderRadius: groupAvatarBorderRadius(44),
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  groupName: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 2 },
  groupDesc: { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 2 },
  groupMeta: { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
  groupMetaSmall: { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular },
  joinGroupBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
    flexShrink: 0,
  },
  joinGroupBtnJoined: { borderColor: Colors.border, backgroundColor: Colors.surface },
  joinGroupBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  joinGroupBtnTextJoined: { color: Colors.textSub },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  adminBadgeText: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textSub },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  myEmpty: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 24, paddingBottom: 8 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 6 },
  emptyDesc: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  emptyBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  deletedRow: { backgroundColor: 'rgba(0,0,0,0.03)' },
  recoverBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: Colors.going },
  recoverBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: '#fff' },
  notifOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', alignItems: 'flex-end' },
  notifBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  notifPanel: {
    marginTop: 64,
    marginRight: 20,
    width: 320,
    maxWidth: '90%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  notifTitle: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text },
  notifMarkAll: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSub },
  notifRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  notifIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.notGoing },
});
