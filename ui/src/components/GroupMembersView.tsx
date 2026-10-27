import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { type Href } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { Ionicons } from '@expo/vector-icons';
import { MembershipRequestAction } from '@moijia/client';
import { Colors, Fonts, Radius, Shadows } from '../constants/theme';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { KeyboardSafeScrollView } from './KeyboardSafeScrollView';
import {
  useGroup,
  useUsers,
  useGroupMembers,
  usePendingRequests,
  useHandleMembershipRequest,
  useRemoveMember,
  useSetMemberRole,
  useSetOwner,
} from '../hooks/api';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { UserAvatar } from './UserAvatar';
import { useMissingGroupRedirect } from '../hooks/useMissingResourceAlert';
import { parseSubscriptionTier, subscriptionRank } from '../utils/subscriptionTiers';

export type GroupMembersViewProps = {
  groupId: string;
};

export function GroupMembersView({ groupId }: GroupMembersViewProps) {
  const router = useRouter();
  const { userId: currentUserId } = useCurrentUserContext();

  const { data: group, isError, error: groupError, refetch: refetchGroup } = useGroup(groupId, currentUserId ?? '');
  const { data: users = [], refetch: refetchUsers } = useUsers();
  const { data: groupMembers = [], refetch: refetchGroupMembers } = useGroupMembers(
    groupId,
    currentUserId ?? '',
    {
      enabled:
        !!group && (group.membershipStatus === 'member' || group.membershipStatus === 'admin'),
    }
  );
  const { data: pendingRequestUsers = [], refetch: refetchPendingRequests } = usePendingRequests(
    groupId,
    currentUserId ?? '',
    {
      enabled: group?.membershipStatus === 'admin',
    }
  );
  const { refreshControl } = usePullToRefresh([
    refetchGroup,
    refetchUsers,
    refetchGroupMembers,
    refetchPendingRequests,
  ]);
  const handleMembershipRequest = useHandleMembershipRequest(groupId, currentUserId ?? '');
  const removeMemberMutation = useRemoveMember(groupId, currentUserId ?? '');
  const setMemberRole = useSetMemberRole(groupId, currentUserId ?? '');
  const setOwner = useSetOwner(groupId, currentUserId ?? '');

  const [memberMenu, setMemberMenu] = useState<{ userId: string } | null>(null);

  const usersMap = useMemo(() => {
    const map: Record<string, (typeof users)[0]> = {};
    users.forEach((u) => {
      map[u.id] = u;
    });
    return map;
  }, [users]);

  const membersMap = useMemo(() => {
    const map: Record<string, (typeof groupMembers)[0]> = {};
    groupMembers.forEach((u) => {
      map[u.id] = u;
    });
    return map;
  }, [groupMembers]);

  const getUser = useCallback(
    (userId: string) =>
      membersMap[userId] ||
      usersMap[userId] || {
        id: userId,
        name: 'Loading...',
        displayName: 'Loading...',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    [membersMap, usersMap]
  );

  useMissingGroupRedirect(isError, groupError, group?.membershipStatus, '/(tabs)/groups');

  useEffect(() => {
    if (group?.membershipStatus === 'pending') {
      router.replace(`/(tabs)/groups/${groupId}` as Href);
    }
  }, [group?.membershipStatus, groupId, router]);

  const approveReq = async (userId: string) => {
    try {
      await handleMembershipRequest.mutateAsync({
        userId,
        action: MembershipRequestAction.action.APPROVE,
      });
    } catch (e: any) {
      const msg = e?.body?.message ?? e?.response?.data?.message ?? e?.message ?? 'Could not approve';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const declineReq = async (userId: string) => {
    try {
      await handleMembershipRequest.mutateAsync({
        userId,
        action: MembershipRequestAction.action.REJECT,
      });
    } catch {
      /* noop */
    }
  };

  const removeMember = async (userId: string) => {
    if (!group || userId === currentUserId || userId === group.ownerId) return;
    setMemberMenu(null);
    try {
      await removeMemberMutation.mutateAsync(userId);
    } catch (e: any) {
      const msg = e?.body?.error ?? e?.response?.data?.error ?? e?.message ?? 'Failed to remove member';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const toggleAdmin = async (userId: string) => {
    if (!group || userId === group.ownerId) return;
    setMemberMenu(null);
    const isCurrentlyAdmin = (group.adminIds ?? []).includes(userId);
    const newRole = isCurrentlyAdmin ? 'member' : 'admin';
    try {
      await setMemberRole.mutateAsync({ memberId: userId, role: newRole });
    } catch (e: any) {
      const msg = e?.body?.error ?? e?.response?.data?.error ?? e?.message ?? 'Failed to update admin';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const transferOwner = async (userId: string) => {
    if (!group || userId === group.ownerId) return;
    setMemberMenu(null);
    try {
      await setOwner.mutateAsync(userId);
    } catch (e: any) {
      const msg = e?.body?.error ?? e?.response?.data?.error ?? e?.message ?? 'Failed to transfer ownership';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  if (!group) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.textSub} />
      </View>
    );
  }

  const ownerId = group.ownerId ?? '';
  const admins = group.adminIds ?? [];
  const isOwner = ownerId === currentUserId;
  const isAdmin = group.membershipStatus === 'admin';
  const canManageMembers = isAdmin || isOwner;
  const visiblePendingMembers = canManageMembers ? pendingRequestUsers : [];
  const ownerMemberIds = ownerId && (group.memberIds ?? []).includes(ownerId) ? [ownerId] : [];
  const adminMemberIds = (group.memberIds ?? []).filter(
    (memberId) => memberId !== ownerId && admins.includes(memberId)
  );
  const regularMemberIds = (group.memberIds ?? []).filter(
    (memberId) => memberId !== ownerId && !admins.includes(memberId)
  );
  const canReceiveOwnership = (userId: string) => {
    const plans = group.memberPlans ?? [];
    const ownerTier = parseSubscriptionTier(plans.find((plan) => plan.userId === ownerId)?.subscriptionTier);
    const targetTier = parseSubscriptionTier(plans.find((plan) => plan.userId === userId)?.subscriptionTier);
    return subscriptionRank(targetTier) >= subscriptionRank(ownerTier);
  };

  return (
    <View style={styles.page}>
      <KeyboardSafeScrollView style={styles.scroll} refreshControl={refreshControl}>
        <View style={styles.content}>
          {[
            { title: 'OWNER', memberIds: ownerMemberIds },
            { title: 'ADMINS', memberIds: adminMemberIds },
            { title: 'MEMBERS', memberIds: regularMemberIds },
          ].map((section) => {
            if (section.memberIds.length === 0) return null;
            return (
              <View key={section.title} style={{ marginBottom: 16 }}>
                <Text style={styles.sectionLabel}>{section.title}</Text>
                <View style={[styles.card, { overflow: 'hidden' }]}>
                  {section.memberIds.map((memberId, i) => {
                    const rowAdmin = admins.includes(memberId);
                    const rowOwner = memberId === ownerId;
                    const isMe = memberId === currentUserId;
                    const u = getUser(memberId);
                    const displayName = u.displayName;
                    if (canManageMembers) {
                      const canAction = !isMe && !rowOwner;
                      return (
                        <TouchableOpacity
                          key={memberId}
                          onPress={() => canAction && setMemberMenu({ userId: memberId })}
                          style={[styles.memberRow, i < section.memberIds.length - 1 && styles.rowBorder]}
                          activeOpacity={canAction ? 0.7 : 1}
                        >
                          <UserAvatar
                            seed={u.displayName || u.name}
                            backgroundColor={[u.avatarSeed]}
                            thumbnail={u.thumbnail}
                            size={38}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.memberName, isMe && styles.memberNameMe]}>
                              {displayName}
                              {isMe ? <Text style={styles.youLabel}> · me</Text> : ''}
                            </Text>
                            <Text style={styles.memberRole}>
                              {rowOwner ? 'Owner' : rowAdmin ? 'Admin' : 'Member'}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {rowOwner && <Ionicons name="star" size={16} color="#CA8A04" />}
                            {!rowOwner && rowAdmin && (
                              <View style={styles.adminBadge}>
                                <Text style={styles.adminBadgeText}>Admin</Text>
                              </View>
                            )}
                            {canAction && <Text style={{ color: Colors.textMuted, fontSize: 16 }}>›</Text>}
                          </View>
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <View
                        key={memberId}
                        style={[styles.memberRow, i < section.memberIds.length - 1 && styles.rowBorder]}
                      >
                        <UserAvatar
                          seed={u.displayName || u.name}
                          backgroundColor={[u.avatarSeed]}
                          thumbnail={u.thumbnail}
                          size={38}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.memberName, isMe && styles.memberNameMe]}>
                            {displayName}
                            {isMe ? <Text style={styles.youLabel}> · me</Text> : ''}
                          </Text>
                          <Text style={styles.memberRole}>
                            {rowOwner ? 'Owner' : rowAdmin ? 'Admin' : 'Member'}
                          </Text>
                        </View>
                        {rowOwner && <Ionicons name="star" size={16} color="#CA8A04" />}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
          {canManageMembers && visiblePendingMembers.length > 0 ? (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.sectionLabel}>
                PENDING REQUESTS · {visiblePendingMembers.length}
              </Text>
              <View style={[styles.card, { overflow: 'hidden' }]}>
                {visiblePendingMembers.map((pendingUser, i) => (
                  <View
                    key={`pending-${pendingUser.id}`}
                    style={[styles.memberRow, i < visiblePendingMembers.length - 1 && styles.rowBorder]}
                  >
                    <UserAvatar
                      seed={pendingUser.displayName || pendingUser.name}
                      backgroundColor={[pendingUser.avatarSeed]}
                      thumbnail={pendingUser.thumbnail}
                      size={38}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{pendingUser.displayName}</Text>
                      <Text style={styles.memberHandle}>{pendingUser.name} · pending</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity onPress={() => approveReq(pendingUser.id)} style={styles.approveBtn}>
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => declineReq(pendingUser.id)} style={styles.declineBtn}>
                        <Text style={styles.declineBtnText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardSafeScrollView>

      {memberMenu && canManageMembers ? (
        <Modal {...edgeToEdgeModalProps} visible transparent animationType="fade" onRequestClose={() => setMemberMenu(null)}>
          <TouchableOpacity style={styles.menuOverlay} onPress={() => setMemberMenu(null)} activeOpacity={1}>
            <View style={styles.menuCard}>
              <View style={styles.menuHeader}>
                <Text style={styles.menuHeaderText} numberOfLines={1}>
                  {getUser(memberMenu.userId).displayName}
                </Text>
              </View>
              {isOwner && admins.includes(memberMenu.userId) && canReceiveOwnership(memberMenu.userId) && (
                <TouchableOpacity
                  onPress={() => transferOwner(memberMenu.userId)}
                  style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: Colors.border }]}
                >
                  <Ionicons name="star" size={20} color="#CA8A04" />
                  <Text style={styles.menuItemText}>Transfer owner</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => toggleAdmin(memberMenu.userId)}
                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: Colors.border }]}
              >
                <Ionicons
                  name={admins.includes(memberMenu.userId) ? 'person-outline' : 'star-outline'}
                  size={20}
                  color={Colors.text}
                />
                <Text style={styles.menuItemText}>
                  {admins.includes(memberMenu.userId) ? 'Remove admin' : 'Make admin'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeMember(memberMenu.userId)} style={styles.menuItem}>
                <Ionicons name="person-remove-outline" size={20} color={Colors.notGoing} />
                <Text style={[styles.menuItemText, { color: Colors.notGoing }]}>Remove from group</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  card: { backgroundColor: Colors.surface, borderRadius: Radius['2xl'], overflow: 'hidden' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  memberName: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
  memberNameMe: { color: Colors.going },
  memberHandle: { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
  youLabel: { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
  memberRole: { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular, marginTop: 1 },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  adminBadgeText: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textSub },
  approveBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.lg, backgroundColor: Colors.going },
  approveBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: '#fff' },
  declineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  declineBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSub },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  menuCard: { backgroundColor: Colors.surface, borderRadius: 16, width: 220, overflow: 'hidden', ...Shadows.lg },
  menuHeader: { padding: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuHeaderText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingHorizontal: 16 },
  menuItemText: { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
});
