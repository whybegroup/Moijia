import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform, TextInput, ActivityIndicator } from 'react-native';
import { KeyboardSafeScrollView } from '../../components/KeyboardSafeScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Layout, Radius } from '../../constants/theme';
import { useUpdateUser, useUser } from '../../hooks/api';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { UserAvatar } from '../../components/UserAvatar';
import { SubscriptionSettingsCard } from '../../components/SubscriptionSettingsCard';
import { AvatarPickerModal } from '../../components/AvatarPickerModal';
import { Toggle } from '../../components/ui';
import { deleteManagedUploadFireAndForget } from '../../services/managedUploadDelete';
import {
  changePassword,
  hasPasswordProvider,
  oauthPasswordHint,
  signInProviderLabels,
} from '../../config/firebase';

function alertMessage(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert(title, message);
}

function passwordChangeErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Current password is incorrect.';
    case 'auth/weak-password':
      return 'New password should be at least 6 characters.';
    case 'auth/requires-recent-login':
      return 'Please sign out and sign in again, then retry.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/missing-email':
      return 'No email is associated with this account.';
    default:
      return 'Failed to update password';
  }
}

type InputEl = { value?: string; setSelectionRange?: (s: number, e: number) => void };

function restorePasswordInput(input: TextInput | null, eventTarget: unknown, text: string) {
  const target = eventTarget as InputEl | undefined;
  if (target && typeof target.value === 'string') {
    target.value = text;
    try {
      target.setSelectionRange?.(text.length, text.length);
    } catch {
      // setSelectionRange throws on some input types
    }
    return;
  }
  input?.setNativeProps({ text });
}

/**
 * Password inputs (type=password) are cleared by the browser/OS on blur.
 * React still shows the old value, then the first keystroke replaces it.
 */
function SettingsPasswordInput({
  value,
  onChangeText,
  placeholder,
  editable,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  editable: boolean;
  style: TextInput['props']['style'];
}) {
  const inputRef = useRef<TextInput>(null);
  const focusedRef = useRef(false);
  const keptRef = useRef(value);
  keptRef.current = value;

  const restore = (eventTarget?: unknown) => {
    restorePasswordInput(inputRef.current, eventTarget, keptRef.current);
  };

  return (
    <TextInput
      ref={inputRef}
      value={value}
      placeholder={placeholder}
      placeholderTextColor={Colors.textMuted}
      style={[
        style,
        Platform.OS === 'web' ? ({ WebkitTextSecurity: 'disc' } as object) : null,
      ]}
      // type=password is what clears on blur/refocus; mask with CSS on web instead
      secureTextEntry={Platform.OS !== 'web'}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      textContentType="none"
      importantForAutofill="no"
      editable={editable}
      onFocus={(e) => {
        focusedRef.current = true;
        restore(e.target);
        requestAnimationFrame(() => restore(e.target));
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        restore(e.target);
      }}
      onChangeText={(next) => {
        if (next === '' && !focusedRef.current) return;
        const kept = keptRef.current;
        // Native value was empty after blur; first key is only the new character.
        if (
          focusedRef.current &&
          kept.length > 0 &&
          next.length > 0 &&
          next.length < kept.length &&
          !kept.startsWith(next) &&
          !next.startsWith(kept)
        ) {
          next = kept + next;
          restore();
        }
        keptRef.current = next;
        onChangeText(next);
      }}
    />
  );
}

const REMINDER_OPTIONS = ['Never', '1 hour before', '1 day before', '1 week before'] as const;

export default function ProfileScreen() {
  const { user: firebaseUser, signOut } = useAuth();
  const { userId, user, loading } = useCurrentUserContext();
  const { refetch: refetchUser } = useUser(userId || '');
  const { refreshControl } = usePullToRefresh(refetchUser);
  const updateUser = useUpdateUser(userId || '');

  const [draftDisplayName, setDraftDisplayName] = useState('');
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [draftAvatarSeed, setDraftAvatarSeed] = useState('');
  const [draftThumbnail, setDraftThumbnail] = useState<string | null>(null);
  const thumbnailAtPickerOpenRef = useRef<string | null>(null);
  const canChangePassword = hasPasswordProvider(firebaseUser);
  const passwordManagedHint = oauthPasswordHint(firebaseUser);

  const resetPasswordForm = () => {
    setEditingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError('');
  };

  const startEditingDisplayName = () => {
    resetPasswordForm();
    setDraftDisplayName(user?.displayName || user?.name || '');
    setEditingDisplayName(true);
  };

  const cancelEditingDisplayName = () => {
    setEditingDisplayName(false);
    setDraftDisplayName('');
  };

  const saveDisplayName = async () => {
    const next = draftDisplayName.trim();
    if (!next || !userId) return;
    try {
      await updateUser.mutateAsync({ displayName: next });
      setEditingDisplayName(false);
    } catch {
      alertMessage('Error', 'Failed to update display name');
    }
  };

  const savePassword = async () => {
    if (passwordSaving) return;
    if (!currentPassword || !newPassword) {
      setPasswordError('Please enter your current and new password.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from your current password.');
      return;
    }
    setPasswordError('');
    setPasswordSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      resetPasswordForm();
      alertMessage('Password updated', 'Your password has been changed.');
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : undefined;
      setPasswordError(passwordChangeErrorMessage(code));
    } finally {
      setPasswordSaving(false);
    }
  };

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

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.emptyState}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={styles.emptyStateText}>Loading your profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Profile data unavailable</Text>
          <Text style={styles.emptyStateText}>
            {firebaseUser
              ? 'Signed in, but your profile record is not ready yet. Please refresh or sign out and sign in again.'
              : 'Please sign in again.'}
          </Text>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <UserAvatar
              seed={user.displayName || user.name}
              thumbnail={user.thumbnail}
              backgroundColor={[user.avatarSeed]}
              size={28}
            />
            <Text style={styles.title}>Profile</Text>
          </View>
        </View>

      <KeyboardSafeScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={refreshControl}
      >
        <Text style={styles.sectionLabel}>ACCOUNT SETTINGS</Text>
        <View style={[styles.card, { marginBottom: 20 }]}>
          <View style={styles.infoRow}>
            <View style={styles.settingsRowText}>
              <Text style={styles.infoLabelMuted}>Avatar</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                thumbnailAtPickerOpenRef.current = user.thumbnail ?? null;
                setShowAvatarPicker(true);
              }}
              style={styles.displayNameActionBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.displayNameActionText}>Change avatar</Text>
            </TouchableOpacity>
          </View>

          {editingDisplayName ? (
            <View style={[styles.settingsEditBlock, styles.rowBorder]}>
              <Text style={styles.infoLabelMuted}>Display name</Text>
              <TextInput
                value={draftDisplayName}
                onChangeText={setDraftDisplayName}
                placeholder="Display name"
                placeholderTextColor={Colors.textMuted}
                style={styles.settingsInput}
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
              />
              <View style={styles.settingsActions}>
                <TouchableOpacity
                  onPress={cancelEditingDisplayName}
                  disabled={updateUser.isPending}
                  style={styles.displayNameActionBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.displayNameActionText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void saveDisplayName()}
                  disabled={!draftDisplayName.trim() || updateUser.isPending}
                  style={[
                    styles.displayNameActionBtn,
                    styles.displayNameActionBtnSave,
                    (!draftDisplayName.trim() || updateUser.isPending) && { opacity: 0.6 },
                  ]}
                  activeOpacity={0.7}
                >
                  {updateUser.isPending ? (
                    <ActivityIndicator size="small" color={Colors.textSub} />
                  ) : (
                    <Text style={styles.displayNameActionText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[styles.infoRow, styles.rowBorder]}>
              <View style={styles.settingsRowText}>
                <Text style={styles.infoLabelMuted}>Display name</Text>
                <Text style={styles.infoValue} numberOfLines={1}>
                  {user.displayName || user.name}
                </Text>
              </View>
              <TouchableOpacity
                onPress={startEditingDisplayName}
                style={styles.displayNameActionBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.displayNameActionText}>Change display name</Text>
              </TouchableOpacity>
            </View>
          )}

          {canChangePassword ? (
            editingPassword ? (
              <View style={[styles.settingsEditBlock, styles.rowBorder]}>
                <Text style={styles.infoLabelMuted}>Password</Text>
                <SettingsPasswordInput
                  value={currentPassword}
                  onChangeText={(v) => {
                    setCurrentPassword(v);
                    if (passwordError) setPasswordError('');
                  }}
                  placeholder="Current password"
                  style={styles.settingsInput}
                  editable={!passwordSaving}
                />
                <SettingsPasswordInput
                  value={newPassword}
                  onChangeText={(v) => {
                    setNewPassword(v);
                    if (passwordError) setPasswordError('');
                  }}
                  placeholder="New password"
                  style={styles.settingsInput}
                  editable={!passwordSaving}
                />
                <SettingsPasswordInput
                  value={confirmNewPassword}
                  onChangeText={(v) => {
                    setConfirmNewPassword(v);
                    if (passwordError) setPasswordError('');
                  }}
                  placeholder="Confirm new password"
                  style={styles.settingsInput}
                  editable={!passwordSaving}
                />
                {passwordError ? <Text style={styles.settingsError}>{passwordError}</Text> : null}
                <View style={styles.settingsActions}>
                  <TouchableOpacity
                    onPress={resetPasswordForm}
                    disabled={passwordSaving}
                    style={styles.displayNameActionBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.displayNameActionText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void savePassword()}
                    disabled={passwordSaving || !currentPassword || !newPassword || !confirmNewPassword}
                    style={[
                      styles.displayNameActionBtn,
                      styles.displayNameActionBtnSave,
                      (passwordSaving || !currentPassword || !newPassword || !confirmNewPassword) && { opacity: 0.6 },
                    ]}
                    activeOpacity={0.7}
                  >
                    {passwordSaving ? (
                      <ActivityIndicator size="small" color={Colors.textSub} />
                    ) : (
                      <Text style={styles.displayNameActionText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={[styles.infoRow, styles.rowBorder]}>
                <View style={styles.settingsRowText}>
                  <Text style={styles.infoLabelMuted}>Password</Text>
                  <Text style={styles.infoValueMuted}>••••••••</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    cancelEditingDisplayName();
                    setPasswordError('');
                    setEditingPassword(true);
                  }}
                  style={styles.displayNameActionBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.displayNameActionText}>Change password</Text>
                </TouchableOpacity>
              </View>
            )
          ) : passwordManagedHint ? (
            <View style={[styles.settingsHintBlock, styles.rowBorder]}>
              <Text style={styles.infoLabelMuted}>Password</Text>
              <Text style={styles.settingsHint}>{passwordManagedHint}</Text>
            </View>
          ) : null}

          <View style={[styles.infoRow, styles.rowBorder]}>
            <Text style={styles.infoLabelMuted}>Email</Text>
            <Text style={styles.infoValueMuted} numberOfLines={1}>{firebaseUser?.email || '—'}</Text>
          </View>
          <View style={[styles.infoRow, styles.rowBorder]}>
            <Text style={styles.infoLabelMuted}>User ID</Text>
            <Text style={styles.infoValueMuted} numberOfLines={1}>{userId || '—'}</Text>
          </View>
          <View style={[styles.infoRow, styles.rowBorder]}>
            <Text style={styles.infoLabelMuted}>Sign-in</Text>
            <Text style={styles.infoValueMuted}>{signInProviderLabels(firebaseUser)}</Text>
          </View>
        </View>

        <SubscriptionSettingsCard />

        {user.notifPrefs ? (
          <>
            <Text style={styles.sectionLabel}>GROUP NOTIFICATIONS</Text>
            <View style={[styles.card, styles.notifCard]}>
              <View style={styles.notifSection}>
                <Toggle
                  value={user.notifPrefs.groupAnnouncement}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { groupAnnouncement: v } })}
                  label="Announcements"
                />
                <Toggle
                  value={user.notifPrefs.groupMembership}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { groupMembership: v } })}
                  label="Membership updates (e.g. approvals)"
                  style={{ borderBottomWidth: 0 }}
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>EVENT NOTIFICATIONS</Text>
            <View style={[styles.card, styles.notifCard]}>
              <View style={styles.notifSection}>
                <Toggle
                  value={user.notifPrefs.newEvent}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { newEvent: v } })}
                  label="New event alerts"
                />
                <Toggle
                  value={user.notifPrefs.minAttendees}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { minAttendees: v } })}
                  label="Min attendees / waitlist"
                />
                <Toggle
                  value={user.notifPrefs.onLocation}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { onLocation: v } })}
                  label="Location changes"
                />
                <Toggle
                  value={user.notifPrefs.onTime}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { onTime: v } })}
                  label="Time changes"
                />
                <Toggle
                  value={user.notifPrefs.onRsvp}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { onRsvp: v } })}
                  label="RSVP updates"
                />
                <Toggle
                  value={user.notifPrefs.comments}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { comments: v } })}
                  label="Comments"
                />
                <Toggle
                  value={user.notifPrefs.mentions}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { mentions: v } })}
                  label="Comment mentions"
                />
                <View style={styles.reminderRow}>
                  <Text style={styles.reminderLabel}>Reminder</Text>
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
              </View>
            </View>

            <Text style={styles.sectionLabel}>POLL NOTIFICATIONS</Text>
            <View style={[styles.card, styles.notifCard]}>
              <View style={styles.notifSection}>
                <Toggle
                  value={user.notifPrefs.newPoll}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { newPoll: v } })}
                  label="New poll alerts"
                />
                <Toggle
                  value={user.notifPrefs.onPollEdit}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { onPollEdit: v } })}
                  label="Edits"
                />
                <Toggle
                  value={user.notifPrefs.onPollResponse}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { onPollResponse: v } })}
                  label="Responses"
                />
                <Toggle
                  value={user.notifPrefs.onPollSuggestion}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { onPollSuggestion: v } })}
                  label="Option suggestions"
                  style={{ borderBottomWidth: 0 }}
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>POST NOTIFICATIONS</Text>
            <View style={[styles.card, styles.notifCard]}>
              <View style={styles.notifSection}>
                <Toggle
                  value={user.notifPrefs.postComments}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { postComments: v } })}
                  label="Comments on your posts"
                />
                <Toggle
                  value={user.notifPrefs.postReactions}
                  onChange={(v) => void updateUser.mutateAsync({ notifPrefs: { postReactions: v } })}
                  label="Reactions on your posts"
                  style={{ borderBottomWidth: 0 }}
                />
              </View>
            </View>
          </>
        ) : (
          <View style={[styles.card, styles.notifCard]}>
            <View style={[styles.notifSection, { alignItems: 'center', paddingVertical: 24 }]}>
              <ActivityIndicator color={Colors.accent} />
            </View>
          </View>
        )}

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </KeyboardSafeScrollView>

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
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: Layout.tabHeaderMinHeight, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  title:            { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text },
  sectionLabel:     { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  sectionHint:      { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: -6, marginBottom: 10, lineHeight: 17 },
  card:             { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  notifCard:        { marginBottom: 16 },
  notifSection:     { paddingVertical: 4, paddingHorizontal: 12 },
  reminderRow:      { paddingVertical: 10, marginTop: 4 },
  reminderLabel:    { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, marginBottom: 8 },
  reminderChip:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  reminderChipActive:{ borderColor: Colors.accent, backgroundColor: Colors.accent },
  reminderChipText: { fontSize: 12, color: Colors.textSub, fontFamily: Fonts.regular },
  reminderChipTextActive:{ color: Colors.accentFg, fontFamily: Fonts.semiBold },
  rowBorder:        { borderTopWidth: 1, borderTopColor: Colors.border },
  infoRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, gap: 12 },
  infoLabel:        { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted },
  infoValue:        { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
  infoLabelMuted:   { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted, opacity: 0.65 },
  infoValueMuted:   { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textMuted, opacity: 0.65 },
  settingsRowText:  { flex: 1, minWidth: 0, gap: 2 },
  settingsEditBlock:{ padding: 14, gap: 10 },
  settingsHintBlock:{ padding: 14, gap: 4 },
  settingsHint:     { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textMuted, lineHeight: 18 },
  settingsError:    { fontSize: 13, fontFamily: Fonts.regular, color: Colors.notGoing },
  settingsActions:  { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  settingsInput:    {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    fontSize: 15,
    color: Colors.text,
    fontFamily: Fonts.regular,
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
    flexShrink: 0,
  },
  displayNameActionBtnSave:{ paddingHorizontal: 14 },
  displayNameActionText:{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSub },
  emptyState:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 10 },
  emptyStateTitle:   { fontSize: 18, color: Colors.text, fontFamily: Fonts.extraBold, textAlign: 'center' },
  emptyStateText:    { fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.regular, textAlign: 'center', lineHeight: 20 },
  signOutBtn:       { marginTop: 20, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', alignItems: 'center' },
  signOutText:      { fontSize: 14, color: '#DC2626', fontFamily: Fonts.semiBold },
});
