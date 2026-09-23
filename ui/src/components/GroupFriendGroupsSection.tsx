import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import type { FriendGroup } from '@moijia/client';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import {
  useDecideFriendGroup,
  useFriendGroups,
  useJoinGroup,
  useRemoveFriendGroup,
  useRequestFriendGroup,
} from '../hooks/api';
import { GroupAvatar } from './GroupAvatar';
import { apiErrorMessage } from '../utils/apiErrors';
import { showJoinGroupToast } from '../utils/joinGroupToast';
import Toast from 'react-native-toast-message';

const webInputNoFocusRing = {
  outlineStyle: 'none' as const,
  outlineWidth: 0,
};

type Props = {
  groupId: string;
  userId: string;
  isAdmin: boolean;
};

function canOpenGroup(item: FriendGroup): boolean {
  return item.membershipStatus === 'member' || item.membershipStatus === 'admin';
}

export function GroupFriendGroupsSection({ groupId, userId, isAdmin }: Props) {
  const router = useRouter();
  const { data: friendGroups = [], isLoading } = useFriendGroups(groupId, userId);
  const requestFriend = useRequestFriendGroup(groupId, userId);
  const decideFriend = useDecideFriendGroup(groupId, userId);
  const removeFriend = useRemoveFriendGroup(groupId, userId);
  const joinGroup = useJoinGroup();
  const [inviteCode, setInviteCode] = useState('');

  const onAdd = () => {
    const code = inviteCode.trim();
    if (!code || requestFriend.isPending) return;
    requestFriend.mutate(code, {
      onSuccess: (data) => {
        setInviteCode('');
        Toast.show({
          type: 'success',
          text1:
            data.status === 'accepted'
              ? `Linked with ${data.name}`
              : `Friend request sent to ${data.name}`,
        });
      },
      onError: (err) => {
        Toast.show({ type: 'error', text1: apiErrorMessage(err, 'Could not add friend group') });
      },
    });
  };

  const onJoin = (item: FriendGroup) => {
    if (joinGroup.isPending) return;
    joinGroup.mutate(
      { groupId: item.groupId, userId },
      {
        onSuccess: (data) => {
          showJoinGroupToast(data);
        },
        onError: (err) => {
          Toast.show({ type: 'error', text1: apiErrorMessage(err, 'Could not request to join') });
        },
      }
    );
  };

  const onDecide = (item: FriendGroup, action: 'approve' | 'reject') => {
    decideFriend.mutate(
      { friendGroupId: item.groupId, action },
      {
        onError: (err) => {
          Toast.show({ type: 'error', text1: apiErrorMessage(err, 'Could not update request') });
        },
      }
    );
  };

  const onCancelOutgoing = (item: FriendGroup) => {
    removeFriend.mutate(item.groupId, {
      onError: (err) => {
        Toast.show({ type: 'error', text1: apiErrorMessage(err, 'Could not cancel request') });
      },
    });
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>FRIEND GROUPS</Text>
      <View style={styles.card}>
        {isLoading ? (
          <View style={styles.emptyRow}>
            <ActivityIndicator size="small" color={Colors.textMuted} />
          </View>
        ) : friendGroups.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>
              {isAdmin
                ? 'Add another group with its invite code. They will need to approve the request.'
                : 'No friend groups yet.'}
            </Text>
          </View>
        ) : (
          friendGroups.map((item, index) => {
            const last = index === friendGroups.length - 1 && !isAdmin;
            const member = canOpenGroup(item);
            const pendingMembership = item.membershipStatus === 'pending';
            const rowInner = (
              <>
                <GroupAvatar
                  seed={item.avatarSeed ?? item.name}
                  thumbnail={item.thumbnail}
                  size={40}
                />
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.meta}>{statusLine(item)}</Text>
                </View>
              </>
            );
            return (
              <View key={item.groupId} style={[styles.row, !last && styles.rowBorder]}>
                {member ? (
                  <TouchableOpacity
                    style={styles.rowMain}
                    onPress={() => router.push(`/(tabs)/groups/${item.groupId}` as Href)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.name}`}
                  >
                    {rowInner}
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.rowMain}>{rowInner}</View>
                )}
                {item.status === 'pending_incoming' && isAdmin ? (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => onDecide(item, 'approve')}
                      disabled={decideFriend.isPending}
                    >
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.declineBtn}
                      onPress={() => onDecide(item, 'reject')}
                      disabled={decideFriend.isPending}
                    >
                      <Text style={styles.declineBtnText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                ) : item.status === 'pending_outgoing' ? (
                  <View style={styles.actions}>
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Pending</Text>
                    </View>
                    {isAdmin ? (
                      <TouchableOpacity
                        style={styles.declineBtn}
                        onPress={() => onCancelOutgoing(item)}
                        disabled={removeFriend.isPending}
                      >
                        <Text style={styles.declineBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : !member ? (
                  pendingMembership ? (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Requested</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.joinBtn}
                      onPress={() => onJoin(item)}
                      disabled={joinGroup.isPending}
                    >
                      <Text style={styles.joinBtnText}>Request join</Text>
                    </TouchableOpacity>
                  )
                ) : null}
              </View>
            );
          })
        )}

        {isAdmin ? (
          <View style={[styles.addBlock, friendGroups.length > 0 && styles.addBlockBorder]}>
            <Text style={styles.addHint}>Add with invite code</Text>
            <View style={styles.inviteRow}>
              <TextInput
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="Enter invite code"
                placeholderTextColor={Colors.textMuted}
                style={[styles.inviteInput, Platform.OS === 'web' && webInputNoFocusRing]}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={onAdd}
                style={[styles.addBtn, { opacity: inviteCode.trim() ? 1 : 0.4 }]}
                disabled={!inviteCode.trim() || requestFriend.isPending}
              >
                {requestFriend.isPending ? (
                  <ActivityIndicator size="small" color={Colors.accentFg} />
                ) : (
                  <Text style={styles.addBtnText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function statusLine(item: FriendGroup): string {
  if (item.status === 'pending_outgoing') return 'Waiting for their approval';
  if (item.status === 'pending_incoming') return 'Wants to be friends';
  const n = item.memberCount;
  return n === 1 ? '1 member' : `${n} members`;
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 20, marginTop: 12 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
  },
  emptyRow: { paddingHorizontal: 16, paddingVertical: 16 },
  emptyText: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textMuted, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
  meta: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingBadgeText: { fontSize: 11, fontFamily: Fonts.semiBold, color: '#92400E' },
  approveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.lg,
    backgroundColor: Colors.going,
  },
  approveBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: '#fff' },
  declineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  declineBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSub },
  joinBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
  },
  joinBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  addBlock: { paddingHorizontal: 16, paddingVertical: 14 },
  addBlockBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  addHint: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSub, marginBottom: 8 },
  inviteRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  inviteInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
  },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    minWidth: 56,
    alignItems: 'center',
  },
  addBtnText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
});
