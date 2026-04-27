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
import { useRouter, usePathname } from 'expo-router';
import { withReturnTo } from '../../../utils/navigationReturn';
import { Colors, Fonts, Radius } from '../../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../../../utils/helpers';
import {
  useGroups,
  useEvents,
  useAllGroupMemberColors,
  useNotifications,
  useRecoverGroup,
} from '../../../hooks/api';
import { useCurrentUserContext } from '../../../contexts/CurrentUserContext';
import { GroupAvatar } from '../../../components/GroupAvatar';
import { NotificationsPanelModal } from '../../../components/NotificationsPanelModal';
import { GroupsTopHeader } from '../../../components/GroupsTopHeader';
import { GroupsBreadcrumbTrail } from '../../../components/GroupsBreadcrumbTrail';

export default function GroupsScreen() {
  const router = useRouter();
  const pathname = usePathname();
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
      <GroupsTopHeader
        userId={currentUserId}
        eventEligibleGroupCount={eventEligibleGroupCount}
        showNotifs={showNotifs}
        onToggleNotifs={() => setShowNotifs((p) => !p)}
        unreadCount={unread}
      />

      <GroupsBreadcrumbTrail segments={[{ label: 'All Groups' }]} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
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
                  const announcementTrim = (g.announcement ?? '').trim();
                  const evCount = events.filter((e) => {
                    const start = new Date(e.start);
                    return e.groupId === g.id && start >= new Date();
                  }).length;
                  const hasMore = i < activeGroups.length - 1;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => router.push(withReturnTo(`/(tabs)/groups/${g.id}`, pathname))}
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
                        {announcementTrim ? (
                          <View style={styles.groupAnnouncementRow}>
                            <Ionicons name="megaphone-outline" size={14} color={Colors.maybe} style={{ flexShrink: 0 }} />
                            <Text style={styles.groupAnnouncementText} numberOfLines={1} ellipsizeMode="tail">
                              {announcementTrim}
                            </Text>
                          </View>
                        ) : null}
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
                        onPress={() => router.push(withReturnTo(`/(tabs)/groups/${g.id}`, pathname))}
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
    backgroundColor: Colors.bg,
  },
  groupName: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 2 },
  groupMeta: { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
  groupAnnouncementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    minWidth: 0,
  },
  groupAnnouncementText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: '#92400E',
    lineHeight: 18,
  },
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
