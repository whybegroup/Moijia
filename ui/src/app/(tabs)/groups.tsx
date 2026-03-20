import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Switch, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../../utils/helpers';
import { useGroups, useEvents, useAllGroupMemberColors, useNotifications, useUpdateNotification, useMarkAllNotificationsRead, useRecoverGroup } from '../../hooks/api';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import Svg, { Path } from 'react-native-svg';
import { GroupAvatar } from '../../components/GroupAvatar';

export default function GroupsScreen() {
  const router = useRouter();
  const { userId: currentUserId } = useCurrentUserContext();
  const { data: allGroups = [], isLoading: groupsLoading } = useGroups(currentUserId ?? '', true);
  const recoverGroup = useRecoverGroup(currentUserId ?? '');
  const { data: events = [], isLoading: eventsLoading } = useEvents({ userId: currentUserId ?? '', groupId: undefined });
  const { data: groupColors = {}, isLoading: colorsLoading } = useAllGroupMemberColors(currentUserId || '');
  const { data: notifs = [], isLoading: notifsLoading } = useNotifications(currentUserId || '');
  const updateNotification = useUpdateNotification();
  const markAllAsRead = useMarkAllNotificationsRead();
  
  const [showNotifs, setShowNotifs] = useState(false);
  
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
  
  const loading = groupsLoading || eventsLoading || colorsLoading;
  const unread = notifs.filter(n => !n.read).length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>My Groups</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push('/create-group')} style={styles.createBtn}>
            <Text style={styles.createBtnText}>+ Group</Text>
          </TouchableOpacity>
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {groups.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptyDesc}>Create a group or join one from Explore</Text>
            <TouchableOpacity 
              onPress={() => router.push('/create-group')} 
              style={styles.emptyBtn}
            >
              <Text style={styles.emptyBtnText}>Create Group</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => router.push('/(tabs)/explore')} 
              style={styles.joinBtn}
            >
              <Text style={styles.joinBtnText}>Join Group</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {activeGroups.length > 0 && (
              <View style={styles.card}>
                {activeGroups.map((g, i) => {
                const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
                const p = getGroupColor(userColorHex);
                const evCount = events.filter(e => {
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
                          onPress={(e) => { e.stopPropagation(); handleRecover(g.id); }}
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

      {/* Notification panel */}
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
                <TouchableOpacity onPress={() => {
                  markAllAsRead.mutate(currentUserId);
                }}>
                  <Text style={styles.notifMarkAll}>Mark all read</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {notifs.map((n, i) => {
                const group = allGroups.find(g => g.id === n.groupId);
                const userColorHex = group ? (groupColors[group.id] || getDefaultGroupThemeFromName(group.name)) : '#EC4899';
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
  safe:           { flex: 1, backgroundColor: Colors.bg },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title:          { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text },
  headerActions:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  createBtn:      { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  createBtnText:  { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  iconBtn:        { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  bellDot:        { position: 'absolute', top: 1, right: 1, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.notGoing, borderWidth: 2, borderColor: Colors.surface },
  card:           { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  row:            { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  rowBorder:      { borderBottomWidth: 1, borderBottomColor: Colors.border },
  groupIconOuter: { width: 46, height: 46, borderRadius: groupAvatarBorderRadius(44) + 1, padding: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  groupIconInner: { width: 44, height: 44, borderRadius: groupAvatarBorderRadius(44), overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  groupName:      { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 2 },
  groupMeta:      { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
  adminBadge:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  adminBadgeText: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textSub },
  emptyState:     { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon:      { fontSize: 64, marginBottom: 16 },
  emptyTitle:     { fontSize: 20, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 8 },
  emptyDesc:      { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  emptyBtn:       { paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  emptyBtnText:   { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  joinBtn:        { marginTop: 12, paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  joinBtnText:    { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  notifOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', alignItems: 'flex-end' },
  notifBackdrop:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  notifPanel:     { marginTop: 64, marginRight: 20, width: 320, maxWidth: '90%', backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  notifHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  notifTitle:     { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text },
  notifMarkAll:   { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSub },
  notifRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  notifIcon:      { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  unreadDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.notGoing },
  showDeletedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  showDeletedLabel: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSub },
  sectionLabel:    { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 10 },
  deletedRow:     { backgroundColor: 'rgba(0,0,0,0.03)' },
  recoverBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: Colors.going },
  recoverBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: '#fff' },
});
