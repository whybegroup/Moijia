import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  Platform,
  TextInput,
  ActivityIndicator,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Layout, Radius } from '../../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../../../utils/helpers';
import {
  useGroups,
  useEvents,
  useAllGroupMemberColors,
  useNotifications,
  useRecoverGroup,
  useJoinGroup,
  useLeaveGroup,
  usePublicGroupsInfinite,
} from '../../../hooks/api';
import { useCurrentUserContext } from '../../../contexts/CurrentUserContext';
import Svg, { Path } from 'react-native-svg';
import { GroupAvatar } from '../../../components/GroupAvatar';
import { NotificationsPanelModal } from '../../../components/NotificationsPanelModal';
import { GroupsPeopleGlyph } from '../../../components/TabScreenIcons';
import { CreateOrJoinButton } from '../../../components/CreateOrJoinButton';

/** Web: remove default focus outline on the search field */
const searchInputWebNoFocusRing = {
  outlineWidth: 0,
  outlineStyle: 'none',
} as unknown as TextStyle;

export default function GroupsScreen() {
  const router = useRouter();
  const { userId: currentUserId } = useCurrentUserContext();
  const [query, setQuery] = useState('');
  const [showJoined, setShowJoined] = useState(true);
  const [showNotifs, setShowNotifs] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

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
  const leaveGroup = useLeaveGroup({
    onError: (e: any) => {
      const msg = e?.body?.error ?? e?.message ?? 'Failed to leave group';
      Toast.show({ type: 'error', text1: msg });
    },
  });
  const { data: events = [] } = useEvents({ userId: currentUserId ?? '', groupId: undefined });
  const { data: groupColors = {} } = useAllGroupMemberColors(currentUserId || '');
  const { data: notifs = [], isLoading: notifsLoading } = useNotifications(currentUserId || '');
  const groups = allGroups.filter(
    (g) =>
      g.membershipStatus === 'member' || g.membershipStatus === 'admin' || g.membershipStatus === 'pending'
  );

  const activeGroups = groups.filter((g) => !g.deletedAt);
  const deletedGroups = groups.filter((g) => g.deletedAt);
  const eventEligibleGroupCount = activeGroups.filter(
    (g) => g.membershipStatus === 'member' || g.membershipStatus === 'admin'
  ).length;

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
        <View style={styles.headerTitleRow}>
          <GroupsPeopleGlyph size={22} color={Colors.text} />
          <Text style={styles.title} numberOfLines={1}>
            Groups
          </Text>
        </View>
        <View style={styles.headerActions}>
          <CreateOrJoinButton userId={currentUserId} eventEligibleGroupCount={eventEligibleGroupCount} />
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <View style={styles.searchBar}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={Colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
          </Svg>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search public groups…"
            placeholderTextColor={Colors.textMuted}
            style={[styles.searchBarInput, Platform.OS === 'web' && searchInputWebNoFocusRing]}
            returnKeyType="search"
            underlineColorAndroid="transparent"
            accessibilityLabel="Search public groups"
          />
          {query.length > 0 ? (
            <TouchableOpacity
              onPress={() => {
                setQuery('');
                setDebouncedSearch('');
              }}
              style={styles.searchClearBtn}
              accessibilityLabel="Clear search"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.textMuted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M18 6L6 18M6 6l12 12" />
              </Svg>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.sectionRow, { marginBottom: 10 }]}>
          <Text style={styles.publicSectionLabel}>{debouncedSearch ? `Results for "${debouncedSearch}"` : 'Public groups'}</Text>
          <View style={styles.showJoinedRow}>
            <Text style={styles.showJoinedLabel}>Show joined</Text>
            <Switch
              value={showJoined}
              onValueChange={setShowJoined}
              trackColor={{ false: Colors.border, true: Colors.going }}
              ios_backgroundColor={Colors.border}
              thumbColor={Platform.OS === 'android' ? (showJoined ? '#ffffff' : '#f4f3f4') : undefined}
            />
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
                const isPending = g.membershipStatus === 'pending';
                const isActiveMember = g.membershipStatus === 'member' || g.membershipStatus === 'admin';
                const isJoined = isActiveMember || isPending;
                const leavingThis = leaveGroup.isPending && leaveGroup.variables?.groupId === g.id;
                const joiningThis = joinGroup.isPending && joinGroup.variables?.groupId === g.id;
                const joinNeedsApproval = g.requireApprovalToJoin !== false;
                return (
                  <View key={g.id} style={[styles.publicRow, i < publicResults.length - 1 && styles.rowBorder]}>
                    <TouchableOpacity
                      style={styles.publicRowMain}
                      onPress={() => router.push(`/groups/${g.id}`)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${g.name}`}
                    >
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
                    </TouchableOpacity>
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
                      style={[
                        styles.joinGroupBtn,
                        isActiveMember && styles.joinGroupBtnJoined,
                        isPending && styles.joinGroupBtnPending,
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        {isActiveMember && !leavingThis && (
                          <Ionicons name="checkmark-circle" size={16} color={Colors.textSub} />
                        )}
                        {isPending && !leavingThis && (
                          <Ionicons name="time-outline" size={16} color="#B45309" />
                        )}
                        <Text
                          style={[
                            styles.joinGroupBtnText,
                            isActiveMember && styles.joinGroupBtnTextJoined,
                            isPending && styles.joinGroupBtnTextPending,
                          ]}
                        >
                          {isPending
                            ? leavingThis
                              ? 'Leaving…'
                              : 'Pending'
                            : isActiveMember
                              ? leavingThis
                                ? 'Leaving…'
                                : 'Joined'
                              : joiningThis
                                ? joinNeedsApproval
                                  ? 'Requesting…'
                                  : 'Joining…'
                                : joinNeedsApproval
                                  ? 'Request to join'
                                  : 'Join'}
                        </Text>
                      </View>
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
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} style={styles.emptyGlyph} />
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptyDesc}>Create a group or join a public group above.</Text>
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
                      onPress={() => router.push(`/groups/${g.id}`)}
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
                        onPress={() => router.push(`/groups/${g.id}`)}
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

      <NotificationsPanelModal
        visible={showNotifs}
        onClose={() => setShowNotifs(false)}
        userId={currentUserId || ''}
        notifications={notifs}
        isLoading={notifsLoading}
        groups={allGroups.map((g) => ({ id: g.id, name: g.name }))}
        groupColors={groupColors}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Layout.tabHeaderMinHeight,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  title: { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text, flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  searchBarInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    borderWidth: 0,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
  },
  searchClearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
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
  publicRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  publicRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0 },
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
  joinGroupBtnPending: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  joinGroupBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  joinGroupBtnTextJoined: { color: Colors.textSub },
  joinGroupBtnTextPending: { color: '#B45309' },
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
  emptyGlyph: { marginBottom: 12 },
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
});
