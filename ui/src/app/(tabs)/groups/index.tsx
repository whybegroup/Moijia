import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
} from '../../../hooks/api';
import { useCurrentUserContext } from '../../../contexts/CurrentUserContext';
import Svg, { Path } from 'react-native-svg';
import { GroupAvatar } from '../../../components/GroupAvatar';
import { NotificationsPanelModal } from '../../../components/NotificationsPanelModal';
import { GroupsPeopleGlyph } from '../../../components/TabScreenIcons';
import { CreateOrJoinButton } from '../../../components/CreateOrJoinButton';

export default function GroupsScreen() {
  const router = useRouter();
  const { userId: currentUserId } = useCurrentUserContext();
  const [showNotifs, setShowNotifs] = useState(false);

  const { data: allGroups = [] } = useGroups(currentUserId ?? '', true);
  const recoverGroup = useRecoverGroup(currentUserId ?? '');
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
        <Text style={styles.sectionLabel}>My groups</Text>
        {groups.length === 0 ? (
          <View style={styles.myEmpty}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} style={styles.emptyGlyph} />
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptyDesc}>Create a group or join with an invite code.</Text>
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
                <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Deactivated</Text>
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
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
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
  groupMeta: { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
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
  deletedRow: { backgroundColor: 'rgba(0,0,0,0.03)' },
  recoverBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: Colors.going },
  recoverBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: '#fff' },
});
