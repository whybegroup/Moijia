import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, ActivityIndicator, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Fonts, Radius, Shadows } from '../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../../utils/helpers';
import { NavBar, Toggle } from '../../components/ui';
import { useGroup, useUsers, useGroupMembers, useGroupMemberColor, usePendingRequests, useHandleMembershipRequest, useUpdateGroup, useLeaveGroup, useSoftDeleteGroup, useDeleteGroup, useRecoverGroup, useRemoveMember, useSetMemberRole, useSetSuperAdmin } from '../../hooks/api';
import { MembershipRequestAction } from '@boltup/client';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect } from 'react-native-svg';
import { GroupAvatar } from '../../components/GroupAvatar';
import { AvatarPickerModal } from '../../components/AvatarPickerModal';
import { UserAvatar } from '../../components/UserAvatar';

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
    enabled: !!group && group.membershipStatus !== 'pending',
  });
  const { data: pendingRequestUsers = [] } = usePendingRequests(groupId, currentUserId ?? '');
  const handleMembershipRequest = useHandleMembershipRequest(groupId, currentUserId ?? '');
  const removeMemberMutation = useRemoveMember(groupId, currentUserId ?? '');
  const setMemberRole = useSetMemberRole(groupId, currentUserId ?? '');
  const setSuperAdmin = useSetSuperAdmin(groupId, currentUserId ?? '');
  const updateGroup = useUpdateGroup(groupId, currentUserId ?? '');
  const leaveGroupMutation = useLeaveGroup();
  const softDeleteMutation = useSoftDeleteGroup(currentUserId ?? '');
  const hardDeleteMutation = useDeleteGroup(currentUserId ?? '');
  const recoverMutation = useRecoverGroup(currentUserId ?? '');

  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftName,   setDraftName]   = useState('');
  const [draftDesc,   setDraftDesc]   = useState('');

  useEffect(() => {
    if (group) {
      if (!editingName) setDraftName(group.name);
      if (!editingDesc) setDraftDesc(group.desc || '');
    }
  }, [group?.name, group?.desc, editingName, editingDesc]);

  useEffect(() => {
    if (isError || (group && group.membershipStatus === 'none')) {
      router.replace('/(tabs)/groups');
    }
  }, [isError, group?.membershipStatus, router]);
  const [memberMenu,  setMemberMenu]  = useState<{ userId: string } | null>(null);
  const [showLeave,   setShowLeave]   = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarSeedDraft, setAvatarSeedDraft] = useState('');
  const [avatarThumbnailDraft, setAvatarThumbnailDraft] = useState<string | null>(null);
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

  const superAdminId = group.superAdminId ?? '';
  const admins = group.adminIds ?? [];
  const isAdmin = group.membershipStatus === 'admin';
  const isSuperAdmin = superAdminId === currentUserId;
  const isPending = group.membershipStatus === 'pending';
  const isSoftDeleted = !!group.deletedAt;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push('/(tabs)/groups');
    }
  };

  const leaveGroup = async () => {
    if (!currentUserId) return;
    try {
      await leaveGroupMutation.mutateAsync({ groupId, userId: currentUserId });
      handleBack();
    } catch (e: any) {
      const msg = e?.body?.error ?? e?.response?.data?.error ?? e?.message ?? 'Failed to leave group';
      console.error('Leave group error:', e?.status, e?.body, e);
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
    } catch (error) {
      console.error('Failed to approve request:', error);
    }
  };

  const declineReq = async (userId: string) => {
    try {
      await handleMembershipRequest.mutateAsync({
        userId,
        action: MembershipRequestAction.action.REJECT,
      });
    } catch (error) {
      console.error('Failed to decline request:', error);
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

  const inviteCode = group?.inviteCode || (groupId || '').toUpperCase().slice(0, 6);

  const copyInviteCode = async () => {
    await Clipboard.setStringAsync(inviteCode).catch(() => {});
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <NavBar title={group.name} onBack={handleBack} />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Group header */}
        <View style={[styles.headerBlock, { borderBottomColor: Colors.border }]}>
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => isAdmin && setShowAvatarPicker(true)}
              style={[
                styles.groupThumb,
                {
                  backgroundColor: getGroupColor(memberColorData?.colorHex || getDefaultGroupThemeFromName(group.name)).row,
                  borderColor: getGroupColor(memberColorData?.colorHex || getDefaultGroupThemeFromName(group.name)).cal,
                  borderRadius: groupAvatarBorderRadius(56),
                },
              ]}
              activeOpacity={isAdmin ? 0.8 : 1}
              disabled={!isAdmin}
            >
              <GroupAvatar seed={group.avatarSeed} thumbnail={group.thumbnail} name={group.name} size={56} style={{ width: 56, height: 56 }} />
            </TouchableOpacity>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {isAdmin ? (
                  <View style={styles.inlineEditRow}>
                    {editingName ? (
                      <TextInput
                        value={draftName}
                        onChangeText={setDraftName}
                        placeholder="Group name"
                        placeholderTextColor={Colors.textMuted}
                        style={styles.inlineNameInput}
                        autoCapitalize="words"
                        autoCorrect={false}
                        autoFocus
                      />
                    ) : (
                      <Text style={[styles.groupName, { flex: 1 }]} numberOfLines={1}>{group.name}</Text>
                    )}
                    <TouchableOpacity
                      onPress={async () => {
                        if (!editingName) {
                          setEditingName(true);
                          return;
                        }
                        const next = draftName.trim();
                        if (!next) return;
                        try {
                          await updateGroup.mutateAsync({ name: next, updatedBy: currentUserId });
                          setEditingName(false);
                        } catch (e) {
                          console.error('Failed to update group name', e);
                          if (Platform.OS === 'web') window.alert('Failed to update group name');
                          else Alert.alert('Error', 'Failed to update group name');
                        }
                      }}
                      disabled={editingName ? (!draftName.trim() || updateGroup.isPending) : false}
                      style={[styles.inlineEditBtn, editingName && styles.inlineEditBtnSave, editingName && (!draftName.trim() || updateGroup.isPending) && { opacity: 0.6 }]}
                      activeOpacity={0.7}
                    >
                      {updateGroup.isPending && editingName ? (
                        <ActivityIndicator size="small" color={Colors.accentFg} />
                      ) : (
                        <Text style={styles.inlineEditBtnText}>{editingName ? 'Save' : 'Change name'}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
                )}
              </View>
              {isAdmin ? (
                <View style={[styles.inlineEditRow, { alignItems: 'flex-start' }]}>
                  {editingDesc ? (
                    <TextInput
                      value={draftDesc}
                      onChangeText={setDraftDesc}
                      placeholder="Description"
                      placeholderTextColor={Colors.textMuted}
                      style={[styles.inlineDescInput]}
                      multiline
                      autoFocus
                    />
                  ) : (
                    <Text style={[styles.groupDesc, { flex: 1 }]} numberOfLines={3}>{group.desc || 'No description'}</Text>
                  )}
                  <TouchableOpacity
                    onPress={async () => {
                      if (!editingDesc) {
                        setEditingDesc(true);
                        return;
                      }
                      try {
                        await updateGroup.mutateAsync({ desc: draftDesc.trim(), updatedBy: currentUserId });
                        setEditingDesc(false);
                      } catch (e) {
                        console.error('Failed to update group description', e);
                        if (Platform.OS === 'web') window.alert('Failed to update group description');
                        else Alert.alert('Error', 'Failed to update group description');
                      }
                    }}
                    disabled={editingDesc && updateGroup.isPending}
                    style={[styles.inlineEditBtn, styles.inlineEditBtnDesc, editingDesc && styles.inlineEditBtnSave, editingDesc && updateGroup.isPending && { opacity: 0.6 }]}
                    activeOpacity={0.7}
                  >
                    {updateGroup.isPending && editingDesc ? (
                      <ActivityIndicator size="small" color={Colors.accentFg} />
                    ) : (
                      <Text style={styles.inlineEditBtnText}>{editingDesc ? 'Save' : 'Change description'}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.groupDesc}>{group.desc}</Text>
              )}
            </View>
          </View>
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
                        } catch (e) {
                          console.error('Failed to update visibility', e);
                          if (Platform.OS === 'web') window.alert('Failed to update visibility');
                          else Alert.alert('Error', 'Failed to update visibility');
                        }
                      }}
                      label="Private group (invite only)"
                    />
                  </View>
                </View>
              )}
              {!isPending && inviteCode && (
                <View style={[styles.inviteRow, (isAdmin || isSuperAdmin) && { borderTopWidth: 0, paddingVertical: 4 }]}>
                  <Text style={styles.inviteLabel}>Invite code</Text>
                  <View style={styles.inviteValueRow}>
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

          {!isAdmin && (
            <View style={styles.card}>
              {(group.memberIds ?? []).map((memberId, i) => {
                const isSuperAdmin = memberId === superAdminId;
                const isAdmin = admins.includes(memberId);
                const user = getUser(memberId);
                const displayName = user.displayName;
                return (
                  <View key={i} style={[styles.memberRow, i < (group.memberIds ?? []).length - 1 && styles.rowBorder]}>
                    <UserAvatar seed={user.displayName || user.name} backgroundColor={[user.avatarSeed]} thumbnail={user.thumbnail} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{displayName}</Text>
                      <Text style={styles.memberRole}>{isSuperAdmin ? 'Super Admin' : isAdmin ? 'Admin' : 'Member'}</Text>
                    </View>
                    {isSuperAdmin && <Ionicons name="star" size={16} color="#CA8A04" />}
                  </View>
                );
              })}
            </View>
          )}

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
        </View>
        )}
      </ScrollView>

      <AvatarPickerModal
        variant="group"
        visible={showAvatarPicker}
        onClose={() => setShowAvatarPicker(false)}
        seed={avatarSeedDraft}
        onSeedChange={setAvatarSeedDraft}
        thumbnail={avatarThumbnailDraft}
        onThumbnailChange={setAvatarThumbnailDraft}
        onSave={async (avatarSeed, thumbnail) => {
          try {
            await updateGroup.mutateAsync({
              avatarSeed: avatarSeed.trim() === 'auto' || avatarSeed.trim() === '' ? null : avatarSeed.trim(),
              thumbnail: thumbnail ?? null,
              updatedBy: currentUserId ?? '',
            });
          } catch (e) {
            console.error('Failed to update avatar', e);
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
  inlineEditRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  inlineNameInput:  { flex: 1, minWidth: 0, paddingVertical: 0, paddingHorizontal: 0, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: 'transparent', fontSize: 19, fontFamily: Fonts.extraBold, color: Colors.text, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : null) },
  inlineDescInput:  { flex: 1, minWidth: 0, paddingVertical: 4, paddingHorizontal: 0, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: 'transparent', fontSize: 13, fontFamily: Fonts.regular, color: Colors.text, minHeight: 40, textAlignVertical: 'top', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : null) },
  inlineEditBtn:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', flexShrink: 0 },
  inlineEditBtnSave:{ paddingHorizontal: 10 },
  inlineEditBtnDesc:{ alignSelf: 'flex-start' },
  inlineEditBtnText:{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSub },
  groupThumb:       { width: 56, height: 56, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  groupName:        { fontSize: 19, fontFamily: Fonts.extraBold, color: Colors.text },
  groupDesc:        { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular, lineHeight: 18 },
  inviteSection:    { marginTop: 12, paddingBottom: 8 },
  inviteRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 0, borderTopWidth: 1, borderTopColor: Colors.border },
  inviteToggleRow:  { paddingVertical: 4 },
  inviteLabel:      { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted, opacity: 0.65 },
  inviteValueRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inviteValue:      { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textMuted, opacity: 0.65 },
  copyIconBtn:      { padding: 4 },
  copyIconWrap:     { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  copyIconText:     { fontSize: 16, fontFamily: Fonts.bold },
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
