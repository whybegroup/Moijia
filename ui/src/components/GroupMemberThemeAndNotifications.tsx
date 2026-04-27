import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName } from '../utils/helpers';
import { Toggle } from './ui';
import type { Partial_NotifPrefs_ } from '@moijia/client';
import {
  useGroupMemberColor,
  useUpdateGroupMemberColor,
  useGroupMemberNotifPrefs,
  useUpdateGroupMemberNotifPrefs,
} from '../hooks/api';
import ColorPicker, { Panel1, HueSlider, OpacitySlider } from 'reanimated-color-picker';

const REMINDER_OPTIONS = ['Never', '1 hour before', '1 day before', '1 week before'] as const;

const rowPad = { paddingHorizontal: 16 } as const;

type Props = {
  groupId: string;
  userId: string;
  groupName: string;
};

export function GroupMemberThemeAndNotifications({ groupId, userId, groupName }: Props) {
  const { data: memberColorData } = useGroupMemberColor(groupId, userId);
  const updateMemberColor = useUpdateGroupMemberColor(groupId, userId);
  const { data: notifPrefs, isPending: notifPrefsLoading } = useGroupMemberNotifPrefs(groupId, userId);
  const updateMemberNotifPrefs = useUpdateGroupMemberNotifPrefs(groupId, userId);

  const userColorHex = memberColorData?.colorHex || getDefaultGroupThemeFromName(groupName);
  const p = getGroupColor(userColorHex);

  const [themeExpanded, setThemeExpanded] = useState(false);

  const patchNotif = async (patch: Partial_NotifPrefs_) => {
    try {
      await updateMemberNotifPrefs.mutateAsync(patch);
    } catch {
      /* unchanged */
    }
  };

  return (
    <>
      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>GROUP THEME COLOR</Text>
      <Text style={styles.sectionHint}>Personal color to use when displaying events and stuff from this group</Text>
      <View style={[styles.card, { marginBottom: 16 }]}>
        <TouchableOpacity
          style={styles.themeHeader}
          onPress={() => setThemeExpanded((e) => !e)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: themeExpanded }}
          accessibilityLabel={themeExpanded ? 'Collapse theme color picker' : 'Expand theme color picker'}
        >
          <View style={[styles.colorDot, { backgroundColor: p.dot }]} />
          <Text style={styles.hexInline}>{userColorHex.toUpperCase()}</Text>
          <Ionicons name={themeExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={Colors.textMuted} />
        </TouchableOpacity>
        {themeExpanded ? (
          <View style={styles.colorPickerWrap}>
            <ColorPicker style={{ width: '100%' }} value={userColorHex} onCompleteJS={({ hex }) => void updateMemberColor.mutateAsync(hex)}>
              <Panel1 />
              <HueSlider />
              <OpacitySlider />
            </ColorPicker>
            <Text style={styles.hexReadout}>{userColorHex.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionLabel}>GROUP NOTIFICATIONS</Text>
      <Text style={styles.sectionHint}>These notification settings only apply to this group. To change notification settings for all groups, go to your Profile → Notifications</Text>
      <View style={[styles.card, { marginBottom: 20 }]}>
        <View style={styles.notifSection}>
          {notifPrefsLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <ActivityIndicator color={Colors.accent} />
            </View>
          ) : notifPrefs ? (
            <>
              <Toggle
                value={notifPrefs.newEvent}
                onChange={(v) => void patchNotif({ newEvent: v })}
                label="New event alerts"
                style={rowPad}
              />
              <Toggle
                value={notifPrefs.minAttendees}
                onChange={(v) => void patchNotif({ minAttendees: v })}
                label="Event min attendees / waitlist"
                style={rowPad}
              />
              <Toggle
                value={notifPrefs.onLocation}
                onChange={(v) => void patchNotif({ onLocation: v })}
                label="Event location changes"
                style={rowPad}
              />
              <Toggle
                value={notifPrefs.onTime}
                onChange={(v) => void patchNotif({ onTime: v })}
                label="Event time changes"
                style={rowPad}
              />
              <Toggle
                value={notifPrefs.onRsvp}
                onChange={(v) => void patchNotif({ onRsvp: v })}
                label="Event RSVP updates"
                style={rowPad}
              />
              <Toggle
                value={notifPrefs.comments}
                onChange={(v) => void patchNotif({ comments: v })}
                label="Event comments"
                style={rowPad}
              />
              <Toggle
                value={notifPrefs.mentions}
                onChange={(v) => void patchNotif({ mentions: v })}
                label="Event comment mentions"
                style={rowPad}
              />
              <Toggle
                value={notifPrefs.groupMembership}
                onChange={(v) => void patchNotif({ groupMembership: v })}
                label="Group membership updates (e.g. approvals)"
                style={{ ...rowPad, borderBottomWidth: 0 }}
              />

              <View style={styles.reminderRow}>
                <Text style={styles.reminderLabel}>Event reminder</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {REMINDER_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => void patchNotif({ eventReminder: opt })}
                      style={[
                        styles.reminderChip,
                        notifPrefs.eventReminder === opt && styles.reminderChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.reminderChipText,
                          notifPrefs.eventReminder === opt && styles.reminderChipTextActive,
                        ]}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  sectionLabelSpaced: { marginTop: 8 },
  sectionHint: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    marginTop: -4,
    marginBottom: 10,
    lineHeight: 17,
  },
  card: { backgroundColor: Colors.surface, borderRadius: Radius['2xl'], overflow: 'hidden' },
  themeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  colorDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  hexInline: { flex: 1, minWidth: 0, fontSize: 15, fontFamily: Fonts.medium, color: Colors.text },
  colorPickerWrap: { paddingHorizontal: 16, paddingBottom: 16 },
  hexReadout: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text, textAlign: 'center', marginTop: 12 },
  notifSection: { paddingHorizontal: 0 },
  reminderRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  reminderLabel: { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, marginBottom: 8 },
  reminderChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  reminderChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  reminderChipText: { fontSize: 12, color: Colors.textSub, fontFamily: Fonts.regular },
  reminderChipTextActive: { color: Colors.accentFg, fontFamily: Fonts.semiBold },
});
