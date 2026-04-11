import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, ActivityIndicator, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { EventFormPopoverChrome } from '../../components/EventFormPopoverChrome';
import { firstSearchParam, parseReturnToParam } from '../../utils/navigationReturn';
import { Colors, Fonts, Radius, Shadows } from '../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../../utils/helpers';
import { NavBar, Toggle, formSectionTitleStyle, Avatar } from '../../components/ui';
import {
  useGroup,
  useUsers,
  useGroupMembers,
  useGroupMemberColor,
  usePendingRequests,
  useHandleMembershipRequest,
  useUpdateGroup,
  useRegenerateInviteCode,
  useLeaveGroup,
  useSoftDeleteGroup,
  useDeleteGroup,
  useRecoverGroup,
  useRemoveMember,
  useSetMemberRole,
  useSetSuperAdmin,
} from '../../hooks/api';
import { MembershipRequestAction } from '@moija/client';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect } from 'react-native-svg';
import { GroupAvatar } from '../../components/GroupAvatar';
import { GroupMemberThemeAndNotifications } from '../../components/GroupMemberThemeAndNotifications';
import { AvatarPickerModal } from '../../components/AvatarPickerModal';
import { UserAvatar } from '../../components/UserAvatar';
import { deleteManagedUploadFireAndForget } from '../../services/managedUploadDelete';
import { ResolvableImage } from '../../components/ResolvableImage';
import { pickAndUploadCoverPhoto } from '../../services/pickAndUploadImage';

const AVATAR_SIZE = 56;

export default function GroupDetailScreen() {
  const params = useLocalSearchParams<{ id: string; returnTo?: string | string[] }>();
  const router = useRouter();
  const returnToHref = useMemo(
    () => parseReturnToParam(firstSearchParam(params.returnTo)),
    [params.returnTo]
  );
  const dismiss = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (returnToHref) {
      router.replace(returnToHref as Href);
      return;
    }
    router.replace('/(tabs)/groups');
  }, [router, returnToHref]);
  const { userId: currentUserId } = useCurrentUserContext();

  const id = params.id;
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
  const leaveGroupMutation = useLeaveGroup();
  const softDeleteMutation = useSoftDeleteGroup(currentUserId ?? '');
  const hardDeleteMutation = useDeleteGroup(currentUserId ?? '');
  const recoverMutation = useRecoverGroup(currentUserId ?? '');

  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [coverPhotoBusy, setCoverPhotoBusy] = useState(false);
  const [localCoverPhotos, setLocalCoverPhotos] = useState<string[]>([]);
  const [groupPhotoLightbox, setGroupPhotoLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const coverHydratedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!group) return;
    setDraftName(group.name);
    setDraftDesc(group.desc ?? '');
  }, [group?.id, group?.name, group?.desc]);

  useEffect(() => {
    if (!group) return;
    if (coverHydratedRef.current === group.id) return;
    coverHydratedRef.current = group.id;
    setLocalCoverPhotos(group.coverPhotos ?? []);
  }, [group]);

  const profileDirty = useMemo(() => {
    if (!group || group.membershipStatus !== 'admin') return false;
    return (
      draftName.trim() !== group.name.trim() ||
      draftDesc.trim() !== (group.desc ?? '').trim()
    );
  }, [group, draftName, draftDesc]);

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
  const isSuperAdmin = superAdminId === currentUserId;
  const isAdmin = group.membershipStatus === 'admin';
  const canManageMembers = isAdmin || isSuperAdmin;
  const isPending = group.membershipStatus === 'pending';
  const isSoftDeleted = !!group.deletedAt;

  const leaveGroup = async () => {
    if (!currentUserId) return;
    try {
      await leaveGroupMutation.mutateAsync({ groupId, userId: currentUserId });
      dismiss();
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
      dismiss();
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
      dismiss();
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

  const coverPhotosForDisplay = isAdmin ? localCoverPhotos : (group.coverPhotos ?? []);
  const showGroupCoverSection = coverPhotosForDisplay.length > 0 || (isAdmin && !isPending);

  const removeCoverPhotoAt = async (index: number) => {
    if (!currentUserId || !isAdmin) return;
    const prev = localCoverPhotos;
    const next = prev.filter((_, j) => j !== index);
    setLocalCoverPhotos(next);
    try {
      await updateGroup.mutateAsync({
        coverPhotos: next,
        updatedBy: currentUserId,
      });
    } catch {
      setLocalCoverPhotos(prev);
      if (Platform.OS === 'web') window.alert('Failed to remove photo');
      else Alert.alert('Error', 'Failed to remove photo');
    }
  };

  const addCoverPhoto = async (url: string) => {
    if (!currentUserId || !isAdmin) return;
    const prev = localCoverPhotos;
    const next = [...prev, url];
    setLocalCoverPhotos(next);
    try {
      await updateGroup.mutateAsync({
        coverPhotos: next,
        updatedBy: currentUserId,
      });
    } catch {
      setLocalCoverPhotos(prev);
      if (Platform.OS === 'web') window.alert('Failed to add photo');
      else Alert.alert('Error', 'Failed to add photo');
    }
  };

  const addCoverPhotoFromPicker = async () => {
    if (!currentUserId || !isAdmin || coverPhotoBusy) return;
    setCoverPhotoBusy(true);
    try {
      const url = await pickAndUploadCoverPhoto(currentUserId);
      if (url) await addCoverPhoto(url);
    } finally {
      setCoverPhotoBusy(false);
    }
  };

  const groupPhotosBlock = showGroupCoverSection ? (
    <View
      style={{
        marginTop: isAdmin || draftDesc.trim() || group.desc?.trim() ? 4 : 10,
        marginBottom:
          isAdmin && !isPending
            ? 0
            : coverPhotosForDisplay.length > 0
              ? 16
              : 0,
      }}
    >
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={formSectionTitleStyle}>
          Photos{coverPhotosForDisplay.length > 0 ? ` · ${coverPhotosForDisplay.length}` : ''}
        </Text>
      </View>
      {coverPhotosForDisplay.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{
            borderBottomWidth: isAdmin && !isPending ? StyleSheet.hairlineWidth : 0,
            borderBottomColor: Colors.border,
          }}
          contentContainerStyle={{ gap: 4, paddingVertical: 10, paddingHorizontal: 16 }}
        >
          {coverPhotosForDisplay.map((uri, i) => (
            <View key={`${uri}-${i}`} style={{ position: 'relative' }}>
              <TouchableOpacity
                onPress={() => setGroupPhotoLightbox({ urls: coverPhotosForDisplay, index: i })}
                activeOpacity={0.9}
              >
                <ResolvableImage
                  storedUrl={uri}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: Radius.lg,
                    backgroundColor: Colors.bg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: Colors.border,
                  }}
                  resizeMode="cover"
                />
              </TouchableOpacity>
              {isAdmin && !isPending && (
                <TouchableOpacity
                  onPress={() => void removeCoverPhotoAt(i)}
                  style={styles.coverRemoveThumb}
                >
                  <Ionicons name="close" size={11} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      ) : null}
      {isAdmin && !isPending ? (
        <View
          style={{
            paddingHorizontal: 16,
            marginTop: coverPhotosForDisplay.length > 0 ? 4 : 0,
            marginBottom: 16,
          }}
        >
          <View style={[styles.groupPhotosAddCard, styles.groupPhotosAddCardNested]}>
            <TouchableOpacity
              onPress={() => void addCoverPhotoFromPicker()}
              style={styles.groupPhotosAddBtn}
              disabled={coverPhotoBusy}
              activeOpacity={0.85}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                {coverPhotoBusy ? (
                  <ActivityIndicator size="small" color={Colors.textSub} />
                ) : (
                  <Ionicons name="camera-outline" size={16} color={Colors.textSub} />
                )}
                <Text style={{ fontSize: 12, color: Colors.textSub, fontFamily: Fonts.medium }}>Add photo</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  ) : null;

  return (
    <EventFormPopoverChrome onClose={dismiss}>
    <View style={styles.safe}>
      <NavBar
        onClose={dismiss}
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

      <ScrollView
        style={styles.groupScrollView}
        contentContainerStyle={styles.groupScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.groupMainCardWrap}>
          <View style={styles.groupMainCard}>
          <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
            <TouchableOpacity
              onPress={() => {
                if (!isAdmin) return;
                thumbnailAtPickerOpenRef.current = group.thumbnail ?? null;
                setShowAvatarPicker(true);
              }}
              style={[
                styles.groupThumb,
                {
                  alignSelf: 'flex-start',
                  marginBottom: 10,
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
            {isAdmin ? (
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Group name"
                placeholderTextColor={Colors.textMuted}
                style={styles.groupTitleInput}
                autoCapitalize="words"
                autoCorrect={false}
              />
            ) : (
              <Text
                style={[styles.groupTitleReadOnly, !group.name.trim() && styles.readOnlyPlaceholder]}
                numberOfLines={3}
              >
                {group.name.trim() ? group.name : 'No name'}
              </Text>
            )}
            {isAdmin ? (
              <View style={[styles.groupDescBox, { marginTop: 10 }]}>
                <TextInput
                  value={draftDesc}
                  onChangeText={setDraftDesc}
                  placeholder="Description"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.groupDescInput}
                  multiline
                />
              </View>
            ) : group.desc?.trim() ? (
              <View style={[styles.groupDescBox, { marginTop: 10 }]}>
                <Text style={styles.groupDescText}>{group.desc}</Text>
              </View>
            ) : null}
          </View>

          {groupPhotosBlock}

          {!isPending && inviteCode ? (
            <View style={[styles.inviteSection, styles.inviteSectionInset]}>
              <View style={[styles.inviteRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingVertical: 4 }]}>
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
            </View>
          ) : null}
          </View>
        </View>

        {(isAdmin || isSuperAdmin) && !isPending ? (
          <View style={styles.groupSettingsSection}>
            <Text style={styles.sectionLabel}>Settings</Text>
            <View style={[styles.card, { marginBottom: 16 }]}>
              <Toggle
                value={group.requireApprovalToJoin}
                style={{ borderBottomWidth: 0, paddingHorizontal: 16 }}
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
        ) : null}

        {isPending ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 }}>
            <View style={[styles.card, styles.cardPendingNotice, { padding: 24, alignItems: 'center' }]}>
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
            <View style={[styles.card, styles.cardDanger]}>
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
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 }}>
          {canManageMembers && (
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

          {!canManageMembers && group.membershipStatus === 'member' && (
            <>
              <Text style={styles.sectionLabel}>MEMBERS · {(group.memberIds ?? []).length}</Text>
              <View style={[styles.card, { marginBottom: 16 }]}>
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
            </>
          )}

          {(group.membershipStatus === 'member' || group.membershipStatus === 'admin') && !!currentUserId && (
            <GroupMemberThemeAndNotifications groupId={groupId} userId={currentUserId} groupName={group.name} />
          )}

          {group.membershipStatus !== 'none' && (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>DANGER ZONE</Text>
              <View style={[styles.card, styles.cardDanger]}>
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

      {groupPhotoLightbox !== null && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setGroupPhotoLightbox(null)}
        >
          <View style={styles.groupPhotoLightbox}>
            <View style={styles.groupPhotoLightboxHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar name={group.name} size={28} />
                <View>
                  <Text style={styles.groupPhotoLightboxName}>{group.name}</Text>
                  <Text style={styles.groupPhotoLightboxSub}>
                    {groupPhotoLightbox.urls.length > 1
                      ? `Cover photos · ${groupPhotoLightbox.index + 1} of ${groupPhotoLightbox.urls.length}`
                      : 'Cover photo'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setGroupPhotoLightbox(null)}
                style={styles.groupPhotoLightboxClose}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            {groupPhotoLightbox.urls.length > 1 ? (
              <>
                <TouchableOpacity
                  accessibilityLabel="Previous photo"
                  onPress={() =>
                    setGroupPhotoLightbox((prev) =>
                      prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev
                    )
                  }
                  disabled={groupPhotoLightbox.index <= 0}
                  style={[
                    styles.groupPhotoLightboxNavBtn,
                    styles.groupPhotoLightboxNavPrev,
                    groupPhotoLightbox.index <= 0 && styles.groupPhotoLightboxNavBtnDisabled,
                  ]}
                >
                  <Ionicons name="chevron-back" size={28} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel="Next photo"
                  onPress={() =>
                    setGroupPhotoLightbox((prev) =>
                      prev && prev.index < prev.urls.length - 1
                        ? { ...prev, index: prev.index + 1 }
                        : prev
                    )
                  }
                  disabled={groupPhotoLightbox.index >= groupPhotoLightbox.urls.length - 1}
                  style={[
                    styles.groupPhotoLightboxNavBtn,
                    styles.groupPhotoLightboxNavNext,
                    groupPhotoLightbox.index >= groupPhotoLightbox.urls.length - 1 &&
                      styles.groupPhotoLightboxNavBtnDisabled,
                  ]}
                >
                  <Ionicons name="chevron-forward" size={28} color="#fff" />
                </TouchableOpacity>
              </>
            ) : null}
            <ResolvableImage
              storedUrl={groupPhotoLightbox.urls[groupPhotoLightbox.index] ?? ''}
              style={styles.groupPhotoLightboxImg}
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}

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

    </View>
    </EventFormPopoverChrome>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: Colors.bg },
  groupScrollView:  { flex: 1, backgroundColor: Colors.bg },
  groupScrollContent: { flexGrow: 1, backgroundColor: Colors.bg, paddingBottom: 8 },
  groupMainCardWrap:{ marginHorizontal: 20, marginTop: 10, marginBottom: 4 },
  groupMainCard:    { backgroundColor: Colors.surface, borderRadius: Radius['2xl'], overflow: 'hidden' },
  groupSettingsSection: { marginHorizontal: 20, marginTop: 14 },
  groupTitleInput:  {
    width: '100%',
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    paddingHorizontal: 0,
    margin: 0,
    marginBottom: 4,
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontSize: 21,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    lineHeight: 28,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : null),
  },
  groupTitleReadOnly: {
    fontSize: 21,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    lineHeight: 28,
    marginBottom: 4,
  },
  readOnlyPlaceholder: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
  },
  /** Match event detail `descBox` / `eventDescInput` */
  groupDescBox:     { backgroundColor: Colors.bg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 16 },
  groupDescInput:   {
    width: '100%',
    minHeight: 88,
    padding: 0,
    margin: 0,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.text,
    lineHeight: 22,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : null),
  },
  groupDescText:    { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, lineHeight: 22 },
  groupPhotosAddCard: {
    backgroundColor: Colors.bg,
    borderRadius: 16,
    overflow: 'hidden',
  },
  groupPhotosAddCardNested: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  groupPhotosAddBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
  },
  coverRemoveThumb: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.text,
    borderWidth: 2,
    borderColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  inviteSection:    { marginTop: 0, paddingBottom: 0 },
  inviteSectionInset: { paddingHorizontal: 16, paddingBottom: 16 },
  inviteRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
  card:             { backgroundColor: Colors.surface, borderRadius: Radius['2xl'], overflow: 'hidden' },
  cardPendingNotice:{ backgroundColor: '#FFFBEB', borderWidth: StyleSheet.hairlineWidth, borderColor: '#FDE68A' },
  cardDanger:       { borderWidth: StyleSheet.hairlineWidth, borderColor: '#FECACA' },
  sectionLabel:     {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  sectionLabelSpaced: { marginTop: 24 },
  pendingCard:      { borderWidth: StyleSheet.hairlineWidth, borderColor: '#FDE68A', marginBottom: 16 },
  memberRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
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
  groupPhotoLightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.93)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupPhotoLightboxHeader: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  groupPhotoLightboxName: { fontSize: 13, fontFamily: Fonts.semiBold, color: '#fff' },
  groupPhotoLightboxSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: Fonts.regular,
  },
  groupPhotoLightboxClose: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  groupPhotoLightboxImg: { width: '100%', height: '70%' },
  groupPhotoLightboxNavBtn: {
    position: 'absolute',
    top: '42%',
    zIndex: 2,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupPhotoLightboxNavBtnDisabled: { opacity: 0.28 },
  groupPhotoLightboxNavPrev: { left: 10 },
  groupPhotoLightboxNavNext: { right: 10 },
});
