import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Layout, Radius } from '../../constants/theme';
import { useUpdateUser } from '../../hooks/api';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { UserAvatar } from '../../components/UserAvatar';
import { AvatarPickerModal } from '../../components/AvatarPickerModal';
import { Toggle } from '../../components/ui';
import { deleteManagedUploadFireAndForget } from '../../services/managedUploadDelete';

const REMINDER_OPTIONS = ['Never', '1 hour before', '1 day before', '1 week before'] as const;

export default function ProfileScreen() {
  const { user: firebaseUser, signOut } = useAuth();
  const { userId, user } = useCurrentUserContext();
  const updateUser = useUpdateUser(userId || '');

  const [draftDisplayName, setDraftDisplayName] = useState('');
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [draftAvatarSeed, setDraftAvatarSeed] = useState('');
  const [draftThumbnail, setDraftThumbnail] = useState<string | null>(null);
  const thumbnailAtPickerOpenRef = useRef<string | null>(null);

  useEffect(() => {
    if (showAvatarPicker) {
      setDraftAvatarSeed(user?.avatarSeed ?? '');
      setDraftThumbnail(user?.thumbnail ?? null);
    }
  }, [showAvatarPicker, user?.avatarSeed, user?.thumbnail]);

  const dismissAvatarPicker = useCallback(() => {
    setShowAvatarPicker(false);
    setDraftAvatarSeed(user?.avatarSeed ?? '');
    setDraftThumbnail(user?.thumbnail ?? null);
  }, [user?.avatarSeed, user?.thumbnail]);

  const handleSignOut = async () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to sign out?');

      if (confirmed) {
        try {
          await signOut();
        } catch {
          window.alert('Failed to sign out');
        }
      }
    } else {
      Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign Out',
            style: 'destructive',
            onPress: async () => {
              try {
                await signOut();
              } catch {
                Alert.alert('Error', 'Failed to sign out');
              }
            },
          },
        ]
      );
    }
  };

  if (!user) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <View />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* User card */}
        <View style={styles.userCard}>
          <TouchableOpacity
            onPress={() => {
              thumbnailAtPickerOpenRef.current = user.thumbnail ?? null;
              setShowAvatarPicker(true);
            }}
            style={styles.bigAvatar}
            activeOpacity={0.8}
          >
            <UserAvatar seed={user.displayName || user.name} thumbnail={user.thumbnail} backgroundColor={[user.avatarSeed]} size={60} style={styles.bigAvatarImg} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={styles.displayNameRow}>
              <View style={styles.displayNameEditRow}>
                {editingDisplayName ? (
                  <TextInput
                    value={draftDisplayName}
                    onChangeText={setDraftDisplayName}
                    placeholder="Display name"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.displayNameInput}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoFocus
                  />
                ) : (
                  <View style={styles.displayNameReadRow}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {user.displayName || user.name}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  onPress={async () => {
                    if (!editingDisplayName) {
                      setEditingDisplayName(true);
                      return;
                    }

                    const next = draftDisplayName.trim();
                    if (!next || !userId) return;
                    try {
                      await updateUser.mutateAsync({ displayName: next });
                      setEditingDisplayName(false);
                    } catch {
                      if (Platform.OS === 'web') window.alert('Failed to update display name');
                      else Alert.alert('Error', 'Failed to update display name');
                    }
                  }}
                  disabled={editingDisplayName ? (!draftDisplayName.trim() || updateUser.isPending) : false}
                  style={[
                    styles.displayNameActionBtn,
                    editingDisplayName ? styles.displayNameActionBtnSave : styles.displayNameActionBtnChange,
                    (editingDisplayName && (!draftDisplayName.trim() || updateUser.isPending)) && { opacity: 0.6 },
                  ]}
                  activeOpacity={0.7}
                >
                  {updateUser.isPending ? (
                    <ActivityIndicator size="small" color={Colors.accentFg} />
                  ) : (
                    <Text style={styles.displayNameActionText}>
                      {editingDisplayName ? 'Save' : 'Change display name'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>NOTIFICATIONS (ALL GROUPS)</Text>
        <Text style={styles.sectionHint}>
          Notifications are sent only when the same category is enabled here and in that group&apos;s settings.
        </Text>
        <View style={[styles.card, { marginBottom: 20 }]}>
          <View style={styles.notifSection}>
            {user.notifPrefs ? (
              <>
                <Toggle
                  value={user.notifPrefs.newEvent}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { newEvent: v } })}
                  label="New event alerts"
                />
                <Toggle
                  value={user.notifPrefs.minAttendees}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { minAttendees: v } })}
                  label="Event min attendees / waitlist"
                />
                <Toggle
                  value={user.notifPrefs.onLocation}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { onLocation: v } })}
                  label="Event location changes"
                />
                <Toggle
                  value={user.notifPrefs.onTime}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { onTime: v } })}
                  label="Event time changes"
                />
                <Toggle
                  value={user.notifPrefs.onRsvp}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { onRsvp: v } })}
                  label="Event RSVP updates"
                />
                <Toggle
                  value={user.notifPrefs.comments}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { comments: v } })}
                  label="Event comments"
                />
                <Toggle
                  value={user.notifPrefs.mentions}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { mentions: v } })}
                  label="Event comment mentions"
                />
                <Toggle
                  value={user.notifPrefs.groupMembership}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { groupMembership: v } })}
                  label="Group membership updates (e.g. approvals)"
                />
                <View style={styles.reminderRow}>
                  <Text style={styles.reminderLabel}>Event reminder</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {REMINDER_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        onPress={() => void updateUser.mutateAsync({ notifPrefs: { eventReminder: opt } })}
                        style={[
                          styles.reminderChip,
                          user.notifPrefs?.eventReminder === opt && styles.reminderChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.reminderChipText,
                            user.notifPrefs?.eventReminder === opt && styles.reminderChipTextActive,
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </>
            ) : (
              <View style={[styles.notifSection, { alignItems: 'center', paddingVertical: 24 }]}>
                <ActivityIndicator color={Colors.accent} />
              </View>
            )}
          </View>
        </View>

        {/* Account */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={[styles.card, { marginBottom: 20 }]}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabelMuted}>Email</Text>
            <Text style={styles.infoValueMuted}>{firebaseUser?.email || '—'}</Text>
          </View>
          <View style={[styles.infoRow, styles.rowBorder]}>
            <Text style={styles.infoLabelMuted}>User ID</Text>
            <Text style={styles.infoValueMuted}>{userId || '—'}</Text>
          </View>
          <View style={[styles.infoRow, styles.rowBorder]}>
            <Text style={styles.infoLabelMuted}>Sign-in Provider</Text>
            <Text style={styles.infoValueMuted}>Google</Text>
          </View>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <AvatarPickerModal
        variant="user"
        visible={showAvatarPicker}
        onRequestClose={dismissAvatarPicker}
        onAfterSave={() => setShowAvatarPicker(false)}
        seed={draftAvatarSeed}
        onSeedChange={setDraftAvatarSeed}
        thumbnail={draftThumbnail}
        onThumbnailChange={setDraftThumbnail}
        userId={userId ?? ''}
        userName={user.displayName || user.name}
        onSave={async (seed, thumbnail) => {
          try {
            await updateUser.mutateAsync({
              avatarSeed: seed.trim() === 'auto' || seed.trim() === '' ? null : seed.trim(),
              thumbnail: thumbnail ?? null,
            });
            const prior = thumbnailAtPickerOpenRef.current?.trim() ?? '';
            const saved = (thumbnail ?? '').trim();
            if (prior && /^https?:\/\//i.test(prior) && prior !== saved && userId) {
              deleteManagedUploadFireAndForget(userId, prior);
            }
          } catch (e) {
            if (Platform.OS === 'web') window.alert('Failed to update avatar');
            else Alert.alert('Error', 'Failed to update avatar');
            throw e;
          }
        }}
        isSaving={updateUser.isPending}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: Colors.bg },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: Layout.tabHeaderMinHeight, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title:            { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text },
  userCard:         { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 20, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  bigAvatar:        { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  bigAvatarImg:     { width: 60, height: 60, borderRadius: 30 },
  bigAvatarText:    { fontSize: 24, fontFamily: Fonts.bold, color: '#fff' },
  userName:         { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text, marginBottom: 2 },
  userHandle:       { fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 8 },
  sectionLabel:     { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  sectionHint:      { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: -6, marginBottom: 10, lineHeight: 17 },
  card:             { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  notifSection:     { padding: 16 },
  reminderRow:      { paddingVertical: 10, marginTop: 8 },
  reminderLabel:    { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, marginBottom: 8 },
  reminderChip:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  reminderChipActive:{ borderColor: Colors.accent, backgroundColor: Colors.accent },
  reminderChipText: { fontSize: 12, color: Colors.textSub, fontFamily: Fonts.regular },
  reminderChipTextActive:{ color: Colors.accentFg, fontFamily: Fonts.semiBold },
  rowBorder:        { borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  infoLabel:        { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted },
  infoValue:        { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
  infoLabelMuted:   { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted, opacity: 0.65 },
  infoValueMuted:   { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textMuted, opacity: 0.65 },
  displayNameRow:   { height: 34, justifyContent: 'center', marginBottom: 2 },
  displayNameEditRow:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  displayNameReadRow:{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  displayNameInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: 'transparent',
    fontSize: 18,
    lineHeight: 22,
    color: Colors.text,
    fontFamily: Fonts.extraBold,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : null),
  },
  displayNameActionBtn:{
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  displayNameActionBtnChange:{ minWidth: 160 },
  displayNameActionBtnSave:{ paddingHorizontal: 10, minWidth: undefined },
  displayNameActionText:{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSub },
  signOutBtn:       { marginTop: 20, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', alignItems: 'center' },
  signOutText:      { fontSize: 14, color: '#DC2626', fontFamily: Fonts.semiBold },
});
