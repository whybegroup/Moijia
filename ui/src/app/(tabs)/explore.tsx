import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Switch } from 'react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../../utils/helpers';
import { useGroups, useAllGroupMemberColors, useJoinGroup, useJoinByInviteCode, useLeaveGroup } from '../../hooks/api';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { GroupAvatar } from '../../components/GroupAvatar';

export default function ExploreScreen() {
  const [query, setQuery] = useState('');
  const [code, setCode] = useState('');
  const [showJoined, setShowJoined] = useState(true);
  const { userId: currentUserId } = useCurrentUserContext();

  const { data: groups = [], isLoading: loading } = useGroups(currentUserId ?? '');
  const joinGroup = useJoinGroup();
  const joinByCode = useJoinByInviteCode();
  const leaveGroup = useLeaveGroup({
    onError: (e: any) => {
      const msg = e?.body?.error ?? e?.message ?? 'Failed to leave group';
      Toast.show({ type: 'error', text1: msg });
    },
  });
  const { data: groupColors = {} } = useAllGroupMemberColors(currentUserId || '');

  const results = groups.filter(
    (g) =>
      g.isPublic &&
      (showJoined || g.membershipStatus === 'none') &&
      (!query || g.name.toLowerCase().includes(query.toLowerCase()) || g.desc.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Explore Groups</Text>
        <TextInput
          value={query} onChangeText={setQuery}
          placeholder="Search groups…" placeholderTextColor={Colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      {(
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Join by code */}
        <View style={styles.codeCard}>
          <Text style={styles.codeTitle}>Join with invite code</Text>
          <Text style={styles.codeDesc}>Got an invite link or code? Enter it here.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={code} onChangeText={setCode}
              placeholder="Enter invite code" placeholderTextColor={Colors.textMuted}
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
              style={[styles.joinBtn, { opacity: code.trim() && currentUserId ? 1 : 0.4 }]}
              disabled={!code.trim() || !currentUserId || joinByCode.isPending}
            >
              <Text style={styles.joinBtnText}>{joinByCode.isPending ? 'Joining…' : 'Join'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Results */}
        <View style={[styles.sectionRow, { marginBottom: 10 }]}>
          <Text style={styles.sectionLabel}>{query ? `Results for "${query}"` : 'Public Groups'}</Text>
          <View style={styles.showJoinedRow}>
            <Text style={styles.showJoinedLabel}>Show joined</Text>
            <Switch value={showJoined} onValueChange={setShowJoined} trackColor={{ false: Colors.border, true: Colors.border }} thumbColor="#E5E5E5" />
          </View>
        </View>
        <View style={styles.card}>
          {results.map((g, i) => {
            const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
            const p = getGroupColor(userColorHex);
            const isJoined = g.membershipStatus === 'member' || g.membershipStatus === 'admin' || g.membershipStatus === 'pending';
            return (
              <View key={g.id} style={[styles.row, i < results.length - 1 && styles.rowBorder]}>
                <View style={[styles.groupIcon, { backgroundColor: p.row, borderColor: p.cal }]}>
                  <GroupAvatar seed={g.avatarSeed} thumbnail={g.thumbnail} name={g.name} size={44} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  <Text style={styles.groupDesc} numberOfLines={1}>{g.desc}</Text>
                  <Text style={styles.groupMeta}>{g.memberCount} members</Text>
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
          {results.length === 0 && (
            <View style={{ padding: 32, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.regular }}>No groups found</Text>
            </View>
          )}
        </View>
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: Colors.bg },
  header:             { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, padding: 20 },
  title:              { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text, marginBottom: 14 },
  searchInput:        { padding: 10, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  codeCard:           { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 20 },
  codeTitle:          { fontSize: 14, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 4 },
  codeDesc:           { fontSize: 13, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 12 },
  codeInput:          { padding: 9, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  joinBtn:            { paddingHorizontal: 18, paddingVertical: 9, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  joinBtnText:        { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  sectionLabel:       { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  showJoinedRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  showJoinedLabel:    { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSub },
  card:               { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  row:                { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  rowBorder:          { borderBottomWidth: 1, borderBottomColor: Colors.border },
  groupIcon:          { width: 44, height: 44, borderRadius: groupAvatarBorderRadius(44), borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  groupName:          { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 1 },
  groupDesc:          { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 2 },
  groupMeta:          { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular },
  joinGroupBtn:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.accent, flexShrink: 0 },
  joinGroupBtnJoined: { borderColor: Colors.border, backgroundColor: Colors.surface },
  joinGroupBtnText:       { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  joinGroupBtnTextJoined: { color: Colors.textSub },
});
