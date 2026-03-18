import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Image, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Fonts, Radius, Shadows } from '../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName } from '../../utils/helpers';
import { Avatar, AvatarStack, NavBar } from '../../components/ui';
import { ListView } from '../../components/ListView';
import { useGroup, useEvents, useUsers, usePendingRequests, useHandleMembershipRequest, useGroupMemberColor, useUpdateGroupMemberColor } from '../../hooks/api';
import { MembershipRequestAction } from '@boltup/client';
import ColorPicker, { Panel1, HueSlider, OpacitySlider } from 'reanimated-color-picker';

const ME_ID = 'u1';

function defaultGroupAvatarUri(groupId: string): string {
  return `https://api.dicebear.com/8.x/bottts/png?seed=${encodeURIComponent(groupId)}&size=256&backgroundType=gradientLinear`;
}

export default function GroupDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  
  const groupId = Array.isArray(id) ? id[0] : id;

  if (!groupId) {
    return null;
  }

  const { data: group, isLoading: groupLoading } = useGroup(groupId);
  const { data: events = [], isLoading: eventsLoading } = useEvents({ groupId });
  const { data: users = [] } = useUsers();
  const { data: pendingRequestUsers = [] } = usePendingRequests(groupId);
  const handleMembershipRequest = useHandleMembershipRequest(groupId);
  const { data: memberColorData } = useGroupMemberColor(groupId, ME_ID);
  const updateMemberColor = useUpdateGroupMemberColor(groupId, ME_ID);

  const [tab,         setTab]         = useState<'events' | 'members'>('events');
  const [memberMenu,  setMemberMenu]  = useState<{ userId: string } | null>(null);
  const [showLeave,   setShowLeave]   = useState(false);
  const [newMember,   setNewMember]   = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [draftHex, setDraftHex] = useState<string | null>(null);

  const usersMap = useMemo(() => {
    const map: Record<string, any> = {};
    users.forEach(u => map[u.id] = u);
    return map;
  }, [users]);

  const getUser = (userId: string) => {
    return usersMap[userId] || { id: userId, name: 'Loading...', displayName: 'Loading...', handle: '' };
  };

  if (!group) {
    return null;
  }

  const userColorHex = memberColorData?.colorHex || getDefaultGroupThemeFromName(group.name);
  const p = getGroupColor(userColorHex);
  const groupEvents = events.filter(e => e.groupId === group.id);
  const superAdminId = group.superAdminId;
  const admins = group.adminIds;
  const isAdmin = admins.includes(ME_ID);
  const hasPendingApprovals = isAdmin && pendingRequestUsers.length > 0;

  const selectColor = async (colorHex: string) => {
    try {
      await updateMemberColor.mutateAsync(colorHex);
      setShowColorPicker(false);
    } catch (error) {
      console.error('Failed to update color:', error);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push('/(tabs)/groups');
    }
  };

  const leaveGroup = () => {
    const remainingAdmins = admins.filter(a => a !== ME_ID);
    if (remainingAdmins.length === 0) { handleBack(); return; }
    // TODO: Call API to leave group
    console.log('Leave group', groupId);
    handleBack();
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

  const removeMember = (userId: string) => {
    if (userId === ME_ID || userId === superAdminId) return;
    // TODO: Call API to remove member
    console.log('Remove member', userId);
    setMemberMenu(null);
  };

  const toggleAdmin = (userId: string) => {
    if (userId === superAdminId) return;
    // TODO: Call API to toggle admin
    console.log('Toggle admin', userId);
    setMemberMenu(null);
  };

  const addMember = () => {
    const n = newMember.trim().toLowerCase();
    if (!n) return;
    const user = users.find(u => u.handle.toLowerCase() === n || u.displayName.toLowerCase().includes(n));
    if (!user || group.memberIds.includes(user.id)) { setNewMember(''); return; }
    // TODO: Call API to add member
    console.log('Add member', user.id);
    setNewMember('');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <NavBar
        title={group.name}
        onBack={handleBack}
        right={
          group.adminIds.includes(ME_ID)
            ? <TouchableOpacity onPress={() => router.push(`/group/${groupId}/settings`)} style={styles.settingsBtn}>
                <Text style={styles.settingsBtnText}>Settings</Text>
              </TouchableOpacity>
            : null
        }
      />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Group header */}
        <View style={[styles.headerBlock, { borderBottomColor: Colors.border }]}>
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
            <Image source={{ uri: group.thumbnail || defaultGroupAvatarUri(group.id) }} style={styles.groupThumb} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={styles.groupName}>{group.name}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setDraftHex(memberColorData?.colorHex || getDefaultGroupThemeFromName(group.name));
                    setShowColorPicker(true);
                  }}
                  style={styles.colorBtn}
                >
                  <View style={[styles.colorDot, { backgroundColor: p.dot }]} />
                </TouchableOpacity>
              </View>
              <Text style={styles.groupDesc}>{group.desc}</Text>
              <Text style={styles.groupCreator}>Created by {getUser(group.createdBy).displayName}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AvatarStack names={group.memberIds.map(uid => getUser(uid).displayName)} size={24} max={5} />
              <Text style={styles.memberCount}>{group.memberIds.length} members</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => router.push(`/group/${groupId}/invite`)} style={styles.inviteBtn}>
                <Text style={styles.inviteBtnText}>Invite</Text>
              </TouchableOpacity>
              {group.adminIds.includes(ME_ID) && (
                <TouchableOpacity onPress={() => router.push('/create-event')} style={styles.createBtn}>
                  <Text style={styles.createBtnText}>+ Event</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['events', 'members'] as const).map(t => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
                {t === 'members' && hasPendingApprovals && <View style={styles.tabDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ padding: 16, paddingBottom: 100 }}>
          {tab === 'events' && (
            groupEvents.length === 0
              ? <View style={{ alignItems: 'center', paddingTop: 60 }}>
                  <Text style={{ fontSize: 14, color: Colors.textMuted }}>No events yet</Text>
                </View>
              : <ListView events={groupEvents} groups={[group]} onSelect={ev => router.push(`/event/${ev.id}`)} showGroup={false} />
          )}

          {tab === 'members' && group.adminIds.includes(ME_ID) && (
            <>
              {/* Pending requests */}
              {pendingRequestUsers.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>PENDING REQUESTS · {pendingRequestUsers.length}</Text>
                  <View style={[styles.card, styles.pendingCard]}>
                    {pendingRequestUsers.map((user, i) => (
                      <View key={user.id} style={[styles.memberRow, i < pendingRequestUsers.length - 1 && styles.rowBorder]}>
                        <Avatar name={user.displayName} size={38} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>{user.displayName}</Text>
                          <Text style={styles.memberHandle}>@{user.handle} · wants to join</Text>
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
              <Text style={styles.sectionLabel}>MEMBERS · {group.memberIds.length}</Text>
              <View style={[styles.card, { marginBottom: 16 }]}>
                {group.memberIds.map((memberId, i) => {
                  const isAdmin     = admins.includes(memberId);
                  const isSuperAdmin= memberId === superAdminId;
                  const isMe        = memberId === ME_ID;
                  const canAction   = !isMe && !isSuperAdmin;
                  const displayName = getUser(memberId).displayName;

                  return (
                    <TouchableOpacity
                      key={memberId}
                      onPress={() => canAction && setMemberMenu({ userId: memberId })}
                      style={[styles.memberRow, i < group.memberIds.length - 1 && styles.rowBorder]}
                      activeOpacity={canAction ? 0.7 : 1}
                    >
                      <Avatar name={displayName} size={38} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>
                          {displayName}{isMe ? <Text style={styles.youLabel}> · you</Text> : ''}
                        </Text>
                        <Text style={styles.memberRole}>
                          {isSuperAdmin ? 'Super Admin' : isAdmin ? 'Admin' : 'Member'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {isSuperAdmin && <Text style={{ fontSize: 14 }}>👑</Text>}
                        {!isSuperAdmin && isAdmin && (
                          <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>Admin</Text></View>
                        )}
                        {canAction && <Text style={{ color: Colors.textMuted, fontSize: 16 }}>›</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Add member */}
              <Text style={styles.sectionLabel}>ADD MEMBER</Text>
              <View style={[styles.card, { padding: 14 }]}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={newMember}
                    onChangeText={setNewMember}
                    onSubmitEditing={addMember}
                    placeholder="@handle or username"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.addInput}
                  />
                  <TouchableOpacity
                    onPress={addMember}
                    style={[styles.addBtn, !newMember.trim() && { backgroundColor: Colors.border }]}
                    disabled={!newMember.trim()}
                  >
                    <Text style={[styles.addBtnText, !newMember.trim() && { color: Colors.textMuted }]}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Context menu */}
              {memberMenu && (
                <Modal visible transparent animationType="fade" onRequestClose={() => setMemberMenu(null)}>
                  <TouchableOpacity style={styles.menuOverlay} onPress={() => setMemberMenu(null)} activeOpacity={1}>
                    <View style={styles.menuCard}>
                      <View style={styles.menuHeader}>
                        <Text style={styles.menuHeaderText} numberOfLines={1}>{getUser(memberMenu.userId).displayName}</Text>
                      </View>
                      <TouchableOpacity onPress={() => toggleAdmin(memberMenu.userId)} style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: Colors.border }]}>
                        <Text style={{ fontSize: 16 }}>{admins.includes(memberMenu.userId) ? '👤' : '⭐'}</Text>
                        <Text style={styles.menuItemText}>{admins.includes(memberMenu.userId) ? 'Remove admin' : 'Make admin'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeMember(memberMenu.userId)} style={styles.menuItem}>
                        <Text style={{ fontSize: 16 }}>🚫</Text>
                        <Text style={[styles.menuItemText, { color: Colors.notGoing }]}>Remove from group</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                </Modal>
              )}
            </>
          )}

          {tab === 'members' && !group.adminIds.includes(ME_ID) && (
            <View style={styles.card}>
              {group.memberIds.map((memberId, i) => {
                const isSuperAdmin = memberId === superAdminId;
                const isAdmin = admins.includes(memberId);
                const displayName = getUser(memberId).displayName;
                return (
                  <View key={i} style={[styles.memberRow, i < group.memberIds.length - 1 && styles.rowBorder]}>
                    <Avatar name={displayName} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{displayName}</Text>
                      <Text style={styles.memberRole}>{isSuperAdmin ? 'Super Admin' : isAdmin ? 'Admin' : 'Member'}</Text>
                    </View>
                    {isSuperAdmin && <Text style={{ fontSize: 14 }}>👑</Text>}
                  </View>
                );
              })}
            </View>
          )}

          {tab === 'members' && (
            <>
              <View style={{ height: 16 }} />
              <Text style={styles.sectionLabel}>LEAVE</Text>
              <View style={[styles.card, { borderColor: '#FECACA' }]}>
                <TouchableOpacity onPress={() => setShowLeave(true)} style={styles.memberRow} activeOpacity={0.8}>
                  <Text style={{ fontSize: 18 }}>🚪</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.leaveTitle}>Leave Group</Text>
                    <Text style={styles.leaveDesc}>You'll need an invite to rejoin</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Leave confirm */}
      {showLeave && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowLeave(false)}>
          <TouchableOpacity style={styles.menuOverlay} onPress={() => setShowLeave(false)} activeOpacity={1}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Leave {group.name}?</Text>
              <Text style={styles.confirmBody}>
                {superAdminId === ME_ID
                  ? admins.filter(a => a !== ME_ID).length > 0
                    ? "You're the Super Admin. The next admin will take over."
                    : "You're the only admin. Leaving will dissolve this group."
                  : "You'll need an invite to rejoin."
                }
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setShowLeave(false)} style={[styles.confirmBtn, { borderColor: Colors.border, backgroundColor: Colors.surface }]}>
                  <Text style={{ fontFamily: Fonts.semiBold, color: Colors.text }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowLeave(false); leaveGroup(); }} style={[styles.confirmBtn, { backgroundColor: Colors.notGoing, borderColor: Colors.notGoing }]}>
                  <Text style={{ fontFamily: Fonts.bold, color: '#fff' }}>Leave</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Color picker */}
      {showColorPicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowColorPicker(false)}>
          <TouchableOpacity style={styles.menuOverlay} onPress={() => setShowColorPicker(false)} activeOpacity={1}>
            <TouchableOpacity style={styles.colorPickerCard} activeOpacity={1} onPress={() => {}}>
              <Text style={styles.colorPickerTitle}>Choose your color for</Text>
              <Text style={styles.colorPickerGroupName}>{group.name}</Text>
              <ColorPicker
                style={{ width: '100%' }}
                value={draftHex || userColorHex}
                onComplete={({ hex }) => {
                  setDraftHex(hex);
                }}
              >
                <Panel1 />
                <HueSlider />
                <OpacitySlider />
              </ColorPicker>
              <Text style={styles.hexReadout}>
                {(draftHex || userColorHex).toUpperCase()}
              </Text>
              <TouchableOpacity
                style={[
                  styles.colorApplyBtn,
                  { backgroundColor: Colors.accent, marginTop: 16, opacity: draftHex ? 1 : 0.6 },
                ]}
                onPress={() => {
                  if (draftHex) {
                    selectColor(draftHex);
                  }
                }}
                activeOpacity={0.8}
                disabled={!draftHex}
              >
                <Text style={styles.colorApplyBtnText}>Save color</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: Colors.bg },
  settingsBtn:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.md, backgroundColor: Colors.accent },
  settingsBtnText:  { fontSize: 14, color: Colors.accentFg, fontFamily: Fonts.semiBold },
  headerBlock:      { backgroundColor: Colors.surface, padding: 20, borderBottomWidth: 1 },
  groupThumb:       { width: 56, height: 56, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  groupName:        { fontSize: 19, fontFamily: Fonts.extraBold, color: Colors.text },
  groupDesc:        { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular, lineHeight: 18 },
  groupCreator:     { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular, marginTop: 4 },
  memberCount:      { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular },
  inviteBtn:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  inviteBtnText:    { fontSize: 13, fontFamily: Fonts.medium, color: Colors.text },
  createBtn:        { paddingHorizontal: 16, paddingVertical: 7, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  createBtnText:    { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  tabs:             { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab:              { flex: 1, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:        { borderBottomColor: Colors.text },
  tabText:          { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted },
  tabTextActive:    { fontFamily: Fonts.bold, color: Colors.text },
  tabDot:           { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EF4444', marginTop: 1 },
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
  addInput:         { flex: 1, padding: 9, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  addBtn:           { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  addBtnText:       { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
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
  colorBtn:         { padding: 4, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  colorDot:         { width: 16, height: 16, borderRadius: 8 },
  colorPickerCard:  { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, width: '100%', maxWidth: 320, ...Shadows.lg },
  colorPickerTitle: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textSub, marginBottom: 4 },
  colorPickerGroupName: { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text, marginBottom: 8 },
  colorPickerDesc:  { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular, lineHeight: 18, marginBottom: 12 },
  colorPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  colorOptionLarge: { width: 48, height: 48, borderRadius: 24 },
  colorHexInput:    { flex: 1, padding: 10, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  colorPickerHueLabel: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted, marginBottom: 8 },
  colorGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 16 },
  colorOption:      { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorOptionSelected: { borderColor: Colors.text, transform: [{ scale: 1.1 }] },
  colorApplyBtn:    { paddingVertical: 12, borderRadius: Radius.lg, alignItems: 'center' },
  colorApplyBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: '#fff' },
  hexReadout:       { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text, textAlign: 'center', marginTop: 12 },
});
