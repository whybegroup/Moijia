import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, ActivityIndicator, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Fonts, Radius, Shadows } from '../../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../../../utils/helpers';
import { NavBar, Toggle } from '../../../components/ui';
import {
  useGroup,
  useUsers,
  useGroupMembers,
  useGroupMemberColor,
  usePendingRequests,
  useHandleMembershipRequest,
  useUpdateGroup,
  useRegenerateInviteCode,
  useJoinGroup,
  useLeaveGroup,
  useSoftDeleteGroup,
  useDeleteGroup,
  useRecoverGroup,
  useRemoveMember,
  useSetMemberRole,
  useSetSuperAdmin,
} from '../../../hooks/api';
import { MembershipRequestAction } from '@moija/client';
import { useCurrentUserContext } from '../../../contexts/CurrentUserContext';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect } from 'react-native-svg';
import { GroupAvatar } from '../../../components/GroupAvatar';
import { AvatarPickerModal } from '../../../components/AvatarPickerModal';
import { UserAvatar } from '../../../components/UserAvatar';
import { deleteManagedUploadFireAndForget } from '../../../services/managedUploadDelete';

const AVATAR_SIZE = 56;

export default function GroupDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const { userId: currentUserId } = useCurrentUserContext();
  
  const groupId = Array.isArray(id) ? id[0] : id;

  if (!groupId) {
    return null;
  }

  const { data: group, isError } = useGroup(groupId, currentUserId ?? '');
  const { data: memberColorData } = useGroupMemberColor(groupId, currentUserId ?? '');
  const { data: users = [] } = useUsers();
  const { data: groupMembers = [] } = useGroupMembers(groupId, currentUserId ?? '', {
    enabled:
      !!group && (group.membershipStatus === 'member' || group.membershipStatus === 'admin'),
  });
  const { data: pendingRequestUsers = [] } = usePendingRequests(groupId, currentUserId ?? '', {
    enabled: group?.membershipStatus === 'admin',
  });
  const handleMembershipRequest = useHandleMembershipRequest(groupId, currentUserId ?? '');
  const removeMemberMutation = useRemoveMember(groupId, currentUserId ?? '');
  const setMemberRole = useSetMemberRole(groupId, currentUserId ?? '');
  const setSuperAdmin = useSetSuperAdmin(groupId, currentUserId ?? '');
  const updateGroup = useUpdateGroup(groupId, currentUserId ?? '');
  const regenerateInviteCodeMutation = useRegenerateInviteCode(groupId, currentUserId ?? '');
  const joinGroup = useJoinGroup();
  const leaveGroupMutation = useLeaveGroup();
  const softDeleteMutation = useSoftDeleteGroup(currentUserId ?? '');
  const hardDeleteMutation = useDeleteGroup(currentUserId ?? '');
  const recoverMutation = useRecoverGroup(currentUserId ?? '');

  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');

  useEffect(() => {
    if (!group) return;
    setDraftName(group.name);
    setDraftDesc(group.desc ?? '');
  }, [group?.id, group?.name, group?.desc]);

  const profileDirty = useMemo(() => {
    if (!group || group.membershipStatus !== 'admin') return false;
    return (
      draftName.trim() !== group.name.trim() ||
      draftDesc.trim() !== (group.desc ?? '').trim()
    );
  }, [group, draftName, draftDesc]);

  useEffect(() => {
    if (isError || (group && group.membershipStatus === 'none' && !group.isPublic)) {
      router.replace('/groups');
    }
  }, [isError, group?.membershipStatus, group?.isPublic, router]);
  const [memberMenu,  setMemberMenu]  = useState<{ userId: string } | null>(null);
  const [showLeave,   setShowLeave]   = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarSeedDraft, setAvatarSeedDraft] = useState('');
  const [avatarThumbnailDraft, setAvatarThumbnailDraft] = useState<string | null>(null);
  const thumbnailAtPickerOpenRef = useRef<string | null>(null);
  useEffect(() => {
    if (showAvatarPicker && group) {
      setAvatarSeedDraft(group.avatarSeed ?? '');
      setAvatarThumbnailDraft(group.thumbnail ?? null);
    }
  }, [showAvatarPicker, group?.avatarSeed, group?.thumbnail]);

  const usersMap = useMemo(() => {
    const map: Record<string, any> = {};
    users.forEach(u => map[u.id] = u);
    return map;
  }, [users]);

  // Prefer groupMembers (includes avatarSeed, thumbnail); fall back to users
  const membersMap = useMemo(() => {
    const map: Record<string, any> = {};
    groupMembers.forEach(u => map[u.id] = u);
    return map;
  }, [groupMembers]);

  const getUser = (userId: string) => {
    return membersMap[userId] || usersMap[userId] || { id: userId, name: 'Loading...', displayName: 'Loading...', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  };

  if (!group) {
    return null;
  }

  const dismissAvatarPicker = () => {
    setShowAvatarPicker(false);
    setAvatarSeedDraft(group.avatarSeed ?? '');
    setAvatarThumbnailDraft(group.thumbnail ?? null);
  };

  const superAdminId = group.superAdminId ?? '';
  const admins = group.adminIds ?? [];
  const isAdmin = group.membershipStatus === 'admin';
  const isSuperAdmin = superAdminId === currentUserId;
  const isPending = group.membershipStatus === 'pending';
  const isSoftDeleted = !!group.deletedAt;

  const handleBack = () => {
    router.replace('/groups');
  };

  const leaveGroup = async () => {
    if (!currentUserId) return;
    try {
      await leaveGroupMutation.mutateAsync({ groupId, userId: currentUserId });
      handleBack();
    } catch (e: any) {
      const msg = e?.body?.error ?? e?.response?.data?.error ?? e?.message ?? 'Failed to leave group';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const doSoftDelete = async () => {
    setShowDeactivateConfirm(false);
    try {
      await softDeleteMutation.mutateAsync(groupId);
      handleBack();
    } catch (e: any) {
      const msg = e?.body?.error ?? e?.response?.data?.error ?? e?.message ?? 'Failed to deactivate';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const doHardDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await hardDeleteMutation.mutateAsync(groupId);
      handleBack();
    } catch (e: any) {
      const msg = e?.body?.error ?? e?.response?.data?.error ?? e?.message ?? 'Failed to delete';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const doRecover = async () => {
    try {
      await recoverMutation.mutateAsync(groupId);
    } catch (e: any) {
      const msg = e?.body?.error ?? e?.response?.data?.error ?? e?.message ?? 'Failed to recover';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const approveReq = async (userId: string) => {
    try {
      await handleMembershipRequest.mutateAsync({
        userId,
        action: MembershipRequestAction.action.APPROVE,
      });
    } catch {
      /* handled by mutation UI if needed */
    }
  };

  const declineReq = async (userId: string) => {
    try {
      await handleMembershipRequest.mutateAsync({
        userId,
        action: MembershipRequestAction.action.REJECT,
      });
    } catch {
      /* handled by mutation UI if needed */
    }
  };

  const removeMember = async (userId: string) => {
    if (userId === currentUserId || userId === superAdminId) return;
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
    if (userId === superAdminId || !group) return;
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

  const transferSuperAdmin = async (userId: string) => {
    if (userId === superAdminId || !group) return;
    setMemberMenu(null);
    try {
      await setSuperAdmin.mutateAsync(userId);
    } catch (e: any) {
      const msg = e?.body?.error ?? e?.response?.data?.error ?? e?.message ?? 'Failed to transfer ownership';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const canSeeInviteCode = group.membershipStatus === 'member' || group.membershipStatus === 'admin';
  const inviteCode = canSeeInviteCode ? (group.inviteCode ?? '').trim() : '';

  const copyInviteCode = async () => {
    await Clipboard.setStringAsync(inviteCode).catch(() => {});
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const confirmRegenerateInviteCode = () => {
    const run = () => {
      regenerateInviteCodeMutation.mutate(undefined, {
        onError: (e: any) => {
          const msg = e?.body?.error ?? e?.message ?? 'Failed to generate a new code';
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert('Error', msg);
        },
      });
    };
    const message =
      'The current invite code will stop working for new joins. Existing members are not affected.';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) run();
    } else {
      Alert.alert('Generate new invite code?', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate', onPress: run },
      ]);
    }
  };

  const resetProfileDrafts = () => {
    setDraftName(group.name);
    setDraftDesc(group.desc ?? '');
  };

  const saveProfileDrafts = async () => {
    const name = draftName.trim();
    if (!name) {
      if (Platform.OS === 'web') window.alert('Group name is required');
      else Alert.alert('Error', 'Group name is required');
      return;
    }
    try {
      await updateGroup.mutateAsync({
        name,
        desc: draftDesc.trim(),
        updatedBy: currentUserId ?? '',
      });
    } catch {
      if (Platform.OS === 'web') window.alert('Failed to save changes');
      else Alert.alert('Error', 'Failed to save changes');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <NavBar
        onBack={handleBack}
        right={
          profileDirty ? (
            <View style={styles.navEditActions}>
              <TouchableOpacity
                onPress={resetProfileDrafts}
                disabled={updateGroup.isPending}
                style={[styles.draftBarBtnSecondary, updateGroup.isPending && { opacity: 0.45 }]}
                activeOpacity={0.8}
              >
                <Text style={styles.draftBarBtnSecondaryText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveProfileDrafts}
                disabled={!draftName.trim() || updateGroup.isPending}
                style={[
                  styles.draftBarBtnPrimary,
                  (!draftName.trim() || updateGroup.isPending) && styles.draftBarBtnPrimaryDisabled,
                ]}
                activeOpacity={0.8}
              >
                {updateGroup.isPending ? (
                  <ActivityIndicator size="small" color={Colors.accentFg} />
                ) : (
                  <Text style={styles.draftBarBtnPrimaryText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : undefined
        }
      />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Group header */}
        <View style={[styles.headerBlock, { borderBottomColor: Colors.border }]}>
          <View style={styles.avatarNameRow}>
            <TouchableOpacity
              onPress={() => {
                if (!isAdmin) return;
                thumbnailAtPickerOpenRef.current = group.thumbnail ?? null;
                setShowAvatarPicker(true);
              }}
              style={[
                styles.groupThumb,
                {
                  backgroundColor: getGroupColor(memberColorData?.colorHex || getDefaultGroupThemeFromName(group.name)).row,
                  borderColor: getGroupColor(memberColorData?.colorHex || getDefaultGroupThemeFromName(group.name)).cal,
                  borderRadius: groupAvatarBorderRadius(AVATAR_SIZE),
                },
              ]}
              activeOpacity={isAdmin ? 0.8 : 1}
              disabled={!isAdmin}
            >
              <GroupAvatar
                seed={group.avatarSeed}
                thumbnail={group.thumbnail}
                name={group.name}
                size={AVATAR_SIZE}
                style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
              />
            </TouchableOpacity>
            <View style={styles.nameFieldWrap}>
              {isAdmin ? (
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  placeholder="Group name"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.nameInput}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              ) : (
                <Text style={[styles.groupName, styles.nameInputSlot]} numberOfLines={1}>
                  {group.name}
                </Text>
              )}
            </View>
          </View>

          {isAdmin ? (
            <TextInput
              value={draftDesc}
              onChangeText={setDraftDesc}
              placeholder="Description"
              placeholderTextColor={Colors.textMuted}
              style={styles.descInputFull}
              multiline
            />
          ) : group.desc ? (
            <Text style={styles.groupDescFull}>{group.desc}</Text>
          ) : null}
          {(!isPending && inviteCode) || (isAdmin || isSuperAdmin) ? (
            <View style={styles.inviteSection}>
              {(isAdmin || isSuperAdmin) && (
                <View style={[styles.inviteRow, styles.inviteToggleRow, { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Toggle
                      value={!group.isPublic}
                      style={{ borderBottomWidth: 1 }}
                      onChange={async (v) => {
                        if (updateGroup.isPending) return;
                        try {
                          await updateGroup.mutateAsync({ isPublic: !v, updatedBy: currentUserId ?? '' });
                        } catch {
                          if (Platform.OS === 'web') window.alert('Failed to update visibility');
                          else Alert.alert('Error', 'Failed to update visibility');
                        }
                      }}
                      label="Private group (invite only)"
                    />
                    <Toggle
                      value={group.requireApprovalToJoin}
                      style={{ borderBottomWidth: 0 }}
                      onChange={async (v) => {
                        if (updateGroup.isPending) return;
                        try {
                          await updateGroup.mutateAsync({
                            requireApprovalToJoin: v,
                            updatedBy: currentUserId ?? '',
                          });
                        } catch {
                          if (Platform.OS === 'web') window.alert('Failed to update join approval setting');
                          else Alert.alert('Error', 'Failed to update join approval setting');
                        }
                      }}
                      label="Require approval to join?"
                    />
                  </View>
                </View>
              )}
              {!isPending && inviteCode && (
                <View style={[styles.inviteRow, (isAdmin || isSuperAdmin) && { borderTopWidth: 0, paddingVertical: 4 }]}>
                  <Text style={styles.inviteLabel}>Invite code</Text>
                  <View style={styles.inviteValueRow}>
                    {(isAdmin || isSuperAdmin) && (
                      <TouchableOpacity
                        onPress={confirmRegenerateInviteCode}
                        disabled={regenerateInviteCodeMutation.isPending || !currentUserId}
                        style={styles.regenerateInviteIconBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="Generate new invite code"
                      >
                        {regenerateInviteCodeMutation.isPending ? (
                          <ActivityIndicator size="small" color={Colors.textMuted} />
                        ) : (
                          <Ionicons name="refresh-outline" size={20} color={Colors.textMuted} />
                        )}
                      </TouchableOpacity>
                    )}
                    <Text style={styles.inviteValue}>{inviteCode}</Text>
                    <TouchableOpacity
                      onPress={copyInviteCode}
                      style={styles.copyIconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <View style={styles.copyIconWrap}>
                        {inviteCopied ? (
                          <Ionicons name="checkmark" size={18} color={Colors.going} />
                        ) : (
                          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <Rect x="9" y="9" width="13" height="13" rx="2" />
                            <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </Svg>
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </View>

        {isPending ? (
          <View style={{ padding: 16, paddingBottom: 100 }}>
            <View style={[styles.card, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB', padding: 24, alignItems: 'center' }]}>
              <Ionicons name="hourglass-outline" size={28} color="#92400E" style={{ marginBottom: 8 }} />
              <Text style={{ fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 8 }}>
                Request pending
              </Text>
              <Text style={{ fontSize: 14, color: Colors.textSub, textAlign: 'center', marginBottom: 16 }}>
                Your request to join {group.name} is pending approval. You'll see events and members once an admin approves.
              </Text>
              <TouchableOpacity onPress={() => setShowLeave(true)}>
                <Text style={{ fontSize: 14, color: Colors.textSub, textDecorationLine: 'underline' }}>Cancel request</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 16 }} />
            <Text style={styles.sectionLabel}>LEAVE</Text>
            <View style={[styles.card, { borderColor: '#FECACA' }]}>
              <TouchableOpacity onPress={() => setShowLeave(true)} style={styles.memberRow} activeOpacity={0.8}>
                <Ionicons name="log-out-outline" size={22} color={Colors.textSub} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaveTitle}>Cancel Request</Text>
                  <Text style={styles.leaveDesc}>Withdraw your request to join this group</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
        <View style={{ padding: 16, paddingBottom: 100 }}>
          {isAdmin && (
            <>
              {/* Pending requests */}
              {pendingRequestUsers.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>PENDING REQUESTS · {pendingRequestUsers.length}</Text>
                  <View style={[styles.card, styles.pendingCard]}>
                    {pendingRequestUsers.map((user, i) => (
                      <View key={user.id} style={[styles.memberRow, i < pendingRequestUsers.length - 1 && styles.rowBorder]}>
                        <UserAvatar seed={user.displayName || user.name} backgroundColor={[user.avatarSeed]} thumbnail={user.thumbnail} size={38} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>{user.displayName}</Text>
                          <Text style={styles.memberHandle}>{user.name} · wants to join</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity onPress={() => approveReq(user.id)} style={styles.approveBtn}>
                            <Text style={styles.approveBtnText}>Approve</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => declineReq(user.id)} style={styles.declineBtn}>
                            <Text style={styles.declineBtnText}>Decline</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Members */}
              <Text style={styles.sectionLabel}>MEMBERS · {(group.memberIds ?? []).length}</Text>
              <View style={[styles.card, { marginBottom: 16 }]}>
                {(group.memberIds ?? []).map((memberId, i) => {
                  const isAdmin     = admins.includes(memberId);
                  const isSuperAdmin= memberId === superAdminId;
                  const isMe        = memberId === currentUserId;
                  const canAction   = !isMe && !isSuperAdmin;
                  const user = getUser(memberId);
                  const displayName = user.displayName;

                  return (
                    <TouchableOpacity
                      key={memberId}
                      onPress={() => canAction && setMemberMenu({ userId: memberId })}
                      style={[styles.memberRow, i < (group.memberIds ?? []).length - 1 && styles.rowBorder]}
                      activeOpacity={canAction ? 0.7 : 1}
                    >
                      <UserAvatar seed={user.displayName || user.name} backgroundColor={[user.avatarSeed]} thumbnail={user.thumbnail} size={38} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>
                          {displayName}{isMe ? <Text style={styles.youLabel}> · you</Text> : ''}
                        </Text>
                        <Text style={styles.memberRole}>
                          {isSuperAdmin ? 'Super Admin' : isAdmin ? 'Admin' : 'Member'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {isSuperAdmin && <Ionicons name="star" size={16} color="#CA8A04" />}
                        {!isSuperAdmin && isAdmin && (
                          <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>Admin</Text></View>
                        )}
                        {canAction && <Text style={{ color: Colors.textMuted, fontSize: 16 }}>›</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Context menu */}
              {memberMenu && (
                <Modal visible transparent animationType="fade" onRequestClose={() => setMemberMenu(null)}>
                  <TouchableOpacity style={styles.menuOverlay} onPress={() => setMemberMenu(null)} activeOpacity={1}>
                    <View style={styles.menuCard}>
                      <View style={styles.menuHeader}>
                        <Text style={styles.menuHeaderText} numberOfLines={1}>{getUser(memberMenu.userId).displayName}</Text>
                      </View>
                      {isSuperAdmin && (
                        <TouchableOpacity onPress={() => transferSuperAdmin(memberMenu.userId)} style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: Colors.border }]}>
                          <Ionicons name="star" size={20} color="#CA8A04" />
                          <Text style={styles.menuItemText}>Transfer super admin</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => toggleAdmin(memberMenu.userId)} style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: Colors.border }]}>
                        <Ionicons
                          name={admins.includes(memberMenu.userId) ? 'person-outline' : 'star-outline'}
                          size={20}
                          color={Colors.text}
                        />
                        <Text style={styles.menuItemText}>{admins.includes(memberMenu.userId) ? 'Remove admin' : 'Make admin'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeMember(memberMenu.userId)} style={styles.menuItem}>
                        <Ionicons name="person-remove-outline" size={20} color={Colors.notGoing} />
                        <Text style={[styles.menuItemText, { color: Colors.notGoing }]}>Remove from group</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                </Modal>
              )}
            </>
          )}

          {!isAdmin &&
            (group.membershipStatus === 'none' && group.isPublic ? (
              <>
                <Text style={styles.sectionLabel}>JOIN</Text>
                <View style={[styles.card, { padding: 16 }]}>
                  <Text style={{ fontSize: 14, color: Colors.textSub, fontFamily: Fonts.regular, marginBottom: 14 }}>
                    {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'} · Public group
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (!currentUserId?.trim()) return;
                      joinGroup.mutate(
                        { groupId, userId: currentUserId },
                        {
                          onError: (e: any) => {
                            const msg = e?.body?.error ?? e?.message ?? 'Could not join';
                            if (Platform.OS === 'web') window.alert(msg);
                            else Alert.alert('Error', msg);
                          },
                        }
                      );
                    }}
                    disabled={!currentUserId || joinGroup.isPending}
                    style={[styles.visitJoinBtn, (!currentUserId || joinGroup.isPending) && { opacity: 0.45 }]}
                    activeOpacity={0.85}
                  >
                    {joinGroup.isPending ? (
                      <ActivityIndicator size="small" color={Colors.accentFg} />
                    ) : (
                      <Text style={styles.visitJoinBtnText}>
                        {group.requireApprovalToJoin !== false ? 'Request to join' : 'Join group'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.card}>
                {(group.memberIds ?? []).map((memberId, i) => {
                  const isSuperAdminMember = memberId === superAdminId;
                  const isAdminMember = admins.includes(memberId);
                  const user = getUser(memberId);
                  const displayName = user.displayName;
                  return (
                    <View key={i} style={[styles.memberRow, i < (group.memberIds ?? []).length - 1 && styles.rowBorder]}>
                      <UserAvatar seed={user.displayName || user.name} backgroundColor={[user.avatarSeed]} thumbnail={user.thumbnail} size={38} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>{displayName}</Text>
                        <Text style={styles.memberRole}>
                          {isSuperAdminMember ? 'Super Admin' : isAdminMember ? 'Admin' : 'Member'}
                        </Text>
                      </View>
                      {isSuperAdminMember && <Ionicons name="star" size={16} color="#CA8A04" />}
                    </View>
                  );
                })}
              </View>
            ))}

          {group.membershipStatus !== 'none' && (
          <>
            <View style={{ height: 16 }} />
              <Text style={styles.sectionLabel}>DANGER ZONE</Text>
              <View style={[styles.card, { borderColor: '#FECACA' }]}>
                {isSuperAdmin ? (
                  <>
                    {isSoftDeleted ? (
                      <TouchableOpacity onPress={doRecover} style={styles.memberRow} activeOpacity={0.8} disabled={recoverMutation.isPending}>
                        <Ionicons name="arrow-undo-outline" size={22} color={Colors.going} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.leaveTitle}>Recover Group</Text>
                          <Text style={styles.leaveDesc}>Restore this deactivated group</Text>
                        </View>
                        {recoverMutation.isPending && <ActivityIndicator size="small" color={Colors.text} />}
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity onPress={() => setShowDeactivateConfirm(true)} style={[styles.memberRow, styles.rowBorder]} activeOpacity={0.8} disabled={softDeleteMutation.isPending}>
                          <View style={styles.dangerIconWrap}><Ionicons name="pause-circle-outline" size={22} color="#B45309" /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.leaveTitle, { color: '#B45309' }]}>Deactivate Group</Text>
                            <Text style={styles.leaveDesc}>Temporarily deactivate the group - you can recover it later</Text>
                          </View>
                          {softDeleteMutation.isPending && <ActivityIndicator size="small" color={Colors.text} />}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setShowDeleteConfirm(true)} style={styles.memberRow} activeOpacity={0.8} disabled={hardDeleteMutation.isPending}>
                          <View style={styles.dangerIconWrap}><Ionicons name="trash-outline" size={22} color={Colors.notGoing} /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.leaveTitle}>Delete Group</Text>
                            <Text style={styles.leaveDesc}>Permanently remove the group and all members</Text>
                          </View>
                          {hardDeleteMutation.isPending && <ActivityIndicator size="small" color={Colors.text} />}
                        </TouchableOpacity>
                      </>
                    )}
                  </>
                ) : (
                  <TouchableOpacity onPress={() => setShowLeave(true)} style={styles.memberRow} activeOpacity={0.8}>
                    <Ionicons name="log-out-outline" size={22} color={Colors.textSub} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.leaveTitle}>Leave Group</Text>
                      <Text style={styles.leaveDesc}>You'll need an invite to rejoin</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
          </>
          )}
        </View>
        )}
      </ScrollView>

      <AvatarPickerModal
        variant="group"
        visible={showAvatarPicker}
        onRequestClose={dismissAvatarPicker}
        onAfterSave={() => setShowAvatarPicker(false)}
        seed={avatarSeedDraft}
        onSeedChange={setAvatarSeedDraft}
        thumbnail={avatarThumbnailDraft}
        onThumbnailChange={setAvatarThumbnailDraft}
        userId={currentUserId ?? ''}
        onSave={async (avatarSeed, thumbnail) => {
          try {
            await updateGroup.mutateAsync({
              avatarSeed: avatarSeed.trim() === 'auto' || avatarSeed.trim() === '' ? null : avatarSeed.trim(),
              thumbnail: thumbnail ?? null,
              updatedBy: currentUserId ?? '',
            });
            const prior = thumbnailAtPickerOpenRef.current?.trim() ?? '';
            const saved = (thumbnail ?? '').trim();
            if (prior && /^https?:\/\//i.test(prior) && prior !== saved && currentUserId) {
              deleteManagedUploadFireAndForget(currentUserId, prior);
            }
          } catch (e) {
            if (Platform.OS === 'web') window.alert('Failed to update avatar');
            else Alert.alert('Error', 'Failed to update avatar');
            throw e;
          }
        }}
        isSaving={updateGroup.isPending}
      />

      {/* Leave confirm */}
      {showLeave && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowLeave(false)}>
          <TouchableOpacity style={styles.menuOverlay} onPress={() => setShowLeave(false)} activeOpacity={1}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>
                {isPending ? `Cancel request to join ${group.name}?` : `Leave ${group.name}?`}
              </Text>
              <Text style={styles.confirmBody}>
                {isPending
                  ? "You'll need an invite to request again."
                  : "You'll need an invite to rejoin."
                }
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setShowLeave(false)} style={[styles.confirmBtn, { borderColor: Colors.border, backgroundColor: Colors.surface }]}>
                  <Text style={{ fontFamily: Fonts.semiBold, color: Colors.text }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowLeave(false); leaveGroup(); }} style={[styles.confirmBtn, { backgroundColor: Colors.notGoing, borderColor: Colors.notGoing }]}>
                  <Text style={{ fontFamily: Fonts.bold, color: '#fff' }}>{isPending ? 'Cancel Request' : 'Leave'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Deactivate confirm (superadmin) */}
      {showDeactivateConfirm && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowDeactivateConfirm(false)}>
          <TouchableOpacity style={styles.menuOverlay} onPress={() => setShowDeactivateConfirm(false)} activeOpacity={1}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Deactivate {group.name}?</Text>
              <Text style={styles.confirmBody}>
                You can recover this group at any time.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setShowDeactivateConfirm(false)} style={[styles.confirmBtn, { borderColor: Colors.border, backgroundColor: Colors.surface }]}>
                  <Text style={{ fontFamily: Fonts.semiBold, color: Colors.text }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={doSoftDelete} style={[styles.confirmBtn, { backgroundColor: '#F59E0B', borderColor: '#F59E0B' }]} disabled={softDeleteMutation.isPending}>
                  <Text style={{ fontFamily: Fonts.bold, color: '#fff' }}>Deactivate</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Delete confirm (superadmin) */}
      {showDeleteConfirm && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
          <TouchableOpacity style={styles.menuOverlay} onPress={() => setShowDeleteConfirm(false)} activeOpacity={1}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Delete {group.name}?</Text>
              <Text style={styles.confirmBody}>
                This will permanently remove the group. This cannot be undone.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setShowDeleteConfirm(false)} style={[styles.confirmBtn, { borderColor: Colors.border, backgroundColor: Colors.surface }]}>
                  <Text style={{ fontFamily: Fonts.semiBold, color: Colors.text }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={doHardDelete} style={[styles.confirmBtn, { backgroundColor: Colors.notGoing, borderColor: Colors.notGoing }]} disabled={hardDeleteMutation.isPending}>
                  <Text style={{ fontFamily: Fonts.bold, color: '#fff' }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: Colors.bg },
  headerBlock:      { backgroundColor: Colors.surface, padding: 20, borderBottomWidth: 1 },
  avatarNameRow:    { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  nameFieldWrap:    {
    flex: 1,
    minWidth: 0,
    height: AVATAR_SIZE,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  nameInput:        {
    flex: 1,
    minWidth: 0,
    paddingVertical: Platform.OS === 'ios' ? 10 : 0,
    paddingHorizontal: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontSize: 19,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    textAlignVertical: 'center',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : null),
  },
  nameInputSlot:    { flex: 1, minWidth: 0 },
  descInputFull:    {
    width: '100%',
    minHeight: 88,
    marginTop: 0,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: 'transparent',
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.text,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : null),
  },
  groupDescFull:    { width: '100%', fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular, lineHeight: 18 },
  navEditActions:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  draftBarBtnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  draftBarBtnSecondaryText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  draftBarBtnPrimary: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftBarBtnPrimaryDisabled: { opacity: 0.45 },
  draftBarBtnPrimaryText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  groupThumb:       { width: AVATAR_SIZE, height: AVATAR_SIZE, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  groupName:        { fontSize: 19, fontFamily: Fonts.extraBold, color: Colors.text },
  groupDesc:        { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular, lineHeight: 18 },
  inviteSection:    { marginTop: 0, paddingBottom: 0 },
  inviteRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inviteToggleRow:  { paddingVertical: 0 },
  inviteLabel:      { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted, opacity: 0.65 },
  inviteValueRow:   { flexDirection: 'row', alignItems: 'center', gap: 0, flexWrap: 'wrap' },
  inviteValue:      { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textMuted, opacity: 0.65 },
  regenerateInviteIconBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyIconBtn:      { padding: 4 },
  copyIconWrap:     { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  copyIconText:     { fontSize: 16, fontFamily: Fonts.bold },
  visitJoinBtn:     { paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  visitJoinBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  card:             { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  sectionLabel:     { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  pendingCard:      { borderColor: '#FDE68A', marginBottom: 16 },
  memberRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  rowBorder:        { borderBottomWidth: 1, borderBottomColor: Colors.border },
  memberName:       { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
  memberHandle:     { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
  youLabel:         { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
  memberRole:       { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular, marginTop: 1 },
  adminBadge:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  adminBadgeText:   { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textSub },
  approveBtn:       { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.lg, backgroundColor: Colors.going },
  approveBtnText:   { fontSize: 12, fontFamily: Fonts.semiBold, color: '#fff' },
  declineBtn:       { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  declineBtnText:   { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSub },
  leaveTitle:       { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.notGoing },
  leaveDesc:        { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular, marginTop: 1 },
  menuOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  menuCard:         { backgroundColor: Colors.surface, borderRadius: 16, width: 220, overflow: 'hidden', ...Shadows.lg },
  menuHeader:       { padding: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuHeaderText:   { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted },
  menuItem:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingHorizontal: 16 },
  menuItemText:     { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  confirmCard:      { backgroundColor: Colors.surface, borderRadius: 20, padding: 24, width: '100%', maxWidth: 320, ...Shadows.lg },
  confirmTitle:     { fontSize: 17, fontFamily: Fonts.extraBold, color: Colors.text, marginBottom: 8 },
  confirmBody:      { fontSize: 14, color: Colors.textSub, fontFamily: Fonts.regular, lineHeight: 22, marginBottom: 20 },
  confirmBtn:       { flex: 1, paddingVertical: 10, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center' },
  dangerIconWrap:   { width: 28, alignItems: 'center', justifyContent: 'center' },
});
